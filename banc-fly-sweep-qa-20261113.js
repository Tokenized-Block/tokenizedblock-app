// banc-fly-sweep-qa-20261113.js — game395 QA ON THE REAL PAGE (fly-brain.html on localhost, through window.__flyTest), EXECUTED.
// Paste into the page's console on http://127.0.0.1:<port>/fly-brain.html (or inject it), then: await QA395.run()
// Every money endpoint is stubbed (fetch): nothing leaves the page, nothing is signed for a real chain (the fake relay answers the hash).
// AFFIRME: (1) the watched stock, signal IN, holding none -> ONE plan USDC -> stock at min(USDC, cap), fee "0", relayed; (2) a plan stating
//   a fee other than 0 -> nothing relayed; (3) a stock the fly HOLDS but does not watch, signal OUT -> autoSweep SELLS all of it;
//   (4) same stock, signal IN -> nothing planned for it, never a buy; (5) a Max per trade under 2 USDC -> said ONCE over 3 ticks, nothing
//   planned; (6) "Use recommended settings" sets 5 / 5 / 10 / 20 / 5; (7) "Activity right now" sits in the top column, next to the brain.
// NE PROUVE PAS: a real swap (banc-fly-hold-fork-20261113.mjs does, on a fork).
window.QA395 = (() => {
const T = () => window.__flyTest, $ = (id) => document.getElementById(id);
const json = (b) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
const word = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
const ROUTER = '0x9ee35bf1bd69a03c6f0393582030fce8bb93d418', USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const WIN = 6 * 3600 * 1000, lastEnd = () => Math.floor(Date.now() / WIN) * WIN;
let keccak = null;
const hashOf = async (raw) => { keccak = keccak || (await import('/keccak.js')); const h = raw.slice(2); return keccak.keccak256Hex(Uint8Array.from(h.match(/../g), (x) => parseInt(x, 16))); };
const notes = () => [...$('autoLog').children].map((p) => p.textContent);
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'ok  ' : 'KO  ') + name + ' — ' + detail); return ok; };
function stub({ held = {}, signal = {}, fee = '0' }) {
  const calls = [];
  const real = window.__realFetch || (window.__realFetch = window.fetch.bind(window));
  window.fetch = async (u, init) => {
    const url = String(u); calls.push(url);
    if (/\/api\/fly\/hold\//.test(url)) { const tok = url.split('/api/fly/hold/')[1].split('?')[0]; const t = signal[tok];
      return json(t ? { ok: true, token: tok, target: t, move: t === 'out' ? -0.08 : -0.01, typical: 0.02, threshold: -0.04, at: lastEnd(), moves: 27, feePips: 500 } : { ok: false, target: null, why: 'stub: no signal' }); }
    if (/\/api\/fly\/hold-all/.test(url)) return json({ ok: true, stocks: [] });
    if (/\/api\/fly\/account\//.test(url)) { const tok = (new URL(url, location.href)).searchParams.get('token');
      return json({ ok: true, address: T().auto.s.address, nonce: '0', baseFeePerGas: '1000000', block: 1, ethUsd: 2000, eth: '1000000000000000', usdc: '20000000', stock: tok ? String(held[tok] || '0') : null }); }
    if (/\/api\/fly\/estimate/.test(url)) return json({ ok: true, gas: '60000' });
    if (/\/api\/fly\/relay/.test(url)) return json({ ok: true, hash: await hashOf(JSON.parse(init.body).raw) });
    if (/\/api\/fly\/receipt\//.test(url)) return json({ ok: true, receipt: { status: '0x1', blockNumber: '0x1', gasUsed: '0x5208' } });
    if (/\/api\/rails\/plan/.test(url)) { const q = new URL(url, location.href).searchParams;
      return json({ ok: true, etat: 'PRET', resume: { paye: q.get('montant'), fraisBps: fee, recoitAuMoins: '4900000' }, aSigner: [{ to: ROUTER, data: '0x12345678' + word(T().auto.s.address), value: '0x0', nom: 'swap (stub)' }] }); }
    if (/\/api\/fly\/seal|fly-seal/.test(url)) return json({ ok: false });
    return real(u, init);
  };
  return calls;
}
const unstub = () => { if (window.__realFetch) window.fetch = window.__realFetch; };
/* the page's own 60 s tick runs autoTrade too, under the same Web Lock: a case waits until the page is idle (a locked case is not a result) */
const idle = async () => { for (let k = 0; k < 100 && T().auto.busy; k++) await new Promise((o) => setTimeout(o, 100)); };
async function freshWallet(traded = []) {
  await idle();
  const W = await import('/fly-wallet.js'), key = W.newKeyHex();
  T().auto.s = { v: 1, key, address: W.addressOf(key), owner: '0x' + '5'.repeat(40), running: true, day: '', today: 0, traded, created: Date.now(), consentAt: Date.now() };
  localStorage.setItem('fly-auto-wallet-v1', JSON.stringify(T().auto.s));
  $('autoLog').textContent = ''; T().auto.seenBy = {}; T().auto.saidMin = null;
}
async function run() {
  results.length = 0;
  const A = T().current().address, B = T().stocks().map((x) => x.address).find((v) => v !== A);
  T().autoReco();
  check('6 · recommended settings: 5 / 5 / 10 / 20 / 5', ['autoBudget', 'autoCap', 'autoDay', 'autoVol', 'autoLoss'].map((id) => $(id).value).join('/') === '5/5/10/20/5', ['autoBudget', 'autoCap', 'autoDay', 'autoVol', 'autoLoss'].map((id) => $(id).value).join('/'));
  /* 1 */
  { await freshWallet(); const calls = stub({ signal: { [A]: 'in' } }); await T().autoTrade({ type: 'tick' });
    const plans = calls.filter((u) => u.includes('/api/rails/plan')), relays = calls.filter((u) => u.includes('/api/fly/relay'));
    const q = plans[0] ? new URL(plans[0], location.href).searchParams : null;
    check('1 · watched stock IN, holding none -> one BUY at min(USDC 20, cap 5) = 5 USDC, fee "0", relayed', plans.length === 1 && q.get('de').toLowerCase() === USDC /* the page sends the checksummed address */ && q.get('vers') === A && q.get('montant') === '5000000' && q.get('mouche') === '1' && relays.length >= 1 && relays.length <= 2 /* the trade, then the memory seal of the watched stock */, plans.length + ' plan(s) · ' + (q ? q.toString().slice(0, 120) : '') + ' · ' + relays.length + ' relay'); }
  /* 2 */
  { await freshWallet(); const calls = stub({ signal: { [A]: 'in' }, fee: '10' }); await T().autoTrade({ type: 'tick' });
    check('2 · a plan stating a 10 bps fee -> nothing relayed', calls.filter((u) => u.includes('/api/fly/relay')).length === 0 && notes().some((n) => /states an interface fee of 10 bps/.test(n)), notes()[0] && notes()[0].slice(0, 120)); }
  /* 3 */
  { await freshWallet([B]); const calls = stub({ held: { [B]: '123456' }, signal: { [A]: 'in', [B]: 'out' } }); await T().autoSweep();
    const plans = calls.filter((u) => u.includes('/api/rails/plan')).map((u) => new URL(u, location.href).searchParams);
    check('3 · a held stock NOT watched, signal OUT -> autoSweep sells all of it', plans.length === 1 && plans[0].get('de') === B && plans[0].get('vers').toLowerCase() === USDC && plans[0].get('montant') === '123456' && calls.some((u) => u.includes('/api/fly/relay')),
      (plans.map((p) => p.get('de').slice(0, 8) + '>' + p.get('vers').slice(0, 8) + ' ' + p.get('montant')).join(', ') || 'no plan') + ' · ' + notes().join(' | ').slice(0, 200)); }
  /* 4 */
  { await freshWallet([B]); const calls = stub({ held: { [B]: '0' }, signal: { [A]: 'in', [B]: 'in' } }); await T().autoSweep();
    check('4 · the same stock, signal IN -> nothing planned for it, never a buy, not even its balance read', !calls.some((u) => u.includes('/api/rails/plan')) && !calls.some((u) => u.includes('/api/fly/account/') && u.includes(B)), calls.filter((u) => /plan|account/.test(u)).length + ' plan/account calls'); }
  /* 5 */
  { await freshWallet(); $('autoCap').value = '0.5'; const calls = stub({ signal: { [A]: 'in' } });
    for (let k = 0; k < 3; k++) await T().autoTrade({ type: 'tick' });
    const said = notes().filter((n) => /it buys from 2 USDC/.test(n)).length;
    check('5 · Max per trade 0.5 -> said once over 3 ticks, nothing planned', said === 1 && !calls.some((u) => u.includes('/api/rails/plan')), said + ' note(s)'); T().autoReco(); }
  /* 8 */
  { const real = window.__realFetch || (window.__realFetch = window.fetch.bind(window));
    window.fetch = async (u, init) => (String(u).includes('/api/fly/hold-all') ? json({ ok: true, stocks: [{ token: B, symbol: 'B', target: 'out', move: -0.08, typical: 0.02, threshold: -0.04, at: lastEnd() }] }) : real(u, init));
    await T().readHoldAll();
    const row = [...document.querySelectorAll('#holdAll tr')].find((tr) => tr.lastChild && tr.lastChild.textContent === 'OUT');
    if (row) row.click(); await new Promise((o) => setTimeout(o, 500));
    check('8 · every stock is listed; a click on a row watches that stock', !!row && T().current().address === B, row ? 'now watching ' + T().current().symbol : 'no OUT row');
    const p = $('pick'); p.value = '0'; p.dispatchEvent(new Event('change')); await new Promise((o) => setTimeout(o, 500)); unstub(); }
  /* 7 */
  { const g = $('gauges'), hero = document.querySelector('.hero .now');
    check('7 · "Activity right now" is in the top column, next to the brain', !!(hero && g && hero.contains(g)), hero && g ? 'in .hero .now' : 'not found'); }
  unstub();
  T().auto.s.running = false; localStorage.removeItem('fly-auto-wallet-v1');
  const ko = results.filter((r) => !r.ok).length;
  console.log(results.length - ko + '/' + results.length + (ko ? ' — RED' : ' — green'));
  return { ok: results.length - ko, total: results.length, results };
}
return { run };
})();
