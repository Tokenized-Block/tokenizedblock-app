/* tam-science.js — game76 (Phil 01/11 : « vasy fait tout ») : MINTER les sciences en direct (physique, fractales, or, quantique, fluides)
 *   avec le contrat TamArt DEJA deploye. Pur : aucun DOM, aucun reseau ; le serveur et la page l importent tous les deux.
 *   ⛔ Pourquoi ca tient sans TamArt v2 (relu dans contracts/src/TamArt.sol#mint) : le contrat ne verifie que l en-tete
 *     ('T' 'A' 'M', VERSION 1, q dans 1..16, drapeau nuage 0/1) et refuse un doublon par keccak ; il ne connait PAS la famille.
 *     Une oeuvre de science est donc encodee au MEME format (tam-moteur.js#encoder), q = 12, et rejouee par n importe qui depuis
 *     ses params publics : simuler (module de la science, deterministe : aucune fonction transcendante native) -> standardiser ->
 *     projeterND (la cascade du moteur) -> quantifier -> tri Morton pour un nuage -> encoder.
 *   ⛔ Certificats d une science : bornee, dans les bornes de son module, et DISTINCTE de toutes les oeuvres mintees (meme seuil que les
 *     attracteurs, 0.20). Pas de seuil de chaos : une orbite de Kepler n est pas chaotique, et elle n a pas a l etre — la carte le dit. */
import * as PHY from './tam-physique.js';
import * as SCI from './tam-sciences.js';
import * as FLU from './tam-fluides.js';
/* game78 : les astres (systeme solaire J2000, S2/Sgr A*, binaire, amas, supernova, galaxies), le cosmos (lumiere et trous noirs, Kerr,
 *   trou de ver, Lagrange, Hulse-Taylor, matiere noire, expansion, Halley, TRAPPIST-1, disque), l invisible (onde gravitationnelle,
 *   courbure, chute, dilatation, tunnel, superposition, dipole, lumiere, Minkowski, Brown) et le quantique (Talbot, oscillateur, Wigner,
 *   marche, Bell, rotor, Landau, Stern-Gerlach) — chaque module a son banc (valeurs connues + mutants) */
import * as AST from './tam-astro.js';
import * as COS from './tam-cosmos.js';
import * as INV from './tam-invisible.js';
import * as QUA from './tam-quantique.js';
/* game79 : la fusion de trous noirs IMRPhenomB (arXiv 0909.2867), spins alignes, restes Hofmann-Barausse-Rezzolla / Barausse-Morozova-Rezzolla */
import * as FUS from './tam-fusion.js';
/* game80 : les « grandes questions » (vide quantique, Big Rip, faux vide, centre de la Terre, Mars, zero absolu, taille de l Univers,
 *   pi, calendrier cosmique ; pendule de Foucault, mouvement de la Terre, etoiles, evaporation des trous noirs, tsunami, geometrie de
 *   l Univers, tailles des etoiles) — chaque valeur sourcee (URL en commentaire), chaque systeme verifie contre la valeur publiee */
import * as GQ1 from './tam-grandes-questions.js';
import * as GQ2 from './tam-grandes-questions-2.js';
/* game81 : les champs quantiques (champ libre, fluctuations du vide, interaction de champs, Schwinger, Unruh, couplage courant, Compton),
 *   les atomes (Slater, raies NIST) et les quarks (potentiel de Cornell, charmonium vs PDG) — valeurs de comparaison sourcees (SOURCES) */
import * as CHQ from './tam-champs-quantiques.js';
/* game88 (Phil : « les principes du vide quantique ») : vide comprime, Casimir dynamique, vide de Higgs, emission spontanee —
 *   adimensionnels, chacun contre sa formule exacte (aucune valeur publiee : SOURCES vide) */
import * as VQ from './tam-vide-quantique.js';
/* game93 (nuit du 01/11, « ce qu il manque comme theories ») : Ising 2D (Onsager), Lotka-Volterra (H conserve), SIR (taille finale exacte),
 *   lentille gravitationnelle (images et amplification exactes), Kuramoto (Kc = 2 gamma), Gibbs (Si(pi) calcule) — SOURCES vide */
import * as T2 from './tam-theories-2.js';
/* game96 : Rutherford (b = k/(2E) cot(theta/2)), logistique (r1 = 3, r2 = 1 + sqrt 6), chaleur (sigma^2 = sigma0^2 + 2Dt),
 *   oscillateur force (amplitude exacte), brachistochrone (sqrt(a/g) theta), Galton (binomiale) — SOURCES vide */
import * as T3 from './tam-theories-3.js';
/* game111 (Phil : « ajoute tout ce qui est relie a l ADN, l ARN et le reste ») : sciences de la vie — mutations de l ADN (Jukes-Cantor),
 *   gene -> ARN -> proteine (Gillespie, moments exacts) — SOURCES vide ; game112 : derive genetique (Wright-Fisher), enzyme (Michaelis-Menten) */
import * as BIO from './tam-biologie.js';
/* game113 (Phil : « ajoute aussi une categorie science chimique ») : reactions en chaine (Bateman), equilibre A <-> B, brusselator
 *   (seuil de Hopf exact) — SOURCES vide (pas de pH : la constante de l eau est une valeur publiee non lue) */
import * as CHI from './tam-chimie.js';
/* game115 (Phil : « un codex math et science extremement complet ») : mathematiques du hasard et des nombres — marches au hasard,
 *   aiguilles de Buffon, anniversaires, spirale d Ulam — SOURCES vide (le nombre de jours d une annee est un curseur) */
import * as MAT from './tam-maths.js';
/* game120 (passe « ce qui manque » : un seul systeme d ondes dans tout le codex) : arc-en-ciel (Descartes), corde vibrante (schema exact
 *   a Courant 1), effet Doppler et cone de Mach — SOURCES vide (l indice de refraction est un curseur) */
import * as OND from './tam-ondes.js';
/* game122 : electricite — lignes de champ de deux charges (flux q1 theta = |q2| phi), circuit RC (la moitie de l energie perdue) */
import * as ELE from './tam-electricite.js';
/* game123 : mecanique — le billard qui compte pi (ceil(pi / theta) - 1 chocs), modes propres d une chaine (2 sin(j pi / 2(N+1))) */
import * as MEC from './tam-mecanique.js';
import { BORNES, motifDefaut, melangerVue, lnD } from './tam-moteur.js';
import { projeterND, encoder, signature, distance, canon, SEUIL_DISTINCT } from './tam-moteur.js';
import { keccak256Hex } from './keccak.js';

export const VERSION_SCIENCE = 'sci1';
export const Q_SCIENCE = 12;
const DEUX_PI = 6.283185307179586, ANGLE_OR = 2.399963229728653;
const ADR = /^0x[0-9a-f]{40}$/;
/* game79 : + melange (une science x un motif fractal / angle d or — des types DIFFERENTS combines), graine (le cerveau qui a tire),
 *   note (ce que le cerveau a mesure et conclu : stockee on-chain AVEC l oeuvre, dans les params, quand quelqu un la minte) */
const CLES = new Set(['v', 'science', 'params', 'angles', 'q', 'minteur', 'melange', 'graine', 'note']);
export const NOTE_MAX = 700;
/* les systemes VUS mais jamais certifies/mintes (aucun aujourd hui : la fusion est bornee par coutFusion ci-dessous) */
export const NON_MINTABLES = Object.freeze(new Set([]));
/** game79 (Phil : « fais que la fusion passe on-chain ») : le cout de la fusion suit le nombre de cycles, ~ (Mc_det x fDepart)^(-5/3)
 *   (Mc_det = masse de chirp detectee = (m1 m2)^(3/5) / (m1+m2)^(1/5) x (1+z)). Mesure 01/11 : defaut (Mc_det x f = 612) 26 ms ;
 *   coin 5+5 Msun, 10 Hz, z = 0 (43.5) 997 ms. Seuil 150 -> ~270 ms au pire, comme la supernova hydrodynamique. */
/* game80 (audit des durees : des coins de reglage depassent 300 ms de calcul serveur) : des gardes de COUT, calculees AVANT toute
 *   simulation, mesurees le 01/11 a n = 1500. Au-dela : visible dans la page, pas certifiable (la raison est dite). */
