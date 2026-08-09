import { Router, type IRouter } from "express";
import healthRouter from "./health";
import peopleRouter from "./people";
import eventsRouter from "./events";
import invitationsRouter from "./invitations";
import virtualMeetingsRouter from "./virtualMeetings";
import dashboardRouter from "./dashboard";
import suggestionsRouter from "./suggestions";
import { requireAuth, requireRole } from "../lib/auth";

const router: IRouter = Router();

// Health endpoint is intentionally unprotected.
router.use(healthRouter);

// All routes below require a valid session.
router.use(requireAuth);

// ── Per-operation role enforcement ────────────────────────────────────────────
//
// Leaders (secondary_leader, executive) can:
//   • Suggest a virtual meeting (POST /virtual-meetings)
//   • Update a virtual meeting's status (PATCH /virtual-meetings/:id)
//   • Add a participant to a meeting (POST /virtual-meetings/:id/participants)
//   • Invite staff to an event (POST /events/:id/invitations)
//   • Update an invitation's status (PATCH /invitations/:id)
//
// Everything else that mutates state requires admin.

const LEADER_WRITE_PATTERNS: Array<{ method: string; pattern: RegExp }> = [
  { method: "POST",  pattern: /^\/virtual-meetings$/ },
  { method: "PATCH", pattern: /^\/virtual-meetings\/[^/]+$/ },
  { method: "POST",  pattern: /^\/virtual-meetings\/[^/]+\/participants$/ },
  { method: "POST",  pattern: /^\/events\/[^/]+\/invitations$/ },
  { method: "PATCH", pattern: /^\/invitations\/[^/]+$/ },
];

router.use((req, res, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    return next(); // GET/HEAD — any authenticated user
  }
  const isLeaderOp = LEADER_WRITE_PATTERNS.some(
    (r) => r.method === req.method && r.pattern.test(req.path),
  );
  if (isLeaderOp) {
    return requireRole("leader")(req, res, next);
  }
  return requireRole("admin")(req, res, next);
});

router.use(peopleRouter);
router.use(eventsRouter);
router.use(invitationsRouter);
router.use(virtualMeetingsRouter);
router.use(dashboardRouter);
router.use(suggestionsRouter);

export default router;
