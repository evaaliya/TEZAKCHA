import { NextResponse } from "next/server";
import { refreshSubmittedTransfer } from "@/lib/solana/confirm";
import { getTransfer } from "@/lib/store/transfers";
import { publicTransfer } from "@/lib/transferPublic";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let transfer = getTransfer(id);
  if (!transfer) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (transfer.status === "submitted") {
    try {
      transfer = await refreshSubmittedTransfer(transfer);
    } catch {
      // Keep last known status if RPC refresh fails.
    }
  }

  return NextResponse.json({ transfer: publicTransfer(transfer) });
}
