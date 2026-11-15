/* lp-lock-keeper.js -- the server keeper of the LP lock (TBlockLPLock), approved by Phil on 2026-11-15:
 *   "Keeper hebdo. Collecter les frais et compter les joueurs chaque semaine."
 * Two parts, both SERVER ONLY (this file is never served to a browser):
 *
 * 1. THE INDEX (creerIndexLpLock) -- reads the lock's own Locked / Unlocked events from its deploy block, in windows of at most `pas`
 *    blocks (45,000 by default, under the 50,000 public nodes accept), ONE address per filter (the lock), and keeps:
 *      - the positions currently held by the lock (tokenId -> locker), the last event of each tokenId wins (block, log index);
 *      - every address that ever locked (a locker keeps its locked liquidity in its weeks after an unlock: it may still be counted).
 *    Only logs EMITTED BY the lock address are applied (an event names anyone, only its emitter is checked); `removed` logs are skipped.
 *    A window that fails is NOT consumed: the cursor stays and the window is read again at the next round (never read as empty).
 *    exporter()/restaurer() let the server keep it on its volume; a file for another lock, another deploy block, or with a cursor past
 *    the head is refused (the index then reads again from the deploy block: a bad file costs a re-read, never a lost position).
 *    The index is a HINT for discovery: every id and every holder is checked ON CHAIN before anything is sent (positionOf,
 *    lockedLiquidityIn, weightOf), and the card checks every id it is given on chain too.
 *
 * 2. THE KEEPER (creerKeeperLpLock) -- WHAT IT DOES, AND NOTHING ELSE:
 *   - WITHOUT a key, or with a key whose address is not the gas-only keeper named by the caller (the buyback keeper of its record):
 *     nothing (OFF, and why; the key value is never shown, logged or returned).
 *   - WITH it, every `intervalleMs` (10 min):
 *     a. COUNT: once week e = current - 1 has ended + `apresFinS` (1 h), and until `finGraceS` (30 min) before its 6-day count window
 *        (MARK_GRACE, read on chain) closes: markWeekBatch(e, holders) for the indexed lockers whose lockedLiquidityIn(holder, e) > 0
 *        and weightOf(e, holder) == 0, in lots of `lotMark` (<= 200, the contract's MAX_MARK). The call is SIMULATED first and its
 *        return (how many it would mark) read: 0 -> nothing is sent (nobody in that lot played that week).
 *     b. HARVEST: in the last `avantFinS` (6 h) of the current week c: harvest(ids) of the indexed positions that are, ON CHAIN,
 *        held for week c (positionOf(id).locker != 0, startEpoch <= c < endEpoch) and not harvested since that window opened
 *        (lastHarvestOf(id) < end(c) - avantFinS: survives a restart), in lots of `lotHarvest` (<= 50, the contract's MAX_HARVEST).
 *        So the fees of the week land in THAT week's pot (pot(c)), the one its players are counted for. A tx mined after the week ended
 *        puts them in the next week's pot: nothing is lost, the margin keeps that rare.
 *        Why 6 h: the round runs every 10 min, so the window gives ~36 rounds to send and see every lot included, even with a slow node
 *        or a failed send, while the fees of the last 6 h still go to the next week's harvest (not lost, just a week later).
 *   - ONE transaction per round at most; a simulation that reverts means "not yet / nothing to do": never a failure, never sent.
 *   - NEVER THE SAME THING TWICE in a window: ids / holders of a send are remembered for that week until its receipt; a mined revert
 *     (nothing happened) frees them to be tried again; a tx not seen included in time keeps them while it may still land, and frees
 *     them once it cannot (its nonce used by another tx, or the node no longer holds it) — re-sending is safe, the chain filters first.
 *   - REVIEW 2026-11-15: no harvest in the last 10 min of the week; a lot above the gas cap is split in halves (down to 1 item);
 *     count verdicts that cannot change for a finished week (no liquidity, already counted) are not read again, "did not play" is read
 *     again after 6 h; the index stays `confirmations` blocks under the head and reports itself stale after 15 min without a good read.
 *   - ONLY EVER: harvest(uint256[]) or markWeekBatch(uint256,address[]) to the lock address given, value 0, the given chain,
 *     gas <= gasMaxParTx, fee <= maxFeeWei; verifierEnvoi() decodes the calldata and throws BEFORE the signature otherwise.
 *     It never sends ETH or a token, never calls lock / unlock / claim / rollover / sweep / anything else.
 *   - The same key runs the buyback, Spin and close keepers: every send goes through `exclusif` (one shared lock), no nonce taken twice.
 *   - STOP after `echecsMax` failures in a row (a mined revert, a send refused, a tx never included), until a restart. */
import { selecteur, topic } from './keccak.js';
import { adresseDe } from './signeur-secp256k1.js';
import { signerEip1559 } from './tx-eip1559.js';

