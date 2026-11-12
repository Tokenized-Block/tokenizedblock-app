/* jeu-agent.js — LE GAME POUR UN AGENT (le MCP du brain, et les commandes ecrites du panneau) : l etat du jeu, et les appels NON SIGNES
 * d un roll (planRolls / planRollsAvecPass), d un settle (planSettleMany + etatReglement) et d une mission (planPoster).
 *
 * ⛔ POURQUOI (Phil, 2026-10-18 09:00) : « re-enregistrer toutes ces paths pour qu elles puissent etre utilisees par le MCP du brain et le
 *   brain lui-meme, qui par une commande peut avoir acces au game » ; « le roll classique : 0,50 USDC par roll, jouer max 10x en un coup ».
 * ⛔ MEME DOCTRINE QUE mcp-tblock.js : lecture seule, appels NON SIGNES, rien n est signe, tenu ni envoye ici. Les lectures passent par `rpc`
 *   INJECTE (le serveur passe le sien) ; aucune cle. SERVEUR SEULEMENT (node:crypto) : ce module n est pas servi au navigateur.
 * ⛔ SANS CONTRAT SERVI (/api/tirage.rolls.contrat null = fiche non signee) : REFUSE avec l etat, AUCUN appel rendu — jamais un plan invente.
 * Le guess par defaut = la face du TICKET DU JOUR du wallet, derivee comme dans l app : SHA-256(wallet|jour) -> 20 octets lus comme une
 *   adresse -> apparenceDepuisAdresse -> guessDepuisApparence (test-mcp-game recalcule la chaine a part et exige l egalite). */
import { createHash } from 'node:crypto';
import { apparenceDepuisAdresse } from './apparence.js';
import { guessDepuisApparence, appelPass, lirePass, passActif, lireUint } from './rolls-jeu.js';
import { planRolls, planRollsAvecPass, planSettleMany, etatReglement, ROLLS_MAX, FENETRE, DEFAUTS, SIG_SETTLEABLE_UNTIL, TRAITS } from './blockrolls-plan.js';
import { planPoster } from './missions-plan.js';
import { selecteur, topic } from './keccak.js';
import { poolId } from './pool.js';
import { estNotreHook } from './tokenomics.js';

const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x || '').toLowerCase();
const mot = (n) => BigInt(n).toString(16).padStart(64, '0');
const refus = (pourquoi, extra = {}) => ({ ok: false, etat: 'REFUSE', pourquoi, aSigner: [], ...extra });
export const SANS_CONTRAT = 'no BlockRolls contract is served (its record is not signed yet): the game is in practice mode, 0 USDC — the Game tab rolls for free, nothing to sign';

/** l adresse du ticket du jour : SHA-256(wallet minuscule | jour), 20 premiers octets — la MEME derivation que app.html (adresseTicket) */
export function adresseTicket(wallet, jourId) {
  const w = bas(wallet);
  if (!ADR.test(w) || !/^J\d{4}-\d{2}-\d{2}$/.test(String(jourId))) return null;
  return '0x' + createHash('sha256').update(w + '|' + jourId).digest('hex').slice(0, 40);
}
/** le guess du contrat pour ce ticket : [colorBand, orbit, facet, material, ornament] ; null si le wallet ou le jour est illisible */
export function guessDuTicket(wallet, jourId) {
  const a = adresseTicket(wallet, jourId);
  return a ? guessDepuisApparence(apparenceDepuisAdresse(a)) : null;
}
/** « 0,4,5,7,2 » -> [0,4,5,7,2] ; null si ce ne sont pas 5 entiers (les bornes sont jugees par planRolls / refusGuess) */
export function lireGuess(texte) {
  const p = String(texte || '').split(',').map((x) => x.trim());
  if (p.length !== 5 || !p.every((x) => /^[0-9]{1,2}$/.test(x))) return null;
  return p.map(Number);
}
const nomsGuess = (g) => Object.fromEntries(TRAITS.map((t, i) => [t, g[i]]));

