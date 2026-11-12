/* buyback-vault.js -- the ONE place that turns the frozen record tblock-buyback-vault-deploiement.js (the TBLOCK buyback that pays the
 *   holders vault) into the deploy transaction and judges what the chain did with it. Pure: no DOM, no wallet; reads go through an
 *   injected rpc(method, params). Used by deployer-tblock-buyback-vault.html (rpc = the wallet provider), verifier-buyback-vault.mjs and
 *   contracts/noter-deploiement-buyback-vault.mjs (rpc = Base nodes).
 * NOTHING HERE SIGNS OR SENDS. The page asks the CONNECTED wallet to sign ONE transaction; this module only builds data and reads.
 * NO ADDRESS IS TYPED HERE: the record's parameters are checked against the pack records they were copied from (economie-v2-pack-
 *   deploiement.js: deployer, DEV, second dev wallet; economie-v2-pack-deploye.js: the holders vault V), and the constructor words at the
 *   end of the signed data must be exactly those parameters, so what the page shows is what is signed. */
import { keccak256, selecteur } from './keccak.js';
import { adresse, adresseCreate, codeMasque, sha256Hex } from './pack-economie-v2.js';
import { PACK_ECONOMIE_V2 } from './economie-v2-pack-deploiement.js';
import { ADRESSES_PACK_ECONOMIE_V2 } from './economie-v2-pack-deploye.js';

/* UI copy rule (Phil 2026-11-12): product names only on screen */
export const NOM = 'TBLOCK buyback';
export const NOM_VAULT = 'Holders vault';
/* the door's two durations = the contract constants DEST_DELAY (7 days) and DEST_WINDOW (2 days), TBlockBuybackVault.sol; the test reads
 *   them from the source and the verifier reads them on chain after the deploy */
export const PORTE = Object.freeze({ delaiS: 604800, fenetreS: 172800 });
/* the constructor tuple, in its order (the preparer checks the same order against the forge ABI) */
export const CHAMPS = Object.freeze(['poolManager', 'v4Key', 'v3Pool', 'weth', 'wtcoin', 'tblock', 'keeper', 'publicDelay', 'maxPerCall', 'minSpend',
  'cooldown', 'twapWindow', 'maxV3DevTicks', 'maxV4ImpactTicks', 'maxHookPpm', 'tipBps', 'maxTip', 'dest', 'guardian', 'veto']);
const ADRS = new Set(['poolManager', 'v3Pool', 'weth', 'wtcoin', 'tblock', 'keeper', 'dest', 'guardian', 'veto']);
export const MOTS_CONSTRUCTEUR = 24; /* 20 fields, the pool key inline = 5 words: every field is static */

const mot = (v) => {
  let n = BigInt(v);
  if (n < 0n) n = (1n << 256n) + n;
  if (n < 0n || n >= (1n << 256n)) throw new Error('word out of range');
  return n.toString(16).padStart(64, '0');
};
const motAdresse = (a) => adresse(a).slice(2).padStart(64, '0');
/** the 24 constructor words (hex, no 0x) the record's parameters encode to */
export function argsAttendus(p) {
  const w = [];
  for (const k of CHAMPS) {
    const v = p[k];
    if (k === 'v4Key') { if (!Array.isArray(v) || v.length !== 5) throw new Error('bad pool key'); w.push(motAdresse(v[0]), motAdresse(v[1]), mot(v[2]), mot(v[3]), motAdresse(v[4])); }
    else if (ADRS.has(k)) w.push(motAdresse(v));
    else w.push(mot(v));
  }
  return w.join('');
}

const bas = (x) => String(x == null ? '' : x).toLowerCase();
/** the record does not copy the holders vault address (the pack's addresses live in economie-v2-pack-deploye.js only): parametres.dest is
 *  '@V' and creationModele holds '@V' in place of the dest word. This puts V back; throws on any other shape. */
