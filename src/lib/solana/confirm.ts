import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey, type ParsedTransactionWithMeta } from "@solana/web3.js";
import { explorerTxUrl } from "@/lib/config";
import type { TransferRecord } from "@/lib/store/transfers";
import { getTransfer, saveTransfer } from "@/lib/store/transfers";
import { SolanaApiError } from "./errors";
import { withRpc } from "./connection";

function tokenDeltaForOwner(
  tx: ParsedTransactionWithMeta,
  owner: string,
  mint: string,
): bigint | null {
  const meta = tx.meta;
  if (!meta) return null;

  const pre = meta.preTokenBalances ?? [];
  const post = meta.postTokenBalances ?? [];

  const preBal = pre.find((b) => b.owner === owner && b.mint === mint);
  const postBal = post.find((b) => b.owner === owner && b.mint === mint);

  const preAmt = BigInt(preBal?.uiTokenAmount.amount ?? "0");
  const postAmt = BigInt(postBal?.uiTokenAmount.amount ?? "0");
  return postAmt - preAmt;
}

/**
 * Confirm on-chain and verify recipient USDC delta equals the prepared amount.
 * Sets status confirmed | failed | expired.
 */
export async function confirmAndVerifyTransfer(
  record: TransferRecord,
): Promise<TransferRecord> {
  if (!record.signature) {
    throw new SolanaApiError("tx_mismatch", 400, "missing_signature");
  }

  const signature = record.signature;

  try {
    await withRpc(async (connection) => {
      const confirmation = await connection.confirmTransaction(
        {
          signature,
          blockhash: record.blockhash,
          lastValidBlockHeight: record.lastValidBlockHeight,
        },
        "confirmed",
      );

      if (confirmation.value.err) {
        const failed: TransferRecord = {
          ...record,
          status: "failed",
          submitting: false,
          errorCode: "tx_failed",
          error: "transaction_err",
        };
        saveTransfer(failed);
        throw new SolanaApiError("simulation_failed", 502, "transaction_err");
      }

      const parsed = await connection.getParsedTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });

      if (!parsed || parsed.meta?.err) {
        const failed: TransferRecord = {
          ...record,
          status: "failed",
          submitting: false,
          errorCode: "tx_failed",
        };
        saveTransfer(failed);
        throw new SolanaApiError("simulation_failed", 502);
      }

      const delta = tokenDeltaForOwner(
        parsed,
        record.recipientPubkey,
        record.mint,
      );
      const expected = BigInt(record.amountUsdcRaw);
      if (delta === null || delta !== expected) {
        const failed: TransferRecord = {
          ...record,
          status: "failed",
          submitting: false,
          errorCode: "balance_mismatch",
          error: "recipient_balance_mismatch",
        };
        saveTransfer(failed);
        throw new SolanaApiError("tx_mismatch", 502, "balance_mismatch");
      }
    });
  } catch (e) {
    if (e instanceof SolanaApiError && e.code === "rpc_unavailable") {
      // Leave as submitted — GET will retry.
      return record;
    }
    // Blockhash expired without landing?
    if (
      e instanceof Error &&
      /block height exceeded|expired/i.test(e.message)
    ) {
      const expired: TransferRecord = {
        ...record,
        status: "expired",
        submitting: false,
        errorCode: "expired",
      };
      saveTransfer(expired);
      return expired;
    }
    if (e instanceof SolanaApiError) {
      const current = record;
      // already saved failed in branches above when applicable
      return getUpdatedOr(current);
    }
    throw e;
  }

  const confirmed: TransferRecord = {
    ...record,
    status: "confirmed",
    submitting: false,
    explorerUrl: explorerTxUrl(signature),
  };
  saveTransfer(confirmed);
  return confirmed;
}

function getUpdatedOr(fallback: TransferRecord): TransferRecord {
  return getTransfer(fallback.id) ?? fallback;
}

/** Refresh a submitted transfer against RPC (for GET). */
export async function refreshSubmittedTransfer(
  record: TransferRecord,
): Promise<TransferRecord> {
  if (record.status !== "submitted" || !record.signature) return record;

  return withRpc(async (connection) => {
    const statuses = await connection.getSignatureStatuses([record.signature!]);
    const st = statuses.value[0];

    if (!st) {
      const height = await connection.getBlockHeight("confirmed");
      if (height > record.lastValidBlockHeight) {
        const expired: TransferRecord = {
          ...record,
          status: "expired",
          errorCode: "expired",
        };
        saveTransfer(expired);
        return expired;
      }
      return record;
    }

    if (st.err) {
      const failed: TransferRecord = {
        ...record,
        status: "failed",
        errorCode: "tx_failed",
      };
      saveTransfer(failed);
      return failed;
    }

    if (
      st.confirmationStatus === "confirmed" ||
      st.confirmationStatus === "finalized"
    ) {
      return confirmAndVerifyTransfer(record);
    }

    return record;
  });
}

/** Before re-prepare: if prior signature may have landed, return it. */
export async function findPriorSignatureStatus(
  signature: string | undefined,
): Promise<"landed" | "absent" | "unknown"> {
  if (!signature) return "absent";
  try {
    return await withRpc(async (connection) => {
      const statuses = await connection.getSignatureStatuses([signature]);
      const st = statuses.value[0];
      if (!st) return "absent";
      if (st.err) return "absent";
      if (
        st.confirmationStatus === "processed" ||
        st.confirmationStatus === "confirmed" ||
        st.confirmationStatus === "finalized"
      ) {
        return "landed";
      }
      return "unknown";
    });
  } catch {
    return "unknown";
  }
}

export async function getRecipientUsdcBalance(
  recipientPubkey: string,
  mintStr: string,
): Promise<string> {
  return withRpc(async (connection) => {
    const mint = new PublicKey(mintStr);
    const owner = new PublicKey(recipientPubkey);
    const ata = getAssociatedTokenAddressSync(mint, owner);
    try {
      const bal = await connection.getTokenAccountBalance(ata);
      return bal.value.uiAmountString ?? bal.value.amount;
    } catch {
      return "0";
    }
  });
}
