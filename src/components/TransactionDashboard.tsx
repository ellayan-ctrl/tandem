import React, { useState, useEffect } from 'react';
import {
  Search,
  Clock,
  SendHorizontal,
  RotateCcw,
  Plus,
  ChevronRight,
  ExternalLink,
  Zap,
  HelpCircle,
  FileText,
  ShieldCheck,
  CheckCircle2,
  BookOpen,
  Play,
} from 'lucide-react';
import { TransferOrder, Corridor } from '../types';
import { calculateTotalMatchableVolume } from '../utils/matchingEngine';

interface TransactionDashboardProps {
  orders: TransferOrder[];
  corridors: Corridor[];
  onSelectOrder: (order: TransferOrder) => void;
  onInstantSendRemainder: (orderId: string) => void;
  onInstantRefundRemainder: (orderId: string) => void;
  onOpenConvertRemainder?: (order: TransferOrder) => void;
  onNavigateToSend: () => void;
  onRunMatching?: () => void;
  onSimulateOpposingOrder?: () => void;
  autoMatchEnabled?: boolean;
  onToggleAutoMatch?: () => void;
  onOpenTour?: () => void;
  onOpenDemoModal?: () => void;
}

export const TransactionDashboard: React.FC<TransactionDashboardProps> = ({
  orders,
  corridors,
  onSelectOrder,
  onInstantSendRemainder,
  onInstantRefundRemainder,
  onOpenConvertRemainder,
  onNavigateToSend,
  onRunMatching,
  onSimulateOpposingOrder,
  autoMatchEnabled = true,
  onToggleAutoMatch,
  onOpenTour,
  onOpenDemoModal,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedCorridor, setSelectedCorridor] = useState<string>('all');
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [showExplainer, setShowExplainer] = useState<boolean>(true);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const totalVolume = orders.reduce((sum, o) => sum + o.amount, 0);
  const totalMatched = orders.reduce((sum, o) => sum + o.matchedAmount, 0);
  const inFlightEscrow = orders
    .filter((o) => o.status === 'open' || o.status === 'partially_matched')
    .reduce((sum, o) => sum + o.remainingAmount, 0);
  const totalEstimatedSavings = totalMatched * 0.038;

  // Real-time calculation of immediate netting demand
  const { totalMatchable, corridorBreakdown } = calculateTotalMatchableVolume(orders);

  const filteredOrders = orders.filter((order) => {
    if (selectedStatus === 'matching' && order.status !== 'open' && order.status !== 'partially_matched') {
      return false;
    }
    if (selectedStatus === 'settled' && order.status !== 'settled') {
      return false;
    }
    if (selectedStatus === 'fallback' && order.status !== 'fallback_executed') {
      return false;
    }
    if (selectedStatus === 'refunded' && order.status !== 'refunded') {
      return false;
    }

    if (selectedCorridor !== 'all') {
      const matchCorridor =
        order.fromCountry.toLowerCase().includes(selectedCorridor) ||
        order.toCountry.toLowerCase().includes(selectedCorridor);
      if (!matchCorridor) return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        order.id.toLowerCase().includes(q) ||
        order.senderName.toLowerCase().includes(q) ||
        order.recipientName.toLowerCase().includes(q) ||
        order.fromCountry.toLowerCase().includes(q) ||
        order.toCountry.toLowerCase().includes(q);
      if (!match) return false;
    }

    return true;
  });

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Transfers & Audit Ledger
            </h1>
            {onOpenTour && (
              <button
                onClick={onOpenTour}
                className="px-2 py-0.5 rounded text-[11px] font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors flex items-center gap-1"
                title="Launch guided interactive tour"
              >
                <BookOpen className="w-3 h-3 text-slate-500" />
                <span>Quick Guide</span>
              </button>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Active clearing queues, bilateral settlement receipts, and real-time countdown expirations.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {onToggleAutoMatch && (
            <button
              onClick={onToggleAutoMatch}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                autoMatchEnabled
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
              }`}
              title="When enabled, compatible opposing transfers net automatically upon arrival"
            >
              <span className={`w-2 h-2 rounded-full ${autoMatchEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              <span>Auto-Netting: {autoMatchEnabled ? 'Active' : 'Paused'}</span>
            </button>
          )}

          <button
            onClick={onNavigateToSend}
            className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold rounded-md transition-colors inline-flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Transfer</span>
          </button>
        </div>
      </div>

      {/* Actionable Match Opportunity Alert Banner (if matchable volume exists) */}
      {totalMatchable > 0 && (
        <div className="p-3.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start sm:items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 shrink-0">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-bold text-emerald-950 dark:text-emerald-100 text-xs">
                  ${totalMatchable.toFixed(2)} USDC Ready for Immediate Bilateral Settlement
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-200 dark:bg-emerald-900/80 text-emerald-900 dark:text-emerald-200 font-semibold">
                  Opposing Demand Detected
                </span>
              </div>
              <p className="text-[11px] text-emerald-800 dark:text-emerald-300 mt-0.5">
                Opposite transfers in {corridorBreakdown.map((b) => `${b.countryA} ⇄ ${b.countryB} ($${b.matchable.toFixed(0)})`).join(', ')} can be paired right now.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onRunMatching && (
              <button
                onClick={onRunMatching}
                className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-xs"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Execute Netting Match Now</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Explainer: Why do transfers wait in queue? */}
      {showExplainer && (
        <div data-tour="match-opportunity" className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs space-y-2 relative">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 text-xs">
              <HelpCircle className="w-4 h-4 text-slate-500" />
              Why Aren't Transfers Matching Immediately?
            </span>
            <div className="flex items-center gap-3">
              {onSimulateOpposingOrder && (
                <button
                  onClick={onSimulateOpposingOrder}
                  className="text-[11px] text-slate-900 dark:text-white font-medium hover:underline flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded"
                  title="Inject simulated opposing peer order from Kenya to Canada"
                >
                  <Plus className="w-3 h-3" />
                  <span>Simulate Opposing Bob Order (Kenya → Canada $200)</span>
                </button>
              )}
              <button
                onClick={() => setShowExplainer(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
                title="Dismiss explanation"
              >
                ✕
              </button>
            </div>
          </div>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
            Two-Way Street relies on <strong>bilateral opposite-direction demand</strong> in the same corridor.
            For example, a transfer from <strong>Canada → Kenya</strong> only matches when someone else submits a transfer from <strong>Kenya → Canada</strong>.
            If no opposing transfer exists at that moment, your USDC sits safely in the Soroban smart contract escrow queue with an active countdown timer.
            Once an opposite transfer is submitted (or when your timer expires), the remaining funds automatically execute via your chosen remainder policy (Direct Stellar instant transfer or refund).
          </p>
        </div>
      )}

      {/* KPI Row (Clean, flat metrics) */}
      <div data-tour="kpis-row" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <span className="text-[11px] text-slate-500 block mb-0.5">Total Initiated</span>
          <div className="text-lg font-bold font-mono-numbers text-slate-900 dark:text-white">
            ${totalVolume.toFixed(2)}
          </div>
          <span className="text-[10px] text-slate-400 font-mono-numbers">{orders.length} transfers recorded</span>
        </div>

        <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <span className="text-[11px] text-slate-500 block mb-0.5">Net Cleared</span>
          <div className="text-lg font-bold font-mono-numbers text-slate-900 dark:text-white">
            ${totalMatched.toFixed(2)}
          </div>
          <span className="text-[10px] text-slate-400 font-mono-numbers">Bilateral match</span>
        </div>

        <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <span className="text-[11px] text-slate-500 block mb-0.5">Active in Escrow</span>
          <div className="text-lg font-bold font-mono-numbers text-slate-900 dark:text-white">
            ${inFlightEscrow.toFixed(2)}
          </div>
          <span className="text-[10px] text-slate-400 font-mono-numbers">In-flight matching</span>
        </div>

        <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <span className="text-[11px] text-slate-500 block mb-0.5">Estimated Savings</span>
          <div className="text-lg font-bold font-mono-numbers text-slate-900 dark:text-white">
            ${totalEstimatedSavings.toFixed(2)}
          </div>
          <span className="text-[10px] text-slate-400 font-mono-numbers">vs. standard off-ramp</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search transfers, recipients, IDs..."
            className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-white focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-md">
            {[
              { id: 'all', label: 'All' },
              { id: 'matching', label: 'Matching' },
              { id: 'settled', label: 'Settled' },
              { id: 'fallback', label: 'Direct Sent' },
              { id: 'refunded', label: 'Refunded' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setSelectedStatus(f.id)}
                className={`px-2.5 py-1 rounded text-xs transition-colors ${
                  selectedStatus === f.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <select
            value={selectedCorridor}
            onChange={(e) => setSelectedCorridor(e.target.value)}
            className="px-2.5 py-1 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md text-slate-700 dark:text-slate-300"
          >
            <option value="all">All corridors</option>
            <option value="kenya">Canada ⇄ Kenya</option>
            <option value="nigeria">US ⇄ Nigeria</option>
            <option value="argentina">EU ⇄ Argentina</option>
            <option value="philippines">US ⇄ Philippines</option>
          </select>
        </div>
      </div>

      {/* High-density Data Table */}
      <div data-tour="transfers-table" className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 text-[11px] font-medium">
              <tr>
                <th className="px-4 py-2.5">Order</th>
                <th className="px-4 py-2.5">Route</th>
                <th className="px-4 py-2.5">Recipient</th>
                <th className="px-4 py-2.5 text-right">Committed</th>
                <th className="px-4 py-2.5 text-right">Matched</th>
                <th className="px-4 py-2.5 text-right">Remaining</th>
                <th className="px-4 py-2.5">Status & Window</th>
                <th className="px-4 py-2.5 text-right">Receipt & Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono-numbers">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400 font-sans">
                    No matching transfers found.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const isPending =
                    order.status === 'open' || order.status === 'partially_matched';
                  const remainingMs = Math.max(0, order.deadlineTimestamp - currentTime);
                  const mins = Math.floor(remainingMs / (1000 * 60));
                  const secs = Math.floor((remainingMs % (1000 * 60)) / 1000);
                  const formattedTimer = `${mins}m ${secs.toString().padStart(2, '0')}s`;

                  return (
                    <tr
                      key={order.id}
                      onClick={() => onSelectOrder(order)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-mono text-[11px] font-semibold text-slate-900 dark:text-white">
                          {order.id}
                        </div>
                        <div className="text-[10px] text-slate-400 font-sans">
                          {new Date(order.createdAt).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                          })} · {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>

                      <td className="px-4 py-3 font-sans">
                        <span className="text-slate-800 dark:text-slate-200 font-medium">
                          {order.fromFlag} → {order.toFlag} {order.toCountry}
                        </span>
                      </td>

                      <td className="px-4 py-3 font-sans">
                        <div className="text-slate-900 dark:text-white font-medium">
                          {order.recipientName}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {order.recipientAddress.slice(0, 10)}...
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right font-medium text-slate-900 dark:text-white">
                        ${order.amount.toFixed(2)}
                      </td>

                      <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                        ${order.matchedAmount.toFixed(2)}
                      </td>

                      <td className="px-4 py-3 text-right text-slate-500">
                        ${order.remainingAmount.toFixed(2)}
                      </td>

                      <td className="px-4 py-3 font-sans">
                        {isPending ? (
                          <div className="flex items-center gap-1.5 text-[11px] font-mono-numbers text-amber-700 dark:text-amber-300">
                            <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                            <span>{remainingMs > 0 ? formattedTimer : 'Resolving'}</span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-1">
                            {order.status === 'settled' && (
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Settled
                              </span>
                            )}
                            {order.status === 'remainder_converted' && (
                              <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Bank Converted
                              </span>
                            )}
                            {order.status === 'fallback_executed' && (
                              <span className="text-sky-600 dark:text-sky-400 font-medium flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Direct Payout
                              </span>
                            )}
                            {order.status === 'refunded' && (
                              <span className="text-slate-600 dark:text-slate-400 font-medium flex items-center gap-1">
                                <RotateCcw className="w-3 h-3" /> Refunded
                              </span>
                            )}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right font-sans">
                        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                          {isPending && order.remainingAmount > 0 && (
                            <>
                              {onOpenConvertRemainder && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => onOpenConvertRemainder(order)}
                                    className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                                    title="Convert remaining USDC to local fiat bank deposit"
                                  >
                                    Convert to Bank
                                  </button>
                                  <span className="text-slate-300">·</span>
                                </>
                              )}
                              <button
                                type="button"
                                onClick={() => onInstantSendRemainder(order.id)}
                                className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 hover:underline"
                                title="Auto-send remaining funds directly via Stellar"
                              >
                                Send Remainder
                              </button>
                              <span className="text-slate-300">·</span>
                              <button
                                type="button"
                                onClick={() => onInstantRefundRemainder(order.id)}
                                className="text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                                title="Unlock and refund remaining funds to wallet"
                              >
                                Refund
                              </button>
                              <span className="text-slate-300">·</span>
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => onSelectOrder(order)}
                            className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300 transition-colors flex items-center gap-1"
                            title="Open Settlement Audit Report & Receipt"
                          >
                            <FileText className="w-3 h-3 text-slate-500" />
                            <span>Audit Receipt</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
