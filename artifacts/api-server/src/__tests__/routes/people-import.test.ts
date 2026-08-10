import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ─── Hoisted fixtures & mocks ─────────────────────────────────────────────────

const { mockDb, makeChain } = vi.hoisted(() => {
  function makeChain(result: unknown[]) {
    const c: Record<string, unknown> = {};
    for (const m of [
      'from', 'where', 'orderBy', 'limit', 'innerJoin', 'leftJoin',
      'set', 'values', 'onConflictDoNothing',
    ]) {
      c[m] = vi.fn().mockReturnValue(c);
    }
    // onConflictDoUpdate returns a chain that resolves with the upserted rows
    c['onConflictDoUpdate'] = vi.fn().mockResolvedValue([]);
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

  return { mockDb, makeChain };
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
  eventsTable: { id: 'id', startDate: 'startDate' },
  eventLeadersTable: {},
  invitationsTable: { id: 'id', eventId: 'eventId', personId: 'personId', status: 'status' },
  virtualMeetingsTable: { id: 'id', status: 'status', scheduledDate: 'scheduledDate' },
  virtualMeetingParticipantsTable: { meetingId: 'meetingId', personId: 'personId' },
  settingsTable: { key: 'key', value: 'value' },
  auditLogTable: {
    id: 'id', actorId: 'actorId', actorName: 'actorName',
    action: 'action', resourceType: 'resourceType', resourceId: 'resourceId',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ eq: [a, b] })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  or: vi.fn((...args: unknown[]) => ({ or: args })),
  ilike: vi.fn((a: unknown, b: unknown) => ({ ilike: [a, b] })),
  desc: vi.fn((a: unknown) => ({ desc: a })),
  inArray: vi.fn((a: unknown, b: unknown) => ({ inArray: [a, b] })),
  isNull: vi.fn((a: unknown) => ({ isNull: a })),
  sql: Object.assign(vi.fn((s: TemplateStringsArray) => ({ sql: s[0] })), { raw: vi.fn() }),
}));

vi.mock('../../lib/geocoding', () => ({
  geocodeCity: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../lib/audit', () => ({
  logAudit: vi.fn(),
}));

// ─── Import app after mocks ───────────────────────────────────────────────────

import app from '../../app';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function postImport(csv: string) {
  return request(app)
    .post('/api/people/import')
    .set('Content-Type', 'text/plain')
    .send(csv);
}

/** Extract a string representation from a drizzle sql`` template value for assertions. */
function upsertSqlString(val: unknown): string {
  if (val == null) return 'null';
  if (typeof val === 'string') return val;
  // drizzle sql tagged template mock returns { sql: '...' }
  if (typeof val === 'object' && 'sql' in (val as Record<string, unknown>)) {
    return String((val as Record<string, unknown>)['sql']);
  }
  return JSON.stringify(val);
}

