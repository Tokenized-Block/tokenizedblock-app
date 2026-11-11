/* test-buyback-v1-page-369-20261111.mjs — /deployer-tblock-buyback.html is the page of the RETIRED TBlockBuyback v1.
 *
 * Why: v1 has no owner and no withdraw, and burns what it buys to 0x...dEaD. TBlockBuybackV2 replaced it (every TBLOCK bought goes to the
 *   community vault). The page still said "Fund it with a normal ETH transfer." — ETH sent there can never reach the vault or come back.
 *   Decision: keep the page (it is the only public record of v1's address, block and data), turn it into a retired notice.
 *
 * A  the page no longer says "Fund it with a normal ETH transfer"
 * B  the page carries a retired banner (id="retired") that says "Do not fund it"
 * C  the page carries <meta name="robots" content="noindex">
 * D  the page reads the CURRENT buyback address from economie-deploiement.js (never typed) and links deployer-economie.html
 * E  the robots.txt builder in serveur-web.js disallows /deployer-tblock-buyback.html
 * F  serveur-web.js still serves the page (allowlisted, not redirected)
 * G  the page types no 0x address of 40 hex digits (both addresses come from generated records)
 * H  EXECUTED: the page's module script runs against a tiny DOM stub; the state line and the banner are read as rendered text
 * M  MUTANTS: "Fund it" back -> A red; the noindex meta removed -> C red; a typed address in the page -> G red.
 * Counts itself and prints n/n. */
import { readFileSync, writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const lire = (f) => readFileSync(join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
let n = 0, rouges = 0;
const vu = (cond, label) => { n += 1; if (cond === true) console.log('  ok   ' + label); else { rouges += 1; console.log('  FAIL ' + label); } };

const page = lire('deployer-tblock-buyback.html');
const srv = lire('serveur-web.js');

const cA = (p) => !p.includes('Fund it with a normal ETH transfer');
const cB = (p) => /id="retired"/.test(p) && p.includes('Do not fund it');
const cC = (p) => p.includes('<meta name="robots" content="noindex">');
const cD = (p) => /import \{ ECONOMIE_DEPLOIEMENT as E \} from '\.\/economie-deploiement\.js';/.test(p) && /E\.adresseBuyback/.test(p) && p.includes('href="deployer-economie.html"');
const cG = (p) => !/0x[0-9a-fA-F]{40}/.test(p);

vu(cA(page), 'A the page no longer tells visitors to fund v1 with a normal ETH transfer');
vu(cB(page), 'B the page shows a retired banner (id="retired") with "Do not fund it"');
vu(cC(page), 'C the page carries <meta name="robots" content="noindex">');
vu(cD(page), 'D the page reads the current buyback (E.adresseBuyback) from economie-deploiement.js and links deployer-economie.html');
/* the robots.txt builder: from its first entry to its Sitemap line (it spans several source lines) */
const iR = srv.indexOf("'User-agent: *', 'Allow: /'");
const robots = iR >= 0 ? srv.slice(iR, srv.indexOf("'Sitemap: ", iR)) : '';
vu(robots.includes("'Disallow: /deployer-tblock-buyback.html'"), 'E robots.txt disallows /deployer-tblock-buyback.html');
vu(/^  'deployer-tblock-buyback\.html', 'tblock-buyback-deploiement\.js',$/m.test(srv), 'F serveur-web.js still serves the page (allowlisted, not redirected)');
vu(cG(page), 'G the page types no whole address (both come from generated records)');

/* H — run the page script on a DOM stub: rendered text, not source text */
async function rendu(p) {
  const m = p.match(/<script type="module">([\s\S]*?)<\/script>/);
  if (!m) return null;
  const urlOf = (f) => pathToFileURL(join(ICI, f)).href;
  const code = m[1].replace(/from '\.\/([a-z0-9-]+\.js)'/g, (_, f) => "from '" + urlOf(f) + "'");
  const els = {};
  const el = (id) => (els[id] ||= { id, innerHTML: '', textContent: '', disabled: false, onclick: null });
  globalThis.document = { querySelector: (s) => el(String(s).replace(/^#/, '')) };
  globalThis.window = {};
  const dir = mkdtempSync(join(tmpdir(), 'bb369-'));
  const f = join(dir, 'page.mjs');
  writeFileSync(f, code);
  try { await import(pathToFileURL(f).href); } finally { try { unlinkSync(f); } catch (_) { /* temp */ } }
  return els;
}
let els = null;
try { els = await rendu(page); } catch (e) { els = null; console.log('  (page script threw: ' + String((e && e.message) || e).slice(0, 160) + ')'); }
const E = (await import('./economie-deploiement.js')).ECONOMIE_DEPLOIEMENT;
const B = (await import('./tblock-buyback-deploiement.js')).BUYBACK_DEPLOIEMENT;
const etat = els && els.state ? String(els.state.innerHTML) : '';
const courant = els && els.current ? String(els.current.innerHTML) : '';
vu(!!els && !/Fund it/i.test(etat) && /do not send ETH/i.test(etat) && etat.includes(String(B.adresse)),
  'H rendered state line: names v1 (from its record) and says "do not send ETH", never "Fund it"');
vu(!!els && courant.includes(String(E.adresseBuyback)) && !courant.includes(String(B.adresse)),
  'H rendered banner: names the current buyback read from economie-deploiement.js, not v1');
vu(!!els && els.connect && els.deploy && els.connect.disabled === true && els.deploy.disabled === true, 'H connect and deploy stay disabled');

/* M — mutants */
const mA = page.replace('Retired: do not send ETH to it.', 'Fund it with a normal ETH transfer.');
vu(mA !== page && cA(mA) === false, 'M mutant "Fund it" back -> A red');
const mC = page.replace('<meta name="robots" content="noindex">', '');
vu(mC !== page && cC(mC) === false, 'M mutant noindex removed -> C red');
const mG = page.replace('E.adresseBuyback', "'" + String(E.adresseBuyback) + "'");
vu(mG !== page && cG(mG) === false, 'M mutant typed address -> G red');

console.log((n - rouges) + '/' + n + (rouges ? ' — RED' : ' — green'));
process.exit(rouges ? 1 : 0);
