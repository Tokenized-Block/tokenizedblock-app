// banc-move-first-vault-fork-20261112.mjs — the three steps of move-first-vault.js, SENT on a base-anvil FORK of Base (never mainnet),
//   from Grok's wallet IMPERSONATED on the fork (DEV2 of the first holders vault; read from its deploy record, checked on chain).
//   1 sweepToDest  2 announceRescue(free())  +7 days  3 rescue() then transfer(holders vault, exactly what arrived).
//   Each step: preparer() of the module (fresh reads + simulations from the wallet), the exact call sent, the module's receipt check.
//   Then: the holders vault's balance AND free() grew by exactly the rescued amount; the first vault and the buyback end at 0; Grok's own
//   TBLOCK is untouched. Edges: rescue before the delay reverts TooEarly, after the window Expired, by the other dev NotAnnouncer,
//   an announce by a stranger NotDev. Risk measured: a stranger's feedContest() during the 7 days. The batch check (controleLot) on two
//   real receipts mined in ONE block.
// Exits 2 without a fork: that is NOT a pass. FORK_RPC=http://127.0.0.1:<port> (base-anvil: TBLOCK is a B20, code 0xef).
// Does NOT prove: a wallet UI signing it, wallet_sendCalls itself, what strangers will do on mainnet during the 7 days.
import * as M from './move-first-vault.js';
import { selecteur } from './keccak.js';
const F = process.env.FORK_RPC || 'http://127.0.0.1:8691';
let id = 0, ok = 0, ko = 0;
const t = (n, c, x = '') => { if (c === true) { ok++; console.log('  ok   ' + n); } else { ko++; console.log('  RED  ' + n + (x ? ' · ' + x : '')); } };
const rpc = async (m, p) => {
  const j = await fetch(F, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: m, params: p }) }).then((r) => r.json());
  if (j.error) { const e = new Error(j.error.message); e.data = j.error.data; throw e; }
  return j.result;
};
const GROK = M.DEV2_RECORD, DEV = M.DEV_RECORD, STRANGER = '0x00000000000000000000000000000000000b0b01';
const wa = (a) => a.slice(2).padStart(64, '0');
const bal = async (a) => M.word(await rpc('eth_call', [{ to: M.TBLOCK, data: M.SEL.balanceOf + wa(a) }, 'latest']));
const u = async (to, sel) => M.word(await rpc('eth_call', [{ to, data: sel }, 'latest']));
const recu = async (h) => { for (let k = 0; k < 120; k++) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return r; await new Promise((o) => setTimeout(o, 250)); } return null; };
const envoyer = async (from, a, gas) => { const h = await rpc('eth_sendTransaction', [{ from, to: a.to, data: a.data, value: '0x0', ...(gas ? { gas } : {}) }]); return { h, tx: await rpc('eth_getTransactionByHash', [h]), recu: await recu(h) }; };
const revertDe = async (from, a) => { try { await rpc('eth_call', [{ from, to: a.to, data: a.data }, 'latest']); return null; } catch (e) { return String(e.data || e.message || ''); } };
const avancer = async (s) => { await rpc('evm_increaseTime', ['0x' + BigInt(s).toString(16)]); await rpc('evm_mine', []); };
const fmt = M.fmtTb;

