import { describe, it, expect, vi, beforeEach } from 'vitest';

// Reset all mocks before every test so Once-queue values don't bleed across
// describe blocks (e.g. POST beforeEach leaving unconsumed queued values).
beforeEach(() => { vi.resetAllMocks(); });
import request from 'supertest';

// ─── Hoisted mock setup ───────────────────────────────────────────────────────
// vi.mock factories are hoisted to the top of the file before any variable
// declarations, so mockDb MUST be created with vi.hoisted() to be accessible
// inside the factory without a TDZ (temporal dead zone) error.

const { mockDb, mockPerson, makeChain } = vi.hoisted(() => {
  const mockPerson = {
    id: 1,
    name: 'Jane Smith',
    email: 'jane@company.com',
    title: 'Engineer',
    department: 'Engineering',
    role: 'staff',
    homeCity: 'Austin',
    homeState: 'TX',
    notes: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  // Builds a chainable Drizzle-style query builder.
  // Every clause method returns the same object; the terminal resolves with `result`.
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

  return { mockDb, mockPerson, makeChain };
});

vi.mock('@workspace/db', () => ({
  db: mockDb,
  peopleTable: {
    id: 'id',
    role: 'role',
    name: 'name',
    email: 'email',
    homeCity: 'homeCity',
    homeState: 'homeState',
  },
  departmentsTable: { id: 'id', name: 'name' },
  eventsTable: {
    id: 'id',
    startDate: 'startDate',
    name: 'name',
    description: 'description',
    location: 'location',
    city: 'city',
    state: 'state',
    endDate: 'endDate',
    eventType: 'eventType',
    createdAt: 'createdAt',
  },
  eventLeadersTable: {},
  invitationsTable: {
    id: 'id',
    eventId: 'eventId',
    personId: 'personId',
    status: 'status',
    notes: 'notes',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  virtualMeetingsTable: {
    id: 'id',
    status: 'status',
    scheduledDate: 'scheduledDate',
    title: 'title',
    notes: 'notes',
    hostId: 'hostId',
    createdAt: 'createdAt',
  },
  virtualMeetingParticipantsTable: {
    meetingId: 'meetingId',
    personId: 'personId',
  },
  settingsTable: { key: 'key', value: 'value' },
  auditLogTable: { id: 'id', actorId: 'actorId', actorName: 'actorName', action: 'action', resourceType: 'resourceType', resourceId: 'resourceId' },
}));

// ─── Import app after mocks are registered ────────────────────────────────────

import app from '../../app';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/people', () => {
  beforeEach(() => {
    mockDb.select.mockReturnValue(makeChain([mockPerson]));
  });

  it('returns 200 with an array', async () => {
    const res = await request(app).get('/api/people');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns people data', async () => {
    const res = await request(app).get('/api/people');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Jane Smith');
  });

  it('accepts a role query param without erroring', async () => {
    const res = await request(app).get('/api/people?role=staff');
    expect(res.status).toBe(200);
  });

  it('accepts a search query param without erroring', async () => {
    const res = await request(app).get('/api/people?search=jane');
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid role value', async () => {
    const res = await request(app).get('/api/people?role=superadmin');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/people/:id', () => {
  it('returns 200 with the person when found', async () => {
    mockDb.select.mockReturnValue(makeChain([mockPerson]));
    const res = await request(app).get('/api/people/1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
  });

  it('returns 404 when person not found', async () => {
    mockDb.select.mockReturnValue(makeChain([]));
    const res = await request(app).get('/api/people/999');
    expect(res.status).toBe(404);
  });

  it('returns 400 for non-numeric id', async () => {
    const res = await request(app).get('/api/people/abc');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/people', () => {
  beforeEach(() => {
    mockDb.insert.mockReturnValue(makeChain([mockPerson]));
  });

  const validBody = {
    name: 'Jane Smith',
    email: 'jane@company.com',
    title: 'Engineer',
    role: 'staff',
    homeCity: 'Austin',
    homeState: 'TX',
  };

  it('returns 201 with created person', async () => {
    const res = await request(app).post('/api/people').send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Jane Smith');
  });

  it('returns 400 when name is missing', async () => {
    const { name: _n, ...body } = validBody;
    const res = await request(app).post('/api/people').send(body);
    expect(res.status).toBe(400);
  });

  it('returns 400 when email is missing', async () => {
    const { email: _e, ...body } = validBody;
    const res = await request(app).post('/api/people').send(body);
    expect(res.status).toBe(400);
  });

  it('returns 400 when role is invalid', async () => {
    const res = await request(app).post('/api/people').send({ ...validBody, role: 'superadmin' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/people/:id', () => {
  it('returns 200 with updated person', async () => {
    mockDb.select.mockReturnValue(makeChain([mockPerson]));
    mockDb.update.mockReturnValue(makeChain([{ ...mockPerson, name: 'Jane Updated' }]));
    const res = await request(app).patch('/api/people/1').send({ name: 'Jane Updated' });
    expect(res.status).toBe(200);
  });

  it('returns 404 when person not found', async () => {
    // PATCH now reads before-state first (for audit log), then update returning() empty = 404.
    mockDb.select.mockReturnValueOnce(makeChain([mockPerson])); // before-state read (audit)
    mockDb.update.mockReturnValue(makeChain([]));
    const res = await request(app).patch('/api/people/999').send({ name: 'Ghost' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/people/:id', () => {
  it('returns 204 on successful delete', async () => {
    // DELETE uses delete().returning() — returning the deleted row means success.
    mockDb.delete.mockReturnValue(makeChain([mockPerson]));
    const res = await request(app).delete('/api/people/1');
    expect(res.status).toBe(204);
  });

  it('returns 404 when person not found', async () => {
    // Empty returning() means no row was deleted → 404.
    mockDb.delete.mockReturnValue(makeChain([]));
    const res = await request(app).delete('/api/people/999');
    expect(res.status).toBe(404);
  });
});

// ─── Engagement endpoint ──────────────────────────────────────────────────────

const mockInvitationWithEvent = {
  id: 10,
  eventId: 5,
  personId: 1,
  status: 'attended',
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  event: {
    id: 5,
    name: 'Austin Summit',
    description: null,
    location: 'Convention Center',
    city: 'Austin',
    state: 'TX',
    startDate: '2025-06-01',
    endDate: '2025-06-02',
    eventType: 'summit',
    createdAt: '2025-01-01T00:00:00.000Z',
  },
};

const mockVirtualMeeting = {
  id: 7,
  title: '1:1 Check-in',
  status: 'completed',
  scheduledDate: '2025-09-15',
  hostId: null,
  notes: null,
  createdAt: '2025-09-01T00:00:00.000Z',
  updatedAt: '2025-09-01T00:00:00.000Z',
};

describe('GET /api/people/:id/engagement', () => {
  it('returns 400 for non-numeric id', async () => {
    const res = await request(app).get('/api/people/abc/engagement');
    expect(res.status).toBe(400);
  });

  it('returns 404 when person not found', async () => {
    mockDb.select.mockReturnValue(makeChain([]));
    const res = await request(app).get('/api/people/999/engagement');
    expect(res.status).toBe(404);
  });

  it('returns 200 with empty engagement for a new person', async () => {
    // call 1: person lookup → found
    // call 2: invitations join → empty
    // call 3: virtual participations → empty
    mockDb.select
      .mockReturnValueOnce(makeChain([mockPerson]))  // person
      .mockReturnValueOnce(makeChain([]))             // invitations
      .mockReturnValueOnce(makeChain([]));            // participations

    const res = await request(app).get('/api/people/1/engagement');
    expect(res.status).toBe(200);
    expect(res.body.person).toMatchObject({ id: 1, name: 'Jane Smith' });
    expect(res.body.invitations).toHaveLength(0);
    expect(res.body.virtualMeetings).toHaveLength(0);
    expect(res.body.daysSinceLastTouchpoint).toBeNull();
    expect(res.body.totalInPersonAttended).toBe(0);
    expect(res.body.totalVirtualCompleted).toBe(0);
  });

  it('computes daysSinceLastTouchpoint from an attended event', async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([mockPerson]))              // person
      .mockReturnValueOnce(makeChain([mockInvitationWithEvent])) // invitations (1 attended)
      .mockReturnValueOnce(makeChain([]));                       // participations

    const res = await request(app).get('/api/people/1/engagement');
    expect(res.status).toBe(200);
    expect(res.body.totalInPersonAttended).toBe(1);
    expect(typeof res.body.daysSinceLastTouchpoint).toBe('number');
    expect(res.body.daysSinceLastTouchpoint).toBeGreaterThan(0);
  });

  it('includes virtual meetings when the person is a participant', async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([mockPerson]))               // person
      .mockReturnValueOnce(makeChain([]))                          // invitations
      .mockReturnValueOnce(makeChain([{ meetingId: 7 }]))         // participations
      .mockReturnValueOnce(makeChain([mockVirtualMeeting]));      // virtual meetings (meetingIds.length===1)

    const res = await request(app).get('/api/people/1/engagement');
    expect(res.status).toBe(200);
    expect(res.body.virtualMeetings).toHaveLength(1);
    expect(res.body.totalVirtualCompleted).toBe(1);
    expect(typeof res.body.daysSinceLastTouchpoint).toBe('number');
  });

  it('ignores non-attended invitations for daysSinceLastTouchpoint', async () => {
    const pendingInv = { ...mockInvitationWithEvent, status: 'invited' };
    mockDb.select
      .mockReturnValueOnce(makeChain([mockPerson]))    // person
      .mockReturnValueOnce(makeChain([pendingInv]))    // invitation (invited, not attended)
      .mockReturnValueOnce(makeChain([]));             // participations

    const res = await request(app).get('/api/people/1/engagement');
    expect(res.status).toBe(200);
    // 'invited' status doesn't count as a touchpoint
    expect(res.body.daysSinceLastTouchpoint).toBeNull();
    expect(res.body.totalInPersonAttended).toBe(0);
  });
});
