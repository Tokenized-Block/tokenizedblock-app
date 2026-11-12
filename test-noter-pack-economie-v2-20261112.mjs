/* test-noter-pack-economie-v2-20261112.mjs — the record of the deployed economy v2 pack (economie-v2-pack-deploye.js) and its writer
 *   (contracts/noter-deploiement-pack-economie-v2.mjs). Signs nothing, sends nothing.
 *   1. OFFLINE: the record names the frozen pack (sha256Pack), lists L P T S V R in order, each address IS the CREATE address of
 *      (frozen deployer, nonceN + k) — computed, not typed; addresses / tx hashes distinct, blocks increasing; the file is exactly what
 *      the one writer produces; NOTHING TYPED TWICE: each address and tx hash appears once in the record, no other address is retyped
 *      there (deployer, existing contracts stay in the frozen pack), and no other source file in the tree carries the six addresses.
 *   2. noterPack() on stubs rebuilt from the record round-trips to the SAME text; 14 mutants are all refused; decision() never
 *      overwrites a different record.
 *   3. ON CHAIN (skipped only with HORS_LIGNE=1, and then said): on BOTH nodes, every receipt: status 0x1, contractAddress == the
 *      record address, blockNumber == the record block, transactionHash == the record tx; every tx: from == the frozen deployer,
 *      nonce == nonceN + k, no `to`; code present at each address. Reads only (eth_getTransactionReceipt, eth_getTransactionByHash,
 *      eth_getCode). Exit 0 only if every check holds. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACK_ECONOMIE_V2_DEPLOYE as F, ADRESSES_PACK_ECONOMIE_V2 as A } from './economie-v2-pack-deploye.js';
import { PACK_ECONOMIE_V2 as P } from './economie-v2-pack-deploiement.js';
import { LETTRES, predire, creationEtape } from './pack-economie-v2.js';
import { noterPack, texteFiche, decision, empreinte, rpcLecture, NOEUDS } from './contracts/noter-deploiement-pack-economie-v2.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const TEXTE = fs.readFileSync(path.join(ICI, 'economie-v2-pack-deploye.js'), 'utf8');
let ok = 0, ko = 0;
const t = (m, c, x = '') => { if (c) ok++; else ko++; console.log((c ? 'ok  ' : 'KO  ') + m + (c || x === '' ? '' : ' — ' + x)); };
const bas = (x) => String(x).toLowerCase();
const compte = (s, sous) => s.split(sous).length - 1;

/* ---------------- 1. offline ---------------- */
t('record names the frozen pack it deployed (sha256Pack)', F.sha256Pack === P.sha256Pack, F.sha256Pack);
t('frozen pack is the real record, not a test fixture', P.fixtureDeTest === false);
t('same chain as the frozen pack (Base 8453)', F.chaine === P.chaine && F.chaine === 8453, F.chaine);
t('six steps in the order L P T S V R', F.etapes.length === 6 && F.etapes.every((e, k) => e.lettre === LETTRES[k]), F.etapes.map((e) => e.lettre).join(''));
t('each step carries only lettre, adresse, tx, bloc', F.etapes.every((e) => Object.keys(e).join(',') === 'lettre,adresse,tx,bloc'));
t('the record carries only chaine, sha256Pack, nonceN, etapes (no deployer, no product name, no existing address)', Object.keys(F).join(',') === 'chaine,sha256Pack,nonceN,etapes', Object.keys(F).join(','));
t('nonceN is a safe positive integer', Number.isSafeInteger(F.nonceN) && F.nonceN > 0, F.nonceN);
const pred = predire(P.deployeur, F.nonceN);
for (const e of F.etapes) t(e.lettre + ' address = CREATE(frozen deployer, nonceN + ' + LETTRES.indexOf(e.lettre) + ') (computed, not typed)', e.adresse === pred[e.lettre], e.adresse + ' vs ' + pred[e.lettre]);
t('ADRESSES_PACK_ECONOMIE_V2 is derived from the steps', LETTRES.every((l, k) => A[l] === F.etapes[k].adresse) && Object.keys(A).length === 6);
t('six distinct addresses', new Set(F.etapes.map((e) => e.adresse)).size === 6);
t('six distinct tx hashes, 0x + 64 hex lowercase', new Set(F.etapes.map((e) => e.tx)).size === 6 && F.etapes.every((e) => /^0x[0-9a-f]{64}$/.test(e.tx)));
t('blocks are integers, strictly increasing L..R', F.etapes.every((e, k) => Number.isSafeInteger(e.bloc) && (k === 0 || e.bloc > F.etapes[k - 1].bloc)), F.etapes.map((e) => e.bloc).join(','));
t('the file is exactly what the one writer produces (not edited by hand)', texteFiche(F) === TEXTE);
t('the file is LF only', !TEXTE.includes('\r'));
/* nothing typed twice */
for (const e of F.etapes) {
  t(e.lettre + ': its address appears exactly once in the record text', compte(bas(TEXTE), e.adresse.slice(2)) === 1, compte(bas(TEXTE), e.adresse.slice(2)));
  t(e.lettre + ': its tx hash appears exactly once in the record text', compte(bas(TEXTE), e.tx.slice(2)) === 1);
}
const hex40 = (bas(TEXTE).match(/0x[0-9a-f]{40,}/g) || []).filter((h) => h.length === 42);
t('no other address is retyped in the record (only the six)', hex40.length === 6 && hex40.every((h) => F.etapes.some((e) => e.adresse === h)), hex40.join(' '));
t('the deployer is not retyped in the record', !bas(TEXTE).includes(bas(P.deployeur).slice(2)));
const sources = [];
for (const d of [ICI, path.join(ICI, 'contracts')]) for (const n of fs.readdirSync(d)) if (/\.(m?js|html|json)$/.test(n)) sources.push(path.join(d, n));
const ailleurs = sources.filter((p) => path.basename(p) !== 'economie-v2-pack-deploye.js').filter((p) => { const s = bas(fs.readFileSync(p, 'utf8')); return F.etapes.some((e) => s.includes(e.adresse.slice(2))); });
t('no other source file in the tree carries one of the six addresses (' + sources.length + ' files scanned)', ailleurs.length === 0, ailleurs.map((p) => path.relative(ICI, p)).join(', '));

