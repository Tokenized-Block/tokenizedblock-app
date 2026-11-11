// test-tblock-hold-20261109.mjs — proof of hold for TBLOCK. Pure checks always; LIVE=1 adds read-only Base mainnet reads.
import { poolIdOfKey, TBLOCK_POOL, holdVerdict, holdMessage, digestEip191, erc1271Call, verifyOwnership, tblockUsdAt, readHold,
  telegramInvite, WTCOIN_USDC_POOLS, WTCOIN, TBLOCK, ERC1271_MAGIC, HOLD_THRESHOLD_USD } from './tblock-hold.js';
import { selecteur } from './keccak.js';
import { signerDigest, adresseDe } from './signeur-secp256k1.js';

let ok = 0, ko = 0;
const t = (name, cond, extra = '') => { if (cond) ok++; else { ko++; console.log('RED', name, extra); } };

// 1. witnesses: the copied constants are proven, not trusted
t('poolId recomputed from the key', poolIdOfKey(TBLOCK_POOL) === TBLOCK_POOL.poolId, poolIdOfKey(TBLOCK_POOL));
t('poolId changes with the fee (key matters)', poolIdOfKey({ ...TBLOCK_POOL, fee: 10000 }) !== TBLOCK_POOL.poolId);
t('ERC-1271 magic is the selector of isValidSignature', selecteur('isValidSignature(bytes32,bytes)') === ERC1271_MAGIC);
t('threshold is $15', HOLD_THRESHOLD_USD === 15);

// 2. the rule
const E18 = 10n ** 18n;
let v = holdVerdict({ balance: 3_000_000n * E18, priceNow: 6e-6, priceBefore: 6e-6 });
t('3M TBLOCK at $6e-6 = $18 passes', v.ok && Math.abs(v.usd - 18) < 1e-6, JSON.stringify(v));
v = holdVerdict({ balance: 3_000_000n * E18, priceNow: 6e-6, priceBefore: 4e-6 });
t('the LOWER price is used ($12 fails)', !v.ok && Math.abs(v.usd - 12) < 1e-6 && v.tblockNeeded === 3_750_000, JSON.stringify(v));
v = holdVerdict({ balance: 3_000_000n * E18, priceNow: 60e-6, priceBefore: 6e-6 });
t('a pump now does not lower the bar', Math.abs(v.usd - 18) < 1e-6);
t('price not read -> not eligible', !holdVerdict({ balance: 10n ** 30n, priceNow: null, priceBefore: 1 }).ok);
t('balance not read -> not eligible, never zero', (() => { const r = holdVerdict({ balance: null, priceNow: 1, priceBefore: 1 }); return !r.ok && r.usd === null && /balance not read/.test(r.why); })());
t('exactly $15 passes', holdVerdict({ balance: 15n * E18, priceNow: 1, priceBefore: 1 }).ok);

// 3. tblockUsdAt with injected reads (mutation targets: median, min reads, disagreement)
const sqrtOf = (p) => '0x' + BigInt(Math.round(Math.sqrt(p) * 2 ** 96)).toString(16).padStart(64, '0') + '0'.repeat(64);
const lireFake = (wtUsd, tblockPerWt, dead = []) => async (to, data) => {
  if (dead.includes(to)) throw new Error('down');
  if (to === '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71') return sqrtOf(tblockPerWt);
  return sqrtOf(wtUsd[WTCOIN_USDC_POOLS.findIndex((p) => p.address === to)] / 1e12);
};
let p = await tblockUsdAt({ lire: lireFake([136, 137, 138], 20_000_000), bloc: 1 });
t('price = median wtCOIN / TBLOCK per wtCOIN', Math.abs(p.usd - 137 / 20_000_000) / p.usd < 1e-6, JSON.stringify(p));
p = await tblockUsdAt({ lire: lireFake([136, 137, 138], 20_000_000, [WTCOIN_USDC_POOLS[0].address, WTCOIN_USDC_POOLS[1].address]), bloc: 1 });
t('one wtCOIN pool is not enough', p.usd === null && /only 1/.test(p.why), JSON.stringify(p));
p = await tblockUsdAt({ lire: lireFake([100, 137, 138], 20_000_000), bloc: 1 });
t('pools that disagree -> no price', p.usd === null && /disagree/.test(p.why));
p = await tblockUsdAt({ lire: lireFake([136, 137, 138], 20_000_000, ['0xa3c0c9b65bad0b08107aa264b0f3db444b867a71']), bloc: 1 });
t('TBLOCK pool not read -> no price', p.usd === null && /TBLOCK pool/.test(p.why));

