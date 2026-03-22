import { clientip } from "../utils/clientip.ts";
import { log } from "../utils/logger.ts";
import { metrics } from "../utils/metrics.ts";
import { negotiateEncoding, compressResponse } from "../utils/compression.ts";
import { runWithTrace, getTraceHeaders, getTraceId } from "../utils/tracing.ts";
import {
  mirrorRequestIdHeader,
  runWithRequestContext,
} from "../utils/requestid.ts";
import { mergeSecurityHeaders } from "../utils/security/securityheaders.ts";
import { createCorsMiddleware } from "../utils/security/cors.ts";
import { respondNotFound } from "./error/error.ts";
import { handle as handleHome } from "./home/home.ts";
import { handle as handleHealth } from "./health/health.ts";
import { PREFIX } from "./constants.ts";

/** Shared CORS middleware instance for the whole HTTP pipeline. */
const cors = createCorsMiddleware();
/** Route order is significant: the first handler that returns a response wins. */
const handlers = [handleHealth, handleHome] as const;

/** Collapse raw paths into bounded route labels before recording metrics. */
function getMetricRouteLabel(pathname: string): string {
  if (pathname === `${PREFIX}/health`) {
    return "health";
  }
  if (pathname === `${PREFIX}/home`) {
    return "home";
  }
  if (pathname.startsWith(PREFIX)) {
    return "not_found";
  }
  return "outside_prefix";
}

/** Apply response headers that should exist on every finalized API response. */
function finalize(response: Response): Response {
  const traceId = getTraceId();
  if (traceId) {
    response.headers.set("X-Trace-ID", traceId);
  }
  return mergeSecurityHeaders(mirrorRequestIdHeader(response));
}

/** Add CORS, tracing, request-id headers, and optional compression to handler output. */
async function buildResponse(
  response: Response,
  req: Request,
  encoding: ReturnType<typeof negotiateEncoding>,
): Promise<Response> {
  let finalResponse = cors.appendCorsHeaders(response, req);
  finalResponse = finalize(finalResponse);

  if (
    req.method === "HEAD" ||
    !finalResponse.headers.get("Content-Type")?.includes("application/json")
  ) {
    return finalResponse;
  }

  const body = await finalResponse.text();
  const compressed = compressResponse(body, encoding);
  if (!compressed) {
    return new Response(body, {
      status: finalResponse.status,
      statusText: finalResponse.statusText,
      headers: finalResponse.headers,
    });
  }

  const headers = new Headers(finalResponse.headers);
  headers.set("Content-Encoding", compressed.encoding);
  headers.set("Vary", "Accept-Encoding");
  return new Response(compressed.body, {
    status: finalResponse.status,
    statusText: finalResponse.statusText,
    headers,
  });
}

/** Central request pipeline shared by Bun's `fetch` handler. */
export async function handleRequest(
  req: Request,
  server: Bun.Server<undefined>,
): Promise<Response> {
  const preflight = cors.handlePreflight(req);
  if (preflight) {
    return finalize(preflight);
  }

  /** Track latency and active requests around the full route lifecycle. */
  const start = performance.now();
  metrics.requests.active.increment();

  return runWithRequestContext(req, () =>
    runWithTrace(async () => {
      const traceHeaders = getTraceHeaders();
      const url = new URL(req.url);
      const pathname = url.pathname;
      const routeLabel = getMetricRouteLabel(pathname);
      const encoding = negotiateEncoding(req.headers.get("Accept-Encoding"));

      log(
        "info",
        `${req.method} ${pathname} client=${clientip(req, server)}`,
        { traceId: traceHeaders["X-Trace-ID"] },
      );

      metrics.requests.total.increment({ method: req.method, route: routeLabel });

      try {
        for (const handler of handlers) {
          const response = await handler(req, server, pathname);
          if (response) {
            const latency = performance.now() - start;
            metrics.requests.duration.observe(latency, { method: req.method, route: routeLabel });
            metrics.requests.active.decrement();
            return await buildResponse(response, req, encoding);
          }
        }
        const latency = performance.now() - start;
        metrics.requests.duration.observe(latency, { method: req.method, route: routeLabel });
        metrics.requests.active.decrement();
        return await buildResponse(await respondNotFound(req, server, pathname), req, encoding);
      } catch (error) {
        const latency = performance.now() - start;
        metrics.requests.duration.observe(latency, { method: req.method, route: routeLabel });
        metrics.requests.active.decrement();
        metrics.requests.errors.increment({ method: req.method, route: routeLabel });
        log(
          "error",
          `Unhandled error processing ${req.method} ${pathname}: ${error instanceof Error ? error.message : String(error)}`,
          { traceId: traceHeaders["X-Trace-ID"] },
        );
        return await buildResponse(
          new Response(JSON.stringify({ success: false, data: { message: "Internal server error." } }), {
            status: 500,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          }),
          req,
          encoding,
        );
      }
    }),
  );
}
