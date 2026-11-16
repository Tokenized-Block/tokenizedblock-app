// test-stocks-display-only-20261116.mjs — THIRTY COINBASE TOKENIZED STOCKS ARE LISTED, DISPLAY-ONLY.
// ================================================================================================
// WHAT WAS ASKED: Phil's GO of 2026-11-10 19:20 (DOCNc, PINSc, HOODc, TTMIc, Sc, KDc, RBRKc, ENVXc, ACMRc, SPBc) and of 2026-11-16
//   14:12 (REALc, GTc, WUc, CPNGc, YOUc, GRPNc, WHRc, JBLUc, DKSc, FOURc, OLLIc, ALLc, AXPc, KMBc, EVERc, OWLc, DECKc, ETSYc, PGc,
//   UALc), both relayed by Grok Bot. They are shown in the app, but no pool has liquidity (DexScreener: 0 pairs; on chain
//   totalSupply 0), so they are NOT pairable and NOT tradable. The issuer API no longer gives NAV, supply or redeem_paused: the
//   screen says « not read », never an example number. App only: no on-chain write, no signature.
//   Base: the files served by tokenizedblock.space at data-build 20261109-game428 (the 2026-11-10 batch was never deployed).
// WHAT THIS TEST PROVES:
//   A. paires.js lists exactly these 30 (address + symbol + batch), each with the decimals READ ON CHAIN now through a public Base node
//      (eth_call decimals(), read-only), and the same 30 as Grok Bot's watch file base.json when that file is on this machine.
//   B. none of them is pairable or tradable: not in the stock registry, the base currencies, the proposed / launchable pairs, any
//      launch-hook list (V8, V9, 7030), the known-currency set of the trade sheet, the measured Aerodrome table, the skins
//      currencies; a pasted address is REFUSED by qualifierPaire; the launch-hook rule answers null even with every flag on.
//   C. NAV, supply and redeem status read « not read », with no digit; the rendered card and the Create options carry no digit
//      outside the addresses, every Create option is disabled, and no fee address shows.
//   D. app.html (LF or CRLF) renders the card in the Market tab, adds the disabled options to the Create pair list and keeps
//      the 30 out of the « Live blocks » pair group. Each extracted piece of code is asserted FOUND before it is judged.
// No global is saved, replaced or restored by this test.
import { readFileSync, existsSync } from 'node:fs';

let ok = 0, ko = 0, skipped = 0;
const check = (cond, what, seen) => {
  if (cond) { ok += 1; console.log('  ok  ' + what); }
  else { ko += 1; console.log('  KO  ' + what + (seen === undefined ? '' : '\n        seen: ' + String(seen).slice(0, 400))); }
};
const low = (x) => String(x || '').toLowerCase();
const read = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8');

/* the two GOs, copied from Grok Bot's messages (2026-11-10 19:20 and 2026-11-16 14:12, Brussels) — the only source of these 30.
 *   Third column = the batch: dropping a batch from paires.js means dropping the same rows here. */
