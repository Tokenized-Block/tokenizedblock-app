// test-tam-science-20261101.mjs — game76 : le MINT des sciences avec TamArt v1 (tam-science.js).
// Ce que ce banc PROUVE : les 20 sciences se rejouent aux memes octets ; ces octets ont l en-tete que TamArt#mint exige ('T' 'A' 'M', v1,
//   q dans 1..16, nuage 0/1) et le decodeur du moteur les relit aux memes points ; un params non borne, une cle inconnue, un q ou des
//   angles faux sont REFUSES ; une oeuvre trop proche d une oeuvre mintee est DOUBLON ; une signature illisible -> NON_LU ; le serveur
//   route une science vers certifierScience ; l onglet rejoue une science avec rejouerScience avant de signer.
// Ce qu il NE prouve PAS : un mint reel sur Base (il faut un wallet), ni le rendu du SVG on-chain d une science (meme format : non mesure).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as T from './tam-science.js';
import { decoder, signature, canon } from './tam-moteur.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const ICI = path.dirname(fileURLToPath(import.meta.url));
const MOI = '0x' + 'ab'.repeat(20);

/* 1. TOUTES les sciences (game78 : 7 modules — physique, sciences, fluides, astres, cosmos, invisible, quantique) : rejeu, en-tete, decodage, tailles */
{ const parModule = [['tam-physique.js', 7], ['tam-sciences.js', 9], ['tam-fluides.js', 4], ['tam-astro.js', 6], ['tam-cosmos.js', 11], ['tam-invisible.js', 10], ['tam-quantique.js', 8], ['tam-fusion.js', 1], ['tam-grandes-questions.js', 9], ['tam-grandes-questions-2.js', 7], ['tam-champs-quantiques.js', 9], ['tam-vide-quantique.js', 4], ['tam-theories-2.js', 6], ['tam-theories-3.js', 6], ['tam-biologie.js', 10], ['tam-chimie.js', 10], ['tam-maths.js', 155], ['tam-ondes.js', 4], ['tam-electricite.js', 2], ['tam-mecanique.js', 22]];
  let attendu = 0; for (const [f, min] of parModule) { const m = await import('./' + f); ok(m.SYSTEMES.length >= min, f + ' : au moins ' + min + ' systemes (' + m.SYSTEMES.length + ')'); attendu += m.SYSTEMES.length; }
  ok(T.SYSTEMES.length === attendu && new Set(T.SYSTEMES.map((s) => s.id)).size === attendu, 'tam-science rassemble les ' + attendu + ' systemes, sans doublon d id'); }
for (const s of T.SYSTEMES) {
  const P = T.paramsScience(s.id, {}, { minteur: MOI });
  const a = T.rejouerScience(JSON.parse(JSON.stringify(P))), b = T.rejouerScience(P);
  ok(a.ok && b.ok && a.hash === b.hash, s.id + ' : deux rejeux, memes octets');
  const o = a.octets;
  ok(o[0] === 0x54 && o[1] === 0x41 && o[2] === 0x4d && o[3] === 1 && o[4] >= 1 && o[4] <= 16 && o[5] <= 1, s.id + ' : en-tete accepte par TamArt#mint');
  ok(o.length >= 7 && o.length <= 16384 && JSON.stringify(P).length <= 4096, s.id + ' : ' + o.length + ' octets <= MAX_DATA, params <= MAX_PARAMS');
  const d = decoder(o), g = T.genererScience(P);
  ok(d.n === g.n && d.points.every((v, i) => v === g.points[i]) && d.ordre === (g.nuage ? 1 : 0), s.id + ' : le decodeur du moteur relit les memes points');
  ok(T.certifierScience(P, []).ok, s.id + ' : certificat local (aucune oeuvre mintee)');
}
/* 1b. game78 : la vue « corps » — chaque corps dans le MEME espace (le systeme solaire 12-D n est plus une projection melangee) */
{ const o = (await import('./tam-astro.js')).simuler('systemeSolaire', {}), v = T.vueCorps(o, 3);
  ok(v.corps === 4 && v.par === Math.floor(o.n / 4) && v.vue.length === o.n * 3, 'systeme solaire : 4 corps, n/4 echantillons chacun');
  /* le temoin physique : chaque planete reste a distance ~constante de l origine (le Soleil) — rapport max/min de son rayon < 1.6 (Mercure e = 0.206) */
  for (let b = 0; b < 4; b++) { let lo = Infinity, hi = 0; for (let j = 0; j < v.par; j++) { const p = (b * v.par + j) * 3, dx = v.vue[p] - v.origine[0], dy = v.vue[p + 1] - v.origine[1], dz = v.vue[p + 2] - v.origine[2], r = Math.sqrt(dx * dx + dy * dy + dz * dz); if (r < lo) lo = r; if (r > hi) hi = r; }
    ok(hi / lo < 1.6, 'planete ' + b + ' : orbite autour du Soleil (r max / r min = ' + (hi / lo).toFixed(3) + ')'); }
  ok(T.CENTRE.systemeSolaire === 'Sun' && Object.keys(T.CORPS).every((id) => T.systeme(id)), 'chaque systeme « corps » existe ; le Soleil est le centre du systeme solaire');
  const P = T.paramsScience('systemeSolaire', {}), g = T.genererScience(P), M = 4095;
  ok(g.points.every((x, i) => Math.abs(x - Math.round((v.vue[i] + 1) / 2 * M)) <= 1), 'les octets mintes portent la MEME vue « corps » que l ecran'); }