let snap;
try { snap = await rpc('evm_snapshot', []); } catch (e) { console.log('NO FORK at ' + F); process.exit(2); }
try {
  for (const a of [GROK, DEV, STRANGER]) { await rpc('anvil_impersonateAccount', [a]); await rpc('anvil_setBalance', [a, '0xde0b6b3a7640000']); }
  /* eth_simulateV1 on this fork? the module needs it for step 3 (fail closed without it) */
  let simFork = true;
  try { await rpc('eth_simulateV1', [{ blockStateCalls: [{ calls: [{ from: GROK, to: M.V, data: M.SEL.free }] }] }, 'latest']); } catch (e) { simFork = false; }
  console.log('fork ' + F + ' · block ' + BigInt(await rpc('eth_blockNumber', [])) + ' · eth_simulateV1 on the fork: ' + (simFork ? 'yes' : 'NO'));
  const e0 = await M.lireEtat(rpc, GROK);
  t('the records match the fork (coherence)', M.coherence(e0).length === 0, M.coherence(e0).join(' · '));
  const g0 = e0.wallet.tblock, v0 = e0.v.balance, vf0 = e0.v.free, b0 = e0.buyback.balance, f0 = e0.vault1.free;
  console.log('start: first vault ' + fmt(e0.vault1.balance) + ' (free ' + fmt(f0) + ') · buyback ' + fmt(b0) + ' · holders vault ' + fmt(v0) + ' (free ' + fmt(vf0) + ') · Grok ' + fmt(g0));
  t('witness: there is something to move (buyback and first vault both hold TBLOCK)', b0 > 0n && f0 > 0n);

  console.log('step 1');
  let p = await M.preparer(rpc, rpc, GROK, 1);
  t('step 1 offered to Grok (any wallet may sign it)', p.pret === true, p.raison);
  let s = await envoyer(GROK, p.appels[0]);
  let c = M.controleSweep(p.appels[0], GROK, s.tx, s.recu, p.etape.montant);
  t('step 1 receipt passes the module check (tx.from, status 1, one TBLOCK transfer buyback -> first vault of ' + fmt(b0) + ')', c.ko.length === 0, c.ko.join(' · '));
  t('the module check REFUSES the same receipt for another signer', M.controleSweep(p.appels[0], STRANGER, s.tx, s.recu, p.etape.montant).ko.length > 0);
  const f1 = await u(M.VAULT1, M.SEL.free);
  t('buyback at 0, first vault free = before + buyback', (await bal(M.BUYBACK)) === 0n && f1 === f0 + b0);

  console.log('step 2');
  t('a stranger cannot announce (NotDev)', String(await revertDe(STRANGER, M.appelAnnonce(f1))).startsWith(selecteur('NotDev()')));
  p = await M.preparer(rpc, rpc, STRANGER, 2);
  t('the module does not offer step 2 to a stranger', p.pret === false);
  p = await M.preparer(rpc, rpc, GROK, 2);
  t('step 2 offered to Grok with amount = free() after the sweep', p.pret === true && p.etape.montant === f1, p.raison);
  s = await envoyer(GROK, p.appels[0]);
  c = M.controleAnnonce(p.appels[0], GROK, s.tx, s.recu, f1);
  const ts2 = BigInt((await rpc('eth_getBlockByNumber', [s.recu.blockNumber, false])).timestamp);
  t('step 2 receipt passes the module check; executable at = block time + 7 days, expires 2 days later', c.ko.length === 0 && c.ouvre === ts2 + M.RESCUE_DELAY && c.ferme === ts2 + M.RESCUE_DELAY + M.RESCUE_WINDOW, c.ko.join(' · '));
  t('right after: rescue reverts TooEarly', String(await revertDe(GROK, M.appelRescue())).startsWith(selecteur('TooEarly(uint256)')));
  let e2 = await M.lireEtat(rpc, GROK);
  t('the module: step 3 waiting, not offered; step 2 not offered again', !M.etapes(e2, GROK)[2].offert && !M.etapes(e2, GROK)[1].offert && M.fenetre(e2).etat === 'attente');
  await avancer(M.RESCUE_DELAY - 3600n);
  t('one hour before the delay: rescue still reverts TooEarly', String(await revertDe(GROK, M.appelRescue())).startsWith(selecteur('TooEarly(uint256)')));
  await avancer(3600n);
  const apresAnnonce = await rpc('evm_snapshot', []);

  console.log('edges');
  t('the other dev wallet cannot execute Grok\'s announcement (NotAnnouncer)', String(await revertDe(DEV, M.appelRescue())).startsWith(selecteur('NotAnnouncer(address)')));
  await avancer(M.RESCUE_WINDOW + 120n);
  t('after the window: rescue reverts Expired', String(await revertDe(GROK, M.appelRescue())).startsWith(selecteur('Expired(uint256)')));
  const sx = await envoyer(GROK, M.appelRescue(), '0x30d40');
  t('after the window: the sent rescue is mined with status 0 and moves nothing', sx.recu.status === '0x0' && (await bal(M.VAULT1)) === f1);
  e2 = await M.lireEtat(rpc, GROK);
  t('the module: expired, step 3 not offered, step 2 offered again', M.fenetre(e2).etat === 'expiree' && !M.etapes(e2, GROK)[2].offert && M.etapes(e2, GROK)[1].offert);
  await rpc('evm_revert', [apresAnnonce]);
  const apresAnnonce2 = await rpc('evm_snapshot', []);
  /* the risk of the 7 days: a stranger feeds the contest */
  const fd = await envoyer(STRANGER, { to: M.VAULT1, data: M.SEL.feedContest }, '0x7a120');
  const fAfterFeed = await u(M.VAULT1, M.SEL.free);
  t('RISK measured: a stranger\'s feedContest() succeeds during the 7 days', fd.recu.status === '0x1');
  console.log('       feedContest() by a stranger moved ' + fmt(f1 - fAfterFeed) + ' TBLOCK to the block contest pot; free left: ' + fmt(fAfterFeed));
  e2 = await M.lireEtat(rpc, GROK);
  t('the module then pays/offers only what is left (P = min(announced, free))', M.paiementPrevu(e2) === fAfterFeed && (fAfterFeed > 0n ? M.etapes(e2, GROK)[2].offert : !M.etapes(e2, GROK)[2].offert));
  await rpc('evm_revert', [apresAnnonce2]);
  const apresAnnonce3 = await rpc('evm_snapshot', []);

  console.log('step 3 (two transactions)');
  let e3 = await M.lireEtat(rpc, GROK);
  console.log('       threats now: ' + JSON.stringify(e3.menaces, (k, v) => (typeof v === 'bigint' ? v.toString() : v)));
  t('the module: window open, step 3 offered to Grok only', M.fenetre(e3).etat === 'ouverte' && M.etapes(e3, GROK)[2].offert && !M.etapes(e3, DEV)[2].offert && !M.etapes(e3, STRANGER)[2].offert);
  t('with a public threat the module picks two transactions even for an atomic wallet', e3.menaces.length === 0 || M.etapes(e3, GROK, {}, { atomique: true })[2].mode === 'sequence');
  p = await M.preparer(rpc, simFork ? rpc : null, GROK, 3);
  if (simFork) t('preparer(3): simulation shows the holders vault free() +P exactly', p.pret === true && p.simulation[0].vApres - p.simulation[0].vAvant === f1, p.raison);
  else { t('without eth_simulateV1 the module refuses step 3 (fail closed)', p.pret === false); p = { appels: [M.appelRescue()], etape: M.etapes(e3, GROK)[2] }; }
  s = await envoyer(GROK, p.appels[0]);
  const cr = M.controleRescue(p.appels[0], GROK, s.tx, s.recu);
  t('rescue receipt passes the module check: Rescued(Grok, P) and ONE TBLOCK transfer first vault -> Grok of P', cr.ko.length === 0 && cr.montant === f1, cr.ko.join(' · '));
  t('the same receipt is refused for another wallet', M.controleRescue(p.appels[0], DEV, s.tx, s.recu).ko.length > 0);
  const suivi = { rescue: { montant: cr.montant, par: GROK, hash: s.h } };
  p = await M.preparer(rpc, simFork ? rpc : null, GROK, 3, suivi);
  if (simFork) t('preparer(3b): transfer(holders vault, exactly P), simulated', p.pret === true && p.appels[0].data === M.appelVersV(cr.montant).data, p.raison);
  else p = { appels: [M.appelVersV(cr.montant)] };
  t('3b is not offered to another wallet', (await M.preparer(rpc, rpc, DEV, 3, suivi)).pret === false);
  const vAv = await bal(M.V), vfAv = await u(M.V, M.SEL.free);
  s = await envoyer(GROK, p.appels[0]);
  const cv = M.controleVersV(p.appels[0], GROK, s.tx, s.recu, cr.montant);
  t('transfer receipt passes the module check (one TBLOCK transfer Grok -> holders vault of P)', cv.ko.length === 0, cv.ko.join(' · '));
  const vAp = await bal(M.V), vfAp = await u(M.V, M.SEL.free);
  t('holders vault balance grew by EXACTLY P', vAp - vAv === cr.montant && vAp - v0 === cr.montant);
  t('holders vault free() grew by EXACTLY P', vfAp - vfAv === cr.montant && vfAp - vf0 === cr.montant);
  t('first vault ends at 0 (balance and free), buyback at 0', (await bal(M.VAULT1)) === 0n && (await u(M.VAULT1, M.SEL.free)) === 0n && (await bal(M.BUYBACK)) === 0n);
  t('Grok\'s own TBLOCK is untouched', (await bal(GROK)) === g0);
  const found = await M.envoisVersV(rpc, GROK, BigInt(s.recu.blockNumber) - 5n);
  t('envoisVersV finds the transfer (3b is never offered twice)', found.some((x) => x.hash === s.h.toLowerCase() && x.value === cr.montant));
  const eF = await M.lireEtat(rpc, GROK);
  const sF = M.etapes(eF, GROK, { rescue: suivi.rescue, versV: { montant: cv.montant, hash: s.h } });
  t('the module: all three steps done, nothing offered', sF.every((x) => x.statut === 'fait' && !x.offert));
  console.log('       moved ' + fmt(cr.montant) + ' TBLOCK · holders vault ' + fmt(vAv) + ' -> ' + fmt(vAp) + ' (free ' + fmt(vfAv) + ' -> ' + fmt(vfAp) + ')');

  console.log('step 3 as one block (the batch check on real receipts)');
  await rpc('evm_revert', [apresAnnonce3]);
  const P = M.paiementPrevu(await M.lireEtat(rpc, GROK));
  await rpc('evm_setAutomine', [false]);
  const h1 = await rpc('eth_sendTransaction', [{ from: GROK, to: M.VAULT1, data: M.SEL.rescue, value: '0x0', gas: '0x30d40' }]);
  const h2 = await rpc('eth_sendTransaction', [{ from: GROK, ...M.appelVersV(P), gas: '0x30d40' }]);
  await rpc('evm_mine', []); await rpc('evm_setAutomine', [true]);
  const paires = [{ tx: await rpc('eth_getTransactionByHash', [h1]), recu: await recu(h1) }, { tx: await rpc('eth_getTransactionByHash', [h2]), recu: await recu(h2) }];
  t('both in one block', paires[0].recu.blockNumber === paires[1].recu.blockNumber);
  const cl = M.controleLot(GROK, paires, P);
  t('controleLot passes: rescue paid P to Grok, Grok sent P to the holders vault', cl.ko.length === 0 && cl.paye === P && cl.montant === P, cl.ko.join(' · '));
  t('controleLot refuses the same receipts for another wallet', M.controleLot(DEV, paires, P).ko.length > 0);
  t('controleLot refuses them for another amount', M.controleLot(GROK, paires, P + 1n).ko.length > 0);
} finally {
  try { await rpc('evm_setAutomine', [true]); } catch (_) {}
  await rpc('evm_revert', [snap]);
}
console.log((ko === 0 ? 'GREEN ' : 'RED ') + ok + '/' + (ok + ko));
process.exit(ko === 0 ? 0 : 1);
