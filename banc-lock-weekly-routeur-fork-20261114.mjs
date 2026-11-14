/* banc-lock-weekly-routeur-fork-20261114.mjs -- on a LOCAL Base fork (anvil :9549; impersonation and USDC minting exist THERE ONLY):
 *   the holder joins R2, time moves to week 1, then a SKIN mint and a TAM art mint through the TBLOCK payment router, each as the app
 *   builds it (economie-pack.js payBatch) with the markPlayed that marquageApresJeu would append. Every receipt must be status 0x1.
 * AFFIRME: a router mint records the play in R2's VAULT for the PAYER (the holder), so markPlayed appended after it lands; witness:
 *   before the mint, markPlayed for that holder reverts (eth_call).
 * NE PROUVE PAS: a wallet's atomic batch (sent here one call after the other); the app's minOut from a live quote (the router floor is
 *   used here, as in banc-skins-spin-deploy-fork). */
import * as LW from './lock-weekly-app.js';
import * as EP from './economie-pack.js';
import * as LK from './lock.js';
import { selecteur } from './keccak.js';
import { LOCK_WEEKLY_DEPLOIEMENT as REC } from './lock-weekly-deploiement.js';
const URL_ = process.env.FORK || 'http://127.0.0.1:9549';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(URL_)) { console.error('FORK must be a local fork'); process.exit(2); }
let id = 0;
const rpc = async (method, params = []) => {
  const r = await fetch(URL_, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((x) => x.json());
  if (r.error) throw new Error(method + ': ' + (r.error.message || JSON.stringify(r.error)));
  return r.result;
};
let ok = 0, ko = 0;
const t = (m, c, vu = '') => { if (c) ok++; else ko++; console.log((c ? 'ok  ' : 'KO  ') + m + (vu !== '' ? ' — ' + vu : '')); };
const lit = async (v) => EP.word(await rpc('eth_call', [{ to: v.to, data: v.data }, 'latest']));
const call = async (to, sig, args = '') => rpc('eth_call', [{ to, data: selecteur(sig) + args }, 'latest']);
const ua = (a) => String(a).toLowerCase().slice(2).padStart(64, '0');
const u = (x) => BigInt(x).toString(16).padStart(64, '0');
const envoyer = async (from, c, gas = '0x7a1200') => {
  const h = await rpc('eth_sendTransaction', [{ from, to: c.to, data: c.data, value: c.value || '0x0', gas }]);
  let r = null; for (let i = 0; i < 60 && !r; i++) { r = await rpc('eth_getTransactionReceipt', [h]); if (!r) await new Promise((o) => setTimeout(o, 250)); }
  return r;
};
const imp = async (a) => { await rpc('anvil_impersonateAccount', [a]); await rpc('anvil_setBalance', [a, '0x' + (10n ** 18n).toString(16)]); };
const H = REC.deployeur.toLowerCase();
t('R2 has code at the recorded address', (await rpc('eth_getCode', [LW.WEEKLY, 'latest'])).length > 1000, LW.WEEKLY);
const vaultR2 = '0x' + String(await call(LW.WEEKLY, 'VAULT()')).slice(-40);
t('R2 reads plays from the economy vault V', vaultR2 === EP.VAULT, vaultR2 + ' vs ' + EP.VAULT);
await imp(H);
t('the holder has an active lock', (await lit(LK.VIEW.activeLockedOf(H))) > 0n);
const r1 = await envoyer(H, LW.enrollWeeklyCall(H));
t('enroll: status 1', r1 && r1.status === '0x1', r1 && r1.status);
const fin0 = await lit(LW.VIEW.epochEnd(await lit(LW.VIEW.currentEpoch())));
const blk0 = await rpc('eth_getBlockByNumber', ['latest', false]);
await rpc('evm_increaseTime', [Number(fin0 - BigInt(blk0.timestamp)) + 3600]); await rpc('evm_mine', []);
const sc = await lit(LW.VIEW.currentEpoch());
const poids = await lit(LW.VIEW.weightOf(H, sc));
t('week 1, the lock weighs', sc === 1n && poids > 0n, sc + ' / ' + poids);
/* USDC for the holder, minted on the fork by a minter the masterMinter configures (fork only) */
const MM = '0x' + String(await call(EP.USDC, 'masterMinter()')).slice(-40), MINTER = '0x000000000000000000000000000000000000f00e';
await imp(MM); await imp(MINTER);
await envoyer(MM, { to: EP.USDC, data: selecteur('configureMinter(address,uint256)') + ua(MINTER) + u(100_000_000n) });
const rm = await envoyer(MINTER, { to: EP.USDC, data: selecteur('mint(address,uint256)') + ua(H) + u(20_000_000n) });
t('fork: 20 USDC minted to the holder', rm && rm.status === '0x1');

async function jouer(nom, game, prix, devBps, data) {
  /* witness, before this mint: was the holder already counted? (the first mint must find it unplayed) */
  const dejaMarque = (await lit(LW.VIEW.marked(H, sc))) === 1n;
  if (!dejaMarque) {
    let revert = false; try { await rpc('eth_call', [{ from: H, to: LW.WEEKLY, data: LW.markPlayedCall(H, sc).data }, 'latest']); } catch (_) { revert = true; }
    t(nom + ' witness: markPlayed before the mint reverts', revert);
  }
  const spend = EP.usdcEchange(prix, devBps), plancher = await lit(EP.VIEW.minOutFloor(spend));
  const ts = Number(BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp));
  const [fin, mq] = await Promise.all([lit(LW.VIEW.epochEnd(sc)), lit(LW.VIEW.marked(H, sc))]);
  const [locked, mh, step, iv] = await Promise.all([lit(LK.VIEW.activeLockedOf(H)), lit(EP.VIEW.minHold()), lit(LW.heartsView(EP.HEARTS, 'MAX_STEP_BPS()')), lit(LW.heartsView(EP.HEARTS, 'MIN_INTERVAL()'))]);
  const regle = { holder: H, courant: sc, finSemaineS: fin, maintenantS: BigInt(ts), poids, marque: mq === 1n, maxStepBps: step, minIntervalS: iv, fenetreS: EP.DELAI_PAIEMENT_S };
  /* this holder's real lock (3,000,000 vs minHold ~2.79 M) is too close to the hold line: the app appends NOTHING for it (stated) */
  t(nom + ': with the real lock (' + (locked / 10n ** 18n) + ' vs minHold ' + (mh / 10n ** 18n) + ') the app appends nothing', LW.marquageApresMintTam({ ...regle, locked, minHold: mh }) === null);
  /* the append itself, as the app builds it for a lock that clears the margin; on chain the real lock (> minHold now) still records the
   *   play, so the appended markPlayed is proven to land after a TAM mint */
  const compter = LW.marquageApresMintTam({ ...regle, locked: mh * 2n, minHold: mh }); /* as tam-onglet.js would for a lock 2 × minHold */
  t(nom + ': the helper ' + (dejaMarque ? 'appends nothing (already counted)' : 'appends markPlayed'), dejaMarque ? compter === null : !!compter);
  const lot = [...EP.payBatch({ game, usdcIn: prix, minOut: plancher, deadline: ts + EP.DELAI_PAIEMENT_S, data }), ...(compter ? [compter] : [])];
  const avant = await lit(EP.VIEW.playOf(sc, H));
  for (const [i, c] of lot.entries()) { const r = await envoyer(H, c, '0x2dc6c0'); t(nom + ' call ' + i + ' (' + (c.to === LW.WEEKLY ? 'markPlayed' : i === 0 ? 'approve' : 'router pay') + '): status 1', r && r.status === '0x1', r && r.status + ' gas ' + (r && BigInt(r.gasUsed))); }
  t(nom + ': V.playOf(week, holder) went up', (await lit(EP.VIEW.playOf(sc, H))) > avant);
  t(nom + ': counted in R2', (await lit(LW.VIEW.marked(H, sc))) === 1n);
}
/* the 1 USDC skin, as bcAcheterSkin builds it (NO markPlayed appended): V does not list this Skins (fixed at V's deploy; skins-spin.js
 *   accepted "a mint is not a play"), so the mint lands and records NO play. Measured 2026-11-14 on the first run: the append reverted. */
