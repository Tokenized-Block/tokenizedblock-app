// marche.js — la VIE d un block : prix x supply, lue sur les pools, jamais devinee.
// ================================================================================================
// ⛔⛔ CE MODULE EXISTE POUR QU IL N Y AIT QU UNE SEULE LECTURE DE MARCHE. Le meme calcul vivait
//    dans `index.html` sous forme de fonction locale ; en ecrivant un second ecran, la tentation
//    etait de le recopier. C est le motif le plus cher de ce depot — le helper correct existe et
//    l appelant s en fabrique une copie plus faible — et il a deja frappe huit fois ici. Deux
//    lectures de prix qui divergent afficheraient deux capitalisations differentes pour LE MEME
//    block sur deux ecrans, sans que rien ne plante.
//
// ⛔ LA LISTE DES CLES EST NOMMEE, ET C EST CE QUI REND « PAS DE PRIX » HONNETE. Mesure du
//    2026-09-09 : deux des huit blocks les plus actifs cotaient sur `fee 10000` pendant que l app
//    ne lisait que `fee 0` et leur affichait « jamais cote » — une affirmation FAUSSE sur le jeton
//    de quelqu un d autre. On lit plusieurs cles, et l absence ne veut jamais dire que « absente
//    parmi CELLES-CI ».
//
// ⚠️ CE QUE CE MODULE NE COUVRE PAS, ecrit ici plutot que decouvert plus tard : les paires contre
//    autre chose que l ETH natif / TBLOCK, les hooks AUTRES que HOOK_PREVU, et tout ce qui n est pas
//    Uniswap v4. Un jeton cote sur une v2, une v3 ou un autre protocole restera invisible — et c est
//    pourquoi le refus s appelle NON_TROUVEE et jamais « sans valeur ».
// ✅ 2026-09-15 P0: App Launch attaches HOOK_PREVU — try that key first (ETH + TBLOCK), then legacy zero-hook.
import { cleDePool, poolId, selecteur, prixDepuisSqrt } from './pool.js';
import { capitalisation } from './pointsdevie.js';
import { TBLOCK_TEST_ANCIEN as TBLOCK, HOOK_PREVU, HOOK_V2, HOOK_V3, HOOK_V4, HOOK_V5, HOOK_V6, HOOK_V7, HOOK_V8, HOOK_7030, HOOK_7030_ACTIF } from './tokenomics.js'; /* game354: in this file TBLOCK = the OLD test token, only to read its LEGACY pools (never shown as "TBLOCK"); the real TBLOCK is tokenomics.TBLOCK */
import { pairesProposees } from './paires.js';
import { enVolBorne, lireEnsemble } from './lectures-en-vol.js';

const ETH_NATIF = '0x0000000000000000000000000000000000000000';

/* ══ LES DECIMALES D UN JETON : LUES UNE FOIS, GARDEES (2026-10-04) ══════════════════════════════════════════════════════════
 * MESURE (fork, compter-lectures-plan-20261004.mjs) : chaque plan relisait `decimals()` 1 a 3 fois — le jeton, sa devise de
 *   cotation, le jeton paye — alors que la reponse ne change jamais. Le navigateur les garde deja (`RPC_SEL_IMMUABLES`, app.html) ;
 *   le serveur, non.
 * ⛔⛔ ON NE GARDE QUE CE FAIT-LA. Prix, supply, liquidite, solde, autorisation : relus a CHAQUE plan, jamais gardes.
 * ⛔ ON NE GARDE QU UNE REPONSE PLAUSIBLE : un entier de 1 a 36. Une lecture ratee LEVE et n est pas gardee (une panne gardee
 *   condamnerait le jeton jusqu au redemarrage). Un 0 n est pas garde non plus : c est la forme d une NON-reponse de noeud
 *   (meme regle que `rpcGardable` dans app.html) — il est rendu tel quel, comme avant, et relu la fois suivante.
 * ⛔ LA CLE PORTE LE StateView : il differe d une chaine a l autre, donc une meme adresse sur deux chaines ne se melange pas.
 * ⛔ BORNE : la memoire vit le temps du processus (le serveur) ou de la page ; `oublierDecimales()` la vide (tests). */
