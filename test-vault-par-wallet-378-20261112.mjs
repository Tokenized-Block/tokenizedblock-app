/* test-vault-par-wallet-378-20261112.mjs — task 5 of lot 378 (Phil 2026-11-12: "regarde bien que ça soit bien attribué pour chaque user les
 *   bonnes données"). RUNS the real Wallet-tab card code of app.html (peindreVaultWallet + peindrePointsWallet + peindreCoeursWallet, cut
 *   from the file and executed with a fake DOM, the real economie-pack.js / lock.js / points-vue.js / coeurs-vue.js, and a stubbed eth_call
 *   that answers like the live contracts did on 2026-11-12 block 56502034 — values copied from that read, never typed from memory).
 *   AFFIRME:
 *   - the card shows the WEEK totals (V.totalPlayIn, all players) and the WALLET line (V.playOf, this wallet only) as two different reads:
 *     Grok's wallet 940,979 / 940,979 (it is the only player), a wallet that has not played 940,979 / 0, the dev wallet 940,979 / 0;
 *   - the lock factor line is V.lockFactor(wallet) (11,667 bps -> ×1.17) with TBlockLock.activeLockedOf (3,000,000);
 *   - SWITCHING WALLET repaints at once: before this fix the 60 s pace kept wallet A's play, factor and lock under wallet B (and under no
 *     wallet after a disconnect) for up to a minute;
 *   - a read still running for wallet A paints NOTHING once wallet B's read started (before: A's lines landed in B's card);
 *   - the same for the community points and the hearts lines (a late answer for A never overwrites B's).
 *   Usage: node test-vault-par-wallet-378-20261112.mjs [path/to/app.html]   (default: ./app.html)
 *   task 6 (Phil 2026-11-12: "visually easy to understand"): the card is DRAWN (holders-vue.js) — the same figures moved from text rows into
 *   blocks (data-l: vault / week / steps / play / factor; the lock card: lock / lock-pts / form). The checks above read those blocks with the
 *   SAME figures; added: the aria values of every bar (week progressbar, your play and all players meters, the lock-factor meter and its
 *   marks read from the vault's rules), the three steps ticked per wallet, the lock timeline's words, the months as chips, one primary button.
 *   NE PROUVE PAS: the browser rendering (checked separately in the built-in browser), a claim of a closed week (week 0 is still open). */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as EP from './economie-pack.js';
import * as LK from './lock.js';
import * as ECO from './economie.js';
import * as PV from './points-vue.js';
import * as CV from './coeurs-vue.js';
import * as PTS from './points.js';
import * as HV from './holders-vue.js';

const fichier = process.argv[2] || new URL('./app.html', import.meta.url);
const APP = readFileSync(fichier, 'utf8');
let ok = 0, ko = 0;
const t = (m, c, x = '') => { if (c) ok++; else { ko++; console.log('KO', m, x); } };

/* ── the card code, cut from the file (from its state variables to the 5 s timer that drives it) ── */
const a = APP.indexOf('let wVaultLu = 0'), b = APP.indexOf('setInterval(() => { try { wLockSuitCompte(); }'); /* merge game378: main's 5 s timer also repaints the lock card on connect (game377) */
t('the card code is found in the file', a > 0 && b > a);
const CODE = APP.slice(a, b);
/* the lock card of the same tab (peindreLock + the monthly lock rewards inside it), cut the same way */
/* the end of peindreRecompensesLock: a `}` alone on its line, LF or CRLF (test-tests-portables) */
const finFn = /\r?\n\}\r?\n/g;
const la = APP.indexOf('const lockEtat = {') /* game386: per card and per wallet (lecture / jeton) */, lb0 = APP.indexOf('async function peindreRecompensesLock(');
finFn.lastIndex = Math.max(lb0, 0);
const mFin = finFn.exec(APP), lb = mFin ? mFin.index + mFin[0].length : 0;
t('the lock card code is found in the file', la > 0 && lb0 > la && lb > lb0);
const CODE_LOCK = APP.slice(la, lb);

/* ── a fake DOM, enough for the card ── */
class El {
  constructor(tag) { this.tag = tag; this.kids = []; this.t = ''; this.hidden = true; this.dataset = {}; this.style = { setProperty() {}, removeProperty() {} }; this.className = ''; this.offsetParent = {}; }
  set textContent(v) { this.kids = []; this.t = String(v); }
  get textContent() { return this.t + this.kids.map((k) => (typeof k === 'string' ? k : k.textContent)).join(''); }
  append(...xs) { this.kids.push(...xs); }
  get lastChild() { return this.kids[this.kids.length - 1]; }
  addEventListener(ty, fn) { (this.ec = this.ec || []).push([ty, fn]); }
  click() { for (const [ty, fn] of this.ec || []) if (ty === 'click') return fn(); }
  get classList() { return { toggle() {}, add() {}, remove() {} }; }
  setAttribute(k, v) { (this.attrs = this.attrs || {})[k] = String(v); }
  getAttribute(k) { return this.attrs && k in this.attrs ? this.attrs[k] : null; }
  tous() { return [this, ...this.kids.filter((k) => typeof k !== 'string').flatMap((k) => k.tous())]; }
}
const ids = ['#wVault', '#v-wallet', '#wVaultRows', '#wVaultComment', '#wPoints', '#wPointsMoi', '#wPointsGros', '#wPointsBoard', '#wPointsRegle', '#wCoeurs', '#wCoeursMoi', '#wCoeursBoard', '#wLock'];
const dom = Object.fromEntries(ids.map((i) => [i, new El('div')]));
const $ = (s) => dom[s] || null;
const document = { hidden: false, createElement: (tag) => new El(tag) };
const lignes = (id) => dom[id].kids.filter((k) => typeof k !== 'string').map((d) => d.textContent);

