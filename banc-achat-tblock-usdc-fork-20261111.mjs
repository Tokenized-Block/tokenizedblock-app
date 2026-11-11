/* banc-achat-tblock-usdc-fork-20261111.mjs — game358: the buy that follows a USDC mint, end to end, on a LOCAL FORK only.
 *
 * The page's path, step by step: AT.montantAchat(5 USDC) -> AT.urlPlanAchat -> THIS repo's server (/api/rails/plan, test mode on the
 *   fork) -> AT.verifierPlanAchat (the page refuses anything else) -> the plan's calls sent in order from the payer -> balances read.
 * ASSERTS: the leg = 0.50 USDC; the plan passes the page's check; every call status 0x1; the payer spent EXACTLY 0.50 USDC; the payer
 *   received the REAL TBLOCK (0xb200…830e) >= the plan's minimum; the old test TBLOCK did not move; nothing stays in either router;
 *   NEGATIVE WITNESS: a plan whose recoitDevise is swapped to the old TBLOCK is refused by the same check.
 * MEASURES: TBLOCK received per 0.50 USDC, its $ value at the mid price read BEFORE the trade, gas.
 * DOES NOT PROVE: a real wallet's batch (calls go one by one from an impersonated account), nor mainnet, nor the TAM mint itself
 *   (TamArt is unchanged; its own benches cover it).
 * Usage: FOUNDRY_BASE=true base-anvil --base --fork-url https://mainnet.base.org --port 8659 ; node banc-achat-tblock-usdc-fork-20261111.mjs [url]
 * Nothing touches mainnet; everything is undone by evm_revert at the end. */
import { lecteurFork, ouvrirFork, demarrerServeur, financer, compteNeuf, solde, USDC, pause } from './outils-essai-fork.mjs';
import { tblockUsdAt, WTCOIN } from './tblock-hold.js';
import { TBLOCK_TEST_ANCIEN } from './tokenomics.js';
import { UNIVERSAL_ROUTER } from './tblock-route.js';
import { ROUTEUR_AERO_NOUVEAU } from './liquidite-actions.js';
import { PRIX_TAM } from './tam-plan.js';
import * as AT from './achat-tblock-usdc.js';

const URL_FORK = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:8659';
const REEL = '0xb200000000000000000000ba9bf8330307f8830e', VIEUX = TBLOCK_TEST_ANCIEN.toLowerCase(), W = WTCOIN.toLowerCase();
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (!c) ko += 1; console.log((c ? 'ok  ' : 'KO  ') + m); return c; };
const rpc = lecteurFork(URL_FORK);
const session = await ouvrirFork(rpc);
console.log('fork ' + URL_FORK + ' · ' + session.client + ' · block ' + session.tete);
let srv = null;
try {
  srv = await demarrerServeur({ rpcEssai: URL_FORK });
  const compte = compteNeuf('a358');
  await financer(rpc, compte, { ethWei: 10n ** 17n, usdc: 5n * 10n ** 6n });
  await rpc('anvil_impersonateAccount', [compte]);
  const lire = (to, data) => rpc('eth_call', [{ to, data }, 'latest']);
  const prix = await tblockUsdAt({ lire, bloc: session.tete });

  const montant = AT.montantAchat(PRIX_TAM);
  ok(montant === 500_000n, 'the leg after a 5 USDC TAM mint = ' + montant + ' raw = 0.50 USDC');
  const url = AT.urlPlanAchat({ montant, compte });
  const p = await fetch(srv.url + url).then((r) => r.json());
  const v = AT.verifierPlanAchat(p, { montant });
  ok(v.ok, 'the server plan passes the page check' + (v.ok ? ' (minimum ' + v.recoitAuMoins + ')' : ' — ' + v.pourquoi));
  if (v.ok) {
    const truque = { ...p, resume: { ...p.resume, recoitDevise: VIEUX } };
    ok(!AT.verifierPlanAchat(truque, { montant }).ok, 'NEGATIVE WITNESS: the same plan pointing at the old TBLOCK is refused');
    const avant = { u: await solde(rpc, USDC, compte), t: await solde(rpc, REEL, compte), v: await solde(rpc, VIEUX, compte),
      urT: await solde(rpc, REEL, UNIVERSAL_ROUTER), urW: await solde(rpc, W, UNIVERSAL_ROUTER), aeU: await solde(rpc, USDC, ROUTEUR_AERO_NOUVEAU) };
    let gas = 0n, tous = true;
    for (const c of v.appels) {
      const h = await rpc('eth_sendTransaction', [{ from: compte, to: c.to, data: c.data, value: c.value || '0x0', gas: '0x' + (3000000).toString(16) }]);
      let r = null; for (let i = 0; i < 100 && !r; i += 1) { r = await rpc('eth_getTransactionReceipt', [h]); if (!r) await pause(100); }
      gas += BigInt(r.gasUsed); if (r.status !== '0x1') tous = false;
    }
    ok(tous, v.appels.length + '/' + v.appels.length + ' calls status 0x1 (gas ' + gas + ')');
    const apres = { u: await solde(rpc, USDC, compte), t: await solde(rpc, REEL, compte), v: await solde(rpc, VIEUX, compte),
      urT: await solde(rpc, REEL, UNIVERSAL_ROUTER), urW: await solde(rpc, W, UNIVERSAL_ROUTER), aeU: await solde(rpc, USDC, ROUTEUR_AERO_NOUVEAU) };
    const recu = apres.t - avant.t;
    ok(avant.u - apres.u === montant, 'the payer spent exactly ' + (avant.u - apres.u) + ' USDC units (fee included in the 0.50)');
    ok(recu >= v.recoitAuMoins && recu > 0n, 'the payer received ' + recu + ' REAL TBLOCK >= minimum ' + v.recoitAuMoins);
    ok(apres.v === avant.v, 'the old test TBLOCK did not move');
    ok(apres.urT === avant.urT && apres.urW === avant.urW && apres.aeU === avant.aeU, 'nothing left in the Universal Router or the Aerodrome router');
    console.log('    MEASURED: 0.50 USDC -> ' + (Number(recu) / 1e18).toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' TBLOCK = $'
      + (Number(recu) / 1e18 * prix.usd).toFixed(4) + ' at the mid price before the trade (1 TBLOCK = $' + prix.usd.toPrecision(6) + '); gas ' + gas);
  }
} catch (e) {
  ok(false, 'bench stopped: ' + String((e && e.message) || e).slice(0, 300));
} finally {
  if (srv) await srv.arreter();
  console.log('evm_revert: ' + await session.rendre());
}
console.log('\n' + (n - ko) + '/' + n + (ko ? ' — RED' : ' ok'));
process.exit(ko ? 1 : 0);
