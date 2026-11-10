import { TransferOrder, BatchSettlementResult, MatchFillRecord } from '../types';

/**
 * Deterministic Matching Engine for Two-Way Street Cross-Border Transfers.
 * Matches opposing queues with strict FIFO time-priority, supports fractional fills,
 * and executes remainder policies (direct Stellar transfer fallback or refund).
 */
export function executeTwoWayMatching(
  orders: TransferOrder[],
  countryA: string,
  countryB: string,
  options?: {
    forceSettleRemainders?: boolean;
    currentTimestamp?: number;
  }
): {
  updatedOrders: TransferOrder[];
  settlementBatch: BatchSettlementResult | null;
  logs: string[];
} {
  const now = options?.currentTimestamp || Date.now();
  const forceSettleRemainders = options?.forceSettleRemainders ?? true;
  const logs: string[] = [];

  logs.push(`[Engine Initialization] Evaluating corridor ${countryA} ⇄ ${countryB}`);

  // Deep clone orders to avoid mutating original state directly
  const workingOrders: TransferOrder[] = JSON.parse(JSON.stringify(orders));

  // Separate active orders into opposing directional queues
  const queueAtoB = workingOrders
    .filter(
      (o) =>
        o.fromCountry === countryA &&
        o.toCountry === countryB &&
        (o.status === 'open' || o.status === 'partially_matched') &&
        o.remainingAmount > 0
    )
    .sort((a, b) => a.createdAt - b.createdAt); // FIFO Priority

  const queueBtoA = workingOrders
    .filter(
      (o) =>
        o.fromCountry === countryB &&
        o.toCountry === countryA &&
        (o.status === 'open' || o.status === 'partially_matched') &&
        o.remainingAmount > 0
    )
    .sort((a, b) => a.createdAt - b.createdAt); // FIFO Priority

  logs.push(
    `[Corridor Queues] ${countryA} → ${countryB}: ${queueAtoB.length} orders ($${queueAtoB.reduce((s, o) => s + o.remainingAmount, 0).toFixed(2)} USDC) | ` +
      `${countryB} → ${countryA}: ${queueBtoA.length} orders ($${queueBtoA.reduce((s, o) => s + o.remainingAmount, 0).toFixed(2)} USDC)`
  );

  const matchedPairs: BatchSettlementResult['matchedPairs'] = [];
  let totalVolumeNetted = 0;

  let indexA = 0;
  let indexB = 0;

  // Bilateral Continuous Double Matching
  while (indexA < queueAtoB.length && indexB < queueBtoA.length) {
    const orderA = queueAtoB[indexA];
    const orderB = queueBtoA[indexB];

    const matchAmount = Math.min(orderA.remainingAmount, orderB.remainingAmount);

    if (matchAmount > 0) {
      const txHash = `0x${Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join('')}`;

      orderA.matchedAmount += matchAmount;
      orderA.remainingAmount = Math.max(0, orderA.remainingAmount - matchAmount);

      orderB.matchedAmount += matchAmount;
      orderB.remainingAmount = Math.max(0, orderB.remainingAmount - matchAmount);

      totalVolumeNetted += matchAmount;

      const recordA: MatchFillRecord = {
        matchedWithOrderId: orderB.id,
        matchedWithSender: orderB.senderName,
        amount: matchAmount,
        timestamp: now,
        recipientSettled: orderA.recipientName,
        txHash,
      };

      const recordB: MatchFillRecord = {
        matchedWithOrderId: orderA.id,
        matchedWithSender: orderA.senderName,
        amount: matchAmount,
        timestamp: now,
        recipientSettled: orderB.recipientName,
        txHash,
      };

      orderA.matchHistory.push(recordA);
      orderB.matchHistory.push(recordB);

      matchedPairs.push({
        orderAId: orderA.id,
        orderBId: orderB.id,
        settledAmount: matchAmount,
        senderA: orderA.senderName,
        senderB: orderB.senderName,
        recipientA: orderA.recipientName,
        recipientB: orderB.recipientName,
      });

      logs.push(
        `[MATCH EXECUTED] ${matchAmount.toFixed(2)} USDC paired: ${orderA.senderName} (${orderA.fromCountry}) ⇄ ${orderB.senderName} (${orderB.fromCountry})`
      );

      // Update statuses
      if (orderA.remainingAmount === 0) {
        orderA.status = 'settled';
        orderA.settlementTxHash = txHash;
        indexA++;
      } else {
        orderA.status = 'partially_matched';
      }

      if (orderB.remainingAmount === 0) {
        orderB.status = 'settled';
        orderB.settlementTxHash = txHash;
        indexB++;
      } else {
        orderB.status = 'partially_matched';
      }
    } else {
      if (orderA.remainingAmount === 0) indexA++;
      if (orderB.remainingAmount === 0) indexB++;
    }
  }

  // Handle Remainders & Expirations
  const remaindersProcessed: BatchSettlementResult['remaindersProcessed'] = [];

  if (forceSettleRemainders) {
    const remainingOrders = workingOrders.filter(
      (o) =>
        (o.fromCountry === countryA && o.toCountry === countryB) ||
        (o.fromCountry === countryB && o.toCountry === countryA)
    );

    for (const order of remainingOrders) {
      if (
        (order.status === 'open' || order.status === 'partially_matched') &&
        order.remainingAmount > 0
      ) {
        const remainderAmount = order.remainingAmount;
        const txHash = `0x${Array.from({ length: 64 }, () =>
          Math.floor(Math.random() * 16).toString(16)
        ).join('')}`;

        if (order.remainderPolicy === 'direct_stellar_fallback') {
          // Direct Stellar USDC payment to recipient fallback
          order.status = 'fallback_executed';
          order.fallbackTxHash = txHash;
          remaindersProcessed.push({
            orderId: order.id,
            action: 'fallback_direct_payout',
            amount: remainderAmount,
            recipientOrSender: order.recipientName,
          });
          logs.push(
            `[FALLBACK DISPATCH] Order ${order.id} remainder ($${remainderAmount.toFixed(
              2
            )} USDC) dispatched directly to ${order.recipientName} (${order.toCountry}) via Stellar PaymentOp.`
          );
        } else {
          // Refund back to sender's Stellar wallet
          order.status = 'refunded';
          remaindersProcessed.push({
            orderId: order.id,
            action: 'refunded',
            amount: remainderAmount,
            recipientOrSender: order.senderName,
          });
          logs.push(
            `[REFUND UNLOCKED] Order ${order.id} remainder ($${remainderAmount.toFixed(
              2
            )} USDC) released from Soroban escrow back to ${order.senderName} (${order.fromCountry}).`
          );
        }
        order.remainingAmount = 0;
      }
    }
  }

  let settlementBatch: BatchSettlementResult | null = null;

  if (matchedPairs.length > 0 || remaindersProcessed.length > 0) {
    settlementBatch = {
      batchId: `BATCH-${Date.now().toString().slice(-6)}`,
      timestamp: now,
      corridorId: `${countryA}-${countryB}`,
      matchedPairs,
      totalVolumeNetted,
      stroopsGasCost: 1200 + matchedPairs.length * 450, // ~0.000165 XLM in stroops
      stellarLedgerSeq: 48921820 + Math.floor(Math.random() * 500),
      txHash: `0x${Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join('')}`,
      remaindersProcessed,
    };
  }

  logs.push(
    `[Batch Complete] Total netted: $${totalVolumeNetted.toFixed(
      2
    )} USDC. Remainders resolved: ${remaindersProcessed.length}.`
  );

  return {
    updatedOrders: workingOrders,
    settlementBatch,
    logs,
  };
}
