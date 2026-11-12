/* test-skins-prix-369-20261111.mjs — /api/skins/prix describes the BlockSkins MINT, not the retired transfer + memo rail.
 *
 * Why: the app mints skins on the BlockSkins contract (approve USDC exactly, then mint(block, packed skin)). The price endpoint and
 *   llms.txt still told agents to pay the fee wallet by a plain USDC transfer() with a memo: that buys no token, only a line in a
 *   server index. This test pins the new body and its source.
 *
 * A  EXECUTED  blockskins-actif.js skinsPrixCorps(): contract, price and USDC read from the deployment record; no beneficiary, no memo,
 *              no fee-wallet address anywhere in the body.
 * B  EXECUTED  skinsPrixCorps() follows the record: a synthetic record whose v3 has an address reports v3 and 10000000.
 * C  SOURCE    serveur-web.js, the '/api/skins/prix' branch renders skinsPrixCorps() and carries neither beneficiaire: nor 'tb-skin:1'.
 *              The route opener line (anchored on by test-cle-par-pool-id-20261026.mjs) is kept word for word.
 * D  SOURCE    llms.txt describes mint(address,uint64), not transfer(fee wallet, ...) and not "not a token".
 * E  SOURCE    app.html no longer imports the dead v1 helpers (appelAchatSkin, SKIN_PRIX_USDC) from skins.js.
 * F  MUTANTS   each must turn its clause red: beneficiary back in the route; a typed contract in skinsPrixCorps; v1 sentence back in llms.txt.
 * The test counts itself and prints n/n. */
