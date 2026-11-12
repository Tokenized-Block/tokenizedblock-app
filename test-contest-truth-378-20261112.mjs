/* test-contest-truth-378-20261112.mjs — task 3 of lot 378 (Phil 2026-11-12: "contest.html shows wrong data").
 *   RUNS the real page script of contest.html (cut from the file, executed in node with a fake DOM, the real block-contest.js /
 *   economie-pack.js / economie.js / lock.js) against a FROZEN chain: every eth_call answer the page asked for, recorded on Base at one
 *   pinned block by `--record` (test-contest-truth-378-recu.json). A call the page makes that is NOT in the recording fails the test:
 *   so each number on screen is pinned to its source (contract address + getter), and a page that reads the first vault, another
 *   contest or another wallet's lock cannot pass.
 *   AFFIRME (live recording, 2026-11-12):
 *   - no wallet: round 0 open for entries, pot 0 TBLOCK, cap 862,000 TBLOCK, vault V 847,983.48 TBLOCK, claim needs 2,789,880.2 TBLOCK
 *     locked + 7 days, reserved 0, week 0, contest liabilities 0 — each equal to its eth_call (decoded here, not by the page);
 *   - wallet A (Grok's test wallet = the record's deployer): 246,365.06 TBLOCK, room 862,000, lock 3,000,000 · ×1.17; UNIT is accepted;
 *     the two blocks the server answered `no Initialize found in the last 39960 blocks` are NOT told "try again in a minute"
 *     (the server READ that window; retrying cannot find an older pool) — before the fix they were;
 *   - SWITCHING the wallet in the extension (accountsChanged) repaints for the new wallet — before the fix the page kept wallet A's
 *     balance and lock under wallet B, forever (no listener);
 *   - a read still running for wallet A paints nothing once wallet B is connected (race, A's answers held back on purpose);
 *   - a CLOSED week (scenario: the live values with currentEpoch -> 1 and epochs(0) closed) says "claimed" for a wallet that claimed,
 *     "lock needed" (with the amounts) for a player whose lock is short, "nothing for this wallet" only for a wallet that did not play
 *     — before the fix all three said "nothing for this wallet" (V.owed() is 0 in all three).
 *   - mutants (applied to a COPY of contest.html, the pristine copy passes first): each must die on an AssertionError.
 *   NE PROUVE PAS: the browser rendering (checked separately in the built-in browser at 1077 and 375 px), a real claim (week 0 is still
 *     open on chain: the closed-week values are a labelled scenario), what a wallet does with a batch.
 *   Usage: node test-contest-truth-378-20261112.mjs [--html path/to/contest.html] [--no-mutants]
 *          node test-contest-truth-378-20261112.mjs --record      (reads Base + the live server with x-ms-monitor: 1; eth_call only) */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const ICI = dirname(fileURLToPath(import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const HTML = resolve(arg('--html') || join(ICI, 'contest.html'));
const RECORD = process.argv.includes('--record');
const RECU = join(ICI, 'test-contest-truth-378-recu.json');
const mod = (f) => import(pathToFileURL(join(ICI, f)).href);
const C = await mod('block-contest.js'), EP = await mod('economie-pack.js'), ECO = await mod('economie.js'), LK = await mod('lock.js');
const { PACK_ECONOMIE_V2: PK } = await mod('economie-v2-pack-deploiement.js');
const { CONTEST_DEPLOIEMENT: CD } = await mod('block-contest-deploiement.js');
/* the two wallets come from the records, never typed: A = the pack's deployer (Grok's test wallet), B = the dev wallet */
const A = String(PK.deployeur).toLowerCase(), B = String(PK.parametres.dev).toLowerCase();
assert.notEqual(A, B);
const SITE = 'https://tokenizedblock.space';
const NODES = ['https://mainnet.base.org', 'https://base-rpc.publicnode.com'];
const cle = (to, data) => String(to).toLowerCase() + '|' + String(data).toLowerCase();

/* ---------------------------------------------------------------- the frozen chain (or the live one, when recording) */
/* the pack addresses are never retyped outside their record (test-noter-pack-economie-v2): the recording names them {pack.X},
 *   restored from economie-v2-pack-deploye.js; sha256Reel is the sha256 of the recorded body WITH the real addresses, so a record
 *   whose letter now names another address cannot replay these answers under it */
const { ADRESSES_PACK_ECONOMIE_V2: AP } = await mod('economie-v2-pack-deploye.js');
const versPlace = (txt) => Object.entries(AP).reduce((s, [l, a]) => s.split(String(a).slice(2).toLowerCase()).join('{pack.' + l + '}'), txt);
const depuisPlace = (txt) => Object.entries(AP).reduce((s, [l, a]) => s.split('{pack.' + l + '}').join(String(a).slice(2).toLowerCase()), txt);
const empreinte = (o) => createHash('sha256').update(JSON.stringify(o)).digest('hex');
const lireRecu = (txt) => { const { note, sha256Reel, ...corps } = JSON.parse(depuisPlace(txt)); assert.equal(empreinte(corps), sha256Reel, 'the recording restored with the pack record is the one recorded (sha256Reel)'); return { note, ...corps }; };
let REC = RECORD ? { bloc: null, horodatage: null, eth: {}, api: {} } : lireRecu(readFileSync(RECU, 'utf8'));
const fetchVrai = globalThis.fetch; /* the page's fetch is replaced below; the recorder keeps the real one */
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function rpcVrai(method, params) {
  for (let k = 0; k < 12; k++) {
    const url = NODES[k % 2];
    try {
      const j = await fetchVrai(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }).then((x) => x.json());
      if (j && j.result !== undefined && j.result !== null) return j.result;
      if (j && j.error && /revert/i.test(j.error.message || '')) return { revert: j.error.message };
    } catch (_) { /* next node */ }
    await pause(400 * (k + 1));
  }
  throw new Error('no node answered ' + method);
}

/** one page run: a fake DOM, a fake wallet, fetch answered from REC (+ scenario overrides). Returns the controls. */
async function lancer({ over = {}, holdFor = null } = {}) {
  const els = new Map();
  for (const id of ['status', 'fund', 'vault', 'round', 'me', 'rules', 'past', 'foot']) els.set(id, { id, innerHTML: '', hidden: true, textContent: '', value: '' });
  let clic = null;
  const listeners = {};
  let compte = null;
  const manques = [], tenus = [];
  let enVol = 0;
  globalThis.document = {
    getElementById: (id) => els.get(id) || null, querySelector: () => null, hidden: false,
    addEventListener: (t, f) => { if (t === 'click') clic = f; },
  };
  globalThis.window = { ethereum: {
    request: async ({ method }) => {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return compte ? [compte] : [];
      if (method === 'eth_chainId') return '0x2105';
      throw new Error('read-only test wallet: ' + method); /* never signs, never sends */
    },
    on: (ev, f) => { (listeners[ev] = listeners[ev] || []).push(f); },
  } };
  globalThis.setInterval = () => 0; /* the page's timers do not run here: every read is driven by the test */
  const repondre = async (url, init) => {
    if (NODES.includes(url) || /^https:\/\/(mainnet\.base\.org|base-rpc\.publicnode\.com)/.test(url)) {
      const { method, params, id } = JSON.parse(init.body);
      if (method === 'eth_getBlockByNumber') {
        if (RECORD && !REC.bloc) { const h = await rpcVrai('eth_getBlockByNumber', ['latest', false]); REC.bloc = h.number; REC.horodatage = h.timestamp; }
        return { jsonrpc: '2.0', id, result: { number: REC.bloc, timestamp: REC.horodatage } };
      }
      if (method !== 'eth_call') throw new Error('the page asked ' + method);
      const k = cle(params[0].to, params[0].data);
      if (holdFor && k.includes(holdFor.slice(2))) { enVol--; await new Promise((r) => tenus.push(r)); enVol++; } /* A's reads held back (race) */
      if (k in over) return { jsonrpc: '2.0', id, result: over[k] };
      if (RECORD && !(k in REC.eth)) {
        if (!REC.bloc) { const h = await rpcVrai('eth_getBlockByNumber', ['latest', false]); REC.bloc = h.number; REC.horodatage = h.timestamp; }
        REC.eth[k] = await rpcVrai('eth_call', [{ to: params[0].to, data: params[0].data }, REC.bloc]);
      }
      if (!(k in REC.eth)) { manques.push(k); return { jsonrpc: '2.0', id, error: { code: -32000, message: 'not in the recording: ' + k } }; }
      const v = REC.eth[k];
      return v && v.revert ? { jsonrpc: '2.0', id, error: { code: 3, message: v.revert } } : { jsonrpc: '2.0', id, result: v };
    }
    const chemin = String(url);
    if (!chemin.startsWith('/api/')) throw new Error('the page fetched ' + chemin);
    if (RECORD && !(chemin in REC.api)) REC.api[chemin] = await fetchVrai(SITE + chemin, { headers: { 'x-ms-monitor': '1' } }).then((x) => x.json());
    if (!(chemin in REC.api)) { manques.push(chemin); throw new Error('not in the recording: ' + chemin); }
    return REC.api[chemin];
  };
  globalThis.fetch = async (url, init = {}) => {
    enVol++;
    try { const corps = await repondre(url, init); return { json: async () => corps }; } finally { enVol--; }
  };
  /* the page script, cut from the html, imports pointed at this tree */
  const html = readFileSync(HTML, 'utf8');
  const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(m, 'the page script is found in ' + HTML);
  const src = m[1].replace(/from '\.\/([\w.-]+\.js)'/g, (_, f) => "from '" + pathToFileURL(join(ICI, f)).href + "'");
  const tmp = mkdtempSync(join(tmpdir(), 'contest378-'));
  const f = join(tmp, 'page.mjs');
  writeFileSync(f, src);
  await import(pathToFileURL(f).href);
  const calme = async () => { for (let n = 0, k = 0; n < 4; k++) { if (k > (RECORD ? 120000 : 6000)) throw new Error('the page never went quiet'); await pause(5); n = enVol === 0 ? n + 1 : 0; } };
  await calme();
  const bouton = (dataset) => ({ target: { closest: () => ({ dataset }) } });
  return {
    els, manques, tenus, calme, txt: (id) => els.get(id).innerHTML.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' '),
    connecter: async (w) => { compte = w; await clic(bouton({ connect: '1' })); await calme(); },
    changer: async (w) => { compte = w; for (const f of listeners.accountsChanged || []) f(w ? [w] : []); await calme(); },
    ecoute: () => (listeners.accountsChanged || []).length,
    fin: () => rmSync(tmp, { recursive: true, force: true }),
  };
}

