/* contracts/noter-deploiement-pack-economie-v2.mjs — AFTER the six pack deploys (deployer-economie-v2.html): writes
 *   economie-v2-pack-deploye.js, the record of where the economy v2 pack lives (address + tx + block of each of L P T S V R),
 *   from the RECEIPTS, and only if EVERYTHING holds. Read-only: nothing is signed or sent.
 *   Usage: node contracts/noter-deploiement-pack-economie-v2.mjs <txL> <txP> <txT> <txS> <txV> <txR>
 *     env PACK_DEPLOYE_OUT (default ../economie-v2-pack-deploye.js) — the tests point it at a temporary copy.
 * Reads every tx and receipt on TWO nodes (https://mainnet.base.org, https://base-rpc.publicnode.com) and REFUSES (writes nothing) if
 *   they disagree on any field kept; then the full pack verifier (verifierPack: integrity, tx.from = the frozen deployer, nonces N..N+5,
 *   signed data = the frozen creation, status 1, contractAddress = the CREATE prediction, runtime = the frozen build, wiring) must hold
 *   on BOTH nodes; then noterPack() re-checks each step and builds the record.
 * ⛔ NOTHING IS TYPED TWICE: the deployer, the product names and every existing address stay in economie-v2-pack-deploiement.js and
 *   pack-economie-v2.js; this record carries only what the chain added: N, and per step the address, tx hash and block, each ONCE.
 * ⛔ An existing record with a different text is never overwritten (a pack is noted once). The same text again = unchanged.
 * `noterPack()` and `texteFiche()` are pure (tested with stubs); the CLI wires the RPC. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { LETTRES, PRODUIT, adresse, predire, controleEtape, integrite, verifierPack } from '../pack-economie-v2.js';

export const NOEUDS = Object.freeze(['https://mainnet.base.org', 'https://base-rpc.publicnode.com']);
const HASH = /^0x[0-9a-f]{64}$/;
const bas = (x) => String(x == null ? '' : x).toLowerCase();
const sha = (s) => crypto.createHash('sha256').update(bas(s)).digest('hex');

/** the fields two nodes must agree on, for one step */
export function empreinte(tx, recu) {
  return JSON.stringify({
    hash: tx ? bas(tx.hash) : null, from: tx ? bas(tx.from) : null, to: tx && tx.to ? bas(tx.to) : null,
    nonce: tx ? bas(tx.nonce) : null, txBloc: tx ? bas(tx.blockNumber) : null, input: tx ? sha(tx.input || tx.data) : null,
    recuHash: recu ? bas(recu.transactionHash) : null, status: recu ? bas(recu.status) : null,
    contractAddress: recu && recu.contractAddress ? bas(recu.contractAddress) : null, bloc: recu ? bas(recu.blockNumber) : null,
  });
}

/** pure: { ok:false, pourquoi } or { ok:true, fiche, texte }. rec = the frozen pack record; txs/recus in deploy order L..R;
 *  verdicts = the verifierPack results, one per node (each must be ok) */
export async function noterPack({ rec, hashes, txs, recus, verdicts }) {
  const non = (p) => ({ ok: false, pourquoi: p });
  if (!rec || rec.fixtureDeTest !== false) return non('the pack record is a test fixture or missing');
  const faux = await integrite(rec);
  if (faux.length) return non('pack record integrity MISMATCH: ' + faux.join(', '));
  if (!Array.isArray(hashes) || hashes.length !== 6 || hashes.some((h) => !HASH.test(bas(h)))) return non('six transaction hashes (L P T S V R) are needed');
  if (new Set(hashes.map(bas)).size !== 6) return non('the same transaction hash is given twice');
  if (!Array.isArray(verdicts) || verdicts.length < 2 || verdicts.some((v) => !v || v.ok !== true)) return non('the pack verifier does not hold on every node');
  if (!Array.isArray(txs) || !Array.isArray(recus) || txs.length !== 6 || recus.length !== 6) return non('six transactions and six receipts are needed');
  const wallet = adresse(rec.deployeur);
  if (!txs[0] || bas(txs[0].from) !== wallet) return non('step 1 was not signed by the pack deployer ' + wallet);
  const N = BigInt(txs[0].nonce);
  const pred = predire(wallet, N);
  const etapes = [];
  let avant = 0;
  for (let k = 0; k < 6; k++) {
    const l = LETTRES[k], tx = txs[k], recu = recus[k], h = bas(hashes[k]);
    const ko = controleEtape(rec, k, wallet, N, { ...pred }, tx, recu);
    if (ko.length) return non('step ' + (k + 1) + ' ' + PRODUIT[l] + ': ' + ko.join(' · '));
    if (bas(tx.hash) !== h || bas(recu.transactionHash) !== h) return non('step ' + (k + 1) + ': the transaction or receipt is not the one of ' + h);
    const bloc = Number.parseInt(recu.blockNumber, 16);
    if (!Number.isSafeInteger(bloc) || bloc <= 0) return non('step ' + (k + 1) + ': the receipt has no block number');
    if (bas(tx.blockNumber) !== bas(recu.blockNumber)) return non('step ' + (k + 1) + ': transaction and receipt name different blocks');
    if (bloc < avant) return non('step ' + (k + 1) + ' was mined in block ' + bloc + ', before step ' + k + ' (' + avant + ')');
    avant = bloc;
    etapes.push(Object.freeze({ lettre: l, adresse: bas(recu.contractAddress), tx: h, bloc }));
  }
  const fiche = Object.freeze({ chaine: rec.chaine, sha256Pack: rec.sha256Pack, nonceN: Number(N), etapes: Object.freeze(etapes) });
  return { ok: true, fiche, texte: texteFiche(fiche) };
}

