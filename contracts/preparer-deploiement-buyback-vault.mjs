/* preparer-deploiement-buyback-vault.mjs -- FREEZES the deployment transaction of TBlockBuybackVault (the buyback that pays vault V).
 * THIS SCRIPT SIGNS NOTHING AND SENDS NOTHING. It writes one record (SORTIE, default ../tblock-buyback-vault-deploiement.js) that
 *   deployer-tblock-buyback-vault.html offers to the CONNECTED wallet; banc-buyback-vault-fork-20261112.mjs sends THIS data on a fork.
 * Every address is copied from a tree record, never typed here:
 *   pools, tokens, hook, numbers  <- tblock-buyback-deploiement.js parametres (the live TBlockBuyback's tested config)
 *   dest                          <- economie-v2-pack-deploye.js, letter V (the holders vault, read from its receipt). The record does
 *                                    NOT copy it: parametres.dest is '@V' and the creation is stored as creationModele with '@V' in place
 *                                    of the dest word; buyback-vault.js resoudre() puts V back from economie-v2-pack-deploye.js (the ONE
 *                                    record of the pack addresses, test-noter-pack-economie-v2: no other file carries them).
 *   guardian, veto (= dev2)       <- economie-v2-pack-deploiement.js parametres
 *   keeper                        <- economie-v2-pack-deploiement.js parametres.keeper (the keeper Phil gave for the pack: ONE server
 *                                    keeper for the whole economy); env KEEPER=0x... overrides it. It must differ from guardian and veto.
 *   deployeur (the ONLY wallet the deploy page accepts) <- economie-v2-pack-deploiement.js deployeur (Grok's wallet, = V.DEV2() on chain)
 * pret is true (Phil 2026-11-12: "fait le bon buyback qui alimente le bon vault"); PRET=0 writes pret:false. adresse/bloc/tx stay null:
 *   only contracts/noter-deploiement-buyback-vault.mjs fills them, from the receipt, after verifierBuybackVault holds on two nodes.
 * Also frozen: the runtime the chain must hold (size, sha256 with the immutable slots zeroed, the slots from the forge artifact), so the
 *   page and the verifier compare the deployed code with THIS build. No forge build is run here: the artifact is read as it is.
 * Usage (from contracts/): node preparer-deploiement-buyback-vault.mjs   (env SORTIE=path, KEEPER=0x..., PRET=0, CAST=cast binary) */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.join(ICI, '..');
const imp = (f) => import(pathToFileURL(path.join(RACINE, f)).href);
const { BUYBACK_DEPLOIEMENT: OLD } = await imp('tblock-buyback-deploiement.js');
const { PACK_ECONOMIE_V2: PACK } = await imp('economie-v2-pack-deploiement.js');
const { ADRESSES_PACK_ECONOMIE_V2: ADR } = await imp('economie-v2-pack-deploye.js');
const isAdr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a));
if (PACK.fixtureDeTest !== false) throw new Error('the pack record is a test fixture: its addresses are not the live ones');
if (!isAdr(PACK.deployeur)) throw new Error('no deployer in the pack record');
const KEEPER = String(process.env.KEEPER || PACK.parametres.keeper || '');
if (!isAdr(KEEPER)) throw new Error('no keeper: neither KEEPER=0x... nor economie-v2-pack-deploiement.js parametres.keeper');
const o = OLD.parametres, q = PACK.parametres;
export const PARAMS = Object.freeze({
  poolManager: o.poolManager, v4Key: o.v4Key, v3Pool: o.v3Pool, weth: o.weth, wtcoin: o.wtcoin, tblock: o.tblock,
  keeper: KEEPER.toLowerCase(),
  publicDelay: o.publicDelay, maxPerCall: o.maxPerCall, minSpend: o.minSpend, cooldown: o.cooldown, twapWindow: o.twapWindow,
  maxV3DevTicks: o.maxV3DevTicks, maxV4ImpactTicks: o.maxV4ImpactTicks, maxHookPpm: o.maxHookPpm, tipBps: o.tipBps, maxTip: o.maxTip,
  dest: ADR.V, guardian: q.guardian, veto: q.dev2,
});
const P = PARAMS;
for (const k of ['poolManager', 'v3Pool', 'weth', 'wtcoin', 'tblock', 'keeper', 'dest', 'guardian', 'veto']) if (!isAdr(P[k])) throw new Error('bad address ' + k);
const low = (a) => String(a).toLowerCase();
if (low(P.keeper) === low(P.guardian) || low(P.keeper) === low(P.veto) || low(P.veto) === low(P.guardian)) throw new Error('keeper, guardian and veto must be three different keys');
if (low(P.guardian) !== low(q.dev)) throw new Error('the guardian is not the pack DEV wallet');
const art = JSON.parse(fs.readFileSync(path.join(ICI, 'out/TBlockBuybackVault.sol/TBlockBuybackVault.json'), 'utf8'));
const code = String(art.bytecode.object);
if (!/^0x[0-9a-f]+$/.test(code)) throw new Error('bytecode missing in the forge artifact');
const ctor = (art.abi.find((x) => x.type === 'constructor') || {}).inputs || [];
if (ctor.length !== 1 || ctor[0].type !== 'tuple') throw new Error('constructor shape differs from the one encoded here');
// the signature is READ from the ABI (not typed): each component name must match a PARAMS key, in order
const typ = (c) => (c.type === 'tuple' ? '(' + c.components.map(typ).join(',') + ')' : c.type);
const names = ctor[0].components.map((c) => c.name);
const want = ['poolManager', 'v4Key', 'v3Pool', 'weth', 'wtcoin', 'tblock', 'keeper', 'publicDelay', 'maxPerCall', 'minSpend', 'cooldown',
  'twapWindow', 'maxV3DevTicks', 'maxV4ImpactTicks', 'maxHookPpm', 'tipBps', 'maxTip', 'dest', 'guardian', 'veto'];
