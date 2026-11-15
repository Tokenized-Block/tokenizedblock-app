/* usage-onchain.js -- WHO USED THE APP AND HOW MUCH MOVED, COUNTED ON CHAIN ONLY (2026-10-27, grant form).
 *
 * Pure module (no network, no signing). The measuring script (mesures/mesurer-usage-onchain-20261027.mjs) and the server route
 * GET /api/usage both use it, so the published numbers and the live ones follow ONE rule set.
 *
 * DEFINITIONS (the doc docs/usage-onchain-20261027.md repeats them with the numbers):
 *   - Surface = transactions in which one of OUR contracts emitted a log (games, skins, missions, create routers, hooks) or the
 *     Uniswap v4 PoolManager emitted Initialize/Swap for a pool whose hook is ours, or a whitelisted token paid the fee wallet inside
 *     a swap (app-routed trades). The emitter address is the filter -- a log naming us from someone else's contract never counts.
 *   - A user = the sender of the transaction: tx.from, or for an ERC-4337 bundle the `sender` of the UserOperationEvent emitted by
 *     a known EntryPoint (payeurDe from revenu-externe.js; tx.from would be the bundler). NEVER an address read from one of our
 *     log fields: an event is not a transaction.
 *   - Volume of a transaction = the LARGEST of its priced legs (never their sum, so one trade is never counted twice):
 *       ETH sent with the tx (tx.value), stable tokens transferred INTO our contracts, the stable/ETH leg of a Swap on one of our
 *       pools, or (fee-wallet trades) the stable fee x 1000 (the app fee is 0.1 %). Stables at face value (USDC, OUSD); ETH at the
 *       day's on-chain median price (prix-eth.js, 4 v4 ETH/USDC pools); anything else (stocks, blocks, AUDF) is NOT priced and is
 *       counted as such. */
import { SLOTS_DEPLOIEMENT } from './slots-deploiement.js';
import { DUELS_DEPLOIEMENT } from './duels-deploiement.js';
import { DUELS_V2_DEPLOIEMENT } from './duels-v2-deploiement.js';
import { BLOCKROLLS_DEPLOIEMENT } from './blockrolls-deploiement.js';
import { TICKETPOT_DEPLOIEMENT } from './ticketpot-deploiement.js';
import { BLOCKSKINS_DEPLOIEMENT } from './blockskins-deploiement.js';
import { MISSIONS_DEPLOIEMENT } from './missions-deploiement.js';
import { CREATE_ROUTER, FEE_WALLET, FEE_WALLET_LEGACY_37EB, USDC_BASE } from './frais-creation.js';
import { ROUTEURS_ANCIENS } from './index-routeur.js';
import { HOOK_PREVU, HOOK_V2, HOOK_V3, HOOK_V4, HOOK_V5, HOOK_V6, HOOK_V7, HOOK_V8, HOOK_7030 } from './tokenomics.js';
import { DESCRIPTEUR_7030 } from './hook-7030-descripteur.js';
import { WETH_BASE } from './plan-eth-block.js';
import { payeurDe, TOPICS_SWAP } from './revenu-externe.js';
import { topic } from './keccak.js';
/* 2026-11-15: the economy surface shipped after 27/10 (hearts, vault, lock rewards, lock, TAM art, skins mint / spin, block contest)
 *   was missing from CONTRATS: its users were not counted at all (census of 15/11: 9 contracts, 35 txs since 27/10). */
import { ADRESSES_PACK_ECONOMIE_V2 } from './economie-v2-pack-deploye.js';
import { LOCK_DEPLOIEMENT } from './lock-deploiement.js';
import { LOCK_WEEKLY_DEPLOIEMENT } from './lock-weekly-deploiement.js';
import { TAMART_DEPLOIEMENT } from './tamart-deploiement.js';
import { SKINS_SPIN_DEPLOIEMENT } from './skins-spin-deploiement.js';
import { CONTEST_DEPLOIEMENT } from './block-contest-deploiement.js';