const GO = [
  ['DOCNc', '0xb20000000000000000000005befa57b9b871e737', '2026-11-10'],
  ['PINSc', '0xb2000000000000000000001dfd8c413ecd6ec630', '2026-11-10'],
  ['TTMIc', '0xb2000000000000000000007292d3d91c6b559058', '2026-11-10'],
  ['Sc', '0xb2000000000000000000008cae79b36e9269eb86', '2026-11-10'],
  ['KDc', '0xb200000000000000000000a8fff5b07c6c45a5d2', '2026-11-10'],
  ['RBRKc', '0xb200000000000000000000b6354bc256dbcd93a8', '2026-11-10'],
  ['ENVXc', '0xb200000000000000000000bbc68170eb0b049e42', '2026-11-10'],
  ['ACMRc', '0xb200000000000000000000bd0ea991ec5b5a8a03', '2026-11-10'],
  ['SPBc', '0xb200000000000000000000ec3cd781acad151fdc', '2026-11-10'],
  ['REALc', '0xb200000000000000000000211a2ed33fad95b0b3', '2026-11-16'],
  ['GTc', '0xb200000000000000000000264d3a9dea68aa6631', '2026-11-16'],
  ['WUc', '0xb20000000000000000000033be01089cf02a2025', '2026-11-16'],
  ['CPNGc', '0xb20000000000000000000038e9982fe875b7e066', '2026-11-16'],
  ['YOUc', '0xb2000000000000000000003cdb2c0f94e4ebf605', '2026-11-16'],
  ['GRPNc', '0xb2000000000000000000004637e5a787885c720d', '2026-11-16'],
  ['WHRc', '0xb2000000000000000000006448a906e8942850fa', '2026-11-16'],
  ['JBLUc', '0xb20000000000000000000064832d0d2d38e2f4fc', '2026-11-16'],
  ['DKSc', '0xb2000000000000000000008463bf2557b483abf9', '2026-11-16'],
  ['FOURc', '0xb2000000000000000000008c02be39ba2cbda822', '2026-11-16'],
  ['OLLIc', '0xb20000000000000000000097ca7d4003399c67e6', '2026-11-16'],
  ['ALLc', '0xb2000000000000000000009b05748ece723cc6a6', '2026-11-16'],
  ['AXPc', '0xb2000000000000000000009cfe164a21cb5a11c5', '2026-11-16'],
  ['KMBc', '0xb200000000000000000000a8f1c97d05a15e89e2', '2026-11-16'],
  ['EVERc', '0xb200000000000000000000ad4ca95ce451578243', '2026-11-16'],
  ['OWLc', '0xb200000000000000000000b1e11478cdd89ef7b2', '2026-11-16'],
  ['DECKc', '0xb200000000000000000000b85fff48d4a26c3145', '2026-11-16'],
  ['ETSYc', '0xb200000000000000000000ba75b2046aad1c0a13', '2026-11-16'],
  ['PGc', '0xb200000000000000000000c25611c4bda138d298', '2026-11-16'],
  ['UALc', '0xb200000000000000000000cdbf3e786ff34dbe51', '2026-11-16'],
];
const N = GO.length;
const GO_ADR = new Set(GO.map(([, a]) => a));
const FEE_LEAK = /a6cf99|0xa6cf|f0f5d4|0x37eb|128580a/i;
const ADDRESS = /0x[0-9a-fA-F]{40}/g;
const noDigitOutsideAddresses = (t) => !/[0-9]/.test(String(t).replace(ADDRESS, ''));

/* ───────────────────────── A. the list ───────────────────────── */
console.log('A. paires.js lists the ' + N + ', with on-chain decimals');
const P = await import('./paires.js');
const LIST = Array.isArray(P.DISPLAY_ONLY_STOCKS) ? P.DISPLAY_ONLY_STOCKS : null;
check(!!LIST, 'A1 paires.js exports DISPLAY_ONLY_STOCKS');
const list = LIST || [];
check(N === 29 && list.length === N, 'A2 exactly ' + N + ' display-only stocks (HOODc removed 2026-11-16: it has a pool now, measured in /api/trending)', list.length);
check(GO.every(([s, a, b]) => list.some((x) => x.adr === a && x.symbol === s && x.batch === b)) && list.every((x) => GO_ADR.has(x.adr)),
  'A3 each address (lowercase) carries the symbol and batch of the GO, and nothing else is listed', JSON.stringify(list.map((x) => [x.symbol, x.adr])));
check(list.every((x) => Number.isInteger(x.decimals) && x.decimals >= 0 && x.decimals <= 36), 'A4 every entry has integer decimals');
check(list.every((x) => typeof x.name === 'string' && x.name.length > 2), 'A5 every entry has the issuer\'s name');
check(Object.isFrozen(list) && list.every((x) => Object.isFrozen(x)), 'A6 the list and its entries are frozen');

/* A7 base.json: Grok Bot's Coinbase watch file (address -> symbol). It lives outside the repo; when it is on this machine the
 *    30 must match it exactly. Elsewhere (the PC), this one check is reported as not measured, never as passed. */
