import { useEffect, useState } from 'react';
import { ArrowLeftRight, ArrowRight } from 'lucide-react';

import { MOBILE_CASHOUT_PCT, OFFRAMP_PCT, ONRAMP_PCT } from '../data/costModel';
import { domesticRate } from '../data/domesticFees';
import { domesticFee, overseasFee } from '../data/feeSheet';
import { sheetRow } from '../data/sheets';
import { api } from '../services/api';
import { FX_RATES } from '../services/bankingService';
import { isValidStellarPublicKey } from '../services/stellarTestnet';
import { MethodSelect } from './MethodSelect';
import { RouteStrip, Station, usd } from './Route';
import { SavingsComparison } from './SavingsComparison';

/** Longest and shortest matching windows the server accepts (7 days, 15 seconds). */
const MAX_WINDOW_MINUTES = 7 * 24 * 60;
const MIN_WINDOW_MINUTES = 0.25;
const WINDOW_PRESETS = [
  { label: '15 s', minutes: 0.25 },
  { label: '30 s', minutes: 0.5 },
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '6 hours', minutes: 360 },
  { label: '24 hours', minutes: 1440 },
];
/** Cost of the unmatched part: on-ramp to USDC, off-ramp, recipient cash-out (src/data/costModel.js). */
const CROSS_PCT = ONRAMP_PCT + OFFRAMP_PCT + MOBILE_CASHOUT_PCT;

