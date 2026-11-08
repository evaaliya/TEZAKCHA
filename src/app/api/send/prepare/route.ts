import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import {
  enforceRateLimit,
  handleSolanaApiError,
  quoteSolanaRoute,
  requireSolanaConfigured,
} from "@/lib/api/sendHelpers";
import { findPriorSignatureStatus } from "@/lib/solana/confirm";
import { SolanaApiError } from "@/lib/solana/errors";
import { resolveRecipientPubkey } from "@/lib/solana/recipients";
import {
  assertFeePayerSol,
  assertSenderSol,
  assertSenderUsdcBalance,
  buildUsdcTransferTx,
  simulateBuiltTx,
} from "@/lib/solana/transfer";
import {
  getTransferByIdempotency,
  newTransferId,
  saveTransfer,
  type TransferRecord,
} from "@/lib/store/transfers";
import { validateAmountSend, validatePhone } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const limited = enforceRateLimit(request);
    if (limited) return limited;

    requireSolanaConfigured();

    const body = (await request.json()) as {
      sender_pubkey?: string;
      recipient?: string;
      route_id?: string;
      amount_send?: string;
      expected_amount_receive?: string;
      idempotency_key?: string;
      recipient_name?: string;
      from?: "RUB" | "KGS";
      to?: "RUB" | "KGS";
    };

    if (
      !body.sender_pubkey ||
      !body.recipient ||
      !body.route_id ||
      !body.amount_send ||
      !body.idempotency_key
    ) {
      return NextResponse.json(
        {
          error:
            "sender_pubkey, recipient, route_id, amount_send, and idempotency_key are required",
          code: "invalid_request",
        },
        { status: 400 },
      );
    }

    const existing = getTransferByIdempotency(body.idempotency_key);
    if (existing) {
      if (
        existing.status === "prepared" &&
        new Date(existing.expiresAt).getTime() > Date.now()
      ) {
        return NextResponse.json({
          prepare_id: existing.prepareId,
          tx_base64: existing.txBase64,
          blockhash: existing.blockhash,
          last_valid_block_height: existing.lastValidBlockHeight,
          expires_at: existing.expiresAt,
          amount_receive: existing.amountReceive,
          amount_usdc: existing.amountUsdc,
        });
      }
      if (existing.status === "submitted" || existing.status === "confirmed") {
        return NextResponse.json({
          prepare_id: existing.prepareId,
          status: existing.status,
          signature: existing.signature,
          explorerUrl: existing.explorerUrl,
        });
      }
      if (existing.signature) {
        const prior = await findPriorSignatureStatus(existing.signature);
        if (prior === "landed") {
          return NextResponse.json({
            prepare_id: existing.prepareId,
            status: existing.status,
            signature: existing.signature,
            explorerUrl: existing.explorerUrl,
            code: "already_submitted",
          });
        }
      }
    }

    const cfg = loadConfig();
    const amountCheck = validateAmountSend(body.amount_send ?? "", cfg.amountSendMax);
    if (!amountCheck.ok) {
      return NextResponse.json(
        { error: amountCheck.code, code: amountCheck.code },
        { status: 400 },
      );
    }
    const amountSend = amountCheck.value;

    const phoneCheck = validatePhone(body.recipient);
    if (!phoneCheck.ok) {
      return NextResponse.json(
        { error: phoneCheck.code, code: phoneCheck.code },
        { status: 400 },
      );
    }
    const recipientPhone = phoneCheck.value;

    const { route, amountUsdc } = await quoteSolanaRoute({
      amountSend,
      routeId: body.route_id,
      expectedAmountReceive: body.expected_amount_receive,
      from: body.from,
      to: body.to,
    });

    const resolved = resolveRecipientPubkey(recipientPhone);
    if (!resolved) {
      throw new SolanaApiError("recipient_not_found", 404);
    }
    const prepareId = existing?.prepareId ?? newTransferId();
    const built = await buildUsdcTransferTx({
      amountUsdc,
      senderPubkey: body.sender_pubkey,
      recipientPubkey: resolved.pubkey,
      routeId: body.route_id,
      prepareId,
    });

    await assertSenderUsdcBalance(
      body.sender_pubkey,
      built.amountRaw,
      built.mint,
    );
    await assertFeePayerSol();
    await assertSenderSol(body.sender_pubkey);

    await simulateBuiltTx(built.transaction);

    const expiresAt = new Date(
      Date.now() + cfg.prepareTtlSeconds * 1000,
    ).toISOString();

    const record: TransferRecord = {
      id: prepareId,
      prepareId,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      status: "prepared",
      routeId: body.route_id,
      amountSend: amountSend.toFixed(2),
      amountReceive: route.amount_receive.toFixed(2),
      amountUsdc: amountUsdc.toFixed(6),
      amountUsdcRaw: built.amountRaw.toString(),
      fromCurrency: "RUB",
      toCurrency: "KGS",
      recipientName: body.recipient_name ?? recipientPhone,
      recipientPhone,
      recipientPubkey: resolved.pubkey,
      senderPubkey: body.sender_pubkey,
      idempotencyKey: body.idempotency_key,
      expiresAt,
      blockhash: built.blockhash,
      lastValidBlockHeight: built.lastValidBlockHeight,
      feePayer: built.feePayer,
      mint: built.mint,
      decimals: built.decimals,
      createAta: built.createAta,
      memo: built.memo,
      txBase64: built.txBase64,
      simulatedFiat: true,
    };
    saveTransfer(record);

    return NextResponse.json({
      prepare_id: prepareId,
      tx_base64: built.txBase64,
      blockhash: built.blockhash,
      last_valid_block_height: built.lastValidBlockHeight,
      expires_at: expiresAt,
      amount_receive: record.amountReceive,
      amount_usdc: record.amountUsdc,
    });
  } catch (e) {
    return handleSolanaApiError(e);
  }
}
