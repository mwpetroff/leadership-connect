/**
 * Pure-logic unit tests for the suggestion engine.
 *
 * These import and exercise the REAL exported functions from
 * src/lib/suggestion-logic.ts — no local mirrors or stubs.
 * Any change to the production matching rules will be caught here.
 */

import { describe, it, expect } from 'vitest';
import {
  NEEDS_TOUCHPOINT_DAYS,
  isSameState,
  isSameCity,
  needsVirtualTouchpoint,
  sortByEventGap,
  sortByTouchpointGap,
  filterNearbyStaff,
} from '../lib/suggestion-logic';

// ─── isSameState ─────────────────────────────────────────────────────────────

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

// ─── isSameCity ──────────────────────────────────────────────────────────────

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

// ─── needsVirtualTouchpoint ──────────────────────────────────────────────────

describe('needsVirtualTouchpoint', () => {
  it(`uses ${NEEDS_TOUCHPOINT_DAYS} days as the threshold`, () => {
    expect(needsVirtualTouchpoint(NEEDS_TOUCHPOINT_DAYS)).toBe(true);    // exactly at threshold
    expect(needsVirtualTouchpoint(NEEDS_TOUCHPOINT_DAYS - 1)).toBe(false); // one day under
  });

  it('returns true when days is null (never engaged)', () => {
    expect(needsVirtualTouchpoint(null)).toBe(true);
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

// ─── sortByEventGap ──────────────────────────────────────────────────────────

describe('sortByEventGap', () => {
  it('puts null (never attended) before any numeric gap', () => {
    const list = [
      { daysSinceLastEvent: 30 },
      { daysSinceLastEvent: null },
      { daysSinceLastEvent: 60 },
    ];
    list.sort(sortByEventGap);
    expect(list[0].daysSinceLastEvent).toBeNull();
  });

  it('sorts larger gaps before smaller ones', () => {
    const list = [
      { daysSinceLastEvent: 30 },
      { daysSinceLastEvent: 120 },
      { daysSinceLastEvent: 60 },
    ];
    list.sort(sortByEventGap);
    expect(list[0].daysSinceLastEvent).toBe(120);
    expect(list[1].daysSinceLastEvent).toBe(60);
    expect(list[2].daysSinceLastEvent).toBe(30);
  });

  it('handles two nulls as equal', () => {
    expect(sortByEventGap({ daysSinceLastEvent: null }, { daysSinceLastEvent: null })).toBe(0);
  });

  it('puts null before 0-day gap', () => {
    expect(sortByEventGap({ daysSinceLastEvent: null }, { daysSinceLastEvent: 0 })).toBe(-1);
  });

  it('puts b-null before a-numeric (b rises)', () => {
    expect(sortByEventGap({ daysSinceLastEvent: 10 }, { daysSinceLastEvent: null })).toBe(1);
  });
});

// ─── sortByTouchpointGap ─────────────────────────────────────────────────────

describe('sortByTouchpointGap', () => {
  it('puts null (never touched) before any numeric gap', () => {
    const list = [{ days: 30 }, { days: null }, { days: 60 }];
    list.sort(sortByTouchpointGap);
    expect(list[0].days).toBeNull();
  });

  it('sorts larger gaps before smaller ones', () => {
    const list = [{ days: 30 }, { days: 120 }, { days: 60 }];
    list.sort(sortByTouchpointGap);
    expect(list[0].days).toBe(120);
    expect(list[1].days).toBe(60);
    expect(list[2].days).toBe(30);
  });

  it('handles two nulls as equal', () => {
    expect(sortByTouchpointGap({ days: null }, { days: null })).toBe(0);
  });

  it('puts null before 0-day gap', () => {
    expect(sortByTouchpointGap({ days: null }, { days: 0 })).toBe(-1);
  });

  it('puts b-null before a-numeric', () => {
    expect(sortByTouchpointGap({ days: 10 }, { days: null })).toBe(1);
  });
});

// ─── filterNearbyStaff ───────────────────────────────────────────────────────

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
    const ids = result.map((s) => s.id);
    expect(ids).toContain(1);
    expect(ids).toContain(2);
    expect(ids).not.toContain(3); // CA excluded
  });

  it('excludes executives and secondary leaders', () => {
    const result = filterNearbyStaff(staff, event, new Set());
    expect(result.every((s) => s.role === 'staff')).toBe(true);
  });

  it('excludes already-invited staff', () => {
    const result = filterNearbyStaff(staff, event, new Set([1]));
    const ids = result.map((s) => s.id);
    expect(ids).not.toContain(1);
    expect(ids).toContain(2);
  });

  it('returns empty array when no nearby staff match the state', () => {
    const result = filterNearbyStaff(staff, { state: 'FL', city: 'Miami' }, new Set());
    expect(result).toHaveLength(0);
  });

  it('returns empty when all nearby staff are already invited', () => {
    const result = filterNearbyStaff(staff, event, new Set([1, 2]));
    expect(result).toHaveLength(0);
  });

  it('filters case-insensitively', () => {
    const result = filterNearbyStaff(staff, { state: 'tx', city: 'austin' }, new Set());
    expect(result.map((s) => s.id)).toContain(1);
  });
});
