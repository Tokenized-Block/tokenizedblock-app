/* test-index-logs-20261111.mjs — the generic log index (index-logs.js): never skips a window, counts a re-read log once, stamps block
 *   times, and is not "complete" while a record waits for its time. */
import { creerIndexLogs } from './index-logs.js';
import { TOPICS, decoderLock } from './lock-evenements.js';
let ok = 0, ko = 0;
const t = (m, c, x = '') => { if (c) ok++; else { ko++; console.log('KO', m, x); } };
const L = '0xec46b02bb1f3a58ce37c023f8668f2207bc2b0aa';
const pad = (a) => '0x' + a.replace(/^0x/, '').padStart(64, '0');
const u = (n) => BigInt(n).toString(16).padStart(64, '0');
const lg = (bn, idx = 0) => ({ address: L, topics: [TOPICS.Withdrawn, pad('0xa11ce')], data: '0x' + u(7), blockNumber: '0x' + bn.toString(16), logIndex: '0x' + idx.toString(16), transactionHash: '0x' + bn.toString(16).padStart(64, '0') });
function noeud({ tete, logs, panne = new Set(), tempsKo = new Set() }) {
  const appels = [];
  const rpc = async (m, p) => {
    if (m === 'eth_blockNumber') return '0x' + tete.toString(16);
    if (m === 'eth_getBlockByNumber') { const b = Number(BigInt(p[0])); if (tempsKo.has(b)) { tempsKo.delete(b); throw new Error('429'); } return { timestamp: '0x' + (1_800_000_000 + b).toString(16) }; }
    const a = Number(BigInt(p[0].fromBlock)), b = Number(BigInt(p[0].toBlock)); appels.push(a);
    if (panne.has(a)) { panne.delete(a); throw new Error('rate limited'); }
    return logs.filter((l) => { const n = Number(BigInt(l.blockNumber)); return n >= a && n <= b; });
  };
  return { rpc, appels };
}
const mk = (n, o = {}) => creerIndexLogs({ rpc: n.rpc, adresse: L, topics: Object.values(TOPICS), decoder: decoderLock, depuis: 1000, fenetre: 1000, ...o });
{
  const n = noeud({ tete: 3999, logs: [lg(1500), lg(2500), lg(3500)], panne: new Set([2000]) });
  const ix = mk(n);
  await ix.avancer();
  t('failed window: cursor stays on it, hole said', ix.etat.prochain === 2000 && ix.etat.trou && ix.etat.trou.de === 2000 && !ix.complet());
  await ix.avancer();
  t('re-read: nothing lost, complete', ix.recs().length === 3 && ix.complet() && n.appels.filter((a) => a === 2000).length === 2);
  t('records stamped with their block time', ix.recs().every((r) => r.t === 1_800_000_000 + r.blockNumber));
}
{
  const n = noeud({ tete: 1999, logs: [lg(1500), lg(1500)], tempsKo: new Set([1500]) });
  const ix = mk(n);
  await ix.avancer();
  t('same log twice counts once', ix.recs().length === 1);
  t('a record without its time: not complete, counted', !ix.complet() && ix.etat.sansTemps === 1);
  await ix.avancer();
  t('its time read next pass: complete', ix.complet() && ix.recs()[0].t === 1_800_001_500);
}
{
  let tete = 1499; const logs = [lg(1700)];
  const rpc = async (m, p) => { if (m === 'eth_blockNumber') return '0x' + tete.toString(16); if (m === 'eth_getBlockByNumber') return { timestamp: '0x1' }; const a = Number(BigInt(p[0].fromBlock)), b = Number(BigInt(p[0].toBlock)); return logs.filter((l) => { const x = Number(BigInt(l.blockNumber)); return x >= a && x <= b; }); };
  const ix = creerIndexLogs({ rpc, adresse: L, topics: Object.values(TOPICS), decoder: decoderLock, depuis: 1000, fenetre: 1000 });
  await ix.avancer();
  t('stops at the head, not at the window edge', ix.etat.prochain === 1500 && ix.complet());
  tete = 2600; await ix.avancer();
  t('the event after the old head is found', ix.recs().length === 1);
}
{
  const rpc = async (m) => (m === 'eth_blockNumber' ? '0x7cf' : { not: 'a list' });
  const ix = creerIndexLogs({ rpc, adresse: L, topics: Object.values(TOPICS), decoder: decoderLock, depuis: 1000 });
  await ix.avancer();
  t('a non-list answer is not "no event", and the window is named', ix.etat.prochain === 1000 && !ix.complet() && ix.etat.trou && ix.etat.trou.a === 1999);
}
{
  let bas = false;
  const ix = creerIndexLogs({ rpc: async (m) => { if (m === 'eth_blockNumber') { if (bas) throw new Error('down'); return '0x7cf'; } return []; }, adresse: L, topics: Object.values(TOPICS), decoder: decoderLock, depuis: 1000, fenetre: 1000 });
  await ix.avancer(); const avant = ix.complet(); bas = true; await ix.avancer();
  t('node down after a complete index: no longer called complete', avant === true && ix.complet() === false);
}
{
  const n = noeud({ tete: 3999, logs: [] });
  const ix = mk(n, { parPasse: 1 });
  await ix.avancer();
  t('parPasse bounds one pass', ix.etat.prochain === 2000 && !ix.complet());
}
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
