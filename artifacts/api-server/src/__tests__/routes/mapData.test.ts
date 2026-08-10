import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ─── Hoisted fixtures & mock ──────────────────────────────────────────────────

const { mockDb, mockPerson, mockEvent, mockInvitation, makeChain } = vi.hoisted(() => {
  const mockPerson = {
    id: 1,
    name: 'Sarah Chen',
    role: 'executive',
    title: 'CEO',
    homeCity: 'New York',
    homeState: 'NY',
    lat: 40.7127281,
    lng: -74.0060152,
  };

  const mockEvent = {
    id: 1,
    name: 'Annual Leadership Summit',
    location: 'Marriott Downtown',
    city: 'Chicago',
    state: 'IL',
    lat: 41.8781136,
    lng: -87.6297982,
    startDate: '2026-09-15',
    endDate: '2026-09-17',
    eventType: 'summit',
  };

  const mockInvitation = {
    eventId: 1,
    personId: 1,
    status: 'invited',
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
  peopleTable: {
    id: 'id',
    name: 'name',
    role: 'role',
    title: 'title',
    homeCity: 'homeCity',
    homeState: 'homeState',
    lat: 'lat',
    lng: 'lng',
  },
  eventsTable: {
    id: 'id',
    name: 'name',
    location: 'location',
    city: 'city',
    state: 'state',
    lat: 'lat',
    lng: 'lng',
    startDate: 'startDate',
    endDate: 'endDate',
    eventType: 'eventType',
  },
  invitationsTable: {
    eventId: 'eventId',
    personId: 'personId',
    status: 'status',
  },
  officesTable: {
    id: 'id',
    name: 'name',
    city: 'city',
    state: 'state',
    lat: 'lat',
    lng: 'lng',
  },
  eventLeadersTable: {},
  virtualMeetingsTable: {},
  virtualMeetingParticipantsTable: {},
  settingsTable: { key: 'key', value: 'value' },
  auditLogTable: { id: 'id', actorId: 'actorId', actorName: 'actorName', action: 'action', resourceType: 'resourceType', resourceId: 'resourceId' },
}));

import app from '../../app';

beforeEach(() => { vi.resetAllMocks(); });

// ─── Tests ───────────────────────────────────────────────────────────────────

const mockOffice = {
  id: 1,
  name: 'HQ',
  city: 'Chicago',
  state: 'IL',
  lat: 41.8781136,
  lng: -87.6297982,
};

describe('GET /api/map-data', () => {
  it('returns 200 with people, events, invitees, and offices', async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([mockPerson]))      // people query
      .mockReturnValueOnce(makeChain([mockEvent]))       // events query
      .mockReturnValueOnce(makeChain([mockInvitation])) // invitations query
      .mockReturnValueOnce(makeChain([mockOffice]));    // offices query

    const res = await request(app).get('/api/map-data');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('people');
    expect(res.body).toHaveProperty('events');
    expect(res.body).toHaveProperty('offices');
  });

  it('includes office data in the response', async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([mockPerson]))
      .mockReturnValueOnce(makeChain([mockEvent]))
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(makeChain([mockOffice]));

    const res = await request(app).get('/api/map-data');
    expect(res.status).toBe(200);
    expect(res.body.offices).toHaveLength(1);
    expect(res.body.offices[0].name).toBe('HQ');
    expect(res.body.offices[0].lat).toBe(41.8781136);
    expect(res.body.offices[0].lng).toBe(-87.6297982);
  });

  it('includes lat and lng in people response', async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([mockPerson]))
      .mockReturnValueOnce(makeChain([mockEvent]))
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(makeChain([]));

    const res = await request(app).get('/api/map-data');
    expect(res.status).toBe(200);
    expect(res.body.people[0]).toHaveProperty('lat', 40.7127281);
    expect(res.body.people[0]).toHaveProperty('lng', -74.0060152);
  });

  it('includes lat and lng in events response', async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([mockPerson]))
      .mockReturnValueOnce(makeChain([mockEvent]))
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(makeChain([]));

    const res = await request(app).get('/api/map-data');
    expect(res.status).toBe(200);
    expect(res.body.events[0]).toHaveProperty('lat', 41.8781136);
    expect(res.body.events[0]).toHaveProperty('lng', -87.6297982);
  });

  it('returns null lat/lng for unresolved locations without triggering client-side geocoding', async () => {
    const personWithoutCoords = { ...mockPerson, lat: null, lng: null };
    mockDb.select
      .mockReturnValueOnce(makeChain([personWithoutCoords]))
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(makeChain([]));

    const res = await request(app).get('/api/map-data');
    expect(res.status).toBe(200);
    // Server returns null — client must not geocode, just omit the marker
    expect(res.body.people[0].lat).toBeNull();
    expect(res.body.people[0].lng).toBeNull();
  });

  it('attaches invitees to their respective events', async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([mockPerson]))
      .mockReturnValueOnce(makeChain([mockEvent]))
      .mockReturnValueOnce(makeChain([mockInvitation]))
      .mockReturnValueOnce(makeChain([]));

    const res = await request(app).get('/api/map-data');
    expect(res.status).toBe(200);
    expect(res.body.events[0].invitees).toHaveLength(1);
    expect(res.body.events[0].invitees[0].personId).toBe(1);
    expect(res.body.events[0].invitees[0].personName).toBe('Sarah Chen');
    expect(res.body.events[0].invitees[0].status).toBe('invited');
  });

  it('handles unknown invitee gracefully (person not in people list)', async () => {
    const orphanInvitation = { eventId: 1, personId: 999, status: 'invited' };
    mockDb.select
      .mockReturnValueOnce(makeChain([mockPerson]))
      .mockReturnValueOnce(makeChain([mockEvent]))
      .mockReturnValueOnce(makeChain([orphanInvitation]))
      .mockReturnValueOnce(makeChain([]));

    const res = await request(app).get('/api/map-data');
    expect(res.status).toBe(200);
    expect(res.body.events[0].invitees[0].personName).toBe('Unknown');
    expect(res.body.events[0].invitees[0].personRole).toBe('staff');
  });

  it('returns empty arrays when database has no records', async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(makeChain([]));

    const res = await request(app).get('/api/map-data');
    expect(res.status).toBe(200);
    expect(res.body.people).toHaveLength(0);
    expect(res.body.events).toHaveLength(0);
    expect(res.body.offices).toHaveLength(0);
  });
});
