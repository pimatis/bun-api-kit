/** Runtime CORS configuration shared by preflight and normal responses. */
export type CorsConfig = {
  origin?: string | string[] | ((origin: string) => boolean);
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
};

/** Internal helper type for a definitely-configured origin rule. */
type AllowedOrigin = Exclude<CorsConfig["origin"], undefined>;

/** Default to explicit origins in production and permissive local development otherwise. */
function getDefaultOrigin(): AllowedOrigin {
  const configuredOrigins = Bun.env.CORS_ALLOWED_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (configuredOrigins && configuredOrigins.length > 0) {
    return configuredOrigins;
  }

  if (Bun.env.NODE_ENV === "production") {
    return [];
  }

  return "*";
}

/** Resolve the startup-time default origin behavior once. */
const DEFAULT_ORIGIN: AllowedOrigin = getDefaultOrigin();

/** Baseline CORS configuration for this API template. */
const DEFAULT_CORS: Required<CorsConfig> = {
  origin: DEFAULT_ORIGIN,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID", "X-Trace-ID"],
  exposedHeaders: ["X-Request-ID", "X-Trace-ID"],
  credentials: false,
  maxAge: 86400,
};

/** Decide whether one browser origin should receive CORS headers. */
function isOriginAllowed(
  origin: string,
  config: CorsConfig,
): boolean {
  const { origin: originConfig } = config;
  if (!originConfig || originConfig === "*") {
    return true;
  }
  if (Array.isArray(originConfig)) {
    return originConfig.includes(origin);
  }
  if (typeof originConfig === "function") {
    return originConfig(origin);
  }
  return originConfig === origin;
}

/** Create a reusable CORS middleware pair for preflight and final responses. */
export function createCorsMiddleware(config: CorsConfig = {}) {
  const cfg = { ...DEFAULT_CORS, ...config };

  return {
    /** Handle true browser preflight requests before route dispatch runs. */
    handlePreflight(req: Request): Response | null {
      if (req.method !== "OPTIONS") {
        return null;
      }
      const origin = req.headers.get("Origin");
      if (!origin) {
        return null;
      }
      if (!isOriginAllowed(origin, cfg)) {
        return new Response(null, { status: 403 });
      }
      const accessControlRequestMethod = req.headers.get("Access-Control-Request-Method");
      if (!accessControlRequestMethod) {
        return null;
      }
      const accessControlRequestHeaders = req.headers.get("Access-Control-Request-Headers");

      const headers = new Headers();
      headers.set("Access-Control-Allow-Origin", origin);
      if (cfg.credentials) {
        headers.set("Access-Control-Allow-Credentials", "true");
      }
      if (cfg.exposedHeaders?.length) {
        headers.set("Access-Control-Expose-Headers", cfg.exposedHeaders.join(", "));
      }
      if (accessControlRequestMethod) {
        headers.set("Access-Control-Allow-Methods", cfg.methods?.join(", ") ?? DEFAULT_CORS.methods.join(", "));
      }
      if (accessControlRequestHeaders) {
        headers.set("Access-Control-Allow-Headers", accessControlRequestHeaders);
      }
      if (cfg.maxAge) {
        headers.set("Access-Control-Max-Age", String(cfg.maxAge));
      }
      return new Response(null, { status: 204, headers });
    },

    /** Mirror CORS headers onto non-preflight responses when the origin is allowed. */
    appendCorsHeaders(response: Response, req: Request): Response {
      const origin = req.headers.get("Origin");
      if (!origin) {
        return response;
      }
      if (!isOriginAllowed(origin, cfg)) {
        return response;
      }
      response.headers.set("Access-Control-Allow-Origin", origin);
      if (cfg.credentials) {
        response.headers.set("Access-Control-Allow-Credentials", "true");
      }
      if (cfg.exposedHeaders?.length) {
        response.headers.set("Access-Control-Expose-Headers", cfg.exposedHeaders.join(", "));
      }
      return response;
    },
  };
}
