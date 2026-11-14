/* test-vault-v2-paliers-370-20261111.mjs — game370 (Phil 2026-11-11: "just that it gives access, and the biggest holders gain more from $100
 *   locked"). AFFIRME on the REAL files:
 *   - every user-facing text that describes the v2 claim says the tiered rule, word for word (RULE below), and the old "1.0x .. 1.5x / up to
 *     4x the minimum / grows with how much / weighted by amount x time" wording is gone;
 *   - the holders vault card keeps today's v1 rule read from the contract record (tok(CLAIM_MIN_HOLD) = 17,200,000 TBLOCK held), and v2 stays
 *     "in review", never shown as live;
 *   - the frozen deploy data is the TIERED vault: its creation code carries MAX_FACTOR 17,500 (PUSH2 0x445c) and the 1,500 / 3,000 bonuses,
 *     and no longer the old 15,000 ceiling (PUSH2 0x3a98).
 *   2026-11-12: the vault now ships inside the six-step PACK (economie-v2-pack-deploiement.js, deployer-economie-v2.html); the old
 *     two-signature record economie-v2-deploiement.js is no longer served nor offered, so these checks read the PACK record (V step):
 *     integrity (pack-economie-v2.js integrite), the tiers in V's code, the start price read live for the pack (5376574940901).
 * NE PROUVE PAS: a deploy (nothing is deployed), the contract math (forge: Review_tiers_*.t.sol, EconomieV2Tiers.fork.t.sol). */
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { PACK_ECONOMIE_V2 as D } from './economie-v2-pack-deploiement.js';
import { integrite } from './pack-economie-v2.js';
const lire = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const H = lire('holders.html'), APP = lire('app.html'), DEP = lire('deployer-economie-v2.html');
let ok = 0, ko = 0;
const t = (m, c, x = '') => { if (c) ok++; else { ko++; console.log('KO', m, x); } };
/* 2026-11-12 (UI copy rule, Phil): the rule in Phil's own words; no version, no internal status on screen ("Coming soon" + what it does).
 *   test-copy-pack-375-20261112.mjs scans the rendered text of holders.html, the pack page and these app strings for banned words. */
const RULE = '$15 locked to claim; more from $100 locked (+15% at $100, +30% at $500, +50% at $1,000); up to +25% more for 90 days locked; you must play that week (a heart, a TAM mint or a skin)';

/* holders.html: today's vault card, and the coming vault row */
const wc = APP.slice(APP.indexOf("const wc = $('#wVaultComment');"), APP.indexOf('void peindreCoeursWallet();', APP.indexOf("const wc = $('#wVaultComment');")));
/* 2026-11-12 (the economy pack is live): the holders vault and the lock rewards are LIVE; their rules are READ on chain (economie-pack.js
 *   texteRegleVault, REGLES_VAULT) and said by what they do — the "coming soon" vault row and the first vault's fixed holds are gone */
t('holders: the vault rule is the live vault\'s, read on chain; no coming-soon row; no version or status word', H.includes('r.vault = EP.texteRegleVault(v);') && !H.includes('Coming soon — the holders vault') && !/written, under review|fork test|not deployed|Vault v2|in review/.test(H.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '')));
t('app: the vault explainer says the same live rule (texteRegleVault) and that you must play that week', wc.includes('(wVaultRegle || ') && wc.includes('You must play that week: a heart or a TAM art mint.') /* game405: a skin mint is not a play */ && APP.includes('wVaultRegle = EP.texteRegleVault(r);'));
t('app: the explainer has no version or status word', !/not deployed|fork-tested|reviewed|\(v1\)|\bv2\b|Coming soon, the holders vault/.test(wc));
const TXT = (await import('./economie-pack.js')).texteRegleVault({ ACCESS_USD: 15n, TIER1_USD: 100n, TIER2_USD: 500n, TIER3_USD: 1000n, TIER1_BONUS: 1500n, TIER2_BONUS: 3000n, TIER3_BONUS: 5000n, TIME_BONUS: 2500n, TIME_FULL: 7776000n, MIN_COMMIT: 604800n, MAX_FACTOR: 17500n, CLAIM_WINDOW: 1209600n, REWARD_BPS: 5000n, REBATE_BPS: 5000n, TOP_BPS: 2000n });
t('the live rule in words, from the vault\'s own constants: $15 to claim, +15% from $100, +30% from $500, +50% from $1,000, up to +25% for 90 days', TXT.includes('$15 of TBLOCK locked') && TXT.includes('+15% from $100 locked, +30% from $500, +50% from $1,000, and up to +25% more for 90 days left on the lock'));
t('holders: the old "grows with how much and how long" line is gone', !H.includes('the reward grows with how much and how long you lock'));
t('holders: no "weighted by amount × time" left', !H.includes('weighted by amount × time locked'));
/* app.html: the folded "How the holders vault works" */
/* deployer-economie-v2.html: now the six-step pack page; it states no claim rule of its own, and never the old one */
t('deploy page: it is the pack page (witness)', DEP.includes("await import('./economie-v2-pack-deploiement.js')"));
t('deploy page: no "1.5x" / "4x the minimum" / "closer to the full play share" left', !/1\.0x \.\. 1\.5x|4x the minimum|closer to the full play share/.test(DEP));
/* the frozen data = the tiered vault, as the pack will deploy it */
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const VS = D.etapes.find((e) => e.lettre === 'V'), LS = D.etapes.find((e) => e.lettre === 'L');
t('frozen pack integrity (every step and the pack sha256)', (await integrite(D)).length === 0, (await integrite(D)).join());
t('frozen vault step = TBlockVaultV2 from the current source', VS.nom === 'TBlockVaultV2' && sha(lire('contracts/src/TBlockVaultV2.sol')) === VS.sha256Source, VS.sha256Source);
const n = (h) => VS.init.split(h).length - 1;
t('frozen vault code carries MAX_FACTOR 17,500 and the +15 % / +30 % bonuses', n('61445c') > 0 && n('6105dc') > 0 && n('610bb8') > 0, [n('61445c'), n('6105dc'), n('610bb8')].join('/'));
t('frozen vault code no longer carries the old 15,000 ceiling', n('613a98') === 0);
t('frozen start price = the lower live price read for the pack (floor x 1e18)', D.prix.startPriceE18 === '5376574940901' && LS.config.startPrice === '5376574940901' && LS.config.priceFloor === String(5376574940901n / 50n) && LS.config.priceCeil === String(5376574940901n * 100n));
t('frozen record is the real one, not a test fixture', D.fixtureDeTest === false && D.sha256Pack === '5601fcb593503de87dd953e9e3c53758b66985c3ccea52a2c3a92212c8c0ffed', D.sha256Pack);
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
