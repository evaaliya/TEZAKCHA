import Decimal from "decimal.js";
import type {
  Currency,
  FeeBreakdownItem,
  HopSpec,
  HopTrace,
  QuoteInput,
  RatesSnapshot,
  RouteQuote,
  RouteSpec,
} from "./types";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_DOWN });

function roundDown(amount: Decimal, decimals: number): Decimal {
  const factor = new Decimal(10).pow(decimals);
  return amount.mul(factor).toDecimalPlaces(0, Decimal.ROUND_DOWN).div(factor);
}

/** Mid as units of `to` per 1 `from`, via direct, inverse, or USDC bridge. */
export function midRate(
  fromCcy: string,
  toCcy: string,
  midRates: Record<string, string>,
): Decimal | null {
  if (fromCcy === toCcy) return new Decimal(1);

  const direct = `${fromCcy}_${toCcy}`;
  if (direct in midRates) return new Decimal(midRates[direct]);

  const inverse = `${toCcy}_${fromCcy}`;
  if (inverse in midRates) {
    return new Decimal(1).div(new Decimal(midRates[inverse]));
  }

  if (fromCcy !== "USDC" && toCcy !== "USDC") {
    const a = midRate(fromCcy, "USDC", midRates);
    const b = midRate("USDC", toCcy, midRates);
    if (a && b) return a.mul(b);
  }

  return null;
}

/** Convert an amount denominated in `currency` into the quote `from` currency. */
export function convertToFromCcy(
  amount: Decimal,
  currency: string,
  from: string,
  midRates: Record<string, string>,
): Decimal {
  if (amount.isZero()) return amount;
  const rate = midRate(currency, from, midRates);
  if (!rate) {
    throw new Error(`Cannot convert ${currency} to ${from} via mid_rates`);
  }
  return amount.mul(rate);
}

export function validateHopChain(
  routeId: string,
  hops: HopSpec[],
  from: string,
  to: string,
): void {
  if (hops.length === 0) {
    throw new Error(`Route ${routeId}: empty hop chain`);
  }
  if (hops[0].in_ccy !== from) {
    throw new Error(
      `Route ${routeId}: first hop in_ccy ${hops[0].in_ccy} != from ${from}`,
    );
  }
  if (hops[hops.length - 1].out_ccy !== to) {
    throw new Error(
      `Route ${routeId}: last hop out_ccy ${hops[hops.length - 1].out_ccy} != to ${to}`,
    );
  }
  for (let i = 0; i < hops.length; i++) {
    const hop = hops[i];
    if (hop.passthrough && hop.in_ccy !== hop.out_ccy) {
      throw new Error(
        `Route ${routeId}: passthrough hop ${hop.step} requires in_ccy == out_ccy`,
      );
    }
    if (i + 1 < hops.length && hop.out_ccy !== hops[i + 1].in_ccy) {
      throw new Error(
        `Route ${routeId}: currency break at ${hop.step} → ${hops[i + 1].step} (${hop.out_ccy} != ${hops[i + 1].in_ccy})`,
      );
    }
  }
}

function pushFee(
  fees: FeeBreakdownItem[],
  step: string,
  kind: FeeBreakdownItem["kind"],
  amount: Decimal,
  currency: Currency,
  from: string,
  rates: RatesSnapshot,
): void {
  if (amount.lte(0)) return;
  const fromDecimals = rates.currency_decimals[from] ?? 2;
  const amountInFrom = convertToFromCcy(amount, currency, from, rates.mid_rates);
  fees.push({
    step,
    kind,
    amount: amount.toFixed(),
    currency,
    amount_in_from_ccy: amountInFrom.toFixed(fromDecimals),
  });
}

function applyHop(
  amountIn: Decimal,
  hop: HopSpec,
  rates: RatesSnapshot,
  fromCurrency: string,
  fees: FeeBreakdownItem[],
): Decimal {
  const fixedFee = new Decimal(hop.fixed_fee || "0");
  if (fixedFee.gt(0)) {
    pushFee(
      fees,
      hop.step,
      "fee",
      fixedFee,
      hop.in_ccy,
      fromCurrency,
      rates,
    );
  }

  let afterFee = amountIn.minus(fixedFee);
  if (afterFee.lt(0)) {
    afterFee = new Decimal(0);
  }

  if (hop.passthrough) {
    return afterFee;
  }

  if (hop.quoted_rate !== undefined && hop.quoted_rate !== null) {
    const quoted = new Decimal(hop.quoted_rate);
    const pair = `${hop.in_ccy}_${hop.out_ccy}`;
    const mid = new Decimal(rates.mid_rates[pair] ?? "0");
    if (mid.gt(0)) {
      const spreadFrac = Decimal.max(
        0,
        mid.minus(quoted).div(mid),
      );
      const spreadCost = spreadFrac.mul(afterFee);
      pushFee(
        fees,
        hop.step,
        "spread",
        spreadCost,
        hop.in_ccy,
        fromCurrency,
        rates,
      );
    }
    return afterFee.mul(quoted);
  }

  const pair = hop.rate_pair;
  if (!pair || !(pair in rates.mid_rates)) {
    throw new Error(`Missing mid rate for pair ${pair}`);
  }

  const mid = new Decimal(rates.mid_rates[pair]);
  const spread = new Decimal(hop.spread || "0");
  const rateEff = mid.mul(new Decimal(1).minus(spread));

  if (spread.gt(0)) {
    const spreadCost = afterFee.mul(spread);
    pushFee(
      fees,
      hop.step,
      "spread",
      spreadCost,
      hop.in_ccy,
      fromCurrency,
      rates,
    );
  }

  return afterFee.mul(rateEff);
}

