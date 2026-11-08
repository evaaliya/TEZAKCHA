"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import en from "../../locales/en.json";
import ky from "../../locales/ky.json";
import ru from "../../locales/ru.json";

export type Locale = "ru" | "ky" | "en";

const dictionaries: Record<Locale, Record<string, string>> = { en, ru, ky };

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  formatMoney: (amount: string | number, currency: string) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

const STORAGE_KEY = "tezakcha_locale";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (saved && dictionaries[saved]) setLocaleState(saved);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const dict = dictionaries[locale] ?? dictionaries.en;
      let value = dict[key] ?? dictionaries.en[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          value = value.replace(`{${k}}`, String(v));
        }
      }
      return value;
    },
    [locale],
  );

  const formatMoney = useCallback(
    (amount: string | number, currency: string) => {
      const n = typeof amount === "string" ? Number(amount) : amount;
      const localeTag =
        locale === "ky" ? "ky-KG" : locale === "ru" ? "ru-RU" : "en-US";
      return new Intl.NumberFormat(localeTag, {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(n);
    },
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t, formatMoney }),
    [locale, setLocale, t, formatMoney],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
