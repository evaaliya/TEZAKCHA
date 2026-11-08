import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import type { RatesSnapshot, ReferenceRate } from "@/lib/engine/types";
import {
  finalizeRatesSnapshot,
  loadRatesFixtures,
} from "@/lib/engine/snapshot";
import { fetchCbrUsdRub } from "./cbr";
import { fetchNbkrUsdKgs } from "./nbkr";

export type RatesSourceKind = "live" | "live_stale" | "snapshot";

export interface VersionedRatesSnapshot extends RatesSnapshot {
  rates_source: RatesSourceKind;
  rates_version: string;
  rates_updated_at: string;
}

const MAX_VERSIONS = 20;
const MAX_DEVIATION_PCT = new Decimal(5);

type CacheState = {
  snapshot: VersionedRatesSnapshot;
  /** Last accepted official legs (for 5% guard + live_stale). */
  usdKgs: Decimal;
  usdRub: Decimal;
  fetchedAtMs: number;
};

const g = globalThis as unknown as {
  __tezakchaRatesCache?: CacheState | null;
  __tezakchaRatesInflight?: Promise<VersionedRatesSnapshot> | null;
  __tezakchaRatesVersions?: Map<string, VersionedRatesSnapshot>;
  __tezakchaRatesFetchImpl?: typeof fetch;
};

function cache(): CacheState | null {
  return g.__tezakchaRatesCache ?? null;
}

function setCache(next: CacheState | null) {
  g.__tezakchaRatesCache = next;
}

function versions(): Map<string, VersionedRatesSnapshot> {
  if (!g.__tezakchaRatesVersions) {
    g.__tezakchaRatesVersions = new Map();
  }
  return g.__tezakchaRatesVersions;
}

function ttlSeconds(): number {
  const raw = process.env.RATES_TTL_SECONDS;
  const n = raw ? Number(raw) : 3600;
  return Number.isFinite(n) && n > 0 ? n : 3600;
}

function fetchTimeoutMs(): number {
  const raw = process.env.RATES_FETCH_TIMEOUT_MS;
  const n = raw ? Number(raw) : 3000;
  return Number.isFinite(n) && n > 0 ? n : 3000;
}

function fetchImpl(): typeof fetch {
  return g.__tezakchaRatesFetchImpl ?? fetch;
}

/** Test hook: inject fetch; by default clears cache/versions. */
export function __resetLiveRatesForTests(options?: {
  fetchImpl?: typeof fetch;
  keepCache?: boolean;
}) {
  if (!options?.keepCache) {
    setCache(null);
    g.__tezakchaRatesInflight = null;
    g.__tezakchaRatesVersions = new Map();
  }
  if (options && "fetchImpl" in options) {
    g.__tezakchaRatesFetchImpl = options.fetchImpl;
  }
}

export function getRatesByVersion(
  ratesVersion: string,
): VersionedRatesSnapshot | undefined {
  return versions().get(ratesVersion);
}