const snap = await rpc('evm_snapshot');
const prixS = await lit(EP.VIEW.mintPriceSkin()), devS = EP.word(await rpc('eth_call', [EP.VIEW.partJeu(EP.SKINS_MINT), 'latest']), 1);
t('V does not list the 1 USDC Skins the app mints on', BigInt(await call(EP.VAULT, 'isGame(address)', ua(EP.SKINS_MINT))) === 0n);
{
  const ts = Number(BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp));
  const plancher = await lit(EP.VIEW.minOutFloor(EP.usdcEchange(prixS, devS)));
  const lot = EP.payBatch({ game: EP.SKINS_MINT, usdcIn: prixS, minOut: plancher, deadline: ts + EP.DELAI_PAIEMENT_S, data: EP.dataSkin({ block: '0xb2000000000000000000007afa7ed748b0874f27', recipe: 921392438632273567n }) });
  const avant = await lit(EP.VIEW.playOf(sc, H));
  const rs = []; for (const c of lot) rs.push(await envoyer(H, c, '0x2dc6c0'));
  t('skin mint (approve + router pay): status 1', rs.every((r) => r && r.status === '0x1'));
  t('skin: V.playOf(week, holder) did NOT move (a skin mint is not a play)', (await lit(EP.VIEW.playOf(sc, H))) === avant);
  let revert = false; try { await rpc('eth_call', [{ from: H, to: LW.WEEKLY, data: LW.markPlayedCall(H, sc).data }, 'latest']); } catch (_) { revert = true; }
  t('skin: markPlayed after it still reverts (so appending it would have dropped the mint in an atomic batch)', revert);
}
t('back to before the skin', (await rpc('evm_revert', [snap])) === true && (await lit(LW.VIEW.marked(H, sc))) === 0n);
const prixT = BigInt(await call(EP.TAM, 'PRICE_USDC()')), devT = EP.word(await rpc('eth_call', [EP.VIEW.partJeu(EP.TAM), 'latest']), 1);
const octets = new Uint8Array([0x54, 0x41, 0x4d, 1, 4, 0, 1, 2, 3, 4, 5]); /* q = 4 (1..16), byte 5 = 0 (0..1): the checks TamArtV2._mint makes */
await jouer('tam', EP.TAM, prixT, devT, EP.dataTam({ octets, graine: '0x' + '11'.repeat(32), paramsJson: '{}' }));
t('playedWeight(week) >= the lock weight', (await lit(LW.VIEW.playedWeight(sc))) >= poids);
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
