/**
 * After FEE_PAYER has SOL from https://faucet.solana.com/ (Devnet):
 *   npm run fund:devnet
 *
 * Reuses USDC_DEVNET_MINT if set; otherwise creates a demo mint (6 decimals)
 * controlled by FEE_PAYER. Mints 10_000 USDC to every pubkey in
 * recipients.local.json (one embedded wallet per browser login).
 *
 * Why not Circle mint? Public faucets for that mint are unreliable; for hackathon
 * demo we need a mint we can top up ourselves.
 */
import fs from "node:fs";
import path from "node:path";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  getMinimumBalanceForRentExemptMint,
  getAccount,
  getMint,
} from "@solana/spl-token";
import bs58 from "bs58";

function loadEnv(): Record<string, string> {
  const raw = fs.readFileSync(path.join(process.cwd(), ".env"), "utf8");
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

function setEnvKey(name: string, value: string) {
  const envPath = path.join(process.cwd(), ".env");
  let env = fs.readFileSync(envPath, "utf8");
  const re = new RegExp(`^${name}=.*$`, "m");
  if (re.test(env)) env = env.replace(re, `${name}=${value}`);
  else env += `\n${name}=${value}\n`;
  fs.writeFileSync(envPath, env);
}

async function main() {
  const env = loadEnv();
  if (!env.FEE_PAYER_SECRET_KEY) {
    console.error("FEE_PAYER_SECRET_KEY missing in .env");
    process.exit(1);
  }
  const fee = Keypair.fromSecretKey(bs58.decode(env.FEE_PAYER_SECRET_KEY));
  const rpc = env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
  const conn = new Connection(rpc, "confirmed");

  const sol = (await conn.getBalance(fee.publicKey)) / LAMPORTS_PER_SOL;
  console.log("FEE_PAYER:", fee.publicKey.toBase58());
  console.log("SOL balance:", sol);

  if (sol < 0.2) {
    console.error(`
FEE_PAYER needs SOL first (now ${sol}).

1. Open https://faucet.solana.com/
2. Network: Devnet
3. Paste: ${fee.publicKey.toBase58()}
4. Request SOL
5. Run again: npm run fund:devnet
`);
    process.exit(1);
  }

  let mintPubkey: PublicKey;
  if (env.USDC_DEVNET_MINT) {
    mintPubkey = new PublicKey(env.USDC_DEVNET_MINT);
    try {
      const mintInfo = await getMint(conn, mintPubkey);
      if (!mintInfo.mintAuthority?.equals(fee.publicKey)) {
        console.error(
          "Existing USDC_DEVNET_MINT is not mintable by FEE_PAYER. Clear USDC_DEVNET_MINT in .env and re-run.",
        );
        process.exit(1);
      }
      console.log("Reusing demo USDC mint:", mintPubkey.toBase58());
    } catch (e) {
      console.error("USDC_DEVNET_MINT not found on-chain:", e);
      process.exit(1);
    }
  } else {
    const mintKp = Keypair.generate();
    const lamports = await getMinimumBalanceForRentExemptMint(conn);
    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: fee.publicKey,
        newAccountPubkey: mintKp.publicKey,
        space: MINT_SIZE,
        lamports,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMint2Instruction(
        mintKp.publicKey,
        6,
        fee.publicKey,
        null,
        TOKEN_PROGRAM_ID,
      ),
    );
    await sendAndConfirmTransaction(conn, tx, [fee, mintKp]);
    mintPubkey = mintKp.publicKey;
    console.log("Created demo USDC mint:", mintPubkey.toBase58());
    setEnvKey("USDC_DEVNET_MINT", mintPubkey.toBase58());
  }

  const targets = new Set<string>();
  try {
    const local = JSON.parse(
      fs.readFileSync("config/recipients.local.json", "utf8"),
    ) as { recipients?: Record<string, string> };
    for (const pk of Object.values(local.recipients ?? {})) targets.add(pk);
  } catch {
    /* empty */
  }
  if (targets.size === 0) {
    console.log(
      "No phones in recipients.local.json yet — log into TEZAKCHA once, then re-run this script.",
    );
    process.exit(0);
  }

  const amount = 10_000n * 1_000_000n; // 10_000.000000 demo USDC
  for (const pk of targets) {
    const owner = new PublicKey(pk);
    const ata = getAssociatedTokenAddressSync(mintPubkey, owner);
    const fundTx = new Transaction();
    let needCreate = false;
    try {
      await getAccount(conn, ata);
    } catch {
      needCreate = true;
    }
    if (needCreate) {
      fundTx.add(
        createAssociatedTokenAccountInstruction(
          fee.publicKey,
          ata,
          owner,
          mintPubkey,
        ),
      );
    }
    fundTx.add(
      createMintToInstruction(mintPubkey, ata, fee.publicKey, amount),
    );
    await sendAndConfirmTransaction(conn, fundTx, [fee]);
    console.log("Minted 10000 USDC →", pk);
  }

  console.log(`
Done. Topped up ${targets.size} wallet(s) with 10_000 USDC each.
- Phone login ≠ balance. Each browser has its own embedded wallet.
- Send FROM the browser that has USDC; the other phone is only the recipient.
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
