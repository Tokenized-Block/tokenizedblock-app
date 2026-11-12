// fil-live.js — l historique EN DIRECT de l app : blocks crees et achats / ventes sur leurs marches.
// ================================================================================================
// ⛔ DEMANDE DE PHIL (2026-09-13) : « l historique en live direct de l app avec creation de block, swap, le
//    defilement dans l onglet Social ». Le fil existant ne montrait que des Transfer sur 2 000 blocs, sans
//    creation (event B20Created) ni swap (event Swap du PoolManager v4).
// ⛔ TOUT EST LU SUR LA CHAINE, RIEN N EST STOCKE PAR NOUS : creations = logs de la factory, swaps = logs Swap
//    du PoolManager filtres sur les pools ETH natif des blocks suivis (cles de `marche.js`). Mesure du
//    2026-09-13 : un OU de 468 identifiants de pool sur topic1 est accepte par le noeud public.
// ⛔ ACHAT / VENTE VIENNENT DE `achatDepuisSwap` (achats.js, teste), jamais recalcules ici — et seulement
//    quand les decimales du block sont CONNUES. Sinon l evenement reste « SWAP », sans quantite inventee.
// ⚠️ Le routeur n est pas l acheteur : ce module ne nomme personne.
import { listerCreations, TOPIC_TRANSFER, decoderTransfer, topicAdresse } from './index-blocks.js';
import { messageDepuisTransfert, DEVISES_MESSAGE } from './messagerie-blocks.js';
import { FEE_WALLET, CREATE_ROUTER } from './frais-creation.js';
import { listerAchats, achatDepuisSwap, sensDuSwap } from './achats.js';
import { formaterUnites } from './montants.js';
import { CLES_MARCHE, CLE_TBLOCK } from './marche.js';
import { cleDePool, poolId } from './pool.js';
import { TBLOCK_TEST_ANCIEN as TBLOCK } from './tokenomics.js'; /* game354: in this file TBLOCK = the OLD test token, only to read its LEGACY pools (never shown as "TBLOCK"); the real TBLOCK is tokenomics.TBLOCK */
import { confianceDe } from './pools-du-jeton.js';

const ETH_NATIF = '0x0000000000000000000000000000000000000000';
/* ⛔ GM = greeting fragment, not a dump. >1M of a sealed 1B supply is a move, not a GM (Clansy 2026-09-14). */
const GM_MAX_UNITES = 1_000_000n * 10n ** 18n;
/* ⛔ PHIL (2026-09-14) : « t as oublie les swaps, send, GM — n oublie rien ». GM = envoi d un block entre deux wallets
 *    (ni creation, ni jambe de swap) ; NOTE = transfert de 0 portant un message ; MESSAGE = message PAYE entre blocks. */
export const TYPES_LIVE = ['CREATION', 'ACHAT', 'VENTE', 'SWAP', 'GM', 'NOTE', 'MESSAGE'];

/** True if create went through CreateRouter (paid ETH fee path).
 * ⛔ Raksha 2026-09-14: do NOT key on 50M mint — fee is ETH only; supply is 100% creator. */
async function creationPayee({ rpc, tx }) {
  if (!tx || !rpc) return false;
  try {
    const raw = await rpc('eth_getTransactionByHash', [tx]);
    if (raw && String(raw.to || '').toLowerCase() === String(CREATE_ROUTER).toLowerCase()) return true;
  } catch (_) { /* unread ≠ unpaid */ }
  return false;
}


export const JETONS_PAR_REQUETE = 50;
const ZERO = '0x0000000000000000000000000000000000000000';

