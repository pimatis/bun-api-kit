# AGENTS.md

Guidance for **humans** and **automation** (including AI coding agents) working on this repository. Follow it when implementing features, fixing bugs, or opening pull requests.

---

## Mandatory documentation rule

**Any change to infrastructure, conventions, public APIs, scripts, or documented behavior MUST update this file in the same pull request.**

That includes:

- New or removed routes, utilities, or configuration
- Changes to URL prefixes, response shapes, logging, or environment assumptions
- New scripts or changes to `package.json` scripts
- User-facing **README.md** when the public overview of the template should change
- Architectural decisions that future contributors should know

If the change is not reflected here, the PR is incomplete.

---

## Stack and principles

- **Runtime:** [Bun](https://bun.com/) only for serving HTTP. Do not add extra npm dependencies unless the project explicitly adopts them later (and then update this document).
- **Rate limiting:** Use **[rate-limiter-flexible](https://www.npmjs.com/package/rate-limiter-flexible)** via **`src/utils/security/ratelimit.ts`** (`RateLimiterMemory`). This is not an HTTP server; it only counts events. Do **not** replace Bun’s HTTP stack with Express or similar (see below).
- **Server entry:** `index.ts` uses `Bun.serve` with `fetch(req, server) { return handleRequest(req, server); }` so handlers receive **`Bun.Server`** (needed for client IP in rate limiting). `handleRequest` wraps work in **`runWithRequestContext`** (`src/utils/requestid.ts`) for request-scoped ids and response headers.
- **Port:** `3000` (see `index.ts`).
- **Language:** TypeScript. Use `.ts` extensions in relative imports (project convention / `verbatimModuleSyntax`).
- **Comments and identifiers in source:** **English** for all code comments and user-facing log messages in this codebase.
- **Comment coverage:** Maintain concise developer-facing comments across source files, especially around exported helpers, request pipeline steps, shared constants, and non-obvious control flow. Follow the style used in `src/routes/constants.ts`: short, direct, and explanatory rather than verbose.

### HTTP and WebSockets (Bun only)

All **HTTP** and **WebSocket** server behavior must use **Bun’s built-in APIs** only.

- **HTTP:** Use `Bun.serve`, the standard `Request` / `Response` model, and routing you implement in this repo (for example `handleRequest`). Do **not** add or use third-party HTTP servers or frameworks such as Express, Fastify, Koa, Hono (as the server), `node:http` wrappers marketed as frameworks, etc.
- **WebSockets:** Use **Bun’s WebSocket support** (for example the `websocket` option on `Bun.serve` and Bun’s server WebSocket types). Do **not** add packages such as `ws`, `socket.io`, `uWebSockets.js`, or other external WebSocket servers or shims.

If a future change requires an exception, document it here and in the PR before merging.

---

## Repository layout

**Security-related** utilities (response headers, body-size limits, rate limiting) live under **`src/utils/security/`** as **`securityheaders.ts`**, **`bodysize.ts`**, and **`ratelimit.ts`**.

| Path | Role |
|------|------|
| `README.md` | Human-oriented overview for **bun-api-kit**, quick start, centered logo (`https://cdn.pimatis.org/bun-api-kit-logo.png`), and link to **Pimatis** / **pimatis.org**; keep aligned with real behavior when you change the template. |
| `.env.example` | Example production-oriented environment variables for local setup and deployments. Keep it aligned with every supported env var and the secure defaults documented below. |
| `index.ts` | Bun server bootstrap: port, passes `(req, server)` into `handleRequest`; logs startup with `log` from `src/utils/logger.ts` (`info` level). Runs as a plain `Bun.serve` HTTP entrypoint without custom process signal hooks. |
| `package.json` | Package name **`bun-api-kit`**; metadata (**author** Pimatis, **homepage** pimatis.org, **repository** `github.com/Pimatis/bun-api-kit`); `start` runs `bun --watch index.ts` (reload on file changes). |
| `src/routes/routes.ts` | Request pipeline: CORS preflight → `runWithRequestContext` → `runWithTrace` → access log → bounded metrics tracking (`route` labels, never raw attacker-controlled paths) → route handlers (each may enforce its own body limit) → `respondNotFound` → `finalize` (`mergeSecurityHeaders`, `mirrorRequestIdHeader`, `X-Trace-ID`). Compression applied for JSON responses over 1 KiB. |
| `src/routes/error/error.ts` | Not-found handler: `createRouteLimiter` + `consumeOr429`, then logs a warning and returns `apiFailure` with HTTP 404 and an English `message` in `data` (not registered in `handlers`; used only as fallback). |
| `src/routes/constants.ts` | `PREFIX` (`/api/v1`), ANSI `LOG_COLORS`, `LOG_RESET`. |
| `src/routes/<routeName>/` | One folder per route name (see routing below). |
| `src/routes/<routeName>/<file>.ts` | Route module: exports an async `handle(req, server, pathname?)` function. |
| `src/utils/logger.ts` | Colorized plain-text logging via `log(level, message, ctx?)`. Levels: `debug`, `info`, `warn`, `error`, `success`. Output format is `[LEVEL] message` plus optional `key=value` context fields, colored with `LOG_COLORS` from `src/routes/constants.ts`. Controlled by `LOG_LEVEL` env (default: `info`). |
| `src/utils/requestid.ts` | `getRequestId`, `runWithRequestContext`, `getCurrentRequestId`, `mirrorRequestIdHeader` (`AsyncLocalStorage` + `X-Request-ID` / `X-Correlation-ID` or UUID). |
| `src/utils/tracing.ts` | `runWithTrace`, `getTraceId`, `getSpanId`, `getTraceHeaders`. Generates `X-Trace-ID` for distributed tracing and mirrors it on final responses. |
| `src/utils/metrics.ts` | In-memory metrics: `http_requests_total`, `http_request_duration_ms`, `http_errors_total`, `rate_limit_hits_total`, `active_requests`. Route metrics must use bounded labels such as route ids, never raw request paths. Access via `getMetricsSnapshot()`. |
| `src/utils/validation.ts` | Zod-based validation helpers: `validateBody`, `validateQuery`, `validateParams`. Pre-built schemas for pagination, id, email. |
| `src/utils/compression.ts` | `negotiateEncoding` (parses Accept-Encoding), `compressResponse` (gzip/br compression for responses >1KB). |
| `src/utils/security/cors.ts` | `createCorsMiddleware`: configurable CORS with origin whitelist, credential support, and preflight handling. Production default is deny-by-default unless `CORS_ALLOWED_ORIGINS` is configured. |
| `src/utils/security/securityheaders.ts` | `mergeSecurityHeaders`: baseline headers on every outbound response (HSTS, CSP, X-Frame-Options, etc.). |
| `src/utils/security/bodysize.ts` | `createRouteBodyLimit` / async `checkBodySize` per route; `defaultMaxBodyBytes()` reads **`MAX_BODY_BYTES`** (default **1 MiB**). Enforces limits from `Content-Length` and streamed bodies. |
| `src/utils/response.ts` | `apiSuccess` / `apiFailure` for JSON API bodies with explicit `Content-Type`. |
| `src/utils/security/ratelimit.ts` | `createRouteLimiter` / `consumeOr429`: per-route `RateLimiterMemory` (different `points` / `durationSeconds` per route file). |
| `src/utils/clientip.ts` | `getClientIp`, `getClientIpKey`, `clientip`: one resolution order for logs and rate limiting. Forwarded headers are trusted only when the direct peer matches `TRUSTED_PROXY_RANGES` / `TRUSTED_PROXY_IPS`. |

---

## URL and routing conventions

- **API base path:** `PREFIX` is `/api/v1`. All HTTP API endpoints live under **`/api/v1/<routeName>`**, where `<routeName>` matches the **folder name** under `src/routes/` (example: `home` → `/api/v1/home`).
- **Handler pattern:** Each route file exports:

  ```ts
  export async function handle(
    req: Request,
    server: Bun.Server<undefined>,
    pathname?: string,
  ): Promise<Response | null>;
  ```

  Return **`null`** if this module does not handle the request (method/path mismatch). Otherwise return a **`Response`** (typically from `apiSuccess` / `apiFailure`). Check **path and method first**, then **await** **`createRouteBodyLimit` / `checkBodySize`** for this route’s `maxBytes`, then rate limiting, then handle the response (so unrelated requests do not consume another route’s limit or body quota).

- **Registration:** Import the handler in `src/routes/routes.ts` and append it to the `handlers` array. Order matters: first match wins.

- **Not found:** Requests that match no handler are handled by **`respondNotFound(req, server)`** in `src/routes/error/error.ts`. It runs the same **`consumeOr429`** pattern as other routes (dedicated limiter, `keyPrefix: "notFound"`), then uses **`apiFailure`** with status **404** and body shape `{ "success": false, "data": { "message": "The requested route does not exist." } }` when not rate limited. Do **not** add `respondNotFound` to the `handlers` array.

---

## Environment variables

| Variable | Purpose |
|----------|---------|
| `MAX_BODY_BYTES` | Optional. Default used by **`defaultMaxBodyBytes()`** (see **`security/bodysize.ts`**). Routes that pass `maxBytes: defaultMaxBodyBytes()` share this ceiling. Default: **1048576** (1 MiB). Invalid or empty values fall back to the default. |
| `LOG_LEVEL` | Optional. Controls logging verbosity. Values: `debug`, `info`, `warn`, `error`, `success`. Default: `info`. |
| `CORS_ALLOWED_ORIGINS` | Optional comma-separated browser origin allowlist for CORS. In production, if unset, cross-origin browser access is denied by default. |
| `TRUSTED_PROXY_RANGES` | Optional comma-separated list of trusted proxy IPv4 addresses or CIDRs. Only when the direct peer matches this list will `x-forwarded-for` / `x-real-ip` be used for logging and rate limiting. |
| `TRUSTED_PROXY_IPS` | Backward-compatible exact-IP alternative to `TRUSTED_PROXY_RANGES`. Ignored when `TRUSTED_PROXY_RANGES` is set. |
| `NODE_ENV` | Optional. When set to `production`, CORS defaults to deny-by-default unless `CORS_ALLOWED_ORIGINS` is configured. |

---

## Request ID (`src/utils/requestid.ts`)

- **Resolution:** Use incoming **`X-Request-ID`** or **`X-Correlation-ID`** when non-empty (trimmed, max **128** chars); otherwise generate a **UUID**.
- **Scope:** **`runWithRequestContext`** stores the id in **`AsyncLocalStorage`** so **`log()`** can append **`rid=<id>`** to every line for that request.
- **Response:** **`mirrorRequestIdHeader`** sets **`X-Request-ID`** on the final response (same value as in logs).

## Tracing (`src/utils/tracing.ts`)

- **Scope:** **`runWithTrace`** wraps request handling so each request gets a generated trace id and span id.
- **Logging:** `src/routes/routes.ts` includes the current trace id in access logs and unhandled-error logs.
- **Response:** Final responses include **`X-Trace-ID`** so callers can correlate client-visible failures and server logs.

---

## Security headers (`src/utils/security/securityheaders.ts`)

- **`mergeSecurityHeaders`** adds (if not already set): **`X-Content-Type-Options: nosniff`**, **`X-Frame-Options: DENY`**, **`Referrer-Policy: strict-origin-when-cross-origin`**, **`Strict-Transport-Security: max-age=31536000; includeSubDomains`**, **`Content-Security-Policy`**, **`X-XSS-Protection: 0`**, **`Permissions-Policy`**, **`Cache-Control: no-store, no-cache, must-revalidate, private`**, **`X-Download-Options: noopen`**, **`X-Permitted-Cross-Domain-Policies: none`**.
- Applied in **`routes.ts`** via **`finalize`** on all successful handler responses, not-found, **413** payload rejections, and rate-limit responses that pass through **`finalize`**.

---

## Body size (`src/utils/security/bodysize.ts`)

- **Per route (same idea as `security/ratelimit.ts`):** Call **`createRouteBodyLimit({ maxBytes })`** once per route module (or shared handler). After the route matches path/method, **await** **`bodyLimit.checkBodySize(req)`**; if it returns a **`Response`**, return it (HTTP **413**, JSON **`Request body too large.`**).
- **Env default:** **`defaultMaxBodyBytes()`** reads **`MAX_BODY_BYTES`** (see **Environment variables**). Use **`createRouteBodyLimit({ maxBytes: defaultMaxBodyBytes() })`** when this route should follow the global default, or pass a **literal** `maxBytes` for uploads vs small JSON endpoints.
- **`error/error.ts`** uses its own **`createRouteBodyLimit`** for requests that fall through to **404** (unknown paths).
- If **`Content-Length`** is missing or invalid, `checkBodySize` reads the cloned request stream and rejects once the route limit is exceeded.
- Rejections log a **`warning`** from inside **`createRouteBodyLimit`** (includes method, path, observed length, and limit).

---

## Logging (`src/utils/logger.ts`)

- **Entrypoint:** `index.ts` imports `log` from `./src/utils/logger.ts` and uses it for the server-ready line (for example `log("info", "Listening on http://localhost:3000")`). Do not use raw `console.log` there.
- **Request log:** `src/routes/routes.ts` logs **`info`** for each incoming request: HTTP method, path, **`client=...`** from **`clientip`**, **`traceId`** from **`tracing`**, and request-scoped **`rid`** from **`requestid`** (see **Client IP**, **Tracing**, and **Request ID**). Body size is enforced inside each route (or **`respondNotFound`**) after path matching.
- **Required usage:** Every route module **must** call `log` from `../../utils/logger.ts` (adjust relative path as needed) for meaningful events (success, errors, etc.). Unmatched-route logging lives in **`src/routes/error/error.ts`** (`respondNotFound`).
- **Levels:** `debug`, `info`, `warn`, `error`, `success`. Controlled by `LOG_LEVEL` env (default: `info`).
- **Format:** Colorized plain text using **`LOG_COLORS`** in `src/routes/constants.ts`, shaped as **`[LEVEL] message`** and followed by optional `key=value` fields. Example: `[INFO] GET /api/v1/home rid=... traceId=...`

---

## JSON responses (`src/utils/response.ts`)

- **Required usage:** Route handlers **must** return JSON via **`apiSuccess`** or **`apiFailure`** from `../../utils/response.ts` (not raw `Response.json` for API bodies), except where the project later standardizes non-JSON responses (document that here if added).
- **Shape:**
  - Always includes `"success": true` or `"success": false`.
  - Optional `"data"` is included only when there is meaningful payload (see `shouldOmitData` in `response.ts`: omits empty `data` for `undefined`, `null`, `""`, `[]`, and empty plain objects; keeps non-empty objects and `Date` values).
- **HTTP options:** Second argument is `ResponseInit` (e.g. `{ status: 404 }`). Unmatched routes use `apiFailure` with a **`data`** payload (see `src/routes/error/error.ts`).

---

## Rate limiting (`src/utils/security/ratelimit.ts`)

- **Library:** [rate-limiter-flexible](https://www.npmjs.com/package/rate-limiter-flexible) **`RateLimiterMemory`** (in-process, fixed window; see project `package.json` for the version in use).
- **Per-route configuration:** In each route module, call **`createRouteLimiter({ points, durationSeconds, keyPrefix? })`** with limits appropriate to that endpoint (for example **300** requests per **60** seconds for a heavy write route, **5000** per **60** seconds for a light read route). Each call returns a dedicated limiter instance so limits stay independent.
- **Enforcement:** Call **`await limiter.consumeOr429(req, server)`** after you know the request targets this route. If it returns a **`Response`**, return it immediately (HTTP **429**, JSON **`apiFailure`** body with an English message, **`Retry-After`** header).
- **Client key:** Same as **`getClientIpKey`** in **`src/utils/clientip.ts`** (shared with access logs). Do not trust forwarding headers unless the immediate peer is in `TRUSTED_PROXY_RANGES` / `TRUSTED_PROXY_IPS`.

---

## Client IP (`src/utils/clientip.ts`)

Resolution order (one source of truth for **logs** and **rate limiting**):

1. Bun **`server.requestIP(req)`** is always read first to identify the immediate peer.
2. If the immediate peer matches **`TRUSTED_PROXY_RANGES`** / **`TRUSTED_PROXY_IPS`**, use the first address in **`x-forwarded-for`** when valid.
3. Else, if the immediate peer is trusted, use **`x-real-ip`** when valid.
4. Else fall back to the Bun socket address (logged as **`(direct)`**).

Use **`getClientIp`** / **`clientip`** for display and **`getClientIpKey`** for limiter keys.

---

## Metrics (`src/utils/metrics.ts`)

- Route-level metrics must use bounded labels such as known route ids (`home`, `health`, `not_found`) instead of raw request paths.
- Avoid exposing detailed metrics on public endpoints. Keep `/api/v1/health` small and stable for load balancers and Kubernetes probes.

---

## Example: `home` route

- File: `src/routes/home/home.ts`
- Path: `GET /api/v1/home`
- Uses `PREFIX` from `constants.ts`, **`createRouteBodyLimit`** (example: **`maxBytes: defaultMaxBodyBytes()`**), **`createRouteLimiter`** (example: **5000** points per **60** seconds, `keyPrefix: "home"`), logs with `log("success", ...)`, responds with `apiSuccess()` when no payload is needed.

---

## Adding a new route (checklist)

1. Create `src/routes/<routeName>/<routeName>.ts` (or another `.ts` name inside that folder; keep folder name equal to the URL segment after `PREFIX`).
2. Implement **`async`** `handle(req, server)` matching `${PREFIX}/<routeName>` (and HTTP methods as required). Gate path/method **before** **`checkBodySize`** and **`consumeOr429`**.
3. Add **`createRouteBodyLimit({ maxBytes })`** (use **`defaultMaxBodyBytes()`** or a literal) and **await** **`checkBodySize`** when the route matches.
4. Add **`createRouteLimiter`** with limits for this route; **`await consumeOr429`** when the route matches.
5. Use **`log`** at least once for relevant outcomes.
6. Return responses with **`apiSuccess`** / **`apiFailure`** only.
7. Import and register the handler in `src/routes/routes.ts` inside `handlers`.
8. **Update this `AGENTS.md`** with the new endpoint and any new conventions.

Do **not** register `respondNotFound` from `error/error.ts` in `handlers`; it is only called from `routes.ts` after all handlers return `null`.

---

## Scripts

| Command | Description |
|---------|-------------|
| `bun run start` | Runs `bun --watch index.ts`: starts the server and reloads on file changes. |

---

## Implemented infrastructure (summary)

The following is already in place:

- **HTTP and WebSockets:** Bun-native APIs only; no Express, `ws`, or similar third-party servers (see **HTTP and WebSockets (Bun only)** above).
- Bun HTTP server on port **3000** with watch mode via **`bun run start`**.
- **`/api/v1/<routeName>`** routing with **`PREFIX`** in `src/routes/constants.ts`.
- Modular routes under **`src/routes/<routeName>/`**, aggregated in **`src/routes/routes.ts`**, plus **`src/routes/error/error.ts`** for unknown-route responses.
- Colorized plain-text **`log`** helper controlled by `LOG_LEVEL` env.
- Standard JSON API responses via **`apiSuccess`** / **`apiFailure`** in **`src/utils/response.ts`** with explicit `Content-Type`.
- Per-route rate limiting via **`rate-limiter-flexible`** and **`src/utils/security/ratelimit.ts`** (`createRouteLimiter`, `consumeOr429`).
- **`src/utils/clientip.ts`** for consistent client IP in logs and rate-limiter keys with trusted-proxy-aware forwarding rules.
- Request **correlation ids** (`requestid.ts`), distributed **tracing** (`tracing.ts`), and **metrics** (`metrics.ts`) for observability.
- Baseline **security headers** (`security/securityheaders.ts`): HSTS, CSP, X-Frame-Options, Permissions-Policy, Cache-Control, etc.
- Per-route **`Content-Length`** limits (`createRouteBodyLimit`, **`defaultMaxBodyBytes`** / **`MAX_BODY_BYTES`**) under **`src/utils/security/`**.
- **CORS middleware** (`security/cors.ts`) with configurable origin whitelist and preflight handling.
- **Compression** (`compression.ts`) for JSON responses larger than **1 KiB** with real gzip/br/deflate encoding negotiation.
- **Input validation** (`validation.ts`) via Zod schemas.
- **`/api/v1/health`** endpoint for Kubernetes/load balancer health checks with a minimal readiness payload.
- **English** comments and logging style in the maintained source tree.
- Root **`README.md`** (overview and quick start) and **`package.json`** metadata (**name** `bun-api-kit`, **author** Pimatis, **homepage** https://pimatis.org, **repository** `Pimatis/bun-api-kit` on GitHub).

---

## Contributing and pull requests

1. Follow the conventions above.
2. Keep changes focused; avoid unrelated refactors.
3. Update **`AGENTS.md`** for every infrastructure or behavior change (mandatory).
4. Ensure new routes use **logger**, **response**, **body limit**, and **rate limit** helpers as described.
5. Do not introduce third-party **HTTP** or **WebSocket** libraries; keep using **Bun** APIs only (see **HTTP and WebSockets (Bun only)**). Approved helpers such as **rate-limiter-flexible** for throttling are fine; they must not replace **`Bun.serve`**.

If you are an AI agent, treat this file as the source of truth for project rules; if instructions conflict, prefer **this file** and ask the user when ambiguity remains.
