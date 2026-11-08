import type { TransferRecord } from "@/lib/store/transfers";

/** Fields safe to return to the client UI. */
export function publicTransfer(t: TransferRecord) {
  return {
    id: t.id,
    createdAt: t.createdAt,
    status: t.status,
    routeId: t.routeId,
    amountSend: t.amountSend,
    amountReceive: t.amountReceive,
    amountUsdc: t.amountUsdc,
    fromCurrency: t.fromCurrency,
    toCurrency: t.toCurrency,
    recipientName: t.recipientName,
    recipientPhone: t.recipientPhone,
    recipientPubkey: t.recipientPubkey,
    senderPubkey: t.senderPubkey,
    signature: t.signature,
    explorerUrl: t.explorerUrl,
    error: t.error,
    errorCode: t.errorCode,
    simulatedFiat: t.simulatedFiat,
  };
}

export type PublicTransfer = ReturnType<typeof publicTransfer>;

export type TransferDirection = "incoming" | "outgoing" | "other";

export function transferDirection(
  t: Pick<PublicTransfer, "recipientPhone" | "recipientPubkey" | "senderPubkey">,
  me: { phone?: string; pubkey?: string | null },
): TransferDirection {
  const phone = me.phone?.trim();
  const pk = me.pubkey?.trim();
  if (phone && t.recipientPhone === phone) return "incoming";
  if (pk && t.recipientPubkey === pk) return "incoming";
  if (pk && t.senderPubkey === pk) return "outgoing";
  // Same-device demo fallback: treat as outgoing if we originated it somehow
  return "outgoing";
}
