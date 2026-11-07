# TEZAKCHA

Banking-style remittance app on Solana. Users never need to know what crypto is: they see amounts, fees, and timing, while the app picks the best route and settles via USDC on Solana.

Built for: Solana Hackathon (MLH), **DeFi** track.

## Problem

People in rural areas overpay for international transfers, and crypto wallets are too complex for them. TEZAKCHA hides that complexity behind a familiar banking UI and shows how much the recipient actually gets.

## How it works

1. Sender enters amount and recipient.
2. A deterministic engine compares three routes: traditional remittance, bank wire, and Solana (USDC).
3. The Solana route executes a real SPL transfer on devnet. The app pays network fees.
4. Recipient sees the amount in local currency.

UI languages: Russian, Kyrgyz, English.

## What is real vs simulated

| Piece | Status |
|-------|--------|
| USDC transfer + confirmation on Solana devnet | real |
| App-sponsored network fees | real |
| Routing engine | real, deterministic, unit-tested |
| FX rates, spreads, on/off-ramp and bank fees | **simulation** (`config/rates.fixtures.json`, snapshot date inside) |
| USDC → som conversion for the recipient | **simulation** |

No real fiat payments or KYC in the demo. Live ramp providers are roadmap.

## Stack

- Frontend: Next.js (mobile-first), Solana Kit / web3 helpers, i18n
- Backend: Next.js API routes
- Solana: devnet, SPL USDC, fee sponsorship
- Tests: Vitest unit tests for the routing engine

## Setup

```bash
git clone <repo-url>
cd TEZAKCHA   # or this repo folder
cp .env.example .env
npm install
npm run dev
```

Environment variables (see `.env.example`):

```
SOLANA_RPC_URL=https://api.devnet.solana.com
FEE_PAYER_SECRET_KEY=          # base58 or JSON byte array; never use on mainnet
SENDER_SECRET_KEY=             # demo sender funded with USDC on devnet
USDC_DEVNET_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
RATES_SOURCE=fixtures          # fixtures | live
```

Devnet prep:
1. Fund the fee payer via [Solana Devnet Faucet](https://faucet.solana.com/).
2. Fund the demo sender with SOL (ATA rent/fees if needed) and USDC on devnet.

Engine tests:

```bash
npm test
```

## Repository layout

```
/src/app            screens (login, send, routes, status, recipient, history)
/src/app/api        quote, send, transfers
/src/lib/engine     routing engine (pure functions)
/src/lib/solana     transaction build + submit
/config             rates.fixtures.json
/locales            ru.json, ky.json, en.json
/tests              routing engine unit tests
```

## Roadmap

- Real on/off-ramp integrations for Russia → Kyrgyzstan
- Mainnet + audit
- More corridors
- Kyrgyz voice interface for recipients

## License

Apache-2.0
