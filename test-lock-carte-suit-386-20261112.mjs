/* test-lock-carte-suit-386-20261112.mjs — game386 (Phil 2026-11-12, on https://tokenizedblock.space/#wallet, Wallet -> Holders: "Connect your
 *   wallet to see your TBLOCK lock." while a wallet was connected). RUNS the real lock card code of app.html (peindreLock + the monthly
 *   rewards inside it + wLockSuitCompte + peindreVaultWallet, cut from the file) on a fake DOM, with the real economie-pack.js / lock.js /
 *   points-vue.js / holders-vue.js and an eth_call stub that answers the values test-vault-par-wallet-378 copied from the chain (2026-11-12,
 *   block 56502034: Grok 0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b, 3,000,000 TBLOCK locked until 2027-01-11, enrolled).
 *   AFFIRME (each one RED on the pre-fix app.html, saved in bak-386/taskC/app.html):
 *   A  the race measured in the browser on this tree: connect, the lock card read starts, the vault painter repaints for the new wallet while
 *      that read finishes -> the card must END showing the lock (before: only the monthly rewards box was left, the lock gone, and nothing
 *      repainted it for 30-60 s because dataset.compte already said Grok);
 *   B  while the first read of a connected wallet runs, the card never says "Connect your wallet" (it says it is reading);
 *   C  a failed read never leaves "Connect your wallet" under a connected wallet (it says "not read just now"), and the next try shows the lock;
 *   D  a lock read running on ANOTHER card (the Create tab's offer) does not stop the Wallet card from being read;
 *   E  an account switch while the previous wallet's read runs: the card says it reads the new wallet at once, then shows the new wallet;
 *   F  disconnect then reconnect within 30 s: the lock comes back (the throttle follows what the card SHOWS, not the last account read);
 *   G  the UX pass: ONE primary action per state — locked and enrolled -> Lock more; locked not enrolled -> "Join monthly rewards" (the
 *      lock button secondary); something to claim -> "Claim" linking to /claim.html; no lock -> the form first, "Lock" primary; the active
 *      lock's figure is said once (no sentence repeating the big figure); every amount chip has an accessible name.
 *   J  the holders card shows at once (a reading line) and the lock in it once read, not after every vault read (about 40 s here);
 *   I  opening the Wallet tab reads the card at once (before: up to the next 5 s tick).
 *   + MUTANTS of the fix, each must turn a check red.
 *   NE PROUVE PAS: the browser rendering and the real wallet (checked in the built-in browser with a stub wallet, see the game386 report).
 *   Usage: node test-lock-carte-suit-386-20261112.mjs [path/to/app.html]   (default ./app.html; mutants only on the default) */
import { readFileSync } from 'node:fs';
import * as EP from './economie-pack.js';
import * as LK from './lock.js';
import * as ECO from './economie.js';
import * as PV from './points-vue.js';
import * as CV from './coeurs-vue.js';
import * as PTS from './points.js';
import * as HV from './holders-vue.js';

const fichier = process.argv[2] || new URL('./app.html', import.meta.url);
const SOURCE = readFileSync(fichier, 'utf8');

/* ── a fake DOM, enough for the cards ── */
class El {
  constructor(tag) { this.tag = tag; this.kids = []; this.t = ''; this.hidden = true; this.dataset = {}; this.style = { setProperty() {}, removeProperty() {} }; this.className = ''; this.offsetParent = {}; this.id = ''; }
  set textContent(v) { this.kids = []; this.t = String(v); }
  get textContent() { return this.t + this.kids.map((k) => (typeof k === 'string' ? k : k.textContent)).join(''); }
  append(...xs) { this.kids.push(...xs); }
  get lastChild() { return this.kids[this.kids.length - 1]; }
  addEventListener(ty, fn) { (this.ec = this.ec || []).push([ty, fn]); }
  click() { for (const [ty, fn] of this.ec || []) if (ty === 'click') return fn(); }
  get classList() { const el = this; return { toggle() {}, add(c) { el.className = (el.className + ' ' + c).trim(); }, remove() {} }; }
  setAttribute(k, v) { (this.attrs = this.attrs || {})[k] = String(v); }
  getAttribute(k) { return this.attrs && k in this.attrs ? this.attrs[k] : null; }
  tous() { return [this, ...this.kids.filter((k) => typeof k !== 'string').flatMap((k) => k.tous())]; }
}

