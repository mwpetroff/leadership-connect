# Leadership Connect Backlog

This is a GitHub-friendly snapshot of the active product backlog. Replit's internal task specifications remain in `.local/tasks/`, which is intentionally ignored by Git.

## Queued work

These items are accepted and waiting for implementation:

- Bring up a person's profile, event detail, or meeting page when a result is selected
- Let executives print or share the briefing before heading into an event
- Confirm bulk re-imports don't wipe map coordinates for unchanged addresses
- Prevent a bad import from leaving the directory half-updated if the database fails mid-batch
- Show a quick engagement snapshot on each person's profile page
- Stop map coordinates from drifting when a person moves to a new city
- Let meetings be scheduled at a specific time, not always 10 AM UTC
- Make search work on mobile so staff can find anyone from their phone
- Confirm the briefing endpoint stays fast as events get larger

## Proposed work

- Prevent the app from slowing to a crawl as the team grows
- Confirm the hourly geocode job doesn't hammer the database when the directory is large
- Confirm the geocode backfill admin endpoint is covered by audit logging
- Confirm the most important user flows can't silently break
- Confirm the CSV export and import round-trip without data loss
- Let HR filter the export by role or department before downloading
- Catch broken database queries before they reach production

## Recently completed

- Keep map coordinates fresh when bulk imports or seed scripts add people
- Keep Teams meeting links accurate when a meeting date is rescheduled
- Let HR download the current people directory as a CSV

The Replit task queue is the source of truth for status, assignment, and dependencies.