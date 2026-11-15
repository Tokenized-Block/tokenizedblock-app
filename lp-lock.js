/* lp-lock.js -- the ONE place that turns the frozen record lp-lock-deploiement.js (TBlockLPLock: lock a full-range TBLOCK/wtCOIN v4
 *   position, its fees shared among the lockers who play) into the deploy transaction and judges what the chain did with it. Pure: no
 *   DOM, no wallet; reads go through an injected rpc(method, params). Used by deployer-lp-lock.html (rpc = the wallet provider) and
 *   test-lp-lock-deploiement.mjs (rpc = a mock, or a LOCAL fork).
 * NOTHING HERE SIGNS OR SENDS. NO ADDRESS IS TYPED HERE: the record's parameters are checked against the records they were copied from
 *   (pack, R2 record, etat-naissance.js), the poolId is recomputed from the key, and the constructor words at the end of the signed data
 *   must be exactly those parameters (what the page shows is what is signed).
 * Derived from lock-weekly.js (same record shape, same refusals), for an 11-word static constructor (the pool key is an inline tuple). */
import { keccak256Hex, selecteur } from './keccak.js';
import { adresse, adresseCreate, codeMasque, sha256Hex } from './pack-economie-v2.js';
import { PACK_ECONOMIE_V2 } from './economie-v2-pack-deploiement.js';
import { ADRESSES_PACK_ECONOMIE_V2 } from './economie-v2-pack-deploye.js';
import { LOCK_WEEKLY_DEPLOIEMENT } from './lock-weekly-deploiement.js';
import { POSITION_MANAGER } from './etat-naissance.js';

export const NOM = 'LP lock';
/* constructor(pm, (currency0, currency1, fee, tickSpacing, hooks), poolId, vault, guardian_, minL, rewards): 11 static words */
export const CHAMPS = Object.freeze(['pm', 'currency0', 'currency1', 'fee', 'tickSpacing', 'hooks', 'poolId', 'vault', 'guardian', 'minL', 'rewards']);
const ADRS = new Set(['pm', 'currency0', 'currency1', 'hooks', 'vault', 'guardian', 'rewards']);
/* the contract constants the verifier reads back on chain (TBlockLPLock.sol; test-lp-lock-deploiement reads them from the source) */
export const REGLE = Object.freeze({ minWeeks: 4, maxWeeks: 12, maxSpanWeeks: 26, markGraceS: 518400, claimWindowS: 7257600, rescueDelayS: 259200, epochS: 604800,
  fullRangeLower: -887220, fullRangeUpper: 887220 });

const hex = (x) => String(x == null ? '' : x).toLowerCase().replace(/^0x/, '');
const mot = (v) => { const n = BigInt(v); if (n < 0n || n >= (1n << 256n)) throw new Error('word out of range'); return n.toString(16).padStart(64, '0'); };
const motSigne = (v, bits) => { const n = BigInt(v); const m = 1n << BigInt(bits - 1); if (n < -m || n >= m) throw new Error('int' + bits + ' out of range'); return BigInt.asUintN(256, n).toString(16).padStart(64, '0'); };
const motAdresse = (a) => adresse(a).slice(2).padStart(64, '0');
const motB32 = (b) => { const h = hex(b); if (!/^[0-9a-f]{64}$/.test(h)) throw new Error('not a bytes32'); return h; };
function motDe(k, v) {
  if (ADRS.has(k)) return motAdresse(v);
  if (k === 'poolId') return motB32(v);
  if (k === 'fee') { if (BigInt(v) >= (1n << 24n)) throw new Error('fee out of uint24'); return mot(v); }
  if (k === 'tickSpacing') return motSigne(v, 24);
  if (k === 'minL') { if (BigInt(v) <= 0n || BigInt(v) >= (1n << 128n)) throw new Error('minL out of uint128 (or 0)'); return mot(v); }
  throw new Error('unknown field ' + k);
}
export function argsAttendus(p) { return CHAMPS.map((k) => motDe(k, p[k])).join(''); }
/** keccak256(abi.encode(PoolKey)): the v4 poolId of the record's key */
export function poolIdDe(p) {
  const h = ['currency0', 'currency1', 'fee', 'tickSpacing', 'hooks'].map((k) => motDe(k, p[k])).join('');
  const o = new Uint8Array(h.length / 2);
  for (let i = 0; i < o.length; i++) o[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16);
  return keccak256Hex(o);
}
const bas = (x) => String(x == null ? '' : x).toLowerCase();