const decimalesConnues = new Map();
export function oublierDecimales() { decimalesConnues.clear(); }
export async function decimalesLues({ rpc, stateView, jeton }) {
  const k = String(stateView || '').toLowerCase() + ':' + String(jeton || '').toLowerCase();
  if (decimalesConnues.has(k)) return decimalesConnues.get(k);
  const d = Number(BigInt(String(await rpc('eth_call', [{ to: jeton, data: '0x' + selecteur('decimals()') }, 'latest'])).slice(0, 66)));
  if (Number.isInteger(d) && d >= 1 && d <= 36) {
    if (decimalesConnues.size >= 5000) decimalesConnues.delete(decimalesConnues.keys().next().value);
    decimalesConnues.set(k, d);
  }
  return d;
}

/** La cle TBLOCK/block lue en second (format du lancement de l app). */
export const CLE_TBLOCK = { fee: 0, tickSpacing: 200 };


/** StateView getLiquidity(bytes32) — pool depth sensor (Uniswap L, not ETH). null = unread, never invent 0. */
async function lireLiquiditePool(rpc, stateView, cle) {
  if (!stateView || !cle) return null;
  try {
    const raw = await rpc('eth_call', [{
      to: stateView,
      data: '0x' + selecteur('getLiquidity(bytes32)') + poolId(cle).slice(2),
    }, 'latest']);
    if (!raw || raw === '0x' || String(raw).length < 66) return null;
    return BigInt(String(raw).slice(0, 66));
  } catch {
    return null;
  }
}


/**
 * La vie d un block apparie a TBLOCK, en ETH. `null` = pas de pool TBLOCK/block (on laisse le NON_TROUVEE d origine).
 * ⛔ Rend NON_LUE (pas null) si la pool TBLOCK/block existe mais qu un prix ou la supply manque.
 */
async function vieEnTblock({ rpc, stateView, jeton }) {
  const lire = rpc;
  const sel = selecteur('getSlot0(bytes32)');
  /* ⛔ P0 2026-09-15: Launch may open TBLOCK/block with HOOK_PREVU — try hooked key first, then legacy zero. */
  /* tip 20260923-wallet-intent-market: Instant Birth opens HOOK_V8 — try current hooks before legacy. */
  const variants = [
    { hooks: HOOK_V8, via: 'old test TBLOCK · 0 % · TbFeeHook v8' },
    { hooks: HOOK_V7, via: 'old test TBLOCK · 0 % · TbFeeHook v7' },
    { hooks: HOOK_V6, via: 'old test TBLOCK · 0 % · TbFeeHook v6' },
    { hooks: HOOK_V5, via: 'old test TBLOCK · 0 % · TbFeeHook v5' },
    { hooks: HOOK_V4, via: 'old test TBLOCK · 0 % · TbFeeHook v4' },
    { hooks: HOOK_V3, via: 'old test TBLOCK · 0 % · TbFeeHook v3' },
    { hooks: HOOK_PREVU, via: 'old test TBLOCK · 0 % · TbFeeHook' },
    { hooks: HOOK_V2, via: 'old test TBLOCK · 0 % · TbFeeHook v2' },
    { hooks: null, via: 'old test TBLOCK · 0 %' },
  ];
  let cle = null, s = 0n, via = null, ratee = false;
  for (const v of variants) {
    const c = cleDePool(TBLOCK, jeton, v.hooks ? { ...CLE_TBLOCK, hooks: v.hooks } : CLE_TBLOCK);
    let raw;
    try { raw = await lire('eth_call', [{ to: stateView, data: '0x' + sel + poolId(c).slice(2) }, 'latest']); }
    catch { ratee = true; continue; }
    if (!raw || raw === '0x' || String(raw).length < 66) { ratee = true; continue; }
    const sv = BigInt(String(raw).slice(0, 66));
    if (sv !== 0n) { cle = c; s = sv; via = v.via; break; }
  }
  if (!cle) {
    if (ratee) return { etat: 'NON_LUE', vie: null, devise: null, via: null, pourquoi: 'the TBLOCK pair could not be read' };
    return null;
  }
  const nonLue = (pourquoi) => ({ etat: 'NON_LUE', vie: null, devise: null, via, pourquoi });
  let dec, supply, sE;
  try {
    dec = Number(BigInt(String(await lire('eth_call', [{ to: jeton, data: '0x' + selecteur('decimals()') }, 'latest'])).slice(0, 66)));
    supply = BigInt(String(await lire('eth_call', [{ to: jeton, data: '0x' + selecteur('totalSupply()') }, 'latest'])).slice(0, 66));
    const cleE = cleDePool(ETH_NATIF, TBLOCK, CLE_TBLOCK);
    sE = BigInt(String(await lire('eth_call', [{ to: stateView, data: '0x' + sel + poolId(cleE).slice(2) }, 'latest'])).slice(0, 66));
  } catch { return nonLue('decimals, supply or the TBLOCK/ETH price unread'); }
  if (sE === 0n) return nonLue('TBLOCK has no ETH price to convert with');
  const prixEnTblock = prixDepuisSqrt({ sqrtPriceX96: s, decDevise: 18, decBlock: dec, deviseEst0: String(cle.currency0).toLowerCase() === TBLOCK.toLowerCase() });
  const prixTblockEnEth = prixDepuisSqrt({ sqrtPriceX96: sE, decDevise: 18, decBlock: 18, deviseEst0: true });
  if (!(prixEnTblock > 0) || !(prixTblockEnEth > 0)) return nonLue('a price could not be computed');
  const c = capitalisation({ supply, decimales: dec, prix: prixEnTblock * prixTblockEnEth, devise: 'ETH' });
  if (c.valeur === null || c.valeur === undefined) return nonLue(c.pourquoi || 'market cap not computable');
  const liquidite = await lireLiquiditePool(lire, stateView, cle);
  return { etat: 'LUE', vie: c.valeur, devise: 'ETH', via, pourquoi: null, cle, sqrtPriceX96: s, decimales: dec, paire: 'TBLOCK',
    prixTblockEnEth, liquidite };
}