const BASE_JSON = process.env.TB_VEILLE_BASE_JSON || '/workspace/canal/veille-actions/base.json';
if (existsSync(BASE_JSON)) {
  let base = null;
  try { base = JSON.parse(readFileSync(BASE_JSON, 'utf8').replace(/^\uFEFF/, '')); } catch (_) { base = null; }
  check(!!base && typeof base === 'object', 'A7a base.json parsed (' + BASE_JSON + ')');
  const baseLow = new Map(Object.entries(base || {}).map(([a, s]) => [low(a), String(s)]));
  check(GO.every(([s, a]) => baseLow.get(a) === s), 'A7b the ' + N + ' addresses are in base.json with exactly the same symbols',
    GO.filter(([s, a]) => baseLow.get(a) !== s).map(([s, a]) => s + ' ' + a + ' -> ' + baseLow.get(a)).join('; '));
  check(list.every((x) => baseLow.get(x.adr) === x.symbol), 'A7c every display-only entry matches base.json');
} else { skipped += 1; console.log('  --  A7 base.json not on this machine (' + BASE_JSON + '): NOT MEASURED here'); }

/* A8 decimals and symbol READ ON CHAIN now, read-only (eth_call), through public Base nodes. No node answering = not measured. */
const NODES = ['https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://base.llamarpc.com'];
async function call(node, to, data) {
  const r = await fetch(node, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }), signal: AbortSignal.timeout(15000) });
  const j = await r.json();
  if (!j || typeof j.result !== 'string' || !/^0x[0-9a-fA-F]+$/.test(j.result)) throw new Error('no result: ' + JSON.stringify(j).slice(0, 120));
  return j.result;
}
/* 30 stocks = 60 reads: public nodes rate-limit (mainnet.base.org: 25 a second). Wait and retry, then try the other nodes. */
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function callPatient(first, to, data) {
  let last = null;
  for (const n of [first, ...NODES.filter((x) => x !== first)]) {
    for (let i = 0; i < 4; i += 1) {
      try { return await call(n, to, data); } catch (e) { last = e; await pause(300 * (i + 1)); }
    }
  }
  throw last;
}
const abiString = (hex) => {
  const b = Buffer.from(hex.slice(2), 'hex'); const off = Number(BigInt('0x' + b.subarray(0, 32).toString('hex')));
  const n = Number(BigInt('0x' + b.subarray(off, off + 32).toString('hex'))); return b.subarray(off + 32, off + 32 + n).toString('utf8');
};
if (process.env.TB_OFFLINE === '1') { skipped += 1; console.log('  --  A8 TB_OFFLINE=1: on-chain decimals NOT MEASURED here'); }
else {
  let node = null;
  for (const n of NODES) { try { await call(n, GO[0][1], '0x313ce567'); node = n; break; } catch (_) { /* next node */ } }
  if (!node) { skipped += 1; console.log('  --  A8 no public Base node answered: on-chain decimals NOT MEASURED here'); }
  else {
    const seen = [];
    for (const x of list) {
      try {
        const d = Number(BigInt(await callPatient(node, x.adr, '0x313ce567')));
        const s = abiString(await callPatient(node, x.adr, '0x95d89b41'));
        seen.push(x.symbol + ' decimals ' + d + ' symbol ' + s + (d === x.decimals && s === x.symbol ? '' : '  <-- MISMATCH'));
      } catch (e) { seen.push(x.symbol + ' not read: ' + String(e && e.message || e).slice(0, 80) + '  <-- MISMATCH'); }
    }
    console.log('      read on ' + node + ':\n        ' + seen.join('\n        '));
    check(list.length === N && seen.every((l) => !/MISMATCH/.test(l)), 'A8 decimals() and symbol() read on chain match every entry');
  }
}

/* ───────────────────────── B. not pairable, not tradable ───────────────────────── */
console.log('B. none is pairable or tradable');
check(typeof P.isDisplayOnlyStock === 'function', 'B0 paires.js exports isDisplayOnlyStock');
const isDO = typeof P.isDisplayOnlyStock === 'function' ? P.isDisplayOnlyStock : () => false;
check(GO.every(([, a]) => isDO(a) && isDO(a.toUpperCase().replace('0X', '0x'))) && !isDO(P.ACTIONS_COINBASE[0].adr) && !isDO('') && !isDO(null),
  'B1 isDisplayOnlyStock: true for the 30 in any case, false for a registry stock and for nothing');
