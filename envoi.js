// envoi.js — faire signer un envoi par le wallet de l utilisateur. Cette page ne signe JAMAIS.
// ================================================================================================
// ⛔⛔ CE MODULE PREPARE, LE WALLET SIGNE, L UTILISATEUR DECIDE. Aucune cle n est detenue, aucune
//    n est demandee. `eth_sendTransaction` ouvre le wallet de l utilisateur, qui AFFICHE ce qu il
//    va signer ; rien ne part sans son geste. C est la propriete que ce produit vend depuis le
//    premier jour, et elle ne se donne pas « juste pour ce bouton ».
//
// ⛔ POURQUOI UN MODULE ET PAS UNE COPIE D `envoyerTx`. La fonction d envoi de `index.html` SIGNE
//    ET PAIE ; la regle interdit d y toucher. La recopier dans la nouvelle coque aurait cree le
//    jumeau qui diverge — le defaut exact qui a coute quatre approbations parties sur Sepolia :
//    la garde de chaine existait dans un ecran et pas dans l autre. Ce module reprend la MEME
//    discipline, ecrite une fois, testee, et surveillee par la regle 8.
//
// ⚠️ CE QUE CE MODULE NE FAIT PAS : il ne choisit ni le montant, ni le destinataire, ni le jeton. Il
//    refuse ce qui est mal forme et ne corrige rien — une saisie « reparee » en silence est une
//    saisie qu on n a pas faite.
import { selecteur } from './pool.js';
import { keccak256 } from './keccak.js';
/* ⛔⛔⛔ `lireStatutGroupe` EST LE HELPER CANONIQUE DE LECTURE D UN LOT, et ce fichier en portait une
 *   COPIE PLUS FAIBLE — le motif le plus cher de ce depot. La copie sortait sur `receipts[0]` sans
 *   regarder le `status` d AUCUN appel, et ne connaissait pas le code 600 (« partiellement
 *   applique »). Mesure de l audit adverse du 2026-10-01 : une jambe 1 reussie SEULE rendait
 *   `CONFIRME, atomique: true`, l ecran annoncait « Bought in one signature », le compteur
 *   `achat_ok` montait — et l acheteur n avait que le pivot, aucun frais n ayant ete preleve sur la
 *   seconde jambe. Un achat rate compte comme un achat reussi, et un frais perdu passe pour un
 *   revenu.
 *   ⇒ ON IMPORTE LE CANONIQUE au lieu de reparer la copie : deux lectures du meme statut
 *     divergeront toujours a nouveau, et c est deja arrive ici. */
import { lireStatutGroupe } from './groupe-wallet.js';

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/* 2026-11-15 (growth): the app's Base Builder Code, registered on dashboard.base.org (project "TokenizedBlock", code bc_yjpkqm2o).
 *   ERC-8021: the code in ASCII, its 1-byte length, schema id 0x00, then the 16-byte marker 0x8021...8021, appended to the END of a
 *   call's data. Contracts ignore trailing calldata; measured 15/11 by eth_call WITH and WITHOUT it (tools/sonde-builder-code.mjs):
 *   TBLOCK (B20) approve / transfer, wtCOIN approve and a view answered the same. Base then attributes the activity to the app
 *   (dashboard volume, rewards program, Base App store visibility). Never on a call with empty data (a plain ETH send to a contract
 *   without fallback would revert) nor on a contract creation (it would change the deployed bytecode). */
export const BUILDER_CODE = 'bc_yjpkqm2o';
export function suffixeBuilderCode(code = BUILDER_CODE) {
  if (!/^[\x20-\x7e]{1,255}$/.test(code)) return '';
  let hex = '';
  for (let i = 0; i < code.length; i++) hex += code.charCodeAt(i).toString(16).padStart(2, '0');
  return hex + code.length.toString(16).padStart(2, '0') + '00' + '8021'.repeat(8);
}
const SUFFIXE_BC = suffixeBuilderCode();
/** data with the builder-code suffix, or the data unchanged when it must not carry one (empty, creation, already suffixed) */
export function avecBuilderCode(data, to) {
  const d = String(data || '0x');
  if (!SUFFIXE_BC || !to || !/^0x[0-9a-fA-F]{8,}$/.test(d) || d.length % 2) return data;
  if (d.toLowerCase().endsWith('8021'.repeat(8))) return data; /* a code is already there (ours or another app's) */
  return d + SUFFIXE_BC;
}

/** tip 2354: quiet unique wallet log for later airdrop scan — localStorage only, no PII UI. */
const CLE_USED_WALLETS = 'tb-used-wallets';
const MAX_USED_WALLETS = 500;

