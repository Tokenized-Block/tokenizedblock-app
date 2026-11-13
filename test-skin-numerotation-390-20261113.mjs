// test-skin-numerotation-390-20261113.mjs — game390 (Phil, 2026-11-13: the app shows two DIFFERENT skins that both read "Skin #1 dresses
//   UNIT" — "Not listed" and "Not listed · held by 0x31e0…de3b". Skins live on several contracts and each one numbers its tokens from 1.
//   « fix la numérotation avec leur propre numérotation pour que ça soit plus simple »).
// The rule (the TAM fix of game378, tam-onglet.js nomPublicTam, for N contracts): ONE app-wide number per skin, in mint order. The
//   contracts oldest first (BLOCKSKINS_SUITE, from the records); N_i = totalSupply of contract i READ AT the creation block of contract
//   i+1; skin k of contract i = #(N_0 + … + N_(i-1) + k). A count not read, or a token of an older contract above its N: no number, the
//   skin is named by its contract and token id. Only the label changes: reads and calls keep the skin's own contract and tokenId.
// Measured on Base 2026-11-13 (eth_call totalSupply, mainnet.base.org + base-rpc.publicnode.com + base.drpc.org, the three agree; archive
//   witnessed: totalSupply of 0xc0d1…8e2f is 0 at its own creation block 52,470,279 and '0x' one block before, 1 at latest):
//   v1 0xea6c…e77d: 0 at v2's creation (52,470,279), 0 at latest ; v2 0xc0d1…8e2f: 1 at the pack Skins' creation (56,427,751), 1 latest ;
//   pack Skins S 0x1cf4…bde9: 0 at the 1 USDC Skins' creation (56,675,741), 0 latest ; 1 USDC Skins 0x8af3…d1d8: 1 latest (token 1:
//   SkinMinted at block 56,683,736, tx 0xbc6c8f27…d436, tx.from = 0x31e0…de3b). So counts = [0, 1, 0]: v2 token 1 = Skin #1 (held by
//   the fee wallet: "Not listed"), 1 USDC Skins token 1 = Skin #2 ("held by 0x31e0…de3b").
// What this test PROVES:
//   R. BLOCKSKINS_SUITE = the four contracts of the records, oldest first, each with its record's creation block (never typed here).
//   A. nomPublicSkin on that suite with the measured counts: #1 and #2 as above; the 1 USDC Skins token k = #(1+k); a pack Skins token
//      (above its N = 0) gets no number; counts not read / partial / a contract not in the suite / a bad id -> no number, named by contract
//      and token id; the tooltip detail names the contract and the token id.
//   B. lireSkins on a simulated chain (mock rpc that answers by block tag): each count is read at the NEXT contract's creation block (never
//      'latest'); every skin carries its app-wide name, all distinct; a '0x' answer is not read as 0; a failed count keeps the list LU and
//      names by contract; a READ count is kept (no second historical read), a failed one is not.
//   C. wiring: app.html (market list skmLigne, panel line bcLigneSkin, the auction room podium and its sentence, the wallet card titles),
//      brain-jeu.js, salle-encheres.js, journal-jeu.js and serveur-web.js show the app-wide name; no "'Skin #' +" / "'skin #' + <token id>"
//      left in them (journal-jeu keeps it only as the fallback without ctx.nomSkin); the list rows are keyed by contract + token id.
//   D. the game journal: with ctx.nomSkin the Minted / Bid / Sold lines say "skin #2" ; completerJournal keeps that name.
//   E. the auctioneer says the podium skin's app-wide name.
//   M. mutants, on mutated copies of the modules (imported) and of the sources: each turns its assertion red.
// What it does NOT prove: what a browser shows — checked in a real browser, separately.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { BLOCKSKINS_DEPLOIEMENT } from './blockskins-deploiement.js';
import { PACK_ECONOMIE_V2_DEPLOYE } from './economie-v2-pack-deploye.js';
import { SKINS_SPIN_DEPLOIEMENT } from './skins-spin-deploiement.js';

