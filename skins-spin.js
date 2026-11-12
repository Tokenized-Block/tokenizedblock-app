/* skins-spin.js — the ONE place that turns the frozen record of the new Skins and the new Spin (skins-spin-deploiement.js) into
 *   transactions, judges what the chain did with them, and writes the record. Pure: no DOM, no wallet; reads go through an injected
 *   rpc(method, params). Used by deployer-skins-spin.html (browser, rpc = the wallet provider), verifier-skins-spin.mjs and
 *   contracts/noter-deploiement-skins-spin.mjs (node, rpc = Base RPC), contracts/preparer-deploiement-skins-spin.mjs (the writer).
 * Phil 2026-11-12: (1) Skins at 1 USDC a mint, paid through the live TBLOCK payment router P (10 % USDC to the fee wallet, the rest buys
 *   TBLOCK for the live holders vault V); not a play for V or the lock rewards (their game lists are fixed). (2) Spin: the winners' pot
 *   stays USDC as today; the DEV share is paid through P (10 % USDC to the dev wallet, the rest buys TBLOCK for V); not a play (as today).
 *   ONE wallet (Grok's, the pack deployer) signs two deploys at consecutive nonces: N = Skins, N+1 = Spin.
 * ⛔ NOTHING HERE SIGNS OR SENDS. ⛔ NO ADDRESS IS TYPED HERE: P, V, TBLOCK, USDC, the wallets and the deployer come from the records the
 *   preparer copied them from; the two new addresses are CREATE addresses of (deployer, N) and (deployer, N+1). A recorded address that is
 *   not that prediction is refused (deployes()), so a hand edit of the record can never point the app at another contract.
 * ⛔ The live router P and the live holders vault V are written "@P" and "@V" in the record (economie-v2-pack-deploye.js stays the ONLY
 *   file that carries the pack's addresses): resoudre() reads them from that record, and sha256Creation (of the bytes WITH them) ties the
 *   two records — a different P or V there makes the integrity fail, nothing is offered. */
import { selecteur } from './keccak.js';
import { adresse, adresseCreate, codeMasque, sha256Hex } from './pack-economie-v2.js';
import { encoderConfig } from './slots-config.js';
import { ADRESSES_PACK_ECONOMIE_V2 } from './economie-v2-pack-deploye.js';

export const CLES = Object.freeze(['skins', 'spin']);
/* UI copy rule (Phil 2026-11-12): the page names the PRODUCT, never a contract version */
export const PRODUIT = Object.freeze({ skins: 'Skins', spin: 'Spin' });
export const NOMS = Object.freeze({ skins: 'BlockSkinsRouter', spin: 'BlockSlotsRouter' });
const produit = (e) => PRODUIT[e && e.cle] || 'step';
const bas = (x) => String(x == null ? '' : x).toLowerCase();
const HASH = /^0x[0-9a-f]{64}$/;
const hexA = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
const octets = (hex) => { const h = String(hex).replace(/^0x/, ''); if (h.length % 2 || /[^0-9a-f]/i.test(h)) throw new Error('bad hex'); const o = new Uint8Array(h.length / 2); for (let i = 0; i < o.length; i++) o[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16); return o; };
const w = (x) => { const v = BigInt(x); if (v < 0n || v >= 1n << 256n) throw new Error('word out of range'); return v.toString(16).padStart(64, '0'); };
const wa = (a) => adresse(a).slice(2).padStart(64, '0');
/** "@P" / "@V" -> the live router / holders vault of the pack record; anything else unchanged */
export const REFS = Object.freeze({ '@P': ADRESSES_PACK_ECONOMIE_V2.P, '@V': ADRESSES_PACK_ECONOMIE_V2.V });
export function resoudre(x) {
  if (typeof x !== 'string' || x[0] !== '@') return x;
  if (!Object.prototype.hasOwnProperty.call(REFS, x) || !REFS[x]) throw new Error('unknown reference ' + x);
  return adresse(REFS[x]);
}
const resoudreConfig = (c) => Object.freeze(Object.fromEntries(Object.entries(c).map(([k, v]) => [k, resoudre(v)])));
/* an address word, or the reference token itself (kept as is in the record) */
const wr = (a) => (typeof a === 'string' && a[0] === '@' ? (resoudre(a), a) : wa(a));

