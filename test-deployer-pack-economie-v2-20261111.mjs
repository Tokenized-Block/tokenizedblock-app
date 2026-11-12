/* test-deployer-pack-economie-v2-20261111.mjs — game373: the economy v2 PACK deploy page (deployer-economie-v2.html), its shared logic
 *   (pack-economie-v2.js) and the read-only verifier (verifier-pack-economie-v2.mjs), each GREEN on a consistent chain and RED on each fault.
 * The chain here is a FAKE JSON-RPC built from a small synthetic record (same structure as the real one). What it does NOT prove:
 *   that the real record's bytes deploy (that is forge-pack/test/PackRecord.fork.t.sol, a Base fork in forge), nor a deploy on mainnet.
 * Exit 0 only when every check holds; a missing real record is reported as SKIPPED, never as passed. */
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { selecteur } from './keccak.js';
import { adresseCreate, predire, creationEtape, integrite, cablage, codeMasque, controleEtape, etapeSuivante, verifierPack, LETTRES } from './pack-economie-v2.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const lire = (f) => readFileSync(path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
let ok = 0, ko = 0, skip = 0;
const t = (m, c, x = '') => { if (c) ok++; else { ko++; console.log('KO', m, x); } };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const clone = (o) => JSON.parse(JSON.stringify(o));

/* ---------- a synthetic record with the real record's shape ---------- */
const a = (n) => '0x' + n.toString(16).padStart(40, '0');
const W = a(0xde910), N = 41n;
const X = { tblock: a(0xb2), usdc: a(0x05dc), wtcoin: a(0x3c), aeroPool: a(0xae), poolManager: a(0x4985), v4Hooks: a(0x2044), v4PoolId: '0x' + '68'.repeat(32), lock: a(0x10c), contest: a(0xc0) };
const Q = { keeper: a(0x4ee9), dev: a(0xd1), dev2: a(0xd2), tamDevWallet: a(0xd00d), skinsFeeWallet: a(0xfee5), guardian: a(0x6a4d), t0: '1794355200', maxPotWtcoin: '1000', maxPotTblock: '2000' };
const wa = (x) => x.slice(2).padStart(64, '0');
const wn = (x) => BigInt(x).toString(16).padStart(64, '0');
function fabriquer(muter = (r) => r) {
  const base = [
    ['L', 'BlockLikesV2', [wa(X.tblock), wa(X.lock), wn(1794355200), wa(Q.keeper), wa(Q.dev), wa(Q.dev2), '@R'], { startPrice: '5405208834949', genesis: 1794355200, keeper: Q.keeper, rewards: '@R' }],
    ['P', 'TblockPayRouter', [wa(X.usdc), wa(X.wtcoin), wa(X.tblock)], { usdc: X.usdc }],
    ['T', 'TamArtV2', ['@P', wa(Q.tamDevWallet), '@V', wa(X.tblock), wa(X.usdc), '@R'], { router: '@P', dest: '@V', rewards: '@R' }],
    ['S', 'BlockSkins', ['@P', wa(Q.skinsFeeWallet), '@V', wa(X.tblock), wa(X.usdc), '@R'], { router: '@P', dest: '@V', rewards: '@R' }],
    ['V', 'TBlockVaultV2', [wa(X.tblock), '@L', wn(14 * 32), wn(2), '@T', '@S'], { likes: '@L', games: ['@T', '@S'] }],
    ['R', 'TBlockLockRewards', [wa(X.tblock), wa(X.wtcoin), wn(9 * 32), wn(3), '@L', '@T', '@S'], { games: ['@L', '@T', '@S'] }],
  ];
  const etapes = base.map(([lettre, nom, args, config], k) => {
    const init = '0x6080' + (k + 1).toString(16).padStart(2, '0') + 'fe';
    const runtime = ('60' + (k + 1).toString(16).padStart(2, '0')).repeat(20) + '00'.repeat(32) + 'aa'.repeat(10);
    return { lettre, nonce: 'N+' + k, nom, source: 'contracts/src/' + nom + '.sol', sha256Source: sha(nom), config, init, args,
      sha256Modele: sha(init + '|' + args.join(',')), octetsCreation: 0, runtimeOctets: runtime.length / 2, runtimeSha256Masque: sha(runtime), immutables: [[40, 32]], _runtime: runtime };
  });
  const r = { chaine: 8453, compilateur: 'x', fixtureDeTest: false, genereLe: 'now', prix: { startPriceE18: '5405208834949', source: 'test' }, deployeur: W, existants: X, parametres: Q, etapes };
  r.sha256Pack = sha(etapes.map((e) => e.sha256Modele).join(','));
  return muter(r);
}
const resigner = (r) => { r.etapes.forEach((e) => { e.sha256Modele = sha(e.init + '|' + e.args.join(',')); }); r.sha256Pack = sha(r.etapes.map((e) => e.sha256Modele).join(',')); return r; };

