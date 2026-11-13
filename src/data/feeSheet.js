/**
 * Fee spreadsheets (shared/fees/*.csv) -> corridor rows, and the fee formulas the Calculator uses.
 * Nothing about fees is hardcoded here: every percentage, flat fee, cap and FX markup is read from
 * the CSV. Columns are found by header name (both spreadsheets' names are understood), so rows can
 * be added, removed or edited in the CSV without touching code.
 */

/** RFC-4180-style CSV: quoted fields may contain commas, quotes ("") and newlines. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** "0.43%" -> 0.43, "1.2" -> 1.2, "N/A" / "" -> null */
export function num(s) {
  const t = String(s ?? '').replace(/[%,$\s]/g, '');
  if (t === '' || /^n\/?a$/i.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

/** "2.50%-4.00%" -> [2.5, 4]; "3.00%" -> [3, 3] */
export function range(s) {
  const parts = String(s ?? '')
    .split(/\s*[-–]\s*/)
    .map(num)
    .filter((v) => v !== null);
  if (!parts.length) return null;
  return [Math.min(...parts), Math.max(...parts)];
}

// Header names in either spreadsheet, per field.
const COLUMNS = {
  id: ['Corridor_ID'],
  origin: ['Origin_Country'],
  originCurrency: ['Origin_Currency'],
  dest: ['Destination_Country'],
  destCurrency: ['Destination_Currency'],
  provider: ['Overseas_Provider', 'Cheapest_Overseas_Provider'],
  overseasMethod: ['Overseas_Funding_Method'],
  overseasPct: ['Overseas_Variable_Fee_Pct', 'Overseas_Transfer_Fee_Pct'],
  overseasFlat: ['Overseas_Flat_Fee_Origin_Curr'],
  sample1000: ['Sample_1000_Unit_Overseas_Fee'],
  domesticMethod: ['Domestic_Rail_Method'],
  domesticPct: ['Domestic_Variable_Fee_Pct', 'Domestic_Transfer_Fee_Pct'],
  domesticFlat: ['Domestic_Flat_Fee_Origin_Curr'],
  domesticCap: ['Domestic_Fee_Cap_Origin_Curr'],
  bankMarkup: ['Traditional_Bank_FX_Markup_Pct'],
  sourceUrl: ['Source_URL'],
  lastUpdated: ['Last_Updated'],
  note: ['Transfer_Scope_Note', 'Transfer_Cost_Scope_Note'],
};

/** Parse one spreadsheet into corridor rows (skips rows without usable fee numbers). */
export function loadFeeSheet(csvText) {
  const [header, ...body] = parseCsv(csvText);
  const index = {};
  for (const [key, names] of Object.entries(COLUMNS)) {
    index[key] = header.findIndex((h) => names.includes(h.trim()));
  }
  const get = (r, key) => (index[key] >= 0 ? (r[index[key]] ?? '').trim() : '');
  const rows = [];
  for (const r of body) {
    const row = {
      id: get(r, 'id'),
      origin: get(r, 'origin'),
      originCurrency: get(r, 'originCurrency'),
      dest: get(r, 'dest'),
      destCurrency: get(r, 'destCurrency'),
      provider: get(r, 'provider'),
      overseas: {
        method: get(r, 'overseasMethod'),
        pct: num(get(r, 'overseasPct')),
        flat: num(get(r, 'overseasFlat')) ?? 0,
        sample1000: num(get(r, 'sample1000')),
      },
      domestic: {
        method: get(r, 'domesticMethod'),
        pct: num(get(r, 'domesticPct')) ?? 0,
        flat: num(get(r, 'domesticFlat')) ?? 0,
        cap: num(get(r, 'domesticCap')),
      },
      bankMarkup: range(get(r, 'bankMarkup')),
      sourceUrl: get(r, 'sourceUrl'),
      lastUpdated: get(r, 'lastUpdated'),
      note: get(r, 'note'),
    };
    // A corridor needs two different countries and an overseas percentage to compare against.
    if (row.origin && row.dest && row.origin !== row.dest && row.overseas.pct !== null) rows.push(row);
  }
  return rows;
}

/** Overseas provider fee on `amount` (origin currency): variable % + flat. */
export function overseasFee(row, amount) {
  if (amount <= 0) return 0;
  return (amount * row.overseas.pct) / 100 + row.overseas.flat;
}

/**
 * Domestic rail fee on `amount` (origin currency): flat + variable %, never above the cap.
 * When the sheet gives a flat fee below the cap with no variable part (e.g. "CAD 0.50, cap 1.50"),
 * the real fee lies in that range; `high` is the conservative figure used in totals.
 */
export function domesticFee(row, amount) {
  if (amount <= 0) return { low: 0, high: 0 };
  const { pct, flat, cap } = row.domestic;
  const raw = flat + (amount * pct) / 100;
  const capped = cap !== null && cap > 0 ? Math.min(raw, cap) : raw;
  const high = pct === 0 && cap !== null && cap > flat ? cap : capped;
  return { low: Math.min(capped, high), high };
}

/** Traditional bank FX markup on `amount` (any currency), as [low, high]. */
export function bankMarkupFee(row, amount) {
  if (!row.bankMarkup || amount <= 0) return null;
  return row.bankMarkup.map((p) => (amount * p) / 100);
}

/**
 * Costs (USD) of sending `amountUsd`, of which `matchedUsd` is matched domestically.
 *   fullCrypto: the whole amount on-ramped to USDC, sent on Stellar, off-ramped.
 *   twoWay:     matched part on the origin's domestic rail (from the sheet); the rest via crypto.
 * `fx` = origin-currency units per 1 USD (sheet flats and caps are in the origin currency).
 */
export function corridorCosts(row, { amountUsd, matchedUsd, fx, onrampPct, offrampPct, networkUsd }) {
  const A = Math.max(0, amountUsd);
  const M = Math.min(A, Math.max(0, matchedUsd));
  const U = A - M;
  const toUsd = (originAmount) => originAmount / fx;
  const crypto = (usd, payoutUsd) =>
    usd > 0 ? { onramp: (usd * onrampPct) / 100, network: payoutUsd, offramp: (usd * offrampPct) / 100 } : { onramp: 0, network: 0, offramp: 0 };

  const full = crypto(A, networkUsd.payout);
  const fullCrypto = { ...full, total: full.onramp + full.network + full.offramp };

  const dom = domesticFee(row, M * fx);
  const rest = crypto(U, networkUsd.payout);
  const twoWay = {
    domesticLow: toUsd(dom.low),
    domestic: toUsd(dom.high),
    preauth: networkUsd.preauth,
    ...rest,
  };
  twoWay.total = twoWay.domestic + twoWay.preauth + rest.onramp + rest.network + rest.offramp;

  const overseas = toUsd(overseasFee(row, A * fx));
  const bank = bankMarkupFee(row, A);
  return { amount: A, matched: M, unmatched: U, fullCrypto, twoWay, overseas, bank };
}
