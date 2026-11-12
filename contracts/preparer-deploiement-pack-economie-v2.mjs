/* preparer-deploiement-pack-economie-v2.mjs — FREEZES the deploy data of the whole economy v2 pack, six contracts that ONE wallet deploys in
 *   sequence (scratchpad pack-deploy-order.md, forge: forge-pack/test/PackBase.sol _deployPack):
 *     nonce N    L  BlockLikesV2       (Config with rewards = R: a heart is a play in the lock rewards, Phil 2026-11-12)
 *     nonce N+1  P  TblockPayRouter    (Config)
 *     nonce N+2  T  TamArtV2           (router = P, devWallet, dest = V, TBLOCK, USDC, rewards = R)
 *     nonce N+3  S  BlockSkins v3      (router = P, feeWallet, dest = V, TBLOCK, USDC, rewards = R)
 *     nonce N+4  V  TBlockVaultV2      (Config with likes = L, games = [T, S])
 *     nonce N+5  R  TBlockLockRewards  (tblock, wtcoin, lock, poolManager, guardian, t0, maxPotWtcoin, maxPotTblock, games = [L, T, S])
 *   L, P, T, S are read from the receipts by the page; V and R are PREDICTED from the wallet and N (CREATE address). A wrong prediction only
 *   reverts steps 5/6 (the vault and the rewards refuse a game that names another address); it never wires a game to a wrong address.
 * ⛔ THIS SCRIPT SIGNS NOTHING AND SENDS NOTHING. It writes <PACK_OUT_DIR>/economie-v2-pack-deploiement.js (default: the app root, ..).
 *   Addresses are words with a placeholder "@L" .. "@S"; the page and the verifier substitute them (pack-economie-v2.js creationEtape).
 * Every existing address is IMPORTED from the app module that already holds it (tblock-hold.js, multipool.js, lock-deploiement.js,
 *   block-contest-deploiement.js, blockskins-deploiement.js, economie-v2-deploiement.js), never typed here.
 * Usage (from contracts/): forge build, then
 *   PACK_DEPLOYER=0x.. LIKES_KEEPER=0x.. TAM_DEV_WALLET=0x.. LR_GUARDIAN=0x.. LR_T0=<unix 00:00 UTC> LR_MAX_POT_WTCOIN=<raw> \
 *   LR_MAX_POT_TBLOCK=<raw> [PACK_OUT_DIR=<dir>] node preparer-deploiement-pack-economie-v2.mjs
 *   Two NAMES instead of a typed address (Phil 2026-11-12: guardian = DEV, TAM dev wallet = the Skins fee wallet): LR_GUARDIAN=DEV takes
 *   economie-v2-deploiement.js vault.config.dev, TAM_DEV_WALLET=SKINS_FEE_WALLET takes blockskins-deploiement.js walletDesFrais.
 *   The START price is read LIVE from https://tokenizedblock.space/api/tblock/hold (x-ms-monitor: 1): the LOWER of priceNow and priceBefore,
 *   converted from the decimal TEXT of the response to an integer x 1e18 (truncated, no float). START_PRICE_E18 is accepted ONLY with
 *   PACK_TEST_FIXTURE=1, and such a record is marked fixtureDeTest: true, which the page refuses to deploy. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(ICI, '..');
const imp = (f) => import(pathToFileURL(path.join(APP, f)).href);
const { keccak256Hex } = await imp('keccak.js');
const HOLD = await imp('tblock-hold.js');
const { ADRESSES } = await imp('multipool.js');
const { LOCK_DEPLOIEMENT } = await imp('lock-deploiement.js');
const { CONTEST_DEPLOIEMENT } = await imp('block-contest-deploiement.js');
const { BLOCKSKINS_DEPLOIEMENT } = await imp('blockskins-deploiement.js');
const { ECONOMIE_V2_DEPLOIEMENT } = await imp('economie-v2-deploiement.js');

const A = (x, quoi) => { const v = String(x || '').toLowerCase(); if (!/^0x[0-9a-f]{40}$/.test(v)) throw new Error(quoi + ': not an address: ' + x); return v; };
const TBLOCK = A(HOLD.TBLOCK, 'TBLOCK');
const WTCOIN = A(HOLD.WTCOIN, 'WTCOIN');
const USDC = A(ADRESSES.USDC, 'USDC');
const POOL_MANAGER = A(ADRESSES.POOL_MANAGER, 'POOL_MANAGER');
const AERO_POOL = A(HOLD.WTCOIN_USDC_POOLS.find((p) => p.dex === 'Aerodrome Slipstream').address, 'AERO_POOL');
const KEY = HOLD.TBLOCK_POOL;
const LOCK = A(LOCK_DEPLOIEMENT.adresse, 'LOCK');
const CONTEST = A(CONTEST_DEPLOIEMENT.adresse, 'CONTEST');
const DEV = A(ECONOMIE_V2_DEPLOIEMENT.vault.config.dev, 'DEV');
const DEV2 = A(ECONOMIE_V2_DEPLOIEMENT.vault.config.dev2, 'DEV2');
const FEE_WALLET = A(BLOCKSKINS_DEPLOIEMENT.constructeur.walletDesFrais, 'Skins feeWallet');
if (LOCK_DEPLOIEMENT.tblock.toLowerCase() !== TBLOCK) throw new Error('lock record names another TBLOCK');
if (A(KEY.currency0, 'currency0') !== WTCOIN || A(KEY.currency1, 'currency1') !== TBLOCK) throw new Error('v4 key is not wtCOIN/TBLOCK');

const env = (k) => String(process.env[k] || '').trim();
const FIXTURE = env('PACK_TEST_FIXTURE') === '1';
const DEPLOYER = A(env('PACK_DEPLOYER'), 'PACK_DEPLOYER (the one wallet that signs the six deploys)');
const KEEPER = A(env('LIKES_KEEPER'), 'LIKES_KEEPER (a third key, review DT-1)');
if (KEEPER === DEV || KEEPER === DEV2) throw new Error('LIKES_KEEPER must differ from DEV and DEV2 (review DT-1)');
/* a NAME resolves to the address IMPORTED above (never typed); anything else must be a full address */
const TAM_DEV = env('TAM_DEV_WALLET') === 'SKINS_FEE_WALLET' ? FEE_WALLET : A(env('TAM_DEV_WALLET'), 'TAM_DEV_WALLET (an address, or SKINS_FEE_WALLET)');
const GUARDIAN = env('LR_GUARDIAN') === 'DEV' ? DEV : A(env('LR_GUARDIAN'), 'LR_GUARDIAN (an address, or DEV)');
const T0 = BigInt(env('LR_T0') || '0');
if (!(T0 > 0n) || T0 % 86400n !== 0n) throw new Error('LR_T0 must be a unix time at 00:00 UTC');
/* the rewards constructor reverts unless t0 <= block.timestamp <= t0 + 30 days; a revert at step 6 still uses nonce N+5 and costs a full redeploy of steps 1..6 (L, T and S all name R).
 * Here: t0 already passed, and at least 2 days of margin left for the signatures (a fixture may use any past t0). */
