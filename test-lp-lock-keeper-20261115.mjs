/* test-lp-lock-keeper-20261115.mjs — lp-lock-keeper.js (the LP lock's weekly keeper and its event index), pure parts and a fake chain.
 * AFFIRME:
 *   - the selectors / event topics are the COMPILED TBlockLPLock's; MAX_HARVEST, MAX_MARK, MARK_GRACE are the source's;
 *   - calldata: harvest(ids) and markWeekBatch(e, holders) round-trip through the decoder; verifierEnvoi refuses another destination,
 *     a value, another chain, another selector, extra bytes, a non-canonical offset, an empty or oversized list, a dirty address word,
 *     a lot above the keeper's cap, gas or fee above the caps;
 *   - deciderLpLock: count week c-1 from its end + 1 h until 30 min before its 6-day window closes; harvest only in the last 6 h of c;
 *   - the index: only the lock's OWN Locked/Unlocked logs, never `removed` ones, the last event per id wins whatever the order, a window
 *     read twice changes nothing, windows never exceed `pas` and never start before the deploy block, a failed window keeps the cursor,
 *     a past-head cursor is reset, a saved index for another lock / deploy block is refused, a locker stays a holder after unlocking;
 *   - the keeper (fake chain, a test key held in memory only): OFF without a key / with a key that is not the named keeper / without the
 *     lock or its index, state never holds the key; before the windows nothing is sent; in the harvest window it sends ONE harvest of the
 *     held ids active this week only (the decoded signed tx: to = lock, value 0, chain 8453), waits for the receipt, then sends nothing
 *     more (lastHarvestOf read); in the count window it sends ONE markWeekBatch of the holders with liquidity and no weight, not when the
 *     simulation says it would mark 0; a mined revert frees the lot (resent once), a tx not seen included but still pending is NOT
 *     resent, one the node dropped (pending <= nonce) or whose nonce another tx used (latest > nonce) frees its lot (resent);
 *   - REVIEW 2026-11-15: no harvest in the last 10 min; a lot above the gas cap is split; count verdicts cached (final ones for the
 *     week, "did not play" for 6 h); the index stays `confirmations` blocks under the head and is not "caught up" after 15 min stale;
 *   - MUTANTS (temporary copies of the module, deleted afterwards): each must turn at least one check red.
 * NE PROUVE PAS: the chain (banc-lp-lock-keeper-fork-20261115 does, on a local fork), the prod key, the prod node. */
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { adresseDe } from './signeur-secp256k1.js';
import { keccak256Hex } from './keccak.js';
import { LP_LOCK_DEPLOIEMENT as REC } from './lp-lock-deploiement.js';

const SRC = readFileSync(new URL('./lp-lock-keeper.js', import.meta.url), 'utf8');
const SOL = readFileSync(new URL('./contracts/src/TBlockLPLock.sol', import.meta.url), 'utf8');
const art = JSON.parse(readFileSync(new URL('./contracts/out/TBlockLPLock.sol/TBlockLPLock.json', import.meta.url)));

/* a minimal RLP decoder, to read back what the keeper signed */
function rlpDec(hex) {
  const b = Buffer.from(hex.replace(/^0x/, ''), 'hex');
  const lire = (i) => {
    const p = b[i];
    if (p < 0x80) return [b.subarray(i, i + 1), i + 1];
    if (p <= 0xb7) return [b.subarray(i + 1, i + 1 + p - 0x80), i + 1 + p - 0x80];
    if (p <= 0xbf) { const ll = p - 0xb7; const l = parseInt(b.subarray(i + 1, i + 1 + ll).toString('hex'), 16); return [b.subarray(i + 1 + ll, i + 1 + ll + l), i + 1 + ll + l]; }
    let l, d; if (p <= 0xf7) { l = p - 0xc0; d = i + 1; } else { const ll = p - 0xf7; l = parseInt(b.subarray(i + 1, i + 1 + ll).toString('hex'), 16); d = i + 1 + ll; }
    const out = []; let j = d; while (j < d + l) { const [x, k] = lire(j); out.push(x); j = k; } return [out, d + l];
  };
  return lire(0)[0];
}
function lireTx(brut) {
  const h = brut.replace(/^0x/, ''); if (!h.startsWith('02')) throw new Error('not 1559');
  const f = rlpDec('0x' + h.slice(2)); const n = (x) => (x.length ? BigInt('0x' + x.toString('hex')) : 0n);
  return { chainId: n(f[0]), nonce: n(f[1]), gas: n(f[4]), to: '0x' + f[5].toString('hex'), value: n(f[6]), data: '0x' + f[7].toString('hex') };
}

