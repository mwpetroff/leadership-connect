import { vi } from 'vitest';

/**
 * Creates a chainable Drizzle-like query builder mock that resolves to `data`.
 * Usage:
 *   mockDb.select.mockReturnValue(chain([person1, person2]));
 */
export function chain<T>(data: T[] = []) {
  const obj: Record<string, unknown> = {};
  const methods = [
    'from', 'where', 'orderBy', 'limit', 'offset',
    'leftJoin', 'innerJoin', 'set', 'values',
  ];

  // Make every chainable method return `obj` itself
  for (const m of methods) {
    obj[m] = vi.fn().mockReturnValue(obj);
  }

  // Terminal methods that return a promise resolving to data
  obj['returning'] = vi.fn().mockResolvedValue(data);

  // Allow `await db.select()...` by making the chain itself a thenable
  obj['then'] = (resolve: (v: T[]) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(data).then(resolve, reject);

  return obj;
}

/** Standard person fixture */
export const personFixture = {
  id: 1,
  name: 'Jane Smith',
  email: 'jane@company.com',
  title: 'Engineer',
  department: 'Engineering',
  role: 'staff' as const,
  homeCity: 'Austin',
  homeState: 'TX',
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/** Standard event fixture */
export const eventFixture = {
  id: 10,
  name: 'Austin Tech Summit',
  description: 'Annual summit',
  location: 'Austin Convention Center',
  city: 'Austin',
  state: 'TX',
  startDate: '2026-12-01',
  endDate: '2026-12-02',
  eventType: 'summit' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/** Standard executive fixture */
export const executiveFixture = {
  id: 99,
  name: 'Alice CEO',
  email: 'alice@company.com',
  title: 'Chief Executive Officer',
  department: 'Executive',
  role: 'executive' as const,
  homeCity: 'New York',
  homeState: 'NY',
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
