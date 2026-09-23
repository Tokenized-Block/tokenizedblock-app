// messagerie-blocks.js — la messagerie ENTRE BLOCKS, payee en TBLOCK, en UNE signature, sans contrat et sans custodie.
// ================================================================================================
// ⛔ DECISION DE PHIL (2026-09-14) : « TBLOCK fixe -> wallet de frais ». Design recommande par le workflow verifie :
//    un message = TBLOCK.transfer(FEE_WALLET, FRAIS_MESSAGE) dont le message on-chain porte l en-tete
//        tbx1 de=<block qui parle> a=<block qui recoit> <texte>
//    Un seul appel : il se fait en entier ou pas du tout. Personne ne detient les fonds de personne.
// ⛔⛔ CE QUE LE LECTEUR EXIGE, ET POURQUOI (chaque regle vient d un risque mesure) :
//    · le transfert va au wallet de frais, d au moins FRAIS_MESSAGE (sinon un transfert de 0 GRATUIT — mesure : accepte
//      sans solde — ferait « parler » n importe quel block) ;
//    · tx.to = TBLOCK et tx.from = l emetteur du log (un evenement n est pas une transaction) ;
//    · ⛔ CETTE REGLE A CHANGE LE 2026-09-23 : elle disait « l emetteur n est PAS le wallet de frais ».
//      Elle rendait l app muette pour son proprietaire, seul wallet qu il a en main. L envoi est
//      desormais PERMIS et le transfert est MARQUE `fraisRendu` a la lecture : le frais revient d ou
//      il part, ca s affiche, et rien ne le compte comme une entree. Cacher n est pas la seule facon
//      d etre honnete, et c est la plus couteuse ;
//    · l en-tete se lit, et nomme deux ADRESSES entieres.
// ⛔ « de=X » EST UNE DECLARATION DU SIGNATAIRE : l ecran dit « wallet W, parlant comme X », jamais « X a dit ». L app
//    exige a l envoi que W detienne X ; un script peut s en passer, le lecteur l affiche donc toujours avec W.
// ⛔ CE N EST PAS UN BUYBACK : le frais deplace du TBLOCK vers le wallet de frais. Aucune promesse de prix.
// ⚠️ Un wallet smart-contract (4337) signe via un bundler : tx.from != emetteur, le message serait PAYE et ILLISIBLE.
//    L envoi le refuse avant la signature (code de compte lu). Un EOA delegue 7702 (code 0xef0100…) signe en direct : accepte.
import { encodeTransferAvecMemo, lireMemo, validerMemo } from './messages.js';
import { TBLOCK } from './tokenomics.js';
import { FEE_WALLET } from './frais-creation.js';
import { selecteur } from './pool.js';
import { listerTransfers } from './index-blocks.js';
import { USDC_BASE } from './prix-eth.js';

/** ⛔ Montant FIXE choisi pour la mise en service (1 000 TBLOCK) : parametre nomme, a ajuster par decision de Phil. */
export const FRAIS_MESSAGE_TBLOCK = 1000n * 10n ** 18n;
/** ⛔ 0,01 $ en USDC (6 decimales). Phil (2026-09-23, capture a l appui) : « fais des actions
 *  courtes de contrat a 0.01 usdc comme ca envoie » — le message doit partir, pas faire reflechir.
 *  ⛔ IL ETAIT A 0,50 $ (decision du 2026-09-17, « de l argent qui rentre »). Mesure qui a tranche :
 *    0 message paye en 14 jours, et 0 USDC arrive au wallet. Un prix qui n encaisse rien n est pas
 *    un revenu, c est un panneau d arret — cinquante fois trop cher pour dire « gm ».
 *  ⚠️ CE QUE CE CHANGEMENT NE PROUVE PAS : qu a 0,01 $ les gens enverront. Ca reste a MESURER ;
 *     d ici la, le seul fait etabli est que 0,50 $ n a rien produit. */
