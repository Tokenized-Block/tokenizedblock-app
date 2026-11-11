// banc-economie-v2-fork-20261111.mjs (needs: base-anvil fork on 8659 + forge build in contracts/) — BlockLikesV2 + TBlockVaultV2 on a LOCAL base-anvil fork (127.0.0.1:8659), wired to the REAL deployed TBlockLock
// (0xec46b02bb1f3a58ce37c023f8668f2207bc2b0aa) and the REAL TBLOCK. A real holder (the v1 vault, 549,434 TBLOCK) is impersonated LOCALLY:
// it locks on the real lock, hearts a block (a real burn to 0x…dEaD), the week ends, the vault is funded, closed, claimed.
// Every tx's receipt status is checked. Nothing touches mainnet.
import fs from 'node:fs';
import { selecteur } from './keccak.js';
const U = 'http://127.0.0.1:8659';
const TB = '0xb200000000000000000000ba9bf8330307f8830e', LOCK = '0xec46b02bb1f3a58ce37c023f8668f2207bc2b0aa';
const H = '0x025d751752d3aa695fdb3d9eedee69bc9553f331';                 /* the v1 vault: 549,434 TBLOCK (read 2026-11-10) */
const CONTEST = '0x001ead57218f3ab79e2dcacb05ddfc4574ef177c';           /* copied from contracts/preparer-deploiement-economie.mjs */
const DEAD = '0x000000000000000000000000000000000000dead';
const art = (n) => JSON.parse(fs.readFileSync(new URL('./contracts/out/' + n + '.sol/' + n + '.json', import.meta.url), 'utf8'));
let id = 0;
async function rpc(method, params = []) { const r = await fetch(U, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((x) => x.json()); if (r.error) { const e = new Error(r.error.message); e.data = r.error.data; throw e; } return r.result; }
const w = (x) => BigInt(x).toString(16).padStart(64, '0');
const wa = (a) => a.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const call = async (to, sig, args = '') => rpc('eth_call', [{ to, data: selecteur(sig) + args }, 'latest']);
const bal = async (a) => BigInt(await call(TB, 'balanceOf(address)', wa(a)));
let ok = 0, ko = 0;
const t = (m, c, x = '') => { if (c) ok++; else ko++; console.log((c ? 'ok  ' : 'KO  ') + m + (x ? ' — ' + x : '')); };
async function send(from, to, data) {
  const h = await rpc('eth_sendTransaction', [{ from, ...(to ? { to } : {}), data, gas: '0x' + (6_000_000).toString(16) }]);
  for (let k = 0; k < 60; k++) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return r; await new Promise((o) => setTimeout(o, 400)); }
  throw new Error('no receipt');
}
const E = 10n ** 18n;
for (const a of [H, '0x0000000000000000000000000000000000000d01', '0x0000000000000000000000000000000000000d02', '0x00000000000000000000000000000000000000ce']) {
  await rpc('anvil_impersonateAccount', [a]); await rpc('anvil_setBalance', [a, '0x' + (10n ** 18n).toString(16)]);
}
const KEEP = '0x00000000000000000000000000000000000000ce', D1 = '0x0000000000000000000000000000000000000d01', D2 = '0x0000000000000000000000000000000000000d02';
t('the real lock is on this fork', (await rpc('eth_getCode', [LOCK, 'latest'])).length > 2);
const now = Number(BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp));
/* bench price: $0.00005 per TBLOCK -> $15 = 300,000 TBLOCK (the holder has 549k); production uses the live price */
const START = 50_000_000_000_000n;
const likesCfg = [wa(TB), wa(LOCK), w(now), w(7 * 86400), w(5n * 10n ** 17n), w(15n * E), w(START / 50n), w(START * 100n), w(START), w(1000), w(3600), wa(KEEP), wa(D1), wa(D2)].join('');
const L = art('BlockLikesV2'), V = art('TBlockVaultV2');
const rL = await send(H, null, L.bytecode.object + likesCfg);
t('BlockLikesV2 deployed', rL.status === '0x1', 'gas ' + BigInt(rL.gasUsed));
const LI = String(rL.contractAddress).toLowerCase();
t('likes reads the real lock and the $15 minimum = 300,000 TBLOCK', (await call(LI, 'LOCK()')).toLowerCase().endsWith(LOCK.slice(2)) && BigInt(await call(LI, 'minHold()')) === 300_000n * E);
const vaultCfg = [wa(TB), wa(LI), wa(CONTEST), wa(LOCK), w(5000), w(2000), w(5000), w(50_000_000n * E), w(7 * 86400), w(862_000n * E), w(86400), wa(D1), wa(D2)].join('');
const rV = await send(H, null, V.bytecode.object + vaultCfg);
t('TBlockVaultV2 deployed (constructor checks likes.LOCK() == lock)', rV.status === '0x1', 'gas ' + BigInt(rV.gasUsed));
const VA = String(rV.contractAddress).toLowerCase();
/* the holder: no lock yet -> a heart is refused */
const blk = TB; /* any B20 address is a block for the prefix check */
t('approve likes', (await send(H, TB, selecteur('approve(address,uint256)') + wa(LI) + w(10_000_000n * E))).status === '0x1');
const sansLock = await send(H, LI, selecteur('like(address,uint256)') + wa(blk) + w(1));
t('a heart without a lock is refused on chain (status 0)', sansLock.status === '0x0');
t('approve lock', (await send(H, TB, selecteur('approve(address,uint256)') + wa(LOCK) + w(300_000n * E))).status === '0x1');
t('lock 300,000 TBLOCK for 30 days on the REAL lock', (await send(H, LOCK, selecteur('lock(uint256,uint256)') + w(300_000n * E) + w(now + 30 * 86400 + 3600))).status === '0x1');
const d0 = await bal(DEAD);
const rh = await send(H, LI, selecteur('like(address,uint256)') + wa(blk) + w(2));
t('two hearts: status 1', rh.status === '0x1', 'gas ' + BigInt(rh.gasUsed));
const brule = (await bal(DEAD)) - d0;
t('burned exactly 2 x $0.50 = 20,000 TBLOCK to 0x…dEaD', brule === 20_000n * E, String(brule / E));
t('spentIn(0, holder) = 20,000', BigInt(await call(LI, 'spentIn(uint256,address)', w(0) + wa(H))) === 20_000n * E);
t('fund the v2 vault with 100,000 TBLOCK', (await send(H, TB, selecteur('transfer(address,uint256)') + wa(VA) + w(100_000n * E))).status === '0x1');
await rpc('evm_increaseTime', [7 * 86400 + 60]); await rpc('evm_mine', []);
const rc = await send(D1, VA, selecteur('closeEpoch(uint256)') + w(0));
t('close week 0: status 1', rc.status === '0x1');
t('the $15 minimum photographed at close', BigInt(await call(VA, 'minHoldAt(uint256)', w(0))) === 300_000n * E);
const b0 = await bal(H);
const rcl = await send(H, VA, selecteur('claim(uint256)') + w(0));
t('claim: status 1', rcl.status === '0x1', 'gas ' + BigInt(rcl.gasUsed));
const paye = (await bal(H)) - b0;
t('paid > 0 and never more than what was burned (share <= 50 %, top bonus <= 50 %)', paye > 0n && paye <= 20_000n * E, String(paye / E) + ' TBLOCK');
const re = await send(H, VA, selecteur('claim(uint256)') + w(0));
t('a second claim is refused (status 0)', re.status === '0x0');
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