/* ---------- a fake Base chain on which the pack was deployed by W from nonce N ---------- */
function chaine(rec, fautes = {}) {
  const p = predire(W, N);
  const txs = {}, recus = {}, code = {}, calls = {};
  const hashes = rec.etapes.map((e, k) => '0x' + sha('tx' + k).padStart(64, '0'));
  rec.etapes.forEach((e, k) => {
    const h = hashes[k];
    txs[h] = { hash: h, from: W, to: null, nonce: '0x' + (N + BigInt(k)).toString(16), input: creationEtape(rec, k, p) };
    recus[h] = { transactionHash: h, status: '0x1', contractAddress: p[e.lettre] };
    const rt = e._runtime || ('60' + (k + 1).toString(16).padStart(2, '0')).repeat(20) + '00'.repeat(32) + 'aa'.repeat(10);
    code[p[e.lettre]] = '0x' + rt.slice(0, 80) + 'ab'.repeat(32) + rt.slice(144);   /* immutable slot filled with a value */
  });
  const A_ = (x) => '0x' + wa(x), Nn = (x) => '0x' + wn(x), B = (x) => Nn(x ? 1 : 0);
  const set = (to, sig, val, arg) => { calls[to + '|' + selecteur(sig) + (arg ? wa(arg) : '')] = val; };
  const L = rec.etapes[0].config;
  set(p.L, 'TBLOCK()', A_(X.tblock)); set(p.L, 'LOCK()', A_(X.lock)); set(p.L, 'keeper()', A_(Q.keeper)); set(p.L, 'DEV()', A_(Q.dev)); set(p.L, 'DEV2()', A_(Q.dev2));
  set(p.L, 'START_PRICE()', Nn(L.startPrice)); set(p.L, 'GENESIS()', Nn(L.genesis));
  set(p.L, 'REWARDS()', A_(p.R)); set(p.L, 'wired()', B(true)); set(p.R, 'isGame(address)', B(true), p.L);
  set(p.P, 'USDC()', A_(X.usdc)); set(p.P, 'WTCOIN()', A_(X.wtcoin)); set(p.P, 'TBLOCK()', A_(X.tblock)); set(p.P, 'AERO_POOL()', A_(X.aeroPool)); set(p.P, 'POOL_MANAGER()', A_(X.poolManager)); set(p.P, 'V4_POOL_ID()', X.v4PoolId);
  for (const [G, wal, ws] of [[p.T, Q.tamDevWallet, 'DEV_WALLET()'], [p.S, Q.skinsFeeWallet, 'FEE_WALLET()']]) {
    set(G, 'ROUTER()', A_(p.P)); set(G, 'TBLOCK()', A_(X.tblock)); set(G, ws, A_(wal)); set(G, 'DEST()', A_(p.V)); set(G, 'VAULT()', A_(p.V)); set(G, 'REWARDS()', A_(p.R)); set(G, 'wired()', B(true));
    set(p.V, 'isGame(address)', B(true), G); set(p.R, 'isGame(address)', B(true), G);
  }
  set(p.S, 'owner()', A_(W));
  set(p.V, 'TBLOCK()', A_(X.tblock)); set(p.V, 'LIKES()', A_(p.L)); set(p.V, 'LOCK()', A_(X.lock)); set(p.V, 'CONTEST()', A_(X.contest)); set(p.V, 'ROUTER()', A_(p.P));
  set(p.V, 'GAME_COUNT()', Nn(2)); set(p.V, 'GAME_0()', A_(p.T)); set(p.V, 'GAME_1()', A_(p.S));
  set(p.R, 'TBLOCK()', A_(X.tblock)); set(p.R, 'WTCOIN()', A_(X.wtcoin)); set(p.R, 'LOCK()', A_(X.lock)); set(p.R, 'POOL_MANAGER()', A_(X.poolManager)); set(p.R, 'guardian()', A_(Q.guardian));
  set(p.R, 'T0()', Nn(Q.t0)); set(p.R, 'MAX_POT_WTCOIN()', Nn(Q.maxPotWtcoin)); set(p.R, 'MAX_POT_TBLOCK()', Nn(Q.maxPotTblock));
  set(p.R, 'GAME_COUNT()', Nn(3)); set(p.R, 'GAME_0()', A_(p.L)); set(p.R, 'GAME_1()', A_(p.T)); set(p.R, 'GAME_2()', A_(p.S));
  set(X.lock, 'TBLOCK()', A_(X.tblock));
  const c = { p, hashes, txs, recus, code, calls, chainId: '0x2105', nonceLatest: '0x' + (N + 6n).toString(16), noncePending: null, wallet: W };
  if (fautes.f) fautes.f(c);
  const rpc = async (m, params) => {
    if (m === 'eth_chainId') return c.chainId;
    if (m === 'eth_getTransactionByHash') return c.txs[params[0]] || null;
    if (m === 'eth_getTransactionReceipt') return c.recus[params[0]] || null;
    if (m === 'eth_getCode') return c.code[String(params[0]).toLowerCase()] || '0x';
    if (m === 'eth_getTransactionCount') return params[1] === 'pending' && c.noncePending ? c.noncePending : c.nonceLatest;
    if (m === 'eth_call') { const k = String(params[0].to).toLowerCase() + '|' + params[0].data; return k in c.calls ? c.calls[k] : '0x'; }
    throw new Error('unexpected ' + m);
  };
  return { c, rpc };
}
/* a step line's title names every property it checks, so for step lines only the failure text (vu) may match the motif */
const echoue = (res, motif) => !res.ok && res.lignes.some((l) => !l.ok && (/^step d /.test(l.quoi) ? l.vu.includes(motif) : (l.quoi.includes(motif) || l.vu.includes(motif))));

