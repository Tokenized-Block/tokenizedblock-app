/* test-achat-reprise-361-20261111.mjs — game361 (Grok's live test on game360: the TAM mint passed, the TBLOCK buy never started — "the pinned
 *   pools could not be read just now: You reached Public endpoint rate limit"). AFFIRME on the REAL achat-tblock-usdc.js / app.html /
 *   tam-onglet.js / serveur-web.js:
 *   - planAReessayer: retries what was NOT read (no answer, NON_MESURE, busy / rate limit / 429 / "could not be read", the 15 s cache), never a
 *     plan REFUSED for a real reason (not enough USDC, the old TBLOCK, another amount) and never an ok plan;
 *   - the page asks the plan up to 3 times, 4 s then 8 s apart, says it on screen, and stops at the first ok or real refusal;
 *   - after a mint whose buy failed, TAM offers "Finish the TBLOCK buy — 0.50 USDC (no new mint)", which calls the buy alone (never ctx.envoyer),
 *     and replaces the old "Sign in my wallet" (no accidental second mint);
 *   - the server's read list now holds publicnode and tenderly next to mainnet.base.org and drpc (probed: eth_call with a state override).
 * NE PROUVE PAS: a real rate-limit episode end to end (the live retest by Grok does). */
import { readFileSync } from 'node:fs';
import * as A from './achat-tblock-usdc.js';
const rd = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const APP = rd('app.html'), TAM = rd('tam-onglet.js'), SRV = rd('serveur-web.js');
let ok = 0, ko = 0;
const t = (m, c) => { if (c) ok++; else { ko++; console.log('KO', m); } };
const R = A.planAReessayer;
t('no answer -> retry', R(null, { ok: false }) === true);
t('NON_MESURE -> retry', R({ etat: 'NON_MESURE' }, { ok: false }) === true);
t('Grok\'s exact error -> retry', R({ etat: 'REFUSE', pourquoi: 'the pinned pools could not be read just now: You reached Public endpoint rate limit, please upgrade to paid plan.' }, { ok: false }) === true);
t('busy / 429 -> retry', R({ ok: false, etat: 'NON_MESURE', pourquoi: 'busy: each plan reads the chain on a node shared with the whole site — retry in a minute' }, { ok: false }) === true);
t('served from the cache -> retry', R({ etat: 'PRET', depuisCache: true }, { ok: false }) === true);
t('not enough USDC -> NO retry', R({ etat: 'REFUSE', sansFonds: true, pourquoi: 'not enough of the token paid in this wallet for that amount' }, { ok: false }) === false);
t('a real refusal of the chain -> NO retry', R({ etat: 'REFUSE', pourquoi: 'the chain refuses call 2 (swap USDC to wtCOIN on Aerodrome): reverted' }, { ok: false }) === false);
t('an ok plan -> NO retry', R({ etat: 'PRET' }, { ok: true }) === false);
const f = APP.slice(APP.indexOf('async function acheterTblockUsdc('), APP.indexOf('async function envoyerPaiementJeton('));
t('page: 3 tries, 4 s then 8 s, said on screen, stops at ok or real refusal', f.includes('for (let essai = 0; essai < 3; essai += 1) {') && f.includes('setTimeout(o, 4000 * essai)')
  && f.includes("dire('Base nodes are busy — asking the TBLOCK route again (' + (essai + 1) + '/3)…');") && f.includes('if (v.ok || !AT.planAReessayer(p, v)) break;'));
/* 2026-11-12 (the economy pack is live): the TAM mint is paid through the TBLOCK router, which buys TBLOCK in the same transaction: there is
 *   no separate buy after a TAM mint any more, so no half-done buy to finish there. Pinned as removed; the resume route below is unchanged. */
t('TAM: no separate buy after the mint, so no finish-the-buy button and no second call after a mint', !TAM.includes('tamFinirAchat') && !TAM.includes('ctx.acheterTblock('));
t('server: publicnode + tenderly in the read list', SRV.includes("|| 'https://mainnet.base.org,https://base.drpc.org,https://base-rpc.publicnode.com,https://gateway.tenderly.co/public/base')"));
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
