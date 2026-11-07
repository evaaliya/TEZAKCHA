"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useI18n } from "@/lib/i18n";
import type { SerializedRoute } from "@/lib/engine";

function ConfirmInner() {
  const { t, formatMoney } = useI18n();
  const params = useSearchParams();
  const router = useRouter();
  const amount = params.get("amount") ?? "0";
  const name = params.get("name") ?? "";
  const phone = params.get("phone") ?? "";
  const routeId = params.get("route") ?? "solana_usdc";

  const [route, setRoute] = useState<SerializedRoute | null>(null);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_send: amount, from: "RUB", to: "KGS" }),
      });
      const data = await res.json();
      const found = (data.routes as SerializedRoute[]).find((r) => r.route_id === routeId);
      setRoute(found ?? null);
    })();
  }, [amount, routeId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_send: amount,
          route_id: routeId,
          recipient_name: name,
          recipient_phone: phone,
          pin,
        }),
      });
      const data = await res.json();
      if (!res.ok && !data.transfer) {
        throw new Error(data.error || "send_failed");
      }
      router.push(`/status/${data.transfer.id}`);
    } catch {
      setError(t("common.error"));
      setLoading(false);
    }
  }

  function formatEta(minutes: number) {
    if (minutes >= 60) return t("routes.hours", { n: Math.round(minutes / 60) });
    return t("routes.minutes", { n: minutes });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 pt-2">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl tracking-tight">{t("confirm.title")}</h1>
        <Link href={`/routes?amount=${amount}&name=${encodeURIComponent(name)}&phone=${encodeURIComponent(phone)}`} className="text-sm text-[var(--muted)]">
          {t("common.back")}
        </Link>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-soft">
        <p className="text-sm text-[var(--muted)]">{t("confirm.you_send")}</p>
        <p className="text-2xl font-semibold">{formatMoney(amount, "RUB")}</p>
        <div className="my-3 h-px bg-black/5" />
        <p className="text-sm text-[var(--muted)]">{t("confirm.they_get")}</p>
        <p className="text-2xl font-semibold text-[var(--accent-deep)]">
          {route ? formatMoney(route.amount_receive, "KGS") : "—"}
        </p>
        <p className="mt-3 text-sm text-[var(--muted)]">
          {t("confirm.eta")}: {route ? formatEta(route.eta_minutes) : "—"}
        </p>
        <p className="mt-1 text-sm">
          {name} · {phone}
        </p>
      </div>

      <label className="block space-y-2">
        <span className="text-sm text-[var(--muted)]">{t("confirm.pin")}</span>
        <input
          className="field tracking-[0.4em]"
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="••••"
          required
        />
      </label>

      {error && <p className="text-sm text-red-700">{error}</p>}

      <button className="btn btn-primary" type="submit" disabled={loading || pin.length < 4}>
        {loading ? t("common.loading") : t("confirm.send")}
      </button>
    </form>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={<p className="mt-10 text-center">…</p>}>
      <ConfirmInner />
    </Suspense>
  );
}
