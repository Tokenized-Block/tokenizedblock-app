/* ticketpot-attestation.js — LE VERIFIER DE TicketPot : signer (EIP-712), pour CHAQUE holder du ticket du jour, sa PART du pot fige, et
 * RIEN d autre. Entrees injectees (rpc, cle), aucun etat : testable a sec. Le serveur ne bouge jamais de fonds : il rend des attestations
 * que n importe qui porte au contrat (claim) ; le contrat paie le holder.
 * ⛔ La CLE n est jamais ecrite, loggee ni rendue : elle arrive en argument (le serveur la lit dans MISSIONS_VERIFIER_KEY, posee par Phil).
 * ⛔ On ne signe RIEN si : la cle n est pas le verifier() du contrat, la chaine lue n est pas celle signee, le contrat est en pause, le jour
 *   n est PAS FERME (closed(day) : tant que le pot n est pas fige, un fund tardif changerait toutes les parts -- c est la reponse au
 *   residu « pot alimente apres les signatures » : le contrat refuse fund(day) une fois ferme, et ce module ne signe qu apres), le wallet a
 *   deja ete paye ce jour, la part depasse ce qui reste, l echeance depasse la grace. Chaque refus dit pourquoi, avec les chiffres. Et
 *   chaque signature est RELUE (recupererAdresse) avant d etre rendue.
 * La PART = floor(potAtClose(day) / nTickets) (ticketpot-plan.js partDuJour) : nTickets = la liste du jour du serveur (/api/tirage
 *   veille.tickets, volume >= 10 $ verifie ou pass skin), potAtClose LU sur la chaine. La poussiere reste au pot et roule apres la grace.
 * Le TICKET = app.html adresseTicket : SHA-256(wallet minuscule + '|' + 'JYYYY-MM-DD'), 20 premiers octets -- recalcule ici (ticketDe),
 *   la parite avec crypto.subtle du navigateur est prouvee par test-ticketpot-attestation. */
import { createHash } from 'node:crypto';
import { selecteur } from './keccak.js';
import { adresseDe, signerDigest, recupererAdresse } from './signeur-secp256k1.js';
import { BONUS_PASS_SEMAINE, BONUS_NIVEAU_MAX } from './tirage-saison.js';
import { donneesClaim, digestClaim, dayEnd, claimableUntil, jourIdDeDay, partDuJour, SIG_VERIFIER, SIG_PAUSED, SIG_DAY_POT, SIG_POT_AT_CLOSE, SIG_CLOSED, SIG_TICKET_OF } from './ticketpot-plan.js';

const bas = (x) => String(x || '').toLowerCase();
const ADR = /^0x[0-9a-f]{40}$/;
const mot32 = (n) => BigInt(n).toString(16).padStart(64, '0');
const motAdr = (a) => bas(a).slice(2).padStart(64, '0');

/** le ticket non fongible de (wallet, jour) : exactement app.html adresseTicket(moiBas, jourId) */
export function ticketDe(wallet, jourId) {
  const w = bas(wallet);
  if (!ADR.test(w) || !/^J\d{4}-\d{2}-\d{2}$/.test(String(jourId || ''))) throw new Error('ticketDe: a wallet and a day id (JYYYY-MM-DD) are needed');
  return '0x' + createHash('sha256').update(w + '|' + jourId, 'utf8').digest('hex').slice(0, 40);
}

/** l etat du jour LU sur le contrat : { verifier, chaine, enPause, ferme, potAtClose, reste } ; jette si illisible */
export async function lireJour(io, day) {
  const d = Number(day);
  const [rv, rc, rp, rf, rpc, rd] = await Promise.all([
    io.rpc('eth_call', [{ to: io.contrat, data: selecteur(SIG_VERIFIER) }, 'latest']),
    io.rpc('eth_chainId', []),
    io.rpc('eth_call', [{ to: io.contrat, data: selecteur(SIG_PAUSED) }, 'latest']),
    io.rpc('eth_call', [{ to: io.contrat, data: selecteur(SIG_CLOSED) + mot32(d) }, 'latest']),
    io.rpc('eth_call', [{ to: io.contrat, data: selecteur(SIG_POT_AT_CLOSE) + mot32(d) }, 'latest']),
    io.rpc('eth_call', [{ to: io.contrat, data: selecteur(SIG_DAY_POT) + mot32(d) }, 'latest']),
  ]);
  const verifier = '0x' + String(rv).slice(-40).toLowerCase(), chaine = parseInt(rc, 16);
  if (!ADR.test(verifier) || !Number.isFinite(chaine)) throw new Error('unreadable');
  return { verifier, chaine, enPause: BigInt(rp) !== 0n, ferme: BigInt(rf) !== 0n, potAtClose: BigInt(rpc), reste: BigInt(rd) };
}