/** sha256 of the BYTES of a hex string (the creation data as sent) */
export async function sha256Octets(hex) {
  const b = await globalThis.crypto.subtle.digest('SHA-256', octets(hex));
  return hexA(new Uint8Array(b));
}

/** the constructor words of a step, from its displayed config: what the page shows is exactly what is signed */
export function encoderArgs(cle, c) {
  if (cle === 'skins') return [c.router, c.feeWallet, c.dest, c.expectedTblock, c.expectedUsdc].map(wr);
  if (cle === 'spin') {
    const cfg = encoderConfig({ usdc: c.usdc, devWallet: c.devWallet, spinPrice: c.spinPrice, potShareBps: c.potShareBps, prizes: c.prizes });
    return [...cfg.match(/.{64}/g), wr(c.router), wr(c.dest), wa(c.expectedTblock), w(c.minDevBatch), w(c.maxDevBatch)];
  }
  throw new Error('unknown step ' + cle);
}

/** the two new addresses for a wallet whose FIRST deploy here uses nonce N */
export function predire(wallet, N) {
  return { skins: adresseCreate(wallet, BigInt(N)), spin: adresseCreate(wallet, BigInt(N) + 1n) };
}

/** the creation data of step k (0 = Skins, 1 = Spin), "@P" / "@V" read from the pack record */
export function creationEtape(rec, k) {
  const e = rec.etapes[k];
  if (!e) throw new Error('no step ' + k);
  return e.init + e.args.map((x) => (x[0] === '@' ? wa(resoudre(x)) : x)).join('');
}

/** what a Spin config implies, as the contract computes it (TO_POT rounded down, DEV_SHARE = the rest) */
export function partsSpin(c) {
  const prix = BigInt(c.spinPrice), bps = BigInt(c.potShareBps);
  const toPot = (prix * bps) / 10000n;
  return { toPot, devShare: prix - toPot };
}

/** the record matches its own sha256s, its displayed config, and its order; [] = intact */
export async function integrite(rec) {
  const faux = [];
  if (!rec || !Array.isArray(rec.etapes) || rec.etapes.length !== 2 || rec.etapes.some((e, k) => !e || e.cle !== CLES[k])) return ['order'];
  try { adresse(rec.deployeur); } catch (_) { faux.push('deployer'); }
  for (const e of rec.etapes) {
    const p = produit(e);
    if ((await sha256Hex(e.init + '|' + e.args.join(','))) !== e.sha256Modele) faux.push(p + ' template');
    let data = null;
    try { data = creationEtape(rec, rec.etapes.indexOf(e)); if ((await sha256Octets(data)) !== e.sha256Creation) faux.push(p + ' creation sha256'); } catch (_) { faux.push(p + ' creation'); }
    if (data && (data.length - 2) / 2 !== e.octetsCreation) faux.push(p + ' creation size');
    let attendu = null;
    try { attendu = encoderArgs(e.cle, e.config).join(','); } catch (_) { attendu = null; }
    if (attendu !== e.args.join(',')) faux.push(p + ' constructor words differ from the displayed config');
  }
  const [sk, sp] = rec.etapes;
  const X = rec.existants || {};
  const memes = (a, b) => { try { return adresse(resoudre(a)) === adresse(resoudre(b)); } catch (_) { return false; } };
  /* the record never types the pack's router or vault: it names them */
  if (X.router !== '@P' || X.vault !== '@V' || sk.config.router !== '@P' || sk.config.dest !== '@V' || sp.config.router !== '@P' || sp.config.dest !== '@V') faux.push('the router and the vault must be named @P / @V (read from the pack record)');
  if (!memes(sk.config.router, X.router) || !memes(sp.config.router, X.router)) faux.push('router is not the live router of the record');
  if (!memes(sk.config.dest, X.vault) || !memes(sp.config.dest, X.vault)) faux.push('destination is not the live holders vault of the record');
  if (!memes(sk.config.expectedTblock, X.tblock) || !memes(sp.config.expectedTblock, X.tblock)) faux.push('TBLOCK');
  if (!memes(sk.config.expectedUsdc, X.usdc) || !memes(sp.config.usdc, X.usdc)) faux.push('USDC');
  try {
    const { toPot, devShare } = partsSpin(sp.config);
    if (String(sp.config.toPot) !== String(toPot) || String(sp.config.devShare) !== String(devShare)) faux.push('Spin pot / dev split');
    const mn = BigInt(sp.config.minDevBatch), mx = BigInt(sp.config.maxDevBatch);
    if (!(mn > 0n && mn <= mx)) faux.push('Spin dev batch bounds');
  } catch (_) { faux.push('Spin config'); }
  if ((await sha256Hex(rec.etapes.map((e) => e.sha256Modele).join(','))) !== rec.sha256Paire) faux.push('pair');
  return faux;
}

