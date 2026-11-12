// banc-buyback-vault-fork-20261112.mjs -- FORK ONLY (base-anvil, FORK_URL, default http://127.0.0.1:9613).
// Sends the EXACT creation data of a generated record (DEPLOIEMENT, default ./tblock-buyback-vault-deploiement.js, written by
// contracts/preparer-deploiement-buyback-vault.mjs) from the pack deployer impersonated ON THE FORK, against the live vault V, the
// live pools and the live hook. Then: fund, keeper buy, V counts it, price guard, public delay, the door, the veto, renounce, and
// the guardian's assets. Helper contracts (V3Pusher, ForkVault) come from the forge artifacts of TBlockBuybackVault.fork.t.sol.
// Nothing is sent to mainnet: refuses to run unless the node answers anvil_* methods.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { selecteur, keccak256Hex, topic } from './keccak.js';
import { ADRESSES_PACK_ECONOMIE_V2 as ADR } from './economie-v2-pack-deploye.js';
import { resoudre } from './buyback-vault.js'; /* the record names V by a marker: resoudre() puts V back */
const ICI = path.dirname(fileURLToPath(import.meta.url));
const FORK = process.env.FORK_URL || 'http://127.0.0.1:9613';
const REC = path.resolve(process.env.DEPLOIEMENT || path.join(ICI, 'tblock-buyback-vault-deploiement.js'));
const { BUYBACK_VAULT_DEPLOIEMENT: D } = await import(pathToFileURL(REC).href);
const P = D.parametres, low = (a) => String(a).toLowerCase();
const TBLOCK = low(P.tblock), WTCOIN = low(P.wtcoin), WETH = low(P.weth), PM = low(P.poolManager), V3 = low(P.v3Pool);
const V = low(ADR.V), KEEPER = low(P.keeper), GUARDIAN = low(P.guardian), VETO = low(P.veto), DEPLOYER = low(D.deployeur);
let ok = 0, ko = 0; const t = (n, c, x = '') => { if (c) { ok++; console.log('ok ', n, x); } else { ko++; console.log('RED', n, x); } };
const rpc = async (m, p) => { const j = await fetch(FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }) }).then((x) => x.json()); if (j.error) { const e = new Error(m + ' ' + JSON.stringify(j.error)); e.data = j.error.data; throw e; } return j.result; };
const hx = (n) => '0x' + BigInt(n).toString(16);
const w = (x) => BigInt(x).toString(16).padStart(64, '0');
const wa = (a) => low(a).slice(2).padStart(64, '0');
const call = (to, sig, args = '') => rpc('eth_call', [{ to, data: selecteur(sig) + args }, 'latest']);
const u = async (to, sig, args = '') => BigInt(await call(to, sig, args));
const a = async (to, sig) => '0x' + (await call(to, sig)).slice(-40);
const bal = (tok, who) => u(tok, 'balanceOf(address)', wa(who));
const ethOf = async (who) => BigInt(await rpc('eth_getBalance', [who, 'latest']));
const now = async () => BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp);
const ERR = Object.fromEntries(['TooEarly(uint256)', 'PriceOffTwap(int24,int24)', 'BadParams()', 'DoorClosed()', 'NotGuardian()', 'NoProposal()',
  'NotArmed()', 'BadAmount()', 'Expired(uint256)', 'ProposalPending()', 'BadDest()'].map((s) => [selecteur(s), s]));