const NOW = BigInt(Math.floor(Date.now() / 1000));
if (T0 > NOW) throw new Error('LR_T0 is in the future: the rewards constructor would revert');
if (!FIXTURE && NOW - T0 > 28n * 86400n) throw new Error('LR_T0 is more than 28 days ago: step 6 could fall past t0 + 30 days and revert');
const POT_WT = BigInt(env('LR_MAX_POT_WTCOIN') || '0'), POT_TB = BigInt(env('LR_MAX_POT_TBLOCK') || '0');
if (!(POT_WT > 0n) || !(POT_TB > 0n)) throw new Error('LR_MAX_POT_WTCOIN and LR_MAX_POT_TBLOCK are required (raw units, > 0)');
for (const [k, v] of [['deployer', DEPLOYER], ['keeper', KEEPER], ['TAM devWallet', TAM_DEV], ['guardian', GUARDIAN]]) {
  if ([TBLOCK, WTCOIN, USDC, LOCK, CONTEST, POOL_MANAGER, AERO_POOL].includes(v)) throw new Error(k + ' is a token / contract of the pack');
}

/** decimal text -> integer x 1e18, truncated; no float anywhere */
export function decimalE18(txt) {
  const m = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(String(txt));
  if (!m) throw new Error('not a decimal: ' + txt);
  let ent = m[1], frac = m[2] || '';
  let exp = Number(m[3] || 0);
  let digits = ent + frac, point = ent.length + exp;
  if (point < 0) { digits = '0'.repeat(-point) + digits; point = 0; }
  if (point > digits.length) digits = digits + '0'.repeat(point - digits.length);
  const i = digits.slice(0, point) || '0', f = (digits.slice(point) + '0'.repeat(18)).slice(0, 18);
  return BigInt(i) * 10n ** 18n + BigInt(f);
}
let prix;
if (env('START_PRICE_E18')) {
  if (!FIXTURE) throw new Error('START_PRICE_E18 is only for a test fixture (PACK_TEST_FIXTURE=1); a real record reads the price live');
  prix = { startPriceE18: BigInt(env('START_PRICE_E18')).toString(), source: 'env (test fixture)', priceNow: null, priceBefore: null, bloc: null };
} else {
  const r = await fetch('https://tokenizedblock.space/api/tblock/hold', { headers: { 'x-ms-monitor': '1' } });
  const txt = await r.text();
  if (!r.ok) throw new Error('hold API ' + r.status);
  const champ = (k) => { const m = new RegExp('"' + k + '"\\s*:\\s*([0-9.eE+-]+)').exec(txt); if (!m) throw new Error('hold API: no ' + k); return m[1]; };
  if (!/"ok"\s*:\s*true/.test(txt)) throw new Error('hold API not ok: ' + txt.slice(0, 200));
  const now = champ('priceNow'), before = champ('priceBefore'), bloc = champ('block');
  const a = decimalE18(now), b = decimalE18(before);
  const start = a < b ? a : b;
  prix = { startPriceE18: start.toString(), source: 'live https://tokenizedblock.space/api/tblock/hold, lower of priceNow/priceBefore', priceNow: now, priceBefore: before, bloc: Number(bloc) };
}
const START = BigInt(prix.startPriceE18);
if (!(START > 0n)) throw new Error('START price is zero');

