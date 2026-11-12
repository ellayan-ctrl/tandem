import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchCorridor, crossedCorridors, type BookOrder } from './matching.ts';
import { toUnits, formatUnits } from './amounts.ts';

let seq = 0;
const o = (from: string, to: string, usdc: string): BookOrder => {
  seq++;
  return { id: seq, fromCountry: from, toCountry: to, remaining: toUnits(usdc), createdAt: 1000 + seq };
};

test('canonical scenario: FIFO with partial fill', () => {
  seq = 0;
  const book = [o('Canada', 'Kenya', '500'), o('Kenya', 'Canada', '200'), o('Canada', 'Kenya', '300')];
  const r = matchCorridor(book, 'Canada', 'Kenya');
  assert.deepEqual(r.fills, [{ orderAId: 1, orderBId: 2, amount: toUnits('200') }]);
  assert.equal(r.remaining.get(1), toUnits('300'));
  assert.equal(r.remaining.get(2), 0);
  assert.equal(r.remaining.has(3), false, 'Charlie stays untouched behind Alice');
});

test('argument order of the corridor does not matter', () => {
  seq = 0;
  const book = [o('United States', 'Nigeria', '100'), o('Nigeria', 'United States', '60')];
  const r = matchCorridor(book, 'Nigeria', 'United States');
  assert.equal(r.fills[0].amount, toUnits('60'));
  assert.equal(r.remaining.get(1), toUnits('40'));
});

test('decimal amounts settle exactly (no float dust)', () => {
  seq = 0;
  const r1 = matchCorridor([o('A', 'B', '0.1'), o('A', 'B', '0.2'), o('B', 'A', '0.3')], 'A', 'B');
  assert.deepEqual([...r1.remaining.values()], [0, 0, 0]);
  seq = 0;
  const r2 = matchCorridor([o('A', 'B', '10.1'), o('B', 'A', '10.07'), o('B', 'A', '0.03')], 'A', 'B');
  assert.ok([...r2.remaining.values()].every((v) => v === 0));
});

test('many-to-many fills conserve volume', () => {
  seq = 0;
  const book = [o('A', 'B', '7'), o('A', 'B', '3'), o('B', 'A', '4'), o('B', 'A', '4'), o('B', 'A', '4')];
  const r = matchCorridor(book, 'A', 'B');
  const total = r.fills.reduce((s, f) => s + f.amount, 0);
  assert.equal(formatUnits(total), '10');
  assert.equal(r.remaining.get(5), toUnits('2'));
});

test('one-sided corridor produces no fills', () => {
  seq = 0;
  assert.equal(matchCorridor([o('US', 'Mexico', '100')], 'US', 'Mexico').fills.length, 0);
});

test('crossedCorridors finds only corridors with two-way volume', () => {
  seq = 0;
  const book = [o('Canada', 'Kenya', '1'), o('Kenya', 'Canada', '1'), o('US', 'Mexico', '1')];
  assert.deepEqual(crossedCorridors(book), [['Canada', 'Kenya']]);
});

test('toUnits rejects junk and excess precision', () => {
  assert.throws(() => toUnits('-1'));
  assert.throws(() => toUnits('1e3'));
  assert.throws(() => toUnits('0.12345678'));
  assert.equal(toUnits('0.1234567'), 1234567);
});
