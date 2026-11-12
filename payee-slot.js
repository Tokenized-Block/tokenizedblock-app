/* payee-slot.js — the last step of the holders economy: the hook's current creator payee moves its payee slot (3400 bps of the
 *   creator fee on the TBLOCK pool) to the lock rewards contract (R). Pure: no DOM, no wallet; reads go through an injected
 *   rpc(method, params). Used by deployer-economie-v2.html (rpc = the wallet provider) and by the test (rpc = Base RPC or a stub).
 * ⛔ NOTHING HERE SIGNS OR SENDS. It builds ONE unsigned call for the payee's own wallet and reads the chain before and after.
 * ⛔ NO ADDRESS IS TYPED HERE: the pool key and the hook come from the frozen pack record (economie-v2-pack-deploiement.js, step P
 *   config v4Key / v4PoolId), R from the deployment record (economie-v2-pack-deploye.js, written from the receipts), the payee is READ on
 *   chain (hook.payees(key)[0].to). The key must hash to the record's pool id and name the record's hook, or nothing is offered.
 * The hook's interface (no hook source in this tree; the fork tests call it on the real hook):
 *   contracts/test/lockrewards/TBlockLockRewards.fork.t.sol  payees(PoolKey) -> (address to, uint16 shareBps)[], transferPayeeSlot(PoolKey, address)
 *   The fork tests show the CURRENT payee calls transferPayeeSlot itself; the slot keeps its share (3400 bps), only `to` changes. */
import { keccak256Hex, selecteur } from './keccak.js';
import { PACK_ECONOMIE_V2 as PACK } from './economie-v2-pack-deploiement.js';
import { ADRESSES_PACK_ECONOMIE_V2 as A } from './economie-v2-pack-deploye.js';

const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x == null ? '' : x).toLowerCase();
const adr = (x) => { const s = bas(x); if (!ADR.test(s)) throw new Error('not an address: ' + x); return s; };
const strip = (h) => String(h).replace(/^0x/, '');
const wAddr = (a) => strip(adr(a)).padStart(64, '0');
const wUint = (x) => { const n = BigInt(x); if (n < 0n || n >= 1n << 256n) throw new Error('out of range'); return n.toString(16).padStart(64, '0'); };
const wInt = (x) => { const n = BigInt(x); if (n < -(1n << 255n) || n >= 1n << 255n) throw new Error('out of range'); return (n < 0n ? (1n << 256n) + n : n).toString(16).padStart(64, '0'); };
const octets = (hex) => { const h = strip(hex); const o = new Uint8Array(h.length / 2); for (let i = 0; i < o.length; i++) o[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16); return o; };

export const SIG_TRANSFER = 'transferPayeeSlot((address,address,uint24,int24,address),address)';
export const SIG_PAYEES = 'payees((address,address,uint24,int24,address))';
export const SEL_TRANSFER = selecteur(SIG_TRANSFER);
export const SEL_PAYEES = selecteur(SIG_PAYEES);
export const PART_BPS = 3400; /* the slot's share today, read on chain; the move keeps it */
export const CHAINE_HEX = '0x2105'; /* Base mainnet, 8453 = the record's chaine */

/** the pool key, pool id and hook, from the frozen pack record only */
function depuisRecord(rec) {
  const p = rec && Array.isArray(rec.etapes) ? rec.etapes.find((e) => e.lettre === 'P') : null;
  const k = p && p.config && p.config.v4Key;
  if (!k) throw new Error('the frozen record carries no TBLOCK pool key');
  const key = Object.freeze({ currency0: adr(k.currency0), currency1: adr(k.currency1), fee: Number(k.fee), tickSpacing: Number(k.tickSpacing), hooks: adr(k.hooks) });
  return { key, poolId: bas(p.config.v4PoolId), hook: adr(rec.existants && rec.existants.v4Hooks), chaine: Number(rec.chaine) };
}
export const { key: KEY, poolId: POOL_ID, hook: HOOK, chaine: CHAINE } = depuisRecord(PACK);
export const R = adr(A.R);

/** abi.encode(PoolKey): five static words */
export function motsCle(key) {
  return wAddr(key.currency0) + wAddr(key.currency1) + wUint(key.fee) + wInt(key.tickSpacing) + wAddr(key.hooks);
}
/** keccak256(abi.encode(key)) = the v4 pool id */
export const poolIdDe = (key) => keccak256Hex(octets(motsCle(key)));

/** [] when the key, hook and R are consistent; otherwise the reasons (nothing is offered then) */
export function coherence({ key = KEY, poolId = POOL_ID, hook = HOOK, r = R, chaine = CHAINE } = {}) {
  const faux = [];
  if (poolIdDe(key) !== bas(poolId)) faux.push('the pool key does not hash to the recorded pool id');
  if (bas(key.hooks) !== bas(hook)) faux.push('the pool key names another hook than the record');
  if (chaine !== 8453) faux.push('the record is not for Base');
  if (!ADR.test(bas(r))) faux.push('no lock rewards address in the deployment record');
  return faux;
}

/** THE call: hook.transferPayeeSlot(key, R), value 0. Unsigned. */
export function appelTransfert(to = R, key = KEY, hook = HOOK) {
  return Object.freeze({ to: adr(hook), data: SEL_TRANSFER + motsCle(key) + wAddr(to), value: '0x0' });
}
export const lecturePayees = (key = KEY, hook = HOOK) => ({ to: adr(hook), data: SEL_PAYEES + motsCle(key) });

