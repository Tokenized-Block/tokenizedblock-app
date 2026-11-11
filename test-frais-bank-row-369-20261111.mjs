/* test-frais-bank-row-369-20261111.mjs — the public "Fees & risks" page lists the Bank (borrow / lend on Morpho), from ONE browser-safe source.
 *
 * Why: the page says it lists "every fee and every risk", the Bank is live (/api/banque/marches) and charges 0.1% to borrow and 0.1% on top
 *   of a loan, and the page had no Bank row and no Bank risk. banque-morpho.js is server-only (not served, imports FEE_WALLET), so the
 *   rates move to banque-frais.js (no imports, no address), re-exported by banque-morpho.js: one copy, two readers.
 *
 * A  EXECUTED  banque-frais.js imports nothing and carries no 0x address; banque-morpho.js re-exports the SAME values (no drift).
 * B  EXECUTED  frais-risques.js CHIFFRES.banque = those values; the real render has a "Bank" row ("0.1% to borrow · 0.1% to lend"), says the
 *              exit is free, and a risk item about liquidation with the 70% margin and the separate-positions sentence.
 * C  EXECUTED  the render with FAKE rates (0.37%, 0.41%, 0.05% exit, 65% margin) says those, and not the real ones: nothing typed.
 * D  EXECUTED  the render never prints the fee-wallet address.
 * E  SOURCE    serveur-web.js serves banque-frais.js (SERVIS) and still does not serve banque-morpho.js.
 * M  MUTANT    a copy of frais-risques.js whose Bank cell types '0.1%' -> C red.
 * Counts itself and prints n/n. */