/* ─────────────────────────────── the checks, run on the module and on each mutant ─────────────────────────────── */
async function verifier(K, { dire = true } = {}) {
  let ok = 0, ko = 0;
  const t = (m, c, vu = '') => { if (c) ok++; else { ko++; if (dire) console.log('KO', m, vu); } };
  const ids = new Set(Object.values(art.methodIdentifiers || {}));
  t('harvest(uint256[]) is in the compiled lock', ids.has(K.SEL_HARVEST.slice(2)));
  t('markWeekBatch(uint256,address[]) is in the compiled lock', ids.has(K.SEL_MARK.slice(2)));
  for (const [k, s] of Object.entries(K.SEL_LECTURE)) t('read selector ' + k + ' is in the compiled lock', ids.has(s.slice(2)), s);
  const sigEv = (nom) => { const e = art.abi.find((x) => x.type === 'event' && x.name === nom); return nom + '(' + e.inputs.map((i) => i.type).join(',') + ')'; };
  t('Locked topic = the compiled event', K.TOPIC_LOCKED === keccak256Hex(new TextEncoder().encode(sigEv('Locked'))));
  t('Unlocked topic = the compiled event', K.TOPIC_UNLOCKED === keccak256Hex(new TextEncoder().encode(sigEv('Unlocked'))));
  const cst = (n) => { const m = new RegExp('uint256 public constant ' + n + ' = ([0-9]+)( days)?;').exec(SOL); return m ? Number(m[1]) * (m[2] ? 86400 : 1) : null; };
  t('MAX_HARVEST = the source', K.MAX_HARVEST === cst('MAX_HARVEST'), cst('MAX_HARVEST'));
  t('MAX_MARK = the source', K.MAX_MARK === cst('MAX_MARK'), cst('MAX_MARK'));
  t('MARK_GRACE is 6 days in the source (the keeper reads it on chain)', cst('MARK_GRACE') === 518400);
  t('default lots within the contract caps', K.BORNES_DEFAUT.lotHarvest <= K.MAX_HARVEST && K.BORNES_DEFAUT.lotMark <= K.MAX_MARK);

  /* calldata */
  const LK = '0x' + 'ab'.repeat(20), X = '0x' + '33'.repeat(20), H1 = '0x' + '11'.repeat(20), H2 = '0x' + '22'.repeat(20);
  const dh = K.donneesHarvest([7n, 9n]);
  const qh = K.decoderDonnees(dh);
  t('harvest round-trip', qh.quoi === 'harvest' && qh.ids.join() === '7,9');
  const dm = K.donneesMark(4n, [H1, H2]);
  const qm = K.decoderDonnees(dm);
  t('markWeekBatch round-trip', qm.quoi === 'mark' && qm.e === 4n && qm.holders.join() === [H1, H2].join());
  const tx = { to: LK, value: 0n, chainId: 8453, data: dh, gas: 100000n, maxFeePerGas: 1000n };
  const refuse = (m) => { try { K.verifierEnvoi({ ...tx, ...m }, { lock: LK, chainId: 8453 }); return false; } catch (_) { return true; } };
  t('admitted: harvest to the lock', !refuse({}));
  t('admitted: markWeekBatch to the lock', !refuse({ data: dm }));
  t('refused: another address', refuse({ to: X }));
  t('refused: value', refuse({ value: 1n }));
  t('refused: other chain', refuse({ chainId: 1 }));
  t('refused: another selector (transfer)', refuse({ data: '0xa9059cbb' + '0'.repeat(128) }));
  t('refused: claim(uint256) of the lock', refuse({ data: '0x379607f5' + '0'.repeat(64) }));
  t('refused: extra bytes', refuse({ data: dh + '00'.repeat(32) }));
  t('refused: a non-canonical offset', refuse({ data: K.SEL_HARVEST + (0x40).toString(16).padStart(64, '0') + dh.slice(74) }));
  t('refused: an empty list', refuse({ data: K.SEL_HARVEST + (0x20).toString(16).padStart(64, '0') + '0'.repeat(64) }));
  t('refused: 51 ids', refuse({ data: K.donneesHarvest(Array.from({ length: 51 }, (_, i) => BigInt(i + 1))) }));
  t('refused: a harvest lot above the keeper cap', refuse({ data: K.donneesHarvest(Array.from({ length: K.BORNES_DEFAUT.lotHarvest + 1 }, (_, i) => BigInt(i + 1))) }));
  t('refused: a mark lot above the keeper cap', refuse({ data: K.donneesMark(1n, Array.from({ length: K.BORNES_DEFAUT.lotMark + 1 }, () => H1)) }));
  t('refused: a dirty address word', refuse({ data: dm.slice(0, dm.length - 64) + 'ff' + dm.slice(dm.length - 62) }));
  t('refused: gas above the cap', refuse({ gas: K.BORNES_DEFAUT.gasMaxParTx + 1n }));
  t('refused: fee above the cap', refuse({ maxFeePerGas: K.BORNES_DEFAUT.maxFeeWei + 1n }));

  /* decide */
  const W = 604800n, G = 518400n, F = 10n * W;
  const dc = (now) => K.deciderLpLock({ maintenantS: now, courant: 10n, finCourante: F + W, finPrecedente: F, graceS: G });
  t('count: before end(c-1) + 1 h -> no', dc(F + 3599n).mark === null);
  t('count: at end(c-1) + 1 h -> week 9', dc(F + 3600n).mark === 9n);
  t('count: 30 min before the window closes -> no', dc(F + G - 1800n).mark === null && dc(F + G - 1801n).mark === 9n);
  t('count: week 0 has no previous week', K.deciderLpLock({ maintenantS: 5n, courant: 0n, finCourante: W, finPrecedente: null, graceS: G }).mark === null);
  t('harvest: before the last 6 h -> no', dc(F + W - 21601n).harvest === false);
  t('harvest: in the last 6 h -> yes (until 10 min before the end)', dc(F + W - 21600n).harvest === true && dc(F + W - 601n).harvest === true);
  t('harvest: in the last 10 min -> no (a tx mined after the end would fill the next pot)', dc(F + W - 600n).harvest === false && dc(F + W - 1n).harvest === false);
  t('harvest: at the end -> no (the next week)', dc(F + W).harvest === false);

  /* the index */
  const BL = 1000;
  const lg = (o) => ({ address: LK, removed: false, blockNumber: '0x' + o.b.toString(16), logIndex: '0x' + (o.i || 0).toString(16),
    topics: [o.u ? K.TOPIC_UNLOCKED : K.TOPIC_LOCKED, '0x' + o.h.slice(2).padStart(64, '0'), '0x' + BigInt(o.id).toString(16).padStart(64, '0')], ...(o.x || {}) });
  const chaine = [lg({ b: 1001, h: H1, id: 5 }), lg({ b: 1500, h: H2, id: 6 }), lg({ b: 2500, h: H1, id: 5, u: true }), lg({ b: 2600, h: H1, id: 7 }),
    lg({ b: 2700, h: H2, id: 8, x: { address: X } }), lg({ b: 2800, h: X, id: 9, x: { removed: true } }), lg({ b: 2900, h: H2, id: 6, u: true, i: 1 }), lg({ b: 2900, h: H1, id: 6, i: 2 })];
  const fen = [];
  let panne = null;
  const rpcLogs = async (m, p) => { const q = p[0]; const de = parseInt(q.fromBlock, 16), a = parseInt(q.toBlock, 16); fen.push([de, a]);
    if (panne && de <= panne && panne <= a) throw new Error('rate limited'); return chaine.filter((l) => { const b = parseInt(l.blockNumber, 16); return b >= de && b <= a; }).slice().reverse(); };
  const I = K.creerIndexLpLock({ lock: LK, bloc: BL, rpcLogs, pas: 700, fenetresParTour: 3, confirmations: 0 });
  panne = 2300;
  let r = await I.avancer(3000);
  t('index: windows of at most pas blocks, from the deploy block', fen[0][0] === BL && fen.every(([a, b]) => b - a + 1 <= 700), JSON.stringify(fen));
  t('index: a failed window keeps the cursor and says it', I.jusqua() === 1699 && /not read/.test(r.pourquoi || '') && I.etat().fenetresRatees === 1, I.jusqua());
  t('index: not caught up while a window failed', I.aJour(0) === false);
  panne = null;
  await I.avancer(3000); await I.avancer(3000);
  t('index: caught up to the head', I.jusqua() === 3000 && I.aJour(0) === true);
  t('index: held ids = 6 (H1, re-locked after H2 unlocked it in the same block), 7 (H1); 5 unlocked; 8 another emitter, 9 removed',
    I.verrouilles().map((x) => x.tokenId + ':' + x.locker.slice(2, 4)).join() === '6:11,7:11', JSON.stringify(I.verrouilles(), (k, v) => (typeof v === 'bigint' ? v.toString() : v)));
  t('index: positionsDe(H1) = 6, 7; H2 = none', I.positionsDe(H1).join() === '6,7' && I.positionsDe(H2).length === 0);
  t('index: H2 stays a holder after unlocking (its weeks may still be counted); the other emitter is not one', I.lockers().join() === [H1, H2].join());
  const v0 = I.version(); I.appliquer(chaine); t('index: a window read twice changes nothing', I.version() === v0 && I.positionsDe(H1).join() === '6,7');
  const S = I.exporter();
  const I2 = K.creerIndexLpLock({ lock: LK, bloc: BL, rpcLogs });
  t('index: restored from its own export', I2.restaurer(JSON.parse(JSON.stringify(S))) === true && I2.positionsDe(H1).join() === '6,7' && I2.jusqua() === 3000);
  t('index: a file for another lock is refused', K.creerIndexLpLock({ lock: X, bloc: BL, rpcLogs }).restaurer(S) === false);
  t('index: a file for another deploy block is refused', K.creerIndexLpLock({ lock: LK, bloc: BL + 1, rpcLogs }).restaurer(S) === false);
  t('index: a restored index is not "caught up" before its first read', I2.aJour(0) === false && I2.etat().aJour === false);
  fen.length = 0; await I2.avancer(2000);
  t('index: a cursor past the head is reset to the deploy block', fen.length > 0 && fen[0][0] === BL && I2.jusqua() <= 2000, JSON.stringify(fen));
  /* confirmations: by default the index stays 300 blocks under the head (an unsafe head can be replaced) */
  t('index: 300 confirmations by default', K.INDEX_DEFAUT.confirmations === 300 && K.creerIndexLpLock({ lock: LK, bloc: BL, rpcLogs }).confirmations === 300);
  fen.length = 0;
  const Ic = K.creerIndexLpLock({ lock: LK, bloc: BL, rpcLogs, pas: 5000, confirmations: 200 });
  await Ic.avancer(3000);
  t('index: reads only up to head - confirmations, and is caught up there', Ic.jusqua() === 2800 && fen.every(([, b]) => b <= 2800) && Ic.aJour(0) === true, Ic.jusqua() + ' ' + JSON.stringify(fen));
  t('index: an event within the last confirmations blocks is not indexed yet (id 6 re-locked at 2900 is still unlocked there)', Ic.positionsDe(H1).join() === '7', Ic.positionsDe(H1).join());
  await Ic.avancer(3100);
  t('index: once the head moves past it, it is', Ic.positionsDe(H1).join() === '6,7' && Ic.jusqua() === 2900, Ic.positionsDe(H1).join());
  /* freshness: a node that stops answering must not leave the index "caught up" */
  let hI = 1_000_000;
  const If = K.creerIndexLpLock({ lock: LK, bloc: BL, rpcLogs, pas: 5000, confirmations: 0, maintenant: () => hI });
  await If.avancer(3000);
  t('index: fresh right after a good read', If.aJour(0) === true && If.etat().aJour === true);
  hI += 15 * 60000 + 1;
  t('index: 15 min without a good read -> not caught up (etat too, which the card route publishes)', If.aJour(0) === false && If.etat().aJour === false);

  /* the keeper */
  const cle = '0x' + '42'.repeat(32), moi = adresseDe(cle).toLowerCase();
  const rpc0 = async () => '0x';
  t('OFF without a key', K.creerKeeperLpLock({ lock: LK, index: I, keeperAttendu: moi, rpc: rpc0, chaine: 8453 }).etat().etat === 'OFF');
  t('OFF with a key that is not the named keeper', /not the gas-only keeper/.test(K.creerKeeperLpLock({ cle, lock: LK, index: I, keeperAttendu: X, rpc: rpc0, chaine: 8453 }).etat().pourquoi));
  t('OFF without the lock', K.creerKeeperLpLock({ cle, index: I, keeperAttendu: moi, rpc: rpc0 }).etat().etat === 'OFF');
  t('OFF without the index', K.creerKeeperLpLock({ cle, lock: LK, keeperAttendu: moi, rpc: rpc0 }).etat().etat === 'OFF');
  t('OFF in trial mode', K.creerKeeperLpLock({ desactive: 'trial mode' }).etat().etat === 'OFF');
  t('the state never holds the key', !JSON.stringify(K.creerKeeperLpLock({ cle, lock: LK, index: I, keeperAttendu: X, rpc: rpc0 }).etat()).includes('4242424242'));

  /* a fake chain: the lock's rules as far as the keeper reads them */
  const T0 = 1_000_000n, c = 10n, finC = T0 + (c + 1n) * W, finP = T0 + c * W;
  /* nonce = the node's 'pending' count; latest = its 'latest' count (txs mined); lectures = eth_call count per selector */
  const ch = { ts: finP + 600n, tete: 3000, nonce: 0n, latest: 0n, envois: [], recus: new Map(), revertHarvest: false, lectures: new Map(),
    pos: new Map([[6n, { locker: H1, debut: 9n, fin: 13n }], [7n, { locker: H1, debut: 11n, fin: 15n }]]), dernierHarvest: new Map(),
    liq: new Map([[H1 + ':9', 50n], [H2 + ':9', 40n]]), poids: new Map(), joue: new Map([[H1 + ':9', 3n]]) };
  const w = (x) => '0x' + BigInt(x).toString(16).padStart(64, '0');
  const a = (h, i) => '0x' + h.slice(10 + 64 * i + 24, 10 + 64 * i + 64);
  const n = (h, i) => BigInt('0x' + h.slice(10 + 64 * i, 74 + 64 * i));
  const rpc = async (m, p) => {
    if (m === 'eth_chainId') return '0x2105';
    if (m === 'eth_getBlockByNumber') return { number: '0x' + ch.tete.toString(16), timestamp: '0x' + ch.ts.toString(16), baseFeePerGas: '0x3e8' };
    if (m === 'eth_getLogs') return rpcLogs(m, p);
    if (m === 'eth_estimateGas') { const q = K.decoderDonnees(p[0].data); return '0x' + (150000 + 100000 * (q.ids || q.holders).length).toString(16); }
    if (m === 'eth_maxPriorityFeePerGas') return '0x1';
    if (m === 'eth_getTransactionCount') return '0x' + (p[1] === 'latest' ? ch.latest : ch.nonce).toString(16);
    if (m === 'eth_sendRawTransaction') { ch.envois.push(p[0]); ch.nonce += 1n; return '0x' + 'ee'.repeat(32); }
    if (m === 'eth_getTransactionReceipt') return ch.recus.get(p[0]) || null;
    if (m === 'eth_call') {
      const d = p[0].data, s = d.slice(0, 10);
      if (bas(p[0].to) !== LK) throw new Error('call to another contract');
      ch.lectures.set(s, (ch.lectures.get(s) || 0) + 1);
      if (s === K.SEL_LECTURE.MARK_GRACE) return w(G);
      if (s === K.SEL_LECTURE.currentEpoch) return w(c);
      if (s === K.SEL_LECTURE.epochEnd) return w(T0 + (n(d, 0) + 1n) * W);
      if (s === K.SEL_LECTURE.positionOf) { const q = ch.pos.get(n(d, 0)); return q ? w(q.locker) + w(1n).slice(2) + w(q.debut).slice(2) + w(q.fin).slice(2) : '0x' + '0'.repeat(256); }
      if (s === K.SEL_LECTURE.lastHarvestOf) return w(ch.dernierHarvest.get(n(d, 0)) || 0n);
      if (s === K.SEL_LECTURE.lockedLiquidityIn) return w(ch.liq.get(a(d, 0) + ':' + n(d, 1)) || 0n);
      if (s === K.SEL_LECTURE.weightOf) return w(ch.poids.get(a(d, 1) + ':' + n(d, 0)) || 0n);
      if (s === K.SEL_HARVEST) { if (ch.revertHarvest) { const e = new Error('execution reverted'); e.code = 3; throw e; } return '0x'; }
      if (s === K.SEL_MARK) { const q = K.decoderDonnees(d); return w(q.holders.filter((h) => (ch.liq.get(h + ':' + q.e) || 0n) > 0n && !ch.poids.get(h + ':' + q.e) && (ch.joue.get(h + ':' + q.e) || 0n) > 0n).length); }
      throw new Error('unknown call ' + s);
    }
    throw new Error('unknown method ' + m);
  };
  const bas = (x) => String(x).toLowerCase();
  let horloge = 0;
  const k = K.creerKeeperLpLock({ cle, lock: LK, index: I, chaine: 8453, keeperAttendu: moi, rpc, maintenant: () => horloge });
  t('keeper ON with the named key', k.etat().etat === 'ON', k.etat().pourquoi);
  /* week 9 ended 10 min ago: not yet counted, harvest not open */
  r = await k.tour();
  t('before the windows: nothing sent', r.fait === false && ch.envois.length === 0, JSON.stringify(r));
  /* count window: H1 (liquidity, played), H2 (liquidity, did not play) are in the lot; the simulation says 1 */
  ch.ts = finP + 3600n;
  r = await k.tour();
  const tx1 = ch.envois[0] ? lireTx(ch.envois[0]) : null;
  t('count: one markWeekBatch(9, [H1, H2]) to the lock, value 0, chain 8453', r.fait === true && ch.envois.length === 1 && tx1 && tx1.to === LK && tx1.value === 0n && tx1.chainId === 8453n &&
    tx1.data === K.donneesMark(9n, [H1, H2]), JSON.stringify(r) + ' ' + (tx1 && tx1.data.slice(0, 12)));
  r = await k.tour();
  t('count: in flight -> waits, sends nothing', r.fait === false && /in flight/.test(r.pourquoi) && ch.envois.length === 1);
  /* the tx is mined but REVERTED: the lot is freed and tried again */
  ch.recus.set(k.etat().enVol.hash, { status: '0x0' }); ch.latest = 1n;
  r = await k.tour();
  t('count: a mined revert frees the lot: sent again', r.fait === true && ch.envois.length === 2 && k.etat().compteurs.reverts === 1, JSON.stringify(r));
  /* this time included: H1 is weighted on chain */
  ch.recus.set(k.etat().enVol.hash, { status: '0x1' }); ch.latest = 2n; ch.poids.set(H1 + ':9', 7n);
  r = await k.tour();
  t('count: after the receipt nothing more (H2 did not play, H1 counted)', r.fait === false && ch.envois.length === 2 && k.etat().compteurs.inclus === 1, JSON.stringify(r) + ' ' + ch.envois.length);
  /* harvest window of week 10: 6 is active (9..13), 7 starts at 11: only 6 */
  ch.ts = finC - 21600n;
  r = await k.tour();
  const tx3 = ch.envois[2] ? lireTx(ch.envois[2]) : null;
  t('harvest: one harvest([6]) — 7 starts next week, 5 is not held', r.fait === true && tx3 && tx3.to === LK && tx3.data === K.donneesHarvest([6n]), JSON.stringify(r) + ' ' + (tx3 && tx3.data));
  /* not seen included in time, still pending at the node (latest 2, pending 3): NOT resent, kept reserved */
  horloge = 10 ** 9;
  r = await k.tour();
  t('harvest: a tx not seen included but still pending is NOT resent', ch.envois.length === 3 && k.etat().compteurs.nonInclus === 1 && k.etat().enVol === null && k.etat().nonConfirmes.length === 1, JSON.stringify(r));
  r = await k.tour();
  t('harvest: next round still sends nothing for that id while it may land', r.fait === false && ch.envois.length === 3, JSON.stringify(r));
  /* the node DROPPED it (its pending count is back at the tx's nonce): the id is freed and sent again, at the same nonce */
  ch.nonce = 2n;
  r = await k.tour();
  const tx4 = ch.envois[3] ? lireTx(ch.envois[3]) : null;
  t('harvest: a dropped tx frees its id: sent again (same nonce 2)', r.fait === true && tx4 && tx4.nonce === 2n && tx4.data === K.donneesHarvest([6n]) && k.etat().compteurs.liberes === 1 && k.etat().nonConfirmes.length === 0,
    JSON.stringify(r) + ' ' + (tx4 && tx4.nonce));
  /* REPLACED: nonce 2 is mined (latest 3) but not by this tx (no receipt): freed and sent again at the next nonce */
  horloge = 2 * 10 ** 9; ch.latest = 3n; ch.nonce = 4n;
  r = await k.tour();
  const tx5 = ch.envois[4] ? lireTx(ch.envois[4]) : null;
  t('harvest: a tx whose nonce was used by another frees its id: sent again (nonce 4)', r.fait === true && tx5 && tx5.nonce === 4n && k.etat().compteurs.liberes === 2 && k.etat().etat === 'ON',
    JSON.stringify(r) + ' ' + JSON.stringify(k.etat().compteurs));
  const N0 = ch.envois.length;
  /* a fresh keeper (restart) still sends nothing once lastHarvestOf is in the window */
  ch.dernierHarvest.set(6n, finC - 21000n);
  const k2 = K.creerKeeperLpLock({ cle, lock: LK, index: I, chaine: 8453, keeperAttendu: moi, rpc });
  r = await k2.tour();
  t('harvest after a restart: lastHarvestOf in the window -> nothing sent', r.fait === false && ch.envois.length === N0, JSON.stringify(r));
  /* a harvest whose simulation reverts is never sent */
  ch.dernierHarvest.clear(); ch.revertHarvest = true;
  const k3 = K.creerKeeperLpLock({ cle, lock: LK, index: I, chaine: 8453, keeperAttendu: moi, rpc });
  r = await k3.tour();
  t('harvest: a reverting simulation sends nothing', r.fait === false && ch.envois.length === N0 && k3.etat().compteurs.refusSimulation >= 1, JSON.stringify(r));
  /* nobody played: the count simulation says 0 -> nothing */
  ch.revertHarvest = false; ch.ts = finP + 7200n; ch.poids.clear(); ch.joue.clear();
  const k4 = K.creerKeeperLpLock({ cle, lock: LK, index: I, chaine: 8453, keeperAttendu: moi, rpc });
  r = await k4.tour();
  t('count: a lot that would mark 0 is not sent', r.fait === false && ch.envois.length === N0 && k4.etat().compteurs.rienAFaire >= 1, JSON.stringify(r));
  /* a lot above the gas cap is SPLIT (here 2 holders = 420,000 gas with the margin, the cap 400,000): [H1] alone is sent */
  ch.joue.set(H1 + ':9', 3n);
  const k5 = K.creerKeeperLpLock({ cle, lock: LK, index: I, chaine: 8453, keeperAttendu: moi, rpc, bornes: { gasMaxParTx: 400000n } });
  r = await k5.tour();
  const tx6 = ch.envois[N0] ? lireTx(ch.envois[N0]) : null;
  t('count: a lot above the gas cap is split, the half that fits is sent', r.fait === true && tx6 && tx6.data === K.donneesMark(9n, [H1]) && tx6.gas <= 400000n && k5.etat().compteurs.lotsCoupes === 1,
    JSON.stringify(r) + ' ' + JSON.stringify(k5.etat().compteurs));
  /* the count cache: H1 counted (final), H2 has liquidity and did not play (read again after 6 h only) */
  ch.poids.set(H1 + ':9', 5n);
  const somme = () => [K.SEL_LECTURE.lockedLiquidityIn, K.SEL_LECTURE.weightOf, K.SEL_MARK].reduce((a, s) => a + (ch.lectures.get(s) || 0), 0);
  const k6 = K.creerKeeperLpLock({ cle, lock: LK, index: I, chaine: 8453, keeperAttendu: moi, rpc });
  const l0 = somme(); r = await k6.tour(); const l1 = somme();
  t('count cache: first round reads both holders and simulates H2 (5 calls), sends nothing', r.fait === false && l1 - l0 === 5 && ch.envois.length === N0 + 1, (l1 - l0) + ' ' + JSON.stringify(r));
  r = await k6.tour(); const l2 = somme();
  t('count cache: the next round reads nothing for them', r.fait === false && l2 - l1 === 0 && k6.etat().compteurs.lecturesEvitees >= 2, String(l2 - l1));
  ch.ts += 21600n;
  r = await k6.tour(); const l3 = somme();
  t('count cache: 6 h later only H2 (did not play) is read again (3 calls), H1 (counted) never', r.fait === false && l3 - l2 === 3, String(l3 - l2));
  t('state: never the key, index included', !JSON.stringify(k.etat()).includes('4242424242') && k.etat().index && k.etat().index.jusqua === 3000);
  return { ok, ko };
}