/** getLogs qui coupe en deux une fenetre refusee comme trop grosse, jusqu a 250 blocs ; les echecs sont rendus. */
async function logsAdaptatifs(rpc, filtre, de, a, ratees, quoi) {
  try {
    return await rpc('eth_getLogs', [{ ...filtre, fromBlock: '0x' + de.toString(16), toBlock: '0x' + a.toString(16) }]);
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (/too large|-32020|limit exceeded|too many/i.test(msg) && a - de + 1 > 250) {
      const m = de + Math.floor((a - de) / 2);
      const x = await logsAdaptatifs(rpc, filtre, de, m, ratees, quoi);
      const y = await logsAdaptatifs(rpc, filtre, m + 1, a, ratees, quoi);
      return [...(x || []), ...(y || [])];
    }
    /* 2026-10-11 : la fenetre refusee porte ses ADRESSES - une relecture plus tard redemande EXACTEMENT ce lot (relireTransferts) */
    ratees.push({ de, a, cause: msg, quoi, adresses: Array.isArray(filtre.address) ? filtre.address.slice() : filtre.address });
    return null;
  }
}
/** Identifiants de pool par requete : sous la mesure de 468, avec de la marge. */
export const IDS_PAR_REQUETE = 400;

/** Les pools a suivre pour une liste de blocks : { poolId -> { cle, jeton, sym, dec } }. */
export function poolsSuivies(blocks) {
  const out = new Map();
  for (const b of blocks || []) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(String(b && b.jeton))) continue;
    for (const k of CLES_MARCHE) {
      const cle = cleDePool(ETH_NATIF, b.jeton, { fee: k.fee, tickSpacing: k.tickSpacing });
      out.set(poolId(cle), { cle, jeton: String(b.jeton).toLowerCase(), sym: b.sym ?? null,
        dec: Number.isInteger(b.dec) ? b.dec : null, confiance: confianceDe(cle) });
    }
    /* ⛔ la paire TBLOCK/block du lancement de l app est suivie elle aussi (elle ne l etait pas, mesure 2026-09-14) */
    if (String(b.jeton).toLowerCase() !== TBLOCK.toLowerCase()) {
      const cle = cleDePool(TBLOCK, b.jeton, CLE_TBLOCK);
      out.set(poolId(cle), { cle, jeton: String(b.jeton).toLowerCase(), sym: b.sym ?? null,
        dec: Number.isInteger(b.dec) ? b.dec : null, confiance: confianceDe(cle) });
    }
  }
  return out;
}

/* ⛔⛔ 2026-10-09 (capture du fondateur : « All 0 · Created 0 · Feed 0 · Kill 0 · Sent 0 · Big 0 ») — CHAQUE
 *    `eth_getLogs` vers mainnet.base.org rendait 429 « request limit reached » (-32011), meme sur 1 bloc ;
 *    or ce noeud est le SEUL a qui partent la factory (creations) et les transferts a > 9 adresses.
 *    Mesure sur la meme fenetre de 110 blocs (52 379 831–52 379 940) : 1 B20Created emis par la factory
 *    (tx 0x3af0dd1b…, status 0x1). La chaine n etait PAS calme : la lecture etait refusee, et les puces
 *    disaient « 0 ». Un compte dont la lecture a ete refusee n est pas un zero : il est « non lu ».
 * Quelles lectures nourrissent chaque puce (prefixe du `quoi` des fenetres ratees). Absente = toutes. */
/* ⛔⛔ 2026-10-09 (revue adverse du correctif) : les echanges et les transferts sont lus pour les blocks SUIVIS, et l ensemble suivi
 *   (`blocksSuivisLive`) vient des CREATIONS lues. Une lecture de creations refusee = un block ne dans la fenetre n est jamais suivi,
 *   ses achats et ses envois ne sont jamais lus : Feed, Kill, Big et Sent disaient « 0 » MESURE sur ce trou. Ces puces dependent
 *   donc AUSSI de 'creations'. Seul MESSAGE (lu au wallet des frais, pas par block) n en depend pas. */
