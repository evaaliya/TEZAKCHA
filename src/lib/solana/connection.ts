import { Connection } from "@solana/web3.js";
import { loadConfig } from "@/lib/config";
import { SolanaApiError } from "./errors";

export function getConnection(): Connection {
  const cfg = loadConfig();
  return new Connection(cfg.solanaRpcUrl, "confirmed");
}

export async function withRpc<T>(fn: (c: Connection) => Promise<T>): Promise<T> {
  try {
    return await fn(getConnection());
  } catch (e) {
    if (e instanceof SolanaApiError) throw e;
    throw new SolanaApiError(
      "rpc_unavailable",
      503,
      e instanceof Error ? e.message : "rpc_unavailable",
    );
  }
}
