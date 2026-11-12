/* misables.js — PAYER UN JEU EN USDC AVEC UN AUTRE JETON (Phil, 2026-10-24 : « les joueurs misent en USDC OU en tout B20 / action
 * tokenisee de l app ; l app swappe en USDC pour payer ; seul ce qui a une liquidite profonde est propose »).
 *
 * ⛔⛔ LES CONTRATS DE JEU NE CHANGENT PAS : BlockRolls, BlockSlots, BlockDuels, TicketPot et le week pass prennent de l USDC et sont
 *   immuables. « Payer en NVDAc » = des appels que le WALLET DU JOUEUR signe, dans cet ordre :
 *     1. approve(jeton -> routeur Aerodrome CL, MAX-IN EXACT = devis x (1 + tolerance)) — jamais illimite ;
 *     2. le swap EXACT-OUTPUT : exactOutputSingle(jeton -> USDC, sortie EXACTE) — l USDC arrive AU JOUEUR (frais 0) ou, avec le frais
 *        d interface de l app, chez le routeur puis sweepTokenWithFee vers LE JOUEUR, dans le MEME multicall ;
 *     3. approve(jeton -> routeur, 0) : l allocation qui reste (max-in moins ce que le swap a pris) est remise a zero ;
 *     4. les appels du jeu, TELS QUE LES CONSTRUISENT ses modules (planRolls, planPass, Slots.planSpins, planFund, Duels.planCreate /
 *        planJoin) — rien n est recopie : l approve USDC exact et l appel du jeu sont les leurs, inchanges.
 *   L ETH natif : pas d approve ; multicall payable (value = max-in) [exactOutputSingle(WETH -> USDC), (sweepTokenWithFee), refundETH()].
 *
 * ⛔ CE QUI EST MISABLE (eligibilite) — une REGLE, appliquee a un devis LU, jamais une liste ecrite a la main :
 *   - la route est EXECUTABLE PAR NOUS : 'aerodrome-cl', une pool de la factory 0xf8f2…61ef que declare notre routeur 0x698c…a92f. Une
 *     pool de la factory 0x9cb2…7a76 (« aero » chez DexScreener) est INJOIGNABLE par ce routeur (routage.js, raisonSansBuy) ; une pool v4
 *     n a pas de chemin exact-output construit ici (pool.js ne connait que SWAP_EXACT_IN_SINGLE) ;
 *   - un devis exact-output present a la taille demandee (0,50 / 5 / 10 USDC mesures) ;
 *   - l ECART (cout total vs le prix moyen du slot0, FRAIS DE LA POOL COMPRIS) <= SEUIL_ECART_BPS ;
 *   - la pool tient au moins PROFONDEUR_MIN_USDC d USDC (balanceOf de la pool).
 *   Le seuil et la profondeur sont justifies par la mesure du 2026-10-24 (mesures/misables-20261024.json, voir plus bas).
 *
 * ⛔ REFUS NOMMES, AVANT TOUTE SIGNATURE : devis perime (> DEVIS_BLOCS_MAX blocs), jeton non eligible (et pourquoi), route injoignable
 *   ou non construite, destinataire qui n est pas le joueur, tolerance hors bornes, devis pour un autre montant que celui du jeu.
 *
 * Pur : aucun reseau sauf `coterMisable`, dont le `rpc` est INJECTE. Rien n est signe ni envoye ici. */
import { ROUTEUR_AERODROME_CL, FACTORY_AERODROME_CL, FRAIS_INTERFACE_BPS_CL, FRAIS_BPS_MAX_PRUDENT, SELECTEURS, calldataApprove } from './calldata-aerodrome.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { planRolls, planPass } from './blockrolls-plan.js';
import { planSpins } from './slots-plan.js';
import { planFund } from './ticketpot-plan.js';
import { planCreate as planCreateDuel, planJoin as planJoinDuel } from './duels-plan-app.js';
import { FEE_WALLET } from './frais-creation.js';
import { planMintTam, planMintTamRouteur } from './tam-plan.js';
import { selecteur } from './keccak.js';

/* ── adresses (copiees des modules qui les ont mesurees) ─────────────────────────────────────────────────── */
export const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
export const WETH = '0x4200000000000000000000000000000000000006';
export const ETH = '0x0000000000000000000000000000000000000000';
/** la factory des pools « aero » de DexScreener : factory() LU sur leurs pools (routage.js, 14/14 au bloc 52 995 302 ; re-lu le
 *  2026-10-24 par mesure-misables-20261024.mjs). Notre routeur Aerodrome ne l a pas : une pool de cette factory n est PAS misable. */
export const FACTORY_NOUVELLE_INJOIGNABLE = '0x9cb220581b91b0c83223012fe69688b92ad07a76';
/** le quoter des pools CL de la factory du routeur (rolls-en-action.js : factory() = FACTORY_AERODROME_CL, re-lu par la mesure) */
export const QUOTEUR_CL = '0x514c8b5f54112481e28028f1166bd78501089259';

/* ── la regle, et pourquoi ces chiffres ─────────────────────────────────────────────────────────────────────── */
/** ⛔ 1 % (100 bps), FRAIS DE LA POOL COMPRIS. Mesure 2026-10-24 (bloc dans mesures/misables-20261024.json) : les pools CL d actions
 *  joignables qui passent le font avec une marge large (voir MESURE_REFERENCE) ; au-dela de 1 %, un roll de 0,50 USDC coute plus d un
 *  demi-centime de change — plus que le frais d interface de l app (0,1 %) dix fois. Les pools v4 USDC/action ont un frais de pool de
 *  3 % a 8 % : AUCUNE ne peut passer, ce qui est voulu (miser n y serait pas « au prix »). */
export const SEUIL_ECART_BPS = 100;
/** ⛔ 10 000 USDC dans la pool : 1 000 fois la plus grosse mise mesuree (10 USDC, un week pass). Sous ce seuil, une pool qui passe
 *  encore le devis a 10 USDC peut etre videe entre le devis et la signature par un seul echange ordinaire. */
