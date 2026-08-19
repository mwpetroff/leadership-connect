import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const { mockDb, mockDept, makeChain } = vi.hoisted(() => {
  const mockDept = {
    id: 1,
    name: 'Modern Apps',
    parentId: null,
    leadershipOneOnOneDays: 14,
    skipLevelDays: 90,
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

  return { mockDb, mockDept, makeChain };
});

vi.mock('@workspace/db', () => ({
  db: mockDb,
  departmentsTable: { id: 'id', name: 'name', parentId: 'parentId' },
  peopleTable: { id: 'id', departmentId: 'departmentId', email: 'email', isHrbp: 'isHrbp' },
  eventsTable: {},
  eventLeadersTable: {},
  invitationsTable: {},
  virtualMeetingsTable: {},
  virtualMeetingParticipantsTable: {},
  settingsTable: { key: 'key', value: 'value' },
  auditLogTable: { id: 'id', actorId: 'actorId', actorName: 'actorName', action: 'action', resourceType: 'resourceType', resourceId: 'resourceId' },
}));

import app from '../../app';

beforeEach(() => {
  vi.resetAllMocks();
  mockDb.select.mockReturnValue(makeChain([]));
});

describe('GET /api/departments', () => {
  it('returns the department list', async () => {
    mockDb.select.mockReturnValue(makeChain([mockDept]));
    const res = await request(app).get('/api/departments');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      expect.objectContaining({ id: 1, name: 'Modern Apps', parentId: null }),
    ]);
  });
});

describe('POST /api/departments', () => {
  it('creates a department', async () => {
    mockDb.select.mockReturnValueOnce(makeChain([])); // duplicate check
    mockDb.insert.mockReturnValueOnce({ values: vi.fn().mockReturnValue(makeChain([mockDept])) });
    const res = await request(app).post('/api/departments').send({ name: 'Modern Apps' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Modern Apps');
  });

  it('rejects a duplicate name', async () => {
    mockDb.select.mockReturnValueOnce(makeChain([{ id: 1 }]));
    const res = await request(app).post('/api/departments').send({ name: 'Modern Apps' });
    expect(res.status).toBe(409);
  });

  it('rejects an empty name', async () => {
    const res = await request(app).post('/api/departments').send({ name: '' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/departments/:id', () => {
  it('updates cadences', async () => {
    mockDb.select.mockReturnValueOnce(makeChain([mockDept]));
    mockDb.update.mockReturnValueOnce(
      makeChain([{ ...mockDept, leadershipOneOnOneDays: 21 }]),
    );
    const res = await request(app).patch('/api/departments/1').send({ leadershipOneOnOneDays: 21 });
    expect(res.status).toBe(200);
    expect(res.body.leadershipOneOnOneDays).toBe(21);
  });

  it('rejects a self-parent', async () => {
    mockDb.select.mockReturnValueOnce(makeChain([mockDept]));
    const res = await request(app).patch('/api/departments/1').send({ parentId: 1 });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/departments/:id', () => {
  it('blocks delete when people are still assigned', async () => {
    mockDb.select.mockReturnValueOnce(makeChain([{ id: 9 }]));
    const res = await request(app).delete('/api/departments/1');
    expect(res.status).toBe(409);
  });

  it('deletes an unused department', async () => {
    mockDb.select.mockReturnValueOnce(makeChain([]));
    mockDb.delete.mockReturnValueOnce(makeChain([mockDept]));
    const res = await request(app).delete('/api/departments/1');
    expect(res.status).toBe(204);
  });
});
