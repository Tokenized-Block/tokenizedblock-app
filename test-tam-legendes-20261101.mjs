/* test-tam-legendes-20261101.mjs — les legendes de tam-legendes.js contre la VRAIE sortie des modules (simuler lance ici).
 *   colonnes = D reel, noms = nombre de corps reel, films = blocs d images reellement successifs, chaines en anglais ASCII,
 *   et les chiffres annonces dans les legendes relus dans les invariants des modules. */
/* 2026-11-04 : le chemin etait ecrit en dur ('D:/tmp/wt-tam/') — depuis toute AUTRE copie de travail, ce test lisait les modules de
 *   wt-tam (un agent a vu « 135 attendus, 136 puis 137 trouves » au rythme de mes ajouts). Il lit maintenant les modules A COTE de lui. */
const ici = (f) => new URL('./' + f, import.meta.url).href;
const TS = await import(ici('tam-science.js'));
const { LEGENDES, legende, nomsDe } = await import(ici('tam-legendes.js'));

let nOk = 0;
const ok = (c, msg) => { if (!c) { console.error('ECHEC : ' + msg); process.exit(1); } nOk++; };
const sim = (id, p = {}) => TS.systeme(id).mod.simuler(id, p);

/* 1. couverture : chaque systeme a sa legende, colonnes = D reel aux params par defaut */
const ids = TS.SYSTEMES.map((s) => s.id);
/* game80 : + les 16 grandes questions (tam-grandes-questions.js : 9, tam-grandes-questions-2.js : 7) */
/* game81 : + les 9 champs quantiques (tam-champs-quantiques.js) */
/* game88 : + les 4 principes du vide (tam-vide-quantique.js) */
ok(ids.length === 301, '301 systemes attendus, ' + ids.length + ' trouves'); /* game93 : + 6 theories classiques (tam-theories-2.js) ; game96 : + 6 (tam-theories-3.js) ; game111 : + 2 (tam-biologie.js) ; game112 : + 2 ; game113 : + 3 (tam-chimie.js) ; game114 : + 2 ; game115 : + 4 (tam-maths.js) ; game118 : + 2 ; game120 : + 3 (tam-ondes.js) ; game122 : + 3 ; game123 : + 2 ; game124 : + 2 ; game125 : + 3 ; game126 : + 2 ; game127 : + 2 */
ok(['videComprime', 'casimirDynamique', 'higgsVide', 'emissionSpontanee'].every((id) => ids.includes(id) && TS.systeme(id).mod.SOURCES), 'les 4 principes du vide sont dans tam-science.js#SYSTEMES');
const CHQ_IDS = ['champLibre', 'fluctuationsVide', 'interactionChamps', 'paireSchwinger', 'effetUnruh', 'couplageCourant', 'comptonKleinNishina', 'atomes', 'quarks'];
ok(CHQ_IDS.every((id) => ids.includes(id) && TS.systeme(id).mod.SOURCES), 'les 9 champs quantiques sont dans tam-science.js#SYSTEMES');
const GQ = ['videQuantique', 'bigRip', 'fauxVide', 'centreTerre', 'versMars', 'zeroAbsolu', 'tailleUnivers', 'nombrePi', 'calendrierCosmique',
  'penduleFoucault', 'mouvementTerre', 'etoilesHR', 'evaporationTrouNoir', 'tsunami', 'geometrieUnivers', 'tailleEtoiles'];
ok(GQ.every((id) => ids.includes(id)), 'les 16 grandes questions sont dans tam-science.js#SYSTEMES');
/* les objets nommes hors systeme de corps (la page les projette : pas de couleur par corps, les noms sont dits dans couleurs) */
const NOMMES = new Set(['versMars', 'bigRip', 'geometrieUnivers', 'etoilesHR', 'tailleEtoiles', 'calendrierCosmique', 'couplageCourant', 'atomes']);
const sorties = {};
for (const id of ids) {
  const L = LEGENDES[id], o = sim(id); sorties[id] = o;
  ok(L && typeof L === 'object', 'legende manquante : ' + id);
  ok(o.bornee && o.brut && o.brut.length === o.n * o.D, id + ' : simuler ne rend pas un brut n x D');
  ok(Array.isArray(L.colonnes) && L.colonnes.length === o.D, id + ' : colonnes ' + (L.colonnes && L.colonnes.length) + ' pour D = ' + o.D);
  ok(typeof L.titre === 'string' && L.titre.length > 2, id + ' : titre');
  ok(typeof L.enUnePhrase === 'string' && L.enUnePhrase.length > 20, id + ' : enUnePhrase');
  ok(typeof L.couleurs === 'string' && L.couleurs.length > 10, id + ' : couleurs');
  ok(Array.isArray(L.aRegarder) && L.aRegarder.length >= 1 && L.aRegarder.length <= 3, id + ' : aRegarder 1..3');
  ok(L.fin === null || typeof L.fin === 'string', id + ' : fin');
  const k = TS.CORPS[id];
  if (k) {
    const m = Math.floor(o.D / k);
    ok(Array.isArray(L.noms) && L.noms.length === m, id + ' : noms ' + (L.noms && L.noms.length) + ' pour ' + m + ' corps');
    ok(L.noms.every((b) => L.couleurs.includes(b)), id + ' : chaque corps a sa couleur nommee');
    /* chaque colonne nomme le corps auquel elle appartient (k colonnes par corps, dans l ordre) */
    ok(L.colonnes.every((c, j) => c.includes(L.noms[Math.floor(j / k)])), id + ' : colonne j appartient au corps floor(j/k)');
    const ts = TS.nomsCorps(id, {});
    if (ts) ok(ts.length === L.noms.length && ts.every((b, j) => b === L.noms[j]), id + ' : memes noms que tam-science.js#nomsCorps');
  } else {
    if (NOMMES.has(id)) ok(Array.isArray(L.noms) && L.noms.length >= 2 && L.noms.every((b) => L.couleurs.includes(b)), id + ' : objets nommes, chacun dit dans couleurs');
    else ok(L.noms === null, id + ' : noms null hors systeme de corps et hors objets nommes');
    /* un film se colore par MOMENT (tam-onglet.js : couleurDim(q % 12)) ; sinon une couleur par colonne */
    if (L.film) ok(L.couleurs.startsWith('A film of ' + L.film.images + ' moments'), id + ' : couleurs d un film = par moment');
    /* 2026-11-09 : a subject that colours its points by class (o.pointClasses, emotionWiringHCP: its brain parts) has a colour KEY instead,
     *   the same names and colours as the palette it draws (test-tam-cerveau-parties-20261109.mjs checks every class) */
    else if (L.pointColours) ok(!!o.pointClasses && L.pointColours.length === o.pointPalette.length && L.pointColours.every((p, j) => p.name === o.pointPalette[j].name && p.color === o.pointPalette[j].color && L.couleurs.includes('key below')), id + ' : la cle des couleurs = la palette dessinee');
    else ok(L.colonnes.every((c, j) => L.couleurs.includes('colour ' + (j + 1) + ' = ')), id + ' : chaque colonne a sa couleur nommee');
  }
  /* films : la legende dit EXACTEMENT le film que le module declare (o.film), et rien quand il n en declare pas */
  ok(!!L.film === !!o.film, id + ' : film legende ' + !!L.film + ' / module ' + !!o.film);
  if (L.film) {
    const F = L.film, M = o.film;
    ok(F.ordre === 'images-successives' && F.images >= 2 && F.debuts.length === F.images && F.tailles.length === F.images, id + ' : forme du film');
    ok(F.images === M.images, id + ' : images ' + F.images + ' / module ' + M.images);
    ok((F.parImage ?? null) === (M.parImage ?? null), id + ' : parImage ' + F.parImage + ' / module ' + M.parImage);
    const dm = M.debuts || Array.from({ length: M.images }, (_, k) => k * M.parImage), tm = M.tailles || Array(M.images).fill(M.parImage);
    ok(F.debuts.every((d, k) => d === dm[k] && F.tailles[k] === tm[k]), id + ' : debuts et tailles = ceux du module');
    ok(F.debuts[F.images - 1] + F.tailles[F.images - 1] <= o.n, id + ' : la derniere image tient dans n');
    ok(F.colonneTemps === null || (Number.isInteger(F.colonneTemps) && F.colonneTemps < o.D), id + ' : colonneTemps');
  }
}
ok(Object.keys(LEGENDES).length === 303 && LEGENDES.__attracteur && LEGENDES.__formule, '301 + __attracteur + __formule : ' + Object.keys(LEGENDES).length);
ok(Object.keys(LEGENDES).every((id) => id.startsWith('__') || ids.includes(id)), 'aucune legende orpheline');
ok(legende('__attracteur', { D: 5 }).colonnes.length === 5 && LEGENDES.__attracteur.colonnes.length === 3, 'attracteur : une colonne par variable');
ok(LEGENDES.__formule.colonnes.length === 3 && legende('inconnu') === null, 'formule x y z ; id inconnu -> null');

