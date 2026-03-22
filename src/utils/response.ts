/** Avoid emitting empty `data` wrappers when the payload carries no useful value. */
function shouldOmitData(data: unknown): boolean {
  if (data === undefined || data === null) {
    return true;
  }
  if (data === "") {
    return true;
  }
  if (Array.isArray(data) && data.length === 0) {
    return true;
  }
  if (typeof data === "object" && data !== null && !Array.isArray(data)) {
    if (data instanceof Date) {
      return false;
    }
    return Object.keys(data as object).length === 0;
  }
  return false;
}

/** Build a standard JSON success envelope with the project's default headers. */
export function apiSuccess(data?: unknown, init?: ResponseInit): Response {
  const headers = new Headers();
  headers.set("Content-Type", "application/json; charset=utf-8");
  if (init?.headers) {
    const existing = new Headers(init.headers as Record<string, string>);
    for (const [key, value] of existing) {
      if (!headers.has(key)) {
        headers.set(key, value);
      }
    }
  }
  const body = shouldOmitData(data) ? { success: true } : { success: true, data };
  return new Response(JSON.stringify(body), {
    status: init?.status,
    statusText: init?.statusText,
    headers,
  });
}

/** Build a standard JSON failure envelope with the project's default headers. */
export function apiFailure(data?: unknown, init?: ResponseInit): Response {
  const headers = new Headers();
  headers.set("Content-Type", "application/json; charset=utf-8");
  if (init?.headers) {
    const existing = new Headers(init.headers as Record<string, string>);
    for (const [key, value] of existing) {
      if (!headers.has(key)) {
        headers.set(key, value);
      }
    }
  }
  const body = shouldOmitData(data) ? { success: false } : { success: false, data };
  return new Response(JSON.stringify(body), {
    status: init?.status,
    statusText: init?.statusText,
    headers,
  });
}
