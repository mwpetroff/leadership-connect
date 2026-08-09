import { describe, it, expect, vi, beforeEach } from 'vitest';
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
  eventsTable: {},
  eventLeadersTable: {},
  invitationsTable: {},
  virtualMeetingsTable: {},
  virtualMeetingParticipantsTable: {},
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
    department: 'Engineering',
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
    // PATCH uses update().returning() — no pre-check select. Empty returning = 404.
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
