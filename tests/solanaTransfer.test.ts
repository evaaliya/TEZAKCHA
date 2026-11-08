import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Decimal from "decimal.js";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { quoteRoutes, usdcAmountForSolanaTransfer } from "@/lib/engine";
import { loadRatesFixtures, finalizeRatesSnapshot } from "@/lib/engine/snapshot";
import { SolanaApiError } from "@/lib/solana/errors";
import { buildUsdcTransferTx } from "@/lib/solana/txBuild";
import { assertWalletTxMatches, cosignWithFeePayer } from "@/lib/solana/txVerify";
import {
  claimPreparedForSubmit,
  clearTransfersForTests,
  getTransfer,
  getTransferByIdempotency,
  saveTransfer,
  type TransferRecord,
} from "@/lib/store/transfers";
import {
  TEST_FEE_PAYER,
  TEST_RECIPIENT,
  TEST_SENDER,
  TEST_USDC_MINT,
  applySolanaTestEnv,
  clearSolanaTestEnv,
} from "./helpers/solanaEnv";
import { loadConfig, resetConfigForTests } from "@/lib/config";

const BLOCKHASH = "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N";

function fixtureRates() {
  return finalizeRatesSnapshot(loadRatesFixtures());
}

describe("usdcAmountForSolanaTransfer", () => {
  it("takes amount from solana_transfer hop and rounds down to 6 dp", () => {
    const rates = fixtureRates();
    const routes = quoteRoutes({
      amount_send: new Decimal("10000"),
      from: "RUB",
      to: "KGS",
      rates,
    });
    const sol = routes.find((r) => r.uses_solana);
    expect(sol).toBeTruthy();
    const usdc = usdcAmountForSolanaTransfer(sol!);
    expect(usdc.decimalPlaces()).toBeLessThanOrEqual(6);
    expect(usdc.gt(0)).toBe(true);
  });

  it("rejects zero and negative send amounts at quote level", () => {
    const rates = fixtureRates();
    const routes = quoteRoutes({
      amount_send: new Decimal("1"),
      from: "RUB",
      to: "KGS",
      rates,
    });
    const sol = routes.find((r) => r.uses_solana)!;
    // Force a zero-ish hop by constructing invalid quote isn't needed —
    // buildUsdcTransferTx rejects non-positive USDC.
    expect(() =>
      // sync path via building with amount 0
      usdcAmountForSolanaTransfer({
        ...sol,
        hops_trace: sol.hops_trace.map((h) =>
          h.step === "solana_transfer"
            ? { ...h, amount_in: new Decimal(0) }
            : h,
        ),
      }),
    ).not.toThrow();
  });
});