function checksumAdresse(adr) {
  const hex = String(adr || '').toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{40}$/.test(hex)) return null;
  const hash = [...keccak256(new TextEncoder().encode(hex))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  let out = '0x';
  for (let i = 0; i < 40; i++) {
    out += parseInt(hash[i], 16) >= 8 ? hex[i].toUpperCase() : hex[i];
  }
  return out;
}

export function noterWalletUtilise(adr) {
  try {
    if (typeof localStorage === 'undefined') return;
    const cs = checksumAdresse(adr);
    if (!cs) return;
    let list = [];
    try { list = JSON.parse(localStorage.getItem(CLE_USED_WALLETS) || '[]'); } catch (_) { list = []; }
    if (!Array.isArray(list)) list = [];
    const low = cs.toLowerCase();
    if (list.some((x) => String(x).toLowerCase() === low)) return;
    list.push(cs);
    if (list.length > MAX_USED_WALLETS) list = list.slice(-MAX_USED_WALLETS);
    localStorage.setItem(CLE_USED_WALLETS, JSON.stringify(list));
  } catch (_) { /* private mode */ }
}

const ADRESSE = /^0x[0-9a-fA-F]{40}$/;
const MAX_UINT256 = (1n << 256n) - 1n;

/**
 * Le calldata d un `transfer(address,uint256)`.
 * ⛔ REFUSE, NE REPARE PAS. Une adresse mal formee ou un montant hors bornes leve une erreur : un
 *    encodeur qui tronquerait ou completerait enverrait des fonds a une adresse que personne n a
 *    tapee.
 */
export function encodeTransfer(destinataire, montant) {
  if (!ADRESSE.test(String(destinataire || ''))) throw new Error('destination is not an address');
  if (typeof montant !== 'bigint' || montant < 0n || montant > MAX_UINT256) {
    throw new Error('amount must be a bigint within uint256');
  }
  return '0x' + selecteur('transfer(address,uint256)')
    + destinataire.slice(2).toLowerCase().padStart(64, '0')
    + montant.toString(16).padStart(64, '0');
}

/**
 * L utilisateur a-t-il dit non ?
 * ⛔ REPRIS A L IDENTIQUE de `index.html` (code EIP-1193 4001 + les formulations des wallets). Un
 *    refus n est pas une panne : il ne se reessaie pas et ne se gronde pas.
 */
export function estRefusUtilisateur(e) {
  return !!(e && (e.code === 4001 || /user (rejected|denied)|reject(ed)? the request/i.test(String(e.message || e))));
}

/**
 * Le wallet est-il sur la chaine ET le compte que la page a prepares ?
 *
 * ⛔⛔ LE COMPTE EST RELU MEME QUAND LA CHAINE EST LA BONNE. Avant 2026-09-07, la garde de
 *    `index.html` rendait `true` des que la chaine collait, sans relire `eth_accounts` : un
 *    changement de compte entre la preparation et la signature laissait partir un envoi prepare
 *    pour une autre identite. Meme lecon ici, des la premiere version.
 * ⛔ UNE LECTURE IMPOSSIBLE REFUSE. « Je n ai pas pu verifier » ne vaut jamais « c est bon ».
 */
export async function gardeChaineEtCompte({ eth, chaineAttendue, compteAttendu }) {
  let id;
  try { id = parseInt(await eth.request({ method: 'eth_chainId' }), 16); }
  catch (e) { return { ok: false, etat: 'CHAINE_ILLISIBLE', pourquoi: 'could not read your wallet network — nothing was sent' }; }
  if (id !== chaineAttendue) {
    return { ok: false, etat: 'MAUVAISE_CHAINE', chaineWallet: id,
      pourquoi: 'your wallet is on chain ' + id + ', this page prepared chain ' + chaineAttendue + ' — nothing was sent' };
  }
  let a = null;
  try { const accs = await eth.request({ method: 'eth_accounts' }); a = (accs && accs[0]) || null; }
  catch (e) { return { ok: false, etat: 'COMPTE_ILLISIBLE', pourquoi: 'could not read your wallet account — nothing was sent' }; }
  if (!a || !compteAttendu || a.toLowerCase() !== String(compteAttendu).toLowerCase()) {
    return { ok: false, etat: 'AUTRE_COMPTE', compteWallet: a,
      pourquoi: 'your wallet account is not the one this page prepared for — nothing was sent' };
  }
  return { ok: true, etat: 'OK' };
}

