import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PublicKey } from "@solana/web3.js";
import { loadConfig } from "@/lib/config";

interface RecipientsFile {
  recipients: Record<string, string>;
}

export type RecipientSource =
  | "recipients.local.json"
  | "recipients.json"
  | "DEMO_RECIPIENT_PUBKEY";

let cached: RecipientsFile | null = null;

function committedPath(): string {
  return path.join(process.cwd(), "config", "recipients.json");
}

/** Local-only map (phones → pubkeys). Never commit this file. */
function localPath(): string {
  return path.join(process.cwd(), "config", "recipients.local.json");
}

function readJsonFile(filePath: string): RecipientsFile {
  if (!existsSync(filePath)) return { recipients: {} };
  const raw = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as RecipientsFile;
  return { recipients: parsed.recipients ?? {} };
}

/**
 * Merge committed template + local registrations.
 * Lookups prefer local over committed for the same phone.
 */
function loadRecipientsFile(): RecipientsFile {
  if (cached) return cached;
  const base = readJsonFile(committedPath());
  const local = readJsonFile(localPath());
  cached = {
    recipients: { ...base.recipients, ...local.recipients },
  };
  return cached;
}

function loadLocalOnly(): RecipientsFile {
  return readJsonFile(localPath());
}

/**
 * Bind a registered user phone to their embedded-wallet pubkey.
 * Writes ONLY to recipients.local.json (gitignored) — not the repo file.
 */
export function upsertRecipientPubkey(phoneE164: string, pubkey: string): void {
  const key = normalizePhone(phoneE164);
  if (!key.startsWith("+996")) {
    throw new Error("phone_invalid");
  }
  let pk: string;
  try {
    pk = new PublicKey(pubkey).toBase58();
  } catch {
    throw new Error("address_invalid");
  }
  const local = loadLocalOnly();
  local.recipients[key] = pk;
  writeFileSync(localPath(), `${JSON.stringify(local, null, 2)}\n`, "utf8");
  cached = null; // force reload merge next read
}

/** Normalize phone for lookup: keep leading +, strip spaces/dashes. */
export function normalizePhone(phone: string): string {
  return phone.trim().replace(/[\s\-()]/g, "");
}

/**
 * Resolve recipient Solana pubkey from local/committed phone book,
 * else DEMO_RECIPIENT_PUBKEY. Never generates a random address.
 */
export function resolveRecipientPubkey(recipientPhone: string): {
  pubkey: string;
  source: RecipientSource;
} | null {
  const phone = normalizePhone(recipientPhone);
  const local = readJsonFile(localPath());
  if (phone && local.recipients[phone]) {
    try {
      return {
        pubkey: new PublicKey(local.recipients[phone]).toBase58(),
        source: "recipients.local.json",
      };
    } catch {
      throw new Error("recipient_pubkey_invalid");
    }
  }

  const committed = readJsonFile(committedPath());
  if (phone && committed.recipients[phone]) {
    try {
      return {
        pubkey: new PublicKey(committed.recipients[phone]).toBase58(),
        source: "recipients.json",
      };
    } catch {
      throw new Error("recipient_pubkey_invalid");
    }
  }

  // Keep merge cache warm for callers that only upsert/load elsewhere.
  loadRecipientsFile();

  const cfg = loadConfig();
  if (cfg.demoRecipientPubkey) {
    return {
      pubkey: cfg.demoRecipientPubkey,
      source: "DEMO_RECIPIENT_PUBKEY",
    };
  }
  return null;
}

/** Test helper */
export function resetRecipientsCacheForTests(): void {
  cached = null;
}
