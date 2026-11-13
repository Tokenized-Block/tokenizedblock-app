/* The real memory circuit of the fly (hemibrain v1.2, Janelia FlyEM, CC BY 4.0) living READ-ONLY on a tokenized stock's real trades.
 * The brain and the protocol live in fly-core.js, shared with the server; this file only shows them: the map, the log, the gauges, the
 * beats, the memory kept in this browser, and the server's shared fly.
 * Price: /api/fly/price/<address> (the stock's Aerodrome pool, slot0, 24/7). Trades: /api/activite/<address> (Transfer logs, each
 * confirmed by its transaction's signer). Reference: /api/actions/reference/ (Chainlink) shown, never fed. Shared fly: /api/fly/state. */
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { createFly, createSession, foreseeNext, decide, recordEdge, gasUsdCote, FLY } from './fly-core.js';
import { checkPlanCalls } from './fly-guard.js';
import { roundTripCost, SIZES_USDC } from './fly-pourquoi.js';
import { holdAction, holdLines, HOLD, HOLD_MIN_BUY_USDC } from './fly-hold.js';
import { memoryFingerprint, sealData, checkSeal } from './fly-seal.js';
import { dayOf, countedToday, mayTrade, reserveTrade, volume24h, mayBuyVolume, reserveVolume, verdictPerte } from './fly-day.js';
import { USDC_BASE, displayShort } from './frais-creation.js';
import { selecteur } from './keccak.js';

/* Order: 24 h volume measured by Coinbase search_tokens on 2026-11-07 (mesures/coinbase-actions-20261107.json). ADDRESSES come from the
 * registry, never from here. */
const ORDER = ['SNDKc', 'MSTRc', 'SPCXc', 'NVDAc', 'AMZNc', 'GOOGLc', 'METAc', 'MSFTc', 'TSLAc', 'MUc', 'AAPLc', 'PLTRc'];
/* then every other stock of the measured pool table with at least 10,000 USDC in its pool (the liquidity rule of misables.js), deepest
 *   first: a near-empty pool would give absurd orders */
const LIQUIDITE_MIN_USDC = 10000;
const STOCKS = [...ORDER.map((s) => [...POOLS_ACTIONS_AERODROME.entries()].find(([, t]) => t.symbole === s)).filter(Boolean),
  ...[...POOLS_ACTIONS_AERODROME.entries()].filter(([, t]) => !ORDER.includes(t.symbole) && t.usdcMesure >= LIQUIDITE_MIN_USDC).sort((a, b) => b[1].usdcMesure - a[1].usdcMesure)]
  .map(([address, t]) => ({ address, symbol: t.symbole }));

const COLOR = { PN: '#4fd1c5', KC: '#f6c453', MBON: '#f472b6', DAN: '#a78bfa', APL: '#f87171' };
const FAMILIES = ['PN', 'KC', 'MBON', 'DAN', 'APL'];
const POLL_MS = 30000, REF_MS = 60000, SHARED_MS = 20000;

const canvas = document.getElementById('canvas'), ctx = canvas.getContext('2d');
const spark = document.getElementById('spark'), sctx = spark.getContext('2d');
const $ = (id) => document.getElementById(id);
const fmt = (x, d = 2) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x, d = 2) => (x > 0 ? '+' : x < 0 ? '−' : '') + fmt(Math.abs(x) * 100, d) + '%';
/* 2026-11-08 (Phil: "update the date of the test"): every log line carries its local date, not only the time — a log read the next day says which day */
const clock = (t = Date.now()) => { const d = new Date(t), p = (x) => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); };
const mixText = (mix) => Object.entries(mix).filter(([, v]) => v > 0).map(([k, v]) => `${k} $${fmt(v, 0)}`).join(', ') || 'nothing';
/* text from the server, a node or storage, before it enters HTML (security review H2) */
const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SAY = { approach: 'leans toward it', avoid: 'pulls away from it', undecided: 'is undecided', quiet: 'barely reacts' };

let fly = null, shadow = null, session = null, N = [], act = new Float64Array(0);
let current = STOCKS[0], lastPrice = null, history = [], timer = null, refTimer = null;

function log(text, kind, link) {
  const p = document.createElement('p'); if (kind) p.className = kind;
  p.textContent = clock() + ' · ' + text;
  if (link) { const a = document.createElement('a'); a.href = link.href; a.textContent = link.text; a.target = '_blank'; a.rel = 'noopener'; p.append(' · ', a); }
  $('log').prepend(p);
  while ($('log').children.length > 80) $('log').lastChild.remove();
}

/* Deterministic layout: PNs left, Kenyon cells centre, MBONs right (approach side above, avoid side below), dopamine arc, APL at the core. */
function place(neurons) {
  const W = canvas.width, H = canvas.height, by = {};
  for (const n of neurons) (by[n.family] = by[n.family] || []).push(n);
  const cloud = (list, cx, cy, rx, ry) => list.forEach((n, i) => {
    const t = i * 2.399963, r = Math.sqrt((i + 0.5) / list.length);
    n.x = cx + rx * r * Math.cos(t); n.y = cy + ry * r * Math.sin(t);
  });
  cloud(by.PN || [], W * 0.15, H * 0.42, W * 0.11, H * 0.30);
  cloud(by.KC || [], W * 0.50, H * 0.36, W * 0.15, H * 0.24);
  const mb = by.MBON || [];
  cloud(mb.filter((n) => n.valence === 'approach'), W * 0.86, H * 0.25, W * 0.06, H * 0.13);
  cloud(mb.filter((n) => n.valence !== 'approach'), W * 0.86, H * 0.58, W * 0.06, H * 0.13);
  (by.DAN || []).forEach((n, i, l) => { const t = Math.PI * (0.12 + 0.76 * (i / Math.max(1, l.length - 1))), j = (i % 5) * 9;
    n.x = W * 0.5 - (W * 0.38 + j) * Math.cos(t); n.y = H * 0.50 + (H * 0.36 + j) * Math.sin(t) * 0.9; });
  (by.APL || []).forEach((n) => { n.x = W * 0.50; n.y = H * 0.70; });
}

/* ── EVENTS from fly-core, shown. The shared fly's events (server) use the same shapes. ── */
let flash = [];
function showTrace(e, kind) {
  const until = Date.now() + 6000; flash = e.top.map(({ i, j }) => [i, j, until]);
  if (!e.weakened) { log('… no synapse changed enough to show (below 0.2%)', kind); return; }
  log(`… ${e.weakened} synapses weakened (${Object.entries(e.sides).map(([s, c]) => c + ' ' + s + ' side').join(', ')}); strongest: `
    + e.top.slice(0, 3).map(({ i, j, d }) => `${N[i].type} #${N[i].id} → ${N[j].type} ${pct(d, 1)}`).join(' · '), kind);
}
function show(e, symbol) {
  const kind = e.sim ? 'sim' : 'live';
  if (e.type === 'skipped') log(`${e.n} recent transactions already on chain: the fly starts smelling from the next ones`);
  else if (e.type === 'tx') log(`${e.kind}: ${fmt(e.units, 4)} ${symbol} ($${fmt(e.usd, 0)})`, 'live', { href: 'https://basescan.org/tx/' + e.tx, text: 'tx ' + e.tx.slice(0, 10) + '…' });
  else if (e.type === 'predict') log(`smells ${mixText(e.mix)} → the circuit ${SAY[e.word]} (approach ${fmt(e.ap * 100, 1)}% / avoid ${fmt(e.av * 100, 1)}% of a naive fly)${e.sim ? '' : ' — prediction for the next window'}`, kind);
  else if (e.type === 'taught') { log(`taught: ${mixText(e.mix)} was followed by ${pct(e.move, 3)} → ${e.move > 0 ? 'reward (PAM)' : 'punishment (PPL1)'} dopamine ${fmt(e.strength * 100, 0)}%`, kind); showTrace(e, kind); }
  else if (e.type === 'verdict') log(`consequence: predicted ${e.prediction}, the price moved ${pct(e.move, 3)} → ${e.kind === 'flat' ? 'flat, no verdict' : e.kind === 'consistent' ? 'it matched' : 'it went the other way'}`, 'verdict');
}
/* ── THE FLY TRADER: its decision on the live smell, said in full, with how sure it is. Scored as if each were a trade (simulated); real orders only through the cards of band 3. Never advice. ── */
const ACT = { buy: 'BUY', sell: 'SELL', hold: 'HOLD', stay_out: 'STAY OUT' };
let lastDecision = null, simOnLive = false;
function renderDecision(e) {
  lastDecision = e;
  const el = $('verdict'); el.textContent = (e.sim ? 'SIMULATED · ' : '') + ACT[e.action]
    + (e.action === 'stay_out' ? (e.word === 'avoid' ? ' · repelled' : ' · not drawn') : e.action === 'hold' ? (e.word === 'approach' ? ' · still drawn' : ' · not repelled') : '');
  el.className = 'decision ' + e.action; void el.offsetWidth; el.classList.add('flash');
  const n = Object.values(e.mix).filter((v) => v > 0).length;
  /* who taught it: real windows, or (for a simulation) the move just injected — said as it is */
  const fell = e.sim ? 'the injected move was a <b>fall</b> (punishment dopamine), on top of what real windows taught it' : 'windows that smelled like this were followed by <b>falls</b> (punishment dopamine)';
  const rose = e.sim ? 'the injected move was a <b>rise</b> (reward dopamine), on top of what real windows taught it' : 'windows that smelled like this were followed by <b>rises</b> (reward dopamine)';
  const sure = Number.isFinite(e.t) ? `It is ${fmt(Math.abs(e.t) * 100, 1)}% sure ${e.t >= 0 ? 'toward' : 'away'}; it acts from ${fmt((e.threshold ?? 0.02) * 100, 1)}% (its boldness, below). ` : '';
  const memory0 = Math.abs(e.ap - e.av) < 0.005
    ? (e.ap > 0.995 ? 'It has learned nothing yet about this smell: both sides answer like a naive fly.'
      : `It has learned this smell both ways about equally (approach ${fmt(e.ap * 100, 1)}%, avoid ${fmt(e.av * 100, 1)}% of a naive fly): rises and falls cancel out, no pull either way.`)
    : e.ap < e.av ? `Its approach synapses for this smell are weaker (<b>${fmt(e.ap * 100, 1)}%</b> left, avoid side ${fmt(e.av * 100, 1)}%): ${fell}.`
      : `Its avoid synapses for this smell are weaker (<b>${fmt(e.av * 100, 1)}%</b> left, approach side ${fmt(e.ap * 100, 1)}%): ${rose}.`;
  const memory = sure + memory0;
  const rule = e.action === 'buy' ? 'It was out of the stock and is drawn to this smell: <b>it buys</b> (on paper).'
    : e.action === 'sell' ? 'It held the stock and is repelled by this smell: <b>it sells</b> (on paper).'
      : e.action === 'hold' ? 'It holds the stock and this smell does not repel it: <b>it keeps it</b>.'
        : 'It is out, and this smell does not draw it in: <b>it stays out</b>.';
  $('why').innerHTML = `${e.sim ? (simOnLive ? '<b>Simulation</b> on the smell of the last real window. ' : '<b>Simulation</b> on a stand-in smell (no real trade smelled yet). ') : ''}`
    + `<b>Smelled</b>${e.sim && !simOnLive ? '' : ' in the last window'}: ${mixText(e.mix)} (${n} kind${n > 1 ? 's' : ''} of trade). `
    + `${memory} ${rule} <span class="state">${auto.s && auto.s.running ? 'Its own wallet acts on its live decisions with real money, from what it really holds, not from this paper position: its log (band 3) says what it did; not advice.' : 'Simulated score only, not advice.'} Judged on the next window's price.</span>`;
}

/* ── TRADE FOR REAL: the user's own wallet signs each order the fly proposes. The fly NEVER signs, nothing is sent without a click.
 * The order is built and simulated by the app's own planner (/api/rails/plan, the same one as the control panel): approvals first,
 * then the swap, re-planned after the approvals. BUY spends the user's budget in USDC; SELL sells the whole stock balance read on chain.
 * ⛔ A simulated decision never proposes a real order. "Stop" ends proposals at once. ── */
const live = { account: null, stopped: false, plan: null, action: null, busy: false, decimals: null };
const eth = () => (typeof window !== 'undefined' ? window.ethereum : null);
function liveSay(t) { $('liveState').textContent = t; }
async function connect() {
  if (!eth()) { liveSay('No browser wallet found on this page (install one, or open the page inside your wallet).'); return; }
  try {
    const accs = await eth().request({ method: 'eth_requestAccounts' });
    const chain = await eth().request({ method: 'eth_chainId' });
    if (String(chain).toLowerCase() !== '0x2105') { liveSay('Your wallet is not on Base (chain ' + chain + '). Switch to Base and connect again.'); return; }
    live.account = String(accs[0] || '').toLowerCase(); live.stopped = false;
    liveSay('Connected: ' + displayShort(live.account) + ' on Base. You can now fund the fly\'s own wallet (step 2).');
  } catch (err) { liveSay('Connection refused: ' + String((err && err.message) || err).slice(0, 120)); }
}
async function waitReceipt(h) {
  for (let k = 0; k < 60; k++) {
    const rc = await eth().request({ method: 'eth_getTransactionReceipt', params: [h] }).catch(() => null);
    if (rc) { if (rc.status !== '0x1') throw new Error('transaction failed on chain (' + h.slice(0, 10) + '…)'); return rc; }
    await new Promise((o) => setTimeout(o, 2000));
  }
  throw new Error('no receipt after 2 minutes (' + h.slice(0, 10) + '…): check it on Basescan before trying again');
}
/* ── THE FLY ALONE (CLAUDE.md exception decided by Phil 2026-11-08): the user signs ONE transaction that funds the fly's own wallet;
 * after it, the fly trades that budget on its own, on its live (never simulated) decisions, within the user's caps; Stop halts it,
 * Withdraw all sends everything back to the wallet that funded it. The key is made and kept ONLY in this browser (fly-wallet.js,
 * @noble). The server plans each order, but the fly signs a call only if fly-guard.js (here, in the browser) finds it is an exact
 * approval, the app fee, or a swap that pays the fly itself and names no unknown address (security review 2026-11-08, H1). Text from
 * the server or a node is never written as HTML (H2). The money path was proven on a fork through the relay; the stock leg too, on base-anvil (a fork with Base's
 * precompiles: banc-fly-wallet-fork-20261108.mjs), but not yet by a real trade on Base itself. ── */
