// noter-crown-market.mjs — writes crown-market-deploiement.js from CrownMarket's deployment RECEIPT (never from a typed address).
// Usage: node contracts/noter-crown-market.mjs <txHash>
// Checks, on TWO nodes: the receipt has status 1 and a contractAddress; the code is non-empty; the immutables are the ones of the kit
//   (every address and number from crown-market-kit.js, and the creation data sha256 = the kit). Any mismatch writes nothing.
import { readFileSync, writeFileSync } from 'node:fs';
import { keccak256Hex } from '../keccak.js';
const tx = String(process.argv[2] || '');
if (!/^0x[0-9a-f]{64}$/i.test(tx)) { console.error('usage: node contracts/noter-crown-market.mjs <txHash>'); process.exit(2); }
const NODES = ['https://mainnet.base.org', 'https://base-rpc.publicnode.com'];
const { CROWN_MARKET_KIT: K } = await import('../crown-market-kit.js');
const want = { 'TBLOCK()': K.args.tblock, 'VAULT()': K.args.vault, 'LIKES()': K.args.likes, 'resolver()': K.args.resolver, 'DEV()': K.args.dev, 'DEV2()': K.args.dev2 };
const wantN = { 'GENESIS_BLOCK()': K.args.genesisBlock, 'ROUND_BLOCKS()': K.args.roundBlocks, 'RESOLVE_DEADLINE()': K.args.resolveDeadline, 'CHALLENGE_BLOCKS()': K.args.challengeBlocks, 'FEE_BPS()': K.args.feeBps, 'MIN_BET_USD_E18()': K.args.minBetUsdE18, 'CHALLENGE_BOND_USD_E18()': K.args.challengeBondUsdE18, 'MAX_PRICE_AGE()': K.args.maxPriceAge };
const sel = (s) => keccak256Hex(new TextEncoder().encode(s)).slice(0, 10);
async function rpc(url, m, p) { const r = await (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }) })).json(); if (r.error) throw new Error(m + ': ' + JSON.stringify(r.error)); return r.result; }
const seen = [];
for (const u of NODES) {
  const r = await rpc(u, 'eth_getTransactionReceipt', [tx]);
  if (!r || r.status !== '0x1' || !r.contractAddress) throw new Error(u + ': receipt not found, failed, or no contract created');
  const a = r.contractAddress.toLowerCase(), code = await rpc(u, 'eth_getCode', [a, 'latest']);
  if (!code || code === '0x') throw new Error(u + ': no code at ' + a);
  for (const [f, v] of Object.entries(want)) { const got = '0x' + (await rpc(u, 'eth_call', [{ to: a, data: sel(f) }, 'latest'])).slice(26); if (got.toLowerCase() !== v.toLowerCase()) throw new Error(u + ': ' + f + ' = ' + got + ', expected ' + v); }
  for (const [f, v] of Object.entries(wantN)) if (BigInt(await rpc(u, 'eth_call', [{ to: a, data: sel(f) }, 'latest'])) !== BigInt(v)) throw new Error(u + ': ' + f + ' is not ' + v);
  const tx0 = await rpc(u, 'eth_getTransactionByHash', [tx]); if ((await import('node:crypto')).createHash('sha256').update(tx0.input).digest('hex') !== K.sha256) throw new Error(u + ': the creation data is not the kit');
  seen.push({ a, bloc: parseInt(r.blockNumber, 16) });
}
if (seen[0].a !== seen[1].a || seen[0].bloc !== seen[1].bloc) throw new Error('the two nodes disagree: ' + JSON.stringify(seen));
const out = `/* crown-market-deploiement.js — where CrownMarket lives on Base. ⛔ NEVER TYPED BY HAND: written by contracts/noter-crown-market.mjs from
 *   the deployment receipt of ${tx} (read on ${NODES.length} nodes; code, immutables and the creation data sha256 checked against the kit). */
export const CROWN_MARKET_DEPLOIEMENT = Object.freeze({ chaine: 8453, adresse: '${seen[0].a}', tx: '${tx.toLowerCase()}', bloc: ${seen[0].bloc}, genesis: ${K.args.genesisBlock}, roundBlocks: ${K.args.roundBlocks} });
`;
writeFileSync(new URL('../crown-market-deploiement.js', import.meta.url), out);
console.log('written: CrownMarket at', seen[0].a, 'block', seen[0].bloc);
