"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import type { PublicTransfer, TransferDirection } from "@/lib/transferPublic";
import { statusI18nKey, statusToneClass } from "@/lib/transferStatus";

export function TransactionRow({
  transfer,
  direction = "outgoing",
  href,
}: {
  transfer: PublicTransfer;
  direction?: TransferDirection;
  href?: string;
}) {
  const { t, formatMoney, locale } = useI18n();
  const localeTag = locale === "ky" ? "ky-KG" : locale === "ru" ? "ru-RU" : "en-US";
  const date = new Date(transfer.createdAt).toLocaleDateString(localeTag, {
    day: "numeric",
    month: "short",
  });
  const target = href ?? `/history/${transfer.id}`;
  const incoming = direction === "incoming";

  const title = incoming
    ? t("history.incoming_title")
    : t("history.to", { name: transfer.recipientName });

  const primaryAmount = incoming
    ? `+${formatMoney(transfer.amountReceive, transfer.toCurrency)}`
    : formatMoney(transfer.amountSend, transfer.fromCurrency);

  const secondary = incoming
    ? `${t("history.incoming_title")} · ${t("status.estimate")}`
    : `→ ${formatMoney(transfer.amountReceive, transfer.toCurrency)} · ${t("status.estimate")}`;

  return (
    <Link href={target} className="block rounded-2xl border border-black/5 bg-white p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{title}</p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            <span
              className={
                incoming ? "font-medium text-[var(--accent-deep)]" : ""
              }
            >
              {incoming ? t("history.filter.incoming") : t("history.filter.outgoing")}
            </span>
            {" · "}
            {date} ·{" "}
            <span className={statusToneClass(transfer.status)}>
              {t(statusI18nKey(transfer.status))}
            </span>
          </p>
        </div>
        <div className="text-right">
          <p
            className={`font-semibold ${
              incoming ? "text-[var(--accent-deep)]" : ""
            }`}
          >
            {primaryAmount}
          </p>
          <p className="text-xs text-[var(--muted)]">{secondary}</p>
        </div>
      </div>
    </Link>
  );
}
