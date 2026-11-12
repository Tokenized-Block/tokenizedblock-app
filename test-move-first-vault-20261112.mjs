/* test-move-first-vault-20261112.mjs — move-first-vault.js (and its page): every TBLOCK of the first holders vault and of the TBLOCK
 *   buyback that pays into it, to the holders vault. Three steps: sweepToDest (anyone), announceRescue (a dev wallet), rescue + transfer.
 * A  EXECUTED  the calls: addresses from the records only; data == `cast calldata` (independent encoder); the transfer names the holders
 *              vault and the exact amount.
 * B  EXECUTED  etapes() on stub states: who may sign each step (step 2 refused to a non-dev wallet, step 3 to anyone but the announcer),
 *              the amount (step 2 = free(), never the balance; step 3 = min(announced, free)), the window (before / open / last 5 min /
 *              expired, from the CHAIN clock), no re-announce while pending, renounced and incoherent states block everything, the batch
 *              only when atomic AND no public call can lower the amount, the follow-up transfer only for the rescued amount.
 * C  EXECUTED  the checks after a receipt: tx.from, status, exact call, and only TBLOCK logs EMITTED BY TBLOCK (a forged emitter is ignored).
 * D  EXECUTED  preparer() against a stub chain: simulations are sent FROM the wallet; step 3 refused when the eth_simulateV1 run does not
 *              show the holders vault counting exactly the amount; envoisVersV() shrinks its window when a node refuses a range.
 * E  SOURCE    the page: imports the module, prepares (fresh reads + simulations) right before each signature, sends only the prepared
 *              calls, batch with atomicRequired, checks every receipt, types no address; both files are served.
 * F  ON CHAIN  (eth_call / eth_simulateV1 on the two public nodes; HORS_LIGNE=1 skips it and says so): the records match the chain;
 *              sweepToDest() from any address succeeds; announceRescue(free) from DEV2 succeeds and from another address reverts NotDev;
 *              a full dry run (sweep, announce, +7 days, rescue, transfer) moves exactly free-after-sweep and the holders vault's free()
 *              grows by exactly that; a rescue before the delay reverts TooEarly, after the window Expired.
 * NE PROUVE PAS: a signature (nothing here signs or sends); the wallet UI; what a stranger does during the 7 days (the fork bench
 *   measures a feedContest in the middle).
 * MOVE_MODULE=<file> imports another module (the mutation runs). The test counts itself and prints n/n. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { selecteur } from './keccak.js';
import { VAULT as VAULT_ECO, TBLOCK as TBLOCK_ECO } from './economie.js';
import { ECONOMIE_DEPLOIEMENT as D } from './economie-deploiement.js';
import { ADRESSES_PACK_ECONOMIE_V2 as A } from './economie-v2-pack-deploye.js';

const ICI = dirname(fileURLToPath(import.meta.url));
const M = await import(process.env.MOVE_MODULE ? pathToFileURL(process.env.MOVE_MODULE).href : './move-first-vault.js');
const lire = (f) => { try { return readFileSync(join(ICI, f), 'utf8').replace(/\r\n/g, '\n'); } catch (_) { return ''; } };
let n = 0, ko = 0;
const t = (label, cond) => { n += 1; if (cond === true) console.log('  ok   ' + label); else { ko += 1; console.log('  KO   ' + label); } };
const jette = (f) => { try { f(); return false; } catch (_) { return true; } };
const castOk = (() => { try { execFileSync('cast', ['--version'], { stdio: 'ignore' }); return true; } catch (_) { return false; } })();
const cast = (...a) => execFileSync('cast', a, { encoding: 'utf8' }).trim().toLowerCase();
const w = (x) => BigInt(x).toString(16).padStart(64, '0');
const wa = (a) => String(a).toLowerCase().replace(/^0x/, '').padStart(64, '0');
const E18 = 10n ** 18n;
const GROK = String(D.vault.config.dev2).toLowerCase(), DEV = String(D.vault.config.dev).toLowerCase();
const AUTRE = '0x' + 'ab'.repeat(20), FAUX = '0x' + 'cd'.repeat(20);

console.log('A the calls');
t('addresses come from the records (economie.js, economie-deploiement.js, the pack deployment record)', M.VAULT1 === VAULT_ECO && M.TBLOCK === TBLOCK_ECO
  && M.BUYBACK === D.adresseBuyback.toLowerCase() && M.V === A.V && M.DEV2_RECORD === GROK && M.DEV_RECORD === DEV && M.V !== M.VAULT1);
t('selectors are computed from the signatures', M.SEL.sweep === selecteur('sweepToDest()') && M.SEL.announce === selecteur('announceRescue(uint256)')
  && M.SEL.rescue === selecteur('rescue()') && M.SEL.transfer === '0xa9059cbb');
const P0 = 699434711532762563285026n;
t('sweep: to the buyback, value 0', M.appelSweep().to === M.BUYBACK && M.appelSweep().data === M.SEL.sweep && M.appelSweep().value === '0x0');
t('announce: to the first vault, the amount as the only argument', M.appelAnnonce(P0).to === M.VAULT1 && M.appelAnnonce(P0).data === M.SEL.announce + w(P0));
t('rescue: to the first vault, no argument', M.appelRescue().to === M.VAULT1 && M.appelRescue().data === M.SEL.rescue);
t('transfer: to TBLOCK, recipient = the holders vault, amount exact', M.appelVersV(P0).to === M.TBLOCK && M.appelVersV(P0).data === '0xa9059cbb' + wa(A.V) + w(P0));
t('zero amounts throw', jette(() => M.appelAnnonce(0n)) && jette(() => M.appelVersV(0n)));
if (castOk) {
  t('transfer data == cast calldata', M.appelVersV(P0).data === cast('calldata', 'transfer(address,uint256)', A.V, P0.toString()));
  t('announce data == cast calldata', M.appelAnnonce(P0).data === cast('calldata', 'announceRescue(uint256)', P0.toString()));
  t('sweep / rescue == cast calldata', M.appelSweep().data === cast('calldata', 'sweepToDest()') && M.appelRescue().data === cast('calldata', 'rescue()'));
} else console.log('  --   cast not found: the independent-encoder checks are SKIPPED (not counted)');

console.log('B the steps, on stub states');
const NOW = 1794493671n;
function etat(o = {}) {
  const v1 = { tblock: M.TBLOCK, dev: DEV, dev2: GROK, likes: FAUX, contest: FAUX, balance: 549434n * E18, free: 549434n * E18, reserved: 0n,
    rescueAmount: 0n, rescueAt: 0n, rescueBy: '0x' + '0'.repeat(40), renounced: false, delay: M.RESCUE_DELAY, window: M.RESCUE_WINDOW,
    closeCursor: 0n, lastFeedAt: 0n, feedMax: 862000n * E18, feedCooldown: 86400n, ...(o.vault1 || {}) };
  return { chaine: '0x2105', bloc: 1n, now: o.now ?? NOW, codes: { vault1: '0x60', buyback: '0x60', v: '0x60', ...(o.codes || {}) }, vault1: v1,
    buyback: { tblock: M.TBLOCK, dest: M.VAULT1, balance: 150000n * E18, ...(o.buyback || {}) },
    v: { tblock: M.TBLOCK, balance: 847983n * E18, free: 847983n * E18, reserved: 0n, ...(o.v || {}) },
    wallet: o.wallet === undefined ? null : o.wallet, menaces: o.menaces || [], semaines: [], contest: null, ...(o.extra || {}) };
}
const S = (e, wal, suivi, opts) => M.etapes(e, wal, suivi, opts);
let e = etat();
let s = S(e, AUTRE);
t('start: step 1 offered to ANY wallet (public call), step 2 not (sweep first), step 3 waits', s[0].offert && s[0].statut === 'a-faire' && !s[1].offert && /step 1 first/.test(s[1].raison) && !s[2].offert);
t('step 1 amount = the buyback balance, call = sweep', s[0].montant === 150000n * E18 && s[0].appels[0].data === M.SEL.sweep);
const apres = { buyback: { balance: 0n }, vault1: { balance: 699434n * E18, free: 699434n * E18 } };
e = etat(apres);
t('after the sweep: step 1 done', S(e, AUTRE)[0].statut === 'fait');
t('step 2 offered to DEV2 (Grok) with amount = free()', S(e, GROK)[1].offert && S(e, GROK)[1].montant === 699434n * E18 && S(e, GROK)[1].appels[0].data === M.SEL.announce + w(699434n * E18));
t('step 2 offered to DEV too (the contract allows both)', S(e, DEV)[1].offert);
t('step 2 REFUSED to a wallet that is not a dev wallet', !S(e, AUTRE)[1].offert && /not a dev wallet/.test(S(e, AUTRE)[1].raison) && !S(e, AUTRE)[1].appels);
t('step 2 with no wallet: not offered', !S(e, null)[1].offert);
e = etat({ buyback: { balance: 0n }, vault1: { balance: 700000n * E18, free: 600000n * E18, reserved: 100000n * E18 } });
t('step 2 announces free(), never the balance (reserved part excluded)', S(e, GROK)[1].montant === 600000n * E18 && S(e, GROK)[1].appels[0].data.endsWith(w(600000n * E18)));
e = etat({ buyback: { balance: 0n }, vault1: { balance: 0n, free: 0n } });
t('nothing free: step 2 done, nothing offered', S(e, GROK)[1].statut === 'fait' && !S(e, GROK)[1].offert);
/* pending announcement */
const ann = (now, extra = {}) => etat({ now, buyback: { balance: 0n }, vault1: { balance: 699434n * E18, free: 699434n * E18, rescueAmount: 699434n * E18, rescueAt: NOW + M.RESCUE_DELAY, rescueBy: GROK, ...extra } });
e = ann(NOW + 3600n);
s = S(e, GROK);
t('pending, before the delay: window "attente", step 3 NOT offered even to the announcer', M.fenetre(e).etat === 'attente' && !s[2].offert && s[2].statut === 'attente');
t('pending: step 2 not offered again (a new announcement would restart the 7 days)', !s[1].offert && s[1].statut === 'fait');
t('one second before rescueAt: still not offered', !S(ann(NOW + M.RESCUE_DELAY - 1n), GROK)[2].offert);
e = ann(NOW + M.RESCUE_DELAY);
s = S(e, GROK);
t('at rescueAt: open, step 3 offered to the announcer, amount = announced', M.fenetre(e).etat === 'ouverte' && s[2].offert && s[2].montant === 699434n * E18);
t('step 3 refused to the other dev wallet (only the announcer can execute)', !S(e, DEV)[2].offert && /did not announce/.test(S(e, DEV)[2].raison));
t('step 3 refused to a stranger', !S(e, AUTRE)[2].offert);
t('no batch without atomic support: rescue alone first', s[2].mode === 'sequence' && s[2].appels.length === 1 && s[2].appels[0].data === M.SEL.rescue);
s = S(e, GROK, {}, { atomique: true });
t('atomic and no threat: one batch [rescue, transfer(holders vault, P)]', s[2].mode === 'lot' && s[2].appels.length === 2 && s[2].appels[1].data === M.appelVersV(699434n * E18).data);
e = ann(NOW + M.RESCUE_DELAY, {}); e.menaces = [{ quoi: 'feedContest', montant: 1n }];
t('atomic BUT a public call can lower the amount now: no batch', S(e, GROK, {}, { atomique: true })[2].mode === 'sequence');
e = ann(NOW + M.RESCUE_DELAY, { free: 500000n * E18, balance: 500000n * E18 });
t('free fell below the announced amount: P = free (what rescue really pays)', S(e, GROK, {}, { atomique: true })[2].montant === 500000n * E18
  && S(e, GROK, {}, { atomique: true })[2].appels[1].data.endsWith(w(500000n * E18)));
