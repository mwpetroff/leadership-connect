import * as msal from "@azure/msal-node";
import { DbMsalCachePlugin } from "./msal-cache";
import session from "express-session";
import pgSession from "connect-pg-simple";
import pg from "pg";
import type { Request, Response, NextFunction } from "express";

// ── Session shape ─────────────────────────────────────────────────────────────

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  azureOid: string;
  role: "admin" | "hrbp" | "leader" | "staff";
}

declare module "express-session" {
  interface SessionData {
    user?: SessionUser;
    authState?: string;
    /** MSAL local account ID — used by graph.ts for silent token acquisition */
    msalAccountId?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

// ── Environment ───────────────────────────────────────────────────────────────

const {
  AZURE_AD_TENANT_ID,
  AZURE_AD_CLIENT_ID,
  AZURE_AD_CLIENT_SECRET,
  AZURE_AD_REDIRECT_URI,
  SESSION_SECRET,
  NODE_ENV,
  DATABASE_URL,
} = process.env;

const isProduction = NODE_ENV === "production";

export const azureEnabled = !!(
  AZURE_AD_TENANT_ID &&
  AZURE_AD_CLIENT_ID &&
  AZURE_AD_CLIENT_SECRET &&
  AZURE_AD_REDIRECT_URI
);

// The dev-admin bypass is ONLY permitted in non-production environments.
// In production, missing Azure credentials cause an immediate startup failure.
export const devBypassEnabled = !isProduction && !azureEnabled;

// ── Production startup guards — fail closed ───────────────────────────────────

if (isProduction) {
  if (!azureEnabled) {
    throw new Error(
      "[auth] AZURE_AD_TENANT_ID, AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET, and " +
        "AZURE_AD_REDIRECT_URI must all be set in production. " +
        "Missing or incomplete Azure credentials cause an immediate startup failure " +
        "to prevent silent unauthenticated access.",
    );
  }
  if (!SESSION_SECRET) {
    throw new Error(
      "[auth] SESSION_SECRET must be set in production. " +
        "Generate a random secret with: openssl rand -base64 32",
    );
  }
  if (!DATABASE_URL) {
    throw new Error(
      "[auth] DATABASE_URL must be set in production. " +
        "Sessions are stored in PostgreSQL; without it all sessions are in-memory " +
        "and lost on restart.",
    );
  }
}

if (devBypassEnabled) {
  console.warn(
    "[auth] Azure AD credentials not configured — dev-admin bypass is ACTIVE. " +
      "Every request will be treated as an admin. " +
      "This mode is disabled in production (NODE_ENV=production).",
  );
}

// ── Dev bypass user ───────────────────────────────────────────────────────────

export const DEV_ADMIN_USER: SessionUser = {
  id: "dev-admin",
  name: "Dev Admin",
  email: "dev@example.com",
  azureOid: "dev-admin",
  role: "admin",
};

// ── MSAL client ───────────────────────────────────────────────────────────────

let _msalClient: msal.ConfidentialClientApplication | null = null;

export function getMsalClient(): msal.ConfidentialClientApplication {
  if (!azureEnabled) throw new Error("Azure AD is not configured");
  if (!_msalClient) {
    _msalClient = new msal.ConfidentialClientApplication({
      auth: {
        clientId: AZURE_AD_CLIENT_ID!,
        clientSecret: AZURE_AD_CLIENT_SECRET!,
        authority: `https://login.microsoftonline.com/${AZURE_AD_TENANT_ID}`,
      },
      cache: {
        // Persist the token cache to PostgreSQL so that Graph tokens survive
        // API server restarts and work across multiple replicas.
        cachePlugin: new DbMsalCachePlugin(),
      },
      system: {
        loggerOptions: {
          loggerCallback: () => {},
          piiLoggingEnabled: false,
          logLevel: msal.LogLevel.Error,
        },
      },
    });
  }
  return _msalClient;
}

export const MSAL_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  // Graph delegated permissions — requested at login so the user consents
  // once and tokens can be acquired silently for calendar/Teams operations.
  "Calendars.ReadWrite",
  "OnlineMeetings.ReadWrite",
  // Required for POST /me/onlineMeetings and DELETE /me/onlineMeetings/{id}.
  // Without this scope Graph returns 403 for delegated online-meeting operations.
  "OnlineMeetings.ReadWrite.All",
];

// ── Session store ─────────────────────────────────────────────────────────────

const PgStore = pgSession(session);

function createSessionStore(): session.Store {
  if (DATABASE_URL) {
    const pool = new pg.Pool({ connectionString: DATABASE_URL });
    return new PgStore({
      pool,
      tableName: "sessions",
      createTableIfMissing: true,
    });
  }
  // MemoryStore is acceptable for development and test isolation.
  return new session.MemoryStore();
}

// ── Session middleware ────────────────────────────────────────────────────────

export const sessionMiddleware = session({
  secret: SESSION_SECRET || "dev-secret-change-me",
  store: createSessionStore(),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,
    httpOnly: true,
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000, // 24 h
  },
});

// ── Role helpers ──────────────────────────────────────────────────────────────

export const ROLE_ORDER: Record<string, number> = {
  admin: 3,
  hrbp: 2,
  leader: 1,
  staff: 0,
};

function extractRole(
  claims: Record<string, unknown>,
): SessionUser["role"] {
  const roles = Array.isArray(claims.roles) ? claims.roles : [];
  if (roles.includes("admin")) return "admin";
  if (roles.includes("hrbp")) return "hrbp";
  if (roles.includes("leader")) return "leader";
  return "staff";
}

export function buildSessionUser(account: msal.AccountInfo): SessionUser {
  const claims = (account.idTokenClaims ?? {}) as Record<string, unknown>;
  return {
    id: account.localAccountId,
    azureOid: account.localAccountId,
    name: account.name ?? (claims.name as string) ?? "Unknown",
    email:
      (claims.preferred_username as string) ??
      (claims.email as string) ??
      account.username,
    role: extractRole(claims),
  };
}

// ── Auth middlewares ──────────────────────────────────────────────────────────

/**
 * Require a valid session.
 *
 * - In development/test with no Azure creds (devBypassEnabled=true):
 *   always passes and sets req.user = DEV_ADMIN_USER.
 * - In production or when Azure is configured:
 *   returns 401 when the session has no authenticated user.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (devBypassEnabled) {
    req.user = DEV_ADMIN_USER;
    return next();
  }

  if (!req.session.user) {
    res
      .status(401)
      .json({ error: "Unauthorized", message: "Authentication required" });
    return;
  }

  req.user = req.session.user;
  next();
}

/**
 * Require a minimum role level. Must be called after requireAuth.
 * admin ≥ hrbp ≥ leader ≥ staff
 */
export function requireRole(minRole: "admin" | "hrbp" | "leader") {
  const required = ROLE_ORDER[minRole];
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res
        .status(401)
        .json({ error: "Unauthorized", message: "Authentication required" });
      return;
    }
    const level = ROLE_ORDER[user.role] ?? 0;
    if (level < required) {
      res
        .status(403)
        .json({ error: "Forbidden", message: "Insufficient permissions" });
      return;
    }
    next();
  };
}