const AUTO_KEY = 'fly-auto-wallet-v1', AUTO_GAS_ETH = 200000000000000n /* 0.0002 ETH */, AUTO_ETH_KEEP = 5000000000000n /* L1 fee dust */;
const ADDR_RE = /^0x[0-9a-f]{40}$/, HASH_RE = /^0x[0-9a-f]{64}$/, AUTO_LOG_MAX = 200;
const auto = { W: null, s: null, busy: false, funding: false, withdrawing: false };
function autoLoad() {
  try {
    const x = JSON.parse(localStorage.getItem(AUTO_KEY) || 'null');
    if (!x || !/^0x[0-9a-f]{64}$/.test(x.key) || !ADDR_RE.test(x.address)) return null;
    /* everything else is re-checked: it becomes a destination (owner) or a token to withdraw (traded) */
    x.owner = ADDR_RE.test(String(x.owner)) ? x.owner : null;
    x.traded = Array.isArray(x.traded) ? x.traded.filter((a) => STOCKS.some((s) => s.address === a)) : [];
    x.today = Number.isInteger(x.today) && x.today >= 0 ? x.today : 0; x.running = x.running === true; x.day = String(x.day || '').slice(0, 10);
    x.consentAt = Number.isFinite(x.consentAt) ? x.consentAt : null;
    const st = x.settings && typeof x.settings === 'object' ? x.settings : {};
    x.settings = { budget: Number.isFinite(st.budget) ? st.budget : undefined, cap: Number.isFinite(st.cap) ? st.cap : undefined, day: Number.isInteger(st.day) ? st.day : undefined };
    return x;
  } catch (_) { return null; }
}
/* this site's storage is shared with the whole app: when it is full, the fly memories of OTHER stocks are dropped, oldest first,
 * and the page says which; a refusal reports the browser's own error, not a guess (the old text blamed a "private window") */
function storeSafely(key, value) {
  try { localStorage.setItem(key, value); return { ok: true, dropped: [] }; } catch (e0) {
    const olds = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i);
      if (k && k.startsWith('fly-brain-memory-v1-') && k !== key && k !== memKey(current.symbol)) { let at = 0; try { at = JSON.parse(localStorage.getItem(k)).at || 0; } catch (_) { at = 0; } olds.push([at, k]); } } } catch (_) { /* storage unreadable */ }
    olds.sort((a, b) => a[0] - b[0]); const dropped = [];
    for (const [, k] of olds) { try { localStorage.removeItem(k); dropped.push(k.slice('fly-brain-memory-v1-'.length)); localStorage.setItem(key, value); return { ok: true, dropped }; } catch (_) { /* still full */ } }
    return { ok: false, dropped, why: String((e0 && e0.name) || 'Error') + ': ' + String((e0 && e0.message) || e0).slice(0, 120) };
  }
}
function storageUsedKb() { let n = 0; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); n += (k.length + (localStorage.getItem(k) || '').length) * 2; } } catch (_) { return null; } return Math.round(n / 1024); }
function autoSave() {
  const r = storeSafely(AUTO_KEY, JSON.stringify(auto.s)); auto.lastStore = r;
  if (r.dropped.length) autoNote('this site\'s storage was full: the fly memories of ' + r.dropped.join(', ') + ' were dropped to keep its wallet');
  try { return r.ok && JSON.parse(localStorage.getItem(AUTO_KEY)).key === auto.s.key; } catch (_) { return false; }
}
/* several tabs share one key: re-read the stored state before acting, so a Stop pressed in another tab is obeyed (review M2) */
function autoRefresh() { const x = autoLoad(); if (x && auto.s && x.key === auto.s.key) auto.s = x; return auto.s; }
async function flyWallet() { if (!auto.W) auto.W = await import('./fly-wallet.js'); return auto.W; }
function autoSay(t) { $('autoState').textContent = t; }
/* a log line from plain parts: strings are TEXT, { tx } a Basescan link (only a well-formed hash), { b } bold text */
function autoNote(...parts) {
  const p = document.createElement('div'); p.append(clock() + ' · ');
  for (const x of parts) {
    if (x && x.tx && HASH_RE.test(String(x.tx).toLowerCase())) { const a = document.createElement('a'); a.href = 'https://basescan.org/tx/' + x.tx; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'tx ' + x.tx.slice(0, 10) + '…'; p.append(a); }
    else if (x && x.b != null) { const b = document.createElement('b'); b.textContent = String(x.b); p.append(b); }
    else p.append(String(x));
  }
  $('autoLog').prepend(p);
  /* bounded: a fly trading for days says something at every decision (QA 08/11: 400 decisions = 400 lines, never dropped) */
  while ($('autoLog').children.length > AUTO_LOG_MAX) $('autoLog').lastChild.remove();
}
const usd6 = (x) => fmt(Number(BigInt(x)) / 1e6, 2);
/* the value really used, bounded, and written back into the field so the user sees it (Phil's live test 08/11: 0.3 typed, 1 USDC sent) */
function field(id, min, max, step) { const el = $(id), raw = Number(el.value); let v = Number.isFinite(raw) ? Math.min(max, Math.max(min, raw)) : min; v = Math.round(v / step) * step; v = Number(v.toFixed(6)); if (String(v) !== String(el.value)) el.value = String(v); return v; }
function autoRender() {
  const s = auto.s, el = $('autoWallet');
  el.textContent = '';
  if (!s) el.textContent = 'No fly wallet in this browser yet.';
  else {
    el.append('Fly wallet ', Object.assign(document.createElement('b'), { textContent: displayShort(s.address) }), ' (');
    el.append(Object.assign(document.createElement('a'), { href: 'https://basescan.org/address/' + s.address, target: '_blank', rel: 'noopener', textContent: 'Basescan' }));
    el.append(`) · funded by ${s.owner ? displayShort(s.owner) : 'nobody yet'} · ${s.running ? 'TRADING ALONE' : 'stopped'} · ${(s.day === new Date().toISOString().slice(0, 10) ? s.today : 0)} trade${(s.day === new Date().toISOString().slice(0, 10) ? s.today : 0) === 1 ? '' : 's'} today`);
  }
  /* while a funding or a withdraw is in flight, nothing else that moves money can be pressed (QA 08/11: Fund twice = two fundings,
   *   Withdraw twice = two withdraws racing on one nonce, Start pressed during a withdraw) */
  const moving = auto.funding || auto.withdrawing;
  $('autoCreate').disabled = !!s; $('autoFund').disabled = !s || moving; $('autoStart').disabled = !s || !s.owner || s.running || moving;
  $('autoWithdraw').disabled = !s || !s.owner || moving; $('autoExport').disabled = !s;
  $('inject').disabled = !!(s && s.running);
}
async function autoAccount(token) {
  const r = await fetch('/api/fly/account/' + auto.s.address + (token ? '?token=' + token : ''), { cache: 'no-store' }).then((x) => x.json());
  /* a read that failed is a TRANSIENT error (09/11, Phil's live fly stopped on a node rate limit): the decision is skipped, the fly runs on */
  if (!r || !r.ok) throw Object.assign(new Error('balances not read: ' + String((r && r.why) || 'no answer').slice(0, 120)), { transient: true });
  return r;
}
const postJson = (u, b) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((x) => x.json());
async function autoCreate() {
  if (!$('autoRisk').checked) { autoSay('Tick the box first: you can lose this money, and the key lives only in this browser.'); return; }
  if (auto.s) return;
  try {
    const W = await flyWallet(), key = W.newKeyHex();
    auto.s = { v: 1, key, address: W.addressOf(key), owner: null, running: false, day: '', today: 0, traded: [], created: Date.now() };
    /* a key this browser cannot keep would lose the money sent to it: then no wallet at all */
    if (!autoSave()) { const w = (auto.lastStore && auto.lastStore.why) || 'written but not read back'; auto.s = null;
      autoSay(`This browser did not keep the key (${w}; this site uses ${storageUsedKb() ?? '?'} KB of storage). No fly wallet was created, because a key that is not kept would lose the money sent to it.`); return; }
    autoNote('fly wallet created in this browser: ' + displayShort(auto.s.address) + '. Nothing is in it yet.');
  } catch (e) { autoSay('The fly wallet could not be created: ' + String((e && e.message) || e).slice(0, 120)); }
  autoRender();
}
async function autoFund() {
  if (auto.funding || auto.withdrawing) return;
  auto.funding = true; autoRender();
  try { await autoFundOnce(); } finally { auto.funding = false; autoRender(); }
}
async function autoFundOnce() {
  if (!auto.s || !$('autoRisk').checked) { autoSay('Tick the box first.'); return; }
  if (!live.account) await connect();
  if (!live.account) { autoSay('Connect your wallet first (button above).'); return; }
  /* the network is read again right before sending: a wallet switched to another chain since "connect" would send there (review L1) */
  const chain = String(await eth().request({ method: 'eth_chainId' }).catch(() => '')).toLowerCase();
  if (chain !== '0x2105') { autoSay('Your wallet is not on Base right now (chain ' + chain + '): nothing sent. Switch to Base and press again.'); return; }
  const payer = live.account.toLowerCase();
  const usdc = BigInt(Math.round(field('autoBudget', 0.1, 100, 0.1) * 1e6));
  /* what the fly already holds is not sent again: a retry after a half-done funding only completes it */
  let held; try { held = await autoAccount(); } catch (e) { autoSay('The balance of the fly wallet could not be read, so nothing is sent (a retry could send twice): ' + String(e.message).slice(0, 100)); return; }
  const needUsdc = usdc > BigInt(held.usdc) ? usdc - BigInt(held.usdc) : 0n, needEth = BigInt(held.eth) < AUTO_GAS_ETH / 2n ? AUTO_GAS_ETH : 0n;
  if (!needUsdc && !needEth) { autoRefresh(); if (!auto.s.owner) { auto.s.owner = payer; autoSave(); } autoRender(); autoSay(`Already funded: it holds ${usd6(held.usdc)} USDC and gas. Nothing sent.`); return; }
  const word = (a) => a.slice(2).toLowerCase().padStart(64, '0');
  const calls = [...(needUsdc ? [{ to: USDC_BASE, data: selecteur('transfer(address,uint256)') + word(auto.s.address) + needUsdc.toString(16).padStart(64, '0'), value: '0x0' }] : []),
    ...(needEth ? [{ to: auto.s.address, data: '0x', value: '0x' + needEth.toString(16) }] : [])];
  try {
    let batched = false;
    const unsupported = (err) => err && (err.code === 4200 || err.code === -32601 || err.code === -32602 || /not supported|does not exist|unsupported|version/i.test(String(err.message)));
    for (const params of [{ version: '2.0.0', chainId: '0x2105', from: payer, atomicRequired: true, calls }, { version: '1.0', chainId: '0x2105', from: payer, calls }]) {
      if (calls.length < 2 || batched) break;
      try {
        const id = await eth().request({ method: 'wallet_sendCalls', params: [params] });
        batched = true; autoNote(`funding sent in ONE signature (batch ${params.version}): ${usd6(needUsdc)} USDC + ${fmt(Number(needEth) / 1e18, 4)} ETH for gas (${String(id && (id.id || id)).slice(0, 16)}…)`);
      } catch (err) {
        /* only a wallet that does not know this batch format moves on: any other error may mean the batch went out */
        if (!unsupported(err)) throw err;
      }
    }
    /* a batch returns before it is mined: Fund stays off until the balance shows it (QA 08/11: pressed again 1 s later, the balance
     *   still read 0 and a SECOND batch went out) */
    if (batched) {
      autoSay('Funding sent: waiting until it is mined (Fund stays off meanwhile)…');
      let seen = false;
      for (let k = 0; k < 60 && !seen; k++) { await new Promise((o) => setTimeout(o, 2000));
        try { const a = await autoAccount(); seen = BigInt(a.usdc) >= BigInt(held.usdc) + needUsdc && (!needEth || BigInt(a.eth) >= AUTO_GAS_ETH / 2n); } catch (_) { /* read again */ } }
      if (!seen) autoNote('the funding batch is not seen mined after 2 minutes: check your wallet before pressing Fund again');
    }
    if (!batched) {
      if (calls.length > 1) autoNote('your wallet does not batch calls: one signature per transfer instead (USDC, then the gas ETH)');
      for (const c of calls) { const h = await eth().request({ method: 'eth_sendTransaction', params: [{ from: payer, ...c }] }); autoNote('sent ', { tx: h }); await waitReceipt(h); }
    }
    /* the owner (where Withdraw sends) is the wallet that paid, set only once the funding went out (review L2) */
    autoRefresh(); auto.s.owner = payer; autoSave(); autoRender();
    autoSay('Funded. Its balance shows below once the transaction is mined; then press "Let it trade alone".');
    setTimeout(autoShowBalance, 8000);
  } catch (err) { autoSay('Not funded: ' + String((err && err.message) || err).slice(0, 140)); }
}
async function autoShowBalance() {
  if (!auto.s) return;
  try { const a = await autoAccount(current.address);
    autoSay(`In the fly's wallet: ${usd6(a.usdc)} USDC · ${current.symbol} ${a.stock == null ? '?' : fmt(Number(BigInt(a.stock)) / 10 ** (live.decimals ?? 8), 6)} · ${fmt(Number(BigInt(a.eth)) / 1e18, 6)} ETH for gas (block ${a.block}).`);
  } catch (e) { autoSay(String(e.message)); }
}
/* one call, signed by the fly's key and relayed; waits for its receipt (status 0x1 or it throws). `sweep`: send all the ETH left,
 * computed with the SAME gas and fee as the signature (review M4). */
