# SPEC.md — TEZAKCHA

Hackathon: Solana Hackathon (MLH), November 6–8. Track: **DeFi** (primary), Top 3 Overall (automatic).
Time budget: ~24 hours. Anything outside Scope is out of implementation.

## 1. Problem and user

People in rural areas (first corridor: remittance recipients in Kyrgyzstan) overpay for international transfers and are not ready to learn crypto wallets. They use banking apps and do not want to relearn.

Product principle: **no crypto in the UI**. The user sees amounts in rubles and som, the recipient, fee, and time. Words like “token”, “gas”, “seed phrase”, or “wallet address” never appear in the UI.

## 2. Core idea

The app looks like a bank. Under the hood it compares remittance routes and settles the chosen Solana route via USDC. Primary corridors: **RUB ↔ KGS** (both directions). Currency pickers are not hard-coded to “RUB only”; the active corridor set drives the UI.

Why it can be cheaper: Solana transfer itself costs a fraction of a cent. The real cost is on-ramp (spread + fee) + transfer (~0) + off-ramp (spread + fee). The engine computes this **deterministically** and shows: “recipient gets X, overpay Y% vs mid-market rate”.

**Auth / signing (scheme B):** email login only. An embedded wallet is created under the UI (Privy / Dynamic / Turnkey / Phantom Embedded — one provider, never named in the UI). No Phantom browser-extension popup. No seed phrase shown.

## 3. Scope

### Must

