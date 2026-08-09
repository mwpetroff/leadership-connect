import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

// NOTE: In the Replit test environment AZURE_AD_* env vars are unset, so
// `azureEnabled` is false and `requireAuth` always grants dev-admin access.
// We therefore test:
//   a) Dev-bypass behaviour via integration tests against the real Express app.
//   b) The security-critical `requireRole` and `validateCallbackState` functions
//      directly using crafted request objects — these are pure enough that they
//      need no Azure credentials to exercise correctly.
//   c) Azure-enabled `requireAuth` behaviour by resetting modules after setting
//      the necessary env vars, so `azureEnabled` is re-evaluated as true.

beforeEach(() => {
  vi.resetAllMocks();
});

// ── Production startup guards — fail closed ───────────────────────────────────
// Importing lib/auth in production with incomplete config must throw immediately.

describe('Production startup guards', () => {
  // Snapshot the env vars that exist before each test so we can restore them.
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {
      NODE_ENV: process.env.NODE_ENV,
      AZURE_AD_TENANT_ID: process.env.AZURE_AD_TENANT_ID,
      AZURE_AD_CLIENT_ID: process.env.AZURE_AD_CLIENT_ID,
      AZURE_AD_CLIENT_SECRET: process.env.AZURE_AD_CLIENT_SECRET,
      AZURE_AD_REDIRECT_URI: process.env.AZURE_AD_REDIRECT_URI,
      SESSION_SECRET: process.env.SESSION_SECRET,
      DATABASE_URL: process.env.DATABASE_URL,
    };
  });

  afterEach(() => {
    Object.entries(saved).forEach(([k, v]) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    });
    vi.resetModules();
  });

  it('throws when NODE_ENV=production and Azure credentials are absent', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SESSION_SECRET = 'test-secret-for-guard-test';
    process.env.DATABASE_URL = 'postgres://localhost/test';
    delete process.env.AZURE_AD_TENANT_ID;
    delete process.env.AZURE_AD_CLIENT_ID;
    delete process.env.AZURE_AD_CLIENT_SECRET;
    delete process.env.AZURE_AD_REDIRECT_URI;
    vi.resetModules();

    await expect(import('../../lib/auth')).rejects.toThrow(/AZURE_AD/i);
  });

  it('throws when NODE_ENV=production and SESSION_SECRET is absent', async () => {
    process.env.NODE_ENV = 'production';
    process.env.AZURE_AD_TENANT_ID = 'test-tenant';
    process.env.AZURE_AD_CLIENT_ID = 'test-client';
    process.env.AZURE_AD_CLIENT_SECRET = 'test-secret';
    process.env.AZURE_AD_REDIRECT_URI = 'https://example.com/callback';
    process.env.DATABASE_URL = 'postgres://localhost/test';
    delete process.env.SESSION_SECRET;
    vi.resetModules();

    await expect(import('../../lib/auth')).rejects.toThrow(/SESSION_SECRET/i);
  });

  it('throws when NODE_ENV=production and DATABASE_URL is absent', async () => {
    process.env.NODE_ENV = 'production';
    process.env.AZURE_AD_TENANT_ID = 'test-tenant';
    process.env.AZURE_AD_CLIENT_ID = 'test-client';
    process.env.AZURE_AD_CLIENT_SECRET = 'test-secret';
    process.env.AZURE_AD_REDIRECT_URI = 'https://example.com/callback';
    process.env.SESSION_SECRET = 'test-secret-for-guard-test';
    delete process.env.DATABASE_URL;
    vi.resetModules();

    await expect(import('../../lib/auth')).rejects.toThrow(/DATABASE_URL/i);
  });

  it('starts successfully in development when Azure creds are absent (dev bypass)', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.AZURE_AD_TENANT_ID;
    delete process.env.AZURE_AD_CLIENT_ID;
    delete process.env.AZURE_AD_CLIENT_SECRET;
    delete process.env.AZURE_AD_REDIRECT_URI;
    vi.resetModules();

    const { devBypassEnabled } = await import('../../lib/auth');
    expect(devBypassEnabled).toBe(true);
  });
});

// ── validateCallbackState — pure CSRF state validation ───────────────────────

describe('validateCallbackState', () => {
  it('returns an error when session has no stored state', async () => {
    const { validateCallbackState } = await import('../../routes/auth');
    expect(validateCallbackState(undefined, 'some-state')).toMatch(/no active login session/i);
  });

  it('returns an error when query state is absent', async () => {
    const { validateCallbackState } = await import('../../routes/auth');
    expect(validateCallbackState('stored-state', undefined)).toMatch(/state mismatch/i);
  });

  it('returns an error when query state does not match session state', async () => {
    const { validateCallbackState } = await import('../../routes/auth');
    expect(validateCallbackState('stored-state', 'different-state')).toMatch(/state mismatch/i);
  });

  it('returns undefined (valid) when states match exactly', async () => {
    const { validateCallbackState } = await import('../../routes/auth');
    expect(validateCallbackState('abc-123', 'abc-123')).toBeUndefined();
  });
});

// ── requireRole — direct middleware tests ─────────────────────────────────────

