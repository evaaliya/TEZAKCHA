"use client";

import { useI18n } from "@/lib/i18n";

/** Devnet explorer link — visible URL for judges to open/copy. */
export function ExplorerLink({ url }: { url?: string | null }) {
  const { t } = useI18n();
  if (!url) return null;

  return (
    <div className="rounded-2xl border border-[var(--accent)]/25 bg-[var(--mint-soft)] p-4">
      <p className="text-xs font-medium text-[var(--accent-deep)]">{t("status.explorer")}</p>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="mt-2 block break-all text-sm font-semibold text-[var(--accent-deep)] underline"
      >
        {url}
      </a>
    </div>
  );
}
