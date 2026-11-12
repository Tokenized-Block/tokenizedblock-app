/* test-deployer-skins-spin-20261112.mjs — THE DEPLOY PAGE OF THE 1 USDC SKINS AND THE NEW SPIN, its logic against a fake chain.
 * WHY: the page offers two signatures to Grok's wallet. It must offer EXACTLY the frozen creations, at nonces N and N+1, from that wallet
 *   only, AFTER simulating each one; and stop at the first receipt that is not what was frozen.
 * A  EXECUTED  etapeSuivante refuses: another wallet, a test fixture, a record already noted, another chain, a pending transaction, code
 *              already at the predicted address, a simulation that reverts, a simulation that answers other code, a gas estimate that fails.
 * B  EXECUTED  step 1 is offered from the deployer: nonce N, data = the frozen Skins creation, gas estimated, at CREATE(deployer, N), and
 *              only after eth_call of that exact creation FROM the deployer answered the frozen runtime.
 * C  EXECUTED  after a good step 1 receipt: step 2 (Spin) at N+1; a receipt of another nonce, another sender, another address, other data,
 *              status 0, or other code at the address -> STOP (arret), nothing more offered; both done -> fini.
 * D  EXECUTED  verifierPaire on the fake chain: every line holds; one wrong view (the Skins price 10 USDC) -> NOT VERIFIED.
 * E  SOURCE    the page: imports skins-spin.js and the record only; one eth_sendTransaction with the offered data, nonce and gas; the
 *              integrity is checked before Connect; no internal jargon on screen (not deployed / under review / fork test / v2 / v3 / V8).
 * SKINS_SPIN_MODULE: a mutated copy of skins-spin.js (muter-skins-spin.mjs). Counts itself and prints n/n. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { selecteur } from './keccak.js';
import { createHash } from 'node:crypto';
const require256 = (hex) => createHash('sha256').update(Buffer.from(hex.slice(2), 'hex')).digest('hex');
const ICI = dirname(fileURLToPath(import.meta.url));
const SS = await import(process.env.SKINS_SPIN_MODULE ? pathToFileURL(process.env.SKINS_SPIN_MODULE).href : pathToFileURL(join(ICI, 'skins-spin.js')).href);
const { SKINS_SPIN_DEPLOIEMENT: R } = await import(pathToFileURL(join(ICI, 'skins-spin-deploiement.js')).href);
const { adresseCreate } = await import(pathToFileURL(join(ICI, 'pack-economie-v2.js')).href);
let n = 0, ko = 0;
const t = (label, cond) => { n += 1; if (cond === true) console.log('  ok   ' + label); else { ko += 1; console.log('  KO   ' + label); } };
const clone = (o) => JSON.parse(JSON.stringify(o));
/* 2026-11-13 the real record is NOTED (both deployed, nonceN 214): the page must offer nothing on it. The page logic (A to D) is exercised on
 *   a COPY with adresse / tx / bloc / nonceN reset to null (NUL = the record as the page had it before the deploys, same deploy data). */
const NUL = (() => { const x = clone(R); x.nonceN = null; for (const e of x.etapes) { e.adresse = null; e.tx = null; e.bloc = null; } return x; })();
const hx =(x) => '0x' + BigInt(x).toString(16);
const u = (x) => BigInt(x).toString(16).padStart(64, '0');
const ua = (a) => String(a).toLowerCase().slice(2).padStart(64, '0');
const art = (s, nom) => JSON.parse(readFileSync(join(ICI, 'contracts', 'out', s, nom + '.json'), 'utf8'));
const RUNTIME = { skins: art('BlockSkins1.sol', 'BlockSkinsRouter').deployedBytecode.object, spin: art('BlockSlotsRouter.sol', 'BlockSlotsRouter').deployedBytecode.object };
const W = R.deployeur, N0 = 400;
const autre = (code) => code.slice(0, 12) + (code.slice(12, 14) === '00' ? '01' : '00') + code.slice(14); /* one byte changed at offset 5, outside every immutable */

