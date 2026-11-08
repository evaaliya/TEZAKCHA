"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { loadSession } from "@/lib/session";
import { connect, getPublicKey } from "@/lib/solana/wallet";
import {
  transferDirection,
  type PublicTransfer,
} from "@/lib/transferPublic";

const SEEN_KEY = "tezakcha_seen_incoming";
const POLL_MS = 4000;

function loadSeen(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveSeen(ids: Set<string>) {
  sessionStorage.setItem(SEEN_KEY, JSON.stringify([...ids]));
}

export function IncomingToast() {
  const { t, formatMoney } = useI18n();
  const [toast, setToast] = useState<{
    id: string;
    amountReceive: string;
    toCurrency: string;
  } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const primed = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const session = loadSession();
      if (!session?.phone) return;

      let pubkey: string | null = null;
      try {
        pubkey = getPublicKey() ?? (await connect());
      } catch {
        pubkey = null;
      }

      try {
        const res = await fetch("/api/transfers");
        if (!res.ok) return;
        const data = await res.json();
        const transfers = (data.transfers ?? []) as PublicTransfer[];
        const seen = loadSeen();

        // First poll: mark existing as seen so reload doesn't spam toasts.
        if (!primed.current) {
          for (const tr of transfers) {
            if (
              transferDirection(tr, { phone: session.phone, pubkey }) ===
              "incoming"
            ) {
              seen.add(tr.id);
            }
          }
          saveSeen(seen);
          primed.current = true;
          return;
        }

        const fresh = transfers.filter((tr) => {
          if (seen.has(tr.id)) return false;
          if (tr.status !== "confirmed" && tr.status !== "submitted") {
            return false;
          }
          return (
            transferDirection(tr, { phone: session.phone, pubkey }) ===
            "incoming"
          );
        });

        if (fresh.length === 0 || cancelled) return;

        const newest = fresh[0];
        for (const tr of fresh) seen.add(tr.id);
        saveSeen(seen);

        if (hideTimer.current) clearTimeout(hideTimer.current);
        setToast({
          id: newest.id,
          amountReceive: newest.amountReceive,
          toCurrency: newest.toCurrency,
        });
        hideTimer.current = setTimeout(() => setToast(null), 6500);
      } catch {
        /* ignore poll errors */
      }
    }

    void poll();
    const interval = setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  if (!toast) return null;

  const amountLabel = formatMoney(toast.amountReceive, toast.toCurrency);

  return (
    <div
      className="incoming-toast absolute left-3 right-3 top-3 z-50"
      role="status"
    >
      <div className="rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent-deep)] px-4 py-3 text-white shadow-lg">
        <p className="text-xs font-medium uppercase tracking-wide text-white/80">
          {t("notify.incoming_title")}
        </p>
        <p className="mt-0.5 text-sm font-semibold">
          {t("notify.incoming_body", { amount: amountLabel })}
        </p>
      </div>
    </div>
  );
}
