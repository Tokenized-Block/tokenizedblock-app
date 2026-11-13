/* test-journal-relist-20261023.mjs — LES TROIS DEFAUTS DU 2e VERDICT ADVERSE DU 2026-10-23 SUR LE JOURNAL DU JOUR (claude/journal-20261018b).
 *
 * DEFAUT 1 (CONFIRME, repro scratchpad/repro-relist.mjs) : completerJournal remplissait un Bid sans devise avec la devise ACTUELLE du skin,
 *   pas celle du Listed EN VIGUEUR au bloc du Bid. BlockSkins.sol permet de relister (delete listingOf apres Unlisted / Sold), en ETH ou en
 *   USDC : listing #1 USDC au bloc 100 (sous la fenetre du direct), Bid 2,5 USDC au bloc 900, relisting ETH au bloc 950 -> le texte devenait
 *   « bid on skin #12 · 0.00 ETH » au lieu de « · 2.50 USDC ».
 * DEFAUT 2 : le rattrapage lit a REBOURS ; `journalEtat.devisesListees.set(k, v)` laissait un Listed PLUS VIEUX ecraser une devise plus
 *   recente -> les Bid suivants du direct etaient lus dans la mauvaise devise.
 * DEFAUT 3 : l endpoint sert au plus JOURNAL_MAX = 100 evenements ; avec 101..400 evenements du jour, coupes = 0 et couvreLaJournee = true
 *   alors que la reponse omet les plus anciens. Le drapeau doit dire ce qui est SERVI.
 *
 * AFFIRME :
 *   (R) module pur : la repro du verdict ne remplit plus le Bid avec la devise d un listing POSTERIEUR ; une fois le listing en vigueur
 *       lu (rattrapage), le texte est EXACTEMENT celui d une lecture dans l ordre ; un Listed plus vieux ajoute apres un plus recent ne
 *       l ecrase pas ; meme bloc -> l ordre des logIndex decide ; un historique tronque ne rend jamais une devise fausse.
 *   (B) vrai serveur local, faux noeud : Bid A (rattrapage, 2,5 USDC) dont le listing USDC est plus profond, relisting ETH + Bid B dans le
 *       direct, puis la tete avance et Bid C (ETH) arrive APRES le rattrapage -> A en USDC, B et C en ETH. 120 evenements du jour ->
 *       100 servis, coupes 20, couvreLaJournee false ; 100 evenements -> coupes 0, couvreLaJournee true.
 *   (M) un mutant par correctif, sur COPIES (module copie hors du depot, serveur copie ici puis efface) : chacun DOIT rougir.
 * NE PROUVE PAS : de vrais logs mainnet de BlockSkins (aucun relisting reel lu), le rendu a l ecran, les jetons d action comme devise
 *   d enchere (la table du serveur ne connait que ETH et USDC).
 * ⛔ PORTABLE : process.exitCode, jamais process.exit ; aucune ancre de recherche avec un saut de ligne. */
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

const { BLOCKROLLS_DEPLOIEMENT } = await import(pathToFileURL(path.join(ICI, 'blockrolls-deploiement.js')).href);
const { BLOCKSKINS, DEVISES_SKIN } = await import(pathToFileURL(path.join(ICI, 'blockskins.js')).href);
const ROLLS = String(BLOCKROLLS_DEPLOIEMENT.adresse).toLowerCase(), SKINS = String(BLOCKSKINS).toLowerCase();
const ETH = '0x' + '0'.repeat(40), USDC = Object.keys(DEVISES_SKIN).find((k) => DEVISES_SKIN[k].sym === 'USDC');
const DEV = { [USDC]: { sym: 'USDC', dec: 6 }, [ETH]: { sym: 'ETH', dec: 18 } };
const W1 = '0x' + '12'.repeat(19) + 'ab', W2 = '0x' + '34'.repeat(20), W3 = '0x' + '78'.repeat(20), VENDEUR = '0x' + '56'.repeat(20);
const tA = (a) => '0x' + '0'.repeat(24) + a.slice(2);
const u = (x) => BigInt(x).toString(16).padStart(64, '0');
const hx = (k) => '0x' + k.toString(16), txh = (k) => '0x' + k.toString(16).padStart(64, '0');
const G = [1, 2, 3, 4, 5].map(u).join('');
const court = (w) => w.slice(0, 6) + '…' + w.slice(-4);
const mkListed = (M, sk, dev, b, k, li = 0) => ({ address: SKINS, topics: [M.T_LISTED, '0x' + u(sk), tA(VENDEUR)], data: '0x' + u(dev) + u(1000000) + u(1792900000), blockNumber: hx(b), logIndex: hx(li), transactionHash: txh(k) });
const mkBid = (M, sk, w, amt, b, k, li = 0) => ({ address: SKINS, topics: [M.T_BID, '0x' + u(sk), tA(w)], data: '0x' + u(amt) + u(1792900000), blockNumber: hx(b), logIndex: hx(li), transactionHash: txh(k) });
const mkRolled = (M, rid, w, cible, b, k) => ({ address: ROLLS, topics: [M.T_ROLLED, '0x' + u(rid), tA(w)], data: '0x' + G + u(cible) + u(0) + u(250000) + u(250000), blockNumber: hx(b), logIndex: '0x0', transactionHash: txh(k) });

