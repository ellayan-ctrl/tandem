import dotenv from 'dotenv';
import { Keypair, Networks } from '@stellar/stellar-sdk';

dotenv.config({ path: ['.env.local', '.env'], quiet: true });

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`${name} is not set. Run scripts/deploy-contract.sh to deploy the contract and write .env.local.`);
  }
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  dbPath: process.env.DB_PATH ?? 'data/twoway.db',
  rpcUrl: process.env.SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
  operator: Keypair.fromSecret(required('OPERATOR_SECRET')),
  settlementContractId: required('SETTLEMENT_CONTRACT_ID'),
  usdcContractId: required('USDC_CONTRACT_ID'),
  /** Circle testnet USDC (classic asset behind the SAC). */
  usdcIssuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  /**
   * Holds testnet USDC and stands in for the bank -> USDC on-ramp: it funds a user's invisible
   * wallet with exactly the unmatched remainder at settlement time. Created by scripts/setup-treasury.ts.
   */
  treasury: process.env.TREASURY_SECRET ? Keypair.fromSecret(process.env.TREASURY_SECRET) : null,
  /** Extra ledgers the allowance stays valid after an order's deadline, so the worker can pay out. ~1h. */
  payoutGraceLedgers: 720,
  /** Conservative ledger close time used to convert deadlines to ledgers (shorter => later expiry). */
  secondsPerLedger: 5,
  workerIntervalMs: 5_000,

};
