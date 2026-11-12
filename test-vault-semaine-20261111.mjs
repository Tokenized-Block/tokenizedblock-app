/* test-vault-semaine-20261111.mjs — game359 (Phil 2026-11-11: "Vault : valeur en $, date de fin de semaine, montant réservé attendu, montre à
 *   combien de joueurs, et fusionne reserved for players avec le vault"). AFFIRME on the REAL economie.js / coeurs.js / app.html / serveur-web.js:
 *   - budgetAttendu applies TBlockVault.closeEpoch's three caps in its order (free x REWARD_BPS, MAX_EPOCH_BUDGET, spent x REBATE_BPS x 2) —
 *     the contract source is read here and the three lines are checked to still be what the function copies;
 *   - joueursParSemaine counts DISTINCT heart givers per epoch and their burned TBLOCK; the server serves it as `semaines`;
 *   - the card: one merged "In the vault" line (with $ and the reserved part inside), the week's end READ from BlockLikes.epochEnd, the players,
 *     and "For them at the close" from budgetAttendu; no separate "Reserved for players" row; no figure typed in the page.
 * NE PROUVE PAS: a real closeEpoch with hearts (0 hearts on mainnet on 2026-11-11: the read gives 0), the rendering. */
import { readFileSync } from 'node:fs';
import { budgetAttendu, VIEW, SEL } from './economie.js';
import { joueursParSemaine } from './coeurs.js';
const rd = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const APP = rd('app.html'), SRV = rd('serveur-web.js'), SOL = rd('contracts/src/TBlockVault.sol');
let ok = 0, ko = 0;
const t = (m, c, x = '') => { if (c) ok++; else { ko++; console.log('KO', m, x); } };
const E = 10n ** 18n;
const base = { rewardBps: 5000n, rebateBps: 5000n, maxBudget: 50_000_000n * E };
t('no hearts this week: 0, whatever the vault holds', budgetAttendu({ ...base, free: 549_434n * E, totalSpent: 0n }) === 0n);
t('few hearts: capped by what they burned (spent x 50% x 2 = spent)', budgetAttendu({ ...base, free: 549_434n * E, totalSpent: 86_000n * E }) === 86_000n * E);
t('many hearts: capped by half the free balance', budgetAttendu({ ...base, free: 549_434n * E, totalSpent: 10_000_000n * E }) === 549_434n * E / 2n);
t('huge vault: capped by MAX_EPOCH_BUDGET', budgetAttendu({ ...base, free: 1_000_000_000n * E, totalSpent: 900_000_000n * E }) === 50_000_000n * E);
t('the contract still computes it this way (the three lines copied)', SOL.includes('budget = free() * REWARD_BPS / BPS;') && SOL.includes('if (budget > MAX_EPOCH_BUDGET) budget = MAX_EPOCH_BUDGET;')
  && SOL.includes('uint256 payable_ = total * REBATE_BPS / BPS * 2;') && SOL.includes('if (budget > payable_) budget = payable_;'));
t('views: epochEnd + totalSpentIn on BlockLikes, free / REWARD_BPS / REBATE_BPS / MAX_EPOCH_BUDGET on the vault', VIEW.epochEnd(0).data === '0x' + SEL.epochEnd + '0'.repeat(64)
  && SEL.REWARD_BPS && SEL.MAX_EPOCH_BUDGET && SEL.totalSpentIn && VIEW.free().data === '0x' + SEL.free);
const j = joueursParSemaine([{ epoch: 0, liker: 'a', burned: 5n }, { epoch: 0, liker: 'a', burned: 5n }, { epoch: 0, liker: 'b', burned: 1n }, { epoch: 1, liker: 'a', burned: 2n }]);
t('players per week: distinct givers and burned', j[0].joueurs === 2 && j[0].burned === 11n && j[1].joueurs === 1 && j[1].burned === 2n);
t('server serves the weeks', SRV.includes('semaines: joueursParSemaine(tous),'));
const f = APP.slice(APP.indexOf('async function peindreVaultWallet('), APP.indexOf('async function peindreVaultWallet(') + 11000); /* lot 378 task 6: the card is drawn, its function is longer; game386: + the reading line and the claim link */
/* 2026-11-12 (the economy pack is live): the same card on the live vault (EP): the week's play = hearts + TAM art + skins (totalPlayIn), the
 *   heart givers of Hearts only (/api/coeurs semainesParContrat), the close budget from the live vault's caps */
/* lot 378 task 6: the vault figure is drawn big (hvHero) — still ONE block, with the $ and the reserved part inside it */
t('card: one merged vault line, with $ and the reserved part inside', f.includes("hero.append(mk('span', 'hvK', 'In the vault'), ' ', mk('b', 'hvGros', EP.fmt(bal) + ' TBLOCK'), mk('span', 'hvSous', usd(bal) + (res > 0n ?") && !f.includes("ligne('Reserved for players'"));
t('card: the week end READ from Hearts epochEnd, never typed', f.includes('lit(EP.VIEW.epochEnd(ep))') && f.includes("bs.append(tete('Week ' + ep + ' ends', HV.minute(fin) + dans));") /* lot 378 task 6: drawn with its bar; HV.minute = the same ISO minute + UTC */);
t('card: heart givers from /api/coeurs (Hearts only); left out when unread', f.includes('c.semainesParContrat[EP.HEARTS]') && f.includes("(joueurs === null ? '' : ' · ' + joueurs"));
t('card: what the close would reserve, from budgetAttendu, said as "if the week closed now"', f.includes('EP.budgetAttendu({ free: libre, totalPlay: jeu,') && f.includes("' if the week closed now'"));
t('card: $ only from the price read (no price -> no $)', f.includes("const usd = (raw) => (px === null ? '' :"));
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
