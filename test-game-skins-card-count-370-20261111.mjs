/* test-game-skins-card-count-370-20261111.mjs — the Game tab's Skins card never says "mint the first" once a skin exists.
 * Seen on prod game369 as a new visitor: Game card "Skins 0 · mint the first", while the Market tab (same lireSkins list) said
 * "1 minted · 0 at a fixed price · 0 in auction · 1 not listed ... Skin #1 dresses UNIT". The card counted only skins FOR SALE and,
 * at zero, invited to mint "the first" — false once one is minted.
 * This test runs the REAL peindreSkinsJeu (extracted from app.html) in a small stub DOM, on three read lists:
 *   none minted / one minted not listed / two minted one for sale; and a failed read (the card must not change).
 * Does NOT prove: the browser render (checked on the page separately), a real chain read. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(process.env.TB_APP || path.join(ICI, 'app.html'), 'utf8');
let n = 0, ko = 0;
const vu = (c, m) => { n += 1; if (!c) { ko += 1; console.log('KO ' + m); } else console.log('ok ' + m); };

/** a top-level function's source, by balanced braces from its declaration */
function fonction(nom) {
  const i = html.indexOf('async function ' + nom + '(') >= 0 ? html.indexOf('async function ' + nom + '(') : html.indexOf('function ' + nom + '(');
  if (i < 0) throw new Error('not found: ' + nom);
  let k = html.indexOf('{', html.indexOf(')', i)), prof = 0;
  for (let j = k; j < html.length; j++) { if (html[j] === '{') prof++; else if (html[j] === '}') { prof--; if (prof === 0) return html.slice(i, j + 1); } }
  throw new Error('unbalanced: ' + nom);
}
const jbLigne = html.match(/^const jb = \(id, txt\) => \{[^\n]*\};$/m);
vu(!!jbLigne, 'A1 the jb helper is found');
const src = fonction('peindreSkinsJeu');
vu(src.includes("jb('jbSkins'"), 'A2 peindreSkinsJeu writes the card count');

const MOI = '0x' + '1'.repeat(40), AUTRE = '0x' + '2'.repeat(40);
const sk = (id, o = {}) => ({ tokenId: BigInt(id), detenteur: AUTRE, block: '0xb2' + '0'.repeat(38), enVente: false, enchere: false, fin: 0, ...o });

async function carte(lecture) {
  const ids = {};
  for (const id of ['skinEtat', 'skinListe', 'jbSkins', 'jbSkinsTxt']) ids[id] = { id, textContent: id === 'jbSkins' ? '—' : (id === 'jbSkinsTxt' ? 'for sale' : ''), append() {} };
  const ctx = {
    document: { getElementById: (id) => ids[id] || null, createElement: () => ({ style: {}, append() {} }) },
    $: (s) => ids[s.replace(/^#/, '')] || null, compte: null, rpc: null, Date, Math, Number, String,
    lireSkins: async () => lecture, texteMarcheSkins: () => 'market sentence', typedInputs: () => null, restoreTypedInputs() {},
    bcLigneSkin: () => ({}),
  };
  vm.createContext(ctx);
  vm.runInContext(jbLigne[0] + '\nlet skinsJeuEnVol = false;\n' + src + '\nthis.__p = peindreSkinsJeu;', ctx);
  await ctx.__p();
  return { nb: ids.jbSkins.textContent, txt: ids.jbSkinsTxt.textContent };
}

const zero = await carte({ etat: 'LU', total: 0, skins: [], tronque: false });
console.log('   none minted     -> ' + zero.nb + ' · ' + zero.txt);
vu(zero.nb === '0' && zero.txt === 'mint the first', 'B1 nothing minted: "0 · mint the first" (the invitation is true)');

const un = await carte({ etat: 'LU', total: 1, skins: [sk(1)], tronque: false });
console.log('   1 minted, 0 sale -> ' + un.nb + ' · ' + un.txt);
vu(un.txt !== 'mint the first', 'B2 one skin minted: the card no longer says "mint the first" (prod game369 said it)');
vu(un.nb === '1' && un.txt === 'minted · none for sale', 'B3 one skin minted, none listed: "1 · minted · none for sale"');

const deux = await carte({ etat: 'LU', total: 2, skins: [sk(1), sk(2, { enVente: true, prix: 1n, devise: '0x' + '0'.repeat(40) })], tronque: false });
console.log('   2 minted, 1 sale -> ' + deux.nb + ' · ' + deux.txt);
vu(deux.nb === '1' && deux.txt === 'for sale', 'B4 one for sale: "1 · for sale" (unchanged behaviour)');

const tronque = await carte({ etat: 'LU', total: 40, skins: [sk(1), sk(2)], tronque: true });
vu(tronque.nb === '40' && tronque.txt === 'minted · none for sale', 'B5 a truncated read counts the total the contract reports (40), not the page (2)');

const rate = await carte({ etat: 'NON_LU' });
vu(rate.nb === '—' && rate.txt === 'for sale', 'B6 a failed read leaves the card as it was — never a wrong count');

console.log((ko ? 'RED' : 'GREEN') + ' ' + (n - ko) + '/' + n);
process.exit(ko ? 1 : 0);