describe('requireRole middleware', () => {
  it('passes when user has the exact required role (admin→admin)', async () => {
    const { requireRole } = await import('../../lib/auth');
    const req: any = { user: { id: '1', name: 'A', email: 'a@b.com', azureOid: '1', role: 'admin' } };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    requireRole('admin')(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('passes when user exceeds required role (admin passes leader check)', async () => {
    const { requireRole } = await import('../../lib/auth');
    const req: any = { user: { id: '1', name: 'A', email: 'a@b.com', azureOid: '1', role: 'admin' } };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    requireRole('leader')(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('passes when user is leader and leader is required', async () => {
    const { requireRole } = await import('../../lib/auth');
    const req: any = { user: { id: '2', name: 'L', email: 'l@b.com', azureOid: '2', role: 'leader' } };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    requireRole('leader')(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 403 when leader attempts admin-only operation', async () => {
    const { requireRole } = await import('../../lib/auth');
    const req: any = { user: { id: '2', name: 'L', email: 'l@b.com', azureOid: '2', role: 'leader' } };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    requireRole('admin')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Forbidden' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when staff attempts leader-only operation', async () => {
    const { requireRole } = await import('../../lib/auth');
    const req: any = { user: { id: '3', name: 'S', email: 's@b.com', azureOid: '3', role: 'staff' } };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    requireRole('leader')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when staff attempts admin-only operation', async () => {
    const { requireRole } = await import('../../lib/auth');
    const req: any = { user: { id: '3', name: 'S', email: 's@b.com', azureOid: '3', role: 'staff' } };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    requireRole('admin')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when req.user is undefined', async () => {
    const { requireRole } = await import('../../lib/auth');
    const req: any = {};
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    requireRole('leader')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

// ── requireAuth — Azure-enabled path ─────────────────────────────────────────
// Re-import with AZURE_AD_* vars set so azureEnabled evaluates to true.

describe('requireAuth with Azure enabled (module re-evaluated)', () => {
  it('returns 401 when session has no user and Azure is configured', async () => {
    // Save originals
    const orig = {
      AZURE_AD_TENANT_ID: process.env.AZURE_AD_TENANT_ID,
      AZURE_AD_CLIENT_ID: process.env.AZURE_AD_CLIENT_ID,
      AZURE_AD_CLIENT_SECRET: process.env.AZURE_AD_CLIENT_SECRET,
      AZURE_AD_REDIRECT_URI: process.env.AZURE_AD_REDIRECT_URI,
    };
    process.env.AZURE_AD_TENANT_ID = 'test-tenant';
    process.env.AZURE_AD_CLIENT_ID = 'test-client-id';
    process.env.AZURE_AD_CLIENT_SECRET = 'test-client-secret';
    process.env.AZURE_AD_REDIRECT_URI = 'https://test.example.com/api/auth/callback';

    vi.resetModules();
    const { requireAuth } = await import('../../lib/auth');

    const req: any = { session: {} };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Unauthorized' }));
    expect(next).not.toHaveBeenCalled();

    // Restore
    Object.assign(process.env, orig);
    vi.resetModules();
  });

  it('populates req.user and calls next when session has a user', async () => {
    process.env.AZURE_AD_TENANT_ID = 'test-tenant';
    process.env.AZURE_AD_CLIENT_ID = 'test-client-id';
    process.env.AZURE_AD_CLIENT_SECRET = 'test-client-secret';
    process.env.AZURE_AD_REDIRECT_URI = 'https://test.example.com/api/auth/callback';

    vi.resetModules();
    const { requireAuth } = await import('../../lib/auth');

    const sessionUser = { id: 'u1', name: 'Jane', email: 'j@b.com', azureOid: 'u1', role: 'leader' as const };
    const req: any = { session: { user: sessionUser } };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toEqual(sessionUser);

    delete process.env.AZURE_AD_TENANT_ID;
    delete process.env.AZURE_AD_CLIENT_ID;
    delete process.env.AZURE_AD_CLIENT_SECRET;
    delete process.env.AZURE_AD_REDIRECT_URI;
    vi.resetModules();
  });
});

// ── Integration tests — auth routes (dev bypass) ──────────────────────────────

describe('GET /api/auth/me', () => {
  it('returns dev admin user when Azure is not configured', async () => {
    const { default: app } = await import('../../app');
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'dev-admin', role: 'admin', email: 'dev@example.com' });
  });
});

describe('GET /api/auth/login', () => {
  it('redirects in dev mode (no Azure creds)', async () => {
    const { default: app } = await import('../../app');
    const res = await request(app).get('/api/auth/login').redirects(0);
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
  });
});

describe('GET /api/auth/logout', () => {
  it('redirects after session destroy', async () => {
    const { default: app } = await import('../../app');
    const res = await request(app).get('/api/auth/logout').redirects(0);
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
  });
});

// ── Integration: route-level RBAC (via per-operation middleware) ───────────────
// In dev bypass mode every request is admin, so all write ops succeed at the
// auth layer.  We test the role enforcement logic directly (above) and confirm
// that the routes themselves correctly delegate to requireRole by verifying
// non-401/403 responses in dev mode (backend DB will 500 or 200 but NOT 401/403).

describe('Route-level RBAC — dev bypass (all requests are admin)', () => {
  it('POST /api/people — not 401/403 in dev bypass', async () => {
    const { default: app } = await import('../../app');
    const res = await request(app).post('/api/people').send({
      name: 'Auth Test', email: 'auth@test.com', role: 'staff',
      homeCity: 'Boston', homeState: 'MA',
    });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it('PATCH /api/virtual-meetings/1 — not 401/403 in dev bypass (leader op)', async () => {
    const { default: app } = await import('../../app');
    const res = await request(app).patch('/api/virtual-meetings/1').send({ status: 'scheduled' });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it('GET /api/people — not 401/403 in dev bypass', async () => {
    const { default: app } = await import('../../app');
    const res = await request(app).get('/api/people');
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