const bas = (a) => String(a || '').toLowerCase();
const ADR = /^0x[0-9a-f]{40}$/;
const ZERO = '0x0000000000000000000000000000000000000000';

export const POOL_MANAGER = '0x498581ff718922c3f8e6a244956af099b2652b2b'; /* multipool.js ADRESSES.POOL_MANAGER */
export const STATE_VIEW = '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71'; /* multipool.js ADRESSES.STATE_VIEW */
/** First block worth reading: the birth of Block 0 (serveur-web.js HOOKS_FRAIS floor). */
export const BLOC_DEPART = 50861088;
/** ⛔ HISTORICAL (pre-Denim, 2 s blocks): kept ONLY for the measuring scripts of 2026-10-27 (mesures/), which read blocks of that time.
 *  The live engine (moteurUsage) no longer uses it: since Base Denim (200 ms blocks) a block number times 2 s is 10x wrong — every row
 *  and the window end take the REAL block timestamp (horodatageDuRecu / the block header). */
export const SECONDES_PAR_BLOC = 2;

const entierHex = (v) => { const s = String(v ?? ''); if (!/^0x[0-9a-f]+$/i.test(s)) return null; const x = parseInt(s, 16); return Number.isSafeInteger(x) ? x : null; };
/**
 * The block timestamp (s) carried by a receipt's logs, or null. Measured 2026-11-05 on base-rpc.publicnode.com and mainnet.base.org:
 * receipts have NO top-level blockTimestamp, but every log in them (and every eth_getLogs entry) carries `blockTimestamp` (hex seconds).
 * ⛔ Only accepted if every log that has one agrees, and the log's blockNumber is the receipt's: a disagreement -> null (the caller reads
 *    the header instead), never a guess.
 */
export function horodatageDuRecu(recu) {
  if (!recu || !Array.isArray(recu.logs)) return null;
  const bloc = entierHex(recu.blockNumber);
  let ts = null;
  for (const l of recu.logs) {
    if (!l || l.blockTimestamp === undefined || l.blockTimestamp === null) continue;
    const t = entierHex(l.blockTimestamp);
    if (t === null || t <= 0) return null;
    if (l.blockNumber !== undefined && entierHex(l.blockNumber) !== bloc) return null;
    if (ts !== null && t !== ts) return null;
    ts = t;
  }
  return ts;
}

/** Our contracts, each copied from its deployment record (never from memory). `jeu` = a contract users pay INTO. */
export const CONTRATS = Object.freeze([
  { nom: 'BlockSlots', adresse: SLOTS_DEPLOIEMENT.adresse, jeu: true },
  { nom: 'BlockDuels v1', adresse: DUELS_DEPLOIEMENT.adresse, jeu: true },
  { nom: 'BlockDuels v2', adresse: DUELS_V2_DEPLOIEMENT.adresse, jeu: true },
  { nom: 'BlockRolls', adresse: BLOCKROLLS_DEPLOIEMENT.adresse, jeu: true },
  { nom: 'TicketPot', adresse: TICKETPOT_DEPLOIEMENT.adresse, jeu: true },
  { nom: 'BlockSkins v2', adresse: BLOCKSKINS_DEPLOIEMENT.precedent && BLOCKSKINS_DEPLOIEMENT.precedent.adresse, jeu: true },
  { nom: 'BlockSkins v1', adresse: '0xea6ccb19714504ae3286e82febbe627f9d0ce77d', jeu: true }, /* blockskins-deploiement.js precedent v1 */
  { nom: 'BlockSkins current', adresse: BLOCKSKINS_DEPLOIEMENT.adresse, jeu: true },
  { nom: 'BlockMissions', adresse: MISSIONS_DEPLOIEMENT.adresse, jeu: true },
  { nom: 'MissionsDeployer', adresse: MISSIONS_DEPLOIEMENT.factory, jeu: false },
  { nom: 'Missions rail', adresse: '0xc045c1f2eb5dd8cb976bbb31e84f99728b6b2514', jeu: true }, /* missions-deploiement.js, factory comment */
  { nom: 'CreateRouter', adresse: CREATE_ROUTER, jeu: true },
  ...ROUTEURS_ANCIENS.map((a, i) => ({ nom: 'CreateRouter old ' + (i + 1), adresse: a, jeu: true })),
  ...Object.entries({ L: 'Hearts', P: 'Economy pack P', T: 'Economy pack T', S: 'Economy pack S', V: 'Holders vault', R: 'Monthly lock rewards' })
    .map(([k, nom]) => ({ nom, adresse: ADRESSES_PACK_ECONOMIE_V2[k], jeu: true })),
  { nom: 'TBLOCK lock', adresse: LOCK_DEPLOIEMENT.adresse, jeu: true },
  { nom: 'Weekly lock rewards', adresse: LOCK_WEEKLY_DEPLOIEMENT.adresse, jeu: true },
  { nom: 'TAM art', adresse: TAMART_DEPLOIEMENT.adresse, jeu: true },
  { nom: 'Skins mint', adresse: SKINS_SPIN_DEPLOIEMENT.etapes[0].adresse, jeu: true },
  { nom: 'Skins spin', adresse: SKINS_SPIN_DEPLOIEMENT.etapes[1].adresse, jeu: true },
  { nom: 'Block contest', adresse: CONTEST_DEPLOIEMENT.adresse, jeu: true },
].filter((c) => ADR.test(bas(c.adresse))).map((c) => Object.freeze({ ...c, adresse: bas(c.adresse) })));