import { readFileSync, writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const lire = (f) => readFileSync(join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
let n = 0, rouges = 0;
const vu = (cond, label) => { n += 1; if (cond === true) console.log('  ok   ' + label); else { rouges += 1; console.log('  FAIL ' + label); } };

const D = (await import('./blockskins-deploiement.js')).BLOCKSKINS_DEPLOIEMENT;
const AC = await import('./blockskins-actif.js');
const actif = AC.BLOCKSKINS_ACTIF; /* 2026-11-12: the pack's Skins (paid through the router); its precedent is the record D */
const walletFrais = String(actif.constructeur.walletDesFrais).toLowerCase();

/* ── A ── */
const corpsOk = (c, a) => !!c && c.ok === true && (a.routeur ? (c.format === 'router' && c.router === String(a.routeur).toLowerCase() && c.steps[0].spender === 'router' && /^pay\(/.test(c.steps[1].call)) : (c.format === 'mint' && c.steps[1].call === 'mint(address,uint64)'))
  && c.contract === String(a.adresse).toLowerCase()
  && c.priceUsdc === String(a.mintPriceUsdc) && c.prixUsdc === String(a.mintPriceUsdc)
  && c.decimals === 6 && c.decimales === 6
  && c.usdc === String(a.constructeur.usdc).toLowerCase()
  && Array.isArray(c.steps) && c.steps.length === 2
  && c.steps[0].call === 'approve(address,uint256)' && c.steps[0].exact === true

  && Array.isArray(c.readBack) && c.readBack.includes('MINT_PRICE()')
  && !('beneficiaire' in c) && !('memo' in c)
  && !JSON.stringify(c).includes('tb-skin')
  && !JSON.stringify(c).toLowerCase().includes(String(a.constructeur.walletDesFrais).toLowerCase());
const f = AC.skinsPrixCorps;
vu(typeof f === 'function', 'A blockskins-actif.js exports skinsPrixCorps');
let corps = null;
try { corps = typeof f === 'function' ? f() : null; } catch (_) { corps = null; }
vu(corpsOk(corps, actif) && corps.contract === AC.BLOCKSKINS && corps.priceUsdc === String(AC.SKIN_MINT_USDC),
  'A the body names the active contract (v' + actif.version + '), its price ' + String(AC.SKIN_MINT_USDC) + ' and the USDC, with an exact approve then mint');
vu(!!corps && !JSON.stringify(corps).toLowerCase().includes(walletFrais) && !('beneficiaire' in corps) && !('memo' in corps),
  'A the body carries no beneficiary key, no memo and not the fee-wallet address');

/* ── B ── a synthetic record (fixture address, not a real contract) */
const SYNTH = '0x' + '5a'.repeat(20);
const synth = { ...D, adresse: SYNTH, mintPriceUsdc: '10000000', imageDansLeWallet: true };
let cs = null;
try { cs = typeof f === 'function' ? f(AC.contratActif(synth)) : null; } catch (_) { cs = null; }
vu(!!cs && cs.version === 3 && cs.contract === SYNTH && cs.priceUsdc === '10000000' && corpsOk(cs, AC.contratActif(synth)),
  'B a record whose v3 has an address makes the body report v3, its address and 10000000');

/* ── C ── */
const brancheDe = (src) => { const l = src.split('\n').find((x) => x.includes("if (chemin === '/api/skins/prix') {")); return l || ''; };
const clauseC = (src) => {
  const b = brancheDe(src);
  return b.includes('rendreS(200, skinsPrixCorps())') && !b.includes('beneficiaire:') && !b.includes("'tb-skin:1");
};
const srv = lire('serveur-web.js');
vu(clauseC(srv), "C serveur-web.js: the '/api/skins/prix' branch renders skinsPrixCorps(), with no beneficiaire: and no 'tb-skin:1'");
vu(/^import \{ skinsPrixCorps \} from '\.\/blockskins-actif\.js';$/m.test(srv), 'C serveur-web.js imports skinsPrixCorps from blockskins-actif.js');
vu(srv.includes("  if (chemin === '/api/skins/prix' || chemin === '/api/skins/achat' || chemin.startsWith('/api/skins/')) {"),
  'C the route opener line is kept word for word (test-cle-par-pool-id-20261026.mjs anchors on it)');

/* ── D ── */
const clauseD = (t) => t.includes('mint(address,uint64)') && !t.includes('transfer(fee wallet') && !t.includes('not a token') && !t.includes('tb-skin:1');
const llms = lire('llms.txt');
vu(clauseD(llms), 'D llms.txt describes mint(address,uint64); no transfer(fee wallet, ...), no memo, no "not a token"');
vu(!llms.toLowerCase().includes(walletFrais), 'D llms.txt does not print the fee-wallet address');

/* ── E ── */
const app = lire('app.html');
vu(!/import \{ appelAchatSkin, SKIN_PRIX_USDC \} from '\.\/skins\.js';/.test(app) && !/\bappelAchatSkin\b/.test(app),
  'E app.html no longer imports the dead v1 helpers from skins.js');

/* ── F ── mutants */
const b0 = brancheDe(srv);
const mutSrv = b0 ? srv.replace(b0, b0.replace('rendreS(200, skinsPrixCorps())', "rendreS(200, { ...skinsPrixCorps(), beneficiaire: FEE_WALLET.toLowerCase() })")) : srv;
vu(b0 !== '' && mutSrv !== srv && clauseC(mutSrv) === false, 'F mutant: beneficiary back in the route -> C goes red');
const mutLlms = llms.replace('mint(address,uint64)', 'transfer(fee wallet, 1 USDC)');
vu(mutLlms !== llms && clauseD(mutLlms) === false, 'F mutant: the v1 sentence back in llms.txt -> D goes red');
/* typed contract: a copy of blockskins-actif.js whose body names a literal address (the value is the live one, written at run time) */
let mutTue = false, mutCharge = false;
const srcAc = lire('blockskins-actif.js');
const ancre = 'contract: String(actif.adresse).toLowerCase(),';
if (srcAc.includes(ancre)) {
  const dir = mkdtempSync(join(tmpdir(), 'skp369-'));
  const p = join(dir, 'blockskins-actif-mutant.mjs');
  const urlDep = pathToFileURL(join(ICI, 'blockskins-deploiement.js')).href;
  /* 2026-11-12: blockskins-actif.js imports the pack modules too: the copy points every relative import at the tree */
  const abs = (f) => pathToFileURL(join(ICI, f)).href;
  writeFileSync(p, srcAc.split(ancre).join("contract: '" + AC.BLOCKSKINS + "',").replace("from './blockskins-deploiement.js'", "from '" + urlDep + "'").replace("from './economie-pack.js'", "from '" + abs('economie-pack.js') + "'").replace("from './frais-contrats.js'", "from '" + abs('frais-contrats.js') + "'")
    /* 2026-11-12: and the 1 USDC Skins record + its module */
    .replace("from './skins-spin-deploiement.js'", "from '" + abs('skins-spin-deploiement.js') + "'").replace("from './skins-spin.js'", "from '" + abs('skins-spin.js') + "'"));
  try {
    const M = await import(pathToFileURL(p).href);
    mutCharge = typeof M.skinsPrixCorps === 'function' && corpsOk(M.skinsPrixCorps(), actif); /* the mutant loads and passes A: it is alive */
    const c2 = M.skinsPrixCorps(M.contratActif(synth));
    mutTue = !(c2.contract === SYNTH);
  } catch (_) { mutTue = false; }
  try { unlinkSync(p); } catch (_) { /* temp file */ }
}
vu(mutCharge && mutTue, 'F mutant: a typed contract address in skinsPrixCorps loads, passes A, and is caught by B');

console.log((n - rouges) + '/' + n + (rouges ? ' — RED' : ' — green'));
process.exit(rouges ? 1 : 0);