/** Les cles de pool lues, dans l ordre. ⛔ NOTRE Launch d abord : un block lance ici doit etre lu
 *  sur SA pool plutot que sur une pool tierce ouverte au meme jeton. */
export const CLES_MARCHE = [
  /* tip 20260923-wallet-intent-market: HOOK_V8 first (Instant Birth / Give birth · V8), then older TB hooks, then legacy. */
  /* ⛔ NOTRE Launch (lancer-pool.js FEE_POOL=0) — hooked when TbFeeHook DEPLOYE, then legacy zero-hook. */
  /* 2026-10-02 : hook 7030 (0,1 % : app 0,07 % · createur 0,03 %) — lu en premier, SEULEMENT drapeau allume. */
  ...(HOOK_7030_ACTIF ? [{ nom: 'ETH · 0 % · TBlockLaunchLockHook 7030 (Launch)', fee: 0, tickSpacing: 200, hooks: HOOK_7030 }] : []),
  { nom: 'ETH · 0 % · TbFeeHook v8 (Launch)', fee: 0, tickSpacing: 200, hooks: HOOK_V8 },
  { nom: 'ETH · 0 % · TbFeeHook v7 (Launch)', fee: 0, tickSpacing: 200, hooks: HOOK_V7 },
  { nom: 'ETH · 0 % · TbFeeHook v6 (Launch)', fee: 0, tickSpacing: 200, hooks: HOOK_V6 },
  { nom: 'ETH · 0 % · TbFeeHook v5 (Launch)', fee: 0, tickSpacing: 200, hooks: HOOK_V5 },
  { nom: 'ETH · 0 % · TbFeeHook v4 (Launch)', fee: 0, tickSpacing: 200, hooks: HOOK_V4 },
  { nom: 'ETH · 0 % · TbFeeHook v3 (Launch)', fee: 0, tickSpacing: 200, hooks: HOOK_V3 },
  { nom: 'ETH · 0 % · TbFeeHook v2 (Launch)', fee: 0, tickSpacing: 200, hooks: HOOK_V2 },
  { nom: 'ETH · 0 % · TbFeeHook (Launch)', fee: 0, tickSpacing: 200, hooks: HOOK_PREVU },
  { nom: 'ETH · 0 % (legacy Launch)', fee: 0, tickSpacing: 200 },
  { nom: 'ETH · 0,5 % (legacy screen)', fee: 5000, tickSpacing: 200 },
  { nom: 'ETH · 3 % (OpenLaunch)', fee: 30000, tickSpacing: 200 },
  { nom: 'ETH · 1 %', fee: 10000, tickSpacing: 200 },
  { nom: 'ETH · 0,3 %', fee: 3000, tickSpacing: 60 },
  { nom: 'ETH · 0,05 %', fee: 500, tickSpacing: 10 },
];