/* ---------------------------------------------------------------- recording (eth_call only, at one block, both nodes asked in turn) */
if (RECORD) {
  const p = await lancer();
  await p.connecter(A);
  await p.changer(B);
  /* the closed-week reads exist only when currentEpoch >= 1: ask them through a run whose currentEpoch is overridden to 1 */
  const un = '0x' + (1n).toString(16).padStart(64, '0');
  const q = await lancer({ over: { [cle(EP.VIEW.currentEpoch().to, EP.VIEW.currentEpoch().data)]: un } });
  await q.connecter(A);
  await q.changer(B);
  p.fin(); q.fin();
  const corpsR = { bloc: REC.bloc, horodatage: REC.horodatage, eth: REC.eth, api: REC.api };
  writeFileSync(RECU, versPlace(JSON.stringify({ note: 'eth_call answers recorded on Base at one block by --record; /api answers read on ' + SITE + ' with x-ms-monitor: 1; the pack addresses are written {pack.X}', sha256Reel: empreinte(corpsR), ...corpsR }, null, 1) + '\n'));
  console.log('recorded', Object.keys(REC.eth).length, 'eth_call +', Object.keys(REC.api).length, 'api answers at block', parseInt(REC.bloc, 16));
  process.exit(0);
}

/* ---------------------------------------------------------------- the checks */
let ok = 0;
const t = (cond, quoi, vu) => { assert.ok(cond, quoi + (vu !== undefined ? ' — seen: ' + String(vu).slice(0, 300) : '')); ok++; };
const lu = (v) => { const r = REC.eth[cle(v.to, v.data)]; assert.ok(typeof r === 'string', 'recorded: ' + v.to + ' ' + v.data.slice(0, 10)); return BigInt(r.slice(0, 66)); };
const T18 = (raw) => C.formatUnits18(raw) + ' TBLOCK';

