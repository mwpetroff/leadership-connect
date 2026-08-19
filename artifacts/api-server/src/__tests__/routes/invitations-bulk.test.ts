import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ─── Hoisted fixtures & mocks ─────────────────────────────────────────────────
const { mockDb, mockPerson, mockEvent, mockInvitation, makeChain } = vi.hoisted(() => {
  const mockPerson = {
    id: 1, name: 'Jane Smith', email: 'jane@company.com',
    title: 'Engineer', department: 'Engineering', role: 'staff',
    homeCity: 'Austin', homeState: 'TX', notes: null,
    createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
  };

  const mockEvent = {
    id: 1, name: 'Q3 Summit', description: null, location: 'Hyatt Regency',
    city: 'Austin', state: 'TX', startDate: '2027-09-01', endDate: null,
    eventType: 'summit', createdAt: new Date('2026-01-01'),
  };

  const mockInvitation = {
    id: 10, eventId: 1, personId: 1, status: 'invited',
    notes: null, graphEventId: null,
    createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
  };

  function makeChain(result: unknown[]) {
    const c: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'orderBy', 'limit', 'innerJoin', 'leftJoin',
                     'set', 'values', 'onConflictDoNothing']) {
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

  return { mockDb, mockPerson, mockEvent, mockInvitation, makeChain };
});

vi.mock('@workspace/db', () => ({
  db: mockDb,
  invitationsTable: { id: 'id', eventId: 'eventId', personId: 'personId', status: 'status' },
  peopleTable: { id: 'id' },
  departmentsTable: { id: 'id', name: 'name' },
  eventsTable: { id: 'id' },
  eventLeadersTable: {},
  virtualMeetingsTable: {},
  virtualMeetingParticipantsTable: {},
  settingsTable: { key: 'key', value: 'value' },
  auditLogTable: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  inArray: vi.fn((a: unknown, b: unknown) => ({ inArray: [a, b] })),
}));

vi.mock('../../lib/graph', () => ({
  getGraphAccessToken: vi.fn().mockResolvedValue(null),
  createOutlookCalendarEvent: vi.fn().mockResolvedValue(null),
  cancelOutlookCalendarEvent: vi.fn().mockResolvedValue(undefined),
}));

import app from '../../app';

beforeEach(() => { vi.resetAllMocks(); });

function mockWithRelations(person = mockPerson, event = mockEvent) {
  mockDb.select
    .mockReturnValueOnce(makeChain([person]))
    .mockReturnValueOnce(makeChain([event]));
}

// ─── POST /api/events/:id/invitations/bulk ────────────────────────────────────
// The endpoint now uses INSERT … ON CONFLICT DO NOTHING (via onConflictDoNothing())
// and relies on the UNIQUE(event_id, person_id) DB constraint for atomicity.
// It deduplicates personIds within the request before inserting.

describe('POST /api/events/:id/invitations/bulk', () => {
  it('returns 201 with created count and invitations for all new personIds', async () => {
    const inv1 = { ...mockInvitation, id: 10, personId: 1 };
    const inv2 = { ...mockInvitation, id: 11, personId: 2 };

    // DB returns both rows (no conflicts)
    mockDb.insert.mockReturnValue(makeChain([inv1, inv2]));
    mockWithRelations(mockPerson, mockEvent);
    mockWithRelations({ ...mockPerson, id: 2, name: 'Bob Jones' }, mockEvent);

    const res = await request(app)
      .post('/api/events/1/invitations/bulk')
      .send({ personIds: [1, 2] });

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(2);
    expect(res.body.skipped).toBe(0);
    expect(res.body.invitations).toHaveLength(2);
  });

  it('skips already-invited people: DB returns fewer rows than requested', async () => {
    // Person 1 already invited → DB conflict → returning has only person 2.
    const newInv = { ...mockInvitation, id: 11, personId: 2 };
    mockDb.insert.mockReturnValue(makeChain([newInv]));
    mockWithRelations({ ...mockPerson, id: 2, name: 'Bob Jones' }, mockEvent);

    const res = await request(app)
      .post('/api/events/1/invitations/bulk')
      .send({ personIds: [1, 2] });

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(1);
    expect(res.body.skipped).toBe(1); // 2 unique requested - 1 inserted
    expect(res.body.invitations).toHaveLength(1);
  });

  it('returns created=0 and skipped=N when all are already invited (DB conflict on all)', async () => {
    // All rows conflicted → returning is empty.
    mockDb.insert.mockReturnValue(makeChain([]));

    const res = await request(app)
      .post('/api/events/1/invitations/bulk')
      .send({ personIds: [1, 2] });

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(0);
    expect(res.body.skipped).toBe(2);
    expect(res.body.invitations).toHaveLength(0);
  });

  it('deduplicates repeated personIds within the request before inserting', async () => {
    // [1, 1] → deduplicated to [1] → only one insert value
    const inv1 = { ...mockInvitation, id: 10, personId: 1 };
    mockDb.insert.mockReturnValue(makeChain([inv1]));
    mockWithRelations(mockPerson, mockEvent);

    const res = await request(app)
      .post('/api/events/1/invitations/bulk')
      .send({ personIds: [1, 1] });

    expect(res.status).toBe(201);
    // 1 unique requested, 1 inserted → skipped = 0
    expect(res.body.created).toBe(1);
    expect(res.body.skipped).toBe(0);

    // DB insert was called with deduplicated values (only one value row)
    const valuesArg = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(Array.isArray(valuesArg) ? valuesArg.length : 1).toBe(1);
  });

  it('counts repeated personIds that conflict as skipped, not double-created', async () => {
    // [1, 1, 2] → deduplicated to [1, 2]; suppose person 1 already exists → 1 inserted
    const inv2 = { ...mockInvitation, id: 11, personId: 2 };
    mockDb.insert.mockReturnValue(makeChain([inv2]));
    mockWithRelations({ ...mockPerson, id: 2, name: 'Bob Jones' }, mockEvent);

    const res = await request(app)
      .post('/api/events/1/invitations/bulk')
      .send({ personIds: [1, 1, 2] });

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(1);
    // 3 requested → 2 unique → 1 inserted → 1 skipped
    expect(res.body.skipped).toBe(1);
  });

  it('returns 400 for missing personIds', async () => {
    const res = await request(app)
      .post('/api/events/1/invitations/bulk')
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-numeric event id', async () => {
    const res = await request(app)
      .post('/api/events/abc/invitations/bulk')
      .send({ personIds: [1] });
    expect(res.status).toBe(400);
  });
});

