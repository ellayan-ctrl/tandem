import React, { useState } from 'react';
import {
  Code,
  Copy,
  Check,
  Cpu,
  Layers,
  ShieldCheck,
  Scale,
  Globe2,
  Calendar,
  Building2,
  HelpCircle,
  FileText,
  ChevronRight,
  ExternalLink,
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
      role: 'Admin Bootstrapper',
      auth: 'admin.require_auth()',
      description: 'Sets the protocol administrator and registers the canonical Stellar USDC token contract address.',
      signature: 'pub fn initialize(env: Env, admin: Address, usdc_token: Address) -> Result<(), EscrowError>',
      storage: 'Instance Storage: [Admin, UsdcToken, NextOrderId]',
      events: 'None',
    },
    {
      name: 'deposit_intent',
      role: 'P2P Sender',
      auth: 'sender.require_auth()',
      description: 'Locks USDC into contract escrow and stores transfer intent with recipient address, corridor, and matching deadline.',
      signature: 'pub fn deposit_intent(env: Env, sender: Address, recipient: Address, from_country: Symbol, to_country: Symbol, amount: i128, deadline_ledgers: u32, policy: RemainderPolicy) -> Result<u64, EscrowError>',
      storage: 'Temporary Storage: [Order(order_id)] with extend_ttl(100, 1000)',
      events: 'Topic: ("intent_deposited", order_id), Data: (amount, deadline)',
    },
    {
      name: 'settle_matched_pair',
      role: 'Matching Relayer',
      auth: 'admin.require_auth()',
      description: 'Atomic bilateral transfer delivering matched USDC directly to opposite recipients across the corridor.',
      signature: 'pub fn settle_matched_pair(env: Env, order_a_id: u64, order_b_id: u64, fill_amount: i128) -> Result<(), EscrowError>',
      storage: 'Updates Order(A) and Order(B) remaining_amount and status',
      events: 'Topic: ("pair_settled", order_a_id, order_b_id), Data: fill_amount',
    },
    {
      name: 'resolve_unmatched_remainder',
      role: 'Permissionless (Post-Deadline)',
      auth: 'No auth required after deadline ledger reached',
      description: 'Enforces the sender preference: dispatches direct Stellar payment to recipient or refunds sender wallet.',
      signature: 'pub fn resolve_unmatched_remainder(env: Env, order_id: u64) -> Result<(), EscrowError>',
      storage: 'Marks order as FallbackExecuted or Refunded, clears remaining balance',
      events: 'Topic: ("remainder_resolved", order_id), Data: remainder_amount',
    },
  ];

  const currentMethod =
    contractMethods.find((m) => m.name === selectedMethod) || contractMethods[1];

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-xs">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-2">
          <span>Stellar Innovation Challenge</span>
          <span>·</span>
          <span>Documentation & Architecture</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Two-Way Street Protocol Specification
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 max-w-3xl leading-relaxed">
          Comprehensive documentation on the bilateral USDC matching engine, Soroban smart contract invariants,
          fiat anchor netting economics, and corridor implementation on Stellar.
        </p>

        {/* Clean Sub-navigation */}
        <div className="flex items-center gap-2 mt-6 pt-5 border-t border-slate-100 dark:border-slate-700 overflow-x-auto">
          {[
            { id: 'overview', label: 'Protocol Overview & Flow', icon: Layers },
            { id: 'contract', label: 'Soroban Smart Contract (Rust)', icon: Code },
            { id: 'economics', label: 'Netting Economics vs. Direct', icon: Scale },
            { id: 'corridors', label: 'Corridor Analysis & Risks', icon: Globe2 },
            { id: 'roadmap', label: '2-Week MVP & B2B Roadmap', icon: Calendar },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as any)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab 1: Overview & Transaction Flow */}
      {activeSubTab === 'overview' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 sm:p-8 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                How Two-Way Matching Works
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                Traditional cross-border remittances move money unidirectionally, requiring local payout agents and anchors to constantly repatriate cash reserves. Two-Way Street pairs opposing flows so value settles locally without physical border crossing.
              </p>
            </div>

            {/* The Alice, Bob, Charlie Scenario Breakdown */}
            <div className="bg-slate-50 dark:bg-slate-900/60 rounded-xl p-5 border border-slate-200 dark:border-slate-700 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Canonical Example Walkthrough
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between font-bold text-slate-900 dark:text-white">
                    <span>Alice (Canada → Kenya)</span>
                    <span className="font-mono text-indigo-600">500 USDC</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">Arrival: T0 (Priority 1)</div>
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                    Policy: Auto-Direct Fallback
                  </div>
                </div>

                <div className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between font-bold text-slate-900 dark:text-white">
                    <span>Bob (Kenya → Canada)</span>
                    <span className="font-mono text-indigo-600">200 USDC</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">Arrival: T1 (Priority 2)</div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                    Policy: Refund to Wallet
                  </div>
                </div>

                <div className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between font-bold text-slate-900 dark:text-white">
                    <span>Charlie (Canada → Kenya)</span>
                    <span className="font-mono text-indigo-600">300 USDC</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">Arrival: T2 (Priority 3)</div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                    Policy: Refund to Wallet
                  </div>
                </div>
              </div>

              <div className="space-y-2.5 pt-2 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex items-start gap-2">
                  <span className="font-bold text-indigo-600 shrink-0">1. Opposite Demand:</span>
                  <span>Canada → Kenya demand is 800 USDC (Alice 500 + Charlie 300). Kenya → Canada demand is 200 USDC (Bob). Total matchable volume is 200 USDC.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-indigo-600 shrink-0">2. Time Priority Matching:</span>
                  <span>Alice arrived first. Bob's 200 USDC matches Alice's first 200 USDC. Bob is 100% filled. Alice is partially filled (200/500, leaving 300 USDC remainder). Charlie remains unmatched.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-bold text-indigo-600 shrink-0">3. Remainder Resolution (600 USDC):</span>
                  <span>
                    Alice's remaining 300 USDC automatically executes a direct Stellar transfer to her Kenyan recipient (David). Charlie's 300 USDC returns safely to Charlie's wallet upon deadline expiration.
                  </span>
                </div>
              </div>
            </div>

            {/* Protocol Pillars */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {ARCHITECTURE_COMPONENTS.map((comp, idx) => (
                <div key={idx} className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-slate-900 dark:text-white">{comp.title}</span>
                    <span className="text-[10px] font-semibold text-slate-500">{comp.tag}</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">{comp.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Soroban Smart Contract */}
      {activeSubTab === 'contract' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Interactive ABI Inspector */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-xs">
            <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1">
              Soroban Contract Endpoints & ABI
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Contract deployed on Stellar Testnet: <code className="font-mono text-indigo-600">CC7X...2WAY</code>
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-4 space-y-2">
                {contractMethods.map((m) => (
                  <button
                    key={m.name}
                    onClick={() => setSelectedMethod(m.name)}
                    className={`w-full text-left p-3 rounded-lg border text-xs font-mono transition-all ${
                      selectedMethod === m.name
                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-950 dark:text-indigo-200 font-bold ring-1 ring-indigo-600'
                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex justify-between">
                      <span>{m.name}()</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                    <div className="text-[10px] text-slate-400 font-sans mt-0.5">{m.role}</div>
                  </button>
                ))}
              </div>

              <div className="lg:col-span-8 bg-slate-50 dark:bg-slate-900/60 p-5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">{currentMethod.name}()</span>
                  <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 rounded">
                    {currentMethod.role}
                  </span>
                </div>
                <p className="text-slate-600 dark:text-slate-300">{currentMethod.description}</p>
                <div>
                  <span className="text-[11px] font-semibold text-slate-400 block mb-1">Signature:</span>
                  <pre className="p-3 bg-slate-900 text-indigo-300 rounded-lg font-mono text-[11px] overflow-x-auto">
                    {currentMethod.signature}
                  </pre>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1 text-[11px]">
                  <div className="p-2.5 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
                    <span className="font-semibold text-slate-400 block mb-0.5">Authorization:</span>
                    <span className="font-mono text-indigo-600 dark:text-indigo-400">{currentMethod.auth}</span>
                  </div>
                  <div className="p-2.5 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
                    <span className="font-semibold text-slate-400 block mb-0.5">Storage Footprint:</span>
                    <span className="text-slate-600 dark:text-slate-300">{currentMethod.storage}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Rust Code Box */}
          <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-slate-200">
                contracts/two_way_escrow/src/lib.rs (Soroban Rust)
              </span>
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
              </button>
            </div>
            <div className="p-4 overflow-x-auto max-h-[500px] text-xs font-mono text-slate-300 leading-relaxed">
              <pre>{SOROBAN_RUST_CONTRACT_CODE}</pre>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Netting Economics vs. Direct Stellar */}
      {activeSubTab === 'economics' && (
        <div className="space-y-6 animate-fadeIn text-xs leading-relaxed">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 sm:p-8 space-y-5">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Rigorous Evaluation: Netting vs. Direct Stellar Transfers
            </h2>

            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
              <span className="font-bold text-slate-900 dark:text-white block">
                The Hard Truth: Stellar L1 is already fast and cheap
              </span>
              <p className="text-slate-600 dark:text-slate-300">
                A native Stellar payment of USDC costs ~0.00001 XLM and settles in 3-5 seconds. Escrowing USDC into a smart contract and waiting for an opposing match actually costs slightly more network gas and introduces waiting latency.
              </p>
            </div>

            <div className="space-y-3 pt-1">
              <span className="font-bold text-slate-900 dark:text-white block">
                Where the Real Value Lies: Local Anchor Netting (SEP-24 / SEP-31)
              </span>
              <p className="text-slate-600 dark:text-slate-300">
                The real expense in cross-border remittances is <strong>not blockchain gas</strong>—it is <strong>local fiat off-ramp fees (1.5% to 4%)</strong> and the cost anchors incur rebalancing cash reserves internationally via correspondent banks (SWIFT).
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                <div className="p-3.5 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-slate-200 dark:border-slate-700">
                  <span className="font-semibold text-slate-900 dark:text-white block mb-1">Unidirectional Flow (Legacy / Direct)</span>
                  <p className="text-slate-500">
                    Canadian anchor builds up excess CAD while Kenyan anchor depletes KES reserves. The Kenyan anchor must buy foreign currency and wire funds internationally to rebalance, charging users high cash-out spreads.
                  </p>
                </div>
                <div className="p-3.5 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                  <span className="font-semibold text-emerald-900 dark:text-emerald-200 block mb-1">Two-Way Matching Flow</span>
                  <p className="text-emerald-800 dark:text-emerald-300/90">
                    Opposing flows cancel out. Both anchors maintain balanced domestic liquidity and avoid international bank wires, allowing them to pass on fee discounts to users.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Corridor Viability & Risks */}
      {activeSubTab === 'corridors' && (
        <div className="space-y-6 animate-fadeIn text-xs">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 sm:p-8 space-y-4">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              High-Viability Corridors & Risk Analysis
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5">
                <span className="font-bold text-slate-900 dark:text-white">🇨🇦 Canada ⇄ 🇰🇪 Kenya</span>
                <p className="text-slate-500">
                  High diaspora remittance from Canada matched against Kenyan remote software contractors, university fees, and coffee trade exporters paying Canadian vendors. Anchors: PayTrie / Kotani Pay.
                </p>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5">
                <span className="font-bold text-slate-900 dark:text-white">🇺🇸 United States ⇄ 🇳🇬 Nigeria</span>
                <p className="text-slate-500">
                  Massive USD/NGN remittance corridor paired with Nigerian tech freelancers and international tuition. Anchors: Yellow Card, Chipper Cash, MoneyGram Access.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <span className="font-bold text-slate-900 dark:text-white block mb-2">Key Operational Risks & Mitigations</span>
              <div className="space-y-2 text-slate-600 dark:text-slate-300">
                <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-slate-200 dark:border-slate-700">
                  <strong className="text-slate-900 dark:text-white">1. Asymmetric Liquidity:</strong> When one direction has 5x more volume, unmatched orders could wait. <em>Mitigation:</em> Pre-configured direct Stellar transfer fallback ensures guaranteed delivery.
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-slate-200 dark:border-slate-700">
                  <strong className="text-slate-900 dark:text-white">2. Travel Rule Compliance:</strong> Matching parties must retain sender records. <em>Mitigation:</em> Senders undergo KYC through participating SEP-31 anchors before escrow authorization.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Roadmap */}
      {activeSubTab === 'roadmap' && (
        <div className="space-y-6 animate-fadeIn text-xs">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 sm:p-8 space-y-5">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              2-Week Student MVP & Enterprise Expansion
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-slate-200 dark:border-slate-700">
                <span className="font-bold text-indigo-600 block mb-1">Days 1–3</span>
                <p className="text-slate-500">Soroban contract in Rust. Test deposits, bilateral settlement, and refund triggers via cargo test.</p>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-slate-200 dark:border-slate-700">
                <span className="font-bold text-indigo-600 block mb-1">Days 4–7</span>
                <p className="text-slate-500">Deterministic TypeScript relayer engine for queue sorting and batch settlement submission.</p>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-slate-200 dark:border-slate-700">
                <span className="font-bold text-indigo-600 block mb-1">Days 8–11</span>
                <p className="text-slate-500">React + Vite frontend with wallet connect, expiry countdowns, and the Alice-Bob-Charlie scenario runner.</p>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-slate-200 dark:border-slate-700">
                <span className="font-bold text-indigo-600 block mb-1">Days 12–14</span>
                <p className="text-slate-500">Testnet deployment, edge-case testing, and 3-minute pitch video on anchor netting economics.</p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
              <span className="font-bold text-slate-900 dark:text-white block mb-1.5">Future B2B Institutional Expansion</span>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                The architecture easily expands to multinational corporate treasury netting: multilateral invoice rings (e.g. Canada pays Kenya, Kenya pays UAE, UAE pays Canada) and automated daily 4:00 PM clearing runs integrated with ERP systems.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
