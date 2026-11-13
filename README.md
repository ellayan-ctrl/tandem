[Tandem README (1).md](https://github.com/user-attachments/files/34779035/Tandem.README.1.md)
# Tandem

**Send together, save together.**

Tandem is a peer-to-peer remittance app that lowers fees and makes cross-border transfers more accessible by matching opposite transfers (like CAD to KES and KES to CAD), paying each out domestically, and sending only the unmatched remainder across the border as USDC on Stellar.

---

## The problem

Moving money on the Stellar network is already fast and cheap. *TODO: cite Stellar's published fee and speed figures here.*

The real hurdle is everything around it:

- **Accessibility.** Using blockchain to send money still means setting up wallets and learning crypto tooling.
- **Conversion costs.** The sender pays to convert cash into transferable coins, and the recipient pays again to convert those coins back into usable cash.

These costs fall hardest on people who send small amounts often. *TODO: name the specific community here. Our launch corridor is the UAE and the Philippines, where workers in the UAE send money home to families in the Philippines.*

---

## How Tandem works

### 1. Invisible wallet (accessibility)

- Senders never create a crypto wallet.
- They log in with the anchor they already use, such as a bank or M-PESA.
- Funds stay in the sender's account and are not converted to crypto until they need to be, which keeps fees down.

### 2. Bidirectional matching (lower ramping costs)

1. A sender chooses to send an international transfer and sets a timer for how long Tandem should look for a match.
2. While the timer runs, the algorithm continuously checks the orders submitted between the two countries.
3. It checks in order of submission, so older orders are filled first.
4. It looks for transfers going in the opposite direction between the same countries.
5. If it finds one, the two transfers are fully or partially matched.
6. The matched amount is **not** sent internationally. It is paid out domestically through the sender's and receiver's chosen anchors.
7. The unmatched amount crosses the border over the Stellar network.

```mermaid
flowchart LR
  subgraph UAE["UAE (AED)"]
    X["Sender X<br/>Sends abroad"]
    W["Receiver W<br/>Gets from abroad"]
  end
  S["Stellar USDC<br/>Unmatched only"]
  subgraph PH["Philippines (PHP)"]
    Y["Receiver Y<br/>Gets from abroad"]
    Z["Sender Z<br/>Sends abroad"]
  end
  X -->|paid locally| W
  Z -->|paid locally| Y
  X -.->|unmatched remainder| S
  S -.->|unmatched remainder| Y

  classDef person fill:#E1F5EE,stroke:#0F6E56,color:#085041
  classDef rail fill:#EEEDFE,stroke:#534AB7,color:#3C3489
  class X,W,Y,Z person
  class S rail
```

*Solid arrows are matched amounts, paid out locally with no crypto involved. Dotted arrows are the unmatched remainder, which crosses the border on Stellar. In this example the remainder flows toward Y, but it would flow in whichever direction is larger.*

### 3. Tridirectional+ matching (lower ramping costs)

Matching is not limited to two people. Say sender X in country A wants to pay Y in country B, while another person in country B (Y2) wants to pay Z. Instead of each leg being converted from cash to crypto and back to cash in every country, the algorithm looks for matches across the chain. It can route crypto from X straight to Z, fully or partially, and any unmatched amount goes through the regular routing described above.

### 4. Anchors near me (accessibility)

After receiving their unmatched crypto and matched e-transfer or cash, recipients can log in and see location-based suggestions for where to convert their digital funds into cash if they need to.

### Other features

- Transaction history with transparency on how each transfer was routed
- A dashboard of all transactions

---

## What this saves

Without matching, every transfer pays to convert cash into USDC at one end and back into cash at the other. With matching, matched amounts skip both conversions and the border crossing entirely.

```mermaid
flowchart LR
  subgraph before["Without Tandem (per transfer)"]
    direction LR
    A1["Sender X<br/>AED cash"] --> A2["On-ramp<br/>Fee"] --> A3["Stellar<br/>Cheap, fast"] --> A4["Off-ramp<br/>Fee"] --> A5["Receiver Y<br/>PHP cash"]
  end
  subgraph after["With Tandem (fully matched)"]
    direction LR
    B1["Sender X"] --> B2["Local transfer"] --> B3["Receiver W"]
    C1["Sender Z"] --> C2["Local transfer"] --> C3["Receiver Y"]
  end
  before ~~~ after

  classDef fee fill:#FAECE7,stroke:#993C1D,color:#712B13
  classDef neutral fill:#F1EFE8,stroke:#5F5E5A,color:#2C2C2A
  classDef local fill:#E1F5EE,stroke:#0F6E56,color:#085041
  class A2,A4 fee
  class A1,A3,A5,B1,B3,C1,C3 neutral
  class B2,C2 local
```

Two opposite transfers without Tandem cost four conversion fees and two border crossings. With a full match, there are no conversion fees and no border crossing, only local transfer fees.

### Best, middle, and worst case

| Case | What happens |
| --- | --- |
| **Worst case (same as before)** | No matches, which is likely in heavily one-directional corridors. The transfer goes through regular transfer services chosen by the sender. |
| **Middle case (partial savings)** | A partial match saves crypto conversion fees on the matched part. The remainder is sent at regular domestic e-transfer or bank transfer rates, based on the anchor the user chooses. |
| **Best case (full savings)** | A full match means the international transfer is supported entirely by domestic transfers, with cheaper domestic fees. |

---

## Outcomes

- Reduced cash-to-crypto conversion costs
- Less illiquidity, since fewer people ask agents and anchors to convert crypto into cash
- Better access to Stellar's cost and speed benefits

---

## Business model

Tandem works best at scale, because more transfers in both directions means more matches. Business users who frequently send bulk transfers in both directions of a country pair make a large share of retail matching possible.

- **Where the revenue comes from.** We position Tandem first as an aggregator for existing money transfer operators (MTOs), and ideally sell the platform to agencies and anchors.
- **How users benefit.** Lower fees on matched transfers, and no crypto wallet required.
- **How agencies and anchors benefit.** *TODO: spell out why agencies and anchors would support this, for example less demand to convert crypto into cash, and a new service built for their community at lower fees.*

---

## Future features and opportunities

- Tandem is built for end customers today, but matching is best when several transfer agencies use it together. We could partner with or sell the platform to agencies, and add crypto exchange as a new community-focused service with lower fees.
- Partner with anchors so users can link their accounts and quickly convert between digital currency and cash when a transfer is sent.
- B2B transfers across borders, to lower the cost and time delay of bulk payments.

---

## Status

*TODO: add project status, team, and how to run or contribute.*