/**
 * UNE part. io { rpc, chaineId (8453), contrat, cle (hex), maintenant? (s) } ; demande { day, wallet, ticket, nTickets, amount? (defaut :
 * partDuJour(potAtClose, nTickets)), deadline? (defaut : claimableUntil(day)), jour? (deja lu par lireJour, pour un lot) }.
 * @returns { ok:true, day, jourId, wallet, ticket, amount, deadline, nTickets, potAtClose, digest, signature } | { ok:false, etat, pourquoi }
 */
export async function attesterPart(io, { day, wallet, ticket, nTickets, amount = null, deadline = null, jour = null, poids = null, total = null }) {
  const w = bas(wallet), t = bas(ticket), d = Number(day), n = Number(nTickets);
  const maintenant = Number.isFinite(io.maintenant) ? Number(io.maintenant) : Math.floor(Date.now() / 1000);
  if (!ADR.test(bas(io.contrat))) return { ok: false, etat: 'PAS_OUVERT', pourquoi: 'the ticket pot is coming soon' };
  if (!Number.isInteger(d) || d < 0 || d >= 2 ** 32 || !ADR.test(w) || /^0x0{40}$/.test(w) || !ADR.test(t) || /^0x0{40}$/.test(t)) return { ok: false, etat: 'REFUSE', pourquoi: 'a day, a holder wallet and a 20-byte ticket are needed' };
  if (!Number.isInteger(n) || n < 1) return { ok: false, etat: 'REFUSE', pourquoi: 'the number of tickets of the day must be >= 1' };
  if (!io.cle) return { ok: false, etat: 'PAS_OUVERT', pourquoi: 'the verifier key is not set on this server' };
  let signataire;
  try { signataire = bas(adresseDe(io.cle)); } catch (_) { return { ok: false, etat: 'PAS_OUVERT', pourquoi: 'the verifier key on this server is not a valid key' }; }
  if (maintenant < dayEnd(d)) return { ok: false, etat: 'REFUSE', pourquoi: 'day ' + jourIdDeDay(d) + ' is not over yet (UTC): no share before its close' };
  let j = jour, dejaTicket;
  try {
    if (!j) j = await lireJour(io, d);
    const rt = await io.rpc('eth_call', [{ to: io.contrat, data: selecteur(SIG_TICKET_OF) + mot32(d) + motAdr(w) }, 'latest']);
    dejaTicket = String(rt).replace(/^0x/, '').slice(0, 40).toLowerCase();
    if (!/^[0-9a-f]{40}$/.test(dejaTicket)) throw new Error('unreadable');
  } catch (_) { return { ok: false, etat: 'NON_LU', pourquoi: 'the ticket pot could not be read just now' }; }
  if (j.verifier !== signataire) return { ok: false, etat: 'PAS_OUVERT', pourquoi: 'this server key is not the verifier the contract trusts' };
  if (j.chaine !== io.chaineId) return { ok: false, etat: 'PAS_OUVERT', pourquoi: 'this server reads chain ' + j.chaine + ' but signs for chain ' + io.chaineId };
  if (j.enPause) return { ok: false, etat: 'PAS_OUVERT', pourquoi: 'ticket pot claims are paused right now' };
  if (!j.ferme) return { ok: false, etat: 'REFUSE', pourquoi: 'day ' + jourIdDeDay(d) + ' is not closed on chain yet: its pot is not final, nothing is signed before close(day)' };
  if (!/^0{40}$/.test(dejaTicket)) return { ok: false, etat: 'REFUSE', pourquoi: 'this wallet already received its share of day ' + jourIdDeDay(d) + ' (ticket 0x' + dejaTicket + ')' };
  /* part PONDEREE (Phil 2026-10-18 : « chaque semaine, autant de chances que de tickets ») : poids/total entrees -> pot * poids / total ;
   *   sinon la part egale du jour. Jamais plus que ce plafond. */
  const pondere = Number.isInteger(Number(poids)) && Number(poids) > 0 && Number.isInteger(Number(total)) && Number(total) >= Number(poids);
  const plafond = pondere ? (j.potAtClose * BigInt(poids)) / BigInt(total) : partDuJour(j.potAtClose, n);
  const part = amount === null ? plafond : BigInt(amount);
  if (part <= 0n) return { ok: false, etat: 'REFUSE', pourquoi: 'the share of day ' + jourIdDeDay(d) + ' is 0 raw USDC (pot ' + j.potAtClose + ' for ' + (pondere ? poids + '/' + total + ' entries' : n + ' tickets') + '): nothing to attest' };
  if (part > plafond) return { ok: false, etat: 'REFUSE', pourquoi: 'asked ' + part + ' raw USDC, a share of day ' + jourIdDeDay(d) + ' is ' + plafond + ' (pot ' + j.potAtClose + (pondere ? ' x ' + poids + '/' + total + ' entries' : ' / ' + n + ' tickets') + ')' };
  if (part > j.reste) return { ok: false, etat: 'REFUSE', pourquoi: 'only ' + j.reste + ' raw USDC left in the pot of day ' + jourIdDeDay(d) + ', a share is ' + part };
  const echeance = deadline === null ? claimableUntil(d) : Number(deadline);
  if (!Number.isInteger(echeance) || echeance < maintenant) return { ok: false, etat: 'REFUSE', pourquoi: 'the deadline is already past' };
  if (echeance > claimableUntil(d)) return { ok: false, etat: 'REFUSE', pourquoi: 'the deadline outlives the 7-day grace of day ' + jourIdDeDay(d) + ' (' + claimableUntil(d) + ')' };
  const donnees = donneesClaim({ chainId: io.chaineId, contrat: io.contrat, day: d, wallet: w, ticket: t, amount: part.toString(), deadline: echeance });
  const digest = digestClaim(donnees);
  const signature = signerDigest(io.cle, digest);
  if (bas(recupererAdresse(digest, signature)) !== j.verifier) return { ok: false, etat: 'NON_LU', pourquoi: 'the signature did not recover to the verifier: nothing returned' };
  return { ok: true, day: d, jourId: jourIdDeDay(d), wallet: w, ticket: t, amount: part.toString(), deadline: echeance, nTickets: n, potAtClose: j.potAtClose.toString(), digest, signature };
}

