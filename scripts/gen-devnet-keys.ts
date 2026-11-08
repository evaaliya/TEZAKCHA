/**
 * Generate Solana keypairs for local/devnet TEZAKCHA setup.
 * Prints values to paste into .env — does not write .env itself.
 *
 *   npx tsx scripts/gen-devnet-keys.ts
 */
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

function printWallet(label: string, kp: Keypair) {
  console.log(`\n=== ${label} ===`);
  console.log("pubkey: ", kp.publicKey.toBase58());
  console.log("secret (base58, for .env):");
  console.log(bs58.encode(kp.secretKey));
  console.log("secret (JSON byte array, also accepted):");
  console.log(JSON.stringify(Array.from(kp.secretKey)));
}

const feePayer = Keypair.generate();
const recipient = Keypair.generate();

printWallet("FEE_PAYER (pays network SOL fees — put secret in .env)", feePayer);
printWallet(
  "DEMO_RECIPIENT (only the PUBKEY goes in .env / recipients.json)",
  recipient,
);

console.log(`
Next steps:
1. Copy FEE_PAYER secret into .env as FEE_PAYER_SECRET_KEY=...
2. Copy DEMO_RECIPIENT pubkey into .env as DEMO_RECIPIENT_PUBKEY=...
   (This is a Solana address, NOT a phone number.)
3. Fund FEE_PAYER with SOL on https://faucet.solana.com/ (devnet).
4. After first login the app creates your sender wallet in the browser —
   open «Свои счета» /Accounts, copy the network address, fund it with
   SOL (optional if FEE_SPONSORSHIP=on) and USDC mint
   4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU on devnet.
5. In the send form use a Kyrgyz phone like +996700112233
   (validated as +996…). DEMO_RECIPIENT_PUBKEY is the fallback on-chain
   destination when that phone is not listed in config/recipients.json.

Optional phone → pubkey map in config/recipients.json:
{
  "recipients": {
    "+996700112233": "<DEMO_RECIPIENT pubkey>"
  }
}

Supabase is NOT required for this flow.
`);
