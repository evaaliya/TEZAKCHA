import { NextResponse } from "next/server";
import {
  RecipientConflictError,
  upsertRecipientPubkey,
} from "@/lib/solana/recipients";
import { validatePhone, validateSolanaAddress } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * After login: phone (account) → embedded wallet pubkey (local/memory only).
 * First registration wins; config/recipients.json is never overwritten.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { phone?: string; pubkey?: string };
    const phoneCheck = validatePhone(body.phone ?? "");
    if (!phoneCheck.ok) {
      return NextResponse.json(
        { error: phoneCheck.code, code: phoneCheck.code },
        { status: 400 },
      );
    }
    const pkCheck = validateSolanaAddress(body.pubkey ?? "");
    if (!pkCheck.ok) {
      return NextResponse.json(
        { error: pkCheck.code, code: pkCheck.code },
        { status: 400 },
      );
    }

    upsertRecipientPubkey(phoneCheck.value, pkCheck.value);

    return NextResponse.json({
      ok: true,
      phone: phoneCheck.value,
      pubkey: pkCheck.value,
    });
  } catch (e) {
    if (e instanceof RecipientConflictError) {
      return NextResponse.json(
        {
          error: "This number is already registered",
          code: "number_already_registered",
        },
        { status: 409 },
      );
    }
    const msg = e instanceof Error ? e.message : "register_failed";
    return NextResponse.json({ error: msg, code: msg }, { status: 500 });
  }
}
