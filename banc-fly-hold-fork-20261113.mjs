// banc-fly-hold-fork-20261113.mjs — game392 (Phil 2026-11-13, option A): the fly's NEW money rule, end to end, on a LOCAL FORK of Base.
// CLAUDE.md: the fly's live-money path needs a fork test before mainnet. What changed in game392 is WHEN it trades (the hold signal) and
//   at WHAT size (5 USDC by default); the signer, the guard and the relay are the same. This bench proves on base-anvil:
//   1. /api/fly/hold/<stock> answers on the fork from the pool's own Swap logs (28 closes, a target);
//   2. the page's rule (fly-hold.js holdAction) on the fly's REAL holdings: out + target in -> BUY 5 USDC; then holding + target out -> SELL all;
//   3. every plan is asked with mouche=1 and states an interface fee of 0 bps (the page refuses anything else), the browser guard
//      (fly-guard.js checkPlanCalls) accepts it, each call is signed by fly-wallet.js and sent RAW through /api/fly/relay, receipt 0x1,
//      and the balances that should move did move; the round trip cost at 5 USDC is measured;
//   4. WITHDRAW sends everything back to the user.
// Usage: base-anvil --fork-url https://base-rpc.publicnode.com --port 9549 ; FORK_RPC=http://127.0.0.1:9549 node banc-fly-hold-fork-20261113.mjs
// NOT in the test series (needs anvil). Refuses to run unless the RPC is an anvil fork. Nothing touches mainnet; no real value moves.
// NE PROUVE PAS: the page's own timer and DOM (browser); that the rule earns anything (see fly-hold.js header: it does not, reliably).
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import './noble-node-resolve.mjs';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { USDC_BASE } from './frais-creation.js';
import { selecteur } from './keccak.js';
import { holdAction, HOLD } from './fly-hold.js';
import { checkPlanCalls } from './fly-guard.js';

const ICI = dirname(fileURLToPath(import.meta.url));
const { newKeyHex, addressOf, signTx, decodeTx } = await import('./fly-wallet.js');
const FORK = process.env.FORK_RPC || 'http://127.0.0.1:9549', PORT = 9088, BASE = 'http://127.0.0.1:' + PORT;
const SIZE = 5n * 10n ** 6n; /* the new default: 5 USDC a trade */
let id = 0, n = 0, ko = 0;
const ok = (c, m) => { n++; if (c) console.log('ok  ' + m); else { ko++; console.log('KO  ' + m); } };
const rpc = async (method, params = []) => { const r = await fetch(FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((x) => x.json());
  if (r.error) throw new Error(method + ': ' + JSON.stringify(r.error)); return r.result; };
async function surFork() { try { const r = await rpc('anvil_nodeInfo'); return !!(r && r.currentBlockNumber); } catch (_) { return false; } }
const word = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
const bal = async (token, who) => BigInt(await rpc('eth_call', [{ to: token, data: selecteur('balanceOf(address)') + word(who) }, 'latest']));
const relay = async (raw) => { const r = await fetch(BASE + '/api/fly/relay', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ raw }) }); const j = await r.json(); if (!j.ok) throw new Error('relay ' + r.status + ': ' + j.why); return j.hash; };
/* a hash not yet mined locally is forwarded by anvil to the upstream node, which may answer 403 (measured 2026-11-13): retried */
const receipt = async (h) => { for (let k = 0; k < 60; k++) { let r = null; try { r = await rpc('eth_getTransactionReceipt', [h]); } catch (_) { /* upstream refused: retry */ } if (r) return r; await new Promise((o) => setTimeout(o, 500)); } throw new Error('no receipt ' + h); };

