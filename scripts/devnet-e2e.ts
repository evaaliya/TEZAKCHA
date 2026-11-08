/**
 * Real devnet E2E: prepare → sign as user wallet → submit → confirm.
 * Requires FEE_PAYER_SECRET_KEY, USDC_DEVNET_MINT, DEMO_RECIPIENT_PUBKEY,
 * and E2E_SENDER_SECRET_KEY (funded with USDC on devnet).
 *
 * Run: npx tsx scripts/devnet-e2e.ts
 */
import Decimal from "decimal.js";
import { VersionedTransaction } from "@solana/web3.js";
import { loadConfig, explorerTxUrl, resetConfigForTests } from "../src/lib/config";
import { quoteRoutes, usdcAmountForSolanaTransfer } from "../src/lib/engine";
import { getRatesSnapshot } from "../src/lib/engine/rates";
import { keypairFromSecret } from "../src/lib/solana/keys";
import {
  confirmAndVerifyTransfer,
  getRecipientUsdcBalance,
} from "../src/lib/solana/confirm";
import { getConnection } from "../src/lib/solana/connection";
import {
  assertFeePayerSol,
  assertSenderUsdcBalance,
  buildUsdcTransferTx,
  simulateBuiltTx,
} from "../src/lib/solana/txBuild";
import { assertWalletTxMatches, cosignWithFeePayer } from "../src/lib/solana/txVerify";
import {
  clearTransfersForTests,
  newTransferId,
  saveTransfer,
  type TransferRecord,
} from "../src/lib/store/transfers";

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(
      `Missing ${name}. Set FEE_PAYER_SECRET_KEY, USDC_DEVNET_MINT, DEMO_RECIPIENT_PUBKEY, E2E_SENDER_SECRET_KEY for a real devnet run.`,
    );
    process.exit(1);
  }
  return v;
}

async function main() {
  resetConfigForTests();
  clearTransfersForTests();

  requireEnv("FEE_PAYER_SECRET_KEY");
  requireEnv("USDC_DEVNET_MINT");
  const recipient = requireEnv("DEMO_RECIPIENT_PUBKEY");
  const senderSecret = requireEnv("E2E_SENDER_SECRET_KEY");

  const cfg = loadConfig();
  if (!cfg.solanaConfigured) {
    console.error("Solana is not configured (solana_not_configured).");
    process.exit(1);
  }
  if (cfg.solanaCluster !== "devnet") {
    console.error("E2E only runs on devnet.");
    process.exit(1);
  }

  const sender = keypairFromSecret(senderSecret);
  const rates = await getRatesSnapshot();
  const amountSend = new Decimal(process.env.E2E_AMOUNT_SEND ?? "1000");
  const routes = quoteRoutes({
    amount_send: amountSend,
    from: "RUB",
    to: "KGS",
    rates,
  });
  const route = routes.find((r) => r.uses_solana);
  if (!route) {
    console.error("No Solana route in quote.");
    process.exit(1);
  }

  const amountUsdc = usdcAmountForSolanaTransfer(route);
  console.log("Route:", route.route_id);
  console.log("Send RUB:", amountSend.toFixed());
  console.log("Receive KGS (estimate):", route.amount_receive.toFixed());
  console.log("USDC on-chain:", amountUsdc.toFixed(6));

  const prepareId = newTransferId();
  const built = await buildUsdcTransferTx({
    amountUsdc,
    senderPubkey: sender.publicKey.toBase58(),
    recipientPubkey: recipient,
    routeId: route.route_id,
    prepareId,
  });

  await assertSenderUsdcBalance(
    sender.publicKey.toBase58(),
    built.amountRaw,
    built.mint,
  );
  await assertFeePayerSol();
  await simulateBuiltTx(built.transaction);

  const expiresAt = new Date(
    Date.now() + cfg.prepareTtlSeconds * 1000,
  ).toISOString();

  const record: TransferRecord = {
    id: prepareId,
    prepareId,
    createdAt: new Date().toISOString(),
    status: "prepared",
    routeId: route.route_id,
    amountSend: amountSend.toFixed(2),
    amountReceive: route.amount_receive.toFixed(2),
    amountUsdc: amountUsdc.toFixed(6),
    amountUsdcRaw: built.amountRaw.toString(),
    fromCurrency: "RUB",
    toCurrency: "KGS",
    recipientName: "E2E",
    recipientPhone: "e2e",
    recipientPubkey: recipient,
    senderPubkey: sender.publicKey.toBase58(),
    idempotencyKey: `e2e-${prepareId}`,
    expiresAt,
    blockhash: built.blockhash,
    lastValidBlockHeight: built.lastValidBlockHeight,
    feePayer: built.feePayer,
    mint: built.mint,
    decimals: built.decimals,
    createAta: built.createAta,
    memo: built.memo,
    txBase64: built.txBase64,
    simulatedFiat: true,
  };
  saveTransfer(record);

  // Mimic embedded user wallet: sign the prepared tx
  const unsigned = VersionedTransaction.deserialize(
    Buffer.from(built.txBase64, "base64"),
  );
  unsigned.sign([sender]);
  const signedB64 = Buffer.from(unsigned.serialize()).toString("base64");

  const matched = assertWalletTxMatches(signedB64, {
    feePayer: built.feePayer,
    sender: built.sender,
    recipient: built.recipient,
    mint: built.mint,
    decimals: built.decimals,
    amountRaw: built.amountRaw,
    createAta: built.createAta,
    memo: built.memo,
    blockhash: built.blockhash,
  });
  const cosigned = cosignWithFeePayer(matched);

  const connection = getConnection();
  const signature = await connection.sendRawTransaction(cosigned.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  const submitted: TransferRecord = {
    ...record,
    status: "submitted",
    signature,
    explorerUrl: explorerTxUrl(signature),
  };
  saveTransfer(submitted);

  const confirmed = await confirmAndVerifyTransfer(submitted);
  const bal = await getRecipientUsdcBalance(recipient, built.mint);

  console.log("status:", confirmed.status);
  console.log("signature:", confirmed.signature);
  console.log("explorer:", confirmed.explorerUrl);
  console.log("recipient USDC balance:", bal);

  if (confirmed.status !== "confirmed") {
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