/** Ensure every mid pair also has its inverse key (applyHop looks up keys directly). */
export function withInverseMids(rates: RatesSnapshot): RatesSnapshot {
  const mid_rates = { ...rates.mid_rates };
  for (const [pair, value] of Object.entries(rates.mid_rates)) {
    const parts = pair.split("_");
    if (parts.length !== 2) continue;
    const inv = `${parts[1]}_${parts[0]}`;
    if (!(inv in mid_rates)) {
      const n = new Decimal(value);
      if (!n.isZero()) mid_rates[inv] = new Decimal(1).div(n).toFixed();
    }
  }
  return { ...rates, mid_rates };
}

/** Static fixtures routes + one Solana route per (off_ramp × payout). */
export function expandRouteEntries(
  rates: RatesSnapshot,
): Array<[string, RouteSpec]> {
  const entries: Array<[string, RouteSpec]> = Object.entries(rates.routes);

  const base = rates.solana_base_hops ?? [];
  const etaBase = rates.solana_eta_minutes_base ?? 0;

  for (const provider of rates.off_ramps ?? []) {
    for (const payout of provider.payouts) {
      const hops: HopSpec[] = [
        ...base,
        {
          step: "off_ramp",
          in_ccy: "USDC",
          out_ccy: "KGS",
          fixed_fee: "0",
          quoted_rate: provider.quoted_rate_kgs_per_usdc,
          simulated: true,
          verified: provider.rate_verified,
        },
        {
          step: "payout_fee",
          in_ccy: "KGS",
          out_ccy: "KGS",
          fixed_fee: payout.fixed_fee_kgs,
          passthrough: true,
          simulated: true,
          verified: payout.fee_verified,
        },
      ];
      const routeId = `solana__${provider.id}__${payout.id}`;
      entries.push([
        routeId,
        {
          label_key: "routes.solana",
          eta_minutes: etaBase + payout.eta_minutes,
          uses_solana: true,
          hops,
          provider_id: provider.id,
          payout_id: payout.id,
        },
      ]);
    }
  }

  return entries;
}

/**
 * Expand routes for the requested direction. Base fixtures are RUB→KGS.
 * Reverse KGS→RUB builds proper hops (naive hop reverse broke Express pricing).
 */
export function expandRouteEntriesForCorridor(
  rates: RatesSnapshot,
  from: Currency,
  to: Currency,
): Array<[string, RouteSpec]> {
  const baseFrom = rates.corridor.from as Currency;
  const baseTo = rates.corridor.to as Currency;
  const forward = from === baseFrom && to === baseTo;
  const reverse = from === baseTo && to === baseFrom;
  if (!forward && !reverse) {
    throw new Error(
      `Unsupported corridor ${from}→${to}; supported ${baseFrom}↔${baseTo}`,
    );
  }

  if (forward) return expandRouteEntries(rates);
  return expandReverseRouteEntries(rates);
}

/** KGS→RUB comparison + Express with sane mids (not mirrored RUB fees). */
function expandReverseRouteEntries(
  rates: RatesSnapshot,
): Array<[string, RouteSpec]> {
  const mid = rates.mid_rates;
  const rubKgs = new Decimal(mid.RUB_KGS ?? "1");
  const entries: Array<[string, RouteSpec]> = [];

  for (const [id, spec] of Object.entries(rates.routes)) {
    const hops = spec.hops.map((hop) => {
      if (hop.passthrough) {
        return {
          ...hop,
          in_ccy: hop.in_ccy === "RUB" ? ("KGS" as Currency) : hop.in_ccy,
          out_ccy: hop.out_ccy === "RUB" ? ("KGS" as Currency) : hop.out_ccy,
        };
      }
      const feeRub = new Decimal(hop.fixed_fee || "0");
      const feeKgs = feeRub.mul(rubKgs).toFixed(2);
      return {
        ...hop,
        in_ccy: "KGS" as Currency,
        out_ccy: "RUB" as Currency,
        fixed_fee: feeKgs,
        rate_pair: "KGS_RUB",
      };
    });
    entries.push([id, { ...spec, hops }]);
  }

  const etaBase = rates.solana_eta_minutes_base ?? 0;
  for (const provider of rates.off_ramps ?? []) {
    for (const payout of provider.payouts) {
      const hops: HopSpec[] = [
        {
          step: "on_ramp",
          in_ccy: "KGS",
          out_ccy: "USDC",
          fixed_fee: "0",
          spread: "0.008",
          rate_pair: "KGS_USDC",
          simulated: true,
          verified: false,
        },
        {
          step: "solana_transfer",
          in_ccy: "USDC",
          out_ccy: "USDC",
          fixed_fee: "0",
          passthrough: true,
          simulated: false,
        },
        {
          step: "off_ramp",
          in_ccy: "USDC",
          out_ccy: "RUB",
          fixed_fee: "0",
          spread: "0.008",
          rate_pair: "USDC_RUB",
          simulated: true,
          verified: false,
        },
      ];
      entries.push([
        `solana__${provider.id}__${payout.id}`,
        {
          label_key: "routes.solana",
          eta_minutes: etaBase + payout.eta_minutes,
          uses_solana: true,
          hops,
          provider_id: provider.id,
          payout_id: payout.id,
        },
      ]);
    }
  }

  return entries;
}