/* ── R. module pur ── */
console.log('— R. module pur (listing en vigueur au bloc du Bid)');
async function serieR(M, nom) {
  const r = [];
  const v = (c, m) => { if (!c) r.push(nom + ' : ' + m); };
  const C = { rolls: ROLLS, skins: SKINS }, horo = (b) => 1792300000 + b;
  v(typeof M.ajouterListing === 'function' && typeof M.deviseEnVigueur === 'function', 'ajouterListing / deviseEnVigueur absentes');
  /* la fusion des associations comme la fait le serveur : ajouterListing si le module la donne, sinon l ancien `map.set(k, v)` de
   *  serveur-web.js (la base audite) — pour que la repro soit COMPORTEMENTALE sur la base, pas seulement « fonction absente » */
  const garder = (map, nouv) => { for (const [k, x] of nouv || []) { if (typeof M.ajouterListing === 'function') M.ajouterListing(map, k, x); else map.set(k, x); } return map; };
  const lire = (logs, dl) => M.lireEvenementsJeu(logs, C, { horodatage: horo, devisesListees: dl, devises: DEV });
  /* R1 : LA REPRO DU VERDICT. Le direct lit [Bid 2,5 USDC @900, relisting ETH @950] ; le listing #1 (USDC @100) est sous la fenetre. */
  const dl = new Map();
  const live = lire([mkBid(M, 12, W2, 2500000, 900, 4), mkListed(M, 12, ETH, 950, 5)], dl);
  garder(dl, live.devisesListees);
  const court12 = court(W2) + ' bid on skin #12';
  v(live.evenements.length === 1 && live.evenements[0].text === court12, 'R1 direct : le Bid lu avant tout listing connu est sans montant (lu : ' + (live.evenements[0] && live.evenements[0].text) + ')');
  const apresDirect = M.completerJournal(live.evenements, { cibles: new Map(), devisesListees: dl, devises: DEV });
  v(apresDirect[0] && apresDirect[0].text === court12 && apresDirect[0].devise === null,
    'R1 : le relisting ETH @950 (APRES le Bid @900) ne remplit PAS le Bid (lu : ' + (apresDirect[0] && apresDirect[0].text) + ')');
  /* R2 : le rattrapage lit le listing #1 (USDC @100) : le Bid prend la devise EN VIGUEUR a son bloc = la lecture dans l ordre */
  const rat = lire([mkListed(M, 12, USDC, 100, 3)], dl);
  garder(dl, rat.devisesListees);
  const fini = M.completerJournal(apresDirect, { cibles: new Map(), devisesListees: dl, devises: DEV });
  const ordre = lire([mkListed(M, 12, USDC, 100, 3), mkBid(M, 12, W2, 2500000, 900, 4), mkListed(M, 12, ETH, 950, 5)], new Map());
  v(ordre.evenements.length === 1 && ordre.evenements[0].text === court12 + ' · 2.50 USDC', 'R2 lecture dans l ordre : 2.50 USDC (lu : ' + (ordre.evenements[0] && ordre.evenements[0].text) + ')');
  v(fini[0] && ordre.evenements[0] && fini[0].text === ordre.evenements[0].text && fini[0].devise === USDC,
    'R2 : apres le rattrapage, le Bid = la lecture dans l ordre (' + (fini[0] && fini[0].text) + ')');
  /* R3 (defaut 2) : le Listed plus vieux, ajoute APRES le plus recent, ne l ecrase pas : un Bid posterieur au relisting reste en ETH */
  const bidC = lire([mkBid(M, 12, W3, 20000000000000000n, 1000, 6)], dl);
  v(bidC.evenements[0] && bidC.evenements[0].text === court(W3) + ' bid on skin #12 · 0.02 ETH',
    'R3 : un Bid @1000, apres le relisting ETH @950, lu APRES le rattrapage du listing USDC @100 -> 0.02 ETH (lu : ' + (bidC.evenements[0] && bidC.evenements[0].text) + ')');
  if (typeof M.deviseEnVigueur === 'function') {
    v(M.deviseEnVigueur(dl, '12', 1000, 0) === ETH && M.deviseEnVigueur(dl, '12', 900, 0) === USDC && M.deviseEnVigueur(dl, '12', 50, 0) === null,
      'R3 : deviseEnVigueur @1000 ETH, @900 USDC, @50 aucune');
    /* R4 : meme bloc, l ordre des logIndex decide ; un doublon (meme bloc, meme logIndex) n ajoute rien */
    const m4 = new Map();
    M.ajouterListing(m4, '7', { bloc: 500, logIndex: 3, devise: ETH });
    M.ajouterListing(m4, '7', { bloc: 500, logIndex: 3, devise: ETH });
    v(Array.isArray(m4.get('7')) && m4.get('7').length === 1, 'R4 : un doublon n ajoute rien (lu : ' + JSON.stringify(m4.get('7')) + ')');
    v(M.deviseEnVigueur(m4, '7', 500, 4) === ETH && M.deviseEnVigueur(m4, '7', 500, 3) === null && M.deviseEnVigueur(m4, '7', 500, 2) === null,
      'R4 : meme bloc -> seul un Bid de logIndex PLUS GRAND voit le listing');
    /* R5 : historique borne : les plus vieux partent ; un Bid dont le listing est parti -> null, jamais la devise d un autre listing */
    const m5 = new Map(), max = 3;
    for (let k = 0; k < 6; k++) M.ajouterListing(m5, '9', { bloc: 100 * (k + 1), logIndex: 0, devise: k % 2 ? ETH : USDC }, max);
    v(m5.get('9').length === max && m5.get('9')[0].bloc === 400, 'R5 : borne a ' + max + ', les plus vieux partent (lu : ' + JSON.stringify(m5.get('9').map((x) => x.bloc)) + ')');
    v(M.deviseEnVigueur(m5, '9', 250, 0) === null && M.deviseEnVigueur(m5, '9', 450, 0) === ETH, 'R5 : un Bid dont le listing est sorti de l historique -> aucune devise');
    /* R6 : une valeur de l ancienne forme (une devise seule, sans bloc) n est jamais utilisee */
    v(M.deviseEnVigueur(new Map([['12', USDC]]), '12', 900, 0) === null, 'R6 : une devise sans bloc n est pas « en vigueur »');
    /* R7 : le ctx du direct porte un listing POSTERIEUR ; le rattrapage lit un Bid plus vieux sans son listing -> sans montant */
    const r7 = lire([mkBid(M, 12, W1, 3000000, 300, 9)], new Map([['12', [{ bloc: 950, logIndex: 0, devise: ETH }]]]));
    v(r7.evenements[0] && r7.evenements[0].text === court(W1) + ' bid on skin #12', 'R7 : Bid @300 lu avec un listing connu @950 seulement -> sans montant (lu : ' + (r7.evenements[0] && r7.evenements[0].text) + ')');
  }
  return r;
}
let fautesR;
try { fautesR = await serieR(await import(pathToFileURL(path.join(ICI, 'journal-jeu.js')).href + '?v=r'), 'module'); } catch (e) { fautesR = ['module : la serie a leve ' + String((e && e.message) || e).slice(0, 160)]; }
ok(fautesR.length === 0, 'R : ' + (fautesR.join(' ; ') || 'listing en vigueur au bloc du Bid tenu'));
for (const x of fautesR) console.error('   ' + x);
const srcJ = fs.readFileSync(path.join(ICI, 'journal-jeu.js'), 'utf8');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-journal-relist-mut-'));
const versOriginaux = (s) => s.replace(/from '\.\/([^']+)'/g, (_, f) => "from '" + pathToFileURL(path.join(ICI, f)).href + "'");
const MUTANTS_R = [
  ['correctif 1 : la devise la plus RECENTE, quel que soit le bloc du Bid', 'if (!avantDe(x, bloc, logIndex)) continue;', ''],
  ['correctif 2 : un Listed lu remplace tout l historique du skin', 'const h = ancien.filter((y) => !(y.bloc === x.bloc && y.logIndex === x.logIndex)).concat([x])', 'const h = [x]'],
];
let k = 0;
for (const [nom, de, a] of MUTANTS_R) {
  const s = srcJ.replace(/\r\n/g, '\n');
  if (!s.includes(de)) { ok(false, 'ancre du mutant absente : ' + nom); continue; }
  const f = path.join(tmp, 'journal-jeu-r' + (++k) + '.js');
  fs.writeFileSync(f, versOriginaux(s.replace(de, a)));
  let rouge = false, vu = '';
  try { const fm = await serieR(await import(pathToFileURL(f).href), 'mutant'); rouge = fm.length > 0; vu = fm[0] || 'VERT'; } catch (e) { rouge = true; vu = 'leve ' + e.message; }
  console.log('   mutant module « ' + nom + ' » : ' + vu);
  ok(rouge, 'MUTANT MODULE SURVIVANT : ' + nom);
}
fs.rmSync(tmp, { recursive: true, force: true });
ok(fs.readFileSync(path.join(ICI, 'journal-jeu.js'), 'utf8') === srcJ, 'le module sur disque est intact apres les mutants');

