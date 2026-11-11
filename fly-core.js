/* fly-core.js — the fly's brain and its market protocol, PURE: no DOM, no fetch, no timers. The page (fly-brain.js) and the server
 * (the shared fly that keeps training when nobody watches) run THIS code, so the two flies can never drift apart.
 * Circuit: hemibrain v1.2 (Janelia FlyEM, CC BY 4.0), measured neurons and synapse counts. Ours, and stated on the page: the dynamics,
 * the odor mapping onto PNs, the learning constants, the approach/avoid reading. Nothing is signed, nothing is advice. */

/* our constants */
export const FLY = Object.freeze({
  KC_SHARE: 0.10, DECAY: 0.6, GAIN: 0.5,
  WEBER_UNIT: 0.0005, WEBER_SPAN: 200,      // a 0.05% move is one unit; strength saturates near 10%
  ODOR_UNIT_USD: 50, ODOR_SPAN: 2000,        // a $50 trade is one unit; strength saturates near $100k
  LEARN: 0.15, RECOVER: 0.0002, FLOOR: 0.05, // a strong move weakens its pattern's synapses by a few %; forgotten over ~10 min of steps
  /* measured 2026-11-08: after a pulse the circuit stays saturated ~15 steps, falls under 1% at ~20 and under 0.1% at ~30 steps (3.6 s):
   *   a rest of 14 started the next pulse on a circuit still at 100% and mixed the two stimuli */
  FLAT: 0.0005, REST_TICKS: 30, PULSE_STEPS: 6,
  /* 2026-11-08 (Phil: "129 undecided"): dopamine neurons ADAPT to the range of rewards they expect (Tobler, Fiorillo & Schultz 2005,
   *   Science 307:1642). The fly's teaching strength is the move's size against this stock's USUAL move (running mean of |move|,
   *   weight TYPICAL_ALPHA): a usual move teaches at 1/SURPRISE, twice the usual saturates. With a fixed 0.05% unit, the 0.01% moves of
   *   a 30 s window taught ~2% and the fly stayed undecided for 129 windows. */
  SURPRISE: 2, TYPICAL_ALPHA: 0.1,
  /* how sure it must be to act: the pull-minus-push it needs, as a share of their sum (0.02 = 2%). The page lets a user lower or
   *   raise it ("boldness"); the server's shared fly keeps this default. */
  DECIDE: 0.02,
  /* 2026-11-09 (Phil: "check traders who use math and add it to the fly"). Measured on the shared fly, 1,088 windows: its paper book lost
   *   -5.3%, and its 106 all-in switches at the pool fee (0.05%) make 0.9995^106 = 0.948 of it: it bet everything on an edge it had not
   *   shown (192 right / 180 wrong). Simulated (banc-fly-sim-20261109: the real fly on 5 synthetic markets x 12 seeds x 200 windows,
   *   the truth known), the rule kept is the one of trading with costs: ENTER only when the expected gain of a window in pays the fee.
   *   Expected gain = (2p - 1) x the usual move, p = its record shrunk toward a coin by a Beta(EDGE_PRIOR, EDGE_PRIOR) prior; fee = the
   *   pool's. Measured: 0.00% on the 4 markets where the edge does not pay (noise, slow fall, signal 2 windows late, weak signal: the
   *   old all-in fly lost up to -2.09%), +1.11% where the signal is real (old fly +2.34%: it keeps about half). Half-Kelly (2p - 1) was
   *   tried first and dropped: the binary formula is the wrong model for small continuous moves (+0.40% on a real signal). */
  EDGE_PRIOR: 10,
  /* the app's interface fee on an Aerodrome concentrated-liquidity swap (calldata-aerodrome.js FRAIS_INTERFACE_BPS_CL = 10 bps, checked by
   *   test-fly-edge): a side costs the pool fee PLUS this (fork 09/11: a round trip of 6,000 units on 2,000,000 = 2 x (0.05% + 0.10%)).
   *   The real buy uses the fee the planner states for ITS route (resume.fraisBps).
   * ⛔ game323 (Phil 09/11): the fly's own trades carry NO interface fee (rails-api.js mouche=1 builds them at 0 bps), so a side costs the
   *   pool fee only. Measured before: SPCXc moved 0.110 % a window, under the 0.15 % side cost, so it could never buy there. */
  INTERFACE_FEE: 0,
  /* 2026-11-09, simulated at the REAL cost (0.15% a side): on 30 s windows (moves ~0.15%) no per-window edge pays it, the rule never
   *   trades; on 10x longer windows the same rule made +2.23% on a real signal and 0.00% elsewhere. The page and the server read every
   *   30 s / 60 s (the screen stays live: every trade is shown as it comes), but the fly smells, is judged, learns and DECIDES once per
   *   WINDOW_MS, on the trades summed over it and the move since its last decision. A session made with windowMs 0 decides at every read. */
  WINDOW_MS: 300000,
  /* 2026-11-09 (Phil: "the fly must trade every stock, not only SNDKc"): a quiet stock (GOOGLc ~0.06% a minute) can never pay 0.15% a side
   *   on 5 minutes. A fee is fixed while a move grows with time (about sqrt(time) for a random walk: our assumption), so with
   *   windowMs 'auto' each stock gets the window where its usual move reaches the cost of a side / EDGE_TARGET (0.5% at 0.15%):
   *   window = read interval x (target / usual move per read)^2, measured live from the reads, within [WINDOW_MIN_MS, WINDOW_MAX_MS].
   *   EDGE_TARGET chosen on SIMULATED markets at the real cost (banc-fly-sim): a 0.375% target (0.4) made +0.40% on a real signal (median
   *   0), ~0.47% made +2.23%; 0.3 (0.5%) is kept, 0.00% elsewhere in both. Not fitted on the real market. */
  EDGE_TARGET: 0.3, WINDOW_MIN_MS: 300000, WINDOW_MAX_MS: 7200000,
  /* eligibility trace (Handler et al. 2019, Cell 178:60, Drosophila: an odor leaves a Kenyon-cell trace that dopamine arriving
   *   AFTER it can still act on): a smell is taught by the moves of the next TRACE windows, each weighted TRACE_DECAY^age. 1 = the
   *   next window only (the model before 2026-11-08). */
  TRACE: 3, TRACE_DECAY: 0.5,
  /* measured 2026-11-08 (banc-fly-trace, 16 seeds x 50 windows, noise 0.08%/window): signal 2 windows late, trace 1 -> 4 right /
   *   2 wrong, trace 3 -> 9 right / 0 wrong; signal 1 window late: 16/16 both; NO signal: it still "decides" 13/16 (trace 1) and 15/16
   *   (trace 3) -- a learner sees patterns in noise. Hence the record gate below for real money. */
});
/** Its track record against a coin flip: k right out of n judged predictions, and the exact one-sided binomial p-value P(X >= k)
 *  when it is a coin (p = 0.5). Real money waits for a small p: a fly that sees patterns in noise has not earned trust yet. */
