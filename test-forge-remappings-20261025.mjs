/* test-forge-remappings-20261025.mjs — LE REMAPPING QUI EST DANS LE HASH DE METADONNEES DES CONTRATS DEPLOYES EST ECRIT DANS LE DEPOT.
 *
 * ⛔ 2026-10-25 (verification Basescan de BlockDuelsV2 et BlockSlots, « Exact Match ») : le hash CBOR de metadonnees ne concorde qu avec
 *   le remapping `forge-std/=lib/forge-std/src/`. contracts/foundry.toml ne le declarait PAS : forge l AUTO-DETECTE parce que
 *   contracts/lib/forge-std existe (une jonction sur la box de Phil). Mesure sur des COPIES de contracts/ (BlockSlots + BlockDuelsV2) :
 *     A. lib/forge-std absent, foundry.toml d avant  -> metadata.settings.remappings = [] ; queue CBOR differente de la chaine pour LES
 *        DEUX, et le code de creation n est plus le prefixe de la fiche (un redeploiement « a l identique » aurait signe autre chose) ;
 *     B. lib/forge-std present + remapping declare  -> queue CBOR = la chaine pour les deux ;
 *     C. lib/forge-std ABSENT + remapping declare   -> queue CBOR = la chaine pour les deux (le build ne depend plus de la jonction).
 *   Aucun de ces contrats n importe forge-std : le remapping n entre QUE dans les reglages hashes, d ou un ecart invisible au code.
 * Ce banc (statique, sans reseau, sans forge) :
 *   1. chaque fiche *-deploiement.js qui porte une creation commence par le bytecode de contracts/out (sinon le remapping lu ne serait
 *      pas celui du code fige) ;
 *   2. les remappings de ces artefacts sont les MEMES pour toutes les fiches, et non vides ;
 *   3. contracts/foundry.toml les declare EXPLICITEMENT, et rien de plus (un remapping de trop entre aussi dans le hash) ;
 *   4. pas de contracts/remappings.txt qui en ajouterait en douce.
 * ⛔ BORNE : ne relit PAS la chaine (fait a la main le 2026-10-25, voir le commit) et ne lance pas forge : il prouve que le depot DIT le
 *   remapping que les artefacts concordants portent, pas qu un build neuf les reproduit. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const bas = (x) => String(x || '').toLowerCase();

const fiches = [];
for (const f of fs.readdirSync(ICI).filter((x) => /^[a-z0-9-]+-deploiement\.js$/.test(x)).sort()) {
  const m = await import(pathToFileURL(path.join(ICI, f)).href);
  for (const D of Object.values(m)) if (D && typeof D.contrat === 'string' && typeof D.creation === 'string') fiches.push({ f, D });
}
ok(fiches.length >= 7, 'il y a ' + fiches.length + ' fiches de deploiement avec une creation (>= 7 attendues)');

/* 2026-11-12: blockskins-deploiement.js is the RETIRED standalone Skins record, frozen from the pre-pack BlockSkins.sol (Skins now ships as
 *   step S of the economy pack). Its creation is no longer the prefix of contracts/out/BlockSkins (the router game) BY DESIGN, so it
 *   cannot witness the remapping; it is checked apart: still frozen (adresse null) and NOT the current artefact. */
const RETIREES = new Set(['blockskins-deploiement.js']);
for (const { f, D } of fiches.filter((x) => RETIREES.has(x.f))) {
  const p = path.join(ICI, 'contracts', 'out', D.contrat + '.sol', D.contrat + '.json');
  const code = fs.existsSync(p) ? bas(JSON.parse(fs.readFileSync(p, 'utf8')).bytecode.object) : '';
  ok(D.adresse === null && /^0x[0-9a-f]{100,}$/.test(code) && !bas(D.creation).startsWith(code), '1 ' + f + ' : retired record, frozen (adresse null) and NOT the current artefact (skipped as a remapping witness)');
}
const vus = new Map();
for (const { f, D } of fiches.filter((x) => !RETIREES.has(x.f))) {
  const p = path.join(ICI, 'contracts', 'out', D.contrat + '.sol', D.contrat + '.json');
  if (!fs.existsSync(p)) { ok(false, f + ' : artefact ' + D.contrat + ' absent (lancer forge build dans contracts/)'); continue; }
  const a = JSON.parse(fs.readFileSync(p, 'utf8'));
  const meta = typeof a.metadata === 'string' ? JSON.parse(a.metadata) : (a.metadata || {});
  const code = bas(a.bytecode && a.bytecode.object);
  ok(/^0x[0-9a-f]{100,}$/.test(code) && bas(D.creation).startsWith(code), '1 ' + f + ' : la creation figee commence par le bytecode de contracts/out/' + D.contrat);
  vus.set(D.contrat, JSON.stringify((meta.settings && meta.settings.remappings) || null));
}
const valeurs = [...new Set(vus.values())];
ok(valeurs.length === 1, '2 un seul jeu de remappings dans les artefacts concordants : ' + valeurs.join(' | '));
const attendus = valeurs.length === 1 ? JSON.parse(valeurs[0]) : null;
ok(Array.isArray(attendus) && attendus.length > 0, '2 ce jeu n est pas vide : ' + JSON.stringify(attendus));

const toml = fs.readFileSync(path.join(ICI, 'contracts', 'foundry.toml'), 'utf8').replace(/\r\n/g, '\n');
const defaut = (toml.split(/^\[/m).find((s) => s.startsWith('profile.default]')) || '');
const ligne = /^remappings\s*=\s*\[([^\]]*)\]/m.exec(defaut);
const declares = ligne ? [...ligne[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]) : null;
ok(declares !== null, '3 contracts/foundry.toml [profile.default] declare `remappings = [...]` (sinon forge les devine depuis lib/)');
ok(declares !== null && attendus && JSON.stringify([...declares].sort()) === JSON.stringify([...attendus].sort()),
  '3 et ce sont EXACTEMENT ceux des artefacts deployes : ' + JSON.stringify(declares) + ' = ' + JSON.stringify(attendus));
ok(!fs.existsSync(path.join(ICI, 'contracts', 'remappings.txt')), '4 pas de contracts/remappings.txt (il ajouterait des remappings au hash)');

console.log((ko ? 'ROUGE' : 'VERT') + ' ' + (n - ko) + '/' + n);
process.exit(ko ? 1 : 0);
