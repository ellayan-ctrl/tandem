import React, { useState } from 'react';
import {
  X,
  Building2,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Plus,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  CreditCard,
  Smartphone,
  ChevronRight,
  AlertCircle,
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

interface BankingHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: UserWallet;
  onUpdateWalletBalances: (newUsdc: number) => void;
  onShowToast: (msg: string) => void;
}

export const BankingHubModal: React.FC<BankingHubModalProps> = ({
  isOpen,
  onClose,
  wallet,
  onUpdateWalletBalances,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<'accounts' | 'deposit' | 'withdraw' | 'history' | 'link'>('accounts');
  const [accounts, setAccounts] = useState<BankAccount[]>(getStoredBankAccounts());
  const [transactions, setTransactions] = useState<BankingTransaction[]>(getStoredBankingTransactions());
  
  // Deposit (On-ramp) State
  const [depositBankId, setDepositBankId] = useState<string>(accounts[0]?.id || '');
  const [depositFiatAmount, setDepositFiatAmount] = useState<string>('500');
  const [isDepositing, setIsDepositing] = useState<boolean>(false);

  // Withdraw (Off-ramp) State
  const [withdrawBankId, setWithdrawBankId] = useState<string>(accounts[0]?.id || '');
  const [withdrawUsdcAmount, setWithdrawUsdcAmount] = useState<string>('200');
  const [isWithdrawing, setIsWithdrawing] = useState<boolean>(false);

  // Link New Account State
  const [newBankName, setNewBankName] = useState<string>('Chase Bank NA');
  const [newAccType, setNewAccType] = useState<'checking' | 'savings' | 'mobile_money'>('checking');
  const [newAccNumber, setNewAccNumber] = useState<string>('•••• 9942');
  const [newRouting, setNewRouting] = useState<string>('021000021');
  const [newCurrency, setNewCurrency] = useState<string>('USD');
  const [newCountry, setNewCountry] = useState<string>('United States');
  const [newHolder, setNewHolder] = useState<string>('Alice Tremblay');
  const [newInitialBalance, setNewInitialBalance] = useState<string>('1500');

  if (!isOpen) return null;

  const selectedDepositBank = accounts.find((a) => a.id === depositBankId) || accounts[0];
  const selectedWithdrawBank = accounts.find((a) => a.id === withdrawBankId) || accounts[0];

  // Calculations for deposit
  const parsedDepositFiat = parseFloat(depositFiatAmount) || 0;
  const depositFx = selectedDepositBank ? FX_RATES[selectedDepositBank.currency] || FX_RATES['USD'] : FX_RATES['USD'];
  const estimatedUsdcToReceive = (parsedDepositFiat / depositFx.rate).toFixed(2);

  // Calculations for withdraw
  const parsedWithdrawUsdc = parseFloat(withdrawUsdcAmount) || 0;
  const withdrawConversion = selectedWithdrawBank
    ? calculateUsdcConversion(parsedWithdrawUsdc, selectedWithdrawBank.currency)
    : { netFiat: 0, rate: 1, symbol: '$', feeFiat: 0 };

  const handleDeposit = () => {
    if (!selectedDepositBank || parsedDepositFiat <= 0) return;
    setIsDepositing(true);

    setTimeout(() => {
      const res = executeBankDepositOnramp({
        bankAccountId: selectedDepositBank.id,
        fiatAmount: parsedDepositFiat,
      });

      setIsDepositing(false);
      if (res.success) {
        setAccounts(getStoredBankAccounts());
        setTransactions(getStoredBankingTransactions());
        onUpdateWalletBalances(wallet.usdcBalance + res.usdcAmount);
        onShowToast(
          `🏦 Bank On-Ramp Complete: Debited ${selectedDepositBank.currency} ${parsedDepositFiat.toFixed(
            2
          )}, minted +$${res.usdcAmount.toFixed(2)} USDC on Stellar Testnet!`
        );
        setActiveTab('history');
      } else {
        onShowToast(`Deposit failed: ${res.error}`);
      }
    }, 600);
  };

  const handleWithdraw = () => {
    if (!selectedWithdrawBank || parsedWithdrawUsdc <= 0) return;
    if (parsedWithdrawUsdc > wallet.usdcBalance) {
      onShowToast(`Insufficient Stellar USDC balance ($${wallet.usdcBalance.toFixed(2)} available)`);
      return;
    }

    setIsWithdrawing(true);

    setTimeout(() => {
      const res = executeBankWithdrawOfframp({
        bankAccountId: selectedWithdrawBank.id,
        usdcAmount: parsedWithdrawUsdc,
      });

      setIsWithdrawing(false);
      if (res.success) {
        setAccounts(getStoredBankAccounts());
        setTransactions(getStoredBankingTransactions());
        onUpdateWalletBalances(Math.max(0, wallet.usdcBalance - parsedWithdrawUsdc));
        onShowToast(
          `🏦 Bank Off-Ramp Complete: Burned $${parsedWithdrawUsdc.toFixed(
            2
          )} USDC, credited ${selectedWithdrawBank.currency} ${res.fiatCredited.toFixed(
            2
          )} directly to ${selectedWithdrawBank.institutionName}!`
        );
        setActiveTab('history');
      } else {
        onShowToast(`Withdrawal failed: ${res.error}`);
      }
    }, 600);
  };

  const handleLinkNewAccount = (e: React.FormEvent) => {
    e.preventDefault();
    const newAccount: BankAccount = {
      id: `BANK-CUSTOM-${Date.now().toString().slice(-4)}`,
      institutionName: newBankName.trim() || 'Connected Domestic Bank',
      accountType: newAccType,
      accountNumberMasked: newAccNumber.trim() || '•••• 0000',
      routingOrSortCode: newRouting.trim() || '000000',
      currency: newCurrency,
      fiatBalance: parseFloat(newInitialBalance) || 500,
      country: newCountry,
      holderName: newHolder.trim() || 'User Account',
      isConnected: true,
      isPrimary: false,
    };

    const updated = [...accounts, newAccount];
    setAccounts(updated);
    saveStoredBankAccounts(updated);
    onShowToast(`Linked new bank account: ${newAccount.institutionName} (${newAccount.currency})`);
    setActiveTab('accounts');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-2xl w-full my-6 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-500/20">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Connected Banking System & On/Off-Ramp
                </h3>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-semibold">
                  SEP-24 / SEP-31 Active
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Domestic bank rails (Interac, ACH, SEPA, M-Pesa) linked to Stellar USDC Escrow
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-5 border-b border-slate-200 dark:border-slate-800 flex gap-4 text-xs font-medium bg-white dark:bg-slate-900">
          <button
            onClick={() => setActiveTab('accounts')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'accounts'
                ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Bank Accounts ({accounts.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('deposit')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'deposit'
                ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-500" />
            <span>Deposit Fiat (On-Ramp)</span>
          </button>

          <button
            onClick={() => setActiveTab('withdraw')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'withdraw'
                ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5 text-sky-500" />
            <span>Withdraw to Bank (Off-Ramp)</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`py-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Banking Ledger</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
          {/* TAB 1: ACCOUNTS LIST */}
          {activeTab === 'accounts' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 text-[11px]">
                  Your authenticated domestic bank accounts and mobile money wallets:
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('link')}
                  className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded text-xs font-semibold flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Link New Bank</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {accounts.map((bank) => (
                  <div
                    key={bank.id}
                    className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 transition-all space-y-2.5 shadow-2xs"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300">
                          {bank.accountType === 'mobile_money' ? (
                            <Smartphone className="w-4 h-4" />
                          ) : (
                            <Building2 className="w-4 h-4" />
                          )}
                        </div>
                        <div>
                          <h4 className="font-semibold text-slate-900 dark:text-white leading-tight">
                            {bank.institutionName}
                          </h4>
                          <span className="text-[10px] text-slate-400 block font-mono">
                            {bank.accountNumberMasked} · {bank.country}
                          </span>
                        </div>
                      </div>
                      {bank.isPrimary && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-mono">
                          Primary
                        </span>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between items-baseline font-mono-numbers">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Available Fiat</span>
                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                          {FX_RATES[bank.currency]?.symbol || '$'}
                          {bank.fiatBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })} {bank.currency}
                        </span>
                      </div>
                      <div className="flex gap-1.5 text-[10px]">
                        <button
                          type="button"
                          onClick={() => {
                            setDepositBankId(bank.id);
                            setActiveTab('deposit');
                          }}
                          className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 font-semibold transition-colors"
                        >
                          Deposit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setWithdrawBankId(bank.id);
                            setActiveTab('withdraw');
                          }}
                          className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 font-semibold transition-colors"
                        >
                          Withdraw
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Wallet Summary Banner */}
              <div className="p-3.5 rounded-lg border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold font-mono">
                    $
                  </div>
                  <div>
                    <span className="text-[11px] text-indigo-900 dark:text-indigo-200 font-semibold block">
                      Stellar Testnet USDC Escrow Wallet
                    </span>
                    <span className="text-[10px] text-indigo-700/80 dark:text-indigo-400 font-mono">
                      {wallet.shortAddress} · Ready for bilateral matching
                    </span>
                  </div>
                </div>
                <div className="text-right font-mono-numbers">
                  <span className="text-sm font-bold text-indigo-900 dark:text-indigo-100">
                    ${wallet.usdcBalance.toFixed(2)} USDC
                  </span>
                  <span className="text-[10px] text-slate-400 block font-sans">
                    {wallet.xlmBalance.toFixed(1)} XLM gas
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DEPOSIT FIAT (ON-RAMP) */}
          {activeTab === 'deposit' && (
            <div className="space-y-4 max-w-md mx-auto">
              <div className="text-center space-y-1">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                  Debit Linked Bank Account & Credit Stellar USDC
                </h4>
                <p className="text-[11px] text-slate-500">
                  Instant domestic clearing (Interac / FedNow / ACH / M-Pesa) via Anchor SEP-24
                </p>
              </div>

              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3.5">
                <div>
                  <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 block mb-1">
                    Debit From Bank Account
                  </label>
                  <select
                    value={depositBankId}
                    onChange={(e) => setDepositBankId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white text-xs"
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
                      Max: {selectedDepositBank?.fiatBalance.toFixed(2)}
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-400 font-mono">
                      {FX_RATES[selectedDepositBank?.currency || 'USD']?.symbol || '$'}
                    </span>
                    <input
                      type="number"
                      value={depositFiatAmount}
                      onChange={(e) => setDepositFiatAmount(e.target.value)}
                      placeholder="500"
                      className="w-full pl-8 pr-12 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white font-mono-numbers font-semibold text-xs"
                    />
                    <span className="absolute right-3 top-2 text-slate-400 font-mono text-[10px]">
                      {selectedDepositBank?.currency}
                    </span>
                  </div>
                </div>

                {/* Conversion Preview Card */}
                <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-[11px] space-y-1.5 font-mono-numbers">
                  <div className="flex justify-between text-slate-500">
                    <span>Anchor FX Exchange Rate:</span>
                    <span>1 USDC = {depositFx.rate} {selectedDepositBank?.currency}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Domestic Clearing Fee:</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">$0.00 (Subsidized)</span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-900 dark:text-white pt-1.5 border-t border-slate-200 dark:border-slate-700 text-xs">
                    <span>USDC Credited to Stellar Wallet:</span>
                    <span className="text-emerald-600 dark:text-emerald-400">+{estimatedUsdcToReceive} USDC</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDeposit}
                  disabled={isDepositing || parsedDepositFiat <= 0 || (selectedDepositBank && parsedDepositFiat > selectedDepositBank.fiatBalance)}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-md text-xs font-semibold transition-colors flex items-center justify-center gap-2 shadow-xs"
                >
                  {isDepositing ? (
                    <span>Clearing via Domestic Rail...</span>
                  ) : (
                    <>
                      <ArrowDownLeft className="w-4 h-4" />
                      <span>Execute Bank On-Ramp (+{estimatedUsdcToReceive} USDC)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: WITHDRAW TO BANK (OFF-RAMP) */}
          {activeTab === 'withdraw' && (
            <div className="space-y-4 max-w-md mx-auto">
              <div className="text-center space-y-1">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                  Burn Stellar USDC & Deposit to Linked Bank
                </h4>
                <p className="text-[11px] text-slate-500">
                  Direct off-ramp into your domestic checking account or mobile money
                </p>
              </div>

              <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3.5">
                <div>
                  <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 block mb-1">
                    Destination Bank Account
                  </label>
                  <select
                    value={withdrawBankId}
                    onChange={(e) => setWithdrawBankId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white text-xs"
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
                      value={withdrawUsdcAmount}
                      onChange={(e) => setWithdrawUsdcAmount(e.target.value)}
                      placeholder="200"
                      className="w-full pl-8 pr-16 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white font-mono-numbers font-semibold text-xs"
                    />
                    <span className="absolute right-3 top-2 text-slate-400 font-mono text-[10px]">
                      USDC
                    </span>
                  </div>
                </div>

                {/* Conversion Preview Card */}
                <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-[11px] space-y-1.5 font-mono-numbers">
                  <div className="flex justify-between text-slate-500">
                    <span>Anchor FX Rate:</span>
                    <span>1 USDC = {withdrawConversion.rate} {selectedWithdrawBank?.currency}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Anchor Processing Fee (0.15%):</span>
                    <span>${withdrawConversion.feeFiat.toFixed(2)} {selectedWithdrawBank?.currency}</span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-900 dark:text-white pt-1.5 border-t border-slate-200 dark:border-slate-700 text-xs">
                    <span>Net Bank Deposit:</span>
                    <span className="text-sky-600 dark:text-sky-400">
                      +{withdrawConversion.symbol}{withdrawConversion.netFiat.toLocaleString(undefined, { minimumFractionDigits: 2 })} {selectedWithdrawBank?.currency}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleWithdraw}
                  disabled={isWithdrawing || parsedWithdrawUsdc <= 0 || parsedWithdrawUsdc > wallet.usdcBalance}
                  className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded-md text-xs font-semibold transition-colors flex items-center justify-center gap-2 shadow-xs"
                >
                  {isWithdrawing ? (
                    <span>Dispatched to Bank Clearing...</span>
                  ) : (
                    <>
                      <ArrowUpRight className="w-4 h-4" />
                      <span>Confirm & Deposit to {selectedWithdrawBank?.institutionName}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: BANKING LEDGER & AUDIT TRAIL */}
          {activeTab === 'history' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center text-[11px] text-slate-500">
                <span>Verified banking on-ramp and off-ramp domestic clearing records:</span>
                <span className="font-mono">{transactions.length} records</span>
              </div>

              <div className="space-y-2">
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${
                          tx.type === 'deposit_onramp'
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400'
                            : tx.type === 'remainder_conversion'
                            ? 'bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400'
                            : 'bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-400'
                        }`}
                      >
                        {tx.type === 'deposit_onramp' ? (
                          <ArrowDownLeft className="w-4 h-4" />
                        ) : tx.type === 'remainder_conversion' ? (
                          <RefreshCw className="w-3.5 h-3.5" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>
                            {tx.type === 'deposit_onramp'
                              ? 'Fiat On-Ramp Deposit'
                              : tx.type === 'remainder_conversion'
                              ? `Remainder Conversion (${tx.recipientName || 'Recipient'})`
                              : 'USDC Bank Off-Ramp'}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {tx.clearingRef}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 block font-mono">
                          {tx.bankName} · {new Date(tx.timestamp).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between font-mono-numbers">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {tx.type === 'deposit_onramp' ? '+' : '-'}
                        {tx.usdcAmount.toFixed(2)} USDC
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {FX_RATES[tx.fiatCurrency]?.symbol || '$'}
                        {tx.fiatAmount.toFixed(2)} {tx.fiatCurrency} (Rate: {tx.exchangeRate})
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: LINK NEW BANK */}
          {activeTab === 'link' && (
            <form onSubmit={handleLinkNewAccount} className="space-y-3.5 max-w-md mx-auto">
              <div className="text-center space-y-1">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                  Connect New Domestic Bank or Mobile Money Rail
                </h4>
                <p className="text-[11px] text-slate-500">
                  Integrate local ACH, Interac, SEPA, or M-Pesa provider
                </p>
              </div>

              <div className="space-y-3 p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div>
                  <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 block mb-1">
                    Institution Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newBankName}
                    onChange={(e) => setNewBankName(e.target.value)}
                    placeholder="e.g. Scotiabank, Barclays, Safaricom M-Pesa"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 block mb-1">
                      Account Type
                    </label>
                    <select
                      value={newAccType}
                      onChange={(e) => setNewAccType(e.target.value as any)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white text-xs"
                    >
                      <option value="checking">Checking Account</option>
                      <option value="savings">Savings Account</option>
                      <option value="mobile_money">Mobile Money (M-Pesa/GCash)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 block mb-1">
                      Currency
                    </label>
                    <select
                      value={newCurrency}
                      onChange={(e) => setNewCurrency(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white text-xs"
                    >
                      <option value="CAD">CAD (Canada)</option>
                      <option value="KES">KES (Kenya)</option>
                      <option value="USD">USD (United States)</option>
                      <option value="EUR">EUR (Eurozone)</option>
                      <option value="NGN">NGN (Nigeria)</option>
                      <option value="PHP">PHP (Philippines)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 block mb-1">
                      Account / Phone Number
                    </label>
                    <input
                      type="text"
                      required
                      value={newAccNumber}
                      onChange={(e) => setNewAccNumber(e.target.value)}
                      placeholder="•••• 1234 or +254 7..."
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 block mb-1">
                      Starting Demo Balance
                    </label>
                    <input
                      type="number"
                      required
                      value={newInitialBalance}
                      onChange={(e) => setNewInitialBalance(e.target.value)}
                      placeholder="1500"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white font-mono-numbers text-xs"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('accounts')}
                    className="flex-1 py-2 px-3 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-md text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 px-3 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded-md text-xs font-semibold transition-colors"
                  >
                    Link Bank
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Regulated Stellar Anchor Sandbox API Compliant</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded font-semibold text-xs transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
