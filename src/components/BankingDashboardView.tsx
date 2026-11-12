import React, { useState } from 'react';
import {
  Building2,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Plus,
  CheckCircle2,
  CreditCard,
  Smartphone,
  ShieldCheck,
  TrendingUp,
  Wallet,
  ExternalLink,
} from 'lucide-react';
import { BankAccount, BankingTransaction, UserWallet } from '../types';
import {
  calculateUsdcConversion,
  executeBankDepositOnramp,
  executeBankWithdrawOfframp,
  FX_RATES,
  getStoredBankAccounts,
  getStoredBankingTransactions,
  saveStoredBankAccounts,
} from '../services/bankingService';

interface BankingDashboardViewProps {
  wallet: UserWallet;
  onUpdateWalletBalances: (newUsdc: number) => void;
  onShowToast: (msg: string) => void;
  onOpenConvertModal?: () => void;
}

export const BankingDashboardView: React.FC<BankingDashboardViewProps> = ({
  wallet,
  onUpdateWalletBalances,
  onShowToast,
}) => {
  const [accounts, setAccounts] = useState<BankAccount[]>(getStoredBankAccounts());
  const [transactions, setTransactions] = useState<BankingTransaction[]>(getStoredBankingTransactions());
  const [actionTab, setActionTab] = useState<'deposit' | 'withdraw' | 'link'>('deposit');

  // Deposit On-ramp state
  const [depositBankId, setDepositBankId] = useState<string>(accounts[0]?.id || '');
  const [depositFiat, setDepositFiat] = useState<string>('500');
  const [isDepositing, setIsDepositing] = useState<boolean>(false);

  // Withdraw Off-ramp state
  const [withdrawBankId, setWithdrawBankId] = useState<string>(accounts[0]?.id || '');
  const [withdrawUsdc, setWithdrawUsdc] = useState<string>('200');
  const [isWithdrawing, setIsWithdrawing] = useState<boolean>(false);

  // Link bank state
  const [newBankName, setNewBankName] = useState<string>('Toronto-Dominion (TD)');
  const [newAccType, setNewAccType] = useState<'checking' | 'savings' | 'mobile_money'>('checking');
  const [newAccNumber, setNewAccNumber] = useState<string>('•••• 5829');
  const [newRouting, setNewRouting] = useState<string>('004-00123');
  const [newCurrency, setNewCurrency] = useState<string>('CAD');
  const [newCountry, setNewCountry] = useState<string>('Canada');
  const [newBalance, setNewBalance] = useState<string>('3400');

  const selectedDepositBank = accounts.find((b) => b.id === depositBankId) || accounts[0];
  const selectedWithdrawBank = accounts.find((b) => b.id === withdrawBankId) || accounts[0];

  const parsedDeposit = parseFloat(depositFiat) || 0;
  const depositFx = selectedDepositBank ? FX_RATES[selectedDepositBank.currency] || FX_RATES['USD'] : FX_RATES['USD'];
  const usdcReceived = (parsedDeposit / depositFx.rate).toFixed(2);

  const parsedWithdraw = parseFloat(withdrawUsdc) || 0;
  const withdrawConversion = selectedWithdrawBank
    ? calculateUsdcConversion(parsedWithdraw, selectedWithdrawBank.currency)
    : { netFiat: 0, rate: 1, symbol: '$', feeFiat: 0 };

  const handleDeposit = () => {
    if (!selectedDepositBank || parsedDeposit <= 0) return;
    setIsDepositing(true);

    setTimeout(() => {
      const res = executeBankDepositOnramp({
        bankAccountId: selectedDepositBank.id,
        fiatAmount: parsedDeposit,
      });

      setIsDepositing(false);
      if (res.success) {
        setAccounts(getStoredBankAccounts());
        setTransactions(getStoredBankingTransactions());
        onUpdateWalletBalances(wallet.usdcBalance + res.usdcAmount);
        onShowToast(
          `🏦 Bank On-Ramp Complete: Debited ${selectedDepositBank.currency} ${parsedDeposit.toFixed(
            2
          )}, credited +$${res.usdcAmount.toFixed(2)} USDC to Stellar Wallet!`
        );
      } else {
        onShowToast(`Deposit failed: ${res.error}`);
      }
    }, 600);
  };

  const handleWithdraw = () => {
    if (!selectedWithdrawBank || parsedWithdraw <= 0) return;
    if (parsedWithdraw > wallet.usdcBalance) {
      onShowToast(`Insufficient Stellar USDC balance ($${wallet.usdcBalance.toFixed(2)} available)`);
      return;
    }

    setIsWithdrawing(true);

    setTimeout(() => {
      const res = executeBankWithdrawOfframp({
        bankAccountId: selectedWithdrawBank.id,
        usdcAmount: parsedWithdraw,
      });

      setIsWithdrawing(false);
      if (res.success) {
        setAccounts(getStoredBankAccounts());
        setTransactions(getStoredBankingTransactions());
        onUpdateWalletBalances(Math.max(0, wallet.usdcBalance - parsedWithdraw));
        onShowToast(
          `🏦 Bank Off-Ramp Complete: Burned $${parsedWithdraw.toFixed(
            2
          )} USDC, deposited ${selectedWithdrawBank.currency} ${res.fiatCredited.toFixed(
            2
          )} into ${selectedWithdrawBank.institutionName}!`
        );
      } else {
        onShowToast(`Withdrawal failed: ${res.error}`);
      }
    }, 600);
  };

  const handleLinkBank = (e: React.FormEvent) => {
    e.preventDefault();
    const newAcc: BankAccount = {
      id: `BANK-${Date.now().toString().slice(-4)}`,
      institutionName: newBankName.trim() || 'Connected Domestic Bank',
      accountType: newAccType,
      accountNumberMasked: newAccNumber.trim() || '•••• 0000',
      routingOrSortCode: newRouting.trim() || '00000',
      currency: newCurrency,
      fiatBalance: parseFloat(newBalance) || 1000,
      country: newCountry,
      holderName: 'Alice Tremblay',
      isConnected: true,
      isPrimary: false,
    };

    const updated = [...accounts, newAcc];
    setAccounts(updated);
    saveStoredBankAccounts(updated);
    onShowToast(`Linked new bank account: ${newAcc.institutionName}`);
    setActionTab('deposit');
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Title & Overview */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Connected Banking System & On/Off-Ramp
            </h1>
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
              SEP-24 / SEP-31 Active
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Connect domestic banking rails (Interac, ACH, SEPA, M-Pesa) directly to Stellar USDC Escrow & Netting Pools.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2 text-xs font-mono-numbers">
            <Wallet className="w-3.5 h-3.5 text-indigo-500" />
            <span className="text-slate-400">Escrow Balance:</span>
            <span className="font-bold text-slate-900 dark:text-white">${wallet.usdcBalance.toFixed(2)} USDC</span>
          </div>
        </div>
      </div>

      {/* 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Bank Accounts Cards & Live Rates (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Linked Bank Accounts */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-slate-500" />
                Linked Domestic Banking & Mobile Money Accounts
              </span>
              <button
                type="button"
                onClick={() => setActionTab('link')}
                className="text-[11px] font-semibold text-slate-900 dark:text-white hover:underline flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>Link Another Bank</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {accounts.map((b) => (
                <div
                  key={b.id}
                  className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 hover:border-slate-300 dark:hover:border-slate-700 transition-all space-y-2"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300">
                        {b.accountType === 'mobile_money' ? (
                          <Smartphone className="w-3.5 h-3.5" />
                        ) : (
                          <Building2 className="w-3.5 h-3.5" />
                        )}
                      </div>
                      <div>
                        <h4 className="font-semibold text-xs text-slate-900 dark:text-white leading-tight">
                          {b.institutionName}
                        </h4>
                        <span className="text-[10px] text-slate-400 block font-mono">
                          {b.accountNumberMasked} · {b.country}
                        </span>
                      </div>
                    </div>
                    {b.isPrimary && (
                      <span className="text-[9px] font-semibold px-1 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-mono">
                        Primary
                      </span>
                    )}
                  </div>

                  <div className="pt-1.5 border-t border-slate-200/60 dark:border-slate-800 flex justify-between items-baseline font-mono-numbers">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-sans">Available Fiat</span>
                      <span className="font-bold text-xs text-slate-900 dark:text-white">
                        {FX_RATES[b.currency]?.symbol || '$'}
                        {b.fiatBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} {b.currency}
                      </span>
                    </div>

                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setDepositBankId(b.id);
                          setActionTab('deposit');
                        }}
                        className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 text-[10px] font-semibold"
                      >
                        Deposit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setWithdrawBankId(b.id);
                          setActionTab('withdraw');
                        }}
                        className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 text-[10px] font-semibold"
                      >
                        Withdraw
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live Currency Rates & Off-Ramp Quotations */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 p-4 space-y-3">
            <div className="flex justify-between items-baseline">
              <span className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                Live Anchor FX Rates & Domestic Clearing Channels
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Stellar SEP-38 Quote Server</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono-numbers">
              {Object.entries(FX_RATES).map(([curr, data]) => (
                <div
                  key={curr}
                  className="p-2.5 rounded bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800"
                >
                  <div className="flex justify-between text-[10px] text-slate-400 font-sans">
                    <span>{curr}</span>
                    <span>1 USDC</span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                    {data.symbol}{data.rate.toLocaleString()}
                  </div>
                  <span className="text-[9px] text-emerald-600 dark:text-emerald-400 block font-sans">
                    0.15% anchor fee
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Banking Clearing Ledger */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 p-4 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-900 dark:text-white">
                Domestic Banking Clearing Ledger
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                {transactions.length} verified operations
              </span>
            </div>

            <div className="space-y-2">
              {transactions.slice(0, 5).map((tx) => (
                <div
                  key={tx.id}
                  className="p-2.5 rounded bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${
                        tx.type === 'deposit_onramp'
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600'
                          : tx.type === 'remainder_conversion'
                          ? 'bg-amber-100 dark:bg-amber-950 text-amber-600'
                          : 'bg-sky-100 dark:bg-sky-950 text-sky-600'
                      }`}
                    >
                      {tx.type === 'deposit_onramp' ? (
                        <ArrowDownLeft className="w-3.5 h-3.5" />
                      ) : tx.type === 'remainder_conversion' ? (
                        <RefreshCw className="w-3 h-3" />
                      ) : (
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white text-[11px] flex items-center gap-1.5">
                        <span>
                          {tx.type === 'deposit_onramp'
                            ? 'Bank On-Ramp Deposit'
                            : tx.type === 'remainder_conversion'
                            ? `Remainder Conversion (${tx.recipientName || 'Recipient'})`
                            : 'USDC Bank Off-Ramp'}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {tx.clearingRef}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono block">
                        {tx.bankName} · {new Date(tx.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>

                  <div className="text-right font-mono-numbers">
                    <div className="font-bold text-slate-900 dark:text-white text-xs">
                      {tx.type === 'deposit_onramp' ? '+' : '-'}
                      {tx.usdcAmount.toFixed(2)} USDC
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {FX_RATES[tx.fiatCurrency]?.symbol || '$'}
                      {tx.fiatAmount.toFixed(2)} {tx.fiatCurrency}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Action Console (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
            {/* Action Bar Tabs */}
            <div className="p-1 bg-slate-100 dark:bg-slate-800 flex gap-1 text-xs font-medium">
              <button
                type="button"
                onClick={() => setActionTab('deposit')}
                className={`flex-1 py-1.5 rounded transition-colors text-center ${
                  actionTab === 'deposit'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Deposit Fiat (On-Ramp)
              </button>
              <button
                type="button"
                onClick={() => setActionTab('withdraw')}
                className={`flex-1 py-1.5 rounded transition-colors text-center ${
                  actionTab === 'withdraw'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Withdraw to Bank
              </button>
              <button
                type="button"
                onClick={() => setActionTab('link')}
                className={`flex-1 py-1.5 rounded transition-colors text-center ${
                  actionTab === 'link'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Link Bank
              </button>
            </div>

            <div className="p-4 space-y-4 text-xs">
              {/* DEPOSIT ACTION */}
              {actionTab === 'deposit' && (
                <div className="space-y-3.5">
                  <div>
                    <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 block mb-1">
                      Debit From Linked Bank
                    </label>
                    <select
                      value={depositBankId}
                      onChange={(e) => setDepositBankId(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white text-xs"
                    >
                      {accounts.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.institutionName} ({b.currency} {b.fiatBalance.toFixed(2)} avail)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex justify-between items-baseline mb-1">
                      <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                        Amount to Debit ({selectedDepositBank?.currency})
                      </label>
                      <span className="text-[10px] text-slate-400 font-mono-numbers">
                        Avail: {selectedDepositBank?.fiatBalance.toFixed(2)}
                      </span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-slate-400 font-mono">
                        {FX_RATES[selectedDepositBank?.currency || 'USD']?.symbol || '$'}
                      </span>
                      <input
                        type="number"
                        value={depositFiat}
                        onChange={(e) => setDepositFiat(e.target.value)}
                        placeholder="500"
                        className="w-full pl-8 pr-12 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white font-mono-numbers font-semibold text-xs"
                      />
                      <span className="absolute right-3 top-2 text-slate-400 font-mono text-[10px]">
                        {selectedDepositBank?.currency}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1.5 font-mono-numbers text-[11px]">
                    <div className="flex justify-between text-slate-500">
                      <span>Anchor Exchange Rate:</span>
                      <span>1 USDC = {depositFx.rate} {selectedDepositBank?.currency}</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>Clearing Rail:</span>
                      <span>{selectedDepositBank?.currency === 'CAD' ? 'Interac e-Transfer' : selectedDepositBank?.currency === 'KES' ? 'M-Pesa Express' : 'ACH Direct'}</span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-900 dark:text-white pt-1 border-t border-slate-200 dark:border-slate-700">
                      <span>USDC Credited to Stellar Wallet:</span>
                      <span className="text-emerald-600 dark:text-emerald-400">+{usdcReceived} USDC</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleDeposit}
                    disabled={isDepositing || parsedDeposit <= 0 || (selectedDepositBank && parsedDeposit > selectedDepositBank.fiatBalance)}
                    className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-md text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    {isDepositing ? (
                      <span>Clearing via Domestic Rail...</span>
                    ) : (
                      <>
                        <ArrowDownLeft className="w-3.5 h-3.5" />
                        <span>Execute Bank On-Ramp (+{usdcReceived} USDC)</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* WITHDRAW ACTION */}
              {actionTab === 'withdraw' && (
                <div className="space-y-3.5">
                  <div>
                    <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 block mb-1">
                      Destination Bank Account
                    </label>
                    <select
                      value={withdrawBankId}
                      onChange={(e) => setWithdrawBankId(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white text-xs"
                    >
                      {accounts.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.institutionName} ({b.currency}) · {b.accountNumberMasked}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex justify-between items-baseline mb-1">
                      <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                        Amount of USDC to Withdraw
                      </label>
                      <span className="text-[10px] text-slate-400 font-mono-numbers">
                        Wallet: ${wallet.usdcBalance.toFixed(2)} USDC
                      </span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-slate-400 font-mono">$</span>
                      <input
                        type="number"
                        value={withdrawUsdc}
                        onChange={(e) => setWithdrawUsdc(e.target.value)}
                        placeholder="200"
                        className="w-full pl-8 pr-14 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white font-mono-numbers font-semibold text-xs"
                      />
                      <span className="absolute right-3 top-2 text-slate-400 font-mono text-[10px]">
                        USDC
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1.5 font-mono-numbers text-[11px]">
                    <div className="flex justify-between text-slate-500">
                      <span>Anchor FX Rate:</span>
                      <span>1 USDC = {withdrawConversion.rate} {selectedWithdrawBank?.currency}</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>Anchor Fee (0.15%):</span>
                      <span>${withdrawConversion.feeFiat.toFixed(2)} {selectedWithdrawBank?.currency}</span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-900 dark:text-white pt-1 border-t border-slate-200 dark:border-slate-700">
                      <span>Net Fiat to Deposit:</span>
                      <span className="text-sky-600 dark:text-sky-400">
                        +{withdrawConversion.symbol}{withdrawConversion.netFiat.toLocaleString(undefined, { minimumFractionDigits: 2 })} {selectedWithdrawBank?.currency}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleWithdraw}
                    disabled={isWithdrawing || parsedWithdraw <= 0 || parsedWithdraw > wallet.usdcBalance}
                    className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded-md text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    {isWithdrawing ? (
                      <span>Clearing to Bank...</span>
                    ) : (
                      <>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        <span>Confirm & Withdraw to {selectedWithdrawBank?.institutionName}</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* LINK NEW BANK */}
              {actionTab === 'link' && (
                <form onSubmit={handleLinkBank} className="space-y-3">
                  <div>
                    <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 block mb-1">
                      Bank or Provider Name
                    </label>
                    <input
                      type="text"
                      required
                      value={newBankName}
                      onChange={(e) => setNewBankName(e.target.value)}
                      placeholder="e.g. Scotiabank, Barclays"
                      className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 block mb-1">
                        Type
                      </label>
                      <select
                        value={newAccType}
                        onChange={(e) => setNewAccType(e.target.value as any)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white text-xs"
                      >
                        <option value="checking">Checking</option>
                        <option value="savings">Savings</option>
                        <option value="mobile_money">Mobile Money</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 block mb-1">
                        Currency
                      </label>
                      <select
                        value={newCurrency}
                        onChange={(e) => setNewCurrency(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white text-xs"
                      >
                        <option value="CAD">CAD</option>
                        <option value="KES">KES</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="NGN">NGN</option>
                        <option value="PHP">PHP</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 block mb-1">
                        Account / Transit
                      </label>
                      <input
                        type="text"
                        required
                        value={newAccNumber}
                        onChange={(e) => setNewAccNumber(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white font-mono text-xs"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 block mb-1">
                        Initial Demo Balance
                      </label>
                      <input
                        type="number"
                        required
                        value={newBalance}
                        onChange={(e) => setNewBalance(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white font-mono-numbers text-xs"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded-md text-xs font-semibold transition-colors"
                  >
                    Save & Link Account
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Compliance & Anchor Status Info */}
          <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 space-y-2 text-xs">
            <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Stellar Anchor Standards (SEP-24 & SEP-31)</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              When matched opposite-direction orders execute on Soroban, obligations are settled domestically. For unmatched portions, the integrated Anchor engine guarantees 100% payout to recipient bank accounts without manual intervention.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
