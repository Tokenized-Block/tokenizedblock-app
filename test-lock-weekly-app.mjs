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
/* marquageApresMintTam: the TAM append needs 2 × minHold locked (V records a play only above minHold, which moves) */
/* one write possible in 600 s (interval 3600): minHold 9000 can become 10000; interval 300: writes at +0, +300, +600 = three: 12347 (rounded up) */
const tam = { ...base, locked: 10000n, minHold: 9000n, maxStepBps: 1000n, minIntervalS: 3600n, fenetreS: 600n };
t('tam: the lock holds after one -10% price write -> appended', A.marquageApresMintTam(tam) && A.marquageApresMintTam(tam).data === A.markPlayedCall(moi, 4n).data);
t('tam: one unit short -> nothing', A.marquageApresMintTam({ ...tam, locked: 9999n }) === null);
t('tam: a shorter keeper interval allows three writes -> 10000 is not enough, 12347 is', A.marquageApresMintTam({ ...tam, minIntervalS: 300n }) === null && A.holdTientLaFenetre({ ...tam, locked: 12347n, minIntervalS: 300n }) && !A.holdTientLaFenetre({ ...tam, locked: 12346n, minIntervalS: 300n }));
t('tam: the measured 2026-11-14 lock (3,000,000 vs minHold 2,789,880) is too close: nothing appended', !A.holdTientLaFenetre({ locked: 3_000_000n, minHold: 2_789_880n, maxStepBps: 1000n, minIntervalS: 3600n, fenetreS: 600n }));
t('tam: an unread step (0) -> nothing', A.marquageApresMintTam({ ...tam, maxStepBps: 0n }) === null);
t('tam: minHold unread as 0 -> nothing', A.marquageApresMintTam({ ...tam, minHold: 0n }) === null);
t('tam: the week rules still apply (already marked)', A.marquageApresMintTam({ ...tam, marque: true }) === null);
t('tam: the week rules still apply (last 10 minutes)', A.marquageApresMintTam({ ...tam, maintenantS: 10_000n - 599n }) === null);
t('the copy never says a skin mint counts', !/skin/.test(A.etatSemaine({ poids: 1n, joue: false, marque: false }).texte));
/* closeWeeklyCall + semainesAFermer: closeEpoch(e) once epochEnd(e) + 1 day passed, weeks in order */
t('closeEpoch(7)', A.closeWeeklyCall(7).data === '0x' + A.SEL.closeEpoch + '7'.padStart(64, '0') && A.closeWeeklyCall(7).to === A.WEEKLY);
const fins = [1000n, 1000n + 604800n, 1000n + 2n * 604800n];
t('fermer: before end + grace -> none', A.semainesAFermer({ prochain: 3n, fins, maintenantS: 1000n + 86399n }).length === 0);
t('fermer: at end + grace -> the first', A.semainesAFermer({ prochain: 3n, fins, maintenantS: 1000n + 86400n }).join() === '3');
t('fermer: two weeks late -> both, in order', A.semainesAFermer({ prochain: 3n, fins, maintenantS: 1000n + 604800n + 86400n }).join() === '3,4');
t('fermer: an unread end stops the list', A.semainesAFermer({ prochain: 3n, fins: [1000n, null, 1000n], maintenantS: 10n ** 9n }).join() === '3');
t('fermer: at most MAX_FERMER', A.semainesAFermer({ prochain: 0n, fins: Array(9).fill(0n), maintenantS: 10n ** 9n }).length === A.MAX_FERMER);
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
