// tools/enregistrer-life-block.mjs — READ ONLY. Records the real, block-dated facts that drive "Game of Life Block".
//   For the 50 most traded blocks of the app's trending list, it reads every ERC-20 Transfer of the last N chain blocks
//   (eth_getLogs, Base), classifies each one against the block's own pools (from the pool = a buy, to the pool = a sell,
//   otherwise a transfer), and writes life-block/donnees.json: the blocks (address, symbol, pools, liquidity) and the
//   facts (chain block, tx hash, token, kind, receiver). Anyone can re-read the same logs and get the same file.
// Usage: node tools/enregistrer-life-block.mjs [hours=2] [rpc=https://base-rpc.publicnode.com]
// NE PROUVE PAS: a buy/sell is inferred from a transfer touching a pool (a router hop can show twice); "new receiver" means
//   new within this recording, not a first-time holder of the token.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';

const HEURES = Number(process.argv[2] || 2), RPC = process.argv[3] || 'https://base-rpc.publicnode.com';
const SRC = readFileSync(new URL('../usage-onchain.js', import.meta.url), 'utf8');
const POOL_MANAGER = (SRC.match(/POOL_MANAGER\s*=\s*'(0x[0-9a-f]{40})'/) || [])[1];
if (!POOL_MANAGER) throw new Error('POOL_MANAGER not found in usage-onchain.js');
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const EXCLUS = /xhamster|porn|sex/i; /* adult names written by their creators: not shown in a demo */

let id = 0;
async function rpc(method, params, essais = 4) {
  for (let k = 0; ; k++) {
    try {
      const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }), signal: AbortSignal.timeout(30000) });
      const j = await r.json(); if (j.error) throw new Error(method + ': ' + JSON.stringify(j.error).slice(0, 200)); return j.result;
    } catch (e) { if (k >= essais) throw e; await new Promise((o) => setTimeout(o, 1500 * (k + 1))); }
  }
}
const bas = (a) => String(a || '').toLowerCase();

const T = await (await fetch('https://tokenizedblock.space/api/trending', { headers: { 'x-ms-monitor': '1' } })).json();
/* Phil 2026-11-16: the players are the TOKENIZED STOCK blocks (issuer lines), the ones that really trade on chain — plus TBLOCK.
 *   Measured before: 29 of 50 "most traded" meme blocks had no log at all over 2 hours. */
const lignes = T.lignes.filter((x) => x.emetteur && !EXCLUS.test(x.nom + ' ' + x.sym)).sort((a, b) => b.trades24h - a.trades24h);
/* Phil 2026-11-16: tokenized stocks only (TBLOCK had no transfer in the window: "le block TBLOCK est vide, ajoute pas") */
const blocks = lignes.map((x) => ({ adr: bas(x.adr), sym: x.sym, nom: x.nom, action: !!x.emetteur, liquiditeUsd: Math.round(Number(x.liquiditeUsd) || 0),
  pools: [...new Set([x.poolAdr, x.routeAction && x.routeAction.pool, x.emetteur ? null : POOL_MANAGER].filter(Boolean).map(bas))] }));
const index = new Map(blocks.map((b, i) => [b.adr, i]));

const tete = parseInt(await rpc('eth_blockNumber', []), 16) - 10;
const de0 = tete - Math.round(HEURES * 3600 / 0.2) + 1, FEN = 2000;
const faits = [];
for (let de = de0; de <= tete; de += FEN) {
  const a = Math.min(tete, de + FEN - 1);
  /* publicnode answers at most 10 addresses per getLogs (measured: -32602 "A maximum of 10 addresses is allowed") */
  const logs = [];
  for (let k = 0; k < blocks.length; k += 10) logs.push(...await rpc('eth_getLogs', [{ fromBlock: '0x' + de.toString(16), toBlock: '0x' + a.toString(16), address: blocks.slice(k, k + 10).map((b) => b.adr), topics: [TRANSFER] }]));
  for (const l of logs) {
    const i = index.get(bas(l.address)); if (i === undefined || l.topics.length < 3) continue;
    const from = '0x' + l.topics[1].slice(26), to = '0x' + l.topics[2].slice(26), P = blocks[i].pools;
    const kind = P.includes(from) ? 'achat' : P.includes(to) ? 'vente' : 'transfert';
    faits.push({ bloc: parseInt(l.blockNumber, 16), tx: l.transactionHash, log: parseInt(l.logIndex, 16), b: i, kind, vers: to });
  }
  process.stdout.write('\r' + Math.round((a - de0 + 1) / (tete - de0 + 1) * 100) + '% ' + faits.length + ' facts   ');
}
faits.sort((x, y) => x.bloc - y.bloc || x.log - y.log);
mkdirSync(new URL('../life-block/', import.meta.url), { recursive: true });
const out = { mesure: 'Game of Life Block — facts read from Base by tools/enregistrer-life-block.mjs', rpc: RPC, de: de0, a: tete,
  luLe: new Date().toISOString(), poolManager: POOL_MANAGER, blocks, faits };
writeFileSync(new URL('../life-block/donnees.json', import.meta.url), JSON.stringify(out));
const parB = blocks.map((b, i) => b.sym + ':' + faits.filter((f) => f.b === i).length);
console.log('\nblocks', blocks.length, '| chain blocks', de0, '->', tete, '| facts', faits.length, '| kinds',
  JSON.stringify(faits.reduce((o, f) => ((o[f.kind] = (o[f.kind] || 0) + 1), o), {})));
console.log(parB.join(' '));