/* ── the chain as read on 2026-11-12 (block 56502034, mainnet.base.org and publicnode agreed on every value) ── */
const GROK = '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b';            /* the wallet Phil tested with (tx.from of the lock, heart, TAM mint) */
const DEV = '0x264496cc303f8dbe49a241ea84cd42be8392bc80';             /* economie-v2-pack-deploiement.js "dev" */
const NEUF = '0x' + '00'.repeat(19) + '01';                            /* a wallet that never played */
const CH = {
  ep: 0n, epochEnd: 1794960000n, vaultBalance: 847983485797307094017076n, reserved: 0n, free: 847983485797307094017076n,
  totalPlayIn: 940979492641063762241583n, rewardBps: 5000n, rebateBps: 5000n, maxB: 50000000000000000000000000n, minHold: 2789880205312700046735192n,
  par: {
    [GROK]: { playOf: 940979492641063762241583n, lockFactor: 11667n, active: 3000000000000000000000000n, unlockAt: 1799676860n },
  },
};
CH.par[GROK].bal = 246365066793223524875835n; /* TBLOCK.balanceOf(Grok), same read */
const zero = { playOf: 0n, lockFactor: 0n, active: 0n, unlockAt: 0n, bal: 0n };
/* task 6: read on chain 2026-11-12 block 56519827 (eth_call, mainnet.base.org): V's rules, L.EPOCH, R's month 0 and Grok's enrollment */
const REGLES = { ACCESS_USD: 15n, TIER1_USD: 100n, TIER2_USD: 500n, TIER3_USD: 1000n, TIER1_BONUS: 1500n, TIER2_BONUS: 3000n, TIER3_BONUS: 5000n, TIME_BONUS: 2500n,
  TIME_FULL: 7776000n, MIN_COMMIT: 604800n, MAX_FACTOR: 17500n, CLAIM_WINDOW: 1209600n, REWARD_BPS: 5000n, REBATE_BPS: 5000n, TOP_BPS: 2000n };