/**
 * La vie d un block, en devise NOMMEE.
 *
 * @param {object} o
 * @param {(m:string,p:any[])=>Promise<any>} o.rpc        lecteur JSON-RPC
 * @param {string} o.stateView                            adresse du StateView de la chaine courante
 * @param {string} o.jeton                                le block
 * @returns {Promise<{etat:string, vie:number|null, devise:string|null, via:string|null, pourquoi:string|null}>}
 *
 * ⛔ TROIS ETATS, JAMAIS DEUX. « lue », « aucune pool parmi celles essayees » et « pas pu lire »
 *    appellent trois phrases differentes a l ecran. Les fondre en un seul `null` ferait dire
 *    « pas de prix » a une panne de reseau — et une panne chez nous se lirait comme un fait sur le
 *    jeton de quelqu un d autre.
 */
/**
 * ⛔⛔ LES CLES EXACTES PASSENT AVANT LES CANDIDATES (2026-09-17). Mesure : la pool de bGYND est
 *    fee 3000 / tickSpacing 60 / hooks 0xee0f… ; notre liste essayait bien 3000/60 mais TOUJOURS
 *    SANS HOOK — donc un autre poolId, donc « aucun marche ». Et on en avait conclu, a tort, que
 *    les pools des autres lanceurs refusaient notre routeur. Une cle LUE sur la chaine (evenement
 *    Initialize du PoolManager) est la verite ; les candidates ne sont plus qu un repli.
 */
/**
 * ⛔⛔ MARCHE CONTRE UNE DEVISE ERC-20 (hook V3, 2026-09-19). Les cles exactes lues sur la chaine etaient REASSEMBLEES contre
 *    l ETH (cleDePool(ETH_NATIF, …)) : une pool block/AAPLc etait cherchee a une cle qui n existe pas, et le block paraissait
 *    « sans marche » (mesure sur fork). Ici la cle est lue TELLE QUELLE si sa devise est dans la liste (USDC, cbBTC, actions),
 *    et la capitalisation est dite DANS CETTE DEVISE, decimales lues des deux cotes. Rien trouve = null (le reste decide).
 */
/* ⛔⛔ DEUX LECTURES QUI NE SE DEVINENT PAS, et un cache qui ne garde QUE les reponses.
 *     Le code d un contrat et son symbole ne changent jamais : les garder est sur. Mais on ne garde
 *     PAS un echec — une lecture ratee mise en cache condamnerait ce block pour toute la session, et
 *     ce depot a deja paye ca une fois (une face lue en erreur, cachee, definitive). */
const codeConnu = new Map();
const symboleConnu = new Map();

/** ⛔ EGALITE STRICTE A `0xef`. L EIP-3541 interdit ce premier octet a tout deploiement normal :
 *  c est le seul marqueur B20 infalsifiable. Un prefixe d adresse, lui, se choisit avec CREATE2. */
async function codeEstB20(rpc, adresse) {
  const a = String(adresse).toLowerCase();
  if (codeConnu.has(a)) return codeConnu.get(a);
  try {
    const code = await rpc('eth_getCode', [a, 'latest']);
    const est = String(code) === '0xef';
    codeConnu.set(a, est); /* une REPONSE, pas un echec : elle ne changera plus */
    return est;
  } catch { return false; } /* non lu : on ne conclut pas, et on ne garde rien */
}

