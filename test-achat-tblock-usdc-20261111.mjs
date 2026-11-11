/* test-achat-tblock-usdc-20261111.mjs — game358. AFFIRME on the REAL module achat-tblock-usdc.js:
 *   - 10 % of a 5 USDC mint = 0.50 USDC; below 0.10 USDC no leg (gas would outweigh it); bad inputs = 0 (no leg), never a throw;
 *   - the URL asks the app's own route USDC -> the REAL TBLOCK 0xb200…830e, for the exact amount and the signing wallet;
 *   - the module's TBLOCK is the SAME constant tblock-route.js returns in recoitDevise (tblock-hold.js), and it is the real one;
 *   - a plan is offered ONLY when PRET, paying exactly that USDC, delivering the real TBLOCK with a minimum > 0, with valid calls:
 *     the old test TBLOCK, another amount, ETH as payment, a 0 minimum, REFUSE, empty calls are all refused with a reason.
 * NE PROUVE PAS: the swap itself (banc-tblock-route-fork-20261109.mjs on a fork), nor the wallet. */
import * as A from './achat-tblock-usdc.js';
import { TBLOCK as T_HOLD } from './tblock-hold.js';
import { TBLOCK as T_ECO, TBLOCK_TEST_ANCIEN } from './tokenomics.js';
import { USDC_BASE } from './frais-creation.js';
let ok = 0, ko = 0;
const t = (m, c) => { if (c) ok++; else { ko++; console.log('KO', m); } };
const REEL = '0xb200000000000000000000ba9bf8330307f8830e';
t('module TBLOCK = tblock-hold TBLOCK = the real one', T_ECO.toLowerCase() === T_HOLD.toLowerCase() && T_ECO.toLowerCase() === REEL);
t('10% of 5 USDC = 0.50 USDC', A.montantAchat(5_000_000n) === 500_000n);
t('10% of 10 USDC = 1 USDC', A.montantAchat(10_000_000n) === 1_000_000n);
t('10% of 0.50 USDC = 0.05 -> below the floor -> no leg', A.montantAchat(500_000n) === 0n);
t('exactly the floor is kept (1 USDC -> 0.10)', A.montantAchat(1_000_000n) === 100_000n);
t('bad inputs -> 0, never a throw', [null, 'abc', -5n, 0n].every((x) => A.montantAchat(x) === 0n) && A.montantAchat(5_000_000n, 20000n) === 0n);
const u = A.urlPlanAchat({ montant: 500_000n, compte: '0xABCDEF0000000000000000000000000000000001' });
t('URL: USDC -> real TBLOCK, exact amount, the wallet', u === '/api/rails/plan?de=' + USDC_BASE.toLowerCase() + '&vers=' + REEL + '&montant=500000&compte=0xabcdef0000000000000000000000000000000001');
const appels = [{ to: '0x' + '1'.repeat(40), data: '0x' }, { to: '0x' + '2'.repeat(40), data: '0x' }];
const bon = { etat: 'PRET', atomique: true, appels, resume: { paye: '500000', payeDevise: USDC_BASE.toLowerCase(), recoitAuMoins: '90000000000000000000000', recoitDevise: REEL } };
const v = A.verifierPlanAchat(bon, { montant: 500_000n });
t('a good plan passes, with its minimum', v.ok && v.recoitAuMoins === 90000000000000000000000n && v.appels.length === 2);
const mal = (patch, r = {}) => A.verifierPlanAchat({ ...bon, ...patch, resume: { ...bon.resume, ...r } }, { montant: 500_000n });
t('REFUSE passes its reason through', (() => { const x = mal({ etat: 'REFUSE', pourquoi: 'not enough USDC' }); return !x.ok && x.pourquoi === 'not enough USDC'; })());
t('the OLD test TBLOCK is refused', !mal({}, { recoitDevise: TBLOCK_TEST_ANCIEN.toLowerCase() }).ok);
t('another amount is refused', !mal({}, { paye: '600000' }).ok);
t('ETH as payment is refused', !mal({}, { payeDevise: '0x0000000000000000000000000000000000000000' }).ok);
t('a zero minimum is refused', !mal({}, { recoitAuMoins: '0' }).ok);
t('no calls / a bad call is refused', !mal({ appels: [] }).ok && !mal({ appels: [{ to: '0x12', data: '0x' }] }).ok);
t('no plan / no summary is refused, never a throw', !A.verifierPlanAchat(null, { montant: 1n }).ok && !A.verifierPlanAchat({ etat: 'PRET' }, { montant: 1n }).ok);
t('review 358: a plan that is not all-or-nothing is refused', !mal({ atomique: false }).ok && !mal({ atomique: undefined }).ok);
t('review 358: a plan served from the cache is refused (stale minimum)', !mal({ depuisCache: true }).ok);
t('review 358: the app fee is returned from the plan', A.verifierPlanAchat({ ...bon, resume: { ...bon.resume, fraisMontant: '500' } }, { montant: 500_000n }).frais === 500n);
t('review 358: the waiting text names the fee and the wtCOIN leftover', /incl\. a 0\.0005 USDC app fee/.test(A.texteAttente({ montant: 500_000n, recoitAuMoins: 1n, frais: 500n, fmt: String })) && /wtCOIN/.test(A.texteAttente({ montant: 500_000n, recoitAuMoins: 1n, fmt: String })));
t('words: the option names the amount and where the TBLOCK goes', A.texteOption(500_000n) === 'Also buy TBLOCK with 0.50 USDC (10%) — it goes to your wallet');
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
