/* test-noter-skins-spin-20261112.mjs — THE NOTE OF THE TWO DEPLOYS (skins-spin.js noterPaire + contracts/noter-deploiement-skins-spin.mjs).
 * WHY: the app switches to the 1 USDC Skins and the new Spin ONLY when the record names them. The note is written from the receipts, read
 *   on two nodes, after the verifier held on both; nothing else may switch the app.
 * A  EXECUTED  noterPaire on good receipts: nonceN and both addresses / tx / blocks written with the ONE writer; the deploy data kept byte
 *              for byte (integrity still holds); deployes() then follows exactly the two CREATE addresses.
 * B  EXECUTED  refusals: a verifier that failed on one node, a single node, the same hash twice, a hash malformed, step 1 from another
 *              wallet, step 2 at another nonce, a contract at another address, a receipt of another tx, blocks out of order, a record
 *              already noted, a test fixture.
 * C  EXECUTED  the CLI: wrong usage -> exit 2; a single node -> refused, nothing written; the record file is never touched on a refusal.
 * SKINS_SPIN_MODULE: a mutated copy of skins-spin.js. Counts itself and prints n/n. */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const ICI = dirname(fileURLToPath(import.meta.url));
const SS = await import(process.env.SKINS_SPIN_MODULE ? pathToFileURL(process.env.SKINS_SPIN_MODULE).href : pathToFileURL(join(ICI, 'skins-spin.js')).href);
const { SKINS_SPIN_DEPLOIEMENT: R } = await import(pathToFileURL(join(ICI, 'skins-spin-deploiement.js')).href);
const { adresseCreate } = await import(pathToFileURL(join(ICI, 'pack-economie-v2.js')).href);
let n = 0, ko = 0;
const t = (label, cond) => { n += 1; if (cond === true) console.log('  ok   ' + label); else { ko += 1; console.log('  KO   ' + label); } };
const hx = (x) => '0x' + BigInt(x).toString(16);
const W = R.deployeur, N = 412;
const H = ['0x' + 'a1'.repeat(32), '0x' + 'b2'.repeat(32)];
/* 2026-11-13 the real record is NOTED (nonceN 214). The note itself is exercised on a COPY of it with adresse / tx / bloc / nonceN reset
 *   to null (NUL = the record exactly as the noter found it), so a fresh record is still covered; the real record must be refused. */
const NUL = (() => { const x = JSON.parse(JSON.stringify(R)); x.nonceN = null; for (const e of x.etapes) { e.adresse = null; e.tx = null; e.bloc = null; } return x; })();
function recus(o = {}) {
  const txs = [0, 1].map((k) => ({ hash: H[k], from: (o.de && o.de[k]) || W, to: null, nonce: hx((o.nonces && o.nonces[k]) ?? N + k), input: SS.creationEtape(R, k), blockNumber: hx((o.blocs && o.blocs[k]) || 56700000 + k) }));
  const rs = [0, 1].map((k) => ({ transactionHash: (o.rh && o.rh[k]) || H[k], status: '0x1', contractAddress: (o.ou && o.ou[k]) || adresseCreate(W, N + k), blockNumber: hx((o.blocs && o.blocs[k]) || 56700000 + k) }));
  return { txs, recus: rs };
}
const OK2 = [{ ok: true }, { ok: true }];
const noter = (o = {}, x = {}) => SS.noterPaire({ rec: x.rec || NUL, hashes: x.hashes || H, ...recus(o), verdicts: x.verdicts || OK2 });

console.log('— A. a good note');
const a = await noter();
t('A noted: nonceN and both steps written', a.ok === true && a.rec.nonceN === N && a.rec.etapes[0].adresse === adresseCreate(W, N).toLowerCase() && a.rec.etapes[1].adresse === adresseCreate(W, N + 1).toLowerCase()
  && a.rec.etapes[0].tx === H[0] && a.rec.etapes[1].bloc === 56700001);
t('A the text is the ONE writer\'s, LF only', a.ok && a.texte === SS.texteRecord(a.rec) && !a.texte.includes('\r'));
t('A the deploy data is kept: integrity still holds, same pair sha256', a.ok && (await SS.integrite(a.rec)).length === 0 && a.rec.sha256Paire === R.sha256Paire
  && a.rec.etapes.every((e, k) => e.init === R.etapes[k].init && e.args.join() === R.etapes[k].args.join()));
const d = SS.deployes(a.rec);
t('A the app then follows exactly the two CREATE addresses, with their blocks', d.skins && d.spin && d.skins.adresse === a.rec.etapes[0].adresse && d.spin.adresse === a.rec.etapes[1].adresse && d.skins.bloc === 56700000);
t('A the followed config carries the live router and vault (read from the pack record), 1 USDC', d.skins.config.router === SS.resoudre('@P') && d.spin.config.dest === SS.resoudre('@V') && d.skins.config.mintPriceUsdc === '1000000');

