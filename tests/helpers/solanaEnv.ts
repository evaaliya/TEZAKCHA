import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { resetConfigForTests } from "@/lib/config";

export const TEST_FEE_PAYER = Keypair.generate();
export const TEST_SENDER = Keypair.generate();
export const TEST_RECIPIENT = Keypair.generate();
/** Circle USDC devnet mint (well-known). */
export const TEST_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

export function applySolanaTestEnv(options?: {
  configured?: boolean;
  sponsorship?: "on" | "off";
}) {
  const configured = options?.configured !== false;
  process.env.SOLANA_CLUSTER = "devnet";
  process.env.SOLANA_RPC_URL = "https://api.devnet.solana.com";
  process.env.FEE_SPONSORSHIP = options?.sponsorship ?? "on";
  process.env.FEE_PAYER_MIN_SOL = "0.01";
  process.env.PREPARE_TTL_SECONDS = "120";
  process.env.USDC_DEVNET_MINT = TEST_USDC_MINT;
  process.env.DEMO_RECIPIENT_PUBKEY = TEST_RECIPIENT.publicKey.toBase58();
  if (configured) {
    process.env.FEE_PAYER_SECRET_KEY = bs58.encode(TEST_FEE_PAYER.secretKey);
  } else {
    delete process.env.FEE_PAYER_SECRET_KEY;
  }
  resetConfigForTests();
}

export function clearSolanaTestEnv() {
  delete process.env.FEE_PAYER_SECRET_KEY;
  delete process.env.DEMO_RECIPIENT_PUBKEY;
  resetConfigForTests();
}
