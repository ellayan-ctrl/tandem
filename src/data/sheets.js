/**
 * The fee spreadsheets, parsed once, restricted to the app's country pairs (shared/corridors.json),
 * with country names translated to the app's (e.g. the sheets' "Eurozone" -> "European Union").
 */
import verifiedCsv from '../../shared/fees/verified_fee_matrix.csv?raw';
import matchedCsv from '../../shared/fees/matched_fee_matrix.csv?raw';
import { SHEET_NAME, isPair } from './corridors';
import { loadFeeSheet } from './feeSheet';

const APP_NAME = Object.fromEntries(Object.entries(SHEET_NAME).map(([app, sheet]) => [sheet, app]));

const forApp = (csv) =>
  loadFeeSheet(csv)
    .map((r) => ({ ...r, origin: APP_NAME[r.origin], dest: APP_NAME[r.dest], sheetOrigin: r.origin, sheetDest: r.dest }))
    .filter((r) => r.origin && r.dest && isPair(r.origin, r.dest));

export const SHEETS = {
  verified: {
    label: 'Verified Cross-Border & Domestic Fee Matrix (expanded)',
    file: 'shared/fees/verified_fee_matrix.csv',
    rows: forApp(verifiedCsv),
  },
  matched: {
    label: 'Matched Transfer Fee Matrix (overseas vs domestic rails)',
    file: 'shared/fees/matched_fee_matrix.csv',
    rows: forApp(matchedCsv),
  },
};

/** The spreadsheet row for from -> to (app country names), preferring the given sheet. */
export function sheetRow(from, to, prefer = 'verified') {
  const order = [prefer, ...Object.keys(SHEETS).filter((k) => k !== prefer)];
  for (const id of order) {
    const row = SHEETS[id].rows.find((r) => r.origin === from && r.dest === to);
    if (row) return { ...row, sheetId: id };
  }
  return null;
}
