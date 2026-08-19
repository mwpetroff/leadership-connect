# Touchpoint

An HRBP workspace for coverage and engagement across a ~600–700 person organisation. HR business partners are the primary users; executives and secondary leaders remain secondary.

## Documentation

- `BACKLOG.md` — GitHub-friendly snapshot of the current product backlog
- `docs/TOUCHPOINT.md` — HRBP lenses, departments, import rules, and coverage clocks
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
- `lib/db/src/schema/` — Drizzle table definitions (people, departments, events, venues, eventLeaders, eventSponsors, invitations, virtualMeetings, virtualMeetingParticipants)
- `artifacts/api-server/src/routes/` — Express route handlers (auth, people, departments, events, venues, invitations, virtualMeetings, dashboard, suggestions, search, orgChart, mapData)
- `artifacts/api-server/src/lib/` — Lens (`scope.ts`), coverage clocks (`coverage.ts`), CSV import rules (`import-people.ts`)
- `artifacts/connect/src/pages/` — React pages (dashboard, people, org-chart, events, virtual-meetings, suggestions, map, settings)
- `docs/TOUCHPOINT.md` — HRBP product rules (lenses, cadences, import)
- `lib/api-client-react/src/generated/` — generated React Query hooks (do not edit)
- `lib/api-zod/src/generated/` — generated Zod validation schemas (do not edit)

## Architecture decisions

- OpenAPI-first: spec drives codegen which drives both frontend hooks and backend Zod validators
- `zod.int()` is not valid in Zod v3 — if re-running codegen, run `sed -i 's/zod\.int()/zod.number().int()/g' lib/api-zod/src/generated/api.ts` to patch the generated file
- People roles: `executive`, `secondary_leader`, `staff` — HRBPs are a directory flag (`isHrbp`) plus app role `hrbp`
- Coverage uses four clocks (HRBP 1:1, leadership 1:1, skip-level, onsite × leadership); leadership/skip cadences are per department
- Suggestions use state-level proximity matching (same state → same city ranked higher); no geocoding
- "Needs touchpoint" threshold: 90 days without in-person attendance or completed virtual meeting
- Event organizers remain a single person relationship; event sponsors use the `event_sponsors` junction table so each event can have multiple sponsors
- Venues are reusable records; event location and geocoding are derived from the selected venue when available
- In development, missing Azure AD credentials enable the explicit dev-admin auth bypass; production requires configured authentication

## Product

- **Dashboard**: Four coverage-clock counts for the current lens, ranked engagement risks
- **People**: Directory scoped to My team / department / leader / HRBP / everyone; inactive (FMLA) filter
- **Org Chart**: Tree and box views with muted out-of-scope managers
- **Events**: In-person events with type, reusable venues, organizers, multiple sponsors, leader roster, invitation list, attendance tracking
- **Virtual Meetings**: 1:1s classified for coverage clocks (`hrbp_1on1`, `leader_1on1`, `skip_level`)
- **Suggestions Hub**: Close a specific coverage gap
- **Search**: Authenticated grouped global search across people, events, and meetings

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After running codegen, always patch `zod.int()` → `zod.number().int()` in `lib/api-zod/src/generated/api.ts` (Orval 8.23 generates Zod v4 syntax but the workspace uses Zod v3)
- `pnpm --filter @workspace/db run push-force` if schema push fails with column conflicts
- The frontend uses `@radix-ui/react-icons` — must be installed as a devDependency of `@workspace/connect`

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
