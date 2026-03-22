import { createRouteBodyLimit, defaultMaxBodyBytes } from "../../utils/security/bodysize.ts";
import { log } from "../../utils/logger.ts";
import { createRouteLimiter } from "../../utils/security/ratelimit.ts";
import { apiFailure } from "../../utils/response.ts";

/** Unknown routes reuse the default body cap to avoid oversized request abuse. */
const bodyLimit = createRouteBodyLimit({
  maxBytes: defaultMaxBodyBytes(),
});

/** Not-found responses get their own limiter so they cannot drown normal routes. */
const rateLimit = createRouteLimiter({
  points: 2000,
  durationSeconds: 60,
  keyPrefix: "notFound",
});

/** Final fallback when no registered route accepts the request. */
export async function respondNotFound(
  req: Request,
  server: Bun.Server<undefined>,
  pathname?: string,
): Promise<Response> {
  const path = pathname ?? new URL(req.url).pathname;
  const tooLarge = await bodyLimit.checkBodySize(req, path);
  if (tooLarge) {
    return tooLarge;
  }
  const limited = await rateLimit.consumeOr429(req, server);
  if (limited) {
    return limited;
  }
  log("warn", `No handler for ${req.method} ${path}`);
  return apiFailure(
    { message: "The requested route does not exist." },
    { status: 404 },
  );
}
