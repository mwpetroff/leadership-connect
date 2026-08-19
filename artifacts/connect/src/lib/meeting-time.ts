import { format } from "date-fns";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function parseMeetingInstant(value: string | Date | null | undefined): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (DATE_ONLY.test(value)) {
    const d = new Date(`${value}T10:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toDatetimeLocalValue(iso: string | Date | null | undefined): string {
  const d = parseMeetingInstant(iso);
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Convert a datetime-local value (no timezone) to an ISO instant. */
export function fromDatetimeLocalValue(local: string): string | undefined {
  if (!local.trim()) return undefined;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export function formatMeetingWhen(iso: string | Date | null | undefined): string {
  const d = parseMeetingInstant(iso);
  if (!d) return "Unscheduled";
  return format(d, "EEE, MMM d, yyyy · h:mm a");
}
