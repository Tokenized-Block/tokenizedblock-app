/* rolls-regles.js — LES REGLES VIVANTES DE BLOCKROLLS (audit rolls-duels 2026-10-24). Les gains par score et le score minimum ne sont PAS
 *   des immuables : setRules(prize5, prize4, prize3, prize2, minScore) les change (contracts/src/BlockRolls.sol:193-200), SEUL le createur de
 *   UNIT le peut (unitCreator(), lu au hook a chaque appel), chaque prix borne par MAX_PRIZE, et chaque roll garde la version des regles de SA
 *   creation (un changement ne touche que les rolls crees apres). Avant ce module, /api/tirage servait les valeurs du CONSTRUCTEUR (la fiche
 *   de deploiement) : apres un setRules, chaque texte d avant signature aurait dit des montants que le contrat ne paie pas.
 * Ce module : les eth_call (currentRules, rulesVersion, unitCreator, MAX_PRIZE), leur decodage STRICT (une reponse qui n est pas exactement la
 *   forme attendue -> null, jamais un chiffre devine), une lecture complete (version relue avant ET apres les regles : un setRules entre les
 *   deux -> echec, pas un melange), un cache borne dans le temps pour le serveur, et les phrases d ecran (anglais, chiffres lus seulement).
 * ⛔ Une lecture ratee rend null : l app dit « could not be read », elle ne retombe JAMAIS sur la fiche.
 * PUR sauf `lireReglesRolls` (qui recoit `rpc`) : aucune cle, aucun envoi. */
import { selecteur } from './keccak.js';

const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x || '').toLowerCase();
export const SIG_REGLES = 'currentRules()';
export const SIG_VERSION = 'rulesVersion()';
export const SIG_CREATEUR = 'unitCreator()';
export const SIG_MAX_PRIZE = 'MAX_PRIZE()';
export const MIN_SCORE_PLANCHER = 2; /* MIN_SCORE_FLOOR du contrat */
export const appelRegles = () => selecteur(SIG_REGLES);
export const appelVersion = () => selecteur(SIG_VERSION);
export const appelCreateur = () => selecteur(SIG_CREATEUR);
export const appelMaxPrize = () => selecteur(SIG_MAX_PRIZE);

/* une reponse eth_call -> ses mots de 32 octets ; null si ce n est pas exactement n mots hexadecimaux */
function mots(hex, n) {
  const s = String(hex || '').replace(/^0x/i, '');
  if (s.length !== 64 * n || !/^[0-9a-f]*$/i.test(s)) return null;
  return s.match(/.{64}/g).map((w) => BigInt('0x' + w));
}
/** un mot uint ; null sinon */
export function lireMot(hex) { const m = mots(hex, 1); return m ? m[0] : null; }
/** rulesVersion() (uint16) ; null sinon */
export function lireVersion(hex) { const v = lireMot(hex); return v !== null && v >= 1n && v <= 65535n ? Number(v) : null; }
/** unitCreator() ; null si ce n est pas une adresse, ou si c est l adresse nulle (le contrat la rend quand le hook ne repond pas) */
export function lireAdresse(hex) {
  const v = lireMot(hex);
  if (v === null || v >> 160n !== 0n || v === 0n) return null;
  return '0x' + v.toString(16).padStart(40, '0');
}
/** les regles bornees comme _rulesOk du contrat : p2 <= p3 <= p4 <= p5 (<= max s il est connu), minScore 2..5 */
export function reglesValides(r, maxPrize = null) {
  if (!r || !Array.isArray(r.prizes) || r.prizes.length !== 4 || !Number.isInteger(r.minScore)) return false;
  let p; try { p = r.prizes.map((x) => BigInt(x)); } catch (_) { return false; }
  const [p5, p4, p3, p2] = p;
  if (p2 < 0n || p2 > p3 || p3 > p4 || p4 > p5) return false;
  if (maxPrize !== null && maxPrize !== undefined && p5 > BigInt(maxPrize)) return false;
  return r.minScore >= MIN_SCORE_PLANCHER && r.minScore <= 5;
}
/** currentRules() -> { prizes: [p5, p4, p3, p2] (chaines brutes USDC), minScore } ; null si la forme ou les bornes ne sont pas celles du contrat */
export function lireRegles(hex) {
  const m = mots(hex, 5);
  if (!m || m[4] > 255n) return null;
  const r = { prizes: m.slice(0, 4).map((x) => x.toString()), minScore: Number(m[4]) };
  return reglesValides(r) ? r : null;
}

/** LA lecture : { prizes, minScore, version, createur, maxPrize } ; LEVE si les regles ou leur version ne sont pas lues (ou ont change pendant
 *  la lecture). createur / maxPrize : null s ils ne sont pas lus (les regles restent valables sans eux). */
