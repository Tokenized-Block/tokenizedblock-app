// banc-create-vault-tip-fork-20261110.mjs — the ONE call create-vault-tip.js builds, sent on a base-anvil FORK (never mainnet) by a real
// TBLOCK holder: the vault receives exactly `amount`, the sender loses exactly `amount`, no ETH moves. The vault runtime is copied from
// mainnet onto the fork (it was deployed after the fork block). Exits 2 without a fork: that is NOT a pass.
// Does NOT prove: a wallet UI signing it, nor the price served at that moment.
import * as T from './create-vault-tip.js';
import { TBLOCK, word } from './economie.js';
import { VAULT } from './economie-pack.js'; /* task 377: the live holders vault, the one create-vault-tip.js pays */
const F = process.env.FORK_RPC || 'http://127.0.0.1:8659', M = 'https://base-rpc.publicnode.com';
let id = 0, ok = 0, ko = 0;
const t = (n, c, x = '') => { if (c) ok++; else { ko++; console.log('RED', n, x); } };
const rpc = async (u, m, p) => { const j = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json', 'x-ms-monitor': '1' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: m, params: p }) }).then((r) => r.json()); if (j.error) throw new Error(j.error.message); return j.result; };
const PM = '0x498581ff718922c3f8e6a244956af099b2652b2b';
const bal = async (a) => word(await rpc(F, 'eth_call', [{ to: TBLOCK, data: '0x70a08231' + a.slice(2).padStart(64, '0') }, 'latest']));
let snap;
try { snap = await rpc(F, 'evm_snapshot', []); } catch (e) { console.log('NO FORK at ' + F); process.exit(2); }
try {
  await rpc(F, 'anvil_setCode', [VAULT, await rpc(M, 'eth_getCode', [VAULT, 'latest'])]);
  await rpc(F, 'anvil_impersonateAccount', [PM]); await rpc(F, 'anvil_setBalance', [PM, '0xde0b6b3a7640000']);
  const b0 = await bal(PM), v0 = await bal(VAULT), e0 = BigInt(await rpc(F, 'eth_getBalance', [VAULT, 'latest']));
  const q = T.plan({ ethUsd: 3400, tblockUsd: 0.000005768, balance: b0 });
  t('plan ok for a real holder', q.ok, q.why);
  const h = await rpc(F, 'eth_sendTransaction', [{ from: PM, to: q.call.to, data: q.call.data, value: q.call.value, gas: '0x30d40' }]);
  let r = null; for (let k = 0; k < 60 && !r; k++) { r = await rpc(F, 'eth_getTransactionReceipt', [h]); if (!r) await new Promise((o) => setTimeout(o, 500)); }
  t('transfer status 1', r && r.status === '0x1', JSON.stringify(r && r.status));
  t('vault received exactly the amount', (await bal(VAULT)) - v0 === q.amount);
  t('sender paid exactly the amount', b0 - (await bal(PM)) === q.amount);
  t('no ETH reached the vault', BigInt(await rpc(F, 'eth_getBalance', [VAULT, 'latest'])) === e0);
  console.log('sent ' + (Number(q.amount) / 1e18).toFixed(0) + ' TBLOCK ($' + (Number(q.usdMicro) / 1e6).toFixed(2) + ') to the vault');
} finally { await rpc(F, 'evm_revert', [snap]); }
console.log(ko === 0 ? 'GREEN' : 'RED', ok + '/' + (ok + ko));
