/**
 * Database-backed MSAL token cache plugin.
 *
 * Guarantees:
 * 1. Durability across restarts: cache is persisted to PostgreSQL after every
 *    MSAL write; loaded back on every read.
 * 2. In-process serialization: a promise-chaining mutex ensures only one
 *    MSAL cache operation runs at a time within a single replica, preventing
 *    concurrent callbacks from interleaving reads/writes on the shared
 *    in-memory cache object.
 * 3. Multi-replica safety: optimistic locking (integer version column) detects
 *    concurrent writes from other replicas. On conflict, the losing replica
 *    performs a JSON-level merge of the two serialized cache blobs (preserving
 *    entries from BOTH replicas), then retries. No token updates are silently
 *    dropped.
 * 4. Encryption at rest: cacheData stored as AES-256-GCM ciphertext so raw
 *    refresh tokens are never persisted in plaintext.
 * 5. Graceful degradation: DB/crypto errors are caught and logged; Graph
 *    calls fall back to in-memory cache (which remains valid for the request).
 *
 * ## Why JSON-level merge?
 *
 * MSAL Node's `tokenCache.deserialize()` REPLACES the in-memory cache; it
 * does not merge. A "merge via deserialize" would silently discard any tokens
 * acquired by the current request. Instead, on a write conflict we:
 *   1. Parse the serialized JSON from the fresh DB row.
 *   2. Parse the serialized JSON from our current in-memory cache (which
 *      contains the newly acquired tokens).
 *   3. Union-merge each section (Account, IdToken, AccessToken, RefreshToken,
 *      AppMetadata). Local (newly acquired) entries take precedence on key
 *      conflict.
 *   4. Call tokenCache.deserialize(merged) — which replaces the in-memory
 *      cache with the fully merged result.
 *   5. Retry the DB write with the fresh version.
 */
