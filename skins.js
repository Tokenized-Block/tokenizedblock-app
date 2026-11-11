/* skins.js — ACHETER UNE SKIN POUR UN BLOCK : le prix du contrat ACTIF (SKIN_PRIX_USDC, lu dans l enregistrement), et le choix ECRIT DANS LA TRANSACTION.
 *
 * Phil, 2026-10-04 : « prix 1 $ par skin » ; « notre gage de securite pour distinguer un B20 d un autre, comme un certificat onchain » ;
 *   « creer une tx x402 pour acheter le skin, ou autre tx ».
 *
 * CE QUE C EST. Un `transfer(wallet des frais, 1 USDC)` signe dans le wallet de l acheteur, dont le calldata porte a la suite un MEMO
 *   (meme mecanique que les messages de l app, messages.js) : `tb-skin:1:<block>:<recette>`. Le paiement ET le choix (quel block,
 *   quelle skin) sont donc UNE seule transaction, lisible par tous sur la chaine :
 *   - personne ne peut reclamer le paiement d un autre pour une autre skin ou un autre block (le choix est dans SA transaction) ;
 *   - le registre du serveur n est qu un INDEX : chaque ligne porte le hash de sa transaction, et n importe qui peut la reverifier
 *     avec `verifierAchatSkin` — la chaine reste la source.
 *
 * LA VERIFICATION (verifierAchatSkin), sur la TRANSACTION et son RECU — jamais sur la parole du client :
 *   1. le recu dit `status 0x1` ;
 *   2. l input de la transaction CONTIENT, octet pour octet, le calldata attendu (transfer + memo de CE block et de CETTE recette).
 *      « Contient » et non « egale » : un smart wallet enveloppe l appel dans le sien ;
 *   3. le recu porte un `Transfer` emis PAR LE CONTRAT USDC LUI-MEME (champ `address` du log = l USDC du depot : un contrat tiers ne
 *      peut pas emettre a sa place), vers le wallet des frais, d au moins le prix. Son emetteur (`from`) est l ACHETEUR.
 *   4. appel direct (tx.to = USDC) : l acheteur doit etre le signataire de la transaction.
 *
 * ⛔ BORNES, DITES : la skin n est PAS un jeton ni un droit sur le block — c est un habillage, et une ligne d index. Rien n empeche
 *   deux personnes d acheter la meme skin pour le meme block. « Certificat » veut dire : la transaction existe sur la chaine et dit
 *   qui a paye quoi pour quel block ; ce n est pas un contrat de registre (a ecrire et a deployer si on veut plus — signature de Phil).
 * ⛔ Aucun secret, aucune cle, aucun envoi ici : ce module construit un appel NON SIGNE et lit des reponses de noeud. */
import { encodeTransferAvecMemo } from './messages.js';
import { topic } from './keccak.js';
import { SKIN_MINT_USDC, SKIN_MINT_TEXTE, chaineDeploiements } from './blockskins-actif.js';
import { BLOCKSKINS_DEPLOIEMENT } from './blockskins-deploiement.js';

/** Le prix d une skin (6 decimales) : celui du contrat BlockSkins ACTIF, lu dans l enregistrement de deploiement (blockskins-actif.js) —
 *  1 USDC fixe par Phil le 2026-10-04 (v2) ; 10 USDC des que v3 est note (Phil, 2026-10-18). Jamais une constante tapee ici. */
export const SKIN_PRIX_USDC = SKIN_MINT_USDC;
export const SKINS_CATALOGUE = Object.freeze(['gold', 'ice', 'ember', 'toxic', 'violet', 'chrome', 'circuit']);
const TOPIC_TRANSFER = topic('Transfer(address,address,uint256)');
const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x || '').toLowerCase();
const entier359 = (n) => Number.isInteger(n) && n >= 0 && n <= 359;