let n = 0, rouges = 0;
const vu = (c, m) => { if (c) { n++; console.log('  ok  ' + m); } else { rouges++; console.log('  RED ' + m); } };
const ICI = new URL('./', import.meta.url);
const lire = (f) => readFileSync(new URL('./' + f, ICI), 'utf8').replace(/\r\n/g, '\n');
const SRC = { bs: lire('blockskins.js'), app: lire('app.html'), brain: lire('brain-jeu.js'), salle: lire('salle-encheres.js'), journal: lire('journal-jeu.js'), srv: lire('serveur-web.js') };
const charger = async (f, tag) => import(new URL('./' + f + '?banc390' + tag + '=' + process.pid, ICI).href).catch((e) => ({ __erreur: e }));
const BS = await charger('blockskins.js', 'a');
vu(!BS.__erreur, 'blockskins.js loads' + (BS.__erreur ? ': ' + BS.__erreur.message : ''));

/* ── R. the suite from the records ── */
const bas = (x) => String(x || '').toLowerCase();
const V1 = BLOCKSKINS_DEPLOIEMENT.precedent.precedent, V2 = BLOCKSKINS_DEPLOIEMENT.precedent;
const S = PACK_ECONOMIE_V2_DEPLOYE.etapes.find((e) => e.lettre === 'S');
const UN = SKINS_SPIN_DEPLOIEMENT.etapes.find((e) => e.cle === 'skins');
const ATTENDU = [{ contrat: bas(V1.adresse), bloc: V1.blocDeploiement }, { contrat: bas(V2.adresse), bloc: V2.blocDeploiement }, { contrat: bas(S.adresse), bloc: S.bloc }, { contrat: bas(UN.adresse), bloc: UN.bloc }];
const SUITE = BS.BLOCKSKINS_SUITE;
vu(Array.isArray(SUITE) && JSON.stringify(SUITE) === JSON.stringify(ATTENDU) && ATTENDU.every((x) => /^0x[0-9a-f]{40}$/.test(x.contrat) && Number.isSafeInteger(x.bloc)),
  'R BLOCKSKINS_SUITE = v1, v2, the pack Skins, the 1 USDC Skins (oldest first), with their records\' creation blocks');
vu(Array.isArray(SUITE) && JSON.stringify(SUITE.map((x) => x.contrat)) === JSON.stringify(BS.BLOCKSKINS_LUS), 'R the suite is the list lireSkins reads, in the same order');
const [C1, C2, CS, CU] = ATTENDU.map((x) => x.contrat);
const MESURE = [0, 1, 0];