/**
 * Faire signer un envoi par le wallet, puis relire la chaine au lieu de supposer.
 *
 * ⛔ L ORDRE EST LA SECURITE : adresse valide → garde chaine ET compte → estimation du gas → envoi
 *    avec une limite EXPLICITE → recu relu. Sauter l estimation laisse le wallet plafonner et
 *    tomber en panne de gas sur la chaine — deja paye dans ce depot avant la PR #7.
 * ⛔ UN ENVOI ACCEPTE N EST PAS UN ENVOI REUSSI. On attend le recu ; un `status` different de 0x1
 *    est un echec, et « gasUsed == limite » se dit comme une panne de gas probable.
 *
 * @returns {Promise<{etat: string, hash?: string, gaz?: bigint, horsGaz?: boolean, pourquoi?: string}>}
 */

/** tip 2346: Base App / Coinbase Smart Wallet often reject eth_sendTransaction.
 *  Try EIP-5792 wallet_sendCalls → poll wallet_getCallsStatus for a tx hash. */
/**
 * tip 2346 + Instant Birth: EIP-5792 wallet_sendCalls.
 * Accepts one call OR a batch [{to,data,value}]. atomicRequired: true on v2.
 */
export async function envoyerViaSendCalls({ eth, chaineAttendue, compte, to, data, value, calls = null, sansRepliV1 = false }) {
  /* sansRepliV1 (2026-10-11, revue adverse 3/3) : la relance en 1.0 n exige PAS l atomicite ; un appelant qui promet « tout ou rien »
   *   (la Bank) la refuse - un wallet qui ne connait pas la 2.0.0 rend alors « rien n est parti », sans rouvrir de fenetre. */
  let version = '2.0.0';
  if (!eth || typeof eth.request !== 'function') return null;
  const chainId = '0x' + Number(chaineAttendue).toString(16);
  const lot = Array.isArray(calls) && calls.length
    ? calls.map((c) => ({
      to: c.to,
      data: avecBuilderCode(c.data || '0x', c.to),
      value: c.value || '0x0',
    }))
    : [{ to, data: avecBuilderCode(data || '0x', to), value: value || '0x0' }];
  for (const c of lot) {
    if (!ADRESSE.test(String(c.to || ''))) {
      return { etat: 'DESTINATION_INVALIDE', pourquoi: 'a batch call destination is not an address — nothing was sent' };
    }
  }
  let id;
  try {
    const r = await eth.request({
      method: 'wallet_sendCalls',
      params: [{
        version: '2.0.0',
        from: compte,
        chainId,
        atomicRequired: true,
        calls: lot,
      }],
    });
    id = (r && (r.id || r)) || null;
    if (typeof id === 'object' && id.id) id = id.id;
  } catch (e) {
    /* ⛔⛔⛔ ON NE REJOUE LE LOT QUE SI LE WALLET DIT NE PAS CONNAITRE `wallet_sendCalls` EN 2.0.
     *   Avant, ce `catch` renvoyait le MEME tableau d appels en version 1.0 apres N IMPORTE QUELLE
     *   erreur. Le commentaire disait « older wallets » ; la condition, elle, n existait pas.
     *   ⇒ SCENARIO MESURE PAR L AUDIT ADVERSE DU 2026-10-01 : l utilisateur approuve le lot
     *     [jambe 1, approve, jambe 2], le lot EST SOUMIS, puis la reponse JSON-RPC se perd —
     *     timeout du provider, onglet mis en veille, WalletConnect qui se deconnecte. `request()`
     *     jette. Le wallet se rouvrait aussitot avec les TROIS MEMES appels. Si la personne signe,
     *     le franchissement s execute DEUX FOIS : deux swaps V4, deux swaps Aerodrome, deux
     *     retenues de frais, pour un seul achat voulu.
     *   ⛔ ET LA DOCTRINE EST DEJA ECRITE DANS CE DEPOT, a deux endroits : « ECHEC_ENVOI NE GARANTIT
     *     PAS QUE RIEN N EST PARTI » (app.html), et le chemin EOA jumeau teste le refus AVANT toute
     *     retombee. Seule cette fonction l ignorait — et c est elle qui porte l achat.
     *   ⇒ Le discriminant est le MEME que celui deja calcule plus bas pour `sendCallsUnsupported` :
     *     il vivait dans ce fichier, applique UNE ETAPE TROP TARD, c est-a-dire apres que le risque
     *     avait ete pris. */
    const msg = String((e && e.message) || e || '');
    if (!/method|not supported|does not exist|unsupported|4200|-32601/i.test(msg)) {
      return { etat: 'ECHEC_ENVOI', sendCallsUnsupported: false,
        pourquoi: 'the wallet did not answer this batch, and we will NOT re-open it: the batch may '
          + 'already be on its way, and signing it again would run the whole thing twice. Check '
          + 'your wallet before anything else. (' + msg.slice(0, 120) + ')' };
    }
    if (sansRepliV1) {
      return { etat: 'ECHEC_ENVOI', sendCallsUnsupported: true,
        pourquoi: 'this wallet does not take an all-or-nothing batch (wallet_sendCalls 2.0.0) — nothing was sent' };
    }
    /* older wallets: try 1.0 shape once (no atomicRequired) */
    version = '1.0';
    try {
      const r = await eth.request({
        method: 'wallet_sendCalls',
        params: [{
          version: '1.0',
          from: compte,
          chainId,
          calls: lot,
        }],
      });
      id = (typeof r === 'string') ? r : (r && r.id) || null;
    } catch (e2) {
      /* ⛔ 2026-10-11 (revue adverse, 3/3) : le drapeau se lisait sur e2 + e ; e avait DEJA matche (c est lui qui ouvre ce repli),
       *   donc un refus 4001 ou une reponse perdue APRES la fenetre 1.0 devenait « methode inconnue, rien n est parti ». Seule la
       *   DERNIERE tentative dit si la methode est inconnue. */
      return { etat: 'ECHEC_ENVOI', pourquoi: 'smart wallet sendCalls failed — ' + String((e2 && e2.message) || e2 || e),
        sendCallsUnsupported: /method|not supported|does not exist|4200/i.test(String((e2 && e2.message) || e2 || '')) };
    }
  }
  if (!id) return { etat: 'ECHEC_ENVOI', pourquoi: 'wallet_sendCalls returned no id' };
  for (let i = 0; i < 40; i++) {
    await pause(1500);
    let st;
    try {
      st = await eth.request({ method: 'wallet_getCallsStatus', params: [id] });
    } catch (_) { continue; }
    /* ⛔⛔⛔ LA LECTURE PASSE PAR LE HELPER CANONIQUE. Avant, ce bloc faisait :
     *       const hash = receipts[0] && (...);
     *       if (hash) return { etat: 'ENVOYE_AA', ... };
     *     — une sortie sur le PREMIER recu, AVANT tout controle de statut. Les tests d echec qui
     *     suivaient etaient donc INATTEIGNABLES des qu un recu existait, et `receipts[0]` est la
     *     JAMBE 1. Un lot [swap V4 reussi, swap Aerodrome reverte] rendait donc un succes.
     *   ⛔ ET LE CODE 600 — « le wallet n a applique qu une partie » — n etait dans AUCUNE branche.
     *     C est exactement l etat qui decrit un franchissement a moitie execute, celui ou
     *     l acheteur garde le pivot. Le canonique le rend `PARTIEL`, et un PARTIEL ne doit JAMAIS
     *     se lire comme un succes.
     *   ⛔ UN `ECHEC` NE SE RE-SIGNE PAS TOUT SEUL : on le remonte, et c est l appelant — avec
     *     l humain devant — qui decide. Reessayer ici rejouerait un lot dont on ne sait pas ce
     *     qu il a deja applique. */
    const v = lireStatutGroupe(st);
    if (v.etat === 'EN_COURS') continue;
    if (v.etat === 'CONFIRME') {
      return { etat: 'ENVOYE_AA', hash: String(v.hash || ''), gaz: null, batchSize: lot.length, atomiqueExige: version === '2.0.0',
        /* ⛔ LE NOMBRE DE RECUS EST REMONTE : il permet a l appelant de verifier que le lot a bien
         *   applique TOUS ses appels, au lieu de le supposer depuis `batchSize`. */
        recusOk: (v.recus || []).length,
        /* 2026-10-18 : TOUS les hashes des recus (un lot 1.0 ou un wallet qui ne groupe pas en une tx en rend plusieurs) — BlockRolls lit
         *   les Rolled de chacun ; `hash` (le dernier) reste ce qu il etait */
        hashes: (v.recus || []).map((x) => String((x && x.transactionHash) || '')).filter((h) => /^0x[0-9a-f]{64}$/i.test(h)) };
    }
    if (v.etat === 'PARTIEL') {
      return { etat: 'PARTIEL', pourquoi: v.pourquoi, partiel: true,
        /* ⛔ ON NE REND PAS DE `hash` SUR UN PARTIEL. Un hash se lit comme « voila ta transaction »,
         *   et l appelant irait le presenter comme un succes. Ici, une partie seulement a ete
         *   appliquee : la seule chose honnete est de renvoyer la personne vers son wallet. */
        recus: v.recus || [] };
    }
    return { etat: 'ANNULE_SUR_CHAINE', pourquoi: v.pourquoi || 'smart wallet batch failed' };
  }
  return { etat: 'EN_ATTENTE', pourquoi: 'smart wallet batch sent, not confirmed yet — do not resend', hash: null };
}



