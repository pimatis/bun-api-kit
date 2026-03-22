/** Supported sources for the client address used in logs and rate limiting. */
export type ClientIpSource =
  | "forwarded"
  | "real-ip"
  | "socket"
  | "unknown";

export type ClientIpResult = {
  address: string;
  source: ClientIpSource;
};

/** Trusted proxy entries can be exact IPv4 addresses or CIDR ranges. */
type TrustedProxyRule =
  | { kind: "exact"; value: string }
  | { kind: "cidr"; network: number; mask: number };

const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const IPV6_REGEX = /^(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}|:(?::[0-9a-fA-F]{1,4}){1,7}|::)$/;
/** Parse trusted proxy configuration once during startup. */
const TRUSTED_PROXY_RULES = parseTrustedProxyRules(
  Bun.env.TRUSTED_PROXY_RANGES ?? Bun.env.TRUSTED_PROXY_IPS ?? "",
);

/** Accept only compact IPv4 or IPv6 strings that look like real addresses. */
function isValidIP(ip: string): boolean {
  if (!ip || ip.length > 45) {
    return false;
  }
  if (!/^[0-9a-fA-F.:]+$/.test(ip)) {
    return false;
  }
  return IPV4_REGEX.test(ip) || IPV6_REGEX.test(ip);
}

/** Convert IPv4 strings to integers so CIDR checks stay cheap at runtime. */
function ipv4ToInt(ip: string): number | null {
  if (!IPV4_REGEX.test(ip)) {
    return null;
  }
  const parts = ip.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return (((parts[0] ?? 0) << 24) >>> 0)
    + (((parts[1] ?? 0) << 16) >>> 0)
    + (((parts[2] ?? 0) << 8) >>> 0)
    + ((parts[3] ?? 0) >>> 0);
}

/** Expand trusted proxy env configuration into normalized match rules. */
function parseTrustedProxyRules(raw: string): TrustedProxyRule[] {
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .reduce<TrustedProxyRule[]>((rules, value) => {
      if (value.includes("/")) {
        const [network, maskRaw] = value.split("/", 2);
        const maskBits = Number.parseInt(maskRaw ?? "", 10);
        const networkInt = network ? ipv4ToInt(network) : null;
        if (networkInt === null || !Number.isInteger(maskBits) || maskBits < 0 || maskBits > 32) {
          return rules;
        }
        const mask = maskBits === 0 ? 0 : (0xffffffff << (32 - maskBits)) >>> 0;
        rules.push({ kind: "cidr", network: networkInt & mask, mask });
        return rules;
      }
      if (!isValidIP(value)) {
        return rules;
      }
      rules.push({ kind: "exact", value });
      return rules;
    }, []);
}

/** Check whether the direct peer is allowed to supply forwarded client IP headers. */
function isTrustedProxy(address: string): boolean {
  if (!address || TRUSTED_PROXY_RULES.length === 0) {
    return false;
  }
  for (const rule of TRUSTED_PROXY_RULES) {
    if (rule.kind === "exact") {
      if (rule.value === address) {
        return true;
      }
      continue;
    }
    const current = ipv4ToInt(address);
    if (current !== null && (current & rule.mask) === rule.network) {
      return true;
    }
  }
  return false;
}

/** Resolve one client IP for both logs and rate limiting. */
export function getClientIp(
  req: Request,
  server: Bun.Server<undefined>,
): ClientIpResult {
  const socket = server.requestIP(req);
  const socketAddress = socket?.address;
  const trustForwardedHeaders = socketAddress ? isTrustedProxy(socketAddress) : false;

  if (!trustForwardedHeaders) {
    if (socketAddress) {
      return { address: socketAddress, source: "socket" };
    }
    return { address: "unknown", source: "unknown" };
  }

  const xForwardedFor = req.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const first = xForwardedFor.split(",")[0]?.trim();
    if (first && isValidIP(first)) {
      return { address: first, source: "forwarded" };
    }
  }

  const xRealIp = req.headers.get("x-real-ip")?.trim();
  if (xRealIp && isValidIP(xRealIp)) {
    return { address: xRealIp, source: "real-ip" };
  }

  if (socketAddress) {
    return { address: socketAddress, source: "socket" };
  }

  return { address: "unknown", source: "unknown" };
}

/** Reuse the resolved client IP directly as the rate-limit identity key. */
export function getClientIpKey(
  req: Request,
  server: Bun.Server<undefined>,
): string {
  return getClientIp(req, server).address;
}

/** Format the chosen client IP with the header or transport source that won. */
export function clientip(
  req: Request,
  server: Bun.Server<undefined>,
): string {
  const { address, source } = getClientIp(req, server);
  if (source === "unknown") {
    return "unknown";
  }
  const via =
    source === "forwarded"
      ? "x-forwarded-for"
      : source === "real-ip"
        ? "x-real-ip"
        : "direct";
  return `${address} (${via})`;
}
