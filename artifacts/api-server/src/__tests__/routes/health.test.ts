import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

// health.ts has no DB calls — no mock needed
vi.mock('@workspace/db', () => ({
  db: {},
  peopleTable: {},
  departmentsTable: { id: 'id', name: 'name' },
  eventsTable: {},
  eventLeadersTable: {},
  invitationsTable: {},
  virtualMeetingsTable: {},
  virtualMeetingParticipantsTable: {},
  settingsTable: { key: 'key', value: 'value' },
  auditLogTable: { id: 'id', actorId: 'actorId', actorName: 'actorName', action: 'action', resourceType: 'resourceType', resourceId: 'resourceId' },
}));

import app from '../../app';

describe('GET /api/healthz', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/api/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
