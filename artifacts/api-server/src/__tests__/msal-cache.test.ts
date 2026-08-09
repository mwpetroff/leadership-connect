/**
 * Unit tests for DbMsalCachePlugin.
 *
 * Uses real MSAL Node serialized-cache format fixtures (Account, IdToken,
 * AccessToken, RefreshToken, AppMetadata sections) so that mergeMsalCacheJson
 * and the round-trip through tokenCache.deserialize/serialize are tested
 * against production-representative data rather than synthetic JSON.
 *
 * Covers:
 * - AES-256-GCM encryption / decryption
 * - mergeMsalCacheJson: union of sections, overlay wins on conflict
 * - beforeCacheAccess: decrypt+deserialize on hit; no-op on fresh process
 * - afterCacheAccess: INSERT on first write; UPDATE with version check
 * - Retry-with-JSON-merge: losing replica merges fresh DB entry with local
 *   tokens and retries — no token is silently dropped
 * - In-process mutex: concurrent operations are serialized
 * - Multi-replica concurrent login: both accounts survive restart
 * - Graceful degradation on DB errors
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoist mocks ───────────────────────────────────────────────────────────────
const { mockDb } = vi.hoisted(() => {
  const mockDb = { select: vi.fn(), insert: vi.fn(), update: vi.fn() };
  return { mockDb };
});

vi.mock('@workspace/db', () => ({
  db: mockDb,
  msalTokenCacheTable: { id: 'id', cacheData: 'cache_data', version: 'version', updatedAt: 'updated_at' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ op: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
}));

process.env.SESSION_SECRET = 'test-secret-long-enough-for-scrypt-derivation-32+';

import { DbMsalCachePlugin, encryptCache, decryptCache, mergeMsalCacheJson } from '../lib/msal-cache';

// ── Real MSAL serialized-cache format fixtures ────────────────────────────────
// Matches the structure produced by @azure/msal-node's InMemoryCache.serialize().

const TENANT = 'contoso.onmicrosoft.com';
const CLIENT_ID = 'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb';
const ENV = 'login.microsoftonline.com';

/** Build a realistic MSAL cache blob for a single user. */
function msalCacheFixture(userId: string, homeAccountId: string) {
  return {
    Account: {
      [`${homeAccountId}-${ENV}-${TENANT}`]: {
        home_account_id: homeAccountId,
        environment: ENV,
        realm: TENANT,
        local_account_id: userId,
        username: `${userId}@${TENANT}`,
        account_type: 'MSSTS',
      },
    },
    IdToken: {
      [`${homeAccountId}-${ENV}-idtoken-${CLIENT_ID}-${TENANT}-`]: {
        home_account_id: homeAccountId,
        environment: ENV,
        client_id: CLIENT_ID,
        secret: `id-token-secret-for-${userId}`,
        credential_type: 'IdToken',
        realm: TENANT,
      },
    },
    AccessToken: {
      [`${homeAccountId}-${ENV}-accesstoken-${CLIENT_ID}-${TENANT}-Calendars.ReadWrite`]: {
        home_account_id: homeAccountId,
        environment: ENV,
        client_id: CLIENT_ID,
        secret: `access-token-for-${userId}`,
        credential_type: 'AccessToken',
        realm: TENANT,
        target: 'Calendars.ReadWrite',
        cached_at: '1700000000',
        expires_on: '1700003600',
        extended_expires_on: '1700007200',
      },
    },
    RefreshToken: {
      [`${homeAccountId}-${ENV}-refreshtoken-${CLIENT_ID}--`]: {
        home_account_id: homeAccountId,
        environment: ENV,
        client_id: CLIENT_ID,
        secret: `refresh-token-for-${userId}`,
        credential_type: 'RefreshToken',
      },
    },
    AppMetadata: {
      [`appmetadata-${ENV}-${CLIENT_ID}`]: {
        environment: ENV,
        client_id: CLIENT_ID,
      },
    },
  };
}

const user1HomeId = 'uid1.tid1';
const user2HomeId = 'uid2.tid1';
const CACHE_USER1 = JSON.stringify(msalCacheFixture('user1', user1HomeId));
const CACHE_USER2 = JSON.stringify(msalCacheFixture('user2', user2HomeId));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSelectChain(row: { cacheData: string; version: number } | null) {
  return { from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(row ? [row] : []) };
}
function makeInsertChain(result: { id: string }[]) {
  return { values: vi.fn().mockReturnThis(), onConflictDoNothing: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue(result) };
}
function makeUpdateChain(result: { id: string }[]) {
  return { set: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue(result) };
}

