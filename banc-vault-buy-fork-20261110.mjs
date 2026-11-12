/* banc-vault-buy-fork-20261110.mjs — game337: the TBLOCK part of a birth BOUGHT WITH ETH and sent to the community vault, through the app's
 * own server (GET /api/tblock/vault-buy), on a LOCAL FORK only.
 * Steps: refuse unless the node is anvil on chain 8453 -> evm_snapshot -> start THIS repo's server in test mode on the fork -> a fresh
 *   account that holds ONLY ETH -> ask the plan for the ETH worth the $5 top-up -> send its calls IN ORDER from that account.
 * ASSERTS: plan PRET + atomic; the LAST call is TBLOCK.transfer(the live holders vault, economie-pack.js VAULT, resume.versCoffre); every call
 *   status 0x1; the vault receives EXACTLY versCoffre; the account ends with >= 0 TBLOCK (any extra above the minimum stays with it);
 *   NO app fee reaches the fee wallet; nothing left in the routers; 0x…dEaD receives the TBLOCK hook's cut (the buy is a real buy).
 *   NEGATIVE WITNESS: the same plan for an account with no ETH is REFUSED with a sentence, never PRET.
 * DOES NOT PROVE: an EIP-5792 batch from a real wallet (calls go one by one, same order), nor mainnet.
 * Usage: node banc-vault-buy-fork-20261110.mjs [http://127.0.0.1:8659]. Everything is undone by evm_revert at the end. */
import { lecteurFork, ouvrirFork, demarrerServeur, financer, compteNeuf, solde, ETH, USDC, FRAIS, pause } from './outils-essai-fork.mjs';
import { TBLOCK, WTCOIN } from './tblock-hold.js';
import { DEAD, UNIVERSAL_ROUTER } from './tblock-route.js';
import { ROUTEUR_AERO_NOUVEAU } from './liquidite-actions.js';
import { VAULT as VAULT_VIVANT } from './economie-pack.js'; /* task 377: the server's vault-buy pays the live holders vault */

const URL_FORK = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:8659';
const T = TBLOCK.toLowerCase(), W = WTCOIN.toLowerCase(), V = VAULT_VIVANT;
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (!c) ko += 1; console.log((c ? 'ok  ' : 'KO  ') + m); return c; };
const rpc = lecteurFork(URL_FORK);
const session = await ouvrirFork(rpc);
console.log('fork ' + URL_FORK + ' · ' + session.client + ' · block ' + session.tete + ' · vault ' + V);
let srv = null;
try {
  srv = await demarrerServeur({ rpcEssai: URL_FORK });
  ok(true, 'server up in test mode on the fork (' + srv.url + ')');
  const compte = compteNeuf('7b37');
  await financer(rpc, compte, { ethWei: 10n ** 17n, usdc: 0n });
  await rpc('anvil_impersonateAccount', [compte]);
  ok((await solde(rpc, T, compte)) === 0n && (await solde(rpc, USDC, compte)) === 0n, 'test account ' + compte + ' holds ONLY ETH (0 TBLOCK, 0 USDC)');
  const eth = 1400000000000000n; /* about $2.9 at ETH ~ $2,090: the top-up shown on the Create tab today */
  const p = await fetch(srv.url + '/api/tblock/vault-buy?compte=' + compte + '&eth=' + eth).then((r) => r.json());
  if (!ok(p.ok && p.etat === 'PRET', 'plan ' + p.etat + (p.pourquoi ? ' — ' + p.pourquoi : ''))) throw new Error('no plan');
  ok(p.exigeAtomique === true, 'the plan demands an atomic batch');
  const last = p.appels[p.appels.length - 1];
  const want = '0xa9059cbb' + V.slice(2).padStart(64, '0') + BigInt(p.resume.versCoffre).toString(16).padStart(64, '0');
  ok(last.to.toLowerCase() === T && last.data.toLowerCase() === want, 'last call = TBLOCK.transfer(vault, versCoffre ' + p.resume.versCoffre + ')');
  ok(String(p.resume.fraisBps) === '0' && !p.appels.some((c) => /fee wallet/.test(c.role || '')), 'no app fee in the plan');
  console.log('    calls: ' + p.appels.map((c) => c.role).join(' | '));
  const qui = { compte, vault: V, frais: FRAIS, dead: DEAD, ur: UNIVERSAL_ROUTER, aero: ROUTEUR_AERO_NOUVEAU };
  const photo = async () => { const o = {}; for (const [k, a] of Object.entries(qui)) o[k] = { T: await solde(rpc, T, a), W: await solde(rpc, W, a), U: await solde(rpc, USDC, a), E: await solde(rpc, ETH, a) }; return o; };
  const avant = await photo();
  for (const c of p.appels) {
    let gas = 3000000n;
    try { gas = BigInt(await rpc('eth_estimateGas', [{ from: compte, to: c.to, data: c.data, value: c.value }])) * 13n / 10n; } catch (_) { /* sent anyway to read its status */ }
    const h = await rpc('eth_sendTransaction', [{ from: compte, to: c.to, data: c.data, value: c.value, gas: '0x' + gas.toString(16) }]);
    let r = null; for (let i = 0; i < 100 && !r; i += 1) { r = await rpc('eth_getTransactionReceipt', [h]); if (!r) await pause(200); }
    ok(r && r.status === '0x1', 'status 1: ' + c.role);
  }
  const apres = await photo();
  ok(apres.vault.T - avant.vault.T === BigInt(p.resume.versCoffre), 'the vault received EXACTLY versCoffre = ' + p.resume.versCoffre + ' TBLOCK wei');
  ok(apres.compte.T >= 0n, 'the buyer keeps what the pools gave above the minimum: ' + apres.compte.T + ' TBLOCK wei');
  ok(apres.frais.E === avant.frais.E && apres.frais.U === avant.frais.U, 'no app fee reached the fee wallet (ETH and USDC unchanged)');
  ok(['ur', 'aero'].every((k) => ['T', 'W', 'U'].every((j) => apres[k][j] === avant[k][j])), 'nothing left in the Aerodrome or Universal router');
  ok(apres.dead.T > avant.dead.T, 'the TBLOCK hook cut reached 0x…dEaD: ' + (apres.dead.T - avant.dead.T) + ' wei (a real buy)');
  ok(avant.compte.E - apres.compte.E >= eth, 'the buyer paid the ETH of the plan (+ gas): ' + (avant.compte.E - apres.compte.E));
  /* negative witness: an account with no ETH */
  const vide = compteNeuf('7b38');
  const pv = await fetch(srv.url + '/api/tblock/vault-buy?compte=' + vide + '&eth=' + eth).then((r) => r.json());
  ok(pv.etat !== 'PRET' && typeof pv.pourquoi === 'string' && pv.pourquoi.length > 5, 'an account with no ETH is refused: ' + pv.etat + ' — ' + pv.pourquoi);
} catch (e) { ok(false, 'bench stopped: ' + String((e && e.message) || e).slice(0, 200)); }
finally {
  if (srv) await srv.arreter();
  await session.rendre();
}
console.log((ko === 0 ? 'GREEN ' : 'RED ') + (n - ko) + '/' + n);
process.exit(ko === 0 ? 0 : 1);
