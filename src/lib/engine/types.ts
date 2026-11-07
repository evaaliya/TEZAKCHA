import type Decimal from "decimal.js";

export type Currency = "RUB" | "KGS" | "USDC";

export type FeeKind = "fee" | "spread";

export interface FeeBreakdownItem {
  step: string;
  kind: FeeKind;
  amount_in_from_ccy: string;
}

export interface QuoteInput {
  amount_send: Decimal;
  from: Currency;
  to: Currency;
  rates: RatesSnapshot;
}

export interface RouteQuote {
  route_id: string;
  label_key: string;
  amount_receive: Decimal;
  total_cost_pct: Decimal;
  fees_breakdown: FeeBreakdownItem[];
  eta_minutes: number;
  uses_solana: boolean;
  simulated: boolean;
}

export interface HopSpec {
  step: string;
  fixed_fee_from: string;
  spread: string;
  rate_pair?: string;
  passthrough?: boolean;
  simulated?: boolean;
}

export interface RouteSpec {
  label_key: string;
  eta_minutes: number;
  uses_solana: boolean;
  hops: HopSpec[];
}

export interface RatesSnapshot {
  source: string;
  snapshot_date: string;
  corridor: { from: string; to: string };
  mid_rates: Record<string, string>;
  routes: Record<string, RouteSpec>;
  currency_decimals: Record<string, number>;
}
