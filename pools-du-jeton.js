// pools-du-jeton.js — les VRAIES pools v4 d un block, decouvertes sur la chaine (evenement Initialize), pas devinees.
// ================================================================================================
// ⛔ MESURE DU 2026-09-14 (workflow verifie + sonde) : le fil Live ne suivait que 6 cles DEVINEES (ETH natif, sans hook,
//    fee/tickSpacing fixes). Sur Base, l essentiel des echanges de B20 passe par des pools d autres launchers, souvent a
//    hook et a frais dynamiques (fee 0x800000). Sur 2 000 blocs : 181 Initialize, dont 54 avec un 0xb2 ; les 8 recalcules
//    donnent tous poolId(cle) === topic1.
// ⛔ SIGNATURE LUE DANS v4-core (IPoolManager.sol) : Initialize(PoolId indexed id, Currency indexed currency0,
//    Currency indexed currency1, uint24 fee, int24 tickSpacing, IHooks hooks, uint160 sqrtPriceX96, int24 tick).
// ⛔⛔ UNE CLE DONT L IDENTIFIANT NE SE RECALCULE PAS EST REFUSEE (comptee illisible), jamais gardee.
// ⛔ LA CONFIANCE EST RENDUE AVEC LA POOL, parce que le fil n a le droit de dire « achat / vente » que la ou le sens du
//    Swap est prouve (pools sans hook) : NOTRE = format de l app ; SANS_HOOK = autre pool sans hook ; HOOK = un hook peut
//    modifier les montants — le fil y montre un echange NEUTRE, sans montant, et les cerveaux ne s en nourrissent pas.
// ⚠️ Une fenetre refusee (« backend response too large ») est COUPEE en deux jusqu a 250 blocs ; sinon elle est rendue
//    comme ratee — jamais lue comme « pas de pool ».
import { keccak256Hex } from './keccak.js';
import { cleDePool, poolId } from './pool.js';
import { TBLOCK_TEST_ANCIEN as TBLOCK, TBGAS, TBGAS_POOL_ID } from './tokenomics.js'; /* game354: in this file TBLOCK = the OLD test token, only to read its LEGACY pools (never shown as "TBLOCK"); the real TBLOCK is tokenomics.TBLOCK */

export const SIGNATURE_INITIALIZE = 'Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)';
export const TOPIC_INITIALIZE = keccak256Hex(new TextEncoder().encode(SIGNATURE_INITIALIZE));
export const CONFIANCES_POOL = ['NOTRE', 'SANS_HOOK', 'HOOK'];
export const FENETRE_DECOUVERTE = 2000;
export const FENETRE_MIN = 250;
const ETH = '0x0000000000000000000000000000000000000000';
const ZERO_HOOK = ETH;

const signe24 = (hex) => { const v = BigInt('0x' + hex); return Number(v >= (1n << 255n) ? v - (1n << 256n) : v); };
const estB20 = (a) => /^0xb2[0-9a-f]{38}$/.test(a);

/** La confiance d une cle : ce qu on a le droit d en dire. */
export function confianceDe(cle) {
  const c0 = String(cle.currency0).toLowerCase(), c1 = String(cle.currency1).toLowerCase();
  const hooks = String(cle.hooks || ZERO_HOOK).toLowerCase();
  if (hooks !== ZERO_HOOK) return 'HOOK';
  const avecEth = c0 === ETH || c1 === ETH, avecTblock = c0 === TBLOCK.toLowerCase() || c1 === TBLOCK.toLowerCase();
  if (cle.tickSpacing === 200 && ((avecEth && (cle.fee === 0 || cle.fee === 5000)) || (avecTblock && cle.fee === 0))) return 'NOTRE';
  return 'SANS_HOOK';
}

/**
 * Decode un log Initialize. `null` si ce n en est pas un ; `{ erreur }` s il est mal forme ou si son identifiant ne se
 * recalcule pas.
 */
