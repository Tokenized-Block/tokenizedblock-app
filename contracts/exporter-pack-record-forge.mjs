/* exporter-pack-record-forge.mjs — writes, for a TEST wallet and nonce, the six creation byte strings of a pack record exactly as
 *   deployer-economie-v2.html would send them (pack-economie-v2.js creationEtape, V and R predicted), plus the predicted addresses, so that
 *   forge-pack/test/PackRecord.fork.t.sol can deploy THOSE bytes on a Base fork (simulation only; nothing is signed or sent).
 * Usage: node contracts/exporter-pack-record-forge.mjs <record.js> <outDir> <wallet | record> <nonce>
 *   `record` takes the record's own deployer (nothing typed). wallet.txt and nonce.txt are written too: PackRecord.fork.t.sol reads both
 *   and checks the fork's own nonce of the wallet == nonce.txt (for the real deployer: pass its eth_getTransactionCount pending).
 *   The record must carry the pack wiring (Likes names R, R lists [L, T, S]): integrite() is checked first. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { predire, creationEtape, integrite, adresse, LETTRES } from '../pack-economie-v2.js';
const [rec, out, walletArg, nonce] = process.argv.slice(2);
if (!rec || !out || !walletArg || nonce === undefined) throw new Error('usage: <record.js> <outDir> <wallet | record> <nonce>');
const { PACK_ECONOMIE_V2: R } = await import(pathToFileURL(path.resolve(rec)).href);
const faux = await integrite(R);
if (faux.length) throw new Error('record integrity MISMATCH: ' + faux.join(', '));
const wallet = adresse(walletArg === 'record' ? R.deployeur : walletArg);
const p = predire(wallet, nonce);
fs.mkdirSync(out, { recursive: true });
R.etapes.forEach((e, k) => fs.writeFileSync(path.join(out, 'c' + k + '.hex'), creationEtape(R, k, p)));
fs.writeFileSync(path.join(out, 'predicted.txt'), LETTRES.map((l) => p[l]).join('\n'));
fs.writeFileSync(path.join(out, 'wallet.txt'), wallet + '\n');
fs.writeFileSync(path.join(out, 'nonce.txt'), BigInt(nonce).toString() + '\n');
console.log('wrote 6 creations for', wallet, 'nonce', nonce, '->', out);
