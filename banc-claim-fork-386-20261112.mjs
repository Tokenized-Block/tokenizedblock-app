/* banc-claim-fork-386-20261112.mjs — FORK ONLY. The claim page's path (claim-vue.js + envoi.js) on a base-anvil fork of Base, with the
 *   real holders vault V, the real TBLOCK and the real lock of the wallet 0x31e0…de3b (3,000,000 TBLOCK locked, played week 0).
 *   Nothing here touches Base: the fork moves its clock past the end of week 0, closes week 0 from a neutral impersonated address, then
 *   runs executerClaim exactly as claim.html does, with envoi.js envoyerDepuisWallet over a fake wallet that forwards eth_sendTransaction to
 *   the fork (impersonated). It checks what the unit test cannot: the REAL receipt shape (B20 TBLOCK Transfer emitter, Claimed topics),
 *   that the simulated amount is what the receipt pays, and that a second claim is refused in the simulation (AlreadyClaimed) before any
 *   wallet opens. The month claim of the lock rewards is NOT run here (this wallet has no weight in month 0; month 1 ends 2027-01-11).
 * Usage: FOUNDRY_BASE=true base-anvil --base --fork-url https://mainnet.base.org --port 9561 ; node banc-claim-fork-386-20261112.mjs [url] */
import * as CV from './claim-vue.js';
import * as EP from './economie-pack.js';
import { envoyerDepuisWallet, messageEnvoi } from './envoi.js';

