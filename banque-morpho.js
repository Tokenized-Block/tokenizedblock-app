/* banque-morpho.js — TokenizedBank, PHASE 1 : preter de l USDC, ou deposer une ACTION TOKENISEE en garantie et emprunter de l USDC,
 *   sur les marches Morpho Blue QUI EXISTENT DEJA sur Base. Aucun contrat neuf, aucune signature ici : des plans NON SIGNES.
 *   Design et decisions ouvertes : vault `TOKENIZEDBANK-design-2026-10-10.md`.
 *
 * ⛔⛔ MESURE AVANT DE CODER (2026-10-10, lecture seule) :
 *   - blue-api.morpho.org : 13 marches Base dont la garantie est une action de notre registre, tous pretent de l USDC (≈ 17 k$ en tout,
 *     utilisation ≈ 90 %). Forme de l API lue par introspection.
 *   - MORPHO_BLUE ci-dessous : adresse RENDUE PAR L API (morphoBlue.address, chaine 8453), code lu sur la chaine (15 623 octets) ;
 *     idToMarketParams(GOOGLc/USDC) lu sur la chaine == parametres de l API ; price() de l oracle -> 1 GOOGLc = 352,63 USDC.
 *   - Les 10 signatures appelees ici : leur selecteur figure dans le bytecode deploye (PUSH4), un temoin invente n y est pas.
 *
 * ⛔ DOCTRINE (celle des rails) : trois etats (PRET / REFUSE / NON_MESURE) ; une lecture ratee n est JAMAIS 0 ni un « oui » ;
 *   chaque plan est SIMULE par eth_simulateV1 depuis le compte avant d etre PRET (le meme jour, 11 actions avaient un achat PRET
 *   qui revertait : un plan non simule fait payer du gaz pour un echec) ; approbations au MONTANT EXACT, jamais l infini.
 * ⛔ PERIMETRE : seulement les marches dont la GARANTIE est une action de NOTRE registre (ACTIONS_COINBASE). Un block en garantie
 *   N EST PAS ouvert : decision de Phil en attente (pools minces = prix manipulable, voir le design §4).
 */
import { selecteur } from './encodeur.js';
import { simulerSequenceLancement } from './lancer-pool.js';
import { ACTIONS_COINBASE } from './paires.js';
import { FEE_WALLET } from './frais-creation.js';
/* 2026-11-11: the rates, the margin and the separate-positions sentence live in banque-frais.js (no imports, no address), so the public
 *   "Fees & risks" page reads the SAME values; this module re-exports them for the server, the app and the tests. */
import { FRAIS_EMPRUNT_BPS, FRAIS_PRET_BPS, FRAIS_SORTIE_BPS, MARGE_EMPRUNT_BPS, PHRASE_PANIER_SEPARE } from './banque-frais.js';
export { FRAIS_EMPRUNT_BPS, FRAIS_PRET_BPS, FRAIS_SORTIE_BPS, MARGE_EMPRUNT_BPS, PHRASE_PANIER_SEPARE };

export const MORPHO_BLUE = '0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb';
/** Marge d emprunt : au plus 70 % de ce que le LLTV permet (a LLTV 77 %, ≈ 54 % de la valeur de la garantie). Proposition,
 *  pas une decision de Phil — ecrite UNE fois, dans banque-frais.js (MARGE_EMPRUNT_BPS). */
/** ⛔ LES FRAIS DE SERVICE DE LA BANK - DECISION DE PHIL (chat, 2026-10-11 : « creer un fees comme sur Aave ou Morpho pour que l app
 *  gagne un peu aussi », « ajoute wallet dev comme recipient » ; choix : « 0,1 % de l emprunt », « FEE_WALLET 0xa6cf… »).
 *  0,1 % de l actif EMPRUNTE, arrondi a l unite SUPERIEURE (jamais 0 : un frais qui s arrondit a rien n est pas un frais), pris dans la
 *  MEME sequence que l emprunt (borrow -> transfer a la caisse), donc SIMULE avec elle. Rien pour rembourser ou retirer : on ne
 *  fait pas payer pour sortir. (Preter : gratuit jusqu au 2026-10-26, puis la MEME regle - FRAIS_PRET_BPS ci-dessous.) Le destinataire est la caisse de l app (FEE_WALLET, recopie dans frais-creation.js) ; l ecran dit
 *  « TokenizedBlock », jamais l adresse - le wallet la montre au moment de signer. Ecrit UNE fois ici ; la page le lit dans
 *  /api/banque/marches (fraisEmpruntBps) et dans le resume du plan, jamais en double. FRAIS_EMPRUNT_BPS (10n) : banque-frais.js. */
export const DESTINATAIRE_FRAIS_BANQUE = FEE_WALLET;
export const fraisEmprunt = (montant) => (BigInt(montant) <= 0n ? 0n : (BigInt(montant) * FRAIS_EMPRUNT_BPS + 9999n) / 10000n);
/** ⛔ 2026-10-26 - DECISION DE PHIL (« colle toi au data de morpho, ajoute les bons frais ») : le Lend paie la MEME regle que le Borrow.
 *  0,1 % du montant PRETE (celui qui arrive sur Morpho et rapporte), arrondi a l unite superieure, EN PLUS de ce montant (le wallet
 *  sort montant + frais), vers la meme caisse, dans la MEME sequence simulee (approve exact -> supply -> transfer). Le transfer ne
 *  touche pas Morpho : un transfert ERC-20 du wallet vers la caisse, sans autorisation. Mesure du jour : AUCUN frais Morpho sur nos
 *  19 marches (market(id).fee = 0 sur la chaine, feeRecipient = 0x0) - le frais Morpho, s il apparait, se lit et se dit a part.
 *  SORTIR reste GRATUIT : rembourser, retirer un pret, retirer une garantie = 0 (« on ne fait pas payer pour sortir », 2026-10-11 ;
 *  la decision du jour ne vise que le Lend). Ecrit UNE fois, dans banque-frais.js (FRAIS_PRET_BPS = FRAIS_EMPRUNT_BPS). */