/* the sources, from the records only */
t(C.CONTEST === String(CD.adresse).toLowerCase(), 'contest address = its deployment record');
const V_ = (await mod('economie-v2-pack-deploye.js')).ADRESSES_PACK_ECONOMIE_V2;
t(EP.VAULT === V_.V && EP.HEARTS === V_.L, 'vault V and hearts L = the deployed pack record');
t(ECO.VAULT !== EP.VAULT, 'the first vault is another contract');

/* 1. no wallet — every number equal to its own eth_call */
{
  const p = await lancer();
  t(p.manques.length === 0, 'every read the page made is in the recording (source pinned)', p.manques.join(' '));
  const st = p.txt('status'), va = p.txt('vault'), ro = p.txt('round'), fo = p.txt('foot');
  const pot = C.decodeRoundInfo(REC.eth[cle(C.VIEW.roundInfo(0n).to, C.VIEW.roundInfo(0n).data)]).pot;
  const maxPot = lu(C.VIEW.param('MAX_POT')), bal = lu(EP.VIEW.vaultBalance()), need = lu(EP.VIEW.minHold()), res = lu(EP.VIEW.reserved());
  const epoch = lu(EP.VIEW.currentEpoch()), liab = lu(C.VIEW.liabilities()), commit = lu(EP.VIEW.minCommit());
  t(pot === 0n && st.includes('Pot of round 0 ' + T18(pot)), 'hero pot = roundInfo(0).pot on the contest', st);
  t(T18(maxPot) === '862,000 TBLOCK' && st.includes('of the cap of ' + T18(maxPot)), 'cap = MAX_POT() (862,000)', st);
  t(T18(bal) === '847,983.48 TBLOCK' && va.includes('In the vault ' + T18(bal)), 'vault = TBLOCK.balanceOf(V) (847,983.48), not the first vault', va);
  t(T18(need) === '2,789,880.2 TBLOCK' && va.includes('Claiming needs ' + T18(need) + ' locked'), 'claim minimum = L.minHold() (2,789,880.2)', va);
  t(commit === 604800n && va.includes('at least 7 more days'), 'lock commitment = V.MIN_COMMIT() (7 days)', va);
  t(res === 0n && va.includes('Reserved for players ' + T18(res)), 'reserved = V.reserved()', va);
  t(epoch === 0n && va.includes('This week week 0'), 'week = L.currentEpoch()', va);
  t(ro.includes('Blocks entered 0') && ro.includes('Votes bought 0') && ro.includes('0 of the 2 needed'), 'round 0 counts', ro);
  t(liab === 0n && fo.includes('unpaid amounts: ' + T18(liab)), 'footer = liabilities()', fo);
  t(!va.includes('Your lock'), 'no wallet: no lock line', va);
  p.fin();
}

