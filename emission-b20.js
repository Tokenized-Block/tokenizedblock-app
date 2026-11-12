// emission-b20.js — can anyone still create more units of a B20 block? Read on the chain, not guessed.
// ================================================================================================
// ⛔⛔ 2026-11-12 (Phil, CLOUD panel: « pourquoi pas vérifier ») : the screen said « We did not check whether anyone can still
//   create them ». This module does the check. Measured the same day (eth_call / eth_getLogs, base-rpc.publicnode.com):
//   - a B20 is a precompile (code 0xef): getRoleMemberCount(MINT_ROLE) REVERTS, it does not list who holds a role;
//   - but the precompile DOES log its roles: a token created with an admin emits RoleGranted(DEFAULT_ADMIN_ROLE) and
//     RoleGranted(MINT_ROLE) from the factory 0xb20f… IN ITS CREATION BLOCK (seen on 0xb2…6f95fa: two grants, then two
//     RoleRevoked by the admin itself, same block). A token created without one emits only its mint Transfer (CLOUD: 1 log).
// ⇒ THE PROOF, IN ONE BLOCK: nothing can grant a role to a token before it exists, and only the admin of a role can grant it.
//   So the roles held at the END of the creation block are the only seed of every later grant. If, at that point, nobody holds
//   the mint role nor the role that administers it, the supply can NEVER grow: FIXE. Otherwise each holder found there (and
//   the creator) is asked hasRole() NOW — a holder of the mint role (with room under the cap) or of its admin role can create
//   more: PEUT_CROITRE. If every early holder has since let go, a later grant may sit in blocks we did not read: INCERTAIN,
//   said as such, never as « fixed ».
// ⛔ THE CREATION BLOCK is the server's own (its factory-log index) when it has it, re-checked here (born at b, not at b-1);
//   otherwise it is found by bisection on totalSupply() at past blocks (eth_call: « execution reverted » or « 0x » = not born).
//   Any other error is a READ FAILURE: NON_LU, retried later — never a verdict.
// ⛔ READ ONLY. No signature, no write. Pure apart from the injected `rpc` / `rpcLogs`.

/* role ids: keccak256 of the role names, as in abi.json (DEFAULT_ADMIN_ROLE is 0x00, OpenZeppelin style) */
export const MINT_ROLE = '0x154c00819833dac601ee5ddded6fda79d9d8b506b911b3dbd54cdb95fe6c3686';
export const DEFAULT_ADMIN_ROLE = '0x' + '0'.repeat(64);
/* keccak256("RoleGranted(bytes32,address,address)") / keccak256("RoleRevoked(bytes32,address,address)"), computed with keccak.js */
export const TOPIC_ROLE_GRANTED = '0x2f8788117e7eff1d82e926ec794901d17c78024a50270940304540a733656f0d';
export const TOPIC_ROLE_REVOKED = '0xf6391f5c32d9c69d2a47ea670b442974b53935d1edc7fd64eb21e047a839171b';
/* the B20 factory and its B20Created event (topics[1] = the token), the same constants as index-routeur.js (the test compares them) */
export const FACTORY_B20 = '0xb20f000000000000000000000000000000000000';
export const TOPIC_B20_CREATED = '0xfd9bf2730513a1709722ff379a0844dfd8f997d600693c2bcc659e188bbdba0d';
const SEL_HAS_ROLE = '0x91d14854';
const SEL_GET_ROLE_ADMIN = '0x248a9ca3';
const SEL_TOTAL_SUPPLY = '0x18160ddd';
const SEL_SUPPLY_CAP = '0x8f770ad0';
export const ETATS_EMISSION = Object.freeze(['FIXE', 'PEUT_CROITRE', 'INCERTAIN', 'NON_LU']);

const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x || '').toLowerCase();
const hex = (n) => '0x' + n.toString(16);
const mot = (a) => bas(a).replace(/^0x/, '').padStart(64, '0');
const adrDuMot = (t) => '0x' + bas(t).slice(-40);

