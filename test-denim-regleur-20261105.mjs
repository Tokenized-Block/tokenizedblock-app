// test-denim-regleur-20261105.mjs — LE KEEPER (slots-regleur.js) SUIT LE TEMPS DE BLOC COMME LE SERVEUR (Denim : 2 s -> 200 ms/bloc).
// AVANT : (a) mesure LONGUE seule (1 000 blocs, relue toutes les 10 min) : 2 s gardees ~10 min apres la bascule ; (b) inclusionMaxMs 120 s
//   = 600 blocs a 200 ms, plus que la fenetre de 256 (une tx coincee bloquait tout le reste au-dela des fenetres) ; (c) intervalle = 1/5 de
//   la fenetre, 10 s sans mesure : ~5 tours par fenetre de 51 s.
// AFFIRME (EXECUTION) : fonctions pures a 2 s / 0,2 s / non mesure ; un vrai creerRegleur sur une chaine qui passe de 2 s a 0,2 s suit la
//   bascule par la mesure COURTE (< 1 min, pas 10 min) ; non mesure -> pire cas 200 ms (jamais 2 s) ; le cas « tx en vol relachee a ~17 s »
//   est EXECUTE par test-slots-regleur-20261023.mjs (cas 10d), relance ici sur chaque mutant. MUTANTS TUES : mesure courte retiree, 1/5 de
//   fenetre, 10 s sans mesure, inclusion fixe 120 s.
// Ce que le keeper a le droit d envoyer (verifierEnvoi) n est pas touche. NE PROUVE PAS : un reglement reel ; la bascule reelle de mainnet.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import * as Slots from './slots-plan.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.join(ICI, 'slots-regleur.js');
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n++; };
const hx = (x) => '0x' + BigInt(x).toString(16);
const CLE = '0x' + '11'.repeat(32); /* cle de TEST (aucun fonds, aucun envoi ici : rien n est a regler sur cette chaine) */
const C = '0x' + 'c5'.repeat(20);
const TABLE = new Array(Slots.MAX_POINTS + 1).fill(0);

async function banc(M) {
  const rates = [];
  const ok = (c, m) => { if (!c) rates.push(m); };
  /* les fonctions pures */
  ok(M.intervalleDepuisBloc(2000) === 10000, '2 s : intervalle 10 s (borne haute, inchange) (lu ' + M.intervalleDepuisBloc(2000) + ')');
  ok(M.intervalleDepuisBloc(200) === 5120 && 51200 / M.intervalleDepuisBloc(200) >= 10, '0,2 s : 5,12 s, >= 10 tours par fenetre de 51,2 s (lu ' + M.intervalleDepuisBloc(200) + ')');
  ok(M.intervalleDepuisBloc(null) === 5120, 'non mesure : pire cas 200 ms -> 5,12 s, pas 10 s (lu ' + M.intervalleDepuisBloc(null) + ')');
  ok(M.inclusionMaxDepuisBloc(2000) === 120000, '2 s : inclusion 120 s (inchange)');
  ok(M.inclusionMaxDepuisBloc(200) === 17066 && M.inclusionMaxDepuisBloc(200) / 200 < 256, '0,2 s : inclusion ~17 s = 85 blocs < fenetre de 256 (lu ' + M.inclusionMaxDepuisBloc(200) + ')');
  ok(M.inclusionMaxDepuisBloc(null) === 17066, 'non mesure : inclusion au pire cas 200 ms');
  /* un vrai regleur sur une chaine qui bascule de 2 s a 0,2 s au bloc BS */
  const BS = 1_000_000, T0 = 1_790_000_000;
  const ts = (b) => T0 + Math.floor((b <= BS ? b * 2 : BS * 2 + (b - BS) * 0.2) + 1e-9);
  const monter = (illisible = false) => {
    const ch = { tete: BS };
    const rpc = async (m, p) => {
      if (m === 'eth_chainId') return hx(8453);
      if (m === 'eth_blockNumber') return hx(ch.tete);
      if (m === 'eth_getBlockByNumber') { const b = p[0] === 'latest' ? ch.tete : parseInt(p[0], 16); if (b > ch.tete || (illisible && b !== ch.tete)) return null; return { number: hx(b), hash: '0x' + b.toString(16).padStart(64, '0'), timestamp: hx(ts(b)), baseFeePerGas: '0x1' }; }
      if (m === 'eth_getLogs') return [];
      throw new Error('inattendu ' + m);
    };
    let t = 5_000_000;
    const r = M.creerRegleur({ cle: CLE, contrat: C, chainId: 8453, table: TABLE, blocDeploiement: BS - 5000, rpc, maintenant: () => t, journal: () => {} });
    return { ch, r, avancer: (ms) => { t += ms; } };
  };
  try {
    const o = monter();
    await o.r.tour();
    const e1 = o.r.etat();
    ok(e1.msParBlocMesure === 2000 && e1.intervalleMs === 10000 && e1.bornes.inclusionMaxMs === 120000, 'avant la bascule : 2 000 ms, tours de 10 s, inclusion 120 s (lu ' + e1.msParBlocMesure + ', ' + e1.intervalleMs + ', ' + e1.bornes.inclusionMaxMs + ')');
    /* 100 s plus tard : 500 blocs a 0,2 s ; la longue (10 min) n est pas relue, la courte (15 s) l est */
    o.ch.tete = BS + 500; o.avancer(20000); await o.r.tour();
    const e2 = o.r.etat();
    ok(e2.bornes.msParBlocLong === 2000, 'temoin : la mesure longue dit encore 2 000 ms juste apres la bascule');
    ok(e2.msParBlocMesure !== null && e2.msParBlocMesure < 210 && e2.intervalleMs < 5200 && e2.bornes.inclusionMaxMs < 18000, 'juste apres la bascule : la courte l emporte (' + e2.msParBlocMesure + ' ms, tours de ' + e2.intervalleMs + ' ms, inclusion ' + e2.bornes.inclusionMaxMs + ' ms)');
    const nm = monter(true); await nm.r.tour();
    const e3 = nm.r.etat();
    ok(e3.msParBlocMesure === null && e3.intervalleMs === 5120 && e3.bornes.inclusionMaxMs === 17066, 'non mesure (en-tetes illisibles) : pire cas 200 ms, jamais 2 s (lu ' + e3.msParBlocMesure + ', ' + e3.intervalleMs + ', ' + e3.bornes.inclusionMaxMs + ')');
  } catch (e) { rates.push('regleur a leve : ' + e.message); }
  return rates;
}

