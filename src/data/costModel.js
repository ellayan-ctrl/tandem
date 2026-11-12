/**
 * Cost model for the Calculator tab. Every number is either MEASURED (from this app's own
 * testnet transactions), SOURCED (published figure, linked in COST_SOURCES), or an
 * ASSUMPTION (no reliable public figure; editable in the UI). Researched November 2026.
 */
import remittance from '../../shared/remittance_averages.json';

export const STROOPS_PER_XLM = 10_000_000;

/** Stellar network fees, in stroops. */
export const NETWORK_FEES = {
  /** Classic payment op: base fee 100 stroops (mainnet fee_stats p50 fee_charged = 100). SOURCED + MEASURED */
  classicPayment: 100,
  /** USDC `approve` pre-authorization (Soroban), fee_charged on our testnet txs: 5,825–5,896. MEASURED */
  preauthApprove: 5_896,
  /** `settle_remainder` on the TwoWay contract (deadline check, settlement record, transfer_from), fee_charged on our
   * testnet txs: 69,468–88,902 (the record is a new persistent entry, so it pays storage rent). MEASURED */
  sorobanPayout: 88_902,
};

/** XLM/USD, Nov 2026 quotes ranged ~$0.14–$0.21 across exchanges. SOURCED (editable) */
export const DEFAULT_XLM_USD = 0.2;

/** Sender on-ramp: CAD -> USDC via a Canadian exchange funded by Interac (~0.5–0.7% all-in). SOURCED (vendor comparisons) */
export const ONRAMP_PCT = 0.6;

/** Recipient off-ramp: USDC -> local currency via a stablecoin anchor (Kenya 1–3%; Kotani Pay sample ≈2%). SOURCED */
export const OFFRAMP_PCT = 2.0;

/** Cash-out from mobile money in Kenya: ~KES 8 per KES 1,000 received (CBK/KNBS/FSD 2025 survey). SOURCED */
export const MOBILE_CASHOUT_PCT = 0.8;

/** Typical remittance provider, % of amount sent (World Bank Remittance Prices Worldwide). SOURCED */
export const TRADITIONAL_REMITTANCE_PCT = remittance.pct; // shared/remittance_averages.json ('Canada->Kenya' 7.28% Q1 2025, global 6.49%)

/** Bank SWIFT wire from a Canadian bank: ~CAD 45 outgoing fee (RBC) + FX markup. */
export const BANK_WIRE = {
  flatFeeCad: 45, // SOURCED (Wise's RBC fee guide)
  fxMarkupPct: 3.0, // ASSUMPTION (bank-wire all-in estimates ~3.3% on CAD 10k)
};
export const CAD_PER_USD = 1.392;

/** Sender pay-in cost for the MATCHED amount, by funding method (domestic rail, no FX via USDC). */
export const FUNDING_COST_PCT = {
  instant_transfer: { pct: 0.1, basis: 'assumption', note: 'Interac e-Transfer: usually free to CAD 1.50' },
  bank_account: { pct: 0.3, basis: 'assumption', note: 'Pre-authorized debit / EFT, low fixed fee' },
  mobile_money: { pct: 1.3, basis: 'sourced', note: 'M-Pesa send tariff ≈ KES 13 per KES 1,000' },
  debit_card: { pct: 1.5, basis: 'assumption', note: 'Card acceptance cost; no single published rate' },
  cash_deposit: { pct: 1.5, basis: 'assumption', note: 'Agent cash-in commission; no published rate found' },
};

/** Recipient collects the matched amount locally (partner network). Kenya: ≈ KES 8 per 1,000. SOURCED */
export const LOCAL_DELIVERY_PCT = 0.8;

/** TwoWay platform fee: none charged today. */
export const TWOWAY_PLATFORM_PCT = 0;

const xlmUsd = (stroops, price) => (stroops / STROOPS_PER_XLM) * price;
const rail = (id, name, lines, amount) => {
  const total = lines.reduce((s, l) => s + l.usd, 0);
  return { id, name, lines, total, pctOfAmount: amount > 0 ? (total / amount) * 100 : 0 };
};