export const FRAIS_MESSAGE_USDC = 10_000n;
/**
 * ⛔⛔ DEUX DEVISES, UNE SEULE FORME DE TRANSACTION. Un message paye reste un `transfer` vers le wallet
 * de frais, memo colle derriere le calldata : une implementation ERC-20 ne decode que ses deux premiers
 * mots, donc les octets en trop voyagent sans rien casser et restent lisibles dans l input.
 * ⛔ LE TBLOCK NE DISPARAIT PAS : il reste la devise par defaut (aucune coupure pour qui envoie deja).
 * ⚠️ LES MONTANTS NE SE COMPARENT PAS : 1000 TBLOCK et 0,50 $ n ont aucune raison de valoir la meme
 *    chose. L ecran affiche toujours la devise A COTE du montant, et ne totalise jamais les deux.
 */
export const DEVISES_MESSAGE = Object.freeze({
  TBLOCK: Object.freeze({ token: TBLOCK, frais: FRAIS_MESSAGE_TBLOCK, decimales: 18, nom: 'TBLOCK' }),
  USDC: Object.freeze({ token: USDC_BASE, frais: FRAIS_MESSAGE_USDC, decimales: 6, nom: 'USDC' }),
});
/** La devise demandee, ou `null` — jamais un repli silencieux sur une autre devise que celle demandee. */
export function deviseMessage(devise) {
  return DEVISES_MESSAGE[String(devise ?? 'TBLOCK').toUpperCase()] || null;
}
export const PREFIXE_MESSAGE_BLOCK = 'tbx1 ';
export const ETATS_MESSAGE_BLOCK = ['LU', 'AUTRE', 'ILLISIBLE'];
export const ETATS_ENVOI_MESSAGE = ['PRET', 'REFUSE', 'NON_MESURE'];
const ADR = /^0x[0-9a-fA-F]{40}$/;
const pad = (a) => String(a).toLowerCase().replace(/^0x/, '').padStart(64, '0');

/** L en-tete + le texte, verifie par la garde des messages (256 octets au total). */
export function encoderMessageBlock({ de, a, texte }) {
  if (!ADR.test(String(de || '')) || !ADR.test(String(a || ''))) return { etat: 'REFUSE', pourquoi: 'both blocks must be whole addresses' };
  if (String(de).toLowerCase() === String(a).toLowerCase()) return { etat: 'REFUSE', pourquoi: 'a block writes to another block' };
  const t = String(texte ?? '').trim();
  if (!t) return { etat: 'REFUSE', pourquoi: 'write something' };
  const v = validerMemo(PREFIXE_MESSAGE_BLOCK + 'de=' + String(de).toLowerCase() + ' a=' + String(a).toLowerCase() + ' ' + t);
  if (v.etat !== 'OK') return { etat: 'REFUSE', pourquoi: v.pourquoi || 'message refused' };
  return { etat: 'OK', memo: v.texte };
}

/** Relit un message : `AUTRE` pour tout message qui n est pas de la messagerie entre blocks. */
export function lireMessageBlock(texte) {
  const s = String(texte ?? '');
  if (!s.startsWith(PREFIXE_MESSAGE_BLOCK)) return { etat: 'AUTRE' };
  const m = s.match(/^tbx1 de=(0x[0-9a-f]{40}) a=(0x[0-9a-f]{40}) ([\s\S]+)$/);
  if (!m || m[1] === m[2]) return { etat: 'ILLISIBLE', pourquoi: 'block message header malformed' };
  return { etat: 'LU', de: m[1], a: m[2], texte: m[3] };
}

/**
 * Prepare l envoi d un message paye. Rien n est signe ici.
 * @param {{ rpc: Function, compte: string, de: string, a: string, texte: string, detientDe: boolean|null }} o
 *   `detientDe` : le solde du block `de` lu par l app (true/false), null si non lu.
 */