export function recordEdge({ consistent = 0, opposite = 0 } = {}) {
  const k = Math.max(0, Math.floor(consistent)), n = k + Math.max(0, Math.floor(opposite));
  if (!n) return { k, n, rate: null, p: 1 };
  /* P(X = i) = C(n, i) / 2^n, summed from i = k to n, in log space to stay exact enough for thousands of windows */
  let lc = 0; const terms = [];
  for (let i = 0; i <= n; i++) { if (i > 0) lc += Math.log((n - i + 1) / i); if (i >= k) terms.push(lc - n * Math.LN2); }
  const m = Math.max(...terms), p = Math.min(1, Math.exp(m) * terms.reduce((a, t) => a + Math.exp(t - m), 0));
  return { k, n, rate: k / n, p };
}
/** The expected gain of one window in, from its record and the usual move: (2p - 1) x typical, p shrunk toward 1/2 by the prior.
 *  No record, or no usual move yet -> 0. A losing record gives a negative edge. */
export function edgeOf({ consistent = 0, opposite = 0 } = {}, typical = 0) {
  const k = Math.max(0, Math.floor(consistent) || 0), n = k + Math.max(0, Math.floor(opposite) || 0), a = FLY.EDGE_PRIOR;
  const p = (k + a) / (n + 2 * a);
  return Number.isFinite(typical) && typical > 0 ? (2 * p - 1) * typical : 0;
}
/** true when that expected gain pays one side of the trade: the pool fee (feePips: millionths, read on chain) plus the interface fee
 *  (default the Aerodrome one; the real buy passes its route's); unknown fee -> false: it does not trade */
export function edgePaysFee(tally, typical, feePips, interfaceFee = FLY.INTERFACE_FEE) {
  return Number.isFinite(feePips) && feePips >= 0 && Number.isFinite(interfaceFee) && interfaceFee >= 0 && edgeOf(tally, typical) > feePips / 1e6 + interfaceFee;
}
/* game366 (edge research, 2026-11-11: 3 signals walk-forward, none beat the costs out of sample; the circuit 655 right / 683 wrong = 49.0%,
 *   p 0.79). It found a LATENT defect: edgePaysFee compared one window's expected gain with ONE side's pool fee (0.05%), forgetting the exit
 *   and the gas the fly pays itself (~$0.0027-0.0030 per swap measured on other users' receipts = 53-61 bps a side at 0.5 USDC). The true
 *   round trip at 0.5 USDC is ~1.16-1.22%, not 0.05%. Today it changed nothing (the edge was negative); the day luck lifted it above 0.05%
 *   the fly would have entered a certain loss. */
export const GAS_UNITES_COTE = 300000n; /* gas units per side (approval + swap); priced at what is PAID (base + tip), not the 2x cap */
/** true when the expected gain pays the WHOLE round trip: 2 x (pool fee + interface fee) + 2 x gas in USD / trade size in USD.
 *  gasUsd: one side's gas in USD, measured live (base fee x units x ETH price); unknown / non-positive -> false: it does not trade. */
