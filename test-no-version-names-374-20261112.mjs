/* test-no-version-names-374-20261112.mjs — Phil 2026-11-12: "no v2 or open market v8 in the text, remove the v8, just the name".
 *
 * WHAT IT CHECKS: the text a visitor can read (HTML text nodes, visible attributes, and JS string literals that read like prose)
 *   in app.html, the public pages and the duels refusal module carries NO internal version name (V8, v2, v1...). Code identifiers,
 *   comments, deploy pages (deploy-*.html, deployer-*.html), contract names and API fields are NOT read here on purpose.
 * ALLOWED (third-party names, not ours): "Uniswap v3/v4", the FlyEM dataset "hemibrain v1.2", SVG path data ("V8" in d="...").
 * POSITIVE WITNESSES: the new plain words are present (the copy was reworded, not just deleted), and today's vault vs the coming one
 *   is still told apart in words ("Today", "coming").
 * NE PROUVE PAS: text built by the server (API fields) or by a module this file does not list; what a browser finally paints.
 */
import { readFileSync } from 'node:fs';

const lire = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const PAGES = ['app.html', 'holders.html', 'index.html', 'frais.html', 'frais-et-risques.html', 'pot.html', 'contest.html', 'fly-brain.html',
  'human-brain.html', 'panel.html', 'terms.html', 'privacy.html', 'reclamer.html', 'block-0.html', 'lien-x.html', 'essai-autonome.html', 'mcp-widget-panneau.html', 'claim.html'];
const MODULES = ['duels-v2-plan.js', 'claim-vue.js', 'contest-vue.js'];

const VER = /(^|[^A-Za-z0-9_.\/-])([Vv][1-9][0-9]?)(?![A-Za-z0-9_])/;
const PERMIS = [/Uniswap v[34]/gi, /hemibrain v1\.2/g, /d="[^"]*"/g, /a token quoted on v2, v3, another/g /* index.html: Uniswap's own v2/v3 */];
const blanc = (m) => m.replace(/[^\n]/g, ' ');
const ligneDe = (src, i) => src.slice(0, i).split('\n').length;
const aVersion = (s) => { let t = s; for (const p of PERMIS) t = t.replace(p, ''); return VER.test(t); };

function visibles(f, src) {
  const out = [];
  if (f.endsWith('.html')) {
    const m0 = src.replace(/<!--[\s\S]*?-->/g, blanc).replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, blanc);
    let m; const re = />([^<]+)</g;
    while ((m = re.exec(m0))) if (aVersion(m[1])) out.push(f + ':' + ligneDe(src, m.index) + ' text ' + m[1].trim().slice(0, 120));
    const ra = /\b(title|placeholder|aria-label|alt|value|data-tip)="([^"]*)"/g;
    while ((m = ra.exec(m0))) if (aVersion(m[2])) out.push(f + ':' + ligneDe(src, m.index) + ' ' + m[1] + ' ' + m[2].slice(0, 120));
  }
  let code = src;
  if (f.endsWith('.html')) {
    let acc = '', last = 0, m; const rx = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    while ((m = rx.exec(src))) { const d = m.index + m[0].indexOf('>') + 1; acc += blanc(src.slice(last, d)) + m[1]; last = d + m[1].length; }
    code = acc + blanc(src.slice(last));
  }
  code = code.replace(/\/\*[\s\S]*?\*\//g, blanc).split('\n').map((l) => { const i = l.search(/(^|\s)\/\/ /); return i >= 0 ? l.slice(0, i) : l; }).join('\n');
  let s; const rs = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
  while ((s = rs.exec(code))) if (/[A-Za-z]{2,}\s+[A-Za-z]/.test(s[0]) && aVersion(s[0])) out.push(f + ':' + ligneDe(src, s.index) + ' string ' + s[0].replace(/\s+/g, ' ').slice(0, 140));
  return out;
}

let ok = 0, ko = 0;
const t = (m, c, detail) => { if (c) { ok++; console.log('  ok  ' + m); } else { ko++; console.log('KO  ' + m + (detail ? '\n      ' + detail : '')); } };

const restes = [];
for (const f of [...PAGES, ...MODULES]) restes.push(...visibles(f, lire(f)));
t('no version name (V8, v2, v1...) in any text a visitor reads (' + PAGES.length + ' pages + ' + MODULES.length + ' module)', restes.length === 0,
  restes.length + ' left:\n      ' + restes.join('\n      '));

/* the scanner must SEE a planted version name, or a green above proves nothing */
t('witness: the scanner catches a planted "open V8 market" and a planted "vault v2"',
  visibles('x.html', "<p>open V8 market</p><script>const a = 'the holders vault v2 is coming';</script>").length === 2
  && visibles('x.html', "<p>Uniswap v4 pool</p><script>const b = 'hemibrain v1.2 data';</script>").length === 0);

const A = lire('app.html'), H = lire('holders.html'), D = lire('duels-v2-plan.js');
t('Instant Birth list item: "0.001 ETH — create + open market" (no "· V8")', A.includes('<li><b>Instant Birth</b>: 0.001 ETH — create + open market</li>'));
t('register step: "Register the market — 0.0003 ETH min"', A.includes("nom: 'Register the market — 0.0003 ETH min (open fee already paid via Create)'"));
/* MERGED 2026-11-12 on game375 + the economy pack: the game375 copy sweep had already reworded these steps ("Open market", "open market
 *   vs") and the pack made the new vault LIVE, so "Today" vs "the coming vault" no longer exists on screen: the vault and lock rows say
 *   what the live contracts do, read on chain. The witnesses pin those words (still: reworded, not just deleted). */
t('open step: "Open market — ..." and "open market vs"', A.includes("'Open market — ' + symQ") && A.includes("'Open market — seed ETH (fee already paid)'") && A.includes("'Instant Birth — open market vs ' + symQ"));
t('wallet vault comment: the live vault in words, never a "coming version"', A.includes(" You must play that week: a heart, a TAM art mint or a skin mint.") && !/coming version|not deployed yet/.test(A));
t('holders page: the live vault and lock rows in words, never a "coming vault"', H.includes("['🔒', 'Lock TBLOCK', ") && H.includes("'Holders vault, every week'") && H.includes("'Monthly lock rewards'") && !/[Cc]oming vault/.test(H));
t('duel refusal in plain words', D.includes("refuse('a joined duel is never refunded: settle it in the window, or the creator wins by default')"));

console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
