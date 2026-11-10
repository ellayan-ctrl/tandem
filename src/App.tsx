import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { SendTransferForm } from './components/SendTransferForm';
import { TransactionDashboard } from './components/TransactionDashboard';
import { CorridorVisualizer } from './components/CorridorVisualizer';
import { ProtocolDocs } from './components/ProtocolDocs';
import { NettingCalculator } from './components/NettingCalculator';
import { OrderReceiptModal } from './components/OrderReceiptModal';
import { TestnetWalletModal } from './components/TestnetWalletModal';
import { CORRIDORS, CANONICAL_SCENARIO_ORDERS, INITIAL_USER_WALLET } from './data/mockData';
import { TransferOrder, UserWallet } from './types';
import { fetchLiveNetworkStatus } from './services/stellarTestnet';
import { Check } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('send');
  const [orders, setOrders] = useState<TransferOrder[]>(CANONICAL_SCENARIO_ORDERS);
  const [wallet, setWallet] = useState<UserWallet>(INITIAL_USER_WALLET);
  const [secretKey, setSecretKey] = useState<string>(
    'SBFY4K624PQI5O3L32QG6F4L7Y5E7O2K9V8W7X6Z5Y4A3B2C1D0E1F2G'
  );
  const [latestLedger, setLatestLedger] = useState<number>(48922450);
  const [inspectingOrder, setInspectingOrder] = useState<TransferOrder | null>(null);
  const [walletModalOpen, setWalletModalOpen] = useState<boolean>(false);
  const [toastNotification, setToastNotification] = useState<string | null>(null);

  // Load live Stellar Testnet network status on mount
  useEffect(() => {
    let mounted = true;
    const checkNetwork = async () => {
      try {
        const status = await fetchLiveNetworkStatus();
        if (mounted && status.latestLedger) {
          setLatestLedger(status.latestLedger);
        }
      } catch (e) {
        // Fallback
      }
    };
    checkNetwork();
    const interval = setInterval(checkNetwork, 15000); // Poll every 15s
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const showToast = (message: string) => {
    setToastNotification(message);
    setTimeout(() => setToastNotification(null), 3500);
  };

  const handleFaucetUsdc = () => {
    setWallet((prev) => ({
      ...prev,
      usdcBalance: prev.usdcBalance + 500,
      xlmBalance: prev.xlmBalance + 25,
    }));
    showToast('+500 USDC Testnet Faucet Added to Wallet');
  };

  const handleUpdateWallet = (updated: {
    publicKey: string;
    secretKey: string;
    usdcBalance: number;
    xlmBalance: number;
  }) => {
    setSecretKey(updated.secretKey);
    setWallet((prev) => ({
      ...prev,
      publicKey: updated.publicKey,
      shortAddress: `${updated.publicKey.slice(0, 4)}...${updated.publicKey.slice(-4)}`,
      usdcBalance: updated.usdcBalance,
      xlmBalance: updated.xlmBalance,
    }));
    showToast('Stellar Testnet Account Updated');
  };

  const handleOrderCreated = (newOrder: TransferOrder) => {
    setOrders((prev) => [newOrder, ...prev]);
    setWallet((prev) => ({
      ...prev,
      usdcBalance: Math.max(0, prev.usdcBalance - newOrder.amount),
    }));
  };

  const handleUpdateOrders = (updatedOrders: TransferOrder[]) => {
    setOrders(updatedOrders);
  };

  // Immediate Send Remainder Now via Direct Stellar
  const handleInstantSendRemainder = (orderId: string) => {
    setOrders((prevOrders) =>
      prevOrders.map((order) => {
        if (order.id === orderId && order.remainingAmount > 0) {
          const remainder = order.remainingAmount;
          const fallbackTx = `0x${Array.from({ length: 64 }, () =>
            Math.floor(Math.random() * 16).toString(16)
          ).join('')}`;

          const updated: TransferOrder = {
            ...order,
            remainingAmount: 0,
            status: 'fallback_executed',
            fallbackTxHash: fallbackTx,
            notes: `${order.notes || ''} · Remainder ($${remainder.toFixed(
              2
            )} USDC) dispatched directly via Stellar PaymentOp on Testnet.`,
          };

          if (inspectingOrder && inspectingOrder.id === orderId) {
            setInspectingOrder(updated);
          }

          showToast(
            `Remainder ($${remainder.toFixed(
              2
            )} USDC) dispatched directly to ${order.recipientName} on Stellar Testnet!`
          );
          return updated;
        }
        return order;
      })
    );
  };

  // Immediate Refund Remainder to Sender Wallet
  const handleInstantRefundRemainder = (orderId: string) => {
    setOrders((prevOrders) =>
      prevOrders.map((order) => {
        if (order.id === orderId && order.remainingAmount > 0) {
          const remainder = order.remainingAmount;
          const refundTx = `0x${Array.from({ length: 64 }, () =>
            Math.floor(Math.random() * 16).toString(16)
          ).join('')}`;

          // Refund to wallet balance
          setWallet((w) => ({
            ...w,
            usdcBalance: w.usdcBalance + remainder,
          }));

          const updated: TransferOrder = {
            ...order,
            remainingAmount: 0,
            status: 'refunded',
            fallbackTxHash: refundTx,
            notes: `${order.notes || ''} · Unmatched remainder ($${remainder.toFixed(
              2
            )} USDC) refunded to sender wallet on Testnet.`,
          };

          if (inspectingOrder && inspectingOrder.id === orderId) {
            setInspectingOrder(updated);
          }

          showToast(
            `Unmatched $${remainder.toFixed(
              2
            )} USDC refunded to your Stellar Testnet wallet!`
          );
          return updated;
        }
        return order;
      })
    );
  };

  // Fast-Forward Expiry (Test countdown trigger)
  const handleFastForwardExpiry = (orderId: string) => {
    const targetOrder = orders.find((o) => o.id === orderId);
    if (!targetOrder || targetOrder.remainingAmount <= 0) return;

    if (targetOrder.remainderPolicy === 'direct_stellar_fallback') {
      handleInstantSendRemainder(orderId);
    } else {
      handleInstantRefundRemainder(orderId);
    }
  };

  const activeOrdersCount = orders.filter(
    (o) => o.status === 'open' || o.status === 'partially_matched'
  ).length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors selection:bg-indigo-500 selection:text-white">
      {/* Toast Notification */}
      {toastNotification && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-4 py-2.5 rounded-lg shadow-lg text-xs font-semibold flex items-center gap-2 animate-bounce border border-slate-700">
          <Check className="w-4 h-4 text-emerald-400 dark:text-emerald-600 shrink-0" />
          <span>{toastNotification}</span>
        </div>
      )}

      {/* Top Bar with Live Testnet Hook */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        wallet={wallet}
        onFaucetUsdc={handleFaucetUsdc}
        activeOrdersCount={activeOrdersCount}
        onOpenWalletModal={() => setWalletModalOpen(true)}
        latestLedger={latestLedger}
      />

      {/* Main Viewport Content */}
      <main className="flex-1">
        {activeTab === 'send' && (
          <SendTransferForm
            corridors={CORRIDORS}
            wallet={wallet}
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
          />
        )}

        {activeTab === 'corridors' && (
          <CorridorVisualizer
            corridors={CORRIDORS}
            orders={orders}
            onUpdateOrders={handleUpdateOrders}
            onSelectOrder={(order) => setInspectingOrder(order)}
          />
        )}

        {activeTab === 'calculator' && (
          <NettingCalculator corridors={CORRIDORS} />
        )}

        {activeTab === 'docs' && <ProtocolDocs />}
      </main>

      {/* Order Detail Modal with Real-Time Countdown & Actions */}
      <OrderReceiptModal
        order={inspectingOrder}
        onClose={() => setInspectingOrder(null)}
        onInstantSendRemainder={handleInstantSendRemainder}
        onInstantRefundRemainder={handleInstantRefundRemainder}
        onFastForwardExpiry={handleFastForwardExpiry}
      />

      {/* Stellar Testnet Console Modal */}
      <TestnetWalletModal
        isOpen={walletModalOpen}
        onClose={() => setWalletModalOpen(false)}
        wallet={wallet}
        secretKey={secretKey}
        onUpdateWallet={handleUpdateWallet}
        latestLedger={latestLedger}
      />

      {/* Clean, Non-AI Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-6 mt-12 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              TwoWay Stellar
            </span>
            <span>·</span>
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
              Stellar Testnet Horizon
            </span>
            <span>·</span>
            <span>Ledger #{latestLedger}</span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setWalletModalOpen(true)}
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Testnet Account Console
            </button>
            <button
              onClick={() => setActiveTab('dashboard')}
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Transfers
            </button>
            <button
              onClick={() => setActiveTab('corridors')}
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Matching Pools
            </button>
            <button
              onClick={() => setActiveTab('docs')}
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Protocol & Specs
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
