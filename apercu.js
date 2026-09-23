// apercu.js — ce que le wallet va signer, RELU DEPUIS LE CALLDATA, avant l ouverture du wallet.
// ================================================================================================
// ⛔⛔ ON RELIT LA TRANSACTION, PAS L INTENTION. L apercu decode les octets qui partent vraiment
//    (`to`, `data`, `value`) : si l ecran et le calldata divergeaient un jour, c est le calldata qui
//    parle ici. Idee reprise de basedpad.fun (lu le 2026-09-13) : paire, prix, frais et DESTINATAIRE
//    dits avant la signature.
// ⛔ UN APPEL QU ON NE SAIT PAS LIRE EST DIT ILLISIBLE, jamais resume au hasard : « ne signe pas ce
//    que tu ne peux pas lire ».
// ⚠️ FONCTION PURE : aucun reseau. Les noms viennent des modules qui portent deja ces adresses — aucune
//    adresse n est recopiee ici.
import { selecteur, MAX_UINT256, MAX_UINT160 } from './pool.js';
import { lireMemo } from './messages.js';
import { FEE_WALLET, CREATE_ROUTER, USDC_BASE, USDC_DECIMALES } from './frais-creation.js';
import { FACTORY } from './index-blocks.js';
import { V4_ADRESSES, PERMIT2, PROPRIETAIRE_PERMANENT } from './lancer-pool.js';
import { formaterUnites } from './montants.js';

/** ⛔ RECOPIE de index.html (const ROUTEUR) — le test d echange.js compare la meme valeur ; apercu ne l importe
 *  pas d echange.js pour ne pas tirer le lecteur de marche dans un module pur. */
const ROUTEUR_SWAP = { 84532: '0x492E6456D9528771018DeB9E87ef7750EF184104', 8453: '0x6ff5693b99212DA76aD316178A184AB56D299b43' };

export const ETATS_APERCU = ['LUE', 'INCONNUE'];
const S = {
  transfer: selecteur('transfer(address,uint256)'),
  approve: selecteur('approve(address,uint256)'),
  permit2: selecteur('approve(address,address,uint160,uint48)'),
  create: selecteur('createB20(uint8,bytes32,bytes,bytes[])'),
  createPaid: selecteur('createPaid(uint8,bytes32,bytes,bytes[],address)'),
  execute: selecteur('execute(bytes,bytes[],uint256)'),
  multicall: selecteur('multicall(bytes[])'),
  modify: selecteur('modifyLiquidities(bytes,uint256)'),
  /* ⛔ AUDIT 2026-09-19 (bloquant) : le paiement de la mise en vie s affichait « Unknown call — Do not sign what you cannot
   *    read », juste avant que l ecran l annonce comme les ≈ $1. Il se lit : inscrire(PoolKey,uint160) — selecteur bb920fed,
   *    verifie sur la vraie transaction de mainnet. */
  inscrire: selecteur('inscrire((address,address,uint24,int24,address),uint160)'),
  transfererPart: selecteur('transfererPart(bytes32,address)'),
};

const court = (a) => a.slice(0, 6) + '…' + a.slice(-4);

/** Le nom d une adresse connue de l app, sinon l adresse courte. */
export function nomDe(adr, { chaine, compte = null, jeton = null, symbole = null } = {}) {
  const a = String(adr || '').toLowerCase();
  const V = V4_ADRESSES[Number(chaine)] || {};
  const connus = [
    [compte, 'you'], [jeton, symbole ? 'the block ' + symbole : 'this block'],
    /* ⛔ « TB CreateRouter » -> ce que le contrat FAIT. Ces libelles s affichent sur la ligne
     *    « Contract: … » sous chaque signature, a cote de « Permit2 (Uniswap) » — un nom que le
     *    lecteur peut aller verifier. « CreateRouter » n en est pas un : c est notre vocabulaire
     *    interne, et il arrive au pire moment, juste avant que la personne signe.
     *    ⚠️ CETTE TABLE EST UN SITE D AFFICHAGE QUE `test-texte-a-l-ecran` NE SAIT PAS LIRE : ce
     *       n est ni une affectation `.textContent`, ni un appel d affichage, mais un tableau de
     *       paires. La garde est donc AVEUGLE ici, et c est ecrit dans ses bornes plutot que
     *       corrige par une regle taillee pour une seule table — un motif trop etroit protege une
     *       phrase, pas une regle, et c est le defaut qu on vient de corriger ailleurs. */
    [FEE_WALLET, 'fee'], [CREATE_ROUTER, 'TokenizedBlock (creates your block)'], [USDC_BASE, 'USDC'], [FACTORY, 'B20 factory'],
    [PERMIT2, 'Permit2 (Uniswap)'], [V.posm, 'Uniswap v4 position manager'], [ROUTEUR_SWAP[Number(chaine)], 'Uniswap router'],
    [PROPRIETAIRE_PERMANENT, 'dead address (nobody)'],
  ];
  for (const [x, nom] of connus) if (x && String(x).toLowerCase() === a) return nom + ' ' + court(a);
  return court(a);
}