async function flySend(c, { sweep = false } = {}) {
  const W = await flyWallet(), a = await autoAccount();
  const g = await postJson('/api/fly/estimate', { from: auto.s.address, to: c.to, data: c.data, value: sweep ? '0x1' : (c.value || '0x0') });
  if (!g || !g.ok) throw new Error((g && g.refused ? 'the chain refuses this call (gas estimate): ' : 'the gas estimate was not answered (node busy or down; nothing sent): ') + String((g && g.why) || 'no answer').slice(0, 120));
  const gas = BigInt(g.gas) * 13n / 10n, prio = 1000000n, maxFee = BigInt(a.baseFeePerGas) * 2n + prio;
  const value = sweep ? BigInt(a.eth) - gas * maxFee - AUTO_ETH_KEEP : BigInt(c.value || '0x0');
  if (sweep && value <= 0n) return null;
  if (BigInt(a.eth) < gas * maxFee + value + (sweep ? 0n : AUTO_ETH_KEEP)) throw new Error('out of ETH for gas: the fly stops (send it a little ETH, or withdraw)');
  const s = W.signTx({ chainId: 8453, nonce: BigInt(a.nonce), maxPriorityFeePerGas: prio, maxFeePerGas: maxFee, gas, to: c.to, value, data: c.data || '0x' }, auto.s.key);
  const r = await postJson('/api/fly/relay', { raw: s.raw });
  if (!r || !r.ok) throw new Error('not sent: ' + String((r && r.why) || 'no answer').slice(0, 140));
  if (String(r.hash).toLowerCase() !== s.hash.toLowerCase()) throw new Error('the relay answered another transaction hash: stopped');
  for (let k = 0; k < 60; k++) {
    const q = await fetch('/api/fly/receipt/' + s.hash, { cache: 'no-store' }).then((x) => x.json()).catch(() => null);
    if (q && q.ok && q.receipt) { if (q.receipt.status !== '0x1') throw new Error('failed on chain: ' + s.hash); return { hash: s.hash, value }; }
    await new Promise((o) => setTimeout(o, 2000));
  }
  throw new Error('no receipt after 2 minutes: check ' + s.hash + ' on Basescan before anything else');
}
/* one tab trades at a time (Web Locks where the browser has them) */
const withLock = (fn) => (navigator.locks ? navigator.locks.request('fly-auto', { ifAvailable: true }, (l) => (l ? fn() : 'locked')) : fn());
/* game392 (Phil 2026-11-13, option A): the money follows the HOLD rule (fly-hold.js, signal from /api/fly/hold/), not the brain's word:
 *   in by default, out for 6 hours after a sharp 6-hour drop. The brain keeps smelling and calling on paper (band 2); it no longer moves
 *   the money, because its record is a coin flip (measured 2026-11-12, "Why"). Called at each brain decision and every minute. */
async function readHold(token) {
  const r = await fetch('/api/fly/hold/' + token, { cache: 'no-store', signal: AbortSignal.timeout(30000) }).then((x) => x.json()).catch(() => null);
  return r && r.ok ? r : { ok: false, target: null, why: String((r && r.why) || 'no answer from the server').slice(0, 120) };
}
/* game395 (Phil 2026-11-13: "fix le stock pas surveillé"): `other` = a stock the fly HOLDS but the page does not watch. For it the fly
 *   only SELLS on its OUT signal (it buys only the stock you watch); the auto-stop and the memory seal stay with the watched stock. */
async function autoTrade(e, other = null) {
  if (!auto.s || !e || e.sim || (e.type !== 'decision' && e.type !== 'tick')) return;
  const sellOnly = !!other;
  autoRefresh();
  const s = auto.s;
  if (!s.running) return;
  if (auto.busy) return; /* a trade in flight: the next tick looks again */
  auto.busy = true;
  /* the memory that DECIDED, taken now: a stock switched while the trade is in flight loads another memory (QA 08/11: the seal of
   *   SNDKc's trade carried the next stock's memory) */
  const stock = other || current, decided = { memory: fly.exportMemory(), windows: session.settled };
  const dec = sellOnly ? 8 : (live.decimals ?? 8); /* text only: the sell amount is the raw balance */
  let sendingStarted = false; /* set right before the first transaction goes out: after it, a failure is never "nothing sent" */
  try {
    const done = await withLock(async () => {
      /* the day counter lives in the STORED state: a reset done on a copy was overwritten by the next autoRefresh(), so the counter
       *   fell back to 0 at every decision and the daily cap never held (Phil's live test 08/11: "0 trades today" after a trade) */
      const today = dayOf();
      /* 09/11: a slot is reserved (and saved) right before the FIRST transaction goes out, not counted after the swap: a reload in
       *   between left a real trade uncounted (fly-day.js) */
      let reserved = false;
      const reserve = () => { if (reserved) return; autoRefresh(); Object.assign(auto.s, reserveTrade(auto.s, today)); Object.assign(auto.s, reserveVolume(auto.s, Date.now(), volumeDuTrade)); autoSave(); reserved = true; sendingStarted = true; };
      let volumeDuTrade = 0; /* game364: USDC of this trade, recorded with the slot before the first transaction goes out */
      const maxDay = field('autoDay', 1, 50, 1);
      /* a stock not watched: nothing is read further unless its signal says OUT */
      if (sellOnly) { const sg = await readHold(stock.address); if (!(sg.ok && sg.target === 'out')) return; }
      const a = await autoAccount(stock.address), held = a.stock ? BigInt(a.stock) : 0n;
      /* game364 auto-stop: the wallet's value (USDC + the stock at the live pool price) against its value at Start; at or past the loss set,
       *   the fly stops and only the human's Start resumes it. A value that cannot be priced is not a loss: it is said, and nothing changes. */
      const prix = !sellOnly && Number.isFinite(lastPrice) && lastPrice > 0 ? lastPrice : null;
      if (prix !== null) {
        const valeur = Number(BigInt(a.usdc)) / 1e6 + Number(held) / 10 ** (live.decimals ?? 8) * prix;
        if (!(auto.s.baseUsd > 0)) { autoRefresh(); auto.s.baseUsd = valeur; autoSave(); }
        const vp = verdictPerte(auto.s.baseUsd, valeur, field('autoLoss', 1, 50, 1));
        if (vp && vp.arret) {
          autoRefresh(); auto.s.running = false; auto.s.stopPerte = { at: Date.now(), base: auto.s.baseUsd, valeur }; autoSave();
          autoNote({ b: 'auto-stop' }, ': the fly wallet is worth $' + fmt(valeur, 4) + ', down ' + fmt(vp.perte, 2) + '% from $' + fmt(auto.s.baseUsd, 4) + ' when you pressed Start. It sends nothing more until you press Start again.');
          return;
        }
      }
      /* game392: the hold signal of THIS stock; not known, stale, or for another stock -> nothing is traded */
      const sig = await readHold(stock.address);
      if (!sellOnly) { whyHold.sig = sig; whyHold.token = stock.address; renderWhy(); }
      /* security review 2026-11-13: the page bounds the signal itself: a 6-hour grid end, not in the future, not stale */
      const fresh = sig.target != null && sig.token === stock.address && Number.isInteger(sig.at) && sig.at % HOLD.WINDOW_MS === 0 && sig.at <= Date.now() && Date.now() - sig.at <= HOLD.MAX_AGE_MS;
      /* the REAL position decides, never a paper book: what the fly wallet holds of this stock, read on chain just above */
      const action0 = fresh ? holdAction(sig.target, held) : null, action = sellOnly && action0 !== 'sell' ? null : action0;
      const holding = held > 0n ? 'holds ' + fmt(Number(held) / 10 ** dec, 6) + ' ' + stock.symbol : 'out of the stock';
      const seenKey = stock.address + '|' + (sig.at || 0) + '|' + (fresh ? sig.target : 'unknown');
      auto.seenBy = auto.seenBy || {};
      if (!action) {
        if (sellOnly) return;
        /* said once per close and target, not every minute */
        if (auto.seenBy[stock.address] !== seenKey) { auto.seenBy[stock.address] = seenKey; autoNote(fresh ? `${sig.target === 'in' ? 'IN' : 'OUT'} ${stock.symbol} at the ${new Date(sig.at).toISOString().slice(11, 16)} UTC close (6-hour move ${fmt(sig.move * 100, 2)}%, steps out below ${fmt(sig.threshold * 100, 2)}%) · ${holding}: no trade`
          : `${stock.symbol}: the hold signal is not known (${sig.why || 'stale'}): nothing traded`); }
        return;
      }
      auto.seenBy[stock.address] = seenKey;
      /* one close, one action: at most 3 tries (a node busy before anything is sent may be retried; three failures wait for the next close) */
      /* kept in the SAVED state (security review 2026-11-13): a reload does not give a close three more tries */
      const tryKey = seenKey + '|' + action;
      /* one entry per stock (game395: several stocks are looked at each minute) */
      autoRefresh(); const ht = auto.s.holdTries && typeof auto.s.holdTries === 'object' && !('key' in auto.s.holdTries) ? auto.s.holdTries : {};
      const tr = ht[stock.address] && ht[stock.address].key === tryKey ? ht[stock.address].n + 1 : 1;
      ht[stock.address] = { key: tryKey, n: tr }; auto.s.holdTries = ht; autoSave();
      if (tr > 3) return;
      /* 09/11 (Phil: "the button makes it worse, remove it?"): the "only once it beats a coin flip" gate is gone. Simulated (banc-fly-sim,
       *   5 markets), "gate AND edge pays the fee" gave exactly what "edge pays the fee" alone gave: the edge rule below already pulls a
       *   short record toward a coin (Beta(10, 10)) and asks the edge to pay the real cost, which is stricter; the gate only added a second
       *   refusal message. The record against a coin flip is still SHOWN (tallyText). */
      if (!mayTrade(autoRefresh(), today, maxDay)) { autoNote(`decided ${ACT[action]}, but today's cap of ${maxDay} trades is reached: nothing sent`); return; }
      let de, vers, montant;
      if (action === 'buy') {
        const cap = BigInt(Math.round(field('autoCap', 0.1, 100, 0.1) * 1e6)), have = BigInt(a.usdc);
        const amt = have < cap ? have : cap;
        /* game392: below HOLD_MIN_BUY_USDC the gas of a round trip is over ~0.5% of the trade (1.55% at 0.5 USDC, measured 2026-11-12) */
        /* said once per close, not every minute (Phil's live log 2026-11-13: the same line each minute) */
        if (amt < BigInt(HOLD_MIN_BUY_USDC * 1e6)) { if (auto.saidMin === tryKey) return; auto.saidMin = tryKey; autoNote(`BUY ${stock.symbol} (hold rule), but ${cap < BigInt(HOLD_MIN_BUY_USDC * 1e6) ? 'your Max per trade is ' + usd6(cap) + ' USDC' : 'it holds ' + usd6(have) + ' USDC'}: it buys from ${HOLD_MIN_BUY_USDC} USDC. Press "Use recommended settings" below. Nothing sent`); return; }
        /* game364: the rolling 24 h volume cap, checked before anything is planned or signed */
        const capVol = field('autoVol', 0.5, 1000, 0.5);
        if (!mayBuyVolume(autoRefresh(), Date.now(), Number(amt) / 1e6, capVol)) { autoNote(`decided BUY ${stock.symbol}, but ${fmt(volume24h(auto.s, Date.now()), 2)} USDC were traded in the last 24 h and the cap is ${capVol} USDC: nothing sent`); return; }
        /* game392: the edge rule (aRetourPaye) no longer gates buys: the hold rule is not a bet on the next window (its record), it is
         *   "be in the stock unless it just fell hard"; the cost is paid per step out and back, and shown in the panel */
        de = USDC_BASE; vers = stock.address; montant = amt.toString(); volumeDuTrade = Number(amt) / 1e6;
      } else { de = stock.address; vers = USDC_BASE; montant = held.toString(); volumeDuTrade = !sellOnly && Number.isFinite(lastPrice) ? Number(held) / 10 ** dec * lastPrice : 0; }
      /* game323: mouche=1 -> the fly's own trades carry no interface fee (Phil 09/11); the route's real fee is still checked below */
      const q = new URLSearchParams({ de, vers, montant, compte: s.address, mouche: '1' });
      let p = await fetch('/api/rails/plan?' + q, { cache: 'no-store' }).then((x) => x.json()), swapped = false;
      for (let round = 0; round < 3; round++) {
        if (!p || !p.ok) { autoNote(`decided ${ACT[action]} ${stock.symbol}: no order (${String((p && p.etat) || '?')}${p && p.pourquoi ? ' — ' + String(p.pourquoi).slice(0, 120) : ''})`); return; }
        if (!p.resume || String(p.resume.paye) !== montant) throw new Error('the plan does not pay the amount asked (' + String(p.resume && p.resume.paye) + ' vs ' + montant + ')');
        /* game392: the fly's trades carry NO interface fee (game323, mouche=1): a plan that states one, or none, is not signed */
        /* security review 2026-11-13: exactly 0 — the planner sends the STRING "0" (fork bench 2026-11-13); Number(null), Number('') and
         *   Number([]) are 0 too, so only "0" or 0 pass — on EVERY round, the re-plans after approvals included */
        { const bps = p.resume.fraisBps;
          if (!((typeof bps === 'string' || typeof bps === 'number') && String(bps) === '0')) { autoNote(`${ACT[action]} ${stock.symbol}: this route states an interface fee of ${typeof bps === 'string' || typeof bps === 'number' ? bps + ' bps' : 'nothing readable'}; the fly's trades carry none: nothing signed`); return; } }
        /* a sell counts in the 24 h volume at what the plan says it receives, not at the page's price (which a stock switch changes) */
        if (action === 'sell' && round === 0 && /^\d+$/.test(String(p.resume.recoitAuMoins || ''))) volumeDuTrade = Number(p.resume.recoitAuMoins) / 1e6;
        /* ⛔ H1: nothing is signed that the browser's own guard does not accept */
        const refused = checkPlanCalls({ calls: p.aSigner, fly: s.address, pay: de, receive: vers, amount: montant, nowSec: Math.floor(Date.now() / 1000) });
        if (refused) throw new Error('the fly refused to sign: ' + refused.why);
        for (const c of p.aSigner) {
          if (!autoRefresh().running) { autoNote('stopped before sending: nothing more goes out'); return; }
          reserve();
          const r = await flySend(c);
          autoNote(`${ACT[action]} ${stock.symbol} · ${String(c.nom || c.role || 'call').slice(0, 80)} mined · `, { tx: r.hash });
        }
        if (p.etat !== 'APPROBATIONS') { swapped = true; break; }
        p = await fetch('/api/rails/plan?' + q, { cache: 'no-store' }).then((x) => x.json());
      }
      /* three rounds of approvals and still no swap: nothing was traded, so nothing is counted or sealed (QA 08/11: it said "done") */
      if (!swapped) { autoNote(`${ACT[action]} ${stock.symbol}: approvals sent, but the planner still asked for approvals after 3 rounds: no swap, nothing traded (its slot stays counted today: the cap errs toward fewer trades)`); return; }
      autoRefresh(); if (!auto.s.traded.includes(stock.address)) auto.s.traded.push(stock.address); autoSave();
      autoNote({ b: `${ACT[action]} ${stock.symbol} done` }, ` on its own (${countedToday(auto.s, today)}/${maxDay} today). Interface fee in this plan: ${p.resume && p.resume.fraisBps != null ? String(p.resume.fraisBps) : '?'} bps (the fly's trades carry none); see Basescan.`);
      /* its memory, sealed by its own wallet right after the trade it decided (a failed seal is said, it does not stop the fly) */
      if (!sellOnly) try { await flySeal(stock, decided); } catch (err) { autoNote('memory not sealed this time: ' + String((err && err.message) || err).slice(0, 140)); }
    });
    if (done === 'locked') autoNote('another tab of this page is trading with the same fly: this tab does nothing');
  } catch (err) {
    /* a balances read that failed BEFORE anything was sent: this decision is skipped, the fly keeps running (it reads again at the next
     *   decision); any other error still stops it */
    if (err && err.transient && !sendingStarted) autoNote(`${ACT[e.action] || 'decision'} ${stock.symbol} skipped: ${String(err.message).slice(0, 160)} — nothing sent, it keeps running and reads again at its next decision`);
    else { autoNote({ b: 'error, the fly stops' }, ': ' + String((err && err.message) || err).slice(0, 200)); autoRefresh(); auto.s.running = false; autoSave(); }
  } finally { auto.busy = false; autoRender(); autoShowBalance(); }
}
/* game395: every stock the fly has traded and still may hold, other than the watched one: sold on its OUT signal (at most 10, one by one) */
async function autoSweep() {
  if (!auto.s || !auto.s.running) return;
  const others = [...new Set(auto.s.traded || [])].filter((x) => x !== current.address).map((x) => STOCKS.find((t) => t.address === x)).filter(Boolean).slice(0, 10);
  for (const st of others) { if (!autoRefresh().running) return; await autoTrade({ type: 'tick' }, st); }
}
/* the session is remembered (Phil 08/11: reopening the page stopped the fly and asked to tick the box again): the consent with its date,
 * the settings, and whether it was trading alone. Reopened, it resumes as it was; Stop still halts it. */
