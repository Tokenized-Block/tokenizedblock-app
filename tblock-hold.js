/* tblock-hold.js — PROOF OF HOLD for TBLOCK (Phil 2026-11-09): a wallet that holds at least $15 of TBLOCK gets a one-time Telegram
 * invite. TBLOCK is a B20 on Base (0xb200…830e), traded in ONE Uniswap v4 pool against wtCOIN (wrapped tokenized Coinbase stock).
 * ⛔ HARD TO GAME:
 *   - the USD price is read ON CHAIN, never from an aggregator: TBLOCK/wtCOIN from the v4 pool (StateView.getSlot0), wtCOIN/USDC as the
 *     MEDIAN of three independent CL pools (two Aerodrome Slipstream, one Hydrex/Algebra) that must agree within ECART_MAX;
 *   - the price used is the LOWER of the price now and ~10 minutes earlier (RECUL_PRIX_S): a thin pool pushed for one block does not
 *     make a small balance pass the threshold;
 *   - the balance and the signature are checked at the moment of the request; anything not read means NOT eligible, with the reason.
 * ⛔ WHAT THIS DOES NOT PROVE: that the wallet still holds TBLOCK after joining (no one is removed from the group later), and a
 *   smart wallet that was never deployed (ERC-6492 signature) is refused with that reason rather than half-verified.
 * PURE where it can be: reads are injected (rpc(method, params), lire(to, data, block)). */
import { keccak256Hex, selecteur } from './keccak.js';
import { mediane, ecartRelatif, ECART_MAX } from './prix-eth.js';
import { blocAuTemps, prixDuSlot0, RECUL_PRIX_S } from './eligibilite-unit.js';

export const TBLOCK = '0xb200000000000000000000ba9bf8330307f8830e';
export const WTCOIN = '0x5cda0e1ca4ce2af96315f7f8963c85399c172204';
export const STATE_VIEW = '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71'; /* multipool.js ADRESSES.STATE_VIEW */
/* read on chain 2026-11-09 from the PoolManager Initialize log (block 55,156,509); the bench recomputes poolId from this key */
export const TBLOCK_POOL = Object.freeze({
  poolId: '0x6869b9016937d97dfa595eb25bc72880e821b8eb22be32bc79c623bc64ce8a3e',
  currency0: WTCOIN, currency1: TBLOCK, fee: 3000, tickSpacing: 60,
  hooks: '0x3e6b46810b1fd5085086fd1417e8adb02f34a044', initBlock: 55156509,
});
/* wtCOIN (token0, 18 decimals) / USDC (token1, 6 decimals); the first 32-byte word of slot0()/globalState() is sqrtPriceX96 */
export const WTCOIN_USDC_POOLS = Object.freeze([
  Object.freeze({ address: '0x089262b9d991d7bc4a55b7cff0b7f26bde407985', read: 'slot0()', dex: 'Aerodrome Slipstream' }),
  Object.freeze({ address: '0x4618dfcbc52d9fbcd45ec4a65fc61b5da57ad205', read: 'slot0()', dex: 'Aerodrome Slipstream' }),
  Object.freeze({ address: '0xab5d32ff95b58bd5e77de08738a391973ee88c81', read: 'globalState()', dex: 'Hydrex (Algebra)' }),
]);
export const WTCOIN_READS_MIN = 2;
export const HOLD_THRESHOLD_USD = 15;
export const CHALLENGE_TTL_S = 600;
export const ERC1271_MAGIC = '0x1626ba7e';
const ERC6492_SUFFIX = '6492649264926492649264926492649264926492649264926492649264926492';

const bas = (x) => String(x || '').toLowerCase();
const ADR = /^0x[0-9a-f]{40}$/;
const strip = (h) => bas(h).replace(/^0x/, '');
const word = (h) => strip(h).padStart(64, '0');
const SEL_SLOT0_V4 = strip(selecteur('getSlot0(bytes32)'));
const SEL_BAL = strip(selecteur('balanceOf(address)'));
const SEL_1271 = strip(selecteur('isValidSignature(bytes32,bytes)'));

