// index-blocks.js — la liste des blocks qui existent. Sans elle, un block cree est INVISIBLE.
// ================================================================================================
// ⛔ CE MODULE COMBLE LE MANQUE LE MOINS CHER ET LE PLUS BLOQUANT : le lecteur exige de DEJA
//    connaitre une adresse. Un block cree par quelqu un d autre n existe pour personne.
//
// ⛔ TROIS CONTRAINTES MESUREES, pas supposees :
//    1. `eth_getLogs` est borne a 10 000 blocs sur Base. La plage complete est REFUSEE. On pagine,
//       et on DIT jusqu ou on a regarde — « rien trouve » et « pas regarde » sont deux reponses
//       differentes.
//    2. L evenement `B20Created(address indexed token, B20Variant indexed variant, string name,
//       string symbol, uint8 decimals, bytes variantEventParams)` porte le token en `topics[1]`.
//       ⚠️ Mon premier recensement lisait `topics[1]` SANS filtrer sur `topic0` : il ramassait
//       d autres evenements de la factory et rendait des adresses qui n etaient pas des tokens.
//       Le filtre par topic0 n est pas une optimisation, c est la correction.
//    3. **L EVENEMENT NE PORTE PAS LE CREATEUR.** Il faut le lire dans `tx.from`. Un log dit ce
//       qui a ete emis ; seule la transaction dit QUI A PAYE. C est la meme regle que pour les
//       `Transfer` forges : un evenement n est pas une transaction.
import { selecteur } from './pool.js';
import { keccak256 } from './keccak.js';

export const FACTORY = '0xb20f000000000000000000000000000000000000';
/** ⛔ Fenetre maximale acceptee par le RPC de Base. Mesuree, pas choisie. */
/* ⛔⛔ 2000, ET C EST LE NOEUD QUI LE DIT — PAS MOI. Cette constante valait 9500, mesuree a une
 * epoque ou Base l acceptait. Mesure du 2026-09-10 depuis un navigateur, sur mainnet, avec le
 * filtre d adresse que cette fonction emploie vraiment :
 *     fenetre 9000 -> HTTP 413  « eth_getLogs is limited to a 2,000 range »
 *     fenetre 4000 -> HTTP 413  idem
 *     fenetre 2000 -> HTTP 200, 95 logs
 * La limite s est RESSERREE depuis. Un chiffre mesure qui a cesse d etre vrai est le defaut le plus
 * discret de ce depot : il ne se signale jamais, il fait juste echouer tout ce qui s appuie dessus.
 *
 * ⛔ ET C EST CE QUI CASSAIT TOUT SUR MAINNET DEPUIS DES HEURES. La galerie, la map et la lecture
 *    des creations rendaient « aucun block » sur mainnet — jamais sur Sepolia, dont la limite est
 *    plus large. Les instruments, eux, marchaient : ils basculent sur un noeud de SECOURS quand le
 *    premier refuse. Le navigateur n en a pas, donc lui seul voyait la panne, et personne ne
 *    regardait mainnet depuis un navigateur.
 *
 * ⚠️ CE QUE CA COUTE, dit franchement : 2 000 blocs valent environ 66 minutes de chaine a 2 s le
 *    bloc. Une lecture de 9 000 blocs se fait donc maintenant en CINQ requetes au lieu d une. La
 *    boucle ci-dessous pagine deja — rien d autre ne change. */
export const FENETRE_MAX = 999 /* tip 20260923-map-alive: Base public getLogs ≤1000 inclusive span */;

const enc = new TextEncoder();
const hexDe = (o) => [...o].map((b) => b.toString(16).padStart(2, '0')).join('');
export const TOPIC_CREATED = '0x' + hexDe(keccak256(enc.encode(
  'B20Created(address,uint8,string,string,uint8,bytes)')));

/**
 * Decode une `string` ABI a un offset donne dans un blob hex sans `0x`.
 *
 * ⛔ LA LONGUEUR EST BORNEE PAR LES DONNEES DISPONIBLES, ET CE N EST PAS DU ZELE.
 *    Un log mal forme (ou hostile) porte un offset absurde ; la longueur lue vaut alors ~2^256, et
 *    la boucle qui construit la chaine ne LEVE PAS — elle BOUCLE, et fait tomber le moteur sur un
 *    depassement memoire. Un `try/catch` ne rattrape rien : il n y a pas d exception, il y a un
 *    gel. Trouve par `test-index.mjs`, qui a fait planter V8 au lieu d echouer proprement.
 *    ⇒ on refuse AVANT de boucler, en comparant a ce qui existe reellement.
 */
