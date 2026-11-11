/* test-recherche-nom-20261010.mjs - LE PANNEAU TROUVE UN BLOCK PAR SON NOM OU SON SYMBOLE CONNU (QA Grok Super, prod
 * 20261010-rail-hook-dex : 'IB022' et 'Smoke IB022' refuses alors que le block existe). EXECUTE bcResoudre EXTRAIT d app.html
 * (TB_APP = ancienne version). AFFIRME : symbole et nom lus sur la chaine (bcNoms) trouves, sans casse ; un nom porte par deux
 * blocks est REFUSE ; un nom inconnu dit 'No block named “X” found — try its address.' ; une adresse et le registre inchanges.
 * NE PROUVE PAS : qu IB022 est bien dans bcNoms/index au moment de la recherche en prod (dependant des lectures) - NON mesure.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
const debut = html.indexOf('function bcResoudre(');
let prof = 0, fin = -1, dans = null;
for (let i = html.indexOf('{', debut); i < html.length; i++) {
  const c = html[i], p = html[i - 1];
  if (dans) { if (c === dans && p !== '\\') dans = null; continue; }
  if (c === '"' || c === "'" || c === '`') { dans = c; continue; }
  if (c === '{') prof++; else if (c === '}') { prof--; if (!prof) { fin = i + 1; break; } }
}
assert.ok(debut > 0 && fin > debut, 'bcResoudre introuvable');
const A = '0xb2' + '0'.repeat(37) + '1', B = '0xb2' + '0'.repeat(37) + '2', C = '0xb2' + '0'.repeat(37) + '3';
const { estJetonMasque, TBLOCK: TBLOCK_REEL } = await import('./tokenomics.js'); const { WETH: WETH_BASE_ADR } = await import('./misables.js'); /* game370: bcResoudre names WETH */ /* game354: bcResoudre masks the old token, TBLOCK = the real one */
const fabriquer = ({ marche = [], noms = [], hab = [], crea = [] }) => new Function('estJetonMasque', 'TBLOCK_REEL', 'marcheParAdr', 'bcNoms', 'habitants', 'creationsLues',
  'DEVISES_BASE', 'ACTIONS_COINBASE', 'brainAdr', 'court', 'window', 'WETH_BASE_ADR', html.slice(debut, fin) + '; return bcResoudre;')(estJetonMasque, TBLOCK_REEL,
  new Map(marche.map((l) => [l.adr, l])), new Map(noms), hab, crea,
  [{ symbole: 'USDC', adr: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', chaines: [8453] }], [], null, (x) => x.slice(0, 6), {}, WETH_BASE_ADR);
const r1 = fabriquer({ noms: [[A, { nom: 'Smoke IB022', sym: 'IB022' }]] });
for (const q of ['IB022', 'ib022', 'Smoke IB022', 'smoke ib022', '  Smoke IB022 ']) {
  const j = r1(q); assert.equal(j.ok, true, q + ' refuse : ' + j.pourquoi); assert.equal(j.adr, A);
}
assert.equal(fabriquer({ crea: [{ jeton: A, symbole: 'IB022' }] })('IB022').adr, A, 'creation lue non trouvee');
const deux = fabriquer({ noms: [[A, { nom: 'Smoke', sym: 'X1' }], [B, { nom: 'Smoke', sym: 'X2' }]] })('Smoke');
assert.equal(deux.ok, false, 'un nom porte par deux blocks doit etre refuse'); assert.match(deux.pourquoi, /2 blocks are named/);
const absent = r1('Nope');
assert.equal(absent.ok, false); assert.equal(absent.pourquoi, 'No block named \u201cNope\u201d found \u2014 try its address.');
assert.equal(r1(C).adr, C, 'une adresse doit rester une adresse');
assert.equal(r1('USDC').sym, 'USDC', 'le registre passe toujours d abord');
console.log('ok recherche-nom - nom/symbole connus trouves, homonymes refuses, message propre ; NE PROUVE PAS les lectures en prod');