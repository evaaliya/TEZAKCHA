import Decimal from "decimal.js";
import { NextResponse } from "next/server";
import { getRatesSnapshot, quoteRoutes, serializeRoute } from "@/lib/engine";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      amount_send?: string | number;
      from?: string;
      to?: string;
    };

    const amountRaw = body.amount_send;
    if (amountRaw === undefined || amountRaw === null || amountRaw === "") {
      return NextResponse.json(
        { error: "amount_send is required" },
        { status: 400 },
      );
    }

    const amount = new Decimal(amountRaw);
    if (amount.lte(0)) {
      return NextResponse.json(
        { error: "amount_send must be positive" },
        { status: 400 },
      );
    }

    const from = (body.from ?? "RUB") as "RUB";
    const to = (body.to ?? "KGS") as "KGS";
    const rates = getRatesSnapshot();

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
      rates_source: rates.source,
      rates_snapshot_date: rates.snapshot_date,
      routes,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "quote_failed" },
      { status: 500 },
    );
  }
}
