// banc-bascule-pack-fork-20261112.mjs (needs: base-anvil fork of Base on BANC_RPC, default http://127.0.0.1:9561) — the app's OWN
// builders (economie-pack.js, tam-plan.js, blockskins.js, tblock-route.js devisUsdcVersTblock) run against the six contracts DEPLOYED on
// Base, on a LOCAL fork. A fresh address is impersonated LOCALLY and funded locally (TBLOCK taken from 0x…dEaD, USDC from the Aerodrome
// pool, on the fork only). It locks + enrolls, hearts a block, mints TAM art and a skin through the router, claims a vault week and a
// month of lock rewards. Every tx's receipt status is checked. Nothing touches mainnet: the fork answers every call.
import { selecteur } from './keccak.js';
import * as EP from './economie-pack.js';
import { planMintTamRouteur } from './tam-plan.js';
import { packRecette, lireSkins, BLOCKSKINS_LUS } from './blockskins.js';
import { devisUsdcVersTblock } from './tblock-route.js';
import * as LK from './lock.js';
import { passSkinVerifie } from './volume-tirage.js';
import { FEE_WALLET } from './frais-creation.js';

const U = process.env.BANC_RPC || 'http://127.0.0.1:9561';
let id = 0;
async function rpc(method, params = []) {
  const r = await fetch(U, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((x) => x.json());
  if (r.error) { const e = new Error(r.error.message); e.data = r.error.data; e.code = r.error.code; throw e; }
  return r.result;
}
const w = (x) => BigInt(x).toString(16).padStart(64, '0'), wa = (a) => a.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const lit = async (v) => EP.word(await rpc('eth_call', [{ to: v.to, data: v.data }, 'latest']));
const call = async (to, sig, args = '') => rpc('eth_call', [{ to, data: selecteur(sig) + args }, 'latest']);
let ok = 0, ko = 0;
const t = (m, c, x = '') => { if (c) ok++; else ko++; console.log((c ? 'ok  ' : 'KO  ') + m + (x ? ' — ' + x : '')); };
async function send(from, c) {
  const h = await rpc('eth_sendTransaction', [{ from, to: c.to, data: c.data, value: c.value || '0x0', gas: '0x' + (8_000_000).toString(16) }]);
  for (let k = 0; k < 80; k++) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return r; await new Promise((o) => setTimeout(o, 300)); }
  throw new Error('no receipt');
}
const sendAll = async (from, calls) => { const out = []; for (const c of calls) out.push(await send(from, c)); return out; };
const avancer = async (s) => { await rpc('evm_increaseTime', [s]); await rpc('evm_mine', []); };
const maintenant = async () => Number(BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp));
const E = 10n ** 18n;
const DEAD = '0x000000000000000000000000000000000000dead', AERO = '0x089262b9d991d7bc4a55b7cff0b7f26bde407985'; /* from tblock-route.js POOL_WTCOIN_USDC */
const ME = '0x00000000000000000000000000000000000be7f1', BLK = '0xb2000000000000000000007afa7ed748b0874f27'; /* UNIT (tam-serveur.js CERVEAU_DEFAUT) */

t('chain id 8453 (a Base fork)', BigInt(await rpc('eth_chainId')) === 8453n);
for (const k of ['HEARTS', 'ROUTER', 'TAM', 'SKINS', 'VAULT', 'REWARDS']) t(k + ' has code on the fork', (await rpc('eth_getCode', [EP[k], 'latest'])).length > 2);
for (const a of [ME, DEAD, AERO]) { await rpc('anvil_impersonateAccount', [a]); await rpc('anvil_setBalance', [a, '0x' + (10n ** 18n).toString(16)]); }
t('fund ME locally: 8,000,000 TBLOCK from 0x…dEaD', (await send(DEAD, { to: EP.TBLOCK, data: selecteur('transfer(address,uint256)') + wa(ME) + w(8_000_000n * E) })).status === '0x1');
t('fund ME locally: 40 USDC from the Aerodrome pool', (await send(AERO, { to: EP.USDC, data: selecteur('transfer(address,uint256)') + wa(ME) + w(40_000_000n) })).status === '0x1');

