"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { BalanceChip } from "@/components/BalanceChip";
import { useI18n } from "@/lib/i18n";
import { loadSession } from "@/lib/session";
import { getMethod, LIVE_SEND_METHODS } from "@/lib/transferMethods";

type Fiat = "RUB" | "KGS";

function SendInner() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const methodParam = params.get("method") ?? "smart";
  const method = getMethod(methodParam) ?? getMethod("smart")!;
  const isLive = LIVE_SEND_METHODS.has(method.id) || method.support === "live";

  const initialFrom = (params.get("from") === "KGS" ? "KGS" : "RUB") as Fiat;
  const initialTo = (params.get("to") === "RUB" ? "RUB" : "KGS") as Fiat;

  const [amount, setAmount] = useState("10000");
  const [from, setFrom] = useState<Fiat>(initialFrom);
  const [to, setTo] = useState<Fiat>(
    initialFrom === initialTo ? (initialFrom === "RUB" ? "KGS" : "RUB") : initialTo,
  );
  const [name, setName] = useState(params.get("name") ?? "");
  const [phone, setPhone] = useState(params.get("phone") ?? "");

  useEffect(() => {
    if (!loadSession()) router.replace("/login");
  }, [router]);

  const title = useMemo(() => {
    if (method.id === "smart") return t("send.title_smart");
    return t(method.labelKey);
  }, [method, t]);

  function swapCurrencies() {
    setFrom(to);
    setTo(from);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isLive) return;
    if (from === to) return;
    const q = new URLSearchParams({
      amount,
      name,
      phone,
      method: method.sendMethod,
      from,
      to,
    });
    router.push(`/routes?${q.toString()}`);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 pt-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("send.live_subtitle")}</p>
        </div>
        <Link href="/" className="pt-2 text-sm text-[var(--muted)]">
          {t("common.back")}
        </Link>
      </div>

      <BalanceChip />

      <label className="block space-y-2">
        <span className="text-sm text-[var(--muted)]">{t("send.amount")}</span>
        <div className="relative">
          <input
            className="field pr-20 text-2xl font-semibold"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[var(--ink)]">
            {from}
          </span>
        </div>
      </label>

      <div className="flex items-center gap-2">
        <label className="block flex-1 space-y-2">
          <span className="text-sm text-[var(--muted)]">{t("send.from_currency")}</span>
          <select
            className="field"
            value={from}
            onChange={(e) => {
              const next = e.target.value as Fiat;
              setFrom(next);
              if (next === to) setTo(next === "RUB" ? "KGS" : "RUB");
            }}
          >
            <option value="RUB">RUB</option>
            <option value="KGS">KGS</option>
          </select>
        </label>
        <button
          type="button"
          className="mt-7 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--mint-soft)] text-[var(--accent-deep)]"
          onClick={swapCurrencies}
          aria-label={t("send.swap")}
        >
          ⇄
        </button>
        <label className="block flex-1 space-y-2">
          <span className="text-sm text-[var(--muted)]">{t("send.to_currency")}</span>
          <select
            className="field"
            value={to}
            onChange={(e) => {
              const next = e.target.value as Fiat;
              setTo(next);
              if (next === from) setFrom(next === "RUB" ? "KGS" : "RUB");
            }}
          >
            <option value="KGS">KGS</option>
            <option value="RUB">RUB</option>
          </select>
        </label>
      </div>

      <label className="block space-y-2">
        <span className="text-sm text-[var(--muted)]">{t("send.recipient_name")}</span>
        <input
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Aigul"
          required
        />
      </label>

      <label className="block space-y-2">
        <span className="text-sm text-[var(--muted)]">{t("send.recipient_phone")}</span>
        <input
          className="field"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={to === "KGS" ? "+996 …" : "+7 …"}
          required
        />
      </label>

      <p className="text-xs text-[var(--muted)]">{t("send.smart_note")}</p>

      <p className="rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
        {t("send.simulation_note")}
      </p>

      <button className="btn btn-primary" type="submit">
        {t("send.compare")}
      </button>
    </form>
  );
}

export default function SendPage() {
  return (
    <Suspense fallback={<p className="mt-10 text-center text-[var(--muted)]">…</p>}>
      <SendInner />
    </Suspense>
  );
}