/* ── A. pure naming ── */
const casA = (nom) => {
  if (typeof nom !== 'function') return [false, false, false, false, false];
  const r = [];
  /* an explicit undefined is a count not read (not the default) */
  const t = (c, k, ...cpt) => nom(c, k, cpt.length ? cpt[0] : MESURE, ATTENDU);
  /* A1 Phil's two skins */
  r.push(t(C2, 1n).nom === 'Skin #1' && t(C2, 1n).numero === 1 && t(CU, 1n).nom === 'Skin #2' && t(CU, 1n).numero === 2 && t(CU, 1n).texte === 'skin #2');
  /* A2 the new contract keeps counting ; a token of an older contract above its N gets no number (pack S: N = 0 ; v2 token 2: N = 1) */
  r.push(t(CU, 5n).nom === 'Skin #6' && t(CS, 1n).numero === null && t(CS, 1n).nom === 'Skin token 1 of 0x1cf4…bde9' && t(C2, 2n).numero === null && t(C1, 1n).numero === null);
  /* A3 counts not read, partial, wrong shape: no number guessed */
  r.push([null, undefined, [], [0], [0, null, 0], [0, 1, NaN], [0, -1, 0], [0, 1.5, 0], ['0', 1, 0]].every((cp) => t(CU, 1n, cp).numero === null && t(CU, 1n, cp).nom === 'Skin token 1 of 0x8af3…d1d8')
    && t(C2, 1n, [0]).numero === null && t(C2, 1n, [0, 1]).numero === 1);
  /* A4 not a skins contract of the suite, a bad id: no number */
  r.push(t('0x' + '1'.repeat(40), 1n).numero === null && t(CU, 0n).numero === null && t(CU, 'x').numero === null && t(CU, -1n).numero === null && t(CU, '1').numero === 2 && t(CU, 1).numero === 2);
  /* A5 the tooltip names the contract and the on-chain token id */
  r.push(t(CU, 1n).detail === 'Token 1 on the skins contract 0x8af3…d1d8' && t(C2, 1n).detail === 'Token 1 on the skins contract 0xc0d1…8e2f');
  return r;
};
const [a1, a2, a3, a4, a5] = casA(BS.nomPublicSkin);
vu(a1, 'A measured data: v2 token 1 = Skin #1, 1 USDC Skins token 1 = Skin #2 (no two "Skin #1")');
vu(a2, 'A the newest contract keeps counting (token 5 = #6) ; an older contract\'s token above its N gets no number');
vu(a3, 'A counts not read / partial / malformed -> no number, named by contract and token id');
vu(a4, 'A a contract outside the suite or a bad token id -> no number');
vu(a5, 'A the tooltip detail names the contract and the token id');

