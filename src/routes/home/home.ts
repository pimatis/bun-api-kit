import { PREFIX } from "../constants.ts";
import { createRouteBodyLimit, defaultMaxBodyBytes } from "../../utils/security/bodysize.ts";
import { log } from "../../utils/logger.ts";
import { createRouteLimiter } from "../../utils/security/ratelimit.ts";
import { apiSuccess } from "../../utils/response.ts";

/** Home is a lightweight read endpoint, so it uses the shared default body cap. */
const bodyLimit = createRouteBodyLimit({
  maxBytes: defaultMaxBodyBytes(),
});

/** Give the home endpoint a generous read-oriented quota. */
const rateLimit = createRouteLimiter({
  points: 5000,
  durationSeconds: 60,
  keyPrefix: "home",
});

/** Handle `GET /api/v1/home` and return a minimal success payload. */
export async function handle(
  req: Request,
  server: Bun.Server<undefined>,
  pathname?: string,
): Promise<Response | null> {
  const path = pathname ?? new URL(req.url).pathname;
  if (path !== `${PREFIX}/home` || req.method !== "GET") {
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
  log("success", `GET ${path}`);
  return apiSuccess();
}