/* ── B. vrai serveur, faux noeud : minuit ~14 000 blocs sous la tete ── */
console.log('— B. endpoint (serveur local, faux noeud)');
const M0 = await import(pathToFileURL(path.join(ICI, 'journal-jeu.js')).href + '?v=b');
const H = 3000000;
const nowS = Math.floor(Date.now() / 1000), minuitS = Math.floor(nowS / 86400) * 86400;
const sB = Math.max(nowS - minuitS, 30) / 14000;
const tsB = (b) => nowS - Math.floor((H - b) * sB);
let P = null;
for (let b = H - 20000; b <= H; b++) if (tsB(b) >= minuitS) { P = b; break; }
ok(Number.isSafeInteger(P) && H - P > 11000, 'faux noeud : minuit UTC au bloc ' + P + ' (' + (H - P) + ' sous la tete)');
/* le direct lit [H - 9 002, H - 3] au demarrage ; la 1re fenetre du rattrapage finit a H - 9 003 */
const B_A = H - 9100, B_L1 = P + 3;
function logsRelist(tete) {
  const out = [
    mkListed(M0, 12, USDC, B_L1, 701),                 /* listing #1, USDC : profond (3e fenetre du rattrapage) */
    mkBid(M0, 12, W2, 2500000, B_A, 702),              /* Bid A, 2,5 USDC : 1re fenetre du rattrapage, AVANT le relisting */
    mkListed(M0, 12, ETH, H - 200, 703),               /* relisting ETH : dans le direct */
    mkBid(M0, 12, W1, 10000000000000000n, H - 150, 704) /* Bid B, 0,01 ETH : dans le direct */
  ];
  if (tete > H) out.push(mkBid(M0, 12, W3, 20000000000000000n, H + 50, 705)); /* Bid C, 0,02 ETH : arrive APRES le rattrapage */
  return out;
}
const logsNombre = (nb) => () => Array.from({ length: nb }, (_, i) => mkRolled(M0, 900 + i, W2, H - 1990 + i, H - 2000 + i, 800 + i));
function fauxNoeud(etat) {
  return http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => { b += c; });
    req.on('end', () => {
      let id = 1, m = '', p = []; try { const j = JSON.parse(b); id = j.id; m = j.method; p = j.params || []; } catch (_) {}
      let result = '0x';
      if (m === 'eth_blockNumber') result = hx(etat.tete);
      else if (m === 'eth_getBlockByNumber') { const num = Math.min(etat.tete, parseInt(p[0], 16) || etat.tete); result = { number: hx(num), hash: '0x' + 'ab'.repeat(32), timestamp: hx(tsB(num)) }; }
      else if (m === 'eth_getLogs') {
        const f = p[0] || {}, lo = parseInt(f.fromBlock, 16), hi = parseInt(f.toBlock, 16);
        const duJournal = Array.isArray(f.address) && f.address.map((x) => String(x).toLowerCase()).includes(ROLLS);
        result = duJournal ? etat.logs(etat.tete).filter((l) => { const bn = parseInt(l.blockNumber, 16); return bn >= lo && bn <= hi; }) : [];
      } else if (m === 'eth_chainId') result = '0x2105';
      /* game390: on this fake chain the earlier skins contracts minted nothing before the next one went live (totalSupply read at a past
       *   block = 0), so a skin of the active contract keeps its token id as its app-wide number (blockskins.js nomPublicSkin) */
      else if (m === 'eth_call' && p[0] && String(p[0].data) === '0x18160ddd' && /^0x[0-9a-f]+$/i.test(String(p[1]))) result = '0x' + '0'.repeat(64);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
    });
  });
}
async function lancer({ logs, serveur = 'serveur-web.js', attendre, ensuite = null }) {
  const etat = { tete: H, logs };
  const noeud = fauxNoeud(etat);
  await new Promise((o) => noeud.listen(0, '127.0.0.1', o));
  const urlNoeud = 'http://127.0.0.1:' + noeud.address().port;
  const vol = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-journal-relist-'));
  const port = await new Promise((o) => { const s = http.createServer(); s.listen(0, '0.0.0.0', () => { const p = s.address().port; s.close(() => o(p)); }); });
  const enfant = spawn(process.execPath, [path.join(ICI, serveur)], { cwd: ICI, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_OPTIONS: '', PORT: String(port), BASE_RPC: urlNoeud, BASE_RPC_LECTURE: urlNoeud, BASE_RPC_ARCHIVE: '', RAILWAY_VOLUME_MOUNT_PATH: vol, TB_NOS_CREATEURS: '', TB_REPLIS: '0',
      TB_JOURNAL_PREMIER_MS: '1000', TB_JOURNAL_TOUR_MS: '1000', TB_JOURNAL_GARDE: '' } });
  let stderr = ''; enfant.stdout.on('data', () => {}); enfant.stderr.on('data', (c) => { stderr += c; });
  const srv = 'http://127.0.0.1:' + port;
  const lire = async () => { try { return await (await fetch(srv + '/api/jeu/journal', { signal: AbortSignal.timeout(5000) })).json(); } catch (_) { return null; } };
  let demarre = false;
  for (let i = 0; i < 120 && !demarre; i += 1) { try { demarre = (await fetch(srv + '/sante', { signal: AbortSignal.timeout(2000) })).ok; } catch (_) { await dormir(500); } }
  let j = null, apres = null;
  try {
    if (demarre) {
      for (let i = 0; i < 120; i++) { j = await lire(); if (j && j.ok && attendre(j)) break; await dormir(500); }
      if (ensuite && j) apres = await ensuite(j, lire, etat);
    }
  } finally {
    enfant.kill(); noeud.close();
    try { fs.rmSync(vol, { recursive: true, force: true }); } catch (_) {}
  }
  return { demarre, j, apres, stderr };
}
const couvert = (j) => j.couvertureDepuis === P && j.premierBlocDuJour === P;
const texteTx = (j, kx) => { const e = j && Array.isArray(j.evenements) ? j.evenements.find((x) => x.tx === txh(kx)) : null; return e ? e.text : null; };
const ATT_A = court(W2) + ' bid on skin #12 · 2.50 USDC', ATT_B = court(W1) + ' bid on skin #12 · 0.01 ETH', ATT_C = court(W3) + ' bid on skin #12 · 0.02 ETH';
/* B1 : relisting. Couvert -> la tete avance de 100 blocs -> Bid C lu par le direct APRES le rattrapage du listing USDC */
/* 09/11 : the server reads up to tete - margeBlocsRolls() = ceil(ROLLS_MARGE_S / sB) blocks. sB comes from the time of day (midnight sits
 *  14 000 blocks down), so between ~00:12 and ~00:28 UTC that margin passed 50 blocks and a fixed +100 head left Bid C (H + 50) unread:
 *  red at 00:20 UTC, green at 05:00 (repro with a shifted clock). The head now moves past Bid C by the margin the server will use. */
