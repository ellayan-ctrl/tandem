import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, Building2, ChevronDown, CreditCard, ExternalLink, Landmark, Plus, Smartphone, X, Zap } from 'lucide-react';
import type { AccountView, BankView } from '../types';
import type { LinkBankInput } from '../services/api';
import {
  CURRENCY_BY_COUNTRY,
  FUNDING_KINDS,
  FUNDING_PROVIDERS,
  findFundingProvider,
  type FundingKind,
} from '../data/fundingMethods';

export const KIND_ICON: Record<FundingKind, React.ElementType> = {
  bank_account: Building2,
  debit_card: CreditCard,
  instant_transfer: Zap,
  mobile_money: Smartphone,
  cash_deposit: Banknote,
};
export const KIND_ORDER: FundingKind[] = ['bank_account', 'debit_card', 'instant_transfer', 'mobile_money', 'cash_deposit'];

/** What the sandbox balance means for each kind of payment method. */
export const BALANCE_LABEL: Record<FundingKind, string> = {
  bank_account: 'Bank balance',
  debit_card: 'Linked account balance',
  instant_transfer: 'Account balance',
  mobile_money: 'Wallet balance',
  cash_deposit: 'Cash deposited',
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  account: AccountView | null;
  onLink: (input: LinkBankInput) => Promise<void>;
  onAddBank: (input: { bankProviderId: string; bankDetails: Record<string, string>; startingBalance: number }) => Promise<void>;
  onUnlink: () => void;
  onSandboxDeposit: (bankId: number, amount: number) => Promise<void>;
  /** Open straight to the "add" form (from the Send tab), optionally for one kind. */
  startAdding?: boolean;
  startKind?: FundingKind | null;
}

