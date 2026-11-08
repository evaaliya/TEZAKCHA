"use client";

import { useCallback, useEffect, useState } from "react";
import { connect, getPublicKey } from "@/lib/solana/wallet";
import { loadSession } from "@/lib/session";

export function useWalletBalance(refreshKey = 0) {
  const [usdc, setUsdc] = useState<number | null>(null);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const session = loadSession();
    if (!session?.phone) {
      setUsdc(null);
      setPhone("");
      setLoading(false);
      return;
    }
    setPhone(session.phone);
    try {
      const pk = getPublicKey() ?? (await connect());
      const res = await fetch(`/api/setup?sender=${encodeURIComponent(pk)}`);
      if (res.ok) {
        const data = await res.json();
        setUsdc(typeof data.senderUsdc === "number" ? data.senderUsdc : 0);
      } else {
        setUsdc(null);
      }
    } catch {
      setUsdc(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh, refreshKey]);

  return { usdc, phone, loading, refresh };
}
