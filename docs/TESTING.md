# Testing TwoWay on Stellar Testnet

Two ways to check that it really works. Both use the real Stellar testnet: real wallets, real USDC, real transactions you can open on a public explorer.

## Option 1: one command (recommended)

1. Start the app in one terminal and leave it running:
   ```bash
   npm run dev
   ```
2. In a second terminal, in the project folder, first check your setup. This creates and spends nothing:
   ```bash
   npm run test:testnet -- --check
   ```
   Every line should say `OK`. A line saying `FIX` tells you exactly what to do.
3. Run the real test (about 2 minutes):
   ```bash
   npm run test:testnet
   ```

| Command | What it does | Time |
|---|---|---|
| `npm run test:testnet -- --check` | Checks the app, contract, funding and test countries only | seconds |
| `npm run test:testnet` | Sends 10 USD, matches 3, lets the **real 1-minute timer** run out, verifies the 7 USD payout | ~2 min |
| `npm run test:testnet -- --routing` | Also tests chain routing (A → B + B → C) with real timers | ~6 min |
| `npm run test:testnet -- --fast` | Same, but closes timers early instead of waiting | ~1 min |

### What the test proves

It drives the app like a user, then checks the result **directly on the blockchain**, without trusting the app:

- **Before the timer runs out:** the recipient holds 0 USDC, so nothing is on-chain yet.
- **The contract's own record** (read straight from the Soroban network): total 10, matched 3, remainder 7, the right sender and recipient, and settled **after** the deadline.
- **The payment on Horizon:** the transaction succeeded, was signed by the operator, and moved **exactly 7 USDC**, sender to recipient.
- **The recipient's wallet:** exactly 7 USDC, not 10. The matched 3 never went on-chain.

Each line prints `PASS` or `FAIL`. The last line is either `ALL CHECKS PASSED: verified on the Stellar testnet.` or a list of what failed. The exit code is 0 only if everything passed.

Every wallet and transaction is printed as a Stellar Expert link. Open them to see it with your own eyes.

## Option 2: use the app yourself, then check it on the blockchain

1. Open http://localhost:3000 and click **Link Bank Account**. Fill in any sample details.
2. **Send** tab → *Transfer Matching (Timed)*. Send 10 USD Canada → Kenya. Click *Use testnet demo address* for the recipient. Set the matching window with the slider (1 minute is fine).
3. **Live Orders** → *Simulate anonymous opposing order* to match part of it. *Simulate onward order (chain)* shows chain routing.
4. Wait for the timer, or click *Send Remainder* on the order. When it's paid, open the order's receipt and copy the **Soroban Remainder Payout Tx** hash.
5. Paste the hash into https://stellar.expert/explorer/testnet (search box). You should see exactly the unmatched amount of USDC going from your wallet to the recipient. The matched amount does not appear, because it never went on-chain.

## Check the contract directly

The contract keeps its own totals on the blockchain:

```bash
stellar contract invoke --id twoway --source-account twoway-operator --network testnet -- stats
```

Amounts are in units of 10,000,000 (`"70000000"` = 7 USDC). `settled_volume` is what moved on-chain; `matched_volume` is what was matched off-chain. If `twoway` isn't recognized, run this once:

```bash
stellar contract alias add twoway --id CBWQSYQH2DZDJ4IXWBWNN35KWJR6BKADT6YBCJJ2XJHXY7E3325WRQKE
```

You can also open the contract's page, with every payout it has made: https://stellar.expert/explorer/testnet/contract/CBWQSYQH2DZDJ4IXWBWNN35KWJR6BKADT6YBCJJ2XJHXY7E3325WRQKE

## If something goes wrong

| Message | Fix |
|---|---|
| `the app is not reachable` | Start it: `npm run dev`, in another terminal |
| `the app uses the contract from .env.local` is FIX | Stop the app (Ctrl+C) and start it again |
| `the treasury has … USDC` is FIX | `npm run setup:treasury -- 3000` |
| `the operator account has … XLM` is FIX | `stellar keys fund twoway-operator --network testnet` |
| `open orders already exist in every test country` | Orders from your own testing are still waiting. Let them expire (or send them with *Send Remainder*) and run again. The test never touches existing orders. |
| `Payout failed` / a check FAILs | Copy the full output into an issue or message; it says which check failed and why |

The test never changes or cancels your existing orders: matching is first-come-first-served, so it picks countries with no open orders.