e = ann(NOW + M.RESCUE_DELAY, { free: 800000n * E18, balance: 800000n * E18 });
t('free rose above it: P = announced (the rest stays for a new round)', S(e, GROK)[2].montant === 699434n * E18);
t('last 5 minutes of the window: not offered', !S(ann(NOW + M.RESCUE_DELAY + M.RESCUE_WINDOW - 200n), GROK)[2].offert);
t('last second of the window minus the margin: offered', S(ann(NOW + M.RESCUE_DELAY + M.RESCUE_WINDOW - M.MARGE_FIN_S), GROK)[2].offert);
e = ann(NOW + M.RESCUE_DELAY + M.RESCUE_WINDOW + 1n);
s = S(e, GROK);
t('after the window: expired, step 3 not offered, step 2 offered again', M.fenetre(e).etat === 'expiree' && !s[2].offert && s[2].statut === 'expiree' && s[1].offert);
t('the window comes from the CHAIN clock (e.now), not the computer', M.fenetre(ann(NOW)).resteS === M.RESCUE_DELAY);
e = ann(NOW + M.RESCUE_DELAY, { free: 0n, balance: 0n });
t('nothing free at rescue time: not offered (rescue would revert NoRescue)', !S(e, GROK)[2].offert);
/* blocked states */
t('renounced: everything blocked', S(etat({ vault1: { renounced: true } }), GROK).every((x) => x.statut === 'bloque' && !x.offert));
t('another network: everything blocked', S({ ...etat(), chaine: '0x1' }, GROK).every((x) => !x.offert) && M.coherence({ ...etat(), chaine: '0x1' }).length === 1);
t('buyback paying elsewhere: blocked', M.coherence(etat({ buyback: { dest: FAUX } })).length === 1 && !S(etat({ buyback: { dest: FAUX } }), GROK)[0].offert);
t('dev wallets different from the record: blocked', M.coherence(etat({ vault1: { dev2: FAUX } })).length === 1);
t('another TBLOCK: blocked', M.coherence(etat({ v: { tblock: FAUX } })).length === 1);
t('a contract without code: blocked', M.coherence(etat({ codes: { v: '0x' } })).length === 1);
t('another delay: blocked', M.coherence(etat({ vault1: { delay: 1n } })).length === 1);
t('coherent stub: no reason', M.coherence(etat()).length === 0);
/* the follow-up after a two-transaction rescue */
const R = { montant: 699434n * E18, par: GROK, hash: '0x' + '11'.repeat(32) };
e = etat({ buyback: { balance: 0n }, vault1: { balance: 0n, free: 0n }, wallet: { adresse: GROK, tblock: 946000n * E18 } });
s = S(e, GROK, { rescue: R });
t('after the rescue: step 3 = transfer(holders vault, EXACTLY the rescued amount), offered to the wallet that received it', s[2].offert && s[2].mode === 'suite' && s[2].appels[0].data === M.appelVersV(R.montant).data);
t('the follow-up is refused to another wallet', !S(etat({ wallet: { adresse: DEV, tblock: 10n ** 30n }, buyback: { balance: 0n } }), DEV, { rescue: R })[2].offert);
t('the follow-up is refused when the wallet holds less than the rescued amount', !S(etat({ wallet: { adresse: GROK, tblock: R.montant - 1n }, buyback: { balance: 0n } }), GROK, { rescue: R })[2].offert);
t('after the transfer: step 3 done', S(e, GROK, { rescue: R, versV: { montant: R.montant, hash: R.hash } })[2].statut === 'fait');
e = ann(NOW + 3600n);
t('a NEW announcement after a finished round is not hidden by it', S(e, GROK, { rescue: R, versV: { montant: R.montant, hash: R.hash } })[2].statut === 'attente');