/* ---------------- 2. noterPack on stubs ---------------- */
const tag = (n) => '0x' + n.toString(16);
const adrPred = Object.fromEntries(LETTRES.map((l) => [l, pred[l]]));
const chaine = () => {
  const txs = [], recus = [];
  F.etapes.forEach((e, k) => {
    txs.push({ hash: e.tx, from: P.deployeur, to: null, nonce: tag(F.nonceN + k), blockNumber: tag(e.bloc), input: creationEtape(P, k, adrPred) });
    recus.push({ transactionHash: e.tx, status: '0x1', contractAddress: e.adresse, blockNumber: tag(e.bloc) });
  });
  return { rec: P, hashes: F.etapes.map((e) => e.tx), txs, recus, verdicts: [{ ok: true }, { ok: true }] };
};
const bon = await noterPack(chaine());
t('noterPack on the chain shape rebuilt from the record: accepted', bon.ok === true, bon.pourquoi);
t('noterPack round-trips to the SAME record text', bon.ok && bon.texte === TEXTE);
const mutants = [
  ['receipt status 0x0', (c) => { c.recus[3].status = '0x0'; }],
  ['signed by another wallet', (c) => { c.txs[2].from = '0x' + '11'.repeat(20); }],
  ['step 1 signed by another wallet', (c) => { c.txs[0].from = '0x' + '22'.repeat(20); }],
  ['nonce skipped', (c) => { c.txs[4].nonce = tag(F.nonceN + 5); }],
  ['a tx with a `to`', (c) => { c.txs[1].to = '0x' + '33'.repeat(20); }],
  ['signed data altered by one byte', (c) => { c.txs[5].input = c.txs[5].input.slice(0, -2) + (c.txs[5].input.endsWith('00') ? '01' : '00'); }],
  ['contractAddress not the prediction', (c) => { c.recus[0].contractAddress = '0x' + '44'.repeat(20); }],
  ['receipt of another tx', (c) => { c.recus[2].transactionHash = '0x' + '55'.repeat(32); }],
  ['the same hash given twice', (c) => { c.hashes[1] = c.hashes[0]; }],
  ['only five hashes', (c) => { c.hashes.pop(); }],
  ['verifier failed on one node', (c) => { c.verdicts[1] = { ok: false }; }],
  ['blocks out of order', (c) => { c.recus[3].blockNumber = c.txs[3].blockNumber = tag(F.etapes[0].bloc - 1); }],
  ['tx and receipt name different blocks', (c) => { c.recus[4].blockNumber = tag(F.etapes[4].bloc + 1); }],
  ['the frozen record flagged a test fixture', (c) => { c.rec = { ...P, fixtureDeTest: true }; }],
];
for (const [nom, muter] of mutants) {
  const c = chaine();
  muter(c);
  const r = await noterPack(c);
  t('mutant refused: ' + nom, r.ok === false && typeof r.pourquoi === 'string', r.ok ? 'ACCEPTED' : '');
}
t('decision: no file -> write', decision(null, TEXTE) === 'ecrire');
t('decision: same text -> unchanged', decision(TEXTE, TEXTE) === 'inchange');
t('decision: a different record already there -> refused, nothing overwritten', !['ecrire', 'inchange'].includes(decision(TEXTE.replace(F.etapes[0].adresse, pred.P), TEXTE)));
t('empreinte differs when one node reports another block', empreinte(chaine().txs[0], chaine().recus[0]) !== empreinte(chaine().txs[0], { ...chaine().recus[0], blockNumber: '0x1' }));