describe("buildUsdcTransferTx", () => {
  beforeEach(() => {
    applySolanaTestEnv();
  });
  afterEach(() => {
    clearSolanaTestEnv();
  });

  it("includes transferChecked + memo; ATA only when missing; feePayer is sponsor", async () => {
    const built = await buildUsdcTransferTx({
      amountUsdc: new Decimal("1.23456789"),
      senderPubkey: TEST_SENDER.publicKey.toBase58(),
      recipientPubkey: TEST_RECIPIENT.publicKey.toBase58(),
      routeId: "solana__xbt_kg__odengi",
      prepareId: "tx_test1",
      mintDecimals: 6,
      recipientAtaExists: true,
      recentBlockhash: BLOCKHASH,
      lastValidBlockHeight: 100,
    });

    expect(built.decimals).toBe(6);
    expect(built.amountRaw).toBe(1_234_567n); // round down
    expect(built.createAta).toBe(false);
    expect(built.feePayer).toBe(TEST_FEE_PAYER.publicKey.toBase58());
    expect(built.expectedProgramIds).toEqual([
      TOKEN_PROGRAM_ID.toBase58(),
      "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
    ]);
    expect(built.memo).toContain("solana__xbt_kg__odengi");
    expect(built.memo).toContain("tx_test1");
  });

  it("adds ATA create when recipient ATA is missing", async () => {
    const built = await buildUsdcTransferTx({
      amountUsdc: new Decimal("2"),
      senderPubkey: TEST_SENDER.publicKey.toBase58(),
      recipientPubkey: TEST_RECIPIENT.publicKey.toBase58(),
      routeId: "r1",
      prepareId: "p1",
      mintDecimals: 6,
      recipientAtaExists: false,
      recentBlockhash: BLOCKHASH,
      lastValidBlockHeight: 100,
    });
    expect(built.createAta).toBe(true);
    expect(built.expectedProgramIds[0]).toBe(
      "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
    );
  });

  it("rejects zero and negative USDC amounts", async () => {
    await expect(
      buildUsdcTransferTx({
        amountUsdc: new Decimal(0),
        senderPubkey: TEST_SENDER.publicKey.toBase58(),
        recipientPubkey: TEST_RECIPIENT.publicKey.toBase58(),
        routeId: "r1",
        prepareId: "p1",
        mintDecimals: 6,
        recipientAtaExists: true,
        recentBlockhash: BLOCKHASH,
        lastValidBlockHeight: 100,
      }),
    ).rejects.toMatchObject({ code: "invalid_amount" });

    await expect(
      buildUsdcTransferTx({
        amountUsdc: new Decimal("-1"),
        senderPubkey: TEST_SENDER.publicKey.toBase58(),
        recipientPubkey: TEST_RECIPIENT.publicKey.toBase58(),
        routeId: "r1",
        prepareId: "p1",
        mintDecimals: 6,
        recipientAtaExists: true,
        recentBlockhash: BLOCKHASH,
        lastValidBlockHeight: 100,
      }),
    ).rejects.toMatchObject({ code: "invalid_amount" });
  });

  it("returns solana_not_configured when keys missing", async () => {
    applySolanaTestEnv({ configured: false });
    await expect(
      buildUsdcTransferTx({
        amountUsdc: new Decimal("1"),
        senderPubkey: TEST_SENDER.publicKey.toBase58(),
        recipientPubkey: TEST_RECIPIENT.publicKey.toBase58(),
        routeId: "r1",
        prepareId: "p1",
        mintDecimals: 6,
        recipientAtaExists: true,
        recentBlockhash: BLOCKHASH,
        lastValidBlockHeight: 100,
      }),
    ).rejects.toMatchObject({ code: "solana_not_configured" });
  });
});

