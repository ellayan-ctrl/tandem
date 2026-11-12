#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, AuthorizedFunction, AuthorizedInvocation, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, Env, IntoVal, Symbol,
};

const USDC: i128 = 10_000_000; // 7 decimals
const NOW: u64 = 1_800_000_000;

struct Setup<'a> {
    env: Env,
    admin: Address,
    sender: Address,
    recipient: Address,
    token: TokenClient<'a>,
    contract: Address,
    client: TwoWaySettlementClient<'a>,
}

fn setup() -> Setup<'static> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| l.timestamp = NOW);

    let admin = Address::generate(&env);
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);

    let issuer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(issuer);
    let token = TokenClient::new(&env, &sac.address());
    StellarAssetClient::new(&env, &sac.address()).mint(&sender, &(1_000 * USDC));

    let contract = env.register(TwoWaySettlement, (&admin, &sac.address()));
    let client = TwoWaySettlementClient::new(&env, &contract);

    Setup { env, admin, sender, recipient, token, contract, client }
}

impl Setup<'_> {
    /// The sender's wallet approves this contract for `amount` (done just in time, at expiry).
    fn approve(&self, amount: i128) {
        let expiry = self.env.ledger().sequence() + 1000;
        self.token.approve(&self.sender, &self.contract, &amount, &expiry);
    }

    fn settle(&self, order_id: u64, total: i128, matched: i128, deadline: u64) -> Result<i128, Error> {
        match self
            .client
            .try_settle_remainder(&order_id, &self.sender, &self.recipient, &total, &matched, &deadline)
        {
            Ok(Ok(v)) => Ok(v),
            Err(Ok(e)) => Err(e),
            other => panic!("unexpected host error: {other:?}"),
        }
    }
}

#[test]
fn settles_only_the_unmatched_remainder_and_requires_admin() {
    let s = setup();
    // 10 USDC order, 4 matched off-chain: only 6 is approved and moved.
    s.approve(6 * USDC);

    let moved = s.settle(7, 10 * USDC, 4 * USDC, NOW - 1).unwrap();
    assert_eq!(moved, 6 * USDC);

    assert_eq!(
        s.env.auths()[0],
        (
            s.admin.clone(),
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    s.contract.clone(),
                    Symbol::new(&s.env, "settle_remainder"),
                    (7u64, s.sender.clone(), s.recipient.clone(), 10 * USDC, 4 * USDC, NOW - 1).into_val(&s.env),
                )),
                sub_invocations: std::vec![],
            }
        )
    );
    assert_eq!(s.token.balance(&s.sender), 994 * USDC);
    assert_eq!(s.token.balance(&s.recipient), 6 * USDC);
    assert_eq!(s.token.allowance(&s.sender, &s.contract), 0);
    assert_eq!(s.client.paid_amount(&7), Some(6 * USDC));
    assert_eq!(s.client.paid_amount(&8), None);
}

#[test]
fn stores_a_settlement_record() {
    let s = setup();
    s.approve(6 * USDC);
    s.settle(7, 10 * USDC, 4 * USDC, NOW - 30).unwrap();

    let rec = s.client.settlement(&7).unwrap();
    assert_eq!(
        rec,
        Settlement {
            from: s.sender.clone(),
            to: s.recipient.clone(),
            total: 10 * USDC,
            matched: 4 * USDC,
            remainder: 6 * USDC,
            deadline: NOW - 30,
            settled_at: NOW,
            ledger: s.env.ledger().sequence(),
        }
    );
    assert_eq!(s.client.settlement(&8), None);
}

#[test]
fn stats_accumulate_across_settlements() {
    let s = setup();
    s.approve(8 * USDC);
    s.settle(1, 10 * USDC, 4 * USDC, NOW).unwrap(); // 6 on-chain
    s.settle(2, 2 * USDC, 0, NOW).unwrap(); // full crypto transfer: 2 on-chain

    assert_eq!(
        s.client.stats(),
        Stats { settlements: 2, total_volume: 12 * USDC, matched_volume: 4 * USDC, settled_volume: 8 * USDC }
    );
}