/* ---------- 1. CREATE prediction, substitution, masking ---------- */
t('CREATE address, nonce 0 (cast compute-address)', adresseCreate(W, 0) === '0xa8f29a314c03dfa414c06a257daf50494d1a28f6');
t('CREATE address, nonce 41 (cast compute-address)', adresseCreate(W, 41) === '0x5205ad991cc97458cee4ddd52dc5dbbe3c49318d');
const R0 = fabriquer();
t('synthetic record integrity green', (await integrite(R0)).length === 0);
const p0 = predire(W, N);
t('six predicted addresses, nonces N..N+5', LETTRES.every((l, k) => p0[l] === adresseCreate(W, N + BigInt(k))));
t('creation substitutes P, V, R as left-padded words', creationEtape(R0, 2, p0) === R0.etapes[2].init + wa(p0.P) + wa(Q.tamDevWallet) + wa(p0.V) + wa(X.tblock) + wa(X.usdc) + wa(p0.R));
let threw = false; try { creationEtape(R0, 4, { V: p0.V }); } catch (_) { threw = true; }
t('creation refuses a missing pack address', threw);
t('step 1 (Likes) carries R PREDICTED as its last constructor word', creationEtape(R0, 0, { R: p0.R }) === R0.etapes[0].init + R0.etapes[0].args.slice(0, -1).join('') + wa(p0.R));
threw = false; try { creationEtape(R0, 0, { V: p0.V }); } catch (x) { threw = /needs R/.test(x.message); }
t('step 1 refuses to build without R', threw);
t('step 6 (R) lists [L, T, S] as its trailing address[]', creationEtape(R0, 5, p0).endsWith(wn(3) + wa(p0.L) + wa(p0.T) + wa(p0.S)));
t('wiring of the synthetic record green', cablage(R0).length === 0, cablage(R0).join());
{
  const old = resigner(clone(R0)); old.etapes[0].args.pop(); delete old.etapes[0].config.rewards; resigner(old);
  t('RED: a fresh-hashed record whose Likes does not name R (the 14-field Likes) fails integrity', (await integrite(old)).includes('L does not name R'));
  const r2 = resigner(clone(R0)); r2.etapes[5].args.splice(-4, 4, wn(2), '@T', '@S'); r2.etapes[5].config.games = ['@T', '@S']; resigner(r2);
  t('RED: a fresh-hashed record whose R lists [T, S] fails integrity', (await integrite(r2)).includes('R does not list [L, T, S]'));
  const r3 = resigner(clone(R0)); r3.etapes[5].config.games = ['@T', '@S', '@L']; r3.etapes[5].args.splice(-3, 3, '@T', '@S', '@L'); resigner(r3);
  t('RED: R listing the same three in another order fails integrity', (await integrite(r3)).includes('R does not list [L, T, S]'));
  const r4 = resigner(clone(R0)); r4.etapes[4].args.splice(-3, 3, wn(3), '@L', '@T'); r4.etapes[4].args.push('@S'); r4.etapes[4].config.games = ['@L', '@T', '@S']; resigner(r4);
  t('RED: V listing L fails integrity (V keeps reading hearts through L.spentIn)', (await integrite(r4)).includes('V does not list [T, S]'));
  const r5 = resigner(clone(R0)); r5.etapes[0].args[r5.etapes[0].args.length - 1] = '@V'; resigner(r5);
  t('RED: Likes naming V instead of R fails integrity', (await integrite(r5)).includes('L does not name R'));
}
t('masking zeroes exactly the immutable slots', codeMasque('ff'.repeat(10), [[2, 3]]) === 'ffff000000' + 'ff'.repeat(5));
const R1 = clone(R0); R1.etapes[1].args[0] = wa(a(0x666));
t('RED: a word changed without its sha256 = integrity mismatch', (await integrite(R1)).includes('TBLOCK payment router'));
const R2 = resigner(clone(R0)); [R2.etapes[4], R2.etapes[5]] = [R2.etapes[5], R2.etapes[4]]; resigner(R2);
t('RED: steps out of order = integrity mismatch even with fresh sha256', (await integrite(R2)).includes('order'));