export const MARQUE_V = '@V';
/** the record does not copy the holders vault address: parametres.vault is '@V' and creationModele holds '@V' at the vault word */
export function resoudre(rec) {
  const m = String((rec && rec.creationModele) || '').toLowerCase();
  if (m.split('@v').length !== 2) throw new Error('the creation template must name V exactly once');
  if (!rec.parametres || rec.parametres.vault !== MARQUE_V) throw new Error('parametres.vault must be the V marker');
  const V = adresse(ADRESSES_PACK_ECONOMIE_V2.V);
  const w = V.slice(2).padStart(64, '0');
  const creation = m.replace('@v', w);
  if (creation.indexOf(w) !== creation.length - 4 * 64) throw new Error('V is not at the vault word');
  return { creation, parametres: { ...rec.parametres, vault: V } };
}
const unites = (raw, dec = 18) => { const w = BigInt(raw); const e = w / 10n ** BigInt(dec), f = (w % 10n ** BigInt(dec)).toString().padStart(dec, '0').replace(/0+$/, ''); return e.toLocaleString('en-US') + (f ? '.' + f : ''); };
const eth = (wei) => unites(wei) + ' ETH';

/** the record matches its sha256, its constructor words, and the records it was copied from; [] = intact */
export async function integrite(rec) {
  const faux = [];
  if (!rec || typeof rec !== 'object') return ['no record'];
  let r;
  try { r = resoudre(rec); } catch (e) { return ['creation template: ' + (e.message || e)]; }
  const p = r.parametres, c = r.creation;
  if (!/^0x[0-9a-f]+$/.test(c)) return ['no creation data'];
  if ((await sha256Hex(c)) !== rec.sha256Creation) faux.push('sha256 of the data signed');
  if ((c.length - 2) / 2 !== rec.octetsCreation) faux.push('size of the data signed');
  let a = null;
  try { a = argsAttendus(p); } catch (e) { faux.push('parameters: ' + (e.message || e)); }
  if (a && c.slice(-a.length) !== a) faux.push('the constructor words at the end of the data are not the parameters shown');
  if (Number(rec.chaine) !== 8453) faux.push('network is not Base');
  const X = PACK_ECONOMIE_V2, Q = X.parametres, E = X.existants, R2 = LOCK_WEEKLY_DEPLOIEMENT;
  const eq = (x, y) => { try { return adresse(x) === adresse(y); } catch (_) { return false; } };
  if (!eq(rec.deployeur, R2.deployeur) || !eq(rec.deployeur, X.deployeur)) faux.push('deployer is not the R2 / pack deployer');
  if (!eq(p.guardian, R2.parametres.guardian) || !eq(p.guardian, Q.dev)) faux.push('guardian is not the guardian of R2 (the DEV wallet)');
  if (!eq(p.vault, ADRESSES_PACK_ECONOMIE_V2.V)) faux.push('vault is not the holders vault');
  if (!(R2.pret === true && R2.adresse) || !eq(p.rewards, R2.adresse)) faux.push('rewards is not the deployed R2');
  if (rec.sha256CreationR2 !== R2.sha256Creation) faux.push('the R2 record named is not the one served');
  if (!eq(p.pm, POSITION_MANAGER)) faux.push('pm is not the Uniswap v4 PositionManager of etat-naissance.js');
  if (!eq(p.currency0, E.wtcoin) || !eq(p.currency1, E.tblock)) faux.push('the pool is not wtCOIN (currency0) / TBLOCK (currency1)');
  try { if (poolIdDe(p) !== bas(p.poolId)) faux.push('poolId is not keccak256(abi.encode(key))'); } catch (e) { faux.push('pool key: ' + (e.message || e)); }
  if (rec.sha256Pack !== X.sha256Pack) faux.push('the pack record named is not the one served');
  if (!(Number(rec.runtimeOctets) > 0) || !/^[0-9a-f]{64}$/.test(String(rec.runtimeSha256Masque)) || !Array.isArray(rec.immutables) || !rec.immutables.length) faux.push('no frozen runtime');
  return faux;
}

