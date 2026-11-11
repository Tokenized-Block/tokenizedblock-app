/* fly-day.js — the fly's daily trade counter, as pure functions on the STORED state (2026-11-09).
 *   QA 08/11 (open item): the counter was raised only AFTER the swap was mined, so a reload between the first transaction sent and that
 *   line left a real trade uncounted and the daily cap could be passed by one per reload. Now a slot is RESERVED (and saved) before the
 *   first transaction goes out; a trade that sent nothing reserves nothing. A slot reserved for calls that then failed stays counted:
 *   the cap is a safety limit, it errs toward fewer trades, never more.
 *   Pure: no DOM, no storage; the page saves what these return. */

/** the UTC day key used by the page (YYYY-MM-DD) */
export const dayOf = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

/** trades already counted today in state s (a past day counts 0) */
export function countedToday(s, today) {
  return s && s.day === today && Number.isInteger(s.today) && s.today > 0 ? s.today : 0;
}

/** may one more trade START today under a cap of max? */
export function mayTrade(s, today, max) {
  return countedToday(s, today) < max;
}

/* game364 (Phil 2026-11-11, after Coinbase's "Agent Controls" post of the same day, read on X: max trade size, 24-hour volume limit, auto-stop
 *   at a % loss that only the human turns back on). The fly already had the max per trade and the trades per day; these add the two others.
 *   They are enforced by the page that holds the fly's key, before anything is signed — the brain can neither read nor change them, but a
 *   server does not enforce them (said on screen). Pure: the page saves what these return. */
export const JOUR_MS = 86400000;
/** USDC the fly traded in the last 24 h (rolling), from the stored list */
export function volume24h(s, maintenant) {
  return (s && Array.isArray(s.volumes) ? s.volumes : []).filter((x) => x && maintenant - x.t < JOUR_MS && x.t <= maintenant).reduce((a, x) => a + (Number(x.usdc) || 0), 0);
}
/** may a BUY of `usdc` start now under a 24 h cap? (a sell always may: an exit is never blocked by a volume cap) */
export function mayBuyVolume(s, maintenant, usdc, cap) {
  if (!(cap > 0) || !(usdc > 0)) return false;
  return volume24h(s, maintenant) + usdc <= cap + 1e-9;
}
/** the state with `usdc` of volume recorded now (older than 24 h dropped); never mutates s */
export function reserveVolume(s, maintenant, usdc) {
  const garde = (s && Array.isArray(s.volumes) ? s.volumes : []).filter((x) => x && maintenant - x.t < JOUR_MS);
  return { ...s, volumes: [...garde, { t: maintenant, usdc: Number(usdc) || 0 }] };
}
/** the auto-stop verdict: the fly wallet's value against the value when the human last pressed Start. null = not measurable */
export function verdictPerte(base, valeur, pct) {
  if (!(base > 0) || !(valeur >= 0) || !(pct > 0)) return null;
  const perte = (base - valeur) / base * 100;
  return { perte, arret: perte >= pct };
}
/** the state with one more trade reserved today (a new day restarts from 0); never mutates s */
export function reserveTrade(s, today) {
  return { ...s, day: today, today: countedToday(s, today) + 1 };
}
