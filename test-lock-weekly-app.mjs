/* test-lock-weekly-app.mjs — lock-weekly-app.js against the COMPILED contract and the deploy record.
 * AFFIRME: the address is the record's; every selector exists in the compiled ABI of TBlockLockRewardsWeekly; the calls encode what the
 *   contract decodes; the week rules (marquables, etatSemaine, inscritPourCeLock) answer as the contract would.
 * NE PROUVE PAS: the chain (banc-lock-weekly-app-fork / the prod probe do). */
import { readFileSync } from 'node:fs';
import * as A from './lock-weekly-app.js';
import { LOCK_WEEKLY_DEPLOIEMENT as REC } from './lock-weekly-deploiement.js';
let ok = 0, ko = 0;
const t = (m, c, vu = '') => { if (c) ok++; else { ko++; console.log('KO', m, vu); } };
const art = JSON.parse(readFileSync(new URL('./contracts/out/TBlockLockRewardsWeekly.sol/TBlockLockRewardsWeekly.json', import.meta.url)));
const ids = new Set(Object.values(art.methodIdentifiers || {}));
t('the ABI has method identifiers', ids.size > 20, ids.size);
for (const [k, s] of Object.entries(A.SEL)) t('selector ' + k + ' is in the compiled contract', ids.has(s), s);
t('address = the record', A.WEEKLY === String(REC.adresse).toLowerCase() && /^0x[0-9a-f]{40}$/.test(A.WEEKLY), A.WEEKLY);
const moi = '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b';
const e = A.enrollWeeklyCall(moi);
t('enroll(holder)', e.to === A.WEEKLY && e.data === '0x' + A.SEL.enroll + moi.slice(2).padStart(64, '0') && e.value === '0x0');
const m = A.markPlayedCall(moi, 3);
t('markPlayed(holder, 3)', m.data === '0x' + A.SEL.markPlayed + moi.slice(2).padStart(64, '0') + '3'.padStart(64, '0'));
const c = A.claimWeeklyCall([5, 2, 5]);
t('claim([2,5]) sorted, deduplicated, ABI array', c.data === '0x' + A.SEL.claim + (32).toString(16).padStart(64, '0') + '2'.padStart(64, '0') + '2'.padStart(64, '0') + '5'.padStart(64, '0'), c.data);
let jete = false; try { A.claimWeeklyCall([]); } catch (_) { jete = true; } t('claim([]) refused before the wallet', jete);
jete = false; try { A.claimWeeklyCall(Array.from({ length: 25 }, (_, i) => i)); } catch (_) { jete = true; } t('claim of 25 weeks refused (MAX_CLAIM_EPOCHS 24)', jete);
jete = false; try { A.markPlayedCall('0x123', 1); } catch (_) { jete = true; } t('a bad address is refused', jete);
/* semainesMarquables: the contract's rule `epoch <= currentEpoch && epoch >= nextEpochToClose` */
const ref = (c0, p0) => { const out = []; for (let x = 0n; x <= c0; x++) if (x >= p0 && x >= c0 - 1n) out.push(x); return out.join(','); };
for (let c0 = 0n; c0 < 6n; c0++) for (let p0 = 0n; p0 <= c0 + 1n; p0++) t('marquables c=' + c0 + ' p=' + p0, A.semainesMarquables({ courant: c0, prochainAFermer: p0 }).join(',') === ref(c0, p0), A.semainesMarquables({ courant: c0, prochainAFermer: p0 }).join(','));
/* etatSemaine: Mark is offered only when markPlayed would not revert nor no-op (weight > 0, played, not marked) */
for (const poids of [0n, 7n]) for (const joue of [false, true]) for (const marque of [false, true]) {
  const s = A.etatSemaine({ poids, joue, marque });
  t('etatSemaine ' + [poids, joue, marque], (s.action === 'mark') === (poids > 0n && joue && !marque), JSON.stringify(s));
}
t('inscrit: same date, same amount', A.inscritPourCeLock({ enrUnlock: 100n, enrAmount: 5n, unlockAt: 100n, locked: 5n }) === true);
t('inscrit: a top-up not enrolled', A.inscritPourCeLock({ enrUnlock: 100n, enrAmount: 5n, unlockAt: 100n, locked: 9n }) === false);
t('inscrit: a later date not enrolled', A.inscritPourCeLock({ enrUnlock: 100n, enrAmount: 5n, unlockAt: 200n, locked: 5n }) === false);
t('inscrit: nothing locked', A.inscritPourCeLock({ enrUnlock: 0n, enrAmount: 0n, unlockAt: 0n, locked: 0n }) === false);
/* marquageApresJeu: appended only when weight > 0, not marked, and more than 10 minutes before the week ends */
const base = { holder: moi, courant: 4n, finSemaineS: 10_000n, maintenantS: 9_000n, poids: 5n, marque: false };
const mk = A.marquageApresJeu(base);
t('apres jeu: markPlayed(holder, current week)', mk && mk.data === A.markPlayedCall(moi, 4n).data);
t('apres jeu: no weight -> nothing', A.marquageApresJeu({ ...base, poids: 0n }) === null);
t('apres jeu: already marked -> nothing', A.marquageApresJeu({ ...base, marque: true }) === null);
t('apres jeu: 599 s before the end -> nothing', A.marquageApresJeu({ ...base, maintenantS: 10_000n - 599n }) === null);
t('apres jeu: 600 s before the end -> appended', A.marquageApresJeu({ ...base, maintenantS: 10_000n - 600n }) !== null);
t('apres jeu: after the end -> nothing', A.marquageApresJeu({ ...base, maintenantS: 10_001n }) === null);
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
