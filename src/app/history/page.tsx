"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { TransferRecord } from "@/lib/store/transfers";

export default function HistoryPage() {
  const { t, formatMoney } = useI18n();
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/transfers");
      const data = await res.json();
      setTransfers(data.transfers ?? []);
    })();
  }, []);

  return (
    <div className="space-y-4 pt-2">
      <h1 className="font-display text-3xl tracking-tight">{t("history.title")}</h1>

      {transfers.length === 0 ? (
        <p className="text-[var(--muted)]">{t("history.empty")}</p>
      ) : (
        <ul className="space-y-3">
          {transfers.map((tr) => (
            <li key={tr.id}>
              <Link
                href={`/status/${tr.id}`}
                className="block rounded-2xl border border-black/5 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {t("history.to", { name: tr.recipientName })}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {new Date(tr.createdAt).toLocaleString()} · {tr.status}
                    </p>
                  </div>
                  <p className="font-semibold">
                    {formatMoney(tr.amountReceive, tr.toCurrency)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