export async function planMessagePaye({ rpc, compte, de, a, texte, detientDe = null, devise = 'TBLOCK' }) {
  const dev = deviseMessage(devise);
  if (!dev) return { etat: 'REFUSE', pourquoi: 'unknown currency for the message fee' };
  if (!ADR.test(String(compte || ''))) return { etat: 'REFUSE', pourquoi: 'connect your wallet first' };
  /* ⛔⛔ LE REFUS « le wallet de frais ne peut pas se payer lui-meme » EST RETIRE (Phil, 2026-09-23 :
   *     « je suis bloque sur l app je peux pas evoluer », capture a l appui).
   *     CE QU IL FAISAIT DE BIEN : empecher que la cle du wallet de frais fabrique des messages
   *     « payes » pour le prix du gas, et gonfle notre propre compteur.
   *     CE QU IL FAISAIT DE MAL, ET QUI PESE PLUS LOURD : il rendait l app INUTILISABLE depuis le
   *     seul wallet que son proprietaire a en main. Une regle d integrite qui empeche de se servir
   *     du produit protege un chiffre contre son propre auteur.
   *     ⛔ RIEN N EST GONFLE POUR AUTANT : le frais revient bien a son point de depart, et c est
   *       DIT — le transfert est marque `fraisRendu` a la lecture (voir `messageDepuisTransfert`),
   *       il s affiche dans le fil et n est jamais compte comme une entree. On retire l INTERDIT,
   *       pas la VERITE. Le libelle interne « Fees for Dev path » part avec lui.
   *     ⚠️ CE QUE CA OUVRE, ET QU IL FAUT SAVOIR : qui detient cette cle peut faire parler
   *       n importe quel block qu elle detient, pour le prix du gas. C est un pouvoir du
   *       proprietaire du wallet, pas une faille ouverte a tous. */
  const enc = encoderMessageBlock({ de, a, texte });
  if (enc.etat !== 'OK') return enc;
  if (detientDe === false) return { etat: 'REFUSE', pourquoi: 'you hold none of the block you speak as' };
  if (detientDe !== true) return { etat: 'NON_MESURE', pourquoi: 'your balance of the block you speak as was not read' };
  const lire = rpc;
  let code, solde;
  try {
    code = String(await lire('eth_getCode', [compte, 'latest']));
    solde = BigInt(String(await lire('eth_call', [{ to: dev.token, data: '0x' + selecteur('balanceOf(address)') + pad(compte) }, 'latest'])).slice(0, 66));
  } catch (e) {
    return { etat: 'NON_MESURE', pourquoi: 'your account or ' + dev.nom + ' balance could not be read' };
  }
  /* tip 2347: Base App / smart wallets MAY pay the fee → a6cf. Memo readback can stay opaque on AA
   * (bundler tx.to ≠ TBLOCK) — still PREPARE; Social may show fee without chat text. 7702 EOA = full path. */
  const estSmartWallet = code !== '0x' && !/^0xef0100[0-9a-f]{40}$/i.test(code);
  if (solde < dev.frais) return { etat: 'REFUSE', pourquoi: 'not enough ' + dev.nom + ' for the message fee', manque: dev.frais - solde, devise: dev.nom };
  return { etat: 'PRET', pourquoi: null, frais: dev.frais, devise: dev.nom, decimales: dev.decimales, aaOpaque: estSmartWallet || undefined,
    tx: { to: dev.token, data: encodeTransferAvecMemo(FEE_WALLET, dev.frais, enc.memo), value: '0x0' } };
}

/**
 * Filtre PUR : garde un transfert comme message paye seulement si toutes les regles tiennent.
 * @param {{from:string, to:string, value:bigint, tx:string, bloc?:number}} t  le log Transfer (de TBLOCK)
 * @param {{from:string, to:string, input:string}|null} tx  la transaction lue
 */
