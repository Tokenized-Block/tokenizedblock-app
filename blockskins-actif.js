/* blockskins-actif.js — LE CONTRAT BlockSkins QUE L APP UTILISE, ET SON PRIX DE MINT : lus dans l enregistrement de deploiement GENERE
 * (blockskins-deploiement.js), jamais tapes ici ni ailleurs dans l app.
 *
 * Phil, 2026-10-18 (08:40, chat) : « change le code pour que tous les skins soient a 10 dollars ». Le prix est GRAVE dans le contrat
 *   (MINT_PRICE) : ecrire « 10 » a l ecran pendant que la chaine prend 1 serait un mensonge. Donc :
 *   - l enregistrement porte, pour CHAQUE version deployee, `mintPriceUsdc` (relu sur la chaine au moment de noter l adresse) ;
 *   - l app prend le PREMIER contrat DEPLOYE de la chaine des enregistrements (le plus recent d abord : v3 si son adresse est notee,
 *     sinon v2 dans `precedent`) et affiche SON prix. Le jour ou v3 est signe et note, chaque texte passe a 10 USDC sans autre edition ;
 *   - avant d acheter, l app RELIT MINT_PRICE() sur la chaine et refuse si elle differe de ce prix (app.html, bcAcheterSkin).
 * ⛔ Ce module ne signe rien, ne lit pas la chaine : il lit un fichier genere. Sans contrat deploye dans l enregistrement, il LEVE :
 *   mieux une app qui ne demarre pas qu une app qui affiche un prix d un contrat qui n existe pas. */
import { BLOCKSKINS_DEPLOIEMENT } from './blockskins-deploiement.js';
import { SKINS as SKINS_PACK_ADR, SKINS_DEPLOIEMENT, ROUTER as ROUTEUR_PACK, USDC as USDC_PACK } from './economie-pack.js';
import { FRAIS_CONTRATS } from './frais-contrats.js';
import { SKINS_SPIN_DEPLOIEMENT } from './skins-spin-deploiement.js';
import { deployes as deployesSkinsSpin } from './skins-spin.js';

const ADR = /^0x[0-9a-fA-F]{40}$/;

/** la chaine des enregistrements, du plus recent (la racine) au plus ancien (precedent de precedent…) */
export function chaineDeploiements(d) {
  const out = [];
  for (let x = d, i = 0; x && i < 16; x = x.precedent, i += 1) out.push(x);
  return out;
}

/** le premier enregistrement qui porte une adresse deployee ET un prix de mint relu ; leve sinon (jamais un defaut a la place) */
export function contratActif(d = BLOCKSKINS_DEPLOIEMENT) {
  const actif = chaineDeploiements(d).find((x) => ADR.test(String(x.adresse || '')));
  if (!actif) throw new Error('blockskins-deploiement.js names no deployed BlockSkins contract');
  if (!/^[1-9]\d*$/.test(String(actif.mintPriceUsdc))) throw new Error('the deployment record of ' + actif.adresse + ' carries no read-back mint price');
  return actif;
}

/** un montant USDC brut (6 decimales) -> le texte le plus court et exact : 10000000n -> '10', 1000000n -> '1', 500000n -> '0.5' */
export function usdcTexte(brut) {
  const v = BigInt(brut);
  if (v < 0n) throw new Error('a price is never negative');
  const ent = v / 1000000n, frac = (v % 1000000n).toString().padStart(6, '0').replace(/0+$/, '');
  return ent.toString() + (frac ? '.' + frac : '');
}

/* 2026-11-12 (the economy pack is live): Skins (S) of the pack is the contract the app mints on — through the TBLOCK payment router only
 *   (`routeur`: no direct mint), lists and sells on. Its record is BUILT here, never typed: the address and block from the deployment
 *   record (economie-pack.js), the mint price from the generated constants of its source (frais-contrats.js MINT_PRICE of
 *   contracts/src/BlockSkins.sol, the source of step S; the app reads MINT_PRICE() on chain again before paying), the image from that same
 *   source (its tokenURI carries "image", checked by the test). `precedent` = the earlier records, so the earlier skins stay readable. */