// 4. ownership: a real EOA signature, verified through a fake precompile that does a real recover locally
const KEY = '0x' + '11'.repeat(32), ME = adresseDe(KEY).toLowerCase();
const msg = holdMessage({ wallet: ME, nonce: 'abc123', issuedIso: '2026-11-09T12:00:00.000Z' });
const sig = signerDigest(KEY, digestEip191(msg));
const { recupererAdresse } = await import('./signeur-secp256k1.js');
const rpcFake = (code = '0x', r1271 = null) => async (m, prm) => {
  if (m === 'eth_call' && prm[0].to === '0x0000000000000000000000000000000000000001') {
    const d = prm[0].data.slice(2), digest = '0x' + d.slice(0, 64), vv = parseInt(d.slice(64, 128), 16);
    const a = recupererAdresse(digest, '0x' + d.slice(128, 192) + d.slice(192, 256) + vv.toString(16));
    return a ? '0x' + a.slice(2).toLowerCase().padStart(64, '0') : '0x';
  }
  if (m === 'eth_getCode') return code;
  if (m === 'eth_call') return r1271;
  throw new Error('unexpected ' + m);
};
let o = await verifyOwnership({ rpc: rpcFake(), wallet: ME, message: msg, signature: sig });
t('EOA signature of this wallet passes', o.ok && o.kind === 'eoa', JSON.stringify(o));
o = await verifyOwnership({ rpc: rpcFake(), wallet: '0x' + '22'.repeat(20), message: msg, signature: sig });
t('same signature for another wallet fails', !o.ok, JSON.stringify(o));
o = await verifyOwnership({ rpc: rpcFake(), wallet: ME, message: msg.replace('abc123', 'abc124'), signature: sig });
t('a changed message fails', !o.ok);
o = await verifyOwnership({ rpc: rpcFake('0x6000', ERC1271_MAGIC + '0'.repeat(56)), wallet: '0x' + '33'.repeat(20), message: msg, signature: '0x' + 'ab'.repeat(200) });
t('smart wallet answering the magic passes (ERC-1271)', o.ok && o.kind === 'erc1271', JSON.stringify(o));
o = await verifyOwnership({ rpc: rpcFake('0x6000', '0x' + '0'.repeat(64)), wallet: '0x' + '33'.repeat(20), message: msg, signature: '0x' + 'ab'.repeat(200) });
t('smart wallet answering anything else fails', !o.ok);
o = await verifyOwnership({ rpc: rpcFake('0x'), wallet: '0x' + '33'.repeat(20), message: msg, signature: '0x' + 'ab'.repeat(100) + '6492649264926492649264926492649264926492649264926492649264926492' });
t('undeployed smart wallet (6492) is refused with the reason', !o.ok && /not deployed/.test(o.why), JSON.stringify(o));
const cd = erc1271Call('0x' + '01'.repeat(32), '0x' + 'ff'.repeat(65));
t('1271 calldata: selector, digest, offset 0x40, length 65, padded', cd.slice(0, 10) === ERC1271_MAGIC && cd.slice(74, 138) === (64).toString(16).padStart(64, '0') && parseInt(cd.slice(138, 202), 16) === 65 && (cd.length - 2) % 64 === 8);

// 5. Telegram: no token -> says so; refused -> says so; link -> only a t.me link is returned
let tg = await telegramInvite({ token: '', chatId: '', wallet: ME, nowS: 1 });
t('no bot configured -> TELEGRAM_NOT_CONFIGURED', !tg.ok && tg.state === 'TELEGRAM_NOT_CONFIGURED');
let sent = null;
tg = await telegramInvite({ token: 'T', chatId: '-100', wallet: ME, nowS: 1000, fetchImpl: async (u, i) => { sent = JSON.parse(i.body); return { json: async () => ({ ok: true, result: { invite_link: 'https://t.me/+abc' } }) }; } });
t('one-time link: member_limit 1, expires', tg.ok && sent.member_limit === 1 && sent.expire_date === 1900 && tg.link === 'https://t.me/+abc');
tg = await telegramInvite({ token: 'T', chatId: '-100', wallet: ME, nowS: 1, fetchImpl: async () => ({ json: async () => ({ ok: true, result: { invite_link: 'https://evil.example/x' } }) }) });
t('a non t.me link is refused', !tg.ok && tg.state === 'TELEGRAM_REFUSED');

