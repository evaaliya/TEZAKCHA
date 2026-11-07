import Decimal from "decimal.js";
import { Keypair } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { getRatesSnapshot, quoteRoutes } from "@/lib/engine";
import { isSolanaConfigured, sendUsdcTransfer } from "@/lib/solana/transfer";
import {
  newTransferId,
  saveTransfer,
  type TransferRecord,
} from "@/lib/store/transfers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      amount_send?: string;
      route_id?: string;
      recipient_name?: string;
      recipient_phone?: string;
      recipient_pubkey?: string;
      pin?: string;
    };

    if (!body.amount_send || !body.route_id || !body.recipient_name) {
      return NextResponse.json(
        { error: "amount_send, route_id, and recipient_name are required" },
        { status: 400 },
      );
    }

    if (body.route_id !== "solana_usdc") {
      return NextResponse.json(
        { error: "Only the Solana route can be executed in this demo" },
        { status: 400 },
      );
    }

    // Demo confirmation gate (PIN / passkey stand-in)
    if (body.pin && body.pin.length < 4) {
      return NextResponse.json({ error: "Invalid confirmation" }, { status: 401 });
    }

    const amount = new Decimal(body.amount_send);
    const rates = getRatesSnapshot();
    const routes = quoteRoutes({
      amount_send: amount,
      from: "RUB",
      to: "KGS",
      rates,
    });
    const chosen = routes.find((r) => r.route_id === body.route_id);
    if (!chosen) {
      return NextResponse.json({ error: "Unknown route" }, { status: 400 });
    }

    // Derive USDC amount from on-ramp hop (simulated): RUB → USDC after fee/spread
    const onRamp = rates.routes.solana_usdc.hops[0];
    const afterFee = amount.minus(onRamp.fixed_fee_from);
    const mid = new Decimal(rates.mid_rates.RUB_USDC);
    const rateEff = mid.mul(new Decimal(1).minus(onRamp.spread));
    const usdcAmount = afterFee.mul(rateEff).toDecimalPlaces(6, Decimal.ROUND_DOWN);

    const id = newTransferId();
    const record: TransferRecord = {
      id,
      createdAt: new Date().toISOString(),
      status: "pending",
      routeId: body.route_id,
      amountSend: amount.toFixed(2),
      amountReceive: chosen.amount_receive.toFixed(2),
      fromCurrency: "RUB",
      toCurrency: "KGS",
      recipientName: body.recipient_name,
      recipientPhone: body.recipient_phone ?? "",
      simulatedFiat: true,
    };
    saveTransfer(record);

    const configured = await isSolanaConfigured();
    const recipientPubkey =
      body.recipient_pubkey ||
      process.env.DEMO_RECIPIENT_PUBKEY ||
      Keypair.generate().publicKey.toBase58();

    if (!configured.ok) {
      // Demo fallback: record a simulated on-chain hop when keys are not set
      const updated: TransferRecord = {
        ...record,
        status: "delivered",
        signature: `demo_${id}`,
        explorerUrl: undefined,
        error: `demo_mode:${configured.reason ?? "unconfigured"}`,
      };
      saveTransfer(updated);
      return NextResponse.json({
        transfer: updated,
        demo_mode: true,
        message:
          "Solana keys not configured — transfer recorded in demo mode. Set FEE_PAYER_SECRET_KEY and SENDER_SECRET_KEY for a real devnet send.",
      });
    }

    try {
      const result = await sendUsdcTransfer({
        amountUsdc: usdcAmount.toFixed(6),
        recipientPubkey,
        routeId: body.route_id,
      });
      const updated: TransferRecord = {
        ...record,
        status: "delivered",
        signature: result.signature,
        explorerUrl: result.explorerUrl,
      };
      saveTransfer(updated);
      return NextResponse.json({ transfer: updated, onchain: result });
    } catch (e) {
      const updated: TransferRecord = {
        ...record,
        status: "failed",
        error: e instanceof Error ? e.message : "send_failed",
      };
      saveTransfer(updated);
      return NextResponse.json({ transfer: updated }, { status: 502 });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "send_failed" },
      { status: 500 },
    );
  }
}