/* 2. films : les lignes sont VRAIMENT des blocs d images successifs (colonne du temps constante par bloc, croissante d un bloc au suivant) */
const films = ids.filter((id) => LEGENDES[id].film);
/* game80 : + la collision de galaxies, devenue un film de 12 moments (tam-astro.js) — sa legende suit le film que le module declare */
/* game80 : + fauxVide, versMars, tsunami (grandes questions) */
/* game81 : + 7 films declares par tam-champs-quantiques.js (Unruh et Compton sont des nuages sans film) */
const FILMS = ['supernova', 'supernovaHydro', 'effetTunnel', 'superpositionQuantique', 'ondeGravitationnelle', 'collisionGalaxies', 'fauxVide', 'versMars', 'tsunami',
  'champLibre', 'fluctuationsVide', 'interactionChamps', 'paireSchwinger', 'couplageCourant', 'atomes', 'quarks',
  /* game88 : l emission spontanee (16 instants) ; les 3 autres principes du vide n ont pas de film */
  'emissionSpontanee', 'kuramoto', 'gibbsFourier',
  /* game96 : une trajectoire par image (Rutherford), 8 instants (chaleur), trois pistes (brachistochrone) */
  'rutherford', 'chaleur', 'brachistochrone',
  /* game111 : 8 instants de la meme sequence d ADN */
  'adnMutations',
  /* game112 : une population par image */
  'deriveGenetique',
  /* game113 : 8 instants des memes molecules */
  'equilibreChimique',
  /* game114 : un courant par image */
  'neurone',
  /* game115 : un marcheur par image */
  'marcheAleatoire',
  /* game118 : le meme gaz un peu plus tard */
  'gazParfait',
  /* game120 : la corde a 8 instants */
  'cordeVibrante',
  /* game123 : la chaine de ressorts sur une periode */
  'modesNormaux',
  /* game126 : six lachers, huit phases */
  'penduleAmplitude', 'phasesLune'];
ok(FILMS.every((id) => films.includes(id)) && films.length === 32, 'les 32 films : ' + films.join(','));
function blocsExacts(id, o, F) {
  const c = F.colonneTemps, D = o.D, b = o.brut;
  for (let k = 0; k < F.images; k++) {
    const a = F.debuts[k], t0 = b[a * D + c];
    for (let r = 1; r < F.tailles[k]; r++) if (b[(a + r) * D + c] !== t0) return 'bloc ' + k + ' ligne ' + r + ' change de temps';
    if (k > 0 && !(t0 > b[F.debuts[k - 1] * D + c])) return 'bloc ' + k + ' pas apres le bloc ' + (k - 1);
  }
  return null;
}
for (const id of ['effetTunnel', 'superpositionQuantique', 'ondeGravitationnelle', 'versMars', 'tsunami', 'champLibre', 'interactionChamps']) {
  const r = blocsExacts(id, sorties[id], LEGENDES[id].film); ok(r === null, id + ' : ' + r);
}
/* faux vide : pas de colonne de temps ; les MEMES points a chaque moment (x, y identiques), un point devenu vrai vide le reste */
{ const o = sorties.fauxVide, F = LEGENDES.fauxVide.film; let memes = true, monte = true;
  ok(F.colonneTemps === null, 'fauxVide : aucune colonne de temps');
  for (let k = 1; k < F.images; k++) for (let r = 0; r < F.parImage; r++) {
    const i = (F.debuts[k] + r) * 3, j = (F.debuts[k - 1] + r) * 3;
    if (o.brut[i] !== o.brut[j] || o.brut[i + 1] !== o.brut[j + 1]) memes = false;
    if (o.brut[i + 2] < o.brut[j + 2]) monte = false;
  }
  ok(memes && monte, 'fauxVide : memes points d image en image (' + memes + '), vrai vide irreversible (' + monte + ')');
  const v = new Set(); for (let i = 0; i < o.n; i++) v.add(o.brut[3 * i + 2]); ok([...v].every((x) => x === 0 || x === 0.3), 'fauxVide : colonne 3 = 0 ou 0.3'); }