export const fraisPret = (montant) => (BigInt(montant) <= 0n ? 0n : (BigInt(montant) * FRAIS_PRET_BPS + 9999n) / 10000n);
/** Le plus grand pret M tel que M + fraisPret(M) <= solde (le bouton « All » et « You can lend » ne proposent jamais un pret refuse). */
export const pretMaxAvecFrais = (solde) => {
  const s = BigInt(solde); if (s <= 0n) return 0n;
  /* m = floor(s / (1 + b)) est EXACT : s >= m (1 + b) et s, m entiers donnent s >= m + ceil(m b) = m + frais(m) ; et m + 1 depasse
   *   (m + 1 + frais(m + 1) >= (m + 1)(1 + b) > s). Les deux boucles de correction ecrites d abord etaient MORTES (mutants equivalents,
   *   mesure exhaustive 0..30 000 le 2026-10-26) : retirees, le test exhaustif garde la borne. */
  return (s * 10000n) / (10000n + FRAIS_PRET_BPS);
};
const WAD = 10n ** 18n, ECHELLE_PRIX = 10n ** 36n;
const ADR = /^0x[0-9a-f]{40}$/;
const ACTIONS = new Map(ACTIONS_COINBASE.map((a) => [String(a.adr).toLowerCase(), a.symbole]));
const MP = '(address,address,address,address,uint256)';
export const SEL = Object.freeze({
  supply: selecteur('supply(' + MP + ',uint256,uint256,address,bytes)'),
  withdraw: selecteur('withdraw(' + MP + ',uint256,uint256,address,address)'),
  borrow: selecteur('borrow(' + MP + ',uint256,uint256,address,address)'),
  repay: selecteur('repay(' + MP + ',uint256,uint256,address,bytes)'),
  supplyCollateral: selecteur('supplyCollateral(' + MP + ',uint256,address,bytes)'),
  withdrawCollateral: selecteur('withdrawCollateral(' + MP + ',uint256,address,address)'),
  position: selecteur('position(bytes32,address)'),
  market: selecteur('market(bytes32)'),
  idToMarketParams: selecteur('idToMarketParams(bytes32)'),
  price: selecteur('price()'),
  approve: selecteur('approve(address,uint256)'),
  allowance: selecteur('allowance(address,address)'),
  balanceOf: selecteur('balanceOf(address)'),
  transfer: selecteur('transfer(address,uint256)'),
});

const motAdr = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
const motNb = (n) => BigInt(n).toString(16).padStart(64, '0');
const mots = (hex) => String(hex || '').replace(/^0x/, '').match(/.{64}/g) || [];
const motVersAdr = (w) => '0x' + w.slice(24);
const mpMots = (p) => motAdr(p.loanToken) + motAdr(p.collateralToken) + motAdr(p.oracle) + motAdr(p.irm) + motNb(p.lltv);
const BYTES_VIDES = motNb(0); /* longueur 0 */

/* ── l encodage, une fonction par appel (tete statique ; `bytes` vide en queue) ───────────────────────────────────────────── */
export const appelSupply = (p, assets, onBehalf) => '0x' + SEL.supply + mpMots(p) + motNb(assets) + motNb(0) + motAdr(onBehalf) + motNb(9 * 32) + BYTES_VIDES;
export const appelBorrow = (p, assets, onBehalf, receiver) => '0x' + SEL.borrow + mpMots(p) + motNb(assets) + motNb(0) + motAdr(onBehalf) + motAdr(receiver);
export const appelRepayAssets = (p, assets, onBehalf) => '0x' + SEL.repay + mpMots(p) + motNb(assets) + motNb(0) + motAdr(onBehalf) + motNb(9 * 32) + BYTES_VIDES;
export const appelRepayShares = (p, shares, onBehalf) => '0x' + SEL.repay + mpMots(p) + motNb(0) + motNb(shares) + motAdr(onBehalf) + motNb(9 * 32) + BYTES_VIDES;
export const appelSupplyCollateral = (p, assets, onBehalf) => '0x' + SEL.supplyCollateral + mpMots(p) + motNb(assets) + motAdr(onBehalf) + motNb(8 * 32) + BYTES_VIDES;
export const appelWithdrawCollateral = (p, assets, onBehalf, receiver) => '0x' + SEL.withdrawCollateral + mpMots(p) + motNb(assets) + motAdr(onBehalf) + motAdr(receiver);
export const appelWithdraw = (p, assets, onBehalf, receiver) => '0x' + SEL.withdraw + mpMots(p) + motNb(assets) + motNb(0) + motAdr(onBehalf) + motAdr(receiver);
export const appelWithdrawShares = (p, shares, onBehalf, receiver) => '0x' + SEL.withdraw + mpMots(p) + motNb(0) + motNb(shares) + motAdr(onBehalf) + motAdr(receiver);
const appelApprove = (spender, montant) => '0x' + SEL.approve + motAdr(spender) + motNb(montant);
export const appelTransfer = (vers, montant) => '0x' + SEL.transfer + motAdr(vers) + motNb(montant);