function autoSettings() { return { budget: field('autoBudget', 0.1, 100, 0.1), cap: field('autoCap', 0.1, 100, 0.1), day: field('autoDay', 1, 50, 1), vol: field('autoVol', 0.5, 1000, 0.5), loss: field('autoLoss', 1, 50, 1) }; }
/* game364: the rules panel — read from the same fields the checks below use, never typed twice */
function autoRulesRender() {
  const ul = $('autoRulesList'); if (!ul) return;
  const lignes = [
    'At most ' + field('autoCap', 0.1, 100, 0.1) + ' USDC per buy, and ' + field('autoDay', 1, 50, 1) + ' trades a day (UTC).',
    'At most ' + field('autoVol', 0.5, 1000, 0.5) + ' USDC traded in any 24 hours: a buy above it is not sent (a sell, an exit, always is).',
    'Auto-stop: if the fly wallet is down ' + field('autoLoss', 1, 50, 1) + '% or more from its value when you pressed Start, it stops; only you can start it again.',
    'Its rule: it holds the stock by default and steps out for 6 hours after a 6-hour move below ' + HOLD.DROP_X + 'x the usual one; it buys from ' + HOLD_MIN_BUY_USDC + ' USDC. The calls of its brain do not move the money.',
    'Spot only: it buys the one stock you chose with USDC and sells it back. No leverage, no borrowing, no other asset.',
    'Every call is checked in this page before its key signs: known routers only, approvals no larger than the trade, no ETH attached, nothing sent to another wallet.',
    'Where these rules live: in this page, which holds the fly\'s key. The brain cannot change them; no server enforces them. Stop and Withdraw all are always yours.',
  ];
  ul.replaceChildren(...lignes.map((t) => { const li = document.createElement('li'); li.textContent = t; return li; }));
}
/* game395: the calibrated settings in one press (the page's own defaults) */
const AUTO_RECO = Object.freeze({ autoBudget: 5, autoCap: 5, autoDay: 10, autoVol: 20, autoLoss: 5 });
function autoReco() {
  for (const [id, v] of Object.entries(AUTO_RECO)) $(id).value = String(v);
  autoRemember(); autoRulesRender(); renderWhy();
  autoNote('recommended settings set: 5 USDC budget, 5 USDC a trade, 10 trades a day, 20 USDC in 24 h, auto-stop at -5%.');
}
function autoRemember() { if (!auto.s) return; autoRefresh(); auto.s.settings = autoSettings(); if ($('autoRisk').checked && !auto.s.consentAt) auto.s.consentAt = Date.now(); autoSave(); }
function autoStart() { if (!auto.s || !auto.s.owner || auto.withdrawing || auto.funding) return; if (!$('autoRisk').checked) { autoSay('Tick the box first.'); return; }
  /* game364: Start is the human's act: it sets the base value of the auto-stop again (measured at the first decision) and clears a stop */
  autoRefresh(); auto.s.running = true; auto.s.consentAt = auto.s.consentAt || Date.now(); auto.s.settings = autoSettings(); auto.s.baseUsd = null; auto.s.stopPerte = null; autoSave(); autoRender();
  autoNote(`trading alone on ${current.symbol}, in by default and out for 6 hours after a sharp 6-hour drop, max ${field('autoCap', 0.1, 100, 0.1)} USDC per buy, ${field('autoDay', 1, 50, 1)} trades a day. Stop halts it.`); }
function autoStop() { if (!auto.s) return; autoRefresh(); auto.s.running = false; autoSave(); autoRender(); autoNote({ b: 'stopped' }, ': it sends nothing more' + (auto.busy ? ' after the call already in flight' : '') + '.'); }
async function autoWithdraw() {
  if (!auto.s || !auto.s.owner || auto.withdrawing || auto.funding) return;
  auto.withdrawing = true;
  try { await autoWithdrawOnce(); } finally { auto.withdrawing = false; autoRender(); }
}
async function autoWithdrawOnce() {
  autoStop();
  if (!confirm('Send everything in the fly wallet back to ' + auto.s.owner + ' (the wallet that funded it)?')) return;
  /* a trade in flight finishes first, so its result is withdrawn too (review M4) */
  for (let k = 0; k < 90 && auto.busy; k++) await new Promise((o) => setTimeout(o, 2000));
  if (auto.busy) { autoNote('a trade is still in flight after 3 minutes: withdraw not started, press again later'); return; }
  const word = (a) => a.slice(2).toLowerCase().padStart(64, '0'), T = selecteur('transfer(address,uint256)'), to = auto.s.owner;
  try {
    /* each stock on its own: one balance that cannot be read must not keep the USDC and the ETH from coming back */
    const unread = [];
    for (const tok of [...new Set([...auto.s.traded, ...STOCKS.map((x) => x.address)])].slice(0, 40)) {
      let a = null;
      try { a = await autoAccount(tok); } catch (_) { unread.push((STOCKS.find((x) => x.address === tok) || {}).symbol || displayShort(tok)); }
      if (a && a.stock && BigInt(a.stock) > 0n) autoNote('stock back: ', { tx: (await flySend({ to: tok, data: T + word(to) + BigInt(a.stock).toString(16).padStart(64, '0'), value: '0x0' })).hash });
      await new Promise((o) => setTimeout(o, 2100)); /* the server's per-minute budget for balance reads */
    }
    if (unread.length) autoNote({ b: 'not read' }, ': ' + unread.join(', ') + ' — their balance could not be read this time; press Withdraw again later for them.');
    const u = await autoAccount();
    if (BigInt(u.usdc) > 0n) autoNote(usd6(u.usdc) + ' USDC back: ', { tx: (await flySend({ to: USDC_BASE, data: T + word(to) + BigInt(u.usdc).toString(16).padStart(64, '0'), value: '0x0' })).hash });
    const r = await flySend({ to, data: '0x' }, { sweep: true });
    if (r) autoNote(fmt(Number(r.value) / 1e18, 6) + ' ETH back: ', { tx: r.hash });
    autoNote({ b: unread.length ? 'withdrawn, except ' + unread.join(', ') : 'withdrawn' }, (unread.length ? ' (not read: press Withdraw again for them)' : '') + '. A dust of ETH (about 0.000005) stays for the network fee of that last send.');
  } catch (err) { autoNote({ b: 'withdraw stopped' }, ': ' + String((err && err.message) || err).slice(0, 200) + ' — what was sent is above; press again to retry.'); }
  autoShowBalance();
}
function autoExport() {
  if (!auto.s || !confirm('Show the fly wallet key? Anyone who sees it can take the money in it. Copy it somewhere only you can read.')) return;
  autoSay('Key (keep it secret, hidden again in 60 s): ' + auto.s.key);
  setTimeout(() => { if ($('autoState').textContent.includes(auto.s.key)) autoSay('Key hidden again.'); }, 60000);
}
function autoWire() {
  auto.s = autoLoad();
  if (auto.s) {
    const st = auto.s.settings || {};
    if (Number.isFinite(st.budget)) $('autoBudget').value = String(st.budget);
    if (Number.isFinite(st.cap)) $('autoCap').value = String(st.cap);
    if (Number.isFinite(st.day)) $('autoDay').value = String(st.day);
    if (Number.isFinite(auto.s.consentAt)) $('autoRisk').checked = true;
    if (auto.s.running) autoNote('page reopened: ', { b: 'still trading alone' }, ` with your settings (in by default, out after a sharp 6-hour drop, max ${field('autoCap', 0.1, 100, 0.1)} USDC per buy, ${field('autoDay', 1, 50, 1)} trades a day). Stop halts it.`);
  }
  if (auto.s && auto.s.settings) { const st2 = auto.s.settings; if (Number.isFinite(st2.vol)) $('autoVol').value = String(st2.vol); if (Number.isFinite(st2.loss)) $('autoLoss').value = String(st2.loss); }
  for (const id of ['autoBudget', 'autoCap', 'autoDay', 'autoVol', 'autoLoss', 'autoRisk']) $(id).addEventListener('change', () => { autoRemember(); autoRulesRender(); });
  $('autoReco').addEventListener('click', autoReco);
  /* a saved Max per trade under the minimum buy (settings saved before game392): said once, with the one-press fix */
  if (auto.s && field('autoCap', 0.1, 100, 0.1) < HOLD_MIN_BUY_USDC) autoNote('your saved Max per trade is ' + field('autoCap', 0.1, 100, 0.1) + ' USDC: the fly buys from ' + HOLD_MIN_BUY_USDC + ' USDC. Press "Use recommended settings".');
  autoRulesRender();
  /* another tab pressed Stop (or started it): obey at once */
  window.addEventListener('storage', (ev) => { if (ev.key === AUTO_KEY) { const x = autoLoad(); if (x && auto.s && x.key === auto.s.key) { auto.s = x; autoRender(); } } });
  $('autoCreate').addEventListener('click', autoCreate); $('autoFund').addEventListener('click', autoFund); $('autoStart').addEventListener('click', autoStart);
  $('autoStop').addEventListener('click', autoStop); $('autoWithdraw').addEventListener('click', autoWithdraw); $('autoExport').addEventListener('click', autoExport);
  autoRender(); if (auto.s) autoShowBalance();
}