/* ---------- 2. the verifier: green, then one fault at a time ---------- */
{
  const { c, rpc } = chaine(R0);
  const res = await verifierPack(R0, c.hashes, rpc);
  t('GREEN: every check holds on a consistent chain', res.ok, res.lignes.filter((l) => !l.ok).map((l) => l.quoi + ' ' + l.vu).join(' | '));
  t('GREEN covers 6 steps, 12 code checks and the two-way game checks', res.lignes.length >= 60 && res.lignes.filter((l) => l.quoi.startsWith('two-way')).length === 5, res.lignes.length);
  t('GREEN includes L.REWARDS() = R, R.isGame(L), L.wired() and R lists [L, T, S]', ['L.REWARDS() = R', 'two-way: R.isGame(L', 'L (Hearts).wired()', 'R.GAME_COUNT() = 3', 'R.GAME_0() = L', 'R.GAME_1() = T', 'R.GAME_2() = S']
    .every((m) => res.lignes.some((l) => l.ok && l.quoi.startsWith(m))));
}
const rouge = async (nom, muterChaine, motif, rec = R0) => {
  const { c, rpc } = chaine(rec, { f: muterChaine });
  const res = await verifierPack(rec, c.hashes, rpc);
  t('RED: ' + nom, echoue(res, motif), res.lignes.filter((l) => !l.ok).map((l) => l.quoi).join(' | ') || 'all green');
};
await rouge('step 3 signed by another wallet', (c) => { c.txs[c.hashes[2]].from = a(0xbad); }, 'signed by ' + a(0xbad));
await rouge('step 1 signed by another wallet', (c) => { c.txs[c.hashes[0]].from = a(0xbad); }, 'step 1 signed by the pack deployer');
await rouge('a stray tx took nonce N+4: the vault lands elsewhere', (c) => { c.txs[c.hashes[4]].nonce = '0x' + (N + 5n).toString(16); c.recus[c.hashes[4]].contractAddress = adresseCreate(W, N + 5n); }, 'another transaction used a pack nonce');
await rouge('contract at another address than predicted', (c) => { c.recus[c.hashes[1]].contractAddress = a(0x1234); }, 'deployed at ' + a(0x1234));
await rouge('signed data is not the frozen creation', (c) => { c.txs[c.hashes[3]].input = c.txs[c.hashes[3]].input.slice(0, -2) + '00'; }, 'not the frozen');
await rouge('a step failed on chain', (c) => { c.recus[c.hashes[5]].status = '0x0'; }, 'FAILED on chain');
await rouge('a step was a call, not a creation', (c) => { c.txs[c.hashes[0]].to = a(0x99); }, 'not a contract creation');
await rouge('runtime differs OUTSIDE the immutable slots', (c) => { const k = c.p.T; c.code[k] = c.code[k].slice(0, 10) + '00' + c.code[k].slice(12); }, 'runtime code = the frozen build');
await rouge('runtime size differs', (c) => { c.code[c.p.R] += '00'; }, 'runtime size');
{
  const { c, rpc } = chaine(R0, { f: (c) => { const k = c.p.V; c.code[k] = c.code[k].slice(0, 82) + 'cd'.repeat(32) + c.code[k].slice(146); } });
  const res = await verifierPack(R0, c.hashes, rpc);
  t('GREEN: other values INSIDE the immutable slots are allowed (they are constructor wiring, checked by eth_call)', res.ok, res.lignes.filter((l) => !l.ok).map((l) => l.quoi).join(' | '));
}
await rouge('T names another rewards contract', (c) => { c.calls[c.p.T + '|' + selecteur('REWARDS()')] = '0x' + wa(a(0x777)); }, 'REWARDS() = R');
await rouge('the vault does not list S (two-way)', (c) => { c.calls[c.p.V + '|' + selecteur('isGame(address)') + wa(c.p.S)] = '0x' + wn(0); }, 'V.isGame');
await rouge('the rewards do not list T (two-way)', (c) => { delete c.calls[c.p.R + '|' + selecteur('isGame(address)') + wa(c.p.T)]; }, 'R.isGame');
await rouge('S not wired', (c) => { c.calls[c.p.S + '|' + selecteur('wired()')] = '0x' + wn(0); }, 'wired()');
await rouge('L names another rewards contract (a heart would not count)', (c) => { c.calls[c.p.L + '|' + selecteur('REWARDS()')] = '0x' + wa(a(0x777)); }, 'L.REWARDS() = R');
await rouge('the rewards do not list L (two-way)', (c) => { delete c.calls[c.p.R + '|' + selecteur('isGame(address)') + wa(c.p.L)]; }, 'R.isGame(L');
await rouge('L not wired', (c) => { c.calls[c.p.L + '|' + selecteur('wired()')] = '0x' + wn(0); }, 'L (Hearts).wired()');
await rouge('R on chain lists [T, S] only (old pack)', (c) => { c.calls[c.p.R + '|' + selecteur('GAME_COUNT()')] = '0x' + wn(2); c.calls[c.p.R + '|' + selecteur('GAME_0()')] = '0x' + wa(c.p.T); c.calls[c.p.R + '|' + selecteur('GAME_1()')] = '0x' + wa(c.p.S); delete c.calls[c.p.R + '|' + selecteur('GAME_2()')]; }, 'R.GAME_COUNT() = 3');
await rouge('R lists L, T, S in another order', (c) => { c.calls[c.p.R + '|' + selecteur('GAME_0()')] = '0x' + wa(c.p.T); c.calls[c.p.R + '|' + selecteur('GAME_1()')] = '0x' + wa(c.p.L); }, 'R.GAME_0() = L');
await rouge('the vault names another router (two routers)', (c) => { c.calls[c.p.V + '|' + selecteur('ROUTER()')] = '0x' + wa(a(0x1111)); }, 'one router');
await rouge('the router holds the OTHER TBLOCK', (c) => { c.calls[c.p.P + '|' + selecteur('TBLOCK()')] = '0x' + wa(a(0xb3)); }, 'P.TBLOCK()');
await rouge('another guardian on chain', (c) => { c.calls[c.p.R + '|' + selecteur('guardian()')] = '0x' + wa(a(0x9)); }, 'guardian');
await rouge('wrong network', (c) => { c.chainId = '0x1'; }, 'network is Base');
await rouge('a receipt missing', (c) => { delete c.recus[c.hashes[2]]; }, 'receipt not found');
{
  const Rk = clone(R0); Rk.parametres.keeper = Q.dev;
  const { c, rpc } = chaine(R0);
  const res = await verifierPack(Rk, c.hashes, rpc);
  t('RED: keeper == DEV is refused (review DT-1)', echoue(res, 'neither DEV nor DEV2'));
}
{
  const Rf = clone(R0); Rf.fixtureDeTest = true;
  const { c, rpc } = chaine(R0);
  t('RED: a test fixture never verifies', echoue(await verifierPack(Rf, c.hashes, rpc), 'not a test fixture'));
  t('RED: five hashes', !(await verifierPack(R0, c.hashes.slice(0, 5), rpc)).ok);
}