const nonMesure = (pourquoi) => ({ etat: 'NON_MESURE', pourquoi, aSigner: [] });
const refuse = (pourquoi, resume) => ({ etat: 'REFUSE', pourquoi, aSigner: [], ...(resume ? { resume } : {}) });
const divHaut = (a, b) => (a + b - 1n) / b;
/** Un entier de l API Morpho en TEXTE decimal : texte de chiffres tel quel, nombre JSON seulement s il est un entier SUR (sinon sa
 *  precision est deja perdue) ; tout le reste = null (non lu). */
export const entierApi = (v) => (typeof v === 'string' && /^\d+$/.test(v) ? v : typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? String(v) : null);

/** La LISTE des marches Morpho Base dont la garantie est une action de notre registre, lue chez blue-api.morpho.org (forme lue
 *  par introspection le 2026-10-10 : marketId, oracle{address}, state{...Usd}). ⛔ Ce sont les chiffres de L API, pas relus sur la
 *  chaine : un plan relit le marche sur la chaine et simule. Echec = { ok:false, etat:'NON_LU' }, jamais une liste vide. */
export const URL_API_MORPHO = 'https://blue-api.morpho.org/graphql';
export async function lireMarchesMorpho({ fetchImpl = globalThis.fetch, delaiMs = 15000 } = {}) {
  const adrs = [...ACTIONS.keys()];
  /* 2026-10-26 : + irmAddress et state.fee (champs lus par introspection ce jour : MarketState.fee, Market.irmAddress). Le frais de
   *   l API n est qu un temoin : celui qui s affiche est relu sur la chaine (lireFraisMorphoChaine). */
  const q = 'query($c:[String!]){ markets(first: 200, where: { chainId_in: [8453], collateralAssetAddress_in: $c }) { items { marketId lltv listed irmAddress '
    + 'oracle { address } loanAsset { address symbol decimals } collateralAsset { address symbol decimals } '
    + 'state { supplyAssetsUsd borrowAssetsUsd liquidityAssets liquidityAssetsUsd utilization borrowApy supplyApy price fee } } } }';
  let j;
  try {
    const r = await fetchImpl(URL_API_MORPHO, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(delaiMs),
      body: JSON.stringify({ query: q, variables: { c: adrs } }) });
    if (!r.ok) return { ok: false, etat: 'NON_LU', pourquoi: 'Morpho API answered HTTP ' + r.status };
    j = await r.json();
  } catch (e) { return { ok: false, etat: 'NON_LU', pourquoi: 'Morpho API not read: ' + String((e && e.message) || e).slice(0, 80) }; }
  const items = j && j.data && j.data.markets && j.data.markets.items;
  if (!Array.isArray(items) || (j.errors && j.errors.length)) return { ok: false, etat: 'NON_LU', pourquoi: 'Morpho API answer not understood' };
  const marches = [];
  for (const m of items) {
    const g = String((m.collateralAsset && m.collateralAsset.address) || '').toLowerCase();
    if (!ACTIONS.has(g) || !/^0x[0-9a-fA-F]{64}$/.test(String(m.marketId || ''))) continue; /* l API filtre deja ; on ne la croit pas sur parole */
    const s = m.state || {};
    marches.push({ id: String(m.marketId).toLowerCase(), garantie: { adr: g, symbole: ACTIONS.get(g), decimales: m.collateralAsset.decimals },
      pret: { adr: String(m.loanAsset.address).toLowerCase(), symbole: m.loanAsset.symbol, decimales: m.loanAsset.decimals },
      lltv: String(m.lltv), listeParMorpho: m.listed === true, oracle: String((m.oracle && m.oracle.address) || '').toLowerCase(),
      /* prix de l oracle selon l API (echelle Morpho 1e36), en TEXTE : un nombre JSON de 37 chiffres perd sa precision. Sert a l ESTIMATION
       *   sans wallet (copie de StoxCredit, 2026-10-10) ; un plan relit price() sur la chaine. */
      prixOracle: s.price === null || s.price === undefined ? null : String(s.price),
      margeBps: Number(MARGE_EMPRUNT_BPS),
      offreUsd: s.supplyAssetsUsd ?? null, empruntUsd: s.borrowAssetsUsd ?? null, disponibleUsd: s.liquidityAssetsUsd ?? null,
      /* 2026-10-11 : la liquidite en unites BRUTES du jeton prete (borne exacte de « ce que TU peux emprunter »). Sonde du jour : l API la
       *   rend en NOMBRE JSON quand elle est petite et en TEXTE au-dela de 2^53 ; un nombre non sur = NON LU (null), jamais arrondi. */
      disponibleBrut: entierApi(s.liquidityAssets),
      utilisation: s.utilization ?? null, apyEmprunt: s.borrowApy ?? null, apyPret: s.supplyApy ?? null,
      irm: String(m.irmAddress || '').toLowerCase() || null,
      /* le frais Morpho selon l API (fraction de l interet, 0 a 1) : temoin seulement ; feeMorpho = celui de la chaine, null tant que non relu */
      feeMorphoApi: typeof s.fee === 'number' && Number.isFinite(s.fee) && s.fee >= 0 ? s.fee : null, feeMorpho: null });
  }
  marches.sort((a, b) => (b.offreUsd || 0) - (a.offreUsd || 0));
  /* fraisEmpruntBps / fraisPretBps : la page dit le frais de service AVANT le plan, depuis cette source unique ; fraisSortieBps = 0 (dit, pas tu) */
  return { ok: true, etat: 'LU', source: 'blue-api.morpho.org', marches, fraisEmpruntBps: Number(FRAIS_EMPRUNT_BPS), fraisPretBps: Number(FRAIS_PRET_BPS), fraisSortieBps: Number(FRAIS_SORTIE_BPS) };
}

