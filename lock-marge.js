/* lock-marge.js — how far a lock is above the hearts' hold line (Phil 2026-11-14, item 1). Pure: no DOM, no network.
 * THE RULE IS THE CONTRACTS': a heart needs activeLockedOf >= L.minHold(); the holders vault records a play (and so the weekly lock
 *   rewards can count it) only for a payer at or above minHold at that moment. minHold is $15 of TBLOCK at the hearts' KEEPER price, which
 *   moves at most MAX_STEP_BPS per write, at most one write per MIN_INTERVAL (read on chain: 1000 bps, 3600 s on 2026-11-14). A lower
 *   TBLOCK price raises minHold by BPS / (BPS - step) per write.
 * Measured 2026-11-14: Grok's 3,000,000 TBLOCK lock was 7.5 % above minHold 2,789,880 — one 10 % write down would put it under. */

/** minHold after k writes down, rounded up (each write can raise it by BPS / (BPS - step)) */
export function minHoldApres(minHold, maxStepBps, k) {
  let m = BigInt(minHold); const s = BigInt(maxStepBps);
  for (let i = 0n; i < BigInt(k); i++) m = (m * 10000n + (10000n - s) - 1n) / (10000n - s);
  return m;
}

export const PAS_PROCHE = 2; /* at most this many writes down before the line: "close" */
export const PAS_CONSEIL = 3; /* a top-up suggested to stay above after this many writes down */
const PAS_MAX = 60;

/** { niveau: 'sous' | 'proche' | 'ok' | null, pasAvant, heures, margeBps, aAjouter } — null when a value was not read or is not sane.
 *  pasAvant = the number of 10 %-like price writes down the lock stays above after (0 = already under); heures = pasAvant × MIN_INTERVAL;
 *  aAjouter = TBLOCK to add so the lock stays above after PAS_CONSEIL writes (0n when it already does). */
export function margeHold({ locked, minHold, maxStepBps, minIntervalS }) {
  let l, m, s, iv;
  try { l = BigInt(locked); m = BigInt(minHold); s = BigInt(maxStepBps); iv = BigInt(minIntervalS); } catch (_) { return { niveau: null }; }
  if (l <= 0n || m <= 0n || s <= 0n || s >= 10000n || iv <= 0n) return { niveau: null };
  const margeBps = Number(((l - m) * 10000n) / m);
  if (l < m) return { niveau: 'sous', pasAvant: 0, heures: 0, margeBps, aAjouter: minHoldApres(m, s, PAS_CONSEIL) - l };
  let k = 0;
  while (k < PAS_MAX && l >= minHoldApres(m, s, k + 1)) k++;
  const cible = minHoldApres(m, s, PAS_CONSEIL);
  return { niveau: k < PAS_PROCHE ? 'proche' : 'ok', pasAvant: k, heures: k * Number(iv) / 3600, margeBps, aAjouter: l >= cible ? 0n : cible - l };
}

/** the line the lock card shows (English UI), or null when nothing was read */
export function texteMarge(r, fmt) {
  if (!r || !r.niveau) return null;
  const pct = (r.margeBps / 100).toFixed(1).replace(/\.0$/, '');
  if (r.niveau === 'sous') return 'Your lock is under the hearts’ hold line: hearts are refused and your plays do not count. Add ' + fmt(r.aAjouter) + ' TBLOCK to be back above it with a margin.';
  const fois = r.pasAvant === 1 ? 'one move' : r.pasAvant + ' moves';
  if (r.niveau === 'proche') return 'Your lock is only ' + pct + '% above the hold line. The price the hearts use can move about 10% an hour; ' + (r.pasAvant === 0 ? 'one move' : fois) + ' down and your plays stop counting. Add ' + fmt(r.aAjouter) + ' TBLOCK to keep a margin.';
  return 'Hold margin: +' + pct + '%, about ' + fois + ' of the hearts’ price down before your plays stop counting.';
}
