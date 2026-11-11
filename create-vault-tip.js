// create-vault-tip.js — the OPTIONAL TBLOCK part of a birth (Phil 2026-11-10: "a bit in ETH, the rest in TBLOCK, up to $5,
// into the holders vault"; chosen: optional, top-up to $5). Pure, no network.
// The birth itself never changes: 0.001 ETH is fixed in the deployed router and hook. This is a SEPARATE signature, offered
// only after the block is alive, so a missing TBLOCK balance can never stop a birth.
// One call: TBLOCK.transfer(VAULT, amount) from the creator's own wallet. Nothing else, no approval, no contract of ours in between.
import { TBLOCK, VAULT, wAddr, wUint, fmt } from './economie.js';

export const TARGET_USD = 5;
/* game339: the price pivot of the TBLOCK buy; leftover wtCOIN in a wallet = a step 1 that stopped between its two legs (resumed, not re-bought) */
export const WTCOIN = '0x5cda0e1ca4ce2af96315f7f8963c85399c172204';
export const WTCOIN_RESUME_MIN = 100000000000000n; /* 0.0001 wtCOIN (about $0.01): below it, dust is left alone */
export const BIRTH_FEE_WEI = 1000000000000000n; /* 0.001 ETH, the birth fee every page shows */
const SCALE = 1000000n; /* prices handled in millionths of a cent-free unit: exact BigInt maths after one rounding */

/* micro-units of a positive finite number, or null */
const micro = (x) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? BigInt(Math.round(x * 1e6)) : null);

/** usd left to reach TARGET_USD once the ETH fee is paid; 0 when the ETH fee alone covers it */
export function usdLeft(ethUsd) {
  const e = micro(ethUsd);
  if (e === null) return null;
  const feeMicro = (BIRTH_FEE_WEI * e) / 10n ** 18n; /* fee value in micro-dollars */
  const left = BigInt(TARGET_USD) * SCALE - feeMicro;
  return left > 0n ? left : 0n; /* micro-dollars */
}

/** 2026-11-11 (replaces the fixed 0.0023 ETH BIRTH_ETH_RESERVE_WEI of game338): step 1 keeps EXACTLY what the birth preflight will ask,
 *  `birthNeedWei` = besoinNaissance(fee, seed, GAZ_NAISSANCE_WEI).total computed by the page with the same helper as that preflight
 *  (0.001979 ETH on the ETH pair today, 0.0015 on a 7030 non-ETH pair). The fixed reserve refused payable births in between.
 *  'BUY'  : the wallet can pay the TBLOCK buy AND the birth.
 *  'SKIP' : it can pay the birth only: step 1 is skipped, the birth goes on, the TBLOCK part is offered after it.
 *  'STOP' : it cannot pay the birth itself.
 *  null   : an input is not a BigInt (unread): the caller treats it as SKIP, so a node outage never blocks a birth nor starves it. */
export function stepOneFits({ ethBal, buyWei, birthNeedWei } = {}) {
  if (typeof ethBal !== 'bigint' || typeof buyWei !== 'bigint' || typeof birthNeedWei !== 'bigint') return null;
  if (ethBal >= buyWei + birthNeedWei) return 'BUY';
  if (ethBal >= birthNeedWei) return 'SKIP';
  return 'STOP';
}

/** game338: the ETH that buys `tblock` (wei) at the read prices, plus `bufferBps` so the guaranteed minimum still covers it
 *  (two 1 % slippage bounds + the TBLOCK hook's ~1 % + pool fees): rounded UP; null when a price is unread */
export function ethWeiForTblock({ tblock, tblockUsd, ethUsd, bufferBps = 400n }) {
  const t = micro(tblockUsd * 1e6), e = micro(ethUsd); /* tblockUsd is tiny: scaled by 1e6 before micro() */
  if (t === null || e === null || typeof tblock !== 'bigint' || tblock <= 0n) return null;
  /* dollars = tblock/1e18 * tblockUsd ; eth = dollars / ethUsd ; wei = eth * 1e18  =>  wei = tblock * (t/1e12) / (e/1e6) */
  const base = (tblock * t) / (e * 1000000n);
  return (base * (10000n + BigInt(bufferBps)) + 9999n) / 10000n;
}

/** game337: the ETH that buys the TBLOCK part when the wallet holds too little TBLOCK; wei, rounded DOWN; null when unread or nothing to add */
export function ethWeiForTopUp(ethUsd) {
  const left = usdLeft(ethUsd), e = micro(ethUsd);
  if (left === null || e === null || left === 0n) return null;
  return (left * 10n ** 18n) / e; /* (left / 1e6 dollars) / (e / 1e6 dollars per ETH) * 1e18 */
}

/**
 * plan({ ethUsd, tblockUsd, balance }) -> { ok:true, usdMicro, amount, call } | { ok:false, why }
 * amount is in TBLOCK wei (18 decimals), rounded DOWN so the creator never pays above the target.
 */
export function plan({ ethUsd, tblockUsd, balance }) {
  if (!VAULT) return { ok: false, why: 'The holders vault is not deployed yet.' };
  const left = usdLeft(ethUsd);
  if (left === null) return { ok: false, why: 'The ETH price could not be read just now.' };
  if (left === 0n) return { ok: false, why: 'The ETH fee already reaches $' + TARGET_USD + ': nothing to add.' };
  if (!(typeof tblockUsd === 'number' && Number.isFinite(tblockUsd) && tblockUsd > 0)) return { ok: false, why: 'The TBLOCK price could not be read just now.' };
  /* price in 1e-18 dollars per TBLOCK wei is tblockUsd; amount = left(micro$) / 1e6 / tblockUsd * 1e18 */
  const p = BigInt(Math.round(tblockUsd * 1e18)); /* dollars * 1e18 for ONE whole TBLOCK */
  if (p <= 0n) return { ok: false, why: 'The TBLOCK price could not be read just now.' };
  /* wei = (left / 1e6 dollars) / (p / 1e18 dollars per whole TBLOCK) * 1e18 = left * 1e36 / (p * 1e6) */
  const amount = (left * 10n ** 36n) / (p * SCALE);
  if (amount <= 0n) return { ok: false, why: 'Nothing to add.' };
  if (typeof balance !== 'bigint') return { ok: false, why: 'Your TBLOCK balance could not be read just now.' };
  if (balance < amount) return { ok: false, why: 'This needs ' + fmt(amount) + ' TBLOCK; this wallet holds ' + fmt(balance) + '.' };
  return { ok: true, usdMicro: left, amount, call: Object.freeze({ to: TBLOCK, data: '0xa9059cbb' + wAddr(VAULT) + wUint(amount), value: '0x0' }) };
}