export async function lireReglesRolls({ rpc, contrat }) {
  const c = bas(contrat);
  if (!ADR.test(c) || typeof rpc !== 'function') throw new Error('BlockRolls: no contract to read');
  const appel = (data) => rpc('eth_call', [{ to: c, data }, 'latest']);
  const v1 = lireVersion(await appel(appelVersion()));
  const r = lireRegles(await appel(appelRegles()));
  const v2 = lireVersion(await appel(appelVersion()));
  if (v1 === null || r === null || v1 !== v2) throw new Error('BlockRolls: the rules could not be read');
  let createur = null, maxPrize = null;
  try { createur = lireAdresse(await appel(appelCreateur())); } catch (_) { createur = null; }
  try { const x = lireMot(await appel(appelMaxPrize())); maxPrize = x === null ? null : x.toString(); } catch (_) { maxPrize = null; }
  if (maxPrize !== null && !reglesValides(r, maxPrize)) throw new Error('BlockRolls: the rules read are above MAX_PRIZE');
  return { ...r, version: v1, createur, maxPrize };
}

/** un cache pour le SERVEUR : une lecture au plus toutes les ttlMs (echecMs apres un echec) ; servi() rend la derniere lecture REUSSIE de
 *  moins de perimeMs (avec son heure, `lu`), sinon null — jamais une valeur plus vieille, jamais la fiche. */
export function creerCacheRegles({ lire, ttlMs = 30000, echecMs = 10000, perimeMs = 120000, maintenant = () => Date.now() } = {}) {
  const st = { val: null, luOk: 0, essai: 0, ok: false, enVol: null };
  return {
    rafraichir() {
      if (st.enVol) return st.enVol;
      const t = maintenant();
      if (st.essai && t - st.essai < (st.ok ? ttlMs : echecMs)) return Promise.resolve();
      st.essai = t;
      st.enVol = Promise.resolve().then(() => lire())
        .then((v) => { st.val = v; st.luOk = maintenant(); st.ok = true; }, () => { st.ok = false; })
        .finally(() => { st.enVol = null; });
      return st.enVol;
    },
    servi() {
      if (!st.val || maintenant() - st.luOk > perimeMs) return null;
      return { ...st.val, lu: new Date(st.luOk).toISOString() };
    },
  };
}

/* ---------------------------------------------------------------- les phrases (chiffres LUS seulement) */
export const PHRASE_GAINS_NON_LUS = 'The prizes could not be read just now';
/** les paliers qui paient, du plus haut : [{ score, brut }] (un score sous minScore ne paie rien) ; null si les regles ne sont pas valides */
export function paliers(r) {
  if (!reglesValides(r)) return null;
  return [5, 4, 3, 2].map((score, i) => ({ score, brut: BigInt(r.prizes[i]) })).filter((p) => p.score >= r.minScore);
}
/** « 5/5 → 5.00, 4/5 → 3.00, 3/5 → 1.00, 2/5 → 0.50 USDC » (fmt = le formateur USDC de la page) ; null si non lues */
export function texteGains(r, fmt) {
  const p = paliers(r);
  return p ? p.map((x) => x.score + '/5 → ' + fmt(x.brut)).join(', ') + ' USDC' : null;
}
/** le plus gros prix (5/5), brut ; null si non lu */
export const gainMax = (r) => (reglesValides(r) ? BigInt(r.prizes[0]) : null);
/** game367 (live audit 2026-11-11: the tile said "win up to 5" while the pot held 0.25 and BlockRolls.sol pays min(prize, pot)): the largest
 *  win a roll can REALLY pay now = min(the 5/5 prize, the pot read). { brut, plafonne } ; null if the prize is unread. A pot not read leaves
 *  the prize (plafonne false) — never a 0 invented. */
export function gainMaxReel(r, pot) {
  const pz = gainMax(r);
  if (pz === null) return null;
  let p = null; try { p = pot === null || pot === undefined ? null : BigInt(pot); } catch (_) { p = null; }
  return p !== null && p < pz ? { brut: p, plafonne: true } : { brut: pz, plafonne: false };
}
/** la phrase d AVANT signature : les gains lus a l instant, ou qu ils n ont pas pu l etre (aucun montant montre) */
export function phraseGainsAvantSignature(r, fmt) {
  const t = texteGains(r, fmt);
  return t ? ' Prizes now: ' + t + '; under ' + r.minScore + '/5 nothing (read on the contract just now).'
    : ' ' + PHRASE_GAINS_NON_LUS + ' — no prize amount is shown; the contract pays the prizes in force when you roll.';
}
