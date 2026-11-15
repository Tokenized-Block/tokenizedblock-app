/* preparer-deploiement-lp-lock.mjs -- FREEZES the deployment transaction of TBlockLPLock (lock a full-range TBLOCK/wtCOIN v4 position,
 *   its fees shared among the lockers who play). Derived from preparer-deploiement-lock-weekly.mjs (R2): same record shape, same checks.
 * THIS SCRIPT SIGNS NOTHING AND SENDS NOTHING. It writes one record (SORTIE, default ../lp-lock-deploiement.js) that deployer-lp-lock.html
 *   offers to the CONNECTED wallet; test-lp-lock-deploiement.mjs checks it against the forge artifact and, on a LOCAL fork, runs it.
 * Every address is copied from a tree record, never typed here:
 *   pm (Uniswap v4 PositionManager)  <- etat-naissance.js POSITION_MANAGER
 *   pool key + poolId                <- tblock-hold.js TBLOCK_POOL (poolId recomputed from the key here: keccak256(abi.encode(key)))
 *   vault (V)                        <- economie-v2-pack-deploye.js letter V. NOT copied into the record: '@V' marker in creationModele,
 *                                       lp-lock.js resoudre() puts V back (same rule as lock-weekly-deploiement.js)
 *   guardian                         <- lock-weekly-deploiement.js parametres.guardian (the guardian R2 uses = the pack DEV wallet)
 *   rewards (R2)                     <- lock-weekly-deploiement.js adresse (R2 as noted from its receipt)
 *   deployeur (the ONLY wallet the page accepts) <- lock-weekly-deploiement.js deployeur (the wallet that deployed R2)
 * MIN_L (minimum liquidity of a lockable position): see MESURE_MIN_L below, measured on a local fork of Base, not recalled.
 * pret is FALSE by default: Phil's go makes it true (PRET=1), after the review. adresse/bloc/tx stay null until noted from the receipt.
 * Usage (from contracts/, after forge build): node preparer-deploiement-lp-lock.mjs   (env SORTIE=path, PRET=1, CAST=cast binary) */
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
const { LOCK_WEEKLY_DEPLOIEMENT: R2 } = await imp('lock-weekly-deploiement.js');
const { POSITION_MANAGER } = await imp('etat-naissance.js');
const { TBLOCK_POOL, poolIdOfKey } = await imp('tblock-hold.js');
const isAdr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a));
const low = (a) => String(a).toLowerCase();
if (PACK.fixtureDeTest !== false) throw new Error('the pack record is a test fixture');
if (R2.pret !== true || !isAdr(R2.adresse) || !R2.tx) throw new Error('R2 is not noted as deployed in lock-weekly-deploiement.js');

/* MIN_L: measured 2026-11-15 on a LOCAL base-anvil fork of Base at block 57,790,949 (StateView.getSlot0(poolId), tblock-hold.js
 *   tblockUsdAt: wtCOIN/USD = median of 3 CL pools). Full range (ticks +-887220): amount0 = L / sqrtP, amount1 = L * sqrtP (the range
 *   ends change these by < 1e-19), so a position worth $X holds $X/2 per side and L = (X/2 / wtcoinUsd) * 1e18 * sqrtP.
 *   sqrtPriceX96 = 425067379997598103438208097038988 (tick 171762), sqrtP = 5365.2, wtCOIN = $119.539, TBLOCK = $0.0000041529.
 *   L($5) = 112,203,962,126,130,577,408 (1.12e20) ; L($1) = 2.244e19 ; L($0.10) = 2.244e18.
 *   MIN_L = 2e19 = $0.89 at that price: dust under ~$0.89 is refused, a $5 position has 5.6x margin. For a fixed USD value
 *   L ~ 1 / sqrt(P_wtcoin * P_tblock): a $5 position stays lockable until that product rises about 31x (e.g. TBLOCK x31 against USD). */
export const MESURE_MIN_L = Object.freeze({
  bloc: 57790949, sqrtPriceX96: '425067379997598103438208097038988', tick: 171762, wtcoinUsd: 119.5391078214834, tblockUsd: 0.000004152920537515942,
  l5Usd: '112203962126130577408', l1Usd: '22440792425226113024', minL: '20000000000000000000', minLUsd: 0.89,
});

