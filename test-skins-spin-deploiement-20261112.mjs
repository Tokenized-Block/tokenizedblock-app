/* test-skins-spin-deploiement-20261112.mjs — THE FROZEN DEPLOY DATA OF THE 1 USDC SKINS AND THE NEW SPIN (skins-spin-deploiement.js).
 * WHY: Phil 2026-11-12, two contracts Grok's wallet deploys at nonces N and N+1. What the page offers must be EXACTLY the bytes the fork
 *   run deployed and exercised end to end (82 checks, FAILS=0): creation sha256 9c9cd793…3e32 (Skins, 22,211 bytes) and 8ac1360d…cd03
 *   (Spin, 15,554 bytes, with dev batches 1 to 10 USDC), every address copied from the records, never typed.
 * A  EXECUTED  the record = its ONE writer's text (texteRecord), = a fresh regeneration by the preparer (the generation time aside), and
 *              the preparer refuses to run without the two dev batch bounds (never defaulted).
 * B  EXECUTED  integrity holds; each creation's sha256 and size = the fork-tested bytes. 2026-11-13 the pair is DEPLOYED (Grok's wallet,
 *              nonces 214 and 215): nonceN = 214, each adresse = CREATE(deployer, 214 + k) (computed, never typed), the tx hashes and blocks
 *              the noter read from the receipts, and the app follows exactly those two. The pre-deploy branch stays covered on a COPY of the
 *              record with adresse / tx / bloc / nonceN reset to null (NUL): integrity holds, the app follows nothing (deployes -> null, null).
 * C  EXECUTED  every address and value comes from its record: P and V (economie-v2-pack-deploye.js), TBLOCK, USDC, the fee wallet and the
 *              deployer (economie-v2-pack-deploiement.js), the Spin config (slots-deploiement.js); the 1 USDC price and the 10 % from the
 *              sources (frais-contrats.js, the SAME sha256Source).
 * D  EXECUTED  the constructor words = `cast abi-encode` of the displayed values (an independent encoder; skipped and SAID without cast).
 * E  EXECUTED  integrity catches a tampered record: one displayed value, one word, the order, a batch bound.
 * F  EXECUTED  deployes(): only the CREATE address of (deployer, nonceN + k), with a tx hash and a whole block.
 * SKINS_SPIN_MODULE: a mutated copy of skins-spin.js (muter-skins-spin.mjs). The test counts itself and prints n/n. */
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const ICI = dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(join(ICI, f)).href);
const SS = await import(process.env.SKINS_SPIN_MODULE ? pathToFileURL(process.env.SKINS_SPIN_MODULE).href : pathToFileURL(join(ICI, 'skins-spin.js')).href);
const { SKINS_SPIN_DEPLOIEMENT: R } = await imp('skins-spin-deploiement.js');
const { PACK_ECONOMIE_V2: PK } = await imp('economie-v2-pack-deploiement.js');
const { ADRESSES_PACK_ECONOMIE_V2: AP } = await imp('economie-v2-pack-deploye.js');
const { SLOTS_DEPLOIEMENT: SL } = await imp('slots-deploiement.js');
const { FRAIS_CONTRATS: FC } = await imp('frais-contrats.js');
const { adresseCreate } = await imp('pack-economie-v2.js');
let n = 0, ko = 0;
const t = (label, cond) => { n += 1; if (cond === true) console.log('  ok   ' + label); else { ko += 1; console.log('  KO   ' + label); } };
const clone = (o) => JSON.parse(JSON.stringify(o));
/* the record as it was BEFORE the noter (adresse / tx / bloc / nonceN null): the pre-deploy branch, kept covered on a copy */
const NUL = (() => { const x = clone(R); x.nonceN = null; for (const e of x.etapes) { e.adresse = null; e.tx = null; e.bloc = null; } return x; })();
const castOk = (() => { try { execFileSync('cast', ['--version'], { stdio: 'ignore' }); return true; } catch (_) { return false; } })();

