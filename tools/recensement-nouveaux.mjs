/* tools/recensement-nouveaux.mjs - who used the contracts that the official usage measure (usage-onchain.js) does NOT list yet:
 * holders vault V, hearts, TBLOCK lock, monthly R and weekly R2 lock rewards, TAM art, skins mint, skins spin, block contest.
 * Same sender rule as usage-onchain.js: payeurDe (tx.from, or the ERC-4337 UserOperation sender), successful txs only.
 * Addresses come from the repo's deployment records, never typed. Read-only (base-rpc.publicnode.com, 50 000-block log ranges).
 * Usage: node tools/recensement-nouveaux.mjs [fromBlock] -> per contract: txs, users (with / without team), last use; and the union. */
import { VAULT, HEARTS, REWARDS } from '../economie-pack.js';
import { LOCK } from '../lock.js';
import { WEEKLY } from '../lock-weekly-app.js';
import { TAMART_DEPLOIEMENT } from '../tamart-deploiement.js';
import { SKINS_SPIN_DEPLOIEMENT } from '../skins-spin-deploiement.js';
import { CONTEST_DEPLOIEMENT } from '../block-contest-deploiement.js';
import { payeurDe } from '../revenu-externe.js';
import { EQUIPE } from '../usage-onchain.js';

const C = {
  'holders vault': VAULT, hearts: HEARTS, 'monthly lock rewards': REWARDS, 'weekly lock rewards': WEEKLY, 'TBLOCK lock': LOCK,
  'TAM art': TAMART_DEPLOIEMENT.adresse, 'skins mint': SKINS_SPIN_DEPLOIEMENT.etapes[0].adresse, 'skins spin': SKINS_SPIN_DEPLOIEMENT.etapes[1].adresse,
  'block contest': CONTEST_DEPLOIEMENT.adresse,
};
const ADR = Object.fromEntries(Object.entries(C).map(([k, v]) => [String(v).toLowerCase(), k]));
for (const [k, v] of Object.entries(C)) if (!/^0x[0-9a-f]{40}$/.test(String(v).toLowerCase())) throw new Error('address missing in the records: ' + k);
const TEAM = new Set(EQUIPE.map((e) => e.adresse.toLowerCase()));

const NODE = 'https://base-rpc.publicnode.com';
let id = 0;
async function rpc(method, params) {
  for (let i = 0; i < 6; i++) {
    try { const r = await fetch(NODE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }), signal: AbortSignal.timeout(30000) }); const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result; }
    catch (e) { if (i === 5) throw e; await new Promise((ok) => setTimeout(ok, 800 * (i + 1))); }
  }
}
const head = parseInt(await rpc('eth_blockNumber', []), 16) - 5;
const from = Number(process.argv[2] || 53154528);
const STEP = 50000;
const txs = new Map(); /* hash -> Set(contract names) */
for (let b = from; b <= head; b += STEP) {
  const logs = await rpc('eth_getLogs', [{ address: Object.keys(ADR), fromBlock: '0x' + b.toString(16), toBlock: '0x' + Math.min(head, b + STEP - 1).toString(16) }]);
  for (const l of logs) { const h = l.transactionHash.toLowerCase(); if (!txs.has(h)) txs.set(h, { b: parseInt(l.blockNumber, 16), c: new Set() }); txs.get(h).c.add(ADR[l.address.toLowerCase()]); }
  process.stderr.write('.');
}
process.stderr.write('\n' + txs.size + ' txs\n');
const per = Object.fromEntries(Object.keys(C).map((k) => [k, { txs: 0, users: new Set(), usersExt: new Set(), last: 0 }]));
const all = new Set(), allExt = new Set(), refused = {};
const tsCache = new Map();
const tsOf = async (b) => { if (!tsCache.has(b)) tsCache.set(b, parseInt((await rpc('eth_getBlockByNumber', ['0x' + b.toString(16), false])).timestamp, 16)); return tsCache.get(b); };
const now = await tsOf(head), wk = new Set(), mo = new Set();
for (const [h, { b, c }] of txs) {
  const [tx, recu] = await Promise.all([rpc('eth_getTransactionByHash', [h]), rpc('eth_getTransactionReceipt', [h])]);
  if (!tx || !recu || String(recu.status) !== '0x1') { refused.failedOrUnread = (refused.failedOrUnread || 0) + 1; continue; }
  const who = payeurDe({ tx, recu }); if (!who) { refused.senderAmbiguous = (refused.senderAmbiguous || 0) + 1; continue; }
  const w = who.toLowerCase(), ext = !TEAM.has(w), ts = await tsOf(b);
  for (const k of c) { per[k].txs++; per[k].users.add(w); if (ext) per[k].usersExt.add(w); per[k].last = Math.max(per[k].last, ts); }
  all.add(w); if (ext) { allExt.add(w); if (now - ts <= 7 * 86400) wk.add(w); if (now - ts <= 30 * 86400) mo.add(w); }
}
const iso = (t) => (t ? new Date(t * 1000).toISOString().slice(0, 16).replace('T', ' ') : '-');
console.log('window: block', from, '->', head, '(' + iso(await tsOf(from)) + ' -> ' + iso(now) + ' UTC)');
for (const [k, v] of Object.entries(per)) console.log(k.padEnd(22), 'txs', String(v.txs).padStart(4), '| users', v.users.size, '| outside team', v.usersExt.size, '| last', iso(v.last));
if (process.argv.includes('--list')) for (const w of allExt) console.log('outside team:', w, Object.entries(per).filter(([, v]) => v.usersExt.has(w)).map(([k]) => k).join(', '));
console.log('UNION users', all.size, '| outside team', allExt.size, '| outside team, last 7 d', wk.size, '| last 30 d', mo.size, '| refused', JSON.stringify(refused));
