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

## MEASURED (Nov 8, 2026)

- Exit leg, xbt.kg: USDT→KGS 87.4 vs NBKR official 87.45 (~0.06% below official).
- Entry leg, RUB→USDT: market ~81.9 RUB per USDT; P2P ~83–84; online exchangers ~84–86
  (source: public price summary, to be re-checked with P2P screenshots).
- Resulting end-to-end cost for 10,000 RUB: roughly 1.5–2.7% via P2P, ~4.9% via online exchangers.
- Our demo Express figure (1.35%) assumes a favorable entry rate.
- Not validated: whether xbt.kg accepts USDT/USDC on the Solana network, and compliance/freezing
  risk on entry (xbt.kg warns that funds from some Russian exchanges may be frozen for review).

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

## Security status (hackathon demo)

Current demo behavior, stated honestly:
- Sign-in by phone does NOT verify ownership of the number (no SMS code). Anyone can create
  an account with any number.
- The embedded wallet key is generated in the browser and stored UNENCRYPTED in local storage.
  The PIN is a confirmation step in the UI only, it is not verified by the server and does
  not encrypt the key. Clearing site data or switching device loses access (no recovery).
- Phone → wallet mappings and history are kept in process memory and a temp file, so they may
  reset on redeploy (serverless). No user database yet.
- Registration of a number is first-write-wins, but without phone verification a number can
  still be claimed by whoever registers it first.
- The app sponsors network fees. Sends need a funded sender, are rate-limited per IP on
  prepare/submit, and capped per transfer (`AMOUNT_SEND_MAX`). There is no per-user daily
  fee budget yet. The fee-payer key lives only in server env.
- The demo token mint's authority is the same key as the fee payer, so a leak of that key
  would allow minting demo tokens (devnet only, no market value) and spending its SOL.
- Everything runs on devnet; demo funds have no market value.

Planned before any real-money use:
1. Phone verification with a one-time SMS code plus passkey/password as a second factor.
2. Bot protection and rate limits per IP, number and device on sign-in and send; a daily
   fee-sponsorship budget per user.
3. Real key custody: encrypted backup with PIN-derived key, or MPC/custodial signing.
4. Claim flow: funds for a number are released only after that number is verified.
5. Server-side database for accounts, mappings, prepares and history, with audit logs.
6. Separate mint authority and fee payer; secrets in a managed secret store.
7. KYC/AML via a licensed on/off-ramp partner for real fiat legs.

## License

Apache-2.0
