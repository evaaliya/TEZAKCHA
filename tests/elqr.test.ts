import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { ElqrError, parseElqr } from "@/lib/qr/elqr";

const SAMPLE_FRAGMENT =
  "00020101021132680012p2p.dengi.kg01048580111200000000000110129965000000001202111302123407%D0%A2%D0%95%D0%A1%D0%A2%20%D0%A2.520473995303417540105906O!Bank63040000";

const SAMPLE_URL = `https://payqr.kg/#${SAMPLE_FRAGMENT}`;

describe("parseElqr", () => {
  it("parses synthetic payqr.kg sample", () => {
    const parsed = parseElqr(SAMPLE_URL);
    expect(parsed.provider).toBe("odengi");
    expect(parsed.phone_e164).toBe("+996500000000");
    expect(parsed.name_hint).toBe("ТЕСТ Т.");
    expect(parsed.amount_kgs).toBeNull();
    expect(parsed.raw_type).toBe("static");
  });

  it("parses the same payload without URL prefix", () => {
    const decoded = decodeURIComponent(SAMPLE_FRAGMENT);
    const parsed = parseElqr(decoded);
    expect(parsed.provider).toBe("odengi");
    expect(parsed.phone_e164).toBe("+996500000000");
    expect(parsed.raw_type).toBe("static");
  });

  it("parses tag 54 > 0 into Decimal", () => {
    // Replace amount "0" (54010) with "12.50" (540512.50)
    const withAmount = decodeURIComponent(SAMPLE_FRAGMENT).replace(
      "54010",
      "540512.50",
    );
    const parsed = parseElqr(withAmount);
    expect(parsed.amount_kgs).not.toBeNull();
    expect(parsed.amount_kgs!.eq(new Decimal("12.50"))).toBe(true);
  });

  it("rejects truncated string", () => {
    expect(() => parseElqr(decodeURIComponent(SAMPLE_FRAGMENT).slice(0, 40))).toThrow(
      ElqrError,
    );
    try {
      parseElqr(decodeURIComponent(SAMPLE_FRAGMENT).slice(0, 40));
    } catch (e) {
      expect((e as ElqrError).code).toBe("qr_malformed");
    }
  });

  it("rejects field length longer than remainder", () => {
    // Starts with valid EMV payload marker, then a tag whose length exceeds remainder.
    const oversized = "0002019999";
    expect(() => parseElqr(oversized)).toThrow(ElqrError);
    try {
      parseElqr(oversized);
    } catch (e) {
      expect((e as ElqrError).code).toBe("qr_malformed");
    }
  });

  it("rejects trailing junk after last field", () => {
    const base = decodeURIComponent(SAMPLE_FRAGMENT);
    expect(() => parseElqr(base + "XX")).toThrow(ElqrError);
    try {
      parseElqr(base + "XX");
    } catch (e) {
      expect((e as ElqrError).code).toBe("qr_malformed");
    }
  });

  it("rejects currency ≠ 417", () => {
    const bad = decodeURIComponent(SAMPLE_FRAGMENT).replace("5303417", "5303840");
    expect(() => parseElqr(bad)).toThrow(ElqrError);
    try {
      parseElqr(bad);
    } catch (e) {
      expect((e as ElqrError).code).toBe("qr_wrong_currency");
    }
  });

  it("rejects different provider GUID in subtag 00", () => {
    const bad = decodeURIComponent(SAMPLE_FRAGMENT).replace(
      "p2p.dengi.kg",
      "other.wallet",
    );
    // length of GUID is same (12) so TLV stays well-formed
    expect(() => parseElqr(bad)).toThrow(ElqrError);
    try {
      parseElqr(bad);
    } catch (e) {
      expect((e as ElqrError).code).toBe("qr_unknown_provider");
    }
  });

  it("rejects wallet with 11 digits", () => {
    const base = decodeURIComponent(SAMPLE_FRAGMENT);
    // Rebuild MAI (tag 32) with a well-formed TLV whose wallet (tag 10) has 11 digits.
    const mai =
      "0012p2p.dengi.kg010485801112000000000001101199650000000120211130212";
    expect(mai.length).toBe(67);
    const bad = base.replace(/32\d{2}.{68}/, `3267${mai}`);
    expect(() => parseElqr(bad)).toThrow(ElqrError);
    try {
      parseElqr(bad);
    } catch (e) {
      expect((e as ElqrError).code).toBe("qr_bad_wallet");
    }
  });

  it("rejects wallet not starting with 996", () => {
    const bad = decodeURIComponent(SAMPLE_FRAGMENT).replace(
      "996500000000",
      "995500000000",
    );
    expect(() => parseElqr(bad)).toThrow(ElqrError);
    try {
      parseElqr(bad);
    } catch (e) {
      expect((e as ElqrError).code).toBe("qr_bad_wallet");
    }
  });

  it("rejects length > 512, empty string, foreign URL", () => {
    expect(() => parseElqr("")).toThrow(ElqrError);
    try {
      parseElqr("");
    } catch (e) {
      expect((e as ElqrError).code).toBe("qr_unsupported");
    }

    expect(() => parseElqr("x".repeat(513))).toThrow(ElqrError);
    try {
      parseElqr("x".repeat(513));
    } catch (e) {
      expect((e as ElqrError).code).toBe("qr_unsupported");
    }

    expect(() => parseElqr("https://example.com/#000201")).toThrow(ElqrError);
    try {
      parseElqr("https://example.com/#000201");
    } catch (e) {
      expect((e as ElqrError).code).toBe("qr_unsupported");
    }
  });
});
