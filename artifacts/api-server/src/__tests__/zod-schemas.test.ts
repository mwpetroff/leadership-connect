/**
 * Zod schema validation tests for the api-zod generated validators.
 *
 * These tests confirm that the generated Zod schemas correctly accept
 * valid inputs and reject invalid payloads — without hitting the real API.
 * They serve as a contract safety net for the generated validators.
 */
import { describe, it, expect } from 'vitest';
import {
  CreatePersonBody,
  UpdatePersonBody,
  ListPeopleQueryParams,
  CreateEventBody,
  UpdateEventBody,
  ListEventsQueryParams,
  CreateInvitationBody,
  UpdateInvitationBody,
  CreateVirtualMeetingBody,
  UpdateVirtualMeetingBody,
  ListVirtualMeetingsQueryParams,
} from '@workspace/api-zod';

// ─── Person schemas ───────────────────────────────────────────────────────────

describe('CreatePersonBody', () => {
  const valid = {
    name: 'Jane Smith',
    email: 'jane@example.com',
    role: 'staff' as const,
    homeCity: 'Austin',
    homeState: 'TX',
  };

  it('accepts a valid person payload', () => {
    expect(CreatePersonBody.safeParse(valid).success).toBe(true);
  });

  it('accepts optional fields', () => {
    const result = CreatePersonBody.safeParse({ ...valid, title: 'Engineer', department: 'Eng', notes: 'note' });
    expect(result.success).toBe(true);
  });

  it('rejects missing name', () => {
    const { name: _n, ...body } = valid;
    expect(CreatePersonBody.safeParse(body).success).toBe(false);
  });

  it('rejects empty name', () => {
    expect(CreatePersonBody.safeParse({ ...valid, name: '' }).success).toBe(false);
  });

  it('rejects missing email', () => {
    const { email: _e, ...body } = valid;
    expect(CreatePersonBody.safeParse(body).success).toBe(false);
  });

  it('rejects invalid role', () => {
    expect(CreatePersonBody.safeParse({ ...valid, role: 'superadmin' }).success).toBe(false);
  });

  it('accepts all valid roles', () => {
    for (const role of ['executive', 'secondary_leader', 'staff'] as const) {
      expect(CreatePersonBody.safeParse({ ...valid, role }).success).toBe(true);
    }
  });

  it('rejects missing homeCity', () => {
    const { homeCity: _c, ...body } = valid;
    expect(CreatePersonBody.safeParse(body).success).toBe(false);
  });
});

describe('UpdatePersonBody', () => {
  it('accepts empty object (all fields optional)', () => {
    expect(UpdatePersonBody.safeParse({}).success).toBe(true);
  });

  it('accepts partial update', () => {
    expect(UpdatePersonBody.safeParse({ name: 'Bob' }).success).toBe(true);
  });

  it('rejects invalid role in partial update', () => {
    expect(UpdatePersonBody.safeParse({ role: 'ceo' }).success).toBe(false);
  });

  it('rejects empty name string', () => {
    expect(UpdatePersonBody.safeParse({ name: '' }).success).toBe(false);
  });
});

describe('ListPeopleQueryParams', () => {
  it('accepts empty params', () => {
    expect(ListPeopleQueryParams.safeParse({}).success).toBe(true);
  });

  it('accepts valid role filter', () => {
    expect(ListPeopleQueryParams.safeParse({ role: 'executive' }).success).toBe(true);
  });

  it('rejects invalid role filter', () => {
    expect(ListPeopleQueryParams.safeParse({ role: 'admin' }).success).toBe(false);
  });

  it('accepts search string', () => {
    expect(ListPeopleQueryParams.safeParse({ search: 'Jane' }).success).toBe(true);
  });
});

// ─── Event schemas ────────────────────────────────────────────────────────────