/* the decision window being gathered (fly-core 'gathering'): only its countdown is shown, no log line every read */
let gatherClosesIn = null;
const nextDecisionIn = () => gatherClosesIn;
function onEvent(e) {
  if (e.type === 'gathering') { gatherClosesIn = e.closesIn; return; }
  show(e, current.symbol);
  if (e.type === 'tx') ripple(e.kind, e.usd);
  if (e.type === 'decision') { renderDecision(e); autoTrade(e); if (!e.sim) { thoughts.push({ ...e, at: Date.now() }); if (thoughts.length > 6) thoughts.shift(); }
    /* after the session has recorded this decision (its callback runs right after the event) */
    setTimeout(renderThoughts, 0); }
  if (e.type === 'verdict' || e.type === 'taught') { renderTally(); }
  if (e.type === 'taught' && !e.sim) saveMemory();
}

/* ── ITS THOUGHTS: before (the live decisions, with the synapses that carried them), now, and next (computed on a shadow fly). ── */
const thoughts = [];
function synapseChips(path, limit = 3) {
  return '<div class="walk">' + path.slice(0, limit).map(({ i, j, side, m }) => `<button data-walk="${i}" data-to="${j}" style="border-color:${side === 'approach' ? '#4ade80' : '#f87171'}" title="Kenyon cell #${N[i].id} (smell memory) → output ${esc(N[j].type)} (${side}); this synapse keeps ${fmt(m * 100, 1)}% of the strength it had in a newborn fly">`
    + `smell cell → “${side === 'approach' ? 'go toward' : 'keep away'}” output · ${fmt(m * 100, 0)}% strength</button>`).join('') + '</div>';
}
function thoughtLine(when, e, extra = '') {
  return `<div class="th"><div class="when">${when}</div><span class="act ${e.action}">${ACT[e.action]}</span> · ${SAY[e.word]} (pull toward ${fmt(e.ap * 100, 1)}% · push away ${fmt(e.av * 100, 1)}%)${extra}${e.path && e.path.length ? synapseChips(e.path) : ''}</div>`;
}
function renderThoughts() {
  if (!fly || !session) return;
  const past = thoughts.slice(0, -1).reverse(), now = thoughts[thoughts.length - 1];
  let html = past.length ? past.map((e) => thoughtLine('before · ' + clock(e.at), e, ' · smelled ' + mixText(e.mix))).join('') : '<div class="th"><div class="when">before</div><span class="state">no earlier live decision in this visit</span></div>';
  html += now ? thoughtLine('now · ' + clock(now.at), now, ' · smelled ' + mixText(now.mix)) : '<div class="th"><div class="when">now</div><span class="state">waiting for a window with real trades</span></div>';
  const fc = foreseeNext(shadow, fly, session);
  if (!fc.exact) html += `<div class="th"><div class="when">next</div><span class="state">${fc.why || 'the fly is mid-thought: the forecast waits until it rests'}</span></div>`;
  else {
    const learn = fc.learnsFrom ? 'it will first learn from the last smell (' + mixText(fc.learnsFrom) + ') with that move' : 'the last window had no trade: nothing to learn';
    html += `<div class="th"><div class="when">next · if the next window smells like the last real trades (${mixText(fc.nextMix)}) · ${fc.pos ? 'holding' : 'out of'} the stock</div><span class="state">${learn}, then:</span></div>`
      + fc.scenarios.map((sc) => thoughtLine(sc.move ? 'if the price makes a usual ' + (sc.move > 0 ? 'rise' : 'fall') + ' (' + pct(sc.move, 3) + ')' : 'if the price does not move (no lesson)', sc)).join('');
  }
  $('thoughts').innerHTML = html;
  $('thoughts').querySelectorAll('button[data-walk]').forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.walk), j = Number(b.dataset.to); flash = [[i, j, Date.now() + 6000]]; walkTo(i);
  }));
}

function renderBook(st = session.state(), el = $('book')) {
  el.innerHTML = `<div class="state">Score of its decisions, as if each were a trade (simulated, not money), after ${st.settled} windows, pool fee ${st.feePips == null ? '?' : fmt(st.feePips / 1e4, 2) + '%'} per switch — next to two simple rules:</div>`
    + Object.values(st.books).map((b) => `<div class="row"><span>${b.label}</span><span>${pct(b.ret - 1, 3)}</span><span>${b.pos === 1 ? 'in' : b.pos > 0 ? 'in ' + fmt(b.pos * 100, 1) + '%' : 'out'} · ${b.switches} switches</span></div>`).join('')
    /* 09/11: the edge book (the rule its real buys now follow), next to the fly and "Always in" on the SAME windows */
    + (st.edgeNow ? `<div class="state">Real buys follow the edge rule: it buys only when the gain it can expect from a window in — its record (shrunk toward a coin) times the usual move — pays the pool fee. Now: ${fmt(st.edgeNow.edge * 100, 4)}% expected vs ${st.edgeNow.fee == null ? '?' : fmt(st.edgeNow.fee * 100, 3) + '%'} fee: ${st.edgeNow.pays ? 'it pays, it may buy' : 'it does not pay, it will not buy'}. Kept after simulating 5 markets where the truth is known: 0.00% where the edge does not pay, about half the gain where it does.`
      + (st.sameWindows ? ` Since it started, over the same ${st.sameWindows.windows} windows: edge rule ${pct(st.sameWindows.edge - 1, 3)} · all-in fly ${pct(st.sameWindows.fly - 1, 3)} · always in ${pct(st.sameWindows.hold - 1, 3)}.` : '') + '</div>' : '');
}
function tallyText(t) {
  const n = t.consistent + t.opposite;
  const r = recordEdge(t);
  return `${t.consistent} matched · ${t.opposite} opposite · ${t.flat} flat · ${t.undecided} undecided` + (n ? ` · ${fmt((t.consistent / n) * 100, 0)}% on ${n} judged · a coin flip would do this well ${r.p < 0.001 ? 'under 0.1%' : fmt(r.p * 100, 1) + '%'} of the time${proven(t) ? ' — it beats chance' : ''}` : ' · nothing judged yet');
}
/* whether its record beats a coin flip (at least 10 judged, p < 10%): SHOWN next to the tally (banc-fly-trace: a learner "decides" on
 *   noise); since 09/11 it no longer gates real buys, the edge rule does (see autoTrade) */
function proven(t) { const r = recordEdge(t); return r.n >= 10 && r.p < 0.1;
}
function renderTally() { $('tally').textContent = tallyText(session.state().tally); }

/* ── game391, game392: HOW IT TRADES. The hold signal its trades read (/api/fly/hold/), and what one step out and back costs at your size;
 * the pool fee read with the price, one side's gas priced live (gasUsdCote, the same function the buy uses), and your max per trade.
 * the brain's paper record is shown for context. A number not read says "not read", never 0. ── */
const whyGas = { usd: null, block: null, why: 'reading…', shared: null };
async function readWhyGas() {
  try {
    const g = await fetch('/api/fly/gas', { cache: 'no-store' }).then((x) => x.json());
    whyGas.usd = g && g.ok ? gasUsdCote(g.baseFeePerGas, Number(g.ethUsd)) : null;
    whyGas.block = g && Number.isInteger(g.block) ? g.block : null;
    whyGas.why = whyGas.usd == null ? String((g && g.why) || 'no answer').slice(0, 100) : null;
  } catch (_) { whyGas.usd = null; whyGas.why = 'no answer'; }
  renderWhy();
}
/* game395: every stock's signal already built on the server (/api/fly/hold-all: no RPC), current stock first, then the page's order */
const holdAll = { list: [], at: 0 };
async function readHoldAll() {
  const r = await fetch('/api/fly/hold-all', { cache: 'no-store', signal: AbortSignal.timeout(20000) }).then((x) => x.json()).catch(() => null);
  if (r && r.ok && Array.isArray(r.stocks)) { holdAll.list = r.stocks; holdAll.at = Date.now(); }
  renderHoldAll();
}
function renderHoldAll() {
  const tb = $('holdAll'); if (!tb) return;
  const byTok = new Map(holdAll.list.map((x) => [x.token, x]));
  if (whyHold.sig && whyHold.sig.ok && whyHold.token) byTok.set(whyHold.token, whyHold.sig);
  const rows = STOCKS.filter((st) => byTok.has(st.address)).sort((a, b) => (b.address === current.address) - (a.address === current.address));
  if (!rows.length) { tb.replaceChildren(); const tr = document.createElement('tr'), td = document.createElement('td'); td.colSpan = 4; td.textContent = holdAll.at ? 'not read yet' : 'reading…'; tr.append(td); tb.append(tr); return; }
  const pc = (x) => (Number.isFinite(x) ? (x >= 0 ? '+' : '') + (x * 100).toFixed(2) + '%' : '—');
  tb.replaceChildren(...rows.map((st) => { const x = byTok.get(st.address), tr = document.createElement('tr'); if (st.address === current.address) tr.className = 'mine';
    const now = x.target === 'out' ? 'OUT' : x.target === 'in' ? 'IN' : 'not known';
    for (const v of [st.symbol, pc(x.move), pc(x.threshold), now]) { const td = document.createElement('td'); td.textContent = v; tr.append(td); }
    tr.style.cursor = 'pointer'; tr.title = 'Watch ' + st.symbol;
    tr.addEventListener('click', () => { const p = $('pick'), i = STOCKS.findIndex((x) => x.address === st.address); if (p && i >= 0 && p.value !== String(i)) { p.value = String(i); p.dispatchEvent(new Event('change')); } }); /* the picker's values are indexes into STOCKS */
    return tr; }));
}
/* game392: the hold signal shown in "How it trades" (the same /api/fly/hold/ answer the trades read) */
const whyHold = { sig: null, token: null };
async function readWhyHold() { const t = current.address; const sig = await readHold(t); if (current.address === t) { whyHold.sig = sig; whyHold.token = t; renderWhy(); }
  /* prod 2026-11-13 (game393): the first read after a deploy failed and the panel said "no answer" for 5 minutes: a failure reads again in 30 s */
  if (!sig.ok && !whyHold.retry) whyHold.retry = setTimeout(() => { whyHold.retry = null; void readWhyHold(); }, 30000); }
function renderWhy() {
  if (!session || !$('whyRecord')) return;
  const st = session.state(), size = field('autoCap', 0.1, 100, 0.1);
  const sig = whyHold.token === current.address ? whyHold.sig : null;
  const H = holdLines(sig, current.symbol);
  $('whyRecord').textContent = H.rule; $('whyEdge').textContent = H.last; $('whyVerdict').textContent = H.verdict;
  /* the cost of one step out and back at your size: the same expression the old buy rule used (fly-pourquoi roundTripCost) */
  const fee = Number.isFinite(sig && sig.feePips) ? sig.feePips : st.feePips;
  const c = roundTripCost({ feePips: fee, interfaceFee: 0, gasUsd: whyGas.usd, tailleUsd: size });
  $('whyCost').textContent = 'Each step out and back costs one round trip: ' + (c == null ? 'not read' : (c * 100).toFixed(3) + '% at your size (' + size + ' USDC)') + ' — the pool fee on both sides plus the network fee of both sides.'
    + (size < HOLD_MIN_BUY_USDC ? ' Your Max per trade is under ' + HOLD_MIN_BUY_USDC + ' USDC: it will not buy (the network fee would eat too much).' : '');
  $('whyNeed').textContent = '';
  /* game395 (Phil: "ecris pas ce genre de truc ca fait fuir les gens"): no record line here any more; the brain's calls stay in band 1 */
  $('whyShared').textContent = '';
  renderHoldAll();
  $('whySizes').replaceChildren(...SIZES_USDC.map((x) => { const tr = document.createElement('tr'); if (x === size) tr.className = 'mine';
    const cx = roundTripCost({ feePips: fee, interfaceFee: 0, gasUsd: whyGas.usd, tailleUsd: x });
    for (const v of [x + ' USDC', cx == null ? 'not read' : (cx * 100).toFixed(3) + '%']) { const td = document.createElement('td'); td.textContent = v; tr.append(td); } return tr; }));
  $('whyGas').textContent = 'Network fee of one side: ' + (whyGas.usd == null ? 'not read (' + whyGas.why + ')' : '$' + fmt(whyGas.usd, 4) + ' (300,000 gas at the live base fee' + (whyGas.block ? ', block ' + whyGas.block.toLocaleString('en-US') : '') + ')')
    + ' · pool fee of one side: ' + (fee == null ? 'not read' : fmt(fee / 1e4, 3) + '%') + '. Your size is your "Max per trade" in "Let it trade alone": change it to see the cost move.';
}

function measure() {
  const r = {}; for (const f of FAMILIES) r[f] = { s: 0, n: 0, total: 0 };
  let top = null;
  N.forEach((n, j) => { const x = r[n.family]; x.total++; x.s += act[j]; if (act[j] > 0.05) x.n++;
    if (n.family === 'MBON' && (top == null || act[j] > act[top])) top = j; });
  r.top = top != null && act[top] > 0.02 ? `${N[top].type} (${fmt(act[top] * 100, 0)}%, ${N[top].valence || 'no dopamine'})` : 'none';
  return r;
}

/* ── TRANSACTIONS ARRIVING, SHOWN: each real trade of a window is a ring on its PN group (received, sent, moved), spread over the window
 * instead of one burst. Visual only: the neural activity stays what fly-core computes. ── */
