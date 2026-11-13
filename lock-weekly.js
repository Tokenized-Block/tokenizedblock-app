/* lock-weekly.js -- the ONE place that turns the frozen record lock-weekly-deploiement.js (TBlockLockRewardsWeekly, the weekly lock
 *   rewards) into the deploy transaction and judges what the chain did with it. Pure: no DOM, no wallet; reads go through an injected
 *   rpc(method, params). Used by deployer-lock-weekly.html (rpc = the wallet provider) and banc-lock-weekly-fork-20261114.mjs.
 * NOTHING HERE SIGNS OR SENDS. NO ADDRESS IS TYPED HERE: the record's parameters are checked against the pack records they were copied
 *   from, and the constructor words at the end of the signed data must be exactly those parameters (what the page shows is what is signed).
 * Derived from buyback-vault.js (same record shape, same checks), for a 7-word static constructor. */
import { selecteur } from './keccak.js';
import { adresse, adresseCreate, codeMasque, sha256Hex } from './pack-economie-v2.js';
import { PACK_ECONOMIE_V2 } from './economie-v2-pack-deploiement.js';
import { ADRESSES_PACK_ECONOMIE_V2 } from './economie-v2-pack-deploye.js';

export const NOM = 'Weekly lock rewards';
export const CHAMPS = Object.freeze(['tblock', 'wtcoin', 'lock', 'vault', 'guardian', 'maxPotWtcoin', 'maxPotTblock']);
const ADRS = new Set(['tblock', 'wtcoin', 'lock', 'vault', 'guardian']);
/* the contract constants the verifier reads back on chain (TBlockLockRewardsWeekly.sol; test-lock-weekly reads them from the source) */
export const REGLE = Object.freeze({ rewardBps: 700, markGraceS: 86400, claimWindowWeeks: 8, rescueDelayS: 259200, epochS: 604800 });

const mot = (v) => { const n = BigInt(v); if (n < 0n || n >= (1n << 256n)) throw new Error('word out of range'); return n.toString(16).padStart(64, '0'); };
const motAdresse = (a) => adresse(a).slice(2).padStart(64, '0');
export function argsAttendus(p) { return CHAMPS.map((k) => (ADRS.has(k) ? motAdresse(p[k]) : mot(p[k]))).join(''); }
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
  const X = PACK_ECONOMIE_V2, Q = X.parametres, E = X.existants;
  const eq = (x, y) => { try { return adresse(x) === adresse(y); } catch (_) { return false; } };
  if (!eq(rec.deployeur, X.deployeur)) faux.push('deployer is not the pack deployer');
  if (!eq(p.guardian, Q.dev)) faux.push('guardian is not the DEV wallet');
  if (!eq(p.vault, ADRESSES_PACK_ECONOMIE_V2.V)) faux.push('vault is not the holders vault');
  if (!eq(p.tblock, E.tblock)) faux.push('TBLOCK is not the canonical TBLOCK');
  if (!eq(p.wtcoin, E.wtcoin)) faux.push('wtCOIN is not the pack wtCOIN');
  if (!eq(p.lock, E.lock)) faux.push('lock is not the pack TBlockLock');
  if (String(p.maxPotWtcoin) !== (BigInt(Q.maxPotWtcoin) / 4n).toString() || String(p.maxPotTblock) !== (BigInt(Q.maxPotTblock) / 4n).toString()) faux.push('weekly caps are not the monthly caps / 4');
  if (rec.sha256Pack !== X.sha256Pack) faux.push('the pack record named is not the one served');
  if (!(Number(rec.runtimeOctets) > 0) || !/^[0-9a-f]{64}$/.test(String(rec.runtimeSha256Masque)) || !Array.isArray(rec.immutables) || !rec.immutables.length) faux.push('no frozen runtime');
  return faux;
}