/** « execution reverted » or an empty answer at a past block = the token did not exist yet. Anything else is not an answer. */
function estPasNe(err) {
  return /execution reverted|revert/i.test(String((err && err.message) || err || ''));
}
/** totalSupply() at block b: 'NE' | 'PAS_NE'. Throws on a read failure (rate limit, pruned node, timeout…). */
async function neA(rpc, jeton, b) {
  let r;
  try { r = await rpc('eth_call', [{ to: jeton, data: SEL_TOTAL_SUPPLY }, hex(b)]); }
  catch (e) { if (estPasNe(e)) return 'PAS_NE'; throw e; }
  if (r === '0x' || r === null || r === undefined || r === '') return 'PAS_NE';
  if (!/^0x[0-9a-fA-F]{64,}$/.test(String(r))) throw new Error('totalSupply at block ' + b + ' is not a word');
  return 'NE';
}
/** The creation block, by bisection on totalSupply(). `bas` must be a block where the token is not born. */
export async function trouverBlocCreation({ rpc, jeton, tete, plancher = 0, maxAppels = 40 }) {
  let lo = plancher, hi = tete, appels = 0;
  if ((await neA(rpc, jeton, hi)) !== 'NE') throw new Error('not born at the head');
  appels++;
  if (lo > 0 && (await neA(rpc, jeton, lo)) === 'NE') { lo = 0; } /* a floor above its birth: start from 0, never skip it */
  while (hi - lo > 1) {
    if (++appels > maxAppels) throw new Error('bisection did not converge in ' + maxAppels + ' reads');
    const m = Math.floor((lo + hi) / 2);
    if ((await neA(rpc, jeton, m)) === 'NE') hi = m; else lo = m;
  }
  return hi;
}

async function motA(rpc, jeton, data) {
  const r = await rpc('eth_call', [{ to: jeton, data }, 'latest']);
  if (!/^0x[0-9a-fA-F]{64,}$/.test(String(r || ''))) throw new Error('not a word: ' + String(r).slice(0, 20));
  return '0x' + String(r).slice(2, 66).toLowerCase();
}
const aLeRole = async (rpc, jeton, role, compte) => BigInt(await motA(rpc, jeton, SEL_HAS_ROLE + mot(role) + mot(compte))) === 1n;

/**
 * Who can create more of `jeton`? Read only.
 * @param {object} o
 * @param {(m:string,p:any[])=>Promise<any>} o.rpc       eth_call / eth_getCode / eth_blockNumber / eth_getTransactionByHash
 * @param {(m:string,p:any[])=>Promise<any>} [o.rpcLogs] eth_getLogs (the server passes its budget-aware log reader); default rpc
 * @param {string} o.jeton
 * @param {number|null} [o.blocCreation]  the creation block as the server's own factory-log index read it (re-checked here)
 * @param {string|null} [o.createur]      the creator (tx.from of the creation) when the server already knows it
 * @param {Object<string,string>} [o.etiquettes] address -> plain name for a holder the server knows (e.g. our fee wallet)
 * @returns {Promise<{etat, jeton, detenteurs?: {adr, createur, role}[], supply?, cap?, blocCreation?, preuve?, pourquoi?}>}
 *   etat FIXE: nobody can create more · PEUT_CROITRE: `detenteurs` can · INCERTAIN: early holders let go, later grants not read ·
 *   NON_LU: the read failed (retry later; never a verdict).
 */
