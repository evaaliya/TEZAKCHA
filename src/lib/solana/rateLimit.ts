const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

/** Global demo cap on successful prepares per UTC day (in-memory). */
export const MAX_SENDS_PER_DAY = 50;

export const DEMO_LIMIT_MESSAGE = "Demo limit reached, try later";

const g = globalThis as unknown as {
  __tezakchaRateLimit?: Map<string, number[]>;
  __tezakchaDailySends?: { day: string; count: number };
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
  g.__tezakchaDailySends = undefined;
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

/** True if another prepare is allowed under the global daily demo cap. */
export function allowDailySend(): boolean {
  const day = utcDay();
  const state = g.__tezakchaDailySends;
  if (!state || state.day !== day) return true;
  return state.count < MAX_SENDS_PER_DAY;
}

export function recordDailySend(): void {
  const day = utcDay();
  const state = g.__tezakchaDailySends;
  if (!state || state.day !== day) {
    g.__tezakchaDailySends = { day, count: 1 };
    return;
  }
  state.count += 1;
}