/** L evenement `UserOperationEvent` de l EntryPoint ERC-4337 (v0.6 et v0.7 partagent ce topic). */
export const TOPIC_USER_OP = '0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f';

/**
 * Lit le drapeau `success` d un UserOperationEvent dans un recu.
 *
 * ⛔ TROIS REPONSES, PAS DEUX : `true` reussi · `false` echoue · `null` il n y en a pas.
 *    Une transaction ordinaire n a PAS cet evenement, et doit rester CONFIRME — rendre `false`
 *    par defaut casserait tous les envois normaux.
 * @param {object} recu
 * @returns {boolean|null}
 */
export function verdictUserOp(recu) {
  const logs = (recu && recu.logs) || [];
  for (const l of logs) {
    if (!l || !Array.isArray(l.topics) || l.topics[0] !== TOPIC_USER_OP) continue;
    /* data = nonce, success, actualGasCost, actualGasUsed -> le 2e mot porte le drapeau */
    const m = String(l.data || '').replace(/^0x/, '').match(/.{64}/g);
    if (!m || m.length < 2) continue;
    /* ⛔ PLUSIEURS UserOp peuvent tenir dans UNE transaction de bundler : si l une echoue, on le dit.
     *    Ne regarder que la premiere ferait passer un echec pour un succes. */
    if (BigInt('0x' + m[1]) !== 1n) return false;
  }
  return logs.some((l) => l && Array.isArray(l.topics) && l.topics[0] === TOPIC_USER_OP) ? true : null;
}

