/* banc-etape1-achat-fork-20261110.mjs — game338 STEP 1 of a birth: buy the TBLOCK part with ETH BEFORE the birth, the TBLOCK stays in the
 * buyer's wallet (GET /api/tblock/vault-buy?garder=1), through the app's own server, on a LOCAL FORK only. Then STEP 3 (the transfer the
 * app builds with create-vault-tip.js) pays the vault from that balance.
 * ASSERTS: keep-plan PRET; NO call goes to the vault and no transfer is in it; every call status 0x1; the buyer receives >= the plan's
 *   minimum; the vault is unchanged after step 1; no app fee; with the ETH sized by ethWeiForTblock (+4 %) the buyer holds AT LEAST the
 *   TBLOCK part the app will ask at step 3; step 3 = TIP.plan's ONE transfer, the vault receives exactly that amount.
 * DOES NOT PROVE: the birth itself between step 1 and step 3 (its own fork benches), nor a real wallet, nor mainnet.
 * Usage: node banc-etape1-achat-fork-20261110.mjs [http://127.0.0.1:8659]. Everything is undone by evm_revert at the end. */
import { lecteurFork, ouvrirFork, demarrerServeur, financer, compteNeuf, solde, ETH, USDC, FRAIS, pause } from './outils-essai-fork.mjs';
import { TBLOCK } from './tblock-hold.js';
import * as TIP from './create-vault-tip.js';

const URL_FORK = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:8659';
const T = TBLOCK.toLowerCase(), V = TIP.VAULT; /* task 377: the live holders vault step 3 pays */
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (!c) ko += 1; console.log((c ? 'ok  ' : 'KO  ') + m); return c; };
const rpc = lecteurFork(URL_FORK);
const session = await ouvrirFork(rpc);
let srv = null;
const envoyer = async (compte, c) => {
  let gas = 3000000n;
  try { gas = BigInt(await rpc('eth_estimateGas', [{ from: compte, to: c.to, data: c.data, value: c.value }])) * 13n / 10n; } catch (_) { /* sent anyway */ }
  const h = await rpc('eth_sendTransaction', [{ from: compte, to: c.to, data: c.data, value: c.value, gas: '0x' + gas.toString(16) }]);
  let r = null; for (let i = 0; i < 100 && !r; i += 1) { r = await rpc('eth_getTransactionReceipt', [h]); if (!r) await pause(200); }
  return r;
};
try {
  srv = await demarrerServeur({ rpcEssai: URL_FORK });
  const compte = compteNeuf('7b39');
  await financer(rpc, compte, { ethWei: 10n ** 17n, usdc: 0n });
  await rpc('anvil_impersonateAccount', [compte]);
  /* the prices the app uses: TBLOCK from the server, ETH fixed here (the fork has no oracle for the app) */
  const h = await fetch(srv.url + '/api/tblock/hold').then((r) => r.json());
  const px = Number(h.priceNow), ethUsd = 2090;
  ok(px > 0, 'TBLOCK price served on the fork: $' + px);
  const part = TIP.plan({ ethUsd, tblockUsd: px, balance: 10n ** 40n });
  ok(part.ok, 'the TBLOCK part the app will ask at step 3: ' + part.amount + ' wei');
  const wei = TIP.ethWeiForTblock({ tblock: part.amount, tblockUsd: px, ethUsd });
  ok(wei > 0n, 'step 1 ETH (ethWeiForTblock, +4 %): ' + wei);
  const p = await fetch(srv.url + '/api/tblock/vault-buy?garder=1&compte=' + compte + '&eth=' + wei).then((r) => r.json());
  if (!ok(p.ok && p.etat === 'PRET', 'keep-plan ' + p.etat + (p.pourquoi ? ' — ' + p.pourquoi : ''))) throw new Error('no plan');
  ok(!p.appels.some((c) => c.to.toLowerCase() === V || c.data.toLowerCase().includes(V.slice(2))), 'no call names the vault in step 1');
  ok(String(p.resume.fraisBps) === '0' && p.resume.garde === true, 'no app fee, marked as a keep plan');
  const v0 = await solde(rpc, T, V), f0 = await solde(rpc, ETH, FRAIS), f0u = await solde(rpc, USDC, FRAIS);
  for (const c of p.appels) { const r = await envoyer(compte, c); ok(r && r.status === '0x1', 'status 1: ' + c.role); }
  const bal = await solde(rpc, T, compte);
  ok(bal >= BigInt(p.resume.recoitAuMoins), 'the buyer received >= the minimum: ' + bal);
  ok((await solde(rpc, T, V)) === v0, 'the vault is unchanged after step 1');
  ok((await solde(rpc, ETH, FRAIS)) === f0 && (await solde(rpc, USDC, FRAIS)) === f0u, 'no app fee reached the fee wallet');
  ok(bal >= part.amount, 'the +4 % buffer covers the step 3 part: holds ' + bal + ' >= ' + part.amount);
  /* step 3: exactly what the app builds after the birth */
  const q3 = TIP.plan({ ethUsd, tblockUsd: px, balance: bal });
  ok(q3.ok, 'step 3 plan ok with the bought balance');
  const r3 = await envoyer(compte, q3.call);
  ok(r3 && r3.status === '0x1', 'step 3 transfer status 1');
  ok((await solde(rpc, T, V)) - v0 === q3.amount, 'the vault received exactly the step 3 amount: ' + q3.amount);
} catch (e) { ok(false, 'bench stopped: ' + String((e && e.message) || e).slice(0, 200)); }
finally {
  if (srv) await srv.arreter();
  await session.rendre();
}
console.log((ko === 0 ? 'GREEN ' : 'RED ') + (n - ko) + '/' + n);
process.exit(ko === 0 ? 0 : 1);
