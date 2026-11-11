/* test-puce-revue-5usd-20261111.mjs — game351 (Grok QA of game348, 2026-11-11): the TBLOCK pair chip said only "Quote = B20 TBLOCK"; the
 *   review recap still showed the 0.001 ETH fee (Phil: "must be changed"). The main Create path is priced $5, TBLOCK first.
 * Reads the REAL app.html. NE PROUVE PAS: the rendering (Grok re-checks on prod). The older birth paths that DO ask exactly 0.001 ETH of the
 *   wallet (resuming an old birth, a block made elsewhere) keep their ETH amount: writing "$5" there would be false. */
import { readFileSync } from 'node:fs';
import { libellePuceCreation } from './paires.js';
const APP = readFileSync(new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let ok = 0, ko = 0;
const t = (m, c) => { if (c) ok++; else { ko++; console.log('KO', m); } };
t('TBLOCK chip = the same sentence as every pair', /if \(q\.paire\.type === 'TBLOCK'\) chip\.textContent = libellePuceCreation\(\{ symbole: 'TBLOCK' \}\);/.test(APP)
  && libellePuceCreation({ symbole: 'TBLOCK' }) === 'Quote = TBLOCK — buyers pay in TBLOCK');
t('B20 chip = the same sentence', /else if \(q\.paire\.type === 'B20'\) chip\.textContent = libellePuceCreation\(\{ symbole: q\.paire\.symbole \|\| 'this block' \}\);/.test(APP));
t('no "Quote = B20 " chip left', !/'Quote = B20 '/.test(APP));
t('review recap: $5, TBLOCK first, no 0.001 ETH line', /\? \['Price: \$5 in all, TBLOCK first — your wallet shows each exact request'\]\n\s+: \['Price: \$5 in all, TBLOCK first — your wallet shows each exact request'\]\)\] : \[\];/.test(APP)
  && !/'Create \+ 0\.001 ETH \(your wallet shows the exact request\)'/.test(APP) && !/'Instant Birth = create \+ open fee 0\.001 ETH/.test(APP));
t('Create button: $5 (game365: the choice card that said "$5, TBLOCK first" is gone)', APP.includes('Connect wallet → review → Instant Birth · $5') && !/born and brought to life for \$5, TBLOCK first/.test(APP));
t('share cards (meta, og, twitter) say $5', /name="description" content="Make a living block on Base for \$5 —/.test(APP) && /og:description" content="\$5: your block is born/.test(APP) && /twitter:description" content="\$5: your block is born/.test(APP));
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