const REGLE_SEL = Object.fromEntries(Object.keys(REGLES).map((k) => [String(EP.VIEW.regleVault(k).data).slice(2, 10), REGLES[k]]));
const L_EPOCH = 604800n, R_T0 = 1794441600n, R_EPOCH = 2592000n;
let reglesLisibles = true;
const w = (x) => '0x' + BigInt(x).toString(16).padStart(64, '0');
const S = EP.SEL, SL = LK.SEL || null;
const selDe = (d) => String(d).slice(2, 10);
const argAdr = (d, k) => '0x' + String(d).slice(10 + 64 * k + 24, 10 + 64 * (k + 1));
let freins = null; /* when set: (call) => Promise that holds the answer (to test a read still running) */
function repondre({ to, data }) {
  const s = selDe(data), to_ = String(to).toLowerCase();
  if (to_ === EP.TBLOCK && s === S.balanceOf) return w(argAdr(data, 0) === EP.VAULT ? CH.vaultBalance : (CH.par[argAdr(data, 0)] || zero).bal);
  if (EP.REWARDS && to_ === EP.REWARDS) {
    /* the monthly rewards as read: month 0 open (ends 1797033600), nothing closed, Grok enrolled for his lock; rewardEpochsFor = the whole
     *   months after the current one that end before the date (Grok's date 1799676860 -> months 1..1, the value read on chain) */
    if (s === S.currentEpoch) return w(0n); if (s === S.epochEnd) return w(R_T0 + (BigInt('0x' + String(data).slice(10, 74)) + 1n) * R_EPOCH);
    if (s === S.hasPlayed || s === S.nextEpochToClose || s === S.nextEpochToRelease) return w(0n);
    if (s === S.enrollmentOf) { const p = CH.par[argAdr(data, 0)]; return p ? w(p.unlockAt) + w(1794489350n).slice(2) + w(p.active).slice(2) : w(0n) + w(0n).slice(2) + w(0n).slice(2); }
    if (s === S.rewardEpochsFor) { const u = BigInt('0x' + String(data).slice(10, 74)); const der = (u - R_T0) / R_EPOCH - 1n; const n = der >= 1n ? der : 0n; return w(n > 0n ? 1n : 0n) + w(n > 0n ? der : 0n).slice(2) + w(n).slice(2); }
    return w(0n) + w(0n).slice(2) + w(0n).slice(2);
  }
  if (to_ === EP.HEARTS) {
    if (s === S.currentEpoch) return w(CH.ep); if (s === S.epochEnd) return w(CH.epochEnd); if (s === S.minHold) return w(CH.minHold);
    if (s === S.EPOCH) return w(L_EPOCH);
  }
  if (to_ === EP.VAULT) {
    if (s === S.reserved) return w(CH.reserved); if (s === S.free) return w(CH.free); if (s === S.totalPlayIn) return w(CH.totalPlayIn);
    if (s === S.REWARD_BPS) return w(CH.rewardBps); if (s === S.REBATE_BPS) return w(CH.rebateBps); if (s === S.MAX_EPOCH_BUDGET) return w(CH.maxB);
    if (s === S.rescueAmount) return w(0n);
    if (s === S.playOf) return w((CH.par[argAdr(data, 1)] || zero).playOf);
    if (s === S.lockFactor) return w((CH.par[argAdr(data, 0)] || zero).lockFactor);
    if (reglesLisibles && s in REGLE_SEL) return w(REGLE_SEL[s]);
    throw new Error('execution reverted (not modelled)'); /* the rules text: left unread, the card has a plain sentence for that */
  }
  if (to_ === LK.LOCK) {
    const p = CH.par[argAdr(data, 0)] || zero;
    if (data.startsWith('0x' + LK.SEL.activeLockedOf)) return w(p.active);
    if (data.startsWith('0x' + LK.SEL.unlockAtOf)) return w(p.unlockAt);
    if (data.startsWith('0x' + LK.SEL.lockedOf)) return w(p.active);
    if (data.startsWith('0x' + LK.SEL.requestedAtOf) || data.startsWith('0x' + LK.SEL.withdrawableAtOf)) return w(0n);
  }
  if (ECO.VAULT && to_ === String(ECO.VAULT).toLowerCase()) return w(0n) + w(0n);
  throw new Error('not modelled: ' + to_ + ' ' + s);
}
const rpc = async (methode, params) => {
  if (methode !== 'eth_call') throw new Error('reads only');
  const c = params[0];
  if (freins) await freins(c);
  return repondre(c);
};
let fetchFrein = null;
const API = {
  points: (q) => ({ ok: true, complet: true, compte: q === GROK ? { holder: GROK, lock: 0.8047702546296296, jeu: 10.813489, total: 11.61825925462963, parJour: 37.5, mult: 1.25, rang: 1, part: 1 } : { holder: q, lock: 0, jeu: 0, total: 0, rang: null, part: 0 },
    board: [{ holder: GROK, total: 11.61825925462963, lock: 0.8047702546296296, jeu: 10.813489, parJour: 37.5, mult: 1.25, rang: 1, part: 1, sesBlocks: [] }] }),
  coeurs: (q) => ({ ok: true, complet: true, semainesParContrat: { [EP.HEARTS]: { 0: { joueurs: 1, burned: '92996006843756668224507' } } },
    board: [{ liker: GROK, likes: '1', burned: '92996006843756668224507', sesBlocks: [] }],
    compte: q ? { compte: q, donnes: q === GROK ? { likes: '1', burned: '92996006843756668224507', vers: [] } : { likes: '0', burned: '0', vers: [] }, recus: { likes: '0', de: [] }, blocsSansCreateur: 0, sesBlocks: [] } : undefined }),
};
const fetch = async (url) => {
  const u = new URL(url, 'http://x'), q = u.searchParams.get('compte') || u.searchParams.get('wallet') || null;
  if (fetchFrein) await fetchFrein(u, q);
  const corps = u.pathname === '/api/points' ? API.points(q) : u.pathname === '/api/coeurs' ? API.coeurs(q) : u.pathname === '/api/tblock/hold' ? { ok: true, priceNow: 0.0000053 } : { ok: false };
  return { json: async () => corps };
};

const envois = [];
const deps = { $, document, EP, LK, ECO, PV, CV, PTS, HV, rpc, fetch, envoyerAppels: async (appels, qui) => { envois.push({ appels, qui }); return { etat: 'REFUSE' }; }, bcResoudre: () => ({}), court: (x) => x.slice(0, 8),
  bcLikeUsd: null, allerA() {}, choisirBrain() {}, bcRepeindre() {}, AbortSignal };
// eslint-disable-next-line no-new-func
const usine = new Function('deps', 'with (deps) { let compte = null;\n' + CODE_LOCK + CODE + '\nreturn { peindreLock, peindreVaultWallet, peindrePointsWallet, peindreCoeursWallet, setCompte: (x) => { compte = x; }, raz: () => { wVaultLu = 0; } }; }');
const C = usine(deps);
const attendre = () => new Promise((r) => setTimeout(r, 30));
const peindreTout = async () => { await C.peindreVaultWallet(); await attendre(); };
const ligneDe = (k) => lignes('#wVaultRows').find((l) => l.startsWith(k + ' ')) || null;
/* task 6: the drawn blocks of the card, by their data-l key (the figures moved from the text rows into them) */
const blocs = (cle) => dom['#wVaultRows'].tous().filter((x) => x.dataset && x.dataset.l === cle);
const txtL = (cle) => (blocs(cle)[0] ? blocs(cle)[0].textContent : null);
const role = (x, r) => (x ? x.tous().find((y) => y.attrs && y.attrs.role === r) || null : null);
const aria = (x, k) => (x && x.attrs ? x.attrs['aria-' + k] : null);

