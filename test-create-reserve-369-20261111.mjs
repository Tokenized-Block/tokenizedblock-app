/* test-create-reserve-369-20261111.mjs — Create step 1 (buy the TBLOCK part) keeps EXACTLY what the birth preflight will ask, not a
 *   third, larger reserve.
 *
 * Why: step 1 cancelled any birth below a fixed 0.0023 ETH (create-vault-tip.js BIRTH_ETH_RESERVE_WEI), while the real birth preflight
 *   asks fee + seed + GAZ_NAISSANCE_WEI (0.001979 ETH on the ETH pair today, 0.0015 on a 7030 non-ETH pair). The live-audit wallet
 *   (0.002033 ETH) was still refused although its birth was payable.
 *
 * A  EXECUTED  TIP.stepOneFits: the live-audit wallet (0.002033 ETH, buy 0.001403) on the ETH pair -> 'SKIP' (birth goes on).
 * B  EXECUTED  USDC pair (seed 0n): 0.0016 ETH -> 'SKIP'.
 * C  EXECUTED  0.0009 ETH on the ETH pair -> 'STOP'; enough for buy + birth -> 'BUY'; a non-BigInt input -> null.
 * D  SOURCE    BIRTH_ETH_RESERVE_WEI is gone (module and app.html); step 1 branches on TIP.stepOneFits with the need from
 *              besoinEthNaissance(opts), before the ETH buy is sent; creerBlock passes the effective fee and the seed rule.
 * E  EXECUTED  PARITY: besoinEthNaissance (step 1) and preflightInstantBirthEthFixe (the birth gate), both run from app.html's own
 *              source in a sandbox, ask the SAME total over a grid of fee / seed inputs (null, 0n, negative, a quote; fee null or floor).
 * M  MUTANT    a copy of create-vault-tip.js whose SKIP threshold is the old 2300000000000000n -> A red.
 * Counts itself and prints n/n. */