/** the parameters in plain words, for the page: [k, v] rows, computed from the record */
export function lignes(rec) {
  const p = resoudre(rec).parametres, m = rec.mesureMinL || {};
  return [
    ['what it does', 'Locks a full-range TBLOCK/wtCOIN Uniswap position for 4 to 12 weeks. The swap fees of the locked positions are shared each week among the lockers who played that week. Nothing is promised: small trading means small fees.'],
    ['Uniswap v4 PositionManager', p.pm],
    ['pool (wtCOIN / TBLOCK, 0.3 %, tick spacing ' + p.tickSpacing + ')', p.poolId],
    ['pool hook', p.hooks],
    ['wtCOIN (currency0)', p.currency0],
    ['TBLOCK (currency1)', p.currency1],
    ['"played" is read from (holders vault V); unclaimed TBLOCK goes back to it', p.vault],
    ['unclaimed wtCOIN goes to (weekly lock rewards R2)', p.rewards],
    ['DEV wallet (rescue door for stray tokens only: public, 72 hours, cancelable)', p.guardian],
    ['minimum liquidity of a position (MIN_L)', String(p.minL) + (m.minLUsd ? ' (about $' + m.minLUsd + ' of position at block ' + m.bloc + '; a $5 position was ' + m.l5Usd + ')' : '')],
  ];
}

const non = (raison, plus = {}) => ({ pret: false, raison, ...plus });
const enAdr = (h) => { const m = String(h || '').replace(/^0x/, ''); return m.length >= 64 ? '0x' + m.slice(24, 64) : null; };
const enNb = (h) => { const m = String(h || '').replace(/^0x/, ''); return m.length >= 64 ? BigInt('0x' + m.slice(0, 64)) : null; };
const enSigne = (h, bits) => { const n = enNb(h); return n === null ? null : BigInt.asIntN(bits, n); };
async function lire(rpc, to, sig) { try { return await rpc('eth_call', [{ to, data: selecteur(sig) }, 'latest']); } catch (_) { return null; } }

export async function controleRuntime(rec, code) {
  const brut = String(code || '0x').replace(/^0x/, '').toLowerCase();
  const ko = [];
  if (brut.length / 2 !== Number(rec.runtimeOctets)) ko.push('runtime size ' + brut.length / 2 + ' bytes, frozen build ' + rec.runtimeOctets);
  else if ((await sha256Hex(codeMasque(brut, rec.immutables))) !== rec.runtimeSha256Masque) ko.push('runtime code is not the frozen build');
  return ko;
}

/** { pret: true, data, gas, ... } or { pret: false, raison }: same refusals as lock-weekly.js planDeploiement.
 *  Order: record intact -> marked ready -> not yet deployed -> the deployer -> THE CHAIN IS BASE -> a plain wallet -> no pending tx ->
 *  simulation gives the frozen code -> gas -> balance. Nothing reaches the wallet unless every step holds. */
