/* pack-economie-v2.js — the ONE place that turns the frozen pack record (economie-v2-pack-deploiement.js) into transactions and judges
 *   what the chain did with them. Pure: no DOM, no wallet; reads go through an injected rpc(method, params). Used by
 *   deployer-economie-v2.html (in the browser, rpc = the wallet provider) and by verifier-pack-economie-v2.mjs (node, rpc = Base RPC).
 * ⛔ NOTHING HERE SIGNS OR SENDS. The page asks the CONNECTED wallet to sign; this module only builds data and reads.
 * ⛔ ADDRESSES ARE NEVER TYPED: L,P,T,S come from receipts, V,R are CREATE addresses computed from the wallet and its nonce
 *   (keccak256(rlp([wallet, nonce]))[12:]). A deployed address that differs from the prediction stops everything. */
import { keccak256, selecteur } from './keccak.js';

export const LETTRES = Object.freeze(['L', 'P', 'T', 'S', 'V', 'R']);
/* UI copy rule (Phil 2026-11-12): every line the page can show names the PRODUCT, never a contract version (e.nom stays in the record) */
export const PRODUIT = Object.freeze({ L: 'Hearts', P: 'TBLOCK payment router', T: 'TAM art', S: 'Skins', V: 'Holders vault', R: 'Lock rewards' });
const produit = (e) => PRODUIT[e.lettre] || e.nom;
const hexA = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
const octets = (hex) => { const h = String(hex).replace(/^0x/, ''); if (h.length % 2 || /[^0-9a-f]/i.test(h)) throw new Error('bad hex'); const o = new Uint8Array(h.length / 2); for (let i = 0; i < o.length; i++) o[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16); return o; };
export const adresse = (x) => { const v = String(x || '').toLowerCase(); if (!/^0x[0-9a-f]{40}$/.test(v)) throw new Error('not an address: ' + x); return v; };

/** CREATE address of `from` at `nonce` = keccak256(rlp([from, nonce]))[12:] */
export function adresseCreate(from, nonce) {
  const a = octets(adresse(from));
  let n = BigInt(nonce);
  if (n < 0n) throw new Error('negative nonce');
  let nb;
  if (n === 0n) nb = [0x80];
  else { const b = []; while (n > 0n) { b.unshift(Number(n & 0xffn)); n >>= 8n; } nb = b.length === 1 && b[0] < 0x80 ? b : [0x80 + b.length, ...b]; }
  const corps = [0x94, ...a, ...nb];
  return '0x' + hexA(keccak256(Uint8Array.from([0xc0 + corps.length, ...corps]))).slice(24);
}

/** the six pack addresses for a wallet whose FIRST pack deploy uses nonce N */
export function predire(wallet, N) {
  const o = {};
  LETTRES.forEach((l, k) => { o[l] = adresseCreate(wallet, BigInt(N) + BigInt(k)); });
  return o;
}

/** the creation data of step i (0..5) with the pack addresses substituted; throws if one it needs is missing */
export function creationEtape(rec, i, adr) {
  const e = rec.etapes[i];
  if (!e) throw new Error('no step ' + i);
  return e.init + e.args.map((x) => {
    if (x[0] !== '@') return x;
    const a = adr && adr[x.slice(1)];
    if (!a) throw new Error(produit(e) + ' needs ' + x.slice(1));
    return adresse(a).slice(2).padStart(64, '0');
  }).join('');
}

export async function sha256Hex(s) {
  const b = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return hexA(new Uint8Array(b));
}

/** the wiring the pack must carry (Phil 2026-11-12, "a heart counts as play everywhere"): Likes is built with rewards = R (its LAST
 *  constructor word, predicted like T and S), the vault lists [T, S], the lock rewards list [L, T, S] (their trailing address[]).
 *  A record from an older preparer (14-field Likes, R listing [T, S]) is refused here, before anything is offered. [] = the right wiring */