export const MARQUE_V = '@V';
export function resoudre(rec) {
  const m = String((rec && rec.creationModele) || '').toLowerCase();
  if (m.split('@v').length !== 2) throw new Error('the creation template must name V exactly once');
  if (!rec.parametres || rec.parametres.dest !== MARQUE_V) throw new Error('parametres.dest must be the V marker');
  const V = adresse(ADRESSES_PACK_ECONOMIE_V2.V);
  const creation = m.replace('@v', V.slice(2).padStart(64, '0'));
  if (creation.indexOf(V.slice(2).padStart(64, '0')) !== creation.length - 3 * 64) throw new Error('V is not at the dest word');
  return { creation, parametres: { ...rec.parametres, dest: V } };
}
const ms = (s) => (s % 86400 === 0 ? s / 86400 + (s === 86400 ? ' day' : ' days') : s % 3600 === 0 ? s / 3600 + (s === 3600 ? ' hour' : ' hours') : s % 60 === 0 ? s / 60 + ' minutes' : s + ' s');
const eth = (wei) => { const w = BigInt(wei); const e = w / 10n ** 18n, f = (w % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, ''); return e + (f ? '.' + f : '') + ' ETH'; };
export const fmtEth = eth;
export const duree = ms;

/** the record matches its sha256, its constructor words, and the pack records it was copied from; [] = intact */
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
  const X = PACK_ECONOMIE_V2, Q = X.parametres;
  const eq = (x, y) => { try { return adresse(x) === adresse(y); } catch (_) { return false; } };
  if (!eq(rec.deployeur, X.deployeur)) faux.push('deployer is not the pack deployer');
  if (!eq(p.guardian, Q.dev)) faux.push('guardian is not the DEV wallet');
  if (!eq(p.veto, Q.dev2)) faux.push('veto is not the second dev wallet');
  if (!eq(p.dest, ADRESSES_PACK_ECONOMIE_V2.V)) faux.push('dest is not the holders vault');
  if (!eq(p.tblock, X.existants.tblock)) faux.push('TBLOCK is not the canonical TBLOCK');
  if (eq(p.keeper, p.guardian) || eq(p.keeper, p.veto) || eq(p.guardian, p.veto)) faux.push('keeper, guardian and veto are not three different keys');
  if (rec.sha256Pack !== X.sha256Pack) faux.push('the pack record named is not the one served');
  if (!(Number(rec.runtimeOctets) > 0) || !/^[0-9a-f]{64}$/.test(String(rec.runtimeSha256Masque)) || !Array.isArray(rec.immutables) || !rec.immutables.length) faux.push('no frozen runtime');
  return faux;
}

/** the parameters in plain words, for the page: [k, v] rows. Durations and amounts are computed from the record, never typed */
export function lignes(rec) {
  const p = resoudre(rec).parametres;
  return [
    ['what it does', 'Buys TBLOCK with the ETH sent to it (ETH to wtCOIN to TBLOCK) and pays every TBLOCK bought to the ' + NOM_VAULT + '.'],
    ['pays to (' + NOM_VAULT + ')', p.dest],
    ['per call / cooldown', eth(p.maxPerCall) + ' at most, at least ' + eth(p.minSpend) + ' / ' + (Number(p.cooldown) === 3600 ? 'once an hour' : 'once every ' + ms(Number(p.cooldown)))],
    ['keeper (calls it first)', p.keeper],
    ['anyone else may call', 'after ' + ms(Number(p.publicDelay)) + ' without a keeper call, for a tip of ' + (Number(p.tipBps) / 100) + '% of the call, at most ' + eth(p.maxTip)],
    ['DEV wallet (proposes a new vault)', p.guardian],
    ['second dev wallet (can cancel)', p.veto],
    ['exit door', regleDePorte(rec)],
    ['price guards', 'average price over ' + ms(Number(p.twapWindow)) + ' (at most ' + p.maxV3DevTicks + ' ticks off), own impact at most ' + p.maxV4ImpactTicks + ' ticks, pool hook cut at most ' + p.maxHookPpm + ' ppm'],
    ['TBLOCK', p.tblock],
    ['wtCOIN', p.wtcoin],
    ['WETH', p.weth],
    ['WETH/wtCOIN pool', p.v3Pool],
    ['TBLOCK pool key', p.v4Key.join(' , ')],
    ['pool manager', p.poolManager],
  ];
}