/* ── B. lireSkins on a simulated chain ── */
const mot = (v) => BigInt(v).toString(16).padStart(64, '0');
const adrMot = (a) => a.slice(2).padStart(64, '0');
const DETENTEUR = { [C2]: '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4', [CU]: '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b' };
const UNIT = '0xb2000000000000000000007afa7ed748b0874f27';
const page = (c, depuis, combien, total) => {
  const ids = []; for (let k = depuis; k <= Math.min(total, depuis + combien - 1); k++) ids.push(k);
  return '0x' + mot(32) + mot(ids.length) + ids.map((k) => mot(k) + adrMot(DETENTEUR[c] || '0x' + '2'.repeat(40)) + adrMot(UNIT) + mot(0) + mot(0) + mot(0) + mot(0) + mot(0) + mot(0) + mot(0) + mot(0)).join('');
};
/* the chain: totalSupply at 'latest' and at a block (a contract created at B has no code below B: '0x') */
const chaine = ({ latest = { [C1]: 0, [C2]: 1, [CS]: 0, [CU]: 1 }, histo = null, panne = new Set() } = {}) => {
  const appels = [];
  const rpc = async (m, p) => {
    const to = bas(p[0].to), data = String(p[0].data), tag = p[1];
    appels.push({ to, data: data.slice(0, 10), tag });
    if (data === '0x18160ddd') {
      if (tag === 'latest') return '0x' + mot(latest[to]);
      if (panne.has(to)) throw new Error('missing trie node');
      const b = parseInt(tag, 16), cree = ATTENDU.find((x) => x.contrat === to).bloc;
      if (b < cree) return '0x';
      if (histo && histo[to] !== undefined) return histo[to];
      /* the real history: v2 minted its token 1 before the pack went live ; the 1 USDC Skins minted after its creation */
      const h = { [C1]: 0, [C2]: b >= 52500000 ? 1 : 0, [CS]: 0, [CU]: b >= 56683736 ? 1 : 0 };
      return '0x' + mot(h[to]);
    }
    if (data.startsWith('0x' + BS.appelPage(1, 1).slice(2, 10))) { const depuis = Number(BigInt('0x' + data.slice(10, 74))), combien = Number(BigInt('0x' + data.slice(74, 138))); return page(to, depuis, combien, latest[to]); }
    throw new Error('unexpected call ' + data.slice(0, 10));
  };
  return { rpc, appels };
};
const casB = async (M) => {
  if (!M || typeof M.lireSkins !== 'function') return [false, false, false, false, false];
  const r = [];
  /* B1 '0x' (no code at that block) is NOT a count: v2 answering '0x' at the pack's creation -> nothing after v2 is numbered */
  const z = chaine({ histo: { [C2]: '0x' } });
  const rz = await M.lireSkins({ rpc: z.rpc });
  const uz = rz.skins && rz.skins.find((s) => s.contrat === CU);
  r.push(rz.etat === 'LU' && !!uz && uz.numero === null && uz.nom === 'Skin token 1 of 0x8af3…d1d8' && new Set(rz.skins.map((s) => s.nom)).size === rz.skins.length);
  /* B2 a failed historical read: still LU, every skin named by contract + token id, all distinct */
  const f = chaine({ panne: new Set([C2]) });
  const rf = await M.lireSkins({ rpc: f.rpc });
  r.push(rf.etat === 'LU' && rf.skins.length === 2 && rf.skins.every((s) => s.numero === null || s.contrat === C2 && s.numero === null) && rf.skins.every((s) => /^Skin token 1 of 0x/.test(s.nom)) && new Set(rf.skins.map((s) => s.nom)).size === 2);
  /* B3 the real chain: counts read AT the next contract's creation block, never latest ; Phil's two skins are #1 and #2 */
  const c = chaine();
  const rc = await M.lireSkins({ rpc: c.rpc });
  /* every historical read of B1-B3 (the counts read once are kept, so each scenario asks only what is not read yet) */
  const histos = [...z.appels, ...f.appels, ...c.appels].filter((a) => a.data === '0x18160ddd' && a.tag !== 'latest');
  const attendus = [C1 + '@' + ATTENDU[1].bloc, C2 + '@' + ATTENDU[2].bloc, CS + '@' + ATTENDU[3].bloc];
  const v2 = rc.skins && rc.skins.find((s) => s.contrat === C2), un = rc.skins && rc.skins.find((s) => s.contrat === CU);
  r.push(rc.etat === 'LU' && JSON.stringify(rc.comptes) === JSON.stringify(MESURE) && !!v2 && v2.nom === 'Skin #1' && !!un && un.nom === 'Skin #2' && un.texte === 'skin #2'
    && String(un.tokenId) === '1' && un.contrat === CU && String(v2.tokenId) === '1' && v2.contrat === C2
    && histos.length > 0 && histos.every((a) => attendus.includes(a.to + '@' + parseInt(a.tag, 16))) && attendus.every((x) => histos.some((a) => a.to + '@' + parseInt(a.tag, 16) === x)));
  /* B4 a READ count is kept: the next read asks no historical block */
  const c2 = chaine();
  const rc2 = await M.lireSkins({ rpc: c2.rpc });
  r.push(rc2.etat === 'LU' && c2.appels.every((a) => a.tag === 'latest') && rc2.skins.find((s) => s.contrat === CU).nom === 'Skin #2');
  /* B5 the accessors: a skin read carries its name ; cleSkin tells two token 1 apart ; comptesSkinsLus has the counts read */
  r.push(typeof M.nomSkin === 'function' && M.nomSkin(un) === 'Skin #2' && M.texteSkin(v2) === 'skin #1' && M.detailSkin(un) === 'Token 1 on the skins contract 0x8af3…d1d8'
    && M.cleSkin(un) !== M.cleSkin(v2) && JSON.stringify(M.comptesSkinsLus()) === JSON.stringify(MESURE) && M.nomSkin({ contrat: CU, tokenId: 3n }) === 'Skin #4');
  return r;
};
const [b1, b2, b3, b4, b5] = await casB(BS);
vu(b1, 'B a \'0x\' answer (no code at that block) is not read as a count of 0');
vu(b2, 'B a count not read: the list stays LU, each skin named by its contract and token id, all distinct');
vu(b3, 'B the counts are read at the NEXT contract\'s creation block (never latest): v2 token 1 = Skin #1, 1 USDC token 1 = Skin #2, contract and tokenId kept');
vu(b4, 'B a read count is kept: the next lireSkins asks no historical block');
vu(b5, 'B nomSkin / texteSkin / detailSkin / cleSkin / comptesSkinsLus');

