"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { SerializedRoute } from "@/lib/engine";

function RoutesInner() {
  const { t, formatMoney } = useI18n();
  const params = useSearchParams();
  const router = useRouter();
  const amount = params.get("amount") ?? "0";
  const name = params.get("name") ?? "";
  const phone = params.get("phone") ?? "";

  const [routes, setRoutes] = useState<SerializedRoute[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount_send: amount, from: "RUB", to: "KGS" }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "quote_failed");
        if (cancelled) return;
        setRoutes(data.routes);
        setSelected(data.routes[0]?.route_id ?? "");
        setSnapshot(data.rates_snapshot_date);
      } catch {
        if (!cancelled) setError(t("common.error"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [amount, t]);

  function formatEta(minutes: number) {
    if (minutes >= 60) return t("routes.hours", { n: Math.round(minutes / 60) });
    return t("routes.minutes", { n: minutes });
  }

  function continueWithSelected() {
    const q = new URLSearchParams({ amount, name, phone, route: selected });
    router.push(`/confirm?${q.toString()}`);
  }

  if (loading) {
    return <p className="mt-10 text-center text-[var(--muted)]">{t("common.loading")}</p>;
  }

  if (error) {
    return (
      <div className="space-y-4 pt-8">
        <p className="text-[var(--warn)]">{error}</p>
        <Link href="/send" className="btn btn-ghost">
          {t("common.back")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl tracking-tight">{t("routes.title")}</h1>
        <Link href="/send" className="text-sm text-[var(--muted)]">
          {t("common.back")}
        </Link>
      </div>
      {snapshot && (
        <p className="text-xs text-[var(--muted)]">
          FX snapshot {snapshot} · {t("routes.simulated")}
        </p>
      )}

      <div className="space-y-3">
        {routes.map((route, index) => {
          const best = index === 0;
          const active = selected === route.route_id;
          return (
            <button
              key={route.route_id}
              type="button"
              onClick={() => setSelected(route.route_id)}
              className={`route-card w-full text-left ${best ? "best" : ""} ${
                active ? "ring-2 ring-[var(--accent)]" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{t(route.label_key)}</p>
                  {best && (
                    <p className="mt-1 text-xs font-medium uppercase tracking-wide text-[var(--accent-deep)]">
                      {t("routes.best")}
                    </p>
                  )}
                </div>
                <p className="text-right text-lg font-semibold">
                  {formatMoney(route.amount_receive, "KGS")}
                </p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-[var(--muted)]">
                <span>
                  {t("routes.cost")}: {Number(route.total_cost_pct).toFixed(1)}%
                </span>
                <span className="text-right">
                  {t("routes.eta")}: {formatEta(route.eta_minutes)}
                </span>
              </div>
              {route.simulated && (
                <p className="mt-2 text-xs text-amber-700">{t("routes.simulated")}</p>
              )}
            </button>
          );
        })}
      </div>

      <button
        className="btn btn-primary"
        type="button"
        disabled={!selected || selected !== "solana_usdc"}
        onClick={continueWithSelected}
        title={
          selected !== "solana_usdc"
            ? "Demo executes only the TEZAKCHA Express route"
            : undefined
        }
      >
        {t("routes.continue")}
      </button>
      {selected !== "solana_usdc" && (
        <p className="text-center text-xs text-[var(--muted)]">
          Demo settlement runs on TEZAKCHA Express only.
        </p>
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