/* ---------- ABI words ---------- */
const w = (x) => { const v = BigInt(x); if (v < 0n || v >= 1n << 256n) throw new Error('word out of range'); return v.toString(16).padStart(64, '0'); };
const wa = (a) => A(a, 'word').slice(2).padStart(64, '0');
const REFS = ['@L', '@P', '@T', '@S', '@V', '@R'];
const arr = (headWords, items) => [w(BigInt(headWords + 1) * 32n), w(items.length), ...items];   /* one trailing dynamic address[] */

const art = (n) => JSON.parse(fs.readFileSync(path.join(ICI, 'out', n + '.sol', n + '.json'), 'utf8'));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const ctorNames = (a) => ((a.abi.find((x) => x.type === 'constructor') || {}).inputs || []).map((i) => i.name + ':' + (i.components || []).map((c) => c.name + (c.components ? '{' + c.components.map((d) => d.name).join() + '}' : '')).join());

const LIKES_CFG = { tblock: TBLOCK, lock: LOCK, genesis: 1794355200, epoch: 604800, likeUsdE18: (5n * 10n ** 17n).toString(), holdUsdE18: (15n * 10n ** 18n).toString(),
  priceFloor: (START / 50n).toString(), priceCeil: (START * 100n).toString(), startPrice: START.toString(), maxStepBps: 1000, minInterval: 3600, keeper: KEEPER, dev: DEV, dev2: DEV2,
  rewards: '@R' };
if (LIKES_CFG.genesis !== ECONOMIE_V2_DEPLOIEMENT.likes.config.genesis) throw new Error('genesis differs from the v2 record');
const ROUTER_CFG = { usdc: USDC, wtcoin: WTCOIN, tblock: TBLOCK, aeroPool: AERO_POOL, poolManager: POOL_MANAGER,
  v4Key: { currency0: WTCOIN, currency1: TBLOCK, fee: KEY.fee, tickSpacing: KEY.tickSpacing, hooks: A(KEY.hooks, 'hooks') }, v4PoolId: KEY.poolId,
  maxUsdcPerPay: 50_000_000, maxV4ImpactTicks: 300, maxHookPpm: 12_000, minOutBudgetPpm: 250_000, maxAeroImpactBps: 100, maxAeroFeePpm: 50_000 };
const keyEnc = [wa(WTCOIN), wa(TBLOCK), w(KEY.fee), w(KEY.tickSpacing), wa(KEY.hooks)].join('');
if (keccak256Hex(Buffer.from(keyEnc, 'hex')) !== KEY.poolId) throw new Error('v4PoolId != keccak256(abi.encode(v4Key))');
const VAULT_CFG = { tblock: TBLOCK, likes: '@L', contest: CONTEST, lock: LOCK, rewardBps: 5000, topBps: 2000, rebateBps: 5000, maxEpochBudget: (50_000_000n * 10n ** 18n).toString(),
  claimWindow: 1209600, maxFeedPerCall: (862_000n * 10n ** 18n).toString(), feedCooldown: 86400, dev: DEV, dev2: DEV2 };
for (const k of ['rewardBps', 'topBps', 'rebateBps', 'maxEpochBudget', 'claimWindow', 'maxFeedPerCall', 'feedCooldown', 'contest', 'lock', 'tblock'])
  if (String(VAULT_CFG[k]) !== String(ECONOMIE_V2_DEPLOIEMENT.vault.config[k])) throw new Error('vault ' + k + ' differs from the reviewed v2 record');
