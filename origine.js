// origine.js — d ou vient un block, et peut-on encore en frapper ?
// ================================================================================================
// ⛔ MESURE DU 2026-09-13 : 459 creations B20 sur Base en ~22 h, et 2 seulement via TokenizedBlock (TBLOCK, TTB).
//    La carte et le fil montrent TOUS les B20 : sans marque, Phil croyait que chaque block aurait du payer le frais.
// ⛔ LE SIGNE « FAIT AVEC TOKENIZEDBLOCK » = une FACE gravee par Create dans contractURI (data:application/json avec
//    un champ `face` valide). C est une STRUCTURE, pas une preuve d identite : n importe qui pourrait graver la meme
//    forme. L ecran dit « its face was engraved by TokenizedBlock's Create », pas « certifie ».
// ⛔ MESURE DU MEME JOUR (jubjub, 0xb2…c231) : supply 100 Md, plafond = max uint128, le createur garde MINT_ROLE —
//    il peut frapper plus a tout moment. « Scelle » = supply == plafond : plus rien ne peut etre frappe, par personne.
import { faceDuBlock } from './face.js';
import { selecteur } from './pool.js';
import { TBLOCK_TEST_ANCIEN as TBLOCK } from './tokenomics.js'; /* game354: in this file TBLOCK = the OLD test token, only to read its LEGACY pools (never shown as "TBLOCK"); the real TBLOCK is tokenomics.TBLOCK */
import { frappesVers } from './mes-blocks.js';
import { FEE_WALLET } from './frais-creation.js';

/* ⛔⛔ « NOS BLOCKS D ABORD » (Phil, 2026-09-13). Qui est « a nous », lu sur la chaine :
 *    - la GENESE : TBLOCK et TTB, crees par Phil avant la tokenomics v2 (verifies on-chain le 2026-09-13) ;
 *    - tout block qui a FRAPPE ses 5 % vers le wallet de frais (tokenomics v2 : chaque creation via notre Create
 *      le fait dans sa transaction de creation).
 * ⚠️ STRUCTURE, PAS CERTIFICAT : n importe qui peut frapper un jeton vers le wallet de frais. C est un tri
 *    d affichage, jamais une garantie montree comme telle. */
/** TTB, le block de test de Phil (lien du 2026-09-13), lu dans son log de creation. */
export const TTB = '0xb20000000000000000000003d296be435ae4bbe3';
export const NOS_BLOCKS_GENESE = Object.freeze([TBLOCK.toLowerCase(), TTB]);

/* ══ R9b (2026-10-03, prod 20261003-r9-blocks-tb) — GRAINE DE /api/nos-blocks, comme GRAINE_ROUTEUR ══════════════════════
 * ⛔ Au redemarrage le serveur redescendait de la tete jusqu au bloc 50 861 088 (~19 min) : couvertureComplete restait
 *   faux, donc sourcesTbLues() aussi, et PEXRA + les jetons o1 restaient bloques en prod. La graine FIGE ce qui a ete lu
 *   sur la chaine : les B20 frappes (Transfer depuis 0x0) vers chaque compte de GRAINE_NOS_COMPTES entre le plancher et
 *   GRAINE_NOS_JUSQUA (frappesVers, le code meme du serveur ; 0 fenetre ratee). Le serveur ne lit plus que
 *   [GRAINE_NOS_JUSQUA + 1, tete].
 * ⛔ CHAQUE ENTREE SE RE-VERIFIE : { jeton, compte, bloc, tx } — le recu de `tx` (bloc `bloc`) porte un Transfer de `jeton`
 *   depuis 0x0 vers `compte` (verifierEntreeGraineNos). Une entree hors des comptes surveilles, hors plage ou mal formee :
 *   la graine ENTIERE est refusee (balayage complet, comme avant). Un compte surveille que la graine ne couvre pas
 *   (TB_NOS_CREATEURS) : graine refusee aussi — elle ne dit rien de ce compte. Une graine refusee n est qu un retour au
 *   balayage lent, jamais une couverture affirmee a tort. */
export const GRAINE_NOS_COMPTES = Object.freeze([FEE_WALLET.toLowerCase()]);
/* Lu le 2026-10-03 08:3x CEST (mainnet.base.org, 629 appels, 0 fenetre ratee ; fix-r4-logs/r9b/scan-nos.json) : 2 B20 frappes
 *   vers a6cf entre 50 861 088 et 52 109 849 ; avec la genese, les 4 blocks que /api/nos-blocks sert en prod. */
