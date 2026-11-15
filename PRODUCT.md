# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, held equally:

- **Evaluators.** Hackathon and Stellar Community Fund judges, investors, and prospective partners (money transfer operators, agencies, anchors). Their job is to verify that matching works and that only the unmatched remainder settles on-chain, using the live testnet, the Demo & Tests launcher, and Stellar Expert links.
- **Senders and recipients.** People who send small cross-border remittances often, such as overseas workers supporting family. Their job is to send money home cheaply without learning crypto tooling. They link the bank or mobile-money account they already use, pick a matching window, and follow their transfer to payout.

The app has to persuade evaluators and still read as a sender app you could trust with real money.

## Product Purpose

Tandem matches cross-border transfers going in opposite directions on the same corridor. Matched amounts are paid out domestically on each side, so they skip both conversion fees and the border crossing. Only the unmatched remainder crosses the border, as USDC on Stellar, settled by a Soroban contract.

Success means a lower all-in cost to the sender than a conventional remittance on the same corridor, and evaluators being able to see that cost difference and verify it on-chain.

Tagline: **Send together, save together.**

## Positioning

The mechanism is netting opposing retail flows on a corridor, which is different from routing every transfer through a cheaper rail. A matched amount never touches crypto or a border at all. Stellar is used only for what is left over, and that leftover payment is publicly verifiable as one `settle_remainder` call. Users never create a wallet: a server-held Stellar wallet sits behind a linked bank account.

## Operating Context

- **Send flow.** Choose a corridor and amount, choose a funding method, and set a timer for how long Tandem should look for a match. Orders are matched oldest first, fully or partially. When the timer ends, the remainder pays out on-chain.
- **Tabs.** Send, Live Orders, My Transactions, Transaction History, Calculator, Demo & Tests.
- **Corridors.** The fee spreadsheets and `shared/corridors.json` drive these app-wide. Current pairs are Canada–US, US–EU, Canada–EU, Canada–Kenya, US–Philippines and **UAE ⇄ Philippines, the launch corridor** (pitch context: about 975k Filipinos in the UAE, about $1.6B a year in remittances). It is supported in both directions with sourced fee rows (Nov 2026). All corridors stay; the launch corridor is the one the story leads with.
- **Evidence trail.** Every remainder payout links to Stellar Expert. `docs/TESTING.md` describes the browser, manual and automated verification paths.
- **Recipients.** After payout, recipients can find nearby anchors to cash out.
- **Go to market.** Sell first to money transfer operators and agencies as an aggregator and netting layer. Planned later: Tandem as an API, multi-agency matching, anchor account linking, and B2B bulk transfers.

## Capabilities and Constraints

- Runs on Stellar **testnet** with test USDC. Bank, card and mobile-money funding rails are simulated, and the linked bank account is a sandbox.
- Matching and netting happen off-chain in SQLite. On-chain, only the unmatched remainder settles, through Soroban `approve` / `transfer_from`.
- Fees come from spreadsheets in `shared/fees/` (verified and matched matrices) plus World Bank remittance averages when no live quote exists. FX rates in `shared/fx_rates.json` are indicative, not live.
- AED → PHP has no live Wise quotes (Wise doesn't yet offer it to UAE senders), so the app shows the World Bank corridor average (3.04%) and sourced exchange-house and app quotes for that direction. Philippine banks publish no outward FX markup, so PHP → AED has no bank-markup comparison.
- Stack: React 19 + Vite + Tailwind v4 front end, Python backend, Rust Soroban contract.
- Terminology: *corridor*, *matched* (paid locally), *unmatched remainder* (sent as USDC), *matching window / timer*, *anchor*, *invisible wallet*.

## Brand Commitments

- **The name is Tandem.** "TwoWay" / "TwoWay Stellar" is a legacy codename. Remove it from user-facing copy over time; it still appears in og:title, `docs/TESTING.md` and storage keys.
- Logo: `src/assets/tandem-logo.png`, two overlapping green and blue discs.
- Tagline: "Send together, save together."

## Evidence on Hand

- A live settlement contract on testnet, plus an example payout transaction (10 USD order, 3 matched, exactly 7 USDC on-chain). Both are linked in `docs/TESTING.md`.
- Sourced fee data per corridor in `shared/fees/*.csv`, with source URLs.
- Market figures for the UAE → Philippines corridor in the README.
- None of the following exist yet, so do not fabricate them: users, customers, partner MTOs, testimonials, mainnet volume, pricing, or licensing and compliance status.

## Product Principles

1. **Show the saving, prove the settlement.** Every cost claim traces to a sourced fee figure, and every on-chain claim links to a verifiable transaction.
2. **Crypto stays invisible to senders.** Never ask a sender to manage a wallet, key or token. Stellar appears as evidence, not as homework.
3. **Honest about the worst case.** An unmatched transfer costs about what it would anyway. Never imply savings that a match did not produce.
4. **Every participant improves the match.** Volume in either direction helps everyone, so frame features around the two-sided corridor rather than a single sender.
5. **Testnet is labelled as testnet.** Simulated rails and test funds are always distinguishable from real money.
