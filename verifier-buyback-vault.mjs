/* verifier-buyback-vault.mjs -- READ-ONLY check of the TBLOCK buyback that pays the holders vault, after its ONE deploy
 *   (deployer-tblock-buyback-vault.html).
 * Usage: node verifier-buyback-vault.mjs <tx hash>
 *   env BUYBACK_RPC (default https://mainnet.base.org), BUYBACK_RECORD (default ./tblock-buyback-vault-deploiement.js),
 *   KEEPER (default: the record's keeper) = the keeper expected on chain.
 * Checks (buyback-vault.js verifierBuybackVault): record integrity; tx.from == the record's deployer; status 1; a contract creation with
 *   exactly the frozen data at the CREATE address of (deployer, nonce); runtime == the frozen build (immutable slots masked, size equal);
 *   then by eth_call: DEST == V (economie-v2-pack-deploye.js), destCodehash == keccak(V code), GUARDIAN == DEV == V.DEV(), VETO == dev2
 *   == V.DEV2(), KEEPER == expected, every pool / token / number, the door's 7 days and 2 days, the door open, no proposal pending.
 *   Prints every line; exit 0 ONLY if every check holds.
 * Signs nothing, sends nothing: eth_chainId, eth_getTransactionByHash, eth_getTransactionReceipt, eth_getCode, eth_call only. */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifierBuybackVault } from './buyback-vault.js';

const LECTURES = new Set(['eth_chainId', 'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_getCode', 'eth_call']);
export function rpcHttp(url) {
  let id = 0;
  return async (method, params) => {
    if (!LECTURES.has(method)) throw new Error('read-only verifier: ' + method + ' refused');
    for (let k = 0; ; k++) {
      try {
        const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
        const j = await r.json();
        if (j.error) { const e = new Error(method + ': ' + JSON.stringify(j.error)); e.rpc = true; throw e; }
        return j.result;
      } catch (x) { if (x.rpc || k >= 3) throw x; await new Promise((o) => setTimeout(o, 1200 * (k + 1))); }
    }
  };
}

async function cli() {
  const h = String(process.argv[2] || '').toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(h) || process.argv.length !== 3) { console.error('usage: node verifier-buyback-vault.mjs <the deploy transaction hash>'); process.exitCode = 2; return; }
  const recPath = process.env.BUYBACK_RECORD ? path.resolve(process.env.BUYBACK_RECORD) : null;
  const { BUYBACK_VAULT_DEPLOIEMENT: R } = await import(recPath ? pathToFileURL(recPath).href : new URL('./tblock-buyback-vault-deploiement.js', import.meta.url).href);
  const url = process.env.BUYBACK_RPC || 'https://mainnet.base.org';
  console.log('record sha256 ' + R.sha256Creation + ' · rpc ' + url);
  const res = await verifierBuybackVault(R, h, rpcHttp(url), { keeper: process.env.KEEPER || undefined });
  for (const l of res.lignes) console.log((l.ok ? '  ok  ' : '  KO  ') + l.quoi + (l.ok ? '' : '\n        seen: ' + l.vu));
  const ko = res.lignes.filter((l) => !l.ok).length;
  console.log(ko ? 'NOT VERIFIED: ' + ko + ' check(s) failed out of ' + res.lignes.length : 'ALL ' + res.lignes.length + ' CHECKS HOLD · buyback ' + res.adresse);
  process.exitCode = ko ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await cli(); } catch (e) { console.error('NOT VERIFIED: ' + String((e && e.message) || e).slice(0, 300)); process.exitCode = 1; }
}
