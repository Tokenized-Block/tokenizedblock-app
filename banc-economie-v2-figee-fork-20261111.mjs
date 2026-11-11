// banc-economie-v2-figee-fork-20261111.mjs — needs a base-anvil fork on 127.0.0.1:8659. Deploys the FROZEN bytes of economie-v2-deploiement.js
// (exactly what deployer-economie-v2.html offers: likes creation, then vaultV2Creation(likes address from the receipt)) and reads them back:
// wiring to the REAL lock and TBLOCK, the start price, the $15 minimum at that price, keeper and dev wallets. Nothing touches mainnet.
import crypto from 'node:crypto';
import { selecteur } from './keccak.js';
import { ECONOMIE_V2_DEPLOIEMENT as D, vaultV2Creation } from './economie-v2-deploiement.js';
const U = 'http://127.0.0.1:8659';
const FROM = '0x025d751752d3aa695fdb3d9eedee69bc9553f331';
let id = 0;
async function rpc(method, params = []) { const r = await fetch(U, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((x) => x.json()); if (r.error) { const e = new Error(r.error.message); throw e; } return r.result; }
const call = async (to, sig) => rpc('eth_call', [{ to, data: selecteur(sig) }, 'latest']);
const adr = (h) => '0x' + String(h).slice(-40).toLowerCase();
let ok = 0, ko = 0;
const t = (m, c, x = '') => { if (c) ok++; else ko++; console.log((c ? 'ok  ' : 'KO  ') + m + (x ? ' — ' + x : '')); };
async function send(data) {
  const h = await rpc('eth_sendTransaction', [{ from: FROM, data, gas: '0x' + (8_000_000).toString(16) }]);
  for (let k = 0; k < 60; k++) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return r; await new Promise((o) => setTimeout(o, 400)); }
  throw new Error('no receipt');
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
t('frozen likes data integrity', sha(D.likes.creation) === D.likes.sha256Creation);
t('frozen vault data integrity (code + config around the likes word)', sha(D.vault.init + D.vault.avant + D.vault.apres) === D.vault.sha256Init);
await rpc('anvil_impersonateAccount', [FROM]); await rpc('anvil_setBalance', [FROM, '0xde0b6b3a7640000']);
const rL = await send(D.likes.creation);
t('BlockLikesV2 (frozen) deployed', rL.status === '0x1', 'gas ' + BigInt(rL.gasUsed));
const LI = String(rL.contractAddress).toLowerCase();
const rV = await send(vaultV2Creation(LI));
t('TBlockVaultV2 (frozen, likes from the receipt) deployed', rV.status === '0x1', 'gas ' + BigInt(rV.gasUsed));
const VA = String(rV.contractAddress).toLowerCase();
const C = D.likes.config;
t('likes: the real TBLOCK and the real lock', adr(await call(LI, 'TBLOCK()')) === C.tblock && adr(await call(LI, 'LOCK()')) === C.lock);
t('likes: start price as frozen', BigInt(await call(LI, 'price()')) === BigInt(C.startPrice));
const mh = BigInt(await call(LI, 'minHold()'));
const attendu = (15n * 10n ** 36n + BigInt(C.startPrice) - 1n) / BigInt(C.startPrice);
t('likes: the $15 minimum = ceil(15 / price) at the frozen price', mh === attendu, String(mh / 10n ** 18n) + ' TBLOCK');
t('likes: keeper and the two dev wallets as frozen', adr(await call(LI, 'keeper()')) === C.keeper && adr(await call(LI, 'DEV()')) === C.dev && adr(await call(LI, 'DEV2()')) === C.dev2);
t('likes: not frozen at start', BigInt(await call(LI, 'frozen()')) === 0n);
t('vault: wired to these likes and the same lock', adr(await call(VA, 'LIKES()')) === LI && adr(await call(VA, 'LOCK()')) === C.lock);
t('vault: dev wallets as frozen', adr(await call(VA, 'DEV()')) === D.vault.config.dev && adr(await call(VA, 'DEV2()')) === D.vault.config.dev2);
t('vault: holds nothing, reserves nothing', BigInt(await call(VA, 'reserved()')) === 0n);
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
