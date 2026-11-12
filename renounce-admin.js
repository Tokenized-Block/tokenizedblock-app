// renounce-admin.js — game378: the creator of a block born through the app gives up the block's admin role, for good.
// Pure module: no DOM, no key, nothing is signed or sent here. The page (renounce-admin.html) passes a chain reader and the wallet's
// answers; this module decides what may be offered, builds the unsigned calls, judges the simulation and the receipts.
//
// WHY (measured 2026-11-12, renounce-admin-calls.md + banc-renounce-admin-fork-20261112.mjs): every block born through the app gets
//   DEFAULT_ADMIN_ROLE for its creator (app.html calldataCreation passes admin: compte). An admin can raise the supply cap and give
//   itself the mint role. A plain renounceRole by the last admin reverts LastAdminCannotRenounce() (0x361513e7): the B-20 never stays
//   without an admin. What works is ONE batch from the admin: (1) grantRole(DEFAULT_ADMIN_ROLE, 0x…dEaD), (2) renounceRole(
//   DEFAULT_ADMIN_ROLE, admin). After it the admin role is held by the dead address only, whose key nobody holds: hasRole(admin, dEaD)
//   reads true for ever, and updateSupplyCap / grantRole revert AccessControlUnauthorizedAccount (0xe2517d3f) for everyone.
// ⛔ What else it changes (fork, live hook 7030): the hook lets only the block's ADMIN register a NEW pool (inscrireAvecCaution ->
//   PasAdminDuBlock() 0x37d927c1), so the block can no longer open a market in another currency. Its existing market keeps trading
//   both ways, the creator deposit, the creator fee share, a withdrawal request and the withdrawal itself only check the creator
//   recorded by the hook, not the admin role (TBlockLaunchLockHook.sol demanderRetrait / retirerCaution / recharger / reclamer).
// ⛔ What is offered, and to whom: only a block of OUR births (the router seed, the old routers' seed, the served router index — each
//   entry proven by the router address formula — and the served list of our blocks), only when the CONNECTED wallet holds its admin
//   role, re-read live by hasRole right before anything is built, only when the whole supply exists (totalSupply == supplyCap) and the
//   wallet holds no mint or burn role. Never a block the wallet is not admin of.
// ⛔ The simulation proves the sentence the page shows: in ONE eth_simulateV1 sequence from the wallet, the batch, then per block:
//   hasRole(admin, wallet) = 0, hasRole(admin, dEaD) = 1, renounceRole by dEaD itself reverts LastAdminCannotRenounce (so dEaD is the
//   ONLY admin left: no other account can raise the cap), updateSupplyCap and grantRole(mint) from the wallet revert unauthorized.
//   If no node runs eth_simulateV1, the fallback is eth_call call by call (stated as such): grant passes, and renounce ALONE reverts
//   LastAdminCannotRenounce, which proves the wallet is the only admin today.
// Does NOT prove: the B-20 is native code on Base (no source to read); a future change of that code by Base is outside this proof. A
//   mint or burn role given earlier to ANOTHER account is not listed by this page (it reads the wallet's own roles); for supply == cap
//   and no admin left, such a role could only burn and re-mint up to the same cap.
import { selecteur, topic, keccak256Hex } from './keccak.js';
import { neDuRouteur, ROUTEURS_ANCIENS, GRAINE_ROUTEUR, GRAINE_ANCIENS_ROUTEURS } from './index-routeur.js';
import { CREATE_ROUTER } from './frais-creation.js';
import { symboleDepuisReponse, decoderChaineAbi, nettoyerPourEcran } from './texte-onchain.js';