export function cablage(rec) {
  const faux = [];
  const e = rec && Array.isArray(rec.etapes) ? rec.etapes : [];
  const fin = (k, n) => (e[k] && Array.isArray(e[k].args) ? e[k].args.slice(-n).join(',') : '');
  const liste = (k) => (e[k] && e[k].config && Array.isArray(e[k].config.games) ? e[k].config.games.join(',') : '');
  if (!e[0] || e[0].args[e[0].args.length - 1] !== '@R' || e[0].args.filter((x) => x === '@R').length !== 1 || (e[0].config || {}).rewards !== '@R') faux.push('L does not name R');
  if (fin(4, 3) !== '0000000000000000000000000000000000000000000000000000000000000002,@T,@S' || liste(4) !== '@T,@S') faux.push('V does not list [T, S]');
  if (fin(5, 4) !== '0000000000000000000000000000000000000000000000000000000000000003,@L,@T,@S' || liste(5) !== '@L,@T,@S') faux.push('R does not list [L, T, S]');
  return faux;
}

/** the record matches its own sha256 (each step's template, then the whole pack) and carries the pack wiring; [] = intact */
export async function integrite(rec) {
  const faux = [];
  for (const e of rec.etapes) if ((await sha256Hex(e.init + '|' + e.args.join(','))) !== e.sha256Modele) faux.push(produit(e));
  if ((await sha256Hex(rec.etapes.map((e) => e.sha256Modele).join(','))) !== rec.sha256Pack) faux.push('pack');
  if (rec.etapes.length !== 6 || rec.etapes.some((e, k) => e.lettre !== LETTRES[k])) faux.push('order');
  faux.push(...cablage(rec));
  return faux;
}

/** runtime code with the immutable slots zeroed: what the frozen runtimeSha256Masque was computed on */
export function codeMasque(code, immutables) {
  let h = String(code).replace(/^0x/, '').toLowerCase();
  for (const [s, l] of immutables) h = h.slice(0, 2 * s) + '0'.repeat(2 * l) + h.slice(2 * (s + l));
  return h;
}

/** what the page must check on step k's transaction and receipt before it may go on; [] = all good */
export function controleEtape(rec, k, wallet, N, adr, tx, recu) {
  const ko = [];
  const pred = predire(wallet, N);
  const e = rec.etapes[k];
  if (!tx) ko.push('transaction not found');
  if (!recu) ko.push('receipt not found');
  if (!tx || !recu) return ko;
  if (String(recu.status) !== '0x1') ko.push(produit(e) + ' FAILED on chain (status ' + recu.status + ')');
  if (adresse(tx.from) !== adresse(wallet)) ko.push('signed by ' + tx.from + ', not by ' + wallet);
  if (tx.to) ko.push('not a contract creation (to = ' + tx.to + ')');
  if (BigInt(tx.nonce) !== BigInt(N) + BigInt(k)) ko.push('nonce ' + BigInt(tx.nonce) + ' instead of ' + (BigInt(N) + BigInt(k)) + ': another transaction used a pack nonce');
  const ca = recu.contractAddress ? String(recu.contractAddress).toLowerCase() : null;
  if (ca !== pred[e.lettre]) ko.push(produit(e) + ' deployed at ' + ca + ', predicted ' + pred[e.lettre] + ': STOP');
  let attendu = null;
  try { attendu = creationEtape(rec, k, adr); } catch (x) { ko.push(String(x.message || x)); }
  if (attendu && String(tx.input || tx.data || '').toLowerCase() !== attendu.toLowerCase()) ko.push('the signed data is not the frozen ' + produit(e) + ' creation');
  return ko;
}

/**
 * What the page may do next, decided ONLY from the chain and the hashes of the steps already sent (etat = { N, hashes }).
 * Returns { pret: true, k, N, data, nonce, attendu, adr } when step k may be signed now, else { pret: false, raison, fini? }.
 * Refuses: a test fixture, a broken record, another network, another wallet than the record's deployer, a pending transaction,
 * a nonce that is not N+k, any earlier step whose receipt does not match its prediction (STOP: nothing more is offered).
 */
