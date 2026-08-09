import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';

// ─── Hoisted fixtures & mock ──────────────────────────────────────────────────

const { mockDb, mockEvent, mockLeader, makeChain } = vi.hoisted(() => {
  const mockEvent = {
    id: 1,
    name: 'Q3 Summit',
    description: 'Quarterly summit',
    location: 'Hyatt Regency',
    city: 'Austin',
    state: 'TX',
    startDate: '2027-09-01',
    endDate: '2027-09-03',
    eventType: 'summit',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  const mockLeader = {
    id: 5,
    eventId: 1,
    personId: 5,
    addedAt: new Date('2026-01-01'),
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

  return { mockDb, mockEvent, mockLeader, makeChain };
});

vi.mock('@workspace/db', () => ({
  db: mockDb,
  eventsTable: { id: 'id', startDate: 'startDate', eventType: 'eventType' },
  eventLeadersTable: { eventId: 'eventId', personId: 'personId' },
  invitationsTable: { eventId: 'eventId', personId: 'personId', status: 'status' },
  peopleTable: {},
}));

import app from '../../app';

// Reset all mocks before every test to prevent Once-queue contamination across
// describe blocks when a beforeEach in one block leaves unconsumed mock values.
beforeEach(() => { vi.resetAllMocks(); });

// ─── Helpers ──────────────────────────────────────────────────────────────────

// GET /api/events/:id calls eventWithCounts which makes 2 extra selects (leaders + invitations)
function mockEventSelectSequence(eventResult: unknown[] = [mockEvent]) {
  mockDb.select
    .mockReturnValueOnce(makeChain(eventResult))  // main event query
    .mockReturnValueOnce(makeChain([]))            // leaders count
    .mockReturnValueOnce(makeChain([]));           // invitations count
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/events', () => {
  it('returns 200 with an array', async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([mockEvent])) // list
      .mockReturnValueOnce(makeChain([]))           // eventWithCounts leaders
      .mockReturnValueOnce(makeChain([]));          // eventWithCounts invitations
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('accepts ?upcoming=true without erroring', async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([]))
    const res = await request(app).get('/api/events?upcoming=true');
    expect(res.status).toBe(200);
  });
});

describe('POST /api/events', () => {
  const validBody = {
    name: 'Q3 Summit',
    location: 'Hyatt Regency',
    city: 'Austin',
    state: 'TX',
    startDate: '2027-09-01',
    eventType: 'summit',
  };

  beforeEach(() => {
    mockDb.insert.mockReturnValue(makeChain([mockEvent]));
    mockDb.select
      .mockReturnValueOnce(makeChain([]))   // leaders
      .mockReturnValueOnce(makeChain([])); // invitations
  });

  it('returns 201 with created event', async () => {
    const res = await request(app).post('/api/events').send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Q3 Summit');
  });

  it('returns 400 when name is missing', async () => {
    const { name: _n, ...body } = validBody;
    const res = await request(app).post('/api/events').send(body);
    expect(res.status).toBe(400);
  });

  it('returns 400 when eventType is invalid', async () => {
    const res = await request(app).post('/api/events').send({ ...validBody, eventType: 'party' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/events/:id', () => {
  it('returns 200 with the event', async () => {
    mockEventSelectSequence();
    const res = await request(app).get('/api/events/1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
  });

  it('returns 404 when not found', async () => {
    mockEventSelectSequence([]);
    const res = await request(app).get('/api/events/999');
    expect(res.status).toBe(404);
  });

  it('returns 400 for non-numeric id', async () => {
    const res = await request(app).get('/api/events/abc');
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/events/:id', () => {
  it('returns 200 with updated event', async () => {
    mockDb.update.mockReturnValue(makeChain([{ ...mockEvent, name: 'Updated Summit' }]));
    mockDb.select
      .mockReturnValueOnce(makeChain([]))  // leaders
      .mockReturnValueOnce(makeChain([])); // invitations
    const res = await request(app).patch('/api/events/1').send({ name: 'Updated Summit' });
    expect(res.status).toBe(200);
  });

  it('returns 404 when not found', async () => {
    mockDb.update.mockReturnValue(makeChain([]));
    const res = await request(app).patch('/api/events/999').send({ name: 'Ghost' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/events/:id', () => {
  it('returns 204 on successful delete', async () => {
    mockDb.delete.mockReturnValue(makeChain([mockEvent]));
    const res = await request(app).delete('/api/events/1');
    expect(res.status).toBe(204);
  });

  it('returns 404 when not found', async () => {
    mockDb.delete.mockReturnValue(makeChain([]));
    const res = await request(app).delete('/api/events/999');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/events/:id/leaders', () => {
  it('returns 200 with an array', async () => {
    mockDb.select.mockReturnValue(makeChain([]));
    const res = await request(app).get('/api/events/1/leaders');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/events/:eventId/leaders/:personId', () => {
  it('returns 201 when leader is added', async () => {
    mockDb.select.mockReturnValue(makeChain([])); // no existing
    mockDb.insert.mockReturnValue(makeChain([mockLeader]));
    const res = await request(app).post('/api/events/1/leaders/5');
    expect(res.status).toBe(201);
  });

  it('returns 409 when leader already added', async () => {
    mockDb.select.mockReturnValue(makeChain([mockLeader])); // already exists
    const res = await request(app).post('/api/events/1/leaders/5');
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/events/:eventId/leaders/:personId', () => {
  it('returns 204 on success', async () => {
    mockDb.delete.mockReturnValue(makeChain([mockLeader]));
    const res = await request(app).delete('/api/events/1/leaders/5');
    expect(res.status).toBe(204);
  });

  it('returns 404 when not found', async () => {
    mockDb.delete.mockReturnValue(makeChain([]));
    const res = await request(app).delete('/api/events/1/leaders/99');
    expect(res.status).toBe(404);
  });
});