/** the parameters in plain words, for the page: [k, v] rows, computed from the record */
export function lignes(rec) {
  const p = resoudre(rec).parametres;
  return [
    ['what it does', 'Every week, pays wtCOIN and TBLOCK to the lockers who played that week (a heart, a TAM mint or a skin bought), in proportion to their lock weight.'],
    ['each week', (REGLE.rewardBps / 100) + '% of its stock, at most ' + unites(p.maxPotWtcoin) + ' wtCOIN and ' + unites(p.maxPotTblock) + ' TBLOCK; the part of the lockers who did not play stays in the stock'],
    ['"played" is read from (' + 'Holders vault)', p.vault],
    ['locks are read from', p.lock],
    ['DEV wallet (rescue door: public, 72 hours, cancelable)', p.guardian],
    ['TBLOCK', p.tblock],
    ['wtCOIN', p.wtcoin],
  ];
}

const non = (raison, plus = {}) => ({ pret: false, raison, ...plus });
const enAdr = (h) => { const m = String(h || '').replace(/^0x/, ''); return m.length >= 64 ? '0x' + m.slice(24, 64) : null; };
const enNb = (h) => { const m = String(h || '').replace(/^0x/, ''); return m.length >= 64 ? BigInt('0x' + m.slice(0, 64)) : null; };
async function lire(rpc, to, sig) { try { return await rpc('eth_call', [{ to, data: selecteur(sig) }, 'latest']); } catch (_) { return null; } }

export async function controleRuntime(rec, code) {
  const brut = String(code || '0x').replace(/^0x/, '').toLowerCase();
  const ko = [];
  if (brut.length / 2 !== Number(rec.runtimeOctets)) ko.push('runtime size ' + brut.length / 2 + ' bytes, frozen build ' + rec.runtimeOctets);
  else if ((await sha256Hex(codeMasque(brut, rec.immutables))) !== rec.runtimeSha256Masque) ko.push('runtime code is not the frozen build');
  return ko;
}

/** { pret: true, data, gas, ... } or { pret: false, raison }: same refusals as buyback-vault.js planDeploiement */
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
export async function verifierLockWeekly(rec, hash, rpc) {
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
  const eqN = async (sig, attendu, quoi) => { const v = enNb(await lire(rpc, a, sig)); return t(v !== null && v === BigInt(attendu), quoi, v); };
  await eqA('TBLOCK()', p.tblock, 'TBLOCK() = canonical TBLOCK');
  await eqA('WTCOIN()', p.wtcoin, 'WTCOIN()');
  await eqA('LOCK()', p.lock, 'LOCK() = TBlockLock v1');
  await eqA('VAULT()', p.vault, 'VAULT() = the holders vault V');
  const likes = enAdr(await lire(rpc, adresse(p.vault), 'LIKES()'));
  await eqA('LIKES()', likes || '0x0000000000000000000000000000000000000000', 'LIKES() = V.LIKES() (the hearts week grid)');
  await eqA('guardian()', p.guardian, 'guardian() = the DEV wallet');
  await eqN('EPOCH()', REGLE.epochS, 'EPOCH() = 7 days');
  if (likes) { const g = enNb(await lire(rpc, likes, 'GENESIS()')); await eqN('T0()', g === null ? -1n : g, 'T0() = hearts GENESIS'); }
  await eqN('REWARD_BPS()', REGLE.rewardBps, 'REWARD_BPS() = ' + REGLE.rewardBps);
  await eqN('MARK_GRACE()', REGLE.markGraceS, 'MARK_GRACE() = 1 day');
  await eqN('CLAIM_WINDOW()', REGLE.claimWindowWeeks, 'CLAIM_WINDOW() = 8 weeks');
  await eqN('RESCUE_DELAY()', REGLE.rescueDelayS, 'RESCUE_DELAY() = 72 hours');
  await eqN('MAX_POT_WTCOIN()', p.maxPotWtcoin, 'MAX_POT_WTCOIN() = ' + unites(p.maxPotWtcoin) + ' wtCOIN');
  await eqN('MAX_POT_TBLOCK()', p.maxPotTblock, 'MAX_POT_TBLOCK() = ' + unites(p.maxPotTblock) + ' TBLOCK');
  return { ok: lignes.every((x) => x.ok), lignes, adresse: a };
}
