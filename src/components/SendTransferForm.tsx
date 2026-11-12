import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Clock,
  SendHorizontal,
  RotateCcw,
  Check,
  ChevronDown,
  Building2,
  Smartphone,
  ShieldCheck,
} from 'lucide-react';
import { AccountView, Corridor, RemainderPolicy, TransferOrder } from '../types';
import { FX_RATES } from '../services/bankingService';
import { isValidStellarPublicKey } from '../services/stellarTestnet';
import { MethodSelect } from './MethodSelect';
import { SavingsComparison } from './SavingsComparison';
import type { FundingKind } from '../data/fundingMethods';

/** Testnet accounts with USDC trustlines, so the Soroban remainder payout can land (demo convenience). */
const DEMO_RECIPIENT_BY_COUNTRY: Record<string, string> = {
  Kenya: 'GC7MO3K6MUMXK3W3XWAN2XJYWO5RNPSTJXNTV5SZQAUENT7GWIFBZEUI',
  Canada: 'GANIMAPEKBIP3YXIY7SZIRQ7XARNHDGTPCN5UTIBTXX64LCSFQ6DA4JO',
};

interface SendTransferFormProps {
  corridors: Corridor[];
  /** Linked bank account; null until the user links one. */
  account: AccountView | null;
  /** Open the account panel to link a payment method (optionally of one kind). */
  onLinkBank: (kind?: FundingKind) => void;
  /** Resolves with the stored order; rejects with a user-facing error. */
  onOrderCreated: (newOrder: TransferOrder) => Promise<TransferOrder>;
  onNavigateToDashboard: () => void;
}