export async function verifierEmission({ rpc, rpcLogs = null, jeton, blocCreation = null, createur = null, tete = null, etiquettes = {} }) {
  const j = bas(jeton);
  if (!ADR.test(j)) return { etat: 'NON_LU', jeton: j, pourquoi: 'not an address' };
  const logs = rpcLogs || rpc;
  try {
    const code = await rpc('eth_getCode', [j, 'latest']);
    if (bas(code) !== '0xef') return { etat: 'NON_LU', jeton: j, pasB20: true, pourquoi: 'not a native B20 (its code is not 0xef)' };
    const supply = BigInt(await motA(rpc, j, SEL_TOTAL_SUPPLY));
    const cap = BigInt(await motA(rpc, j, SEL_SUPPLY_CAP));
    const roleAdmin = await motA(rpc, j, SEL_GET_ROLE_ADMIN + mot(MINT_ROLE));
    const roles = new Set([MINT_ROLE, DEFAULT_ADMIN_ROLE, roleAdmin]);

    /* the creation block: the index's, re-checked (born at b, not at b-1), else found by bisection */
    let b = Number.isSafeInteger(blocCreation) && blocCreation > 0 ? blocCreation : null;
    if (b !== null && !((await neA(rpc, j, b)) === 'NE' && (await neA(rpc, j, b - 1)) === 'PAS_NE')) b = null;
    if (b === null) {
      const t = Number.isSafeInteger(tete) ? tete : parseInt(await rpc('eth_blockNumber', []), 16);
      if (!Number.isSafeInteger(t)) throw new Error('chain head not read');
      b = await trouverBlocCreation({ rpc, jeton: j, tete: t });
    }
    /* ⛔⛔ review 2026-11-12 — THE BLOCK MUST BE PROVEN, NOT INFERRED. Measured on the review's run: the bisection gave TTB
     *   (0xb2…bbe3) block 52084112 — its true birth is 51224806 — after one past-block read answered « execution reverted » where
     *   the token already existed. A wrong block can only be LATER than the birth, so it holds none of the creation grants: the
     *   verdict came out FIXE, cached for ever, for a token whose creator still holds DEFAULT_ADMIN_ROLE today. A false answer
     *   always errs toward « fixed ». ⇒ the factory's own B20Created log for THIS token must sit in that block (measured: 1 at the
     *   true birth of TTB, CLOUD, TBLOCK and 0xb2…ae3f; 0 at 52084112). Absent = not proven = NON_LU, read again later. */
    const nes = await logs('eth_getLogs', [{ address: FACTORY_B20, topics: [TOPIC_B20_CREATED, '0x' + mot(j)], fromBlock: hex(b), toBlock: hex(b) }]);
    if (!Array.isArray(nes)) throw new Error('creation proof: not a list');
    if (!nes.some((l) => l && bas(l.address) === FACTORY_B20 && bas(l.topics && l.topics[1]) === '0x' + mot(j))) {
      throw new Error('creation block ' + b + ' not proven: no B20Created for this token in it');
    }

    /* every log of the token in its creation block: the only place a first role can be given */
    const lus = await logs('eth_getLogs', [{ address: j, fromBlock: hex(b), toBlock: hex(b) }]);
    if (!Array.isArray(lus)) throw new Error('creation-block logs: not a list');
    const tries = [...lus].filter((l) => l && bas(l.address) === j)
      .sort((x, y) => parseInt(x.transactionIndex, 16) - parseInt(y.transactionIndex, 16) || parseInt(x.logIndex, 16) - parseInt(y.logIndex, 16));
    const tenus = new Map(); /* role -> Set(accounts) at the end of the creation block */
    const vus = new Set();
    let txCreation = null;
    for (const l of tries) {
      const t0 = bas(l.topics && l.topics[0]);
      if (!txCreation && l.transactionHash) txCreation = l.transactionHash;
      if (t0 !== TOPIC_ROLE_GRANTED && t0 !== TOPIC_ROLE_REVOKED) continue;
      const role = bas(l.topics[1]), compte = adrDuMot(l.topics[2]);
      if (!roles.has(role)) continue;
      vus.add(compte);
      const s = tenus.get(role) || new Set();
      if (t0 === TOPIC_ROLE_GRANTED) s.add(compte); else s.delete(compte);
      tenus.set(role, s);
    }
    let cre = ADR.test(bas(createur)) ? bas(createur) : null;
    if (!cre && txCreation) {
      try { const tx = await rpc('eth_getTransactionByHash', [txCreation]); if (tx && ADR.test(bas(tx.from))) cre = bas(tx.from); } catch (_) { /* the creator only labels */ }
    }
    const tenuFin = (role) => [...(tenus.get(role) || [])];
    const controleFin = [...new Set([...tenuFin(MINT_ROLE), ...tenuFin(roleAdmin), ...tenuFin(DEFAULT_ADMIN_ROLE)])];
    const base = { jeton: j, supply: String(supply), cap: String(cap), blocCreation: b, createur: cre, roleAdmin };
    if (!controleFin.length) {
      return { ...base, etat: 'FIXE', detenteurs: [],
        preuve: vus.size ? 'every right given at creation was given up in the same block' : 'no right was given at creation' };
    }

    /* someone held a right after creation: ask each one (and the creator) what they hold NOW */
    const candidats = [...new Set([...vus, ...(cre ? [cre] : [])])];
    const detenteurs = [];
    for (const c of candidats) {
      const mint = await aLeRole(rpc, j, MINT_ROLE, c);
      const admin = (await aLeRole(rpc, j, roleAdmin, c)) || (roleAdmin !== DEFAULT_ADMIN_ROLE && (await aLeRole(rpc, j, DEFAULT_ADMIN_ROLE, c)));
      if (mint || admin) {
        const et = etiquettes && typeof etiquettes[c] === 'string' ? etiquettes[c].slice(0, 40) : null;
        detenteurs.push({ adr: c, createur: c === cre, role: admin ? 'ADMIN' : 'MINT', ...(et ? { etiquette: et } : {}) });
      }
    }
    const admins = detenteurs.filter((d) => d.role === 'ADMIN');
    const minteurs = detenteurs.filter((d) => d.role === 'MINT');
    /* ⛔ an ADMIN can create more even when supply == cap: measured 2026-11-12 by eth_call FROM the admin of 0xb2…5949 (TBLOCK of
     *   the genesis): updateSupplyCap(2^100) and grantRole(MINT_ROLE, itself) both succeed; from any other account both revert
     *   with AccessControlUnauthorizedAccount (0xe2517d3f). A simulation only — nothing was signed or sent. */
    if (admins.length || (minteurs.length && cap > supply)) return { ...base, etat: 'PEUT_CROITRE', detenteurs };
    /* no admin of the mint role at the end of creation: the minters could only shrink, and none holds it now */
    if (!tenuFin(roleAdmin).length && !tenuFin(DEFAULT_ADMIN_ROLE).length && !minteurs.length) {
      return { ...base, etat: 'FIXE', detenteurs: [], preuve: 'its first minters gave up the right, and nobody could give it again' };
    }
    return { ...base, etat: 'INCERTAIN', detenteurs,
      pourquoi: minteurs.length ? 'a minter remains but the cap is reached; who may raise the cap was not read'
        : 'its first admin let go after creation; a later grant would sit in blocks not read here' };
  } catch (e) {
    return { etat: 'NON_LU', jeton: j, pourquoi: String((e && e.message) || e).slice(0, 160) };
  }
}

