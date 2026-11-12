import type { OrderRow } from './db.ts';
import { fromUnits } from './amounts.ts';
import { calculateUsdcConversion } from '../src/services/bankingService.ts';

const CURRENCY_BY_COUNTRY: Record<string, string> = {
  Kenya: 'KES',
  Canada: 'CAD',
  Nigeria: 'NGN',
  Philippines: 'PHP',
  Argentina: 'ARS',
  'European Union': 'EUR',
};

/** Simulated fiat conversion record for `convert_to_fiat_bank` remainders (no on-chain movement). */
export function simulatedConversion(o: OrderRow) {
  const currency = CURRENCY_BY_COUNTRY[o.to_country] ?? 'USD';
  const { netFiat, rate } = calculateUsdcConversion(fromUnits(o.remaining_amount), currency);
  return {
    fiatAmount: netFiat,
    currency,
    exchangeRate: rate,
    bankClearingRef: `SIM-${currency}-${Date.now().toString().slice(-6)}`,
    conversionTxHash: '',
    timestamp: Date.now(),
  };
}