function chaine(o = {}) {
  const ch = { chainId: 8453, latest: N0, pending: N0, code: new Map(), txs: new Map(), recus: new Map(), simuleFn: null, gasJette: false, vues: new Map(), sim: [] };
  Object.assign(ch, o);
  ch.rpc = async (m, p) => {
    switch (m) {
      case 'eth_chainId': return hx(ch.chainId);
      case 'eth_getTransactionCount': return hx(p[1] === 'pending' ? ch.pending : ch.latest);
      case 'eth_getCode': return ch.code.get(String(p[0]).toLowerCase()) || '0x';
      case 'eth_call': {
        const x = p[0];
        if (!x.to) { ch.sim.push(x); if (ch.simuleFn) return ch.simuleFn(x); const k = x.data === SS.creationEtape(R, 0) ? 'skins' : x.data === SS.creationEtape(R, 1) ? 'spin' : null; if (!k) throw new Error('execution reverted'); return RUNTIME[k]; }
        const v = ch.vues.get(String(x.to).toLowerCase() + ':' + x.data);
        if (v === undefined) throw new Error('execution reverted');
        return v;
      }
      case 'eth_estimateGas': if (ch.gasJette) throw new Error('gas required exceeds allowance'); return hx(p[0].data === SS.creationEtape(R, 0) ? 4452166 : 2601768);
      case 'eth_getTransactionByHash': return ch.txs.get(p[0]) || null;
      case 'eth_getTransactionReceipt': return ch.recus.get(p[0]) || null;
      default: throw new Error('unexpected ' + m);
    }
  };
  /* mines step k as sent by `de` at nonce `nonce`, the contract at `ou`, with `code` there */
  ch.miner = (k, { de = W, nonce = N0 + k, ou = null, data = SS.creationEtape(R, k), status = '0x1', code = RUNTIME[R.etapes[k].cle] } = {}) => {
    const h = '0x' + String(k + 1).repeat(64).slice(0, 64);
    const a = (ou || adresseCreate(W, N0 + k)).toLowerCase();
    ch.txs.set(h, { hash: h, from: de, to: null, nonce: hx(nonce), input: data, blockNumber: hx(56600000 + k) });
    ch.recus.set(h, { transactionHash: h, status, contractAddress: a, blockNumber: hx(56600000 + k) });
    ch.code.set(a, code);
    ch.latest = nonce + 1; ch.pending = nonce + 1;
    return h;
  };
  return ch;
}

console.log('— A. refusals before anything is offered');
const ref = async (rec, ch, w = W, etat = { N: null, hashes: [] }) => (await SS.etapeSuivante(rec, ch.rpc, w, etat));
t('A another wallet is refused (only the record\'s deployer)', /is not the deployer/.test((await ref(NUL, chaine(), '0x' + '44'.repeat(20))).raison));
t('A a test fixture is refused', /TEST FIXTURE/.test((await ref({ ...clone(NUL), fixtureDeTest: true }, chaine())).raison));
t('A a record that already names a contract is refused', (await ref((() => { const x = clone(NUL); x.etapes[0].adresse = adresseCreate(W, 1); return x; })(), chaine())).pret === false);
t('A a tampered record is refused (integrity)', /integrity MISMATCH/.test((await ref((() => { const x = clone(NUL); x.etapes[0].config.feeWallet = '0x' + '11'.repeat(20); return x; })(), chaine())).raison));
t('A another chain is refused', /switch the wallet to Base/.test((await ref(NUL, chaine({ chainId: 1 }))).raison));
t('A a pending transaction is refused', /pending transaction/.test((await ref(NUL, chaine({ pending: N0 + 1 }))).raison));
{ const ch = chaine(); ch.code.set(adresseCreate(W, N0), '0x60'); const r = await ref(NUL, ch); t('A code already at the predicted address: STOP', r.pret === false && r.arret === true && /code already/.test(r.raison)); }
{ const ch = chaine({ simuleFn: () => { throw new Error('execution reverted: BadAddress()'); } }); t('A a simulation that reverts: nothing offered', /fails in simulation/.test((await ref(NUL, ch)).raison)); }
{ const ch = chaine({ simuleFn: () => autre(RUNTIME.skins) }); t('A a simulation answering other code: nothing offered', /does not answer the frozen runtime/.test((await ref(NUL, ch)).raison)); }
{ const ch = chaine({ gasJette: true }); t('A a gas estimate that fails: nothing offered', /gas could not be estimated/.test((await ref(NUL, ch)).raison)); }
{
  const ch = chaine();
  const r = await SS.etapeSuivante(R, ch.rpc, W, { N: null, hashes: [] });
  t('A the REAL record (noted 2026-11-13, nonceN 214) is done: nothing to sign, fini, no simulation run', r.pret === false && r.fini === true && /already names deployed contracts/.test(r.raison) && ch.sim.length === 0
    && R.nonceN === 214 && R.etapes.every((e, k) => e.adresse === adresseCreate(W, 214 + k).toLowerCase()));
  t('A (control) the same call on NUL from the same chain offers step 1: the refusal above is the note, nothing else', (await SS.etapeSuivante(NUL, chaine().rpc, W, { N: null, hashes: [] })).pret === true);
}

