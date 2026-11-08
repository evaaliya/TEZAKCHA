import Decimal from "decimal.js";
import {
  fetchTextWithTimeout,
  parseBankDate,
  parseBankDecimal,
  tagContent,
} from "./xml";

export const NBKR_DAILY_URL = "https://www.nbkr.kg/XML/daily.xml";

export interface OfficialRate {
  /** Value / Nominal in Decimal. */
  value: Decimal;
  asOf?: string;
}

/**
 * Parse NBKR daily.xml for USD/KGS.
 * Structure: <CurrencyRates Date="DD.MM.YYYY"><Currency ISOCode="USD">…
 * Values use a comma decimal separator; rate = Value / Nominal.
 */
export function parseNbkrDailyXml(xml: string): OfficialRate {
  const rootDate = /<CurrencyRates[^>]*\bDate="([^"]+)"/i.exec(xml)?.[1];
  const asOf = parseBankDate(rootDate);

  const block =
    /<Currency[^>]*ISOCode="USD"[^>]*>([\s\S]*?)<\/Currency>/i.exec(xml)?.[1];
  if (!block) {
    throw new Error("NBKR XML: USD currency block not found");
  }

  const nominalRaw = tagContent(block, "Nominal") ?? "1";
  const valueRaw = tagContent(block, "Value");
  if (!valueRaw) {
    throw new Error("NBKR XML: USD Value not found");
  }

  const nominal = parseBankDecimal(nominalRaw);
  if (nominal.lte(0)) {
    throw new Error("NBKR XML: invalid Nominal");
  }
  const value = parseBankDecimal(valueRaw).div(nominal);
  if (!value.isFinite() || value.lte(0)) {
    throw new Error("NBKR XML: invalid USD rate");
  }

  return { value, asOf };
}

export async function fetchNbkrUsdKgs(
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<OfficialRate> {
  const xml = await fetchTextWithTimeout(NBKR_DAILY_URL, timeoutMs, fetchImpl);
  return parseNbkrDailyXml(xml);
}