/** Une recette de skin bien formee : `{ id }` du catalogue, ou `{ id:'random', angle, h:[h1,h2,h3], cube, noyau }` (entiers 0..359). */
export function validerRecette(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return { ok: false, pourquoi: 'the skin must be an object' };
  if (r.id === 'random') {
    const h = Array.isArray(r.h) ? r.h : [];
    if (h.length !== 3 || !h.every(entier359) || !entier359(r.angle) || !entier359(r.cube) || !entier359(r.noyau) || !entier359(r.fond)) {
      return { ok: false, pourquoi: 'a skin is a ring angle, three ring hues, an edge hue, a core hue and a background hue — whole numbers from 0 to 359' };
    }
    return { ok: true, recette: { id: 'random', angle: r.angle, h: [h[0], h[1], h[2]], cube: r.cube, noyau: r.noyau, fond: r.fond } };
  }
  if (typeof r.id !== 'string' || !SKINS_CATALOGUE.includes(r.id)) return { ok: false, pourquoi: 'unknown skin' };
  return { ok: true, recette: { id: r.id } };
}

/** Le memo ecrit dans la transaction. ASCII, court (< 256 octets), sans espace : `tb-skin:1:<block>:<gold | r.a.h1.h2.h3.cube.noyau.fond>`.
 *  2026-10-04 : SEPT nombres (le FOND de la case s est ajoute le jour meme, avant toute vente : aucun memo a six nombres n existe sur
 *  la chaine — verifie : l index de prod etait vide). Un memo a six nombres est REFUSE, il n est pas complete par un defaut. */
export function memoSkin(block, recette) {
  const b = bas(block), v = validerRecette(recette);
  if (!ADR.test(b)) throw new Error('block must be a whole address');
  if (!v.ok) throw new Error(v.pourquoi);
  const r = v.recette;
  return 'tb-skin:1:' + b + ':' + (r.id === 'random' ? 'r.' + [r.angle, r.h[0], r.h[1], r.h[2], r.cube, r.noyau, r.fond].join('.') : r.id);
}

/** L inverse de memoSkin, STRICT : tout ce qui n est pas exactement un memo de skin rend `{ ok:false }`. */
export function lireMemoSkin(texte) {
  const m = /^tb-skin:1:(0x[0-9a-f]{40}):(?:(gold|ice|ember|toxic|violet|chrome|circuit)|r\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3}))$/.exec(String(texte || ''));
  if (!m) return { ok: false };
  if (m[2]) return { ok: true, block: m[1], recette: { id: m[2] } };
  const v = validerRecette({ id: 'random', angle: Number(m[3]), h: [Number(m[4]), Number(m[5]), Number(m[6])], cube: Number(m[7]), noyau: Number(m[8]), fond: Number(m[9]) });
  return v.ok ? { ok: true, block: m[1], recette: v.recette } : { ok: false };
}

/** L appel NON SIGNE de l achat : transfer(beneficiaire, 1 USDC) + memo. */
export function appelAchatSkin({ usdc, beneficiaire, block, recette }) {
  if (!ADR.test(bas(usdc)) || !ADR.test(bas(beneficiaire))) throw new Error('usdc and beneficiary must be whole addresses');
  return { to: bas(usdc), data: encodeTransferAvecMemo(bas(beneficiaire), SKIN_PRIX_USDC, memoSkin(block, recette)), value: '0x0',
    nom: 'pay ' + SKIN_MINT_TEXTE + ' for the skin' };
}

/** The v1 cutoff (2026-11-11, Phil's default): the block at which BlockSkins v2 was deployed, read from the deployment record
 *  (blockskins-deploiement.js), never typed. From that block on, a skin is a token minted by the contract; a plain USDC transfer +
 *  memo to the fee wallet buys no token, so POST /api/skins/achat no longer records one. Payments made before it are still recognised.
 *  null = the record names no deployed v2 with a whole deployment block (the caller then refuses: fail closed). */