export function decoderInitialize(log) {
  if (!log || !Array.isArray(log.topics) || String(log.topics[0] || '').toLowerCase() !== TOPIC_INITIALIZE) return null;
  const bloc = typeof log.blockNumber === 'string' ? parseInt(log.blockNumber, 16) : null;
  try {
    if (log.topics.length !== 4) throw new Error('topics inattendus');
    const d = String(log.data || '').toLowerCase().replace(/^0x/, '');
    if (d.length !== 5 * 64) throw new Error('data de ' + d.length / 2 + ' octets, 160 attendus');
    const adr = (t) => { if (!/^0x0{24}[0-9a-f]{40}$/.test(String(t).toLowerCase())) throw new Error('topic devise invalide'); return '0x' + String(t).toLowerCase().slice(26); };
    const currency0 = adr(log.topics[2]), currency1 = adr(log.topics[3]);
    const fee = Number(BigInt('0x' + d.slice(0, 64)));
    const tickSpacing = signe24(d.slice(64, 128));
    if (!/^0{24}/.test(d.slice(128, 192))) throw new Error('hooks n est pas une adresse');
    const hooks = '0x' + d.slice(152, 192);
    const cle = { currency0, currency1, fee, tickSpacing, hooks };
    const id = poolId(cleDePool(currency0, currency1, { fee, tickSpacing, hooks }));
    if (id.toLowerCase() !== String(log.topics[1]).toLowerCase()) throw new Error('poolId ne se recalcule pas');
    return { poolId: id.toLowerCase(), cle, bloc, confiance: confianceDe(cle), dynamique: (fee & 0x800000) !== 0,
      jetons: [currency0, currency1].filter(estB20) };
  } catch (e) {
    return { erreur: e.message, bloc };
  }
}

/**
 * Les pools initialisees entre deBloc et aBloc, pour les jetons suivis (ou tous les B20 si `jetons` est null).
 * @returns {Promise<{ pools: Map<string, object>, illisibles: object[], fenetresRatees: object[] }>}
 */
export async function decouvrirPools({ rpc, poolManager, deBloc, aBloc, jetons = null, pause = 0, dormir = null }) {
  const attendre = typeof dormir === 'function' ? dormir : (ms) => new Promise((ok) => setTimeout(ok, ms));
  const pools = new Map(), illisibles = [], fenetresRatees = [];
  const suivis = jetons ? new Set([...jetons].map((x) => String(x).toLowerCase())) : null;
  const pm = String(poolManager || '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(pm) || !Number.isSafeInteger(deBloc) || !Number.isSafeInteger(aBloc) || aBloc < deBloc) {
    return { pools, illisibles, fenetresRatees: [{ de: deBloc, a: aBloc, cause: 'invalid range or PoolManager' }] };
  }
  let appels = 0;
  const lire = async (de, a) => {
    if (appels++ && pause > 0) await attendre(pause);
    let logs;
    try {
      logs = await rpc('eth_getLogs', [{ address: pm, topics: [TOPIC_INITIALIZE], fromBlock: '0x' + de.toString(16), toBlock: '0x' + a.toString(16) }]);
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (/too large|-32020|limit exceeded|too many/i.test(msg) && a - de + 1 > FENETRE_MIN) {
        const milieu = de + Math.floor((a - de) / 2);
        await lire(de, milieu);
        await lire(milieu + 1, a);
        return;
      }
      fenetresRatees.push({ de, a, cause: msg });
      return;
    }
    if (!Array.isArray(logs)) { fenetresRatees.push({ de, a, cause: 'node answer is not a list' }); return; }
    for (const l of logs) {
      if (String(l.address || '').toLowerCase() !== pm) { illisibles.push({ cause: 'not from the PoolManager' }); continue; }
      const p = decoderInitialize(l);
      if (!p) continue;
      if (p.erreur) { illisibles.push({ cause: p.erreur, bloc: p.bloc }); continue; }
      const gardes = suivis ? p.jetons.filter((j) => suivis.has(j)) : p.jetons;
      if (!gardes.length) continue;
      pools.set(p.poolId, { ...p, jeton: gardes[0] });
    }
  };
  for (let de = deBloc; de <= aBloc; de += FENETRE_DECOUVERTE) await lire(de, Math.min(aBloc, de + FENETRE_DECOUVERTE - 1));
  return { pools, illisibles, fenetresRatees };
}