/* ---------- 3. the page flow (etapeSuivante): what may be signed next ---------- */
{
  const { c, rpc } = chaine(R0);
  c.nonceLatest = '0x' + N.toString(16);
  let r = await etapeSuivante(R0, rpc, W, { N: null, hashes: [] });
  t('step 1 ready at nonce N with the frozen creation', r.pret && r.k === 0 && BigInt(r.nonce) === N && r.data === creationEtape(R0, 0, p0) && r.attendu === p0.L, r.raison);
  t('step 1 refused for another wallet', !(await etapeSuivante(R0, rpc, a(0xbad), { N: null, hashes: [] })).pret);
  const Rf = clone(R0); Rf.fixtureDeTest = true;
  t('step 1 refused for a test fixture', /TEST FIXTURE/.test((await etapeSuivante(Rf, rpc, W, { N: null, hashes: [] })).raison));
  t('step 1 refused for a broken record', /integrity/.test((await etapeSuivante(R1, rpc, W, { N: null, hashes: [] })).raison));
  c.noncePending = '0x' + (N + 1n).toString(16);
  t('refused while a transaction is pending', /pending/.test((await etapeSuivante(R0, rpc, W, { N: null, hashes: [] })).raison));
  c.noncePending = null; c.chainId = '0x1';
  t('refused on another network', /Base/.test((await etapeSuivante(R0, rpc, W, { N: null, hashes: [] })).raison));
  c.chainId = '0x2105';
  c.nonceLatest = '0x' + (N + 2n).toString(16);
  r = await etapeSuivante(R0, rpc, W, { N: N.toString(), hashes: c.hashes.slice(0, 2) });
  t('step 3 uses P read from receipt 2, V and R predicted', r.pret && r.k === 2 && r.adr.P === c.recus[c.hashes[1]].contractAddress && r.data === creationEtape(R0, 2, p0), r.raison);
  c.nonceLatest = '0x' + (N + 3n).toString(16);
  r = await etapeSuivante(R0, rpc, W, { N: N.toString(), hashes: c.hashes.slice(0, 2) });
  t('RED: a stray transaction used nonce N+2: STOP, nothing offered', !r.pret && r.arret && /another transaction/.test(r.raison), r.raison);
  c.nonceLatest = '0x' + (N + 2n).toString(16);
  c.recus[c.hashes[1]].contractAddress = a(0x4242);
  r = await etapeSuivante(R0, rpc, W, { N: N.toString(), hashes: c.hashes.slice(0, 2) });
  t('RED: step 2 landed off-prediction: STOP before step 3', !r.pret && r.arret && /STOP at step 2/.test(r.raison), r.raison);
  c.recus[c.hashes[1]].contractAddress = p0.P;
  c.nonceLatest = '0x' + (N + 6n).toString(16);
  r = await etapeSuivante(R0, rpc, W, { N: N.toString(), hashes: c.hashes });
  t('after step 6: finished, verifier next', !r.pret && r.fini, r.raison);
  const ko1 = controleEtape(R0, 0, W, N, p0, c.txs[c.hashes[0]], c.recus[c.hashes[0]]);
  t('controleEtape green on a good step', ko1.length === 0, ko1.join());
}