console.log('C after the receipt');
const wl = (x) => '0x' + w(x);
const tlog = (from, to, v, address = M.TBLOCK) => ({ address, topics: [M.TOPIC.Transfer, '0x' + wa(from), '0x' + wa(to)], data: wl(v) });
const H = '0x' + '22'.repeat(32);
const mk = (a, from, logs, status = '0x1') => ({ tx: { hash: H, from, to: a.to, input: a.data, value: '0x0' }, recu: { transactionHash: H, status, logs, blockNumber: '0x10' } });
let a = M.appelSweep(), x = mk(a, AUTRE, [tlog(M.BUYBACK, M.VAULT1, 150n)]);
t('sweep: exact call, one TBLOCK transfer buyback -> first vault of the amount read before -> ok', M.controleSweep(a, AUTRE, x.tx, x.recu, 150n).ko.length === 0);
t('sweep: signed by another wallet -> stop (tx.from is checked)', M.controleSweep(a, GROK, x.tx, x.recu, 150n).ko.length > 0);
t('sweep: another amount -> stop', M.controleSweep(a, AUTRE, x.tx, x.recu, 151n).ko.length > 0);
x = mk(a, AUTRE, [tlog(M.BUYBACK, M.VAULT1, 150n, FAUX)]);
t('sweep: a Transfer log emitted by ANOTHER contract is ignored -> stop', M.controleSweep(a, AUTRE, x.tx, x.recu, 150n).ko.length > 0);
x = mk(a, AUTRE, [tlog(M.BUYBACK, M.VAULT1, 150n)], '0x0');
t('sweep: status 0 -> stop', M.controleSweep(a, AUTRE, x.tx, x.recu, 150n).ko.length > 0);
const annLog = (by, amt, at, address = M.VAULT1) => ({ address, topics: [M.TOPIC.RescueAnnounced, '0x' + wa(by)], data: '0x' + w(amt) + w(at) + w(at + M.RESCUE_WINDOW) + w(amt) });
a = M.appelAnnonce(P0); x = mk(a, GROK, [annLog(GROK, P0, NOW + M.RESCUE_DELAY)]);
const ca = M.controleAnnonce(a, GROK, x.tx, x.recu, P0);
t('announce: RescueAnnounced(by Grok, amount) from the first vault -> ok, window read from the event', ca.ko.length === 0 && ca.ouvre === NOW + M.RESCUE_DELAY);
t('announce: from another wallet -> stop', M.controleAnnonce(a, DEV, x.tx, x.recu, P0).ko.length > 0);
t('announce: another amount -> stop', M.controleAnnonce(a, GROK, x.tx, x.recu, P0 - 1n).ko.length > 0);
x = mk(a, GROK, [annLog(DEV, P0, NOW)]);
t('announce: the event names another announcer -> stop', M.controleAnnonce(a, GROK, x.tx, x.recu, P0).ko.length > 0);
x = mk(a, GROK, [annLog(GROK, P0, NOW, FAUX)]);
t('announce: event from another emitter -> stop', M.controleAnnonce(a, GROK, x.tx, x.recu, P0).ko.length > 0);
const resLog = (by, amt, address = M.VAULT1) => ({ address, topics: [M.TOPIC.Rescued, '0x' + wa(by)], data: wl(amt) });
a = M.appelRescue(); x = mk(a, GROK, [tlog(M.VAULT1, GROK, P0), resLog(GROK, P0)]);
t('rescue: Rescued(Grok, P) + TBLOCK first vault -> Grok of P -> ok, P returned', M.controleRescue(a, GROK, x.tx, x.recu).ko.length === 0 && M.controleRescue(a, GROK, x.tx, x.recu).montant === P0);
t('rescue: signed by another wallet -> stop', M.controleRescue(a, AUTRE, x.tx, x.recu).ko.length > 0);
x = mk(a, GROK, [tlog(M.VAULT1, AUTRE, P0), resLog(GROK, P0)]);
t('rescue: TBLOCK paid to another wallet -> stop', M.controleRescue(a, GROK, x.tx, x.recu).ko.length > 0);
x = mk(a, GROK, [tlog(M.VAULT1, GROK, P0 - 1n), resLog(GROK, P0)]);
t('rescue: paid amount differs from the event -> stop', M.controleRescue(a, GROK, x.tx, x.recu).ko.length > 0);
a = M.appelVersV(P0); x = mk(a, GROK, [tlog(GROK, M.V, P0)]);
t('transfer: one TBLOCK transfer Grok -> holders vault of P -> ok', M.controleVersV(a, GROK, x.tx, x.recu, P0).ko.length === 0);
t('transfer: signed by another wallet -> stop', M.controleVersV(a, AUTRE, x.tx, x.recu, P0).ko.length > 0);
x = mk(a, GROK, [tlog(GROK, AUTRE, P0)]);
t('transfer: to another recipient -> stop', M.controleVersV(a, GROK, x.tx, x.recu, P0).ko.length > 0);
x = mk(a, GROK, [tlog(GROK, M.V, P0 - 1n)]);
t('transfer: another amount -> stop', M.controleVersV(a, GROK, x.tx, x.recu, P0).ko.length > 0);
const bad = M.appelVersV(P0 - 1n); x = mk(bad, GROK, [tlog(GROK, M.V, P0 - 1n)]);
t('transfer: a call for another amount than the rescued one -> stop', M.controleVersV(bad, GROK, x.tx, x.recu, P0).ko.length > 0);
const lotTx = { hash: H, from: GROK, to: GROK, input: '0xdeadbeef', value: '0x0' };
const lotRecu = (logs, status = '0x1') => ({ transactionHash: H, status, logs });
t('batch: Rescued(P), first vault -> Grok P, Grok -> holders vault P, from Grok -> ok', M.controleLot(GROK, [{ tx: lotTx, recu: lotRecu([tlog(M.VAULT1, GROK, P0), resLog(GROK, P0), tlog(GROK, M.V, P0)]) }], P0).ko.length === 0);
t('batch: rescue paid less than the transfer sent (own TBLOCK used) -> stop', M.controleLot(GROK, [{ tx: lotTx, recu: lotRecu([tlog(M.VAULT1, GROK, P0 - 5n), resLog(GROK, P0 - 5n), tlog(GROK, M.V, P0)]) }], P0).ko.length > 0);
t('batch: a transaction from another wallet -> stop', M.controleLot(GROK, [{ tx: { ...lotTx, from: AUTRE }, recu: lotRecu([tlog(M.VAULT1, GROK, P0), resLog(GROK, P0), tlog(GROK, M.V, P0)]) }], P0).ko.length > 0);
t('batch: holders vault not paid -> stop', M.controleLot(GROK, [{ tx: lotTx, recu: lotRecu([tlog(M.VAULT1, GROK, P0), resLog(GROK, P0), tlog(GROK, AUTRE, P0)]) }], P0).ko.length > 0);
t('batch: status 0 -> stop', M.controleLot(GROK, [{ tx: lotTx, recu: lotRecu([], '0x0') }], P0).ko.length > 0);

