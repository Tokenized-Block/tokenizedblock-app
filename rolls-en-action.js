/* rolls-en-action.js — MISER UNE ACTION TOKENISEE SUR UN ROLL, ET RECEVOIR SON GAIN EN ACTION (Phil, 2026-10-18 09:20 : « jouer
 * l equivalent de 0,50 USDC en NVDAc, gagner l equivalent de 5 USDC en stock, variante mise 0,50 NVDA pour 1 AAPLc ; regarde chez
 * Aerodrome pour swap »).
 *
 * ⛔⛔ LE CONTRAT BlockRolls RESTE EN USDC SEUL (decision du lead) : aucun oracle, aucun swap dans le contrat. « Payer un roll en
 *   NVDAc » = UN lot atomique (wallet_sendCalls, atomicRequired) bati ICI, dans le navigateur :
 *     1. approve(action -> routeur Aerodrome CL, montant EXACT)
 *     2. vendre exactement assez d action sur SA pool Aerodrome mesuree pour recevoir >= N x rollPrice USDC APRES notre frais de
 *        0,1 % (sweepTokenWithFee, comme toute vente d action de l app : planAerodromeSegment)
 *     3. approve(USDC -> BlockRolls, EXACTEMENT N x rollPrice)
 *     4. N x roll(guess)
 *   Le gain reste en USDC (5 USDC fixes) ; `planGainEnAction` le convertit en l action choisie (achat sur Aerodrome, chemin existant).
 *
 * ⛔ COMMENT « ASSEZ » EST CALCULE, EN ENTIERS : besoin = N x rollPrice. Le balayage rend minPools x (1 - 10 bps) ; le minimum des
 *   pools = devis x (1 - tolerance). Donc la SORTIE COTEE visee = ceil(ceil(besoin / (1 - frais)) / (1 - tolerance)). Le montant
 *   d action qui la produit est LU au quoter Aerodrome CL (quoteExactOutputSingle, MESURE le 2026-10-18 sur le quoter 0x514c…9259 :
 *   0,50 USDC <- 233 976 NVDAc bruts), puis RE-COTE en exact-input (quoteExactInputSingle) : si la sortie recotee est sous la cible,
 *   le montant monte d un pas et on recote (3 fois au plus), sinon REFUSE. Ce qui depasse `besoin` reste au compte en USDC (au plus
 *   la tolerance + ce que le devis rend au-dessus) : c est DIT (`detail.resteUsdcAttendu`), jamais cache.
 *
 * ⛔ REFUS, nommes AVANT la signature : action sans pool Aerodrome mesuree ; guess hors bornes ; rolls hors 1..ROLLS_MAX ; contrat
 *   sans code ; devis illisible (NON_MESURE) ; solde d action insuffisant ; minimum apres frais < besoin ; simulation du LOT ENTIER
 *   (eth_simulateV1 depuis le compte) qui reverte.
 *
 * Pur : `rpc` injecte, rien n est signe ni envoye. Le wallet de l utilisateur signe le lot. */
import { POOLS_ACTIONS_AERODROME, phraseAllerRetour } from './pools-actions-aerodrome.js';
import { planAerodromeSegment } from './plan-aerodrome-segment.js';
import { calldataApprove, FACTORY_AERODROME_CL, FRAIS_INTERFACE_BPS_CL } from './calldata-aerodrome.js';
import { planRoll, refusGuess, DEFAUTS } from './blockrolls-plan.js';
import { USDC_BASE, FEE_WALLET } from './frais-creation.js';
import { selecteur } from './keccak.js';

/** le quoter des pools Aerodrome CL (celui de multipool.js, QUOTEUR_CL3 : factory() = FACTORY_AERODROME_CL). ⛔ multipool.js n est
 *  pas servi au navigateur, d ou la copie ; test-rolls-en-action exige l egalite avec multipool.js ET relit factory() sur mainnet. */