/**
 * Instant Birth: send an atomic batch when the wallet supports sendCalls.
 * Does NOT fall back to sequential eth_sendTransaction — caller owns EOA fallback + honest N-sig copy.
 */
export async function envoyerLotAtomique({ eth, rpc, chaineAttendue, compte, calls, attendre = true, delai = 2000, essais = 30, sansRepliV1 = false }) {
  if (!Array.isArray(calls) || calls.length < 1) {
    return { etat: 'REFUSE', pourquoi: 'atomic batch is empty — nothing was sent' };
  }
  const garde = await gardeChaineEtCompte({ eth, chaineAttendue, compteAttendu: compte });
  if (!garde.ok) return { etat: garde.etat, pourquoi: garde.pourquoi };
  noterWalletUtilise(compte);
  const aa = await envoyerViaSendCalls({ eth, chaineAttendue, compte, calls, sansRepliV1 });
  if (!aa) return { etat: 'ECHEC_ENVOI', pourquoi: 'no ethereum provider for sendCalls', sendCallsUnsupported: true };
  if (aa.etat === 'ENVOYE_AA' && aa.hash) {
    if (!attendre) return { etat: 'ENVOYE_AA', hash: aa.hash, gaz: null, batchSize: calls.length };
    let recu = null;
    for (let i = 0; i < essais; i++) {
      await pause(delai);
      recu = await rpc('eth_getTransactionReceipt', [aa.hash]).catch(() => null);
      if (recu) break;
    }
    if (!recu) return { etat: 'EN_ATTENTE', hash: aa.hash, gaz: null, pourquoi: 'atomic batch sent, not confirmed yet — do not resend' };
    if (recu.status !== '0x1') {
      return { etat: 'ANNULE_SUR_CHAINE', hash: aa.hash, gaz: null, pourquoi: 'the atomic batch reverted on chain' };
    }
    const uo = verdictUserOp(recu);
    if (uo === false) {
      return { etat: 'ANNULE_SUR_CHAINE', hash: aa.hash, gaz: null, viaSmartWallet: true,
        pourquoi: 'the outer transaction succeeded but your smart wallet operation failed' };
    }
    /* ⛔⛔⛔ `atomique: true` ETAIT UNE CONSTANTE LITTERALE. Aucun champ d atomicite n est lu nulle
     *   part dans ce module — ni `st.atomic`, ni `wallet_getCapabilities`. On AFFIRMAIT donc une
     *   propriete qu on n avait pas mesuree, sur le chemin exact ou elle decide si l acheteur peut
     *   se retrouver avec le pivot au lieu de son actif.
     *   ⇒ On rend desormais un FAIT VERIFIABLE a la place d une promesse : `appelsConfirmes`, le
     *     nombre de recus a `0x1` lus par le helper canonique, et `tousConfirmes`, qui le compare au
     *     nombre d appels envoyes. Un appelant qui veut savoir « tout est-il passe ? » le LIT au
     *     lieu de le croire.
     *   ⛔ ET ON NE REBAPTISE PAS LE DOUTE EN CERTITUDE : `tousConfirmes` ne prouve pas
     *     l atomicite. Il prouve que tous les appels ont abouti CETTE FOIS. L atomicite est une
     *     garantie du wallet sur l echec, pas une observation sur un succes. */
    const confirmes = typeof aa.recusOk === 'number' ? aa.recusOk : null;
    /* ⛔ 2026-10-11 (revue adverse, 3/3) : un lot 2.0.0 AVEC atomicRequired et statut 200 a applique TOUS ses appels par definition
     *   (EIP-5792 : tout ou rien), meme s il ne rend qu UN recu (une seule transaction pour N appels - smart wallet, 7702). Compter
     *   « 1 recu < 3 appels » affichait un emprunt REUSSI comme « Only 0 of 3 steps were confirmed ». Le compte des recus ne vaut
     *   que pour un lot 1.0, qui n exige pas l atomicite. */
    return { etat: 'CONFIRME', hash: aa.hash, gaz: null, batchSize: calls.length,
      hashes: Array.isArray(aa.hashes) && aa.hashes.length ? aa.hashes : [aa.hash],
      appelsConfirmes: confirmes, atomiqueExige: aa.atomiqueExige === true,
      tousConfirmes: aa.atomiqueExige === true ? true : confirmes === null ? null : confirmes === calls.length };
  }
  /* ⛔ LE `PARTIEL` REMONTE TEL QUEL, et surtout il ne tombe pas dans un `else` qui le melangerait
   *   a un echec propre. « Une partie a ete appliquee » demande a la personne d aller voir son
   *   wallet AVANT toute autre action ; « rien n a ete applique » lui dit qu elle peut recommencer.
   *   Les confondre fait recommencer quelqu un qui a deja la moitie de son lot sur la chaine. */
  return aa;
}