export function messageDepuisTransfert(t, tx, devise = 'TBLOCK') {
  const dev = deviseMessage(devise);
  if (!dev) return { etat: 'REJETE', pourquoi: 'unknown currency for the message fee' };
  if (!t || !tx) return { etat: 'REJETE', pourquoi: 'transaction not read' };
  /* ⛔ « Fees for Dev » RETIRE DES DEUX RAISONS CI-DESSOUS (2026-09-23) : ces chaines remontent a
   *    l ecran quand un transfert est ecarte du fil, et le lecteur n a aucun moyen de savoir ce
   *    qu est un « Fees for Dev path ». Les REGLES sont inchangees — seul le mot part. */
  if (String(t.to).toLowerCase() !== FEE_WALLET.toLowerCase()) return { etat: 'REJETE', pourquoi: 'the message fee did not go to the fee wallet' };
  if (typeof t.value !== 'bigint' || t.value < dev.frais) return { etat: 'REJETE', pourquoi: 'below the message fee' };
  /* ⛔⛔ UN MESSAGE ENVOYE PAR LE WALLET DE FRAIS N EST PLUS REJETE — IL EST MARQUE.
   *     Il etait ecarte du fil, ce qui rendait l app muette pour son proprietaire (Phil,
   *     2026-09-23). Le rejeter cachait un transfert qui a REELLEMENT eu lieu ; le marquer dit la
   *     seule chose qui compte : le frais est revenu d ou il partait, donc ce message n a rien
   *     rapporte. `fraisRendu` voyage avec l evenement pour que rien ne le compte comme une
   *     entree — cacher n est pas la seule facon d etre honnete, et c est la plus couteuse. */
  const fraisRendu = String(t.from).toLowerCase() === FEE_WALLET.toLowerCase();
  /* ⛔ LE JETON DE LA TRANSACTION DOIT ETRE CELUI DE LA DEVISE ATTENDUE : sinon un transfert d USDC
   * passerait pour un message en TBLOCK (et le contraire), et les deux compteurs se melangeraient. */
  const direct = String(tx.to).toLowerCase() === dev.token.toLowerCase();
  if (!direct) {
    /* tip 2347: AA / bundler — Transfer still paid FEE_WALLET; chat text opaque */
    return { etat: 'MESSAGE_FEE', signataire: String(t.from).toLowerCase(), de: null, a: null, texte: null,
      frais: t.value, tx: t.tx, bloc: t.bloc ?? null, aaOpaque: true, fraisRendu,
      pourquoi: 'fee paid; message text not readable through a smart-wallet relay' };
  }
  if (String(tx.from).toLowerCase() !== String(t.from).toLowerCase()) return { etat: 'REJETE', pourquoi: 'the signer is not the sender of the transfer' };
  const m = lireMemo(tx.input);
  if (m.etat !== 'LU') return { etat: 'REJETE', pourquoi: 'no message in the transaction' };
  const mb = lireMessageBlock(m.texte);
  if (mb.etat !== 'LU') return { etat: 'REJETE', pourquoi: mb.pourquoi || 'not a block message' };
  return { etat: 'MESSAGE', signataire: String(tx.from).toLowerCase(), de: mb.de, a: mb.a, texte: mb.texte, frais: t.value, tx: t.tx, bloc: t.bloc ?? null, fraisRendu };
}

/** Les messages payes des derniers `blocs` blocs, groupes par paire de blocks. Les fenetres ratees sont rendues. */
/* ⛔ LES DEUX DEVISES SONT LUES : un message paye en USDC doit apparaitre dans le fil comme un message paye en TBLOCK.
 * Les fenetres ratees des deux lectures sont additionnees — une devise non lue n est jamais une devise vide. */
export async function lireConversations({ rpc, blocs = 20000, fin = null, pause = 350 }) {
  const lire = rpc;
  const messages = [], compteurs = { rejetes: 0, nonLisibles: 0, sousFrais: 0 };
  const lectures = [];
  for (const [nomDevise, dev] of Object.entries(DEVISES_MESSAGE)) {
    const lu = await listerTransfers({ rpc: lire, token: dev.token, blocs, fin, toAddr: FEE_WALLET });
    lectures.push(lu);
    for (const t of lu.transfers || []) {
      if (typeof t.value !== 'bigint' || t.value < dev.frais) { compteurs.sousFrais++; continue; }
      let tx = null;
      try { tx = await lire('eth_getTransactionByHash', [t.tx]); } catch (e) { tx = null; }
      if (pause > 0) await new Promise((ok) => setTimeout(ok, pause));
      const x = messageDepuisTransfert(t, tx, nomDevise);
      if (x.etat === 'MESSAGE' || x.etat === 'MESSAGE_FEE') messages.push({ ...x, devise: nomDevise });
      else if (x.etat === 'NON_LISIBLE') compteurs.nonLisibles++;
      else compteurs.rejetes++;
    }
  }
  const r = { fenetresRatees: lectures.flatMap((l) => l.fenetresRatees || []) };
  const paires = new Map();
  for (const m of messages) {
    const cle = [m.de, m.a].sort().join('|');
    if (!paires.has(cle)) paires.set(cle, []);
    paires.get(cle).push(m);
  }
  return { messages, paires, compteurs, fenetresRatees: r.fenetresRatees || [] };
}