/** what the page must check on step k's transaction and receipt; [] = all good */
export function controleEtape(rec, k, wallet, N, tx, recu) {
  const ko = [];
  const e = rec.etapes[k];
  if (!tx) ko.push('transaction not found');
  if (!recu) ko.push('receipt not found');
  if (!tx || !recu) return ko;
  const pred = predire(wallet, N);
  if (String(recu.status) !== '0x1') ko.push(produit(e) + ' FAILED on chain (status ' + recu.status + ')');
  if (bas(tx.from) !== adresse(wallet)) ko.push('signed by ' + tx.from + ', not by ' + wallet);
  if (tx.to) ko.push('not a contract creation (to = ' + tx.to + ')');
  if (BigInt(tx.nonce) !== BigInt(N) + BigInt(k)) ko.push('nonce ' + BigInt(tx.nonce) + ' instead of ' + (BigInt(N) + BigInt(k)) + ': another transaction used a nonce of this deploy');
  const ca = recu.contractAddress ? bas(recu.contractAddress) : null;
  if (ca !== pred[e.cle]) ko.push(produit(e) + ' deployed at ' + ca + ', predicted ' + pred[e.cle] + ': STOP');
  if (bas(tx.input || tx.data) !== bas(creationEtape(rec, k))) ko.push('the signed data is not the frozen ' + produit(e) + ' creation');
  return ko;
}

/** the runtime a creation answers (eth_call of the creation, or eth_getCode after) is the frozen build: size and masked sha256 */
export async function codeConforme(e, code) {
  const brut = String(code || '0x').replace(/^0x/, '').toLowerCase();
  if (!brut.length || brut.length / 2 !== e.runtimeOctets) return false;
  return (await sha256Hex(codeMasque(brut, e.immutables))) === e.runtimeSha256Masque;
}

/**
 * What the page may do next, decided ONLY from the chain and the hashes of the steps already sent (etat = { N, hashes }).
 * { pret: true, k, N, nonce, data, attendu, gas } when step k may be signed now — AFTER the exact creation was SIMULATED from the
 * deployer (eth_call: it must answer the frozen runtime) and its gas estimated; else { pret: false, raison, fini?, arret? }.
 */
