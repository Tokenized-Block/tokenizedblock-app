/* test-copy-sans-jargon-375-20261112.mjs — UI copy rule (Phil 2026-11-12): what a visitor reads never carries an internal status or a
 *   version word ("not deployed", "under review", "fork test", "written, ...", "prepared but not signed", v2 / V2 / V8 ...). Something not
 *   live is hidden or says "Coming soon" with what it does. Real third-party product names stay ("Uniswap v3", "Uniswap v4").
 * WHAT IS SCANNED (comments removed, identifiers not read — only text a visitor can be shown):
 *   - holders.html, app.html, deployer-economie-v2.html: the static text nodes (scripts, styles, comments removed) AND every string
 *     literal of their scripts that reads as a phrase (two words or more), HTML inside a literal stripped of its tags;
 *   - the modules whose messages these pages print: pack-economie-v2.js, economie / coeurs / points / lock view modules, the TAM,
 *     Games, Create and holders modules listed in MODULES (refusal reasons, button labels, notes) — phrase literals, comments removed;
 *   - serveur-web.js: only the reasons it hands to the page (pourquoi: / why: / erreur: literals).
 * WITNESSES: each file must yield a minimum number of phrases AND a phrase known to be on screen, or a scan of nothing would pass; the
 *   line Phil flagged, put back into a copy of holders.html, must turn the scan red (the scan sees that kind of text).
 * RED ON AN OLDER TREE: COPY375_RACINE=<dir> reads the files from another tree (e.g. an export of HEAD) instead of this one.
 * NE PROUVE PAS: text built only at run time from data (a block name, an API field) — test-copy-pack-375-20261112.mjs renders holders and
 *   the pack page against a stub DOM for that; nor a style judgement (a clumsy but honest sentence passes). */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = process.env.COPY375_RACINE ? path.resolve(process.env.COPY375_RACINE) : ICI;
const lire = (f) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
let ok = 0, ko = 0;
const t = (m, c, x = '') => { if (c) { ok++; console.log('ok', m); } else { ko++; console.log('KO', m, x); } };

/* the banned words. "written" alone is plain English ("written on chain", "Message written by the meeting"); it is banned only as a
 *   status ("written, under review", "written but", "written and tested"). A version tag is banned alone (v2, V8) or glued to a name
 *   (BlockLikesV2), except after a real third-party product name (Uniswap v3 / v4). */
const BAN = new RegExp([
  'not deployed', 'deployed yet', 'under review', 'in review', '\\breviewed\\b', 'fork[- ]?test', 'prepared but not signed',
  '\\bwritten(?:,| and (?:under|reviewed|tested)| but\\b)', 'to deploy\\b', 'not live yet', 'next version',
  '(?<!Uniswap )(?:\\b|(?<=[a-z]))[vV]\\d+(?![\\d.])',
].join('|'));
const fautes = (xs) => xs.filter((s) => BAN.test(s)).map((s) => '« ' + (s.match(new RegExp('.{0,60}(?:' + BAN.source + ').{0,40}')) || [s])[0] + ' »');

t('witness: the flagged line is caught, word by word', ['Vault v2: more from $100 locked', 'written, under review and fork test — not deployed',
  'Register on V8 — 0.0003 ETH min', 'TamArt is not deployed yet', 'prepared but not signed', 'BlockLikesV2 hearts'].every((s) => BAN.test(s)));
t('witness: plain copy and real product names pass', !['Coming soon — the holders vault: $15 locked to claim', 'Buys from Uniswap v4 swap logs',
  'a Uniswap v3 pool', 'The link is written on chain', 'Message written by the meeting — check it'].some((s) => BAN.test(s)));

