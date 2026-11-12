import React, { useState } from 'react';
import {
  Play,
  RotateCcw,
  ArrowRight,
  Clock,
  Terminal,
  ExternalLink,
  ChevronRight,
  Check,
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
    'Stellar Horizon Testnet connected.',
    'Escrow Contract CC7X...2WAY initialized for CA ⇄ KE.',
  ]);

  const activeCorridor =
    corridors.find((c) => c.id === selectedCorridorId) || corridors[0];

  const countryA = activeCorridor.countryA.name;
  const countryB = activeCorridor.countryB.name;

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

  const openVolAtoB = queueAtoB
    .filter((o) => o.status === 'open' || o.status === 'partially_matched')
    .reduce((s, o) => s + o.remainingAmount, 0);
  const openVolBtoA = queueBtoA
    .filter((o) => o.status === 'open' || o.status === 'partially_matched')
    .reduce((s, o) => s + o.remainingAmount, 0);

  const matchableNow = Math.min(openVolAtoB, openVolBtoA);

  const handleResetToCanonical = () => {
    setSelectedCorridorId('CA-KE');
    const fresh: TransferOrder[] = JSON.parse(JSON.stringify(CANONICAL_SCENARIO_ORDERS));
    onUpdateOrders(fresh);
    setLastBatchResult(null);
    setExecutionLogs([
      'Loaded canonical prompt orders:',
      '• Alice: Canada → Kenya, 500 USDC (Priority 1, Fallback: Direct Stellar)',
      '• Bob: Kenya → Canada, 200 USDC (Priority 2, Fallback: Refund)',
      '• Charlie: Canada → Kenya, 300 USDC (Priority 3, Fallback: Refund)',
    ]);
  };

  const handleRunMatchingEngine = (forceSettle: boolean = false) => {
    setIsProcessingMatch(true);

    setTimeout(() => {
      const result = executeTwoWayMatching(orders, countryA, countryB, {
        forceSettleRemainders: forceSettle,
      });

      onUpdateOrders(result.updatedOrders);
      setLastBatchResult(result.settlementBatch);
      setExecutionLogs((prev) => [...prev, ...result.logs]);
      setIsProcessingMatch(false);
    }, 500);
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            {activeCorridor.countryA.name} ⇄ {activeCorridor.countryB.name} Order Book
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Bilateral matching queue pairing opposing cross-border flows.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleResetToCanonical}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>Load Canonical Scenario</span>
          </button>

          <button
            onClick={() => handleRunMatchingEngine(false)}
            disabled={isProcessingMatch || matchableNow === 0}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 disabled:bg-slate-200 text-white dark:text-slate-900 transition-colors flex items-center gap-1.5 shadow-xs"
            title="Net opposing pairs while keeping unexpired remainders active in queue"
          >
            {isProcessingMatch ? (
              <span>Settling...</span>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>
                  Net Opposing Pairs {matchableNow > 0 ? `($${matchableNow.toFixed(0)})` : ''}
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Explainer Banner */}
      <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-600 dark:text-slate-400">
        <span className="font-semibold text-slate-900 dark:text-white block mb-0.5">
          How Opposing Transfers Match in this Corridor:
        </span>
        <p className="text-[11px] leading-relaxed">
          Orders are placed in opposing queues ({activeCorridor.countryA.name} → {activeCorridor.countryB.name} vs. {activeCorridor.countryB.name} → {activeCorridor.countryA.name}).
          When opposing transfer commitments match in value, our Soroban contract executes atomic settlement so money never crosses the physical border.
          Unmatched remainders stay in escrow until an opposing peer matches or until the deadline window closes, triggering the user's fallback policy.
        </p>
      </div>

      {/* Corridor Selector Filter */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <span className="text-slate-400 mr-1">Corridor:</span>
        {corridors.map((c) => {
          const isActive = c.id === selectedCorridorId;
          return (
            <button
              key={c.id}
              onClick={() => setSelectedCorridorId(c.id)}
              className={`px-2.5 py-1 rounded text-xs transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {c.countryA.flag} {c.countryA.name} ⇄ {c.countryB.flag} {c.countryB.name}
            </button>
          );
        })}
      </div>

      {/* Bilateral Order Book Queues */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Outbound Queue */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-white dark:bg-slate-900">
          <div className="flex justify-between items-baseline pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
            <div>
              <span className="font-semibold text-xs text-slate-900 dark:text-white">
                {activeCorridor.countryA.name} → {activeCorridor.countryB.name}
              </span>
              <span className="text-[11px] text-slate-400 block font-mono-numbers">
                Queue: {queueAtoB.length} orders
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs font-mono-numbers font-semibold text-slate-900 dark:text-white">
                ${openVolAtoB.toFixed(2)} USDC
              </span>
              <span className="text-[10px] text-slate-400 block">Pending match</span>
            </div>
          </div>

          <div className="space-y-2">
            {queueAtoB.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No active orders in this queue.
              </div>
            ) : (
              queueAtoB.map((order, idx) => (
                <QueueItem
                  key={order.id}
                  order={order}
                  rank={idx + 1}
                  onSelect={() => onSelectOrder(order)}
                />
              ))
            )}
          </div>
        </div>

        {/* Inbound Queue */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-white dark:bg-slate-900">
          <div className="flex justify-between items-baseline pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
            <div>
              <span className="font-semibold text-xs text-slate-900 dark:text-white">
                {activeCorridor.countryB.name} → {activeCorridor.countryA.name}
              </span>
              <span className="text-[11px] text-slate-400 block font-mono-numbers">
                Queue: {queueBtoA.length} orders
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs font-mono-numbers font-semibold text-slate-900 dark:text-white">
                ${openVolBtoA.toFixed(2)} USDC
              </span>
              <span className="text-[10px] text-slate-400 block">Pending match</span>
            </div>
          </div>

          <div className="space-y-2">
            {queueBtoA.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No active orders in this queue.
              </div>
            ) : (
              queueBtoA.map((order, idx) => (
                <QueueItem
                  key={order.id}
                  order={order}
                  rank={idx + 1}
                  onSelect={() => onSelectOrder(order)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Settlement Result Box (if executed) */}
      {lastBatchResult && (
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 bg-slate-50 dark:bg-slate-900/50 text-xs space-y-3">
          <div className="flex justify-between items-start">
            <div>
              <span className="font-semibold text-slate-900 dark:text-white block">
                Settlement Batch {lastBatchResult.batchId} Executed
              </span>
              <div className="text-slate-500 font-mono-numbers text-[11px] mt-0.5 flex items-center gap-2">
                <span>Stellar Ledger #{lastBatchResult.stellarLedgerSeq}</span>
                <span>·</span>
                <span>Gas: {lastBatchResult.stroopsGasCost} Stroops</span>
                <span>·</span>
                <a
                  href={`https://stellar.expert/explorer/testnet/tx/${lastBatchResult.txHash.replace('0x', '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-700 dark:text-slate-300 hover:underline flex items-center gap-0.5"
                >
                  <span>Tx: {lastBatchResult.txHash.slice(0, 16)}...</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            </div>
            <div className="text-right font-mono-numbers">
              <span className="text-slate-400 text-[10px] block">Netted Volume</span>
              <span className="text-sm font-bold text-slate-900 dark:text-white">
                ${lastBatchResult.totalVolumeNetted.toFixed(2)} USDC
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px]">
            <div>
              <span className="text-slate-500 block mb-1 font-medium">Bilateral Settlements:</span>
              <div className="space-y-1">
                {lastBatchResult.matchedPairs.map((p, i) => (
                  <div key={i} className="font-mono-numbers text-slate-700 dark:text-slate-300">
                    ${p.settledAmount.toFixed(2)}: {p.senderA} pays {p.recipientA} ⇄ {p.senderB} pays {p.recipientB}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <span className="text-slate-500 block mb-1 font-medium">Remainder Dispositions:</span>
              <div className="space-y-1">
                {lastBatchResult.remaindersProcessed.map((r, i) => (
                  <div key={i} className="text-slate-700 dark:text-slate-300">
                    {r.action === 'fallback_direct_payout'
                      ? `Dispatched $${r.amount.toFixed(2)} directly to ${r.recipientOrSender} on Stellar`
                      : `Refunded $${r.amount.toFixed(2)} to ${r.recipientOrSender}`}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Network Activity Log */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3 bg-white dark:bg-slate-900 font-mono text-xs">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800 text-slate-400 text-[11px]">
          <span>Activity Log</span>
          <span>{executionLogs.length} events</span>
        </div>
        <div className="space-y-1 max-h-36 overflow-y-auto text-[11px] text-slate-600 dark:text-slate-400">
          {executionLogs.map((log, i) => (
            <div key={i}>› {log}</div>
          ))}
        </div>
      </div>
    </div>
  );
};

interface QueueItemProps {
  order: TransferOrder;
  rank: number;
  onSelect: () => void;
}

const QueueItem: React.FC<QueueItemProps> = ({ order, rank, onSelect }) => {
  const percent = order.amount > 0 ? (order.matchedAmount / order.amount) * 100 : 0;

  return (
    <div
      onClick={onSelect}
      className="p-3 rounded-md border border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 cursor-pointer bg-slate-50/50 dark:bg-slate-800/40 transition-colors text-xs"
    >
      <div className="flex justify-between items-baseline mb-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-slate-400">#{rank}</span>
          <span className="font-medium text-slate-900 dark:text-white">{order.senderName}</span>
        </div>
        <div className="font-mono-numbers font-semibold text-slate-900 dark:text-white">
          ${order.amount.toFixed(2)}
        </div>
      </div>

      <div className="flex justify-between items-center text-[11px] text-slate-500 font-mono-numbers">
        <span>To: {order.recipientName}</span>
        <span>Rem: ${order.remainingAmount.toFixed(2)}</span>
      </div>

      <div className="mt-2 w-full bg-slate-200 dark:bg-slate-700 h-1 rounded-full overflow-hidden">
        <div className="bg-slate-800 dark:bg-slate-200 h-full" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
};