/* ---------- 4. the CLI verifier against a local fake JSON-RPC (exit codes) ---------- */
{
  const dir = mkdtempSync(path.join(tmpdir(), 'pack-v2-'));
  const recFile = path.join(dir, 'record.mjs');
  writeFileSync(recFile, 'export const PACK_ECONOMIE_V2 = ' + JSON.stringify(R0) + ';\n');
  let courant = chaine(R0);
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', (d) => { b += d; });
    req.on('end', async () => { const j = JSON.parse(b); let out; try { out = { jsonrpc: '2.0', id: j.id, result: await courant.rpc(j.method, j.params) }; } catch (e) { out = { jsonrpc: '2.0', id: j.id, error: { message: String(e.message) } }; } res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(out)); });
  });
  await new Promise((o) => srv.listen(0, '127.0.0.1', o));
  const url = 'http://127.0.0.1:' + srv.address().port;
  const lancer = async (args) => {
    return new Promise((o) => { const p = spawn(process.execPath, [path.join(ICI, 'verifier-pack-economie-v2.mjs'), ...args], { env: { ...process.env, PACK_RPC: url, PACK_RECORD: recFile } });
      let s = ''; p.stdout.on('data', (d) => { s += d; }); p.stderr.on('data', (d) => { s += d; }); p.on('close', (code) => o({ code, s })); });
  };
  let r = await lancer(courant.c.hashes);
  t('CLI GREEN: exit 0 and ALL CHECKS HOLD', r.code === 0 && /ALL \d+ CHECKS HOLD/.test(r.s), r.code + ' ' + r.s.slice(-300));
  courant = chaine(R0, { f: (c) => { c.calls[c.p.T + '|' + selecteur('VAULT()')] = '0x' + wa(a(0x31)); } });
  r = await lancer(courant.c.hashes);
  t('CLI RED: exit 1 when T.VAULT() is not V', r.code === 1 && /KO  T \(TAM art\)\.VAULT\(\) = V/.test(r.s) && /PACK NOT VERIFIED/.test(r.s), r.code + ' ' + r.s.slice(-300));
  r = await lancer(courant.c.hashes.slice(0, 3));
  t('CLI: exit 2 without six hashes', r.code === 2);
  srv.close();
}
{
  const V = lire('verifier-pack-economie-v2.mjs');
  t('verifier is read-only: only five read methods are allowed', V.includes("const LECTURES = new Set(['eth_chainId', 'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_getCode', 'eth_call']);") && !/eth_send|personal_|eth_sign/.test(V.replace(/eth_chainId|eth_getTransactionByHash|eth_getTransactionReceipt|eth_getCode|eth_call/g, '')));
}

/* ---------- 5. the page itself ---------- */
const P = lire('deployer-economie-v2.html'), S = lire('serveur-web.js');
t('page imports the shared logic and the PACK record only', P.includes("import { predire, integrite, etapeSuivante, controleEtape, verifierPack, PRODUIT } from './pack-economie-v2.js';") && P.includes("await import('./economie-v2-pack-deploiement.js')") && !P.includes("'./economie-v2-deploiement.js'"));
t('page types no address', !/0x[0-9a-fA-F]{40}/.test(P));
t('page sends only what etapeSuivante prepared, at the predicted nonce', P.includes("rpc('eth_sendTransaction', [{ from: acct, data: r.data, nonce: r.nonce }])") && (P.match(/eth_sendTransaction/g) || []).length === 1);
t('page re-reads the chain before each signature', /const r = await rafraichir\(\);\r?\n  if \(!r\.pret\) return;/.test(P));
t('page checks every receipt against its prediction, STOP otherwise', P.includes('const ko = controleEtape(D, r.k, acct, BigInt(r.N), predire(acct, BigInt(r.N)), t, recu);') && P.includes("'<span class=\"warn\">STOP at step '"));
t('page refuses a fixture or a broken record (connect stays disabled)', P.includes("$('#connect').disabled = !!(faux.length || D.fixtureDeTest);"));
t('page refuses a wallet with code (smart wallet)', P.includes("if (code === null || (code !== '0x' && code !== '0x0'))"));
t('page runs the verifier after step 6', P.includes('const res = await verifierPack(D, etat.hashes, rpc);'));
t('page without a record says so and offers nothing', P.includes("'<span class=\"warn\">No deploy record here yet: nothing can be signed until it is generated"));
t('page storage wrapped in try/catch', P.includes("try { localStorage.setItem(cle(), JSON.stringify(etat)); } catch (_) {}") && P.includes("try { const j = JSON.parse(localStorage.getItem(cle()) || 'null');"));
t('page shows R PREDICTED at step 1 (before connecting: what Likes names; at step 1: the address and nonce N+5)', P.includes("row('step 1 names R', 'Hearts is built with rewards = R, the lock rewards address PREDICTED from the wallet and nonce N+5")
  && P.includes("(r.k === 0 ? '<br>Step 1 builds Hearts with rewards = R = <b>' + esc(r.adr.R) + '</b> (predicted: nonce ' + esc(BigInt(r.N) + 5n) + ' = N+5)."));
