"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { BalanceChip } from "@/components/BalanceChip";
import { IconContact, MethodIcon } from "@/components/Icons";
import { TransactionRow } from "@/components/TransactionRow";
import { POPULAR_DESTINATIONS } from "@/lib/demoData";
import {
  formatReferenceLine,
  formatUpdatedClock,
} from "@/lib/format/referenceLine";
import { useI18n } from "@/lib/i18n";
import type { RatesSourceKind, ReferenceRate } from "@/lib/engine";
import { registerSessionRecipient } from "@/lib/registerRecipient";
import { loadSession } from "@/lib/session";
import { connect, getPublicKey } from "@/lib/solana/wallet";
import {
  transferDirection,
  type PublicTransfer,
} from "@/lib/transferPublic";
import { getMethod, HOME_QUICK_METHODS, sendHref } from "@/lib/transferMethods";

export default function HomePage() {
  const { t } = useI18n();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [greetingName, setGreetingName] = useState("");
  const [phone, setPhone] = useState("");
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [transfers, setTransfers] = useState<PublicTransfer[]>([]);
  const [referenceRates, setReferenceRates] = useState<ReferenceRate[]>([]);
  const [ratesSource, setRatesSource] = useState<RatesSourceKind | "">("");
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState("");

  useEffect(() => {
    const session = loadSession();
    if (!session?.phone) {
      router.replace("/login");
      return;
    }
    setGreetingName(session.name || t("home.guest"));
    setPhone(session.phone);
    setReady(true);
    (async () => {
      try {
        await registerSessionRecipient(session.phone);
      } catch {
        /* non-fatal: send still works via DEMO_RECIPIENT */
      }
      try {
        const pk = getPublicKey() ?? (await connect());
        setPubkey(pk);
      } catch {
        setPubkey(null);
      }
      try {
        const [trRes, ratesRes] = await Promise.all([
          fetch("/api/transfers"),
          fetch("/api/rates"),
        ]);
        const trData = await trRes.json();
        setTransfers((trData.transfers as PublicTransfer[]) ?? []);
        if (ratesRes.ok) {
          const ratesData = await ratesRes.json();
          setReferenceRates(ratesData.reference_rates ?? []);
          setRatesSource(ratesData.rates_source ?? "");
          setRatesUpdatedAt(ratesData.rates_updated_at ?? "");
        }
      } catch {
        setTransfers([]);
      }
    })();
  }, [router, t]);

  function onSmartSubmit(e: FormEvent) {
    e.preventDefault();
    const value = recipient.trim();
    if (!value) {
      router.push(sendHref("smart"));
      return;
    }
    router.push(sendHref("smart", { phone: value }));
  }

  if (!ready) {
    return <p className="mt-10 text-center text-[var(--muted)]">{t("common.loading")}</p>;
  }

  const recent = transfers.slice(0, 4);
  const clock = formatUpdatedClock(ratesUpdatedAt);
  const ratesLine =
    referenceRates.length > 0
      ? formatReferenceLine(referenceRates, t, t("rates.fx_note"), {
          updatedLabel: clock ? t("rates.updated", { time: clock }) : undefined,
          snapshotLabel:
            ratesSource === "snapshot" || ratesSource === "live_stale"
              ? t("rates.snapshot")
              : undefined,
        })
      : "";

  return (
    <div className="space-y-6 pt-1">
      <div>
        <p className="text-sm text-[var(--muted)]">{t("home.greeting", { name: greetingName })}</p>
        <h1 className="mt-1 font-display text-[1.7rem] leading-tight tracking-tight">
          {t("home.title")}
        </h1>
      </div>

      <BalanceChip />

      {ratesLine && (
        <section className="rounded-2xl border border-black/5 bg-white px-3.5 py-3">
          <p className="text-xs font-semibold text-[var(--accent-deep)]">{t("home.rates.title")}</p>
          <p className="mt-1 text-[11px] leading-snug text-[var(--muted)]">{ratesLine}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link
              href={sendHref("smart", { from: "RUB", to: "KGS" })}
              className="rounded-lg bg-[var(--mint-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent-deep)]"
            >
              RUB → KGS
            </Link>
            <Link
              href={sendHref("smart", { from: "KGS", to: "RUB" })}
              className="rounded-lg bg-[var(--mint-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent-deep)]"
            >
              KGS → RUB
            </Link>
          </div>
        </section>
      )}

      <section className="smart-card">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-[var(--accent-deep)]">
              <MethodIcon name="spark" className="h-4 w-4" />
              {t("home.smart.title")}
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">{t("home.smart.subtitle")}</p>
          </div>
        </div>
        <p className="mt-3 text-xs font-medium text-[var(--accent-deep)]">{t("home.smart.hint")}</p>
        <form onSubmit={onSmartSubmit} className="mt-3 space-y-3">
          <div className="relative">
            <input
              className="field pr-12"
              inputMode="tel"
              placeholder={t("home.smart.placeholder")}
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-[var(--accent-deep)]"
              aria-label={t("home.smart.contacts")}
              onClick={() => {
                const first = POPULAR_DESTINATIONS[0];
                setRecipient(first.phone);
              }}
            >
              <IconContact className="h-5 w-5" />
            </button>
          </div>
          <button className="btn btn-primary" type="submit">
            {t("home.smart.cta")}
          </button>
        </form>
      </section>

      <Link
        href="/accounts"
        className="flex items-center justify-between rounded-2xl border border-[var(--accent)]/30 bg-[var(--mint-soft)] px-4 py-3.5"
      >
        <span>
          <span className="block text-sm font-semibold text-[var(--accent-deep)]">
            {t("method.own_accounts")}
          </span>
          <span className="mt-0.5 block text-xs text-[var(--muted)]">
            {t("accounts.list_hint")}
          </span>
        </span>
        <span className="text-sm font-semibold text-[var(--accent-deep)]">→</span>
      </Link>

      <section>
        <h2 className="text-sm font-semibold text-[var(--ink)]">{t("home.quick.title")}</h2>
        <div className="mt-3 grid grid-cols-3 gap-2.5">
          {HOME_QUICK_METHODS.map((id) => {
            const method = getMethod(id);
            if (!method) return null;
            return (
              <Link
                key={id}
                href={sendHref(id)}
                className="quick-tile flex min-h-[92px] flex-col items-start justify-between gap-2 p-3"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--mint-soft)] text-[var(--accent-deep)]">
                  <MethodIcon name={method.icon} className="h-4 w-4" />
                </span>
                <span className="text-left text-[11px] font-medium leading-snug">
                  {t(method.labelKey)}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{t("home.recent.title")}</h2>
          <Link href="/history" className="text-xs font-medium text-[var(--accent-deep)]">
            {t("home.recent.all")}
          </Link>
        </div>
        <div className="mt-3 space-y-2.5">
          {recent.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-black/10 px-4 py-5 text-sm text-[var(--muted)]">
              {t("home.recent.empty")}
            </p>
          ) : (
            recent.map((tr) => (
              <TransactionRow
                key={tr.id}
                transfer={tr}
                direction={transferDirection(tr, { phone, pubkey })}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}
