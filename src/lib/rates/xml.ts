import Decimal from "decimal.js";

/** Decode bank XML bytes (CBR/NBKR declare windows-1251). */
export function decodeXmlBytes(buf: ArrayBuffer): string {
  try {
    return new TextDecoder("windows-1251").decode(buf);
  } catch {
    return Buffer.from(buf).toString("latin1");
  }
}

/** Bank decimal strings use a comma as the fractional separator. */
export function parseBankDecimal(raw: string): Decimal {
  const normalized = raw.trim().replace(/\s/g, "").replace(",", ".");
  return new Decimal(normalized);
}

/** DD.MM.YYYY → YYYY-MM-DD */
export function parseBankDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw.trim());
  if (!m) return undefined;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function tagContent(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i");
  const m = re.exec(xml);
  return m ? m[1] : undefined;
}

export async function fetchTextWithTimeout(
  url: string,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }
    const buf = await res.arrayBuffer();
    return decodeXmlBytes(buf);
  } finally {
    clearTimeout(timer);
  }
}
