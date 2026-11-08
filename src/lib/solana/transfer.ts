/**
 * Solana transfer surface.
 * Custodial SENDER_SECRET_KEY send path removed — use prepare/submit + embedded wallet.
 */
export {
  buildUsdcTransferTx,
  simulateBuiltTx,
  assertSenderUsdcBalance,
  assertFeePayerSol,
  assertSenderSol,
  MEMO_PROGRAM_ID,
} from "./txBuild";
export type { BuildTransferParams, BuiltTransfer } from "./txBuild";
export { assertWalletTxMatches, cosignWithFeePayer } from "./txVerify";
export {
  confirmAndVerifyTransfer,
  refreshSubmittedTransfer,
  getRecipientUsdcBalance,
} from "./confirm";
export { resolveRecipientPubkey } from "./recipients";

import { loadConfig } from "@/lib/config";
import { getConnection } from "./connection";

/** True when fee payer + mint + RPC are configured for real sends. */
export async function isSolanaConfigured(): Promise<{
  ok: boolean;
  reason?: string;
}> {
  const cfg = loadConfig();
  if (!cfg.solanaConfigured) {
    return { ok: false, reason: "keys_missing" };
  }
  try {
    await getConnection().getLatestBlockhash();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "rpc_error" };
  }
}
