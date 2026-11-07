"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useI18n } from "@/lib/i18n";
import { loadSession } from "@/lib/session";

export default function SendPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [amount, setAmount] = useState("10000");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (!loadSession()) router.replace("/");
  }, [router]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams({
      amount,
      name,
      phone,
    });
    router.push(`/routes?${params.toString()}`);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 pt-4">
      <h1 className="font-display text-3xl tracking-tight">{t("send.title")}</h1>

      <label className="block space-y-2">
        <span className="text-sm text-[var(--muted)]">{t("send.amount")}</span>
        <div className="relative">
          <input
            className="field pr-16 text-2xl font-semibold"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-[var(--muted)]">
            {t("send.currency")}
          </span>
        </div>
      </label>

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
          placeholder="+996 …"
          required
        />
      </label>

      <p className="rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
        {t("send.simulation_note")}
      </p>

      <button className="btn btn-primary" type="submit">
        {t("send.compare")}
      </button>
    </form>
  );
}
