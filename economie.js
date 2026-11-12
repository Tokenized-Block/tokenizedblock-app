/* economie.js — the page side of the holders economy (BlockLikes "+1" and the TBlockVault holders vault), Phil 2026-11-10.
 * Builds UNSIGNED calls only; the person's own wallet signs everything. Nothing here holds, signs or sends.
 * Addresses come from economie-deploiement.js once each contract was READ on chain; until then they are null and the buttons stay hidden
 * (a button waiting for a contract is a draft, not a feature). */
import { selecteur } from './keccak.js';
import { ECONOMIE_DEPLOIEMENT as D } from './economie-deploiement.js';

export const TBLOCK = '0xb200000000000000000000ba9bf8330307f8830e';
export const LIKES = D.adresseLikes ? String(D.adresseLikes).toLowerCase() : null;
export const VAULT = D.adresseVault ? String(D.adresseVault).toLowerCase() : null;
export const LIKE_PRICE = BigInt(D.likes.config.likePrice);
export const LIKE_MIN_HOLD = BigInt(D.likes.config.minHold);
export const CLAIM_MIN_HOLD = BigInt(D.vault.config.minHold);

const strip = (h) => h.replace(/^0x/, '');
const S = (sig) => strip(selecteur(sig));
export const SEL = Object.freeze({
  approve: S('approve(address,uint256)'), balanceOf: S('balanceOf(address)'), like: S('like(address,uint256)'), likesOf: S('likesOf(address)'),
  currentEpoch: S('currentEpoch()'), spentIn: S('spentIn(uint256,address)'), claim: S('claim(uint256)'), owed: S('owed(uint256,address)'),
  epochs: S('epochs(uint256)'), reserved: S('reserved()'), free: S('free()'), rescueAmount: S('rescueAmount()'), rescueAt: S('rescueAt()'),
  rescueRenounced: S('rescueRenounced()'), closeEpoch: S('closeEpoch(uint256)'), feedContest: S('feedContest()'),
  /* game359: what the week's close will reserve (TBlockVault.closeEpoch) and when the week ends (BlockLikes.epochEnd) */
  epochEnd: S('epochEnd(uint256)'), totalSpentIn: S('totalSpentIn(uint256)'), REWARD_BPS: S('REWARD_BPS()'), REBATE_BPS: S('REBATE_BPS()'),
  MAX_EPOCH_BUDGET: S('MAX_EPOCH_BUDGET()'),
});
const ADR = /^0x[0-9a-f]{40}$/;
export function wAddr(a) { const s = String(a || '').toLowerCase(); if (!ADR.test(s)) throw new Error('not an address: ' + a); return strip(s).padStart(64, '0'); }
export function wUint(x) { const n = BigInt(x); if (n < 0n || n >= 1n << 256n) throw new Error('out of range'); return n.toString(16).padStart(64, '0'); }
const call = (to, sel, args = '') => Object.freeze({ to, data: '0x' + sel + args, value: '0x0' });

/** a block is a B20 address: top 10 bytes 0xb2000000000000000000 (the contract refuses anything else) */
export const isB20 = (a) => /^0xb2000000000000000000[0-9a-f]{20}$/.test(String(a || '').toLowerCase());