/* 1. lock + enroll, ONE batch built by the app */
const t0 = await maintenant();
const need = await lit(EP.VIEW.minHold());
const lb = EP.lockEtInscrire({ amount: 3_500_000n * E, jours: 60, maintenantSec: t0, holder: ME });
const rl = await sendAll(ME, lb);
t('lock + enroll: approve, lock, enroll all status 1', rl.every((r) => r.status === '0x1'), rl.map((r) => r.status).join(','));
const locked = await lit(LK.VIEW.activeLockedOf(ME)), unlockAt = await lit(LK.VIEW.unlockAtOf(ME));
t('the lock holds 3,500,000 TBLOCK, >= the hearts minimum ' + EP.fmt(need), locked === 3_500_000n * E && locked >= need);
const enr = await rpc('eth_call', [EP.VIEW.enrollmentOf(ME), 'latest']);
t('enrolled: enrollmentOf(ME).unlockAt = the lock date', EP.word(enr, 0) === unlockAt);
const mois = EP.decoderMois(await rpc('eth_call', [EP.VIEW.rewardEpochsFor(unlockAt), 'latest']));
const cur = Number(await lit(EP.VIEW.rCurrentEpoch()));
t('a 60-day lock earns ' + mois.n + ' whole month(s) from month ' + mois.premier, mois.n >= 1 && mois.premier === cur + 1);
t('weight from the next month on, none this month', (await lit(EP.VIEW.weightOf(ME, BigInt(cur + 1)))) > 0n && (await lit(EP.VIEW.weightOf(ME, BigInt(cur)))) === 0n);

/* 2. a heart, checked then built by the app at the price read */
const prix = await lit(EP.VIEW.likePrice());
const bal0 = await lit(EP.VIEW.balanceOf(EP.TBLOCK, ME)), dead0 = await lit(EP.VIEW.balanceOf(EP.TBLOCK, DEAD));
t('likeCheck passes with the lock and the wallet read', EP.likeCheck({ balance: bal0, locked, likePrice: prix, minHold: need }).ok === true);
const likes0 = await lit(EP.VIEW.likesOf(BLK));
const rh = await sendAll(ME, EP.likeBatch({ block: BLK, n: 1, likePrice: prix }));
t('heart: approve + like status 1', rh.every((r) => r.status === '0x1'));
t('heart: likesOf(block) +1, exactly likePrice burned to 0x…dEaD', (await lit(EP.VIEW.likesOf(BLK))) === likes0 + 1n && (await lit(EP.VIEW.balanceOf(EP.TBLOCK, DEAD))) - dead0 === prix);
t('heart: no allowance left over (exact approval)', BigInt(await call(EP.TBLOCK, 'allowance(address,address)', wa(ME) + wa(EP.HEARTS))) === 0n);

