import { afterEach, describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { ConfigError, loadConfig, resetConfigForTests } from "@/lib/config";
import {
  validateAmountSend,
  validatePhone,
  validateSolanaAddress,
} from "@/lib/validation";
import { POST as qrParse } from "@/app/api/qr/parse/route";

describe("validatePhone", () => {
  const expected = "+996700123456";

  it("accepts Kyrgyz formats as the same E.164", () => {
    const inputs = [
      "+996700123456",
      "996700123456",
      "0700123456",
      "+996 700 123 456",
      "996-700-123-456",
      "+996 700-123-456",
    ];
    for (const input of inputs) {
      const r = validatePhone(input);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe(expected);
    }
  });

  it("accepts international E.164 numbers", () => {
    const cases: Array<[string, string]> = [
      ["+1 415 555 2671", "+14155552671"],
      ["+79001234567", "+79001234567"],
      ["8 900 123 45 67", "+79001234567"],
      ["+44 7911 123456", "+447911123456"],
      ["+77001234567", "+77001234567"],
    ];
    for (const [input, want] of cases) {
      const r = validatePhone(input);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe(want);
    }
  });

  it("rejects invalid phones", () => {
    for (const input of ["", "123", "+72 999 99 99 99", "abc", "+996", "+1"]) {
      const r = validatePhone(input);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("phone_invalid");
    }
  });
});

describe("validateAmountSend", () => {
  it("accepts valid amounts", () => {
    expect(validateAmountSend("100").ok).toBe(true);
    expect(validateAmountSend("100.5").ok).toBe(true);
    expect(validateAmountSend("100.50").ok).toBe(true);
  });

  it("rejects 0, negative, 3 dp, abc, 1e9, too large", () => {
    for (const input of ["0", "-1", "1.234", "abc", "1e9", "1000001"]) {
      const r = validateAmountSend(input);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("amount_invalid");
    }
  });
});

describe("validateSolanaAddress", () => {
  it("accepts a real 32-byte keypair public key", () => {
    const kp = Keypair.generate();
    const r = validateSolanaAddress(kp.publicKey.toBase58());
    expect(r.ok).toBe(true);
  });

  it("rejects 0 O I l, wrong length, empty", () => {
    for (const input of ["", "0", "O", "I", "l", "short", "1".repeat(64)]) {
      const r = validateSolanaAddress(input);
      expect(r.ok).toBe(false);
    }
    // Valid alphabet but wrong byte length (decode of short string)
    const tooShort = bs58.encode(Uint8Array.from([1, 2, 3]));
    expect(validateSolanaAddress(tooShort).ok).toBe(false);
  });
});

describe("config solana address validation", () => {
  afterEach(() => {
    delete process.env.DEMO_RECIPIENT_PUBKEY;
    resetConfigForTests();
  });

  it("invalid DEMO_RECIPIENT_PUBKEY names the field and never prints secrets", () => {
    process.env.DEMO_RECIPIENT_PUBKEY = "not-a-key-0OIl";
    process.env.FEE_PAYER_SECRET_KEY = "";
    resetConfigForTests();
    try {
      loadConfig();
      expect.fail("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      const err = e as ConfigError;
      expect(err.field).toBe("DEMO_RECIPIENT_PUBKEY");
      expect(err.message).toContain("DEMO_RECIPIENT_PUBKEY");
      expect(err.message).not.toContain("not-a-key");
      // Ensure no secret-looking payload leaked
      expect(JSON.stringify(err)).not.toMatch(/FEE_PAYER/);
    }
  });
});

describe("POST /api/qr/parse", () => {
  it("returns parsed fields for the synthetic sample", async () => {
    const sample =
      "https://payqr.kg/#00020101021132680012p2p.dengi.kg01048580111200000000000110129965000000001202111302123407%D0%A2%D0%95%D0%A1%D0%A2%20%D0%A2.520473995303417540105906O!Bank63040000";
    const res = await qrParse(
      new Request("http://localhost/api/qr/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sample }),
      }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.provider).toBe("odengi");
    expect(data.phone_e164).toBe("+996500000000");
    expect(data.name_hint).toBe("ТЕСТ Т.");
    expect(data.amount_kgs).toBeNull();
    expect(data.raw_type).toBe("static");
  });

  it("returns 400 with code on unsupported QR", async () => {
    const res = await qrParse(
      new Request("http://localhost/api/qr/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "https://evil.example/qr" }),
      }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("qr_unsupported");
  });
});
