import { useEffect, useState } from 'react';
import { Check, ChevronDown, Copy, ExternalLink, MapPin } from 'lucide-react';

import { TONE, statusOf } from '../data/orderStatus';
import { api } from '../services/api';
import { AnchorCashOut } from './AnchorCashOut';
import { RouteKey, RouteStrip, Station, splitOf, usd } from './Route';

const EXPERT = 'https://stellar.expert/explorer/testnet';

const REGION_LABEL = {
  'north-america': 'North America',
  latam: 'Latin America',
  europe: 'Europe',
  africa: 'Africa',
  mena: 'Middle East & North Africa',
  asia: 'Asia',
  oceania: 'Oceania',
};

const when = (ts) => {
  const d = new Date(ts);
  return {
    date: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
    time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
  };
};

export const MyTransactions = ({ account, onSelectOrder, onLinkBank, onNavigateToSend }) => {
  const [txs, setTxs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [openRow, setOpenRow] = useState(null);
  const [copied, setCopied] = useState(false);
  const wallet = account?.wallet?.publicKey;

  useEffect(() => {
    if (!wallet) return undefined;
    let alive = true;
    const load = async () => {
      try {
        const fresh = await api.myTransactions();
        if (alive) {
          setTxs(fresh);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e.message);
      } finally {
        if (alive) setLoaded(true);
      }
    };
    setLoaded(false);
    load();
    const t = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [wallet]);

  if (!account) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16 space-y-8">
        <div className="panel px-6 py-10 sm:px-10 max-w-2xl">
          <h1 className="text-[32px] leading-tight font-semibold">My transfers</h1>
          <p className="mt-2 text-slate-600 text-base">
            Link a bank account to see what you have sent and received, and how much of each transfer was paid locally.
          </p>
          <button
            onClick={() => onLinkBank()}
            className="mt-6 h-11 px-5 rounded-sm bg-ink text-white font-semibold hover:bg-slate-800 transition-colors"
          >
            Link bank account
          </button>
        </div>
        <RampFinder defaultCountry={null} />
      </div>
    );
  }

  const sent = txs.filter((t) => t.direction === 'sent');
  const received = txs.filter((t) => t.direction === 'received');
  const shown = filter === 'sent' ? sent : filter === 'received' ? received : txs;
  const total = (list) => list.reduce((s, t) => s + t.amount, 0);
  const sentSplit = sent.map(splitOf).reduce(
    (a, s) => ({ local: a.local + s.local, cross: a.cross + s.cross, waiting: a.waiting + s.waiting }),
    { local: 0, cross: 0, waiting: 0 },
  );

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(wallet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked: the address is still visible to select by hand
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5">
        <div>
          <h1 className="text-[32px] leading-tight font-semibold tracking-[-0.01em]">My transfers</h1>
          <p className="mt-1.5 text-slate-600 text-base">
            Sent from and received by {account.displayName} in {account.country}. Nobody else&apos;s transfers appear here.
          </p>
        </div>
        <div className="min-w-0">
          <span className="label">Your receiving address</span>
          <div className="mt-1.5 flex items-center gap-1.5">
            <code className="font-mono text-[13px] px-2.5 h-9 inline-flex items-center rounded-sm bg-white ring-1 ring-inset ring-slate-300 truncate max-w-[15rem] sm:max-w-[26rem]">
              {wallet}
            </code>
            <button
              onClick={copyAddress}
              className="w-9 h-9 inline-flex items-center justify-center rounded-sm ring-1 ring-inset ring-slate-300 bg-white hover:ring-ink transition-colors"
              aria-label={copied ? 'Address copied' : 'Copy receiving address'}
              title="Copy address"
            >
              {copied ? <Check className="w-4 h-4 text-local" /> : <Copy className="w-4 h-4" />}
            </button>
            <a
              href={`${EXPERT}/account/${wallet}`}
              target="_blank"
              rel="noreferrer"
              className="w-9 h-9 inline-flex items-center justify-center rounded-sm ring-1 ring-inset ring-slate-300 bg-white hover:ring-ink transition-colors"
              aria-label="Open your wallet on Stellar Expert"
              title="Open on Stellar Expert"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>

      {/* Totals, with the route strip of everything sent */}
      <section className="panel grid md:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.6fr)]" aria-label="Totals">
        {[
          ['Sent', usd(total(sent)), `${sent.length} transfer${sent.length === 1 ? '' : 's'}`],
          ['Received', usd(total(received)), `${received.length} transfer${received.length === 1 ? '' : 's'}`],
          ['Crossed on Stellar', usd(sentSplit.cross), 'Only unmatched parts, as USDC'],
        ].map(([label, value, note]) => (
          <div key={label} className="px-5 py-4 border-b md:border-b-0 md:border-r border-slate-200">
            <div className="text-slate-600">{label}</div>
            <div className="text-2xl font-semibold mt-0.5">{value}</div>
            <div className="text-sm text-slate-600">{note}</div>
          </div>
        ))}
        <div className="px-5 py-4">
          <div className="text-slate-600">Where your sent money went</div>
          <RouteStrip
            from={account.country}
            to="your recipients"
            local={sentSplit.local}
            cross={sentSplit.cross}
            waiting={sentSplit.waiting}
            height="md"
            className="mt-3"
          />
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 md:grid-cols-1 xl:grid-cols-3 gap-x-4 gap-y-1 text-sm">
            <RouteKey kind="local" label="Local" value={usd(sentSplit.local)} />
            <RouteKey kind="cross" label="Stellar" value={usd(sentSplit.cross)} />
            <RouteKey kind="waiting" label="Waiting" value={usd(sentSplit.waiting)} />
          </div>
        </div>
      </section>

      <div className="flex items-center gap-1 border-b border-slate-300" role="tablist" aria-label="Filter transfers">
        {[
          ['all', 'All', txs.length],
          ['sent', 'Sent', sent.length],
          ['received', 'Received', received.length],
        ].map(([id, label, n]) => (
          <button
            key={id}
            role="tab"
            aria-selected={filter === id}
            onClick={() => setFilter(id)}
            className={`relative h-11 px-3.5 font-medium transition-colors ${filter === id ? 'text-ink' : 'text-slate-600 hover:text-ink'}`}
          >
            {label} <span className="text-slate-500 font-normal">{n}</span>
            <span aria-hidden="true" className={`absolute left-2 right-2 -bottom-px h-[3px] ${filter === id ? 'bg-ink' : ''}`} />
          </button>
        ))}
      </div>

      <section className="panel" aria-label="Transfers">
        <div className="hidden md:grid grid-cols-[6.5rem_minmax(0,1.3fr)_minmax(0,1.5fr)_7rem_11rem_1.25rem] gap-4 px-5 py-2.5 border-b border-slate-200 label">
          <span>Date</span>
          <span>Transfer</span>
          <span>Route</span>
          <span className="text-right">Amount</span>
          <span>Status</span>
          <span />
        </div>
        {error && <p className="px-5 py-4 text-rose-700">Could not load your transfers: {error}</p>}
        {!error && !loaded && <p className="px-5 py-10 text-center text-slate-600">Loading your transfers…</p>}
        {!error && loaded && shown.length === 0 && (
          <div className="px-5 py-12 text-center">
            <p className="text-slate-600">
              {filter === 'received'
                ? 'Nothing received yet. Share your receiving address to get paid.'
                : filter === 'sent'
                  ? 'You have not sent anything yet.'
                  : 'No transfers yet.'}
            </p>
            {filter !== 'received' && (
              <button onClick={onNavigateToSend} className="mt-4 h-10 px-4 rounded-sm bg-ink text-white font-semibold hover:bg-slate-800">
                Send money
              </button>
            )}
          </div>
        )}
        <ul className="divide-y divide-slate-200">
          {shown.map((t) => {
            const key = `${t.direction}-${t.id}`;
            return (
              <TxRow
                key={key}
                tx={t}
                open={openRow === key}
                onToggle={() => setOpenRow(openRow === key ? null : key)}
                onReceipt={t.direction === 'sent' ? () => onSelectOrder(t) : null}
              />
            );
          })}
        </ul>
      </section>

      <AnchorCashOut account={account} />

      <RampFinder defaultCountry={account.country} />
    </div>
  );
};

