import React, { useState } from 'react';
import {
  ArrowRight,
  Clock,
  RotateCcw,
  SendHorizontal,
  Info,
  CheckCircle2,
  Lock,
  Layers,
  Zap,
} from 'lucide-react';
import { Corridor, RemainderPolicy, TransferOrder, UserWallet } from '../types';

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
  const [recipientAddress, setRecipientAddress] = useState<string>('GDAV4908...ID99');

  // Choice to send: Matched pool vs Instant Direct
  const [transferMode, setTransferMode] = useState<'matched_pool' | 'direct_instant'>('matched_pool');

  // Time Selection / Expiry input
  const [expiryType, setExpiryType] = useState<'preset' | 'custom'>('preset');
  const [deadlineMinutes, setDeadlineMinutes] = useState<number>(60);
  const [customMinutesInput, setCustomMinutesInput] = useState<string>('45');

  // Remainder Policy choice
  const [remainderPolicy, setRemainderPolicy] =
    useState<RemainderPolicy>('direct_stellar_fallback');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitSuccess, setSubmitSuccess] = useState<boolean>(false);
  const [createdOrderSummary, setCreatedOrderSummary] = useState<TransferOrder | null>(null);

  const activeCorridor =
    corridors.find((c) => c.id === selectedCorridorId) || corridors[0];

  const fromCountry = directionReversed
    ? activeCorridor.countryB
    : activeCorridor.countryA;
  const toCountry = directionReversed
    ? activeCorridor.countryA
    : activeCorridor.countryB;

  const parsedAmount = parseFloat(amount) || 0;
  const estimatedAnchorSavings = (
    parsedAmount *
    (activeCorridor.offRampSavingsPct / 100)
  ).toFixed(2);
  const traditionalFee = (15 + parsedAmount * 0.035).toFixed(2);

  // Compute actual expiry duration in minutes
  const effectiveMinutes =
    transferMode === 'direct_instant'
      ? 0
      : expiryType === 'custom'
      ? Math.max(1, parseInt(customMinutesInput) || 1)
      : deadlineMinutes;

  // Calculate target expiry time formatted nicely
  const calculatedExpiryDate = new Date(Date.now() + effectiveMinutes * 60 * 1000);
  const formattedExpiryTime = calculatedExpiryDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleQuickAmount = (val: number) => {
    setAmount(val.toString());
  };

  const handlePreFillRecipient = (name: string, addr: string) => {
    setRecipientName(name);
    setRecipientAddress(addr);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedAmount <= 0) return;
    if (parsedAmount > wallet.usdcBalance) {
      alert('Amount exceeds your current testnet USDC wallet balance.');
      return;
    }

    setIsSubmitting(true);

    setTimeout(() => {
      const orderId = `ORD-${Date.now().toString().slice(-6)}`;
      const isInstant = transferMode === 'direct_instant';

      const newOrder: TransferOrder = {
        id: orderId,
        senderName: 'You (Current User)',
        senderAddress: wallet.shortAddress,
        recipientName: recipientName.trim() || 'Designated Recipient',
        recipientAddress: recipientAddress.trim() || 'GABC...9999',
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
        deadlineTimestamp: isInstant
          ? Date.now()
          : Date.now() + effectiveMinutes * 60 * 1000,
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
                txHash: `0x${Array.from({ length: 64 }, () =>
                  Math.floor(Math.random() * 16).toString(16)
                ).join('')}`,
              },
            ]
          : [],
        escrowContractId: isInstant ? 'NATIVE-STELLAR-PAYMENT' : 'CC7X...2WAY',
        depositTxHash: `0x${Array.from({ length: 64 }, () =>
          Math.floor(Math.random() * 16).toString(16)
        ).join('')}`,
        settlementTxHash: isInstant
          ? `0x${Array.from({ length: 64 }, () =>
              Math.floor(Math.random() * 16).toString(16)
            ).join('')}`
          : undefined,
        notes: isInstant
          ? `Instant direct Stellar USDC transfer to ${toCountry.name}`
          : `Matched pool transfer from ${fromCountry.name} to ${toCountry.name} (Deadline: ${effectiveMinutes} mins)`,
      };

      onOrderCreated(newOrder);
      setCreatedOrderSummary(newOrder);
      setIsSubmitting(false);
      setSubmitSuccess(true);
    }, 600);
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Send Cross-Border USDC
        </h1>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          Choose whether to send instantly via direct Stellar transfer or enter the two-way matching pool to save on destination off-ramp fees.
        </p>
      </div>

      {submitSuccess && createdOrderSummary ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-emerald-200 dark:border-emerald-800/80 p-5 shadow-xs mb-8 animate-fadeIn">
          <div className="flex items-start gap-4">
            <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {createdOrderSummary.transferType === 'direct_instant'
                  ? 'Direct Stellar Payment Dispatched'
                  : 'Transfer Intent Escrowed On-Chain'}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                <span className="font-semibold">${createdOrderSummary.amount.toFixed(2)} USDC</span> to{' '}
                <span className="font-semibold">{createdOrderSummary.recipientName}</span> ({createdOrderSummary.toCountry}).
                Order ID: <code className="font-mono text-indigo-600 dark:text-indigo-400">{createdOrderSummary.id}</code>
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 my-3.5 bg-slate-50 dark:bg-slate-900/60 p-3 rounded-lg text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">Corridor</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {createdOrderSummary.fromFlag} {createdOrderSummary.fromCountry} → {createdOrderSummary.toFlag} {createdOrderSummary.toCountry}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Matching Deadline</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {createdOrderSummary.transferType === 'direct_instant'
                      ? 'Instant (Immediate Settlement)'
                      : `${createdOrderSummary.deadlineMinutes} minutes`}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Remainder Policy</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {createdOrderSummary.transferType === 'direct_instant'
                      ? 'Direct Payout'
                      : createdOrderSummary.remainderPolicy === 'direct_stellar_fallback'
                      ? 'Auto-Send Remainder via Direct Stellar'
                      : 'Refund to Wallet'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={onNavigateToDashboard}
                  className="px-3.5 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition-colors inline-flex items-center gap-1.5"
                >
                  <Layers className="w-3.5 h-3.5" />
                  View in Transfers Dashboard
                </button>
                <button
                  onClick={() => {
                    setSubmitSuccess(false);
                    setCreatedOrderSummary(null);
                  }}
                  className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg hover:bg-slate-200 transition-colors"
                >
                  Create Another Transfer
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Main Form Box */}
        <div className="lg:col-span-8 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-xs">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Transfer Choice: Matching Pool vs Instant */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">
                1. Transfer Method
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setTransferMode('matched_pool')}
                  className={`p-3.5 rounded-lg border text-left transition-all ${
                    transferMode === 'matched_pool'
                      ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20 ring-1 ring-indigo-600'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-indigo-600" />
                      Matching Pool (Save Fees)
                    </span>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950 px-1.5 py-0.5 rounded">
                      -{activeCorridor.offRampSavingsPct}% Fees
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Pairs with opposing transfers. If unmatched by your deadline, auto-executes your chosen fallback.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setTransferMode('direct_instant')}
                  className={`p-3.5 rounded-lg border text-left transition-all ${
                    transferMode === 'direct_instant'
                      ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20 ring-1 ring-indigo-600'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-500" />
                      Direct Stellar (Instant)
                    </span>
                    <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                      3-5 Seconds
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Dispatches immediately via native Stellar PaymentOp. No waiting window, standard off-ramp applies.
                  </p>
                </button>
              </div>
            </div>

            {/* Corridor Selection */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">
                2. Select Corridor
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {corridors.map((corridor) => {
                  const isSelected = corridor.id === selectedCorridorId;
                  return (
                    <button
                      key={corridor.id}
                      type="button"
                      onClick={() => setSelectedCorridorId(corridor.id)}
                      className={`text-left p-3 rounded-lg border transition-all ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20 ring-1 ring-indigo-600'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <span>{corridor.countryA.flag}</span>
                          <span>{corridor.countryA.name}</span>
                          <span className="text-slate-400">⇄</span>
                          <span>{corridor.countryB.flag}</span>
                          <span>{corridor.countryB.name}</span>
                        </span>
                        <span className="text-[11px] font-mono-numbers text-emerald-600 font-medium">
                          -{corridor.offRampSavingsPct}%
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                        {corridor.countryA.currency} ↔ {corridor.countryB.currency} · {corridor.countryB.anchorName}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Direction Route */}
            <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5 font-medium text-slate-800 dark:text-slate-200">
                <span className="flex items-center gap-1">
                  <span>{fromCountry.flag}</span>
                  <span className="font-bold">{fromCountry.name}</span>
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-indigo-500" />
                <span className="flex items-center gap-1">
                  <span>{toCountry.flag}</span>
                  <span className="font-bold">{toCountry.name}</span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDirectionReversed(!directionReversed)}
                className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Switch Direction
              </button>
            </div>

            {/* Amount Input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  3. Amount (USDC)
                </label>
                <span className="text-xs text-slate-500">
                  Wallet: <span className="font-mono-numbers font-medium text-slate-800 dark:text-slate-200">${wallet.usdcBalance.toFixed(2)}</span> USDC
                </span>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 font-semibold text-sm">
                  $
                </div>
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-8 pr-16 py-2.5 text-sm font-mono-numbers font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
                <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-xs font-bold text-slate-400">
                  USDC
                </div>
              </div>

              {/* Quick Amount Chips */}
              <div className="flex items-center gap-1.5 mt-2">
                <span className="text-[11px] text-slate-400 mr-1">Quick:</span>
                {[100, 200, 300, 500, 1000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleQuickAmount(preset)}
                    className="px-2 py-0.5 text-xs rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-mono-numbers"
                  >
                    ${preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Recipient Details */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  4. Recipient in {toCountry.name}
                </label>
                <div className="flex items-center gap-1 text-[11px]">
                  <span className="text-slate-400">Sample:</span>
                  <button
                    type="button"
                    onClick={() => handlePreFillRecipient('David Kilonzo', 'GDAV4908...ID99')}
                    className="text-indigo-600 hover:underline"
                  >
                    David (KE)
                  </button>
                  <span className="text-slate-300">·</span>
                  <button
                    type="button"
                    onClick={() => handlePreFillRecipient('Emily Watson', 'GEMI1120...LY11')}
                    className="text-indigo-600 hover:underline"
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
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1">Stellar Address</label>
                  <input
                    type="text"
                    value={recipientAddress}
                    onChange={(e) => setRecipientAddress(e.target.value)}
                    placeholder="G... or federation"
                    className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Time-Selection Input & Matching Deadline (when in matching pool mode) */}
            {transferMode === 'matched_pool' && (
              <div className="space-y-3 pt-1 border-t border-slate-100 dark:border-slate-700/80">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-indigo-600" />
                    5. Matching Deadline (How long to wait for peer match)
                  </label>
                  <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 font-mono-numbers">
                    {effectiveMinutes >= 60 ? `${(effectiveMinutes / 60).toFixed(1)} hrs` : `${effectiveMinutes} mins`}
                  </span>
                </div>

                {/* Presets & Custom Toggle */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: '15 Mins', minutes: 15 },
                    { label: '30 Mins', minutes: 30 },
                    { label: '1 Hour', minutes: 60 },
                    { label: '2 Hours', minutes: 120 },
                    { label: '6 Hours', minutes: 360 },
                    { label: '24 Hours', minutes: 1440 },
                  ].map((p) => {
                    const isSelected = expiryType === 'preset' && deadlineMinutes === p.minutes;
                    return (
                      <button
                        key={p.minutes}
                        type="button"
                        onClick={() => {
                          setExpiryType('preset');
                          setDeadlineMinutes(p.minutes);
                        }}
                        className={`p-2 rounded-lg border text-xs font-medium transition-all ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200 ring-1 ring-indigo-600'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}

                  {/* Custom Expiry Button */}
                  <button
                    type="button"
                    onClick={() => setExpiryType('custom')}
                    className={`col-span-2 p-2 rounded-lg border text-xs font-medium transition-all ${
                      expiryType === 'custom'
                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200 ring-1 ring-indigo-600'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    Custom Minutes...
                  </button>
                </div>

                {/* Custom Time Input Field */}
                {expiryType === 'custom' && (
                  <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center gap-3">
                    <span className="text-xs text-slate-600 dark:text-slate-300 shrink-0">
                      Set exact waiting duration:
                    </span>
                    <input
                      type="number"
                      min="1"
                      max="2880"
                      value={customMinutesInput}
                      onChange={(e) => setCustomMinutesInput(e.target.value)}
                      placeholder="Minutes"
                      className="w-24 px-2.5 py-1 text-xs font-mono font-bold bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-slate-900 dark:text-white"
                    />
                    <span className="text-xs text-slate-500">minutes</span>
                  </div>
                )}

                {/* Expiry Timestamp Preview */}
                <div className="bg-slate-50 dark:bg-slate-900/50 px-3 py-2 rounded-lg text-xs text-slate-600 dark:text-slate-400 flex items-center justify-between">
                  <span>Order will expire at:</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-200 font-mono-numbers">
                    {formattedExpiryTime} today ({effectiveMinutes} min timer)
                  </span>
                </div>
              </div>
            )}

            {/* Remainder Policy Selection (when in matching pool mode) */}
            {transferMode === 'matched_pool' && (
              <div className="space-y-2.5 pt-1 border-t border-slate-100 dark:border-slate-700/80">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">
                  6. If not 100% matched when timer ends:
                </label>

                {/* Option 1: Direct Stellar Fallback */}
                <label
                  onClick={() => setRemainderPolicy('direct_stellar_fallback')}
                  className={`block p-3 rounded-lg border cursor-pointer transition-all ${
                    remainderPolicy === 'direct_stellar_fallback'
                      ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20 ring-1 ring-indigo-600'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <input
                      type="radio"
                      name="remainderPolicy"
                      checked={remainderPolicy === 'direct_stellar_fallback'}
                      onChange={() => setRemainderPolicy('direct_stellar_fallback')}
                      className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <SendHorizontal className="w-3.5 h-3.5 text-indigo-600" />
                          Auto-Send Remainder via Direct Stellar Transfer (Recommended)
                        </span>
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 dark:bg-emerald-950 px-1.5 py-0.5 rounded">
                          Guaranteed Delivery
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                        If no opposing transfer fills the remainder by {formattedExpiryTime}, the smart contract automatically sends the rest directly to {recipientName}. Zero delay, transfer is always completed.
                      </p>
                    </div>
                  </div>
                </label>

                {/* Option 2: Refund to Wallet */}
                <label
                  onClick={() => setRemainderPolicy('refund_to_sender')}
                  className={`block p-3 rounded-lg border cursor-pointer transition-all ${
                    remainderPolicy === 'refund_to_sender'
                      ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20 ring-1 ring-indigo-600'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <input
                      type="radio"
                      name="remainderPolicy"
                      checked={remainderPolicy === 'refund_to_sender'}
                      onChange={() => setRemainderPolicy('refund_to_sender')}
                      className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                          Refund Remainder Back to My Wallet
                        </span>
                        <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                          Capital Preserved
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                        If no opposing match is found by {formattedExpiryTime}, the contract returns the remaining USDC to your balance.
                      </p>
                    </div>
                  </div>
                </label>
              </div>
            )}

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting || parsedAmount <= 0}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-semibold text-xs rounded-lg shadow-xs transition-all flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Signing On-Chain Transaction...</span>
                  </>
                ) : transferMode === 'direct_instant' ? (
                  <>
                    <Zap className="w-4 h-4 text-amber-300" />
                    <span>Send ${parsedAmount.toFixed(2)} USDC Instantly</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>
                      Escrow ${parsedAmount.toFixed(2)} USDC ({effectiveMinutes}m Matching Window)
                    </span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Right Info Sidebar */}
        <div className="lg:col-span-4 space-y-4 text-xs">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs">
            <h3 className="font-bold text-slate-900 dark:text-white mb-3">
              Fee & Routing Summary
            </h3>

            <div className="space-y-2.5">
              <div className="flex justify-between pb-2 border-b border-slate-100 dark:border-slate-700">
                <span className="text-slate-500">Amount:</span>
                <span className="font-mono-numbers font-bold text-slate-900 dark:text-white">
                  ${parsedAmount.toFixed(2)} USDC
                </span>
              </div>
              <div className="flex justify-between pb-2 border-b border-slate-100 dark:border-slate-700">
                <span className="text-slate-500">Traditional Bank Wire:</span>
                <span className="font-mono-numbers text-rose-500 line-through">
                  ~${traditionalFee}
                </span>
              </div>
              <div className="flex justify-between pb-2 border-b border-slate-100 dark:border-slate-700">
                <span className="text-slate-500">Stellar Network Fee:</span>
                <span className="font-mono-numbers text-emerald-600 font-medium">
                  $0.00002
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Matching Platform Fee:</span>
                <span className="font-mono-numbers text-indigo-600 font-bold">
                  $0.00
                </span>
              </div>
            </div>

            {transferMode === 'matched_pool' && (
              <div className="mt-4 p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg border border-emerald-200 dark:border-emerald-800/60 text-[11px] text-emerald-800 dark:text-emerald-200">
                <span className="font-bold block">Estimated Local Off-Ramp Savings:</span>
                <span className="text-base font-bold font-mono-numbers text-emerald-600 block mt-0.5">
                  ~${estimatedAnchorSavings}
                </span>
                <span className="text-slate-500 text-[10px] block mt-0.5">
                  Netted transfers avoid international currency conversion spreads at {activeCorridor.countryB.anchorName}.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
