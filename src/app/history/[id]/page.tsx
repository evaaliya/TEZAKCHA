"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ExplorerLink } from "@/components/ExplorerLink";
import { useI18n } from "@/lib/i18n";
import { loadSession } from "@/lib/session";
import { connect, getPublicKey } from "@/lib/solana/wallet";
import {
  transferDirection,
  type PublicTransfer,
} from "@/lib/transferPublic";
import { sendHref } from "@/lib/transferMethods";
import { statusI18nKey, statusToneClass } from "@/lib/transferStatus";

function routeLabel(routeId: string, t: (k: string) => string) {
  if (routeId.startsWith("solana")) return t("routes.solana");
  if (routeId === "bank_wire") return t("routes.bank");
  if (routeId === "legacy_transfer") return t("routes.legacy");
  return routeId;
}

export default function HistoryDetailPage() {
  const { t, formatMoney, locale } = useI18n();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [transfer, setTransfer] = useState<PublicTransfer | null>(null);
  const [direction, setDirection] = useState<"incoming" | "outgoing" | "other">(
    "outgoing",
  );
  const [error, setError] = useState("");

  useEffect(() => {
    const session = loadSession();
    if (!session?.phone) {
      router.replace("/login");
      return;
    }
    (async () => {
      let pubkey: string | null = null;
      try {
        pubkey = getPublicKey() ?? (await connect());
      } catch {
        pubkey = null;
      }
      const res = await fetch(`/api/transfers?id=${params.id}`);
      const data = await res.json();
      if (!res.ok) {
        setError(t("common.error"));
        return;
      }
      const tr = data.transfer as PublicTransfer;
      setTransfer(tr);
      setDirection(transferDirection(tr, { phone: session.phone, pubkey }));
    })();
  }, [params.id, router, t]);

  if (error) return <p className="mt-10 text-red-700">{error}</p>;
  if (!transfer) {
    return <p className="mt-10 text-center text-[var(--muted)]">{t("common.loading")}</p>;
  }

  const localeTag = locale === "ky" ? "ky-KG" : locale === "ru" ? "ru-RU" : "en-US";
  const statusLabel = t(statusI18nKey(transfer.status));

  return (
    <div className="space-y-5 pt-2">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl tracking-tight">{t("history.detail.title")}</h1>
        <Link href="/history" className="text-sm text-[var(--muted)]">
          {t("common.back")}
        </Link>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-soft">
        <p
          className={`text-sm font-semibold uppercase tracking-wide ${statusToneClass(transfer.status)}`}
        >
          {statusLabel}
          {" · "}
          {direction === "incoming"
            ? t("history.filter.incoming")
            : t("history.filter.outgoing")}
        </p>
        <p className="mt-3 text-3xl font-semibold">
          {direction === "incoming" ? "+" : ""}
          {formatMoney(transfer.amountReceive, transfer.toCurrency)}
        </p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {direction === "incoming"
            ? t("history.incoming_title")
            : t("history.detail.received")}
          {" · "}
          {t("status.estimate")}
        </p>

        <div className="mt-4 space-y-2.5 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-[var(--muted)]">{t("history.detail.recipient")}</span>
            <span className="text-right font-medium">
              {transfer.recipientName}
              <br />
              <span className="font-normal text-[var(--muted)]">{transfer.recipientPhone}</span>
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-[var(--muted)]">{t("history.detail.sent")}</span>
            <span className="font-medium">
              {formatMoney(transfer.amountSend, transfer.fromCurrency)}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-[var(--muted)]">{t("history.detail.route")}</span>
            <span className="font-medium">{routeLabel(transfer.routeId, t)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-[var(--muted)]">{t("history.detail.date")}</span>
            <span className="font-medium">
              {new Date(transfer.createdAt).toLocaleString(localeTag)}
            </span>
          </div>
        </div>
      </div>

      <ExplorerLink url={transfer.explorerUrl} />

      <Link
        href={sendHref("smart", {
          name: transfer.recipientName,
          phone: transfer.recipientPhone,
        })}
        className="btn btn-primary"
      >
        {t("history.detail.repeat")}
      </Link>
      <Link href={`/status/${transfer.id}`} className="btn btn-ghost">
        {t("history.detail.status")}
      </Link>
    </div>
  );
}
