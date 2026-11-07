import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

export function keypairFromSecret(secret: string): Keypair {
  const trimmed = secret.trim();
  if (!trimmed) {
    throw new Error("Secret key is empty");
  }

  if (trimmed.startsWith("[")) {
    const bytes = Uint8Array.from(JSON.parse(trimmed) as number[]);
    return Keypair.fromSecretKey(bytes);
  }

  return Keypair.fromSecretKey(bs58.decode(trimmed));
}
