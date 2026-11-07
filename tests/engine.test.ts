import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { quoteRoutes } from "@/lib/engine/quote";
import type { RatesSnapshot } from "@/lib/engine/types";

function baseRates(overrides?: Partial<RatesSnapshot>): RatesSnapshot {
  return {
    source: "simulated",
    snapshot_date: "2026-11-07",
    corridor: { from: "RUB", to: "KGS" },
    mid_rates: {
      RUB_KGS: "1.0",
      RUB_USDC: "0.01",
      USDC_KGS: "100",
    },
    routes: {
      zero_fee: {
        label_key: "routes.zero",
        eta_minutes: 10,
        uses_solana: false,
        hops: [
          {
            step: "direct",
            fixed_fee_from: "0",
            spread: "0",
            rate_pair: "RUB_KGS",
          },
        ],
      },
      fixed_fee: {
        label_key: "routes.fixed",
        eta_minutes: 20,
        uses_solana: false,
        hops: [
          {
            step: "fee",
            fixed_fee_from: "100",
            spread: "0",
            rate_pair: "RUB_KGS",
          },
        ],
      },
      better: {
        label_key: "routes.better",
        eta_minutes: 30,
        uses_solana: true,
        hops: [
          {
            step: "cheap",
            fixed_fee_from: "1",
            spread: "0",
            rate_pair: "RUB_KGS",
            simulated: true,
          },
        ],
      },
    },
    currency_decimals: { RUB: 2, KGS: 2, USDC: 6 },
    ...overrides,
  };
}

describe("quoteRoutes", () => {
  it("returns total_cost_pct = 0 when fees and spreads are zero", () => {
    const rates = baseRates({
      routes: {
        zero_fee: baseRates().routes.zero_fee,
      },
    });
    const [route] = quoteRoutes({
      amount_send: new Decimal("1000"),
      from: "RUB",
      to: "KGS",
      rates,
    });
    expect(route.total_cost_pct.toNumber()).toBe(0);
    expect(route.amount_receive.toFixed(2)).toBe("1000.00");
  });

  it("is monotonic in send amount for the same route", () => {
    const rates = baseRates();
    const small = quoteRoutes({
      amount_send: new Decimal("500"),
      from: "RUB",
      to: "KGS",
      rates,
    }).find((r) => r.route_id === "fixed_fee")!;
    const large = quoteRoutes({
      amount_send: new Decimal("5000"),
      from: "RUB",
      to: "KGS",
      rates,
    }).find((r) => r.route_id === "fixed_fee")!;
    expect(large.amount_receive.gt(small.amount_receive)).toBe(true);
  });

  it("lets fixed fee dominate on small amounts", () => {
    const rates = baseRates({
      routes: {
        fixed_fee: baseRates().routes.fixed_fee,
        better: baseRates().routes.better,
      },
    });
    const tiny = quoteRoutes({
      amount_send: new Decimal("105"),
      from: "RUB",
      to: "KGS",
      rates,
    });
    const fixed = tiny.find((r) => r.route_id === "fixed_fee")!;
    const better = tiny.find((r) => r.route_id === "better")!;
    expect(better.amount_receive.gt(fixed.amount_receive)).toBe(true);
    expect(fixed.total_cost_pct.gt(better.total_cost_pct)).toBe(true);
  });

  it("sorts best route by max amount_receive", () => {
    const rates = baseRates();
    const routes = quoteRoutes({
      amount_send: new Decimal("1000"),
      from: "RUB",
      to: "KGS",
      rates,
    });
    expect(routes[0].route_id).toBe("zero_fee");
    for (let i = 1; i < routes.length; i++) {
      expect(routes[i - 1].amount_receive.gte(routes[i].amount_receive)).toBe(
        true,
      );
    }
  });

  it("rounds recipient amount down to minor units", () => {
    const rates = baseRates({
      mid_rates: {
        RUB_KGS: "1.085",
        RUB_USDC: "0.01",
        USDC_KGS: "100",
      },
      routes: {
        dusty: {
          label_key: "routes.dusty",
          eta_minutes: 5,
          uses_solana: false,
          hops: [
            {
              step: "x",
              fixed_fee_from: "0",
              spread: "0",
              rate_pair: "RUB_KGS",
            },
          ],
        },
      },
    });
    const [route] = quoteRoutes({
      amount_send: new Decimal("100"),
      from: "RUB",
      to: "KGS",
      rates,
    });
    // 100 * 1.085 = 108.5 → still exact; use awkward mid
    expect(route.amount_receive.toFixed(2)).toBe("108.50");

    const rates2 = baseRates({
      mid_rates: { RUB_KGS: "1.333333", RUB_USDC: "0.01", USDC_KGS: "100" },
      routes: {
        dusty: {
          label_key: "routes.dusty",
          eta_minutes: 5,
          uses_solana: false,
          hops: [
            {
              step: "x",
              fixed_fee_from: "0",
              spread: "0",
              rate_pair: "RUB_KGS",
            },
          ],
        },
      },
    });
    const [dusty] = quoteRoutes({
      amount_send: new Decimal("10"),
      from: "RUB",
      to: "KGS",
      rates: rates2,
    });
    // 10 * 1.333333 = 13.33333 → round down to 13.33
    expect(dusty.amount_receive.toFixed(2)).toBe("13.33");
  });
});