/** ONE batch for n "+1": approve EXACTLY n * LIKE_PRICE to BlockLikes, then like(block, n). Never an unlimited approval. */
export function likeBatch({ block, n = 1 }) {
  if (!LIKES) throw new Error('hearts are coming soon');
  const k = BigInt(n);
  if (k < 1n || k > 1000n) throw new Error('1 to 1000 likes per call');
  if (!isB20(block)) throw new Error('not a block address');
  return Object.freeze([call(TBLOCK, SEL.approve, wAddr(LIKES) + wUint(k * LIKE_PRICE)), call(LIKES, SEL.like, wAddr(block) + wUint(k))]);
}
/** what a like needs BEFORE the wallet opens: enough to pay AND still hold LIKE_MIN_HOLD after */
export function likeCheck({ balance, n = 1 }) {
  const cost = BigInt(n) * LIKE_PRICE, b = BigInt(balance);
  if (b < cost) return { ok: false, why: 'need ' + fmt(cost) + ' TBLOCK to pay, this wallet holds ' + fmt(b) };
  if (b - cost < LIKE_MIN_HOLD) return { ok: false, why: 'after paying, this wallet must still hold ' + fmt(LIKE_MIN_HOLD) + ' TBLOCK (it would hold ' + fmt(b - cost) + ')' };
  return { ok: true, cost };
}
/* game345 (Phil 2026-11-10: "$15 at the current price, computed"): the app ADDS the live $15 rule on top of the contract's fixed
 *   LIKE_MIN_HOLD — after paying, the wallet must still hold the LARGER of the two. `prixUsd` = the lower of the price now and ~10 min ago
 *   (the server's hold rule), so a pool pushed for one block does not open the door. Unread price -> refused with a sentence, never assumed. */
export const SEUIL_USD = 15;
export function tblockPourUsd(usd, prixUsd) {
  if (!(typeof prixUsd === 'number' && Number.isFinite(prixUsd) && prixUsd > 0)) return null;
  return BigInt(Math.ceil(usd / prixUsd)) * 10n ** 18n;
}
export function likeCheckUsd({ balance, n = 1, prixUsd, seuilUsd = SEUIL_USD }) {
  const base = likeCheck({ balance, n });
  if (!base.ok) return base;
  const need = tblockPourUsd(seuilUsd, prixUsd);
  if (need === null) return { ok: false, why: 'the TBLOCK price could not be read just now, so the $' + seuilUsd + ' rule cannot be checked — try again in a moment' };
  const reste = BigInt(balance) - base.cost;
  if (reste < need) return { ok: false, why: 'after paying, this wallet must still hold $' + seuilUsd + ' of TBLOCK at the price read now (' + fmt(need) + ' TBLOCK); it would hold ' + fmt(reste) };
  return { ok: true, cost: base.cost, minHold: need > LIKE_MIN_HOLD ? need : LIKE_MIN_HOLD };
}
export const claimCall = (epoch) => { if (!VAULT) throw new Error('the holders vault is coming soon'); return call(VAULT, SEL.claim, wUint(epoch)); };
export const VIEW = Object.freeze({
  likesOf: (b) => ({ to: LIKES, data: '0x' + SEL.likesOf + wAddr(b) }),
  balanceOf: (a) => ({ to: TBLOCK, data: '0x' + SEL.balanceOf + wAddr(a) }),
  currentEpoch: () => ({ to: LIKES, data: '0x' + SEL.currentEpoch }),
  owed: (e, a) => ({ to: VAULT, data: '0x' + SEL.owed + wUint(e) + wAddr(a) }),
  epochs: (e) => ({ to: VAULT, data: '0x' + SEL.epochs + wUint(e) }),
  vaultBalance: () => ({ to: TBLOCK, data: '0x' + SEL.balanceOf + wAddr(VAULT) }),
  reserved: () => ({ to: VAULT, data: '0x' + SEL.reserved }),
  rescueAmount: () => ({ to: VAULT, data: '0x' + SEL.rescueAmount }), rescueAt: () => ({ to: VAULT, data: '0x' + SEL.rescueAt }),
  rescueRenounced: () => ({ to: VAULT, data: '0x' + SEL.rescueRenounced }),
  epochEnd: (e) => ({ to: LIKES, data: '0x' + SEL.epochEnd + wUint(e) }), totalSpentIn: (e) => ({ to: LIKES, data: '0x' + SEL.totalSpentIn + wUint(e) }),
  free: () => ({ to: VAULT, data: '0x' + SEL.free }), rewardBps: () => ({ to: VAULT, data: '0x' + SEL.REWARD_BPS }),
  rebateBps: () => ({ to: VAULT, data: '0x' + SEL.REBATE_BPS }), maxEpochBudget: () => ({ to: VAULT, data: '0x' + SEL.MAX_EPOCH_BUDGET }),
});
/** game359: the budget TBlockVault.closeEpoch(e) would reserve for the week's players if it ran NOW — the contract's three caps, in its
 *  order (TBlockVault.sol closeEpoch): free × REWARD_BPS, then MAX_EPOCH_BUDGET, then totalSpentIn × REBATE_BPS × 2 (every share + the top
 *  bonus). A read, not a promise: the free balance can change before the close. */