const reason = (data) => { const d = typeof data === 'string' ? data : (data && data.data) || ''; return ERR[String(d).slice(0, 10)] || String(d).slice(0, 10) || 'none'; };
const fees = {}; // gas paid per sender, to account ETH exactly
// a receipt asked too early is looked up upstream by anvil (publicnode can answer 403): retry, never conclude from it
const mine = async (h) => { let r = null; for (let k = 0; k < 40 && !r; k++) { r = await rpc('eth_getTransactionReceipt', [h]).catch(() => null); if (!r) { await rpc('evm_mine', []).catch(() => null); await new Promise((o) => setTimeout(o, 300)); } } return r; };
// one attempt = the eth_call (its revert reason) then the real tx on the fork (its status)
const send = async (from, to, data, value = 0n, gas = 1_500_000) => {
  let why = 'none';
  try { await rpc('eth_call', [{ from, to, data, value: hx(value), gas: hx(gas) }, 'latest']); } catch (e) { why = reason(e.data); }
  const tx = { from, data, value: hx(value), gas: hx(gas) }; if (to) tx.to = to;
  const r = await mine(await rpc('eth_sendTransaction', [tx]));
  fees[low(from)] = (fees[low(from)] || 0n) + BigInt(r.gasUsed) * BigInt(r.effectiveGasPrice);
  return { ok: r.status === '0x1', why, r };
};
const warpTo = async (ts) => { await rpc('evm_setNextBlockTimestamp', [hx(ts)]); await rpc('evm_mine', []); };
const imp = async (who, eth = 10n ** 17n) => { await rpc('anvil_impersonateAccount', [who]); await rpc('anvil_setBalance', [who, hx(eth)]); };
const art = (f, c) => JSON.parse(fs.readFileSync(path.join(ICI, 'contracts/out', f, c + '.json'), 'utf8'));
const E18 = 10n ** 18n, fmt = (x) => (x / E18).toString() + '.' + (x % E18).toString().padStart(18, '0');

// ---- 0. this must be a fork of Base
try { await rpc('anvil_nodeInfo', []); } catch (_) { console.log('not an anvil fork: refusing to run'); process.exit(2); }
t('chain id is Base (8453) on the fork', (await rpc('eth_chainId', [])) === '0x2105');
console.log('fork block', BigInt(await rpc('eth_blockNumber', [])).toString(), 'record', REC);

// ---- 1. the record: the exact bytes, the exact source
t('record sha256Creation = sha256(creation)', crypto.createHash('sha256').update(resoudre(D).creation).digest('hex') === D.sha256Creation, D.sha256Creation);
const srcSha = crypto.createHash('sha256').update(fs.readFileSync(path.join(ICI, 'contracts/src/buyback/TBlockBuybackVault.sol'))).digest('hex');
t('record sha256Source = the source in this tree', srcSha === D.sha256Source, srcSha);
t('deployer is the pack deployer = V.DEV2() on chain', DEPLOYER === low(await a(V, 'DEV2()')), DEPLOYER);
t('veto = V.DEV2()', VETO === low(await a(V, 'DEV2()')));
t('guardian = V.DEV()', GUARDIAN === low(await a(V, 'DEV()')));
t('V.TBLOCK() = TBLOCK', low(await a(V, 'TBLOCK()')) === TBLOCK);

// ---- 2. deploy the exact creation data from the deployer (impersonated on the fork only)
await imp(DEPLOYER);
const dep = await send(DEPLOYER, null, resoudre(D).creation, 0n, 8_000_000);
t('the record\'s creation data deploys from the deployer (status 1)', dep.ok, 'gas used ' + BigInt(dep.r.gasUsed));
const BB = low(dep.r.contractAddress);
console.log('deployed on the fork at', BB);
const code = await rpc('eth_getCode', [BB, 'latest']);
const rt = art('TBlockBuybackVault.sol', 'TBlockBuybackVault').deployedBytecode;
let same = (code.length === rt.object.length);
if (same) { // equal outside the immutable slots
  const mask = new Set(); for (const refs of Object.values(rt.immutableReferences || {})) for (const r of refs) for (let k = 0; k < r.length; k++) mask.add(r.start + k);
  const c1 = code.slice(2), c2 = rt.object.slice(2);
  for (let k = 0; k < c1.length / 2 && same; k++) if (!mask.has(k) && c1.substr(2 * k, 2) !== c2.substr(2 * k, 2)) same = false;
}
t('runtime code = the forge artifact (outside immutables)', same, ((code.length - 2) / 2) + ' bytes');
t('DEST() = V', low(await a(BB, 'DEST()')) === V);
t('destCodehash() = keccak(V code)', (await call(BB, 'destCodehash()')) === keccak256Hex(Buffer.from((await rpc('eth_getCode', [V, 'latest'])).slice(2), 'hex')));
t('GUARDIAN() / VETO() / KEEPER() = the record', low(await a(BB, 'GUARDIAN()')) === GUARDIAN && low(await a(BB, 'VETO()')) === VETO && low(await a(BB, 'KEEPER()')) === KEEPER);
const DELAY = await u(BB, 'DEST_DELAY()'), WINDOW = await u(BB, 'DEST_WINDOW()'), PUB = await u(BB, 'PUBLIC_DELAY()'), CD = await u(BB, 'COOLDOWN()');
t('DEST_DELAY 7 days, DEST_WINDOW 2 days, PUBLIC_DELAY 6 h, COOLDOWN 1 h', DELAY === 604800n && WINDOW === 172800n && PUB === 21600n && CD === 3600n);

