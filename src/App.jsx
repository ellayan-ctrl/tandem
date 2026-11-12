import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { SendTransferForm } from './components/SendTransferForm';
import { TransactionDashboard } from './components/TransactionDashboard';
import { CorridorVisualizer } from './components/CorridorVisualizer';
import { ProtocolDocs } from './components/ProtocolDocs';
import { NettingCalculator } from './components/NettingCalculator';
import { OrderReceiptModal } from './components/OrderReceiptModal';
import { BankAccountModal } from './components/BankAccountModal';
import { GuidedTourModal } from './components/GuidedTourModal';
import { CORRIDORS } from './data/mockData';

import { fetchLiveNetworkStatus } from './services/stellarTestnet';
import { api, getAccountToken, setAccountToken } from './services/api';
import { Check } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('send');
  const [orders, setOrders] = useState([]);
  // The linked bank account (simulated) with its invisible, server-held Stellar wallet.
  const [account, setAccount] = useState(null);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountModalAdding, setAccountModalAdding] = useState(false);
  const [accountModalKind, setAccountModalKind] = useState(null);
  const openAccountModal = (adding = false, kind = null) => {
    setAccountModalAdding(adding);
    setAccountModalKind(kind);
    setAccountModalOpen(true);
  };
  const [latestLedger, setLatestLedger] = useState(0);
  const [inspectingOrder, setInspectingOrder] = useState(null);
  const [toastNotification, setToastNotification] = useState(null);
  const [autoMatchEnabled, setAutoMatchEnabled] = useState(true);
  const [tourOpen, setTourOpen] = useState(() => {
    try {
      return localStorage.getItem('twoway_tour_seen') !== 'true';
    } catch {
      return false;
    }
  });

  // Live Stellar testnet ledger (footer / receipts)
  useEffect(() => {
    let mounted = true;
    const checkNetwork = async () => {
      try {
        const status = await fetchLiveNetworkStatus();
        if (mounted && status.latestLedger) setLatestLedger(status.latestLedger);
      } catch {
        // keep last value
      }
    };
    checkNetwork();
    const interval = setInterval(checkNetwork, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const refreshAccount = async () => {
    if (!getAccountToken()) return setAccount(null);
    try {
      setAccount(await api.me());
    } catch {
      setAccountToken(null); // token no longer valid (e.g. database reset)
      setAccount(null);
    }
  };

  // Orders live in the server's SQLite book; the server's worker resolves expiries
  // (unmatched remainder -> USDC via Stellar). Poll so the UI reflects worker progress.
  const refreshOrders = async () => {
    try {
      const fresh = await api.orders();
      setOrders(fresh);
      setInspectingOrder((cur) => (cur ? (fresh.find((o) => o.id === cur.id) ?? cur) : cur));
    } catch (e) {
      console.warn('Could not load orders from server:', e);
    }
  };

  useEffect(() => {
    refreshAccount().then(refreshOrders);
    const timer = setInterval(() => {
      refreshOrders();
      refreshAccount();
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const showToast = (message) => {
    setToastNotification(message);
    setTimeout(() => setToastNotification(null), 4000);
  };

  const handleLinkBank = async (input) => {
    const res = await api.linkBank(input);
    setAccountToken(res.token);
    setAccount(res.account);
    await refreshOrders();
    showToast(`${res.account.bank.name} linked. You can send now.`);
  };

  const handleUnlink = () => {
    setAccountToken(null);
    setAccount(null);
    setOrders([]);
    showToast('Signed out of this bank account on this device.');
  };

  const handleSandboxDeposit = async (bankId, amount) => {
    setAccount(await api.deposit(bankId, amount));
    showToast('Sandbox funds added to that bank account.');
  };

  const handleAddBank = async (input) => {
    const updated = await api.addBank(input);
    setAccount(updated);
    showToast(`${updated.banks[updated.banks.length - 1].name} linked to your account.`);
  };

  const netted = (batches) => batches.reduce((s, b) => s + b.totalVolumeNetted, 0);

  // Called when a user submits a transfer. Throws on failure so the form can show the error.
  const handleOrderCreated = async (newOrder) => {
    if (!account) {
      openAccountModal();
      throw new Error('Link your bank account before sending.');
    }
    const direct = newOrder.transferType === 'direct_instant';
    const res = await api.placeOrder({
      recipientName: newOrder.recipientName,
      recipientAddress: newOrder.recipientAddress.match(/G[A-Z2-7]{55}/)?.[0] ?? newOrder.recipientAddress.trim(),
      fromCountry: newOrder.fromCountry,
      toCountry: newOrder.toCountry,
      fromFlag: newOrder.fromFlag,
      toFlag: newOrder.toFlag,
      amount: newOrder.amount.toFixed(7),
      deadlineMinutes: Math.max(1, newOrder.deadlineMinutes),
      bankId: newOrder.bankId,
      remainderBankId: newOrder.remainderBankId,
      transferType: direct ? 'direct_instant' : 'matched_pool',
      autoMatch: autoMatchEnabled,
      notes: newOrder.notes,
    });
    setAccount(res.account);
    await refreshOrders();
    setInspectingOrder(res.order);
    const v = netted(res.batches);
    showToast(
      direct
        ? `Converting $${newOrder.amount.toFixed(2)} from your bank to USDC and sending it via Stellar Blockchain...`
        : v > 0
          ? `Matched $${v.toFixed(2)} right away (settled locally). Only the unmatched part will be sent as USDC via Stellar Blockchain.`
          : `Order ${res.order.id} is waiting for a match. Nothing has been taken from your account yet.`,
    );
    return res.order;
  };

  const handleOrdersChanged = (updated) => setOrders(updated);

  const withToast = async (fn, okMessage) => {
    try {
      await fn();
      if (okMessage) showToast(okMessage);
    } catch (e) {
      showToast(`Error: ${e.message}`);
    } finally {
      await Promise.all([refreshOrders(), refreshAccount()]);
    }
  };

  // Run matching on all corridors with two-way volume (server-side, SQLite)
  const handleRunGlobalMatching = () =>
    withToast(async () => {
      const res = await api.match();
      setOrders(res.orders);
      showToast(
        res.totalVolumeNetted > 0
          ? `Matched and netted $${res.totalVolumeNetted.toFixed(2)} locally across all country pairs.`
          : 'No opposite-direction transfers to match between any countries right now.',
      );
    });

  // Demo: an anonymous counterparty order opposite your latest open order (60% of it).
  const handleSimulateOpposingOrder = () =>
    withToast(async () => {
      const mine = orders.find(
        (o) =>
          !!account &&
          o.senderAddress === account.wallet.publicKey &&
          o.transferType !== 'direct_instant' &&
          (o.status === 'open' || o.status === 'partially_matched'),
      );
      const fromCountry = mine?.toCountry ?? 'Kenya';
      const toCountry = mine?.fromCountry ?? 'Canada';
      const amount = mine ? Math.max(0.01, Math.round(mine.remainingAmount * 60) / 100) : 2;
      showToast('Placing an anonymous counterparty order (first time sets up demo accounts, ~10s)...');
      const { batches } = await api.counterpartyOrder({
        fromCountry,
        toCountry,
        fromFlag: mine?.toFlag,
        toFlag: mine?.fromFlag,
        amount: amount.toFixed(2),
      });
      // Show OUR order with its new match; the counterparty stays anonymous.
      if (mine) {
        const fresh = await api.orders();
        setOrders(fresh);
        setInspectingOrder(fresh.find((o) => o.id === mine.id) ?? null);
      }
      const v = netted(batches);
      showToast(
        v > 0
          ? `Matched $${v.toFixed(2)} with an anonymous ${fromCountry} → ${toCountry} sender (settled locally).`
          : `Anonymous ${fromCountry} → ${toCountry} order added to the queue.`,
      );
    });

  // Demo: an anonymous order ONWARD from your destination to a third country (e.g. you send Canada -> Kenya,
  // someone sends Kenya -> Nigeria). Chain routing pays your recipient locally in Kenya and turns your money
  // into one routed Canada -> Nigeria transfer, matched locally if possible, otherwise sent via Stellar at expiry.
  const handleSimulateOnwardOrder = () =>
    withToast(async () => {
      const mine = orders.find(
        (o) =>
          !!account &&
          o.senderAddress === account.wallet.publicKey &&
          o.transferType === 'matched_pool' &&
          (o.status === 'open' || o.status === 'partially_matched'),
      );
      if (!mine) throw new Error('Place a Transfer Matching order first, then simulate an onward order from its destination.');
      const flagOf = {};
      CORRIDORS.forEach((c) => {
        flagOf[c.countryA.name] = c.countryA.flag;
        flagOf[c.countryB.name] = c.countryB.flag;
      });
      const third = ['Nigeria', 'Philippines', 'Kenya', 'Canada', 'Argentina'].find((c) => c !== mine.fromCountry && c !== mine.toCountry);
      const amount = Math.max(0.01, Math.round(mine.remainingAmount * 60) / 100);
      showToast(`Placing an anonymous ${mine.toCountry} → ${third} order (first time sets up demo accounts, ~10s)...`);
      const { batches } = await api.counterpartyOrder({
        fromCountry: mine.toCountry,
        toCountry: third,
        fromFlag: mine.toFlag,
        toFlag: flagOf[third],
        amount: amount.toFixed(2),
      });
      const fresh = await api.orders();
      setOrders(fresh);
      setInspectingOrder(fresh.find((o) => o.id === mine.id) ?? null);
      const routed = batches.filter((b) => b.settlementMethod === 'chain_routing').reduce((s, b) => s + b.totalVolumeNetted, 0);
      showToast(
        routed > 0
          ? `Routed $${routed.toFixed(2)}: your recipient in ${mine.toCountry} is paid locally, and that part of your money now goes ${mine.fromCountry} → ${third} instead.`
          : `Anonymous ${mine.toCountry} → ${third} order added to the queue (no route possible: check the timers).`,
      );
    });

  // Send the unmatched remainder now: bank -> USDC -> recipient via Stellar Blockchain.
  const handleInstantSendRemainder = (orderId) =>
    withToast(async () => {
      showToast('Converting the unmatched amount to USDC and sending it via Stellar Blockchain...');
      const o = await api.resolve(orderId, 'payout');
      if (o.status === 'payout_failed') throw new Error(o.payoutError || 'Payout failed');
      setInspectingOrder(o);
      showToast(`$${(o.payoutAmount ?? 0).toFixed(2)} sent to ${o.recipientName} as USDC via Stellar Blockchain.`);
    });

  // Cancel the unmatched remainder: nothing is charged.
  const handleInstantRefundRemainder = (orderId) =>
    withToast(async () => {
      const o = await api.resolve(orderId, 'release');
      setInspectingOrder(o);
      showToast(`Unmatched $${(o.payoutAmount ?? 0).toFixed(2)} cancelled. Nothing was taken from your account.`);
    });

  // Close the matching window now; the server worker sends the remainder.
  const handleFastForwardExpiry = (orderId) =>
    withToast(async () => {
      const o = await api.expire(orderId);
      setInspectingOrder(o);
    }, 'Matching window closed. Sending the unmatched amount...');

  const activeOrdersCount = orders.filter((o) => o.status === 'open' || o.status === 'partially_matched').length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors selection:bg-slate-900 selection:text-white">
      {/* Toast Notification */}
      {toastNotification && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-4 py-2.5 rounded-lg shadow-xl text-xs font-semibold flex items-center gap-2 border border-slate-700 dark:border-slate-300 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Check className="w-4 h-4 text-emerald-400 dark:text-emerald-600 shrink-0" />
          <span>{toastNotification}</span>
        </div>
      )}

      {/* Top Bar with Live Testnet Hook */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        account={account}
        activeOrdersCount={activeOrdersCount}
        onOpenAccountModal={() => openAccountModal()}
        latestLedger={latestLedger}
        onOpenTour={() => setTourOpen(true)}
      />

      {/* Main Viewport Content */}
      <main className="flex-1">
        {activeTab === 'send' && (
          <SendTransferForm
            corridors={CORRIDORS}
            account={account}
            onLinkBank={(kind) => openAccountModal(true, kind ?? null)}
            onOrderCreated={handleOrderCreated}
            onNavigateToDashboard={() => setActiveTab('dashboard')}
          />
        )}

        {activeTab === 'dashboard' && (
          <TransactionDashboard
            orders={orders}
            corridors={CORRIDORS}
            onSelectOrder={(order) => setInspectingOrder(order)}
            onInstantSendRemainder={handleInstantSendRemainder}
            onInstantRefundRemainder={handleInstantRefundRemainder}
            onNavigateToSend={() => setActiveTab('send')}
            onRunMatching={handleRunGlobalMatching}
            onSimulateOpposingOrder={handleSimulateOpposingOrder}
            onSimulateOnwardOrder={handleSimulateOnwardOrder}
            autoMatchEnabled={autoMatchEnabled}
            onToggleAutoMatch={() => setAutoMatchEnabled(!autoMatchEnabled)}
            onOpenTour={() => setTourOpen(true)}
          />
        )}

        {activeTab === 'corridors' && (
          <CorridorVisualizer
            corridors={CORRIDORS}
            orders={orders}
            onOrdersChanged={handleOrdersChanged}
            onShowToast={showToast}
            onSelectOrder={(order) => setInspectingOrder(order)}
          />
        )}

        {activeTab === 'calculator' && <NettingCalculator corridors={CORRIDORS} />}

        {activeTab === 'docs' && <ProtocolDocs />}
      </main>

      {/* Settlement Audit Report & Receipt Modal */}
      <OrderReceiptModal
        order={inspectingOrder}
        onClose={() => setInspectingOrder(null)}
        onInstantSendRemainder={handleInstantSendRemainder}
        onInstantRefundRemainder={handleInstantRefundRemainder}
        onFastForwardExpiry={handleFastForwardExpiry}
        latestLedger={latestLedger}
      />

      {/* Guided In-Page Spotlight Walkthrough */}
      <GuidedTourModal
        isOpen={tourOpen}
        onClose={() => setTourOpen(false)}
        onNavigateToTab={(tab) => setActiveTab(tab)}
        activeTab={activeTab}
      />

      {/* Linked bank account (simulated) + invisible Stellar wallet */}
      <BankAccountModal
        isOpen={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
        account={account}
        onLink={handleLinkBank}
        onUnlink={handleUnlink}
        onSandboxDeposit={handleSandboxDeposit}
        startAdding={accountModalAdding}
        startKind={accountModalKind}
        onAddBank={handleAddBank}
      />

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-6 mt-12 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800 dark:text-slate-200">TwoWay</span>
            <span>·</span>
            <span>Stellar Testnet</span>
            <span>·</span>
            <span className="font-mono-numbers">Ledger #{latestLedger}</span>
            <span>·</span>
            <button onClick={() => setTourOpen(true)} className="hover:underline text-slate-600 dark:text-slate-400">
              Interactive Tour
            </button>
          </div>

          <div className="flex items-center gap-4">
            <button onClick={() => openAccountModal()} className="hover:text-slate-900 dark:hover:text-white transition-colors">
              Bank Account
            </button>
            <button onClick={() => setActiveTab('dashboard')} className="hover:text-slate-900 dark:hover:text-white transition-colors">
              Live Orders
            </button>
            <button onClick={() => setActiveTab('corridors')} className="hover:text-slate-900 dark:hover:text-white transition-colors">
              Transaction History
            </button>
            <button onClick={() => setActiveTab('docs')} className="hover:text-slate-900 dark:hover:text-white transition-colors">
              Documentation
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
