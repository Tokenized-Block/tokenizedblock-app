// test-messagerie-usdc.mjs — un message paye en USDC, et les pieges du melange de devises.
// ⛔ TEMOINS NEGATIFS : un transfert USDC n est PAS un message TBLOCK, et l inverse ; un USDC sous le prix est rejete.
import assert from 'node:assert/strict';
import { planMessagePaye, messageDepuisTransfert, deviseMessage, FRAIS_MESSAGE_USDC, FRAIS_MESSAGE_TBLOCK,
  DEVISES_MESSAGE } from './messagerie-blocks.js';
import { FEE_WALLET } from './frais-creation.js';
import { encodeTransferAvecMemo } from './messages.js';

const COMPTE = '0x1111111111111111111111111111111111111111';
const DE = '0xb200000000000000000000000000000000000001';
const A = '0xb200000000000000000000000000000000000002';
const USDC = DEVISES_MESSAGE.USDC.token, TBLOCK = DEVISES_MESSAGE.TBLOCK.token;
const hex = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
/* un faux noeud : EOA (pas de code), soldes par jeton */
const noeud = (soldes) => async (m, p) => {
  if (m === 'eth_getCode') return '0x';
  if (m === 'eth_call') return hex(soldes[String(p[0].to).toLowerCase()] ?? 0n);
  throw new Error('inattendu ' + m);
};

let n = 0;
const ok = async (nom, f) => { await f(); n++; console.log('  ok', nom); };

await ok('devises connues, devise inconnue -> null (pas de repli silencieux)', () => {
  assert.equal(deviseMessage('usdc').frais, FRAIS_MESSAGE_USDC);
  assert.equal(deviseMessage('TBLOCK').frais, FRAIS_MESSAGE_TBLOCK);
  assert.equal(deviseMessage('EUR'), null);
  /* ⛔ LE PRIX EST EPINGLE EXPRES, ET LA VALEUR A CHANGE (Phil, 2026-09-23 : « fais des actions
   *    courtes de contrat a 0.01 usdc comme ca envoie »). Epingler un PRIX est legitime — il ne
   *    doit jamais bouger par accident — contrairement a epingler un numero de build, qui ne teste
   *    que « personne n a deploye depuis ».
   *    ⛔ CE QUI A TRANCHE : a 0,50 $, 0 message paye et 0 USDC arrive au wallet en 14 jours
   *      (mesure du 2026-09-23, 303/303 fenetres lues, 0 ratee). Un prix qui n encaisse rien n est
   *      pas un revenu. ⚠️ Ce qui reste NON PROUVE : qu a 0,01 $ les gens enverront. */
  assert.equal(FRAIS_MESSAGE_USDC, 10000n); /* 0,01 USDC a 6 decimales */
});

await ok('plan USDC : la transaction va au contrat USDC, pour le frais en USDC vers le wallet de frais', async () => {
  const p = await planMessagePaye({ rpc: noeud({ [USDC.toLowerCase()]: 2_000_000n }), compte: COMPTE, de: DE, a: A,
    texte: 'gm', detientDe: true, devise: 'USDC' });
  assert.equal(p.etat, 'PRET');
  assert.equal(p.tx.to, USDC);
  assert.equal(p.frais, FRAIS_MESSAGE_USDC);
  assert.equal(p.devise, 'USDC');
  /* le calldata commence par transfer(FEE_WALLET, 500000) */
  assert.ok(p.tx.data.toLowerCase().startsWith(encodeTransferAvecMemo(FEE_WALLET, FRAIS_MESSAGE_USDC, '').toLowerCase().slice(0, 138)));
});

await ok('solde USDC insuffisant : refus, avec ce qui manque, en USDC', async () => {
  /* ⛔ MONTANTS RECALES SUR LE PRIX DU 2026-09-23 (0,01 USDC). Le cas testait 0,10 $ de solde
   *    contre un frais de 0,50 $ ; a 0,01 $ ce solde est LARGEMENT suffisant et le cas ne testait
   *    plus rien — il rendait `PRET`. L INTENTION est gardee entiere : un solde insuffisant doit
   *    etre refuse, et le refus doit CHIFFRER ce qui manque. Seuls les nombres suivent le prix. */
  const p = await planMessagePaye({ rpc: noeud({ [USDC.toLowerCase()]: 4_000n }), compte: COMPTE, de: DE, a: A,
    texte: 'gm', detientDe: true, devise: 'USDC' });
  assert.equal(p.etat, 'REFUSE');
  assert.equal(p.manque, 6_000n);
  assert.equal(p.devise, 'USDC');
});

