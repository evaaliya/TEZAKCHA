export type SolanaErrorCode =
  | "insufficient_balance"
  | "fee_payer_low_balance"
  | "simulation_failed"
  | "rpc_unavailable"
  | "quote_changed"
  | "tx_mismatch"
  | "recipient_not_found"
  | "solana_not_configured"
  | "expired"
  | "embedded_not_configured"
  | "user_rejected"
  | "wallet_account_changed"
  | "rate_limited"
  | "prepare_not_found"
  | "invalid_amount"
  | "unknown_route"
  | "route_not_solana";

export class SolanaApiError extends Error {
  readonly code: SolanaErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: SolanaErrorCode,
    status: number,
    message?: string,
    details?: Record<string, unknown>,
  ) {
    super(message ?? code);
    this.name = "SolanaApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function jsonError(err: SolanaApiError) {
  return {
    error: err.message,
    code: err.code,
    ...(err.details ?? {}),
  };
}
