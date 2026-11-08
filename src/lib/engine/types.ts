import type Decimal from "decimal.js";

export type Currency = "RUB" | "KGS" | "USDC";

export type FeeKind = "fee" | "spread";

export interface FeeBreakdownItem {
  step: string;
  kind: FeeKind;
  /** Fee/spread amount in `currency` (the hop's in_ccy). */
  amount: string;
  currency: Currency;
  /** Same economic amount converted to the quote `from` currency via mid rates. */
  amount_in_from_ccy: string;
}

export interface HopTrace {
  step: string;
  in_ccy: Currency;
  out_ccy: Currency;
  amount_in: Decimal;
  amount_out: Decimal;
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
  hops_trace: HopTrace[];
  /** False if any hop has verified === false. */
  verified: boolean;
  provider_id?: string;
  payout_id?: string;
}

export interface HopSpec {
  step: string;
  in_ccy: Currency;
  out_ccy: Currency;
  /** Fixed fee in the hop's in_ccy. */
  fixed_fee: string;
  /** Used with rate_pair: effective rate = mid * (1 - spread). */
  spread?: string;
  rate_pair?: string;
  /** Absolute rate: out_ccy units per 1 in_ccy (string Decimal). */
  quoted_rate?: string;
  passthrough?: boolean;
  simulated?: boolean;
  verified?: boolean;
}

export interface RouteSpec {
  label_key: string;
  eta_minutes: number;
  uses_solana: boolean;
  hops: HopSpec[];
  provider_id?: string;
  payout_id?: string;
}

export interface OffRampPayout {
  id: string;
  label_key: string;
  fixed_fee_kgs: string;
  fee_verified: boolean;
  eta_minutes: number;
}

export interface OffRampProvider {
  id: string;
  label_key: string;
  quoted_rate_kgs_per_usdc: string;
  rate_source: string;
  rate_verified: boolean;
  payouts: OffRampPayout[];
}

export interface ReferenceRate {
  id: string;
  institution_key: string;
  pair: string;
  value: string;
  /** ISO date YYYY-MM-DD; omit until verified — UI hides the date when absent. */
  as_of?: string;
}

export type RatesSourceKind = "live" | "live_stale" | "snapshot";

export interface RatesSnapshot {
  source: string;
  snapshot_date: string;
  corridor: { from: string; to: string };
  mid_rates: Record<string, string>;
  mid_sources?: Record<string, string>;
  reference_rates?: ReferenceRate[];
  routes: Record<string, RouteSpec>;
  solana_base_hops?: HopSpec[];
  solana_eta_minutes_base?: number;
  off_ramps?: OffRampProvider[];
  currency_decimals: Record<string, number>;
  /** Set by getRatesSnapshot — live / stale / fixtures. */
  rates_source?: RatesSourceKind;
  /** Hash pinning mids + off_ramps + fetch moment for /api/send. */
  rates_version?: string;
  /** ISO timestamp of the rate pack used for the quote. */
  rates_updated_at?: string;
}