console.log('— B. refusals');
const non = async (o, x, quoi, motif) => { const r = await noter(o, x); t('B refused: ' + quoi, r.ok === false && (!motif || motif.test(r.pourquoi))); };
await non({}, { verdicts: [{ ok: true }, { ok: false }] }, 'the verifier failed on one node', /every node/);
await non({}, { verdicts: [{ ok: true }] }, 'a single node', /every node/);
await non({}, { hashes: [H[0], H[0]] }, 'the same hash twice');
await non({}, { hashes: [H[0], '0x12'] }, 'a malformed hash');
await non({ de: ['0x' + '77'.repeat(20)] }, {}, 'step 1 signed by another wallet', /not signed by the deployer/);
await non({ nonces: [N, N + 2] }, {}, 'step 2 at another nonce', /nonce/);
await non({ ou: [null, '0x' + '88'.repeat(20)] }, {}, 'the Spin at another address', /predicted/);
await non({ rh: [null, '0x' + 'cc'.repeat(32)] }, {}, 'a receipt of another transaction', /not the one/);
await non({ blocs: [56700005, 56700001] }, {}, 'step 2 mined before step 1', /before/);
await non({}, { rec: a.rec }, 'a record already noted', /already names/);
await non({}, { rec: R }, 'the REAL record, noted on 2026-11-13 (nonceN 214): never rewritten', /already names/);
await non({}, { rec: { ...JSON.parse(JSON.stringify(NUL)), fixtureDeTest: true } }, 'a test fixture', /fixture/);
t('B the real record is the note of nonce 214: the CREATE addresses of (deployer, 214) and (deployer, 215), blocks increasing',
  R.nonceN === 214 && R.etapes.every((e, k) => e.adresse === adresseCreate(W, 214 + k).toLowerCase() && /^0x[0-9a-f]{64}$/.test(e.tx)) && R.etapes[0].bloc === 56675741 && R.etapes[1].bloc === 56675860);
t('B the real record = NUL with its four noted fields, by the ONE writer (nothing else changed by the note)', (() => { const y = JSON.parse(JSON.stringify(NUL)); y.nonceN = R.nonceN;
  y.etapes.forEach((e, k) => { e.adresse = R.etapes[k].adresse; e.tx = R.etapes[k].tx; e.bloc = R.etapes[k].bloc; }); return SS.texteRecord(y) === readFileSync(join(ICI, 'skins-spin-deploiement.js'), 'utf8'); })());

console.log('— C. the CLI');
{
  const dir = mkdtempSync(join(tmpdir(), 'skspin-noter-'));
  try {
    const cli = join(ICI, 'contracts', 'noter-deploiement-skins-spin.mjs');
    /* on a copy of the record before the note (NUL) AND on a copy of the real noted record */
    for (const [quoi, texte] of [['before the note', SS.texteRecord(NUL)], ['the noted record', readFileSync(join(ICI, 'skins-spin-deploiement.js'), 'utf8')]]) {
      const copie = join(dir, 'skins-spin-deploiement.js');
      writeFileSync(copie, texte);
      const avant = readFileSync(copie, 'utf8');
      const u = spawnSync(process.execPath, [cli, H[0]], { encoding: 'utf8', env: { ...process.env, SKINS_SPIN_RECORD: copie } });
      t('C (' + quoi + ') one hash: usage, exit 2', u.status === 2 && /usage/.test(u.stderr));
      const s = spawnSync(process.execPath, [cli, ...H], { encoding: 'utf8', env: { ...process.env, SKINS_SPIN_RECORD: copie, SKINS_SPIN_NOEUDS: 'http://127.0.0.1:9' } });
      t('C (' + quoi + ') a single node: refused, exit 1', s.status === 1 && /two nodes are needed/.test(s.stderr));
      t('C (' + quoi + ') the record file is untouched after the refusals', readFileSync(copie, 'utf8') === avant);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const src = readFileSync(join(ICI, 'contracts', 'noter-deploiement-skins-spin.mjs'), 'utf8');
t('C the CLI reads only (eth_chainId, getTransactionByHash, getTransactionReceipt, getCode, eth_call): no send method named', !/eth_send|sendRawTransaction|personal_|eth_sign/.test(src));
t('C the CLI writes only after noterPaire, the two-node agreement and an unchanged file', src.indexOf('fs.writeFileSync(fichier, r.texte)') > src.indexOf('noterPaire(') && src.indexOf('fs.writeFileSync(fichier, r.texte)') > src.indexOf('the two nodes disagree')
  && src.indexOf('fs.writeFileSync(fichier, r.texte)') > src.indexOf('the record changed while it was being checked'));
console.log(n - ko + '/' + n + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
