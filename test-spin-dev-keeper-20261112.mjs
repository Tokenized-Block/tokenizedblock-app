/* test-spin-dev-keeper-20261112.mjs -- AFFIRME spin-dev-keeper.js against a scripted RPC (no network): what it reads, what it decides,
 *   what it signs, and every refusal. The key below is a throwaway test key (the well-known anvil key #0), never a live one. */
import { creerKeeperSpinDev, decider, minimumSorti, verifierEnvoi, donneesPayDev, gardeDuRevert, SEL_PAYDEV, creerExclusif } from './spin-dev-keeper.js';
import { selecteur } from './keccak.js';
import { adresseDe } from './signeur-secp256k1.js';

let ok = 0, ko = 0;
const t = (m, c) => { if (c) ok++; else { ko++; console.log('KO', m); } };
const CLE = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const MOI = adresseDe(CLE).toLowerCase();
const SPIN = '0x60aee70e95cea9493b1c7710e323e12ddfdcc664', ROUTER = '0xaba069245e99a6fe0c0c1c1b4b952f41bb0c146e';
const u = (n) => BigInt(n).toString(16).padStart(64, '0');
const S = (sig) => selecteur(sig).toLowerCase();

/* scripted chain */
function chaine(o = {}) {
  const c = { devOwed: 3500000n, min: 1000000n, max: 10000000n, bps: 1000n, floor: 900n, quote: 1000n, chain: 8453, revertQuote: null, revertSim: null, envois: [], calls: [], recu: '0x1', ...o };
  const rpc = async (m, p) => {
    if (m === 'eth_chainId') return '0x' + c.chain.toString(16);
    if (m === 'eth_getBlockByNumber') return { timestamp: '0x100', baseFeePerGas: '0x1000' };
    if (m === 'eth_maxPriorityFeePerGas') return '0x10';
    if (m === 'eth_getTransactionCount') return '0x7';
    if (m === 'eth_estimateGas') return '0x30000';
    if (m === 'eth_sendRawTransaction') { c.envois.push(p[0]); return '0xabc'; }
    if (m === 'eth_getTransactionReceipt') return { status: c.recu };
    if (m !== 'eth_call') throw new Error('unexpected ' + m);
    const { to, data, from } = p[0]; const d = data.toLowerCase(); c.calls.push({ to, d, from });
    if (to === SPIN && d === S('MIN_DEV_BATCH()')) return '0x' + u(c.min);
    if (to === SPIN && d === S('MAX_DEV_BATCH()')) return '0x' + u(c.max);
    if (to === SPIN && d === S('ROUTER()')) return '0x' + u(BigInt(ROUTER));
    if (to === SPIN && d === S('USDC_SPLIT()')) return '0x' + u(1) + u(c.bps);
    if (to === SPIN && d === S('devOwed()')) return '0x' + u(c.devOwed);
    if (to === ROUTER && d.startsWith(S('minOutFloor(uint256)'))) { c.floorArg = BigInt('0x' + d.slice(10)); return '0x' + u(c.floor); }
    if (to === SPIN && d.startsWith(SEL_PAYDEV)) {
      const minOut = BigInt('0x' + d.slice(74, 138));
      if (minOut === c.floor) { if (c.revertQuote) throw c.revertQuote; return '0x' + u(BigInt('0x' + d.slice(10, 74))) + u(c.quote); }
      if (c.revertSim) throw c.revertSim; c.simMinOut = minOut; return '0x' + u(1) + u(c.quote);
    }
    throw new Error('unscripted call ' + d.slice(0, 10));
  };
  return { c, rpc };
}
const mk = (c, x = {}) => creerKeeperSpinDev({ cle: CLE, spin: SPIN, chaine: 8453, keeperAttendu: MOI, rpc: c.rpc, ...x });

/* pure parts */
t('decider: below MIN waits', decider({ devOwed: 999n, minBatch: 1000n, maxBatch: 5000n }).appeler === false);
t('decider: between pays all', decider({ devOwed: 3000n, minBatch: 1000n, maxBatch: 5000n }).montant === 3000n);
t('decider: above MAX pays MAX', decider({ devOwed: 9000n, minBatch: 1000n, maxBatch: 5000n }).montant === 5000n);
t('decider: exactly MIN pays', decider({ devOwed: 1000n, minBatch: 1000n, maxBatch: 5000n }).montant === 1000n);
t('decider: insane bounds refused', decider({ devOwed: 9000n, minBatch: 0n, maxBatch: 5000n }).appeler === false);
t('minimumSorti: quote less 1 %', minimumSorti(1000n, 900n, 100n) === 990n);
t('minimumSorti: never under the floor', minimumSorti(1000n, 995n, 100n) === 995n);
t('minimumSorti: zero quote refused', minimumSorti(0n, 900n, 100n) === null);
t('gardeDuRevert reads a selector', gardeDuRevert({ data: S('V4ImpactTooHigh(int24,int24)') + u(1) + u(2) }) === 'V4ImpactTooHigh');
t('gardeDuRevert: unknown is null', gardeDuRevert(new Error('boom')) === null);
const tx0 = { to: SPIN, value: 0n, chainId: 8453, data: donneesPayDev(5n, 1n, 9n), gas: 100000n, maxFeePerGas: 1000n };
t('verifierEnvoi: admitted', verifierEnvoi(tx0, { cible: SPIN, chainId: 8453, maxBatch: 5n }) === true);
const jette = (tx, o = {}) => { try { verifierEnvoi(tx, { cible: SPIN, chainId: 8453, maxBatch: 5n, ...o }); return false; } catch (_) { return true; } };
t('verifierEnvoi: other target', jette({ ...tx0, to: ROUTER }));
t('verifierEnvoi: value', jette({ ...tx0, value: 1n }));
t('verifierEnvoi: chain', jette({ ...tx0, chainId: 1 }));
t('verifierEnvoi: other selector', jette({ ...tx0, data: S('spin()') }));
t('verifierEnvoi: amount above MAX', jette({ ...tx0, data: donneesPayDev(6n, 1n, 9n) }));
t('verifierEnvoi: zero minOut', jette({ ...tx0, data: donneesPayDev(5n, 0n, 9n) }));
t('verifierEnvoi: gas cap', jette({ ...tx0, gas: 10n ** 9n }));
t('verifierEnvoi: fee cap', jette({ ...tx0, maxFeePerGas: 10n ** 12n }));

