import { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check, Copy, ExternalLink, MapPin } from 'lucide-react';

import { api } from '../services/api';

const EXPERT = 'https://stellar.expert/explorer/testnet';
const usd = (v) => `$${(v ?? 0).toFixed(2)}`;

const STATUS = {
  open: { label: 'Waiting for a match', tone: 'amber' },
  partially_matched: { label: 'Partly matched, waiting', tone: 'amber' },
  settled: { label: 'Matched locally', tone: 'emerald' },
  fully_matched: { label: 'Matched locally', tone: 'emerald' },
  payout_pending: { label: 'Sending via Stellar', tone: 'sky' },
  payout_failed: { label: 'Payout failed, retrying', tone: 'rose' },
  fallback_executed: { label: 'Completed', tone: 'emerald' },
  remainder_converted: { label: 'Converted locally (simulated)', tone: 'slate' },
  refunded: { label: 'Unmatched part released', tone: 'slate' },
  cancelled: { label: 'Cancelled', tone: 'slate' },
};
const TONE = {
  amber: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  emerald: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  sky: 'bg-sky-50 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  rose: 'bg-rose-50 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

const REGION_LABEL = {
  'north-america': 'North America',
  latam: 'Latin America',
  europe: 'Europe',
  africa: 'Africa',
  mena: 'Middle East & North Africa',
  asia: 'Asia',
  oceania: 'Oceania',
};

export const MyTransactions = ({ account, onSelectOrder, onLinkBank, onNavigateToSend }) => {
  const [txs, setTxs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
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
      <div className="max-w-3xl mx-auto py-16 px-4 text-center space-y-3">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">My Transactions</h1>
        <p className="text-sm text-slate-500">Link a bank account to see the money you have sent and received.</p>
        <button
          onClick={() => onLinkBank()}
          className="px-4 py-2 text-xs font-semibold rounded-md bg-slate-900 text-white dark:bg-white dark:text-slate-900"
        >
          Link Bank Account
        </button>
        <RampFinder defaultCountry={null} />
      </div>
    );
  }

  const sent = txs.filter((t) => t.direction === 'sent');
  const received = txs.filter((t) => t.direction === 'received');
  const shown = filter === 'sent' ? sent : filter === 'received' ? received : txs;
  const total = (list) => list.reduce((s, t) => s + t.amount, 0);

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
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">My Transactions</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Money sent from and received by {account.displayName} ({account.country}). Other people's transfers are not shown.
          </p>
        </div>
        <div className="text-xs text-slate-500 max-w-full">
          <span className="block mb-1">Your receiving address (share it to get paid):</span>
          <div className="flex items-center gap-1.5">
            <code className="font-mono text-[11px] px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 truncate max-w-[220px] sm:max-w-[360px]">
              {wallet}
            </code>
            <button
              onClick={copyAddress}
              className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Copy address"
              aria-label="Copy receiving address"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <a
              href={`${EXPERT}/account/${wallet}`}
              target="_blank"
              rel="noreferrer"
              className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Open this wallet on Stellar Expert"
              aria-label="Open wallet on Stellar Expert"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Sent" value={usd(total(sent))} note={`${sent.length} transfer${sent.length === 1 ? '' : 's'}`} />
        <Stat label="Received" value={usd(total(received))} note={`${received.length} transfer${received.length === 1 ? '' : 's'}`} />
        <Stat
          label="Moved on-chain"
          value={usd(txs.filter((t) => t.status === 'fallback_executed').reduce((s, t) => s + (t.payoutAmount ?? 0), 0))}
          note="Only the unmatched parts, as USDC on Stellar"
        />
      </div>

      <div className="flex items-center gap-1 text-xs" role="tablist" aria-label="Filter transactions">
        {[
          ['all', `All (${txs.length})`],
          ['sent', `Sent (${sent.length})`],
          ['received', `Received (${received.length})`],
        ].map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={filter === id}
            onClick={() => setFilter(id)}
            className={`px-2.5 py-1 rounded transition-colors ${
              filter === id
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
        {error && <div className="p-4 text-xs text-rose-600">Could not load your transactions: {error}</div>}
        {!error && !loaded && <div className="p-8 text-center text-xs text-slate-400">Loading…</div>}
        {!error && loaded && shown.length === 0 && (
          <div className="p-8 text-center text-xs text-slate-400 space-y-2">
            <div>
              {filter === 'received'
                ? 'Nothing received yet. Share your receiving address above.'
                : filter === 'sent'
                  ? 'You have not sent anything yet.'
                  : 'No transactions yet.'}
            </div>
            {filter !== 'received' && (
              <button onClick={onNavigateToSend} className="underline text-slate-600 dark:text-slate-300">
                Send money
              </button>
            )}
          </div>
        )}
        {shown.map((t) => (
          <TxRow key={`${t.direction}-${t.id}`} tx={t} onOpen={t.direction === 'sent' ? () => onSelectOrder(t) : null} />
        ))}
      </div>

      <RampFinder defaultCountry={account.country} />
    </div>
  );
};

const Stat = ({ label, value, note }) => (
  <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
    <div className="text-[11px] text-slate-500">{label}</div>
    <div className="text-lg font-bold font-mono-numbers text-slate-900 dark:text-white">{value}</div>
    <div className="text-[11px] text-slate-400">{note}</div>
  </div>
);

const TxRow = ({ tx, onOpen }) => {
  const isSent = tx.direction === 'sent';
  const status = STATUS[tx.status] ?? { label: tx.status, tone: 'slate' };
  const unmatched = tx.remainingAmount > 0 ? tx.remainingAmount : (tx.payoutAmount ?? 0);
  const when = new Date(tx.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const Icon = isSent ? ArrowUpRight : ArrowDownLeft;

  const body = (
    <div className="flex items-start gap-3 p-4 text-xs">
      <div
        className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isSent ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300' : 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
        }`}
        aria-hidden="true"
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="font-semibold text-slate-900 dark:text-white truncate">
            {isSent ? `To ${tx.recipientName}` : `From ${tx.senderName}`}
          </span>
          <span className={`font-mono-numbers font-bold ${isSent ? 'text-slate-900 dark:text-white' : 'text-emerald-700 dark:text-emerald-400'}`}>
            {isSent ? '−' : '+'}
            {usd(tx.amount)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
          <span>
            {tx.fromFlag} {tx.fromCountry} → {tx.toFlag} {tx.toCountry}
            {tx.routeVia ? ` (routed via ${tx.routeVia})` : ''}
          </span>
          <span>·</span>
          <span>{when}</span>
          <span>·</span>
          <span className="font-mono">{tx.id}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${TONE[status.tone]}`}>{status.label}</span>
          <span className="text-[11px] text-slate-500 font-mono-numbers">
            {usd(tx.matchedAmount)} matched locally
            {unmatched > 0 ? ` · ${usd(unmatched)} unmatched` : ''}
            {tx.status === 'fallback_executed' && tx.payoutAmount ? ` (${usd(tx.payoutAmount)} sent as USDC)` : ''}
          </span>
          {tx.fallbackTxHash && (
            <a
              href={`${EXPERT}/tx/${tx.fallbackTxHash}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-[11px] text-sky-700 dark:text-sky-400 hover:underline"
            >
              View on Stellar Expert <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );

  return onOpen ? (
    <button onClick={onOpen} className="w-full text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors" title="Open receipt">
      {body}
    </button>
  ) : (
    body
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
    <section className="border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4 text-left">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-slate-500" /> Cash in &amp; cash out near you
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5 max-w-2xl">
            Services that turn local money into USDC on Stellar and back (Stellar anchors and ramps). Listed from the public Stellar
            ecosystem directory for the selected country.
          </p>
        </div>
        <label className="text-[11px] text-slate-500 flex items-center gap-2">
          Country
          <select
            value={country ?? ''}
            onChange={(e) => setCountry(e.target.value)}
            className="text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 py-1"
          >
            {(data?.countries ?? (country ? [country] : [])).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <div className="text-xs text-rose-600">Could not load services: {error}</div>}
      {!error && !data && <div className="text-xs text-slate-400">Loading services…</div>}

      {groups.map(([title, list]) => (
        <div key={title} className="space-y-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {list.map((s) => (
              <div key={s.slug} className="p-3 rounded-md border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-xs space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-slate-900 dark:text-white">{s.name}</span>
                  <span className="text-[10px] text-slate-400">{s.country ?? (s.regions.includes('global') ? 'Global' : REGION_LABEL[s.regions[0]] ?? '')}</span>
                </div>
                {s.tagline && <p className="text-[11px] text-slate-500 leading-snug">{s.tagline}</p>}
                <div className="flex flex-wrap gap-1">
                  {s.cashIn && <Badge>Cash in</Badge>}
                  {s.cashOut && <Badge>Cash out</Badge>}
                  {!s.rampsRecorded && <Badge muted>Ramp types not listed</Badge>}
                  {s.assets.slice(0, 4).map((a) => (
                    <Badge key={a} muted>
                      {a}
                    </Badge>
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5 text-[11px]">
                  {s.cashPoints && (
                    <a href={mapUrl(s.cashPoints)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-sky-700 dark:text-sky-400 hover:underline">
                      <MapPin className="w-3 h-3" /> {s.cashPoints} locations near {coords ? 'you' : 'me'}
                    </a>
                  )}
                  {s.websiteUrl && (
                    <a href={s.websiteUrl} target="_blank" rel="noreferrer" className="text-sky-700 dark:text-sky-400 hover:underline">
                      Website
                    </a>
                  )}
                  {s.profileUrl && (
                    <a href={s.profileUrl} target="_blank" rel="noreferrer" className="text-slate-500 hover:underline">
                      Directory profile
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {data && services.length === 0 && !error && <div className="text-xs text-slate-400">No services listed for {country}.</div>}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400">
        <span>
          Source: {data?.sourceName ?? 'Stellar Scout partner directory'}
          {data?.source === 'snapshot' ? ' (offline copy' : ' (live'}
          {updated ? `, ${updated})` : ')'}.{' '}
          This app runs on testnet: its test USDC cannot be cashed out. Check each provider's fees and availability.
        </span>
        <button onClick={locate} disabled={locating} className="shrink-0 underline text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 text-left">
          {coords ? 'Location set for maps' : locating ? 'Locating…' : 'Use my exact location for maps'}
        </button>
      </div>
    </section>
  );
};

const Badge = ({ children, muted }) => (
  <span
    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
      muted ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
    }`}
  >
    {children}
  </span>
);
