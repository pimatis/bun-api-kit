import { PREFIX } from "../constants.ts";
import { log } from "../../utils/logger.ts";
import { createRouteBodyLimit, defaultMaxBodyBytes } from "../../utils/security/bodysize.ts";
import { createRouteLimiter } from "../../utils/security/ratelimit.ts";
import { apiSuccess } from "../../utils/response.ts";

/** Health checks still use the shared body guard to keep handler structure consistent. */
const bodyLimit = createRouteBodyLimit({
  maxBytes: defaultMaxBodyBytes(),
});

/** Keep health checks protected from aggressive scraping without blocking normal probes. */
const rateLimit = createRouteLimiter({
  points: 100,
  durationSeconds: 60,
  keyPrefix: "health",
});

/** Handle `GET /api/v1/health` with a probe-friendly readiness payload. */
export async function handle(
  req: Request,
  server: Bun.Server<undefined>,
  pathname?: string,
): Promise<Response | null> {
  const path = pathname ?? new URL(req.url).pathname;
  if (path !== `${PREFIX}/health` || req.method !== "GET") {
    return null;
  }
  const tooLarge = await bodyLimit.checkBodySize(req, path);
  if (tooLarge) {
    return tooLarge;
  }
  const limited = await rateLimit.consumeOr429(req, server);
  if (limited) {
    return limited;
  }
  const status = "healthy";
  log("success", `Health check: ${status}`);
  return apiSuccess({
    status,
    timestamp: new Date().toISOString(),
  });
}
