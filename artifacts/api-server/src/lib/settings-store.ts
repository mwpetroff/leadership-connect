/**
 * Settings store — thin wrapper around the `settings` DB table.
 *
 * Default values are seeded on first read and returned immediately if
 * the table is empty, so the rest of the app never has to handle null.
 */
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const DEFAULTS: Record<string, string> = {
  touchpoint_threshold_days: "90",
  suggestion_radius: "state",
  invite_radius_miles: "50",
  org_name: "Leadership Connect",
};

/**
 * Seed default values into the settings table if any key is missing.
 * Idempotent — safe to call on every startup.
 */
export async function seedDefaults(): Promise<void> {
  for (const [key, value] of Object.entries(DEFAULTS)) {
    await db
      .insert(settingsTable)
      .values({ key, value })
      .onConflictDoNothing();
  }
}

/**
 * Get a single setting value. Falls back to the hardcoded default if the
 * row is missing (e.g. before seeding runs).
 */
export async function getSetting(key: string): Promise<string> {
  const [row] = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, key));
  return row?.value ?? DEFAULTS[key] ?? "";
}

/**
 * Get the touchpoint threshold in days (integer).
 */
export async function getTouchpointThresholdDays(): Promise<number> {
  const raw = await getSetting("touchpoint_threshold_days");
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 90;
}