describe('CreateEventBody', () => {
  const valid = {
    name: 'Q3 Summit',
    location: 'Hyatt Regency',
    city: 'Austin',
    state: 'TX',
    startDate: '2027-09-01',
    eventType: 'summit' as const,
  };

  it('accepts a valid event payload', () => {
    expect(CreateEventBody.safeParse(valid).success).toBe(true);
  });

  it('rejects missing name', () => {
    const { name: _n, ...body } = valid;
    expect(CreateEventBody.safeParse(body).success).toBe(false);
  });

  it('rejects invalid eventType', () => {
    expect(CreateEventBody.safeParse({ ...valid, eventType: 'party' }).success).toBe(false);
  });

  it('accepts all valid event types', () => {
    for (const eventType of ['summit', 'conference', 'marketing', 'leadership', 'regional', 'other'] as const) {
      expect(CreateEventBody.safeParse({ ...valid, eventType }).success).toBe(true);
    }
  });

  it('accepts optional endDate', () => {
    expect(CreateEventBody.safeParse({ ...valid, endDate: '2027-09-03' }).success).toBe(true);
  });
});

describe('UpdateEventBody', () => {
  it('accepts empty object', () => {
    expect(UpdateEventBody.safeParse({}).success).toBe(true);
  });

  it('accepts partial update', () => {
    expect(UpdateEventBody.safeParse({ name: 'Updated Summit', city: 'Dallas' }).success).toBe(true);
  });

  it('rejects invalid eventType', () => {
    expect(UpdateEventBody.safeParse({ eventType: 'picnic' }).success).toBe(false);
  });
});

describe('ListEventsQueryParams', () => {
  it('accepts empty params', () => {
    expect(ListEventsQueryParams.safeParse({}).success).toBe(true);
  });

  it('coerces upcoming string to boolean', () => {
    const result = ListEventsQueryParams.safeParse({ upcoming: 'true' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.upcoming).toBe(true);
  });
});

// ─── Invitation schemas ───────────────────────────────────────────────────────

describe('CreateInvitationBody', () => {
  it('accepts a valid payload', () => {
    expect(CreateInvitationBody.safeParse({ personId: 1 }).success).toBe(true);
  });

  it('accepts optional notes', () => {
    expect(CreateInvitationBody.safeParse({ personId: 1, notes: 'VIP guest' }).success).toBe(true);
  });

  it('rejects missing personId', () => {
    expect(CreateInvitationBody.safeParse({}).success).toBe(false);
  });

  it('rejects non-numeric personId', () => {
    expect(CreateInvitationBody.safeParse({ personId: 'abc' }).success).toBe(false);
  });
});

describe('UpdateInvitationBody', () => {
  it('accepts valid status values', () => {
    for (const status of ['invited', 'attended', 'no_show', 'declined'] as const) {
      expect(UpdateInvitationBody.safeParse({ status }).success).toBe(true);
    }
  });

  it('rejects invalid status', () => {
    expect(UpdateInvitationBody.safeParse({ status: 'maybe' }).success).toBe(false);
  });
});

// ─── Virtual meeting schemas ──────────────────────────────────────────────────

describe('CreateVirtualMeetingBody', () => {
  it('accepts a valid payload', () => {
    expect(CreateVirtualMeetingBody.safeParse({ title: 'Sync', status: 'scheduled' }).success).toBe(true);
  });

  it('rejects missing title', () => {
    expect(CreateVirtualMeetingBody.safeParse({ status: 'scheduled' }).success).toBe(false);
  });

  it('rejects invalid status', () => {
    expect(CreateVirtualMeetingBody.safeParse({ title: 'Sync', status: 'pending' }).success).toBe(false);
  });

  it('accepts all valid statuses', () => {
    for (const status of ['suggested', 'scheduled', 'completed', 'cancelled'] as const) {
      expect(CreateVirtualMeetingBody.safeParse({ title: 'Sync', status }).success).toBe(true);
    }
  });
});

describe('UpdateVirtualMeetingBody', () => {
  it('accepts empty object', () => {
    expect(UpdateVirtualMeetingBody.safeParse({}).success).toBe(true);
  });

  it('rejects invalid status', () => {
    expect(UpdateVirtualMeetingBody.safeParse({ status: 'deleted' }).success).toBe(false);
  });
});

describe('ListVirtualMeetingsQueryParams', () => {
  it('accepts empty params', () => {
    expect(ListVirtualMeetingsQueryParams.safeParse({}).success).toBe(true);
  });

  it('accepts valid status filter', () => {
    expect(ListVirtualMeetingsQueryParams.safeParse({ status: 'completed' }).success).toBe(true);
  });

  it('rejects invalid status', () => {
    expect(ListVirtualMeetingsQueryParams.safeParse({ status: 'unknown' }).success).toBe(false);
  });
});
