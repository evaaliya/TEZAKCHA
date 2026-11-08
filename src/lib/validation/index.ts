import Decimal from "decimal.js";
import bs58 from "bs58";
import { COUNTRY_CALLING_CODES } from "./countryCallingCodes";

export type ValidationResult =
  | { ok: true; value: string }
  | { ok: false; code: string };

export type AmountValidationResult =
  | { ok: true; value: Decimal }
  | { ok: false; code: string };

const DEFAULT_AMOUNT_MAX = 1_000_000;

/**
 * Normalize to E.164 (+ and digits). Accepts real international numbers.
 * Legacy KG/RU shortcuts kept: 0XXXXXXXXX → +996…, 8XXXXXXXXXX → +7…
 */
export function validatePhone(raw: string): ValidationResult {
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, code: "phone_invalid" };
  }
  let cleaned = raw.trim().replace(/[\s\-().]/g, "");
  if (cleaned.startsWith("00")) cleaned = `+${cleaned.slice(2)}`;

  // Local Kyrgyz mobile: 0 + 9 digits → +996…
  if (/^0\d{9}$/.test(cleaned)) {
    cleaned = `+996${cleaned.slice(1)}`;
  }
  // Local Russian trunk: 8 + 10 digits → +7…
  if (/^8\d{10}$/.test(cleaned)) {
    cleaned = `+7${cleaned.slice(1)}`;
  }
  // Digits without +: assume already includes country code
  if (/^\d{8,15}$/.test(cleaned)) {
    cleaned = `+${cleaned}`;
  }

  if (!/^\+\d{8,15}$/.test(cleaned)) {
    return { ok: false, code: "phone_invalid" };
  }

  const digits = cleaned.slice(1);
  const cc = COUNTRY_CALLING_CODES.find((code) => digits.startsWith(code));
  if (!cc) return { ok: false, code: "phone_invalid" };

  const national = digits.slice(cc.length);
  // National significant number: typically 4–14 digits; E.164 total ≤ 15.
  if (national.length < 4 || national.length > 14) {
    return { ok: false, code: "phone_invalid" };
  }
  if (digits.length > 15) {
    return { ok: false, code: "phone_invalid" };
  }

  return { ok: true, value: `+${digits}` };
}

/**
 * Positive amount, at most 2 decimal places, ≤ max (default 1_000_000).
 * Rejects scientific notation like "1e9".
 */
export function validateAmountSend(
  raw: string | number,
  max: number = DEFAULT_AMOUNT_MAX,
): AmountValidationResult {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: false, code: "amount_invalid" };
  }
  const asString = typeof raw === "number" ? String(raw) : raw.trim();
  // Plain decimal only: optional digits, optional "." + up to 2 fraction digits.
  if (!/^\d+(\.\d{1,2})?$/.test(asString)) {
    return { ok: false, code: "amount_invalid" };
  }
  let amount: Decimal;
  try {
    amount = new Decimal(asString);
  } catch {
    return { ok: false, code: "amount_invalid" };
  }
  if (!amount.isFinite() || amount.lte(0) || amount.gt(max)) {
    return { ok: false, code: "amount_invalid" };
  }
  // Guard against Decimal accepting odd forms that slipped the regex.
  if (amount.decimalPlaces() > 2) {
    return { ok: false, code: "amount_invalid" };
  }
  return { ok: true, value: amount };
}

/**
 * Solana address: base58 that decodes to exactly 32 bytes.
 *
 * Note: Solana public keys have no checksum. A single-character substitution
 * that stays in the base58 alphabet and keeps length can still decode to 32
 * bytes — this check does not detect that class of typo.
 */
export function validateSolanaAddress(raw: string): ValidationResult {
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, code: "address_invalid" };
  }
  const trimmed = raw.trim();
  // Explicitly reject characters outside the Solana/Bitcoin base58 alphabet
  // (includes 0, O, I, l).
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(trimmed)) {
    return { ok: false, code: "address_invalid" };
  }
  try {
    const bytes = bs58.decode(trimmed);
    if (bytes.length !== 32) {
      return { ok: false, code: "address_invalid" };
    }
    return { ok: true, value: trimmed };
  } catch {
    return { ok: false, code: "address_invalid" };
  }
}

export function amountSendMaxFromEnv(): number {
  const raw = process.env.AMOUNT_SEND_MAX;
  if (!raw || !raw.trim()) return DEFAULT_AMOUNT_MAX;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_AMOUNT_MAX;
}