/** 2026-10-26 (« colle toi au data de morpho ») : le frais de CHAQUE marche, RELU SUR LA CHAINE - Morpho Blue market(id), 6e mot
 *  (`fee`, WAD = 1e18 pour 100 % de l interet ; il va au feeRecipient de Morpho, pas au preteur). Mesure du jour : 0 sur les 19
 *  marches, feeRecipient 0x0, et l API dit 0 aussi. Ecrit dans chaque marche : feeMorpho = texte WAD exact, ou null (NON LU - jamais
 *  0 par defaut) ; feeMorphoAccord = l API dit la meme chose (false = le chiffre de la chaine l emporte, et c est lui qui s affiche).
 *  Seulement les marches LISTES (ceux que la page montre), en lots de 4. Ne jette jamais : un echec laisse null. */
export async function lireFraisMorphoChaine({ rpc, lu, lots = 4 }) {
  if (!lu || lu.ok !== true || !Array.isArray(lu.marches)) return lu;
  const cibles = lu.marches.filter((m) => m.listeParMorpho === true);
  let relus = 0;
  for (let i = 0; i < cibles.length; i += lots) {
    await Promise.all(cibles.slice(i, i + lots).map(async (m) => {
      try {
        const t = mots(await rpc('eth_call', [{ to: MORPHO_BLUE, data: '0x' + SEL.market + m.id.slice(2) }, 'latest']));
        if (t.length < 6) return;
        const fee = BigInt('0x' + t[5]);
        if (fee > WAD) return; /* hors bornes de Morpho (MAX_FEE = 25 %) : pas une lecture */
        m.feeMorpho = fee.toString(); relus += 1;
        m.feeMorphoAccord = m.feeMorphoApi === null ? null : Math.abs(Number(fee) / 1e18 - m.feeMorphoApi) < 1e-12;
      } catch (_) { /* reste null : non lu */ }
    }));
  }
  return { ...lu, feeMorphoRelus: relus, feeMorphoCibles: cibles.length };
}

/** Les POSITIONS d un compte sur ces marches (API Morpho, marketPositions ; forme lue le 2026-10-10 sur de vrais emprunteurs :
 *  healthFactor, priceVariationToLiquidationPrice, state{collateral, collateralUsd, supplyAssets(Usd), borrowAssets(Usd)}).
 *  ⛔ Chiffres de l API, pour AFFICHER : un remboursement ou un retrait relit la position sur la chaine (planRembourser...).
 *  Echec = NON_LU, jamais « aucune position ». */
export async function lirePositionsMorpho({ compte, fetchImpl = globalThis.fetch, delaiMs = 15000 } = {}) {
  const c = String(compte || '').toLowerCase();
  if (!ADR.test(c)) return { ok: false, etat: 'REFUSE', pourquoi: 'a whole account address is required' };
  const q = 'query($u:[String!]){ marketPositions(first: 100, where: { chainId_in: [8453], userAddress_in: $u }) { items { healthFactor '
    + 'priceVariationToLiquidationPrice market { marketId collateralAsset { address decimals } loanAsset { symbol decimals } } '
    + 'state { collateral collateralUsd supplyAssets supplyAssetsUsd borrowAssets borrowAssetsUsd } } } }';
  let j;
  try {
    const r = await fetchImpl(URL_API_MORPHO, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(delaiMs),
      body: JSON.stringify({ query: q, variables: { u: [c] } }) });
    if (!r.ok) return { ok: false, etat: 'NON_LU', pourquoi: 'Morpho API answered HTTP ' + r.status };
    j = await r.json();
  } catch (e) { return { ok: false, etat: 'NON_LU', pourquoi: 'Morpho API not read: ' + String((e && e.message) || e).slice(0, 80) }; }
  const items = j && j.data && j.data.marketPositions && j.data.marketPositions.items;
  if (!Array.isArray(items) || (j.errors && j.errors.length)) return { ok: false, etat: 'NON_LU', pourquoi: 'Morpho API answer not understood' };
  const positions = [];
  for (const p of items) {
    const g = String((p.market && p.market.collateralAsset && p.market.collateralAsset.address) || '').toLowerCase();
    const s = p.state || {};
    if (!ACTIONS.has(g)) continue;
    if (!(Number(s.collateral) > 0 || Number(s.supplyAssets) > 0 || Number(s.borrowAssets) > 0)) continue;
    positions.push({ id: String(p.market.marketId).toLowerCase(), garantie: { adr: g, symbole: ACTIONS.get(g), decimales: p.market.collateralAsset.decimals },
      pret: { symbole: p.market.loanAsset.symbol, decimales: p.market.loanAsset.decimals },
      garantieBrute: String(s.collateral ?? 0), garantieUsd: s.collateralUsd ?? null, preteBrut: String(s.supplyAssets ?? 0), preteUsd: s.supplyAssetsUsd ?? null,
      detteBrute: String(s.borrowAssets ?? 0), detteUsd: s.borrowAssetsUsd ?? null, sante: p.healthFactor ?? null, versLiquidation: p.priceVariationToLiquidationPrice ?? null });
  }
  return { ok: true, etat: 'LU', source: 'blue-api.morpho.org', positions };
}

