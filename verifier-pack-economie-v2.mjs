/* verifier-pack-economie-v2.mjs — READ-ONLY check of the economy v2 pack after the six deploys (deployer-economie-v2.html).
 * Usage: node verifier-pack-economie-v2.mjs <txL> <txP> <txT> <txS> <txV> <txR>
 *   env PACK_RPC (default https://mainnet.base.org), PACK_RECORD (default ./economie-v2-pack-deploiement.js).
 * Checks, for every step: tx.from == the record's deployer, consecutive nonces N..N+5, the signed data == the frozen creation (addresses
 *   substituted from the nonce prediction), status 1, contractAddress == predicted; runtime code == the frozen build (immutable slots
 *   masked, size equal); then the constructor wiring by eth_call (one TBLOCK, one router, L/V/R wiring, wallets, caps) and the two-way game
 *   checks (game.VAULT()/REWARDS() == V/R AND V/R.isGame(game), wired()). A heart is a play (Phil 2026-11-12): L.REWARDS() == R,
 *   R.isGame(L), L.wired(), and R lists exactly [L, T, S] (GAME_COUNT 3) while V lists [T, S]. A record whose Likes does not name R, or
 *   whose R does not list [L, T, S], fails integrity before any chain read. Prints every line; exit 0 ONLY if every check holds.
 * ⛔ Signs nothing, sends nothing: eth_chainId, eth_getTransactionByHash, eth_getTransactionReceipt, eth_getCode, eth_call only. */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifierPack } from './pack-economie-v2.js';

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
if (hashes.length !== 6 || hashes.some((h) => !/^0x[0-9a-f]{64}$/.test(h))) {
  console.error('usage: node verifier-pack-economie-v2.mjs <six transaction hashes, in deploy order L P T S V R>');
  process.exit(2);
}
const recPath = process.env.PACK_RECORD ? path.resolve(process.env.PACK_RECORD) : new URL('./economie-v2-pack-deploiement.js', import.meta.url);
const { PACK_ECONOMIE_V2: R } = await import(recPath instanceof URL ? recPath.href : pathToFileURL(recPath).href);
const rpcUrl = process.env.PACK_RPC || 'https://mainnet.base.org';
console.log('pack record sha256 ' + R.sha256Pack + ' · rpc ' + rpcUrl);
const res = await verifierPack(R, hashes, rpcHttp(rpcUrl));
for (const l of res.lignes) console.log((l.ok ? '  ok  ' : '  KO  ') + l.quoi + (l.ok ? '' : '\n        seen: ' + l.vu));
const ko = res.lignes.filter((l) => !l.ok).length;
console.log(ko ? 'PACK NOT VERIFIED: ' + ko + ' check(s) failed out of ' + res.lignes.length : 'ALL ' + res.lignes.length + ' CHECKS HOLD · L ' + res.adr.L + ' P ' + res.adr.P + ' T ' + res.adr.T + ' S ' + res.adr.S + ' V ' + res.adr.V + ' R ' + res.adr.R);
process.exit(ko ? 1 : 0);
