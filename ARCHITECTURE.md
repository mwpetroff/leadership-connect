# Leadership Connect — Architecture Plan

## Overview

Leadership Connect is a fullstack engagement platform built on a pnpm monorepo. This document captures the current architecture, the planned Azure production topology, the M365 integration strategy, and testing conventions that all contributors should follow.

---

## Current Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite, Wouter, TanStack Query, Tailwind CSS v4 |
| Backend | Node.js 24, Express 5, TypeScript 5.9 |
| Database | PostgreSQL + Drizzle ORM |
| Validation | Zod v3 + drizzle-zod |
| API contract | OpenAPI 3.1 (Orval codegen → React Query hooks + Zod schemas) |
| Monorepo | pnpm workspaces |
| Auth | _Not yet implemented — see roadmap below_ |

### Monorepo packages

```
artifacts/
  api-server/     Express API + route handlers
  connect/        React web frontend

lib/
  api-spec/       openapi.yaml — single source of truth
  api-client-react/  Generated TanStack Query hooks (Orval output)
  api-zod/        Generated Zod request/response validators (Orval output)
  db/             Drizzle schema (people, events, leaders, invitations, virtual meetings)
```

### Codegen note
After running `pnpm --filter @workspace/api-spec run codegen`, always patch the generated Zod file:
```bash
sed -i 's/zod\.int()/zod.number().int()/g' lib/api-zod/src/generated/api.ts
```
Orval 8.23 emits Zod v4 syntax; the workspace uses Zod v3.

---

## Azure Production Topology

```
┌─────────────────────────────────────────────────────┐
│  Azure                                               │
│                                                      │
│  ┌──────────────┐    ┌───────────────────────────┐  │
│  │  Azure Static │    │  Azure App Service (Linux)│  │
│  │  Web Apps     │───▶│  Node.js 24               │  │
│  │  (frontend)   │    │  artifacts/api-server      │  │
│  └──────────────┘    └───────────┬───────────────┘  │
│                                  │                   │
│  ┌──────────────────────────────┐│                   │
│  │  Azure Database for          ││                   │
│  │  PostgreSQL Flexible Server  ││                   │
│  │  (primary data store)        ││                   │
│  └──────────────────────────────┘│                   │
│                                  │                   │
│  ┌──────────────────────────────┐│                   │
│  │  Azure Blob Storage          ││                   │
│  │  (future: CSV imports,       ││                   │
│  │   attachment storage)        ││                   │
│  └──────────────────────────────┘│                   │
│                                  │                   │
│  ┌───────────────────────────────┴───────────────┐  │
│  │  Microsoft Entra ID (Azure AD)                │  │
│  │  • SSO for all users (same tenant as M365)    │  │
│  │  • App roles: admin, leader, staff (read-only)│  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                        │
              Microsoft Graph API
                        │
        ┌───────────────┴──────────────┐
        │  Microsoft 365               │
        │  • Calendar (Calendars.ReadWrite) │
        │  • Teams meetings (OnlineMeetings.ReadWrite) │
        │  • User directory (User.Read.All) │
        └──────────────────────────────┘
```

### Environment variables (per environment)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Express session signing key |
| `AZURE_AD_TENANT_ID` | Entra ID tenant |
| `AZURE_AD_CLIENT_ID` | App registration client ID |
| `AZURE_AD_CLIENT_SECRET` | App registration secret |
| `AZURE_AD_REDIRECT_URI` | OAuth callback URL |
| `GRAPH_API_SCOPES` | Space-separated Graph API permission scopes |
| `NODE_ENV` | `development` / `production` |

---

## Authentication Strategy

### Provider: Microsoft Entra ID (Azure AD)

All users authenticate with their existing Microsoft 365 organizational account. This gives us:
- No separate password management
- SSO with the same identity users use for Teams, Outlook, SharePoint
- App roles defined in the Entra ID app manifest (admin, leader)

### Flow

```
Browser → /auth/login → Entra ID OAuth2 (MSAL) → /auth/callback
       ← Set encrypted session cookie
       → Redirect to app

All API requests: read session cookie → verify → attach user to req.user
Protected routes: require valid session; return 401 if missing
```

### App roles (defined in Entra ID app manifest)

| Role | Can do |
|---|---|
| `admin` | Full CRUD on all records, configuration, bulk actions |
| `leader` | View everything, update their own meeting statuses |
| `(no role / staff)` | Read-only view of their own engagement history |

