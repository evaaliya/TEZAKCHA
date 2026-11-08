"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BalanceChip } from "@/components/BalanceChip";
import { MethodIcon } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";
import { loadSession } from "@/lib/session";
import { sendHref, TRANSFER_METHODS } from "@/lib/transferMethods";

export default function TransfersPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!loadSession()) {
      router.replace("/login");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) {
    return <p className="mt-10 text-center text-[var(--muted)]">{t("common.loading")}</p>;
  }

  const accounts = TRANSFER_METHODS.filter((m) => m.group === "accounts");
  const international = TRANSFER_METHODS.filter((m) => m.group === "international");

  return (
    <div className="space-y-5 pt-1">
      <div>
        <h1 className="font-display text-3xl tracking-tight">{t("transfers.title")}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("transfers.subtitle")}</p>
      </div>

      <BalanceChip />

      <Link href={sendHref("smart")} className="smart-card block">
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--accent-deep)]">
          <MethodIcon name="spark" className="h-4 w-4" />
          {t("home.smart.title")}
        </p>
        <p className="mt-1 text-sm text-[var(--muted)]">{t("home.smart.subtitle")}</p>
        <p className="mt-3 text-xs font-medium text-[var(--accent-deep)]">{t("transfers.open_smart")}</p>
      </Link>

      {accounts.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="text-sm font-semibold">{t("transfers.group.accounts")}</h2>
          {accounts.map((method) => (
            <Link
              key={method.id}
              href={sendHref(method.id)}
              className="flex items-center gap-3 rounded-2xl border border-black/5 bg-white p-3.5 transition hover:border-[var(--accent)]/30"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--mint-soft)] text-[var(--accent-deep)]">
                <MethodIcon name={method.icon} className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{t(method.labelKey)}</span>
                <span className="mt-0.5 block text-xs text-[var(--muted)]">
                  {t("accounts.list_hint")}
                </span>
              </span>
            </Link>
          ))}
        </section>
      )}

      <section className="space-y-2.5">
        <h2 className="text-sm font-semibold">{t("transfers.group.international")}</h2>
        {international.map((method) => (
          <Link
            key={method.id}
            href={sendHref(method.id)}
            className="flex items-center gap-3 rounded-2xl border border-black/5 bg-white p-3.5 transition hover:border-[var(--accent)]/30"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--mint-soft)] text-[var(--accent-deep)]">
              <MethodIcon name={method.icon} className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{t(method.labelKey)}</span>
              <span className="mt-0.5 block text-xs text-[var(--muted)]">
                {t("transfers.live_hint")}
              </span>
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}
