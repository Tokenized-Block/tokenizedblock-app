/* test-contest-truth-378-20261112.mjs — task 3 of lot 378 (Phil 2026-11-12: "contest.html shows wrong data"), extended by game386 task B
 *   (Phil 2026-11-12 on Grok's wallet: the page never finished "Looking for the blocks this wallet created…", showed the pot twice, put the
 *   $ of the cap next to the pot, said "0 of the 2 needed round will not pay as it stands", and embedded the holders vault).
 *   RUNS the real page script of contest.html (cut from the file, executed in node with a fake DOM, the real block-contest.js /
 *   contest-vue.js / economie-pack.js / frais-creation.js / groupe-wallet.js) against a FROZEN chain: every eth_call answer the page asked
 *   for, recorded on Base at one pinned block by `--record` (test-contest-truth-378-recu.json; a revert keeps its data). A call the page
 *   makes that is NOT in the recording fails the test: so each number on screen is pinned to its source (contract address + getter).
 *   The holders vault moved to claim.html (game386): its checks of lot 378 are KEPT, run on the claim page module (claim-vue.js lireTout,
 *   the read code of claim.html) against the same frozen chain.
 *   AFFIRME (recorded at the block printed at the end):
 *   - no wallet: round 0, pot (roundInfo), cap 862,000 (MAX_POT), entry 17,241 (ENTRY_FEE), vote 8,621 (VOTE_PRICE), 2 qualifying entries
 *     needed (MIN_QUALIFIED_ENTRIES) with 3 votes from 3 addresses, the three phase dates (GENESIS + periods), liabilities — each equal to
 *     its eth_call decoded HERE; ONE pot on the page; the $ sits on the cap (priceNow of /api/tblock/hold, the app's price), never on a
 *     pot of 0; the quorum said in a whole sentence; no vault card, one line about the vault that is shown only when V.CONTEST() names
 *     this contest, and the free figure it shows = balanceOf(V) - reserved();
 *   - wallet A (Grok's wallet = the pack record's deployer): UNIT, TEST and TWO accepted (their pool key built and confirmed by the
 *     contest's own creatorOf + sidesOf) — before game386 TEST and TWO were not (the server took 47-72 s and found no pool);
 *   - a block with no pool of the app's shape falls back to /api/cle, and a READ absence is not told "try again in a minute";
 *   - a stalled index or a stalled chain ends in "Could not read …, paste an address" within the page's own time bound, never a spinner;
 *   - each gesture (enter, add to the pot) is simulated FROM the wallet before the wallet opens; a refused simulation never opens it;
 *   - SWITCHING the wallet repaints for the new wallet; a read still running for wallet A paints nothing once B is connected;
 *   - claim page module on the same chain: claim needs 2,789,880.2 locked (needFor = minHold), 7 days (MIN_COMMIT), week 0, A's lock
 *     3,000,000 x1.17; a CLOSED week (scenario: currentEpoch -> 1, epochs(0) closed) says claimed / lock needed / to claim / not played.
 *   - mutants (applied to COPIES of contest.html, contest-vue.js and claim-vue.js; the pristine copies pass first): each must die on an
 *     AssertionError.
 *   NE PROUVE PAS: the browser rendering (checked separately in the built-in browser at 1077 and 375 px), a real entry or vote (nothing is
 *     signed), what a wallet does with a batch, claim.html's own DOM (test-claim-386 runs it).
 *   Usage: node test-contest-truth-378-20261112.mjs [--html f] [--mod contest-vue.js=f] [--mod claim-vue.js=f] [--no-mutants]
 *          node test-contest-truth-378-20261112.mjs --record      (reads Base + the live server with x-ms-monitor: 1; eth_call only) */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const ICI = dirname(fileURLToPath(import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const HTML = resolve(arg('--html') || join(ICI, 'contest.html'));
/* module overrides for the mutants: --mod name.js=path (each copy has its own relative imports already pointed at this tree) */
const MODS = new Map();
for (let i = 0; i < process.argv.length; i++) if (process.argv[i] === '--mod') { const [n, f] = process.argv[i + 1].split('='); MODS.set(n, resolve(f)); }
const MUTANT = !!arg('--html') || MODS.size > 0;
const RECORD = process.argv.includes('--record');
const RECU = join(ICI, 'test-contest-truth-378-recu.json');
const urlDe = (f) => pathToFileURL(MODS.get(f) || join(ICI, f)).href;
const mod = (f) => import(urlDe(f));
const C = await mod('block-contest.js'), EP = await mod('economie-pack.js'), ECO = await mod('economie.js'), LK = await mod('lock.js');
const CV = await mod('claim-vue.js');
const { selecteur } = await mod('keccak.js');
const { PACK_ECONOMIE_V2: PK } = await mod('economie-v2-pack-deploiement.js');
const { CONTEST_DEPLOIEMENT: CD } = await mod('block-contest-deploiement.js');
/* the two wallets come from the records, never typed: A = the pack's deployer (Grok's wallet), B = the dev wallet */
const A = String(PK.deployeur).toLowerCase(), B = String(PK.parametres.dev).toLowerCase();
assert.notEqual(A, B);
const SITE = 'https://tokenizedblock.space';
const NODES = ['https://mainnet.base.org', 'https://base-rpc.publicnode.com'];
const cle = (to, data, from) => (from ? String(from).toLowerCase() + '>' : '') + String(to).toLowerCase() + '|' + String(data).toLowerCase();
const sel4 = (sig) => String(selecteur(sig)).toLowerCase();

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
const setTimeoutVrai = globalThis.setTimeout;
const pause = (ms) => new Promise((r) => setTimeoutVrai(r, ms));
async function rpcVrai(method, params) {
  for (let k = 0; k < 12; k++) {
    const url = NODES[k % 2];
    try {
      const j = await fetchVrai(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }).then((x) => x.json());
      if (j && j.result !== undefined && j.result !== null) return j.result;
      if (j && j.error && /revert/i.test(j.error.message || '')) return { revert: j.error.message, data: j.error.data || null };
    } catch (_) { /* next node */ }
    await pause(400 * (k + 1));
  }
  throw new Error('no node answered ' + method);
}
async function teteFigee() { if (!REC.bloc) { const h = await rpcVrai('eth_getBlockByNumber', ['latest', false]); REC.bloc = h.number; REC.horodatage = h.timestamp; } }
/** one eth_call answered from the recording (+ overrides); recorded first when recording. Returns { result } or { error } (JSON-RPC shape). */
async function ethCall(o, over = {}, manques = []) {
  const k = cle(o.to, o.data, o.from);
  const rep = (v) => (v && typeof v === 'object' && v.revert ? { error: { code: 3, message: v.revert, data: v.data || undefined } } : { result: v });
  if (k in over) return rep(over[k]);
  if (RECORD && !(k in REC.eth)) { await teteFigee(); REC.eth[k] = await rpcVrai('eth_call', [o.from ? { from: o.from, to: o.to, data: o.data } : { to: o.to, data: o.data }, REC.bloc]); }
  if (!(k in REC.eth)) { manques.push(k); return { error: { code: -32000, message: 'not in the recording: ' + k } }; }
  return rep(REC.eth[k]);
}
/** an rpc(method, params) for the claim page module (claim-vue.js lireTout) on the frozen chain */
const rpcFige = (over = {}, manques = []) => async (method, params) => {
  if (method !== 'eth_call') throw new Error('claim-vue asked ' + method);
  const r = await ethCall(params[0], over, manques);
  if (r.error) { const e = new Error(r.error.message); if (/revert/i.test(r.error.message)) { e.reverted = true; e.data = r.error.data; } throw e; }
  return r.result;
};

/** one page run: a fake DOM, a fake wallet, fetch answered from REC (+ scenario overrides). Returns the controls.
 *  holdFor: requests whose key contains it wait until released; stall: requests matching it never answer (the page must bound them);
 *  fast: the page's timers run at most 30 ms (its time bounds fire at once). */
async function lancer({ over = {}, holdFor = null, stall = null, fast = false } = {}) {
  const els = new Map();
  for (const id of ['bWallet', 'intro', 'timeline', 'round', 'me', 'past', 'rules', 'etat', 'foot', 'fundAmt', 'manual', /* the ids of the page before game386 (--soft diagnosis) */ 'status', 'fund', 'vault']) els.set(id, { id, innerHTML: '', hidden: true, textContent: '', value: '', className: '' });
  let clic = null;
  const listeners = {};
  let compte = null;
  const manques = [], tenus = [], ouvertures = [], chemins = [];
  let enVol = 0;
  globalThis.document = {
    getElementById: (id) => els.get(id) || null, querySelector: () => null, hidden: false,
    addEventListener: (t, f) => { if (t === 'click') clic = f; },
  };
  globalThis.window = { ethereum: {
    request: async ({ method, params }) => {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return compte ? [compte] : [];
      if (method === 'eth_chainId') return '0x2105';
      if (method === 'wallet_sendCalls') { ouvertures.push(params && params[0]); const e = new Error('User rejected the request.'); e.code = 4001; throw e; }
      throw Object.assign(new Error('read-only test wallet: ' + method), { code: 4001 }); /* never signs, never sends */
    },
    on: (ev, f) => { (listeners[ev] = listeners[ev] || []).push(f); },
  } };
  globalThis.setInterval = () => 0; /* the page's timers do not run here: every read is driven by the test */
  globalThis.setTimeout = fast ? (f, ms, ...a) => setTimeoutVrai(f, Math.min(Number(ms) || 0, 30), ...a) : setTimeoutVrai;
  const coince = (k) => stall && (typeof stall === 'function' ? stall(k) : String(k).includes(stall));
  const repondre = async (url, init) => {
    if (NODES.includes(url) || /^https:\/\/(mainnet\.base\.org|base-rpc\.publicnode\.com)/.test(url)) {
      const { method, params, id } = JSON.parse(init.body);
      if (method === 'eth_getBlockByNumber') { if (RECORD) await teteFigee(); return { jsonrpc: '2.0', id, result: { number: REC.bloc, timestamp: REC.horodatage } }; }
      if (method !== 'eth_call') throw new Error('the page asked ' + method);
      const k = cle(params[0].to, params[0].data, params[0].from);
      if (coince(k)) { enVol--; await new Promise(() => {}); }
      if (holdFor && k.includes(holdFor.slice(2))) { enVol--; await new Promise((r) => tenus.push(r)); enVol++; } /* A's reads held back (race) */
      return { jsonrpc: '2.0', id, ...(await ethCall(params[0], over, manques)) };
    }
    const chemin = String(url);
    if (!chemin.startsWith('/api/')) throw new Error('the page fetched ' + chemin);
    chemins.push(chemin);
    if (coince(chemin)) { enVol--; await new Promise(() => {}); }
    if (holdFor && chemin.includes(holdFor.slice(2))) { enVol--; await new Promise((r) => tenus.push(r)); enVol++; }
    if (RECORD && !(chemin in REC.api)) REC.api[chemin] = await fetchVrai(SITE + chemin, { headers: { 'x-ms-monitor': '1' } }).then((x) => x.json());
    if (!(chemin in REC.api)) { manques.push(chemin); throw new Error('not in the recording: ' + chemin); }
    return REC.api[chemin];
  };
  globalThis.fetch = async (url, init = {}) => {
    enVol++;
    try { const corps = await repondre(url, init); return { json: async () => corps }; } finally { enVol--; }
  };
  /* the page script, cut from the html, imports pointed at this tree (or at a mutant copy) */
  const html = readFileSync(HTML, 'utf8');
  const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(m, 'the page script is found in ' + HTML);
  const src = m[1].replace(/from '\.\/([\w.-]+\.js)'/g, (_, f) => "from '" + urlDe(f) + "'");
  const tmp = mkdtempSync(join(tmpdir(), 'contest378-'));
  const f = join(tmp, 'page.mjs');
  writeFileSync(f, src);
  await import(pathToFileURL(f).href);
  const calme = async () => { for (let n = 0, k = 0; n < 4; k++) { if (k > (RECORD ? 120000 : 6000)) throw new Error('the page never went quiet'); await pause(5); n = enVol === 0 ? n + 1 : 0; } };
  await calme();
  const bouton = (dataset) => ({ target: { closest: () => ({ dataset }) } });
  const txt = (id) => els.get(id).innerHTML.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ');
  return {
    els, manques, tenus, ouvertures, chemins, calme, txt, tout: () => [...els.keys()].map((id) => txt(id) + ' ' + els.get(id).textContent).join(' || '),
    connecter: async (w) => { compte = w; await clic(bouton({ connect: '1' })); await calme(); },
    cliquer: async (dataset) => { await clic(bouton(dataset)); await calme(); },
    changer: async (w) => { compte = w; for (const f of listeners.accountsChanged || []) f(w ? [w] : []); await calme(); },
    attendre: async (cond, ms = 3000) => { const fin = Date.now() + ms; while (Date.now() < fin && !cond()) await pause(10); return cond(); },
    ecoute: () => (listeners.accountsChanged || []).length,
    fin: () => { globalThis.setTimeout = setTimeoutVrai; rmSync(tmp, { recursive: true, force: true }); },
  };
}

/* ---------------------------------------------------------------- the scenarios' overrides (the same in recording and in checking) */
const W = (x) => BigInt(x).toString(16).padStart(64, '0');
const ov = (v, hex, from) => [cle(v.to, v.data, from), hex];
const BLOCS = { UNIT: '0xb2000000000000000000007afa7ed748b0874f27', TEST: '0xb2000000000000000000001e784d3883f4a03f35', TWO: '0xb2000000000000000000000b1e6268211b153f2f' };
const ETH0 = '0x0000000000000000000000000000000000000000';
const DEVISES = (await mod('hook-7030-descripteur.js')).DEVISES_7030;
/* the key a block born by this app has (lancer-pool.js: fee 0, tick spacing 200, the contest's hook), rebuilt here, not by contest-vue.js */
const cleNee = (b, d) => { const [c0, c1] = d.toLowerCase() < b.toLowerCase() ? [d.toLowerCase(), b] : [b, d.toLowerCase()]; return { currency0: c0, currency1: c1, fee: 0, tickSpacing: 200, hooks: C.HOOK }; };
/* fallback scenario: none of TEST's built keys has a pool (creatorOf reverts NotCreator on each) -> the page must ask /api/cle */
const sansCleNee = Object.fromEntries([ETH0, ...DEVISES].map((d) => ov(C.VIEW.creatorOf(C.poolIdOfKey(cleNee(BLOCS.TEST, d))), { revert: 'execution reverted', data: sel4('NotCreator()') })));
/* entries scenario: round 0 with 3 entries (UNIT, TEST, TWO, paid to A), 1 of them qualified */
const entree = (b, votes, voters, q) => '0x' + W(b) + W(A) + W(votes) + W(voters) + W(q ? 1 : 0);
const avecEntrees = Object.fromEntries([ov(C.VIEW.roundInfo(0n), '0x' + W(0) + W(5) + W(3) + W(0) + W(0) + W(0) + W(0) + W(1)), ov(C.VIEW.qualifiedCount(0n), '0x' + W(1)),
  ov(C.VIEW.entryOf(0n, 0n), entree(BLOCS.UNIT, 3, 3, true)), ov(C.VIEW.entryOf(0n, 1n), entree(BLOCS.TEST, 2, 1, false)), ov(C.VIEW.entryOf(0n, 2n), entree(BLOCS.TWO, 0, 0, false))]);
/* the holders vault naming another contest: the contest page must not say it tops up this pot */
const autreConcours = Object.fromEntries([[cle(EP.VAULT, '0x' + sel4('CONTEST()').slice(2)), '0x' + W('0x000000000000000000000000000000000000dEaD')]]);
/* refusal scenario: the contract refuses A's entry of TEST (NotCreator) in the simulation from the wallet */
const cleTestEth = cleNee(BLOCS.TEST, ETH0);
const entreeTest = C.buildEnter(BLOCS.TEST, cleTestEth);
const refusEntree = Object.fromEntries([ov(entreeTest, { revert: 'execution reverted', data: sel4('NotCreator()') }, A)]);
/* the reads the TEST itself decodes (witnesses), recorded with the page's */
const TEMOINS = () => [C.VIEW.roundInfo(0n), C.VIEW.param('MAX_POT'), C.VIEW.param('ENTRY_FEE'), C.VIEW.param('VOTE_PRICE'), C.VIEW.param('MIN_QUALIFIED_ENTRIES'),
  C.VIEW.param('MIN_VOTES'), C.VIEW.param('MIN_VOTERS'), C.VIEW.param('GENESIS'), C.VIEW.param('ENTRY_PERIOD'), C.VIEW.param('VOTE_PERIOD'), C.VIEW.currentRound(), C.VIEW.liabilities(),
  EP.VIEW.vaultBalance(), EP.VIEW.reserved(), EP.VIEW.free(), EP.VIEW.minHold(), EP.VIEW.needFor(0n), EP.VIEW.currentEpoch(), EP.VIEW.minCommit(), EP.VIEW.playOf(0n, A), EP.VIEW.playOf(0n, B),
  C.VIEW.balanceOf(A), C.VIEW.balanceOf(B), LK.VIEW.activeLockedOf(A), LK.VIEW.activeLockedOf(B), EP.VIEW.lockFactor(A), EP.VIEW.epochs(0n), C.VIEW.allowance(A),
  { to: EP.VAULT, data: '0x' + sel4('CONTEST()').slice(2) }];
async function scenarioFerme() {
  const lv = async (v) => { const r = await ethCall(v); return BigInt(String(r.result).slice(0, 66)); };
  const free = (await lv(EP.VIEW.vaultBalance())) - (await lv(EP.VIEW.reserved())); /* V.free() = balance - reserved */
  const budget = free * 5000n / 10000n;
  const ferme = '0x' + W(budget) + W(0) + W(1794960000) + W(1) + W(0);
  return Object.fromEntries([ov(EP.VIEW.currentEpoch(), '0x' + W(1)), ov(EP.VIEW.epochs(0n), ferme)]);
}

/* ---------------------------------------------------------------- recording (eth_call only, at one block, both nodes asked in turn) */
if (RECORD) {
  for (const v of TEMOINS()) await ethCall(v);
  const p = await lancer();
  await p.connecter(A);
  await p.cliquer({ enter: BLOCS.TEST });                          /* the simulation from A is recorded */
  p.els.get('fundAmt').value = '1000'; await p.cliquer({ fund: '1' });
  await p.changer(B);
  p.fin();
  for (const o of [{ over: sansCleNee }, { over: avecEntrees }, { over: autreConcours }]) { const q = await lancer(o); if (o.over === sansCleNee) await q.connecter(A); q.fin(); }
  /* the claim page module, for A, B and no wallet, live and with the closed-week scenario */
  const ts = Number(BigInt(REC.horodatage));
  const ferme = await scenarioFerme();
  for (const w of [A, B, null]) { await CV.lireTout(rpcFige(), w, ts); await CV.lireTout(rpcFige(ferme), w, ts); }
  const corpsR = { bloc: REC.bloc, horodatage: REC.horodatage, eth: REC.eth, api: REC.api };
  writeFileSync(RECU, versPlace(JSON.stringify({ note: 'eth_call answers recorded on Base at one block by --record (a revert keeps its data; a call made FROM a wallet is keyed from>to|data); /api answers read on ' + SITE + ' with x-ms-monitor: 1; the pack addresses are written {pack.X}', sha256Reel: empreinte(corpsR), ...corpsR }, null, 1) + '\n'));
  console.log('recorded', Object.keys(REC.eth).length, 'eth_call +', Object.keys(REC.api).length, 'api answers at block', parseInt(REC.bloc, 16));
  process.exit(0);
}

/* ---------------------------------------------------------------- the checks */
let ok = 0;
/* --soft (diagnosis only, e.g. on the page before the fix): every failed check is listed instead of stopping at the first; exit 1 */
const SOFT = process.argv.includes('--soft'), rates = [];
const t = (cond, quoi, vu) => { if (SOFT && !cond) { rates.push(quoi + (vu !== undefined ? ' — seen: ' + String(vu).slice(0, 160) : '')); return; } assert.ok(cond, quoi + (vu !== undefined ? ' — seen: ' + String(vu).slice(0, 400) : '')); ok++; };
const lu = (v) => { const r = REC.eth[cle(v.to, v.data)]; assert.ok(typeof r === 'string', 'recorded: ' + v.to + ' ' + v.data.slice(0, 10)); return BigInt(r.slice(0, 66)); };
const T18 = (raw) => C.formatUnits18(raw) + ' TBLOCK';
const TS = Number(BigInt(REC.horodatage));
const jour = (ts) => { const d = new Date(Number(ts) * 1000); return d.toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) + ', ' + d.toISOString().slice(11, 16) + ' UTC'; };
const prix = REC.api['/api/tblock/hold'] && REC.api['/api/tblock/hold'].ok ? Number(REC.api['/api/tblock/hold'].priceNow) : null;
const dollar = (raw) => '$' + (Number(raw) / 1e18 * prix).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const J = (o) => JSON.stringify(o, (k, v) => (typeof v === 'bigint' ? String(v) : v));
const secondes = (s) => { const m = /(?:(\d+)d )?(\d\d)h (\d\d)m (\d\d)s/.exec(s); return m ? Number(m[1] || 0) * 86400 + Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4]) : null; };

