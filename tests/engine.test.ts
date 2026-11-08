import Decimal from "decimal.js";
import { beforeAll, describe, expect, it } from "vitest";
import {
  finalizeRatesSnapshot,
  getRatesSnapshot,
  loadRatesFixtures,
  quoteRoutes,
  serializeRoute,
} from "@/lib/engine";
import type { RatesSnapshot } from "@/lib/engine/types";
import { __resetLiveRatesForTests } from "@/lib/rates/live";
import { POST as quotePost } from "@/app/api/quote/route";
import { POST as sendPost } from "@/app/api/send/route";
import { POST as preparePost } from "@/app/api/send/prepare/route";
import { resetConfigForTests } from "@/lib/config";

beforeAll(() => {
  process.env.RATES_SOURCE = "fixtures";
  __resetLiveRatesForTests();
});

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
            in_ccy: "RUB",
            out_ccy: "KGS",
            fixed_fee: "0",
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
            in_ccy: "RUB",
            out_ccy: "KGS",
            fixed_fee: "100",
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
            in_ccy: "RUB",
            out_ccy: "KGS",
            fixed_fee: "1",
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
    // Mid with a fractional tail so round-down is observable (not an exact .xx0).
    const rates = baseRates({
      mid_rates: {
        RUB_KGS: "1.08517",
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
              in_ccy: "RUB",
              out_ccy: "KGS",
              fixed_fee: "0",
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
    // 100 * 1.08517 = 108.517 → round down to 108.51
    expect(route.amount_receive.toFixed(2)).toBe("108.51");

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
              in_ccy: "RUB",
              out_ccy: "KGS",
              fixed_fee: "0",
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

  it("throws when a hop chain has a currency break", () => {
    const rates = baseRates({
      routes: {
        broken: {
          label_key: "routes.broken",
          eta_minutes: 10,
          uses_solana: false,
          hops: [
            {
              step: "a",
              in_ccy: "RUB",
              out_ccy: "USDC",
              fixed_fee: "0",
              spread: "0",
              rate_pair: "RUB_USDC",
            },
            {
              step: "b",
              in_ccy: "KGS",
              out_ccy: "KGS",
              fixed_fee: "0",
              passthrough: true,
            },
          ],
        },
      },
    });
    expect(() =>
      quoteRoutes({
        amount_send: new Decimal("1000"),
        from: "RUB",
        to: "KGS",
        rates,
      }),
    ).toThrow(/broken/);
  });

  it("clamps receive to 0 and cost to 100% when fixed fee exceeds amount", () => {
    const rates = baseRates({
      routes: {
        heavy: {
          label_key: "routes.heavy",
          eta_minutes: 10,
          uses_solana: false,
          hops: [
            {
              step: "fee",
              in_ccy: "RUB",
              out_ccy: "KGS",
              fixed_fee: "500",
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
    expect(route.amount_receive.toNumber()).toBe(0);
    expect(route.total_cost_pct.toNumber()).toBe(100);
    expect(route.amount_receive.isNegative()).toBe(false);
    expect(route.total_cost_pct.isNegative()).toBe(false);
  });

  it("reports off_ramp fees in hop currency and amount_in_from_ccy matches independent Decimal math", () => {
    const rubUsdc = new Decimal("0.01");
    const usdcKgs = new Decimal("100");
    const quoted = new Decimal("87.4");
    const amountSend = new Decimal("10000");
    const onRampFee = new Decimal("50");
    const onRampSpread = new Decimal("0.008");

    const rates = baseRates({
      mid_rates: {
        RUB_KGS: rubUsdc.mul(usdcKgs).toFixed(),
        RUB_USDC: rubUsdc.toFixed(),
        USDC_KGS: usdcKgs.toFixed(),
      },
      routes: {
        via_off: {
          label_key: "routes.solana",
          eta_minutes: 15,
          uses_solana: true,
          hops: [
            {
              step: "on_ramp",
              in_ccy: "RUB",
              out_ccy: "USDC",
              fixed_fee: onRampFee.toFixed(),
              spread: onRampSpread.toFixed(),
              rate_pair: "RUB_USDC",
              simulated: true,
            },
            {
              step: "off_ramp",
              in_ccy: "USDC",
              out_ccy: "KGS",
              fixed_fee: "0",
              quoted_rate: quoted.toFixed(),
              simulated: true,
            },
          ],
        },
      },
    });

    const [route] = quoteRoutes({
      amount_send: amountSend,
      from: "RUB",
      to: "KGS",
      rates,
    });

    const afterOnRampFee = amountSend.minus(onRampFee);
    const usdcOut = afterOnRampFee.mul(rubUsdc).mul(new Decimal(1).minus(onRampSpread));
    const spreadFrac = usdcKgs.minus(quoted).div(usdcKgs);
    const spreadUsdc = Decimal.max(0, spreadFrac).mul(usdcOut);
    const expectedFrom = spreadUsdc.div(rubUsdc).toFixed(2);

    const offSpread = route.fees_breakdown.find(
      (f) => f.step === "off_ramp" && f.kind === "spread",
    );
    expect(offSpread).toBeTruthy();
    expect(offSpread!.currency).toBe("USDC");
    expect(offSpread!.amount_in_from_ccy).toBe(expectedFrom);
  });

  it("gives cost 0 on zero-fee zero-spread RUB→USDC→KGS chain", () => {
    const rates = baseRates({
      mid_rates: {
        RUB_KGS: "1",
        RUB_USDC: "0.01",
        USDC_KGS: "100",
      },
      routes: {
        chain: {
          label_key: "routes.chain",
          eta_minutes: 10,
          uses_solana: true,
          hops: [
            {
              step: "on_ramp",
              in_ccy: "RUB",
              out_ccy: "USDC",
              fixed_fee: "0",
              spread: "0",
              rate_pair: "RUB_USDC",
              simulated: true,
            },
            {
              step: "off_ramp",
              in_ccy: "USDC",
              out_ccy: "KGS",
              fixed_fee: "0",
              spread: "0",
              rate_pair: "USDC_KGS",
              simulated: true,
            },
          ],
        },
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

  it("validates real fixtures across amounts: chains, non-negative cost, sort, hops_trace", () => {
    const rates = finalizeRatesSnapshot(loadRatesFixtures());
    for (const amount of ["100", "500", "1000", "10000", "100000"]) {
      const routes = quoteRoutes({
        amount_send: new Decimal(amount),
        from: "RUB",
        to: "KGS",
        rates,
      });
      expect(routes.length).toBeGreaterThan(0);
      for (let i = 0; i < routes.length; i++) {
        const r = routes[i];
        expect(r.total_cost_pct.gte(0)).toBe(true);
        expect(r.amount_receive.gte(0)).toBe(true);
        const last = r.hops_trace[r.hops_trace.length - 1];
        // hops_trace stores pre-round out; amount_receive is that value rounded down.
        const factor = new Decimal(10).pow(2);
        const rounded = last.amount_out
          .mul(factor)
          .toDecimalPlaces(0, Decimal.ROUND_DOWN)
          .div(factor);
        expect(rounded.toFixed(2)).toBe(r.amount_receive.toFixed(2));

        if (i > 0) {
          const prev = routes[i - 1];
          const cmp = prev.amount_receive.comparedTo(r.amount_receive);
          expect(cmp).toBeGreaterThanOrEqual(0);
          if (cmp === 0) {
            expect(prev.eta_minutes).toBeLessThanOrEqual(r.eta_minutes);
          }
        }
      }
    }
  });

  it("golden: 10000 RUB on solana__xbt_kg__odengi matches hand-computed receive", () => {
    const rates = finalizeRatesSnapshot(loadRatesFixtures());
    const amount = new Decimal("10000");

    // Manual (same fixtures): after on-ramp fee 50 → 9950 RUB
    // rate_eff = RUB_USDC * (1 - 0.008) = 0.0122254 * 0.992
    // USDC = 9950 * rate_eff
    // passthrough solana_transfer + deposit_to_exchange
    // KGS = USDC * quoted 87.4; payout fee 0; round down to 2dp
    const afterFee = amount.minus("50");
    const rateEff = new Decimal("0.0122254").mul(new Decimal("0.992"));
    const usdc = afterFee.mul(rateEff);
    const kgs = usdc.mul(new Decimal("87.4"));
    const expected = kgs
      .mul(100)
      .toDecimalPlaces(0, Decimal.ROUND_DOWN)
      .div(100);

    const route = quoteRoutes({
      amount_send: amount,
      from: "RUB",
      to: "KGS",
      rates,
    }).find((r) => r.route_id === "solana__xbt_kg__odengi");

    expect(route).toBeTruthy();
    expect(route!.amount_receive.toFixed(2)).toBe(expected.toFixed(2));
    expect(route!.verified).toBe(false);
    expect(route!.provider_id).toBe("xbt_kg");
    expect(route!.payout_id).toBe("odengi");
  });

  it("is deterministic: two calls with same input serialize identically", () => {
    const rates = finalizeRatesSnapshot(loadRatesFixtures());
    const input = {
      amount_send: new Decimal("7777.77"),
      from: "RUB" as const,
      to: "KGS" as const,
      rates,
    };
    const a = quoteRoutes(input).map(serializeRoute);
    const b = quoteRoutes(input).map(serializeRoute);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("tie-breaks equal amount_receive by lower eta_minutes", () => {
    const rates = baseRates({
      routes: {
        slow: {
          label_key: "routes.slow",
          eta_minutes: 100,
          uses_solana: false,
          hops: [
            {
              step: "a",
              in_ccy: "RUB",
              out_ccy: "KGS",
              fixed_fee: "0",
              spread: "0",
              rate_pair: "RUB_KGS",
            },
          ],
        },
        fast: {
          label_key: "routes.fast",
          eta_minutes: 10,
          uses_solana: false,
          hops: [
            {
              step: "b",
              in_ccy: "RUB",
              out_ccy: "KGS",
              fixed_fee: "0",
              spread: "0",
              rate_pair: "RUB_KGS",
            },
          ],
        },
      },
    });
    const routes = quoteRoutes({
      amount_send: new Decimal("1000"),
      from: "RUB",
      to: "KGS",
      rates,
    });
    expect(routes[0].route_id).toBe("fast");
    expect(routes[1].route_id).toBe("slow");
    expect(routes[0].amount_receive.eq(routes[1].amount_receive)).toBe(true);
  });
});

describe("route handlers", () => {
  it("/api/quote returns 400 for invalid amounts and wrong corridor", async () => {
    for (const amount_send of ["abc", "0", "-5"]) {
      const res = await quotePost(
        new Request("http://localhost/api/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount_send, from: "RUB", to: "KGS" }),
        }),
      );
      expect(res.status).toBe(400);
    }

    const wrongFrom = await quotePost(
      new Request("http://localhost/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_send: "1000", from: "USD", to: "KGS" }),
      }),
    );
    expect(wrongFrom.status).toBe(400);
  });

  it("/api/send and /api/send/prepare without keys return 503 solana_not_configured (no demo)", async () => {
    const prevFee = process.env.FEE_PAYER_SECRET_KEY;
    process.env.FEE_PAYER_SECRET_KEY = "";
    process.env.RATES_SOURCE = "fixtures";
    resetConfigForTests();

    try {
      const legacy = await sendPost(
        new Request("http://localhost/api/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
      );
      expect(legacy.status).toBe(503);
      const legacyBody = await legacy.json();
      expect(legacyBody.code).toBe("solana_not_configured");
      expect(JSON.stringify(legacyBody)).not.toMatch(/demo_/);

      const prepare = await preparePost(
        new Request("http://localhost/api/send/prepare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sender_pubkey: "11111111111111111111111111111111",
            recipient: "+996700000001",
            route_id: "solana__xbt_kg__odengi",
            amount_send: "1000",
            expected_amount_receive: "1",
            idempotency_key: "test-no-keys",
          }),
        }),
      );
      expect(prepare.status).toBe(503);
      const prepBody = await prepare.json();
      expect(prepBody.code).toBe("solana_not_configured");
    } finally {
      process.env.FEE_PAYER_SECRET_KEY = prevFee;
      resetConfigForTests();
    }
  });
});