export async function etapeSuivante(rec, rpc, wallet, etat) {
  const non = (raison, plus = {}) => ({ pret: false, raison, ...plus });
  if (!rec) return non('no deploy record');
  if (rec.fixtureDeTest) return non('this record is a TEST FIXTURE: it must never be signed');
  if (rec.etapes && rec.etapes.some((e) => e.adresse)) return non('this record already names deployed contracts: nothing to sign', { fini: true });
  const faux = await integrite(rec);
  if (faux.length) return non('record integrity MISMATCH: ' + faux.join(', '));
  let me;
  try { me = adresse(wallet); } catch (_) { return non('no wallet'); }
  if (me !== adresse(rec.deployeur)) return non('connected wallet ' + me + ' is not the deployer ' + rec.deployeur + ': only that wallet may sign');
  const chaine = await rpc('eth_chainId', []).catch(() => null);
  if (chaine === null || BigInt(chaine) !== BigInt(rec.chaine)) return non('switch the wallet to Base (' + rec.chaine + ')');
  const hashes = (etat && Array.isArray(etat.hashes)) ? etat.hashes : [];
  const k = hashes.length;
  const latest = await rpc('eth_getTransactionCount', [me, 'latest']).catch(() => null);
  const pending = await rpc('eth_getTransactionCount', [me, 'pending']).catch(() => null);
  if (latest === null || pending === null) return non('nonce not read: try again');
  if (BigInt(latest) !== BigInt(pending)) return non('the wallet has a pending transaction: wait until it is mined (or dropped), send nothing else');
  const N = k === 0 ? BigInt(latest) : BigInt(etat.N);
  for (let j = 0; j < k; j++) {
    const tx = await rpc('eth_getTransactionByHash', [hashes[j]]).catch(() => null);
    const recu = await rpc('eth_getTransactionReceipt', [hashes[j]]).catch(() => null);
    if (!recu) return non('step ' + (j + 1) + ' has no receipt yet: wait');
    const ko = controleEtape(rec, j, me, N, tx, recu);
    if (ko.length) return non('STOP at step ' + (j + 1) + ': ' + ko.join(' · '), { arret: true });
    const code = await rpc('eth_getCode', [bas(recu.contractAddress), 'latest']).catch(() => null);
    if (!(await codeConforme(rec.etapes[j], code))) return non('STOP at step ' + (j + 1) + ': the code at ' + recu.contractAddress + ' is not the frozen build', { arret: true });
  }
  if (k >= 2) return non('both contracts are deployed: run the checks below, then record them', { fini: true, N: N.toString() });
  if (BigInt(latest) !== N + BigInt(k)) return non('the wallet nonce is ' + BigInt(latest) + ', step ' + (k + 1) + ' needs ' + (N + BigInt(k)) + ': another transaction used a nonce of this deploy. STOP', { arret: k > 0 });
  const pred = predire(me, N);
  const e = rec.etapes[k], data = creationEtape(rec, k);
  const ici = await rpc('eth_getCode', [pred[e.cle], 'latest']).catch(() => null);
  if (ici === null) return non('the predicted address could not be read: try again');
  if (String(ici).replace(/^0x/, '').length) return non('STOP: code already at the predicted ' + produit(e) + ' address ' + pred[e.cle], { arret: true });
  let sim = null;
  try { sim = await rpc('eth_call', [{ from: me, data }, 'latest']); } catch (x) { return non('the ' + produit(e) + ' deploy fails in simulation, nothing is offered: ' + String((x && x.message) || x).slice(0, 160)); }
  if (!(await codeConforme(e, sim))) return non('the simulated ' + produit(e) + ' deploy does not answer the frozen runtime: nothing is offered');
  let gas = null;
  try { gas = BigInt(await rpc('eth_estimateGas', [{ from: me, data }])); } catch (x) { return non('the ' + produit(e) + ' deploy gas could not be estimated: ' + String((x && x.message) || x).slice(0, 160)); }
  return { pret: true, k, N: N.toString(), nonce: '0x' + (N + BigInt(k)).toString(16), attendu: pred[e.cle], data, gas: gas.toString(), gasEnvoi: '0x' + ((gas * 12n) / 10n).toString(16) };
}

/* ---------------- on-chain reads ---------------- */
const mot = (h, i = 0) => String(h || '').replace(/^0x/, '').slice(64 * i, 64 * (i + 1));
const enAdresse = (h, i = 0) => { const m = mot(h, i); return m.length === 64 ? '0x' + m.slice(24) : null; };
const enEntier = (h, i = 0) => { const m = mot(h, i); return m.length === 64 ? BigInt('0x' + m).toString() : null; };
const enBool = (h) => { const m = mot(h); return m.length === 64 ? BigInt('0x' + m) === 1n : null; };
async function lire(rpc, to, sig, argAdresse) {
  const data = selecteur(sig) + (argAdresse ? adresse(argAdresse).slice(2).padStart(64, '0') : '');
  try { return await rpc('eth_call', [{ to, data }, 'latest']); } catch (_) { return null; }
}