/**
 * Le roll d un agent : N rolls (1..ROLLS_MAX) sur UN guess, pour UN wallet_sendCalls. Avec un pass ACTIF lu sur le contrat : N rollWithPass
 * (aucun paiement) ; sinon UN approve EXACT de N x prix + N roll. Sans contrat : REFUSE, aucun appel.
 */
export async function planRollAgent({ rpc, contrat, usdc, wallet, guess = null, rolls = 1, jourId, rollPrice = DEFAUTS.rollPrice, passRolls = DEFAUTS.passRolls, maintenant = Math.floor(Date.now() / 1000) }) {
  const c = bas(contrat);
  if (!ADR.test(c)) return refus(SANS_CONTRAT, { jeu: 'PRACTICE' });
  const w = bas(wallet);
  if (!ADR.test(w)) return refus('a whole wallet address is needed');
  const n = Number(rolls);
  if (!Number.isInteger(n) || n < 1 || n > ROLLS_MAX) return refus('rolls is 1..' + ROLLS_MAX);
  const g = guess === null || guess === undefined ? guessDuTicket(w, jourId) : guess;
  if (!g) return refus('the ticket face of this wallet could not be turned into a guess — give `guess` explicitly (5 traits)');
  let pass = null, passLu = false;
  try { pass = lirePass(await rpc('eth_call', [{ to: c, data: appelPass(w) }, 'latest'])); passLu = pass !== null; } catch (_) { pass = null; }
  const avecPass = passLu && passActif(pass, maintenant);
  const guesses = Array.from({ length: n }, () => g.slice());
  const plan = avecPass ? planRollsAvecPass({ contrat: c, guesses, pass, passRolls, maintenant }) : planRolls({ contrat: c, usdc, guesses, rollPrice });
  return { ok: plan.etat === 'PRET', etat: plan.etat, pourquoi: plan.pourquoi || null, voie: avecPass ? 'PASS' : 'PAID', n, guess: g, traits: nomsGuess(g),
    guessDefaut: guess === null || guess === undefined, prixTotal: avecPass ? '0' : (plan.prix || null), prixUnitaire: avecPass ? '0' : BigInt(rollPrice).toString(),
    pass: passLu ? { rollsLeft: pass.rollsLeft, expiresAt: pass.expiresAt, actif: avecPass } : null, aSigner: plan.appels || [],
    borne: 'unsigned calls for ' + w + ' to sign as ONE wallet_sendCalls batch (' + (avecPass ? 'no payment: pass rolls' : 'one exact approve, then the rolls') + '). The target block is 2 blocks after the roll; settle within '
      + FENETRE + ' blocks with tblock_plan_settle, or the roll is lost. Not simulated here.' };
}

/**
 * Le settle d un agent : settleableUntil(id) lu pour chaque roll, la tete lue, etatReglement par roll ; planSettleMany sur les REGLABLES
 * seulement (le contrat sauterait les autres, mais un agent doit savoir LESQUELS et pourquoi). Sans contrat : REFUSE.
 */
