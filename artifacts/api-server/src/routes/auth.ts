import { Router } from "express";
import { randomUUID } from "crypto";
import {
  azureEnabled,
  devBypassEnabled,
  getMsalClient,
  MSAL_SCOPES,
  buildSessionUser,
  DEV_ADMIN_USER,
} from "../lib/auth";

const router = Router();

function getFrontendOrigin(): string {
  if (process.env.AZURE_AD_REDIRECT_URI) {
    try {
      return new URL(process.env.AZURE_AD_REDIRECT_URI).origin;
    } catch {
      // fall through
    }
  }
  return "";
}

/** Generate a cryptographically secure random state value. */
function generateState(): string {
  return randomUUID();
}

/**
 * Validate the OAuth state returned in the callback against the value stored
 * in the session.  Returns an error string on failure, undefined on success.
 *
 * Exported for unit testing of the security-critical validation logic.
 */
export function validateCallbackState(
  sessionState: string | undefined,
  queryState: string | undefined,
): string | undefined {
  if (!sessionState) {
    return "No active login session — please start from /auth/login";
  }
  if (!queryState || queryState !== sessionState) {
    return "State mismatch — possible CSRF attack";
  }
  return undefined; // valid
}

// GET /me — returns the current session user or 401
router.get("/me", (req, res) => {
  if (devBypassEnabled) {
    // Dev-only: return the synthetic admin user so the frontend can render.
    res.json(DEV_ADMIN_USER);
    return;
  }
  if (!req.session.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json(req.session.user);
});

// GET /login — start the OAuth2 / PKCE flow
router.get("/login", async (req, res) => {
  if (devBypassEnabled) {
    // Dev mode: nothing to authenticate; redirect straight to frontend.
    res.redirect(getFrontendOrigin() || "/");
    return;
  }

  try {
    const state = generateState();
    // Store state before redirecting — must exist in session to be validated
    // in /callback.
    req.session.authState = state;

    const authUrl = await getMsalClient().getAuthCodeUrl({
      scopes: MSAL_SCOPES,
      redirectUri: process.env.AZURE_AD_REDIRECT_URI!,
      state,
    });

    // Save session before redirect so authState persists.
    req.session.save((err) => {
      if (err) {
        res.status(500).json({ error: "Failed to save session" });
        return;
      }
      res.redirect(authUrl);
    });
  } catch {
    res.status(500).json({ error: "Failed to start authentication" });
  }
});

// GET /callback — exchange auth code for token, set session cookie
router.get("/callback", async (req, res) => {
  if (devBypassEnabled) {
    res.redirect(getFrontendOrigin() || "/");
    return;
  }

  const { code, state, error, error_description } = req.query as Record<
    string,
    string
  >;

  if (error) {
    res
      .status(400)
      .json({ error, message: error_description ?? "OAuth error" });
    return;
  }

  if (!code) {
    res.status(400).json({ error: "Missing authorization code" });
    return;
  }

  // Strict CSRF check using pure validateCallbackState.
  const stateError = validateCallbackState(req.session.authState, state);
  if (stateError) {
    res.status(400).json({ error: stateError });
    return;
  }

  try {
    const result = await getMsalClient().acquireTokenByCode({
      code,
      scopes: MSAL_SCOPES,
      redirectUri: process.env.AZURE_AD_REDIRECT_URI!,
    });

    if (!result?.account) {
      res.status(500).json({ error: "No account in token response" });
      return;
    }

    const user = buildSessionUser(result.account);

    // Regenerate the session to prevent session-fixation attacks.
    req.session.regenerate((err) => {
      if (err) {
        res.status(500).json({ error: "Session error during login" });
        return;
      }
      req.session.user = user;
      // Store the MSAL local account ID so graph.ts can later acquire
      // Graph tokens silently via acquireTokenSilent.
      req.session.msalAccountId = result.account!.localAccountId;
      res.redirect(getFrontendOrigin() || "/");
    });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Authentication failed", message: String(err) });
  }
});

// GET /logout — destroy session and redirect to login
router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    const frontendOrigin = getFrontendOrigin() || "/";

    if (!devBypassEnabled && azureEnabled) {
      const postLogoutUri = encodeURIComponent(frontendOrigin);
      const logoutUrl =
        `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}` +
        `/oauth2/v2.0/logout?post_logout_redirect_uri=${postLogoutUri}`;
      res.redirect(logoutUrl);
    } else {
      res.redirect(frontendOrigin);
    }
  });
});

export default router;
