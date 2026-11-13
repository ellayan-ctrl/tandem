import { Activity, BookOpen, Landmark, Play } from 'lucide-react';

import logoUrl from '../assets/tandem-logo.png';

export const Header = ({
  activeTab,
  setActiveTab,
  account,
  activeOrdersCount = 0,
  onOpenAccountModal,
  onOpenDemoModal,
  latestLedger,
  onOpenTour,
  contractId,
}) => {
  const navTabs = [
    { id: 'send', label: 'Send' },
    { id: 'dashboard', label: 'Live Orders', count: activeOrdersCount },
    { id: 'mine', label: 'My Transactions' },
    { id: 'corridors', label: 'Transaction History' },
    { id: 'calculator', label: 'Calculator' },
    { id: 'random', label: 'Random Test' },
  ];

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-6 h-15">
          {/* Zone 1: Wordmark */}
          <div className="flex items-center gap-3 shrink-0">
            <button onClick={() => setActiveTab('send')} className="text-left group flex items-center gap-2" aria-label="Tandem, go to Send">
              <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">Tandem</span>
              <img src={logoUrl} alt="Tandem logo" className="h-4 w-auto" />
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
                title="Run an automatic demo on Stellar testnet: send 10, someone sends 8 back, after 15 seconds only the unmatched 2 settles on-chain"
              >
                <Play className="w-3 h-3 fill-current shrink-0" />
                <span>Run Demo</span>
              </button>
            )}

            {contractId && (
              <a
                href={`https://stellar.expert/explorer/testnet/contract/${contractId}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 font-medium transition-colors"
                title="Open the settlement contract on Stellar Expert: every unmatched remainder sent on-chain, live"
                aria-label="Live blockchain feed on Stellar Expert (opens in a new tab)"
              >
                <span className="relative flex w-2 h-2" aria-hidden="true">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-500" />
                </span>
                <Activity className="w-3.5 h-3.5 text-slate-500 sm:hidden" />
                <span className="hidden sm:inline">Live on Stellar Expert</span>
              </a>
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

            <button
              onClick={onOpenAccountModal}
              className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800 text-xs transition-colors"
              title={account ? `${account.bank.name} · view bank account` : 'Link your bank account'}
              aria-label="Open bank account"
            >
              <span className="relative">
                <Landmark className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-white dark:ring-slate-800 ${
                    account ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                />
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{account ? 'Bank Account' : 'Link Bank Account'}</span>
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
                  isActive ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-600 dark:text-slate-400'
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