export async function planDeploiement(rec, rpc, wallet) {
  const faux = await integrite(rec);
  if (faux.length) return non('record integrity MISMATCH: ' + faux.join(', '));
  if (rec.pret !== true) return non('the record is not marked ready: nothing can be signed');
  if (rec.adresse) return non('already deployed at ' + rec.adresse + ': nothing more to sign', { fait: true });
  let w;
  try { w = adresse(wallet); } catch (_) { return non('no wallet'); }
  if (w !== adresse(rec.deployeur)) return non('connected wallet ' + w + ' is not the deployer named in the record ' + rec.deployeur);
  const chaine = await rpc('eth_chainId', []).catch(() => null);
  let surBase = false;
  try { surBase = chaine !== null && BigInt(chaine) === BigInt(rec.chaine); } catch (_) { surBase = false; }
  if (!surBase) return non('switch the wallet to Base (' + rec.chaine + '): it is on ' + chaine, { chaine: true });
  const codeW = await rpc('eth_getCode', [w, 'latest']).catch(() => null);
  if (codeW === null) return non('wallet code not read: try again');
  if (codeW !== '0x' && codeW !== '0x0') return non('this wallet has contract code: use the plain wallet named in the record');
  const latest = await rpc('eth_getTransactionCount', [w, 'latest']).catch(() => null);
  const pending = await rpc('eth_getTransactionCount', [w, 'pending']).catch(() => null);
  if (latest === null || pending === null) return non('nonce not read: try again');
  if (BigInt(latest) !== BigInt(pending)) return non('the wallet has a pending transaction: wait until it is mined (or dropped)');
  const { creation: data } = resoudre(rec);
  let sim;
  try { sim = await rpc('eth_call', [{ from: w, data }, 'latest']); } catch (e) { return non('the simulation of the deploy reverts: ' + String((e && e.message) || e).slice(0, 200)); }
  const ko = await controleRuntime(rec, sim);
  if (ko.length) return non('the simulation does not give the frozen build: ' + ko.join(' · '));
  let gas;
  try { gas = BigInt(await rpc('eth_estimateGas', [{ from: w, data }])); } catch (e) { return non('gas not estimated: ' + String((e && e.message) || e).slice(0, 200)); }
  const prix = await rpc('eth_gasPrice', []).then(BigInt).catch(() => null);
  const solde = await rpc('eth_getBalance', [w, 'latest']).then(BigInt).catch(() => null);
  if (prix === null || solde === null) return non('gas price or balance not read: try again');
  const cout = gas * prix;
  if (solde < 2n * cout) return non('the wallet holds ' + eth(solde) + ', less than twice the estimated gas cost ' + eth(cout));
  const prevue = adresseCreate(w, BigInt(latest));
  return { pret: true, data, gas, gasEnvoi: (gas * 12n) / 10n, prix, cout, solde, nonce: BigInt(latest), adressePrevue: prevue,
    raison: 'Simulated: it deploys the frozen build (' + rec.runtimeOctets + ' bytes of code) at ' + prevue + ' for about ' + gas + ' gas (' + eth(cout) + ').' };
}

export function controleEnvoi(rec, wallet, tx, recu) {
  const ko = [];
  if (!tx) ko.push('transaction not found');
  if (!recu) ko.push('receipt not found');
  if (!tx || !recu) return ko;
  if (String(recu.status) !== '0x1') ko.push(NOM + ' FAILED on chain (status ' + recu.status + ')');
  let w = null;
  try { w = adresse(wallet); } catch (_) { ko.push('no wallet'); }
  if (w && bas(tx.from) !== w) ko.push('signed by ' + tx.from + ', not by ' + w);
  if (bas(tx.from) !== bas(rec.deployeur)) ko.push('signed by ' + tx.from + ', not by the deployer named in the record ' + rec.deployeur);
  if (tx.to) ko.push('not a contract creation (to = ' + tx.to + ')');
  if (bas(tx.input || tx.data) !== resoudre(rec).creation) ko.push('the signed data is not the frozen creation');
  const ca = recu.contractAddress ? bas(recu.contractAddress) : null;
  if (!ca) ko.push('the receipt names no contract address');
  else if (tx.from && tx.nonce !== undefined && ca !== adresseCreate(tx.from, BigInt(tx.nonce))) ko.push('contract address is not the CREATE address of the signer and its nonce');
  return ko;
}

