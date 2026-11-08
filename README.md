# TEZAKCHA

Bank-style international transfers for the RUB ↔ KGS corridor. Compare routes,
see how much the recipient actually gets, and send in a few taps. No crypto terms in the UI.

## Why

Kyrgyzstan received $3.49B in remittances in 2025 (15.4% of GDP), about $3.23B of it
from Russia (National Bank of the Kyrgyz Republic, EDB). Most of it moves through
traditional channels, and people can't easily see what they lose to fees and exchange
margins. TEZAKCHA shows it on one screen, in an interface that feels like a banking app.

## What is real

- The Express route executes a real stablecoin transfer on Solana **devnet**:
  prepare → embedded-wallet sign → submit → confirm, with the route id in a Memo.
- Network fee is paid by the app (fee sponsorship): the sender never needs SOL.
- "Sent" / delivered is shown only after on-chain confirmation and a check of the
  recipient's balance change.
- Idempotency key prevents duplicate transactions. A changed quote returns
  `quote_changed`, no transaction is created.
- Official mid rates: NBKR and Bank of Russia, with cache and fallback
  (`RATES_SOURCE=live`; fixtures if live fetch fails).

## What is simulated (always labeled "estimate" in the UI)

- Fiat on/off-ramp legs (RUB/KGS ↔ stablecoin) and their fees.
- Bank and traditional routes: comparison only, not executed. Their cost is an estimate;
  NBKR states cash-ruble fees of 8–10% (July 2026), non-cash transfers are cheaper.
- Devnet stablecoin has no market value; the balance in the UI is a demo balance.

## Choices and limits

- Signing uses an **embedded wallet** (browser key under the UI, confirmed with a PIN)
  instead of Phantom — no extension pop-up for non-technical users. Phantom Embedded
  is a possible later provider; the prepare → sign → submit API stays the same.
- After a **server restart** (`npm run dev` / process exit):
  - prepare records and the transfer history journal live in **process memory only** —
    they are **not** persisted. Open `prepare_id` values are gone; start a **new prepare**.
    Submitting an old `prepare_id` returns not found (not a silent retry of the same tx).
  - Rates reload from cache/fixtures or a fresh live fetch; they are not tied to prepares.
  - Already confirmed on-chain transfers remain on Solana explorer if you kept the link.
- Devnet only. Languages: **en** (default), ru, ky; ky is machine-assisted.
- Missing keys/RPC → `503 solana_not_configured` (no fake signatures).

## Run

```bash
cp .env.example .env
# Required for Express sends:
#   FEE_PAYER_SECRET_KEY   — base58 fee-sponsor secret (server only; never commit)
#   SOLANA_RPC_URL         — e.g. https://api.devnet.solana.com
#   USDC_DEVNET_MINT       — demo mint (or Circle devnet mint)
#   SOLANA_CLUSTER=devnet
# Optional: DEMO_RECIPIENT_PUBKEY, FEE_SPONSORSHIP=on, RATES_SOURCE=live|fixtures

npm install
# Fund FEE_PAYER with Devnet SOL (faucet), then mint demo balance to registered phones:
npm run fund:devnet
npm run dev
```

Before a demo: the **browser you show** must have demo balance (embedded wallet funded),
and the fee payer must hold SOL — otherwise the UI shows insufficient funds.

```bash
npm test
npm run build
```

## License

Apache-2.0