// 5b. the bot: /hold in the group -> a button to the private chat; private /start -> a proof link tied to that account
const { telegramReply, joinRequestDecision, HOLD_PAGE_URL, BOT_USERNAME } = await import('./tblock-hold.js');
const upd = (text, type = 'private', fromId = 7) => ({ update_id: 1, message: { message_id: 5, from: { id: fromId, is_bot: false }, chat: { id: type === 'private' ? fromId : -1001, type }, text } });
const codes = [];
const newCode = (id) => { codes.push(String(id)); return 'ab'.repeat(12); };
let rep = telegramReply(upd('/start hold'), { newCode });
const url = rep && rep.reply_markup.inline_keyboard[0][0].url;
t('private /start -> proof page link carrying a code for THIS account', url === HOLD_PAGE_URL + '?tg=' + 'ab'.repeat(12) && codes[0] === '7' && rep.chat_id === 7 && rep.text.includes('$15'));
rep = telegramReply(upd('/hold', 'supergroup'), { newCode });
t('group /hold -> a reply with a button to the private chat, no code minted in the group', rep && rep.reply_to_message_id === 5 && rep.reply_markup.inline_keyboard[0][0].url === 'https://t.me/' + BOT_USERNAME + '?start=hold' && codes.length === 1);
t('/hold@TblockHoldersBot is understood in the group', !!telegramReply(upd('/hold@TblockHoldersBot', 'supergroup')));
t('a command for another bot is ignored', telegramReply(upd('/hold@RoseBot', 'supergroup')) === null);
t('the bot is silent in channels and on other text', telegramReply(upd('/hold', 'channel')) === null && telegramReply(upd('send me your seed')) === null
  && telegramReply(upd('gm', 'supergroup')) === null && telegramReply({}) === null && telegramReply(null) === null);
t('a message from a bot is ignored', telegramReply({ message: { message_id: 1, from: { id: 9, is_bot: true }, chat: { id: 9, type: 'private' }, text: '/start' } }) === null);
t('the bot never asks for keys', /never ask for a seed phrase/.test(telegramReply(upd('/start'), { newCode }).text));
// join requests: only the account that passed the proof, only to our chat, only before expiry
const approved = new Map([['7', { wallet: '0xabc', exp: 2000 }]]);
const jrq = (fromId, chatId = -100123) => ({ chat_join_request: { chat: { id: chatId }, from: { id: fromId }, date: 1 } });
let d = joinRequestDecision(jrq(7), { chatId: '-100123', approved, nowMs: 1000 });
t('the proven account is approved', d && d.approve === true && d.userId === 7 && d.wallet === '0xabc');
d = joinRequestDecision(jrq(8), { chatId: '-100123', approved, nowMs: 1000 });
t('another account with the same link is declined', d && d.approve === false);
d = joinRequestDecision(jrq(7), { chatId: '-100123', approved, nowMs: 3000 });
t('an expired approval is declined', d && d.approve === false);
t('a join request to another chat is not ours', joinRequestDecision(jrq(7, -100999), { chatId: '-100123', approved, nowMs: 1000 }) === null);
t('no chat configured -> not ours', joinRequestDecision(jrq(7), { chatId: '', approved, nowMs: 1000 }) === null);
let sentJr = null;
await telegramInvite({ token: 'T', chatId: '-100', wallet: ME, nowS: 1000, joinRequest: true, fetchImpl: async (u, i) => { sentJr = JSON.parse(i.body); return { json: async () => ({ ok: true, result: { invite_link: 'https://t.me/+jr' } }) }; } });
t('join-request link: creates_join_request, no member_limit', sentJr.creates_join_request === true && !('member_limit' in sentJr));

