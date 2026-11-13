import { useState } from "react";
import { ExternalLink } from "lucide-react";

import { TONE, isWaiting, statusOf } from "../data/orderStatus";

const EXPERT = "https://stellar.expert/explorer/testnet";
const usd = (v) =>
  `$${(v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const PAGE = 50;

/**
 * Every transaction in the order book, across all country pairs, newest first. Other people's orders
 * are anonymous (as everywhere in the app); on-chain links appear for your own orders only.
 */
export const GlobalHistory = ({ orders, onSelectOrder }) => {
  const [filter, setFilter] = useState("all");
  const [shown, setShown] = useState(PAGE);

  // Routed legs carry money that is already counted in the order it came from, so totals skip them.
  const originals = orders.filter((o) => o.transferType !== "routed");
  const routedCount = orders.length - originals.length;
  const totalSent = originals.reduce((s, o) => s + o.amount, 0);
  const onChain = orders
    .filter((o) => o.status === "fallback_executed")
    .reduce((s, o) => s + (o.payoutAmount ?? 0), 0);
  const waiting = orders
    .filter(isWaiting)
    .reduce((s, o) => s + (o.remainingAmount || 0), 0);
  const offChainShare =
    totalSent > 0 ? ((totalSent - onChain - waiting) / totalSent) * 100 : 0;

  const list = [...orders]
    .filter((o) =>
      filter === "waiting"
        ? isWaiting(o)
        : filter === "completed"
          ? !isWaiting(o)
          : true,
    )
    .sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <Stat
          label="Transfers"
          value={originals.length.toLocaleString()}
          note={
            routedCount
              ? `plus ${routedCount} routed leg${routedCount === 1 ? "" : "s"}`
              : "no routed legs"
          }
        />
        <Stat
          label="Total sent"
          value={usd(totalSent)}
          note="All transfers, all country pairs"
        />
        <Stat
          label="Sent on-chain (USDC)"
          value={usd(onChain)}
          note="Only unmatched parts, after their timers"
        />
        <Stat
          label="Kept off-chain"
          value={`${Math.max(0, offChainShare).toFixed(1)}%`}
          note={
            waiting > 0
              ? `${usd(waiting)} still waiting for a match`
              : "Matched or routed locally"
          }
        />
      </div>

      <div
        className="flex items-center gap-1 text-xs"
        role="tablist"
        aria-label="Filter transactions"
      >
        {[
          ["all", `All (${orders.length})`],
          ["waiting", `Waiting (${orders.filter(isWaiting).length})`],
          [
            "completed",
            `Completed (${orders.filter((o) => !isWaiting(o)).length})`,
          ],
        ].map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={filter === id}
            onClick={() => {
              setFilter(id);
              setShown(PAGE);
            }}
            className={`px-2.5 py-1 rounded transition-colors ${
              filter === id
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-semibold"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 overflow-x-auto">
        {list.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No transactions yet.
          </div>
        ) : (
          <table className="w-full min-w-[720px] text-xs text-left">
            <thead className="text-slate-500 border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="font-medium px-4 py-2">Date</th>
                <th className="font-medium px-4 py-2">Order</th>
                <th className="font-medium px-4 py-2">From → To</th>
                <th className="font-medium px-4 py-2 text-right">Amount</th>
                <th className="font-medium px-4 py-2 text-right">
                  Matched locally
                </th>
                <th className="font-medium px-4 py-2 text-right">On-chain</th>
                <th className="font-medium px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {list.slice(0, shown).map((o) => {
                const st = statusOf(o.status);
                const mine = !!o.senderAddress; // full details are only sent for your own orders
                return (
                  <tr
                    key={o.id}
                    onClick={() => onSelectOrder(o)}
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                      {new Date(o.createdAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-4 py-2 font-mono whitespace-nowrap">
                      {o.id}
                      {mine && (
                        <span className="ml-1.5 px-1 rounded bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-[9px] font-sans font-semibold">
                          YOU
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {o.fromFlag} {o.fromCountry} → {o.toFlag} {o.toCountry}
                      {o.routeVia && (
                        <span className="text-slate-400">
                          {" "}
                          (routed via {o.routeVia})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-mono-numbers">
                      {usd(o.amount)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono-numbers">
                      {usd(o.matchedAmount)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono-numbers whitespace-nowrap">
                      {o.status === "fallback_executed"
                        ? usd(o.payoutAmount)
                        : "—"}
                      {o.fallbackTxHash && (
                        <a
                          href={`${EXPERT}/tx/${o.fallbackTxHash}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="ml-1 inline-flex align-middle text-sky-700 dark:text-sky-400"
                          title="Open the payout on Stellar Expert"
                          aria-label={`Open ${o.id}'s payout on Stellar Expert`}
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${TONE[st.tone]}`}
                      >
                        {st.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {list.length > shown && (
        <div className="text-center">
          <button
            onClick={() => setShown(shown + PAGE)}
            className="px-3 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Show more ({list.length - shown} left)
          </button>
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        Other people&apos;s transfers are anonymous: you see countries, amounts
        and status only. Payout links on Stellar Expert appear for your own
        transfers (marked YOU).
      </p>
    </div>
  );
};

const Stat = ({ label, value, note }) => (
  <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
    <div className="text-[11px] text-slate-500">{label}</div>
    <div className="text-lg font-bold font-mono-numbers text-slate-900 dark:text-white">
      {value}
    </div>
    <div className="text-[11px] text-slate-400">{note}</div>
  </div>
);
