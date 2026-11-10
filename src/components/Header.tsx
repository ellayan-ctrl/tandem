import React from 'react';
import { ArrowLeftRight, Wallet, ShieldCheck, RefreshCw } from 'lucide-react';
import { UserWallet } from '../types';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  wallet: UserWallet;
  onFaucetUsdc: () => void;
  activeOrdersCount?: number;
  onOpenWalletModal?: () => void;
  latestLedger?: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  wallet,
  onFaucetUsdc,
  activeOrdersCount = 0,
  onOpenWalletModal,
  latestLedger,
}) => {
  const navTabs = [
    { id: 'send', label: 'Send Money' },
    { id: 'dashboard', label: 'Transfers', count: activeOrdersCount },
    { id: 'corridors', label: 'Matching Pools' },
    { id: 'calculator', label: 'Savings Calculator' },
    { id: 'docs', label: 'Protocol & Specs' },
  ];

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-8 h-16">
          {/* Zone 1: Single text element wordmark */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-sm">
              <ArrowLeftRight className="w-4 h-4" />
            </div>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setActiveTab('send');
              }}
              className="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap"
            >
              TwoWay Stellar
            </a>
            <span className="hidden sm:inline-flex text-[11px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              USDC Netting Protocol
            </span>
          </div>

          {/* Zone 2: Clean single-line text navigation links */}
          <nav className="hidden md:flex items-center gap-1 sm:gap-2">
            {navTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      isActive
                        ? 'bg-indigo-500 text-white dark:bg-indigo-600'
                        : 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary action / wallet context */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={onOpenWalletModal}
              title="Open Stellar Testnet Wallet Console & Friendbot Faucet"
              className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left"
            >
              <Wallet className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <div className="flex items-center gap-1.5">
                <span className="font-mono-numbers font-semibold text-slate-900 dark:text-slate-100">
                  ${wallet.usdcBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-slate-400 font-medium text-[11px]">USDC</span>
              </div>
            </button>

            <button
              onClick={onOpenWalletModal}
              title="View on Stellar Testnet Explorer"
              className="hidden lg:flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-2.5 py-1.5 rounded-md transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-semibold text-slate-700 dark:text-slate-300">Testnet</span>
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <span className="font-mono-numbers">{wallet.shortAddress}</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation bar */}
        <div className="flex md:hidden overflow-x-auto py-2 gap-1 border-t border-slate-100 dark:border-slate-800">
          {navTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors ${
                  isActive
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
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
