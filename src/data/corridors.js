/**
 * The app's country pairs, from shared/corridors.json (the single list every tab uses).
 */
import data from '../../shared/corridors.json';

const country = (name) => ({ name, ...data.countries[name] });

/** [{ id, countryA: {name, code, flag, currency, sheetName, region}, countryB, description }] */
export const CORRIDORS = data.pairs.map((p) => ({ id: p.id, countryA: country(p.a), countryB: country(p.b), description: p.description }));

/** Country names, in the order they first appear in the pairs. */
export const COUNTRIES = [...new Set(data.pairs.flatMap((p) => [p.a, p.b]))];

export const FLAGS = Object.fromEntries(Object.entries(data.countries).map(([name, c]) => [name, c.flag]));

/** Is a -> b (either direction) one of the app's pairs? */
export const isPair = (a, b) => data.pairs.some((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a));

/** Countries paired with `name`. */
export const partnersOf = (name) => data.pairs.flatMap((p) => (p.a === name ? [p.b] : p.b === name ? [p.a] : []));

/** App country name -> the name the fee spreadsheets use (e.g. "European Union" -> "Eurozone"). */
export const SHEET_NAME = Object.fromEntries(Object.entries(data.countries).map(([name, c]) => [name, c.sheetName]));
