/* test-payee-slot-20261112.mjs — the last step of the holders economy: the hook's current creator payee moves its 3400 bps slot to the
 *   lock rewards (R). payee-slot.js builds and judges it; deployer-economie-v2.html shows it and asks the payee's wallet to sign.
 * A  EXECUTED  the call: selector and data equal `cast calldata` (an independent encoder); the key hashes to the record's pool id (also
 *              equal to `cast keccak`); a key changed by one field breaks coherence (the check sees a wrong key).
 * B  EXECUTED  decoderPayees on exact, cut and malformed answers; etatSlot on every case.
 * C  EXECUTED  planDeplacement against a stub chain: ready ONLY for the payee on Base with R deployed and a passing simulation; refused for
 *              another wallet, another network, R without code, a hook without the function, a reverting simulation, a slot already at R
 *              (then "done"), a slot with another share or two payees. The simulation it sends is the exact call, from the payee.
 * D  EXECUTED  controleEnvoi: the exact call from the payee with status 1 passes; another sender, target, data, value or a failed status stops.
 * E  SOURCE    the page imports payee-slot.js in its own module, sends only plan.appel from the payee after a fresh plan, re-reads payees(key)
 *              after the receipt; payee-slot.js is served. PAYEE_SLOT_PAGE=<file> reads another page (red on the page without the step).
 * F  ON CHAIN  (both nodes, eth_call only; HORS_LIGNE=1 skips it and says so) the slot today: one payee, 3400 bps. If it is not R yet: the
 *              exact call simulated from that payee succeeds, the same call from the pack deployer reverts, and a wrong selector reverts
 *              from the payee (the simulation discriminates). If it is R: the step reads as done.
 * NE PROUVE PAS: the signature itself (nothing here signs or sends); what a swap pays after the move (the fork tests of the lock rewards).
 * The test counts itself and prints n/n. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import * as M from './payee-slot.js';
import { selecteur } from './keccak.js';
import { PACK_ECONOMIE_V2 as PACK } from './economie-v2-pack-deploiement.js';
import { ADRESSES_PACK_ECONOMIE_V2 as A } from './economie-v2-pack-deploye.js';

const ICI = dirname(fileURLToPath(import.meta.url));
const lire = (f) => { try { return readFileSync(f.includes(':') || f.startsWith('/') ? f : join(ICI, f), 'utf8').replace(/\r\n/g, '\n'); } catch (_) { return ''; } };
let n = 0, ko = 0;
const t = (label, cond) => { n += 1; if (cond === true) console.log('  ok   ' + label); else { ko += 1; console.log('  KO   ' + label); } };
const jette = (f) => { try { f(); return false; } catch (_) { return true; } };
const castOk = (() => { try { execFileSync('cast', ['--version'], { stdio: 'ignore' }); return true; } catch (_) { return false; } })();
const cast = (...a) => execFileSync('cast', a, { encoding: 'utf8' }).trim().toLowerCase();
const w = (x) => BigInt(x).toString(16).padStart(64, '0');
const wa = (a) => String(a).toLowerCase().replace(/^0x/, '').padStart(64, '0');

console.log('A the call');
const K = M.KEY;
const tuple = '(' + [K.currency0, K.currency1, K.fee, K.tickSpacing, K.hooks].join(',') + ')';
const appel = M.appelTransfert();
t('the key, the hook and R come from the records (P config v4Key, existants.v4Hooks, deployment record R)',
  K.hooks === PACK.existants.v4Hooks && M.HOOK === PACK.existants.v4Hooks && M.R === A.R && M.POOL_ID === PACK.existants.v4PoolId
  && K.currency0 === PACK.existants.wtcoin && K.currency1 === PACK.existants.tblock);
t('coherence holds on the records', M.coherence().length === 0);
t('a key changed by one field (fee 3001) breaks coherence', M.coherence({ key: { ...K, fee: 3001 } }).length > 0);
t('a key naming another hook breaks coherence', M.coherence({ key: { ...K, hooks: PACK.existants.lock } }).length > 0);
t('selectors are computed from the signatures', M.SEL_TRANSFER === selecteur(M.SIG_TRANSFER) && M.SEL_PAYEES === selecteur(M.SIG_PAYEES) && M.SEL_TRANSFER !== M.SEL_PAYEES);
/* the signatures equal the interface the fork tests call on the REAL hook (an independent source: struct PoolKey + IHookF there) */
const FORK = lire('contracts/test/lockrewards/TBlockLockRewards.fork.t.sol');
const pk = (FORK.match(/struct PoolKey \{([^}]*)\}/) || [])[1] || '';
const typesPk = '(' + [...pk.matchAll(/(\w+)\s+\w+;/g)].map((m) => m[1]).join(',') + ')';
t('witness: the fork test interface was read', typesPk.split(',').length === 5 && FORK.includes('function transferPayeeSlot(PoolKey calldata key, address to) external;')
  && FORK.includes('function payees(PoolKey calldata key) external view returns (Payee[] memory);'));