/* 1. Grok's wallet: the week line and the wallet line, each from its own view */
C.setCompte(GROK); await peindreTout();
t('Grok: In the vault = TBLOCK.balanceOf(V) 847,983 (the big figure)', (txtL('vault') || '').startsWith('In the vault 847,983 TBLOCK'), txtL('vault'));
t('Grok: Play this week = V.totalPlayIn(0) 940,979 (all players), 1 wallet gave a heart', txtL('play-all') === 'All players 940,979 TBLOCK · 1 wallet gave a heart' && /^Play this weekfrom hearts and TAM art/.test(txtL('play') || '') /* the fake DOM joins blocks without a space */, txtL('play'));
t('Grok: For the players at the close = the close rule on V (423,991)', (ligneDe('For the players at the close') || '').startsWith('For the players at the close 423,991 TBLOCK'), ligneDe('For the players at the close'));
t('Grok: Your play = V.playOf(0, Grok) 940,979, factor V.lockFactor 11,667 -> ×1.17, lock activeLockedOf 3,000,000',
  txtL('play-mine') === 'You 940,979 TBLOCK' && (txtL('factor') || '').startsWith('Lock factor ×1.17 (3,000,000 TBLOCK locked)'), JSON.stringify([txtL('play-mine'), txtL('factor')]));
/* task 6: the bars say their figures (aria), the steps are ticked for this wallet */
{
  const now = Math.floor(Date.now() / 1000), attendu = Math.round(Math.round(Math.min(604800, Math.max(0, now - (1794960000 - 604800))) * 1000 / 604800) / 10);
  const pb = role(blocs('week')[0], 'progressbar');
  t('week bar: a progressbar 0..100 at the share of week 0 gone (start = L.epochEnd(0) - L.EPOCH), its words say the time left', !!pb && aria(pb, 'valuemin') === '0' && aria(pb, 'valuemax') === '100'
    && Math.abs(Number(aria(pb, 'valuenow')) - attendu) <= 1 && /gone of 7 days; .* left|over, waiting/.test(aria(pb, 'valuetext') || ''), JSON.stringify(pb && pb.attrs));
  const mm = role(blocs('play-mine')[0], 'meter'), ma = role(blocs('play-all')[0], 'meter');
  t('your play bar: a meter at 100 (940,979 of 940,979), its words give the TBLOCK and the share', !!mm && aria(mm, 'valuenow') === '100' && aria(mm, 'valuetext') === '940,979 TBLOCK, 100% of this week’s play' && aria(mm, 'label') === 'You', JSON.stringify(mm && mm.attrs));
  t('all players bar: a meter at 100, its words the week total', !!ma && aria(ma, 'valuenow') === '100' && aria(ma, 'valuetext') === '940,979 TBLOCK in all this week', JSON.stringify(ma && ma.attrs));
  const mf = role(blocs('factor')[0], 'meter');
  t('lock factor gauge: a meter from 1 to the vault MAX_FACTOR 1.75, at 1.1667 (11,667 bps), said "×1.17 of at most ×1.75"', !!mf && aria(mf, 'valuemin') === '1' && aria(mf, 'valuemax') === '1.75' && aria(mf, 'valuenow') === '1.1667' && aria(mf, 'valuetext') === '×1.17 of at most ×1.75', JSON.stringify(mf && mf.attrs));
  t('lock factor gauge: the marks are the vault rules read ($100 ×1.15 / $500 ×1.30 / $1,000 ×1.50 / +90 days ×1.75)', /\$100×1\.15\$500×1\.30\$1,000×1\.50\+90 days×1\.75/.test(txtL('factor') || ''), txtL('factor'));
  const et = blocs('steps')[0] ? blocs('steps')[0].tous().filter((x) => x.tag === 'li') : [];
  t('steps for Grok: 1 lock done (3,000,000 >= 2,789,880, until 2027-01-11 > 7 days), 2 play done, 3 claim later', et.map((x) => x.dataset.etat).join() === 'fait,fait,attente'
    && /Lock \$15 of TBLOCK Done3,000,000 TBLOCK locked until 2027-01-11/.test(et[0] ? et[0].textContent : '') && /Play this week Doneyou put in 940,979 TBLOCK this week/.test(et[1] ? et[1].textContent : '')
    && /Claim after the close Laterweek 0 closes 2026-11-18 00:00 UTC; then 14 days to claim/.test(et[2] ? et[2].textContent : ''), JSON.stringify(et.map((x) => x.textContent)));
}
await C.peindrePointsWallet(); await attendre();
t('Grok: points 11 (lock 0.80 · hearts 10), +37 a day (×1.25)', lignes('#wPointsMoi')[0] === 'Your points 11 (lock 0.80 · hearts 10)' && lignes('#wPointsMoi').includes('Earning now +37 a day (×1.25 commitment)'), JSON.stringify(lignes('#wPointsMoi')));

/* 2. the SAME page, 10 s later, another wallet that never played: its line must be its own (0), the week line unchanged */
C.setCompte(NEUF); await peindreTout();
t('switch to a wallet that never played: Your play 0, not eligible, 0 locked (at once, not 60 s later)',
  txtL('play-mine') === 'You 0 TBLOCK' && (txtL('factor') || '').startsWith('Lock factor not eligible now (0 TBLOCK locked)'), JSON.stringify([txtL('play-mine'), txtL('factor')]));
t('switch: its bar at 0 and its gauge at the bottom said "not eligible now"; its steps: lock to do, play to do', aria(role(blocs('play-mine')[0], 'meter'), 'valuenow') === '0'
  && aria(role(blocs('factor')[0], 'meter'), 'valuenow') === '1' && aria(role(blocs('factor')[0], 'meter'), 'valuetext') === 'not eligible now'
  && (blocs('steps')[0] ? blocs('steps')[0].tous().filter((x) => x.tag === 'li').map((x) => x.dataset.etat).join() : '') === 'afaire,afaire,attente', JSON.stringify(blocs('steps')[0] && blocs('steps')[0].textContent));