const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const lignes = (html) => decode(String(html).replace(/<[^>]*>/g, '\n')).split(/\n+/).map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => /[A-Za-z]/.test(s));
/* a phrase = two words apart by a space; a storage key, a module path or a cache tag ("tblock-official-v1") is one token, not read */
const phrase = (s) => /[A-Za-z]{2,}[,.:;!?)]?\s+[(«"']?[A-Za-z]{2,}/.test(s);

/** removes block comments and whole-line // comments, then trailing // comments (not inside a URL: "https://" is preceded by ':') */
function nu(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').filter((l) => !/^\s*\/\//.test(l))
    .map((l) => l.replace(/(^|[\s;{}(),])\/\/(?!\/).*$/, '$1')).join('\n');
}
/** the phrase literals of a piece of code ('…', "…", `…` with ${…} cut out), HTML inside a literal reduced to its text */
function litteraux(code) {
  const out = [];
  for (const m of nu(code).matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
    const brut = (m[1] ?? m[2] ?? m[3]).replace(/\$\{[^}]*\}/g, ' ').replace(/\\(['"`\\])/g, '$1').replace(/\\n/g, '\n');
    for (const l of lignes(brut)) if (phrase(l)) out.push(l);
  }
  return out;
}
/** an HTML page: its static text nodes, plus the phrase literals of its scripts */
function page(src) {
  const sansCom = src.replace(/<!--[\s\S]*?-->/g, ' ');
  const statique = lignes(sansCom.replace(/<script[\s\S]*?<\/script>/g, '\n').replace(/<style[\s\S]*?<\/style>/g, '\n'));
  const scripts = [...sansCom.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].flatMap((m) => litteraux(m[1]));
  return { statique, scripts, tout: [...statique, ...scripts] };
}

/* ======== the pages ======== */
const PAGES = [
  /* file, minimum phrases, a phrase that is on screen (witness) */
  ['holders.html', 40, 'What your TBLOCK unlocks'],
  ['app.html', 3000, 'Instant Birth'],
  ['deployer-economie-v2.html', 30, 'Deploy the holders economy (Base)'],
];
for (const [f, min, temoin] of PAGES) {
  const p = page(lire(f));
  t(f + ': the scan reads its text (witness: ' + p.statique.length + ' text nodes, ' + p.scripts.length + ' script phrases)',
    p.tout.length >= min && p.tout.some((s) => s.includes(temoin)), p.tout.length);
  const fa = fautes(p.tout);
  t(f + ': no status or version word in what a visitor reads', fa.length === 0, fa.length + ' — ' + fa.slice(0, 12).join(' '));
}
/* the coming vault is announced, not hidden behind a status */
{
  const h = page(lire('holders.html')).tout;
  t('holders: the coming vault says "Coming soon" and what it does', h.some((s) => s.includes('Coming soon — the holders vault'))
    && h.some((s) => s.includes('$15 locked to claim; more from $100 locked (+15% at $100, +30% at $500, +50% at $1,000); up to +25% more for 90 days locked; you must play that week (a heart, a TAM mint or a skin)')));
}
/* the scan sees the kind of text Phil flagged: put his line back into a copy of holders.html, the scan turns red */
{
  const H = lire('holders.html');
  const ancre = "['🏦', 'Coming soon — the holders vault', ";
  const i = H.indexOf(ancre);
  const mutant = i < 0 ? H.replace('</body>', "<script>const x = ['Vault v2: more from $100 locked', 'written, under review and fork test — not deployed'];</script></body>")
    : H.slice(0, i) + "['🏦', 'Vault v2: more from $100 locked', 'written, under review and fork test — not deployed', " + H.slice(i + ancre.length);
  t('witness: the flagged line put back into holders.html is caught by the scan', fautes(page(mutant).tout).length >= 1);
}

/* ======== the modules whose messages these pages print ======== */
const MODULES = [
  'pack-economie-v2.js', 'economie.js', 'economie-v2-pack-deploiement.js', 'coeurs.js', 'coeurs-vue.js', 'coeurs-index.js', 'points.js',
  'points-vue.js', 'lock.js', 'lock-evenements.js', 'locker.js', 'tblock-hold.js', 'tblock-hold-regle.js', 'create-vault-tip.js',
  'skins.js', 'skins-marche.js', 'blockskins.js', 'blockskins-actif.js', 'tam-onglet.js', 'tam-plan.js', 'tam-vue.js', 'tam-serveur.js',
  'rolls-jeu.js', 'rolls-regles.js', 'rolls-en-action.js', 'slots-plan.js', 'duels-v2-plan.js', 'duels-plan-app.js', 'jeu-agent.js',
  'missions-attestation.js', 'missions-lecture.js', 'ticketpot-attestation.js', 'carte-naissance.js', 'etat-naissance.js',
];
{
  let n = 0;
  const toutes = [], absents = MODULES.filter((f) => !existsSync(path.join(RACINE, f)));
  /* on this tree every module must be there; an older tree (COPY375_RACINE) may predate one, it is then named and skipped */
  t('modules: all present on this tree', RACINE !== ICI || absents.length === 0, absents.join(' '));
  if (absents.length) console.log('(absent from ' + RACINE + ': ' + absents.join(' ') + ')');
  for (const f of MODULES.filter((x) => !absents.includes(x))) {
    const xs = litteraux(lire(f));
    n += xs.length;
    for (const s of fautes(xs)) toutes.push(f + ' ' + s);
  }
  t('modules: the scan reads their messages (witness: ' + n + ' phrases, the holders vault reason among them)',
    n >= 500 && litteraux(lire('create-vault-tip.js')).some((s) => /holders vault/.test(s)) && litteraux(lire('lock.js')).some((s) => /TBLOCK lock/.test(s)), n);
  t('modules: no status or version word in their messages', toutes.length === 0, toutes.length + ' — ' + toutes.slice(0, 14).join(' | '));
}

/* ======== serveur-web.js: the reasons it hands to the page ======== */
{
  const raisons = [...nu(lire('serveur-web.js')).matchAll(/\b(?:pourquoi|why|erreur):\s*'((?:[^'\\\n]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'")).filter(phrase);
  t('server reasons read (witness: ' + raisons.length + ', the holders vault reason among them)', raisons.length >= 50 && raisons.some((s) => /holders vault/.test(s)), raisons.length);
  const fa = fautes(raisons);
  t('server reasons: no status or version word', fa.length === 0, fa.length + ' — ' + fa.slice(0, 12).join(' '));
}

console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green') + (RACINE !== ICI ? ' (tree: ' + RACINE + ')' : ''));
process.exit(ko ? 1 : 0);
