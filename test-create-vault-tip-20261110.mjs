// test-create-vault-tip-20261110.mjs — create-vault-tip.js, pure. No network.
// Proves: the TBLOCK part tops the 0.001 ETH fee up to $5 and never above (rounded down); refuses with a reason (never a 0 call)
// when a price, the balance or the vault is missing; the call is exactly TBLOCK.transfer(vault, amount); the app offers it only
// AFTER a birth succeeded and never inside the birth batch; the module is served.
// Does NOT prove: a wallet signing it, nor the price served at that moment.
import { readFileSync } from 'node:fs';
import * as T from './create-vault-tip.js';
import { TBLOCK } from './economie.js';
import { VAULT } from './economie-pack.js'; /* task 377: the tip pays the LIVE holders vault */
let ok = 0, ko = 0;
const t = (n, c, x = '') => { if (c) ok++; else { ko++; console.log('RED', n, x); } };
const E18 = 10n ** 18n;

/* ETH at $3,000: fee = $3, left = $2; TBLOCK at $0.000005: 400,000 TBLOCK */
t('usdLeft at ETH 3000 = 2,000,000 micro-dollars', T.usdLeft(3000) === 2000000n, String(T.usdLeft(3000)));
const p = T.plan({ ethUsd: 3000, tblockUsd: 0.000005, balance: 10n ** 30n });
t('plan ok', p.ok === true, JSON.stringify(p.why));
t('400,000 TBLOCK for $2 at $0.000005', p.amount === 400000n * E18, String(p.amount));
t('call goes to TBLOCK', p.call.to === TBLOCK);
t('call is transfer(vault, amount)', p.call.data === '0xa9059cbb' + VAULT.slice(2).padStart(64, '0') + p.amount.toString(16).padStart(64, '0'));
t('call sends no ETH', p.call.value === '0x0');
t('call is frozen', Object.isFrozen(p.call));
/* the value never exceeds the target, whatever the rounding */
for (const [eu, tu] of [[3333.33, 0.0000057639], [2500.5, 0.00000123], [4100, 0.00001], [1234.567, 0.0000059]]) {
  const q = T.plan({ ethUsd: eu, tblockUsd: tu, balance: 10n ** 30n });
  const usd = Number(q.amount) / 1e18 * tu + 0.001 * eu;
  t('total <= $5 at ETH ' + eu, q.ok && usd <= 5 + 1e-9, String(usd));
  t('total within one cent of $5 at ETH ' + eu, q.ok && usd > 4.99, String(usd));
}
/* refusals carry a reason, never a call */
const r1 = T.plan({ ethUsd: 6000, tblockUsd: 0.000005, balance: 10n ** 30n });
t('ETH fee above $5: refused, nothing to add', r1.ok === false && /nothing to add/.test(r1.why) && !r1.call);
t('ETH fee exactly $5: refused', T.plan({ ethUsd: 5000, tblockUsd: 0.000005, balance: 10n ** 30n }).ok === false);
t('ETH price unread: refused', T.plan({ ethUsd: null, tblockUsd: 0.000005, balance: 1n }).ok === false);
t('ETH price NaN: refused', T.plan({ ethUsd: NaN, tblockUsd: 0.000005, balance: 1n }).ok === false);
t('TBLOCK price 0: refused', T.plan({ ethUsd: 3000, tblockUsd: 0, balance: 10n ** 30n }).ok === false);
t('TBLOCK price unread: refused', T.plan({ ethUsd: 3000, tblockUsd: undefined, balance: 10n ** 30n }).ok === false);
t('balance unread: refused', T.plan({ ethUsd: 3000, tblockUsd: 0.000005, balance: null }).ok === false);
const r2 = T.plan({ ethUsd: 3000, tblockUsd: 0.000005, balance: 399999n * E18 });
t('balance one TBLOCK short: refused with both numbers', r2.ok === false && /400,000/.test(r2.why) && /399,999/.test(r2.why), r2.why);
t('balance exactly enough: ok', T.plan({ ethUsd: 3000, tblockUsd: 0.000005, balance: 400000n * E18 }).ok === true);