/** keccak256(abi.encode(PoolKey)) — the v4 poolId of a key */
export function poolIdOfKey(k) {
  const hex = word(k.currency0) + word(k.currency1) + BigInt(k.fee).toString(16).padStart(64, '0')
    + BigInt.asUintN(256, BigInt(k.tickSpacing)).toString(16).padStart(64, '0') + word(k.hooks);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return keccak256Hex(bytes);
}

/** USD for 1 TBLOCK at `bloc`, or { usd:null, why } when a read is missing or the wtCOIN pools disagree */
export async function tblockUsdAt({ lire, bloc }) {
  let tblockPerWtcoin = null;
  try { tblockPerWtcoin = prixDuSlot0(await lire(STATE_VIEW, '0x' + SEL_SLOT0_V4 + strip(TBLOCK_POOL.poolId), bloc)); } catch (_) { tblockPerWtcoin = null; }
  if (tblockPerWtcoin === null) return { usd: null, why: 'TBLOCK pool price not read' };
  const wt = [];
  for (const p of WTCOIN_USDC_POOLS) {
    let x = null;
    try { x = prixDuSlot0(await lire(p.address, '0x' + strip(selecteur(p.read)), bloc)); } catch (_) { x = null; }
    if (x !== null) wt.push(x * 1e12);
  }
  if (wt.length < WTCOIN_READS_MIN) return { usd: null, why: 'only ' + wt.length + ' wtCOIN/USDC pool(s) answered, ' + WTCOIN_READS_MIN + ' are needed' };
  const e = ecartRelatif(wt);
  if (e === null || e > ECART_MAX) return { usd: null, why: 'the wtCOIN/USDC pools disagree by more than ' + (ECART_MAX * 100) + '%' };
  const wtcoinUsd = mediane(wt);
  return { usd: wtcoinUsd / tblockPerWtcoin, wtcoinUsd, tblockPerWtcoin, wtcoinReads: wt.length };
}

/** THE RULE: balance (raw, 18 decimals) x the LOWER of the two prices >= threshold. Anything not read -> not eligible, with the reason. */
export function holdVerdict({ balance, priceNow, priceBefore, thresholdUsd = HOLD_THRESHOLD_USD }) {
  if (!Number.isFinite(priceNow) || !Number.isFinite(priceBefore) || priceNow <= 0 || priceBefore <= 0) {
    return { ok: false, usd: null, price: null, tblockNeeded: null, why: 'TBLOCK price not read' };
  }
  const price = Math.min(priceNow, priceBefore);
  const tblockNeeded = Math.ceil(thresholdUsd / price);
  if (balance === null || balance === undefined) return { ok: false, usd: null, price, tblockNeeded, why: 'TBLOCK balance not read' };
  const usd = (Number(BigInt(balance)) / 1e18) * price;
  return usd >= thresholdUsd
    ? { ok: true, usd, price, tblockNeeded, why: null }
    : { ok: false, usd, price, tblockNeeded, why: 'holds $' + usd.toFixed(2) + ' of TBLOCK, below $' + thresholdUsd };
}

/** the last block whose timestamp is <= ts, searched among RECENT blocks only. ⛔ game320 in prod: blocAuTemps starts at block 1, and
 *  reading block 1's timestamp needs an archive node — the public node refuses anything ~10,000 blocks deep, so "10 minutes ago" was
 *  never read and every proof failed closed. Base makes a block every 0.2 s (measured 05/11): 10 min = 3,000 blocks; the window starts
 *  at 6,000 blocks back and widens x3 (at most twice) if the chain was slower. null if not found. */