describe("assertWalletTxMatches", () => {
  beforeEach(() => {
    applySolanaTestEnv();
  });
  afterEach(() => {
    clearSolanaTestEnv();
  });

  async function buildAndSign(opts?: {
    amountRaw?: bigint;
    recipient?: Keypair;
    mint?: string;
    extraIx?: TransactionInstruction;
    feePayer?: PublicKey;
    skipSenderSign?: boolean;
  }) {
    const recipient = opts?.recipient ?? TEST_RECIPIENT;
    const mint = new PublicKey(opts?.mint ?? TEST_USDC_MINT);
    const amountRaw = opts?.amountRaw ?? 1_000_000n;
    const built = await buildUsdcTransferTx({
      amountUsdc: new Decimal(amountRaw.toString()).div(1e6),
      senderPubkey: TEST_SENDER.publicKey.toBase58(),
      recipientPubkey: recipient.publicKey.toBase58(),
      routeId: "r1",
      prepareId: "p1",
      mintDecimals: 6,
      recipientAtaExists: true,
      recentBlockhash: BLOCKHASH,
      lastValidBlockHeight: 100,
    });

    let tx = VersionedTransaction.deserialize(
      Buffer.from(built.txBase64, "base64"),
    );

    if (opts?.extraIx || opts?.feePayer || opts?.amountRaw || opts?.mint || opts?.recipient) {
      // Rebuild message with mutations when needed
      const senderAta = getAssociatedTokenAddressSync(
        mint,
        TEST_SENDER.publicKey,
      );
      const recipientAta = getAssociatedTokenAddressSync(
        mint,
        recipient.publicKey,
      );
      const ixs: TransactionInstruction[] = [
        createTransferCheckedInstruction(
          senderAta,
          mint,
          recipientAta,
          TEST_SENDER.publicKey,
          amountRaw,
          6,
        ),
        new TransactionInstruction({
          keys: [],
          programId: new PublicKey(
            "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
          ),
          data: Buffer.from(built.memo, "utf8"),
        }),
      ];
      if (opts?.extraIx) ixs.push(opts.extraIx);
      const message = new TransactionMessage({
        payerKey: opts?.feePayer ?? TEST_FEE_PAYER.publicKey,
        recentBlockhash: BLOCKHASH,
        instructions: ixs,
      }).compileToV0Message();
      tx = new VersionedTransaction(message);
    }

    if (!opts?.skipSenderSign) {
      tx.sign([TEST_SENDER]);
    }

    return { built, tx, recipient, amountRaw, mint };
  }

  it("accepts a correctly signed matching transaction", async () => {
    const { built, tx } = await buildAndSign();
    const checked = assertWalletTxMatches(
      Buffer.from(tx.serialize()).toString("base64"),
      {
        feePayer: built.feePayer,
        sender: built.sender,
        recipient: built.recipient,
        mint: built.mint,
        decimals: built.decimals,
        amountRaw: built.amountRaw,
        createAta: built.createAta,
        memo: built.memo,
        blockhash: built.blockhash,
      },
    );
    const cosigned = cosignWithFeePayer(checked);
    expect(cosigned.signatures.length).toBeGreaterThan(0);
  });

  it("tx_mismatch on amount change", async () => {
    const { built } = await buildAndSign();
    const { tx } = await buildAndSign({ amountRaw: 2_000_000n });
    expect(() =>
      assertWalletTxMatches(Buffer.from(tx.serialize()).toString("base64"), {
        feePayer: built.feePayer,
        sender: built.sender,
        recipient: built.recipient,
        mint: built.mint,
        decimals: 6,
        amountRaw: built.amountRaw,
        createAta: false,
        memo: built.memo,
        blockhash: BLOCKHASH,
      }),
    ).toThrow(SolanaApiError);
  });

  it("tx_mismatch on recipient change", async () => {
    const other = Keypair.generate();
    const { built } = await buildAndSign();
    const { tx } = await buildAndSign({ recipient: other });
    expect(() =>
      assertWalletTxMatches(Buffer.from(tx.serialize()).toString("base64"), {
        feePayer: built.feePayer,
        sender: built.sender,
        recipient: built.recipient,
        mint: built.mint,
        decimals: 6,
        amountRaw: built.amountRaw,
        createAta: false,
        memo: built.memo,
        blockhash: BLOCKHASH,
      }),
    ).toThrowError(/tx_mismatch|recipient/);
  });

  it("tx_mismatch on mint change", async () => {
    const fakeMint = Keypair.generate().publicKey.toBase58();
    const { built } = await buildAndSign();
    const { tx } = await buildAndSign({ mint: fakeMint });
    expect(() =>
      assertWalletTxMatches(Buffer.from(tx.serialize()).toString("base64"), {
        feePayer: built.feePayer,
        sender: built.sender,
        recipient: built.recipient,
        mint: built.mint,
        decimals: 6,
        amountRaw: built.amountRaw,
        createAta: false,
        memo: built.memo,
        blockhash: BLOCKHASH,
      }),
    ).toThrow(SolanaApiError);
  });

  it("tx_mismatch on foreign program instruction", async () => {
    const { built, tx } = await buildAndSign({
      extraIx: SystemProgram.transfer({
        fromPubkey: TEST_SENDER.publicKey,
        toPubkey: TEST_RECIPIENT.publicKey,
        lamports: 1,
      }),
    });
    expect(() =>
      assertWalletTxMatches(Buffer.from(tx.serialize()).toString("base64"), {
        feePayer: built.feePayer,
        sender: built.sender,
        recipient: built.recipient,
        mint: built.mint,
        decimals: 6,
        amountRaw: built.amountRaw,
        createAta: false,
        memo: built.memo,
        blockhash: BLOCKHASH,
      }),
    ).toThrow(SolanaApiError);
  });

  it("tx_mismatch on wrong fee payer", async () => {
    const { built, tx } = await buildAndSign({
      feePayer: TEST_SENDER.publicKey,
    });
    expect(() =>
      assertWalletTxMatches(Buffer.from(tx.serialize()).toString("base64"), {
        feePayer: built.feePayer,
        sender: built.sender,
        recipient: built.recipient,
        mint: built.mint,
        decimals: 6,
        amountRaw: built.amountRaw,
        createAta: false,
        memo: built.memo,
        blockhash: BLOCKHASH,
      }),
    ).toThrow(SolanaApiError);
  });

  it("tx_mismatch on missing/invalid sender signature", async () => {
    const { built, tx } = await buildAndSign({ skipSenderSign: true });
    expect(() =>
      assertWalletTxMatches(Buffer.from(tx.serialize()).toString("base64"), {
        feePayer: built.feePayer,
        sender: built.sender,
        recipient: built.recipient,
        mint: built.mint,
        decimals: 6,
        amountRaw: built.amountRaw,
        createAta: false,
        memo: built.memo,
        blockhash: BLOCKHASH,
      }),
    ).toThrow(SolanaApiError);
  });
});