export function aRetourPaye({ tally, typical, feePips, interfaceFee = FLY.INTERFACE_FEE, gasUsd, tailleUsd }) {
  if (!(Number.isFinite(feePips) && feePips >= 0 && Number.isFinite(interfaceFee) && interfaceFee >= 0)) return false;
  if (!(Number.isFinite(gasUsd) && gasUsd > 0 && Number.isFinite(tailleUsd) && tailleUsd > 0)) return false;
  return edgeOf(tally, typical) > 2 * (feePips / 1e6 + interfaceFee) + 2 * gasUsd / tailleUsd;
}
/** one side's gas in USD at the price actually paid (live base fee + the 0.001 gwei tip flySend sets) and the ETH price; null if unread.
 *  Cross-check (edge research 2026-11-11): other users' swap receipts paid a median ~$0.0027-0.0030. */
export function gasUsdCote(baseFeeWei, ethUsd, unites = GAS_UNITES_COTE) {
  let b; try { b = BigInt(baseFeeWei); } catch (_) { return null; }
  if (b <= 0n || !(Number.isFinite(ethUsd) && ethUsd > 0)) return null;
  const wei = BigInt(unites) * (b + 1000000n);
  return Number(wei) / 1e18 * ethUsd;
}
/** The word a tendency gives at a given threshold: approach, avoid or undecided. */
export const wordOf = (t, threshold = FLY.DECIDE) => (t > threshold ? 'approach' : t < -threshold ? 'avoid' : 'undecided');

/* Weber-Fechner: felt strength = log of the size in units, 0..1 */
export const weber = (x, unit, span) => Math.min(1, Math.log1p(Math.abs(x) / unit) / Math.log1p(span));

/* What the chain proves about a transaction, from its Transfer movements and its SIGNER (tx.from, read by the server — a Transfer log
 * alone can be emitted by anyone): the signer received the stock, sent it, or it moved between two others. Never "buy" or "sell". */
export function classify(t) {
  const s = t.signataire, mv = Array.isArray(t.mouvements) ? t.mouvements : [];
  if (s && mv.some((m) => m.vers === s)) return 'received';
  if (s && mv.some((m) => m.de === s)) return 'sent';
  return 'moved';
}