console.log('— B. step 1 offered');
const ch = chaine();
const r1 = await ref(NUL, ch);
t('B step 1 ready, nonce N, at CREATE(deployer, N)', r1.pret === true && r1.k === 0 && r1.nonce === hx(N0) && r1.attendu === adresseCreate(W, N0).toLowerCase());
t('B its data = the frozen Skins creation (the fork-tested bytes: sha256 9c9cd793…3e32)', r1.data === SS.creationEtape(R, 0) && require256(r1.data) === '9c9cd793bdd034fa06c98a819c6dff12140721fc0bf9dec04f444e2ef6cb3e32');
t('B simulated FROM the deployer with that exact data before it is offered', ch.sim.length === 1 && ch.sim[0].from === W && ch.sim[0].data === r1.data);
t('B gas estimated (4,452,166 stub) and sent with 20 % margin', r1.gas === '4452166' && r1.gasEnvoi === hx(4452166n * 12n / 10n));

console.log('— C. step 2, and every STOP');
{
  const h1 = ch.miner(0);
  const r2 = await ref(NUL, ch, W, { N: r1.N, hashes: [h1] });
  t('C after a good step 1: step 2 (Spin) at N+1, its frozen creation', r2.pret === true && r2.k === 1 && r2.nonce === hx(N0 + 1) && r2.data === SS.creationEtape(R, 1) && r2.attendu === adresseCreate(W, N0 + 1).toLowerCase());
  const h2 = ch.miner(1);
  const r3 = await ref(NUL, ch, W, { N: r1.N, hashes: [h1, h2] });
  t('C both done: fini, nothing more offered', r3.pret === false && r3.fini === true);
  t('C controleEtape holds on both receipts', SS.controleEtape(NUL, 0, W, N0, ch.txs.get(h1), ch.recus.get(h1)).length === 0 && SS.controleEtape(NUL, 1, W, N0, ch.txs.get(h2), ch.recus.get(h2)).length === 0);
}
const stop = async (opts, quoi) => { const c = chaine(); const h = c.miner(0, opts); const r = await ref(NUL, c, W, { N: String(N0), hashes: [h] }); t('C STOP: ' + quoi, r.pret === false && r.arret === true); };
await stop({ nonce: N0 + 1 }, 'step 1 mined at another nonce');
await stop({ de: '0x' + '55'.repeat(20) }, 'step 1 signed by another wallet');
await stop({ ou: '0x' + '66'.repeat(20) }, 'step 1 landed at another address');
await stop({ data: SS.creationEtape(R, 1) }, 'step 1 carried other data');
await stop({ status: '0x0' }, 'step 1 failed (status 0)');
await stop({ code: autre(RUNTIME.skins) }, 'other code at the step 1 address');
{ const c = chaine(); const h = c.miner(0); c.latest = N0 + 2; c.pending = N0 + 2; const r = await ref(NUL, c, W, { N: String(N0), hashes: [h] }); t('C another transaction used nonce N+1: STOP', r.pret === false && r.arret === true && /another transaction/.test(r.raison)); }

