/* test-hearts-price-keeper-20261116.mjs — the hearts price keeper (hearts-price-keeper.js).
 * PROVES: A. the pure decision (lowest read, one contract step, floor/ceiling, threshold vs refresh, frozen, too soon, too few reads);
 *   B. verifierEnvoi refuses anything but setPrice(uint256) to the hearts contract; C. the quote -> price conversion on the measured quote;
 *   D. (with a local base-anvil fork on :8549) END TO END against the REAL hearts contract: a random test key is made the keeper in the
 *   fork's storage only (slot 2, checked to hold the real keeper first), the module writes a bounded price, the chain accepts it, and
 *   LifeEntry-style freshness follows. A wrong key is refused before anything is signed.
 * DOES NOT PROVE: the production key, Railway, or the market route itself (devisUsdcVersTblock has its own tests). */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as K from './hearts-price-keeper.js';
import { adresseDe } from './signeur-secp256k1.js';
import { selecteur } from './keccak.js';
let ok = 0, ko = 0; const t = (m, c, v = '') => { if (c) ok++; else { ko++; console.log('KO', m, v); } };
const C = { minInterval: 3600n, pas: 1000n, plancher: 107531498818n, plafond: 537657494090100n, gele: false };
const S = { prix: 5376574940901n, depuis: 1000n };
const R = (pairs) => pairs.map(([t, p]) => ({ t: BigInt(t), p: BigInt(p) }));
const B = { ...K.BORNES_DEFAUT };

/* A */
let d = K.decider({ lectures: R([[400000, 4.17e12], [400500, 4.2e12]]), stocke: S, contrat: C, maintenantS: 400600, bornes: B });
t('A1 market 22 % below: one step down (10 %), not the whole way', d.ecrire && d.prix === S.prix * 9000n / 10000n, String(d.prix));
d = K.decider({ lectures: R([[400000, 9e12], [400500, 5.4e12]]), stocke: S, contrat: C, maintenantS: 400600, bornes: B });
t('A2 the LOWEST read wins (a price pushed to 9e12 for one read is ignored)', d.ecrire && d.prix === 5400000000000n, String(d.prix));
d = K.decider({ lectures: R([[400000, 9e12], [400500, 9e12]]), stocke: S, contrat: C, maintenantS: 400600, bornes: B });
t('A3 market far above: one step up only', d.ecrire && d.prix === S.prix * 11000n / 10000n);
d = K.decider({ lectures: R([[4000, 4.17e12], [4500, 4.17e12]]), stocke: S, contrat: C, maintenantS: 1000 + 3600 + 10, bornes: B });
t('A4 too soon after the last write: nothing', !d.ecrire && /one write per/.test(d.pourquoi));
d = K.decider({ lectures: R([[400500, 4.17e12]]), stocke: S, contrat: C, maintenantS: 400600, bornes: B });
t('A5 one read only: waits for two', !d.ecrire && /waiting for 2/.test(d.pourquoi));
d = K.decider({ lectures: R([[400590, 4.17e12], [400595, 4.17e12]]), stocke: S, contrat: C, maintenantS: 400600, bornes: B });
t('A6 reads too close together: waits', !d.ecrire && /span/.test(d.pourquoi));
d = K.decider({ lectures: R([[400000, 4.17e12], [400500, 4.17e12]]), stocke: S, contrat: { ...C, gele: true }, maintenantS: 400600, bornes: B });
t('A7 frozen: nothing', !d.ecrire && /frozen/.test(d.pourquoi));
const near = S.prix + S.prix * 20n / 10000n; /* +0.2 % */
d = K.decider({ lectures: R([[5000, near], [5400, near]]), stocke: S, contrat: C, maintenantS: 5500, bornes: B });
t('A8 a move under the threshold with a fresh price: nothing', !d.ecrire && /fresh/.test(d.pourquoi));
d = K.decider({ lectures: R([[20000, near], [20400, near]]), stocke: S, contrat: C, maintenantS: 20500, bornes: B });
t('A9 the same small move once the price is older than 3 h: written (LifeEntry needs it fresh)', d.ecrire && d.prix === near);
d = K.decider({ lectures: R([[400000, 1], [400500, 1]]), stocke: { prix: C.plancher, depuis: 1000n }, contrat: C, maintenantS: 400600, bornes: B });
t('A10 never under the floor', !d.ecrire || d.prix >= C.plancher);
/* B */
const H = '0xbdaa207c1c537dee23bc1dc89fec9d204bb45fe1', base = { to: H, value: 0n, chainId: 8453, data: K.donneesSetPrice(5n), gas: 60000n, maxFeePerGas: 1000000n };
const refuse = (o) => { try { K.verifierEnvoi({ ...base, ...o }, { hearts: H, chainId: 8453 }); return false; } catch { return true; } };
t('B1 setPrice to the hearts passes', !refuse({}));
t('B2 any other selector, destination, value, chain, gas or fee is refused before signing',
  refuse({ data: selecteur('announceKeeper(address)') + '0'.repeat(64) }) && refuse({ to: '0x' + '11'.repeat(20) }) && refuse({ value: 1n }) && refuse({ chainId: 1 }) && refuse({ gas: 10n ** 7n }) && refuse({ maxFeePerGas: 10n ** 12n }) && refuse({ data: K.donneesSetPrice(5n) + '00' }));
