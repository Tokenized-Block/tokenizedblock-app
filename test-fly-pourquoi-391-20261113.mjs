/* test-fly-pourquoi-391-20261113.mjs — game391 (2026-11-13): the fly page never makes a real trade and users read "it does nothing".
 *   Measured: its record is a coin flip (live 483 right / 471 wrong = 50.6%) and a round trip on Base costs 1.55% at 0.5 USDC, 0.46% at 2,
 *   0.25% at 5, 0.17% at 10, 0.14% at 20, against a usual move near 0.21%. The buy rule (fly-core aRetourPaye) is right to stay out and is
 *   NOT loosened: the page explains it instead ("Why it has not traded", fly-pourquoi.js).
 * AFFIRME, on the REAL files:
 *   - the explainer's cost IS aRetourPaye's threshold: over a grid of tallies, usual moves, pool fees, gas and sizes, PLUS boundary points
 *     where the gas is nudged ulp by ulp across edge == cost, "edge > shown cost" and the shown verdict agree with aRetourPaye every time;
 *   - with the measured inputs of 2026-11-13 (ETH $2,009.55, base fee 0.005 gwei, pool 0.05%) the size table matches the study's
 *     fly-formula column within 0.002 points, and the record needed is "impossible" at 0.5 / 2 / 5 USDC;
 *   - a number that was not read (gas, record, usual move, pool fee, size) says "not read", never 0, and the verdict is then "stays out";
 *   - the record in words (coin flip / better / worse / too few / nothing yet), from the exact binomial tails;
 *   - the trading rule is untouched: aRetourPaye, edgePaysFee, edgeOf, gasUsdCote, recordEdge and decide are byte-identical to the base
 *     (public/main, else d7454bb), and fly-core.js has no diff at all;
 *   - the page wires the panel to the SAME inputs the buy reads (session state, gasUsdCote, the "Max per trade" field), the server serves
 *     the module (SERVIS) and the read-only /api/fly/gas route; the copy says "live experiment", promises nothing, carries no internal word;
 *   - mutants of fly-pourquoi.js (copied beside it under a temp name, then removed) are each killed by these checks.
 * NE PROUVE PAS: the live numbers a browser shows (checked by hand at 1077 and 375 px), nor that the rule is the right rule. */
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const lire = (f) => { try { return readFileSync(path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n'); } catch (_) { return ''; } };
let ok = 0, ko = 0;
const t = (m, c, x = '') => { if (c) ok++; else { ko++; console.log('KO', m, x); } };

const core = await import(pathToFileURL(path.join(ICI, 'fly-core.js')).href);
const { aRetourPaye, edgeOf, gasUsdCote } = core;

/* the measured inputs of 2026-11-13 (scratch fly-fix/cost.json, costs-table.json) */
const ETH_USD = 2009.5512562774836, BASE_FEE = '5000000';
const GAS_MESURE = gasUsdCote(BASE_FEE, ETH_USD);
const FORMULE_ETUDE = { 0.5: 1.5469, 2: 0.4617, 5: 0.2447, 10: 0.1723, 20: 0.1362 }; /* flyFormulaPct, % */
const LIVE = { consistent: 483, opposite: 471, flat: 0, undecided: 0 };

/* every check of the module, run on the real one and on each mutant: returns the number of failures */
function checks(M, say) {
  let bad = 0;
  const c = (m, cond, x = '') => { if (!cond) { bad++; if (say) say(m, x); } };
  const { whyNoTrade, whyLines, roundTripCost, recordWords, SIZES_USDC } = M;
  /* 1. the grid: the shown cost is the threshold, the shown verdict is the decision */
  const tallies = [{ consistent: 0, opposite: 0 }, { consistent: 3, opposite: 1 }, LIVE, { consistent: 60, opposite: 40 }, { consistent: 900, opposite: 100 },
    { consistent: 9000, opposite: 100 }, { consistent: 100, opposite: 900 }];
  const typicals = [0.0005, 0.0021, 0.01, 0.05], fees = [0, 100, 500, 3000], gases = [0.0001, 0.0036, 0.05], sizes = [0.1, 0.5, 2, 20, 100];
  let n = 0, ins = 0, outs = 0;
  for (const tally of tallies) for (const typical of typicals) for (const feePips of fees) for (const gasUsd of gases) for (const tailleUsd of sizes) {
    const inp = { tally, typical, feePips, gasUsd, tailleUsd }, w = whyNoTrade(inp), d = aRetourPaye(inp), e = edgeOf(tally, typical);
    n++; if (d) ins++; else outs++;
    if (w.cost == null || w.edge !== e || (e > w.cost) !== d || w.trades !== d || (w.state === 'in') !== d || w.state === 'not-read') { c('grid: shown cost / verdict == aRetourPaye', false, JSON.stringify(inp)); break; }
  }
  c('grid covers both verdicts', ins > 20 && outs > 20, ins + ' in / ' + outs + ' out of ' + n);
  /* 2. boundaries: gas nudged across edge == cost, ulp by ulp, with and without an interface fee */
  let crossings = 0;
  for (const [tally, typical, feePips, interfaceFee, tailleUsd] of [[{ consistent: 900, opposite: 100 }, 0.01, 500, 0, 2], [{ consistent: 60, opposite: 40 }, 0.02, 0, 0.001, 20], [{ consistent: 9000, opposite: 100 }, 0.0021, 100, 0, 10]]) {
    const e = edgeOf(tally, typical), g0 = (e - 2 * (feePips / 1e6 + interfaceFee)) * tailleUsd / 2;
    let g = g0, prev = null;
    for (let k = 0; k < 8; k++) g = g - Math.abs(g) * Number.EPSILON;
    for (let k = 0; k < 16; k++) {
      const inp = { tally, typical, feePips, interfaceFee, gasUsd: g, tailleUsd }, w = whyNoTrade(inp), d = aRetourPaye(inp);
      if ((w.edge > w.cost) !== d || w.trades !== d || (w.state === 'in') !== d) { c('boundary: shown cost == threshold at edge == cost', false, JSON.stringify(inp)); break; }
      if (prev !== null && prev !== d) crossings++;
      prev = d; g = g + Math.abs(g) * Number.EPSILON;
    }
  }
  c('boundary: the verdict flips inside the nudged range (the boundary was really crossed)', crossings >= 3, String(crossings));
  /* 3. the measured inputs: the table matches the study, the record needed is impossible at small sizes */
  const wm = whyNoTrade({ tally: LIVE, typical: 0.0021, feePips: 500, gasUsd: GAS_MESURE, tailleUsd: 0.5 });
  c('table: the five sizes 0.5 / 2 / 5 / 10 / 20 USDC', JSON.stringify(SIZES_USDC) === '[0.5,2,5,10,20]' && wm.table.length === 5);
  for (const r of wm.table) c('table: ' + r.size + ' USDC matches the study within 0.002 points', Math.abs(r.cost * 100 - FORMULE_ETUDE[r.size]) < 0.002, String(r.cost * 100));
  for (const r of wm.table) c('table row ' + r.size + ': its cost is the same function at that size', r.cost === roundTripCost({ feePips: 500, gasUsd: GAS_MESURE, tailleUsd: r.size }) && r.trades === aRetourPaye({ tally: LIVE, typical: 0.0021, feePips: 500, gasUsd: GAS_MESURE, tailleUsd: r.size }));
  c('measured: stays out at 0.5 USDC', wm.state === 'out' && wm.trades === false);
  c('measured: record needed impossible at 0.5, 2, 5; about 91% at 10, 82% at 20', wm.table[0].impossible && wm.table[1].impossible && wm.table[2].impossible
    && !wm.table[3].impossible && Math.abs(wm.table[3].need - 0.9103) < 0.001 && Math.abs(wm.table[4].need - 0.8242) < 0.001, JSON.stringify(wm.table.map((r) => r.need)));
  c('need: (2p - 1) x typical == cost at p = need', Math.abs((2 * wm.table[4].need - 1) * 0.0021 - wm.table[4].cost) < 1e-15);
  c('saves: (cost - edge) x size', Math.abs(wm.savesUsd - (wm.cost - wm.edge) * 0.5) < 1e-15 && wm.savesUsd > 0);
  const Lm = whyLines(wm);
  c('lines: record 483 / 471, 50.6%, about a coin flip', Lm.record.includes('483 right, 471 wrong (50.6%)') && Lm.record.includes('about a coin flip so far'), Lm.record);
  c('lines: verdict says 2 beats 3, both numbers, stays out, saves', /It trades only when 2 beats 3\. Today 2 is 0\.003% and 3 is 1\.547%: it stays out, which saves you about 0\.0077 USDC per round trip\./.test(Lm.verdict), Lm.verdict);
  c('lines: impossible said', /impossible/.test(Lm.need) && Lm.table[0].need.includes('impossible'), Lm.need);
  /* 4. not read, never 0 */
  const base = { tally: LIVE, typical: 0.0021, feePips: 500, gasUsd: GAS_MESURE, tailleUsd: 0.5 };
  for (const [what, patch, line] of [['gas', { gasUsd: null }, 'cost'], ['gas 0', { gasUsd: 0 }, 'cost'], ['pool fee', { feePips: null }, 'cost'], ['size', { tailleUsd: NaN }, 'cost'],
    ['record', { tally: null }, 'record'], ['usual move', { typical: 0 }, 'edge']]) {
    const inp = { ...base, ...patch }, w = whyNoTrade(inp), L = whyLines(w);
    c('not read (' + what + '): said "not read" on its line', L[line].includes('not read'), L[line]);
    c('not read (' + what + '): never a 0 shown for it', !/(?:^|[^\d.])0(?:\.0+)?%/.test(L[line]) && !/\$0(?:\.0+)?\b/.test(L[line]), L[line]);
    c('not read (' + what + '): it stays out, as the rule does', w.state === 'not-read' && w.trades === false && /stays out/.test(L.verdict) && (inp.tally === null || aRetourPaye(inp) === false));
  }
  { const L = whyLines(whyNoTrade({ ...base, gasUsd: null })); c('gas not read: every size row says not read', L.table.every((r) => r.cost === 'not read' && r.need === 'not read')); }
  /* 5. the record in words */
  c('words: nothing yet / too few / coin flip / better / worse', recordWords({ consistent: 0, opposite: 0 }) === 'nothing judged yet' && recordWords({ consistent: 5, opposite: 2 }) === 'too few to tell yet'
    && recordWords(LIVE) === 'about a coin flip so far' && recordWords({ consistent: 80, opposite: 20 }) === 'better than a coin flip so far' && recordWords({ consistent: 20, opposite: 80 }) === 'worse than a coin flip so far');
  /* the shared fly's sentence: its numbers, the same verdict, not read when not read */
  c('numbers line: measured -> 0.003% against 1.547%, stays out', M.numbersLine(wm) === 'On its numbers, one window in can earn 0.003% against 1.547% for a round trip at your size: it would stay out.', M.numbersLine(wm));
  c('numbers line: not read', M.numbersLine(whyNoTrade({ ...base, typical: 0 })).includes('not read') && M.numbersLine(whyNoTrade({ ...base, gasUsd: null })).includes('not read'));
  /* 6. a fly that pays: said, and with the live-experiment warning */
  { const w = whyNoTrade({ tally: { consistent: 9000, opposite: 100 }, typical: 0.05, feePips: 500, gasUsd: GAS_MESURE, tailleUsd: 20 }), L = whyLines(w);
    c('when 2 beats 3: it may buy, and "live experiment: it can lose"', w.state === 'in' && /may buy/.test(L.verdict) && /live experiment: it can lose/.test(L.verdict), L.verdict); }
  return bad;
}

/* ── the real module ── */
const NOM = 'fly-pourquoi.js';
let M = null;
try { M = await import(pathToFileURL(path.join(ICI, NOM)).href); } catch (e) { t('fly-pourquoi.js exists and loads', false, String(e && e.message).slice(0, 120)); }
if (M) { const bad = checks(M, (m, x) => t(m, false, x)); t('the real module passes every check', bad === 0, bad + ' failed'); }

/* ── the rule is untouched ── */
const BASES = ['public/main', 'd7454bb'];
const git = (args) => execFileSync('git', args, { cwd: ICI, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).replace(/\r\n/g, '\n');
let baseRef = null; for (const b of BASES) { try { git(['rev-parse', '--verify', b + ':fly-core.js']); baseRef = b; break; } catch (_) { /* next */ } }
t('the base tree is readable (public/main or d7454bb)', baseRef !== null);
if (baseRef) {
  const avant = git(['show', baseRef + ':fly-core.js']), apres = lire('fly-core.js');
  const fn = (src, name) => { const i = src.indexOf('export function ' + name + '('); if (i < 0) return null; const m = /\r?\n\}\r?\n/.exec(src.slice(i)); if (!m) return null; return src.slice(i, i + m.index + m[0].length - 1); };
  for (const name of ['aRetourPaye', 'edgePaysFee', 'edgeOf', 'gasUsdCote', 'recordEdge', 'decide']) {
    const a = fn(avant, name), b = fn(apres, name);
    t('rule untouched: ' + name + ' byte-identical to ' + baseRef, a !== null && a === b);
  }
  t('rule untouched: GAS_UNITES_COTE and FLY.EDGE_PRIOR / INTERFACE_FEE unchanged', apres.includes('export const GAS_UNITES_COTE = 300000n;') && /EDGE_PRIOR: 10,/.test(apres) && /INTERFACE_FEE: 0,/.test(apres));
  let d = 'x'; try { d = git(['diff', baseRef, '--', 'fly-core.js']); } catch (_) { /* stays x */ }
  t('git diff ' + baseRef + ' -- fly-core.js is empty', d === '', d.slice(0, 200));
}

/* ── the page, the server, the copy ── */
const JS = lire('fly-brain.js'), HT = lire('fly-brain.html'), SRV = lire('serveur-web.js'), MOD = lire(NOM);
/* game392 (Phil 2026-11-13, option A): the panel became "How it trades": the hold rule its trades read (fly-hold.js), the cost of one
 *   step out and back at your size (roundTripCost of this module, interface fee 0: the fly's trades carry none), the brain's paper record */
t('page imports what the panel uses from this module', JS.includes("import { whyNoTrade, recordText, roundTripCost, SIZES_USDC } from './fly-pourquoi.js';"));
const rw = JS.slice(JS.indexOf('function renderWhy()'), JS.indexOf('function renderWhy()') + 3200);
t('page: the panel shows the hold signal of the stock you watch (holdLines), never the signal of another stock',
  rw.includes('const sig = whyHold.token === current.address ? whyHold.sig : null;') && rw.includes('const H = holdLines(sig, current.symbol);'));
t('page: the cost at your size is roundTripCost with no interface fee, at your max per trade',
  rw.includes("const st = session.state(), size = field('autoCap', 0.1, 100, 0.1);") && rw.includes('roundTripCost({ feePips: fee, interfaceFee: 0, gasUsd: whyGas.usd, tailleUsd: size })'));
t('page: the buy reads the same max-per-trade field', JS.includes("const cap = BigInt(Math.round(field('autoCap', 0.1, 100, 0.1) * 1e6))"));
t('page: gas priced with gasUsdCote', JS.includes('whyGas.usd = g && g.ok ? gasUsdCote(g.baseFeePerGas, Number(g.ethUsd)) : null;'));
t('page: gas or fee not read -> "not read"', rw.includes("whyGas.usd == null ? 'not read (' + whyGas.why + ')'") && rw.includes("fee == null ? 'not read'") && rw.includes("c == null ? 'not read'"));
t('page: the brain record is shown for context, and said not to move the money', rw.includes("recordText(whyNoTrade({ tally: st.tally }).record, 'Its brain on '") && rw.includes('that is why the brain no longer moves the money'));
t('page: refreshed (gas every minute, numbers every 5 s, hold signal every 5 min, on a stock switch, and on a size change)',
  JS.includes("readWhyGas(); setInterval(readWhyGas, 60000); setInterval(renderWhy, 5000);") && JS.includes('void readWhyHold(); setInterval(() => { void readWhyHold(); }, 300000);')
  && JS.includes('lastDecision = null; void readWhyHold();') && JS.includes("$('autoCap').addEventListener('input', renderWhy);"));
t('page: a size under the minimum buy is said in the panel', rw.includes('size < HOLD_MIN_BUY_USDC ?'));
t('html: the panel and its fields', ['id="whyCard"', 'id="whyRecord"', 'id="whyShared"', 'id="whyEdge"', 'id="whyCost"', 'id="whyVerdict"', 'id="whyNeed"', 'id="whySizes"', 'id="whyGas"', '<h2>How it trades</h2>'].every((s) => HT.includes(s)));
t('html: the replay misses are written next to the catches (AAPLc behind, a different risk)', HT.includes('but AAPLc +2.0% against +5.6% held') && HT.includes('It is a different risk, not a better investment: it can lose, and it can miss a rise.'));
t('html: the old edge rule text is gone', !HT.includes('It buys only when its edge pays the real cost') && !HT.includes('<h2>Why it has not traded</h2>'));
t('html: defaults 5 USDC budget and per trade, 20 USDC a day', HT.includes('id="autoBudget" type="number" min="0.1" max="100" step="0.1" value="5"') && HT.includes('id="autoCap" type="number" min="0.1" max="100" step="0.1" value="5"') && HT.includes('id="autoVol" type="number" min="0.5" max="1000" step="0.5" value="20"'));
t('server: the module is served (SERVIS)', /\r?\n {2}'fly-pourquoi\.js',\r?\n/.test(SRV));
t('server: /api/fly/gas is read-only, budgeted, null when unread', SRV.includes("if (chemin === '/api/fly/gas') {") && SRV.includes("if (!budgetMouche(req, 'gas'))") && /FLY_LIMITES = \{[^}]*gas: \d+[,}]/.test(SRV) && SRV.includes('ethUsd: eu, why:'));
const texte = MOD.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '') + HT.slice(HT.indexOf('id="whyCard"'), HT.indexOf('<div class="card live">')) + rw;
t('copy: no internal words, no version names', !/not deployed|under review|fork[- ]?test|\b[vV]\d+\b|\bV8\b/.test(texte));
t('copy: promises nothing', !/guarantee|profit|will (?:earn|make|gain)|risk[- ]free|sure gain/i.test(texte));

/* ── mutants of the module, each must be killed by checks() ── */
const MUTANTS = [
  ['cost counts one side of gas', '+ 2 * gasUsd / tailleUsd;', '+ gasUsd / tailleUsd;'],
  ['cost counts one side of the pool fee', 'return 2 * (feePips / 1e6 + interfaceFee) + 2', 'return (feePips / 1e6 + interfaceFee) + 2'],
  ['cost ignores the interface fee', 'return 2 * (feePips / 1e6 + interfaceFee) + 2', 'return 2 * (feePips / 1e6) + 2'],
  ['gas 0 accepted as read', '(num(gasUsd) && gasUsd > 0 &&', '(num(gasUsd) && gasUsd >= 0 &&'],
  ['verdict computed, not asked to the rule', 'const trades = pays(tailleUsd);', 'const trades = edge != null && cost != null && edge >= cost;'],
  ['need without the /2', '? (1 + c / typical) / 2 : null', '? (1 + c / typical) : null'],
  ['not read shown as 0', "const NR = 'not read';", "const NR = '0%';"],
  ['unread record shown as a coin flip', 'const record = rec ?', 'const record = true ?'],
  ['impossible threshold off', 'impossible: n != null && n >= 1,', 'impossible: n != null && n > 2,'],
  ['words: worse never said', "if (worse.p < 0.1) return 'worse than a coin flip so far';", ''],
  ['saves uses the edge only', 'savesUsd: state === \'out\' ? (cost - edge) * tailleUsd : null', 'savesUsd: state === \'out\' ? cost * tailleUsd : null'],
  ['shared numbers line: verdict inverted', "w.state === 'in' ? 'that would pay' : 'it would stay out'", "w.state !== 'in' ? 'that would pay' : 'it would stay out'"],
  ['table at the wrong sizes', 'Object.freeze([0.5, 2, 5, 10, 20])', 'Object.freeze([1, 2, 5, 10, 20])'],
];
if (M) {
  let killed = 0;
  for (const [nom, de, vers] of MUTANTS) {
    if (!MOD.includes(de)) { t('mutant applies: ' + nom, false); continue; }
    const f = path.join(ICI, '.mutant-391-' + process.pid + '-' + killed + '-' + Math.random().toString(36).slice(2, 8) + '.mjs');
    try {
      writeFileSync(f, MOD.replace(de, () => vers));
      let bad; try { bad = checks(await import(pathToFileURL(f).href), null); } catch (_) { bad = 1; }
      t('mutant killed: ' + nom, bad > 0); if (bad > 0) killed++;
    } finally { if (existsSync(f)) rmSync(f); }
  }
  console.log('mutants killed: ' + killed + '/' + MUTANTS.length);
}
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
