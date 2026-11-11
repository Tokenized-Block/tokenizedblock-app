// test-fly-day-20261109.mjs — the fly's daily cap holds across a reload in the middle of a trade (QA 08/11 open item).
// Proves: (1) fly-day.js pure rules (past day = 0, cap, reserve never mutates); (2) a SIMULATED reload: the state is saved as JSON right
//   after the reservation, re-read, and the next decision sees the trade counted; (3) fly-brain.js reserves BEFORE its first flySend in
//   autoTrade and no longer counts after the swap. Mutants on COPIES of fly-day.js and fly-brain.js: all must be killed.
// Does NOT prove: the page in a browser, a real wallet, a real reload (looked at in the browser separately).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ICI = dirname(fileURLToPath(import.meta.url));

function suite(D, brainSrc) {
  const res = [], ok = (nom, f) => { try { const d = f(); res.push({ nom, ok: true, d }); } catch (e) { res.push({ nom, ok: false, d: String(e && e.message || e).slice(0, 200) }); } };
  ok('dayOf = UTC YYYY-MM-DD', () => { assert.equal(D.dayOf(Date.UTC(2026, 10, 8, 23, 59, 59)), '2026-11-08'); assert.equal(D.dayOf(Date.UTC(2026, 10, 9, 0, 0, 1)), '2026-11-09'); });
  ok('countedToday : a past day counts 0, today counts its trades, garbage counts 0', () => {
    assert.equal(D.countedToday({ day: '2026-11-08', today: 7 }, '2026-11-09'), 0);
    assert.equal(D.countedToday({ day: '2026-11-09', today: 3 }, '2026-11-09'), 3);
    for (const s of [null, {}, { day: '2026-11-09', today: -2 }, { day: '2026-11-09', today: 1.5 }, { day: '2026-11-09', today: NaN }]) assert.equal(D.countedToday(s, '2026-11-09'), 0);
  });
  ok('mayTrade : strictly under the cap', () => {
    assert.equal(D.mayTrade({ day: 'd', today: 9 }, 'd', 10), true);
    assert.equal(D.mayTrade({ day: 'd', today: 10 }, 'd', 10), false);
    assert.equal(D.mayTrade({ day: 'old', today: 10 }, 'd', 10), true);
  });
  ok('reserveTrade : +1 today, a new day restarts at 1, the input is not mutated, other fields kept', () => {
    const s = Object.freeze({ day: 'd', today: 2, running: true, traded: ['0xa'] });
    const r = D.reserveTrade(s, 'd'); assert.equal(r.today, 3); assert.equal(r.day, 'd'); assert.equal(r.running, true); assert.deepEqual(r.traded, ['0xa']);
    const n = D.reserveTrade(s, 'e'); assert.equal(n.today, 1); assert.equal(n.day, 'e');
  });
  ok('reload in the middle : reserved, saved, page reloaded before the swap is mined -> the next decision sees it; cap 2 holds', () => {
    let stored = JSON.stringify({ day: '2026-11-08', today: 5, running: true });
    const today = '2026-11-09', cap = 2; let sent = 0;
    for (let decision = 0; decision < 5; decision++) {
      const s = JSON.parse(stored); /* each decision starts from the STORED state (a reload re-reads it) */
      if (!D.mayTrade(s, today, cap)) continue;
      stored = JSON.stringify(D.reserveTrade(s, today)); /* saved before the first transaction */
      sent++; /* ...the page reloads here: the line after the swap never runs */
    }
    assert.equal(sent, cap, 'transactions started'); assert.equal(JSON.parse(stored).today, cap);
    return sent + ' trades started for a cap of ' + cap;
  });
  ok('fly-brain.js : reserve() right before flySend in the trade loop, no count after the swap, cap read on the stored state', () => {
    const i = brainSrc.indexOf('async function autoTrade('), body = brainSrc.slice(i).split(/\r?\n\}\r?\n/)[0];
    assert.ok(/reserve\(\);\s*const r = await flySend\(c\);/.test(body), 'reserve before send');
    assert.ok(/const reserve = \(\) => \{ if \(reserved\) return; autoRefresh\(\); Object\.assign\(auto\.s, reserveTrade\(auto\.s, today\)\);( Object\.assign\(auto\.s, reserveVolume\(auto\.s, Date\.now\(\), volumeDuTrade\)\);)? autoSave\(\); reserved = true;( sendingStarted = true;)? \};/.test(body), 'reserve saves (game364: with the 24 h volume, same save)');
    assert.ok(!/today\+\+/.test(body), 'no late counting');
    assert.ok(/if \(!mayTrade\(autoRefresh\(\), today, maxDay\)\)/.test(body), 'cap on stored state');
    assert.ok(/import \{ dayOf, countedToday, mayTrade, reserveTrade(, volume24h, mayBuyVolume, reserveVolume, verdictPerte)? \} from '\.\/fly-day\.js';/.test(brainSrc), 'imported (game364: + the 24 h volume and auto-stop rules)');
  });
  return res;
}