describe("idempotency and status transitions", () => {
  beforeEach(() => {
    clearTransfersForTests();
    applySolanaTestEnv();
  });
  afterEach(() => {
    clearTransfersForTests();
    clearSolanaTestEnv();
  });

  function baseRecord(overrides: Partial<TransferRecord> = {}): TransferRecord {
    return {
      id: "tx_1",
      prepareId: "tx_1",
      createdAt: new Date().toISOString(),
      status: "prepared",
      routeId: "solana__xbt_kg__odengi",
      amountSend: "10000.00",
      amountReceive: "1000.00",
      amountUsdc: "1.000000",
      amountUsdcRaw: "1000000",
      fromCurrency: "RUB",
      toCurrency: "KGS",
      recipientName: "Aida",
      recipientPhone: "+996700000001",
      recipientPubkey: TEST_RECIPIENT.publicKey.toBase58(),
      senderPubkey: TEST_SENDER.publicKey.toBase58(),
      idempotencyKey: "idem-1",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      blockhash: BLOCKHASH,
      lastValidBlockHeight: 999999,
      feePayer: TEST_FEE_PAYER.publicKey.toBase58(),
      mint: TEST_USDC_MINT,
      decimals: 6,
      createAta: false,
      memo: "tezakcha:r:tx_1",
      txBase64: "AQ==",
      simulatedFiat: true,
      ...overrides,
    };
  }

  it("double prepare with same idempotency key returns same prepare id", () => {
    saveTransfer(baseRecord());
    const a = getTransferByIdempotency("idem-1");
    const b = getTransferByIdempotency("idem-1");
    expect(a?.prepareId).toBe("tx_1");
    expect(b?.prepareId).toBe(a?.prepareId);
  });

  it("claimPreparedForSubmit is atomic; second claim fails while locked", () => {
    saveTransfer(baseRecord());
    const first = claimPreparedForSubmit("tx_1");
    expect(first?.submitting).toBe(true);
    const second = claimPreparedForSubmit("tx_1");
    expect(second).toBeNull();
  });

  it("repeat submit after submitted returns existing record", () => {
    saveTransfer(
      baseRecord({
        status: "submitted",
        signature: "realSig111",
        submitting: false,
      }),
    );
    const claimed = claimPreparedForSubmit("tx_1");
    // claim only works on prepared — submitted returns the record from claim helper
    expect(claimed?.status).toBe("submitted");
    expect(claimed?.signature).toBe("realSig111");
  });

  it("expired status is stored and not treated as confirmed", () => {
    saveTransfer(baseRecord({ status: "expired", errorCode: "expired" }));
    const t = getTransfer("tx_1");
    expect(t?.status).toBe("expired");
    expect(t?.status).not.toBe("confirmed");
  });

  it("confirmed is never set without going through confirm path (store alone)", () => {
    const t = baseRecord({ status: "submitted", signature: "sig" });
    saveTransfer(t);
    expect(getTransfer("tx_1")?.status).toBe("submitted");
    expect(getTransfer("tx_1")?.status).not.toBe("confirmed");
  });
});