export function createFly(circuit) {
  const N = circuit.neurons.map((n) => ({ ...n, dan: /^PAM/.test(n.type) ? 'reward' : /^PPL1/.test(n.type) ? 'punishment' : null }));
  const index = new Map(N.map((n, i) => [n.id, i]));
  /* Each MBON's compartment, from MEASURED synapses: the dopamine class (PAM reward / PPL1 punishment) that sends it the most.
   * In the fly, dopamine depresses KC->MBON synapses in its compartment, so a PAM compartment's MBON pushes AWAY (reward silences it)
   * and a PPL1 compartment's MBON pushes TOWARD. */
  const danTo = new Map();
  for (const [a, b, w] of circuit.edges) {
    const A = N[index.get(a)], B = N[index.get(b)];
    if (A.dan && B.family === 'MBON') { const o = danTo.get(b) || { reward: 0, punishment: 0, from: [] }; o[A.dan] += w; o.from.push([index.get(a), w]); danTo.set(b, o); }
  }
  N.forEach((n) => { if (n.family !== 'MBON') return; const o = danTo.get(n.id);
    n.valence = !o ? null : o.reward > o.punishment ? 'avoid' : 'approach';
    const tot = o ? o.from.reduce((s, [, w]) => s + w, 0) : 0; n.danIn = o ? o.from.map(([i, w]) => [i, w / tot]) : []; });

  const incoming = N.map(() => []), totalIn = new Float64Array(N.length);
  /* dopamine is a modulator, not a driver: its synapses are not spread as excitation, their effect is the learning in step();
   * APL is inhibitory (GABA): its synapses are not spread as excitation either, its effect is the top-10% rule in step() */
  for (const [a, b, w] of circuit.edges) { const i = index.get(a), j = index.get(b); if (N[i].family === 'DAN' || N[i].family === 'APL') continue; incoming[j].push([i, w]); totalIn[j] += w; }
  /* [source, normalised weight, plasticity multiplier (KC->MBON only)] */
  const inputs = incoming.map((l, j) => l.map(([i, w]) => [i, w / totalIn[j], N[i].family === 'KC' && N[j].family === 'MBON' ? 1 : null]));
  let act = new Float64Array(N.length), next = new Float64Array(N.length);
  const kcIdx = [], mbonIdx = []; let aplIdx = -1;
  N.forEach((n, j) => { if (n.family === 'KC') kcIdx.push(j); if (n.family === 'MBON') mbonIdx.push(j); if (n.family === 'APL') aplIdx = j; });
  N.counts = { approach: N.filter((n) => n.valence === 'approach').length, avoid: N.filter((n) => n.valence === 'avoid').length };
  /* every measured connection of every neuron, for the map: [other neuron, synapses] */
  N.out = N.map(() => []); N.in = N.map(() => []);
  for (const [a, b, w] of circuit.edges) { const i = index.get(a), j = index.get(b); N.out[i].push([j, w]); N.in[j].push([i, w]); }

  /* One step: synapse-weighted mean of inputs (KC->MBON scaled by what was learned); APL keeps the top 10% of Kenyon cells; then dopamine
   * depresses the KC->MBON synapses of co-active Kenyon cells in its compartment (the fly's learning rule), slowly recovering. */
  function step(drive) {
    /* forgetting runs only while a pulse drives the circuit, never on idle ticks: the page (8 ticks/s) and the server (no idle
     *   ticks) must forget at the same rate, per experience, not per wall-clock */
    const driven = !!(drive && drive.length);
    for (let j = 0; j < N.length; j++) {
      /* dopamine neurons carry the teaching signal (the price move) only, and only while it is felt */
      if (N[j].family === 'DAN') { next[j] = drive[j] || 0; continue; }
      let s = 0; for (const [i, w, m] of inputs[j]) s += w * (m == null ? 1 : m) * act[i];
      next[j] = Math.min(1, FLY.DECAY * act[j] + FLY.GAIN * s * (1 - FLY.DECAY) + (drive[j] || 0));
    }
    const cut = kcIdx.map((j) => next[j]).sort((a, b) => b - a)[Math.floor(kcIdx.length * FLY.KC_SHARE)] || 0;
    let activeKc = 0;
    for (const j of kcIdx) { if (next[j] <= cut || next[j] < 0.01) next[j] = 0; else activeKc++; }
    if (aplIdx >= 0) next[aplIdx] = Math.min(1, activeKc / (kcIdx.length * FLY.KC_SHARE));
    for (const j of mbonIdx) {
      let d = 0; for (const [i, w] of N[j].danIn) d += w * next[i];
      for (const e of inputs[j]) if (e[2] != null) {
        const k = next[e[0]];
        e[2] = Math.max(FLY.FLOOR, Math.min(1, e[2] - FLY.LEARN * d * k * e[2] + (driven ? FLY.RECOVER * (1 - e[2]) : 0)));
      }
    }
    [act, next] = [next, act];
  }

  /* The odor of a window: each kind of transaction on its own third of the PNs (id mod 3, arbitrary), strength by its USD size. */
  const ODOR_OF = { received: 0n, sent: 1n, moved: 2n };
  function odorDrive(mix) {
    const drive = new Float64Array(N.length);
    N.forEach((n, j) => {
      if (n.family !== 'PN') return;
      for (const [kind, usd] of Object.entries(mix)) if (usd > 0 && ODOR_OF[kind] === BigInt(n.id) % 3n)
        drive[j] = Math.max(drive[j], weber(usd, FLY.ODOR_UNIT_USD, FLY.ODOR_SPAN) * (0.6 + 0.4 * ((j * 7919) % 97) / 97));
    });
    return drive;
  }
  /* The outcome: a rise drives the PAM (reward) dopamine neurons, a fall the PPL1 (punishment) ones, strength by Weber-Fechner. */
  function addDopamine(drive, move, typical = 0) {
    const s = typical > 0 ? Math.min(1, Math.abs(move) / (FLY.SURPRISE * typical)) : weber(move, FLY.WEBER_UNIT, FLY.WEBER_SPAN), dan = move > 0 ? 'reward' : 'punishment';
    if (move) N.forEach((n, j) => { if (n.dan === dan) drive[j] = s * 0.5; });
    return s;
  }
  /* The tendency is what the active Kenyon cells still send to each side, against what a naive fly would send (100% = nothing learned). */
  function tendency() {
    const sum = { approach: [0, 0], avoid: [0, 0] };
    for (const j of mbonIdx) { const v = N[j].valence; if (!v) continue;
      for (const [i, w, m] of inputs[j]) if (m != null && act[i] > 0) { sum[v][0] += act[i] * w * m; sum[v][1] += act[i] * w; } }
    if (!sum.approach[1] && !sum.avoid[1]) return { ap: 1, av: 1, t: 0, word: 'quiet' };
    const ap = sum.approach[1] ? sum.approach[0] / sum.approach[1] : 1, av = sum.avoid[1] ? sum.avoid[0] / sum.avoid[1] : 1;
    const t = (ap - av) / Math.max(1e-6, ap + av);
    return { ap, av, t, word: wordOf(t) };
  }
  /* Synapse trace: the KC->MBON multipliers before a learning pulse, and which ones it weakened. */
  function snapshot() { const s = []; for (const j of mbonIdx) for (const e of inputs[j]) if (e[2] != null) s.push(e[2]); return s; }
  function weakened(before) {
    const out = []; let k = 0;
    for (const j of mbonIdx) for (const e of inputs[j]) if (e[2] != null) { const d = e[2] - before[k++]; if (d < -0.002) out.push({ i: e[0], j, d }); }
    return out.sort((a, b) => a.d - b.d);
  }
  /* memory as integers (1e-5), to keep or to send */
  function exportMemory() { const m = []; for (const j of mbonIdx) for (const e of inputs[j]) if (e[2] != null) m.push(Math.round(e[2] * 1e5)); return m; }
  function importMemory(m) { let k = 0; for (const j of mbonIdx) for (const e of inputs[j]) if (e[2] != null) { e[2] = Array.isArray(m) && Number.isFinite(m[k]) ? m[k] / 1e5 : 1; k++; } }

  /* Pulses are queued and never overlap: each drives the circuit for PULSE_STEPS steps, then the circuit rests and fades. The tendency is
   * read at the pulse's last driven step: after it, Kenyon->Kenyon recurrence settles on the same hub cells whatever the stimulus. */
  const queue = []; let pulseSteps = 0, pulseDrive = null, onPeak = null, rest = 0, peak = null, ticks = 0;
  function present(drive, { onStart, onPeak: peakFn } = {}) { queue.push({ drive, onStart, peakFn }); }
  function tick() {
    if (pulseSteps === 0 && rest === 0 && queue.length) {
      const q = queue.shift(); if (q.onStart) q.onStart();
      pulseDrive = q.drive; pulseSteps = FLY.PULSE_STEPS; onPeak = q.peakFn || null;
    }
    const d = pulseSteps > 0 ? pulseDrive : null; if (pulseSteps > 0) pulseSteps--; else if (rest > 0) rest--;
    step(d || []);
    ticks++;
    if (d && pulseSteps === 0) { peak = tendency(); rest = FLY.REST_TICKS; if (onPeak) { const f = onPeak; onPeak = null; f(peak); } }
  }
  /* the server has no screen: it runs the queued pulses to the end at once */
  function drain(max = 10000) { let k = 0; while ((queue.length || pulseSteps || rest) && k++ < max) tick(); }

  /* The synapses of a thought: what each active Kenyon cell sends right now through its learned KC->MBON synapse, strongest first. */
  function thought(limit = 12) {
    const out = [];
    for (const j of mbonIdx) { const v = N[j].valence; if (!v) continue;
      for (const [i, w, m] of inputs[j]) if (m != null && act[i] > 0) out.push({ i, j, side: v, c: act[i] * w * m, m }); }
    return out.sort((a, b) => b.c - a.c).slice(0, limit);
  }
  /* The whole dynamic state, exactly (floats, not the rounded memory): a shadow fly loaded with it computes the same future. */
  function saveState() { const m = []; for (const j of mbonIdx) for (const e of inputs[j]) if (e[2] != null) m.push(e[2]); return { act: Float64Array.from(act), m, rest, pulseSteps, queued: queue.length }; }
  function loadState(s) {
    act.set(s.act); let k = 0; for (const j of mbonIdx) for (const e of inputs[j]) if (e[2] != null) e[2] = s.m[k++];
    queue.length = 0; pulseSteps = 0; pulseDrive = null; onPeak = null; rest = s.rest || 0; peak = null;
  }

  return { N, inputs, kcIdx, mbonIdx, get act() { return act; }, get peak() { return peak; }, get ticks() { return ticks; },
    step, odorDrive, addDopamine, tendency, snapshot, weakened, exportMemory, importMemory, present, tick, drain, thought, saveState, loadState };
}