import crypto from "crypto";
import type { ICachePlugin, TokenCacheContext } from "@azure/msal-node";
import { db, msalTokenCacheTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

// ── Encryption ────────────────────────────────────────────────────────────────

const ALGORITHM = "aes-256-gcm";
const IV_LEN = 16;
const TAG_LEN = 16;
const SALT = "msal-token-cache-v1";

let _key: Buffer | undefined;
function getKey(): Buffer {
  if (_key) return _key;
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  _key = crypto.scryptSync(secret, SALT, 32);
  return _key;
}

export function encryptCache(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Layout: [iv (16)] [tag (16)] [ciphertext]
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptCache(ciphertext: string): string {
  const key = getKey();
  const buf = Buffer.from(ciphertext, "base64");
  if (buf.length < IV_LEN + TAG_LEN) throw new Error("Invalid ciphertext: too short");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const encrypted = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

// ── MSAL cache JSON merge ─────────────────────────────────────────────────────

/**
 * The sections present in an MSAL Node serialized cache blob.
 * Each section is a flat object whose keys are cache-entry composite keys.
 */
const MSAL_CACHE_SECTIONS = [
  "Account",
  "IdToken",
  "AccessToken",
  "RefreshToken",
  "AppMetadata",
] as const;

type MsalCacheSection = typeof MSAL_CACHE_SECTIONS[number];
type MsalCacheBlob = Partial<Record<MsalCacheSection, Record<string, unknown>>>;

/**
 * Union-merge two serialized MSAL cache JSON strings.
 *
 * For each section, entries from both blobs are combined. `overlay` entries
 * win on key conflict — they represent the newly acquired tokens that must not
 * be lost. Returns the merged JSON string ready for tokenCache.deserialize().
 */
export function mergeMsalCacheJson(base: string, overlay: string): string {
  let baseObj: MsalCacheBlob;
  let overlayObj: MsalCacheBlob;
  try {
    baseObj = JSON.parse(base) as MsalCacheBlob;
    overlayObj = JSON.parse(overlay) as MsalCacheBlob;
  } catch {
    // If either blob is unparseable, fall back to the overlay (local state).
    return overlay;
  }

  const merged: MsalCacheBlob = {};
  for (const section of MSAL_CACHE_SECTIONS) {
    const baseSection = baseObj[section] ?? {};
    const overlaySection = overlayObj[section] ?? {};
    if (Object.keys(baseSection).length > 0 || Object.keys(overlaySection).length > 0) {
      // Overlay wins on conflict: newly acquired tokens take precedence.
      merged[section] = { ...baseSection, ...overlaySection };
    }
  }

  // Preserve any non-standard top-level keys from both blobs.
  const extraKeys = new Set([
    ...Object.keys(baseObj),
    ...Object.keys(overlayObj),
  ].filter((k) => !(MSAL_CACHE_SECTIONS as readonly string[]).includes(k)));
  for (const k of extraKeys) {
    (merged as Record<string, unknown>)[k] = (overlayObj as Record<string, unknown>)[k]
      ?? (baseObj as Record<string, unknown>)[k];
  }

  return JSON.stringify(merged);
}

// ── Cache plugin ──────────────────────────────────────────────────────────────

const CACHE_ID = "singleton" as const;

export class DbMsalCachePlugin implements ICachePlugin {
  /**
   * In-process serialization lock (promise-chaining mutex).
   *
   * Ensures only one before/afterCacheAccess pair runs at a time within a
   * single Node.js process, preventing concurrent requests from interleaving
   * reads and writes on the shared in-memory MSAL cache object.
   */
  private _lock: Promise<void> = Promise.resolve();
  private _releases = new WeakMap<object, () => void>();
  private _loadedVersions = new WeakMap<object, number>();

  // ── ICachePlugin callbacks ─────────────────────────────────────────────────

  async beforeCacheAccess(ctx: TokenCacheContext): Promise<void> {
    // Acquire mutex: append a new exclusive slot to the chain.
    let release!: () => void;
    const waitForPrevious = this._lock;
    this._lock = new Promise<void>((res) => { release = res; });
    await waitForPrevious;
    this._releases.set(ctx as object, release);

    try {
      const [row] = await db
        .select()
        .from(msalTokenCacheTable)
        .where(eq(msalTokenCacheTable.id, CACHE_ID));

      if (row?.cacheData) {
        ctx.tokenCache.deserialize(decryptCache(row.cacheData));
        this._loadedVersions.set(ctx as object, row.version);
      } else {
        this._loadedVersions.set(ctx as object, -1);
      }
    } catch (err) {
      this._loadedVersions.set(ctx as object, -1);
      console.warn("[msal-cache] beforeCacheAccess error (non-fatal):", String(err));
    }
  }

  async afterCacheAccess(ctx: TokenCacheContext): Promise<void> {
    try {
      if (ctx.cacheHasChanged) {
        await this._persistWithRetry(ctx);
      }
    } catch (err) {
      console.warn("[msal-cache] afterCacheAccess error (non-fatal):", String(err));
    } finally {
      // Always release the in-process lock.
      const release = this._releases.get(ctx as object);
      release?.();
      this._releases.delete(ctx as object);
    }
  }

  // ── Persist with JSON-level merge + retry on conflict ─────────────────────

  private async _persistWithRetry(ctx: TokenCacheContext, maxRetries = 3): Promise<void> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const localSerialized = ctx.tokenCache.serialize();
      const encrypted = encryptCache(localSerialized);
      const loadedVersion = this._loadedVersions.get(ctx as object) ?? -1;

      const succeeded = await (loadedVersion < 0
        ? this._tryInsert(encrypted)
        : this._tryUpdate(encrypted, loadedVersion));

      if (succeeded) return;

      // Lost the DB write race — reload the fresh row and perform a JSON-level
      // merge so that tokens from BOTH the DB and the local in-memory cache are
      // preserved. This avoids calling tokenCache.deserialize() alone (which
      // would REPLACE the local tokens) and instead produces a union of all
      // accounts and tokens from both sources.
      const [freshRow] = await db
        .select()
        .from(msalTokenCacheTable)
        .where(eq(msalTokenCacheTable.id, CACHE_ID));

      if (freshRow?.cacheData) {
        const freshDecrypted = decryptCache(freshRow.cacheData);
        // Merge: union of DB entries and local entries; local wins on conflict.
        const merged = mergeMsalCacheJson(freshDecrypted, localSerialized);
        // Replace in-memory cache with the fully merged result.
        ctx.tokenCache.deserialize(merged);
        this._loadedVersions.set(ctx as object, freshRow.version);
      } else {
        this._loadedVersions.set(ctx as object, -1);
      }
    }

    console.warn("[msal-cache] _persistWithRetry: exhausted retries; token may not be persisted");
  }

  private async _tryInsert(encrypted: string): Promise<boolean> {
    const result = await db
      .insert(msalTokenCacheTable)
      .values({ id: CACHE_ID, cacheData: encrypted, version: 0 })
      .onConflictDoNothing()
      .returning({ id: msalTokenCacheTable.id });
    return result.length > 0;
  }

  private async _tryUpdate(encrypted: string, loadedVersion: number): Promise<boolean> {
    const result = await db
      .update(msalTokenCacheTable)
      .set({ cacheData: encrypted, version: loadedVersion + 1, updatedAt: new Date() })
      .where(
        and(
          eq(msalTokenCacheTable.id, CACHE_ID),
          eq(msalTokenCacheTable.version, loadedVersion),
        ),
      )
      .returning({ id: msalTokenCacheTable.id });
    return result.length > 0;
  }
}
