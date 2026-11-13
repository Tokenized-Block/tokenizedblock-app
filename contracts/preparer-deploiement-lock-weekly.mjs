/* preparer-deploiement-lock-weekly.mjs -- FREEZES the deployment transaction of TBlockLockRewardsWeekly (R2, weekly lock rewards).
 * THIS SCRIPT SIGNS NOTHING AND SENDS NOTHING. It writes one record (SORTIE, default ../lock-weekly-deploiement.js) that
 *   deployer-lock-weekly.html offers to the CONNECTED wallet; banc-lock-weekly-fork-20261114.mjs sends THIS data on a fork.
 * Every address is copied from a tree record, never typed here:
 *   tblock, wtcoin, lock         <- economie-v2-pack-deploiement.js existants
 *   vault (V)                    <- economie-v2-pack-deploye.js letter V. The record does NOT copy it: the vault word of the creation is
 *                                   '@V' in creationModele and lock-weekly.js resoudre() puts V back (the pack addresses live in one file).
 *   guardian                     <- economie-v2-pack-deploiement.js parametres.guardian (the DEV wallet, = R.guardian() on chain)
 *   deployeur (the ONLY wallet the page accepts) <- economie-v2-pack-deploiement.js deployeur (Grok's wallet)
 * Caps: R's monthly caps (pack parametres.maxPotWtcoin / maxPotTblock) divided by 4, per week.
 * pret is FALSE by default: Phil's go makes it true (PRET=1), after the review. adresse/bloc/tx stay null until noted from the receipt.
 * Usage (from contracts/, after forge build): node preparer-deploiement-lock-weekly.mjs   (env SORTIE=path, PRET=1, CAST=cast binary) */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.join(ICI, '..');