// 5c. "10 minutes ago" must be found on a node that REFUSES anything deeper than 10,000 blocks (prod game320: priceBefore null)
const { recentBlockAt, readPrices } = await import('./tblock-hold.js');
const { blocAuTemps } = await import('./eligibilite-unit.js');
const HEAD = 55_000_000, tsOf = (n) => 1_700_000_000 + Math.floor(n / 5); /* 0.2 s per block */
const nodeNoArchive = async (n) => { if (HEAD - n > 10_000) throw new Error('archive refused'); return tsOf(n); };
const target = tsOf(HEAD) - 600;
const found = await recentBlockAt({ lireTs: nodeNoArchive, tete: HEAD, ts: target });
t('recent search finds the block 10 min ago on a non-archive node', found !== null && tsOf(found) <= target && tsOf(found + 1) > target, String(found));
const old = await blocAuTemps({ lireTs: nodeNoArchive, tete: HEAD, ts: target }).catch(() => null);
t('WITNESS: the old search from block 1 fails on that node (the prod bug)', old === null);
/* a FASTER chain (0.05 s blocks): 10 min = 12,000 blocks, beyond the first 6,000-block window -> the window must widen */
const fastTs = (n) => 1_700_000_000 + Math.floor(n / 20);
const fast = async (n) => { if (HEAD - n > 200_000) throw new Error('archive refused'); return fastTs(n); };
const tgt2 = fastTs(HEAD) - 600;
const f2 = await recentBlockAt({ lireTs: fast, tete: HEAD, ts: tgt2 });
t('a faster chain widens the window and still finds it', f2 !== null && fastTs(f2) <= tgt2 && fastTs(f2 + 1) > tgt2 && HEAD - f2 > 6000, String(f2));
const pr = await readPrices({ lire: lireFake([136, 137, 138], 20_000_000), lireTs: nodeNoArchive, tete: HEAD });
t('readPrices gives BOTH prices on a non-archive node', Number.isFinite(pr.now.usd) && Number.isFinite(pr.prev.usd) && pr.before !== null, JSON.stringify(pr.prev));

// 5d. the holder tag (Bot API setChatMemberTag: 0-16 characters, no emoji)
const { holderTagCall, HOLDER_TAG } = await import('./tblock-hold.js');
t('holder tag fits Telegram limits', [...HOLDER_TAG].length <= 16 && !/\p{Extended_Pictographic}/u.test(HOLDER_TAG));
const tc = holderTagCall(-1001, '7');
t('tag call: group, numeric user, tag', tc && tc.chat_id === -1001 && tc.user_id === 7 && tc.tag === HOLDER_TAG);
t('no group known -> no tag call', holderTagCall(undefined, 7) === null && holderTagCall(null, 7) === null);
t('a tag over 16 chars or with an emoji is refused', holderTagCall(-1, 7, 'TBLOCK Holder 2026!') === null && holderTagCall(-1, 7, 'Holder 🔥') === null);

