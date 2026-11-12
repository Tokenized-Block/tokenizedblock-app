/* brain-jeu.js — « LET THE BRAIN PLAY » (Phil 2026-10-18 : « le brain peut jouer aux jeux s il a des fonds et l autorisation, en UN bouton :
 *   rolls, ticket, missions, creer des missions » ; « revente des skins + encheres que les brains voient et sur lesquelles ils encherissent
 *   si le skin leur plait »).
 * PUR : aucun reseau, aucune cle, aucune horloge (l instant est DONNE). Un etat lu par l app -> AU PLUS UNE proposition :
 *   { kind: ROLL | SETTLE | TAKE_MISSION | POST_MISSION | BID_SKIN | BUY_SKIN | NONE, calls (NON SIGNES), why, costUsdc, cle }.
 * Les appels viennent des modules qui les encodent deja (blockrolls-plan, missions-plan, blockskins) : rien n est re-encode ici.
 * ⛔ LA DOCTRINE DU PANNEAU RESTE : « le brain propose, le wallet signe ». Ce module ne signe rien, n envoie rien ; l app montre la
 *   proposition avec UN bouton « Sign » qui passe par bcSigner — le wallet confirme CHAQUE appel.
 * Ordre fixe (deterministe) :
 *   1. SETTLE d un roll reglable (toujours en premier : un roll non regle dans ses 256 blocs est PERDU), puis d une enchere de skin finie ;
 *   2. TAKE_MISSION : reclamer une mission dont l attestation est en main (gain, 0 USDC) ;
 *   3. ROLL : sur le pass s il est actif (0 USDC), sinon paye — au plus maxRollsPerHour par heure glissante ;
 *   4. BUY_SKIN / BID_SKIN : propositionSkin sur le block du brain, en USDC, au plus maxSkinBidUsdc ;
 *   5. POST_MISSION : poster une mission (recompense en USDC : le budget est en USDC) si aucune des siennes n est ouverte.
 * Bornes : rien sans `authorized === true` ni wallet ; aucune depense au-dela de (budget - deja depense) ni du solde USDC LU (solde non lu
 *   = aucune proposition payante : jamais « probablement assez ») ; une offre de skin jamais au-dessus du plafond de la regle.
 * DUELS (Phil 2026-10-18 : « les brains peuvent se faire des duels ») — en USDC SEULEMENT (le budget est en USDC : une action ne se compare
 *   pas), jamais au-dessus de maxDuelStakeUsdc :
 *   1b. DUEL_SETTLE : regler (settle) ou rembourser (refundExpired) un duel de CE wallet — 0 USDC, juste apres le settle des rolls ;
 *   3b. DUEL_JOIN : accepter un duel ouvert d un AUTRE wallet dont la mise tient dans le reste du budget, le solde lu et maxDuelStakeUsdc ;
 *   3c. DUEL_CREATE : sinon en ouvrir UN (mise = maxDuelStakeUsdc), au plus un par heure glissante et jamais tant qu un des siens attend. */
import { planRoll, planRollAvecPass, planSettle, planSettleMany, etatReglement, refusGuess } from './blockrolls-plan.js';
import { planPoster, planReclamer, budgetMission } from './missions-plan.js';
import { propositionSkin, appelApprouver, appelAcheter, appelEncherir, appelRegler } from './blockskins.js';
import { planCreate, planJoin, planSettle as planSettleDuel, planRefund as planRefundDuel, etatDuel, partage as partageDuel, MISE_MIN as MISE_MIN_DUEL,
  MARGE_JOIN_S, EXPIRATION_MIN_S, EXPIRATION_MAX_S, duelsFermesParContrat } from './duels-plan-app.js';
/* 2026-10-24 (Phil) : BlockDuelsV2 — quand /api/duels sert v2 (duels.version === 2) : un duel rejoint non regle dans sa fenetre est GAGNE PAR
 *   DEFAUT par le createur. 1b propose alors DUEL_SETTLE (dans la fenetre, a ses deux joueurs) ou DUEL_SETTLE_DEFAULT (apres, au createur ET a
 *   n importe qui : il ne coute rien et paie le createur) ; 3b DUEL_JOIN seulement si la fenetre se dit au temps de bloc MESURE (duels.sParBloc),
 *   avec la phrase « Settle within about N s… or the creator wins by default » ; plus jamais de remboursement d un duel rejoint. */
import * as DuelsV2 from './duels-v2-plan.js';
/* LE POT DES RECOMPENSES (Phil 2026-10-18 : « gere la pool pour les rewards, le brain qui s en occupe ») — pour le wallet OWNER de TicketPot
 *   SEULEMENT (owner LU sur la chaine, donne dans l etat) ; le brain PROPOSE, le wallet de l owner SIGNE chaque pas ; rien ne bouge seul.
 *   Ordre fixe, juste apres les settles : POT_CLOSE (le pot d HIER pas ferme et non vide : planClose owner), puis POT_SIGN (un jour ferme dont
 *   des parts n ont pas de signature : le module NE SIGNE PAS — l app ouvre la signature EIP-712 du wallet verifier), puis POT_FUND (le pot
 *   d AUJOURD HUI, le budget journalier regle moins ce qui a deja ete verse aujourd hui, jamais au-dessus du solde USDC LU : planFund,
 *   approve EXACT + fund). Le dernier jour d une semaine (tirage-saison.js saisonDe), le pot de ce jour EST le pot de la semaine : POT_SIGN
 *   signe alors les parts de la SEMAINE (&week=1) — jamais les parts du jour ET de la semaine pour ce jour. */
import { planFund as planFundPot, planClose as planClosePot, jourDe as jourContrat, jourIdDeDay } from './ticketpot-plan.js';
import { saisonDe } from './tirage-saison.js';
import { displayShort } from './frais-creation.js';

