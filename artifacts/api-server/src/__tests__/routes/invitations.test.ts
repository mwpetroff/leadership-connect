import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ─── Hoisted fixtures & mock ──────────────────────────────────────────────────

const { mockDb, mockPerson, mockEvent, mockInvitation, makeChain } = vi.hoisted(() => {
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

  return { mockDb, mockPerson, mockEvent, mockInvitation, makeChain };
});

vi.mock('@workspace/db', () => ({
  db: mockDb,
  invitationsTable: { id: 'id', eventId: 'eventId', personId: 'personId', status: 'status' },
  peopleTable: { id: 'id' },
  eventsTable: { id: 'id' },
}));

import app from '../../app';

// Helper: mock invitationWithRelations (2 selects: person + event)
function mockWithRelations(person = mockPerson, event = mockEvent) {
  mockDb.select
    .mockReturnValueOnce(makeChain([person]))   // person lookup
    .mockReturnValueOnce(makeChain([event]));   // event lookup
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/events/:id/invitations', () => {
  it('returns 200 with an array', async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([mockInvitation])) // list
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
  it('returns 201 when person is invited', async () => {
    mockDb.select.mockReturnValueOnce(makeChain([])); // no duplicate
    mockDb.insert.mockReturnValue(makeChain([mockInvitation]));
    mockWithRelations();
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

describe('PATCH /api/invitations/:id', () => {
  it('returns 200 with updated invitation', async () => {
    const updated = { ...mockInvitation, status: 'attended' };
    mockDb.update.mockReturnValue(makeChain([updated]));
    mockWithRelations();
    const res = await request(app).patch('/api/invitations/10').send({ status: 'attended' });
    expect(res.status).toBe(200);
  });

  it('returns 404 when not found', async () => {
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
    mockDb.delete.mockReturnValue(makeChain([mockInvitation]));
    const res = await request(app).delete('/api/invitations/10');
    expect(res.status).toBe(204);
  });

  it('returns 404 when not found', async () => {
    mockDb.delete.mockReturnValue(makeChain([]));
    const res = await request(app).delete('/api/invitations/999');
    expect(res.status).toBe(404);
  });
});