export async function etapeSuivante(rec, rpc, wallet, etat) {
  const non = (raison, plus = {}) => ({ pret: false, raison, ...plus });
  if (rec.fixtureDeTest) return non('this record is a TEST FIXTURE: it must never be signed');
  const faux = await integrite(rec);
  if (faux.length) return non('record integrity MISMATCH: ' + faux.join(', '));
  let w;
  try { w = adresse(wallet); } catch (_) { return non('no wallet'); }
  if (w !== adresse(rec.deployeur)) return non('connected wallet ' + w + ' is not the pack deployer ' + rec.deployeur);
  const chaine = await rpc('eth_chainId', []).catch(() => null);
  if (chaine === null || BigInt(chaine) !== BigInt(rec.chaine)) return non('switch the wallet to Base (' + rec.chaine + ')');
  const hashes = (etat && Array.isArray(etat.hashes)) ? etat.hashes : [];
  const k = hashes.length;
  const latest = await rpc('eth_getTransactionCount', [w, 'latest']).catch(() => null);
  const pending = await rpc('eth_getTransactionCount', [w, 'pending']).catch(() => null);
  if (latest === null || pending === null) return non('nonce not read: try again');
  if (BigInt(latest) !== BigInt(pending)) return non('the wallet has a pending transaction: wait until it is mined (or dropped), send nothing else');
  const N = k === 0 ? BigInt(latest) : BigInt(etat.N);
  const pred = predire(w, N);
  const adr = { V: pred.V, R: pred.R };
  for (let j = 0; j < k; j++) {
    const tx = await rpc('eth_getTransactionByHash', [hashes[j]]).catch(() => null);
    const recu = await rpc('eth_getTransactionReceipt', [hashes[j]]).catch(() => null);
    if (!recu) return non('step ' + (j + 1) + ' has no receipt yet: wait');
    const ko = controleEtape(rec, j, w, N, { ...pred }, tx, recu);
    if (ko.length) return non('STOP at step ' + (j + 1) + ': ' + ko.join(' · '), { arret: true });
    adr[LETTRES[j]] = String(recu.contractAddress).toLowerCase();
  }
  if (k >= 6) return non('all six steps are deployed: run the verifier', { fini: true, N: N.toString(), adr: pred });
  if (BigInt(latest) !== N + BigInt(k)) return non('the wallet nonce is ' + BigInt(latest) + ', step ' + (k + 1) + ' needs ' + (N + BigInt(k)) + ': another transaction used a pack nonce. STOP: redeploy from step 1 with a fresh N (only gas is lost)', { arret: k > 0 });
  return { pret: true, k, N: N.toString(), nonce: '0x' + (N + BigInt(k)).toString(16), attendu: pred[LETTRES[k]], adr: { ...adr }, data: creationEtape(rec, k, adr) };
}

/* ---------------- on-chain reads ---------------- */
const mot = (h, i = 0) => String(h || '').replace(/^0x/, '').slice(64 * i, 64 * (i + 1));
const enAdresse = (h) => { const m = mot(h); return m.length === 64 ? '0x' + m.slice(24) : null; };
const enEntier = (h) => { const m = mot(h); return m.length === 64 ? BigInt('0x' + m).toString() : null; };
const enBool = (h) => { const m = mot(h); return m.length === 64 ? BigInt('0x' + m) === 1n : null; };
async function lire(rpc, to, sig, argAdresse) {
  const data = selecteur(sig) + (argAdresse ? adresse(argAdresse).slice(2).padStart(64, '0') : '');
  try { return await rpc('eth_call', [{ to, data }, 'latest']); } catch (_) { return null; }
}