/* ── the chain, as test-vault-par-wallet-378 copied it from the 2026-11-12 reads ── */
const GROK = '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b';
const DEV = '0x264496cc303f8dbe49a241ea84cd42be8392bc80';
const NEUF = '0x' + '00'.repeat(19) + '01';
const CH = { ep: 0n, epochEnd: 1794960000n, vaultBalance: 847983485797307094017076n, reserved: 0n, free: 847983485797307094017076n, totalPlayIn: 940979492641063762241583n,
  rewardBps: 5000n, rebateBps: 5000n, maxB: 50000000000000000000000000n, minHold: 2789880205312700046735192n,
  par: { [GROK]: { playOf: 940979492641063762241583n, lockFactor: 11667n, active: 3000000000000000000000000n, unlockAt: 1799676860n, bal: 246365066793223524875835n } } };
const zero = { playOf: 0n, lockFactor: 0n, active: 0n, unlockAt: 0n, bal: 0n };
const R_T0 = 1794441600n, R_EPOCH = 2592000n;
const MODE = { inscrit: true, aReclamer: false, lockEnPanne: false };
const w = (x) => '0x' + BigInt(x).toString(16).padStart(64, '0');
const S = EP.SEL;
const selDe = (d) => String(d).slice(2, 10);
const argAdr = (d, k) => '0x' + String(d).slice(10 + 64 * k + 24, 10 + 64 * (k + 1));
function repondre({ to, data }) {
  const s = selDe(data), to_ = String(to).toLowerCase();
  if (to_ === EP.TBLOCK && s === S.balanceOf) return w(argAdr(data, 0) === EP.VAULT ? CH.vaultBalance : (CH.par[argAdr(data, 0)] || zero).bal);
  if (EP.REWARDS && to_ === EP.REWARDS) {
    if (s === S.currentEpoch) return w(MODE.aReclamer ? 1n : 0n);
    if (s === S.epochEnd) return w(R_T0 + (BigInt('0x' + String(data).slice(10, 74)) + 1n) * R_EPOCH);
    if (s === S.nextEpochToClose) return w(MODE.aReclamer ? 1n : 0n);
    if (s === S.hasPlayed || s === S.nextEpochToRelease) return w(0n);
    if (s === S.enrollmentOf) { const p = CH.par[argAdr(data, 0)]; return p && MODE.inscrit ? w(p.unlockAt) + w(1794489350n).slice(2) + w(p.active).slice(2) : w(0n) + w(0n).slice(2) + w(0n).slice(2); }
    if (s === S.rewardEpochsFor) { const u = BigInt('0x' + String(data).slice(10, 74)); const der = (u - R_T0) / R_EPOCH - 1n; const n = der >= 1n ? der : 0n; return w(n > 0n ? 1n : 0n) + w(n > 0n ? der : 0n).slice(2) + w(n).slice(2); }
    /* FIXTURE (not a chain read): a closed month 0 where Grok has 5 wtCOIN + 120 TBLOCK to claim — only to drive the "Claim" state */
    if (s === S.claimable) return argAdr(data, 0) === GROK ? w(5n * 10n ** 18n) + w(120n * 10n ** 18n).slice(2) : w(0n) + w(0n).slice(2);
    if (s === S.pot) return w(5n * 10n ** 18n) + w(120n * 10n ** 18n).slice(2);
    if (s === S.playedWeight) return w(10n ** 24n);
    return w(0n) + w(0n).slice(2) + w(0n).slice(2);
  }
  if (to_ === EP.HEARTS) { if (s === S.currentEpoch) return w(CH.ep); if (s === S.epochEnd) return w(CH.epochEnd); if (s === S.minHold) return w(CH.minHold); if (s === S.EPOCH) return w(604800n); }
  if (to_ === EP.VAULT) {
    if (s === S.reserved) return w(CH.reserved); if (s === S.free) return w(CH.free); if (s === S.totalPlayIn) return w(CH.totalPlayIn);
    if (s === S.REWARD_BPS) return w(CH.rewardBps); if (s === S.REBATE_BPS) return w(CH.rebateBps); if (s === S.MAX_EPOCH_BUDGET) return w(CH.maxB);
    if (s === S.rescueAmount) return w(0n); if (s === S.playOf) return w((CH.par[argAdr(data, 1)] || zero).playOf); if (s === S.lockFactor) return w((CH.par[argAdr(data, 0)] || zero).lockFactor);
    throw new Error('execution reverted (not modelled)');
  }
  if (to_ === LK.LOCK) {
    if (MODE.lockEnPanne) throw new Error('429 Too Many Requests');
    const p = CH.par[argAdr(data, 0)] || zero;
    if (data.startsWith('0x' + LK.SEL.activeLockedOf) || data.startsWith('0x' + LK.SEL.lockedOf)) return w(p.active);
    if (data.startsWith('0x' + LK.SEL.unlockAtOf)) return w(p.unlockAt);
    if (data.startsWith('0x' + LK.SEL.requestedAtOf) || data.startsWith('0x' + LK.SEL.withdrawableAtOf)) return w(0n);
  }
  if (ECO.VAULT && to_ === String(ECO.VAULT).toLowerCase()) return w(0n) + w(0n);
  throw new Error('not modelled: ' + to_ + ' ' + s);
}
let freins = null;
const rpc = async (m, p) => { if (m !== 'eth_call') throw new Error('reads only'); if (freins) await freins(p[0]); return repondre(p[0]); };
const fetch = async (url) => {
  const u = new URL(url, 'http://x'), q = u.searchParams.get('compte') || u.searchParams.get('wallet') || null;
  const corps = u.pathname === '/api/points' ? { ok: true, complet: true, compte: q === GROK ? { holder: GROK, total: 11.6, parJour: 37.5, mult: 1.25, lock: 0.8, jeu: 10.8, rang: 1, part: 1 } : { holder: q, total: 0, lock: 0, jeu: 0, rang: null, part: 0 }, board: [] }
    : u.pathname === '/api/coeurs' ? { ok: true, complet: true, semainesParContrat: {}, board: [], compte: q ? { compte: q, donnes: { likes: '0', burned: '0', vers: [] }, recus: { likes: '0', de: [] }, blocsSansCreateur: 0, sesBlocks: [] } : undefined }
      : u.pathname === '/api/tblock/hold' ? { ok: true, priceNow: 0.0000053 } : { ok: false };
  return { json: async () => corps };
};
const attendre = (ms = 30) => new Promise((r) => setTimeout(r, ms));