export const SEL_HARVEST = selecteur('harvest(uint256[])').toLowerCase();
export const SEL_MARK = selecteur('markWeekBatch(uint256,address[])').toLowerCase();
export const TOPIC_LOCKED = topic('Locked(address,uint256,uint256,uint256,uint256)').toLowerCase();
export const TOPIC_UNLOCKED = topic('Unlocked(address,uint256)').toLowerCase();
/* the contract's own caps (TBlockLPLock.sol MAX_HARVEST, MAX_MARK) */
export const MAX_HARVEST = 50, MAX_MARK = 200;
/* stopAvantFinS: no harvest is sent in the last 10 min of the week (a tx mined after the end would put its fees in the next pot).
 * revoirNonJoueS: a holder whose count simulation said "nothing to mark" (did not play) is read again only after 6 h (RPC budget). */
export const BORNES_DEFAUT = Object.freeze({ intervalleMs: 600000, gasMaxParTx: 8000000n, maxFeeWei: 2000000000n, prioWeiMax: 1000000n,
  echecsMax: 3, inclusionMaxMs: 120000, avantFinS: 21600n, stopAvantFinS: 600n, apresFinS: 3600n, finGraceS: 1800n, lotHarvest: 25, lotMark: 100,
  retardIndexMax: 9000, revoirNonJoueS: 21600n });
/* the index never reads the last `confirmations` blocks (an unsafe head can still be replaced; the card scans that tail itself), and
 *   says it is NOT caught up when its last good read is older than `fraicheurMs` (a node that stopped answering must not look fresh) */
export const INDEX_DEFAUT = Object.freeze({ confirmations: 300, fraicheurMs: 900000 });

const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x == null ? '' : x).toLowerCase();
const adr = (x) => (ADR.test(bas(x)) ? bas(x) : null);
const u = (n) => BigInt(n).toString(16).padStart(64, '0');
const ua = (a) => bas(a).replace(/^0x/, '').padStart(64, '0');
const mot = (h, i = 0) => { const m = String(h || '').replace(/^0x/, '').slice(64 * i, 64 * (i + 1)); return m.length === 64 ? BigInt('0x' + m) : null; };
const msg = (e) => String((e && e.message) || e).slice(0, 240);
const S = (sig) => selecteur(sig).toLowerCase();
const SEL_LECTURE = Object.freeze({ currentEpoch: S('currentEpoch()'), epochEnd: S('epochEnd(uint256)'), MARK_GRACE: S('MARK_GRACE()'),
  positionOf: S('positionOf(uint256)'), lockedLiquidityIn: S('lockedLiquidityIn(address,uint256)'), weightOf: S('weightOf(uint256,address)'),
  lastHarvestOf: S('lastHarvestOf(uint256)') });
export { SEL_LECTURE };

/** harvest(uint256[] ids) calldata */
export function donneesHarvest(ids) {
  const l = [...ids].map((x) => BigInt(x));
  return SEL_HARVEST + u(0x20) + u(l.length) + l.map(u).join('');
}
/** markWeekBatch(uint256 e, address[] holders) calldata */
export function donneesMark(e, holders) {
  const l = [...holders].map((h) => { const a = adr(h); if (!a) throw new Error('not an address: ' + h); return a; });
  return SEL_MARK + u(e) + u(0x40) + u(l.length) + l.map(ua).join('');
}

/** decodes the calldata the keeper may send, or throws: { quoi: 'harvest', ids } | { quoi: 'mark', e, holders }. Exact length, canonical
 *  offsets, 1..MAX items, address words with 12 zero bytes. Anything else is refused. Pure. */
export function decoderDonnees(data) {
  const d = bas(data);
  if (!/^0x[0-9a-f]*$/.test(d) || (d.length - 10) % 64 !== 0) throw new Error('lp-lock keeper: malformed calldata');
  const w = (i) => BigInt('0x' + d.slice(10 + 64 * i, 74 + 64 * i));
  const nMots = (d.length - 10) / 64;
  if (d.startsWith(SEL_HARVEST)) {
    if (nMots < 3 || w(0) !== 0x20n) throw new Error('lp-lock keeper: harvest offset');
    const n = w(1);
    if (n < 1n || n > BigInt(MAX_HARVEST) || BigInt(nMots) !== 2n + n) throw new Error('lp-lock keeper: harvest length');
    const ids = []; for (let i = 0; i < Number(n); i++) ids.push(w(2 + i));
    return { quoi: 'harvest', ids };
  }
  if (d.startsWith(SEL_MARK)) {
    if (nMots < 4 || w(1) !== 0x40n) throw new Error('lp-lock keeper: markWeekBatch offset');
    const n = w(2);
    if (n < 1n || n > BigInt(MAX_MARK) || BigInt(nMots) !== 3n + n) throw new Error('lp-lock keeper: markWeekBatch length');
    const holders = [];
    for (let i = 0; i < Number(n); i++) { const m = d.slice(10 + 64 * (3 + i), 74 + 64 * (3 + i)); if (!m.startsWith('0'.repeat(24))) throw new Error('lp-lock keeper: not an address word'); holders.push('0x' + m.slice(24)); }
    return { quoi: 'mark', e: w(0), holders };
  }
  throw new Error('lp-lock keeper: only harvest(uint256[]) and markWeekBatch(uint256,address[]) are ever sent');
}