t('page says a heart counts in the lock rewards (games [L, T, S]) and V lists [T, S]', P.includes('AND in the lock rewards (games [L, T, S]') && P.includes('counts in the vault (games [T, S], hearts read from L)') && !P.includes('Only the two listed games'));
{
  const { c, rpc } = chaine(R0);
  c.nonceLatest = '0x' + N.toString(16);
  const r = await etapeSuivante(R0, rpc, W, { N: null, hashes: [] });
  t('step 1 offered with R predicted at N+5 inside the Likes creation', r.pret && r.adr.R === adresseCreate(W, N + 5n) && r.data.endsWith(wa(adresseCreate(W, N + 5n))), r.raison);
  const old = resigner(clone(R0)); old.etapes[0].args.pop(); resigner(old);
  t('RED: page flow refuses a record whose Likes does not name R', /integrity MISMATCH: L does not name R/.test((await etapeSuivante(old, rpc, W, { N: null, hashes: [] })).raison));
}
t('served: record and logic', S.includes("'deployer-economie-v2.html', 'economie-v2-pack-deploiement.js', 'pack-economie-v2.js',"));
/* 2026-11-12: the stale two-signature record is no longer served at all, so no page can offer it (test-deployer-economie-v2-20261111.mjs) */
{
  const bloc = (S.match(/const SERVIS\s*=\s*\[([\s\S]*?)\];/) || [])[1] || '';
  const servis = new Set([...bloc.matchAll(/'([^']+)'/g)].map((m) => m[1]));
  t('served list read (witness: the pack page is in it)', servis.size > 20 && servis.has('deployer-economie-v2.html'));
  t('the stale two-signature record is NOT served', !servis.has('economie-v2-deploiement.js'));
}
/* UI copy rule (Phil 2026-11-12): the visible copy names the product, never a version or an internal status */
{
  const vis = P.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/, '');
  t('copy witness: the stripped page still holds the heading', vis.includes('<h1>Deploy the holders economy (Base)</h1>'));
  t('copy: title, heading and intro carry no version word', !/\b[vV][0-9]\b|economy v2|TAM v2|Skins v3/.test(vis), (vis.match(/.{0,30}\b[vV][0-9]\b.{0,30}/) || [''])[0]);
  t('copy: no internal status words in the page', !/not deployed|under review|fork test|\bwritten\b/i.test(P.replace(/<!--[\s\S]*?-->/g, '')));
  t('copy: the page takes its product names from the shared module (one list for steps, button and check lines)', P.includes('const NOM = PRODUIT;'));
  t('copy: steps and the button name the product, not the contract', P.includes("esc(NOM[e.lettre])") && P.includes("'. Deploy ' + NOM[D.etapes[r.k].lettre]") && !P.includes('esc(e.nom)'));
}

/* ---------- 6. the real record, if generated ---------- */
if (existsSync(path.join(ICI, 'economie-v2-pack-deploiement.js'))) {
  const { PACK_ECONOMIE_V2: D } = await import('./economie-v2-pack-deploiement.js');
  t('real record: integrity', (await integrite(D)).length === 0);
  t('real record: not a test fixture, price read live', D.fixtureDeTest === false && /^live /.test(D.prix.source));
  t('real record: keeper neither DEV nor DEV2', D.parametres.keeper !== D.parametres.dev && D.parametres.keeper !== D.parametres.dev2);
  t('real record: Likes names R, V lists [T, S], R lists [L, T, S]', cablage(D).length === 0, cablage(D).join());
  /* game373 (2026-11-12): the values of THIS record, copied from the generation report (not recalled). The bytes themselves are deployed
   * at the deployer's real nonce on a Base fork by forge-pack/test/PackRecord.fork.t.sol; here only the record and the page flow. */
  const Pq = D.parametres, cfg = (l) => D.etapes[LETTRES.indexOf(l)].config;
  t('real record: sha256Pack is the generated one', D.sha256Pack === '5601fcb593503de87dd953e9e3c53758b66985c3ccea52a2c3a92212c8c0ffed', D.sha256Pack);
  t('real record: deployer = the wallet Grok signs with', D.deployeur === '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b', D.deployeur);
  t('real record: keeper = the one Phil gave, in Likes too', Pq.keeper === '0x1f0eb43b99272e78de0077ff0e38787d6c2bd23c' && cfg('L').keeper === Pq.keeper, Pq.keeper);
  t('real record: keeper is not the deployer', Pq.keeper !== D.deployeur);
  t('real record: guardian = DEV (Phil 2026-11-12)', Pq.guardian === Pq.dev);
  t('real record: TAM dev wallet = Skins fee wallet (Phil 2026-11-12)', Pq.tamDevWallet === Pq.skinsFeeWallet);
  t('real record: t0 = 1794441600 = 2026-11-12 00:00 UTC', Pq.t0 === '1794441600' && Pq.t0 === String(Date.UTC(2026, 10, 12) / 1000));
  t('real record: caps 1e18 wtCOIN and 5e25 TBLOCK', Pq.maxPotWtcoin === (10n ** 18n).toString() && Pq.maxPotTblock === (5n * 10n ** 25n).toString());
  t('real record: START = 5376574940901, the same in Likes', D.prix.startPriceE18 === '5376574940901' && cfg('L').startPrice === D.prix.startPriceE18);
  /* the page flow on the real record, on a fake chain where the deployer sits at nonce 187 (read live on 2026-11-12, block 56264643) */
  const dep = D.deployeur, NR = 187n, pr = predire(dep, NR);
  const flux = (latest, pending, extra = {}) => async (m, params) => {
    if (m === 'eth_chainId') return '0x2105';
    if (m === 'eth_getTransactionCount') return '0x' + (params[1] === 'pending' ? pending : latest).toString(16);
    if (m === 'eth_getTransactionByHash') return (extra.txs || {})[params[0]] || null;
    if (m === 'eth_getTransactionReceipt') return (extra.recus || {})[params[0]] || null;
    throw new Error('unexpected ' + m);
  };
  const e1 = await etapeSuivante(D, flux(NR, NR), dep, { N: null, hashes: [] });
  t('real record: step 1 offered to the deployer at nonce 187, Likes at the predicted address, R predicted in its data',
    e1.pret === true && e1.k === 0 && e1.N === '187' && e1.nonce === '0xbb' && e1.attendu === pr.L && e1.data === creationEtape(D, 0, { R: pr.R }) && e1.data.endsWith(wa(pr.R)), e1.raison);
  t('real record: another wallet is refused', /is not the pack deployer/.test((await etapeSuivante(D, flux(NR, NR), Pq.keeper, { N: null, hashes: [] })).raison || ''));
  t('real record: a pending transaction is refused', /pending transaction/.test((await etapeSuivante(D, flux(NR, NR + 1n), dep, { N: null, hashes: [] })).raison || ''));
  /* walk the six steps with receipts at the predicted addresses: each step's data = the frozen creation with the pack addresses so far */
  const txs = {}, recus = {}, hs = [];
  let tous = true;
  for (let k = 0; k < 6; k++) {
    const e = await etapeSuivante(D, flux(NR + BigInt(k), NR + BigInt(k), { txs, recus }), dep, { N: k ? '187' : null, hashes: hs.slice() });
    const attendu = creationEtape(D, k, { ...Object.fromEntries(LETTRES.slice(0, k).map((l) => [l, pr[l]])), V: pr.V, R: pr.R });
    if (!(e.pret && e.k === k && e.attendu === pr[LETTRES[k]] && e.data === attendu)) { tous = false; console.log('  step', k + 1, e.raison || 'data/address mismatch'); break; }
    const h = '0x' + sha('real-record-step' + k);
    txs[h] = { hash: h, from: dep, to: null, nonce: e.nonce, input: e.data };
    recus[h] = { transactionHash: h, status: '0x1', contractAddress: pr[LETTRES[k]] };
    hs.push(h);
  }
  const fin = await etapeSuivante(D, flux(NR + 6n, NR + 6n, { txs, recus }), dep, { N: '187', hashes: hs });
  t('real record: the six steps walk through at nonces 187..192, then the page says run the verifier', tous && fin.fini === true, fin.raison);
} else { skip++; console.log('SKIPPED: economie-v2-pack-deploiement.js not generated yet (decided 2026-11-12: guardian DEV, TAM dev = Skins fee wallet, t0, caps; missing: the keeper, a NEW wallet Phil creates)'); }

