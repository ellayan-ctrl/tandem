// Run: npm run test:js   (Node's built-in test runner; no extra packages)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { bankMarkupFee, corridorCosts, domesticFee, loadFeeSheet, overseasFee, parseCsv } from './feeSheet.js';

const SHEETS = ['verified_fee_matrix.csv', 'matched_fee_matrix.csv'].map((f) => ({
  file: f,
  text: readFileSync(new URL(`../../shared/fees/${f}`, import.meta.url), 'utf8'),
}));

/** Independent, naive reading of the same file (these CSVs contain no quoted commas). */
const naive = (text) => {
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const h = head.split(',');
  return lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [h[i], v])));
};
const pick = (rec, ...names) => names.map((n) => rec[n]).find((v) => v !== undefined);

test('the CSV parser handles quotes, embedded commas, escaped quotes and CRLF', () => {
  const rows = parseCsv('a,b,c\r\n"x, y","say ""hi""",3\r\n\r\nlast,,"multi\nline"');
  assert.deepEqual(rows, [
    ['a', 'b', 'c'],
    ['x, y', 'say "hi"', '3'],
    ['last', '', 'multi\nline'],
  ]);
});

for (const { file, text } of SHEETS) {
  test(`${file}: every corridor row matches an independent reading of the file`, () => {
    const rows = loadFeeSheet(text);
    const expected = naive(text).filter(
      (r) => r.Origin_Country !== r.Destination_Country && !/^n\/?a$/i.test(pick(r, 'Overseas_Variable_Fee_Pct', 'Overseas_Transfer_Fee_Pct')),
    );
    assert.equal(rows.length, expected.length);
    rows.forEach((row, i) => {
      const r = expected[i];
      assert.equal(row.id, r.Corridor_ID);
      assert.equal(row.origin, r.Origin_Country);
      assert.equal(row.dest, r.Destination_Country);
      assert.equal(row.overseas.pct, parseFloat(pick(r, 'Overseas_Variable_Fee_Pct', 'Overseas_Transfer_Fee_Pct')));
      assert.equal(row.overseas.flat, parseFloat(r.Overseas_Flat_Fee_Origin_Curr));
      assert.equal(row.domestic.pct, parseFloat(pick(r, 'Domestic_Variable_Fee_Pct', 'Domestic_Transfer_Fee_Pct')));
      assert.equal(row.domestic.flat, parseFloat(r.Domestic_Flat_Fee_Origin_Curr));
      assert.equal(row.domestic.cap, parseFloat(r.Domestic_Fee_Cap_Origin_Curr));
      const markup = r.Traditional_Bank_FX_Markup_Pct.split('-').map(parseFloat);
      assert.deepEqual(row.bankMarkup, [Math.min(...markup), Math.max(...markup)]);
    });
  });

  test(`${file}: fee formulas behave on every row`, () => {
    for (const row of loadFeeSheet(text)) {
      for (const amount of [1, 37.5, 250, 1000, 5000]) {
        // Overseas: exactly % of amount + flat.
        assert.ok(Math.abs(overseasFee(row, amount) - ((amount * row.overseas.pct) / 100 + row.overseas.flat)) < 1e-9);
        // Domestic: never negative, never above the cap, low <= high.
        const d = domesticFee(row, amount);
        assert.ok(d.low >= 0 && d.low <= d.high);
        if (row.domestic.cap > 0) assert.ok(d.high <= row.domestic.cap + 1e-9, row.id);
        // Bank markup range scales with the amount.
        const b = bankMarkupFee(row, amount);
        assert.ok(b[0] <= b[1] && Math.abs(b[1] - (amount * row.bankMarkup[1]) / 100) < 1e-9);
      }
      assert.equal(overseasFee(row, 0), 0);
      assert.deepEqual(domesticFee(row, 0), { low: 0, high: 0 });
    }
  });

  test(`${file}: TwoWay costs add up at every matched amount`, () => {
    const net = { preauth: 0.0001, payout: 0.0018 };
    for (const row of loadFeeSheet(text)) {
      const fx = 1 + Math.random() * 100;
      const opts = { amountUsd: 1000, fx, onrampPct: 0.6, offrampPct: 2, networkUsd: net };
      for (const matchedUsd of [0, 1, 333, 999, 1000]) {
        const c = corridorCosts(row, { ...opts, matchedUsd });
        assert.ok(Math.abs(c.matched + c.unmatched - 1000) < 1e-9);
        // Full crypto: ramps on the whole amount, independent of matching.
        assert.ok(Math.abs(c.fullCrypto.total - (1000 * 2.6) / 100 - net.payout) < 1e-9);
        // TwoWay: domestic fee on the matched part (from the sheet, converted at fx) + crypto on the rest.
        const expectedDomestic = domesticFee(row, matchedUsd * fx).high / fx;
        const expectedCrypto = c.unmatched > 0 ? (c.unmatched * 2.6) / 100 + net.payout : 0;
        assert.ok(Math.abs(c.twoWay.total - (expectedDomestic + net.preauth + expectedCrypto)) < 1e-9, row.id);
      }
      // Nothing matched: TwoWay is the full crypto route plus the pre-authorization fee.
      const none = corridorCosts(row, { ...opts, matchedUsd: 0 });
      assert.ok(Math.abs(none.twoWay.total - none.fullCrypto.total - net.preauth) < 1e-9);
      // Everything matched: no ramps at all.
      const all = corridorCosts(row, { ...opts, matchedUsd: 1000 });
      assert.equal(all.twoWay.onramp + all.twoWay.offramp + all.twoWay.network, 0);
    }
  });
}
