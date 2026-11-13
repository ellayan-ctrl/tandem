# TwoWay Stellar

Cross-border transfers that match opposite-direction payments, so most of the money never crosses a border. Only the **unmatched remainder** is converted to USDC and settled on Stellar, by a Soroban contract, when the sender's matching window closes.

## Live on Stellar Testnet

| | |
|---|---|
| **Settlement contract ID** | `CBWQSYQH2DZDJ4IXWBWNN35KWJR6BKADT6YBCJJ2XJHXY7E3325WRQKE` |
| **Explorer** | [View on Stellar Expert](https://stellar.expert/explorer/testnet/contract/CBWQSYQH2DZDJ4IXWBWNN35KWJR6BKADT6YBCJJ2XJHXY7E3325WRQKE) |
| **Token** | Circle testnet USDC (`CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`) |

Read it from a terminal (sends nothing):

```bash
stellar contract invoke --id CBWQSYQH2DZDJ4IXWBWNN35KWJR6BKADT6YBCJJ2XJHXY7E3325WRQKE \
  --source-account <any-key> --network testnet -- stats
```

`stats` returns the settlement count, total order volume, the part matched off-chain, and the part settled on-chain.

## How it works

Users link a payment method (simulated in this demo). TwoWay creates a hidden Stellar wallet behind it; users never handle keys or USDC.

1. **Place order.** The server checks the linked method's balance (minus holds for other open orders) and stores the order in SQLite. The sender chooses a matching window, how to pay the matched part, and where the unmatched part comes from. Nothing touches the blockchain.
2. **Match.** Opposite-direction orders (Canada → Kenya against Kenya → Canada) are matched first-in-first-out, with partial fills. Matched money is paid locally in each country. Counterparties stay anonymous.
3. **Chain routing.** If A → B and B → C are both waiting, B's sender pays A's recipient locally in B, and A's money becomes one routed A → C transfer. The routed transfer matches like any other order and keeps the earlier of the two deadlines.
4. **Timer runs out.** Only now is the unmatched amount known. It is debited from the sender's account, converted to USDC (a testnet treasury stands in for the on-ramp), and the contract pays the recipient.

Matching and routing: [`backend/matching.py`](backend/matching.py), [`backend/orders.py`](backend/orders.py).

### The contract

[`soroban/contracts/twoway_settlement`](soroban/contracts/twoway_settlement/src/lib.rs) is a small Rust contract. `settle_remainder` is admin-only and enforces on-chain that:

- the matching window has closed (ledger time ≥ deadline, otherwise `TooEarly`);
- the amount moved equals total − matched;
- each order is settled at most once, within the wallet's allowance.

It stores a `settlement(order_id)` record and running `stats()`, and has `pause`/`unpause` and an admin-only `upgrade`. In this demo the server holds the hidden wallets' keys (encrypted at rest) and reports the recipient and amounts from its database.

## Run locally

**Needs:** Python 3.9+, Node.js, Rust with the `wasm32v1-none` target, and the [Stellar CLI](https://developers.stellar.org/docs/tools/cli).

```bash
npm run setup                  # Python venv + npm packages
npm run deploy:contract        # build + deploy to testnet, writes .env.local
npm run setup:treasury -- 3000 # fund the testnet USDC treasury
npm run dev                    # http://localhost:3000
```

Then click **Link Bank Account** and send. The server (FastAPI) runs on :8000 and Vite serves the app on :3000. API docs are at `/api/docs`.

For production: `npm run build && npm start`.

## Test it

| Command | What it checks |
|---|---|
| `npm test` | 42 Python tests: matching, chain routing, balance holds, validation, wallet encryption |
| `npm run test:contract` | 11 Soroban contract tests: deadline, amounts, double settlement, allowance, pause, auth |
| `npm run test:testnet` | End to end on Testnet (app must be running), with the real timer. Verifies the result **directly on the blockchain**: the contract's own settlement record, the transaction on Horizon, and the recipient's balance. Prints Stellar Expert links. Add `-- --check` to check your setup first, `-- --routing` to also test chain routing. See [docs/TESTING.md](docs/TESTING.md). |

In the app, **Live Orders** has demo buttons: *Simulate anonymous opposing order* and *Simulate onward order (chain)*. For a custom recipient, the address needs a USDC trustline; the Send form's "Use testnet demo address" fills one.

## Project layout

| Part | Language | Where |
|---|---|---|
| Settlement contract | Rust (soroban-sdk) | `soroban/` |
| Server: API, order book, matching, payouts, timer worker | Python (FastAPI, stellar-sdk) | `backend/`, `tests/` |
| Front end | JavaScript (React, Vite, Tailwind) | `src/` |
| Shared data (payment methods, FX rates) | JSON | `shared/` |
| Deploy and setup | Shell, Python | `scripts/` |
