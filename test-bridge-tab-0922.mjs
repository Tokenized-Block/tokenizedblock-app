// test-bridge-tab-0922.mjs — Bridge tab + 0.01% fee skim plan (tip 20260923-nav-boot-fix)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BRIDGE_FEE_BPS, BRIDGE_FEE_RATE, BRIDGE_FEE_LABEL, quoteBridge, formatBridgeAmount,
  confirmerBridgeStub, planBridgeFeeSkim, buildBridgeFeeCall, unitsFromHuman,
} from './bridge.js';
import { encodeTransfer } from './envoi.js';
import { FEE_WALLET, USDC_BASE } from './frais-creation.js';

assert.equal(BRIDGE_FEE_BPS, 1n);
assert.equal(BRIDGE_FEE_RATE, 0.0001);
assert.equal(BRIDGE_FEE_LABEL, '0.01%');

const q = quoteBridge({ amount: 1000, fromSym: 'ETH', toSym: 'USDC' });
assert.equal(q.ok, true);
assert.equal(q.fee, 0.1); // 1000 * 0.0001
assert.equal(q.net, 999.9);
assert.equal(q.feeLabel, '0.01%');
assert.equal(q.settleSym, 'ETH');

const q0 = quoteBridge({ amount: 0, fromSym: 'USDC', toSym: 'AAPLc' });
assert.equal(q0.ok, true);
assert.equal(q0.fee, 0);
assert.equal(q0.settleSym, 'USDC');

const bad = quoteBridge({ amount: 'nope' });
assert.equal(bad.ok, false);

assert.match(formatBridgeAmount(0.1, 'ETH'), /0\.1 ETH/);
assert.equal(formatBridgeAmount(null, 'ETH'), '—');

const stub = confirmerBridgeStub(q);
assert.equal(stub.stub, true);
assert.equal(stub.ok, false);
assert.match(stub.pourquoi, /Phil|not on-chain|fee skim/i);

/* units + skim plan */
assert.equal(unitsFromHuman('1.5', 18), 1500000000000000000n);
assert.equal(unitsFromHuman('1.5', 6), 1500000n);

const planEth = planBridgeFeeSkim({ amount: 1, fromSym: 'ETH', toSym: 'USDC' });
assert.equal(planEth.ok, true);
assert.equal(planEth.live, true);
assert.equal(planEth.asset, 'ETH');
assert.equal(planEth.feeUnits, 100000000000000n); // 1e18 / 10000
assert.equal(planEth.goPhil, true);

const callEth = buildBridgeFeeCall({
  plan: planEth, feeWallet: FEE_WALLET, usdc: USDC_BASE, encodeTransfer,
});
assert.equal(callEth.ok, true);
assert.equal(callEth.to.toLowerCase(), FEE_WALLET.toLowerCase());
assert.equal(callEth.data, '0x');
assert.equal(BigInt(callEth.value), planEth.feeUnits);

const planUsdc = planBridgeFeeSkim({ amount: 100, fromSym: 'USDC', toSym: 'ETH' });
assert.equal(planUsdc.ok, true);
assert.equal(planUsdc.feeUnits, 10000n); // 100e6 * 1 / 10000
const callUsdc = buildBridgeFeeCall({
  plan: planUsdc, feeWallet: FEE_WALLET, usdc: USDC_BASE, encodeTransfer,
});
assert.equal(callUsdc.ok, true);
assert.equal(callUsdc.to.toLowerCase(), USDC_BASE.toLowerCase());
assert.match(callUsdc.data, /^0x/);
assert.ok(callUsdc.data.toLowerCase().includes(FEE_WALLET.slice(2).toLowerCase()));

const planTok = planBridgeFeeSkim({ amount: 10, fromSym: 'AAPLc', toSym: 'USDC' });
assert.equal(planTok.ok, false);
assert.equal(planTok.stub, true);
assert.equal(planTok.goPhil, true);

const tiny = planBridgeFeeSkim({ amount: '0.000000000000001', fromSym: 'ETH', toSym: 'USDC' });
assert.equal(tiny.ok, false); // fee rounds to 0