/**
 * tip 2342: when app CLES_MARCHE miss a live Dex pair (e.g. fee 375 / spacing 4),
 * resolve Uniswap v4 poolId via DexScreener then eth_getLogs Initialize(topic1=poolId).
 * @returns {Promise<object|null>} same shape as decouvrirPools entry, or null
 */
export async function lirePoolParDexScreener({ rpc, poolManager, jeton, fetchFn = fetch }) {
  const want = String(jeton || '').toLowerCase();
  const pm = String(poolManager || '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(want) || !/^0x[0-9a-f]{40}$/.test(pm)) return null;
  let pairs = [];
  try {
    const r = await fetchFn('https://api.dexscreener.com/token-pairs/v1/base/' + want);
    if (!r || !r.ok) return null;
    const j = await r.json();
    pairs = Array.isArray(j) ? j : [];
  } catch { return null; }
  const ETH0 = ETH;
  const cands = pairs.filter((p) => {
    if (!p || String(p.chainId || '').toLowerCase() !== 'base') return false;
    if (String(p.dexId || '').toLowerCase() !== 'uniswap') return false;
    const labels = Array.isArray(p.labels) ? p.labels.map((x) => String(x).toLowerCase()) : [];
    if (labels.length && !labels.includes('v4')) return false;
    const b = p.baseToken && String(p.baseToken.address || '').toLowerCase();
    const q = p.quoteToken && String(p.quoteToken.address || '').toLowerCase();
    if (b !== want && q !== want) return false;
    return b === ETH0 || q === ETH0 || b === TBLOCK.toLowerCase() || q === TBLOCK.toLowerCase();
  });
  /* tip 0016: TBGAS Launch poolId seed when Dex token-pairs still empty (index lag). */
  let pair = null;
  let poolIdHex = null;
  if (cands.length) {
    cands.sort((a, b) => (Number(b.liquidity && b.liquidity.usd) || 0) - (Number(a.liquidity && a.liquidity.usd) || 0));
    pair = cands[0];
    poolIdHex = String(pair.pairAddress || '').toLowerCase();
  } else if (want === String(TBGAS).toLowerCase()) {
    poolIdHex = String(TBGAS_POOL_ID).toLowerCase();
    pair = { url: 'https://dexscreener.com/base/' + poolIdHex, pairAddress: poolIdHex };
  }
  if (!poolIdHex || !/^0x[0-9a-f]{64}$/.test(poolIdHex)) return null;

  let head;
  try { head = parseInt(await rpc('eth_blockNumber', []), 16); } catch { return null; }
  if (!Number.isSafeInteger(head)) return null;

  const span = 2000;
  let log = null;
  for (let de = head - span; de > head - 120000; de -= span) {
    const a = Math.min(head, de + span - 1);
    const from = Math.max(0, de);
    let logs;
    try {
      logs = await rpc('eth_getLogs', [{
        address: pm,
        topics: [TOPIC_INITIALIZE, poolIdHex],
        fromBlock: '0x' + from.toString(16),
        toBlock: '0x' + a.toString(16),
      }]);
    } catch { continue; }
    if (Array.isArray(logs) && logs.length) { log = logs[0]; break; }
  }
  if (!log) return null;
  const dec = decoderInitialize(log);
  if (!dec || dec.erreur || !dec.cle) return null;
  return { ...dec, jeton: want, viaDex: pair.url || null, pairAddress: poolIdHex };
}
