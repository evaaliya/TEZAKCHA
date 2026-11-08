import { NextResponse } from "next/server";
import { explorerTxUrl } from "@/lib/config";
import {
  enforceRateLimit,
  handleSolanaApiError,
  requireSolanaConfigured,
} from "@/lib/api/sendHelpers";
import { confirmAndVerifyTransfer } from "@/lib/solana/confirm";
import { getConnection } from "@/lib/solana/connection";
import { SolanaApiError } from "@/lib/solana/errors";
import { assertWalletTxMatches, cosignWithFeePayer } from "@/lib/solana/txVerify";
import {
  claimPreparedForSubmit,
  getTransfer,
  releaseSubmitLock,
  saveTransfer,
  type TransferRecord,
} from "@/lib/store/transfers";
import { publicTransfer } from "@/lib/transferPublic";
import bs58 from "bs58";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let prepareIdForLock: string | null = null;
  try {
    const limited = enforceRateLimit(request);
    if (limited) return limited;

    requireSolanaConfigured();

    const body = (await request.json()) as {
      prepare_id?: string;
      signed_tx_base64?: string;
    };

    if (!body.prepare_id || !body.signed_tx_base64) {
      return NextResponse.json(
        {
          error: "prepare_id and signed_tx_base64 are required",
          code: "invalid_request",
        },
        { status: 400 },
      );
    }

    const existing = getTransfer(body.prepare_id);
    if (!existing) {
      throw new SolanaApiError("prepare_not_found", 404);
    }

    if (existing.status === "submitted" || existing.status === "confirmed") {
      return NextResponse.json({
        transfer: publicTransfer(existing),
      });
    }

    if (existing.status === "expired") {
      throw new SolanaApiError("expired", 400);
    }

    if (existing.status !== "prepared") {
      throw new SolanaApiError("tx_mismatch", 400, "invalid_status");
    }

    if (new Date(existing.expiresAt).getTime() <= Date.now()) {
      const expired: TransferRecord = {
        ...existing,
        status: "expired",
        errorCode: "expired",
      };
      saveTransfer(expired);
      throw new SolanaApiError("expired", 400);
    }

    const claimed = claimPreparedForSubmit(body.prepare_id);
    if (!claimed) {
      const again = getTransfer(body.prepare_id);
      if (again && (again.status === "submitted" || again.status === "confirmed")) {
        return NextResponse.json({ transfer: publicTransfer(again) });
      }
      throw new SolanaApiError("tx_mismatch", 409, "submit_in_progress");
    }
    prepareIdForLock = body.prepare_id;

    const signed = assertWalletTxMatches(body.signed_tx_base64, {
      feePayer: claimed.feePayer,
      sender: claimed.senderPubkey,
      recipient: claimed.recipientPubkey,
      mint: claimed.mint,
      decimals: claimed.decimals,
      amountRaw: BigInt(claimed.amountUsdcRaw),
      createAta: claimed.createAta,
      memo: claimed.memo,
      blockhash: claimed.blockhash,
    });

    const cosigned = cosignWithFeePayer(signed);
    const connection = getConnection();
    const signature = await connection.sendRawTransaction(cosigned.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });

    const submitted: TransferRecord = {
      ...claimed,
      status: "submitted",
      submitting: false,
      signature,
      explorerUrl: explorerTxUrl(signature),
      txBase64: undefined,
    };
    saveTransfer(submitted);
    prepareIdForLock = null;

    // Confirm + verify recipient balance delta
    const confirmed = await confirmAndVerifyTransfer(submitted);

    return NextResponse.json({
      transfer: publicTransfer(confirmed),
      signature: confirmed.signature ?? signature,
      // Keep a raw sig string for e2e even if confirm path renames fields
      signature_b58: bs58.encode(
        cosigned.signatures[0] ?? new Uint8Array(64),
      ),
    });
  } catch (e) {
    if (prepareIdForLock) {
      releaseSubmitLock(prepareIdForLock);
    }
    return handleSolanaApiError(e);
  }
}