const K = await import('./lp-lock-keeper.js');
const res = await verifier(K);
/* mutants: temporary copies next to the module (same imports), deleted afterwards */
const MUTANTS = [
  ['destination check removed', "if (!L || bas(tx.to) !== L) throw", "if (!L) throw"],
  ['harvest also for positions that have not started', 'if (locker === 0n || c < debut || c >= fin) continue;', 'if (locker === 0n || c >= fin) continue;'],
  ['lastHarvestOf ignored', 'if ((await lit(SEL_LECTURE.lastHarvestOf + u(tokenId))) >= ouverture) continue;', ''],
  ['a mark lot that marks 0 is sent', "if (n === null || n === 0n) {", 'if (n === null) {'],
  ['an index log from any emitter accepted', "bas(l.address) !== L || ", ''],
  ['a tx not seen in time frees its lot at once', 'st.compteurs.nonInclus += 1; douteux.push(v);', 'st.compteurs.nonInclus += 1; liberer(v);'],
  ['a dropped or replaced tx never frees its lot', 'if (latest > v.nonce || pending <= v.nonce) {', 'if (false) {'],
  ['harvest until the very end of the week', "else if (t >= fc - BigInt(bornes.stopAvantFinS ?? 0n))", 'else if (t >= fc)'],
  ['a mark lot above the gas cap is never split', "      return (await lotMark(e, lot.slice(0, m), base, ts)) || (await lotMark(e, lot.slice(m), base, ts));", '      return null;'],
  ['no count cache', "if (vu === true || (typeof vu === 'bigint' && BigInt(ts) < vu))", 'if (false)'],
  ['"did not play" cached for ever', 'if (vu === true || (typeof vu', 'if (vu !== undefined || (typeof vu'],
  ['the index reads to the unsafe head', 'const Tc = Math.max(B - 1, T - CONF);', 'const Tc = T;'],
  ['a stale index reported caught up', 'const frais = () => st.luMs !== null && maintenant() - st.luMs <= FRAIS;', 'const frais = () => true;'],
];
let mutOk = 0;
for (const [nom, de, vers] of MUTANTS) {
  if (SRC.split(de).length !== 2) { console.log('KO mutant anchor not found once:', nom); res.ko++; continue; }
  const f = new URL('./lp-lock-keeper.mutant-' + process.pid + '.mjs', import.meta.url);
  writeFileSync(f, SRC.replace(de, () => vers));
  try { const M = await import(f.href + '?m=' + mutOk); const r = await verifier(M, { dire: false }); if (r.ko > 0) mutOk++; else { console.log('KO mutant survived:', nom); res.ko++; } }
  catch (e) { console.log('KO mutant did not load (' + nom + '): ' + e.message); res.ko++; }
  finally { rmSync(f, { force: true }); }
}
console.log('mutants killed ' + mutOk + '/' + MUTANTS.length);
res.ok += mutOk;
t2();
function t2() { console.log(res.ok + '/' + (res.ok + res.ko) + (res.ko ? ' — RED' : ' — green')); process.exit(res.ko ? 1 : 0); }
