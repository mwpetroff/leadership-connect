/** Parse a meeting time from the API. Date-only values keep the legacy 10:00 UTC default. */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function parseScheduledInput(raw: unknown): Date | undefined {
  if (raw == null || raw === "") return undefined;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (DATE_ONLY.test(trimmed)) return new Date(`${trimmed}T10:00:00.000Z`);
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function toRfc3339(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function teamsOneHourWindow(start: Date): { startDateTime: string; endDateTime: string } {
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { startDateTime: toRfc3339(start), endDateTime: toRfc3339(end) };
}