export const SKINS_PACK = SKINS_PACK_ADR ? Object.freeze({ version: 'pack', adresse: SKINS_PACK_ADR, blocDeploiement: SKINS_DEPLOIEMENT.bloc, routeur: ROUTEUR_PACK,
  mintPriceUsdc: FRAIS_CONTRATS.BlockSkins.MINT_PRICE, imageDansLeWallet: true, constructeur: Object.freeze({ usdc: USDC_PACK }), precedent: BLOCKSKINS_DEPLOIEMENT }) : null;
/* 2026-11-12 (Phil): the NEW Skins at 1 USDC (skins-spin-deploiement.js), paid through the same TBLOCK payment router; a mint there is NOT a
 *   play for the holders vault or the lock rewards (economie-pack.js SKINS_JOUE). Its record is BUILT here, never typed, and ONLY once the noter wrote its
 *   address (skins-spin.js deployes: the CREATE address of the record's deployer and nonce, with its tx and block); with adresse null it is
 *   null and nothing changes. Its price and router come from the record (the price read from the source by the preparer). `precedent` =
 *   the pack's Skins and the earlier records: their skins stay readable and sellable, each on its own contract and market. */
export function skinsUnDepuis(rec, precedent) {
  const d = deployesSkinsSpin(rec).skins;
  if (!d) return null;
  return Object.freeze({ version: 'un', adresse: d.adresse, blocDeploiement: d.bloc, routeur: String(d.config.router).toLowerCase(), mintPriceUsdc: String(d.config.mintPriceUsdc),
    imageDansLeWallet: true, constructeur: Object.freeze({ usdc: String(d.config.expectedUsdc).toLowerCase() }), precedent });
}
export const SKINS_UN = skinsUnDepuis(SKINS_SPIN_DEPLOIEMENT, SKINS_PACK || BLOCKSKINS_DEPLOIEMENT);
const RACINE = SKINS_UN || SKINS_PACK || BLOCKSKINS_DEPLOIEMENT;
export const BLOCKSKINS_ACTIF = contratActif(RACINE);
export const BLOCKSKINS = String(BLOCKSKINS_ACTIF.adresse).toLowerCase();
/** every deployed skins contract, OLDEST FIRST (the active one last): the skins of each stay readable, each with its own market */
export const BLOCKSKINS_LUS = Object.freeze(chaineDeploiements(RACINE).filter((x) => ADR.test(String(x.adresse || '')))
  .map((x) => String(x.adresse).toLowerCase()).reverse());
/** the XP sources of the server, one per skins contract the app minted on, each with its OWN key and creation block (never another
 *  contract's cursor). Kept as before the 1 USDC Skins: 'skins' = the last contract before the pack (its cursor is the one already saved),
 *  'skinsPack' = the pack's Skins; then 'skinsUn' = the 1 USDC Skins once recorded. */
export function sourcesSkins(pack = SKINS_PACK, un = SKINS_UN, base = BLOCKSKINS_DEPLOIEMENT) {
  const anc = contratActif(pack ? pack.precedent : base);
  const s = (cle, x) => Object.freeze({ cle, contrat: String(x.adresse).toLowerCase(), bloc: x.blocDeploiement });
  return [s('skins', anc), ...(pack ? [s('skinsPack', pack)] : []), ...(un ? [s('skinsUn', un)] : [])];
}

/** The body of GET /api/skins/prix (2026-11-11): how a skin is bought TODAY, on the active BlockSkins contract.
 *  An exact USDC approve to the contract (only when the allowance is short), then mint(block, packed skin). The contract fixes the
 *  price and where the money goes, so the body names no beneficiary and no memo: the transfer + memo rail is retired.
 *  `prixUsdc` and `decimales` are kept for older readers. Everything is read from the deployment record, never typed. */