/* ---------------- 3. on chain ---------------- */
if (process.env.HORS_LIGNE === '1') {
  console.log('SKIPPED  on-chain part (HORS_LIGNE=1): the receipts were NOT re-read in this run');
} else {
  for (const url of NOEUDS) {
    const rpc = rpcLecture(url);
    for (let k = 0; k < 6; k++) {
      const e = F.etapes[k];
      const r = await rpc('eth_getTransactionReceipt', [e.tx]).catch((x) => ({ erreur: String(x.message || x) }));
      const x = await rpc('eth_getTransactionByHash', [e.tx]).catch((y) => ({ erreur: String(y.message || y) }));
      const quoi = url.replace('https://', '') + ' ' + e.lettre + ': ';
      t(quoi + 'receipt status 0x1', r && r.status === '0x1', r && (r.status || r.erreur));
      t(quoi + 'receipt contractAddress == record address', r && bas(r.contractAddress) === e.adresse, r && r.contractAddress);
      t(quoi + 'receipt blockNumber == record block ' + e.bloc, r && Number.parseInt(r.blockNumber, 16) === e.bloc, r && r.blockNumber);
      t(quoi + 'receipt transactionHash == record tx', r && bas(r.transactionHash) === e.tx);
      t(quoi + 'tx.from == frozen deployer', x && bas(x.from) === bas(P.deployeur), x && (x.from || x.erreur));
      t(quoi + 'tx nonce == nonceN + ' + k, x && x.nonce && BigInt(x.nonce) === BigInt(F.nonceN + k), x && x.nonce);
      t(quoi + 'tx is a contract creation (no `to`)', x && !x.to, x && x.to);
      const code = await rpc('eth_getCode', [e.adresse, 'latest']).catch(() => '0x');
      t(quoi + 'code present at the address', typeof code === 'string' && code.length > 2, code && code.length);
    }
  }
}
console.log((ko ? 'FAILED ' + ko + ' of ' : 'ALL ') + (ok + ko) + ' checks' + (ko ? '' : ' hold'));
process.exit(ko ? 1 : 0);
