// test-tam-numero-378-20261112.mjs — game378 (Phil pasted the "Minted works" list: "TAM #1", then "TAM #1 · first collection",
//   "TAM #2 · first collection", "TAM #3 · first collection" — two different works both called TAM #1).
// What this test PROVES:
//   A. nomPublicTam(id, premiere, N) — ONE public number across both collections, in mint order: the first collection keeps #1..#N,
//      TAM art's token k is #(N+k), with a detail naming the contract and the on-chain token id. N not read (null, NaN, negative) or a
//      first-collection token above N: no number at all, the name IS the contract and token id. Phil's real list: N = 3 (totalSupply
//      of the first collection read on Base at TAM art's deploy block 56,427,691), TAM art totalSupply 1 (its token 1 minted by the
//      tx 0x80fb7f08...6857, tx.from = the wallet that minted, Minted id 1).
//   B. ordreGalerie: the gallery list for that real data reads TAM #4, #3, #2, #1 (newest first), no two works share a name; N not read ->
//      the read order kept and no number shown.
//   C. tam-onglet.js wiring (source): N is read as totalSupply of the first collection AT TAM art's deploy block (not 'latest', which
//      would renumber TAM art if someone minted on the first contract later); the gallery names every card with ordreGalerie; the card
//      title is the public name with the detail line under it; the Replay top line, the check line and the card's "Minted" line use the
//      SAME name; the click passes the card's name to the replay; no "first collection" suffix remains in any title.
//   M. mutants: on the source (C) and on a mutated copy of the module, imported (A/B). Each one turns its assertion red.
// What it does NOT prove: the drawing, or what a browser shows — that is checked in a real browser, separately.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { ADRESSES_PACK_ECONOMIE_V2 } from './economie-v2-pack-deploye.js'; /* TAM art = step T of the pack record (never retyped: test-noter-pack-economie-v2) */
import { TAMART_DEPLOIEMENT } from './tamart-deploiement.js';

let n = 0, rouges = 0;
const vu = (c, m) => { if (c) { n++; console.log('  ok  ' + m); } else { rouges++; console.log('  RED ' + m); } };
const ICI = new URL('./', import.meta.url);
const src = readFileSync(new URL('./tam-onglet.js', ICI), 'utf8').replace(/\r\n/g, '\n');
const mod = await import(new URL('./tam-onglet.js?banc378=' + process.pid, ICI).href).catch((e) => ({ __erreur: e }));
vu(!mod.__erreur, 'C tam-onglet.js loads' + (mod.__erreur ? ': ' + mod.__erreur.message : ''));

