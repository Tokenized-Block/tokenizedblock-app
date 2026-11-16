/* test-crown-resolver-20261116.mjs — the CrownMarket resolver keeper (crown-resolver.js).
 * PROVES: A. post() calldata = post(round, winner, the engine's world hash as bytes32), and verifierEnvoi refuses anything else;
 *   B. (local base-anvil fork on :8549, skipped and said otherwise) END TO END: a CrownMarket deployed on the fork with a random TEST key
 *   as resolver, a bet in round 0, the round ends, the keeper posts exactly the crown the live game noted, the chain accepts it; a round
 *   without bets is not posted; a key that is not the resolver stops before signing.
 * DOES NOT PROVE: the production key, Railway, the live season noting the right crown (test-life-live does that). */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as K from './crown-resolver.js';
import { adresseDe } from './signeur-secp256k1.js';
import { selecteur } from './keccak.js';
let ok = 0, ko = 0; const t = (m, c, v = '') => { if (c) ok++; else { ko++; console.log('KO', m, v); } };
const W = '0x' + 'ab'.repeat(20), H = 'c0ffee0123456789:12345';
const d = K.donneesPost(7, W, H);
t('A1 post(7, winner, hash) encodes the round, the winner and the 16-hex world hash', d === selecteur('post(uint256,address,bytes32)').toLowerCase() + (7).toString(16).padStart(64, '0') + 'ab'.repeat(20).padStart(64, '0') + 'c0ffee0123456789'.padStart(64, '0'));
let bad = 0; try { K.hashEnBytes32('nope'); } catch { bad++; } t('A2 a malformed world hash is refused', bad === 1);
const M = '0x' + '12'.repeat(20), base = { to: M, value: 0n, chainId: 8453, data: d, gas: 100000n, maxFeePerGas: 1000000n };
const refuse = (o) => { try { K.verifierEnvoi({ ...base, ...o }, { marche: M, chainId: 8453 }); return false; } catch { return true; } };
t('A3 only post() to the market passes; any other selector, destination, value, chain, gas or fee is refused before signing',
  !refuse({}) && refuse({ data: selecteur('claim(uint256)') + '0'.repeat(64) }) && refuse({ to: W }) && refuse({ value: 1n }) && refuse({ chainId: 1 }) && refuse({ gas: 10n ** 7n }) && refuse({ maxFeePerGas: 10n ** 12n }));