const VALID_CSV = [
  'name,email,role,title,department,homeCity,homeState',
  'Jane Smith,jane@test.com,staff,Engineer,Engineering,Austin,TX',
  'John Doe,john@test.com,executive,VP Sales,Sales,New York,NY',
].join('\n');

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/people/import', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Default: no existing people (all rows will be "created")
    mockDb.select.mockReturnValue(makeChain([]));
    mockDb.insert.mockReturnValue(makeChain([]));
  });

  // ── Input validation ─────────────────────────────────────────────────────

  it('returns 400 when body is empty (no CSV text)', async () => {
    const res = await request(app)
      .post('/api/people/import')
      .set('Content-Type', 'text/plain')
      .send('   ');
    expect(res.status).toBe(400);
  });

  it('returns 400 when csv has only a header row (no data)', async () => {
    const res = await postImport('name,email,role');
    expect(res.status).toBe(400);
  });

  // ── Happy path ───────────────────────────────────────────────────────────

  it('returns 200 with created/updated/skipped counts', async () => {
    mockDb.select
      .mockReturnValueOnce(makeChain([]))  // inArray existing-email check
      .mockReturnValueOnce(makeChain([])); // total-count query for audit
    const upsertChain = makeChain([]);
    mockDb.insert.mockReturnValue(upsertChain);

    const res = await postImport(VALID_CSV);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 2, updated: 0, skipped: [] });
  });

  it('counts pre-existing emails as updated, not created', async () => {
    // Pretend jane@test.com already exists
    mockDb.select
      .mockReturnValueOnce(makeChain([{ email: 'jane@test.com' }]))
      .mockReturnValueOnce(makeChain([]));
    const upsertChain = makeChain([]);
    mockDb.insert.mockReturnValue(upsertChain);

    const res = await postImport(VALID_CSV);
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);
    expect(res.body.updated).toBe(1);
  });

  it('calls insert().onConflictDoUpdate() for the upsert', async () => {
    mockDb.select.mockReturnValue(makeChain([]));
    const chain = makeChain([]);
    mockDb.insert.mockReturnValue(chain);

    await postImport(VALID_CSV);

    expect(mockDb.insert).toHaveBeenCalled();
    expect(chain.values).toHaveBeenCalled();
    expect(chain.onConflictDoUpdate).toHaveBeenCalled();
  });

  // ── Row validation / skipped rows ────────────────────────────────────────

  it('skips a row with a missing name', async () => {
    mockDb.select.mockReturnValue(makeChain([]));
    mockDb.insert.mockReturnValue(makeChain([]));

    const csv = [
      'name,email,role',
      ',missing-name@test.com,staff',
      'Valid Person,valid@test.com,staff',
    ].join('\n');

    const res = await postImport(csv);
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);
    expect(res.body.skipped).toHaveLength(1);
    expect(res.body.skipped[0].reason).toMatch(/name/i);
  });

  it('skips a row with a missing email', async () => {
    mockDb.select.mockReturnValue(makeChain([]));
    mockDb.insert.mockReturnValue(makeChain([]));

    const csv = [
      'name,email,role',
      'No Email Person,,staff',
      'Valid Person,valid@test.com,staff',
    ].join('\n');

    const res = await postImport(csv);
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);
    expect(res.body.skipped).toHaveLength(1);
    expect(res.body.skipped[0].reason).toMatch(/email/i);
  });

  it('skips a row with an invalid email (no @)', async () => {
    mockDb.select.mockReturnValue(makeChain([]));
    mockDb.insert.mockReturnValue(makeChain([]));

    const csv = [
      'name,email,role',
      'Bad Email,notanemail,staff',
    ].join('\n');

    const res = await postImport(csv);
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(0);
    expect(res.body.skipped).toHaveLength(1);
  });

  it('skips the second occurrence of a duplicate email within the file', async () => {
    mockDb.select.mockReturnValue(makeChain([]));
    mockDb.insert.mockReturnValue(makeChain([]));

    const csv = [
      'name,email',
      'Alice,alice@test.com',
      'Alice Duplicate,alice@test.com',
      'Bob,bob@test.com',
    ].join('\n');

    const res = await postImport(csv);
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(2); // alice (first) + bob
    expect(res.body.skipped).toHaveLength(1);
    expect(res.body.skipped[0].reason).toMatch(/duplicate/i);
  });

  it('defaults role to staff for unrecognised role values', async () => {
    mockDb.select.mockReturnValue(makeChain([]));
    const chain = makeChain([]);
    mockDb.insert.mockReturnValue(chain);

    const csv = [
      'name,email,role',
      'Alice,alice@test.com,superadmin',
    ].join('\n');

    await postImport(csv);

    // The values() call receives the row with role normalised to 'staff'
    const [insertedValues] = (chain.values as ReturnType<typeof vi.fn>).mock.calls[0] as [Array<{ role: string }>];
    expect(insertedValues[0].role).toBe('staff');
  });

  it('skips the row number correctly (header is row 1, first data row is row 2)', async () => {
    mockDb.select.mockReturnValue(makeChain([]));
    mockDb.insert.mockReturnValue(makeChain([]));

    const csv = [
      'name,email',
      'Alice,alice@test.com',
      ',bad@test.com',      // row 3 — missing name
    ].join('\n');

    const res = await postImport(csv);
    expect(res.body.skipped[0].row).toBe(3);
  });

  // ── Column aliases ───────────────────────────────────────────────────────

  it('accepts "full name" and "work email" column aliases', async () => {
    mockDb.select.mockReturnValue(makeChain([]));
    const chain = makeChain([]);
    mockDb.insert.mockReturnValue(chain);

    const csv = [
      'full name,work email,role',
      'Jane Smith,jane.alias@test.com,staff',
    ].join('\n');

    const res = await postImport(csv);
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);
  });

  it('accepts "job title" and "dept" aliases', async () => {
    mockDb.select.mockReturnValue(makeChain([]));
    const chain = makeChain([]);
    mockDb.insert.mockReturnValue(chain);

    const csv = [
      'name,email,job title,dept',
      'Bob,bob@test.com,Senior Dev,Eng',
    ].join('\n');

    const res = await postImport(csv);
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);

    const [insertedValues] = (chain.values as ReturnType<typeof vi.fn>).mock.calls[0] as [Array<{ title: string; department: string }>];
    expect(insertedValues[0].title).toBe('Senior Dev');
    expect(insertedValues[0].department).toBe('Eng');
  });

  // ── Quoted field handling ────────────────────────────────────────────────

  it('handles commas inside quoted fields', async () => {
    mockDb.select.mockReturnValue(makeChain([]));
    const chain = makeChain([]);
    mockDb.insert.mockReturnValue(chain);

    // "Smith, Jane" — comma inside quotes must not split the field
    const csv = 'name,email\n"Smith, Jane",jane.q@test.com\n';

    const res = await postImport(csv);
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);

    const [insertedValues] = (chain.values as ReturnType<typeof vi.fn>).mock.calls[0] as [Array<{ name: string }>];
    expect(insertedValues[0].name).toBe('Smith, Jane');
  });

  it('handles newlines inside quoted fields without creating phantom rows', async () => {
    mockDb.select.mockReturnValue(makeChain([]));
    const chain = makeChain([]);
    mockDb.insert.mockReturnValue(chain);

    // A title with an embedded newline in quotes — should parse as ONE logical row
    const csv = 'name,email,title\n"Jane Smith","jane.nl@test.com","Sr. Engineer\nTeam Lead"\n';

    const res = await postImport(csv);
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);
    expect(res.body.skipped).toHaveLength(0);
  });

  it('handles escaped double-quotes ("") inside quoted fields', async () => {
    mockDb.select.mockReturnValue(makeChain([]));
    const chain = makeChain([]);
    mockDb.insert.mockReturnValue(chain);

    // Title: She said "hello" → encoded as "She said ""hello"""
    const csv = 'name,email,title\nJane,jane.eq@test.com,"She said ""hello"""\n';

    const res = await postImport(csv);
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);

    const [insertedValues] = (chain.values as ReturnType<typeof vi.fn>).mock.calls[0] as [Array<{ title: string }>];
    expect(insertedValues[0].title).toBe('She said "hello"');
  });

  // ── Returns 200 with zero counts when all rows are skipped ───────────────

  it('returns 200 with zero created/updated when all rows fail validation', async () => {
    // Rows have content but fail field validation (missing name), so parser
    // sees real rows but import logic skips them all → 200 with skipped list.
    const csv = [
      'name,email',
      ',no-name-a@test.com',
      ',no-name-b@test.com',
    ].join('\n');

    const res = await postImport(csv);
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(0);
    expect(res.body.updated).toBe(0);
    expect(res.body.skipped.length).toBeGreaterThan(0);
  });
});

  // ── Coordinate preservation on update ────────────────────────────────────

  it('preserves existing lat/lng when city/state are unchanged (non-location update)', async () => {
    mockDb.select.mockReturnValue(makeChain([]));
    const chain = makeChain([]);
    mockDb.insert.mockReturnValue(chain);

    // Role-only update — city/state same as before
    const csv = 'name,email,role\nJane Smith,jane@coord.com,executive\n';
    await postImport(csv);

    const upsertArg = (chain.onConflictDoUpdate as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      set: Record<string, unknown>;
    };
    // The SQL for lat/lng/geocodedAt must be CASE-based, not a bare null
    const latSql = String(upsertSqlString(upsertArg.set['lat']));
    expect(latSql.toLowerCase()).toContain('case when');
    expect(latSql.toLowerCase()).toContain('else');
  });

  // ── Separate first/last name columns ─────────────────────────────────────

  it('rejects all rows when file has separate first/last name columns (no silent truncation)', async () => {
    const csv = [
      'first name,last name,email,role',
      'Jane,Smith,jane.split@test.com,staff',
      'John,Doe,john.split@test.com,staff',
    ].join('\n');

    const res = await postImport(csv);
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(0);
    expect(res.body.skipped).toHaveLength(2);
    expect(res.body.skipped[0].reason).toMatch(/separate.*first name.*last name|combine/i);
  });

  it('accepts a file with a "full name" column (valid alias)', async () => {
    mockDb.select.mockReturnValue(makeChain([]));
    const chain = makeChain([]);
    mockDb.insert.mockReturnValue(chain);

    const csv = 'full name,email\nJane Smith,jane.fn@test.com\n';
    const res = await postImport(csv);
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);
  });

  // ── Large-payload / chunking ─────────────────────────────────────────────

  it('accepts a payload larger than 100 KB without returning 413', async () => {
    // Build a CSV well over 100 KB (each row ≈ 80 bytes, 2,000 rows ≈ 160 KB)
    const header = 'name,email,role,title,department,homeCity,homeState\n';
    const rows = Array.from({ length: 2000 }, (_, i) =>
      `Person ${i},person${i}@bigtest.com,staff,Software Engineer,Engineering,Austin,TX`,
    ).join('\n');
    const bigCsv = header + rows;
    expect(Buffer.byteLength(bigCsv, 'utf8')).toBeGreaterThan(100_000);

    mockDb.select.mockReturnValue(makeChain([]));
    mockDb.insert.mockReturnValue(makeChain([]));

    const res = await postImport(bigCsv);
    expect(res.status).not.toBe(413);
    expect(res.status).toBe(200);
  });

  it('issues multiple insert calls when row count exceeds the chunk size (500)', async () => {
    // 1,100 valid rows → expect ceil(1100/500) = 3 insert() calls
    const header = 'name,email\n';
    const rows = Array.from({ length: 1100 }, (_, i) =>
      `Person ${i},person${i}@chunk.com`,
    ).join('\n');
    const csv = header + rows;

    // Each call chain must independently resolve
    let insertCallCount = 0;
    mockDb.insert.mockImplementation(() => {
      insertCallCount++;
      return makeChain([]);
    });
    mockDb.select.mockReturnValue(makeChain([]));

    const res = await postImport(csv);
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1100);
    // 1100 rows / 500 chunk size → 3 upsert chunks + 1 select for audit = 4 insert calls
    expect(insertCallCount).toBe(3);
  });

  it('issues multiple select calls to look up existing emails in chunks', async () => {
    // 600 rows → 2 email-lookup select calls (chunk size 500)
    const header = 'name,email\n';
    const rows = Array.from({ length: 600 }, (_, i) =>
      `Person ${i},person${i}@emailchunk.com`,
    ).join('\n');
    const csv = header + rows;

    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      return makeChain([]);
    });
    mockDb.insert.mockReturnValue(makeChain([]));

    await postImport(csv);
    // 2 email-lookup chunks + 1 audit total-count select = 3 selects
    expect(selectCallCount).toBe(3);
  });