1. **Login:** email (password and/or magic link — implementation choice). Create an embedded wallet with no seed phrase shown. Signing for send is done by the embedded wallet under the UI — **not** Phantom desktop extension.
2. **Send screen:** amount, sender currency, recipient currency (switch / swap), recipient (name + phone). Live corridors: **RUB → KGS** and **KGS → RUB**.
3. **Routing engine:** pure function; money only via `Decimal`; floor to currency minor units (never invent half-tiyins); same input → same output. Comparison routes: ordinary remittance, bank wire (baselines), **TEZAKCHA Express** (Solana+USDC). Sorted by `amount_receive` desc (best first — Express is usually #1, not “last because worse”); ETA tie-break.
4. **Comparison screen:** several routes, best highlighted; amount to receive; “above official rate”; fee/spread breakdown; ETA; estimate labels; rate sources (NBKR / Bank of Russia) and update time. **Rates banner on home** (`/api/rates`).
5. **UI methods:** smart / international / TEZAKCHA Express only — no domestic bank tiles, no “between KR banks”, no card/IBAN bank clutter.
6. **Solana send:** prepare → embedded-wallet sign → submit → confirm on **devnet**. Real SPL USDC `transferChecked`; Memo with `route_id` / `prepare_id`.
7. **Fee sponsorship:** app pays network fee in SOL; user does not need to hold SOL for the transfer to go through.
8. **Recipient screen** and **history** (status, explorer link for judges).
9. **Localization** ru / ky (en fallback); plain-language errors; no seed/gas/token jargon in the UI (product is remittance, not a bank app).
10. **Rates:** mid from official sources with cache/fallback; fiat on/off-ramp legs are estimates, always labeled. Quote drift at prepare → `quote_changed`, no tx created.
11. **Honesty:** no demo signatures and no fake “delivered”; missing keys/RPC → explicit `solana_not_configured`.

### Should (if time remains)

- ELQR parse (O!Dengi) into phone/amount without opening the QR URL. *(lib + `/api/qr/parse` may exist as a stub; no camera UI required for Must.)*
- QR receive request (Solana Pay) / payment request.
- Voice readout of the confirmation screen in Kyrgyz.
- Extra currencies beyond RUB/KGS (e.g. EUR) on the same corridor model (same engine rules, new fixtures/adapters).
- Dedicated “Rates” tab (richer than the home banner).
- Idempotent prepare/submit, rate limit on send, strict validation of amount/phone/address.
- **Persistent DB for transfer history** (today history is in-process memory and resets on server restart; on-chain txs remain on explorer).

### Explicitly out of scope

- Phantom browser-extension connect / popup in the product UI.
- Showing seed phrases, wallet addresses, “token”, “gas”, or provider brand names (Privy/Dynamic/…) to the user.
- Real on/off-ramp integrations (KYC, banks, payment providers). Fiat quotes in the demo are a **simulation**, labeled in UI and README.
- Mainnet.
- LLM in route/price calculation.
- Multichain, stablecoin swaps, custom smart contracts (SPL transfer is enough).
- Requiring the user to hold SOL when fee sponsorship is on.

## 4. Architecture

```
[Web app (Next.js, mobile-first)]
   ├─ i18n (ru / ky / en)
   ├─ Wallet: embedded wallet (phone / passkey login)
   └─ API client
        │
[Backend (Next.js API routes)]
   ├─ /api/quote          → routing engine (pure functions)
   ├─ /api/send/prepare   → build+simulate unsigned tx (fee sponsorship)
   ├─ /api/send/submit    → verify embedded-wallet signature, cosign fee payer, confirm
   ├─ /api/transfers/:id  → history and status
   └─ rates adapter       → fixtures.json | live mids (fiat legs = estimates)
        │
[Solana devnet]
   ├─ USDC (devnet mint) SPL transferChecked
   ├─ Fee payer (sponsor) pays network fee when FEE_SPONSORSHIP=on
   └─ Memo with route_id + prepare_id
```

Dependencies: `@solana/web3.js` 1.x, `@solana/spl-token`, embedded wallet under UI (scheme B; provider TBD). Jupiter/swaps are out of scope (no useful devnet path for this corridor).

## 5. Routing engine (project core)

Pure function, no side effects. Same input → same output. Covered by unit tests.

### Input
```
{
  amount_send: Decimal,          // amount in sender currency
  from: "RUB",
  to: "KGS",
  rates: RatesSnapshot           // rates and fees at quote time
}
```

### Output (per route)
```
{
  route_id: string,
  label_key: string,             // i18n key
  amount_receive: Decimal,       // recipient amount
  total_cost_pct: Decimal,       // (ideal - actual) / ideal * 100
  fees_breakdown: [{ step, kind: "fee"|"spread", amount_in_from_ccy }],
  eta_minutes: number,
  uses_solana: boolean,
  simulated: boolean             // true for fiat legs in the demo
}
```

### Formulas
- `ideal_receive = amount_send * mid_rate(from→to)` (mid-market benchmark).
- Per hop: subtract fixed fee first, then apply effective rate `rate_eff = mid * (1 - spread)`.
- `total_cost_pct = (ideal_receive - amount_receive) / ideal_receive * 100`.

### Routes
| id | Chain | Role |
|----|-------|------|
| `legacy_transfer` | RUB → KGS via traditional remittance | comparison baseline |
| `bank_wire` | RUB → KGS via bank wire | comparison baseline |
| `solana_usdc` | RUB → USDC (on-ramp) → Solana → USDC → KGS (off-ramp) | our route |

Hop parameters (fees, spreads, ETA) live in `config/rates.fixtures.json` with `"source": "simulated"` and a snapshot date. That is the only place market numbers live. Swapping to a live API means replacing the adapter; the engine stays unchanged.

### Implementation rules
- Money math only with `Decimal` (decimal.js), never `number` for amounts.
- Round **down** to the recipient currency’s minor unit.
- Sort routes by `amount_receive` descending; tie-break by `eta_minutes`.
- Tests (minimum): zero fees → `total_cost_pct = 0`; monotonicity in amount; fixed fee dominates small amounts; best route has max `amount_receive`; round-down behavior.

## 6. Transfer flow

1. User enters amount and recipient → `POST /api/quote` → routes (legacy, bank, Solana+off-ramp variants).
2. Route selection for any `uses_solana` route; confirmation shows recipient amount, total cost, and ETA.
3. `POST /api/send/prepare` → requote (409 `quote_changed` if receive differs), resolve recipient pubkey (`config/recipients.json` or `DEMO_RECIPIENT_PUBKEY`), balance checks, build+simulate unsigned tx.
4. Client signs with embedded wallet (`signTransaction`) under the UI — no Phantom extension popup.
5. `POST /api/send/submit` → verify wallet tx (instructions, amounts, fee payer, sender signature), cosign fee payer, `sendRawTransaction`, `confirmTransaction`, verify recipient USDC delta.
6. Status `confirmed` is shown as “Delivered”; explorer link for judges.

No demo signatures. Missing keys/RPC → 503 `solana_not_configured`.

USDC → KGS on the recipient side remains an **estimate**. Devnet USDC has no cash value.

## 7. Localization

- Languages: `ru`, `ky`, `en`. Files `locales/{ru,ky,en}.json`, all copy via keys.
- Kyrgyz strings should be written/reviewed by a native speaker; unchecked machine translation is not used as final copy.
- Format numbers/currencies with `Intl.NumberFormat` for the active locale.
- Error copy is plain-language, no technical jargon.

## 8. Hour plan

| Hours | Task |
|-------|------|
| 0–2 | Repo from Solana template, env, devnet wallet, fee payer, USDC devnet |
| 2–6 | Routing engine + fixtures + unit tests |
| 6–11 | Backend: `/quote`, `/send`, `/transfers`; real devnet transfer |
| 11–16 | UI: login, send, route compare, confirm, status |
| 16–19 | i18n ru/ky/en, recipient screen, history |
| 19–21 | End-to-end run, bugs, backup demo path |
| 21–23 | README, slides, demo video |
| 23–24 | Final check and submit |

MLH checkpoints: Initial Submission Sunday 10:00 ET; final Sunday 11:45 ET. By Initial Submission the full path “input → routes → devnet transfer → status” must work.

## 9. Definition of Done

- End-to-end flow works on a clean device without manual steps.
- Transaction shows USDC transfer and app fee payer on explorer (devnet).
- UI has no crypto jargon.
- Engine + Solana unit tests green; optional `RUN_DEVNET_TESTS=1` for live e2e.
- Every estimated fiat number is labeled in UI and README.
- Demo video ≤ 3 minutes; README with 5-minute setup.
- Limits documented: embedded wallet stub until provider wired; devnet USDC worthless; fiat legs estimates.

## 10. Demo script (3 minutes)

1. Context: rural recipient, Russia → Kyrgyzstan, UI in Kyrgyz.
2. Enter amount → compare three routes, difference in som highlighted.
3. Confirm → real devnet tx, show explorer: time and network fee.
4. Recipient screen.
5. Slide: roadmap (real ramps, mainnet, new corridors).

## 11. Hackathon criteria mapping

| Criterion | How we hit it |
|-----------|---------------|
| Solana for what it’s good at | Fast confirmation, ~0 network fee, SPL stablecoin, fee sponsorship |
| DeFi: faster, cheaper, more accessible | Remittance corridor, bank-like UI without crypto terms |
| Working product | Real devnet transfer, end-to-end path |
| Honesty | Fiat legs labeled as simulation |

## 12. Risks

- Real off-ramp integrations are unreachable in 24h. Mitigation: labeled simulation.
- Solana toolchain version drift. Mitigation: Version Compatibility Matrix in hour 1.
- UI time pressure. Mitigation: one job per screen; no polish animations before hour 21.
- Devnet instability. Mitigation: pre-recorded backup transfer video.