t('switch: the week total stays every player (940,979)', txtL('play-all') === 'All players 940,979 TBLOCK · 1 wallet gave a heart', txtL('play-all'));
await attendre();
t('switch: points are the new wallet\'s (none yet), not Grok\'s 11', /^Your points none yet/.test(lignes('#wPointsMoi')[0] || ''), JSON.stringify(lignes('#wPointsMoi')));
t('switch: hearts are the new wallet\'s', !lignes('#wCoeursMoi').some((l) => /1 heart|92,996/.test(l)), JSON.stringify(lignes('#wCoeursMoi')));

/* task 6: your bar is YOUR share of the week. FIXTURE, not a real wallet: 0x…02 whose play would be the heart part only (92,996 of 940,979) */
{
  const FIX = '0x' + '00'.repeat(19) + '02';
  CH.par[FIX] = { playOf: 92996006843756668224507n, lockFactor: 0n, active: 0n, unlockAt: 0n, bal: 0n };
  C.setCompte(FIX); await peindreTout();
  const mm = role(blocs('play-mine')[0], 'meter'), ma = role(blocs('play-all')[0], 'meter');
  t('fixture 0x…02: your bar at 10 (9.8% = 92,996 of 940,979), the all-players bar stays full', aria(mm, 'valuenow') === '10' && aria(mm, 'valuetext') === '92,996 TBLOCK, 9.8% of this week’s play' && aria(ma, 'valuenow') === '100', JSON.stringify([mm && mm.attrs, ma && ma.attrs]));
  delete CH.par[FIX];
}

/* 3. the dev wallet */
C.setCompte(DEV); await peindreTout();
t('dev wallet: Your play 0 (the dev wallet did not play)', txtL('play-mine') === 'You 0 TBLOCK' && (txtL('factor') || '').startsWith('Lock factor not eligible now (0 TBLOCK locked)'), JSON.stringify([txtL('play-mine'), txtL('factor')]));

/* 4. disconnect: no wallet line at all */
C.setCompte(null); await peindreTout();
t('disconnected: no "Your play" line left from the last wallet', txtL('play-mine') === null && txtL('factor') === null, JSON.stringify([txtL('play-mine'), txtL('factor')]));
t('disconnected: the steps are shown without a tick (no wallet, no "Done")', (blocs('steps')[0] ? blocs('steps')[0].tous().filter((x) => x.tag === 'li').map((x) => x.dataset.etat).join() : '') === 'info,info,info' && !/Done|To do/.test(txtL('steps') || ''), txtL('steps'));

/* 5. a read still running for Grok when the wallet changes: it paints nothing */
C.raz(); C.setCompte(GROK);
let lacher; const tenu = new Promise((r) => { lacher = r; });
freins = async (c) => { if (selDe(c.data) === S.playOf && argAdr(c.data, 1) === GROK) await tenu; };
const enCours = C.peindreVaultWallet();
await attendre();
C.setCompte(NEUF); await peindreTout();           /* the new wallet's read runs to its end */
lacher(); await enCours; await attendre(); freins = null;
t('late read for the previous wallet: its "Your play" never lands under the new wallet',
  blocs('play-mine').map((x) => x.textContent).join(' | ') === 'You 0 TBLOCK' && blocs('factor').length === 1 && blocs('factor')[0].textContent.startsWith('Lock factor not eligible now (0 TBLOCK locked)'),
  JSON.stringify([blocs('play-mine').map((x) => x.textContent), blocs('factor').map((x) => x.textContent)]));
t('late read: no line doubled in the card', new Set(lignes('#wVaultRows')).size === lignes('#wVaultRows').length, JSON.stringify(lignes('#wVaultRows')));

/* 6. the points: Grok's answer arrives AFTER the new wallet's — it must not overwrite it */
let lacherP; const tenuP = new Promise((r) => { lacherP = r; });
fetchFrein = async (u, q) => { if (u.pathname === '/api/points' && q === GROK) await tenuP; };
C.setCompte(GROK); const pG = C.peindrePointsWallet();
C.setCompte(NEUF); await C.peindrePointsWallet();
lacherP(); await pG; fetchFrein = null;
t('late points answer for the previous wallet: the new wallet keeps its own', /^Your points none yet/.test(lignes('#wPointsMoi')[0] || ''), JSON.stringify(lignes('#wPointsMoi')));
let lacherC; const tenuC = new Promise((r) => { lacherC = r; });
fetchFrein = async (u, q) => { if (u.pathname === '/api/coeurs' && q === GROK) await tenuC; };
C.setCompte(GROK); const cG = C.peindreCoeursWallet();
C.setCompte(NEUF); await C.peindreCoeursWallet();
lacherC(); await cG; fetchFrein = null;
t('late hearts answer for the previous wallet: the new wallet keeps its own', !lignes('#wCoeursMoi').some((l) => /1 heart|92,996/.test(l)), JSON.stringify(lignes('#wCoeursMoi')));

/* 7. the server is still reading the chain (after a restart, or a 429 gap: complet false, 0 counted so far): Grok's wallet must NOT be told
 *    "none yet" — it has 11 points and 1 heart; the card says the count is not finished (seen on a fresh local server, 2026-11-12) */