const LR_CFG = { tblock: TBLOCK, wtcoin: WTCOIN, lock: LOCK, poolManager: POOL_MANAGER, guardian: GUARDIAN, t0: T0.toString(), maxPotWtcoin: POT_WT.toString(), maxPotTblock: POT_TB.toString(), games: ['@L', '@T', '@S'] };

const ETAPES = [
  { lettre: 'L', nom: 'BlockLikesV2', source: 'src/BlockLikesV2.sol',
    ctor: 'c:tblock,lock,genesis,epoch,likeUsdE18,holdUsdE18,priceFloor,priceCeil,startPrice,maxStepBps,minInterval,keeper,dev,dev2,rewards',
    args: [wa(TBLOCK), wa(LOCK), w(LIKES_CFG.genesis), w(LIKES_CFG.epoch), w(LIKES_CFG.likeUsdE18), w(LIKES_CFG.holdUsdE18), w(LIKES_CFG.priceFloor), w(LIKES_CFG.priceCeil),
      w(LIKES_CFG.startPrice), w(LIKES_CFG.maxStepBps), w(LIKES_CFG.minInterval), wa(KEEPER), wa(DEV), wa(DEV2), '@R'], config: LIKES_CFG },
  { lettre: 'P', nom: 'TblockPayRouter', source: 'src/TblockPayRouter.sol',
    ctor: 'c:usdc,wtcoin,tblock,aeroPool,poolManager,v4Key{currency0,currency1,fee,tickSpacing,hooks},v4PoolId,maxUsdcPerPay,maxV4ImpactTicks,maxHookPpm,minOutBudgetPpm,maxAeroImpactBps,maxAeroFeePpm',
    args: [wa(USDC), wa(WTCOIN), wa(TBLOCK), wa(AERO_POOL), wa(POOL_MANAGER), keyEnc.slice(0, 64), keyEnc.slice(64, 128), keyEnc.slice(128, 192), keyEnc.slice(192, 256), keyEnc.slice(256),
      KEY.poolId.slice(2), w(ROUTER_CFG.maxUsdcPerPay), w(ROUTER_CFG.maxV4ImpactTicks), w(ROUTER_CFG.maxHookPpm), w(ROUTER_CFG.minOutBudgetPpm), w(ROUTER_CFG.maxAeroImpactBps), w(ROUTER_CFG.maxAeroFeePpm)],
    config: ROUTER_CFG },
  { lettre: 'T', nom: 'TamArtV2', source: 'src/TamArtV2.sol', ctor: 'router:|devWallet:|dest:|expectedTblock:|expectedUsdc:|rewards:',
    args: ['@P', wa(TAM_DEV), '@V', wa(TBLOCK), wa(USDC), '@R'], config: { router: '@P', devWallet: TAM_DEV, dest: '@V', expectedTblock: TBLOCK, expectedUsdc: USDC, rewards: '@R' } },
  { lettre: 'S', nom: 'BlockSkins', source: 'src/BlockSkins.sol', ctor: 'router:|feeWallet:|dest:|expectedTblock:|expectedUsdc:|rewards:',
    args: ['@P', wa(FEE_WALLET), '@V', wa(TBLOCK), wa(USDC), '@R'], config: { router: '@P', feeWallet: FEE_WALLET, dest: '@V', expectedTblock: TBLOCK, expectedUsdc: USDC, rewards: '@R', owner: 'the deploying wallet' } },
  { lettre: 'V', nom: 'TBlockVaultV2', source: 'src/TBlockVaultV2.sol',
    ctor: 'c:tblock,likes,contest,lock,rewardBps,topBps,rebateBps,maxEpochBudget,claimWindow,maxFeedPerCall,feedCooldown,dev,dev2|games_:',
    args: [wa(TBLOCK), '@L', wa(CONTEST), wa(LOCK), w(VAULT_CFG.rewardBps), w(VAULT_CFG.topBps), w(VAULT_CFG.rebateBps), w(VAULT_CFG.maxEpochBudget), w(VAULT_CFG.claimWindow),
      w(VAULT_CFG.maxFeedPerCall), w(VAULT_CFG.feedCooldown), wa(DEV), wa(DEV2), ...arr(13, ['@T', '@S'])], config: { ...VAULT_CFG, games: ['@T', '@S'] } },
  { lettre: 'R', nom: 'TBlockLockRewards', source: 'src/TBlockLockRewards.sol', ctor: 'tblock:|wtcoin:|lock:|poolManager:|guardian_:|t0:|maxPotWtcoin:|maxPotTblock:|games_:',
    args: [wa(TBLOCK), wa(WTCOIN), wa(LOCK), wa(POOL_MANAGER), wa(GUARDIAN), w(T0), w(POT_WT), w(POT_TB), ...arr(8, ['@L', '@T', '@S'])], config: LR_CFG },
];

