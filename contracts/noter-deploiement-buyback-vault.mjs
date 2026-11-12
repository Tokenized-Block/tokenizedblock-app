/* contracts/noter-deploiement-buyback-vault.mjs -- AFTER the ONE deploy of the TBLOCK buyback that pays the holders vault
 *   (deployer-tblock-buyback-vault.html): writes adresse / bloc / tx into tblock-buyback-vault-deploiement.js, from the RECEIPT, and only
 *   if EVERYTHING holds. Read-only on chain: nothing is signed or sent.
 *   Usage: node contracts/noter-deploiement-buyback-vault.mjs <tx hash>
 *     env BUYBACK_RECORD (default ../tblock-buyback-vault-deploiement.js) = the record read;
 *         BUYBACK_DEPLOIEMENT_OUT (default: the record itself) = where the noted record is written;
 *         BUYBACK_NOTER_RPCS=url1,url2 (tests on a local fork only) replaces the two Base nodes, and then BUYBACK_DEPLOIEMENT_OUT is
 *         REQUIRED, so a fork can never write the tree record.
 * Reads the tx and receipt on TWO nodes (https://mainnet.base.org, https://base-rpc.publicnode.com) and REFUSES (writes nothing) if they
 *   disagree on any field kept; then verifierBuybackVault (record integrity, tx.from = the deployer, status 1, the frozen data at the
 *   CREATE address, runtime = the frozen build, DEST = V, GUARDIAN / VETO / KEEPER, every number, the door) must hold on BOTH nodes;
 *   then noterBuybackVault() re-checks the receipt and rewrites ONLY the three lines adresse / bloc / tx of the generated record.
 * A record already noted with another address is never overwritten; the same text again = unchanged.
 * noterBuybackVault() and decision() are pure (tested with stubs); the CLI wires the RPC. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { integrite, controleEnvoi, verifierBuybackVault } from '../buyback-vault.js';

export const NOEUDS = Object.freeze(['https://mainnet.base.org', 'https://base-rpc.publicnode.com']);
const HASH = /^0x[0-9a-f]{64}$/;
const bas = (x) => String(x == null ? '' : x).toLowerCase();
const sha = (s) => crypto.createHash('sha256').update(bas(s)).digest('hex');
export const BLOC_VIDE = '  adresse: null,\n  bloc: null,\n  tx: null,\n';

/** the fields two nodes must agree on */
export function empreinte(tx, recu) {
  return JSON.stringify({
    hash: tx ? bas(tx.hash) : null, from: tx ? bas(tx.from) : null, to: tx && tx.to ? bas(tx.to) : null,
    nonce: tx ? bas(tx.nonce) : null, txBloc: tx ? bas(tx.blockNumber) : null, input: tx ? sha(tx.input || tx.data) : null,
    recuHash: recu ? bas(recu.transactionHash) : null, status: recu ? bas(recu.status) : null,
    contractAddress: recu && recu.contractAddress ? bas(recu.contractAddress) : null, bloc: recu ? bas(recu.blockNumber) : null,
  });
}

/** pure: { ok:false, pourquoi } or { ok:true, fiche, texte }. texte = the generated record's text (adresse/bloc/tx still null) */
export async function noterBuybackVault({ rec, texte, hash, tx, recu, verdicts }) {
  const non = (p) => ({ ok: false, pourquoi: p });
  if (!rec) return non('no record');
  const faux = await integrite(rec);
  if (faux.length) return non('record integrity MISMATCH: ' + faux.join(', '));
  const h = bas(hash);
  if (!HASH.test(h)) return non('a transaction hash is needed');
  if (!Array.isArray(verdicts) || verdicts.length < 2 || verdicts.some((v) => !v || v.ok !== true)) return non('the buyback verifier does not hold on every node');
  const ko = controleEnvoi(rec, rec.deployeur, tx, recu);
  if (ko.length) return non(ko.join(' · '));
  if (bas(tx.hash) !== h || bas(recu.transactionHash) !== h) return non('the transaction or receipt is not the one of ' + h);
  if (bas(tx.blockNumber) !== bas(recu.blockNumber)) return non('transaction and receipt name different blocks');
  const bloc = Number.parseInt(recu.blockNumber, 16);
  if (!Number.isSafeInteger(bloc) || bloc <= 0) return non('the receipt has no block number');
  const a = bas(recu.contractAddress);
  if (verdicts.some((v) => bas(v.adresse) !== a)) return non('a verifier checked another address than the receipt names');
  if (rec.adresse) {
    if (bas(rec.adresse) === a && bas(rec.tx) === h && rec.bloc === bloc) return { ok: true, fiche: Object.freeze({ adresse: a, bloc, tx: h }), texte };
    return non('the record already names ' + rec.adresse + ' (tx ' + rec.tx + '): nothing overwritten');
  }
  if (typeof texte !== 'string' || texte.split(BLOC_VIDE).length !== 2) return non('the record text does not hold exactly one empty adresse / bloc / tx block');
  if (!texte.includes("sha256Creation: '" + rec.sha256Creation + "'")) return non('the record text is not the record checked');
  const fiche = Object.freeze({ adresse: a, bloc, tx: h });
  return { ok: true, fiche, texte: texte.replace(BLOC_VIDE, () => "  adresse: '" + a + "',\n  bloc: " + bloc + ",\n  tx: '" + h + "',\n") };
}

