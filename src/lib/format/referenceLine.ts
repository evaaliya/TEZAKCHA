import type { ReferenceRate } from "@/lib/engine/types";

/** Format ISO YYYY-MM-DD as DD.MM.YYYY. Returns null if missing/invalid. */
export function formatAsOfDate(asOf: string | undefined): string | null {
  if (!asOf) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asOf.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  return `${d}.${m}.${y}`;
}

/** HH:MM from an ISO timestamp (local clock). */
export function formatUpdatedClock(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export interface ReferenceLineMeta {
  /** Already translated, e.g. "Обновлено 14:05". */
  updatedLabel?: string;
  /** Already translated "снимок" — shown for snapshot / live_stale. */
  snapshotLabel?: string;
}

/**
 * Build the routes-screen source line:
 * "{institution}: {value} {pair}[ DD.MM.YYYY]" · … · [updated] · [snapshot] · simulated
 */
export function formatReferenceLine(
  rates: ReferenceRate[],
  t: (key: string) => string,
  simulatedLabel: string,
  meta?: ReferenceLineMeta,
): string {
  const parts = rates.map((rate) => {
    let part = `${t(rate.institution_key)}: ${rate.value} ${rate.pair}`;
    const dated = formatAsOfDate(rate.as_of);
    if (dated) {
      part += ` ${dated}`;
    }
    return part;
  });
  if (meta?.updatedLabel) parts.push(meta.updatedLabel);
  if (meta?.snapshotLabel) parts.push(meta.snapshotLabel);
  parts.push(simulatedLabel);
  return parts.join(" · ");
}