/** 0.5 -> "30 s", 45 -> "45 min", 90 -> "1 h 30 min", 2160 -> "1 day 12 h" */
const formatWindow = (minutes) => {
  const total = Math.round(minutes * 60);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts = [d && `${d} day${d > 1 ? 's' : ''}`, h && `${h} h`, m && `${m} min`, s && `${s} s`].filter(Boolean);
  return parts.join(' ') || '0 min';
};
/** Clock time a window opened now would close: "21:11", "21:11:30" under a minute, "Sun 21:11" past a day. */
const departs = (minutes, now) => {
  const d = new Date(now + minutes * 60 * 1000);
  const t = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  if (minutes < 1) return d.toLocaleTimeString([], { ...t, second: '2-digit' });
  if (minutes >= 1440) return `${d.toLocaleDateString([], { weekday: 'short' })} ${d.toLocaleTimeString([], t)}`;
  return d.toLocaleTimeString([], t);
};
const localMoney = (currency, v) => `${currency} ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const OPEN = ['open', 'partially_matched'];

export const SendTransferForm = ({ corridors, account, orders = [], onLinkBank, onOrderCreated, onNavigateToDashboard }) => {
  const [selectedCorridorId, setSelectedCorridorId] = useState('CA-KE');
  const [directionReversed, setDirectionReversed] = useState(false);
  const [amount, setAmount] = useState('10');
  const [recipientName, setRecipientName] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  // Match first (timed pool) vs send now (everything crosses on Stellar immediately).
  const [transferMode, setTransferMode] = useState('matched_pool');
  // Matching window length in minutes (15 s .. 7 days, the server's limit; 0.5 = 30 seconds).
  const [windowMinutes, setWindowMinutes] = useState(60);
  const [windowInput, setWindowInput] = useState('60');
  useEffect(() => setWindowInput(String(+windowMinutes.toFixed(2))), [windowMinutes]);
  // Clock for the departure times; ticks so "departs 21:11" stays true while the form is open.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  // Unmatched remainder always settles in USDC on Soroban.
  const remainderPolicy = 'direct_stellar_fallback';
  // Linked method that pays the matched part, and (optionally) a different one for the unmatched part.
  const [bankId, setBankId] = useState(null);
  const [remainderBankId, setRemainderBankId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedOrder, setSubmittedOrder] = useState(null);
  const [formError, setFormError] = useState(null);

  const activeCorridor = corridors.find((c) => c.id === selectedCorridorId) || corridors[0];
  const fromCountry = directionReversed ? activeCorridor.countryB : activeCorridor.countryA;
  const toCountry = directionReversed ? activeCorridor.countryA : activeCorridor.countryB;
  const isMatching = transferMode === 'matched_pool';

  // Amount is entered in USD; the bank is charged in the sender's local currency.
  const fxRate = FX_RATES[fromCountry.currency]?.rate ?? 1;
  const parsedAmount = parseFloat(amount) || 0;
  const localNeeded = parsedAmount * fxRate;

  // Send from the linked bank's country when the corridor includes it.
  useEffect(() => {
    if (!account) return;
    if (activeCorridor.countryA.name === account.country) setDirectionReversed(false);
    else if (activeCorridor.countryB.name === account.country) setDirectionReversed(true);
  }, [account?.country, selectedCorridorId]);

  // Both dropdowns default to the first linked method (and re-pick if a selection disappears).
  useEffect(() => {
    if (!account) return;
    const first = account.banks[0]?.id ?? null;
    if (!account.banks.some((b) => b.id === bankId)) setBankId(first);
    if (!account.banks.some((b) => b.id === remainderBankId)) setRemainderBankId(first);
  }, [account?.banks.map((b) => b.id).join(',')]);

  /** Pays the matched part. */
  const payBank = account?.banks.find((b) => b.id === bankId);
  /** Funds the unmatched part (converted to USDC), or everything when sending now. */
  const remainderBank = account?.banks.find((b) => b.id === remainderBankId);
  const effectiveMinutes = isMatching ? windowMinutes : 0;
  const departureTime = departs(effectiveMinutes, now);

  // What is waiting to go the other way on this corridor right now (oldest orders fill first, so
  // same-direction orders already queued are ahead of this one).
  const openVolume = (from, to) =>
    orders
      .filter((o) => o.fromCountry === from && o.toCountry === to && OPEN.includes(o.status) && o.transferType !== 'direct_instant')
      .reduce((s, o) => s + (o.remainingAmount ?? 0), 0);
  const oppositeWaiting = openVolume(toCountry.name, fromCountry.name);
  const aheadOfYou = openVolume(fromCountry.name, toCountry.name);
  const matchNow = isMatching ? Math.min(parsedAmount, Math.max(0, oppositeWaiting - aheadOfYou)) : 0;
  const crossIfUnmatched = Math.max(0, parsedAmount - matchNow);

  // Fees, in USD, for the split above.
  const feeRow = sheetRow(fromCountry.name, toCountry.name);
  const matchedFee =
    matchNow <= 0
      ? 0
      : payBank
        ? domesticRate(fromCountry.name, payBank.providerId, fromCountry.currency).maxFee(matchNow * fxRate) / fxRate
        : feeRow
          ? domesticFee(feeRow, matchNow * fxRate).high / fxRate
          : null;
  const crossFee = (crossIfUnmatched * CROSS_PCT) / 100;
  const totalFee = (matchedFee ?? 0) + crossFee;
  const overseasCost = feeRow && parsedAmount > 0 ? overseasFee(feeRow, localNeeded) / fxRate : null;

  // "Use testnet demo address": the sandbox account in the destination country (it holds a USDC trustline).
  const [demoAddressLoading, setDemoAddressLoading] = useState(false);
  const fillDemoAddress = async () => {
    setDemoAddressLoading(true);
    try {
      const r = await api.demoRecipient(toCountry.name);
      setRecipientAddress(r.address);
      if (!recipientName.trim()) setRecipientName(r.name);
    } catch (e) {
      setFormError(`Could not get a demo address: ${e.message}`);
    } finally {
      setDemoAddressLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    if (parsedAmount <= 0) return;
    if (!account) {
      onLinkBank();
      setFormError('Link a bank account first. It only takes a moment and nothing real is connected.');
      return;
    }
    if (fromCountry.name !== account.country) {
      setFormError(`Your bank is in ${account.country}. Pick a route that starts in ${account.country}, or use the swap button.`);
      return;
    }
    if (localNeeded > account.available + 0.005) {
      setFormError(
        `Not enough in your account: ${localMoney(account.currency, account.available)} available, ${localMoney(account.currency, localNeeded)} needed.`,
      );
      return;
    }
    const cleanRecipient = recipientAddress.trim();
    if (!isValidStellarPublicKey(cleanRecipient)) {
      setFormError('That recipient address is not valid. It should be 56 characters and start with G.');
      return;
    }
    if (!remainderBank || (isMatching && !payBank)) {
      setFormError('Choose which linked account to pay from, or link one first.');
      return;
    }
    for (const b of new Set(isMatching ? [payBank, remainderBank] : [remainderBank])) {
      if (b && localNeeded > b.available + 0.005) {
        setFormError(`Not enough in ${b.name}: ${localMoney(account.currency, b.available)} available, ${localMoney(account.currency, localNeeded)} needed.`);
        return;
      }
    }

    setIsSubmitting(true);
    const isInstant = !isMatching;
    const newOrder = {
      id: `ORD-${Date.now().toString().slice(-6)}`,
      senderName: 'You',
      senderAddress: account.wallet.publicKey,
      recipientName: recipientName.trim() || 'Recipient',
      recipientAddress: cleanRecipient,
      fromCountry: fromCountry.name,
      toCountry: toCountry.name,
      fromFlag: fromCountry.flag,
      toFlag: toCountry.flag,
      amount: parsedAmount,
      matchedAmount: isInstant ? parsedAmount : 0,
      remainingAmount: isInstant ? 0 : parsedAmount,
      status: isInstant ? 'settled' : 'open',
      createdAt: Date.now(),
      deadlineMinutes: effectiveMinutes,
      deadlineTimestamp: isInstant ? Date.now() : Date.now() + effectiveMinutes * 60 * 1000,
      remainderPolicy,
      transferType: transferMode,
      bankId: isInstant ? remainderBank?.id : payBank?.id,
      remainderBankId: remainderBank?.id,
      matchHistory: [],
      escrowContractId: '',
      depositTxHash: '',
      notes: isInstant ? `Direct transfer to ${toCountry.name}` : `Transfer ${fromCountry.name} to ${toCountry.name} (${effectiveMinutes}m window)`,
    };
    let saved;
    try {
      saved = await onOrderCreated(newOrder);
    } catch (err) {
      setFormError(err.message || 'Could not place the transfer.');
      setIsSubmitting(false);
      return;
    }
    setSubmittedOrder(saved);
    setIsSubmitting(false);
    setTimeout(() => onNavigateToDashboard(), 400);
  };

  // From/To pickers: every country in a pair, and the countries paired with the sender's.
  const pickFrom = (name) => {
    const c = corridors.find((p) => p.countryA.name === name || p.countryB.name === name);
    if (!c) return;
    const keepTo = corridors.find(
      (p) => (p.countryA.name === name && p.countryB.name === toCountry.name) || (p.countryB.name === name && p.countryA.name === toCountry.name),
    );
    const next = keepTo ?? c;
    setSelectedCorridorId(next.id);
    setDirectionReversed(next.countryB.name === name);
  };
  const pickTo = (name) => {
    const c = corridors.find(
      (p) => (p.countryA.name === fromCountry.name && p.countryB.name === name) || (p.countryB.name === fromCountry.name && p.countryA.name === name),
    );
    if (!c) return;
    setSelectedCorridorId(c.id);
    setDirectionReversed(c.countryB.name === fromCountry.name);
  };
  const allCountries = [...new Set(corridors.flatMap((c) => [c.countryA.name, c.countryB.name]))];
  const partners = corridors.flatMap((c) =>
    c.countryA.name === fromCountry.name ? [c.countryB.name] : c.countryB.name === fromCountry.name ? [c.countryA.name] : [],
  );
  const stationSelect = 'chevron bg-transparent font-semibold text-lg leading-tight cursor-pointer rounded-xs hover:text-cross';

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16">
      <div className="mb-5 max-w-2xl">
        <h1 className="text-[30px] leading-tight font-semibold tracking-[-0.01em]">Send money</h1>
        <p className="mt-1 text-slate-600 text-base">Matched money is paid locally on both sides. Only what&apos;s left crosses the border.</p>
      </div>

      {submittedOrder && (
        <div role="status" className="mb-6 panel px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">
              {submittedOrder.transferType === 'direct_instant' ? 'Transfer sent' : 'Transfer placed, looking for a match'}
            </p>
            <p className="text-sm text-slate-600">
              {usd(submittedOrder.amount)} to {submittedOrder.recipientName} in {submittedOrder.toCountry} · {submittedOrder.id}
            </p>
          </div>
          <button onClick={onNavigateToDashboard} className="text-sm font-semibold underline hover:no-underline">
            View in Live orders
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid lg:grid-cols-[minmax(0,1fr)_400px] gap-6 lg:gap-8 items-start">
        <div className="space-y-4 min-w-0">
          {/* Match first vs send now: the same ink-selected grammar as the departures row */}
          <div data-tour="transfer-mode" role="radiogroup" aria-label="How to send" className="grid grid-cols-2 bg-white ring-1 ring-inset ring-slate-300 rounded-sm overflow-hidden">
            {[
              ['matched_pool', 'Match first', 'Cheaper. Waits for a match until it departs.'],
              ['direct_instant', 'Send now', 'Everything crosses on Stellar right away.'],
            ].map(([id, title, note], i) => {
              const on = transferMode === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setTransferMode(id)}
                  className={`text-left px-4 py-2 transition-colors ${i === 0 ? 'border-r border-slate-300' : ''} ${
                    on ? 'shadow-[inset_0_-3px_0_var(--color-ink)]' : 'text-slate-600 hover:bg-slate-50 hover:text-ink'
                  }`}
                >
                  <span className="block font-semibold">{title}</span>
                  <span className="block text-sm text-slate-600">{note}</span>
                </button>
              );
            })}
          </div>

          {/* Route (the station pair is the picker) and amount */}
          <section data-tour="corridor-route" className="panel" aria-label="Route and amount">
            <div className="flex flex-col sm:grid sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center gap-3 px-5 py-3.5">
              <div className="min-w-0">
                <span className="label">From</span>
                <div className="mt-1.5 flex items-center gap-2.5">
                  <Station country={fromCountry.name} size="lg" />
                  <div className="min-w-0">
                    <select aria-label="Send from" value={fromCountry.name} onChange={(e) => pickFrom(e.target.value)} className={`${stationSelect} max-w-full`}>
                      {allCountries.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                    <div className="text-sm text-slate-600">Pays in {fromCountry.currency}</div>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDirectionReversed(!directionReversed)}
                className="self-start sm:self-center w-10 h-10 inline-flex items-center justify-center rounded-sm ring-1 ring-inset ring-slate-300 hover:ring-ink hover:bg-slate-50 transition-colors max-sm:rotate-90"
                title="Swap direction"
                aria-label={`Swap direction: send from ${toCountry.name} to ${fromCountry.name} instead`}
              >
                <ArrowLeftRight className="w-4 h-4" />
              </button>
              <div className="min-w-0 sm:text-right">
                <span className="label">To</span>
                <div className="mt-1.5 flex items-center sm:justify-end gap-2.5 max-sm:flex-row-reverse max-sm:justify-end">
                  <div className="min-w-0">
                    <select aria-label="Send to" value={toCountry.name} onChange={(e) => pickTo(e.target.value)} className={`${stationSelect} max-w-full sm:text-right`}>
                      {partners.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                    <div className="text-sm text-slate-600">Received in {toCountry.currency}</div>
                  </div>
                  <Station country={toCountry.name} size="lg" />
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 px-5 pt-3.5 pb-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <label htmlFor="amount" className="label">
                  You send
                </label>
                <span className="text-sm text-slate-600">
                  {account ? (
                    <>
                      Available{payBank ? ` in ${payBank.name}` : ''}:{' '}
                      <strong className="font-semibold text-ink">{localMoney(account.currency, payBank?.available ?? account.available)}</strong>
                    </>
                  ) : (
                    <button type="button" onClick={() => onLinkBank()} className="underline font-medium text-ink">
                      Link a payment method
                    </button>
                  )}
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-3 border-b-2 border-ink focus-within:border-cross transition-colors">
                <span className="text-3xl font-semibold text-slate-500" aria-hidden="true">
                  $
                </span>
                <input
                  id="amount"
                  type="number"
                  min="1"
                  step="any"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="no-spin flex-1 min-w-0 bg-transparent py-0.5 text-[40px] leading-none font-semibold tracking-[-0.02em] focus:outline-none"
                  required
                />
                <span className="text-right leading-tight">
                  <span className="block font-[family-name:var(--font-label)] font-semibold tracking-wider text-slate-500">USD</span>
                  {fromCountry.currency !== 'USD' && localNeeded > 0 && (
                    <span className="block text-sm text-slate-600 whitespace-nowrap">≈ {localMoney(fromCountry.currency, localNeeded)}</span>
                  )}
                </span>
              </div>
            </div>
          </section>

          {/* Who pays, and who receives */}
          <section data-tour="payout-method" className="panel px-5 py-3.5 space-y-3" aria-labelledby="pay-h">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="pay-h" className="text-lg font-semibold">
                Payment and recipient
              </h2>
              <button
                type="button"
                onClick={fillDemoAddress}
                disabled={demoAddressLoading}
                className="text-sm font-medium text-cross hover:underline disabled:opacity-60"
                title={`Fill in the sandbox account in ${toCountry.name}; it can receive test USDC`}
              >
                {demoAddressLoading ? 'Preparing address…' : 'Use a testnet demo recipient'}
              </button>
            </div>
            <div className={`grid gap-4 ${isMatching ? 'sm:grid-cols-2' : ''}`}>
              {isMatching && (
                <MethodSelect
                  label="Matched part from"
                  account={account}
                  value={payBank?.id ?? null}
                  onChange={setBankId}
                  onLinkAnother={() => onLinkBank()}
                  hint={`Charged in ${fromCountry.currency} only when it matches.`}
                />
              )}
              <MethodSelect
                label={isMatching ? 'Anything unmatched from' : 'Pay from'}
                account={account}
                value={remainderBank?.id ?? null}
                onChange={setRemainderBankId}
                onLinkAnother={() => onLinkBank()}
                hint={isMatching ? `Sent as USDC at ${departureTime}.` : 'Sent as USDC on Stellar now.'}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <label className="block">
                <span className="label">Recipient in {toCountry.name}</span>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="Full name"
                  autoComplete="off"
                  className="field mt-1.5"
                  required
                />
              </label>
              <label className="block">
                <span className="label">Their Stellar address</span>
                <input
                  type="text"
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                  placeholder="G…"
                  spellCheck={false}
                  autoComplete="off"
                  className="field mt-1.5 !font-mono !text-sm"
                  required
                />
              </label>
            </div>
          </section>

          {/* Departure: the matching window as a timetable row */}
          {isMatching && (
            <section data-tour="matching-window" className="panel px-5 py-3.5 space-y-3" aria-labelledby="dep-h">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="dep-h" className="text-lg font-semibold">
                  Departs in
                </h2>
                <span className="text-sm text-slate-600">
                  {formatWindow(windowMinutes)} · at <strong className="font-semibold text-ink">{departureTime}</strong>
                </span>
              </div>
              <div role="radiogroup" aria-label="Matching window" className="grid grid-cols-4 sm:grid-cols-7 border border-slate-300 rounded-sm overflow-hidden">
                {WINDOW_PRESETS.map((p) => {
                  const on = windowMinutes === p.minutes;
                  return (
                    <button
                      key={p.minutes}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setWindowMinutes(p.minutes)}
                      className={`px-2.5 py-2 text-left border-slate-300 [&:not(:last-child)]:border-r max-sm:[&:nth-child(4)]:border-r-0 max-sm:[&:nth-child(n+5)]:border-t transition-colors ${
                        on ? 'bg-ink text-white' : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <span className="block font-semibold">{p.label}</span>
                      <span className={`block text-[13px] ${on ? 'text-slate-300' : 'text-slate-500'}`}>{departs(p.minutes, now)}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <p className="text-sm text-slate-600">A longer wait gives more time for a match, so more of your money stays local.</p>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  Or exactly
                  <input
                    type="number"
                    min={MIN_WINDOW_MINUTES}
                    max={MAX_WINDOW_MINUTES}
                    step="0.25"
                    value={windowInput}
                    aria-label="Matching window in minutes"
                    onChange={(e) => {
                      // Minutes, decimals allowed (0.5 = 30 seconds). Clamped on blur so typing "0.5" works.
                      setWindowInput(e.target.value);
                      const v = parseFloat(e.target.value);
                      if (Number.isFinite(v) && v >= MIN_WINDOW_MINUTES && v <= MAX_WINDOW_MINUTES) setWindowMinutes(Math.round(v * 60) / 60);
                    }}
                    onBlur={() => {
                      const v = parseFloat(windowInput);
                      const clamped = Number.isFinite(v) ? Math.min(MAX_WINDOW_MINUTES, Math.max(MIN_WINDOW_MINUTES, v)) : windowMinutes;
                      setWindowMinutes(Math.round(clamped * 60) / 60);
                      setWindowInput(String(+(Math.round(clamped * 60) / 60).toFixed(2)));
                    }}
                    className="field !w-24 !py-1.5 !text-sm"
                  />
                  min
                </label>
              </div>
            </section>
          )}

          {/* Rate comparison, its own panel (sources live behind its disclosure) */}
          {isMatching && payBank && account?.country === fromCountry.name && (
            <SavingsComparison from={fromCountry} to={toCountry} localAmount={localNeeded} method={payBank} />
          )}
        </div>

        {/* The route panel: live split, fees, the one irreversible action */}
        <aside className="panel lg:sticky lg:top-[84px]" aria-labelledby="sum-h">
          <div className="px-5 pt-4 pb-5">
            <h2 id="sum-h" className="text-lg font-semibold">
              Your route
            </h2>
            <div className="mt-4 flex items-center justify-between text-sm font-semibold">
              <span className="flex items-center gap-2">
                <Station country={fromCountry.name} size="sm" /> {fromCountry.name}
              </span>
              <span className="flex items-center gap-2">
                {toCountry.name} <Station country={toCountry.name} size="sm" />
              </span>
            </div>
            <RouteStrip from={fromCountry.name} to={toCountry.name} local={matchNow} cross={crossIfUnmatched} height="lg" className="mt-2" />

            <div className="mt-5 grid grid-cols-2 gap-4">
              <div>
                <span className="flex items-center gap-2 font-[family-name:var(--font-label)] font-semibold text-[13px] tracking-wider uppercase text-emerald-700">
                  <span className="w-2.5 h-2.5 rounded-[1px] bg-local" aria-hidden="true" />
                  {isMatching ? 'Matches now' : 'Paid locally'}
                </span>
                <span className="block mt-1 text-[28px] leading-none font-semibold text-emerald-700">{usd(matchNow)}</span>
                <span className="block mt-1 text-sm text-slate-600">paid locally</span>
              </div>
              <div>
                <span className="flex items-center gap-2 font-[family-name:var(--font-label)] font-semibold text-[13px] tracking-wider uppercase text-sky-700">
                  <span className="w-2.5 h-2.5 rounded-[1px] bg-cross" aria-hidden="true" />
                  Crosses on Stellar
                </span>
                <span className="block mt-1 text-[28px] leading-none font-semibold text-sky-700">{usd(crossIfUnmatched)}</span>
                <span className="block mt-1 text-sm text-slate-600">{isMatching ? 'if still unmatched' : 'right away, as USDC'}</span>
              </div>
            </div>
            {isMatching && (
              <p data-tour="remainder-policy" className="mt-3 text-sm text-slate-600">
                {oppositeWaiting > 0
                  ? `${usd(oppositeWaiting)} is waiting to go ${toCountry.name} → ${fromCountry.name} right now. `
                  : `Nothing is waiting to go ${toCountry.name} → ${fromCountry.name} right now. `}
                More can match before {departureTime}; whatever is left then goes to {recipientName.trim() || 'your recipient'} as USDC.
              </p>
            )}
          </div>

          <dl className="border-t border-slate-200 px-5 py-4 space-y-2 text-[15px]">
            {isMatching && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-600">Local transfer for the matched part</dt>
                <dd>{matchedFee === null ? 'n/a' : usd(matchedFee)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-slate-600">USDC conversion and cash-out (~{CROSS_PCT.toFixed(1)}%)</dt>
              <dd>{usd(isMatching ? crossFee : (parsedAmount * CROSS_PCT) / 100)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-600">Stellar network fee</dt>
              <dd>~0.00002 XLM</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-600">Tandem fee</dt>
              <dd>$0.00</dd>
            </div>
            <div className="flex justify-between gap-4 pt-2 border-t border-slate-200 font-semibold">
              <dt>{isMatching ? 'Estimated fees if sent now' : 'Estimated fees'}</dt>
              <dd>{usd(isMatching ? totalFee : (parsedAmount * CROSS_PCT) / 100)}</dd>
            </div>
            {overseasCost !== null && (
              <div className="flex justify-between gap-4 text-slate-600">
                <dt>
                  Same transfer with {feeRow.provider}
                  <span className="sr-only"> (from the fee spreadsheet, {feeRow.id})</span>
                </dt>
                <dd>{usd(overseasCost)}</dd>
              </div>
            )}
          </dl>

          <div className="border-t border-slate-200 px-5 pt-6 pb-5">
            {formError && (
              <p role="alert" className="mb-4 text-sm text-rose-700 bg-rose-50 px-3 py-2.5 rounded-sm">
                {formError}
              </p>
            )}
            <button
              data-tour="submit-button"
              type="submit"
              disabled={isSubmitting || parsedAmount <= 0}
              className="w-full h-13 inline-flex items-center justify-center gap-2 rounded-sm bg-ink text-white text-[17px] font-semibold hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-600 transition-colors"
            >
              {isSubmitting ? 'Placing your transfer…' : `${isMatching ? 'Send' : 'Send now'} ${usd(parsedAmount)}`}
              {!isSubmitting && <ArrowRight className="w-4 h-4" aria-hidden="true" />}
            </button>
            <p className="mt-2.5 text-sm text-slate-600">
              {isMatching
                ? `Nothing leaves your account before a match or departure at ${departureTime}.`
                : 'Converted to USDC and sent on the Stellar testnet straight away.'}
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
};
