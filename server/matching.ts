/**
 * Pure bilateral matching: FIFO per direction, partial fills, integer amounts.
 * No I/O; the caller persists the result inside a DB transaction.
 */
export interface BookOrder {
  id: number;
  fromCountry: string;
  toCountry: string;
  remaining: number; // integer units
  createdAt: number;
}

export interface Fill {
  orderAId: number; // A→B side
  orderBId: number; // B→A side
  amount: number; // integer units
}

export interface MatchResult {
  fills: Fill[];
  /** New remaining amount per order id, only for orders that changed. */
  remaining: Map<number, number>;
}

const byFifo = (a: BookOrder, b: BookOrder) => a.createdAt - b.createdAt || a.id - b.id;

export function matchCorridor(book: BookOrder[], countryA: string, countryB: string): MatchResult {
  const aToB = book
    .filter((o) => o.fromCountry === countryA && o.toCountry === countryB && o.remaining > 0)
    .map((o) => ({ ...o }))
    .sort(byFifo);
  const bToA = book
    .filter((o) => o.fromCountry === countryB && o.toCountry === countryA && o.remaining > 0)
    .map((o) => ({ ...o }))
    .sort(byFifo);

  const fills: Fill[] = [];
  const remaining = new Map<number, number>();
  let i = 0;
  let j = 0;

  while (i < aToB.length && j < bToA.length) {
    const a = aToB[i];
    const b = bToA[j];
    const amount = Math.min(a.remaining, b.remaining);
    a.remaining -= amount;
    b.remaining -= amount;
    remaining.set(a.id, a.remaining);
    remaining.set(b.id, b.remaining);
    fills.push({ orderAId: a.id, orderBId: b.id, amount });
    if (a.remaining === 0) i++;
    if (b.remaining === 0) j++;
  }

  return { fills, remaining };
}

/** Unordered corridor key, e.g. "Canada::Kenya". */
export function corridorKey(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}

/** Every corridor that currently has resting volume in both directions. */
export function crossedCorridors(book: BookOrder[]): Array<[string, string]> {
  const dirs = new Set(book.filter((o) => o.remaining > 0).map((o) => `${o.fromCountry}\u0000${o.toCountry}`));
  const out = new Map<string, [string, string]>();
  for (const d of dirs) {
    const [from, to] = d.split('\u0000');
    if (dirs.has(`${to}\u0000${from}`)) {
      const [x, y] = corridorKey(from, to);
      out.set(`${x}\u0000${y}`, [x, y]);
    }
  }
  return [...out.values()];
}
