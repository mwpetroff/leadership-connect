/**
 * Pure-logic unit tests for the suggestion matching rules.
 * These test the core business rules in isolation, without hitting the DB.
 */

import { describe, it, expect } from 'vitest';

// ─── Extracted pure logic (mirrors suggestions.ts) ───────────────────────────

const NEEDS_TOUCHPOINT_DAYS = 90;

/** Returns true if the person is in the same state as the event. */
function isSameState(personState: string, eventState: string): boolean {
  return personState.toLowerCase() === eventState.toLowerCase();
}

/** Returns true if the person is in the same city as the event. */
function isSameCity(personCity: string, eventCity: string): boolean {
  return personCity.toLowerCase() === eventCity.toLowerCase();
}

/** Returns true if a staff member qualifies for a virtual touchpoint suggestion. */
function needsVirtualTouchpoint(daysSinceLastTouchpoint: number | null): boolean {
  return daysSinceLastTouchpoint === null || daysSinceLastTouchpoint >= NEEDS_TOUCHPOINT_DAYS;
}

/** Comparator: sort staff by engagement gap (null = never engaged → top). */
function sortByEngagementGap(
  a: { days: number | null },
  b: { days: number | null }
): number {
  if (a.days === null && b.days === null) return 0;
  if (a.days === null) return -1;
  if (b.days === null) return 1;
  return b.days - a.days; // larger gap first
}

/** Filter staff eligible for a meetup at this event. */
function filterNearbyStaff(
  staff: { id: number; homeState: string; homeCity: string; role: string }[],
  event: { state: string; city: string },
  invitedIds: Set<number>
): { id: number; homeState: string; homeCity: string; role: string }[] {
  return staff.filter(
    (s) =>
      s.role === 'staff' &&
      isSameState(s.homeState, event.state) &&
      !invitedIds.has(s.id)
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('isSameState', () => {
  it('matches exact same state', () => {
    expect(isSameState('TX', 'TX')).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(isSameState('tx', 'TX')).toBe(true);
    expect(isSameState('NY', 'ny')).toBe(true);
  });

  it('returns false for different states', () => {
    expect(isSameState('TX', 'CA')).toBe(false);
    expect(isSameState('NY', 'FL')).toBe(false);
  });
});

describe('isSameCity', () => {
  it('matches exact same city', () => {
    expect(isSameCity('Austin', 'Austin')).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(isSameCity('austin', 'Austin')).toBe(true);
    expect(isSameCity('New York', 'new york')).toBe(true);
  });

  it('returns false for different cities', () => {
    expect(isSameCity('Austin', 'Dallas')).toBe(false);
    expect(isSameCity('Houston', 'San Antonio')).toBe(false);
  });
});

describe('needsVirtualTouchpoint', () => {
  it('returns true when days is null (never engaged)', () => {
    expect(needsVirtualTouchpoint(null)).toBe(true);
  });

  it('returns true when days equals the threshold exactly', () => {
    expect(needsVirtualTouchpoint(90)).toBe(true);
  });

  it('returns true when days exceed the threshold', () => {
    expect(needsVirtualTouchpoint(91)).toBe(true);
    expect(needsVirtualTouchpoint(365)).toBe(true);
  });

  it('returns false when days are below the threshold', () => {
    expect(needsVirtualTouchpoint(89)).toBe(false);
    expect(needsVirtualTouchpoint(0)).toBe(false);
    expect(needsVirtualTouchpoint(45)).toBe(false);
  });
});

describe('sortByEngagementGap', () => {
  it('puts null (never engaged) before any numeric gap', () => {
    const list = [{ days: 30 }, { days: null }, { days: 60 }];
    list.sort(sortByEngagementGap);
    expect(list[0].days).toBeNull();
  });

  it('sorts larger gaps before smaller ones', () => {
    const list = [{ days: 30 }, { days: 120 }, { days: 60 }];
    list.sort(sortByEngagementGap);
    expect(list[0].days).toBe(120);
    expect(list[1].days).toBe(60);
    expect(list[2].days).toBe(30);
  });

  it('handles two nulls as equal', () => {
    expect(sortByEngagementGap({ days: null }, { days: null })).toBe(0);
  });

  it('puts null before 0-day gap', () => {
    expect(sortByEngagementGap({ days: null }, { days: 0 })).toBe(-1);
  });
});

describe('filterNearbyStaff', () => {
  const staff = [
    { id: 1, role: 'staff', homeCity: 'Austin', homeState: 'TX' },
    { id: 2, role: 'staff', homeCity: 'Dallas', homeState: 'TX' },
    { id: 3, role: 'staff', homeCity: 'Los Angeles', homeState: 'CA' },
    { id: 4, role: 'executive', homeCity: 'Austin', homeState: 'TX' },
    { id: 5, role: 'secondary_leader', homeCity: 'Houston', homeState: 'TX' },
  ];
  const event = { state: 'TX', city: 'Austin' };

  it('includes only staff in the same state', () => {
    const result = filterNearbyStaff(staff, event, new Set());
    expect(result.map((s) => s.id)).toEqual(expect.arrayContaining([1, 2]));
    expect(result.some((s) => s.id === 3)).toBe(false); // CA excluded
  });

  it('excludes executives and secondary leaders', () => {
    const result = filterNearbyStaff(staff, event, new Set());
    expect(result.some((s) => s.role !== 'staff')).toBe(false);
  });

  it('excludes already-invited staff', () => {
    const result = filterNearbyStaff(staff, event, new Set([1]));
    expect(result.some((s) => s.id === 1)).toBe(false);
    expect(result.some((s) => s.id === 2)).toBe(true);
  });

  it('returns empty array when no nearby staff', () => {
    const result = filterNearbyStaff(staff, { state: 'FL', city: 'Miami' }, new Set());
    expect(result).toHaveLength(0);
  });

  it('returns empty when all nearby staff are already invited', () => {
    const result = filterNearbyStaff(staff, event, new Set([1, 2]));
    expect(result).toHaveLength(0);
  });
});