export function skinsPrixCorps(actif = BLOCKSKINS_ACTIF) {
  if (!actif || !ADR.test(String(actif.adresse || ''))) throw new Error('skinsPrixCorps needs a deployed BlockSkins record');
  if (!/^[1-9]\d*$/.test(String(actif.mintPriceUsdc))) throw new Error('the deployment record carries no read-back mint price');
  const usdc = String((actif.constructeur && actif.constructeur.usdc) || '');
  if (!ADR.test(usdc)) throw new Error('the deployment record names no USDC contract');
  const prix = String(actif.mintPriceUsdc);
  /* 2026-11-12: a skin of the pack is paid through the TBLOCK payment router: exact approve to the ROUTER, then pay(skins, price, minOut,
   *   deadline, abi.encode(block, packed skin)); minOut = a fresh quote of what the USDC after the dev cut buys, less 1 % */
  if (actif.routeur) {
    if (!ADR.test(String(actif.routeur))) throw new Error('the record names no router');
    return {
      ok: true, format: 'router', version: actif.version, contract: String(actif.adresse).toLowerCase(), router: String(actif.routeur).toLowerCase(),
      priceUsdc: prix, prixUsdc: prix, decimals: 6, decimales: 6, usdc: usdc.toLowerCase(),
      steps: [
        { call: 'approve(address,uint256)', on: 'usdc', spender: 'router', amount: 'priceUsdc', when: 'only if allowance < priceUsdc', exact: true },
        { call: 'pay(address,uint256,uint256,uint256,bytes)', on: 'router', args: ['the skins contract', 'priceUsdc', 'minimum TBLOCK out: a fresh quote of (priceUsdc minus the dev part of USDC_SPLIT()) less 1 %, never under minOutFloor()', 'deadline (seconds)', 'abi.encode(address block, uint64 packed skin: 7 x 9-bit hues 0-359, value i at bit 9*i)'] },
      ],
      readBack: ['MINT_PRICE()', 'USDC_SPLIT()', 'ROUTER()'],
      legacy: { memoTransfer: false, why: 'skins are minted on the skins contract through the TBLOCK payment router; the transfer + memo rail is retired' },
    };
  }
  return {
    ok: true,
    format: 'mint',
    version: actif.version,
    contract: String(actif.adresse).toLowerCase(),
    priceUsdc: prix,
    prixUsdc: prix,
    decimals: 6,
    decimales: 6,
    usdc: usdc.toLowerCase(),
    steps: [
      { call: 'approve(address,uint256)', on: 'usdc', spender: 'contract', amount: 'priceUsdc', when: 'only if allowance < priceUsdc', exact: true },
      { call: 'mint(address,uint64)', on: 'contract', args: ['block address', 'packed skin: 7 x 9-bit values, each a whole hue 0-359 (ring turn, ring 1, ring 2, ring 3, edges, core, background), value i at bit 9*i; the contract reverts on a value above 359'] },
    ],
    readBack: ['MINT_PRICE()'],
    legacy: { memoTransfer: false, why: 'skins are minted on the BlockSkins contract; the transfer + memo rail is retired' },
  };
}
export const BLOCKSKINS_VERSION = BLOCKSKINS_ACTIF.version;
/** MINT_PRICE du contrat ACTIF (6 decimales), relu sur la chaine quand son adresse a ete notee — jamais une constante tapee */
export const SKIN_MINT_USDC = BigInt(BLOCKSKINS_ACTIF.mintPriceUsdc);
/** le texte que TOUT ecran emploie pour ce prix (« 1 USDC » aujourd hui sur v2 ; « 10 USDC » des que v3 est note) */
export const SKIN_MINT_TEXTE = usdcTexte(SKIN_MINT_USDC) + ' USDC';
/* ⛔⛔ Phil, 2026-10-11 : « v2 avant tout mint ». Le mint ne s ouvre que sur un contrat deploye dont l enregistrement GENERE dit que le
 *   tokenURI porte l image (derive de la source) — jamais sur un drapeau pose a la main. */
export const SKIN_MINT_OUVERT = BLOCKSKINS_ACTIF.imageDansLeWallet === true && ADR.test(String(BLOCKSKINS_ACTIF.adresse || ''));
