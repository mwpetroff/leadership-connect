# Touchpoint Backlog

Product queue after the HRBP rework. HR business partners are the primary users; executives and leaders remain in the directory and can still log meetings and events.

## Queued work

- Wrap people CSV import in a transaction so a mid-batch database failure cannot leave the directory half-updated (the upsert is chunked and then a second pass writes manager/HRBP links)
- Print or share an event briefing; retarget it for HRBPs covering an onsite, not only executives, and rank invitees by coverage-clock gaps instead of the old generic touchpoint
- Confirm the briefing endpoint stays fast as events get larger (~700-person org, large invite lists)

## Proposed work

- Let HR filter CSV export by the current lens (caseload / department / leader) plus role, instead of always dumping the full directory
- Confirm CSV export → import round-trips `department`, `hrbpEmail`, `isHrbp`, and `status` without data loss
- Confirm geocode backfill (runs once at API startup, not hourly) is audit-logged and does not hammer the database at ~700 people
- Add coverage for the main HRBP flows so they cannot silently break: lenses, import skip-unknown-department, coverage clocks, org chart with inactive managers
- Catch broken database queries before they reach production
- Performance work if the org grows well past ~700 (lens filtering is in-memory on the loaded directory by design)

## Recently completed

- HRBPs can edit a person and leaders/HRBPs can log a 1:1 from the profile (delete stays admin)
- Four coverage clocks on each person profile
- Header search on mobile
- Meetings store a real clock time; Teams uses that instant instead of 10:00 UTC
- OpenAPI codegen for lens params, `meetingKind`, department CRUD, event venues/sponsors, and coverage dashboard types
- Touchpoint HRBP workspace: departments, explicit HRBP assignment, session lenses, org chart (tree + boxes), four coverage clocks
- Department parent (division) picker in Settings
- Suggestions Hub coverage-gap list (`GET /suggestions/coverage`)
- Clicking a search result opens that person, event, or meeting (desktop)
- Re-geocode when a person’s city or state changes on save; bulk import keeps lat/lng when the address is unchanged
- Keep map coordinates fresh when bulk imports or seed scripts add people
- Keep Teams meeting links accurate when a meeting date is rescheduled
- Let HR download the current people directory as a CSV (HRBP column set)