### Frontend auth approach
- React context (`AuthProvider`) wraps the app
- Unauthenticated users see a login screen; the app shell only renders after auth
- `useAuth()` hook exposes `user`, `isAdmin`, `isLeader`
- API calls automatically receive the session cookie (same-origin or CORS with credentials)

---

## M365 Integration Strategy

### Microsoft Graph API

When a suggestion is **accepted** (invitation created or virtual meeting scheduled), the system optionally creates a calendar event via the Graph API using delegated permissions from the initiating leader's session token.

#### Scopes required
```
Calendars.ReadWrite
OnlineMeetings.ReadWrite
User.Read.All
```

#### Calendar event creation flow
1. Leader accepts a suggestion in the UI
2. API handler calls Graph `/v1.0/me/events` (or `/v1.0/users/{id}/events` for admin-on-behalf)
3. Creates event with attendees set to all invited staff + the leader
4. For virtual meetings: create a Teams online meeting via `/v1.0/me/onlineMeetings`; attach the join URL to the virtual meeting record
5. Store the Graph event ID on the invitation/virtual meeting row for future updates/cancellations

#### Token management
- Use MSAL's on-behalf-of flow: exchange the user's session token for a Graph access token
- Cache tokens in-memory per user session (short-lived; refresh as needed)
- For admin-initiated events: use a service account / client credentials flow with `Calendars.ReadWrite.Shared`

---

## Testing Strategy

### Unit tests — Vitest

All business logic lives in the API server and `lib/` packages. Tests go in `__tests__/` directories adjacent to the code they test.

#### Scope
- **Suggestion algorithms** (`suggestions.ts`): state-match logic, 90-day threshold calculation, exclusion of already-invited staff
- **Route handlers** (people, events, invitations, virtual meetings): happy path + validation errors, using an in-memory SQLite DB or mocked Drizzle queries
- **Zod schema validators** (`lib/api-zod`): confirm generated schemas reject invalid payloads
- **Auth middleware**: verify session check, role gating, 401/403 response shapes

#### Conventions
- Test file: `src/routes/__tests__/suggestions.test.ts`
- Use `vi.mock()` for DB layer; keep tests free of real Postgres
- Use `supertest` for route handler tests (mount the Express app without starting a server)
- Target: 80% coverage on business logic files; route handler happy path + at least one error case each

### Integration tests (future)
- Playwright for the frontend flows (create person, accept suggestion, check invitation appears)
- Run against a seeded test database in CI

---

## Data Model Summary

```
people          → role: executive | secondary_leader | staff
events          → eventType: summit | conference | marketing | regional | leadership
event_leaders   → join: events × people (leaders only)
invitations     → status: invited | attended | no_show | declined
virtual_meetings → status: suggested | scheduled | completed | cancelled
virtual_meeting_participants → join: virtual_meetings × people
```

### Planned additions
- `users` table — auth session data, Azure AD object ID, app role, last login
- `audit_log` — immutable append-only log of all create/update/delete actions
- `settings` — key-value config store (e.g. touchpoint threshold days, org name)

---

## Deployment Notes

### Current (Replit dev)
- Frontend: Vite dev server on `$PORT` (20001), proxied through Replit preview
- API: Express on port 8080
- DB: Replit-managed PostgreSQL

### Target (Azure)
- **Frontend**: Build with `vite build`, deploy static output to Azure Static Web Apps; set `base` in `vite.config.ts` to match the SWA path
- **API**: Containerize with a `Dockerfile` (Node 24 slim); deploy to Azure App Service on Linux; set `WEBSITES_PORT=8080`
- **DB**: Migrate via `drizzle-kit push` against the Azure Postgres connection string; use Managed Identity for passwordless auth in production
- **CI/CD**: GitHub Actions → build → test (`vitest run`) → push image → deploy

---

## Backlog Priorities

| Priority | Area | Why |
|---|---|---|
| 1 | Unit test infrastructure | Foundation for all future work; catch regressions |
| 2 | Complete CRUD admin forms | App is not usable without create/edit/delete |
| 3 | Authentication (Azure AD) | Security + foundation for M365 |
| 4 | M365 calendar integration | Core value-add for exec workflow |
| 5 | Bulk actions | Efficiency for large orgs |
| 6 | Settings & configuration | Operational control |
