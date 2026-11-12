/* test-fil-coeurs-378-20261112.mjs — game378: the Live feed shows HEARTS, each giver checked on its transaction (tx.from), and llms.txt
 *   describes the live Skins route (TBLOCK payment router), not the retired direct mint.
 *
 * A  EXECUTED  coeurs-fil.js on the REAL receipt of the heart Grok's wallet gave on 2026-11-12 (test-fil-coeurs-378-recu.json, read on two
 *              nodes): the heart decoded from its own log is proven by its receipt and tx.from is that wallet; a failed tx, another liker,
 *              another emitter, another tx are refused; a missing receipt is "not read" and read again; the per-pass budget holds; the feed
 *              list keeps only Hearts, newest first, drops a disproved heart; the page event and the words never name an unchecked giver.
 * B  EXECUTED  app.html reconciliationFiltres() (extracted and run): one heart among the events -> "All" equals the sum, no "≠".
 * C  SOURCE    app.html: the ♥ Hearts chip in the Live filters, the module import, the row branch, the 60 s read of /api/coeurs merged in
 *              the finally of lireLive. serveur-web.js: /api/coeurs serves `fil` (coeursPourLeFil on EP_PACK.HEARTS), each index pass
 *              reads the receipts, coeurs-fil.js is served and imports only served modules.
 * D  EXECUTED  fil-live.js compteDePuce: a missed hearts read makes the Hearts chip « ? » and leaves Sent alone; a refused swap read
 *              leaves the Hearts chip read.
 * E  SOURCE    llms.txt: approve(router, price) then pay(...) on the router; no mint(address,uint64).
 * F  MUTANTS   each turns its clause red.
 * Usage: node test-fil-coeurs-378-20261112.mjs [tree dir]   (default: this file's dir). Counts itself and prints n/n. */
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = process.argv[2] || dirname(fileURLToPath(import.meta.url));
const MOI = dirname(fileURLToPath(import.meta.url));
const lire = (f) => (existsSync(join(ICI, f)) ? readFileSync(join(ICI, f), 'utf8').replace(/\r\n/g, '\n') : ''); /* LF read: the clauses and mutants below carry newlines (test-tests-portables) */
let n = 0, ok = 0;
const vu = (c, m) => { n++; if (c) ok++; console.log((c ? '  ok   ' : '  FAIL ') + m); };

const { ADRESSES_PACK_ECONOMIE_V2: A } = await import(pathToFileURL(join(MOI, 'economie-v2-pack-deploye.js')).href);
/* the pack addresses are never retyped outside their record (test-noter-pack-economie-v2): the recording names them {pack.X},
 *   restored from economie-v2-pack-deploye.js; sha256Reel is the sha256 of the recorded body WITH the real addresses, so a record
 *   whose letter now names another address cannot replay these answers under it */
const AP = A;
const depuisPlace = (txt) => Object.entries(AP).reduce((s, [l, a]) => s.split('{pack.' + l + '}').join(String(a).slice(2).toLowerCase()), txt);
const empreinte = (o) => createHash('sha256').update(JSON.stringify(o)).digest('hex');
const RECU_BRUT = JSON.parse(depuisPlace(readFileSync(join(MOI, 'test-fil-coeurs-378-recu.json'), 'utf8')));
const FIX = RECU_BRUT.recu;
vu(empreinte(FIX) === RECU_BRUT.sha256Reel, 'the receipt restored with the pack record is the one read on chain (sha256Reel)');
const C0 = await import(pathToFileURL(join(MOI, 'coeurs.js')).href);
const L = A.L;
const GROK = String(FIX.from).toLowerCase();
const heart = { ...C0.decoderLiked(FIX.logs[0], L), contrat: L };

/* ── A ── */
let F = null;
try { F = existsSync(join(ICI, 'coeurs-fil.js')) ? await import(pathToFileURL(join(ICI, 'coeurs-fil.js')).href) : null; } catch (_) { F = null; }
const clauseA = (M) => {
  const r = [];
  if (!M) return [false];
  r.push(M.TOPIC_LIKED === C0.TOPIC_LIKED);
  const s = M.signataireDuRecu(FIX, heart);
  r.push(!!s && s.from === GROK && heart.liker === GROK);
  r.push(!!(M.signataireDuRecu({ ...FIX, status: '0x0' }, heart) || {}).refus);
  const autreLiker = { ...FIX, logs: [{ ...FIX.logs[0], topics: [...FIX.logs[0].topics.slice(0, 3), '0x' + '0'.repeat(24) + 'ab'.repeat(20)] }] };
  r.push(!!(M.signataireDuRecu(autreLiker, heart) || {}).refus);
  const autreEmetteur = { ...FIX, logs: [{ ...FIX.logs[0], address: '0x' + 'cd'.repeat(20) }] };
  r.push(!!(M.signataireDuRecu(autreEmetteur, heart) || {}).refus);
  r.push(!!(M.signataireDuRecu({ ...FIX, transactionHash: '0x' + 'ef'.repeat(32) }, heart) || {}).refus);
  r.push(M.signataireDuRecu(null, heart) === null);
  return r;
};
const rA = clauseA(F);
vu(rA.length > 1 && rA[0], 'A the module topic equals coeurs.js TOPIC_LIKED');
vu(rA.length > 1 && rA[1], 'A the real receipt proves the heart and tx.from = ' + GROK);
vu(rA.length > 1 && rA[2] && rA[3] && rA[4] && rA[5], 'A failed tx / another liker / another emitter / another tx are refused');
vu(rA.length > 1 && rA[6], 'A no receipt = not read (null), never a verdict');

if (F) {
  /* the budget and the retry: 3 hearts in 3 txs, budget 2, the first call fails */
  const h2 = { ...heart, tx: '0x' + '11'.repeat(32), index: 1, blockNumber: heart.blockNumber + 1 };
  const h3 = { ...heart, tx: '0x' + '22'.repeat(32), index: 2, blockNumber: heart.blockNumber + 2 };
  let appels = 0, panne = true;
  const rpc = async (m, [tx]) => { appels++; if (m !== 'eth_getTransactionReceipt') throw new Error('only receipts'); if (tx === heart.tx) { if (panne) { panne = false; throw new Error('429'); } return FIX; } return null; };
  const S = F.creerSignataires({ rpc, parPasse: 2 });
  const tous = F.derniersCoeurs([heart, h2, h3]);
  vu(tous[0] === h3 && tous[2] === heart, 'A derniersCoeurs: newest first');
  await S.resoudre([heart, h2, h3]);
  vu(appels === 2 && S.de(heart) === null, 'A pass 1: budget 2 receipts, the refused read is NOT kept as a verdict');
  await S.resoudre([heart]);
  vu(S.de(heart) && S.de(heart).from === GROK, 'A pass 2: the same heart is read again and proven');
  const avant = appels; await S.resoudre([heart]);
  vu(appels === avant, 'A a verdict read is kept: no third read of the same receipt');
  const autreContrat = { ...h2, contrat: '0x' + '77'.repeat(20) };
  const refuse = { ...h3 };
  const de = (c) => (c === heart ? { from: GROK } : c === refuse ? { refus: 'x' } : null);
  const fil = F.coeursPourLeFil([heart, autreContrat, refuse], de, { contrat: L });
  vu(fil.length === 1 && fil[0].signePar === GROK && fil[0].burned === String(heart.burned) && fil[0].bloc === heart.bloc,
    'A feed list: Hearts only, a disproved heart left out, signer and burned carried');
  const e = F.evenementCoeur(fil[0], () => 'DacityCoin');
  vu(!!e && e.type === 'COEUR' && e.jeton === heart.bloc && e.bloc === heart.blockNumber && e.logIndex === heart.index && e.sym === 'DacityCoin', 'A page event: block, chain block, log index, symbol');
  const w = F.quiDuCoeur(e);
  vu(w.qui === GROK && w.via === null && w.n === '1 heart', 'A words: the checked giver, 1 heart');
  const sans = F.quiDuCoeur(F.evenementCoeur({ ...fil[0], signePar: null }));
  vu(sans.qui === null, 'A words: an unchecked heart names no wallet');
  const via = F.quiDuCoeur(F.evenementCoeur({ ...fil[0], signePar: '0x' + '99'.repeat(20) }));
  vu(via.qui === GROK && via.via === '0x' + '99'.repeat(20), 'A words: a signer other than the liker is said as well');
  vu(F.tblockTexte(String(heart.burned)) === '92996.006843756668224507', 'A 92,996.0068… TBLOCK burned, exact');
  const srvOk = F.coeursDuServeur({ ok: true, complet: true, trou: null, fil }), srvPart = F.coeursDuServeur({ ok: true, complet: false, fil }), srvKo = F.coeursDuServeur(null);
  vu(srvOk.etat === 'LU' && srvOk.evenements.length === 1 && srvPart.etat === 'PARTIEL' && srvKo.etat === 'NON_LU' && srvKo.evenements.length === 0, 'A server answer: read / partial / not read');
} else { for (let i = 0; i < 11; i++) vu(false, 'A coeurs-fil.js is missing'); }

/* ── B ── reconciliationFiltres extracted from app.html and run */
const APP = lire('app.html');
/* the end of a top-level function: a `}` alone on its line, LF or CRLF (test-tests-portables) */
const fonction = (src, nom) => { const i = src.indexOf('function ' + nom + '('); if (i < 0) return ''; const re = /\r?\n\}\r?\n/g; re.lastIndex = i; const m = re.exec(src); return m ? src.slice(i, m.index + m[0].indexOf('}') + 1) : ''; };
const clauseB = (src) => {
  const code = fonction(src, 'comptesParType') + '\n' + fonction(src, 'reconciliationFiltres');
  if (!code.includes('reconciliationFiltres')) return false;
  try {
    const run = new Function('liveEvts', code + '\nreturn reconciliationFiltres();');
    const t = run([{ type: 'ACHAT' }, { type: 'GM' }, { type: 'COEUR' }]);
    return !t.includes('≠') && t.includes('3 = ') && t.includes('hearts 1');
  } catch (_) { return false; }
};
vu(clauseB(APP), 'B app.html reconciliationFiltres: a heart is counted ("3 = … hearts 1"), no "≠"');

/* ── C ── sources */
const filtres = (src) => { const i = src.indexOf('id="sfLiveFiltres"'); return i < 0 ? '' : src.slice(i, src.indexOf('</div>', i)); };
const clauseC1 = (src) => /<button type="button" class="puce" data-filtre="COEUR"[^>]*>♥ Hearts<\/button>/.test(filtres(src));
const clauseC2 = (src) => /^import \{ coeursDuServeur, quiDuCoeur, tblockTexte as coeurTblockTexte \} from '\.\/coeurs-fil\.js';/m.test(src)
  && src.includes("const FILTRES_PARTITION = ['CREATION', 'ACHAT', 'VENTE', 'SWAP', 'GM', 'MESSAGE', 'COEUR'];")
  && /: e\.type === 'COEUR' \? \(\(\) => \{ const w = quiDuCoeur\(e\)/.test(src) && src.includes("' · giver not checked yet'")
  && src.includes('const COEURS_LIVE_MS = 60000;') && /fetch\('\/api\/coeurs', \{ cache: 'no-store'/.test(src)
  && /  \} finally \{\n[^\n]*\n    if \(pCoeurs\) \{\n      try \{ fusionnerCoeursLive\(await pCoeurs\);/.test(src);
vu(clauseC1(APP), 'C app.html: the ♥ Hearts chip sits in the Live filters');
vu(clauseC2(APP), 'C app.html: import, partition, row branch (no giver until checked), /api/coeurs read once a minute, merged in finally');
const SRV = lire('serveur-web.js');
const clauseC3 = (src) => /fil: COEURS\.signataires && EP_PACK\.HEARTS \? coeursPourLeFil\(tous, COEURS\.signataires\.de, \{ contrat: EP_PACK\.HEARTS \}\) : \[\],/.test(src)
  && /COEURS\.index\.avancer = async \(\) => \{ const e = await avancerIndexCoeurs\(\); try \{ await COEURS\.signataires\.resoudre\(derniersCoeurs\(/.test(src)
  && /setInterval\(\(\) => \{ void COEURS\.index\.avancer\(\); \}, 60000\)/.test(src)
  && src.includes("'coeurs-fil.js', ") && src.includes("'keccak.js'");
vu(clauseC3(SRV), 'C serveur-web.js: /api/coeurs serves fil from Hearts, each pass reads receipts, coeurs-fil.js served');
const FIL_SRC = lire('coeurs-fil.js');
const imports = [...FIL_SRC.matchAll(/^import .* from '\.\/([^']+)';$/gm)].map((m) => m[1]);
vu(imports.length === 1 && imports[0] === 'keccak.js' && !/\bfetch\(/.test(FIL_SRC) && !/eth_send|sendTransaction|personal_sign|eth_sign/.test(FIL_SRC),
  'C coeurs-fil.js imports only keccak.js (served), fetches nothing, signs nothing');

/* ── D ── compteDePuce */
let FL = null;
try { FL = existsSync(join(ICI, 'fil-live.js')) ? await import(pathToFileURL(join(ICI, 'fil-live.js')).href + '?d') : null; } catch (_) { FL = null; }
const clauseD = (M) => !!M && M.compteDePuce(1, 'COEUR', new Map([['coeurs', 1]])).texte === '≥1' && M.compteDePuce(0, 'COEUR', new Map([['coeurs', 1]])).texte === '?'
  && M.compteDePuce(5, 'GM', new Map([['coeurs', 1]])).etat === 'LU' && M.compteDePuce(1, 'COEUR', new Map([['swaps', 2]])).etat === 'LU';
vu(clauseD(FL), 'D Hearts chip: its own miss -> « ? »/« ≥1 », Sent untouched; a refused swap read leaves Hearts read');

/* ── E ── llms.txt */
const LL = lire('llms.txt');
const clauseE = (t) => t.includes('approve(router, price)') && t.includes('pay(address,uint256,uint256,uint256,bytes)') && !t.includes('mint(address,uint64)') && t.includes('no direct mint');
vu(clauseE(LL), 'E llms.txt: approve(router, price) then pay(...) on the router, no direct mint');

/* ── F ── mutants */
if (F) {
  const dir = mkdtempSync(join(tmpdir(), 'fc378-'));
  const mut = FIL_SRC.replace("from './keccak.js'", "from '" + pathToFileURL(join(MOI, 'keccak.js')).href + "'").replace(' || mot(t[3]) !== coeur.liker', '');
  writeFileSync(join(dir, 'm.mjs'), mut);
  const M = await import(pathToFileURL(join(dir, 'm.mjs')).href);
  const r = clauseA(M);
  vu(mut !== FIL_SRC && !(r[2] && r[3] && r[4] && r[5]), 'F mutant: the liker check removed -> A goes red');
  const mut2 = FIL_SRC.replace("from './keccak.js'", "from '" + pathToFileURL(join(MOI, 'keccak.js')).href + "'").replace("if (!e.signePar) return { qui: null, via: null, n };", '');
  writeFileSync(join(dir, 'm2.mjs'), mut2);
  const M2 = await import(pathToFileURL(join(dir, 'm2.mjs')).href);
  vu(mut2 !== FIL_SRC && M2.quiDuCoeur(M2.evenementCoeur({ tx: heart.tx, index: 1, blockNumber: 1, bloc: heart.bloc, liker: GROK, likes: '1', burned: '1', signePar: null })).qui !== null,
    'F mutant: an unchecked heart named with its liker -> the words would attribute it (caught)');
} else { vu(false, 'F mutants need coeurs-fil.js'); vu(false, 'F mutants need coeurs-fil.js'); }
const mB = APP.replace("'MESSAGE', 'COEUR']);", "'MESSAGE']);");
vu(mB !== APP && !clauseB(mB), 'F mutant: COEUR dropped from the known types -> B goes red');
const mC = APP.replace('data-filtre="COEUR"', 'data-filtre="COEURS"');
vu(mC !== APP && !clauseC1(mC), 'F mutant: chip renamed -> C goes red');
const mS = SRV.replace('fil: COEURS.signataires', 'filX: COEURS.signataires');
vu(mS !== SRV && !clauseC3(mS), 'F mutant: fil dropped from /api/coeurs -> C goes red');
if (FL) {
  const dir = mkdtempSync(join(tmpdir(), 'fl378-'));
  const src = lire('fil-live.js').replace("  COEUR: ['coeurs'],\n", '');
  writeFileSync(join(dir, 'fl.mjs'), src.replace(/from '\.\/([^']+)'/g, (_, f) => "from '" + pathToFileURL(join(ICI, f)).href + "'"));
  let M = null; try { M = await import(pathToFileURL(join(dir, 'fl.mjs')).href); } catch (_) { M = null; }
  vu(!!M && !clauseD(M), 'F mutant: the COEUR read mapping removed -> D goes red');
} else vu(false, 'F fil-live mutant needs fil-live.js');
const mL = LL.replace('pay(address,uint256,uint256,uint256,bytes)', 'mint(address,uint64)');
vu(mL !== LL && !clauseE(mL), 'F mutant: the retired mint back in llms.txt -> E goes red');

console.log(ok + '/' + n + (ok === n ? ' — green' : ' — RED'));
process.exit(ok === n ? 0 : 1);