/* ⛔ EXPORTE, PARCE QU UNE SECONDE COPIE SE TROMPERAIT PAREIL. Ce decodeur porte le correctif du
 * mojibake : deux lecteurs latin-1 rendaient les noms des autres en charabia, et il a fallu
 * corriger la FIXTURE du test avant de pouvoir prouver quoi que ce soit. Tout ecran qui lit un nom
 * de block passe par ici. */
export function chaineA(donnees, offsetOctets) {
  const d = offsetOctets * 2;
  if (!Number.isFinite(d) || d < 0 || d + 64 > donnees.length) {
    throw new Error('offset de chaine hors des donnees (' + offsetOctets + ')');
  }
  const len = parseInt(donnees.slice(d, d + 64), 16);
  const dispo = (donnees.length - (d + 64)) / 2;
  if (!Number.isFinite(len) || len < 0 || len > dispo) {
    throw new Error('longueur de chaine annoncee (' + len + ') > octets disponibles (' + dispo + ')');
  }
  /* ⛔⛔ C ETAIT DU LATIN-1, ET CA RENDAIT LE NOM DES AUTRES EN CHARABIA. `String.fromCharCode`
   * par octet fait « un octet = un caractere » ; un `string` Solidity est de l UTF-8, ou un
   * caractere chinois pese TROIS octets. Des blocks reels de Base mainnet s affichaient
   * « å°çç¶­å°¼ » et « â°«âĐ¤āĐ« » dans la galerie — leurs octets, pas leurs noms.
   * ⚠️ EN ASCII PUR LES DEUX CHEMINS SONT IDENTIQUES : c est pourquoi ca a survecu. Tous nos
   * essais etaient en ASCII ; le defaut n existait que sur les blocks DES AUTRES.
   * ⚠️ Le MEME defaut vivait dans `chaineDe` d index.html — deux decodeurs, une seule erreur,
   * corriges ensemble. La regle 12 de `verifie-coherence.mjs` interdit qu un troisieme apparaisse.
   * ⚠️ Decodage NON STRICT : des octets invalides deviennent U+FFFD au lieu de lever. Un nom grave
   * par un inconnu peut etre n importe quoi, et planter sur lui masquerait toute la galerie. */
  const octets = new Uint8Array(len);
  for (let i = 0; i < len; i++) octets[i] = parseInt(donnees.slice(d + 64 + i * 2, d + 66 + i * 2), 16);
  return new TextDecoder('utf-8').decode(octets);
}

/**
 * Decode un log `B20Created`. Rend `null` si le log n est pas celui-la — un decodage force
 * produirait des noms de fantaisie a partir d octets qui ne sont pas des chaines.
 */
export function decoderCreation(log) {
  if (!log || !log.topics || log.topics[0] !== TOPIC_CREATED) return null;
  const jeton = '0x' + log.topics[1].slice(26);
  const variante = Number(BigInt(log.topics[2]));
  const d = log.data.replace(/^0x/, '');
  try {
    const offNom = Number(BigInt('0x' + d.slice(0, 64)));
    const offSym = Number(BigInt('0x' + d.slice(64, 128)));
    const decimales = Number(BigInt('0x' + d.slice(128, 192)));
    return { jeton, variante, nom: chaineA(d, offNom), symbole: chaineA(d, offSym), decimales,
      bloc: log.blockNumber ? parseInt(log.blockNumber, 16) : null, tx: log.transactionHash };
  } catch (e) {
    /* ⛔ Un log mal forme se DIT, il ne se devine pas. */
    return { jeton, variante, nom: null, symbole: null, decimales: null, erreur: e.message,
      bloc: log.blockNumber ? parseInt(log.blockNumber, 16) : null, tx: log.transactionHash };
  }
}

/**
 * Parcourt les `n` derniers blocs par fenetres, et rend les creations trouvees.
 * ⛔ Rend AUSSI la fenetre reellement parcourue et les fenetres qui ont ECHOUE. Une liste sans sa
 *    borne se lit comme exhaustive, ce qu elle n est jamais.
 */