// ─── parseCSV unit tests ─────────────────────────────────────────────────────

import { parseCSV } from '../../routes/people';

describe('parseCSV (unit)', () => {
  it('returns empty array for header-only CSV', () => {
    expect(parseCSV('name,email')).toEqual([]);
  });

  it('parses a basic two-column CSV', () => {
    const result = parseCSV('name,email\nAlice,alice@test.com');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: 'Alice', email: 'alice@test.com' });
  });

  it('normalises CRLF line endings', () => {
    const result = parseCSV('name,email\r\nAlice,alice@test.com\r\n');
    expect(result).toHaveLength(1);
  });

  it('handles a trailing newline without creating an empty record', () => {
    const result = parseCSV('name,email\nAlice,alice@test.com\n');
    expect(result).toHaveLength(1);
  });

  it('strips whitespace from header names', () => {
    const result = parseCSV(' name , email \nAlice,alice@test.com');
    expect(result[0]).toHaveProperty('name');
    expect(result[0]).toHaveProperty('email');
  });

  it('parses a quoted field containing a comma', () => {
    const result = parseCSV('name,email\n"Smith, Jane",jane@test.com');
    expect(result[0].name).toBe('Smith, Jane');
  });

  it('parses a quoted field containing a newline', () => {
    const result = parseCSV('name,title\n"Alice","Engineer\nTeam Lead"');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Engineer\nTeam Lead');
  });

  it('decodes escaped double-quotes ("") inside quoted fields', () => {
    const result = parseCSV('name,title\nAlice,"She said ""hello"""');
    expect(result[0].title).toBe('She said "hello"');
  });

  it('handles missing columns gracefully (returns empty string)', () => {
    const result = parseCSV('name,email,role\nAlice,alice@test.com');
    expect(result[0].role).toBe('');
  });
});