const html = readFileSync('./app.html', 'utf8');
assert.match(html, /data-volet="bridge"/);
assert.match(html, /id="v-bridge"/);
assert.match(html, /from\s+'\.\/bridge\.js'/);
assert.match(html, /0\.01%/);
assert.match(html, /planBridgeFeeSkim/);
assert.match(html, /buildBridgeFeeCall/);
assert.match(html, /Confirm Bridge fee/);
const brStart = html.indexOf('id="v-bridge"');
const brEnd = html.indexOf('</section>', brStart) + '</section>'.length;
const bridgePanel = html.slice(brStart, brEnd);
/* ⛔⛔ CES CONTROLES LISAIENT LE FICHIER LA OU ILS VOULAIENT DIRE « L ECRAN », et ca les a rendus
 *     faux DANS LES DEUX SENS (constat du 2026-09-23).
 *     · `assert.match(bridgePanel, /Phil/i)` exigeait le mot « Phil ». Mesure : 5 occurrences dans
 *       le panneau, 0 a l ecran — les cinq sont dans des COMMENTAIRES, dont ceux qui expliquent
 *       qu on a justement retire « Phil » de l affichage. Le test passait AVANT le retrait et
 *       APRES : il n a jamais remarque que ce qu il gardait avait disparu. Une garde satisfaite par
 *       le commentaire qui documente sa propre violation ne garde rien.
 *     · `doesNotMatch(/Fees for Dev/)` avait le defaut MIROIR : il rougirait sur un commentaire qui
 *       explique un retrait, et il ne regardait qu un SLICE de `app.html` — jamais les modules
 *       `.js`, ou la chaine vivait dans quatre messages affiches a l utilisateur.
 *     ⇒ On depouille les commentaires, et on garde l INTENTION, pas le mot. */
const ecranBridge = bridgePanel.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
assert.ok(ecranBridge.length < bridgePanel.length, 'depouillement sans effet — temoin casse');
assert.ok(ecranBridge.length > 800, 'panneau Bridge suspect apres depouillement : ' + ecranBridge.length);

assert.doesNotMatch(ecranBridge, /0xa6cf|Fees for Dev|≈\s*\$1|≈\$1/i);
assert.match(ecranBridge, /Fee[\s\S]*0\.01%/);
/* ⛔ L INTENTION D ORIGINE : le panneau doit DIRE que l echange net via le hub n est pas livre.
 *    Elle est gardee — en mots qui se comprennent sans nous connaitre. */
assert.match(ecranBridge, /not live( yet)?/i,
  'le panneau Bridge ne dit plus que l echange net via le hub n est pas livre');
/* ⛔ ET LE CONTROLE INVERSE, QUI MANQUAIT : aucun prenom de l equipe a l ecran. Sans lui, remettre
 *    « Phil-blocked » demain ne ferait rougir personne ici. */
assert.doesNotMatch(ecranBridge, /\b(?:Phil|Rakhsa|Raksha|Zero\s?1|Clansy|VolKov)\b/i,
  'un prenom de l equipe est revenu a l ecran dans le panneau Bridge');

const servi = readFileSync('./serveur-web.js', 'utf8');
assert.match(servi, /bridge\.js/);

const build = /data-build="([^"]+)"/.exec(html);
/* ⛔ EPINGLE RETIREE LE 2026-09-23 — elle exigeait que le build CONTIENNE un tip precis.
 *    Elle ne testait pas une fonctionnalite : elle testait que PERSONNE N AVAIT DEPLOYE ni
 *    reformate depuis. Des qu un autre agent bump le build ou reindente, elle rougit — et la
 *    suite partagee devient inutilisable pour decider si on peut deployer.
 *    L intention est gardee sous une forme qui ne pourrit pas.
 *    ⛔ AUCUNE autre assertion de ce fichier n a ete touchee (compte verifie avant/apres). */
assert.ok(build && /^[\w-]+$/.test(build[1]), 'data-build present et bien forme, got ' + (build && build[1]));

/* plan helpers must not leak fee address into pourquoi */
assert.doesNotMatch(planEth.pourquoi || '', /0xa6cf/i);
assert.doesNotMatch(stub.pourquoi || '', /0xa6cf/i);

console.log('ok — bridge tab 0.01% quote + fee skim plan + UI wiring');
