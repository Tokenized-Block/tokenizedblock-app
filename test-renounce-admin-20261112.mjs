/* test-renounce-admin-20261112.mjs — giving up a block's admin role (renounce-admin.js + renounce-admin.html).
 *
 * A  EXECUTED  the calls: selectors computed (keccak.js), calldata byte-equal to renounce-admin-calls.md (read-only session, 2026-11-12),
 *              grant BEFORE renounce, dEaD = lancer-pool PROPRIETAIRE_PERMANENT, the batch refuses any row not offered to this wallet.
 * B  EXECUTED  readBlock on a scripted chain: non-admin -> NOT_ADMIN, unread -> UNREAD, supply < cap / mint / burn role -> REFUSE,
 *              else OFFER; recheck drops a block whose role moved since it was shown.
 * C  EXECUTED  candidateBlocks: router entries kept only when the router formula proves them; a non-B20 is rejected; `complete`.
 * D  EXECUTED  receipts: checkSent / checkBatch refuse another tx.from, status 0, a log from another address or naming another sender.
 * E  EXECUTED  simulate on a scripted chain: eth_simulateV1 path, and the eth_call fallback (named as such).
 * F  SOURCE    the page: imports the module, re-checks then simulates before the wallet opens, shows the wallet through displayShort, never the
 *              fee wallet raw, carries the measured sentences, no forbidden copy; served by serveur-web.js.
 * G  ON CHAIN  (eth_call / eth_simulateV1 on the two public nodes; HORS_LIGNE=1 skips it and says so) Grok's wallet is offered exactly its
 *              three blocks of the served index, the simulation holds; a random wallet is admin of none.
 * M  MUTANTS   five mutants of renounce-admin.js, each must turn this test red by an ASSERTION (a mutant that fails to import is not a kill):
 *              batch order reversed, dEaD replaced by the wallet, tx.from check removed, offered to a non-admin, block not re-checked.
 * The test counts itself and prints n/n. */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const ICI = dirname(fileURLToPath(import.meta.url));
const lire = (f) => { try { return readFileSync(join(ICI, f), 'utf8'); } catch (_) { return ''; } };
const imp = (f) => import(pathToFileURL(join(ICI, f)).href);
const CIBLE = process.env.RA_MODULE || 'renounce-admin.js';
const MUTANT = !!process.env.RA_MODULE;
let n = 0, ko = 0;
const t = (label, cond) => { n += 1; if (cond === true) { if (!MUTANT) console.log('  ok   ' + label); } else { ko += 1; console.log('  KO   ' + label); } };
const rejette = async (f) => { try { await f(); return false; } catch (_) { return true; } };

const RA = await imp(CIBLE);
const { selecteur, keccak256Hex, topic } = await imp('keccak.js');
const L = await imp('lancer-pool.js');
const F = await imp('frais-creation.js');
const IR = await imp('index-routeur.js');
const low = (a) => String(a).toLowerCase();
const w = (a) => low(a).replace(/^0x/, '').padStart(64, '0');

/* addresses copied from verif-roles-377.json (scratchpad of this session) — the chain part re-reads every one of them */
const GROK = '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b';
const GROK_BLOCKS = ['0xb2000000000000000000007afa7ed748b0874f27', '0xb2000000000000000000001e784d3883f4a03f35', '0xb2000000000000000000000b1e6268211b153f2f'];
const OTHER = '0x' + 'a11ce'.padEnd(40, '7');

