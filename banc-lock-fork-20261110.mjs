// banc-lock-fork-20261110.mjs (needs: base-anvil fork on 8659 + forge build in contracts/) — TBlockLock on a LOCAL Base fork (base-anvil, port 8659) with the REAL TBLOCK (B20) and a real holder impersonated.
// Nothing here touches mainnet: every write goes to 127.0.0.1:8659. Each tx's receipt STATUS is checked (a green on status 0x0 = trap).
import fs from 'node:fs';
import { selecteur } from './keccak.js';
const U = 'http://127.0.0.1:8659';
const TB = '0xb200000000000000000000ba9bf8330307f8830e';
const HOLDER = '0x025d751752d3aa695fdb3d9eedee69bc9553f331'; /* the holders vault: 549,434 TBLOCK on mainnet (read 2026-11-10); impersonated on the LOCAL fork only */
const art = JSON.parse(fs.readFileSync(new URL('./contracts/out/TBlockLock.sol/TBlockLock.json', import.meta.url), 'utf8'));
let id = 0;
async function rpc(method, params = []) { const r = await fetch(U, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((x) => x.json()); if (r.error) { const e = new Error(r.error.message); e.data = r.error.data; throw e; } return r.result; }
const p = (x) => BigInt(x).toString(16).padStart(64, '0');
const pa = (a) => a.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const call = async (to, sig, args = '') => rpc('eth_call', [{ to, data: selecteur(sig) + args }, 'latest']);
const bal = async (a) => BigInt(await call(TB, 'balanceOf(address)', pa(a)));
let ok = 0, ko = 0;
const t = (m, c, extra = '') => { if (c) ok++; else ko++; console.log((c ? 'ok  ' : 'KO  ') + m + (extra ? ' — ' + extra : '')); };
async function envoyer(from, to, data) {
  const h = await rpc('eth_sendTransaction', [{ from, ...(to ? { to } : {}), data, gas: '0x' + (3_000_000).toString(16) }]);
  for (let k = 0; k < 60; k++) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return r; await new Promise((o) => setTimeout(o, 500)); }
  throw new Error('no receipt for ' + h);
}
async function revertDe(from, to, data) { try { await rpc('eth_call', [{ from, to, data }, 'latest']); return null; } catch (e) { return String(e.data || e.message); } }

const E = 10n ** 18n;
await rpc('anvil_impersonateAccount', [HOLDER]);
await rpc('anvil_setBalance', [HOLDER, '0x' + (10n ** 18n).toString(16)]);
const b0 = await bal(HOLDER);
t('the holder holds TBLOCK on the fork', b0 >= 500_000n * E, String(b0 / E) + ' TBLOCK');

/* deploy from the holder (local fork only) */
const dep = await envoyer(HOLDER, null, art.bytecode.object + pa(TB));
t('deploy status 1', dep.status === '0x1');
const L = dep.contractAddress;
t('lock reads TBLOCK', (await call(L, 'TBLOCK()')).toLowerCase().endsWith(TB.slice(2)));

const now = Number(BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp));
const AMT = 500_000n * E;
const r1 = await envoyer(HOLDER, TB, selecteur('approve(address,uint256)') + pa(L) + p(AMT));
t('approve status 1', r1.status === '0x1');
const tropTot = await revertDe(HOLDER, L, selecteur('lock(uint256,uint256)') + p(AMT) + p(now + 6 * 86400));
t('a lock under 7 days is refused', tropTot !== null && tropTot.includes(selecteur('BadDate(uint256,uint256)').slice(2)), tropTot && tropTot.slice(0, 12));
const at = now + 7 * 86400 + 120;
const r2 = await envoyer(HOLDER, L, selecteur('lock(uint256,uint256)') + p(AMT) + p(at));
t('lock status 1 (real B20 transferFrom, arrival measured)', r2.status === '0x1');
t('lockedOf = 500,000 TBLOCK', BigInt(await call(L, 'lockedOf(address)', pa(HOLDER))) === AMT);
t('the TBLOCK left the wallet into the lock', (await bal(HOLDER)) === b0 - AMT && (await bal(L)) === AMT);
const tot = await revertDe(HOLDER, L, selecteur('withdraw()'));
t('withdraw before the date is refused (StillLocked)', tot !== null && tot.includes(selecteur('StillLocked(uint256)').slice(2)), tot && tot.slice(0, 12));
await rpc('evm_increaseTime', [7 * 86400 + 200]); await rpc('evm_mine', []);
const r3 = await envoyer(HOLDER, L, selecteur('withdraw()'));
t('withdraw after the date status 1', r3.status === '0x1');
t('every TBLOCK is back, exactly', (await bal(HOLDER)) === b0 && (await bal(L)) === 0n);
t('lockedOf = 0 after', BigInt(await call(L, 'lockedOf(address)', pa(HOLDER))) === 0n);
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green') + ' · gas lock ' + BigInt(r2.gasUsed) + ', withdraw ' + BigInt(r3.gasUsed) + ', deploy ' + BigInt(dep.gasUsed));
process.exit(ko ? 1 : 0);