t('SIG_TRANSFER / SIG_PAYEES == the fork test interface', M.SIG_TRANSFER === 'transferPayeeSlot(' + typesPk + ',address)' && M.SIG_PAYEES === 'payees(' + typesPk + ')');
t('the call: to = hook, value 0, data = selector + 5 key words + R (4 + 6 x 32 bytes)', appel.to === M.HOOK && appel.value === '0x0'
  && appel.data.length === 2 + 8 + 6 * 64 && appel.data.endsWith(wa(M.R)) && appel.data.startsWith(M.SEL_TRANSFER));
if (castOk) {
  t('data == cast calldata (independent encoder)', appel.data === cast('calldata', M.SIG_TRANSFER, tuple, M.R));
  t('pool id == cast keccak(abi.encode(key))', M.poolIdDe(K) === cast('keccak', cast('abi-encode', 'f((address,address,uint24,int24,address))', tuple)));
  t('payees read == cast calldata', M.lecturePayees().data === cast('calldata', M.SIG_PAYEES, tuple));
} else console.log('  --   cast not found: the independent-encoder checks are SKIPPED (not counted)');
t('a negative tickSpacing encodes as two\'s complement (int24)', M.motsCle({ ...K, tickSpacing: -60 }).slice(192, 256) === (2n ** 256n - 60n).toString(16));
t('a bad address throws', jette(() => M.appelTransfert('0x1234')));

console.log('B decoding');
const OLD = '0x' + 'e7'.repeat(20), OTHER = '0x' + 'ab'.repeat(20);
const rep = (list) => '0x' + w(32) + w(list.length) + list.map(([a, b]) => wa(a) + w(b)).join('');
t('one payee decodes', JSON.stringify(M.decoderPayees(rep([[OLD, 3400]]))) === JSON.stringify([{ to: OLD, shareBps: 3400 }]));
t('two payees decode', M.decoderPayees(rep([[OLD, 3400], [OTHER, 100]])).length === 2);
t('a cut answer throws (never read as "no payee")', jette(() => M.decoderPayees(rep([[OLD, 3400]]).slice(0, -64))) && jette(() => M.decoderPayees('0x')));
t('a wrong offset throws', jette(() => M.decoderPayees('0x' + w(64) + w(1) + wa(OLD) + w(3400))));
t('a share over uint16 throws', jette(() => M.decoderPayees(rep([[OLD, 70000]]))));
t('etatSlot: one payee, 3400, not R -> a-deplacer', M.etatSlot([{ to: OLD, shareBps: 3400 }]).etat === 'a-deplacer');
t('etatSlot: R holds 3400 -> fait', M.etatSlot([{ to: M.R, shareBps: 3400 }]).etat === 'fait');
t('etatSlot: another share -> inattendu', M.etatSlot([{ to: OLD, shareBps: 3000 }]).etat === 'inattendu');
t('etatSlot: two payees or none -> inattendu', M.etatSlot([{ to: OLD, shareBps: 3400 }, { to: OTHER, shareBps: 1 }]).etat === 'inattendu' && M.etatSlot([]).etat === 'inattendu');