console.log('D preparer, on a stub chain');
function chaine(st, { simV = 'ok', vDelta = null, sendRevert = false } = {}) {
  const vus = [];
  const rep = (to, data) => {
    const d = data.slice(0, 10), arg = data.slice(10);
    const A0 = (x) => '0x' + wa(x);
    if (to === M.TBLOCK && d === M.SEL.balanceOf) { const who = '0x' + arg.slice(24); return wl(who === M.VAULT1 ? st.vault1.balance : who === M.BUYBACK ? st.buyback.balance : who === M.V ? st.v.balance : st.wallet ? st.wallet.tblock : 0n); }
    if (to === M.VAULT1) {
      const m = { [M.SEL.TBLOCK]: A0(st.vault1.tblock), [M.SEL.DEV]: A0(st.vault1.dev), [M.SEL.DEV2]: A0(st.vault1.dev2), [M.SEL.LIKES]: A0(FAUX), [M.SEL.CONTEST]: A0(AUTRE),
        [M.SEL.free]: wl(st.vault1.free), [M.SEL.reserved]: wl(st.vault1.reserved), [M.SEL.rescueAmount]: wl(st.vault1.rescueAmount), [M.SEL.rescueAt]: wl(st.vault1.rescueAt),
        [M.SEL.rescueBy]: A0(st.vault1.rescueBy), [M.SEL.rescueRenounced]: wl(0), [M.SEL.RESCUE_DELAY]: wl(M.RESCUE_DELAY), [M.SEL.RESCUE_WINDOW]: wl(M.RESCUE_WINDOW),
        [M.SEL.closeCursor]: wl(0), [M.SEL.lastFeedAt]: wl(0), [M.SEL.MAX_FEED_PER_CALL]: wl(862000n * E18), [M.SEL.FEED_COOLDOWN]: wl(86400) };
      if (m[d]) return m[d];
      if (d === M.SEL.epochs) return '0x' + w(0) + w(0) + w(0) + w(0) + w(0);
      if (d === M.SEL.feedContest) throw new Error('execution reverted');
    }
    if (to === M.BUYBACK) { if (d === M.SEL.TBLOCK) return A0(M.TBLOCK); if (d === M.SEL.DEST) return A0(M.VAULT1); }
    if (to === M.V) { if (d === M.SEL.TBLOCK) return A0(M.TBLOCK); if (d === M.SEL.free) return wl(st.v.free); if (d === M.SEL.reserved) return wl(0); }
    if (to === FAUX) { if (d === M.SEL.currentEpoch) return wl(0); if (d === M.SEL.epochEnd) return wl(NOW + 86400n); if (d === M.SEL.totalSpentIn) return wl(0); }
    if (to === AUTRE) { if (d === M.SEL.currentRound) return wl(0); if (d === M.SEL.fundRoom) return wl(862000n * E18); }
    throw new Error('unexpected read ' + to + ' ' + d);
  };
  const rpc = async (m, p) => {
    vus.push([m, p]);
    if (m === 'eth_chainId') return '0x2105';
    if (m === 'eth_getBlockByNumber') return { number: '0x10', timestamp: '0x' + st.now.toString(16) };
    if (m === 'eth_getCode') return '0x60';
    if (m === 'eth_call') {
      const q = p[0];
      if (q.from && q.from !== M.NEUTRE && [M.SEL.sweep, M.SEL.announce, M.SEL.rescue, M.SEL.transfer].includes(q.data.slice(0, 10))) { if (sendRevert) throw new Error('execution reverted'); return q.data.slice(0, 10) === M.SEL.rescue ? wl(M.paiementPrevu(st)) : '0x'; }
      return rep(q.to, q.data);
    }
    if (m === 'eth_simulateV1') {
      const calls = p[0].blockStateCalls[0].calls;
      if (simV === 'throw') throw new Error('method not found');
      const P = BigInt('0x' + calls.find((c) => c.data.slice(0, 10) === M.SEL.transfer).data.slice(74));
      const avec = calls.some((c) => c.data === M.SEL.rescue);
      const dv = vDelta === null ? P : vDelta;
      const wb = st.wallet ? st.wallet.tblock : 0n;
      const out = [wl(st.v.free), wl(wb)];
      if (avec) out.push(wl(M.paiementPrevu(st)));
      out.push('0x', wl(st.v.free + dv), wl(avec ? wb : wb - P));
      return [{ calls: out.map((r, i) => ({ status: simV === 'revert' && i === 2 ? '0x0' : '0x1', returnData: r })) }];
    }
    if (m === 'eth_blockNumber') return '0x10';
    throw new Error('unexpected ' + m);
  };
  return { rpc, vus };
}
let st = etat({ wallet: { adresse: GROK, tblock: 0n } });
let c = chaine(st), p = await M.preparer(c.rpc, c.rpc, GROK, 1);
const simSweep = c.vus.find(([m, q]) => m === 'eth_call' && q[0].data === M.SEL.sweep);
t('step 1 ready; the sweep is simulated FROM the wallet', p.pret && !!simSweep && simSweep[1][0].from === GROK && simSweep[1][0].value === '0x0');
c = chaine(st); p = await M.preparer(c.rpc, c.rpc, AUTRE, 2);
t('step 2 for a stranger: not ready, nothing simulated', !p.pret && !c.vus.some(([m, q]) => m === 'eth_call' && q[0].data.startsWith(M.SEL.announce)));
st = etat({ ...apres, wallet: { adresse: GROK, tblock: 0n } });
c = chaine(st); p = await M.preparer(c.rpc, c.rpc, GROK, 2);
const simAnn = c.vus.find(([m, q]) => m === 'eth_call' && q[0].data.startsWith(M.SEL.announce));
t('step 2 ready for Grok after the sweep: announce(free()) simulated from Grok', p.pret && p.appels[0].data === M.SEL.announce + w(699434n * E18) && simAnn && simAnn[1][0].from === GROK);
t('a reverting simulation is refused', !(await M.preparer(chaine(st, { sendRevert: true }).rpc, c.rpc, GROK, 2)).pret);
st = ann(NOW + M.RESCUE_DELAY); st.wallet = { adresse: GROK, tblock: 246365n * E18 };
c = chaine(st); p = await M.preparer(c.rpc, c.rpc, GROK, 3, {}, { atomique: true });
const simV1 = c.vus.find(([m]) => m === 'eth_simulateV1');
t('step 3 ready: eth_simulateV1 run from Grok shows the holders vault +P exactly', p.pret && p.simulation[0].vApres - p.simulation[0].vAvant === 699434n * E18 && simV1[1][0].blockStateCalls[0].calls.every((q) => q.from === GROK));
t('step 3: the batch is [rescue, transfer(holders vault, P)]', p.appels.length === 2 && p.appels[1].data === M.appelVersV(699434n * E18).data);
t('step 3 refused when the holders vault would count another amount', !(await M.preparer(chaine(st, { vDelta: 1n }).rpc, chaine(st, { vDelta: 1n }).rpc, GROK, 3)).pret);
t('step 3 refused when the simulation cannot run (fail closed)', !(await M.preparer(chaine(st).rpc, chaine(st, { simV: 'throw' }).rpc, GROK, 3)).pret);
t('step 3 refused when a simulated call reverts', !(await M.preparer(chaine(st).rpc, chaine(st, { simV: 'revert' }).rpc, GROK, 3)).pret);
st = ann(NOW + 3600n); st.wallet = { adresse: GROK, tblock: 0n };
t('step 3 before the window: refused even with every simulation passing', !(await M.preparer(chaine(st).rpc, chaine(st).rpc, GROK, 3)).pret);
st = etat({ buyback: { balance: 0n }, vault1: { balance: 0n, free: 0n }, wallet: { adresse: GROK, tblock: 946000n * E18 } });
c = chaine(st); p = await M.preparer(c.rpc, c.rpc, GROK, 3, { rescue: R });
t('step 3b: transfer simulated without rescue, wallet -P, holders vault +P', p.pret && p.simulation[0].walletAvant - p.simulation[0].walletApres === R.montant && !c.vus.find(([m]) => m === 'eth_simulateV1')[1][0].blockStateCalls[0].calls.some((q) => q.data === M.SEL.rescue));
/* envoisVersV: a node that refuses wide ranges */
const ranges = [];
const rpcLogs = async (m, q) => {
  if (m === 'eth_blockNumber') return '0x' + (120000).toString(16);
  const [f] = q; const a = BigInt(f.fromBlock), b = BigInt(f.toBlock); ranges.push([a, b]);
  if (b - a + 1n > 10000n) throw new Error('range too large');
  if (f.topics[1] !== '0x' + wa(GROK) || f.topics[2] !== '0x' + wa(M.V) || f.address !== M.TBLOCK) throw new Error('bad filter');
  return a <= 100005n && 100005n <= b ? [{ address: M.TBLOCK, transactionHash: H, blockNumber: '0x' + (100005).toString(16), data: wl(P0) }, { address: FAUX, transactionHash: H, blockNumber: '0x1', data: wl(1) }] : [];
};
const vus2 = await M.envoisVersV(rpcLogs, GROK, 100000n);
t('envoisVersV: shrinks the window when refused, covers every block once, keeps only logs emitted by TBLOCK', vus2.length === 1 && vus2[0].value === P0
  && ranges.filter(([a, b]) => b - a + 1n <= 10000n).reduce((s0, [a, b]) => s0 + (b - a + 1n), 0n) === 20001n);