/** Un marche Morpho, LU sur la chaine : parametres, totaux, prix de l oracle. NON_LU si une seule lecture manque. */
export async function lireMarche({ rpc, id }) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(id || ''))) return { etat: 'REFUSE', pourquoi: 'a whole market id (bytes32) is required' };
  const k = String(id).toLowerCase();
  try {
    const w = mots(await rpc('eth_call', [{ to: MORPHO_BLUE, data: '0x' + SEL.idToMarketParams + k.slice(2) }, 'latest']));
    if (w.length < 5) return { etat: 'NON_LU', pourquoi: 'market params not read' };
    const params = { loanToken: motVersAdr(w[0]), collateralToken: motVersAdr(w[1]), oracle: motVersAdr(w[2]), irm: motVersAdr(w[3]), lltv: BigInt('0x' + w[4]) };
    if (/^0x0{40}$/.test(params.loanToken)) return { etat: 'REFUSE', pourquoi: 'no Morpho market has this id' };
    const t = mots(await rpc('eth_call', [{ to: MORPHO_BLUE, data: '0x' + SEL.market + k.slice(2) }, 'latest']));
    if (t.length < 6) return { etat: 'NON_LU', pourquoi: 'market totals not read' };
    const totaux = { supplyAssets: BigInt('0x' + t[0]), supplyShares: BigInt('0x' + t[1]), borrowAssets: BigInt('0x' + t[2]), borrowShares: BigInt('0x' + t[3]) };
    const p = mots(await rpc('eth_call', [{ to: params.oracle, data: '0x' + SEL.price }, 'latest']));
    if (p.length < 1) return { etat: 'NON_LU', pourquoi: 'oracle price not read' };
    const prix = BigInt('0x' + p[0]);
    if (prix <= 0n) return { etat: 'NON_LU', pourquoi: 'oracle price is zero' };
    /* 2026-10-26 : le frais Morpho du marche (6e mot de market(id), WAD), relu a chaque plan et dit dans son resume */
    return { etat: 'LU', id: k, params, totaux, prix, feeMorpho: BigInt('0x' + t[5]), liquidite: totaux.supplyAssets > totaux.borrowAssets ? totaux.supplyAssets - totaux.borrowAssets : 0n };
  } catch (e) { return { etat: 'NON_LU', pourquoi: 'market not read: ' + String((e && e.message) || e).slice(0, 100) }; }
}

/** La position d un compte : garantie, dette (en actifs, arrondie VERS LE HAUT — la dette n est jamais sous-estimee). */
export async function lirePosition({ rpc, marche, compte }) {
  try {
    const w = mots(await rpc('eth_call', [{ to: MORPHO_BLUE, data: '0x' + SEL.position + marche.id.slice(2) + motAdr(compte) }, 'latest']));
    if (w.length < 3) return { etat: 'NON_LU' };
    const supplyShares = BigInt('0x' + w[0]), borrowShares = BigInt('0x' + w[1]), garantie = BigInt('0x' + w[2]);
    const { borrowAssets, borrowShares: tot } = marche.totaux;
    const dette = borrowShares === 0n ? 0n : tot === 0n ? 0n : divHaut(borrowShares * borrowAssets, tot);
    return { etat: 'LU', supplyShares, borrowShares, garantie, dette };
  } catch (_) { return { etat: 'NON_LU' }; }
}

/** Ce qu une garantie permet d emprunter : max (LLTV) et plafond (marge). En unites brutes de l actif prete. */
export function capacite({ garantie, prix, lltv }) {
  const valeur = (garantie * prix) / ECHELLE_PRIX; /* unites brutes de pret */
  const max = (valeur * lltv) / WAD;
  return { valeur, max, plafond: (max * MARGE_EMPRUNT_BPS) / 10000n };
}

async function lireEntier(rpc, to, data) { const w = mots(await rpc('eth_call', [{ to, data }, 'latest'])); return w.length ? BigInt('0x' + w[0]) : null; }

async function finaliser({ rpc, compte, appels, resume }) {
  const s = await simulerSequenceLancement({ rpc, compte, appels });
  if (s.etat === 'ACCEPTE') return { etat: 'PRET', pourquoi: null, aSigner: appels, resume: { ...resume, simule: true } };
  if (s.etat === 'REFUSE') return { etat: 'REFUSE', pourquoi: 'the chain refuses this exact sequence — ' + s.pourquoi, aSigner: [], resume };
  return { etat: 'NON_MESURE', pourquoi: 'not simulated, so not offered: ' + s.pourquoi, aSigner: [], resume };
}

function garde({ marche, compte }) {
  if (!ADR.test(String(compte || '').toLowerCase())) return refuse('a whole account address is required');
  if (marche.etat !== 'LU') return marche.etat === 'REFUSE' ? refuse(marche.pourquoi) : nonMesure(marche.pourquoi);
  if (!ACTIONS.has(marche.params.collateralToken)) return refuse('this market\'s collateral is not a tokenized stock of our registry — not offered here');
  return null;
}

/** Deposer `garantie` unites brutes d une action (0 = aucune) et emprunter `emprunt` unites brutes de l actif prete. */
export async function planEmprunter({ rpc, compte, id, garantie = 0n, emprunt }) {
  const b = await construireEmprunt({ rpc, compte, id, garantie, emprunt });
  if (b.etat !== 'OK') return b;
  return finaliser({ rpc, compte: b.compte, appels: b.appels, resume: b.resume });
}

