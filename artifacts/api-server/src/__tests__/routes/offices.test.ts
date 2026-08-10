import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ─── Hoisted fixtures & mock ──────────────────────────────────────────────────

const { mockDb, mockOffice, makeChain } = vi.hoisted(() => {
  const mockOffice = {
    id: 1,
    name: 'HQ',
    city: 'New York',
    state: 'NY',
    lat: 40.7127281,
    lng: -74.0060152,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
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

  return { mockDb, mockOffice, makeChain };
});

vi.mock('@workspace/db', () => ({
  db: mockDb,
  officesTable: {
    id: 'id',
    name: 'name',
    city: 'city',
    state: 'state',
    lat: 'lat',
    lng: 'lng',
  },
  peopleTable: { id: 'id', name: 'name', role: 'role', homeCity: 'homeCity', homeState: 'homeState' },
  eventsTable: { id: 'id', name: 'name', location: 'location', city: 'city', state: 'state', startDate: 'startDate', endDate: 'endDate', eventType: 'eventType' },
  invitationsTable: { eventId: 'eventId', personId: 'personId', status: 'status' },
  eventLeadersTable: {},
  virtualMeetingsTable: {},
  virtualMeetingParticipantsTable: {},
  settingsTable: { key: 'key', value: 'value' },
  auditLogTable: { id: 'id', actorId: 'actorId', actorName: 'actorName', action: 'action', resourceType: 'resourceType', resourceId: 'resourceId' },
}));

import app from '../../app';

beforeEach(() => { vi.resetAllMocks(); });

// ─── GET /api/offices ─────────────────────────────────────────────────────────

describe('GET /api/offices', () => {
  it('returns 200 with a list of offices', async () => {
    mockDb.select.mockReturnValueOnce(makeChain([mockOffice]));

    const res = await request(app).get('/api/offices');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('HQ');
  });

  it('returns an empty array when no offices exist', async () => {
    mockDb.select.mockReturnValueOnce(makeChain([]));

    const res = await request(app).get('/api/offices');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});

// ─── POST /api/offices ────────────────────────────────────────────────────────

describe('POST /api/offices', () => {
  it('creates an office and returns 201', async () => {
    mockDb.insert.mockReturnValueOnce(makeChain([mockOffice]));
    mockDb.insert.mockReturnValue({ values: vi.fn().mockReturnThis(), returning: vi.fn().mockResolvedValue([mockOffice]) });

    const chain = makeChain([mockOffice]);
    mockDb.insert.mockReturnValueOnce({ values: vi.fn().mockReturnValue(chain) });

    const res = await request(app)
      .post('/api/offices')
      .send({ name: 'HQ', city: 'New York', state: 'NY', lat: 40.71, lng: -74.0 });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('HQ');
  });

  it('accepts an office without coordinates', async () => {
    const officeNoCoords = { ...mockOffice, lat: null, lng: null };
    const chain = makeChain([officeNoCoords]);
    mockDb.insert.mockReturnValueOnce({ values: vi.fn().mockReturnValue(chain) });

    const res = await request(app)
      .post('/api/offices')
      .send({ name: 'Remote Office', city: 'Austin', state: 'TX' });

    expect(res.status).toBe(201);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/offices')
      .send({ name: 'HQ' }); // missing city and state

    expect(res.status).toBe(400);
  });

  it('returns 400 when name is empty string', async () => {
    const res = await request(app)
      .post('/api/offices')
      .send({ name: '', city: 'New York', state: 'NY' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when lat is out of valid range', async () => {
    const res = await request(app)
      .post('/api/offices')
      .send({ name: 'HQ', city: 'New York', state: 'NY', lat: 999, lng: -74.0 });

    expect(res.status).toBe(400);
  });

  it('returns 400 when lng is out of valid range', async () => {
    const res = await request(app)
      .post('/api/offices')
      .send({ name: 'HQ', city: 'New York', state: 'NY', lat: 40.71, lng: 999 });

    expect(res.status).toBe(400);
  });
});

// ─── PATCH /api/offices/:id ───────────────────────────────────────────────────

describe('PATCH /api/offices/:id', () => {
  it('updates an office and returns the updated record', async () => {
    const updated = { ...mockOffice, name: 'East Coast HQ' };
    mockDb.select.mockReturnValueOnce(makeChain([mockOffice]));
    const updateChain = makeChain([updated]);
    mockDb.update.mockReturnValueOnce({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(updateChain),
      }),
    });
    mockDb.insert.mockReturnValueOnce({ values: vi.fn().mockReturnValue(makeChain([])) }); // audit log

    const res = await request(app)
      .patch('/api/offices/1')
      .send({ name: 'East Coast HQ' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('East Coast HQ');
  });

  it('returns 404 when office does not exist', async () => {
    mockDb.select.mockReturnValueOnce(makeChain([]));

    const res = await request(app)
      .patch('/api/offices/999')
      .send({ name: 'Ghost Office' });

    expect(res.status).toBe(404);
  });

  it('returns 400 for a non-integer id', async () => {
    const res = await request(app)
      .patch('/api/offices/abc')
      .send({ name: 'Bad' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when lat is out of valid range on update', async () => {
    const res = await request(app)
      .patch('/api/offices/1')
      .send({ lat: -999 });

    expect(res.status).toBe(400);
  });
});

// ─── DELETE /api/offices/:id ──────────────────────────────────────────────────

describe('DELETE /api/offices/:id', () => {
  it('deletes an existing office and returns 204', async () => {
    mockDb.select.mockReturnValueOnce(makeChain([mockOffice]));
    const deleteChain = { where: vi.fn().mockResolvedValue(undefined) };
    mockDb.delete.mockReturnValueOnce(deleteChain);
    mockDb.insert.mockReturnValueOnce({ values: vi.fn().mockReturnValue(makeChain([])) }); // audit log

    const res = await request(app).delete('/api/offices/1');
    expect(res.status).toBe(204);
  });

  it('returns 404 when office does not exist', async () => {
    mockDb.select.mockReturnValueOnce(makeChain([]));

    const res = await request(app).delete('/api/offices/999');
    expect(res.status).toBe(404);
  });

  it('returns 400 for a non-integer id', async () => {
    const res = await request(app).delete('/api/offices/abc');
    expect(res.status).toBe(400);
  });
});
