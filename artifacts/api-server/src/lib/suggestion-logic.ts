/**
 * Pure business-logic functions for the suggestion engine.
 *
 * These functions are extracted from the route handlers so they can be tested
 * independently without a database. They contain zero async or DB calls.
 */

export const NEEDS_TOUCHPOINT_DAYS = 90;

export interface StaffPerson {
  id: number;
  homeState: string;
  homeCity: string;
  role: string;
}

export interface EventLocation {
  state: string;
  city: string;
}

/**
 * Returns true when the staff member lives in the same state as the event.
 * Comparison is case-insensitive.
 */
export function isSameState(personState: string, eventState: string): boolean {
  return personState.toLowerCase() === eventState.toLowerCase();
}

/**
 * Returns true when the staff member lives in the same city as the event.
 * Comparison is case-insensitive.
 */
export function isSameCity(personCity: string, eventCity: string): boolean {
  return personCity.toLowerCase() === eventCity.toLowerCase();
}

/**
 * Returns true when a person qualifies for a virtual touchpoint suggestion
 * (never had one, or last one was 90+ days ago).
 */
export function needsVirtualTouchpoint(daysSinceLastTouchpoint: number | null): boolean {
  return daysSinceLastTouchpoint === null || daysSinceLastTouchpoint >= NEEDS_TOUCHPOINT_DAYS;
}

/**
 * Sort comparator: staff with no recent in-person event rises to the top;
 * among those with data, the largest gap (most overdue) comes first.
 */
export function sortByEventGap(
  a: { daysSinceLastEvent: number | null },
  b: { daysSinceLastEvent: number | null }
): number {
  if (a.daysSinceLastEvent === null && b.daysSinceLastEvent === null) return 0;
  if (a.daysSinceLastEvent === null) return -1;
  if (b.daysSinceLastEvent === null) return 1;
  return b.daysSinceLastEvent - a.daysSinceLastEvent;
}

/**
 * Sort comparator: staff with no touchpoint at all rises to the top;
 * among those with data, the largest gap (most overdue) comes first.
 */
export function sortByTouchpointGap(
  a: { days: number | null },
  b: { days: number | null }
): number {
  if (a.days === null && b.days === null) return 0;
  if (a.days === null) return -1;
  if (b.days === null) return 1;
  return b.days - a.days;
}

/**
 * Filter staff members eligible for a meetup suggestion at a given event:
 * - Same state as the event
 * - Not already invited
 */
export function filterNearbyStaff(
  staff: StaffPerson[],
  event: EventLocation,
  invitedIds: Set<number>
): StaffPerson[] {
  return staff.filter(
    (s) =>
      s.role === 'staff' &&
      isSameState(s.homeState, event.state) &&
      !invitedIds.has(s.id)
  );
}