/** what to do with the record already there: 'ecrire' | 'inchange' | refusal text */
export function decision(existant, nouveau, base) {
  if (existant === nouveau) return 'inchange';
  if (existant === null || existant === undefined || existant === base) return 'ecrire';
  return 'the record on disk is not the one read (already noted, or regenerated): nothing overwritten';
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

async function cli() {
  const h = bas(process.argv[2]);
  if (!HASH.test(h) || process.argv.length !== 3) { console.error('usage: node contracts/noter-deploiement-buyback-vault.mjs <the deploy transaction hash>'); { process.exitCode = 2; return; } }
  const ICI = path.dirname(fileURLToPath(import.meta.url));
  const recPath = process.env.BUYBACK_RECORD ? path.resolve(process.env.BUYBACK_RECORD) : path.join(ICI, '..', 'tblock-buyback-vault-deploiement.js');
  const noeuds = process.env.BUYBACK_NOTER_RPCS ? process.env.BUYBACK_NOTER_RPCS.split(',').map((x) => x.trim()).filter(Boolean) : NOEUDS;
  if (process.env.BUYBACK_NOTER_RPCS && !process.env.BUYBACK_DEPLOIEMENT_OUT) { console.error('REFUSED: other nodes than Base need BUYBACK_DEPLOIEMENT_OUT (a fork never writes the tree record)'); { process.exitCode = 2; return; } }
  if (noeuds.length !== 2) { console.error('REFUSED: two nodes are needed'); { process.exitCode = 2; return; } }
  const out = process.env.BUYBACK_DEPLOIEMENT_OUT ? path.resolve(process.env.BUYBACK_DEPLOIEMENT_OUT) : recPath;
  const texte = fs.readFileSync(recPath, 'utf8');
  const { BUYBACK_VAULT_DEPLOIEMENT: rec } = await import(pathToFileURL(recPath).href + '?t=' + Date.now());
  const lus = [];
  for (const url of noeuds) {
    const rpc = rpcLecture(url);
    const tx = await rpc('eth_getTransactionByHash', [h]), recu = await rpc('eth_getTransactionReceipt', [h]);
    const v = await verifierBuybackVault(rec, h, rpc);
    console.log(url + ': verifier ' + (v.ok ? 'ALL ' + v.lignes.length + ' CHECKS HOLD' : v.lignes.filter((l) => !l.ok).length + ' check(s) FAILED: ' + v.lignes.filter((l) => !l.ok).map((l) => l.quoi).join(' | ')));
    lus.push({ url, tx, recu, v });
  }
  const a = empreinte(lus[0].tx, lus[0].recu), b = empreinte(lus[1].tx, lus[1].recu);
  if (a !== b) { console.error('REFUSED: the two nodes disagree\n  ' + a + '\n  ' + b); { process.exitCode = 1; return; } }
  const r = await noterBuybackVault({ rec, texte, hash: h, tx: lus[0].tx, recu: lus[0].recu, verdicts: lus.map((x) => x.v) });
  if (!r.ok) { console.error('REFUSED: ' + r.pourquoi); { process.exitCode = 1; return; } }
  const d = decision(fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null, r.texte, texte);
  if (d !== 'ecrire' && d !== 'inchange') { console.error('REFUSED: ' + d + ' (' + out + ')'); { process.exitCode = 1; return; } }
  if (d === 'ecrire') fs.writeFileSync(out, r.texte);
  console.log((d === 'ecrire' ? 'written ' : 'unchanged ') + out + ' · buyback ' + r.fiche.adresse + ' @' + r.fiche.bloc + ' tx ' + r.fiche.tx);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await cli(); } catch (e) { console.error('REFUSED (nothing written): ' + String((e && e.message) || e).slice(0, 300)); process.exitCode = 1; }
}