const KIND_COLOR = { received: '#4fd1c5', sent: '#f472b6', moved: '#a78bfa' };
const KIND_OF = { received: 0n, sent: 1n, moved: 2n };
let ripples = [], txSlot = 0;
function ripple(kind, usd) {
  /* pruned here too: a hidden tab draws no frame, and its ripples piled up without end (QA 08/11: 500 trades, 500 ripples held) */
  const now = Date.now(); ripples = ripples.filter((r) => now < r.at + 1800).slice(-199);
  const at = now + (txSlot++ % 10) * 2400;
  ripples.push({ kind, at, size: Math.min(1, Math.log10(Math.max(10, usd)) / 5) });
}
function pnCenter(kind) {
  if (!N.pnCenter) {
    N.pnCenter = {};
    for (const [k, r] of Object.entries(KIND_OF)) {
      const l = N.filter((n) => n.family === 'PN' && BigInt(n.id) % 3n === r);
      N.pnCenter[k] = { list: l, ids: new Set(l.map((n) => n.id)) };
    }
  }
  const g = N.pnCenter[kind]; return { ...centre(g.list), ids: g.ids };
}

/* Drawing is batched (one stroke per colour and intensity, no shadow blur): the old one stroke per edge and blurred glow cost too much
 * on phones. Quiet circuit = ~10 frames/s, activity = ~30. */
/* ── 3D VIEW (Phil 08/11: "see the connections in 3D, zoom in and out"). The circuit file carries NO positions (hemibrain coordinates
 * need neuPrint), so depth is OURS: each family on its own layer (smell inputs at the back, Kenyon cells in the middle, outputs at the
 * front), a fixed per-neuron jitter, and the 2D layout above for the rest. Drag to turn, wheel or two fingers to zoom, shift-drag to
 * move. Every drawing routine keeps using n.x / n.y: they are the projection of (bx, by, bz) through the camera, at every frame. ── */
const cam = { yaw: -0.55, pitch: 0.22, zoom: 1, panX: 0, panY: 0, moving: 0 };
const CAM_HOME = { yaw: -0.55, pitch: 0.22, zoom: 1, panX: 0, panY: 0 };
const DEPTH = { PN: -320, KC: 0, MBON: 300, APL: 40 };
function init3d(list) {
  const W = canvas.width, H = canvas.height;
  list.forEach((n, j) => {
    n.bx = n.x - W / 2; n.by = n.y - H / 2;
    const jitter = (((j * 7919) % 97) / 97 - 0.5) * 140;
    n.bz = (n.family === 'DAN' ? (j % 2 ? 200 : -200) : DEPTH[n.family] ?? 0) + jitter;
  });
}
function project() {
  const W = canvas.width, H = canvas.height, cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), D = 1700;
  for (const n of N) {
    const x1 = n.bx * cy - n.bz * sy, z1 = n.bx * sy + n.bz * cy;
    const y2 = n.by * cp - z1 * sp, z2 = n.by * sp + z1 * cp, f = D / Math.max(200, D + z2) * cam.zoom;
    n.x = W / 2 + x1 * f + cam.panX; n.y = H / 2 + y2 * f + cam.panY; n.f = f;
  }
}
/* the screen point of a group's centre (labels, rings) */
function centre(list) { let x = 0, y = 0; for (const n of list) { x += n.x; y += n.y; } return { x: x / list.length, y: y / list.length }; }
function zoomBy(k) { cam.zoom = Math.min(8, Math.max(0.35, cam.zoom * k)); cam.moving = Date.now(); }
function wire3d() {
  const ptrs = new Map(); let dragged = 0, lastPinch = null;
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height }; };
  canvas.addEventListener('pointerdown', (e) => { ptrs.set(e.pointerId, pos(e)); dragged = 0; lastPinch = null; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const p = pos(e), q = ptrs.get(e.pointerId); ptrs.set(e.pointerId, p);
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (lastPinch) zoomBy(d / lastPinch); lastPinch = d; dragged += 10; return;
    }
    const dx = p.x - q.x, dy = p.y - q.y; dragged += Math.abs(dx) + Math.abs(dy);
    if (e.shiftKey) { cam.panX += dx; cam.panY += dy; } else { cam.yaw += dx * 0.006; cam.pitch = Math.max(-1.3, Math.min(1.3, cam.pitch + dy * 0.006)); }
    cam.moving = Date.now();
  });
  const up = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) lastPinch = null; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  /* a drag must not also select the neuron under the finger */
  canvas.addEventListener('click', (e) => { if (dragged > 6) { e.stopImmediatePropagation(); dragged = 0; } }, true);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  $('zoomIn').addEventListener('click', () => zoomBy(1.25));
  $('zoomOut').addEventListener('click', () => zoomBy(0.8));
  $('viewReset').addEventListener('click', () => { Object.assign(cam, CAM_HOME); cam.moving = Date.now(); });
  $('viewFlat').addEventListener('click', () => { Object.assign(cam, { yaw: 0, pitch: 0 }); cam.moving = Date.now(); });
}