/* 3. TAM art through the router: fresh quote on the fork, x 0.99, checked against the floor */
const lireTam = async (sig) => rpc('eth_call', [{ to: EP.TAM, data: selecteur(sig) }, 'latest']);
const lu = { prix: EP.word(await lireTam('PRICE_USDC()')), devBps: EP.word(await lireTam('USDC_SPLIT()'), 1), routeur: '0x' + String(await lireTam('ROUTER()')).slice(-40) };
const spend = EP.usdcEchange(lu.prix, lu.devBps);
const d = await devisUsdcVersTblock({ rpc, montant: spend });
t('fresh quote of ' + EP.usdcTexte(spend) + ' USDC on the fork', d.etat === 'OK' && d.devis > 0n, d.pourquoi || EP.fmt(d.devis || 0n));
const plancher = await lit(EP.VIEW.minOutFloor(spend));
const mo = EP.minimumDepuisDevis({ devis: d.devis || 0n, plancher });
t('minimum = quote x 0.99, above the router floor', mo.ok === true && mo.minOut >= plancher, mo.why || EP.fmt(mo.minOut));
const work = new Uint8Array([0x54, 0x41, 0x4d, 1, 8, 0, ...Array.from({ length: 40 }, (_, i) => (i * 37 + (t0 & 255)) & 255)]);
const plan = planMintTamRouteur({ pack: EP, lu, octets: work, graine: '0x' + 'c3'.repeat(32), paramsJson: '{"banc":1}', minOut: mo.minOut, deadline: (await maintenant()) + EP.DELAI_PAIEMENT_S });
t('the TAM plan is PRET', plan.etat === 'PRET', plan.pourquoi || '');
const vault0 = await lit(EP.VIEW.vaultBalance()), usdcDev0 = BigInt(await call(EP.USDC, 'balanceOf(address)', wa('0x' + String(await lireTam('DEV_WALLET()')).slice(-40))));
const sup0 = BigInt(await lireTam('totalSupply()'));
const rt = plan.etat === 'PRET' ? await sendAll(ME, plan.appels) : [];
t('TAM: approve + pay status 1', rt.length === 2 && rt.every((r) => r.status === '0x1'), rt.map((r) => r.status + ' gas ' + BigInt(r.gasUsed)).join(', '));
t('TAM: one work minted, owned by ME', BigInt(await lireTam('totalSupply()')) === sup0 + 1n && ('0x' + String(await call(EP.TAM, 'ownerOf(uint256)', w(sup0 + 1n))).slice(-40)) === ME);
const recu = (await lit(EP.VIEW.vaultBalance())) - vault0;
t('TAM: the holders vault received >= the minimum TBLOCK', recu >= mo.minOut, EP.fmt(recu) + ' TBLOCK');
const devWal = '0x' + String(await lireTam('DEV_WALLET()')).slice(-40);
t('TAM: the dev wallet received exactly 10% in USDC', BigInt(await call(EP.USDC, 'balanceOf(address)', wa(devWal))) - usdcDev0 === lu.prix * lu.devBps / 10000n);
const ep = await lit(EP.VIEW.currentEpoch());
t('TAM: counted as play in the vault for ME this week', (await lit(EP.VIEW.playOf(ep, ME))) >= prix + mo.minOut);

/* 4. a skin through the router */
const prixS = await lit(EP.VIEW.mintPriceSkin()), devS = EP.word(await rpc('eth_call', [EP.VIEW.partJeu(EP.SKINS), 'latest']), 1);
const spendS = EP.usdcEchange(prixS, devS), dS = await devisUsdcVersTblock({ rpc, montant: spendS });
const moS = EP.minimumDepuisDevis({ devis: dS.devis || 0n, plancher: await lit(EP.VIEW.minOutFloor(spendS)) });
const recette = { id: 'random', angle: 10, h: [20, 30, 40], cube: 50, noyau: 60, fond: 70 };
const sk0 = BigInt(await call(EP.SKINS, 'totalSupply()'));
const rs = moS.ok ? await sendAll(ME, EP.payBatch({ game: EP.SKINS, usdcIn: prixS, minOut: moS.minOut, deadline: (await maintenant()) + 600, data: EP.dataSkin({ block: BLK, recipe: packRecette(recette) }) })) : [];
t('skin: approve + pay status 1 (' + EP.usdcTexte(prixS) + ' USDC)', rs.length === 2 && rs.every((r) => r.status === '0x1'));
const sv = await lireSkins({ rpc });
const mienne = sv.etat === 'LU' ? sv.skins.find((s) => s.contrat === EP.SKINS && s.tokenId === sk0 + 1n) : null;
t('skin: read back by the app on the pack\'s Skins, ME holds it, bound to the block, same hues', !!mienne && mienne.detenteur === ME && mienne.block === BLK && mienne.recette.h.join() === '20,30,40');
if (rs.length === 2) {
  const txS = await rpc('eth_getTransactionByHash', [rs[1].transactionHash]);
  t('skin pass (server): a router mint is recognized when the price must leave the payer for the ROUTER', passSkinVerifie({ tx: txS, recu: rs[1], skins: EP.SKINS, usdc: EP.USDC, wallet: EP.ROUTER, prix: prixS }).ok === true);
  t('skin pass (server): the old rule (price to the fee wallet) would refuse it — why the server now names the router', passSkinVerifie({ tx: txS, recu: rs[1], skins: EP.SKINS, usdc: EP.USDC, wallet: FEE_WALLET, prix: prixS }).ok === false);
}
t('skin: the earlier skins contracts are still read (' + BLOCKSKINS_LUS.length + ' contracts)', sv.etat === 'LU' && sv.skins.some((s) => s.contrat !== EP.SKINS));