export const QUOTEUR_AERODROME_CL = '0x514c8b5f54112481e28028f1166bd78501089259';
export const SIG_QUOTE_IN = 'quoteExactInputSingle((address,address,uint256,int24,uint160))';
export const SIG_QUOTE_OUT = 'quoteExactOutputSingle((address,address,uint256,int24,uint160))';
/** au plus 10 rolls par lot (le brief) : au-dela, un lot a moitie lu par le wallet est illisible pour la personne */
export const ROLLS_MAX = 10;
/** le pas quand la recotation en exact-input rend moins que la cible : +0,1 % du montant, et 3 tours au plus */
const PAS_BPS = 10n, TOURS_MAX = 3;
export const ETATS = Object.freeze(['PRET', 'REFUSE', 'NON_MESURE']);

const ADR = /^0x[0-9a-fA-F]{40}$/;
const bas = (x) => String(x || '').toLowerCase();
const mot = (n) => { const v = BigInt(n); if (v < 0n || v >= (1n << 256n)) throw new Error('uint256 out of range: ' + n); return v.toString(16).padStart(64, '0'); };
const motAdr = (a) => bas(a).slice(2).padStart(64, '0');
const motInt24 = (n) => { const v = BigInt(n); if (v < -(1n << 23n) || v >= (1n << 23n)) throw new Error('int24 out of range'); return (v < 0n ? v + (1n << 256n) : v).toString(16).padStart(64, '0'); };
const refuse = (pourquoi, extra = {}) => ({ etat: 'REFUSE', pourquoi, appels: [], detail: null, ...extra });
const nonMesure = (pourquoi, extra = {}) => ({ etat: 'NON_MESURE', pourquoi, appels: [], detail: null, ...extra });
const plafond = (a, b) => (a + b - 1n) / b; /* ceil(a / b), a et b > 0 */
const entier = (v) => { try { return BigInt(v); } catch (_) { return null; } };
const lire = (rpc, to, data) => rpc('eth_call', [{ to, data }, 'latest']);
const premierMot = (hex) => BigInt('0x' + String(hex).slice(2, 66));

/** l action de la table mesuree (pool, tickSpacing, symbole) ou null */
export function actionMesuree(action) {
  if (!ADR.test(String(action || ''))) return null;
  const t = POOLS_ACTIONS_AERODROME.get(bas(action));
  return t ? { adr: bas(action), pool: bas(t.pool), tickSpacing: Number(t.tickSpacing), symbole: t.symbole } : null;
}

/** le calldata d un devis exact-in / exact-out sur le quoter Aerodrome CL (lecture seule, rien n est envoye) */
export function calldataDevis({ tokenIn, tokenOut, tickSpacing, montant, exactOut = false }) {
  return { to: QUOTEUR_AERODROME_CL, data: selecteur(exactOut ? SIG_QUOTE_OUT : SIG_QUOTE_IN) + motAdr(tokenIn) + motAdr(tokenOut) + mot(montant) + motInt24(tickSpacing) + mot(0) };
}
async function devis(rpc, p) {
  const c = calldataDevis(p);
  const r = await lire(rpc, c.to, c.data);
  const v = premierMot(r);
  if (!(v > 0n)) throw new Error('the quoter returned nothing');
  return v;
}

/**
 * LA SORTIE COTEE A VISER pour que la personne recoive au moins `besoin` APRES notre frais, avec la marge de tolerance :
 * ceil(ceil(besoin x 10000 / (10000 - frais)) x 10000 / (10000 - tolerance)). Exportee pour etre testee seule : c est le calcul qui
 * decide si le roll est paye ou si le lot reverte sur « Too little received ».
 */
export function sortieCibleUsdc({ besoin, fraisBps = FRAIS_INTERFACE_BPS_CL, toleranceBps = 100n }) {
  const b = BigInt(besoin), f = BigInt(fraisBps), t = BigInt(toleranceBps);
  if (b <= 0n || f < 0n || f >= 10000n || t < 0n || t >= 10000n) return null;
  const minPools = plafond(b * 10000n, 10000n - f);
  return plafond(minPools * 10000n, 10000n - t);
}

/**
 * COMBIEN D ACTION VENDRE pour une sortie USDC visee : quoteExactOutputSingle, puis recotation exact-input (la seule que le routeur
 * executera) ; monte d un pas si la recotation rend moins. Rend { etat, montantAction, usdcCote, tours } ou un refus nomme.
 * Lecture seule. Exportee pour la sonde mainnet (test-rolls-en-action) et le banc fork.
 */