function quoteRoute(
  routeId: string,
  route: RouteSpec,
  input: QuoteInput,
): RouteQuote {
  const { amount_send, from, to, rates } = input;
  validateHopChain(routeId, route.hops, from, to);

  const fees: FeeBreakdownItem[] = [];
  const hops_trace: HopTrace[] = [];
  let amount = amount_send;

  for (const hop of route.hops) {
    const amount_in = amount;
    const amount_out = applyHop(amount_in, hop, rates, from, fees);
    hops_trace.push({
      step: hop.step,
      in_ccy: hop.in_ccy,
      out_ccy: hop.out_ccy,
      amount_in,
      amount_out,
    });
    amount = amount_out;
  }

  const toDecimals = rates.currency_decimals[to] ?? 2;
  // amount is pre-round last hop out; amount_receive is that value rounded down.
  const amountReceive = roundDown(amount, toDecimals);

  const midPair = `${from}_${to}`;
  if (!(midPair in rates.mid_rates)) {
    throw new Error(`Missing mid rate for corridor ${midPair}`);
  }
  const midRateValue = new Decimal(rates.mid_rates[midPair]);
  const idealReceive = roundDown(amount_send.mul(midRateValue), toDecimals);

  let totalCostPct = new Decimal(0);
  if (idealReceive.gt(0)) {
    totalCostPct = idealReceive
      .minus(amountReceive)
      .div(idealReceive)
      .mul(100);
    if (totalCostPct.lt(0)) totalCostPct = new Decimal(0);
  } else if (amountReceive.lte(0) && amount_send.gt(0)) {
    totalCostPct = new Decimal(100);
  }

  // Express settles on-chain; fiat legs are estimates for price comparison only.
  // Bank/legacy routes are fully synthetic in this demo.
  const simulated = !route.uses_solana;

  const verified = !route.hops.some((h) => h.verified === false);

  return {
    route_id: routeId,
    label_key: route.label_key,
    amount_receive: amountReceive,
    total_cost_pct: totalCostPct,
    fees_breakdown: fees,
    eta_minutes: route.eta_minutes,
    uses_solana: route.uses_solana,
    simulated,
    hops_trace,
    verified,
    provider_id: route.provider_id,
    payout_id: route.payout_id,
  };
}

/** Deterministic remittance route comparison. Same input → same output. */
export function quoteRoutes(input: QuoteInput): RouteQuote[] {
  const rates = withInverseMids(input.rates);
  const oriented: QuoteInput = { ...input, rates };
  const routes = expandRouteEntriesForCorridor(
    rates,
    input.from,
    input.to,
  ).map(([id, spec]) => quoteRoute(id, spec, oriented));

  return routes.sort((a, b) => {
    const recv = b.amount_receive.comparedTo(a.amount_receive);
    if (recv !== 0) return recv;
    return a.eta_minutes - b.eta_minutes;
  });
}

export function serializeRoute(route: RouteQuote) {
  return {
    ...route,
    amount_receive: route.amount_receive.toFixed(),
    total_cost_pct: route.total_cost_pct.toFixed(4),
    hops_trace: route.hops_trace.map((h) => ({
      ...h,
      amount_in: h.amount_in.toFixed(),
      amount_out: h.amount_out.toFixed(),
    })),
  };
}

export type SerializedRoute = ReturnType<typeof serializeRoute>;

/**
 * USDC amount for the on-chain SPL transfer, taken from hops_trace
 * (solana_transfer hop amount_in). Round down to 6 decimals.
 */
export function usdcAmountForSolanaTransfer(route: RouteQuote): Decimal {
  const hop = route.hops_trace.find((h) => h.step === "solana_transfer");
  if (!hop) {
    throw new Error(`Route ${route.route_id}: missing solana_transfer hop`);
  }
  if (hop.in_ccy !== "USDC") {
    throw new Error(
      `Route ${route.route_id}: solana_transfer in_ccy must be USDC`,
    );
  }
  return hop.amount_in.toDecimalPlaces(6, Decimal.ROUND_DOWN);
}
