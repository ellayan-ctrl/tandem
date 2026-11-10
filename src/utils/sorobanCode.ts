/**
 * Soroban Smart Contract Architecture Specification & Rust Implementation
 * Protocol: Two-Way Street USDC Transfer Escrow & Netting Contract
 * Target: Stellar Soroban SDK v21+
 */

export const SOROBAN_RUST_CONTRACT_CODE = `//! Two-Way Street USDC Cross-Border Escrow & Settlement Contract
//! Stellar Innovation Challenge Hackathon
#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype,
    token, Address, Env, String, Symbol, Vec, Val
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum EscrowError {
    AlreadyInitialized = 1,
    Unauthorized = 2,
    InvalidAmount = 3,
    OrderNotFound = 4,
    OrderNotOpen = 5,
    DeadlineNotReached = 6,
    DeadlineAlreadyPassed = 7,
    CorridorMismatch = 8,
    InsufficientEscrowBalance = 9,
    ZeroFillProhibited = 10,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[contracttype]
pub enum RemainderPolicy {
    DirectStellarFallback = 1, // Fallback to immediate direct payment
    RefundToSender = 2,        // Return remaining USDC to sender
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[contracttype]
pub enum OrderStatus {
    Open = 1,
    PartiallyMatched = 2,
    Settled = 3,
    Refunded = 4,
    FallbackExecuted = 5,
    Cancelled = 6,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct TransferIntent {
    pub order_id: u64,
    pub sender: Address,
    pub recipient: Address,
    pub from_country: Symbol,
    pub to_country: Symbol,
    pub total_amount: i128,
    pub matched_amount: i128,
    pub remaining_amount: i128,
    pub deadline_ledger: u32,
    pub policy: RemainderPolicy,
    pub status: OrderStatus,
    pub created_at_ledger: u32,
}

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    UsdcToken,
    NextOrderId,
    Order(u64),
    CorridorVolume(Symbol, Symbol),
}

#[contract]
pub struct TwoWayEscrowContract;

#[contractimpl]
impl TwoWayEscrowContract {
    /// Initialize the escrow with the official Stellar USDC token address
    pub fn initialize(env: Env, admin: Address, usdc_token: Address) -> Result<(), EscrowError> {
        admin.require_auth();
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(EscrowError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::UsdcToken, &usdc_token);
        env.storage().instance().set(&DataKey::NextOrderId, &1u64);
        Ok(())
    }

    /// User creates a cross-border transfer intent and locks USDC into Soroban escrow
    pub fn deposit_intent(
        env: Env,
        sender: Address,
        recipient: Address,
        from_country: Symbol,
        to_country: Symbol,
        amount: i128,
        deadline_ledgers: u32,
        policy: RemainderPolicy,
    ) -> Result<u64, EscrowError> {
        // Enforce sender cryptographic authorization
        sender.require_auth();

        if amount <= 0 {
            return Err(EscrowError::InvalidAmount);
        }

        let usdc_address: Address = env.storage().instance().get(&DataKey::UsdcToken).unwrap();
        let usdc_client = token::Client::new(&env, &usdc_address);

        // Securely transfer USDC from sender to this smart contract escrow
        usdc_client.transfer(&sender, &env.current_contract_address(), &amount);

        let order_id: u64 = env.storage().instance().get(&DataKey::NextOrderId).unwrap_or(1);
        env.storage().instance().set(&DataKey::NextOrderId, &(order_id + 1));

        let current_ledger = env.ledger().sequence();
        let deadline = current_ledger + deadline_ledgers;

        let intent = TransferIntent {
            order_id,
            sender,
            recipient,
            from_country,
            to_country,
            total_amount: amount,
            matched_amount: 0,
            remaining_amount: amount,
            deadline_ledger: deadline,
            policy,
            status: OrderStatus::Open,
            created_at_ledger: current_ledger,
        };

        // Store with temporary/instance storage with automatic TTL extension
        env.storage().temporary().set(&DataKey::Order(order_id), &intent);
        env.storage().temporary().extend_ttl(&DataKey::Order(order_id), 100, 1000);

        // Emit Soroban topic event
        env.events().publish((Symbol::new(&env, "intent_deposited"), order_id), (amount, deadline));

        Ok(order_id)
    }

    /// Match engine relayer executes bilateral netting batch
    pub fn settle_matched_pair(
        env: Env,
        order_a_id: u64,
        order_b_id: u64,
        fill_amount: i128,
    ) -> Result<(), EscrowError> {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        if fill_amount <= 0 {
            return Err(EscrowError::ZeroFillProhibited);
        }

        let mut order_a: TransferIntent = env.storage().temporary().get(&DataKey::Order(order_a_id))
            .ok_or(EscrowError::OrderNotFound)?;
        let mut order_b: TransferIntent = env.storage().temporary().get(&DataKey::Order(order_b_id))
            .ok_or(EscrowError::OrderNotFound)?;

        // Verify corridor symmetry (A->B matches with B->A)
        if order_a.from_country != order_b.to_country || order_a.to_country != order_b.from_country {
            return Err(EscrowError::CorridorMismatch);
        }

        if fill_amount > order_a.remaining_amount || fill_amount > order_b.remaining_amount {
            return Err(EscrowError::InvalidAmount);
        }

        let usdc_address: Address = env.storage().instance().get(&DataKey::UsdcToken).unwrap();
        let usdc_client = token::Client::new(&env, &usdc_address);

        // Disburse matched USDC directly to opposite recipients
        // Order A's escrow pays Recipient A (in destination country B)
        usdc_client.transfer(&env.current_contract_address(), &order_a.recipient, &fill_amount);
        // Order B's escrow pays Recipient B (in destination country A)
        usdc_client.transfer(&env.current_contract_address(), &order_b.recipient, &fill_amount);

        // Update Order A State
        order_a.matched_amount += fill_amount;
        order_a.remaining_amount -= fill_amount;
        order_a.status = if order_a.remaining_amount == 0 { OrderStatus::Settled } else { OrderStatus::PartiallyMatched };

        // Update Order B State
        order_b.matched_amount += fill_amount;
        order_b.remaining_amount -= fill_amount;
        order_b.status = if order_b.remaining_amount == 0 { OrderStatus::Settled } else { OrderStatus::PartiallyMatched };

        env.storage().temporary().set(&DataKey::Order(order_a_id), &order_a);
        env.storage().temporary().set(&DataKey::Order(order_b_id), &order_b);

        env.events().publish(
            (Symbol::new(&env, "pair_settled"), order_a_id, order_b_id),
            fill_amount
        );

        Ok(())
    }

    /// Resolve remainder once deadline has elapsed: trigger fallback direct transfer or refund
    pub fn resolve_unmatched_remainder(env: Env, order_id: u64) -> Result<(), EscrowError> {
        let mut order: TransferIntent = env.storage().temporary().get(&DataKey::Order(order_id))
            .ok_or(EscrowError::OrderNotFound)?;

        if order.status == OrderStatus::Settled || order.status == OrderStatus::Refunded || order.status == OrderStatus::FallbackExecuted {
            return Err(EscrowError::OrderNotOpen);
        }

        let current_ledger = env.ledger().sequence();
        if current_ledger < order.deadline_ledger {
            return Err(EscrowError::DeadlineNotReached);
        }

        let remainder = order.remaining_amount;
        if remainder <= 0 {
            return Ok(());
        }

        let usdc_address: Address = env.storage().instance().get(&DataKey::UsdcToken).unwrap();
        let usdc_client = token::Client::new(&env, &usdc_address);

        match order.policy {
            RemainderPolicy::DirectStellarFallback => {
                // Send remainder directly to recipient wallet
                usdc_client.transfer(&env.current_contract_address(), &order.recipient, &remainder);
                order.status = OrderStatus::FallbackExecuted;
                order.remaining_amount = 0;
            }
            RemainderPolicy::RefundToSender => {
                // Return remainder to sender wallet
                usdc_client.transfer(&env.current_contract_address(), &order.sender, &remainder);
                order.status = OrderStatus::Refunded;
                order.remaining_amount = 0;
            }
        }

        env.storage().temporary().set(&DataKey::Order(order_id), &order);
        env.events().publish((Symbol::new(&env, "remainder_resolved"), order_id), remainder);
        Ok(())
    }
}
`;