/* 1c. game79 : le cerveau choisit parmi TOUTES les sciences, melange parfois un motif, et ECRIT une note (stockee avec l oeuvre) */
{ const { keccak256Hex: kh } = await import('./keccak.js');
  const vus = new Set(); let melanges = 0, ok40 = 0;
  for (let i = 0; i < 24; i++) {
    const g = kh(new TextEncoder().encode('banc-choix-' + i)), r = T.choisirScience({ graine: g, etatCerveau: { t: i }, minteur: MOI });
    if (!r.ok) continue; ok40++; vus.add(r.params.science); if (r.params.melange) melanges++;
    const r2 = T.choisirScience({ graine: g, etatCerveau: { t: i }, minteur: MOI });
    if (i < 3) ok(canon(r.params) === canon(r2.params), 'choix ' + i + ' : memes entrees, meme oeuvre (' + r.params.science + ')');
    const note = T.noteCerveau(r.params, { nomCerveau: 'UNIT', humeur: 'calm', ressenti: 'steady', battement: 24 }), P = { ...r.params, note };
    ok(note.length > 40 && note.length <= T.NOTE_MAX && /chose /.test(note) && /Conclusion: /.test(note), 'choix ' + i + ' : une note avec un choix et une conclusion');
    ok(T.validerScience(P).ok && T.rejouerScience(P).hash === T.rejouerScience(r.params).hash && JSON.stringify(P).length <= 4096, 'choix ' + i + ' : la note est valide, ne change PAS les octets, tient dans MAX_PARAMS');
  }
  ok(ok40 >= 20 && vus.size >= 12, 'le cerveau tire des sciences variees : ' + ok40 + '/24 certifiees, ' + vus.size + ' systemes differents');
  ok(melanges >= 3, 'des melanges de types differents (science x motif) : ' + melanges);
  const Pm = { ...T.paramsScience('bloch', {}), melange: { operateur: 'somme', motif: { famille: 'phyllotaxie', torsion: 0.5 }, w: 0.3 } };
  ok(T.validerScience(Pm).ok && T.rejouerScience(Pm).hash !== T.rejouerScience(T.paramsScience('bloch', {})).hash, 'un melange change l oeuvre et se rejoue');
  ok(!T.validerScience({ ...Pm, melange: { ...Pm.melange, motif: { famille: 'phyllotaxie', torsion: 0.7 } } }).ok, 'un motif retouche (hors defaut) est refuse');
  ok(!T.validerScience({ ...Pm, note: 'x'.repeat(T.NOTE_MAX + 1) }).ok && !T.validerScience({ ...Pm, note: '<script>' + String.fromCharCode(0) }).ok, 'note trop longue ou caracteres interdits : refusee'); }
