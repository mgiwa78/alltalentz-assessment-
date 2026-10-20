import "reflect-metadata";
import { AppDataSource } from "./config/data-source";
import { Logger } from "./common/logger";
import { Config } from "./config";
import { AuditLogger } from "./common/monitoring/audit";
import { redis } from "./config/int-services";
import { createApp } from "./app";

const logger = new Logger({
  level: Config.logging.level,
  service: Config.service.name,
});

const port = Config.port;

const startServer = async () => {
  const startupStart = Date.now();
  try {
    const dbStart = Date.now();
    await AppDataSource.initialize();
    logger.info(`✅ Database connected successfully (${Date.now() - dbStart}ms)`);
    AuditLogger.initialize(AppDataSource);
    logger.info("📋 AuditLogger initialized");

    const app = createApp(AppDataSource);

    const server = app.listen(port, () => {
      const totalStartup = Date.now() - startupStart;
      logger.info(
        `🚀 ${Config.service.name} v${Config.service.version} running on port ${port} (total startup: ${totalStartup}ms)`,
      );
      logger.info(`🌍 Environment: ${Config.nodeEnv}`);
      logger.info(`📖 Docs: http://localhost:${port}/api/docs`);
      logger.info(`📊 Health: http://localhost:${port}/api/v1/health`);
    });

    let shuttingDown = false;
    const gracefulShutdown = async (signal: string, exitCode = 0) => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info(`Received ${signal}, starting graceful shutdown...`);

      const forceTimer = setTimeout(() => {
        logger.error("Forcing shutdown after timeout");
        process.exit(1);
      }, 15_000);
      forceTimer.unref();

      try {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        logger.info("HTTP server closed");

        if (AppDataSource.isInitialized) {
          await AppDataSource.destroy();
          logger.info("Database connections closed");
        }
        await redis.redis.quit().catch(() => undefined);

        logger.info("Graceful shutdown completed");
        process.exit(exitCode);
      } catch (error: any) {
        logger.error("Error during graceful shutdown", error);
        process.exit(1);
      }
    };

    process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => void gracefulShutdown("SIGINT"));

    process.on("uncaughtException", (error) => {
      logger.error("Uncaught exception", error);
      void gracefulShutdown("uncaughtException", 1);
    });

    process.on("unhandledRejection", (reason) => {
      logger.error("Unhandled rejection", undefined, { reason });
    });
  } catch (error) {
    logger.error("❌ Failed to start server", error as Error);
    process.exit(1);
  }
};

startServer().catch((error) => {
  logger.error("Failed to start application", error);
  process.exit(1);
});