/* 2. wallet A, then switching to B in the extension */
const balA = lu(C.VIEW.balanceOf(A)), balB = lu(C.VIEW.balanceOf(B)), lockA = lu(LK.VIEW.activeLockedOf(A)), lockB = lu(LK.VIEW.activeLockedOf(B));
t(T18(balA) === '246,365.06 TBLOCK' && T18(lockA) === '3,000,000 TBLOCK', 'recorded A: 246,365.06 held, 3,000,000 locked (read on chain)');
t(balA !== balB, 'A and B hold different amounts (else the switch test proves nothing)', T18(balB));
{
  const p = await lancer();
  await p.connecter(A);
  t(p.manques.length === 0, 'wallet A: every read is in the recording', p.manques.join(' '));
  const fu = p.txt('fund'), va = p.txt('vault'), me = p.txt('me');
  t(fu.includes('TBLOCK in this wallet ' + T18(balA)) && fu.includes('Room left under the cap 862,000 TBLOCK'), 'A: balance + room', fu);
  t(va.includes('Your lock ' + T18(lockA) + ' · factor ×1.17'), 'A: lock = TBlockLock.activeLockedOf(A), factor = V.lockFactor(A) 11,667', va);
  t(/UNIT .*you are its recorded creator/.test(me), 'A: UNIT accepted by the contract (sidesOf + creatorOf)', me);
  const absents = Object.entries(REC.api).filter(([k, v]) => k.startsWith('/api/cle/') && v && v.ok === false && v.balaye > 0 && v.etat !== 'NON_LU');
  t(absents.length >= 1, 'the recording holds a READ absence from /api/cle', JSON.stringify(REC.api).slice(0, 200));
  t(!me.includes('try again in a minute'), 'a pool READ as absent is not told "try again in a minute"', me);
  t(me.includes('no pool of this block was found in the last ' + Number(absents[0][1].balaye).toLocaleString('en-US') + ' Base blocks the server reads'), 'the server window is said', me);
  t(p.ecoute() === 1, 'the page listens to accountsChanged once', p.ecoute());
  await p.changer(B);
  t(p.manques.length === 0, 'wallet B: every read is in the recording', p.manques.join(' '));
  const fu2 = p.txt('fund'), va2 = p.txt('vault'), me2 = p.txt('me');
  t(fu2.includes('TBLOCK in this wallet ' + T18(balB)) && !fu2.includes(T18(balA)), 'after the switch: B balance, not A', fu2);
  t(va2.includes('Your lock ' + T18(lockB)) && !va2.includes(T18(lockA)), 'after the switch: B lock, not A', va2);
  t(me2.includes(displayShortOf(B)) && !me2.includes(displayShortOf(A)), 'after the switch: the wallet row is B', me2);
  t(!/UNIT .*you are its recorded creator/.test(me2), 'after the switch: A blocks are not listed under B', me2);
  await p.changer(null);
  t(!p.txt('fund').includes(T18(balB)) && !p.txt('vault').includes('Your lock'), 'disconnected: no wallet lines', p.txt('vault'));
  p.fin();
}
function displayShortOf(a) { return a.slice(0, 6) + '…' + a.slice(-4); }

