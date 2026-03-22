import { RateLimiterMemory } from "rate-limiter-flexible";
import { getClientIpKey } from "../clientip.ts";
import { metrics } from "../metrics.ts";
import { apiFailure } from "../response.ts";

/** Public configuration for one route-local fixed-window limiter. */
export type RouteRateLimitConfig = {
  points: number;
  durationSeconds: number;
  keyPrefix?: string;
};

/** Route-facing limiter contract returned by `createRouteLimiter`. */
export type RouteRateLimiter = {
  readonly limiter: RateLimiterMemory;
  consumeOr429(
    req: Request,
    server: Bun.Server<undefined>,
  ): Promise<Response | null>;
};

/** Keep limiter keys short and terminal-safe. */
const VALID_KEY_REGEX = /^[a-zA-Z0-9.:\-_]+$/;

/** Validate the derived rate-limit key before passing it to the limiter. */
function isValidRateLimitKey(key: string): boolean {
  if (!key || key.length > 128) {
    return false;
  }
  return VALID_KEY_REGEX.test(key);
}

/** Build one in-memory fixed-window limiter dedicated to a specific route. */
export function createRouteLimiter(
  config: RouteRateLimitConfig,
): RouteRateLimiter {
  const limiter = new RateLimiterMemory({
    points: config.points,
    duration: config.durationSeconds,
    ...(config.keyPrefix !== undefined ? { keyPrefix: config.keyPrefix } : {}),
  });

  return {
    limiter,
    /** Consume one point and synthesize a standard 429 response when the quota is exhausted. */
    async consumeOr429(
      req: Request,
      server: Bun.Server<undefined>,
    ): Promise<Response | null> {
      const rawKey = getClientIpKey(req, server);
      if (!isValidRateLimitKey(rawKey)) {
        return apiFailure(
          { message: "Invalid request context." },
          { status: 400 },
        );
      }
      try {
        await limiter.consume(rawKey);
        return null;
      } catch (rejected: unknown) {
        if (
          rejected &&
          typeof rejected === "object" &&
          "msBeforeNext" in rejected &&
          typeof (rejected as { msBeforeNext: number }).msBeforeNext === "number"
        ) {
          metrics.rateLimit.hits.increment();
          const msBeforeNext = (rejected as { msBeforeNext: number }).msBeforeNext;
          const retryAfterSec = Math.max(1, Math.ceil(msBeforeNext / 1000));
          return apiFailure(
            { message: "Too many requests. Please try again later." },
            {
              status: 429,
              headers: {
                "Retry-After": String(retryAfterSec),
              },
            },
          );
        }
        throw rejected;
      }
    },
  };
}