/** Le symbole tel que le contrat le dit. ⛔ Jamais deduit de l adresse. */
async function symboleSurChaine(rpc, adresse) {
  const a = String(adresse).toLowerCase();
  if (symboleConnu.has(a)) return symboleConnu.get(a);
  try {
    const r = await rpc('eth_call', [{ to: a, data: '0x' + selecteur('symbol()') }, 'latest']);
    if (!r || r === '0x' || String(r).length < 130) return null;
    const hex = String(r).slice(2);
    /* chaine ABI : offset dans le premier mot, longueur au mot suivant, octets ensuite */
    const off = Number(BigInt('0x' + hex.slice(0, 64)));
    const len = Number(BigInt('0x' + hex.slice(off * 2, off * 2 + 64)));
    if (!Number.isFinite(len) || len <= 0 || len > 32) return null;
    let s = '';
    const corps = hex.slice(off * 2 + 64, off * 2 + 64 + len * 2);
    for (let i = 0; i < corps.length; i += 2) {
      const o = parseInt(corps.slice(i, i + 2), 16);
      /* ⛔ on ne garde que l imprimable ASCII : un symbole plein d octets de controle deviendrait
       *   un nom illisible a l ecran, ou pire, imiterait un autre jeton. */
      if (o >= 32 && o < 127) s += String.fromCharCode(o);
    }
    s = s.trim().slice(0, 12);
    if (!s) return null;
    symboleConnu.set(a, s);
    return s;
  } catch { return null; }
}

async function vieEnDevise({ rpc, stateView, jeton, clesExactes }) {
  const j = String(jeton).toLowerCase();
  const connues = new Map(pairesProposees(8453).filter((p) => p.type === 'STABLE' || p.type === 'MAJEUR' || p.type === 'ACTION')
    .map((p) => [p.adr.toLowerCase(), p.symbole]));
  for (const c of Array.isArray(clesExactes) ? clesExactes : []) {
    if (!c || !c.currency0 || !c.currency1) continue;
    const c0 = String(c.currency0).toLowerCase(), c1 = String(c.currency1).toLowerCase();
    if (c0 !== j && c1 !== j) continue;
    const devise = c0 === j ? c1 : c0;
    /* ⛔⛔ UN BLOCK PEUT ETRE APPAIRE A UN AUTRE BLOCK, et jusqu ici ce marche etait INVISIBLE.
     *     L UI acceptait deja une paire B20 (`qualifierPaire` rend le type SAISIE, et Create verifie
     *     le code 0xef avant de laisser signer) — mais cette lecture-ci n acceptait que les devises
     *     du registre. Un block ainsi appaire naissait, sa pool existait sur la chaine, et l app le
     *     montrait « sans marche » POUR TOUJOURS : on pouvait le creer et ne jamais le voir vivre.
     *   ⛔⛔ LE MARQUEUR EST LE CODE, JAMAIS LE PREFIXE D ADRESSE. `0xb2…` s usurpe — on choisit son
     *     adresse avec CREATE2. `eth_getCode` valant EXACTEMENT `0xef` est infalsifiable :
     *     l EIP-3541 interdit ce premier octet a tout deploiement normal. EGALITE STRICTE — pas un
     *     `startsWith`, pas une longueur : c est par un prefixe que ce depot s est deja fait avoir.
     *   ⛔ ET LE SYMBOLE EST LU SUR LA CHAINE, jamais deduit de l adresse : c est le block lui-meme
     *     qui dit comment il s appelle. Sans symbole lisible, on ne lui en invente pas un. */
    let sym = connues.get(devise);
    if (!sym) {
      const estB20 = await codeEstB20(rpc, devise);
      if (!estB20) continue; /* ni du registre, ni un B20 natif : on ne lit pas cette cle */
      sym = await symboleSurChaine(rpc, devise);
      if (!sym) continue;
    }
    const cle = { currency0: c.currency0, currency1: c.currency1, fee: Number(c.fee), tickSpacing: Number(c.tickSpacing), hooks: c.hooks };
    try {
      const s0 = await rpc('eth_call', [{ to: stateView, data: '0x' + selecteur('getSlot0(bytes32)') + poolId(cle).slice(2) }, 'latest']);
      if (!s0 || String(s0).length < 66) continue;
      const sqrt = BigInt(String(s0).slice(0, 66));
      if (sqrt === 0n) continue;
      /* 2026-10-04 : les decimales des deux cotes et la supply ne dependent pas l une de l autre — lues ENSEMBLE, une fois la pool
       *   trouvee (pas avant : sur une cle sans pool ce seraient des lectures en plus). Une seule illisible : cle suivante, comme
       *   avant. Les decimales sortent de la memoire quand elles y sont ; la supply est relue a chaque fois. */
      const [decB, decD, supply] = await lireEnsemble([
        () => decimalesLues({ rpc, stateView, jeton }),
        () => decimalesLues({ rpc, stateView, jeton: devise }),
        async () => BigInt(String(await rpc('eth_call', [{ to: jeton, data: '0x' + selecteur('totalSupply()') }, 'latest'])).slice(0, 66)),
      ]);
      const prix = prixDepuisSqrt({ sqrtPriceX96: sqrt, decDevise: decD, decBlock: decB, deviseEst0: c0 === devise });
      const cap = capitalisation({ supply, decimales: decB, prix, devise: sym });
      if (cap.valeur === null) continue;
      return { etat: 'LUE', vie: cap.valeur, devise: sym, via: 'on-chain key · ' + sym, pourquoi: null, cle, sqrtPriceX96: sqrt,
        decimales: decB, paire: 'DEVISE', deviseAdr: devise, decDevise: decD };
    } catch { /* lecture ratee : on essaie la cle suivante */ }
  }
  return null;
}