export async function planSettleAgent({ rpc, contrat, rollIds }) {
  const c = bas(contrat);
  if (!ADR.test(c)) return refus(SANS_CONTRAT, { jeu: 'PRACTICE' });
  const ids = (Array.isArray(rollIds) ? rollIds : String(rollIds || '').split(',')).map((x) => String(x).trim()).filter(Boolean);
  if (!ids.length || ids.length > 50 || !ids.every((x) => /^[0-9]{1,20}$/.test(x))) return refus('rollIds: 1 to 50 roll numbers');
  let tete;
  try { tete = parseInt(await rpc('eth_blockNumber', []), 16); } catch (_) { tete = NaN; }
  if (!Number.isFinite(tete)) return { ok: false, etat: 'NON_MESURE', pourquoi: 'the head block could not be read', aSigner: [] };
  const rolls = [];
  for (const id of ids) {
    let u = null;
    try { u = lireUint(await rpc('eth_call', [{ to: c, data: selecteur(SIG_SETTLEABLE_UNTIL) + mot(id) }, 'latest'])); } catch (_) { u = null; }
    if (u === null) { rolls.push({ id, etat: 'NON_MESURE', pourquoi: 'settleableUntil not read' }); continue; }
    if (u === 0n) { rolls.push({ id, etat: 'PAS_EN_ATTENTE', pourquoi: 'not pending: already settled, expired, or never rolled' }); continue; }
    const cible = Number(u) - FENETRE;
    rolls.push({ id, cible, settleableUntil: Number(u), ...etatReglement(cible, tete) });
  }
  const reglables = rolls.filter((r) => r.etat === 'REGLABLE').map((r) => r.id);
  const plan = reglables.length ? planSettleMany({ contrat: c, rollIds: reglables }) : null;
  return { ok: !!plan && plan.etat === 'PRET', etat: plan ? plan.etat : 'REFUSE', pourquoi: plan ? (plan.pourquoi || null) : 'none of these rolls can be settled at block ' + tete + ' (see `rolls`)',
    blocActuel: tete, rolls, reglables, aSigner: plan ? plan.appels : [],
    borne: 'anyone may send a settle; the prize always goes to the player. TROP_TOT = wait `blocsAvant` blocks and ask again; PERDU = the ' + FENETRE + '-block window passed (expire only). Not simulated here.' };
}

/* « trade my block on its TokenizedBlock pool » : la MEME mission que le formulaire de l onglet Game (app.html, #missionForm) */
export const TOPIC_SWAP_V4 = topic('Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)');
export const DESC_MISSION_TRADE = 'trade my block on its TokenizedBlock pool';
/**
 * Poster une mission par un agent : cible = PoolManager, topic0 = Swap v4, topic1 = la pool du block sur NOTRE hook (la seule qu une mission
 * peut nommer), recompense en unites BRUTES du block, tenue 24 h, ouverte 7 jours, 1 par wallet. `cles` = les cles de pool LUES du block
 * (clesRails) ; sans pool sur notre hook : REFUSE. Sans contrat de missions (fiche non deployee) : REFUSE, tableau PAS_OUVERT.
 */
export function planTaskAgent({ contrat, block, reward, maxDone, hold, cles, poolManager, maintenant = Math.floor(Date.now() / 1000) }) {
  if (!ADR.test(bas(contrat))) return refus('the mission board is coming soon', { tableau: 'PAS_OUVERT' });
  const b = bas(block);
  if (!ADR.test(b)) return refus('a whole block address is needed');
  const max = Number(maxDone);
  if (!Number.isInteger(max) || max < 1 || max > 10000) return refus('maxDone is 1..10000 players');
  let r, h;
  try { r = BigInt(reward); h = BigInt(hold); } catch (_) { return refus('reward and hold are raw integer units of the block'); }
  if (r <= 0n || h <= 0n) return refus('reward and hold must be > 0');
  const cle = (Array.isArray(cles) ? cles : []).find((k) => k && estNotreHook(k.hooks) && [bas(k.currency0), bas(k.currency1)].includes(b));
  if (!cle) return refus('no pool of this block on a TokenizedBlock hook was read: a mission needs one (' + (Array.isArray(cles) ? cles.length : 0) + ' key(s) read)');
  const cleN = { currency0: bas(cle.currency0), currency1: bas(cle.currency1), fee: Number(cle.fee), tickSpacing: Number(cle.tickSpacing), hooks: bas(cle.hooks) };
  const plan = planPoster({ contrat: bas(contrat), cle: cleN,
    params: { rewardToken: b, reward: r.toString(), maxDone: max, perWallet: 1, expiry: maintenant + 7 * 86400, target: bas(poolManager), topic0: TOPIC_SWAP_V4, descHash: topic(DESC_MISSION_TRADE), topic1: poolId(cleN) },
    hold: { minBlock: h.toString(), minPaired: 0, bonusMinBlock: 0, bonusBps: 0, window: 86400 }, maintenant, poolManager: bas(poolManager) });
  return { ok: plan.etat === 'PRET', etat: plan.etat, pourquoi: plan.pourquoi || null, budget: plan.budget || null, mission: { block: b, reward: r.toString(), maxDone: max, perWallet: 1, hold: h.toString(), windowS: 86400, openDays: 7, task: DESC_MISSION_TRADE, pool: poolId(cleN) },
    aSigner: plan.appels || [], borne: 'unsigned: approve exactly the budget (reward x maxDone, raw block units), then postTask — the block creator\'s wallet signs. Not simulated here.' };
}

