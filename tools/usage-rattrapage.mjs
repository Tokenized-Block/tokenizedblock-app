/* tools/usage-rattrapage.mjs - catch the on-chain usage measure up to the chain head, locally, with the SAME engine and rules as
 * GET /api/usage (usage-onchain.js), from the published seed (mesures/usage-onchain-20261027.json).
 * Why: the server engine restarts from the 27/10 seed at every deploy and catches up 20 000 blocks per 10 min; since Base runs at
 * 0.2 s per block (05/11) the gap is ~4.5 M blocks = ~37 h without a deploy, which never happens (measured 15/11: still at 27/10).
 * Node: base-rpc.publicnode.com serves eth_getLogs 3 M blocks back with ranges up to 50 000 (probed 15/11). Read-only.
 * Usage: node tools/usage-rattrapage.mjs [out.json]  -> writes the new seed (lines + end block) and prints the counts. */
import { readFileSync, writeFileSync } from 'node:fs';
import { moteurUsage } from '../usage-onchain.js';

const NODE = 'https://base-rpc.publicnode.com';
let id = 0;
async function rpc(method, params) {
  for (let essai = 0; essai < 6; essai++) {
    try {
      const r = await fetch(NODE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }), signal: AbortSignal.timeout(30000) });
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || 'rpc error');
      return j.result;
    } catch (e) { if (essai === 5) throw e; await new Promise((ok) => setTimeout(ok, 800 * (essai + 1))); }
  }
}
const graine = JSON.parse(readFileSync(new URL('../mesures/usage-onchain-20261027.json', import.meta.url), 'utf8'));
const M = moteurUsage({ rpc, graine, fenetre: 45000, maxFenetres: 10 });
let derniere = -1;
for (;;) {
  await M.avancer();
  const s = M.resume();
  if (s.erreur) console.log('error:', s.erreur);
  process.stdout.write(`end ${s.fin && s.fin.bloc} (${s.fin && s.fin.iso}) delay ${s.retardBlocs}\n`);
  if (s.retardBlocs !== null && s.retardBlocs <= 50) break;
  if (s.fin && s.fin.bloc === derniere) { console.log('no progress, stop'); break; }
  derniere = s.fin && s.fin.bloc;
}
const s = M.resume();
console.log(JSON.stringify({ fin: s.fin, avecEquipe: s.avecEquipe, sansEquipe: s.sansEquipe, nonLus: s.nonLus }, null, 1));
if (process.argv[2] && M.exporter) writeFileSync(process.argv[2], JSON.stringify(M.exporter(), null, 1));
/* --senders: per sender after the 27/10 seed (txs, USD, categories, last use), to tell team / keeper / real users apart */
if (process.argv.includes('--senders')) {
  const per = new Map();
  for (const r of M.etat.lignes.values()) {
    if (r.b <= graine.fin.bloc) continue;
    const k = String(r.from).toLowerCase(), p = per.get(k) || { txs: 0, usd: 0, cats: new Set(), last: 0 };
    p.txs++; p.usd += r.usd || 0; (r.cats || []).forEach((c) => p.cats.add(c)); p.last = Math.max(p.last, r.ts || 0); per.set(k, p);
  }
  for (const [k, p] of [...per].sort((a, b) => b[1].usd - a[1].usd)) console.log('sender', k, 'txs', p.txs, 'usd', p.usd.toFixed(2), [...p.cats].join('+'), p.last ? new Date(p.last * 1000).toISOString().slice(0, 16) : '-');
}
