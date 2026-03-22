import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";

/** Legacy constant kept for future trace header validation expansion. */
const HEADER_MAX = 128;

/** Async-local trace payload used by logging and response finalization. */
type TraceStore = {
  traceId: string;
  spanId: string;
};

/** Keep tracing context attached to the current async execution chain. */
const storage = new AsyncLocalStorage<TraceStore>();

/** Read the current trace id, if the request was wrapped by `runWithTrace`. */
export function getTraceId(): string | undefined {
  return storage.getStore()?.traceId;
}

/** Read the current span id, if one exists in the active trace scope. */
export function getSpanId(): string | undefined {
  return storage.getStore()?.spanId;
}

/** Generate short random span identifiers for internal trace relationships. */
function generateSpanId(): string {
  return randomBytes(8).toString("hex");
}

/** Start a fresh trace scope around one request lifecycle. */
export function runWithTrace<T>(fn: (traceId: string) => Promise<T>): Promise<T> {
  const traceId = randomBytes(16).toString("hex");
  const spanId = generateSpanId();
  return storage.run({ traceId, spanId }, () => fn(traceId));
}

/** Create a child span id from the current trace scope when one exists. */
export function createChildSpan(): string {
  const store = storage.getStore();
  if (!store) {
    return generateSpanId();
  }
  const [, newSpanId] = store.spanId.split("-").slice(0, 2);
  return `${newSpanId}-${generateSpanId()}`;
}

/** Surface trace headers in a format suitable for logs and outgoing responses. */
export function getTraceHeaders(): Record<string, string> {
  const store = storage.getStore();
  if (!store) {
    return {};
  }
  return {
    "X-Trace-ID": store.traceId,
  };
}
