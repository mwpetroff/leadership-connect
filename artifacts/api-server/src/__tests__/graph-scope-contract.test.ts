/**
 * Regression guard: GRAPH_SCOPES must be a strict subset of MSAL_SCOPES.
 *
 * acquireTokenSilent requests GRAPH_SCOPES; the user consented to MSAL_SCOPES
 * at login. If any GRAPH scope is absent from the consented login scopes,
 * acquireTokenSilent requires additional consent, fails silently, and returns
 * null — so calendar/Teams provisioning is skipped with no user-visible error.
 */
import { describe, it, expect } from 'vitest';
import { MSAL_SCOPES } from '../lib/auth';
import { GRAPH_SCOPES } from '../lib/graph';

describe('Graph scope contract', () => {
  it('every GRAPH_SCOPE is present in MSAL_SCOPES (silent acquisition never needs extra consent)', () => {
    const msalSet = new Set(MSAL_SCOPES);
    const missing = GRAPH_SCOPES.filter((s) => !msalSet.has(s));
    expect(
      missing,
      `These scopes are requested silently but were NOT consented at login: ${missing.join(', ')}. ` +
      `Add them to MSAL_SCOPES in auth.ts or remove them from GRAPH_SCOPES in graph.ts.`,
    ).toHaveLength(0);
  });

  it('GRAPH_SCOPES contains only the required calendar and meeting permissions', () => {
    // OnlineMeetings.ReadWrite.All is required alongside OnlineMeetings.ReadWrite
    // for POST /me/onlineMeetings and DELETE /me/onlineMeetings/{id}; Graph
    // returns 403 for delegated operations without it.
    const expected = new Set([
      'Calendars.ReadWrite',
      'OnlineMeetings.ReadWrite',
      'OnlineMeetings.ReadWrite.All',
    ]);
    const actual = new Set(GRAPH_SCOPES.filter((s) => !['openid', 'profile', 'email', 'offline_access'].includes(s)));
    for (const scope of actual) {
      expect(expected, `Unexpected Graph scope "${scope}" — add it to the expected set or remove it`).toContain(scope);
    }
  });
});
