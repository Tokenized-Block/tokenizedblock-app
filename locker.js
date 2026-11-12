// locker.js — ouvrir le marche d un block EN GARDANT sa liquidite, et en partageant ses frais.
// ================================================================================================
// ⛔⛔ POURQUOI CE MODULE EXISTE (Phil, 2026-09-18 : « pour les prochains qui creent, le block de la
//    pool »). Nos mises en vie actuelles ouvrent la pool avec un LP fee de ZERO et envoient la
//    position a l adresse morte : personne ne peut jamais rien collecter — ni l acheteur, ni le
//    createur, ni nous. Un trade fait AILLEURS sur ce marche ne rapporte donc rien du tout.
//    Le locker change exactement ca : la pool s ouvre avec un LP fee de 0,5 %, la position est
//    detenue POUR TOUJOURS par le contrat (personne ne peut la retirer, nous non plus), et ses frais
//    se partagent 50 / 50 entre le createur du block et le wallet de frais.
//
// ⛔ CE QUE CA CAPTE, ET CE QUE CA NE CAPTE PAS. Les frais de POOL se paient a chaque swap, d ou
//    qu il vienne — notre app, leur site, un agrege, un bot. C est la SEULE facon de toucher un
//    trade fait hors de chez nous, et elle ne vaut que pour les blocks nes ICI. Les 0,5 % d interface
//    de `echange.js`, eux, ne concernent que les trades faits DANS l app. Les deux ne s additionnent
//    pas sur un meme trade externe : hors app, seuls les frais de pool existent.
//
// ⛔ AUCUNE ADRESSE TANT QUE LE CONTRAT N EST PAS DEPLOYE. `LOCKER_ADRESSE` vaut `null` : chaque
//    fonction REFUSE explicitement, et l ecran dit « pas encore deploye ». Mettre une adresse au
//    hasard, ou celle d un autre reseau, ferait signer une transaction vers le vide.
// ⚠️ L AGENT NE DEPLOIE RIEN ET NE SIGNE RIEN. Le contrat vit dans `tblock-hook`
//    (src/TBlockLocker.sol, 12 tests sur fork Base) et c est Phil qui le deploie avec sa cle.
import { selecteur } from './encodeur.js';

/** ⛔ Mis a `null` EXPRES : l adresse arrive quand Phil a deploye, et pas avant. */
export const LOCKER_ADRESSE = null;

/** Les constantes du contrat, recopiees de src/TBlockLocker.sol — un test les compare a la chaine. */
export const LOCKER_LP_FEE = 5000;        // 0,5 % de frais de pool
export const LOCKER_TICK_SPACING = 200;   // le tick doit etre un multiple de 200
export const LOCKER_MIN_SHARE_BPS = 9000; // le contrat refuse s il recoit moins de 90 % de la supply
export const LOCKER_FEE_WALLET_BPS = 5000; // moitie createur, moitie wallet de frais

const ADR = /^0x[0-9a-fA-F]{40}$/;
const mot = (v) => BigInt(v).toString(16).padStart(64, '0');
const motAdresse = (a) => String(a).replace(/^0x/, '').toLowerCase().padStart(64, '0');
/** int24 signe, en complement a deux sur 32 octets (un tick negatif est la norme, pas l exception). */
const motInt = (v) => {
  const n = BigInt(v);
  return (n < 0n ? (1n << 256n) + n : n).toString(16).padStart(64, '0');
};

/** `approve(locker, montant)` — le block autorise le locker a prendre sa supply. */
export function encodeApproveLocker(locker, montant) {
  return '0x' + selecteur('approve(address,uint256)') + motAdresse(locker) + mot(montant);
}

/** `bringToLife(token, quote, amount, startTick, lpFee)`. */
export function encodeBringToLife({ token, quote, montant, startTick, lpFee = LOCKER_LP_FEE }) {
  return '0x' + selecteur('bringToLife(address,address,uint256,int24,uint24)')
    + motAdresse(token) + motAdresse(quote) + mot(montant) + motInt(startTick) + mot(lpFee);
}

/** `collect(tokenId)` — appelable par N IMPORTE QUI : personne ne depend de nous pour crediter. */
export function encodeCollect(tokenId) {
  return '0x' + selecteur('collect(uint256)') + mot(tokenId);
}

/** `claim(currency)` — chacun retire son credit lui-meme (ETH natif = adresse zero). */
export function encodeClaim(currency) {
  return '0x' + selecteur('claim(address)') + motAdresse(currency);
}

/**
 * Le plan complet de la mise en vie par le locker : DEUX appels, dans cet ordre.
 *
 * ⛔ LES MEMES REFUS QUE LE CONTRAT, AVANT LA SIGNATURE. Le contrat rejette un lpFee different de
 *    5000, un tick qui n est pas un multiple de 200, et une supply recue sous 90 %. Les repeter ici
 *    ne remplace pas ses gardes — ca evite de faire payer du gas pour apprendre un refus.
 * ⛔ ET LA QUOTE N EST PAS LE TOKEN : une pool d un jeton contre lui-meme n existe pas.
 *
 * @returns {{etat:'PRET'|'REFUSE', pourquoi:string|null, appels?:{quoi:string,to:string,data:string,value:string}[]}}
 */
export function planBringToLife({ token, quote, montant, startTick, locker = LOCKER_ADRESSE, lpFee = LOCKER_LP_FEE }) {
  if (!locker || !ADR.test(String(locker))) {
    return { etat: 'REFUSE', pourquoi: 'the locker is coming soon — nothing to sign' };
  }
  if (!ADR.test(String(token || ''))) return { etat: 'REFUSE', pourquoi: 'the block address is not whole' };
  if (!ADR.test(String(quote || ''))) return { etat: 'REFUSE', pourquoi: 'the pair address is not whole' };
  if (String(token).toLowerCase() === String(quote).toLowerCase()) {
    return { etat: 'REFUSE', pourquoi: 'a block cannot be paired with itself' };
  }
  let m;
  try { m = BigInt(montant); } catch (_) { m = 0n; }
  if (m <= 0n) return { etat: 'REFUSE', pourquoi: 'the amount of the block to lock must be above zero' };
  if (Number(lpFee) !== LOCKER_LP_FEE) {
    return { etat: 'REFUSE', pourquoi: 'this locker opens pools at 0.5% only' };
  }
  const t = Number(startTick);
  if (!Number.isInteger(t) || t % LOCKER_TICK_SPACING !== 0) {
    return { etat: 'REFUSE', pourquoi: 'the starting tick must be a multiple of ' + LOCKER_TICK_SPACING };
  }
  return {
    etat: 'PRET',
    pourquoi: null,
    appels: [
      { quoi: 'Let the locker take your block', to: String(token), data: encodeApproveLocker(locker, m), value: '0x0' },
      { quoi: 'Open its market, liquidity locked with it', to: String(locker),
        data: encodeBringToLife({ token, quote, montant: m, startTick: t, lpFee }), value: '0x0' },
    ],
  };
}

/** Ce que l ecran peut dire sans rien promettre de plus que ce que le contrat fait. */
export function phrasesLocker() {
  return [
    'Its market opens at 0.5% — that fee is paid on every trade, wherever it happens.',
    'Half of it is credited to you, the creator; the liquidity stays locked with the block forever.',
    'Anyone can trigger the collection; you withdraw your own credit yourself.',
  ];
}