console.log('E the page');
const PG = lire('move-first-vault.html'), SV = lire('serveur-web.js');
const SC = [...PG.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
t('witness: the page was read', PG.includes('<title>Move the first holders vault</title>'));
t('it loads move-first-vault.js in a try', /try \{ M = await import\('\.\/move-first-vault\.js'\);/.test(SC));
t('a fresh preparer (reads + simulations) right before the wallet opens, nothing sent unless ready', /const p = await M\.preparer\(wrpc, lecteur, acct, k, suivi, \{ atomique \}\);[^\n]*\n    if \(!p\.pret\)/.test(SC));
t('it sends only the prepared call, from the wallet, value 0', SC.includes("wrpc('eth_sendTransaction', [{ from: acct, to: p.appels[0].to, data: p.appels[0].data, value: '0x0' }])") && (SC.match(/eth_sendTransaction/g) || []).length === 1);
t('the batch: wallet_sendCalls with atomicRequired: true, the prepared calls only', SC.includes("atomicRequired: true, calls: p.appels.map((a) => ({ to: a.to, data: a.data, value: '0x0' }))") && (SC.match(/wallet_sendCalls/g) || []).length === 1);
t('every receipt is judged by the module', ['M.controleSweep(', 'M.controleAnnonce(', 'M.controleRescue(', 'M.controleVersV(', 'M.controleLot('].every((f) => SC.includes(f)));
t('the account is re-read at signing time', SC.includes("wrpc('eth_accounts', [])"));
t('a rescue already sent on is looked for before 3b is offered again', SC.includes('M.envoisVersV(wrpc, acct'));
t('the page types no address', !/0x[0-9a-fA-F]{40}/.test(PG));
t('no forbidden words on screen (copy rule)', !/not deployed|under review|fork test|\bv2\b|\bV8\b/i.test(PG.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '')));
const servis = new Set([...((SV.match(/const SERVIS\s*=\s*\[([\s\S]*?)\];/) || [])[1] || '').matchAll(/'([^']+)'/g)].map((m) => m[1]));
t('the page, the module and what they import are served', servis.size > 20 && ['move-first-vault.html', 'move-first-vault.js', 'keccak.js', 'economie.js', 'economie-deploiement.js', 'economie-v2-pack-deploye.js', 'pack-deployed-view.js', 'frais-creation.js'].every((f) => servis.has(f)));

console.log('F on chain');
if (process.env.HORS_LIGNE === '1') console.log('  --   HORS_LIGNE=1: the on-chain clauses are SKIPPED (not counted)');
else {
  for (const node of ['https://base-rpc.publicnode.com', 'https://mainnet.base.org']) {
    let id = 0;
    const rpc = async (method, params) => {
      for (let i = 0; ; i++) {
        const r = await fetch(node, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
        if ((r.status === 429 || r.status >= 500) && i < 10) { await new Promise((o) => setTimeout(o, 600 * (i + 1))); continue; }
        let j; try { j = JSON.parse(await r.text()); } catch (_) { if (i < 10) { await new Promise((o) => setTimeout(o, 600 * (i + 1))); continue; } throw new Error(node + ': not JSON'); }
        if (j.error) { const er = new Error(j.error.message); er.data = j.error.data; throw er; } return j.result;
      }
    };
    const nom = node.replace('https://', '');
    let e0;
    try { e0 = await M.lireEtat(rpc, GROK); } catch (x) { t(nom + ': state read', false); console.log('       ' + x.message); continue; }
    t(nom + ': the records match the chain (coherence)', M.coherence(e0).length === 0);
    console.log('       block ' + e0.bloc + ' ' + M.iso(e0.now) + ' | first vault ' + e0.vault1.balance + ' (free ' + e0.vault1.free + ', reserved ' + e0.vault1.reserved + ') | buyback ' + e0.buyback.balance
      + ' | holders vault ' + e0.v.balance + ' (free ' + e0.v.free + ') | Grok ' + e0.wallet.tblock + ' | announcement ' + e0.vault1.rescueAmount + ' at ' + e0.vault1.rescueAt + ' by ' + e0.vault1.rescueBy
      + ' | threats ' + JSON.stringify(e0.menaces, (k, v) => (typeof v === 'bigint' ? v.toString() : v)));
    const call = (from, a) => rpc('eth_call', [{ from, to: a.to, data: a.data }, 'latest']);
    let r;
    try { r = await call('0x000000000000000000000000000000000000beef', M.appelSweep()); t(nom + ': sweepToDest() from any address succeeds, returns the buyback balance', BigInt(r) === e0.buyback.balance); }
    catch (x) { t(nom + ': sweepToDest() from any address succeeds', false); console.log('       ' + x.message); }
    const A1 = e0.vault1.free + e0.buyback.balance;
    try { await call(GROK, M.appelAnnonce(A1)); t(nom + ': announceRescue(free after sweep) from DEV2 (Grok) succeeds', true); }
    catch (x) { t(nom + ': announceRescue from DEV2 succeeds', false); console.log('       ' + x.message); }
    let rev = null;
    try { await call(AUTRE, M.appelAnnonce(A1)); } catch (x) { rev = x; }
    t(nom + ': announceRescue from another address reverts NotDev()', !!rev && String(rev.data || '').startsWith(selecteur('NotDev()')));
    rev = null; try { await call(GROK, M.appelRescue()); } catch (x) { rev = x; }
    t(nom + ': rescue() today reverts (nothing announced: NoRescue())', e0.vault1.rescueAmount !== 0n || (!!rev && String(rev.data || '').startsWith(selecteur('NoRescue()'))));
    /* the whole path on eth_simulateV1: block 1 sweep + announce, block 2 = +7 days rescue + transfer; then the two edges */
    const q = (from, to, data) => ({ from, to, data });
    const t0 = e0.now;
    const corps = (dt) => ({ blockStateCalls: [
      { calls: [q(AUTRE, M.BUYBACK, M.SEL.sweep), q(GROK, M.VAULT1, M.SEL.free), q(GROK, M.VAULT1, M.appelAnnonce(A1).data)] },
      { blockOverrides: { time: '0x' + (t0 + dt).toString(16) }, calls: [q(GROK, M.V, M.SEL.free), q(GROK, M.VAULT1, M.SEL.rescue), q(GROK, M.TBLOCK, M.appelVersV(A1).data), q(GROK, M.V, M.SEL.free), q(GROK, M.VAULT1, M.SEL.free), q(GROK, M.TBLOCK, M.SEL.balanceOf + wa(M.BUYBACK)), q(GROK, M.TBLOCK, M.SEL.balanceOf + wa(GROK))] },
    ], validation: false });
    try {
      const s1 = await rpc('eth_simulateV1', [corps(M.RESCUE_DELAY + 60n), 'latest']);
      const c1 = s1[0].calls, c2 = s1[1].calls;
      const okAll = [...c1, ...c2].every((x) => x.status === '0x1');
      t(nom + ': dry run, every call succeeds', okAll);
      t(nom + ': free after the sweep = free + buyback balance (the amount announced)', BigInt(c1[1].returnData) === A1);
      t(nom + ': rescue() returns exactly the announced amount', BigInt(c2[1].returnData) === A1);
      const tr = c2[1].logs.filter((l) => l.address.toLowerCase() === M.TBLOCK && l.topics[0] === M.TOPIC.Transfer);
      t(nom + ': the rescue emits ONE TBLOCK transfer first vault -> Grok of that amount', tr.length === 1 && tr[0].topics[1] === '0x' + wa(M.VAULT1) && tr[0].topics[2] === '0x' + wa(GROK) && BigInt(tr[0].data) === A1);
      t(nom + ': the holders vault free() grows by EXACTLY that amount', BigInt(c2[3].returnData) - BigInt(c2[0].returnData) === A1);
      t(nom + ': the first vault and the buyback end at 0, Grok keeps its own balance', BigInt(c2[4].returnData) === 0n && BigInt(c2[5].returnData) === 0n && BigInt(c2[6].returnData) === e0.wallet.tblock);
      console.log('       dry run: announced = rescued = ' + M.fmtTb(A1) + ' TBLOCK; holders vault free ' + M.fmtTb(BigInt(c2[0].returnData)) + ' -> ' + M.fmtTb(BigInt(c2[3].returnData)));
      const tot = await rpc('eth_simulateV1', [corps(M.RESCUE_DELAY - 60n), 'latest']);
      t(nom + ': rescue 1 minute before the delay reverts TooEarly', tot[1].calls[1].status === '0x0' && String((tot[1].calls[1].error && tot[1].calls[1].error.data) || tot[1].calls[1].returnData).startsWith(selecteur('TooEarly(uint256)')));
      const tard = await rpc('eth_simulateV1', [corps(M.RESCUE_DELAY + M.RESCUE_WINDOW + 60n), 'latest']);
      t(nom + ': rescue 1 minute after the window reverts Expired', tard[1].calls[1].status === '0x0' && String((tard[1].calls[1].error && tard[1].calls[1].error.data) || tard[1].calls[1].returnData).startsWith(selecteur('Expired(uint256)')));
    } catch (x) { t(nom + ': dry run on eth_simulateV1', false); console.log('       ' + x.message); }
  }
}
console.log((ko === 0 ? 'GREEN ' : 'RED ') + (n - ko) + '/' + n);
process.exit(ko === 0 ? 0 : 1);