export const GARDES_COUT = Object.freeze({
  /* game82 : un certificat ne simule plus qu UNE fois (il simulait 3 fois) — gardes re-mesurees seules sur 1 simulation, cible ~400 ms.
   * paquetOscillateur : 16 periodes = 398 ms au pire mesure (x0 0, largeur 2, omega 0.5), 20 = 485 ms -> 16 (etait 8) */
  paquetOscillateur: (p) => (Number(p.periodes) <= 16 ? null : 'at most 16 periods can be certified here (each period costs computing time)'),
  /* amasEtoiles : etoiles^2 x duree / 1600 <= 9 -> 308 ms au pire sur masseTrouNoir x viriel ; 12 -> 428 ms : on garde 9 */
  amasEtoiles: (p) => ((Number(p.etoiles) ** 2) * Number(p.duree) / 1600 <= 9 ? null : 'fewer stars or a shorter run can be certified here (stars^2 x duration / 1600 must stay <= 9)'),
  /* le systeme solaire INTERIEUR (groupe 0) : 244 ms a 100 ans, 482 a 200 -> 150 ans (etait 100) ; le groupe 1 est rapide (37 ms a 400) */
  systemeSolaire: (p) => (Math.round(Number(p.groupe)) === 1 || Number(p.annees) <= 150 ? null : 'at most 150 years of the inner planets can be certified here'),
  /* champDipolaire : 80 ms au pire des bornes (B0 2000, duree 240) -> plus de garde (elle refusait 37 tirages / 200 pour rien) */
});
export const FUSION_PRODUIT_MIN = 90; /* Phil : « augmente les limites » — 150 -> 90 : plus de couples acceptes, pire cas mesure au banc */
export function coutFusion(p) {
  const m1 = Number(p.m1), m2 = Number(p.m2), z = Number(p.z) || 0, f = Number(p.fDepart);
  return chirp(m1, m2) * (1 + z) * f;
}
/* masse de chirp (m1 m2)^(3/5) / (m1+m2)^(1/5) — par exp/ln deterministes (lnD du moteur, expD local) */
function chirp(m1, m2) { return expL(0.6 * lnD(m1 * m2) - 0.2 * lnD(m1 + m2)); }
function expL(x) { /* exp deterministe : 2^k x serie de Taylor sur le reste (meme principe que les modules) */
  const k = Math.round(x / 0.6931471805599453), r = x - k * 0.6931471805599453; let s = 1, t = 1;
  for (let i = 1; i < 30; i++) { t *= r / i; s += t; }
  return s * 2 ** k;
}
const H32 = /^0x[0-9a-f]{64}$/;
/* les motifs offerts au melange : les MEMES que les attracteurs (tam-moteur.js#motifDefaut), sans retouche (une oeuvre = un JSON canonique) */
export const MOTIFS_MELANGE = Object.freeze([['ifs', 'fougere'], ['ifs', 'sierpinski'], ['ifs', 'dragon'], ['julia', null], ['phyllotaxie', null], ['epicycles', null],
  ['lsysteme', 'koch'], ['lsysteme', 'dragon'], ['lsysteme', 'plante']]);

export const SYSTEMES = Object.freeze([PHY, SCI, FLU, AST, COS, INV, QUA, FUS, GQ1, GQ2, CHQ, VQ, T2, T3, BIO, CHI, MAT, OND, ELE, MEC].flatMap((mod) => mod.SYSTEMES.map((s) => Object.freeze({ ...s, mod }))));
export const systeme = (id) => SYSTEMES.find((s) => s.id === id) || null;
/** game82 (audit : le curseur « groupe » glissait par 1/400 et le module l arrondissait) : un parametre ENTIER selon le module lui-meme */
export const paramEntier = (id, k) => { const s = systeme(id); return !!(s && s.mod.ENTIERS && (s.mod.ENTIERS[id] || []).includes(k)); };

/** les angles des plans caches par defaut : l angle d or, comme le moteur (D - 3 angles) */
export function anglesDefaut(D) {
  const a = []; for (let i = 0; i < Math.max(0, D - 3); i++) a.push(Math.round(((i + 1) * ANGLE_OR % DEUX_PI) * 1e6) / 1e6);
  return a;
}
/** les params complets d une oeuvre de science : bornes par son module, angles par defaut, q fixe ; minteur si connu */
export function paramsScience(id, params = {}, { minteur = null, angles = null } = {}) {
  const s = systeme(id); if (!s) throw new Error('science inconnue: ' + id);
  const o = s.mod.simuler(id, params);
  const P = { v: VERSION_SCIENCE, science: id, params: o.params, angles: angles || anglesDefaut(o.D), q: Q_SCIENCE };
  if (minteur && ADR.test(String(minteur).toLowerCase())) P.minteur = String(minteur).toLowerCase();
  return P;
}

/** les params tiennent-ils ? (cles connues, science connue, params = ceux que le module rend apres bornage, angles, q, minteur) */
/** game82 (mesure : un certificat SIMULAIT 3 FOIS la meme oeuvre — valider, puis rejouer = valider + generer ; effetTunnel 923 ms
 *   pour 141 ms de simulation) : la validation garde sa sortie, la generation la reprend. Meme appel, memes nombres : une seule fois. */
export function validerScience(P) { return validerEtSimuler(P).v; }
function validerEtSimuler(P) {
  const sortie = { o: null }, v = validerInterne(P, sortie);
  return { v, o: v.ok ? sortie.o : null };
}
function validerInterne(P, sortie) {
  const non = (raison) => ({ ok: false, code: 'HORS_BORNES', raison });
  if (!P || typeof P !== 'object' || Array.isArray(P)) return non('params absents');
  for (const k of Object.keys(P)) if (!CLES.has(k)) return non('cle inconnue: ' + k);
  if (P.v !== VERSION_SCIENCE) return non('version');
  const s = systeme(P.science); if (!s) return non('science inconnue');
  /* revue game79 (high) : un systeme dont un reglage peut couter des SECONDES de calcul synchrone n est pas certifiable (la route
   *   publique /api/tam/certifier etait un levier de deni de service) ; il reste visible, sans Mint */
  if (NON_MINTABLES.has(P.science)) return non('this system is shown, not minted (too costly to certify on the server)');
  if (GARDES_COUT[P.science] && P.params && typeof P.params === 'object') { const g = GARDES_COUT[P.science](P.params); if (g) return non(g); }
  /* la fusion : le cout borne AVANT toute simulation (la route publique ne peut plus commander des secondes de calcul) */
  if (P.science === 'fusionTrousNoirs' && P.params && typeof P.params === 'object' && !(coutFusion(P.params) >= FUSION_PRODUIT_MIN))
    return non('too many cycles to certify here: raise the masses, the redshift or the starting frequency (chirp mass x (1+z) x fDepart >= ' + FUSION_PRODUIT_MIN + ')');
  if (P.q !== Q_SCIENCE) return non('q');
  if (!P.params || typeof P.params !== 'object' || Array.isArray(P.params)) return non('parametres absents');
  let o; try { o = s.mod.simuler(P.science, P.params); } catch (_) { return non('parametres refuses par le module'); }
  sortie.o = o;
  /* un params hors bornes serait RAMENE par le module : on exige qu il le soit deja (sinon deux JSON differents = la meme oeuvre) */
  if (canon(o.params) !== canon(P.params)) return non('parametres hors bornes (le module les ramene)');
  if (!Array.isArray(P.angles) || P.angles.length !== Math.max(0, o.D - 3) || !P.angles.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= DEUX_PI)) return non('angles hors bornes');
  if (P.minteur !== undefined && !ADR.test(P.minteur)) return non('minteur');
  if (P.graine !== undefined && !H32.test(P.graine)) return non('graine');
  if (P.note !== undefined && !(typeof P.note === 'string' && P.note.length <= NOTE_MAX && /^[\x20-\x7e·—≈λσπ°]*$/.test(P.note))) return non('note');
  if (P.melange !== undefined) {
    const m = P.melange;
    if (CORPS[P.science]) return non('melange : pas sur un systeme a plusieurs corps');
    const cles = m && typeof m === 'object' ? Object.keys(m).sort().join() : '';
    if (cles === 'operateur,science,w' || cles === 'operateur,params,science,w') {
      /* game128 : le partenaire est une science, a ses reglages par defaut ; game130 : ou a des reglages DONNES (params), complets et deja
       *   bornes par son module, jamais egaux aux defauts (sinon deux JSON pour la meme oeuvre), et soumis aux MEMES gardes de cout */
      /* game131 : + croise (un systeme CONTRE l autre), reserve aux partenaires science */
      if (m.operateur !== 'somme' && m.operateur !== 'composition' && m.operateur !== 'croise') return non('melange : operateur');
      if (!(typeof m.w === 'number' && m.w >= BORNES.w[0] && m.w <= BORNES.w[1])) return non('melange : poids');
      if (!PARTENAIRES.includes(m.science) || m.science === P.science) return non('melange : science partenaire');
      if (m.params !== undefined) { const r = reglagesPartenaireValides(m.science, m.params); if (r) return non('melange : ' + r); }
      return { ok: true, code: 'DANS_LES_BORNES', raison: null };
    }
    if (!m || typeof m !== 'object' || Object.keys(m).sort().join() !== 'motif,operateur,w') return non('melange');
    if (m.operateur !== 'somme' && m.operateur !== 'composition') return non('melange : operateur');
    if (!(typeof m.w === 'number' && m.w >= BORNES.w[0] && m.w <= BORNES.w[1])) return non('melange : poids');
    const ok = MOTIFS_MELANGE.some(([f, v]) => canon(motifDefaut(f, v)) === canon(m.motif));
    if (!ok) return non('melange : motif');
  }
  return { ok: true, code: 'DANS_LES_BORNES', raison: null };
}

