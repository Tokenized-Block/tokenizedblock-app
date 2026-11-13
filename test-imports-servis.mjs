// test-imports-servis.mjs — CHAQUE MODULE IMPORTE PAR UNE PAGE EST-IL REELLEMENT SERVI ?
//
// ⛔⛔ LE DEFAUT QUE CE FICHIER EMPECHE : une page qui importe un module absent de la liste servie
//    est MORTE en production — le navigateur echoue sur l import et PLUS RIEN ne s execute. Et tout
//    reste vert ici : la syntaxe passe, les tests passent, le HTTP rend 200 sur la page elle-meme.
//    C est exactement le motif deja paye : « le site etait mort en prod et toutes les gardes
//    mesuraient le transport, aucune ne demandait si le JS s execute ».
//
// ⛔ CE QUE CE TEST NE PROUVE PAS : que la page fonctionne. Il prouve que ses imports sont
//    ATTEIGNABLES. Une page peut etre servie, ses modules aussi, et planter pour une autre raison.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

/* ⛔ LA LISTE SERVIE EST LUE DANS LE SERVEUR, pas recopiee : une copie divergerait en silence. */
const serveur = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
/* ⛔ LE NOM EXACT EST `SERVIS`. Mon premier motif cherchait `FICHIERS` et ne trouvait rien : la
 *    liste sortait VIDE, et sans le temoin « app.html est dedans » ce fichier aurait annonce
 *    « 0 module manquant » en n ayant rien regarde. Un test qui ne trouve pas sa source doit
 *    ECHOUER, jamais rendre un vert vide. */
const bloc = serveur.match(/const SERVIS\s*=\s*\[([\s\S]*?)\];/);
ok(!!bloc, 'la liste des fichiers servis a ete trouvee dans serveur-web.js');
const servis = new Set([...bloc[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
ok(servis.size > 20, 'la liste servie contient ' + servis.size + ' entrees — pas une capture vide');
ok(servis.has('app.html'), 'temoin : app.html est bien dans la liste lue');

/* les pages dont on suit les imports */
const PAGES = ['pot.html', 'reclamer.html', 'app.html', 'deploy-v6.html', 'deploy-pot.html', 'frais-et-risques.html', 'essai-autonome.html',
  /* 2026-11-12: the six-step pack deploy page (imports pack-economie-v2.js -> keccak.js, and the record economie-v2-pack-deploiement.js) */
  'deployer-economie-v2.html',
  /* 2026-11-12: the ONE-signature deploy page of the TBLOCK buyback that pays the holders vault (buyback-vault.js -> pack-economie-v2.js,
   *   keccak.js, the two pack records; and its record tblock-buyback-vault-deploiement.js) */
  'deployer-tblock-buyback-vault.html',
  /* game401: the weekly lock rewards deploy page (lock-weekly.js -> the same imports) */
  'deployer-lock-weekly.html',
  /* game386: the claim page (claim-vue.js -> economie-pack.js, lock.js, create-vault-tip.js, frais-creation.js; envoi.js; holders-vue.js) */
  'claim.html',
  /* game386 task B: the block contest page (block-contest.js, contest-vue.js -> caution-createur.js, hook-7030-descripteur.js, keccak.js; economie-pack.js;
   *   frais-creation.js; groupe-wallet.js) */
  'contest.html',
  /* 2026-11-12 (Phil): the 1 USDC Skins and the new Spin deploy page (imports skins-spin.js -> keccak.js, pack-economie-v2.js, slots-config.js,
   * economie-v2-pack-deploye.js, and the record skins-spin-deploiement.js); holders.html imports economie-pack.js -> skins-spin.js too */
  'deployer-skins-spin.html', 'holders.html'];
const vus = new Set();
const manquants = [];
let arcs = 0;

function importsDe(texte) {
  const l = [];
  /* import ... from './x.js'  ·  import './x.js'  ·  await import('./x.js') */
  for (const m of texte.matchAll(/(?:^|\s)import\s+(?:[^'";]*?from\s*)?['"](\.\/[^'"]+)['"]/g)) l.push(m[1]);
  for (const m of texte.matchAll(/import\s*\(\s*['"](\.\/[^'"]+)['"]\s*\)/g)) l.push(m[1]);
  return l;
}

function suivre(fichier, depuis) {
  const nom = fichier.replace(/^\.\//, '');
  arcs++;
  if (!servis.has(nom)) {
    manquants.push(nom + '  (importe par ' + depuis + ')');
    return;
  }
  if (vus.has(nom)) return;
  vus.add(nom);
  let texte;
  try { texte = readFileSync(new URL('./' + nom, import.meta.url), 'utf8'); }
  catch { manquants.push(nom + '  (dans la liste servie mais ABSENT du disque, importe par ' + depuis + ')'); return; }
  for (const i of importsDe(texte)) suivre(i, nom);
}

for (const page of PAGES) {
  ok(servis.has(page), page + ' est servie');
  const texte = readFileSync(new URL('./' + page, import.meta.url), 'utf8');
  const imports = importsDe(texte);
  ok(imports.length >= 0, page + ' : ' + imports.length + ' import(s) directs');
  for (const i of imports) suivre(i, page);
}

/* 2026-10-24 : les modules SERVIS qu aucune page n importe encore (la carte qui les branchera est en chantier ailleurs) — leur chaine
 *   d imports est suivie quand meme : le jour ou une page les importe, rien ne doit manquer. */
const MODULES_SANS_PAGE = ['misables.js'];
for (const m of MODULES_SANS_PAGE) { ok(servis.has(m), m + ' est servi'); suivre('./' + m, 'module servi sans page'); }

/* ⛔ LE TEMOIN NEGATIF, SANS LUI CE FICHIER NE PROUVE RIEN : un module invente doit etre signale. */
const avant = manquants.length;
suivre('./ce-module-n-existe-pas.js', 'temoin');
ok(manquants.length === avant + 1, 'temoin : un module absent de la liste EST signale');
manquants.pop();

ok(arcs > 20, arcs + ' arcs d import suivis — la marche a vraiment eu lieu');
if (manquants.length) {
  console.log('⛔ MODULES IMPORTES MAIS NON SERVIS :');
  for (const m of manquants) console.log('   ' + m);
}
assert.equal(manquants.length, 0, manquants.length + ' module(s) importe(s) mais non servi(s) — la page serait MORTE en prod');
n++;

console.log('test-imports-servis : ' + n + ' assertions, ' + vus.size + ' modules atteints, ' + arcs + ' arcs, OK');
