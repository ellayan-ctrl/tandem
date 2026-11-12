/**
 * Shapes of the data the API returns and the UI passes around (documentation only; JavaScript has no
 * runtime types). The server side of these shapes is backend/api.py.
 */

/**
 * @typedef {'direct_stellar_fallback' | 'refund_to_sender' | 'convert_to_fiat_bank'} RemainderPolicy
 */

/**
 * @typedef {'open' | 'partially_matched' | 'fully_matched' | 'settled' | 'payout_pending' | 'payout_failed' | 'refunded' | 'fallback_executed' | 'remainder_converted' | 'cancelled'} OrderStatus
 */

/**
 * @typedef {Object} MatchFillRecord
 * @property {string} matchedWithOrderId
 * @property {string} matchedWithSender
 * @property {number} amount
 * @property {number} timestamp
 * @property {string} recipientSettled
 * @property {string} txHash - For matched fills this is the off-chain netting reference, not a chain tx hash.
 * @property {string} [settlementMethod]
 * @property {MatchedFundingView} [funding] - How this order's sender paid in this matched amount, and how its recipient is paid (simulated rails).
 */

/**
 * @typedef {Object} MatchedFundingView
 * @property {string} providerId
 * @property {string} providerName
 * @property {string} kindLabel
 * @property {string} reference
 * @property {'charged' | 'debit_scheduled' | 'requested' | 'awaiting_cash' | 'pending'} status
 * @property {number} amountUsdc
 * @property {string} currency - What the sender pays, in the sender's currency.
 * @property {number} localAmount
 * @property {string} instructions
 * @property {Record<string, string>} details
 * @property {{ currency: string; localAmount: number; note: string }} delivery - How this order's recipient is paid (by the partner network, recipient's choice).
 * @property {true} simulated
 */

/**
 * The sender's chosen funding method for the matched amount (sensitive fields masked).
 * @typedef {Object} FundingMethodView
 * @property {string} providerId
 * @property {string} providerName
 * @property {string} [kind]
 * @property {string} [kindLabel]
 * @property {string} [eta]
 * @property {Record<string, string>} details
 */

/**
 * @typedef {Object} BankAccount
 * @property {string} id
 * @property {string} institutionName
 * @property {'checking' | 'savings' | 'mobile_money'} accountType
 * @property {string} accountNumberMasked
 * @property {string} routingOrSortCode
 * @property {string} currency
 * @property {number} fiatBalance
 * @property {string} country
 * @property {string} holderName
 * @property {boolean} isConnected
 * @property {boolean} [isPrimary]
 */

/**
 * @typedef {Object} BankingTransaction
 * @property {string} id
 * @property {'deposit_onramp' | 'withdraw_offramp' | 'remainder_conversion'} type
 * @property {string} bankAccountId
 * @property {string} bankName
 * @property {string} fiatCurrency
 * @property {number} fiatAmount
 * @property {number} usdcAmount
 * @property {number} exchangeRate
 * @property {number} fee
 * @property {'completed' | 'processing'} status
 * @property {string} clearingRef
 * @property {string} stellarTxHash
 * @property {number} timestamp
 * @property {string} [orderId]
 * @property {string} [recipientName]
 */

/**
 * @typedef {Object} TransferOrder
 * @property {string} id
 * @property {string} senderName
 * @property {string} senderAddress
 * @property {string} recipientName
 * @property {string} recipientAddress
 * @property {string} fromCountry
 * @property {string} toCountry
 * @property {string} fromFlag
 * @property {string} toFlag
 * @property {number} amount - total amount to send, in USD (USDC-equivalent)
 * @property {number} matchedAmount
 * @property {number} remainingAmount
 * @property {OrderStatus} status
 * @property {number} createdAt
 * @property {number} deadlineMinutes
 * @property {number} deadlineTimestamp
 * @property {RemainderPolicy} remainderPolicy
 * @property {MatchFillRecord[]} matchHistory
 * @property {string} escrowContractId - Soroban settlement contract that pays out unmatched remainders.
 * @property {string} depositTxHash - Pre-authorization (`approve`) tx hash. No funds move in this tx.
 * @property {number | null} [preauthExpirationLedger]
 * @property {string} [settlementTxHash]
 * @property {string} [fallbackTxHash] - Soroban `payout_remainder` tx hash for the unmatched remainder.
 * @property {number} [payoutAmount]
 * @property {string} [payoutError]
 * @property {'matched_pool' | 'direct_instant'} [transferType]
 * @property {string} [notes]
 * @property {FundingMethodView} [fundingMethod] - Returned by the server: how the sender pays in the matched amount.
 * @property {FundingSelection} [fundingSelection] - Client-side input when placing an order (full, unmasked details).
 * @property {number} [bankId] - Client-side input: linked bank paying the matched part / funding the unmatched part.
 * @property {number} [remainderBankId]
 * @property {{ bankName: string; accountNumberMasked: string; currency: string; }} [recipientBankDetails]
 * @property {{ fiatAmount: number; currency: string; exchangeRate: number; bankClearingRef: string; conversionTxHash: string; timestamp: number; }} [convertedRemainderFiat]
 */

/**
 * @typedef {Object} Corridor
 * @property {string} id
 * @property {{ name: string; code: string; flag: string; currency: string; anchorName: string; }} countryA
 * @property {{ name: string; code: string; flag: string; currency: string; anchorName: string; }} countryB
 * @property {string} description
 * @property {number} activeOrdersAtoB
 * @property {number} activeOrdersBtoA
 * @property {number} volumeAtoB
 * @property {number} volumeBtoA
 * @property {number} netMatchableVolume
 * @property {number} offRampSavingsPct
 */

/**
 * @typedef {Object} BatchSettlementResult
 * @property {string} batchId
 * @property {number} timestamp
 * @property {string} corridorId
 * @property {Array<{ orderAId: string; orderBId: string; settledAmount: number; senderA: string; senderB: string; recipientA: string; recipientB: string; nettingRef?: string; }>} matchedPairs
 * @property {number} totalVolumeNetted
 * @property {string} [settlementMethod]
 * @property {number} stroopsGasCost
 * @property {number} stellarLedgerSeq
 * @property {string} txHash
 * @property {Array<{ orderId: string; action: 'refunded' | 'fallback_direct_payout'; amount: number; recipientOrSender: string; }>} remaindersProcessed
 */

/**
 * A linked payment method (bank, debit card, instant transfer, mobile money, or cash at an agent).
 * @typedef {Object} BankView
 * @property {number} id
 * @property {string} providerId
 * @property {'bank_account' | 'debit_card' | 'instant_transfer' | 'mobile_money' | 'cash_deposit'} kind
 * @property {string} kindLabel
 * @property {string} name
 * @property {Record<string, string>} details
 * @property {number} balance
 * @property {number} held
 * @property {number} available
 */

/**
 * @typedef {Object} AccountView
 * @property {number} id
 * @property {string} displayName
 * @property {string} country
 * @property {string} currency
 * @property {BankView[]} banks - All linked bank accounts (same country).
 * @property {BankView} bank - First linked bank.
 * @property {number} balance - Totals across linked banks, in `currency` (simulated).
 * @property {number} held - Reserved for open orders' unmatched amounts (not yet charged).
 * @property {number} available
 * @property {true} simulatedBank
 * @property {{ publicKey: string }} wallet
 */

/**
 * @typedef {Object} UserWallet
 * @property {string} publicKey
 * @property {string} shortAddress
 * @property {number} usdcBalance
 * @property {number} xlmBalance
 * @property {'Stellar Testnet' | 'Futurenet'} network
 * @property {boolean} isConnected
 */

export {};
