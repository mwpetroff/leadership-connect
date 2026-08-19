---
name: Event sponsors architecture
description: How multi-sponsor support is modeled and why; covers schema, API, and UI patterns.
---

## Rule
Event sponsors use a junction table (`event_sponsors`), not a single FK on `events`. Multiple sponsors are allowed per event.

**Why:** User explicitly asked for "more than one sponsor per event." The old `sponsor_id` FK on events was migrated out in migration 0010.

## Schema
- `event_sponsors(event_id PK, person_id PK, added_at)` — cascade delete on both FKs
- `events` still has `organizer_id` (single FK, set null on delete) — organizer stays singular
- `events.sponsor_id` column was dropped in migration 0010

## API pattern (mirrors leaders)
- `GET  /events/:eventId/sponsors` — list sponsors for event
- `POST /events/:eventId/sponsors` — add one sponsor `{ personId }`
- `DELETE /events/:eventId/sponsors/:personId` — remove one sponsor
- `POST /events` accepts `sponsorIds?: number[]` — bulk-inserts after event creation
- `eventWithCounts` returns `sponsors: PersonSummary[]` (array, never single)

## Frontend
- **Create wizard**: multi-sponsor via `AddPersonRow` component (step 1, same pattern as executives/leaders)
- **Detail page**: sponsors shown inline with "hover to reveal remove" × buttons + "+ Add" button (admin only)
- **Edit dialog (EventForm)**: does NOT manage sponsors — they're managed inline on the detail page like leaders
- **EventForm** now also collects: organizer (single PersonPicker), primary venue (VenuePicker), evening venue (VenuePicker + toggle), city/state text fallback when no venue selected

## How to apply
- Whenever touching event create/update flows, pass `sponsorIds` (array) not `sponsorId`
- Response shape from any event endpoint has `.sponsors` (array), `.organizer` (object or null) — not `.sponsor`