/* supernovas : 16 instants, blocs de 93 ou 94 lignes ; colonne du temps non decroissante, 16 valeurs distinctes */
for (const id of ['supernova', 'supernovaHydro']) {
  const o = sorties[id], c = LEGENDES[id].film.colonneTemps, v = [];
  let monte = true; for (let i = 0; i < o.n; i++) { v.push(o.brut[i * o.D + c]); if (i && v[i] < v[i - 1]) monte = false; }
  const distincts = [...new Set(v)];
  ok(monte && distincts.length === 16, id + ' : ' + distincts.length + ' instants, croissant ' + monte);
  const longueurs = distincts.map((t) => v.filter((x) => x === t).length);
  ok(longueurs.every((x) => x === 93 || x === 94), id + ' : blocs de 93/94 lignes : ' + longueurs.join(','));
}
/* l effet tunnel change vraiment d image en image (la densite bouge) */
{ const o = sorties.effetTunnel, F = LEGENDES.effetTunnel.film; let diff = 0;
  for (let r = 0; r < F.parImage; r++) diff += Math.abs(o.brut[r * 3 + 2] - o.brut[((F.images - 1) * F.parImage + r) * 3 + 2]);
  ok(diff > 1e-3, 'effetTunnel : premiere et derniere image differentes'); }
/* les nuages a temps tire au hasard ne sont PAS des films (tapisTalbot, marche, rotor, Landau) */
for (const [id, c] of [['tapisTalbot', 1], ['marcheQuantique', 1], ['rotorPulse', 0], ['niveauxLandau', 2]]) {
  const o = sorties[id]; let desc = 0; for (let i = 1; i < o.n; i++) if (o.brut[i * o.D + c] < o.brut[(i - 1) * o.D + c]) desc++;
  ok(LEGENDES[id].film === null && desc > o.n / 4, id + ' : temps tire au hasard, pas un film (' + desc + ' descentes)');
}

/* 3. params : la legende suit le module */
for (const [id, p] of [['tourbillonsPonctuels', { nombre: 3 }], ['systemeSolaire', { groupe: 1 }], ['trappist1', { premiere: 3 }], ['superpositionQuantique', { images: 7 }], ['ondeGravitationnelle', { masses: 16 }], ['superpositionQuantique', { images: 24 }],
  ['versMars', { aCible: 5.2 }], ['tsunami', { profondeur: 1000 }], ['tailleEtoiles', { jusqua: 4 }], ['calendrierCosmique', { ageUnivers: 14 }],
  ['quarks', { images: 6 }], ['atomes', { Z: 10 }], ['paireSchwinger', { paires: 10 }], ['champLibre', { duree: 40 }]]) {
  const o = sim(id, p), L = legende(id, p), q = id + ' ' + JSON.stringify(p);
  ok(L.colonnes.length === o.D, q + ' : colonnes = D');
  if (TS.CORPS[id]) ok(L.noms.length === Math.floor(o.D / TS.CORPS[id]), q + ' : noms');
  ok(!!L.film === !!o.film, q + ' : film ssi le module en declare un');
  if (L.film) {
    ok(L.film.images === o.film.images && (L.film.parImage ?? null) === (o.film.parImage ?? null), q + ' : meme film que le module');
    if (o.film.debuts) ok(L.film.debuts.every((d, k) => d === o.film.debuts[k] && L.film.tailles[k] === o.film.tailles[k]), q + ' : debuts / tailles du module');
    if (L.film.colonneTemps !== null) { const r = blocsExacts(id, o, L.film); ok(r === null, q + ' : ' + r); }
  }
}
ok(legende('versMars', { aCible: 5.2 }).noms[2] === 'Target planet (orbit at 5.2 AU)' && LEGENDES.versMars.noms.join() === 'Spacecraft,Earth,Mars', 'versMars : la cible nommee Mars seulement a 1.524 UA');
/* game82 (audit) : atomes Z = 1 -> o.film a 1 image ; la page ne montre pas de film, la legende ne doit pas en annoncer un */
ok(!legende('atomes', { Z: 1 }).film && !/own colour/.test(legende('atomes', { Z: 1 }).couleurs || ''), 'atomes Z = 1 : pas de film annonce');
ok(legende('systemeSolaire', { groupe: 1 }).noms[0] === 'Jupiter' && LEGENDES.systemeSolaire.noms[3] === 'Mars', 'planetes par groupe');
ok(legende('systemeSolaire', { groupe: 0.6 }).noms[0] === 'Jupiter', 'groupe 0.6 arrondi a 1 comme le module');
ok(nomsDe('trappist1', { premiere: 3 }).join() === 'TRAPPIST-1 e,TRAPPIST-1 f,TRAPPIST-1 g,TRAPPIST-1 h', 'TRAPPIST-1 e..h');
ok(nomsDe('kepler') === null, 'pas de noms hors corps');
/* trappist : les rayons des orbites croissent dans l ordre des noms (b plus proche que c...) */
{ const o = sorties.trappist1, r = [0, 1, 2, 3].map((k) => Math.hypot(o.brut[2 * k], o.brut[2 * k + 1]));
  ok(r[0] < r[1] && r[1] < r[2] && r[2] < r[3], 'trappist : b < c < d < e en distance'); }
/* systeme solaire : la 3e planete du groupe 0 est a ~1 UA (Earth) */
{ const o = sorties.systemeSolaire, d = Math.hypot(o.brut[6], o.brut[7], o.brut[8]); ok(Math.abs(d - 1) < 0.02, 'Earth a 1 UA : ' + d); }
/* Halley : Earth (colonnes 4-6) sur un cercle de 1 UA, z = 0 */
{ const o = sorties.cometeHalley; let pire = 0, z = 0; for (let i = 0; i < o.n; i++) { pire = Math.max(pire, Math.abs(Math.hypot(o.brut[i * 6 + 3], o.brut[i * 6 + 4]) - 1)); z = Math.max(z, Math.abs(o.brut[i * 6 + 5])); }
  ok(pire < 1e-9 && z === 0, 'Halley : Earth sur le cercle unite'); }

/* 4. chaines : anglais ASCII, aucun identifiant francais du code */
const INTERDITS = /\b(brut|params?|simuler|graine|duree|annees|groupe|premiere|nombre|nuage|corps|etoiles?|rayons?|temps|vitesse|masses?Trou|densite|orbite|tours|rapport|undefined|NaN|null)\b|params\./;
const toutes = [];
const ramasser = (x) => { if (typeof x === 'string') toutes.push(x); else if (Array.isArray(x)) x.forEach(ramasser); else if (x && typeof x === 'object') Object.values(x).forEach(ramasser); };
ramasser(LEGENDES);
for (const [id, p] of [['tourbillonsPonctuels', { nombre: 3 }], ['systemeSolaire', { groupe: 1 }], ['trappist1', { premiere: 2 }], ['__attracteur', { D: 7 }]]) ramasser(legende(id, p));
for (const s of toutes) {
  ok(/^[\x20-\x7e]*$/.test(s), 'chaine non ASCII : ' + s);
  if (s !== 'images-successives') ok(!INTERDITS.test(s), 'identifiant du code dans une chaine : ' + s);
}
ok(Object.isFrozen(LEGENDES) && Object.isFrozen(LEGENDES.kepler) && Object.isFrozen(LEGENDES.kepler.colonnes), 'gele');