export const LECTURES_PAR_FILTRE = {
  CREATION: ['creations'], CREATION_TB: ['creations'], CREATION_FOREIGN: ['creations'],
  ACHAT: ['swaps', 'decouverte', 'creations'], VENTE: ['swaps', 'decouverte', 'creations'], SWAP: ['swaps', 'decouverte', 'creations'],
  ECHANGES: ['swaps', 'decouverte', 'creations'], GROS: ['swaps', 'decouverte', 'creations'], HOOKED: ['swaps', 'decouverte', 'creations'],
  GM: ['transfers', 'creations'], NOTE: ['transfers', 'creations'], MESSAGE: ['messages'],
  /* game378: hearts come from the server hearts index (/api/coeurs), not from the page chain reads: only its own miss makes « ? » */
  COEUR: ['coeurs'],
};
const LECTURES_CONNUES = [...new Set(Object.values(LECTURES_PAR_FILTRE).flat())];

/** Le compte d une puce, en TROIS etats : lu (« 3 »), non lu (« ? »), lu en partie (« ≥3 »).
 *  `rateesParQuoi` : Map ou objet { quoi -> lectures refusees }. Un `quoi` qui ne commence par aucune
 *  lecture connue (« tout », une exception de la boucle) touche TOUTES les puces. */
export function compteDePuce(n, filtre, rateesParQuoi) {
  const entrees = rateesParQuoi instanceof Map ? [...rateesParQuoi.entries()] : Object.entries(rateesParQuoi || {});
  const cles = LECTURES_PAR_FILTRE[filtre] || null;
  const touche = entrees.some(([quoi, k]) => {
    if (!(k > 0)) return false;
    const q = String(quoi);
    if (cles === null || !LECTURES_CONNUES.some((c) => q.startsWith(c))) return true;
    return cles.some((c) => q.startsWith(c));
  });
  if (!touche) return { texte: String(n), etat: 'LU' };
  return n > 0 ? { texte: '≥' + n, etat: 'PARTIEL' } : { texte: '?', etat: 'NON_LU' };
}

/** La tete de la note du fil : « Nothing happened » SEULEMENT si rien n a ete refuse. */
export function teteNoteLive(nEvenements, ratees) {
  if (nEvenements > 0) return nEvenements + ' event(s)';
  return ratees > 0 ? 'Nothing could be read' : 'Nothing happened';
}

/** Unites brutes -> texte decimal exact (sans flottant). */
function formaterBrut(v, dec) {
  const base = 10n ** BigInt(dec);
  const ent = v / base, frac = (v % base).toString().padStart(dec, '0').replace(/0+$/, '');
  return ent.toString() + (frac ? '.' + frac : '');
}

/** ⛔ 2026-10-02 — un evenement lu AVANT que les decimales de son jeton soient connues garde sa valeur BRUTE (`brut`).
 *  Des que les decimales sont lues, on le complete, avec le MEME formateur qu au premier passage. Sans ca, ce qui
 *  avait ete lu trop tot restait « amount not read » pour toujours. Rend vrai si l evenement a change. */
export function completerQuantite(e, dec) {
  if (!e || e.quantite || !e.brut || !Number.isInteger(dec)) return false;
  let v;
  try { v = BigInt(e.brut.v); } catch (_) { return false; }
  e.quantite = e.brut.forme === 'unites' ? formaterUnites(v, dec) : formaterBrut(v, dec);
  e.brut = null;
  return true;
}

/** Le nom de la devise d une pool, SEULEMENT si elle est prouvee : ETH natif (0x0) ou TBLOCK. Sinon null. */
function deviseConnue(cle, jeton) {
  const autre = String(cle.currency0).toLowerCase() === String(jeton).toLowerCase() ? cle.currency1 : cle.currency0;
  const a = String(autre).toLowerCase();
  if (a === ETH_NATIF) return { nom: 'ETH', dec: 18 };
  if (a === TBLOCK.toLowerCase()) return { nom: 'old test TBLOCK', dec: 18 }; /* game354: TBLOCK here = the OLD test token (legacy pools) */
  return null;
}

/**
 * Les evenements entre `deBloc` et `aBloc` inclus, du plus recent au plus ancien.
 * @returns {Promise<{evenements:object[], fenetresRatees:object[]}>}
 * ⛔ Une fenetre ratee est rendue, jamais comptee comme silence.
 */