const r0 = await banc(await import(pathToFileURL(SOURCE).href));
vu(r0.length === 0, 'vert : ' + r0.join(' | '));
const src = readFileSync(SOURCE, 'utf8');
/* la garde des envois : sa signature (lue, pas executee ici — executee par test-slots-regleur et test-keeper-denim-v2-rolls).
 *   2026-11-05 (keeper Denim, extension) : un parametre de plus, duelsV2 (BlockDuelsV2) — CHANGEMENT VOULU, l ancienne ligne ne vaut plus */
/* 2026-11-12 (the new Spin) : un parametre de plus, slotsAvant (l ANCIEN Spin, toujours regle) — CHANGEMENT VOULU */
vu(/export function verifierEnvoi\(tx, \{ contrat, chainId, bornes = BORNES_DEFAUT, duels = null, rolls = null, duelsV2 = null, slotsAvant = null \}\) \{/.test(src), 'verifierEnvoi : signature attendue (duelsV2 en plus 2026-11-05, slotsAvant en plus 2026-11-12)');

const lancerSuite = (copie) => { try { execFileSync(process.execPath, [path.join(ICI, 'test-slots-regleur-20261023.mjs')], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, REGLEUR_MODULE: copie, TOUT_COMPTER: '' } }); return true; } catch (_) { return false; } };
/* temoin : la suite passe sur le VRAI module charge par REGLEUR_MODULE (sinon un mutant « tue » par la suite ne prouverait rien) */
vu(lancerSuite(SOURCE) === true, 'temoin : test-slots-regleur vert sur le module du depot passe par REGLEUR_MODULE');
const mutants = [
  ['mesure courte retiree (longue seule, 10 min)', 'const court = t - st.mesureCourteA >= bornes.mesureCourteToutesMs;', 'const court = false;'],
  ['1/5 de fenetre (ancien intervalle)', '/ (Number(bornes.toursParFenetre) > 0 ? Number(bornes.toursParFenetre) : 10));', '/ 5);'],
  ['sans mesure : 10 s (ancienne borne haute)', 'export function intervalleDepuisBloc(msParBloc, bornes = BORNES_DEFAUT) {\n  const ms = Number(msParBloc) > 0 ? Number(msParBloc) : MS_PIRE_CAS;', 'export function intervalleDepuisBloc(msParBloc, bornes = BORNES_DEFAUT) {\n  if (!(Number(msParBloc) > 0)) return bornes.intervalleMaxMs; const ms = Number(msParBloc);'],
  ['inclusion fixe 120 s dans suivreInclusion', 'const bornes = bornesDeLInclusion();', 'void bornesDeLInclusion;'],
];
let tues = 0;
for (const [nom, de, vers] of mutants) {
  const eol = (src.match(/\r?\n/) || ['\n'])[0], deN = de.replace(/\n/g, eol), versN = vers.replace(/\n/g, eol);
  assert.ok(src.includes(deN), 'ancre : ' + nom);
  const f = path.join(ICI, '.mutant-denim-regleur-' + tues + '-' + process.pid + '.js');
  writeFileSync(f, src.replace(deN, versN));
  try {
    const r = await banc(await import(pathToFileURL(f).href));
    const suite = lancerSuite(f);
    vu(r.length > 0 || !suite, 'mutant TUE — ' + nom + ' (' + (r[0] || 'test-slots-regleur rouge') + ')');
    console.log('mutant tue : ' + nom + ' — ' + (r.length ? 'banc : ' + r[0] : '') + (suite ? '' : ' [test-slots-regleur rouge]'));
    tues += 1;
  } finally { unlinkSync(f); }
}
console.log('ok denim-regleur — ' + n + ' assertions, ' + tues + '/' + mutants.length + ' mutants tues ; NE PROUVE PAS un reglement reel ni la bascule de mainnet');
