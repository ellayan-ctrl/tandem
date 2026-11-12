import fxRates from '../../shared/fx_rates.json';

/**
 * Indicative FX rates (local currency per 1 USD/USDC) and a simple conversion helper.
 * Used for showing local-currency amounts in funding/delivery records and remainder conversions.
 * Indicative only: not live rates.
 */
export const FX_RATES = fxRates.rates;

/** Converts a USDC amount to a target fiat currency, net of a 0.15% anchor processing fee. */
export function calculateUsdcConversion(usdcAmount, targetCurrency) {
  const fx = FX_RATES[targetCurrency] || FX_RATES['USD'];
  const grossFiat = usdcAmount * fx.rate;
  const feeFiat = grossFiat * 0.0015;
  return { grossFiat, feeFiat, netFiat: grossFiat - feeFiat, rate: fx.rate, symbol: fx.symbol };
}