/* 3. the race: A's reads held back, B connected, then A's answers released — nothing of A may land under B */
{
  const p = await lancer({ holdFor: A });
  const connexion = p.connecter(A);
  await pause(30);
  await p.changer(B);
  for (let n = 0; n < 200 && p.tenus.length; n++) { p.tenus.splice(0).forEach((r) => r()); await pause(5); }
  await connexion; await p.calme();
  for (let n = 0; n < 50 && p.tenus.length; n++) { p.tenus.splice(0).forEach((r) => r()); await p.calme(); }
  const fu = p.txt('fund'), va = p.txt('vault');
  t(!fu.includes(T18(balA)) && !va.includes(T18(lockA)), 'race: no A line under B once A’s late answers arrive', fu + ' || ' + va);
  t(fu.includes(T18(balB)), 'race: B balance shown', fu);
  p.fin();
}

/* 3b. the same race on the vault: only A's lock read held back, so readVault(A) is still running when B is connected */
{
  const p = await lancer({ holdFor: LK.VIEW.activeLockedOf(A).data });
  const connexion = p.connecter(A);
  for (let n = 0; n < 400 && !p.tenus.length; n++) await pause(5);
  t(p.tenus.length > 0, 'race 3b: readVault(A) reached the lock read');
  await p.changer(B);
  p.tenus.splice(0).forEach((r) => r());
  await connexion; await p.calme();
  const va = p.txt('vault');
  t(va.includes('Your lock ' + T18(lockB)) && !va.includes(T18(lockA)), 'race 3b: the vault shows B lock, never A', va);
  p.fin();
}

/* 4. a closed week — scenario on the live values: currentEpoch -> 1, epochs(0) closed with the budget the vault would reserve now */
{
  const ov = (v, hex) => [cle(v.to, v.data), hex];
  const W = (x) => BigInt(x).toString(16).padStart(64, '0');
  const free = lu(EP.VIEW.vaultBalance()) - lu(EP.VIEW.reserved()); /* V.free() = balance - reserved */
  const budget = free * 5000n / 10000n;
  const ferme = '0x' + W(budget) + W(0) + W(1794960000) + W(1) + W(0);
  const playA = lu(EP.VIEW.playOf(0n, A)), needA = lu(EP.VIEW.needFor(0n));
  t(T18(playA) === '940,979.49 TBLOCK', 'recorded: A played 940,979.49 in week 0 (V.playOf)', T18(playA));
  const base = { ...Object.fromEntries([ov(EP.VIEW.currentEpoch(), '0x' + W(1)), ov(EP.VIEW.epochs(0n), ferme)]) };
  const vrai = '0x' + W(1);
  /* 4a. A claimed: owed() = (0,0) on chain once claimed */
  {
    const p = await lancer({ over: { ...base, ...Object.fromEntries([ov(EP.VIEW.claimed(0n, A), vrai), ov(EP.VIEW.owed(0n, A), '0x' + W(0) + W(0))]) } });
    await p.connecter(A);
    const va = p.txt('vault');
    t(/Week 0 claimed/.test(va) && va.includes('already claimed') && !va.includes('nothing for this wallet'), 'claimed week says claimed', va);
    p.fin();
  }
  /* 4b. A did not claim, lock short (1,000,000 < need): owed() = (0,0) because the factor is 0 */
  {
    const court = '0x' + W(1000000n * 10n ** 18n);
    const p = await lancer({ over: { ...base, ...Object.fromEntries([ov(LK.VIEW.activeLockedOf(A), court), ov(EP.VIEW.owed(0n, A), '0x' + W(0) + W(0))]) } });
    await p.connecter(A);
    const va = p.txt('vault');
    t(/Week 0 lock needed/.test(va) && va.includes('This wallet played ' + T18(playA)) && va.includes('Claiming needs ' + T18(needA) + ' locked'), 'short lock says lock needed, with the amounts', va);
    t(!va.includes('nothing for this wallet'), 'a player is never told "nothing for this wallet"', va);
    p.fin();
  }
  /* 4c. A owed a share: to claim + button */
  {
    const p = await lancer({ over: { ...base, ...Object.fromEntries([ov(EP.VIEW.owed(0n, A), '0x' + W(10n ** 23n) + W(0))]) } });
    await p.connecter(A);
    const va = p.els.get('vault').innerHTML;
    t(/Week 0<\/b><\/span><span><span class="pill ok">to claim/.test(va) && va.includes('data-claimweek="0"'), 'owed > 0: to claim + button', va.slice(0, 600));
    p.fin();
  }
  /* 4d. B did not play (V.playOf(0, B) = 0, recorded): nothing for this wallet */
  {
    const p = await lancer({ over: base });
    await p.connecter(B);
    t(p.manques.length === 0, 'closed-week reads are in the recording', p.manques.join(' '));
    const va = p.txt('vault');
    t(lu(EP.VIEW.playOf(0n, B)) === 0n && /Week 0 nothing for this wallet/.test(va) && va.includes('did not play'), 'no play: nothing for this wallet', va);
    p.fin();
  }
}

