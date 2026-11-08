"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { BalanceChip } from "@/components/BalanceChip";
import { useI18n } from "@/lib/i18n";
import type { SerializedRoute } from "@/lib/engine";
import {
  connect,
  signTransaction,
  txFromBase64,
  txToBase64,
  WalletError,
} from "@/lib/solana/wallet";

function ConfirmInner() {
  const { t, formatMoney } = useI18n();
  const params = useSearchParams();
  const router = useRouter();
  const amount = params.get("amount") ?? "0";
  const name = params.get("name") ?? "";
  const phone = params.get("phone") ?? "";
  const routeId = params.get("route") ?? "solana_usdc";
  const ratesVersion = params.get("rates_version") ?? "";
  const receiveParam = params.get("receive") ?? "";
  const method = params.get("method") ?? "smart";
  const from = params.get("from") === "KGS" ? "KGS" : "RUB";
  const to = params.get("to") === "RUB" ? "RUB" : from === "KGS" ? "RUB" : "KGS";

  const [route, setRoute] = useState<SerializedRoute | null>(null);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_send: amount, from, to }),
      });
      const data = await res.json();
      const found = (data.routes as SerializedRoute[]).find((r) => r.route_id === routeId);
      setRoute(found ?? null);
    })();
  }, [amount, routeId, from, to]);

  const amountReceive = receiveParam || route?.amount_receive || "";

  function localizeApiError(code: string | undefined, fallback?: string): string {
    if (code) {
      const key = `errors.${code}`;
      const localized = t(key);
      if (localized !== key) return localized;
    }
    if (fallback) {
      const key = `errors.${fallback}`;
      const localized = t(key);
      if (localized !== key) return localized;
    }
    return t("common.error");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const senderPubkey = await connect();
      const idempotencyKey =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `idem_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      const prepareRes = await fetch("/api/send/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender_pubkey: senderPubkey,
          recipient: phone,
          route_id: routeId,
          amount_send: amount,
          expected_amount_receive: amountReceive,
          idempotency_key: idempotencyKey,
          recipient_name: name,
          from,
          to,
          rates_version: ratesVersion,
          pin,
        }),
      });
      const prepareData = await prepareRes.json();
      if (!prepareRes.ok) {
        setError(localizeApiError(prepareData.code, prepareData.error));
        setLoading(false);
        return;
      }

      const unsigned = txFromBase64(prepareData.tx_base64 as string);
      const signed = (await signTransaction(unsigned)) as ReturnType<typeof txFromBase64>;
      const signedTxBase64 = txToBase64(signed);

      const submitRes = await fetch("/api/send/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prepare_id: prepareData.prepare_id,
          signed_tx_base64: signedTxBase64,
        }),
      });
      const submitData = await submitRes.json();
      if (!submitRes.ok || !submitData.transfer?.id) {
        setError(localizeApiError(submitData.code, submitData.error));
        setLoading(false);
        return;
      }

      router.push(`/status/${submitData.transfer.id}`);
    } catch (err) {
      if (err instanceof WalletError) {
        setError(localizeApiError(err.code));
      } else {
        setError(t("common.error"));
      }
      setLoading(false);
    }
  }

  function formatEta(minutes: number) {
    if (minutes >= 60) return t("routes.hours", { n: Math.round(minutes / 60) });
    return t("routes.minutes", { n: minutes });
  }

  const backRoutes = `/routes?amount=${amount}&name=${encodeURIComponent(name)}&phone=${encodeURIComponent(phone)}&method=${method}&from=${from}&to=${to}`;

  return (
    <form onSubmit={onSubmit} className="space-y-5 pt-2">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl tracking-tight">{t("confirm.title")}</h1>
        <Link href={backRoutes} className="text-sm text-[var(--muted)]">
          {t("common.back")}
        </Link>
      </div>

      <BalanceChip />

      <div className="rounded-2xl bg-white p-4 shadow-soft">
        <p className="text-sm text-[var(--muted)]">{t("confirm.you_send")}</p>
        <p className="text-2xl font-semibold">{formatMoney(amount, from)}</p>
        <div className="my-3 h-px bg-black/5" />
        <p className="text-sm text-[var(--muted)]">{t("confirm.they_get")}</p>
        <p className="text-2xl font-semibold text-[var(--accent-deep)]">
          {amountReceive ? formatMoney(amountReceive, to) : "—"}
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