console.log('— D. the read-only checks');
{
  const c = chaine();
  const h1 = c.miner(0), h2 = c.miner(1);
  const S = adresseCreate(W, N0).toLowerCase(), B = adresseCreate(W, N0 + 1).toLowerCase();
  const res = (c) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, SS.resoudre(v)]));
  const X = res(R.existants), K = res(R.etapes[0].config), G = res(R.etapes[1].config);
  const vue = (to, sig, val, arg = '') => c.vues.set(to.toLowerCase() + ':' + selecteur(sig) + arg, '0x' + val);
  vue(S, 'MINT_PRICE()', u(K.mintPriceUsdc)); vue(S, 'PRICE_USDC()', u(K.mintPriceUsdc)); vue(S, 'ROUTER()', ua(X.router)); vue(S, 'DEST()', ua(X.vault)); vue(S, 'VAULT()', ua(X.vault));
  vue(S, 'TBLOCK()', ua(X.tblock)); vue(S, 'USDC()', ua(X.usdc)); vue(S, 'FEE_WALLET()', ua(K.feeWallet)); vue(S, 'USDC_SPLIT()', ua(K.feeWallet) + u(K.devBps)); vue(S, 'owner()', ua(W));
  vue(X.vault, 'isGame(address)', u(0), ua(S)); vue(X.vault, 'isGame(address)', u(0), ua(B)); vue(X.vault, 'ROUTER()', ua(X.router)); vue(X.router, 'TBLOCK()', ua(X.tblock));
  vue(B, 'USDC()', ua(G.usdc)); vue(B, 'DEV_WALLET()', ua(G.devWallet)); vue(B, 'SPIN_PRICE()', u(G.spinPrice)); vue(B, 'POT_SHARE_BPS()', u(G.potShareBps)); vue(B, 'TO_POT()', u(G.toPot));
  vue(B, 'DEV_SHARE()', u(G.devShare)); vue(B, 'prizes()', G.prizes.map(u).join('')); vue(B, 'ROUTER()', ua(X.router)); vue(B, 'DEST()', ua(X.vault)); vue(B, 'TBLOCK()', ua(X.tblock));
  vue(B, 'MIN_DEV_BATCH()', u(G.minDevBatch)); vue(B, 'MAX_DEV_BATCH()', u(G.maxDevBatch)); vue(B, 'PRICE_USDC()', u(0)); vue(B, 'USDC_SPLIT()', ua(G.devWallet) + u(G.devBps));
  const v = await SS.verifierPaire(NUL, [h1, h2], c.rpc);
  t('D every check holds on the fake chain (' + v.lignes.length + ' lines)', v.ok === true && v.lignes.length >= 30);
  vue(S, 'MINT_PRICE()', u(10_000_000));
  const v2 = await SS.verifierPaire(NUL, [h1, h2], c.rpc);
  t('D the Skins price read as 10 USDC -> NOT VERIFIED, that line named', v2.ok === false && v2.lignes.filter((l) => !l.ok).map((l) => l.quoi).join() === 'Skins.MINT_PRICE() = 1000000 (1 USDC)');
  vue(S, 'MINT_PRICE()', u(K.mintPriceUsdc)); vue(X.vault, 'isGame(address)', u(1), ua(B));
  t('D the vault listing the Spin -> NOT VERIFIED', (await SS.verifierPaire(NUL, [h1, h2], c.rpc)).ok === false);
}

console.log('— E. the page source');
const P = readFileSync(join(ICI, 'deployer-skins-spin.html'), 'utf8');
const scripts = [...P.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
const imports = [...scripts.matchAll(/(?:from\s*|import\()\s*['"](\.\/[^'"]+)['"]/g)].map((m) => m[1]).sort();
/* game387: + frais-creation.js, for displayShort only: the fee wallet is never shown whole on the page */
t('E the page imports only skins-spin.js, the record and frais-creation.js', imports.join() === './frais-creation.js,./skins-spin-deploiement.js,./skins-spin.js');
t('E the fee and dev wallets are shown through displayShort', scripts.includes("(k === 'feeWallet' || k === 'devWallet') ? displayShort(v)") && scripts.includes("import { displayShort } from './frais-creation.js';"));
t('E ONE eth_sendTransaction, with the offered data, nonce and gas, from the connected deployer', (scripts.match(/eth_sendTransaction/g) || []).length === 1 && /eth_sendTransaction', \[\{ from: acct, data: r\.data, nonce: r\.nonce, gas: r\.gasEnvoi, value: '0x0' \}\]/.test(scripts));
t('E a fresh etapeSuivante (reads + simulation) right before the wallet opens', /const r = await rafraichir\(\); \/\* fresh reads and a fresh simulation right before the wallet opens \*\//.test(scripts));
t('E Connect stays off when the integrity fails, on a fixture, or once noted', /\$\('#connect'\)\.disabled = !!\(faux\.length \|\| D\.fixtureDeTest \|\| deja\)/.test(scripts));
t('E after each receipt: controleEtape and the code at the address checked', /controleEtape\(D, r\.k, acct/.test(scripts) && /codeConforme\(D\.etapes\[r\.k\], code\)/.test(scripts));
const ecran = P.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const visibles = [...ecran.matchAll(/'([^'\n]*)'/g)].map((m) => m[1]).join(' | ') + ' | ' + ecran.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
t('E no internal jargon on screen (not deployed / under review / fork test / v2 / v3 / V8)', !/not deployed|under review|fork test|\bv2\b|\bv3\b|\bV8\b/i.test(visibles));
t('E the products are named Skins and Spin', /Deploy Skins and Spin/.test(P) && SS.PRODUIT.skins === 'Skins' && SS.PRODUIT.spin === 'Spin');
t('E the page file has no CR byte', !P.includes('\r'));
console.log(n - ko + '/' + n + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