function rememberVersion(snapshot: VersionedRatesSnapshot) {
  const map = versions();
  map.set(snapshot.rates_version, snapshot);
  while (map.size > MAX_VERSIONS) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

function computeRatesVersion(
  mid: Record<string, string>,
  offRamps: RatesSnapshot["off_ramps"],
  fetchedAt: string,
): string {
  const payload = JSON.stringify({
    mid_rates: {
      RUB_USDC: mid.RUB_USDC,
      USDC_KGS: mid.USDC_KGS,
      RUB_KGS: mid.RUB_KGS,
    },
    off_ramps: offRamps,
    at: fetchedAt,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

function withinFivePercent(candidate: Decimal, baseline: Decimal): boolean {
  if (!baseline.isFinite() || baseline.lte(0)) return false;
  const pct = candidate.minus(baseline).abs().div(baseline).mul(100);
  return pct.lte(MAX_DEVIATION_PCT);
}

function fixtureBaseline(): {
  snapshot: RatesSnapshot;
  usdKgs: Decimal;
  usdRub: Decimal;
} {
  const raw = loadRatesFixtures();
  const finalized = finalizeRatesSnapshot(raw);
  const usdKgs = new Decimal(finalized.mid_rates.USDC_KGS);
  // RUB_USDC = 1 / USD_RUB  ⇒  USD_RUB = 1 / RUB_USDC
  const usdRub = new Decimal(1).div(new Decimal(finalized.mid_rates.RUB_USDC));
  return { snapshot: finalized, usdKgs, usdRub };
}

function buildReferenceRates(
  base: ReferenceRate[] | undefined,
  usdKgs: { value: Decimal; asOf?: string; fallback: boolean },
  usdRub: { value: Decimal; asOf?: string; fallback: boolean },
): ReferenceRate[] {
  const byId = new Map((base ?? []).map((r) => [r.id, { ...r }]));

  const nbkr = byId.get("nbkr_usd_kgs") ?? {
    id: "nbkr_usd_kgs",
    institution_key: "sources.nbkr",
    pair: "USD/KGS",
    value: usdKgs.value.toFixed(),
  };
  nbkr.value = usdKgs.value.toFixed();
  if (usdKgs.asOf) nbkr.as_of = usdKgs.asOf;
  byId.set("nbkr_usd_kgs", nbkr);

  const cbr = byId.get("cbr_usd_rub") ?? {
    id: "cbr_usd_rub",
    institution_key: "sources.cbr",
    pair: "USD/RUB",
    value: usdRub.value.toFixed(),
  };
  cbr.value = usdRub.value.toFixed();
  if (usdRub.asOf) cbr.as_of = usdRub.asOf;
  byId.set("cbr_usd_rub", cbr);

  return Array.from(byId.values());
}

function assembleSnapshot(params: {
  usdKgs: Decimal;
  usdRub: Decimal;
  usdKgsAsOf?: string;
  usdRubAsOf?: string;
  usdKgsFallback: boolean;
  usdRubFallback: boolean;
  rates_source: RatesSourceKind;
  fetchedAt: string;
}): VersionedRatesSnapshot {
  const base = loadRatesFixtures();

  // USDC ≈ USD for the demo corridor (stablecoin peg assumption).
  const usdcKgs = params.usdKgs;
  // RUB per USDC mid: invert CBR USD/RUB.
  const rubUsdc = new Decimal(1).div(params.usdRub);

  const mid_rates = {
    ...base.mid_rates,
    USDC_KGS: usdcKgs.toFixed(),
    RUB_USDC: rubUsdc.toFixed(),
  };

  const reference_rates = buildReferenceRates(
    base.reference_rates,
    {
      value: params.usdKgs,
      asOf: params.usdKgsAsOf,
      fallback: params.usdKgsFallback,
    },
    {
      value: params.usdRub,
      asOf: params.usdRubAsOf,
      fallback: params.usdRubFallback,
    },
  );

  const finalized = finalizeRatesSnapshot({
    ...base,
    mid_rates,
    reference_rates,
    snapshot_date: params.fetchedAt.slice(0, 10),
  });

  const rates_version = computeRatesVersion(
    finalized.mid_rates,
    finalized.off_ramps,
    params.fetchedAt,
  );

  const snapshot: VersionedRatesSnapshot = {
    ...finalized,
    rates_source: params.rates_source,
    rates_version,
    rates_updated_at: params.fetchedAt,
  };
  rememberVersion(snapshot);
  return snapshot;
}

function snapshotFromFixtures(fetchedAt = new Date().toISOString()): VersionedRatesSnapshot {
  const { snapshot, usdKgs, usdRub } = fixtureBaseline();
  const rates_version = computeRatesVersion(
    snapshot.mid_rates,
    snapshot.off_ramps,
    fetchedAt,
  );
  const versioned: VersionedRatesSnapshot = {
    ...snapshot,
    rates_source: "snapshot",
    rates_version,
    rates_updated_at: fetchedAt,
  };
  rememberVersion(versioned);
  setCache({
    snapshot: versioned,
    usdKgs,
    usdRub,
    fetchedAtMs: Date.parse(fetchedAt) || Date.now(),
  });
  return versioned;
}

async function refreshLive(): Promise<VersionedRatesSnapshot> {
  const timeout = fetchTimeoutMs();
  const baseline = cache();
  const fixtures = fixtureBaseline();
  const guardKgs = baseline?.usdKgs ?? fixtures.usdKgs;
  const guardRub = baseline?.usdRub ?? fixtures.usdRub;

  let usdKgs = baseline?.usdKgs ?? fixtures.usdKgs;
  let usdRub = baseline?.usdRub ?? fixtures.usdRub;
  let usdKgsAsOf: string | undefined =
    baseline?.snapshot.reference_rates?.find((r) => r.id === "nbkr_usd_kgs")
      ?.as_of ?? fixtures.snapshot.reference_rates?.find((r) => r.id === "nbkr_usd_kgs")
      ?.as_of;
  let usdRubAsOf: string | undefined =
    baseline?.snapshot.reference_rates?.find((r) => r.id === "cbr_usd_rub")
      ?.as_of ?? fixtures.snapshot.reference_rates?.find((r) => r.id === "cbr_usd_rub")
      ?.as_of;
  let kgsFallback = true;
  let rubFallback = true;
  let anyFresh = false;
  let anyAttempt = false;

  try {
    anyAttempt = true;
    const nbkr = await fetchNbkrUsdKgs(timeout, fetchImpl());
    if (withinFivePercent(nbkr.value, guardKgs)) {
      usdKgs = nbkr.value;
      usdKgsAsOf = nbkr.asOf ?? usdKgsAsOf;
      kgsFallback = false;
      anyFresh = true;
    } else {
      console.error(
        "[rates] NBKR value rejected (>5% vs baseline)",
        nbkr.value.toFixed(),
        "baseline",
        guardKgs.toFixed(),
      );
    }
  } catch (e) {
    console.error("[rates] NBKR fetch failed", e);
  }

  try {
    anyAttempt = true;
    const cbr = await fetchCbrUsdRub(timeout, fetchImpl());
    if (withinFivePercent(cbr.value, guardRub)) {
      usdRub = cbr.value;
      usdRubAsOf = cbr.asOf ?? usdRubAsOf;
      rubFallback = false;
      anyFresh = true;
    } else {
      console.error(
        "[rates] CBR value rejected (>5% vs baseline)",
        cbr.value.toFixed(),
        "baseline",
        guardRub.toFixed(),
      );
    }
  } catch (e) {
    console.error("[rates] CBR fetch failed", e);
  }

  const fetchedAt = new Date().toISOString();

  if (!anyFresh) {
    if (baseline) {
      const stale: VersionedRatesSnapshot = {
        ...baseline.snapshot,
        rates_source: "live_stale",
        rates_updated_at: baseline.snapshot.rates_updated_at,
      };
      // Re-hash with stale marker time so version stays the same as last good.
      rememberVersion(stale);
      setCache({ ...baseline, snapshot: stale });
      return stale;
    }
    if (!anyAttempt) {
      // unreachable
    }
    return snapshotFromFixtures(fetchedAt);
  }

  const snapshot = assembleSnapshot({
    usdKgs,
    usdRub,
    usdKgsAsOf,
    usdRubAsOf,
    usdKgsFallback: kgsFallback,
    usdRubFallback: rubFallback,
    rates_source: "live",
    fetchedAt,
  });

  setCache({
    snapshot,
    usdKgs,
    usdRub,
    fetchedAtMs: Date.now(),
  });
  return snapshot;
}

export async function getLiveRatesSnapshot(): Promise<VersionedRatesSnapshot> {
  const existing = cache();
  const ttlMs = ttlSeconds() * 1000;
  if (existing && Date.now() - existing.fetchedAtMs < ttlMs) {
    return existing.snapshot;
  }

  if (g.__tezakchaRatesInflight) {
    return g.__tezakchaRatesInflight;
  }

  g.__tezakchaRatesInflight = refreshLive().finally(() => {
    g.__tezakchaRatesInflight = null;
  });
  return g.__tezakchaRatesInflight;
}

export async function getFixturesRatesSnapshot(): Promise<VersionedRatesSnapshot> {
  return snapshotFromFixtures();
}
