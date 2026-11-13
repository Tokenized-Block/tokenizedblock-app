/* banc-lock-weekly-fork-20261114.mjs -- sends EXACTLY the frozen data of lock-weekly-deploiement.js on a LOCAL Base fork (anvil :9549,
 *   the deployer impersonated THERE ONLY: anvil_impersonateAccount never exists on Base), through lock-weekly.js planDeploiement (the page's
 *   own plan), then runs verifierLockWeekly on the receipt.
 * AFFIRME: the frozen record deploys, gives the frozen runtime, and every on-chain check of the page holds on it.
 * NE PROUVE PAS: the mainnet transaction (Phil's go, Grok's wallet); the payout flow (contracts/test/lockrewards/Weekly.fork.t.sol). */
import { LOCK_WEEKLY_DEPLOIEMENT as REC0 } from './lock-weekly-deploiement.js';
import * as W from './lock-weekly.js';
const URL_ = process.env.FORK || 'http://127.0.0.1:9549';
let id = 0;
const rpc = async (method, params = []) => {
  const r = await fetch(URL_, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((x) => x.json());
  if (r.error) throw new Error(method + ': ' + (r.error.message || JSON.stringify(r.error)));
  return r.result;
};
let ok = 0, ko = 0;
const t = (m, c, vu = '') => { if (c) ok++; else { ko++; console.log('KO', m, vu); } };
const REC = REC0; /* Phil's go 2026-11-13 night, after the second review: the served record is ready */
t('served record is ready', REC0.pret === true);
t('record integrity', (await W.integrite(REC)).length === 0, (await W.integrite(REC)).join(', '));
const dep = REC.deployeur;
await rpc('anvil_impersonateAccount', [dep]);
await rpc('anvil_setBalance', [dep, '0x' + (10n ** 17n).toString(16)]);
const plan = await W.planDeploiement(REC, rpc, dep);
t('the page plan is ready on the fork', plan.pret === true, plan.raison);
if (plan.pret) {
  const h = await rpc('eth_sendTransaction', [{ from: dep, data: plan.data, gas: '0x' + plan.gasEnvoi.toString(16), value: '0x0' }]);
  let recu = null;
  for (let i = 0; i < 30 && !recu; i++) { recu = await rpc('eth_getTransactionReceipt', [h]); if (!recu) await new Promise((o) => setTimeout(o, 500)); }
  t('a receipt', !!recu);
  const res = await W.verifierLockWeekly(REC, h, rpc);
  for (const l of res.lignes) t('verifier: ' + l.quoi, l.ok, l.vu);
  t('deployed at the address the plan predicted', res.adresse === plan.adressePrevue, res.adresse + ' vs ' + plan.adressePrevue);
  console.log('deployed on the fork at', res.adresse, 'checks', res.lignes.length, 'gas', plan.gas.toString());
}
await rpc('anvil_stopImpersonatingAccount', [dep]);
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
