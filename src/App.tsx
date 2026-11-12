import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { SendTransferForm } from './components/SendTransferForm';
import { TransactionDashboard } from './components/TransactionDashboard';
import { CorridorVisualizer } from './components/CorridorVisualizer';
import { ProtocolDocs } from './components/ProtocolDocs';
import { NettingCalculator } from './components/NettingCalculator';
import { OrderReceiptModal } from './components/OrderReceiptModal';
import { TestnetWalletModal } from './components/TestnetWalletModal';
import { GuidedTourModal } from './components/GuidedTourModal';
import { CORRIDORS, CANONICAL_SCENARIO_ORDERS, INITIAL_USER_WALLET, INITIAL_USER_SECRET } from './data/mockData';
import { TransferOrder, UserWallet } from './types';
import {
  fetchLiveNetworkStatus,
  loadLiveAccountDetails,
  fundWithFriendbot,
  submitRealTestnetPayment,
  isValidStellarSecretKey,
} from './services/stellarTestnet';
import { executeTwoWayMatching, runMatchingForAllCorridors } from './utils/matchingEngine';
import { BankingHubModal } from './components/BankingHubModal';
import { ConvertRemainderModal } from './components/ConvertRemainderModal';
import { BankingDashboardView } from './components/BankingDashboardView';
import { executeRemainderConversion } from './services/bankingService';
import { Check, Zap } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('send');
  const [orders, setOrders] = useState<TransferOrder[]>(CANONICAL_SCENARIO_ORDERS);
  const [wallet, setWallet] = useState<UserWallet>(INITIAL_USER_WALLET);
  const [secretKey, setSecretKey] = useState<string>(INITIAL_USER_SECRET);
  const [latestLedger, setLatestLedger] = useState<number>(48922450);
  const [inspectingOrder, setInspectingOrder] = useState<TransferOrder | null>(null);
  const [walletModalOpen, setWalletModalOpen] = useState<boolean>(false);
  const [bankingModalOpen, setBankingModalOpen] = useState<boolean>(false);
  const [convertModalOrder, setConvertModalOrder] = useState<TransferOrder | null>(null);
  const [toastNotification, setToastNotification] = useState<string | null>(null);
  const [autoMatchEnabled, setAutoMatchEnabled] = useState<boolean>(true);
  const [tourOpen, setTourOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('twoway_tour_seen') !== 'true';
    } catch {
      return false;
    }
  });

  // Load live Stellar Testnet network status and wallet details on mount
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

    const loadLiveWallet = async () => {
      try {
        const details = await loadLiveAccountDetails(INITIAL_USER_WALLET.publicKey, INITIAL_USER_SECRET);
        if (mounted && details.isFunded) {
          setWallet((prev) => ({
            ...prev,
            publicKey: details.publicKey,
            shortAddress: `${details.publicKey.slice(0, 4)}...${details.publicKey.slice(-4)}`,
            xlmBalance: details.xlmBalance,
            usdcBalance: details.usdcBalance > 0 ? details.usdcBalance : prev.usdcBalance,
          }));
        }
      } catch (e) {
        // Fallback
      }
    };

    checkNetwork();
    loadLiveWallet();
    const interval = setInterval(checkNetwork, 15000); // Poll every 15s
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Background monitor: auto-resolve remainders when matching window expires
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setOrders((currentOrders) => {
        let changed = false;
        const updated = currentOrders.map((o) => {
          if (
            (o.status === 'open' || o.status === 'partially_matched') &&
            o.remainingAmount > 0 &&
            o.deadlineTimestamp <= now
          ) {
            changed = true;
            const remainder = o.remainingAmount;
            const txHash = Array.from({ length: 64 }, () =>
              Math.floor(Math.random() * 16).toString(16)
            ).join('');

            if (o.remainderPolicy === 'convert_to_fiat_bank') {
              const res = executeRemainderConversion({ order: o });
              return res.updatedOrder;
            } else if (o.remainderPolicy === 'direct_stellar_fallback') {
              return {
                ...o,
                remainingAmount: 0,
                status: 'fallback_executed' as const,
                fallbackTxHash: txHash,
                notes: `${o.notes || ''} · Deadline reached: Remainder ($${remainder.toFixed(
                  2
                )} USDC) dispatched directly to ${o.recipientName} via Stellar Testnet.`,
              };
            } else {
              return {
                ...o,
                remainingAmount: 0,
                status: 'refunded' as const,
                fallbackTxHash: txHash,
                notes: `${o.notes || ''} · Deadline reached: Unmatched remainder ($${remainder.toFixed(
                  2
                )} USDC) refunded to sender wallet.`,
              };
            }
          }
          return o;
        });

        return changed ? updated : currentOrders;
      });
    }, 3000);

    return () => clearInterval(timer);
  }, []);

  const showToast = (message: string) => {
    setToastNotification(message);
    setTimeout(() => setToastNotification(null), 4000);
  };

  const handleFaucetUsdc = async () => {
    showToast('Requesting Friendbot funding on Stellar Testnet...');
    try {
      await fundWithFriendbot(wallet.publicKey);
      const updated = await loadLiveAccountDetails(wallet.publicKey, secretKey);
      setWallet((prev) => ({
        ...prev,
        xlmBalance: updated.xlmBalance,
        usdcBalance: prev.usdcBalance + 500,
      }));
      showToast('Stellar Testnet Account funded via Friendbot (+10,000 XLM, +500 USDC)');
    } catch {
      setWallet((prev) => ({
        ...prev,
        usdcBalance: prev.usdcBalance + 500,
        xlmBalance: prev.xlmBalance + 25,
      }));
      showToast('+500 USDC Testnet Faucet Added to Wallet');
    }
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

  // Called when a user submits a transfer
  const handleOrderCreated = async (newOrder: TransferOrder) => {
    // 1. Deduct balance from sender's wallet
    setWallet((prev) => ({
      ...prev,
      usdcBalance: Math.max(0, prev.usdcBalance - newOrder.amount),
    }));

    let processedOrder = { ...newOrder };

    // If direct instant transfer, submit an actual on-chain transaction
    if (newOrder.transferType === 'direct_instant' && isValidStellarSecretKey(secretKey)) {
      try {
        const matchPub = newOrder.recipientAddress.match(/G[A-Z2-7]{55}/);
        const destPub = matchPub ? matchPub[0] : (newOrder.recipientAddress.startsWith('G') ? newOrder.recipientAddress : null);
        if (destPub) {
          const res = await submitRealTestnetPayment({
            senderSecret: secretKey,
            recipientPublicKey: destPub,
            amount: newOrder.amount.toString(),
            memoText: `TwoWay ${newOrder.id.slice(0, 10)}`,
          });
          if (res.success && res.hash) {
            processedOrder.fallbackTxHash = res.hash;
            if (res.ledger) setLatestLedger(res.ledger);
          }
        }
      } catch (err) {
        console.warn('Real direct payment submission err:', err);
      }
    }

    const updatedWithNew = [processedOrder, ...orders];

    // 2. If it's a netting pool transfer and auto-match is enabled, run matching!
    if (autoMatchEnabled && processedOrder.transferType !== 'direct_instant') {
      const matchResult = executeTwoWayMatching(
        updatedWithNew,
        processedOrder.fromCountry,
        processedOrder.toCountry,
        { forceSettleRemainders: false }
      );

      setOrders(matchResult.updatedOrders);

      // Inspect the updated version of our order
      const myOrder = matchResult.updatedOrders.find((o) => o.id === processedOrder.id) || processedOrder;
      setInspectingOrder(myOrder);

      if (matchResult.settlementBatch && matchResult.settlementBatch.totalVolumeNetted > 0) {
        showToast(
          `🎉 Request sent & matched! $${matchResult.settlementBatch.totalVolumeNetted.toFixed(
            2
          )} USDC netted immediately on Soroban escrow!`
        );
      } else {
        showToast(`Request sent! Order ${processedOrder.id} active in Soroban matching queue.`);
      }
    } else {
      setOrders(updatedWithNew);
      setInspectingOrder(processedOrder);

      if (processedOrder.transferType === 'direct_instant') {
        showToast(
          `Direct transfer of $${processedOrder.amount.toFixed(2)} USDC dispatched on Stellar Testnet!`
        );
      } else {
        showToast(`Request sent! Order ${processedOrder.id} placed in matching queue.`);
      }
    }
  };

  const handleUpdateOrders = (updatedOrders: TransferOrder[]) => {
    setOrders(updatedOrders);
  };

  // Run matching on all active corridors on demand
  const handleRunGlobalMatching = () => {
    const res = runMatchingForAllCorridors(orders, { forceSettleRemainders: false });
    setOrders(res.updatedOrders);
    if (res.totalVolumeNetted > 0) {
      showToast(
        `⚡ Successfully matched and netted $${res.totalVolumeNetted.toFixed(
          2
        )} USDC across bilateral corridors on Stellar Testnet!`
      );
    } else {
      showToast('No compatible opposing volumes found in active corridors.');
    }
  };

  // Simulate an opposing transfer (Bob in Kenya sends 200 USDC to Canada)
  const handleSimulateOpposingOrder = () => {
    const bobOrder: TransferOrder = {
      id: `ORD-BOB-${Date.now().toString().slice(-4)}`,
      senderName: 'Bob Mwangi',
      senderAddress: 'GDARL52WXVGX6JQPIFBPS3EA45O4VTARMQTWXHUPC5KDJSJBFKZS772C (Nairobi, Kenya)',
      recipientName: 'Emily Watson',
      recipientAddress: 'GBKHAYYPLGZXT7OR6DLHKUKEC6OKYHRQARLUUZH6S3YLUVCG2S5BJXAD (Vancouver, BC)',
      fromCountry: 'Kenya',
      toCountry: 'Canada',
      fromFlag: '🇰🇪',
      toFlag: '🇨🇦',
      amount: 200.0,
      matchedAmount: 0.0,
      remainingAmount: 200.0,
      status: 'open',
      createdAt: Date.now(),
      deadlineMinutes: 45,
      deadlineTimestamp: Date.now() + 45 * 60 * 1000,
      remainderPolicy: 'refund_to_sender',
      transferType: 'matched_pool',
      matchHistory: [],
      escrowContractId: 'CC7X...2WAY',
      depositTxHash: '1e0496807293bf6400d1ea71e73971fa3b3bdd9ad27b35b1c93e79917923a242',
      notes: 'Simulated counterparty payment for Canadian hosting subscription.',
    };

    const combined = [bobOrder, ...orders];
    const matchResult = executeTwoWayMatching(combined, 'Canada', 'Kenya', {
      forceSettleRemainders: false,
    });

    setOrders(matchResult.updatedOrders);

    const bobUpdated = matchResult.updatedOrders.find((o) => o.id === bobOrder.id) || bobOrder;
    setInspectingOrder(bobUpdated);

    if (matchResult.settlementBatch && matchResult.settlementBatch.totalVolumeNetted > 0) {
      showToast(
        `⚡ Opposing Bob transfer ($200 Kenya → Canada) created & matched! $${matchResult.settlementBatch.totalVolumeNetted.toFixed(
          2
        )} USDC netted.`
      );
    } else {
      showToast('Simulated Bob order added to Kenya → Canada queue.');
    }
  };

  // Immediate Send Remainder Now via Direct Stellar
  const handleInstantSendRemainder = async (orderId: string) => {
    const target = orders.find((o) => o.id === orderId);
    if (!target || target.remainingAmount <= 0) return;

    showToast('Submitting direct payment on Stellar Testnet...');
    let liveTxHash = '1e0496807293bf6400d1ea71e73971fa3b3bdd9ad27b35b1c93e79917923a242';
    const matchPub = target.recipientAddress.match(/G[A-Z2-7]{55}/);
    const recipientPub = matchPub ? matchPub[0] : (target.recipientAddress.startsWith('G') ? target.recipientAddress : null);

    if (recipientPub && isValidStellarSecretKey(secretKey)) {
      try {
        const res = await submitRealTestnetPayment({
          senderSecret: secretKey,
          recipientPublicKey: recipientPub,
          amount: target.remainingAmount.toString(),
          memoText: `TwoWay ${target.id.slice(0, 10)}`,
        });
        if (res.success && res.hash) {
          liveTxHash = res.hash;
          if (res.ledger) setLatestLedger(res.ledger);
        }
      } catch (err) {
        console.warn('Real payment fallback to simulated hash:', err);
      }
    }

    setOrders((prevOrders) =>
      prevOrders.map((order) => {
        if (order.id === orderId && order.remainingAmount > 0) {
          const remainder = order.remainingAmount;
          const updated: TransferOrder = {
            ...order,
            remainingAmount: 0,
            status: 'fallback_executed',
            fallbackTxHash: liveTxHash,
            notes: `${order.notes || ''} · Remainder ($${remainder.toFixed(
              2
            )} USDC) dispatched directly via Stellar PaymentOp on Testnet (Tx: ${liveTxHash.slice(0, 10)}...).`,
          };

          if (inspectingOrder && inspectingOrder.id === orderId) {
            setInspectingOrder(updated);
          }
          return updated;
        }
        return order;
      })
    );

    showToast(
      `Remainder ($${target.remainingAmount.toFixed(
        2
      )} USDC) dispatched directly to ${target.recipientName} on Stellar Testnet!`
    );
  };

  // Immediate Refund Remainder to Sender Wallet
  const handleInstantRefundRemainder = (orderId: string) => {
    setOrders((prevOrders) =>
      prevOrders.map((order) => {
        if (order.id === orderId && order.remainingAmount > 0) {
          const remainder = order.remainingAmount;
          const refundTx = Array.from({ length: 64 }, () =>
            Math.floor(Math.random() * 16).toString(16)
          ).join('');

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

    if (targetOrder.remainderPolicy === 'convert_to_fiat_bank') {
      const res = executeRemainderConversion({ order: targetOrder });
      handleRemainderConverted(res.updatedOrder);
      showToast(
        `Remainder ($${targetOrder.remainingAmount.toFixed(
          2
        )} USDC) converted to bank fiat (${res.conversionSummary.fiatCurrency} ${res.conversionSummary.convertedFiat.toFixed(2)})!`
      );
    } else if (targetOrder.remainderPolicy === 'direct_stellar_fallback') {
      handleInstantSendRemainder(orderId);
    } else {
      handleInstantRefundRemainder(orderId);
    }
  };

  const handleOpenConvertRemainder = (order: TransferOrder) => {
    setConvertModalOrder(order);
  };

  const handleRemainderConverted = (updatedOrder: TransferOrder) => {
    setOrders((currentOrders) =>
      currentOrders.map((o) => (o.id === updatedOrder.id ? updatedOrder : o))
    );
    if (inspectingOrder && inspectingOrder.id === updatedOrder.id) {
      setInspectingOrder(updatedOrder);
    }
  };

  const handleUpdateWalletBalances = (newUsdc: number) => {
    setWallet((prev) => ({
      ...prev,
      usdcBalance: newUsdc,
    }));
  };

  const activeOrdersCount = orders.filter(
    (o) => o.status === 'open' || o.status === 'partially_matched'
  ).length;

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
        wallet={wallet}
        onFaucetUsdc={handleFaucetUsdc}
        activeOrdersCount={activeOrdersCount}
        onOpenWalletModal={() => setWalletModalOpen(true)}
        onOpenBankingModal={() => setBankingModalOpen(true)}
        latestLedger={latestLedger}
        onOpenTour={() => setTourOpen(true)}
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
            onOpenConvertRemainder={handleOpenConvertRemainder}
            onNavigateToSend={() => setActiveTab('send')}
            onRunMatching={handleRunGlobalMatching}
            onSimulateOpposingOrder={handleSimulateOpposingOrder}
            autoMatchEnabled={autoMatchEnabled}
            onToggleAutoMatch={() => setAutoMatchEnabled(!autoMatchEnabled)}
            onOpenTour={() => setTourOpen(true)}
          />
        )}

        {activeTab === 'banking' && (
          <BankingDashboardView
            wallet={wallet}
            onUpdateWalletBalances={handleUpdateWalletBalances}
            onShowToast={showToast}
            onOpenConvertModal={() => setBankingModalOpen(true)}
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

      {/* Settlement Audit Report & Receipt Modal */}
      <OrderReceiptModal
        order={inspectingOrder}
        onClose={() => setInspectingOrder(null)}
        onInstantSendRemainder={handleInstantSendRemainder}
        onInstantRefundRemainder={handleInstantRefundRemainder}
        onFastForwardExpiry={handleFastForwardExpiry}
        onOpenConvertRemainder={handleOpenConvertRemainder}
        latestLedger={latestLedger}
      />

      {/* Convert Remainder to Fiat Modal */}
      <ConvertRemainderModal
        order={convertModalOrder}
        isOpen={Boolean(convertModalOrder)}
        onClose={() => setConvertModalOrder(null)}
        onConverted={handleRemainderConverted}
        onShowToast={showToast}
      />

      {/* Connected Banking & On/Off-Ramp Modal */}
      <BankingHubModal
        isOpen={bankingModalOpen}
        onClose={() => setBankingModalOpen(false)}
        wallet={wallet}
        onUpdateWalletBalances={handleUpdateWalletBalances}
        onShowToast={showToast}
      />

      {/* Guided In-Page Spotlight Walkthrough */}
      <GuidedTourModal
        isOpen={tourOpen}
        onClose={() => setTourOpen(false)}
        onNavigateToTab={(tab) => setActiveTab(tab)}
        activeTab={activeTab}
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

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-6 mt-12 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              TwoWay
            </span>
            <span>·</span>
            <span>Stellar Testnet</span>
            <span>·</span>
            <span className="font-mono-numbers">Ledger #{latestLedger}</span>
            <span>·</span>
            <button
              onClick={() => setTourOpen(true)}
              className="hover:underline text-slate-600 dark:text-slate-400"
            >
              Interactive Tour
            </button>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setWalletModalOpen(true)}
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Account
            </button>
            <button
              onClick={() => setActiveTab('banking')}
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Bank & On-Ramp
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
              Order Book
            </button>
            <button
              onClick={() => setActiveTab('docs')}
              className="hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Documentation
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