/** The account as a screen shows it: « the creator », else 0x1234…abcd. */
export function adresseCourte(d) {
  if (!d) return '?';
  if (d.createur) return 'the creator';
  if (typeof d.etiquette === 'string' && d.etiquette) return d.etiquette;
  const a = bas(d.adr);
  return a.slice(0, 6) + '…' + a.slice(-4);
}
/** The screen sentence for a verdict (plain English). null for a verdict that is not one yet (NON_LU: the screen says checking). */
export function phraseEmission(v) {
  if (!v) return null;
  if (v.etat === 'FIXE') return 'Fixed supply: nobody can create more';
  if (v.etat === 'PEUT_CROITRE') {
    const d = Array.isArray(v.detenteurs) ? v.detenteurs : [];
    const noms = d.slice(0, 3).map(adresseCourte);
    const qui = !noms.length ? 'someone'
      : d.length > 3 ? noms.join(', ') + ' and ' + (d.length - 3) + ' more'
        : noms.length === 1 ? noms[0] : noms.slice(0, -1).join(', ') + ' and ' + noms[noms.length - 1];
    return 'Supply can still grow: ' + qui + ' can create more';
  }
  if (v.etat === 'INCERTAIN') {
    /* ⛔ review 2026-11-12 : INCERTAIN has TWO causes (verifierEmission). « its first owner let go » is only the second; a minter left
     *   with the cap reached may have had no owner at all — saying one would state a fact that was never read. */
    const m = (Array.isArray(v.detenteurs) ? v.detenteurs : []).filter((d) => d && d.role === 'MINT');
    if (m.length) {
      return 'Supply may still grow: ' + (m.length === 1 ? adresseCourte(m[0]) : m.length + ' accounts')
        + ' can create more, but its cap is reached, and we have not yet traced who could raise the cap';
    }
    return 'Supply may still grow: its first owner let go of its rights, and we have not yet traced whether it handed them on';
  }
  return null;
}