/* ── the code, cut from the file: the lock card (its state, peindreLock, the rewards) and the Wallet holders code (to the 5 s timer) ── */
function charger(APP) {
  const finFn = /\r?\n\}\r?\n/g;
  const la = APP.indexOf('const lockEtat = {'), lb0 = APP.indexOf('async function peindreRecompensesLock(');
  finFn.lastIndex = Math.max(lb0, 0);
  const m = finFn.exec(APP), lb = m ? m.index + m[0].length : 0;
  const a = APP.indexOf('let wVaultLu = 0'), b = APP.indexOf('setInterval(() => { try { wLockSuitCompte(); }');
  if (!(la > 0 && lb0 > la && lb > lb0 && a > 0 && b > a)) throw new Error('card code not found in the file');
  const ids = ['#wVault', '#v-wallet', '#wVaultRows', '#wVaultComment', '#wPoints', '#wPointsMoi', '#wPointsGros', '#wPointsBoard', '#wPointsRegle', '#wCoeurs', '#wCoeursMoi', '#wCoeursBoard', '#wLock', '#cLockOffre'];
  const dom = Object.fromEntries(ids.map((i) => [i, new El('div')]));
  const document = { hidden: false, createElement: (tag) => new El(tag) };
  const envois = [];
  /* 2026-11-14: LW.WEEKLY = null: the weekly lock rewards (game403) are not modelled in this recording; proven on the fork instead */
  const deps = { LW: { WEEKLY: null }, $: (q) => dom[q] || null, document, EP, LK, ECO, PV, CV, PTS, HV, rpc, fetch, AbortSignal, bcLikeUsd: null, allerA() {}, choisirBrain() {}, bcRepeindre() {},
    envoyerAppels: async (appels, qui) => { envois.push({ appels, qui }); return { etat: 'REFUSE', pourquoi: 'refused by the test wallet (4001)' }; }, bcResoudre: () => ({}), court: (x) => x.slice(0, 8) };
  // eslint-disable-next-line no-new-func
  const C = new Function('deps', 'with (deps) { let compte = null;\n' + APP.slice(la, lb) + APP.slice(a, b)
    + '\nreturn { peindreLock, peindreVaultWallet, wLockSuitCompte, setCompte: (x) => { compte = x; }, raz: () => { wVaultLu = 0; } }; }')(deps);
  return { C, dom, envois };
}

