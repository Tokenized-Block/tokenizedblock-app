/* test-frais-batch-texte-369-20261111.mjs — game369 (Grok test plan, R7, 2026-11-11): the Fees & risks row said the TBLOCK buy after a
 *   USDC payment runs "as one all-or-nothing batch", while since game361 a wallet that cannot group calls (Rabby) signs the SAME calls one
 *   by one, and the TAM tab offers "Finish the TBLOCK buy" without a new mint. AFFIRME on the REAL frais-risques.js / tam-onglet.js. */
import { readFileSync } from 'node:fs';
const FR = readFileSync(new URL('./frais-risques.js', import.meta.url), 'utf8');
const TAM = readFileSync(new URL('./tam-onglet.js', import.meta.url), 'utf8');
let ok = 0, ko = 0;
const t = (m, c) => { if (c) ok++; else { ko++; console.log('KO', m); } };
t('no "all-or-nothing batch" promise left on the fees row', !FR.includes('as one all-or-nothing batch after the payment'));
t('the row says both paths: one batch, or signed one by one', FR.includes('one batch when your wallet can group calls, otherwise the same calls signed one by one'));
t('the row names the finish step, which really exists in the TAM tab', FR.includes('offers to finish the buy without a new mint') && /Finish the TBLOCK buy/.test(TAM));
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