const pointsVrai = API.points, coeursVrai = API.coeurs;
API.points = (q) => ({ ok: true, complet: false, board: [], somme: 0, compte: { holder: q, lock: 0, jeu: 0, total: 0, rang: null, part: 0 } });
API.coeurs = (q) => ({ ok: true, complet: false, semainesParContrat: {}, board: [], compte: { compte: q, donnes: { likes: '0', burned: '0', vers: [] }, recus: { likes: '0', de: [] }, blocsSansCreateur: 0, sesBlocks: [] } });
C.setCompte(GROK); await C.peindrePointsWallet(); await C.peindreCoeursWallet();
t('index still reading: points do not say "none yet" for a wallet not counted yet', !/none yet/.test(lignes('#wPointsMoi').join(' ')) && /still reading the chain/.test(lignes('#wPointsMoi').join(' ')), JSON.stringify(lignes('#wPointsMoi')));
t('index still reading: hearts do not say "none yet" either', !/none yet/.test(lignes('#wCoeursMoi').join(' ')) && /still reading the chain/.test(lignes('#wCoeursMoi').join(' ')), JSON.stringify(lignes('#wCoeursMoi')));
API.points = pointsVrai; API.coeurs = coeursVrai;
C.setCompte(NEUF); await C.peindrePointsWallet(); await C.peindreCoeursWallet();
t('index complete: a wallet that never played is told "none yet" (the guard is only for an unfinished count)', /^Your points none yet/.test(lignes('#wPointsMoi')[0] || '') && lignes('#wCoeursMoi').some((l) => /^Hearts you gave none yet/.test(l)), JSON.stringify([lignes('#wPointsMoi'), lignes('#wCoeursMoi')]));

/* 8. seen in the browser 2026-11-12: after a switch the hearts line kept "you have 3,000,000 locked · enough" (Grok's lock) under the new
 *    wallet for 20-40 s, because it was repainted only at the END of the vault reads. The hearts and points lines must follow the wallet
 *    at once, even while the vault reads are still running. */
C.setCompte(GROK); C.raz(); await peindreTout(); await C.peindreCoeursWallet();
t('setup: the hearts line shows Grok\'s lock', (lignes('#wCoeursMoi')[0] || '').includes('you have 3,000,000 locked'), JSON.stringify(lignes('#wCoeursMoi')));
let lacherV; const tenuV = new Promise((r) => { lacherV = r; });
freins = async (c) => { if (String(c.to).toLowerCase() === EP.VAULT) await tenuV; };
C.setCompte(NEUF); const vEnCours = C.peindreVaultWallet();
await attendre(); await attendre();
t('switch while the vault reads run: the hearts line is the new wallet\'s at once', (lignes('#wCoeursMoi')[0] || '').includes('you have 0 locked'), JSON.stringify(lignes('#wCoeursMoi')));
t('switch while the vault reads run: the points line is the new wallet\'s at once', /^Your points none yet/.test(lignes('#wPointsMoi')[0] || ''), JSON.stringify(lignes('#wPointsMoi')));
t('switch while the vault reads run: the lock card is re-read for the new wallet at once', /Your TBLOCK lock/.test(dom['#wLock'].textContent) && !/3,000,000/.test(dom['#wLock'].textContent), dom['#wLock'].textContent.slice(0, 200));
lacherV(); await vEnCours; freins = null;

/* 9. seen in the browser too: the page's eth_call queue is shared, so the new wallet's hearts read can wait behind the vault reads; while
 *    it waits, the previous wallet's lines must already be gone (empty until read, never someone else's) */
C.setCompte(GROK); C.raz(); await peindreTout(); await C.peindreCoeursWallet(); await C.peindrePointsWallet();
let lacherT; const tenuT = new Promise((r) => { lacherT = r; });
freins = async () => { await tenuT; }; fetchFrein = async () => { await tenuT; };
C.setCompte(NEUF); const tEnCours = C.peindreVaultWallet();
await attendre();
t('switch with every read still waiting: no line of the previous wallet left in the hearts box', !lignes('#wCoeursMoi').some((l) => /3,000,000|1 heart/.test(l)), JSON.stringify(lignes('#wCoeursMoi')));
t('switch with every read still waiting: no line of the previous wallet left in the points box', !lignes('#wPointsMoi').some((l) => /^Your points 11/.test(l)), JSON.stringify(lignes('#wPointsMoi')));
/* task 6: the card is now built off-screen and put in place in one go (no blank card on the 60 s refresh) — but a SWITCH still empties it at once */
t('switch with every read still waiting: the vault card shows nothing of the previous wallet (no play bar, no factor, no ticked step)', blocs('play-mine').length === 0 && blocs('factor').length === 0 && !/Done/.test(dom['#wVaultRows'].textContent), dom['#wVaultRows'].textContent.slice(0, 200));
t('switch with every read still waiting: the big points number of the previous wallet is not shown', dom['#wPointsGros'].hidden === true || !/11 pts/.test(dom['#wPointsGros'].textContent), dom['#wPointsGros'].textContent);
t('switch with every read still waiting: no "(you)" left on the previous wallet in the boards', !lignes('#wPointsBoard').concat(lignes('#wCoeursBoard')).some((l) => /(you)/.test(l)), JSON.stringify(lignes('#wPointsBoard').concat(lignes('#wCoeursBoard'))));
lacherT(); await tEnCours; await attendre(); freins = null; fetchFrein = null;
await C.peindreCoeursWallet();
t('after the reads: the hearts box is the new wallet\'s', (lignes('#wCoeursMoi')[0] || '').includes('you have 0 locked'), JSON.stringify(lignes('#wCoeursMoi')));

