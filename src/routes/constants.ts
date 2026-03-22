/** Base path for versioned HTTP API routes (`${PREFIX}/<routeName>`). */
export const PREFIX = "/api/v1";

/** ANSI colors for console log levels (pair with {@link LOG_RESET} in `log`). */
export const LOG_COLORS = {
  debug: "\x1b[90m",
  success: "\x1b[32m",
  error: "\x1b[31m",
  warn: "\x1b[33m",
  info: "\x1b[36m",
} as const;

export const LOG_RESET = "\x1b[0m";
