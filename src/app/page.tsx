"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useI18n } from "@/lib/i18n";
import { loadSession, saveSession } from "@/lib/session";

export default function HomePage() {
  const { t } = useI18n();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const session = loadSession();
    if (session?.phone) {
      router.replace("/send");
      return;
    }
    setReady(true);
  }, [router]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const cleaned = phone.trim();
    if (cleaned.length < 8) return;
    saveSession({ phone: cleaned });
    router.push("/send");
  }

  if (!ready) {
    return <p className="mt-10 text-center text-[var(--muted)]">{t("common.loading")}</p>;
  }

  return (
    <div className="flex flex-1 flex-col justify-between gap-8 pt-8">
      <div>
        <p className="font-display text-4xl leading-tight tracking-tight">{t("brand")}</p>
        <p className="mt-3 max-w-[18rem] text-lg text-[var(--muted)]">{t("tagline")}</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 pb-4">
        <div>
          <h1 className="text-xl font-semibold">{t("login.title")}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{t("login.subtitle")}</p>
        </div>
        <label className="block space-y-2">
          <span className="text-sm text-[var(--muted)]">{t("login.phone")}</span>
          <input
            className="field"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+996 700 000 000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </label>
        <button className="btn btn-primary" type="submit">
          {t("login.continue")}
        </button>
        <p className="text-center text-xs text-[var(--muted)]">{t("login.hint")}</p>
      </form>
    </div>
  );
}
