import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { pino } from "pino";

import { openAPIRouter } from "@/api-docs/openAPIRouter";
import { healthCheckRouter } from "@/api/healthCheck/healthCheckRouter";
import errorHandler from "@/common/middleware/errorHandler";
import rateLimiter from "@/common/middleware/rateLimiter";
import requestLogger from "@/common/middleware/requestLogger";
import { env } from "@/common/utils/envConfig";
import pretty from "pino-pretty";
import { maxRouter } from "./api/max/maxRouter";
import proxy from "express-http-proxy";
import { secretChecker } from "./common/middleware/secretChecker";

const logger = pino(pretty());
const app: Express = express();

// Set the application to trust the reverse proxy
app.set("trust proxy", true);

app.use(
  "/chat",
  secretChecker,
  proxy("127.0.0.1:8000", {
    proxyReqPathResolver: (req) => "/v1/chat/completions",
  })
);
app.use("/v1/chat/completions", secretChecker, proxy("127.0.0.1:8000"));

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(helmet());
app.use(rateLimiter);

// Request logging
app.use(requestLogger);

// Routes
app.use("/health-check", healthCheckRouter);
app.use("/max", secretChecker, maxRouter);

// Swagger UI
app.use(openAPIRouter);

// Error handlers
app.use(errorHandler());

export { app, logger };
