/* test-holders-vue-378-20261112.mjs — lot 378 task 6 (Phil 2026-11-12: "redo the Wallet -> Holders UI so it is visually easy to understand").
 *   AFFIRME on the REAL holders-vue.js (pure; run on a fake DOM):
 *   - the shares and the week are computed from the figures passed in (BigInt-safe; the week starts at its end minus the hearts' EPOCH);
 *   - the three steps of a payment are ticked by the vault's own claim rule for THIS wallet (locked >= need AND a lock lasting MIN_COMMIT
 *     more seconds; play > 0), never ticked without a wallet, never ticked when MIN_COMMIT is unread;
 *   - the lock-factor marks come only from the vault's rules read on chain ($100 / $500 / $1,000 and the 90 days), none when unread;
 *   - every bar carries role + aria-valuemin/max/now (clamped) + aria-valuetext; the timeline is role img with its words; a step says
 *     "Done" / "To do" / "Later" in its text, not only with a mark;
 *   - the months of the lock rewards: this month (played or not) and the months the lock earns.
 *   Then MUTANTS: each mutated copy of the module must turn a check red.
 *   Usage: node test-holders-vue-378-20261112.mjs [path/to/holders-vue.js]
 *   NE PROUVE PAS: the rendering (checked in the built-in browser at 1077 and 375 px), the card wiring (test-vault-par-wallet-378). */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const SRC = process.argv[2] || fileURLToPath(new URL('./holders-vue.js', import.meta.url));