console.log('— A. one writer, a fresh regeneration');
const texte = readFileSync(join(ICI, 'skins-spin-deploiement.js'), 'utf8');
t('A the record text = texteRecord(record) (no hand edit)', texte === SS.texteRecord(R));
t('A the record has no CR byte', !texte.includes('\r'));
{
  const dir = mkdtempSync(join(tmpdir(), 'skspin-'));
  try {
    const env = { ...process.env, SPIN_MIN_DEV_BATCH: R.parametres.minDevBatch, SPIN_MAX_DEV_BATCH: R.parametres.maxDevBatch, SKINS_SPIN_OUT_DIR: dir };
    const r = spawnSync(process.execPath, [join(ICI, 'contracts', 'preparer-deploiement-skins-spin.mjs')], { env, encoding: 'utf8' });
    const neuf = r.status === 0 ? readFileSync(join(dir, 'skins-spin-deploiement.js'), 'utf8') : '';
    const sansDate = (s) => s.replace(/"genereLe": "[^"]*"/, '"genereLe": "-"');
    t('A a fresh regeneration (same bounds) is byte for byte the record before the noter (NUL), the generation time aside', r.status === 0 && sansDate(neuf) === sansDate(SS.texteRecord(NUL)));
    t('A the noter changed nothing but adresse / tx / bloc / nonceN (NUL with those four written back = the record text)', (() => { const y = clone(NUL); y.nonceN = R.nonceN;
      y.etapes.forEach((e, k) => { e.adresse = R.etapes[k].adresse; e.tx = R.etapes[k].tx; e.bloc = R.etapes[k].bloc; }); return SS.texteRecord(y) === texte; })());
    const sans = spawnSync(process.execPath, [join(ICI, 'contracts', 'preparer-deploiement-skins-spin.mjs')], { env: { ...env, SPIN_MAX_DEV_BATCH: '' }, encoding: 'utf8' });
    t('A without SPIN_MAX_DEV_BATCH the preparer refuses (Phil\'s choice, never defaulted)', sans.status !== 0 && /SPIN_MAX_DEV_BATCH is required/.test(sans.stderr));
    const trop = spawnSync(process.execPath, [join(ICI, 'contracts', 'preparer-deploiement-skins-spin.mjs')], { env: { ...env, SPIN_MAX_DEV_BATCH: String(BigInt(PK.etapes[1].config.maxUsdcPerPay) + 1n) }, encoding: 'utf8' });
    t('A a max dev batch above the router cap is refused (the constructor would revert)', trop.status !== 0 && /router cap/.test(trop.stderr));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

console.log('— B. integrity, the fork-tested bytes, the deployed pair (and, on a copy, nothing deployed)');
t('B integrity holds (sha256 of both creations and of the pair; words = displayed config)', (await SS.integrite(R)).length === 0);
t('B Skins creation = the fork-tested bytes (sha256 9c9cd793…3e32, 22,211 bytes)', R.etapes[0].sha256Creation === '9c9cd793bdd034fa06c98a819c6dff12140721fc0bf9dec04f444e2ef6cb3e32' && R.etapes[0].octetsCreation === 22211);
t('B Spin creation = the fork-tested bytes (sha256 8ac1360d…cd03, 15,554 bytes)', R.etapes[1].sha256Creation === '8ac1360d9a403baad86294d81684f189b3435b4b52e031af21340c08b7cacd03' && R.etapes[1].octetsCreation === 15554);
t('B two steps, Skins at N then Spin at N+1', R.etapes.map((e) => e.cle + e.nonce).join() === 'skinsN+0,spinN+1');
t('B (copy NUL) adresse, tx, bloc and nonceN null: integrity still holds (same deploy data)', NUL.etapes.every((e) => e.adresse === null && e.tx === null && e.bloc === null) && NUL.nonceN === null && (await SS.integrite(NUL)).length === 0);
t('B deployed: nonceN = 214 (Grok\'s wallet: Skins at 214, Spin at 215)', R.nonceN === 214);
t('B deployed: each adresse = CREATE(deployer, 214 + k), computed, never typed', R.etapes.every((e, k) => e.adresse === adresseCreate(R.deployeur, 214 + k).toLowerCase()) && R.etapes[0].adresse !== R.etapes[1].adresse);
t('B deployed: Skins block 56675741, Spin block 56675860', R.etapes[0].bloc === 56675741 && R.etapes[1].bloc === 56675860);
t('B deployed: the two creation tx hashes the noter read from the receipts', R.etapes[0].tx === '0xb3ac35c22567a16dbf28504b48bd084c56c77c43de1c4a0cde9c3ce463c48cad'
  && R.etapes[1].tx === '0xdf8fbe78565b0d7488563618c3315527ed9263d7b817e3481c4316a567628ebe');
t('B not a test fixture', R.fixtureDeTest === false);
t('B (copy NUL) the app follows nothing (deployes: null, null)', JSON.stringify(SS.deployes(NUL)) === '{"skins":null,"spin":null}');
{
  const d = SS.deployes(R);
  t('B deployed: the app follows exactly the two recorded contracts, with their blocks and txs', !!(d.skins && d.spin) && d.skins.adresse === R.etapes[0].adresse && d.spin.adresse === R.etapes[1].adresse
    && d.skins.bloc === 56675741 && d.spin.bloc === 56675860 && d.skins.tx === R.etapes[0].tx && d.spin.tx === R.etapes[1].tx);
}
t('B compiler 0.8.24, optimizer 200 runs, cancun (as the fork run)', R.compilateur === '0.8.24+commit.e11b9ed9' && R.optimiseur && R.optimiseur.runs === 200 && R.evm === 'cancun');

console.log('— C. every value from its record');
const [K0, G0] = R.etapes.map((e) => e.config);
const res = (c) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, SS.resoudre(v)]));
const [K, G] = [res(K0), res(G0)];
const ADRS = (readFileSync(join(ICI, 'skins-spin-deploiement.js'), 'utf8').toLowerCase().match(/0x[0-9a-f]{40}(?![0-9a-f])/g) || []);
t('C deployer = the pack deployer (Grok\'s wallet, = the pack dev2)', R.deployeur === PK.deployeur && PK.deployeur === PK.parametres.dev2 && R.deployeur === '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b');
t('C router and vault are NAMED @P / @V in the record (the pack record stays the only file carrying them)', R.existants.router === '@P' && R.existants.vault === '@V' && K0.router === '@P' && K0.dest === '@V' && G0.router === '@P' && G0.dest === '@V');
t('C @P / @V read = P and V of the pack record', SS.resoudre('@P') === AP.P && SS.resoudre('@V') === AP.V && K.router === AP.P && G.dest === AP.V);
t('C no pack address appears in the record text', !ADRS.some((a) => Object.values(AP).includes(a)) && !Object.values(AP).some((a) => readFileSync(join(ICI, 'skins-spin-deploiement.js'), 'utf8').toLowerCase().includes(a.slice(2))));
t('C TBLOCK and USDC = the pack\'s', K.expectedTblock === PK.existants.tblock && G.expectedTblock === PK.existants.tblock && K.expectedUsdc === PK.existants.usdc && G.usdc === PK.existants.usdc);
t('C Skins fee wallet = the pack\'s Skins fee wallet', K.feeWallet === PK.parametres.skinsFeeWallet);
t('C Spin price, pot share, dev wallet and 16 prizes = the live Spin record', G.spinPrice === String(SL.constructeur.spinPrice) && G.potShareBps === SL.constructeur.potShareBps
  && G.devWallet === SL.constructeur.devWallet && G.prizes.join() === SL.constructeur.prizes.map(String).join());