// 5e. game372 Step B: the 10-minute search starts from the LAST answer (hint). A valid hint costs at most 4 timestamp reads and gives the
//     same block as the full search; a stale hint, one past the head, a changed block time or a failed read give the full search's answer.
async function serieHint(M) {
  const f = [];
  const v = (c, m) => { if (!c) f.push(m); };
  const compte = (lireTs) => { const w = async (n) => { w.n++; return lireTs(n); }; w.n = 0; return w; };
  /* 0.2 s per block (Base after Denim), timestamps in whole seconds. The server keeps a read 60 s: a refresh 60 s later (300 blocks) is
   *  the case the hint is for -> <= 4 reads whatever the head's place inside its second (r). An OLDER hint must still give the right block;
   *  its read count is printed, not promised: the head's timestamp is a whole second, so the measured block time errs by up to 1 s over
   *  (head - hint) and the guess can miss by a block or two -> the full search (measured below). */
  const lus = [];
  for (const [gap, r] of [[300, 0], [300, 1], [300, 2], [300, 3], [300, 4], [600, 0], [600, 2], [1500, 3], [1500, 0], [3000, 0], [3000, 4]]) {
    const head0 = HEAD - gap, head1 = HEAD + r;
    const prev = await M.recentBlockAt({ lireTs: nodeNoArchive, tete: head0, ts: tsOf(head0) - 600 });
    const full = await M.recentBlockAt({ lireTs: nodeNoArchive, tete: head1, ts: tsOf(head1) - 600 });
    const c = compte(nodeNoArchive);
    const viaHint = await M.recentBlockAt({ lireTs: c, tete: head1, ts: tsOf(head1) - 600, hint: prev });
    v(viaHint === full && full !== null, 'hint ' + gap + ' blocks old: same block as the full search (' + viaHint + ' vs ' + full + ')');
    const cf = compte(nodeNoArchive);
    await M.recentBlockAt({ lireTs: cf, tete: head1, ts: tsOf(head1) - 600 });
    lus.push(gap + '/' + r + ': ' + c.n + ' (full ' + cf.n + ')');
    if (gap === 300) {
      v(c.n <= 4, 'hint 60 s old (r=' + r + '): at most 4 timestamp reads (read ' + c.n + ')');
      const c2 = compte(nodeNoArchive);
      const pr2 = await M.readPrices({ lire: lireFake([136, 137, 138], 20_000_000), lireTs: c2, tete: head1, hint: prev });
      v(pr2.before === full && c2.n <= 4, 'readPrices passes the hint: before ' + pr2.before + ' vs ' + full + ', ' + c2.n + ' timestamp reads (<= 4 with the head read)');
    }
  }
  if (M.__principal) console.log('   timestamp reads with a hint, by hint age in blocks / head place r: ' + lus.join(' · '));
  /* 2 s per block (before Denim): the guess is exact too */
  const slowTs = (n) => 1_700_000_000 + n * 2, slow = async (n) => slowTs(n);
  const sPrev = await M.recentBlockAt({ lireTs: slow, tete: HEAD - 40, ts: slowTs(HEAD - 40) - 600 });
  const sFull = await M.recentBlockAt({ lireTs: slow, tete: HEAD, ts: slowTs(HEAD) - 600 });
  const cs = compte(slow);
  v(await M.recentBlockAt({ lireTs: cs, tete: HEAD, ts: slowTs(HEAD) - 600, hint: sPrev }) === sFull && cs.n <= 4, '2 s chain: hint gives the full answer in <= 4 reads (' + cs.n + ')');
  const target = tsOf(HEAD) - 600, fullNow = await M.recentBlockAt({ lireTs: nodeNoArchive, tete: HEAD, ts: target });
  /* a stale hint (older than span x 9), one past the head, one AT the head, garbage: the full search, same answer */
  for (const [nom, hint] of [['stale', HEAD - 60_000], ['past the head', HEAD + 5], ['at the head', HEAD], ['not an integer', 'x'], ['NaN', NaN], ['null', null]]) {
    v(await M.recentBlockAt({ lireTs: nodeNoArchive, tete: HEAD, ts: target, hint }) === fullNow, nom + ' hint -> the full search answer');
  }
  /* a hint whose guessed block fails to read -> the full search, same answer */
  const prevOk = await M.recentBlockAt({ lireTs: nodeNoArchive, tete: HEAD - 300, ts: tsOf(HEAD - 300) - 600 });
  let premier = true;
  const flaky = async (n) => { if (n !== HEAD && n !== prevOk && premier) { premier = false; throw new Error('429'); } return nodeNoArchive(n); };
  v(await M.recentBlockAt({ lireTs: flaky, tete: HEAD, ts: target, hint: prevOk }) === fullNow, 'failed read of the guessed block -> the full search answer');
  /* Denim: 2 s per block up to D, 0.2 s after; the hint is from the 2 s era -> the averaged guess lands too LOW (ts(g) <= ts but ts(g+1) <= ts too) */
  const D = HEAD - 4000, denTs = (n) => (n <= D ? 1_700_000_000 + n * 2 : 1_700_000_000 + D * 2 + Math.floor((n - D) / 5));
  const den = async (n) => { if (HEAD - n > 30_000) throw new Error('archive refused'); return denTs(n); };
  const dTarget = denTs(HEAD) - 600;
  const dFull = await M.recentBlockAt({ lireTs: den, tete: HEAD, ts: dTarget });
  const dHint = D - 200;
  v(dFull !== null && denTs(dFull) <= dTarget && denTs(dFull + 1) > dTarget, 'Denim chain: the full search finds the block (' + dFull + ')');
  v(await M.recentBlockAt({ lireTs: den, tete: HEAD, ts: dTarget, hint: dHint }) === dFull, 'changed block time (Denim) -> the full search answer');
  /* the other way: 0.2 s up to D2, then 2 s (a slowdown); the hint is from the fast era -> the guess lands too LOW: only the ts(g+1) check sees it */
  const D2 = HEAD - 200, lenTs = (n) => (n <= D2 ? 1_700_000_000 + Math.floor(n / 5) : 1_700_000_000 + Math.floor(D2 / 5) + (n - D2) * 2);
  const len = async (n) => lenTs(n);
  const lTarget = lenTs(HEAD) - 600, lFull = await M.recentBlockAt({ lireTs: len, tete: HEAD, ts: lTarget });
  v(lFull !== null && lenTs(lFull) <= lTarget && lenTs(lFull + 1) > lTarget, 'slowdown chain: the full search finds the block (' + lFull + ')');
  const lGot = await M.recentBlockAt({ lireTs: len, tete: HEAD, ts: lTarget, hint: D2 - 3000 });
  v(lGot === lFull, 'changed block time (slowdown) -> the full search answer (' + lGot + ' vs ' + lFull + ')');
  return f;
}
const fautesHint = await serieHint({ ...(await import('./tblock-hold.js')), __principal: true });
t('Step B: the hint (valid, stale, past the head, failed read, Denim)', fautesHint.length === 0, fautesHint.join(' ; '));
/* MUTANT: the ts(g+1) check skipped -> RED (a copy of the module in a temp dir, its imports pointed at the originals) */
{
  const { readFileSync, writeFileSync, mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath, pathToFileURL } = await import('node:url');
  const ici = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(ici, 'tblock-hold.js'), 'utf8');
  const DE = 'if (Number.isFinite(tg1) && ts < tg1) return g;';
  t('mutant anchor present (ts(g+1) check)', src.includes(DE));
  const tmp = mkdtempSync(join(tmpdir(), 'tb-hold-hint-'));
  const fm = join(tmp, 'tblock-hold-mut.js');
  writeFileSync(fm, src.replace(/from '\.\/([^']+)'/g, (_, f) => "from '" + pathToFileURL(join(ici, f)).href + "'")
    .replace('const tg1 = await lireTs(g + 1).catch(() => null);', 'const tg1 = ts + 1;'));
  let rouge = false, vu = '';
  try { const fx = await serieHint(await import(pathToFileURL(fm).href)); rouge = fx.length > 0; vu = fx[0] || 'GREEN'; } catch (e) { rouge = true; vu = 'threw ' + e.message; }
  console.log('   mutant « ts(g+1) check skipped » : ' + vu);
  t('MUTANT SURVIVES: ts(g+1) check skipped', rouge);
  rmSync(tmp, { recursive: true, force: true });
}
/* 5f. game372 review: the SERVER wiring of Step B, executed (slices of serveur-web.js: horodatageBloc, tbLire, tbLireTs, tbPrices), not
 *   read as text. A refresh 300 blocks after the first answer costs <= 3 eth_getBlockByNumber and finds the full search's block. RED if
 *   tbPrices stops passing the hint or tbLireTs stops going through horodatageBloc (both checked by mutants below). */