export const CHAIN_ID = 8453;
export const CHAIN_ID_HEX = '0x2105';
export const PUBLIC_NODES = Object.freeze(['https://mainnet.base.org', 'https://base-rpc.publicnode.com']);
export const DEFAULT_ADMIN_ROLE = '0x' + '0'.repeat(64);
const role = (name) => keccak256Hex(new TextEncoder().encode(name));
export const MINT_ROLE = role('MINT_ROLE');
export const BURN_ROLE = role('BURN_ROLE');
/** the dead address, the same one the app gives permanent liquidity to (lancer-pool.js PROPRIETAIRE_PERMANENT; the test checks it) */
export const DEAD = '0x000000000000000000000000000000000000dEaD';
export const SEL = Object.freeze({
  grantRole: selecteur('grantRole(bytes32,address)'),
  renounceRole: selecteur('renounceRole(bytes32,address)'),
  revokeRole: selecteur('revokeRole(bytes32,address)'),
  hasRole: selecteur('hasRole(bytes32,address)'),
  updateSupplyCap: selecteur('updateSupplyCap(uint256)'),
  totalSupply: selecteur('totalSupply()'),
  supplyCap: selecteur('supplyCap()'),
  name: selecteur('name()'),
  symbol: selecteur('symbol()'),
  decimals: selecteur('decimals()'),
});
/** raw units as plain text (whole part grouped, no trailing zeros); null decimals = the raw integer */
export function units(raw, decimals) {
  const b = BigInt(raw);
  if (!Number.isInteger(decimals)) return b.toString();
  const s = b.toString().padStart(decimals + 1, '0');
  const whole = s.slice(0, s.length - decimals), frac = s.slice(s.length - decimals).replace(/0+$/, '');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac ? '.' + frac : '');
}
export const ERR = Object.freeze({
  LAST_ADMIN: selecteur('LastAdminCannotRenounce()'),
  UNAUTHORIZED: selecteur('AccessControlUnauthorizedAccount(address,bytes32)'),
  BAD_CONFIRMATION: selecteur('AccessControlBadConfirmation()'),
});
export const TOPIC = Object.freeze({
  ROLE_GRANTED: topic('RoleGranted(bytes32,address,address)'),
  ROLE_REVOKED: topic('RoleRevoked(bytes32,address,address)'),
});
/** the one-line consequence measured on the live hook 7030 (fork): opening a new pool needs the block's admin */
export const CONSEQUENCE_PAIR = 'This block can no longer open a market in another currency.';
/** what stays, measured on the same fork after the batch */
export const STAYS = 'Its market keeps trading both ways, and your creator deposit, fee share and withdrawal work as before.';
export const AFTER = 'Nobody can ever raise the cap or mint.';

const B20 = /^0xb2[0]{20}[0-9a-f]{18}$/;
const ADR = /^0x[0-9a-f]{40}$/;
const low = (a) => String(a ?? '').toLowerCase();
const word = (a) => low(a).replace(/^0x/, '').padStart(64, '0');
const ROUTERS = [low(CREATE_ROUTER), ...ROUTEURS_ANCIENS.map(low)];

/** was `block` born from one of our routers with this salt? (the hook's own neDuRouteur formula; a router outside ours is refused) */
function provenBirth(block, sel, router = null) {
  const list = router ? [low(router)].filter((r) => ROUTERS.includes(r)) : ROUTERS;
  return list.some((r) => neDuRouteur(block, sel, r));
}

/**
 * The blocks of our births, from the seeds and the two served lists (/api/blocks-routeur, /api/nos-blocks). An entry that fails its
 * proof is counted, never kept. `complete` = both served lists say ok, full coverage, no failed window (else the page says the list
 * may miss a block).
 */
export function candidateBlocks({ routerIndex = null, ourBlocks = null } = {}) {
  const seen = new Map();
  const add = (a, source) => { const k = low(a); const e = seen.get(k) || { block: k, sources: [] }; if (!e.sources.includes(source)) e.sources.push(source); seen.set(k, e); };
  let rejected = 0;
  for (const g of GRAINE_ROUTEUR) if (provenBirth(g.jeton, g.sel)) add(g.jeton, 'router');
  for (const g of GRAINE_ANCIENS_ROUTEURS) if (provenBirth(g.jeton, g.sel, g.routeur)) add(g.jeton, 'old router');
  for (const b of (routerIndex && Array.isArray(routerIndex.blocks)) ? routerIndex.blocks : []) {
    if (b && B20.test(low(b.jeton)) && provenBirth(b.jeton, b.sel, b.routeur || null)) add(b.jeton, 'router'); else rejected += 1;
  }
  for (const j of (ourBlocks && Array.isArray(ourBlocks.blocks)) ? ourBlocks.blocks : []) {
    if (B20.test(low(j))) add(j, 'our blocks'); else rejected += 1;
  }
  const served = (x) => !!x && x.ok === true && x.couvertureComplete === true && !x.fenetresRatees;
  return { blocks: [...seen.values()], complete: served(routerIndex) && served(ourBlocks), rejected };
}

