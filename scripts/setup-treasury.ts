/**
 * Creates (or tops up) the testnet TREASURY account that stands in for the bank -> USDC
 * on-ramp: when an order's unmatched remainder settles, the treasury sends that much testnet
 * USDC into the user's invisible wallet, which then pays the recipient via the Soroban contract.
 *
 *   npx tsx scripts/setup-treasury.ts [targetUsdc=3000]
 *
 * Writes TREASURY_SECRET to .env.local on first run.
 */
import { appendFileSync, readFileSync, existsSync } from 'node:fs';
import { Asset, Horizon, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';

const HORIZON = new Horizon.Server('https://horizon-testnet.stellar.org');
const USDC = new Asset('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
const ENV = '.env.local';
const target = Number(process.argv[2] ?? 3000);

const envText = existsSync(ENV) ? readFileSync(ENV, 'utf8') : '';
const existing = /^TREASURY_SECRET=(S[A-Z2-7]{55})$/m.exec(envText)?.[1];
const treasury = existing ? Keypair.fromSecret(existing) : Keypair.random();
if (!existing) appendFileSync(ENV, `${envText.endsWith('\n') || !envText ? '' : '\n'}TREASURY_SECRET=${treasury.secret()}\n`);
console.log(`Treasury ${treasury.publicKey()} (${existing ? 'existing' : 'new, saved to .env.local'})`);

async function submit(ops: ReturnType<typeof Operation.changeTrust>[]) {
  const account = await HORIZON.loadAccount(treasury.publicKey());
  const b = new TransactionBuilder(account, { fee: '1000', networkPassphrase: Networks.TESTNET }).setTimeout(60);
  ops.forEach((op) => b.addOperation(op));
  const tx = b.build();
  tx.sign(treasury);
  return HORIZON.submitTransaction(tx);
}

const usdcBalance = (acct: Horizon.AccountResponse) =>
  Number((acct.balances.find((x: any) => x.asset_code === 'USDC' && x.asset_issuer === USDC.issuer) as any)?.balance ?? NaN);

let account = await HORIZON.loadAccount(treasury.publicKey()).catch(() => null);
if (!account) {
  const res = await fetch(`https://friendbot.stellar.org?addr=${treasury.publicKey()}`);
  if (!res.ok) throw new Error(`Friendbot failed: ${await res.text()}`);
  account = await HORIZON.loadAccount(treasury.publicKey());
  console.log('Funded with Friendbot XLM');
}
if (Number.isNaN(usdcBalance(account))) {
  await submit([Operation.changeTrust({ asset: USDC })]);
  account = await HORIZON.loadAccount(treasury.publicKey());
  console.log('Added USDC trustline');
}

const have = usdcBalance(account);
const need = Math.max(0, target - have);
if (need > 0) {
  // Swap in chunks so a thin order book doesn't fail the whole top-up.
  let remaining = need;
  while (remaining > 0.5) {
    const chunk = Math.min(500, remaining);
    await submit([
      Operation.pathPaymentStrictReceive({
        sendAsset: Asset.native(),
        sendMax: String(Math.ceil(chunk * 1.6)),
        destination: treasury.publicKey(),
        destAsset: USDC,
        destAmount: chunk.toFixed(7),
      }) as any,
    ]);
    remaining -= chunk;
    console.log(`Swapped XLM -> ${chunk} USDC`);
  }
}
account = await HORIZON.loadAccount(treasury.publicKey());
console.log(`Treasury USDC balance: ${usdcBalance(account)}`);