import { readFileSync, writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const ICI = dirname(fileURLToPath(import.meta.url));
const lire = (f) => readFileSync(join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
let n = 0, rouges = 0;
const vu = (cond, label) => { n += 1; if (cond === true) console.log('  ok   ' + label); else { rouges += 1; console.log('  FAIL ' + label); } };

const APP = lire('app.html');
const FC = await import('./frais-creation.js');
const TIP = await import('./create-vault-tip.js');
const mG = APP.match(/^const GAZ_NAISSANCE_WEI = (\d+)n;/m);
const GAZ = mG ? BigInt(mG[1]) : null;
const FEE = FC.FRAIS_OUVERTURE_WEI;
const SEED_LIVE = 478581486057324n; /* creator minimum in ETH read on /api/naissance/plan, 2026-11-11 (see the item's evidence) */
const besoinEth = FC.besoinNaissance({ fraisWei: FEE, seedWei: SEED_LIVE, gazWei: GAZ }).total;
const besoinUsdc = FC.besoinNaissance({ fraisWei: FEE, seedWei: 0n, gazWei: GAZ }).total;

const clauseA = (fits) => { try { return fits({ ethBal: 2033000000000000n, buyWei: 1403000000000000n, birthNeedWei: besoinEth }) === 'SKIP'; } catch (_) { return false; } };
const f = TIP.stepOneFits;
vu(GAZ === 500000000000000n && FEE === 1000000000000000n && besoinEth === 1978581486057324n && besoinUsdc === 1500000000000000n,
  'A witness: the preflight needs ' + besoinEth + ' wei on the ETH pair and ' + besoinUsdc + ' on a non-ETH pair (fee + seed + GAZ_NAISSANCE_WEI)');
vu(typeof f === 'function' && clauseA(f), "A the live-audit wallet (0.002033 ETH, buy 0.001403) on the ETH pair -> 'SKIP': the birth goes on");
vu(typeof f === 'function' && f({ ethBal: 1600000000000000n, buyWei: 1403000000000000n, birthNeedWei: besoinUsdc }) === 'SKIP', "B USDC pair, 0.0016 ETH -> 'SKIP'");
vu(typeof f === 'function' && f({ ethBal: 900000000000000n, buyWei: 1403000000000000n, birthNeedWei: besoinEth }) === 'STOP'
  && f({ ethBal: besoinEth + 1403000000000000n, buyWei: 1403000000000000n, birthNeedWei: besoinEth }) === 'BUY'
  && f({ ethBal: besoinEth + 1403000000000000n - 1n, buyWei: 1403000000000000n, birthNeedWei: besoinEth }) === 'SKIP'
  && f({ ethBal: besoinEth, buyWei: 1n, birthNeedWei: null }) === null && f({ ethBal: 1, buyWei: 1n, birthNeedWei: 1n }) === null,
  "C 0.0009 ETH -> 'STOP'; exactly buy + birth -> 'BUY', one wei less -> 'SKIP'; a non-BigInt input -> null");

/* D */
vu(!('BIRTH_ETH_RESERVE_WEI' in TIP) && !/BIRTH_ETH_RESERVE_WEI/.test(APP), 'D BIRTH_ETH_RESERVE_WEI is gone from create-vault-tip.js and app.html');
const e1 = APP.slice(APP.indexOf('async function etape1AchatTblock('), APP.indexOf('function texteEtape1Arretee('));
const iFits = e1.indexOf('TIP.stepOneFits({ ethBal, buyWei: wei, birthNeedWei:');
vu(iFits > 0 && /await besoinEthNaissance\(opts\)/.test(e1) && e1.indexOf('await besoinEthNaissance(opts)') < iFits && iFits < e1.indexOf('envoyerAppels(pl.appels'),
  'D step 1 asks besoinEthNaissance(opts) then TIP.stepOneFits, before the ETH buy is sent');
vu(/async function etape1AchatTblock\(e, opts = \{\}\) \{/.test(APP) && /async function acheterTblockAvantNaissance\(e, opts = \{\}\) \{/.test(APP)
  && /if \(!\(await acheterTblockAvantNaissance\(e, \{ fraisWei: fraisReplieAuPlancher, seedWei: paireSansGraineEth\(paireChoisie\) \? 0n : null \}\)\)\) return;/.test(APP),
  'D creerBlock passes the effective fee (fraisReplieAuPlancher) and the seed rule (paireSansGraineEth) to step 1');

/* F — review 2026-11-11: the caller's branch. An unread need (null) must SKIP (return true) with a sentence that says it was not read;
 *   only 'STOP' returns false. Source clause + a mutant (null treated as STOP) that must turn it red. */
const brancheEtape1 = (src) => { const i = src.indexOf('const choixEtape1 = TIP.stepOneFits('); const j = src.indexOf('let pl;', i); return i < 0 || j < 0 ? '' : src.slice(i, j); };
const clauseF = (b) => !!b && (b.match(/return false;/g) || []).length === 1
  && /if \(choixEtape1 === 'STOP'\) \{[^}]*return false;\s*\}/.test(b)
  && /choixEtape1 === null\s*\? 'Step 1 skipped: the ETH the birth needs was not read just now/.test(b)
  && /\s*return true;\s*\}\s*$/.test(b);
const b1 = brancheEtape1(e1);
vu(clauseF(b1), "F step 1: only 'STOP' returns false; an unread need (null) skips with a 'not read' sentence, never a comparison not made");
const b1m = b1.replace("if (choixEtape1 !== 'BUY') {", "if (choixEtape1 === null) { e.textContent = 'x'; return false; }\n  if (choixEtape1 !== 'BUY') {");
vu(b1m !== b1 && clauseF(b1m) === false, 'F mutant: an unread need treated as STOP -> F red');

/* E — parity, executed from app.html's own source */
function extraire(src, debut) {
  const i = src.indexOf(debut);
  if (i < 0) return null;
  const m = /\r?\n\}\r?\n/.exec(src.slice(i)); /* CRLF-safe (test-tests-portables.mjs) */
  return m ? src.slice(i, i + m.index + 2) : null;
}
const srcPorte = extraire(APP, 'async function preflightInstantBirthEthFixe(');
const srcAide = extraire(APP, 'async function besoinEthNaissance(');
async function jouer(src, appel, args, seedLu) {
  const e = { className: '', innerHTML: '', textContent: '' };
  const ctx = vm.createContext({
    GAZ_NAISSANCE_WEI: GAZ, FRAIS_OUVERTURE_WEI: FC.FRAIS_OUVERTURE_WEI, CREATE_FEE_WEI_FLOOR: FC.CREATE_FEE_WEI_FLOOR,
    besoinNaissance: FC.besoinNaissance, phraseManquePourNaitre: FC.phraseManquePourNaitre,
    ethLisible: (w) => String(w), enTexte: String, BigInt, $: () => null, montrerFundWalletCourt() {}, etape() {},
    preparerQuoteEthDefaut: async () => seedLu, lireSoldeEthAppRobuste: async () => 10n ** 30n,
  });
  vm.runInContext(src, ctx);
  ctx.__args = { e, ...args };
  return vm.runInContext(appel + '(__args)', ctx);
}
async function parite(aide) {
  let ok = !!srcPorte && !!aide, essais = 0;
  if (!ok) return { ok, essais };
  for (const fraisWei of [undefined, null, FC.CREATE_FEE_WEI_FLOOR]) {
    for (const seedWei of [undefined, null, 0n, -5n, SEED_LIVE]) {
      for (const seedLu of [null, SEED_LIVE, -1n]) {
        const args = { ...(fraisWei !== undefined ? { fraisWei } : {}), ...(seedWei !== undefined ? { seedWei } : {}) };
        try {
          const p = await jouer(srcPorte, 'preflightInstantBirthEthFixe', args, seedLu);
          const h = await jouer(aide, 'besoinEthNaissance', args, seedLu);
          essais += 1;
          if (!(p && p.ok === true && h && typeof h.total === 'bigint' && h.total === p.besoin)) ok = false;
        } catch (_) { ok = false; }
      }
    }
  }
  return { ok, essais };
}
const pr = await parite(srcAide);
vu(pr.ok && pr.essais === 45, 'E parity: step 1 (besoinEthNaissance) and the birth gate (preflight) ask the same total in ' + pr.essais + '/45 cases');
const aideMut = srcAide ? srcAide.replace('else if (seed < 0n) seed = CREATE_FEE_WEI_FLOOR;', 'else if (seed < 0n) seed = 0n;') : null;
const prm = aideMut && aideMut !== srcAide ? await parite(aideMut) : { ok: true, essais: 0 };
vu(prm.essais === 45 && prm.ok === false, 'E mutant: the helper reads a negative seed as 0n (the preflight does not) -> parity red');

/* M — mutant: the old 0.0023 threshold back in a copy of the module */
const SRC = lire('create-vault-tip.js');
const ancre = "if (ethBal >= birthNeedWei) return 'SKIP';";
let vivant = false, tue = false;
if (SRC.includes(ancre)) {
  const dir = mkdtempSync(join(tmpdir(), 'cr369-'));
  const p = join(dir, 'create-vault-tip-mutant.mjs');
  writeFileSync(p, SRC.replace(ancre, "if (ethBal >= 2300000000000000n) return 'SKIP';").replace("from './economie.js'", "from '" + pathToFileURL(join(ICI, 'economie.js')).href + "'")
    .replace("from './economie-pack.js'", "from '" + pathToFileURL(join(ICI, 'economie-pack.js')).href + "'")); /* task 377: second import */
  try {
    const M = await import(pathToFileURL(p).href);
    vivant = typeof M.stepOneFits === 'function' && M.stepOneFits({ ethBal: 10n ** 18n, buyWei: 1n, birthNeedWei: 1n }) === 'BUY';
    tue = clauseA(M.stepOneFits) === false;
  } catch (_) { tue = false; }
  try { unlinkSync(p); } catch (_) { /* temp */ }
}
vu(vivant && tue, 'M mutant: the old 0.0023 ETH threshold (module loads) -> A red');

console.log((n - rouges) + '/' + n + (rouges ? ' — RED' : ' — green'));
process.exit(rouges ? 1 : 0);