/* the sources, from the records only */
t(C.CONTEST === String(CD.adresse).toLowerCase(), 'contest address = its deployment record');
const V_ = (await mod('economie-v2-pack-deploye.js')).ADRESSES_PACK_ECONOMIE_V2;
t(EP.VAULT === V_.V && EP.HEARTS === V_.L, 'vault V and hearts L = the deployed pack record');
t(ECO.VAULT !== EP.VAULT, 'the first vault is another contract');
/* the look of the app: the same design tokens (:root and the three colour variants) and the same colour choice */
{
  const app = readFileSync(join(ICI, 'app.html'), 'utf8'), page = readFileSync(HTML, 'utf8');
  const racine = (s) => { const m = /(?:^|\n):root\{([\s\S]*?)\n\}/.exec(s.replace(/\/\*[\s\S]*?\*\//g, '')); return m ? Object.fromEntries([...m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((x) => [x[1], x[2].trim()])) : null; };
  const ra = racine(app), rp = racine(page);
  const ecarts = rp ? Object.entries(rp).filter(([k, v]) => ra[k] !== v).map(([k, v]) => k + ' ' + v + ' vs ' + ra[k]) : ['no :root'];
  t(rp && Object.keys(rp).length >= 20 && ecarts.length === 0, 'contest.html :root tokens equal app.html (' + (rp ? Object.keys(rp).length : 0) + ' tokens)', ecarts.join('; '));
  const variante = (s, k) => { const m = new RegExp(':root\\[data-teinte="' + k + '"\\]\\{([^}]*)\\}').exec(s); return m ? m[1].replace(/\s+/g, '') : null; };
  t(['b', 'c', 'd'].every((k) => variante(page, k) && variante(page, k) === variante(app, k)), 'the three colour variants b, c, d equal app.html');
  t(/localStorage\.getItem\('tb\.teinte'\)/.test(page) && /class="carte"/.test(page) && /class="enveloppe"/.test(page), 'the colour choice of the app (tb.teinte) and its cards');
}

/* 1. no wallet — every number equal to its own eth_call */
{
  const p = await lancer();
  t(p.manques.length === 0, 'every read the page made is in the recording (source pinned)', p.manques.join(' '));
  const tl = p.txt('timeline'), ro = p.txt('round'), me = p.txt('me'), fo = p.txt('foot'), ru = p.txt('rules'), tout = p.tout();
  const pot = C.decodeRoundInfo(REC.eth[cle(C.VIEW.roundInfo(0n).to, C.VIEW.roundInfo(0n).data)]).pot;
  const maxPot = lu(C.VIEW.param('MAX_POT')), fee = lu(C.VIEW.param('ENTRY_FEE')), price = lu(C.VIEW.param('VOTE_PRICE')), minQ = lu(C.VIEW.param('MIN_QUALIFIED_ENTRIES'));
  const minV = lu(C.VIEW.param('MIN_VOTES')), minA = lu(C.VIEW.param('MIN_VOTERS')), gen = lu(C.VIEW.param('GENESIS')), ep = lu(C.VIEW.param('ENTRY_PERIOD')), vp = lu(C.VIEW.param('VOTE_PERIOD'));
  const round = lu(C.VIEW.currentRound()), liab = lu(C.VIEW.liabilities());
  const bal = lu(EP.VIEW.vaultBalance()), res = lu(EP.VIEW.reserved()), free = lu(EP.VIEW.free());
  t(pot === 0n && ro.includes('Pot of round 0 ' + T18(pot)), 'pot = roundInfo(0).pot on the contest', ro);
  t(T18(maxPot) === '862,000 TBLOCK' && ro.includes('Cap per round ' + T18(maxPot)), 'cap = MAX_POT() (862,000)', ro);
  t(T18(fee) === '17,241 TBLOCK' && ru.includes('Costs ' + T18(fee) + ', added to the pot'), 'entry cost = ENTRY_FEE() (17,241)', ru);
  t(T18(price) === '8,621 TBLOCK' && ru.includes('One vote costs ' + T18(price)), 'vote price = VOTE_PRICE() (8,621)', ru);
  t(round === 0n && tl.includes('Round 0'), 'round = currentRound() (0)', tl);
  const s0 = gen + round * (ep + vp), v0 = s0 + ep, e0 = v0 + vp;
  t(tl.includes('Entries · now ' + jour(s0) + ' → ' + jour(v0)) && tl.includes('Voting ' + jour(v0) + ' → ' + jour(e0)) && tl.includes('Paid from ' + jour(e0)),
    'the three phases = GENESIS + round × (ENTRY_PERIOD + VOTE_PERIOD), entries now (' + jour(s0) + ')', tl);
  const cd = secondes(tl.split('Voting opens in')[1] || '');
  t(cd !== null && Math.abs(cd - Number(v0 - BigInt(TS))) <= 5, 'countdown to the vote = voteStart - the chain clock (' + (v0 - BigInt(TS)) + ' s)', tl);
  t(minQ === 2n && minV === 3n && minA === 3n && ro.includes('Not paying yet: 0 of the 2 qualifying entries needed. 2 more blocks must enter, and 2 entries must qualify.')
    && ro.includes('An entry qualifies with at least 3 votes from 3 different addresses.'), 'quorum = MIN_QUALIFIED_ENTRIES (2), MIN_VOTES (3), MIN_VOTERS (3), in a whole sentence', ro);
  t(ro.includes('If the round ends short, nobody is paid: its pot (0 TBLOCK) is carried to the rounds that follow'), 'what happens to the pot if the round does not pay', ro);
  t(!/will not pay as it stands|needed round/.test(tout), 'the broken sentence is gone', tout);
  t(ro.includes('Blocks entered 0') && ro.includes('Votes bought 0') && ro.includes('Entries that qualify 0 of 2 needed'), 'round 0 counts', ro);
  /* ONE pot */
  t((tout.match(/Pot of round/g) || []).length === 1 && (p.els.get('round').innerHTML.match(/data-pot=/g) || []).length === 1 && !/ Pot [0-9]/.test(tout), 'the pot is shown once', tout);
  /* the $ belongs to the cap, never to a pot of 0 */
  t(prix > 0 && ro.includes('Cap per round ' + T18(maxPot) + ' (about ' + dollar(maxPot) + ' at the pool price'), 'the $ is on the cap: ' + dollar(maxPot) + ' = MAX_POT × priceNow of /api/tblock/hold', ro);
  t(!/Pot of round 0 0 TBLOCK \(about/.test(ro) && !/% of the cap of/.test(tout), 'a pot of 0 carries no $, and no "% of the cap of … ($)" sentence', ro);
  /* the vault: no card, one line, shown because V.CONTEST() names this contest; its figure = balanceOf(V) - reserved() = free() */
  t(lu({ to: EP.VAULT, data: '0x' + sel4('CONTEST()').slice(2) }) === BigInt(C.CONTEST), 'V.CONTEST() (read) = this contest');
  t(free === bal - res && ro.includes('The holders vault can top up this pot') && ro.includes('(' + T18(free) + ' now)'), 'vault line: free = balanceOf(V) ' + T18(bal) + ' - reserved() ' + T18(res) + ', on V (not the first vault)', ro);
  t(ro.includes('Holders vault & claims →') && p.els.get('round').innerHTML.includes('href="/claim.html"'), 'the vault and its claims are one link away (claim.html)', ro);
  t(!/Reserved for players|Dev rescue|data-claimweek|Claiming needs/.test(tout + p.els.get('round').innerHTML + p.els.get('me').innerHTML), 'no vault card on the contest page', tout);
  t(liab === 0n && fo.includes('unpaid amounts: ' + T18(liab)), 'footer = liabilities()', fo);
  t(!me.includes('Your lock') && !me.includes('TBLOCK in this wallet') && me.includes('Connect wallet'), 'no wallet: no wallet line, a connect button', me);
  p.fin();
}
{ /* the vault line is said ONLY when the vault names this contest */
  const p = await lancer({ over: autreConcours });
  const ro = p.txt('round');
  t(!ro.includes('can top up this pot') && ro.includes('Holders vault & claims →'), 'a vault naming another contest: no top-up line (the link stays)', ro);
  p.fin();
}
{ /* the entries scenario: 3 entered, 1 qualifies */
  const p = await lancer({ over: avecEntrees });
  const ro = p.txt('round');
  t(p.manques.length === 0, 'entries scenario: every read is in the recording', p.manques.join(' '));
  t(ro.includes('Not paying yet: 1 of the 2 qualifying entries needed. 1 more entry must qualify.') && ro.includes('Blocks entered 3') && ro.includes('Votes bought 5'), 'with 3 entries and 1 qualified: 1 more must qualify', ro);
  t(/UNIT .{0,40}qualifies/.test(ro) && /TEST .{0,40}does not qualify yet/.test(ro), 'each entry with its state', ro);
  p.fin();
}

/* 2. wallet A, then switching to B in the extension */
const balA = lu(C.VIEW.balanceOf(A)), balB = lu(C.VIEW.balanceOf(B)), lockA = lu(LK.VIEW.activeLockedOf(A)), lockB = lu(LK.VIEW.activeLockedOf(B));
t(T18(lockA) === '3,000,000 TBLOCK', 'recorded A: 3,000,000 locked (read on chain); holds ' + T18(balA));
t(balA !== balB, 'A and B hold different amounts (else the switch test proves nothing)', T18(balB));
{
  const p = await lancer();
  await p.connecter(A);
  t(p.manques.length === 0, 'wallet A: every read is in the recording', p.manques.join(' '));
  const me = p.txt('me');
  t(me.includes('TBLOCK in this wallet ' + T18(balA)) && me.includes('Room left under the cap 862,000 TBLOCK'), 'A: balance + room', me);
  t(p.els.get('bWallet').textContent === displayShortOf(A), 'A: the header names the wallet', p.els.get('bWallet').textContent);
  for (const nom of Object.keys(BLOCS)) t(new RegExp(nom + ' .{0,40}you are its recorded creator').test(me), 'A: ' + nom + ' accepted by the contract (sidesOf + creatorOf on the built key)', me);
  t(!/Looking for the blocks|Checking block/.test(me), 'A: the search ended (no spinner text left)', me);
  t((p.els.get('me').innerHTML.match(/data-enter="/g) || []).length === 3, 'A: three Enter buttons (entries are open)', p.els.get('me').innerHTML.slice(0, 300));
  t(!p.chemins.some((c) => c.startsWith('/api/cle/')), 'A: the page did not need /api/cle for blocks born by the app', p.chemins.join(' '));
  t(p.ecoute() === 1, 'the page listens to accountsChanged once', p.ecoute());
  /* ENTER TEST: simulated from A before the wallet opens, then ONE batch approve(EXACT fee) + enter(TEST, its key) */
  await p.cliquer({ enter: BLOCS.TEST });
  const fee = lu(C.VIEW.param('ENTRY_FEE'));
  const simu = REC.eth[cle(entreeTest.to, entreeTest.data, A)];
  t(simu && simu.revert && String(simu.data).startsWith(sel4('TransferFailed()')) && lu(C.VIEW.allowance(A)) < fee, 'recorded: enter(TEST) from A passes every rule and stops at the payment (TransferFailed, allowance below the fee)', JSON.stringify(simu));
  const o = p.ouvertures[0];
  t(p.ouvertures.length === 1 && o.from === A && o.chainId === '0x2105' && o.atomicRequired === true && o.calls.length === 2
    && o.calls[0].data === C.buildApprove(fee).data && o.calls[1].to === C.CONTEST && o.calls[1].data === entreeTest.data, 'enter: the wallet opens ONCE, with approve(17,241) then enter(TEST, ETH key)', JSON.stringify(o));
  t(p.txt('etat').includes('Not sent: you declined in your wallet'), 'enter: a refusal in the wallet is said as such', p.txt('etat'));
  /* ADD 1,000 TBLOCK: simulated, then approve(1,000) + fund(0, 1,000) */
  p.els.get('fundAmt').value = '1000';
  await p.cliquer({ fund: '1' });
  const o2 = p.ouvertures[1];
  t(p.ouvertures.length === 2 && o2.calls[0].data === C.buildApprove(1000n * 10n ** 18n).data && o2.calls[1].data === C.buildFund(0n, 1000n * 10n ** 18n).data, 'fund: approve(1,000) then fund(0, 1,000)', JSON.stringify(o2));
  await p.changer(B);
  t(p.manques.length === 0, 'wallet B: every read is in the recording', p.manques.join(' '));
  const me2 = p.txt('me');
  t(me2.includes('TBLOCK in this wallet ' + T18(balB)) && !me2.includes(T18(balA)), 'after the switch: B balance, not A', me2);
  t(me2.includes(displayShortOf(B)) && !me2.includes(displayShortOf(A)) && p.els.get('bWallet').textContent === displayShortOf(B), 'after the switch: the wallet row is B', me2);
  t(!/UNIT .{0,40}you are its recorded creator/.test(me2), 'after the switch: A blocks are not listed under B', me2);
  await p.changer(null);
  t(!p.txt('me').includes(T18(balB)) && !p.txt('me').includes('TBLOCK in this wallet'), 'disconnected: no wallet lines', p.txt('me'));
  p.fin();
}
function displayShortOf(a) { return a.slice(0, 6) + '…' + a.slice(-4); }

/* 2b. a refused simulation never opens the wallet */
{
  const p = await lancer({ over: refusEntree });
  await p.connecter(A);
  await p.cliquer({ enter: BLOCS.TEST });
  t(p.ouvertures.length === 0 && p.txt('etat').includes('Not sent: the contract refuses it: this wallet is not the recorded creator of this block. Your wallet was not opened.'), 'simulation refused (NotCreator): the wallet is never opened, the reason is said', p.txt('etat'));
  p.fin();
}

/* 2c. a block with no pool of the app's shape: the page asks /api/cle; a READ absence is not told "try again in a minute" */
{
  const p = await lancer({ over: sansCleNee });
  await p.connecter(A);
  t(p.manques.length === 0, 'fallback: every read is in the recording', p.manques.join(' '));
  const me = p.txt('me');
  const absent = REC.api['/api/cle/' + BLOCS.TEST];
  t(absent && absent.ok === false && absent.balaye > 0 && absent.etat !== 'NON_LU', 'the recording holds a READ absence from /api/cle for TEST', JSON.stringify(absent));
  t(/TEST .{0,40}cannot be entered/.test(me) && !me.includes('try again in a minute'), 'a pool READ as absent is not told "try again in a minute"', me);
  t(me.includes('no pool of it was found in the last ' + Number(absent.balaye).toLocaleString('en-US') + ' Base blocks the server reads'), 'the server window is said', me);
  t(/UNIT .{0,40}you are its recorded creator/.test(me), 'fallback: the other blocks are still accepted', me);
  p.fin();
}

/* 2d. never spin forever: a stalled index, then a stalled chain, end in a sentence that points to the address field */
{
  const p = await lancer({ stall: '/api/blocks-de', fast: true });
  await p.connecter(A);
  const fin = await p.attendre(() => p.txt('me').includes('Could not read the blocks of this wallet just now. Paste a block address below'));
  t(fin && !p.txt('me').includes('Looking for the blocks'), 'stalled index: "Could not read the blocks of this wallet just now. Paste a block address below…"', p.txt('me'));
  p.fin();
}
{
  const creatorOf = sel4('creatorOf(bytes32)').slice(2);
  const p = await lancer({ stall: (k) => k.includes('|0x' + creatorOf), fast: true });
  await p.connecter(A);
  const fin = await p.attendre(() => p.txt('me').includes('Could not read every block of this wallet in time. Paste a block address below'));
  t(fin && /UNIT .{0,40}cannot be entered/.test(p.txt('me')) && p.txt('me').includes('not read in time'), 'stalled chain: each block "not read in time", then the paste sentence', p.txt('me'));
  p.fin();
}

/* 3. the race: A's reads held back, B connected, then A's answers released — nothing of A may land under B */
{
  const p = await lancer({ holdFor: A });
  const connexion = p.connecter(A);
  await pause(30);
  await p.changer(B);
  for (let n = 0; n < 200 && p.tenus.length; n++) { p.tenus.splice(0).forEach((r) => r()); await pause(5); }
  await connexion; await p.calme();
  for (let n = 0; n < 50 && p.tenus.length; n++) { p.tenus.splice(0).forEach((r) => r()); await p.calme(); }
  const me = p.txt('me');
  t(!me.includes(T18(balA)), 'race: no A line under B once A’s late answers arrive', me);
  t(me.includes(T18(balB)), 'race: B balance shown', me);
  p.fin();
}

/* 3b. the same race on the block search: only A's index answer is held back, so readMine(A) is still running when B is connected;
 *   B's search ends FIRST, then A's answer is released: a page that keeps a late answer would paint A's blocks last, under B */
{
  const p = await lancer({ holdFor: '0x/api/blocks-de?adr=' + A });
  const connexion = p.connecter(A);
  for (let n = 0; n < 400 && !p.tenus.length; n++) await pause(5);
  t(p.tenus.length > 0, 'race 3b: readMine(A) reached the index read');
  await p.changer(B);
  p.tenus.splice(0).forEach((r) => r());
  await connexion; await p.calme();
  const me = p.txt('me');
  t(!/UNIT .{0,40}you are its recorded creator/.test(me) && me.includes(displayShortOf(B)), 'race 3b: A’s blocks never land under B', me);
  p.fin();
}

/* 4. the holders vault, now on claim.html: its module (claim-vue.js lireTout, the read code of claim.html) on the SAME frozen chain */
const need = lu(EP.VIEW.needFor(0n)), minHold = lu(EP.VIEW.minHold()), commit = lu(EP.VIEW.minCommit()), epoch = lu(EP.VIEW.currentEpoch());
{
  const m0 = [], LA = await CV.lireTout(rpcFige({}, m0), A, TS), L0 = await CV.lireTout(rpcFige({}, m0), null, TS), LB = await CV.lireTout(rpcFige({}, m0), B, TS);
  t(m0.length === 0, 'claim page module: every read is in the recording', m0.join(' '));
  const lA = Object.fromEntries(CV.lignesMoi(LA)), l0 = Object.fromEntries(CV.lignesMoi(L0)), lB = Object.fromEntries(CV.lignesMoi(LB));
  t(T18(need) === '2,789,880.2 TBLOCK' && need === minHold && String(lA['Your lock']).includes('a claim needs ' + EP.fmt(need) + ' TBLOCK'), 'claim minimum = V.needFor(week) = L.minHold() (2,789,880.2), said on the claim page', lA['Your lock']);
  t(commit === 604800n && LA.v.minCommit === commit, 'lock commitment = V.MIN_COMMIT() (7 days), read by the claim page', String(LA.v.minCommit));
  t(epoch === 0n && String(l0['This week']).startsWith('week 0'), 'week = L.currentEpoch(), on the claim page', l0['This week']);
  t(!('Your lock' in l0), 'no wallet: no lock line on the claim page', J(l0));
  t(String(lA['Your lock']).startsWith('3,000,000 TBLOCK') && lA['Your lock factor now'] === EP.texteFacteur(lu(EP.VIEW.lockFactor(A))) && lA['Your lock factor now'] === '×1.17', 'A: lock = TBlockLock.activeLockedOf(A), factor = V.lockFactor(A) ×1.17', J(lA));
  t(String(lB['Your lock']).startsWith(EP.fmt(lockB) + ' TBLOCK') && !String(lB['Your lock']).startsWith('3,000,000'), 'B: B lock, not A', lB['Your lock']);
}
{
  const ferme = await scenarioFerme();
  const playA = lu(EP.VIEW.playOf(0n, A));
  t(playA > 0n, 'recorded: A played ' + T18(playA) + ' in week 0 (V.playOf)');
  const etat = async (w, extra) => { const m = []; const L = await CV.lireTout(rpcFige({ ...ferme, ...extra }, m), w, TS); assert.equal(m.length, 0, 'closed week reads recorded: ' + m.join(' ')); const s = L.v.semaines.find((x) => x.e === 0n); return { L, s, st: s ? CV.etatSemaine(s, L) : null }; };
  const vrai = '0x' + W(1);
  /* 4a. A claimed: owed() = (0,0) on chain once claimed */
  { const { st } = await etat(A, Object.fromEntries([ov(EP.VIEW.claimed(0n, A), vrai), ov(EP.VIEW.owed(0n, A), '0x' + W(0) + W(0))]));
    t(st && st.cle === 'RECLAMEE' && st.texte.includes('already claimed'), 'claimed week says claimed', J(st)); }
  /* 4b. A did not claim, lock short (1,000,000 < need): owed() = (0,0) because the factor is 0 */
  { const court = '0x' + W(1000000n * 10n ** 18n);
    const { st, s } = await etat(A, Object.fromEntries([ov(LK.VIEW.activeLockedOf(A), court), ov(EP.VIEW.owed(0n, A), '0x' + W(0) + W(0))]));
    t(st && st.cle === 'LOCK_REQUIS' && st.texte.includes('claiming needs ' + EP.fmt(need) + ' TBLOCK locked') && s.jeu === playA, 'short lock says lock needed, with the amounts', J(st));
    t(st.cle !== 'PAS_JOUE', 'a player is never told "not played"'); }
  /* 4c. A owed a share: to claim, and the claim is V.claim(0) */
  { const { st, L } = await etat(A, Object.fromEntries([ov(EP.VIEW.owed(0n, A), '0x' + W(10n ** 23n) + W(0))]));
    const plan = CV.planClaimSemaine(L, 0n, A);
    t(st && st.cle === 'A_RECLAMER' && plan.ok && plan.appel.data === EP.claimCall(0n).data, 'owed > 0: to claim + V.claim(0)', J({ st: st && st.cle, plan: plan.why })); }
  /* 4d. B did not play (V.playOf(0, B) = 0, recorded) */
  { const { st } = await etat(B, {});
    t(lu(EP.VIEW.playOf(0n, B)) === 0n && st && st.cle === 'PAS_JOUE' && st.texte.includes('did not play'), 'no play: not played', J(st)); }
}

/* 5. mutants: on COPIES of contest.html, contest-vue.js and claim-vue.js; the pristine copies pass first; each must fail on an AssertionError */
if (!process.argv.includes('--no-mutants') && !MUTANT && !SOFT) {
  const dir = mkdtempSync(join(tmpdir(), 'contest378m-'));
  /* a module copy keeps working outside the tree: its relative imports are pointed at this tree */
  const copie = (txt) => txt.replace(/from '\.\/([\w.-]+\.js)'/g, (_, g) => "from '" + pathToFileURL(join(ICI, g)).href + "'");
  const src = { 'contest.html': readFileSync(HTML, 'utf8'), 'contest-vue.js': readFileSync(join(ICI, 'contest-vue.js'), 'utf8'), 'claim-vue.js': readFileSync(join(ICI, 'claim-vue.js'), 'utf8') };
  const MUT = [
    ['contest.html', 'readWallet keeps a late answer', 'if (w === wallet) my = out;', 'my = out;'],
    ['contest.html', 'no accountsChanged listener', "window.ethereum.on('accountsChanged', onAccounts)", 'void onAccounts'],
    ['contest.html', 'a read absence told to retry', "k.etat !== 'NON_LU' && Number(k.balaye) > 0", "k.etat === 'NON_LU' && Number(k.balaye) > 0"],
    ['claim-vue.js', 'claimed week not said', "if (s.claimed) return out('RECLAMEE'", "if (false) return out('RECLAMEE'"],
    ['claim-vue.js', 'short lock inverted', "if (court && !court.ok) return out('LOCK_REQUIS'", "if (court && court.ok) return out('LOCK_REQUIS'"],
    ['contest.html', 'vault read on another contract', 'CV.readFeed(call, { vault: EP.VAULT,', 'CV.readFeed(call, { vault: EP.HEARTS,'],
    ['contest.html', 'the block search keeps a late answer', 'const alive = () => run === mineRun && who === wallet;', 'const alive = () => true;'],
    ['claim-vue.js', 'lock read for another wallet', 'lit(LK.VIEW.activeLockedOf(w))', "lit(LK.VIEW.activeLockedOf('0x' + '0'.repeat(40)))"],
    ['contest-vue.js', 'the built key has another fee', 'fee: Number(k.fee), tickSpacing', 'fee: Number(k.fee) + 100, tickSpacing'],
    ['contest.html', 'the index read without a time bound', "CV.withTimeout(fetch('/api/blocks-de?' + new URLSearchParams({ adr: who }), { cache: 'no-store' }).then((x) => x.json()), INDEX_MS, 'the block index')", "fetch('/api/blocks-de?' + new URLSearchParams({ adr: who }), { cache: 'no-store' }).then((x) => x.json())"],
    ['contest.html', 'the pot shown twice', "r += row('Cap per round',", "r += row('Pot', tok(cur.pot)) + row('Cap per round',"],
    ['contest.html', 'the $ of the cap put on the pot', "tok(cur.pot) + (cur.pot > 0n ? dollars(cur.pot) : '')", 'tok(cur.pot) + dollars(p.maxPot)'],
    ['contest-vue.js', 'the missing count ignores the qualified', 'const missing = need - q;', 'const missing = need;'],
    ['contest-vue.js', 'the vault line without its check', 'feedsThis: contest === C.CONTEST,', 'feedsThis: true,'],
    ['contest.html', 'the wallet opens without the simulation', "if (!s.ok) { say('Not sent: ' + s.why + '. Your wallet was not opened.', 'ko'); return; }", ''],
    ['contest-vue.js', 'any revert taken for the payment', 'if (sel === SEL_TRANSFER_FAILED && n > 0n', 'if (n > 0n'],
  ];
  const run = (args) => spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...args], { encoding: 'utf8' });
  const ecrire = (d, f, txt) => { const p = join(d, f); writeFileSync(p, f.endsWith('.js') ? copie(txt) : txt); return p; };
  const base = { 'contest.html': ecrire(dir, 'contest.html', src['contest.html']), 'contest-vue.js': ecrire(dir, 'contest-vue.js', src['contest-vue.js']), 'claim-vue.js': ecrire(dir, 'claim-vue.js', src['claim-vue.js']) };
  const args = (f) => ['--html', f['contest.html'], '--mod', 'contest-vue.js=' + f['contest-vue.js'], '--mod', 'claim-vue.js=' + f['claim-vue.js']];
  const r0 = run(args(base));
  assert.equal(r0.status, 0, 'the pristine copies pass: ' + (r0.stderr || r0.stdout).slice(-600));
  let tues = 0;
  for (const [f, nom, de, vers] of MUT) {
    assert.equal(src[f].split(de).length - 1, 1, 'mutant site found once in ' + f + ': ' + nom);
    const d2 = mkdtempSync(join(dir, 'm'));
    const r = run(args({ ...base, [f]: ecrire(d2, f, src[f].split(de).join(vers)) }));
    const mort = r.status === 1 && /AssertionError/.test(r.stderr);
    assert.ok(mort, 'mutant must die on an AssertionError: ' + nom + ' (exit ' + r.status + ') ' + (r.stderr || '').slice(-300));
    tues++;
    console.log('  mutant ' + tues + '/' + MUT.length + ' killed (' + f + ': ' + nom + ') by: ' + ((/AssertionError[^\n]*\n?([^\n]*)/.exec(r.stderr) || [])[0] || '').replace(/\s+/g, ' ').slice(0, 140));
  }
  rmSync(dir, { recursive: true, force: true });
  ok++;
  console.log('mutants killed: ' + tues + '/' + MUT.length);
}
if (SOFT && rates.length) { console.log(rates.length + ' checks FAIL:\n  ' + rates.join('\n  ')); process.exit(1); }
console.log('test-contest-truth-378: ' + ok + ' checks OK (' + HTML.split(/[\\/]/).pop() + ', recording at block ' + parseInt(REC.bloc, 16) + ')');
