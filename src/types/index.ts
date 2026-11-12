export type RemainderPolicy =
  | 'direct_stellar_fallback'
  | 'refund_to_sender'
  | 'convert_to_fiat_bank';

export type OrderStatus =
  | 'open'
  | 'partially_matched'
  | 'fully_matched'
  | 'settled'
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
  txHash: string;
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
  amount: number; // total USDC committed to escrow
  matchedAmount: number;
  remainingAmount: number;
  status: OrderStatus;
  createdAt: number;
  deadlineMinutes: number;
  deadlineTimestamp: number;
  remainderPolicy: RemainderPolicy;
  matchHistory: MatchFillRecord[];
  escrowContractId: string;
  depositTxHash: string;
  settlementTxHash?: string;
  fallbackTxHash?: string;
  transferType?: 'matched_pool' | 'direct_instant';
  notes?: string;
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
  }>;
  totalVolumeNetted: number;
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

export interface UserWallet {
  publicKey: string;
  shortAddress: string;
  usdcBalance: number;
  xlmBalance: number;
  network: 'Stellar Testnet' | 'Futurenet';
  isConnected: boolean;
}