console.log('A  the calls');
t('selectors computed: grantRole 0x2f2ff15d, renounceRole 0x36568abe, hasRole 0x91d14854', RA.SEL.grantRole === selecteur('grantRole(bytes32,address)') && RA.SEL.grantRole === '0x2f2ff15d' && RA.SEL.renounceRole === '0x36568abe' && RA.SEL.hasRole === '0x91d14854');
t('errors: LastAdminCannotRenounce 0x361513e7, AccessControlUnauthorizedAccount 0xe2517d3f', RA.ERR.LAST_ADMIN === '0x361513e7' && RA.ERR.UNAUTHORIZED === '0xe2517d3f');
t('MINT_ROLE = keccak256("MINT_ROLE") = the value used by sim-final-377', RA.MINT_ROLE === keccak256Hex(new TextEncoder().encode('MINT_ROLE')) && RA.MINT_ROLE === '0x154c00819833dac601ee5ddded6fda79d9d8b506b911b3dbd54cdb95fe6c3686');
t('topics: RoleGranted / RoleRevoked(bytes32,address,address)', RA.TOPIC.ROLE_GRANTED === topic('RoleGranted(bytes32,address,address)') && RA.TOPIC.ROLE_REVOKED === topic('RoleRevoked(bytes32,address,address)'));
t('DEAD = lancer-pool.js PROPRIETAIRE_PERMANENT', low(RA.DEAD) === low(L.PROPRIETAIRE_PERMANENT));
/* the two calldatas, copied from renounce-admin-calls.md (block 0xb2…ae3f, holder = the fee wallet) */
const MD_GRANT = '0x2f2ff15d0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000dead';
const MD_RENOUNCE = '0x36568abe0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a6cf99d35949c6cb911adb910078f4ca46f0f5d4';
t('grant calldata byte-equal to renounce-admin-calls.md', RA.encodeGrantDead() === MD_GRANT);
t('renounce calldata for the fee wallet byte-equal to renounce-admin-calls.md', RA.encodeRenounce(F.FEE_WALLET) === MD_RENOUNCE);
const cs = RA.callsFor(GROK_BLOCKS[0], GROK);
t('callsFor: two calls, grant FIRST then renounce, both to the block, value 0', cs.length === 2 && cs[0].data === MD_GRANT && cs[1].data === RA.SEL.renounceRole + w(RA.DEFAULT_ADMIN_ROLE) + w(GROK) && cs.every((c) => c.to === GROK_BLOCKS[0] && c.value === '0x0'));
t('the grant names dEaD, never the wallet', cs[0].data.endsWith(w(RA.DEAD)) && !cs[0].data.includes(w(GROK)));
t('callsFor with dEaD already admin: renounce only', RA.callsFor(GROK_BLOCKS[0], GROK, { deadIsAdmin: true }).length === 1);
const offer = (b, extra = {}) => ({ block: b, wallet: GROK, state: 'OFFER', walletAdmin: true, deadIsAdmin: false, ...extra });
const lot = RA.batchFor(GROK_BLOCKS.map((b) => offer(b)), GROK);
t('batchFor 3 blocks: 6 calls, block by block, grant then renounce', lot.length === 6 && lot.every((c, k) => c.to === GROK_BLOCKS[Math.floor(k / 2)] && c.data.startsWith(k % 2 ? RA.SEL.renounceRole : RA.SEL.grantRole)));
t('batchFor refuses a NOT_ADMIN row', await rejette(() => RA.batchFor([{ block: GROK_BLOCKS[0], wallet: GROK, state: 'NOT_ADMIN', walletAdmin: false }], GROK)));
t('batchFor refuses a row read for another wallet', await rejette(() => RA.batchFor([offer(GROK_BLOCKS[0], { wallet: OTHER })], GROK)));
t('batchFor refuses an empty choice', await rejette(() => RA.batchFor([], GROK)));
const req = RA.sendCallsRequest(GROK, lot);
t('wallet_sendCalls v2, Base, atomic, the 6 calls in order', req.method === 'wallet_sendCalls' && req.params[0].version === '2.0.0' && req.params[0].chainId === '0x2105' && req.params[0].atomicRequired === true && req.params[0].calls.length === 6 && req.params[0].calls[0].data === lot[0].data);
t('sendMode: atomic supported -> batch; nothing -> sequential; unsupported -> sequential', RA.sendMode({ '0x2105': { atomic: { status: 'supported' } } }) === 'batch' && RA.sendMode(null) === 'sequential' && RA.sendMode({ '0x2105': { atomic: { status: 'unsupported' } } }) === 'sequential');
t('units: 1e27 raw at 18 decimals = 1,000,000,000', RA.units(10n ** 27n, 18) === '1,000,000,000');

