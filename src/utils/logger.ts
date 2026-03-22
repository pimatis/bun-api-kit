import { LOG_COLORS, LOG_RESET } from "../routes/constants.ts";
import { getCurrentRequestId } from "./requestid.ts";

/** Supported log levels also double as the public logger API. */
type LogLevel = "debug" | "info" | "warn" | "error" | "success";

/** Free-form metadata appended to the end of each log line. */
type LogContext = {
  rid?: string;
  traceId?: string;
  [key: string]: unknown;
};

/** Map each log level to a comparable numeric priority. */
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  success: 4,
};

/** Read the minimum enabled level once during startup. */
const MIN_LEVEL = (Bun.env.LOG_LEVEL as LogLevel) ?? "info";

/** Skip work early when a log line is below the configured verbosity. */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LEVEL];
}

/** Remove control characters so logs stay single-line and terminal-safe. */
function sanitizeLogFragment(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\x1b\[[0-9;]*m/g, "");
}

/** Serialize optional context fields into `key=value` segments. */
function formatContext(ctx?: LogContext): string {
  if (!ctx || Object.keys(ctx).length === 0) {
    return "";
  }
  return Object.entries(ctx)
    .map(([key, value]) => `${sanitizeLogFragment(key)}=${sanitizeLogFragment(String(value))}`)
    .join(" ");
}

/** Build the final colored log line, including the current request id when available. */
function formatMessage(level: LogLevel, message: string, ctx?: LogContext): string {
  const rid = getCurrentRequestId();
  const label = `[${level.toUpperCase()}]`;
  const color = LOG_COLORS[level];
  const meta = formatContext({
    ...(rid ? { rid } : {}),
    ...ctx,
  });
  return `${color}${label}${LOG_RESET} ${sanitizeLogFragment(message)}${meta ? ` ${meta}` : ""}`;
}

/** Write a log line to the matching console stream. */
export function log(level: LogLevel, message: string, ctx?: LogContext): void {
  if (!shouldLog(level)) {
    return;
  }
  const output = formatMessage(level, message, ctx);
  if (level === "error") {
    console.error(output);
  } else if (level === "warn") {
    console.warn(output);
  } else {
    console.log(output);
  }
}

/** Convenience logger object for modules that prefer method-style calls. */
export const logger = {
  debug: (msg: string, ctx?: LogContext) => log("debug", msg, ctx),
  info: (msg: string, ctx?: LogContext) => log("info", msg, ctx),
  warn: (msg: string, ctx?: LogContext) => log("warn", msg, ctx),
  error: (msg: string, ctx?: LogContext) => log("error", msg, ctx),
  success: (msg: string, ctx?: LogContext) => log("success", msg, ctx),
};
