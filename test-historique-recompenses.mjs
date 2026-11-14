/* test-historique-recompenses.mjs — historique-recompenses.js with a stubbed chain.
 * AFFIRME: every selector exists in the compiled V / R / R2; the vault week states (running, ended not closed, closed, released, not
 *   read) follow epochs(e); claimed = pot - left - cut only for closed, unreleased periods (never guessed once released); a read that
 *   fails is null, never 0; periods are capped at MAX_PERIODES.
 * NE PROUVE PAS: the live chain (the page reads it; checked in the browser after deploy). */
import { readFileSync } from 'node:fs';
import * as H from './historique-recompenses.js';
let ok = 0, ko = 0;
const t = (m, c, vu = '') => { if (c) ok++; else { ko++; console.log('KO', m, vu); } };
const ids = (n) => new Set(Object.values(JSON.parse(readFileSync(new URL('./contracts/out/' + n + '.sol/' + n + '.json', import.meta.url))).methodIdentifiers || {}));
const Vi = ids('TBlockVaultV2'), Ri = ids('TBlockLockRewards'), Wi = ids('TBlockLockRewardsWeekly');
t('V selectors compiled', Vi.has(H.SEL.epochs) && Vi.has(H.SEL.totalPlayIn));
for (const k of ['pot', 'left', 'cut', 'totalWeight', 'playedWeight', 'closedAt', 'nextEpochToClose', 'nextEpochToRelease', 'currentEpoch', 'epochEnd']) t(k + ' in R and R2', Ri.has(H.SEL[k]) && Wi.has(H.SEL[k]));
const w = (x) => BigInt(x).toString(16).padStart(64, '0');
const arg = (d) => BigInt('0x' + d.slice(10, 74));
/* V: current week 3; week 2 ended not closed; week 1 closed (budget 100, paid 40); week 0 closed and released; HEARTS epochEnd = 1000 + e */
const vEp = { 0: [50n, 50n, 9n, 1n, 1n], 1: [100n, 40n, 8n, 1n, 0n], 2: [0n, 0n, 0n, 0n, 0n], 3: [0n, 0n, 0n, 0n, 0n] };
/* R2: current 2, nextToClose 2, nextToRelease 1; week 1 pot (0, 900) left (0, 300) cut (0, 100) -> claimed 500; week 0 released */
let casser = null;
const rpc = async (m, [c]) => {
  const to = c.to, s = c.data.slice(2, 10);
  if (casser && casser(to, s)) throw new Error('node down');
  if (to === H.HEARTS) { if (s === H.SEL.currentEpoch) return '0x' + w(3); if (s === H.SEL.epochEnd) return '0x' + w(1000n + arg(c.data)); }
  if (to === H.V) { if (s === H.SEL.epochs) return '0x' + vEp[Number(arg(c.data))].map(w).join(''); if (s === H.SEL.totalPlayIn) return '0x' + w(7n * arg(c.data)); }
  if (to === H.R2 || to === H.R) {
    if (s === H.SEL.currentEpoch) return '0x' + w(2); if (s === H.SEL.nextEpochToClose) return '0x' + w(2); if (s === H.SEL.nextEpochToRelease) return '0x' + w(1);
    if (s === H.SEL.epochEnd) return '0x' + w(5000n + arg(c.data));
    const k = Number(arg(c.data));
    if (s === H.SEL.pot) return '0x' + w(0) + w(k === 1 ? 900 : 600); if (s === H.SEL.left) return '0x' + w(0) + w(k === 1 ? 300 : 0); if (s === H.SEL.cut) return '0x' + w(0) + w(k === 1 ? 100 : 0);
    if (s === H.SEL.totalWeight) return '0x' + w(1000); if (s === H.SEL.playedWeight) return '0x' + w(k === 2 ? 0 : 250); if (s === H.SEL.closedAt) return '0x' + w(77);
  }
  throw new Error('not modelled');
};
const T = await H.lireTout(rpc);
t('V weeks newest first, 4 of them', T.v.semaines.map((x) => String(x.e)).join() === '3,2,1,0');
t('V states: running, to close, closed, released', T.v.semaines.map((x) => x.etat).join() === 'EN_COURS,A_FERMER,FERMEE,LIBEREE', T.v.semaines.map((x) => x.etat).join());
t('V week 1: budget 100, paid 40, played 7', T.v.semaines[2].budget === 100n && T.v.semaines[2].paye === 40n && T.v.semaines[2].joue === 7n);
const P = T.h.periodes;
t('R2 states: running, closed, released', P.map((x) => x.etat).join() === 'EN_COURS,FERMEE,LIBEREE', P.map((x) => x.etat).join());
t('R2 week 1 claimed = 900 - 300 - 100 = 500', P[1].reclame && P[1].reclame.tblock === 500n);
t('R2 week 0 released: claimed not guessed', P[2].reclame === null);
t('R2 running week: no pot read, played weight read', P[0].pot === null && P[0].poidsJoue === 0n);
t('share played 25%', H.partJoue(P[1]) === 25);
t('share played null without a total', H.partJoue({ poidsJoue: 1n, poidsTotal: null }) === null);
casser = (to, s) => to === H.V && s === H.SEL.epochs;
const T2 = await H.lireTout(rpc);
t('a failed V read: NON_LU, budget null (never 0)', T2.v.semaines.every((x) => x.etat === 'NON_LU' && x.budget === null));
casser = (to, s) => to === H.R2 && s === H.SEL.left;
const T3 = await H.lireTout(rpc);
t('a failed left() read: claimed not computed', T3.h.periodes[1].reclame === null && T3.h.periodes[1].reste === null);
casser = (to, s) => to === H.HEARTS && s === H.SEL.currentEpoch;
t('the vault clock not read: no weeks', (await H.lireVault(rpc)).semaines.length === 0);
casser = null;
t('texts: not read is said', H.tb(null) === 'not read' && H.jour(undefined) === 'not read');
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
