/* test-revue-claim-386-20261112.mjs — independent review of game386 (claim page + lock card), 2026-11-12. Three defects found, each RED on the
 *   files as the agents left them (saved in bak-386/review/) and green after the fix:
 *   A  claim-vue.js signataire(): a UserOperationEvent naming the wallet was trusted from ANY emitter. Any contract can emit that topic (an
 *      event is not a transaction): only the ERC-4337 EntryPoints count, the list revenu-externe.js already keeps (read on Base 2026-10-17).
 *      With a forged event, a bundler-sent receipt was judged "signed by your smart account" and its tx.to/data checks were skipped.
 *   B  claim-vue.js: "Your lock earns month 1 ... play in it to be paid for it" and "Months your lock earns: month 1" came from
 *      rewardEpochsFor(unlockAt), which is the months a lock with that DATE covers, whoever holds it. A lock that never joined the monthly
 *      rewards has weightOf = 0 there and R.claim() refuses it (NoWeight). Now the weight R recorded for the first of those months is READ:
 *      0 -> "has not joined"; not read -> "not read"; > 0 -> the old sentence.
 *   C  app.html peindreRecompensesLock(): "Play this month (...) to be paid for it." under month 0 for Grok, whose lock is enrolled from month 1
 *      (weightOf(Grok, 0) = 0 on Base, block 56643259): month 0 cannot pay him, played or not. Now said only when weightOf(this month) > 0;
 *      an enrolled lock that counts from a later month is told which one.
 *   + MUTANTS of each fix, each must turn a check red.
 *   NE PROUVE PAS: the browser rendering (checked in the built-in browser with a stub wallet for Grok, see the review report).
 *   Usage: node test-revue-claim-386-20261112.mjs [claim-vue module path] [app.html path]   (defaults: ./claim-vue.js ./app.html; mutants
 *   only on the defaults) */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as EP from './economie-pack.js';
import * as LK from './lock.js';
import * as HV from './holders-vue.js';
import { selecteur } from './keccak.js';

const ICI = fileURLToPath(new URL('.', import.meta.url));
const MODULE = process.argv[2] || ICI + 'claim-vue.js';
const APPF = process.argv[3] || ICI + 'app.html';
const DEFAUT = !process.argv[2] && !process.argv[3];

const GROK = '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b';
const BUNDLER = '0x1111111111111111111111111111111111111111';
const FAUX = '0x2222222222222222222222222222222222222222';
const w32 = (x) => BigInt(x).toString(16).padStart(64, '0');
const hx = (...xs) => '0x' + xs.map(w32).join('');
const tAdr = (a) => '0x' + a.replace(/^0x/, '').padStart(64, '0');
const sel = (sig) => selecteur(sig).slice(2, 10);

/* the EntryPoints: ONE list (entry-points.js), moved verbatim out of revenu-externe.js, which the server and claim-vue.js both read */
import { ENTRY_POINTS as EP_LISTE } from './entry-points.js';
import { payeurDe } from './revenu-externe.js';
const EP_REF = [...EP_LISTE].sort();
const SRC_RE = readFileSync(ICI + 'revenu-externe.js', 'utf8');

/* ── a chain stub for lireTout (values copied from the Base reads of 2026-11-12, block 56643259, Grok) ── */
const R_T0 = 1794441600n, R_EPOCH = 2592000n;
function chaine(MODE) {
  const Z = hx(0, 0, 0, 0, 0);
  return async (m, p) => {
    if (m !== 'eth_call') throw new Error('reads only');
    const to = String(p[0].to).toLowerCase(), d = String(p[0].data), s = d.slice(2, 10);
    const arg = (k) => BigInt('0x' + d.slice(10 + 64 * k, 10 + 64 * (k + 1)));
    if (to === EP.VAULT && s === sel('LIKES()')) return tAdr(EP.HEARTS);
    if (to === EP.HEARTS) { if (s === sel('currentEpoch()')) return hx(0); if (s === sel('EPOCH()')) return hx(604800); if (s === sel('epochEnd(uint256)')) return hx(1794960000); }
    if (to === LK.LOCK) { if (s === sel('activeLockedOf(address)')) return hx(3000000n * 10n ** 18n); if (s === sel('unlockAtOf(address)')) return hx(1799676860); }
    if (to === EP.REWARDS) {
      if (s === sel('TBLOCK()')) return tAdr(EP.TBLOCK);
      if (s === sel('WTCOIN()')) return tAdr(MODE.wtcoin);
      if (s === sel('rewardEpochsFor(uint256)')) return hx(1, 1, 1);
      if (s === sel('epochEnd(uint256)')) return hx(R_T0 + (arg(0) + 1n) * R_EPOCH);
      if (s === sel('weightOf(address,uint256)')) {
        if (MODE.poidsPanne) throw new Error('429 Too Many Requests');
        return hx(arg(1) === 1n ? MODE.poids1 : MODE.poids0);
      }
    }
    return Z;
  };
}