/** Our hooks (tokenomics.js + the 7030 descriptor). A pool counts as ours iff its PoolKey.hooks is one of these. */
export const HOOKS = Object.freeze([...new Set([HOOK_PREVU, HOOK_V2, HOOK_V3, HOOK_V4, HOOK_V5, HOOK_V6, HOOK_V7, HOOK_V8, HOOK_7030]
  .map(bas).filter((a) => ADR.test(a)))]);

/** Addresses whose logs we read directly (contracts + hooks). */
export const EMETTEURS = Object.freeze([...new Set([...CONTRATS.map((c) => c.adresse), ...HOOKS])]);
const JEUX = new Set(CONTRATS.filter((c) => c.jeu).map((c) => c.adresse));

/** Team wallets, ONLY those the repo names as ours: the fee wallet (smart wallet), the legacy operator/owner wallet, and 0x31e0
 *  (community reserve / reward pool, the signer of the game deployments, excluded as internal by serveur-web.js internesRevenu). */
export const EQUIPE = Object.freeze([
  { nom: 'fee wallet (smart wallet)', adresse: bas(FEE_WALLET) },
  { nom: 'legacy operator / owner wallet', adresse: bas(FEE_WALLET_LEGACY_37EB) },
  { nom: 'community reserve / deployment signer / test wallet', adresse: '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b' },
  /* 2026-10-27, owner in chat: "oui a moi" — the Block 0 creator is the owner's own wallet (access lost after a bug). Address copied
   *   from mesures/usage-onchain-20261027.json, never typed from memory. */
  { nom: 'owner wallet (Block 0 creator, access lost)', adresse: '0xaf8e0a44496a6b90da03fbadd9daec875fc3e2a6' },
  /* 2026-11-15: the gas-only keeper key (buyback, spin dev payout, close keeper): its 200 USD payout of 13/11 was counted as outside
   *   volume. Address copied from /sante closeKeeper.adresse, never typed from memory. */
  { nom: 'keeper key (gas only)', adresse: '0x1f0eb43b99272e78de0077ff0e38787d6c2bd23c' },
  /* 2026-11-15, owner in chat: "oui c'est moi" for the two big lockers. Copied from tools/recensement-nouveaux.mjs --list output. */
  { nom: 'owner wallet (locker 5.56 M)', adresse: '0x73f7d0b10a4fcaa75f0055b1a79a273555bdb2f6' },
  { nom: 'owner wallet (locker 5 M)', adresse: '0xb30696174863cb719f5f13c3bffb2b9701f035cb' },
]);