export const PROFONDEUR_MIN_USDC = 10000000000n;
/** ⛔ un devis plus vieux que 30 blocs est refuse : 60 s a 2 s/bloc (mesure du jour dans le JSON) ; apres Denim (200 ms/bloc) la borne
 *  devient 6 s — PLUS stricte, jamais plus lache. Le plan se batit a la seconde du devis : la borne ne gene que l oubli. */
export const DEVIS_BLOCS_MAX = 30;
/** les tailles mesurees : un roll ou un spin, dix rolls, un week pass (10 USDC) */
export const TAILLES_USDC = Object.freeze([500000n, 5000000n, 10000000n]);
/** tolerance par defaut sur le max-in (0,5 %) et ses bornes */
export const TOLERANCE_DEFAUT_BPS = 50n;
export const TOLERANCE_MAX_BPS = 300n;
/** delai du swap : 3 min (les deux transactions temoins de calldata-aerodrome : +85 s et +598 s) */
export const DELAI_S = 180;
export const ROUTES = Object.freeze({ CL: 'aerodrome-cl', V4: 'v4', NOUVELLE: 'aero-nouvelle' });
export const ETATS = Object.freeze(['PRET', 'REFUSE', 'NON_MESURE']);

/* ── les candidats que le serveur cote : les pools CL d actions mesurees + le WETH/USDC (ETH natif) ──────────────────────────── */
/** les pools WETH/USDC de la factory du routeur, pour l ETH natif. Adresses rendues par getPool(USDC, WETH, ts) sur FACTORY_AERODROME_CL
 *  (mesure 2026-10-24, bloc 53 031 600) : ts 50 — 765 291 USDC, ecart 5/5/5 bps ; ts 1 — 11 428 USDC, ecart 0/0/1 bps. La ts 10
 *  (825 USDC) est sous la profondeur minimum : pas candidate. */
export const POOLS_WETH_USDC = Object.freeze([
  Object.freeze({ pool: '0x3fe04a59ebd38cf06080a6f60a98d124eb59392a', tickSpacing: 50 }),
  Object.freeze({ pool: '0x4e392fbfe4d0557c82d2f97f02ec39daa31516dd', tickSpacing: 1 }),
]);
/** ⛔ LA MESURE QUI FIXE LA REGLE (mesures/misables-20261024.json, bloc 53 031 600, 2 000 ms/bloc, 68 requetes HTTP en lots) :
 *  231 jetons (71 actions du registre, 159 autres jetons du Market dont UNIT, l ETH). Devis exact-output obtenu : 42 / 36 / 35 jetons a
 *  0,50 / 5 / 10 USDC ; ecart <= 1 % (toute route) : 31 / 23 / 21 ; MISABLES par cette regle : 21 / 20 / 19.
 *  - le seuil de 1 % tombe dans un TROU de la distribution a 0,50 USDC : parmi les 28 pools joignables d au moins 10 000 USDC, 21 sont a
 *    0..9 bps (frais de pool 0,8 a 5,75 bps), HSAIc a 95 bps, puis RIEN avant 396 bps : les six autres sont des pools ts 1 de ~25 397 USDC
 *    dont la liquidite n est PAS au prix (NVOc 3,96 %, VALEc 6,22 %, PDDc 7,81 %, NIOc 10,15 %, WRDc 13,10 %, BILIc 14,01 %). Les pools
 *    sous 1 % mais peu profondes (NFLXc 1 212 USDC, ETH ts 10 826, LLYc 240, et douze pools de 4 a 102 USDC) : la profondeur les retire ;
 *  - les 20 pools v4 USDC/action ont un frais de 3 % a 8 % : leurs devis sont a 320..927 bps, aucune ne passe ;
 *  - la profondeur minimum (10 000 USDC) tombe aussi dans un trou : la plus petite pool eligible tient 11 428 USDC (WETH ts 1), la plus
 *    grande des exclues 1 212 USDC (NFLXc, dont l ecart passerait : 5/7/9 bps) ;
 *  - la reference au meme bloc (la pool la plus liquide du marche, souvent sur la nouvelle factory) est a -9..+9 bps de nos pools
 *    eligibles : le cout contre le marche ne retire aucune d entre elles aujourd hui (INFYc ts 10 et ULc ts 10 sont retirees par lui).
 *  ⛔ ULc compte dans les 21 mais n est PAS candidat : il est au Market, pas dans le registre de l emetteur (paires.js), et un prefixe
 *    0xb2… s imite. Les candidats servis sont les pools de POOLS_ACTIONS_AERODROME (registre) et l ETH : 20 / 19 / 18 misables au bloc. */
export const MESURE_REFERENCE = Object.freeze({ fichier: 'mesures/misables-20261024.json', bloc: 53031600, misables: Object.freeze([21, 20, 19]), cotes: Object.freeze([42, 36, 35]), jetons: 231 });
export const CANDIDATS_CL = Object.freeze([
  ...[...POOLS_ACTIONS_AERODROME.entries()].map(([adr, t]) => Object.freeze({ jeton: adr, jetonIn: adr, symbole: t.symbole, famille: 'action', pool: t.pool, tickSpacing: Number(t.tickSpacing), natif: false })),
  ...POOLS_WETH_USDC.map((p) => Object.freeze({ jeton: ETH, jetonIn: WETH, symbole: 'ETH', famille: 'eth', pool: p.pool, tickSpacing: p.tickSpacing, natif: true })),
]);

const ADR = /^0x[0-9a-fA-F]{40}$/;
const bas = (x) => String(x || '').toLowerCase();
const entier = (v) => { try { return v === null || v === undefined || v === '' ? null : BigInt(v); } catch (_) { return null; } };
const refuse = (code, pourquoi, extra = {}) => ({ etat: 'REFUSE', code, pourquoi, appels: [], ...extra });
const nonMesure = (pourquoi, extra = {}) => ({ etat: 'NON_MESURE', code: 'NON_MESURE', pourquoi, appels: [], ...extra });
const mot = (n, nom) => { const v = BigInt(n); if (v < 0n || v >= (1n << 256n)) throw new Error((nom || 'uint256') + ' out of range'); return v.toString(16).padStart(64, '0'); };
const motA = (a, nom) => { if (!ADR.test(String(a || ''))) throw new Error((nom || 'address') + ': whole address expected'); return bas(a).slice(2).padStart(64, '0'); };
const motI24 = (n) => { const v = BigInt(n); if (v < -(1n << 23n) || v >= (1n << 23n)) throw new Error('int24 out of range'); return (v < 0n ? v + (1n << 256n) : v).toString(16).padStart(64, '0'); };
const plafond = (a, b) => (a + b - 1n) / b;
const UINT256_MAX = (1n << 256n) - 1n;