/** Minimal real MSAL-like token cache. deserialize() replaces (like real MSAL). */
function makeMsalTokenCache(initial = '{}') {
  let _data = initial;
  return {
    deserialize: vi.fn((json: string) => { _data = json; }),
    serialize: vi.fn(() => _data),
    getData: () => _data,
  };
}

function makeCtx(changed = false, tokenCache = makeMsalTokenCache()) {
  return { tokenCache, cacheHasChanged: changed };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('encryptCache / decryptCache', () => {
  it('round-trips plaintext through AES-256-GCM', () => {
    const ct = encryptCache(CACHE_USER1);
    expect(ct).not.toBe(CACHE_USER1);
    expect(decryptCache(ct)).toBe(CACHE_USER1);
  });

  it('produces different ciphertexts for the same input (random IV)', () => {
    expect(encryptCache(CACHE_USER1)).not.toBe(encryptCache(CACHE_USER1));
  });

  it('throws on tampered ciphertext', () => {
    const ct = encryptCache('hello');
    const buf = Buffer.from(ct, 'base64');
    buf[buf.length - 1] ^= 0xff;
    expect(() => decryptCache(buf.toString('base64'))).toThrow();
  });

  it('throws if ciphertext is too short', () => {
    expect(() => decryptCache(Buffer.from('short').toString('base64'))).toThrow(/too short/);
  });
});

describe('mergeMsalCacheJson', () => {
  it('preserves all entries from both user caches across all MSAL sections', () => {
    const merged = JSON.parse(mergeMsalCacheJson(CACHE_USER1, CACHE_USER2)) as Record<string, Record<string, unknown>>;

    // Both accounts must be present.
    expect(Object.keys(merged.Account ?? {})).toHaveLength(2);
    expect(merged.Account).toHaveProperty(`${user1HomeId}-${ENV}-${TENANT}`);
    expect(merged.Account).toHaveProperty(`${user2HomeId}-${ENV}-${TENANT}`);

    // Both refresh tokens must be present.
    const rtKey1 = `${user1HomeId}-${ENV}-refreshtoken-${CLIENT_ID}--`;
    const rtKey2 = `${user2HomeId}-${ENV}-refreshtoken-${CLIENT_ID}--`;
    expect(merged.RefreshToken).toHaveProperty(rtKey1);
    expect(merged.RefreshToken).toHaveProperty(rtKey2);
    expect((merged.RefreshToken?.[rtKey1] as Record<string,string>).secret).toBe('refresh-token-for-user1');
    expect((merged.RefreshToken?.[rtKey2] as Record<string,string>).secret).toBe('refresh-token-for-user2');
  });

  it('overlay (newly acquired) entry wins when both have the same key', () => {
    const base = JSON.stringify({
      RefreshToken: {
        'shared-key': { secret: 'old-rt', credential_type: 'RefreshToken' },
      },
    });
    const overlay = JSON.stringify({
      RefreshToken: {
        'shared-key': { secret: 'new-rt', credential_type: 'RefreshToken' },
      },
    });
    const merged = JSON.parse(mergeMsalCacheJson(base, overlay)) as Record<string, Record<string, Record<string, string>>>;
    expect(merged.RefreshToken['shared-key'].secret).toBe('new-rt');
  });

  it('falls back to overlay if base is invalid JSON', () => {
    expect(mergeMsalCacheJson('invalid{json', CACHE_USER2)).toBe(CACHE_USER2);
  });
});

describe('DbMsalCachePlugin', () => {
  let plugin: DbMsalCachePlugin;

  beforeEach(() => {
    vi.resetAllMocks();
    plugin = new DbMsalCachePlugin();
  });

  // ── beforeCacheAccess ──────────────────────────────────────────────────────

  describe('beforeCacheAccess', () => {
    it('decrypts and deserializes the stored cache (user1) on cache hit', async () => {
      const encrypted = encryptCache(CACHE_USER1);
      mockDb.select.mockReturnValue(makeSelectChain({ cacheData: encrypted, version: 2 }));

      const tc = makeMsalTokenCache();
      const ctx = makeCtx(false, tc);
      await plugin.beforeCacheAccess(ctx as any);
      await plugin.afterCacheAccess(ctx as any);

      expect(tc.deserialize).toHaveBeenCalledWith(CACHE_USER1);
    });

    it('does not call deserialize when no DB row exists', async () => {
      mockDb.select.mockReturnValue(makeSelectChain(null));
      const tc = makeMsalTokenCache();
      const ctx = makeCtx(false, tc);
      await plugin.beforeCacheAccess(ctx as any);
      await plugin.afterCacheAccess(ctx as any);
      expect(tc.deserialize).not.toHaveBeenCalled();
    });

    it('degrades gracefully on DB error', async () => {
      mockDb.select.mockReturnValue({ from: vi.fn().mockReturnThis(), where: vi.fn().mockRejectedValue(new Error('DB down')) });
      const ctx = makeCtx(false);
      await expect(plugin.beforeCacheAccess(ctx as any)).resolves.not.toThrow();
      await plugin.afterCacheAccess(ctx as any);
    });
  });

  // ── afterCacheAccess ───────────────────────────────────────────────────────

  describe('afterCacheAccess', () => {
    it('skips DB write when cacheHasChanged is false', async () => {
      mockDb.select.mockReturnValue(makeSelectChain(null));
      const ctx = makeCtx(false);
      await plugin.beforeCacheAccess(ctx as any);
      await plugin.afterCacheAccess(ctx as any);
      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('INSERTs an encrypted user1 cache on first write (fresh process)', async () => {
      mockDb.select.mockReturnValue(makeSelectChain(null));
      mockDb.insert.mockReturnValue(makeInsertChain([{ id: 'singleton' }]));

      const tc = makeMsalTokenCache(CACHE_USER1);
      const ctx = makeCtx(true, tc);
      await plugin.beforeCacheAccess(ctx as any);
      await plugin.afterCacheAccess(ctx as any);

      expect(mockDb.insert).toHaveBeenCalledOnce();
      const stored = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
      expect(decryptCache(stored.cacheData)).toBe(CACHE_USER1);
    });

    it('UPDATEs with incremented version when row exists', async () => {
      mockDb.select.mockReturnValue(makeSelectChain({ cacheData: encryptCache(CACHE_USER1), version: 4 }));
      mockDb.update.mockReturnValue(makeUpdateChain([{ id: 'singleton' }]));

      const tc = makeMsalTokenCache(CACHE_USER1);
      const ctx = makeCtx(true, tc);
      await plugin.beforeCacheAccess(ctx as any);
      await plugin.afterCacheAccess(ctx as any);

      expect(mockDb.update).toHaveBeenCalledOnce();
      const setArg = mockDb.update.mock.results[0].value.set.mock.calls[0][0];
      expect(setArg.version).toBe(5);
      expect(decryptCache(setArg.cacheData)).toBe(CACHE_USER1);
    });

    it('degrades gracefully on DB write failure', async () => {
      mockDb.select.mockReturnValue(makeSelectChain(null));
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnThis(),
        onConflictDoNothing: vi.fn().mockReturnThis(),
        returning: vi.fn().mockRejectedValue(new Error('write error')),
      });
      const ctx = makeCtx(true);
      await plugin.beforeCacheAccess(ctx as any);
      await expect(plugin.afterCacheAccess(ctx as any)).resolves.not.toThrow();
    });
  });

  // ── Retry-with-JSON-merge on conflict ──────────────────────────────────────

  describe('retry-with-JSON-merge on concurrent write conflict', () => {
    it('INSERT conflict: JSON-merges fresh user1 row with local user2 tokens, retries UPDATE', async () => {
      // Fresh process: no DB row initially.
      mockDb.select
        .mockReturnValueOnce(makeSelectChain(null))
        // Retry reload: user1 was inserted by another replica.
        .mockReturnValueOnce(makeSelectChain({ cacheData: encryptCache(CACHE_USER1), version: 0 }));

      mockDb.insert.mockReturnValue(makeInsertChain([])); // conflict
      mockDb.update.mockReturnValue(makeUpdateChain([{ id: 'singleton' }]));

      // Local replica has user2 tokens.
      const tc = makeMsalTokenCache(CACHE_USER2);
      const ctx = makeCtx(true, tc);
      await plugin.beforeCacheAccess(ctx as any);
      await plugin.afterCacheAccess(ctx as any);

      // After JSON-level merge, deserialize was called with a blob containing BOTH users.
      const lastDeserializeArg = (tc.deserialize as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as string;
      const merged = JSON.parse(lastDeserializeArg) as Record<string, Record<string, unknown>>;
      expect(merged.Account).toHaveProperty(`${user1HomeId}-${ENV}-${TENANT}`); // from DB (user1)
      expect(merged.Account).toHaveProperty(`${user2HomeId}-${ENV}-${TENANT}`); // local (user2)

      // A retry UPDATE was issued.
      expect(mockDb.update).toHaveBeenCalledOnce();
      const setArg = mockDb.update.mock.results[0].value.set.mock.calls[0][0];
      const writtenBack = JSON.parse(decryptCache(setArg.cacheData)) as Record<string, Record<string, unknown>>;
      // After merge and re-serialize, the DB receives both users.
      expect(writtenBack.Account).toHaveProperty(`${user1HomeId}-${ENV}-${TENANT}`);
      expect(writtenBack.Account).toHaveProperty(`${user2HomeId}-${ENV}-${TENANT}`);
    });

    it('UPDATE conflict: JSON-merges fresh row, retries with correct version', async () => {
      // Both replicas read version 3 in beforeCacheAccess.
      mockDb.select
        .mockReturnValueOnce(makeSelectChain({ cacheData: encryptCache(CACHE_USER1), version: 3 }))
        // Reload: other replica wrote version 4.
        .mockReturnValueOnce(makeSelectChain({ cacheData: encryptCache(CACHE_USER1), version: 4 }));

      mockDb.update
        .mockReturnValueOnce(makeUpdateChain([]))                   // version 3 conflict
        .mockReturnValueOnce(makeUpdateChain([{ id: 'singleton' }])); // version 5 success

      const tc = makeMsalTokenCache(CACHE_USER2);
      const ctx = makeCtx(true, tc);
      await plugin.beforeCacheAccess(ctx as any);
      await plugin.afterCacheAccess(ctx as any);

      expect(mockDb.update).toHaveBeenCalledTimes(2);
      const retrySet = mockDb.update.mock.results[1].value.set.mock.calls[0][0];
      expect(retrySet.version).toBe(5); // fresh 4 + 1
    });
  });

  // ── In-process mutex ───────────────────────────────────────────────────────

  describe('in-process mutex', () => {
    it('second operation is blocked until first releases the lock', async () => {
      const order: string[] = [];

      mockDb.select
        .mockReturnValueOnce({ from: vi.fn().mockReturnThis(), where: vi.fn().mockImplementation(async () => { order.push('op1-before'); return []; }) })
        .mockReturnValueOnce({ from: vi.fn().mockReturnThis(), where: vi.fn().mockImplementation(async () => { order.push('op2-before'); return []; }) });

      mockDb.insert
        .mockReturnValueOnce({ values: vi.fn().mockReturnThis(), onConflictDoNothing: vi.fn().mockReturnThis(), returning: vi.fn().mockImplementation(async () => { order.push('op1-insert'); return [{ id: 'singleton' }]; }) })
        .mockReturnValueOnce({ values: vi.fn().mockReturnThis(), onConflictDoNothing: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue([]) });
      // Retry reload for op2 conflict
      mockDb.select.mockReturnValueOnce(makeSelectChain(null));
      // op2 exhausts retries gracefully

      const ctx1 = makeCtx(true, makeMsalTokenCache(CACHE_USER1));
      const ctx2 = makeCtx(true, makeMsalTokenCache(CACHE_USER2));

      const p1 = plugin.beforeCacheAccess(ctx1 as any).then(() => plugin.afterCacheAccess(ctx1 as any));
      const p2 = plugin.beforeCacheAccess(ctx2 as any).then(() => plugin.afterCacheAccess(ctx2 as any));
      await Promise.all([p1, p2]);

      // op1 must complete its before-read before op2 can start.
      expect(order.indexOf('op1-before')).toBeLessThan(order.indexOf('op2-before'));
      // op1's insert must finish before op2's before-read begins.
      expect(order.indexOf('op1-insert')).toBeLessThan(order.indexOf('op2-before'));
    });

    it('multi-replica concurrent login: both users survive a restart', async () => {
      /**
       * Two separate plugin instances (simulating two replicas) both acquire
       * tokens concurrently. The optimistic-lock + JSON-merge ensures both
       * users' refresh tokens end up in the DB row.
       * After a "restart" (new plugin loads from DB), both must be present.
       */
      const plugin1 = new DbMsalCachePlugin();
      const plugin2 = new DbMsalCachePlugin();

      // Shared in-memory "database".
      let dbRow: { cacheData: string; version: number } | null = null;

      mockDb.select.mockImplementation(() => ({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(dbRow ? [{ ...dbRow }] : []),
      }));
      mockDb.insert.mockImplementation(() => ({
        values: vi.fn().mockImplementation((v: { cacheData: string; version: number }) => ({
          onConflictDoNothing: vi.fn().mockReturnThis(),
          returning: vi.fn().mockImplementation(async () => {
            if (!dbRow) { dbRow = { cacheData: v.cacheData, version: 0 }; return [{ id: 'singleton' }]; }
            return []; // conflict
          }),
        })),
      }));
      mockDb.update.mockImplementation(() => ({
        set: vi.fn().mockImplementation((s: { cacheData: string; version: number }) => ({
          where: vi.fn().mockReturnThis(),
          returning: vi.fn().mockImplementation(async () => {
            if (dbRow && dbRow.version === s.version - 1) {
              dbRow = { cacheData: s.cacheData, version: s.version };
              return [{ id: 'singleton' }];
            }
            return []; // version mismatch
          }),
        })),
      }));

      // Each replica has a realistic MSAL token cache for its user.
      // Use real token-cache instances that simulate MSAL replace-on-deserialize.
      const tc1 = makeMsalTokenCache(CACHE_USER1);
      const tc2 = makeMsalTokenCache(CACHE_USER2);

      const ctx1 = makeCtx(true, tc1);
      const ctx2 = makeCtx(true, tc2);

      await Promise.all([
        plugin1.beforeCacheAccess(ctx1 as any).then(() => plugin1.afterCacheAccess(ctx1 as any)),
        plugin2.beforeCacheAccess(ctx2 as any).then(() => plugin2.afterCacheAccess(ctx2 as any)),
      ]);

      // DB must contain both users' tokens.
      expect(dbRow).not.toBeNull();
      const stored = JSON.parse(decryptCache(dbRow!.cacheData)) as Record<string, Record<string, unknown>>;
      expect(stored.Account).toHaveProperty(`${user1HomeId}-${ENV}-${TENANT}`);
      expect(stored.Account).toHaveProperty(`${user2HomeId}-${ENV}-${TENANT}`);

      const rt1Key = `${user1HomeId}-${ENV}-refreshtoken-${CLIENT_ID}--`;
      const rt2Key = `${user2HomeId}-${ENV}-refreshtoken-${CLIENT_ID}--`;
      expect((stored.RefreshToken?.[rt1Key] as Record<string,string>)?.secret).toBe('refresh-token-for-user1');
      expect((stored.RefreshToken?.[rt2Key] as Record<string,string>)?.secret).toBe('refresh-token-for-user2');

      // Simulate restart: new plugin loads from DB.
      const plugin3 = new DbMsalCachePlugin();
      const restartTc = makeMsalTokenCache();
      const ctx3 = makeCtx(false, restartTc);
      await plugin3.beforeCacheAccess(ctx3 as any);
      await plugin3.afterCacheAccess(ctx3 as any);

      expect(restartTc.deserialize).toHaveBeenCalledOnce();
      const deserializedStr = (restartTc.deserialize as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      const deserializedCache = JSON.parse(deserializedStr) as Record<string, Record<string, unknown>>;
      expect(deserializedCache.Account).toHaveProperty(`${user1HomeId}-${ENV}-${TENANT}`);
      expect(deserializedCache.Account).toHaveProperty(`${user2HomeId}-${ENV}-${TENANT}`);
      expect((deserializedCache.RefreshToken?.[rt1Key] as Record<string,string>)?.secret).toBe('refresh-token-for-user1');
      expect((deserializedCache.RefreshToken?.[rt2Key] as Record<string,string>)?.secret).toBe('refresh-token-for-user2');
    });
  });
});