console.log('B  readBlock on a scripted chain');
const ONE = '0x' + '0'.repeat(63) + '1', ZERO = '0x' + '0'.repeat(64);
const strAbi = (s) => { const h = Buffer.from(s, 'utf8').toString('hex'); return '0x' + w('0x20') + w('0x' + s.length.toString(16)) + h.padEnd(Math.ceil(h.length / 64) * 64, '0'); };
function chaine({ admin = true, dead = false, mint = false, burn = false, ts = 10n ** 27n, cap = 10n ** 27n, fail = false } = {}) {
  return async (m, p) => {
    if (fail) throw new Error('node down');
    const d = p[0].data;
    if (d.startsWith(RA.SEL.hasRole)) {
      const r = d.slice(10, 74), a = d.slice(74);
      if (r === w(RA.DEFAULT_ADMIN_ROLE)) return a === w(RA.DEAD) ? (dead ? ONE : ZERO) : (admin ? ONE : ZERO);
      if (r === w(RA.MINT_ROLE)) return mint ? ONE : ZERO;
      if (r === w(RA.BURN_ROLE)) return burn ? ONE : ZERO;
      return ZERO;
    }
    if (d === RA.SEL.totalSupply) return '0x' + w('0x' + ts.toString(16));
    if (d === RA.SEL.supplyCap) return '0x' + w('0x' + cap.toString(16));
    if (d === RA.SEL.name) return strAbi('Unit');
    if (d === RA.SEL.symbol) return strAbi('UNIT');
    if (d === RA.SEL.decimals) return '0x' + w('0x12');
    throw new Error('unexpected ' + d);
  };
}
const B0 = GROK_BLOCKS[0];
const rOk = await RA.readBlock({ rpc: chaine(), block: B0, wallet: GROK });
t('admin, supply = cap, no mint/burn -> OFFER with its 2 calls, name/symbol/decimals read', rOk.state === 'OFFER' && rOk.calls.length === 2 && rOk.symbol === 'UNIT' && rOk.name === 'Unit' && rOk.decimals === 18);
const rNo = await RA.readBlock({ rpc: chaine({ admin: false }), block: B0, wallet: OTHER });
t('not admin -> NOT_ADMIN, no calls', rNo.state === 'NOT_ADMIN' && !rNo.calls && rNo.walletAdmin === false);
t('a node failure -> UNREAD, no calls', (await RA.readBlock({ rpc: chaine({ fail: true }), block: B0, wallet: GROK })).state === 'UNREAD');
t('supply below cap -> REFUSE with why', (await RA.readBlock({ rpc: chaine({ ts: 5n }), block: B0, wallet: GROK })).state === 'REFUSE');
t('the wallet holds the mint role -> REFUSE', (await RA.readBlock({ rpc: chaine({ mint: true }), block: B0, wallet: GROK })).state === 'REFUSE');
t('the wallet holds the burn role -> REFUSE', (await RA.readBlock({ rpc: chaine({ burn: true }), block: B0, wallet: GROK })).state === 'REFUSE');
t('dEaD already admin -> OFFER, renounce only', (await RA.readBlock({ rpc: chaine({ dead: true }), block: B0, wallet: GROK })).calls.length === 1);
const lw = await RA.readWallet({ rpc: chaine({ admin: false }), wallet: OTHER, candidates: GROK_BLOCKS });
t('readWallet of a wallet admin of none: offered 0, admin 0', lw.offered.length === 0 && lw.admin.length === 0 && lw.rows.length === 3);
const shown = [rOk];
const re1 = await RA.recheck({ rpc: chaine({ admin: false }), wallet: GROK, rows: shown });
t('recheck: the role moved since it was shown -> not ok, the block is lost', re1.ok === false && re1.lost.length === 1 && re1.rows[0].state === 'NOT_ADMIN');
t('recheck: still admin -> ok, fresh rows', (await RA.recheck({ rpc: chaine(), wallet: GROK, rows: shown })).ok === true);

