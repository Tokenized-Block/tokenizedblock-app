/* test-close-keeper.mjs — close-keeper.js, pure parts and its refusals.
 * AFFIRME: R/R2 periods close only in order, after end + grace + margin; V closes the oldest finished open week after end + margin;
 *   verifierEnvoi refuses any other target, selector, value, chain, gas or fee; the keeper is OFF without a key, with a key that is not
 *   the named keeper, or with no target; the selector is closeEpoch(uint256) as compiled in V, R and R2.
 * NE PROUVE PAS: the chain (banc-close-keeper-fork does). */
import { readFileSync } from 'node:fs';
import * as K from './close-keeper.js';
let ok = 0, ko = 0;
const t = (m, c, vu = '') => { if (c) ok++; else { ko++; console.log('KO', m, vu); } };
const ids = (n) => new Set(Object.values(JSON.parse(readFileSync(new URL('./contracts/out/' + n + '.sol/' + n + '.json', import.meta.url))).methodIdentifiers || {}));
for (const n of ['TBlockVaultV2', 'TBlockLockRewards', 'TBlockLockRewardsWeekly']) t('closeEpoch(uint256) is in ' + n, ids(n).has(K.SEL_CLOSE.slice(2)));
const o = { prochain: 2n, courant: 3n, fin: 1000n, graceS: 86400n, margeS: 3600n };
t('R2: before end + grace + margin -> wait', K.deciderEnOrdre({ ...o, maintenantS: 1000n + 86400n + 3599n }).appeler === false);
t('R2: at end + grace + margin -> close period 2', K.deciderEnOrdre({ ...o, maintenantS: 1000n + 86400n + 3600n }).periode === 2n);
t('R2: the current period is never closed', K.deciderEnOrdre({ ...o, courant: 2n, maintenantS: 10n ** 12n }).appeler === false);
t('R: no grace, margin only', K.deciderEnOrdre({ ...o, graceS: 0n, maintenantS: 4600n }).appeler === true && K.deciderEnOrdre({ ...o, graceS: 0n, maintenantS: 4599n }).appeler === false);
const sem = [{ e: 5n, ferme: true, fin: 100n }, { e: 7n, ferme: false, fin: 300n }, { e: 6n, ferme: false, fin: 200n }];
t('V: the oldest open finished week (6, not 7)', K.deciderV({ semaines: sem, maintenantS: 10n ** 9n, margeS: 3600n }).periode === 6n);
t('V: margin not passed for the oldest -> wait', K.deciderV({ semaines: sem, maintenantS: 200n + 3599n, margeS: 3600n }).appeler === false);
t('V: all closed -> nothing', K.deciderV({ semaines: [{ e: 1n, ferme: true, fin: 0n }], maintenantS: 10n ** 9n, margeS: 0n }).appeler === false);
const A = '0x' + '11'.repeat(20), B = '0x' + '22'.repeat(20), X = '0x' + '33'.repeat(20);
const tx = { to: A, value: 0n, chainId: 8453, data: K.donneesClose(4n), gas: 100000n, maxFeePerGas: 1000n };
const refuse = (m) => { try { K.verifierEnvoi({ ...tx, ...m }, { cibles: [A, B], chainId: 8453 }); return false; } catch (_) { return true; } };
t('admitted: closeEpoch(4) to a target', !refuse({}));
t('refused: another address', refuse({ to: X }));
t('refused: value', refuse({ value: 1n }));
t('refused: other chain', refuse({ chainId: 1 }));
t('refused: another selector', refuse({ data: '0xa9059cbb' + '0'.repeat(64) }));
t('refused: extra bytes', refuse({ data: K.donneesClose(4n) + '00' }));
t('refused: gas above the cap', refuse({ gas: K.BORNES_DEFAUT.gasMaxParTx + 1n }));
t('refused: fee above the cap', refuse({ maxFeePerGas: K.BORNES_DEFAUT.maxFeeWei + 1n }));
const rpc = async () => '0x';
t('OFF without a key', K.creerKeeperClose({ vault: A, horloge: B, keeperAttendu: A, rpc }).etat().etat === 'OFF');
const cle = '0x' + '42'.repeat(32);
t('OFF with a key that is not the named keeper', /not the gas-only keeper/.test(K.creerKeeperClose({ cle, hebdo: A, keeperAttendu: X, rpc, chaine: 8453 }).etat().pourquoi));
t('OFF with no target', K.creerKeeperClose({ cle, keeperAttendu: X, rpc }).etat().etat === 'OFF');
t('the state never holds the key', !JSON.stringify(K.creerKeeperClose({ cle, hebdo: A, keeperAttendu: X, rpc }).etat()).includes('4242424242'));
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