export async function listerCreations({ rpc, blocs = 90000, fin = null, surProgres = null }) {
  const dernier = fin ?? parseInt(await rpc('eth_blockNumber', []), 16);
  const debut = Math.max(0, dernier - blocs);
  const trouvees = [];
  const fenetresRatees = [];
  /* ⛔⛔ FENETRES ALIGNEES — LE MEME CORRECTIF QU A LA LIGNE ~268, QUI N AVAIT ETE APPLIQUE QU A
   *     UNE BOUCLE SUR TROIS (2026-09-23). Le commentaire de la version canonique DECRIVAIT deja
   *     ce defaut-ci : « glissantes, elles changeaient a chaque lecture et aucune ne se relisait
   *     du cache ». Le diagnostic etait ecrit ; le jumeau avait ete oublie.
   *     MESURE, sur 90 000 blocs et une tete qui avance de 137 blocs (~4 min sur Base) :
   *         glissant : 0 fenetre sur 91 identique d une lecture a l autre — RIEN ne vient du cache
   *         aligne   : 89 sur 91 (98 %)
   *     C est la cause des 79 `eth_getLogs` sur la factory a CHAQUE chargement, mesures en
   *     production, pour un historique qui ne change jamais.
   *     ⛔ ET LES BORNES DEVIENNENT JOINTIVES SANS RECOUVREMENT. Le motif glissant relisait 90
   *       blocs deux fois (`haut` de la fenetre suivante = `bas` de la precedente).
   *       ⚠️ MESURE HONNETE : sur 30 fenetres reelles, ce recouvrement a produit 0 doublon — les
   *         blocs partages ne portaient aucune creation. Le defaut est donc LATENT, pas actif :
   *         il dupliquerait le jour ou une creation tomberait sur une bordure. Je ne le compte pas
   *         comme un bug en cours.
   *     ⛔ CONTROLE AVANT LIVRAISON : les deux motifs ont ete lances sur la MEME plage et rendent
   *       exactement les memes 181 creations distinctes. Un correctif qui ampute serait pire que
   *       le defaut — l aligne ne perd rien. */
  let haut = dernier;
  while (haut >= debut) {
    const bas = Math.max(debut, Math.floor(haut / FENETRE_MAX) * FENETRE_MAX);
    const hautFenetre = haut;
    haut = bas - 1;
    try {
      const logs = await rpc('eth_getLogs', [{
        fromBlock: '0x' + bas.toString(16), toBlock: '0x' + hautFenetre.toString(16),
        address: FACTORY, topics: [TOPIC_CREATED],
      }]);
      for (const l of logs) { const c = decoderCreation(l); if (c) trouvees.push(c); }
    } catch (e) {
      /* ⛔ Une fenetre ratee n est pas une fenetre vide. On la NOMME. */
      fenetresRatees.push({ de: bas, a: hautFenetre, cause: e.message });
    }
    if (surProgres) surProgres({ parcouru: dernier - bas, total: dernier - debut, trouvees: trouvees.length });
  }
  trouvees.sort((a, b) => (b.bloc ?? 0) - (a.bloc ?? 0));
  return { creations: trouvees, fenetre: { de: debut, a: dernier }, fenetresRatees };
}

/**
 * Resout le CREATEUR d une creation. ⛔ Depuis la TRANSACTION, jamais depuis le log : l evenement
 * ne le porte pas, et le deduire serait l inventer.
 */
export async function createurDe({ rpc, tx, essais = 4, attente = 350 }) {
  if (!tx) return { createur: null, raison: 'aucun hash de transaction dans le log' };
  let derniere = null;
  for (let n = 0; n < essais; n++) {
    try {
      const t = await rpc('eth_getTransactionByHash', [tx]);
      /* ⛔ « introuvable » est une REPONSE, pas une panne : on ne la reessaie pas. Reessayer une
       * reponse stable ne fait que perdre du temps et brouiller la distinction. */
      if (!t) return { createur: null, raison: 'transaction introuvable : non mesure, pas absent' };
      return { createur: t.from, essais: n + 1 };
    } catch (e) {
      /* ⚠️ CE QU ON REESSAIE : les pannes TRANSITOIRES. Mesure du 2026-09-02 sur le RPC public de
       * Base Sepolia : meme a concurrence 4, seules 95 % des lectures passent ; a 16, 33 %.
       * Sans reprise, 2 110 blocks sur 3 000 remontaient « createur inconnu » — un resultat
       * honnete et inutilisable. La limite de debit est transitoire PAR NATURE : la traiter comme
       * un verdict etait la faute. */
      derniere = e.message;
      if (n < essais - 1) await new Promise((r) => setTimeout(r, attente * (2 ** n)));
    }
  }
  return { createur: null, raison: derniere + ' (apres ' + essais + ' essais)' };
}

