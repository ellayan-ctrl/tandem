//! TwoWay remainder settlement contract.
//!
//! Orders and matching live off-chain (SQLite). Matched volume is netted
//! off-chain and never touches this contract. Only the *unmatched remainder*
//! of an order is settled here, and only once the order's matching window has
//! closed. The contract enforces that itself: nothing can be settled before the
//! order's deadline according to the ledger clock.
//!
//! Flow at expiry (all in the same minute, nothing earlier):
//!   1. The sender's wallet receives exactly the remainder in USDC (on-ramp).
//!   2. The wallet signs a SEP-41 `approve` naming this contract as spender.
//!   3. The operator (admin) calls `settle_remainder`. The contract checks the
//!      deadline has passed and that `remainder = total - matched`, records the
//!      settlement, and pulls the remainder from sender to recipient with
//!      `transfer_from`. Each order can be settled at most once.
//!
//! Trust assumption: the operator reports `total`, `matched` and the recipient
//! from the off-chain order book; the contract bounds what it can do with them
//! (deadline, arithmetic, one settlement per order, the sender's allowance) and
//! publishes every settlement as an event and a queryable record.
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, BytesN, Env,
};

/// ~1 day / ~30 days of ledgers at ~5s per ledger.
const DAY_IN_LEDGERS: u32 = 17_280;
const BUMP_THRESHOLD: u32 = DAY_IN_LEDGERS;
const BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// Amounts must be positive and the matched part smaller than the total.
    InvalidAmount = 1,
    /// This order's remainder was already settled.
    AlreadyPaid = 2,
    /// Sender and recipient are the same account.
    SameAccount = 3,
    /// The order's matching window has not closed yet (ledger time < deadline).
    TooEarly = 4,
    /// Settlements are paused by the admin.
    Paused = 5,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Token,
    Paused,
    Stats,
    /// Amount paid out for an off-chain order id; presence means "already settled".
    Paid(u64),
    /// Full settlement record for an off-chain order id.
    Settlement(u64),
}

/// What was settled on-chain for one order.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Settlement {
    pub from: Address,
    pub to: Address,
    /// Whole order amount, in token units.
    pub total: i128,
    /// Part that was matched and netted off-chain (never touched this contract).
    pub matched: i128,
    /// `total - matched`: the only part that moved on-chain.
    pub remainder: i128,
    /// When the matching window closed (unix seconds).
    pub deadline: u64,
    /// Ledger close time when the remainder was settled (unix seconds).
    pub settled_at: u64,
    pub ledger: u32,
}

/// Running totals across all settlements.
#[contracttype]
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct Stats {
    pub settlements: u64,
    /// Sum of all order totals.
    pub total_volume: i128,
    /// Sum of matched parts (netted off-chain).
    pub matched_volume: i128,
    /// Sum of remainders actually moved on-chain.
    pub settled_volume: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RemainderSettled {
    #[topic]
    pub order_id: u64,
    pub from: Address,
    pub to: Address,
    pub total: i128,
    pub matched: i128,
    pub remainder: i128,
    pub deadline: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PausedChanged {
    pub paused: bool,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminChanged {
    pub admin: Address,
}

#[contract]
pub struct TwoWaySettlement;

#[contractimpl]
impl TwoWaySettlement {
    pub fn __constructor(env: Env, admin: Address, token: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Paused, &false);
    }

    /// Settle an expired order's unmatched remainder: pull `total - matched` from
    /// `from` to `to` using the allowance `from` granted this contract.
    /// Admin-only, once per `order_id`, and only after `deadline` (ledger time).
    /// Returns the remainder that moved.
    pub fn settle_remainder(
        env: Env,
        order_id: u64,
        from: Address,
        to: Address,
        total: i128,
        matched: i128,
        deadline: u64,
    ) -> Result<i128, Error> {
        Self::admin(env.clone()).require_auth();

        if Self::is_paused(env.clone()) {
            return Err(Error::Paused);
        }
        if total <= 0 || matched < 0 || matched >= total {
            return Err(Error::InvalidAmount);
        }
        if from == to {
            return Err(Error::SameAccount);
        }
        let now = env.ledger().timestamp();
        if now < deadline {
            return Err(Error::TooEarly);
        }
        let paid_key = DataKey::Paid(order_id);
        if env.storage().persistent().has(&paid_key) {
            return Err(Error::AlreadyPaid);
        }
        let remainder = total - matched;

        // Record first; the whole invocation reverts if the transfer fails.
        let record = Settlement {
            from: from.clone(),
            to: to.clone(),
            total,
            matched,
            remainder,
            deadline,
            settled_at: now,
            ledger: env.ledger().sequence(),
        };
        let record_key = DataKey::Settlement(order_id);
        let storage = env.storage().persistent();
        storage.set(&paid_key, &remainder);
        storage.set(&record_key, &record);
        storage.extend_ttl(&paid_key, BUMP_THRESHOLD, BUMP_AMOUNT);
        storage.extend_ttl(&record_key, BUMP_THRESHOLD, BUMP_AMOUNT);

        let mut stats = Self::stats(env.clone());
        stats.settlements += 1;
        stats.total_volume += total;
        stats.matched_volume += matched;
        stats.settled_volume += remainder;
        env.storage().instance().set(&DataKey::Stats, &stats);
        env.storage().instance().extend_ttl(BUMP_THRESHOLD, BUMP_AMOUNT);

        let token = token::Client::new(&env, &Self::token(env.clone()));
        token.transfer_from(&env.current_contract_address(), &from, &to, &remainder);

        RemainderSettled {
            order_id,
            from,
            to,
            total,
            matched,
            remainder,
            deadline,
        }
        .publish(&env);

        Ok(remainder)
    }

    /// Amount already settled for `order_id`, if any.
    pub fn paid_amount(env: Env, order_id: u64) -> Option<i128> {
        env.storage().persistent().get(&DataKey::Paid(order_id))
    }

    /// Full settlement record for `order_id`, if settled.
    pub fn settlement(env: Env, order_id: u64) -> Option<Settlement> {
        env.storage().persistent().get(&DataKey::Settlement(order_id))
    }

    /// Totals across all settlements.
    pub fn stats(env: Env) -> Stats {
        env.storage().instance().get(&DataKey::Stats).unwrap_or_default()
    }

    // ----------------------------------------------------------- admin

    /// Emergency stop: while paused, no remainder can be settled.
    pub fn pause(env: Env) {
        Self::admin(env.clone()).require_auth();
        Self::set_paused(&env, true);
    }

    pub fn unpause(env: Env) {
        Self::admin(env.clone()).require_auth();
        Self::set_paused(&env, false);
    }

    pub fn is_paused(env: Env) -> bool {
        env.storage().instance().get(&DataKey::Paused).unwrap_or(false)
    }

    pub fn set_admin(env: Env, new_admin: Address) {
        Self::admin(env.clone()).require_auth();
        env.storage().instance().set(&DataKey::Admin, &new_admin);
        AdminChanged { admin: new_admin }.publish(&env);
    }

    /// Replace this contract's code (admin-only). Storage, address and balances are kept.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        Self::admin(env.clone()).require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    pub fn admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    pub fn token(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Token).unwrap()
    }

    fn set_paused(env: &Env, paused: bool) {
        env.storage().instance().set(&DataKey::Paused, &paused);
        PausedChanged { paused }.publish(env);
    }
}

mod test;
