import React from 'react';
import type { AccountView } from '../types';
import { FUNDING_KINDS } from '../data/fundingMethods';
import { KIND_ORDER } from './BankAccountModal';

const LINK = '__link__';

interface Props {
  label: string;
  account: AccountView | null;
  value: number | null;
  onChange: (id: number) => void;
  /** "Link another…" opens the account panel, where all linking happens. */
  onLinkAnother: () => void;
  hint?: string;
}

const describe = (b: AccountView['banks'][number], currency: string) => {
  const ref = b.details.accountNumber ?? b.details.iban ?? b.details.cbu ?? b.details.phone ?? (b.details.cardLast4 ? `•••• ${b.details.cardLast4}` : b.details.city ?? '');
  return `${b.name}${ref ? ` ${ref}` : ''} · ${currency} ${b.available.toFixed(2)} available`;
};

/** Dropdown of the account's linked payment methods, plus "Link another…". */
export const MethodSelect: React.FC<Props> = ({ label, account, value, onChange, onLinkAnother, hint }) => {
  const methods = account?.banks ?? [];
  return (
    <div>
      <label className="text-[11px] text-slate-500 block mb-1">{label}</label>
      <select
        value={value ?? ''}
        onChange={(e) => (e.target.value === LINK ? onLinkAnother() : onChange(Number(e.target.value)))}
        className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white focus:outline-none"
      >
        {methods.length === 0 && <option value="">No payment methods linked yet</option>}
        {KIND_ORDER.map((k) => {
          const ofKind = methods.filter((b) => b.kind === k);
          if (!ofKind.length) return null;
          return (
            <optgroup key={k} label={FUNDING_KINDS[k].label}>
              {ofKind.map((b) => (
                <option key={b.id} value={b.id}>
                  {describe(b, account!.currency)}
                </option>
              ))}
            </optgroup>
          );
        })}
        <option value={LINK}>{methods.length ? '+ Link another…' : '+ Link a payment method…'}</option>
      </select>
      {hint && <span className="text-[10px] text-slate-400 block mt-1">{hint}</span>}
    </div>
  );
};