#[test]
fn enforces_the_deadline_on_chain() {
    let s = setup();
    s.approve(6 * USDC);

    // Window still open: refused, nothing recorded, nothing moved.
    assert_eq!(s.settle(3, 10 * USDC, 4 * USDC, NOW + 60), Err(Error::TooEarly));
    assert_eq!(s.client.paid_amount(&3), None);
    assert_eq!(s.token.balance(&s.recipient), 0);

    // Once the ledger clock passes the deadline it goes through.
    s.env.ledger().with_mut(|l| l.timestamp = NOW + 60);
    assert_eq!(s.settle(3, 10 * USDC, 4 * USDC, NOW + 60), Ok(6 * USDC));
}

#[test]
fn rejects_double_settlement() {
    let s = setup();
    s.approve(10 * USDC);
    s.settle(1, 5 * USDC, 0, NOW).unwrap();
    assert_eq!(s.settle(1, 5 * USDC, 0, NOW), Err(Error::AlreadyPaid));
    assert_eq!(s.token.balance(&s.recipient), 5 * USDC);
}

#[test]
fn rejects_bad_amounts_and_self_payment() {
    let s = setup();
    assert_eq!(s.settle(1, 0, 0, NOW), Err(Error::InvalidAmount));
    assert_eq!(s.settle(1, 5 * USDC, 5 * USDC, NOW), Err(Error::InvalidAmount)); // fully matched: nothing to settle
    assert_eq!(s.settle(1, 5 * USDC, 6 * USDC, NOW), Err(Error::InvalidAmount));
    assert_eq!(s.settle(1, 5 * USDC, -1, NOW), Err(Error::InvalidAmount));
    assert_eq!(
        s.client.try_settle_remainder(&1, &s.sender, &s.sender, &10, &0, &NOW),
        Err(Ok(Error::SameAccount))
    );
}

#[test]
fn cannot_exceed_allowance_and_failed_settlement_is_not_recorded() {
    let s = setup();
    s.approve(5 * USDC);

    assert!(s.client.try_settle_remainder(&3, &s.sender, &s.recipient, &(10 * USDC), &(4 * USDC), &NOW).is_err());
    assert_eq!(s.client.paid_amount(&3), None);
    assert_eq!(s.client.settlement(&3), None);
    assert_eq!(s.client.stats(), Stats::default());
    assert_eq!(s.token.balance(&s.recipient), 0);
}

#[test]
fn cannot_use_expired_allowance() {
    let s = setup();
    let expiry = s.env.ledger().sequence() + 10;
    s.token.approve(&s.sender, &s.contract, &(5 * USDC), &expiry);
    s.env.ledger().with_mut(|l| l.sequence_number += 11);

    assert!(s.client.try_settle_remainder(&4, &s.sender, &s.recipient, &(1 * USDC), &0, &NOW).is_err());
}

#[test]
fn pause_blocks_settlements_until_unpaused() {
    let s = setup();
    s.approve(1 * USDC);
    assert!(!s.client.is_paused());

    s.client.pause();
    assert!(s.client.is_paused());
    assert_eq!(s.settle(1, 1 * USDC, 0, NOW), Err(Error::Paused));

    s.client.unpause();
    assert_eq!(s.settle(1, 1 * USDC, 0, NOW), Ok(1 * USDC));
}

#[test]
fn admin_can_be_rotated() {
    let s = setup();
    let new_admin = Address::generate(&s.env);
    s.client.set_admin(&new_admin);
    assert_eq!(s.client.admin(), new_admin);
}

#[test]
fn non_admin_cannot_settle_pause_or_rotate() {
    let env = Env::default();
    env.ledger().with_mut(|l| l.timestamp = NOW);
    let admin = Address::generate(&env);
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
    let contract = env.register(TwoWaySettlement, (&admin, &sac.address()));
    let client = TwoWaySettlementClient::new(&env, &contract);

    // No auths mocked: the admin signature is missing.
    assert!(client.try_settle_remainder(&1, &sender, &recipient, &10, &0, &NOW).is_err());
    assert!(client.try_pause().is_err());
    assert!(client.try_set_admin(&sender).is_err());
    assert!(client.try_upgrade(&BytesN::from_array(&env, &[0; 32])).is_err());
    assert_eq!(client.admin(), admin);
}