/* 10. the lock card of the same tab (seen in the browser 2026-11-12: 40 s after a switch it still said "3,000,000 TBLOCK locked until
 *     2027-01-11" with Grok's "Request the withdrawal" and lock buttons under the new wallet — its own 30 s pace, not keyed by wallet) */
const lockTxt = () => dom['#wLock'].textContent;
C.setCompte(GROK); delete dom['#wLock'].dataset.lu; await C.peindreLock(dom['#wLock']);
t('setup: the lock card shows Grok\'s lock', /Locked 3,000,000 TBLOCK until 2027-01-11/.test(lockTxt()) /* game386: the big figure (the sentence repeating it is gone) */, lockTxt().slice(0, 300));
{
  const tous = dom['#wLock'].tous(), parL = (k) => tous.find((x) => x.dataset && x.dataset.l === k) || null;
  t('lock card: the amount big with its date ("Locked 3,000,000 TBLOCK until 2027-01-11 · … left")', /^Locked 3,000,000 TBLOCK until 2027-01-11 · \d+ d \d+ h left$/.test(parL('lock') ? parL('lock').textContent : ''), parL('lock') && parL('lock').textContent);
  const ch = tous.find((x) => x.attrs && x.attrs.role === 'img');
  t('lock card: the timeline says itself in words (today -> 2027-01-11, then the 7-day withdrawal period)', !!ch && /^Locked from today to 2027-01-11 \(\d+ d \d+ h left\), then a 7-day withdrawal period once you ask, never ending before that date$/.test(ch.attrs['aria-label']), ch && ch.attrs['aria-label']);
  t('lock card: the points a day of this lock, the /api/points figure (+37 a day, ×1.25)', parL('lock-pts') && parL('lock-pts').textContent === 'Points +37 a day (×1.25 commitment)', parL('lock-pts') && parL('lock-pts').textContent);
  const mois = tous.filter((x) => x.tag === 'li' && x.className === 'hvMoisP');
  t('lock card: the months as chips — month 0 now (not played, hasPlayed read 0), month 1 earned by the lock (rewardEpochsFor 1..1)', mois.map((x) => x.dataset.etat + ':' + x.textContent).join(' | ') === 'afaire:Month 0 now · not played yet | gagne:Month 1 your lock earns it', mois.map((x) => x.dataset.etat + ':' + x.textContent).join(' | '));
  const prim = tous.filter((x) => x.tag === 'button' && x.className === 'bouton');
  t('lock card: ONE primary button (the lock), the others secondary', prim.length === 1 && /^(Lock|Add) /.test(prim[0].textContent), prim.map((x) => x.textContent).join(' | '));
  const dur = tous.filter((x) => x.tag === 'button' && x.dataset && x.dataset.jours);
  t('lock card: each duration chip says its days and the months it earns (7 and 30 days on top of a lock to 2027-01-11: 1 month)', dur.slice(0, 2).map((x) => x.textContent).join(' | ') === '7 days 1 month earned | 30 days 1 month earned', dur.map((x) => x.textContent).join(' | '));
  const pli = tous.find((x) => x.tag === 'details');
  t('lock card: the long explanations are folded under How it works (the lock rule, the points rule, the rewards note)', !!pli && /^How it works/.test(pli.textContent) && pli.textContent.includes('Locking earns community points')
    && pli.textContent.includes('1 a day per 100,000 TBLOCK') && pli.textContent.includes('Each month pays the whole months a lock covers'), pli && pli.textContent.slice(0, 200));
}
C.setCompte(NEUF); await C.peindreVaultWallet(); await attendre(); await C.peindreLock(dom['#wLock']); await attendre();
t('switch: the lock card is the new wallet\'s at once (no lock of Grok, no withdrawal button)', !/3,000,000 TBLOCK/.test(lockTxt()) && !/Request the withdrawal/.test(lockTxt()) && /No TBLOCK locked yet/.test(lockTxt()), lockTxt().slice(0, 300));
/* a lock read still running for Grok when the wallet changes paints nothing (the tab was showing Grok: its vault card too) */
C.setCompte(GROK); C.raz(); await peindreTout(); delete dom['#wLock'].dataset.lu; await C.peindreLock(dom['#wLock']);
t('setup: the lock card of Grok is on screen before the late read', /Locked 3,000,000 TBLOCK until 2027-01-11/.test(lockTxt()) /* game386: the big figure (the sentence repeating it is gone) */, lockTxt().slice(0, 200));
let lacherL; const tenuL = new Promise((r) => { lacherL = r; });
/* held: only the lock card's own first read (lockedOf), never a read the vault card also makes */
freins = async (c) => { if (String(c.to).toLowerCase() === LK.LOCK && c.data.startsWith('0x' + LK.SEL.lockedOf) && argAdr(c.data, 0) === GROK) await tenuL; };
delete dom['#wLock'].dataset.lu; const lEnCours = C.peindreLock(dom['#wLock']);
await attendre(); C.setCompte(NEUF); await C.peindreVaultWallet(); lacherL(); await lEnCours; await attendre(); freins = null;
t('late lock read for the previous wallet: it does not land under the new wallet', !/3,000,000 TBLOCK/.test(lockTxt()), lockTxt().slice(0, 300));
/* the same while the MONTHLY REWARDS part of Grok's card is still reading: its box must not land under the new wallet */
C.setCompte(GROK); C.raz(); await peindreTout(); delete dom['#wLock'].dataset.lu; await C.peindreLock(dom['#wLock']);
let lacherR; const tenuR = new Promise((r) => { lacherR = r; });
freins = async (c) => { if (EP.REWARDS && String(c.to).toLowerCase() === EP.REWARDS) await tenuR; };
delete dom['#wLock'].dataset.lu; const rEnCours = C.peindreLock(dom['#wLock']);
await attendre(); C.setCompte(NEUF); await C.peindreVaultWallet(); await attendre();
lacherR(); await rEnCours; await attendre(); freins = null;
/* game386: the new wallet's card is now read for it at once (one global in-flight flag used to leave it unpainted), so it has ITS rewards
 *   box; Grok's late box would add a second one, with his enrolled lock line */
