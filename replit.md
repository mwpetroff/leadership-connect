# Leadership Connect

A leadership engagement platform that helps executives and secondary leaders stay connected with staff through smart in-person meetup suggestions and virtual touchpoint tracking.

## Documentation

- `BACKLOG.md` — GitHub-friendly snapshot of the current product backlog
- `.local/tasks/` — Replit's internal task specifications (intentionally not committed)

## Run & Operate

- `pnpm --filter @workspace/connect run dev` — run the frontend (port 20001)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm test` — run all package tests
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite + Wouter + TanStack Query + Tailwind CSS v4
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (v3), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — single source of truth for all API contracts
- `lib/db/src/schema/` — Drizzle table definitions (people, events, venues, eventLeaders, eventSponsors, invitations, virtualMeetings, virtualMeetingParticipants)
- `artifacts/api-server/src/routes/` — Express route handlers (auth, people, events, venues, invitations, virtualMeetings, dashboard, suggestions, search)
- `artifacts/connect/src/pages/` — React pages (dashboard, people, events, virtual-meetings, suggestions)
- `lib/api-client-react/src/generated/` — generated React Query hooks (do not edit)
- `lib/api-zod/src/generated/` — generated Zod validation schemas (do not edit)

## Architecture decisions

- OpenAPI-first: spec drives codegen which drives both frontend hooks and backend Zod validators
- `zod.int()` is not valid in Zod v3 — if re-running codegen, run `sed -i 's/zod\.int()/zod.number().int()/g' lib/api-zod/src/generated/api.ts` to patch the generated file
- People roles: `executive`, `secondary_leader`, `staff` — suggestions only target `staff` for touchpoint gaps
- Suggestions use state-level proximity matching (same state → same city ranked higher); no geocoding
- "Needs touchpoint" threshold: 90 days without in-person attendance or completed virtual meeting
- Event organizers remain a single person relationship; event sponsors use the `event_sponsors` junction table so each event can have multiple sponsors
- Venues are reusable records; event location and geocoding are derived from the selected venue when available
- In development, missing Azure AD credentials enable the explicit dev-admin auth bypass; production requires configured authentication

## Product

- **Dashboard**: KPI cards, priority virtual touchpoints, upcoming in-person opportunities, recent activity feed
- **People**: Searchable/filterable directory by role; per-person engagement history
- **Events**: In-person events with type, reusable venues, organizers, multiple sponsors, leader roster, invitation list, attendance tracking
- **Virtual Meetings**: Manage suggested/scheduled/completed virtual touchpoints with participants
- **Suggestions Hub**: Two-panel triage — in-person meetup suggestions by event location, virtual suggestions for gap staff
- **Search**: Authenticated grouped global search across people, events, and meetings

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After running codegen, always patch `zod.int()` → `zod.number().int()` in `lib/api-zod/src/generated/api.ts` (Orval 8.23 generates Zod v4 syntax but the workspace uses Zod v3)
- `pnpm --filter @workspace/db run push-force` if schema push fails with column conflicts
- The frontend uses `@radix-ui/react-icons` — must be installed as a devDependency of `@workspace/connect`

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