class El {
  constructor(tag) { this.tag = tag; this.kids = []; this.t = ''; this.dataset = {}; this.style = {}; this.className = ''; this.attrs = {}; }
  set textContent(v) { this.kids = []; this.t = String(v); }
  get textContent() { return this.t + this.kids.map((k) => (typeof k === 'string' ? k : k.textContent)).join(''); }
  append(...xs) { this.kids.push(...xs); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  tous() { return [this, ...this.kids.filter((k) => typeof k !== 'string').flatMap((k) => k.tous())]; }
}
const doc = { createElement: (t) => new El(t) };

async function verifier(HV, journal = true) {
  let ok = 0, ko = 0;
  const t = (m, c, x = '') => { if (c) ok++; else { ko++; if (journal) console.log('KO', m, x); } };
  const E = 10n ** 18n, fmt = (raw) => (BigInt(raw) / E).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  /* A. computations */
  t('pct: 940,979 of 940,979 = 100; 0 of it = 0; a third = 33.3; total 0 = 0', HV.pct(940979n * E, 940979n * E) === 100 && HV.pct(0n, 5n) === 0 && HV.pct(1n, 3n) === 33.3 && HV.pct(5n, 0n) === 0);
  t('pct: BigInt beyond 2^53 kept exact (92,996 of 940,979 = 9.8)', HV.pct(92996006843756668224507n, 940979492641063762241583n) === 9.8, String(HV.pct(92996006843756668224507n, 940979492641063762241583n)));
  t('duree: days and hours, never rounded up', HV.duree(5 * 86400 + 9 * 3600 + 3599) === '5 d 9 h' && HV.duree(3 * 3600 + 12 * 60) === '3 h 12 min' && HV.duree(-5) === '0 min');
  const s = HV.semaine({ fin: 1794960000n, longueur: 604800n, maintenant: 1794960000 - 5 * 86400 });
  t('semaine: start = end - EPOCH (2026-11-11), 2 of 7 days gone = 28.6%, 5 d left', s && s.debut === 1794355200 && s.pct === 28.6 && s.reste === 5 * 86400 && !s.finie, JSON.stringify(s));
  t('semaine: EPOCH unread -> null (no bar on a guess)', HV.semaine({ fin: 1794960000n, longueur: null, maintenant: 1 }) === null);
  t('semaine: over -> 100% and finie', HV.semaine({ fin: 100, longueur: 50, maintenant: 200 }).pct === 100 && HV.semaine({ fin: 100, longueur: 50, maintenant: 200 }).finie);
  /* the steps, with the values read on chain 2026-11-12 (Grok's lock 3,000,000 until 1799676860; minHold 2,789,880.2; MIN_COMMIT 604800) */
  const base = { wallet: '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b', locked: 3000000n * E, need: 2789880205312700046735192n, unlockAt: 1799676860n, minCommit: 604800n,
    maintenant: 1794500000, mien: 940979492641063762241583n, finSemaine: 1794960000n, semaineNo: 0n, accesUsd: 15n, fmt, fenetreJours: 14 };
  const et = (o) => HV.etapesPaiement({ ...base, ...o }).map((x) => x.etat).join();
  t('steps, Grok: lock done, play done, claim later', et({}) === 'fait,fait,attente', et({}));
  t('steps: $15 named only from ACCESS_USD read; the TBLOCK amount read under it', HV.etapesPaiement(base)[0].titre === 'Lock $15 of TBLOCK' && HV.etapesPaiement({ ...base, accesUsd: null })[0].titre === 'Lock 2,789,880 TBLOCK');
  t('steps: under the minimum locked -> lock to do', et({ locked: 2789879n * E }) === 'afaire,fait,attente');
  t('steps: enough locked but ending in less than 7 days -> lock to do, says why', et({ unlockAt: BigInt(base.maintenant + 604799) }) === 'afaire,fait,attente' && /must last 7 more days/.test(HV.etapesPaiement({ ...base, unlockAt: BigInt(base.maintenant + 604799) })[0].detail));
  t('steps: exactly 7 days left counts (the contract: unlockAt >= now + MIN_COMMIT)', et({ unlockAt: BigInt(base.maintenant + 604800) }) === 'fait,fait,attente');
  t('steps: MIN_COMMIT unread -> the lock step is not ticked (no tick on a guess)', et({ minCommit: null }) === 'info,fait,attente');
  t('steps: no play this week -> play to do', et({ mien: 0n }) === 'fait,afaire,attente');
  t('steps: no wallet -> no tick at all', et({ wallet: null }) === 'info,info,info');
  t('steps: the week over -> claim to do', et({ maintenant: 1794960001 }).endsWith(',afaire'));
  t('steps: the claim step says the close and the 14-day window (read)', HV.etapesPaiement(base)[2].detail === 'week 0 closes 2026-11-18 00:00 UTC; then 14 days to claim');
  const R = { TIER1_USD: 100n, TIER2_USD: 500n, TIER3_USD: 1000n, TIER1_BONUS: 1500n, TIER2_BONUS: 3000n, TIER3_BONUS: 5000n, TIME_BONUS: 2500n, TIME_FULL: 7776000n, MAX_FACTOR: 17500n };
  const rp = HV.reperesFacteur(R);
  t('factor marks from the rules read: $100 ×1.15 at 20%, $500 ×1.30 at 40%, $1,000 ×1.50 at 66.7%, +90 days ×1.75 at 100%',
    rp.map((m) => m.haut + ' ' + m.bas + ' ' + m.pos).join(' | ') === '$100 ×1.15 20 | $500 ×1.30 40 | $1,000 ×1.50 66.7 | +90 days ×1.75 100', rp.map((m) => m.haut + ' ' + m.bas + ' ' + m.pos).join(' | '));
  t('factor marks: a rule unread -> no mark at all', HV.reperesFacteur({ ...R, TIER2_USD: undefined }).length === 0 && HV.reperesFacteur(null).length === 0);
  const mp = HV.moisPuces({ courant: 0, premier: 1, dernier: 1, n: 1, joue: false });
  t('months: month 0 now not played, month 1 earned (Grok, read)', mp.map((x) => x.titre + ':' + x.etat + ':' + x.sous).join(' | ') === 'Month 0:afaire:now · not played yet | Month 1:gagne:your lock earns it', mp.map((x) => x.titre + ':' + x.etat).join());
  t('months: played this month -> ticked; a lock earning none -> this month only', HV.moisPuces({ courant: 2, premier: 0, dernier: 0, n: 0, joue: true }).map((x) => x.titre + ':' + x.etat).join() === 'Month 2:fait');
  t('months: from month 1, a lock earning months 3..5 -> 1 now, 2 not covered, 3 4 5 earned', HV.moisPuces({ courant: 1, premier: 3, dernier: 5, n: 3, joue: false }).map((x) => x.etat).join() === 'afaire,info,gagne,gagne,gagne');
  /* B. DOM + aria */
  const b = HV.barre(doc, { pct: 28.6, etiquette: 'Week 0', texte: '2 d 0 h gone of 7 days; 5 d 0 h left' });
  t('bar: progressbar 0..100, now 29, words and label', b.attrs.role === 'progressbar' && b.attrs['aria-valuemin'] === '0' && b.attrs['aria-valuemax'] === '100' && b.attrs['aria-valuenow'] === '29' && b.attrs['aria-valuetext'] === '2 d 0 h gone of 7 days; 5 d 0 h left' && b.attrs['aria-label'] === 'Week 0' && b.kids[0].style.width === '28.6%', JSON.stringify(b.attrs));
  const b2 = HV.barre(doc, { pct: 140, role: 'meter' });
  t('bar: a meter, clamped to 100 (aria and width)', b2.attrs.role === 'meter' && b2.attrs['aria-valuenow'] === '100' && b2.kids[0].style.width === '100%');
  const j = HV.jauge(doc, { valeur: 1.1667, min: 1, max: 1.75, reperes: rp, texte: '×1.17 of at most ×1.75', etiquette: 'Lock factor' });
  const m = j.tous().find((x) => x.attrs.role === 'meter');
  t('gauge: a meter 1..1.75 at 1.1667, its words, its fill at 22.2%', m && m.attrs['aria-valuemin'] === '1' && m.attrs['aria-valuemax'] === '1.75' && m.attrs['aria-valuenow'] === '1.1667' && m.attrs['aria-valuetext'] === '×1.17 of at most ×1.75' && m.kids[0].style.width.startsWith('22.2'), JSON.stringify(m && m.attrs) + (m ? m.kids[0].style.width : ''));
  t('gauge: its marks are drawn and labelled ($100 … +90 days), hidden from the screen reader (the words say it)', j.tous().filter((x) => x.className === 'hvTic').length === 4 && /×1\.00\$100×1\.15\$500×1\.30\$1,000×1\.50\+90 days×1\.75/.test(j.textContent) && j.kids[1].attrs['aria-hidden'] === 'true', j.textContent);
  const fins = j.tous().filter((x) => /hvRep/.test(x.className) && x.tag === 'span' && x.className !== 'hvTic');
  t('gauge: the last mark sits flush right with NO left (a left too squeezed it to 0 px at 375 px); the others are placed', fins.length === 5 && fins[4].className === 'hvRep hvRepFin' && fins[4].style.left === undefined && fins[1].style.left === '20%' && fins[3].style.left === '66.7%', fins.map((x) => x.className + '@' + x.style.left).join());
  const j2 = HV.jauge(doc, { valeur: 3, min: 1, max: 1.75 });
  t('gauge: clamped to its max', j2.tous().find((x) => x.attrs.role === 'meter').attrs['aria-valuenow'] === '1.75');
  const o = HV.etapes(doc, HV.etapesPaiement({ ...base, mien: 0n }), 'How you get paid');
  t('steps: an ordered list with its label; each step says its state in words', o.tag === 'ol' && o.attrs['aria-label'] === 'How you get paid' && o.kids.map((li) => li.textContent).join(' | ').includes('Lock $15 of TBLOCK Done') && o.kids[1].textContent.includes('Play this week To do') && o.kids[2].textContent.includes('Claim after the close Later'), o.kids.map((li) => li.textContent).join(' | '));
  t('steps: the mark is a ✓ only when done, and hidden from the screen reader', o.kids[0].kids[0].textContent === '✓' && o.kids[1].kids[0].textContent === '2' && o.kids[0].kids[0].attrs['aria-hidden'] === 'true');
  const ch = HV.chronologie(doc, { segments: [{ part: 5184000, cls: 'hvSegLock' }, { part: 604800, cls: 'hvSegSortie' }], reperes: [{ pos: 0, haut: 'Today', bas: '2026-11-12' }, { pos: 100, haut: '2027-01-11', bas: 'lock date' }], etiquette: 'Locked from today to 2027-01-11' });
  const segs = ch.tous().filter((x) => /hvSeg /.test(x.className));
  t('timeline: role img with its words; segments in proportion (60 d : 7 d = 89.55% : 10.45%)', ch.attrs.role === 'img' && ch.attrs['aria-label'] === 'Locked from today to 2027-01-11' && segs.length === 2 && segs[0].style.width.startsWith('89.5') && segs[1].style.width.startsWith('10.4'), segs.map((x) => x.style.width).join());
  const p = HV.puces(doc, mp, 'Months of the lock rewards');
  t('chips: a labelled list, state on each chip, ✓ only when done', p.tag === 'ul' && p.attrs['aria-label'] === 'Months of the lock rewards' && p.kids.map((x) => x.dataset.etat).join() === 'afaire,gagne' && !/✓/.test(p.textContent)
    && HV.puces(doc, [{ titre: 'Month 0', sous: 'now · you played', etat: 'fait' }]).textContent.startsWith('✓ Month 0'));
  return { ok, ko };
}

const HV = await import(pathToFileURL(SRC).href);
const r = await verifier(HV);
/* MUTANTS: each changes one rule of the module; the checks above must catch every one */
const base = readFileSync(SRC, 'utf8');
const MUTANTS = [
  ['pct in tenths of a tenth', 'return Number(p * 1000n / t) / 10;', 'return Number(p * 1000n / t) / 100;'],
  ['week starts at its end', 'const debut = f - L,', 'const debut = f,'],
  ['the 7 days left not checked', 'dure = M === null ? null : U >= t + M;', 'dure = M === null ? null : U >= t;'],
  ['MIN_COMMIT unread still ticks', "e1.etat = dure === null ? 'info' : 'fait';", "e1.etat = 'fait';"],
  ['no play counts as play', 'const joue = BigInt(mien || 0) > 0n;', 'const joue = BigInt(mien || 0) >= 0n;'],
  ['no wallet ticked', "if (!wallet) return [{ ...e1, etat: 'info' }, { ...e2, etat: 'info' }, { ...e3, etat: 'info' }];", ''],
  ['second mark from the first tier', '{ pos: pos(1 + Number(r.TIER2_BONUS) / 10000), haut: d(r.TIER2_USD), bas: x(r.TIER2_BONUS) },', '{ pos: pos(1 + Number(r.TIER1_BONUS) / 10000), haut: d(r.TIER2_USD), bas: x(r.TIER2_BONUS) },'],
  ['marks typed when unread', "].some((k) => typeof r[k] !== 'bigint')) return [];", '].some((k) => false)) return [];'],
  ['last earned month dropped', 'k >= Number(premier) && k <= Number(dernier);', 'k >= Number(premier) && k < Number(dernier);'],
  ['bar aria not clamped', "piste.setAttribute('aria-valuenow', String(Math.round(borne(p))));", "piste.setAttribute('aria-valuenow', String(Math.round(p)));"],
  ['bar without its words', "  if (texte) piste.setAttribute('aria-valuetext', texte);\n  if (etiquette) piste.setAttribute('aria-label', etiquette);\n  const r = el(doc, 'div', 'hvRempli'); r.style.width = borne(p) + '%';\n  piste.append(r);\n  return piste;", "  if (etiquette) piste.setAttribute('aria-label', etiquette);\n  const r = el(doc, 'div', 'hvRempli'); r.style.width = borne(p) + '%';\n  piste.append(r);\n  return piste;"],
  ['gauge aria not clamped', "piste.setAttribute('aria-valuenow', String(Math.max(a, Math.min(b, v))));", "piste.setAttribute('aria-valuenow', String(v));"],
  ['state said by the mark only', "fait: 'Done', afaire: 'To do', attente: 'Later'", "fait: '', afaire: '', attente: ''"],
  ['last gauge mark also given a left', "if (m.pos < 100) s.style.left = borne(m.pos) + '%';", "s.style.left = borne(m.pos) + '%';"],
  ['timeline without its role', "box.setAttribute('role', 'img'); ", ''],
];
const dir = mkdtempSync(join(tmpdir(), 'hv378-'));
let tues = 0;
try {
  MUTANTS.forEach(([nom, a, b], k) => {
    if (base.split(a).length !== 2) { console.log('KO mutant anchor not found once:', nom); r.ko++; return; }
    writeFileSync(join(dir, 'm' + k + '.mjs'), base.replace(a, () => b));
  });
  for (let k = 0; k < MUTANTS.length; k++) {
    let m;
    try { m = await import(pathToFileURL(join(dir, 'm' + k + '.mjs')).href); } catch (_) { continue; }
    let res;
    try { res = await verifier(m, false); } catch (_) { res = { ko: 1 }; }
    if (res.ko > 0) tues++; else console.log('KO mutant survived:', MUTANTS[k][0]);
  }
} finally { rmSync(dir, { recursive: true, force: true }); }
if (tues !== MUTANTS.length) r.ko++;
console.log(r.ok + '/' + (r.ok + r.ko) + ' checks, mutants killed ' + tues + '/' + MUTANTS.length + (r.ko ? ' — RED' : ' — green') + '; NE PROUVE PAS the rendering');
process.exit(r.ko ? 1 : 0);
