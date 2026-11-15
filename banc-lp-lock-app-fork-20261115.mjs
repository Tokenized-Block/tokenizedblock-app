/* banc-lp-lock-app-fork-20261115.mjs -- on a LOCAL base-anvil fork of Base (started HERE on a free port, stopped at the end; impersonation
 *   exists THERE ONLY), the LP lock card's own plans (lp-lock-app.js), sent one call after the other from a real TBLOCK holder:
 *   (a) step 1 = approvals + full-range mint (planifierAjoutEtLock), step 2 = the number READ FROM STEP 1's RECEIPT
 *   (lirePositionMintee), then approve + lock (planLockExistant with the added liquidity); (b) a position already held, locked by
 *   planLockExistant; extend; then time moves past the lock end and unlock (a) / unlockOnly (b) give the NFTs back with the same liquidity.
 *   Every receipt must be status 0x1 (a reverted tx is never "green").
 * AFFIRME: on the real TBlockLPLock, PositionManager, Permit2, wtCOIN and TBLOCK (B20, run by base-anvil --base): with ANOTHER MINT landing
 *   between the read and step 1 (the race the old one-batch plan lost), the receipt gives the right number (not the guessed one), step 2
 *   locks it, locker = holder, the planned liquidity; lireEtat finds it from the logs; extend moves the end by one week; unlock before the
 *   end reverts; after it, unlock simulated from the holder goes through, and both NFTs come back with their liquidity unchanged.
 *   WITNESS: step 2 on the guessed number is refused by the module (another liquidity); approve / lock of a number not owned revert.
 * NE PROUVE PAS: a wallet's atomic batch (wallet_sendCalls) — here the calls go one by one; a week marked or paid (nobody plays here);
 *   the fees earned (no swaps on the fork); the wtCOIN / TBLOCK the holder lacked were moved to it from the PoolManager ON THE FORK ONLY. */
import { spawn } from 'node:child_process';
import * as A from './lp-lock-app.js';
import { LP_LOCK_DEPLOIEMENT as REC } from './lp-lock-deploiement.js';

