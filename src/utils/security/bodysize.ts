import { log } from "../logger.ts";
import { apiFailure } from "../response.ts";

/** Shared default body limit used by routes that do not need custom sizing. */
const DEFAULT_MAX_BYTES = 1024 * 1024;

/** Resolve the default route body limit from the environment. */
export function defaultMaxBodyBytes(): number {
  const raw = process.env.MAX_BODY_BYTES;
  if (raw === undefined || raw === "") {
    return DEFAULT_MAX_BYTES;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    return DEFAULT_MAX_BYTES;
  }
  return n;
}

/** Configuration for one route-scoped body limiter. */
export type RouteBodyLimitConfig = {
  maxBytes: number;
};

/** Async interface used by routes to reject oversized request bodies. */
export type RouteBodyLimiter = {
  checkBodySize(req: Request, pathname?: string): Promise<Response | null>;
};

/** Create a route-local body limiter that works with both declared and streamed sizes. */
export function createRouteBodyLimit(
  config: RouteBodyLimitConfig,
): RouteBodyLimiter {
  return {
    /** Reject requests that exceed the configured size before business logic runs. */
    async checkBodySize(req: Request, pathname?: string): Promise<Response | null> {
      const path = pathname ?? new URL(req.url).pathname;
      const len = req.headers.get("content-length");
      const declaredBytes = len === null ? null : Number.parseInt(len, 10);
      if (declaredBytes !== null && Number.isFinite(declaredBytes) && declaredBytes >= 0) {
        if (declaredBytes <= config.maxBytes) {
          return null;
        }
        log(
          "warn",
          `${req.method} ${path} rejected: content-length ${declaredBytes} bytes exceeds route limit ${config.maxBytes} bytes`,
        );
        return apiFailure(
          { message: "Request body too large." },
          { status: 413 },
        );
      }

      if (!req.body) {
        return null;
      }

      const clone = req.clone();
      const reader = clone.body?.getReader();
      if (!reader) {
        return null;
      }

      let totalBytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          totalBytes += value.byteLength;
          if (totalBytes > config.maxBytes) {
            log(
              "warn",
              `${req.method} ${path} rejected: streamed body ${totalBytes} bytes exceeds route limit ${config.maxBytes} bytes`,
            );
            await reader.cancel();
            return apiFailure(
              { message: "Request body too large." },
              { status: 413 },
            );
          }
        }
      } finally {
        reader.releaseLock();
      }

      return null;
    },
  };
}
