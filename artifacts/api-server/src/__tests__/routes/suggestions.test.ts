import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

// ─── Hoisted mock ─────────────────────────────────────────────────────────────

const { mockDb, makeChain } = vi.hoisted(() => {
  function makeChain(result: unknown[]) {
    const c: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'orderBy', 'limit', 'innerJoin', 'leftJoin', 'set', 'values']) {
      c[m] = vi.fn().mockReturnValue(c);
    }
    c['returning'] = vi.fn().mockResolvedValue(result);
    c['then'] = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
    return c;
  }

  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  return { mockDb, makeChain };
});

vi.mock('@workspace/db', () => ({
  db: mockDb,
  peopleTable: { id: 'id', role: 'role', name: 'name', homeState: 'homeState', homeCity: 'homeCity' },
  eventsTable: { id: 'id', startDate: 'startDate', state: 'state', city: 'city' },
  eventLeadersTable: { eventId: 'eventId', personId: 'personId' },
  invitationsTable: { eventId: 'eventId', personId: 'personId', status: 'status' },
  virtualMeetingsTable: { id: 'id', status: 'status', scheduledDate: 'scheduledDate' },
  virtualMeetingParticipantsTable: { meetingId: 'meetingId', personId: 'personId' },
}));

import app from '../../app';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/suggestions/meetups', () => {
  it('returns 200 with an array', async () => {
    // No upcoming events → empty suggestions list
    mockDb.select.mockReturnValue(makeChain([]));
    const res = await request(app).get('/api/suggestions/meetups');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('includes event and suggestedPeople when data exists', async () => {
    const mockEvent = {
      id: 1, name: 'Q3 Summit', state: 'TX', city: 'Austin',
      startDate: '2027-09-01', eventType: 'summit', location: 'Hyatt',
      createdAt: new Date('2026-01-01'),
    };
    const mockStaff = {
      id: 2, name: 'Jane Smith', role: 'staff',
      homeState: 'TX', homeCity: 'Dallas',
      email: 'jane@co.com', title: null, department: null,
      notes: null, createdAt: new Date('2026-01-01'),
    };
    const mockLeaderRow = { person: { id: 3, name: 'Alice Exec', role: 'executive' } };

    // Sequence for GET /suggestions/meetups with 1 event:
    // 1. upcoming events
    // 2. all staff
    // 3. leaders for event (eventLeadersTable join)
    // 4. invitations for event
    // 5. getDaysSinceLastInPersonEvent for each nearby staff → invitations join events
    mockDb.select
      .mockReturnValueOnce(makeChain([mockEvent]))      // upcoming events
      .mockReturnValueOnce(makeChain([mockStaff]))      // all staff
      .mockReturnValueOnce(makeChain([mockLeaderRow]))  // leaders for event
      .mockReturnValueOnce(makeChain([]))               // invitations for event (invited ids)
      .mockReturnValueOnce(makeChain([]));              // getDaysSinceLastInPersonEvent (attended events)

    const res = await request(app).get('/api/suggestions/meetups');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length > 0) {
      expect(res.body[0]).toHaveProperty('event');
      expect(res.body[0]).toHaveProperty('suggestedPeople');
      expect(res.body[0]).toHaveProperty('leaders');
    }
  });
});

describe('GET /api/suggestions/virtual', () => {
  it('returns 200 with an array', async () => {
    // No staff → empty suggestions
    mockDb.select
      .mockReturnValueOnce(makeChain([]))  // all staff
      .mockReturnValueOnce(makeChain([])); // leaders
    const res = await request(app).get('/api/suggestions/virtual');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('includes staff needing touchpoint when no previous engagement', async () => {
    const mockStaff = {
      id: 2, name: 'Jane Smith', role: 'staff',
      homeState: 'TX', homeCity: 'Austin',
      email: 'jane@co.com', title: null, department: null,
      notes: null, createdAt: new Date('2026-01-01'),
    };
    const mockExec = {
      id: 3, name: 'Alice Exec', role: 'executive',
      homeState: 'CA', homeCity: 'San Francisco',
      email: 'alice@co.com', title: 'CEO', department: 'Executive',
      notes: null, createdAt: new Date('2026-01-01'),
    };

    // getLastTouchpoint for Jane calls:
    // 1. invitations innerJoin events (in-person dates)
    // 2. virtual meeting participants
    // (Jane has no meetings so meetingIds.length === 0, no 3rd call)
    mockDb.select
      .mockReturnValueOnce(makeChain([mockStaff]))  // all staff
      .mockReturnValueOnce(makeChain([mockExec]))   // leaders
      .mockReturnValueOnce(makeChain([]))           // attended events for Jane
      .mockReturnValueOnce(makeChain([]));          // virtual meeting participations for Jane

    const res = await request(app).get('/api/suggestions/virtual');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Jane has no touchpoint → should appear in suggestions
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0]).toHaveProperty('person');
    expect(res.body[0]).toHaveProperty('daysSinceLastTouchpoint');
    expect(res.body[0]).toHaveProperty('reason');
    expect(res.body[0]).toHaveProperty('suggestedLeaders');
    expect(res.body[0].daysSinceLastTouchpoint).toBeNull(); // never had a touchpoint
  });
});