/** les selecteurs du routeur que ce module appelle. ⛔ PRESENTS dans le bytecode LU du routeur (PUSH4), sonde du 2026-10-24 :
 *  exactOutputSingle 0xc714e838, sweepTokenWithFee 0xe0e189a0, refundETH 0x12210e8a, multicall(bytes[]) 0xac9650d8 ;
 *  0/2 signatures inventees trouvees. test-misables recalcule chaque selecteur depuis sa signature. */
export const SIG = Object.freeze({
  exactOutputSingle: 'exactOutputSingle((address,address,int24,address,uint256,uint256,uint256,uint160))',
  sweepTokenWithFee: 'sweepTokenWithFee(address,uint256,address,uint256,address)',
  refundETH: 'refundETH()',
  multicall: 'multicall(bytes[])',
  approve: 'approve(address,uint256)',
  quoteExactOutputSingle: 'quoteExactOutputSingle((address,address,uint256,int24,uint160))',
  slot0: 'slot0()',
  balanceOf: 'balanceOf(address)',
});

/* ════════════════════════════════════════════════ LA REGLE ════════════════════════════════════════════════ */

/** la taille mesuree qui couvre `usdc` (la plus petite >= usdc), ou null au-dela de 10 USDC */
export function tailleCouvrante(usdc) {
  const u = entier(usdc);
  if (u === null || u <= 0n) return null;
  return TAILLES_USDC.find((t) => t >= u) ?? null;
}

/**
 * EST-CE MISABLE, D APRES CE DEVIS ? Rend { ok, code, raison, ecartBps }.
 * @param {object} m  { jeton, route, factory, usdcPool, devis: [{ usdc, ok, montantIn, ecartBps }] } — une ligne de mesure ou un devis vivant
 * @param {object} [o] { usdc (la mise, defaut 0,50), seuilBps, profondeurMin }
 */
export function eligibilite(m, o = {}) {
  const seuil = Number.isFinite(Number(o.seuilBps)) ? Number(o.seuilBps) : SEUIL_ECART_BPS;
  const profMin = entier(o.profondeurMin) ?? PROFONDEUR_MIN_USDC;
  const non = (code, raison, extra = {}) => ({ ok: false, code, raison, ecartBps: null, ...extra });
  if (!m || typeof m !== 'object') return non('SANS_MESURE', 'no measurement for this token');
  if (bas(m.jeton) === USDC) return { ok: true, code: 'USDC', raison: 'USDC pays the game directly, no swap', ecartBps: 0 };
  if (bas(m.factory) === FACTORY_NOUVELLE_INJOIGNABLE || m.route === ROUTES.NOUVELLE) {
    return non('ROUTE_INJOIGNABLE', 'its pool is on the newer factory 0x9cb2…7a76, which the router this app uses cannot address');
  }
  if (m.route === ROUTES.V4) return non('ROUTE_NON_CONSTRUITE', 'its pool is a v4 pool: no exact-output swap is built for v4 in this app');
  if (m.route !== ROUTES.CL) return non('SANS_ROUTE', 'no pool our router can reach was found for this token');
  if (bas(m.factory) !== FACTORY_AERODROME_CL) return non('ROUTE_INJOIGNABLE', 'its pool is not on the factory of our router (' + String(m.factory || 'unread').slice(0, 42) + ')');
  const taille = tailleCouvrante(o.usdc ?? TAILLES_USDC[0]);
  if (taille === null) return non('TAILLE_NON_MESUREE', 'stakes above 10 USDC are not measured: nothing larger is offered');
  const d = Array.isArray(m.devis) ? m.devis.find((x) => entier(x && x.usdc) === taille) : null;
  /* 2026-10-25 : un devis NON LU (refus de debit, `0x`) n est pas « pas de devis » : NON_MESURE, que le serveur relit et nomme */
  if (d && d.ok !== true && d.nonLu === true) return non('NON_MESURE', 'the quote for ' + taille + ' raw USDC was not read' + (d.erreur ? ' (' + String(d.erreur).slice(0, 80) + ')' : ''));
  if (!d || d.ok !== true || !(entier(d.montantIn) > 0n)) return non('SANS_DEVIS', 'no exact-output quote for ' + taille + ' raw USDC' + (d && d.erreur ? ' (' + String(d.erreur).slice(0, 80) + ')' : ''));
  const e = Number(d.ecartBps);
  if (!Number.isFinite(e)) return non('SANS_DEVIS', 'the quote has no price gap');
  if (e > seuil) return non('ECART', 'paying ' + taille + ' raw USDC costs ' + (e / 100).toFixed(2) + '% over the pool mid price (above ' + (seuil / 100).toFixed(2) + '%)', { ecartBps: e });
  /* la REFERENCE (la pool la plus liquide du jeton, toute factory, lue au meme bloc) : si notre pool paie moins d USDC par jeton, le
   *   joueur vend sous le marche — le cout se compte contre la reference, pas seulement contre notre pool. Absente : non jugee, et dit. */
  /* 2026-10-25 : la reference a ete DEMANDEE mais pas lue (appel refuse, `0x`) : le cout contre le marche n est pas connu — refuse, jamais « non jugee » */
  if (m.referenceLue === false) return non('REFERENCE_NON_LUE', 'the price of its deepest pool (the Market reference) could not be read at this block: its cost against the market is unknown', { ecartBps: e });
  const cr = coutVsReference({ ecartBps: e, ecartReferenceBps: m.ecartReferenceBps });
  if (cr !== null && cr > seuil) return non('SOUS_LE_MARCHE', 'its reachable pool prices it ' + (Math.abs(Number(m.ecartReferenceBps)) / 100).toFixed(2) + '% below its deepest pool: paying costs ' + (cr / 100).toFixed(2) + '% vs that market (above ' + (seuil / 100).toFixed(2) + '%)', { ecartBps: e, coutReferenceBps: cr });
  const prof = entier(m.usdcPool);
  if (prof === null) return non('PROFONDEUR_NON_LUE', 'the USDC held by its pool was not read', { ecartBps: e });
  if (prof < profMin) return non('PEU_PROFONDE', 'its pool holds ' + prof + ' raw USDC, under the ' + profMin + ' minimum', { ecartBps: e });
  return { ok: true, code: 'MISABLE', raison: null, ecartBps: e, coutReferenceBps: cr, taille };
}