t('C Skins price 1 USDC and 10 % = the source (frais-contrats.js BlockSkinsUn, the same sha256Source)', K.mintPriceUsdc === '1000000' && K.mintPriceUsdc === FC.BlockSkinsUn.MINT_PRICE && K.devBps === FC.BlockSkinsUn.DEV_BPS && R.etapes[0].sha256Source === FC.BlockSkinsUn.sha256Source);
t('C Spin 10 % = the source (frais-contrats.js BlockSlotsRouter, the same sha256Source)', G.devBps === FC.BlockSlotsRouter.DEV_BPS && R.etapes[1].sha256Source === FC.BlockSlotsRouter.sha256Source);
t('C TO_POT 250000 and DEV_SHARE 250000 (0.50 USDC at 50 %)', G.toPot === '250000' && G.devShare === '250000');
t('C dev batch bounds 1 to 10 USDC (the fork run\'s, from the environment)', G.minDevBatch === '1000000' && G.maxDevBatch === '10000000' && R.parametres.maxDevBatch === G.maxDevBatch);

console.log('— D. the words = cast abi-encode of the displayed values');
if (!castOk) console.log('  (cast not found: D skipped, said)');
else {
  const sk = execFileSync('cast', ['abi-encode', 'c(address,address,address,address,address)', K.router, K.feeWallet, K.dest, K.expectedTblock, K.expectedUsdc], { encoding: 'utf8' }).trim().slice(2);
  t('D Skins constructor words = cast abi-encode', sk === SS.creationEtape(R, 0).slice(R.etapes[0].init.length));
  const cfg = '(' + [G.usdc, G.devWallet, G.spinPrice, G.potShareBps, '[' + G.prizes.join(',') + ']'].join(',') + ')';
  const sp = execFileSync('cast', ['abi-encode', 'c((address,address,uint256,uint16,uint64[16]),address,address,address,uint256,uint256)', cfg, G.router, G.dest, G.expectedTblock, G.minDevBatch, G.maxDevBatch], { encoding: 'utf8' }).trim().slice(2);
  t('D Spin constructor words = cast abi-encode', sp === SS.creationEtape(R, 1).slice(R.etapes[1].init.length));
}

