import Decimal from "decimal.js";
import type {
  FeeBreakdownItem,
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

function applyHop(
  amount: Decimal,
  hop: RouteSpec["hops"][number],
  rates: RatesSnapshot,
  fromCurrency: string,
  fees: FeeBreakdownItem[],
): Decimal {
  const fixedFee = new Decimal(hop.fixed_fee_from || "0");
  if (fixedFee.gt(0)) {
    fees.push({
      step: hop.step,
      kind: "fee",
      amount_in_from_ccy: fixedFee.toFixed(),
    });
  }

  let afterFee = amount.minus(fixedFee);
  if (afterFee.lt(0)) {
    afterFee = new Decimal(0);
  }

  if (hop.passthrough) {
    return afterFee;
  }

  const pair = hop.rate_pair;
  if (!pair || !(pair in rates.mid_rates)) {
    throw new Error(`Missing mid rate for pair ${pair}`);
  }

  const mid = new Decimal(rates.mid_rates[pair]);
  const spread = new Decimal(hop.spread || "0");
  const rateEff = mid.mul(new Decimal(1).minus(spread));

  if (spread.gt(0)) {
    const spreadCostInFrom = afterFee.mul(spread);
    fees.push({
      step: hop.step,
      kind: "spread",
      amount_in_from_ccy: spreadCostInFrom.toFixed(rates.currency_decimals[fromCurrency] ?? 2),
    });
  }

  return afterFee.mul(rateEff);
}

function quoteRoute(
  routeId: string,
  route: RouteSpec,
  input: QuoteInput,
): RouteQuote {
  const { amount_send, from, to, rates } = input;
  const fees: FeeBreakdownItem[] = [];
  let amount = amount_send;

  for (const hop of route.hops) {
    amount = applyHop(amount, hop, rates, from, fees);
  }

  const toDecimals = rates.currency_decimals[to] ?? 2;
  const amountReceive = roundDown(amount, toDecimals);

  const midPair = `${from}_${to}`;
  const midRate = new Decimal(rates.mid_rates[midPair]);
  const idealReceive = roundDown(amount_send.mul(midRate), toDecimals);

  let totalCostPct = new Decimal(0);
  if (idealReceive.gt(0)) {
    totalCostPct = idealReceive
      .minus(amountReceive)
      .div(idealReceive)
      .mul(100);
  }

  // Fiat legs are simulated in the demo; Solana transfer hop is real.
  const simulated = route.uses_solana
    ? route.hops.some((h) => h.simulated === true)
    : true;

  return {
    route_id: routeId,
    label_key: route.label_key,
    amount_receive: amountReceive,
    total_cost_pct: totalCostPct,
    fees_breakdown: fees,
    eta_minutes: route.eta_minutes,
    uses_solana: route.uses_solana,
    simulated,
  };
}

/** Deterministic remittance route comparison. Same input → same output. */
export function quoteRoutes(input: QuoteInput): RouteQuote[] {
  const routes = Object.entries(input.rates.routes).map(([id, spec]) =>
    quoteRoute(id, spec, input),
  );

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
  };
}

export type SerializedRoute = ReturnType<typeof serializeRoute>;