/** le cout (bps) contre la REFERENCE : (1 + ecart) / (1 + ecartReference) - 1. ecartReference = USDC par jeton chez nous / chez la
 *  reference - 1 (negatif : notre pool paie moins). null si la reference n est pas lue. */
export function coutVsReference({ ecartBps, ecartReferenceBps }) {
  if (ecartReferenceBps === null || ecartReferenceBps === undefined || ecartReferenceBps === '') return null;
  const e = Number(ecartBps), r = Number(ecartReferenceBps);
  if (!Number.isFinite(e) || !Number.isFinite(r) || r <= -10000) return null;
  return Math.round(((10000 + e) * 10000) / (10000 + r) - 10000);
}

/** l USDC a faire SORTIR du swap pour que le joueur recoive au moins `besoin` apres le frais d interface (frais 0 : besoin lui-meme).
 *  sweepTokenWithFee retient floor(solde x bps / 10000) : on cherche le plus petit X tel que X - floor(X x bps / 10000) >= besoin. */
export function usdcAViser({ besoin, fraisBps = FRAIS_INTERFACE_BPS_CL }) {
  const b = entier(besoin), f = entier(fraisBps);
  if (b === null || b <= 0n || f === null || f < 0n || f >= 10000n) return null;
  if (f === 0n) return b;
  let x = plafond(b * 10000n, 10000n - f);
  while (x - (x * f) / 10000n < b) x += 1n;
  while (x > b && (x - 1n) - ((x - 1n) * f) / 10000n >= b) x -= 1n;
  return x;
}

/** le MAX-IN : le devis plus la tolerance, arrondi vers le haut. Jamais illimite. */
export function maxEntree(montantIn, toleranceBps = TOLERANCE_DEFAUT_BPS) {
  const m = entier(montantIn), t = entier(toleranceBps);
  if (m === null || m <= 0n || t === null || t < 0n || t > TOLERANCE_MAX_BPS) return null;
  return plafond(m * (10000n + t), 10000n);
}

/* ═══════════════════════════════════════════════ LE CALLDATA ══════════════════════════════════════════════ */

/** exactOutputSingle du routeur Aerodrome CL. Champs dans l ordre de exactInputSingle (calldata-aerodrome, decode sur 2 tx reelles) ;
 *  l ordre de CETTE variante est prouve par le banc fork (banc-misables-fork-20261024) : la sortie recue est EXACTEMENT amountOut. */
export function calldataExactOutputSingleCL({ tokenIn, tokenOut, tickSpacing, recipient, deadline, amountOut, amountInMaximum }) {
  const out = entier(amountOut), max = entier(amountInMaximum), dl = entier(deadline), ts = entier(tickSpacing);
  if (out === null || out <= 0n) throw new Error('amountOut must be > 0');
  if (max === null || max <= 0n) throw new Error('amountInMaximum must be > 0');
  if (max === UINT256_MAX) throw new Error('an unlimited amountInMaximum is refused');
  if (dl === null || dl <= 0n) throw new Error('an absolute deadline is required');
  if (ts === null || ts <= 0n) throw new Error('tickSpacing must be a positive pool spacing');
  if (/^0x0{40}$/i.test(String(recipient || ''))) throw new Error('the recipient cannot be the zero address');
  return selecteur(SIG.exactOutputSingle) + motA(tokenIn, 'tokenIn') + motA(tokenOut, 'tokenOut') + motI24(ts) + motA(recipient, 'recipient')
    + mot(dl, 'deadline') + mot(out, 'amountOut') + mot(max, 'amountInMaximum') + mot(0n);
}
export const calldataSweepTokenWithFee = ({ token, amountMinimum, recipient, feeBips, feeRecipient }) =>
  selecteur(SIG.sweepTokenWithFee) + motA(token) + mot(amountMinimum) + motA(recipient) + mot(feeBips) + motA(feeRecipient);
/** multicall(bytes[]) : offset du tableau, longueur, un offset par element (relatif au debut du tableau), puis chaque element */
export function calldataMulticall(elements) {
  const els = elements.map((d) => { const h = String(d).replace(/^0x/, ''); return mot(h.length / 2) + h.padEnd(Math.ceil(h.length / 64) * 64, '0'); });
  let curseur = BigInt(32 * els.length);
  const offsets = els.map((e) => { const o = mot(curseur); curseur += BigInt(e.length / 2); return o; });
  return selecteur(SIG.multicall) + mot(0x20) + mot(els.length) + offsets.join('') + els.join('');
}
const approveBrut = (token, spender, montant) => ({ to: bas(token), data: selecteur(SIG.approve) + motA(spender) + mot(montant), value: '0x0' });

/* ═════════════════════════════════════════ LE JEU : SES PROPRES BUILDERS ══════════════════════════════════════ */

