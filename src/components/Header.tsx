import React from 'react';
import { ArrowLeftRight, Wallet, ShieldCheck, RefreshCw, BookOpen, Building2, Play } from 'lucide-react';
import { UserWallet } from '../types';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  wallet: UserWallet;
  onFaucetUsdc: () => void;
  activeOrdersCount?: number;
  onOpenWalletModal?: () => void;
  onOpenBankingModal?: () => void;
  onOpenDemoModal?: () => void;
  latestLedger?: number;
  onOpenTour?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  wallet,
  onFaucetUsdc,
  activeOrdersCount = 0,
  onOpenWalletModal,
  onOpenBankingModal,
  onOpenDemoModal,
  latestLedger,
  onOpenTour,
}) => {
  const navTabs = [
    { id: 'send', label: 'Send' },
    { id: 'dashboard', label: 'Transfers', count: activeOrdersCount },
    { id: 'banking', label: 'Bank & On-Ramp' },
    { id: 'corridors', label: 'Order Book' },
    { id: 'calculator', label: 'Calculator' },
    { id: 'docs', label: 'Documentation' },
  ];

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-6 h-15">
          {/* Zone 1: Wordmark */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setActiveTab('send')}
              className="text-left group flex items-baseline gap-2"
            >
              <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                TwoWay
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500 font-medium hidden sm:inline">
                Stellar Clearing
              </span>
            </button>
          </div>

          {/* Zone 2: Navigation Links */}
          <nav data-tour="nav-tabs" className="hidden md:flex items-center gap-1">
            {navTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Wallet & Network */}
          <div data-tour="wallet-console" className="flex items-center gap-2 shrink-0">
            {onOpenDemoModal && (
              <button
                onClick={onOpenDemoModal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-xs"
                title="Run Live 2-Institution Netting Demo on Stellar Testnet (10 vs 6 USDC -> 4 USDC Net)"
              >
                <Play className="w-3 h-3 fill-current shrink-0" />
                <span>Run Demo</span>
              </button>
            )}

            {onOpenTour && (
              <button
                onClick={onOpenTour}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 font-medium transition-colors"
                title="Open interactive guide"
              >
                <BookOpen className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline">Guide</span>
              </button>
            )}

            {onOpenBankingModal && (
              <button
                onClick={onOpenBankingModal}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800 text-xs text-left transition-colors"
                title="Connected Banking System & Fiat On/Off-Ramp"
              >
                <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                <span className="hidden sm:inline font-medium text-slate-700 dark:text-slate-300">
                  Bank Hub
                </span>
              </button>
            )}

            <button
              onClick={onOpenWalletModal}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800 text-xs text-left transition-colors"
              title="Open Testnet Wallet Console"
            >
              <span className="text-[11px] text-slate-400 font-medium">USDC</span>
              <span className="font-mono-numbers font-semibold text-slate-900 dark:text-white">
                ${wallet.usdcBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </button>

            <button
              onClick={onOpenWalletModal}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-colors"
              title="Stellar Testnet Account"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="font-mono-numbers text-[11px]">{wallet.shortAddress}</span>
            </button>
          </div>
        </div>

        {/* Mobile Nav */}
        <div className="flex md:hidden overflow-x-auto py-2 gap-1 border-t border-slate-100 dark:border-slate-800">
          {navTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap shrink-0 transition-colors ${
                  isActive
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