/* 5. les chiffres et faits annonces, relus dans les modules */
{ const inv = sorties.pulsarHulseTaylor.invariants; ok(inv.coalescence.mesure > 250 && inv.coalescence.mesure < 350, 'pulsar : coalescence ~300 Ma : ' + inv.coalescence.mesure); }
{ const inv = sorties.etoileS2.invariants; ok(Math.abs(inv.pericentre.mesure - 120) < 5, 'S2 pericentre ~120 UA : ' + inv.pericentre.mesure);
  const o = sorties.etoileS2; let rmax = 0; for (let i = 0; i < o.n; i++) rmax = Math.max(rmax, Math.hypot(o.brut[3 * i], o.brut[3 * i + 1], o.brut[3 * i + 2])); ok(Math.abs(rmax - 2000) < 100, 'S2 apocentre ~2000 UA : ' + rmax); }
{ const inv = sorties.lumiereTrouNoir.invariants; ok(Math.abs(inv.bCritique.mesure - 5.2) < 0.01 && inv.rayon1.issue === 'capture', 'b critique 5.2, rayon 1 capture'); }
{ const inv = sorties.disqueAccretion.invariants; ok(Math.abs(inv.isco.mesure - 6) < 1e-6 && inv.vitesseIsco.mesure > 0.45 && inv.vitesseIsco.mesure <= 0.5, 'disque : ISCO 6, vitesse ~0.5 c'); }
{ const inv = sorties.courbeRotation.invariants; ok(inv.platitude.avecHalo > 0.9 && inv.platitude.visibleSeul < 0.85, 'rotation plate avec halo, chute sans : ' + JSON.stringify(inv.platitude)); }
{ const inv = sorties.effetTunnel.invariants.transmission; ok(inv.mesure > 0.01 && inv.reflexion > 0.01, 'tunnel : partie transmise ET reflechie'); }
{ const o = sorties.effetTunnel; let x0 = Infinity; for (let i = 0; i < o.n; i++) if (Math.abs(o.brut[3 * i]) < Math.abs(x0)) x0 = o.brut[3 * i]; ok(Math.abs(x0) < 0.3, 'tunnel : la barriere commence a 0 (grille passe par 0)'); }
{ const inv = sorties.binaireTrouNoir.invariants; ok(inv.excentricite.decroissante && inv.excentricite.fin < inv.excentricite.debut, 'inspirale : excentricite decroissante'); }
{ const o = sorties.binaireTrouNoir, e0 = o.brut[3], e1 = o.brut[(o.n - 1) * 4 + 3]; ok(e0 === 0.4 && e1 < e0, 'colonne 4 = excentricite (0.4 au depart)'); }
{ const o = sorties.supernovaHydro; let m = 0; for (let i = 0; i < o.n; i++) m = Math.max(m, o.brut[i * 5 + 4]); ok(m > 3 && m <= 4.05, 'supernovaHydro : densite max ~4 : ' + m); }
{ const o = sorties.supernova; ok(Math.abs(o.brut[3] - 4) < 1e-6 && Math.abs(o.brut[(o.n - 1) * 4 + 3] - 40000) < 1e-6, 'supernova : temps 4 a 40000 ans'); }
{ const o = sorties.binaireFusion; let tMin = Infinity, tMax = -Infinity; for (let i = 0; i < o.n; i++) { tMin = Math.min(tMin, o.brut[4 * i]); tMax = Math.max(tMax, o.brut[4 * i]); } ok(tMin < 0 && tMax > 0, 'binaireFusion : le temps passe par 0'); }
{ const o = sorties.fusionTrousNoirs; let im = 0, a = 0; for (let i = 0; i < o.n; i++) { const h = Math.hypot(o.brut[4 * i + 1], o.brut[4 * i + 2]); if (h > a) { a = h; im = i; } } ok(Math.abs(o.brut[4 * im]) < 0.01, 'fusion : pic du signal pres de t = 0 : ' + o.brut[4 * im]); }
{ const o = sorties.collisionGalaxies; ok(o.n % 2 === 0, 'collision : deux moities'); }
{ const o = sorties.mouvementBrownien, lignes = 121; ok(o.brut[0] === 0 && o.brut[3 * lignes] === 0 && o.brut[3 * lignes + 1] === 0, 'brownien : chaque trace part de l origine'); }
{ const o = sorties.chuteTrouNoir; ok(o.brut[0] === 10 && o.brut[3 * (o.n - 1)] < 1e-9 && o.brut[3 * (o.n - 1) + 2] === o.brut[3 * (o.n - 2) + 2], 'chute : r de 10 a 0, temps lointain fige'); }
{ const o = sorties.pointsLagrange; let z = 0; for (let i = 0; i < o.n; i++) z = Math.max(z, Math.abs(o.brut[3 * i + 2])); ok(z === 0, 'Lagrange : z = 0 par defaut'); }
{ const o = sorties.paquetOscillateur; let a = Infinity, b = -Infinity; for (let i = 0; i < o.n; i++) { a = Math.min(a, o.brut[3 * i + 2]); b = Math.max(b, o.brut[3 * i + 2]); } ok(b - a < 1e-3, 'paquet : largeur plate a largeur 1'); }
{ const o = sorties.dilatationTemps; ok(Math.abs(Math.hypot(o.brut[0], o.brut[1]) - 3) < 1e-9 && Math.abs(Math.hypot(o.brut[3 * (o.n - 1)], o.brut[3 * (o.n - 1) + 1]) - 36) < 1e-9, 'dilatation : horloge proche d abord, horloge mobile (r 36) en dernier'); }
{ const o = sorties.ondeLumiere; ok(o.brut[0] === 3 && o.brut[3] === 3, 'lumiere : lignes E puis B au meme x, depart en 3'); }
{ const o = sorties.champDipolaire, i = Math.floor(0.3 * o.n) - 1; ok(o.brut[3 * i + 1] === 0, 'dipole : les 30 % premieres lignes sont des lignes de champ (y = 0)'); }
{ const o = sorties.amasEtoiles; ok(o.D === 12, 'amas : 4 etoiles dessinees'); }