const casA = (nom, ordre) => {
  const r = [];
  if (typeof nom !== 'function') return [false, false, false, false, false, false, false];
  const N = 3;
  const t = (id, p, k) => nom(id, p, k);
  /* A1 Phil's list: first 1..3 keep #1..#3, TAM art 1 -> #4 */
  r.push(t(1, true, N).nom === 'TAM #1' && t(2, true, N).nom === 'TAM #2' && t(3, true, N).nom === 'TAM #3' && t(1, false, N).nom === 'TAM #4' && t(1, false, N).numero === 4);
  /* A2 the detail names the contract and the on-chain token id */
  r.push(t(1, false, N).detail === 'TAM art · token 1' && t(2, true, N).detail === 'First collection · token 2' && t(5, false, N).nom === 'TAM #8');
  /* A3 N not read: no number, the name is the contract + token id */
  r.push([null, undefined, NaN, -1, 2.5, '3'].every((k) => t(1, false, k).numero === null && t(1, false, k).nom === 'TAM art · token 1' && t(2, true, k).numero === null && t(2, true, k).nom === 'First collection · token 2'));
  /* A4 a first-collection token above N (minted there after TAM art went live): no number guessed ; N = 0 -> TAM art 1 is #1 */
  r.push(t(4, true, N).numero === null && t(4, true, N).nom === 'First collection · token 4' && t(1, false, 0).nom === 'TAM #1' && t(0, false, N).numero === null && t('x', true, N).numero === null);
  /* A5 no title carries the old suffix */
  r.push([t(1, true, N), t(1, false, N), t(1, true, null)].every((x) => !/first collection\)|· first collection/.test(x.nom)));
  if (typeof ordre !== 'function') { r.push(false, false); return r; }
  /* B1 the gallery order for the real data: read order = TAM art first, then the first collection (addresses copied from the records) */
  const A = { contrat: ADRESSES_PACK_ECONOMIE_V2.T, premiere: false }, P = { contrat: TAMART_DEPLOIEMENT.adresse, premiere: true };
  const lus = [{ s: A, id: 1 }, { s: P, id: 1 }, { s: P, id: 2 }, { s: P, id: 3 }];
  const g = ordre(lus, N).map((x) => x.nom.nom);
  r.push(JSON.stringify(g) === JSON.stringify(['TAM #4', 'TAM #3', 'TAM #2', 'TAM #1']) && new Set(g).size === g.length && ordre(lus, N)[0].s === A);
  const g0 = ordre(lus, null).map((x) => x.nom.nom);
  r.push(JSON.stringify(g0) === JSON.stringify(['TAM art · token 1', 'First collection · token 1', 'First collection · token 2', 'First collection · token 3']) && new Set(g0).size === 4);
  return r;
};
const [a1, a2, a3, a4, a5, b1, b2] = casA(mod.nomPublicTam, mod.ordreGalerie);
vu(a1, 'A Phil\'s list: first collection #1..#3, TAM art token 1 -> TAM #4');
vu(a2, 'A the detail line names the contract and the on-chain token id ("TAM art · token 1")');
vu(a3, 'A N not read -> no number, the name is the contract and token id');
vu(a4, 'A first-collection token above N -> no number guessed ; N = 0 -> TAM art 1 is TAM #1 ; bad id -> no number');
vu(a5, 'A no title carries "(first collection)" / "· first collection"');
vu(b1, 'B gallery for the real data reads TAM #4, #3, #2, #1 (newest first), every name distinct');
vu(b2, 'B N not read -> the read order kept, names = contract + token id, all distinct');

/* ── C. wiring in the source ── */
const fonction = (s, nom) => { const i = s.indexOf('function ' + nom + '('); if (i < 0) return ''; const m = /\n {2}\}\n/g; m.lastIndex = i; const r = m.exec(s); return s.slice(i, r ? r.index : undefined); };
const cC1 = (s) => { const h = fonction(s, 'lireNPremiere'); return /adresseTam\(TAMART_DEPLOIEMENT\)/.test(h) && /EP\.TAM_DEPLOIEMENT\.bloc/.test(h)
  && /appelLecture\(premiere, SIG_TAM\.totalSupply\), '0x' \+ bloc\.toString\(16\)\]/.test(h) && !/'latest'/.test(h) && /catch \(_\) \{ return null; \}/.test(h); };
vu(cC1(src), 'C N = totalSupply of the first collection AT TAM art\'s deploy block (not latest), null when not read');
const cC2 = (s) => { const h = fonction(s, 'galerie'); return /S\.nPremiere = lus\.length \? await lireNPremiere\(\) : null;/.test(h) && /ordreGalerie\(lus, S\.nPremiere\)\.map\(\(x\) => carteOeuvre\(x\.s\.contrat, x\.id, x\.s\.premiere, x\.nom\)\)/.test(h); };
vu(cC2(src), 'C the gallery reads N, then names every card with ordreGalerie');
const cC3 = (s) => { const h = fonction(s, 'carteOeuvre'); return /el\('b', \{ text: nom\.nom \}\), nom\.numero !== null \? el\('p', \{ class: 'tamDoux tamJeton', text: nom\.detail \}\) : null/.test(h)
  && /rejouerMintee\(id, p, donnees, graineHex, premiere, nom\)/.test(h) && !/first collection/.test(h); };