/** Une cle exacte est-elle un MARCHE (et pas une pool piege a frais LP statique > 10 %) ? ⛔ UNE SEULE regle : lue par
 *  vieDuBlock ET par le choix des pools d un block au montant (echange.js `clesDeLaPaire`, 2026-10-17). */
const FRAIS_LP_MAX_MARCHE = 100000, FRAIS_DYNAMIQUE = 0x800000;
export function cleEstUnMarche(c) {
  return (!!c && Number.isFinite(Number(c.fee)) && Number.isFinite(Number(c.tickSpacing))
      && (Number(c.fee) <= FRAIS_LP_MAX_MARCHE || Number(c.fee) === FRAIS_DYNAMIQUE));
}
/** Le nom d une cle exacte. ⛔ 2026-10-26 (testeur, /api/marche de GOOGLc : « on-chain key 838.8608 % ») : le drapeau de frais
 *  dynamique v4 0x800000 n est PAS un pourcentage — le hook fixe le frais a chaque echange ; on le dit, sans chiffre invente. */
export function nomCleExacte(c) {
  return Number(c.fee) === FRAIS_DYNAMIQUE ? 'on-chain key · dynamic fee' : 'on-chain key ' + (Number(c.fee) / 10000) + ' %';
}

export async function vieDuBlock({ rpc, stateView, jeton, clesExactes = [], deviseDAbord = false }) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(jeton || ''))) {
    return { etat: 'REFUSEE', vie: null, devise: null, via: null, pourquoi: 'not an address' };
  }
  if (!stateView) {
    return { etat: 'NON_LUE', vie: null, devise: null, via: null, pourquoi: 'no StateView on this network' };
  }
  const selSlot0 = selecteur('getSlot0(bytes32)');

  let lues = 0, ratees = 0, sqrt = 0n, via = null, cleTrouvee = null;
  const nulle = (h) => !h || /^0x0{40}$/i.test(String(h));
  /* ⛔⛔ 2026-10-03 (mesure BLUEPILL, 26 952 $ / 24 h sur sa pool HIMSc) : ses cles exactes comptent des pools pieges —
   *   ETH sans hook a 88,0238 % de frais LP (liquidite 0), USDC a 75 %. La pool ETH etait lue la premiere et devenait « le
   *   marche » : le block paraissait cote en ETH, et sa vraie pool HIMSc n etait jamais atteinte. Un frais LP STATIQUE
   *   au-dessus de 10 % n est pas un marche ; le frais dynamique v4 (drapeau 0x800000) n est pas concerne. */
  const clesSaines = (Array.isArray(clesExactes) ? clesExactes : []).filter(cleEstUnMarche);
  /* ⛔⛔ 2026-10-04 (MESURE sur le planificateur de prod) : un plan d action tokenisee mettait 27 a 175 s. Compte des lectures sur
   *   fork : 23 par plan, dont 17 `getSlot0` SEQUENTIELS sur des pools ETH qui n existent pas pour une action (elle est cotee
   *   en USDC) — sa vraie pool n etait lue qu APRES, par `vieEnDevise`. `deviseDAbord` lit d abord les cles exactes appariees a
   *   une devise ; une reponse LUE est rendue telle quelle (c est celle que l ancien chemin aurait rendue 17 lectures plus tard,
   *   puisqu aucune pool ETH ne la precedait). Rien de lu, ou lecture ratee : on retombe sur le chemin d avant, INCHANGE.
   *   ⛔ Reserve a l appelant qui SAIT que le marche du jeton est une devise (rails-api : les actions du registre). Pour un
   *   block, l ordre ETH d abord reste la regle (un block a pool ETH ET pool devise garde sa pool ETH comme marche). */
  if (deviseDAbord && clesSaines.length) {
    const vd0 = await vieEnDevise({ rpc, stateView, jeton, clesExactes: clesSaines });
    if (vd0) return vd0;
  }
  const candidates = [
    ...clesSaines
      .map((c) => ({ nom: nomCleExacte(c), fee: Number(c.fee),
        tickSpacing: Number(c.tickSpacing), hooks: nulle(c.hooks) ? null : c.hooks })),
    ...CLES_MARCHE,
  ];
  for (const cfg of candidates) {
    const cle = cleDePool(ETH_NATIF, jeton, { fee: cfg.fee, tickSpacing: cfg.tickSpacing, ...(cfg.hooks ? { hooks: cfg.hooks } : {}) });
    let s0;
    try {
      s0 = await rpc('eth_call', [{ to: stateView, data: '0x' + selSlot0 + poolId(cle).slice(2) }, 'latest']);
    } catch {
      /* ⛔ UNE LECTURE RATEE N EST PAS UNE POOL ABSENTE : on ne la compte pas comme un « non ». */
      ratees++;
      continue;
    }
    /* ⛔⛔ VU EN DIRECT (2026-09-13, fil « Blocks talking ») : « TBLOCK: I am dormant now » — NON_TROUVEE sur un block dont
     *    le marche est en ligne. getSlot0 rend TOUJOURS quatre mots : une reponse vide ou courte est une lecture RATEE,
     *    pas une pool absente — ne pas la compter laissait le « zero » des autres cles conclure « aucun marche ». */
    if (!s0 || s0 === '0x' || String(s0).length < 66) { ratees++; continue; }
    lues++;
    const v = BigInt(String(s0).slice(0, 66));
    if (v !== 0n) { sqrt = v; via = cfg.nom; cleTrouvee = cle; break; }
  }

  if (!lues) {
    return { etat: 'NON_LUE', vie: null, devise: null, via: null,
      pourquoi: 'no readable slot0 on any of the ' + candidates.length + ' keys' };
  }
  /* ⛔⛔ BUG TROUVE EN VERIFIANT TBLOCK (2026-09-13) : le marche TBLOCK/ETH est en ligne (cle frais 0), mais sa lecture
   * a ete refusee par le noeud sature pendant que les AUTRES cles repondaient « pas de pool » — et la fonction concluait
   * NON_TROUVEE : « this block has no market yet » sur un block qui en a un. La lecture ratee n etait pas comptee comme
   * un « non »… mais le « non » des autres cles la recouvrait. Si UNE cle n a pas ete lue, on ne peut pas dire « aucune ». */
  /* ⛔⛔ BLOCKS APPARIES A TBLOCK (Phil, 2026-09-13 : « creer des blocks avec TBLOCK »). Si aucune pool ETH n existe, on lit
   * la pool TBLOCK/block (frais 0, espacement 200, HOOK_PREVU ou sans hook — format Launch), et la capitalisation est
   * CONVERTIE EN ETH par le prix de la pool TBLOCK/ETH, lu lui aussi. Un des deux prix illisible = NON_LUE, jamais un chiffre. */
  /* ⛔⛔ AVAIL 2026-09-15: try TBLOCK/block EVEN when some ETH keys rate-limited.
   *    Before: ratees>0 short-circuited to NON_LUE and never opened Buy/Sell for TBLOCK-launched blocks.
   *    Create+Launch default TBLOCK — skipping this path = false « unavailable ». */
  if (sqrt === 0n) {
    const vd = await vieEnDevise({ rpc, stateView, jeton, clesExactes: clesSaines });
    if (vd) return vd;
  }
  if (sqrt === 0n && String(jeton).toLowerCase() !== TBLOCK.toLowerCase()) {
    const vt = await vieEnTblock({ rpc, stateView, jeton });
    if (vt) return vt;
  }
  if (sqrt === 0n && ratees > 0) {
    return { etat: 'NON_LUE', vie: null, devise: null, via: null,
      pourquoi: ratees + ' of the ' + candidates.length + ' market keys could not be read — the market may exist on one of them' };
  }
  if (sqrt === 0n) {
    return { etat: 'NON_TROUVEE', vie: null, devise: null, via: null,
      pourquoi: 'no initialized pool among the ' + candidates.length + ' keys read ('
        + CLES_MARCHE.map((c) => c.nom).join(', ') + ', and TBLOCK · 0 %) — NOT a claim that this block has no price' };
  }

  /* ⛔ LES DECIMALES SE LISENT, ELLES NE SE SUPPOSENT PAS. Supposer 18 a deja produit des
   * capitalisations fausses d un facteur mille sur un jeton a 6 decimales. */
  /* 2026-10-04 : decimales, supply et liquidite de la pool trouvee sont trois lectures INDEPENDANTES — lues ensemble (3 allers-
   *   retours en file avant). Le verdict est celui d avant, dans le meme ordre : decimales ou supply illisible = NON_LUE.
   *   ⛔ Seul ecart : sur CET echec-la, la liquidite a ete demandee pour rien (une lecture de plus, aucun effet sur la reponse). */
  const [luDec, luSupply, luLiquidite] = await enVolBorne([
    () => decimalesLues({ rpc, stateView, jeton }),
    async () => BigInt(String(await rpc('eth_call', [{ to: jeton, data: '0x' + selecteur('totalSupply()') }, 'latest'])).slice(0, 66)),
    () => lireLiquiditePool(rpc, stateView, cleTrouvee),
  ], (f) => f());
  const dec = luDec.ok ? luDec.valeur : null, supply = luSupply.ok ? luSupply.valeur : null;
  if (!Number.isFinite(dec) || supply === null) {
    return { etat: 'NON_LUE', vie: null, devise: null, via,
      pourquoi: 'decimals or supply unread — we never assume 18 decimals' };
  }

  const deviseEst0 = String(cleTrouvee.currency0).toLowerCase() === ETH_NATIF;
  const prix = prixDepuisSqrt({ sqrtPriceX96: sqrt, decDevise: 18, decBlock: dec, deviseEst0 });
  const c = capitalisation({ supply, decimales: dec, prix, devise: 'ETH' });
  if (c.valeur === null || c.valeur === undefined) {
    return { etat: 'NON_LUE', vie: null, devise: null, via, pourquoi: c.pourquoi || 'market cap not computable' };
  }
  /* ⛔ LA CLE TROUVEE EST RENDUE (2026-09-13) : l achat / vente dans l app doit trader SUR LA POOL LUE ICI, pas
   * sur une cle recalculee ailleurs — une deuxieme recherche de marche finirait par diverger de celle-ci. */
  const liquidite = luLiquidite.ok ? luLiquidite.valeur : null;
  return { etat: 'LUE', vie: c.valeur, devise: c.devise, via, pourquoi: null, cle: cleTrouvee, sqrtPriceX96: sqrt, decimales: dec, liquidite };
}
