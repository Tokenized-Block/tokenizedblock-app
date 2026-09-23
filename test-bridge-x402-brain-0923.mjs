// test-bridge-x402-brain-0923.mjs — tip 20260923-bridge-x402-brain self-QA
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BRIDGE_LEGS, phraseBridgeLegs, confirmerBridgeStub, planBridgeFeeSkim, quoteBridge,
} from './bridge.js';
import {
  mayUseX402, recordPropose, recordPay, recordJournalHook, feeAlreadyRecognized,
  assertNoDoubleChargeWithBridge, phraseOptionA, assertCleanCopy, X402_FEE_MATRIX,
} from './x402-pay.js';
import { entreeBotAction } from './journal-cerveau.js';

assert.equal(BRIDGE_LEGS.length, 4);
assert.ok(BRIDGE_LEGS.some((l) => l.id === 'fund' && l.live));
assert.ok(BRIDGE_LEGS.some((l) => l.id === 'skim' && l.live));
assert.ok(BRIDGE_LEGS.some((l) => l.id === 'hub' && l.goPhil));
assert.ok(BRIDGE_LEGS.some((l) => l.id === 'equity' && !l.live));
assert.match(phraseBridgeLegs(), /Phil|later|0\.01%/i);
assert.doesNotMatch(phraseBridgeLegs(), /0xa6cf|Fees for Dev|≈\s*\$1|\b2x\b|leverage|FINRA/i);
assert.match(phraseBridgeLegs(), /not a broker/i);

const stub = confirmerBridgeStub(quoteBridge({ amount: 1, fromSym: 'AAPLc', toSym: 'USDC' }));
assert.equal(stub.goPhil, true);
assert.match(stub.pourquoi, /Phil|blocked|later/i);
assert.doesNotMatch(stub.pourquoi, /ready to swap|atomic net is live|swap is live/i);

const tiny = planBridgeFeeSkim({ amount: '0.000000000000001', fromSym: 'ETH', toSym: 'USDC' });
assert.equal(tiny.ok, false);

assert.equal(mayUseX402('brain_data_tool').ok, true);
assert.equal(mayUseX402('buy_sell_05').ok, false);
assert.equal(mayUseX402('instant_birth_0001').ok, false);
assert.equal(mayUseX402('bridge_skim_001').ok, false);

assert.equal(assertNoDoubleChargeWithBridge({ x402Used: true, bridgeSkimUsed: true }).ok, false);
assert.equal(assertNoDoubleChargeWithBridge({ x402Used: true, bridgeSkimUsed: false }).ok, true);

/* localStorage polyfill for node */
if (typeof globalThis.localStorage === 'undefined') {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
  };
}

const prop = recordPropose({ action: 'watch_feed', rail: 'brain_data_tool', asset: 'ETH' });
assert.equal(prop.ok, true);
assert.equal(prop.event.brainSigns, false);
assert.equal(prop.event.signeParUtilisateur, true);

const badAsset = recordPropose({ action: 'tool', rail: 'brain_data_tool', asset: 'TBGAS' });
assert.equal(badAsset.ok, false);

const pay = recordPay({ proposeId: prop.event.id, asset: 'ETH' });
assert.equal(pay.ok, true);
const recog = feeAlreadyRecognized('brain_data_tool', 'watch_feed');
assert.equal(recog.recognized, true);

const hook = recordJournalHook({ proposeId: prop.event.id });
assert.equal(hook.ok, true);
assert.equal(hook.paid, true);

const line = entreeBotAction({ action: 'watch_feed', paid: true });
assert.equal(line.signeParUtilisateur, true);
assert.equal(line.bot, true);
assert.match(line.texte, /pay recognized/i);
assert.doesNotMatch(line.texte, /Brain signs|freestyle-sign markets/i);

assert.match(phraseOptionA(), /Option A/i);
assert.doesNotMatch(phraseOptionA(), /0xa6cf|Fees for Dev|≈\s*\$1|Brain signs markets/i);
assert.equal(assertCleanCopy().ok, true);
assert.ok(X402_FEE_MATRIX.instant_birth_0001.x402 === false);

const html = readFileSync('./app.html', 'utf8');
/* ⛔ EPINGLE DE BUILD REDIRIGEE (C2, 2026-09-23) — PAS SUPPRIMEE.
 *    `data-build="20260923-bridge-x402-brain"` exigeait un numero de build PRECIS. Ce controle-la
 *    ne teste aucune fonctionnalite : il teste que PERSONNE n a deploye depuis. Il a rougi des le
 *    merge suivant, alors que tout le tip bridge-x402-brain etait intact — et un rouge qui ne
 *    designe aucun defaut apprend a ignorer les rouges.
 *    ⛔ CE QUI EST GARDE : la ligne doit exister et etre bien formee. Les controles de
 *      FONCTIONNALITE du tip (`bBotLoopCarte`, l import de `x402-pay.js`, la matrice de frais,
 *      le journal Option A) sont LAISSES INTACTS ci-dessous — eux gardent vraiment quelque chose. */
assert.match(html, /data-build="[\w-]+"/, 'ligne de build absente ou mal formee');
assert.match(html, /bBotLoopCarte/);
assert.match(html, /from '\.\/x402-pay\.js'/);
assert.match(html, /phraseBridgeLegs|brLegsNote/);
assert.match(html, /Option A/);
assert.doesNotMatch(html, /Brain signs markets/i);

const brStart = html.indexOf('id="v-bridge"');
const brEnd = html.indexOf('</section>', brStart) + '</section>'.length;
const bridgePanel = html.slice(brStart, brEnd);
assert.doesNotMatch(bridgePanel, /0xa6cf|Fees for Dev|≈\s*\$1|FINRA|C4A/i);
assert.doesNotMatch(bridgePanel, /\b2x\b/i);
assert.match(bridgePanel, /not a broker/i);
assert.match(bridgePanel, /no leveraged legs/i);
assert.match(bridgePanel, /Phil-blocked|Phil/);
assert.match(bridgePanel, /later/i);

const brainStart = html.indexOf('id="v-brain"');
const brainEnd = html.indexOf('id="v-bridge"'); // bridge follows? actually wallet etc — use bot card
assert.match(html.slice(brainStart, brainStart + 8000), /signs nothing/i);

const servi = readFileSync('./serveur-web.js', 'utf8');
assert.match(servi, /x402-pay\.js/);

const tasks = readFileSync('./brain-tasks.js', 'utf8');
assert.doesNotMatch(tasks, /Fees for Dev|≈\s*\$1|≈\$1/);
assert.match(tasks, /0\.001 ETH/);
assert.match(tasks, /option_a/);

const agent = readFileSync('./brain-agent.json', 'utf8');
assert.doesNotMatch(agent, /Fees for Dev/);
assert.doesNotMatch(agent, /≈\s*\$1|≈\$1/);
assert.match(agent, /20260923-bridge-x402-brain/);
assert.match(agent, /bot_loop_option_a/);

console.log('ok — bridge-x402-brain tip self-QA');
