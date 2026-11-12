//! TwoWay remainder settlement contract.
//!
//! Orders and matching live off-chain (SQLite). Matched volume is netted
//! off-chain and never touches this contract. Only the *unmatched remainder*
//! of an order is settled here, once the order's matching window expires.
//!
//! Authorization model: when placing an order, the sender signs a SEP-41
//! `approve` on the USDC token, naming this contract as spender. No funds move
//! at that point. On expiry, the operator (admin) calls `payout_remainder`,
//! and this contract pulls exactly the remainder from the sender to the
//! recipient with `transfer_from`. Each order can be paid out at most once.
//!
//! Trust assumption: the operator chooses `to` and `amount`, bounded by the
//! sender's allowance. The off-chain database is the source of truth for which
//! recipient an order targets.
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Env,
};

/// ~1 day / ~30 days of ledgers at ~5s per ledger.
const DAY_IN_LEDGERS: u32 = 17_280;
const BUMP_THRESHOLD: u32 = DAY_IN_LEDGERS;
const BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidAmount = 1,
    AlreadyPaid = 2,
    SameAccount = 3,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Token,
    /// Amount paid out for an off-chain order id; presence means "already paid".
    Paid(u64),
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RemainderPaid {
    #[topic]
    pub order_id: u64,
    pub from: Address,
    pub to: Address,
    pub amount: i128,
}

#[contract]
pub struct TwoWaySettlement;

#[contractimpl]
impl TwoWaySettlement {
    pub fn __constructor(env: Env, admin: Address, token: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
    }

    /// Pay an expired order's unmatched remainder from `from` to `to`, using the
    /// allowance `from` granted this contract. Admin-only; once per `order_id`.
    pub fn payout_remainder(
        env: Env,
        order_id: u64,
        from: Address,
        to: Address,
        amount: i128,
    ) -> Result<(), Error> {
        Self::admin(env.clone()).require_auth();

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if from == to {
            return Err(Error::SameAccount);
        }
        let key = DataKey::Paid(order_id);
        if env.storage().persistent().has(&key) {
            return Err(Error::AlreadyPaid);
        }

        // Record first; the whole invocation reverts if the transfer fails.
        env.storage().persistent().set(&key, &amount);
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_AMOUNT);
        env.storage()
            .instance()
            .extend_ttl(BUMP_THRESHOLD, BUMP_AMOUNT);

        let token = token::Client::new(&env, &Self::token(env.clone()));
        token.transfer_from(&env.current_contract_address(), &from, &to, &amount);

        RemainderPaid {
            order_id,
            from,
            to,
            amount,
        }
        .publish(&env);

        Ok(())
    }

    /// Amount already paid for `order_id`, if any.
    pub fn paid_amount(env: Env, order_id: u64) -> Option<i128> {
        env.storage().persistent().get(&DataKey::Paid(order_id))
    }

    pub fn set_admin(env: Env, new_admin: Address) {
        Self::admin(env.clone()).require_auth();
        env.storage().instance().set(&DataKey::Admin, &new_admin);
    }

    pub fn admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    pub fn token(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Token).unwrap()
    }
}

mod test;
