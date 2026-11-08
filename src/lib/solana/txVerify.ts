import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  decodeTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519";
import { getFeePayerKeypair, loadConfig } from "@/lib/config";
import { SolanaApiError } from "./errors";
import { MEMO_PROGRAM_ID, isProgramAllowed } from "./txBuild";

export interface ExpectedTransfer {
  feePayer: string;
  sender: string;
  recipient: string;
  mint: string;
  decimals: number;
  amountRaw: bigint;
  createAta: boolean;
  memo: string;
  blockhash: string;
}

function decompileInstructions(
  message: VersionedMessage,
): TransactionInstruction[] {
  const accountKeys = message.getAccountKeys();
  return message.compiledInstructions.map((ix) => {
    const programId = accountKeys.get(ix.programIdIndex);
    if (!programId) {
      throw new SolanaApiError("tx_mismatch", 400);
    }
    const keys = ix.accountKeyIndexes.map((idx) => {
      const pubkey = accountKeys.get(idx);
      if (!pubkey) throw new SolanaApiError("tx_mismatch", 400);
      return {
        pubkey,
        isSigner: message.isAccountSigner(idx),
        isWritable: message.isAccountWritable(idx),
      };
    });
    return new TransactionInstruction({
      programId,
      keys,
      data: Buffer.from(ix.data),
    });
  });
}

function findTransferChecked(
  instructions: TransactionInstruction[],
): TransactionInstruction | undefined {
  return instructions.find((ix) => {
    if (!ix.programId.equals(TOKEN_PROGRAM_ID)) return false;
    try {
      decodeTransferCheckedInstruction(ix, TOKEN_PROGRAM_ID);
      return true;
    } catch {
      return false;
    }
  });
}

function findAtaCreate(
  instructions: TransactionInstruction[],
): TransactionInstruction | undefined {
  return instructions.find((ix) =>
    ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID),
  );
}

function findMemo(
  instructions: TransactionInstruction[],
  expected: string,
): TransactionInstruction | undefined {
  return instructions.find(
    (ix) =>
      ix.programId.equals(MEMO_PROGRAM_ID) &&
      Buffer.from(ix.data).toString("utf8") === expected,
  );
}

function verifySenderSignature(
  tx: VersionedTransaction,
  sender: PublicKey,
): boolean {
  const messageBytes = tx.message.serialize();
  const accountKeys = tx.message.getAccountKeys();
  const numRequired = tx.message.header.numRequiredSignatures;

  for (let i = 0; i < numRequired; i++) {
    const key = accountKeys.get(i);
    if (!key || !key.equals(sender)) continue;
    const sig = tx.signatures[i];
    if (!sig || sig.every((b) => b === 0)) return false;
    return ed25519.verify(sig, messageBytes, key.toBytes());
  }
  return false;
}

/**
 * Validate a wallet-signed VersionedTransaction against the prepared expectations.
 * Does not add the fee-payer signature.
 */
export function assertWalletTxMatches(
  signedTxBase64: string,
  expected: ExpectedTransfer,
): VersionedTransaction {
  let tx: VersionedTransaction;
  try {
    tx = VersionedTransaction.deserialize(
      Buffer.from(signedTxBase64, "base64"),
    );
  } catch {
    throw new SolanaApiError("tx_mismatch", 400, "invalid_transaction_encoding");
  }

  const feePayerKey = tx.message.getAccountKeys().get(0);
  if (!feePayerKey || feePayerKey.toBase58() !== expected.feePayer) {
    throw new SolanaApiError("tx_mismatch", 400, "fee_payer_mismatch");
  }

  if (tx.message.recentBlockhash !== expected.blockhash) {
    throw new SolanaApiError("tx_mismatch", 400, "blockhash_mismatch");
  }

  const instructions = decompileInstructions(tx.message);

  for (const ix of instructions) {
    if (!isProgramAllowed(ix.programId.toBase58())) {
      throw new SolanaApiError("tx_mismatch", 400, "disallowed_program");
    }
  }

  const transferIx = findTransferChecked(instructions);
  if (!transferIx) {
    throw new SolanaApiError("tx_mismatch", 400, "missing_transfer");
  }

  let decoded;
  try {
    decoded = decodeTransferCheckedInstruction(transferIx, TOKEN_PROGRAM_ID);
  } catch {
    throw new SolanaApiError("tx_mismatch", 400, "invalid_transfer");
  }

  if (decoded.keys.owner.pubkey.toBase58() !== expected.sender) {
    throw new SolanaApiError("tx_mismatch", 400, "sender_mismatch");
  }
  if (decoded.keys.mint.pubkey.toBase58() !== expected.mint) {
    throw new SolanaApiError("tx_mismatch", 400, "mint_mismatch");
  }
  if (decoded.data.decimals !== expected.decimals) {
    throw new SolanaApiError("tx_mismatch", 400, "decimals_mismatch");
  }
  if (decoded.data.amount !== expected.amountRaw) {
    throw new SolanaApiError("tx_mismatch", 400, "amount_mismatch");
  }

  const expectedDest = getAssociatedTokenAddressSync(
    new PublicKey(expected.mint),
    new PublicKey(expected.recipient),
  );
  if (!decoded.keys.destination.pubkey.equals(expectedDest)) {
    throw new SolanaApiError("tx_mismatch", 400, "recipient_mismatch");
  }

  const ataIx = findAtaCreate(instructions);
  if (expected.createAta) {
    if (!ataIx) {
      throw new SolanaApiError("tx_mismatch", 400, "missing_ata_create");
    }
    // ATA create keys: [payer, ata, owner, mint, system, token, ...]
    const owner = ataIx.keys[2]?.pubkey;
    const mint = ataIx.keys[3]?.pubkey;
    if (!owner || owner.toBase58() !== expected.recipient) {
      throw new SolanaApiError("tx_mismatch", 400, "ata_owner_mismatch");
    }
    if (!mint || mint.toBase58() !== expected.mint) {
      throw new SolanaApiError("tx_mismatch", 400, "ata_mint_mismatch");
    }
  } else if (ataIx) {
    // Extra ATA create when we did not expect one — still OK if for same recipient/mint
    // (wallet may not add this; if present with wrong owner → mismatch)
    const owner = ataIx.keys[2]?.pubkey;
    if (owner && owner.toBase58() !== expected.recipient) {
      throw new SolanaApiError("tx_mismatch", 400, "unexpected_ata_create");
    }
  }

  if (!findMemo(instructions, expected.memo)) {
    throw new SolanaApiError("tx_mismatch", 400, "memo_mismatch");
  }

  const senderPk = new PublicKey(expected.sender);
  if (!verifySenderSignature(tx, senderPk)) {
    throw new SolanaApiError("tx_mismatch", 400, "sender_signature_invalid");
  }

  return tx;
}

/** Add fee-payer signature after validation. */
export function cosignWithFeePayer(tx: VersionedTransaction): VersionedTransaction {
  const cfg = loadConfig();
  if (cfg.feeSponsorship !== "on") {
    return tx;
  }
  const feePayer = getFeePayerKeypair();
  tx.sign([feePayer]);
  return tx;
}

/** Re-export for tests that rebuild messages. */
export { TransactionMessage };
