const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

const g = globalThis as unknown as {
  __tezakchaRateLimit?: Map<string, number[]>;
};

function buckets(): Map<string, number[]> {
  if (!g.__tezakchaRateLimit) {
    g.__tezakchaRateLimit = new Map();
  }
  return g.__tezakchaRateLimit;
}

/** Returns true if the IP is allowed; false if rate-limited. */
export function allowRequest(ip: string): boolean {
  const now = Date.now();
  const map = buckets();
  const prev = (map.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (prev.length >= MAX_REQUESTS) {
    map.set(ip, prev);
    return false;
  }
  prev.push(now);
  map.set(ip, prev);
  return true;
}

export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") || "unknown";
}

export function resetRateLimitForTests(): void {
  g.__tezakchaRateLimit = new Map();
}
