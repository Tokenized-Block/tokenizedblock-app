// banc-buyback-vault-deploy-page-fork-20261112.mjs -- FORK ONLY. The deploy page's own logic (buyback-vault.js) against a local fork:
//   planDeploiement (simulation + gas, from the record's deployer, no signature), then the EXACT data sent from the deployer
//   IMPERSONATED ON THE FORK, then controleEnvoi + controleRuntime + verifierBuybackVault on the receipt. Prints the hash for the
//   verifier / noter CLIs. Refuses to run unless the node answers anvil_* methods. env FORK_URL (default http://127.0.0.1:9617).
import { planDeploiement, controleEnvoi, controleRuntime, verifierBuybackVault, fmtEth } from './buyback-vault.js';
import { BUYBACK_VAULT_DEPLOIEMENT as D } from './tblock-buyback-vault-deploiement.js';
const FORK = process.env.FORK_URL || 'http://127.0.0.1:9617';
const rpc = async (m, p) => { const j = await fetch(FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }) }).then((x) => x.json()); if (j.error) { const e = new Error(m + ': ' + JSON.stringify(j.error)); e.data = j.error.data; throw e; } return j.result; };
let ok = 0, ko = 0; const t = (n, c, x = '') => { if (c) { ok++; console.log('ok ', n, x); } else { ko++; console.log('RED', n, x); } };
await rpc('anvil_nodeInfo', []).catch(() => { console.error('not an anvil node: refused'); process.exit(2); });
console.log('fork block', BigInt(await rpc('eth_blockNumber', [])).toString());
/* anvil answers eth_gasPrice with its own default (about 1 gwei), not Base's: the plan reads the gas price Base serves now (read-only,
 *   https://mainnet.base.org), every other read goes to the fork */
const prixBase = await fetch('https://mainnet.base.org', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_gasPrice', params: [] }) }).then((x) => x.json()).then((j) => j.result);
console.log('Base eth_gasPrice now', BigInt(prixBase).toString(), 'wei');
const rpcPlan = (m, q) => (m === 'eth_gasPrice' ? Promise.resolve(prixBase) : rpc(m, q));
const p = await planDeploiement(D, rpcPlan, D.deployeur);
t('plan: ready from the record deployer', p.pret === true, p.raison);
t('plan: refuses another wallet', (await planDeploiement(D, rpcPlan, D.parametres.guardian)).pret === false);
if (!p.pret) process.exit(1);
console.log('gas estimated', p.gas.toString(), 'gas price', p.prix.toString(), 'wei', 'cost', fmtEth(p.cout), 'deployer balance', fmtEth(p.solde), 'predicted', p.adressePrevue);
await rpc('anvil_impersonateAccount', [D.deployeur]);
const h = await rpc('eth_sendTransaction', [{ from: D.deployeur, data: p.data, gas: '0x' + p.gasEnvoi.toString(16), value: '0x0', maxFeePerGas: '0x' + (2n * BigInt(prixBase)).toString(16), maxPriorityFeePerGas: '0x' + (BigInt(prixBase) / 10n).toString(16) }]); /* the real deployer balance on the fork: a fee near Base's */
await rpc('anvil_stopImpersonatingAccount', [D.deployeur]);
let recu = null; for (let k = 0; k < 40 && !recu; k++) { recu = await rpc('eth_getTransactionReceipt', [h]).catch(() => null); if (!recu) { await rpc('evm_mine', []).catch(() => null); await new Promise((o) => setTimeout(o, 500)); } }
const tx = await rpc('eth_getTransactionByHash', [h]);
t('receipt status 1', recu && recu.status === '0x1', recu && recu.status);
t('gas used', !!recu, recu && BigInt(recu.gasUsed).toString());
t('at the predicted address', recu && recu.contractAddress.toLowerCase() === p.adressePrevue, recu && recu.contractAddress);
const ke = controleEnvoi(D, D.deployeur, tx, recu);
t('controleEnvoi: nothing wrong', ke.length === 0, ke.join(' | '));
const kr = await controleRuntime(D, await rpc('eth_getCode', [recu.contractAddress, 'latest']));
t('controleRuntime: the frozen build', kr.length === 0, kr.join(' | '));
const v = await verifierBuybackVault(D, h, rpc);
for (const l of v.lignes) if (!l.ok) console.log('   KO', l.quoi, l.vu);
t('verifierBuybackVault: all ' + v.lignes.length + ' lines hold', v.ok);
const v2 = await verifierBuybackVault(D, h, rpc, { keeper: D.parametres.guardian });
t('verifierBuybackVault: a wrong expected keeper fails', v2.ok === false && v2.lignes.filter((l) => !l.ok).length === 1 && /KEEPER/.test(v2.lignes.find((l) => !l.ok).quoi));
t('plan after the deploy: the wallet nonce moved, a second plan predicts another address', (await planDeploiement(D, rpcPlan, D.deployeur)).adressePrevue !== p.adressePrevue);
console.log('HASH', h);
console.log(ko ? 'RED ' + ko + ' / ' + (ok + ko) : 'GREEN ' + ok + '/' + ok);
process.exit(ko ? 1 : 0);