export function computeCosts(i) {
  const A = Math.max(0, i.amountUsd);
  const matched = (A * Math.min(100, Math.max(0, i.matchPct))) / 100;
  const unmatched = A - matched;
  const corridorKey = `${i.fromCountry}->${i.toCountry}`;
  const tradPct = TRADITIONAL_REMITTANCE_PCT[corridorKey] ?? TRADITIONAL_REMITTANCE_PCT.default;
  const funding = FUNDING_COST_PCT[i.fundingKind];

  const traditional = rail(
    'traditional',
    'Typical remittance provider',
    [
      {
        label: `Fees + FX margin (${tradPct}%)`,
        usd: (A * tradPct) / 100,
        basis: 'sourced',
        detail: corridorKey in TRADITIONAL_REMITTANCE_PCT ? 'World Bank average for this country pair' : 'World Bank global average',
      },
    ],
    A,
  );

  const bankWire = rail(
    'bank_wire',
    'Bank SWIFT wire',
    [
      { label: `Outgoing wire fee (CAD ${BANK_WIRE.flatFeeCad})`, usd: BANK_WIRE.flatFeeCad / CAD_PER_USD, basis: 'sourced' },
      { label: `FX markup (${BANK_WIRE.fxMarkupPct}%)`, usd: (A * BANK_WIRE.fxMarkupPct) / 100, basis: 'assumption' },
    ],
    A,
  );

  const directStellar = rail(
    'direct_stellar',
    'Full Crypto Transfer (no matching)',
    [
      { label: `On-ramp to USDC (${ONRAMP_PCT}%)`, usd: (A * ONRAMP_PCT) / 100, basis: 'sourced' },
      {
        label: 'Stellar network fee (payment)',
        usd: xlmUsd(NETWORK_FEES.classicPayment, i.xlmUsd),
        basis: 'measured',
        detail: `${NETWORK_FEES.classicPayment} stroops`,
      },
      { label: `Off-ramp USDC → local (${OFFRAMP_PCT}%)`, usd: (A * OFFRAMP_PCT) / 100, basis: 'sourced' },
      { label: `Mobile-money cash-out (${MOBILE_CASHOUT_PCT}%)`, usd: (A * MOBILE_CASHOUT_PCT) / 100, basis: 'sourced' },
    ],
    A,
  );

  const twoWayLines = [
    {
      label: `Matched $${matched.toFixed(2)}: sender pay-in (${funding.pct}%)`,
      usd: (matched * funding.pct) / 100,
      basis: funding.basis,
      detail: funding.note,
    },
    {
      label: `Matched: recipient collects locally (${LOCAL_DELIVERY_PCT}%)`,
      usd: (matched * LOCAL_DELIVERY_PCT) / 100,
      basis: 'sourced',
      detail: "Partner network, recipient's preferred method",
    },
    {
      label: 'Pre-authorization (Soroban approve)',
      usd: xlmUsd(NETWORK_FEES.preauthApprove, i.xlmUsd),
      basis: 'measured',
      detail: `${NETWORK_FEES.preauthApprove.toLocaleString()} stroops`,
    },
  ];
  if (unmatched > 0) {
    twoWayLines.push(
      { label: `Unmatched $${unmatched.toFixed(2)}: on-ramp (${ONRAMP_PCT}%)`, usd: (unmatched * ONRAMP_PCT) / 100, basis: 'sourced' },
      {
        label: 'Soroban remainder payout',
        usd: xlmUsd(NETWORK_FEES.sorobanPayout, i.xlmUsd),
        basis: 'measured',
        detail: `${NETWORK_FEES.sorobanPayout.toLocaleString()} stroops`,
      },
      { label: `Unmatched: off-ramp (${OFFRAMP_PCT}%)`, usd: (unmatched * OFFRAMP_PCT) / 100, basis: 'sourced' },
      { label: `Unmatched: cash-out (${MOBILE_CASHOUT_PCT}%)`, usd: (unmatched * MOBILE_CASHOUT_PCT) / 100, basis: 'sourced' },
    );
  }
  twoWayLines.push({ label: 'TwoWay platform fee', usd: (A * TWOWAY_PLATFORM_PCT) / 100, basis: 'sourced', detail: 'None charged today' });
  const twoWay = rail('twoway', 'TwoWay (netting + Soroban remainder)', twoWayLines, A);

  return [traditional, bankWire, directStellar, twoWay];
}

/** Total on-chain cost of one TwoWay order, in XLM and USD. */
export function twoWayNetworkCost(hasRemainder, price) {
  const stroops = NETWORK_FEES.preauthApprove + (hasRemainder ? NETWORK_FEES.sorobanPayout : 0);
  return { stroops, xlm: stroops / STROOPS_PER_XLM, usd: xlmUsd(stroops, price) };
}

export const COST_SOURCES = [
  {
    label: 'This app’s testnet txs: approve 5,896 stroops, settle_remainder 69,468–88,902 stroops (Horizon fee_charged)',
    url: 'https://stellar.expert/explorer/testnet/tx/b40a359c4a53b1c204c248984bb7f8bb48f7d82fc6135c3906829f21e7e7a36e',
  },
  { label: 'Stellar mainnet fee_stats (base fee 100 stroops)', url: 'https://horizon.stellar.org/fee_stats' },
  { label: 'XLM price (Kraken)', url: 'https://www.kraken.com/prices/stellar' },
  { label: 'World Bank Remittance Prices Worldwide: Canada → Kenya', url: 'https://remittanceprices.worldbank.org/corridor/Canada/Kenya' },
  {
    label: 'World Bank RPW report Q1 2025 (global average 6.49%)',
    url: 'https://remittanceprices.worldbank.org/sites/default/files/rpw_main_report_and_annex_q125_1_0.pdf',
  },
  {
    label: 'CAD → USDC pricing comparison (Newton / NDAX / Coinbase)',
    url: 'https://www.photonpay.com/ca/blog/article/cad-to-usdc-pricing-comparison',
  },
  { label: 'Kenya stablecoin vs M-Pesa costs (1.5–3% all-in)', url: 'https://www.spark.money/tools/m-pesa-vs-stablecoin-kenya' },
  { label: 'Kotani Pay off-ramp rate API (sample fee ≈2%)', url: 'https://developers.kotanipay.com/v3/api-reference/rates/offramp-rate' },
  { label: 'Kenya remittance encashing cost ≈KES 8 per 1,000 (CBK/KNBS/FSD survey)', url: 'https://businesstoday.co.ke/?p=153233' },
  { label: 'M-Pesa 2026 tariffs', url: 'https://businesstoday.co.ke/m-pesa-charges-2026-withdrawal-and-send-money-fees/' },
  { label: 'RBC wire transfer fees (CAD 45 outgoing)', url: 'https://wise.com/ca/blog/rbc-wire-transfer-fees-guide' },
  {
    label: 'MoneyGram Ramps (USDC cash-out, 5–2,500 USDC limits)',
    url: 'https://developer.moneygram.com/moneygram-developer/docs/moneygram-ramps',
  },
];