/** the ONE writer of economie-v2-pack-deploye.js (deterministic: the same fiche always gives the same text) */
export function texteFiche(f) {
  const ligne = (e) => "    Object.freeze({ lettre: '" + e.lettre + "', adresse: '" + e.adresse + "', tx: '" + e.tx + "', bloc: " + e.bloc + ' }),';
  return [
    '/* economie-v2-pack-deploye.js — GENERATED by contracts/noter-deploiement-pack-economie-v2.mjs from the six receipts. DO NOT EDIT BY HAND.',
    ' * Where the economy v2 pack lives on Base: per step (L P T S V R, pack-economie-v2.js LETTRES / PRODUIT) the contract address, the',
    ' *   creation tx and its block, each read from the receipt on two nodes, after verifierPack held on both. The deployer, the products',
    ' *   and every existing address stay in economie-v2-pack-deploiement.js (the frozen pack this record names by sha256Pack): never retyped.',
    ' * Step k was signed at nonce nonceN + k; adresse = the CREATE address of (deployer, nonceN + k). Nothing here signs or sends. */',
    'export const PACK_ECONOMIE_V2_DEPLOYE = Object.freeze({',
    '  chaine: ' + f.chaine + ',',
    "  sha256Pack: '" + f.sha256Pack + "',",
    '  nonceN: ' + f.nonceN + ',',
    '  etapes: Object.freeze([',
    ...f.etapes.map(ligne),
    '  ]),',
    '});',
    '/* derived, not typed: letter -> address */',
    'export const ADRESSES_PACK_ECONOMIE_V2 = Object.freeze(Object.fromEntries(PACK_ECONOMIE_V2_DEPLOYE.etapes.map((e) => [e.lettre, e.adresse])));',
    '',
  ].join('\n');
}

/** what to do with the file already there: 'ecrire' | 'inchange' | refusal text */
export function decision(existant, nouveau) {
  if (existant === null || existant === undefined) return 'ecrire';
  if (existant === nouveau) return 'inchange';
  return 'a different pack record is already written: nothing overwritten';
}

/* ---------------------------------------------------------------- CLI */
const LECTURES = new Set(['eth_chainId', 'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_getCode', 'eth_call']);
export function rpcLecture(url) {
  let id = 0;
  return async (method, params) => {
    if (!LECTURES.has(method)) throw new Error('read-only: ' + method + ' refused');
    for (let k = 0; ; k++) {
      try {
        const j = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((r) => r.json());
        if (j.error) throw new Error(method + ': ' + JSON.stringify(j.error));
        return j.result;
      } catch (x) { if (k >= 3) throw x; await new Promise((o) => setTimeout(o, 1200 * (k + 1))); }
    }
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const hashes = process.argv.slice(2).map(bas);
  if (hashes.length !== 6 || hashes.some((h) => !HASH.test(h))) { console.error('usage: node contracts/noter-deploiement-pack-economie-v2.mjs <txL> <txP> <txT> <txS> <txV> <txR>'); process.exit(2); }
  const ICI = path.dirname(fileURLToPath(import.meta.url));
  const out = process.env.PACK_DEPLOYE_OUT ? path.resolve(process.env.PACK_DEPLOYE_OUT) : path.join(ICI, '..', 'economie-v2-pack-deploye.js');
  const { PACK_ECONOMIE_V2: rec } = await import('../economie-v2-pack-deploiement.js');
  const lus = [];
  for (const url of NOEUDS) {
    const rpc = rpcLecture(url), txs = [], recus = [];
    for (const h of hashes) { txs.push(await rpc('eth_getTransactionByHash', [h])); recus.push(await rpc('eth_getTransactionReceipt', [h])); }
    const v = await verifierPack(rec, hashes, rpc);
    console.log(url + ': verifier ' + (v.ok ? 'ALL ' + v.lignes.length + ' CHECKS HOLD' : v.lignes.filter((l) => !l.ok).length + ' check(s) FAILED: ' + v.lignes.filter((l) => !l.ok).map((l) => l.quoi).join(' | ')));
    lus.push({ url, txs, recus, v });
  }
  for (let k = 0; k < 6; k++) {
    const a = empreinte(lus[0].txs[k], lus[0].recus[k]), b = empreinte(lus[1].txs[k], lus[1].recus[k]);
    if (a !== b) { console.error('REFUSED: the two nodes disagree on step ' + (k + 1) + '\n  ' + a + '\n  ' + b); process.exit(1); }
  }
  const r = await noterPack({ rec, hashes, txs: lus[0].txs, recus: lus[0].recus, verdicts: lus.map((x) => x.v) });
  if (!r.ok) { console.error('REFUSED: ' + r.pourquoi); process.exit(1); }
  const d = decision(fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null, r.texte);
  if (d !== 'ecrire' && d !== 'inchange') { console.error('REFUSED: ' + d + ' (' + out + ')'); process.exit(1); }
  if (d === 'ecrire') fs.writeFileSync(out, r.texte);
  console.log((d === 'ecrire' ? 'written ' : 'unchanged ') + out + ' · N ' + r.fiche.nonceN + ' · ' + r.fiche.etapes.map((e) => e.lettre + ' ' + e.adresse + ' @' + e.bloc).join(' · '));
}
