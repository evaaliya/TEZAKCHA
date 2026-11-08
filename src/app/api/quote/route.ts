import { NextResponse } from "next/server";
import { getRatesSnapshot, quoteRoutes, serializeRoute } from "@/lib/engine";
import type { Currency } from "@/lib/engine";
import { loadConfig } from "@/lib/config";
import { validateAmountSend, validatePhone } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      amount_send?: string | number;
      from?: string;
      to?: string;
      phone?: string;
      recipient_phone?: string;
    };

    const cfg = loadConfig();
    const amountCheck = validateAmountSend(body.amount_send ?? "", cfg.amountSendMax);
    if (!amountCheck.ok) {
      return NextResponse.json(
        { error: amountCheck.code, code: amountCheck.code },
        { status: 400 },
      );
    }
    const amount = amountCheck.value;

    const phoneRaw = body.phone ?? body.recipient_phone;
    if (phoneRaw !== undefined && phoneRaw !== null && phoneRaw !== "") {
      const phoneCheck = validatePhone(String(phoneRaw));
      if (!phoneCheck.ok) {
        return NextResponse.json(
          { error: phoneCheck.code, code: phoneCheck.code },
          { status: 400 },
        );
      }
    }

    const rates = await getRatesSnapshot();
    const from = (body.from ?? rates.corridor.from) as Currency;
    const to = (body.to ?? rates.corridor.to) as Currency;

    const baseFrom = rates.corridor.from;
    const baseTo = rates.corridor.to;
    const supported =
      (from === baseFrom && to === baseTo) ||
      (from === baseTo && to === baseFrom);
    if (!supported) {
      return NextResponse.json(
        {
          error: `from/to must be ${baseFrom}↔${baseTo}`,
          code: "corridor_unsupported",
        },
        { status: 400 },
      );
    }

    const routes = quoteRoutes({
      amount_send: amount,
      from,
      to,
      rates,
    }).map(serializeRoute);

    return NextResponse.json({
      amount_send: amount.toFixed(),
      from,
      to,
      rates_source: rates.rates_source,
      rates_snapshot_date: rates.snapshot_date,
      rates_version: rates.rates_version,
      rates_updated_at: rates.rates_updated_at,
      reference_rates: rates.reference_rates ?? [],
      routes,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "quote_failed" },
      { status: 500 },
    );
  }
}