/** Stables priced at face value (USD). AUDF is an AUD stable: NOT converted, reported apart. */
export const STABLES_USD = Object.freeze({ [bas(USDC_BASE)]: { sym: 'USDC', dec: 6 },
  [bas(DESCRIPTEUR_7030.devises.find((d) => d.sym === 'OUSD').adresse)]: { sym: 'OUSD', dec: 6 } });
export const AUDF = '0xd2a530170d71a9cfe1651fb468e2b98f7ed7456b'; /* wallet-fiat.js */
/** Tokens whose Transfer to the fee wallet counts (the 62 currencies of the 7030 hook + WETH). Anything else = spam, ignored. */
export const DEVISES_FRAIS = Object.freeze(new Set([bas(WETH_BASE), ...DESCRIPTEUR_7030.devises.map((d) => bas(d.adresse)).filter((a) => a !== ZERO)]));

export const T_TRANSFER = topic('Transfer(address,address,uint256)');
export const T_INIT = topic('Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)');
export const T_USER_OP = topic('UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)');
export const T_SWAP = topic('Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)');

const mot = (data, i) => '0x' + String(data || '').replace(/^0x/, '').slice(64 * i, 64 * i + 64);
const signe = (h) => { const v = BigInt(h); return v >= (1n << 255n) ? v - (1n << 256n) : v; };
const adrDeTopic = (t) => '0x' + bas(t).slice(26);

/** An Initialize log of the PoolManager -> { id, c0, c1, hook } (null if not the PoolManager or malformed). */
export function poolDeInit(l) {
  if (!l || bas(l.address) !== POOL_MANAGER || !l.topics || bas(l.topics[0]) !== T_INIT || l.topics.length < 4) return null;
  const hook = '0x' + bas(mot(l.data, 2)).slice(26);
  return { id: bas(l.topics[1]), c0: adrDeTopic(l.topics[2]), c1: adrDeTopic(l.topics[3]), hook };
}

/** USD value of a raw amount of `jeton` ({usd:number} | {nonPrice:sym}). ETH and WETH need `ethUsd`. */
export function valeurUsd(jeton, brut, ethUsd) {
  const j = bas(jeton);
  const m = brut < 0n ? -brut : brut;
  if (m === 0n) return { usd: 0 };
  const s = STABLES_USD[j];
  if (s) return { usd: Number(m) / 10 ** s.dec };
  if (j === ZERO || j === bas(WETH_BASE)) return typeof ethUsd === 'number' && ethUsd > 0 ? { usd: (Number(m) / 1e18) * ethUsd } : { nonPrice: 'ETH (no price)' };
  if (j === AUDF) return { nonPrice: 'AUDF' };
  return { nonPrice: j };
}

/**
 * One transaction -> one row. `tx` and `recu` are the node's answers (eth_getTransactionByHash / eth_getTransactionReceipt);
 * `pools` = Map(poolId -> {c0,c1}) of OUR pools. The sender comes from payeurDe (tx.from or the EntryPoint's UserOperation
 * sender), NEVER from our log fields.
 * @returns {{h,b,from,cats:string[],usd:number,nonPrice:string[]}|{h,refus:string}}
 */
