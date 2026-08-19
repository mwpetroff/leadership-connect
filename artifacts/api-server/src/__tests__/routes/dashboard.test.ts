import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ─── Hoisted mock ─────────────────────────────────────────────────────────────

const { mockDb, makeChain, mockStaff } = vi.hoisted(() => {
  function makeChain(result: unknown[]) {
    const c: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'orderBy', 'limit', 'innerJoin', 'leftJoin', 'set', 'values']) {
      c[m] = vi.fn().mockReturnValue(c);
    }
    c['returning'] = vi.fn().mockResolvedValue(result);
    c['then'] = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
    return c;
  }

  const mockStaff = {
    id: 1,
    name: 'Staff Person',
    email: 'staff@co.com',
    title: null,
    department: null,
    role: 'staff',
    homeCity: 'Austin',
    homeState: 'TX',
    notes: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  return { mockDb, makeChain, mockStaff };
});

vi.mock('@workspace/db', () => ({
  db: mockDb,
  peopleTable: { id: 'id', role: 'role', name: 'name' },
  departmentsTable: { id: 'id', name: 'name' },
  eventsTable: { id: 'id', startDate: 'startDate' },
  eventLeadersTable: { eventId: 'eventId', personId: 'personId' },
  invitationsTable: { id: 'id', eventId: 'eventId', personId: 'personId', status: 'status', createdAt: 'createdAt' },
  virtualMeetingsTable: { id: 'id', status: 'status', scheduledDate: 'scheduledDate', createdAt: 'createdAt' },
  virtualMeetingParticipantsTable: { meetingId: 'meetingId', personId: 'personId' },
  settingsTable: { key: 'key', value: 'value' },
  auditLogTable: { id: 'id', actorId: 'actorId', actorName: 'actorName', action: 'action', resourceType: 'resourceType', resourceId: 'resourceId' },
}));

import app from '../../app';

beforeEach(() => { vi.resetAllMocks(); });

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /api/dashboard/summary', () => {
  it('returns 200 with the expected response shape (no data)', async () => {
    // All queries return empty → zero-state summary
    mockDb.select.mockReturnValue(makeChain([]));

    const res = await request(app).get('/api/dashboard/summary');
    expect(res.status).toBe(200);

    const body = res.body;
    expect(typeof body.totalPeople).toBe('number');
    expect(typeof body.totalEvents).toBe('number');
    expect(typeof body.upcomingEvents).toBe('number');
    expect(typeof body.totalExecutives).toBe('number');
    expect(typeof body.totalSecondaryLeaders).toBe('number');
    expect(typeof body.totalStaff).toBe('number');
    expect(typeof body.staffNeedingTouchpoint).toBe('number');
    expect(Array.isArray(body.recentActivity)).toBe(true);
    expect(Array.isArray(body.engagementByRole)).toBe(true);
    expect(Array.isArray(body.needsTouchpoint)).toBe(true);
  });

  it('returns zero counts when no data exists', async () => {
    mockDb.select.mockReturnValue(makeChain([]));
    const res = await request(app).get('/api/dashboard/summary');
    expect(res.status).toBe(200);
    expect(res.body.totalPeople).toBe(0);
    expect(res.body.totalEvents).toBe(0);
    expect(res.body.recentActivity).toHaveLength(0);
    expect(res.body.needsTouchpoint).toHaveLength(0);
  });

  it('counts staff needing touchpoint when they have no engagement history', async () => {
    // Dashboard makes: allPeople, allEvents, then per-staff getDaysSinceLastTouchpoint
    // (2 DB calls each: invitations join + virtual participants), then recent* queries,
    // then engagementByRole (getDaysSinceLastTouchpoint again per person per role).
    // Use mockReturnValueOnce for the first 2 calls, then mockReturnValue for the rest.
    mockDb.select
      .mockReturnValueOnce(makeChain([mockStaff]))  // allPeople
      .mockReturnValueOnce(makeChain([]))            // allEvents
      .mockReturnValueOnce(makeChain([]))            // viewer
      .mockReturnValueOnce(makeChain([mockStaff]))  // coverage people
      .mockReturnValue(makeChain([]));              // remaining coverage/settings/activity queries

    const res = await request(app).get('/api/dashboard/summary');
    expect(res.status).toBe(200);
    expect(res.body.totalPeople).toBe(1);
    expect(res.body.totalStaff).toBe(1);
    // Staff with no engagement → needs touchpoint
    expect(res.body.staffNeedingTouchpoint).toBe(1);
    expect(res.body.needsTouchpoint).toHaveLength(1);
    expect(res.body.needsTouchpoint[0].name).toBe('Staff Person');
    expect(res.body.coverage.counts.hrbp_1on1).toBe(1);
  });

  it('includes recent activity items for invitations and meetings', async () => {
    const mockInvitation = {
      id: 1,
      status: 'invited',
      createdAt: new Date('2026-06-01'),
      personId: 99,
      eventId: 88,
    };
    const mockMeeting = {
      id: 5,
      title: 'Sync',
      status: 'scheduled',
      scheduledDate: '2027-01-01',
      hostId: null,
      notes: null,
      createdAt: new Date('2026-06-02'),
    };

    mockDb.select
      .mockReturnValueOnce(makeChain([]))          // allPeople
      .mockReturnValueOnce(makeChain([]))           // allEvents
      .mockReturnValueOnce(makeChain([]))           // viewer
      .mockReturnValueOnce(makeChain([]))           // coverage people
      .mockReturnValueOnce(makeChain([]))           // coverage departments
      .mockReturnValueOnce(makeChain([]))           // participations
      .mockReturnValueOnce(makeChain([]))           // completed meetings
      .mockReturnValueOnce(makeChain([]))           // attended onsites
      .mockReturnValueOnce(makeChain([]))           // event leaders
      .mockReturnValueOnce(makeChain([]))           // cadence: hrbp
      .mockReturnValueOnce(makeChain([]))           // cadence: leader
      .mockReturnValueOnce(makeChain([]))           // cadence: skip
      .mockReturnValueOnce(makeChain([]))           // cadence: onsite
      .mockReturnValueOnce(makeChain([mockInvitation])) // recentInvitations
      .mockReturnValueOnce(makeChain([mockMeeting]))    // recentMeetings
      .mockReturnValueOnce(makeChain([]));          // recentPeople

    const res = await request(app).get('/api/dashboard/summary');
    expect(res.status).toBe(200);
    // Should have items from invitations and meetings
    expect(res.body.recentActivity.length).toBeGreaterThanOrEqual(1);
  });
});