/** every check of the two deploys, read on chain from the two transaction hashes; returns { ok, lignes: [{ ok, quoi, vu }], adr } */
export async function verifierPaire(rec, hashes, rpc) {
  const lignes = [];
  const t = (ok, quoi, vu = '') => { lignes.push({ ok: !!ok, quoi, vu: String(vu) }); return !!ok; };
  const faux = await integrite(rec);
  t(faux.length === 0, 'record integrity (sha256 of each creation, of the pair, and the constructor words = the displayed config)', faux.join(', ') || rec.sha256Paire);
  t(!rec.fixtureDeTest, 'the record is not a test fixture');
  t(Array.isArray(hashes) && hashes.length === 2 && hashes.every((h) => HASH.test(bas(h))), 'two transaction hashes (Skins, then Spin)', (hashes || []).length);
  if (!(Array.isArray(hashes) && hashes.length === 2)) return { ok: false, lignes, adr: {} };
  const chaine = await rpc('eth_chainId', []).catch(() => null);
  t(chaine !== null && BigInt(chaine) === BigInt(rec.chaine), 'network is Base (' + rec.chaine + ')', chaine);
  const txs = [], recus = [];
  for (const h of hashes) {
    txs.push(await rpc('eth_getTransactionByHash', [h]).catch(() => null));
    recus.push(await rpc('eth_getTransactionReceipt', [h]).catch(() => null));
  }
  const wallet = txs[0] && txs[0].from ? bas(txs[0].from) : null;
  t(wallet === adresse(rec.deployeur), 'step 1 signed by the deployer ' + rec.deployeur, wallet);
  if (!wallet || !txs[0]) return { ok: false, lignes, adr: {} };
  const N = BigInt(txs[0].nonce);
  const pred = predire(wallet, N);
  for (let k = 0; k < 2; k++) {
    const e = rec.etapes[k];
    const ko = controleEtape(rec, k, wallet, N, txs[k], recus[k]);
    t(ko.length === 0, 'step ' + (k + 1) + ' ' + produit(e) + ': tx.from = deployer, nonce N+' + k + ', the frozen creation data, status 1, at ' + pred[e.cle], ko.join(' · ') || hashes[k]);
    const code = await rpc('eth_getCode', [pred[e.cle], 'latest']).catch(() => null);
    const brut = String(code || '0x').replace(/^0x/, '');
    t(brut.length / 2 === e.runtimeOctets, produit(e) + ' runtime size ' + e.runtimeOctets + ' bytes', brut.length / 2);
    t(await codeConforme(e, code), produit(e) + ' runtime code = the frozen build (immutable slots masked)', pred[e.cle]);
  }
  const X = resoudreConfig(rec.existants), K = resoudreConfig(rec.etapes[0].config), G = resoudreConfig(rec.etapes[1].config), { skins: S, spin: B } = pred;
  const eqA = async (to, sig, attendu, quoi, arg) => { const v = enAdresse(await lire(rpc, to, sig, arg)); return t(v === adresse(attendu), quoi, v); };
  const eqN = async (to, sig, attendu, quoi) => { const v = enEntier(await lire(rpc, to, sig)); return t(v === String(attendu), quoi, v); };
  const faux2 = async (to, sig, quoi, arg) => { const v = enBool(await lire(rpc, to, sig, arg)); return t(v === false, quoi, v); };
  /* Skins */
  await eqN(S, 'MINT_PRICE()', K.mintPriceUsdc, 'Skins.MINT_PRICE() = ' + K.mintPriceUsdc + ' (1 USDC)');
  await eqN(S, 'PRICE_USDC()', K.mintPriceUsdc, 'Skins.PRICE_USDC() = MINT_PRICE (what the router takes)');
  await eqA(S, 'ROUTER()', X.router, 'Skins.ROUTER() = the live TBLOCK payment router');
  await eqA(S, 'DEST()', X.vault, 'Skins.DEST() = the live holders vault');
  await eqA(S, 'VAULT()', X.vault, 'Skins.VAULT() = the live holders vault');
  await eqA(S, 'TBLOCK()', X.tblock, 'Skins.TBLOCK() = canonical TBLOCK');
  await eqA(S, 'USDC()', X.usdc, 'Skins.USDC() = USDC');
  await eqA(S, 'FEE_WALLET()', K.feeWallet, 'Skins.FEE_WALLET() = the record fee wallet');
  { const r = await lire(rpc, S, 'USDC_SPLIT()'); t(enAdresse(r, 0) === adresse(K.feeWallet) && enEntier(r, 1) === String(K.devBps), 'Skins.USDC_SPLIT() = (fee wallet, ' + K.devBps + ' bps)', enAdresse(r, 0) + ' ' + enEntier(r, 1)); }
  await eqA(S, 'owner()', wallet, 'Skins.owner() = the deployer (it can only allow currencies)');
  await faux2(X.vault, 'isGame(address)', 'the holders vault does NOT list Skins (a mint is not a play: accepted)', S);
  /* Spin */
  await eqA(B, 'USDC()', G.usdc, 'Spin.USDC() = USDC');
  await eqA(B, 'DEV_WALLET()', G.devWallet, 'Spin.DEV_WALLET() = the live Spin dev wallet');
  await eqN(B, 'SPIN_PRICE()', G.spinPrice, 'Spin.SPIN_PRICE() = the live Spin price');
  await eqN(B, 'POT_SHARE_BPS()', G.potShareBps, 'Spin.POT_SHARE_BPS() = the live pot share');
  await eqN(B, 'TO_POT()', G.toPot, 'Spin.TO_POT()');
  await eqN(B, 'DEV_SHARE()', G.devShare, 'Spin.DEV_SHARE()');
  { const r = await lire(rpc, B, 'prizes()'); const v = Array.from({ length: 16 }, (_, i) => enEntier(r, i)).join(','); t(v === G.prizes.map(String).join(','), 'Spin.prizes() = the live table (16 prizes)', v); }
  await eqA(B, 'ROUTER()', X.router, 'Spin.ROUTER() = the live TBLOCK payment router');
  await eqA(B, 'DEST()', X.vault, 'Spin.DEST() = the live holders vault');
  await eqA(B, 'TBLOCK()', X.tblock, 'Spin.TBLOCK() = canonical TBLOCK');
  await eqN(B, 'MIN_DEV_BATCH()', G.minDevBatch, 'Spin.MIN_DEV_BATCH()');
  await eqN(B, 'MAX_DEV_BATCH()', G.maxDevBatch, 'Spin.MAX_DEV_BATCH()');
  await eqN(B, 'PRICE_USDC()', 0, 'Spin.PRICE_USDC() = 0 outside a dev batch');
  { const r = await lire(rpc, B, 'USDC_SPLIT()'); t(enAdresse(r, 0) === adresse(G.devWallet) && enEntier(r, 1) === String(G.devBps), 'Spin.USDC_SPLIT() = (dev wallet, ' + G.devBps + ' bps)', enAdresse(r, 0) + ' ' + enEntier(r, 1)); }
  await faux2(X.vault, 'isGame(address)', 'the holders vault does NOT list Spin (a spin is not a play, as today)', B);
  await eqA(X.vault, 'ROUTER()', X.router, 'the holders vault names the same router');
  await eqA(X.router, 'TBLOCK()', X.tblock, 'the router buys canonical TBLOCK');
  return { ok: lignes.every((x) => x.ok), lignes, adr: pred };
}

