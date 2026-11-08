"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useI18n, type Locale } from "@/lib/i18n";
import { registerSessionRecipient } from "@/lib/registerRecipient";
import { loadSession, saveSession } from "@/lib/session";
import { validatePhone } from "@/lib/validation";

function isValidEmail(value: string): boolean {
  if (!value.trim()) return true; // optional
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function LoginPage() {
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const locales: Locale[] = ["ru", "ky", "en"];

  useEffect(() => {
    if (loadSession()?.phone) {
      router.replace("/");
      return;
    }
    setReady(true);
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const phoneCheck = validatePhone(phone);
    if (!phoneCheck.ok) {
      setError(t("errors.phone_invalid"));
      return;
    }
    const emailTrim = email.trim().toLowerCase();
    if (!isValidEmail(emailTrim)) {
      setError(t("errors.email_invalid"));
      return;
    }

    setLoading(true);
    try {
      saveSession({
        phone: phoneCheck.value,
        email: emailTrim || undefined,
      });
      // Bind phone → embedded wallet. Non-fatal on serverless (read-only FS).
      try {
        await registerSessionRecipient(phoneCheck.value);
      } catch {
        /* send still works via DEMO_RECIPIENT / later re-register on home */
      }
      router.push("/");
    } catch {
      setError(t("common.error"));
      setLoading(false);
    }
  }

  if (!ready) {
    return <p className="mt-10 text-center text-[var(--muted)]">{t("common.loading")}</p>;
  }

  return (
    <div className="flex flex-1 flex-col justify-between gap-8 pt-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-4xl leading-tight tracking-tight">{t("brand")}</p>
          <p className="mt-3 max-w-[18rem] text-lg text-[var(--muted)]">{t("tagline")}</p>
        </div>
        <div className="flex gap-1 rounded-full bg-black/[0.04] p-1 text-xs font-medium">
          {locales.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLocale(l)}
              className={`rounded-full px-2.5 py-1 ${
                locale === l ? "bg-white text-[var(--ink)] shadow-sm" : "text-[var(--muted)]"
              }`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
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
        <label className="block space-y-2">
          <span className="text-sm text-[var(--muted)]">{t("login.email_optional")}</span>
          <input
            className="field"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? t("common.loading") : t("login.continue")}
        </button>
        <p className="text-center text-xs text-[var(--muted)]">{t("login.hint")}</p>
      </form>
    </div>
  );
}