async function serieServeur(src) {
  const f = [];
  const v = (c, m) => { if (!c) f.push(m); };
  const NL = String.fromCharCode(10);
  const cut = (de, fin) => { const i = src.indexOf(de); const e = i < 0 ? -1 : src.indexOf(fin, i); return i < 0 || e < 0 ? null : src.slice(i, e + fin.length); };
  const sH = cut('const horodatagesBlocsRolls = new Map();', '  return ts;' + NL + '}' + NL);
  const sP = cut('const tbLire = (to, data, b) =>', '  return TB_HOLD.pending;' + NL + '}' + NL);
  if (!sH || !sP) { f.push('server slices not found'); return f; }
  const { AsyncLocalStorage } = await import('node:async_hooks');
  const M = await import('./tblock-hold.js');
  const chaine = { tete: HEAD - 300, lus: 0 };
  const rpcServeur = async (m, p) => {
    if (m === 'eth_blockNumber') return '0x' + chaine.tete.toString(16);
    if (m === 'eth_getBlockByNumber') { chaine.lus++; const n = parseInt(p[0], 16); return { timestamp: '0x' + (await nodeNoArchive(n)).toString(16) }; }
    throw new Error('unexpected ' + m);
  };
  const prix = lireFake([136, 137, 138], 20_000_000);
  const rpcRails = async (m, p) => prix(p[0].to, p[0].data);
  const TB_HOLD = { prices: null, at: 0, pending: null };
  const fab = new Function('rpcServeur', 'rpcRails', 'tbReadPrices', 'TB_HOLD', 'consommateurArchive', '"use strict";' + NL + sH + sP + NL + 'return { tbPrices };');
  const { tbPrices } = fab(rpcServeur, rpcRails, M.readPrices, TB_HOLD, new AsyncLocalStorage());
  const p1 = await tbPrices();
  v(Number.isSafeInteger(p1.before), 'first read finds the 10-min block (' + p1.before + ')');
  chaine.tete = HEAD; TB_HOLD.at = 0; chaine.lus = 0;
  const p2 = await tbPrices();
  const full = await M.recentBlockAt({ lireTs: nodeNoArchive, tete: HEAD, ts: tsOf(HEAD) - 600 });
  v(p2.before === full && full !== null, 'refresh finds the full search block (' + p2.before + ' vs ' + full + ')');
  /* head + g + g+1: the hint's own timestamp was read by the first search, it comes from horodatageBloc's cache (4 without the cache) */
  v(chaine.lus <= 3, 'refresh 300 blocks later: at most 3 eth_getBlockByNumber, the hint from the cache (read ' + chaine.lus + ')');
  return f;
}
{
  const { readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const srcSrv = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'serveur-web.js'), 'utf8').split(String.fromCharCode(13)).join('');
  const fs0 = await serieServeur(srcSrv);
  t('Step B server wiring: tbPrices passes the hint, tbLireTs through horodatageBloc (executed)', fs0.length === 0, fs0.join(' ; '));
  const MUTS = [
    ['hint not passed by tbPrices', 'lireTs: tbLireTs, tete, hint: TB_HOLD.prices && TB_HOLD.prices.before });', 'lireTs: tbLireTs, tete });'],
    ['tbLireTs straight to the node (no cache)', 'const tbLireTs = async (n) => { const ts = await horodatageBloc(Number(n)); return ts === null ? NaN : ts; };',
      "const tbLireTs = async (n) => { const b = await rpcServeur('eth_getBlockByNumber', ['0x' + Number(n).toString(16), false]); return b ? Number(BigInt(b.timestamp)) : NaN; };"],
  ];
  for (const [nom, de, a] of MUTS) {
    t('mutant anchor present (' + nom + ')', srcSrv.includes(de));
    const fx = await serieServeur(srcSrv.replace(de, () => a));
    console.log('   mutant « ' + nom + ' » : ' + (fx[0] || 'GREEN'));
    t('MUTANT SURVIVES: ' + nom, fx.length > 0);
  }
}