/* ---------------- the record: ONE writer, and what the app may follow ---------------- */
const gel = 'const gel = (o) => { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.values(o).forEach(gel); Object.freeze(o); } return o; };';
/** the ONE writer of skins-spin-deploiement.js (deterministic: the same record always gives the same text) */
export function texteRecord(rec) {
  return '/* skins-spin-deploiement.js — GENERATED by contracts/preparer-deploiement-skins-spin.mjs (deploy data) and, after the two deploys,\n'
    + ' *   by contracts/noter-deploiement-skins-spin.mjs (nonceN and each step\'s adresse, tx, bloc, read from the receipts). DO NOT EDIT BY HAND.\n'
    + ' * The new Skins (1 USDC, paid through the TBLOCK payment router) and the new Spin (dev share paid through the router), ONE wallet,\n'
    + ' *   nonces N and N+1. adresse null = not deployed: the app keeps the live Skins and Spin. Nothing here signs or sends. */\n'
    + gel + '\n'
    + 'export const SKINS_SPIN_DEPLOIEMENT = gel(' + JSON.stringify(rec, null, 1) + ');\n';
}

/**
 * The two deployed contracts the app may follow, or null for each: only an address that IS the CREATE address of (the record's deployer,
 * nonceN + k), with its tx hash and a whole block. Anything else (a hand-typed address, a partial note) gives null: the app stays as today.
 */
