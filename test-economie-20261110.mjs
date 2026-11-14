// test-economie-20261110.mjs — economie.js (page side of BlockLikes + TBlockVault), pure. No network.
// Proves: every selector = keccak of the signature REBUILT from the Solidity sources; the +1 batch approves EXACTLY n * price to the
// likes contract then likes; likeCheck refuses before the wallet when paying would break the hold; word() never reads a cut answer as 0;
// the constructor tail = 11 words in the struct order of the source; buttons cannot be built while an address is null; served list.
// Does NOT prove: the deployed contracts (see banc-economie-deploy-fork-20261110.mjs, fork), nor a wallet signing.
import { readFileSync } from 'node:fs';
import { selecteur } from './keccak.js';
import * as E from './economie.js';
import { ECONOMIE_DEPLOIEMENT as D } from './economie-deploiement.js';
let ok = 0, ko = 0;
const t = (n, c, x = '') => { if (c) ok++; else { ko++; console.log('RED', n, x); } };
const sol = readFileSync(new URL('./contracts/src/BlockLikes.sol', import.meta.url), 'utf8') + readFileSync(new URL('./contracts/src/TBlockVault.sol', import.meta.url), 'utf8');
const sigs = new Map();
for (const m of sol.matchAll(/function\s+(\w+)\s*\(([^)]*)\)\s*(external|public)/g)) sigs.set(m[1], m[1] + '(' + m[2].split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.split(/\s+/)[0]).join(',') + ')');
for (const m of sol.matchAll(/^\s*(mapping\(.*\)|[\w\[\]]+)\s+public\s+(?:constant\s+|immutable\s+)?(\w+)\s*[;=]/gm)) sigs.set(m[2], m[2] + '(' + [...m[1].matchAll(/mapping\(\s*(\w+)\s*=>/g)].map((k) => k[1]).join(',') + ')');
for (const k of ['like', 'likesOf', 'currentEpoch', 'spentIn', 'claim', 'owed', 'epochs', 'reserved', 'free', 'rescueAmount', 'rescueAt', 'rescueRenounced', 'closeEpoch', 'feedContest'])
  t('selector ' + k + ' = keccak(' + sigs.get(k) + ')', sigs.has(k) && E.SEL[k] === selecteur(sigs.get(k)).slice(2), sigs.get(k));
t('approve / balanceOf are the ERC-20 ones', E.SEL.approve === '095ea7b3' && E.SEL.balanceOf === '70a08231');

t('prices read from the frozen deployment', E.LIKE_PRICE === 86000n * 10n ** 18n && E.LIKE_MIN_HOLD === 2580000n * 10n ** 18n && E.CLAIM_MIN_HOLD === 17200000n * 10n ** 18n);
t('isB20', E.isB20('0xb200000000000000000000e4b0c5fbe9c8df579e') && !E.isB20('0xb300000000000000000000e4b0c5fbe9c8df579e') && !E.isB20('0xb2') && !E.isB20(null));
let c = E.likeCheck({ balance: E.LIKE_MIN_HOLD + E.LIKE_PRICE });
t('likeCheck: exactly price + hold passes', c.ok && c.cost === E.LIKE_PRICE);
c = E.likeCheck({ balance: E.LIKE_MIN_HOLD + E.LIKE_PRICE - 1n });
t('likeCheck: one wei short of the hold refused, says why', !c.ok && /must still hold/.test(c.why));
c = E.likeCheck({ balance: E.LIKE_PRICE - 1n });
t('likeCheck: cannot pay refused', !c.ok && /to pay/.test(c.why));
t('likeCheck: n multiplies the cost', E.likeCheck({ balance: 10n ** 30n, n: 3 }).cost === 3n * E.LIKE_PRICE);

let threw = ''; try { E.word('0x' + '0'.repeat(63)); } catch (e) { threw = e.message; }
t('word: a cut answer throws (never 0)', /whole 32-byte/.test(threw));
threw = ''; try { E.word('0x'); } catch (e) { threw = e.message; }
t('word: empty throws', /whole 32-byte/.test(threw));
t('word: index', E.word('0x' + '0'.repeat(63) + '1' + '0'.repeat(63) + '2', 1) === 2n);
t('fmt', E.fmt(86000n * 10n ** 18n) === '86,000' && E.fmt(1234567n * 10n ** 17n, 1) === '123,456.7');

/* constructor tail: 11 static words in the struct order of the Solidity source */
const order = (readFileSync(new URL('./contracts/src/TBlockVault.sol', import.meta.url), 'utf8').match(/struct Config\s*\{([\s\S]*?)\}/) || [])[1]
  .split(';').map((s) => s.trim()).filter(Boolean).map((s) => s.split(/\s+/).pop());
t('Config has 13 fields', order.length === 13, order.join());
const LK = '0x' + 'ab'.repeat(20);
const tail = E.vaultArgs(LK), w = (i) => tail.slice(64 * i, 64 * (i + 1));
t('tail is 13 words', tail.length === 13 * 64);
t('two distinct rescue wallets, as Phil wrote them', E.VAULT_DEVS.join() === '0x264496cc303f8dbe49a241ea84cd42be8392bc80,0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b');
/* buyback v2 tail: 22 words; dest last; every other value = the deployed v1 parameters */
const VT = '0x' + 'cd'.repeat(20), bt = E.buybackArgs(VT), bw = (i) => BigInt('0x' + bt.slice(64 * i, 64 * (i + 1)));
const P = D.buyback.config;
t('buyback tail is 22 words', bt.length === 22 * 64);
t('buyback dest = the vault (last word)', bw(21) === BigInt(VT));
t('buyback keeper / pool manager / v3 pool = v1', bw(10) === BigInt(P.keeper) && bw(0) === BigInt(P.poolManager) && bw(6) === BigInt(P.v3Pool));
t('buyback caps = v1 (maxPerCall, minSpend, cooldown)', bw(12) === BigInt(P.maxPerCall) && bw(13) === BigInt(P.minSpend) && bw(14) === BigInt(P.cooldown));
t('buyback v4 key = v1 (fee 3000, spacing 60, hook)', bw(3) === 3000n && bw(4) === 60n && bw(5) === BigInt(P.v4Key[4]));
t('buyback creation = init + tail', E.buybackCreation(VT) === D.buyback.init + bt);
const want = { tblock: D.vault.config.tblock, likes: LK, contest: D.vault.config.contest };
for (let i = 0; i < order.length; i++) {
  const f = order[i], v = f in want ? BigInt(want[f]) : BigInt(D.vault.config[f]);
  t('word ' + i + ' = ' + f, BigInt('0x' + w(i)) === v);
}
t('vaultCreation = init + tail', E.vaultCreation(LK) === D.vault.init + tail);

/* while an address is null, no call can be built (the UI hides the buttons) */
if (!E.LIKES) { threw = ''; try { E.likeBatch({ block: '0xb200000000000000000000e4b0c5fbe9c8df579e' }); } catch (e) { threw = e.message; } t('likeBatch refuses while BlockLikes is not deployed', /coming soon/.test(threw)); }
else {
  const b = E.likeBatch({ block: '0xb200000000000000000000e4b0c5fbe9c8df579e', n: 2 });
  t('like batch: approve EXACTLY 2 * price to LIKES, then like', b.length === 2 && b[0].to === E.TBLOCK && b[0].data === '0x' + E.SEL.approve + E.wAddr(E.LIKES) + E.wUint(2n * E.LIKE_PRICE)
    && b[1].to === E.LIKES && b[1].data === '0x' + E.SEL.like + E.wAddr('0xb200000000000000000000e4b0c5fbe9c8df579e') + E.wUint(2n));
  threw = ''; try { E.likeBatch({ block: '0xb2', n: 1 }); } catch (e) { threw = e.message; } t('like batch refuses a non-block', /not a block/.test(threw));
  threw = ''; try { E.likeBatch({ block: '0xb200000000000000000000e4b0c5fbe9c8df579e', n: 1001 }); } catch (e) { threw = e.message; } t('like batch refuses 1001', /1 to 1000/.test(threw));
}
if (!E.VAULT) { threw = ''; try { E.claimCall(0n); } catch (e) { threw = e.message; } t('claimCall refuses while the vault is not deployed', /coming soon/.test(threw)); }

const serv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
t('served: economie.js, economie-deploiement.js, deployer-economie.html', ["'economie.js'", "'economie-deploiement.js'", "'deployer-economie.html'"].every((s) => serv.includes(s)));
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
t('app: +1 sits on the name line', /<div class="bcNomLigne"><div class="bcNom" id="bcNom">[^<]*<\/div>\s*<span class="bcLike" id="bcLike" hidden>/.test(app));
/* 2026-11-12 (the economy pack is live): hearts are given on Hearts (BlockLikesV2): its OWN rule, read on chain before the wallet opens —
 *   likePrice() from the wallet, minHold() LOCKED — replaces the app-side $15 check of the first contract */
t('app: the click checks the contract rule (price, minimum LOCKED) then sends the likeBatch', /EP\.likeCheck\(\{ balance: bal, locked, likePrice: prix, minHold: need[\s\S]{0,2000}EP\.likeBatch\(\{ block: a, n: 1, likePrice: prix \}\)/.test(app)); /* game404: the weekly count's reads sit between (0,400 -> 0,2000) */
t('app: Community vault card in the Wallet tab, hidden while the vault is null', /<section class="volet" id="v-wallet"[\s\S]*?<div class="carte" id="wVault" hidden data-v="lock">[\s\S]*?<\/section>/.test(app)
  && /if \(!EP\.VAULT \|\| !EP\.HEARTS\) \{ carte\.hidden = true; return; \}/.test(app)); /* 2026-11-12: the live vault and Hearts */
t('app: hidden while Hearts is not on this network', /if \(!EP\.HEARTS \|\| !EP\.isB20\(a\)\) \{ box\.hidden = true;/.test(app));
/* contest.html: its $ is getElementById, so a '#' selector returns null and stops the render after the fund card (game333) */
{ const ch = readFileSync(new URL('./contest.html', import.meta.url), 'utf8');
  t('contest.html $ is getElementById', /const \$ = \(id\) => document\.getElementById\(id\)/.test(ch));
  t('contest.html never passes a # selector to its $', !/\$\(\s*['"]#/.test(ch), (ch.match(/\$\(\s*['"]#[^'"]*/g) || []).join(' ')); }
/* the addresses wired after the mainnet deployment was replayed byte for byte on a fork (2026-11-10, deployer 0x31e0...de3b nonces 144-146) */
t('likes address wired', E.LIKES === '0x343a289d5469a17726be9a0d219ee00721646f8a');
t('vault address wired', E.VAULT === '0x025d751752d3aa695fdb3d9eedee69bc9553f331');
t('buyback v2 address wired', D.adresseBuyback === '0x1afc3d27c37c9474a17ce83f03a18c4f95f102a3');
/* game345: the heart's hold = the LARGER of the contract's fixed amount and $15 at the price read (Phil: "$15 at the current price") */
{ const E18 = 10n ** 18n, P = E.LIKE_PRICE;
  t('$15 at $0.000005 = 3,000,000 TBLOCK', E.tblockPourUsd(15, 0.000005) === 3000000n * E18);
  t('price unread: no amount', E.tblockPourUsd(15, null) === null && E.tblockPourUsd(15, 0) === null);
  const ok3m = E.likeCheckUsd({ balance: P + 3000000n * E18, prixUsd: 0.000005 });
  t('price low: $15 rule stricter than the contract, exactly enough passes', ok3m.ok === true);
  const ko3m = E.likeCheckUsd({ balance: P + 2999999n * E18, prixUsd: 0.000005 });
  t('price low: one TBLOCK short of $15 is refused, with the amount', ko3m.ok === false && /\$15 of TBLOCK/.test(ko3m.why) && /3,000,000/.test(ko3m.why), ko3m.why);
  const hi = E.likeCheckUsd({ balance: P + E.LIKE_MIN_HOLD - 1n, prixUsd: 1 });
  t('price high: the contract fixed hold still applies (never looser than the contract)', hi.ok === false);
  t('price unread: refused with a sentence, never assumed', E.likeCheckUsd({ balance: P * 1000n, prixUsd: null }).ok === false);
  const appH = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
  /* 2026-11-12: likeCheckUsd stays in economie.js for the first contract; the app's heart now uses the live contract's own rule */
  t('app: the heart button no longer uses the app-side $15 check (the contract enforces its dollar rule)', !/ECO\.likeCheckUsd\(/.test(appH) && /EP\.likeCheck\(/.test(appH)); }
console.log(ko === 0 ? 'GREEN' : 'RED', ok + '/' + (ok + ko));
process.exitCode = ko ? 1 : 0;
