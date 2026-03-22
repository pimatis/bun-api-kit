import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

/** Hard cap for request-id header values mirrored into logs and responses. */
const HEADER_MAX = 128;

/** Async-local payload shared across the request lifecycle. */
type RequestIdStore = {
  requestId: string;
};

/** Store the current request id without threading it through every function call. */
const storage = new AsyncLocalStorage<RequestIdStore>();

/**
 * Reads `X-Request-ID` or `X-Correlation-ID` when present and non-empty; otherwise generates a UUID.
 */
export function getRequestId(req: Request): string {
  const a = req.headers.get("x-request-id")?.trim();
  if (a) {
    return a.slice(0, HEADER_MAX);
  }
  const b = req.headers.get("x-correlation-id")?.trim();
  if (b) {
    return b.slice(0, HEADER_MAX);
  }
  return randomUUID();
}

/** Request id for the current async context (set by `runWithRequestContext`). */
export function getCurrentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/**
 * Runs `fn` with a request-scoped id so `log()` and response headers can use the same value.
 */
export function runWithRequestContext<T>(
  req: Request,
  fn: () => Promise<T>,
): Promise<T> {
  const requestId = getRequestId(req);
  return storage.run({ requestId }, fn);
}

/** Mirrors the resolved id on the response as `X-Request-ID`. */
export function mirrorRequestIdHeader(response: Response): Response {
  const id = getCurrentRequestId();
  if (!id) {
    return response;
  }
  response.headers.set("X-Request-ID", id);
  return response;
}
