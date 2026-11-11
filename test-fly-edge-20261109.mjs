// test-fly-edge-20261109.mjs — the fly buys only when its edge pays the fee (fly-core.edgeOf / edgePaysFee + the edge paper book + the
// real-buy rule), with mutants. The rule was KEPT BY SIMULATION (banc-fly-sim-20261109: 5 synthetic markets, truth known). A stub fly whose
// tendency per window is set by the test runs the session's real protocol; an INDEPENDENT replay of the rule (in only while the fly wants
// in AND (2p - 1) x usual move > fee, with the record and usual move known when the call was made) must give the module's book, window by
// window. Does NOT prove the rule earns on the real market: it trades only on an edge that pays its cost, and says when it does not.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const S = '0x' + '5'.repeat(40), PP = '0x' + '9'.repeat(40), FEE = 500;

async function banc(dir) {
  const { createSession, edgeOf, edgePaysFee, FLY } = await import(pathToFileURL(join(dir, 'fly-core.js')).href + '?t=' + Date.now() + Math.random());
  let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
  const near = (a, b) => Math.abs(a - b) < 1e-15;
  ok(FLY.EDGE_PRIOR === 10 && FLY.INTERFACE_FEE === 0, 'the prior, and NO interface fee for the fly (game323, Phil 09/11)');
  /* game323: the fly's trades are built at 0 bps (rails-api.js `mouche: true` -> planAerodromeSegment fraisBps 0n) and the page asks for it */
  const railsSrc = readFileSync(join(ICI, 'rails-api.js'), 'utf8'), pageSrc = readFileSync(join(ICI, 'fly-brain.js'), 'utf8');
  ok(/q\.mouche === true[\s\S]{0,400}fraisBps: 0n/.test(railsSrc), 'rails-api builds the fly trade at 0 bps when mouche is set');
  ok(/URLSearchParams\(\{[^}]*mouche: '1'/.test(pageSrc), 'the fly page asks its plans with mouche=1');
  /* 1. the edge */
  ok(edgeOf({}, 0.0015) === 0 && edgeOf({ consistent: 50, opposite: 10 }, 0) === 0, 'no record, or no usual move yet: no edge');
  ok(near(edgeOf({ consistent: 192, opposite: 180 }, 0.0015), (2 * 202 / 392 - 1) * 0.0015), 'the shared fly today: ' + edgeOf({ consistent: 192, opposite: 180 }, 0.0015));
  ok(!edgePaysFee({ consistent: 192, opposite: 180 }, 0.0015, FEE), 'the shared fly today: its edge (0.005%) does not pay even the pool fee alone (0.05%)');
  ok(!edgePaysFee({ consistent: 300, opposite: 100 }, 0.0015, FEE, 0.001) && edgePaysFee({ consistent: 300, opposite: 100 }, 0.0015, FEE), 'a 75% record on a 0.15% move (edge 0.071%): blocked with the old 0.10% interface fee, PAYS now that the fly pays the pool fee alone (0.05%)');
  ok(edgePaysFee({ consistent: 300, opposite: 100 }, 0.004, FEE), 'the same record on a 0.4% usual move pays the real cost: ' + edgeOf({ consistent: 300, opposite: 100 }, 0.004));
  ok(!edgePaysFee({ consistent: 300, opposite: 100 }, 0.004, FEE, 0.005), 'a route with a 0.5% interface fee does not');
  ok(edgeOf({ consistent: 10, opposite: 30 }, 0.0015) < 0 && !edgePaysFee({ consistent: 10, opposite: 30 }, 0.0015, FEE), 'a losing record: negative edge, no trade');
  ok(!edgePaysFee({ consistent: 300, opposite: 100 }, 0.004, null) && !edgePaysFee({ consistent: 300, opposite: 100 }, 0.004, NaN) && !edgePaysFee({ consistent: 300, opposite: 100 }, 0.004, FEE, NaN), 'fee unknown: it does not trade');
  ok(!edgePaysFee({ consistent: 3, opposite: 0 }, 0.0015, FEE), 'three right in a row is not an edge yet: the prior holds it back');

  /* 2. the book, replayed independently */
  const make = () => {
    const q = [], ev = [];
    const fly = { N: [], odorDrive: (m) => m, present: (d, { onStart, onPeak } = {}) => { if (onStart) { onStart(); if (onPeak) onPeak({}); return; } if (onPeak) onPeak({ t: q.length ? q.shift() : 0, ap: 0, av: 0, word: 'x' }); },
      addDopamine: () => 0, snapshot: () => null, weakened: () => [], thought: () => [] };
    const ses = createSession(fly, (e) => ev.push(e));
    let k = 0;
    const win = (p, t) => { if (k > 0) q.push(t); k++; ses.window({ symbol: 'X', price: { priceUsd: p, tokenDecimals: 0, feePips: FEE, block: k }, transactions: [{ tx: '0x' + k.toString(16), bloc: k, signataire: S, mouvements: [{ de: PP, vers: S, montant: '1' }] }] }); };
    return { ses, win, ev };
  };
  { const { ses, win, ev } = make();
    /* a fly that is RIGHT most of the time on 0.4% moves: its edge comes to pay the fee, and the book enters */
    const plan = []; let p = 100;
    for (let i = 0; i < 150; i++) { const up = (i * 7) % 5 !== 0, right = i % 6 !== 3; plan.push([p, (up === right ? 1 : -1) * 0.1]); p *= up ? 1.004 : 0.996; }
    let e = 0, ret = 1, prevP = null, decision = null, entered = 0;
    win(100, 0); prevP = 100;
    for (const [price, t] of plan) {
      const st0 = ses.state(), move = price / prevP - 1;
      if (st0.feePips != null) {
        const to = (decision === 'buy' || decision === 'hold') && edgePaysFee(st0.tally, st0.typical, st0.feePips) ? 1 : 0;
        if (to !== e) { ret *= 1 - (FEE / 1e6 + FLY.INTERFACE_FEE); e = to; if (to) entered++; }
        ret *= 1 + e * move;
      }
      const nEv = ev.length; win(price, t); prevP = price;
      const d = ev.slice(nEv).filter((x) => x.type === 'decision').pop(); decision = d ? d.action : decision;
      const eb = ses.state().books.edge;
      ok(Math.abs(eb.ret - ret) < 1e-12 && eb.pos === e, 'window ' + n + ': module ' + eb.ret + ' / ' + eb.pos + ' vs replay ' + ret + ' / ' + e);
    }
    const st = ses.state();
    ok(entered > 0 && st.edgeNow.pays === edgePaysFee(st.tally, st.typical, st.feePips) && near(st.edgeNow.edge, edgeOf(st.tally, st.typical)) && near(st.edgeNow.fee, FEE / 1e6 + FLY.INTERFACE_FEE), 'a right fly comes to pay its fee and enters: ' + JSON.stringify({ entered, edgeNow: st.edgeNow, tally: st.tally }));
    ok(st.sameWindows && st.sameWindows.windows === 150 && st.sameWindows.edge === st.books.edge.ret, 'same-windows comparison: ' + JSON.stringify(st.sameWindows));
  }
  { /* 3. a fly with no edge never pays a fee, whatever it calls */
    const { ses, win } = make(); win(100, 0);
    for (let i = 0; i < 8; i++) win(i % 2 ? 99 : 101, i % 2 ? -0.1 : 0.1);
    ok(ses.state().books.edge.ret === 1 && ses.state().books.edge.switches === 0 && ses.state().books.fly.ret < 1, 'no edge: the edge book holds nothing, pays nothing; the all-in fly lost ' + ses.state().books.fly.ret);
  }
  { /* 4. restore: kept; an old state (no edge book) starts it fresh; a broken start is dropped */
    const { ses, win } = make(); win(100, 0);
    for (let i = 0; i < 60; i++) win(100 * (1 + 0.004 * (i + 1)), 0.1);
    const saved = JSON.parse(JSON.stringify(ses.state()));
    ok(saved.books.edge.pos === 1 && saved.edgeFrom, 'in the stock to restore');
    const a = make(); a.ses.restore(saved);
    ok(a.ses.state().books.edge.pos === 1 && a.ses.state().books.edge.ret === saved.books.edge.ret && JSON.stringify(a.ses.state().edgeFrom) === JSON.stringify(saved.edgeFrom), 'the book and its start come back');
    const old = JSON.parse(JSON.stringify(saved)); delete old.books.edge; delete old.edgeFrom;
    const b = make(); b.ses.restore(old);
    ok(b.ses.state().books.edge.ret === 1 && b.ses.state().books.edge.pos === 0 && b.ses.state().edgeFrom === null && b.ses.state().books.fly.ret === saved.books.fly.ret, 'an old state: edge book fresh, the rest kept');
    const bad = JSON.parse(JSON.stringify(saved)); bad.edgeFrom.fly = 0;
    const c = make(); c.ses.restore(bad);
    ok(c.ses.state().edgeFrom === null && c.ses.state().books.edge.ret === 1, 'a broken start is not taken back');
  }
  return n;
}

const total = await banc(ICI);
/* the real buy follows the same rule (page source: fly-brain.js is a browser module; its money path is exercised on the fork bench) */
const page = readFileSync(join(ICI, 'fly-brain.js'), 'utf8');
/* game366: the real BUY is refused while the edge does not pay the WHOLE round trip (both sides' fees and gas) — aRetourPaye, not edgePaysFee */
assert.ok(/const st = session\.state\(\), r = recordEdge\(st\.tally\);[\s\S]{0,900}if \(!aRetourPaye\(\{ tally: st\.tally, typical: st\.typical, feePips: st\.feePips, gasUsd: gasCote, tailleUsd: taille \}\)\) \{ autoNote\(/.test(page), 'the real BUY is refused while the edge does not pay the round trip');
assert.ok(/const amt = have < cap \? have : cap;[\s\S]{0,3200}de = USDC_BASE; vers = stock\.address; montant = amt\.toString\(\);/.test(page), 'when it pays, the amount planned is min(USDC, cap)');
{ const i = page.indexOf("if (action === 'buy' && round === 0) { const st2 = session.state(), bps = Number(p.resume.fraisBps);"), j = page.indexOf('if (!Number.isFinite(bps) || !aRetourPaye({ tally: st2.tally, typical: st2.typical, feePips: st2.feePips, interfaceFee: bps / 1e4,') /* game366: the round trip */, h1 = page.indexOf('/* ⛔ H1: nothing is signed');
  assert.ok(i > 0 && j > i && j - i < 200 && h1 > j, 'the real BUY checks the cost of ITS route before anything is signed'); }
/* 09/11: the coin-flip gate is gone (it changed nothing on top of the edge rule in simulation, and added a second refusal): no checkbox,
 *   no gate left in the trade path */
{ const html = readFileSync(join(ICI, 'fly-brain.html'), 'utf8');
  assert.ok(!html.includes('autoProven') && !page.includes("$('autoProven')") && !/does not beat a coin flip yet: no real buy/.test(page), 'no coin-flip gate left on the page'); }
console.log('test-fly-edge-20261109 : ' + (total + 4) + ' assertions OK');

const MUT = [
  ['no prior (raw record)', 'a = FLY.EDGE_PRIOR;', 'a = 0;'],
  ['usual move ignored', 'return Number.isFinite(typical) && typical > 0 ? (2 * p - 1) * typical : 0;', 'return (2 * p - 1);'],
  ['fee ignored', 'edgeOf(tally, typical) > feePips / 1e6 + interfaceFee;', 'edgeOf(tally, typical) > 0;'],
  ['interface fee ignored', 'edgeOf(tally, typical) > feePips / 1e6 + interfaceFee;', 'edgeOf(tally, typical) > feePips / 1e6;'],
  /* game323: 'edge book charged the pool fee only' removed — with INTERFACE_FEE = 0 it is an EQUIVALENT mutant (it changes nothing) */
  ['unknown fee trades', 'return Number.isFinite(feePips) && feePips >= 0 && Number.isFinite(interfaceFee) && interfaceFee >= 0 && edgeOf', 'return edgeOf'],
  ['book ignores the edge', 'const edgeIn = flyWants && edgePaysFee(tally, typical, feePips) ? 1 : 0;', 'const edgeIn = flyWants;'],
  ['start re-taken each window', 'if (!edgeFrom) edgeFrom = { settled,', 'edgeFrom = { settled,'],
  ['old state keeps a stale edge book', 'if (!edgeFrom) Object.assign(books.edge, { pos: 0, ret: 1, switches: 0 });', ''],
  ['broken start taken back', '&& Number.isFinite(ef.fly) && ef.fly > 0 &&', '&&'],
];
const src = readFileSync(join(ICI, 'fly-core.js'), 'utf8');
let tues = 0;
for (const [nom, de, a] of MUT) {
  const k = src.split(de).length - 1; if (k !== 1) { console.log('  ' + nom + ' : MOTIF x' + k + ' -> SURVIT'); continue; }
  const d = mkdtempSync(join(tmpdir(), 'fly-edge-mut-'));
  try { writeFileSync(join(d, 'fly-core.js'), src.replace(de, () => a)); await banc(d); console.log('  ' + nom + ' : SURVIT'); }
  catch (e) { tues++; console.log('  ' + nom + ' : TUE (' + String(e.message).slice(0, 90) + ')'); }
  finally { rmSync(d, { recursive: true, force: true }); }
}
assert.equal(tues, MUT.length, 'MUTANTS : ' + tues + '/' + MUT.length);
console.log('MUTANTS : ' + tues + '/' + MUT.length + ' tues');
