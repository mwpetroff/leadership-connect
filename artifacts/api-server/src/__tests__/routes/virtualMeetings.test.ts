import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ─── Hoisted fixtures & mocks ─────────────────────────────────────────────────
// All vi.hoisted() calls must be merged into one block so Vitest hoists them
// before the module imports below.

const { mockDb, mockMeeting, mockPerson, makeChain, mockGraph } = vi.hoisted(() => {
  const mockMeeting = {
    id: 7,
    title: 'Sync with Jane',
    scheduledDate: '2027-08-15',
    status: 'scheduled',
    notes: null,
    hostId: null,          // no host — avoids extra person lookup in meetingWithMeta
    teamsJoinUrl: null,    // no Teams meeting attached
    graphMeetingId: null,  // no Graph meeting ID
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

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

  // Graph library mock (default: no token → all Graph calls silently skip)
  const mockGraph = {
    getGraphAccessToken: vi.fn().mockResolvedValue(null),
    createTeamsMeeting: vi.fn().mockResolvedValue(null),
    cancelTeamsMeeting: vi.fn().mockResolvedValue(undefined),
  };

  return { mockDb, mockMeeting, mockPerson, makeChain, mockGraph };
});

vi.mock('@workspace/db', () => ({
  db: mockDb,
  virtualMeetingsTable: { id: 'id', status: 'status', scheduledDate: 'scheduledDate' },
  virtualMeetingParticipantsTable: { meetingId: 'meetingId', personId: 'personId' },
  peopleTable: { id: 'id' },
  settingsTable: { key: 'key', value: 'value' },
  auditLogTable: { id: 'id', actorId: 'actorId', actorName: 'actorName', action: 'action', resourceType: 'resourceType', resourceId: 'resourceId' },
}));

vi.mock('../../lib/graph', () => ({
  getGraphAccessToken: mockGraph.getGraphAccessToken,
  createTeamsMeeting: mockGraph.createTeamsMeeting,
  cancelTeamsMeeting: mockGraph.cancelTeamsMeeting,
}));

import app from '../../app';

// Reset all mocks before every test to prevent Once-queue contamination.
beforeEach(() => { vi.resetAllMocks(); });

// meetingWithMeta calls db.select once (participants) + optionally once (host if hostId set)
// mockMeeting has hostId: null, so only 1 extra select
function mockMeetingSequence(meetingResult: unknown[] = [mockMeeting]) {
  mockDb.select
    .mockReturnValueOnce(makeChain(meetingResult)) // main query
    .mockReturnValueOnce(makeChain([]));           // participants (meetingWithMeta)
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/virtual-meetings', () => {
  it('returns 200 with an array', async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([mockMeeting])) // list
      .mockReturnValueOnce(makeChain([]));            // participants
    const res = await request(app).get('/api/virtual-meetings');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('accepts ?status=scheduled without erroring', async () => {
    mockDb.select.mockReturnValueOnce(makeChain([]));
    const res = await request(app).get('/api/virtual-meetings?status=scheduled');
    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid status', async () => {
    const res = await request(app).get('/api/virtual-meetings?status=unknown');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/virtual-meetings', () => {
  const validBody = { title: 'Sync with Jane', status: 'scheduled' };

  beforeEach(() => {
    // Default: insert returns the base mockMeeting (status=scheduled, no Teams data)
    mockDb.insert.mockReturnValue(makeChain([mockMeeting]));
    mockDb.select.mockReturnValue(makeChain([])); // participants in meetingWithMeta
    // Default graph mock: no token → Teams provisioning silently skipped
    mockGraph.getGraphAccessToken.mockResolvedValue(null);
  });

  it('returns 201 with created meeting', async () => {
    const res = await request(app).post('/api/virtual-meetings').send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Sync with Jane');
  });

  it('returns 400 when title is missing', async () => {
    const res = await request(app).post('/api/virtual-meetings').send({ status: 'scheduled' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when status is invalid', async () => {
    const res = await request(app).post('/api/virtual-meetings').send({ title: 'test', status: 'pending' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/virtual-meetings — Teams provisioning for directly-scheduled meetings', () => {
  it('calls Graph and persists teamsJoinUrl when created as scheduled', async () => {
    const insertedMeeting = { ...mockMeeting, status: 'scheduled', teamsJoinUrl: null, graphMeetingId: null };
    mockDb.insert.mockReturnValue(makeChain([insertedMeeting]));
    mockDb.update.mockReturnValue(makeChain([])); // persist Teams data
    mockDb.select.mockReturnValue(makeChain([])); // participants

    mockGraph.getGraphAccessToken.mockResolvedValueOnce('test-token');
    mockGraph.createTeamsMeeting.mockResolvedValueOnce({
      meetingId: 'gm-new-123',
      joinUrl: 'https://teams.microsoft.com/l/meetup-join/new',
    });

    const res = await request(app).post('/api/virtual-meetings').send({
      title: 'Leadership Sync',
      status: 'scheduled',
      scheduledDate: '2027-09-01',
    });
    expect(res.status).toBe(201);
    expect(mockGraph.createTeamsMeeting).toHaveBeenCalledOnce();
    // DB update should have been called to persist the Teams URL
    expect(mockDb.update).toHaveBeenCalled();
  });

  it('returns 201 and skips Teams gracefully when Graph token is unavailable', async () => {
    mockDb.insert.mockReturnValue(makeChain([mockMeeting]));
    mockDb.select.mockReturnValue(makeChain([])); // participants
    mockGraph.getGraphAccessToken.mockResolvedValueOnce(null);

    const res = await request(app).post('/api/virtual-meetings').send({
      title: 'Leadership Sync',
      status: 'scheduled',
    });
    expect(res.status).toBe(201);
    expect(mockGraph.createTeamsMeeting).not.toHaveBeenCalled();
  });

  it('sends RFC 3339 UTC datetimes (with Z suffix) to the Graph onlineMeetings API', async () => {
    const scheduledDate = '2027-09-15';
    const insertedMeeting = { ...mockMeeting, status: 'scheduled', scheduledDate, teamsJoinUrl: null, graphMeetingId: null };
    mockDb.insert.mockReturnValue(makeChain([insertedMeeting]));
    mockDb.update.mockReturnValue(makeChain([]));
    mockDb.select.mockReturnValue(makeChain([])); // participants

    mockGraph.getGraphAccessToken.mockResolvedValueOnce('test-token');
    mockGraph.createTeamsMeeting.mockResolvedValueOnce({
      meetingId: 'gm-utc-test',
      joinUrl: 'https://teams.microsoft.com/l/meetup-join/utc-test',
    });

    await request(app).post('/api/virtual-meetings').send({
      title: 'UTC Datetime Test',
      status: 'scheduled',
      scheduledDate,
    });

    // The payload sent to Graph must include UTC designator 'Z' so the
    // onlineMeetings API (which requires DateTimeOffset) accepts the request.
    expect(mockGraph.createTeamsMeeting).toHaveBeenCalledOnce();
    const [, payload] = mockGraph.createTeamsMeeting.mock.calls[0] as [string, { startDateTime: string; endDateTime: string }];
    expect(payload.startDateTime).toBe(`${scheduledDate}T10:00:00Z`);
    expect(payload.endDateTime).toBe(`${scheduledDate}T11:00:00Z`);
  });

  it('does not call Graph when meeting is created as suggested', async () => {
    const suggestedMeeting = { ...mockMeeting, status: 'suggested' };
    mockDb.insert.mockReturnValue(makeChain([suggestedMeeting]));
    mockDb.select.mockReturnValue(makeChain([])); // participants
    mockGraph.getGraphAccessToken.mockResolvedValueOnce('test-token');

    const res = await request(app).post('/api/virtual-meetings').send({
      title: 'Leadership Sync',
      status: 'suggested',
    });
    expect(res.status).toBe(201);
    expect(mockGraph.createTeamsMeeting).not.toHaveBeenCalled();
  });
});

describe('GET /api/virtual-meetings/:id', () => {
  it('returns 200 with the meeting', async () => {
    mockMeetingSequence();
    const res = await request(app).get('/api/virtual-meetings/7');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(7);
  });

  it('returns 404 when not found', async () => {
    mockMeetingSequence([]);
    const res = await request(app).get('/api/virtual-meetings/999');
    expect(res.status).toBe(404);
  });

  it('returns 400 for non-numeric id', async () => {
    const res = await request(app).get('/api/virtual-meetings/abc');
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/virtual-meetings/:id', () => {
  it('returns 200 with updated meeting', async () => {
    // Route pre-fetches the current record to track status changes.
    mockDb.select
      .mockReturnValueOnce(makeChain([mockMeeting]))                         // pre-fetch current record
      .mockReturnValueOnce(makeChain([]));                                   // participants (meetingWithMeta)
    mockDb.update.mockReturnValue(makeChain([{ ...mockMeeting, status: 'completed' }]));
    const res = await request(app).patch('/api/virtual-meetings/7').send({ status: 'completed' });
    expect(res.status).toBe(200);
  });

  it('returns 404 when not found', async () => {
    mockDb.select.mockReturnValueOnce(makeChain([])); // pre-fetch returns empty → 404
    const res = await request(app).patch('/api/virtual-meetings/999').send({ status: 'completed' });
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid status', async () => {
    const res = await request(app).patch('/api/virtual-meetings/7').send({ status: 'deleted' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/virtual-meetings/:id — Teams provisioning on status→scheduled', () => {
  it('calls Graph and persists Teams URL when transitioning to scheduled', async () => {
    const suggestedMeeting = { ...mockMeeting, status: 'suggested', teamsJoinUrl: null, graphMeetingId: null };
    const scheduledMeeting = { ...suggestedMeeting, status: 'scheduled' };

    mockDb.select
      .mockReturnValueOnce(makeChain([suggestedMeeting]))  // pre-fetch current record
      .mockReturnValueOnce(makeChain([]));                 // participants (meetingWithMeta)
    mockDb.update
      .mockReturnValueOnce(makeChain([scheduledMeeting]))  // status update
      .mockReturnValueOnce(makeChain([]));                 // persist Teams URL

    mockGraph.getGraphAccessToken.mockResolvedValueOnce('test-token');
    mockGraph.createTeamsMeeting.mockResolvedValueOnce({
      meetingId: 'gm-patch-456',
      joinUrl: 'https://teams.microsoft.com/l/meetup-join/patch',
    });

    const res = await request(app).patch('/api/virtual-meetings/7').send({ status: 'scheduled' });
    expect(res.status).toBe(200);
    expect(mockGraph.createTeamsMeeting).toHaveBeenCalledOnce();
    // The persisting update should have been called (two update calls total)
    expect(mockDb.update).toHaveBeenCalledTimes(2);
  });

  it('returns 200 and skips Teams gracefully when Graph token is unavailable', async () => {
    const suggestedMeeting = { ...mockMeeting, status: 'suggested', teamsJoinUrl: null, graphMeetingId: null };
    mockDb.select
      .mockReturnValueOnce(makeChain([suggestedMeeting]))
      .mockReturnValueOnce(makeChain([]));
    mockDb.update.mockReturnValue(makeChain([{ ...suggestedMeeting, status: 'scheduled' }]));
    mockGraph.getGraphAccessToken.mockResolvedValueOnce(null);

    const res = await request(app).patch('/api/virtual-meetings/7').send({ status: 'scheduled' });
    expect(res.status).toBe(200);
    expect(mockGraph.createTeamsMeeting).not.toHaveBeenCalled();
  });

  it('does not call Graph when status stays the same', async () => {
    // Completing an already-completed meeting should not touch Teams
    const completedMeeting = { ...mockMeeting, status: 'completed', teamsJoinUrl: null, graphMeetingId: null };
    mockDb.select
      .mockReturnValueOnce(makeChain([completedMeeting]))
      .mockReturnValueOnce(makeChain([]));
    mockDb.update.mockReturnValue(makeChain([{ ...completedMeeting, notes: 'Great call' }]));
    mockGraph.getGraphAccessToken.mockResolvedValueOnce('test-token');

    const res = await request(app).patch('/api/virtual-meetings/7').send({ notes: 'Great call' });
    expect(res.status).toBe(200);
    expect(mockGraph.createTeamsMeeting).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/virtual-meetings/:id — cancellation clears Teams IDs', () => {
  it('clears teamsJoinUrl and graphMeetingId when transitioning to cancelled', async () => {
    const scheduledMeeting = {
      ...mockMeeting,
      status: 'scheduled',
      teamsJoinUrl: 'https://teams.ms/join/existing',
      graphMeetingId: 'gm-existing',
    };
    const cancelledMeeting = { ...scheduledMeeting, status: 'cancelled' };

    mockDb.select
      .mockReturnValueOnce(makeChain([scheduledMeeting])) // pre-fetch current
      .mockReturnValueOnce(makeChain([]));                // participants (meetingWithMeta)
    mockDb.update
      .mockReturnValueOnce(makeChain([cancelledMeeting])) // status update
      .mockReturnValueOnce(makeChain([]));                // clear Teams IDs

    mockGraph.getGraphAccessToken.mockResolvedValueOnce('test-token');
    mockGraph.cancelTeamsMeeting.mockResolvedValueOnce(undefined);

    const res = await request(app).patch('/api/virtual-meetings/7').send({ status: 'cancelled' });
    expect(res.status).toBe(200);
    // Teams cancel should have been attempted
    expect(mockGraph.cancelTeamsMeeting).toHaveBeenCalledWith('test-token', 'gm-existing');
    // A second DB update should have cleared the stale IDs
    expect(mockDb.update).toHaveBeenCalledTimes(2);
  });

  it('provisions a fresh Teams meeting when re-scheduling a cancelled meeting', async () => {
    // After cancellation the IDs are cleared, so this record has no stale data.
    const cancelledMeeting = {
      ...mockMeeting,
      status: 'cancelled',
      teamsJoinUrl: null,
      graphMeetingId: null,
    };
    const rescheduledMeeting = { ...cancelledMeeting, status: 'scheduled' };

    mockDb.select
      .mockReturnValueOnce(makeChain([cancelledMeeting]))  // pre-fetch current
      .mockReturnValueOnce(makeChain([]));                 // participants
    mockDb.update
      .mockReturnValueOnce(makeChain([rescheduledMeeting])) // status update
      .mockReturnValueOnce(makeChain([]));                  // persist Teams URL

    mockGraph.getGraphAccessToken.mockResolvedValueOnce('test-token');
    mockGraph.createTeamsMeeting.mockResolvedValueOnce({
      meetingId: 'gm-fresh',
      joinUrl: 'https://teams.ms/join/fresh',
    });

    const res = await request(app).patch('/api/virtual-meetings/7').send({ status: 'scheduled' });
    expect(res.status).toBe(200);
    // A fresh Teams meeting must be provisioned — stale IDs were cleared on cancellation
    expect(mockGraph.createTeamsMeeting).toHaveBeenCalledOnce();
    expect(mockDb.update).toHaveBeenCalledTimes(2);
  });
});

describe('DELETE /api/virtual-meetings/:id', () => {
  it('returns 204 on success', async () => {
    // Route pre-fetches the record (to check graphMeetingId) before deleting.
    mockDb.select.mockReturnValueOnce(makeChain([mockMeeting])); // pre-fetch (no graphMeetingId)
    mockDb.delete.mockReturnValue(makeChain([]));                // delete
    const res = await request(app).delete('/api/virtual-meetings/7');
    expect(res.status).toBe(204);
  });

  it('returns 404 when not found', async () => {
    mockDb.select.mockReturnValueOnce(makeChain([])); // pre-fetch returns empty → 404
    const res = await request(app).delete('/api/virtual-meetings/999');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/virtual-meetings/:id/participants', () => {
  it('returns 200 with an array', async () => {
    mockDb.select.mockReturnValue(makeChain([]));
    const res = await request(app).get('/api/virtual-meetings/7/participants');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/virtual-meetings/:id/participants', () => {
  it('returns 201 with created participant row', async () => {
    mockDb.insert.mockReturnValue(makeChain([{ meetingId: 7, personId: 1 }]));
    const res = await request(app).post('/api/virtual-meetings/7/participants').send({ personId: 1 });
    expect(res.status).toBe(201);
  });

  it('returns 400 when personId is missing', async () => {
    const res = await request(app).post('/api/virtual-meetings/7/participants').send({});
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/virtual-meetings/:meetingId/participants/:personId', () => {
  it('returns 204 on success', async () => {
    mockDb.delete.mockReturnValue(makeChain([]));
    const res = await request(app).delete('/api/virtual-meetings/7/participants/1');
    expect(res.status).toBe(204);
  });
});
