# Touchpoint Backlog

Product queue after the HRBP rework. HR business partners are the primary users; executives and leaders remain in the directory and can still log meetings and events.

## Queued work

Accepted and waiting. Ordered by how much they unblock daily HRBP use of the preview:

- Let HRBPs edit a person and log a 1:1 from the profile page (create/update is allowed in the spec; the detail page is still admin-only)
- Show the four coverage clocks on each person profile (today it is a single “last touchpoint / 90 days” snapshot)
- Make header search available on a phone (desktop search already opens the person, event, or meeting)
- Let a meeting be scheduled at a real clock time, not only a date (currently stored as a date and shown as 10:00 UTC)
- Wrap people CSV import in a transaction so a mid-batch database failure cannot leave the directory half-updated (the upsert is chunked and then a second pass writes manager/HRBP links)
- Print or share an event briefing; retarget it for HRBPs covering an onsite, not only executives, and rank invitees by coverage-clock gaps instead of the old generic touchpoint
- Confirm the briefing endpoint stays fast as events get larger (~700-person org, large invite lists)

## Proposed work

Not accepted yet — needs a product call or a tighter spec:

- Let HR filter CSV export by the current lens (caseload / department / leader) plus role, instead of always dumping the full directory
- Confirm CSV export → import round-trips `department`, `hrbpEmail`, `isHrbp`, and `status` without data loss (the column set already matches the HRBP import contract)
- Confirm geocode backfill (runs once at API startup, not hourly) is audit-logged and does not hammer the database at ~700 people
- Add coverage for the main HRBP flows so they cannot silently break: lenses, import skip-unknown-department, coverage clocks, org chart with inactive managers
- Catch broken database queries before they reach production
- Performance work if the org grows well past ~700 (lens filtering is in-memory on the loaded directory by design)

## Recently completed (including items that were still queued but already shipped)

- OpenAPI codegen for lens params, `meetingKind`, department CRUD, event venues/sponsors, and coverage dashboard types
- Touchpoint HRBP workspace: departments, explicit HRBP assignment, session lenses, org chart (tree + boxes), four coverage clocks
- Department parent (division) picker in Settings
- Suggestions Hub coverage-gap list (`GET /suggestions/coverage`)
- Clicking a search result opens that person, event, or meeting (desktop)
- Re-geocode when a person’s city or state changes on save; bulk import keeps lat/lng when the address is unchanged
- Keep map coordinates fresh when bulk imports or seed scripts add people
- Keep Teams meeting links accurate when a meeting date is rescheduled
- Let HR download the current people directory as a CSV (HRBP column set)

Dropped from the queue as stale after the rework:

- “Prevent the app from slowing to a crawl as the team grows” as an open engineering epic — the product target is ~600–700 people and the current architecture is sized for that. Revisit only if the org grows well past that.
- “Make search work on mobile so staff can find anyone” as originally written — search is an HRBP/leader tool and already works on desktop; the remaining gap is the mobile header, listed above.
