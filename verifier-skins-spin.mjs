/* verifier-skins-spin.mjs — READ-ONLY check of the new Skins and the new Spin after their two deploys (deployer-skins-spin.html).
 * Usage: node verifier-skins-spin.mjs <txSkins> <txSpin>
 *   env SKINS_SPIN_RPC (default https://mainnet.base.org), SKINS_SPIN_RECORD (default ./skins-spin-deploiement.js).
 * Checks (skins-spin.js verifierPaire): the record's integrity; each step's tx.from == the record's deployer, nonces N and N+1, the signed
 *   data == the frozen creation byte for byte, status 1, contractAddress == the CREATE prediction; the runtime == the frozen build
 *   (immutable slots masked, size equal); then every constructor value read back by eth_call (1 USDC, the live router P, the live holders
 *   vault V, TBLOCK, USDC, the fee and dev wallets with their 10 %, the live Spin price, pot share and 16 prizes, the dev batch bounds),
 *   and that the vault lists NEITHER (not a play: accepted by Phil). Prints every line; exit 0 ONLY if every check holds.
 * ⛔ Signs nothing, sends nothing: eth_chainId, eth_getTransactionByHash, eth_getTransactionReceipt, eth_getCode, eth_call only. */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifierPaire } from './skins-spin.js';

const LECTURES = new Set(['eth_chainId', 'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_getCode', 'eth_call']);
export function rpcHttp(url) {
  let id = 0;
  return async (method, params) => {
    if (!LECTURES.has(method)) throw new Error('read-only verifier: ' + method + ' refused');
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
    const j = await r.json();
    if (j.error) throw new Error(method + ': ' + JSON.stringify(j.error));
    return j.result;
  };
}

const hashes = process.argv.slice(2).map((h) => String(h).toLowerCase());
if (hashes.length !== 2 || hashes.some((h) => !/^0x[0-9a-f]{64}$/.test(h))) {
  console.error('usage: node verifier-skins-spin.mjs <Skins deploy tx hash> <Spin deploy tx hash>');
  process.exit(2);
}
const recPath = process.env.SKINS_SPIN_RECORD ? pathToFileURL(path.resolve(process.env.SKINS_SPIN_RECORD)).href : new URL('./skins-spin-deploiement.js', import.meta.url).href;
const { SKINS_SPIN_DEPLOIEMENT: R } = await import(recPath);
const rpcUrl = process.env.SKINS_SPIN_RPC || 'https://mainnet.base.org';
console.log('record pair sha256 ' + R.sha256Paire + ' · rpc ' + rpcUrl);
const res = await verifierPaire(R, hashes, rpcHttp(rpcUrl));
for (const l of res.lignes) console.log((l.ok ? '  ok  ' : '  KO  ') + l.quoi + (l.ok ? '' : '\n        seen: ' + l.vu));
const ko = res.lignes.filter((l) => !l.ok).length;
console.log(ko ? 'NOT VERIFIED: ' + ko + ' check(s) failed out of ' + res.lignes.length : 'ALL ' + res.lignes.length + ' CHECKS HOLD · Skins ' + res.adr.skins + ' · Spin ' + res.adr.spin);
process.exit(ko ? 1 : 0);
