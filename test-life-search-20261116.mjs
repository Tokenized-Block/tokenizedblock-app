// test-life-search-20261116.mjs — property tests of the Life page's smart search, on inputs I did not pick:
// the REAL blocks of the live season (/api/life/live) plus the app's real block list (/api/trending).
// Properties (each must hold for EVERY real block):
//   P1 its exact symbol ranks it first;
//   P2 its symbol in any case, with accents or spaces added, still ranks it first;
//   P3 its full address ranks it first;
//   P4 one letter deleted from a symbol of 5+ letters still finds it in the top 3;
//   P5 a string made only of letters absent from every symbol and name finds nothing (negative witness).
// Bound: this proves the matcher on today's real names; it does not prove the ranking is the one a person expects.
import { readFileSync } from 'node:fs';
const B = process.env.TB || 'https://tokenizedblock.space', H = { 'x-ms-monitor': '1' };
const page = readFileSync(new URL('./life-block/index.html', import.meta.url), 'utf8');
const code = page.slice(page.indexOf('const norm ='), page.indexOf('function findBlock('));
if (!code.includes('function smartFind')) throw new Error('smartFind not found in the page');
const { smartFind } = new Function(code + ';return { smartFind };')();

const live = await (await fetch(B + '/api/life/live', { headers: H })).json();
const trend = await (await fetch(B + '/api/trending', { headers: H })).json();
const blocks = (live.world?.blocks || []).map((b) => ({ adr: String(b.adr).toLowerCase(), sym: b.sym, nom: b.nom || '', action: !!b.action }));
const extra = (trend.lignes || []).filter((x) => /^0x[0-9a-fA-F]{40}$/.test(x.adr || '')).map((x) => ({ adr: x.adr.toLowerCase(), sym: x.sym || '?', nom: x.nom || '', action: !!x.emetteur }));
const all = [...blocks, ...extra.filter((x) => !blocks.some((b) => b.adr === x.adr))];
if (blocks.length < 10) throw new Error('too few live blocks read (' + blocks.length + '): the API shape changed?');

let ok = 0, ko = 0; const fails = [];
const check = (name, cond, detail) => { if (cond) ok++; else { ko++; if (fails.length < 15) fails.push(name + ' — ' + detail); } };
const first = (q) => smartFind(all, q, 3);
const sameSym = (a, b) => a.sym.toLowerCase() === b.sym.toLowerCase();
for (const b of all) {
  if (!b.sym || b.sym === '?') continue;
  const dup = all.filter((x) => sameSym(x, b)).length > 1; /* two blocks may share a symbol: then either is a right answer */
  const r1 = first(b.sym)[0]; check('P1 ' + b.sym, r1 && (r1.adr === b.adr || (dup && sameSym(r1, b))), 'got ' + (r1 && r1.sym));
  const v = b.sym.toUpperCase().split('').join(' ').replace(/A/g, 'Á');
  const r2 = first(v)[0]; check('P2 ' + b.sym, r2 && sameSym(r2, b), JSON.stringify(v) + ' got ' + (r2 && r2.sym));
  const r3 = first(b.adr)[0]; check('P3 ' + b.sym, r3 && r3.adr === b.adr, 'got ' + (r3 && r3.sym));
  /* P4 only on symbols of 5+ letters: cutting a letter from a 4-letter one ("NOc" from NVOc, "CBTC" from CBBTC) gives a
     string that truly matches other blocks (NOCAT by prefix, BTC by one letter): no single right answer there */
  if (/^[a-z0-9]{5,}$/i.test(b.sym)) { const cut = b.sym.slice(0, 1) + b.sym.slice(2); const r4 = first(cut); check('P4 ' + b.sym, r4.some((x) => sameSym(x, b)), JSON.stringify(cut) + ' got ' + r4.map((x) => x.sym).join(',')); }
}
/* P5: real names use every letter, so the witness is a fixed nonsense word (asserted absent from every name first) */
for (const w of ['qxzjvkwq', 'zzqqxxjj', 'wqvzkxjq']) {
  if (all.some((b) => (b.sym + ' ' + b.nom).toLowerCase().includes(w))) { console.log('P5 witness ' + w + ' exists in a real name: skipped'); continue; }
  const r = smartFind(all, w, 3); check('P5 negative ' + w, r.length === 0, 'found ' + r.map((x) => x.sym).join(','));
}
console.log(all.length + ' real blocks (' + blocks.length + ' in the season)');
for (const f of fails) console.log('  KO ' + f);
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
