import { useState, useEffect } from 'react';
import { Search, Clock, RotateCcw, Plus, Zap, HelpCircle, FileText, CheckCircle2, BookOpen } from 'lucide-react';

import { calculateTotalMatchableVolume } from '../utils/matchingEngine';

export const TransactionDashboard = ({
  orders,
  corridors,
  onSelectOrder,
  onInstantSendRemainder,
  onInstantRefundRemainder,
  onNavigateToSend,
  onRunMatching,
  onSimulateOpposingOrder,
  onSimulateOnwardOrder,
  autoMatchEnabled = true,
  onToggleAutoMatch,
  onOpenTour,
  onOpenDemoModal,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  /** Country-pair filter: 'all' or "CountryA|CountryB" (both directions shown). */
  const [selectedPair, setSelectedPair] = useState('all');
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [showExplainer, setShowExplainer] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Routed legs re-route money already counted on the order they came from: don't count it twice.
  const totalVolume = orders.filter((o) => o.transferType !== 'routed').reduce((sum, o) => sum + o.amount, 0);
  const totalMatched = orders.reduce((sum, o) => sum + o.matchedAmount, 0);
  const inFlightEscrow = orders
    .filter((o) => o.status === 'open' || o.status === 'partially_matched')
    .reduce((sum, o) => sum + o.remainingAmount, 0);
  const totalEstimatedSavings = totalMatched * 0.038;

  // Real-time calculation of immediate netting demand
  const { totalMatchable, corridorBreakdown } = calculateTotalMatchableVolume(orders);

  // Every country pair we know about (configured pairs + any pair with orders), both directions combined.
  const pairKey = (x, y) => (x < y ? `${x}|${y}` : `${y}|${x}`);
  const flagOf = {};
  corridors.forEach((c) => {
    flagOf[c.countryA.name] = c.countryA.flag;
    flagOf[c.countryB.name] = c.countryB.flag;
  });
  orders.forEach((o) => {
    flagOf[o.fromCountry] ??= o.fromFlag;
    flagOf[o.toCountry] ??= o.toFlag;
  });
  const pairs = [
    ...new Set([
      ...corridors.map((c) => pairKey(c.countryA.name, c.countryB.name)),
      ...orders.map((o) => pairKey(o.fromCountry, o.toCountry)),
    ]),
  ].sort();

  /** Open (still waiting) volume and order count in one direction. */
  const openFlow = (from, to) => {
    const open = orders.filter(
      (o) =>
        o.fromCountry === from &&
        o.toCountry === to &&
        o.transferType !== 'direct_instant' &&
        (o.status === 'open' || o.status === 'partially_matched'),
    );
    return { amount: open.reduce((sum, o) => sum + o.remainingAmount, 0), count: open.length };
  };
  const pairStats = pairs.map((key) => {
    const [a, b] = key.split('|');
    const ab = openFlow(a, b);
    const ba = openFlow(b, a);
    return { key, a, b, ab, ba, matchable: Math.min(ab.amount, ba.amount) };
  });

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

    if (selectedPair !== 'all') {
      const [a, b] = selectedPair.split('|');
      const inPair = (order.fromCountry === a && order.toCountry === b) || (order.fromCountry === b && order.toCountry === a);
      if (!inPair) return false;
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
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Live Orders & Audit Ledger</h1>
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
                Opposite transfers in{' '}
                {corridorBreakdown.map((b) => `${b.countryA} ⇄ ${b.countryB} ($${b.matchable.toFixed(0)})`).join(', ')} can be paired right
                now.
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
        <div
          data-tour="match-opportunity"
          className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs space-y-2 relative"
        >
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
                  title="Place a real, server-signed testnet order from an anonymous counterparty in the opposite direction"
                >
                  <Plus className="w-3 h-3" />
                  <span>Simulate anonymous opposing order</span>
                </button>
              )}
              {onSimulateOnwardOrder && (
                <button
                  onClick={onSimulateOnwardOrder}
                  className="text-[11px] text-slate-900 dark:text-white font-medium hover:underline flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded"
                  title="Place a real testnet order from your destination country onward to a third country, to see chain routing"
                >
                  <Plus className="w-3 h-3" />
                  <span>Simulate onward order (chain)</span>
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
            Two-Way Street relies on <strong>bilateral opposite-direction demand</strong> between the same two countries. For example, a
            transfer from <strong>Canada → Kenya</strong> only matches when someone else submits a transfer from{' '}
            <strong>Kenya → Canada</strong>. Until a match is found, the money you want to send simply stays where it is: in your bank
            account, or with the agent or mobile wallet (MoneyGram, M-Pesa…) where you paid it in. Nothing is converted to crypto yet.
            Whatever matches is routed locally. When your timer runs out, only the amount that still has to cross the border is converted to
            USDC and sent via Stellar Blockchain, so blockchain and conversion fees apply only to that part.
          </p>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
            <strong>Chain routing:</strong> transfers also connect through a third country. If you send <strong>Canada → United States</strong>{' '}
            and someone sends <strong>United States → European Union</strong>, their US money pays your recipient locally, and your money
            becomes one routed <strong>Canada → European Union</strong> transfer. That routed transfer matches like any other (a European
            Union → Canada sender closes the loop with nothing sent cross-border); otherwise only it goes via Stellar Blockchain. Routes form
            while both timers are still running, and the routed transfer keeps the earlier of the two deadlines.
          </p>
        </div>
      )}

      {/* KPI Row (Clean, flat metrics) */}
      <div data-tour="kpis-row" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <span className="text-[11px] text-slate-500 block mb-0.5">Total Initiated</span>
          <div className="text-lg font-bold font-mono-numbers text-slate-900 dark:text-white">${totalVolume.toFixed(2)}</div>
          <span className="text-[10px] text-slate-400 font-mono-numbers">{orders.length} transfers recorded</span>
        </div>

        <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <span className="text-[11px] text-slate-500 block mb-0.5">Net Cleared</span>
          <div className="text-lg font-bold font-mono-numbers text-slate-900 dark:text-white">${totalMatched.toFixed(2)}</div>
          <span className="text-[10px] text-slate-400 font-mono-numbers">Bilateral match</span>
        </div>

        <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <span className="text-[11px] text-slate-500 block mb-0.5">Waiting for a match</span>
          <div className="text-lg font-bold font-mono-numbers text-slate-900 dark:text-white">${inFlightEscrow.toFixed(2)}</div>
          <span className="text-[10px] text-slate-400 font-mono-numbers">In-flight matching</span>
        </div>

        <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <span className="text-[11px] text-slate-500 block mb-0.5">Estimated Savings</span>
          <div className="text-lg font-bold font-mono-numbers text-slate-900 dark:text-white">${totalEstimatedSavings.toFixed(2)}</div>
          <span className="text-[10px] text-slate-400 font-mono-numbers">vs. standard off-ramp</span>
        </div>
      </div>

      {/* Live supply & demand by direction */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 p-3.5 text-xs space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="font-semibold text-slate-900 dark:text-white">
            {selectedPair === 'all' ? 'Open orders across all countries' : 'Open orders in each direction'}
          </span>
          <span className="text-[10px] text-slate-400">Unmatched amounts still waiting, across all users (anonymous)</span>
        </div>
        {selectedPair === 'all'
          ? (() => {
              // Totals across every country pair in the database.
              const waiting = pairStats.reduce((sum, p) => sum + p.ab.amount + p.ba.amount, 0);
              const count = pairStats.reduce((sum, p) => sum + p.ab.count + p.ba.count, 0);
              const matchable = pairStats.reduce((sum, p) => sum + p.matchable, 0);
              const activePairs = pairStats.filter((p) => p.ab.count + p.ba.count > 0).length;
              const unmatched = Math.max(0, waiting - 2 * matchable);
              return (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                    <span className="text-[11px] text-slate-500 block">Waiting, all directions</span>
                    <span className="text-lg font-bold font-mono-numbers text-slate-900 dark:text-white">${waiting.toFixed(2)}</span>
                    <span className="text-[10px] text-slate-400 block">
                      {count} open order{count === 1 ? '' : 's'} · {activePairs} active country pair{activePairs === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="p-3 rounded-md border-2 border-slate-900 dark:border-white">
                    <span className="text-[11px] text-slate-500 block">Can match right now</span>
                    <span className="text-lg font-bold font-mono-numbers text-slate-900 dark:text-white">${matchable.toFixed(2)}</span>
                    <span className="text-[10px] text-slate-400 block">Paid locally in each country, no crypto conversion</span>
                  </div>
                  <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                    <span className="text-[11px] text-slate-500 block">Would go via Stellar if no one else arrives</span>
                    <span className="text-lg font-bold font-mono-numbers text-slate-900 dark:text-white">${unmatched.toFixed(2)}</span>
                    <span className="text-[10px] text-slate-400 block">Unmatched amounts, converted to USDC when timers run out</span>
                  </div>
                </div>
              );
            })()
          : (() => {
              const p = pairStats.find((x) => x.key === selectedPair);
              if (!p) return null;
              const card = (from, to, flow) => (
                <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                  <span className="text-[11px] text-slate-500 block">
                    {flagOf[from]} {from} → {flagOf[to]} {to}
                  </span>
                  <span className="text-lg font-bold font-mono-numbers text-slate-900 dark:text-white">${flow.amount.toFixed(2)}</span>
                  <span className="text-[10px] text-slate-400 block">
                    {flow.count} open order{flow.count === 1 ? '' : 's'}
                  </span>
                </div>
              );
              return (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {card(p.a, p.b, p.ab)}
                  {card(p.b, p.a, p.ba)}
                  <div className="p-3 rounded-md border-2 border-slate-900 dark:border-white">
                    <span className="text-[11px] text-slate-500 block">Can match right now</span>
                    <span className="text-lg font-bold font-mono-numbers text-slate-900 dark:text-white">${p.matchable.toFixed(2)}</span>
                    <span className="text-[10px] text-slate-400 block">
                      {p.ab.amount === p.ba.amount
                        ? 'Balanced'
                        : `${p.ab.amount > p.ba.amount ? p.a : p.b} side has $${Math.abs(p.ab.amount - p.ba.amount).toFixed(2)} more waiting`}
                    </span>
                  </div>
                </div>
              );
            })()}
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
            value={selectedPair}
            onChange={(e) => setSelectedPair(e.target.value)}
            className="px-2.5 py-1 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md text-slate-700 dark:text-slate-300"
            title="Show both directions between two countries"
          >
            <option value="all">All countries</option>
            {pairs.map((key) => {
              const [x, y] = key.split('|');
              return (
                <option key={key} value={key}>
                  {flagOf[x]} {x} ⇄ {flagOf[y]} {y}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* High-density Data Table */}
      <div
        data-tour="transfers-table"
        className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 overflow-hidden shadow-xs"
      >
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
                  const isPending = order.status === 'open' || order.status === 'partially_matched';
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
                        <div className="font-mono text-[11px] font-semibold text-slate-900 dark:text-white">{order.id}</div>
                        <div className="text-[10px] text-slate-400 font-sans">
                          {new Date(order.createdAt).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                          })}{' '}
                          · {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>

                      <td className="px-4 py-3 font-sans">
                        <span className="text-slate-800 dark:text-slate-200 font-medium">
                          {order.fromFlag} {order.fromCountry} → {order.toFlag} {order.toCountry}
                        </span>
                        {order.transferType === 'routed' && (
                          <span
                            className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300"
                            title="Created by chain routing: two transfers through this country were combined into one"
                          >
                            Routed via {order.routeVia}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 font-sans">
                        <div className="text-slate-900 dark:text-white font-medium">{order.recipientName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{order.recipientAddress.slice(0, 10)}...</div>
                      </td>

                      <td className="px-4 py-3 text-right font-medium text-slate-900 dark:text-white">${order.amount.toFixed(2)}</td>

                      <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                        ${order.matchedAmount.toFixed(2)}
                      </td>

                      <td className="px-4 py-3 text-right text-slate-500">${order.remainingAmount.toFixed(2)}</td>

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
                                <CheckCircle2 className="w-3 h-3" /> Remainder Paid (USDC via Stellar Blockchain)
                              </span>
                            )}
                            {order.status === 'refunded' && (
                              <span className="text-slate-600 dark:text-slate-400 font-medium flex items-center gap-1">
                                <RotateCcw className="w-3 h-3" /> Released
                              </span>
                            )}
                            {order.status === 'payout_pending' && (
                              <span className="text-sky-600 dark:text-sky-400 font-medium flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Paying (USDC via Stellar Blockchain)…
                              </span>
                            )}
                            {order.status === 'payout_failed' && (
                              <span
                                className="text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1"
                                title={order.payoutError}
                              >
                                <RotateCcw className="w-3 h-3" /> Payout failed
                              </span>
                            )}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right font-sans">
                        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                          {isPending && order.remainingAmount > 0 && (
                            <>
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
