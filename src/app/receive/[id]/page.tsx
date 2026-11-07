"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { TransferRecord } from "@/lib/store/transfers";

export default function ReceivePage() {
  const { t, formatMoney } = useI18n();
  const params = useParams<{ id: string }>();
  const [transfer, setTransfer] = useState<TransferRecord | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/transfers?id=${params.id}`);
      const data = await res.json();
      if (res.ok) setTransfer(data.transfer);
    })();
  }, [params.id]);

  if (!transfer) {
    return <p className="mt-10 text-center text-[var(--muted)]">{t("common.loading")}</p>;
  }

  return (
    <div className="flex flex-1 flex-col justify-between gap-8 pt-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-[var(--accent-deep)]">
          {t("receive.from")}
        </p>
        <h1 className="mt-2 font-display text-4xl leading-tight tracking-tight">
          {t("receive.title")}
        </h1>
        <p className="mt-8 text-sm text-[var(--muted)]">{t("receive.amount")}</p>
        <p className="mt-1 text-5xl font-semibold tracking-tight text-[var(--ink)]">
          {formatMoney(transfer.amountReceive, transfer.toCurrency)}
        </p>
        <p className="mt-6 rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t("receive.note")}
        </p>
      </div>
      <Link href="/history" className="btn btn-primary">
        {t("nav.history")}
      </Link>
    </div>
  );
}
