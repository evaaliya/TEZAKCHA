"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { TransferRecord } from "@/lib/store/transfers";

export default function StatusPage() {
  const { t, formatMoney } = useI18n();
  const params = useParams<{ id: string }>();
  const [transfer, setTransfer] = useState<TransferRecord | null>(null);
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

  const statusLabel =
    transfer.status === "delivered"
      ? t("status.delivered")
      : transfer.status === "failed"
        ? t("status.failed")
        : t("status.pending");

  const demoMode = transfer.signature?.startsWith("demo_");

  return (
    <div className="space-y-5 pt-4">
      <h1 className="font-display text-3xl tracking-tight">{t("status.title")}</h1>

      <div className="rounded-2xl bg-white p-5 shadow-soft">
        <p
          className={`text-sm font-semibold uppercase tracking-wide ${
            transfer.status === "delivered"
              ? "text-[var(--accent-deep)]"
              : transfer.status === "failed"
                ? "text-red-700"
                : "text-amber-700"
          }`}
        >
          {statusLabel}
        </p>
        <p className="mt-3 text-3xl font-semibold">
          {formatMoney(transfer.amountReceive, transfer.toCurrency)}
        </p>
        <p className="mt-1 text-[var(--muted)]">
          {transfer.recipientName} · {formatMoney(transfer.amountSend, transfer.fromCurrency)}
        </p>

        {demoMode && (
          <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {t("status.demo")}
          </p>
        )}

        {transfer.explorerUrl && (
          <a
            href={transfer.explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex text-sm font-medium text-[var(--accent-deep)] underline"
          >
            {t("status.explorer")}
          </a>
        )}
      </div>

      <Link href={`/receive/${transfer.id}`} className="btn btn-primary">
        {t("status.to_recipient")}
      </Link>
      <Link href="/send" className="btn btn-ghost">
        {t("status.again")}
      </Link>
    </div>
  );
}