export async function evenementsLive({ rpc, poolManager, blocks, deBloc, aBloc, pause = 0,
  lireCreations = listerCreations, poolsDecouvertes = null, lireTransferts = true }) {
  const evenements = [], fenetresRatees = [];
  const vus = new Set();
  const ajouter = (e) => {
    const k = e.type + ':' + e.tx + ':' + e.jeton + ':' + (e.logIndex ?? '');
    if (vus.has(k)) return;
    vus.add(k);
    evenements.push(e);
  };

  const cr = await lireCreations({ rpc, blocs: Math.max(0, aBloc - deBloc), fin: aBloc });
  for (const f of cr.fenetresRatees || []) fenetresRatees.push({ ...f, quoi: 'creations' });
  for (const c of cr.creations || []) {
    if (!Number.isFinite(c.bloc) || c.bloc < deBloc || c.bloc > aBloc) continue;
    const jeton = String(c.jeton).toLowerCase();
    const tx = c.tx ?? null;
    /* ⛔ Paid = CreateRouter tx.to (ETH fee). External / factory-raw = unpaid. */
    let paidCreate = false;
    if (tx) {
      paidCreate = await creationPayee({ rpc, tx });
      if (pause) await new Promise((r) => setTimeout(r, pause));
    }
    ajouter({ type: 'CREATION', bloc: c.bloc, jeton, sym: c.symbole ?? null, tx,
      dec: Number.isInteger(c.decimales) ? c.decimales : null, paidCreate });
  }

  const pools = poolsSuivies(blocks);
  /* ⛔ les pools DECOUVERTES (Initialize) des blocks suivis s ajoutent aux cles devinees — jamais celles d un autre jeton */
  if (poolsDecouvertes && typeof poolsDecouvertes.forEach === 'function') {
    const decs = new Map((blocks || []).map((b) => [String(b.jeton).toLowerCase(), b]));
    poolsDecouvertes.forEach((p, id) => {
      const b = decs.get(String(p.jeton).toLowerCase());
      if (!b || pools.has(id)) return;
      pools.set(id, { cle: p.cle, jeton: String(p.jeton).toLowerCase(), sym: b.sym ?? null,
        dec: Number.isInteger(b.dec) ? b.dec : null, confiance: p.confiance || confianceDe(p.cle) });
    });
  }
  const ids = [...pools.keys()];
  /* ⛔⛔ MESURE (2026-09-14, 3 « GM » BLST) : chaque transaction contenait un Swap, et le block passait PoolManager ->
   *    routeur tiers (contrat) -> wallet. Un transfert d une transaction qui porte un Swap est une JAMBE D ECHANGE, pas un GM. */
  const txSwaps = new Set();
  for (let i = 0; i < ids.length; i += IDS_PAR_REQUETE) {
    const r = await listerAchats({ rpc, poolManager, poolIds: ids.slice(i, i + IDS_PAR_REQUETE), deBloc, aBloc, pause });
    for (const f of r.fenetresRatees || []) fenetresRatees.push({ ...f, quoi: 'swaps' });
    for (const s of r.swaps || []) {
      if (s.txHash) txSwaps.add(String(s.txHash).toLowerCase());
      const p = pools.get(s.poolId);
      if (!p) continue;
      let type = 'SWAP', quantite = null, eth = null, fraisMarche = false, brut = null;
      const confiance = p.confiance || confianceDe(p.cle);
      const devise = deviseConnue(p.cle, p.jeton);
      /* ⛔⛔ CORRIGE LE 2026-09-20 (Phil : « Feed = buy, Kill = sell, divise le Swap en 2 »).
       * L ANCIENNE REGLE exigeait `confiance !== 'HOOK'` avant de classer quoi que ce soit. Mesure du
       * jour sur la page en prod : 118 pools sur 118 portent un hook — donc AUCUN swap n etait jamais
       * classe. « Feed » et « Kill » affichaient 0 pendant que « Swap » affichait 1 306, et le fil
       * disait « traded » pour tout, alors que la chaine dit QUI A ACHETE.
       * Ce que la source d Uniswap v4 prouve (PoolManager.sol:240, « event is emitted before the
       * afterSwap call ») : l evenement porte le delta du trader AVANT la part du hook. Un hook REDUIT
       * un montant recu, il ne lui change pas son SIGNE. Le sens est donc prouve, hook ou pas.
       * ⚠️ CE QUI RESTE VRAI DE L ANCIENNE PRUDENCE, et qui voyage maintenant avec l evenement :
       *    sur une pool a hook, le montant du cote non specifie est celui d AVANT le frais du marche.
       *    D ou `fraisMarche` — l ecran doit ecrire « avant le frais de ce marche », pas un chiffre net. */
      const sens = sensDuSwap({ swap: s, cle: p.cle, jeton: p.jeton });
      if (sens.etat === 'ACHAT' || sens.etat === 'VENTE') {
        type = sens.etat;
        fraisMarche = confiance === 'HOOK';
        if (p.dec !== null) quantite = formaterUnites(sens.quantiteBlock, p.dec);
        else brut = { v: String(sens.quantiteBlock), forme: 'unites' };
        if (devise) eth = formaterUnites(sens.quantiteDevise, devise.dec);
      }
      ajouter({ type, bloc: s.blockNumber, jeton: p.jeton, sym: p.sym, tx: s.txHash, logIndex: s.logIndex, quantite, brut, eth,
        devise: type === 'SWAP' || !devise ? null : devise.nom, confiance, fraisMarche, verifie: type !== 'SWAP' });
    }
  }
  if (lireTransferts && Number.isSafeInteger(deBloc) && Number.isSafeInteger(aBloc) && aBloc >= deBloc) {
    /* ── GM et notes : les transferts des blocks suivis (transfertsLive, la MEME fonction que la relecture des fenetres refusees) ── */
    const tr = await transfertsLive({ rpc, poolManager, blocks, deBloc, aBloc, txSwaps, pause });
    for (const f of tr.fenetresRatees) fenetresRatees.push(f);
    for (const e of tr.evenements) ajouter(e);
    /* ── messages PAYES entre blocks : la devise -> wallet de frais, au moins son frais, relus un par un ──
     * ⛔⛔ CORRIGE LE 2026-09-20. Cette boucle ne lisait QUE le TBLOCK, et appelait
     *    `messageDepuisTransfert(t, tx)` sans devise — donc avec son defaut, TBLOCK. Or l ecran d envoi
     *    ne propose plus que l USDC : TOUT message envoye depuis l app etait invisible ici, et le filtre
     *    « Messages » ne pouvait afficher que 0. `lireConversations` (messagerie-blocks.js), lui, lisait
     *    deja les deux devises : deux jumeaux qui avaient diverge, et c est la copie affichee qui perdait.
     * ⛔ LA LISTE DES DEVISES VIENT DE `DEVISES_MESSAGE`, jamais recopiee : en ajouter une la fait
     *    apparaitre ici sans toucher a ce fichier. */
    for (const [nomDevise, dev] of Object.entries(DEVISES_MESSAGE)) {
      for (let de = deBloc; de <= aBloc; de += 2000) {
        const a = Math.min(aBloc, de + 1999);
        const logs = await logsAdaptatifs(rpc, { address: String(dev.token).toLowerCase(), topics: [TOPIC_TRANSFER, null, topicAdresse(FEE_WALLET)] }, de, a, fenetresRatees, 'messages ' + nomDevise);
        for (const l of logs || []) {
          const t = decoderTransfer(l);
          /* le plancher de LECTURE (`fraisLu`), pas le prix d envoi : un message paye a l ancien prix reste dans le fil */
          if (!t || typeof t.value !== 'bigint' || t.value < dev.fraisLu) continue;
          let tx = null;
          try { tx = await rpc('eth_getTransactionByHash', [t.tx]); } catch (e) { tx = null; }
          const m = messageDepuisTransfert(t, tx, nomDevise);
          if (m.etat !== 'MESSAGE' && m.etat !== 'MESSAGE_FEE') continue;
          ajouter({ type: 'MESSAGE', bloc: t.bloc, jeton: m.a || m.de || null, sym: null, tx: t.tx, logIndex: t.logIndex,
            de: m.de, a: m.a, texte: m.texte, signataire: m.signataire, devise: nomDevise,
            aaOpaque: m.aaOpaque || m.etat === 'MESSAGE_FEE' });
        }
      }
    }
  }
  evenements.sort((a, b) => (b.bloc ?? 0) - (a.bloc ?? 0) || (b.logIndex ?? 0) - (a.logIndex ?? 0));
  return { evenements, fenetresRatees };
}

