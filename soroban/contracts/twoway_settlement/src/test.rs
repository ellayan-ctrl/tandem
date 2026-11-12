#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, AuthorizedFunction, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, Env, IntoVal, Symbol,
};

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

    let admin = Address::generate(&env);
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);

    let issuer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(issuer);
    let token = TokenClient::new(&env, &sac.address());
    StellarAssetClient::new(&env, &sac.address()).mint(&sender, &1_000_0000000);

    let contract = env.register(TwoWaySettlement, (&admin, &sac.address()));
    let client = TwoWaySettlementClient::new(&env, &contract);

    Setup { env, admin, sender, recipient, token, contract, client }
}

#[test]
fn pays_remainder_within_allowance_and_requires_admin() {
    let s = setup();
    let expiry = s.env.ledger().sequence() + 1000;
    // Sender pre-authorizes 500 USDC; only 300 is left unmatched.
    s.token.approve(&s.sender, &s.contract, &500_0000000, &expiry);

    s.client.payout_remainder(&7, &s.sender, &s.recipient, &300_0000000);

    assert_eq!(
        s.env.auths()[0],
        (
            s.admin.clone(),
            soroban_sdk::testutils::AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    s.contract.clone(),
                    Symbol::new(&s.env, "payout_remainder"),
                    (7u64, s.sender.clone(), s.recipient.clone(), 300_0000000i128).into_val(&s.env),
                )),
                sub_invocations: std::vec![],
            }
        )
    );
    assert_eq!(s.token.balance(&s.sender), 700_0000000);
    assert_eq!(s.token.balance(&s.recipient), 300_0000000);
    assert_eq!(s.token.allowance(&s.sender, &s.contract), 200_0000000);
    assert_eq!(s.client.paid_amount(&7), Some(300_0000000));
    assert_eq!(s.client.paid_amount(&8), None);
}

#[test]
fn rejects_double_payout() {
    let s = setup();
    let expiry = s.env.ledger().sequence() + 1000;
    s.token.approve(&s.sender, &s.contract, &500_0000000, &expiry);

    s.client.payout_remainder(&1, &s.sender, &s.recipient, &100_0000000);
    let again = s.client.try_payout_remainder(&1, &s.sender, &s.recipient, &100_0000000);
    assert_eq!(again, Err(Ok(Error::AlreadyPaid)));
    assert_eq!(s.token.balance(&s.recipient), 100_0000000);
}

#[test]
fn rejects_bad_amounts_and_self_payment() {
    let s = setup();
    assert_eq!(
        s.client.try_payout_remainder(&1, &s.sender, &s.recipient, &0),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        s.client.try_payout_remainder(&1, &s.sender, &s.sender, &10),
        Err(Ok(Error::SameAccount))
    );
}

#[test]
fn cannot_exceed_allowance_and_failed_payout_is_not_recorded() {
    let s = setup();
    let expiry = s.env.ledger().sequence() + 1000;
    s.token.approve(&s.sender, &s.contract, &50_0000000, &expiry);

    assert!(s.client.try_payout_remainder(&3, &s.sender, &s.recipient, &60_0000000).is_err());
    assert_eq!(s.client.paid_amount(&3), None);
    assert_eq!(s.token.balance(&s.recipient), 0);
}

#[test]
fn cannot_use_expired_allowance() {
    let s = setup();
    let expiry = s.env.ledger().sequence() + 10;
    s.token.approve(&s.sender, &s.contract, &50_0000000, &expiry);
    s.env.ledger().with_mut(|l| l.sequence_number += 11);

    assert!(s.client.try_payout_remainder(&4, &s.sender, &s.recipient, &10_0000000).is_err());
}

#[test]
fn non_admin_cannot_pay_out() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let sender = Address::generate(&env);
    let recipient = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(Address::generate(&env));
    let contract = env.register(TwoWaySettlement, (&admin, &sac.address()));
    let client = TwoWaySettlementClient::new(&env, &contract);

    // No auths mocked: the admin signature is missing.
    assert!(client.try_payout_remainder(&1, &sender, &recipient, &10).is_err());
}
