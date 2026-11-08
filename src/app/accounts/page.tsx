"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DemoBadge } from "@/components/DemoBadge";
import { MethodIcon } from "@/components/Icons";
import { useI18n } from "@/lib/i18n";
import { loadSession } from "@/lib/session";
import { connect, getPublicKey } from "@/lib/solana/wallet";
import { sendHref } from "@/lib/transferMethods";

interface SetupInfo {
  solanaConfigured: boolean;
  feePayerPubkey: string | null;
  feePayerSol: number | null;
  feePayerMinSol: number;
  senderUsdc: number | null;
  demoRecipientSet: boolean;
  demoPhone: string;
  usdcMint: string | null;
  faucetUrl: string;
  diagnosis?: string;
}

export default function AccountsPage() {
  const { t, formatMoney } = useI18n();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [phone, setPhone] = useState("");
  const [networkPubkey, setNetworkPubkey] = useState<string | null>(null);
  const [setup, setSetup] = useState<SetupInfo | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const session = loadSession();
    if (!session?.phone) {
      router.replace("/login");
      return;
    }
    setPhone(session.phone);
    (async () => {
      let pk: string | null = null;
      try {
        pk = getPublicKey() ?? (await connect());
        setNetworkPubkey(pk);
      } catch {
        setNetworkPubkey(null);
      }
      try {
        const q = pk ? `?sender=${encodeURIComponent(pk)}` : "";
        const res = await fetch(`/api/setup${q}`);
        if (res.ok) setSetup((await res.json()) as SetupInfo);
      } catch {
        setSetup(null);
      }
      setReady(true);
    })();
  }, [router]);

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }

  if (!ready) {
    return <p className="mt-10 text-center text-[var(--muted)]">{t("common.loading")}</p>;
  }

  const feeOk =
    setup?.feePayerSol != null &&
    setup.feePayerSol >= (setup.feePayerMinSol ?? 0.05);

  return (
    <div className="space-y-5 pt-1">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl tracking-tight">{t("accounts.title")}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("accounts.subtitle")}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">{phone}</p>
        </div>
        <Link href="/" className="pt-2 text-sm text-[var(--muted)]">
          {t("common.back")}
        </Link>
      </div>

      <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3">
        <p className="text-sm font-semibold text-amber-950">{t("accounts.setup.title")}</p>
        {setup?.diagnosis === "fee_payer_low_sol" && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-800">
            {t("accounts.setup.now_fee_empty")}
          </p>
        )}
        {setup?.diagnosis === "sender_no_usdc" && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-800">
            {t("accounts.setup.now_usdc_empty", {
              usdc: String(setup.senderUsdc ?? 0),
            })}
          </p>
        )}
        {typeof setup?.senderUsdc === "number" && (
          <p className="text-xs text-amber-900">
            {t("accounts.setup.your_usdc", { usdc: setup.senderUsdc.toFixed(2) })}
          </p>
        )}
        <ol className="list-decimal space-y-3 pl-4 text-xs leading-snug text-amber-950">
          <li>
            <span className="font-medium">{t("accounts.setup.step1_title")}</span>
            <p className="mt-1 text-amber-900/90">{t("accounts.setup.step1_body")}</p>
            {setup?.feePayerPubkey && (
              <div className="mt-2 rounded-xl bg-white/80 p-2">
                <p className="font-mono text-[10px] break-all">{setup.feePayerPubkey}</p>
                <button
                  type="button"
                  className="mt-1 text-[11px] font-semibold text-[var(--accent-deep)]"
                  onClick={() => copy("fee", setup.feePayerPubkey!)}
                >
                  {copied === "fee" ? t("accounts.copied") : t("accounts.copy_fee_payer")}
                </button>
                <p className="mt-1 text-[11px]">
                  {feeOk
                    ? t("accounts.setup.fee_ok", {
                        sol: setup.feePayerSol?.toFixed(3) ?? "?",
                      })
                    : t("accounts.setup.fee_need")}
                </p>
                <a
                  href={setup.faucetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-[11px] font-semibold text-[var(--accent-deep)] underline"
                >
                  {t("accounts.setup.open_faucet")}
                </a>
              </div>
            )}
          </li>
          <li>
            <span className="font-medium">{t("accounts.setup.step2_title")}</span>
            <p className="mt-1 text-amber-900/90">{t("accounts.setup.step2_body")}</p>
          </li>
          <li>
            <span className="font-medium">{t("accounts.setup.step3_title")}</span>
            <p className="mt-1 text-amber-900/90">
              {t("accounts.setup.step3_body", { phone: setup?.demoPhone ?? "+996700112233" })}
            </p>
          </li>
        </ol>
      </section>

      {networkPubkey && (
        <section className="rounded-2xl border border-black/5 bg-white p-3.5">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--mint-soft)] text-[var(--accent-deep)]">
              <MethodIcon name="chain" className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t("accounts.wallet.network")}</p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {t("accounts.wallet.network_detail")}
              </p>
              <p className="mt-2 break-all font-mono text-[11px] text-[var(--ink)]">
                {networkPubkey}
              </p>
              <button
                type="button"
                className="mt-2 text-xs font-semibold text-[var(--accent-deep)]"
                onClick={() => copy("sender", networkPubkey)}
              >
                {copied === "sender" ? t("accounts.copied") : t("accounts.copy")}
              </button>
              <p className="mt-2 text-[11px] leading-snug text-[var(--muted)]">
                {t("accounts.fund_hint")}
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="space-y-2.5">
        <div className="flex items-center gap-3 rounded-2xl border border-black/5 bg-white p-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--mint-soft)] text-[var(--accent-deep)]">
            <MethodIcon name="swap" className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="font-medium">{t("accounts.tez.title")}</span>
              <DemoBadge />
            </span>
            <span className="mt-0.5 block text-xs text-[var(--muted)]">
              {t("accounts.tez.detail")}
            </span>
          </span>
          <span className="shrink-0 text-right text-sm font-semibold">
            {formatMoney("12450", "KGS")}
          </span>
        </div>
      </section>

      <p className="text-xs text-[var(--muted)]">{t("accounts.note")}</p>

      <Link href={sendHref("smart")} className="btn btn-primary block text-center">
        {t("accounts.send_cta")}
      </Link>
    </div>
  );
}