/* The market protocol around a fly. One window: price + new transactions. Judge and teach with the last window's odor, then ask about
 * this one. Everything that happens is EMITTED as plain events (no text formatting here): the page shows them, the server keeps them. */
/* The PAPER trader's rule, from the tendency and whether it already holds the stock (never a real order, never advice):
 *   out + approach -> buy · in + avoid -> sell · in otherwise -> hold · out otherwise -> stay_out. No short: a spot holder cannot. */
export function decide(word, pos) {
  if (pos === 1) return word === 'avoid' ? 'sell' : 'hold';
  return word === 'approach' ? 'buy' : 'stay_out';
}

/* Laplace's demon, at the scale of this model: the fly is deterministic, so with its exact state and a given input its next decision is
 * COMPUTED, not guessed. A shadow fly (createFly on the same circuit) is loaded with the real fly's state and run ahead, once per
 * scenario of the price move it has not yet seen: learn from the last smell with that move (as the next window would), then smell
 * `nextMix` and decide. Exact for a fly at rest with nothing queued (the server's fly after drain); the page's live fly may be mid-pulse.
 * It forecasts the FLY, never the market: which move comes is unknown, so every scenario is shown, none is picked. */
export function foresee(shadow, fly, { lastMix, lessons = null, nextMix, pos, moves = [0.01, 0, -0.01], typical = 0, threshold = FLY.DECIDE }) {
  const taught = lessons || (lastMix ? [{ mix: lastMix, weight: 1 }] : []);
  const start = fly.saveState();
  if (start.queued || start.pulseSteps) return { exact: false, scenarios: [] };
  return { exact: true, scenarios: moves.map((move) => {
    shadow.loadState(start);
    if (move) for (const l of taught) { const d = shadow.odorDrive(l.mix); shadow.addDopamine(d, move * l.weight, typical); shadow.present(d); shadow.drain(); }
    let r = null; shadow.present(shadow.odorDrive(nextMix), { onPeak: (t) => { r = { ...t, path: shadow.thought(8) }; } }); shadow.drain();
    const word = r.word === 'quiet' ? 'quiet' : wordOf(r.t, threshold);
    return { move, word, ap: r.ap, av: r.av, action: decide(word, pos), path: r.path };
  }) };
}