check(list.every((x) => x.pairable === false && x.tradable === false), 'B2 every entry says pairable: false and tradable: false');
const inList = (arr) => (arr || []).filter((v) => GO_ADR.has(low(typeof v === 'string' ? v : v && (v.adr || v.adresse))));
check(inList(P.ACTIONS_COINBASE).length === 0, 'B3 none in the stock registry ACTIONS_COINBASE');
check(inList(P.DEVISES_BASE).length === 0, 'B4 none in the base currencies');
check(inList(P.pairesProposees(8453)).length === 0, 'B5 none proposed as a pair on Base');
const flags = [{}, { v9: true }, { h7030: true }, { v9: true, h7030: true }];
check(flags.every((f) => inList(P.pairesLancables(8453, f)).length === 0), 'B6 none launchable as a pair, whatever the hook flags');
check(inList(P.DEVISES_ADMISES_V8).length === 0 && inList(P.DEVISES_ADMISES_V9).length === 0 && inList(P.DEVISES_ADMISES_7030).length === 0,
  'B7 none in the V8, V9 or 7030 launch-hook lists');
const H = await import('./hook-7030-descripteur.js');
check(inList(H.DEVISES_7030).length === 0 && inList((H.DESCRIPTEUR_7030 && H.DESCRIPTEUR_7030.devises) || []).length === 0,
  'B8 none in the hook 7030 descriptor (the fixed 62)');
check(GO.every(([, a]) => flags.every((f) => P.hookDeLancementPour(a, 8453, f) === null)), 'B9 hookDeLancementPour answers null for each, every flag');
const q = GO.map(([, a]) => P.qualifierPaire(a, 8453));
check(q.every((r) => r && r.etat === 'REFUSE' && typeof r.pourquoi === 'string' && /no pool|not pairable|can.t be paired/i.test(r.pourquoi)),
  'B10 a pasted address is REFUSED as a pair, and the reason says why', JSON.stringify(q[0]));
const S = await import('./pool-sans-hook.js');
check(GO.every(([, a]) => S.estDeviseConnue(a) === false), 'B11 none is a known currency of the trade sheet (estDeviseConnue)');
const T = await import('./pools-actions-aerodrome.js');
check(GO.every(([, a]) => !T.POOLS_ACTIONS_AERODROME.has(a)), 'B12 none in the measured Aerodrome stock table (no Buy)');
const B = await import('./blockskins.js');
const skinSyms = new Set(B.SKIN_ACTIONS_CANDIDATES || []);
check(GO.every(([s]) => !skinSyms.has(s)), 'B13 none is a skins currency');
/* actions-chaine.js is a server module, not served: in a snapshot of the served files it is absent, so B14 is not measured there. */
if (existsSync(new URL('./actions-chaine.js', import.meta.url))) {
  const C = await import('./actions-chaine.js');
  check(C.routePourLigne({ v: null }).achetable === false, 'B14 a stock line with no route verdict has no Buy (fail-closed)');
} else { skipped += 1; console.log('  --  B14 actions-chaine.js (server module) not here: NOT MEASURED'); }

/* ───────────────────────── C. not read, never a number ───────────────────────── */
console.log('C. NAV / supply / redeem: « not read »');
check(typeof P.displayOnlyStockFacts === 'function', 'C0 paires.js exports displayOnlyStockFacts');
const facts = typeof P.displayOnlyStockFacts === 'function' ? list.map((x) => P.displayOnlyStockFacts(x)) : [];
check(facts.length === N && facts.every((f) => f && f.nav === 'not read' && f.supply === 'not read' && f.redeem === 'not read'),
  'C1 NAV, supply and redeem status are « not read » for each', JSON.stringify(facts[0]));
check(list.every((x) => !('nav' in x) && !('supply' in x) && !('redeemPaused' in x)), 'C2 no entry stores a NAV, a supply or a redeem flag');
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const short = (a) => String(a).slice(0, 6) + '…' + String(a).slice(-4);
check(typeof P.displayOnlyStocksHtml === 'function' && typeof P.displayOnlyPairOptionsHtml === 'function',
  'C3 paires.js exports displayOnlyStocksHtml and displayOnlyPairOptionsHtml');
const card = typeof P.displayOnlyStocksHtml === 'function' ? P.displayOnlyStocksHtml({ escape: esc, short }) : '';
const opts = typeof P.displayOnlyPairOptionsHtml === 'function' ? P.displayOnlyPairOptionsHtml({ escape: esc }) : '';
check(GO.every(([s]) => card.includes('>' + s + '<')) && (card.match(/not read/g) || []).length === 3 * N,
  'C4 the card shows the ' + N + ' symbols and « not read » 3 times each (' + 3 * N + ')', (card.match(/not read/g) || []).length);