if (!(await surFork())) { console.log('REFUSED: ' + FORK + ' is not an anvil fork (anvil_nodeInfo). Nothing sent.'); process.exit(2); }
const USDC = USDC_BASE.toLowerCase();
const srv = spawn(process.execPath, [join(ICI, 'serveur-web.js')], { cwd: ICI, env: { ...process.env, PORT: String(PORT), TB_RPC_TEST: FORK, TB_SONDES: '0', FLY_SERVER: 'off', NODE_ENV: 'test' }, stdio: 'ignore' });
const stop = () => { try { srv.kill(); } catch (_) {} };
try {
  let pret = false; for (let k = 0; k < 120 && !pret; k++) { try { pret = (await fetch(BASE + '/sante')).ok; } catch (_) { await new Promise((o) => setTimeout(o, 500)); } }
  ok(pret, 'server up in test mode on the fork');
  const key = newKeyHex(), fly = addressOf(key), user = '0x' + '5'.repeat(40);
  const funder = POOLS_ACTIONS_AERODROME.get([...POOLS_ACTIONS_AERODROME.entries()].find(([, t]) => t.symbole === 'SNDKc')[0]).pool;
  await rpc('anvil_setBalance', [fly, '0x' + (3n * 10n ** 15n).toString(16)]);
  await rpc('anvil_impersonateAccount', [funder]); await rpc('anvil_setBalance', [funder, '0x' + (10n ** 18n).toString(16)]);
  const fund = await rpc('eth_sendTransaction', [{ from: funder, to: USDC, data: selecteur('transfer(address,uint256)') + word(fly) + (20n * 10n ** 6n).toString(16).padStart(64, '0') }]);
  ok((await receipt(fund)).status === '0x1' && (await bal(USDC, fly)) === 20n * 10n ** 6n, 'opt-in on the fork: the fly holds 20 USDC');

  /* one plan, as the page runs it: mouche=1, interface fee must be 0, the guard accepts, each call signed and relayed raw */
  async function trade(de, vers, montant, label) {
    for (let round = 0, busy = 0; round < 3; ) {
      const q = new URLSearchParams({ de, vers, montant: String(montant), compte: fly, mouche: '1' });
      const p = await fetch(BASE + '/api/rails/plan?' + q).then((x) => x.json());
      if (p.etat === 'NON_MESURE' && busy < 3) { busy++; await new Promise((o) => setTimeout(o, 65000)); continue; }
      if (!p.ok) return label + ': plan ' + p.etat + ' (' + String(p.pourquoi || '').slice(0, 140) + ')';
      /* the page's own test, strictly: the NUMBER 0, on every round (security review 2026-11-13) */
      const fee = p.resume && p.resume.fraisBps;
      ok((typeof fee === 'string' || typeof fee === 'number') && String(fee) === '0', label + ' (round ' + round + '): the plan states an interface fee of exactly 0 (got ' + JSON.stringify(fee) + ', ' + typeof fee + '); the page signs nothing else');
      if (!((typeof fee === 'string' || typeof fee === 'number') && String(fee) === '0')) return label + ': interface fee stated';
      if (round === 0 && de !== USDC) ok(/^\d+$/.test(String(p.resume.recoitAuMoins || '')), label + ': the sell plan states what it receives at least (' + p.resume.recoitAuMoins + '), counted in the 24 h volume');
      const refused = checkPlanCalls({ calls: p.aSigner, fly, pay: de, receive: vers, amount: String(montant), nowSec: Number(BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp)) });
      ok(refused === null && String(p.resume.paye) === String(montant), label + ': the browser guard accepts the plan (' + p.aSigner.map((c) => c.nom || c.role || 'call').join(' + ').slice(0, 90) + ')' + (refused ? ' — ' + refused.why : ''));
      if (refused) return label + ': refused by the guard';
      for (const c of p.aSigner) {
        if (!(await surFork())) throw new Error('not a fork any more: stop');
        const nonce = await rpc('eth_getTransactionCount', [fly, 'pending']), blk = await rpc('eth_getBlockByNumber', ['latest', false]);
        const gas = BigInt(await rpc('eth_estimateGas', [{ from: fly, to: c.to, data: c.data, value: c.value }])) * 13n / 10n;
        const sg = signTx({ chainId: 8453, nonce: BigInt(nonce), maxPriorityFeePerGas: 1000000n, maxFeePerGas: BigInt(blk.baseFeePerGas) * 2n + 1000000n, gas, to: c.to, value: BigInt(c.value || '0x0'), data: c.data }, key);
        if (decodeTx(sg.raw).from !== fly) return label + ': signed by another key';
        const r = await receipt(await relay(sg.raw));
        ok(r.status === '0x1', label + ': receipt 0x1 (' + (c.nom || c.role || 'call') + ', gas ' + Number(BigInt(r.gasUsed)) + ')');
        if (r.status !== '0x1') return label + ': reverted';
      }
      if (p.etat !== 'APPROBATIONS') return null;
      round++;
    }
    return label + ': planner still busy after 3 tries';
  }

  for (const sym of String(process.env.FLY_STOCKS || 'SNDKc,NVDAc').split(',').filter(Boolean)) {
    const e = [...POOLS_ACTIONS_AERODROME.entries()].find(([, t]) => t.symbole === sym);
    if (!e) { ok(false, sym + ': not in the pool registry'); continue; }
    const tok = e[0];
    /* 1. the signal, from the fork's own view of the pool's Swap logs */
    const t0 = Date.now(), sig = await fetch(BASE + '/api/fly/hold/' + tok).then((x) => x.json());
    ok(sig.ok && Array.isArray(sig.closes) && sig.closes.length === HOLD.CLOSES && sig.closes.filter((c) => c.price > 0).length >= HOLD.MIN_MOVES + 1 && (sig.target === 'in' || sig.target === 'out'),
      sym + ': /api/fly/hold/ answers on the fork in ' + (Date.now() - t0) + ' ms: ' + (sig.closes || []).filter((c) => c.price > 0).length + '/28 closes, target ' + sig.target + ', last move ' + (sig.move * 100).toFixed(2) + '%, usual ' + (sig.typical * 100).toFixed(2) + '%' + (sig.ok ? '' : ' — ' + sig.why));
    /* 2. the page's rule on the REAL holdings: a fresh fly holds none -> 'in' buys, 'out' does nothing */
    const held0 = await bal(tok, fly);
    ok(held0 === 0n && holdAction('in', held0) === 'buy' && holdAction('out', held0) === null && holdAction(sig.target, held0) === (sig.target === 'in' ? 'buy' : null), sym + ': out of the stock -> the rule buys on IN, does nothing on OUT');
    const uA = await bal(USDC, fly);
    const why = await trade(USDC, tok, SIZE, 'BUY ' + sym + ' with 5 USDC');
    const s1 = await bal(tok, fly), uB = await bal(USDC, fly);
    ok(!why && s1 > 0n && uA - uB === SIZE, 'BUY ' + sym + ': 5 USDC spent, +' + s1 + ' units' + (why ? ' — ' + why : ''));
    if (why || s1 === 0n) continue;
    /* holding: 'in' does nothing more (no second buy), 'out' sells ALL of it */
    ok(holdAction('in', s1) === null && holdAction('out', s1) === 'sell', sym + ': holding -> the rule does not buy again on IN, sells on OUT');
    const why2 = await trade(tok, USDC, s1, 'SELL all the ' + sym);
    const s2 = await bal(tok, fly), uC = await bal(USDC, fly);
    const back = uC - uB, cost = SIZE - back;
    ok(!why2 && s2 === 0n && back > 0n, 'SELL ' + sym + ': all ' + s1 + ' units sold, ' + back + ' USDC units back: round trip ' + (Number(cost) / 5e4).toFixed(3) + '% at 5 USDC (pool fees and price impact; gas paid in ETH)' + (why2 ? ' — ' + why2 : ''));
  }
  /* 4. WITHDRAW */
  const u3 = await bal(USDC, fly), before = await bal(USDC, user), nonce = await rpc('eth_getTransactionCount', [fly, 'pending']), blk = await rpc('eth_getBlockByNumber', ['latest', false]);
  const w = signTx({ chainId: 8453, nonce: BigInt(nonce), maxPriorityFeePerGas: 1000000n, maxFeePerGas: BigInt(blk.baseFeePerGas) * 2n + 1000000n, gas: 100000n, to: USDC, value: 0n,
    data: selecteur('transfer(address,uint256)') + word(user) + u3.toString(16).padStart(64, '0') }, key);
  const rw = await receipt(await relay(w.raw));
  ok(rw.status === '0x1' && (await bal(USDC, fly)) === 0n && (await bal(USDC, user)) - before === u3, 'WITHDRAW: all ' + u3 + ' USDC units back to the user, the fly holds 0');
} catch (e) { ok(false, 'error: ' + String((e && e.message) || e).slice(0, 200)); }
finally { stop(); }
console.log(n + ' assertions, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0;
