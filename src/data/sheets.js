/**
 * The fee spreadsheet (shared/fees/verified_fee_matrix.csv), parsed once, restricted to the app's
 * country pairs (shared/corridors.json), with country names translated to the app's
 * (e.g. the sheet's "Eurozone" -> "European Union").
 */
import verifiedCsv from '../../shared/fees/verified_fee_matrix.csv?raw';
import { SHEET_NAME, isPair } from './corridors';
import { loadFeeSheet } from './feeSheet';

const APP_NAME = Object.fromEntries(Object.entries(SHEET_NAME).map(([app, sheet]) => [sheet, app]));

export const FEE_SHEET_FILE = 'shared/fees/verified_fee_matrix.csv';

/** Corridor rows for the app's directions. */
export const FEE_ROWS = loadFeeSheet(verifiedCsv)
  .map((r) => ({ ...r, origin: APP_NAME[r.origin], dest: APP_NAME[r.dest], sheetOrigin: r.origin, sheetDest: r.dest }))
  .filter((r) => r.origin && r.dest && isPair(r.origin, r.dest));

/** The spreadsheet row for from -> to (app country names), or null when the sheet has no such direction. */
export const sheetRow = (from, to) => FEE_ROWS.find((r) => r.origin === from && r.dest === to) ?? null;
