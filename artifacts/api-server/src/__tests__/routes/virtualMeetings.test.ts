import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ─── Hoisted fixtures & mock ──────────────────────────────────────────────────

const { mockDb, mockMeeting, mockPerson, makeChain } = vi.hoisted(() => {
  const mockMeeting = {
    id: 7,
    title: 'Sync with Jane',
    scheduledDate: '2027-08-15',
    status: 'scheduled',
    notes: null,
    hostId: null,     // no host — avoids extra person lookup in meetingWithMeta
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

  return { mockDb, mockMeeting, mockPerson, makeChain };
});

vi.mock('@workspace/db', () => ({
  db: mockDb,
  virtualMeetingsTable: { id: 'id', status: 'status', scheduledDate: 'scheduledDate' },
  virtualMeetingParticipantsTable: { meetingId: 'meetingId', personId: 'personId' },
  peopleTable: { id: 'id' },
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
    mockDb.select
      .mockReturnValueOnce(makeChain([]))
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
    mockDb.insert.mockReturnValue(makeChain([mockMeeting]));
    mockDb.select.mockReturnValue(makeChain([])); // participants in meetingWithMeta
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
    mockDb.update.mockReturnValue(makeChain([{ ...mockMeeting, status: 'completed' }]));
    mockDb.select.mockReturnValue(makeChain([])); // participants
    const res = await request(app).patch('/api/virtual-meetings/7').send({ status: 'completed' });
    expect(res.status).toBe(200);
  });

  it('returns 404 when not found', async () => {
    mockDb.update.mockReturnValue(makeChain([]));
    const res = await request(app).patch('/api/virtual-meetings/999').send({ status: 'completed' });
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid status', async () => {
    const res = await request(app).patch('/api/virtual-meetings/7').send({ status: 'deleted' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/virtual-meetings/:id', () => {
  it('returns 204 on success', async () => {
    mockDb.delete.mockReturnValue(makeChain([mockMeeting]));
    const res = await request(app).delete('/api/virtual-meetings/7');
    expect(res.status).toBe(204);
  });

  it('returns 404 when not found', async () => {
    mockDb.delete.mockReturnValue(makeChain([]));
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