/** L etat du jeu pour un agent : le corps de /api/tirage (tel que le serveur le sert), le wallet s il est donne, les rolls recents */
export function etatJeuAgent({ tirage, wallet = null, rollsRecents = [], pot = null, jourId = null }) {
  if (!tirage || tirage.ok !== true || !tirage.jour) return { ok: false, etat: 'NON_MESURE', pourquoi: 'the game could not be read just now' };
  const w = wallet ? bas(wallet) : null;
  const j = tirage.jour, r = tirage.rolls || {};
  let moi = null;
  if (w && ADR.test(w)) {
    const wj = (j.wallets || []).find((x) => bas(x.adresse) === w);
    const g = guessDuTicket(w, j.id);
    moi = { wallet: w, ticket: (j.tickets || []).includes(w), volumeUsd: wj ? Number(wj.volumeUsd) : 0, seuilUsd: Number(tirage.seuilVolumeUsd) || 0,
      pass: !!(j.passes || []).find((x) => bas(x.adresse) === w), ticketFace: adresseTicket(w, j.id), guess: g, traits: g ? nomsGuess(g) : null,
      entreesSemaine: (tirage.semaine && tirage.semaine.entrees || []).filter((e) => bas(e.adresse) === w).length,
      entreesMois: (tirage.mois && tirage.mois.entrees || []).filter((e) => bas(e.adresse) === w).length };
  }
  /* ⛔ 2026-10-18 (Phil : « fini ca, on a tirage weekend et roll deja en place ») : plus de tirage du JOUR (un gagnant paye rien) — le ticket du
   *   jour = 1 entree au pot de la SEMAINE (TicketPot, dernier jour UTC de la semaine). Le pot est celui que le serveur a LU (null sinon). */
  const s = tirage.semaine || {}, ps = tirage.ticketpot && tirage.ticketpot.semaine ? tirage.ticketpot.semaine : null;
  return { ok: true, etat: 'PRET', mode: tirage.mode, jour: { id: j.id, fin: j.fin, tickets: (j.tickets || []).length, passes: (j.passes || []).length },
    semaine: { id: s.id || null, fin: s.fin || null, entrees: Array.isArray(s.entrees) ? s.entrees.length : null,
      pot: ps ? { jourId: ps.jourId, ferme: ps.ferme, usdc: String(ps.ferme ? ps.potAtClose : ps.reste) } : null,
      regle: 'today\'s ticket = 1 entry in this week\'s reward pot; the pot is shared by entries after the week closes (UTC)' },
    apercu: tirage.apercu || null,
    rolls: { contrat: r.contrat || null, jeu: r.contrat ? 'PAID' : 'PRACTICE', prixRoll: r.prixRoll || null, prixPass: r.prixPass || null, passRolls: r.passRolls ?? null, prizes: r.prizes || null, minScore: r.minScore ?? null,
      rollsMax: ROLLS_MAX, pot: pot === null ? null : String(pot) },
    moi, rollsRecents: (rollsRecents || []).slice(-10), regle: tirage.regle || null,
    borne: 'read-only. rollsRecents are off-chain practice scores reported by the Game tab (block + score, no identity); pot is read on the contract when one is served, else null.' };
}