/** the two unsigned calls, in this order (the order matters: renounce first reverts LastAdminCannotRenounce) */
export function encodeGrantDead() { return SEL.grantRole + word(DEFAULT_ADMIN_ROLE) + word(DEAD); }
export function encodeRenounce(holder) { return SEL.renounceRole + word(DEFAULT_ADMIN_ROLE) + word(holder); }
export function callsFor(block, wallet, { deadIsAdmin = false } = {}) {
  const to = low(block);
  const calls = [];
  if (!deadIsAdmin) calls.push({ to, data: encodeGrantDead(), value: '0x0', name: 'grantRole(DEFAULT_ADMIN_ROLE, 0x…dEaD)', expects: { topic: TOPIC.ROLE_GRANTED, account: low(DEAD) } });
  calls.push({ to, data: encodeRenounce(wallet), value: '0x0', name: 'renounceRole(DEFAULT_ADMIN_ROLE, you)', expects: { topic: TOPIC.ROLE_REVOKED, account: low(wallet) } });
  return calls;
}

const isTrue = (hex) => { try { return BigInt(hex) === 1n; } catch (_) { return null; } };
const asBig = (hex) => { try { const s = String(hex); return s === '0x' || !/^0x[0-9a-fA-F]+$/.test(s) ? null : BigInt(s); } catch (_) { return null; } };

/**
 * Reads one block for this wallet, live. state: OFFER (may be offered) | NOT_ADMIN (never offered) | REFUSE (admin, but the sentence
 * would not be true: why) | UNREAD (a read failed: nothing offered). Every read is an eth_call on `rpc`.
 */
export async function readBlock({ rpc, block, wallet }) {
  const b = low(block), w = low(wallet);
  const base = { block: b, wallet: w };
  if (!B20.test(b) || !ADR.test(w)) return { ...base, state: 'UNREAD', why: 'not an address' };
  const call = (data) => rpc('eth_call', [{ to: b, data }, 'latest']);
  let walletAdmin;
  try { walletAdmin = isTrue(await call(SEL.hasRole + word(DEFAULT_ADMIN_ROLE) + word(w))); } catch (_) { walletAdmin = null; }
  if (walletAdmin === null) return { ...base, state: 'UNREAD', why: 'your role on this block could not be read' };
  if (walletAdmin === false) return { ...base, state: 'NOT_ADMIN', walletAdmin: false };
  let r;
  try {
    r = await Promise.all([call(SEL.totalSupply), call(SEL.supplyCap), call(SEL.hasRole + word(DEFAULT_ADMIN_ROLE) + word(DEAD)),
      call(SEL.hasRole + word(MINT_ROLE) + word(w)), call(SEL.hasRole + word(BURN_ROLE) + word(w))]);
  } catch (_) { return { ...base, walletAdmin: true, state: 'UNREAD', why: 'the supply, the cap or the roles could not be read' }; }
  const [ts, cap, deadIsAdmin, walletMint, walletBurn] = [asBig(r[0]), asBig(r[1]), isTrue(r[2]), isTrue(r[3]), isTrue(r[4])];
  if (ts === null || cap === null || deadIsAdmin === null || walletMint === null || walletBurn === null) return { ...base, walletAdmin: true, state: 'UNREAD', why: 'an answer could not be decoded' };
  let name = null, symbol = null, decimals = null;
  try { const d = decoderChaineAbi(await call(SEL.name)); name = d === null ? null : nettoyerPourEcran(d, 40); } catch (_) { name = null; }
  try { symbol = symboleDepuisReponse(await call(SEL.symbol)); } catch (_) { symbol = null; }
  try { const d = asBig(await call(SEL.decimals)); decimals = d !== null && d <= 36n ? Number(d) : null; } catch (_) { decimals = null; }
  const row = { ...base, walletAdmin: true, deadIsAdmin, walletMint, walletBurn, totalSupply: ts, supplyCap: cap, name, symbol, decimals };
  if (ts !== cap) return { ...row, state: 'REFUSE', why: 'its supply is below its cap, so it is not offered here' };
  if (walletMint || walletBurn) return { ...row, state: 'REFUSE', why: 'your wallet also holds its ' + (walletMint ? 'mint' : 'burn') + ' role, so it is not offered here' };
  return { ...row, state: 'OFFER', calls: callsFor(b, w, { deadIsAdmin }) };
}