// guardian's assets before anything
await imp(GUARDIAN);
const g0 = { eth: await ethOf(GUARDIAN), tb: await bal(TBLOCK, GUARDIAN), wt: await bal(WTCOIN, GUARDIAN), weth: await bal(WETH, GUARDIAN) };

// ---- 3. fund by a normal call
const FUNDER = '0x' + '77'.repeat(20);
await imp(FUNDER);
const fu = await send(FUNDER, BB, '0x', 5n * 10n ** 15n, 200_000);
t('funding 0.005 ETH by a normal call succeeds and arms the pot', fu.ok && (await u(BB, 'armed()')) === 1n);

// ---- 4. before the public delay only the keeper may buy
const PUBLIC = '0x' + 'b0'.repeat(20);
await imp(PUBLIC);
let x = await send(PUBLIC, BB, selecteur('buyback(uint256)') + w(10n ** 15n));
t('a public caller right after funding is refused', !x.ok && x.why === 'TooEarly(uint256)', x.why);
x = await send(GUARDIAN, BB, selecteur('buyback(uint256)') + w(10n ** 15n));
t('the guardian (as a public caller) is refused too', !x.ok && x.why === 'TooEarly(uint256)', x.why);

// ---- 5. the keeper buys: TBLOCK leaves the pool manager and lands in V, V counts it
await imp(KEEPER);
const int = (h) => { let v = BigInt('0x' + h); if (v >= 2n ** 255n) v -= 2n ** 256n; return v; };
let pre = null;
try { await rpc('eth_call', [{ from: KEEPER, to: BB, data: selecteur('buyback(uint256)') + w(2n * 10n ** 15n) }, 'latest']); } catch (e) { pre = e.data; }
if (pre) { // the LIVE pool at the fork block: the guard may already refuse (the market moved > MAX_V3_DEV_TICKS within TWAP_WINDOW)
  const why = reason(pre), args = String(pre).slice(10).match(/.{64}/g) || [];
  const e0 = await ethOf(BB);
  x = await send(KEEPER, BB, selecteur('buyback(uint256)') + w(2n * 10n ** 15n));
  t('at the fork block the live pool is off its TWAP: the keeper is refused, nothing spent', !x.ok && why === 'PriceOffTwap(int24,int24)' && (await ethOf(BB)) === e0,
    why + ' twapTick ' + (args[0] ? int(args[0]) : '?') + ' tickAfter ' + (args[1] ? int(args[1]) : '?'));
  const tw = await u(BB, 'TWAP_WINDOW()');
  await warpTo((await now()) + tw + 60n); // no trade on the fork for TWAP_WINDOW + 60 s: the TWAP reaches the spot
  console.log('fork warped', (tw + 60n).toString(), 's with no trade (the TWAP window), then the keeper retries');
}
const b0 = { pm: await bal(TBLOCK, PM), v: await bal(TBLOCK, V), vb: await u(V, 'balance()'), vf: await u(V, 'free()'), vr: await u(V, 'reserved()'), v3w: await bal(WETH, V3), eth: await ethOf(BB) };
x = await send(KEEPER, BB, selecteur('buyback(uint256)') + w(2n * 10n ** 15n));
t('keeper buyback(0.002 ETH) succeeds', x.ok, x.why);
const ev = x.r.logs.find((l) => low(l.address) === BB && l.topics[0] === topic('Bought(uint256,uint256,uint256,address)'));
const evd = ev ? ev.data.slice(2).match(/.{64}/g).map((h) => BigInt('0x' + h)) : [0n, 0n, 0n];
const b1 = { pm: await bal(TBLOCK, PM), v: await bal(TBLOCK, V), vb: await u(V, 'balance()'), vf: await u(V, 'free()'), vr: await u(V, 'reserved()'), v3w: await bal(WETH, V3), eth: await ethOf(BB) };
console.log('Bought: ethIn', evd[0].toString(), 'wtCOIN mid', fmt(evd[1]), 'TBLOCK to V', fmt(evd[2]));
t('TBLOCK left the pool manager', b1.pm < b0.pm, 'PM -' + fmt(b0.pm - b1.pm));
t('V received exactly the TBLOCK bought', b1.v - b0.v === evd[2] && evd[2] > 0n, '+' + fmt(b1.v - b0.v));
const TR = topic('Transfer(address,address,uint256)');
const tbOut = x.r.logs.filter((l) => low(l.address) === TBLOCK && l.topics[0] === TR && ('0x' + l.topics[1].slice(26)) === PM)
  .map((l) => ({ to: '0x' + l.topics[2].slice(26), v: BigInt(l.data) }));