export async function coterVenteAction({ rpc, action, usdc = USDC_BASE, sortieVisee }) {
  const t = actionMesuree(action);
  if (!t) return refuse('this stock has no measured Aerodrome pool: nothing is sold on a pool we have not read');
  const cible = entier(sortieVisee);
  if (cible === null || cible <= 0n) return refuse('the targeted USDC output must be above zero');
  let montant;
  try { montant = await devis(rpc, { tokenIn: t.adr, tokenOut: usdc, tickSpacing: t.tickSpacing, montant: cible, exactOut: true }); }
  catch (e) { return nonMesure('the stock amount for ' + cible + ' raw USDC could not be quoted: ' + String((e && e.message) || e).slice(0, 140)); }
  let sortie = 0n, tours = 0;
  for (; tours < TOURS_MAX; tours += 1) {
    try { sortie = await devis(rpc, { tokenIn: t.adr, tokenOut: usdc, tickSpacing: t.tickSpacing, montant }); }
    catch (e) { return nonMesure('the USDC output of ' + montant + ' raw ' + t.symbole + ' could not be quoted: ' + String((e && e.message) || e).slice(0, 140)); }
    if (sortie >= cible) break;
    montant += montant * PAS_BPS / 10000n + 1n;
  }
  if (sortie < cible) return refuse('after ' + TOURS_MAX + ' re-quotes the pool still returns ' + sortie + ' < ' + cible + ' raw USDC: the quote moves too much to build an honest minimum');
  return { etat: 'PRET', montantAction: montant, usdcCote: sortie, tours: tours + 1, pool: t.pool, tickSpacing: t.tickSpacing, symbole: t.symbole };
}

/** COMBIEN D ACTION pour `montantUsdc` (le gain) : le devis exact-in du quoter, et ce qui en reste apres notre frais. Lecture seule. */
export async function coterAchatAction({ rpc, action, usdc = USDC_BASE, montantUsdc }) {
  const t = actionMesuree(action);
  if (!t) return refuse('this stock has no measured Aerodrome pool');
  const m = entier(montantUsdc);
  if (m === null || m <= 0n) return refuse('the USDC amount must be above zero');
  let cote;
  try { cote = await devis(rpc, { tokenIn: usdc, tokenOut: t.adr, tickSpacing: t.tickSpacing, montant: m }); }
  catch (e) { return nonMesure('the ' + t.symbole + ' output of ' + m + ' raw USDC could not be quoted: ' + String((e && e.message) || e).slice(0, 140)); }
  const frais = (cote * FRAIS_INTERFACE_BPS_CL) / 10000n;
  return { etat: 'PRET', actionCotee: cote, actionAttendue: cote - frais, fraisAttenduAction: frais, fraisBps: FRAIS_INTERFACE_BPS_CL, pool: t.pool, tickSpacing: t.tickSpacing, symbole: t.symbole };
}

async function soldeDe(rpc, jeton, compte) {
  try { return premierMot(await lire(rpc, jeton, selecteur('balanceOf(address)') + motAdr(compte))); } catch (_) { return null; }
}
async function decimalesDe(rpc, jeton) {
  try { const d = Number(premierMot(await lire(rpc, jeton, selecteur('decimals()')))); return Number.isInteger(d) && d >= 0 && d <= 36 ? d : null; } catch (_) { return null; }
}

/** le LOT ENTIER passe eth_simulateV1 depuis le compte ; un revert = REFUSE (sansFonds nomme), une simulation illisible = NON_MESURE */
async function simulerLot(rpc, compte, appels) {
  let sim;
  try {
    sim = await rpc('eth_simulateV1', [{ blockStateCalls: [{ calls: appels.map((a) => ({ from: compte, to: a.to, data: a.data, value: '0x0' })) }], validation: false, traceTransfers: false }, 'latest']);
  } catch (e) { return nonMesure('the batch could not be simulated just now: ' + String((e && e.message) || e).slice(0, 160)); }
  const res = Array.isArray(sim) && sim[0] && Array.isArray(sim[0].calls) ? sim[0].calls : null;
  if (!res || res.length !== appels.length) return nonMesure('the node did not answer the simulation for every step');
  const iKo = res.findIndex((x) => !x || x.status !== '0x1');
  if (iKo >= 0) {
    const msg = String((res[iKo] && res[iKo].error && res[iKo].error.message) || 'reverted');
    const sansFonds = /OutOfFunds|insufficient funds|exceeds balance|TRANSFER_FROM_FAILED|\bSTF\b|TransferFailed|0x90b8ec18/i.test(msg);
    return refuse((sansFonds ? 'not enough funds for step ' : 'the chain refuses step ') + (iKo + 1) + ' (' + (appels[iKo].quoi || appels[iKo].role || '') + '): ' + msg.slice(0, 160), { sansFonds, etape: iKo + 1 });
  }
  return { etat: 'PRET' };
}

