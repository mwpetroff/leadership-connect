/**
 * Microsoft Graph API integration.
 *
 * All public functions are "optional" — they return null/void and log
 * a warning on failure so the calling route can degrade gracefully.
 * Graph operations are only attempted when the server has Azure AD
 * credentials AND the request carries a valid MSAL account session.
 */

import type { Request } from "express";
import { azureEnabled, getMsalClient } from "./auth";

// ── Scopes ────────────────────────────────────────────────────────────────────

// Scopes requested during silent token acquisition for Graph API calls.
// MUST be a subset of the scopes consented at login (MSAL_SCOPES in auth.ts)
// so that acquireTokenSilent never requires an additional consent prompt.
export const GRAPH_SCOPES = [
  "Calendars.ReadWrite",
  "OnlineMeetings.ReadWrite",
  // Required alongside OnlineMeetings.ReadWrite for POST/DELETE /me/onlineMeetings.
  "OnlineMeetings.ReadWrite.All",
];

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// ── Token acquisition ─────────────────────────────────────────────────────────

/**
 * Obtain a Graph access token for the signed-in user using MSAL's silent
 * token acquisition (refresh-token grant). Returns null when the server
 * is not Azure-enabled, the user's account is not in the MSAL cache (e.g.
 * after a server restart), or the silent refresh fails.
 *
 * Callers should always treat null as "Graph unavailable" and proceed
 * without creating the calendar item rather than returning an error.
 */
export async function getGraphAccessToken(req: Request): Promise<string | null> {
  if (!azureEnabled) return null;

  const accountId = req.session.msalAccountId;
  if (!accountId) return null;

  try {
    const client = getMsalClient();
    const cache = client.getTokenCache();
    const account = await cache.getAccountByLocalId(accountId);
    if (!account) return null;

    const result = await client.acquireTokenSilent({
      account,
      scopes: GRAPH_SCOPES,
    });

    return result?.accessToken ?? null;
  } catch (err) {
    console.warn("[graph] Silent token acquisition failed:", String(err));
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function graphFetch(
  token: string,
  path: string,
  options: RequestInit,
): Promise<Response> {
  return fetch(`${GRAPH_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) ?? {}),
    },
  });
}

// ── Outlook calendar events ───────────────────────────────────────────────────

export interface CalendarEventDetails {
  subject: string;
  /** ISO-8601 date-time string in UTC */
  startDateTime: string;
  /** ISO-8601 date-time string in UTC */
  endDateTime: string;
  location?: string;
  bodyHtml?: string;
  /** Email addresses of attendees to invite */
  attendeeEmails?: string[];
}

/**
 * Create an Outlook calendar event on behalf of the signed-in user.
 * Returns the Graph event ID (for later cancellation) or null on failure.
 */
export async function createOutlookCalendarEvent(
  token: string,
  details: CalendarEventDetails,
): Promise<string | null> {
  try {
    const body: Record<string, unknown> = {
      subject: details.subject,
      start: { dateTime: details.startDateTime, timeZone: "UTC" },
      end: { dateTime: details.endDateTime, timeZone: "UTC" },
    };

    if (details.location) {
      body.location = { displayName: details.location };
    }

    if (details.bodyHtml) {
      body.body = { contentType: "HTML", content: details.bodyHtml };
    }

    if (details.attendeeEmails && details.attendeeEmails.length > 0) {
      body.attendees = details.attendeeEmails.map((email) => ({
        emailAddress: { address: email },
        type: "required",
      }));
    }

    const response = await graphFetch(token, "/me/events", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.warn(
        `[graph] Failed to create calendar event: ${response.status} ${text}`,
      );
      return null;
    }

    const data = (await response.json()) as { id?: string };
    return data.id ?? null;
  } catch (err) {
    console.warn("[graph] Error creating calendar event:", String(err));
    return null;
  }
}

/**
 * Mark an Outlook calendar event as cancelled.
 * Fails silently — the invitation/meeting is not rolled back.
 */
export async function cancelOutlookCalendarEvent(
  token: string,
  eventId: string,
): Promise<void> {
  try {
    const response = await graphFetch(
      token,
      `/me/events/${encodeURIComponent(eventId)}/cancel`,
      {
        method: "POST",
        body: JSON.stringify({ comment: "This event has been cancelled." }),
      },
    );
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.warn(
        `[graph] Failed to cancel calendar event ${eventId}: ${response.status} ${text}`,
      );
    }
  } catch (err) {
    console.warn("[graph] Error cancelling calendar event:", String(err));
  }
}

// ── Teams online meetings ─────────────────────────────────────────────────────

export interface TeamsMeetingDetails {
  subject: string;
  /** ISO-8601 date-time string in UTC */
  startDateTime: string;
  /** ISO-8601 date-time string in UTC */
  endDateTime: string;
}

export interface TeamsMeetingResult {
  meetingId: string;
  joinUrl: string;
}

/**
 * Create a Teams online meeting on behalf of the signed-in user.
 * Returns the meeting ID and join URL or null on failure.
 */
export async function createTeamsMeeting(
  token: string,
  details: TeamsMeetingDetails,
): Promise<TeamsMeetingResult | null> {
  try {
    const response = await graphFetch(token, "/me/onlineMeetings", {
      method: "POST",
      body: JSON.stringify({
        subject: details.subject,
        startDateTime: details.startDateTime,
        endDateTime: details.endDateTime,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.warn(
        `[graph] Failed to create Teams meeting: ${response.status} ${text}`,
      );
      return null;
    }

    const data = (await response.json()) as {
      id?: string;
      joinWebUrl?: string;
      joinUrl?: string;
    };
    const joinUrl = data.joinWebUrl ?? data.joinUrl;

    if (!data.id || !joinUrl) {
      console.warn("[graph] Teams meeting response missing id or joinUrl");
      return null;
    }

    return { meetingId: data.id, joinUrl };
  } catch (err) {
    console.warn("[graph] Error creating Teams meeting:", String(err));
    return null;
  }
}

/**
 * Delete/cancel a Teams online meeting.
 * Fails silently — the virtual meeting record is not rolled back.
 */
export async function cancelTeamsMeeting(
  token: string,
  meetingId: string,
): Promise<void> {
  try {
    const response = await graphFetch(
      token,
      `/me/onlineMeetings/${encodeURIComponent(meetingId)}`,
      { method: "DELETE" },
    );
    if (!response.ok && response.status !== 404) {
      const text = await response.text().catch(() => "");
      console.warn(
        `[graph] Failed to cancel Teams meeting ${meetingId}: ${response.status} ${text}`,
      );
    }
  } catch (err) {
    console.warn("[graph] Error cancelling Teams meeting:", String(err));
  }
}
