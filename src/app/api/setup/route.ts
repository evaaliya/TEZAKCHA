import { NextResponse } from "next/server";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  getAccount,
} from "@solana/spl-token";
import { getFeePayerKeypair, loadConfig } from "@/lib/config";

export const runtime = "nodejs";

/** Public setup facts for the Accounts screen (no secrets). */
export async function GET(request: Request) {
  try {
    const cfg = loadConfig();
    let feePayerPubkey: string | null = null;
    let feePayerSol: number | null = null;
    let senderUsdc: number | null = null;
    const airdropHint = "https://faucet.solana.com/";
    const url = new URL(request.url);
    const senderPubkey = url.searchParams.get("sender");

    if (cfg.feePayerSecretKey) {
      const kp = getFeePayerKeypair();
      feePayerPubkey = kp.publicKey.toBase58();
      try {
        const conn = new Connection(cfg.solanaRpcUrl, "confirmed");
        const lamports = await conn.getBalance(kp.publicKey);
        feePayerSol = lamports / LAMPORTS_PER_SOL;

        if (senderPubkey && cfg.usdcDevnetMint) {
          try {
            const owner = new PublicKey(senderPubkey);
            const mint = new PublicKey(cfg.usdcDevnetMint);
            const ata = getAssociatedTokenAddressSync(mint, owner);
            const acc = await getAccount(conn, ata);
            // Demo / Circle USDC mints use 6 decimals.
            senderUsdc = Number(acc.amount) / 1e6;
          } catch {
            senderUsdc = 0;
          }
        }
      } catch {
        feePayerSol = null;
      }
    }

    return NextResponse.json({
      solanaConfigured: cfg.solanaConfigured,
      cluster: cfg.solanaCluster,
      feeSponsorship: cfg.feeSponsorship,
      feePayerPubkey,
      feePayerSol,
      feePayerMinSol: cfg.feePayerMinSol,
      senderUsdc,
      demoRecipientSet: Boolean(cfg.demoRecipientPubkey),
      demoPhone: "+996…",
      usdcMint: cfg.usdcDevnetMint,
      faucetUrl: airdropHint,
      explorerCluster: "devnet",
      diagnosis:
        feePayerSol != null && feePayerSol < (cfg.feePayerMinSol ?? 0.05)
          ? "fee_payer_low_sol"
          : senderUsdc === 0
            ? "sender_no_usdc"
            : "ok",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "setup_failed" },
      { status: 500 },
    );
  }
}
