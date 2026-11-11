/* test-panel-weth-name-370-20261111.mjs — the control panel names WETH "WETH", never "0x4200…0006".
 * Seen on prod game369 as a new visitor (control panel on CLOUD, a block quoted in WETH): "YOU PAY 0x4200…0006" and
 * "No quick amounts in 0x4200…0006 — type the amount." The pay-with select (#bcDevise) carried data-sym "0x4200…0006".
 * The label comes from bcCotation -> bcResoudre(address): registry, then the Market index, then names read, then the
 * abbreviated address. WETH is in none of the first three, so the visitor read a raw address.
 * This test runs the REAL bcResoudre and bcCotation (extracted from app.html) with the REAL registries (paires.js) and the
 * WETH address as misables.js exports it (copied, never recalled), against a stub Market index.
 * Does NOT prove: that a WETH-quoted block can be bought from the panel (the route is the same as before; only the label changes). */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(process.env.TB_APP || path.join(ICI, 'app.html'), 'utf8');
const P = await import(pathToFileURL(path.join(ICI, 'paires.js')).href);
const MIS = await import(pathToFileURL(path.join(ICI, 'misables.js')).href);
const FC = await import(pathToFileURL(path.join(ICI, 'frais-creation.js')).href);
let n = 0, ko = 0;
const vu = (c, m) => { n += 1; if (!c) { ko += 1; console.log('KO ' + m); } else console.log('ok ' + m); };

function fonction(nom) {
  const i = html.indexOf('function ' + nom + '(');
  if (i < 0) throw new Error('not found: ' + nom);
  let k = html.indexOf('{', html.indexOf(')', i)), prof = 0;
  for (let j = k; j < html.length; j++) { if (html[j] === '{') prof++; else if (html[j] === '}') { prof--; if (prof === 0) return html.slice(i, j + 1); } }
  throw new Error('unbalanced: ' + nom);
}
/* the names app.html imports from misables.js, as written in its import line (the fix may add WETH there) */
const imp = html.match(/^import \{([^}]*)\} from '\.\/misables\.js';$/m);
vu(!!imp, 'A1 the misables.js import line is found');
const liaisons = imp[1].split(',').map((s) => s.trim()).filter(Boolean).map((s) => { const m = s.split(/\s+as\s+/); return [m[0], m[1] || m[0]]; });

const WETH = MIS.WETH.toLowerCase(), CLOUD = '0xb2' + 'c'.repeat(38), INCONNU = '0x' + '7'.repeat(40);
const ctx = {
  String, Number, Map, Set, Object, Array, RegExp,
  UNIT_APP: '0xb2' + 'a'.repeat(38), TBLOCK_REEL: '0xb2' + 'b'.repeat(38), brainAdr: null,
  marcheParAdr: new Map([[CLOUD, { adr: CLOUD, sym: 'CLOUD', quoteAdr: WETH }]]), bcNoms: new Map(), habitants: [], creationsLues: [], brainMarche: null, marcheProfil: null,
  estJetonMasque: () => false, DEVISES_BASE: P.DEVISES_BASE, ACTIONS_COINBASE: P.ACTIONS_COINBASE,
  ACTIONS_PAR_ADR: new Set(P.ACTIONS_COINBASE.map((a) => String(a.adr).toLowerCase())),
  ETH_ADR: '0x0000000000000000000000000000000000000000', court: (a) => FC.displayShort(a), window: {},
};
for (const [orig, local] of liaisons) if (orig in MIS) ctx[local] = MIS[orig];
vm.createContext(ctx);
vm.runInContext(fonction('bcResoudre') + '\n' + fonction('bcCotation') + '\nthis.__r = bcResoudre; this.__c = bcCotation;', ctx);

const r = ctx.__r(MIS.WETH);
console.log('   bcResoudre(WETH) -> ' + JSON.stringify(r));
vu(r.ok === true && r.adr === WETH, 'B1 the WETH address keeps its address');
vu(r.sym === 'WETH', 'B2 WETH is named "WETH" (prod game369 showed "0x4200…0006")');
const q = ctx.__c(CLOUD);
console.log('   bcCotation(CLOUD quoted in WETH) -> ' + JSON.stringify(q));
vu(q && q.sym === 'WETH' && q.adr === WETH, 'B3 the panel quote of a WETH-quoted block reads "WETH" — the label of the pay-with select');
const x = ctx.__r(INCONNU);
vu(x.sym === FC.displayShort(INCONNU), 'B4 an unknown address is still shown abbreviated, never given a made-up name');
const u = ctx.__r('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
vu(u.sym === 'USDC', 'B5 the registry still names USDC first');
const e = ctx.__c(CLOUD.replace(/c/g, 'd'));
vu(e === null, 'B6 a block with no market read still has no quote (null), not WETH by default');

console.log((ko ? 'RED' : 'GREEN') + ' ' + (n - ko) + '/' + n);
process.exit(ko ? 1 : 0);