/* ── the app's monthly rewards box, cut from the file, on a fake DOM ── */
class El {
  constructor(tag) { this.tag = tag; this.kids = []; this.t = ''; this.dataset = {}; this.className = ''; this.id = ''; this.style = {}; }
  set textContent(v) { this.kids = []; this.t = String(v); }
  get textContent() { return this.t + this.kids.map((k) => (typeof k === 'string' ? k : k.textContent)).join(' '); }
  append(...xs) { this.kids.push(...xs); }
  setAttribute() {} addEventListener() {}
  get classList() { return { add() {}, remove() {}, toggle() {} }; }
}
const el = (tag, cls, txt) => { const x = new El(tag); if (cls) x.className = cls; if (txt !== null && txt !== undefined) x.textContent = txt; return x; };
function couperRecompenses(APP) {
  const a = APP.indexOf('async function peindreRecompensesLock(');
  const fin = /\n\}\n/g; fin.lastIndex = a;
  const m = fin.exec(APP);
  if (a < 0 || !m) throw new Error('peindreRecompensesLock not found');
  return APP.slice(a, m.index + 3);
}
function chaineApp(MODE) {
  const U = 1799676860n, A = 3000000n * 10n ** 18n;
  return async (m, p) => {
    const to = String(p[0].to).toLowerCase(), d = String(p[0].data), s = d.slice(2, 10);
    const arg = (k) => BigInt('0x' + d.slice(10 + 64 * k, 10 + 64 * (k + 1)));
    if (to !== EP.REWARDS) throw new Error('not modelled ' + to);
    if (s === sel('currentEpoch()') || s === sel('nextEpochToClose()') || s === sel('nextEpochToRelease()')) return hx(0);
    if (s === sel('epochEnd(uint256)')) return hx(R_T0 + (arg(0) + 1n) * R_EPOCH);
    if (s === sel('hasPlayed(address,uint256)')) return hx(MODE.joue ? 1 : 0);
    if (s === sel('enrollmentOf(address)')) return MODE.inscrit ? hx(U, 1794489350n, A) : hx(0, 0, 0);
    if (s === sel('rewardEpochsFor(uint256)')) return hx(1, 1, 1);
    if (s === sel('weightOf(address,uint256)')) { if (MODE.poidsPanne) throw new Error('429 Too Many Requests'); return hx(arg(1) === 0n ? MODE.poids0 : 3750000n * 10n ** 18n); }
    throw new Error('not modelled ' + s);
  };
}
async function boiteApp(APP, MODE) {
  const code = couperRecompenses(APP);
  const deps = { EP, HV, document: { createElement: (t) => new El(t) }, rpc: chaineApp(MODE), compte: GROK };
  // eslint-disable-next-line no-new-func
  const f = new Function('deps', 'with (deps) { ' + code + '\nreturn peindreRecompensesLock; }')(deps);
  const R = await f(new El('div'), { moi: GROK, locked: 3000000n * 10n ** 18n, active: 3000000n * 10n ** 18n, unlockAt: 1799676860n, requestedAt: 0n, el, dire() {}, pli: null });
  return R ? R.box.textContent : '(null)';
}

