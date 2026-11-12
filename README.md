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
| **Match** | FIFO per corridor, partial fills, integer 7-decimal amounts (`backend/matching.py`), one DB transaction. Counterparties are anonymous to each other. Matched volume is settled locally (`backend/netting.py`, simulated rails) and debited from the payment method chosen to pay it. | None |
| **Timer runs out** | Now the exact unmatched amount is known. Only that amount is debited from the bank, the treasury sends that much testnet USDC into the invisible wallet (standing in for a bank → USDC on-ramp), the wallet approves the contract, and `settle_remainder` sends it to the recipient (`backend/orders.py`, `backend/worker.py`). | **Yes**, for the unmatched amount only |

Contract: [`soroban/contracts/twoway_settlement`](soroban/contracts/twoway_settlement/src/lib.rs). `settle_remainder` is admin-only and enforces on-chain that the matching window has closed (ledger time ≥ deadline, else `TooEarly`) and that remainder = total − matched; it settles each order at most once, bounded by the wallet's allowance, and stores a queryable `settlement(order_id)` record plus running `stats()`. It also has `pause`/`unpause` (emergency stop) and an admin-gated `upgrade`. The server waits for the ledger clock to pass the deadline before anything touches the chain. The server is custodial in this demo: it holds the invisible wallets' keys (encrypted at rest) and is trusted to report the recipient and amounts from the database.

## Project layout

| Part | Language | Where |
|---|---|---|
| Settlement contract | Rust (soroban-sdk) | `soroban/contracts/twoway_settlement/` |
| Server: API, SQLite order book, matching, netting, Soroban payouts, expiry worker | Python (FastAPI, stellar-sdk) | `backend/`, tests in `tests/` |
| Front end | JavaScript (React + JSX, Vite, Tailwind) | `src/`, `index.html` |
| Data shared by server and front end (payment methods, FX rates, remittance averages) | JSON | `shared/` |
| Contract deploy / treasury setup | Shell, Python | `scripts/` |

## Run Locally

**Prerequisites:** Python 3.9+, Node.js (for the Vite front-end tooling), Rust with the `wasm32v1-none` target, and the Stellar CLI.

1. Install dependencies (Python venv in `.venv/` + npm packages): `npm run setup`
2. Deploy the contract to testnet (creates a funded `twoway-operator` key and writes `OPERATOR_SECRET`, `SETTLEMENT_CONTRACT_ID`, `USDC_CONTRACT_ID` to `.env.local`): `npm run deploy:contract`
3. Create the testnet USDC treasury (Friendbot + XLM → USDC DEX swap; writes `TREASURY_SECRET`): `npm run setup:treasury -- 3000`
4. Run the server + app: `npm run dev` → http://localhost:3000. This starts the Python API on :8000 and the Vite dev server on :3000, which proxies `/api`. SQLite DB in `data/twoway.db`; API docs at http://localhost:3000/api/docs.
5. Click **Link Bank Account**, then send.

Production: `npm run build && npm start` serves the API and the built front end from Python on :3000.

Tests: `npm test` (Python: matching, amounts, payment-method validation, wallet encryption, order placement + netting) and `npm run test:contract` (Soroban contract).

Recipients need a Stellar address with a USDC trustline (the Send form's "Use testnet demo address" fills one). Demo counterparties (Transaction History → Load Canonical Scenario, Live Orders → Simulate anonymous opposing order) are demo bank-linked accounts created on first use.