/**
 * LE JOUR ENTIER : la liste des tickets du serveur (adresses, triees, sans doublon -- tirage-saison.js ticketsJour) -> une attestation par
 * holder, le ticket derive ici (ticketDe(wallet, jourId)), l etat du contrat lu UNE fois. Rend { ok, day, jourId, nTickets, potAtClose, part,
 * poussiere, attestations:[...], refus:[{wallet, etat, pourquoi}] } ; ok:false avec etat/pourquoi si le jour entier est refuse.
 */
export async function attesterJour(io, { day, tickets }) {
  const d = Number(day);
  const liste = [...new Set((tickets || []).map(bas))].filter((a) => ADR.test(a)).sort();
  if (!liste.length) return { ok: false, etat: 'REFUSE', pourquoi: 'no ticket holder for day ' + jourIdDeDay(d) + ': nothing to share' };
  let j;
  try { j = await lireJour(io, d); } catch (_) { return { ok: false, etat: 'NON_LU', pourquoi: 'the ticket pot could not be read just now' }; }
  const jourId = jourIdDeDay(d);
  const attestations = [], refus = [];
  for (const w of liste) {
    const r = await attesterPart(io, { day: d, wallet: w, ticket: ticketDe(w, jourId), nTickets: liste.length, jour: j });
    if (r.ok) attestations.push(r); else refus.push({ wallet: w, etat: r.etat, pourquoi: r.pourquoi });
  }
  if (!attestations.length) return { ok: false, etat: refus[0].etat, pourquoi: refus[0].pourquoi, refus };
  const part = partDuJour(j.potAtClose, liste.length);
  return { ok: true, day: d, jourId, nTickets: liste.length, potAtClose: j.potAtClose.toString(), part: part.toString(), poussiere: (j.potAtClose - part * BigInt(liste.length)).toString(), attestations, refus };
}