/** les appels USDC du jeu, construits par LE module du jeu (rien n est recopie). Rend le plan du jeu. */
export function planJeuUsdc(jeu = {}) {
  const c = jeu.contrat;
  switch (jeu.genre) {
    case 'rolls': return planRolls({ contrat: c, usdc: USDC, guesses: jeu.guesses, rollPrice: jeu.rollPrice });
    case 'pass': return planPass({ contrat: c, usdc: USDC, passPrice: jeu.passPrice, pass: jeu.pass ?? null, maintenant: jeu.maintenant });
    case 'spins': return planSpins({ contrat: c, usdc: USDC, n: jeu.n ?? 1, spinPrice: jeu.spinPrice });
    case 'ticketpot': return planFund({ contrat: c, usdc: USDC, day: jeu.day, montant: jeu.montant, ferme: jeu.ferme ?? false, maintenant: jeu.maintenant });
    /* 2026-10-31 (TAM phase C) : le mint d une oeuvre, 5 USDC tout droit au FEE_WALLET (tam-plan.js : approve exact puis mint) */
    case 'tam': return planMintTam({ deploiement: jeu.deploiement, lu: jeu.lu, octets: jeu.octets, graine: jeu.graine, paramsJson: jeu.paramsJson });
    /* 2026-11-12 : le mint sur TAM art du pack, paye par le routeur TBLOCK — jeu.contrat = le ROUTEUR (c est lui que l approve vise) */
    case 'tam-routeur': return planMintTamRouteur({ pack: jeu.pack, lu: jeu.lu, octets: jeu.octets, graine: jeu.graine, paramsJson: jeu.paramsJson, minOut: jeu.minOut, deadline: jeu.deadline });
    case 'duel-create': return planCreateDuel({ contrat: c, token: USDC, stake: jeu.stake, guess: jeu.guess, expiresIn: jeu.expiresIn });
    case 'duel-join':
      if (!jeu.duel || bas(jeu.duel.token) !== USDC) return { etat: 'REFUSE', pourquoi: 'only a duel staked in USDC can be joined by paying with another token' };
      return planJoinDuel({ contrat: c, duel: jeu.duel, guess: jeu.guess, moi: jeu.moi, maintenant: jeu.maintenant });
    default: return { etat: 'REFUSE', pourquoi: 'unknown game: ' + String(jeu.genre).slice(0, 20) };
  }
}

/** l USDC que le plan du jeu demande : son PREMIER appel est approve(USDC -> contrat du jeu, montant EXACT). Decode et verifie. */
export function besoinDuJeu(plan, contrat) {
  const a0 = plan && Array.isArray(plan.appels) ? plan.appels[0] : null;
  const sel = selecteur(SIG.approve);
  if (!a0 || bas(a0.to) !== USDC || !String(a0.data || '').toLowerCase().startsWith(sel) || String(a0.data).length !== 2 + 8 + 128) return null;
  const spender = '0x' + String(a0.data).slice(10 + 24, 10 + 64).toLowerCase();
  if (spender !== bas(contrat)) return null;
  const m = BigInt('0x' + String(a0.data).slice(74, 138));
  return m > 0n && m !== UINT256_MAX ? m : null;
}

/* ═════════════════════════════════════════════ LE PLAN ════════════════════════════════════════════════════ */

/**
 * PAYER UN JEU AVEC `devis.jeton`. Pur. Rend { etat, code, pourquoi, appels, resume }.
 * @param {object} p.devis      un devis VIVANT (coterMisable) : { jeton, jetonIn, natif, symbole, route, factory, pool, tickSpacing, usdcSortie,
 *                              montantIn, ecartBps, usdcPool, bloc }
 * @param {string} p.compte     le joueur : il signe, et c est LUI qui recoit l USDC du swap
 * @param {object} p.jeu        { genre, contrat, ... } (planJeuUsdc)
 * @param {number} p.blocActuel la tete lue a l instant
 * @param {number} p.maintenant secondes (le deadline du swap = maintenant + DELAI_S)
 */
