import React, { useState } from 'react';
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
import { Corridor, RemainderPolicy, TransferOrder, UserWallet } from '../types';
import { isValidStellarPublicKey } from '../services/stellarTestnet';

interface SendTransferFormProps {
  corridors: Corridor[];
  wallet: UserWallet;
  onOrderCreated: (newOrder: TransferOrder) => void;
  onNavigateToDashboard: () => void;
}

export const SendTransferForm: React.FC<SendTransferFormProps> = ({
  corridors,
  wallet,
  onOrderCreated,
  onNavigateToDashboard,
}) => {
  const [selectedCorridorId, setSelectedCorridorId] = useState<string>('CA-KE');
  const [directionReversed, setDirectionReversed] = useState<boolean>(false);
  const [amount, setAmount] = useState<string>('500');
  const [recipientName, setRecipientName] = useState<string>('David Kilonzo');
  const [recipientAddress, setRecipientAddress] = useState<string>(
    'GAHVEV3PTFCTWHX2DTZZU3F5ZQXBKJUBA4PORGCUIFUJV2RCQAMAQ363'
  );

  // Mode: Matched corridor pool vs instant direct
  const [transferMode, setTransferMode] = useState<'matched_pool' | 'direct_instant'>('matched_pool');

  // Deadline selection
  const [deadlineMinutes, setDeadlineMinutes] = useState<number>(60);
  const [isCustomDeadline, setIsCustomDeadline] = useState<boolean>(false);
  const [customMinutesInput, setCustomMinutesInput] = useState<string>('45');

  // Remainder Policy
  const [remainderPolicy, setRemainderPolicy] =
    useState<RemainderPolicy>('direct_stellar_fallback');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedOrder, setSubmittedOrder] = useState<TransferOrder | null>(null);

  const [formError, setFormError] = useState<string | null>(null);

  const activeCorridor =
    corridors.find((c) => c.id === selectedCorridorId) || corridors[0];

  const fromCountry = directionReversed ? activeCorridor.countryB : activeCorridor.countryA;
  const toCountry = directionReversed ? activeCorridor.countryA : activeCorridor.countryB;

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (parsedAmount <= 0) return;
    if (parsedAmount > wallet.usdcBalance) {
      setFormError('Amount exceeds your current testnet USDC balance.');
      return;
    }

    const cleanRecipient = recipientAddress.trim();
    if (!isValidStellarPublicKey(cleanRecipient)) {
      setFormError('Invalid Stellar recipient address. Must be a valid 56-character Ed25519 public key starting with G.');
      return;
    }

    setIsSubmitting(true);

    setTimeout(() => {
      const isInstant = transferMode === 'direct_instant';
      const newOrder: TransferOrder = {
        id: `ORD-${Date.now().toString().slice(-6)}`,
        senderName: 'You',
        senderAddress: wallet.publicKey,
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
        matchHistory: isInstant
          ? [
              {
                matchedWithOrderId: 'DIRECT-L1',
                matchedWithSender: 'Direct Stellar Transfer',
                amount: parsedAmount,
                timestamp: Date.now(),
                recipientSettled: recipientName,
                txHash: Array.from({ length: 64 }, () =>
                  Math.floor(Math.random() * 16).toString(16)
                ).join(''),
              },
            ]
          : [],
        escrowContractId: isInstant ? 'NATIVE-STELLAR-PAYMENT' : 'CC7X...2WAY',
        depositTxHash: '1e0496807293bf6400d1ea71e73971fa3b3bdd9ad27b35b1c93e79917923a242',
        notes: isInstant
          ? `Direct transfer to ${toCountry.name}`
          : `Corridor transfer ${fromCountry.name} to ${toCountry.name} (${effectiveMinutes}m window)`,
      };

      onOrderCreated(newOrder);
      setSubmittedOrder(newOrder);
      setIsSubmitting(false);
      // Auto-redirect to Transfers dashboard as requested
      setTimeout(() => {
        onNavigateToDashboard();
      }, 400);
    }, 600);
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
              View in Transfers
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
            Corridor Netting (Save ~{activeCorridor.offRampSavingsPct}%)
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
            Direct Stellar (Immediate)
          </button>
        </div>

        {/* Currency & Corridor Box */}
        <div data-tour="corridor-route" className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-4 bg-white dark:bg-slate-800/60">
          {/* Corridor Selection */}
          <div className="flex items-center justify-between gap-4 pb-3 border-b border-slate-100 dark:border-slate-700">
            <div>
              <span className="text-[11px] text-slate-500 block">Corridor</span>
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
                title="Reverse corridor direction"
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
                Balance: <strong className="font-mono-numbers text-slate-700 dark:text-slate-300">${wallet.usdcBalance.toFixed(2)}</strong> USDC
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
                USDC
              </span>
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
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <span>Sample:</span>
              <button
                type="button"
                onClick={() => {
                  setRecipientName('David Kilonzo');
                  setRecipientAddress('GAHVEV3PTFCTWHX2DTZZU3F5ZQXBKJUBA4PORGCUIFUJV2RCQAMAQ363');
                }}
                className="text-slate-600 dark:text-slate-400 hover:underline"
              >
                David (KE)
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={() => {
                  setRecipientName('Emily Watson');
                  setRecipientAddress('GBKHAYYPLGZXT7OR6DLHKUKEC6OKYHRQARLUUZH6S3YLUVCG2S5BJXAD');
                }}
                className="text-slate-600 dark:text-slate-400 hover:underline"
              >
                Emily (CA)
              </button>
            </div>
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

            {/* Remainder preference: What to do with the Rest of the Money */}
            <div data-tour="remainder-policy" className="pt-3 border-t border-slate-100 dark:border-slate-700 space-y-2.5">
              <div className="flex justify-between items-baseline">
                <span className="font-semibold text-slate-900 dark:text-white block text-xs">
                  What to do with the Rest of the Money if unmatched?
                </span>
                <span className="text-[10px] text-slate-400">Automatic fallback rule</span>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {/* Option 1: Send the Rest via USDC */}
                <div
                  onClick={() => setRemainderPolicy('direct_stellar_fallback')}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    remainderPolicy === 'direct_stellar_fallback'
                      ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-2xs'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-900'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <input
                      type="radio"
                      name="remainderPolicy"
                      checked={remainderPolicy === 'direct_stellar_fallback'}
                      onChange={() => setRemainderPolicy('direct_stellar_fallback')}
                      className="mt-0.5 text-emerald-600 focus:ring-0"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                          <SendHorizontal className="w-3.5 h-3.5 text-emerald-500" />
                          Send the Rest via Direct Stellar USDC
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-semibold">
                          Guaranteed Delivery
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        If counterparty demand doesn't match 100%, immediately dispatch the rest directly to {recipientName} on Stellar. Recipient receives full funds.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Option 2: Refund the Rest to Wallet */}
                <div
                  onClick={() => setRemainderPolicy('refund_to_sender')}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    remainderPolicy === 'refund_to_sender'
                      ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20 shadow-2xs'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-900'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <input
                      type="radio"
                      name="remainderPolicy"
                      checked={remainderPolicy === 'refund_to_sender'}
                      onChange={() => setRemainderPolicy('refund_to_sender')}
                      className="mt-0.5 text-indigo-600 focus:ring-0"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                          <RotateCcw className="w-3.5 h-3.5 text-indigo-500" />
                          Refund the Rest to My Wallet
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 font-semibold">
                          Zero Risk
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Only execute what matched. If unmatched when the timer closes, unlock and return the remaining USDC back to your wallet.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Option 3: Convert Rest to Bank / Mobile Money */}
                <div
                  onClick={() => setRemainderPolicy('convert_to_fiat_bank')}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    remainderPolicy === 'convert_to_fiat_bank'
                      ? 'border-amber-500 bg-amber-50/40 dark:bg-amber-950/20 shadow-2xs'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-900'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <input
                      type="radio"
                      name="remainderPolicy"
                      checked={remainderPolicy === 'convert_to_fiat_bank'}
                      onChange={() => setRemainderPolicy('convert_to_fiat_bank')}
                      className="mt-0.5 text-amber-600 focus:ring-0"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-amber-500" />
                          Convert Rest to Recipient's Bank / M-Pesa ({toCountry.currency})
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-semibold">
                          SEP-31 Anchor
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Automatically convert the remaining USDC at live Anchor rates and deposit directly into recipient's domestic checking account or mobile money.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
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
            `Place $${parsedAmount.toFixed(2)} USDC in Matching Queue`
          )}
        </button>
      </form>
    </div>
  );
};
