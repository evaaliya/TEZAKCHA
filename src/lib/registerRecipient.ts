import { connect } from "@/lib/solana/wallet";

/** Create/restore embedded wallet and bind session phone → pubkey on the server. */
export async function registerSessionRecipient(phone: string): Promise<string> {
  const pubkey = await connect();
  const res = await fetch("/api/recipients/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, pubkey }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      typeof data.code === "string" ? data.code : "register_failed",
    );
  }
  return pubkey;
}