/** throws BEFORE any signature unless tx is exactly harvest(ids) or markWeekBatch(e, holders) to the lock, value 0, this chain, caps */
export function verifierEnvoi(tx, { lock, chainId, bornes = BORNES_DEFAUT }) {
  const L = adr(lock);
  if (!L || bas(tx.to) !== L) throw new Error('lp-lock keeper: destination is not the LP lock');
  if (BigInt(tx.value || 0) !== 0n) throw new Error('lp-lock keeper: value must be 0');
  if (BigInt(tx.chainId) !== BigInt(chainId)) throw new Error('lp-lock keeper: wrong chain');
  const q = decoderDonnees(tx.data);
  if (q.quoi === 'harvest' && q.ids.length > Number(bornes.lotHarvest)) throw new Error('lp-lock keeper: harvest lot above the cap');
  if (q.quoi === 'mark' && q.holders.length > Number(bornes.lotMark)) throw new Error('lp-lock keeper: mark lot above the cap');
  if (BigInt(tx.gas) > BigInt(bornes.gasMaxParTx)) throw new Error('lp-lock keeper: gas above the cap');
  if (BigInt(tx.maxFeePerGas) > BigInt(bornes.maxFeeWei)) throw new Error('lp-lock keeper: fee above the cap');
  return q;
}

/** Pure: what may be done now. mark = the week to count (current - 1) or null; harvest = true in the last avantFinS of the current week. */
export function deciderLpLock({ maintenantS, courant, finCourante, finPrecedente, graceS, bornes = BORNES_DEFAUT }) {
  const t = BigInt(maintenantS), c = BigInt(courant);
  const out = { mark: null, harvest: false, pourquoiMark: null, pourquoiHarvest: null };
  if (c === 0n || finPrecedente === null || finPrecedente === undefined) out.pourquoiMark = 'no finished week yet';
  else {
    const f = BigInt(finPrecedente);
    if (t < f + BigInt(bornes.apresFinS)) out.pourquoiMark = 'week ' + (c - 1n) + ' ended, waiting for the margin';
    else if (t >= f + BigInt(graceS) - BigInt(bornes.finGraceS)) out.pourquoiMark = 'week ' + (c - 1n) + ' count window closing or closed';
    else out.mark = c - 1n;
  }
  const fc = BigInt(finCourante);
  if (t < fc - BigInt(bornes.avantFinS)) out.pourquoiHarvest = 'week ' + c + ' harvest opens ' + (fc - BigInt(bornes.avantFinS)).toString();
  else if (t >= fc - BigInt(bornes.stopAvantFinS ?? 0n)) out.pourquoiHarvest = 'week ' + c + ' over or about to end: no harvest sent now';
  else out.harvest = true;
  return out;
}

/* ════════════════════════════════════════════════ the index ════════════════════════════════════════════════ */
/**
 * lock = the LP lock address; bloc = its deploy block; rpcLogs(method, params, tete) reads eth_getLogs (the server routes deep windows
 * to its archive node by `tete`); pas <= 50,000; fenetresParTour = windows read per call of avancer().
 */
