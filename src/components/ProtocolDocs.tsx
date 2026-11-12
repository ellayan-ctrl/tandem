import React, { useState } from 'react';
import {
  Code,
  Copy,
  Check,
  ChevronRight,
} from 'lucide-react';
import { SOROBAN_RUST_CONTRACT_CODE, ARCHITECTURE_COMPONENTS } from '../utils/sorobanCode';

export const ProtocolDocs: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'contract' | 'economics' | 'corridors' | 'roadmap'>('overview');
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [selectedMethod, setSelectedMethod] = useState<string>('deposit_intent');

  const handleCopyCode = () => {
    navigator.clipboard.writeText(SOROBAN_RUST_CONTRACT_CODE);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const contractMethods = [
    {
      name: 'initialize',
      role: 'Admin',
      auth: 'admin.require_auth()',
      description: 'Sets protocol admin and canonical Stellar USDC token address.',
      signature: 'pub fn initialize(env: Env, admin: Address, usdc_token: Address) -> Result<(), EscrowError>',
      storage: 'Instance Storage: [Admin, UsdcToken, NextOrderId]',
    },
    {
      name: 'deposit_intent',
      role: 'Sender',
      auth: 'sender.require_auth()',
      description: 'Locks USDC in escrow and registers cross-border transfer intent with matching deadline.',
      signature: 'pub fn deposit_intent(env: Env, sender: Address, recipient: Address, from_country: Symbol, to_country: Symbol, amount: i128, deadline_ledgers: u32, policy: RemainderPolicy) -> Result<u64, EscrowError>',
      storage: 'Temporary Storage: [Order(order_id)] with extend_ttl(100, 1000)',
    },
    {
      name: 'settle_matched_pair',
      role: 'Relayer',
      auth: 'admin.require_auth()',
      description: 'Executes atomic bilateral settlement delivering matched funds directly to opposite recipients.',
      signature: 'pub fn settle_matched_pair(env: Env, order_a_id: u64, order_b_id: u64, fill_amount: i128) -> Result<(), EscrowError>',
      storage: 'Updates Order(A) and Order(B) remaining_amount and status',
    },
    {
      name: 'resolve_unmatched_remainder',
      role: 'Permissionless (Post-Deadline)',
      auth: 'None (after deadline_ledger reached)',
      description: 'Executes user remainder policy: dispatches direct Stellar payment or refunds sender wallet.',
      signature: 'pub fn resolve_unmatched_remainder(env: Env, order_id: u64) -> Result<(), EscrowError>',
      storage: 'Marks order as FallbackExecuted or Refunded',
    },
  ];

  const currentMethod =
    contractMethods.find((m) => m.name === selectedMethod) || contractMethods[1];

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
          Protocol & Specifications
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          Architecture, Soroban smart contract source code, and economic analysis.
        </p>
      </div>

      {/* Clean Navigation Bar */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 text-xs overflow-x-auto gap-4">
        {[
          { id: 'overview', label: 'Overview & Flow' },
          { id: 'contract', label: 'Soroban Contract' },
          { id: 'economics', label: 'Netting Economics' },
          { id: 'corridors', label: 'Corridors & Risks' },
          { id: 'roadmap', label: 'Hackathon Roadmap' },
        ].map((tab) => {
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`pb-2.5 font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                isActive
                  ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Pane 1: Overview */}
      {activeSubTab === 'overview' && (
        <div className="space-y-6 text-xs leading-relaxed">
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-5 bg-white dark:bg-slate-900 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Two-Way Street Matching Mechanism
            </h2>
            <p className="text-slate-600 dark:text-slate-400">
              Traditional cross-border remittances push money unidirectionally across borders, forcing destination anchors to constantly rebalance bank accounts via expensive SWIFT wires. Two-Way Street pairs opposite-direction transfers within a corridor so value is cleared domestically.
            </p>

            <div className="p-3.5 border border-slate-200 dark:border-slate-800 rounded bg-slate-50 dark:bg-slate-800/40 space-y-2">
              <span className="font-semibold text-slate-900 dark:text-white block">
                Canonical Scenario (Alice, Bob, Charlie)
              </span>
              <ul className="space-y-1 text-slate-600 dark:text-slate-400 list-disc pl-4 font-mono-numbers">
                <li><strong>Alice</strong> (Canada → Kenya): $500 USDC (Priority 1, Fallback: Direct Stellar)</li>
                <li><strong>Bob</strong> (Kenya → Canada): $200 USDC (Priority 2, Fallback: Refund)</li>
                <li><strong>Charlie</strong> (Canada → Kenya): $300 USDC (Priority 3, Fallback: Refund)</li>
              </ul>
              <p className="text-slate-600 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-800 font-sans">
                <strong>Execution:</strong> Canada → Kenya demand ($800) meets Kenya → Canada demand ($200). Alice arrived first, so Bob's $200 pairs with Alice's first $200. Bob is 100% settled. Alice is partially filled ($200/$500). When the matching window closes, Alice's remaining $300 dispatches directly to her Kenyan recipient via Stellar, while Charlie's $300 refunds to his wallet.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              {ARCHITECTURE_COMPONENTS.map((c, i) => (
                <div key={i} className="p-3 border border-slate-200 dark:border-slate-800 rounded">
                  <div className="font-semibold text-slate-900 dark:text-white">{c.title}</div>
                  <p className="text-slate-500 mt-1">{c.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Pane 2: Soroban Smart Contract */}
      {activeSubTab === 'contract' && (
        <div className="space-y-6 text-xs">
          {/* Methods */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-5 bg-white dark:bg-slate-900 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Soroban Contract Interface (ABI)
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-4 space-y-1">
                {contractMethods.map((m) => (
                  <button
                    key={m.name}
                    onClick={() => setSelectedMethod(m.name)}
                    className={`w-full text-left p-2 rounded text-xs font-mono transition-colors ${
                      selectedMethod === m.name
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {m.name}()
                  </button>
                ))}
              </div>

              <div className="md:col-span-8 p-3.5 border border-slate-200 dark:border-slate-800 rounded bg-slate-50 dark:bg-slate-800/40 space-y-2">
                <div className="flex justify-between items-baseline font-mono text-slate-900 dark:text-white font-semibold">
                  <span>{currentMethod.name}()</span>
                  <span className="text-[11px] font-sans text-slate-500">{currentMethod.role}</span>
                </div>
                <p className="text-slate-600 dark:text-slate-400">{currentMethod.description}</p>
                <pre className="p-2.5 bg-slate-900 text-slate-200 rounded font-mono text-[11px] overflow-x-auto">
                  {currentMethod.signature}
                </pre>
                <div className="text-[11px] text-slate-500 font-mono">
                  Storage: {currentMethod.storage}
                </div>
              </div>
            </div>
          </div>

          {/* Rust Code Box */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-950 overflow-hidden text-xs">
            <div className="p-3 bg-slate-900 border-b border-slate-800 flex justify-between items-center text-slate-300 font-mono">
              <span>contracts/two_way_escrow/src/lib.rs</span>
              <button
                onClick={handleCopyCode}
                className="px-2.5 py-1 text-xs rounded border border-slate-700 hover:bg-slate-800 text-slate-200"
              >
                {copiedCode ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="p-4 text-slate-300 font-mono overflow-x-auto max-h-[450px] leading-relaxed">
              {SOROBAN_RUST_CONTRACT_CODE}
            </pre>
          </div>
        </div>
      )}

      {/* Pane 3: Economics */}
      {activeSubTab === 'economics' && (
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-5 bg-white dark:bg-slate-900 text-xs leading-relaxed space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Matching vs. Direct Stellar Transfers
          </h2>
          <p className="text-slate-600 dark:text-slate-400">
            A native Stellar USDC transfer costs $0.00001 and completes in 3-5 seconds. Why match transfers?
          </p>

          <div className="space-y-3 pt-2">
            <div>
              <strong className="text-slate-900 dark:text-white block">1. The Fiat Anchor Problem (SEP-24/31)</strong>
              <p className="text-slate-500 mt-0.5">
                The bottleneck in remittance is not the blockchain—it is the local cash-out anchor in Kenya or Canada. If flows are strictly one-way, anchors run out of local currency reserves and must execute international bank wires to rebalance, charging users 2% to 4% in FX spreads.
              </p>
            </div>

            <div>
              <strong className="text-slate-900 dark:text-white block">2. Domestic Netting</strong>
              <p className="text-slate-500 mt-0.5">
                When two opposing $200 transfers cancel out, Canadian dollars stay in Canada and Kenyan shillings stay in Kenya. Anchors clear balances domestically without SWIFT wires, passing on lower spreads.
              </p>
            </div>

            <div>
              <strong className="text-slate-900 dark:text-white block">3. Guaranteed Fallback</strong>
              <p className="text-slate-500 mt-0.5">
                To eliminate counterparty delay, if an opposing peer does not match before the deadline, our contract executes an immediate direct Stellar payment. Users get netting savings if matched, and zero delays if unmatched.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Pane 4: Corridors & Risks */}
      {activeSubTab === 'corridors' && (
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-5 bg-white dark:bg-slate-900 text-xs leading-relaxed space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Corridors & Operational Risks
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 border border-slate-200 dark:border-slate-800 rounded">
              <span className="font-semibold text-slate-900 dark:text-white block">Canada ⇄ Kenya</span>
              <p className="text-slate-500 mt-0.5">
                Diaspora remittances from Canada paired against Nairobi tech contractors and coffee/tea exporters paying Canadian vendors. Anchors: PayTrie / Kotani Pay.
              </p>
            </div>

            <div className="p-3 border border-slate-200 dark:border-slate-800 rounded">
              <span className="font-semibold text-slate-900 dark:text-white block">United States ⇄ Nigeria</span>
              <p className="text-slate-500 mt-0.5">
                Remittances paired with Nigerian remote engineers and university tuition. Anchors: Yellow Card, Chipper Cash.
              </p>
            </div>
          </div>

          <div className="pt-2 space-y-2">
            <span className="font-semibold text-slate-900 dark:text-white block">Risk Mitigations</span>
            <div className="text-slate-600 dark:text-slate-400">
              <strong>Asymmetry:</strong> Automated direct Stellar fallback ensures users are never stranded.
            </div>
            <div className="text-slate-600 dark:text-slate-400">
              <strong>Compliance:</strong> Local anchors execute KYC under SEP-31 before authorizing escrow deposits.
            </div>
          </div>
        </div>
      )}

      {/* Pane 5: Roadmap */}
      {activeSubTab === 'roadmap' && (
        <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-5 bg-white dark:bg-slate-900 text-xs leading-relaxed space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            2-Week Hackathon Blueprint & B2B Vision
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="p-2.5 border border-slate-200 dark:border-slate-800 rounded">
              <span className="font-mono text-slate-400 block mb-0.5">Days 1–3</span>
              <span className="font-semibold text-slate-900 dark:text-white">Soroban Contract</span>
              <p className="text-slate-500 mt-1">Escrow and settlement logic tested via cargo test.</p>
            </div>

            <div className="p-2.5 border border-slate-200 dark:border-slate-800 rounded">
              <span className="font-mono text-slate-400 block mb-0.5">Days 4–7</span>
              <span className="font-semibold text-slate-900 dark:text-white">Relayer Engine</span>
              <p className="text-slate-500 mt-1">Deterministic matching service polling contract events.</p>
            </div>

            <div className="p-2.5 border border-slate-200 dark:border-slate-800 rounded">
              <span className="font-mono text-slate-400 block mb-0.5">Days 8–11</span>
              <span className="font-semibold text-slate-900 dark:text-white">Web Portal</span>
              <p className="text-slate-500 mt-1">Transfer flow, order book, and Stellar testnet wallet.</p>
            </div>

            <div className="p-2.5 border border-slate-200 dark:border-slate-800 rounded">
              <span className="font-mono text-slate-400 block mb-0.5">Days 12–14</span>
              <span className="font-semibold text-slate-900 dark:text-white">Submission</span>
              <p className="text-slate-500 mt-1">Testnet deployment and video presentation.</p>
            </div>
          </div>

          <div className="pt-2 text-slate-600 dark:text-slate-400">
            <strong className="text-slate-900 dark:text-white block mb-0.5">B2B Expansion:</strong>
            The same architecture extends to multilateral clearing rings (e.g. Canada pays Kenya, Kenya pays UAE, UAE pays Canada) and automated daily 4:00 PM clearing runs integrated with enterprise ERPs.
          </div>
        </div>
      )}
    </div>
  );
};
