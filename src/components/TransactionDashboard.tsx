import React, { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  ArrowRight,
  Clock,
  SendHorizontal,
  RotateCcw,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Plus,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { TransferOrder, Corridor } from '../types';

interface TransactionDashboardProps {
  orders: TransferOrder[];
  corridors: Corridor[];
  onSelectOrder: (order: TransferOrder) => void;
  onInstantSendRemainder: (orderId: string) => void;
  onInstantRefundRemainder: (orderId: string) => void;
  onNavigateToSend: () => void;
}

export const TransactionDashboard: React.FC<TransactionDashboardProps> = ({
  orders,
  corridors,
  onSelectOrder,
  onInstantSendRemainder,
  onInstantRefundRemainder,
  onNavigateToSend,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedCorridor, setSelectedCorridor] = useState<string>('all');
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  // Tick clock for live countdowns
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Compute aggregate metrics
  const totalVolume = orders.reduce((sum, o) => sum + o.amount, 0);
  const totalMatched = orders.reduce((sum, o) => sum + o.matchedAmount, 0);
  const inFlightEscrow = orders
    .filter((o) => o.status === 'open' || o.status === 'partially_matched')
    .reduce((sum, o) => sum + o.remainingAmount, 0);
  const totalEstimatedSavings = totalMatched * 0.038;

  const filteredOrders = orders.filter((order) => {
    // Status filter
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

    // Corridor filter
    if (selectedCorridor !== 'all') {
      const matchCorridor =
        (order.fromCountry.toLowerCase().includes(selectedCorridor) ||
          order.toCountry.toLowerCase().includes(selectedCorridor));
      if (!matchCorridor) return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        order.id.toLowerCase().includes(q) ||
        order.senderName.toLowerCase().includes(q) ||
        order.recipientName.toLowerCase().includes(q) ||
        order.recipientAddress.toLowerCase().includes(q) ||
        order.fromCountry.toLowerCase().includes(q) ||
        order.toCountry.toLowerCase().includes(q);
      if (!match) return false;
    }

    return true;
  });

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Header and Quick CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Transfers Dashboard
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time management of active matching pools, settled remittances, and remainder payouts.
          </p>
        </div>

        <button
          onClick={onNavigateToSend}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors inline-flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Transfer</span>
        </button>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
            Total Volume Initiated
          </span>
          <div className="text-xl font-bold font-mono-numbers text-slate-900 dark:text-white">
            ${totalVolume.toFixed(2)} USDC
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">
            Across {orders.length} cross-border transfers
          </span>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
            Net Volume Cleared
          </span>
          <div className="text-xl font-bold font-mono-numbers text-emerald-600 dark:text-emerald-400">
            ${totalMatched.toFixed(2)} USDC
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">
            Bilateral netting completed
          </span>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
            Active In-Flight Escrow
          </span>
          <div className="text-xl font-bold font-mono-numbers text-indigo-600 dark:text-indigo-400">
            ${inFlightEscrow.toFixed(2)} USDC
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">
            Awaiting peer match or deadline
          </span>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
            Est. Anchor Fees Saved
          </span>
          <div className="text-xl font-bold font-mono-numbers text-emerald-600 dark:text-emerald-400">
            ${totalEstimatedSavings.toFixed(2)}
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">
            ~3.8% saved vs. traditional ramps
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by recipient, order ID, or country..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Status Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-700 rounded-lg">
            {[
              { id: 'all', label: 'All Transfers' },
              { id: 'matching', label: 'Active Matching' },
              { id: 'settled', label: 'Settled' },
              { id: 'fallback', label: 'Direct Sent' },
              { id: 'refunded', label: 'Refunded' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setSelectedStatus(f.id)}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  selectedStatus === f.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Corridor Dropdown */}
          <select
            value={selectedCorridor}
            onChange={(e) => setSelectedCorridor(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 font-medium"
          >
            <option value="all">All Corridors</option>
            <option value="kenya">Canada ⇄ Kenya</option>
            <option value="nigeria">US ⇄ Nigeria</option>
            <option value="argentina">EU ⇄ Argentina</option>
            <option value="philippines">US ⇄ Philippines</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-700 text-slate-500 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3">Order ID / Date</th>
                <th className="px-4 py-3">Corridor</th>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3 text-right">Committed</th>
                <th className="px-4 py-3 text-right">Matched</th>
                <th className="px-4 py-3 text-right">Remainder</th>
                <th className="px-4 py-3">Matching Window & Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 font-mono-numbers">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                    No transfers found matching your filters.
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
                      className="hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer transition-colors"
                    >
                      {/* ID / Time */}
                      <td className="px-4 py-3">
                        <div className="font-sans font-semibold text-slate-900 dark:text-white">
                          {order.id}
                        </div>
                        <div className="text-[10px] text-slate-400 font-sans">
                          {new Date(order.createdAt).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                          })} · {new Date(order.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>

                      {/* Route */}
                      <td className="px-4 py-3 font-sans">
                        <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200 font-medium">
                          <span>{order.fromFlag}</span>
                          <span className="text-slate-400">→</span>
                          <span>{order.toFlag}</span>
                          <span className="text-[11px] text-slate-500">
                            {order.toCountry}
                          </span>
                        </div>
                      </td>

                      {/* Recipient */}
                      <td className="px-4 py-3 font-sans">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {order.recipientName}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono truncate max-w-[120px]">
                          {order.recipientAddress}
                        </div>
                      </td>

                      {/* Committed Amount */}
                      <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">
                        ${order.amount.toFixed(2)}
                      </td>

                      {/* Matched */}
                      <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                        ${order.matchedAmount.toFixed(2)}
                      </td>

                      {/* Remainder */}
                      <td className="px-4 py-3 text-right text-slate-500">
                        ${order.remainingAmount.toFixed(2)}
                      </td>

                      {/* Matching Window & Status */}
                      <td className="px-4 py-3 font-sans">
                        {isPending ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 font-mono-numbers">
                              <Clock className="w-3 h-3 animate-pulse" />
                              <span>{remainingMs > 0 ? formattedTimer : '0m 00s (Expiring)'}</span>
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {order.remainderPolicy === 'direct_stellar_fallback'
                                ? 'Fallback: Auto-Send Direct'
                                : 'Fallback: Refund'}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            <StatusBadge status={order.status} />
                            <div className="text-[10px] text-slate-400">
                              {order.transferType === 'direct_instant' ? 'Instant Transfer' : 'Closed'}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right font-sans">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {isPending && order.remainingAmount > 0 && (
                            <>
                              <button
                                type="button"
                                onClick={() => onInstantSendRemainder(order.id)}
                                title="Send remainder now via Direct Stellar without waiting"
                                className="px-2 py-1 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded text-[11px] font-semibold transition-colors flex items-center gap-1"
                              >
                                <SendHorizontal className="w-3 h-3" />
                                <span>Send Now</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => onInstantRefundRemainder(order.id)}
                                title="Cancel and refund remainder to wallet"
                                className="px-2 py-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded text-[11px] font-semibold transition-colors flex items-center gap-1"
                              >
                                <RotateCcw className="w-3 h-3 text-amber-600" />
                                <span>Refund</span>
                              </button>
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => onSelectOrder(order)}
                            className="p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors"
                            title="View receipt and cryptographic proof"
                          >
                            <ChevronRight className="w-4 h-4" />
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

const StatusBadge: React.FC<{ status: TransferOrder['status'] }> = ({ status }) => {
  switch (status) {
    case 'open':
      return <span className="text-indigo-600 font-semibold text-[11px]">Matching Active</span>;
    case 'partially_matched':
      return <span className="text-amber-600 font-semibold text-[11px]">Partially Filled</span>;
    case 'settled':
      return <span className="text-emerald-600 font-semibold text-[11px]">Fully Settled</span>;
    case 'fallback_executed':
      return <span className="text-cyan-600 font-semibold text-[11px]">Direct Sent</span>;
    case 'refunded':
      return <span className="text-purple-600 font-semibold text-[11px]">Refunded</span>;
    default:
      return <span className="text-slate-500 text-[11px]">{status}</span>;
  }
};