console.log('C  candidateBlocks');
const c0 = RA.candidateBlocks({});
t('seeds only: the router and old-router seeds proven by the formula, not complete', c0.blocks.length === IR.GRAINE_ROUTEUR.length + IR.GRAINE_ANCIENS_ROUTEURS.length && c0.complete === false);
const g = IR.GRAINE_ROUTEUR[0];
const faux = { jeton: '0xb2000000000000000000007afa7ed748b0874f27', sel: g.sel };
const ci = RA.candidateBlocks({ routerIndex: { ok: true, couvertureComplete: true, fenetresRatees: 0, blocks: [g, faux] }, ourBlocks: { ok: true, couvertureComplete: true, fenetresRatees: 0, blocks: ['0xb20000000000000000000003d296be435ae4bbe3', '0xdeadbeef'] } });
t('a router entry whose salt does not give its address is rejected; a non-B20 is rejected', ci.rejected === 2 && !ci.blocks.some((b) => b.block === faux.jeton) && ci.blocks.some((b) => b.block === '0xb20000000000000000000003d296be435ae4bbe3'));
t('both lists served complete -> complete', ci.complete === true);

console.log('D  receipts');
const call = lot[0], call2 = lot[1];
const logOf = (c, sender = GROK, addr = c.to) => ({ address: addr, topics: [c.expects.topic, RA.DEFAULT_ADMIN_ROLE, '0x' + w(c.expects.account), '0x' + w(sender)], data: '0x' });
const tx = (c, from = GROK) => ({ from, to: c.to, input: c.data, value: '0x0' });
const rc = (c, extra = {}) => ({ status: '0x1', logs: [logOf(c)], ...extra });
t('a good grant receipt holds', RA.checkSent({ call, wallet: GROK, tx: tx(call), receipt: rc(call) }).length === 0);
t('a good renounce receipt holds', RA.checkSent({ call: call2, wallet: GROK, tx: tx(call2), receipt: rc(call2) }).length === 0);
t('tx.from another address -> refused', RA.checkSent({ call, wallet: GROK, tx: tx(call, OTHER), receipt: rc(call) }).length > 0);
t('status 0 -> refused', RA.checkSent({ call, wallet: GROK, tx: tx(call), receipt: rc(call, { status: '0x0' }) }).length > 0);
t('the role log from another contract -> refused', RA.checkSent({ call, wallet: GROK, tx: tx(call), receipt: rc(call, { logs: [logOf(call, GROK, OTHER)] }) }).length > 0);
t('the role log naming another sender -> refused', RA.checkSent({ call, wallet: GROK, tx: tx(call), receipt: rc(call, { logs: [logOf(call, OTHER)] }) }).length > 0);
t('other signed data -> refused', RA.checkSent({ call, wallet: GROK, tx: { ...tx(call), input: call2.data }, receipt: rc(call) }).length > 0);
t('no transaction read -> refused', RA.checkSent({ call, wallet: GROK, tx: null, receipt: rc(call) }).length > 0);
const recB = [{ status: '0x1', transactionHash: '0x1', logs: lot.map((c) => logOf(c)) }];
t('checkBatch: one receipt with the 6 logs from the wallet holds', RA.checkBatch({ calls: lot, wallet: GROK, receipts: recB, txs: [{ from: GROK }] }).length === 0);
t('checkBatch: tx.from = a relayer -> refused', RA.checkBatch({ calls: lot, wallet: GROK, receipts: recB, txs: [{ from: OTHER }] }).length > 0);
t('checkBatch: a missing log -> refused', RA.checkBatch({ calls: lot, wallet: GROK, receipts: [{ ...recB[0], logs: recB[0].logs.slice(1) }], txs: [{ from: GROK }] }).length > 0);