const PORT = Number(process.env.FORK_PORT || 9568);
const ANVIL = process.env.BASE_ANVIL || 'C:/Users/VolKov/.foundry/versions/base-v1.1.1/anvil.exe';
const URL_ = 'http://127.0.0.1:' + PORT;
const anvil = spawn(ANVIL, ['--base', '--fork-url', process.env.FORK_URL || 'https://base-rpc.publicnode.com', '--port', String(PORT), '--silent'], { stdio: 'ignore' });
let id = 0;
const rpc = async (method, params = []) => {
  const r = await fetch(URL_, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((x) => x.json());
  if (r.error) throw new Error(method + ': ' + (r.error.message || JSON.stringify(r.error)));
  return r.result;
};
let ok = 0, ko = 0;
const t = (m, c, vu = '') => { if (c) ok++; else { ko++; console.log('KO', m, vu); } };
const fin = (code) => { try { anvil.kill(); } catch (_) {} console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green')); process.exit(code); };
const lit = async (v) => A.word(await rpc('eth_call', [{ to: v.to, data: v.data }, 'latest']));
const envoyer = async (from, c) => {
  let h;
  try { h = await rpc('eth_sendTransaction', [{ from, to: c.to, data: c.data, value: c.value || '0x0', gas: '0x2dc6c0' }]); } catch (e) { return { status: 'refused', why: String(e.message).slice(0, 160) }; }
  /* a hash not mined yet is looked up upstream by the fork; publicnode answers that lookup with a 403 (archive): retried, not fatal */
  let r = null; for (let i = 0; i < 40 && !r; i++) { try { r = await rpc('eth_getTransactionReceipt', [h]); } catch (_) { r = null; } if (!r) await new Promise((o) => setTimeout(o, 250)); }
  return r;
};
const proprio = async (tid) => '0x' + String(await rpc('eth_call', [A.VIEW.ownerOf(tid), 'latest'])).slice(-40);

try {
  let pret = false;
  for (let i = 0; i < 60 && !pret; i++) { try { await rpc('eth_blockNumber'); pret = true; } catch (_) { await new Promise((o) => setTimeout(o, 1000)); } }
  t('base-anvil fork answers on port ' + PORT, pret);
  if (!pret) fin(1);
  const BLOC_FORK = Number(BigInt(await rpc('eth_blockNumber')));
  t('the LP lock has code at the recorded address', (await rpc('eth_getCode', [A.LP_LOCK, 'latest'])).length > 1000, A.LP_LOCK);
  const H = String(REC.deployeur).toLowerCase(); /* a real TBLOCK holder on Base (the recorded deployer); impersonated on the fork only */
  await rpc('anvil_impersonateAccount', [H]);
  await rpc('anvil_setBalance', [H, '0x' + (10n ** 18n).toString(16)]);
  /* fork-only top-up from the PoolManager's balances, so both deposits fit */
  const PMGR = '0x498581ff718922c3f8e6a244956af099b2652b2b'; /* usage-onchain.js POOL_MANAGER */
  await rpc('anvil_impersonateAccount', [PMGR]); await rpc('anvil_setBalance', [PMGR, '0x' + (10n ** 18n).toString(16)]);
  for (const [jeton, q] of [[A.WTCOIN, 2n * 10n ** 16n], [A.TBLOCK, 6n * 10n ** 23n]]) {
    const r = await envoyer(PMGR, { to: jeton, data: '0xa9059cbb' + A.wAddr(H) + A.wUint(q) });
    t('fork top-up ' + jeton.slice(0, 8) + ': status 1', r && r.status === '0x1', r && (r.status || r.why));
  }
  await rpc('anvil_stopImpersonatingAccount', [PMGR]);

  /* (a) step 1: the app's plan, read on the fork — approvals + mint ONLY */
  const plan = await A.planifierAjoutEtLock({ rpc, moi: H, cote: 'wtcoin', montant: 5n * 10n ** 15n, semaines: 4 });
  t('plan (a) step 1 is ready', plan.etat === 'PRET', JSON.stringify(plan, (k, v) => (typeof v === 'bigint' ? v.toString() : v)).slice(0, 300));
  if (plan.etat !== 'PRET') fin(1);
  t('plan liquidity >= MIN_L read on chain', plan.liquidite >= (await lit(A.VIEW.MIN_L())), plan.liquidite);
  t('step 1 ends with the mint and never calls the lock nor approves a position number', plan.appels.at(-1).to === A.PM && !plan.appels.some((c) => c.to === A.LP_LOCK || (c.to === A.PM && c.data.startsWith('0x' + A.SEL_EXT.approve))) && !('tokenId' in plan));
  const devine = await lit(A.VIEW.nextTokenId()); /* what the old one-batch plan would have guessed */
  /* THE RACE, played for real on the fork: another mint lands between the read and step 1 (here a second full-range position of the
   *   same holder, built by the same module; it is (b) below) — the guessed number now belongs to that other mint */
  const plan2 = await A.planifierAjoutEtLock({ rpc, moi: H, cote: 'tblock', montant: 15n * 10n ** 22n, semaines: 4 });
  t('plan for a second position is ready', plan2.etat === 'PRET', plan2.pourquoi);
  for (const c of plan2.appels) { const r = await envoyer(H, c); t('(race) the other mint lands first: status 1', r && r.status === '0x1', r && (r.status || r.why)); }
  t('(race) the guessed number is now the other position', (await proprio(devine)) === H && (await lit(A.VIEW.liquidite(devine))) === plan2.liquidite);
  const avant = { wtcoin: await lit(A.VIEW.balanceOf(A.WTCOIN, H)), tblock: await lit(A.VIEW.balanceOf(A.TBLOCK, H)) };
  let recuMint = null;
  for (const [i, c] of plan.appels.entries()) { const r = await envoyer(H, c); recuMint = r; t('(a) step 1 call ' + i + ' (' + plan.etapes[i] + '): status 1', r && r.status === '0x1', r && (r.status || r.why)); }
  const apres = { wtcoin: await lit(A.VIEW.balanceOf(A.WTCOIN, H)), tblock: await lit(A.VIEW.balanceOf(A.TBLOCK, H)) };
  t('(a) step 1 spent no more than the maxima', avant.wtcoin - apres.wtcoin <= plan.max.wtcoin && avant.tblock - apres.tblock <= plan.max.tblock, (avant.wtcoin - apres.wtcoin) + ' / ' + (avant.tblock - apres.tblock));
  t('(a) step 1 spent something of both tokens', avant.wtcoin > apres.wtcoin && avant.tblock > apres.tblock);
  /* step 2's number: read from step 1's receipt by the module (the PositionManager's own Transfer(0 -> holder, id)) */
  const lpm = await A.lirePositionMintee({ rpc, hashes: [recuMint && recuMint.transactionHash], moi: H });
  t('(a) step 2: exactly one number read from the receipt', lpm.lus === 1 && lpm.ids.length === 1, JSON.stringify(lpm, (k, v) => (typeof v === 'bigint' ? v.toString() : v)));
  const id1 = lpm.ids[0];
  t('(a) the receipt number is NOT the guessed one (the race happened) and is in the wallet with the planned liquidity', id1 !== devine && (await proprio(id1)) === H && (await lit(A.VIEW.liquidite(id1))) === plan.liquidite, id1 + ' vs guessed ' + devine);
  /* WITNESS: step 2 on the guessed number with the added liquidity is refused by the module (it is another position) */
  t('witness: step 2 on the guessed number is refused (another liquidity)', A.planLockExistant({ moi: H, tokenId: devine, semaines: 4, nft: await A.lireNft({ rpc, tokenId: devine, moi: H }), liquiditeAttendue: plan.liquidite }).etat === 'REFUSE');
  /* WITNESS: a number this wallet does not own stops approve and lock on chain */
  const autreId = devine - 1n; /* minted earlier by someone else on Base */
  const wa = await envoyer(H, A.approveNftCall(autreId));
  t('witness: approve(lock, a number this wallet does not own) reverts', !wa || wa.status !== '0x1', wa && (wa.status || wa.why));
  const wl = await envoyer(H, A.lockCall(autreId, 4));
  t('witness: lock(that number) reverts', !wl || wl.status !== '0x1', wl && (wl.status || wl.why));
  const pa = A.planLockExistant({ moi: H, tokenId: id1, semaines: 4, nft: await A.lireNft({ rpc, tokenId: id1, moi: H }), liquiditeAttendue: plan.liquidite });
  t('(a) step 2 plan: approve + lock of the receipt number', pa.etat === 'PRET' && pa.appels.length === 2 && pa.appels[1].data === A.lockCall(id1, 4).data, pa.pourquoi);
  for (const c of pa.appels) { const r = await envoyer(H, c); t('(a) step 2 call: status 1', r && r.status === '0x1', r && (r.status || r.why)); }
  t('(a) the NFT is in the lock', (await proprio(id1)) === A.LP_LOCK);
  const L1 = await lit(A.VIEW.liquidite(id1));
  t('(a) its liquidity is the planned one', L1 === plan.liquidite, L1 + ' vs ' + plan.liquidite);
  /* the card's read finds it through the Locked logs, with no hint */
  /* the log window is kept to the blocks made ON the fork (older ones would be forwarded to the public node, which rate-limits getLogs):
   *   one window of (head - fork block) blocks, no hint — the Locked log must be found by the module's own filter */
  const tete = Number(BigInt(await rpc('eth_blockNumber')));
  const fenetreFork = { fenetres: 1, pas: tete - BLOC_FORK };
  let E = await A.lireEtat({ rpc, moi: H, ...fenetreFork });
  const p1 = E.positions.find((p) => p.tokenId === id1);
  t('lireEtat finds the position from the logs', !!p1 && E.lockedCount === 1n && E.introuvables === 0, E.positions.length + ' ' + JSON.stringify(E.recherche, (k, v) => (typeof v === 'bigint' ? v.toString() : v)));
  t('lireEtat: locker, liquidity, 4 weeks from next week', p1 && p1.liquidite === L1 && p1.fin - p1.debut === 4n && p1.debut === E.courant + 1n);
  t('lireEtat: not open yet, can be extended', p1 && p1.ouvert === false && p1.extensionMax > 0n, p1 && p1.extensionMax);
  /* unlock before the end reverts */
  const tot = await envoyer(H, A.unlockCall(id1));
  t('unlock before the end reverts', !tot || tot.status !== '0x1', tot && (tot.status || tot.why));
  /* extend by one week */
  const re = await envoyer(H, A.extendCall(id1, 1));
  t('extend(+1): status 1', re && re.status === '0x1', re && (re.status || re.why));
  E = await A.lireEtat({ rpc, moi: H, ...fenetreFork, candidats: [id1] });
  t('extend: the end moved by one week', !!p1 && !!E.positions[0] && E.positions[0].fin === p1.fin + 1n);

  /* (b) a position already held: the one minted first in the race above, then planLockExistant */
  const id2 = devine;
  t('(b) the earlier position is still in the wallet', (await proprio(id2)) === H);
  const nft = await A.lireNft({ rpc, tokenId: id2, moi: H });
  const pb = A.planLockExistant({ moi: H, tokenId: id2, semaines: 4, nft });
  t('(b) planLockExistant: approve + lock', pb.etat === 'PRET' && pb.appels.length === 2, pb.pourquoi);
  for (const c of pb.appels) { const r = await envoyer(H, c); t('(b) call: status 1', r && r.status === '0x1', r && (r.status || r.why)); }
  const L2 = await lit(A.VIEW.liquidite(id2));
  t('(b) the NFT is in the lock', (await proprio(id2)) === A.LP_LOCK);
  /* refusals read on chain: someone else's number */
  const nftAutre = await A.lireNft({ rpc, tokenId: autreId, moi: H });
  t('(b) a number in another wallet is refused', A.planLockExistant({ moi: H, tokenId: autreId, semaines: 4, nft: nftAutre }).etat !== 'PRET');

  /* time: past both lock ends */
  E = await A.lireEtat({ rpc, moi: H, ...fenetreFork, candidats: [id1, id2] });
  const fins = E.positions.map((p) => p.unlockAt);
  t('both positions read', E.positions.length === 2, E.positions.length);
  const cible = fins.reduce((a, b) => (a > b ? a : b), 0n);
  await rpc('evm_increaseTime', [Number(cible - E.maintenantS) + 60]); await rpc('evm_mine', []);
  E = await A.lireEtat({ rpc, moi: H, ...fenetreFork, candidats: [id1, id2] });
  t('both positions are open to take back', E.positions.length === 2 && E.positions.every((p) => p.ouvert && p.extensionMax === 0n));
  t('take-back with rewards checked without sending: goes through (so the card offers no emergency exit)', E.positions.every((p) => p.reprise === 'OK'), E.positions.map((p) => p.reprise).join());
  const ru = await envoyer(H, A.unlockCall(id1));
  t('unlock (a): status 1', ru && ru.status === '0x1', ru && (ru.status || ru.why));
  t('unlock (a): the NFT is back in the wallet', (await proprio(id1)) === H);
  t('unlock (a): same liquidity', (await lit(A.VIEW.liquidite(id1))) === L1);
  const ro = await envoyer(H, A.unlockOnlyCall(id2));
  t('emergency exit (b): status 1', ro && ro.status === '0x1', ro && (ro.status || ro.why));
  t('emergency exit (b): the NFT is back in the wallet', (await proprio(id2)) === H);
  t('emergency exit (b): same liquidity', (await lit(A.VIEW.liquidite(id2))) === L2);
  E = await A.lireEtat({ rpc, moi: H, ...fenetreFork, candidats: [id1, id2] });
  t('after both exits: nothing locked', E.lockedCount === 0n && E.positions.length === 0);
  await rpc('anvil_stopImpersonatingAccount', [H]);
  fin(ko ? 1 : 0);
} catch (e) { console.log('KO thrown', e && e.message); ko++; fin(1); }