async function verifier(APP) {
  const fautes = [];
  const t = (m, c, x = '') => { if (!c) fautes.push(m + (x ? ' :: ' + String(x).slice(0, 260) : '')); };
  let C, dom, envois;
  try { ({ C, dom, envois } = charger(APP)); } catch (e) { return ['the code loads :: ' + e.message]; }
  const txt = () => dom['#wLock'].textContent;
  const LOCK_G = /Locked 3,000,000 TBLOCK until 2027-01-11/;
  const tenir = (pred) => { let lacher; const p = new Promise((r) => { lacher = r; }); freins = async (c) => { if (pred(c)) await p; }; return () => { freins = null; lacher(); }; };
  const estLock = (c) => String(c.to).toLowerCase() === LK.LOCK;
  const estRewards = (c) => EP.REWARDS && String(c.to).toLowerCase() === EP.REWARDS;
  try {
    /* the Wallet tab open with no wallet: the card says connect (both before and after the fix) */
    C.setCompte(null); await C.peindreVaultWallet(); await attendre();
    t('setup: no wallet -> "Connect your wallet to see your TBLOCK lock."', /^Connect your wallet to see your TBLOCK lock\.$/.test(txt()), txt());

    /* A — the race measured in the browser: the lock read is finishing (its rewards part) when the vault painter repaints for the new wallet */
    let lacher = tenir((c) => estRewards(c));
    C.setCompte(GROK); C.wLockSuitCompte(); await attendre();
    const vEnCours = C.peindreVaultWallet(); await attendre(60);
    lacher(); await vEnCours; await attendre(80);
    t('A connect + vault repaint during the lock read: the card ENDS showing the lock (3,000,000 TBLOCK until 2027-01-11)', LOCK_G.test(txt()), txt());
    t('A the card shows the lock ONCE (no second copy of the card)', (txt().match(/Your TBLOCK lock/g) || []).length === 1, txt());
    t('A the card never says "Connect your wallet" under the connected wallet', !/Connect your wallet/.test(txt()), txt());

    /* B — the first read of a connected wallet is slow (a busy node): the card says it is reading, never "Connect your wallet" */
    C.setCompte(null); C.raz(); await C.peindreVaultWallet(); await attendre();
    lacher = tenir((c) => estLock(c));
    C.setCompte(GROK); C.wLockSuitCompte(); await attendre();
    t('B while the lock is read: no "Connect your wallet" under a connected wallet', !/Connect your wallet/.test(txt()), txt());
    t('B while the lock is read: the card says it is reading', /Reading your TBLOCK lock/.test(txt()), txt());
    C.wLockSuitCompte(); C.wLockSuitCompte(); await attendre();
    lacher(); await attendre(80);
    t('B once read: the lock', LOCK_G.test(txt()) && (txt().match(/Your TBLOCK lock/g) || []).length === 1, txt());

    /* C — the read fails (429 on every node): "not read just now", never "Connect your wallet"; the next try shows the lock */
    C.setCompte(null); C.raz(); await C.peindreVaultWallet(); await attendre();
    MODE.lockEnPanne = true;
    C.setCompte(GROK); C.wLockSuitCompte(); await attendre(60);
    t('C failed read: no "Connect your wallet" under a connected wallet', !/Connect your wallet/.test(txt()), txt());
    t('C failed read: says the lock was not read', /not read just now/.test(txt()), txt());
    MODE.lockEnPanne = false;
    dom['#wLock'].dataset.lu = String(Date.now() - 31000); /* the 10 s back-off has passed */
    C.wLockSuitCompte(); await attendre(80);
    t('C the next try (5 s tick) shows the lock', LOCK_G.test(txt()), txt());

    /* D — the Create tab's offer card is reading (another card): the Wallet card is read anyway */
    C.setCompte(null); C.raz(); await C.peindreVaultWallet(); await attendre();
    lacher = tenir((c) => estLock(c) && freins && D_bloque);
    let D_bloque = true;
    C.setCompte(GROK);
    const offre = C.peindreLock(dom['#cLockOffre'], { offre: true }); await attendre();
    D_bloque = false;
    C.wLockSuitCompte(); await attendre(80);
    t('D a read on the Create offer card does not hold the Wallet card: it shows the lock', LOCK_G.test(txt()), txt());
    lacher(); await offre; await attendre();

    /* E — switch while the previous wallet's read runs: at once "reading" for the new one, then the new wallet's card */
    C.setCompte(GROK); C.raz(); await C.peindreVaultWallet(); await attendre(80);
    t('E setup: Grok\'s lock on screen', LOCK_G.test(txt()), txt());
    dom['#wLock'].dataset.lu = '0';
    lacher = tenir((c) => estLock(c) && argAdr(c.data, 0) === GROK);
    const lG = C.peindreLock(dom['#wLock']); await attendre();
    C.setCompte(DEV); C.wLockSuitCompte(); await attendre();
    t('E right after the switch: no lock of the previous wallet, the card says it reads the new one', !/3,000,000/.test(txt()) && /Reading your TBLOCK lock|No TBLOCK locked yet/.test(txt()), txt());
    lacher(); await lG; await attendre(80);
    t('E then: the new wallet\'s card (no lock), the previous wallet\'s late read paints nothing', /No TBLOCK locked yet/.test(txt()) && !/3,000,000/.test(txt()), txt());

    /* F — disconnect then reconnect within 30 s, the disconnect seen first by the vault painter */
    C.setCompte(GROK); C.raz(); await C.peindreVaultWallet(); await attendre(80); C.wLockSuitCompte(); await attendre(80);
    t('F setup: Grok\'s lock', LOCK_G.test(txt()), txt());
    C.setCompte(null); C.raz(); await C.peindreVaultWallet(); await attendre();
    t('F disconnected: connect message', /Connect your wallet/.test(txt()), txt());
    C.setCompte(GROK); C.wLockSuitCompte(); await attendre(80);
    t('F reconnect within 30 s: the lock is back at once', LOCK_G.test(txt()), txt());

    /* H — back and forth (Grok -> dev -> Grok) while the reads run: the card is read again for Grok at once (not held by the 30 s throttle of
     *     Grok's earlier read), and a read of Grok that a newer one replaced never paints its older answer (here: "not enrolled" read before
     *     an enrollment, painted after the newer read that sees it enrolled) */
    C.setCompte(GROK); dom['#wLock'].dataset.lu = '0'; await C.peindreLock(dom['#wLock']); await attendre();
    lacher = tenir((c) => estLock(c) && argAdr(c.data, 0) === DEV);
    /* the switches seen by the vault painter (its own call to peindreLock, which does not reset the card's read time) */
    C.setCompte(DEV); C.raz(); const vDev = C.peindreVaultWallet(); await attendre();
    C.setCompte(GROK); C.raz(); const vGrok = C.peindreVaultWallet(); await attendre(120);
    t('H Grok (read 0 s ago) -> dev (still reading) -> Grok: Grok\'s lock again at once, not "Reading" for 30 s', LOCK_G.test(txt()), txt());
    lacher(); await vDev; await vGrok; await attendre(80);
    MODE.inscrit = false;
    let vu = 0; lacher = tenir((c) => estRewards(c) && selDe(c.data) === S.rewardEpochsFor && BigInt('0x' + String(c.data).slice(10, 74)) === CH.par[GROK].unlockAt && vu++ === 0);
    dom['#wLock'].dataset.lu = '0'; const vieux = C.peindreLock(dom['#wLock']); await attendre();
    C.setCompte(DEV); C.wLockSuitCompte(); await attendre(80);
    MODE.inscrit = true;
    C.setCompte(GROK); C.wLockSuitCompte(); await attendre(120);
    t('H Grok -> dev -> Grok: the card shows Grok again at once (the throttle follows what the card shows)', LOCK_G.test(txt()), txt());
    lacher(); await vieux; await attendre(80);
    t('H the older read of Grok (not enrolled) does not paint over the newer one (enrolled)', LOCK_G.test(txt()) && /· enrolled/.test(txt()) && !/Join monthly rewards/.test(txt()), txt());

    /* G — the UX pass: one primary action per state */
    const prims = () => dom['#wLock'].tous().filter((x) => (x.tag === 'button' || x.tag === 'a') && x.className.split(' ')[0] === 'bouton' && !x.className.split(' ').includes('sec'));
    const parL = (k) => dom['#wLock'].tous().find((x) => x.dataset && x.dataset.l === k) || null;
    C.setCompte(GROK); dom['#wLock'].dataset.lu = '0'; await C.peindreLock(dom['#wLock']); await attendre();
    t('G locked + enrolled, nothing to claim: ONE primary, the lock form button', prims().length === 1 && /^(Lock|Add) /.test(prims()[0].textContent), prims().map((x) => x.textContent).join(' | '));
    const etat = dom['#wLock'].tous().find((x) => x.tag === 'p' && x.attrs && x.attrs.role === 'status');
    t('G the active lock is said once: the big figure, no sentence repeating "3,000,000 TBLOCK locked until"', !/3,000,000 TBLOCK locked until/.test(txt()) && !!etat && etat.textContent === '', etat && etat.textContent);
    const chips = dom['#wLock'].tous().filter((x) => x.tag === 'button' && x.className === 'lkPuce');
    t('G each amount chip has an accessible name', chips.length >= 1 && chips.every((x) => /^Lock /.test(x.getAttribute('aria-label') || '')), chips.map((x) => x.getAttribute('aria-label')).join(' | '));
    MODE.inscrit = false; dom['#wLock'].dataset.lu = '0'; await C.peindreLock(dom['#wLock']); await attendre();
    t('G locked, not enrolled: ONE primary "Join monthly rewards", right under the figures; the lock button secondary', prims().length === 1 && prims()[0].textContent === 'Join monthly rewards' && !!parL('next') && parL('next').tous().includes(prims()[0]),
      prims().map((x) => x.textContent).join(' | '));
    envois.length = 0; await prims()[0].click();
    t('G "Join monthly rewards" sends ONE enroll call for this wallet (the test wallet refuses it)', envois.length === 1 && envois[0].appels.length === 1 && envois[0].appels[0].to.toLowerCase() === EP.REWARDS
      && envois[0].appels[0].data.toLowerCase() === EP.enrollCall(GROK).data.toLowerCase() && /Not done/.test(txt()), JSON.stringify(envois));
    MODE.inscrit = true; MODE.aReclamer = true; dom['#wLock'].dataset.lu = '0'; await C.peindreLock(dom['#wLock']); await attendre();
    const cl = prims()[0];
    t('G something to claim: ONE primary "Claim", a link to /claim.html, its name says the amounts', prims().length === 1 && cl.tag === 'a' && cl.textContent === 'Claim' && cl.href === '/claim.html'
      && /^Claim 120 TBLOCK \+ 5(\.0+)? wtCOIN — opens the claim page$/.test(cl.getAttribute('aria-label') || ''), cl && JSON.stringify({ t: cl.textContent, h: cl.href, a: cl.attrs }));
    t('G the claim line keeps its figures (120 TBLOCK + 5 wtCOIN, 1 month)', /Yours to claim 120 TBLOCK \+ 5(\.0+)? wtCOIN \(1 month\)/.test(txt()), txt());
    MODE.aReclamer = false;
    const FIX = '0x' + '00'.repeat(19) + '03'; CH.par[FIX] = { ...zero, bal: 5000n * 10n ** 18n }; /* FIXTURE: a wallet holding 5,000 TBLOCK, no lock */
    C.setCompte(FIX); await C.peindreLock(dom['#wLock']); await attendre();
    const ordre = dom['#wLock'].kids.filter((x) => typeof x !== 'string').map((x) => x.id || x.dataset.l || x.tag);
    t('G no lock: the form comes before the monthly rewards, its button primary "Lock 1,000 TBLOCK for 7 days"', ordre.indexOf('form') >= 0 && ordre.indexOf('form') < ordre.indexOf('wLockRewards')
      && prims().length === 1 && prims()[0].textContent === 'Lock 1,000 TBLOCK for 7 days', JSON.stringify(ordre) + ' ' + prims().map((x) => x.textContent).join(' | '));
    delete CH.par[FIX];
    /* J — a fresh page: the holders card is shown while the vault reads are still running, and the lock appears in it once read */
    {
      const X = charger(APP);
      const lacherV = tenir((c) => String(c.to).toLowerCase() === EP.VAULT);
      X.C.setCompte(GROK); const vJ = X.C.peindreVaultWallet(); await attendre(120);
      t('J the holders card is visible while the vault reads run, with a reading line', X.dom['#wVault'].hidden === false && /Reading the holders vault/.test(X.dom['#wVaultRows'].textContent), X.dom['#wVault'].hidden + ' ' + X.dom['#wVaultRows'].textContent);
      t('J the lock is on screen before the vault reads are back', X.dom['#wVault'].hidden === false && LOCK_G.test(X.dom['#wLock'].textContent), X.dom['#wLock'].textContent);
      lacherV(); await vJ; await attendre();
    }
    /* I — opening the Wallet tab reads the card at once (it waited for the next 5 s tick) */
    const nav = APP.slice(APP.indexOf("document.querySelector('.navIn').addEventListener('click', (e) => {"), APP.indexOf("if (nom === 'trade') void lireTrending();"));
    t('I opening the Wallet tab runs wLockSuitCompte and the holders card painter at once', nav.includes("if (nom === 'wallet') setTimeout(() => { try { wLockSuitCompte(); } catch (_) { /* the 5 s tick */ } void peindreVaultWallet().catch(() => {}); }, 0);"));
  } catch (e) { fautes.push('threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' / ') : e)); }
  freins = null; MODE.inscrit = true; MODE.aReclamer = false; MODE.lockEnPanne = false;
  return fautes;
}

const MUTANTS = [
  ['throttle back on the last account READ', "if (recent && (hote.dataset.compte === moi || hote.dataset.nonLu === moi)) return;", 'if (recent) return;'],
  ['no "reading" message', "{ hote.dataset.compte = ''; attente('Reading your TBLOCK lock…'); }", "{ hote.dataset.compte = ''; }"],
  ['a failed read paints nothing', "if (hote.dataset.compte !== moi) { hote.dataset.nonLu = moi; attente('Your TBLOCK lock: not read just now. Trying again in a few seconds.'); }", '{}'],
  ['the vault painter empties the lock card again', "for (const k of ['#wCoeursMoi', '#wPointsMoi', '#wCoeursBoard', '#wPointsBoard']) {", "for (const k of ['#wCoeursMoi', '#wPointsMoi', '#wCoeursBoard', '#wPointsBoard', '#wLock']) {"],
  ['one in-flight flag for every card', 'if (lockEtat.lecture.get(hote) === moi) return;', 'if ([...[0]].length && lockEtat.enCours) return; lockEtat.enCours = true;'],
  ['a superseded read still paints', 'const autreWallet = () => autreCompte() || lockEtat.jeton.get(hote) !== jeton;', 'const autreWallet = () => autreCompte();'],
  ['enroll not the primary action', "if (!principal && R && R.inscrit === false) {", 'if (false) {'],
  ['claim not the primary action', "if (!principal && R && R.aPayer.length) {", 'if (false) {'],
  ['the lock button always primary', "const go = el('button', principal ? 'bouton sec' : 'bouton', '');", "const go = el('button', 'bouton', '');"],
  /* game403: the weekly box H joined the order (first for a lock holder, after the form otherwise) */
  ['the form after the rewards for a wallet without lock', 'const reste = locked > 0n ? [H && H.box, R && R.box, form, sortie] : [form, H && H.box, R && R.box, sortie];', 'const reste = [H && H.box, R && R.box, form, sortie];'],
  ['the Wallet tab waits for the 5 s tick again', "  if (nom === 'wallet') setTimeout(", "  if (nom === 'wallet' && false) setTimeout("],
  ['the holders card hidden until every vault read is back', 'rows.append(p); } carte.hidden = false; /* shown while its reads run */', 'rows.append(p); } /* shown while its reads run */'],
  ['the sentence repeating the figure is back', "e.cle === 'actif' && locked > 0n ? '' : e.texte", 'e.texte'],
];

let code = 0;
const f = await verifier(SOURCE);
for (const x of f) console.log('KO', x);
console.log(String(fichier).replace(/^file:\/\/\//, '') + ': ' + (f.length ? f.length + ' check(s) failed — RED' : 'all checks hold — green'));
if (f.length) code = 1;
if (!process.argv[2]) {
  let tues = 0;
  for (const [nom, a, b] of MUTANTS) {
    const n = SOURCE.split(a).length - 1;
    if (n !== 1) { console.log('KO mutant anchor not unique (' + n + '): ' + nom); code = 1; continue; }
    const fm = await verifier(SOURCE.replace(a, () => b));
    if (fm.length) tues++; else { console.log('KO mutant survived: ' + nom); code = 1; }
  }
  console.log('MUTANTS: ' + tues + '/' + MUTANTS.length + ' killed');
}
console.log(code ? 'RED' : 'GREEN');
process.exit(code);