export function ligneDeTx({ tx, recu, pools, ethUsd, ts }) {
  const h = bas(tx && tx.hash);
  if (!tx || !recu) return { h, refus: 'NOT_READ' };
  if (String(recu.status) !== '0x1') return { h, refus: 'FAILED' };
  if (bas(recu.transactionHash) !== h) return { h, refus: 'RECEIPT_MISMATCH' };
  const from = payeurDe({ tx, recu });
  if (!from) return { h, refus: 'SENDER_AMBIGUOUS' };
  const cats = new Set();
  const legs = [];
  const nonPrice = new Set();
  const push = (v) => { if (v.nonPrice) nonPrice.add(v.nonPrice); else legs.push(v.usd); };
  let value = 0n; try { value = BigInt(tx.value || '0x0'); } catch (_) { value = 0n; }
  const w32 = '0x' + bas(FEE_WALLET).slice(2).padStart(64, '0');
  let feeStable = 0, sortieStable = 0, entreeStable = 0, derive = false;
  let aSwap = false;
  for (const l of (Array.isArray(recu.logs) ? recu.logs : [])) {
    const a = bas(l && l.address);
    const tp = (l && l.topics) || [];
    const t0 = bas(tp[0]);
    if (EMETTEURS.includes(a)) cats.add(HOOKS.includes(a) ? 'hook' : (CONTRATS.find((c) => c.adresse === a) || {}).nom);
    if (a === POOL_MANAGER && t0 === T_INIT && tp.length >= 4) {
      const p = poolDeInit(l);
      if (p && HOOKS.includes(p.hook)) cats.add('birth/initialize on our hook');
    }
    if (TOPICS_SWAP.has(t0)) aSwap = true; /* v4 PoolManager or v3 / Aerodrome CL pool */
    if (a === POOL_MANAGER && t0 === T_SWAP && pools && pools.has(bas(tp[1]))) {
      cats.add('swap on our pool');
      const p = pools.get(bas(tp[1]));
      const a0 = signe(mot(l.data, 0)), a1 = signe(mot(l.data, 1));
      const v0 = valeurUsd(p.c0, a0, ethUsd), v1 = valeurUsd(p.c1, a1, ethUsd);
      if (!v0.nonPrice) push(v0); else if (!v1.nonPrice) push(v1); else { nonPrice.add(v0.nonPrice); nonPrice.add(v1.nonPrice); }
    }
    if (t0 === T_TRANSFER && tp.length === 3) {
      const to = adrDeTopic(tp[2]);
      let m = 0n; try { m = BigInt(String(l.data)); } catch (_) { m = 0n; }
      if (JEUX.has(to) && (STABLES_USD[a] || a === AUDF || a === bas(WETH_BASE))) push(valeurUsd(a, m, ethUsd));
      /* the sender's own stable flows (paid or received), used only for fee-wallet trades below */
      if (STABLES_USD[a] && adrDeTopic(tp[1]) === from) sortieStable += valeurUsd(a, m).usd;
      if (STABLES_USD[a] && to === from) entreeStable += valeurUsd(a, m).usd;
      if (bas(tp[2]) === w32 && DEVISES_FRAIS.has(a)) { cats.add('fee-wallet trade'); if (STABLES_USD[a]) feeStable += valeurUsd(a, m).usd; else nonPrice.add('fee in ' + a); }
    }
  }
  /* a fee-wallet transfer only marks a TRADE if the receipt holds a swap (revenu-externe rule: a plain transfer is a gift) */
  if (cats.has('fee-wallet trade') && !aSwap) { cats.delete('fee-wallet trade'); }
  else if (cats.has('fee-wallet trade')) {
    /* measured leg: the stables the sender paid or received in this trade; derived leg: a stable fee x 1000 (fee = 0.1 %) */
    if (sortieStable > 0 || entreeStable > 0) legs.push(Math.max(sortieStable, entreeStable));
    else if (feeStable > 0) { legs.push(feeStable * 1000); derive = true; }
  }
  if (value > 0n) push(valeurUsd(ZERO, value, ethUsd));
  if (!cats.size) return { h, refus: 'NOT_OUR_SURFACE' };
  const b = parseInt(String(recu.blockNumber), 16);
  return { h, b, ts: ts ?? null, from, cats: [...cats].sort(), usd: legs.length ? Math.max(...legs) : 0, nonPrice: [...nonPrice], ...(derive ? { derive: true } : {}) };
}

/** Rows deduplicated by tx hash (the same tx found through two queries counts once; the later read wins). */
export function fusionner(...listes) {
  const m = new Map();
  for (const l of listes) for (const r of (l || [])) if (r && r.h && !r.refus) m.set(r.h, r);
  return [...m.values()];
}