/* ══ THE SERVICE: one cache per token, one check at a time, a cap per minute ════════════════════════════════════════════════
 * ⛔ A FIXED supply is a fact for ever (nobody can ever be given the right): kept for good and saved. PEUT_CROITRE can change
 *   (a holder can let go): re-read after DUREE_PEUT_CROITRE. A failed read is retried after DUREE_NON_LU, never cached as a fact.
 * ⛔ The HTTP route never waits on the chain: it answers from the cache, or « checking » while a check runs in the background. */
export const DUREE_PEUT_CROITRE_MS = 30 * 60 * 1000;
export const DUREE_INCERTAIN_MS = 6 * 60 * 60 * 1000;
export const DUREE_NON_LU_MS = 60 * 1000;
export const VERIFS_PAR_MINUTE = 6;

export function creerServiceEmission({ verifier, maintenant = () => Date.now(), parMinute = VERIFS_PAR_MINUTE, surFixe = null }) {
  const cache = new Map(); /* jeton -> { v, a } */
  const file = [];
  let enCours = null;
  const departs = [];
  const frais = (e, t) => {
    if (!e) return false;
    if (e.v.etat === 'FIXE') return true;
    const d = e.v.etat === 'PEUT_CROITRE' ? DUREE_PEUT_CROITRE_MS : e.v.etat === 'INCERTAIN' ? DUREE_INCERTAIN_MS : DUREE_NON_LU_MS;
    return t - e.a < d;
  };
  async function pomper() {
    if (enCours) return;
    while (file.length) {
      const t = maintenant();
      while (departs.length && t - departs[0] > 60000) departs.shift();
      if (departs.length >= parMinute) return; /* the next demande pumps again */
      const { jeton, contexte } = file.shift();
      departs.push(t);
      enCours = jeton;
      let v;
      /* `precedent` = the last verdict for this token (review 2026-11-12): a re-check reuses the creation block it found, instead of
       *   a new bisection (~26 eth_call at past blocks) every 30 min for a token the server's index does not hold */
      const avant = cache.get(jeton);
      try { v = await verifier({ jeton, precedent: avant ? avant.v : null, ...(contexte ? contexte() : {}) }); }
      catch (e) { v = { etat: 'NON_LU', jeton, pourquoi: String((e && e.message) || e).slice(0, 160) }; }
      cache.set(jeton, { v, a: maintenant() });
      if (v && v.etat === 'FIXE' && typeof surFixe === 'function') { try { surFixe(jeton, v); } catch (_) { /* saving never breaks a read */ } }
      enCours = null;
    }
  }
  /** The verdict to serve now: { v, frais, enCours }. Starts a check when none is fresh. */
  function demander(jeton, contexte = null) {
    const j = bas(jeton);
    if (!ADR.test(j)) return { v: { etat: 'NON_LU', jeton: j, pourquoi: 'not an address' }, frais: true, enCours: false };
    const e = cache.get(j);
    const t = maintenant();
    if (frais(e, t)) return { v: e.v, frais: true, enCours: false };
    if (enCours !== j && !file.some((x) => x.jeton === j)) { file.push({ jeton: j, contexte }); if (file.length > 200) file.shift(); }
    pomper().catch(() => {});
    return { v: e ? e.v : null, frais: false, enCours: true };
  }
  /** FIXE verdicts to save, and to load back after a restart (only FIXE: the one verdict that cannot go stale). */
  const exporter = () => [...cache].filter(([, e]) => e.v && e.v.etat === 'FIXE').map(([j, e]) => [j, e.v]);
  function importer(entrees) {
    let n = 0;
    for (const x of Array.isArray(entrees) ? entrees : []) {
      const [j, v] = Array.isArray(x) ? x : [];
      if (ADR.test(bas(j)) && v && v.etat === 'FIXE' && bas(v.jeton) === bas(j)) { cache.set(bas(j), { v, a: maintenant() }); n++; }
    }
    return n;
  }
  /* tests only: wait for the check in flight (a file held back by the per-minute cap stays queued) */
  return { demander, exporter, importer, _attendre: async () => { await new Promise((ok) => setTimeout(ok, 0)); while (enCours) await new Promise((ok) => setTimeout(ok, 5)); } };
}