export async function recentBlockAt({ lireTs, tete, ts, span = 6000, tries = 3, hint = null, tsHead = null }) {
  /* game372 Step B: `hint` = the previous answer (the server's last 10-min block). When it is a recent block, ONE guess from the block time
   *  MEASURED between the hint and the head (never a constant) is checked by reading ts(g) and ts(g+1): at most 4 reads with the head.
   *  Any mismatch or failed read -> the full search below, unchanged. */
  const T = Number(tete);
  if (Number.isSafeInteger(hint) && Number.isSafeInteger(T) && hint >= T - span * 9 && hint < T) {
    const tH = Number.isFinite(tsHead) ? tsHead : await lireTs(T).catch(() => null);
    const tI = Number.isFinite(tH) ? await lireTs(hint).catch(() => null) : null;
    if (Number.isFinite(tH) && Number.isFinite(tI) && tH > tI) {
      const sPerBlock = (tH - tI) / (T - hint);
      const g = hint + Math.round((ts - tI) / sPerBlock);
      if (Number.isSafeInteger(g) && g >= Math.max(1, T - span * 9) && g < T) {
        const tg = await lireTs(g).catch(() => null);
        if (Number.isFinite(tg) && tg <= ts) {
          const tg1 = await lireTs(g + 1).catch(() => null);
          if (Number.isFinite(tg1) && ts < tg1) return g;
        }
      }
    }
  }
  let s = span;
  for (let k = 0; k < tries; k++, s *= 3) {
    const lo = Math.max(1, Number(tete) - s);
    const tLo = await lireTs(lo).catch(() => null);
    if (!Number.isFinite(tLo)) return null;
    if (tLo > ts) { if (lo === 1) return null; continue; }
    let a = lo, b = Number(tete);
    const tB = await lireTs(b).catch(() => null);
    if (!Number.isFinite(tB) || tB <= ts) return null;
    while (b - a > 1) {
      const m = Math.floor((a + b) / 2), t = await lireTs(m).catch(() => null);
      if (!Number.isFinite(t)) return null;
      if (t <= ts) a = m; else b = m;
    }
    return a;
  }
  return null;
}

/** the TBLOCK price at the head and ~10 min earlier (the server caches this; it costs a block search) */
export async function readPrices({ lire, lireTs, tete, hint = null }) {
  const tsHead = await lireTs(tete).catch(() => null);
  if (!Number.isFinite(tsHead)) return { tete, before: null, now: { usd: null, why: 'head block not read' }, prev: { usd: null, why: 'head block not read' } };
  const before = await recentBlockAt({ lireTs, tete, ts: tsHead - RECUL_PRIX_S, hint, tsHead });
  const now = await tblockUsdAt({ lire, bloc: tete });
  const prev = before === null ? { usd: null, why: 'block 10 minutes ago not read' } : await tblockUsdAt({ lire, bloc: before });
  return { tete, before, now, prev };
}

/** price now and ~10 min earlier, and the wallet's balance at the head; `prices` (from readPrices) may be passed in */
export async function readHold({ lire, lireTs, tete, wallet, thresholdUsd = HOLD_THRESHOLD_USD, prices = null }) {
  const w = bas(wallet);
  if (!ADR.test(w)) return { ok: false, why: 'not a wallet address' };
  const pr = prices || await readPrices({ lire, lireTs, tete });
  const { now, prev, before } = pr;
  tete = pr.tete;
  let balance = null;
  try { const r = await lire(TBLOCK, '0x' + SEL_BAL + word(w), tete); balance = /^0x[0-9a-fA-F]{1,64}$/.test(String(r)) ? BigInt(r) : null; } catch (_) { balance = null; }
  const v = holdVerdict({ balance, priceNow: now.usd, priceBefore: prev.usd, thresholdUsd });
  return { ...v, why: v.why === 'TBLOCK price not read' ? (now.why || prev.why || v.why) : v.why, wallet: w,
    balance: balance === null ? null : balance.toString(), block: tete, blockBefore: before, priceNow: now.usd, priceBefore: prev.usd,
    wtcoinUsd: now.wtcoinUsd ?? null, thresholdUsd };
}

/* ── ownership: a signed message, never a transaction ───────────────────────────────────────────────────────────────── */
export function holdMessage({ wallet, nonce, issuedIso }) {
  return 'TokenizedBlock - TBLOCK holder access\n'
    + 'Wallet: ' + bas(wallet) + '\nNonce: ' + nonce + '\nIssued: ' + issuedIso + '\n'
    + 'This proves I control this wallet. It moves no money and approves nothing.';
}

export function digestEip191(text) {
  const body = new TextEncoder().encode(text);
  const head = new TextEncoder().encode('\x19Ethereum Signed Message:\n' + body.length);
  const all = new Uint8Array(head.length + body.length);
  all.set(head); all.set(body, head.length);
  return keccak256Hex(all);
}

/** calldata for isValidSignature(bytes32 digest, bytes signature) */
export function erc1271Call(digest, signature) {
  const s = strip(signature);
  const len = s.length / 2;
  const padded = s.padEnd(Math.ceil(s.length / 64) * 64, '0');
  return '0x' + SEL_1271 + strip(digest) + (64).toString(16).padStart(64, '0') + len.toString(16).padStart(64, '0') + padded;
}