/** every check of the deployed contract, from its transaction hash: { ok, lignes, adresse }. Reads only. */
export async function verifierLpLock(rec, hash, rpc) {
  const lignes = [];
  const t = (ok, quoi, vu = '') => { lignes.push({ ok: !!ok, quoi, vu: String(vu) }); return !!ok; };
  const faux = await integrite(rec);
  t(faux.length === 0, 'record integrity', faux.join(', ') || rec.sha256Creation);
  const chaine = await rpc('eth_chainId', []).catch(() => null);
  t(chaine !== null && BigInt(chaine) === BigInt(rec.chaine), 'network is Base', chaine);
  const tx = await rpc('eth_getTransactionByHash', [bas(hash)]).catch(() => null);
  const recu = await rpc('eth_getTransactionReceipt', [bas(hash)]).catch(() => null);
  t(!!tx && bas(tx.from) === bas(rec.deployeur), 'tx.from = the deployer named in the record', tx ? tx.from : 'no transaction');
  const ko = controleEnvoi(rec, rec.deployeur, tx, recu);
  t(ko.length === 0, 'status 1, a creation with exactly the frozen data, at the CREATE address', ko.join(' · ') || (recu && recu.contractAddress));
  const a = recu && recu.contractAddress ? bas(recu.contractAddress) : null;
  if (!a) return { ok: false, lignes, adresse: null };
  const code = await rpc('eth_getCode', [a, 'latest']).catch(() => null);
  const kr = await controleRuntime(rec, code);
  t(kr.length === 0, 'runtime code = the frozen build', kr.join(' · ') || a);
  const p = resoudre(rec).parametres;
  const eqA = async (sig, attendu, quoi, to = a) => { const v = enAdr(await lire(rpc, to, sig)); return t(v === adresse(attendu), quoi, v); };
  const eqN = async (sig, attendu, quoi, to = a) => { const v = enNb(await lire(rpc, to, sig)); return t(v !== null && v === BigInt(attendu), quoi, v); };
  await eqA('PM()', p.pm, 'PM() = the Uniswap v4 PositionManager');
  await eqA('CURRENCY0()', p.currency0, 'CURRENCY0() = wtCOIN');
  await eqA('CURRENCY1()', p.currency1, 'CURRENCY1() = TBLOCK');
  await eqN('FEE()', p.fee, 'FEE() = ' + p.fee);
  const ts = enSigne(await lire(rpc, a, 'TICK_SPACING()'), 24);
  t(ts !== null && ts === BigInt(p.tickSpacing), 'TICK_SPACING() = ' + p.tickSpacing, ts);
  await eqA('HOOKS()', p.hooks, 'HOOKS() = the pool hook');
  const pid = await lire(rpc, a, 'POOL_ID()');
  t(bas(pid) === bas(p.poolId), 'POOL_ID() = the poolId of the key', pid);
  await eqA('TBLOCK()', p.currency1, 'TBLOCK() = canonical TBLOCK');
  await eqA('WTCOIN()', p.currency0, 'WTCOIN() = wtCOIN');
  await eqA('VAULT()', p.vault, 'VAULT() = the holders vault V');
  await eqA('REWARDS()', p.rewards, 'REWARDS() = R2, the weekly lock rewards');
  await eqA('guardian()', p.guardian, 'guardian() = the DEV wallet (R2 guardian)');
  await eqN('MIN_L()', p.minL, 'MIN_L() = ' + p.minL);
  await eqN('EPOCH()', REGLE.epochS, 'EPOCH() = 7 days');
  const likes = enAdr(await lire(rpc, adresse(p.vault), 'LIKES()'));
  if (likes) { const g = enNb(await lire(rpc, likes, 'GENESIS()')); await eqN('T0()', g === null ? -1n : g, 'T0() = hearts GENESIS (V.LIKES())'); }
  else t(false, 'T0() = hearts GENESIS', 'V.LIKES() not read');
  await eqN('MIN_WEEKS()', REGLE.minWeeks, 'MIN_WEEKS() = 4');
  await eqN('MAX_WEEKS()', REGLE.maxWeeks, 'MAX_WEEKS() = 12');
  await eqN('MAX_SPAN_WEEKS()', REGLE.maxSpanWeeks, 'MAX_SPAN_WEEKS() = 26');
  await eqN('MARK_GRACE()', REGLE.markGraceS, 'MARK_GRACE() = 6 days');
  await eqN('CLAIM_WINDOW()', REGLE.claimWindowS, 'CLAIM_WINDOW() = 12 weeks');
  await eqN('RESCUE_DELAY()', REGLE.rescueDelayS, 'RESCUE_DELAY() = 72 hours');
  /* the three addresses R2 checks against are the ones this contract was built for */
  await eqA('TBLOCK()', p.currency1, 'R2.TBLOCK() = TBLOCK', p.rewards);
  await eqA('WTCOIN()', p.currency0, 'R2.WTCOIN() = wtCOIN', p.rewards);
  await eqA('VAULT()', p.vault, 'R2.VAULT() = V', p.rewards);
  return { ok: lignes.every((x) => x.ok), lignes, adresse: a };
}
