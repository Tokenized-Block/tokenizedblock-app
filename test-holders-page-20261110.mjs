/* test-holders-page-20261110.mjs — game350 holders.html (Phil 2026-11-10: "the vault from $15 locked, the more you lock the bigger the reward;
 *   list the other holder accesses; simpler: send people to BaseStonk for our token; adapt the colour the user chose").
 * Reads the REAL file. Measured separately in a browser (local server): the four palettes follow localStorage 'tb.teinte', the link opens
 *   basestonk.io/tokens/<TBLOCK> ("TokenizedBlock ($TBLOCK)", read 2026-11-10), no console error. NE PROUVE PAS: a purchase on BaseStonk. */
import { readFileSync } from 'node:fs';
const H = readFileSync(new URL('./holders.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const SRV = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
let ok = 0, ko = 0;
const t = (m, c) => { if (c) ok++; else { ko++; console.log('KO', m); } };

t('the theme is applied before the first paint, from the app\'s own key', /<script>try \{ const t = localStorage\.getItem\('tb\.teinte'\); if \(\/\^\[bcd\]\$\/\.test\(t \|\| ''\)\) document\.documentElement\.setAttribute\('data-teinte', t\); \} catch \(_\) \{\}<\/script>/.test(H));
for (const k of ['b', 'c', 'd']) t('palette ' + k + ' defined', new RegExp(':root\\[data-teinte="' + k + '"\\]\\{[^}]*--acc:').test(H));
t('no hard-coded purple left on the buttons or the hero', !/#9560f0|#bd51ec|rgb\(167 139 250 \/ \.18\)/.test(H));
t('buy = ONE link to OUR token on BaseStonk, by address', /<a class="btn" id="achatBaseStonk" href="https:\/\/basestonk\.io\/tokens\/0xb200000000000000000000ba9bf8330307f8830e" target="_blank" rel="noopener">/.test(H));
t('the in-page buy batch is gone (no plan, no wallet_sendCalls)', !/acheterIci|montantUsdc|\/api\/rails\/plan|wallet_sendCalls/.test(H));
t('the address warning (another token shares the name)', /another token uses the same name; check the address before you buy/.test(H));
t('game357: the lock row says it earns points only today (v1 reads the wallet balance)', H.includes("'Lock TBLOCK: community points now, the holder stage with vault v2'") && H.includes('Today it earns points only: hearts, the channel and vault claims still count your wallet balance') && !H.includes("'The holder stage: $' + prix.seuil + ' of TBLOCK LOCKED"));
t('the lock line: "coming" while undeployed, a link to lock in the app once deployed (game352)', /lockPret \? '<a class="st ok" href="\/#wallet">LOCK IN THE APP →<\/a>' : VENIR\('lock contract to deploy'\)/.test(H) && /import \* as LK from '\.\/lock\.js';/.test(H));
t('games and the TAM mint listed, open to all', /'Games \(Spin, Roll, Duels\) and the TAM mint'/.test(H) && /<span class="st ok">OPEN<\/span>/.test(H));
t('vault v2 (from $15 locked, amount x time) shown as in review, never as live', /'Vault v2: from \$' \+ prix\.seuil \+ ' locked, weighted by amount × time locked'/.test(H) && /VENIR\('in review'\)/.test(H));
t('today\'s real vault rule still shown (17.2M held, contract)', /today: the week\\'s players claim with ' \+ tok\(CLAIM_MIN_HOLD\)/.test(H));
t('lock.js and its data are served', /'lock\.js', 'lock-deploiement\.js'/.test(SRV));
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
