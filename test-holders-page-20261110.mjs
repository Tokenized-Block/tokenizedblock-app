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
/* 2026-11-12 (UI copy rule, Phil): no version or internal status on screen; test-copy-pack-375-20261112.mjs scans the rendered text */
/* 2026-11-12 (the economy pack is live): the holders vault and the lock rewards are LIVE; their rules are READ on chain (economie-pack.js
 *   texteRegleVault, REGLES_VAULT) and said by what they do — the "coming soon" vault row and the first vault's fixed holds are gone */
t('the lock row says what it earns and what reads the lock (hearts, vault claims), never "coming soon" once live', H.includes("['🔒', 'Lock TBLOCK', ") && H.includes('it is what hearts and holders vault claims count') && !H.includes('Today it earns points only'));
t('games listed, open to all, and said not to count as play; TAM art and skins listed with the router', /'Games \(Spin, Roll, Duels\)'/.test(H) && /<span class="st ok">OPEN<\/span>/.test(H) && H.includes("'TAM art and skins'") && H.includes('paid through the TBLOCK payment router'));
t('the live vault: its rules read on chain (texteRegleVault), the minimum LOCKED from Hearts; no "coming soon" vault row', H.includes('r.vault = EP.texteRegleVault(v);') && H.includes("besoinVerrou(R.holdUsd != null ? EP.usd(R.holdUsd) : '', tok(R.minHold)") && H.includes("minHoldTexte + ' TBLOCK locked'") /* game377 */ && !H.includes('Coming soon — the holders vault'));
t('the first contracts\' fixed holds are no longer shown as the rule', !/CLAIM_MIN_HOLD|LIKE_MIN_HOLD|LIKE_PRICE/.test(H));
t('the lock line: "coming soon" while undeployed, a link to lock in the app once deployed (game352)', /lockPret \? '<a class="st ok" href="\/#wallet">LOCK IN THE APP →<\/a>' : VENIR\(\)/.test(H) && H.includes("const VENIR = () => '<span class=\"st na\">coming soon</span>';") && /import \* as LK from '\.\/lock\.js';/.test(H));
/* game370 (Phil 2026-11-11: "$15 gives access; the biggest holders gain more from $100 locked"): the tiers, word for word in test-vault-v2-paliers-370 */
t('lock.js and its data are served', /'lock\.js', 'lock-deploiement\.js'/.test(SRV));
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
