import type { FundingSelection } from '../data/fundingMethods';

export type RemainderPolicy =
  | 'direct_stellar_fallback'
  | 'refund_to_sender'
  | 'convert_to_fiat_bank';

export type OrderStatus =
  | 'open'
  | 'partially_matched'
  | 'fully_matched'
  | 'settled'
  | 'payout_pending'
  | 'payout_failed'
  | 'refunded'
  | 'fallback_executed'
  | 'remainder_converted'
  | 'cancelled';

export interface MatchFillRecord {
  matchedWithOrderId: string;
  matchedWithSender: string;
  amount: number;
  timestamp: number;
  recipientSettled: string;
  /** For matched fills this is the off-chain netting reference, not a chain tx hash. */
  txHash: string;
  settlementMethod?: string;
  /** How this order's sender paid in this matched amount, and how its recipient is paid (simulated rails). */
  funding?: MatchedFundingView;
}

export interface MatchedFundingView {
  providerId: string;
  providerName: string;
  kindLabel: string;
  reference: string;
  status: 'charged' | 'debit_scheduled' | 'requested' | 'awaiting_cash' | 'pending';
  amountUsdc: number;
  /** What the sender pays, in the sender's currency. */
  currency: string;
  localAmount: number;
  instructions: string;
  details: Record<string, string>;
  /** How this order's recipient is paid (by the partner network, recipient's choice). */
  delivery: { currency: string; localAmount: number; note: string };
  simulated: true;
}

/** The sender's chosen funding method for the matched amount (sensitive fields masked). */
export interface FundingMethodView {
  providerId: string;
  providerName: string;
  kind?: string;
  kindLabel?: string;
  eta?: string;
  details: Record<string, string>;
}

export interface BankAccount {
  id: string;
  institutionName: string;
  accountType: 'checking' | 'savings' | 'mobile_money';
  accountNumberMasked: string;
  routingOrSortCode: string;
  currency: string;
  fiatBalance: number;
  country: string;
  holderName: string;
  isConnected: boolean;
  isPrimary?: boolean;
}

export interface BankingTransaction {
  id: string;
  type: 'deposit_onramp' | 'withdraw_offramp' | 'remainder_conversion';
  bankAccountId: string;
  bankName: string;
  fiatCurrency: string;
  fiatAmount: number;
  usdcAmount: number;
  exchangeRate: number;
  fee: number;
  status: 'completed' | 'processing';
  clearingRef: string;
  stellarTxHash: string;
  timestamp: number;
  orderId?: string;
  recipientName?: string;
}

export interface TransferOrder {
  id: string;
  senderName: string;
  senderAddress: string;
  recipientName: string;
  recipientAddress: string;
  fromCountry: string;
  toCountry: string;
  fromFlag: string;
  toFlag: string;
  amount: number; // total amount to send, in USD (USDC-equivalent)
  matchedAmount: number;
  remainingAmount: number;
  status: OrderStatus;
  createdAt: number;
  deadlineMinutes: number;
  deadlineTimestamp: number;
  remainderPolicy: RemainderPolicy;
  matchHistory: MatchFillRecord[];
  /** Soroban settlement contract that pays out unmatched remainders. */
  escrowContractId: string;
  /** Pre-authorization (`approve`) tx hash. No funds move in this tx. */
  depositTxHash: string;
  preauthExpirationLedger?: number | null;
  settlementTxHash?: string;
  /** Soroban `payout_remainder` tx hash for the unmatched remainder. */
  fallbackTxHash?: string;
  payoutAmount?: number;
  payoutError?: string;
  transferType?: 'matched_pool' | 'direct_instant';
  notes?: string;
  /** Returned by the server: how the sender pays in the matched amount. */
  fundingMethod?: FundingMethodView;
  /** Client-side input when placing an order (full, unmasked details). */
  fundingSelection?: FundingSelection;
  /** Client-side input: linked bank paying the matched part / funding the unmatched part. */
  bankId?: number;
  remainderBankId?: number;
  recipientBankDetails?: {
    bankName: string;
    accountNumberMasked: string;
    currency: string;
  };
  convertedRemainderFiat?: {
    fiatAmount: number;
    currency: string;
    exchangeRate: number;
    bankClearingRef: string;
    conversionTxHash: string;
    timestamp: number;
  };
}

export interface Corridor {
  id: string;
  countryA: {
    name: string;
    code: string;
    flag: string;
    currency: string;
    anchorName: string;
  };
  countryB: {
    name: string;
    code: string;
    flag: string;
    currency: string;
    anchorName: string;
  };
  description: string;
  activeOrdersAtoB: number;
  activeOrdersBtoA: number;
  volumeAtoB: number;
  volumeBtoA: number;
  netMatchableVolume: number;
  offRampSavingsPct: number;
}

export interface BatchSettlementResult {
  batchId: string;
  timestamp: number;
  corridorId: string;
  matchedPairs: Array<{
    orderAId: string;
    orderBId: string;
    settledAmount: number;
    senderA: string;
    senderB: string;
    recipientA: string;
    recipientB: string;
    nettingRef?: string;
  }>;
  totalVolumeNetted: number;
  settlementMethod?: string;
  stroopsGasCost: number;
  stellarLedgerSeq: number;
  txHash: string;
  remaindersProcessed: Array<{
    orderId: string;
    action: 'refunded' | 'fallback_direct_payout';
    amount: number;
    recipientOrSender: string;
  }>;
}

/** A linked bank account (simulated sandbox) with an invisible, server-held Stellar wallet. */
/** A linked payment method (bank, debit card, instant transfer, mobile money, or cash at an agent). */
export interface BankView {
  id: number;
  providerId: string;
  kind: 'bank_account' | 'debit_card' | 'instant_transfer' | 'mobile_money' | 'cash_deposit';
  kindLabel: string;
  name: string;
  details: Record<string, string>;
  balance: number;
  held: number;
  available: number;
}

export interface AccountView {
  id: number;
  displayName: string;
  country: string;
  currency: string;
  /** All linked bank accounts (same country). */
  banks: BankView[];
  /** First linked bank. */
  bank: BankView;
  /** Totals across linked banks, in `currency` (simulated). */
  balance: number;
  /** Reserved for open orders' unmatched amounts (not yet charged). */
  held: number;
  available: number;
  simulatedBank: true;
  wallet: { publicKey: string };
}

export interface UserWallet {
  publicKey: string;
  shortAddress: string;
  usdcBalance: number;
  xlmBalance: number;
  network: 'Stellar Testnet' | 'Futurenet';
  isConnected: boolean;
}