/* 6. game80 : les grandes questions — noms et dispositions relus dans les LIGNES, chiffres annonces relus dans les invariants */
const inv = (id) => sorties[id].invariants, entre = (x, a, b, m) => ok(x >= a && x <= b, m + ' : ' + x);
/* noms : versMars, l ordre des 3 points d un moment (vaisseau au perihelie r = 1 au depart, Terre sur r = 1, Mars sur r = 1.524) */
{ const o = sorties.versMars, r = (i) => Math.hypot(o.brut[3 * i], o.brut[3 * i + 1]), last = 3 * (LEGENDES.versMars.film.images - 1);
  let terre = 0, mars = 0; for (let k = 0; k < LEGENDES.versMars.film.images; k++) { terre = Math.max(terre, Math.abs(r(3 * k + 1) - 1)); mars = Math.max(mars, Math.abs(r(3 * k + 2) - 1.524)); }
  ok(terre < 1e-9 && mars < 1e-9 && Math.abs(r(0) - 1) < 1e-12 && Math.abs(r(last) - 1.524) < 1e-6, 'versMars : point 1 = vaisseau (1 -> 1.524 UA), 2 = Terre (1 UA), 3 = Mars (1.524 UA)'); }
/* bigRip : 12 blocs, un par galaxie, chacun repart du temps 0 */
{ const o = sorties.bigRip, m = Math.floor(o.n / 12); ok(LEGENDES.bigRip.noms.length === 12 && [...Array(12).keys()].every((g) => o.brut[3 * g * m + 2] === 0 && o.brut[3 * (g * m + m - 1) + 2] > 20), 'bigRip : 12 galaxies, blocs de ' + m + ' lignes du present au rip'); }
/* geometrie : 3 blocs, colonne 4 = +1, 0, -1 dans l ordre des noms */
{ const o = sorties.geometrieUnivers, q = Math.floor(o.n / 3), K = [1, 0, -1]; let bon = true;
  for (let i = 0; i < o.n; i++) if (o.brut[4 * i + 3] !== K[Math.min(2, Math.floor(i / q))]) bon = false;
  ok(bon && LEGENDES.geometrieUnivers.noms.every((nm, j) => nm.includes('curvature ' + ['+1', '0', '-1'][j])), 'geometrie : blocs sphere (+1), plan (0), hyperbolique (-1)'); }
/* etoiles HR : les noms = ceux du module ; ce sont les PREMIERES lignes */
{ const I = inv('etoilesHR'), N = LEGENDES.etoilesHR.noms; ok(N.join() === I.etoiles.noms.join() && N.length === I.etoiles.lignes, 'etoilesHR : ' + N.length + ' etoiles nommees = lignes etoiles du module');
  ok(['Sun', 'Betelgeuse', 'Sirius B'].every((x) => N.includes(x)), 'etoilesHR : les etoiles citees existent dans la table');
  const o = sorties.etoilesHR, iSun = N.indexOf('Sun'); ok(Math.abs(o.brut[3 * iSun + 1]) < 1e-12 && Math.abs(o.brut[3 * iSun + 2]) < 1e-12, 'etoilesHR : Soleil = 0 en log L et log R'); }
/* tailles : colonne 4 = indice du corps, dans l ordre des noms ; rayon max de chaque bloc = rayon de la table */
for (const p of [{}, { jusqua: 4 }]) {
  const o = sim('tailleEtoiles', p), N = legende('tailleEtoiles', p).noms, I = o.invariants.rayons, per = Math.floor(o.n / N.length); let bon = true;
  for (let i = 0; i < o.n; i++) if (o.brut[4 * i + 3] !== Math.min(N.length - 1, Math.floor(i / per))) bon = false;
  ok(bon && N.join() === I.map((r) => r.nom).join() && N[0] === 'Earth' && N[1] === 'Sun', 'tailleEtoiles ' + JSON.stringify(p) + ' : ' + N.length + ' corps dans l ordre de la colonne 4');
}
/* calendrier : 9 evenements = ceux du module ; leurs batons = les lignes de hauteur > 0, apres la spirale */
{ const o = sorties.calendrierCosmique, N = LEGENDES.calendrierCosmique.noms, E = inv('calendrierCosmique').evenements; let premier = -1, nb = 0;
  for (let i = 0; i < o.n; i++) if (o.brut[3 * i + 2] > 0) { nb++; if (premier < 0) premier = i; }
  ok(N.join() === E.map((e) => e.nom).join() && nb === Math.floor(o.n / 4 / N.length) * N.length && premier === o.n - nb, 'calendrier : ' + N.length + ' evenements, ' + nb + ' lignes de batons a la fin'); }