export function deployes(rec) {
  const out = { skins: null, spin: null };
  if (!rec || !Array.isArray(rec.etapes) || rec.etapes.length !== 2 || rec.fixtureDeTest) return out;
  let pred = null;
  try { if (Number.isSafeInteger(rec.nonceN) && rec.nonceN >= 0) pred = predire(rec.deployeur, rec.nonceN); } catch (_) { pred = null; }
  if (!pred) return out;
  rec.etapes.forEach((e, k) => {
    if (!e || e.cle !== CLES[k]) return;
    const a = bas(e.adresse);
    if (a !== pred[e.cle] || !HASH.test(bas(e.tx)) || !Number.isSafeInteger(e.bloc) || e.bloc <= 0) return;
    let config = null;
    try { config = resoudreConfig(e.config); } catch (_) { return; }
    out[e.cle] = Object.freeze({ adresse: a, bloc: e.bloc, tx: bas(e.tx), config });
  });
  return out;
}

/** pure: { ok:false, pourquoi } or { ok:true, rec, texte } — the record with nonceN and both addresses, from verified receipts */
export async function noterPaire({ rec, hashes, txs, recus, verdicts }) {
  const non = (p) => ({ ok: false, pourquoi: p });
  if (!rec || rec.fixtureDeTest !== false) return non('the record is a test fixture or missing');
  if (rec.etapes.some((e) => e.adresse !== null || e.tx !== null || e.bloc !== null) || rec.nonceN !== null) return non('the record already names deployed contracts: nothing rewritten');
  const faux = await integrite(rec);
  if (faux.length) return non('record integrity MISMATCH: ' + faux.join(', '));
  if (!Array.isArray(hashes) || hashes.length !== 2 || hashes.some((h) => !HASH.test(bas(h)))) return non('two transaction hashes (Skins, Spin) are needed');
  if (bas(hashes[0]) === bas(hashes[1])) return non('the same transaction hash is given twice');
  if (!Array.isArray(verdicts) || verdicts.length < 2 || verdicts.some((v) => !v || v.ok !== true)) return non('the verifier does not hold on every node');
  if (!Array.isArray(txs) || !Array.isArray(recus) || txs.length !== 2 || recus.length !== 2) return non('two transactions and two receipts are needed');
  const me = adresse(rec.deployeur);
  if (!txs[0] || bas(txs[0].from) !== me) return non('step 1 was not signed by the deployer ' + me);
  const N = BigInt(txs[0].nonce);
  const etapes = [];
  let avant = 0;
  for (let k = 0; k < 2; k++) {
    const e = rec.etapes[k], tx = txs[k], recu = recus[k], h = bas(hashes[k]);
    const ko = controleEtape(rec, k, me, N, tx, recu);
    if (ko.length) return non('step ' + (k + 1) + ' ' + produit(e) + ': ' + ko.join(' · '));
    if (bas(tx.hash) !== h || bas(recu.transactionHash) !== h) return non('step ' + (k + 1) + ': the transaction or receipt is not the one of ' + h);
    const bloc = Number.parseInt(recu.blockNumber, 16);
    if (!Number.isSafeInteger(bloc) || bloc <= 0) return non('step ' + (k + 1) + ': the receipt has no block number');
    if (bas(tx.blockNumber) !== bas(recu.blockNumber)) return non('step ' + (k + 1) + ': transaction and receipt name different blocks');
    if (bloc < avant) return non('step ' + (k + 1) + ' was mined before step ' + k);
    avant = bloc;
    etapes.push({ ...e, adresse: bas(recu.contractAddress), tx: h, bloc });
  }
  const neuf = { ...rec, etapes, nonceN: Number(N) };
  return { ok: true, rec: neuf, texte: texteRecord(neuf) };
}
