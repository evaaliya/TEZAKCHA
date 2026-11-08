import { NextResponse } from "next/server";
import { refreshSubmittedTransfer } from "@/lib/solana/confirm";
import { getTransfer, listTransfers } from "@/lib/store/transfers";
import { publicTransfer } from "@/lib/transferPublic";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (id) {
    let transfer = getTransfer(id);
    if (!transfer) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (transfer.status === "submitted") {
      try {
        transfer = await refreshSubmittedTransfer(transfer);
      } catch {
        // keep last known
      }
    }
    return NextResponse.json({ transfer: publicTransfer(transfer) });
  }
  return NextResponse.json({
    transfers: listTransfers().map(publicTransfer),
  });
}
