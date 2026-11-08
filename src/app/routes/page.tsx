"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { BalanceChip } from "@/components/BalanceChip";
import { useI18n } from "@/lib/i18n";
import type { RatesSourceKind, ReferenceRate, SerializedRoute } from "@/lib/engine";
import {
  formatReferenceLine,
  formatUpdatedClock,
} from "@/lib/format/referenceLine";

function feeFromBreakdown(route: SerializedRoute): number {
  return route.fees_breakdown.reduce((sum, item) => sum + Number(item.amount_in_from_ccy || 0), 0);
}

function RoutesInner() {
  const { t, formatMoney } = useI18n();
  const params = useSearchParams();
  const router = useRouter();
  const amount = params.get("amount") ?? "0";
  const name = params.get("name") ?? "";
  const phone = params.get("phone") ?? "";
  const method = params.get("method") ?? "smart";
  const from = params.get("from") === "KGS" ? "KGS" : "RUB";
  const to = params.get("to") === "RUB" ? "RUB" : from === "KGS" ? "RUB" : "KGS";

  const [routes, setRoutes] = useState<SerializedRoute[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [referenceRates, setReferenceRates] = useState<ReferenceRate[]>([]);
  const [ratesSource, setRatesSource] = useState<RatesSourceKind | "">("");
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState("");
  const [ratesVersion, setRatesVersion] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount_send: amount, from, to }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "quote_failed");
        if (cancelled) return;
        setRoutes(data.routes);
        setSelected(data.routes[0]?.route_id ?? "");
        setReferenceRates(data.reference_rates ?? []);
        setRatesSource(data.rates_source ?? "");
        setRatesUpdatedAt(data.rates_updated_at ?? "");
        setRatesVersion(data.rates_version ?? "");
      } catch {
        if (!cancelled) setError(t("common.error"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [amount, from, to, t]);

  function formatEta(minutes: number) {
    if (minutes >= 60) return t("routes.hours", { n: Math.round(minutes / 60) });
    return t("routes.minutes", { n: minutes });
  }

  function continueWithSelected() {
    const selectedRoute = routes.find((r) => r.route_id === selected);
    const q = new URLSearchParams({
      amount,
      name,
      phone,
      route: selected,
      method,
      from,
      to,
      rates_version: ratesVersion,
      receive: selectedRoute?.amount_receive ?? "",
    });
    router.push(`/confirm?${q.toString()}`);
  }

  const selectedRoute = routes.find((r) => r.route_id === selected);
  const canSettle = Boolean(selectedRoute?.uses_solana);
  const bestReceive = routes[0] ? Number(routes[0].amount_receive) : 0;

  const clock = formatUpdatedClock(ratesUpdatedAt);
  const updatedLabel = clock
    ? t("rates.updated", { time: clock })
    : undefined;
  const snapshotLabel =
    ratesSource === "snapshot" || ratesSource === "live_stale"
      ? t("rates.snapshot")
      : undefined;

  if (loading) {
    return <p className="mt-10 text-center text-[var(--muted)]">{t("common.loading")}</p>;
  }

  if (error) {
    return (
      <div className="space-y-4 pt-8">
        <p className="text-[var(--warn)]">{error}</p>
        <Link href={`/send?method=${method}`} className="btn btn-ghost">
          {t("common.back")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl tracking-tight">{t("routes.title")}</h1>
        <Link
          href={`/send?method=${method}&name=${encodeURIComponent(name)}&phone=${encodeURIComponent(phone)}&from=${from}&to=${to}`}
          className="text-sm text-[var(--muted)]"
        >
          {t("common.back")}
        </Link>
      </div>

      <BalanceChip />

      <div className="rounded-2xl border border-black/5 bg-white px-4 py-3">
        <p className="text-xs text-[var(--muted)]">{t("routes.for_recipient")}</p>
        <p className="mt-0.5 font-medium">
          {name} · {phone}
        </p>
        <p className="mt-2 text-xs text-[var(--muted)]">
          {t("routes.you_send")}: {formatMoney(amount, from)} · {from} → {to}
        </p>
      </div>

      <p className="text-xs text-[var(--muted)] whitespace-normal break-words">
        {formatReferenceLine(referenceRates, t, t("routes.simulated"), {
          updatedLabel,
          snapshotLabel,
        })}
      </p>
      <p className="text-xs font-medium text-[var(--accent-deep)]">{t("routes.metric_hint")}</p>

      <div className="space-y-3">
        {routes.map((route, index) => {
          const best = index === 0;
          const express = Boolean(route.uses_solana);
          const active = selected === route.route_id;
          const fee = feeFromBreakdown(route);
          const delta = bestReceive - Number(route.amount_receive);
          return (
            <button
              key={route.route_id}
              type="button"
              onClick={() => setSelected(route.route_id)}
              className={`route-card w-full text-left ${
                express ? "best express" : best ? "best" : ""
              } ${active ? "ring-2 ring-[var(--accent)]" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{t(route.label_key)}</p>
                  {express ? (
                    <p className="mt-1.5 inline-flex rounded-lg border border-[var(--accent)] bg-[var(--mint-soft)] px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--accent-deep)]">
                      {t("routes.best_value")}
                    </p>
                  ) : best ? (
                    <p className="mt-1 text-xs font-medium uppercase tracking-wide text-[var(--accent-deep)]">
                      {t("routes.best")}
                    </p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                    {t("routes.receive")}
                  </p>
                  <p className="text-lg font-semibold text-[var(--accent-deep)]">
                    {formatMoney(route.amount_receive, to)}
                  </p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1.5 text-sm text-[var(--muted)]">
                <span>
                  {t("routes.fee")}: {formatMoney(fee, from)}
                </span>
                <span className="text-right">
                  {t("routes.eta")}: {formatEta(route.eta_minutes)}
                </span>
                <span>
                  {t("routes.cost")}: {Number(route.total_cost_pct).toFixed(1)}%
                </span>
                <span className="text-right">
                  {route.uses_solana ? t("routes.network_express") : t("routes.network_fiat")}
                </span>
              </div>

              {!best && delta > 0 && (
                <p className="mt-2 text-xs text-[var(--warn)]">
                  {t("routes.less_than_best", { amount: formatMoney(delta, to) })}
                </p>
              )}

              {route.uses_solana ? (
                <p className="mt-2 text-xs text-[var(--accent-deep)]">
                  {t("routes.real_settlement")}
                </p>
              ) : (
                <p className="mt-2 text-xs text-amber-700">{t("routes.comparison_only")}</p>
              )}
            </button>
          );
        })}
      </div>

      <button
        className="btn btn-primary"
        type="button"
        disabled={!selected || !canSettle}
        onClick={continueWithSelected}
        title={!canSettle ? t("routes.demo_settle_only") : undefined}
      >
        {t("routes.continue")}
      </button>
      {!canSettle && (
        <p className="text-center text-xs text-[var(--muted)]">{t("routes.demo_settle_only")}</p>
      )}
    </div>
  );
}

export default function RoutesPage() {
  return (
    <Suspense fallback={<p className="mt-10 text-center">…</p>}>
      <RoutesInner />
    </Suspense>
  );
}