export async function envoyerDepuisWallet({ eth, rpc, chaineAttendue, compte, to, data = '0x',
  value = '0x0', attendre = true, delai = 2000, essais = 30 }) {
  if (!ADRESSE.test(String(to || ''))) {
    return { etat: 'DESTINATION_INVALIDE', pourquoi: 'the destination is not an address — nothing was sent' };
  }
  const garde = await gardeChaineEtCompte({ eth, chaineAttendue, compteAttendu: compte });
  if (!garde.ok) return { etat: garde.etat, pourquoi: garde.pourquoi };
  /* 2026-11-15: the Base Builder Code (see avecBuilderCode): estimated and sent with it, so the gas covers its 29 bytes */
  data = avecBuilderCode(data, to);

  /* tip 2345: HARD BUG for "works for us, not others" — box Rabby still opens Sign when
   * node estimateGas/sim fails; old app returned ESTIMATION_IMPOSSIBLE and never opened the wallet.
   * Prefer estimate; on failure use a ceiling so the USER wallet decides (same as smoke path). */
  let estimation;
  let estimateFallback = false;
  try { estimation = BigInt(await rpc('eth_estimateGas', [{ from: compte, to, data, value }])); }
  catch (e) {
    estimateFallback = true;
    const dataStr = String(data || '0x').toLowerCase();
    const plainEth = dataStr === '0x' || dataStr === '0x0';
    const createPaid = dataStr.startsWith('0x1d03fb54');
    if (plainEth) estimation = 65000n;
    else if (createPaid) estimation = 450000n; /* measured ~305k createPaid Base */
    else estimation = 900000n; /* v4 swap / Launch ceiling */
  }
  const gaz = estimation * 125n / 100n;

  noterWalletUtilise(compte);
  let hash;
  try {
    hash = await eth.request({ method: 'eth_sendTransaction',
      params: [{ from: compte, to, value, data, gas: '0x' + gaz.toString(16) }] });
  } catch (e) {
    if (estRefusUtilisateur(e)) return { etat: 'REFUSE_PAR_UTILISATEUR', pourquoi: 'you declined in your wallet — nothing was sent' };
    /* tip 2346: Base App / Coinbase Smart Wallet — fall back to wallet_sendCalls */
    const aa = await envoyerViaSendCalls({ eth, chaineAttendue, compte, to, data, value });
    if (aa && aa.hash) {
      hash = aa.hash;
    } else if (aa && aa.etat === 'EN_ATTENTE') {
      return aa;
    } else if (aa && aa.etat && aa.etat !== 'ECHEC_ENVOI') {
      return aa;
    } else {
      const why = (aa && aa.pourquoi) ? aa.pourquoi : String((e && e.message) || e);
      return { etat: 'ECHEC_ENVOI', pourquoi: 'the send failed — check your wallet before retrying. ' + why };
    }
  }
  if (!attendre) return { etat: 'ENVOYE', hash, gaz };

  let recu = null;
  for (let i = 0; i < essais; i++) {
    await pause(delai);
    recu = await rpc('eth_getTransactionReceipt', [hash]).catch(() => null);
    if (recu) break;
  }
  if (!recu) return { etat: 'EN_ATTENTE', hash, gaz, pourquoi: 'sent, not confirmed yet — do not resend' };
  if (recu.status !== '0x1') {
    const utilise = recu.gasUsed != null ? BigInt(recu.gasUsed) : null;
    return { etat: 'ANNULE_SUR_CHAINE', hash, gaz, horsGaz: utilise !== null && utilise === gaz,
      pourquoi: 'the transaction reverted on chain' };
  }
  /* ⛔⛔ UN RECU A 0x1 NE PROUVE RIEN SUR UN SMART ACCOUNT. Mesure sur une transaction reelle du
   *    2026-09-20 : reçu 0x1, et pourtant l operation interne avait ECHOUE. Le reçu externe decrit
   *    le travail du BUNDLER, pas le notre. Voir verdictUserOp. */
  const uo = verdictUserOp(recu);
  if (uo === false) {
    return { etat: 'ANNULE_SUR_CHAINE', hash, gaz, viaSmartWallet: true,
      pourquoi: 'the outer transaction succeeded but your smart wallet operation failed — '
        + 'gas was paid and nothing happened. Most often: not enough ETH in the account.' };
  }
  return { etat: 'CONFIRME', hash, gaz, ...(uo === true ? { viaSmartWallet: true } : {}) };
}

