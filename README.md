<p align="center">
  <a href="https://pimatis.org" title="Pimatis">
    <img src="https://cdn.pimatis.org/bun-api-kit-logo.png" alt="bun-api-kit" width="280" />
  </a>
</p>

<h3 align="center">Production-ready HTTP API starter for Bun</h3>

<p align="center">
  Zero framework overhead. Just <code>Bun.serve</code>, TypeScript, and a clean architecture you can ship today.
</p>

<p align="center">
  <a href="https://bun.com"><img src="https://img.shields.io/badge/runtime-Bun-f472b6?style=flat-square&logo=bun" alt="Bun" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/lang-TypeScript%205-3178c6?style=flat-square&logo=typescript&logoColor=fff" alt="TypeScript" /></a>
  <a href="https://github.com/Pimatis/bun-api-kit/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License" /></a>
</p>

---

## Why bun-api-kit?

Most API starters bolt a framework onto the runtime and call it done. **bun-api-kit** takes a different approach: it uses **`Bun.serve`** directly with the standard `Request` / `Response` model and layers only the cross-cutting infrastructure every production service actually needs: structured logging, request correlation, rate limiting, body-size enforcement, and security headers.

The result is a codebase with **no hidden middleware chain**, **no magic routing**, and **no dependency you didn't ask for**. You get a clear, auditable request pipeline and full control over every byte that enters or leaves your server.

---

## Features

| Area | What it does |
|---|---|
| **Routing** | File-based modules under `src/routes/<name>/`, mounted at `/api/v1/<name>`. First match wins with explicit path and method checks. No regex, no wildcards. |
| **JSON responses** | `apiSuccess` / `apiFailure` helpers enforce a consistent `{ success, data? }` contract across every endpoint. |
| **Request correlation** | Each request receives a unique `rid` (from `X-Request-ID`, `X-Correlation-ID`, or a generated UUID), logged on every line and mirrored back via the `X-Request-ID` response header. |
| **Structured logging** | Color-coded, level-aware console output (`success` · `error` · `warning` · `info`) with automatic `rid=` suffix inside request scope. |
| **Client IP resolution** | Single resolution order (`x-forwarded-for` → `x-real-ip` → Bun socket) shared between logs and rate-limiter keys. |
| **Rate limiting** | Per-route in-memory limiters via [rate-limiter-flexible](https://www.npmjs.com/package/rate-limiter-flexible). Independent quotas per endpoint, no global bottleneck. |
| **Body-size limits** | Per-route `Content-Length` enforcement with configurable ceilings. Environment-driven default or per-endpoint override. |
| **Security headers** | `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy` applied to every response automatically. |
| **404 handling** | Unmatched routes receive a structured JSON 404 with their own rate limiter and body-size gate. |

---

## Requirements

- [Bun](https://bun.com/) (current stable release)
- TypeScript **^5**

---

## Quick start

```bash
bun install
cp .env.example .env
bun run start
```

The server starts on **port 3000** with hot reload (`bun --watch`).

```bash
curl http://localhost:3000/api/v1/home
```

```json
{ "success": true }
```

## Environment

An example production-oriented environment file is provided at [`.env.example`](/Users/fatih/Documents/Projeler/bunts-template/.env.example).

- `NODE_ENV=production` enables the production CORS default, which denies browser origins unless `CORS_ALLOWED_ORIGINS` is set.
- `CORS_ALLOWED_ORIGINS` should list the exact browser origins allowed to call the API.
- `TRUSTED_PROXY_RANGES` should contain the IPs or IPv4 CIDRs of your reverse proxies before forwarded client IP headers are trusted.
- `MAX_BODY_BYTES` controls the default per-route body limit.
- `LOG_LEVEL` controls console verbosity.

---

## License

This project is licensed under the [MIT License](./LICENSE).


<p align="center">
  Built and maintained by <a href="https://pimatis.org"><strong>Pimatis</strong></a>
</p>
