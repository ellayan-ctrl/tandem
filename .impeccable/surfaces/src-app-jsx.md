---
version: 1
slug: "src-app-jsx"
primary_target: "src/App.jsx"
related_targets: ["src/components/Header.jsx","src/components/SendTransferForm.jsx","src/components/MyTransactions.jsx","src/components/OrderReceiptModal.jsx"]
---

# Sender path (app shell, Send, My transfers, receipt)

## Scope and mode

Operate. Header/app shell, Send tab, My Transactions tab, order receipt modal, bank-account modal. The other tabs (Live Orders, History, Calculator, Demo & Tests) move onto the same tokens in this pass so nothing clashes; a deeper redesign comes later.

## Audience and job

Senders (an overseas worker sending home on a phone or laptop) and evaluators (checking the matched vs on-chain split and the Stellar Expert proof). The job is to send money with a matching window, then follow it to payout. The user approved rewriting copy into plain finance language. Facts, numbers and testnet labelling stay. Crypto and contract detail moves into secondary detail where evaluators can still find it.

Must not feel like a crypto app, must not feel playful, and must not hide the proof.

## Direction contract

THESIS: Each corridor is a transit line with two directions, and a transfer is a scheduled departure. The matched part stays on the platform and is paid locally. Only the remainder boards and crosses on Stellar. This refuses the slate card-stack fintech form with a black button.

OWN-WORLD: The shell is a navy enamel top bar (#0F2233) over a cool off-white ground (#F4F6F5), with white work panels topped by a 3px ink rule rather than rounded shadow cards. Two line colours do real jobs: green #2F8A5B means paid locally/matched, and blue #3A6EA5 means crosses on Stellar/remainder. Amber #C98A12 means the window is closing or on testnet, and red is reserved for failure. Type is Barlow with Barlow Semi Condensed uppercase labels, and every figure is tabular. No decorative grey. Countries appear as two-letter station-code tags, not emoji.

STORY: The visitor sees the route, how much will likely stay local, what crosses, and the fees before committing. Then they press Send, and later read each transfer as a timetable row with its route strip and status.

FIRST VIEWPORT: The navy bar holds the logo, standard tabs, a testnet tag and an account button. Below it are two columns. The left column holds the from/to station pair with a swap control, a large amount input, pay-from and recipient fields, and departure-time choices set as a timetable row. The right column holds a sticky route panel: the route strip split green and blue at the expected match, a matched/remainder split, fee lines, and a total. The isolated Send button with its confirmation line sits there.

FORM: Corridor Timetable, position 6 of 7 on my ordered list (assigned by the roll). seed:12499ea461228046. The signature move is the route strip: every amount is drawn as a line between two station stops, split green (local) and blue (crosses). It appears on Send, on each My-transfers row and in the receipt. Raises: no decorative grey (Datamatics); one fixed baseline for stages (Botanical Folio); proof opens on focus (Streaming Wall); irreversible actions isolated (Dev Console); one shared column grid (Crouwel).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