console.log('— E. a tampered record is caught');
const faux = async (f) => { const x = clone(R); f(x); return (await SS.integrite(x)).length > 0; };
/* the same, but every sha256 RE-SEALED after the change (template, creation, pair): only the rule under test can catch it */
const shaT = (s) => createHash('sha256').update(s).digest('hex');
const resceller = (x) => { for (const [k, e] of x.etapes.entries()) { e.sha256Modele = shaT(e.init + '|' + e.args.join(',')); const c = SS.creationEtape(x, k); e.sha256Creation = createHash('sha256').update(Buffer.from(c.slice(2), 'hex')).digest('hex'); e.octetsCreation = (c.length - 2) / 2; }
  x.sha256Paire = shaT(x.etapes.map((e) => e.sha256Modele).join(',')); return x; };
const fauxScelle = async (f) => { const x = clone(R); f(x); resceller(x); return (await SS.integrite(x)).length > 0; };
t('E (control) a re-sealed UNCHANGED record holds: the re-sealing alone is never the catch', (await SS.integrite(resceller(clone(R)))).length === 0);
t('E a displayed fee wallet changed (words unchanged) -> mismatch', await faux((x) => { x.etapes[0].config.feeWallet = '0x' + '11'.repeat(20); }));
t('E a displayed max dev batch changed -> mismatch', await faux((x) => { x.etapes[1].config.maxDevBatch = '50000000'; }));
t('E one constructor word changed -> mismatch', await faux((x) => { x.etapes[0].args[1] = '0'.repeat(24) + '11'.repeat(20); }));
t('E one byte of the code changed -> mismatch', await faux((x) => { x.etapes[1].init = x.etapes[1].init.slice(0, -2) + (x.etapes[1].init.endsWith('00') ? '01' : '00'); }));
t('E the two steps swapped -> mismatch', await faux((x) => { x.etapes.reverse(); }));
t('E a router other than the record\'s -> mismatch', await faux((x) => { x.existants.router = '0x' + '22'.repeat(20); }));
t('E the router typed as an address (even the right one), re-sealed -> mismatch: it must be named @P', await fauxScelle((x) => { x.etapes[0].config.router = AP.P; x.etapes[0].args = SS.encoderArgs('skins', x.etapes[0].config); }));
t('E an unknown reference -> mismatch', await faux((x) => { x.etapes[1].args[21] = '@Q'; }));
t('E a frozen creation sha256 changed (the bytes WITH P and V read from the pack record) -> mismatch', await faux((x) => { x.etapes[0].sha256Creation = '0'.repeat(64); }));
t('E dev batch bounds min > max, re-sealed -> mismatch', await fauxScelle((x) => { x.etapes[1].config.minDevBatch = '20000000'; x.etapes[1].args = SS.encoderArgs('spin', x.etapes[1].config); }));

console.log('— F. what the app may follow');
const noted = (f = () => {}) => { const x = clone(R); x.nonceN = 300; x.etapes[0].adresse = adresseCreate(x.deployeur, 300); x.etapes[1].adresse = adresseCreate(x.deployeur, 301);
  x.etapes[0].tx = '0x' + 'aa'.repeat(32); x.etapes[1].tx = '0x' + 'bb'.repeat(32); x.etapes[0].bloc = 56600000; x.etapes[1].bloc = 56600005; f(x); return x; };
{
  const d = SS.deployes(noted());
  t('F the CREATE addresses of (deployer, 300) and (deployer, 301) are followed', d.skins && d.spin && d.skins.adresse === adresseCreate(R.deployeur, 300) && d.spin.adresse === adresseCreate(R.deployeur, 301) && d.skins.bloc === 56600000);
  t('F a hand-typed Skins address is refused (null)', SS.deployes(noted((x) => { x.etapes[0].adresse = '0x' + '33'.repeat(20); })).skins === null);
  t('F the addresses swapped are refused', (() => { const y = SS.deployes(noted((x) => { const a = x.etapes[0].adresse; x.etapes[0].adresse = x.etapes[1].adresse; x.etapes[1].adresse = a; })); return y.skins === null && y.spin === null; })());
  t('F another nonceN is refused', JSON.stringify(SS.deployes(noted((x) => { x.nonceN = 301; }))) === '{"skins":null,"spin":null}');
  t('F a missing tx hash or block is refused', SS.deployes(noted((x) => { x.etapes[1].tx = null; })).spin === null && SS.deployes(noted((x) => { x.etapes[0].bloc = 0; })).skins === null);
  t('F a test fixture is never followed', JSON.stringify(SS.deployes(noted((x) => { x.fixtureDeTest = true; }))) === '{"skins":null,"spin":null}');
}
console.log(n - ko + '/' + n + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