const visibleCard = card.replace(/<[^>]*>/g, ' ');
/* the issuer's own name can hold a digit (FOURc = « Shift4 Payments, Inc. »): names are taken out before looking for a number */
const withoutNames = list.reduce((t, x) => t.split(esc(x.name)).join(' '), visibleCard);
check(noDigitOutsideAddresses(withoutNames.replace(/0x[0-9a-fA-F]{4}…[0-9a-fA-F]{4}/g, '')), 'C5 the card shows no number (outside the shortened addresses and the issuer names)', withoutNames);
check(!/<button|<a\b|class="bouton|>\s*(Buy|Sell)\s*</i.test(card), 'C6 the card has no button or link (no Buy / Sell)');
const optionTags = opts.match(/<option\b[^>]*>/g) || [];
check(optionTags.length === N && optionTags.every((o) => /\sdisabled\b/.test(o)), 'C7 Create: ' + N + ' options, every one disabled', opts.slice(0, 300));
check(/<optgroup\b[^>]*label="[^"]*no pool/i.test(opts) && GO.every(([s, a]) => opts.includes('value="' + a + '"') && opts.includes(s)),
  'C8 Create: one group labelled « no pool », each address as the option value');
check(noDigitOutsideAddresses(opts.replace(/<[^>]*>/g, ' ')), 'C9 Create options show no number');
check(!FEE_LEAK.test(card) && !FEE_LEAK.test(opts), 'C10 no fee address in the card or the options');

/* ───────────────────────── D. app.html wiring (LF or CRLF) ───────────────────────── */
console.log('D. app.html');
const app = read('app.html').replace(/\r\n/g, '\n');
const imp = (app.match(/import\s*\{[^}]*\}\s*from\s*'\.\/paires\.js';/) || [''])[0];
check(!!imp, 'D0 the paires.js import of app.html was found');
check(/\bdisplayOnlyStocksHtml\b/.test(imp) && /\bdisplayOnlyPairOptionsHtml\b/.test(imp) && /\bisDisplayOnlyStock\b/.test(imp),
  'D1 app.html imports displayOnlyStocksHtml, displayOnlyPairOptionsHtml and isDisplayOnlyStock from paires.js', imp);
const trade = (app.match(/<section class="volet" id="v-trade"[\s\S]*?<\/section>/) || [''])[0];
check(!!trade, 'D2 the Market section (#v-trade) was found');
check(/id="stocksNoPool"/.test(trade) && /id="stocksNoPoolListe"/.test(trade), 'D3 the Market tab holds the « listed, no pool yet » card');
const body = (name) => { const i = app.indexOf('function ' + name + '('); if (i < 0) return ''; const m = /\r?\nfunction /.exec(app.slice(i + 10)); return app.slice(i, m ? i + 10 + m.index : i + 8000); };
const paint = body('peindrePaires');
check(!!paint, 'D4 peindrePaires was found');
check(/displayOnlyPairOptionsHtml\(/.test(paint), 'D5 peindrePaires appends the disabled display-only options');
check(/blocksDecouverts\(\)/.test(paint), 'D6 peindrePaires builds the « Live blocks » group from blocksDecouverts()');
check(/blocksDecouverts\(\)\.filter\(\(b\) => !isDisplayOnlyStock\(b && b\.adr\)\)/.test(paint), 'D7 the « Live blocks » pair group skips the display-only stocks');
check(/displayOnlyStocksHtml\(\s*\{[^}]*short:\s*displayShort/.test(app), 'D8 the card is painted with displayShort (the fee-masking shortener)');

const declMatch = /\r?\nlet CHAINE = /.exec(app); const decl = declMatch ? declMatch.index : -1;
const calls = [...app.matchAll(/\n\s*try \{ peindreActionsSansPool\(\); \}/g)].map((m) => m.index);
check(decl > 0, 'D9a the declaration of CHAINE was found');
check(calls.length >= 1 && calls.every((i) => i > decl), 'D9b the card is painted only after CHAINE is declared (no temporal dead zone)', calls.join(',') + ' vs ' + decl);
console.log('\n' + ok + ' ok, ' + ko + ' KO' + (skipped ? ', ' + skipped + ' not measured here' : ''));
process.exit(ko ? 1 : 0);
