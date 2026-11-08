import fs from "node:fs";
import path from "node:path";
import Decimal from "decimal.js";
import type { RatesSnapshot } from "./types";
import { expandRouteEntries, validateHopChain } from "./quote";

/**
 * Load fixtures as written on disk (no derived mid).
 * Prefer getRatesSnapshot() for quoting — it adds corridor mid RUB_KGS.
 */
export function loadRatesFixtures(): RatesSnapshot {
  const filePath = path.join(process.cwd(), "config", "rates.fixtures.json");
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as RatesSnapshot;
}

/**
 * Derive corridor mid from the two Solana-chain legs and validate hop chains.
 *
 * Why derive RUB_KGS = RUB_USDC × USDC_KGS:
 * the ideal (mid-market) benchmark must use the same two official mids as the
 * on-ramp / off-ramp hops. A separately maintained RUB_KGS fixture can drift
 * from those legs and make total_cost_pct inconsistent with the chain.
 */
export function finalizeRatesSnapshot(raw: RatesSnapshot): RatesSnapshot {
  const rubUsdc = new Decimal(raw.mid_rates.RUB_USDC);
  const usdcKgs = new Decimal(raw.mid_rates.USDC_KGS);
  const mid_rates = {
    ...raw.mid_rates,
    // Product of the same two mids the Solana route hops use — keeps ideal
    // receive and chain valuation on one consistent mid surface.
    RUB_KGS: rubUsdc.mul(usdcKgs).toFixed(),
  };

  const rates: RatesSnapshot = { ...raw, mid_rates };

  for (const [routeId, spec] of expandRouteEntries(rates)) {
    validateHopChain(
      routeId,
      spec.hops,
      rates.corridor.from,
      rates.corridor.to,
    );
  }

  return rates;
}
