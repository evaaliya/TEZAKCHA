import { readFileSync } from "node:fs";
import path from "node:path";
import { Keypair } from "@solana/web3.js";
import { keypairFromSecret } from "@/lib/solana/keys";
import { validateSolanaAddress } from "@/lib/validation";

export type FeeSponsorship = "on" | "off";
export type SolanaCluster = "devnet";

export class ConfigError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(message);
    this.name = "ConfigError";
    this.field = field;
  }
}

export interface AppConfig {
  solanaRpcUrl: string;
  solanaCluster: SolanaCluster;
  /** Present only when a valid fee-payer secret is configured. Never log this. */
  feePayerSecretKey: string | null;
  usdcDevnetMint: string | null;
  feePayerMinSol: number;
  feeSponsorship: FeeSponsorship;
  demoRecipientPubkey: string | null;
  prepareTtlSeconds: number;
  amountSendMax: number;
  /** True when RPC, fee payer, and mint are all set for real sends. */
  solanaConfigured: boolean;
}

const PROGRAM_ALLOWLIST = [
  // SPL Token
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  // Associated Token Account
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  // Memo (docs.solana.com / Phantom transfer recipes)
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
  // Compute Budget
  "ComputeBudget111111111111111111111111111111",
] as const;

/** Programs allowed beyond our own instructions (Compute Budget, Memo, ATA, SPL Token). */
export const SOLANA_PROGRAM_ALLOWLIST: readonly string[] = PROGRAM_ALLOWLIST;

let cached: AppConfig | null = null;

function requireEnum<T extends string>(
  field: string,
  raw: string | undefined,
  allowed: readonly T[],
  fallback?: T,
): T {
  if (raw === undefined || raw === "") {
    if (fallback !== undefined) return fallback;
    throw new ConfigError(field, `${field} is required`);
  }
  if (!(allowed as readonly string[]).includes(raw)) {
    throw new ConfigError(
      field,
      `${field} must be one of: ${allowed.join(", ")}`,
    );
  }
  return raw as T;
}

function requirePositiveNumber(
  field: string,
  raw: string | undefined,
  fallback: number,
): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new ConfigError(field, `${field} must be a non-negative number`);
  }
  return n;
}

function optionalSolanaAddress(
  field: string,
  raw: string | undefined,
): string | null {
  if (!raw || !raw.trim()) return null;
  const checked = validateSolanaAddress(raw);
  if (!checked.ok) {
    throw new ConfigError(field, `${field} is not a valid public key`);
  }
  return checked.value;
}

function optionalSecretKey(field: string, raw: string | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  try {
    keypairFromSecret(raw);
    return raw.trim();
  } catch {
    // Never include the raw secret in the error message.
    throw new ConfigError(field, `${field} is not a valid secret key`);
  }
}

function validateOneRecipientsFile(filePath: string, label: string): void {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return;
  }
  let parsed: { recipients?: Record<string, string> };
  try {
    parsed = JSON.parse(raw) as { recipients?: Record<string, string> };
  } catch {
    throw new ConfigError(label, `${label} is not valid JSON`);
  }
  for (const [phone, pubkey] of Object.entries(parsed.recipients ?? {})) {
    const checked = validateSolanaAddress(pubkey);
    if (!checked.ok) {
      throw new ConfigError(
        `${label}:${phone}`,
        `${label} entry for ${phone} is not a valid public key`,
      );
    }
  }
}

function validateRecipientsFile(): void {
  validateOneRecipientsFile(
    path.join(process.cwd(), "config", "recipients.json"),
    "recipients.json",
  );
  validateOneRecipientsFile(
    path.join(process.cwd(), "config", "recipients.local.json"),
    "recipients.local.json",
  );
}

/** Load and validate env. Never returns or logs secret values. */
export function loadConfig(): AppConfig {
  if (cached) return cached;

  const cluster = requireEnum(
    "SOLANA_CLUSTER",
    process.env.SOLANA_CLUSTER,
    ["devnet"] as const,
    "devnet",
  );

  if (
    process.env.SOLANA_CLUSTER === "mainnet" ||
    process.env.SOLANA_CLUSTER === "mainnet-beta"
  ) {
    throw new ConfigError(
      "SOLANA_CLUSTER",
      "SOLANA_CLUSTER must be devnet (mainnet is disabled)",
    );
  }

  const rpc =
    process.env.SOLANA_RPC_URL?.trim() || "https://api.devnet.solana.com";
  if (!/^https?:\/\//i.test(rpc)) {
    throw new ConfigError("SOLANA_RPC_URL", "SOLANA_RPC_URL must be an http(s) URL");
  }

  const feeSponsorship = requireEnum(
    "FEE_SPONSORSHIP",
    process.env.FEE_SPONSORSHIP,
    ["on", "off"] as const,
    "on",
  );

  const feePayerMinSol = requirePositiveNumber(
    "FEE_PAYER_MIN_SOL",
    process.env.FEE_PAYER_MIN_SOL,
    0.05,
  );

  const prepareTtlSeconds = requirePositiveNumber(
    "PREPARE_TTL_SECONDS",
    process.env.PREPARE_TTL_SECONDS,
    120,
  );

  const amountSendMax = requirePositiveNumber(
    "AMOUNT_SEND_MAX",
    process.env.AMOUNT_SEND_MAX,
    1_000_000,
  );

  const usdcDevnetMint = optionalSolanaAddress(
    "USDC_DEVNET_MINT",
    process.env.USDC_DEVNET_MINT,
  );

  const feePayerSecretKey = optionalSecretKey(
    "FEE_PAYER_SECRET_KEY",
    process.env.FEE_PAYER_SECRET_KEY,
  );
  const demoRecipientPubkey = optionalSolanaAddress(
    "DEMO_RECIPIENT_PUBKEY",
    process.env.DEMO_RECIPIENT_PUBKEY,
  );

  validateRecipientsFile();

  // SENDER_SECRET_KEY is intentionally not part of the send flow (embedded wallet signs).

  const solanaConfigured = Boolean(feePayerSecretKey && usdcDevnetMint && rpc);

  cached = {
    solanaRpcUrl: rpc,
    solanaCluster: cluster,
    feePayerSecretKey,
    usdcDevnetMint,
    feePayerMinSol,
    feeSponsorship,
    demoRecipientPubkey,
    prepareTtlSeconds,
    amountSendMax,
    solanaConfigured,
  };
  return cached;
}

/** Test helper — drop cached config so env changes apply. */
export function resetConfigForTests(): void {
  cached = null;
}

export function getFeePayerKeypair(): Keypair {
  const cfg = loadConfig();
  if (!cfg.feePayerSecretKey) {
    throw new ConfigError(
      "FEE_PAYER_SECRET_KEY",
      "FEE_PAYER_SECRET_KEY is not configured",
    );
  }
  return keypairFromSecret(cfg.feePayerSecretKey);
}

export function explorerTxUrl(signature: string): string {
  const cfg = loadConfig();
  return `https://explorer.solana.com/tx/${signature}?cluster=${cfg.solanaCluster}`;
}