// 6. LIVE (read-only, Base mainnet)
if (process.env.LIVE === '1') {
  const RPCS = ['https://base-rpc.publicnode.com', 'https://mainnet.base.org'];
  const rpc = async (method, params) => { let last; for (const u of RPCS) { try { const r = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json', 'x-ms-monitor': '1' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(20000) }); const j = await r.json(); if (j.error) { last = new Error(JSON.stringify(j.error)); continue; } return j.result; } catch (e) { last = e; } } throw last; };
  const lire = (to, data, b) => rpc('eth_call', [{ to, data }, '0x' + Number(b).toString(16)]);
  const lireTs = async (n) => Number(BigInt((await rpc('eth_getBlockByNumber', ['0x' + Number(n).toString(16), false])).timestamp));
  const tete = Number(BigInt(await rpc('eth_blockNumber', [])));
  for (const pool of WTCOIN_USDC_POOLS) {
    const t0 = '0x' + (await rpc('eth_call', [{ to: pool.address, data: selecteur('token0()') }, 'latest'])).slice(-40);
    const t1 = '0x' + (await rpc('eth_call', [{ to: pool.address, data: selecteur('token1()') }, 'latest'])).slice(-40);
    t('LIVE ' + pool.address + ' is wtCOIN/USDC', t0 === WTCOIN && t1 === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', t0 + ' ' + t1);
  }
  const live = await tblockUsdAt({ lire, bloc: tete });
  console.log('LIVE price', JSON.stringify(live));
  t('LIVE TBLOCK price read, wtCOIN in $50..$500', live.usd > 0 && live.wtcoinUsd > 50 && live.wtcoinUsd < 500 && live.wtcoinReads === 3);
  const dev = await readHold({ lire, lireTs, tete, wallet: '0x37eb9b7ce0b51fe12fbf092026e001918128580a' });
  console.log('LIVE dev wallet', JSON.stringify(dev));
  t('LIVE dev wallet (14M TBLOCK per basestonk) passes $15', dev.ok === true, dev.why);
  const empty = await readHold({ lire, lireTs, tete, wallet: '0x000000000000000000000000000000000000beef' });
  t('LIVE empty wallet fails with a balance reason', empty.ok === false && /below/.test(empty.why), JSON.stringify(empty));
}
console.log(ko === 0 ? 'GREEN' : 'RED', ok + '/' + (ok + ko));
process.exit(ko === 0 ? 0 : 1);