/** Les envois (GM) et notes (transfert de 0) des blocks suivis entre deBloc et aBloc : hors creation (from 0x0), hors jambes de swap
 *  (PoolManager, ou une transaction qui porte un Swap : `txSwaps`), hors gros mouvements (> GM_MAX_UNITES).
 *  `jetons` (optionnel) : ne relire QUE ce lot d adresses - celui d une fenetre refusee.
 *  ⛔ 2026-10-11 (Phil, capture : « Sent ? » et « None of the 2206 events read matches this filter ») : mesure en prod, base.drpc.org
 *    rendait 2 lectures d envois puis 429 (« Public endpoint rate limit ») ; une fenetre refusee n etait JAMAIS relue - ses envois etaient
 *    perdus et la puce restait « ? ». Cette fonction est celle du cycle normal ET de la relecture : un seul classement, pas de jumeau. */
export async function transfertsLive({ rpc, poolManager, blocks, deBloc, aBloc, txSwaps = new Set(), pause = 0, jetons = null }) {
  const evenements = [], fenetresRatees = [];
  const pm = String(poolManager || '').toLowerCase();
  const parJeton = new Map((blocks || []).filter((b) => /^0x[0-9a-fA-F]{40}$/.test(String(b.jeton)))
    .map((b) => [String(b.jeton).toLowerCase(), b]));
  const liste = Array.isArray(jetons) ? jetons.map((j) => String(j).toLowerCase()).filter((j) => parJeton.has(j)) : [...parJeton.keys()];
  for (let i = 0; i < liste.length; i += JETONS_PAR_REQUETE) {
    for (let de = deBloc; de <= aBloc; de += 2000) {
      const a = Math.min(aBloc, de + 1999);
      if (pause > 0) await new Promise((ok) => setTimeout(ok, pause));
      const logs = await logsAdaptatifs(rpc, { address: liste.slice(i, i + JETONS_PAR_REQUETE), topics: [TOPIC_TRANSFER] }, de, a, fenetresRatees, 'transfers');
      for (const l of logs || []) {
        const t = decoderTransfer(l);
        if (!t || t.value === null) continue;
        const b = parJeton.get(String(t.token));
        if (!b || t.from === ZERO || t.from === pm || t.to === pm) continue;
        if (t.tx && txSwaps.has(String(t.tx).toLowerCase())) continue;
        const dec = Number.isInteger(b.dec) ? b.dec : null;
        if (t.value > 0n && t.value > GM_MAX_UNITES) continue; /* dump/move ≠ GM */
        evenements.push({ type: t.value === 0n ? 'NOTE' : 'GM', bloc: t.bloc, jeton: t.token, sym: b.sym ?? null, tx: t.tx, logIndex: t.logIndex,
          de: t.from, a: t.to, quantite: dec !== null && t.value > 0n ? formaterBrut(t.value, dec) : null,
          brut: dec === null && t.value > 0n ? { v: String(t.value), forme: 'brut' } : null });
      }
    }
  }
  return { evenements, fenetresRatees };
}