const mot = (data, i) => data.slice(10 + 64 * i, 10 + 64 * (i + 1));
const adresseDe = (m) => '0x' + m.slice(24);

/**
 * @param {{chaine:number, tx:{to:string,data:string,value?:string}, compte?:string, jeton?:string,
 *   symbole?:string, decimales?:number}} o
 * @returns {{etat:'LUE'|'INCONNUE', action:string, lignes:string[]}}
 */
export function apercuTransaction({ chaine, tx, compte = null, jeton = null, symbole = null, decimales = 18 }) {
  const ctx = { chaine, compte, jeton, symbole };
  const to = String((tx && tx.to) || '').toLowerCase();
  const data = String((tx && tx.data) || '0x').toLowerCase();
  const valeur = tx && tx.value ? BigInt(tx.value) : 0n;
  const lignes = ['Contract: ' + nomDe(to, ctx)];
  if (valeur > 0n) lignes.push('ETH sent with it: ' + formaterUnites(valeur, 18) + ' ETH');
  const sel = data.slice(2, 10);
  const V = V4_ADRESSES[Number(chaine)] || {};

  if (sel === S.transfer && data.length >= 138) {
    const dest = adresseDe(mot(data, 0));
    const montant = BigInt('0x' + mot(data, 1));
    const usdc = to === String(USDC_BASE).toLowerCase();
    const unite = usdc ? 'USDC' : (to === String(jeton || '').toLowerCase() && symbole ? symbole : 'units');
    lignes.push('Sends: ' + formaterUnites(montant, usdc ? USDC_DECIMALES : decimales) + ' ' + unite);
    lignes.push('To: ' + nomDe(dest, ctx));
    const memo = lireMemo(data);
    if (memo.etat === 'LU') lignes.push('Message, public forever: « ' + memo.texte + ' »');
    return { etat: 'LUE', action: dest === String(compte || '').toLowerCase() && montant === 0n
      ? 'Write a message on chain (0 to yourself)' : 'Transfer', lignes };
  }
  if (sel === S.approve && data.length >= 138) {
    const montant = BigInt('0x' + mot(data, 1));
    lignes.push('Lets ' + nomDe(adresseDe(mot(data, 0)), ctx) + ' move '
      + (montant === MAX_UINT256 ? 'ANY amount (unlimited, until you revoke it)' : formaterUnites(montant, decimales)));
    return { etat: 'LUE', action: 'Approval', lignes };
  }
  if (sel === S.permit2 && to === PERMIT2.toLowerCase() && data.length >= 266) {
    const montant = BigInt('0x' + mot(data, 2));
    lignes.push('Token: ' + nomDe(adresseDe(mot(data, 0)), ctx));
    lignes.push('Lets ' + nomDe(adresseDe(mot(data, 1)), ctx) + ' move '
      + (montant === MAX_UINT160 ? 'ANY amount (unlimited)' : formaterUnites(montant, decimales)) + ' through Permit2');
    return { etat: 'LUE', action: 'Permit2 approval', lignes };
  }
  if (sel === S.execute && ROUTEUR_SWAP[Number(chaine)] && to === ROUTEUR_SWAP[Number(chaine)].toLowerCase()) {
    /* ⛔ AUDIT 2026-09-20 : ces trois lignes disaient « 0,5 % » — faux sur une pool de notre hook, ou
     *    l interface ne prend rien — et nommaient le destinataire des frais, interdit a l ecran. Ce que
     *    l apercu doit dire reste vrai : les montants et le minimum accepte sont DANS la transaction. */
    lignes.push('Swaps through the Uniswap v4 router. The amounts and the minimum you accept are listed with this transaction.');
    return { etat: 'LUE', action: 'Swap', lignes };
  }
  if (sel === S.create && to === FACTORY.toLowerCase()) {
    lignes.push('Creates a new B20 block. You become its admin; the factory refuses a salt already used.');
    return { etat: 'LUE', action: 'Create a block', lignes };
  }
  if (sel === S.createPaid && to === String(CREATE_ROUTER).toLowerCase()) {
    /* ⛔⛔ DEUX CHOSES RETIREES DE CETTE LIGNE (2026-09-23), et elles etaient a l ECRAN, sous une
     *     signature que l utilisateur s apprete a donner :
     *     · « CreateRouter » — le nom d un de nos contrats. Le lecteur n a aucun moyen de savoir
     *       ce que c est : ca ne l informe pas, ca lui fait croire qu il lui manque un savoir.
     *     · « ≈ $1 » — un dollar ECRIT EN DUR. Le montant reel en ETH est deja affiche sur la
     *       ligne « ETH sent with it » juste au-dessus : cette approximation n ajoutait aucune
     *       information, elle ajoutait une AFFIRMATION que le code ne mesure pas ici.
     *     ⛔ CINQ FICHIERS DE TEST INTERDISAIENT DEJA `≈$1` — aucun ne lisait `apercu.js`. Le
     *       motif etait bon, c est la LISTE DES FICHIERS qui mentait. */
    lignes.push('Creates your block: 1B units, all to you, sealed. The life fee is charged only if the create succeeds.');
    return { etat: 'LUE', action: 'Create a block (life fee)', lignes };
  }
  /* Native ETH transfer (no calldata) — Launch life fee → FEE_WALLET. */
  if ((data === '0x' || data.length <= 2 || sel === '') && valeur > 0n) {
    const fee = to === String(FEE_WALLET).toLowerCase();
    lignes.push('Sends: ' + formaterUnites(valeur, 18) + ' ETH');
    lignes.push('To: ' + nomDe(to, ctx));
    return { etat: 'LUE',
      action: fee ? 'Life fee (ETH) — stay alive / Launch' : 'Send ETH',
      lignes };
  }
  if ((sel === S.multicall || sel === S.modify) && V.posm && to === V.posm.toLowerCase()) {
    const permanent = data.includes(String(PROPRIETAIRE_PERMANENT).slice(2).toLowerCase().padStart(64, '0'));
    lignes.push(sel === S.multicall ? 'Creates the pool, then places liquidity' : 'Places liquidity in an existing pool');
    lignes.push(permanent ? 'Position owner: dead address — nobody can ever withdraw or collect'
      : 'Position owner: NOT the dead address — this position can be withdrawn by its owner');
    return { etat: 'LUE', action: 'Launch a market', lignes };
  }
  if (sel === S.inscrire) {
    /* ⛔ « ≈ $1 » RETIRE : le montant exact en ETH figure deja sur la ligne « ETH sent with it »
     *    juste au-dessus. Ecrire un dollar en dur a cote d un montant variable, c est promettre un
     *    prix qu on ne mesure pas — et le jour ou l ETH double, l ecran dit toujours « $1 ». */
    lignes.push(valeur > 0n ? 'Pays the one-off fee that brings your block to life' : 'Confirms the starting price (already paid)');
    lignes.push('Records the starting price of its market, and you as its creator');
    return { etat: 'LUE', action: 'Bring it to life', lignes };
  }
  if (sel === S.transfererPart && data.length >= 138) {
    lignes.push('Gives your creator share of this market to ' + court(adresseDe(mot(data, 1))));
    lignes.push('From then on, that address receives it — nobody else can undo it');
    return { etat: 'LUE', action: 'Give away your creator share', lignes };
  }
  lignes.push('This call could not be read here. Do not sign what you cannot read.');
  return { etat: 'INCONNUE', action: 'Unknown call', lignes };
}
