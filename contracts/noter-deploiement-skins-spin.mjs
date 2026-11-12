/* contracts/noter-deploiement-skins-spin.mjs — AFTER the two deploys (deployer-skins-spin.html): writes nonceN and, for the new Skins and
 *   the new Spin, the contract address, the creation tx and its block into skins-spin-deploiement.js, from the RECEIPTS, and only if
 *   EVERYTHING holds. Read-only: nothing is signed or sent.
 *   Usage: node contracts/noter-deploiement-skins-spin.mjs <txSkins> <txSpin>
 *     env SKINS_SPIN_RECORD (default ../skins-spin-deploiement.js): the record read AND rewritten (the tests point it at a copy);
 *     env SKINS_SPIN_NOEUDS (comma list, default the two Base nodes below): a fork test points both at its local fork.
 * Reads every tx and receipt on TWO nodes (https://mainnet.base.org, https://base-rpc.publicnode.com) and REFUSES (writes nothing) if
 *   they disagree on any field kept; then the full verifier (skins-spin.js verifierPaire: integrity, tx.from = the frozen deployer, nonces
 *   N and N+1, signed data = the frozen creation, status 1, contractAddress = the CREATE prediction, runtime = the frozen build, every
 *   constructor value read back) must hold on BOTH nodes; then noterPaire() re-checks each step and builds the new text with the ONE
 *   writer (texteRecord). The app follows an address only if it is the CREATE address of (deployer, nonceN + k) (skins-spin.js deployes).
 * ⛔ A record that already names deployed contracts is never rewritten. The deploy data (init, args, sha256) is kept byte for byte. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifierPaire, noterPaire, integrite } from '../skins-spin.js';

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
  if (hashes.length !== 2 || hashes.some((h) => !HASH.test(h))) { console.error('usage: node contracts/noter-deploiement-skins-spin.mjs <txSkins> <txSpin>'); process.exit(2); }
  const ICI = path.dirname(fileURLToPath(import.meta.url));
  const fichier = process.env.SKINS_SPIN_RECORD ? path.resolve(process.env.SKINS_SPIN_RECORD) : path.join(ICI, '..', 'skins-spin-deploiement.js');
  const noeuds = process.env.SKINS_SPIN_NOEUDS ? process.env.SKINS_SPIN_NOEUDS.split(',').map((s) => s.trim()).filter(Boolean) : NOEUDS;
  if (noeuds.length < 2) { console.error('REFUSED: two nodes are needed'); process.exit(1); }
  const avant = fs.readFileSync(fichier, 'utf8');
  const { SKINS_SPIN_DEPLOIEMENT: rec } = await import(pathToFileURL(fichier).href + '?t=' + Date.now());
  const faux = await integrite(rec);
  if (faux.length) { console.error('REFUSED: record integrity MISMATCH: ' + faux.join(', ')); process.exit(1); }
  const lus = [];
  for (const url of noeuds) {
    const rpc = rpcLecture(url), txs = [], recus = [];
    for (const h of hashes) { txs.push(await rpc('eth_getTransactionByHash', [h])); recus.push(await rpc('eth_getTransactionReceipt', [h])); }
    const v = await verifierPaire(rec, hashes, rpc);
    console.log(url + ': verifier ' + (v.ok ? 'ALL ' + v.lignes.length + ' CHECKS HOLD' : v.lignes.filter((l) => !l.ok).length + ' check(s) FAILED: ' + v.lignes.filter((l) => !l.ok).map((l) => l.quoi).join(' | ')));
    lus.push({ url, txs, recus, v });
  }
  for (let k = 0; k < 2; k++) {
    const a = empreinte(lus[0].txs[k], lus[0].recus[k]), b = empreinte(lus[1].txs[k], lus[1].recus[k]);
    if (a !== b) { console.error('REFUSED: the two nodes disagree on step ' + (k + 1) + '\n  ' + a + '\n  ' + b); process.exit(1); }
  }
  const r = await noterPaire({ rec, hashes, txs: lus[0].txs, recus: lus[0].recus, verdicts: lus.map((x) => x.v) });
  if (!r.ok) { console.error('REFUSED: ' + r.pourquoi); process.exit(1); }
  if (fs.readFileSync(fichier, 'utf8') !== avant) { console.error('REFUSED: the record changed while it was being checked'); process.exit(1); }
  fs.writeFileSync(fichier, r.texte);
  console.log('written ' + fichier + ' · N ' + r.rec.nonceN + ' · ' + r.rec.etapes.map((e) => e.cle + ' ' + e.adresse + ' @' + e.bloc).join(' · '));
}
