/* test-skins-v1-coupure-370-20261111.mjs — POST /api/skins/achat no longer records a NEW v1 skin payment (plain USDC transfer + memo).
 *
 * Why: since BlockSkins v2 is deployed, a skin is a token minted by the contract. A plain transfer + memo to the fee wallet made after
 *   that buys no token: the payer only got a line in a server index. Phil's default: refuse v1 payments made AT OR AFTER the v2
 *   deployment block (read from blockskins-deploiement.js, never typed), with a clear reason; keep recognising older ones.
 *
 * A  EXECUTED  skins.js coupureSkinsV1() returns the v2 blocDeploiement of the record (walked by this test, not typed here).
 * B  EXECUTED  jugerBlocSkinV1(): block == cutoff -> REFUSE with "since block N" + "nothing was recorded"; cutoff - 1 -> ok;
 *              block unknown -> NON_LU; cutoff unknown -> REFUSE (fail closed).
 * C  EXECUTED  coupureSkinsV1() on synthetic records: v3 deployed above v2 still gives v2's block; no v2 -> null.
 * D  EXECUTED  the real enregistrerAchatSkin() source cut out of serveur-web.js, run with stubbed chain reads: a verified payment at
 *              the cutoff is refused and NOT stored; one block earlier it is stored.
 * E  SOURCE    serveur-web.js and skins.js do not type the cutoff number.
 * F  MUTANTS   >= turned into >; the judge call removed from the server; the cutoff typed. Each must turn a clause red.
 * The test counts itself and prints n/n. */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const lire = (f) => readFileSync(join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
let n = 0, rouges = 0;
const vu = (cond, label) => { n += 1; if (cond === true) console.log('  ok   ' + label); else { rouges += 1; console.log('  FAIL ' + label); } };

const D = (await import('./blockskins-deploiement.js')).BLOCKSKINS_DEPLOIEMENT;
const chaine = [];
for (let x = D, i = 0; x && i < 16; x = x.precedent, i += 1) chaine.push(x);
const v2 = chaine.find((x) => x.version === 2);
const COUPURE = v2 ? v2.blocDeploiement : null;
vu(Number.isInteger(COUPURE) && COUPURE > 0 && /^0x[0-9a-f]{40}$/.test(String(v2.adresse)), 'record: BlockSkins v2 is deployed, at block ' + COUPURE);

const S = await import('./skins.js');

/* ── A ── */
const okA = (m) => typeof m.coupureSkinsV1 === 'function' && m.coupureSkinsV1() === COUPURE && m.COUPURE_SKINS_V1 === COUPURE;
vu(okA(S), 'A skins.js coupureSkinsV1() and COUPURE_SKINS_V1 = the v2 deployment block of the record (' + COUPURE + ')');

/* ── B ── */
const okB = (m) => {
  if (typeof m.jugerBlocSkinV1 !== 'function') return false;
  const a = m.jugerBlocSkinV1(COUPURE, COUPURE), b = m.jugerBlocSkinV1(COUPURE + 1000, COUPURE), c = m.jugerBlocSkinV1(COUPURE - 1, COUPURE);
  const d = m.jugerBlocSkinV1(null, COUPURE), e = m.jugerBlocSkinV1(COUPURE - 1, null);
  return a.ok === false && a.etat === 'REFUSE' && a.pourquoi.includes('since block ' + COUPURE) && a.pourquoi.includes('nothing was recorded')
    && a.pourquoi.includes('BlockSkins contract') && a.pourquoi.includes('a plain transfer is not a skin')
    && b.ok === false && b.etat === 'REFUSE' && c.ok === true && d.ok === false && d.etat === 'NON_LU' && e.ok === false && e.etat === 'REFUSE';
};
vu(okB(S), 'B jugerBlocSkinV1: at the cutoff and after -> REFUSE with the reason; one block before -> ok; unread block -> NON_LU; no cutoff -> REFUSE');
if (typeof S.jugerBlocSkinV1 === 'function') console.log('       reason: ' + S.jugerBlocSkinV1(COUPURE, COUPURE).pourquoi);

/* ── C ── synthetic records (fixture addresses, not real contracts) */
const okC = (m) => {
  if (typeof m.coupureSkinsV1 !== 'function') return false;
  const avecV3 = { ...D, adresse: '0x' + '5a'.repeat(20), blocDeploiement: COUPURE + 500000 };
  const sansV2 = { version: 3, adresse: '0x' + '5a'.repeat(20), blocDeploiement: 1, precedent: { version: 1, adresse: '0x' + '6b'.repeat(20), blocDeploiement: 2 } };
  return m.coupureSkinsV1(avecV3) === COUPURE && m.coupureSkinsV1(sansV2) === null && m.coupureSkinsV1(null) === null;
};
vu(okC(S), 'C a deployed v3 above v2 still gives the v2 block; a record without v2 gives null');

/* ── D ── the server function, executed */
const srv = lire('serveur-web.js');
const couperFn = (src) => {
  const i = src.indexOf('async function enregistrerAchatSkin('), jr = i < 0 ? -1 : src.slice(i).search(/\r?\nconst skinsDuBlock/), j = jr < 0 ? -1 : i + jr; /* EOL-proof (test-tests-portables) */
  return i >= 0 && j > i ? src.slice(i, j) : '';
};
const H = '0x' + 'ab'.repeat(32), B = '0x' + 'cd'.repeat(20), P = '0x' + 'ef'.repeat(20);
async function executer(fnSrc, juge, blocPaye) {
  if (!fnSrc) return null;
  const achats = new Map();
  const fabrique = new Function('validerRecette', 'skinsAchats', 'rpcActivite', 'verifierAchatSkin', 'USDC_BASE', 'FEE_WALLET', 'ecrireSkins',
    'jugerBlocSkinV1', 'COUPURE_SKINS_V1', 'let skinsEnVol = 0;\n' + fnSrc + '\nreturn enregistrerAchatSkin;');
  const f = fabrique(S.validerRecette, achats, async (m) => (m === 'eth_getTransactionReceipt' ? { status: '0x1' } : { hash: H }),
    () => ({ ok: true, payeur: P, signataire: P, bloc: blocPaye }), '0x' + '11'.repeat(20), '0x' + '22'.repeat(20), () => {},
    juge, COUPURE);
  const r = await f({ tx: H, block: B, skin: { id: 'gold' } });
  return { r, stocke: achats.has(H) };
}
const okD = async (src, juge) => {
  const fn = couperFn(src);
  const apres = await executer(fn, juge, COUPURE), avant = await executer(fn, juge, COUPURE - 1), inconnu = await executer(fn, juge, null);
  return !!apres && apres.r.ok === false && apres.r.etat === 'REFUSE' && String(apres.r.pourquoi).includes('since block ' + COUPURE) && apres.stocke === false
    && avant.r.ok === true && avant.r.etat === 'ENREGISTRE' && avant.stocke === true && avant.r.achat.bloc === COUPURE - 1
    && inconnu.r.ok === false && inconnu.r.etat === 'NON_LU' && inconnu.stocke === false;
};
const juge = typeof S.jugerBlocSkinV1 === 'function' ? S.jugerBlocSkinV1 : () => ({ ok: true });
vu(await okD(srv, juge), 'D enregistrerAchatSkin (cut from serveur-web.js, executed): paid at the cutoff -> REFUSE, not stored; one block before -> stored; block unread -> NON_LU');
vu(/^import \{ verifierAchatSkin, validerRecette, jugerBlocSkinV1, COUPURE_SKINS_V1 \} from '\.\/skins\.js';$/m.test(srv), 'D serveur-web.js imports jugerBlocSkinV1 and COUPURE_SKINS_V1 from skins.js');

/* ── E ── */
const pasTape = (t) => !t.includes(String(COUPURE));
const sk = lire('skins.js');
vu(pasTape(srv) && pasTape(sk), 'E the cutoff ' + COUPURE + ' is typed neither in serveur-web.js nor in skins.js');

/* ── F ── mutants */
let tues = 0, mutants = 0;
const tue = (rouge, label) => { mutants += 1; if (rouge) tues += 1; console.log('  ' + (rouge ? 'killed  ' : 'SURVIVED') + ' mutant: ' + label); };
let numMutant = 0;
async function avecMutant(remplacer, cb) {
  const m = sk.replace(remplacer[0], remplacer[1]);
  if (m === sk) return null;
  const p = join(ICI, '.mutant-skins-370-' + process.pid + '-' + (++numMutant) + '.js'); /* one file per mutant: the ESM cache keys on the path */
  writeFileSync(p, m);
  try { return await cb(await import(pathToFileURL(p).href)); } finally { unlinkSync(p); }
}
if (typeof S.jugerBlocSkinV1 === 'function') {
  const r1 = await avecMutant(['bloc >= coupure', 'bloc > coupure'], async (m) => !okB(m));
  tue(r1 === true, '>= turned into > in jugerBlocSkinV1');
  const r2 = await avecMutant(['x.version === 2', 'x.version === 1'], async (m) => !okA(m));
  tue(r2 === true, 'the cutoff taken from v1 instead of v2');
  const sansAppel = srv.replace(/\n\s*const jv = jugerBlocSkinV1\(v\.bloc, COUPURE_SKINS_V1\);\n\s*if \(!jv\.ok\) return \{ ok: false, etat: jv\.etat, pourquoi: jv\.pourquoi \};/, '');
  tue(sansAppel !== srv && !(await okD(sansAppel, S.jugerBlocSkinV1)), 'the judge call removed from enregistrerAchatSkin');
  tue(!pasTape(srv.replace('COUPURE_SKINS_V1);', String(COUPURE) + ');')), 'the cutoff typed in serveur-web.js');
} else console.log('  (mutants skipped: jugerBlocSkinV1 does not exist yet)');
vu(mutants === 4 && tues === mutants, 'F mutants killed: ' + tues + '/' + mutants);

console.log((rouges ? 'RED ' : 'GREEN ') + (n - rouges) + '/' + n);
process.exit(rouges ? 1 : 0);