/**
 * LE ROLL PAYE EN ACTION : [approve action, vente Aerodrome (frais 0,1 % sur l USDC), approve EXACT N x rollPrice, N x roll(guess)].
 * @param {function} p.rpc          injecte
 * @param {number}   p.chaine       8453 (autre : REFUSE — les pools de la table sont celles de Base)
 * @param {string}   p.compte       le joueur (recoit l USDC de la vente, paie les rolls)
 * @param {string}   p.contrat      BlockRolls deploye (code exige)
 * @param {string}   p.usdc
 * @param {string}   p.action       l action vendue (table mesuree)
 * @param {bigint}   [p.rollPrice]  lu sur le contrat (ROLL_PRICE) ; defaut DEFAUTS.rollPrice
 * @param {number[]} p.guess        les 5 traits ; ou `guesses` (un par roll)
 * @param {number}   [p.rolls=1]    1..ROLLS_MAX
 * @param {boolean}  [p.simuler=true]  la simulation du LOT ENTIER (eth_simulateV1) ; false ne saute que celle-la : la vente reste
 *                                     simulee par planAerodromeSegment, et `detail.simule` dit false
 */
export async function planRollEnAction({ rpc, chaine, compte, contrat, usdc = USDC_BASE, action, rollPrice = DEFAUTS.rollPrice, guess = null, guesses = null, rolls = 1,
  beneficiaireFrais = FEE_WALLET, toleranceBps = 100n, maintenant = Date.now(), simuler = true } = {}) {
  if (Number(chaine) !== 8453) return refuse('the measured Aerodrome pools are on Base (8453)');
  if (![compte, contrat, usdc, action, beneficiaireFrais].every((a) => ADR.test(String(a || '')))) return refuse('whole addresses are required (account, contract, usdc, stock, fee wallet)');
  if (bas(action) === bas(usdc)) return refuse('paying in USDC is the plain roll (planRoll), not a stock roll');
  const t = actionMesuree(action);
  if (!t) return refuse('this stock has no measured Aerodrome pool: it cannot pay a roll here');
  /* ⛔ 2026-10-25 (revue) : une pool qui perd > 2 % sur un aller-retour n est pas un moyen de jouer (pools-actions-aerodrome.js) */
  if (phraseAllerRetour(action)) return refuse('this stock cannot pay a roll here: ' + phraseAllerRetour(action));
  const n = Number(rolls);
  if (!Number.isInteger(n) || n < 1 || n > ROLLS_MAX) return refuse('rolls must be 1..' + ROLLS_MAX);
  const liste = Array.isArray(guesses) ? guesses : Array.from({ length: n }, () => guess);
  if (liste.length !== n) return refuse('one guess per roll: ' + liste.length + ' guess(es) for ' + n + ' roll(s)');
  for (let i = 0; i < liste.length; i += 1) { const r = refusGuess(liste[i]); if (r.length) return refuse('guess #' + (i + 1) + ': ' + r.join('; ')); }
  const prix = entier(rollPrice);
  if (prix === null || prix <= 0n) return refuse('the roll price must be a positive raw USDC amount');
  const tol = entier(toleranceBps);
  if (tol === null || tol < 0n || tol > 1000n) return refuse('the slippage tolerance is 0..1000 bps');
  const besoin = prix * BigInt(n);

  /* le contrat doit exister : un eth_call vers une adresse sans code « reussit » sans rien faire — un lot PRET sur rien */
  let code = null;
  try { code = await rpc('eth_getCode', [bas(contrat), 'latest']); } catch (_) { code = null; }
  if (code === null) return nonMesure('the BlockRolls code could not be read');
  if (String(code).length <= 2) return refuse('BlockRolls has no code at ' + bas(contrat) + ': no contract at this address');

  /* combien d action : cible cotee, exact-out puis exact-in */
  const cible = sortieCibleUsdc({ besoin, fraisBps: FRAIS_INTERFACE_BPS_CL, toleranceBps: tol });
  if (cible === null) return refuse('no honest USDC target for these parameters');
  const v = await coterVenteAction({ rpc, action, usdc, sortieVisee: cible });
  if (v.etat !== 'PRET') return v;

  /* le solde, dit en clair avant la simulation */
  const [solde, dec] = await Promise.all([soldeDe(rpc, action, compte), decimalesDe(rpc, action)]);
  if (solde === null) return nonMesure('the ' + t.symbole + ' balance of the account could not be read');
  if (solde < v.montantAction) return refuse('not enough ' + t.symbole + ': ' + v.montantAction + ' raw units needed, ' + solde + ' held', { sansFonds: true, manque: v.montantAction - solde });

  /* la vente = LE chemin de l app pour une action (planAerodromeSegment : pool epinglee, frais 0,1 % sur l USDC qui sort, simulee) */
  const vente = await planAerodromeSegment({ rpc, chemin: [{ de: t.adr, vers: bas(usdc), famille: 'aerodrome' }], devise: t.adr, block: bas(usdc), montant: v.montantAction,
    compte: bas(compte), beneficiaireFrais, toleranceBps: tol, maintenant, sortieCotee: v.usdcCote });
  if (vente.etat !== 'PRET') return { etat: vente.etat === 'NON_MESURE' ? 'NON_MESURE' : 'REFUSE', pourquoi: 'selling the stock: ' + String(vente.pourquoi || vente.etape || ''), appels: [], detail: null, sansFonds: vente.sansFonds === true };
  const usdcAuMoins = BigInt(vente.resume.recoitAuMoins);
  if (usdcAuMoins < besoin) return refuse('the sale guarantees ' + usdcAuMoins + ' raw USDC after our fee, below the ' + besoin + ' the rolls need: nothing is built');

  /* approve EXACT N x rollPrice + N rolls (les appels de blockrolls-plan, un par guess) */
  const appro = calldataApprove({ token: usdc, montant: besoin, beneficiaire: contrat });
  if (appro.etat !== 'PRET') return refuse('USDC approval refused: ' + appro.pourquoi);
  const rollsAppels = [];
  for (let i = 0; i < n; i += 1) {
    const pr = planRoll({ contrat, usdc, guess: liste[i], rollPrice: prix });
    if (pr.etat !== 'PRET') return refuse('roll #' + (i + 1) + ': ' + pr.pourquoi);
    rollsAppels.push({ ...pr.appels[1], value: '0x0', quoi: 'roll ' + (i + 1) + '/' + n + ': guess the face of the block 2 blocks from now' });
  }
  const appels = [
    { ...vente.appels[0], quoi: 'approve exactly ' + v.montantAction + ' raw ' + t.symbole + ' for the Aerodrome router' },
    { ...vente.appels[1], quoi: 'sell ' + t.symbole + ' for USDC on its Aerodrome pool (0.1% of the USDC goes to the app)' },
    { to: appro.to, data: appro.data, value: '0x0', quoi: 'approve exactly ' + besoin + ' raw USDC (' + n + ' roll' + (n > 1 ? 's' : '') + ') for BlockRolls' },
    ...rollsAppels,
  ];
  let simule = false;
  if (simuler) {
    const s = await simulerLot(rpc, compte, appels);
    if (s.etat !== 'PRET') return s;
    simule = true;
  }
  const fraisAttendu = (v.usdcCote * FRAIS_INTERFACE_BPS_CL) / 10000n;
  const usdcAttendu = v.usdcCote - fraisAttendu;
  return {
    etat: 'PRET', pourquoi: null, appels, exigeAtomique: true,
    detail: {
      rolls: n, guesses: liste, rollPrice: prix, besoinUsdc: besoin,
      action: t.adr, symbole: t.symbole, decimalesAction: dec, montantAction: v.montantAction, soldeAction: solde,
      pool: v.pool, tickSpacing: v.tickSpacing, usdcCote: v.usdcCote, usdcCibleCotee: cible,
      /* ce que la personne RECOIT de la vente au prix lu (apres frais), au moins (minimum du balayage), et ce qui reste au compte */
      usdcAttendu, usdcAuMoins, fraisBps: FRAIS_INTERFACE_BPS_CL, fraisAttenduUsdc: fraisAttendu, beneficiaireFrais: bas(beneficiaireFrais),
      resteUsdcAttendu: usdcAttendu > besoin ? usdcAttendu - besoin : 0n, resteUsdcAuMoins: usdcAuMoins - besoin,
      toleranceBps: tol, toursDeDevis: v.tours, simule,
    },
  };
}