const K = TBLOCK_POOL;
export const PARAMS = Object.freeze({
  pm: low(POSITION_MANAGER), currency0: low(K.currency0), currency1: low(K.currency1), fee: Number(K.fee), tickSpacing: Number(K.tickSpacing),
  hooks: low(K.hooks), poolId: low(K.poolId), vault: low(ADR.V), guardian: low(R2.parametres.guardian), minL: MESURE_MIN_L.minL,
  rewards: low(R2.adresse),
});
const P = PARAMS;
for (const k of ['pm', 'currency0', 'currency1', 'hooks', 'vault', 'guardian', 'rewards']) if (!isAdr(P[k])) throw new Error('bad address ' + k);
if (low(poolIdOfKey(K)) !== P.poolId) throw new Error('poolId is not keccak256(abi.encode(key))');
if (low(P.guardian) !== low(PACK.parametres.dev)) throw new Error('the guardian is not the pack DEV wallet');
if (low(P.currency0) !== low(PACK.existants.wtcoin) || low(P.currency1) !== low(PACK.existants.tblock)) throw new Error('the pool is not wtCOIN/TBLOCK');
if (low(R2.deployeur) !== low(PACK.deployeur)) throw new Error('R2 deployer is not the pack deployer');
const art = JSON.parse(fs.readFileSync(path.join(ICI, 'out/TBlockLPLock.sol/TBlockLPLock.json'), 'utf8'));
const code = String(art.bytecode.object);
if (!/^0x[0-9a-f]+$/.test(code)) throw new Error('bytecode missing in the forge artifact');
const ctor = (art.abi.find((x) => x.type === 'constructor') || {}).inputs || [];
const want = ['pm', 'key', 'poolId', 'vault', 'guardian_', 'minL', 'rewards'];
if (ctor.map((c) => c.name).join(',') !== want.join(',')) throw new Error('constructor fields differ: ' + ctor.map((c) => c.name).join(','));
const typ = (c) => (c.type === 'tuple' ? '(' + c.components.map(typ).join(',') + ')' : c.type);
const SIG = 'constructor(' + ctor.map(typ).join(',') + ')';
if (SIG !== 'constructor(address,(address,address,uint24,int24,address),bytes32,address,address,uint128,address)') throw new Error('constructor types differ: ' + SIG);
const CAST = process.env.CAST || 'cast';
const cle = '(' + [P.currency0, P.currency1, P.fee, P.tickSpacing, P.hooks].join(',') + ')';
const args = execFileSync(CAST, ['abi-encode', SIG, P.pm, cle, P.poolId, P.vault, P.guardian, P.minL, P.rewards]).toString().trim();
if (!/^0x[0-9a-f]{704}$/.test(args)) throw new Error('cast abi-encode did not give 11 words');
const src = fs.readFileSync(path.join(ICI, 'src/TBlockLPLock.sol'));
const creation = code + args.slice(2);
const meta = typeof art.metadata === 'string' ? JSON.parse(art.metadata) : art.metadata || {};
const runtime = String((art.deployedBytecode || {}).object || '').toLowerCase();
if (!/^0x[0-9a-f]+$/.test(runtime)) throw new Error('deployed bytecode missing in the forge artifact');
if ((runtime.length - 2) / 2 > 24576) throw new Error('runtime is over the EIP-170 limit');
const immutables = Object.values(art.deployedBytecode.immutableReferences || {}).flat().map((r) => [r.start, r.length]).sort((a, b) => a[0] - b[0]);
if (!immutables.length) throw new Error('no immutable references in the forge artifact');
let masque = runtime.slice(2);
for (const [st, l] of immutables) masque = masque.slice(0, 2 * st) + '0'.repeat(2 * l) + masque.slice(2 * (st + l));
if (masque !== runtime.slice(2)) throw new Error('the artifact runtime has non-zero immutable slots');
const srcMeta = Object.entries(meta.sources || {}).find(([k]) => /TBlockLPLock\.sol$/.test(k));
if (!srcMeta) throw new Error('the artifact metadata does not name TBlockLPLock.sol');
/* the vault word = the 4th word from the end (vault, guardian, minL, rewards): replaced by the marker, nowhere else in the data */
const motV = low(ADR.V).slice(2).padStart(64, '0');
const finV = creation.length - 4 * 64;
if (creation.slice(finV, finV + 64) !== motV || creation.split(motV).length !== 2) throw new Error('the vault word is not exactly once, at its place');
const modele = creation.slice(0, finV) + '@V' + creation.slice(finV + 64);
const out = `/* lp-lock-deploiement.js -- GENERATED by contracts/preparer-deploiement-lp-lock.mjs. DO NOT EDIT BY HAND.
 * The UNSIGNED deployment transaction of TBlockLPLock (lock a full-range TBLOCK/wtCOIN position; its fees go to the lockers who play).
 * Nothing here signs or sends. */
export const LP_LOCK_DEPLOIEMENT = Object.freeze({
  chaine: 8453,
  contrat: 'TBlockLPLock',
  compilateur: ${JSON.stringify((meta.compiler || {}).version || null)},
  constructeur: ${JSON.stringify(SIG)},
  parametres: Object.freeze(${JSON.stringify({ ...PARAMS, vault: '@V' })}),
  /* how MIN_L was chosen (contracts/preparer-deploiement-lp-lock.mjs MESURE_MIN_L): read on a local fork of Base, not recalled */
  mesureMinL: Object.freeze(${JSON.stringify(MESURE_MIN_L)}),
  deployeur: ${JSON.stringify(low(R2.deployeur))},
  sha256Pack: ${JSON.stringify(PACK.sha256Pack)},
  sha256CreationR2: ${JSON.stringify(R2.sha256Creation)},
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
const sortie = process.env.SORTIE || path.join(RACINE, 'lp-lock-deploiement.js');
fs.writeFileSync(sortie, out);
console.log('written', sortie, 'bytes', (creation.length - 2) / 2, 'sha256', crypto.createHash('sha256').update(creation).digest('hex'), 'pret', process.env.PRET === '1');