import { readFileSync, writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const lire = (f) => readFileSync(join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
let n = 0, rouges = 0;
const vu = (cond, label) => { n += 1; if (cond === true) console.log('  ok   ' + label); else { rouges += 1; console.log('  FAIL ' + label); } };
const essayer = async (f) => { try { return await f(); } catch (e) { return { erreur: String((e && e.message) || e) }; } };

const BF = await essayer(() => import('./banque-frais.js'));
const BM = await import('./banque-morpho.js');
const { FEE_WALLET } = await import('./frais-creation.js');
const FR = await import('./frais-risques.js');

/* A */
let srcBF = '';
try { srcBF = lire('banque-frais.js'); } catch (_) { srcBF = ''; }
vu(!!srcBF && !/^\s*import /m.test(srcBF) && !/0x[0-9a-fA-F]{40}/.test(srcBF), 'A banque-frais.js exists, imports nothing and carries no address');
vu(!BF.erreur && BF.FRAIS_EMPRUNT_BPS === 10n && BF.FRAIS_PRET_BPS === BF.FRAIS_EMPRUNT_BPS && BF.FRAIS_SORTIE_BPS === 0n && BF.MARGE_EMPRUNT_BPS === 7000n
  && typeof BF.PHRASE_PANIER_SEPARE === 'string' && /its own Morpho position/.test(BF.PHRASE_PANIER_SEPARE),
  'A banque-frais.js: borrow 10 bps, lend = borrow, exit 0, margin 7000 bps, the separate-positions sentence');
vu(!BF.erreur && BM.FRAIS_EMPRUNT_BPS === BF.FRAIS_EMPRUNT_BPS && BM.FRAIS_PRET_BPS === BF.FRAIS_PRET_BPS && BM.MARGE_EMPRUNT_BPS === BF.MARGE_EMPRUNT_BPS
  && BM.PHRASE_PANIER_SEPARE === BF.PHRASE_PANIER_SEPARE && /from '\.\/banque-frais\.js'/.test(lire('banque-morpho.js'))
  && !/^export const (FRAIS_EMPRUNT_BPS|MARGE_EMPRUNT_BPS|PHRASE_PANIER_SEPARE) = /m.test(lire('banque-morpho.js')),
  'A banque-morpho.js re-exports the same values from banque-frais.js (no second definition)');

/* B */
const C = FR.CHIFFRES;
vu(!!C.banque && C.banque.empruntBps === BM.FRAIS_EMPRUNT_BPS && C.banque.pretBps === BM.FRAIS_PRET_BPS && C.banque.sortieBps === 0n && C.banque.margeBps === BM.MARGE_EMPRUNT_BPS,
  'B CHIFFRES.banque = the rates the Bank plans charge (banque-morpho.js)');
const vrai = FR.rendre(C, null);
const bloc = (html) => { const i = html.indexOf('<th scope="row">Bank'); return i >= 0 ? html.slice(i, html.indexOf('</tr>', i)) : ''; };
const clauseB = (html) => {
  const b = bloc(html);
  return b.includes(FR.pctBps(BM.FRAIS_EMPRUNT_BPS) + ' to borrow · ' + FR.pctBps(BM.FRAIS_PRET_BPS) + ' to lend') && /Morpho/.test(b) && /no app fee/.test(b)
    && /<b>Bank: you can be liquidated\.<\/b>/.test(html) && html.includes(BM.PHRASE_PANIER_SEPARE) && html.includes(FR.pctBps(BM.MARGE_EMPRUNT_BPS) + ' of what Morpho allows');
};
vu(clauseB(vrai), 'B real render: a Bank row "0.1% to borrow · 0.1% to lend", exits free, and a liquidation risk with the 70% margin');

/* C */
const clauseC = (rendre, base) => {
  const faux = structuredClone(base);
  if (!faux.banque) return false;
  faux.banque.empruntBps = 37n; faux.banque.pretBps = 41n; faux.banque.sortieBps = 5n; faux.banque.margeBps = 6500n;
  const r = rendre(faux, null), b = bloc(r);
  return b.includes('0.37% to borrow · 0.41% to lend') && b.includes('0.05%') && !/no app fee/.test(b) && r.includes('65% of what Morpho allows')
    && !b.includes('0.1%') && !r.includes('70% of what Morpho allows');
};
vu(clauseC(FR.rendre, C), 'C fake rates render as 0.37% / 0.41% / 0.05% exit / 65% margin, and the real ones are gone: nothing typed');

/* D */
vu(!vrai.toLowerCase().includes(String(FEE_WALLET).toLowerCase()) && !bloc(vrai).match(/0x[0-9a-fA-F]{40}/), 'D the page never prints the fee-wallet address');

/* E */
const srv = lire('serveur-web.js');
const sb = srv.match(/const SERVIS\s*=\s*\[([\s\S]*?)\];/);
const servis = new Set(sb ? [...sb[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : []);
vu(servis.has('banque-frais.js') && !servis.has('banque-morpho.js'), 'E banque-frais.js is served; banque-morpho.js stays server-only');

/* M — a typed rate in a copy of frais-risques.js */
const SRC = lire('frais-risques.js');
const ancre = "pctBps(bq.empruntBps) + ' to borrow · '";
let vivant = false, tue = false;
if (SRC.includes(ancre)) {
  const dir = mkdtempSync(join(tmpdir(), 'fb369-'));
  const p = join(dir, 'frais-risques-mutant.mjs');
  const abs = SRC.replace(ancre, "'0.1% to borrow · '").replace(/from '\.\/([a-z0-9-]+\.js)'/g, (_, f) => "from '" + pathToFileURL(join(ICI, f)).href + "'");
  writeFileSync(p, abs);
  try {
    const M = await import(pathToFileURL(p).href);
    vivant = clauseB(M.rendre(M.CHIFFRES, null));
    tue = clauseC(M.rendre, M.CHIFFRES) === false;
  } catch (_) { tue = false; }
  try { unlinkSync(p); } catch (_) { /* temp */ }
}
vu(vivant && tue, 'M mutant: a typed 0.1% in the Bank cell (module loads, passes B) -> C red');

console.log((n - rouges) + '/' + n + (rouges ? ' — RED' : ' — green'));
process.exit(rouges ? 1 : 0);
