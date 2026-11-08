import Decimal from "decimal.js";
import { loadRatesFixtures } from "@/lib/engine/snapshot";

export type ElqrErrorCode =
  | "qr_unsupported"
  | "qr_malformed"
  | "qr_wrong_currency"
  | "qr_unknown_provider"
  | "qr_bad_wallet";

export class ElqrError extends Error {
  readonly code: ElqrErrorCode;
  constructor(code: ElqrErrorCode, message?: string) {
    super(message ?? code);
    this.name = "ElqrError";
    this.code = code;
  }
}

export interface ParsedElqr {
  provider: "odengi";
  phone_e164: string;
  name_hint?: string;
  amount_kgs: Decimal | null;
  raw_type: "static" | "dynamic";
}

const MAX_LEN = 512;
const PAYQR_PREFIX = "https://payqr.kg/#";
const ODINGI_GUID = "p2p.dengi.kg";

interface TlvField {
  tag: string;
  value: string;
}

/**
 * Strict EMVCo-style TLV: tag(2) + length(2 digits) + value(exactly length chars).
 * Lengths are in characters (UTF-16 code units / JS string length), not bytes.
 * No leftover after the last field.
 */
export function parseTlvStrict(payload: string): TlvField[] {
  const fields: TlvField[] = [];
  let i = 0;
  while (i < payload.length) {
    if (i + 4 > payload.length) {
      throw new ElqrError("qr_malformed", "truncated_header");
    }
    const tag = payload.slice(i, i + 2);
    const lenStr = payload.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(lenStr)) {
      throw new ElqrError("qr_malformed", "bad_length");
    }
    const len = Number(lenStr);
    const start = i + 4;
    const end = start + len;
    if (end > payload.length) {
      throw new ElqrError("qr_malformed", "length_exceeds_remainder");
    }
    fields.push({ tag, value: payload.slice(start, end) });
    i = end;
  }
  if (i !== payload.length) {
    throw new ElqrError("qr_malformed", "trailing_data");
  }
  return fields;
}

function fieldMap(fields: TlvField[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const f of fields) map.set(f.tag, f.value);
  return map;
}

function assertOdengiInFixtures(): void {
  const fixtures = loadRatesFixtures();
  const xbt = fixtures.off_ramps?.find((p) => p.id === "xbt_kg");
  const has = xbt?.payouts.some((p) => p.id === "odengi");
  if (!has) {
    throw new ElqrError("qr_unknown_provider", "odengi_not_in_fixtures");
  }
}

/**
 * Parse national ELQR (O!Dengi / payqr.kg) payload.
 * Does not fetch or open any URL from the QR text.
 *
 * TODO: Tag 63 is the EMV CRC16 checksum. On the synthetic O!Dengi sample the
 * standard CRC16-CCITT (poly 0x1021) did not match in any of the encodings we
 * tried (UTF-8 / Latin-1 / payload-without-63 / with-63-as-zeros). Leave
 * unverified until a documented national CRC procedure is available.
 */
export function parseElqr(text: string): ParsedElqr {
  if (typeof text !== "string" || text.length === 0) {
    throw new ElqrError("qr_unsupported", "empty");
  }
  if (text.length > MAX_LEN) {
    throw new ElqrError("qr_unsupported", "too_long");
  }

  let payload: string;
  const trimmed = text.trim();
  if (trimmed.startsWith(PAYQR_PREFIX)) {
    const fragment = trimmed.slice(PAYQR_PREFIX.length);
    try {
      payload = decodeURIComponent(fragment);
    } catch {
      throw new ElqrError("qr_malformed", "bad_percent_encoding");
    }
  } else if (trimmed.startsWith("0002")) {
    payload = trimmed;
  } else {
    throw new ElqrError("qr_unsupported");
  }

  const fields = parseTlvStrict(payload);
  const top = fieldMap(fields);

  if (top.get("00") !== "01") {
    throw new ElqrError("qr_malformed", "payload_format");
  }

  if (top.get("53") !== "417") {
    throw new ElqrError("qr_wrong_currency");
  }

  const mai = top.get("32");
  if (!mai) {
    throw new ElqrError("qr_unknown_provider", "missing_32");
  }
  const sub = fieldMap(parseTlvStrict(mai));
  if (sub.get("00") !== ODINGI_GUID) {
    throw new ElqrError("qr_unknown_provider");
  }

  const wallet = sub.get("10");
  if (!wallet || !/^\d{12}$/.test(wallet) || !wallet.startsWith("996")) {
    throw new ElqrError("qr_bad_wallet");
  }

  assertOdengiInFixtures();

  const amountRaw = top.get("54");
  let amount_kgs: Decimal | null = null;
  if (amountRaw !== undefined && amountRaw !== "0") {
    try {
      const d = new Decimal(amountRaw);
      if (!d.isFinite() || d.lte(0)) {
        amount_kgs = null;
      } else {
        amount_kgs = d;
      }
    } catch {
      throw new ElqrError("qr_malformed", "bad_amount");
    }
  }

  const poi = top.get("01");
  const raw_type: "static" | "dynamic" = poi === "11" ? "static" : "dynamic";

  const name = top.get("34");
  return {
    provider: "odengi",
    phone_e164: `+${wallet}`,
    ...(name ? { name_hint: name } : {}),
    amount_kgs,
    raw_type,
  };
}
