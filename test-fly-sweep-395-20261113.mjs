/* test-fly-sweep-395-20261113.mjs — game395 (Phil 2026-11-13: "fix le stock pas surveillé"; "ecris pas ce genre de truc ca fait fuir les
 *   gens"; "ya les autres actions aussi"; "mets [l'activité] en haut"; "un set automatique pour que la mouche soit deja pre calibree").
 * AFFIRME on the REAL files: the fly SELLS a held stock it does not watch on that stock's OUT signal and never BUYS it (autoSweep, every
 *   minute after the watched stock); the server keeps the 12 first stocks warm and /api/fly/hold-all answers from what is built, with no RPC;
 *   the panel lists every stock; no performance figure and no "coin flip" line in the panel; "Activity right now" is in the top column;
 *   "Use recommended settings" sets 5 / 5 / 10 / 20 / 5; the "max per trade too low" line is said once per close.
 * EXECUTED in the page: banc-fly-sweep-qa-20261113.js (stubbed endpoints; 8/8 on localhost 2026-11-13, after two harness fixes).
 * NE PROUVE PAS: a real sell of an unwatched stock on Base (the sell path is the one proven on the fork by banc-fly-hold-fork). */
import { readFileSync } from 'node:fs';
const rd = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const JS = rd('fly-brain.js'), HT = rd('fly-brain.html'), SRV = rd('serveur-web.js'), HOLD = rd('fly-hold.js');
let ok = 0, ko = 0;
const t = (m, c) => { if (c) ok++; else { ko++; console.log('KO', m); } };
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const trade = code(JS.slice(JS.indexOf('async function autoTrade(e, other = null) {'), JS.indexOf('/* the session is remembered')));

t('autoTrade takes the stock not watched, in sell-only mode', trade.includes('const sellOnly = !!other;') && trade.includes('const stock = other || current'));
t('sell-only: its signal read first, nothing else read unless OUT', trade.indexOf("if (sellOnly) { const sg = await readHold(stock.address); if (!(sg.ok && sg.target === 'out')) return; }") > 0
  && trade.indexOf("if (sellOnly) { const sg = await readHold") < trade.indexOf('const a = await autoAccount(stock.address)'));
t('sell-only: never a buy', trade.includes("action = sellOnly && action0 !== 'sell' ? null : action0;"));
t('sell-only: the auto-stop and the memory seal stay with the watched stock', trade.includes('const prix = !sellOnly && Number.isFinite(lastPrice)') && trade.includes('if (!sellOnly) try { await flySeal(stock, decided); }'));
t('the tries are kept per stock', trade.includes('ht[stock.address] = { key: tryKey, n: tr }; auto.s.holdTries = ht; autoSave();'));
const sweep = JS.slice(JS.indexOf('async function autoSweep() {'), JS.indexOf('async function autoSweep() {') + 500);
t('autoSweep: every stock it traded, except the watched one, at most 10, stops when Stop is pressed', sweep.includes('[...new Set(auto.s.traded || [])].filter((x) => x !== current.address)') && sweep.includes('.slice(0, 10)') && sweep.includes('if (!autoRefresh().running) return; await autoTrade({ type: \'tick\' }, st);'));
t('every minute: the watched stock, then the sweep, one after the other', JS.includes("setInterval(async () => { await autoTrade({ type: 'tick' }); await autoSweep(); }, 60000);"));
t('switching stock says it keeps watching the old one', JS.includes('it keeps watching ${prev.symbol} for a sharp drop and sells it then (it buys only the stock you watch)'));
t('the rule is said for every stock', /Its rule, for every stock:/.test(HOLD) && /even one you are not watching/.test(HOLD) && HOLD.includes("'x the usual 6-hour move"));

/* server */
t('server: the 12 first stocks kept warm, one every 15 s, only once a new close can be read', SRV.includes("const FLY_HOLD_CHAUDS = ['SNDKc', 'MSTRc', 'SPCXc', 'NVDAc', 'AMZNc', 'GOOGLc', 'METAc', 'MSFTc', 'TSLAc', 'MUc', 'AAPLc', 'PLTRc']")
  && SRV.includes('await new Promise((o) => setTimeout(o, 15000));') && SRV.includes('if (m && m.r && m.r.ok && m.r.at === last && m.r.closes.every((c) => c.price > 0)) continue;')
  && SRV.includes("if (!(process.env.FLY_SERVER === 'off' || ESSAI_SRV.actif)) { setTimeout(() => { void chaufferSignauxMouche(); }, 60000);"));
const all = SRV.slice(SRV.indexOf("if (chemin === '/api/fly/hold-all') {"), SRV.indexOf("if (chemin === '/api/fly/hold-all') {") + 1000);
t('server: /api/fly/hold-all answers from what is built (no RPC), GET only, budgeted', all.includes("if (req.method !== 'GET')") && all.includes("if (!budgetMouche(req, 'hold'))") && all.includes('[...flyHold.entries()]') && !/rpc|lireSignalMouche\(/.test(all.slice(0, all.indexOf('return;'))));

/* panel and page */
const why = HT.slice(HT.indexOf('id="whyCard"'), HT.indexOf('<div class="card live">'));
t('panel: no performance figure, no coin-flip line', !/[−+-]\d+\.\d%/.test(why) && !/coin flip/i.test(why) && !code(JS.slice(JS.indexOf('function renderWhy()'), JS.indexOf('function renderWhy()') + 3000)).includes('coin flip'));
t('panel: says the risk in plain words', why.includes('You can lose money: prices move, and it can miss a rise.'));
t('panel: every stock listed (table, rows clickable by index)', why.includes('<tbody id="holdAll">') && JS.includes("i = STOCKS.findIndex((x) => x.address === st.address); if (p && i >= 0 && p.value !== String(i))") && JS.includes('void readHoldAll(); setInterval(() => { void readHoldAll(); }, 300000);'));
const hero = HT.slice(HT.indexOf('<div class="hero">'), HT.indexOf('<nav class="jump">'));
t('"Activity right now" is in the top column, once', hero.includes('<h2>Activity right now</h2>') && HT.split('<h2>Activity right now</h2>').length === 2 && hero.includes('id="gauges"'));
t('recommended settings: a button, the values, the wiring', HT.includes('<button id="autoReco" type="button">Use recommended settings</button>') && JS.includes('const AUTO_RECO = Object.freeze({ autoBudget: 5, autoCap: 5, autoDay: 10, autoVol: 20, autoLoss: 5 });')
  && JS.includes("$('autoReco').addEventListener('click', autoReco);"));
t('a saved max per trade under 2 USDC is said at load, with the fix', JS.includes("if (auto.s && field('autoCap', 0.1, 100, 0.1) < HOLD_MIN_BUY_USDC) autoNote('your saved Max per trade is "));
t('the minimum-buy line is said once per close', trade.includes('if (auto.saidMin === tryKey) return; auto.saidMin = tryKey;'));

console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