/* colonnes et chiffres annonces */
{ const I = inv('videQuantique'); entre(I.pression.mesure, 1.2e-3, 1.4e-3, 'Casimir ~1.3 mPa a 1 micrometre'); entre(I.loiEnPuissance.rapportD_2D, 15.9, 16.1, 'Casimir : x16 a gap moitie');
  const o = sorties.videQuantique, k = Math.floor(0.6 * o.n); let dedans = true; for (let i = 0; i < k; i++) if (!(o.brut[3 * i] >= 0 && o.brut[3 * i] <= 1 && Number.isInteger(o.brut[3 * i + 1]))) dedans = false;
  let fort = 0; for (let i = 0; i < o.n; i++) fort = Math.max(fort, Math.abs(o.brut[3 * i + 2])); ok(dedans && fort <= 0.4 + 1e-12, 'Casimir : dedans k entiers entre 0 et 1, champ <= 0.4'); }
{ const I = inv('bigRip'); entre(I.tempsAvantRip.mesure, 20.5, 23.5, 'bigRip ~22 Gyr'); entre(I.dernierInstantDessine.avantRip, 0.01, 0.03, 'bigRip : dernier point ~0.02 Gyr avant'); ok(Math.abs(I.dernierInstantDessine.log10a - 4) < 1e-9, 'bigRip : 10 000 fois'); ok(sorties.bigRip.fin && sorties.bigRip.fin.evenement === 'big rip', 'bigRip : fin declaree'); }
{ const f = inv('fauxVide').fractionVraiVide; entre(f.mesure[9], 0.95, 0.99, 'faux vide : ~97 % mesure a la fin'); entre(f.avrami[9], 0.975, 0.99, 'faux vide : ~98 % Avrami'); }
{ const I = inv('centreTerre'), o = sorties.centreTerre; entre(I.traverseePREM.mesure, 37.5, 39, 'Terre : ~38 min'); entre(I.traverseeUniforme.mesure, 41.5, 42.8, 'Terre uniforme ~42 min');
  entre(I.gMax.valeur, 10.5, 10.9, 'g max ~10.7'); ok(I.gMax.rayonKm === 3480, 'g max au sommet du noyau (3480 km)');
  let v = 0; for (let i = 0; i < o.n; i++) v = Math.max(v, Math.abs(o.brut[4 * i + 1])); entre(v, 9.5, 10.3, 'Terre : vitesse max ~10 km/s');
  ok(o.brut[0] === 1 && Math.abs(o.brut[4 * (o.n - 1)] - 1) < 1e-3 && Math.abs(o.brut[4 * (o.n - 1) + 2] - 2 * I.traverseePREM.mesure) < 1e-6, 'Terre : part de 1, revient a 1 apres 2 traversees (minutes)'); }
{ const I = inv('versMars'); entre(I.dureeTransfert.mesure, 255, 262, 'Mars ~259 j'); entre(I.anglePhase.valeur, 43, 46, 'Mars ~44 deg'); entre(I.periodeSynodique.valeur, 770, 790, 'Mars ~780 j');
  const o = sorties.versMars; ok(Math.abs(o.brut[3 * (o.n - 1) + 2] - I.dureeTransfert.formule) < 1e-6, 'Mars : colonne 3 en jours, jusqu a l arrivee'); }
{ entre(inv('zeroAbsolu').fractionCondensat.mesure, 0.75, 0.81, 'BEC ~78 %'); entre(sim('zeroAbsolu', { T: 1.5 }).invariants.fractionCondensat.mesure, 0, 0.01, 'BEC : pas de coeur au-dessus de Tc'); }
{ const I = inv('tailleUnivers'), o = sorties.tailleUnivers, nH = Math.floor(o.n / 10); entre(I.rayonObservable.Gpc, 13.5, 14.8, 'univers ~14 Gpc'); entre(I.rayonObservable.Gal, 44, 48, 'univers ~46 Gal'); entre(I.age.Gyr, 13.6, 14, 'age ~13.8');
  let bord = 0, iMin = nH, dMin = Infinity; for (let i = 0; i < o.n; i++) { const d = Math.hypot(o.brut[3 * i], o.brut[3 * i + 1]); if (i < nH) bord = Math.max(bord, o.brut[3 * i + 2]); else if (d < dMin) { dMin = d; iMin = i; } }
  ok(bord < 0.05 && o.brut[3 * iMin + 2] > 12 && o.brut[3 * iMin + 2] <= I.age.Gyr, 'univers : colonne 3 = temps cosmique au depart de la lumiere (0 au bord, ~13.8 tout pres) : bord ' + bord + ', pres ' + o.brut[3 * iMin + 2]); }
{ const I = inv('nombrePi'); entre(I.leibniz.erreur, 0.0009, 0.0011, 'Leibniz 1000 termes ~0.001'); ok(I.machin.termesPour1e12 <= 10 && I.machin.erreur < 1e-14, 'Machin : precision machine en ~10 termes');
  const o = sorties.nombrePi; let dedans = 0; for (let i = 0; i < o.n; i++) if (o.brut[3 * i] ** 2 + o.brut[3 * i + 1] ** 2 <= 1) dedans++; ok(Math.abs(o.brut[3 * (o.n - 1) + 2] - Math.abs(4 * dedans / o.n - Math.PI)) < 1e-12, 'pi : colonne 3 = erreur courante de Monte-Carlo'); }
{ const I = inv('calendrierCosmique'), E = I.evenements, d = (nm) => E.find((e) => e.nom === nm).date;
  ok(I.soleil.date.startsWith('Sep') && d('Earth forms').startsWith('Sep') && d('Non-avian dinosaurs extinct').startsWith('Dec 30') && d('Big Bang').startsWith('Jan 1 '), 'calendrier : Soleil/Terre en septembre, dinosaures le 30 decembre');
  entre(I.humains.minutesAvantMinuit, 10, 13, 'Homo sapiens ~11 min avant minuit'); }
{ const I = inv('penduleFoucault').precession, o = sorties.penduleFoucault; entre(I.tourCompletHeures, 31, 33, 'Foucault Paris ~32 h'); ok(I.mesure < 0, 'Foucault : sens horaire au nord');
  ok(sim('penduleFoucault', { latitude: -48.85 }).invariants.precession.mesure > 0, 'Foucault : sens inverse au sud'); entre(sim('penduleFoucault', { latitude: 90 }).invariants.precession.tourCompletHeures, 23.5, 24.5, 'Foucault pole ~24 h');
  entre(Math.abs(sim('penduleFoucault', { latitude: 0 }).invariants.precession.mesure), 0, 1e-6, 'Foucault : rien a l equateur');
  let pire = 0; for (let i = 0; i < o.n; i++) pire = Math.max(pire, Math.abs(Math.hypot(o.brut[3 * i], o.brut[3 * i + 1]) - 3)); ok(pire < 0.05, 'Foucault : chaque point = une extremite (r = amplitude 3 m) : ' + pire); }
{ const I = inv('mouvementTerre'), o = sorties.mouvementTerre; entre(I.vitesseSoleil.kms, 200, 260, 'Soleil > 200 km/s'); entre(I.pasHelice.mesure, 44, 56, 'helice ~50 UA par an'); entre(I.inclinaison.degres, 55, 65, 'inclinaison ~60 deg');
  ok(o.brut[3] === 0 && Math.abs(o.brut[4 * (o.n - 1) + 3] - 6) < 1e-9, 'mouvementTerre : colonne 4 = temps en annees (0 -> 6)'); }
{ const I = inv('evaporationTrouNoir'), o = sorties.evaporationTrouNoir; entre(I.dureeDeVie.log10Ans, 66.5, 67.8, 'evaporation ~1e67 ans'); entre(I.loiM3.rapport, 7.9, 8.1, 'evaporation : x8');
  entre(I.temperature.kelvin, 5e-8, 7e-8, 'Hawking ~6e-8 K'); entre(o.brut[4 * (o.n - 1)], 0.9998, 0.99995, 'evaporation : dessine jusqu a 99.99 %');
  ok(Math.abs(o.brut[4 * (o.n - 1) + 2] - Math.log10(1 / o.brut[4 * (o.n - 1) + 1])) < 1e-9, 'evaporation : colonne 3 = log10(M0 / M) = log10(T / T0)'); }
{ const I = inv('tsunami'), o = sorties.tsunami, F = LEGENDES.tsunami.film; entre(I.vitesse.kmh, 690, 730, 'tsunami ~700 km/h'); entre(I.traversee.totalMesureH, 13.5, 15, 'tsunami ~14 h'); entre(I.loiDeGreen.amplitudeCoteM, 2, 2.4, 'tsunami ~2.2 m');
  ok(F.reste === undefined && LEGENDES.tsunami.film.note.includes('last ' + (o.n - F.images * F.parImage) + ' rows'), 'tsunami : lignes hors film annoncees');
  ok(Math.abs(o.brut[4 * (F.debuts[F.images - 1]) + 3] - I.traversee.totalMesureH) < 0.05, 'tsunami : colonne 4 en heures'); }
{ const I = inv('geometrieUnivers'); entre(I.sphere.sommeAnglesDeg, 222, 226, 'sphere ~224 deg'); entre(I.plat.sommeAnglesDeg, 179.999, 180.001, 'plan 180'); entre(I.hyperbolique.sommeAnglesDeg, 148, 152, 'hyperbolique ~150');
  ok(I.sphere.circonference < I.plat.circonference && I.plat.circonference < I.hyperbolique.circonference, 'cercles : sphere < plan < hyperbolique'); ok(sorties.geometrieUnivers.params.cote === 1.2, 'cote 1.2 par defaut'); }