const margeS = Number((fs.readFileSync(path.join(ICI, 'serveur-web.js'), 'utf8').match(/const ROLLS_MARGE_S = (\d+(?:\.\d+)?);/) || [])[1]);
ok(Number.isFinite(margeS) && margeS > 0, 'ROLLS_MARGE_S read from serveur-web.js (' + margeS + ' s)');
const { blocsPour } = await import(pathToFileURL(path.join(ICI, 'temps-de-bloc.js')).href);
const margeServeur = Math.max(3, blocsPour(margeS, sB) ?? 3);
const AVANCE = Math.max(100, 50 + margeServeur + 20);
async function avancer(j0, lire, etat) {
  etat.tete = H + AVANCE;
  let j = j0;
  for (let i = 0; i < 40; i++) { j = await lire(); if (j && texteTx(j, 705) !== null) break; await dormir(500); }
  return j;
}
function verifierRelist(r) {
  if (!r.demarre) return ['serveur non demarre — ' + r.stderr.slice(0, 200)];
  const f = [], j0 = r.j, j = r.apres;
  if (!j0 || !couvert(j0)) return ['couverture jamais atteinte (' + JSON.stringify(j0 && { d: j0.couvertureDepuis, p: j0.premierBlocDuJour, r: j0.rattrapage }) + ')'];
  if (texteTx(j0, 702) !== ATT_A) f.push('Bid A (rattrapage, avant le relisting) : ' + JSON.stringify(texteTx(j0, 702)) + ' attendu ' + JSON.stringify(ATT_A));
  if (texteTx(j0, 704) !== ATT_B) f.push('Bid B (direct) : ' + JSON.stringify(texteTx(j0, 704)) + ' attendu ' + JSON.stringify(ATT_B));
  if (!j || texteTx(j, 705) !== ATT_C) f.push('Bid C (direct, APRES le rattrapage) : ' + JSON.stringify(j && texteTx(j, 705)) + ' attendu ' + JSON.stringify(ATT_C));
  if (j && texteTx(j, 702) !== ATT_A) f.push('Bid A apres l avance de la tete : ' + JSON.stringify(texteTx(j, 702)));
  return f;
}
const b1 = await lancer({ logs: logsRelist, attendre: (j) => couvert(j) && j.fenetresRattrapage >= 3 && texteTx(j, 702) !== null, ensuite: avancer });
const f1 = verifierRelist(b1);
console.log('   B1 A=' + JSON.stringify(texteTx(b1.j, 702)) + ' B=' + JSON.stringify(texteTx(b1.j, 704)) + ' C=' + JSON.stringify(texteTx(b1.apres, 705)));
ok(f1.length === 0, 'B1 (relisting) : ' + (f1.join(' ; ') || 'A en USDC, B et C en ETH'));
/* B2 / B3 : ce qui est SERVI. 120 evenements du jour (garde 400, envoi 100) puis 100 (temoin : pas de coupe inventee) */
function verifierServi(r, nb) {
  if (!r.demarre) return ['serveur non demarre — ' + r.stderr.slice(0, 200)];
  const j = r.j, f = [];
  if (!j || !couvert(j)) return ['couverture jamais atteinte (' + JSON.stringify(j && { d: j.couvertureDepuis, p: j.premierBlocDuJour }) + ')'];
  const servis = j.evenements.length, attendu = Math.max(0, nb - M0.JOURNAL_MAX);
  if (servis !== Math.min(nb, M0.JOURNAL_MAX)) f.push(nb + ' evenements du jour : ' + Math.min(nb, M0.JOURNAL_MAX) + ' servis attendus (lu : ' + servis + ')');
  if (j.coupes !== attendu) f.push(nb + ' evenements, ' + servis + ' servis : coupes = ' + attendu + ' attendu (lu : ' + j.coupes + ')');
  if (j.couvreLaJournee !== (attendu === 0)) f.push(nb + ' evenements, ' + servis + ' servis : couvreLaJournee = ' + (attendu === 0) + ' attendu (lu : ' + j.couvreLaJournee + ')');
  return f;
}
const attendreN = (nb) => (j) => couvert(j) && j.fenetresRattrapage >= 3 && Array.isArray(j.evenements) && j.evenements.length >= Math.min(nb, M0.JOURNAL_MAX);
const b2 = await lancer({ logs: logsNombre(120), attendre: attendreN(120) });
const f2 = verifierServi(b2, 120);
ok(f2.length === 0, 'B2 (120 evenements) : ' + (f2.join(' ; ') || '100 servis, coupes 20, couvreLaJournee false'));
const b3 = await lancer({ logs: logsNombre(100), attendre: attendreN(100) });
const f3 = verifierServi(b3, 100);
ok(f3.length === 0, 'B3 (100 evenements) : ' + (f3.join(' ; ') || '100 servis, coupes 0, couvreLaJournee true'));
console.log('   B2 servis=' + (b2.j && b2.j.evenements.length) + ' coupes=' + (b2.j && b2.j.coupes) + ' couvreLaJournee=' + (b2.j && b2.j.couvreLaJournee)
  + ' · B3 servis=' + (b3.j && b3.j.evenements.length) + ' coupes=' + (b3.j && b3.j.coupes) + ' couvreLaJournee=' + (b3.j && b3.j.couvreLaJournee));