/** game78 (systeme solaire en 12-D : la projection N-D melangeait les axes de 4 planetes — boucles emmelees au lieu de 4 orbites) :
 *   les systemes a PLUSIEURS CORPS rangent k coordonnees par corps ; on les dessine dans le MEME espace, corps apres corps.
 *   k = 3 : (x, y, z) par corps ; k = 2 : (x, y) dans le plan, z = 0. */
export const CORPS = Object.freeze({ troisCorps: 3, systemeSolaire: 3, amasEtoiles: 3, lumiereTrouNoir: 3, expansionUnivers: 3, cometeHalley: 3,
  trouDeVer: 3, pulsarHulseTaylor: 3, tourbillonsPonctuels: 2, trappist1: 2 });
/** un nuage (points tires, pas un chemin) : la science elle-meme, ou une COMPOSITION avec un IFS / Julia (comme les attracteurs) */
export const estNuage = (P, o) => !!(o && o.nuage) || !!(P && P.melange && P.melange.operateur === 'composition' && (P.melange.science || P.melange.motif.famille === 'ifs' || P.melange.motif.famille === 'julia'));
/** game79 : le NOM de chaque corps (la bulle de survol dit « Earth », pas « body 3 ») ; null = « body k » */
export function nomsCorps(id, params = {}) {
  if (id === 'systemeSolaire') return Number(params.groupe) === 1 ? ['Jupiter', 'Saturn', 'Uranus', 'Neptune'] : ['Mercury', 'Venus', 'Earth', 'Mars'];
  if (id === 'cometeHalley') return ['Halley', 'Earth'];
  if (id === 'troisCorps') return ['Star 1', 'Star 2', 'Star 3'];
  if (id === 'lumiereTrouNoir') return ['Light ray 1', 'Light ray 2', 'Light ray 3', 'Light ray 4'];
  if (id === 'trouDeVer') return ['Light ray 1', 'Light ray 2'];
  return null;
}
/** le corps CENTRAL a l origine du repere de ces systemes (affiche, jamais stocke) */
export const CENTRE = Object.freeze({ systemeSolaire: 'Sun', cometeHalley: 'Sun', trappist1: 'TRAPPIST-1', amasEtoiles: 'black hole', lumiereTrouNoir: 'black hole', trouDeVer: 'throat' });
/** la vue « corps » : m = D/k corps, n/m echantillons chacun (dans l ordre du temps), concatenes ; centree et a l echelle COMMUNE ([-1, 1]) */
export function vueCorps(o, k) {
  const n = o.n, D = o.D, m = Math.max(1, Math.floor(D / k)), par = Math.max(1, Math.floor(n / m)), out = new Float64Array(n * 3);
  for (let p = 0; p < n; p++) {
    const b = Math.min(m - 1, Math.floor(p / par)), j = p - b * par, i = Math.min(n - 1, Math.floor(Math.min(j, par - 1) * n / par));
    out[3 * p] = o.brut[i * D + b * k]; out[3 * p + 1] = o.brut[i * D + b * k + 1]; out[3 * p + 2] = k === 3 ? o.brut[i * D + b * k + 2] : 0;
  }
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let p = 0; p < n; p++) for (let c = 0; c < 3; c++) { const v = out[3 * p + c]; if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; }
  const r = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2, s = r > 0 ? 1 / r : 0;
  for (let p = 0; p < n; p++) for (let c = 0; c < 3; c++) out[3 * p + c] = (out[3 * p + c] - (lo[c] + hi[c]) / 2) * s;
  /* l origine du repere (le Soleil, l etoile, le trou noir), dans la meme echelle — pour l affichage seulement */
  const origine = [0, 1, 2].map((c) => (0 - (lo[c] + hi[c]) / 2) * s);
  return { vue: out, corps: m, par, origine };
}
/** game77 (chasse aux bugs : Rabi 0.1 vs 5 -> distance 0.005, omega, lambda, hauteur -> 0.000) : la standardisation PAR AXE ramenait
 *   chaque axe a la meme taille et effacait ce que ces curseurs reglent. Une science garde ses PROPORTIONS : centree par axe, divisee
 *   par UN seul ecart-type (le plus grand des axes). Aucune science n est mintee (totalSupply = 0 le 01/11). */
/** game82 (audit des 83 systemes) : une colonne d une AUTRE grandeur (le temps, l echappement) ecrasait l echelle commune —
 *   supernova : temps 10 500 ans contre 5 pc -> une ligne [2, 0.003, 0.003] ; versMars, fusion, karman, Mandelbrot zoome idem.
 *   Ces colonnes (indices lus dans tam-legendes.js) ont leur PROPRE echelle et sortent du sMax ; les axes de meme grandeur
 *   gardent leurs proportions (le correctif game77 tient). */
/* game132 (vu a l ecran depuis game116 : le dogme central plus haut que large) : une colonne a QUEUE LOURDE (rafales de proteines,
 *   charge qui sature) couvre 6.5 ecarts-types quand le temps uniforme en couvre sqrt(12) = 3.46 : divisee par son ecart-type, elle
 *   etire le graphe. Ces colonnes-la sont mises a l echelle par leur ETENDUE (ramenee a celle d une colonne uniforme), les autres
 *   gardent la regle commune. Mesure : dogme 3.46 x 6.49 -> 3.46 x 3.46 ; RC 3.46 x 4.59 -> 3.46 x 3.46. */
