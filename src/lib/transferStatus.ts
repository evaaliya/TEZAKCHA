import type { TransferStatus } from "@/lib/store/transfers";

/** Map machine status → i18n key. confirmed shows as Delivered. */
export function statusI18nKey(status: TransferStatus | string): string {
  switch (status) {
    case "confirmed":
    case "delivered":
      return "status.delivered";
    case "failed":
      return "status.failed";
    case "expired":
      return "status.expired";
    case "prepared":
      return "status.prepared";
    case "submitted":
      return "status.submitted";
    default:
      return "status.pending";
  }
}

export function statusToneClass(status: TransferStatus | string): string {
  if (status === "confirmed" || status === "delivered") {
    return "text-[var(--accent-deep)]";
  }
  if (status === "failed" || status === "expired") {
    return "text-red-700";
  }
  return "text-amber-700";
}

export function isSuccessStatus(status: TransferStatus | string): boolean {
  return status === "confirmed" || status === "delivered";
}
