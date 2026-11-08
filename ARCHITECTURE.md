# ARCHITECTURE.md — TEZAKCHA

Aligned with SPEC.md and the prepare → embedded-wallet sign → submit flow (scheme B: email login, no Phantom extension UI).

## 1. Component map

```
 USER (browser)
   │
   ▼
 FRONTEND (Next.js, UI ru/ky/en)
   login (email) → send → routes → confirm → status → recipient → history
   Holds: language, selected route, API responses
   Does NOT hold: fee-payer secrets, mid formulas, seed phrases
   Wallet helper: src/lib/solana/wallet.ts (embedded stub; provider under UI, never branded)
   │ HTTP JSON
   ▼
 BACKEND (Next.js API routes)
   /api/quote          → routing engine (Decimal, deterministic)
   /api/send/prepare   → quote lock, balances, build+simulate unsigned tx
   /api/send/submit    → verify wallet tx, cosign fee payer, send+confirm
   /api/transfers/:id  → status (+ RPC refresh when submitted)
   rates adapter       → fixtures | live mids (estimates for fiat legs)
   │ JSON-RPC
   ▼
 SOLANA DEVNET
   USDC SPL transferChecked, optional ATA create, Memo(route_id, prepare_id)
   Fee payer sponsors fees when FEE_SPONSORSHIP=on
```

## 2. Layer responsibilities

| Layer | Owns | Does not |
|-------|------|----------|
| Frontend | screens, i18n, showing results | money math, fee-payer signing |
| Routing engine | recipient amount per route | network / chain I/O |
| Solana module | build, verify, cosign, confirm | route choice |
| Fixtures / live rates | mids, spreads, fees, ETA (estimates) | settlement |
| Transfer store | prepare/submit lifecycle | balances |

## 3. Quote flow (`/api/quote`)

Unchanged: amount + rates snapshot → sorted routes. No chain calls.

## 4. Send flow (real Solana)

```mermaid
sequenceDiagram
  participant U as User
  participant F as Frontend
  participant P as /api/send/prepare
  participant W as EmbeddedWallet
  participant S as /api/send/submit
  participant N as Devnet
  U->>F: confirm route (uses_solana)
  F->>P: sender_pubkey, recipient, route, amounts, idempotency_key
  P->>P: requote; 409 quote_changed if receive differs
  P->>N: balances, blockhash, simulate
  P-->>F: prepare_id, tx_base64 (unsigned), expires_at
  F->>W: signTransaction(tx) under UI
  W-->>F: signed_tx
  F->>S: prepare_id, signed_tx_base64
  S->>S: verify instructions + sender sig; reject tx_mismatch
  S->>S: fee-payer cosign
  S->>N: sendRawTransaction
  S->>N: confirmTransaction + getParsedTransaction balance check
  S-->>F: status confirmed|failed|expired
```

### Transaction contents

```
VersionedTransaction (v0)
 ├─ feePayer = FEE_PAYER (sponsorship=on) else sender
 ├─ create ATA (recipient) if missing — rent paid by fee payer when sponsoring
 ├─ transferChecked USDC (mint decimals from RPC)
 └─ Memo: tezakcha:{route_id}:{prepare_id}
Signers: sender (embedded wallet) + fee payer (server, when sponsoring)
```

Statuses: `prepared` → `submitted` → `confirmed` | `failed` | `expired`.  
UI maps `confirmed` → **Delivered** (`status.delivered`).

`confirmed` requires: confirmTransaction success, no `err`, and recipient USDC delta == prepared amount. No `demo_*` signatures.

## 5. Real vs estimate

| Element | Status |
|---------|--------|
| SPL USDC transfer on devnet | real |
| Explorer signature | real |
| Fee sponsorship | real |
| Engine math | real |
| Fiat / FX / ramp fees | estimate (labeled) |
| Missing keys / RPC | **503** `solana_not_configured` (no fake delivery) |

## 6. Keys and trust

```
.env (server only)
 ├─ FEE_PAYER_SECRET_KEY  → network fees (and ATA rent when sponsoring)
 └─ (no SENDER_SECRET_KEY in the send path)
```

- Secrets never in client bundle, logs, or API responses.
- Rate limit: 10 req/min/IP on `/api/send/*`.
- Cluster fixed to **devnet** (mainnet refused at config load).

## 7. Limits

- Embedded wallet provider not wired yet — `wallet.ts` returns `embedded_not_configured`.
- Devnet USDC: no cash value; not redeemable at exchanges.
- Fiat legs remain estimates until real ramps exist.
- No Phantom extension in the product UI (scheme B).

## 8. Failure modes

| Failure | User-facing code | Behavior |
|---------|------------------|----------|
| No keys / bad RPC config | `solana_not_configured` | 503 |
| Quote drift | `quote_changed` | 409, no tx |
| Low USDC | `insufficient_balance` | 400 |
| Low fee-payer SOL | `fee_payer_low_balance` | 400 |
| Simulation err | `simulation_failed` | 400 |
| Wallet mutated tx | `tx_mismatch` | 400, no cosign |
| Blockhash expired | `expired` | status expired |
