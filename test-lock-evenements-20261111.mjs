/* test-lock-evenements-20261111.mjs — TBlockLock events -> records (lock-evenements.js). Probed on mainnet 2026-11-11: an OR-topic getLogs
 *   from the deploy block through the prod relay answered (3 windows, 0 lock yet). */
import { TOPICS, decoderLock, LOCK_DEPLOY_BLOC } from './lock-evenements.js';
let ok = 0, ko = 0;
const t = (m, c, x = '') => { if (c) ok++; else { ko++; console.log('KO', m, x); } };
const L = '0xec46b02bb1f3a58ce37c023f8668f2207bc2b0aa';
const pad = (a) => '0x' + a.replace(/^0x/, '').padStart(64, '0');
const u = (n) => BigInt(n).toString(16).padStart(64, '0');
const H = '0x00000000000000000000000000000000000a11ce';
const lg = (type, data, { at = L, extra = [] } = {}) => ({ address: at, topics: [TOPICS[type], pad(H), ...extra], data: '0x' + data.map(u).join(''), blockNumber: '0x10', logIndex: '0x2', transactionHash: '0x' + 'ab'.repeat(32) });
t('deploy block = the one read on chain', LOCK_DEPLOY_BLOC === 55817337);
const l = decoderLock(lg('Locked', [5n, 30n, 1_900_000_000]), L);
t('Locked: holder, added, total, unlockAt', l.type === 'Locked' && l.holder === H && l.added === '5' && l.total === '30' && l.unlockAt === 1_900_000_000 && l.blockNumber === 16 && l.i === 2);
t('Extended', decoderLock(lg('Extended', [1_950_000_000]), L).unlockAt === 1_950_000_000);
t('WithdrawRequested', decoderLock(lg('WithdrawRequested', [1_960_000_000]), L).withdrawableAt === 1_960_000_000);
t('WithdrawCancelled (no data)', decoderLock(lg('WithdrawCancelled', []), L).type === 'WithdrawCancelled');
t('Withdrawn', decoderLock(lg('Withdrawn', [30n]), L).amount === '30');
t('a forged Locked from another contract is refused', decoderLock(lg('Locked', [5n, 30n, 1n], { at: '0x000000000000000000000000000000000000beef' }), L) === null);
t('wrong data length refused', decoderLock(lg('Locked', [5n, 30n]), L) === null && decoderLock(lg('WithdrawCancelled', [1n]), L) === null);
t('an extra topic refused', decoderLock(lg('Withdrawn', [1n], { extra: [pad('0x01')] }), L) === null);
t('unknown topic refused', decoderLock({ ...lg('Withdrawn', [1n]), topics: ['0x' + '11'.repeat(32), pad(H)] }, L) === null);
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