export const GRAINE_NOS_JUSQUA = 52109849;
export const GRAINE_NOS_BLOCKS = Object.freeze([
  { jeton: '0xb200000000000000000000e63ffc3f40bf92a042', compte: '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4', bloc: 51692885, tx: '0x6fee4932a982df3f6444dde424a7cb7afc838db7e074b4af930b57c473f00dba' },
  { jeton: '0xb200000000000000000000ab549fa65ad4edae3f', compte: '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4', bloc: 51527429, tx: '0xa1e0591229f80691cdeac437a81d8afe5c2f520b1af10661d83a6dfc790ab508' },
].map((g) => Object.freeze(g)));
const RE_ADR = /^0x[0-9a-f]{40}$/;
/** La graine est-elle admise pour ces comptes surveilles ? { ok, blocks, jusqua } ou { ok:false, pourquoi, rejetees }. */
export function graineNosBlocksAdmise({ comptes, plancher, graine = GRAINE_NOS_BLOCKS, jusqua = GRAINE_NOS_JUSQUA,
  couverts = GRAINE_NOS_COMPTES }) {
  const surveilles = new Set((comptes || []).map((c) => String(c).toLowerCase()));
  const couv = new Set((couverts || []).map((c) => String(c).toLowerCase()));
  if (!Number.isSafeInteger(jusqua) || !Number.isSafeInteger(plancher) || jusqua < plancher) return { ok: false, pourquoi: 'seed range invalid', rejetees: [] };
  const horsCouverture = [...surveilles].filter((c) => !couv.has(c));
  if (!surveilles.size || horsCouverture.length) return { ok: false, pourquoi: 'a watched account is not covered by the seed', rejetees: [] };
  const rejetees = (graine || []).filter((g) => !(g && RE_ADR.test(String(g.jeton)) && /^0xb20{20}/.test(String(g.jeton))
    && surveilles.has(String(g.compte)) && couv.has(String(g.compte)) && Number.isSafeInteger(g.bloc) && g.bloc >= plancher && g.bloc <= jusqua
    && /^0x[0-9a-f]{64}$/.test(String(g.tx))));
  if (rejetees.length) return { ok: false, pourquoi: rejetees.length + ' seed entr' + (rejetees.length > 1 ? 'ies' : 'y') + ' rejected', rejetees };
  return { ok: true, blocks: graine.map((g) => g.jeton), jusqua };
}
const TOPIC_TRANSFER_GRAINE = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
/** Re-verifie UNE entree sur la chaine (lecture seule : un recu). 'OK' | 'FAUX' | 'INCONNU' (recu null) | 'NON_LU'. */
export async function verifierEntreeGraineNos({ rpc, entree }) {
  let r;
  try { r = await rpc('eth_getTransactionReceipt', [entree.tx]); } catch { return 'NON_LU'; }
  /* F2 : la graine est figee dans le passe (bloc <= jusqua <= tete, verifie par verifierGraineNos) : un noeud qui ne connait PAS
   *   la tx dit qu elle n existe pas. Graine refusee (balayage complet), jamais « en attente » pour toujours.
   *   G2 (C2) : dit INCONNU, pas FAUX — un noeud a index de tx limite (geth --history.transactions) rend aussi null. */
  if (!r) return 'INCONNU';
  const mot = (a) => '0x' + '0'.repeat(24) + String(a).toLowerCase().slice(2);
  const ok = r.status === '0x1' && parseInt(r.blockNumber, 16) === entree.bloc && (r.logs || []).some((l) => String(l.address).toLowerCase() === entree.jeton
    && l.topics && String(l.topics[0]).toLowerCase() === TOPIC_TRANSFER_GRAINE && String(l.topics[1]).toLowerCase() === mot('0x' + '0'.repeat(40))
    && String(l.topics[2]).toLowerCase() === mot(entree.compte));
  return ok ? 'OK' : 'FAUX';
}
/** F2 (C2 R9b) : la graine ENTIERE re-verifiee sur la chaine avant d etre utilisee (lecture seule : 1 recu par entree) :
 *  jusqua <= tete, puis chaque entree par son recu. { etat: 'OK' } | { etat: 'FAUX', pourquoi } | { etat: 'NON_LU', pourquoi }.
 *  ⚠️ Ne prouve pas qu il ne MANQUE aucune entree (completude) : une entree perdue ne fait que retirer un block TB de cette
 *  source (fail-closed : il reste INCONNU, bloque), et les deux entrees sont aussi dans la liste statique. */