async function verifier(cheminModule, APP) {
  const fautes = [];
  const t = (m, c, x = '') => { if (!c) fautes.push(m + (x ? ' :: ' + String(x).slice(0, 300) : '')); };
  let CV;
  try { CV = await import(pathToFileURL(cheminModule).href + '?v=' + Math.random()); } catch (e) { return ['the module loads :: ' + e.message]; }

  /* A — who signed */
  t('A0 entry-points.js keeps the 3 EntryPoints, and revenu-externe.js builds its set from it (no second list)', EP_REF.length === 3 && EP_REF.every((a) => /^0x[0-9a-f]{40}$/.test(a))
    && /import \{ ENTRY_POINTS as ENTRY_POINTS_LISTE \} from '\.\/entry-points\.js';/.test(SRC_RE) && /const ENTRY_POINTS = new Set\(ENTRY_POINTS_LISTE\);/.test(SRC_RE)
    && !EP_REF.some((a) => SRC_RE.includes(a)), EP_REF.join(','));
  t('A1 claim-vue.js uses exactly that list', Array.isArray(CV.ENTRY_POINTS) && [...CV.ENTRY_POINTS].sort().join() === EP_REF.join(), String(CV.ENTRY_POINTS));
  const userOp = (emetteur, ok = true, sender = GROK) => ({ address: emetteur, topics: [CV.TOPIC.UserOp, '0x' + 'ab'.repeat(32), tAdr(sender), tAdr('0x0')], data: hx(1, ok ? 1 : 0, 5, 6) });
  const tx = { hash: '0xaa', from: BUNDLER, to: EP_REF[0] || FAUX, input: '0x1fad948c', value: '0x0' };
  t('A2 a UserOperationEvent naming the wallet, emitted by a contract that is NOT an EntryPoint -> nobody signed', CV.signataire(GROK, tx, { logs: [userOp(FAUX)] }) === null,
    CV.signataire(GROK, tx, { logs: [userOp(FAUX)] }));
  for (const ep of EP_REF) t('A3 the same event from the EntryPoint ' + ep.slice(0, 10) + ' -> smart account', CV.signataire(GROK, tx, { logs: [userOp(ep)] }) === 'smart account');
  t('A4 a failed operation from an EntryPoint -> nobody', CV.signataire(GROK, tx, { logs: [userOp(EP_REF[0], false)] }) === null);
  t('A5 the wallet itself (tx.from) still signs', CV.signataire(GROK, { ...tx, from: GROK }, { logs: [] }) === 'wallet');
  t('A7 revenu-externe.js payeurDe on the shared list: an EntryPoint names the sender; a forged emitter names nobody',
    payeurDe({ tx, recu: { logs: [userOp(EP_REF[1])] } }) === GROK && payeurDe({ tx, recu: { logs: [userOp(FAUX)] } }) === null);
  /* the whole receipt judgement: a forged event plus a real-looking vault payment must not pass as "signed by your smart account" */
  const planS = { ok: true, type: 'semaine', e: 0n, appel: EP.claimCall(0n), wallet: GROK };
  const recu = { transactionHash: '0xaa', status: '0x1', logs: [userOp(FAUX),
    { address: CV.V, topics: [CV.TOPIC.ClaimedV, tAdr('0x0'), tAdr(GROK)], data: hx(40n * 10n ** 18n, 2n * 10n ** 18n) },
    { address: CV.TBLOCK, topics: [CV.TOPIC.Transfer, tAdr(CV.V), tAdr(GROK)], data: hx(42n * 10n ** 18n) }] };
  const v = CV.verifierRecu(planS, tx, recu);
  t('A6 verifierRecu: bundler tx + forged UserOperationEvent -> refused "signed by ... not by this wallet"', !v.ok && /not by this wallet/.test(v.ko.join(';')), JSON.stringify(v.ko));

  /* B — the months a lock earns, said from the weight R recorded */
  const WT = (await import(pathToFileURL(ICI + 'create-vault-tip.js').href)).WTCOIN;
  const lire = async (MODE) => CV.lireTout(chaine({ wtcoin: String(WT).toLowerCase(), ...MODE }), GROK, 1794519027);
  const ligne = (L, k) => (CV.lignesMoi(L).find((x) => x[0] === k) || [])[1];
  let L = await lire({ poids0: 0n, poids1: 3750000n * 10n ** 18n });
  t('B1 enrolled (weightOf month 1 > 0, as Grok on Base): "Your lock earns month 1 ... play in it"', /Your lock earns month 1, which ends 2027-01-11 00:00 UTC: play in it to be paid for it\./.test(CV.premiereOuverture(L)[1] || ''), CV.premiereOuverture(L)[1]);
  t('B2 enrolled: "Months your lock earns" = month 1', ligne(L, 'Months your lock earns') === 'month 1', ligne(L, 'Months your lock earns'));
  t('B3 the weight of the first earned month is READ', L.r.poidsPremierGain === 3750000n * 10n ** 18n, String(L.r.poidsPremierGain));
  L = await lire({ poids0: 0n, poids1: 0n });
  const o = CV.premiereOuverture(L)[1] || '';
  t('B4 NOT enrolled (weightOf month 1 = 0): never "Your lock earns month 1"', !/Your lock earns/.test(o) && !/play in it to be paid/.test(o), o);
  t('B5 NOT enrolled: says the lock has not joined the monthly lock rewards and how', /has not joined the monthly lock rewards: join them from your lock card/.test(o), o);
  t('B6 NOT enrolled: "Months your lock earns" is not "month 1"', /^none yet: your lock covers month 1 but has not joined/.test(ligne(L, 'Months your lock earns') || ''), ligne(L, 'Months your lock earns'));
  t('B8 this month, weight 0: the line does not say "does not cover" (the date covers it; the lock counts from month 1)', /does not count for this month/.test(ligne(L, 'This month') || ''), ligne(L, 'This month'));
  L = await lire({ poids0: 0n, poids1: 1n, poidsPanne: true });
  const o2 = CV.premiereOuverture(L)[1] || '';
  t('B7 the weight NOT READ: "not read", never "earns" nor "has not joined"', /Whether your lock counts for month 1: not read/.test(o2) && !/earns month|has not joined/.test(o2) && ligne(L, 'Months your lock earns') === 'not read', o2 + ' | ' + ligne(L, 'Months your lock earns'));

  /* C — the app's monthly rewards box */
  if (APP) {
    let x = await boiteApp(APP, { inscrit: true, joue: false, poids0: 0n });
    t('C1 Grok as on Base (enrolled from month 1, weightOf month 0 = 0, not played): no "Play this month ... to be paid for it"', !/Play this month/.test(x), x);
    t('C2 ... and it says from which month the lock counts', /Your lock counts from month 1: play in it/.test(x), x);
    x = await boiteApp(APP, { inscrit: true, joue: false, poids0: 3750000n * 10n ** 18n });
    t('C3 a lock counted for this month, not played: "Play this month ... to be paid for it."', /Play this month \(a heart, a TAM art mint or a skin mint\) to be paid for it\./.test(x), x);
    x = await boiteApp(APP, { inscrit: true, joue: true, poids0: 3750000n * 10n ** 18n });
    t('C4 played: no how-to', !/Play this month|play in it/.test(x), x);
    x = await boiteApp(APP, { inscrit: true, joue: false, poids0: 0n, poidsPanne: true });
    t('C5 weightOf not read: no promise on a guess, the box still shows the month', !/Play this month|play in it/.test(x) && /This month/.test(x) && !/not read just now/.test(x), x);
    x = await boiteApp(APP, { inscrit: false, joue: false, poids0: 0n });
    t('C6 not enrolled: neither sentence (the card offers "Join monthly rewards")', !/Play this month|play in it/.test(x) && /not enrolled yet/.test(x), x);
  }
  return fautes;
}

