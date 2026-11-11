/* lock-evenements.js — TBlockLock's own events -> records for points.js (game353). Pure; the server reads the logs and the block times.
 * Accepted only when emitted BY the lock contract with a known topic (a forged event from another contract is refused by the address
 *   check, as for the hearts). Each record keeps its block number and log index (order) and gets its block's timestamp from the reader. */
import { topic } from './keccak.js';

export const LOCK_DEPLOY_BLOC = 55817337; /* tx 0xb0611159…03c5b6, read on chain 2026-11-11 */
export const TOPICS = Object.freeze({
  Locked: topic('Locked(address,uint256,uint256,uint256)'),
  Extended: topic('Extended(address,uint256)'),
  WithdrawRequested: topic('WithdrawRequested(address,uint256)'),
  WithdrawCancelled: topic('WithdrawCancelled(address)'),
  Withdrawn: topic('Withdrawn(address,uint256)'),
});
const PAR_TOPIC = new Map(Object.entries(TOPICS).map(([k, v]) => [v, k]));
const low = (a) => String(a || '').toLowerCase();
const mot = (d, i) => BigInt('0x' + d.slice(2 + 64 * i, 2 + 64 * (i + 1)));

export function decoderLock(log, lock) {
  if (!log || low(log.address) !== low(lock)) return null;
  const tp = log.topics || [];
  const type = PAR_TOPIC.get(low(tp[0]));
  if (!type || tp.length !== 2) return null;
  const holder = '0x' + low(tp[1]).slice(-40);
  const d = String(log.data || '0x');
  const n = (d.length - 2) / 64;
  const attendu = { Locked: 3, Extended: 1, WithdrawRequested: 1, WithdrawCancelled: 0, Withdrawn: 1 }[type];
  if (!/^0x[0-9a-fA-F]*$/.test(d) || n !== attendu) return null;
  const e = { type, holder, blockNumber: Number(BigInt(log.blockNumber || '0x0')), i: Number(BigInt(log.logIndex || '0x0')), tx: low(log.transactionHash) };
  if (type === 'Locked') { e.added = mot(d, 0).toString(); e.total = mot(d, 1).toString(); e.unlockAt = Number(mot(d, 2)); }
  if (type === 'Extended') e.unlockAt = Number(mot(d, 0));
  if (type === 'WithdrawRequested') e.withdrawableAt = Number(mot(d, 0));
  if (type === 'Withdrawn') e.amount = mot(d, 0).toString();
  return e;
}