/**
 * LE GAIN EN ACTION : acheter `action` avec `montantUsdc` (le gain recu, 5 USDC) sur sa pool Aerodrome — le chemin d achat existant
 * (planAerodromeSegment USDC -> action, frais 0,1 % dans l action qui sort, minimum sur le devis du quoter, simule). [approve EXACT, swap].
 */
export async function planGainEnAction({ rpc, chaine, compte, usdc = USDC_BASE, action, montantUsdc, beneficiaireFrais = FEE_WALLET, toleranceBps = 100n, maintenant = Date.now() } = {}) {
  if (Number(chaine) !== 8453) return refuse('the measured Aerodrome pools are on Base (8453)');
  if (![compte, usdc, action, beneficiaireFrais].every((a) => ADR.test(String(a || '')))) return refuse('whole addresses are required (account, usdc, stock, fee wallet)');
  const t = actionMesuree(action);
  if (!t) return refuse('this stock has no measured Aerodrome pool: the prize cannot be converted to it here');
  if (phraseAllerRetour(action)) return refuse('the prize cannot be converted to this stock here: ' + phraseAllerRetour(action));
  const m = entier(montantUsdc);
  if (m === null || m <= 0n) return refuse('the USDC amount must be above zero');
  const tol = entier(toleranceBps);
  if (tol === null || tol < 0n || tol > 1000n) return refuse('the slippage tolerance is 0..1000 bps');
  const [solde, dec] = await Promise.all([soldeDe(rpc, usdc, compte), decimalesDe(rpc, action)]);
  if (solde === null) return nonMesure('the USDC balance of the account could not be read');
  if (solde < m) return refuse('not enough USDC: ' + m + ' raw needed, ' + solde + ' held', { sansFonds: true, manque: m - solde });
  const q = await coterAchatAction({ rpc, action, usdc, montantUsdc: m });
  if (q.etat !== 'PRET') return q;
  const cote = q.actionCotee;
  const achat = await planAerodromeSegment({ rpc, chemin: [{ de: bas(usdc), vers: t.adr, famille: 'aerodrome' }], devise: bas(usdc), block: t.adr, montant: m,
    compte: bas(compte), beneficiaireFrais, toleranceBps: tol, maintenant, sortieCotee: cote });
  if (achat.etat !== 'PRET') return { etat: achat.etat === 'NON_MESURE' ? 'NON_MESURE' : 'REFUSE', pourquoi: 'buying the stock: ' + String(achat.pourquoi || achat.etape || ''), appels: [], detail: null, sansFonds: achat.sansFonds === true };
  const fraisAttendu = (cote * FRAIS_INTERFACE_BPS_CL) / 10000n;
  return {
    etat: 'PRET', pourquoi: null, exigeAtomique: false,
    appels: [
      { ...achat.appels[0], quoi: 'approve exactly ' + m + ' raw USDC for the Aerodrome router' },
      { ...achat.appels[1], quoi: 'buy ' + t.symbole + ' with the prize on its Aerodrome pool (0.1% of the ' + t.symbole + ' goes to the app)' },
    ],
    detail: {
      montantUsdc: m, soldeUsdc: solde, action: t.adr, symbole: t.symbole, decimalesAction: dec, pool: t.pool, tickSpacing: t.tickSpacing,
      actionCotee: cote, actionAttendue: cote - fraisAttendu, actionAuMoins: BigInt(achat.resume.recoitAuMoins), minPools: BigInt(achat.resume.minPools),
      fraisBps: FRAIS_INTERFACE_BPS_CL, fraisAttenduAction: fraisAttendu, beneficiaireFrais: bas(beneficiaireFrais), toleranceBps: tol, simule: achat.resume.simule === true,
    },
  };
}