const imp = (f) => import(pathToFileURL(path.join(RACINE, f)).href);
const { PACK_ECONOMIE_V2: PACK } = await imp('economie-v2-pack-deploiement.js');
const { ADRESSES_PACK_ECONOMIE_V2: ADR } = await imp('economie-v2-pack-deploye.js');
const isAdr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a));
const low = (a) => String(a).toLowerCase();
if (PACK.fixtureDeTest !== false) throw new Error('the pack record is a test fixture');
const X = PACK.existants, Q = PACK.parametres;
export const PARAMS = Object.freeze({
  tblock: low(X.tblock), wtcoin: low(X.wtcoin), lock: low(X.lock), vault: low(ADR.V), guardian: low(Q.guardian),
  maxPotWtcoin: (BigInt(Q.maxPotWtcoin) / 4n).toString(), maxPotTblock: (BigInt(Q.maxPotTblock) / 4n).toString(),
});
const P = PARAMS;
for (const k of ['tblock', 'wtcoin', 'lock', 'vault', 'guardian']) if (!isAdr(P[k])) throw new Error('bad address ' + k);
if (low(P.guardian) !== low(Q.dev)) throw new Error('the guardian is not the pack DEV wallet');
const art = JSON.parse(fs.readFileSync(path.join(ICI, 'out/TBlockLockRewardsWeekly.sol/TBlockLockRewardsWeekly.json'), 'utf8'));
const code = String(art.bytecode.object);
if (!/^0x[0-9a-f]+$/.test(code)) throw new Error('bytecode missing in the forge artifact');
const ctor = (art.abi.find((x) => x.type === 'constructor') || {}).inputs || [];
const want = ['tblock', 'wtcoin', 'lock', 'vault', 'guardian_', 'maxPotWtcoin', 'maxPotTblock'];
if (ctor.map((c) => c.name).join(',') !== want.join(',')) throw new Error('constructor fields differ: ' + ctor.map((c) => c.name).join(','));
const SIG = 'constructor(' + ctor.map((c) => c.type).join(',') + ')';
const CAST = process.env.CAST || 'cast';
const args = execFileSync(CAST, ['abi-encode', SIG, P.tblock, P.wtcoin, P.lock, P.vault, P.guardian, P.maxPotWtcoin, P.maxPotTblock]).toString().trim();
if (!/^0x[0-9a-f]{448}$/.test(args)) throw new Error('cast abi-encode did not give 7 words');
const src = fs.readFileSync(path.join(ICI, 'src/TBlockLockRewardsWeekly.sol'));
const creation = code + args.slice(2);
const meta = typeof art.metadata === 'string' ? JSON.parse(art.metadata) : art.metadata || {};
const runtime = String((art.deployedBytecode || {}).object || '').toLowerCase();
if (!/^0x[0-9a-f]+$/.test(runtime)) throw new Error('deployed bytecode missing in the forge artifact');
const immutables = Object.values(art.deployedBytecode.immutableReferences || {}).flat().map((r) => [r.start, r.length]).sort((a, b) => a[0] - b[0]);
if (!immutables.length) throw new Error('no immutable references in the forge artifact');
let masque = runtime.slice(2);
for (const [st, l] of immutables) masque = masque.slice(0, 2 * st) + '0'.repeat(2 * l) + masque.slice(2 * (st + l));
if (masque !== runtime.slice(2)) throw new Error('the artifact runtime has non-zero immutable slots');
const srcMeta = Object.entries(meta.sources || {}).find(([k]) => /TBlockLockRewardsWeekly\.sol$/.test(k));
if (!srcMeta) throw new Error('the artifact metadata does not name TBlockLockRewardsWeekly.sol');
/* the vault word = the 4th word from the end (vault, guardian, maxW, maxT): replaced by the marker, nowhere else in the data */
const motV = low(ADR.V).slice(2).padStart(64, '0');
const finV = creation.length - 4 * 64;
if (creation.slice(finV, finV + 64) !== motV || creation.split(motV).length !== 2) throw new Error('the vault word is not exactly once, at its place');
const modele = creation.slice(0, finV) + '@V' + creation.slice(finV + 64);
const out = `/* lock-weekly-deploiement.js -- GENERATED by contracts/preparer-deploiement-lock-weekly.mjs. DO NOT EDIT BY HAND.
 * The UNSIGNED deployment transaction of TBlockLockRewardsWeekly (weekly lock rewards). Nothing here signs or sends. */
export const LOCK_WEEKLY_DEPLOIEMENT = Object.freeze({
  chaine: 8453,
  contrat: 'TBlockLockRewardsWeekly',
  compilateur: ${JSON.stringify((meta.compiler || {}).version || null)},
  constructeur: ${JSON.stringify(SIG)},
  parametres: Object.freeze(${JSON.stringify({ ...PARAMS, vault: '@V' })}),
  deployeur: ${JSON.stringify(low(PACK.deployeur))},
  sha256Pack: ${JSON.stringify(PACK.sha256Pack)},
  keccakSourceMeta: ${JSON.stringify(srcMeta[1].keccak256)},
  sha256Source: '${crypto.createHash('sha256').update(src).digest('hex')}',
  sha256Creation: '${crypto.createHash('sha256').update(creation).digest('hex')}',
  octetsCreation: ${(creation.length - 2) / 2},
  runtimeOctets: ${(runtime.length - 2) / 2},
  runtimeSha256Masque: '${crypto.createHash('sha256').update(masque).digest('hex')}',
  immutables: ${JSON.stringify(immutables)},
  pret: ${process.env.PRET === '1' ? 'true' : 'false'},
  /* filled ONLY from the receipt read on two nodes */
  adresse: null,
  bloc: null,
  tx: null,
  creationModele: '${modele}',
});
`;
if (out.toLowerCase().includes(low(ADR.V).slice(2))) throw new Error('the record would carry the holders vault address');
const sortie = process.env.SORTIE || path.join(RACINE, 'lock-weekly-deploiement.js');
fs.writeFileSync(sortie, out);
console.log('written', sortie, 'bytes', (creation.length - 2) / 2, 'sha256', crypto.createHash('sha256').update(creation).digest('hex'), 'pret', process.env.PRET === '1');
