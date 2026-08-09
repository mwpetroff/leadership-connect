import { Router, type IRouter } from "express";
import healthRouter from "./health";
import peopleRouter from "./people";
import eventsRouter from "./events";
import invitationsRouter from "./invitations";
import virtualMeetingsRouter from "./virtualMeetings";
import dashboardRouter from "./dashboard";
import suggestionsRouter from "./suggestions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(peopleRouter);
router.use(eventsRouter);
router.use(invitationsRouter);
router.use(virtualMeetingsRouter);
router.use(dashboardRouter);
router.use(suggestionsRouter);

export default router;