/** decode (address to, uint16 shareBps)[]; throws on any answer that is not exactly that (a cut answer is never read as "no payee") */
export function decoderPayees(hex) {
  const s = strip(String(hex || ''));
  if (!/^[0-9a-f]*$/i.test(s) || s.length < 128 || s.length % 64) throw new Error('payees answer is not whole 32-byte words');
  const w = (i) => BigInt('0x' + s.slice(64 * i, 64 * (i + 1)));
  if (w(0) !== 32n) throw new Error('payees answer: unexpected offset');
  const n = Number(w(1));
  if (!Number.isSafeInteger(n) || n > 64 || s.length !== 64 * (2 + 2 * n)) throw new Error('payees answer: length does not match');
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = w(2 + 2 * i), b = w(3 + 2 * i);
    if (a >> 160n) throw new Error('payees answer: not an address');
    if (b >> 16n) throw new Error('payees answer: share is not a uint16');
    out.push({ to: '0x' + a.toString(16).padStart(40, '0'), shareBps: Number(b) });
  }
  return out;
}

/** pure verdict on the slot as read: 'fait' (R holds it), 'a-deplacer' (one payee, not R, 3400 bps), or 'inattendu' */
export function etatSlot(payees, r = R) {
  if (!Array.isArray(payees) || payees.length !== 1) return { etat: 'inattendu', raison: 'the pool has ' + (Array.isArray(payees) ? payees.length : 'no') + ' payees, one was expected' };
  const p = payees[0];
  if (p.shareBps !== PART_BPS) return { etat: 'inattendu', raison: 'the creator slot holds ' + p.shareBps + ' bps, ' + PART_BPS + ' were expected' };
  if (bas(p.to) === bas(r)) return { etat: 'fait', payee: bas(p.to), raison: 'done: the lock rewards hold the creator fee share (' + p.shareBps + ' bps)' };
  return { etat: 'a-deplacer', payee: bas(p.to), raison: 'the creator fee share (' + p.shareBps + ' bps) is paid to ' + bas(p.to) };
}

export async function lirePayees(rpc) {
  const r = await rpc('eth_call', [lecturePayees(), 'latest']);
  return decoderPayees(r);
}

/** everything checked before the wallet opens. wallet = the connected account (or null to only read).
 *  { pret, raison, etat, payee, appel, simulation } — pret only when: Base, record consistent, R has code, one 3400 bps payee that is not R,
 *  the connected wallet IS that payee, and eth_call of the exact call from it succeeds. */
export async function planDeplacement(rpc, wallet) {
  const non = (raison, extra = {}) => ({ pret: false, raison, ...extra });
  const faux = coherence();
  if (faux.length) return non(faux.join(' · '));
  let chaine;
  try { chaine = bas(await rpc('eth_chainId', [])); } catch (e) { return non('cannot read the network: ' + (e.message || e)); }
  if (chaine !== CHAINE_HEX) return non('the wallet is on another network (' + chaine + '): switch it to Base');
  let codeR, codeHook;
  try { [codeR, codeHook] = await Promise.all([rpc('eth_getCode', [R, 'latest']), rpc('eth_getCode', [HOOK, 'latest'])]); } catch (e) { return non('cannot read the chain: ' + (e.message || e)); }
  if (!codeR || codeR === '0x') return non('the lock rewards contract has no code at ' + R);
  if (!codeHook || codeHook === '0x') return non('the hook has no code at ' + HOOK);
  if (!bas(codeHook).includes(strip(SEL_TRANSFER))) return non('the hook code does not carry this function');
  let payees;
  try { payees = await lirePayees(rpc); } catch (e) { return non('cannot read the hook payees: ' + (e.message || e)); }
  const v = etatSlot(payees);
  if (v.etat !== 'a-deplacer') return non(v.raison, { etat: v.etat, payee: v.payee, payees });
  const appel = appelTransfert();
  if (!wallet) return non('connect the payee wallet ' + v.payee, { etat: v.etat, payee: v.payee, payees, appel });
  if (bas(wallet) !== v.payee) return non('this wallet is not the payee: only ' + v.payee + ' can move its slot', { etat: 'refuse', payee: v.payee, payees, appel });
  let simulation;
  try { simulation = await rpc('eth_call', [{ from: bas(wallet), to: appel.to, data: appel.data, value: '0x0' }, 'latest']); }
  catch (e) { return non('the call reverts when simulated from this wallet: ' + (e.message || e), { etat: 'refuse', payee: v.payee, payees, appel }); }
  return { pret: true, raison: 'ready: one signature moves the slot to the lock rewards', etat: v.etat, payee: v.payee, payees, appel, simulation };
}

/** after the signature: [] when tx and receipt are exactly the offered call, from the payee, mined with status 1 */
export function controleEnvoi(appel, wallet, tx, recu) {
  const ko = [];
  if (!tx) ko.push('transaction not found');
  if (!recu) ko.push('receipt not found');
  if (!tx || !recu) return ko;
  if (bas(tx.from) !== bas(wallet)) ko.push('signed by ' + bas(tx.from) + ', not by the payee');
  if (bas(tx.to) !== bas(appel.to)) ko.push('sent to ' + bas(tx.to) + ', not to the hook');
  if (bas(tx.input || tx.data) !== bas(appel.data)) ko.push('the signed data is not the offered call');
  if (BigInt(tx.value || 0) !== 0n) ko.push('the transaction carried value');
  if (bas(recu.status) !== '0x1') ko.push('the transaction failed (status ' + recu.status + ')');
  return ko;
}
