/* test-fund-weekly.mjs — fund-weekly.js against the COMPILED contracts and the records.
 * AFFIRME: every selector exists in the compiled R / R2 ABI (or is ERC-20); the request encodes (TBLOCK, R2, amount) and matches the data
 *   simulated on 2026-11-14 for R's whole balance; the card offers request / execute only to the guardian, at the right time, and only for
 *   a pending move of TBLOCK to R2.
 * NE PROUVE PAS: the chain (banc-fund-weekly-fork does). */
import { readFileSync } from 'node:fs';
import * as F from './fund-weekly.js';
import * as EP from './economie-pack.js';
import * as LW from './lock-weekly-app.js';
let ok = 0, ko = 0;
const t = (m, c, vu = '') => { if (c) ok++; else { ko++; console.log('KO', m, vu); } };
const ids = (n) => new Set(Object.values(JSON.parse(readFileSync(new URL('./contracts/out/' + n + '.sol/' + n + '.json', import.meta.url))).methodIdentifiers || {}));
const R_ = ids('TBlockLockRewards'), W_ = ids('TBlockLockRewardsWeekly');
for (const k of ['rescueRequest', 'rescueExecute', 'rescueCancel', 'pendingRescue', 'guardian', 'RESCUE_DELAY']) t('R has ' + k, R_.has(F.SEL[k]), F.SEL[k]);
t('R2 has deposit', W_.has(F.SEL.deposit));
t('ERC-20 selectors', F.SEL.balanceOf === '70a08231' && F.SEL.approve === '095ea7b3');
t('addresses from the records', F.R === EP.REWARDS && F.R2 === LW.WEEKLY && F.TOKEN === EP.TBLOCK);
const req = F.rescueVersR2(60933059837574716874053n);
t('the request = the data simulated from the DEV wallet on 2026-11-14', req.to === F.R && req.data === '0x13c15545000000000000000000000000b200000000000000000000ba9bf8330307f8830e000000000000000000000000c552260bb7ae266fe3b16b738ea2563f45589911000000000000000000000000000000000000000000000ce730132d16462c5d45', req.data);
let jete = false; try { F.rescueVersR2(0n); } catch (_) { jete = true; } t('a request of 0 is refused', jete);
t('execute', F.rescueExecuter().data === '0x' + F.SEL.rescueExecute && F.rescueExecuter().to === F.R);
const [ap, dep] = F.depotR2(5n);
t('deposit: approve exactly 5 to R2, then R2.deposit(TBLOCK, 5)', ap.to === F.TOKEN && ap.data === '0x095ea7b3' + F.R2.slice(2).padStart(64, '0') + '5'.padStart(64, '0') && dep.to === F.R2 && dep.data === '0x' + F.SEL.deposit + F.TOKEN.slice(2).padStart(64, '0') + '5'.padStart(64, '0'));
jete = false; try { F.depotR2(0n); } catch (_) { jete = true; } t('a deposit of 0 is refused', jete);
const w = (x) => BigInt(x).toString(16).padStart(64, '0'), wa = (a) => a.slice(2).padStart(64, '0');
const d = F.decoderRescue('0x' + wa(F.TOKEN) + wa(F.R2) + w(7) + w(1000));
t('decode pendingRescue', d.token === F.TOKEN && d.to === F.R2 && d.amount === 7n && d.executeAt === 1000n);
const G = '0x264496cc303f8dbe49a241ea84cd42be8392bc80', X = '0x' + '11'.repeat(20);
const rien = { token: '0x' + '0'.repeat(40), to: '0x' + '0'.repeat(40), amount: 0n, executeAt: 0n };
const vers = { token: F.TOKEN, to: F.R2, amount: 7n, executeAt: 1000n };
const e = (o) => F.etatRescue({ moi: G, guardian: G, pending: rien, maintenantS: 500n, soldeR: 9n, ...o });
t('guardian, nothing pending, R holds TBLOCK -> request', e({}).action === 'request');
t('guardian, R empty -> nothing', e({ soldeR: 0n }).action === null);
t('another wallet -> nothing', e({ moi: X }).action === null && /Only the DEV wallet/.test(e({ moi: X }).texte));
t('guardian, pending to R2, before the time -> wait', e({ pending: vers, maintenantS: 999n }).action === null && /opens in/.test(e({ pending: vers, maintenantS: 999n }).texte));
t('guardian, pending to R2, at the time -> execute', e({ pending: vers, maintenantS: 1000n }).action === 'execute');
t('guardian, a pending rescue elsewhere -> nothing', e({ pending: { ...vers, to: X }, maintenantS: 2000n }).action === null && e({ pending: { ...vers, token: X }, maintenantS: 2000n }).action === null);
t('another wallet, pending -> nothing', e({ moi: X, pending: vers, maintenantS: 2000n }).action === null);
t('door renounced -> nothing', e({ guardian: '0x' + '0'.repeat(40) }).action === null);
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
