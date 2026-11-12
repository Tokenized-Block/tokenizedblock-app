/* preparer-deploiement-skins-spin.mjs — FREEZES the deploy data of the new Skins and the new Spin (Phil 2026-11-12), two contracts that
 *   ONE wallet (Grok's, the deployer of the economy pack) deploys in sequence:
 *     nonce N    Skins  BlockSkinsRouter  (src/BlockSkins1.sol)      router = P, feeWallet, dest = V, TBLOCK, USDC — 1 USDC a mint
 *     nonce N+1  Spin   BlockSlotsRouter  (src/BlockSlotsRouter.sol) the live Spin config, router = P, dest = V, TBLOCK, min/max dev batch
 * ⛔ THIS SCRIPT SIGNS NOTHING AND SENDS NOTHING. It writes <SKINS_SPIN_OUT_DIR>/skins-spin-deploiement.js (default: the app root, ..)
 *   with adresse / tx / bloc null for both steps and nonceN null; contracts/noter-deploiement-skins-spin.mjs fills them from the receipts.
 *   A record that already names a deployed contract is NEVER overwritten.
 * ⛔ NO ADDRESS IS TYPED HERE. Each one is COPIED from a record:
 *     P (TBLOCK payment router), V (holders vault) ......... economie-v2-pack-deploye.js (written from the six receipts); the record NAMES
 *                                                          them "@P" / "@V" (that file stays the only one carrying the pack's addresses)
 *     TBLOCK, USDC, the Skins fee wallet, the deployer ..... economie-v2-pack-deploiement.js (existants, parametres.skinsFeeWallet, deployeur)
 *     the Spin config (USDC, dev wallet, price, pot share, the 16 prizes) ... slots-deploiement.js (the live Spin, constructeur)
 *   The 1 USDC price and the 10 % split are READ from the sources (outils/generer-frais-contrats.mjs constantes), never typed.
 * The two Spin dev-batch bounds are Phil's choice and come from the environment, in raw USDC units (6 decimals), never defaulted:
 *   SPIN_MIN_DEV_BATCH=<raw> SPIN_MAX_DEV_BATCH=<raw> [SKINS_SPIN_OUT_DIR=<dir>] [SKINS_SPIN_TEST_FIXTURE=1] node preparer-deploiement-skins-spin.mjs
 *   (from contracts/, after forge build). The fork run of 2026-11-12 used 1000000 and 10000000; any other value changes the Spin bytes. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(ICI, '..');
const imp = (f) => import(pathToFileURL(path.join(APP, f)).href);
const { keccak256Hex } = await imp('keccak.js');
const { PACK_ECONOMIE_V2: PK } = await imp('economie-v2-pack-deploiement.js');
const { ADRESSES_PACK_ECONOMIE_V2: AP } = await imp('economie-v2-pack-deploye.js');
const { SLOTS_DEPLOIEMENT: SL } = await imp('slots-deploiement.js');
const { constantes } = await imp('outils/generer-frais-contrats.mjs');
const { texteRecord, encoderArgs, partsSpin, integrite, creationEtape, resoudre } = await imp('skins-spin.js');

const env = (k) => String(process.env[k] || '').trim();
const A = (x, quoi) => { const v = String(x || '').toLowerCase(); if (!/^0x[0-9a-f]{40}$/.test(v)) throw new Error(quoi + ': not an address: ' + x); return v; };
const FIXTURE = env('SKINS_SPIN_TEST_FIXTURE') === '1';
const P = A(AP.P, 'P (pack record)'), V = A(AP.V, 'V (pack record)');
if (resoudre('@P') !== P || resoudre('@V') !== V) throw new Error('skins-spin.js reads another P / V than the pack record');
const TBLOCK = A(PK.existants.tblock, 'TBLOCK'), USDC = A(PK.existants.usdc, 'USDC');
const FEE = A(PK.parametres.skinsFeeWallet, 'Skins fee wallet'), DEPLOYER = A(PK.deployeur, 'pack deployer');
if (DEPLOYER !== A(PK.parametres.dev2, 'pack dev2')) throw new Error('the pack deployer is not the pack dev2 wallet (Grok\'s): refused');
const c = SL.constructeur;
if (A(c.usdc, 'Spin USDC') !== USDC) throw new Error('the live Spin record names another USDC');
if (!/^0x[0-9a-f]{40}$/.test(String(SL.adresse || ''))) throw new Error('the live Spin record has no address: nothing to copy from');
const RCFG = PK.etapes.find((e) => e.lettre === 'P').config;
if (A(RCFG.usdc, 'router usdc') !== USDC || A(RCFG.tblock, 'router tblock') !== TBLOCK) throw new Error('the router config names other tokens');
const bornes = (k) => { const s = env(k); if (!/^[1-9]\d*$/.test(s)) throw new Error(k + ' is required (raw USDC units, > 0): Phil\'s choice, never defaulted'); return BigInt(s); };
const MIN = bornes('SPIN_MIN_DEV_BATCH'), MAX = bornes('SPIN_MAX_DEV_BATCH');
if (MIN > MAX) throw new Error('SPIN_MIN_DEV_BATCH > SPIN_MAX_DEV_BATCH');
if (MAX > BigInt(RCFG.maxUsdcPerPay)) throw new Error('SPIN_MAX_DEV_BATCH above the router cap ' + RCFG.maxUsdcPerPay + ' (the constructor would revert)');

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const shaOctets = (hex) => crypto.createHash('sha256').update(Buffer.from(hex.replace(/^0x/, ''), 'hex')).digest('hex');
const ctorNames = (a) => ((a.abi.find((x) => x.type === 'constructor') || {}).inputs || []).map((i) => i.name + ':' + (i.components || []).map((d) => d.name).join()).join('|');

function artefact(source, nom) {
  const a = JSON.parse(fs.readFileSync(path.join(ICI, 'out', path.basename(source), nom + '.json'), 'utf8'));
  const meta = typeof a.metadata === 'string' ? JSON.parse(a.metadata) : (a.metadata || {});
  const src = fs.readFileSync(path.join(ICI, source));
  if (src.includes(13)) throw new Error(source + ' has CR bytes');
  const kS = keccak256Hex(src), kA = String(((meta.sources || {})[source] || {}).keccak256 || '').toLowerCase();
  if (kS !== kA) throw new Error('STALE artifact for ' + source + ' (run forge build): artifact ' + kA + ', source ' + kS);
  const init = String(a.bytecode.object);
  if (!/^0x[0-9a-f]+$/.test(init) || init.includes('__$')) throw new Error(nom + ': unlinked or empty bytecode');
  const runtime = String(a.deployedBytecode.object).slice(2);
  const immutables = Object.values(a.deployedBytecode.immutableReferences || {}).flat().map((r) => [r.start, r.length]).sort((x, y) => x[0] - y[0]);
  for (const [s, l] of immutables) if (/[^0]/.test(runtime.slice(2 * s, 2 * (s + l)))) throw new Error(nom + ': immutable slot not zero in the artifact');
  const st = meta.settings || {};
  return { a, init, runtime, immutables, texte: src.toString('utf8'), sha256Source: sha(src),
    compilateur: (meta.compiler || {}).version || null, optimiseur: st.optimizer || null, evm: st.evmVersion || null };
}

const K = constantes(fs.readFileSync(path.join(ICI, 'src/BlockSkins1.sol'), 'utf8'), ['MINT_PRICE', 'DEV_BPS']);
const G = constantes(fs.readFileSync(path.join(ICI, 'src/BlockSlotsRouter.sol'), 'utf8'), ['DEV_BPS']);
const { toPot, devShare } = partsSpin(c);
const ETAPES = [
  { cle: 'skins', nom: 'BlockSkinsRouter', source: 'src/BlockSkins1.sol', ctor: 'router:|feeWallet:|dest:|expectedTblock:|expectedUsdc:',
    config: { router: '@P', feeWallet: FEE, dest: '@V', expectedTblock: TBLOCK, expectedUsdc: USDC, mintPriceUsdc: K.MINT_PRICE, devBps: K.DEV_BPS, owner: 'the deploying wallet' } },
  { cle: 'spin', nom: 'BlockSlotsRouter', source: 'src/BlockSlotsRouter.sol', ctor: 'c:usdc,devWallet,spinPrice,potShareBps,prizes|router:|dest:|expectedTblock:|minDevBatch:|maxDevBatch:',
    config: { usdc: USDC, devWallet: A(c.devWallet, 'Spin dev wallet'), spinPrice: String(c.spinPrice), potShareBps: Number(c.potShareBps), prizes: c.prizes.map(String),
      router: '@P', dest: '@V', expectedTblock: TBLOCK, minDevBatch: MIN.toString(), maxDevBatch: MAX.toString(), toPot: toPot.toString(), devShare: devShare.toString(), devBps: G.DEV_BPS } },
];

let compilateur = null, optimiseur = null, evm = null;
const etapes = ETAPES.map((e, i) => {
  const x = artefact(e.source, e.nom);
  if (ctorNames(x.a) !== e.ctor) throw new Error(e.nom + ' constructor shape differs: ' + ctorNames(x.a));
  if (compilateur && x.compilateur !== compilateur) throw new Error('two compilers');
  compilateur = x.compilateur; optimiseur = x.optimiseur; evm = x.evm;
  const args = encoderArgs(e.cle, e.config);
  const creation = creationEtape({ etapes: [{ init: x.init, args }] }, 0);
  return { cle: e.cle, nonce: 'N+' + i, nom: e.nom, source: 'contracts/' + e.source, sha256Source: x.sha256Source, config: e.config,
    init: x.init, args, sha256Modele: sha(x.init + '|' + args.join(',')), sha256Creation: shaOctets(creation), octetsCreation: (creation.length - 2) / 2,
    runtimeOctets: x.runtime.length / 2, runtimeSha256Masque: sha(x.runtime), immutables: x.immutables, adresse: null, tx: null, bloc: null };
});
const REC = {
  chaine: 8453, compilateur, optimiseur, evm, fixtureDeTest: FIXTURE, genereLe: new Date().toISOString(),
  deployeur: DEPLOYER,
  existants: { router: '@P', vault: '@V', tblock: TBLOCK, usdc: USDC },
  sources: { pack: PK.sha256Pack, packDeploye: 'economie-v2-pack-deploye.js', spinVivant: String(SL.adresse).toLowerCase(), spinRecord: 'slots-deploiement.js' },
  parametres: { skinsFeeWallet: FEE, spinDevWallet: A(c.devWallet, 'Spin dev wallet'), minDevBatch: MIN.toString(), maxDevBatch: MAX.toString(), devBatchSource: 'env SPIN_MIN_DEV_BATCH / SPIN_MAX_DEV_BATCH (Phil\'s choice)' },
  etapes, sha256Paire: sha(etapes.map((e) => e.sha256Modele).join(',')), nonceN: null,
};
const faux = await integrite(REC);
if (faux.length) throw new Error('the record fails its own integrity: ' + faux.join(', '));
const out = path.resolve(env('SKINS_SPIN_OUT_DIR') || APP, 'skins-spin-deploiement.js');
if (fs.existsSync(out)) {
  const vieux = fs.readFileSync(out, 'utf8');
  if (/"adresse": "0x/.test(vieux) || /"nonceN": \d/.test(vieux)) throw new Error(out + ' already names deployed contracts: never overwritten');
}
fs.writeFileSync(out, texteRecord(REC));
console.log((FIXTURE ? 'TEST FIXTURE ' : '') + 'written ' + out + ' · pair sha256 ' + REC.sha256Paire + ' · deployer ' + DEPLOYER);
for (const e of etapes) console.log('  ' + e.nonce + ' ' + e.cle.padEnd(5) + ' ' + e.nom.padEnd(17) + ' ' + e.octetsCreation + ' bytes · creation sha256 ' + e.sha256Creation + ' · source ' + e.sha256Source.slice(0, 16) + '…');