/**
 * Filtre par createur. ⛔ Une transaction a lire PAR ENTREE — c est le coût irreductible, puisque
 * l evenement ne porte pas le createur.
 *
 * ⚠️ LA CONCURRENCE N EST PAS UNE OPTIMISATION, C EST CE QUI REND LA FONCTION UTILISABLE.
 *    En sequentiel, 400 resolutions prenaient assez longtemps pour qu il faille plafonner a 400 —
 *    et sur une fenetre de 60 000 blocs contenant 4 806 creations, le block de l utilisateur
 *    tombait AU-DELA du plafond. La liste disait honnetement « 4 406 non verifies », et restait
 *    inutilisable : honnete et inutilisable reste inutilisable.
 *
 * ⛔ `surProgres` existe pour que l appelant puisse montrer l avancement plutot qu un ecran fige.
 */
export async function creationsDe({ rpc, creations, adresse, concurrence = 12, surProgres = null }) {
  const cible = adresse.toLowerCase();
  const gardees = [];
  const nonResolues = [];
  let faits = 0;
  for (let i = 0; i < creations.length; i += concurrence) {
    const lot = creations.slice(i, i + concurrence);
    const res = await Promise.all(lot.map((c) => createurDe({ rpc, tx: c.tx })));
    for (let j = 0; j < lot.length; j++) {
      const { createur, raison } = res[j];
      if (createur === null) { nonResolues.push({ ...lot[j], raison }); continue; }
      if (createur.toLowerCase() === cible) gardees.push({ ...lot[j], createur });
    }
    faits += lot.length;
    if (surProgres) surProgres({ faits, total: creations.length, trouves: gardees.length });
  }
  /* ⛔ Les non resolues ne sont ni « a lui » ni « pas a lui » : elles sont INCONNUES, et l appelant
   * doit pouvoir le dire a l ecran. */
  return { gardees, nonResolues };
}

export { selecteur };

/** ERC-20 Transfer(address,address,uint256) — topic0 measured via keccak.js (same path as TOPIC_CREATED). */
export const TOPIC_TRANSFER = '0x' + hexDe(keccak256(enc.encode(
  'Transfer(address,address,uint256)')));

/** Pad a 20-byte address into a 32-byte indexed topic (left-zero). */
export function topicAdresse(addr) {
  const a = String(addr || '').toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{40}$/.test(a)) return null;
  return '0x' + '0'.repeat(24) + a;
}

/**
 * Decode one ERC-20 Transfer log. Returns null if topic0 is wrong — never invent from/to/value.
 */
export function decoderTransfer(log) {
  if (!log || !log.topics || log.topics[0] !== TOPIC_TRANSFER) return null;
  if (!log.topics[1] || !log.topics[2]) return null;
  const from = '0x' + log.topics[1].slice(26);
  const to = '0x' + log.topics[2].slice(26);
  const d = String(log.data || '').replace(/^0x/, '');
  let value = null;
  if (d.length >= 64) {
    try { value = BigInt('0x' + d.slice(0, 64)); } catch { value = null; }
  }
  return {
    from, to, value,
    token: log.address ? String(log.address).toLowerCase() : null,
    bloc: log.blockNumber ? parseInt(log.blockNumber, 16) : null,
    tx: log.transactionHash || null,
    logIndex: log.logIndex != null ? parseInt(log.logIndex, 16) : null,
  };
}

/**
 * Windowed eth_getLogs for Transfer on one token. Same Base 10k-block ceiling as listerCreations.
 * Optional fromAddr / toAddr become indexed topic filters (null = any).
 * ⛔ A failed window is named in fenetresRatees — never conflated with « zero transfers ».
 */
