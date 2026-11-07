import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { keypairFromSecret } from "./keys";

const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
);

export interface SendUsdcParams {
  amountUsdc: string;
  recipientPubkey: string;
  routeId: string;
  memo?: string;
}

export interface SendUsdcResult {
  signature: string;
  explorerUrl: string;
  feePayer: string;
  sender: string;
  recipient: string;
  amountRaw: string;
}

function getConnection(): Connection {
  const rpc = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  return new Connection(rpc, "confirmed");
}

function explorerUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

/** Build, fee-sponsor, and submit a USDC SPL transfer on Solana (devnet). */
export async function sendUsdcTransfer(
  params: SendUsdcParams,
): Promise<SendUsdcResult> {
  const feeSecret = process.env.FEE_PAYER_SECRET_KEY;
  const senderSecret = process.env.SENDER_SECRET_KEY;
  const mintStr = process.env.USDC_DEVNET_MINT;

  if (!feeSecret || !senderSecret || !mintStr) {
    throw new Error(
      "Missing FEE_PAYER_SECRET_KEY, SENDER_SECRET_KEY, or USDC_DEVNET_MINT",
    );
  }

  const connection = getConnection();
  const feePayer = keypairFromSecret(feeSecret);
  const sender = keypairFromSecret(senderSecret);
  const mint = new PublicKey(mintStr);
  const recipient = new PublicKey(params.recipientPubkey);

  const mintInfo = await getMint(connection, mint);
  const decimals = mintInfo.decimals;

  const [whole, frac = ""] = params.amountUsdc.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const amountRaw = BigInt(whole + fracPadded);

  const senderAta = getAssociatedTokenAddressSync(mint, sender.publicKey);
  const recipientAta = getAssociatedTokenAddressSync(mint, recipient);

  const instructions = [];

  const recipientAtaInfo = await connection.getAccountInfo(recipientAta);
  if (!recipientAtaInfo) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        feePayer.publicKey,
        recipientAta,
        recipient,
        mint,
      ),
    );
  }

  instructions.push(
    createTransferCheckedInstruction(
      senderAta,
      mint,
      recipientAta,
      sender.publicKey,
      amountRaw,
      decimals,
    ),
  );

  // Memo with route_id (should-have from SPEC)
  const memoText = params.memo ?? `tezakcha:${params.routeId}`;
  instructions.push({
    keys: [],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memoText, "utf8"),
  });

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");

  const message = new TransactionMessage({
    payerKey: feePayer.publicKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();

  const tx = new VersionedTransaction(message);
  tx.sign([feePayer, sender]);

  const signature = await connection.sendTransaction(tx, {
    skipPreflight: false,
  });
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  );

  return {
    signature,
    explorerUrl: explorerUrl(signature),
    feePayer: feePayer.publicKey.toBase58(),
    sender: sender.publicKey.toBase58(),
    recipient: recipient.toBase58(),
    amountRaw: amountRaw.toString(),
  };
}

export async function isSolanaConfigured(): Promise<{
  ok: boolean;
  reason?: string;
}> {
  try {
    if (!process.env.FEE_PAYER_SECRET_KEY || !process.env.SENDER_SECRET_KEY) {
      return { ok: false, reason: "keys_missing" };
    }
    const connection = getConnection();
    await connection.getLatestBlockhash();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "rpc_error" };
  }
}
