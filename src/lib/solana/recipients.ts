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
  | "DEMO_RECIPIENT_PUBKEY"
  | "memory";

type GlobalRecipients = typeof globalThis & {
  __tezakchaRecipients?: Record<string, string>;
};

function memoryStore(): Record<string, string> {
  const g = globalThis as GlobalRecipients;
  if (!g.__tezakchaRecipients) g.__tezakchaRecipients = {};
  return g.__tezakchaRecipients;
}

let cached: RecipientsFile | null = null;

function committedPath(): string {
  return path.join(process.cwd(), "config", "recipients.json");
}

/** Local-only map (phones → pubkeys). Never commit this file. */
function localPath(): string {
  return path.join(process.cwd(), "config", "recipients.local.json");
}

/** On Vercel the app FS is read-only — use /tmp for runtime registrations. */
function writableLocalPath(): string {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join("/tmp", "recipients.local.json");
  }
  return localPath();
}

function readJsonFile(filePath: string): RecipientsFile {
  if (!existsSync(filePath)) return { recipients: {} };
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as RecipientsFile;
    return { recipients: parsed.recipients ?? {} };
  } catch {
    return { recipients: {} };
  }
}

/**
 * Merge committed template + local registrations.
 * Lookups prefer local over committed for the same phone.
 */
function loadRecipientsFile(): RecipientsFile {
  if (cached) return cached;
  const base = readJsonFile(committedPath());
  const local = readJsonFile(localPath());
  const tmp = readJsonFile(path.join("/tmp", "recipients.local.json"));
  const mem = memoryStore();
  cached = {
    recipients: {
      ...base.recipients,
      ...local.recipients,
      ...tmp.recipients,
      ...mem,
    },
  };
  return cached;
}

function loadLocalOnly(): RecipientsFile {
  const disk = readJsonFile(writableLocalPath());
  return {
    recipients: { ...disk.recipients, ...memoryStore() },
  };
}

/** Look up phone → pubkey in runtime + local + committed maps (not DEMO fallback). */
export function getRegisteredPubkey(phoneE164: string): string | null {
  const phone = normalizePhone(phoneE164);
  if (!phone) return null;
  const mem = memoryStore()[phone];
  if (mem) return mem;
  const tmp = readJsonFile(path.join("/tmp", "recipients.local.json")).recipients[phone];
  if (tmp) return tmp;
  const local = readJsonFile(localPath()).recipients[phone];
  if (local) return local;
  const committed = readJsonFile(committedPath()).recipients[phone];
  if (committed) return committed;
  return null;
}

export class RecipientConflictError extends Error {
  constructor() {
    super("This number is already registered");
    this.name = "RecipientConflictError";
  }
}

/**
 * Bind a registered user phone to their embedded-wallet pubkey.
 * First write wins. Never writes config/recipients.json.
 * Same pubkey → idempotent ok; different pubkey → RecipientConflictError.
 */
export function upsertRecipientPubkey(phoneE164: string, pubkey: string): void {
  const key = normalizePhone(phoneE164);
  if (!/^\+\d{8,15}$/.test(key)) {
    throw new Error("phone_invalid");
  }
  let pk: string;
  try {
    pk = new PublicKey(pubkey).toBase58();
  } catch {
    throw new Error("address_invalid");
  }

  const existing = getRegisteredPubkey(key);
  if (existing) {
    let existingPk: string;
    try {
      existingPk = new PublicKey(existing).toBase58();
    } catch {
      throw new Error("recipient_pubkey_invalid");
    }
    if (existingPk === pk) return;
    throw new RecipientConflictError();
  }

  memoryStore()[key] = pk;

  const local = loadLocalOnly();
  local.recipients[key] = pk;
  try {
    writeFileSync(
      writableLocalPath(),
      `${JSON.stringify(local, null, 2)}\n`,
      "utf8",
    );
  } catch {
    // Read-only FS /tmp race — memory still holds the binding for this instance.
  }
  cached = null;
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
  const mem = memoryStore();
  if (phone && mem[phone]) {
    try {
      return {
        pubkey: new PublicKey(mem[phone]).toBase58(),
        source: "memory",
      };
    } catch {
      throw new Error("recipient_pubkey_invalid");
    }
  }

  const tmp = readJsonFile(path.join("/tmp", "recipients.local.json"));
  if (phone && tmp.recipients[phone]) {
    try {
      return {
        pubkey: new PublicKey(tmp.recipients[phone]).toBase58(),
        source: "recipients.local.json",
      };
    } catch {
      throw new Error("recipient_pubkey_invalid");
    }
  }

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
  const g = globalThis as GlobalRecipients;
  g.__tezakchaRecipients = {};
}
