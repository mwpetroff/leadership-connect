import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

/**
 * Singleton row holding the encrypted, serialized MSAL token cache.
 *
 * Design notes:
 * - id='singleton' keeps storage bounded (no per-user growth).
 * - version enables optimistic locking: replicas only write if the row has not
 *   changed since they read it, preventing silent token overwrites.
 * - cacheData is AES-256-GCM encrypted at the application layer before insert
 *   so raw refresh tokens are never stored in plaintext.
 */
export const msalTokenCacheTable = pgTable("msal_token_cache", {
  id: text("id").primaryKey().default("singleton"),
  cacheData: text("cache_data").notNull(),
  version: integer("version").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
