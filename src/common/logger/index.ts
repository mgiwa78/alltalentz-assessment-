import winston from "winston";
import "winston-daily-rotate-file";

export class Logger {
  private logger: winston.Logger;

  constructor(config?: { level: string; service: string }) {
    const { combine, timestamp, printf, colorize } = winston.format;

    const logFormat = printf(({ level, message, timestamp, ...meta }) => {
      const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : "";
      return `${timestamp} [${level}]: ${message} ${metaStr}`;
    });

    const transports: winston.transport[] = [
      new winston.transports.Console({
        format: combine(
          colorize(),
          timestamp({ format: "DD-MM-YYYY HH:mm:ss" }),
          logFormat
        ),
      }),
    ];

    if (
      process.env.NODE_ENV === "production" ||
      process.env.ENABLE_FILE_LOGGING === "true"
    ) {
      const fileRotateTransport = new winston.transports.DailyRotateFile({
        filename: "logs/%DATE%-error.log",
        datePattern: "DD-MM-YYYY",
        zippedArchive: true,
        maxSize: "20m",
        maxFiles: "14d",
        level: "error",
      });
      transports.push(fileRotateTransport);
    }

    this.logger = winston.createLogger({
      level: config?.level || "info",
      format: combine(timestamp({ format: "DD-MM-YYYY HH:mm:ss" }), logFormat),
      transports,
    });
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.logger.info(message, meta);
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    this.logger.error(message, {
      ...meta,
      error: error
        ? {
            message: error.message,
            stack: error.stack,
            name: error.name,
          }
        : undefined,
    });
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.logger.warn(message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.logger.debug(message, meta);
  }

  trace(message: string, meta?: Record<string, unknown>): void {
    this.logger.silly(message, meta);
  }

  fatal(message: string, error?: Error, meta?: Record<string, unknown>): void {
    this.logger.error(message, {
      ...meta,
      error: error
        ? {
            message: error.message,
            stack: error.stack,
            name: error.name,
          }
        : undefined,
    });
  }
}