export function planPayerEnJeton({ devis, compte, jeu, blocActuel, maintenant, toleranceBps = TOLERANCE_DEFAUT_BPS, fraisBps = FRAIS_INTERFACE_BPS_CL,
  beneficiaireFrais = FEE_WALLET, seuilBps = SEUIL_ECART_BPS, profondeurMin = PROFONDEUR_MIN_USDC } = {}) {
  if (!ADR.test(String(compte || '')) || /^0x0{40}$/i.test(String(compte))) return refuse('COMPTE', 'the player account must be a whole, non-zero address');
  if (bas(compte) === bas(ROUTEUR_AERODROME_CL)) return refuse('DESTINATAIRE', 'the USDC must reach the player, never the router');
  if (!jeu || !ADR.test(String(jeu.contrat || ''))) return refuse('JEU', 'the game contract address is required');
  const planJeu = planJeuUsdc(jeu);
  if (!planJeu || planJeu.etat !== 'PRET') return refuse('JEU', 'the game refuses: ' + String((planJeu && planJeu.pourquoi) || 'no plan'));
  const besoin = besoinDuJeu(planJeu, jeu.contrat);
  if (besoin === null) return refuse('JEU', 'the game plan does not start with an exact USDC approval to its contract');
  const resumeJeu = { genre: jeu.genre, contrat: bas(jeu.contrat), besoinUsdc: besoin };

  /* payer en USDC : le plan du jeu, tel quel */
  if (!devis || bas(devis.jeton) === USDC) {
    if (devis && bas(devis.jeton) === USDC) return { etat: 'PRET', code: 'USDC', pourquoi: null, appels: planJeu.appels, exigeAtomique: false, resume: { ...resumeJeu, jeton: USDC, symbole: 'USDC', swap: null } };
    return refuse('SANS_DEVIS', 'no live quote: nothing is built on an unread price');
  }

  /* le devis : frais, au bon montant, de la bonne route */
  const bq = Number(devis.bloc), bt = Number(blocActuel);
  if (!Number.isSafeInteger(bq) || !Number.isSafeInteger(bt) || bq <= 0 || bt <= 0) return refuse('DEVIS_PERIME', 'the quote block or the head block is unknown');
  if (bq > bt) return refuse('DEVIS_PERIME', 'the quote is from block ' + bq + ', after the head ' + bt + ': inconsistent reads');
  if (bt - bq > DEVIS_BLOCS_MAX) return refuse('DEVIS_PERIME', 'the quote is ' + (bt - bq) + ' blocks old (more than ' + DEVIS_BLOCS_MAX + '): quote again');
  const el = eligibilite({ ...devis, devis: [{ usdc: String(tailleCouvrante(besoin) ?? 0n), ok: true, montantIn: devis.montantIn, ecartBps: devis.ecartBps }] }, { usdc: besoin, seuilBps, profondeurMin });
  if (!el.ok) return refuse(el.code, 'not bettable with ' + String(devis.symbole || devis.jeton).slice(0, 24) + ': ' + el.raison, { ecartBps: el.ecartBps });
  const f = entier(fraisBps);
  if (f === null || f < 0n || f > FRAIS_BPS_MAX_PRUDENT) return refuse('FRAIS', 'the interface fee must be 0..' + FRAIS_BPS_MAX_PRUDENT + ' bps');
  if (f > 0n && !ADR.test(String(beneficiaireFrais || ''))) return refuse('FRAIS', 'a whole fee-recipient address is required');
  const vise = usdcAViser({ besoin, fraisBps: f });
  if (entier(devis.usdcSortie) !== vise) return refuse('DEVIS_MONTANT', 'the quote is for ' + devis.usdcSortie + ' raw USDC out, the game needs ' + vise + ' (fee included): quote that amount');
  const tol = entier(toleranceBps);
  if (tol === null || tol < 1n || tol > TOLERANCE_MAX_BPS) return refuse('TOLERANCE', 'the slippage cap must be 1..' + TOLERANCE_MAX_BPS + ' bps');
  const maxIn = maxEntree(devis.montantIn, tol);
  if (maxIn === null) return refuse('DEVIS', 'the quoted input is not a positive amount');
  const ts = Number(devis.tickSpacing);
  if (!Number.isInteger(ts) || ts <= 0) return refuse('DEVIS', 'the pool tickSpacing is missing');
  const natif = devis.natif === true;
  const jetonIn = natif ? WETH : bas(devis.jetonIn || devis.jeton);
  if (natif && bas(devis.jeton) !== ETH) return refuse('DEVIS', 'a native quote must be for ETH');
  if (!natif && jetonIn !== bas(devis.jeton)) return refuse('DEVIS', 'the quoted input token is not the token paid');
  const now = Number(maintenant);
  if (!Number.isSafeInteger(now) || now <= 0) return refuse('HORLOGE', 'the current time (seconds) is required for the swap deadline');
  const deadline = BigInt(now + DELAI_S);

  /* le swap : la sortie EXACTE va au joueur (frais 0), ou au routeur puis balayee vers le joueur avec le frais, dans le MEME multicall */
  let swapData;
  const destSwap = f > 0n ? ROUTEUR_AERODROME_CL : bas(compte);
  try {
    const eo = calldataExactOutputSingleCL({ tokenIn: jetonIn, tokenOut: USDC, tickSpacing: ts, recipient: destSwap, deadline, amountOut: vise, amountInMaximum: maxIn });
    const parts = [eo];
    if (f > 0n) parts.push(calldataSweepTokenWithFee({ token: USDC, amountMinimum: besoin, recipient: compte, feeBips: f, feeRecipient: beneficiaireFrais }));
    if (natif) parts.push(selecteur(SIG.refundETH));
    swapData = parts.length === 1 ? eo : calldataMulticall(parts);
  } catch (e) { return refuse('CALLDATA', String((e && e.message) || e).slice(0, 160)); }
  const sym = String(devis.symbole || '').replace(/[^A-Za-z0-9.$-]/g, '').slice(0, 16) || 'token';
  const appelSwap = { to: ROUTEUR_AERODROME_CL, data: swapData, value: natif ? '0x' + maxIn.toString(16) : '0x0',
    quoi: 'swap at most ' + maxIn + ' raw ' + sym + ' for exactly ' + vise + ' raw USDC' + (f > 0n ? ' (' + (Number(f) / 100).toFixed(2) + '% of it kept by the app, at least ' + besoin + ' reach you)' : ', sent to you') + (natif ? '; unused ETH comes back' : '') };
  const appels = [];
  if (!natif) {
    const ap = calldataApprove({ token: jetonIn, montant: maxIn, beneficiaire: ROUTEUR_AERODROME_CL });
    if (ap.etat !== 'PRET') return refuse('APPROBATION', ap.pourquoi);
    appels.push({ to: ap.to, data: ap.data, value: '0x0', quoi: 'approve exactly ' + maxIn + ' raw ' + sym + ' (quote + ' + (Number(tol) / 100).toFixed(2) + '%) for the Aerodrome router' });
  }
  appels.push(appelSwap);
  if (!natif) appels.push({ ...approveBrut(jetonIn, ROUTEUR_AERODROME_CL, 0n), quoi: 'reset the ' + sym + ' allowance of the router to 0 (what the swap did not use)' });
  for (const a of planJeu.appels) appels.push({ ...a, value: a.value || '0x0' });
  const fraisMax = vise - besoin;
  return {
    etat: 'PRET', code: 'PRET', pourquoi: null, appels,
    /* ⛔ pas d atomicite exigee : l USDC du swap arrive AU JOUEUR ; si un appel suivant echoue, il garde son USDC. Un lot atomique
     *   (wallet_sendCalls atomicRequired) reste PREFERE : une seule signature, et rien de partiel. */
    exigeAtomique: false, atomiquePrefere: true,
    resume: { ...resumeJeu, jeton: bas(devis.jeton), symbole: sym, natif, route: ROUTES.CL, pool: bas(devis.pool), tickSpacing: ts,
      maxEntree: maxIn, entreeCotee: entier(devis.montantIn), toleranceBps: tol, usdcSortie: vise, usdcRecuAuMoins: besoin, fraisBps: f, fraisUsdcMax: fraisMax,
      ecartBps: Number(devis.ecartBps), devisBloc: bq, blocsDepuisDevis: bt - bq, deadline: Number(deadline), destinataireUsdc: bas(compte),
      phrase: 'You pay at most ' + maxIn + ' raw ' + sym + '; the swap returns exactly ' + vise + ' raw USDC' + (f > 0n ? ', of which at least ' + besoin + ' reach you' : ' to you')
        + ', and the game takes ' + besoin + ' raw USDC. Price gap vs the pool mid: ' + (Number(devis.ecartBps) / 100).toFixed(2) + '%.' },
  };
}

