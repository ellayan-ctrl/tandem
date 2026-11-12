import React, { useState, useEffect } from 'react';
import {
  X,
  Play,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Building2,
  TrendingDown,
  Clock,
  AlertCircle,
  Smartphone,
  Check,
  Coins,
} from 'lucide-react';
import {
  INSTITUTION_A,
  INSTITUTION_B,
  loadLiveInstitutionBalances,
  submitRealUsdcPayment,
  LiveAccountDetails,
} from '../services/stellarTestnet';

interface EndToEndNettingDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (msg: string) => void;
}

export type DemoStage =
  | 'idle'
  | 'calculating_netting'
  | 'signing_stellar_tx'
  | 'waiting_horizon_confirmation'
  | 'verifying_domestic_payouts'
  | 'completed';

export const EndToEndNettingDemoModal: React.FC<EndToEndNettingDemoModalProps> = ({
  isOpen,
  onClose,
  onShowToast,
}) => {
  const [stage, setStage] = useState<DemoStage>('idle');
  const [balancesA, setBalancesA] = useState<LiveAccountDetails | null>(null);
  const [balancesB, setBalancesB] = useState<LiveAccountDetails | null>(null);
  const [isLoadingBalances, setIsLoadingBalances] = useState<boolean>(true);

  // Settlement Results
  const [settledTxHash, setSettledTxHash] = useState<string | null>(null);
  const [settledLedger, setSettledLedger] = useState<number | null>(null);
  const [isDuplicateSettled, setIsDuplicateSettled] = useState<boolean>(false);
  const [payoutConfirmations, setPayoutConfirmations] = useState<{
    kenyaMpesaDavid: boolean;
    kenyaMpesaSamuel: boolean;
    canadaInteracEmily: boolean;
  }>({
    kenyaMpesaDavid: false,
    kenyaMpesaSamuel: false,
    canadaInteracEmily: false,
  });

  const fetchLiveBalances = async () => {
    setIsLoadingBalances(true);
    try {
      const { instA, instB } = await loadLiveInstitutionBalances();
      setBalancesA(instA);
      setBalancesB(instB);
    } catch (e) {
      console.warn('Failed to fetch live institution balances:', e);
    } finally {
      setIsLoadingBalances(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchLiveBalances();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRunDemo = async () => {
    if (isDuplicateSettled) {
      onShowToast('This batch has already been settled on-chain to prevent duplicate settlement.');
      return;
    }

    setStage('calculating_netting');

    // Stage 1: Netting Calculation (10 vs 6 -> 4 Net)
    await new Promise((r) => setTimeout(r, 900));

    // Stage 2: Signing Stellar Transaction
    setStage('signing_stellar_tx');
    await new Promise((r) => setTimeout(r, 700));

    // Stage 3: Submitting Real 4 USDC Payment to Horizon Testnet
    setStage('waiting_horizon_confirmation');
    const paymentResult = await submitRealUsdcPayment({
      senderSecret: INSTITUTION_A.secretKey,
      recipientPublicKey: INSTITUTION_B.publicKey,
      amount: '4.0000000',
      memoText: 'TwoWay Net 4 USDC Batch #1',
    });

    if (!paymentResult.success) {
      onShowToast(`Stellar submission error: ${paymentResult.error}`);
      setStage('idle');
      return;
    }

    setSettledTxHash(paymentResult.hash);
    setSettledLedger(paymentResult.ledger || null);
    setIsDuplicateSettled(true);

    // Refresh live balances from Horizon to verify actual changes
    await fetchLiveBalances();

    // Stage 4: Domestic Payout Confirmations (Clearly Labeled as Simulated)
    setStage('verifying_domestic_payouts');

    // Sequential domestic confirmations
    await new Promise((r) => setTimeout(r, 800));
    setPayoutConfirmations((prev) => ({ ...prev, kenyaMpesaDavid: true }));

    await new Promise((r) => setTimeout(r, 700));
    setPayoutConfirmations((prev) => ({ ...prev, kenyaMpesaSamuel: true }));

    await new Promise((r) => setTimeout(r, 800));
    setPayoutConfirmations((prev) => ({ ...prev, canadaInteracEmily: true }));

    // Stage 5: Mark the entire remittance as completed only after all confirmations
    setStage('completed');
    onShowToast('🎉 End-to-End Netting Demo Completed: 4 USDC settled on Stellar Testnet & verified!');
  };

  const handleResetDemo = () => {
    setStage('idle');
    setSettledTxHash(null);
    setSettledLedger(null);
    setIsDuplicateSettled(false);
    setPayoutConfirmations({
      kenyaMpesaDavid: false,
      kenyaMpesaSamuel: false,
      canadaInteracEmily: false,
    });
    fetchLiveBalances();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-3xl w-full my-6 overflow-hidden flex flex-col max-h-[94vh]">
        {/* Header Banner */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <Play className="w-5 h-5 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  End-to-End Bilateral Netting Demo
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-semibold border border-emerald-300 dark:border-emerald-800">
                  Real Stellar Testnet USDC
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Two separately funded institution wallets · 10 vs 6 USDC → 4 USDC Net Settlement
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchLiveBalances}
              disabled={isLoadingBalances}
              className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
              title="Refresh on-chain Horizon balances"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingBalances ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs flex-1">
          {/* Institution Wallets Status Cards (Verified Live from Horizon) */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-[11px]">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                1. Participating Institution Wallets (Live Horizon Balances)
              </span>
              <span className="text-slate-400 font-mono text-[10px]">
                Issuer: Circle Testnet USDC ({INSTITUTION_A.publicKey.slice(0, 4)}...{INSTITUTION_A.publicKey.slice(-4)})
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Institution A */}
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{INSTITUTION_A.flag}</span>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white leading-tight">
                        {INSTITUTION_A.name}
                      </h4>
                      <a
                        href={`https://stellar.expert/explorer/testnet/account/${INSTITUTION_A.publicKey}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-slate-400 hover:underline font-mono flex items-center gap-1"
                      >
                        <span>{INSTITUTION_A.publicKey.slice(0, 8)}...{INSTITUTION_A.publicKey.slice(-6)}</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    Sender Node
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 font-mono-numbers">
                  <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/40">
                    <span className="text-[10px] text-slate-400 block font-sans">USDC Balance:</span>
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      {balancesA ? `${balancesA.usdcBalance.toFixed(2)} USDC` : 'Loading...'}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/40">
                    <span className="text-[10px] text-slate-400 block font-sans">Native Gas (XLM):</span>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      {balancesA ? `${balancesA.xlmBalance.toFixed(1)} XLM` : 'Loading...'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Institution B */}
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{INSTITUTION_B.flag}</span>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white leading-tight">
                        {INSTITUTION_B.name}
                      </h4>
                      <a
                        href={`https://stellar.expert/explorer/testnet/account/${INSTITUTION_B.publicKey}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-slate-400 hover:underline font-mono flex items-center gap-1"
                      >
                        <span>{INSTITUTION_B.publicKey.slice(0, 8)}...{INSTITUTION_B.publicKey.slice(-6)}</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    Receiver Node
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 font-mono-numbers">
                  <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/40">
                    <span className="text-[10px] text-slate-400 block font-sans">USDC Balance:</span>
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      {balancesB ? `${balancesB.usdcBalance.toFixed(2)} USDC` : 'Loading...'}
                    </span>
                  </div>
                  <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/40">
                    <span className="text-[10px] text-slate-400 block font-sans">Native Gas (XLM):</span>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                      {balancesB ? `${balancesB.xlmBalance.toFixed(1)} XLM` : 'Loading...'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Gross Obligations vs Netting Calculation */}
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-900 dark:text-white">
                2. Bilateral Gross Obligations & Net Settlement Calculation
              </span>
              <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                75% Capital Reduction
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 font-mono-numbers text-xs">
              <div className="p-2.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block font-sans">Canada → Kenya (Gross)</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">10.00 USDC</span>
                <p className="text-[10px] text-slate-500 font-sans mt-0.5">
                  Alice (6 USDC) + Charlie (4 USDC)
                </p>
              </div>

              <div className="p-2.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block font-sans">Kenya → Canada (Gross)</span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">6.00 USDC</span>
                <p className="text-[10px] text-slate-500 font-sans mt-0.5">
                  Bob (6 USDC to Emily)
                </p>
              </div>

              <div className="p-2.5 rounded bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800">
                <span className="text-[10px] text-emerald-800 dark:text-emerald-300 block font-sans font-semibold">
                  Net Settlement (Real Tx)
                </span>
                <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                  4.00 USDC
                </span>
                <p className="text-[10px] text-emerald-700/80 dark:text-emerald-300 font-sans mt-0.5">
                  6 USDC matched & canceled both ways
                </p>
              </div>
            </div>
          </div>

          {/* Execution Pipeline Steps */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-slate-900 dark:text-white block">
              3. Execution Pipeline & Live State Machine
            </span>

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3 bg-white dark:bg-slate-900 space-y-2 text-xs">
              {/* Step 1 */}
              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    stage !== 'idle' ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-600'
                  }`}>
                    1
                  </div>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    Bilateral Matching & Net Calculation
                  </span>
                </div>
                <span className="font-mono text-[11px] text-slate-500">
                  {stage === 'idle' ? 'Ready' : '6 USDC Matched · 4 USDC Net'}
                </span>
              </div>

              {/* Step 2 */}
              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    stage === 'waiting_horizon_confirmation' || stage === 'verifying_domestic_payouts' || stage === 'completed'
                      ? 'bg-emerald-500 text-white'
                      : stage === 'signing_stellar_tx'
                      ? 'bg-amber-500 text-white animate-pulse'
                      : 'bg-slate-200 text-slate-600'
                  }`}>
                    2
                  </div>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    Stellar Testnet 4 USDC Settlement Payment
                  </span>
                </div>
                <span className="font-mono text-[11px]">
                  {settledTxHash ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Confirmed on Ledger #{settledLedger}
                    </span>
                  ) : stage === 'waiting_horizon_confirmation' ? (
                    <span className="text-amber-600 animate-pulse">Submitting to Horizon...</span>
                  ) : (
                    <span className="text-slate-400">Pending Execution</span>
                  )}
                </span>
              </div>

              {/* Step 3 */}
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    stage === 'completed'
                      ? 'bg-emerald-500 text-white'
                      : stage === 'verifying_domestic_payouts'
                      ? 'bg-amber-500 text-white animate-pulse'
                      : 'bg-slate-200 text-slate-600'
                  }`}>
                    3
                  </div>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    Domestic Payout Confirmations
                  </span>
                </div>
                <span className="font-mono text-[11px]">
                  {stage === 'completed' ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                      All 3 Confirmations Received
                    </span>
                  ) : stage === 'verifying_domestic_payouts' ? (
                    <span className="text-amber-600">Verifying webhook receipts...</span>
                  ) : (
                    <span className="text-slate-400">Awaiting on-chain settlement</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* On-Chain Verification Block */}
          {settledTxHash && (
            <div className="p-3.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5 text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  Real Stellar Testnet Transaction Confirmed
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-100 font-bold">
                  LEDGER #{settledLedger}
                </span>
              </div>

              <div className="p-2.5 rounded bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 text-[11px] font-mono space-y-1">
                <div className="flex justify-between items-center text-slate-500">
                  <span>Tx Hash:</span>
                  <a
                    href={`https://stellar.expert/explorer/testnet/tx/${settledTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 font-bold"
                  >
                    <span>{settledTxHash.slice(0, 20)}...{settledTxHash.slice(-10)}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="flex justify-between items-center text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800">
                  <span>Settled Amount:</span>
                  <span className="font-bold text-slate-900 dark:text-white">4.0000000 USDC</span>
                </div>
                <div className="flex justify-between items-center text-slate-500">
                  <span>Sender:</span>
                  <span>{INSTITUTION_A.shortName}</span>
                </div>
                <div className="flex justify-between items-center text-slate-500">
                  <span>Destination:</span>
                  <span>{INSTITUTION_B.shortName}</span>
                </div>
              </div>
            </div>
          )}

          {/* Domestic Fiat Payouts (Clearly Labeled as Simulated) */}
          <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-2">
            <div className="flex justify-between items-baseline">
              <span className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-slate-500" />
                Domestic Fiat Remittance Dispatches
              </span>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                SIMULATED LOCAL DOMESTIC PAYOUTS
              </span>
            </div>
            <p className="text-[10px] text-slate-500">
              *Note: Stellar USDC settlement above is real on Testnet. The corresponding domestic mobile money and Interac banking payouts below are simulated anchor clearing calls.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] font-mono-numbers">
              {/* David */}
              <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="flex justify-between text-slate-400 text-[10px] font-sans">
                  <span>Kenya (M-Pesa)</span>
                  {payoutConfirmations.kenyaMpesaDavid ? (
                    <span className="text-emerald-600 font-bold flex items-center gap-0.5">
                      <Check className="w-2.5 h-2.5" /> Cleared
                    </span>
                  ) : (
                    <span>Pending</span>
                  )}
                </div>
                <div className="font-bold text-slate-900 dark:text-white">
                  KSh 777.00 KES
                </div>
                <span className="text-[9px] text-slate-500 font-sans block">
                  David Kilonzo (6 USDC netted)
                </span>
              </div>

              {/* Samuel */}
              <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="flex justify-between text-slate-400 text-[10px] font-sans">
                  <span>Kenya (M-Pesa)</span>
                  {payoutConfirmations.kenyaMpesaSamuel ? (
                    <span className="text-emerald-600 font-bold flex items-center gap-0.5">
                      <Check className="w-2.5 h-2.5" /> Cleared
                    </span>
                  ) : (
                    <span>Pending</span>
                  )}
                </div>
                <div className="font-bold text-slate-900 dark:text-white">
                  KSh 518.00 KES
                </div>
                <span className="text-[9px] text-slate-500 font-sans block">
                  Samuel Ochieng (4 USDC net)
                </span>
              </div>

              {/* Emily */}
              <div className="p-2 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="flex justify-between text-slate-400 text-[10px] font-sans">
                  <span>Canada (Interac)</span>
                  {payoutConfirmations.canadaInteracEmily ? (
                    <span className="text-emerald-600 font-bold flex items-center gap-0.5">
                      <Check className="w-2.5 h-2.5" /> Cleared
                    </span>
                  ) : (
                    <span>Pending</span>
                  )}
                </div>
                <div className="font-bold text-slate-900 dark:text-white">
                  $8.35 CAD
                </div>
                <span className="text-[9px] text-slate-500 font-sans block">
                  Emily Watson (6 USDC netted)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            {stage === 'completed' ? (
              <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Entire Remittance Completed & Verified
              </span>
            ) : stage !== 'idle' ? (
              <span className="font-semibold text-amber-600 flex items-center gap-1.5">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Executing live settlement pipeline...
              </span>
            ) : (
              <span className="text-slate-500">
                Click Run to execute the 4 USDC payment on Stellar Testnet.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isDuplicateSettled && (
              <button
                type="button"
                onClick={handleResetDemo}
                className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 font-medium transition-colors"
              >
                Reset Demo
              </button>
            )}

            <button
              type="button"
              onClick={handleRunDemo}
              disabled={stage !== 'idle' || isDuplicateSettled}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded font-bold transition-all shadow-sm flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>
                {stage === 'completed'
                  ? 'Batch Netting Confirmed'
                  : stage !== 'idle'
                  ? 'Executing Settlement...'
                  : 'Run End-to-End Demo (4 USDC)'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
