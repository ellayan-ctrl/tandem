#!/usr/bin/env bash
# Builds and deploys the TwoWay remainder-settlement contract to Stellar testnet,
# then writes OPERATOR_SECRET and SETTLEMENT_CONTRACT_ID into .env.local.
#
# Usage: scripts/deploy-contract.sh
# Re-running deploys a fresh contract instance with the same operator key.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NETWORK=testnet
OPERATOR=twoway-operator
USDC_ASSET="USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
ENV_FILE="$ROOT/.env.local"

if ! stellar keys address "$OPERATOR" >/dev/null 2>&1; then
  echo "Generating and funding operator key '$OPERATOR'..."
  stellar keys generate "$OPERATOR" --network "$NETWORK" --fund
fi
OPERATOR_ADDRESS="$(stellar keys address "$OPERATOR")"
OPERATOR_SECRET="$(stellar keys show "$OPERATOR")"

echo "Building contract..."
(cd "$ROOT/soroban" && stellar contract build >/dev/null)
WASM="$ROOT/soroban/target/wasm32v1-none/release/twoway_settlement.wasm"

USDC_SAC="$(stellar contract id asset --asset "$USDC_ASSET" --network "$NETWORK")"

echo "Deploying (admin=$OPERATOR_ADDRESS, token=$USDC_SAC)..."
CONTRACT_ID="$(stellar contract deploy \
  --wasm "$WASM" \
  --source-account "$OPERATOR" \
  --network "$NETWORK" \
  -- --admin "$OPERATOR_ADDRESS" --token "$USDC_SAC")"

touch "$ENV_FILE"
upsert() {
  local key="$1" value="$2"
  if grep -q "^$key=" "$ENV_FILE"; then
    sed -i.bak "s|^$key=.*|$key=$value|" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
  else
    echo "$key=$value" >>"$ENV_FILE"
  fi
}
upsert OPERATOR_SECRET "$OPERATOR_SECRET"
upsert SETTLEMENT_CONTRACT_ID "$CONTRACT_ID"
upsert USDC_CONTRACT_ID "$USDC_SAC"

echo "Deployed: $CONTRACT_ID"
echo "Explorer: https://stellar.expert/explorer/testnet/contract/$CONTRACT_ID"
echo "Wrote OPERATOR_SECRET, SETTLEMENT_CONTRACT_ID, USDC_CONTRACT_ID to .env.local"
