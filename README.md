<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/a9baeec7-c111-440a-a599-d24188f373d6

## How settlement works

Users link a **bank account** (simulated sandbox in this demo). TwoWay creates an **invisible Stellar wallet** behind it; users never see keys or hold USDC.

| Step | What happens | Crypto / Soroban? |
|---|---|---|
| **Place order** | Server checks the linked bank's available balance (minus reservations for other open orders) and stores the order in SQLite. The sender picks how they'll pay the matched part (linked bank, debit card, Interac, M-Pesa, cash at MoneyGram…). | None |
| **Match** | FIFO per corridor, partial fills, integer 7-decimal amounts (`server/matching.ts`), one DB transaction. Counterparties are anonymous to each other. Matched volume is settled locally (`server/netting.ts`, simulated rails); if paid from the linked bank, the bank is debited. | None |
| **Timer runs out** | Now the exact unmatched amount is known. Only that amount is debited from the bank, the treasury sends that much testnet USDC into the invisible wallet (standing in for a bank → USDC on-ramp), the wallet approves the contract, and `payout_remainder` sends it to the recipient (`server/orders.ts`, `server/worker.ts`). | **Yes**, for the unmatched amount only |

Contract: [`soroban/contracts/twoway_settlement`](soroban/contracts/twoway_settlement/src/lib.rs). Admin-only, at most one payout per order id, bounded by the wallet's allowance. The server is custodial in this demo: it holds the invisible wallets' keys (encrypted at rest) and is trusted to choose the recipient and amount from the database.

## Run Locally

**Prerequisites:** Node.js 22.5+ (uses built-in `node:sqlite`), Rust with the `wasm32v1-none` target, and the Stellar CLI.

1. Install dependencies: `npm install`
2. Deploy the contract to testnet (creates a funded `twoway-operator` key and writes `OPERATOR_SECRET`, `SETTLEMENT_CONTRACT_ID`, `USDC_CONTRACT_ID` to `.env.local`): `npm run deploy:contract`
3. Create the testnet USDC treasury (Friendbot + XLM → USDC DEX swap; writes `TREASURY_SECRET`): `npx tsx scripts/setup-treasury.ts 3000`
4. Run the server + app: `npm run dev` → http://localhost:3000 (SQLite DB in `data/twoway.db`)
5. Click **Link Bank Account**, then send.

Tests: `npm test` (matching engine) and `npm run test:contract` (Soroban contract).

Recipients need a Stellar address with a USDC trustline (the Send form's "Use testnet demo address" fills one). Demo counterparties (Transaction History → Load Canonical Scenario, Live Orders → Simulate anonymous opposing order) are demo bank-linked accounts created on first use.
