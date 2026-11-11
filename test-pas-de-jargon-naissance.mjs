/* test-pas-de-jargon-naissance.mjs — « V8 », « hook », « on-chain label », « createB20 » NE S AFFICHENT PLUS.
 *
 * ⛔⛔ LE DEFAUT (Raksha, 2026-10-01) : le profil, le bouton de naissance et les refus de signature
 *     montraient le vocabulaire INTERNE — « Give birth · V8 », « <b>V8 birth unavailable</b> — V8 birth
 *     needs a face engraved at Create (on-chain label) », « would open an unhooked market (no fee
 *     hook) », « factory createB20 with value 0 ». Un visiteur ne sait pas ce qu est un V8 ni un hook ;
 *     il lit « ca ne marche pas, et c est technique ».
 * ⛔ CE FICHIER LIT LE CODE SANS SES COMMENTAIRES (les commentaires gardent le vocabulaire, c est la
 *   doc des developpeurs — et deux commentaires sont epingles ailleurs), puis EXECUTE la vraie
 *   fonction `viaCourt` du panneau de marche sur les valeurs que `marche.js` met dans `via`.
 * ⛔⛔ TEMOINS NEGATIFS : chaque ancienne phrase est cherchee (elle doit etre ABSENTE), le refus reste
 *   NON VIDE, et le bouton « Give birth » reste cache quand le refus s affiche.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sansCommentaires } from './outils-test.js';

let n = 0;
const cas = (t, f) => { n += 1; try { f(); console.log('  ok  ' + t); } catch (e) { console.error('✗ ' + t); throw e; } };
const brut = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const nu = sansCommentaires(brut, { minRetire: 5000 });

const ANCIENNES = [
  'open its V8 market',
  'Give birth · V8',
  'V8 birth unavailable',
  'V8 birth needs a face engraved at Create (on-chain label)',
  'would open an unhooked market (no fee hook)',
  'with a hooked market seen (fee path)',
  'fee hook unread (will not open an unhooked market)',
  'Birth=V8 only (fee hook is not V8)',
  'factory createB20 with value 0',
  'batch has no ETH value',
  'Instant Birth on TB · 0.001 ETH · V8',
  'opens a hooked market / Buy path',
  'into a hooked TokenizedBlock market',
  '(hooked Launch)', '(legacy Launch)', '(fee hook Launch)', '(legacy Launch pool)',
];

cas('⛔⛔⛔ AUCUNE DES ANCIENNES PHRASES N EST DANS LE CODE AFFICHE (hors commentaires)', () => {
  const restes = ANCIENNES.filter((p) => nu.includes(p));
  assert.deepEqual(restes, [], 'jargon encore affichable : ' + restes.join(' | '));
});

cas('⛔⛔ LE REFUS « NE ICI » EST EN CLAIR, NON VIDE, ET SANS MOT INTERNE', () => {
  const m = /const POURQUOI_PAS_LABEL = ('(?:[^'\\]|\\.)*');/.exec(nu);
  assert.ok(m, 'POURQUOI_PAS_LABEL introuvable');
  const phrase = new Function('return ' + m[1])();
  assert.equal(phrase, "This block was created somewhere else, so its market can't be opened here. You can create a new one — 0.001 ETH.");
  assert.doesNotMatch(phrase, /\bV\d\b|hook|on-chain|createB20|label/i);
});

cas('⛔⛔ QUAND LE REFUS S AFFICHE, « Give birth » EST CACHE AVANT (on ne propose pas un bouton qu on refuse)', () => {
  const i = nu.indexOf("wg.innerHTML = '<b>Can\\'t be brought to life here</b> — ' + enTexte(el.pourquoi);");
  assert.ok(i > 0, 'le titre du refus a change ou a disparu');
  const avant = nu.slice(nu.lastIndexOf('void eligibleNaissanceV8(adrGate)', i), i);
  assert.match(avant, /\$\('#pReveiller'\)\.hidden = true;/);
  assert.equal(nu.split("<b>Can\\'t be brought to life here</b> — ' + enTexte(el.pourquoi)").length - 1, 3, 'les trois endroits du refus');
});

cas('⛔ LES BOUTONS ET REFUS ONT LEUR NOUVEAU TEXTE (et gardent le prix)', () => {
  for (const p of [
    'Give birth · 0.001 ETH',
    '<span class="pBadge" id="plBadge">Give birth</span>',
    "<b>Next</b>: open its market.",
    'this plan would open a market that pays no fee — rebuild the plan.',
    'this transaction would create a free block instead of opening its market',
    "with a market that pays fees · the rest: no fee yet",
    'data-tf-act="instant-birth-tb">Instant Birth on TB · 0.001 ETH</button>',
  ]) assert.ok(nu.includes(p), 'absent : ' + p);
});

/* ── la vraie fonction viaCourt du panneau de marche ── */
const d = nu.indexOf('const viaCourt = (() => {');
const f = nu.indexOf('})();', d);
assert.ok(d > 0 && f > d, 'viaCourt introuvable');
const corps = nu.slice(d + 'const viaCourt = (() => {'.length, f);
const via = (v) => new Function('info', corps)({ via: v });

cas('⛔⛔⛔ « via … » NE MONTRE QUE LA DEVISE — jamais TbFeeHook, on-chain key, V4_…, hooked/legacy Launch', () => {
  const vus = {
    'TBLOCK · 0 % · TbFeeHook v8': ' · via the old test TBLOCK', /* game354: the legacy label names the OLD token */
    'TBLOCK · 0 %': ' · via the old test TBLOCK',
    'on-chain key · ETH': ' · via ETH',
    'on-chain key · USDC': ' · via USDC',
    'ETH · fee hook': ' · via ETH',
    'ETH/USDC · fee 500': ' · via ETH',
    'V4_2_SAUTS': '',
    'USDC · 0 % pool': ' · via USDC',          /* tip 2185 : « 0 % » se lirait « frais du protocole 0 » */
    'USDC · 0,5 % tier': ' · via USDC',
    '': '',
  };
  for (const [v, attendu] of Object.entries(vus)) {
    const r = via(v);
    assert.equal(r, attendu, JSON.stringify(v) + ' -> ' + JSON.stringify(r));
    assert.doesNotMatch(r, /hook|on-chain|Launch|V\d|_|%/i);
  }
});

console.log(n + ' cas OK — test-pas-de-jargon-naissance');