export const KINDS = Object.freeze(['ROLL', 'SETTLE', 'TAKE_MISSION', 'POST_MISSION', 'BID_SKIN', 'BUY_SKIN', 'DUEL_CREATE', 'DUEL_JOIN', 'DUEL_SETTLE', 'DUEL_SETTLE_DEFAULT', 'POT_CLOSE', 'POT_SIGN', 'POT_FUND', 'NONE']);
export const MAX_ROLLS_HEURE = 60;
export const DUEL_CREATE_INTERVALLE_S = 3600;
export const DUEL_EXPIRATION_DEFAUT_S = 3600;
/** au plus autant de parts dans UNE carte POT_SIGN (une signature de message par part) */
export const POT_SIGN_MAX = 50;
export const REGLES_DEFAUT = Object.freeze({ rolls: true, maxRollsPerHour: 6, settle: true, missions: false, postMissions: false, skins: false, maxSkinBidUsdc: '0', duels: false, maxDuelStakeUsdc: '0', pot: false, potDailyUsdc: '0' });
const JOUR_S = 86400;
/** le jour du contrat (floor(ts / 86400)) est-il le DERNIER d une semaine de saison (tirage-saison.js saisonDe) ? son pot est alors celui de la semaine */
export function dernierJourDeSemaine(day) {
  const d = Number(day);
  if (!Number.isInteger(d)) return false;
  const s = saisonDe(d * JOUR_S * 1000);
  return Math.floor(s.fin / (JOUR_S * 1000)) - 1 === d;
}
/** ce que le brain a deja verse au pot du jour `day` : l historique SIGNE ({ kind: 'POT_FUND', day, usdc }). Un montant illisible -> null
 *  (le module ne propose alors aucun fund : jamais « compte 0 »). */
export function potVerseLeJour(historique, day) {
  let a = 0n;
  for (const h of Array.isArray(historique) ? historique : []) {
    if (!h || h.kind !== 'POT_FUND' || Number(h.day) !== Number(day)) continue;
    const v = (() => { try { const x = BigInt(h.usdc); return x >= 0n ? x : null; } catch (_) { return null; } })();
    if (v === null) return null;
    a += v;
  }
  return a;
}

const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x || '').toLowerCase();
const brut = (x) => { try { const v = BigInt(x); return v >= 0n ? v : null; } catch (_) { return null; } };
const min = (...xs) => xs.reduce((a, x) => (x < a ? x : a));

/** les regles telles que l ecran les donne -> des regles STRICTES : un drapeau n est vrai que s il vaut `true` ; les nombres sont bornes. */
export function normaliserRegles(r = {}) {
  const x = r && typeof r === 'object' ? r : {};
  const h = Number(x.maxRollsPerHour);
  const plafond = brut(x.maxSkinBidUsdc), plafondDuel = brut(x.maxDuelStakeUsdc), budgetPot = brut(x.potDailyUsdc);
  return {
    rolls: x.rolls === true, settle: x.settle === true, missions: x.missions === true, postMissions: x.postMissions === true, skins: x.skins === true,
    duels: x.duels === true, pot: x.pot === true,
    potDailyUsdc: budgetPot === null ? 0n : budgetPot,
    maxRollsPerHour: Number.isInteger(h) && h >= 0 ? Math.min(h, MAX_ROLLS_HEURE) : 0,
    maxSkinBidUsdc: plafond === null ? 0n : plafond,
    maxDuelStakeUsdc: plafondDuel === null ? 0n : plafondDuel,
  };
}
/** combien de propositions d un genre dans l heure glissante avant `maintenant` (secondes) */
const dansLaFenetre = (historique, kind, maintenant, fenetreS) => (Array.isArray(historique) ? historique : []).filter((h) => h && h.kind === kind && Number(h.t) > maintenant - fenetreS && Number(h.t) <= maintenant).length;

/** les appels sous UNE forme pour bcSigner : { to, data, value, nom } */
const forme = (appels) => appels.map((c) => ({ to: bas(c.to), data: c.data, value: c.value || '0x0', nom: c.nom || c.quoi || 'transaction' }));
const proposition = (kind, calls, why, cout, cle) => ({ kind, calls: forme(calls), why, costUsdc: cout.toString(), cle });
const rien = (why) => ({ kind: 'NONE', calls: [], why, costUsdc: '0', cle: null });

/** combien de ROLL ont ete proposes (et signes) dans l heure glissante avant `maintenant` (secondes) */
export function rollsDansLHeure(historique, maintenant) {
  return (Array.isArray(historique) ? historique : []).filter((h) => h && h.kind === 'ROLL' && Number(h.t) > maintenant - 3600 && Number(h.t) <= maintenant).length;
}
const usdcTxt = (v) => { const e = v / 1000000n, f = (v % 1000000n).toString().padStart(6, '0').replace(/0+$/, ''); return e + (f ? '.' + f : '') + ' USDC'; };

/**
 * LA proposition suivante. etat = {
 *   authorized, wallet, now (s), budgetUsdc, spentUsdc, balanceUsdc (null = non lu), rules, history: [{ t, kind }], seen: [cle…],
 *   rolls:    { contract, usdc, rollPrice, guess, pass: { rollsLeft, expiresAt } | null, pot, block (bloc actuel), pending: [{ rollId, targetBlock }] } | null,
 *   missions: { contract, usdc, claimable: [{ id, txHash, held, signature }], post: { cle, params, hold, poolManager } | null, mineOpen } | null,
 *   skins:    { list (decoderPage), block (le block du brain), usdc } | null,
 *   duels:    { contract, usdc, guess (une face NEUVE tiree par l app), expiresIn (s), block (bloc actuel), list: [duel (duels-plan-app.js)],
 *               open (duelsOuverts : true SEULEMENT si le regleur du serveur regle les duels ; sinon ni JOIN ni CREATE) } | null,
 *   pot:      { contract, usdc, owner (LU), veille: /api/tirage.ticketpot.veille (porte verifier), today: { day, dayPot } (dayPot(aujourd hui) LU
 *               sur la chaine, null = non lu), sharesDay / sharesWeek: /api/ticketpot/parts (jour / &week=1, avec couverture.complete),
 *               jours: [{ day, jourId, ferme, reste, sharesDay?, sharesWeek? }] (2026-10-24 : les 7 derniers jours, /api/tirage.ticketpot.jours ;
 *               optionnel — absent, seule la veille est regardee) } | null }
 *   rules.pot + rules.potDailyUsdc ; history porte { t, kind: 'POT_FUND', day, usdc } pour chaque fund SIGNE.
 *   POT_SIGN n a AUCUN appel : { sign: { jourId, day, week, verifier, signerIsVerifier, shares: [{ wallet, amount, donnees }] } } — l app fait signer.
 */