export async function verifierGraineNos({ rpc, tete, graine = GRAINE_NOS_BLOCKS, jusqua = GRAINE_NOS_JUSQUA }) {
  if (!Number.isSafeInteger(tete)) return { etat: 'NON_LU', pourquoi: 'chain head not read' };
  if (jusqua > tete) return { etat: 'FAUX', pourquoi: 'seed jusqua ' + jusqua + ' is past the chain head ' + tete };
  for (const e of graine) {
    const v = await verifierEntreeGraineNos({ rpc, entree: e });
    if (v === 'FAUX') return { etat: 'FAUX', pourquoi: 'seed entry ' + e.jeton + ' does not match its receipt (tx ' + e.tx + ')' };
    if (v === 'INCONNU') return { etat: 'FAUX', pourquoi: 'seed entry ' + e.jeton + ': tx unknown to this node (null receipt; tx index limited or pruned?) (tx ' + e.tx + ')' };
    if (v !== 'OK') return { etat: 'NON_LU', pourquoi: 'receipt of seed entry ' + e.jeton + ' not read' };
  }
  return { etat: 'OK' };
}

/** Nos blocks : la genese + les B20 frappes vers le wallet de frais entre `deBloc` et `aBloc`. */
export async function nosBlocks({ rpc, deBloc, aBloc }) {
  const r = await frappesVers({ rpc, compte: FEE_WALLET, deBloc, aBloc });
  const tous = new Set([...NOS_BLOCKS_GENESE, ...r.blocks.map((b) => b.jeton.toLowerCase())]);
  return { blocks: [...tous], fenetresRatees: r.fenetresRatees };
}

/** Tri stable : nos blocks en tete, l ordre d origine conserve a l interieur de chaque groupe. */
/* ⚠️ Pas de fonction en parametre par defaut ni de nom reutilise : les regles 5 et 7 de verifie-coherence. */
export function nousDabord(liste, nos) {
  const ensemble = new Set([...nos].map((adr) => String(adr).toLowerCase()));
  const notres = [], autres = [];
  for (const x of liste) (ensemble.has(String(x.jeton).toLowerCase()) ? notres : autres).push(x);
  return [...notres, ...autres];
}

export const ORIGINES = ['TOKENIZEDBLOCK', 'AILLEURS', 'NON_LU'];
export const SCELLEMENTS = ['SCELLE', 'OUVERT', 'NON_LU'];

/** L origine d apres l etat de lecture de la face (`faceDuBlock` / `faceDepuisUri`). */
export function origineDepuisFace(etatFace) {
  if (etatFace === 'LU') return 'TOKENIZEDBLOCK';
  if (etatFace === 'AUCUNE' || etatFace === 'AUTRE_SOURCE' || etatFace === 'INVALIDE') return 'AILLEURS';
  return 'NON_LU';
}

/** Scelle si la supply atteint le plafond. ⛔ Une valeur non lue ne se dit ni scellee ni ouverte. */
export function scellementDepuis(supply, plafond) {
  if (typeof supply !== 'bigint' || typeof plafond !== 'bigint') return { etat: 'NON_LU', marge: null };
  if (supply >= plafond) return { etat: 'SCELLE', marge: 0n };
  return { etat: 'OUVERT', marge: plafond - supply };
}

/** Trois lectures : contractURI, totalSupply, supplyCap. */
export async function lireOrigineEtScellement({ rpc, jeton }) {
  const lire = rpc;
  const f = await faceDuBlock({ rpc: lire, jeton });
  let supply = null, plafond = null;
  try {
    supply = BigInt(await lire('eth_call', [{ to: jeton, data: '0x' + selecteur('totalSupply()') }, 'latest']));
    plafond = BigInt(await lire('eth_call', [{ to: jeton, data: '0x' + selecteur('supplyCap()') }, 'latest']));
  } catch { supply = supply ?? null; plafond = null; }
  return { origine: origineDepuisFace(f.etat), scellement: scellementDepuis(supply, plafond) };
}

/** Les phrases a l ecran. */
export function phrasesOrigine({ origine, scellement }) {
  /* tip 0216 Raksha: drop «🟦 Made with TokenizedBlock» — serves nothing now. Keep ORIGINES for logic. */
  const o = '';
  const s = scellement.etat === 'SCELLE' ? '🔒 Sealed: the supply is at its cap — nobody can mint more.'
    : scellement.etat === 'OUVERT' ? '⚠️ Not sealed: more can still be minted (the cap is above the supply) by whoever holds the mint role.'
      : 'Seal not read.';
  return { origine: o, scellement: s };
}