/* ═══════════════════════════════════ LE DEVIS VIVANT (rpc injecte, lecture seule) ═══════════════════════════════════ */

const lireMot = (hex, i = 0) => { const h = String(hex || '').slice(2 + i * 64, 2 + (i + 1) * 64); return h.length === 64 ? BigInt('0x' + h) : null; };
/** l ecart (bps) d un montant d entree vs le prix moyen sqrtP (token1/token0 = sqrtP^2 / 2^192), frais de la pool compris */
export function ecartAuMoyen({ tokenIn, tokenOut, sortie, montantIn, sqrtPriceX96 }) {
  const s = entier(sqrtPriceX96), out = entier(sortie), amt = entier(montantIn);
  if (!(s > 0n) || !(out > 0n) || !(amt > 0n)) return null;
  const s2 = s * s, Q = 1n << 192n;
  const inEst0 = BigInt(bas(tokenIn)) < BigInt(bas(tokenOut));
  const num = inEst0 ? out * Q : out * s2, den = inEst0 ? s2 : Q;
  return Number(((amt * den - num) * 10000n) / num);
}

/** l ecart (bps) du prix de NOTRE pool a celui d une REFERENCE, en USDC par jeton (negatif : notre pool paie moins d USDC par jeton).
 *  Les deux pools sont jeton/USDC ; token0 = la plus petite adresse. */
export function ecartAReference({ jeton, sqrtNous, sqrtRef }) {
  const a = entier(sqrtNous), b = entier(sqrtRef);
  if (!(a > 0n) || !(b > 0n) || !ADR.test(String(jeton || ''))) return null;
  /* USDC par jeton = s^2/2^192 si le jeton est token0, 2^192/s^2 sinon : le rapport nous/ref vaut (a/b)^2 ou (b/a)^2 */
  const jetonEst0 = BigInt(bas(jeton)) < BigInt(USDC);
  const num = jetonEst0 ? a * a : b * b, den = jetonEst0 ? b * b : a * a;
  return Number((num * 10000n) / den) - 10000;
}

/**
 * LES DEVIS VIVANTS d un candidat CL pour chaque sortie USDC de `sorties`, TOUS LUS AU MEME BLOC : quoteExactOutputSingle (un par taille),
 * slot0, l USDC de la pool, factory() de la pool, et — si `reference` ({ pool }) est donnee — le slot0 de la pool de reference.
 * Un devis qui reverte (« revert » ou octets dans `data`) rend { ok: false, erreur } pour SA taille (la pool ne remplit pas ce montant) ;
 * un devis REFUSE par le transport ou le noeud (rate limit, delai, `0x`, block not found) rend { ok: false, nonLu: true, erreur }
 * (eligibilite : NON_MESURE) ; une lecture d etat ratee = NON_MESURE.
 * @param {function} p.rpc  injecte : (methode, params) => result
 */
export async function coterMisableTailles({ rpc, candidat, sorties = TAILLES_USDC, reference = null, bloc: blocEpingle = null }) {
  const c = candidat;
  if (!c || !ADR.test(String(c.pool || '')) || !ADR.test(String(c.jetonIn || ''))) return nonMesure('no candidate pool');
  const outs = (Array.isArray(sorties) ? sorties : []).map(entier);
  if (!outs.length || outs.some((o) => o === null || o <= 0n)) return nonMesure('each USDC output must be > 0');
  /* `bloc` epingle par l appelant (le serveur lit toute sa liste au MEME bloc) ; sinon la tete, lue ici */
  let bloc = Number.isSafeInteger(Number(blocEpingle)) && Number(blocEpingle) > 0 ? Number(blocEpingle) : null;
  if (bloc === null) { try { bloc = Number(BigInt(await rpc('eth_blockNumber', []))); } catch (e) { return nonMesure('the head block could not be read'); } }
  const tag = '0x' + bloc.toString(16);
  const call = (to, data) => rpc('eth_call', [{ to, data }, tag]);
  const qData = (out) => selecteur(SIG.quoteExactOutputSingle) + motA(c.jetonIn) + motA(USDC) + mot(out) + motI24(c.tickSpacing) + mot(0n);
  const refPool = reference && ADR.test(String(reference.pool || '')) && bas(reference.pool) !== bas(c.pool) ? bas(reference.pool) : null;
  let rs, rb, rf, rr = null;
  const quotes = outs.map((o) => call(QUOTEUR_CL, qData(o)).then((r) => ({ r }), (e) => ({ e })));
  try {
    [rs, rb, rf] = await Promise.all([call(c.pool, selecteur(SIG.slot0)), call(USDC, selecteur(SIG.balanceOf) + motA(c.pool)), call(c.pool, selecteur('factory()'))]);
  } catch (e) { return nonMesure('the pool state could not be read: ' + String((e && e.message) || e).slice(0, 120), { jeton: bas(c.jeton), bloc }); }
  if (refPool) { try { rr = await call(refPool, selecteur(SIG.slot0)); } catch (_) { rr = null; } }
  const sqrtP = lireMot(rs), usdcPool = lireMot(rb), fw = lireMot(rf);
  if (!(sqrtP > 0n)) return nonMesure('the pool has no price', { jeton: bas(c.jeton), bloc });
  const factory = fw === null ? null : '0x' + fw.toString(16).padStart(64, '0').slice(24);
  const devis = [];
  for (let i = 0; i < outs.length; i += 1) {
    const q = await quotes[i];
    const montantIn = q.r ? lireMot(q.r) : null;
    /* 2026-10-25 (prod, bloc 53 066 483) : NOKc a 0,50 et SEc a 5/10 servis SANS_DEVIS « You reached Public endpoint rate limit » — un refus
     *   de DEBIT pris pour « la pool ne remplit pas ce montant », jamais relu. Seuls un REVERT (un message « revert », ou des octets de
     *   revert dans `data`, que rpcRails garde) ou un devis LU a 0 sont SANS_DEVIS ; un refus de transport, ou une reponse `0x` / illisible,
     *   est NON LU (`nonLu: true`). ⛔ (revue, meme jour) `definitif` SEUL ne prouve PAS un revert : rpcRails le pose sur toute erreur
     *   JSON-RPC hors debit — mainnet.base.org rend { code: -32001, « block not found: 0x329d7d3 » } a un bloc qu il n a pas encore,
     *   drpc « empty hex string », les deux « Invalid params ». Un vrai revert (1e18 USDC sur SONYc) : « execution reverted », data 0x08c379a0... */
    if (montantIn === null) {
      const msg = q.e ? String((q.e && q.e.message) || q.e) : 'quote answer unreadable (' + String(q.r).slice(0, 12) + ')';
      const revert = !!q.e && (/revert/i.test(msg) || (typeof q.e.data === 'string' && /^0x[0-9a-f]{2,}$/i.test(q.e.data)));
      devis.push({ usdc: String(outs[i]), usdcSortie: outs[i], ok: false, ...(revert ? {} : { nonLu: true }), erreur: msg.slice(0, 100) }); continue;
    }
    if (!(montantIn > 0n)) { devis.push({ usdc: String(outs[i]), usdcSortie: outs[i], ok: false, erreur: 'empty quote' }); continue; }
    devis.push({ usdc: String(outs[i]), usdcSortie: outs[i], ok: true, montantIn, ecartBps: ecartAuMoyen({ tokenIn: c.jetonIn, tokenOut: USDC, sortie: outs[i], montantIn, sqrtPriceX96: sqrtP }) });
  }
  const sqrtRef = rr ? lireMot(rr) : null;
  /* 2026-10-25 : une reference DEMANDEE et NON LUE (appel refuse — publicnode « rate limit » vu en prod — ou `0x`) n est pas une reference
   *   absente : `referenceLue: false`, et eligibilite refuse (REFERENCE_NON_LUE). Lue sans prix (slot0 = 0) : lue, non jugee. */
  const referenceLue = refPool ? sqrtRef !== null : null;
  const ecartReferenceBps = refPool ? ecartAReference({ jeton: c.jetonIn, sqrtNous: sqrtP, sqrtRef }) : (reference && bas(reference.pool) === bas(c.pool) ? 0 : null);
  return { etat: 'PRET', jeton: bas(c.jeton), jetonIn: bas(c.jetonIn), natif: c.natif === true, symbole: c.symbole, famille: c.famille, route: ROUTES.CL, factory,
    pool: bas(c.pool), tickSpacing: Number(c.tickSpacing), sqrtPriceX96: sqrtP, usdcPool, referencePool: refPool, referenceLue, ecartReferenceBps, bloc, devis };
}