const COUNTRIES = Object.keys(FUNDING_PROVIDERS);
const money = (currency: string, v: number) =>
  `${currency} ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const input =
  'w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white focus:outline-none';

/** Kind tabs + provider + fields for one payment method in `country`. */
const MethodFields: React.FC<{
  country: string;
  kind: FundingKind;
  setKind: (k: FundingKind) => void;
  providerId: string;
  setProviderId: (id: string) => void;
  details: Record<string, string>;
  setDetails: (d: Record<string, string>) => void;
  startingBalance: string;
  setStartingBalance: (v: string) => void;
}> = ({ country, kind, setKind, providerId, setProviderId, details, setDetails, startingBalance, setStartingBalance }) => {
  const all = FUNDING_PROVIDERS[country] ?? [];
  const kinds = KIND_ORDER.filter((k) => all.some((p) => p.kind === k));
  const providers = all.filter((p) => p.kind === kind);
  const provider = findFundingProvider(country, providerId);
  return (
    <>
      <div className="sm:col-span-2 grid grid-cols-2 sm:grid-cols-5 gap-1">
        {kinds.map((k) => {
          const Icon = KIND_ICON[k];
          return (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`flex items-center justify-center gap-1 px-1.5 py-1.5 rounded-md border text-[10px] font-medium ${
                kind === k
                  ? 'border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
              }`}
            >
              <Icon className="w-3 h-3 shrink-0" />
              {FUNDING_KINDS[k].label}
            </button>
          );
        })}
      </div>
      <div className="sm:col-span-2">
        <label className="text-[11px] text-slate-500 block mb-1">{FUNDING_KINDS[kind].label}</label>
        <select className={input} value={providerId} onChange={(e) => setProviderId(e.target.value)}>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {provider?.fields
        .filter((f) => f.key !== 'payerName')
        .map((f) => (
          <div key={f.key}>
            <label className="text-[11px] text-slate-500 block mb-1">{f.label}</label>
            <input
              className={`${input} ${f.sensitive ? 'font-mono' : ''}`}
              placeholder={f.placeholder}
              value={details[f.key] ?? ''}
              onChange={(e) => setDetails({ ...details, [f.key]: e.target.value })}
              required
            />
          </div>
        ))}
      <div>
        <label className="text-[11px] text-slate-500 block mb-1">
          Sandbox {BALANCE_LABEL[kind].toLowerCase()} ({CURRENCY_BY_COUNTRY[country] ?? 'USD'})
        </label>
        <input className={`${input} font-mono-numbers`} type="number" min="0" value={startingBalance} onChange={(e) => setStartingBalance(e.target.value)} />
      </div>
    </>
  );
};

/** Linked payment methods (sandbox) and balances. The Stellar wallet stays behind the scenes. */
export const BankAccountModal: React.FC<Props> = ({
  isOpen,
  onClose,
  account,
  onLink,
  onAddBank,
  onUnlink,
  onSandboxDeposit,
  startAdding,
  startKind,
}) => {
  const [country, setCountry] = useState('Canada');
  const formCountry = account?.country ?? country;
  const [kind, setKind] = useState<FundingKind>('bank_account');
  const firstProviderId = useMemo(
    () => (FUNDING_PROVIDERS[formCountry] ?? []).find((p) => p.kind === kind)?.id ?? '',
    [formCountry, kind],
  );
  const [providerId, setProviderId] = useState(firstProviderId);
  const [details, setDetails] = useState<Record<string, string>>({});
  const [displayName, setDisplayName] = useState('');
  const [startingBalance, setStartingBalance] = useState('2000');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWallet, setShowWallet] = useState(false);

  useEffect(() => {
    setProviderId(firstProviderId);
    setDetails({});
  }, [firstProviderId]);

  useEffect(() => {
    if (isOpen) {
      setAdding(!!startAdding);
      if (startKind) setKind(startKind);
      setError(null);
    }
  }, [isOpen, startAdding, startKind]);

  if (!isOpen) return null;

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
      setAdding(false);
      setDetails({});
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const payerName = account?.displayName ?? displayName;
  const methodDetails = { ...details, payerName: details.payerName || payerName };
  const fieldsProps = { kind, setKind, providerId, setProviderId, details, setDetails, startingBalance, setStartingBalance };

  const methodCard = (b: BankView) => {
    const Icon = KIND_ICON[b.kind] ?? Building2;
    return (
      <div key={b.id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2">
        <div className="flex items-start gap-2.5">
          <Icon className="w-4 h-4 text-slate-500 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-slate-900 dark:text-white">{b.name}</div>
            <div className="text-[10px] text-slate-400">
              {b.kindLabel}
              {Object.entries(b.details)
                .filter(([k]) => k !== 'payerName' && k !== 'bankName')
                .map(([, v]) => ` · ${v}`)
                .join('')}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5 font-mono-numbers">
          {[[BALANCE_LABEL[b.kind] ?? 'Balance', b.balance], ['Reserved', b.held], ['Available', b.available]].map(([label, v]) => (
            <div key={label as string} className="p-1.5 rounded bg-slate-50 dark:bg-slate-800/40">
              <span className="text-[10px] text-slate-500 block font-sans">{label}</span>
              <span className="font-semibold text-slate-900 dark:text-white">{money(account!.currency, v as number)}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-500">Sandbox:</span>
          {[500, 2000].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onSandboxDeposit(b.id, v)}
              className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 font-mono-numbers text-[10px]"
            >
              + {v.toLocaleString()}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-lg w-full my-6 overflow-hidden text-xs">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-900/5 dark:bg-white/10 flex items-center justify-center">
              <Landmark className="w-4 h-4 text-slate-700 dark:text-slate-200" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Your Account</h3>
              <p className="text-[11px] text-slate-500">Sandbox · nothing real is connected; balances are simulated</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded text-slate-400 hover:text-slate-600" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!account ? (
          <form
            onSubmit={(e) => (
              e.preventDefault(),
              run(() => onLink({ displayName, country, bankProviderId: providerId, bankDetails: methodDetails, startingBalance: Number(startingBalance) || 0 }))
            )}
            className="p-4 space-y-3"
          >
            <p className="text-slate-600 dark:text-slate-300">
              Link the first way you&apos;ll pay (a bank account, debit card, mobile money, or cash at an agent). Your
              money stays where it is until a transfer settles; only the part that has to cross borders is converted to
              USDC, at that moment. You can add more later.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="sm:col-span-2">
                <label className="text-[11px] text-slate-500 block mb-1">Your full name</label>
                <input className={input} value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[11px] text-slate-500 block mb-1">Country you send from</label>
                <select className={input} value={country} onChange={(e) => setCountry(e.target.value)}>
                  {COUNTRIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <MethodFields country={country} {...fieldsProps} />
            </div>
            {error && <div className="text-rose-600 bg-rose-50 dark:bg-rose-950/40 p-2 rounded border border-rose-200 dark:border-rose-900">{error}</div>}
            <button type="submit" disabled={busy} className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 disabled:bg-slate-300 text-white font-semibold rounded-md">
              {busy ? 'Linking… (setting up your account, ~10 seconds)' : `Link ${FUNDING_KINDS[kind].label.toLowerCase()}`}
            </button>
          </form>
        ) : (
          <div className="p-4 space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold text-slate-900 dark:text-white">
                {account.displayName} · {account.country}
              </span>
              <span className="text-[11px] text-slate-500">
                Total available{' '}
                <strong className="font-mono-numbers text-slate-900 dark:text-white">{money(account.currency, account.available)}</strong>
              </span>
            </div>

            {KIND_ORDER.map((k) => {
              const items = account.banks.filter((b) => b.kind === k);
              if (!items.length) return null;
              return (
                <div key={k} className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{FUNDING_KINDS[k].label}</span>
                  {items.map(methodCard)}
                </div>
              );
            })}

            <p className="text-[11px] text-slate-500">
              Reserved amounts are not charged. When a transfer settles, the matched part is paid from the method you
              chose for it, and only the unmatched part is taken from its source, converted to USDC, and sent via Stellar
              Blockchain.
            </p>

            {!adding ? (
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Link more</span>
                <div className="flex gap-1.5 overflow-x-auto pb-1 snap-x">
                  {KIND_ORDER.filter((k) => (FUNDING_PROVIDERS[account.country] ?? []).some((p) => p.kind === k)).map((k) => {
                    const Icon = KIND_ICON[k];
                    const count = account.banks.filter((b) => b.kind === k).length;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => {
                          setKind(k);
                          setAdding(true);
                        }}
                        className="snap-start shrink-0 w-28 p-2.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 hover:border-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 text-left"
                      >
                        <Icon className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                        <span className="block text-[11px] font-semibold text-slate-900 dark:text-white mt-1.5 leading-tight">
                          {FUNDING_KINDS[k].label}
                        </span>
                        <span className="flex items-center gap-0.5 text-[10px] text-slate-500 mt-0.5">
                          <Plus className="w-3 h-3" /> {count ? `Link another (${count})` : 'Link'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <form
                onSubmit={(e) => (
                  e.preventDefault(),
                  run(() => onAddBank({ bankProviderId: providerId, bankDetails: methodDetails, startingBalance: Number(startingBalance) || 0 }))
                )}
                className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-2.5"
              >
                <span className="font-semibold text-slate-900 dark:text-white block">Add a payment method in {account.country}</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <MethodFields country={account.country} {...fieldsProps} />
                </div>
                {error && <div className="text-rose-600 bg-rose-50 dark:bg-rose-950/40 p-2 rounded border border-rose-200 dark:border-rose-900">{error}</div>}
                <div className="flex gap-2">
                  <button type="submit" disabled={busy} className="flex-1 py-2 bg-slate-900 dark:bg-white dark:text-slate-900 text-white font-semibold rounded-md disabled:bg-slate-300">
                    {busy ? 'Linking…' : `Link ${FUNDING_KINDS[kind].label.toLowerCase()}`}
                  </button>
                  <button type="button" onClick={() => setAdding(false)} className="px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md">
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <div className="border-t border-slate-100 dark:border-slate-800 pt-2">
              <button type="button" onClick={() => setShowWallet(!showWallet)} className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800">
                <ChevronDown className={`w-3 h-3 transition-transform ${showWallet ? 'rotate-180' : ''}`} />
                Behind the scenes
              </button>
              {showWallet && (
                <div className="mt-2 p-2.5 rounded bg-slate-50 dark:bg-slate-800/40 text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
                  <p>
                    TwoWay created one Stellar wallet for you. You never manage it: it holds nothing until a
                    transfer&apos;s window closes, then receives exactly the unmatched amount in USDC and pays it to the
                    recipient through the settlement contract.
                  </p>
                  <a
                    href={`https://stellar.expert/explorer/testnet/account/${account.wallet.publicKey}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[10px] text-slate-900 dark:text-white hover:underline inline-flex items-center gap-1 break-all"
                  >
                    {account.wallet.publicKey}
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                </div>
              )}
            </div>

            <button type="button" onClick={onUnlink} className="w-full py-2 border border-slate-300 dark:border-slate-700 rounded-md text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
              Sign out on this device
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
