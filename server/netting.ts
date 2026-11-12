/**
 * Settlement method for MATCHED volume. Matched amounts never touch Soroban: two opposing
 * orders cancel out, so each side settles on domestic rails. Sender A pays in locally via
 * the funding method they chose (debit card, bank account, instant transfer, cash at an
 * agent, mobile money); that local money is delivered to B's recipient, who lives in A's
 * country, and vice versa. Recipients collect through the partner network however they prefer.
 *
 * This testnet demo SIMULATES the local rails: it issues realistic references and
 * instructions but charges no real card / bank / MoneyGram / mobile-money account.
 * Replace `fundingRecord` with a real payment / anchor integration (e.g. SEP-24/31) to go live.
 */
import { randomInt } from 'node:crypto';
import {
  CURRENCY_BY_COUNTRY,
  FUNDING_KINDS,
  findFundingProvider,
  maskFundingDetails,
  type FundingKind,
  type FundingSelection,
} from '../src/data/fundingMethods.ts';
import { FX_RATES } from '../src/services/bankingService.ts';
import { fromUnits } from './amounts.ts';

export interface MatchedSide {
  publicId: string;
  senderName: string;
  recipientName: string;
  fromCountry: string;
  toCountry: string;
  fundingMethod: FundingSelection | null;
}

export interface MatchedFill {
  batchId: string;
  index: number;
  amountUnits: number;
  orderA: MatchedSide;
  orderB: MatchedSide;
}

export interface MatchedFunding {
  providerId: string;
  providerName: string;
  kind: FundingKind | 'unspecified';
  kindLabel: string;
  reference: string;
  status: 'charged' | 'debit_scheduled' | 'requested' | 'awaiting_cash' | 'pending';
  amountUsdc: number;
  /** What the sender pays, in the sender's currency. */
  currency: string;
  localAmount: number;
  instructions: string;
  details: Record<string, string>; // masked
  /** How this order's recipient is paid (from the opposite sender's local funds). */
  delivery: { currency: string; localAmount: number; note: string };
  simulated: true;
}

export interface NettingResult {
  method: string;
  status: 'netted' | 'pending' | 'failed';
  ref: string;
  fundingA: MatchedFunding;
  fundingB: MatchedFunding;
}

export interface MatchedSettlementMethod {
  settle(fill: MatchedFill): NettingResult;
}

const digits = (n: number) => String(randomInt(10 ** (n - 1), 10 ** n));
const code = (n: number) =>
  Array.from({ length: n }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)]).join('');

function money(country: string, usdc: number) {
  const currency = CURRENCY_BY_COUNTRY[country] ?? 'USD';
  const localAmount = Math.round(usdc * (FX_RATES[currency]?.rate ?? 1) * 100) / 100;
  return { currency, localAmount, text: `${currency} ${localAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}` };
}

export function fundingRecord(side: MatchedSide, amountUnits: number): MatchedFunding {
  const amountUsdc = fromUnits(amountUnits);
  const pay = money(side.fromCountry, amountUsdc);
  const recv = money(side.toCountry, amountUsdc);
  const provider = side.fundingMethod ? findFundingProvider(side.fromCountry, side.fundingMethod.providerId) : undefined;
  const base = {
    amountUsdc,
    currency: pay.currency,
    localAmount: pay.localAmount,
    details: side.fundingMethod && provider ? maskFundingDetails(side.fromCountry, side.fundingMethod) : {},
    delivery: {
      currency: recv.currency,
      localAmount: recv.localAmount,
      note: `${recv.text} delivered to ${side.recipientName} in ${side.toCountry} by the local partner network, collected however they prefer.`,
    },
    simulated: true as const,
  };

  if (!provider || !side.fundingMethod) {
    return {
      ...base,
      providerId: 'unspecified',
      providerName: 'Funding method not specified',
      kind: 'unspecified',
      kindLabel: 'Unspecified',
      reference: `NET-${code(8)}`,
      status: 'pending',
      instructions: `${side.senderName} pays ${pay.text} locally.`,
    };
  }

  const d = side.fundingMethod.details;
  const m = base.details;
  const common = { ...base, providerId: provider.id, providerName: provider.name, kind: provider.kind, kindLabel: FUNDING_KINDS[provider.kind].label };
  switch (provider.kind) {
    case 'debit_card': {
      const reference = `AUTH-${digits(6)}`;
      return { ...common, reference, status: 'charged', instructions: `${pay.text} charged to debit card ending ${d.cardLast4} (${d.payerName}). Authorization ${reference}.` };
    }
    case 'bank_account': {
      const reference = `${pay.currency}-PAD-${digits(8)}`;
      const acct = m.accountNumber ?? m.iban ?? m.cbu ?? '';
      return {
        ...common,
        reference,
        status: 'debit_scheduled',
        instructions: `Pre-authorized debit of ${pay.text} from ${d.bankName ?? provider.name} account ${acct} (${provider.eta}). Ref ${reference}.`,
      };
    }
    case 'instant_transfer': {
      const reference = `CA${code(6)}`;
      return { ...common, reference, status: 'requested', instructions: `${provider.name} request for ${pay.text} sent to ${m.contact}. Approve it in your banking app. Ref ${reference}.` };
    }
    case 'cash_deposit': {
      const reference = digits(provider.name.startsWith('MoneyGram') ? 8 : 10);
      return {
        ...common,
        reference,
        status: 'charged',
        instructions: `${pay.text} paid from cash you deposited with ${provider.name} in ${d.city} (${d.payerName}). Reference #${reference}.`,
      };
    }
    case 'mobile_money': {
      const reference = code(10);
      return { ...common, reference, status: 'requested', instructions: `${provider.name} payment prompt for ${pay.text} sent to ${m.phone ?? m.cvu}. Approve on your phone. Transaction ${reference}.` };
    }
  }
}

export const offchainNetting: MatchedSettlementMethod = {
  settle(fill) {
    return {
      method: 'offchain_netting',
      status: 'netted',
      ref: `NET-${fill.batchId}-${String(fill.index + 1).padStart(2, '0')}`,
      fundingA: fundingRecord(fill.orderA, fill.amountUnits),
      fundingB: fundingRecord(fill.orderB, fill.amountUnits),
    };
  },
};
