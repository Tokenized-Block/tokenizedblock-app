/* test-tam-mint-messages-375-20261112.mjs — two things the browser check of 2026-11-12 saw in the TAM tab, on the merged tree:
 *   1. pressing "Mint this work — $5" on a tuned work too close to a minted one said "Not ready: quasi-doublon." — the server's refusal
 *      carries the engine's FRENCH reasons (tam-moteur.js RAISONS, joined in tam-serveur.js), and V.peutMinter put them on screen as is.
 *      Now the gate says the server's CODES in English (CODES_EN), and an English reason with no code (busy, too many) is kept.
 *   2. once the router plan was on screen ("You sign: …" + "Sign in my wallet"), the status line under it still read
 *      "Reading a fresh TBLOCK quote for the payment…", as if the page were still waiting. It is cleared when the plan is shown.
 * AFFIRME: (1) by running the real V.peutMinter on a real engine refusal shaped like the server's answer; (2) on the source of preparerMint.
 * NE PROUVE PAS: a real wallet; the server itself (test-tam-onglet-20261031.mjs runs /api/tam/certifier). */
import { readFileSync } from 'node:fs';
import * as T from './tam-moteur.js';
import * as V from './tam-vue.js';
import { TAMART_DEPLOIEMENT } from './tamart-deploiement.js';
import { keccak256Hex } from './keccak.js';
let ok = 0, ko = 0;
const t = (m, c) => { if (c) { ok++; console.log('ok', m); } else { ko++; console.log('KO', m); } };
const FR = /quasi-doublon|diverge|non chaotique|dimension trop basse|plat \(|signature d une oeuvre/;

const DEP = { ...TAMART_DEPLOIEMENT, adresse: '0x' + '11'.repeat(20), bloc: 1000 };
const moi = '0x' + 'ab'.repeat(20);
const Pm = { ...T.structurer({ famille: 'lorenz' }), minteur: moi };
const cm = T.certifierReglage(Pm, []);
t('setup: the work passes its local checks', cm.ok === true && cm.octets instanceof Uint8Array);
/* the server's answer, as tam-serveur.js builds it: { ...reste (codes, raisons…), ok, etat, hash, pourquoi: raisons.join('; ') } */
const doublon = T.certifierReglage(Pm, [cm.signature]);
t('setup: the same work against itself is a near-duplicate (code DOUBLON, French reason)', !doublon.ok && doublon.codes.includes('DOUBLON') && FR.test(doublon.raisons.join('; ')));
const { oeuvre: _o, octets: _b, signature: _s, ...reste } = doublon;
const serveur = { ...reste, ok: false, etat: 'REFUSE', hash: keccak256Hex(cm.octets), pourquoi: (doublon.raisons || []).join('; ') };
const porte = (s) => V.peutMinter({ dep: DEP, local: cm, serveur: s, octets: cm.octets, P: Pm, compte: moi });

const r1 = porte(serveur);
t('a near-duplicate refused by the server: the gate says "too close to an existing work"', r1.ok === false && /too close to an existing work/.test(r1.pourquoi));
t('… and no French reason reaches the screen', !FR.test(r1.pourquoi));
const r2 = porte({ ...serveur, codes: undefined });
t('a refusal with only the French reason (no codes) is said in English too', r2.ok === false && /too close to an existing work/.test(r2.pourquoi) && !FR.test(r2.pourquoi));
const r2b = porte({ ...serveur, pourquoi: 'refus' });
t('the codes decide, whatever the joined text says', r2b.ok === false && r2b.pourquoi === 'too close to an existing work');
const r3 = porte({ ok: false, etat: 'OCCUPE', pourquoi: 'busy, try again in a few seconds' });
t('an English reason with no code is kept as is', r3.ok === false && r3.pourquoi === 'busy, try again in a few seconds');
const r4 = porte(null);
t('no answer from the server: "the server has not certified this work"', r4.ok === false && r4.pourquoi === 'the server has not certified this work');
const r5 = porte({ ok: true, etat: 'CERTIFIE', hash: keccak256Hex(cm.octets) });
t('a certified work still opens the gate', r5.ok === true && r5.pourquoi === null);
const SRV = readFileSync(new URL('./tam-serveur.js', import.meta.url), 'utf8');
t('the server still joins the engine reasons and passes the codes through (the shape this test feeds the gate)',
  SRV.includes("pourquoi: c.ok ? null : (c.raisons || []).join('; ')") && SRV.includes('const { oeuvre: _o, octets, signature: _s, ...reste } = c;'));

const TAM = readFileSync(new URL('./tam-onglet.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const prep = TAM.slice(TAM.indexOf('async function preparerMint('), TAM.indexOf('/* ── game374 : Replay'));
const iPret = prep.indexOf("if (planUsdc.etat !== 'PRET')"), iVide = prep.indexOf("dit.textContent = '';"), iSigne = prep.indexOf('signe.hidden = false;');
t('the status line is cleared once the plan is ready, before "You sign" is shown', iPret > 0 && iVide > iPret && iSigne > iVide);
t('… and nothing writes to it again before the wallet button is pressed', !/dit\.textContent = '[^']/.test(prep.slice(iVide + 1, prep.indexOf("dit.textContent = 'Waiting for your wallet…';"))));

console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
