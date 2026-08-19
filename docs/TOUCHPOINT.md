# Touchpoint (HRBP workspace)

Touchpoint is the HR business-partner workspace for a ~600–700 person company. HRBPs are the primary users. Executives and secondary leaders remain in the directory and can still log meetings and events.

## Data model

- **Departments** are HR-owned records (`departments`). A parent row is a division. Import never auto-creates departments; unknown names skip that CSV row.
- **People** have `departmentId`, `managerId`, `hrbpId` (at most one HRBP), `isHrbp`, and `status` (`active` | `inactive`). Inactive covers FMLA, leave, and offboarding. History is kept; people are hidden from daily views unless “Include inactive” is on.
- **Meetings** have `meetingKind`: `general`, `hrbp_1on1`, `leader_1on1`, `skip_level`.

## Lenses (entire app)

Session-only. Default is **My team**.

| Lens | Focus |
| --- | --- |
| My team | People assigned to the logged-in HRBP. Leaders without `isHrbp` see their reporting subtree. Admins who are not in the directory fall back to Everyone. |
| Departments | Multi-select; everyone in those departments, including other HRBPs’ people |
| Leader | That leader plus the full subtree |
| Another HRBP | That HRBP’s explicit caseload (FTO coverage) |
| Everyone | Full org |

Search and role filters stack on any lens. HRBPs can act on anyone they can see.

## Coverage clocks

All cadences are configurable. HRBP 1:1 (default 30) and onsite × leadership (default 180) are organisation settings. Leadership 1:1 (default 14) and skip-level (default 90) are **per department**, falling back to the org default.

- Skip-level is N/A (not overdue) when the person has no manager’s manager.
- Gaps always use the **assigned** HRBP’s clock, even when you are covering a colleague.
- Onsite counts **attended** in-person events that had an executive or secondary leader on the event roster.

## Import

Upsert by email. Missing rows are **never deleted**; set `status=inactive` to offboard.

```
name,email,role,title,department,managerEmail,hrbpEmail,isHrbp,homeCity,homeState,status
```

- Column present + empty cell → clear that field.
- Column omitted → leave existing values.
- `hrbpEmail` must resolve to a person with `isHrbp=true` (same file is applied first).
- Manager cycles are rejected.

## Org chart

Tree list plus a box layout. Out-of-scope managers stay visible but muted, labeled with their HRBP. Inactive managers are skipped so FMLA does not orphan the tree.

## Permissions

- `admin` — departments, settings, delete person
- `hrbp` — import, create/update people, everything a leader can do
- `leader` — meetings, invitations, venues
- `staff` — read

## API lens parameters

Every population list (`/people`, `/org-chart`, `/dashboard/summary`, `/map-data`, `/events`, `/virtual-meetings`, `/search`, `/suggestions/coverage`) accepts:

| Query | Meaning |
| --- | --- |
| `lens` | `my_team` (default), `departments`, `leader`, `hrbp`, `all` |
| `departmentIds` | Comma-separated ids (departments lens) |
| `leaderId` | Root person for the leader lens |
| `hrbpId` | Caseload owner for the HRBP lens |
| `includeInactive` | `true` to include FMLA / leave / exited people |

Apply the SQL migration `lib/db/drizzle/0011_touchpoint_hrbp.sql` (or `pnpm --filter @workspace/db run push`) before using the new columns.

