/* test-frais-routes-fond-20261009.mjs — /api/frais-hook et /api/frais-recents NE REPONDAIENT JAMAIS EN PROD.
 *
 * Mesure du 2026-10-09 : les deux routes coupees a 60 s. Elles attendaient un balayage entier (frais-hook : ~1 520 fenetres de
 * getLogs depuis le bloc 50861088, a froid a chaque deploiement) pendant que base.org refusait tout getLogs et que publicnode
 * refusait l archive.
 * Les gardes :
 *   A. `enFond` / `repondreFond` EXECUTES (extraits du source servi) : reponse en ~2,5 s au plus, un seul calcul en vol, le dernier
 *      resultat servi AVEC son age, une erreur DITE et qui ne remplace jamais un resultat ;
 *   B. les deux routes passent par eux ; drpc (archive mesuree) est le 2e repli des getLogs du serveur ;
 *   C. le balayage des frais survit a un redemarrage (fichier sur le volume, relu au demarrage, sauve en cours de route).
 * ⛔ BORNE : le serveur ne demarre pas ici ; la prod est mesuree a part apres deploiement. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const i = src.indexOf('const calculsFond = new Map();');
const j = src.indexOf('async function fraisRecents(heures) {');
assert.ok(i > 0 && j > i, 'bloc enFond/repondreFond introuvable');
const { enFond, repondreFond } = new Function(src.slice(i, j) + '\n; return { enFond, repondreFond };')();

let n = 0;
const cas = async (titre, f) => { n++; try { await f(); } catch (e) { console.error('✗ ' + titre); throw e; } };
const faux = () => { const r = { code: null, corps: null }; return { r, res: { writeHead: (c) => { r.code = c; }, end: (b) => { r.corps = JSON.parse(b); } } }; };
const dort = (ms) => new Promise((ok) => setTimeout(ok, ms));

await cas('A1 un calcul long : EN_COURS en moins de 3 s, avec la progression', async () => {
  const { r, res } = faux();
  const c = enFond('long', () => dort(4000).then(() => ({ ok: true, x: 1 })), 1000);
  const t0 = Date.now();
  await repondreFond(res, c, () => ({ balayeJusqua: 42 }));
  assert.ok(Date.now() - t0 < 3000, 'la route a tenu la requete ' + (Date.now() - t0) + ' ms');
  assert.equal(r.code, 200);
  assert.equal(r.corps.etat, 'EN_COURS');
  assert.equal(r.corps.balayeJusqua, 42);
  assert.equal(r.corps.ok, false, 'EN_COURS n est pas un resultat');
});
await cas('A2 un seul calcul en vol par cle', async () => {
  let appels = 0;
  const f = () => { appels++; return dort(300).then(() => ({ ok: true })); };
  enFond('unique', f, 1000); enFond('unique', f, 1000); enFond('unique', f, 1000);
  await dort(10); /* le calcul part au tour suivant (Promise.resolve().then) : une exception synchrone ne casse pas la route */
  assert.equal(appels, 1);
});
await cas('A3 un calcul court repond dans la meme requete, avec son age', async () => {
  const { r, res } = faux();
  const c = enFond('court', () => dort(50).then(() => ({ ok: true, lignes: [1] })), 60000);
  await repondreFond(res, c);
  assert.equal(r.corps.ok, true);
  assert.deepEqual(r.corps.lignes, [1]);
  assert.equal(typeof r.corps.ageS, 'number');
});
await cas('A4 une erreur sans resultat : ECHEC et sa raison, jamais une liste vide', async () => {
  const { r, res } = faux();
  const c = enFond('ko', () => Promise.reject(new Error('request limit reached')), 1000);
  await repondreFond(res, c);
  assert.equal(r.corps.etat, 'ECHEC');
  assert.match(r.corps.pourquoi, /request limit reached/);
  assert.equal(r.corps.lignes, undefined);
});
await cas('A5 une erreur APRES un resultat : le resultat reste, l erreur est dite a cote', async () => {
  let fois = 0;
  const f = () => (++fois === 1 ? Promise.resolve({ ok: true, lignes: ['a'] }) : Promise.reject(new Error('403 archive')));
  const c = enFond('mixte', f, 0);
  await c.enVol;
  await dort(5);
  enFond('mixte', f, 0);
  const { r, res } = faux();
  await repondreFond(res, c);
  assert.deepEqual(r.corps.lignes, ['a']);
  assert.match(r.corps.derniereErreur, /403 archive/);
});

