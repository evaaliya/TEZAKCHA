import Decimal from "decimal.js";
import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import {
  quoteRoutes,
  usdcAmountForSolanaTransfer,
  type RouteQuote,
} from "@/lib/engine";
import { getRatesSnapshot } from "@/lib/engine/rates";
import { SolanaApiError, jsonError } from "@/lib/solana/errors";
import { allowRequest, clientIp } from "@/lib/solana/rateLimit";

export function enforceRateLimit(request: Request): NextResponse | null {
  const ip = clientIp(request);
  if (!allowRequest(ip)) {
    return NextResponse.json(
      { error: "rate_limited", code: "rate_limited" },
      { status: 429 },
    );
  }
  return null;
}

export function requireSolanaConfigured(): void {
  const cfg = loadConfig();
  if (!cfg.solanaConfigured) {
    throw new SolanaApiError("solana_not_configured", 503);
  }
}

export function handleSolanaApiError(e: unknown): NextResponse {
  if (e instanceof SolanaApiError) {
    return NextResponse.json(jsonError(e), { status: e.status });
  }
  console.error("[api/send]", e instanceof Error ? e.message : "unknown_error");
  return NextResponse.json(
    { error: "send_failed", code: "send_failed" },
    { status: 500 },
  );
}

export async function quoteSolanaRoute(params: {
  amountSend: Decimal;
  routeId: string;
  expectedAmountReceive?: string;
  from?: "RUB" | "KGS" | "USDC";
  to?: "RUB" | "KGS" | "USDC";
}): Promise<{ route: RouteQuote; amountUsdc: Decimal }> {
  const rates = await getRatesSnapshot();
  const from = params.from ?? (rates.corridor.from as "RUB" | "KGS" | "USDC");
  const to = params.to ?? (rates.corridor.to as "RUB" | "KGS" | "USDC");
  const routes = quoteRoutes({
    amount_send: params.amountSend,
    from,
    to,
    rates,
  });
  const route = routes.find((r) => r.route_id === params.routeId);
  if (!route) {
    throw new SolanaApiError("unknown_route", 400);
  }
  if (!route.uses_solana) {
    throw new SolanaApiError("route_not_solana", 400);
  }

  if (
    params.expectedAmountReceive !== undefined &&
    params.expectedAmountReceive !== ""
  ) {
    const expected = new Decimal(params.expectedAmountReceive);
    if (!route.amount_receive.eq(expected)) {
      throw new SolanaApiError("quote_changed", 409, "quote_changed", {
        amount_receive: route.amount_receive.toFixed(),
        route_id: route.route_id,
      });
    }
  }

  const amountUsdc = usdcAmountForSolanaTransfer(route);
  if (amountUsdc.lte(0)) {
    throw new SolanaApiError("invalid_amount", 400);
  }

  return { route, amountUsdc };
}