/** { ok, kind:'eoa'|'erc1271', why } — a node failure THROWS (it is not a bad signature) */
export async function verifyOwnership({ rpc, wallet, message, signature }) {
  const w = bas(wallet), s = strip(signature);
  if (!ADR.test(w)) return { ok: false, why: 'not a wallet address' };
  if (!/^[0-9a-f]+$/.test(s) || s.length % 2 !== 0 || s.length < 130) return { ok: false, why: 'not a signature' };
  const digest = digestEip191(message);
  if (s.length === 130) {
    let v = parseInt(s.slice(128, 130), 16);
    if (v < 27) v += 27;
    if (v === 27 || v === 28) {
      const data = '0x' + strip(digest) + v.toString(16).padStart(64, '0') + s.slice(0, 64) + s.slice(64, 128);
      const r = await rpc('eth_call', [{ to: '0x0000000000000000000000000000000000000001', data }, 'latest']);
      if (r && r !== '0x' && BigInt(r) !== 0n && '0x' + String(r).slice(-40).toLowerCase() === w) return { ok: true, kind: 'eoa', why: null };
    }
  }
  const code = await rpc('eth_getCode', [w, 'latest']);
  if (!code || code === '0x') {
    return s.endsWith(ERC6492_SUFFIX)
      ? { ok: false, why: 'this smart wallet is not deployed on Base yet: make any one transaction with it, then sign again' }
      : { ok: false, why: 'the signature is not from this wallet' };
  }
  let r;
  try { r = await rpc('eth_call', [{ to: w, data: erc1271Call(digest, s) }, 'latest']); }
  catch (e) { if (/revert/i.test(String((e && e.message) || e))) return { ok: false, why: 'the wallet contract rejected the signature' }; throw e; }
  return bas(r).slice(0, 10) === ERC1271_MAGIC ? { ok: true, kind: 'erc1271', why: null } : { ok: false, why: 'the wallet contract rejected the signature' };
}

/* ── Telegram bot: the ONLY thing it answers is a private /start (or /hold, /help) with the link to the proof page. It reads no
 * wallet, holds no key and moves nothing; the invite itself is made by the server after the proof (telegramInvite below). ── */
export const HOLD_PAGE_URL = 'https://tokenizedblock.space/holders.html';
export const BOT_USERNAME = 'TblockHoldersBot';
export const TG_CODE_TTL_S = 900;
const SAFETY = 'I never ask for a seed phrase, a private key or a payment. Anyone who does is not me.';

/** The bot's ONLY answers (everything else: silence, null):
 *  - in the public group: /hold (or /start, /hold@bot) -> a reply with a button that opens a private chat with the bot;
 *  - in private: /start, /hold or /help -> a link to the proof page carrying a one-time code tied to THIS Telegram account
 *    (newCode(userId) is injected so this stays pure). */
export function telegramReply(update, { pageUrl = HOLD_PAGE_URL, botUsername = BOT_USERNAME, newCode = null } = {}) {
  const m = update && (update.message || update.edited_message);
  if (!m || !m.chat || typeof m.text !== 'string' || !m.from || m.from.is_bot) return null;
  const head = m.text.trim().split(/\s/)[0];
  const [cmdRaw, at] = head.split('@');
  const cmd = cmdRaw.toLowerCase();
  if (at && at.toLowerCase() !== botUsername.toLowerCase()) return null; /* a command for another bot */
  if (m.chat.type === 'group' || m.chat.type === 'supergroup') {
    if (!['/hold', '/start'].includes(cmd)) return null;
    return {
      chat_id: m.chat.id, reply_to_message_id: m.message_id, disable_web_page_preview: true,
      text: 'TBLOCK holders channel: hold at least $' + HOLD_THRESHOLD_USD + ' of TBLOCK on Base, prove it, and I let you in. '
        + 'Tap the button, I continue in private. ' + SAFETY,
      reply_markup: { inline_keyboard: [[{ text: 'Prove I hold TBLOCK', url: 'https://t.me/' + botUsername + '?start=hold' }]] },
    };
  }
  if (m.chat.type !== 'private' || !['/start', '/hold', '/help'].includes(cmd)) return null;
  const code = typeof newCode === 'function' ? newCode(m.from.id) : null;
  const link = code ? pageUrl + '?tg=' + code : pageUrl;
  return {
    chat_id: m.chat.id, disable_web_page_preview: true,
    text: 'TBLOCK holders channel: hold at least $' + HOLD_THRESHOLD_USD + ' of TBLOCK on Base.\n\n'
      + '1. Open the proof page' + (code ? ' (this link is yours: it ties the proof to this Telegram account, valid 15 minutes)' : '') + '.\n'
      + '2. Connect your wallet and sign the message (a signature, not a transaction: nothing moves).\n'
      + '3. I send you the invite here. Only YOUR account is let in with it.\n\n'
      + 'The price is read on chain (TBLOCK/wtCOIN pool x wtCOIN/USDC). ' + SAFETY,
    reply_markup: { inline_keyboard: [[{ text: 'Open the proof page', url: link }]] },
  };
}