/* ── 2026-10-11 — LE PANIER (Phil : « que tu puisses mettre plusieurs actions tokenisees en garantie en meme temps ») ─────────────
 *   Morpho Blue ISOLE chaque marche : une garantie par marche, liquidee seule. Un panier n est donc PAS une garantie commune : ce sont
 *   N emprunts (un par action), construits par le meme constructeur que l emprunt simple, mis bout a bout et SIMULES ENSEMBLE (une
 *   sequence, un verdict). Une ligne refusee refuse le panier en la nommant. Une action deux fois : refuse (une ligne par action -
 *   sinon deux autorisations lues a part se marcheraient dessus). */
export const PANIER_MAX = 5;
/* PHRASE_PANIER_SEPARE (each stock is its own Morpho position) lives in banque-frais.js since 2026-11-11, re-exported above */
export async function planEmprunterPanier({ rpc, compte, lignes }) {
  if (!Array.isArray(lignes) || !lignes.length) return refuse('a basket needs at least one stock');
  if (lignes.length > PANIER_MAX) return refuse('at most ' + PANIER_MAX + ' stocks in one basket');
  const ids = lignes.map((l) => String((l && l.id) || '').toLowerCase());
  if (new Set(ids).size !== ids.length) return refuse('the same market twice in one basket — put the whole amount on one line');
  const appels = [], resumes = [], garanties = new Set();
  let c = null;
  for (const [k, l] of lignes.entries()) {
    const b = await construireEmprunt({ rpc, compte, id: l.id, garantie: l.garantie, emprunt: l.emprunt });
    const nom = (b.resume && b.resume.garantieAction) || ('line ' + (k + 1));
    if (b.etat !== 'OK') return { ...b, pourquoi: nom + ': ' + b.pourquoi, aSigner: [] };
    if (garanties.has(b.garantieToken)) return refuse(nom + ' appears twice: one line per stock');
    garanties.add(b.garantieToken);
    appels.push(...b.appels); resumes.push(b.resume); c = b.compte;
  }
  return finaliser({ rpc, compte: c, appels, resume: { panier: true, lignes: resumes, positionsSeparees: PHRASE_PANIER_SEPARE } });
}

/** Les appels d UN emprunt, sans simulation : garde, position, plafond (marge), liquidite du marche, solde et autorisation de la garantie.
 *  Rend { etat: 'OK', compte, garantieToken, appels, resume } ou un refus / NON_MESURE (meme forme que les plans). */
async function construireEmprunt({ rpc, compte, id, garantie = 0n, emprunt }) {
  const marche = await lireMarche({ rpc, id });
  const g = garde({ marche, compte }); if (g) return g;
  let G, E; try { G = BigInt(garantie); E = BigInt(emprunt); } catch (_) { return refuse('amounts are raw integer units'); }
  if (G < 0n || E <= 0n) return refuse('borrow a positive amount; collateral cannot be negative');
  const c = String(compte).toLowerCase(), p = marche.params;
  const pos = await lirePosition({ rpc, marche, compte: c });
  if (pos.etat !== 'LU') return nonMesure('your position on this market could not be read');
  const cap = capacite({ garantie: pos.garantie + G, prix: marche.prix, lltv: p.lltv });
  const resume = { marche: marche.id, garantieAction: ACTIONS.get(p.collateralToken), garantieApres: (pos.garantie + G).toString(),
    detteApres: (pos.dette + E).toString(), plafond: cap.plafond.toString(), maxLltv: cap.max.toString(), lltv: p.lltv.toString(),
    /* 2026-10-11 (Grok, contre-test prod : « 70 % of the LLTV limit » = jargon) : la meme borne, en mots */
    liquiditeMarche: marche.liquidite.toString(), marge: Number(MARGE_EMPRUNT_BPS) / 100 + ' % of the most Morpho lets you borrow before liquidation',
    feeMorpho: marche.feeMorpho.toString() };
  if (pos.dette + E > cap.plafond) return refuse('too much for this collateral: at most ' + (cap.plafond > pos.dette ? cap.plafond - pos.dette : 0n) + ' raw units more (we cap your debt at ' + resume.marge + ')', resume);
  if (E > marche.liquidite) return refuse('this market has only ' + marche.liquidite + ' raw units to lend right now', resume);
  /* le prix de la garantie auquel la position devient liquidable (unites brutes de pret par unite brute de garantie × 1e36) */
  const garantieApres = pos.garantie + G;
  resume.prixLiquidation = garantieApres > 0n ? divHaut((pos.dette + E) * WAD * ECHELLE_PRIX, garantieApres * p.lltv).toString() : null;
  resume.prixActuel = marche.prix.toString();
  const appels = [];
  if (G > 0n) {
    let solde, autorise;
    try { solde = await lireEntier(rpc, p.collateralToken, '0x' + SEL.balanceOf + motAdr(c)); autorise = await lireEntier(rpc, p.collateralToken, '0x' + SEL.allowance + motAdr(c) + motAdr(MORPHO_BLUE)); } catch (_) { solde = null; }
    if (solde === null || autorise === null) return nonMesure('your balance or allowance of the collateral could not be read');
    if (solde < G) return refuse('this wallet holds ' + solde + ' raw units of the collateral, not ' + G, resume);
    if (autorise < G) appels.push({ to: p.collateralToken, data: appelApprove(MORPHO_BLUE, G), value: '0x0', nom: 'allow Morpho to take exactly this collateral' });
    appels.push({ to: MORPHO_BLUE, data: appelSupplyCollateral(p, G, c), value: '0x0', nom: 'deposit the stock as collateral on Morpho' });
  }
  appels.push({ to: MORPHO_BLUE, data: appelBorrow(p, E, c, c), value: '0x0', nom: 'borrow on Morpho, to your own wallet' });
  /* les frais de service (FRAIS_EMPRUNT_BPS, decision de Phil) : APRES l emprunt, sur l actif emprunte, dans la meme sequence simulee */
  const frais = fraisEmprunt(E);
  /* `frais: true` : la page sait que cette etape est le frais (le lien « explorer » montre l emprunt, pas le frais - revue adverse 2026-10-11) */
  appels.push({ to: p.loanToken, data: appelTransfer(DESTINATAIRE_FRAIS_BANQUE, frais), value: '0x0', frais: true, nom: 'TokenizedBlock service fee: ' + Number(FRAIS_EMPRUNT_BPS) / 100 + ' % of what you borrow' });
  resume.fraisApp = frais.toString(); resume.fraisAppBps = Number(FRAIS_EMPRUNT_BPS); resume.fraisPour = 'TokenizedBlock';
  return { etat: 'OK', compte: c, garantieToken: p.collateralToken, appels, resume };
}