/** LE DEVIS VIVANT pour UNE sortie (celle que le plan exige : usdcAViser) — la forme que planPayerEnJeton lit. */
export async function coterMisable({ rpc, candidat, usdcSortie, reference = null }) {
  const t = await coterMisableTailles({ rpc, candidat, sorties: [usdcSortie], reference });
  if (t.etat !== 'PRET') return t;
  const d = t.devis[0];
  if (!d.ok) return nonMesure('the pool does not fill ' + d.usdc + ' raw USDC: ' + d.erreur, { jeton: t.jeton, bloc: t.bloc });
  const { devis: _d, ...base } = t;
  return { ...base, usdcSortie: d.usdcSortie, montantIn: d.montantIn, ecartBps: d.ecartBps };
}

/** UNE LIGNE SERVIE (/api/misables) : un candidat cote aux trois tailles, avec son eligibilite a chaque taille */
export function ligneMisable(candidat, cot) {
  const ok = cot && cot.etat === 'PRET';
  const mesure = ok ? { jeton: bas(candidat.jeton), route: ROUTES.CL, factory: cot.factory, usdcPool: cot.usdcPool, ecartReferenceBps: cot.ecartReferenceBps, referenceLue: cot.referenceLue,
    devis: cot.devis.map((d) => ({ usdc: d.usdc, ok: d.ok, nonLu: d.nonLu === true, montantIn: d.ok ? String(d.montantIn) : null, ecartBps: d.ok ? d.ecartBps : null, erreur: d.erreur || null })) } : null;
  const tailles = TAILLES_USDC.map((t, i) => {
    const e = ok ? eligibilite(mesure, { usdc: t }) : { ok: false, code: 'NON_MESURE', raison: (cot && cot.pourquoi) || 'not read', ecartBps: null };
    const d = mesure && mesure.devis[i];
    return { usdc: String(t), misable: e.ok === true, code: e.code, raison: e.raison, ecartBps: e.ecartBps ?? (d ? d.ecartBps : null), coutReferenceBps: e.coutReferenceBps ?? null, montantIn: d ? d.montantIn : null };
  });
  return { jeton: bas(candidat.jeton), symbole: candidat.symbole, famille: candidat.famille, natif: candidat.natif === true, route: ROUTES.CL, pool: bas(candidat.pool),
    tickSpacing: Number(candidat.tickSpacing), factory: ok ? cot.factory : null, usdcPool: ok && cot.usdcPool !== null ? String(cot.usdcPool) : null,
    referencePool: ok ? cot.referencePool : null, ecartReferenceBps: ok ? cot.ecartReferenceBps : null, bloc: ok ? cot.bloc : null,
    misable: tailles[0].misable, tailles };
}

/** LA LISTE : une ligne par JETON (la pool candidate qui est misable au plus de tailles, puis la moins chere a 0,50), misables d abord */
export function listeMisables(lignes) {
  const parJeton = new Map();
  const score = (l) => [l.tailles.filter((t) => t.misable).length, -(Number.isFinite(l.tailles[0].ecartBps) ? l.tailles[0].ecartBps : 1e9)];
  for (const l of lignes) {
    const p = parJeton.get(l.jeton);
    if (!p) { parJeton.set(l.jeton, l); continue; }
    const [a1, a2] = score(l), [b1, b2] = score(p);
    if (a1 > b1 || (a1 === b1 && a2 > b2)) parJeton.set(l.jeton, l);
  }
  return [...parJeton.values()].sort((a, b) => (b.misable - a.misable) || String(a.symbole).localeCompare(String(b.symbole)));
}
