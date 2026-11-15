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
/* realized rate: a week that paid 7 TBLOCK on 100 TBLOCK of played weight = 7 % a week = 7 x 365/7 = 365 % a year at band 1x */
const E = 10n ** 18n, prix = { tblockUsd: 0.000004, wtcoinUsd: 120 };
const sem = { etat: 'FERMEE', pot: { tblock: 7n * E, wtcoin: 0n }, poidsJoue: 100n * E };
t('rate: 7 % in a week = 365 % a year', H.aprRealise(sem, { jours: 7, ...prix }) === 365, H.aprRealise(sem, { jours: 7, ...prix }));
/* wtCOIN in the pot counts at its own price: 0.000001 wtCOIN = 120e-6 USD = 30 TBLOCK at 0.000004 -> pot 37 TBLOCK-equivalent */
t('rate: wtCOIN valued at its price', H.aprRealise({ ...sem, pot: { tblock: 7n * E, wtcoin: 10n ** 12n } }, { jours: 7, ...prix }) === 1929.29, H.aprRealise({ ...sem, pot: { tblock: 7n * E, wtcoin: 10n ** 12n } }, { jours: 7, ...prix }));
t('rate: a running period has none', H.aprRealise({ ...sem, etat: 'EN_COURS' }, { jours: 7, ...prix }) === null);
/* 2026-11-15: the LP lock's weeks (TBlockLPLock): selectors compiled, states from rolledOver / swept / the 6-day grace, a failed read null */
{
  const Li = ids('TBlockLPLock');
  for (const k of ['pot', 'paid', 'totalWeight', 'rolledOver', 'swept', 'currentEpoch', 'epochEnd']) t('LP lock selector ' + k + ' compiled', Li.has(H.SEL[k]));
  const src = readFileSync(new URL('./contracts/src/TBlockLPLock.sol', import.meta.url), 'utf8');
  t('LP grace = MARK_GRACE of the source (6 days)', /MARK_GRACE = 6 days;/.test(src) && H.LPL_GRACE_S === 6n * 86400n);
  const { LP_LOCK_DEPLOIEMENT: LPR } = await import('./lp-lock-deploiement.js');
  t('LP lock address = its record', H.LPL === String(LPR.adresse).toLowerCase());
  /* current week 4, now = 10_000_000; week k ends at 10_000_000 - (3 - k) * 604800 - 100: week 3 ended 100 s ago (counting), week 2 open,
   *   week 1 rolled over, week 0 swept */
  const NOW = 10_000_000n;
  let casse = null;
  const rpcL = async (m, params) => {
    if (m === 'eth_getBlockByNumber') { if (casse === 'bloc') throw new Error('down'); return { timestamp: '0x' + NOW.toString(16) }; }
    const c = params[0], s = c.data.slice(2, 10), k = c.data.length > 10 ? BigInt('0x' + c.data.slice(10, 74)) : null;
    if (c.to !== H.LPL) throw new Error('not modelled');
    if (casse === s) throw new Error('down');
    if (s === H.SEL.currentEpoch) return '0x' + w(4);
    if (s === H.SEL.epochEnd) return '0x' + w(NOW - (3n - k) * 604800n - 100n);
    if (s === H.SEL.pot) return '0x' + w(k * 10n) + w(k * 1000n);
    if (s === H.SEL.paid) return '0x' + w(k) + w(k * 100n);
    if (s === H.SEL.totalWeight) return '0x' + w(k === 1n ? 0n : 5n * 10n ** 18n);
    if (s === H.SEL.rolledOver) return '0x' + w(k === 1n ? 1 : 0);
    if (s === H.SEL.swept) return '0x' + w(k === 0n ? 1 : 0);
    throw new Error('not modelled');
  };
  const D = await H.lireLpLock(rpcL);
  t('LP weeks newest first, 5', D.semaines.map((x) => String(x.k)).join() === '4,3,2,1,0');
  t('LP states: running, counting, open, rolled over, swept', D.semaines.map((x) => x.etat).join() === 'EN_COURS,COMPTAGE,OUVERTE,REPORTEE,BALAYEE', D.semaines.map((x) => x.etat).join());
  t('LP week 2: pot 20 wtCOIN-wei + 2000 TBLOCK-wei, claimed 2 + 200, weight 5', D.semaines[2].pot.wtcoin === 20n && D.semaines[2].pot.tblock === 2000n && D.semaines[2].paye.tblock === 200n && D.semaines[2].poids === 5n * 10n ** 18n);
  t('LP counted texts', H.poidsLp(0n, 'OUVERTE') === 'nobody' && H.poidsLp(null) === 'not read' && H.poidsLp(5n * 10n ** 18n, 'OUVERTE') === 'yes');
  t('LP: a week still counting with weight 0 says "nobody yet", never "nobody"', H.poidsLp(0n, 'COMPTAGE') === 'nobody yet');
  t('LP states have English labels', ['COMPTAGE', 'OUVERTE', 'REPORTEE', 'BALAYEE'].every((k) => typeof H.ETATS[k] === 'string' && !/epoch/i.test(H.ETATS[k])));
  casse = H.SEL.paid;
  const D2 = await H.lireLpLock(rpcL);
  t('LP paid() not read: null, never 0', D2.semaines.every((x) => x.paye === null));
  casse = 'bloc';
  const D3 = await H.lireLpLock(rpcL);
  t('LP chain time not read: past weeks NON_LU, never guessed', D3.semaines.slice(1).every((x) => x.etat === 'NON_LU') && D3.semaines[0].etat === 'EN_COURS');
  casse = H.SEL.currentEpoch;
  t('LP current week not read: no weeks', (await H.lireLpLock(rpcL)).semaines.length === 0);
  t('lireTout carries the LP weeks', 'lp' in (await H.lireTout(rpc)));
}
t('rate: nobody played -> none (no division by zero)', H.aprRealise({ ...sem, poidsJoue: 0n }, { jours: 7, ...prix }) === null);
t('rate: a price not read -> none, never a guess', H.aprRealise(sem, { jours: 7, tblockUsd: null, wtcoinUsd: 120 }) === null);
t('rate: monthly period = 30 days', H.JOURS_PERIODE.mensuel === 30 && H.aprRealise(sem, { jours: 30, ...prix }) === 85.17);
/* 2026-11-15 (Phil: the page follows the app's colours): same guard as claim.html (test-claim-386 A7-A9) */
{
  const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8'), page = readFileSync(new URL('./rewards-history.html', import.meta.url), 'utf8');
  const racine = (s) => { const m = /(?:^|\n):root\{([\s\S]*?)\n\}/.exec(s.replace(/\/\*[\s\S]*?\*\//g, '')); return m ? Object.fromEntries([...m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((x) => [x[1], x[2].trim()])) : null; };
  const ra = racine(app), rp = racine(page);
  const ecarts = rp && ra ? Object.entries(rp).filter(([k, v]) => ra[k] !== v).map(([k, v]) => k + ' ' + v + ' vs ' + ra[k]) : ['not found'];
  t('colours: rewards-history :root tokens equal app.html (' + (rp ? Object.keys(rp).length : 0) + ')', rp && Object.keys(rp).length >= 15 && ecarts.length === 0, ecarts.join('; '));
  const variante = (s, k) => { const m = new RegExp(':root\\[data-teinte="' + k + '"\\]\\{([^}]*)\\}').exec(s); return m ? m[1].replace(/\s+/g, '') : null; };
  t('colours: the three variants b, c, d equal app.html', ['b', 'c', 'd'].every((k) => variante(page, k) && variante(page, k) === variante(app, k)));
  t('colours: reads the colour chosen in the app (tb.teinte)', /localStorage\.getItem\('tb\.teinte'\)/.test(page));
  t('colours: no colour of the old page left', !/#050d24|#f7a318|--or\b/.test(page));
}
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
