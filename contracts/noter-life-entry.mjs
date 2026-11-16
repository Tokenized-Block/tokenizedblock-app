// noter-life-entry.mjs — writes life-entry-deploiement.js from LifeEntry's deployment RECEIPT (never from a typed address).
// Usage: node contracts/noter-life-entry.mjs <txHash>
// Checks, on TWO nodes: the receipt has status 1 and a contractAddress; the code is non-empty; the immutables are the ones of the kit
//   (TBLOCK, VAULT, LIKES copied from the repo's own files, ENTRY_USD_E18 = 2e18, MAX_PRICE_AGE = 21600). Any mismatch writes nothing.
import { readFileSync, writeFileSync } from 'node:fs';
import { keccak256Hex } from '../keccak.js';
const tx = String(process.argv[2] || '');
if (!/^0x[0-9a-f]{64}$/i.test(tx)) { console.error('usage: node contracts/noter-life-entry.mjs <txHash>'); process.exit(2); }
const NODES = ['https://mainnet.base.org', 'https://base-rpc.publicnode.com'];
const TBLOCK = readFileSync(new URL('../economie.js', import.meta.url), 'utf8').match(/export const TBLOCK = '(0x[0-9a-f]{40})'/)[1];
const PACK = readFileSync(new URL('../economie-v2-pack-deploye.js', import.meta.url), 'utf8');
const g = (l) => PACK.match(new RegExp("lettre: '" + l + "', adresse: '(0x[0-9a-f]{40})'"))[1];
const want = { 'TBLOCK()': TBLOCK, 'VAULT()': g('V'), 'LIKES()': g('L') };
const sel = (s) => keccak256Hex(new TextEncoder().encode(s)).slice(0, 10);
async function rpc(url, m, p) { const r = await (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }) })).json(); if (r.error) throw new Error(m + ': ' + JSON.stringify(r.error)); return r.result; }
const seen = [];
for (const u of NODES) {
  const r = await rpc(u, 'eth_getTransactionReceipt', [tx]);
  if (!r || r.status !== '0x1' || !r.contractAddress) throw new Error(u + ': receipt not found, failed, or no contract created');
  const a = r.contractAddress.toLowerCase(), code = await rpc(u, 'eth_getCode', [a, 'latest']);
  if (!code || code === '0x') throw new Error(u + ': no code at ' + a);
  for (const [f, v] of Object.entries(want)) { const got = '0x' + (await rpc(u, 'eth_call', [{ to: a, data: sel(f) }, 'latest'])).slice(26); if (got.toLowerCase() !== v.toLowerCase()) throw new Error(u + ': ' + f + ' = ' + got + ', expected ' + v); }
  if (BigInt(await rpc(u, 'eth_call', [{ to: a, data: sel('ENTRY_USD_E18()') }, 'latest'])) !== 2n * 10n ** 18n) throw new Error(u + ': ENTRY_USD_E18 is not 2e18');
  if (BigInt(await rpc(u, 'eth_call', [{ to: a, data: sel('MAX_PRICE_AGE()') }, 'latest'])) !== 21600n) throw new Error(u + ': MAX_PRICE_AGE is not 21600');
  seen.push({ a, bloc: parseInt(r.blockNumber, 16) });
}
if (seen[0].a !== seen[1].a || seen[0].bloc !== seen[1].bloc) throw new Error('the two nodes disagree: ' + JSON.stringify(seen));
const out = `/* life-entry-deploiement.js — where LifeEntry (contracts/src/LifeEntry.sol, "Add your block" of Game of Life Block) lives on Base.
 * ⛔ NEVER TYPED BY HAND: written by contracts/noter-life-entry.mjs from the deployment receipt of ${tx}
 *   (read on ${NODES.length} nodes; code, TBLOCK, VAULT, LIKES, ENTRY_USD_E18 and MAX_PRICE_AGE checked). */
export const LIFE_ENTRY_DEPLOIEMENT = Object.freeze({ chaine: 8453, adresse: '${seen[0].a}', tx: '${tx.toLowerCase()}', bloc: ${seen[0].bloc} });
`;
writeFileSync(new URL('../life-entry-deploiement.js', import.meta.url), out);
console.log('written: LifeEntry at', seen[0].a, 'block', seen[0].bloc);