export function prochaineProposition(etat = {}) {
  const e = etat && typeof etat === 'object' ? etat : {};
  if (e.authorized !== true) return rien('The brain is not allowed to play — switch “Let the brain play” on.');
  const moi = bas(e.wallet);
  if (!ADR.test(moi)) return rien('Connect a wallet: the brain only proposes, your wallet signs.');
  const t = Number(e.now);
  if (!Number.isFinite(t) || t <= 0) return rien('No time given — nothing proposed.');
  const regles = normaliserRegles(e.rules);
  const budget = brut(e.budgetUsdc), depense = brut(e.spentUsdc || 0);
  if (budget === null || depense === null) return rien('The budget is not a USDC amount — nothing proposed.');
  const reste = budget > depense ? budget - depense : 0n;
  const solde = e.balanceUsdc === null || e.balanceUsdc === undefined ? null : brut(e.balanceUsdc);
  /* ce que le brain peut payer MAINTENANT : le reste du budget ET le solde LU ; solde non lu = 0 (fail-closed) */
  const payable = solde === null ? 0n : min(reste, solde);
  const vus = new Set((Array.isArray(e.seen) ? e.seen : []).map(String));
  const pourquoiPas = [];

  /* 1. SETTLE — un roll reglable passe AVANT tout : sa fenetre de 256 blocs se ferme, et le gain va toujours au joueur */
  const R = e.rolls && ADR.test(bas(e.rolls.contract)) ? e.rolls : null;
  if (regles.settle && R && R.block !== null && R.block !== undefined && Array.isArray(R.pending)) {
    let reglables = [];
    try {
      reglables = R.pending.filter((p) => p && p.rollId !== undefined && p.targetBlock !== undefined)
        .map((p) => ({ p, e: etatReglement(p.targetBlock, R.block) })).filter((x) => x.e.etat === 'REGLABLE')
        .sort((a, b) => a.e.blocsRestants - b.e.blocsRestants || (BigInt(a.p.rollId) < BigInt(b.p.rollId) ? -1 : 1));
    } catch (_) { reglables = []; }
    if (reglables.length) {
      const ids = reglables.map((x) => String(x.p.rollId));
      const plan = ids.length === 1 ? planSettle({ contrat: R.contract, rollId: ids[0], targetBlock: reglables[0].p.targetBlock, blocActuel: R.block })
        : planSettleMany({ contrat: R.contract, rollIds: ids });
      if (plan.etat === 'PRET') return proposition('SETTLE', plan.appels, 'Reveal ' + (ids.length === 1 ? 'roll #' + ids[0] : ids.length + ' rolls (#' + ids.join(', #') + ')') + ' — '
        + reglables[0].e.blocsRestants + ' block(s) left before it is lost. Settling costs no USDC; any prize goes to your wallet.', 0n, 'SETTLE:' + ids.join(','));
    }
  }
  /* 1b. DUEL_SETTLE — un duel de CE wallet a regler (dans ses 256 blocs) ou a rembourser (fenetre passee, ou jamais pris et expire) : 0 USDC.
   *   Un reglement deja SIGNE (cle dans `seen`, posee par l app apres confirmation) ne revient pas : la liste servie peut retarder. */
  const D = e.duels && ADR.test(bas(e.duels.contract)) && Array.isArray(e.duels.list) ? e.duels : null;
  const v2 = !!(D && D.version === DuelsV2.VERSION);
  /* R5 (test live Grok game39) : v2 ne propose un settle que s il tombe dans la fenetre (marge au temps de bloc mesure, D.sParBloc) */
  const margeDuel = DuelsV2.blocsMargeSettle({ sParBloc: D && D.sParBloc });
  const etatsDuels = D ? D.list.filter((d) => d && d.id !== undefined).map((d) => ({ d, x: v2 ? DuelsV2.etatDuel(d, D.block, t, margeDuel) : etatDuel(d, D.block, t) })) : [];
  if (regles.duels && D && v2) {
    /* v2 : ses duels reglables (le vrai resultat, dans la fenetre) d abord, puis TOUT duel gagne par defaut (paie le createur, 0 USDC pour
     *   l appelant ; propose a tous : un createur hors ligne est paye quand meme), puis ses defis jamais pris et expires (refundExpired) */
    const a = etatsDuels.filter(({ d, x }) => !vus.has('DUEL_SETTLE:' + d.id) && (
      (x.etat === 'REGLABLE' && (bas(d.creator) === moi || bas(d.joiner) === moi)) || x.etat === DuelsV2.DEFAULT_CREATOR || (x.etat === 'EXPIRE' && bas(d.creator) === moi)))
      .sort((p, q) => ['REGLABLE', DuelsV2.DEFAULT_CREATOR, 'EXPIRE'].indexOf(p.x.etat) - ['REGLABLE', DuelsV2.DEFAULT_CREATOR, 'EXPIRE'].indexOf(q.x.etat)
        /* parmi les defauts : ceux dont CE wallet est le createur d abord (son gain), puis ceux des autres */
        || (bas(p.d.creator) === moi ? 0 : 1) - (bas(q.d.creator) === moi ? 0 : 1)
        || (p.x.blocsRestants ?? 0) - (q.x.blocsRestants ?? 0) || (BigInt(p.d.id) < BigInt(q.d.id) ? -1 : 1));
    if (a.length) {
      const { d, x } = a[0];
      if (x.etat === 'REGLABLE') {
        const plan = DuelsV2.planSettle({ contrat: D.contract, id: d.id, targetBlock: d.targetBlock, blocActuel: D.block, margeBlocs: margeDuel });
        if (plan.etat === 'PRET') return proposition('DUEL_SETTLE', plan.appels, 'Reveal duel #' + d.id + ' — ' + x.blocsRestants + ' block(s) left to settle it for the real result. '
          + DuelsV2.APRES_FENETRE + ' Settling costs no USDC; the winner is paid by the contract.', 0n, 'DUEL_SETTLE:' + d.id);
      } else if (x.etat === DuelsV2.DEFAULT_CREATOR) {
        const plan = DuelsV2.planSettleDefault({ contrat: D.contract, id: d.id, targetBlock: d.targetBlock, blocActuel: D.block });
        if (plan.etat === 'PRET') return proposition('DUEL_SETTLE_DEFAULT', plan.appels, 'Duel #' + d.id + ' was not settled in its ' + DuelsV2.FENETRE + '-block window: its creator '
          + (bas(d.creator) === moi ? '(you) ' : '') + 'wins by default' + (bas(d.token) === bas(D.usdc) ? ' (' + usdcTxt(partageDuel(d.stake).gagnant) + ', 90 %)' : ' (90 % of the pot)')
          + '. Anyone may send it; it costs no USDC.', 0n, 'DUEL_SETTLE:' + d.id);
      } else {
        const plan = DuelsV2.planRefund({ contrat: D.contract, id: d.id, duel: d, maintenant: t });
        if (plan.etat === 'PRET') return proposition('DUEL_SETTLE', plan.appels, 'Duel #' + d.id + ' was never accepted and has expired — refund your stake in full, no fee. Costs no USDC.', 0n, 'DUEL_SETTLE:' + d.id);
      }
    }
  } else if (regles.duels && D) {
    const miens = etatsDuels.filter(({ d, x }) => (bas(d.creator) === moi || bas(d.joiner) === moi) && ['REGLABLE', 'REMBOURSABLE', 'EXPIRE'].includes(x.etat)
      && !vus.has('DUEL_SETTLE:' + d.id))
      .sort((p, q) => (p.x.etat === 'REGLABLE' ? 0 : 1) - (q.x.etat === 'REGLABLE' ? 0 : 1) || (p.x.blocsRestants ?? 0) - (q.x.blocsRestants ?? 0) || (BigInt(p.d.id) < BigInt(q.d.id) ? -1 : 1));
    if (miens.length) {
      const { d, x } = miens[0];
      const plan = x.etat === 'REGLABLE' ? planSettleDuel({ contrat: D.contract, id: d.id, targetBlock: d.targetBlock, blocActuel: D.block }) : planRefundDuel({ contrat: D.contract, id: d.id });
      if (plan.etat === 'PRET') return proposition('DUEL_SETTLE', plan.appels, x.etat === 'REGLABLE'
        ? 'Reveal duel #' + d.id + ' — ' + x.blocsRestants + ' block(s) left to settle it (after that both stakes are refunded). Settling costs no USDC; the winner is paid by the contract.'
        : 'Duel #' + d.id + (x.etat === 'EXPIRE' ? ' was never accepted and has expired' : ' passed its 256-block window') + ' — refund ' + (x.etat === 'EXPIRE' ? 'the stake' : 'both stakes') + ' in full, no fee. Costs no USDC.',
      0n, 'DUEL_SETTLE:' + d.id);
    }
  }
  /* 1c / 1d / 1e. LE POT DES RECOMPENSES — l owner de TicketPot seul ; close -> sign -> fund (cet ordre : un pot ferme rend ses parts
   *   signables ; des parts signees ouvrent les claims ; le fund nourrit le jour suivant) */
  const P = regles.pot && e.pot && ADR.test(bas(e.pot.contract)) ? e.pot : null;
  if (regles.pot && !P) pourquoiPas.push('reward pot: the ticket pot was not read');
  if (P) {
    const proprio = ADR.test(bas(P.owner)) && bas(P.owner) === moi;
    /* ⛔ 2026-10-23 (revue adverse, LIVE : owner 0x31e0… != verifier 0x37eb…) : le VERIFIER (lu sur la chaine, servi avec les parts ou la
     *   veille) qui n est pas l owner recoit POT_SIGN — et SEULEMENT lui (jamais close ni fund : ce sont les coups de l owner). */
    const verifServi = bas((P.sharesDay && P.sharesDay.verifier) || (P.veille && P.veille.verifier));
    const verificateur = ADR.test(verifServi) && verifServi === moi;
    if (!proprio && !verificateur) pourquoiPas.push('reward pot: only the ticket pot owner manages it (its verifier signs the shares)' + (ADR.test(bas(P.owner)) ? '' : ' (its owner was not read)'));
    else {
      const aujourdhui = jourContrat(t), hier = aujourdhui - 1;
      /* ⛔ 2026-10-24 (revue adverse du correctif ticketpot, defaut 3) : la veille SEULE etait regardee (jidHier) — un pot de jour pas ferme
       *   ou pas signe a J+1 n etait plus jamais propose. Les jours = la veille (P.veille + P.sharesDay / P.sharesWeek, comme avant), puis
       *   chaque jour des 7 derniers servi dans P.jours ({ day, jourId, ferme, reste, sharesDay?, sharesWeek? } : /api/tirage.ticketpot.jours +
       *   les parts lues par l app), du plus ANCIEN au plus recent (le plus proche de la fin de sa grace d abord), encore dans sa grace
       *   (t <= claimableUntil = fin du jour + 7 jours) ; jamais aujourd hui ni un jour futur ; un jour une seule fois. */
      const GRACE_POT_S = 7 * JOUR_S;
      const dansGrace = (d) => Number.isInteger(d) && d < aujourdhui && t <= (d + 1) * JOUR_S + GRACE_POT_S;
      /* la veille d abord, exactement comme avant (P.veille si c est bien hier, P.sharesDay / P.sharesWeek) ; un champ qu elle n a pas
       *   (veille non servie) est pris dans P.jours pour le meme jour ; jamais ecrase */
      const joursPot = [{ ...(P.veille && Number(P.veille.day) === hier ? P.veille : {}), day: hier, jourId: jourIdDeDay(hier), sharesDay: P.sharesDay, sharesWeek: P.sharesWeek, veille: true }];
      for (const x of (Array.isArray(P.jours) ? P.jours : []).filter((y) => y && dansGrace(Number(y.day))).sort((a, b) => Number(a.day) - Number(b.day))) {
        const d = Number(x.day), deja = joursPot.find((y) => y.day === d);
        if (deja) { for (const k of ['ferme', 'reste', 'sharesDay', 'sharesWeek']) if (deja[k] === undefined || deja[k] === null) deja[k] = x[k]; continue; }
        joursPot.push({ ...x, day: d, jourId: jourIdDeDay(d), veille: false });
      }
      const potCloseDe = (v) => {
        const d = v.day, jid = v.jourId;
        if (v.ferme !== false || vus.has('POT_CLOSE:' + d)) return null;
        const reste = brut(v.reste);
        if (reste === null) { pourquoiPas.push('reward pot: the pot of ' + jid + ' was not read'); return null; }
        if (reste === 0n) return null; /* un pot vide : fermer ne paierait personne (gas pour rien) */
        const plan = planClosePot({ contrat: P.contract, day: d, owner: true, ferme: false, maintenant: t });
        if (plan.etat !== 'PRET') { pourquoiPas.push('reward pot: ' + plan.pourquoi); return null; }
        const fin = new Date(((d + 1) * JOUR_S + GRACE_POT_S) * 1000).toISOString().slice(0, 16).replace('T', ' ');
        return proposition('POT_CLOSE', plan.appels, (v.veille ? 'Close yesterday\'s pot (' + jid + ', ' : 'Close the pot of ' + jid + ' (' + (aujourdhui - d) + ' days ago, ') + usdcTxt(reste) + ')'
          + (dernierJourDeSemaine(d) ? ' — it closes a week: the weekly pot' : '') + ': it freezes the pot, its shares become final and can be signed for the holders to claim'
          + (v.veille ? '' : ' until ' + fin + ' UTC') + '. No USDC.', 0n, 'POT_CLOSE:' + d);
      };
      const potClose = () => { for (const v of joursPot) { const p = potCloseDe(v); if (p) return p; } return null; };
      const potSignDe = (jour) => {
        const jidHier = jour.jourId, hier = jour.day; /* les noms d avant : le jour examine (la veille, ou un des 7 derniers) */
        const lu = (x, mode) => x && x.ok === true && x.ferme === true && x.jourId === jidHier && bas(x.contrat) === bas(P.contract) && Array.isArray(x.parts) && (x.mode || 'JOUR') === mode;
        const entame = (x) => x.parts.some((p) => p && p.signature);
        const semaine = dernierJourDeSemaine(hier), J0 = lu(jour.sharesDay, 'JOUR') ? jour.sharesDay : null, S0 = lu(jour.sharesWeek, 'SEMAINE') ? jour.sharesWeek : null;
        let src = null, week = false;
        if (!semaine) src = J0;
        else if (!J0) { pourquoiPas.push('reward pot: ' + jidHier + ' closes a week — its day shares were not read, so the weekly shares are not proposed'); return null; }
        else {
          /* ⛔ 2026-10-24 (defaut 3) : JAMAIS de parts du JOUR proposees pour le dernier jour d une semaine — son dayPot EST le pot de la
           *   semaine, et le serveur refuse ces signatures (POST mode jour -> REFUSE). Avant : des parts du jour deja entamees faisaient
           *   proposer la suite en mode jour. Des signatures du jour deja gardees (avant ce refus) -> rien n est propose, c est dit. */
          if (entame(J0)) { pourquoiPas.push('reward pot: ' + jidHier + ' closes a week but already has day-mode signatures — its pot is the weekly pot: nothing more is proposed for it'); return null; }
          if (!S0) { pourquoiPas.push('reward pot: ' + jidHier + ' closes a week — its weekly shares were not read'); return null; }
          src = S0; week = true;
        }
        if (!src) return null;
        const verifier = bas(src.verifier);
        if (!ADR.test(verifier)) { pourquoiPas.push('reward pot: the verifier was not read'); return null; }
        /* ⛔ COUVERTURE (2026-10-23) : des parts FINALES ne se signent que si le serveur dit que son index de tickets couvre ce jour (ou
         *   cette semaine) — absent, faux ou inconnu -> rien (un index qui a manque des blocs signerait des parts fausses, pour toujours). */
        if (!src.couverture || src.couverture.complete !== true) { pourquoiPas.push('reward pot: the server\'s ticket index does not cover ' + jidHier + (week ? ' (its week)' : '') + ' yet — its final shares are not proposed for signing'); return null; }
        const signe = moi === verifier;
        if (!signe && !proprio) return null;
        const cle = 'POT_SIGN:' + jidHier + (week ? '#S' : '');
        /* l owner qui n est PAS le verifier : une INFORMATION (le lien de la page verifier), montree UNE fois — la cle vue est honoree et
         *   l ordre continue (POT_FUND). Le verifier, lui, recoit la carte tant qu il reste des parts (au-dela de 50, la suivante revient). */
        if (!signe && vus.has(cle)) { pourquoiPas.push('reward pot: the shares of ' + jidHier + ' wait for the verifier wallet (' + displayShort(verifier) + ')'); return null; }
        /* ⛔ 2026-10-24 (revue adverse, 2e tour ticketpot, defaut 4) : une part que le serveur a REFUSEE (409 : une autre part de ce wallet
         *   deja signee et servie) est vue par l app (POT_SIGN_REFUS:<jour>[#S]:<wallet>) — jamais reproposee, sinon la meme carte revenait
         *   a chaque tour pour une signature que le serveur refusera toujours. */
        const aSigner = src.parts.filter((p) => p && !p.signature && ADR.test(bas(p.wallet)) && (brut(p.amount) || 0n) > 0n && p.donnees && typeof p.donnees === 'object'
          && !vus.has('POT_SIGN_REFUS:' + jidHier + (week ? '#S' : '') + ':' + bas(p.wallet)))
          .map((p) => ({ wallet: bas(p.wallet), amount: String(brut(p.amount)), donnees: p.donnees }))
          .sort((a, b) => (a.wallet < b.wallet ? -1 : a.wallet > b.wallet ? 1 : 0)).slice(0, POT_SIGN_MAX);
        if (!aSigner.length) return null;
        const total = aSigner.reduce((a, p) => a + BigInt(p.amount), 0n);
        return { kind: 'POT_SIGN', calls: [], costUsdc: '0', cle,
          why: (signe ? 'Sign ' : 'For your information — the verifier wallet has to sign ') + aSigner.length + ' ' + (week ? 'weekly ' : '') + 'share' + (aSigner.length > 1 ? 's' : '') + ' of ' + jidHier + (week ? ' (it closes the week: the weekly pot, shared by entries)' : '') + ' — ' + usdcTxt(total)
            + ' for the holders to claim. Each share is a typed message signed by the verifier wallet: no transaction, no gas, nothing moves.'
            + (signe ? '' : ' This wallet is not the verifier: shown once, its brain goes on with the next move.'),
          sign: { jourId: jidHier, day: hier, week, verifier, signerIsVerifier: signe, shares: aSigner } };
      };
      const potSign = () => { for (const j of joursPot) { const p = potSignDe(j); if (p) return p; } return null; };
      const potFund = () => {
        const budgetPot = regles.potDailyUsdc;
        if (budgetPot <= 0n) return null;
        if (!ADR.test(bas(P.usdc))) { pourquoiPas.push('reward pot: the USDC address is not known'); return null; }
        /* ⛔ 2026-10-23 (revue adverse) : « deja verse aujourd hui » ne vit plus SEULEMENT dans ce navigateur — dayPot(aujourd hui) LU sur la
         *   chaine (un MAJORANT de ce que l owner a verse : il compte aussi absorb / rollover) ; on garde le plus grand des deux. Non lu -> rien. */
        const auj = P.today && Number(P.today.day) === aujourdhui ? P.today : null;
        const dejaLu = auj ? brut(auj.dayPot) : null;
        if (dejaLu === null) { pourquoiPas.push('reward pot: today\'s pot was not read on chain — no funding proposed'); return null; }
        const verseHist = potVerseLeJour(e.history, aujourdhui);
        if (verseHist === null) { pourquoiPas.push('reward pot: an earlier funding could not be read — no new funding proposed'); return null; }
        const verse = verseHist > dejaLu ? verseHist : dejaLu;
        const resteP = budgetPot > verse ? budgetPot - verse : 0n;
        if (resteP === 0n) pourquoiPas.push('reward pot: today\'s pot already holds ' + usdcTxt(verse) + ', your daily reward budget is ' + usdcTxt(budgetPot));
        else if (solde === null) pourquoiPas.push('reward pot: your USDC balance was not read');
        else if (resteP > solde) pourquoiPas.push('reward pot: this wallet holds ' + usdcTxt(solde) + ', today\'s reward budget left is ' + usdcTxt(resteP));
        else {
          const plan = planFundPot({ contrat: P.contract, usdc: P.usdc, day: aujourdhui, montant: resteP, ferme: false, maintenant: t });
          if (plan.etat !== 'PRET') { pourquoiPas.push('reward pot: ' + plan.pourquoi); return null; }
          const fin = dernierJourDeSemaine(aujourdhui);
          return { ...proposition('POT_FUND', plan.appels, 'Fund today\'s pot (' + jourIdDeDay(aujourdhui) + ') with ' + usdcTxt(resteP) + ' — your daily reward budget' + (verse > 0n ? ' (the pot already holds ' + usdcTxt(verse) + ', read on chain)' : '')
            + (fin ? '. Today closes the week: this is the weekly pot, shared by the week\'s entries.' : ', shared by today\'s ticket holders.') + ' It never comes back to the wallet.', resteP, 'POT_FUND:' + aujourdhui), day: aujourdhui };
        }
        return null;
      };
      const etapes = proprio ? [potClose, potSign, potFund] : [potSign];
      for (const etape of etapes) { const p = etape(); if (p) return p; }
    }
  }
  /* la skin : UNE lecture de propositionSkin, au plafond le plus bas (regle, budget, solde) */
  const S = regles.skins && e.skins && Array.isArray(e.skins.list) && ADR.test(bas(e.skins.usdc)) ? e.skins : null;
  const plafondSkin = min(regles.maxSkinBidUsdc, payable);
  let ps = null;
  if (S) {
    try { ps = propositionSkin({ skins: S.list, moi, block: S.block, maintenant: t, achat: true, devise: bas(S.usdc), parTrade: plafondSkin.toString(), reste: plafondSkin.toString(),
      dejaProposes: new Set([...vus].filter((k) => k.startsWith('SKIN:')).map((k) => k.slice(5))),
      /* le reglement a SA cle (revue adverse 2026-10-18) : une mise du brain ne masque plus le reglement de la meme enchere */
      dejaRegles: new Set([...vus].filter((k) => k.startsWith('SKINREG:')).map((k) => k.slice(8))) }); }
    catch (_) { ps = null; }
  }
  if (ps && ps.genre === 'REGLER') {
    return proposition('SETTLE', [appelRegler(ps.skin.tokenId, ps.skin.contrat || null)], 'The auction of skin #' + ps.skin.tokenId + ' has ended and you are in it — settling hands the skin (or the money) over. No USDC.', 0n, 'SKINREG:' + ps.skin.tokenId);
  }

  /* 2. TAKE_MISSION — une reclamation dont l attestation du verifier est en main */
  const M = e.missions && ADR.test(bas(e.missions.contract)) ? e.missions : null;
  if (regles.missions && M && Array.isArray(M.claimable)) {
    for (const c of M.claimable) {
      if (!c || vus.has('MISSION:' + c.id)) continue;
      try {
        const plan = planReclamer({ contrat: M.contract, taskId: c.id, txHash: c.txHash, held: c.held, signature: c.signature });
        return proposition('TAKE_MISSION', plan.appels, 'Mission #' + c.id + ' is approved for you — claim its reward. No USDC.', 0n, 'MISSION:' + c.id);
      } catch (err) { pourquoiPas.push('mission #' + c.id + ': ' + String((err && err.message) || err).slice(0, 80)); }
    }
  }

  /* 3. ROLL — le pass d abord (0 USDC), sinon paye ; jamais plus de maxRollsPerHour dans l heure */
  if (regles.rolls && R) {
    const faits = rollsDansLHeure(e.history, t);
    if (faits >= regles.maxRollsPerHour) pourquoiPas.push('rolls: ' + faits + ' this hour, the limit is ' + regles.maxRollsPerHour);
    else if (refusGuess(R.guess).length) pourquoiPas.push('rolls: no valid ticket face to guess with');
    else {
      const p = R.pass;
      const passOk = !!p && Number(p.rollsLeft) > 0 && t < Number(p.expiresAt);
      if (passOk) {
        const plan = planRollAvecPass({ contrat: R.contract, guess: R.guess, pass: p, maintenant: t });
        if (plan.etat === 'PRET') return proposition('ROLL', plan.appels, 'Roll on your day pass (' + p.rollsLeft + ' left) with your ticket face — no payment. Block +2 decides.', 0n, 'ROLL:' + t);
      } else {
        const prix = brut(R.rollPrice);
        if (prix === null || prix === 0n) pourquoiPas.push('rolls: the roll price was not read');
        else if (solde === null) pourquoiPas.push('rolls: your USDC balance was not read');
        else if (prix > reste) pourquoiPas.push('rolls: ' + usdcTxt(prix) + ' is above what is left of the budget (' + usdcTxt(reste) + ')');
        else if (prix > solde) pourquoiPas.push('rolls: this wallet holds ' + usdcTxt(solde) + ', a roll is ' + usdcTxt(prix));
        else {
          const plan = planRoll({ contrat: R.contract, usdc: R.usdc, guess: R.guess, rollPrice: prix });
          const pot = brut(R.pot);
          if (plan.etat === 'PRET') return proposition('ROLL', plan.appels, 'Roll for ' + usdcTxt(prix) + ' with your ticket face (half to the pot, half to TokenizedBlock)' + (pot !== null ? ' — pot ' + usdcTxt(pot) : '') + '. Block +2 decides; it counts toward today\'s ticket.', prix, 'ROLL:' + t);
          pourquoiPas.push('rolls: ' + plan.pourquoi);
        }
      }
    }
  }

  /* 3b / 3c. DUELS — en USDC seulement ; la mise ne depasse JAMAIS maxDuelStakeUsdc, le reste du budget ni le solde LU */
  if (regles.duels && D) {
    const plafondDuel = regles.maxDuelStakeUsdc;
    const usdcD = bas(D.usdc);
    /* audit 2026-10-24 (duels-plan-app.js PHRASE_DUELS_FERMES) : ni JOIN ni CREATE tant que le serveur ne dit pas que son regleur regle les
     *   duels (D.open = duelsOuverts(/api/duels), absent = ferme) ; DUEL_SETTLE (1b) reste propose. Round 4 : sur un contrat ou un regleur
     *   ne suffit pas (duels-plan-app.js DUELS_REGLEUR_SUFFIT : BlockDuels v1 LIVE), JAMAIS — meme si D.open dit true */
    if (D.open !== true || duelsFermesParContrat(D.contract)) pourquoiPas.push('duels: new duels are closed (in this contract a player who joins and loses can let the duel expire and take a full refund)');
    else if (!ADR.test(usdcD)) pourquoiPas.push('duels: the USDC address is not known');
    else if (refusGuess(D.guess).length) pourquoiPas.push('duels: no valid face to play with');
    else if (plafondDuel < MISE_MIN_DUEL) pourquoiPas.push('duels: the max stake is below the contract minimum (' + usdcTxt(MISE_MIN_DUEL) + ')');
    else if (solde === null) pourquoiPas.push('duels: your USDC balance was not read');
    else {
      /* 3b. DUEL_JOIN — le moins cher d abord, puis le plus ancien ; jamais le sien, jamais un autre jeton, jamais a moins d une minute de la fin */
      const prenables = etatsDuels.filter(({ d, x }) => x.etat === 'OUVERT' && x.resteS >= MARGE_JOIN_S && bas(d.creator) !== moi && bas(d.token) === usdcD && !vus.has('DUEL_JOIN:' + d.id))
        .map(({ d }) => ({ d, m: brut(d.stake) })).filter(({ m }) => m !== null && m >= MISE_MIN_DUEL)
        .sort((p, q) => (p.m < q.m ? -1 : p.m > q.m ? 1 : 0) || (BigInt(p.d.id) < BigInt(q.d.id) ? -1 : 1));
      let refusJoin = null;
      for (const { d, m } of prenables) {
        if (m > plafondDuel) { refusJoin = refusJoin || 'duels: the cheapest open duel (' + usdcTxt(m) + ') is above your max stake (' + usdcTxt(plafondDuel) + ')'; continue; }
        if (m > reste) { refusJoin = refusJoin || 'duels: ' + usdcTxt(m) + ' is above what is left of the budget (' + usdcTxt(reste) + ')'; continue; }
        if (m > solde) { refusJoin = refusJoin || 'duels: this wallet holds ' + usdcTxt(solde) + ', the duel stake is ' + usdcTxt(m); continue; }
        const plan = (v2 ? DuelsV2.planJoin : planJoin)({ contrat: D.contract, duel: d, guess: D.guess, moi, maintenant: t, sParBloc: D.sParBloc });
        if (plan.etat !== 'PRET') { refusJoin = refusJoin || 'duels: ' + plan.pourquoi; continue; }
        const p = partageDuel(m);
        return proposition('DUEL_JOIN', plan.appels, (v2 ? plan.avertissement + ' ' : '') + 'Accept duel #' + d.id + ' for ' + usdcTxt(m) + ' with a new random face: the block 2 blocks after your join draws its face; the most traits in common wins '
          + usdcTxt(p.gagnant) + ' (90 % of the ' + usdcTxt(p.pot) + ' pot; 7 % to the community reward pool, 3 % to TokenizedBlock). ' + (v2 ? DuelsV2.PHRASE_EGALITE : 'A tie refunds both, no fee.'), m, 'DUEL_JOIN:' + d.id);
      }
      if (refusJoin) pourquoiPas.push(refusJoin);
      /* 3c. DUEL_CREATE — au plus un par heure glissante, et jamais tant qu un des siens attend un adversaire */
      const ouvertsMiens = etatsDuels.filter(({ d, x }) => bas(d.creator) === moi && x.etat === 'OUVERT').length;
      const crees = dansLaFenetre(e.history, 'DUEL_CREATE', t, DUEL_CREATE_INTERVALLE_S);
      const exp = Number(D.expiresIn);
      const expiresIn = Number.isInteger(exp) && exp >= EXPIRATION_MIN_S && exp <= EXPIRATION_MAX_S ? exp : DUEL_EXPIRATION_DEFAUT_S;
      if (ouvertsMiens > 0) pourquoiPas.push('duels: one of your challenges is still waiting for an opponent');
      else if (crees > 0) pourquoiPas.push('duels: one challenge an hour at most');
      else if (plafondDuel > reste) pourquoiPas.push('duels: a ' + usdcTxt(plafondDuel) + ' challenge is above what is left of the budget (' + usdcTxt(reste) + ')');
      else if (plafondDuel > solde) pourquoiPas.push('duels: this wallet holds ' + usdcTxt(solde) + ', a challenge is ' + usdcTxt(plafondDuel));
      else {
        const plan = planCreate({ contrat: D.contract, token: usdcD, stake: plafondDuel, guess: D.guess, expiresIn });
        if (plan.etat === 'PRET') {
          const p = partageDuel(plafondDuel);
          return proposition('DUEL_CREATE', plan.appels, 'Open a duel for ' + usdcTxt(plafondDuel) + ' with a new random face, open ' + Math.round(expiresIn / 60) + ' min: whoever accepts stakes the same; the block 2 blocks after the join decides — the winner takes '
            + usdcTxt(p.gagnant) + ' (90 %), 7 % to the community reward pool, 3 % to TokenizedBlock. Not accepted in time: your stake comes back in full.'
            + (v2 ? ' Accepted but not settled within ' + DuelsV2.FENETRE + ' blocks of its result block: you win by default.' : ''), plafondDuel, 'DUEL_CREATE:' + t);
        }
        pourquoiPas.push('duels: ' + plan.pourquoi);
      }
    }
  } else if (regles.duels && !D) pourquoiPas.push('duels: the duels were not read');

  /* 4. SKINS — acheter / encherir sur une skin du block du brain, jamais au-dessus du plafond de la regle */
  if (S && ps && (ps.genre === 'ACHETER' || ps.genre === 'ENCHERIR')) {
    const m = BigInt(ps.montant);
    /* deuxieme garde, ici : propositionSkin borne deja, mais la promesse « jamais au-dessus du plafond » est celle de CE module */
    if (m > 0n && m <= regles.maxSkinBidUsdc && m <= reste && solde !== null && m <= solde && bas(ps.skin.devise) === bas(S.usdc)) {
      const id = ps.skin.tokenId;
      /* 2026-11-12: approved for and sent to the skin's OWN contract (skins live on several, blockskins.js BLOCKSKINS_LUS) */
      const k = ps.skin.contrat || null;
      const appels = [appelApprouver(S.usdc, m, 'Allow the skins market to take exactly ' + usdcTxt(m), k), ps.genre === 'ACHETER' ? appelAcheter(id, S.usdc, m, k) : appelEncherir(id, S.usdc, m, k)];
      return proposition(ps.genre === 'ACHETER' ? 'BUY_SKIN' : 'BID_SKIN', appels, (ps.genre === 'ACHETER' ? 'Buy skin #' + id + ' for ' : 'Bid the minimum on skin #' + id + ': ')
        + usdcTxt(m) + ' (your limit ' + usdcTxt(regles.maxSkinBidUsdc) + '). 10 % of a sale goes to TokenizedBlock; an outbid offer is credited back to you.', m, 'SKIN:' + id);
    }
  } else if (regles.skins && !S) pourquoiPas.push('skins: the market was not read');

  /* 5. POST_MISSION — une mission a la fois, recompense en USDC (le budget est en USDC : un autre jeton ne se compare pas) */
  if (regles.postMissions && M && M.post) {
    const P = M.post;
    const cle = 'POST:' + bas(P.params && P.params.rewardToken) + ':' + bas(P.cle && P.cle.currency0) + ':' + bas(P.cle && P.cle.currency1);
    if (Number(M.mineOpen) > 0) pourquoiPas.push('post: one of your missions is still open');
    else if (vus.has(cle)) pourquoiPas.push('post: already proposed');
    else if (!ADR.test(bas(M.usdc)) || bas(P.params && P.params.rewardToken) !== bas(M.usdc)) pourquoiPas.push('post: the brain posts only with a USDC reward (the budget is in USDC)');
    else {
      let cout = null;
      try { cout = budgetMission(P.params, P.hold); } catch (_) { cout = null; }
      if (cout === null) pourquoiPas.push('post: the mission budget could not be computed');
      else if (cout > payable) pourquoiPas.push('post: its escrow ' + usdcTxt(cout) + ' is above what the brain may spend (' + usdcTxt(payable) + ')');
      else {
        const plan = planPoster({ contrat: M.contract, cle: P.cle, params: P.params, hold: P.hold, maintenant: t, poolManager: P.poolManager || null });
        if (plan.etat === 'PRET') return proposition('POST_MISSION', plan.appels, 'Post a mission for your block: escrow ' + usdcTxt(cout) + ' (' + P.params.maxDone + ' × ' + usdcTxt(BigInt(P.params.reward)) + '). Anyone who does it on Base is paid by the contract.', cout, cle);
        pourquoiPas.push('post: ' + plan.pourquoi);
      }
    }
  }
  return rien(pourquoiPas.length ? 'Nothing to play right now — ' + pourquoiPas.join('; ') + '.' : 'Nothing to play right now.');
}
