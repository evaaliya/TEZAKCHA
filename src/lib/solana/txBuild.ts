import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import {
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import Decimal from "decimal.js";
import { SOLANA_PROGRAM_ALLOWLIST, getFeePayerKeypair, loadConfig } from "@/lib/config";
import { SolanaApiError } from "./errors";
import { withRpc } from "./connection";

export const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
);

export interface BuildTransferParams {
  amountUsdc: Decimal;
  senderPubkey: string;
  recipientPubkey: string;
  routeId: string;
  prepareId: string;
  /** When true, skip live RPC mint/ATA lookups (unit tests). */
  mintDecimals?: number;
  recipientAtaExists?: boolean;
  recentBlockhash?: string;
  lastValidBlockHeight?: number;
}

export interface BuiltTransfer {
  transaction: VersionedTransaction;
  /** Serialized wire format without requiring signatures (for client). */
  txBase64: string;
  blockhash: string;
  lastValidBlockHeight: number;
  feePayer: string;
  sender: string;
  recipient: string;
  mint: string;
  decimals: number;
  amountRaw: bigint;
  createAta: boolean;
  memo: string;
  /** Expected instruction program ids in order (our instructions only). */
  expectedProgramIds: string[];
}

function usdcToRaw(amountUsdc: Decimal, decimals: number): bigint {
  if (!amountUsdc.isFinite() || amountUsdc.lte(0)) {
    throw new SolanaApiError("invalid_amount", 400, "USDC amount must be positive");
  }
  const rounded = amountUsdc.toDecimalPlaces(decimals, Decimal.ROUND_DOWN);
  if (rounded.lte(0)) {
    throw new SolanaApiError("invalid_amount", 400, "USDC amount rounds to zero");
  }
  const [whole, frac = ""] = rounded.toFixed(decimals).split(".");
  return BigInt(whole + frac.padEnd(decimals, "0").slice(0, decimals));
}

function memoInstruction(text: string): TransactionInstruction {
  return new TransactionInstruction({
    keys: [],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(text, "utf8"),
  });
}

export async function buildUsdcTransferTx(
  params: BuildTransferParams,
): Promise<BuiltTransfer> {
  const cfg = loadConfig();
  if (!cfg.solanaConfigured || !cfg.usdcDevnetMint || !cfg.feePayerSecretKey) {
    throw new SolanaApiError("solana_not_configured", 503);
  }

  const mint = new PublicKey(cfg.usdcDevnetMint);
  const sender = new PublicKey(params.senderPubkey);
  const recipient = new PublicKey(params.recipientPubkey);
  const feePayer =
    cfg.feeSponsorship === "on" ? getFeePayerKeypair().publicKey : sender;

  let decimals = params.mintDecimals;
  let recipientAtaExists = params.recipientAtaExists;
  let blockhash = params.recentBlockhash;
  let lastValidBlockHeight = params.lastValidBlockHeight;

  if (
    decimals === undefined ||
    recipientAtaExists === undefined ||
    !blockhash ||
    lastValidBlockHeight === undefined
  ) {
    const live = await withRpc(async (connection) => {
      const mintInfo = await getMint(connection, mint);
      const recipientAta = getAssociatedTokenAddressSync(mint, recipient);
      const ataInfo = await connection.getAccountInfo(recipientAta);
      const latest = await connection.getLatestBlockhash("confirmed");
      return {
        decimals: mintInfo.decimals,
        recipientAtaExists: Boolean(ataInfo),
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      };
    });
    decimals = decimals ?? live.decimals;
    recipientAtaExists = recipientAtaExists ?? live.recipientAtaExists;
    blockhash = blockhash ?? live.blockhash;
    lastValidBlockHeight = lastValidBlockHeight ?? live.lastValidBlockHeight;
  }

  const amountRaw = usdcToRaw(params.amountUsdc, decimals);
  const senderAta = getAssociatedTokenAddressSync(mint, sender);
  const recipientAta = getAssociatedTokenAddressSync(mint, recipient);

  const instructions: TransactionInstruction[] = [];
  const expectedProgramIds: string[] = [];

  if (!recipientAtaExists) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        feePayer,
        recipientAta,
        recipient,
        mint,
      ),
    );
    expectedProgramIds.push(ASSOCIATED_TOKEN_PROGRAM_ID.toBase58());
  }

  instructions.push(
    createTransferCheckedInstruction(
      senderAta,
      mint,
      recipientAta,
      sender,
      amountRaw,
      decimals,
    ),
  );
  expectedProgramIds.push(TOKEN_PROGRAM_ID.toBase58());

  const memo = `tezakcha:${params.routeId}:${params.prepareId}`;
  instructions.push(memoInstruction(memo));
  expectedProgramIds.push(MEMO_PROGRAM_ID.toBase58());

  const message = new TransactionMessage({
    payerKey: feePayer,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  const transaction = new VersionedTransaction(message);
  // serialize unsigned: requireAllSignatures false
  const txBase64 = Buffer.from(
    transaction.serialize(),
  ).toString("base64");

  return {
    transaction,
    txBase64,
    blockhash,
    lastValidBlockHeight,
    feePayer: feePayer.toBase58(),
    sender: sender.toBase58(),
    recipient: recipient.toBase58(),
    mint: mint.toBase58(),
    decimals,
    amountRaw,
    createAta: !recipientAtaExists,
    memo,
    expectedProgramIds,
  };
}

export async function simulateBuiltTx(
  tx: VersionedTransaction,
): Promise<void> {
  await withRpc(async (connection) => {
    const result = await connection.simulateTransaction(tx, {
      sigVerify: false,
      commitment: "confirmed",
    });
    if (result.value.err) {
      // Do not include account keys / secrets — only err shape.
      console.error("[solana] simulation_failed", JSON.stringify(result.value.err));
      throw new SolanaApiError("simulation_failed", 400);
    }
  });
}

export async function assertSenderUsdcBalance(
  senderPubkey: string,
  amountRaw: bigint,
  mintStr: string,
): Promise<void> {
  await withRpc(async (connection) => {
    const mint = new PublicKey(mintStr);
    const sender = new PublicKey(senderPubkey);
    const ata = getAssociatedTokenAddressSync(mint, sender);
    const info = await connection.getTokenAccountBalance(ata).catch(() => null);
    if (!info) {
      throw new SolanaApiError("insufficient_balance", 400);
    }
    const bal = BigInt(info.value.amount);
    if (bal < amountRaw) {
      throw new SolanaApiError("insufficient_balance", 400);
    }
  });
}

export async function assertFeePayerSol(): Promise<void> {
  const cfg = loadConfig();
  if (cfg.feeSponsorship !== "on") return;
  const feePayer = getFeePayerKeypair().publicKey;
  await withRpc(async (connection) => {
    const lamports = await connection.getBalance(feePayer, "confirmed");
    const min = cfg.feePayerMinSol * 1e9;
    if (lamports < min) {
      throw new SolanaApiError("fee_payer_low_balance", 400);
    }
  });
}

export async function assertSenderSol(senderPubkey: string): Promise<void> {
  const cfg = loadConfig();
  if (cfg.feeSponsorship !== "off") return;
  await withRpc(async (connection) => {
    const lamports = await connection.getBalance(
      new PublicKey(senderPubkey),
      "confirmed",
    );
    const min = cfg.feePayerMinSol * 1e9;
    if (lamports < min) {
      throw new SolanaApiError("fee_payer_low_balance", 400);
    }
  });
}

export function isProgramAllowed(programId: string): boolean {
  return SOLANA_PROGRAM_ALLOWLIST.includes(programId);
}

export { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID };
