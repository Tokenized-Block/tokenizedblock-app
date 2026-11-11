/* test-journal-restore-20261111.mjs — game372 Step A: the game journal is kept across deploys (file on the volume).
 * AFFIRME, on a REAL local server (serveur-web.js) against a FAKE node (midnight UTC ~14 000 blocks under the head, as
 * test-journal-relist does), each run on its own temp volume:
 *   run 1 : fresh volume -> normal catch-up; the file journal-jeu.json appears and reaches the covered state (it serialises);
 *   run 2 : run 1's file, its cursor set 3 000 blocks back (a save that lagged) and an old refusal planted in it ->
 *           restaure === true, restaureDe = that cursor, fenetresRattrapage === 0, NO journal eth_getLogs with toBlock < restaureDe,
 *           the same events as run 1, no duplicated (tx, logIndex), and no old refusal shown (rattrapage null);
 *   run 3 : the file dated yesterday -> discarded, normal catch-up (restaure false);
 *   run 4 : the file's cursor beyond the head -> discarded (restaure false);
 *   run 5 : (review) a node that REFUSES eth_getLogs deeper than 10 000 blocks (as the public node) and a file of today whose cursor
 *           is 12 000 blocks back (a long outage) -> discarded: restaure false, the direct reaches the head and shows the recent events.
 *           Restored, the direct stalled on the refused window every tour and showed nothing new.
 * MUTANTS (copies of serveur-web.js next to it, removed after): (a) chargerJournal returns early, (b) the day check removed,
 *   (c) the old refusal restored, (d) the depth check removed — each must turn this test RED.
 * NE PROUVE PAS : a real Railway volume, a real deploy (prod check: /api/jeu/journal restaure on the 2nd deploy after this ships).
 * PORTABLE: process.exitCode, never process.exit. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
let n = 0, ko = 0;
const ok = (c, m) => { n++; if (!c) { ko++; console.error('KO ' + m); } };
const dormir = (ms) => new Promise((o) => setTimeout(o, ms));
const { topic } = await import(pathToFileURL(path.join(ICI, 'keccak.js')).href);
const { BLOCKROLLS_DEPLOIEMENT } = await import(pathToFileURL(path.join(ICI, 'blockrolls-deploiement.js')).href);
const { jourDe } = await import(pathToFileURL(path.join(ICI, 'tirage-saison.js')).href);
const ROLLS = String(BLOCKROLLS_DEPLOIEMENT.adresse).toLowerCase();
const T_ROLLED = topic('Rolled(uint256,address,uint8[5],uint256,bool,uint256,uint256)');
const u = (x) => BigInt(x).toString(16).padStart(64, '0');
const hx = (x) => '0x' + x.toString(16);
const txh = (k) => '0x' + k.toString(16).padStart(64, '0');
const W = '0x' + '34'.repeat(20);
const tA = (a) => '0x' + '0'.repeat(24) + a.slice(2);

/* the fake chain: midnight UTC ~14 000 blocks under the head (the direct reads 9 000, the catch-up the rest) */
const H = 3000000;
const nowS = Math.floor(Date.now() / 1000), minuitS = Math.floor(nowS / 86400) * 86400;
const sB = Math.max(nowS - minuitS, 30) / 14000;
const tsB = (b) => nowS - Math.floor((H - b) * sB);
let P = null;
for (let b = H - 20000; b <= H; b++) if (tsB(b) >= minuitS) { P = b; break; }
ok(Number.isSafeInteger(P) && H - P > 11000, 'fake node: midnight UTC at block ' + P + ' (' + (H - P) + ' under the head)');
const rolled = (k, bloc) => ({ address: ROLLS, topics: [T_ROLLED, '0x' + u(k), tA(W)], data: '0x' + [1, 2, 3, 4, 5].map(u).join('') + u(52771493) + u(0) + u(250000) + u(250000),
  blockNumber: hx(bloc), logIndex: '0x0', transactionHash: txh(k) });
/* two in the catch-up, three in the direct, two of them inside the 3 000 blocks that run 2 reads again */
const LOGS = [rolled(1, P + 3), rolled(2, H - 9100), rolled(3, H - 5000), rolled(4, H - 1000), rolled(5, H - 150)];

