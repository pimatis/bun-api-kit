import { handleRequest } from "./src/routes/routes.ts";
import { log } from "./src/utils/logger.ts";

/** Warn when a request takes suspiciously long, without changing the response flow. */
const REQUEST_TIMEOUT_MS = 30_000;

/** Start the Bun HTTP server and delegate every request into the shared route pipeline. */
const server = Bun.serve({
  port: 3000,
  fetch(req, server) {
    const timeout = setTimeout(() => {
      log("warn", `Request timeout exceeded for ${req.method} ${new URL(req.url).pathname}`);
    }, REQUEST_TIMEOUT_MS);
    const promise = handleRequest(req, server);
    return promise.finally(() => clearTimeout(timeout));
  },
  error(error) {
    log("error", `Server error: ${error instanceof Error ? error.message : String(error)}`);
    return new Response(null, { status: 500 });
  },
});

log("info", `Listening on http://localhost:${server.port}`);