/** every check of the pack, read on chain from the six transaction hashes; returns { ok, lignes: [{ ok, quoi, vu }], adr } */
export async function verifierPack(rec, hashes, rpc) {
  const lignes = [];
  const t = (ok, quoi, vu = '') => { lignes.push({ ok: !!ok, quoi, vu: String(vu) }); return !!ok; };
  const faux = await integrite(rec);
  t(faux.length === 0, 'record integrity (sha256 of every step and of the pack)', faux.join(', ') || rec.sha256Pack);
  t(!rec.fixtureDeTest, 'the record is not a test fixture');
  t(Array.isArray(hashes) && hashes.length === 6, 'six transaction hashes (L, P, T, S, V, R in order)', (hashes || []).length);
  if (!(Array.isArray(hashes) && hashes.length === 6)) return { ok: false, lignes, adr: {} };
  const chaine = await rpc('eth_chainId', []).catch(() => null);
  t(chaine !== null && BigInt(chaine) === BigInt(rec.chaine), 'network is Base (' + rec.chaine + ')', chaine);
  const txs = [], recus = [];
  for (const h of hashes) {
    txs.push(await rpc('eth_getTransactionByHash', [h]).catch(() => null));
    recus.push(await rpc('eth_getTransactionReceipt', [h]).catch(() => null));
  }
  const wallet = txs[0] && txs[0].from ? adresse(txs[0].from) : null;
  t(wallet === adresse(rec.deployeur), 'step 1 signed by the pack deployer ' + rec.deployeur, wallet);
  if (!wallet || !txs[0]) return { ok: false, lignes, adr: {} };
  const N = BigInt(txs[0].nonce);
  const pred = predire(wallet, N);
  const adr = {};
  for (let k = 0; k < 6; k++) {
    const e = rec.etapes[k];
    adr[e.lettre] = recus[k] && recus[k].contractAddress ? String(recus[k].contractAddress).toLowerCase() : null;
    const ko = controleEtape(rec, k, wallet, N, Object.fromEntries(LETTRES.map((l) => [l, pred[l]])), txs[k], recus[k]);
    t(ko.length === 0, 'step ' + (k + 1) + ' ' + produit(e) + ': tx.from = deployer, nonce N+' + k + ', the frozen creation data, status 1, at ' + pred[e.lettre], ko.join(' · ') || hashes[k]);
  }
  for (let k = 0; k < 6; k++) {
    const e = rec.etapes[k], a = pred[e.lettre];
    const code = await rpc('eth_getCode', [a, 'latest']).catch(() => null);
    const brut = String(code || '0x').replace(/^0x/, '');
    t(brut.length / 2 === e.runtimeOctets, produit(e) + ' runtime size ' + e.runtimeOctets + ' bytes', brut.length / 2);
    t(brut.length > 0 && (await sha256Hex(codeMasque(brut, e.immutables))) === e.runtimeSha256Masque, produit(e) + ' runtime code = the frozen build (immutable slots masked)', a);
  }
  const X = rec.existants, Q = rec.parametres, { L, P, T, S, V, R } = pred;
  const eqA = async (to, sig, attendu, quoi, arg) => { const r = await lire(rpc, to, sig, arg); const v = enAdresse(r); return t(v === adresse(attendu), quoi, v); };
  const eqN = async (to, sig, attendu, quoi) => { const v = enEntier(await lire(rpc, to, sig)); return t(v === String(attendu), quoi, v); };
  const vrai = async (to, sig, quoi, arg) => { const v = enBool(await lire(rpc, to, sig, arg)); return t(v === true, quoi, v); };
  const L0 = rec.etapes[0].config;
  await eqA(L, 'TBLOCK()', X.tblock, 'L.TBLOCK() = canonical TBLOCK');
  await eqA(L, 'LOCK()', X.lock, 'L.LOCK() = TBlockLock');
  await eqA(L, 'keeper()', Q.keeper, 'L.keeper() = the named keeper');
  await eqA(L, 'DEV()', Q.dev, 'L.DEV()');
  await eqA(L, 'DEV2()', Q.dev2, 'L.DEV2()');
  t(adresse(Q.keeper) !== adresse(Q.dev) && adresse(Q.keeper) !== adresse(Q.dev2), 'keeper is neither DEV nor DEV2');
  await eqN(L, 'START_PRICE()', L0.startPrice, 'L.START_PRICE() = the frozen start price');
  await eqN(L, 'GENESIS()', L0.genesis, 'L.GENESIS()');
  /* a heart is a play in the lock rewards (Phil 2026-11-12): L names R, and R lists L (two-way), so L.wired() */
  await eqA(L, 'REWARDS()', R, 'L.REWARDS() = R (a heart is a play in the lock rewards)');
  await vrai(R, 'isGame(address)', 'two-way: R.isGame(L (Hearts))', L);
  await vrai(L, 'wired()', 'L (Hearts).wired() = true');
  await eqA(P, 'USDC()', X.usdc, 'P.USDC()');
  await eqA(P, 'WTCOIN()', X.wtcoin, 'P.WTCOIN()');
  await eqA(P, 'TBLOCK()', X.tblock, 'P.TBLOCK() = canonical TBLOCK');
  await eqA(P, 'AERO_POOL()', X.aeroPool, 'P.AERO_POOL()');
  await eqA(P, 'POOL_MANAGER()', X.poolManager, 'P.POOL_MANAGER()');
  t(mot(await lire(rpc, P, 'V4_POOL_ID()')) === X.v4PoolId.slice(2), 'P: its TBLOCK pool id = the pinned TBLOCK pool');
  for (const [G, nom, wal, walSig] of [[T, 'T (TAM art)', Q.tamDevWallet, 'DEV_WALLET()'], [S, 'S (Skins)', Q.skinsFeeWallet, 'FEE_WALLET()']]) {
    await eqA(G, 'ROUTER()', P, nom + '.ROUTER() = P');
    await eqA(G, 'TBLOCK()', X.tblock, nom + '.TBLOCK() = canonical TBLOCK');
    await eqA(G, walSig, wal, nom + '.' + walSig.replace('()', '') + ' = the record wallet');
    await eqA(G, 'DEST()', V, nom + '.DEST() = V');
    await eqA(G, 'VAULT()', V, nom + '.VAULT() = V');
    await eqA(G, 'REWARDS()', R, nom + '.REWARDS() = R');
    await vrai(V, 'isGame(address)', 'two-way: V.isGame(' + nom + ')', G);
    await vrai(R, 'isGame(address)', 'two-way: R.isGame(' + nom + ')', G);
    await vrai(G, 'wired()', nom + '.wired() = true');
  }
  await eqA(S, 'owner()', wallet, 'S.owner() = the deployer (it can only allow currencies)');
  await eqA(V, 'TBLOCK()', X.tblock, 'V.TBLOCK() = canonical TBLOCK');
  await eqA(V, 'LIKES()', L, 'V.LIKES() = L');
  await eqA(V, 'LOCK()', X.lock, 'V.LOCK() = TBlockLock');
  await eqA(V, 'CONTEST()', X.contest, 'V.CONTEST()');
  await eqA(V, 'ROUTER()', P, 'V.ROUTER() = P (one router)');
  await eqN(V, 'GAME_COUNT()', 2, 'V.GAME_COUNT() = 2');
  await eqA(V, 'GAME_0()', T, 'V.GAME_0() = T');
  await eqA(V, 'GAME_1()', S, 'V.GAME_1() = S');
  await eqA(R, 'TBLOCK()', X.tblock, 'R.TBLOCK() = canonical TBLOCK');
  await eqA(R, 'WTCOIN()', X.wtcoin, 'R.WTCOIN()');
  await eqA(R, 'LOCK()', X.lock, 'R.LOCK() = TBlockLock');
  await eqA(R, 'POOL_MANAGER()', X.poolManager, 'R.POOL_MANAGER()');
  await eqA(R, 'guardian()', Q.guardian, 'R.guardian() = the named guardian');
  await eqN(R, 'T0()', Q.t0, 'R.T0()');
  await eqN(R, 'MAX_POT_WTCOIN()', Q.maxPotWtcoin, 'R.MAX_POT_WTCOIN()');
  await eqN(R, 'MAX_POT_TBLOCK()', Q.maxPotTblock, 'R.MAX_POT_TBLOCK()');
  await eqN(R, 'GAME_COUNT()', 3, 'R.GAME_COUNT() = 3 (R lists [L, T, S])');
  await eqA(R, 'GAME_0()', L, 'R.GAME_0() = L');
  await eqA(R, 'GAME_1()', T, 'R.GAME_1() = T');
  await eqA(R, 'GAME_2()', S, 'R.GAME_2() = S');
  await eqA(X.lock, 'TBLOCK()', X.tblock, 'TBlockLock.TBLOCK() = canonical TBLOCK');
  return { ok: lignes.every((x) => x.ok), lignes, adr: pred };
}