/* ── M. mutants du SERVEUR (copies dans ce dossier, effacees apres) ── */
console.log('— M. mutants du serveur (copies)');
const srcS = fs.readFileSync(path.join(ICI, 'serveur-web.js'), 'utf8');
const MUTANTS_SRV = [
  ['correctif 2 : le serveur garde seulement le dernier Listed LU (l ancien `set`)', 'for (const [k, v] of r.devisesListees) ajouterListing(journalEtat.devisesListees, k, v);', 'for (const [k, v] of r.devisesListees) journalEtat.devisesListees.set(k, [v]);',
    { logs: logsRelist, attendre: (j) => couvert(j) && j.fenetresRattrapage >= 3 && texteTx(j, 702) !== null, ensuite: avancer }, verifierRelist],
  ['correctif 3 : la couverture ignore la coupe de l envoi', 'couvreLaJournee: memeJourJl && cvJl.couvreLaJournee === true && gJl.coupes === 0,', 'couvreLaJournee: memeJourJl && cvJl.couvreLaJournee === true,',
    { logs: logsNombre(120), attendre: attendreN(120) }, (r) => verifierServi(r, 120)],
];
let km = 0;
for (const [nom, de, a, opts, verifier] of MUTANTS_SRV) {
  if (!srcS.includes(de)) { ok(false, 'ancre du mutant serveur absente : ' + nom); continue; }
  const nomCopie = 'serveur-web.mut-relist-' + process.pid + '-' + (++km) + '.js';
  fs.writeFileSync(path.join(ICI, nomCopie), srcS.replace(de, a));
  let rouge = false;
  try { const fm = verifier(await lancer({ ...opts, serveur: nomCopie })); rouge = fm.length > 0; console.log('   mutant « ' + nom + ' » : ' + (fm[0] || 'VERT')); } catch (e) { rouge = true; console.log('   mutant « ' + nom + ' » : leve ' + e.message); }
  finally { try { fs.rmSync(path.join(ICI, nomCopie), { force: true }); } catch (_) {} }
  ok(rouge, 'MUTANT SERVEUR SURVIVANT : ' + nom);
}
ok(fs.readFileSync(path.join(ICI, 'serveur-web.js'), 'utf8') === srcS, 'le serveur sur disque est intact apres les mutants');

console.log(n + ' assertions, ' + ko + ' KO');
console.log('NE PROUVE PAS : de vrais logs mainnet de BlockSkins, le rendu a l ecran, les jetons d action comme devise d enchere.');
process.exitCode = ko ? 1 : 0;
