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
/* game392 (Phil 2026-11-13, option A): real buys follow the hold rule (test-fly-hold-392), no longer the edge rule; the round-trip cost is
 *   still priced live with gasUsdCote and shown per size in "How it trades" (test-fly-pourquoi-391) */
t('page (game392): no edge rule in the real trade path; the live gas is still priced with gasUsdCote', !/aRetourPaye\(\{|edgePaysFee\(/.test(FB.replace(/\/\*[\s\S]*?\*\//g, '')) && FB.includes('gasUsdCote(g.baseFeePerGas, Number(g.ethUsd))'));
t('server: /api/fly/account adds the ETH price', SRV.includes('send(200, { ...r, ethUsd: await prixUsdPourPlan(null).catch(() => null) })'));
/* 2026-11-11 (wt-369): the fixed 0.0023 ETH BIRTH_ETH_RESERVE_WEI is replaced by what the birth preflight asks (besoinEthNaissance) and a
 *   pure verdict, TIP.stepOneFits — the 0.002033 ETH wallet of the live audit is now EXECUTED, not only matched as text */
const { stepOneFits } = await import('./create-vault-tip.js');
const ANCRE_366 = 'const choixEtape1 = TIP.stepOneFits({ ethBal, buyWei: wei, birthNeedWei: besoinNaiss ? besoinNaiss.total : null });';
const c = APP.slice(APP.indexOf(ANCRE_366), APP.indexOf(ANCRE_366) + 1400);
t('Create: enough for the birth -> step 1 skipped, the birth goes on (return true)', APP.indexOf(ANCRE_366) > 0 && c.includes("if (choixEtape1 !== 'BUY') {") && /Step 1 skipped[\s\S]{0,400}return true;/.test(c)
  && stepOneFits({ ethBal: 2033000000000000n, buyWei: 1403000000000000n, birthNeedWei: 1978581486057324n }) === 'SKIP');
t('Create: only a wallet that cannot pay the birth stops', /if \(choixEtape1 === 'STOP'\) \{[\s\S]{0,300}The birth needs about[\s\S]{0,300}return false;/.test(c)
  && stepOneFits({ ethBal: 900000000000000n, buyWei: 1403000000000000n, birthNeedWei: 1978581486057324n }) === 'STOP');
t('server: reader x method counter published', SRV.includes("compterAppel('general', methode);") && SRV.includes("compterAppel('rails', methode);") && SRV.includes('santeRpc: { appelsLecteurs,'));
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
