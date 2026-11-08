import { NextResponse } from "next/server";
import { getRatesSnapshot } from "@/lib/engine";

export const runtime = "nodejs";

/** Lightweight rates pack for the home banner (no route math). */
export async function GET() {
  try {
    const rates = await getRatesSnapshot();
    return NextResponse.json({
      rates_source: rates.rates_source,
      rates_snapshot_date: rates.snapshot_date,
      rates_version: rates.rates_version,
      rates_updated_at: rates.rates_updated_at,
      mid_rates: rates.mid_rates,
      reference_rates: rates.reference_rates ?? [],
      corridor: rates.corridor,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "rates_failed" },
      { status: 500 },
    );
  }
}