const SRC = readFileSync(MODULE, 'utf8');
const APP = readFileSync(APPF, 'utf8');
const fautes = await verifier(MODULE, APP);
if (fautes.length) { console.log('RED ' + fautes.length + ':\n  ' + fautes.join('\n  ')); process.exit(1); }
let tues = 0, total = 0;
if (DEFAUT) {
  const MUT_CV = [
    ['EntryPoint check removed', ' || !ENTRY_POINTS.includes(bas(l.address))) continue;', ') continue;'],
    ['weight never read', 'lit(EP.VIEW.weightOf(w, BigInt(r.gains.premier)))]);', 'Promise.resolve(1n)]);'],
    ['weight 0 treated as earned (opening)', "if (r.poidsPremierGain === 0n) return ' Your lock covers", "if (false) return ' Your lock covers"],
    ['weight not read treated as earned (opening)', "if (r.poidsPremierGain === null || r.poidsPremierGain === undefined) return ' Whether", "if (false) return ' Whether"],
    ['weight 0 treated as earned (details line)', ": r.poidsPremierGain === 0n ? 'none yet:", ": false ? 'none yet:"],
  ];
  for (const [nom, de, vers] of MUT_CV) {
    total++;
    if (!SRC.includes(de)) { console.log('mutant NOT APPLIED: ' + nom); continue; }
    const f = ICI + 'claim-vue.mut-revue-' + total + '.tmp.js';
    writeFileSync(f, SRC.replace(de, vers));
    try { const r = await verifier(f, null); if (r.length) tues++; else console.log('mutant SURVIVED: ' + nom); } finally { unlinkSync(f); }
  }
  const MUT_APP = [
    ['the weight condition dropped', "typeof poidsMois === 'bigint' && poidsMois > 0n)", "true)"],
    ['weight > 0 inverted', 'poidsMois > 0n) box.append', 'poidsMois >= 0n) box.append'],
    ['the later-month sentence dropped', "else if (joue !== 1n && poidsMois === 0n && moisLu", "else if (false && moisLu"],
    ['weightOf failure kills the box', "lit(EP.VIEW.weightOf(moi, c)).catch(() => null)]", "lit(EP.VIEW.weightOf(moi, c))]"],
  ];
  for (const [nom, de, vers] of MUT_APP) {
    total++;
    if (!APP.includes(de)) { console.log('mutant NOT APPLIED: ' + nom); continue; }
    const r = await verifier(MODULE, APP.replace(de, vers));
    if (r.length) tues++; else console.log('mutant SURVIVED: ' + nom);
  }
}
console.log('GREEN: all checks hold' + (DEFAUT ? ', ' + tues + '/' + total + ' mutants killed' : ''));
process.exit(DEFAUT && tues !== total ? 1 : 0);
