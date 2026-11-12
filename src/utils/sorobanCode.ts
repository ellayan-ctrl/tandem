/**
 * The deployed Soroban contract source (soroban/contracts/twoway_settlement/src/lib.rs),
 * imported verbatim so the docs page always shows the real contract.
 */
import contractSource from '../../soroban/contracts/twoway_settlement/src/lib.rs?raw';

export const SOROBAN_RUST_CONTRACT_CODE: string = contractSource;

export const ARCHITECTURE_COMPONENTS = [
  {
    title: '1. Linked bank account (no crypto until settlement)',
    tag: 'Bank + invisible wallet',
    description:
      "A user links a bank account (simulated sandbox in this demo); TwoWay creates an invisible Stellar wallet behind it. Placing an order only checks the bank balance and reserves the amount. Nothing is converted to USDC and nothing touches Soroban while the order waits for a match.",
    invariants: [
      'Order time: bank balance check + reservation only',
      'Users never see keys or hold USDC',
      'Wallet keys are server-held and encrypted at rest (custodial demo)',
    ],
  },
  {
    title: '2. Off-chain Matching Engine (SQLite)',
    tag: 'Server',
    description:
      'Orders live in a SQLite book. FIFO time-priority matching per country pair with partial fills, on integer 7-decimal amounts. Matched volume cancels out and is settled off-chain through a pluggable netting method; it never touches Soroban.',
    invariants: [
      'Each match runs in one DB transaction',
      'No float dust: amounts are integer units (1 USDC = 10^7)',
      'Matched volume costs zero on-chain fees',
    ],
  },
  {
    title: '3. Soroban Remainder Settlement',
    tag: 'On-Chain Rust',
    description:
      "Only when the timer runs out does the system know exactly how much must cross the border. At that moment it debits exactly the unmatched amount from the bank, the on-ramp (a testnet treasury here) converts it to USDC in the invisible wallet, and the settlement contract's payout_remainder sends that exact amount to the recipient.",
    invariants: [
      'Admin (operator) auth required: admin.require_auth()',
      'At most one payout per order id (AlreadyPaid)',
      "Bounded by the sender's allowance and its expiry",
    ],
  },
  {
    title: '4. Stellar Anchor Interoperability (SEP-24 / SEP-31)',
    tag: 'Fiat Ramp Synergy',
    description:
      'The real economic breakthrough: local anchors in Nairobi (M-Pesa/Kotani Pay) and Toronto (PayTrie/Interac) net their physical fiat liabilities locally without relying on slow, expensive SWIFT correspondent banking.',
    invariants: [
      'Bypasses international nostro/vostro pre-funding requirements',
      'Eliminates 2-4% banking foreign exchange spread',
      'Converts gross cross-border settlement into local net settlement',
    ],
  },
];