/** the exit-door rule in plain words (the page, the fees page and the tests use this one sentence) */
export function regleDePorte() {
  return 'The DEV wallet can propose a new vault. The proposal is public on chain and can take effect only ' + ms(PORTE.delaiS)
    + ' later, within the ' + ms(PORTE.fenetreS) + ' after that; until then the second dev wallet can cancel it. If it is not cancelled, the new vault receives every TBLOCK bought from then on. Either wallet can close the door for good. Neither can ever withdraw ETH or TBLOCK from the buyback.';
}

const non = (raison, plus = {}) => ({ pret: false, raison, ...plus });
const enAdr = (h) => { const m = String(h || '').replace(/^0x/, ''); return m.length >= 64 ? '0x' + m.slice(24, 64) : null; };
const enNb = (h) => { const m = String(h || '').replace(/^0x/, ''); return m.length >= 64 ? BigInt('0x' + m.slice(0, 64)) : null; };
async function lire(rpc, to, sig) { try { return await rpc('eth_call', [{ to, data: selecteur(sig) }, 'latest']); } catch (_) { return null; } }

/** the runtime the chain holds (or would hold) is the frozen build: [] = same */
export async function controleRuntime(rec, code) {
  const brut = String(code || '0x').replace(/^0x/, '').toLowerCase();
  const ko = [];
  if (brut.length / 2 !== Number(rec.runtimeOctets)) ko.push('runtime size ' + brut.length / 2 + ' bytes, frozen build ' + rec.runtimeOctets);
  else if ((await sha256Hex(codeMasque(brut, rec.immutables))) !== rec.runtimeSha256Masque) ko.push('runtime code is not the frozen build');
  return ko;
}

/**
 * What the page may do, decided from the record and the chain only. { pret: true, data, gas, prix, cout, nonce } or { pret: false, raison }.
 * Refuses: a broken record, a record not marked ready, a buyback already recorded, another network, another wallet than the record's
 * deployer, a wallet with contract code, a pending transaction, a vault without code or of another token, a simulation that reverts or
 * returns another runtime than the frozen build, not enough ETH for twice the estimated gas.
 */
export async function planDeploiement(rec, rpc, wallet) {
  const faux = await integrite(rec);
  if (faux.length) return non('record integrity MISMATCH: ' + faux.join(', '));
  if (rec.pret !== true) return non('the record is not marked ready: nothing can be signed');
  if (rec.adresse) return non('already deployed at ' + rec.adresse + ': nothing more to sign', { fait: true });
  let w;
  try { w = adresse(wallet); } catch (_) { return non('no wallet'); }
  if (w !== adresse(rec.deployeur)) return non('connected wallet ' + w + ' is not the deployer named in the record ' + rec.deployeur);
  const chaine = await rpc('eth_chainId', []).catch(() => null);
  if (chaine === null || BigInt(chaine) !== BigInt(rec.chaine)) return non('switch the wallet to Base (' + rec.chaine + ')');
  const codeW = await rpc('eth_getCode', [w, 'latest']).catch(() => null);
  if (codeW === null) return non('wallet code not read: try again');
  if (codeW !== '0x' && codeW !== '0x0') return non('this wallet has contract code (smart wallet or delegated account): use the plain wallet named in the record');
  const latest = await rpc('eth_getTransactionCount', [w, 'latest']).catch(() => null);
  const pending = await rpc('eth_getTransactionCount', [w, 'pending']).catch(() => null);
  if (latest === null || pending === null) return non('nonce not read: try again');
  if (BigInt(latest) !== BigInt(pending)) return non('the wallet has a pending transaction: wait until it is mined (or dropped)');
  const { creation, parametres: p } = resoudre(rec);
  const codeV = await rpc('eth_getCode', [adresse(p.dest), 'latest']).catch(() => null);
  if (!codeV || codeV === '0x') return non('the ' + NOM_VAULT + ' has no code at ' + p.dest + ': STOP');
  const tbV = enAdr(await lire(rpc, adresse(p.dest), 'TBLOCK()'));
  if (tbV !== adresse(p.tblock)) return non('the ' + NOM_VAULT + ' does not answer TBLOCK() = ' + p.tblock + ': STOP');
  const data = creation;
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
  return { pret: true, data, gas, gasEnvoi: (gas * 12n) / 10n, prix, cout, solde, nonce: BigInt(latest), adressePrevue: adresseCreate(w, BigInt(latest)),
    raison: 'Simulated: it deploys the frozen build (' + rec.runtimeOctets + ' bytes of code) at ' + adresseCreate(w, BigInt(latest)) + ' for about ' + gas + ' gas (' + eth(cout) + ' at the current gas price).' };
}