function fauxNoeud(etat) {
  return http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => { b += c; });
    req.on('end', () => {
      let id = 1, m = '', p = []; try { const j = JSON.parse(b); id = j.id; m = j.method; p = j.params || []; } catch (_) {}
      let result = '0x';
      if (m === 'eth_blockNumber') result = hx(H);
      else if (m === 'eth_getBlockByNumber') { const num = Math.min(H, parseInt(p[0], 16) || H); result = { number: hx(num), hash: '0x' + 'ab'.repeat(32), timestamp: hx(tsB(num)) }; }
      else if (m === 'eth_getLogs') {
        const f = p[0] || {}, lo = parseInt(f.fromBlock, 16), hi = parseInt(f.toBlock, 16);
        const duJournal = Array.isArray(f.address) && f.address.map((x) => String(x).toLowerCase()).includes(ROLLS);
        if (duJournal) etat.logsJournal.push({ de: lo, a: hi });
        if (etat.profondeurMax && lo < H - etat.profondeurMax) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message: 'historical logs not available' } })); return; }
        result = duJournal ? LOGS.filter((l) => { const bn = parseInt(l.blockNumber, 16); return bn >= lo && bn <= hi; }) : [];
      } else if (m === 'eth_chainId') result = '0x2105';
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
    });
  });
}
const portLibre = () => new Promise((o) => { const s = http.createServer(); s.listen(0, '0.0.0.0', () => { const p = s.address().port; s.close(() => o(p)); }); });
/** one server run on volume `vol` (kept); waits for `attendre(j, fichier)` then `apres` ms more */
async function lancer({ vol, serveur = 'serveur-web.js', attendre, apres = 0, profondeurMax = 0 }) {
  const etat = { logsJournal: [], profondeurMax };
  const noeud = fauxNoeud(etat);
  await new Promise((o) => noeud.listen(0, '127.0.0.1', o));
  const urlNoeud = 'http://127.0.0.1:' + noeud.address().port;
  const port = await portLibre();
  const enfant = spawn(process.execPath, [path.join(ICI, serveur)], { cwd: ICI, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_OPTIONS: '', PORT: String(port), BASE_RPC: urlNoeud, BASE_RPC_LECTURE: urlNoeud, BASE_RPC_ARCHIVE: '', RAILWAY_VOLUME_MOUNT_PATH: vol, TB_NOS_CREATEURS: '', TB_REPLIS: '0',
      TB_JOURNAL_PREMIER_MS: '1000', TB_JOURNAL_TOUR_MS: '1000', TB_JOURNAL_GARDE: '', TB_JOURNAL_SAUVE_MS: '1000', TB_JOURNAL_PERSIST: '' } });
  let stderr = ''; enfant.stdout.on('data', () => {}); enfant.stderr.on('data', (c) => { stderr += c; });
  const srv = 'http://127.0.0.1:' + port;
  const lire = async () => { try { return await (await fetch(srv + '/api/jeu/journal', { signal: AbortSignal.timeout(5000) })).json(); } catch (_) { return null; } };
  const fichier = () => { try { return JSON.parse(fs.readFileSync(path.join(vol, 'journal-jeu.json'), 'utf8')); } catch (_) { return null; } };
  let demarre = false, j = null, atteint = false;
  try {
    for (let i = 0; i < 120 && !demarre; i += 1) { try { demarre = (await fetch(srv + '/sante', { signal: AbortSignal.timeout(2000) })).ok; } catch (_) { await dormir(500); } }
    if (demarre) {
      for (let i = 0; i < 120; i++) { j = await lire(); if (j && j.ok && attendre(j, fichier())) { atteint = true; break; } await dormir(500); }
      if (apres) { await dormir(apres); j = await lire(); }
    }
  } finally { enfant.kill(); noeud.close(); }
  return { demarre, atteint, j, fichier: fichier(), logsJournal: etat.logsJournal, stderr };
}
const couvert = (j) => j.couvertureDepuis === P && j.premierBlocDuJour === P;
const ids = (j) => (j && Array.isArray(j.evenements) ? j.evenements.filter((e) => e.kind !== 'practice').map((e) => e.id) : []);
const volAvec = (f) => { const v = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-journal-restore-')); if (f) fs.writeFileSync(path.join(v, 'journal-jeu.json'), JSON.stringify(f)); return v; };
const vols = [];
const vol = (f) => { const v = volAvec(f); vols.push(v); return v; };

/* run 1: fresh -> catch-up, file written at the covered state */
console.log('— run 1 (fresh volume)');
const r1 = await lancer({ vol: vol(null), attendre: (j, f) => couvert(j) && j.fenetresRattrapage >= 3 && ids(j).length === LOGS.length && f && f.bas === P && f.curseur === j.scanJusqua });
ok(r1.demarre && r1.atteint, 'run 1: covered, all ' + LOGS.length + ' events, file at the covered state (lu: ' + JSON.stringify(r1.j && { c: r1.j.couvertureDepuis, f: r1.j.fenetresRattrapage, n: ids(r1.j).length, file: r1.fichier && { bas: r1.fichier.bas, curseur: r1.fichier.curseur } }) + ') ' + r1.stderr.slice(0, 200));
ok(r1.j && r1.j.restaure === false && r1.j.restaureDe === null && r1.j.sauvegardesRefusees === 0, 'run 1: restaure false, restaureDe null, sauvegardesRefusees 0 (lu: ' + JSON.stringify(r1.j && [r1.j.restaure, r1.j.restaureDe, r1.j.sauvegardesRefusees]) + ')');
const F1 = r1.fichier;
ok(F1 && F1.v === 1 && F1.chainId === 8453 && F1.jour === jourDe(Date.now()).id && Array.isArray(F1.evenements) && F1.evenements.length === LOGS.length
  && Array.isArray(F1.cibles) && Array.isArray(F1.devisesListees) && Array.isArray(F1.jetons) && F1.contrats && F1.contrats.rolls === ROLLS, 'run 1: the file has the v1 shape (v, chainId, jour, contrats, evenements, maps as entries)');
const ids1 = ids(r1.j).sort();

if (F1) {
  const LAG = 3000;
  const f2 = { ...F1, curseur: F1.curseur - LAG, rattrapage: { de: P, a: P + 10, pourquoi: '429 too many requests', refus: 4 }, refusRattrapage: 4, rattrapageApres: Date.now() + 1e9 };
  const verifierRun2 = (r) => {
    const f = [];
    const v = (c, m) => { if (!c) f.push(m); };
    v(r.demarre && r.atteint, 'run 2 did not reach the restored head (lu: ' + JSON.stringify(r.j && { s: r.j.scanJusqua, r: r.j.restaure }) + ')');
    v(r.j && r.j.restaure === true && r.j.restaureDe === f2.curseur, 'restaure true and restaureDe = the file cursor (lu: ' + JSON.stringify(r.j && [r.j.restaure, r.j.restaureDe]) + ')');
    v(r.j && r.j.fenetresRattrapage === 0, 'no catch-up window after a restore (lu: ' + (r.j && r.j.fenetresRattrapage) + ')');
    const profondes = r.logsJournal.filter((x) => x.a < f2.curseur);
    v(profondes.length === 0 && r.logsJournal.length >= 1, 'no journal eth_getLogs below restaureDe (' + r.logsJournal.length + ' read, ' + profondes.length + ' below: ' + JSON.stringify(profondes.slice(0, 3)) + ')');
    const i2 = ids(r.j);
    v(i2.length === ids1.length && new Set(i2).size === i2.length && JSON.stringify([...i2].sort()) === JSON.stringify(ids1), 'same events as run 1, no duplicate (tx, logIndex) (run 1: ' + ids1.length + ', run 2: ' + i2.length + ')');
    v(r.j && r.j.rattrapage === null, 'an old refusal is never shown as current (lu: ' + JSON.stringify(r.j && r.j.rattrapage) + ')');
    v(r.j && couvert(r.j), 'still covers the day from the restored low bound');
    return f;
  };
  const opts2 = () => ({ vol: vol(f2), attendre: (j) => j.scanJusqua >= F1.curseur, apres: 2500 });
  console.log('— run 2 (restore, cursor ' + LAG + ' blocks back, an old refusal planted)');
  const f2r = verifierRun2(await lancer(opts2()));
  ok(f2r.length === 0, 'run 2: ' + (f2r.join(' ; ') || 'restored'));

  const hier = jourDe(Date.now() - 86400000).id;
  const verifierRun3 = (r) => {
    const f = [];
    if (!(r.demarre && r.atteint)) f.push('run 3 not covered (lu: ' + JSON.stringify(r.j && [r.j.restaure, r.j.fenetresRattrapage]) + ')');
    if (!(r.j && r.j.restaure === false && r.j.fenetresRattrapage >= 3)) f.push('yesterday file must be discarded: restaure false and a normal catch-up (lu: ' + JSON.stringify(r.j && [r.j.restaure, r.j.fenetresRattrapage]) + ')');
    return f;
  };
  const opts3 = () => ({ vol: vol({ ...F1, jour: hier }), attendre: (j) => couvert(j) && j.fenetresRattrapage >= 3 && j.restaure === false, apres: 0 });
  console.log('— run 3 (file dated ' + hier + ')');
  const f3r = verifierRun3(await lancer(opts3()));
  ok(f3r.length === 0, 'run 3: ' + (f3r.join(' ; ') || 'discarded, normal catch-up'));

  console.log('— run 4 (file cursor beyond the head)');
  const r4 = await lancer({ vol: vol({ ...F1, curseur: H + 10 }), attendre: (j) => couvert(j) && j.fenetresRattrapage >= 3 });
  ok(r4.demarre && r4.atteint && r4.j.restaure === false && r4.j.scanJusqua <= H, 'run 4: cursor beyond the head -> discarded (lu: ' + JSON.stringify(r4.j && [r4.j.restaure, r4.j.scanJusqua, r4.j.fenetresRattrapage]) + ')');

  console.log('— run 5 (node refuses logs deeper than 10 000 blocks; file cursor 12 000 back)');
  const C5 = H - 12000;
  const recents = [3, 4, 5].map((k) => txh(k));
  const opts5 = () => ({ vol: vol({ ...F1, curseur: C5, bas: C5 + 1, evenements: [] }), profondeurMax: 10000,
    attendre: (j) => j.scanJusqua >= F1.curseur && ids(j).length >= recents.length, apres: 0 });
  const verifierRun5 = (r) => {
    const f = [];
    if (!(r.demarre && r.atteint)) f.push('run 5: the direct never reached the head (lu: ' + JSON.stringify(r.j && { s: r.j.scanJusqua, r: r.j.restaure, n: ids(r.j).length }) + ')');
    if (!(r.j && r.j.restaure === false)) f.push('run 5: a cursor deeper than the first direct window must not be restored (lu: ' + JSON.stringify(r.j && [r.j.restaure, r.j.restaureDe]) + ')');
    return f;
  };
  const f5r = verifierRun5(await lancer(opts5()));
  ok(f5r.length === 0, 'run 5: ' + (f5r.join(' ; ') || 'discarded, the direct reached the head'));

  /* mutants: copies of the server next to it (it imports its siblings), removed after */
  const srcS = fs.readFileSync(path.join(ICI, 'serveur-web.js'), 'utf8');
  const MUTANTS = [
    ['(a) chargerJournal returns early', 'function chargerJournal(tete, sur) {', 'function chargerJournal(tete, sur) { return false;', opts2, verifierRun2],
    ['(b) the day check removed', '  if (o.jour !== jourDe(Date.now()).id) return false;', '', opts3, verifierRun3],
    ['(c) the old refusal restored', 'rattrapage: null, refusRattrapage: 0, rattrapageApres: 0, restaure: true,',
      'rattrapage: o.rattrapage ?? null, refusRattrapage: o.refusRattrapage ?? 0, rattrapageApres: o.rattrapageApres ?? 0, restaure: true,', opts2, verifierRun2],
    ['(d) the depth check removed', '  if (!ent(sur) || o.curseur < sur - JOURNAL_RECENT_BLOCS) return false;', '', opts5, verifierRun5],
  ];
  let km = 0;
  for (const [nom, de, a, opts, verifier] of MUTANTS) {
    if (!srcS.includes(de)) { ok(false, 'mutant anchor missing: ' + nom); continue; }
    const nomCopie = 'serveur-web.mut-restore-' + process.pid + '-' + (++km) + '.js';
    fs.writeFileSync(path.join(ICI, nomCopie), srcS.replace(de, a));
    let rouge = false;
    try { const fm = verifier(await lancer({ ...opts(), serveur: nomCopie })); rouge = fm.length > 0; console.log('   mutant « ' + nom + ' » : ' + (fm[0] || 'GREEN')); }
    catch (e) { rouge = true; console.log('   mutant « ' + nom + ' » : threw ' + e.message); }
    finally { try { fs.rmSync(path.join(ICI, nomCopie), { force: true }); } catch (_) {} }
    ok(rouge, 'MUTANT SURVIVES: ' + nom);
  }
  ok(fs.readFileSync(path.join(ICI, 'serveur-web.js'), 'utf8') === srcS, 'the server on disk is intact after the mutants');
}
for (const v of vols) { try { fs.rmSync(v, { recursive: true, force: true }); } catch (_) {} }
console.log(n + ' assertions, ' + ko + ' KO');
console.log('NE PROUVE PAS : a real Railway volume or deploy; real mainnet logs.');
process.exitCode = ko ? 1 : 0;
