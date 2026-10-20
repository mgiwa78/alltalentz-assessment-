import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import { DataSource } from "typeorm";
import { createRootRoutes } from "./routes/root.route";
import { Logger } from "./common/logger";
import { NotFoundError, errorHandler, requestIdMiddleware } from "./common/errors";
import { Config } from "./config";
import { requestMetricsMiddleware } from "./common/monitoring/metrics";
import { auditMiddleware } from "./common/monitoring/audit";
import { openApiDocument } from "./docs/openapi";

const logger = new Logger({
  level: Config.logging.level,
  service: Config.service.name,
});

export const createApp = (dataSource: DataSource, options: { httpLogging?: boolean } = {}) => {
  const app = express();

  app.set("trust proxy", 1);

  app.get("/api/docs.json", (_req, res) => {
    res.json(openApiDocument);
  });
  app.use(
    "/api/docs",
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customSiteTitle: "TRS Restoration API",
      swaggerOptions: { persistAuthorization: true },
    }),
  );

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          upgradeInsecureRequests: [],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(
    cors({
      origin: (
        origin: string | undefined,
        cb: (err: Error | null, allow?: boolean | string) => void,
      ) => {
        if (!origin) {
          return cb(null, false);
        }
        const allowed = Config.allowedOrigins.some((pattern) => {
          if (pattern.startsWith("*.")) {
            const domain = pattern.slice(2);
            try {
              const host = new URL(origin).hostname.toLowerCase();
              return host === domain || host.endsWith(`.${domain}`);
            } catch {
              return false;
            }
          }
          return origin === pattern;
        });
        cb(null, allowed ? origin : false);
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID", "Origin"],
    }),
  );

  if (options.httpLogging !== false) {
    const morganFormat =
      Config.nodeEnv === "production"
        ? ":method :url-path :status :res[content-length] - :response-time ms"
        : "combined";

    morgan.token("url-path", (req) => {
      try {
        return new URL(req.url ?? "", "http://x").pathname;
      } catch {
        return req.url ?? "";
      }
    });

    app.use(
      morgan(morganFormat, {
        stream: {
          write: (message: string) => {
            logger.info(message.trim());
          },
        },
        skip: (_req, res) => Config.nodeEnv === "production" && res.statusCode < 400,
      }),
    );
  }

  app.use(requestIdMiddleware);
  app.use(requestMetricsMiddleware);
  app.use(auditMiddleware);

  app.get("/", (_req, res) => {
    res.redirect("/api/docs");
  });
  app.use("/api/v1", createRootRoutes(dataSource));

  app.use((req, _res, next) => {
    next(new NotFoundError(`Route not found: ${req.method} ${req.path}`));
  });
  app.use(errorHandler);

  return app;
};