export async function listerTransfers({
  rpc, token, blocs = FENETRE_MAX, fin = null, fromAddr = null, toAddr = null, surProgres = null,
}) {
  const adr = String(token || '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(adr)) {
    return { transfers: [], fenetre: null, fenetresRatees: [{ de: null, a: null, cause: 'invalid token address' }] };
  }
  const tFrom = fromAddr ? topicAdresse(fromAddr) : null;
  const tTo = toAddr ? topicAdresse(toAddr) : null;
  if (fromAddr && !tFrom) {
    return { transfers: [], fenetre: null, fenetresRatees: [{ de: null, a: null, cause: 'invalid fromAddr' }] };
  }
  if (toAddr && !tTo) {
    return { transfers: [], fenetre: null, fenetresRatees: [{ de: null, a: null, cause: 'invalid toAddr' }] };
  }
  const topics = [TOPIC_TRANSFER];
  if (tFrom || tTo) {
    topics.push(tFrom); /* may be null = any from when only to is set */
    if (tTo) topics.push(tTo);
  }
  const dernier = fin ?? parseInt(await rpc('eth_blockNumber', []), 16);
  const debut = Math.max(0, dernier - blocs);
  const trouvees = [];
  const fenetresRatees = [];
  /* ⛔ FENETRES ALIGNEES SUR DES MULTIPLES DE FENETRE_MAX (2026-09-19, charge RPC) : glissantes (dernier - 2000…), elles
   *    changeaient a chaque lecture et aucune ne se relisait du cache. Alignees, seule celle du haut bouge ; les autres
   *    sont identiques d une lecture a l autre. Bornes jointives sans recouvrement : [bas, haut] puis [.., bas - 1]. */
  let haut = dernier;
  while (haut >= debut) {
    const bas = Math.max(debut, Math.floor(haut / FENETRE_MAX) * FENETRE_MAX);
    const hautFenetre = haut;
    haut = bas - 1;
    try {
      const logs = await rpc('eth_getLogs', [{
        fromBlock: '0x' + bas.toString(16),
        toBlock: '0x' + hautFenetre.toString(16),
        address: adr,
        topics,
      }]);
      for (const l of logs) {
        const t = decoderTransfer(l);
        if (t) trouvees.push(t);
      }
    } catch (e) {
      fenetresRatees.push({ de: bas, a: hautFenetre, cause: e.message });
    }
    if (surProgres) {
      surProgres({ parcouru: dernier - bas, total: dernier - debut, trouvees: trouvees.length });
    }
  }
  trouvees.sort((a, b) => {
    const db = (b.bloc ?? 0) - (a.bloc ?? 0);
    if (db) return db;
    return (b.logIndex ?? 0) - (a.logIndex ?? 0);
  });
  return { transfers: trouvees, fenetre: { de: debut, a: dernier }, fenetresRatees };
}

/**
 * Resolve creator of a known B-20 token: factory B20Created with topics[1]=token, then tx.from.
 * Windowed; if create is older than `blocs`, returns createur null + raison (fail-closed, not invented).
 */
export async function createurDuJeton({ rpc, token, blocs = FENETRE_MAX * 3, fin = null, surProgres = null }) {
  const adr = String(token || '').toLowerCase();
  const topicTok = topicAdresse(adr);
  if (!topicTok) return { createur: null, tx: null, bloc: null, raison: 'invalid token address' };
  const dernier = fin ?? parseInt(await rpc('eth_blockNumber', []), 16);
  const debut = Math.max(0, dernier - blocs);
  const fenetresRatees = [];
  /* ⛔ LE TROISIEME JUMEAU, aligne comme les deux autres (2026-09-23). Meme raison : des bornes qui
   *    bougent a chaque lecture ne se relisent jamais du cache. Ici la boucle s ARRETE au premier
   *    resultat, donc elle coute moins — mais elle est appelee une fois PAR JETON consulte, et
   *    c est justement le genre de lecture qu un visiteur refait sans arret. */
  let haut = dernier;
  let hit = null;
  while (haut >= debut && !hit) {
    const bas = Math.max(debut, Math.floor(haut / FENETRE_MAX) * FENETRE_MAX);
    const hautFenetre = haut;
    haut = bas - 1;
    try {
      const logs = await rpc('eth_getLogs', [{
        fromBlock: '0x' + bas.toString(16),
        toBlock: '0x' + hautFenetre.toString(16),
        address: FACTORY,
        topics: [TOPIC_CREATED, topicTok],
      }]);
      if (logs && logs.length) {
        const c = decoderCreation(logs[0]);
        if (c && c.tx) hit = c;
      }
    } catch (e) {
      fenetresRatees.push({ de: bas, a: hautFenetre, cause: e.message });
    }
    if (surProgres) {
      surProgres({ parcouru: dernier - bas, total: dernier - debut, trouvees: hit ? 1 : 0 });
    }
  }
  if (!hit) {
    return {
      createur: null, tx: null, bloc: null,
      raison: fenetresRatees.length && fenetresRatees.length >= Math.ceil((dernier - debut) / FENETRE_MAX)
        ? 'create log windows failed'
        : 'B20Created not in scanned window',
      fenetre: { de: debut, a: dernier }, fenetresRatees,
    };
  }
  const { createur, raison } = await createurDe({ rpc, tx: hit.tx });
  return {
    createur: createur || null,
    tx: hit.tx,
    bloc: hit.bloc,
    raison: createur ? null : (raison || 'tx.from unread'),
    fenetre: { de: debut, a: dernier },
    fenetresRatees,
  };
}