console.log('C the plan, on a stub chain');
function chaine({ id = '0x2105', payees = [[OLD, 3400]], codeR = '0x60', codeHook = '0x60' + M.SEL_TRANSFER.slice(2), simule = 'ok' } = {}) {
  const vus = [];
  const rpc = async (m, p) => {
    vus.push([m, p]);
    if (m === 'eth_chainId') return id;
    if (m === 'eth_getCode') return p[0] === M.R ? codeR : p[0] === M.HOOK ? codeHook : '0x';
    if (m === 'eth_call' && p[0].data === M.lecturePayees().data && !p[0].from) return rep(payees);
    if (m === 'eth_call' && p[0].data === appel.data) { if (simule === 'ok') return '0x'; throw new Error('execution reverted'); }
    throw new Error('unexpected ' + m);
  };
  return { rpc, vus };
}
let c = chaine(); let p = await M.planDeplacement(c.rpc, OLD.toUpperCase().replace('0X', '0x'));
const sim = c.vus.find(([m, q]) => m === 'eth_call' && q[0].data === appel.data);
t('ready for the payee (case-insensitive), with the exact call', p.pret === true && p.appel.data === appel.data && p.appel.to === M.HOOK && p.simulation === '0x');
t('the simulation sent is the exact call FROM the payee, value 0', !!sim && sim[1][0].from === OLD && sim[1][0].to === M.HOOK && sim[1][0].value === '0x0');
c = chaine(); p = await M.planDeplacement(c.rpc, OTHER);
t('another wallet is refused, and nothing is simulated for it', p.pret === false && p.etat === 'refuse' && p.raison.includes(OLD) && !c.vus.some(([m, q]) => m === 'eth_call' && q[0].data === appel.data));
p = await M.planDeplacement(chaine().rpc, null);
t('no wallet: not ready, names the payee to connect', p.pret === false && p.raison.includes('connect') && p.raison.includes(OLD));
t('another network is refused', (await M.planDeplacement(chaine({ id: '0x1' }).rpc, OLD)).pret === false);
t('R without code is refused', (await M.planDeplacement(chaine({ codeR: '0x' }).rpc, OLD)).pret === false);
t('a hook without the function is refused', (await M.planDeplacement(chaine({ codeHook: '0x6000' }).rpc, OLD)).pret === false);
t('a reverting simulation is refused', (await M.planDeplacement(chaine({ simule: 'revert' }).rpc, OLD)).pret === false);
p = await M.planDeplacement(chaine({ payees: [[M.R, 3400]] }).rpc, OLD);
t('slot already at R: not ready, reads as done', p.pret === false && p.etat === 'fait');
t('another share is refused', (await M.planDeplacement(chaine({ payees: [[OLD, 3000]] }).rpc, OLD)).pret === false);
t('two payees are refused', (await M.planDeplacement(chaine({ payees: [[OLD, 3400], [OTHER, 1]] }).rpc, OLD)).pret === false);

console.log('D after the signature');
const tx = { from: OLD, to: M.HOOK, input: appel.data, value: '0x0' }, recu = { status: '0x1' };
t('the exact call from the payee, status 1 -> []', M.controleEnvoi(appel, OLD, tx, recu).length === 0);
t('another sender stops', M.controleEnvoi(appel, OLD, { ...tx, from: OTHER }, recu).length === 1);
t('another target stops', M.controleEnvoi(appel, OLD, { ...tx, to: OTHER }, recu).length === 1);
t('other data stops', M.controleEnvoi(appel, OLD, { ...tx, input: appel.data.slice(0, -2) + '00' }, recu).length === 1);
t('a value stops', M.controleEnvoi(appel, OLD, { ...tx, value: '0x1' }, recu).length === 1);
t('a failed status stops', M.controleEnvoi(appel, OLD, tx, { status: '0x0' }).length === 1);
t('no receipt stops', M.controleEnvoi(appel, OLD, tx, null).length > 0);