/* OFF states */
t('OFF without Spin', creerKeeperSpinDev({ cle: CLE, spin: null, keeperAttendu: MOI, rpc: () => {} }).etat().etat === 'OFF');
t('OFF without key', creerKeeperSpinDev({ cle: null, spin: SPIN, keeperAttendu: MOI, rpc: () => {} }).etat().etat === 'OFF');
const autre = creerKeeperSpinDev({ cle: CLE, spin: SPIN, chaine: 8453, keeperAttendu: '0x1f0eb43b99272e78de0077ff0e38787d6c2bd23c', rpc: () => {} }).etat();
t('OFF with a key not the gas-only keeper, names the address, never the key', autre.etat === 'OFF' && autre.pourquoi.includes(MOI) && !autre.pourquoi.includes(CLE.slice(2)));

/* a round that pays */
{
  const k = chaine(); const kp = mk(k);
  const r = await kp.tour();
  t('pays: sent', r.fait === true && k.c.envois.length === 1);
  t('pays: amount = devOwed (between bounds)', r.montant === 3500000n);
  t('pays: floor asked on the swapped part (batch less 10 %)', k.c.floorArg === 3150000n);
  t('pays: minOut = quote less 1 %', r.minOut === 990n && k.c.simMinOut === 990n);
  t('pays: every call from the keeper address', k.c.calls.filter((x) => x.d.startsWith(SEL_PAYDEV)).every((x) => x.from === MOI));
  t('pays: state never holds the key', !JSON.stringify(kp.etat(), (_, v) => (typeof v === 'bigint' ? String(v) : v)).includes(CLE.slice(2)));
  const r2 = await kp.tour();
  t('in flight followed then a new round', k.c.envois.length === 2 && kp.etat().compteurs.inclus === 1 && r2.fait === true);
}
{ const k = chaine({ devOwed: 50000000n }); const r = await mk(k).tour(); t('large devOwed pays MAX_DEV_BATCH', r.montant === 10000000n); }
{ const k = chaine({ devOwed: 999999n }); const r = await mk(k).tour(); t('below MIN: nothing sent', r.fait === false && k.c.envois.length === 0); }
{ const k = chaine({ revertQuote: { data: S('V4ImpactTooHigh(int24,int24)') + u(1) + u(2) } }); const kp = mk(k); const r = await kp.tour();
  t('guard on quote: retry later, not a failure', r.fait === false && kp.etat().compteurs.gardes === 1 && kp.etat().echecsSuite === 0 && k.c.envois.length === 0); }
{ const k = chaine({ revertSim: { data: S('InsufficientOutput(uint256,uint256)') + u(1) + u(2) } }); const kp = mk(k); const r = await kp.tour();
  t('guard on simulation: nothing sent', r.fait === false && k.c.envois.length === 0 && kp.etat().compteurs.gardes === 1); }
{ const k = chaine({ chain: 1 }); const kp = mk(k); await kp.tour(); t('wrong chain: stopped', kp.etat().etat === 'ARRETE' && k.c.envois.length === 0); }
{ const k = chaine({ recu: '0x0' }); const kp = mk(k); await kp.tour(); await kp.tour(); await kp.tour(); await kp.tour(); await kp.tour(); await kp.tour();
  t('3 mined reverts in a row: stopped', kp.etat().etat === 'ARRETE' && kp.etat().compteurs.reverts === 3); }

/* the shared lock serialises */
{
  const ex = creerExclusif(); const ordre = [];
  const a = ex(async () => { ordre.push('a1'); await new Promise((r) => setTimeout(r, 20)); ordre.push('a2'); });
  const b = ex(async () => { ordre.push('b1'); });
  await Promise.all([a, b]);
  t('exclusif: b waits for a', ordre.join() === 'a1,a2,b1');
  const c = ex(async () => { throw new Error('x'); }); await c.catch(() => {});
  const d = await ex(async () => 7); t('exclusif: a failure does not jam the lock', d === 7);
}

console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
