/* test-tam-index-20261111.mjs — game359 (Grok's live test 2026-11-11: the TAM mint refused "Not ready: the minted works were not read up to
 *   the latest block"; prod /api/tam/oeuvres sat at block 53,906,473, ~2.1M blocks behind the head). AFFIRME on the REAL tam-serveur.js:
 *   - with a fake node: totalSupply = 0 -> the list is whole AT ONCE (etat LU, jusqua = head), not one log window read;
 *   - totalSupply = 2 with no log read -> works 1 and 2 are read BY ID (empreinte, graine, donnees) — but a donnees read that fails leaves the
 *     list NOT whole (never compared against a gap) and the log scan runs as before;
 *   - totalSupply not readable -> the log scan runs, unchanged (EN_RETARD while behind);
 *   - the live check (read-only, Base mainnet): the real serveurTam on the real TamArt answers LU in one call.
 * NE PROUVE PAS: a by-id read of a real minted work's bytes (no work is minted yet on 2026-11-11). */
import { serveurTam, PAR_ID_MAX } from './tam-serveur.js';
import { TAMART_DEPLOIEMENT } from './tamart-deploiement.js';
import { adresseTam, SIG_TAM } from './tam-plan.js';
import { selecteur } from './keccak.js';
let ok = 0, ko = 0;
const t = (m, c, x = '') => { if (c) ok++; else { ko++; console.log('KO', m, x); } };
const C = adresseTam(TAMART_DEPLOIEMENT), H = 56_000_000;
const sel = (s) => selecteur(s).slice(0, 10).toLowerCase();
function faux({ supply, supplyCasse = false, donneesCasse = false }) {
  const vu = { logs: 0, parId: 0 };
  const rpc = async (m, p) => {
    if (m === 'eth_blockNumber') return '0x' + H.toString(16);
    if (m === 'eth_getLogs') { vu.logs++; return []; }
    if (m === 'eth_call') {
      const d = String(p[0].data).toLowerCase();
      if (d.startsWith(sel(SIG_TAM.totalSupply))) { if (supplyCasse) throw new Error('429'); return '0x' + supply.toString(16).padStart(64, '0'); }
      if (d.startsWith(sel(SIG_TAM.empreinte)) || d.startsWith(sel(SIG_TAM.graine))) { vu.parId++; return '0x' + 'ab'.repeat(32); }
      if (d.startsWith(sel(SIG_TAM.donnees))) { if (donneesCasse) throw new Error('429'); throw new Error('not a real work in this fake'); }
    }
    throw new Error('unexpected ' + m);
  };
  return { srv: serveurTam({ rpc, deploiement: TAMART_DEPLOIEMENT }), vu };
}
t('TamArt deployed in the frozen data', /^0x[0-9a-f]{40}$/.test(C));
{
  const { srv, vu } = faux({ supply: 0 });
  const r = await srv.oeuvres();
  t('supply 0: whole at once (LU, head reached, no log window read)', r.ok && r.etat === 'LU' && r.jusqua === H && vu.logs === 0 && r.oeuvres.length === 0, JSON.stringify(r).slice(0, 200));
}
{
  const { srv, vu } = faux({ supply: 2, donneesCasse: true });
  const r = await srv.oeuvres();
  t('supply 2: works read by id (2 x empreinte + graine)', vu.parId === 4 && r.oeuvres.length === 2 && r.oeuvres.every((o) => o.parId === true));
  t('a work whose bytes were not read keeps the list NOT whole: the log scan runs, not LU', r.etat !== 'LU' && vu.logs > 0, r.etat);
}
{
  const { srv, vu } = faux({ supply: 0, supplyCasse: true });
  const r = await srv.oeuvres();
  t('supply not read: the log scan runs as before (EN_RETARD while behind)', r.etat === 'EN_RETARD' && vu.logs > 0, r.etat);
}
t('by-id reads are bounded per call', PAR_ID_MAX === 50);
/* live, read-only */
const URL_RPC = process.env.TAM_RPC || 'https://mainnet.base.org';
try {
  const rpc = async (m, p) => { const r = await fetch(URL_RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }), signal: AbortSignal.timeout(20000) }).then((x) => x.json()); if (r.error) throw new Error(r.error.message); return r.result; };
  const sup = Number(BigInt(await rpc('eth_call', [{ to: C, data: selecteur(SIG_TAM.totalSupply) }, 'latest'])));
  const r = await serveurTam({ rpc, deploiement: TAMART_DEPLOIEMENT }).oeuvres();
  t('LIVE: the real index is whole in one call (supply ' + sup + ')', r.ok && r.etat === 'LU' && r.oeuvres.length === sup, JSON.stringify(r).slice(0, 200));
} catch (e) { console.log('live check not run: ' + String(e.message || e).slice(0, 100)); }
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