if (names.join(',') !== want.join(',')) throw new Error('constructor fields differ: ' + names.join(','));
const SIG = 'constructor(' + typ(ctor[0]) + ')';
const val = (v) => (Array.isArray(v) ? '(' + v.join(',') + ')' : String(v));
const tuple = '(' + want.map((k) => val(P[k])).join(',') + ')';
const CAST = process.env.CAST || 'cast';
const args = execFileSync(CAST, ['abi-encode', SIG, tuple]).toString().trim();
if (!/^0x[0-9a-f]+$/.test(args)) throw new Error('cast abi-encode failed');
const src = fs.readFileSync(path.join(ICI, 'src/buyback/TBlockBuybackVault.sol'));
const creation = code + args.slice(2);
const meta = typeof art.metadata === 'string' ? JSON.parse(art.metadata) : art.metadata || {};
/* the frozen runtime: the artifact's deployed code (immutable slots are zero there), the slots [start, length] sorted */
const runtime = String((art.deployedBytecode || {}).object || '').toLowerCase();
if (!/^0x[0-9a-f]+$/.test(runtime)) throw new Error('deployed bytecode missing in the forge artifact');
const immutables = Object.values(art.deployedBytecode.immutableReferences || {}).flat().map((r) => [r.start, r.length]).sort((a, b) => a[0] - b[0]);
if (!immutables.length) throw new Error('no immutable references in the forge artifact');
let masque = runtime.slice(2);
for (const [st, l] of immutables) masque = masque.slice(0, 2 * st) + '0'.repeat(2 * l) + masque.slice(2 * (st + l));
if (masque !== runtime.slice(2)) throw new Error('the artifact runtime has non-zero immutable slots: not the template expected');
const srcMeta = Object.entries(meta.sources || {}).find(([k]) => /TBlockBuybackVault\.sol$/.test(k));
if (!srcMeta) throw new Error('the artifact metadata does not name TBlockBuybackVault.sol');
/* the dest word = the 3rd word from the end (dest, guardian, veto): replaced by the marker, nowhere else in the data */
const motV = String(ADR.V).toLowerCase().slice(2).padStart(64, '0');
const finV = creation.length - 3 * 64;
if (creation.slice(finV, finV + 64) !== motV || creation.split(motV).length !== 2) throw new Error('the dest word is not exactly once, at its place');
const modele = creation.slice(0, finV) + '@V' + creation.slice(finV + 64);
const PARAMS_REC = { ...PARAMS, dest: '@V' };
const out = `/* tblock-buyback-vault-deploiement.js -- GENERATED by contracts/preparer-deploiement-buyback-vault.mjs. DO NOT EDIT BY HAND.
 * The UNSIGNED deployment transaction of TBlockBuybackVault (buys TBLOCK, pays vault V). Nothing here signs or sends. */
export const BUYBACK_VAULT_DEPLOIEMENT = Object.freeze({
  chaine: 8453,
  contrat: 'TBlockBuybackVault',
  compilateur: ${JSON.stringify((meta.compiler || {}).version || null)},
  constructeur: ${JSON.stringify(SIG)},
  parametres: Object.freeze(${JSON.stringify(PARAMS_REC)}),
  deployeur: ${JSON.stringify(low(PACK.deployeur))},
  sha256Pack: ${JSON.stringify(PACK.sha256Pack)},
  keccakSourceMeta: ${JSON.stringify(srcMeta[1].keccak256)},
  sha256Source: '${crypto.createHash('sha256').update(src).digest('hex')}',
  sha256Creation: '${crypto.createHash('sha256').update(creation).digest('hex')}',
  octetsCreation: ${(creation.length - 2) / 2},
  runtimeOctets: ${(runtime.length - 2) / 2},
  runtimeSha256Masque: '${crypto.createHash('sha256').update(masque).digest('hex')}',
  immutables: ${JSON.stringify(immutables)},
  pret: ${process.env.PRET === '0' ? 'false' : 'true'},
  /* filled ONLY by contracts/noter-deploiement-buyback-vault.mjs, from the receipt read on two nodes */
  adresse: null,
  bloc: null,
  tx: null,
  /* the creation data with '@V' where the holders vault address goes (buyback-vault.js resoudre()); sha256Creation is of the full data */
  creationModele: '${modele}',
});
`;
if (out.toLowerCase().includes(String(ADR.V).toLowerCase().slice(2))) throw new Error('the record would carry the holders vault address');
const sortie = process.env.SORTIE || path.join(RACINE, 'tblock-buyback-vault-deploiement.js');
fs.writeFileSync(sortie, out);
console.log('written', sortie, 'bytes', (creation.length - 2) / 2, 'sha256', crypto.createHash('sha256').update(creation).digest('hex'), 'keeper', P.keeper);