/* ── ⛔⛔ CE QU ON DIT QUAND UN ENVOI N EST PAS CONFIRME, ET POURQUOI C EST UNE FONCTION PURE ─────
 *     DEFAUT REEL, INTRODUIT PAR MOI LE 2026-09-29 ET TROUVE PAR UNE RELECTURE ADVERSARIALE.
 *     L ecran de l achat en ETH testait `env.etat !== 'CONFIRME'` et affichait alors
 *     « Not sent: … — nothing moved, your ETH is untouched. » Or `envoyerDepuisWallet` rend AUSSI
 *     `EN_ATTENTE` (« sent, not confirmed yet — do not resend ») et `ANNULE_SUR_CHAINE`
 *     (« reverted on chain », gaz PAYE). Le visiteur lisait donc :
 *       « Not sent: sent, not confirmed yet — do not resend — nothing moved, your ETH is untouched »
 *     Les deux moities se contredisent, et la seconde INVITE A RE-SIGNER : achat en double.
 *   ⛔ L ATOMICITE PROUVEE DIT « le swap aboutit ou ne se passe rien », PAS « rien n est parti ».
 *     Ma conclusion depassait la mesure d exactement un cran, et c est ce cran qui coute 0,01 ETH.
 *   ⛔ POURQUOI PURE, ET ICI : les etats vivent dans ce module, donc le message aussi — un jumeau
 *     dans `app.html` divergerait au premier etat ajoute. Et pure, elle se teste sans wallet. */
export const ENVOI_RIEN_PARTI = Object.freeze([
  'REFUSE_PAR_UTILISATEUR', 'DESTINATION_INVALIDE', 'REFUSE',
]);
export const ENVOI_PARTI = Object.freeze([
  'EN_ATTENTE', 'ANNULE_SUR_CHAINE', 'ENVOYE', 'ENVOYE_AA', 'CONFIRME',
  /* ⛔⛔⛔ `PARTIEL` EST DANS CETTE FAMILLE, ET JAMAIS DANS « RIEN N EST PARTI ». C est le code 600
   *   d un lot : le wallet n a applique QU UNE PARTIE des appels. Le ranger avec « nothing moved,
   *   your ETH is untouched » serait un MENSONGE sur le seul ecran ou la personne decide si elle
   *   doit agir — et elle a reellement de l actif deplace.
   *   ⛔ ET IL A SA PROPRE PHRASE plus bas : le message generique de cette famille dit « do NOT sign
   *     again », ce qui est juste mais insuffisant. Sur un PARTIEL, la personne doit savoir qu une
   *     PARTIE a ete appliquee — sinon elle cherche une transaction entiere qui n existe pas. */
  'PARTIEL',
]);