entre(inv('tailleEtoiles').terreSoleil.inverse, 108, 110, 'Soleil ~109 Terres');

/* 7. game81 : les champs quantiques — colonnes relues dans les lignes, chiffres annonces relus dans les invariants / SOURCES du module */
const CHQ = TS.systeme('champLibre').mod, SRC = (k) => CHQ.SOURCES[k].valeur;
const col = (o, j) => { const v = []; for (let i = 0; i < o.n; i++) v.push(o.brut[i * o.D + j]); return v; };
const mn = (v) => v.reduce((a, b) => Math.min(a, b), Infinity), mx = (v) => v.reduce((a, b) => Math.max(a, b), -Infinity);
const bloc = (o, F, k, j) => { const v = []; for (let r = 0; r < F.tailles[k]; r++) v.push(o.brut[(F.debuts[k] + r) * o.D + j]); return v; };
/* les films dont un « moment » n est pas un instant le disent, dans le film et dans les couleurs */
for (const id of ['fluctuationsVide', 'paireSchwinger', 'couplageCourant', 'atomes', 'quarks']) ok(LEGENDES[id].film.note && LEGENDES[id].film.note.split('; ').some((seg) => !seg.startsWith('frames of unequal') && LEGENDES[id].couleurs.includes('Here ' + seg)), id + ' : sens d une image dit');
/* champ libre : sites entiers 0..255, paquet a ~0.75 c, s elargit */
{ const o = sorties.champLibre, I = inv('champLibre'), s = col(o, 0); ok(s.every((x) => Number.isInteger(x) && x >= 0 && x < 256), 'champLibre : colonne 1 = site 0..255');
  entre(I.vitesseGroupe.mesure, 0.74, 0.76, 'champLibre : vitesse de groupe ~0.75 c'); entre(I.vitesseGroupe.formule, 0.74, 0.76, 'champLibre : formule ~0.75');
  ok(I.largeurPaquet.fin > I.largeurPaquet.debut && I.energie.derive < 1e-6, 'champLibre : le paquet s elargit, energie conservee'); }
/* vide : 64 sites, echantillons 0..11, 3000 tirages, variances conformes */
{ const o = sorties.fluctuationsVide, I = inv('fluctuationsVide'); ok(mx(col(o, 0)) < 64 && col(o, 1).every((x) => Number.isInteger(x) && x >= 0 && x <= 11) && mx(col(o, 1)) === 11, 'vide : sites < 64, echantillons 0..11');
  ok(I.echantillons === 3000 && I.variancesModes.pireEcartSigma < 5, 'vide : 3000 tirages, variances 1/(2 omega) a < 5 sigma : ' + I.variancesModes.pireEcartSigma); }
/* interaction : phi = 1 partout au depart, chi ~1e-6, taux ~0.125 (KLS), ~15 % dans chi a la fin */
{ const o = sorties.interactionChamps, F = LEGENDES.interactionChamps.film, R = inv('interactionChamps').resonance, T = inv('interactionChamps').transfert;
  ok(bloc(o, F, 0, 2).every((x) => x === 1) && mx(bloc(o, F, 0, 3).map(Math.abs)) < 1e-5, 'interaction : phi = 1 et chi minuscule au depart');
  ok(col(o, 0).every((x) => Number.isInteger(2 * x) && x >= 0 && x <= 127.5) && mx(col(o, 0)) > 126, 'interaction : sites de pas 0.5, 256 sites (0 a 127.5)'); entre(R.tauxMax, 0.11, 0.14, 'interaction : taux ~0.125'); ok(R.tauxKLS === 0.125, 'interaction : taux KLS 0.125');
  entre(T.fractionChiFin, 0.12, 0.18, 'interaction : ~15 % dans chi'); ok(inv('interactionChamps').energieTotale.derive < 1e-3, 'interaction : energie conservee'); }
/* Schwinger : 40 paires dessinees, ~0.3 attendue, champs critique ~1.3e18 et defaut ~6.6e17 V/m ; electron vers -x, positron vers +x */
{ const o = sorties.paireSchwinger, F = LEGENDES.paireSchwinger.film, I = inv('paireSchwinger');
  ok(I.attendu.dessinees === 40 && F.images === 80, 'Schwinger : 40 paires = 80 lignes d univers'); entre(I.attendu.paires, 0.25, 0.35, 'Schwinger : ~0.3 paire attendue');
  entre(I.taux.champCritique, 1.32e18, 1.33e18, 'Schwinger : champ critique ~1.3e18 V/m'); entre(I.taux.champSI, 6.6e17, 6.7e17, 'Schwinger : defaut ~6.6e17 V/m');
  ok(I.vitesseMax.fin < 1 && I.vitesseMax.fin > 0.95 && I.hyperbole.derive < 1e-9, 'Schwinger : hyperboles, vitesse -> c sans l atteindre');
  let sens = true; for (let k = 0; k < F.images; k++) { const x = bloc(o, F, k, 0), y = bloc(o, F, k, 1), t = bloc(o, F, k, 3);
    if ((k % 2 === 0 ? x[x.length - 1] >= x[0] : x[x.length - 1] <= x[0]) || mx(y) !== mn(y) || mx(t) !== 10) sens = false; }
  ok(sens, 'Schwinger : electron (image paire) vers -x, positron vers +x, position laterale fixe, jusqu au temps 10'); }
/* Unruh : hyperbole x^2 - t^2 = 1, tau de -3 a 3, energie moyenne ~2.7 T, 4e-21 K pour 1 m/s^2, ~2.5e20 m/s^2 pour 1 K */
{ const o = sorties.effetUnruh, I = inv('effetUnruh'); let h = 0; for (let i = 0; i < o.n; i++) h = Math.max(h, Math.abs(o.brut[4 * i] ** 2 - o.brut[4 * i + 1] ** 2 - 1)); ok(h < 1e-9, 'Unruh : colonnes 1, 2 = x, t sur x^2 - t^2 = 1');
  ok(Math.abs(mn(col(o, 3)) + 3) < 1e-12 && Math.abs(mx(col(o, 3)) - 3) < 1e-12 && mn(col(o, 2)) > 0, 'Unruh : temps propre -3..3, energies > 0');
  entre(I.energieMoyenne.theorie / I.temperature.naturelle, 2.69, 2.71, 'Unruh : energie moyenne ~2.7 T'); ok(Math.abs(I.energieMoyenne.mesure / I.energieMoyenne.theorie - 1) < 0.05, 'Unruh : tirages conformes');
  entre(I.temperature.pourUnMetreParSeconde2, 4.0e-21, 4.1e-21, 'Unruh : ~4e-21 K a 1 m/s^2'); entre(1 / I.temperature.pourUnMetreParSeconde2, 2.4e20, 2.5e20, 'Unruh : ~2.5e20 m/s^2 pour 1 K'); }
