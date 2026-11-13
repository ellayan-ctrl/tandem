# Testing TwoWay on Stellar Testnet

Everything here uses the real Stellar testnet: real wallets, real (test) USDC, real transactions you can open on a public explorer. There are three ways to check it, from least to most effort.

| | Needs | Time |
|---|---|---|
| [A. Check the live contract in a browser](#a-check-the-live-contract-in-a-browser-nothing-to-install) | A browser | 2 min |
| [B. Use the app by hand, then check the blockchain](#b-use-the-app-by-hand-then-check-the-blockchain) | The app running locally | 10 min |
| [C. One-command automated test](#c-one-command-automated-test-optional) | The app running locally | 2–6 min |

What should be true in every case:

1. **Nothing goes on-chain while an order is waiting.** Placing and matching orders only touches the server's database.
2. **When the timer runs out, only the unmatched part goes on-chain**, as one `settle_remainder` call to the contract that moves exactly that much USDC.
3. **The matched part never appears on-chain.**

## A. Check the live contract in a browser (nothing to install)

1. Open the contract on Stellar Expert:
   https://stellar.expert/explorer/testnet/contract/CBWQSYQH2DZDJ4IXWBWNN35KWJR6BKADT6YBCJJ2XJHXY7E3325WRQKE
   Its history lists every `settle_remainder` call, one per paid-out order.
2. Open one example payout:
   https://stellar.expert/explorer/testnet/tx/ec2d7c10cfe07c6b66c0d605eb66af01f2c488c818b538bf813b26fcc0f43025
   That order was 10 USD, 3 matched locally. The transaction calls `settle_remainder` with total 10 and matched 3, and moves **exactly 7 USDC** from the sender's wallet to the recipient. The 3 matched never went on-chain.

## B. Use the app by hand, then check the blockchain

Start the app once (see the README for first-time setup):

```bash
npm run dev
```

Open http://localhost:3000.

### 1. Link an account

1. Click **Link Bank Account** (top right). Choose **Canada**, any bank, and fill in sample details. Nothing real is connected.
2. Wait about 10 seconds: the app creates a real testnet wallet for you.
3. Open the **My Transactions** tab. Copy **Your receiving address** and open the ↗ icon next to it: it's your wallet on Stellar Expert. Note that it holds **0 USDC**.

### 2. Send money with a timer

1. **Send** tab → **Transfer Matching (Timed)**.
2. Send **10 USD**, Canada → Kenya. Click **Use testnet demo address** for the recipient.
3. Set the matching window slider to **3 minutes** (enough time for the next steps), then send.
4. The receipt opens: *"Nothing has been charged yet"*. **Expected: nothing on-chain.**

### 3. Get part of it matched

1. **Live Orders** tab → **Simulate anonymous opposing order**. Someone in Kenya sends money to Canada, and 60% of your order (6 USD) matches.
2. Open your order. It shows **6 matched locally · 4 unmatched**, still waiting.
3. **Expected: still nothing on-chain.** Refresh the recipient on Stellar Expert (in your order's receipt): no new USDC.

### 4. Let the timer run out

1. Wait for the countdown to reach zero. (Or, in **Live Orders**, click **Send Remainder** on the order to end the window now.)
2. Within about 20 seconds the status becomes **Completed**, and the receipt shows a **Soroban Remainder Payout Tx**.
3. **My Transactions** shows the order as *Sent*, with **6 matched locally · 4 unmatched (4 sent as USDC)** and a **View on Stellar Expert** link.

### 5. Check it on the blockchain yourself

Click **View on Stellar Expert** (or paste the tx hash into the search box at https://stellar.expert/explorer/testnet). You should see:

- a call to the contract `CBWQ…RQKE`, function `settle_remainder`, with total **10** and matched **6**;
- **exactly 4 USDC** moving from your wallet to the recipient, and nothing for the 6 that matched;
- a time **after** your order's deadline (the contract refuses to settle before the deadline).

### 6. See money you received

1. Open a **private browser window** at http://localhost:3000 (a separate session) and link a second account, for example in **Kenya**.
2. From that second account, **Send** to the first account: paste the first account's **receiving address** (from step 1) as the recipient. Use a 1-minute window.
3. Back in the first window, **My Transactions** → **Received** shows it with a green **+** amount, *From* the second account's name. Once the minute is up, it gets its own **View on Stellar Expert** link, and your wallet's USDC balance on Stellar Expert goes up by that amount. (If part of it matched someone else's open transfer in the other direction, only the unmatched part arrives on-chain; the matched part is paid locally.)

### 7. Optional: chain routing

Place another Canada → Kenya order, then in **Live Orders** click **Simulate onward order (chain)**. Someone in Kenya now sends to Nigeria: your recipient in Kenya is paid locally, and that part of your money becomes one routed **Canada → Nigeria** transfer (shown in My Transactions as *routed via Kenya*). It keeps the earlier of the two deadlines and settles the same way.

### Cash in & cash out

The bottom of **My Transactions** lists services that convert between local money and USDC on Stellar, for your account's country (switch countries with the selector). The list comes live from the public Stellar Scout partner directory, the same data the Raven MCP server serves. Services are ranked: based in that country first, then the region, then worldwide. For MoneyGram, **locations near me** opens a map of nearby cash points. If the directory is unreachable, the app shows a dated offline copy and says so. The app's own USDC is testnet USDC and cannot be cashed out.

## C. One-command automated test (optional)

This drives the app like a user and checks the result directly on the blockchain (the contract's own record, the transaction on Horizon, and the recipient's balance). With the app running:

```bash
npm run test:testnet -- --check     # checks your setup; creates and spends nothing
npm run test:testnet                # 10 USD, 3 matched, real 1-minute timer, verifies the 7 USD payout (~2 min)
npm run test:testnet -- --routing   # also chain routing, real timers (~6 min)
```

Each check prints `PASS` or `FAIL` with Stellar Expert links. The last line is `ALL CHECKS PASSED: verified on the Stellar testnet.` or a list of what failed. The test never touches existing orders: it picks countries that have none open.

## Check the contract from a terminal

```bash
stellar contract invoke --id CBWQSYQH2DZDJ4IXWBWNN35KWJR6BKADT6YBCJJ2XJHXY7E3325WRQKE \
  --source-account <any-key> --network testnet -- stats
```

This only reads. Amounts are in units of 10,000,000 (`"70000000"` = 7 USDC): `settled_volume` is what moved on-chain, `matched_volume` what was matched off-chain.

## If something goes wrong

| Message | Fix |
|---|---|
| `the app is not reachable` | Start it: `npm run dev`, in another terminal |
| `the app uses the contract from .env.local` is FIX | Stop the app (Ctrl+C) and start it again |
| `the treasury has … USDC` is FIX | `npm run setup:treasury -- 3000` |
| `the operator account has … XLM` is FIX | `stellar keys fund twoway-operator --network testnet` |
| `open orders already exist in every test country` | Orders from your own testing are still waiting. Let them expire (or use *Send Remainder*) and run again. |
| An order shows *Payout failed, retrying* | The server retries on its own. If it keeps failing, copy the error from the receipt. |