/* ---------- 7. the FIXTURE record (PACK_FIXTURE_RECORD=<path>), built with the values Phil decided on 2026-11-12 and a FAKE keeper ---------- */
if (process.env.PACK_FIXTURE_RECORD) {
  const { pathToFileURL } = await import('node:url');
  const { PACK_ECONOMIE_V2: F } = await import(pathToFileURL(path.resolve(process.env.PACK_FIXTURE_RECORD)).href);
  const Pq = F.parametres, cfg = (l) => F.etapes[LETTRES.indexOf(l)].config;
  t('fixture: integrity and wiring (L names R, V [T, S], R [L, T, S])', (await integrite(F)).length === 0, (await integrite(F)).join());
  t('fixture: marked fixtureDeTest', F.fixtureDeTest === true);
  t('fixture: guardian = DEV (Phil 2026-11-12)', Pq.guardian === Pq.dev && cfg('R').guardian === Pq.dev);
  t('fixture: TAM dev wallet = the Skins fee wallet (Phil 2026-11-12)', Pq.tamDevWallet === Pq.skinsFeeWallet && cfg('T').devWallet === Pq.skinsFeeWallet && cfg('S').feeWallet === Pq.skinsFeeWallet);
  t('fixture: t0 = 2026-11-12 00:00 UTC = Date.UTC(2026, 10, 12) / 1000', Pq.t0 === String(Date.UTC(2026, 10, 12) / 1000) && Pq.t0 === '1794441600' && cfg('R').t0 === Pq.t0);
  t('fixture: caps 1 wtCOIN (1e18 raw) and 50,000,000 TBLOCK (5e25 raw)', Pq.maxPotWtcoin === (10n ** 18n).toString() && Pq.maxPotTblock === (5n * 10n ** 25n).toString());
  t('fixture: keeper is a clearly FAKE address (30+ leading zero hex digits), neither DEV nor DEV2', /^0x0{30}/.test(Pq.keeper) && Pq.keeper !== Pq.dev && Pq.keeper !== Pq.dev2, Pq.keeper);
  t('fixture: deployer is a clearly FAKE address', /^0x0{30}/.test(F.deployeur), F.deployeur);
  const { c, rpc } = chaine(R0);
  c.nonceLatest = '0x' + N.toString(16);
  t('fixture: the page flow refuses it (TEST FIXTURE)', /TEST FIXTURE/.test((await etapeSuivante(F, rpc, F.deployeur, { N: null, hashes: [] })).raison));
  t('fixture: the verifier refuses it', echoue(await verifierPack(F, c.hashes, rpc), 'not a test fixture'));
} else { skip++; console.log('SKIPPED: fixture record checks (set PACK_FIXTURE_RECORD=<path to the fixture economie-v2-pack-deploiement.js>)'); }

console.log(ok + '/' + (ok + ko) + (skip ? ' (+' + skip + ' skipped)' : '') + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
