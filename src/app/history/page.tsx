"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { TransactionRow } from "@/components/TransactionRow";
import { useI18n } from "@/lib/i18n";
import { loadSession } from "@/lib/session";
import { connect, getPublicKey } from "@/lib/solana/wallet";
import {
  transferDirection,
  type PublicTransfer,
} from "@/lib/transferPublic";

type Filter =
  | "all"
  | "outgoing"
  | "incoming"
  | "delivered"
  | "pending"
  | "failed";

export default function HistoryPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [transfers, setTransfers] = useState<PublicTransfer[]>([]);
  const [phone, setPhone] = useState("");
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const session = loadSession();
    if (!session?.phone) {
      router.replace("/login");
      return;
    }
    setPhone(session.phone);
    setReady(true);
    (async () => {
      try {
        const pk = getPublicKey() ?? (await connect());
        setPubkey(pk);
      } catch {
        setPubkey(null);
      }
      const res = await fetch("/api/transfers");
      const data = await res.json();
      setTransfers(data.transfers ?? []);
    })();
  }, [router]);

  const withDirection = useMemo(() => {
    return transfers.map((tr) => ({
      transfer: tr,
      direction: transferDirection(tr, { phone, pubkey }),
    }));
  }, [transfers, phone, pubkey]);

  const filtered = useMemo(() => {
    return withDirection.filter(({ transfer: tr, direction }) => {
      if (filter === "all") return true;
      if (filter === "outgoing") return direction === "outgoing";
      if (filter === "incoming") return direction === "incoming";
      if (filter === "delivered") return tr.status === "confirmed";
      if (filter === "pending") {
        return tr.status === "prepared" || tr.status === "submitted";
      }
      if (filter === "failed") {
        return tr.status === "failed" || tr.status === "expired";
      }
      return true;
    });
  }, [withDirection, filter]);

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: t("history.filter.all") },
    { id: "outgoing", label: t("history.filter.outgoing") },
    { id: "incoming", label: t("history.filter.incoming") },
    { id: "delivered", label: t("status.delivered") },
    { id: "pending", label: t("status.pending") },
    { id: "failed", label: t("status.failed") },
  ];

  if (!ready) {
    return <p className="mt-10 text-center text-[var(--muted)]">{t("common.loading")}</p>;
  }

  return (
    <div className="space-y-4 pt-2">
      <h1 className="font-display text-3xl tracking-tight">{t("history.title")}</h1>
      <p className="text-sm text-[var(--muted)]">{t("history.subtitle")}</p>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
              filter === f.id
                ? "bg-[var(--accent-deep)] text-white"
                : "bg-black/[0.04] text-[var(--muted)]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-black/10 px-4 py-8 text-center text-[var(--muted)]">
          {filter === "incoming" ? t("history.incoming_empty") : t("history.empty")}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {filtered.map(({ transfer, direction }) => (
            <li key={transfer.id}>
              <TransactionRow transfer={transfer} direction={direction} />
            </li>
          ))}
        </ul>
      )}

      <p className="text-center text-xs text-[var(--muted)]">
        <Link href="/transfers" className="font-medium text-[var(--accent-deep)]">
          {t("history.new_transfer")}
        </Link>
      </p>
    </div>
  );
}