export function creerIndexLpLock({ lock = null, bloc = null, rpcLogs = null, pas = 45000, fenetresParTour = 12, journal = () => {}, maintenant = () => Date.now(),
  confirmations = INDEX_DEFAUT.confirmations, fraicheurMs = INDEX_DEFAUT.fraicheurMs } = {}) {
  const L = adr(lock), B = Number(bloc);
  const actif = Boolean(L && Number.isSafeInteger(B) && B > 0 && typeof rpcLogs === 'function');
  const P = Math.max(1, Math.min(50000, Number(pas) || 45000));
  const CONF = Math.max(0, Math.floor(Number(confirmations) || 0)), FRAIS = Math.max(1, Number(fraicheurMs) || INDEX_DEFAUT.fraicheurMs);
  const st = { jusqua: actif ? B - 1 : null, teteVue: null, positions: new Map(), lockers: new Set(), fenetresLues: 0, fenetresRatees: 0,
    logsAppliques: 0, logsIgnores: 0, lu: null, luMs: null, erreur: null, restaure: false, refusRestauration: null, change: 0 };
  /* caught up = read up to the last readable head seen (head - confirmations), within `retard`, AND that read is recent */
  const frais = () => st.luMs !== null && maintenant() - st.luMs <= FRAIS;
  const ajour = (retard = 0) => actif && st.teteVue !== null && st.jusqua >= st.teteVue - Number(retard) && frais();
  let enCours = false;
  const cleOrdre = (bn, li) => [Number(bn), Number(li)];
  const avant = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

  /** applies logs (any order): only the lock's own Locked / Unlocked, not removed; the last event of each tokenId wins */
  function appliquer(logs) {
    const bons = [];
    for (const l of logs || []) {
      if (!l || l.removed === true || bas(l.address) !== L || !Array.isArray(l.topics) || l.topics.length < 3) { st.logsIgnores += 1; continue; }
      const t0 = bas(l.topics[0]);
      if (t0 !== TOPIC_LOCKED && t0 !== TOPIC_UNLOCKED) { st.logsIgnores += 1; continue; }
      let bn, li; try { bn = Number(BigInt(l.blockNumber)); li = Number(BigInt(l.logIndex)); } catch (_) { st.logsIgnores += 1; continue; }
      const t1 = bas(l.topics[1]).replace(/^0x/, ''), t2 = bas(l.topics[2]);
      if (!/^0{24}[0-9a-f]{40}$/.test(t1)) { st.logsIgnores += 1; continue; }
      bons.push({ verrou: t0 === TOPIC_LOCKED, locker: '0x' + t1.slice(24), id: BigInt(t2).toString(), ou: cleOrdre(bn, li) });
    }
    bons.sort((a, b) => (avant(a.ou, b.ou) ? -1 : avant(b.ou, a.ou) ? 1 : 0));
    for (const x of bons) {
      const p = st.positions.get(x.id);
      if (p && !avant(p.ou, x.ou)) continue; /* already applied (a window read twice) or older */
      st.positions.set(x.id, { locker: x.locker, actif: x.verrou, ou: x.ou });
      if (x.verrou) st.lockers.add(x.locker);
      st.logsAppliques += 1; st.change += 1;
    }
  }

  /** reads up to fenetresParTour windows from the cursor towards `tete` (a number). A failed window stops the round (cursor kept). */
  async function avancer(tete) {
    if (!actif) return { lues: 0, pourquoi: 'no LP lock recorded' };
    if (enCours) return { lues: 0, pourquoi: 'already reading' };
    const T = Number(tete);
    if (!Number.isSafeInteger(T) || T <= 0) return { lues: 0, pourquoi: 'head not read' };
    enCours = true;
    let lues = 0;
    try {
      if (st.jusqua > T) { st.erreur = 'the saved cursor ' + st.jusqua + ' is past the head ' + T + ': read again from the deploy block'; journal('[lp-lock-index] ' + st.erreur); reinitialiser(); }
      /* the readable head: `confirmations` blocks under the head (never past it, never before the deploy block's predecessor) */
      const Tc = Math.max(B - 1, T - CONF);
      st.teteVue = Math.max(st.teteVue || 0, Tc);
      for (let k = 0; k < fenetresParTour && st.jusqua < Tc; k++) {
        const de = st.jusqua + 1, a = Math.min(Tc, de + P - 1);
        let logs;
        try {
          logs = await rpcLogs('eth_getLogs', [{ address: L, topics: [[TOPIC_LOCKED, TOPIC_UNLOCKED]], fromBlock: '0x' + de.toString(16), toBlock: '0x' + a.toString(16) }], T);
          if (!Array.isArray(logs)) throw new Error('not a list');
        } catch (e) { st.fenetresRatees += 1; st.erreur = 'window ' + de + '-' + a + ' not read: ' + msg(e).slice(0, 160); return { lues, pourquoi: st.erreur }; }
        appliquer(logs);
        st.jusqua = a; st.fenetresLues += 1; lues += 1; st.change += 1;
      }
      st.luMs = maintenant(); st.lu = new Date(st.luMs).toISOString();
      if (st.jusqua >= Tc) st.erreur = null;
      return { lues, pourquoi: null };
    } finally { enCours = false; }
  }
  function reinitialiser() { st.jusqua = B - 1; st.positions = new Map(); st.lockers = new Set(); st.change += 1; }

  return {
    actif,
    avancer,
    appliquer,
    /** caught up with the last readable head seen (head - confirmations), within `retard` blocks, read less than fraicheurMs ago */
    aJour: ajour,
    confirmations: CONF,
    jusqua: () => st.jusqua,
    /** positions held by the lock per the index: [{ tokenId: bigint, locker }] */
    verrouilles: () => [...st.positions].filter(([, p]) => p.actif).map(([id, p]) => ({ tokenId: BigInt(id), locker: p.locker })).sort((x, y) => (x.tokenId < y.tokenId ? -1 : 1)),
    /** every address that ever locked (sorted) */
    lockers: () => [...st.lockers].sort(),
    /** the ids held for `wallet` per the index (strings, sorted) */
    positionsDe(wallet) { const w = adr(wallet); if (!w) return []; return [...st.positions].filter(([, p]) => p.actif && p.locker === w).map(([id]) => id).sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1)); },
    version: () => st.change,
    etat: () => ({ actif, lock: L, depuis: actif ? B : null, jusqua: st.jusqua, teteVue: st.teteVue, aJour: ajour(0), confirmations: CONF,
      positions: [...st.positions.values()].filter((p) => p.actif).length, lockers: st.lockers.size, fenetresLues: st.fenetresLues, fenetresRatees: st.fenetresRatees,
      logsAppliques: st.logsAppliques, logsIgnores: st.logsIgnores, lu: st.lu, erreur: st.erreur, restaure: st.restaure, refusRestauration: st.refusRestauration }),
    exporter: () => ({ v: 1, lock: L, bloc: B, jusqua: st.jusqua, positions: [...st.positions].map(([id, p]) => [id, p.locker, p.actif ? 1 : 0, p.ou[0], p.ou[1]]), lockers: [...st.lockers] }),
    /** restores a saved index; refused (and said) unless same lock, same deploy block, sane values. Returns true when restored. */
    restaurer(o) {
      const refus = (t) => { st.refusRestauration = t; return false; };
      if (!actif) return refus('no LP lock recorded');
      if (!o || o.v !== 1 || bas(o.lock) !== L || Number(o.bloc) !== B) return refus('another lock, deploy block or version');
      if (!Number.isSafeInteger(o.jusqua) || o.jusqua < B - 1 || !Array.isArray(o.positions) || !Array.isArray(o.lockers)) return refus('malformed');
      const pos = new Map(), lk = new Set();
      for (const x of o.positions) {
        if (!Array.isArray(x) || x.length !== 5 || !/^\d{1,78}$/.test(String(x[0])) || !adr(x[1]) || !Number.isSafeInteger(x[3]) || !Number.isSafeInteger(x[4])) return refus('malformed position');
        pos.set(String(x[0]), { locker: adr(x[1]), actif: x[2] === 1, ou: [x[3], x[4]] });
      }
      for (const a of o.lockers) { if (!adr(a)) return refus('malformed locker'); lk.add(adr(a)); }
      for (const p of pos.values()) if (p.actif) lk.add(p.locker);
      st.jusqua = o.jusqua; st.positions = pos; st.lockers = lk; st.restaure = true; st.refusRestauration = null;
      return true;
    },
  };
}