export const SendTransferForm: React.FC<SendTransferFormProps> = ({
  corridors,
  account,
  onLinkBank,
  onOrderCreated,
  onNavigateToDashboard,
}) => {
  const [selectedCorridorId, setSelectedCorridorId] = useState<string>('CA-KE');
  const [directionReversed, setDirectionReversed] = useState<boolean>(false);
  const [amount, setAmount] = useState<string>('10');
  const [recipientName, setRecipientName] = useState<string>('');
  const [recipientAddress, setRecipientAddress] = useState<string>('');

  // Mode: Matched corridor pool vs instant direct
  const [transferMode, setTransferMode] = useState<'matched_pool' | 'direct_instant'>('matched_pool');

  // Deadline selection
  const [deadlineMinutes, setDeadlineMinutes] = useState<number>(60);
  const [isCustomDeadline, setIsCustomDeadline] = useState<boolean>(false);
  const [customMinutesInput, setCustomMinutesInput] = useState<string>('45');

  // Unmatched remainder always settles in USDC on Soroban.
  const remainderPolicy: RemainderPolicy = 'direct_stellar_fallback';

  // Linked bank that pays the matched part, and (optionally) a different one for the unmatched part.
  const [bankId, setBankId] = useState<number | null>(null);
  const [remainderBankId, setRemainderBankId] = useState<number | null>(null);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedOrder, setSubmittedOrder] = useState<TransferOrder | null>(null);

  const [formError, setFormError] = useState<string | null>(null);

  const activeCorridor =
    corridors.find((c) => c.id === selectedCorridorId) || corridors[0];

  const fromCountry = directionReversed ? activeCorridor.countryB : activeCorridor.countryA;
  const toCountry = directionReversed ? activeCorridor.countryA : activeCorridor.countryB;

  // Amount is entered in USD; the bank is charged in the sender's local currency.
  const fxRate = FX_RATES[fromCountry.currency]?.rate ?? 1;
  const localNeeded = (parseFloat(amount) || 0) * fxRate;

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
  /** "Send from": funds the unmatched part (converted to USDC), or everything for a Full Crypto Transfer. */
  const remainderBank = account?.banks.find((b) => b.id === remainderBankId);

  const parsedAmount = parseFloat(amount) || 0;
  const effectiveMinutes =
    transferMode === 'direct_instant'
      ? 0
      : isCustomDeadline
      ? Math.max(1, parseInt(customMinutesInput) || 1)
      : deadlineMinutes;

  const expiryDate = new Date(Date.now() + effectiveMinutes * 60 * 1000);
  const formattedExpiryTime = expiryDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const estimatedSavings = (parsedAmount * (activeCorridor.offRampSavingsPct / 100)).toFixed(2);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (parsedAmount <= 0) return;
    if (!account) {
      onLinkBank();
      setFormError('Link your bank account first.');
      return;
    }
    if (fromCountry.name !== account.country) {
      setFormError(`Your linked bank is in ${account.country}. Choose countries that send from ${account.country}.`);
      return;
    }
    if (localNeeded > account.available + 0.005) {
      setFormError(`Not enough in your bank: ${account.currency} ${account.available.toFixed(2)} available, ${account.currency} ${localNeeded.toFixed(2)} needed.`);
      return;
    }

    const cleanRecipient = recipientAddress.trim();
    if (!isValidStellarPublicKey(cleanRecipient)) {
      setFormError('Invalid Stellar recipient address. Must be a valid 56-character Ed25519 public key starting with G.');
      return;
    }

    if (!remainderBank || (transferMode === 'matched_pool' && !payBank)) {
      setFormError('Choose which linked account to send from, or link one first.');
      return;
    }
    for (const b of new Set(transferMode === 'matched_pool' ? [payBank, remainderBank] : [remainderBank])) {
      if (b && localNeeded > b.available + 0.005) {
        setFormError(`Not enough in ${b.name}: ${account.currency} ${b.available.toFixed(2)} available, ${account.currency} ${localNeeded.toFixed(2)} needed.`);
        return;
      }
    }

    setIsSubmitting(true);

    {
      const isInstant = transferMode === 'direct_instant';
      const newOrder: TransferOrder = {
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
        notes: isInstant
          ? `Direct transfer to ${toCountry.name}`
          : `Transfer ${fromCountry.name} to ${toCountry.name} (${effectiveMinutes}m window)`,
      };

      let saved: TransferOrder;
      try {
        saved = await onOrderCreated(newOrder);
      } catch (err) {
        setFormError((err as Error).message || 'Could not place the order.');
        setIsSubmitting(false);
        return;
      }
      setSubmittedOrder(saved);
      setIsSubmitting(false);
      // Auto-redirect to Live Orders as requested
      setTimeout(() => {
        onNavigateToDashboard();
      }, 400);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 sm:px-6">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          Send Money
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          Match opposite-direction transfers on Stellar to reduce recipient cash-out costs.
        </p>
      </div>

      {/* Success Notification */}
      {submittedOrder && (
        <div className="mb-6 p-4 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
          <div className="flex items-start justify-between">
            <div>
              <span className="font-semibold text-slate-900 dark:text-white block">
                {submittedOrder.transferType === 'direct_instant'
                  ? 'Transfer Submitted'
                  : 'Order Placed in Matching Queue'}
              </span>
              <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                ${submittedOrder.amount.toFixed(2)} USDC to {submittedOrder.recipientName} ({submittedOrder.toCountry}) · Order {submittedOrder.id}
              </p>
            </div>
            <button
              onClick={onNavigateToDashboard}
              className="text-slate-900 dark:text-white font-semibold underline hover:no-underline ml-4"
            >
              View in Live Orders
            </button>
          </div>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Method Segmented Control */}
        <div data-tour="transfer-mode" className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setTransferMode('matched_pool')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors text-center ${
              transferMode === 'matched_pool'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Transfer Matching (Timed)
          </button>
          <button
            type="button"
            onClick={() => setTransferMode('direct_instant')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors text-center ${
              transferMode === 'direct_instant'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Full Crypto Transfer (Immediate)
          </button>
        </div>

        {/* Currency & Corridor Box */}
        <div data-tour="corridor-route" className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-4 bg-white dark:bg-slate-800/60">
          {/* Corridor Selection */}
          <div className="flex items-center justify-between gap-4 pb-3 border-b border-slate-100 dark:border-slate-700">
            <div>
              <span className="text-[11px] text-slate-500 block">Countries</span>
              <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
                <span>{fromCountry.flag} {fromCountry.name}</span>
                <span className="text-slate-400">→</span>
                <span>{toCountry.flag} {toCountry.name}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedCorridorId}
                onChange={(e) => setSelectedCorridorId(e.target.value)}
                className="text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-slate-700 dark:text-slate-300 font-medium"
              >
                {corridors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.countryA.name} ⇄ {c.countryB.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setDirectionReversed(!directionReversed)}
                className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700"
                title="Swap sending and receiving country"
              >
                Reverse
              </button>
            </div>
          </div>

          {/* Amount */}
          <div>
            <div className="flex justify-between items-baseline mb-1">
              <label className="text-[11px] font-medium text-slate-500">You send</label>
              <span className="text-[11px] text-slate-400">
                {account ? (
                  <>
                    Available{payBank ? ` in ${payBank.name}` : ''}:{' '}
                    <strong className="font-mono-numbers text-slate-700 dark:text-slate-300">
                      {account.currency} {(payBank?.available ?? account.available).toFixed(2)}
                    </strong>
                  </>
                ) : (
                  <button type="button" onClick={() => onLinkBank()} className="underline">
                    Link a payment method
                  </button>
                )}
              </span>
            </div>

            <div className="relative">
              <input
                type="number"
                min="1"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full text-xl font-bold font-mono-numbers bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-slate-400"
                required
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                USD
              </span>
            </div>
            {fromCountry.currency !== 'USD' && localNeeded > 0 && (
              <span className="text-[11px] text-slate-500 block mt-1 font-mono-numbers">
                ≈ {fromCountry.currency} {localNeeded.toFixed(2)} from your account
              </span>
            )}

            <div className="mt-3">
              <MethodSelect
                label="Send from"
                account={account}
                value={remainderBank?.id ?? null}
                onChange={setRemainderBankId}
                onLinkAnother={() => onLinkBank()}
                hint={
                  transferMode === 'matched_pool'
                    ? 'Only the unmatched part is taken from here, converted to USDC when your window closes.'
                    : 'The whole amount is taken from here and sent as USDC via Stellar Blockchain.'
                }
              />
            </div>

            {/* Quick preset buttons */}
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-[11px] text-slate-400 mr-1">Preset:</span>
              {[100, 250, 500, 1000].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setAmount(val.toString())}
                  className="px-2 py-0.5 text-xs rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-mono-numbers transition-colors"
                >
                  ${val}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Recipient Details */}
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-3 bg-white dark:bg-slate-800/60 text-xs">
          <div className="flex justify-between items-baseline">
            <span className="font-semibold text-slate-900 dark:text-white">
              Recipient in {toCountry.name}
            </span>
            <button
              type="button"
              onClick={() => setRecipientAddress(DEMO_RECIPIENT_BY_COUNTRY[toCountry.name] ?? DEMO_RECIPIENT_BY_COUNTRY.Kenya)}
              className="text-[11px] text-slate-500 hover:underline"
              title="Fill a testnet address that holds a USDC trustline"
            >
              Use testnet demo address
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-slate-500 block mb-1">Full Name</label>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Recipient Name"
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 block mb-1">Stellar Address</label>
              <input
                type="text"
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                placeholder="G..."
                className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white focus:outline-none"
                required
              />
            </div>
          </div>
        </div>

        {/* Matching Window (only when in matching mode) */}
        {transferMode === 'matched_pool' && (
          <div data-tour="matching-window" className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-3 bg-white dark:bg-slate-800/60 text-xs">
            <div className="flex justify-between items-baseline">
              <label className="font-semibold text-slate-900 dark:text-white">
                Matching Window
              </label>
              <span className="text-slate-500 font-mono-numbers">
                Closes at {formattedExpiryTime} ({effectiveMinutes}m)
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[
                { label: '15m', minutes: 15 },
                { label: '30m', minutes: 30 },
                { label: '1h', minutes: 60 },
                { label: '2h', minutes: 120 },
                { label: '6h', minutes: 360 },
                { label: '24h', minutes: 1440 },
              ].map((item) => {
                const isSelected = !isCustomDeadline && deadlineMinutes === item.minutes;
                return (
                  <button
                    key={item.minutes}
                    type="button"
                    onClick={() => {
                      setIsCustomDeadline(false);
                      setDeadlineMinutes(item.minutes);
                    }}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                      isSelected
                        ? 'border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setIsCustomDeadline(true)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                  isCustomDeadline
                    ? 'border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                }`}
              >
                Custom
              </button>
            </div>

            {isCustomDeadline && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-slate-500">Wait up to:</span>
                <input
                  type="number"
                  min="1"
                  max="1440"
                  value={customMinutesInput}
                  onChange={(e) => setCustomMinutesInput(e.target.value)}
                  className="w-20 px-2 py-1 text-xs font-mono font-medium border border-slate-200 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-900"
                />
                <span className="text-slate-500">minutes</span>
              </div>
            )}

            {/* Unmatched remainder: always USDC via Soroban */}
            <div data-tour="remainder-policy" className="pt-3 border-t border-slate-100 dark:border-slate-700">
              <div className="p-3 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20">
                <span className="font-semibold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  Unmatched amount: USDC via Stellar Blockchain
                </span>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Whatever isn&apos;t matched when the window closes is converted to USDC and sent to{' '}
                  {recipientName || 'the recipient'}&apos;s Stellar wallet by the TwoWay settlement contract. Nothing is
                  taken from your account until then.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* How the matched part is paid (matching mode only) */}
        {transferMode === 'matched_pool' && (
          <div data-tour="payout-method" className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-slate-800/60 text-xs">
            <MethodSelect
              label="Pay for the matched amount with"
              account={account}
              value={payBank?.id ?? null}
              onChange={setBankId}
              onLinkAnother={() => onLinkBank()}
              hint={`The part that matches is paid domestically in ${fromCountry.currency}, only once it matches. The recipient collects it however they prefer.`}
            />
            {payBank && account?.country === fromCountry.name && (
              <div className="mt-3">
                <SavingsComparison from={fromCountry} to={toCountry} localAmount={localNeeded} method={payBank} />
              </div>
            )}
          </div>
        )}

        {/* Cost Summary Line Items */}
        <div className="text-xs text-slate-500 space-y-1.5 px-1 font-mono-numbers">
          <div className="flex justify-between">
            <span>Stellar network fee:</span>
            <span>~0.00002 XLM</span>
          </div>
          <div className="flex justify-between">
            <span>Platform matching fee:</span>
            <span>$0.00</span>
          </div>
          {transferMode === 'matched_pool' && (
            <div className="flex justify-between text-slate-800 dark:text-slate-200 font-sans font-medium">
              <span>Estimated anchor savings:</span>
              <span className="font-mono-numbers">~${estimatedSavings} USDC</span>
            </div>
          )}
        </div>

        {/* Form Error Banner */}
        {formError && (
          <div className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded border border-rose-200 dark:border-rose-900">
            {formError}
          </div>
        )}

        {/* Submit Button */}
        <button
          data-tour="submit-button"
          type="submit"
          disabled={isSubmitting || parsedAmount <= 0}
          className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 disabled:bg-slate-200 text-white dark:text-slate-900 font-semibold text-xs rounded-md transition-colors"
        >
          {isSubmitting ? (
            'Submitting on Stellar Testnet...'
          ) : transferMode === 'direct_instant' ? (
            `Send $${parsedAmount.toFixed(2)} USDC Instantly`
          ) : (
            `Sign pre-authorization & place $${parsedAmount.toFixed(2)} USDC in matching queue`
          )}
        </button>
      </form>
    </div>
  );
};