const FORK = process.argv[2] || 'http://127.0.0.1:9561';
const G = '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b';
const NEUTRE = '0x000000000000000000000000000000000000beef';
let id = 0;
async function rpc(method, params = []) {
  const j = await fetch(FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((r) => r.json());
  if (j.error) { const e = new Error(j.error.message); e.data = j.error.data; throw e; }
  return j.result;
}
let ok = 0, ko = 0;
const t = (m, c, d = '') => { if (c) { ok++; console.log('  ok  ' + m); } else { ko++; console.log('KO  ' + m + (d ? '\n      ' + d : '')); } };

const chaine = Number(BigInt(await rpc('eth_chainId')));
t('the fork answers as Base (8453)', chaine === 8453, String(chaine));
const snap = await rpc('evm_snapshot');
try {
  const fin0 = EP.word(await rpc('eth_call', [EP.VIEW.epochEnd(0), 'latest']));
  t('week 0 of the vault ends 2026-11-18 00:00 UTC on the fork (read)', fin0 === 1794960000n, String(fin0));
  await rpc('evm_setNextBlockTimestamp', [Number(fin0) + 120]); await rpc('evm_mine');
  /* anyone closes week 0 */
  await rpc('anvil_setBalance', [NEUTRE, '0x' + (10n ** 18n).toString(16)]);
  await rpc('anvil_impersonateAccount', [NEUTRE]);
  const hc = await rpc('eth_sendTransaction', [{ from: NEUTRE, to: CV.V, data: CV.closeSemaineCall(0n).data, value: '0x0' }]);
  const rc = await rpc('eth_getTransactionReceipt', [hc]);
  const ep0 = EP.decoderEpoque(await rpc('eth_call', [EP.VIEW.epochs(0), 'latest']));
  t('week 0 closed on the fork with a budget', rc && rc.status === '0x1' && ep0.closed && ep0.budget > 0n, 'budget ' + EP.fmt(ep0.budget));
  const verdictClose = CV.verifierRecu({ type: 'fermeSemaine', e: 0n, appel: CV.closeSemaineCall(0n), wallet: NEUTRE }, await rpc('eth_getTransactionByHash', [hc]), rc);
  t('the close receipt is judged good for its signer (EpochClosed of week 0 emitted by V)', verdictClose.ok, verdictClose.ko && verdictClose.ko.join('; '));

  const head = await rpc('eth_getBlockByNumber', ['latest', false]);
  const L = await CV.lireTout(rpc, G, Number(BigInt(head.timestamp)));
  const s0 = L.v.semaines.find((x) => x.e === 0n);
  const st = s0 ? CV.etatSemaine(s0, L) : null;
  t('the page reads week 0 as "to claim" for this wallet', st && st.cle === 'A_RECLAMER', st && st.texte);
  const plan = CV.planClaimSemaine(L, 0n, G);
  t('the plan is V.claim(0) from this wallet', plan.ok && plan.appel.data === EP.claimCall(0n).data, plan.why);

  /* a fake wallet: the account G on Base; eth_sendTransaction is forwarded to the fork, impersonated (fork only) */
  await rpc('anvil_impersonateAccount', [G]);
  await rpc('anvil_setBalance', [G, '0x' + (10n ** 18n).toString(16)]);
  const journal = [];
  const eth = { request: async ({ method, params }) => {
    journal.push(method);
    if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [G];
    if (method === 'eth_chainId') return '0x2105';
    if (method === 'eth_sendTransaction') return rpc('eth_sendTransaction', params);
    throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
  } };
  const envoyer = (a) => envoyerDepuisWallet({ eth, rpc, chaineAttendue: CV.CHAINE, compte: G, to: a.to, data: a.data, value: a.value, delai: 50, essais: 20 });
  const avant = EP.word(await rpc('eth_call', [EP.VIEW.balanceOf(CV.TBLOCK, G), 'latest']));
  const res = await CV.executerClaim({ rpc, eth, plan, envoyer, pause: async () => {} });
  const apres = EP.word(await rpc('eth_call', [EP.VIEW.balanceOf(CV.TBLOCK, G), 'latest']));
  t('executerClaim: simulated, sent, receipt judged good', res.ok && res.etape === 'RECU', res.why || (res.envoi && messageEnvoi(res.envoi)));
  t('the receipt: signed by the wallet itself, TBLOCK Transfer from V emitted by TBLOCK, exactly Claimed share + bonus', res.ok && res.verdict.signe === 'wallet' && res.verdict.paye === res.verdict.du);
  t('the wallet balance grew by exactly what the receipt shows', res.ok && apres - avant === res.verdict.paye, EP.fmt(apres - avant, 6) + ' vs ' + (res.verdict && EP.fmt(res.verdict.paye || 0n, 6)));
  t('the simulation showed the same amount as the receipt paid (same block time window)', res.ok && res.sim.retour === res.verdict.paye, String(res.sim && res.sim.retour) + ' vs ' + String(res.verdict && res.verdict.paye));
  console.log('      paid ' + (res.verdict ? EP.fmt(res.verdict.paye || 0n, 4) : '?') + ' TBLOCK; the page says: ' + (res.ok ? CV.texteVerdict(plan, res) : res.why));
  t('the wallet was opened once, after the simulation (eth_sendTransaction once)', journal.filter((m) => m === 'eth_sendTransaction').length === 1);

  /* the same claim again: refused by the simulation, the wallet never opens */
  journal.length = 0;
  const res2 = await CV.executerClaim({ rpc, eth, plan, envoyer, pause: async () => {} });
  t('a second claim of week 0 is refused in the simulation (already claimed), the wallet never opens', !res2.ok && res2.etape === 'SIMULATION' && /already claimed/.test(res2.why) && !journal.includes('eth_sendTransaction'), res2.why);
  const L2 = await CV.lireTout(rpc, G, Number(BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp)));
  t('read again, week 0 shows "claimed"', CV.etatSemaine(L2.v.semaines.find((x) => x.e === 0n), L2).cle === 'RECLAMEE');
  /* the real receipt judged for ANOTHER wallet is refused (tx.from) */
  if (res.ok) {
    const tx = await rpc('eth_getTransactionByHash', [res.hash]), recu = await rpc('eth_getTransactionReceipt', [res.hash]);
    const autre = CV.verifierRecu({ ...plan, wallet: NEUTRE }, tx, recu);
    t('the same real receipt judged for another wallet is refused (signed by)', !autre.ok && /signed by/.test(autre.ko.join(' ')));
  }
} finally {
  await rpc('evm_revert', [snap]).catch(() => {});
}
console.log('\n' + ok + ' ok, ' + ko + ' KO (fork ' + FORK + ')');
process.exit(ko ? 1 : 0);
