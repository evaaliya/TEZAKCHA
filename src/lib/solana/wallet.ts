/**
 * Embedded wallet (scheme B) — local keypair under the UI.
 *
 * Product: email login only; no Phantom popup; no seed phrase shown.
 * For hackathon/devnet the keypair lives in localStorage until a real
 * provider (Privy / Dynamic / Turnkey / Phantom Embedded) replaces this.
 */
import {
  Keypair,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";

const STORAGE_KEY = "tezakcha_embedded_sk";

export type WalletErrorCode =
  | "embedded_not_configured"
  | "user_rejected"
  | "wallet_account_changed";

export class WalletError extends Error {
  readonly code: WalletErrorCode;
  constructor(code: WalletErrorCode, message?: string) {
    super(message ?? code);
    this.name = "WalletError";
    this.code = code;
  }
}

function loadKeypair(): Keypair | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return Keypair.fromSecretKey(bs58.decode(raw));
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function saveKeypair(kp: Keypair): void {
  window.localStorage.setItem(STORAGE_KEY, bs58.encode(kp.secretKey));
}

function requireBrowser(): void {
  if (typeof window === "undefined") {
    throw new WalletError("embedded_not_configured", "browser_only");
  }
}

/** Create or restore the embedded wallet; returns base58 pubkey. */
export async function connect(): Promise<string> {
  requireBrowser();
  let kp = loadKeypair();
  if (!kp) {
    kp = Keypair.generate();
    saveKeypair(kp);
  }
  return kp.publicKey.toBase58();
}

export async function disconnect(): Promise<void> {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function getPublicKey(): string | null {
  return loadKeypair()?.publicKey.toBase58() ?? null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/** Deserialize prepare tx_base64 → VersionedTransaction. */
export function txFromBase64(txBase64: string): VersionedTransaction {
  return VersionedTransaction.deserialize(base64ToBytes(txBase64));
}

export function txToBase64(tx: VersionedTransaction): string {
  return bytesToBase64(tx.serialize());
}

/**
 * Sign a prepared VersionedTransaction with the embedded keypair.
 */
export async function signTransaction(
  tx: Transaction | VersionedTransaction,
): Promise<Transaction | VersionedTransaction> {
  requireBrowser();
  const kp = loadKeypair();
  if (!kp) {
    throw new WalletError("embedded_not_configured", "call_connect_first");
  }
  if (tx instanceof VersionedTransaction) {
    tx.sign([kp]);
    return tx;
  }
  tx.partialSign(kp);
  return tx;
}