export function createSession(fly, emit, { threshold = FLY.DECIDE, trace = FLY.TRACE, windowMs = 0 } = {}) {
  /* the decision window (FLY.WINDOW_MS for the page and the server): the trades read between two decisions are summed here */
  const AUTO = windowMs === 'auto', W_MS = AUTO ? FLY.WINDOW_MIN_MS : Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 0;
  let pend = { received: 0, sent: 0, moved: 0 }, pendFrom = null;
  /* 'auto': the usual move between two READS (EMA of |p / p_prev - 1|) and the usual time between them, measured on every read with a price */
  let readMove = 0, readDt = 0, lastRead = null;
  /** the decision window now: fixed, or (auto) the time for this stock's usual move to reach the cost of a side / EDGE_TARGET */
  function windowNow() {
    if (!AUTO) return W_MS;
    const cost = (feePips == null ? 500 : feePips) / 1e6 + FLY.INTERFACE_FEE, target = cost / FLY.EDGE_TARGET;
    if (!(readMove > 0) || !(readDt > 0)) return FLY.WINDOW_MIN_MS;
    return Math.round(Math.min(FLY.WINDOW_MAX_MS, Math.max(FLY.WINDOW_MIN_MS, readDt * (target / readMove) ** 2)));
  }
  let decideAt = threshold, recent = []; /* the smells of the last `trace` windows, most recent first (null: no trade) */
  const H = Math.max(1, Math.min(6, Math.floor(trace)));
  const tally = { consistent: 0, opposite: 0, flat: 0, undecided: 0 };
  /* PAPER book, never real funds, never a signature: the fly is in the stock for a window when it predicted approach, out otherwise;
   * two dumb witnesses next to it; every change of position pays the pool's own fee, read on chain. */
  const books = { fly: { label: 'Fly', pos: 0, ret: 1, switches: 0 }, hold: { label: 'Always in', pos: 0, ret: 1, switches: 0 }, momentum: { label: 'Follow last move', pos: 0, ret: 1, switches: 0 },
    edge: { label: 'Fly, only when its edge pays the fee', pos: 0, ret: 1, switches: 0 } };
  /* the edge book (the rule its real buys follow): the SAME calls as the fly, but in only while edgePaysFee(record, usual move, fee).
   *   edgeFrom: where it started (window count, the other books then), so it is compared with them on the SAME windows */
  let edgeFrom = null;
  let feePips = null, settled = 0, seen = new Set(), prevWin = null, firstWindow = true, lastOdor = null, typical = 0;

  function predict(mix, sim, done) {
    fly.present(fly.odorDrive(mix), { onPeak: (t) => {
      const word = t.word === 'quiet' ? 'quiet' : wordOf(t.t, decideAt);
      emit({ type: 'predict', sim, mix, ap: t.ap, av: t.av, word });
      const action = decide(word, books.fly.pos);
      emit({ type: 'decision', sim, mix, ap: t.ap, av: t.av, t: t.t, threshold: decideAt, word, action, inBefore: books.fly.pos === 1, path: fly.thought(8) });
      if (done) done(word, action);
    } });
  }
  function learn(mix, move, sim) {
    const drive = fly.odorDrive(mix), s = fly.addDopamine(drive, move, typical);
    let before = null;
    fly.present(drive, { onStart: () => { before = fly.snapshot(); }, onPeak: () => {
      const list = fly.weakened(before);
      emit({ type: 'taught', sim, mix, move, strength: s, weakened: list.length,
        sides: list.reduce((o, x) => { const v = fly.N[x.j].valence || 'none'; o[v] = (o[v] || 0) + 1; return o; }, {}),
        top: list.slice(0, 40).map(({ i, j, d }) => ({ i, j, d })) });
    } });
  }
  function judge(prediction, move) {
    if (prediction !== 'approach' && prediction !== 'avoid') { tally.undecided++; return; }
    const kind = Math.abs(move) < FLY.FLAT ? 'flat' : (move > 0) === (prediction === 'approach') ? 'consistent' : 'opposite';
    tally[kind]++;
    emit({ type: 'verdict', prediction, move, kind });
  }
  function settle(win, move) {
    if (feePips == null) return;
    /* the fly's paper position follows its DECISION; a window without a smell (no trade) keeps the position: no smell, no move */
    const flyWants = win.decision ? (win.decision === 'buy' || win.decision === 'hold' ? 1 : 0) : books.fly.pos;
    /* edge: the record and the usual move known when the call was made (this window is judged, and its move learnt, AFTER settling) */
    const edgeIn = flyWants && edgePaysFee(tally, typical, feePips) ? 1 : 0;
    const want = { fly: flyWants, hold: 1, momentum: win.lastMove > 0 ? 1 : 0, edge: edgeIn };
    if (!edgeFrom) edgeFrom = { settled, fly: books.fly.ret, hold: books.hold.ret, at: Date.now() };
    for (const [k, b] of Object.entries(books)) {
      /* a change of position pays the fee on the share that changes hands (all of it for the all-in books) */
      /* the edge book pays the REAL cost of a side (pool + interface fee); the older books keep their pool-fee-only definition, so this
       *   comparison is biased AGAINST the edge rule, never for it */
      if (want[k] !== b.pos) { b.ret *= 1 - Math.abs(want[k] - b.pos) * (feePips / 1e6 + (k === 'edge' ? FLY.INTERFACE_FEE : 0)); b.switches++; b.pos = want[k]; }
      b.ret *= 1 + b.pos * move;
    }
    settled++;
  }

  /* price: { priceUsd, tokenDecimals, feePips, block } or null; transactions: the /api/activite rows or null */
  function window({ symbol, price, transactions, at = Date.now() }) {
    let p = null, decimals = null;
    if (price && typeof price.priceUsd === 'number') { p = price.priceUsd; decimals = price.tokenDecimals; if (Number.isInteger(price.feePips)) feePips = price.feePips; }
    const mix = { received: 0, sent: 0, moved: 0 };
    let fresh = [];
    if (Array.isArray(transactions)) {
      fresh = transactions.filter((t) => t && t.tx && !seen.has(t.tx)).sort((a, b) => a.bloc - b.bloc);
      fresh.forEach((t) => seen.add(t.tx));
      if (seen.size > 5000) seen = new Set([...seen].slice(-2000));
      if (firstWindow) { emit({ type: 'skipped', n: fresh.length }); fresh = []; }
      /* only a window whose trades WERE read ends the first window: a failed first read left the flag down, and the next window
       *   smelled the whole backlog of past trades as fresh (QA 2026-11-08: 50 old transactions -> 50 "tx" events and a decision) */
      firstWindow = false;
    }
    if (p != null && decimals != null) {
      fresh.forEach((t) => {
        const units = (Array.isArray(t.mouvements) ? t.mouvements : []).reduce((s, m) => s + Number(BigInt(m.montant || 0)), 0) / 10 ** decimals;
        const kind = classify(t), usd = units * p; mix[kind] += usd;
        emit({ type: 'tx', symbol, kind, units, usd, tx: t.tx, bloc: t.bloc });
      });
    }
    /* a decision window: the reads inside it only add their trades; it closes (judge, learn, decide) at its first read with a price once
     *   W_MS have passed. The very first read with a price closes at once: it is the reference the first move is measured from. */
    if (W_MS) {
      /* 'auto': every read with a price measures the stock's usual move between reads (zeros included: a quiet read is a fact) */
      if (AUTO && p != null) {
        if (lastRead && at > lastRead.at) { const m = Math.abs(p / lastRead.p - 1), dt = at - lastRead.at;
          readMove = readMove > 0 ? readMove * 0.9 + m * 0.1 : m; readDt = readDt > 0 ? readDt * 0.9 + dt * 0.1 : dt; }
        lastRead = { p, at };
      }
      for (const k of ['received', 'sent', 'moved']) pend[k] += mix[k];
      if (pendFrom === null) pendFrom = at;
      const wNow = windowNow();
      if (prevWin && (at - pendFrom < wNow || p == null)) { emit({ type: 'gathering', sim: false, mix: { ...pend }, closesIn: Math.max(0, wNow - (at - pendFrom)), windowMs: wNow }); return { price: p, hasOdor: false, gathering: true }; }
      for (const k of ['received', 'sent', 'moved']) mix[k] = pend[k];
      pend = { received: 0, sent: 0, moved: 0 }; pendFrom = at;
    }
    let lastMove = 0;
    if (prevWin && p != null && prevWin.price != null) {
      const move = lastMove = p / prevWin.price - 1;
      settle(prevWin, move);
      if (prevWin.hasOdor) judge(prevWin.prediction, move);
      /* each recent smell is taught by this move, weighted by how long ago it was smelled (the trace) */
      if (move !== 0) recent.forEach((m, k) => { if (m) learn(m, move * FLY.TRACE_DECAY ** k, false); });
      /* the usual move is updated AFTER this lesson: the surprise is measured against what was expected before it */
      if (move !== 0) typical = typical > 0 ? typical * (1 - FLY.TYPICAL_ALPHA) + Math.abs(move) * FLY.TYPICAL_ALPHA : Math.abs(move);
    }
    const hasOdor = mix.received + mix.sent + mix.moved > 0;
    if (hasOdor) lastOdor = { ...mix };
    const win = { price: p, mix, hasOdor, prediction: null, decision: null, lastMove };
    if (p != null) { recent.unshift(hasOdor ? { ...mix } : null); recent.length = Math.min(recent.length, H); }
    if (hasOdor) predict(mix, false, (word, action) => { win.prediction = word; win.decision = action; });
    prevWin = win;
    return { price: p, hasOdor };
  }
  function state() {
    return { tally: { ...tally }, books: Object.fromEntries(Object.entries(books).map(([k, b]) => [k, { label: b.label, pos: b.pos, ret: b.ret, switches: b.switches }])), recent: recent.map((m) => (m ? { ...m } : null)), settled, feePips, lastOdor: lastOdor ? { ...lastOdor } : null, typical,
      windowMs: windowNow(), readMove,
      edgeNow: { edge: edgeOf(tally, typical), fee: feePips == null ? null : feePips / 1e6 + FLY.INTERFACE_FEE, pays: edgePaysFee(tally, typical, feePips) },
      edgeFrom: edgeFrom ? { ...edgeFrom } : null, sameWindows: edgeFrom ? { windows: settled - edgeFrom.settled, edge: books.edge.ret, fly: books.fly.ret / edgeFrom.fly, hold: books.hold.ret / edgeFrom.hold } : null };
  }
  /* the eligibility trace survives a restart too (QA 08/11: a deploy or a reload dropped the smells still waiting for their lessons);
   *   only well-formed smells are taken back, at most the trace length */
  function restoredTrace(x) {
    const good = (m) => m && typeof m === 'object' && ['received', 'sent', 'moved'].every((k) => Number.isFinite(m[k]) && m[k] >= 0);
    return x && Array.isArray(x.recent) ? x.recent.slice(0, H).map((m) => (good(m) ? { received: m.received, sent: m.sent, moved: m.moved } : null)) : [];
  }
  function restore(x) {
    Object.assign(tally, { consistent: 0, opposite: 0, flat: 0, undecided: 0 }, x && x.tally ? x.tally : {});
    /* the positions are kept too: put back out at each restart, "Always in" paid one fake switch fee per deploy or reload (QA 08/11) */
    /* a position is a share in [0, 1] (every book holds 0 or 1 today; a malformed value is out) */
    const posOf = (v) => (Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0);
    for (const [k, b] of Object.entries(books)) Object.assign(b, { pos: x && x.books && x.books[k] ? posOf(x.books[k].pos) : 0, ret: x && x.books && x.books[k] ? x.books[k].ret : 1, switches: x && x.books && x.books[k] ? x.books[k].switches : 0 });
    settled = x && Number.isFinite(x.settled) ? x.settled : 0;
    /* the edge book is NEW on 2026-11-09: a state saved before it has no `edge` book and no start; it starts at the next window */
    const ef = x && x.edgeFrom;
    edgeFrom = ef && Number.isFinite(ef.settled) && Number.isFinite(ef.fly) && ef.fly > 0 && Number.isFinite(ef.hold) && ef.hold > 0 && x.books && x.books.edge ? { settled: ef.settled, fly: ef.fly, hold: ef.hold, at: Number(ef.at) || null } : null;
    if (!edgeFrom) Object.assign(books.edge, { pos: 0, ret: 1, switches: 0 });
    recent = restoredTrace(x);
    typical = x && Number.isFinite(x.typical) && x.typical > 0 && x.typical < 1 ? x.typical : 0;
    /* the last real smell survives a restart: the forecast can run before the next trade arrives */
    const lo = x && x.lastOdor;
    lastOdor = lo && ['received', 'sent', 'moved'].every((k) => Number.isFinite(lo[k]) && lo[k] >= 0) && lo.received + lo.sent + lo.moved > 0 ? { received: lo.received, sent: lo.sent, moved: lo.moved } : null;
  }
  function reset() { seen = new Set(); prevWin = null; firstWindow = true; feePips = null; lastOdor = null; typical = 0; recent = []; pend = { received: 0, sent: 0, moved: 0 }; pendFrom = null; readMove = 0; readDt = 0; lastRead = null; }
  /* the odor of the last window that had real trades: a simulation is injected on what is really happening, not on a made-up smell */
  /* The next window, as the session will run it: what it will learn from (this window's smell, if any), the smell it assumes comes
   * next (the last REAL trades, repeated: an assumption, said as such), and the position the paper book will hold by then. */
  function next() {
    if (!lastOdor) return null;
    const pos = prevWin && prevWin.decision ? (prevWin.decision === 'buy' || prevWin.decision === 'hold' ? 1 : 0) : books.fly.pos;
    /* scenarios: a usual rise, no move, a usual fall (of THIS stock), or +-1% before any move was seen */
    const u = typical > 0 ? typical : 0.01;
    const lessons = recent.map((m, k) => (m ? { mix: { ...m }, weight: FLY.TRACE_DECAY ** k } : null)).filter(Boolean);
    return { lastMix: recent[0] ? { ...recent[0] } : null, lessons, nextMix: { ...lastOdor }, pos, typical, moves: [u, 0, -u] };
  }
  return { window, predict, learn, state, restore, reset, next, get feePips() { return feePips; }, get settled() { return settled; }, get typical() { return typical; },
    get threshold() { return decideAt; }, set threshold(v) { if (Number.isFinite(v) && v >= 0.001 && v <= 0.2) decideAt = v; },
    get lastOdor() { return lastOdor ? { ...lastOdor } : null; } };
}
/** The fly's next decision, forecast from the session (page and server share this). Scenarios: the next price move is +1%, 0, -1%. */
export function foreseeNext(shadow, fly, session) {
  const nx = session.next();
  if (!nx) return { exact: false, scenarios: [], why: 'no real trade smelled yet' };
  return { ...foresee(shadow, fly, { ...nx, threshold: session.threshold }), nextMix: nx.nextMix, learnsFrom: nx.lastMix, pos: nx.pos, typical: nx.typical };
}
