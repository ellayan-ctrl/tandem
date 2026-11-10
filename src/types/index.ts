export type RemainderPolicy = 'direct_stellar_fallback' | 'refund_to_sender';

export type OrderStatus =
  | 'open'
  | 'partially_matched'
  | 'fully_matched'
  | 'settled'
  | 'refunded'
  | 'fallback_executed'
  | 'cancelled';

export interface MatchFillRecord {
  matchedWithOrderId: string;
  matchedWithSender: string;
  amount: number;
  timestamp: number;
  recipientSettled: string;
  txHash: string;
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
