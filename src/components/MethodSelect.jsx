import { FUNDING_KINDS } from '../data/fundingMethods';
import { KIND_ORDER } from './BankAccountModal';

const LINK = '__link__';

const describe = (b, currency) => {
  const ref =
    b.details.accountNumber ??
    b.details.iban ??
    b.details.cbu ??
    b.details.phone ??
    (b.details.cardLast4 ? `•••• ${b.details.cardLast4}` : (b.details.city ?? ''));
  return `${b.name}${ref ? ` ${ref}` : ''} (${currency} ${b.available.toFixed(2)})`;
};

/** Dropdown of the account's linked payment methods, plus "Link another…". */
export const MethodSelect = ({ label, account, value, onChange, onLinkAnother, hint }) => {
  const methods = account?.banks ?? [];
  return (
    <label className="block min-w-0">
      <span className="label">{label}</span>
      <select
        value={value ?? ''}
        onChange={(e) => (e.target.value === LINK ? onLinkAnother() : onChange(Number(e.target.value)))}
        className="field mt-1.5 !text-sm"
      >
        {methods.length === 0 && <option value="">No payment methods linked yet</option>}
        {KIND_ORDER.map((k) => {
          const ofKind = methods.filter((b) => b.kind === k);
          if (!ofKind.length) return null;
          return (
            <optgroup key={k} label={FUNDING_KINDS[k].label}>
              {ofKind.map((b) => (
                <option key={b.id} value={b.id}>
                  {describe(b, account.currency)}
                </option>
              ))}
            </optgroup>
          );
        })}
        <option value={LINK}>{methods.length ? 'Link another payment method…' : 'Link a payment method…'}</option>
      </select>
      {hint && <span className="block mt-1 text-sm text-slate-600">{hint}</span>}
    </label>
  );
};