/* the app: offered after a success only, never inside the birth batch */
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
t('app imports the module', /import \* as TIP from '\.\/create-vault-tip\.js'/.test(app));
t('the tip is built inside the success note (class cVaultTip), its button hidden until a plan is ok', /box.className = 'cVaultTip'/.test(app) && /btn.type = 'button'; btn.hidden = true;/.test(app));
const calls = app.match(/proposerTipCoffre\(/g) || [];
t('offered at both success points, the block-page card, the Create Continue (+ its definition)', calls.length === 5, String(calls.length));
const fn = app.slice(app.indexOf('function proposerTipCoffre('), app.indexOf('function proposerTipCoffre(') + 4000);
t('the send uses TIP.plan and envoyerAppels with that ONE call', /TIP\.plan\(/.test(fn) && /envoyerAppels\(\[\s*\{ to: q\.call\.to, data: q\.call\.data, value: q\.call\.value \}\s*\]/.test(fn));
t('no birth plan carries the tip', !/appels[^\n]{0,200}TIP\./.test(app.replace(fn, '')));
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
t('module is served', /'create-vault-tip\.js'/.test(srv));
/* game336: the split is shown BEFORE signing, on the Create tab, with live numbers */
t('the pre-signing split line exists on the Create tab, hidden until read', /<div class="stadeLigne" id="cTipApercu" hidden/.test(app) && app.indexOf('id="cTipApercu"') > app.indexOf('id="v-creer"'));
const ap = app.slice(app.indexOf('async function peindreTipApercu('), app.indexOf('let tipAuto = false;'));
t('it prices part 2 with TIP.usdLeft and TIP.plan (same maths as the send)', /TIP\.usdLeft\(ethUsd\)/.test(ap) && /TIP\.plan\(\{ ethUsd, tblockUsd: px/.test(ap));
t('the preview shows the 3 steps in order, TBLOCK first', ap.indexOf("'1. Before the birth, if you lack TBLOCK:'") > 0
  && ap.indexOf("'1. Before the birth") < ap.indexOf("'2. The birth, in ETH:'") && ap.indexOf("'2. The birth") < ap.indexOf("'3. Right after, pay the block in TBLOCK:'"));
t('the preview prices step 1 with the same buy maths as step 1', /TIP\.ethWeiForTblock\(\{ tblock: manque, tblockUsd: px, ethUsd \}\)/.test(ap));
/* game338: step 1 BEFORE the birth */
const cb = app.slice(app.indexOf('async function creerBlock('), app.indexOf('async function creerBlock(') + 20000);
/* 2026-11-11 (wt-369): step 1 now receives the effective fee and the seed rule, and keeps EXACTLY what the birth preflight asks
 *   (besoinEthNaissance + TIP.stepOneFits) instead of the fixed 0.0023 ETH BIRTH_ETH_RESERVE_WEI; test-create-reserve-369-20261111.mjs runs it */
const appelE1 = 'if (!(await acheterTblockAvantNaissance(e, { fraisWei: fraisReplieAuPlancher, seedWei: paireSansGraineEth(paireChoisie) ? 0n : null }))) return;';
t('step 1 runs inside creerBlock BEFORE the birth preflight', cb.indexOf(appelE1) > 0
  && cb.indexOf(appelE1) < cb.indexOf('const ibDirectPre ='));
const e1 = app.slice(app.indexOf('async function etape1AchatTblock('), app.indexOf('const planAchatCoffre = '));
t('step 1 keeps the ETH the birth needs (reserve checked before the ETH buy is sent)', /TIP\.stepOneFits\(\{ ethBal, buyWei: wei, birthNeedWei: besoinNaiss \? besoinNaiss\.total : null \}\)/.test(e1)
  && e1.indexOf('TIP.stepOneFits(') < e1.indexOf('envoyerAppels(pl.appels') && !/BIRTH_ETH_RESERVE_WEI/.test(e1)
  && T.stepOneFits({ ethBal: 2033000000000000n, buyWei: 1403000000000000n, birthNeedWei: 1978581486057324n }) === 'SKIP');
t('step 1 asks a KEEP plan (TBLOCK stays in the wallet), never the vault plan', /vault-buy\?garder=1&compte=/.test(e1));
t('step 1 refused by the wallet: the birth does not start', /if \(!r \|\| r\.etat !== 'CONFIRME'\) \{[\s\S]{0,260}return false;/.test(e1));
t('step 1 unread prices or plan: the birth goes on (fail-open on a node outage)', /catch \(_\) \{ return true; \}/.test(e1) && /return true; \/\* plan unread/.test(e1));
t('a second click during step 1 starts nothing', /if \(achatTblockEnCours\) return false;/.test(app));
t('step 3 opens the wallet on its own after a birth that ran step 1', /if \(tipAuto\) \{ tipAuto = false; btn\.click\(\); \}/.test(app));
t('ethWeiForTblock: 500,000 TBLOCK at $0.00000576, ETH $2,090, +4 % = 0.001433110 ETH', T.ethWeiForTblock({ tblock: 500000n * E18, tblockUsd: 5.76e-6, ethUsd: 2090 }) === 1433110047846890n);
t('ethWeiForTblock is null on an unread price or nothing to buy', T.ethWeiForTblock({ tblock: 1n, tblockUsd: null, ethUsd: 2000 }) === null && T.ethWeiForTblock({ tblock: 0n, tblockUsd: 1e-6, ethUsd: 2000 }) === null);
t('the server passes garder only when asked', /garder: q\.get\('garder'\) === '1'/.test(srv));
/* game339: resume + the stop sentence */
const hold = readFileSync(new URL('./tblock-hold.js', import.meta.url), 'utf8');
t('TIP.WTCOIN is the same wtCOIN as tblock-hold.js', new RegExp("WTCOIN\\s*=\\s*'" + T.WTCOIN + "'", 'i').test(hold), T.WTCOIN);
const e1b = app.slice(app.indexOf('async function etape1AchatTblock('), app.indexOf('function texteEtape1Arretee('));
t('step 1 resumes from leftover wtCOIN BEFORE any new ETH buy', e1b.indexOf('reprise=1&compte=') > 0 && e1b.indexOf('reprise=1&compte=') < e1b.indexOf('TIP.ethWeiForTblock({ tblock: need - bal'));
t('the resume is skipped below the dust floor', /if \(bal < need && wt >= TIP\.WTCOIN_RESUME_MIN\)/.test(e1b));
t('both stops use the counting sentence', (e1b.match(/texteEtape1Arretee\(/g) || []).length === 2);
const fx0 = app.indexOf('function texteEtape1Arretee(r, n) {');
const fx1 = fx0 + app.slice(fx0).search(/\r?\n\}\r?\n/); /* LF or CRLF checkout */
const texteEtape1Arretee = new Function('r', 'n', app.slice(fx0 + 'function texteEtape1Arretee(r, n) {'.length, fx1));
const s1 = texteEtape1Arretee({ etat: 'REFUSE', pourquoi: 'you declined in your wallet — nothing was sent', hashes: ['0xa', '0xb'] }, 4);
t('2 of 4 sent: says so, never "nothing was sent"', /stopped after 2 of 4 signatures/.test(s1) && !/nothing was sent/i.test(s1), s1);
const s0 = texteEtape1Arretee({ etat: 'REFUSE', pourquoi: 'you declined', hashes: [] }, 4);
t('0 sent: says nothing was sent', /Nothing was sent/.test(s0) && !/stopped after/.test(s0), s0);
const rt = readFileSync(new URL('./tblock-route.js', import.meta.url), 'utf8');
t('the resume route exists, no app fee, simulated whole', /export async function planWtcoinVersTblock\(/.test(rt) && /resume: \{ fraisBps: 0n, paye: m, payeDevise: WTCOIN/.test(rt) && /const s = await simuler\(rpc, compte, appels\);/.test(rt.slice(rt.indexOf('planWtcoinVersTblock'))));
/* game340: the TBLOCK button + live price, top right */
t('the TBLOCK button sits in the header next to Connect wallet', /<button class="puce pTblock" id="pTblock"[^>]*>TBLOCK <b id="pTblockPx">/.test(app)
  && app.indexOf('id="pTblock"') < app.indexOf('id="pCompte"') && app.indexOf('id="pTblock"') > app.indexOf('<header class="tete">'));
const pt = app.slice(app.indexOf('async function peindrePiluleTblock('), app.indexOf('/* Pay split shown BEFORE signing'));
t('its price comes from the served pool read, never a constant', /fetch\('\/api\/tblock\/hold'/.test(pt) && !/\$0\.0000\d/.test(pt));
t('a failed read keeps the last good price (never blank), "not read" only before any good read', /catch \(_\) \{ \/\* keep the last good price \*\/ \}/.test(pt) && /if \(tbPilule\.usd === null\) \{ b\.textContent = 'not read';/.test(pt));
t('it refreshes every 30 s and only one read at a time', /setInterval\(\(\) => \{ void peindrePiluleTblock\(\); \}, 30000\)/.test(pt) && /tbPilule\.enVol/.test(pt));
const fmtPrixTblock = new Function('u', 'return ' + app.match(/const fmtPrixTblock = \(u\) => \((.+)\);\r?\n/)[1]);
t('price format: 0.000005818 -> 0.00000582, 0.5 -> 0.5000', fmtPrixTblock(0.000005818) === '0.00000582' && fmtPrixTblock(0.5) === '0.5000', fmtPrixTblock(0.000005818));
t('"Nothing was charged" is gone from the birth failure', !/Nothing was charged: the payment only goes through if creation succeeds/.test(app));
t('the server serves reprise only with a whole account and a raw amount', /if \(repriseV && \(!\/\^0x\[0-9a-f\]\{40\}\$\/\.test\(compteV\)/.test(srv));
/* game337: the ETH path */
t('ethWeiForTopUp at ETH 2000 = $3 of ETH = 0.0015 ETH', T.ethWeiForTopUp(2000) === 1500000000000000n, String(T.ethWeiForTopUp(2000)));
t('ethWeiForTopUp is null when unread or nothing to add', T.ethWeiForTopUp(null) === null && T.ethWeiForTopUp(6000) === null);
const ac = app.slice(app.indexOf('async function proposerAchatCoffre('), app.indexOf('async function proposerTipCoffre('));
t('a short TBLOCK balance switches to the ETH buy (not a dead end)', /if \(!q\.ok && \/\^This needs\/\.test\(String\(q\.why \|\| ''\)\)\) \{ proposerAchatCoffre\(p, btn\); return; \}/.test(app));
t('the ETH buy asks the server plan with the computed wei and rebuilds it at the click', (ac.match(/planAchatCoffre\(wei\)/g) || []).length === 2);
t('it sends exactly the served calls, in order', /envoyerAppels\(fresh\.appels\.map\(\(c\) => \(\{ to: c\.to, data: c\.data, value: c\.value \}\)\), compte\)/.test(ac));
t('the server route exists, takes the vault from the deployment file, never from the request', /chemin === '\/api\/tblock\/vault-buy'/.test(srv) && /const coffreV = EP_PACK\.VAULT;/.test(srv) && !/q\.get\('coffre'\)|q\.get\('vault'\)/.test(srv));
t('it says the deposit is not a fee', /is not a fee: it stays yours/.test(ap));
t('it builds no call and sends nothing', !/envoyerAppels|eth_sendTransaction|wallet_sendCalls/.test(ap));
console.log(ko === 0 ? 'GREEN' : 'RED', ok + '/' + (ok + ko));
