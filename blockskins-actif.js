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

export const BLOCKSKINS_ACTIF = contratActif();
export const BLOCKSKINS = String(BLOCKSKINS_ACTIF.adresse).toLowerCase();

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
