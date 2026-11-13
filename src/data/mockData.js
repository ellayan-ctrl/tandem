export const INITIAL_USER_WALLET = {
  publicKey: 'GA3UVKHSLRC6WRCFE7WKS2RT4GXSIGQKIYEX4HTPM4656DRXPV24A6YN',
  shortAddress: 'GA3U...A6YN',
  usdcBalance: 2450.0,
  xlmBalance: 9975.0,
  network: 'Stellar Testnet',
  isConnected: true,
};


// Country pairs live in shared/corridors.json (see src/data/corridors.js).

// Canonical Hackathon Scenario from Prompt with 100% Valid Ed25519 Testnet Accounts:
// Alice (Canada → Kenya): 500 USDC
// Bob (Kenya → Canada): 200 USDC
// Charlie (Canada → Kenya): 300 USDC
export const CANONICAL_SCENARIO_ORDERS = [
  {
    id: 'ORD-ALICE-01',
    senderName: 'Alice Tremblay',
    senderAddress: 'GAS6534LG7MBQZXIE3V2DN56P4FTNHVIFAMPFWPXKV4LLFXI5L3AROO5',
    recipientName: 'David Kilonzo',
    recipientAddress: 'GAHVEV3PTFCTWHX2DTZZU3F5ZQXBKJUBA4PORGCUIFUJV2RCQAMAQ363',
    fromCountry: 'Canada',
    toCountry: 'Kenya',
    fromFlag: '🇨🇦',
    toFlag: '🇰🇪',
    amount: 500.0,
    matchedAmount: 0.0,
    remainingAmount: 500.0,
    status: 'open',
    createdAt: Date.now() - 1000 * 60 * 25, // 25 min ago (Priority 1)
    deadlineMinutes: 60,
    deadlineTimestamp: Date.now() + 1000 * 60 * 35,
    remainderPolicy: 'direct_stellar_fallback', // Alice wants direct fallback if unmatched!
    matchHistory: [],
    escrowContractId: 'CC7X5Q2R6J7K8L9M0N1P2Q3R4S5T6U7V8W9X0Y1Z2A3B4C5D6E7F8G9H0',
    depositTxHash: '1e0496807293bf6400d1ea71e73971fa3b3bdd9ad27b35b1c93e79917923a242',
    notes: 'Family remittance for medical clinic support in Kiambu.',
  },
  {
    id: 'ORD-BOB-02',
    senderName: 'Bob Mwangi',
    senderAddress: 'GDARL52WXVGX6JQPIFBPS3EA45O4VTARMQTWXHUPC5KDJSJBFKZS772C',
    recipientName: 'Emily Watson',
    recipientAddress: 'GBKHAYYPLGZXT7OR6DLHKUKEC6OKYHRQARLUUZH6S3YLUVCG2S5BJXAD',
    fromCountry: 'Kenya',
    toCountry: 'Canada',
    fromFlag: '🇰🇪',
    toFlag: '🇨🇦',
    amount: 200.0,
    matchedAmount: 0.0,
    remainingAmount: 200.0,
    status: 'open',
    createdAt: Date.now() - 1000 * 60 * 18, // 18 min ago (Priority 2)
    deadlineMinutes: 45,
    deadlineTimestamp: Date.now() + 1000 * 60 * 27,
    remainderPolicy: 'refund_to_sender', // Bob wants refund if unmatched
    matchHistory: [],
    escrowContractId: 'CC7X5Q2R6J7K8L9M0N1P2Q3R4S5T6U7V8W9X0Y1Z2A3B4C5D6E7F8G9H0',
    depositTxHash: '1e0496807293bf6400d1ea71e73971fa3b3bdd9ad27b35b1c93e79917923a242',
    notes: 'Payment for Canadian cloud hosting server subscription.',
  },
  {
    id: 'ORD-CHARLIE-03',
    senderName: 'Charlie Gagnon',
    senderAddress: 'GAU44FNC5X2QFNA2YJ7Z75ZKJ65UCDA3OVPY65KJ6EJIVGVC77XW2ENS',
    recipientName: 'Samuel Ochieng',
    recipientAddress: 'GABDKFWREJQJ2QRICSEP36G7T7VBSEKKS4H3DGXEJROMOOX6XTWRQWJC',
    fromCountry: 'Canada',
    toCountry: 'Kenya',
    fromFlag: '🇨🇦',
    toFlag: '🇰🇪',
    amount: 300.0,
    matchedAmount: 0.0,
    remainingAmount: 300.0,
    status: 'open',
    createdAt: Date.now() - 1000 * 60 * 8, // 8 min ago (Priority 3)
    deadlineMinutes: 120,
    deadlineTimestamp: Date.now() + 1000 * 60 * 112,
    remainderPolicy: 'refund_to_sender',
    matchHistory: [],
    escrowContractId: 'CC7X5Q2R6J7K8L9M0N1P2Q3R4S5T6U7V8W9X0Y1Z2A3B4C5D6E7F8G9H0',
    depositTxHash: '1e0496807293bf6400d1ea71e73971fa3b3bdd9ad27b35b1c93e79917923a242',
    notes: 'Coffee green bean direct trade prepayment.',
  },
];