console.log('E the page');
const P = lire(process.env.PAYEE_SLOT_PAGE || 'deployer-economie-v2.html'), S = lire('serveur-web.js');
const SCRIPTS = [...P.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const X = SCRIPTS.find((s) => s.includes("import('./payee-slot.js')")) || '';
t('witness: the page was read (its title is there)', P.includes('<title>Deploy the holders economy</title>'));
t('the step has its own card and title', P.includes('id="slot"') && P.includes('Last step: move the creator fee share to the lock rewards'));
t('payee-slot.js is loaded in its OWN module, in a try (the six-step flow does not depend on it)', !!X && X !== SCRIPTS[0] && /try \{ M = await import\('\.\/payee-slot\.js'\); \} catch/.test(X));
t('it sends only plan.appel, from the payee, value 0, once', X.includes("rpc('eth_sendTransaction', [{ from: payeeAcct, to: plan.appel.to, data: plan.appel.data, value: '0x0' }])") && (X.match(/eth_sendTransaction/g) || []).length === 1);
t('a fresh plan (reads + simulation) right before the wallet opens, nothing sent unless ready', /const plan = await verifier\(\);[^\n]*\n  if \(!plan\.pret\) return;/.test(X));
t('the account is re-read at signing time', X.includes("rpc('eth_accounts', [])"));
t('after the receipt: controleEnvoi, then payees(key) read again until R holds it', X.includes('M.controleEnvoi(plan.appel, payeeAcct, tx, recu)') && X.includes('M.lirePayees(rpc)') && X.includes("v.etat === 'fait'"));
t('the page shows the exact call (to, value, data) and the simulation', X.includes("row('exact call: data', appel.data)") && X.includes("row('exact call: to', appel.to)") && X.includes("row('simulated from the payee'"));
t('the page types no address', !/0x[0-9a-fA-F]{40}/.test(P));
const servis = new Set([...((S.match(/const SERVIS\s*=\s*\[([\s\S]*?)\];/) || [])[1] || '').matchAll(/'([^']+)'/g)].map((m) => m[1]));
t('payee-slot.js and what it imports are served', servis.size > 20 && ['payee-slot.js', 'keccak.js', 'economie-v2-pack-deploiement.js', 'economie-v2-pack-deploye.js'].every((f) => servis.has(f)));

console.log('F on chain');
if (process.env.HORS_LIGNE === '1') console.log('  --   HORS_LIGNE=1: the on-chain clauses are SKIPPED (not counted)');
else {
  for (const node of ['https://mainnet.base.org', 'https://base-rpc.publicnode.com']) {
    let id = 0;
    const rpc = async (method, params) => {
      const r = await fetch(node, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
      const j = await r.json(); if (j.error) throw new Error(JSON.stringify(j.error)); return j.result;
    };
    const essai = async (q) => { try { return { ok: true, r: await rpc('eth_call', [q, 'latest']) }; } catch (e) { return { ok: false, r: e.message }; } };
    const bloc = parseInt(await rpc('eth_blockNumber', []), 16);
    const lus = await M.lirePayees(rpc);
    const v = M.etatSlot(lus);
    console.log('  ..   ' + node + ' block ' + bloc + ': ' + lus.map((x) => x.to + ' ' + x.shareBps + ' bps').join(', '));
    t(node + ': one payee, 3400 bps', lus.length === 1 && lus[0].shareBps === 3400);
    if (v.etat === 'fait') { t(node + ': R holds the slot (done)', (await M.planDeplacement(rpc, M.R)).etat === 'fait'); continue; }
    const payee = v.payee;
    const plan = await M.planDeplacement(rpc, payee);
    t(node + ': plan ready for the payee read on chain, simulation answered 0x', plan.pret === true && plan.simulation === '0x');
    const autre = await essai({ from: PACK.deployeur, to: appel.to, data: appel.data, value: '0x0' });
    t(node + ': the same call from the pack deployer reverts', autre.ok === false);
    t(node + ': the plan refuses the pack deployer before any simulation', (await M.planDeplacement(rpc, PACK.deployeur)).pret === false);
    const faux = await essai({ from: payee, to: appel.to, data: selecteur('transferPayeeSlot(bytes32,address)') + M.POOL_ID.slice(2) + wa(M.R), value: '0x0' });
    t(node + ': a wrong selector reverts from the payee (the simulation discriminates)', faux.ok === false);
  }
}
console.log(n - ko + '/' + n + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