/** what the page checks on the sent transaction and its receipt; [] = all good */
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
  if (bas(tx.input || tx.data) !== resoudre(rec).creation) ko.push('the signed data is not the frozen ' + NOM + ' creation');
  const ca = recu.contractAddress ? bas(recu.contractAddress) : null;
  if (!ca) ko.push('the receipt names no contract address');
  else if (tx.from && tx.nonce !== undefined && ca !== adresseCreate(tx.from, BigInt(tx.nonce))) ko.push('contract address ' + ca + ' is not the CREATE address of the signer and its nonce');
  if (recu.transactionHash && tx.hash && bas(recu.transactionHash) !== bas(tx.hash)) ko.push('the receipt is not the one of this transaction');
  return ko;
}

/**
 * Every check of the deployed buyback, read on chain from its transaction hash: { ok, lignes: [{ ok, quoi, vu }], adresse }.
 * opts.keeper = the keeper expected (default: the record's). Nothing is sent: eth_chainId, eth_getTransactionByHash,
 * eth_getTransactionReceipt, eth_getCode, eth_call.
 */
export async function verifierBuybackVault(rec, hash, rpc, opts = {}) {
  const lignes = [];
  const t = (ok, quoi, vu = '') => { lignes.push({ ok: !!ok, quoi, vu: String(vu) }); return !!ok; };
  const faux = await integrite(rec);
  t(faux.length === 0, 'record integrity (sha256 of the data, constructor words = the parameters, copied from the pack records)', faux.join(', ') || rec.sha256Creation);
  t(/^0x[0-9a-f]{64}$/.test(bas(hash)), 'a transaction hash', hash);
  const chaine = await rpc('eth_chainId', []).catch(() => null);
  t(chaine !== null && BigInt(chaine) === BigInt(rec.chaine), 'network is Base (' + rec.chaine + ')', chaine);
  const tx = await rpc('eth_getTransactionByHash', [bas(hash)]).catch(() => null);
  const recu = await rpc('eth_getTransactionReceipt', [bas(hash)]).catch(() => null);
  t(!!tx && bas(tx.from) === bas(rec.deployeur), 'tx.from = the deployer named in the record ' + rec.deployeur, tx ? tx.from : 'no transaction');
  t(!!recu && String(recu.status) === '0x1', 'status 1', recu ? recu.status : 'no receipt');
  const ko = controleEnvoi(rec, rec.deployeur, tx, recu);
  t(ko.length === 0, 'a contract creation with exactly the frozen data, at the CREATE address of the deployer and its nonce', ko.join(' · ') || (recu && recu.contractAddress));
  const a = recu && recu.contractAddress ? bas(recu.contractAddress) : null;
  if (!a) return { ok: false, lignes, adresse: null };
  const code = await rpc('eth_getCode', [a, 'latest']).catch(() => null);
  const kr = await controleRuntime(rec, code);
  t(kr.length === 0, 'runtime code = the frozen build (' + rec.runtimeOctets + ' bytes, ' + rec.immutables.length + ' immutable slots masked)', kr.join(' · ') || a);
  const p = resoudre(rec).parametres;
  const keeper = opts.keeper ? adresse(opts.keeper) : adresse(p.keeper);
  const eqA = async (sig, attendu, quoi, to = a) => { const v = enAdr(await lire(rpc, to, sig)); return t(v === adresse(attendu), quoi, v); };
  const eqN = async (sig, attendu, quoi, to = a) => { const v = enNb(await lire(rpc, to, sig)); return t(v !== null && v === BigInt(attendu), quoi, v); };
  await eqA('DEST()', ADRESSES_PACK_ECONOMIE_V2.V, 'DEST() = the ' + NOM_VAULT + ' V ' + ADRESSES_PACK_ECONOMIE_V2.V);
  const codeV = await rpc('eth_getCode', [adresse(p.dest), 'latest']).catch(() => null);
  const hV = codeV ? '0x' + [...keccak256(Uint8Array.from((String(codeV).replace(/^0x/, '').match(/../g) || []).map((x) => parseInt(x, 16))))].map((b) => b.toString(16).padStart(2, '0')).join('') : null;
  const dch = await lire(rpc, a, 'destCodehash()');
  t(!!hV && bas(dch) === hV, 'destCodehash() = keccak256 of the ' + NOM_VAULT + ' code', dch);
  await eqA('GUARDIAN()', PACK_ECONOMIE_V2.parametres.dev, 'GUARDIAN() = the DEV wallet ' + PACK_ECONOMIE_V2.parametres.dev);
  await eqA('DEV()', p.guardian, NOM_VAULT + '.DEV() = GUARDIAN (the same DEV wallet on both)', adresse(p.dest));
  await eqA('VETO()', PACK_ECONOMIE_V2.parametres.dev2, 'VETO() = the second dev wallet ' + PACK_ECONOMIE_V2.parametres.dev2);
  await eqA('DEV2()', p.veto, NOM_VAULT + '.DEV2() = VETO', adresse(p.dest));
  await eqA('KEEPER()', keeper, 'KEEPER() = the expected keeper ' + keeper);
  await eqA('TBLOCK()', PACK_ECONOMIE_V2.existants.tblock, 'TBLOCK() = canonical TBLOCK');
  await eqA('TBLOCK()', PACK_ECONOMIE_V2.existants.tblock, NOM_VAULT + '.TBLOCK() = canonical TBLOCK', adresse(p.dest));
  await eqA('POOL_MANAGER()', p.poolManager, 'POOL_MANAGER()');
  await eqA('V3_POOL()', p.v3Pool, 'V3_POOL() = the WETH/wtCOIN pool');
  await eqA('WETH()', p.weth, 'WETH()');
  await eqA('WTCOIN()', p.wtcoin, 'WTCOIN()');
  t(bas(await lire(rpc, a, 'V4_POOL_ID()')) === bas(PACK_ECONOMIE_V2.existants.v4PoolId), 'V4_POOL_ID() = the pinned TBLOCK pool id');
  await eqN('PUBLIC_DELAY()', p.publicDelay, 'PUBLIC_DELAY() = ' + p.publicDelay + ' s');
  await eqN('MAX_PER_CALL()', p.maxPerCall, 'MAX_PER_CALL() = ' + eth(p.maxPerCall));
  await eqN('MIN_SPEND()', p.minSpend, 'MIN_SPEND() = ' + eth(p.minSpend));
  await eqN('COOLDOWN()', p.cooldown, 'COOLDOWN() = ' + p.cooldown + ' s');
  await eqN('TWAP_WINDOW()', p.twapWindow, 'TWAP_WINDOW() = ' + p.twapWindow + ' s');
  await eqN('MAX_V3_DEV_TICKS()', p.maxV3DevTicks, 'MAX_V3_DEV_TICKS() = ' + p.maxV3DevTicks);
  await eqN('MAX_V4_IMPACT_TICKS()', p.maxV4ImpactTicks, 'MAX_V4_IMPACT_TICKS() = ' + p.maxV4ImpactTicks);
  await eqN('MAX_HOOK_PPM()', p.maxHookPpm, 'MAX_HOOK_PPM() = ' + p.maxHookPpm);
  await eqN('TIP_BPS()', p.tipBps, 'TIP_BPS() = ' + p.tipBps);
  await eqN('MAX_TIP()', p.maxTip, 'MAX_TIP() = ' + p.maxTip + ' wei');
  await eqN('DEST_DELAY()', PORTE.delaiS, 'DEST_DELAY() = ' + ms(PORTE.delaiS) + ' (the door delay)');
  await eqN('DEST_WINDOW()', PORTE.fenetreS, 'DEST_WINDOW() = ' + ms(PORTE.fenetreS) + ' (the door window)');
  await eqN('doorRenounced()', 0, 'doorRenounced() = false (the door is open)');
  await eqA('pendingDest()', '0x0000000000000000000000000000000000000000', 'pendingDest() = none (no proposal)');
  return { ok: lignes.every((x) => x.ok), lignes, adresse: a };
}
