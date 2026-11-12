import { BankAccount, BankingTransaction, TransferOrder } from '../types';

export const FX_RATES: Record<string, { rate: number; symbol: string; name: string }> = {
  CAD: { rate: 1.392, symbol: 'CA$', name: 'Canadian Dollar' },
  KES: { rate: 129.5, symbol: 'KSh', name: 'Kenyan Shilling' },
  USD: { rate: 1.0, symbol: '$', name: 'US Dollar' },
  EUR: { rate: 0.942, symbol: '€', name: 'Euro' },
  NGN: { rate: 1480.0, symbol: '₦', name: 'Nigerian Naira' },
  PHP: { rate: 58.45, symbol: '₱', name: 'Philippine Peso' },
  ARS: { rate: 1050.0, symbol: 'AR$', name: 'Argentine Peso' },
};

export const INITIAL_BANK_ACCOUNTS: BankAccount[] = [
  {
    id: 'BANK-RBC-01',
    institutionName: 'Royal Bank of Canada (RBC)',
    accountType: 'checking',
    accountNumberMasked: '•••• 8412',
    routingOrSortCode: '00012-003',
    currency: 'CAD',
    fiatBalance: 4850.0,
    country: 'Canada',
    holderName: 'Alice Tremblay',
    isConnected: true,
    isPrimary: true,
  },
  {
    id: 'BANK-CHASE-02',
    institutionName: 'JPMorgan Chase Bank, NA',
    accountType: 'checking',
    accountNumberMasked: '•••• 3391',
    routingOrSortCode: '021000021',
    currency: 'USD',
    fiatBalance: 3200.0,
    country: 'United States',
    holderName: 'Alice Tremblay',
    isConnected: true,
    isPrimary: false,
  },
  {
    id: 'BANK-MPESA-03',
    institutionName: 'Safaricom M-Pesa / Equity Bank',
    accountType: 'mobile_money',
    accountNumberMasked: '+254 712 345 678',
    routingOrSortCode: 'PAYBILL-247247',
    currency: 'KES',
    fiatBalance: 125000.0,
    country: 'Kenya',
    holderName: 'David Kilonzo',
    isConnected: true,
    isPrimary: false,
  },
  {
    id: 'BANK-SEPA-04',
    institutionName: 'BNP Paribas SEPA',
    accountType: 'checking',
    accountNumberMasked: 'FR76 •••• 9821',
    routingOrSortCode: 'BNPAFR22',
    currency: 'EUR',
    fiatBalance: 2400.0,
    country: 'European Union',
    holderName: 'Alice Tremblay',
    isConnected: true,
    isPrimary: false,
  },
];

const BANKING_STORAGE_KEY = 'twoway_banking_accounts_v1';
const BANKING_TX_STORAGE_KEY = 'twoway_banking_transactions_v1';