let n = 0; const ech = [];
const D0 = await import('./fly-day.js'), B0 = readFileSync(join(ICI, 'fly-brain.js'), 'utf8').replace(/\r\n/g, '\n');
for (const r of suite(D0, B0)) { n++; console.log((r.ok ? 'OK    ' : 'ECHEC ') + r.nom + (r.d ? '  ' + r.d : '')); if (!r.ok) ech.push(r); }
const srv = readFileSync(join(ICI, 'serveur-web.js'), 'utf8');
n++; if (/'fly-seal\.js', 'fly-day\.js',/.test(srv)) console.log('OK    served by serveur-web.js'); else { console.log('ECHEC served by serveur-web.js'); ech.push({}); }

const MUT = [
  ['fly-day.js', 'past day still counts', 's && s.day === today && Number.isInteger', 's && Number.isInteger'],
  ['fly-day.js', 'cap off by one', 'return countedToday(s, today) < max;', 'return countedToday(s, today) <= max;'],
  ['fly-day.js', 'reserve does not add', 'today: countedToday(s, today) + 1', 'today: countedToday(s, today)'],
  ['fly-day.js', 'reserve keeps the old day', '{ ...s, day: today, today:', '{ ...s, today:'],
  ['fly-brain.js', 'no reservation before send', 'reserve();\n          const r = await flySend(c);', 'const r = await flySend(c);'],
  ['fly-brain.js', 'reservation not saved', 'reserveTrade(auto.s, today)); autoSave(); reserved = true;', 'reserveTrade(auto.s, today)); reserved = true;'],
  ['fly-brain.js', 'cap on the copy', 'if (!mayTrade(autoRefresh(), today, maxDay))', 'if (!mayTrade(auto.s, today, maxDay))'],
];
const dossier = mkdtempSync(join(process.env.TAM_TMP || tmpdir(), 'fly-day-mut-'));
let tues = 0;
try {
  for (const [i, [f, nom, de, vers]] of MUT.entries()) {
    const src = readFileSync(join(ICI, f), 'utf8').replace(/\r\n/g, '\n'), k = src.split(de).length - 1;
    if (k !== 1) { console.log(`  M${i + 1} ${nom} : NOT APPLIED (pattern found ${k} times) -> SURVIVES`); continue; }
    const mute = src.replace(de, () => vers);
    let D = D0, B = B0;
    if (f === 'fly-day.js') { const p = join(dossier, 'm' + i + '-fly-day.js'); writeFileSync(p, mute); D = await import(pathToFileURL(p).href); } else B = mute;
    const rouges = suite(D, B).filter((r) => !r.ok);
    if (rouges.length) tues++;
    console.log(`  M${i + 1} ${nom} : ${rouges.length ? 'KILLED' : 'SURVIVES'}${rouges.length ? ' (' + rouges[0].nom.slice(0, 60) + ')' : ''}`);
  }
} finally { rmSync(dossier, { recursive: true, force: true }); }
console.log(`\nMUTANTS : ${tues}/${MUT.length} killed`);
console.log(`test-fly-day-20261109 : ${n - ech.length}/${n} OK`);
process.exit(ech.length || tues !== MUT.length ? 1 : 0);