await ok('defaut inchange : sans devise, c est toujours TBLOCK (aucune coupure pour qui envoie deja)', async () => {
  const p = await planMessagePaye({ rpc: noeud({ [TBLOCK.toLowerCase()]: FRAIS_MESSAGE_TBLOCK }), compte: COMPTE, de: DE, a: A,
    texte: 'gm', detientDe: true });
  assert.equal(p.etat, 'PRET');
  assert.equal(p.tx.to, TBLOCK);
});

await ok('lecture : un transfert USDC n est pas un message TBLOCK, et l inverse (temoins negatifs)', () => {
  const t = { from: COMPTE, to: FEE_WALLET, value: FRAIS_MESSAGE_USDC, tx: '0xabc' };
  const txUsdc = { from: COMPTE, to: USDC, input: encodeTransferAvecMemo(FEE_WALLET, FRAIS_MESSAGE_USDC, 'tbx1 de=' + DE + ' a=' + A + ' gm') };
  assert.equal(messageDepuisTransfert(t, txUsdc, 'USDC').etat, 'MESSAGE');
  /* le meme transfert lu comme TBLOCK : sous le prix TBLOCK -> rejete */
  assert.equal(messageDepuisTransfert(t, txUsdc, 'TBLOCK').etat, 'REJETE');
  /* ⛔ UN USDC SOUS LE PRIX -> REJETE. La valeur suit le prix (0,01 USDC depuis le 2026-09-23) :
   *    499 999 etait « un wei sous 0,50 $ » et vaut maintenant cinquante fois le frais. Le cas
   *    doit rester UN WEI SOUS LE PRIX — c est la borne qui compte, pas le nombre. */
  assert.equal(messageDepuisTransfert({ ...t, value: FRAIS_MESSAGE_USDC - 1n }, txUsdc, 'USDC').etat, 'REJETE');
});

/* ⛔⛔ TEMOIN NEUF (2026-09-23) : LE WALLET DE FRAIS PEUT PARLER, ET SON MESSAGE EST MARQUE.
 *     Avant, il etait REJETE — l app etait muette pour son proprietaire, seul wallet qu il a en
 *     main (Phil : « je suis bloque sur l app je peux pas evoluer »). On a retire l INTERDIT, pas
 *     la VERITE : le frais revient d ou il part, et `fraisRendu` le dit pour que rien ne le compte
 *     comme une entree. */
await ok('le wallet de frais peut parler, et son message porte fraisRendu', () => {
  const memo = 'tbx1 de=' + DE + ' a=' + A + ' gm';
  const t = { from: FEE_WALLET, to: FEE_WALLET, value: FRAIS_MESSAGE_USDC, tx: '0xdef' };
  const tx = { from: FEE_WALLET, to: USDC, input: encodeTransferAvecMemo(FEE_WALLET, FRAIS_MESSAGE_USDC, memo) };
  const m = messageDepuisTransfert(t, tx, 'USDC');
  assert.equal(m.etat, 'MESSAGE', 'le wallet de frais doit pouvoir parler');
  assert.equal(m.fraisRendu, true, 'son message doit etre marque : le frais est revenu a son point de depart');
  assert.equal(m.texte, 'gm');
  /* ⛔ ET LE TEMOIN NEGATIF, sinon `fraisRendu` pourrait etre vrai partout sans qu on le voie. */
  const autre = { from: COMPTE, to: FEE_WALLET, value: FRAIS_MESSAGE_USDC, tx: '0xabc' };
  const txAutre = { from: COMPTE, to: USDC, input: encodeTransferAvecMemo(FEE_WALLET, FRAIS_MESSAGE_USDC, memo) };
  const n2 = messageDepuisTransfert(autre, txAutre, 'USDC');
  assert.equal(n2.etat, 'MESSAGE');
  assert.equal(n2.fraisRendu, false, 'un message d un autre wallet ne doit PAS etre marque');
});

console.log('test-messagerie-usdc:', n, 'cas, exit 0');
