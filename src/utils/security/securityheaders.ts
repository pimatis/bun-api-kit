/**
 * Baseline security headers for API responses.
 * Defense-in-depth: headers are set only if not already present to avoid overriding explicit configuration.
 *
 * Headers added:
 * - X-Content-Type-Options: nosniff          [MIME sniffing protection]
 * - X-Frame-Options: DENY                   [Clickjacking prevention]
 * - Referrer-Policy: strict-origin-when-cross-origin [Referrer leakage prevention]
 * - Strict-Transport-Security (HSTS)         [HTTPS enforcement, 1 year max-age]
 * - Content-Security-Policy                  [XSS/injection mitigation]
 * - X-XSS-Protection                         [Legacy XSS filter (Chromium removed, still needed for old browsers)]
 * - Permissions-Policy                       [Disables unnecessary browser features]
 * - Cache-Control: no-store, no-cache         [Prevents sensitive data caching]
 * - X-Download-Options: noopen               [Prevents file download dialog]
 * - X-Permitted-Cross-Domain-Policies: none  [Adobe Flash restrictions]
 */
const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "DENY"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Strict-Transport-Security", "max-age=31536000; includeSubDomains"],
  [
    "Content-Security-Policy",
    "default-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  ],
  ["X-XSS-Protection", "0"],
  [
    "Permissions-Policy",
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  ],
  ["Cache-Control", "no-store, no-cache, must-revalidate, private"],
  ["X-Download-Options", "noopen"],
  ["X-Permitted-Cross-Domain-Policies", "none"],
] as const;

/** Merges security headers into `response` without removing existing values. */
export function mergeSecurityHeaders(response: Response): Response {
  const headers = response.headers;
  let modified = false;

  for (const [key, value] of SECURITY_HEADERS) {
    if (!headers.has(key)) {
      if (!modified) {
        modified = true;
      }
      headers.set(key, value);
    }
  }

  return response;
}