/** The five numbers, with and without the team wallets. `finTs` = end of the window (unix s, UTC). */
export function compter(lignes, { finTs, equipe = EQUIPE.map((e) => e.adresse) } = {}) {
  const ex = new Set(equipe.map(bas));
  const un = (garde) => {
    const tous = new Set(), j = new Set(), s = new Set();
    let vol = 0, vol30 = 0, n = 0, nonPrice = 0;
    for (const r of fusionner(lignes)) {
      if (!garde(r)) continue;
      n += 1; tous.add(r.from);
      if (r.ts > finTs - 86400 && r.ts <= finTs) j.add(r.from);
      if (r.ts > finTs - 7 * 86400 && r.ts <= finTs) s.add(r.from);
      vol += r.usd || 0;
      if (r.ts > finTs - 30 * 86400 && r.ts <= finTs) vol30 += r.usd || 0;
      if (r.nonPrice && r.nonPrice.length) nonPrice += 1;
    }
    return { usersAllTime: tous.size, dau: j.size, wau: s.size, volumeUsdAllTime: Math.round(vol * 100) / 100,
      volumeUsd30d: Math.round(vol30 * 100) / 100, txs: n, txsWithUnpricedLegs: nonPrice };
  };
  return { avecEquipe: un(() => true), sansEquipe: un((r) => !ex.has(bas(r.from))) };
}

/* ── SCANNING (network through an INJECTED rpc(method, params); shared by the measuring script and GET /api/usage) ───────────── */

/** A refusal that a smaller range can fix (range cap, response too large, result-count cap). Anything else is an outage. */
export const RE_CAPACITE = /range|too large|too many|exceed|limit.*(results|logs|10000)|response size|query returned more/i;

/**
 * getLogs over [de, a], splitting on capacity refusals down to `min` blocks. Returns { logs, nonLus:[{de,a,cause}] }.
 * ⛔ A refused range is RETURNED as unread, never as empty.
 */
export async function logsDecoupes(rpc, filtre, de, a, { min = 500 } = {}) {
  const out = { logs: [], nonLus: [] };
  const pile = [[de, a]];
  while (pile.length) {
    const [x, y] = pile.shift();
    try {
      const r = await rpc('eth_getLogs', [{ ...filtre, fromBlock: '0x' + x.toString(16), toBlock: '0x' + y.toString(16) }]);
      if (!Array.isArray(r)) throw new Error('getLogs answered a non-array');
      out.logs.push(...r);
    } catch (e) {
      const cause = String((e && e.message) || e).slice(0, 160);
      if (RE_CAPACITE.test(cause) && y - x + 1 > min) { const m = x + Math.floor((y - x) / 2); pile.unshift([x, m], [m + 1, y]); continue; }
      out.nonLus.push({ de: x, a: y, cause });
    }
  }
  return out;
}

/**
 * One window: finds OUR pools initialized in it (added to `pools`, a Map) and the hashes of every candidate tx.
 * Order matters: Initialize first, so a swap in the same window on a pool born in it is seen.
 * @returns {Promise<{ hashes:Set<string>, nonLus:Array<{requete,de,a,cause}> }>}
 */
