"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useWalletBalance } from "@/lib/useWalletBalance";

/** Demo balance shown in sender fiat (RUB) as an estimate — no token names. */
export function BalanceChip({ compact = false }: { compact?: boolean }) {
  const { t, formatMoney } = useI18n();
  const { usdc, loading } = useWalletBalance();
  const [rubPerUsdc, setRubPerUsdc] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/rates");
        if (!res.ok) return;
        const data = await res.json();
        const rubUsdc = Number(data.mid_rates?.RUB_USDC);
        if (!cancelled && rubUsdc > 0) {
          setRubPerUsdc(1 / rubUsdc);
        }
      } catch {
        /* keep null */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fiatAmount =
    usdc == null || rubPerUsdc == null ? null : usdc * rubPerUsdc;
  const amountLabel =
    fiatAmount == null
      ? "…"
      : formatMoney(fiatAmount.toFixed(2), "RUB");

  if (compact) {
    return (
      <Link
        href="/accounts"
        className="rounded-full bg-[var(--mint-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-deep)]"
        title={t("balance.chip_title")}
      >
        {loading ? "…" : amountLabel}
      </Link>
    );
  }

  return (
    <Link
      href="/accounts"
      className="block rounded-2xl border border-[var(--accent)]/25 bg-[var(--mint-soft)] px-4 py-3"
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--accent-deep)]">
        {t("balance.label")}
      </p>
      <p className="mt-0.5 text-xl font-semibold text-[var(--ink)]">
        {loading ? "…" : amountLabel}
      </p>
      <p className="mt-0.5 text-xs text-[var(--muted)]">
        {t("balance.hint")} · {t("status.estimate")}
      </p>
    </Link>
  );
}