/** Le message a afficher pour un resultat d envoi NON confirme.
 * ⛔ TROIS ISSUES, JAMAIS DEUX : rien n est parti / quelque chose est parti / on ne sait pas.
 *   `ECHEC_ENVOI` tombe dans la troisieme a dessein : son propre message dit « check your wallet
 *   before retrying », donc il ne garantit PAS que rien n a ete envoye. Le ranger avec « rien
 *   n est parti » serait exactement la faute qu on corrige. */
export function messageEnvoi(env) {
  const etat = String((env && env.etat) || '');
  const pourquoi = String((env && env.pourquoi) || etat || 'unknown').slice(0, 130);
  /* ⛔⛔⛔ UN FAIT STRICTEMENT PLUS FORT QUE L ETAT, ET IL CONCERNE UNE PART IMPORTANTE DES WALLETS.
   *   `ECHEC_ENVOI` tombe a dessein dans « on ne sait pas » : il ne GARANTIT pas que rien n est
   *   parti. Mais quand `sendCallsUnsupported` est VRAI, le wallet a repondu qu il ne CONNAIT PAS
   *   `wallet_sendCalls` — une methode inconnue ne peut pas avoir ete executee. On sait donc, et le
   *   taire couterait deux fois :
   *     · le message generique disait « it may have been sent, check your wallet history » a
   *       quelqu un dont le wallet n a RIEN envoye : alarmant et faux ;
   *     · il ne lui disait pas CE QU IL PEUT FAIRE, alors que la reponse est simple.
   *   ⇒ MESURE QUI DONNE SON POIDS AU CAS, relue dans l entonnoir SERVI le 2026-10-01 :
   *         2026-09-29   oui  9   non 15   ->  62,5 % sans lot
   *         2026-09-30   oui 13   non  3   ->  18,8 % sans lot
   *         cumul        oui 22   non 18   ->  45,0 %
   *     ⛔ CE N EST PAS UN TAUX : les DEUX seuls jours mesures se CONTREDISENT, et n=24 puis n=16
   *       ne permettent pas de trancher entre bruit et changement reel. Ce depot citait « 40,5 % »
   *       dans cinq modules comme un fait etabli ; c etait une precision que la donnee ne porte
   *       pas. Ce qui suffit ici, et qui tient : la part n est PAS negligeable, donc ce message
   *       sera lu par beaucoup de monde.
   *     Et le franchissement vers une action tokenisee est le SEUL chemin de l app qui exige le lot.
   *   ⛔ LA CONDITION EST `=== true`, PAS UNE VERITE SOUPLE : `undefined` signifie « on n a pas
   *     regarde » et doit rester dans l incertain. Confondre les deux rendrait rassurant un cas
   *     qu on n a pas mesure. */
  if (env && env.sendCallsUnsupported === true) {
    return 'Your wallet cannot sign several calls together, so nothing was sent and nothing moved. '
      + 'This route needs that ability — a wallet that supports batched calls can take it.';
  }
  if (ENVOI_RIEN_PARTI.includes(etat)) {
    return 'Not sent: ' + pourquoi + ' — nothing moved, your ETH is untouched.';
  }
  if (etat === 'PARTIEL') {
    /* ⛔⛔ UN PARTIEL N EST NI UN SUCCES NI UN ECHEC, et le dire « envoye » tout court enverrait
     *   chercher une transaction entiere qui n existe pas. La personne doit savoir qu une PARTIE a
     *   ete appliquee — typiquement : le premier swap est passe, le second non, donc elle detient
     *   maintenant le jeton intermediaire. C est la seule information qui lui permet d agir. */
    return 'Partly applied: ' + pourquoi + ' — do NOT sign again. Some of the calls went through and '
      + 'some did not, so you may now hold the in-between asset. Open your wallet and look at what '
      + 'you actually hold before doing anything else.';
  }
  if (ENVOI_PARTI.includes(etat)) {
    /* ⛔ ON NE DIT SURTOUT PAS DE RECOMMENCER : re-signer ici achete deux fois. */
    return 'Sent: ' + pourquoi + ' — do NOT sign again. Check your wallet history before retrying.';
  }
  return 'Unclear: ' + pourquoi + ' — check your wallet history before retrying, it may have been sent.';
}