const RPC = 'http://127.0.0.1:8549';
let id = 0; const rpc = async (m, p = []) => { const r = await (await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: m, params: p }) })).json(); if (r.error) throw new Error(m + ': ' + JSON.stringify(r.error)); return r.result; };
let fork = false; try { fork = parseInt(await rpc('eth_chainId'), 16) === 8453; } catch { fork = false; }
if (!fork) console.log('B skipped: no base-anvil fork on :8549');
else {
  const snap = await rpc('evm_snapshot');
  try {
    const TBLOCK = readFileSync(new URL('./economie.js', import.meta.url), 'utf8').match(/export const TBLOCK = '(0x[0-9a-f]{40})'/)[1];
    const PACK = readFileSync(new URL('./economie-v2-pack-deploye.js', import.meta.url), 'utf8');
    const V = PACK.match(/lettre: 'V', adresse: '(0x[0-9a-f]{40})'/)[1], L = PACK.match(/lettre: 'L', adresse: '(0x[0-9a-f]{40})'/)[1];
    const PM = readFileSync(new URL('./usage-onchain.js', import.meta.url), 'utf8').match(/POOL_MANAGER = '(0x[0-9a-f]{40})'/)[1];
    const art = JSON.parse(readFileSync(new URL('./contracts/out/CrownMarket.sol/CrownMarket.json', import.meta.url), 'utf8'));
    const pad = (x) => String(x).replace(/^0x/, '').toLowerCase().padStart(64, '0'), n = (x) => BigInt(x).toString(16).padStart(64, '0');
    const send = async (from, to, data) => { const h = await rpc('eth_sendTransaction', [{ from, to, data, gas: '0x' + (3000000).toString(16) }]); let r = null; for (let i = 0; i < 30 && !r; i++) { r = await rpc('eth_getTransactionReceipt', [h]); if (!r) await rpc('evm_mine'); } return r; };
    /* a fresh hearts price on the fork: its keeper is replaced in storage (slot 2) by a fork account, which writes the same price */
    const acct = (await rpc('eth_accounts'))[0];
    await rpc('evm_increaseTime', [3700]); await rpc('evm_mine');
    await rpc('anvil_setStorageAt', [L, '0x2', '0x' + pad(acct)]);
    const p = BigInt(await rpc('eth_call', [{ to: L, data: selecteur('price()') }, 'latest']));
    await send(acct, L, selecteur('setPrice(uint256)') + n(p));
    const cle = '0x' + randomBytes(32).toString('hex'), moi = adresseDe(cle);
    await rpc('anvil_setBalance', [moi, '0x56BC75E2D63100000']);
    const head = parseInt(await rpc('eth_blockNumber'), 16), G = head + 2, RB = 100;
    /* Config tuple, in the struct's order */
    const cfg = pad(TBLOCK) + pad(V) + pad(L) + pad(moi) + pad('0x' + 'd1'.repeat(20)) + pad('0x' + 'd2'.repeat(20)) + n(G) + n(RB) + n(60) + n(30) + n(500) + n(5n * 10n ** 17n) + n(5n * 10n ** 18n) + n(21600);
    const hd = await rpc('eth_sendTransaction', [{ from: acct, data: art.bytecode.object + cfg, gas: '0x' + (6000000).toString(16) }]);
    let dep = null; for (let i = 0; i < 30 && !dep; i++) { dep = await rpc('eth_getTransactionReceipt', [hd]); if (!dep) await rpc('evm_mine'); }
    const MK = dep.contractAddress;
    t('B0 CrownMarket deploys on the fork against the real TBLOCK, vault and hearts', dep.status === '0x1' && !!MK, MK);
    /* a bettor: the v4 PoolManager holds TBLOCK on the fork */
    await rpc('anvil_impersonateAccount', [PM]); await rpc('anvil_setBalance', [PM, '0x56BC75E2D63100000']);
    while (parseInt(await rpc('eth_blockNumber'), 16) < G) await rpc('evm_mine');
    const min = BigInt(await rpc('eth_call', [{ to: MK, data: selecteur('minBet()') }, 'latest']));
    await send(PM, TBLOCK, selecteur('approve(address,uint256)') + pad(MK) + n(min));
    const winner = '0x' + 'cd'.repeat(20);
    const rb = await send(PM, MK, selecteur('bet(uint256,address,uint256)') + n(0) + pad(winner) + n(min));
    t('B1 a bet of the minimum is taken in round 0', rb.status === '0x1');
    while (parseInt(await rpc('eth_blockNumber'), 16) <= G + RB) await rpc('evm_mine'); /* round 0 ended (round 1 has no bet) */
    const noted = new Map([[0, { winner, hash: '0123456789abcdef:777' }]]);
    const wrong = K.creerResolverCouronne({ cle: '0x' + randomBytes(32).toString('hex'), marche: MK, chaine: 8453, rpc, crownOf: (r) => noted.get(r) });
    const rw = await wrong.tour();
    t('B2 a key that is not the resolver stops before signing', !rw.fait && wrong.etat().etat === 'ARRETE' && wrong.etat().compteurs.envois === 0, rw.pourquoi);
    const k = K.creerResolverCouronne({ cle, marche: MK, chaine: 8453, rpc, crownOf: (r) => noted.get(r) });
    const r1 = await k.tour(); await rpc('evm_mine'); await k.tour();
    const R0 = await rpc('eth_call', [{ to: MK, data: selecteur('rounds(uint256)') + n(0) }, 'latest']);
    const w0 = '0x' + R0.slice(2 + 64 * 2 + 24, 2 + 64 * 3);
    t('B3 the keeper posts round 0 with the noted crown and hash, and the chain accepts it', r1.fait === true && w0 === winner && R0.slice(2 + 64 * 3, 2 + 64 * 4) === '0123456789abcdef'.padStart(64, '0') && k.etat().compteurs.inclus === 1, JSON.stringify(r1));
    const r2 = await k.tour();
    t('B4 nothing else to post (round 0 done, round 1 has no bet)', !r2.fait, r2.pourquoi);
  } finally { await rpc('evm_revert', [snap]); }
}
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