/* game133 : la luminance de Planck (le pic chaud T^5 fois plus haut, le reste pres de 0) : 3.46 x 7.05 a l ecran -> 3.46 x 3.46 */
export const ECHELLE_ETENDUE = Object.freeze({ dogmeCentral: [1], circuitRC: [1], corpsNoir: [1] });
export const ECHELLE_PROPRE = {
  /* riskBernoulli (2026-11-14) */
  riskBernoulli: [2],
  /* game311: emotionWiringHCP has no entry since game316: its three columns are real millimetres (front-back, bottom-top, left-right), one shared scale */
  /* game310 */
  bodyMapsNummenmaa: [2],
  /* game309 */
  emotionsSiegel: [2],
  /* game308 */
  connectomeSizes: [2],
  /* game307 */
  neuronsHerculanoHouzel: [2],
  /* game306 */
  allOrNoneLucas: [2],
  /* game305 */
  brainBoyd: [2],
  /* game304 */
  glycosuriaCannon: [2],
  /* game303 */
  weberKonig: [2],
  /* game302 */
  extinctionPavlov: [2],
  /* game301 */
  pressurePeirceJastrow: [2],
  /* game300 */
  attentionCattell: [2],
  supernova: [3], supernovaHydro: [3, 4], versMars: [2], fusionTrousNoirs: [0, 3], binaireFusion: [0, 3],
  mandelbrot: [2], karman: [2], evaporationTrouNoir: [0, 1, 2, 3],
  /* game88 (vu a l ecran : Higgs dessine en LIGNE, le temps ~260 et V ecrasaient phi ~1) : les principes du vide — seules les colonnes de
   *   MEME grandeur gardent l echelle commune (x et p ; Re phi et Im phi ; le desaccord seul) */
  higgsVide: [2, 3], videComprime: [2, 3], casimirDynamique: [2, 3], emissionSpontanee: [1, 2, 3],
  /* game89 (passe « rien oublie » sur les 87 systemes) : la densite de probabilite ecrasait position et temps [0.074 0.079 1] ; 1/alpha
   *   (~137) ecrasait log10 Q [0.052 1 0.008], et l indice de la force (0/1) est une etiquette, pas une longueur */
  tapisTalbot: [2], couplageCourant: [1, 2],
  /* game92 (audit des curseurs « muets » : effetTunnel V0 changeait la transmission de 98 % a 7 % sans changer le dessin — |psi|^2,
   *   ~0.05, ecrase par la position, ~150) : toute colonne d une AUTRE grandeur a son echelle. Gardees telles quelles, parce qu elles
   *   sont petites pour une raison PHYSIQUE : y de karman, z de Lagrange et du disque, y des lignes de champ, largeur constante du
   *   paquet coherent (son echelle propre gonflerait le bruit numerique a la taille du dessin) */
  effetTunnel: [2], wigner: [2], marcheQuantique: [2, 3], binaireTrouNoir: [3], disqueAccretion: [3], rotorPulse: [3],
  champLibre: [2], interactionChamps: [2, 3], tsunami: [2, 3], mouvementTerre: [3], tailleEtoiles: [3], oscillateurEtats: [1, 2],
  centreTerre: [0, 1, 2, 3],
  /* game93 : les colonnes « autres » declarees par tam-theories-2.js#COLONNES (temps, magnetisation, rang de frequence, N) */
  ising2D: [2, 3], lotkaVolterra: [2], epidemieSIR: [3], kuramoto: [2, 3], gibbsFourier: [0, 3],
  /* game96 : tam-theories-3.js#COLONNES (b et temps, r, x et temps, temps, temps, indice de bille) */
  rutherford: [2, 3], logistique: [0], chaleur: [1, 2], oscillateurForce: [2], brachistochrone: [2], galton: [2],
  /* game111 : tam-biologie.js#COLONNES (base et temps ; temps, ARN, proteine : trois grandeurs differentes) */
  adnMutations: [3, 4], dogmeCentral: [0, 2], /* game116 : dogme = (t, compte / moyenne, molecule) */
  /* game112 : generation, part, numero (3 grandeurs) ; complexe C (bien plus petit que S et P) */
  deriveGenetique: [0, 1, 2], enzyme: [0, 2], /* game116 : enzyme = (t, part, courbe) */
  /* game114 : numero de descendant ; temps, potentiel, courant (3 grandeurs) */
  mendel: [2], neurone: [0, 1, 2],
  /* game115 : numero de pas ; croise ou non ; numero de groupe ; le premier lui-meme */
  marcheAleatoire: [2], aiguilleBuffon: [2], anniversaires: [2], spiraleUlam: [2],
  /* game118 : vitesse (etiquette) ; copies, generation et numero (3 grandeurs) */
  gazParfait: [2], hardyWeinberg: [0, 1, 2],
  /* game227 : place et valeur de natures differentes ; periode (etiquette) */
  electronegativite: [2],
  /* game222 : temps et concentration de natures differentes ; part de HI (etiquette) */
  arrhenius: [2],
  /* game216 : part consommee et tension de natures differentes ; log Q (etiquette) */
  pileDaniell: [2],
  /* game214 : volume et pH de natures differentes ; part d acide (etiquette) */
  titrageAcideFaible: [2],
  /* game229 : log masse et log metabolisme de natures differentes ; mesure ou droite (etiquette) */
  loiKleiber: [2],
  /* game228 : temps et potentiel de natures differentes ; porte m (etiquette) */
  hodgkinHuxley: [2],
  /* game213 : rang et part de natures differentes ; acide amine (etiquette) */
  codeGenetique: [2],
  /* game120 : hauteur d entree (etiquette) ; position, deplacement, temps ; instant d emission (etiquette) */
  arcEnCiel: [2], cordeVibrante: [0, 1, 2], effetDoppler: [2],
  /* game122 : numero de ligne ; temps et courbe ; numero de ligne du triangle */
  lignesChamp: [2], circuitRC: [0, 2], pascalSierpinski: [2],
  /* game299 : methode et temps ; serie (etiquette) */
  reactionDonders: [2],
  /* game297 : essai et temps ; serie (etiquette) */
  essaisThorndike: [2],
  /* game292 : sinus carre et longueur ; serie (etiquette) */
  penduleKater: [2],
  /* game290 : etoiles et rayon ; serie (etiquette) */
  jaugesHerschel: [2],
  /* game289 : x et energie ; loi (etiquette) */
  constantesPlanck: [2],
  /* game288 : temperature et energie ; loi (etiquette) */
  reststrahlenRubens: [2],
  /* game287 : repere et position ; serie (etiquette) */
  etherMichelson: [2],
  /* game286 : temps et courant ; loi (etiquette) */
  emanationRutherford: [2],
  /* game285 : ligne et hauteur ; plante (etiquette) */
  maisDarwin: [2],
  /* game284 : magnitude et ouverture ; echelle (etiquette) */
  magnitudesPogson: [2],
  /* game283 : vitesse et m / e ; serie (etiquette) */
  rayonsThomson: [2],
  /* game282 : essai et part ; forme (etiquette) */
  poisMendel: [2],
  /* game281 : tour et largeur ; coquille (etiquette) */
  spiraleMoseley: [2],
  /* game280 : debit et charge ; serie (etiquette) */
  tubesHagen: [2],
  /* game279 : syllabes et mots ; corpus (etiquette) */
  syllabesKaeding: [2],
  /* game278 : rang et part ; serie (etiquette) */
  fonteMacKellar: [2],
  /* game277 : distance et temps ; phase (etiquette) */
  tempsOldham: [2],
  /* game276 : spirales a droite et a gauche ; famille (etiquette) */
  spiralesBeal: [2],
  /* game275 : annee et variation ; lieu (etiquette) */
  variationsHalley: [2],
  /* game274 : diametre et debit ; tube ou droite (etiquette) */
  tubesPoiseuille: [2],
  /* game273 : essai et rapport ; serie (etiquette) */
  unitesWeber: [2],
  /* game272 : distance et deviation ; position (etiquette) */
  aimantGauss: [2],
  /* game271 : projection et nombre ; serie (etiquette) */
  deplacementsPerrin: [2],
  /* game270 : charge et debit ; serie (etiquette) */
  filtreDarcy: [2],
  /* game269 : diametre et vitesse ; serie (etiquette) */
  critiqueReynolds: [2],
  /* game268 : courant et chaleur ; serie (etiquette) */
  effetJoule: [2],
  /* game267 : distance et torsion ou temps ; serie (etiquette) */
  balanceCoulomb: [2],
  /* game266 : temperature et grandeurs de natures differentes ; grandeur (etiquette) */
  picLummer: [2],
  /* game265 : couleur et frequence ou longueur ; colonne (etiquette) */
  ondulationsYoung: [2],
  /* game264 : niveaux et vitesse ; loi ou imprime (etiquette) */
  vitesseNyquist: [2],
  /* game263 : poids et parallaxe ; courbe ou point (etiquette) */
  parallaxeBessel: [2],
  /* game262 : lettres et mots ; groupe (etiquette) */
  motsMendenhall: [2],
  /* game261 : annee et degres ; serie (etiquette) */
  chaleurLondres: [2],
  /* game260 : age et vivants ou rente ; serie (etiquette) */
  survieHalley: [2],
  /* game259 : temps et secousses de natures differentes ; serie (etiquette) */
  repliquesOmori: [2],
  /* game258 : poids et chaleur de natures differentes ; corps ou loi (etiquette) */
  chaleursPetitDulong: [2],
  /* game257 : equivalent et masse de natures differentes ; serie (etiquette) */
  equivalentsFaraday: [2],
  /* game256 : une rose (deux coordonnees du plan) ; cause (etiquette) */
  mortaliteNightingale: [2],
  /* game255 : jours et volumes ; serie (etiquette) */
  exclusionGause: [2],
  /* game253 : rang et secondes d arc de natures differentes ; maximum, ecart ou prediction (etiquette) */
  aberrationBradley: [2],
  /* game252 : tailles de meme grandeur ; ligne, colonne ou droite (etiquette) */
  regressionGalton: [2],
  /* game251 : numero et vitesse de natures differentes ; mesure ou droite (etiquette) */
  lumiereMichelson: [2],
  /* game250 : numero et Q de meme echelle ; element ou droite (etiquette) */
  loiMoseley: [2],
  /* game249 : distance et vitesse de natures differentes ; nebuleuse ou droite (etiquette) */
  loiHubble1929: [2],
  /* game248 : age et vivants de natures differentes ; courbe (etiquette) */
  vieGraunt: [2],
  /* game247 : numero et charge de natures differentes ; groupe (etiquette) */
  gouttesMillikan: [2],
  /* game246 : annee et peaux de natures differentes ; serie ou pic (etiquette) */
  lynxHudson: [2],
  /* game245 : calcule et observe de meme grandeur ; etoile ou droite (etiquette) */
  eclipseEddington: [2],
  /* game244 : serie et equivalent de natures differentes ; materiau (etiquette) */
  equivalentJoule: [2],
  /* game243 : numero et densite de natures differentes ; fil (etiquette) */
  densiteCavendish: [2],
  /* game242 : annee et mortalite de natures differentes ; clinique (etiquette) */
  fievreSemmelweis: [2],
  /* game241 : temps et economie de natures differentes ; mesure ou courbe (etiquette) */
  oubliEbbinghaus: [2],
  /* game240 : distance sur la carte et pour cent observe ; type de paire (etiquette) */
  carteSturtevant: [2],
  /* game239 : methode et masse de natures differentes ; origine (etiquette) */
  argonRayleigh: [2],
  /* game238 : log angle et log comptage de natures differentes ; mesure ou loi (etiquette) */
  diffusionAlpha: [2],
  /* game237 : concentration et vitesse de natures differentes ; mesure ou courbe (etiquette) */
  michaelisMenten: [2],
  /* game236 : aire et especes de natures differentes ; ile ou courbe (etiquette) */
  especesAire: [2],
  /* game235 : longueur et torsion de natures differentes ; serie ou loi (etiquette) */
  loiOhm: [2],
  /* game234 : volume et pression de natures differentes ; mesure, courbe ou droite (etiquette) */
  loiBoyle: [2],
  /* game233 : 1/n^2 et 1/lambda de natures differentes ; mesure ou droite (etiquette) */
  raiesBalmer: [2],
  /* game232 : maison (etiquette) */
  choleraSnow: [2],
  /* game231 : log du temps et fraction de natures differentes ; isotope (etiquette) */
  demiViesNPL: [2],
  /* game230 : frequence et tension de natures differentes ; metal (etiquette) */
  effetPhotoelectrique: [2],
  /* game226 : annee et population de natures differentes ; mesure ou ajustement (etiquette) */
  populationMonde: [2],
  /* game225 : annee et CO2 de natures differentes ; hausse annuelle (etiquette) */
  courbeKeeling: [2],
  /* game224 : nombre de masse et B/A de natures differentes ; participation (etiquette) */
  energieLiaison: [2],
  /* game223 : temps et hauteur de natures differentes ; jour (etiquette) */
  mareeVivesEaux: [2],
  /* game221 : magnitude et log du nombre de natures differentes ; classe (etiquette) */
  gutenbergRichter: [2],
  /* game220 : log rang et log compte de natures differentes ; residu (etiquette) */
  loiZipf: [2],
  /* game219 : altitude et pression de natures differentes ; temperature (etiquette) */
  atmosphereStandard: [2],
  /* game218 : rang et surprise de natures differentes ; longueur de code (etiquette) */
  entropieShannon: [2],
  /* game217 : pas et ecart de natures differentes ; numero du pas (etiquette) */
  gammeTemperee: [2],
  /* game212 : x et y de la fourmi de meme nature ; couleur (etiquette) */
  fourmiLangton: [2],
  /* game211 : rang et ecart de natures differentes ; signe (etiquette) */
  suitePadovan: [2],
  /* game210 : x et y de la tortue de meme nature ; bit (etiquette) */
  thueMorse: [2],
  /* game209 : n et reste relatif de natures differentes ; premier (etiquette) */
  suitePerrin: [2],
  /* game208 : rang et proportion de natures differentes ; terme (etiquette) */
  suiteKolakoski: [2],
  /* game207 : rang et terme de natures differentes ; sens du saut (etiquette) */
  suiteRecaman: [2],
  /* game206 : position et valeur relative de natures differentes ; ligne (etiquette) */
  triangleNarayana: [2],
  /* game205 : abscisse et hauteur de natures differentes ; sorte de pas (etiquette) */
  schroderChemins: [2],
  /* game204 : deux pieces de meme nature ; montants impossibles (etiquette) */
  frobeniusPieces: [2],
  /* game203 : pair et nombre de facons de natures differentes ; reste mod 3 (etiquette) */
  goldbachPaires: [2],
  /* game202 : n et rapport de natures differentes ; facteurs premiers (etiquette) */
  indicatriceEuler: [2],
  /* game201 : module et periode de natures differentes ; zeros (etiquette) */
  periodePisano: [2],
  /* game200 : pas et hauteur de natures differentes ; sorte de pas (etiquette) */
  motzkinChemins: [2],
  /* game199 : element et bloc de natures differentes ; blocs ouverts (etiquette) */
  stirlingBell: [2],
  /* game198 : depart et pas de natures differentes ; chiffres differents (etiquette) */
  routineKaprekar: [2],
  /* game197 : depart et vol de natures differentes ; pas impairs (etiquette) */
  suiteCollatz: [2],
  /* game196 : rang et ecart de natures differentes ; puissance de 2 (etiquette) */
  nombresHarmoniques: [2],
  /* game195 : objet et image de meme nature ; deplacement (etiquette) */
  derangements: [2],
  /* game194 : rang et longueur de natures differentes ; chiffres (etiquette) */
  regarderDire: [2],
  /* game193 : temps et disque de natures differentes ; piquet (etiquette) */
  toursHanoi: [2],
  /* game192 : position et niveau de natures differentes ; > 1 (etiquette) */
  calkinWilf: [2],
  /* game191 : colonne et ligne de meme nature ; reste (etiquette) */
  theoremeLucas: [2],
  /* game190 : indice et n de natures differentes ; termes (etiquette) */
  zeckendorf: [2],
  /* game189 : x et y de meme nature ; ordre (etiquette) */
  problemeJosephus: [2],
  /* game188 : n et log |B| de natures differentes ; signe (etiquette) */
  nombresBernoulli: [2],
  /* game187 : n et s(n)/n de natures differentes ; nature (etiquette) */
  parfaitsAmicaux: [2],
  /* game186 : n et M(n) de natures differentes ; mu (etiquette) */
  fonctionMertens: [2],
  /* game185 : n et reste de natures differentes ; premier (etiquette) */
  theoremeWilson: [2],
  /* game184 : n et son facteur de natures differentes ; nature (etiquette) */
  nombresCarmichael: [2],
  /* game183 : rang et valeur de natures differentes ; signe (etiquette) */
  equationPell: [2],
  /* game182 : a et b de meme nature ; a^2 + b^2 (etiquette) */
  sommesCarres: [2],
  /* game181 : x et y de meme nature ; nature du trait (etiquette) */
  ptolemee: [2],
  /* game180 : x et y de meme nature ; nature du trait (etiquette) */
  pascalHexagramme: [2],
  /* game179 : x et y de meme nature ; couleur (etiquette) */
  ramseyR33: [2],
  /* game178 : x et y de meme nature ; nature du trait (etiquette) */
  triangulations: [2],
  /* game177 : colonne et ligne de meme nature ; cote (etiquette) */
  distinctesImpaires: [2],
  /* game176 : x et y de meme nature ; nature du trait (etiquette) */
  simsonDroite: [2],
  /* game175 : n et valeur de natures differentes ; courbe (etiquette) */
  bale: [2],
  /* game174 : x et y de meme nature ; nature du trait (etiquette) */
  morley: [2],
  /* game172 : x, y, z de meme nature (aretes du solide) */
  eulerSolides: [],
  /* game171 : x et y de meme nature ; numero du pas (etiquette) */
  marcheAutoEvitante: [2],
  /* game170 : x et y de meme nature ; generation (etiquette) */
  jeuDeLaVie: [2],
  /* game169 : x et y de meme nature ; cercle (etiquette) */
  feuerbach: [2],
  /* game168 : x et y de meme nature ; nature du trait (etiquette) */
  billardElliptique: [2],
  /* game167 : x et y de meme nature ; nature du trait (etiquette) */
  napoleon: [2],
  /* game166 : x et y de meme nature ; amas (etiquette) */
  percolationLiens: [2],
  /* game165 : x et y de meme nature ; nature du point (etiquette) */
  theoremePick: [2],
  /* game164 : x et y de meme nature ; pli (etiquette) */
  courbeDragon: [2],
  /* game163 : colonne et ligne de meme nature ; numero de ligne (etiquette) */
  partitionEuler: [2],
  /* game162 : pas, hauteur, chemin : trois grandeurs differentes */
  catalanDyck: [0, 1, 2],
  /* game161 : coups, fortune, partie : trois grandeurs differentes */
  ruineJoueur: [0, 1, 2],
  /* game160 : tirages, vignettes, collection : trois grandeurs differentes */
  collectionneur: [0, 1, 2],
  /* game159 : x et y de meme nature ; fleche (etiquette) */
  aztecDiamond: [2],
  /* game158 : x et y de meme nature ; spin (etiquette) */
  ising: [2],
  /* game157 : x et y de meme nature ; domino (etiquette) */
  dominosKasteleyn: [2],
  /* game155 : flux, energie, denominateur : trois grandeurs differentes */
  papillonHofstadter: [0, 1, 2],
  /* game154 : x et y de meme nature ; quoi (etiquette) */
  causticTasse: [2],
  /* game153 : x et y de meme nature ; reseau (etiquette) */
  fermatSteiner: [2],
  /* game152 : x et y de meme nature ; denominateur (etiquette) */
  cerclesFord: [2],
  /* game151 : a et b de meme nature ; rangee (etiquette) */
  vergerEuclide: [2],
  /* game150 : x et y de meme nature ; grains (etiquette) */
  tasDeSable: [2],
  /* game148 : x et y de meme nature ; generation (etiquette) */
  apollonius: [2],
  /* game123 : numero du choc ; numero de masse et temps */
  billardPi: [2], modesNormaux: [0, 2],
  /* game124 : angle de tir (etiquette) ; solides : x, y, z de meme nature */
  paraboleTir: [2],
  /* game125 : volume, pression, branche (3 grandeurs) ; parties et strategie ; numero de rayon */
  carnot: [0, 1, 2], montyHall: [0, 2], lentilleMince: [2],
  /* game126 : angle, vitesse, temps (3 grandeurs) ; phase (etiquette) */
  penduleAmplitude: [0, 1, 2], phasesLune: [2],
  /* game127 : jour, heures (2 grandeurs) + etiquette ; temps, distance + etiquette */
  dureeJour: [0, 1, 2], courseRoulante: [0, 1, 2],
  /* game133 : longueur d onde + etiquette (la luminance est dans ECHELLE_ETENDUE) */
  corpsNoir: [0, 2],
  /* game134 : direction, intensite (2 grandeurs) + etiquette */
  reseauFentes: [0, 1, 2],
  /* game135 : x et y de meme nature ; numero de rayon (etiquette) */
  refractionSnell: [2],
  /* game136 : temps, atomes (2 grandeurs) + etiquette */
  desintegration: [0, 1, 2],
  /* game137 : x et y en mm (meme grandeur) ; intensite (autre grandeur) */
  anneauxNewton: [2],
  /* game149 : deux angles du ciel (meme grandeur) ; chemin (etiquette) */
  haloGlace: [2],
  /* game146 : angle, vitesse, temps (3 grandeurs) */
  kapitza: [0, 1, 2],
  /* game145 : x et y de meme nature ; temps */
  penduleRessort: [2],
  /* game144 : angle, inclinaison, temps (3 grandeurs) */
  toupie: [0, 1, 2],
  /* game142 : vitesse, angle, temps (3 grandeurs) */
  perleCerceau: [0, 1, 2],
  /* game141 : x et y de meme nature ; temps (autre grandeur) */
  echelleGlisse: [2],
  /* game140 : x et y de meme nature ; courbe (etiquette) */
  chainette: [2],
  /* game139 : temps, distance le long de la courbe (2 grandeurs) + etiquette */
  tautochrone: [0, 1, 2],
  /* game138 : temps, ecart (2 grandeurs) + etiquette */
  pendulesCouples: [0, 1, 2],
  /* game113 : tam-chimie.js#COLONNES (temps ; temps ; temps) */
  reactionsChaine: [0, 2], equilibreChimique: [2], brusselator: [2], /* game116 : chaine = (t, part, espece) */
};
/** les moyennes et le facteur de chaque colonne : z = (x - m) x k — la vue, les octets mintes et le decor en partent tous */
export function echelleIso(brut, n, D, id) {
  const m = new Float64Array(D), s = new Float64Array(D), k = new Float64Array(D), propre = new Set(ECHELLE_PROPRE[id] || []), etendue = new Set(ECHELLE_ETENDUE[id] || []);
  let sMax = 0;
  for (let j = 0; j < D; j++) {
    let a = 0; for (let i = 0; i < n; i++) a += brut[i * D + j]; m[j] = a / n;
    let v = 0; for (let i = 0; i < n; i++) { const w = brut[i * D + j] - m[j]; v += w * w; }
    s[j] = Math.sqrt(v / n); if (!propre.has(j) && !etendue.has(j) && s[j] > sMax) sMax = s[j];
  }
  for (let j = 0; j < D; j++) {
    if (etendue.has(j)) { let lo = Infinity, hi = -Infinity; for (let i = 0; i < n; i++) { const x = brut[i * D + j]; if (x < lo) lo = x; if (x > hi) hi = x; } k[j] = hi > lo ? Math.sqrt(12) / (hi - lo) : 0; continue; }
    const d = propre.has(j) ? s[j] : sMax; k[j] = d > 0 ? 1 / d : 0;
  }
  return { m, k };
}
export function standardiserIso(brut, n, D, id) {
  const z = new Float64Array(n * D), { m, k } = echelleIso(brut, n, D, id);
  for (let i = 0; i < n; i++) for (let j = 0; j < D; j++) z[i * D + j] = (brut[i * D + j] - m[j]) * k[j];
  return z;
}
/* le tri Morton d un nuage : la MEME cle que tam-moteur.js#morton (10 bits de poids fort par axe) */
function morton(x, y, z, q) {
  let k = 0; const s = q - 10;
  for (let b = 9; b >= 0; b--) k = k * 8 + (((x >> s) >> b & 1) << 2 | ((y >> s) >> b & 1) << 1 | ((z >> s) >> b & 1));
  return k;
}
/** la simulation, puis la vue stockee (points quantifies, comme generer du moteur) */
export function genererScience(P) { return genererDepuis(P, null); }
/* oPre : la sortie de simuler deja calculee par la validation (memes P.science, P.params) ; null = simuler ici */
function genererDepuis(P, oPre) {
  const s = systeme(P.science); if (!s) return { bornee: false, raison: 'science inconnue' };
  const o = oPre || s.mod.simuler(P.science, P.params);
  if (!o.bornee || !o.brut) return { ...o, bornee: false };
  const n = o.n, D = o.D, M = (1 << P.q) - 1, ordre = estNuage(P, o) ? 1 : 0;
  let fin = CORPS[P.science] ? vueCorps(o, CORPS[P.science]).vue : projeterND(standardiserIso(o.brut, n, D, P.science), n, D, P.angles);
  /* game79 : une science MELANGEE a un motif (somme ou composition, comme les attracteurs) */
  if (P.melange) fin = vueMelangee(fin, n, P.melange);
  let pts = new Int32Array(n * 3);
  for (let i = 0; i < 3 * n; i++) { const v = Math.round((fin[i] + 1) / 2 * M); pts[i] = v < 0 ? 0 : v > M ? M : v; }
  if (ordre === 1) {
    const idx = Array.from({ length: n }, (_, i) => i), cle = idx.map((i) => morton(pts[3 * i], pts[3 * i + 1], pts[3 * i + 2], P.q));
    idx.sort((a, b) => cle[a] - cle[b] || a - b);
    const t = new Int32Array(n * 3); idx.forEach((src, d) => { t[3 * d] = pts[3 * src]; t[3 * d + 1] = pts[3 * src + 1]; t[3 * d + 2] = pts[3 * src + 2]; }); pts = t;
  }
  return { ...o, points: pts, q: P.q, ordre };
}
/* ---------- game128 : science x science ----------
 * Le partenaire d un melange peut etre une autre science (a ses reglages par defaut), plus seulement un motif fractal.
 *   somme       : (1 - w) A + w B, point a point (les deux vues normalisees, memes n)
 *   croise      : (game131) A CONTRE B — x = x_A, y = x_B (le premier axe de chacun, au meme instant i), z = (1 - w) z_A + w z_B ;
 *                 deux systemes rythmes ensemble dessinent une figure de Lissajous ; l ordre reste le temps des deux.
 *   composition : A PILOTE B — le point i prend le point de B d indice floor(u_i n), u_i = frac(97 (x_A + 1) / 2) (comme les motifs),
 *                 et z = (1 - w) z_B + w z_A ; un nuage (l ordre des points n est plus le temps).
 * Exclus : les systemes a plusieurs corps (dessines seuls) et les non-mintables (trop chers a certifier). */
