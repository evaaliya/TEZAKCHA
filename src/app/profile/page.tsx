"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n, type Locale } from "@/lib/i18n";
import { clearSession, loadSession } from "@/lib/session";
import { connect, getPublicKey } from "@/lib/solana/wallet";

export default function ProfilePage() {
  const { t, locale, setLocale, formatMoney } = useI18n();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [balanceRub, setBalanceRub] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const locales: Locale[] = ["ru", "ky", "en"];

  useEffect(() => {
    const session = loadSession();
    if (!session?.phone) {
      router.replace("/login");
      return;
    }
    setPhone(session.phone);
    setEmail(session.email ?? "");
    setReady(true);
    (async () => {
      try {
        const pk = getPublicKey() ?? (await connect());
        const [setupRes, ratesRes] = await Promise.all([
          fetch(`/api/setup?sender=${encodeURIComponent(pk)}`),
          fetch("/api/rates"),
        ]);
        if (!setupRes.ok) {
          setBalanceRub(null);
          return;
        }
        const setup = await setupRes.json();
        const usdc = typeof setup.senderUsdc === "number" ? setup.senderUsdc : null;
        let rubPerUsdc: number | null = null;
        if (ratesRes.ok) {
          const rates = await ratesRes.json();
          const rubUsdc = Number(rates.mid_rates?.RUB_USDC);
          if (rubUsdc > 0) rubPerUsdc = 1 / rubUsdc;
        }
        if (usdc != null && rubPerUsdc != null) {
          setBalanceRub(formatMoney((usdc * rubPerUsdc).toFixed(2), "RUB"));
        } else {
          setBalanceRub(null);
        }
      } catch {
        setBalanceRub(null);
      }
    })();
  }, [router, formatMoney]);

  function logout() {
    clearSession();
    router.replace("/login");
  }

  if (!ready) {
    return <p className="mt-10 text-center text-[var(--muted)]">{t("common.loading")}</p>;
  }

  return (
    <div className="space-y-5 pt-1">
      <div>
        <h1 className="font-display text-3xl tracking-tight">{t("profile.title")}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("profile.subtitle")}</p>
      </div>

      <section className="rounded-2xl border border-black/5 bg-white p-4">
        <p className="text-xs text-[var(--muted)]">{t("profile.phone")}</p>
        <p className="mt-1 text-lg font-semibold">{phone}</p>
        {email ? (
          <>
            <p className="mt-3 text-xs text-[var(--muted)]">{t("login.email_optional")}</p>
            <p className="mt-0.5 text-sm">{email}</p>
          </>
        ) : null}
      </section>

      <section className="rounded-2xl border border-[var(--accent)]/25 bg-[var(--mint-soft)] p-4">
        <p className="text-xs font-medium text-[var(--accent-deep)]">
          {t("balance.label")}
        </p>
        <p className="mt-2 text-sm leading-snug text-[var(--ink)]">
          {balanceRub == null
            ? "…"
            : t("profile.credit", { phone, amount: balanceRub })}
        </p>
        <p className="mt-2 text-xs text-[var(--muted)]">
          {t("profile.balance_note")} · {t("status.estimate")}
        </p>
        <Link
          href="/accounts"
          className="mt-3 inline-block text-sm font-semibold text-[var(--accent-deep)]"
        >
          {t("profile.open_accounts")} →
        </Link>
      </section>

      <section className="rounded-2xl border border-black/5 bg-white p-4">
        <h2 className="text-sm font-semibold">{t("profile.language")}</h2>
        <div className="mt-3 flex gap-2">
          {locales.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLocale(l)}
              className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-medium ${
                locale === l
                  ? "bg-[var(--accent-deep)] text-white"
                  : "bg-black/[0.04] text-[var(--muted)]"
              }`}
            >
              {t(`lang.${l}`)}
            </button>
          ))}
        </div>
      </section>

      <button type="button" className="btn btn-ghost" onClick={logout}>
        {t("profile.logout")}
      </button>
    </div>
  );
}