for (const o of tbOut) console.log('  TBLOCK out of the pool manager ->', o.to, fmt(o.v));
const toOthers = tbOut.filter((o) => o.to !== V).reduce((s2, o) => s2 + o.v, 0n);
t('pool manager outflow = V inflow + the other TBLOCK transfers out of it in this tx (hook side)', b0.pm - b1.pm === (b1.v - b0.v) + toOthers, 'others ' + fmt(toOthers));
t('V is the only recipient of the TBLOCK bought (Bought.tblockToDest)', tbOut.some((o) => o.to === V && o.v === evd[2]));
t('V.balance() up by the same amount', b1.vb - b0.vb === evd[2]);
t('V.free() up by the same amount (budget material)', b1.vf - b0.vf === evd[2], 'free ' + fmt(b0.vf) + ' -> ' + fmt(b1.vf));
t('V.reserved() unchanged', b1.vr === b0.vr, fmt(b1.vr));
t('the v3 pool got the 0.002 WETH', b1.v3w - b0.v3w === 2n * 10n ** 15n);
t('the buyback spent 0.002 ETH and holds no TBLOCK', b0.eth - b1.eth === 2n * 10n ** 15n && (await bal(TBLOCK, BB)) === 0n);
x = await send(KEEPER, BB, selecteur('buyback(uint256)') + w(10n ** 15n));
t('a second keeper buy within the cooldown is refused', !x.ok && x.why === 'TooEarly(uint256)', x.why);