/* 5. the vault week: close it, ME claims (checked first by the app's rule) */
const fin = await lit(EP.VIEW.epochEnd(ep));
await avancer(Number(fin) - (await maintenant()) + 60);
t('close the week (anyone)', (await send(ME, EP.closeEpochCall(ep))).status === '0x1');
const o = await rpc('eth_call', [EP.VIEW.owed(ep, ME), 'latest']);
const du = EP.word(o, 0) + EP.word(o, 1);
const chk = EP.claimCheck({ locked: await lit(LK.VIEW.activeLockedOf(ME)), need: await lit(EP.VIEW.needFor(ep)), unlockAt, minCommit: await lit(EP.VIEW.minCommit()), maintenantSec: await maintenant(), owed: du });
t('owed > 0 and claimCheck passes', du > 0n && chk.ok === true, EP.fmt(du) + ' TBLOCK');
const b1 = await lit(EP.VIEW.balanceOf(EP.TBLOCK, ME));
t('vault claim status 1, ME receives what owed() said', (await send(ME, EP.claimCall(ep))).status === '0x1' && (await lit(EP.VIEW.balanceOf(EP.TBLOCK, ME))) - b1 === du);

/* 6. a month of lock rewards: play in the first month the lock covers, the contract is funded, both months close, ME claims */
const debut = Number(await lit(EP.VIEW.rEpochEnd(BigInt(cur))));
await avancer(Math.max(0, debut - (await maintenant())) + 3600);
const prix2 = await lit(EP.VIEW.likePrice());
t('a heart in month ' + (cur + 1) + ' (counts as play there)', (await sendAll(ME, EP.likeBatch({ block: BLK, n: 1, likePrice: prix2 }))).every((r) => r.status === '0x1'));
t('hasPlayed(ME, month ' + (cur + 1) + ')', (await lit(EP.VIEW.hasPlayed(ME, BigInt(cur + 1)))) === 1n);
const depot = 1_000_000n * E;
t('fund the lock rewards (approve + deposit 1,000,000 TBLOCK, local)', (await send(ME, { to: EP.TBLOCK, data: selecteur('approve(address,uint256)') + wa(EP.REWARDS) + w(depot) })).status === '0x1'
  && (await send(ME, { to: EP.REWARDS, data: selecteur('deposit(address,uint256)') + wa(EP.TBLOCK) + w(depot) })).status === '0x1');
const finM = Number(await lit(EP.VIEW.rEpochEnd(BigInt(cur + 1))));
await avancer(finM - (await maintenant()) + 60);
for (let e = Number(await lit(EP.VIEW.nextEpochToClose())); e <= cur + 1; e++) t('close month ' + e, (await send(ME, { to: EP.REWARDS, data: selecteur('closeEpoch(uint256)') + w(e) })).status === '0x1');
const q = await rpc('eth_call', [EP.VIEW.claimable(ME, [BigInt(cur + 1)]), 'latest']);
const duT = EP.word(q, 1);
const p = await rpc('eth_call', [EP.VIEW.pot(BigInt(cur + 1)), 'latest']);
const apr = EP.aprPasse({ potTblock: EP.word(p, 1), played: await lit(EP.VIEW.playedWeight(BigInt(cur + 1))) });
t('claimable(ME, [month]) > 0; the realized rate of the closed month reads as a number', duT > 0n && typeof apr === 'number', EP.fmt(duT) + ' TBLOCK, ' + apr + '% a year (past)');
const b2 = await lit(EP.VIEW.balanceOf(EP.TBLOCK, ME));
t('monthly claim status 1, ME receives what claimable() said', (await send(ME, EP.claimRewardsCall([BigInt(cur + 1)]))).status === '0x1' && (await lit(EP.VIEW.balanceOf(EP.TBLOCK, ME))) - b2 === duT);

console.log((ko ? 'FAILED ' + ko + ' of ' : 'ALL ') + (ok + ko) + ' checks' + (ko ? '' : ' hold') + ' (local fork ' + U + ', nothing sent to Base)');
process.exit(ko ? 1 : 0);
