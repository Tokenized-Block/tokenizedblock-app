/* preparer-deploiement-economie-v2.mjs — FREEZES the deployment data of BlockLikesV2 + TBlockVaultV2 (Phil 2026-11-11: "redo a v2 contract that
 *   computes, because $15 today is not worth the same later; Grok signs for you").
 * ⛔ THIS SCRIPT SIGNS NOTHING AND SENDS NOTHING. It writes ../economie-v2-deploiement.js; deployer-economie-v2.html offers it to the connected
 *   wallet in two signatures: BlockLikesV2 first, then TBlockVaultV2, whose constructor needs the likes address (the page appends the 13 static
 *   words of the vault config with the likes address read from the first receipt). The vault's constructor REFUSES a likes contract wired to
 *   another lock (review SEC-004).
 * Usage (from contracts/): forge build && START_PRICE_E18=<int> node preparer-deploiement-economie-v2.mjs
 *   START_PRICE_E18 = the live TBLOCK price in USD x 1e18, the LOWER of now and ~10 min ago (/api/tblock/hold), read just before freezing. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const TBLOCK = '0xb200000000000000000000ba9bf8330307f8830e';
const LOCK = '0xec46b02bb1f3a58ce37c023f8668f2207bc2b0aa';          /* TBlockLock, deployed + verified 2026-11-11 (verifier 6/6) */
const CONTEST = '0x001ead57218f3ab79e2dcacb05ddfc4574ef177c';       /* the same as the v1 vault (preparer-deploiement-economie.mjs) */
const DEV = '0x264496cc303f8dbe49a241ea84cd42be8392bc80';            /* the same two dev wallets as the v1 vault */
const DEV2 = '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b';
/* review DT-1 (2026-11-11): the keeper was DEV2's address, so a stolen keeper key could veto its own replacement and make a freeze
 * permanent. BlockLikesV2 now REFUSES keeper == dev or dev2. The keeper is a THIRD key that Phil names: LIKES_KEEPER=<0x...>. */
const KEEPER = String(process.env.LIKES_KEEPER || '').toLowerCase();
if (!/^0x[0-9a-f]{40}$/.test(KEEPER)) throw new Error('LIKES_KEEPER is required: a keeper key distinct from DEV and DEV2 (review DT-1)');
if (KEEPER === DEV || KEEPER === DEV2) throw new Error('LIKES_KEEPER must differ from DEV and DEV2 (review DT-1)');
const GENESIS = 1794355200;                                           /* 2026-11-11 00:00 UTC, the contest's and v1's week line */
const START = BigInt(process.env.START_PRICE_E18 || '0');
if (!(START > 0n)) throw new Error('START_PRICE_E18 is required (the live lower price x 1e18)');
const LIKES = Object.freeze({ tblock: TBLOCK, lock: LOCK, genesis: GENESIS, epoch: 604800, likeUsdE18: (5n * 10n ** 17n).toString(), holdUsdE18: (15n * 10n ** 18n).toString(),
  priceFloor: (START / 50n).toString(), priceCeil: (START * 100n).toString(), startPrice: START.toString(), maxStepBps: 1000, minInterval: 3600, keeper: KEEPER, dev: DEV, dev2: DEV2 });
const VAULT = Object.freeze({ tblock: TBLOCK, contest: CONTEST, lock: LOCK, rewardBps: 5000, topBps: 2000, rebateBps: 5000, maxEpochBudget: (50_000_000n * 10n ** 18n).toString(),
  claimWindow: 1209600, maxFeedPerCall: (862_000n * 10n ** 18n).toString(), feedCooldown: 86400, dev: DEV, dev2: DEV2 });
