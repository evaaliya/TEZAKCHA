import {
  getFixturesRatesSnapshot,
  getLiveRatesSnapshot,
  type VersionedRatesSnapshot,
} from "@/lib/rates/live";

export { loadRatesFixtures, finalizeRatesSnapshot } from "./snapshot";

/**
 * Default RATES_SOURCE=live. fixtures keeps the on-disk snapshot only.
 * Live path: fresh → last-good (live_stale) → fixtures snapshot.
 */
export async function getRatesSnapshot(): Promise<VersionedRatesSnapshot> {
  const source = (process.env.RATES_SOURCE ?? "live").toLowerCase();
  if (source === "fixtures") {
    return getFixturesRatesSnapshot();
  }
  return getLiveRatesSnapshot();
}