/** Preter `montant` unites brutes de l actif prete du marche (USDC). */
export async function planPreter({ rpc, compte, id, montant }) {
  const marche = await lireMarche({ rpc, id });
  const g = garde({ marche, compte }); if (g) return g;
  let M; try { M = BigInt(montant); } catch (_) { return refuse('amounts are raw integer units'); }
  if (M <= 0n) return refuse('lend a positive amount');
  const c = String(compte).toLowerCase(), p = marche.params;
  let solde, autorise;
  try { solde = await lireEntier(rpc, p.loanToken, '0x' + SEL.balanceOf + motAdr(c)); autorise = await lireEntier(rpc, p.loanToken, '0x' + SEL.allowance + motAdr(c) + motAdr(MORPHO_BLUE)); } catch (_) { solde = null; }
  if (solde === null || autorise === null) return nonMesure('your balance or allowance could not be read');
  /* 2026-10-26 (decision de Phil) : le frais de service du Lend - 0,1 % de M, EN PLUS de M ; le wallet doit tenir M + frais */
  const frais = fraisPret(M), total = M + frais;
  const resume = { marche: marche.id, garantieAction: ACTIONS.get(p.collateralToken), prete: M.toString(), offreAvant: marche.totaux.supplyAssets.toString(),
    fraisApp: frais.toString(), fraisAppBps: Number(FRAIS_PRET_BPS), fraisPour: 'TokenizedBlock', totalSortant: total.toString(), feeMorpho: marche.feeMorpho.toString() };
  if (solde < total) return refuse('this wallet holds ' + solde + ' raw units, not ' + total + ' (' + M + ' to lend + ' + frais + ' TokenizedBlock fee)', resume);
  const appels = [];
  /* l autorisation couvre EXACTEMENT ce que Morpho prend (M) : le frais est un transfer du wallet, il n a besoin d aucune autorisation */
  if (autorise < M) appels.push({ to: p.loanToken, data: appelApprove(MORPHO_BLUE, M), value: '0x0', nom: 'allow Morpho to take exactly this amount' });
  appels.push({ to: MORPHO_BLUE, data: appelSupply(p, M, c), value: '0x0', nom: 'lend on Morpho (you can withdraw what is not borrowed)' });
  appels.push({ to: p.loanToken, data: appelTransfer(DESTINATAIRE_FRAIS_BANQUE, frais), value: '0x0', frais: true, nom: 'TokenizedBlock service fee: ' + Number(FRAIS_PRET_BPS) / 100 + ' % of what you lend' });
  return finaliser({ rpc, compte: c, appels, resume });
}

/** 2026-10-26 : sortir est GRATUIT et le resume le DIT (fraisApp '0'), au lieu de se taire - la carte peut l ecrire sans le deviner. */
const SANS_FRAIS_SORTIE = Object.freeze({ fraisApp: '0', fraisAppBps: Number(FRAIS_SORTIE_BPS), fraisPour: 'TokenizedBlock' });

