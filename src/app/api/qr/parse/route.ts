import { NextResponse } from "next/server";
import { ElqrError, parseElqr } from "@/lib/qr/elqr";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { text?: unknown };
    if (typeof body.text !== "string") {
      return NextResponse.json(
        { error: "text is required", code: "qr_unsupported" },
        { status: 400 },
      );
    }

    const parsed = parseElqr(body.text);
    return NextResponse.json({
      provider: parsed.provider,
      phone_e164: parsed.phone_e164,
      name_hint: parsed.name_hint ?? null,
      amount_kgs: parsed.amount_kgs ? parsed.amount_kgs.toFixed() : null,
      raw_type: parsed.raw_type,
    });
  } catch (e) {
    if (e instanceof ElqrError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "parse_failed", code: "qr_malformed" },
      { status: 400 },
    );
  }
}