/* couplages : log10 Q de -4 a 3, 1/alpha 137 -> ~133 au Z, alpha_s ~0.17 / 0.118 / 0.088, QCD des 3 GeV */
{ const o = sorties.couplageCourant, F = LEGENDES.couplageCourant.film, I = inv('couplageCourant');
  ok(F.images === 2 && bloc(o, F, 0, 2).every((x) => x === 0) && bloc(o, F, 1, 2).every((x) => x === 1), 'couplage : image 1 = QED (0), image 2 = QCD (1), dans l ordre des noms');
  ok(Math.abs(mn(col(o, 0)) + 4) < 1e-12 && Math.abs(mx(col(o, 0)) - 3) < 1e-12 && Math.abs(10 ** mn(bloc(o, F, 1, 0)) - 3) < 1e-9, 'couplage : log10 Q de -4 a 3, QCD des 3 GeV');
  entre(I.inverseAlpha.Q0, 136.9, 137.1, 'couplage : 1/alpha ~137'); entre(I.inverseAlpha.MZleptons, 132.5, 133.5, 'couplage : ~133 au Z'); entre(I.deltaAlphaLeptonsMZ.MZ, 91, 91.3, 'couplage : Z a 91 GeV');
  entre(I.alphaS.Q10, 0.165, 0.175, 'alpha_s(10) ~0.17'); entre(I.alphaS.MZ, 0.1175, 0.1185, 'alpha_s(MZ) ~0.118'); entre(I.alphaS.Q1000, 0.0875, 0.0885, 'alpha_s(1000) ~0.088');
  ok(SRC('alphaSMZ') === 0.1179, 'couplage : 0.1179 = SOURCES.alphaSMZ'); }
/* Compton : directions sur la sphere unite, ~65 % vers l avant, 50 % a basse energie, moitie de l energie en arriere, ~56 % de Thomson */
{ const o = sorties.comptonKleinNishina, I = inv('comptonKleinNishina'); let s = 0; for (let i = 0; i < o.n; i++) s = Math.max(s, Math.abs(Math.hypot(o.brut[4 * i], o.brut[4 * i + 1], o.brut[4 * i + 2]) - 1)); ok(s < 1e-12, 'Compton : directions unitaires');
  ok(o.params.energie === 0.5, 'Compton : defaut 0.5 m_e c^2'); entre(0.5 * SRC('meMeV'), 0.25, 0.26, 'Compton : ~0.26 MeV');
  entre(I.avant.theorie, 0.64, 0.66, 'Compton : ~65 % vers l avant'); ok(Math.abs(I.avant.fraction - I.avant.theorie) < 4 * I.avant.sigma, 'Compton : tirages conformes');
  entre(sim('comptonKleinNishina', { energie: 0.001 }).invariants.avant.theorie, 0.49, 0.51, 'Compton : 50 % a basse energie');
  entre(mn(col(o, 3)), 0.5, 0.505, 'Compton : moitie de l energie gardee en arriere'); ok(mx(col(o, 3)) <= 1 && I.decalageCompton.pireEcart < 1e-12, 'Compton : decalage exact');
  entre(I.sectionEfficace.mesure / I.sectionEfficace.thomson, 0.55, 0.57, 'Compton : ~56 % de Thomson'); }
/* atomes : fer, configuration lue, colonne 4 = n + l/10 dans l ordre des noms, rayons 1s ~0.06 et 4s ~6 */
{ const o = sorties.atomes, F = LEGENDES.atomes.film, I = inv('atomes'), N = LEGENDES.atomes.noms;
  ok(o.params.Z === 26 && I.configuration === '1s2 2s2 2p6 3s2 3p6 4s2 3d6' && F.images === 26, 'atomes : fer, 26 electrons, configuration du module');
  const vus = []; for (let k = 0; k < F.images; k++) { const v = bloc(o, F, k, 3); if (mx(v) !== mn(v)) vus.push('?'); const nm = Math.floor(v[0]) + 'spdf'[Math.round(10 * (v[0] - Math.floor(v[0])))]; if (vus[vus.length - 1] !== nm) vus.push(nm); }
  ok(vus.join() === N.map((x) => x.slice(9, 11)).join(), 'atomes : sous-couches des images = noms : ' + vus.join());
  entre(I.rayonsMoyens['1s'].mesure, 0.05, 0.07, 'atomes : 1s ~0.06 Bohr'); entre(I.rayonsMoyens['4s'].mesure, 5.5, 7, 'atomes : 4s ~6 Bohr');
  ok(nomsDe('atomes', { Z: 10 }).join() === 'Subshell 1s (2 electrons),Subshell 2s (2 electrons),Subshell 2p (6 electrons)', 'atomes : neon'); }
/* quarks : 10 + 1 images, 0.2 fm -> ~1.2 fm, energie croissante, derniere image = apres cassure, niveaux ~3090 / ~3672 MeV */
{ const o = sorties.quarks, F = LEGENDES.quarks.film, I = inv('quarks'), E = F.debuts.map((d) => o.brut[4 * d + 3]);
  ok(o.params.images === 10 && F.images === 11, 'quarks : 10 images etirees + 1 cassee');
  ok(mx(bloc(o, F, 0, 0).map(Math.abs)) <= 0.1 && E.slice(0, 10).every((e, k) => k === 0 || e > E[k - 1]) && Math.abs(E[10] - I.cassure.seuil) < 1e-12, 'quarks : depart 0.2 fm, energie croissante, derniere = seuil de cassure');
  entre(I.cassure.rayonFm, 1.2, 1.26, 'quarks : cassure ~1.2 fm'); ok(I.cassure.sousSeuil2S, 'quarks : psi(2S) sous le seuil DD');
  entre(I.spectre.JPsi, 3085, 3095, 'quarks : J/psi ~3090'); entre(I.spectre.psi2S, 3665, 3680, 'quarks : psi(2S) ~3672');
  const w = col(o, 1); let s2 = 0; for (const x of w) s2 += x * x; entre(Math.sqrt(s2 / w.length), 0.13, 0.17, 'quarks : largeur illustrative 0.15 fm'); }

console.log('test-tam-legendes-20261101 : ' + nOk + ' assertions OK');