/* 1d. revue game79 : jamais de melange sur un systeme a plusieurs corps ; la note n invente pas d identifiant ; la fusion bornee */
ok(!T.validerScience({ ...T.paramsScience('systemeSolaire', {}), melange: { operateur: 'somme', motif: { famille: 'phyllotaxie', torsion: 0.5 }, w: 0.3 } }).ok, 'melange refuse sur un systeme a plusieurs corps');
{ const { keccak256Hex: kh } = await import('./keccak.js'); let corpsMel = 0;
  for (let i = 0; i < 60; i++) { const r = T.choisirScience({ graine: kh(new TextEncoder().encode('rev79-' + i)), etatCerveau: { r: i } }); if (r.ok && r.params.melange && T.CORPS[r.params.science]) corpsMel++; }
  ok(corpsMel === 0, 'le cerveau ne melange jamais un systeme a plusieurs corps (60 tirages)'); }
{ const n = T.noteCerveau(T.paramsScience('bloch', {}), { nomCerveau: '0xb200' + '…' + 'bbe3' }); ok(n.includes('0xb200...bbe3') && !/0xb200bbe3/.test(n), 'note : l adresse courte garde « ... » (jamais un faux identifiant colle)'); }
ok(T.validerScience(T.paramsScience('fusionTrousNoirs', {})).ok && !T.validerScience(T.paramsScience('fusionTrousNoirs', { m1: 5, m2: 5, fDepart: 10, z: 0 })).ok, 'fusion : GW150914 certifiable ; le coin couteux (5+5, 10 Hz) refuse AVANT simulation');
/* 1e. game80 : gardes de COUT avant simulation (route publique) — defaut certifiable, coin couteux refuse */
for (const [id, cher] of [['paquetOscillateur', { periodes: 20 }], ['amasEtoiles', { etoiles: 60, duree: 12 }], ['systemeSolaire', { groupe: 0, annees: 400 }]]) {
  ok(T.validerScience(T.paramsScience(id, {})).ok, id + ' : le reglage par defaut reste certifiable');
  ok(!T.validerScience(T.paramsScience(id, cher)).ok, id + ' : le coin couteux ' + JSON.stringify(cher) + ' est refuse AVANT simulation');
}
/* game82 : 1 simulation par certificat (3 avant) -> limites re-mesurees ; les deux bords de chaque nouvelle limite */
ok(T.validerScience(T.paramsScience('paquetOscillateur', { periodes: 16 })).ok && !T.validerScience(T.paramsScience('paquetOscillateur', { periodes: 17 })).ok, 'paquet : 16 periodes certifiables (398 ms mesures), 17 non');
ok(T.validerScience(T.paramsScience('systemeSolaire', { groupe: 0, annees: 150 })).ok && !T.validerScience(T.paramsScience('systemeSolaire', { groupe: 0, annees: 151 })).ok, 'systeme solaire interieur : 150 ans oui, 151 non');
ok(T.validerScience(T.paramsScience('champDipolaire', { B0: 2000, duree: 240 })).ok, 'champDipolaire : le pire coin des bornes (80 ms mesures) est certifiable, plus de garde');
ok(T.validerScience(T.paramsScience('systemeSolaire', { groupe: 1, annees: 400 })).ok, 'systeme solaire exterieur : 400 ans restent certifiables (37 ms)');
/* game82 (audit : supernova, versMars, karman... dessines en LIGNE, une colonne de temps ecrasait l echelle commune) : chaque colonne
 *   garde au moins 30 % de la plus large (quantiles 0.5-99.5 %) ; une science sans ECHELLE_PROPRE garde ses proportions exactes */
{
  const etendues = (id, over = {}) => { const P = T.paramsScience(id, over), o = T.systeme(id).mod.simuler(id, P.params), z = T.standardiserIso(o.brut, o.n, o.D, id);
    const e = []; for (let j = 0; j < o.D; j++) { const v = []; for (let i = 0; i < o.n; i++) v.push(z[i * o.D + j]); v.sort((a, b) => a - b); e.push(v[Math.floor(o.n * 0.995)] - v[Math.floor(o.n * 0.005)]); }
    const M = Math.max(...e); return e.map((x) => x / M); };
  /* game88 : + 3 principes du vide (Higgs exclu : Im phi y est petit pour une raison PHYSIQUE, le champ roule dans une direction) */
  for (const [id, over] of [['supernova'], ['supernovaHydro'], ['versMars'], ['fusionTrousNoirs'], ['karman', { y0: 0.8 }], ['mandelbrot', { zoom: 100 }],
    ['videComprime'], ['casimirDynamique'], ['emissionSpontanee'],
    /* game89 (passe « rien oublie ») */
    ['tapisTalbot'], ['couplageCourant']])
    { const e = etendues(id, over); ok(Math.min(...e) >= 0.3, id + ' ' + JSON.stringify(over || {}) + ' : plus une ligne (' + e.map((x) => x.toFixed(3)).join(' ') + ')'); }
  /* game92 (effetTunnel : |psi|^2 ecrase a 0 par la position, le curseur V0 « muet ») : GARDE GENERALE — dans tout systeme (hors corps),
   *   une colonne a moins de 5 % de la plus large doit etre dans cette liste, chacune petite pour une raison PHYSIQUE */
  { const PETITES_VRAIES = { 'paquetOscillateur.2': 'width of a coherent packet: constant', 'karman.1': 'y across the street, same units as x',
      'pointsLagrange.2': 'z out of the plane: 0 unless started above', 'disqueAccretion.2': 'thin disk thickness, same units', 'champDipolaire.1': 'y = 0 on the field lines' };
    const ecrasees = [];
    for (const s of T.SYSTEMES) { if (T.CORPS[s.id]) continue; const o = s.mod.simuler(s.id, T.paramsScience(s.id).params); if (!o.bornee || !o.brut) continue;
      const e = etendues(s.id, {}); e.forEach((x, j) => { if (x < 0.05 && !PETITES_VRAIES[s.id + '.' + j]) ecrasees.push(s.id + '.' + j + ' (' + x.toFixed(3) + ')'); }); }
    ok(ecrasees.length === 0, 'aucune colonne d une autre grandeur ecrasee (sous 5 %) hors des ' + Object.keys(PETITES_VRAIES).length + ' petites valeurs physiques' + (ecrasees.length ? ' : ' + ecrasees.join(', ') : '')); }
  const o = T.systeme('schwarzschild').mod.simuler('schwarzschild', T.paramsScience('schwarzschild').params), zA = T.standardiserIso(o.brut, o.n, o.D), zB = T.standardiserIso(o.brut, o.n, o.D, 'schwarzschild');
  ok(zA.every((x, i) => x === zB[i]), 'schwarzschild (sans ECHELLE_PROPRE) : les memes nombres qu avant');
}
/* 2. les bornes */
const P0 = T.paramsScience('schwarzschild', {}, { minteur: MOI });
ok(T.validerScience(P0).ok, 'temoin : params de paramsScience valides');
ok(!T.validerScience({ ...P0, params: { ...P0.params, L: 1e6 } }).ok, 'un parametre hors bornes (que le module ramenerait) est refuse');
ok(!T.validerScience({ ...P0, x: 1 }).ok, 'une cle inconnue est refusee');
ok(!T.validerScience({ ...P0, q: 16 }).ok, 'un autre q est refuse');
ok(!T.validerScience({ ...P0, science: 'inconnue' }).ok, 'une science inconnue est refusee');
const P9 = T.paramsScience('troisCorps', {}, {});
ok(P9.angles.length === 6 && T.validerScience(P9).ok && !T.validerScience({ ...P9, angles: P9.angles.slice(1) }).ok && !T.validerScience({ ...P9, angles: [...P9.angles.slice(1), 7] }).ok, 'angles : D-3, dans [0, 2pi]');
ok(!T.validerScience({ ...P0, minteur: '0x1234' }).ok, 'minteur tronque refuse');
/* 3. distinction et lecture */
const sig0 = signature(T.genererScience(P0).points, 12);
ok(T.certifierScience(P0, [sig0]).codes.includes('DOUBLON'), 'la meme oeuvre deja mintee : DOUBLON');
ok(T.certifierScience(P0, [new Float64Array(10)]).etat === 'NON_LU', 'une signature illisible : NON_LU, jamais ecartee en silence');
const autre = signature(T.genererScience(T.paramsScience('hydrogene', {}, {})).points, 12);
ok(T.certifierScience(P0, [autre]).ok, 'une oeuvre differente deja mintee : certifiee');
/* 4. cablage : serveur et onglet */
const serveur = fs.readFileSync(path.join(ICI, 'tam-serveur.js'), 'utf8'), onglet = fs.readFileSync(path.join(ICI, 'tam-onglet.js'), 'utf8'), web = fs.readFileSync(path.join(ICI, 'serveur-web.js'), 'utf8');
ok(/P && P\.science \? certifierScience\(P, existantes\) : certifierReglage\(P, existantes\)/.test(serveur), 'le serveur certifie une science avec certifierScience');
ok(/\(sci0 \? TS\.rejouerScience : rejouer\)\(/.test(onglet) && /if \(P0\.regle \|\| sci0\) \{/.test(onglet), 'l onglet rejoue une science et la fait certifier par le serveur avant de signer');
/* game77 : l oeuvre est FIGEE au clic (course : un curseur bouge pendant la verification) */
ok(/const P0 = S\.P, oct0 = S\.octets, c0 = S\.c, choix0 = S\.choix, sci0 = !!S\.science;/.test(onglet) && (onglet.match(/if \(change\(\)\) \{ dit\.textContent = 'The work changed/g) || []).length === 2, 'mint : oeuvre figee au clic, verifiee deux fois apres les attentes');
ok(/'tam-science\.js'/.test(web), 'tam-science.js est servi');

/* 5. mutants sur COPIES */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'tam-science-mut-'));
for (const f of ['tam-moteur.js', 'tam-physique.js', 'tam-sciences.js', 'tam-fluides.js', 'tam-astro.js', 'tam-cosmos.js', 'tam-invisible.js', 'tam-quantique.js', 'tam-fusion.js', 'tam-grandes-questions.js', 'tam-grandes-questions-2.js', 'tam-champs-quantiques.js', 'tam-vide-quantique.js', 'tam-theories-2.js', 'tam-theories-3.js', 'tam-biologie.js', 'tam-chimie.js', 'tam-maths.js', 'human-brain-data.js', 'human-brain-anatomy.js', 'human-brain-parts.js', 'tam-ondes.js', 'tam-electricite.js', 'tam-mecanique.js', 'keccak.js']) fs.copyFileSync(path.join(ICI, f), path.join(TMP, f));
const SRC = fs.readFileSync(path.join(ICI, 'tam-science.js'), 'utf8');
const MUTANTS = [
  ['params hors bornes acceptes', (s) => s.replace("if (canon(o.params) !== canon(P.params)) return non('parametres hors bornes (le module les ramene)');", '')],
  ['distinction ignoree', (s) => s.replace('else if (dmin < SEUIL_DISTINCT)', 'else if (false)')],
  ['q change', (s) => s.replace('export const Q_SCIENCE = 12;', 'export const Q_SCIENCE = 10;')],
  ['signature illisible ignoree', (s) => s.replace("if (!s || typeof s.length !== 'number' || s.length !== 512) { nonLues++; continue; }", 'if (!s || s.length !== 512) continue;')],
];
let tues = 0;
for (const [nom, muter] of MUTANTS) {
  const m = muter(SRC); assert.notEqual(m, SRC, 'mutant applique : ' + nom);
  const f = path.join(TMP, 'tam-science-' + tues + '-' + Math.abs(nom.length) + '.js'); fs.writeFileSync(f, m);
  const M = await import(pathToFileURL(f).href);
  const P = M.paramsScience('schwarzschild', {}, { minteur: MOI });
  const s0 = signature(M.genererScience(P).points, P.q);
  const tue = M.validerScience({ ...P, params: { ...P.params, L: 1e6 } }).ok || !M.certifierScience(P, [s0]).codes.includes('DOUBLON')
    || P.q !== 12 || M.certifierScience(P, [new Float64Array(10)]).etat !== 'NON_LU';
  console.log('  ' + nom + ' : ' + (tue ? 'TUE' : 'SURVIT')); if (tue) tues++;
}
fs.rmSync(TMP, { recursive: true, force: true });
/* game114 : la note du cerveau (ecrite on-chain) de CHAQUE systeme, pas seulement de 24 graines : sous NOTE_MAX, avec sa conclusion
 *   (fluctuationsVide recopiait un tableau de 40 variances et perdait la fin) */
{ const mauvais = [];
  for (const s of T.SYSTEMES) { const P = T.paramsScience(s.id), note = T.noteCerveau(P, { nomCerveau: 'UNIT', humeur: 'calm', ressenti: 'steady', battement: 24 });
    if (!(note.length <= T.NOTE_MAX && /Conclusion: /.test(note) && !/\d,\d/.test(note))) mauvais.push(s.id + ' (' + note.length + ')'); }
  ok(mauvais.length === 0, 'game114 : chaque systeme a une note complete (conclusion, <= NOTE_MAX, aucun tableau recopie) : ' + (mauvais.join(', ') || T.SYSTEMES.length + ' notes')); }
ok(tues === MUTANTS.length, 'MUTANTS : ' + tues + '/' + MUTANTS.length);
console.log('MUTANTS : ' + tues + '/' + MUTANTS.length + ' tues');
console.log('test-tam-science-20261101 : ' + n + ' assertions OK');