export async function balayerFenetre({ rpc, de, a, pools, min }) {
  const hashes = new Set();
  const nonLus = [];
  const note = (requete, r) => { for (const u of r.nonLus) nonLus.push({ requete, ...u }); };
  const ri = await logsDecoupes(rpc, { address: POOL_MANAGER, topics: [T_INIT] }, de, a, { min });
  note('PoolManager Initialize', ri);
  for (const l of ri.logs) { const p = poolDeInit(l); if (p && HOOKS.includes(p.hook)) { pools.set(p.id, { c0: p.c0, c1: p.c1, hook: p.hook }); hashes.add(bas(l.transactionHash)); } }
  /* publicnode: at most 10 addresses per filter (measured 2026-10-27) */
  for (let i = 0; i < EMETTEURS.length; i += 10) {
    const re = await logsDecoupes(rpc, { address: EMETTEURS.slice(i, i + 10) }, de, a, { min });
    note('our contracts + hooks', re);
    for (const l of re.logs) if (EMETTEURS.includes(bas(l.address))) hashes.add(bas(l.transactionHash));
  }
  const ids = [...pools.keys()];
  for (let i = 0; i < ids.length; i += 50) {
    const rs = await logsDecoupes(rpc, { address: POOL_MANAGER, topics: [T_SWAP, ids.slice(i, i + 50)] }, de, a, { min });
    note('PoolManager Swap on our pools', rs);
    for (const l of rs.logs) if (bas(l.address) === POOL_MANAGER && pools.has(bas(l.topics[1]))) hashes.add(bas(l.transactionHash));
  }
  const w32 = '0x' + bas(FEE_WALLET).slice(2).padStart(64, '0');
  /* an address is REQUIRED by publicnode for a topic filter, and it is also the whitelist: only these tokens' own logs count */
  const devises = [...DEVISES_FRAIS];
  for (let i = 0; i < devises.length; i += 10) {
    const rf = await logsDecoupes(rpc, { address: devises.slice(i, i + 10), topics: [T_TRANSFER, null, w32] }, de, a, { min });
    note('Transfer to fee wallet', rf);
    for (const l of rf.logs) if (DEVISES_FRAIS.has(bas(l.address))) hashes.add(bas(l.transactionHash));
  }
  return { hashes, nonLus };
}

/**
 * The INCREMENTAL counter behind GET /api/usage: seeded with the published measure (mesures/usage-onchain-20261027.json), it scans
 * forward from the seed's end block with the SAME balayerFenetre / ligneDeTx / compter.
 * ⛔ A window whose tx cannot all be read is NOT passed: the end block stays put and the next call retries it (never a silent hole).
 * ⛔ getLogs ranges the node refuses are kept in `nonLus` and reported (count + blocks), never counted as empty.
 * `prixEth()` -> number|null: the ETH price used for NEW rows (read at scan time, so recent rows only).
 */
