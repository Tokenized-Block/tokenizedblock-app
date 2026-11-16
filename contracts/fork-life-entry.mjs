// fork-life-entry.mjs — LifeEntry against the REAL Base contracts, on a LOCAL base-anvil fork (nothing is sent to Base).
// PROVES on the fork: the real TBLOCK (B20) moves from a payer to the real holders vault V through LifeEntry.enter, for exactly
//   entryPrice() = $2 at the price the real hearts contract stores; Entered is emitted by LifeEntry; LifeEntry holds nothing;
//   a cap one wei under the price reverts and moves nothing.
// Usage: start base-anvil (anvil --base --fork-url <Base RPC> --port 8549), then: node contracts/fork-life-entry.mjs [rpc]
// ⛔ Impersonation (anvil_impersonateAccount) exists ONLY on the local fork: it is how a holder "signs" here. Never on Base.
import { readFileSync } from 'node:fs';
const RPC = process.argv[2] || 'http://127.0.0.1:8549';
/* copied from the repo's own files, never typed from memory */
const TBLOCK = (readFileSync(new URL('../economie.js', import.meta.url), 'utf8').match(/export const TBLOCK = '(0x[0-9a-f]{40})'/) || [])[1];
const PACK = readFileSync(new URL('../economie-v2-pack-deploye.js', import.meta.url), 'utf8');
const adr = (l) => (PACK.match(new RegExp("lettre: '" + l + "', adresse: '(0x[0-9a-f]{40})'")) || [])[1];
const V = adr('V'), L = adr('L');
const PM = (readFileSync(new URL('../usage-onchain.js', import.meta.url), 'utf8').match(/POOL_MANAGER = '(0x[0-9a-f]{40})'/) || [])[1];
if (!TBLOCK || !V || !L || !PM) throw new Error('an address was not found in the repo files');
const art = JSON.parse(readFileSync(new URL('./out/LifeEntry.sol/LifeEntry.json', import.meta.url), 'utf8'));
let id = 0; const rpc = async (m, p = []) => { const r = await (await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: m, params: p }) })).json(); if (r.error) throw new Error(m + ': ' + JSON.stringify(r.error)); return r.result; };
const pad = (h) => h.replace(/^0x/, '').padStart(64, '0'), enc = (a) => pad(a.toLowerCase()), num = (n) => pad(BigInt(n).toString(16));
const call = (to, data) => rpc('eth_call', [{ to, data }, 'latest']);
const bal = async (who) => BigInt(await call(TBLOCK, '0x70a08231' + enc(who)));
let ok = 0, ko = 0; const t = (m, c, v = '') => { if (c) ok++; else { ko++; console.log('KO', m, v); } console.log((c ? 'ok  ' : 'KO  ') + m + (v ? ' — ' + v : '')); };
async function send(from, to, data) {
  const h = await rpc('eth_sendTransaction', [{ from, to, data, gas: '0x' + (600000).toString(16) }]);
  for (let k = 0; k < 50; k++) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return r; await new Promise((o) => setTimeout(o, 200)); }
  throw new Error('no receipt');
}

console.log('chain', parseInt(await rpc('eth_chainId'), 16), 'block', parseInt(await rpc('eth_blockNumber'), 16), '| TBLOCK', TBLOCK, 'V', V, 'L', L);
/* the payer: a real TBLOCK holder (the v4 PoolManager holds the pool's TBLOCK) */
const payer = PM; await rpc('anvil_impersonateAccount', [payer]); await rpc('anvil_setBalance', [payer, '0x56BC75E2D63100000']);
t('F0 the payer holds TBLOCK on the fork', (await bal(payer)) > 0n, String(await bal(payer)));
/* deploy LifeEntry(TBLOCK, V, L, $2) from a fork account */
const deployer = (await rpc('eth_accounts'))[0];
const ctor = enc(TBLOCK) + enc(V) + enc(L) + num(2n * 10n ** 18n);
const dr = await (async () => { const h = await rpc('eth_sendTransaction', [{ from: deployer, data: art.bytecode.object + ctor, gas: '0x' + (2000000).toString(16) }]); for (let k = 0; k < 50; k++) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return r; await new Promise((o) => setTimeout(o, 200)); } })();
t('F1 LifeEntry deploys against the real TBLOCK, vault and hearts', dr && dr.status === '0x1' && !!dr.contractAddress);
const E = dr.contractAddress;
const sel = async (sig) => { const { keccak256Hex } = await import('../keccak.js'); return keccak256Hex(new TextEncoder().encode(sig)).slice(0, 10); };
const price = BigInt(await call(L, await sel('price()')));
const dueNow = BigInt(await call(E, await sel('entryPrice()')));
t('F2 entryPrice = $2 at the hearts\' stored price (rounded up)', price > 0n && dueNow === (2n * 10n ** 36n + price - 1n) / price, 'price ' + price + ' -> ' + dueNow + ' TBLOCK raw');
/* approve exactly, then enter for a block */
const blk = '0x' + '11'.repeat(20);
let r = await send(payer, TBLOCK, (await sel('approve(address,uint256)')) + enc(E) + num(dueNow));
t('F3 approve (exact amount) mined', r.status === '0x1');
const v0 = await bal(V), p0 = await bal(payer);
/* a cap one wei under the price: reverts, nothing moves */
r = await send(payer, E, (await sel('enter(address,uint256)')) + enc(blk) + num(dueNow - 1n)).catch((e) => ({ status: 'threw', e }));
t('F4 a cap 1 wei under the price reverts and moves nothing', r.status !== '0x1' && (await bal(V)) === v0 && (await bal(payer)) === p0, String(r.status));
r = await send(payer, E, (await sel('enter(address,uint256)')) + enc(blk) + num(dueNow));
const topic = (await import('../keccak.js')).keccak256Hex(new TextEncoder().encode('Entered(address,address,uint256,uint256)'));
const log = (r.logs || []).find((l) => l.address.toLowerCase() === E.toLowerCase() && l.topics[0] === topic);
t('F5 enter mined, Entered emitted BY LifeEntry, naming the payer and the block', r.status === '0x1' && !!log && log.topics[1].endsWith(payer.slice(2).toLowerCase()) && log.topics[2].endsWith(blk.slice(2)));
t('F6 the vault received exactly entryPrice, the payer paid exactly that', (await bal(V)) - v0 === dueNow && p0 - (await bal(payer)) === dueNow, String((await bal(V)) - v0));
t('F7 LifeEntry holds no TBLOCK', (await bal(E)) === 0n);
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