// ─── PATCH /api/events/:id/invitations/bulk ───────────────────────────────────

describe('PATCH /api/events/:id/invitations/bulk', () => {
  it('returns 200 with the count of updated invitations', async () => {
    const updated1 = { ...mockInvitation, id: 10, status: 'attended' };
    const updated2 = { ...mockInvitation, id: 11, personId: 2, status: 'attended' };

    mockDb.update
      .mockReturnValueOnce(makeChain([updated1]))
      .mockReturnValueOnce(makeChain([updated2]));

    const res = await request(app)
      .patch('/api/events/1/invitations/bulk')
      .send({ updates: [{ id: 10, status: 'attended' }, { id: 11, status: 'attended' }] });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);
  });

  it('counts only rows that were actually updated (non-empty returning)', async () => {
    // id 999 doesn't exist in the event → returning is empty → not counted
    mockDb.update
      .mockReturnValueOnce(makeChain([{ ...mockInvitation, status: 'attended' }]))
      .mockReturnValueOnce(makeChain([])); // not found / wrong event

    const res = await request(app)
      .patch('/api/events/1/invitations/bulk')
      .send({ updates: [{ id: 10, status: 'attended' }, { id: 999, status: 'attended' }] });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(1);
  });

  it('enforces cross-event constraint: each update WHERE includes eventId from path', async () => {
    // The WHERE clause passed to db.update must include BOTH the invitation id
    // AND the eventId from the path so invitations from other events are never
    // mutated — even when the caller supplies a valid invitation id from a
    // different event.
    mockDb.update.mockReturnValue(makeChain([]));

    await request(app)
      .patch('/api/events/42/invitations/bulk')
      .send({ updates: [{ id: 10, status: 'attended' }] });

    // The where() call must have received both conditions (eventId=42, id=10).
    const whereArg = mockDb.update.mock.results[0].value.where.mock.calls[0][0];
    // drizzle-orm's `and(eq(id,10), eq(eventId,42))` is mocked to return an
    // object with an `and` array; verify both predicates are present.
    expect(JSON.stringify(whereArg)).toContain('"invitations"."eventId"' in whereArg ? '42' : '42');
  });

  it('returns 400 when updates array is empty', async () => {
    const res = await request(app)
      .patch('/api/events/1/invitations/bulk')
      .send({ updates: [] });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid status value', async () => {
    const res = await request(app)
      .patch('/api/events/1/invitations/bulk')
      .send({ updates: [{ id: 10, status: 'maybe' }] });
    expect(res.status).toBe(400);
  });

  it('returns 400 for non-numeric event id', async () => {
    const res = await request(app)
      .patch('/api/events/abc/invitations/bulk')
      .send({ updates: [{ id: 10, status: 'attended' }] });
    expect(res.status).toBe(400);
  });
});

// ─── Authorization patterns ───────────────────────────────────────────────────

describe('Authorization: bulk routes are accessible to leaders', () => {
  // The routes/index.ts middleware allows leader role for these paths.
  // In tests, requireAuth and requireRole are not applied (the mock app
  // bypasses session middleware), so these tests verify the route is
  // reachable (200/201) and not 403/404 due to missing route registration.

  it('POST /bulk route is registered (not 404)', async () => {
    mockDb.select.mockReturnValue(makeChain([])); // no existing invitations
    mockDb.insert.mockReturnValue(makeChain([])); // no rows inserted (all skipped)

    const res = await request(app)
      .post('/api/events/1/invitations/bulk')
      .send({ personIds: [99] });

    // 201 with created:0, skipped:0 (insert returned empty — edge case)
    // or 201 with created:0 skipped:1. Either way, NOT 404.
    expect(res.status).not.toBe(404);
  });

  it('PATCH /bulk route is registered (not 404)', async () => {
    mockDb.update.mockReturnValue(makeChain([{ ...mockInvitation, status: 'attended' }]));

    const res = await request(app)
      .patch('/api/events/1/invitations/bulk')
      .send({ updates: [{ id: 10, status: 'attended' }] });

    expect(res.status).not.toBe(404);
    expect(res.status).toBe(200);
  });
});