/* 5. mutants: on a COPY of contest.html; the pristine copy passes first; each must fail on an AssertionError */
if (!process.argv.includes('--no-mutants') && !arg('--html')) {
  const page = readFileSync(HTML, 'utf8');
  const MUT = [
    ['readWallet keeps a late answer', "if (w === wallet) my = out;", 'my = out;'],
    ['no accountsChanged listener', "window.ethereum.on('accountsChanged', onAccounts)", 'void onAccounts'],
    ['a read absence told to retry', "k.etat !== 'NON_LU' && Number(k.balaye) > 0", "k.etat === 'NON_LU' && Number(k.balaye) > 0"],
    ['claimed week not said', "m.claimed ? pill('claimed', 'ok')", "false ? pill('claimed', 'ok')"],
    ['short lock inverted', 'V.locked < m.need ||', 'V.locked > m.need ||'],
    ['vault read on the first vault', 'balance: await w(EP.VIEW.vaultBalance())', 'balance: await w(ECO.VIEW.vaultBalance())'],
    ['readVault keeps a late answer', "    if (who !== wallet) return; /* the wallet changed during the read", "    if (false) return; /* the wallet changed during the read"],
    ['lock read for the old variable', 'v.locked = await w(LK.VIEW.activeLockedOf(who))', 'v.locked = await w(LK.VIEW.activeLockedOf(A_))'],
  ];
  const dir = mkdtempSync(join(tmpdir(), 'contest378m-'));
  const run = (f) => spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--html', f], { encoding: 'utf8' });
  const p0 = join(dir, 'pristine.html'); writeFileSync(p0, page);
  const r0 = run(p0);
  assert.equal(r0.status, 0, 'the pristine copy passes: ' + (r0.stderr || r0.stdout).slice(-400));
  let tues = 0;
  for (const [nom, de, vers] of MUT) {
    assert.equal(page.split(de).length - 1, 1, 'mutant site found once: ' + nom);
    const f = join(dir, 'm' + tues + '.html');
    writeFileSync(f, page.split(de).join(vers.replace('A_', "'0x' + '0'.repeat(40)")));
    const r = run(f);
    const mort = r.status === 1 && /AssertionError/.test(r.stderr);
    assert.ok(mort, 'mutant must die on an AssertionError: ' + nom + ' (exit ' + r.status + ') ' + (r.stderr || '').slice(-300));
    tues++;
  }
  rmSync(dir, { recursive: true, force: true });
  ok++;
  console.log('mutants killed: ' + tues + '/' + MUT.length);
}
console.log('test-contest-truth-378: ' + ok + ' checks OK (' + HTML.split(/[\\/]/).pop() + ', recording at block ' + parseInt(REC.bloc, 16) + ')');