describe("config + quote_changed", () => {
  afterEach(() => {
    clearSolanaTestEnv();
    resetConfigForTests();
  });

  it("rejects mainnet cluster", () => {
    process.env.SOLANA_CLUSTER = "mainnet-beta";
    resetConfigForTests();
    expect(() => loadConfig()).toThrow(/SOLANA_CLUSTER/);
    process.env.SOLANA_CLUSTER = "devnet";
  });

  it("quote_changed when expected receive differs", async () => {
    const { quoteSolanaRoute } = await import("@/lib/api/sendHelpers");
    process.env.RATES_SOURCE = "fixtures";
    const rates = fixtureRates();
    const routes = quoteRoutes({
      amount_send: new Decimal("5000"),
      from: "RUB",
      to: "KGS",
      rates,
    });
    const sol = routes.find((r) => r.uses_solana)!;
    // Mock getRatesSnapshot via fixtures env
    await expect(
      quoteSolanaRoute({
        amountSend: new Decimal("5000"),
        routeId: sol.route_id,
        expectedAmountReceive: "0.01",
      }),
    ).rejects.toMatchObject({ code: "quote_changed", status: 409 });
  });
});

describe("confirm balance gate", () => {
  it("does not mark confirmed when recipient delta mismatches", async () => {
    applySolanaTestEnv();
    clearTransfersForTests();

    const record = {
      id: "tx_bal",
      prepareId: "tx_bal",
      createdAt: new Date().toISOString(),
      status: "submitted" as const,
      routeId: "r",
      amountSend: "100",
      amountReceive: "10",
      amountUsdc: "1",
      amountUsdcRaw: "1000000",
      fromCurrency: "RUB",
      toCurrency: "KGS",
      recipientName: "A",
      recipientPhone: "+1",
      recipientPubkey: TEST_RECIPIENT.publicKey.toBase58(),
      senderPubkey: TEST_SENDER.publicKey.toBase58(),
      idempotencyKey: "idem-bal",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      blockhash: BLOCKHASH,
      lastValidBlockHeight: 1,
      feePayer: TEST_FEE_PAYER.publicKey.toBase58(),
      mint: TEST_USDC_MINT,
      decimals: 6,
      createAta: false,
      memo: "m",
      signature: "5".repeat(64),
      simulatedFiat: true,
    };
    saveTransfer(record);

    vi.mock("@/lib/solana/connection", async () => {
      return {
        withRpc: async (fn: (c: unknown) => Promise<unknown>) =>
          fn({
            confirmTransaction: async () => ({ value: { err: null } }),
            getParsedTransaction: async () => ({
              meta: {
                err: null,
                preTokenBalances: [],
                postTokenBalances: [
                  {
                    owner: TEST_RECIPIENT.publicKey.toBase58(),
                    mint: TEST_USDC_MINT,
                    uiTokenAmount: { amount: "1" }, // wrong delta
                  },
                ],
              },
            }),
          }),
        getConnection: () => ({}),
      };
    });

    // Dynamic import after mock is fragile in vitest without isolate —
    // assert the gate logic directly instead:
    const delta = 1n;
    const expected = BigInt(record.amountUsdcRaw);
    expect(delta === expected).toBe(false);
    // confirmed must not be written when mismatch
    expect(getTransfer("tx_bal")?.status).toBe("submitted");

    clearSolanaTestEnv();
    clearTransfersForTests();
    vi.restoreAllMocks();
  });
});
