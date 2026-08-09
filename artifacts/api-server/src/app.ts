import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import authRouter from "./routes/auth";
import { logger } from "./lib/logger";
import { sessionMiddleware } from "./lib/auth";

const app: Express = express();

// Trust the Replit / Azure reverse proxy so secure cookies work correctly.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session must be registered before any route that reads/writes the session.
app.use(sessionMiddleware);

// Auth routes are NOT protected by requireAuth — they handle unauthenticated
// requests (login, callback, logout) and the /me health-check.
app.use("/api/auth", authRouter);

// All remaining API routes are protected (requireAuth is applied inside the
// router so the health endpoint can remain unprotected).
app.use("/api", router);

export default app;