export function coupureSkinsV1(d = BLOCKSKINS_DEPLOIEMENT) {
  const v2 = chaineDeploiements(d).find((x) => x && x.version === 2 && /^0x[0-9a-fA-F]{40}$/.test(String(x.adresse || '')));
  return v2 && Number.isInteger(v2.blocDeploiement) && v2.blocDeploiement > 0 ? v2.blocDeploiement : null;
}
export const COUPURE_SKINS_V1 = coupureSkinsV1();

/** Is a VERIFIED v1 payment (transfer + memo) mined in block `bloc` still recordable? Only strictly before the v2 deployment block. */
export function jugerBlocSkinV1(bloc, coupure = COUPURE_SKINS_V1) {
  if (!Number.isInteger(coupure)) return { ok: false, etat: 'REFUSE', pourquoi: 'the BlockSkins deployment block could not be read from the deployment record — nothing was recorded' };
  if (!Number.isInteger(bloc)) return { ok: false, etat: 'NON_LU', pourquoi: 'the block of this payment could not be read yet' };
  if (bloc >= coupure) return { ok: false, etat: 'REFUSE', pourquoi: 'skins are minted on the BlockSkins contract since block ' + coupure + '; a plain transfer is not a skin — nothing was recorded' };
  return { ok: true };
}

/**
 * @param {{ tx:object|null, recu:object|null, usdc:string, beneficiaire:string, block:string, recette:object }} p
 *   `tx` = eth_getTransactionByHash, `recu` = eth_getTransactionReceipt (tels que rendus par le noeud).
 * @returns {{ ok:true, payeur:string, signataire:string|null, bloc:number|null } | { ok:false, etat:'REFUSE'|'NON_LU', pourquoi:string }}
 *   ⛔ NON_LU (transaction ou recu absent) n est PAS un refus : l appelant peut reessayer.
 */
export function verifierAchatSkin({ tx, recu, usdc, beneficiaire, block, recette }) {
  const refus = (pourquoi) => ({ ok: false, etat: 'REFUSE', pourquoi });
  if (!tx || !recu) return { ok: false, etat: 'NON_LU', pourquoi: 'the transaction or its receipt could not be read yet' };
  let appel;
  try { appel = appelAchatSkin({ usdc, beneficiaire, block, recette }); } catch (e) { return refus(String((e && e.message) || e)); }
  if (String(recu.status) !== '0x1') return refus('this transaction failed on chain');
  if (bas(recu.transactionHash) !== bas(tx.hash)) return refus('the receipt is not the one of this transaction');
  const input = bas(tx.input);
  if (!/^0x[0-9a-f]*$/.test(input) || !input.includes(appel.data.slice(2))) {
    return refus('this transaction does not carry the payment for this skin on this block (transfer + memo not found in its input)');
  }
  const U = bas(usdc), ben32 = '0x' + bas(beneficiaire).slice(2).padStart(64, '0');
  let payeur = null;
  for (const l of (Array.isArray(recu.logs) ? recu.logs : [])) {
    if (!l || bas(l.address) !== U || !Array.isArray(l.topics) || l.topics.length !== 3) continue;
    if (bas(l.topics[0]) !== TOPIC_TRANSFER || bas(l.topics[2]) !== ben32) continue;
    let montant = -1n;
    try { montant = BigInt(String(l.data)); } catch (_) { montant = -1n; }
    if (montant >= SKIN_PRIX_USDC) { payeur = '0x' + bas(l.topics[1]).slice(26); break; }
  }
  if (!payeur) return refus('no USDC transfer of at least ' + SKIN_MINT_TEXTE + ' to the fee wallet was found in this transaction');
  const signataire = ADR.test(bas(tx.from)) ? bas(tx.from) : null;
  /* appel direct au contrat USDC : celui qui paie est celui qui signe (un smart wallet, lui, a une transaction signee par un relais) */
  if (bas(tx.to) === U && signataire !== payeur) return refus('the payer is not the signer of this direct transfer');
  let bloc = null;
  try { bloc = parseInt(String(recu.blockNumber), 16); } catch (_) { bloc = null; }
  return { ok: true, payeur, signataire, bloc: Number.isInteger(bloc) ? bloc : null };
}