export function getStoredBankAccounts(): BankAccount[] {
  try {
    const raw = localStorage.getItem(BANKING_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Could not read banking accounts from localStorage:', e);
  }
  return INITIAL_BANK_ACCOUNTS;
}

export function saveStoredBankAccounts(accounts: BankAccount[]): void {
  try {
    localStorage.setItem(BANKING_STORAGE_KEY, JSON.stringify(accounts));
  } catch (e) {
    console.warn('Could not save bank accounts to localStorage:', e);
  }
}

export function getStoredBankingTransactions(): BankingTransaction[] {
  try {
    const raw = localStorage.getItem(BANKING_TX_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Could not read banking transactions from localStorage:', e);
  }
  return [
    {
      id: 'BTX-INIT-01',
      type: 'deposit_onramp',
      bankAccountId: 'BANK-RBC-01',
      bankName: 'Royal Bank of Canada (RBC)',
      fiatCurrency: 'CAD',
      fiatAmount: 696.0,
      usdcAmount: 500.0,
      exchangeRate: 1.392,
      fee: 0.0,
      status: 'completed',
      clearingRef: 'INTERAC-EFT-991204',
      stellarTxHash: '1e0496807293bf6400d1ea71e73971fa3b3bdd9ad27b35b1c93e79917923a242',
      timestamp: Date.now() - 1000 * 60 * 60 * 4,
    },
  ];
}

export function saveStoredBankingTransactions(transactions: BankingTransaction[]): void {
  try {
    localStorage.setItem(BANKING_TX_STORAGE_KEY, JSON.stringify(transactions));
  } catch (e) {
    console.warn('Could not save banking transactions to localStorage:', e);
  }
}

/**
 * Calculates conversion amounts between USDC and target fiat currency
 */
export function calculateUsdcConversion(
  usdcAmount: number,
  targetCurrency: string
): {
  grossFiat: number;
  feeFiat: number;
  netFiat: number;
  rate: number;
  symbol: string;
} {
  const fx = FX_RATES[targetCurrency] || FX_RATES['USD'];
  const grossFiat = usdcAmount * fx.rate;
  // Two-Way corridor discount: transparent 0.15% anchor processing fee vs 3-5% traditional bank spread
  const feeFiat = grossFiat * 0.0015;
  const netFiat = grossFiat - feeFiat;

  return {
    grossFiat,
    feeFiat,
    netFiat,
    rate: fx.rate,
    symbol: fx.symbol,
  };
}

/**
 * Executes on-ramp: Debit linked bank account -> Mint/Credit Stellar USDC
 */
export function executeBankDepositOnramp(params: {
  bankAccountId: string;
  fiatAmount: number;
}): {
  success: boolean;
  usdcAmount: number;
  newFiatBalance: number;
  transaction: BankingTransaction;
  error?: string;
} {
  const accounts = getStoredBankAccounts();
  const bank = accounts.find((b) => b.id === params.bankAccountId);

  if (!bank) {
    return {
      success: false,
      usdcAmount: 0,
      newFiatBalance: 0,
      transaction: {} as any,
      error: 'Selected bank account was not found',
    };
  }

  if (bank.fiatBalance < params.fiatAmount) {
    return {
      success: false,
      usdcAmount: 0,
      newFiatBalance: bank.fiatBalance,
      transaction: {} as any,
      error: `Insufficient bank balance (${bank.currency} ${bank.fiatBalance.toFixed(2)} available)`,
    };
  }

  const fx = FX_RATES[bank.currency] || FX_RATES['USD'];
  const usdcEquivalent = Number((params.fiatAmount / fx.rate).toFixed(2));
  const newBalance = bank.fiatBalance - params.fiatAmount;

  // Update bank accounts
  const updatedAccounts = accounts.map((b) =>
    b.id === bank.id ? { ...b, fiatBalance: newBalance } : b
  );
  saveStoredBankAccounts(updatedAccounts);

  const clearingRef = `${bank.currency === 'CAD' ? 'INTERAC-EFT' : bank.currency === 'KES' ? 'M-PESA' : 'ACH-WIRE'}-${Date.now().toString().slice(-6)}`;
  const stellarTxHash = Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');

  const transaction: BankingTransaction = {
    id: `BTX-ONRAMP-${Date.now().toString().slice(-6)}`,
    type: 'deposit_onramp',
    bankAccountId: bank.id,
    bankName: bank.institutionName,
    fiatCurrency: bank.currency,
    fiatAmount: params.fiatAmount,
    usdcAmount: usdcEquivalent,
    exchangeRate: fx.rate,
    fee: 0.0,
    status: 'completed',
    clearingRef,
    stellarTxHash,
    timestamp: Date.now(),
  };

  const txs = [transaction, ...getStoredBankingTransactions()];
  saveStoredBankingTransactions(txs);

  return {
    success: true,
    usdcAmount: usdcEquivalent,
    newFiatBalance: newBalance,
    transaction,
  };
}

/**
 * Executes off-ramp: Debit Stellar USDC -> Credit linked bank account
 */
export function executeBankWithdrawOfframp(params: {
  bankAccountId: string;
  usdcAmount: number;
}): {
  success: boolean;
  fiatCredited: number;
  newFiatBalance: number;
  transaction: BankingTransaction;
  error?: string;
} {
  const accounts = getStoredBankAccounts();
  const bank = accounts.find((b) => b.id === params.bankAccountId);

  if (!bank) {
    return {
      success: false,
      fiatCredited: 0,
      newFiatBalance: 0,
      transaction: {} as any,
      error: 'Selected bank account was not found',
    };
  }

  const { netFiat, rate } = calculateUsdcConversion(params.usdcAmount, bank.currency);
  const newBalance = bank.fiatBalance + netFiat;

  // Update bank accounts
  const updatedAccounts = accounts.map((b) =>
    b.id === bank.id ? { ...b, fiatBalance: newBalance } : b
  );
  saveStoredBankAccounts(updatedAccounts);

  const clearingRef = `${bank.currency === 'CAD' ? 'INTERAC-DEP' : bank.currency === 'KES' ? 'MPESA-PAYOUT' : 'ACH-CREDIT'}-${Date.now().toString().slice(-6)}`;
  const stellarTxHash = Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');

  const transaction: BankingTransaction = {
    id: `BTX-OFFRAMP-${Date.now().toString().slice(-6)}`,
    type: 'withdraw_offramp',
    bankAccountId: bank.id,
    bankName: bank.institutionName,
    fiatCurrency: bank.currency,
    fiatAmount: netFiat,
    usdcAmount: params.usdcAmount,
    exchangeRate: rate,
    fee: params.usdcAmount * 0.0015,
    status: 'completed',
    clearingRef,
    stellarTxHash,
    timestamp: Date.now(),
  };

  const txs = [transaction, ...getStoredBankingTransactions()];
  saveStoredBankingTransactions(txs);

  return {
    success: true,
    fiatCredited: netFiat,
    newFiatBalance: newBalance,
    transaction,
  };
}

/**
 * Converts the unmatched remainder of a TransferOrder directly into recipient or sender bank fiat
 */
export function executeRemainderConversion(params: {
  order: TransferOrder;
  targetCurrency?: string;
  targetBankName?: string;
  accountNumberMasked?: string;
}): {
  success: boolean;
  updatedOrder: TransferOrder;
  conversionSummary: {
    remainderUsdc: number;
    convertedFiat: number;
    fiatCurrency: string;
    rate: number;
    clearingRef: string;
    txHash: string;
  };
} {
  const { order } = params;
  const remainder = order.remainingAmount;

  // Determine destination currency from corridor
  const currency =
    params.targetCurrency ||
    (order.toCountry === 'Kenya'
      ? 'KES'
      : order.toCountry === 'Canada'
      ? 'CAD'
      : order.toCountry === 'Nigeria'
      ? 'NGN'
      : order.toCountry === 'Philippines'
      ? 'PHP'
      : order.toCountry === 'Argentina'
      ? 'ARS'
      : 'USD');

  const { netFiat, rate } = calculateUsdcConversion(remainder, currency);

  const bankName =
    params.targetBankName ||
    (currency === 'KES'
      ? 'Equity Bank / Safaricom M-Pesa'
      : currency === 'CAD'
      ? 'TD Canada Trust / Interac'
      : currency === 'NGN'
      ? 'Flutterwave / Access Bank'
      : currency === 'PHP'
      ? 'GCash / BDO Unibank'
      : 'Domestic Commercial Bank');

  const clearingRef = `${currency === 'KES' ? 'MPESA' : currency === 'CAD' ? 'INTERAC' : 'BANK'}-SETTLE-${Date.now().toString().slice(-6)}`;
  const conversionTxHash = Array.from({ length: 64 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');

  const updatedOrder: TransferOrder = {
    ...order,
    remainingAmount: 0,
    status: 'remainder_converted',
    fallbackTxHash: conversionTxHash,
    convertedRemainderFiat: {
      fiatAmount: netFiat,
      currency,
      exchangeRate: rate,
      bankClearingRef: clearingRef,
      conversionTxHash,
      timestamp: Date.now(),
    },
    notes: `${order.notes || ''} · Remainder ($${remainder.toFixed(
      2
    )} USDC) auto-converted to ${currency} ${netFiat.toFixed(
      2
    )} and credited to ${order.recipientName}'s ${bankName} (${clearingRef}).`,
  };

  // Record banking transaction
  const transaction: BankingTransaction = {
    id: `BTX-REMAINDER-${Date.now().toString().slice(-6)}`,
    type: 'remainder_conversion',
    bankAccountId: `BANK-DEST-${currency}`,
    bankName,
    fiatCurrency: currency,
    fiatAmount: netFiat,
    usdcAmount: remainder,
    exchangeRate: rate,
    fee: remainder * 0.0015,
    status: 'completed',
    clearingRef,
    stellarTxHash: conversionTxHash,
    timestamp: Date.now(),
    orderId: order.id,
    recipientName: order.recipientName,
  };

  const txs = [transaction, ...getStoredBankingTransactions()];
  saveStoredBankingTransactions(txs);

  return {
    success: true,
    updatedOrder,
    conversionSummary: {
      remainderUsdc: remainder,
      convertedFiat: netFiat,
      fiatCurrency: currency,
      rate,
      clearingRef,
      txHash: conversionTxHash,
    },
  };
}
