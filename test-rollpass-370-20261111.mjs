/* test-rollpass-370-20261111.mjs — the fees page named ONE product twice.
 *
 * Measured 2026-11-11 (eth_call, Base mainnet, BlockRolls 0x0c5b490196f06db40ab8af68ecb2313029460fe9 from blockrolls-deploiement.js):
 *   PASS_PRICE() = 10000000, PASS_ROLLS() = 30, PASS_WINDOW() = 86400, POT_SHARE_BPS() = 5000 — the deploy record's constructor args.
 * Prod /api/tirage (x-ms-monitor: 1) serves rolls.contrat = that same address, prixPass = 10000000, passRolls = 30.
 * app.html: the "Week pass" button (#jourPass) runs passPaye() -> planPass() -> BlockRolls buyPass(); the server reads PassBought and
 *   credits 7 days of tickets + 3 bonus entries (tirage-saison.js crediterPassSemaine). So the "Week pass" IS the BlockRolls pass.
 * Old frais-risques.js: a "Roll pass" row (price, 30 rolls / 24 h) AND a separate price-less "Week pass" row (7 days) — read as two products,
 *   and "Roll pass" is a name the app never shows.
 * Expected: no "Roll pass"; exactly ONE "Week pass" row, priced, saying both halves (contract + server), every number from CHIFFRES. */
import { readFileSync } from 'node:fs';
import * as FR from './frais-risques.js';

let ko = 0;
const ok = (c, m) => { console.log((c ? 'OK  ' : 'KO  ') + m); if (!c) ko++; };

const rangees = (html) => [...html.matchAll(/<tr><th scope="row">([^<]*)<\/th><td class="n">([^<]*)<\/td><td>(.*?)<\/td><\/tr>/g)].map((m) => ({ quoi: m[1], combien: m[2], detail: m[3] }));
const heures = (s) => (s % 3600 === 0 ? String(s / 3600) : (s / 3600).toFixed(2)) + ' hours';
const jours = (n) => n + (n === 1 ? ' day' : ' days');

function verifier(C, etiquette) {
  const r = rangees(FR.rendre(C, null));
  ok(!r.some((x) => /roll pass/i.test(x.quoi)), etiquette + ': no "Roll pass" row (the app sells no product by that name)');
  const wp = r.filter((x) => x.quoi === 'Week pass');
  ok(wp.length === 1, etiquette + ': exactly one "Week pass" row (found ' + wp.length + ')');
  const w = wp[0] || { combien: '', detail: '' };
  ok(w.combien === FR.usdc(C.rolls.passPrice), etiquette + ': Week pass price = PASS_PRICE ' + FR.usdc(C.rolls.passPrice) + ' (got "' + w.combien + '")');
  for (const bout of [C.rolls.passRolls + ' rolls', heures(C.rolls.passWindow), jours(C.tirage.joursPassSemaine), C.tirage.bonusPassSemaine + ' bonus entries', 'BlockRolls'])
    ok(w.detail.includes(bout), etiquette + ': Week pass row says « ' + bout + ' »');
}

verifier(FR.CHIFFRES, 'real');
const faux = structuredClone(FR.CHIFFRES);
faux.rolls.passPrice = 12000000n; faux.rolls.passRolls = 25; faux.rolls.passWindow = 172800; faux.tirage.joursPassSemaine = 5; faux.tirage.bonusPassSemaine = 2;
verifier(faux, 'fake sources');

/* the app tile and button are the right product: Week pass -> BlockRolls buyPass via planPass */
const APP = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
ok(/id="jourPass"[^>]*>Week pass</.test(APP), 'app.html: the #jourPass button reads "Week pass"');
const i = APP.indexOf('async function passPaye()'), jr = i < 0 ? -1 : APP.slice(i).search(/\r?\n\}/), j = jr < 0 ? -1 : i + jr; /* EOL-proof (test-tests-portables) */
ok(i > 0 && /planPass\(/.test(APP.slice(i, j)), 'app.html: passPaye() buys through planPass (BlockRolls buyPass)');
ok(!/Roll pass/.test(APP), 'app.html: never says "Roll pass"');

console.log(ko ? '\nRED: ' + ko + ' failure(s)' : '\nGREEN: all checks pass');
process.exit(ko ? 1 : 0);