export function budgetAttendu({ free, totalSpent, rewardBps, rebateBps, maxBudget }) {
  let b = BigInt(free) * BigInt(rewardBps) / 10000n;
  if (b > BigInt(maxBudget)) b = BigInt(maxBudget);
  const payable_ = BigInt(totalSpent) * BigInt(rebateBps) / 10000n * 2n;
  if (b > payable_) b = payable_;
  return b;
}
/** one 32-byte word -> BigInt; throws on anything else (a cut or empty answer is never read as 0) */
export function word(hex, i = 0) {
  const s = strip(String(hex || ''));
  if (!/^[0-9a-fA-F]*$/.test(s) || s.length < 64 * (i + 1) || s.length % 64) throw new Error('answer is not whole 32-byte words');
  return BigInt('0x' + s.slice(64 * i, 64 * (i + 1)));
}
export function fmt(raw, digits = 0) {
  const n = BigInt(raw), u = 10n ** 18n, w = n / u, f = (n % u).toString().padStart(18, '0').slice(0, digits).replace(/0+$/, '');
  return w.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : '');
}

/** the vault constructor tail: the Config struct is 13 STATIC fields, so abi.encode(Config) = 13 words in declaration order */
export function vaultArgs(likesAddress) {
  const c = D.vault.config;
  return wAddr(c.tblock) + wAddr(likesAddress) + wAddr(c.contest) + wUint(c.minHold) + wUint(c.rewardBps) + wUint(c.topBps) + wUint(c.rebateBps)
    + wUint(c.maxEpochBudget) + wUint(c.claimWindow) + wUint(c.maxFeedPerCall) + wUint(c.feedCooldown) + wAddr(c.dev) + wAddr(c.dev2);
}
export const vaultCreation = (likesAddress) => D.vault.init + vaultArgs(likesAddress);
export const VAULT_DEVS = Object.freeze([String(D.vault.config.dev).toLowerCase(), String(D.vault.config.dev2).toLowerCase()]);

/** int24 / int256 word (two's complement), for the buyback's tick bounds and pool tick spacing */
function wInt(x) { const n = BigInt(x); if (n >= 0n) return wUint(n); return ((1n << 256n) + n).toString(16).padStart(64, '0'); }
/** the buyback v2 constructor tail: Config is 22 STATIC words (PoolKey inline = 5), dest = the vault. Same values as the deployed v1. */
export function buybackArgs(vaultAddress) {
  const c = D.buyback.config, k = c.v4Key;
  return wAddr(String(c.poolManager).toLowerCase()) + wAddr(String(k[0]).toLowerCase()) + wAddr(String(k[1]).toLowerCase()) + wUint(k[2]) + wInt(k[3]) + wAddr(String(k[4]).toLowerCase())
    + wAddr(String(c.v3Pool).toLowerCase()) + wAddr(String(c.weth).toLowerCase()) + wAddr(String(c.wtcoin).toLowerCase()) + wAddr(String(c.tblock).toLowerCase()) + wAddr(String(c.keeper).toLowerCase())
    + wUint(c.publicDelay) + wUint(c.maxPerCall) + wUint(c.minSpend) + wUint(c.cooldown) + wUint(c.twapWindow) + wInt(c.maxV3DevTicks) + wInt(c.maxV4ImpactTicks)
    + wUint(c.maxHookPpm) + wUint(c.tipBps) + wUint(c.maxTip) + wAddr(vaultAddress);
}
export const buybackCreation = (vaultAddress) => D.buyback.init + buybackArgs(vaultAddress);