const TxRow = ({ tx, open, onToggle, onReceipt }) => {
  const isSent = tx.direction === 'sent';
  const status = statusOf(tx.status);
  const split = splitOf(tx);
  const w = when(tx.createdAt);
  const detailId = `tx-${tx.direction}-${tx.id}`;

  return (
    <li>
      <button
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={detailId}
        className={`w-full text-left grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[6.5rem_minmax(0,1.3fr)_minmax(0,1.5fr)_7rem_11rem_1.25rem] gap-x-4 gap-y-2 items-center px-5 py-3.5 transition-colors ${
          open ? 'bg-slate-50' : 'hover:bg-slate-50'
        }`}
      >
        <span className="hidden md:block">
          <span className="block font-medium">{w.date}</span>
          <span className="block text-sm text-slate-600">{w.time}</span>
        </span>
        <span className="min-w-0">
          <span className="block font-semibold truncate">{isSent ? `To ${tx.recipientName}` : `From ${tx.senderName}`}</span>
          <span className="block text-sm text-slate-600 truncate">
            <span className="md:hidden">
              {w.date}, {w.time} ·{' '}
            </span>
            {tx.fromCountry} → {tx.toCountry}
            {tx.routeVia ? `, routed via ${tx.routeVia}` : ''}
          </span>
        </span>
        <span className="md:hidden text-right font-semibold">
          {isSent ? '−' : '+'}
          {usd(tx.amount)}
        </span>
        <span className="col-span-2 md:col-span-1 flex items-center gap-2 min-w-0">
          <Station country={tx.fromCountry} size="sm" />
          <RouteStrip from={tx.fromCountry} to={tx.toCountry} {...split} waiting={split.waiting + split.released} height="sm" className="flex-1 min-w-0" />
          <Station country={tx.toCountry} size="sm" />
        </span>
        <span className={`hidden md:block text-right font-semibold ${isSent ? '' : 'text-emerald-700'}`}>
          {isSent ? '−' : '+'}
          {usd(tx.amount)}
        </span>
        <span className="flex items-center justify-between md:justify-start gap-2 col-span-2 md:col-span-1">
          <span className={`px-2 py-0.5 rounded-xs text-[13px] font-semibold whitespace-nowrap ${TONE[status.tone]}`}>{status.label}</span>
          <ChevronDown className={`md:hidden w-4 h-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </span>
        <ChevronDown className={`hidden md:block w-4 h-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div id={detailId} className="px-5 pb-5 pt-1 bg-slate-50 grid gap-5 md:grid-cols-[6.5rem_minmax(0,1fr)] text-[15px]">
          <span className="hidden md:block" />
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <RouteKey kind="local" label="Paid locally" value={usd(split.local)} />
              {split.cross > 0 && <RouteKey kind="cross" label="Crossed on Stellar (USDC)" value={usd(split.cross)} />}
              {split.waiting > 0 && <RouteKey kind="waiting" label="Still waiting for a match" value={usd(split.waiting)} />}
              {split.released > 0 && <RouteKey kind="waiting" label="Unmatched, released" value={usd(split.released)} />}
              <p className="pt-1 text-sm text-slate-600 font-mono">{tx.id}</p>
            </div>
            <div className="space-y-2">
              <span className="label">Proof</span>
              {tx.fallbackTxHash ? (
                <a href={`${EXPERT}/tx/${tx.fallbackTxHash}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 font-medium text-cross hover:underline">
                  Stellar payment {tx.fallbackTxHash.slice(0, 10)}… <ExternalLink className="w-3.5 h-3.5" />
                </a>
              ) : (
                <p className="text-slate-600">
                  {split.local > 0 && split.cross === 0
                    ? 'Matched part settled locally, so nothing went on-chain.'
                    : 'No on-chain payment yet.'}
                </p>
              )}
              {onReceipt && (
                <button
                  onClick={onReceipt}
                  className="mt-1 h-9 px-3.5 rounded-sm ring-1 ring-inset ring-ink font-semibold hover:bg-white transition-colors"
                >
                  Open receipt
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </li>
  );
};

/** Cash-in / cash-out services for a country, live from the Stellar Scout directory (via the server). */
export const RampFinder = ({ defaultCountry }) => {
  const [country, setCountry] = useState(defaultCountry);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [coords, setCoords] = useState(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => setCountry(defaultCountry), [defaultCountry]);

  useEffect(() => {
    let alive = true;
    setError(null);
    api
      .ramps(country)
      .then((d) => {
        if (!alive) return;
        setData(d);
        if (!country && d.countries?.length) setCountry(d.countries[0]);
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [country]);

  const locate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCoords({ lat: p.coords.latitude.toFixed(4), lng: p.coords.longitude.toFixed(4) });
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 10000 },
    );
  };
  const mapUrl = (place) =>
    coords
      ? `https://www.google.com/maps/search/${encodeURIComponent(place)}/@${coords.lat},${coords.lng},14z`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place} near me`)}`;

  const services = data?.country === country ? data.services : [];
  const groups = [
    ['in-country', `Based in ${country}`],
    ['regional', `Serving ${REGION_LABEL[data?.region] ?? 'the region'}`],
    ['global', 'Available worldwide'],
  ]
    .map(([scope, title]) => [title, services.filter((s) => s.scope === scope)])
    .filter(([, list]) => list.length > 0);
  const updated = data?.generatedAt ? new Date(data.generatedAt).toLocaleDateString(undefined, { dateStyle: 'medium' }) : null;

  return (
    <section className="panel px-5 py-5 space-y-5 text-left" aria-labelledby="ramps-h">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 id="ramps-h" className="text-lg font-semibold">
            Cash in and cash out near you
          </h2>
          <p className="mt-0.5 text-slate-600 max-w-2xl">
            Services that turn local money into USDC on Stellar and back, from the public Stellar ecosystem directory.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Country
          <select value={country ?? ''} onChange={(e) => setCountry(e.target.value)} className="field !w-auto !py-1.5 !text-sm">
            {(data?.countries ?? (country ? [country] : [])).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="text-rose-700">Could not load services: {error}</p>}
      {!error && !data && <p className="text-slate-600">Loading services…</p>}

      {groups.map(([title, list]) => (
        <div key={title} className="space-y-2">
          <h3 className="label">{title}</h3>
          <ul className="grid grid-cols-1 md:grid-cols-2 border-t border-slate-200">
            {list.map((s) => (
              <li key={s.slug} className="py-3 md:odd:pr-5 md:even:pl-5 border-b border-slate-200 space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold">{s.name}</span>
                  <span className="text-sm text-slate-600">
                    {s.country ?? (s.regions.includes('global') ? 'Global' : (REGION_LABEL[s.regions[0]] ?? ''))}
                  </span>
                </div>
                {s.tagline && <p className="text-sm text-slate-600 leading-snug">{s.tagline}</p>}
                <div className="flex flex-wrap gap-1">
                  {s.cashIn && <Badge>Cash in</Badge>}
                  {s.cashOut && <Badge>Cash out</Badge>}
                  {!s.cashIn && !s.cashOut && <span className="text-sm text-slate-600">Cash in/out not stated: check their website</span>}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-0.5 text-sm">
                  {s.cashPoints && (
                    <a href={mapUrl(s.cashPoints)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-cross hover:underline">
                      <MapPin className="w-3.5 h-3.5" /> {s.cashPoints} locations near {coords ? 'you' : 'me'}
                    </a>
                  )}
                  {s.websiteUrl && (
                    <a href={s.websiteUrl} target="_blank" rel="noreferrer" className="text-cross hover:underline">
                      Website
                    </a>
                  )}
                  {s.profileUrl && (
                    <a href={s.profileUrl} target="_blank" rel="noreferrer" className="text-slate-600 hover:underline">
                      Directory profile
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {data && services.length === 0 && !error && <p className="text-slate-600">No services listed for {country}.</p>}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 text-sm text-slate-600">
        <span>
          Source: {(data?.sourceName ?? 'Stellar Scout partner directory').replace(/\s*\(.*\)\s*$/, '')} (
          {data?.source === 'snapshot' ? 'offline copy' : 'live'}
          {updated ? `, ${updated}` : ''}). Test USDC on this network can&apos;t be cashed out. Check each provider&apos;s fees.
        </span>
        <button onClick={locate} disabled={locating} className="shrink-0 font-medium text-ink hover:underline text-left">
          {coords ? 'Location set for maps' : locating ? 'Locating…' : 'Use my location for maps'}
        </button>
      </div>
    </section>
  );
};

const Badge = ({ children, muted }) => (
  <span className={`px-1.5 py-0.5 rounded-xs text-[12px] font-semibold ${muted ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-800'}`}>
    {children}
  </span>
);
