import React, { useState } from 'react';
import {
  Play,
  RotateCcw,
  ArrowRight,
  ArrowLeftRight,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  Terminal,
  ExternalLink,
  ChevronRight,
  Shield,
  FileCheck,
} from 'lucide-react';
import { Corridor, TransferOrder, BatchSettlementResult } from '../types';
import { executeTwoWayMatching } from '../utils/matchingEngine';
import { CANONICAL_SCENARIO_ORDERS } from '../data/mockData';

interface CorridorVisualizerProps {
  corridors: Corridor[];
  orders: TransferOrder[];
  onUpdateOrders: (orders: TransferOrder[]) => void;
  onSelectOrder: (order: TransferOrder) => void;
}

export const CorridorVisualizer: React.FC<CorridorVisualizerProps> = ({
  corridors,
  orders,
  onUpdateOrders,
  onSelectOrder,
}) => {
  const [selectedCorridorId, setSelectedCorridorId] = useState<string>('CA-KE');
  const [isProcessingMatch, setIsProcessingMatch] = useState<boolean>(false);
  const [lastBatchResult, setLastBatchResult] = useState<BatchSettlementResult | null>(null);
  const [executionLogs, setExecutionLogs] = useState<string[]>([
    '[System Ready] Soroban Two-Way Escrow contract CC7X...2WAY initialized.',
    '[Corridor Active] CA ⇄ KE listening for bilateral transfer intents.',
  ]);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const activeCorridor =
    corridors.find((c) => c.id === selectedCorridorId) || corridors[0];

  const countryA = activeCorridor.countryA.name;
  const countryB = activeCorridor.countryB.name;

  // Filter orders for active corridor
  const corridorOrders = orders.filter(
    (o) =>
      (o.fromCountry === countryA && o.toCountry === countryB) ||
      (o.fromCountry === countryB && o.toCountry === countryA)
  );

  const queueAtoB = corridorOrders.filter(
    (o) => o.fromCountry === countryA && o.toCountry === countryB
  );
  const queueBtoA = corridorOrders.filter(
    (o) => o.fromCountry === countryB && o.toCountry === countryA
  );

  const totalVolAtoB = queueAtoB.reduce((s, o) => s + o.amount, 0);
  const totalVolBtoA = queueBtoA.reduce((s, o) => s + o.amount, 0);

  const openVolAtoB = queueAtoB
    .filter((o) => o.status === 'open' || o.status === 'partially_matched')
    .reduce((s, o) => s + o.remainingAmount, 0);
  const openVolBtoA = queueBtoA
    .filter((o) => o.status === 'open' || o.status === 'partially_matched')
    .reduce((s, o) => s + o.remainingAmount, 0);

  const matchableNow = Math.min(openVolAtoB, openVolBtoA);

  // Reset to canonical prompt scenario: Alice 500, Bob 200, Charlie 300
  const handleResetToCanonicalScenario = () => {
    setSelectedCorridorId('CA-KE');
    const freshOrders: TransferOrder[] = JSON.parse(
      JSON.stringify(CANONICAL_SCENARIO_ORDERS)
    );
    onUpdateOrders(freshOrders);
    setLastBatchResult(null);
    setExecutionLogs([
      '[Reset] Loaded canonical Hackathon Prompt Scenario:',
      '• Alice Tremblay: Canada → Kenya, 500 USDC (Priority 1, Fallback: Direct Stellar transfer)',
      '• Bob Mwangi: Kenya → Canada, 200 USDC (Priority 2, Fallback: Refund to wallet)',
      '• Charlie Gagnon: Canada → Kenya, 300 USDC (Priority 3, Fallback: Refund to wallet)',
      'Ready for matching execution.',
    ]);
  };

  // Run the matching engine
  const handleRunMatchingEngine = () => {
    setIsProcessingMatch(true);

    setTimeout(() => {
      const result = executeTwoWayMatching(
        orders,
        countryA,
        countryB,
        { forceSettleRemainders: true }
      );

      onUpdateOrders(result.updatedOrders);
      setLastBatchResult(result.settlementBatch);
      setExecutionLogs((prev) => [...prev, ...result.logs]);
      setIsProcessingMatch(false);
    }, 600);
  };

  const filteredOrders = corridorOrders.filter((order) => {
    if (filterStatus === 'all') return true;
    if (filterStatus === 'open') return order.status === 'open' || order.status === 'partially_matched';
    if (filterStatus === 'settled') return order.status === 'settled';
    if (filterStatus === 'fallback') return order.status === 'fallback_executed';
    if (filterStatus === 'refunded') return order.status === 'refunded';
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8">
      {/* Top Banner & Scenario Action Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            <span>Live Bilateral Netting Engine</span>
            <span>·</span>
            <span>Corridor Simulator</span>
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mt-1">
            {activeCorridor.countryA.flag} {activeCorridor.countryA.name} ⇄{' '}
            {activeCorridor.countryB.flag} {activeCorridor.countryB.name} Order Book
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Matching opposite-direction transfers to net liquidity and minimize cross-border friction.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleResetToCanonicalScenario}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1.5"
            title="Load the exact Alice (500), Bob (200), Charlie (300) example from the prompt"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>Load Prompt Scenario (Alice, Bob, Charlie)</span>
          </button>

          <button
            onClick={handleRunMatchingEngine}
            disabled={isProcessingMatch || matchableNow === 0}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white shadow-xs transition-colors flex items-center gap-2"
          >
            {isProcessingMatch ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Executing Match Batch...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>
                  Match & Settle{' '}
                  {matchableNow > 0
                    ? `($${matchableNow.toFixed(0)} USDC)`
                    : '(0 USDC Ready)'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Corridor Selector Pill Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="text-xs text-slate-400 shrink-0 mr-1">Corridors:</span>
        {corridors.map((c) => {
          const isActive = c.id === selectedCorridorId;
          return (
            <button
              key={c.id}
              onClick={() => setSelectedCorridorId(c.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors ${
                isActive
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-slate-300'
              }`}
            >
              {c.countryA.flag} {c.countryA.name} ⇄ {c.countryB.flag} {c.countryB.name}
            </button>
          );
        })}
      </div>

      {/* Visual Two-Way Street Corridor Lanes */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100 dark:border-slate-700/60">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Two-Way Street Flow Architecture
            </h3>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono-numbers">
            <div>
              <span className="text-slate-400">Total Corridor Volume: </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                ${(totalVolAtoB + totalVolBtoA).toFixed(2)} USDC
              </span>
            </div>
            <div>
              <span className="text-slate-400">Net Matched Volume: </span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                ${corridorOrders.reduce((s, o) => s + o.matchedAmount, 0).toFixed(2)} USDC
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative">
          {/* Central Crossing Netting Bridge (Visual) */}
          <div className="hidden lg:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex-col items-center justify-center pointer-events-none">
            <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg border-2 border-white dark:border-slate-800">
              <ArrowLeftRight className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-semibold tracking-wider text-indigo-600 dark:text-indigo-400 bg-white/90 dark:bg-slate-900/90 px-2 py-0.5 rounded-full shadow-xs border border-indigo-100 dark:border-indigo-900 mt-1">
              SOROBAN NETTING
            </span>
          </div>

          {/* Lane 1: Country A -> Country B */}
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 border border-slate-200 dark:border-slate-700/80">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">{activeCorridor.countryA.flag}</span>
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  {activeCorridor.countryA.name} → {activeCorridor.countryB.name}
                </span>
              </div>
              <div className="text-xs font-mono-numbers text-slate-600 dark:text-slate-300">
                Active: <span className="font-semibold">${openVolAtoB.toFixed(2)} USDC</span>
              </div>
            </div>

            <div className="space-y-2.5">
              {queueAtoB.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  No orders currently in this directional queue.
                </div>
              ) : (
                queueAtoB.map((order, idx) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    priorityNumber={idx + 1}
                    onSelect={() => onSelectOrder(order)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Lane 2: Country B -> Country A */}
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 border border-slate-200 dark:border-slate-700/80">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">{activeCorridor.countryB.flag}</span>
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  {activeCorridor.countryB.name} → {activeCorridor.countryA.name}
                </span>
              </div>
              <div className="text-xs font-mono-numbers text-slate-600 dark:text-slate-300">
                Active: <span className="font-semibold">${openVolBtoA.toFixed(2)} USDC</span>
              </div>
            </div>

            <div className="space-y-2.5">
              {queueBtoA.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">
                  No orders currently in this directional queue.
                </div>
              ) : (
                queueBtoA.map((order, idx) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    priorityNumber={idx + 1}
                    onSelect={() => onSelectOrder(order)}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Settlement Batch Execution Details (if executed) */}
      {lastBatchResult && (
        <div className="bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-5 shadow-xs animate-fadeIn">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Atomic Settlement Batch: {lastBatchResult.batchId}</span>
                  <a
                    href={`https://stellar.expert/explorer/testnet/tx/${lastBatchResult.txHash.replace('0x', '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-mono font-normal"
                    title="View Batch on StellarExpert Testnet"
                  >
                    <span>Tx: {lastBatchResult.txHash.slice(0, 16)}...</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </h4>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                Netting paired opposing transfers on Stellar Testnet ledger #{lastBatchResult.stellarLedgerSeq} with gas cost of only {lastBatchResult.stroopsGasCost} Stroops (~0.00018 XLM).
              </p>
            </div>
            <div className="text-right text-xs">
              <span className="text-slate-400 block">Total Volume Netted</span>
              <span className="text-lg font-bold font-mono-numbers text-emerald-600 dark:text-emerald-400">
                ${lastBatchResult.totalVolumeNetted.toFixed(2)} USDC
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-xs">
            {/* Matched Pairs */}
            <div className="bg-white dark:bg-slate-800 p-3.5 rounded-lg border border-emerald-100 dark:border-emerald-900">
              <span className="font-semibold text-slate-800 dark:text-slate-200 block mb-2">
                Matched Pairs Settle Directly:
              </span>
              {lastBatchResult.matchedPairs.length === 0 ? (
                <div className="text-slate-400">No pairs matched in this batch.</div>
              ) : (
                <div className="space-y-2">
                  {lastBatchResult.matchedPairs.map((pair, i) => (
                    <div
                      key={i}
                      className="p-2 bg-slate-50 dark:bg-slate-900 rounded border border-slate-100 dark:border-slate-800 font-mono-numbers text-[11px]"
                    >
                      <div className="flex justify-between font-bold text-indigo-600 dark:text-indigo-400">
                        <span>Pair #{i + 1}</span>
                        <span>${pair.settledAmount.toFixed(2)} USDC</span>
                      </div>
                      <div className="text-slate-600 dark:text-slate-400 mt-0.5">
                        {pair.senderA} pays {pair.recipientA} ⇄ {pair.senderB} pays {pair.recipientB}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Remainders Processed */}
            <div className="bg-white dark:bg-slate-800 p-3.5 rounded-lg border border-emerald-100 dark:border-emerald-900">
              <span className="font-semibold text-slate-800 dark:text-slate-200 block mb-2">
                Remainders Handled via Pre-Set Policies:
              </span>
              {lastBatchResult.remaindersProcessed.length === 0 ? (
                <div className="text-slate-400">No remainders required processing.</div>
              ) : (
                <div className="space-y-2">
                  {lastBatchResult.remaindersProcessed.map((rem, i) => (
                    <div
                      key={i}
                      className="p-2 bg-slate-50 dark:bg-slate-900 rounded border border-slate-100 dark:border-slate-800 text-[11px]"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          Order {rem.orderId}
                        </span>
                        <span className="font-mono-numbers font-bold text-slate-700 dark:text-slate-300">
                          ${rem.amount.toFixed(2)} USDC
                        </span>
                      </div>
                      <div className="text-slate-500 mt-0.5 flex items-center gap-1">
                        {rem.action === 'fallback_direct_payout' ? (
                          <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                            ⚡ Dispatched directly to {rem.recipientOrSender} on Stellar
                          </span>
                        ) : (
                          <span className="text-amber-700 dark:text-amber-400 font-medium">
                            🔄 Refunded back to sender wallet ({rem.recipientOrSender})
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Orders Table with Status Filter */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              All Orders in Corridor ({corridorOrders.length})
            </h3>
            <p className="text-xs text-slate-500">
              Click any order row to inspect cryptographic proof and Soroban state.
            </p>
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-700 rounded-lg text-xs">
            {[
              { id: 'all', label: 'All' },
              { id: 'open', label: 'Open / Queued' },
              { id: 'settled', label: 'Settled' },
              { id: 'fallback', label: 'Direct Fallback' },
              { id: 'refunded', label: 'Refunded' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilterStatus(f.id)}
                className={`px-2.5 py-1 font-medium rounded-md transition-colors ${
                  filterStatus === f.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-700/60 text-slate-500 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3">Order ID / Sender</th>
                <th className="px-4 py-3">Route</th>
                <th className="px-4 py-3 text-right">Committed</th>
                <th className="px-4 py-3 text-right">Matched</th>
                <th className="px-4 py-3 text-right">Remaining</th>
                <th className="px-4 py-3">Remainder Policy</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 font-mono-numbers">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                    No orders match the selected filter.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  return (
                    <tr
                      key={order.id}
                      onClick={() => onSelectOrder(order)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-sans font-semibold text-slate-900 dark:text-white">
                          {order.senderName}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {order.id}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-sans">
                        <span className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                          {order.fromFlag} → {order.toFlag}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">
                        ${order.amount.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                        ${order.matchedAmount.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500">
                        ${order.remainingAmount.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 font-sans">
                        <span className="text-[11px] text-slate-600 dark:text-slate-300">
                          {order.remainderPolicy === 'direct_stellar_fallback'
                            ? '⚡ Direct Fallback'
                            : '🔄 Wallet Refund'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-sans">
                        <StatusBadge status={order.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectOrder(order);
                          }}
                          className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 text-[11px] font-semibold flex items-center justify-end gap-1"
                        >
                          Details <ChevronRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Soroban Engine & Execution Log Box */}
      <div className="bg-slate-900 text-slate-200 rounded-xl p-4 sm:p-5 font-mono text-xs shadow-md border border-slate-800">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
          <div className="flex items-center gap-2 text-indigo-400 font-semibold">
            <Terminal className="w-4 h-4" />
            <span>Soroban Relayer Execution Traces</span>
          </div>
          <span className="text-[11px] text-slate-500">
            {executionLogs.length} events logged
          </span>
        </div>
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-2 text-[11px] text-slate-300">
          {executionLogs.map((log, idx) => (
            <div key={idx} className="leading-relaxed">
              <span className="text-slate-500 select-none mr-2">›</span>
              {log}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

interface OrderCardProps {
  order: TransferOrder;
  priorityNumber: number;
  onSelect: () => void;
}

const OrderCard: React.FC<OrderCardProps> = ({ order, priorityNumber, onSelect }) => {
  const percentFilled =
    order.amount > 0 ? (order.matchedAmount / order.amount) * 100 : 0;

  return (
    <div
      onClick={onSelect}
      className="bg-white dark:bg-slate-800 p-3.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 cursor-pointer shadow-2xs transition-all"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
              P{priorityNumber}
            </span>
            <span className="font-semibold text-xs text-slate-900 dark:text-white">
              {order.senderName}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Recipient: <span className="text-slate-700 dark:text-slate-300">{order.recipientName}</span>
          </div>
        </div>

        <div className="text-right font-mono-numbers">
          <div className="font-bold text-xs text-slate-900 dark:text-white">
            ${order.amount.toFixed(2)} USDC
          </div>
          <div className="text-[10px] text-slate-400">
            Rem: ${order.remainingAmount.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-2.5">
        <div className="flex justify-between text-[10px] text-slate-400 mb-1 font-mono-numbers">
          <span>{percentFilled.toFixed(0)}% matched</span>
          <span>
            {order.remainderPolicy === 'direct_stellar_fallback'
              ? '⚡ Direct Fallback'
              : '🔄 Refund to Wallet'}
          </span>
        </div>
        <div className="w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
          <div
            className="bg-indigo-600 h-full rounded-full transition-all duration-300"
            style={{ width: `${percentFilled}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/60 text-[10px]">
        <span className="text-slate-400">
          Escrow: {order.escrowContractId}
        </span>
        <StatusBadge status={order.status} />
      </div>
    </div>
  );
};

const StatusBadge: React.FC<{ status: TransferOrder['status'] }> = ({ status }) => {
  switch (status) {
    case 'open':
      return (
        <span className="text-indigo-700 dark:text-indigo-400 font-semibold text-[11px]">
          Queued
        </span>
      );
    case 'partially_matched':
      return (
        <span className="text-amber-700 dark:text-amber-400 font-semibold text-[11px]">
          Partial Match
        </span>
      );
    case 'settled':
      return (
        <span className="text-emerald-700 dark:text-emerald-400 font-semibold text-[11px]">
          Fully Settled
        </span>
      );
    case 'fallback_executed':
      return (
        <span className="text-cyan-700 dark:text-cyan-400 font-semibold text-[11px]">
          Direct Fallback Paid
        </span>
      );
    case 'refunded':
      return (
        <span className="text-purple-700 dark:text-purple-400 font-semibold text-[11px]">
          Refunded to Wallet
        </span>
      );
    case 'cancelled':
      return (
        <span className="text-rose-700 dark:text-rose-400 font-semibold text-[11px]">
          Cancelled
        </span>
      );
    default:
      return <span className="text-slate-500 text-[11px]">{status}</span>;
  }
};
