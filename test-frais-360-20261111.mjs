/* test-frais-360-20261111.mjs — game360 (Phil 2026-11-11: "recheck frais-et-risques, ça a l'air faux"; audit workflow, each finding verified).
 * AFFIRME on the REAL frais-risques.js / frais-et-risques.html:
 *   - the page passes the week pot to rendre() (it never did: the row always said "not read");
 *   - "No custody" no longer says the app holds no key at all; the fly's own key is said;
 *   - the 0.1% Aerodrome / TBLOCK route fee, the holders' 0% fee, the optional 10% TBLOCK buy, slots, TAM, messages, hearts, contest and
 *     the lock are listed, each with its figure READ from CHIFFRES (themselves read from the deploy files / modules);
 *   - the new risks are said: slots lose on average, the vault's dev rescue and open feedContest, the TicketPot verifier, the server-side
 *     holder fee, the lock exit date, burned votes, buybacks not running, two tokens named TBLOCK (real one linked).
 * NE PROUVE PAS: the rendering in a browser. */
import { readFileSync } from 'node:fs';
import * as FR from './frais-risques.js';
const HTML = readFileSync(new URL('./frais-et-risques.html', import.meta.url), 'utf8');
let ok = 0, ko = 0;
const t = (m, c, x = '') => { if (c) ok++; else { ko++; console.log('KO', m, x); } };
t('the page passes the week pot', HTML.includes('ticketpot: d.ticketpot || null'));
const r = FR.rendre(FR.CHIFFRES, null), txt = r.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
t('no "the app holds no key" claim', !/the app holds no key/i.test(txt));
t('the fly key is said', txt.includes('The fly trader signs on its own') && txt.includes('kept unencrypted in this browser only'));
/* game374 (audit F-holder-1): the holder row now names its two routes in its label */
for (const k of ['TBLOCK holders: TBLOCK and USDC ↔ stock trades 0% app fee', 'Buy or sell TBLOCK 0.1% app fee', 'Optional TBLOCK buy after a USDC payment 10% of the price', 'Slots spin 0.50 USDC', 'TAM art mint 5 USDC',
  'Message to a block 0.10 USDC or 1,000 TBLOCK', 'Heart (+1) 86,000 TBLOCK', 'Block contest entry 17,241 TBLOCK · vote 8,621 TBLOCK', 'TBLOCK lock no fee'])
  t('row: ' + k, txt.includes(k));
t('0.5% said as the v4 single-market fee, 0.1% as Aerodrome/v3', txt.includes('0.5% on a single Uniswap v4 market; 0.1% on an Aerodrome or Uniswap v3 pool'));
for (const k of ['Slots lose on average.', 'Holders vault.', 'Anyone can also call feedContest()', 'Who controls the week\'s reward pot.', 'is a server decision, not an on-chain right.',
  'or at the lock date if that is later', 'Contest votes are burned.', 'Buybacks are not running.', 'Two tokens are named TBLOCK.'])
  t('risk: ' + k, txt.includes(k));
t('the real TBLOCK is linked', r.includes('0xb200000000000000000000ba9bf8330307f8830e'));
/* nothing typed: swap the new figures, the page follows */
const f = structuredClone(FR.CHIFFRES);
f.slots.spinPrice = 900000n; f.tam.prix = 6000000n; f.message.usdc = 200000n; f.contest.vote = 1n * 10n ** 18n; f.cl.bps = 20n;
const rf = FR.rendre(f, null).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
t('swapped figures are what the page says', rf.includes('Slots spin 0.90 USDC') && rf.includes('TAM art mint 6 USDC') && rf.includes('Message to a block 0.20 USDC') && rf.includes('vote 1 TBLOCK') && rf.includes('Buy or sell TBLOCK 0.2% app fee') && rf.includes('(0.60 USDC on a 6 USDC mint)'));
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
