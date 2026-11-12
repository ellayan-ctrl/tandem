/**
 * Thin Soroban RPC client for the two on-chain touchpoints:
 *  1. Sender pre-authorization: SEP-41 `approve` on USDC (signed by the sender; no funds move).
 *  2. Remainder payout: `payout_remainder` on the settlement contract (signed by the operator).
 */
import {
  Address,
  Asset,
  Contract,
  Keypair,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
  type Transaction,
} from '@stellar/stellar-sdk';
import { config } from './config.ts';

export const server = new rpc.Server(config.rpcUrl);
const usdc = new Contract(config.usdcContractId);
const settlement = new Contract(config.settlementContractId);

const CONTRACT_ERRORS: Record<string, string> = {
  '#1': 'InvalidAmount',
  '#2': 'AlreadyPaid',
  '#3': 'SameAccount',
};

export class ChainError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}

function explainSimError(raw: string): ChainError {
  const contractCode = /Error\(Contract, (#\d+)\)/.exec(raw)?.[1];
  if (contractCode && raw.includes(config.settlementContractId)) {
    const name = CONTRACT_ERRORS[contractCode] ?? contractCode;
    return new ChainError(`Settlement contract rejected the call: ${name}`, name);
  }
  if (/trustline|TrustlineMissing|#13/.test(raw)) {
    return new ChainError('Recipient account has no USDC trustline (or is not funded).', 'NoTrustline');
  }
  if (/allowance|#9|InsufficientAllowance/i.test(raw)) {
    return new ChainError('Sender pre-authorization (allowance) is insufficient or expired.', 'InsufficientAllowance');
  }
  if (/balance|#10/i.test(raw)) {
    return new ChainError('Sender USDC balance is insufficient.', 'InsufficientBalance');
  }
  return new ChainError(`Simulation failed: ${raw.split('\n')[0].slice(0, 300)}`);
}

export const txHash = (t: Transaction) => Buffer.from(t.hash()).toString('hex');

const i128 = (units: number) => nativeToScVal(BigInt(units), { type: 'i128' });
const addr = (a: string) => new Address(a).toScVal();

async function simulateRead(contract: Contract, method: string, ...args: xdr.ScVal[]): Promise<unknown> {
  const source = await server.getAccount(config.operator.publicKey());
  const tx = new TransactionBuilder(source, { fee: '100', networkPassphrase: config.networkPassphrase })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw explainSimError(sim.error);
  return sim.result ? scValToNative(sim.result.retval) : undefined;
}

export async function latestLedger(): Promise<number> {
  return (await server.getLatestLedger()).sequence;
}

/** USDC balance in integer units (7 decimals). */
export async function usdcBalance(account: string): Promise<number> {
  const v = (await simulateRead(usdc, 'balance', addr(account))) as bigint;
  return Number(v);
}

/** Current allowance `owner` has granted the settlement contract, in units. */
export async function allowance(owner: string): Promise<number> {
  const v = (await simulateRead(usdc, 'allowance', addr(owner), addr(config.settlementContractId))) as bigint;
  return Number(v);
}

export async function paidAmount(onchainId: number): Promise<number | null> {
  const v = (await simulateRead(settlement, 'paid_amount', nativeToScVal(BigInt(onchainId), { type: 'u64' }))) as
    | bigint
    | undefined
    | null;
  return v == null ? null : Number(v);
}

async function prepare(source: string, op: xdr.Operation): Promise<Transaction> {
  const account = await server.getAccount(source);
  const tx = new TransactionBuilder(account, { fee: '100', networkPassphrase: config.networkPassphrase })
    .addOperation(op)
    .setTimeout(300)
    .build();
  try {
    return await server.prepareTransaction(tx);
  } catch (e) {
    throw explainSimError(String((e as Error)?.message ?? e));
  }
}

/** Unsigned, simulated `approve(owner, settlement, amount, expirationLedger)` tx for the sender to sign. */
export async function buildApproveTx(owner: string, amountUnits: number, expirationLedger: number) {
  const tx = await prepare(
    owner,
    usdc.call(
      'approve',
      addr(owner),
      addr(config.settlementContractId),
      i128(amountUnits),
      nativeToScVal(expirationLedger, { type: 'u32' }),
    ),
  );
  return { xdr: tx.toXDR(), hash: txHash(tx) };
}

export function parseTx(envelopeXdr: string): Transaction {
  return TransactionBuilder.fromXDR(envelopeXdr, config.networkPassphrase) as Transaction;
}

/** Submit a signed tx and wait for it to land. Returns hash + ledger, throws on failure. */
export async function submitAndWait(tx: Transaction): Promise<{ hash: string; ledger: number }> {
  const sent = await server.sendTransaction(tx);
  if (sent.status === 'ERROR' || sent.status === 'TRY_AGAIN_LATER') {
    const detail = sent.errorResult
      ? JSON.stringify(sent.errorResult.result, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)).slice(0, 200)
      : sent.status;
    throw new ChainError(`Transaction rejected by network: ${detail}`);
  }
  return waitFor(sent.hash);
}

/** One-shot status lookup (no waiting). */
export async function txLanded(hash: string): Promise<boolean> {
  const res = await server.getTransaction(hash);
  return res.status === rpc.Api.GetTransactionStatus.SUCCESS;
}

export async function waitFor(hash: string, timeoutMs = 60_000): Promise<{ hash: string; ledger: number }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await server.getTransaction(hash);
    if (res.status === rpc.Api.GetTransactionStatus.SUCCESS) return { hash, ledger: res.ledger };
    if (res.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new ChainError(`Transaction ${hash} failed on-chain.`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new ChainError(`Timed out waiting for transaction ${hash}.`, 'Timeout');
}

/**
 * Operator-signed payout of an expired order's remainder.
 * `onSigned` runs with the tx hash before submission so the caller can persist it
 * (crash recovery can then look the tx up instead of paying twice; the contract also
 * rejects a second payout for the same order id).
 */
export async function payoutRemainder(
  p: { onchainId: number; from: string; to: string; amountUnits: number },
  onSigned: (hash: string) => void,
): Promise<{ hash: string; ledger: number }> {
  const tx = await prepare(
    config.operator.publicKey(),
    settlement.call(
      'payout_remainder',
      nativeToScVal(BigInt(p.onchainId), { type: 'u64' }),
      addr(p.from),
      addr(p.to),
      i128(p.amountUnits),
    ),
  );
  tx.sign(config.operator);
  onSigned(txHash(tx));
  return submitAndWait(tx);
}

// ------------------------------------------------------------ invisible wallets & on-ramp

const USDC_ASSET = new Asset('USDC', config.usdcIssuer);

/** Build, sign and submit a classic transaction from `source`. */
async function sendClassic(source: Keypair, ops: xdr.Operation[]) {
  const account = await server.getAccount(source.publicKey());
  const b = new TransactionBuilder(account, { fee: '1000', networkPassphrase: config.networkPassphrase }).setTimeout(120);
  ops.forEach((op) => b.addOperation(op));
  const tx = b.build();
  tx.sign(source);
  return submitAndWait(tx);
}

/** Create a new invisible wallet on testnet: Friendbot XLM (for fees/reserves) + USDC trustline. */
export async function createWalletOnChain(kp: Keypair): Promise<void> {
  const res = await fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`);
  if (!res.ok) throw new ChainError(`Friendbot could not fund the new wallet (${res.status}).`);
  for (let i = 0; i < 20; i++) {
    try {
      await server.getAccount(kp.publicKey());
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  await sendClassic(kp, [Operation.changeTrust({ asset: USDC_ASSET })]);
}

/** Classic USDC payment (used for the treasury -> invisible wallet on-ramp). */
export async function payUsdc(from: Keypair, to: string, units: number) {
  const whole = Math.trunc(units / 1e7);
  const frac = String(units % 1e7).padStart(7, '0');
  return sendClassic(from, [Operation.payment({ destination: to, asset: USDC_ASSET, amount: `${whole}.${frac}` })]);
}

/** Sign and submit an approve for a server-held key (demo counterparties and invisible wallets). */
export async function approveWithKey(
  keypair: Keypair,
  amountUnits: number,
  expirationLedger: number,
) {
  const { xdr: env } = await buildApproveTx(keypair.publicKey(), amountUnits, expirationLedger);
  const tx = parseTx(env);
  tx.sign(keypair);
  return submitAndWait(tx);
}