/** The visible tag the bot puts on a proven holder in the public group (Bot API setChatMemberTag: 0-16 characters, no emoji;
 *  the bot needs the can_manage_tags admin right there). null when the group or the user is unknown. */
export const HOLDER_TAG = 'TBLOCK Holder';
export function holderTagCall(groupChatId, userId, tag = HOLDER_TAG) {
  if (groupChatId === undefined || groupChatId === null || groupChatId === '' || !Number.isSafeInteger(Number(userId))) return null;
  if (typeof tag !== 'string' || [...tag].length > 16 || /\p{Extended_Pictographic}/u.test(tag)) return null;
  return { chat_id: groupChatId, user_id: Number(userId), tag };
}

/** A join request to the private channel is approved ONLY for the Telegram account that passed the proof (approved: Map
 *  String(userId) -> { wallet, exp }); any other request is declined. null when the update is not a join request to OUR chat. */
export function joinRequestDecision(update, { chatId, approved, nowMs }) {
  const r = update && update.chat_join_request;
  if (!r || !r.chat || !r.from || !chatId || String(r.chat.id) !== String(chatId)) return null;
  const a = approved && approved.get(String(r.from.id));
  return { userId: r.from.id, approve: !!(a && a.exp > nowMs), wallet: a ? a.wallet : null };
}

/** game370: is the holders' bot configured? A BOOLEAN only — the server publishes it (GET /api/tblock/hold telegramReady) so the page
 *  shows "opening soon" instead of a button that can only answer TELEGRAM_NOT_CONFIGURED. Same rule as the invite below. */
export function telegramConfigured({ token, chatId } = {}) {
  return String(token ?? '').trim() !== '' && String(chatId ?? '').trim() !== '';
}

/* ── Telegram: a ONE-TIME invite link, created by the group's bot (the token and chat id live in the server env, never here) ── */
export async function telegramInvite({ token, chatId, wallet, nowS, fetchImpl = fetch, ttlS = 900, joinRequest = false }) {
  if (!telegramConfigured({ token, chatId })) return { ok: false, state: 'TELEGRAM_NOT_CONFIGURED', why: 'the Telegram bot is not configured on this server yet' };
  /* joinRequest: the link only ASKS to join and the bot approves the proven account alone (Telegram forbids member_limit with it) */
  const body = { chat_id: chatId, expire_date: Math.floor(nowS) + ttlS, name: ('hold ' + bas(wallet).slice(0, 10)).slice(0, 32),
    ...(joinRequest ? { creates_join_request: true } : { member_limit: 1 }) };
  let j;
  try {
    const r = await fetchImpl('https://api.telegram.org/bot' + token + '/createChatInviteLink', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    j = await r.json();
  } catch (_) { return { ok: false, state: 'TELEGRAM_UNREACHABLE', why: 'Telegram did not answer' }; }
  if (!j || j.ok !== true || !j.result || !/^https:\/\/t\.me\//.test(String(j.result.invite_link))) {
    return { ok: false, state: 'TELEGRAM_REFUSED', why: 'Telegram refused: ' + String((j && j.description) || 'no link').slice(0, 120) };
  }
  return { ok: true, link: j.result.invite_link, expiresS: body.expire_date };
}