export const ARCHITECTURE_COMPONENTS = [
  {
    title: '1. Soroban Smart Contract Escrow',
    tag: 'On-Chain Rust',
    description:
      'Holds user USDC securely upon intent registration. Emits standardized Soroban event topics. Only releases funds upon verified bilateral pairing or deadline expiration with automated fallback/refund.',
    invariants: [
      'Total held USDC == Sum(active orders remaining_amount)',
      'Cryptographic sender auth required via require_auth()',
      'Deterministic state transitions: Open -> Matched/Settled -> Closed',
    ],
  },
  {
    title: '2. Deterministic Matching Engine',
    tag: 'Off-Chain Relayer',
    description:
      'Continuous double auction order queue running time-priority (FIFO) matching per corridor. Identifies equal and fractional opposing transfer requests, batches settlement transactions, and triggers on-chain settlement.',
    invariants: [
      'Zero price slippage: All transfers are 1:1 USDC stablecoin parity',
      'Fair time-priority ordering prevents front-running',
      'Atomic batch execution bounds gas fees to fractional stroops',
    ],
  },
  {
    title: '3. Adaptive Remainder Policy Router',
    tag: 'User Sovereignty',
    description:
      'Solves the classical liquidity problem in cross-border matching: if opposing demand is insufficient, users never get stranded. The smart contract automatically executes their pre-signed fallback preference.',
    invariants: [
      'Fallback Option A: Direct Stellar PaymentOp delivers USDC to recipient on time',
      'Fallback Option B: Trustless un-escrow refunds USDC back to sender wallet',
      'Zero manual dispute arbitration needed',
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