/** reads every candidate for this wallet, a few at a time; returns { rows, offered, admin } (admin = rows where the wallet is admin) */
export async function readWallet({ rpc, wallet, candidates, parallel = 4 }) {
  const list = candidates.map((c) => (typeof c === 'string' ? c : c.block));
  const rows = new Array(list.length);
  let next = 0;
  const worker = async () => { while (next < list.length) { const k = next++; rows[k] = await readBlock({ rpc, block: list[k], wallet }); } };
  await Promise.all(Array.from({ length: Math.min(parallel, list.length) }, worker));
  return { rows, offered: rows.filter((r) => r.state === 'OFFER'), admin: rows.filter((r) => r.walletAdmin === true) };
}

/**
 * Right before the wallet opens: every chosen block is read AGAIN (hasRole, supply, cap, roles). ok only when each is still OFFER for
 * this wallet; `rows` are the fresh rows (the page builds the batch from them, never from what it showed earlier).
 */
export async function recheck({ rpc, wallet, rows }) {
  const fresh = [];
  for (const r of rows) fresh.push(await readBlock({ rpc, block: r.block, wallet }));
  const lost = fresh.filter((f) => f.state !== 'OFFER');
  return { ok: rows.length > 0 && fresh.length === rows.length && lost.length === 0, rows: fresh, lost };
}

/** the whole batch for the chosen blocks, in order: block 1 grant, block 1 renounce, block 2 grant, … Refuses any row not OFFER. */
export function batchFor(rows, wallet) {
  const w = low(wallet);
  if (!ADR.test(w)) throw new Error('no wallet');
  if (!rows.length) throw new Error('no block chosen');
  for (const r of rows) if (r.state !== 'OFFER' || low(r.wallet) !== w || r.walletAdmin !== true) throw new Error('refused: ' + r.block + ' is not offered to this wallet');
  return rows.flatMap((r) => callsFor(r.block, w, { deadIsAdmin: r.deadIsAdmin === true }));
}

const revertSel = (c) => { const d = String((c && c.error && c.error.data) || (c && c.returnData) || ''); return d.slice(0, 10).toLowerCase(); };

/**
 * Simulates the batch, then the proof of the sentence, from the wallet. One eth_simulateV1 sequence (state carried from call to call).
 * Returns { method: 'eth_simulateV1' | 'eth_call', ok, blocks: [{ block, ok, lines }] , why }.
 */
