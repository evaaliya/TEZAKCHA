export type TransferStatus = "pending" | "submitted" | "delivered" | "failed";

export interface TransferRecord {
  id: string;
  createdAt: string;
  status: TransferStatus;
  routeId: string;
  amountSend: string;
  amountReceive: string;
  fromCurrency: string;
  toCurrency: string;
  recipientName: string;
  recipientPhone: string;
  signature?: string;
  explorerUrl?: string;
  error?: string;
  simulatedFiat: boolean;
}

const g = globalThis as unknown as {
  __tezakchaTransfers?: TransferRecord[];
};

function db(): TransferRecord[] {
  if (!g.__tezakchaTransfers) {
    g.__tezakchaTransfers = [];
  }
  return g.__tezakchaTransfers;
}

export function listTransfers(): TransferRecord[] {
  return [...db()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getTransfer(id: string): TransferRecord | undefined {
  return db().find((t) => t.id === id);
}

export function saveTransfer(record: TransferRecord): TransferRecord {
  const all = db();
  const idx = all.findIndex((t) => t.id === record.id);
  if (idx >= 0) all[idx] = record;
  else all.unshift(record);
  return record;
}

export function newTransferId(): string {
  return `tx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
