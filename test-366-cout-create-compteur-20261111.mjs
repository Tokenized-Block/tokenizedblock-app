/* test-366-cout-create-compteur-20261111.mjs — game366. AFFIRME on the REAL fly-core.js / fly-brain.js / app.html / serveur-web.js:
 *   (A) the fly's round-trip cost rule (edge research 2026-11-11): aRetourPaye needs edge > 2 x (pool + interface) + 2 x gas / size; unknown gas
 *       or size -> false; the old one-side rule would have passed an edge that cannot pay the round trip; gasUsdCote prices what is PAID;
 *   (B) the page uses it for both buy checks, with the account's base fee and ETH price; the server adds ethUsd to /api/fly/account;
 *   (C) Create: a wallet that can pay the birth but not also the TBLOCK buy skips step 1 and goes on (live audit: 0.002033 ETH, cancelled before);
 *   (D) the reader x method counter is published in /sante.
 * NE PROUVE PAS: a live fly trade, a live birth. */
import { readFileSync } from 'node:fs';
import { aRetourPaye, gasUsdCote, edgePaysFee, edgeOf, GAS_UNITES_COTE } from './fly-core.js';
const rd = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const FB = rd('fly-brain.js'), APP = rd('app.html'), SRV = rd('serveur-web.js');
let ok = 0, ko = 0;
const t = (m, c, x = '') => { if (c) ok++; else { ko++; console.log('KO', m, x); } };
const g = gasUsdCote(5000000n, 2000);
t('gas priced at what is paid: 300k x (0.005 gwei + 0.001 gwei tip) x $2000', Math.abs(g - 300000 * 0.006e-9 * 2000) < 1e-12 && GAS_UNITES_COTE === 300000n, String(g));
t('gas unknown -> null', gasUsdCote(0n, 2000) === null && gasUsdCote(5000000n, NaN) === null && gasUsdCote('x', 2000) === null);
const fort = { consistent: 700, opposite: 300 };      /* edge ~0.16% a window at a 0.4% move */
const e = edgeOf(fort, 0.004);
t('the OLD one-side rule would buy this edge', edgePaysFee(fort, 0.004, 500, 0) === true, String(e));
t('the round trip at 0.5 USDC refuses it (gas both sides)', aRetourPaye({ tally: fort, typical: 0.004, feePips: 500, interfaceFee: 0, gasUsd: g, tailleUsd: 0.5 }) === false);
t('the same edge at 50 USDC pays the round trip', aRetourPaye({ tally: fort, typical: 0.004, feePips: 500, interfaceFee: 0, gasUsd: g, tailleUsd: 50 }) === true);
t('unknown gas / size / fee -> no buy', !aRetourPaye({ tally: fort, typical: 0.004, feePips: 500, gasUsd: null, tailleUsd: 50 }) && !aRetourPaye({ tally: fort, typical: 0.004, feePips: 500, gasUsd: g, tailleUsd: 0 }) && !aRetourPaye({ tally: fort, typical: 0.004, feePips: null, gasUsd: g, tailleUsd: 50 }));
t('page: both buy checks use the round trip with the account\'s base fee and ETH price', (FB.match(/aRetourPaye\(\{/g) || []).length === 2 && FB.includes('gasUsdCote(a.baseFeePerGas, Number(a.ethUsd))') && !/if \(!edgePaysFee\(st\.tally/.test(FB));
t('server: /api/fly/account adds the ETH price', SRV.includes('send(200, { ...r, ethUsd: await prixUsdPourPlan(null).catch(() => null) })'));
const c = APP.slice(APP.indexOf('if (ethBal < wei + TIP.BIRTH_ETH_RESERVE_WEI) {'), APP.indexOf('if (ethBal < wei + TIP.BIRTH_ETH_RESERVE_WEI) {') + 1400);
t('Create: enough for the birth -> step 1 skipped, the birth goes on (return true)', c.includes('if (ethBal >= TIP.BIRTH_ETH_RESERVE_WEI) {') && /Step 1 skipped[\s\S]{0,400}return true;/.test(c));
t('Create: only a wallet that cannot pay the birth stops', /The birth needs about[\s\S]{0,300}return false;/.test(c));
t('server: reader x method counter published', SRV.includes("compterAppel('general', methode);") && SRV.includes("compterAppel('rails', methode);") && SRV.includes('santeRpc: { appelsLecteurs,'));
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