console.log('E  simulate on a scripted chain');
const simChain = (support = true, renounceAlone = RA.ERR.LAST_ADMIN) => async (m, p) => {
  if (m === 'eth_simulateV1') {
    if (!support) throw new Error('the method eth_simulateV1 does not exist/is not available');
    const calls = p[0].blockStateCalls[0].calls;
    const state = new Map();
    return [{ calls: calls.map((c) => {
      const b = c.to, d = c.data, s = state.get(b) || { you: true, dead: false };
      state.set(b, s);
      const ok = (r = '0x') => ({ status: '0x1', returnData: r }), rev = (sel) => ({ status: '0x0', returnData: sel + '0'.repeat(56), error: { data: sel } });
      if (d === RA.encodeGrantDead()) { if (!s.you) return rev(RA.ERR.UNAUTHORIZED); s.dead = true; return ok(); }
      if (d.startsWith(RA.SEL.renounceRole)) { const who = '0x' + d.slice(-40); if (low(who) !== low(c.from)) return rev(RA.ERR.BAD_CONFIRMATION); const admins = (s.you ? 1 : 0) + (s.dead ? 1 : 0); if (admins <= 1) return rev(RA.ERR.LAST_ADMIN); if (low(who) === low(GROK)) s.you = false; else s.dead = false; return ok(); }
      if (d.startsWith(RA.SEL.hasRole)) { const who = '0x' + d.slice(-40); return ok(low(who) === low(RA.DEAD) ? (s.dead ? ONE : ZERO) : (s.you ? ONE : ZERO)); }
      if (d.startsWith(RA.SEL.updateSupplyCap) || d.startsWith(RA.SEL.grantRole)) return s.you ? ok() : rev(RA.ERR.UNAUTHORIZED);
      return ok();
    }) }];
  }
  if (m === 'eth_call') {
    const d = p[0].data;
    if (d === RA.encodeGrantDead()) return '0x';
    if (d.startsWith(RA.SEL.renounceRole)) { if (renounceAlone === 'PASSES') return '0x'; const e = new Error('execution reverted'); e.data = renounceAlone; throw e; }
  }
  throw new Error('unexpected ' + m);
};
const rows3 = GROK_BLOCKS.map((b) => offer(b, { supplyCap: 10n ** 27n }));
const s1 = await RA.simulate({ rpc: simChain(true), wallet: GROK, rows: rows3 });
t('eth_simulateV1: the batch and the 5 proofs per block hold', s1.method === 'eth_simulateV1' && s1.ok === true && s1.blocks.length === 3 && s1.blocks.every((b) => b.lines.length === 7 && b.lines.every((l) => l.ok)));
const s2 = await RA.simulate({ rpc: simChain(false), wallet: GROK, rows: rows3 });
t('no eth_simulateV1 on the node: fallback named eth_call, holds when renounce alone is refused as last admin', s2.method === 'eth_call' && s2.ok === true);
const s3 = await RA.simulate({ rpc: simChain(false, 'PASSES'), wallet: GROK, rows: rows3 });
t('fallback: renounce alone passes (another admin exists) -> not ok', s3.method === 'eth_call' && s3.ok === false);

