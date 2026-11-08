"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { sendHref } from "@/lib/transferMethods";
import type { PublicTransfer } from "@/lib/transferPublic";
import { isSuccessStatus } from "@/lib/transferStatus";

export default function StatusPage() {
  const { t, formatMoney, locale } = useI18n();
  const params = useParams<{ id: string }>();
  const [transfer, setTransfer] = useState<PublicTransfer | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/transfers?id=${params.id}`);
      const data = await res.json();
      if (!res.ok) {
        setError(t("common.error"));
        return;
      }
      setTransfer(data.transfer);
    })();
  }, [params.id, t]);

  if (error) return <p className="mt-10 text-red-700">{error}</p>;
  if (!transfer) {
    return <p className="mt-10 text-center text-[var(--muted)]">{t("common.loading")}</p>;
  }

  const success = isSuccessStatus(transfer.status);
  const localeTag = locale === "ky" ? "ky-KG" : locale === "ru" ? "ru-RU" : "en-US";
  const when = new Date(transfer.createdAt).toLocaleString(localeTag, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="space-y-5 pt-4">
      <div className="rounded-2xl bg-white p-5 shadow-soft">
        <div className="flex flex-col items-center text-center">
          <span
            className={`flex h-14 w-14 items-center justify-center rounded-full text-2xl ${
              success
                ? "bg-[var(--mint-soft)] text-[var(--accent-deep)]"
                : "bg-amber-50 text-amber-800"
            }`}
            aria-hidden
          >
            {success ? "✓" : "!"}
          </span>
          <p
            className={`mt-3 text-lg font-semibold ${
              success ? "text-[var(--accent-deep)]" : "text-amber-800"
            }`}
          >
            {success ? t("history.detail.sent") : t("status.pending")}
          </p>
        </div>

        <div className="mt-5 space-y-3 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-[var(--muted)]">{t("confirm.you_send")}</span>
            <span className="font-semibold">
              {formatMoney(transfer.amountSend, transfer.fromCurrency)}
            </span>
          </div>

          <div className="flex justify-between gap-3">
            <span className="text-[var(--muted)]">{t("confirm.they_get")}</span>
            <span className="text-right">
              <span className="font-semibold text-[var(--accent-deep)]">
                {formatMoney(transfer.amountReceive, transfer.toCurrency)}
              </span>
              <span className="mt-0.5 block text-[11px] font-medium text-[var(--muted)]">
                {t("status.estimate")}
              </span>
            </span>
          </div>

          <div className="h-px bg-black/5" />

          <div className="flex justify-between gap-3">
            <span className="text-[var(--muted)]">{t("history.detail.recipient")}</span>
            <span className="text-right font-medium">
              {transfer.recipientName}
              <span className="mt-0.5 block font-normal text-[var(--muted)]">
                {transfer.recipientPhone}
              </span>
            </span>
          </div>

          <div className="flex justify-between gap-3">
            <span className="text-[var(--muted)]">{t("history.detail.date")}</span>
            <span className="font-medium">{when}</span>
          </div>

          <div className="flex justify-between gap-3">
            <span className="text-[var(--muted)]">{t("routes.fee")}</span>
            <span className="font-medium">{t("status.fee_included")}</span>
          </div>

          <div className="flex justify-between gap-3">
            <span className="text-[var(--muted)]">{t("routes.eta")}</span>
            <span className="font-medium">{t("routes.minutes", { n: 15 })}</span>
          </div>
        </div>
      </div>

      <Link href="/" className="btn btn-primary">
        {t("status.done")}
      </Link>
      <Link
        href={sendHref("smart", {
          name: transfer.recipientName,
          phone: transfer.recipientPhone,
        })}
        className="btn btn-ghost"
      >
        {t("history.detail.repeat")}
      </Link>

      {transfer.explorerUrl ? (
        <p className="pt-1 text-center">
          <a
            href={transfer.explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-[var(--muted)] underline"
          >
            {t("status.check_network")}
          </a>
        </p>
      ) : null}
    </div>
  );
}
