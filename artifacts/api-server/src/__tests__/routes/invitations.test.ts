import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ─── Hoisted fixtures & mocks ─────────────────────────────────────────────────
// All vi.hoisted() calls must be merged into one block so Vitest hoists them
// before the module imports below.

const { mockDb, mockPerson, mockEvent, mockInvitation, makeChain, mockGraph } = vi.hoisted(() => {
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
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  const mockEvent = {
    id: 1,
    name: 'Q3 Summit',
    description: null,
    location: 'Hyatt Regency',
    city: 'Austin',
    state: 'TX',
    startDate: '2027-09-01',
    endDate: null,
    eventType: 'summit',
    createdAt: new Date('2026-01-01'),
  };

  const mockInvitation = {
    id: 10,
    eventId: 1,
    personId: 1,
    status: 'invited',
    notes: null,
    graphEventId: null,     // no Outlook calendar event attached
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

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

  // Graph library mock — default impl returns null/undefined so Graph calls
  // are silently skipped unless a test explicitly sets up a token.
  const mockGraph = {
    getGraphAccessToken: vi.fn().mockResolvedValue(null),
    createOutlookCalendarEvent: vi.fn().mockResolvedValue(null),
    cancelOutlookCalendarEvent: vi.fn().mockResolvedValue(undefined),
  };

  return { mockDb, mockPerson, mockEvent, mockInvitation, makeChain, mockGraph };
});

vi.mock('@workspace/db', () => ({
  db: mockDb,
  invitationsTable: { id: 'id', eventId: 'eventId', personId: 'personId', status: 'status' },
  peopleTable: { id: 'id' },
  departmentsTable: { id: 'id', name: 'name' },
  eventsTable: { id: 'id' },
  settingsTable: { key: 'key', value: 'value' },
  auditLogTable: { id: 'id', actorId: 'actorId', actorName: 'actorName', action: 'action', resourceType: 'resourceType', resourceId: 'resourceId' },
}));

vi.mock('../../lib/graph', () => ({
  getGraphAccessToken: mockGraph.getGraphAccessToken,
  createOutlookCalendarEvent: mockGraph.createOutlookCalendarEvent,
  cancelOutlookCalendarEvent: mockGraph.cancelOutlookCalendarEvent,
}));

import app from '../../app';

// Reset all mocks before every test to prevent inter-test contamination.
beforeEach(() => { vi.resetAllMocks(); });

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Mock the two selects used by invitationWithRelations (person + event lookups).
 * Call this AFTER any selects consumed earlier in the route (e.g. duplicate check,
 * Graph-path selects) so the Once queue is ordered correctly.
 */
function mockWithRelations(person = mockPerson, event = mockEvent) {
  mockDb.select
    .mockReturnValueOnce(makeChain([person]))   // person lookup
    .mockReturnValueOnce(makeChain([event]));   // event lookup
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/events/:id/invitations', () => {
  it('returns 200 with an array', async () => {
    mockDb.select.mockReturnValueOnce(makeChain([mockInvitation]));
    mockWithRelations();
    const res = await request(app).get('/api/events/1/invitations');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns 400 for non-numeric event id', async () => {
    const res = await request(app).get('/api/events/abc/invitations');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/events/:id/invitations', () => {
  // Default: no Graph token → Graph path is entered (wantCalendar=true by default)
  // but getGraphAccessToken returns null (from the reset base implementation)
  // so no Graph calls execute. Selects needed: [dup, response-person, response-event].
  it('returns 201 when person is invited', async () => {
    mockDb.select.mockReturnValueOnce(makeChain([])); // no duplicate
    mockDb.insert.mockReturnValue(makeChain([mockInvitation]));
    mockWithRelations(); // response person + event
    const res = await request(app).post('/api/events/1/invitations').send({ personId: 1 });
    expect(res.status).toBe(201);
    expect(res.body.personId).toBe(1);
  });

  it('returns 409 when person is already invited', async () => {
    mockDb.select.mockReturnValueOnce(makeChain([mockInvitation])); // duplicate found
    const res = await request(app).post('/api/events/1/invitations').send({ personId: 1 });
    expect(res.status).toBe(409);
  });

  it('returns 400 when personId is missing', async () => {
    const res = await request(app).post('/api/events/1/invitations').send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/events/:id/invitations — Outlook calendar event provisioning', () => {
  // ── How the mock queue is ordered ──────────────────────────────────────────
  // When a token IS available and wantCalendar=true, the route does:
  //   1. SELECT (dup check)   2. INSERT
  //   3. SELECT person (Graph)  4. SELECT event (Graph)
  //   5. createOutlookCalendarEvent  6. UPDATE (persist graphEventId)
  //   7. SELECT person (response)    8. SELECT event (response)
  //
  // When the token is null/undefined the Graph body (3-6) is skipped:
  //   1. SELECT (dup check)   2. INSERT
  //   3. SELECT person (response)  4. SELECT event (response)
  // ──────────────────────────────────────────────────────────────────────────

  it('calls Graph and persists graphEventId when a token is available', async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([]))           // 1. duplicate check
      .mockReturnValueOnce(makeChain([mockPerson])) // 3. person for calendar invite
      .mockReturnValueOnce(makeChain([mockEvent]))  // 4. event for calendar invite
      .mockReturnValueOnce(makeChain([mockPerson])) // 7. person for response
      .mockReturnValueOnce(makeChain([mockEvent])); // 8. event for response
    mockDb.insert.mockReturnValue(makeChain([mockInvitation]));
    mockDb.update.mockReturnValue(makeChain([])); // persist graphEventId

    mockGraph.getGraphAccessToken.mockResolvedValueOnce('test-token');
    mockGraph.createOutlookCalendarEvent.mockResolvedValueOnce('cal-event-abc123');

    const res = await request(app)
      .post('/api/events/1/invitations')
      .send({ personId: 1 });

    expect(res.status).toBe(201);
    expect(mockGraph.createOutlookCalendarEvent).toHaveBeenCalledOnce();
    // Confirm graphEventId was persisted via a DB update
    expect(mockDb.update).toHaveBeenCalled();
  });

  it('returns 201 and skips Graph gracefully when the token is unavailable', async () => {
    // After vi.resetAllMocks(), getGraphAccessToken returns null (base impl).
    // The Graph body is entered (wantCalendar=true by default) but the token
    // check fails, so no DB person/event selects run inside the Graph block.
    mockDb.select
      .mockReturnValueOnce(makeChain([]))           // 1. duplicate check
      .mockReturnValueOnce(makeChain([mockPerson])) // 3. person for response
      .mockReturnValueOnce(makeChain([mockEvent])); // 4. event for response
    mockDb.insert.mockReturnValue(makeChain([mockInvitation]));
    // leave getGraphAccessToken unset → returns null (hoisted default after reset?
    // Actually vi.resetAllMocks clears mockResolvedValue, leaving fn → undefined.
    // undefined is falsy, so the token check fails the same way null would.)

    const res = await request(app)
      .post('/api/events/1/invitations')
      .send({ personId: 1 });

    expect(res.status).toBe(201);
    expect(mockGraph.createOutlookCalendarEvent).not.toHaveBeenCalled();
  });

  it('returns 201 and skips Graph when createCalendarEvent is explicitly false', async () => {
    // When createCalendarEvent=false the wantCalendar guard is false so
    // getGraphAccessToken is never called — even if a token would be available.
    mockDb.select
      .mockReturnValueOnce(makeChain([]))           // 1. duplicate check
      .mockReturnValueOnce(makeChain([mockPerson])) // 3. person for response
      .mockReturnValueOnce(makeChain([mockEvent])); // 4. event for response
    mockDb.insert.mockReturnValue(makeChain([mockInvitation]));
    // Make a token available so any accidental Graph call would be detectable.
    mockGraph.getGraphAccessToken.mockResolvedValue('would-be-token');

    const res = await request(app)
      .post('/api/events/1/invitations')
      .send({ personId: 1, createCalendarEvent: false });

    expect(res.status).toBe(201);
    expect(mockGraph.getGraphAccessToken).not.toHaveBeenCalled();
    expect(mockGraph.createOutlookCalendarEvent).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/invitations/:id', () => {
  it('returns 200 with updated invitation', async () => {
    const updated = { ...mockInvitation, status: 'attended' };
    mockDb.select.mockReturnValueOnce(makeChain([mockInvitation])); // before-state read (audit)
    mockDb.update.mockReturnValue(makeChain([updated]));
    mockWithRelations();
    const res = await request(app).patch('/api/invitations/10').send({ status: 'attended' });
    expect(res.status).toBe(200);
  });

  it('returns 404 when not found', async () => {
    mockDb.select.mockReturnValueOnce(makeChain([mockInvitation])); // before-state read (audit)
    mockDb.update.mockReturnValue(makeChain([]));
    const res = await request(app).patch('/api/invitations/999').send({ status: 'attended' });
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid status', async () => {
    const res = await request(app).patch('/api/invitations/10').send({ status: 'maybe' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/invitations/:id', () => {
  it('returns 204 on successful delete', async () => {
    // Route pre-fetches the record (to check graphEventId) before deleting.
    mockDb.select.mockReturnValueOnce(makeChain([mockInvitation])); // pre-fetch (no graphEventId)
    mockDb.delete.mockReturnValue(makeChain([]));
    const res = await request(app).delete('/api/invitations/10');
    expect(res.status).toBe(204);
  });

  it('returns 404 when not found', async () => {
    mockDb.select.mockReturnValueOnce(makeChain([])); // pre-fetch returns empty → 404
    const res = await request(app).delete('/api/invitations/999');
    expect(res.status).toBe(404);
  });

  it('calls Graph cancel when the invitation has a graphEventId', async () => {
    const invitationWithCalEvent = { ...mockInvitation, graphEventId: 'cal-event-to-cancel' };
    mockDb.select.mockReturnValueOnce(makeChain([invitationWithCalEvent])); // pre-fetch
    mockDb.delete.mockReturnValue(makeChain([]));

    mockGraph.getGraphAccessToken.mockResolvedValueOnce('test-token');
    // cancelOutlookCalendarEvent default after reset returns undefined — that's fine.

    const res = await request(app).delete('/api/invitations/10');
    expect(res.status).toBe(204);
    expect(mockGraph.cancelOutlookCalendarEvent).toHaveBeenCalledWith(
      'test-token',
      'cal-event-to-cancel',
    );
  });
});