console.log('F  the page and the server');
const page = lire('renounce-admin.html');
t('the page exists and imports renounce-admin.js', /import\('\.\/renounce-admin\.js'\)/.test(page));
const go = page.slice(page.indexOf("$('#go').onclick"));
const iRe = go.indexOf('RA.recheck('), iSim = go.indexOf('RA.simulate('), iBatch = go.indexOf('RA.batchFor(re.rows'), iSend = Math.min(...['wallet_sendCalls', 'q.method', "'eth_sendTransaction'"].map((s) => { const k = go.indexOf(s); return k < 0 ? Infinity : k; }));
t('before the wallet opens: recheck, then simulate, then the batch from the FRESH rows, then the send', iRe > 0 && iRe < iSim && iSim < iBatch && iBatch < iSend && iSend < Infinity);
t('every sent transaction is judged by checkSent / checkBatch, then hasRole read again (readAfter)', /RA\.checkSent\(/.test(go) && /RA\.checkBatch\(/.test(go) && /RA\.readAfter\(/.test(page));
t('a wallet admin of none is refused with a plain sentence', /holds the admin role of none of the blocks born in the app\. Nothing to sign\./.test(page));
t('the wallet is shown through displayShort; the fee wallet is never written raw in the page', /displayShort\(wallet\)/.test(page) && !low(page).includes(low(F.FEE_WALLET)) && !low(page).includes('a6cf'));
t('the measured sentences come from the module: AFTER, CONSEQUENCE_PAIR, STAYS', /RA\.AFTER/.test(page) && /RA\.CONSEQUENCE_PAIR/.test(page) && /RA\.STAYS/.test(page) && RA.AFTER === 'Nobody can ever raise the cap or mint.' && RA.CONSEQUENCE_PAIR === 'This block can no longer open a market in another currency.');
t('"who can raise the cap today: you" per block, a checkbox per offered block, one sign button', /who can raise the cap today/.test(page) && /class="pick"/.test(page) && (page.match(/id="go"/g) || []).length === 1);
const ecran = page.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
t('no forbidden copy on screen (not deployed / under review / fork / v2 / V8)', !/not deployed|under review|fork|\bv2\b|\bV8\b/i.test(ecran));
t('the page says which check ran (eth_simulateV1 or eth_call call by call)', /eth_simulateV1/.test(ecran) && /call by call \(eth_call\)/.test(ecran));
const srv = lire('serveur-web.js');
t('serveur-web.js serves renounce-admin.html and renounce-admin.js', /'renounce-admin\.html', 'renounce-admin\.js'/.test(srv));
t('the module and the page carry no CR byte', !lire('renounce-admin.js').includes('\r') && !page.includes('\r'));
const sansCom = lire(CIBLE).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
t('the module sends nothing: no eth_sendTransaction / eth_sendRawTransaction / wallet request in its code', !/eth_sendTransaction|eth_sendRawTransaction|ethereum\.request/.test(sansCom));

if (!MUTANT && process.env.HORS_LIGNE !== '1') {
  console.log('G  on chain (eth_call / eth_simulateV1, public nodes)');
  const rpc = RA.publicReader();
  let routerIndex = null, ourBlocks = null;
  try { routerIndex = await (await fetch('https://tokenizedblock.space/api/blocks-routeur', { cache: 'no-store' })).json(); } catch (_) { routerIndex = null; }
  try { ourBlocks = await (await fetch('https://tokenizedblock.space/api/nos-blocks', { cache: 'no-store' })).json(); } catch (_) { ourBlocks = null; }
  const cand = RA.candidateBlocks({ routerIndex, ourBlocks });
  console.log('     served index: ' + cand.blocks.length + ' blocks, complete ' + cand.complete + ', rejected ' + cand.rejected);
  t('the served index lists Grok\'s three blocks', GROK_BLOCKS.every((b) => cand.blocks.some((c) => c.block === b)));
  const lu = await RA.readWallet({ rpc, wallet: GROK, candidates: cand.blocks, parallel: 2 });
  const unread = lu.rows.filter((r) => r.state === 'UNREAD');
  console.log('     Grok: admin ' + lu.admin.length + ', offered ' + lu.offered.map((r) => r.symbol + ' ' + r.block).join(', ') + (unread.length ? ' · UNREAD ' + unread.length : ''));
  t('Grok\'s wallet is offered EXACTLY its three blocks (hasRole live, every row read)', unread.length === 0 && lu.offered.length === 3 && GROK_BLOCKS.every((b) => lu.offered.some((r) => r.block === b)) && lu.admin.length === 3);
  t('each of them: supply = cap, no mint/burn role, dEaD not admin yet', lu.offered.every((r) => r.totalSupply === r.supplyCap && !r.walletMint && !r.walletBurn && r.deadIsAdmin === false));
  const sim = await RA.simulate({ rpc, wallet: GROK, rows: lu.offered });
  console.log('     simulation: ' + sim.method + ' ' + (sim.ok ? 'holds' : 'FAILS') + (sim.why ? ' (' + String(sim.why).slice(0, 80) + ')' : ''));
  t('the batch for the three, simulated from Grok\'s wallet on Base, holds (' + sim.method + ')', sim.ok === true);
  const r2 = await RA.readWallet({ rpc, wallet: OTHER, candidates: GROK_BLOCKS, parallel: 2 });
  t('a random wallet: admin of none, nothing offered', r2.admin.length === 0 && r2.offered.length === 0 && r2.rows.every((r) => r.state === 'NOT_ADMIN'));
} else if (!MUTANT) console.log('G  SKIPPED (HORS_LIGNE=1): nothing read on chain');

/* ── M: mutants ── */
if (!MUTANT) {
  console.log('M  mutants of renounce-admin.js');
  const src = lire('renounce-admin.js');
  const MUTS = [
    ['batch order reversed', "  calls.push({ to, data: encodeRenounce(wallet)", "  calls.unshift({ to, data: encodeRenounce(wallet)"],
    ['dEaD replaced by the wallet', "calls.push({ to, data: encodeGrantDead(), value: '0x0'", "calls.push({ to, data: SEL.grantRole + word(DEFAULT_ADMIN_ROLE) + word(wallet), value: '0x0'"],
    ['tx.from check removed', "    if (low(tx.from) !== w) ko.push('tx.from is ' + low(tx.from) + ', not your wallet');\n", ''],
    ['offered to a non-admin', "  if (walletAdmin === false) return { ...base, state: 'NOT_ADMIN', walletAdmin: false };\n", ''],
    ['block not re-checked', "  for (const r of rows) fresh.push(await readBlock({ rpc, block: r.block, wallet }));", "  for (const r of rows) fresh.push(r);"],
  ];
  for (const [nom, de, vers] of MUTS) {
    const nb = src.split(de).length - 1;
    if (nb !== 1) { t('mutant "' + nom + '": its pattern is found exactly once (' + nb + ')', false); continue; }
    const f = 'renounce-admin.mut-' + process.pid + '.js';
    writeFileSync(join(ICI, f), src.replace(de, () => vers));
    let sortie = '', code = 0;
    try { sortie = execFileSync(process.execPath, [fileURLToPath(import.meta.url)], { cwd: ICI, env: { ...process.env, RA_MODULE: f, HORS_LIGNE: '1' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { code = e.status; sortie = String(e.stdout || '') + String(e.stderr || ''); }
    finally { if (existsSync(join(ICI, f))) unlinkSync(join(ICI, f)); }
    const parAssertion = code !== 0 && /^\s+KO\s/m.test(sortie) && !/Cannot find module|SyntaxError|ERR_MODULE_NOT_FOUND/.test(sortie);
    t('mutant "' + nom + '" is killed by an assertion: ' + ((sortie.match(/^\s+KO\s+(.*)$/m) || [])[1] || 'NOT KILLED').slice(0, 110), parAssertion);
  }
}
console.log((ko ? 'KO ' + ko : 'ok') + ' ' + (n - ko) + '/' + n + (MUTANT ? ' (mutant run)' : '') + ' — test-renounce-admin-20261112');
process.exit(ko ? 1 : 0);
