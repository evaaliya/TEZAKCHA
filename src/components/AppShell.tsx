"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n, type Locale } from "@/lib/i18n";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t, locale, setLocale } = useI18n();
  const pathname = usePathname();

  const locales: Locale[] = ["ru", "ky", "en"];

  return (
    <div className="shell">
      <div className="phone">
        <header className="relative z-10 flex items-center justify-between px-5 pb-2 pt-5">
          <Link href="/" className="font-display text-2xl tracking-tight text-[var(--ink)]">
            {t("brand")}
          </Link>
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
        </header>

        <main className="relative z-10 flex flex-1 flex-col px-5 pb-24 pt-2">{children}</main>

        <nav className="absolute bottom-0 left-0 right-0 z-20 border-t border-black/5 bg-white/90 px-4 py-3 backdrop-blur">
          <div className="grid grid-cols-3 gap-2 text-center text-sm font-medium">
            <Link
              href="/"
              className={pathname === "/" ? "text-[var(--accent-deep)]" : "text-[var(--muted)]"}
            >
              {t("nav.home")}
            </Link>
            <Link
              href="/send"
              className={pathname.startsWith("/send") || pathname.startsWith("/routes") || pathname.startsWith("/confirm")
                ? "text-[var(--accent-deep)]"
                : "text-[var(--muted)]"}
            >
              {t("nav.send")}
            </Link>
            <Link
              href="/history"
              className={pathname.startsWith("/history") ? "text-[var(--accent-deep)]" : "text-[var(--muted)]"}
            >
              {t("nav.history")}
            </Link>
          </div>
        </nav>
      </div>
    </div>
  );
}