// ---- 6. the price guard refuses a pushed pool (state rolled back after)
const snap = await rpc('evm_snapshot', []);
const lastBuy = await u(BB, 'lastBuyAt()');
await warpTo(lastBuy + CD);
const HELPER = '0x' + '5e'.repeat(20);
await imp(HELPER, 10n ** 19n);
const pusherArt = art('TBlockBuybackVault.fork.t.sol', 'V3Pusher');
const pd = await send(HELPER, null, pusherArt.bytecode.object + wa(V3) + wa(WETH), 0n, 2_000_000);
const PUSHER = low(pd.r.contractAddress);
const tick = async () => { const s = (await call(V3, 'slot0()')).slice(2); let v = BigInt('0x' + s.slice(64, 128)); if (v >= 2n ** 255n) v -= 2n ** 256n; return v; };
const tk0 = await tick();
const DEV = await u(BB, 'MAX_V3_DEV_TICKS()');
let pushed = 0n, pu = { ok: true };
while (pu.ok && tk0 - (await tick()) <= DEV && pushed < 4n * 10n ** 18n) { pu = await send(HELPER, PUSHER, selecteur('push()'), 5n * 10n ** 16n, 1_000_000); pushed += 5n * 10n ** 16n; }
const tk1 = await tick();
t('a same-direction push on the v3 pool moves the tick past MAX_V3_DEV_TICKS', pu.ok && tk0 - tk1 > DEV, fmt(pushed) + ' ETH, tick ' + tk0 + ' -> ' + tk1 + ' (tolerance ' + DEV + ')');
const ethBefore = await ethOf(BB);
x = await send(KEEPER, BB, selecteur('buyback(uint256)') + w(2n * 10n ** 15n));
t('the keeper\'s buy on the pushed pool is refused by the price guard', !x.ok && x.why === 'PriceOffTwap(int24,int24)', x.why);
t('fail closed: nothing spent', (await ethOf(BB)) === ethBefore);
await rpc('evm_revert', [snap]);
t('fork state rolled back after the push', (await tick()) === tk0);
await imp(HELPER, 10n ** 18n);

// ---- 7. the public path waits PUBLIC_DELAY after the keeper could have called
const [keeperAt, publicAt] = (await call(BB, 'readyAt()')).slice(2).match(/.{64}/g).map((h) => BigInt('0x' + h));
t('readyAt(): publicAt = keeperAt + 6 h', publicAt === keeperAt + PUB, 'keeperAt ' + keeperAt + ' publicAt ' + publicAt);
await warpTo(publicAt - 2n);
x = await send(PUBLIC, BB, selecteur('buyback(uint256)') + w(10n ** 15n)); // mined at publicAt - 1
t('a public caller 1 s before publicAt is refused', !x.ok && x.why === 'TooEarly(uint256)', x.why + ' at ' + BigInt((await rpc('eth_getBlockByNumber', [x.r.blockNumber, false])).timestamp));
const pe0 = await ethOf(PUBLIC), pf0 = fees[PUBLIC], pv0 = await bal(TBLOCK, V);
await rpc('evm_setNextBlockTimestamp', [hx(publicAt)]);
x = await send(PUBLIC, BB, selecteur('buyback(uint256)') + w(10n ** 15n));
const tip = (await ethOf(PUBLIC)) - pe0 + (fees[PUBLIC] - pf0);
t('at publicAt anyone may buy, V is paid', x.ok && (await bal(TBLOCK, V)) > pv0, '+' + fmt((await bal(TBLOCK, V)) - pv0) + ' TBLOCK');
t('the public caller earned the 0.5 % tip (5e12 wei on 0.001 ETH)', tip === 5n * 10n ** 12n, tip.toString());