vu(cC3(src), 'C the card title is the public name, the detail line under it, and the click passes that name to the replay');
const cC4 = (s) => s.includes('S.rejeu = { id, premiere: !!premiere, nom: nom || nomPublicTam(id, premiere, null),')
  && s.includes("el('b', { text: nomRejeu() }), document.createTextNode(detailRejeu() + ' — minted on Base")
  && s.includes("'Replay of ' + nomRejeu() + ' (' + (S.rejeu.nom.numero !== null ? S.rejeu.nom.detail + ', ' : '') + 'read from Base'")
  && s.includes("'yes — this is ' + nomRejeu() + detailRejeu() + ', read from Base.")
  && s.includes("function nomRejeu() { return S.rejeu ? S.rejeu.nom.nom : ''; }");
vu(cC4(src), 'C the Replay top line, the check line and the card\'s "Minted" line all show the SAME public name');
const cC5 = (s) => !/' · first collection'|' \(first collection\)'|collectionRejeu/.test(s) && !/'TAM #' \+ (id|S\.rejeu\.id)/.test(s);
vu(cC5(src), 'C no "first collection" suffix and no raw "TAM #" + token id left in tam-onglet.js');

/* ── M. mutants: on the source (C) and on a mutated module copy imported (A/B) ── */
const mut = (nom, de, vers, c) => { const s2 = src.split(de).join(vers); vu(s2 !== src && c(s2) === false, 'M ' + nom); };
mut('N read at latest -> C1 red', "'0x' + bloc.toString(16)]", "'latest']", cC1);
mut('gallery without ordreGalerie -> C2 red', 'ordreGalerie(lus, S.nPremiere).map(', 'lus.map(', cC2);
mut('detail line dropped -> C3 red', "nom.numero !== null ? el('p', { class: 'tamDoux tamJeton', text: nom.detail }) : null", 'null', cC3);
mut('replay forgets the card\'s name -> C4 red', 'nom: nom || nomPublicTam(id, premiere, null),', 'nom: nomPublicTam(id, premiere, null),', cC4);
mut('check line without the name -> C4 red', "'Replay of ' + nomRejeu() + ' ('", "'Replay of TAM #' + S.rejeu.id + ' ('", cC4);
mut('old suffix back in a title -> C5 red', "el('b', { text: nom.nom })", "el('b', { text: 'TAM #' + id + (premiere ? ' · first collection' : '') })", cC5);
/* the mutated module is written next to the original (its relative imports resolve), imported, then removed */
const modMut = async (nom, de, vers, index) => {
  const s2 = src.split(de).join(vers);
  if (s2 === src) { vu(false, 'M ' + nom + ' (pattern not found)'); return; }
  const f = new URL('./tam-onglet.mut378-' + process.pid + '-' + index + '.js', ICI);
  writeFileSync(f, s2);
  try {
    const m2 = await import(f.href);
    const r = casA(m2.nomPublicTam, m2.ordreGalerie);
    vu(r.includes(false), 'M ' + nom + ' -> red (' + r.map((x) => (x ? 'ok' : 'RED')).join(',') + ')');
  } finally { unlinkSync(f); }
};
await modMut('TAM art numbered by its own id', 'nPremiere + k;', 'k;', 1);
await modMut('a number guessed when N is not read', '!Number.isSafeInteger(k) || k < 1 || !nLu ? null', '!Number.isSafeInteger(k) || k < 1 ? null', 2);
await modMut('first-collection token above N still numbered', '(k <= nPremiere ? k : null)', 'k', 3);
await modMut('oldest first', '(cle(b) - cle(a))', '(cle(a) - cle(b))', 4);
await modMut('detail without the token id', "' · token ' + k", "''", 5);
console.log(rouges ? '\nRED: ' + rouges + ' failed, ' + n + ' passed' : '\nGREEN: ' + n + ' passed');
process.exit(rouges ? 1 : 0);
