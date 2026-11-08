import Decimal from "decimal.js";
import {
  fetchTextWithTimeout,
  parseBankDate,
  parseBankDecimal,
  tagContent,
} from "./xml";

export const CBR_DAILY_URL = "https://www.cbr.ru/scripts/XML_daily.asp";

export interface OfficialRate {
  /** Value / Nominal in Decimal. */
  value: Decimal;
  asOf?: string;
}

/**
 * Parse CBR XML_daily.asp for USD/RUB.
 * Encoding is windows-1251; Value uses a comma decimal separator;
 * rate = Value / Nominal (e.g. some currencies ship Nominal=100).
 */
export function parseCbrDailyXml(xml: string): OfficialRate {
  const rootDate = /<ValCurs[^>]*\bDate="([^"]+)"/i.exec(xml)?.[1];
  const asOf = parseBankDate(rootDate);

  // Do not let [\s\S]* cross into neighboring <Valute> blocks (AUD, etc.).
  const block =
    /<Valute[^>]*>(?:(?!<\/Valute>)[\s\S])*?<CharCode>USD<\/CharCode>(?:(?!<\/Valute>)[\s\S])*?<\/Valute>/i.exec(
      xml,
    )?.[0];
  if (!block) {
    throw new Error("CBR XML: USD Valute block not found");
  }

  const nominalRaw = tagContent(block, "Nominal") ?? "1";
  const valueRaw = tagContent(block, "Value");
  if (!valueRaw) {
    throw new Error("CBR XML: USD Value not found");
  }

  const nominal = parseBankDecimal(nominalRaw);
  if (nominal.lte(0)) {
    throw new Error("CBR XML: invalid Nominal");
  }
  const value = parseBankDecimal(valueRaw).div(nominal);
  if (!value.isFinite() || value.lte(0)) {
    throw new Error("CBR XML: invalid USD rate");
  }

  return { value, asOf };
}

export async function fetchCbrUsdRub(
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<OfficialRate> {
  const xml = await fetchTextWithTimeout(CBR_DAILY_URL, timeoutMs, fetchImpl);
  return parseCbrDailyXml(xml);
}