/**
 * LA SEMAINE (Phil 2026-10-18 : « chaque semaine on redistribue les rewards aux eligibles, au nombre de tickets : autant de chances »).
 * `day` = le jour TicketPot qui porte le pot de la semaine (son dernier jour) ; `entrees` = [{ adresse, jour }] de la semaine
 * (tirage-saison.js entreesPeriode) + `bonus` = { wallet: n } (Week pass : +3). Chaque wallet recoit floor(pot x ses entrees / total).
 * Un wallet = une attestation (un claim par wallet et par jour cote contrat). Rend { ok, day, total, parWallet, attestations, refus, poussiere }.
 * ⛔ 2026-10-18 (niveaux du brain) : LES MEMES PLAFONDS QUE entreesPeriode. Avant, `bonus` n etait PAS plafonne ici (un { w: 99 } donnait 99
 *   parts de plus) et une entree BONUS deja presente dans `entrees` s ajoutait au `bonus` (compte deux fois). Desormais : seules les entrees
 *   de JOUR comptent dans `entrees` (jour 'JYYYY-MM-DD', une par (wallet, jour), les entrees `bonus: true` sont ignorees) ; les bonus viennent
 *   des cartes, plafonnes : `bonus` (Week pass) a BONUS_PASS_SEMAINE, `bonusNiveau` (niveau du brain, niveaux-jeu.js) a BONUS_NIVEAU_MAX, et
 *   seulement pour un wallet qui a au moins une entree de jour (pas d entree -> pas de bonus, pas de part).
 */
export async function attesterSemaine(io, { day, entrees, bonus = {}, bonusNiveau = {} }) {
  const d = Number(day), poids = new Map(), vusJour = new Set();
  for (const e of entrees || []) {
    const a = bas(e && e.adresse), jr = String((e && e.jour) || '');
    if (!ADR.test(a) || (e && e.bonus === true) || !/^J\d{4}-\d{2}-\d{2}$/.test(jr) || vusJour.has(a + '|' + jr)) continue;
    vusJour.add(a + '|' + jr); poids.set(a, (poids.get(a) || 0) + 1);
  }
  /* les deux cartes lisent les entrees de JOUR (avant tout bonus) : un bonus ne qualifie pas pour l autre */
  const avecJour = new Set(poids.keys());
  const ajouter = (carte, plafond) => {
    const fait = new Set(); /* une cle en MAJUSCULES et la meme en minuscules : une seule fois (sinon le plafond se doublait) */
    for (const [a0, n0] of Object.entries(carte || {})) { const a = bas(a0), n = Number(n0); if (ADR.test(a) && Number.isInteger(n) && n > 0 && avecJour.has(a) && !fait.has(a)) { fait.add(a); poids.set(a, poids.get(a) + Math.min(n, plafond)); } }
  };
  ajouter(bonusNiveau, BONUS_NIVEAU_MAX);
  ajouter(bonus, BONUS_PASS_SEMAINE);
  const liste = [...poids.keys()].sort(), total = [...poids.values()].reduce((s, x) => s + x, 0);
  if (!liste.length || total <= 0) return { ok: false, etat: 'REFUSE', pourquoi: 'no entry this week: nothing to share' };
  let j;
  try { j = await lireJour(io, d); } catch (_) { return { ok: false, etat: 'NON_LU', pourquoi: 'the ticket pot could not be read just now' }; }
  const jourId = jourIdDeDay(d), attestations = [], refus = [];
  for (const w of liste) {
    const r = await attesterPart(io, { day: d, wallet: w, ticket: ticketDe(w, jourId), nTickets: liste.length, jour: j, poids: poids.get(w), total });
    if (r.ok) attestations.push({ ...r, entrees: poids.get(w) }); else refus.push({ wallet: w, etat: r.etat, pourquoi: r.pourquoi });
  }
  if (!attestations.length) return { ok: false, etat: refus[0].etat, pourquoi: refus[0].pourquoi, refus };
  const paye = attestations.reduce((s, x) => s + BigInt(x.amount), 0n);
  return { ok: true, day: d, jourId, total, parWallet: Object.fromEntries(liste.map((w) => [w, poids.get(w)])), potAtClose: j.potAtClose.toString(), poussiere: (j.potAtClose - paye).toString(), attestations, refus };
}