// ---- 8. the door: propose -> 72 h refused -> 7 days -> execute -> the next buy pays the new dest
const fv = art('TBlockBuybackVault.fork.t.sol', 'ForkVault');
x = await send(GUARDIAN, BB, selecteur('proposeDest(address)') + wa(GUARDIAN));
t('the guardian cannot propose its own wallet', !x.ok && x.why === 'BadParams()', x.why);
const nvd = await send(HELPER, null, fv.bytecode.object + wa(TBLOCK), 0n, 1_000_000);
const NV = low(nvd.r.contractAddress);
x = await send(GUARDIAN, BB, selecteur('proposeDest(address)') + wa(NV));
const eta = await u(BB, 'pendingDestEta()');
t('the guardian proposes a new TBLOCK vault', x.ok && low(await a(BB, 'pendingDest()')) === NV, 'eta - now = ' + (eta - (await now())) + ' s');
const OTHER = '0x' + 'a1'.repeat(20);
await imp(OTHER);
await warpTo(eta - DELAY + 72n * 3600n);
x = await send(OTHER, BB, selecteur('executeDest()'));
t('after 72 h the door is still shut', !x.ok && x.why === 'TooEarly(uint256)', x.why);
await rpc('evm_setNextBlockTimestamp', [hx(eta)]);
x = await send(OTHER, BB, selecteur('executeDest()'));
t('at 7 days anyone executes it', x.ok && low(await a(BB, 'DEST()')) === NV);
t('the new dest\'s code is pinned', (await call(BB, 'destCodehash()')) === keccak256Hex(Buffer.from((await rpc('eth_getCode', [NV, 'latest'])).slice(2), 'hex')));
const vBefore = await bal(TBLOCK, V), nBefore = await bal(TBLOCK, NV);
x = await send(KEEPER, BB, selecteur('buyback(uint256)') + w(10n ** 15n));
t('the next keeper buy pays the new dest', x.ok && (await bal(TBLOCK, NV)) > nBefore, '+' + fmt((await bal(TBLOCK, NV)) - nBefore));
t('V gets nothing more', (await bal(TBLOCK, V)) === vBefore);

// ---- 9. the veto cancels a guardian proposal, then the door is renounced
const sd = await send(HELPER, null, fv.bytecode.object + wa(TBLOCK), 0n, 1_000_000);
const SINK = low(sd.r.contractAddress);
x = await send(GUARDIAN, BB, selecteur('proposeDest(address)') + wa(SINK));
t('the guardian proposes a second dest', x.ok);
await imp(VETO);
x = await send(VETO, BB, selecteur('cancelDest()'));
t('the veto (V.DEV2) cancels it', x.ok && low(await a(BB, 'pendingDest()')) === '0x' + '0'.repeat(40));
await warpTo((await now()) + DELAY);
x = await send(OTHER, BB, selecteur('executeDest()'));
t('nothing to execute 7 days later', !x.ok && x.why === 'NoProposal()', x.why);
x = await send(OTHER, BB, selecteur('cancelDest()'));
t('a stranger cannot cancel', !x.ok && x.why === 'NotGuardian()', x.why);
x = await send(VETO, BB, selecteur('renounceDoor()'));
t('the veto renounces the door', x.ok && (await u(BB, 'doorRenounced()')) === 1n);
x = await send(GUARDIAN, BB, selecteur('proposeDest(address)') + wa(SINK));
t('after renounce the guardian cannot propose', !x.ok && x.why === 'DoorClosed()', x.why);

// ---- 10. the guardian's assets: every guardian call above, plus the remaining entry points
for (const s of ['sweepToDest()', 'arm()', 'cancelDest()', 'renounceDoor()', 'executeDest()']) await send(GUARDIAN, BB, selecteur(s));
const g1 = { eth: await ethOf(GUARDIAN), tb: await bal(TBLOCK, GUARDIAN), wt: await bal(WTCOIN, GUARDIAN), weth: await bal(WETH, GUARDIAN) };
t('guardian TBLOCK / wtCOIN / WETH unchanged', g1.tb === g0.tb && g1.wt === g0.wt && g1.weth === g0.weth);
t('guardian ETH = before - gas only', g1.eth === g0.eth - fees[GUARDIAN], 'gas ' + fees[GUARDIAN]);
const abi = art('TBlockBuybackVault.sol', 'TBlockBuybackVault').abi;
console.log('state-changing entry points:', abi.filter((f) => f.type === 'function' && !['view', 'pure'].includes(f.stateMutability)).map((f) => f.name).join(', '));
t('the buyback ends holding no TBLOCK', (await bal(TBLOCK, BB)) === 0n, 'ETH left ' + (await ethOf(BB)));
console.log(ko === 0 ? 'GREEN' : 'RED', ok + '/' + (ok + ko));
process.exitCode = ko ? 1 : 0;