export function moteurUsage({ rpc, graine, prixEth = async () => null, fenetre = 2000, maxFenetres = 10, min = 100 }) {
  const g = graine || {};
  const etat = {
    lignes: new Map((g.lignes || []).map((r) => [r.h, r])),
    pools: new Map((g.poolsSurNosHooks || []).map((p) => [bas(p.id), { c0: bas(p.c0), c1: bas(p.c1), hook: bas(p.hook) }])),
    fin: (g.fin && g.fin.bloc) || BLOC_DEPART - 1,
    finTs: (g.fin && g.fin.ts) || null,
    nonLus: [...(g.nonLus || [])],
    tete: null, erreur: null, enCours: null, lu: 0,
  };
  async function lireTx(h) {
    const tx = await rpc('eth_getTransactionByHash', [h]);
    const recu = await rpc('eth_getTransactionReceipt', [h]);
    if (!tx || !recu) throw new Error('tx not read yet: ' + h);
    return { tx, recu };
  }
  /* DENIM (2026-11-05) : the REAL timestamp of a block (header), cached; unreadable -> throw (the window is not committed, retried) */
  const tsBlocs = new Map();
  async function tsDuBloc(b) {
    if (tsBlocs.has(b)) return tsBlocs.get(b);
    const h = await rpc('eth_getBlockByNumber', ['0x' + b.toString(16), false]);
    const ts = h ? entierHex(h.timestamp) : null;
    if (ts === null || ts <= 0) throw new Error('block timestamp not read: ' + b);
    tsBlocs.set(b, ts);
    if (tsBlocs.size > 2000) tsBlocs.delete(tsBlocs.keys().next().value);
    return ts;
  }
  async function pas() {
    const tete = parseInt(await rpc('eth_blockNumber', []), 16) - 5;
    if (!Number.isSafeInteger(tete) || tete <= 0) throw new Error('head not read');
    etat.tete = tete;
    let n = 0;
    while (etat.fin < tete && n < maxFenetres) {
      const de = etat.fin + 1, a = Math.min(tete, de + fenetre - 1);
      const pools = new Map(etat.pools);
      const r = await balayerFenetre({ rpc, de, a, pools, min });
      const nouvelles = [];
      let usd = null;
      for (const h of r.hashes) {
        if (etat.lignes.has(h)) continue;
        const { tx, recu } = await lireTx(h);
        if (usd === null) usd = await prixEth();
        /* DENIM : the tx's own block timestamp (its logs carry it; else its header) — never head - blocks x 2 s */
        const bRecu = entierHex(recu.blockNumber);
        if (bRecu === null) throw new Error('receipt block not read: ' + h);
        const ts = horodatageDuRecu(recu) ?? await tsDuBloc(bRecu);
        const l = ligneDeTx({ tx, recu, pools, ethUsd: usd, ts });
        if (!l.refus) nouvelles.push(l);
      }
      /* the window is committed only now, whole */
      /* DENIM : the window end's REAL timestamp, read BEFORE anything is committed (unreadable -> nothing committed, retried) */
      const finTs = await tsDuBloc(a);
      etat.pools = pools;
      for (const l of nouvelles) etat.lignes.set(l.h, l);
      etat.nonLus.push(...r.nonLus);
      etat.fin = a;
      etat.finTs = finTs;
      n += 1;
    }
  }
  return {
    etat,
    /** 2026-11-15: the engine's state as a seed (same shape the engine reads: lignes, fin, poolsSurNosHooks, nonLus), so the server
     *  can keep its progress across deploys instead of restarting from the 27/10 seed every time (measured: stuck 19 days). */
    exporter() {
      return { mesure: 'usage-onchain.js engine state', fin: { bloc: etat.fin, ts: etat.finTs, iso: etat.finTs ? new Date(etat.finTs * 1000).toISOString() : null },
        poolsSurNosHooks: [...etat.pools].map(([id, p]) => ({ id, c0: p.c0, c1: p.c1, hook: p.hook })), nonLus: etat.nonLus, lignes: [...etat.lignes.values()] };
    },
    /** one catch-up step at a time (concurrent callers share it) */
    avancer() {
      if (!etat.enCours) {
        etat.enCours = pas().then(() => { etat.erreur = null; etat.lu = Date.now(); },
          (e) => { etat.erreur = String((e && e.message) || e).slice(0, 160); etat.lu = Date.now(); /* lu = last ATTEMPT: a failing node is not hammered */ }).finally(() => { etat.enCours = null; });
      }
      return etat.enCours;
    },
    /** counts only: no address, no hash */
    resume() {
      const c = compter([...etat.lignes.values()], { finTs: etat.finTs });
      return {
        ok: etat.finTs !== null,
        fin: { bloc: etat.fin, iso: etat.finTs ? new Date(etat.finTs * 1000).toISOString() : null },
        retardBlocs: etat.tete !== null ? Math.max(0, etat.tete - etat.fin) : null,
        avecEquipe: c.avecEquipe, sansEquipe: c.sansEquipe,
        /* refused (query, range) pairs, and the distinct blocks they cover (several queries can share one range) */
        nonLus: (() => {
          const p = [...new Map(etat.nonLus.map((u) => [u.de + '-' + u.a, u])).values()].sort((x, y) => x.de - y.de);
          let blocs = 0, haut = -1;
          for (const u of p) { const de = Math.max(u.de, haut + 1); if (u.a >= de) blocs += u.a - de + 1; haut = Math.max(haut, u.a); }
          return { requetes: etat.nonLus.length, blocsDistincts: blocs, de: p.length ? p[0].de : null, a: p.length ? haut : null };
        })(),
        erreur: etat.erreur,
        regles: 'user = tx sender (tx.from, or the ERC-4337 UserOperation sender); DAU/WAU = distinct senders in the 24 h / 7 d before fin; '
          + 'volume = largest priced leg per tx (stables at face value, ETH at on-chain pool median); team = fee wallet, legacy operator wallet, community reserve / test wallet',
      };
    },
  };
}