/* C: the quote measured on prod 2026-11-16 (1 USDC -> 239,713.676... TBLOCK) */
const p = K.prixDepuisDevis(239713676191861578830773n);
t('C1 $1 -> 239,713.68 TBLOCK = $4.17e-6 per TBLOCK (1e18 scale)', p >= 4171000000000n && p <= 4172000000000n, String(p));

/* D: end to end on a LOCAL fork (skipped, and said, when no fork answers) */
const RPC = 'http://127.0.0.1:8549';
let id = 0; const rpc = async (m, pr = []) => { const r = await (await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: m, params: pr }) })).json(); if (r.error) throw new Error(m + ': ' + JSON.stringify(r.error)); return r.result; };
let fork = false; try { fork = parseInt(await rpc('eth_chainId'), 16) === 8453; } catch { fork = false; }
if (!fork) console.log('D skipped: no base-anvil fork on :8549 (start one to run the end-to-end part)');
else {
  const PACK = readFileSync(new URL('./economie-v2-pack-deploye.js', import.meta.url), 'utf8');
  const L = (PACK.match(/lettre: 'L', adresse: '(0x[0-9a-f]{40})'/) || [])[1];
  const snap = await rpc('evm_snapshot');
  try {
    const realKeeper = '0x' + (await rpc('eth_call', [{ to: L, data: selecteur('keeper()') }, 'latest'])).slice(26);
    const slot2 = await rpc('eth_getStorageAt', [L, '0x2', 'latest']);
    t('D0 slot 2 of the real hearts holds its keeper (the layout used below is the deployed one)', ('0x' + slot2.slice(26)).toLowerCase() === realKeeper.toLowerCase(), realKeeper);
    /* a wrong key: refused on chain read, nothing signed */
    const wrong = '0x' + randomBytes(32).toString('hex');
    const kw = K.creerKeeperPrixHearts({ cle: wrong, hearts: L, chaine: 8453, rpc, lirePrixE18: async () => 4171000000000n });
    const rw = await kw.tour();
    t('D1 a key that is not the hearts keeper stops before anything is signed', !rw.fait && kw.etat().etat === 'ARRETE' && kw.etat().compteurs.envois === 0, rw.pourquoi);
    /* a random TEST key made the keeper in the fork's storage only */
    const cle = '0x' + randomBytes(32).toString('hex'), moi = adresseDe(cle);
    await rpc('anvil_setStorageAt', [L, '0x2', '0x' + moi.replace(/^0x/, '').toLowerCase().padStart(64, '0')]);
    await rpc('anvil_setBalance', [moi, '0x56BC75E2D63100000']);
    const old = BigInt(await rpc('eth_call', [{ to: L, data: selecteur('price()') }, 'latest']));
    const k = K.creerKeeperPrixHearts({ cle, hearts: L, chaine: 8453, rpc, lirePrixE18: async () => 4171000000000n, bornes: { fenetreS: 200 } });
    await rpc('evm_increaseTime', [3700]); await rpc('evm_mine'); /* past the contract's hour since any earlier write on this fork; the head's clock moves to now */
    const r1 = await k.tour();                                   /* first market read: waits */
    await rpc('evm_increaseTime', [120]); await rpc('evm_mine');
    const r2 = await k.tour();                                   /* second read 120 s later: writes */
    await rpc('evm_mine');
    await k.tour();                                              /* follows the receipt */
    const now = BigInt(await rpc('eth_call', [{ to: L, data: selecteur('price()') }, 'latest']));
    const at = BigInt(await rpc('eth_call', [{ to: L, data: selecteur('priceSetAt()') }, 'latest']));
    const ts = BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp);
    t('D2 first round waits for a second read, the second writes', !r1.fait && r2.fait === true, JSON.stringify([r1.pourquoi, r2.pourquoi || r2.hash]));
    t('D3 the REAL hearts contract accepted one step toward the market (old x 0.9) and the price is fresh', now === old * 9000n / 10000n && ts - at < 60n && k.etat().compteurs.inclus === 1, old + ' -> ' + now);
    const r3 = await k.tour();
    t('D4 right after, nothing more (one write per hour)', !r3.fait && /one write per/.test(r3.pourquoi || ''), r3.pourquoi);
  } finally { await rpc('evm_revert', [snap]); }
}
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
