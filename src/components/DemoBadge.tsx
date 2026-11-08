"use client";

import { useI18n } from "@/lib/i18n";

export function DemoBadge({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  return (
    <span
      className={`inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 ${className}`}
    >
      {t("common.demo")}
    </span>
  );
}