const ALPHAS = 6;
function draw(now) {
  if (!N.edges) return;
  const W = canvas.width, H = canvas.height, t = Date.now();
  project();
  /* while the view turns, a full clear (the soft trail would smear the whole map) */
  ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = t - cam.moving < 400 ? 'rgb(5,7,13)' : 'rgba(5,7,13,0.35)'; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  const focus = selected != null ? selected : hovered;
  const buckets = new Map();
  for (const [i, j, w] of N.edges) {
    if (hidden.has(N[i].family) || hidden.has(N[j].family)) continue;
    const a = act[i], base = (focus != null ? 0.008 : 0.025) + 0.05 * (w / N.wMax);
    const alpha = Math.min(0.9, base + a * 0.45 * (0.3 + w / N.wMax)), q = Math.min(ALPHAS - 1, Math.floor(alpha * ALPHAS / 0.9)), thick = a > 0.3 ? 1 : 0;
    const key = N[i].family + '|' + q + '|' + thick;
    let b = buckets.get(key); if (!b) { b = []; buckets.set(key, b); } b.push(i, j);
  }
  for (const [key, list] of buckets) {
    const [fam, q, thick] = key.split('|');
    ctx.strokeStyle = COLOR[fam]; ctx.globalAlpha = (Number(q) + 0.5) * 0.9 / ALPHAS; ctx.lineWidth = thick === '1' ? 1.4 : 0.5;
    ctx.beginPath(); for (let k = 0; k < list.length; k += 2) { ctx.moveTo(N[list[k]].x, N[list[k]].y); ctx.lineTo(N[list[k + 1]].x, N[list[k + 1]].y); } ctx.stroke();
  }
  /* signals travelling along the active connections */
  let dots = 0; const byColor = new Map();
  for (const [i, j] of N.edges) {
    if (dots >= 220) break;
    if (act[i] < 0.25 || hidden.has(N[i].family) || hidden.has(N[j].family)) continue;
    const f = ((t / 900) + ((i * 31 + j * 17) % 97) / 97) % 1, c = COLOR[N[i].family];
    let l = byColor.get(c); if (!l) { l = []; byColor.set(c, l); } l.push(N[i].x + (N[j].x - N[i].x) * f, N[i].y + (N[j].y - N[i].y) * f); dots++;
  }
  ctx.globalAlpha = 0.9;
  for (const [c, l] of byColor) { ctx.fillStyle = c; ctx.beginPath(); for (let k = 0; k < l.length; k += 2) { ctx.moveTo(l[k] + 2.2, l[k + 1]); ctx.arc(l[k], l[k + 1], 2.2, 0, Math.PI * 2); } ctx.fill(); }
  /* the focused neuron's real connections: inputs in cyan, outputs in gold, width by synapse count */
  if (focus != null) {
    const wMax = Math.max(1, ...N.in[focus].map(([, w]) => w), ...N.out[focus].map(([, w]) => w));
    for (const [list, color] of [[N.in[focus], '#67e8f9'], [N.out[focus], '#fde68a']]) {
      ctx.strokeStyle = color;
      for (const [k, w] of list) { if (hidden.has(N[k].family)) continue; ctx.globalAlpha = 0.25 + 0.6 * w / wMax; ctx.lineWidth = 0.6 + 2.4 * w / wMax;
        ctx.beginPath(); ctx.moveTo(N[focus].x, N[focus].y); ctx.lineTo(N[k].x, N[k].y); ctx.stroke(); }
    }
  }
  /* rings of the transactions arriving now, and their PN group lit for as long as the ring lives */
  ripples = ripples.filter((r) => t < r.at + 1800);
  const lit = new Set();
  for (const r of ripples) {
    if (t < r.at) continue;
    const p = (t - r.at) / 1800, c = pnCenter(r.kind);
    ctx.strokeStyle = KIND_COLOR[r.kind]; ctx.globalAlpha = 0.8 * (1 - p); ctx.lineWidth = 2 + 4 * r.size;
    ctx.beginPath(); ctx.arc(c.x, c.y, 20 + p * (90 + 120 * r.size), 0, Math.PI * 2); ctx.stroke();
    for (const id of c.ids) lit.add(id);
  }
  /* quiet neurons in one fill per colour; active ones get a soft halo (no shadow blur) */
  const quiet = new Map();
  for (let j = 0; j < N.length; j++) {
    if (hidden.has(N[j].family)) continue;
    const n = N[j], a = Math.max(act[j], lit.has(n.id) ? 0.35 : 0), r = (n.family === 'APL' ? 7 : n.family === 'MBON' ? 3.2 : 2.2) + a * 5 + (j === focus ? 5 : 0);
    const c = n.family === 'DAN' && n.dan === 'punishment' ? '#fb923c' : COLOR[n.family];
    if (a <= 0.08 && j !== focus) { let l = quiet.get(c); if (!l) { l = []; quiet.set(c, l); } l.push(n.x, n.y, r); continue; }
    ctx.fillStyle = c; ctx.globalAlpha = 0.18 * a; ctx.beginPath(); ctx.arc(n.x, n.y, r * 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.35 + a * 0.65; ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 0.35;
  for (const [c, l] of quiet) { ctx.fillStyle = c; ctx.beginPath(); for (let k = 0; k < l.length; k += 3) { ctx.moveTo(l[k] + l[k + 2], l[k + 1]); ctx.arc(l[k], l[k + 1], l[k + 2], 0, Math.PI * 2); } ctx.fill(); }
  /* the synapses the last learning step weakened, in white for 6 s */
  flash = flash.filter((f) => f[2] > t);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6;
  for (const [i, j, until] of flash) { ctx.globalAlpha = Math.min(0.9, (until - t) / 3000); ctx.beginPath(); ctx.moveTo(N[i].x, N[i].y); ctx.lineTo(N[j].x, N[j].y); ctx.stroke(); }
  ctx.globalAlpha = 0.75; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#8a96ad'; ctx.font = '22px system-ui'; ctx.textAlign = 'center';
  if (!N.sides) N.sides = { ap: N.filter((n) => n.family === 'MBON' && n.valence === 'approach'), av: N.filter((n) => n.family === 'MBON' && n.valence && n.valence !== 'approach') };
  const ca = centre(N.sides.ap), cv = centre(N.sides.av);
  ctx.fillText('go toward', ca.x, ca.y - 70 * cam.zoom); ctx.fillText('keep away', cv.x, cv.y + 80 * cam.zoom);
  ctx.globalAlpha = 1;
}

function drawSpark() {
  const W = spark.width, H = spark.height; sctx.clearRect(0, 0, W, H);
  if (history.length < 2) return;
  const ps = history.map((h) => h.p), lo = Math.min(...ps), hi = Math.max(...ps), span = hi - lo || hi * 1e-4;
  const t0 = history[0].t, t1 = history[history.length - 1].t || t0 + 1;
  sctx.strokeStyle = ps[ps.length - 1] >= ps[0] ? '#4ade80' : '#f87171'; sctx.lineWidth = 2; sctx.beginPath();
  history.forEach((h, i) => { const x = ((h.t - t0) / Math.max(1, t1 - t0)) * (W - 4) + 2, y = H - 4 - ((h.p - lo) / span) * (H - 8); if (i) sctx.lineTo(x, y); else sctx.moveTo(x, y); });
  sctx.stroke();
}

function gauges() {
  const m = measure(), names = { PN: 'PN', KC: 'Kenyon', MBON: 'MBON', DAN: 'Dopa.', APL: 'APL' };
  const t = lastDecision ? { t: (lastDecision.ap - lastDecision.av) / Math.max(1e-6, lastDecision.ap + lastDecision.av) } : { t: 0 };
  $('gauges').innerHTML = FAMILIES.map((f) => { const p = m[f].total ? m[f].s / m[f].total : 0;
    return `<div><span>${names[f]}</span><span class="bar"><i style="width:${Math.min(100, p * 100 * 3)}%;background:${COLOR[f]}"></i></span><span>${fmt(p * 100, 1)}%</span></div>`; }).join('');
  $('output').textContent = `Most active output: ${m.top}`;
  const pos = 50 + 50 * Math.max(-1, Math.min(1, t.t * 4));
  $('needle').style.left = pos + '%';
}

/* ── THE MAP, INTERACTIVE: hover or tap a neuron to see what it is, its real connections, and what it has learned. ── */
const ROLE = {
  PN: 'Projection neuron: carries a smell from the antenna into the memory centre. Here it carries one kind of transaction.',
  KC: 'Kenyon cell: one of the cells that code which smell it is. Only about 10% fire at once, so each smell has its own small set.',
  MBON: 'Output neuron: its vote pushes the fly toward or away from the smell.',
  DAN: 'Dopamine neuron: the teacher. It weakens the Kenyon to output synapses that were active when it fired.',
  APL: 'APL: one giant inhibitory cell that keeps Kenyon activity sparse.',
};
let hovered = null, selected = null;
const hidden = new Set();
function nearest(e) {
  const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) * canvas.width / r.width, y = (e.clientY - r.top) * canvas.height / r.height;
  let best = null, bd = 18 * 18;
  N.forEach((n, j) => { if (hidden.has(n.family)) return; const d = (n.x - x) ** 2 + (n.y - y) ** 2; if (d < bd) { bd = d; best = j; } });
  return best;
}
/* which smell each Kenyon cell belongs to: the cells in the top 10% for one kind of trade (computed once, from the measured synapses) */
let kcCode = null;
function codeOf(j) {
  if (!kcCode) {
    kcCode = new Map();
    for (const kind of Object.keys(KIND_OF)) {
      const d = fly.odorDrive({ received: 0, sent: 0, moved: 0, [kind]: 5000 });
      const sc = fly.kcIdx.map((k) => [k, fly.inputs[k].reduce((s, [i, w]) => s + w * (d[i] || 0), 0)]).sort((a, b) => b[1] - a[1]);
      sc.slice(0, Math.round(fly.kcIdx.length * 0.1)).forEach(([k, v]) => { if (v > 0) kcCode.set(k, [...(kcCode.get(k) || []), kind]); });
    }
  }
  return kcCode.get(j) || [];
}
const back = [];
function walkTo(k) { if (selected != null && selected !== k) back.push(selected); selected = k; describe(k); }
function chips(list, title) {
  if (!list.length) return '';
  const top = [...list].sort((a, b) => b[1] - a[1]).slice(0, 8);
  return `<div class="state" style="margin-top:6px">${title}</div><div class="walk">`
    + top.map(([k, w]) => `<button data-walk="${k}" style="border-color:${COLOR[N[k].family]}">${N[k].family} ${N[k].type || ''} · ${w} syn.</button>`).join('') + '</div>';
}
function describe(j) {
  if (j == null) { $('neuron').innerHTML = '<div class="state">Hover or tap a neuron on the map, then walk through its synapses with the buttons. Tap the legend to hide a family.</div>'; return; }
  const n = N[j], ins = N.in[j], outs = N.out[j], syn = (l) => l.reduce((s, [, w]) => s + w, 0), inputs = fly.inputs;
  let role;
  if (n.family === 'PN') {
    const kind = Object.keys(KIND_OF).find((k) => KIND_OF[k] === BigInt(n.id) % 3n);
    role = ROLE.PN + ` Here it belongs to the <b>${kind}</b> group: it lights up when a window has trades where ${kind === 'received' ? 'the signer received the stock' : kind === 'sent' ? 'the signer sent the stock' : 'the stock moved between two other addresses'}, harder for bigger trades (our mapping, by id).`;
  } else if (n.family === 'KC') {
    const c = codeOf(j);
    role = ROLE.KC + (c.length ? ` In this model it is part of the code for <b>${c.join(' and ')}</b> trades: those smells reach it among the strongest 10%.` : ' None of the three trade smells reaches it among the strongest 10%: it stays silent for them.');
  } else if (n.family === 'DAN') {
    const comp = outs.filter(([k]) => N[k].family === 'MBON').map(([k]) => N[k].type);
    role = ROLE.DAN + (n.dan === 'reward' ? ' This one is a <b>reward</b> neuron (PAM): a price rise after a smell drives it, and it weakens that smell\'s Kenyon synapses onto ' + (comp.length ? comp.slice(0, 4).join(', ') : 'its output neurons') + ' (the avoid side), so the fly leans toward that smell next time.'
      : n.dan === 'punishment' ? ' This one is a <b>punishment</b> neuron (PPL1): a price fall after a smell drives it, and it weakens that smell\'s Kenyon synapses onto ' + (comp.length ? comp.slice(0, 4).join(', ') : 'its output neurons') + ' (the approach side), so the fly pulls away next time.'
        : ' It is neither PAM nor PPL1, so it teaches nothing here.');
  } else if (n.family === 'MBON') {
    role = ROLE.MBON + (n.valence ? ` Most of its dopamine comes from ${n.valence === 'avoid' ? 'reward (PAM)' : 'punishment (PPL1)'} neurons, so it sits on the <b>${n.valence}</b> side: when learning weakens its Kenyon synapses, its vote drops and the fly is pulled the other way. Its votes are what the trader card reads.` : ' It receives no dopamine in this circuit, so learning never changes it.');
  } else role = ROLE[n.family];
  let learned = '';
  if (n.family === 'KC') {
    const w = []; for (const [k] of outs) if (N[k].family === 'MBON') for (const e of inputs[k]) if (e[0] === j && e[2] != null && e[2] < 0.999) w.push(`${N[k].type} ${pct(e[2] - 1, 1)}`);
    learned = w.length ? `<div class="state">Learned so far (weaker synapses): ${w.slice(0, 6).join(' · ')}</div>` : '<div class="state">Nothing learned through this cell yet.</div>';
  }
  if (n.family === 'MBON') {
    let low = 0, tot = 0; for (const e of inputs[j]) if (e[2] != null) { tot++; if (e[2] < 0.999) low++; }
    learned = `<div class="state">${low} of its ${tot} Kenyon synapses have been weakened by learning.</div>`;
  }
  $('neuron').innerHTML = `<div class="nname" style="color:${COLOR[n.family]}">${n.family} · ${n.type || 'untyped'}</div>`
    + `<div class="state">Body id ${n.id} (hemibrain v1.2) · activity now ${fmt(act[j] * 100, 1)}%</div>`
    + `<div style="margin:6px 0">${role}</div>`
    + `<div class="state">Inputs: ${ins.length} neurons, ${syn(ins)} synapses (cyan) · Outputs: ${outs.length} neurons, ${syn(outs)} synapses (gold), counted at 5 synapses or more within this circuit.</div>`
    + learned
    + chips(ins, 'Walk upstream (who talks to it):') + chips(outs, 'Walk downstream (who it talks to):')
    + (back.length ? '<div class="walk" style="margin-top:8px"><button data-back="1">← back</button></div>' : '');
  $('neuron').querySelectorAll('button[data-walk]').forEach((b) => b.addEventListener('click', () => walkTo(Number(b.dataset.walk))));
  const bb = $('neuron').querySelector('button[data-back]'); if (bb) bb.addEventListener('click', () => { selected = back.pop(); describe(selected); });
}
function wireMap() {
  canvas.addEventListener('pointermove', (e) => { const j = nearest(e); if (j !== hovered) { hovered = j; if (selected == null) describe(j); } });
  canvas.addEventListener('pointerleave', () => { hovered = null; if (selected == null) describe(null); });
  canvas.addEventListener('click', (e) => { const j = nearest(e); selected = j === selected ? null : j; describe(selected != null ? selected : null); });
  document.querySelectorAll('.legend span[data-family]').forEach((s) => s.addEventListener('click', () => {
    const f = s.dataset.family; if (hidden.has(f)) hidden.delete(f); else hidden.add(f);
    document.querySelectorAll(`.legend span[data-family="${f}"]`).forEach((x) => x.classList.toggle('off', hidden.has(f)));
  }));
  describe(null);
}

/* ── TRAINING THAT LASTS IN THIS BROWSER: per stock, so this fly keeps training from visit to visit. Per viewer only; a private window
 * or cleared site data starts a naive fly, and the page says so. The shared fly (server) is the one that trains when nobody watches. ── */
const memKey = (s) => 'fly-brain-memory-v1-' + s;
function saveMemory() {
  storeSafely(memKey(current.symbol), JSON.stringify({ m: fly.exportMemory(), ...session.state(), at: Date.now() })); /* refused: it still learns, it forgets on reload */
}
function loadMemory() {
  let x = null; try { x = JSON.parse(localStorage.getItem(memKey(current.symbol)) || 'null'); } catch (_) { x = null; }
  /* the smells still waiting for their lessons are taken back only from a save of the last 3 windows: a smell of yesterday is not
   *   taught by today's move */
  fly.importMemory(x && x.m); session.restore(x && !(Date.now() - x.at < 3 * POLL_MS) ? { ...x, recent: [] } : x);
  log(x ? `memory restored for ${current.symbol}: trained since ${new Date(x.at).toLocaleString('en-GB')}, ${session.settled} windows` : `a naive fly for ${current.symbol} (no memory kept in this browser yet)`);
  renderTally(); renderBook();
}
/* ── ITS MEMORY, SEALED ON BASE, AUTOMATICALLY (Phil 08/11): after each real trade the fly's OWN wallet sends 0 ETH to itself with a
 * 66-byte note, the fingerprint of its memory (fly-seal.js). Re-checked from the transaction itself (sender = receiver = the fly). ── */
const sealKey = (s) => 'fly-seal-v1-' + s;
function sealSay(t) { $('sealState').textContent = t; }
function renderSeal() {
  let x = null; try { x = JSON.parse(localStorage.getItem(sealKey(current.symbol)) || 'null'); } catch (_) { x = null; }
  if (!x || !/^0x[0-9a-f]{64}$/.test(String(x.tx))) { sealSay('Not sealed yet for ' + current.symbol + ': its own wallet seals it after its next real trade.'); return; }
  const now = memoryFingerprint(fly.exportMemory());
  sealSay(`Sealed ${new Date(x.at).toLocaleString('en-GB')} after ${x.windows} windows (tx ${x.tx.slice(0, 10)}…). ${now === x.fingerprint ? 'Its memory is the same as sealed.' : 'It has learned since: its memory no longer matches that seal (it seals again after its next real trade).'}`);
}
async function checkSealNow() {
  let x = null; try { x = JSON.parse(localStorage.getItem(sealKey(current.symbol)) || 'null'); } catch (_) { x = null; }
  if (!x) return;
  try {
    const q = await fetch('/api/fly/receipt/' + x.tx + '?tx=1', { cache: 'no-store' }).then((r) => r.json());
    const tx = q && q.ok ? q.tx : null;
    const c = checkSeal(tx, { sealer: x.sealer, stock: current.address, memory: fly.exportMemory() });
    sealSay(c.ok ? `Read from the chain: a seal by ${displayShort(x.sealer)} after ${c.windows} windows — ${c.same ? 'the memory held now is exactly the one sealed.' : 'the memory held now has changed since.'}` : 'Not confirmed: ' + c.why + '.');
  } catch (err) { sealSay('The chain could not be read: ' + String((err && err.message) || err).slice(0, 120)); }
}
async function flySeal(stock, { memory, windows }) {
  const fingerprint = memoryFingerprint(memory);
  const r = await flySend({ to: auto.s.address, data: sealData({ stock: stock.address, fingerprint, windows }), value: '0x0' });
  storeSafely(sealKey(stock.symbol), JSON.stringify({ tx: r.hash, fingerprint, windows, at: Date.now(), sealer: auto.s.address }));
  autoNote('memory sealed on Base by its own wallet: ', { tx: r.hash }); renderSeal(); checkSealNow();
}
function forget() {
  try { localStorage.removeItem(memKey(current.symbol)); } catch (_) { /* nothing kept */ }
  loadMemory(); log('memory erased: the fly is naive again');
}

/* ── THE SHARED FLY: the server runs the same fly-core on one stock, every minute, whether anyone watches or not. Its memory starts again
 * when the server restarts (a deploy), and the panel says since when it has been training. ── */
async function readShared() {
  try {
    const s = await fetch('/api/fly/state', { cache: 'no-store' }).then((x) => x.json());
    if (!s || !s.ok) { whyGas.shared = null; renderWhy(); $('shared').innerHTML = `<div class="state">The shared fly is not running: ${esc((s && s.why) || 'no answer')}.</div>`; return; }
    const since = new Date(s.trainingSince || s.aliveSince).toLocaleString('en-GB');
    const mem = s.persisted ? 'memory kept across server restarts' + (s.restored ? ' (reloaded at the last restart, ' + new Date(s.aliveSince).toLocaleString('en-GB') + ')' : '')
      : 'memory NOT kept: it starts again when the server restarts' + (s.saveError ? ' (' + esc(s.saveError) + ')' : '');
    $('shared').innerHTML = `<div class="state">${esc(s.symbol)} · training since ${esc(since)} · ${s.windows} windows (${s.windowsRead} read, ${s.windowsMissed} not read) · ${s.weakened} synapses weakened so far · ${mem}</div>`
      + `<div class="state" style="margin-top:4px">${tallyText(s.session.tally)}</div><div id="sharedBook" class="book"></div>`
      + (s.foresight && s.foresight.exact && s.foresight.scenarios.length ? `<div class="state" style="margin-top:4px">Next, computed on its shadow (${s.foresight.pos ? 'holding' : 'out'}, if the next trades smell like the last): `
        + s.foresight.scenarios.map((sc) => `${sc.move ? pct(sc.move, 0) : '0%'} → <span class="act ${sc.action}">${ACT[sc.action]}</span>`).join(' · ') + '</div>'
        : `<div class="state" style="margin-top:4px">Next: no forecast yet (${esc((s.foresight && s.foresight.why) || 'not computed yet')}).</div>`)
      + `<div class="log" style="margin-top:6px;max-height:180px">${s.events.slice(-12).reverse().map((e) => `<p class="${e.type === 'verdict' ? 'verdict' : 'live'}">${clock(e.at)} · ${esc(eventText(e, s.symbol))}</p>`).join('')}</div>`;
    renderBook(s.session, $('sharedBook'));
    whyGas.shared = { symbol: s.symbol, st: s.session }; renderWhy();
  } catch (_) { whyGas.shared = null; renderWhy(); $('shared').innerHTML = '<div class="state">The shared fly could not be read this time.</div>'; }
}
function eventText(e, symbol) {
  if (e.type === 'tx') return `${e.kind}: ${fmt(e.units, 4)} ${symbol} ($${fmt(e.usd, 0)}) · tx ${String(e.tx).slice(0, 10)}…`;
  if (e.type === 'predict') return `smells ${mixText(e.mix)} → ${SAY[e.word]}`;
  if (e.type === 'taught') return `taught: followed by ${pct(e.move, 3)}, ${e.weakened} synapses weakened`;
  if (e.type === 'verdict') return `predicted ${e.prediction}, moved ${pct(e.move, 3)} → ${e.kind}`;
  if (e.type === 'decision') return `decides ${ACT[e.action]} (paper)`;
  if (e.type === 'skipped') return `${e.n} past transactions skipped at start`;
  return e.type;
}

/* ── BEATS: the computed activity, played. A neuron "fires" on a step when a hash of (step, neuron) falls under its activity: no
 * Math.random, so the same moves give the same rhythm, like the block brain. Off until asked: browsers refuse sound without a click. ── */
const PENTA = [0, 2, 4, 7, 9];
let audio = null, master = null;
const fires = (j, t) => ((Math.imul(t + 1, 2654435761) ^ Math.imul(j + 7, 40503)) >>> 0) / 4294967296;
function voice({ freq, type = 'sine', dur = 0.12, vol = 0.08, noise = false, at = 0 }) {
  const t0 = audio.currentTime + at, g = audio.createGain();
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  g.connect(master);
  if (noise) {
    const b = audio.createBuffer(1, Math.ceil(audio.sampleRate * dur), audio.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = fires(i, fly.ticks) * 2 - 1;
    const s = audio.createBufferSource(), f = audio.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
    s.buffer = b; s.connect(f); f.connect(g); s.start(t0); return;
  }
  const o = audio.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0); o.connect(g); o.start(t0); o.stop(t0 + dur + 0.02);
}
function beat() {
  if (!audio) return;
  const t = fly.ticks; let n = 0; const cap = 7, slot = 0.12 / cap;
  fly.kcIdx.forEach((j, k) => { if (act[j] > 0 && fires(j, t) < act[j] * 0.5 && n < cap) voice({ freq: 220 * 2 ** ((PENTA[k % 5] + 12 * ((k / 5 | 0) % 3)) / 12), type: 'triangle', dur: 0.18, vol: 0.05, at: slot * n++ }); });
  for (const j of fly.mbonIdx) if (N[j].valence && fires(j, t) < act[j] * 0.6 && n < cap) voice({ freq: N[j].valence === 'approach' ? 660 : 110, type: 'sine', dur: 0.3, vol: 0.06, at: slot * n++ });
  let rew = 0, pun = 0, pn = 0;
  N.forEach((x, j) => { if (x.dan === 'reward') rew = Math.max(rew, act[j]); if (x.dan === 'punishment') pun = Math.max(pun, act[j]); if (x.family === 'PN') pn += act[j]; });
  if (rew > 0.05 && t % 2 === 0) voice({ freq: 1320, type: 'sine', dur: 0.5, vol: 0.05 * rew });
  if (pun > 0.05 && t % 2 === 0) voice({ freq: 55, type: 'square', dur: 0.25, vol: 0.09 * pun });
  if (pn > 1 && t % 2 === 1) voice({ noise: true, dur: 0.04, vol: 0.03 });
}
function listen() {
  if (audio) { audio.close(); audio = null; $('listen').textContent = 'Listen to the brain'; return; }
  audio = new (window.AudioContext || window.webkitAudioContext)();
  master = audio.createGain(); master.gain.value = 0.7; master.connect(audio.destination);
  $('listen').textContent = 'Mute';
}

/* The brain steps on a timer, the drawing on animation frames: a background tab gets no frames, and its fly must keep living. */
function tick() { fly.tick(); act = fly.act; beat(); if (fly.ticks % 4 === 0) gauges(); }
let lastDraw = 0;
function loop(now) {
  const busy = flash.length || ripples.length || hovered != null || selected != null || Date.now() - cam.moving < 400 || (fly && fly.peak && act.some((a) => a > 0.01));
  if (now - lastDraw >= (busy ? 33 : 100)) { lastDraw = now; draw(now); }
  requestAnimationFrame(loop);
}

/* One read, every 30 s: price + new transactions, handed to the shared protocol (which decides once per window, fitted to the stock). */
async function readWindow() {
  const stock = current;
  const [r, ac] = await Promise.all([
    fetch('/api/fly/price/' + stock.address, { cache: 'no-store' }).then((x) => x.json()).catch(() => null),
    fetch('/api/activite/' + stock.address, { cache: 'no-store' }).then((x) => x.json()).catch(() => null),
  ]);
  if (stock !== current) return;
  const price = r && r.ok && typeof r.priceUsd === 'number' ? r : null;
  if (!price) {
    const last = history.length ? ` · showing the last price read at ${clock(history[history.length - 1].t)}` : '';
    $('state').textContent = 'live price not read this time (' + ((r && r.why) || 'empty response') + ')' + last + ' · next try in 30 s';
  } else {
    $('price').textContent = '$' + fmt(price.priceUsd);
    $('state').textContent = `live on-chain price · Aerodrome pool · block ${price.block.toLocaleString('en-US')} · ${clock(Date.parse(price.readAt))}`;
    history.push({ t: Date.now(), p: price.priceUsd }); while (history.length && Date.now() - history[0].t > 3600000) history.shift();
    drawSpark();
    if (lastPrice == null) log(`${stock.symbol} live at $${fmt(price.priceUsd)} (on-chain pool, block ${price.block.toLocaleString('en-US')})`);
    lastPrice = price.priceUsd; if (Number.isInteger(price.tokenDecimals)) live.decimals = price.tokenDecimals;
  }
  if (ac && !ac.ok && ac.pourquoi) log('trades not read this time: ' + ac.pourquoi);
  txSlot = 0;
  const w = session.window({ symbol: stock.symbol, price, transactions: ac && ac.ok && Array.isArray(ac.transactions) ? ac.transactions : null });
  if (w && w.gathering && price) $('state').textContent += ` · next decision in ${Math.ceil((nextDecisionIn() || 0) / 60000)} min (window fitted to ${current.symbol}: ${Math.round(session.state().windowMs / 60000)} min)`;
  /* a hidden tab ticks about once a second instead of 8 times: the queued pulses (lessons + prediction, ~36 ticks each) would fall
   *   behind without end. Hidden = nobody watches: run them at once, exactly as the server's fly does (measured reasoning 08/11). */
  if (document.hidden) fly.drain();
  renderBook(); renderTally(); saveMemory();
}

/* The Chainlink reference next to the live price: on a weekend it holds Friday's close, and the gap is the market's own view. */
async function readReference() {
  const stock = current;
  try {
    const r = await fetch('/api/actions/reference/' + stock.address, { cache: 'no-store' }).then((x) => x.json());
    if (stock !== current) return;
    const ref = r && r.reference;
    if (!r || !r.ok || !ref || ref.etat !== 'LU' || typeof ref.prixUsd !== 'number') { $('ref').textContent = 'reference not read'; return; }
    const gap = lastPrice ? lastPrice / ref.prixUsd - 1 : null;
    $('ref').textContent = `Reference $${fmt(ref.prixUsd)} (${ref.libelle}, ${ref.fraicheur === 'DERNIERE_VALEUR' ? 'US market closed, last value' : 'live'})`
      + (gap == null ? '' : ` · on-chain ${pct(gap)} vs reference`);
  } catch (_) { $('ref').textContent = 'reference not read'; }
}

function select(i) {
  const prev = current;
  current = STOCKS[i];
  /* the fly trades only the stock watched: what it still holds of the one left is said, not forgotten (QA 08/11) */
  if (auto.s && auto.s.owner && prev && prev !== current) autoAccount(prev.address).then((a) => { if (a.stock && BigInt(a.stock) > 0n) autoNote(`it still holds ${fmt(Number(BigInt(a.stock)) / 10 ** (live.decimals ?? 8), 6)} ${prev.symbol}: it keeps watching ${prev.symbol} for a sharp drop and sells it then (it buys only the stock you watch)`); }).catch(() => { /* said at the next balance read */ }); lastPrice = null; history = []; drawSpark(); lastDecision = null; void readWhyHold();
  $('watching').textContent = `watching ${current.symbol} · its real trades are read every 30 s and smelled together over a window fitted to how much it moves (5 min to 2 h)`;
  $('verdict').textContent = 'Waiting for a smell'; $('verdict').className = 'decision';
  session.reset(); loadMemory(); thoughts.length = 0; renderThoughts(); renderSeal();
  $('price').textContent = '—'; $('state').textContent = 'reading…'; $('ref').textContent = '';
  clearInterval(timer); clearInterval(refTimer);
  readWindow().then(readReference); timer = setInterval(readWindow, POLL_MS); refTimer = setInterval(readReference, REF_MS);
}

async function start() {
  $('pick').innerHTML = STOCKS.map((a, i) => `<option value="${i}">${a.symbol}</option>`).join('');
  $('pick').addEventListener('change', (e) => select(Number(e.target.value)));
  const slider = $('size'), showSize = () => { const v = Number(slider.value) / 1000; $('sizeValue').textContent = pct(v, 1); };
  slider.addEventListener('input', showSize); showSize();
  $('listen').addEventListener('click', listen);
  $('connect').addEventListener('click', connect);
  autoWire();
  const circuit = await fetch('fly-brain-circuit.json').then((r) => r.json());
  fly = createFly(circuit); shadow = createFly(circuit); N = fly.N; act = fly.act;
  /* 09/11: it decides once per window FITTED TO THE STOCK (fly-core 'auto': long enough for its usual move to pay the cost), on the
   *   trades summed over it; every trade is still shown as it comes */
  session = createSession(fly, onEvent, { windowMs: 'auto' });
  /* boldness: how sure it must be to act (kept per viewer). Lower = it acts on weaker pulls, and pays the fee more often. */
  const bold = $('bold'), showBold = () => { const v = Number(bold.value) / 1000; session.threshold = v; $('boldValue').textContent = fmt(v * 100, 1) + '%'; $('boldMirror').textContent = fmt(v * 100, 1) + '%'; try { localStorage.setItem('fly-boldness-v1', String(bold.value)); } catch (_) { /* per visit */ } };
  try { const v = localStorage.getItem('fly-boldness-v1'); if (v && Number(v) >= 2 && Number(v) <= 50) bold.value = v; } catch (_) { /* default */ }
  bold.addEventListener('input', showBold); showBold();
  const idx = new Map(N.map((n, i) => [n.id, i]));
  N.edges = circuit.edges.map(([a, b, w]) => [idx.get(a), idx.get(b), w]);
  /* drawn edges: the 1,800 strongest (900 on a phone), so the canvas stays readable and light */
  N.edges = N.edges.sort((x, y) => y[2] - x[2]).slice(0, canvas.clientWidth && canvas.clientWidth < 600 ? 900 : 1800); N.wMax = N.edges[0][2];
  place(N); init3d(N);
  /* simulation, injected on what is REALLY happening (Phil 08/11): the odor of the last window that had real trades, followed by the
   *   chosen move — taught, then asked again on that same live odor, so the needle moves on the market's own smell. Before any real trade
   *   was smelled, a $5,000 "received" odor stands in, and the log says so. */
  $('inject').addEventListener('click', () => { const v = Number(slider.value) / 1000; if (!v) return;
    /* a simulation teaches THIS fly: while its wallet trades alone, it would steer real orders (security review M1) */
    if (auto.s && auto.s.running) { log('SIMULATION refused: the fly wallet is trading alone on these decisions; stop it first', 'sim'); return; }
    const live = session.lastOdor, mix = live || { received: 5000, sent: 0, moved: 0 }; simOnLive = !!live;
    log(`SIMULATION · ${live ? 'on the last real window (' + mixText(mix) + ')' : 'no real trade smelled yet, a stand-in ' + mixText(mix)} followed by ${pct(v, 1)}`, 'sim');
    if (live) for (const [k, usd] of Object.entries(mix)) if (usd > 0) ripple(k, usd);
    session.learn(mix, v, true); session.predict(mix, true); });
  log(`circuit loaded: ${N.length} neurons, ${circuit.edges.length} connections ≥ ${circuit.synapseThreshold} synapses; `
    + `${N.counts.approach} approach-side and ${N.counts.avoid} avoid-side MBONs, from measured dopamine inputs`);
  wireMap(); wire3d();
  setInterval(tick, 120);
  requestAnimationFrame(loop);
  select(0);
  readShared(); setInterval(readShared, SHARED_MS);
  readWhyGas(); setInterval(readWhyGas, 60000); setInterval(renderWhy, 5000);
  /* game392: the hold signal for the panel every 5 min, and the money rule looked at every minute (not only at the brain's decisions) */
  void readWhyHold(); setInterval(() => { void readWhyHold(); }, 300000); void readHoldAll(); setInterval(() => { void readHoldAll(); }, 300000); setInterval(async () => { await autoTrade({ type: 'tick' }); await autoSweep(); }, 60000); $('autoCap').addEventListener('input', renderWhy);
  /* leaving the tab: whatever is queued is run at once (no animation is lost: nobody sees it) */
  document.addEventListener('visibilitychange', () => { if (document.hidden && fly) fly.drain(); });
  /* the page's own functions, for the fork end-to-end test only: never exposed on the real site */
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.__flyTest = { stocks: () => STOCKS, readHoldAll, ripples: () => ripples.length, readWindow, autoTrade, autoSweep, autoReco, autoStart, autoStop, autoWithdraw, autoAccount, auto, session, fly, decide, current: () => current };
}
start().catch((e) => log('error: ' + (e && e.message || e)));