/* ── C. wiring in the sources ── */
const fonction = (s, nom) => { const i = s.indexOf('function ' + nom + '('); if (i < 0) return ''; const m = /\n\}\n/g; m.lastIndex = i; const r = m.exec(s); return s.slice(i, r ? r.index : undefined); };
const cC1 = (s) => { const h = fonction(s, 'skmLigne'); return /bcEl\('b', \{ text: nomSkin\(s\), title: detailSkin\(s\) \}\), document\.createTextNode\(' dresses ' \+ sym\)/.test(h) && /title: nomSkin\(s\)/.test(h) && !/'Skin #'/.test(h); };
vu(cC1(SRC.app), 'C market list (skmLigne): the app-wide name, its contract and token id in the tooltip');
const cC2 = (s) => /const nom = nomSkin\(s\) \+ ' · '/.test(fonction(s, 'bcLigneSkin'));
vu(cC2(SRC.app), 'C panel line (bcLigneSkin): the app-wide name');
const cC3 = (s) => { const h = fonction(s, 'peindreSalle'); return /bcEl\('b', \{ text: nomSkin\(p\), title: detailSkin\(p\) \}\)/.test(h) && /bid on ' \+ texteSkin\(p\) \+ ' of at least/.test(h) && /'Settling ' \+ texteSkin\(p\)/.test(h) && /const o = cleSkin\(p\)/.test(h); };
vu(cC3(SRC.app), 'C auction room: the podium name, the sentence of what the wallet signs, the gavel key');
const cC4 = (s) => { const h = fonction(s, 'bcActionMarche'); return /const laSkin = s \? texteSkin\(s\) : null;/.test(h) && /ACHETER: 'Buy ' \+ laSkin/.test(h) && /appelAcheter\(s\.tokenId, s\.devise, montant, K\)/.test(h); };
vu(cC4(SRC.app), 'C the wallet card titles name the skin ; the calls keep s.tokenId and its contract');
const cC5 = (s) => /ancien = skm\.lignes\.get\(k\)/.test(fonction(s, 'skmPeindreListe')) && /lignes\.set\(k, /.test(fonction(s, 'skmPeindreListe')) && /const id = cleSkin\(s\)/.test(fonction(s, 'salleLignes'));
vu(cC5(SRC.app), 'C the list rows are kept by contract + token id (two contracts both have a token 1)');
const sansBrut = (s) => !/'Skin #' \+|'skin #' \+ (id|p\.tokenId|s\.tokenId|ps\.skin\.tokenId|sk|e\.skin)\b/i.test(s);
vu([SRC.app, SRC.brain, SRC.salle].every(sansBrut), 'C no "\'Skin #\' + <token id>" left in app.html, brain-jeu.js, salle-encheres.js');
const cC7 = (s) => /'The auction of ' \+ texteSkin\(ps\.skin\)/.test(s) && /'Buy ' \+ texteSkin\(ps\.skin\) \+ ' for '/.test(s) && /'Bid the minimum on ' \+ texteSkin\(ps\.skin\)/.test(s);
vu(cC7(SRC.brain), 'C brain-jeu.js proposals name the skin');
const cC8 = (s) => /' minted ' \+ nomSk\(sk\)/.test(s) && /' bid on ' \+ nomSk\(sk\)/.test(s) && /' bought ' \+ nomSk\(sk\)/.test(s) && (s.match(/'skin #' \+/g) || []).length === 2;
vu(cC8(SRC.journal), 'C journal-jeu.js: Minted / Bid / Sold say nomSk ; the token id only as the fallback without ctx.nomSkin');
const cC9 = (s) => /nomSkin: \(contrat, sk\) => nomPublicSkinSrv\(contrat, sk, comptesSkinsLusSrv\(\)\)\.texte/.test(s) && /await lireComptesSkinsSrv\(\{ rpc: rpcServeur \}\)/.test(s);
vu(cC9(SRC.srv), 'C serveur-web.js: the journal reads the counts, then names each skin with nomPublicSkin');

/* ── D. the game journal ── */
const J = await charger('journal-jeu.js', 'j');
const casD = (M) => {
  if (!M || typeof M.lireEvenementsJeu !== 'function') return [false, false];
  const t32 = (a) => '0x' + adrMot(a);
  const W = '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b', W2 = '0x' + '34'.repeat(20);
  const log = (topics, data, b, i) => ({ address: CU, topics, data, blockNumber: '0x' + b.toString(16), logIndex: '0x' + i.toString(16), transactionHash: '0x' + String(b).padStart(64, 'a').slice(-64) });
  const logs = [log([M.T_MINTED, '0x' + mot(1), t32(W), t32(UNIT)], '0x' + mot(5), 100, 0), log([M.T_BID, '0x' + mot(1), t32(W2)], '0x' + mot(1050000) + mot(9), 101, 0)];
  const ctx = { horodatage: (b) => 1700000000 + b, devises: { ['0x833589fcd6edb6e08f4c7c32d4f71b54bda02913']: { sym: 'USDC', dec: 6 } }, nomSkin: (c, sk) => BS.nomPublicSkin(c, sk, MESURE, ATTENDU).texte };
  const r = M.lireEvenementsJeu(logs, { skins: CU }, ctx);
  const mi = r.evenements.find((e) => e.kind === 'skin_minted'), bi = r.evenements.find((e) => e.kind === 'skin_bid');
  const ok1 = !!mi && mi.text === '0x31e0…de3b minted skin #2' && !!bi && bi.text === '0x3434…3434 bid on skin #2' && bi.skinTexte === 'skin #2';
  /* the Listed read later completes the bid's amount and keeps the app-wide name */
  const lst = log([M.T_LISTED, '0x' + mot(1), t32(W)], '0x' + adrMot('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913') + mot(1000000) + mot(9), 99, 0);
  const rl = M.lireEvenementsJeu([lst], { skins: CU }, ctx);
  const dl = new Map(); for (const [k, v] of rl.devisesListees) M.ajouterListing(dl, k, v);
  const done = M.completerJournal([bi], { devisesListees: dl, devises: ctx.devises });
  return [ok1, done[0] && done[0].text === '0x3434…3434 bid on skin #2 · 1.05 USDC'];
};
const [d1, d2] = casD(J.__erreur ? null : J);
vu(d1, 'D journal: "minted skin #2" / "bid on skin #2" for the 1 USDC Skins token 1');
vu(d2, 'D completerJournal keeps the app-wide name when it adds the amount');

/* ── E. the auctioneer ── */
const SA = await charger('salle-encheres.js', 'e');
const casE = (M) => {
  if (!M || typeof M.annonce !== 'function') return false;
  const t = 1000;
  const podium = { tokenId: 1n, contrat: CU, nom: 'Skin #2', texte: 'skin #2', detail: 'x', detenteur: '0x' + '5'.repeat(40), block: UNIT, recette: { id: 'random', angle: 0, h: [0, 0, 0], cube: 0, noyau: 0, fond: 0 },
    enVente: true, enchere: true, devise: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', prix: 1000000n, fin: 5000, encherisseur: '0x' + '0'.repeat(40), offre: 0n };
  const a = M.annonce({ skins: [podium], t, montant: () => '1 USDC', nomBlock: () => 'UNIT' });
  return a.lignes.some((l) => l.text === 'On the podium: skin #2, dressing UNIT.');
};
vu(casE(SA.__erreur ? null : SA), 'E the auctioneer: "On the podium: skin #2, dressing UNIT."');

/* ── M. mutants ── */
const mutSrc = (nom, cle, de, vers, c) => { const s2 = SRC[cle].split(de).join(vers); vu(s2 !== SRC[cle] && c(s2) === false, 'M ' + nom); };
mutSrc('market list back to the token id -> C1 red', 'app', "bcEl('b', { text: nomSkin(s), title: detailSkin(s) })", "bcEl('b', { text: 'Skin #' + id })", cC1);
mutSrc('rows keyed by token id only -> C5 red', 'app', 'ancien = skm.lignes.get(k)', 'ancien = skm.lignes.get(id)', cC5);
mutSrc('podium back to the token id -> C3 red', 'app', "bcEl('b', { text: nomSkin(p), title: detailSkin(p) })", "bcEl('b', { text: 'Skin #' + p.tokenId })", cC3);
mutSrc('server journal without nomSkin -> C9 red', 'srv', ',\n    nomSkin: (contrat, sk) => nomPublicSkinSrv(contrat, sk, comptesSkinsLusSrv()).texte });', ' });', cC9);
const modMut = async (nom, fichier, cle, de, vers, index, juge) => {
  const s2 = SRC[cle].split(de).join(vers);
  if (s2 === SRC[cle]) { vu(false, 'M ' + nom + ' (pattern not found)'); return; }
  const f = new URL('./' + fichier.replace(/\.js$/, '') + '.mut390-' + process.pid + '-' + index + '.js', ICI);
  writeFileSync(f, s2);
  try {
    const m2 = await import(f.href).catch((e) => ({ __erreur: e }));
    if (m2.__erreur) { vu(false, 'M ' + nom + ' (mutant did not load: ' + m2.__erreur.message + ' — not a kill)'); return; }
    const r = await juge(m2);
    vu(r.includes(false), 'M ' + nom + ' -> red (' + r.map((x) => (x ? 'ok' : 'RED')).join(',') + ')');
  } finally { unlinkSync(f); }
};
const juge = async (m2) => [...casA(m2.nomPublicSkin), ...(await casB(m2))];
await modMut('the earlier contracts\' counts not added', 'blockskins.js', 'bs', 'numero = decalage + k;', 'numero = k;', 1, juge);
await modMut('an older contract\'s token above its N still numbered', 'blockskins.js', 'bs', '(lu(comptes[i]) && k <= comptes[i])', 'true', 2, juge);
await modMut('the counts read at latest', 'blockskins.js', 'bs', "'0x' + b.toString(16)]", "'latest']", 3, juge);
await modMut("'0x' read as 0", 'blockskins.js', 'bs', "if (/^0x[0-9a-f]{64}$/i.test(brut)) { const v = BigInt(brut);", "{ const v = brut === '0x' ? 0n : BigInt(brut);", 4, juge);
await modMut('a failed count kept', 'blockskins.js', 'bs', 'if (n !== null) comptesSkinsCache.set(cle, n);', 'comptesSkinsCache.set(cle, n);', 5, juge);
await modMut('lireSkins without the names', 'blockskins.js', 'bs', 'skins: skins.map((s) => ({ ...s, ...nomPublicSkin(s.contrat, s.tokenId, comptes, suite) }))', 'skins', 6, juge);
await modMut('journal ignores ctx.nomSkin', 'journal-jeu.js', 'journal', "ctx.nomSkin(skins, sk) : null;", 'null : null;', 7, async (m2) => casD(m2));
await modMut('auctioneer back to the token id', 'salle-encheres.js', 'salle', "'On the podium: ' + texteSkin(podium) + ', dressing '", "'On the podium: skin #' + id + ', dressing '", 8, async (m2) => [casE(m2)]);
console.log(rouges ? '\nRED: ' + rouges + ' failed, ' + n + ' passed' : '\nGREEN: ' + n + ' passed');
process.exit(rouges ? 1 : 0);
