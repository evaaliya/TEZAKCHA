export type TransferStatus =
  | "prepared"
  | "submitted"
  | "confirmed"
  | "failed"
  | "expired";

export interface TransferRecord {
  id: string;
  createdAt: string;
  status: TransferStatus;
  routeId: string;
  amountSend: string;
  amountReceive: string;
  amountUsdc: string;
  amountUsdcRaw: string;
  fromCurrency: string;
  toCurrency: string;
  recipientName: string;
  recipientPhone: string;
  recipientPubkey: string;
  senderPubkey: string;
  idempotencyKey: string;
  prepareId: string;
  expiresAt: string;
  blockhash: string;
  lastValidBlockHeight: number;
  feePayer: string;
  mint: string;
  decimals: number;
  createAta: boolean;
  memo: string;
  txBase64?: string;
  signature?: string;
  explorerUrl?: string;
  error?: string;
  errorCode?: string;
  simulatedFiat: boolean;
  /** True while a submit is in flight — prevents double send. */
  submitting?: boolean;
}

const g = globalThis as unknown as {
  __tezakchaTransfers?: TransferRecord[];
  __tezakchaIdempotency?: Map<string, string>;
};

function db(): TransferRecord[] {
  if (!g.__tezakchaTransfers) {
    g.__tezakchaTransfers = [];
  }
  return g.__tezakchaTransfers;
}

function idemMap(): Map<string, string> {
  if (!g.__tezakchaIdempotency) {
    g.__tezakchaIdempotency = new Map();
  }
  return g.__tezakchaIdempotency;
}

export function listTransfers(): TransferRecord[] {
  return [...db()]
    .filter((t) => t.status !== "prepared")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getTransfer(id: string): TransferRecord | undefined {
  return db().find((t) => t.id === id);
}

export function getTransferByIdempotency(
  key: string,
): TransferRecord | undefined {
  const id = idemMap().get(key);
  if (!id) return undefined;
  return getTransfer(id);
}

export function saveTransfer(record: TransferRecord): TransferRecord {
  const all = db();
  const idx = all.findIndex((t) => t.id === record.id);
  if (idx >= 0) all[idx] = record;
  else all.unshift(record);
  idemMap().set(record.idempotencyKey, record.id);
  return record;
}

/**
 * Atomically claim a prepared transfer for submit.
 * Returns null if already submitted/confirmed or another submit holds the lock.
 */
export function claimPreparedForSubmit(
  prepareId: string,
): TransferRecord | null {
  const record = getTransfer(prepareId);
  if (!record) return null;
  if (record.status === "submitted" || record.status === "confirmed") {
    return record;
  }
  if (record.status !== "prepared") return null;
  if (record.submitting) return null;
  const claimed = { ...record, submitting: true };
  saveTransfer(claimed);
  return claimed;
}

export function releaseSubmitLock(prepareId: string): void {
  const record = getTransfer(prepareId);
  if (!record) return;
  if (record.submitting) {
    saveTransfer({ ...record, submitting: false });
  }
}

export function newTransferId(): string {
  return `tx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Test helper — wipe in-memory transfer history. */
export function clearTransfersForTests(): void {
  g.__tezakchaTransfers = [];
  g.__tezakchaIdempotency = new Map();
}

/** UI: confirmed shows as delivered. */
export function isDeliveredStatus(status: TransferStatus): boolean {
  return status === "confirmed";
}

export function isFailedStatus(status: TransferStatus): boolean {
  return status === "failed" || status === "expired";
}
