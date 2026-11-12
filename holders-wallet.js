/* holders-wallet.js — the lines of the "Your wallet" card on holders.html (2026-11-12, game377). Pure: no DOM, no network.
 * Phil connected a wallet with 3,000,000 TBLOCK LOCKED and 246,365 held; the card said only "holds 246,365 · BELOW $15", as if the lock
 *   did not exist. Each perk has its OWN rule, read from its own contract or server, and the card now says each one:
 *   - Hearts (BlockLikesV2.like) and the holders vault (TBlockVaultV2.claim) count the LOCK: TBlockLock.activeLockedOf >= Hearts.minHold()
 *     ($15 at the hearts contract price); a vault claim also needs the lock date at least MIN_COMMIT (7 days) ahead; a heart burns
 *     likePrice() from the WALLET.
 *   - The holders' channel counts the WALLET balance: $15 at the pool price, checked by our server (/api/tblock/hold).
 * ⛔ A value that was not read is "not read", never 0 and never a verdict. Amounts are raw TBLOCK units (18 decimals), times in seconds. */

const big = (x) => { if (x === null || x === undefined || x === '') return null; try { return BigInt(x); } catch (_) { return null; } };
/** whole TBLOCK with thousands separators, rounded down (the same as lock.js fmt) */
export function tokens(raw) {
  const n = BigInt(raw) / 10n ** 18n;
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
const usdText = (x) => (Number.isFinite(x) ? '$' + (x >= 1 ? x.toFixed(2) : x >= 0.01 ? x.toFixed(4) : x.toPrecision(3)) : null);
const day = (s) => new Date(Number(s) * 1000).toISOString().slice(0, 10);
/** USD × 1e18 (Hearts.HOLD_USD_E18) -> "$15", "$15.50" */
const usdE18 = (e18) => { const c = BigInt(e18) / 10n ** 16n, e = c / 100n, r = c % 100n; return '$' + e.toString() + (r ? '.' + r.toString().padStart(2, '0') : ''); };
export const MIN_COMMIT_SEC = 7 * 86400; /* TBlockVaultV2.MIN_COMMIT */

/**
 * @param {object} p
 * @param {*} p.balance      TBLOCK in the wallet (raw), or null when not read
 * @param {number|null} p.walletUsd  its dollar value at the pool price, from the server, or null
 * @param {*} p.locked       TBlockLock.lockedOf (raw) or null
 * @param {*} p.active       TBlockLock.activeLockedOf (raw) or null — THE value the contracts count
 * @param {*} p.unlockAt     TBlockLock.unlockAtOf (seconds) or null
 * @param {*} p.requestedAt  TBlockLock.requestedAtOf (seconds, 0 = no exit asked) or null
 * @param {*} p.minHold      Hearts.minHold() (raw) or null
 * @param {*} p.likePrice    Hearts.likePrice() (raw) or null
 * @param {*} p.holdUsd      Hearts.HOLD_USD_E18() or null
 * @param {number|null} p.poolUsd  the TBLOCK price read now (USD per token), for the "≈ $" of the lock, or null
 * @param {object|null} p.channel  the server's answer for this wallet: { usd, ok, thresholdUsd, why } or null when not reached
 * @param {boolean} p.channelOpen  the server said its Telegram bot is configured (telegramReady === true)
 * @param {number} p.nowSec
 * @returns {{k: string, v: string, c: 'ok'|'bad'|'warn'|''}[]}
 */
export function walletLines(p) {
  const out = [];
  const bal = big(p.balance), locked = big(p.locked), active = big(p.active), unlockAt = big(p.unlockAt), requestedAt = big(p.requestedAt);
  const minHold = big(p.minHold), likePrice = big(p.likePrice), holdUsd = big(p.holdUsd);
  const now = BigInt(Math.floor(Number(p.nowSec)));
  const lockRead = locked !== null && active !== null && unlockAt !== null;

  /* 1. the lock */
  if (!lockRead) out.push({ k: 'Locked', v: 'not read', c: 'warn' });
  else if (locked === 0n) out.push({ k: 'Locked', v: 'nothing locked', c: '' });
  else if (active > 0n) {
    const u = Number.isFinite(p.poolUsd) && p.poolUsd > 0 ? usdText(Number(active / 10n ** 18n) * p.poolUsd) : null;
    out.push({ k: 'Locked', v: tokens(active) + ' TBLOCK until ' + day(unlockAt) + (u ? ' (≈ ' + u + ')' : ''), c: '' });
  } else {
    const why = requestedAt !== null && requestedAt > 0n ? 'a withdrawal was requested' : 'the lock date passed on ' + day(unlockAt);
    out.push({ k: 'Locked', v: tokens(locked) + ' TBLOCK in the lock, not counted: ' + why, c: 'warn' });
  }

  /* 2. the wallet */
  if (bal === null) out.push({ k: 'In your wallet', v: 'not read', c: 'warn' });
  else { const u = usdText(p.walletUsd); out.push({ k: 'In your wallet', v: tokens(bal) + ' TBLOCK' + (u ? ' (≈ ' + u + ')' : ''), c: '' }); }

  /* 3. hearts and the holders vault: the LOCK against Hearts.minHold() */
  const at = holdUsd !== null ? ', ' + usdE18(holdUsd) + ' at the hearts contract price' : '';
  if (!lockRead || minHold === null) out.push({ k: 'Hearts & holders vault', v: 'not read', c: 'warn' });
  else if (active < minHold) {
    out.push({ k: 'Hearts & holders vault', v: 'below (' + tokens(active) + ' locked < ' + tokens(minHold) + at + ')', c: 'bad' });
  } else {
    const enough = tokens(active) + ' locked ≥ ' + tokens(minHold) + at;
    /* a heart also burns likePrice from the WALLET: said when the wallet cannot pay one */
    const pay = likePrice !== null && bal !== null && bal < likePrice ? '; a heart also burns ' + tokens(likePrice) + ' TBLOCK from your wallet, which holds ' + tokens(bal) : '';
    if (unlockAt >= now + BigInt(MIN_COMMIT_SEC)) out.push({ k: 'Hearts & holders vault', v: 'enough (' + enough + ')' + pay, c: pay ? 'warn' : 'ok' });
    else {
      out.push({ k: 'Hearts', v: 'enough (' + enough + ')' + pay, c: pay ? 'warn' : 'ok' });
      out.push({ k: 'Holders vault', v: 'a claim needs your lock to last 7 more days (it ends ' + day(unlockAt) + ')', c: 'bad' });
    }
  }

  /* 4. the holders' channel: the WALLET balance at the pool price, our server's check */
  const soon = p.channelOpen === true ? '' : ' (coming soon)';
  const ch = p.channel;
  const seuil = '$' + ((ch && ch.thresholdUsd) || 15);
  if (!ch || !Number.isFinite(ch.usd)) out.push({ k: "Holders' channel", v: 'not read' + (ch && ch.why ? ': ' + ch.why : '') + soon, c: 'warn' });
  else if (ch.ok === true) out.push({ k: "Holders' channel", v: 'enough: ' + usdText(ch.usd) + ' in your wallet' + soon, c: 'ok' });
  else out.push({ k: "Holders' channel", v: 'below ' + seuil + ' in your wallet' + soon, c: 'bad' });
  return out;
}
