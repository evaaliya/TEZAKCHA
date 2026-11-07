import { NextResponse } from "next/server";
import { getTransfer, listTransfers } from "@/lib/store/transfers";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (id) {
    const transfer = getTransfer(id);
    if (!transfer) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ transfer });
  }
  return NextResponse.json({ transfers: listTransfers() });
}
