/**
 * Indicative FX rates (local currency per 1 USD/USDC) and a simple conversion helper.
 * Used for showing local-currency amounts in funding/delivery records and remainder conversions.
 * Indicative only: not live rates.
 */
export const FX_RATES: Record<string, { rate: number; symbol: string; name: string }> = {
  CAD: { rate: 1.392, symbol: 'CA$', name: 'Canadian Dollar' },
  KES: { rate: 129.5, symbol: 'KSh', name: 'Kenyan Shilling' },
  USD: { rate: 1.0, symbol: '$', name: 'US Dollar' },
  EUR: { rate: 0.942, symbol: '€', name: 'Euro' },
  NGN: { rate: 1480.0, symbol: '₦', name: 'Nigerian Naira' },
  PHP: { rate: 58.45, symbol: '₱', name: 'Philippine Peso' },
  ARS: { rate: 1050.0, symbol: 'AR$', name: 'Argentine Peso' },
};

/** Converts a USDC amount to a target fiat currency, net of a 0.15% anchor processing fee. */
export function calculateUsdcConversion(
  usdcAmount: number,
  targetCurrency: string
): { grossFiat: number; feeFiat: number; netFiat: number; rate: number; symbol: string } {
  const fx = FX_RATES[targetCurrency] || FX_RATES['USD'];
  const grossFiat = usdcAmount * fx.rate;
  const feeFiat = grossFiat * 0.0015;
  return { grossFiat, feeFiat, netFiat: grossFiat - feeFiat, rate: fx.rate, symbol: fx.symbol };
}