/** Rembourser : `montant` unites brutes, ou `tout: true` (par parts : la dette entiere, interets courus compris). */
export async function planRembourser({ rpc, compte, id, montant = null, tout = false }) {
  const marche = await lireMarche({ rpc, id });
  const g = garde({ marche, compte }); if (g) return g;
  const c = String(compte).toLowerCase(), p = marche.params;
  const pos = await lirePosition({ rpc, marche, compte: c });
  if (pos.etat !== 'LU') return nonMesure('your position could not be read');
  if (pos.borrowShares === 0n) return refuse('nothing to repay on this market');
  /* ⛔ par parts, la dette grossit entre la lecture et l envoi : on autorise la dette lue + 0,1 % (arrondi haut), dit dans le resume */
  const besoin = tout ? divHaut(pos.dette * 10010n, 10000n) : BigInt(montant || 0);
  if (besoin <= 0n) return refuse('repay a positive amount, or all');
  let solde, autorise;
  try { solde = await lireEntier(rpc, p.loanToken, '0x' + SEL.balanceOf + motAdr(c)); autorise = await lireEntier(rpc, p.loanToken, '0x' + SEL.allowance + motAdr(c) + motAdr(MORPHO_BLUE)); } catch (_) { solde = null; }
  if (solde === null || autorise === null) return nonMesure('your balance or allowance could not be read');
  const resume = { marche: marche.id, detteLue: pos.dette.toString(), autorise: besoin.toString(), tout: !!tout, ...(tout ? { tolerance: 'the debt read + 0.1 % (interest accrues until the transaction lands)' } : {}), ...SANS_FRAIS_SORTIE };
  if (solde < (tout ? pos.dette : besoin)) return refuse('this wallet holds ' + solde + ' raw units, the debt is ' + pos.dette, resume);
  const appels = [];
  const approuve = autorise < besoin;
  if (approuve) appels.push({ to: p.loanToken, data: appelApprove(MORPHO_BLUE, besoin), value: '0x0', nom: 'allow Morpho to take at most this amount' });
  appels.push({ to: MORPHO_BLUE, data: tout ? appelRepayShares(p, pos.borrowShares, c) : appelRepayAssets(p, besoin, c), value: '0x0', nom: tout ? 'repay the whole debt on Morpho' : 'repay on Morpho' });
  /* ⛔ 2026-10-26 (banc fork, marche GOOGLc Safer) : rembourser TOUT par parts laissait 10 001 unites USDC autorisees a Morpho (la marge de
   *   0,1 % non consommee). L autorisation que CE plan a donnee est remise a 0 a la fin ; une autorisation anterieure (pas d approve ici)
   *   n est pas touchee. Un remboursement partiel consomme exactement ce qu il autorise : rien a remettre. */
  if (approuve && tout) { appels.push({ to: p.loanToken, data: appelApprove(MORPHO_BLUE, 0n), value: '0x0', remiseA0: true, nom: 'set Morpho\'s allowance back to 0' }); resume.autorisationRemiseA0 = true; }
  return finaliser({ rpc, compte: c, appels, resume });
}

/** Retirer ce qui a ete PRETE : `montant` unites brutes, ou `tout: true` (par parts : le pret entier, interets compris).
 *  ⛔ Borne par la liquidite du marche : ce qui est emprunte ne sort pas avant d etre rembourse — le refus donne le chiffre. */
export async function planRetirerPret({ rpc, compte, id, montant = null, tout = false }) {
  const marche = await lireMarche({ rpc, id });
  const g = garde({ marche, compte }); if (g) return g;
  const c = String(compte).toLowerCase(), p = marche.params;
  const pos = await lirePosition({ rpc, marche, compte: c });
  if (pos.etat !== 'LU') return nonMesure('your position could not be read');
  if (pos.supplyShares === 0n) return refuse('nothing lent on this market');
  const { supplyAssets, supplyShares } = marche.totaux;
  /* ⛔ 2026-10-26 (banc fork, GOOGLc Safer) : parts x actifs / parts annoncait 5 000 000 quand le wallet en recevait 4 999 999. Morpho
   *   convertit avec ses parts VIRTUELLES (SharesMathLib.toAssetsDown : parts x (actifs + 1) / (parts + 1e6)), arrondi BAS ; ses interets
   *   courus avant le retrait ne peuvent qu ajouter. C est donc un MINIMUM exact, et c est ce que la carte dit. */
  const prete = (pos.supplyShares * (supplyAssets + 1n)) / (supplyShares + 10n ** 6n);
  let M; try { M = tout ? prete : BigInt(montant); } catch (_) { return refuse('amounts are raw integer units'); }
  const resume = { marche: marche.id, preteLu: prete.toString(), retire: M.toString(), tout: !!tout, liquiditeMarche: marche.liquidite.toString(), ...SANS_FRAIS_SORTIE };
  if (M <= 0n || M > prete) return refuse('you can withdraw between 1 and ' + prete + ' raw units', resume);
  if (M > marche.liquidite) return refuse('only ' + marche.liquidite + ' raw units can leave this market right now: the rest is borrowed until it is repaid', resume);
  const appel = tout ? appelWithdrawShares(p, pos.supplyShares, c, c) : appelWithdraw(p, M, c, c);
  return finaliser({ rpc, compte: c, appels: [{ to: MORPHO_BLUE, data: appel, value: '0x0', nom: 'withdraw what you lent on Morpho, to your own wallet' }], resume });
}

/** Retirer `montant` unites brutes de garantie — seulement si la dette restante tient sous le plafond (marge comprise). */
export async function planRetirerGarantie({ rpc, compte, id, montant }) {
  const marche = await lireMarche({ rpc, id });
  const g = garde({ marche, compte }); if (g) return g;
  let M; try { M = BigInt(montant); } catch (_) { return refuse('amounts are raw integer units'); }
  const c = String(compte).toLowerCase(), p = marche.params;
  const pos = await lirePosition({ rpc, marche, compte: c });
  if (pos.etat !== 'LU') return nonMesure('your position could not be read');
  if (M <= 0n || M > pos.garantie) return refuse('you can withdraw between 1 and ' + pos.garantie + ' raw units');
  const cap = capacite({ garantie: pos.garantie - M, prix: marche.prix, lltv: p.lltv });
  const resume = { marche: marche.id, garantieApres: (pos.garantie - M).toString(), dette: pos.dette.toString(), plafondApres: cap.plafond.toString(), ...SANS_FRAIS_SORTIE };
  if (pos.dette > cap.plafond) return refuse('your debt would be too close to liquidation after this withdrawal — repay first', resume);
  return finaliser({ rpc, compte: c, appels: [{ to: MORPHO_BLUE, data: appelWithdrawCollateral(p, M, c, c), value: '0x0', nom: 'withdraw your collateral from Morpho' }], resume });
}
