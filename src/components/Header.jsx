import { BookOpen, ExternalLink, Landmark } from 'lucide-react';

import logoUrl from '../assets/tandem-logo.png';

const NAV_TABS = [
  { id: 'send', label: 'Send' },
  { id: 'dashboard', label: 'Live orders', countKey: true },
  { id: 'mine', label: 'My transfers' },
  { id: 'corridors', label: 'History' },
  { id: 'calculator', label: 'Calculator' },
  { id: 'demo', label: 'Demo & tests' },
];

export const Header = ({ activeTab, setActiveTab, account, activeOrdersCount = 0, onOpenAccountModal, onOpenTour, contractId }) => {
  const tab = (t, mobile = false) => {
    const isActive = activeTab === t.id;
    return (
      <button
        key={t.id}
        onClick={() => setActiveTab(t.id)}
        aria-current={isActive ? 'page' : undefined}
        className={`relative shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap font-medium transition-colors ${
          mobile ? 'h-11 px-3 text-sm' : 'h-15 px-3.5 text-[15px]'
        } ${isActive ? 'text-white' : 'text-slate-300 hover:text-white'}`}
      >
        {t.label}
        {t.countKey && activeOrdersCount > 0 && (
          <span className="min-w-5 h-5 px-1 inline-flex items-center justify-center rounded-xs bg-white/12 text-[12px] font-semibold text-white">
            {activeOrdersCount}
          </span>
        )}
        <span
          aria-hidden="true"
          className={`absolute left-3 right-3 bottom-0 h-[3px] transition-colors ${isActive ? 'bg-white' : 'bg-transparent'}`}
        />
      </button>
    );
  };

  return (
    <header className="sticky top-0 z-30 bg-ink text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6 h-14 md:h-15">
          <button
            onClick={() => setActiveTab('send')}
            className="flex items-center gap-2.5 shrink-0"
            aria-label="Tandem, go to Send"
          >
            <img src={logoUrl} alt="" className="h-5 w-auto" />
            <span className="text-xl font-semibold tracking-tight">Tandem</span>
          </button>

          <nav data-tour="nav-tabs" aria-label="Main" className="hidden lg:flex items-stretch self-stretch">
            {NAV_TABS.map((t) => tab(t))}
          </nav>

          <div data-tour="wallet-console" className="ml-auto flex items-center gap-2 sm:gap-3 shrink-0">
            <span
              className="hidden sm:inline-flex h-7 items-center px-2 rounded-xs ring-1 ring-inset ring-amber-400/60 text-amber-300 font-[family-name:var(--font-label)] font-semibold text-[12px] tracking-wider"
              title="Test network: test USDC, simulated bank rails. No real money moves."
            >
              TESTNET
            </span>

            {contractId && (
              <a
                href={`https://stellar.expert/explorer/testnet/contract/${contractId}`}
                target="_blank"
                rel="noreferrer"
                className="hidden md:inline-flex h-8 items-center gap-2 px-2.5 rounded-sm text-sm text-slate-200 hover:text-white hover:bg-white/8 transition-colors"
                title="Every unmatched remainder Tandem has sent, on Stellar Expert"
              >
                <span className="inline-flex w-2 h-2 rounded-full bg-emerald-300" aria-hidden="true" />
                Settlement contract
                <ExternalLink className="w-3.5 h-3.5 opacity-70" aria-hidden="true" />
              </a>
            )}

            {onOpenTour && (
              <button
                onClick={onOpenTour}
                className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-slate-200 hover:text-white hover:bg-white/8 transition-colors"
                title="How Tandem works"
                aria-label="How Tandem works"
              >
                <BookOpen className="w-4 h-4" />
              </button>
            )}

            {account ? (
              <button
                onClick={onOpenAccountModal}
                className="inline-flex h-9 max-w-[16rem] items-center gap-2 pl-2 pr-3 rounded-sm ring-1 ring-inset ring-white/20 hover:ring-white/40 transition-colors"
                title={`${account.bank.name} · manage payment methods`}
              >
                <Landmark className="w-4 h-4 text-slate-300 shrink-0" aria-hidden="true" />
                <span className="hidden sm:block truncate text-sm font-medium">
                  {account.displayName}
                  <span className="text-slate-300 font-normal"> · {account.bank.name}</span>
                </span>
                <span className="sm:hidden text-sm font-medium">Account</span>
              </button>
            ) : (
              <button
                onClick={onOpenAccountModal}
                className="inline-flex h-9 items-center gap-2 px-3.5 rounded-sm bg-white text-ink text-sm font-semibold hover:bg-slate-100 transition-colors"
              >
                <Landmark className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">Link bank account</span>
                <span className="sm:hidden">Link bank</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <nav aria-label="Main" className="lg:hidden border-t border-white/10">
        <div className="max-w-7xl mx-auto px-1 sm:px-4 flex overflow-x-auto [scrollbar-width:none] [mask-image:linear-gradient(to_right,#000_calc(100%-40px),transparent)] pr-8">
          {NAV_TABS.map((t) => tab(t, true))}
        </div>
      </nav>
    </header>
  );
};