export async function simulate({ rpc, wallet, rows }) {
  const w = low(wallet);
  const calls = batchFor(rows, w);
  const checks = [];
  for (const r of rows) {
    const b = low(r.block);
    checks.push({ block: b, what: 'you no longer hold the admin role', from: w, to: b, data: SEL.hasRole + word(DEFAULT_ADMIN_ROLE) + word(w), want: 'ZERO' });
    checks.push({ block: b, what: 'the dead address holds the admin role', from: w, to: b, data: SEL.hasRole + word(DEFAULT_ADMIN_ROLE) + word(DEAD), want: 'ONE' });
    checks.push({ block: b, what: 'the dead address is the last admin (its own renounce is refused)', from: low(DEAD), to: b, data: encodeRenounce(DEAD), want: ERR.LAST_ADMIN });
    checks.push({ block: b, what: 'raising the cap is refused', from: w, to: b, data: SEL.updateSupplyCap + word('0x' + ((r.supplyCap || 0n) + 1n).toString(16)), want: ERR.UNAUTHORIZED });
    checks.push({ block: b, what: 'giving the mint role is refused', from: w, to: b, data: SEL.grantRole + word(MINT_ROLE) + word(w), want: ERR.UNAUTHORIZED });
  }
  const seq = [...calls.map((c) => ({ from: w, to: c.to, data: c.data, value: '0x0' })), ...checks.map((c) => ({ from: c.from, to: c.to, data: c.data }))];
  let res = null, why = null;
  try {
    const out = await rpc('eth_simulateV1', [{ blockStateCalls: [{ calls: seq }], validation: false }, 'latest']);
    res = out && out[0] && Array.isArray(out[0].calls) && out[0].calls.length === seq.length ? out[0].calls : null;
    if (!res) why = 'the simulation answered an unexpected shape';
  } catch (e) { why = String((e && e.message) || e); }
  if (res) {
    const blocks = rows.map((r) => ({ block: low(r.block), ok: true, lines: [] }));
    const at = (b) => blocks.find((x) => x.block === b);
    calls.forEach((c, k) => { const s = res[k]; const good = s.status === '0x1'; const B = at(c.to); B.lines.push({ ok: good, text: c.name + (good ? ' succeeds' : ' REVERTS ' + revertSel(s)) }); if (!good) B.ok = false; });
    checks.forEach((c, k) => {
      const s = res[calls.length + k]; let good;
      if (c.want === 'ZERO' || c.want === 'ONE') good = s.status === '0x1' && asBig(s.returnData) === (c.want === 'ONE' ? 1n : 0n);
      else good = s.status !== '0x1' && revertSel(s) === c.want;
      const B = at(c.block); B.lines.push({ ok: good, text: c.what + (good ? ': yes' : ': NO') }); if (!good) B.ok = false;
    });
    return { method: 'eth_simulateV1', ok: blocks.every((b) => b.ok), blocks };
  }
  /* fallback: call by call. eth_call carries no state, so it can only prove today's facts. */
  const blocks = [];
  for (const r of rows) {
    const b = low(r.block); const B = { block: b, ok: true, lines: [] };
    if (r.deadIsAdmin) { B.ok = false; B.lines.push({ ok: false, text: 'the dead address already holds the role: without eth_simulateV1 the last-admin proof cannot run' }); blocks.push(B); continue; }
    try { await rpc('eth_call', [{ from: w, to: b, data: encodeGrantDead() }, 'latest']); B.lines.push({ ok: true, text: 'grantRole(DEFAULT_ADMIN_ROLE, 0x…dEaD) succeeds' }); }
    catch (e) { B.ok = false; B.lines.push({ ok: false, text: 'grantRole(DEFAULT_ADMIN_ROLE, 0x…dEaD) REVERTS' }); }
    let alone = null;
    try { await rpc('eth_call', [{ from: w, to: b, data: encodeRenounce(w) }, 'latest']); alone = 'PASSES'; }
    catch (e) { alone = String((e && e.data) || (e && e.message) || ''); }
    const last = alone !== 'PASSES' && low(alone).includes(ERR.LAST_ADMIN.slice(2));
    B.lines.push({ ok: last, text: last ? 'you are its only admin today (renounce alone is refused as the last admin)' : 'NOT proven that you are its only admin' });
    if (!last) B.ok = false;
    blocks.push(B);
  }
  return { method: 'eth_call', ok: blocks.every((b) => b.ok), blocks, why };
}

/** 'batch' when the wallet says it runs atomic batches on Base (EIP-5792 capabilities), else 'sequential' (two transactions per block) */
export function sendMode(capabilities) {
  const c = capabilities && (capabilities[CHAIN_ID_HEX] || capabilities[String(CHAIN_ID)] || capabilities['0x0']);
  if (!c) return 'sequential';
  if (c.atomic && (c.atomic.status === 'supported' || c.atomic.status === 'ready')) return 'batch';
  if (c.atomicBatch && c.atomicBatch.supported === true) return 'batch';
  return 'sequential';
}
/** the wallet_sendCalls request (EIP-5792 v2), all calls atomic */
export function sendCallsRequest(wallet, calls) {
  return { method: 'wallet_sendCalls', params: [{ version: '2.0.0', chainId: CHAIN_ID_HEX, from: low(wallet), atomicRequired: true,
    calls: calls.map((c) => ({ to: c.to, data: c.data, value: '0x0' })) }] };
}