let compilateur = null;
const etapes = ETAPES.map((e, i) => {
  const a = art(e.nom);
  const got = ctorNames(a).join('|');
  if (got !== e.ctor) throw new Error(e.nom + ' constructor shape differs: ' + got);
  for (const x of e.args) if (!(REFS.includes(x) || /^[0-9a-f]{64}$/.test(x))) throw new Error(e.nom + ': bad word ' + x);
  for (const x of e.args) if (REFS.includes(x) && REFS.indexOf(x) >= i && !['@V', '@R'].includes(x)) throw new Error(e.nom + ' uses ' + x + ' before it exists');
  const init = String(a.bytecode.object);
  if (!/^0x[0-9a-f]+$/.test(init) || init.includes('__$')) throw new Error(e.nom + ': unlinked or empty bytecode');
  const runtime = String(a.deployedBytecode.object).slice(2);
  const immutables = Object.values(a.deployedBytecode.immutableReferences || {}).flat().map((r) => [r.start, r.length]).sort((x, y) => x[0] - y[0]);
  for (const [s, l] of immutables) if (/[^0]/.test(runtime.slice(2 * s, 2 * (s + l)))) throw new Error(e.nom + ': immutable slot not zero in the artifact');
  const meta = typeof a.metadata === 'string' ? JSON.parse(a.metadata) : (a.metadata || {});
  const v = (meta.compiler || {}).version || null;
  if (compilateur && v !== compilateur) throw new Error('two compilers'); compilateur = v;
  const src = fs.readFileSync(path.join(ICI, e.source));
  if (src.includes(13)) throw new Error(e.source + ' has CR line endings');
  return { lettre: e.lettre, nonce: 'N+' + i, nom: e.nom, source: 'contracts/' + e.source, sha256Source: sha(src), config: e.config,
    init, args: e.args, sha256Modele: sha(init + '|' + e.args.join(',')), octetsCreation: (init.length - 2) / 2 + e.args.length * 32,
    runtimeOctets: runtime.length / 2, runtimeSha256Masque: sha(runtime), immutables };
});
const sha256Pack = sha(etapes.map((e) => e.sha256Modele).join(','));
const REC = {
  chaine: 8453, compilateur, fixtureDeTest: FIXTURE, genereLe: new Date().toISOString(), prix,
  deployeur: DEPLOYER,
  existants: { tblock: TBLOCK, usdc: USDC, wtcoin: WTCOIN, aeroPool: AERO_POOL, poolManager: POOL_MANAGER, v4Hooks: A(KEY.hooks, 'hooks'), v4PoolId: KEY.poolId, lock: LOCK, contest: CONTEST },
  parametres: { keeper: KEEPER, dev: DEV, dev2: DEV2, tamDevWallet: TAM_DEV, skinsFeeWallet: FEE_WALLET, guardian: GUARDIAN, t0: T0.toString(), maxPotWtcoin: POT_WT.toString(), maxPotTblock: POT_TB.toString() },
  etapes, sha256Pack,
};
const out = path.resolve(env('PACK_OUT_DIR') || APP, 'economie-v2-pack-deploiement.js');
const deepFreeze = 'const gel = (o) => { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.values(o).forEach(gel); Object.freeze(o); } return o; };';
fs.writeFileSync(out, `/* economie-v2-pack-deploiement.js — GENERATED by contracts/preparer-deploiement-pack-economie-v2.mjs. DO NOT EDIT BY HAND.
 * The UNSIGNED deploy data of the economy v2 pack (six contracts, ONE wallet, nonces N..N+5). Nothing here signs or sends.
 * "@L".."@R" are the pack's own addresses: L,P,T,S read from the receipts, V,R predicted from the wallet and N (pack-economie-v2.js). */
${deepFreeze}
export const PACK_ECONOMIE_V2 = gel(${JSON.stringify(REC, null, 1)});
`);
console.log((FIXTURE ? 'TEST FIXTURE ' : '') + 'written ' + out + ' · pack sha256 ' + sha256Pack + ' · START ' + START + ' (' + prix.source + ')');
for (const e of etapes) console.log('  ' + e.nonce.padEnd(4) + ' ' + e.lettre + ' ' + e.nom.padEnd(18) + ' ' + e.octetsCreation + ' bytes · source ' + e.sha256Source.slice(0, 16) + '…');
