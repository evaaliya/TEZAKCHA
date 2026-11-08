import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";

export const runtime = "nodejs";

/**
 * Confirm UI still POSTs here. Real settlement is:
 *   POST /api/send/prepare → embedded wallet sign → POST /api/send/submit
 *
 * Until that client wiring lands, this endpoint refuses rather than faking
 * a "delivered" status. Empty FEE_PAYER_SECRET_KEY / RPC → solana_not_configured.
 */
export async function POST() {
  const cfg = loadConfig();
  if (!cfg.solanaConfigured) {
    return NextResponse.json(
      {
        error: "solana_not_configured",
        code: "solana_not_configured",
        hint: "Set FEE_PAYER_SECRET_KEY (and RPC) in .env, then use prepare → sign → submit.",
      },
      { status: 503 },
    );
  }

  // Keys exist, but confirm page does not yet call prepare/submit + embedded sign.
  return NextResponse.json(
    {
      error: "embedded_not_configured",
      code: "embedded_not_configured",
      hint: "Wire confirm UI to /api/send/prepare → signTransaction → /api/send/submit.",
    },
    { status: 503 },
  );
}