const nu = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
await cas('B1 les deux routes passent par le calcul en fond', async () => {
  assert.match(nu, /if \(chemin === '\/api\/frais-hook'\) \{\s+const c = enFond\('frais-hook', \(\) => fraisEnAttente\(\), 120000\);\s+void repondreFond\(res, c,/);
  assert.match(nu, /const c = enFond\('frais-recents:' \+ heures, \(\) => fraisRecents\(heures\), 300000\);\s+void repondreFond\(res, c,/);
  assert.ok(!/fraisEnAttente\(\)\.then\(/.test(nu) && !/fraisRecents\(heures\)\.then\(/.test(nu) && !/await fraisEnAttente\(\)/.test(nu), 'une route attend encore le balayage entier');
  /* le 3e appelant (parts createur) partage le meme calcul et dit EN_COURS tant que rien n a abouti */
  assert.match(nu, /if \(chemin === '\/api\/parts-createur'\) \{[\s\S]{0,400}const fond = enFond\('frais-hook', \(\) => fraisEnAttente\(\), 120000\);/);
  assert.match(nu, /if \(!fond\.r\) \{ repondre\(\{ ok: false, etat: fond\.enVol \? 'EN_COURS' : 'ECHEC'/);
});
await cas('B1b /api/frais-recents ARRONDIT h (execute) : une valeur fractionnaire ne cree plus une cle de cache de plus', async () => {
  const m = /const heures = (Math\.min\(168, [^;]+\));/.exec(nu.slice(nu.indexOf("if (chemin === '/api/frais-recents') {")));
  assert.ok(m, 'calcul de heures introuvable dans la route');
  const heures = (h) => new Function('req', 'return ' + m[1] + ';')({ url: '/api/frais-recents' + (h === null ? '' : '?h=' + h) });
  const cles = new Set(['24.001', '24.002', '24.4', '23.6', '1.0001', '167.9', '500', '-3', 'abc', '0', null].map(heures));
  assert.deepEqual([...cles].sort((a, b) => a - b), [1, 24, 168], 'cles obtenues : ' + [...cles].join(','));
  assert.ok([...cles].every((h) => Number.isInteger(h)), 'une cle non entiere');
});
await cas('B2 aucun repli qui ne sert pas nos fenetres : drpc gratuit (10 blocs max, mesure) n y est pas', async () => {
  assert.match(nu, /const REPLIS_LOGS_SERVEUR = ESSAI_SRV\.actif \|\| REPLIS_PUBLICS_COUPES \? \[\] : \['https:\/\/base-rpc\.publicnode\.com'\];/);
});
await cas('C1 le balayage des frais est relu au demarrage et sauve pendant et apres', async () => {
  assert.match(nu, /join\(process\.env\.RAILWAY_VOLUME_MOUNT_PATH \|\| '\/data', 'frais-scan\.json'\)/);
  assert.match(nu, /if \(Number\.isSafeInteger\(s\.jusqua\) && Array\.isArray\(s\.devises\) && Array\.isArray\(s\.pools\)\)/);
  const k = nu.indexOf('async function fraisEnAttente() {');
  const corps = nu.slice(k, nu.indexOf('const r = { ok: true, lu:', k));
  assert.ok((corps.match(/sauverFraisScan\(\)/g) || []).length === 2, 'sauvegarde en cours de route ET a la fin');
});
await cas('C2 sans noeud d archive : arret apres 20 refus de suite, DIT ; creances USDC/TBLOCK lues quand meme ; complet faux', async () => {
  const k = nu.indexOf('async function fraisEnAttente() {');
  const corps = nu.slice(k, nu.indexOf('fraisCache = { t: Date.now(), r };', k));
  assert.match(corps, /if \(refusDeSuite >= 20\) \{ arret = /);
  assert.match(corps, /\} catch \{ fenetresRatees\+\+; avance = false; refusDeSuite\+\+; \}/);
  assert.match(corps, /refusDeSuite = 0;/);
  /* game354: the seed reads the token our LEGACY hooks are paired with — the old test token, named for what it is */
  assert.match(corps, /const amorce = \[USDC_BASE\.toLowerCase\(\), String\(TBLOCK_TEST_ANCIEN\)\.toLowerCase\(\)\];/);
  assert.match(corps, /for \(const d of new Set\(\[\.\.\.devises\.get\(h\.adr\), \.\.\.amorce\]\)\)/);
  assert.match(corps, /const balayageComplet = fenetresRatees === 0 && !arret && fraisScan\.jusqua === tete;/);
  assert.match(corps, /complet: balayageComplet && creancesNonLues\.length === 0/);
  /* une creance non lue est NOMMEE, pas comptee comme une fenetre (mesure prod : 13 « fenetres ratees » sur un balayage complet) */
  assert.match(corps, /creancesNonLues\.push\(\{ hook: h\.nom, devise: d, pourquoi:/);
  /* V1 n a pas de du() (bytecode lu) : saute et NOMME, jamais compte comme non lu */
  assert.match(nu, /\{ nom: 'V1', adr: '0xaa6d7bd9fc7d394bc717137936f2939834382044', depuis: 50861088, sansDu: true \}/);
  assert.match(corps, /if \(h\.sansDu\) continue;/);
  assert.ok(!/sansDu: true/.test(nu.replace(/\{ nom: 'V1'[^}]*\}/, '')), 'un autre hook est marque sansDu sans mesure');
  /* un refus de debit est relance (2 fois) ; un revert ne l est pas */
  assert.match(corps, /if \(essai >= 2 \|\| !\/rate limit\|temporarily unavailable\|429\|503\/i\.test\(/);
  assert.ok(!/\} catch \{ fenetresRatees\+\+; \}\s+\}\s+\}\s+\/\*/.test(corps), 'un du() rate est encore compte comme fenetre');
  assert.ok(!/devises\.get\([^)]*\)\.add\(amorce|devises\.get\(h\.adr\)\.add\(d\)/.test(corps), 'l amorce est ecrite dans le resultat du balayage');
});

console.log('✓ ' + n + ' cas — les routes de frais repondent vite et disent ce qu elles n ont pas lu');