const art = (n) => JSON.parse(fs.readFileSync(path.join(ICI, 'out', n + '.sol', n + '.json'), 'utf8'));
const L = art('BlockLikesV2'), V = art('TBlockVaultV2');
const lc = (L.abi.find((x) => x.type === 'constructor') || {}).inputs || [];
const vc = (V.abi.find((x) => x.type === 'constructor') || {}).inputs || [];
if (lc.length !== 1 || lc[0].components.map((x) => x.name).join() !== 'tblock,lock,genesis,epoch,likeUsdE18,holdUsdE18,priceFloor,priceCeil,startPrice,maxStepBps,minInterval,keeper,dev,dev2') throw new Error('BlockLikesV2 constructor shape differs');
if (vc.length !== 1 || vc[0].components.map((x) => x.name).join() !== 'tblock,likes,contest,lock,rewardBps,topBps,rebateBps,maxEpochBudget,claimWindow,maxFeedPerCall,feedCooldown,dev,dev2') throw new Error('TBlockVaultV2 constructor shape differs');
const w = (x) => BigInt(x).toString(16).padStart(64, '0');
const wa = (a) => { if (!/^0x[0-9a-f]{40}$/.test(a)) throw new Error('not an address: ' + a); return a.slice(2).padStart(64, '0'); };
const likesArgs = [wa(LIKES.tblock), wa(LIKES.lock), w(LIKES.genesis), w(LIKES.epoch), w(LIKES.likeUsdE18), w(LIKES.holdUsdE18), w(LIKES.priceFloor), w(LIKES.priceCeil),
  w(LIKES.startPrice), w(LIKES.maxStepBps), w(LIKES.minInterval), wa(LIKES.keeper), wa(LIKES.dev), wa(LIKES.dev2)].join('');
const likesCreation = String(L.bytecode.object) + likesArgs;
const vaultInit = String(V.bytecode.object);
/* the vault's 13 words WITHOUT the likes address (word 2), which the page inserts from the first receipt */
const vaultAvant = wa(VAULT.tblock), vaultApres = [wa(VAULT.contest), wa(VAULT.lock), w(VAULT.rewardBps), w(VAULT.topBps), w(VAULT.rebateBps), w(VAULT.maxEpochBudget),
  w(VAULT.claimWindow), w(VAULT.maxFeedPerCall), w(VAULT.feedCooldown), wa(VAULT.dev), wa(VAULT.dev2)].join('');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const meta = typeof L.metadata === 'string' ? JSON.parse(L.metadata) : (L.metadata || {});
const adr = (k) => { const v = process.env[k]; if (!v) return 'null'; if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error(k + ' is not an address'); return "'" + v.toLowerCase() + "'"; };
fs.writeFileSync(path.join(ICI, '..', 'economie-v2-deploiement.js'), `/* economie-v2-deploiement.js — GENERATED by contracts/preparer-deploiement-economie-v2.mjs. DO NOT EDIT BY HAND.
 * The UNSIGNED deployment data of BlockLikesV2 and TBlockVaultV2 (lock-aware, $15 at a bounded keeper price). Nothing here signs or sends. */
export const ECONOMIE_V2_DEPLOIEMENT = Object.freeze({
  chaine: 8453,
  compilateur: ${JSON.stringify((meta.compiler || {}).version || null)},
  likes: Object.freeze({ config: Object.freeze(${JSON.stringify(LIKES)}), sha256Source: '${sha(fs.readFileSync(path.join(ICI, 'src/BlockLikesV2.sol')))}',
    sha256Creation: '${sha(likesCreation)}', octets: ${(likesCreation.length - 2) / 2}, creation: '${likesCreation}' }),
  vault: Object.freeze({ config: Object.freeze(${JSON.stringify(VAULT)}), sha256Source: '${sha(fs.readFileSync(path.join(ICI, 'src/TBlockVaultV2.sol')))}',
    sha256Init: '${sha(vaultInit + vaultAvant + vaultApres)}', octets: ${(vaultInit.length - 2) / 2 + 13 * 32}, init: '${vaultInit}', avant: '${vaultAvant}', apres: '${vaultApres}' }),
  /* filled after each deployment was READ on chain */
  adresseLikes: ${adr('ADRESSE_LIKES_V2')},
  adresseVault: ${adr('ADRESSE_VAULT_V2')},
});
/** the vault's creation data for the likes address read from the first receipt */
export function vaultV2Creation(likesAt) {
  const a = String(likesAt || '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(a)) throw new Error('not an address: ' + likesAt);
  const d = ECONOMIE_V2_DEPLOIEMENT.vault;
  return d.init + d.avant + a.slice(2).padStart(64, '0') + d.apres;
}
`);
console.log('economie-v2-deploiement.js written · likes sha256 ' + sha(likesCreation) + ' · ' + (likesCreation.length - 2) / 2 + ' bytes · vault ' + ((vaultInit.length - 2) / 2 + 13 * 32) + ' bytes');