export const PARTENAIRES = Object.freeze(SYSTEMES.map((s) => s.id).filter((id) => !CORPS[id] && !NON_MINTABLES.has(id)));
/** game130 : null si les reglages du partenaire sont acceptables, sinon la raison. Complets, deja bornes (le module ne les ramene pas),
 *   differents des defauts, et passes par les gardes de cout du systeme (la route publique ne commande pas de calcul cher). */
export function reglagesPartenaireValides(id, params) {
  const s = systeme(id); if (!s) return 'science partenaire';
  if (!params || typeof params !== 'object' || Array.isArray(params)) return 'reglages du partenaire';
  if (Object.keys(params).sort().join() !== Object.keys(s.params).sort().join()) return 'reglages du partenaire incomplets';
  if (GARDES_COUT[id]) { const g = GARDES_COUT[id](params); if (g) return g; }
  if (id === 'fusionTrousNoirs' && !(coutFusion(params) >= FUSION_PRODUIT_MIN)) return 'partner too costly to certify here';
  if (canon(params) === canon(s.params)) return 'reglages du partenaire = ses defauts (omettre params)';
  let o; try { o = s.mod.simuler(id, params, { n: 2 }); } catch (_) { return 'reglages du partenaire refuses par le module'; }
  if (canon(o.params) !== canon(params)) return 'reglages du partenaire hors bornes (le module les ramene)';
  return null;
}
const vuesPartenaires = new Map();
export function vuePartenaire(id, n, params = null) {
  const k = id + ':' + n + ':' + (params ? canon(params) : ''); if (vuesPartenaires.has(k)) return vuesPartenaires.get(k);
  const s = systeme(id), o = s.mod.simuler(id, params || {}, { n });
  /* 09/11: a subject may draw its OWN count (emotionWiringHCP): fewer points than asked are cycled to n, more are cut at n (the view is n points) */
  let brut = o.brut;
  if (brut && o.n !== n && o.n > 0) { brut = new Float64Array(n * o.D); for (let k = 0; k < n; k++) for (let c = 0; c < o.D; c++) brut[o.D * k + c] = o.brut[o.D * (k % o.n) + c]; }
  const v = o.bornee && brut ? normaliser3(projeterND(standardiserIso(brut, n, o.D, id), n, o.D, anglesDefaut(o.D))) : null;
  if (vuesPartenaires.size > 64) vuesPartenaires.clear();
  vuesPartenaires.set(k, v); return v;
}
function normaliser3(a) { // centre milieu, echelle commune -> [-1, 1] (la MEME regle que tam-moteur.js#normaliser)
  const n = a.length / 3, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { const v = a[3 * i + c]; if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; }
  const r = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2, s = r > 0 ? 1 / r : 0;
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) a[3 * i + c] = (a[3 * i + c] - (lo[c] + hi[c]) / 2) * s;
  return a;
}
/** la vue melangee : un motif (tam-moteur) ou une science partenaire ; proj = vue n x 3 de la science porteuse */
export function vueMelangee(proj, n, m) {
  if (!m.science) return melangerVue(proj, n, m);
  const B = vuePartenaire(m.science, n, m.params || null), out = new Float64Array(n * 3), w = m.w;
  if (!B) return Float64Array.from(proj);
  if (m.operateur === 'somme') for (let i = 0; i < 3 * n; i++) out[i] = (1 - w) * proj[i] + w * B[i];
  else if (m.operateur === 'croise') for (let i = 0; i < n; i++) { out[3 * i] = proj[3 * i]; out[3 * i + 1] = B[3 * i]; out[3 * i + 2] = (1 - w) * proj[3 * i + 2] + w * B[3 * i + 2]; }
  else for (let i = 0; i < n; i++) { const x = (proj[3 * i] + 1) * 0.5 * 97, u = x - Math.floor(x), j = Math.min(n - 1, Math.floor(u * n)); out[3 * i] = B[3 * j]; out[3 * i + 1] = B[3 * j + 1]; out[3 * i + 2] = (1 - w) * B[3 * j + 2] + w * proj[3 * i + 2]; }
  return normaliser3(out);
}
/** n importe qui, avec les params publics, recalcule les memes octets */
export function rejouerScience(P) {
  const { v, o: oV } = validerEtSimuler(P); if (!v.ok) return { ok: false, raisons: [v.raison] };
  return rejouerApres(P, oV);
}
/* la fin du rejeu, P DEJA valide et oV sa simulation : generer, encoder, hacher */
function rejouerApres(P, oV) {
  const o = genererDepuis(P, oV); if (!o.bornee) return { ok: false, raisons: ['the simulation left its valid domain'] };
  const octets = encoder({ q: o.q, ordre: o.ordre, points: o.points });
  return { ok: true, octets, hash: keccak256Hex(octets), oeuvre: o };
}
/* ---------- game79 : le CERVEAU choisit parmi TOUTES les sciences, et ecrit ce qu il a mesure ---------- */
/* un tirage deterministe a partir d une empreinte (mulberry32 sur 32 bits de keccak) : rejouable par n importe qui */
function tirage(empreinte) {
  let a = parseInt(String(empreinte).slice(2, 10), 16) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const entier = (r) => Number.isInteger(r.min) && Number.isInteger(r.max) && Number.isInteger(r.valeur) && /^(n|l|m|k|nombre|graine|tours|maxIter|puissance|periodes|groupe)$/.test(r.nom);
/** des params tires UNIFORMEMENT dans les bornes de chaque variable (entiers arrondis), puis bornes par le module (l <= n-1…) */
export function tirerParams(id, alea) {
  const s = systeme(id); if (!s) throw new Error('science inconnue: ' + id);
  const R = s.mod.reglagesPhysique(id, s.mod.simuler(id, {}).params), p = {};
  for (const r of R) { let v = r.min + alea() * (r.max - r.min); if (entier(r)) v = Math.round(v); p[r.chemin.replace(/^params\./, '')] = Math.round(v * 1e6) / 1e6; }
  return s.mod.simuler(id, p).params;
}
/**
 * Le choix du cerveau parmi les sciences : graine (bloc + tirage) et etat du cerveau -> une science, ses variables au hasard dans leurs
 * bornes, un melange une fois sur trois ; le premier essai qui passe les certificats. Deterministe : memes entrees, meme oeuvre.
 * @returns {{ ok, params, certificats, essai, rejets }}
 */
export function choisirScience({ graine, etatCerveau = null, existantes = [], minteur = null, essais = 8, ids = null } = {}) {
  if (!H32.test(String(graine || ''))) throw new Error('graine invalide');
  const liste = (ids && ids.length ? ids : SYSTEMES.map((s) => s.id)).filter((id) => systeme(id));
  const base = keccak256Hex(new TextEncoder().encode(String(graine) + '|' + canon(etatCerveau)));
  const rejets = [];
  for (let e = 0; e < essais; e++) {
    const alea = tirage(keccak256Hex(new TextEncoder().encode(base + ':' + e)));
    const id = liste[Math.floor(alea() * liste.length) % liste.length];
    let P;
    try { P = paramsScience(id, tirerParams(id, alea), { minteur }); } catch (_) { rejets.push({ essai: e, id, raison: 'module' }); continue; }
    /* revue game79 (high) : JAMAIS de melange sur un systeme a plusieurs corps (la page dessine les corps seuls : octets differents) */
    if (!CORPS[id] && alea() < 1 / 3) {
      /* game128 : le partenaire est un motif OU une autre science (meme tirage : un indice dans motifs + sciences, la science elle-meme exclue) */
      const autres = PARTENAIRES.filter((x) => x !== id), k = Math.floor(alea() * (MOTIFS_MELANGE.length + autres.length)) % (MOTIFS_MELANGE.length + autres.length);
      /* game131 : avec une science partenaire, trois operateurs (croise compris) ; avec un motif, les deux d avant */
      const u = alea(), operateur = k >= MOTIFS_MELANGE.length ? (u < 1 / 3 ? 'somme' : u < 2 / 3 ? 'composition' : 'croise') : u < 0.5 ? 'somme' : 'composition', w = Math.round((BORNES.w[0] + alea() * (BORNES.w[1] - BORNES.w[0])) * 1e6) / 1e6;
      if (k < MOTIFS_MELANGE.length) { const [f, v] = MOTIFS_MELANGE[k]; P.melange = { operateur, motif: motifDefaut(f, v), w }; }
      else P.melange = { operateur, science: autres[k - MOTIFS_MELANGE.length], w };
    }
    P.graine = String(graine).toLowerCase();
    const c = certifierScience(P, existantes);
    if (c.ok) return { ok: true, params: P, certificats: c, essai: e, rejets };
    if (c.etat === 'NON_LU') return { ok: false, etat: 'NON_LU', pourquoi: (c.raisons || []).join('; '), rejets };
    rejets.push({ essai: e, id, raison: (c.raisons || []).join('; ') });
  }
  return { ok: false, etat: 'AUCUNE', rejets };
}
/* un nombre court pour la note (sans exposant inutile) */
const court = (x) => (typeof x !== 'number' || !Number.isFinite(x) ? String(x) : x === 0 ? '0' : Math.abs(x) >= 1e-3 && Math.abs(x) < 1e6 ? String(Math.round(x * 1e4) / 1e4) : x.toExponential(2));
/**
 * Ce que le cerveau ECRIT : ce qu il a choisi, ce qu il a MESURE (invariants contre la theorie, lambda), et sa conclusion — des faits,
 * jamais une promesse. ASCII + quelques symboles, <= NOTE_MAX. Stocke on-chain dans les params QUAND quelqu un minte l oeuvre.
 */
export function noteCerveau(P, { nomCerveau = null, humeur = null, ressenti = null, battement = null } = {}) {
  const s = systeme(P.science); if (!s) return '';
  const o = s.mod.simuler(P.science, P.params), morceaux = [];
  morceaux.push((nomCerveau ? nomCerveau + "'s brain" : 'The brain') + (humeur ? ' (' + humeur + (ressenti ? ', ' + ressenti : '') + (battement !== null ? ', beat ' + battement : '') + ')' : '') + ' chose ' + s.nom + '.');
  const vars = Object.entries(P.params).slice(0, 6).map(([k, v]) => k + '=' + court(v)).join(' ');
  if (vars) morceaux.push('Variables: ' + vars + '.');
  /* (l operateur MATHEMATIQUE du melange, joint par un tableau — jamais concatene comme un nom de wallet, cf. test-no-fee-address-shown) */
  if (P.melange) morceaux.push('Blended with ' + (P.melange.science ? 'the system ' + P.melange.science : [P.melange.motif.famille, P.melange.motif.variante].filter(Boolean).join(' ')) + ' (' + [P.melange.operateur, 'w=' + court(P.melange.w)].join(', ') + ').');
  let conserve = 0, varie = 0, compare = null;
  for (const [k, v] of Object.entries(o.invariants || {})) {
    /* game114 (banc : la graine 20 tombait sur fluctuationsVide, dont la 1re mesure est un TABLEAU de 40 variances : la note le recopiait
     *   en entier, depassait 700 caracteres et perdait sa « Conclusion » — note ecrite on-chain) : seule une mesure et une reference
     *   NUMERIQUES finies sont citees */
    if (v && typeof v === 'object' && 'mesure' in v && ('formule' in v || 'theorie' in v)) { const ref = 'formule' in v ? v.formule : v.theorie;
      if (!compare && typeof v.mesure === 'number' && Number.isFinite(v.mesure) && typeof ref === 'number' && Number.isFinite(ref)) compare = k + ' measured ' + court(v.mesure) + ' vs ' + court(ref); }
    else if (v && typeof v === 'object' && 'derive' in v) { const ref = Math.abs(v.debut ?? 0), rel = ref > 1e-12 ? Math.abs(v.derive) / ref : Math.abs(v.derive); if (rel <= 1e-3) conserve++; else varie++; }
  }
  if (compare) morceaux.push('Check: ' + compare + '.');
  if (conserve || varie) morceaux.push(conserve + ' conserved quantit' + (conserve === 1 ? 'y' : 'ies') + ' held' + (varie ? ', ' + varie + ' varied' : '') + '.');
  const lam = typeof o.lyapunov === 'number' && Number.isFinite(o.lyapunov) ? o.lyapunov : null;
  morceaux.push(lam === null ? 'Conclusion: a ' + (estNuage(P, o) ? 'probability or sample cloud' : 'regular law') + ', no chaos measure applies.'
    : lam > 0.02 ? 'Conclusion: chaotic over this run (lambda ' + court(lam) + ' > 0.02): nearby starts split apart.'
      : 'Conclusion: regular over this run (lambda ' + court(lam) + ' <= 0.02): nearby starts stay together.');
  /* revue game79 : l ellipse d une adresse courte (« 0xb200…bbe3 ») devient « ... » AVANT le filtre ASCII — sinon les deux moitiees
   *   collees fabriquaient un faux identifiant hexadecimal (« 0xb200bbe3 ») ecrit on-chain */
  let t = morceaux.join(' ').replace(/…/g, '...').replace(/[^\x20-\x7e]/g, '');
  if (t.length > NOTE_MAX) t = t.slice(0, NOTE_MAX - 1) + '.';
  return t;
}
/** les certificats d une science : bornes, bornee, distincte de TOUTES les oeuvres mintees (une signature illisible -> NON_LU) */
export function certifierScience(P, existantes = []) {
  const { v, o: oV } = validerEtSimuler(P);
  if (!v.ok) return { ok: false, etat: 'REFUSE', codes: ['HORS_BORNES'], raisons: [v.raison] };
  const r = rejouerApres(P, oV);
  if (!r.ok) return { ok: false, etat: 'REFUSE', codes: ['DIVERGE'], raisons: r.raisons };
  const sig = signature(r.oeuvre.points, r.oeuvre.q);
  let dmin = 1, nonLues = 0;
  for (const e of existantes) {
    const s = e && (e.signature || e);
    if (!s || typeof s.length !== 'number' || s.length !== 512) { nonLues++; continue; }
    const d = distance(sig, s); if (!(d >= 0)) { nonLues++; continue; } if (d < dmin) dmin = d;
  }
  const codes = [], raisons = [];
  if (nonLues > 0) { codes.push('SIGNATURE_NON_LUE'); raisons.push('a minted work could not be read, so distinctness is not measured'); }
  else if (dmin < SEUIL_DISTINCT) { codes.push('DOUBLON'); raisons.push('too close to a minted work (distance ' + (Math.round(dmin * 100) / 100) + ', minimum ' + SEUIL_DISTINCT + ')'); }
  return { ok: codes.length === 0, etat: nonLues > 0 ? 'NON_LU' : codes.length ? 'REFUSE' : 'CERTIFIE', bornee: true, distanceMin: dmin, signaturesNonLues: nonLues,
    lyapunov: typeof r.oeuvre.lyapunov === 'number' ? r.oeuvre.lyapunov : NaN, uniteLyapunov: r.oeuvre.uniteLyapunov, codes, raisons, signature: sig, octets: r.octets, hash: r.hash };
}