t('late monthly-rewards read for the previous wallet: its box does not land under the new wallet', !!EP.REWARDS && dom['#wLock'].tous().filter((x) => x.id === 'wLockRewards').length === 1 && !/Your lock 1 full month/.test(lockTxt()) && /No TBLOCK locked yet/.test(lockTxt()), lockTxt().slice(0, 300));
/* a card still on screen for Grok (painted before the switch reached it): its Lock button must not send for the new wallet with Grok as holder */
C.setCompte(GROK); delete dom['#wLock'].dataset.lu; await C.peindreLock(dom['#wLock']);
const go = dom['#wLock'].tous().find((x) => x.tag === 'button' && /^(Lock|Add) /.test(x.t));
t('setup: Grok\'s card has its Lock button', !!go, lockTxt().slice(-300));
C.setCompte(NEUF); envois.length = 0;
if (go) await go.click();
t('stale card: its Lock button sends nothing once the wallet changed (it would enroll Grok from the new wallet)', envois.length === 0, JSON.stringify(envois.map((e) => e.qui)));
/* task 6: the lock card's points a day are shown only for the wallet the answer is about (an answer naming another holder is not drawn) */
{
  const pv = API.points;
  API.points = (q) => { const r = pv(GROK); r.compte = { ...r.compte, holder: NEUF }; return r; };
  C.setCompte(GROK); delete dom['#wLock'].dataset.lu; await C.peindreLock(dom['#wLock']);
  t('lock card: a points answer about another holder draws no points a day', /Locked 3,000,000 TBLOCK until 2027-01-11/.test(lockTxt()) /* game386: the big figure (the sentence repeating it is gone) */ && !dom['#wLock'].tous().some((x) => x.dataset && x.dataset.l === 'lock-pts'), lockTxt().slice(0, 200));
  /* prod 2026-11-12 (x-ms-monitor read): complet false, Grok counted with his 1,000 TBLOCK lock only — parJour 0.01, mult 1 */
  API.points = (q) => ({ ok: true, complet: false, compte: { holder: q, lock: 0.016017245370370373, jeu: 10.813489, total: 10.829506245370371, parJour: 0.01, mult: 1, rang: 1, part: 1 }, board: [] });
  delete dom['#wLock'].dataset.lu; await C.peindreLock(dom['#wLock']);
  t('lock card: a count still being read (prod answered +0.01 a day for the 3,000,000 lock) draws no points a day', /Locked 3,000,000 TBLOCK until 2027-01-11/.test(lockTxt()) /* game386: the big figure (the sentence repeating it is gone) */ && !dom['#wLock'].tous().some((x) => x.dataset && x.dataset.l === 'lock-pts'), lockTxt().slice(0, 200));
  API.points = pv;
}

/* 11. the vault rules unread (a node refusing the 15 reads): no gauge marks, no "$15" invented — the steps name the TBLOCK amount read */
reglesLisibles = false;
{
  const usine2 = new Function('deps', 'with (deps) { let compte = null;\n' + CODE_LOCK + CODE + '\nreturn { peindreVaultWallet, setCompte: (x) => { compte = x; } }; }');
  const C2 = usine2(deps); C2.setCompte(GROK); await C2.peindreVaultWallet(); await attendre();
  t('rules unread: no gauge (no bound typed), the factor line stays', role(blocs('factor')[0], 'meter') === null && (txtL('factor') || '').startsWith('Lock factor ×1.17 (3,000,000 TBLOCK locked)'), txtL('factor'));
  t('rules unread: step 1 names the TBLOCK read (2,789,880), never a typed $15; not ticked (the 7 days not read)', /^1?Lock 2,789,880 TBLOCK/.test((blocs('steps')[0] ? blocs('steps')[0].tous().filter((x) => x.tag === 'li') : [])[0]?.textContent || '')
    && !/\$15/.test(txtL('steps') || '') && blocs('steps')[0].tous().filter((x) => x.tag === 'li')[0].dataset.etat === 'info', txtL('steps'));
}
reglesLisibles = true;
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green') + ' (' + String(fichier).replace(/^file:\/\/\//, '') + ')');
process.exit(ko ? 1 : 0);
