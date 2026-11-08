"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BalanceChip } from "@/components/BalanceChip";
import { IconHistory, IconHome, IconProfile, IconTransfers } from "@/components/Icons";
import { IncomingToast } from "@/components/IncomingToast";
import { useI18n, type Locale } from "@/lib/i18n";

const FLOW_HIDE_NAV = ["/login"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t, locale, setLocale } = useI18n();
  const pathname = usePathname();
  const locales: Locale[] = ["ru", "ky", "en"];

  const hideChrome = FLOW_HIDE_NAV.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const showBalanceChip = !hideChrome;
  const showLangSwitch = !hideChrome;

  const transferActive =
    pathname.startsWith("/transfers") ||
    pathname.startsWith("/send") ||
    pathname.startsWith("/routes") ||
    pathname.startsWith("/confirm");

  const navItems = [
    { href: "/", label: t("nav.home"), icon: IconHome, active: pathname === "/" },
    {
      href: "/transfers",
      label: t("nav.transfers"),
      icon: IconTransfers,
      active: transferActive,
    },
    {
      href: "/history",
      label: t("nav.history"),
      icon: IconHistory,
      active: pathname.startsWith("/history") || pathname.startsWith("/status"),
    },
    {
      href: "/profile",
      label: t("nav.profile"),
      icon: IconProfile,
      active: pathname.startsWith("/profile"),
    },
  ];

  return (
    <div className="shell">
      <div className="phone">
        {!hideChrome && <IncomingToast />}
        {!hideChrome && (
          <header className="relative z-10 flex items-center justify-between gap-2 px-5 pb-2 pt-5">
            <Link href="/" className="font-display text-2xl tracking-tight text-[var(--ink)]">
              {t("brand")}
            </Link>
            <div className="flex items-center gap-2">
              {showBalanceChip ? <BalanceChip compact /> : null}
              {showLangSwitch && (
                <div className="flex gap-1 rounded-full bg-black/[0.04] p-1 text-xs font-medium">
                  {locales.map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setLocale(l)}
                      className={`rounded-full px-2 py-1 ${
                        locale === l ? "bg-white text-[var(--ink)] shadow-sm" : "text-[var(--muted)]"
                      }`}
                    >
                      {l.toUpperCase()}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </header>
        )}

        <main
          className={`relative z-10 flex flex-1 flex-col px-5 pt-2 ${
            hideChrome ? "pb-8" : "pb-28"
          }`}
        >
          {children}
        </main>

        {!hideChrome && (
          <nav className="absolute bottom-0 left-0 right-0 z-20 border-t border-black/5 bg-white/95 px-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
            <div className="grid grid-cols-4 gap-1 text-center">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[11px] font-medium transition ${
                      item.active ? "text-[var(--accent-deep)]" : "text-[var(--muted)]"
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                        item.active ? "bg-[var(--mint-soft)]" : ""
                      }`}
                    >
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}