/** the expected role log of one call, in these logs: emitted BY the block, role = admin, account, sender = the wallet */
export function findRoleLog(logs, call, wallet) {
  const t = (x) => low(x);
  return (logs || []).find((l) => t(l.address) === t(call.to) && Array.isArray(l.topics) && l.topics.length === 4
    && t(l.topics[0]) === t(call.expects.topic) && t(l.topics[1]) === t(DEFAULT_ADMIN_ROLE)
    && t(l.topics[2]) === '0x' + word(call.expects.account) && t(l.topics[3]) === '0x' + word(wallet)) || null;
}

/** judges ONE sent transaction for ONE call (sequential mode): [] = holds; else the list of what does not */
export function checkSent({ call, wallet, tx, receipt }) {
  const w = low(wallet), ko = [];
  if (!tx) ko.push('the transaction could not be read');
  else {
    if (low(tx.from) !== w) ko.push('tx.from is ' + low(tx.from) + ', not your wallet');
    if (low(tx.to) !== low(call.to)) ko.push('the transaction went to ' + low(tx.to) + ', not the block');
    if (low(tx.input ?? tx.data) !== low(call.data)) ko.push('the signed data is not the call shown');
    if (asBig(tx.value || '0x0') !== 0n) ko.push('the transaction carried ETH');
  }
  if (!receipt) ko.push('no receipt');
  else {
    if (receipt.status !== '0x1') ko.push('the transaction failed on chain (status ' + receipt.status + ')');
    if (!findRoleLog(receipt.logs, call, w)) ko.push('the block did not log ' + (call.expects.topic === TOPIC.ROLE_GRANTED ? 'RoleGranted(dead address)' : 'RoleRevoked(you)') + ' from your wallet');
  }
  return ko;
}

/** judges a wallet_sendCalls result: every receipt from your wallet (tx.from), status 1, and every expected role log present once */
export function checkBatch({ calls, wallet, receipts, txs }) {
  const w = low(wallet), ko = [];
  if (!Array.isArray(receipts) || !receipts.length) return ['no receipt'];
  receipts.forEach((r, k) => {
    const tx = txs && txs[k];
    if (!tx) ko.push('transaction ' + (k + 1) + ' could not be read');
    else if (low(tx.from) !== w) ko.push('tx.from is ' + low(tx.from) + ', not your wallet');
    if (r.status !== '0x1' && r.status !== 1 && r.status !== '0x01') ko.push('a transaction failed on chain (status ' + r.status + ')');
  });
  const logs = receipts.flatMap((r) => r.logs || []);
  for (const c of calls) if (!findRoleLog(logs, c, w)) ko.push(c.to + ': ' + (c.expects.topic === TOPIC.ROLE_GRANTED ? 'RoleGranted(dead address)' : 'RoleRevoked(you)') + ' from your wallet is missing');
  return ko;
}

/** after the receipts: the roles read again. done = you no longer hold the admin role AND the dead address does */
export async function readAfter({ rpc, block, wallet }) {
  const b = low(block);
  const has = async (who) => isTrue(await rpc('eth_call', [{ to: b, data: SEL.hasRole + word(DEFAULT_ADMIN_ROLE) + word(who) }, 'latest']));
  try {
    const [you, dead] = [await has(wallet), await has(DEAD)];
    return { block: b, you, dead, done: you === false && dead === true };
  } catch (_) { return { block: b, you: null, dead: null, done: false }; }
}

/** a reader over the public nodes: the first that answers wins; a revert is an answer (thrown with its data), not a node failure */
export function publicReader(fetchFn = globalThis.fetch, nodes = PUBLIC_NODES, ms = 10000) {
  let id = 0;
  return async (method, params) => {
    let last = null;
    for (const url of nodes) {
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), ms) : null;
      try {
        const r = await fetchFn(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }), signal: ctl ? ctl.signal : undefined });
        const j = await r.json();
        if (j && j.error) {
          const e = new Error(j.error.message || 'error'); e.data = j.error.data; e.code = j.error.code;
          if (/revert/i.test(String(j.error.message)) || j.error.code === 3) throw Object.assign(e, { revert: true });
          last = e; continue;
        }
        if (j && Object.prototype.hasOwnProperty.call(j, 'result')) return j.result;
        last = new Error(url + ': no result');
      } catch (e) { if (e && e.revert) throw e; last = e; } finally { if (timer) clearTimeout(timer); }
    }
    throw last || new Error('no node answered');
  };
}