/* ════════════════════════════════════════════════ the keeper ════════════════════════════════════════════════ */
/**
 * lock = the LP lock address; index = creerIndexLpLock(...) for that lock; chaine = chain id; keeperAttendu = the only address this
 * keeper may run as; cle from process.env only; rpc reads; rpcEnvoi sends; exclusif(fn) = the lock shared with the other keepers.
 */
export function creerKeeperLpLock({ cle = null, lock = null, index = null, chaine = null, keeperAttendu = null, rpc = null, rpcEnvoi = null,
  journal = () => {}, bornes: bIn = {}, maintenant = () => Date.now(), exclusif = (fn) => fn(), desactive = null } = {}) {
  const bornes = { ...BORNES_DEFAUT, ...bIn };
  const indexEtat = () => (index && typeof index.etat === 'function' ? index.etat() : null);
  const off = (pourquoi) => ({ etat: () => ({ etat: 'OFF', pourquoi, adresse: null, index: indexEtat() }), tour: async () => ({ fait: false, pourquoi }), demarrer: () => false, arreter: () => {} });
  if (desactive) return off(String(desactive));
  const L = adr(lock);
  if (!L) return off('no LP lock is recorded: nothing is harvested or counted');
  if (!index || index.actif !== true) return off('no LP lock index: nothing is harvested or counted');
  if (!cle) return off('no keeper key is set: the server harvests and counts nothing (anyone may from the app)');
  if (!adr(keeperAttendu)) return off('no gas-only keeper address is named: nothing is harvested or counted');
  if (typeof rpc !== 'function') return off('no RPC reader');
  if (Number(bornes.lotHarvest) < 1 || Number(bornes.lotHarvest) > MAX_HARVEST || Number(bornes.lotMark) < 1 || Number(bornes.lotMark) > MAX_MARK) return off('lot sizes outside the contract caps');
  let moi;
  try { moi = bas(adresseDe(cle)); } catch (_) { return off('the keeper key is malformed (its value is never shown)'); }
  if (moi !== adr(keeperAttendu)) return off('the keeper key is not the gas-only keeper ' + adr(keeperAttendu) + ': nothing is harvested or counted');
  const envoi = typeof rpcEnvoi === 'function' ? rpcEnvoi : rpc;
  const chainId = Number(chaine);
  const st = { etat: 'ON', adresse: moi, lock: L, chaineVue: false, enVol: null, echecsSuite: 0, arret: null, grace: null,
    compteurs: { tours: 0, envois: 0, inclus: 0, reverts: 0, refusSimulation: 0, rienAFaire: 0, lecturesRatees: 0, envoisRefuses: 0, nonInclus: 0, horsPlafondGas: 0,
      lotsCoupes: 0, liberes: 0, lecturesEvitees: 0 },
    dernier: null, attente: {}, erreurs: [] };
  /* what was sent per week and not settled: 'harvest:<e>' -> Set(id), 'mark:<e>' -> Set(holder). Freed by a mined revert, or once the tx
   *   is known NOT to be coming (its nonce used by another tx, or the node no longer holds it): re-sending is then safe, because every
   *   item is filtered on chain first (weightOf, lastHarvestOf) and the contract skips what is already done. */
  const envoyes = new Map();
  const deja = (k) => { if (!envoyes.has(k)) envoyes.set(k, new Set()); return envoyes.get(k); };
  /* txs not seen included in time: { hash, nonce, cle, items, quoi } — their items stay reserved until their fate is read */
  const douteux = [];
  /* count verdicts per week that need no new read: 'e' -> Map(holder -> true (final: no liquidity in e, or already counted) | seconds
   *   until which it is not read again (its count simulation said it would mark nothing: did not play)). lockedLiquidityIn(h, e) is final
   *   once e ended (the lock only writes weeks from next week on) and weightOf(e, h) is set once; playOf may still be read late, so a
   *   "did not play" verdict is only kept `revoirNonJoueS`. */
  const verdicts = new Map();
  const verdictsDe = (e) => { const k = String(e); if (!verdicts.has(k)) verdicts.set(k, new Map()); return verdicts.get(k); };
  const semaineDe = (k) => { const m = /:(\d+)$/.exec(k); return m ? BigInt(m[1]) : null; };
  /** forgets what belongs to weeks before `garder` (a small memory, bounded) */
  function oublierAvant(garder) {
    for (const k of [...envoyes.keys()]) { const e = semaineDe(k); if (e !== null && e < garder) envoyes.delete(k); }
    for (const k of [...verdicts.keys()]) if (BigInt(k) < garder) verdicts.delete(k);
    for (let i = douteux.length - 1; i >= 0; i--) { const e = semaineDe(douteux[i].cle); if (e !== null && e < garder) douteux.splice(i, 1); }
  }
  const liberer = (v) => { const s = deja(v.cle); for (const x of v.items) s.delete(x); };
  let minuteur = null, enCours = false;
  const erreur = (t) => { st.erreurs.push({ a: new Date(maintenant()).toISOString(), t }); if (st.erreurs.length > 20) st.erreurs.shift(); journal('[lp-lock-keeper] ' + t); };
  const echec = (t) => { st.echecsSuite += 1; erreur(t); if (st.echecsSuite >= bornes.echecsMax) { st.etat = 'ARRETE'; st.arret = { a: new Date(maintenant()).toISOString(), pourquoi: st.echecsSuite + ' failures in a row: stopped until a restart' }; erreur(st.arret.pourquoi); } };
  const appel = async (data) => rpc('eth_call', [{ to: L, data }, 'latest']);
  const lit = async (data, i = 0) => { const r = mot(await appel(data), i); if (r === null) throw new Error('a lock read failed'); return r; };

  function appliquerRecu(v, recu, { dejaCompte = false } = {}) {
    if (String(recu.status) === '0x1') { st.compteurs.inclus += 1; st.echecsSuite = 0; st.dernier = { a: new Date(maintenant()).toISOString(), hash: v.hash, quoi: v.quoi }; journal('[lp-lock-keeper] ' + v.quoi + ', tx ' + v.hash); }
    else { st.compteurs.reverts += 1; liberer(v); if (dejaCompte) erreur(v.quoi + ' tx ' + v.hash + ' reverted on chain (late)'); else echec(v.quoi + ' tx ' + v.hash + ' reverted on chain'); }
  }
  async function suivre() {
    const v = st.enVol;
    const recu = await rpc('eth_getTransactionReceipt', [v.hash]).catch(() => null);
    if (!recu) {
      if (maintenant() - v.a > bornes.inclusionMaxMs) {
        st.enVol = null; st.compteurs.nonInclus += 1; douteux.push(v);
        echec(v.quoi + ' tx ' + v.hash + ' not included after ' + bornes.inclusionMaxMs + ' ms: its items stay reserved until its nonce is used or the node drops it');
      }
      return;
    }
    st.enVol = null; appliquerRecu(v, recu);
  }
  /** the txs not seen in time: included late (receipt), or known never to come (nonce used by another tx: latest > nonce; or the node
   *   no longer holds it: pending <= nonce) -> their items are freed. Otherwise (still pending) they stay reserved. Counts read FIRST. */
  async function revoirDouteux() {
    if (!douteux.length) return;
    let latest, pending;
    try { latest = BigInt(await rpc('eth_getTransactionCount', [moi, 'latest'])); pending = BigInt(await rpc('eth_getTransactionCount', [moi, 'pending'])); }
    catch (_) { return; }
    for (const v of douteux.slice()) {
      const recu = await rpc('eth_getTransactionReceipt', [v.hash]).catch(() => null);
      const retirer = () => { const i = douteux.indexOf(v); if (i >= 0) douteux.splice(i, 1); };
      if (recu) { retirer(); appliquerRecu(v, recu, { dejaCompte: true }); continue; }
      if (latest > v.nonce || pending <= v.nonce) {
        retirer(); liberer(v); st.compteurs.liberes += 1;
        journal('[lp-lock-keeper] ' + v.quoi + ' tx ' + v.hash + ' will not be included (nonce ' + v.nonce + ', latest ' + latest + ', pending ' + pending + '): its items may be sent again');
      }
    }
  }

  const TROP = Object.freeze({ trop: true });
  /** simulate, estimate, cap, sign, send ONE tx; returns the round's answer, null when this lot is not sent (try the next), or TROP when
   *   its gas is above the cap (the caller splits the lot) */
  async function envoyer({ data, quoi, cle: k, items, base }) {
    let estime;
    try { estime = BigInt(await rpc('eth_estimateGas', [{ from: moi, to: L, data }])); }
    catch (e) { st.compteurs.refusSimulation += 1; st.attente[quoi] = 'estimate refused: ' + msg(e).slice(0, 80); return null; }
    const gas = (estime * 12n) / 10n;
    if (gas > BigInt(bornes.gasMaxParTx)) { st.compteurs.horsPlafondGas += 1; st.attente[quoi] = 'gas ' + gas + ' above the cap for ' + items.length + ' item(s)' + (items.length > 1 ? ': split' : ': not sent'); return TROP; }
    let prio = 0n;
    try { prio = BigInt(await rpc('eth_maxPriorityFeePerGas', [])); } catch (_) { prio = 0n; }
    if (prio > BigInt(bornes.prioWeiMax)) prio = BigInt(bornes.prioWeiMax);
    if (base + prio > BigInt(bornes.maxFeeWei)) return { fait: false, pourquoi: 'gas price above the cap' };
    const maxFee = 2n * base + prio > BigInt(bornes.maxFeeWei) ? BigInt(bornes.maxFeeWei) : 2n * base + prio;
    return exclusif(async () => {
      const nonce = BigInt(await rpc('eth_getTransactionCount', [moi, 'pending']));
      const tx = { chainId, nonce, maxPriorityFeePerGas: prio, maxFeePerGas: maxFee, gas, to: L, value: 0n, data };
      verifierEnvoi(tx, { lock: L, chainId, bornes });
      const signe = signerEip1559(tx, cle);
      if (bas(signe.de) !== moi) throw new Error('lp-lock keeper: the signature does not recover the keeper address');
      try { await envoi('eth_sendRawTransaction', [signe.brut]); }
      catch (e) { if (!/already known|known transaction/i.test(msg(e))) { st.compteurs.envoisRefuses += 1; echec('send refused: ' + msg(e)); return { fait: false, pourquoi: 'send refused' }; } }
      const s = deja(k); for (const x of items) s.add(x);
      st.enVol = { hash: signe.hash, nonce, quoi, cle: k, items: items.slice(), a: maintenant() };
      st.compteurs.envois += 1;
      return { fait: true, hash: signe.hash, quoi, n: items.length };
    });
  }

  /** one count lot: simulated (how many it would mark), then sent; above the gas cap it is split in two halves, each simulated again */
  async function lotMark(e, lot, base, ts) {
    const data = donneesMark(e, lot);
    let n;
    try { n = mot(await rpc('eth_call', [{ from: moi, to: L, data }, 'latest'])); }
    catch (err) { st.compteurs.refusSimulation += 1; st.attente.mark = 'week ' + e + ': simulation refused: ' + msg(err).slice(0, 80); return null; }
    if (n === null || n === 0n) {
      st.compteurs.rienAFaire += 1; st.attente.mark = 'week ' + e + ': ' + lot.length + ' locker(s) with liquidity, none played: nothing to count';
      const v = verdictsDe(e), jusqua = BigInt(ts) + BigInt(bornes.revoirNonJoueS);
      for (const h of lot) v.set(h, jusqua);
      return null;
    }
    const r = await envoyer({ data, quoi: 'count week ' + e + ' (' + n + ' of ' + lot.length + ')', cle: 'mark:' + e, items: lot, base });
    if (r === TROP) {
      if (lot.length < 2) return null;
      st.compteurs.lotsCoupes += 1;
      const m = Math.ceil(lot.length / 2);
      return (await lotMark(e, lot.slice(0, m), base, ts)) || (await lotMark(e, lot.slice(m), base, ts));
    }
    return r;
  }

  async function essayerMark(e, base, ts) {
    const fait = deja('mark:' + e), v = verdictsDe(e);
    const candidats = index.lockers().filter((h) => !fait.has(h));
    const a = [];
    for (const h of candidats) {
      const vu = v.get(h);
      if (vu === true || (typeof vu === 'bigint' && BigInt(ts) < vu)) { st.compteurs.lecturesEvitees += 1; continue; }
      const liq = await lit(SEL_LECTURE.lockedLiquidityIn + ua(h) + u(e));
      if (liq === 0n) { v.set(h, true); continue; }
      if ((await lit(SEL_LECTURE.weightOf + u(e) + ua(h))) !== 0n) { v.set(h, true); continue; }
      a.push(h);
    }
    if (!a.length) { st.attente.mark = 'week ' + e + ': nobody left to count (or read again later)'; st.compteurs.rienAFaire += 1; return null; }
    for (let i = 0; i < a.length; i += Number(bornes.lotMark)) {
      const r = await lotMark(e, a.slice(i, i + Number(bornes.lotMark)), base, ts);
      if (r) return r;
    }
    return null;
  }

  /** one harvest lot: simulated, then sent; above the gas cap it is split in two halves */
  async function lotHarvest(c, lot, base) {
    const data = donneesHarvest(lot);
    try { await rpc('eth_call', [{ from: moi, to: L, data }, 'latest']); }
    catch (err) { st.compteurs.refusSimulation += 1; st.attente.harvest = 'week ' + c + ': simulation refused: ' + msg(err).slice(0, 80); return null; }
    const r = await envoyer({ data, quoi: 'harvest week ' + c + ' (' + lot.length + ' position' + (lot.length === 1 ? '' : 's') + ')', cle: 'harvest:' + c, items: lot.map(String), base });
    if (r === TROP) {
      if (lot.length < 2) return null;
      st.compteurs.lotsCoupes += 1;
      const m = Math.ceil(lot.length / 2);
      return (await lotHarvest(c, lot.slice(0, m), base)) || (await lotHarvest(c, lot.slice(m), base));
    }
    return r;
  }

  async function essayerHarvest(c, finC, base) {
    const fait = deja('harvest:' + c);
    const ouverture = BigInt(finC) - BigInt(bornes.avantFinS);
    const ids = [];
    for (const { tokenId } of index.verrouilles()) {
      const k = tokenId.toString();
      if (fait.has(k)) continue;
      const h = await appel(SEL_LECTURE.positionOf + u(tokenId));
      const locker = mot(h, 0), debut = mot(h, 2), fin = mot(h, 3);
      if (locker === null || debut === null || fin === null) throw new Error('positionOf not read');
      if (locker === 0n || c < debut || c >= fin) continue;
      if ((await lit(SEL_LECTURE.lastHarvestOf + u(tokenId))) >= ouverture) continue; /* already harvested in this window (by anyone, or before a restart) */
      ids.push(tokenId);
    }
    if (!ids.length) { st.attente.harvest = 'week ' + c + ': no held position left to harvest in this window'; st.compteurs.rienAFaire += 1; return null; }
    for (let i = 0; i < ids.length; i += Number(bornes.lotHarvest)) {
      const r = await lotHarvest(c, ids.slice(i, i + Number(bornes.lotHarvest)), base);
      if (r) return r;
    }
    return null;
  }

  async function tour() {
    if (st.etat !== 'ON') return { fait: false, pourquoi: st.arret ? st.arret.pourquoi : st.etat };
    if (enCours) return { fait: false, pourquoi: 'a round is running' };
    enCours = true; st.compteurs.tours += 1;
    try {
      if (!st.chaineVue) {
        const id = await rpc('eth_chainId', []);
        if (BigInt(id) !== BigInt(chainId)) { st.etat = 'ARRETE'; st.arret = { a: new Date(maintenant()).toISOString(), pourquoi: 'the node serves chain ' + BigInt(id) + ', expected ' + chainId + ': stopped' }; erreur(st.arret.pourquoi); return { fait: false, pourquoi: st.arret.pourquoi }; }
        st.chaineVue = true;
      }
      if (st.enVol) { await suivre(); if (st.enVol || st.etat !== 'ON') return { fait: false, pourquoi: st.enVol ? 'waiting for the transaction in flight' : st.etat }; }
      await revoirDouteux();
      if (st.etat !== 'ON') return { fait: false, pourquoi: st.etat };
      const bloc = await rpc('eth_getBlockByNumber', ['latest', false]);
      const ts = bloc && bloc.timestamp ? BigInt(bloc.timestamp) : null, base = bloc && bloc.baseFeePerGas ? BigInt(bloc.baseFeePerGas) : null;
      const tete = bloc && bloc.number ? Number(BigInt(bloc.number)) : null;
      if (ts === null || base === null || tete === null) { st.compteurs.lecturesRatees += 1; erreur('head not read'); return { fait: false, pourquoi: 'head not read' }; }
      await index.avancer(tete);
      if (!index.aJour(bornes.retardIndexMax)) { st.attente.index = 'the lock index is not caught up (read to ' + index.jusqua() + ', head ' + tete + ')'; return { fait: false, pourquoi: 'the lock index is not caught up' }; }
      st.attente.index = null;
      let c, finC, finP;
      try {
        if (st.grace === null) st.grace = await lit(SEL_LECTURE.MARK_GRACE);
        c = await lit(SEL_LECTURE.currentEpoch);
        finC = await lit(SEL_LECTURE.epochEnd + u(c));
        finP = c > 0n ? await lit(SEL_LECTURE.epochEnd + u(c - 1n)) : null;
      } catch (e) { st.compteurs.lecturesRatees += 1; erreur('weeks not read: ' + msg(e)); return { fait: false, pourquoi: 'weeks not read' }; }
      const d = deciderLpLock({ maintenantS: ts, courant: c, finCourante: finC, finPrecedente: finP, graceS: st.grace, bornes });
      st.attente.mark = d.pourquoiMark; st.attente.harvest = d.pourquoiHarvest;
      oublierAvant(c > 0n ? c - 1n : 0n); /* only weeks c-1 (count) and c (harvest) are ever acted on */
      try {
        if (d.mark !== null) { const r = await essayerMark(d.mark, base, ts); if (r) return r; }
        if (d.harvest) { const r = await essayerHarvest(c, finC, base); if (r) return r; }
      } catch (e) { st.compteurs.lecturesRatees += 1; erreur('positions not read: ' + msg(e)); return { fait: false, pourquoi: 'positions not read' }; }
      return { fait: false, pourquoi: 'nothing to harvest or count' };
    } catch (e) { erreur('round failed: ' + msg(e)); return { fait: false, pourquoi: 'round failed' }; }
    finally { enCours = false; }
  }

  return {
    /** the state the server may publish (/sante): never the key */
    etat: () => ({ etat: st.etat, adresse: st.adresse, lock: st.lock, enVol: st.enVol ? { hash: st.enVol.hash, quoi: st.enVol.quoi, a: st.enVol.a } : null, echecsSuite: st.echecsSuite,
      nonConfirmes: douteux.map((v) => ({ hash: v.hash, quoi: v.quoi, nonce: v.nonce.toString() })),
      arret: st.arret, compteurs: { ...st.compteurs }, attente: { ...st.attente }, dernier: st.dernier ? { ...st.dernier } : null, erreurs: st.erreurs.slice(), index: indexEtat() }),
    tour,
    demarrer() {
      const boucle = async () => { await tour(); if (st.etat === 'ON') { minuteur = setTimeout(boucle, bornes.intervalleMs); minuteur.unref?.(); } };
      minuteur = setTimeout(boucle, 45000); minuteur.unref?.();
      return true;
    },
    arreter() { clearTimeout(minuteur); minuteur = null; },
  };
}
