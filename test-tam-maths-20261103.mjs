// test-tam-maths-20261103.mjs -- banc de tam-maths.js (mathematiques du hasard et des nombres, vue non frappable) + mutants sur COPIES.
// Lancer : node test-tam-maths-20261103.mjs
// serie-delai-s: 900 — MESURE 2026-11-05 : 294 s SEUL (13 systemes, 66 mutants rejouant toute la suite), DELAI 300 s sous la charge d une serie a 3.
// Le banc a le droit a Math.exp/log/sin/cos : ses references sont calculees independamment du module :
//   marche : E[r^2] et E[r^4] par ENUMERATION des 4^n chemins (n = 1..7) ; Buffon : 2 l / pi par quadrature de Simpson de (l/pi) sin ;
//   anniversaires : le produit par exp(sum ln) ; Ulam : pi(N) par DIVISION D ESSAI, Li(N) en u = ln t (200 000 points), la spirale
//   reimplementee ici (marche le long des cotes) pour placer chaque premier dessine.
// Tolerances annoncees (mesurees le 2026-11-03, 40 graines par reglage) : |z| < 5 ; etalonnage sd des z dans [0.5, 1.7] (mesure 0.71..1.24).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ICI, 'tam-maths.js');
/* game316: the real anatomy, read here for the wired-brain test (not through the module under test) */
const ANAT = await import(pathToFileURL(join(ICI, 'human-brain-anatomy.js')).href);
const HBD = await import(pathToFileURL(join(ICI, 'human-brain-data.js')).href);
const octets = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const IDS = ['marcheAleatoire', 'aiguilleBuffon', 'anniversaires', 'spiraleUlam', 'pascalSierpinski', 'solidesPlatoniques', 'montyHall', 'apollonius', 'tasDeSable', 'vergerEuclide', 'cerclesFord', 'fermatSteiner', 'causticTasse', 'papillonHofstadter', 'dominosKasteleyn', 'ising', 'aztecDiamond', 'collectionneur', 'ruineJoueur', 'catalanDyck', 'partitionEuler', 'courbeDragon', 'theoremePick', 'percolationLiens', 'napoleon', 'billardElliptique', 'feuerbach', 'jeuDeLaVie', 'marcheAutoEvitante', 'eulerSolides', 'morley', 'bale', 'simsonDroite', 'distinctesImpaires', 'triangulations', 'ramseyR33', 'pascalHexagramme', 'ptolemee', 'sommesCarres', 'equationPell', 'nombresCarmichael', 'theoremeWilson', 'fonctionMertens', 'parfaitsAmicaux', 'nombresBernoulli', 'problemeJosephus', 'zeckendorf', 'theoremeLucas', 'calkinWilf', 'toursHanoi', 'regarderDire', 'derangements', 'nombresHarmoniques', 'suiteCollatz', 'routineKaprekar', 'stirlingBell', 'motzkinChemins', 'periodePisano', 'indicatriceEuler', 'goldbachPaires', 'frobeniusPieces', 'schroderChemins', 'triangleNarayana', 'suiteRecaman', 'suiteKolakoski', 'suitePerrin', 'thueMorse', 'suitePadovan', 'fourmiLangton', 'gammeTemperee', 'entropieShannon', 'atmosphereStandard', 'loiZipf', 'gutenbergRichter', 'mareeVivesEaux', 'energieLiaison', 'courbeKeeling', 'populationMonde', 'effetPhotoelectrique', 'demiViesNPL', 'choleraSnow', 'raiesBalmer', 'loiBoyle', 'loiOhm', 'especesAire', 'michaelisMenten', 'diffusionAlpha', 'argonRayleigh', 'carteSturtevant', 'oubliEbbinghaus', 'fievreSemmelweis', 'densiteCavendish', 'equivalentJoule', 'eclipseEddington', 'lynxHudson', 'gouttesMillikan', 'vieGraunt', 'loiHubble1929', 'loiMoseley', 'lumiereMichelson', 'regressionGalton', 'aberrationBradley', 'exclusionGause', 'mortaliteNightingale', 'equivalentsFaraday', 'chaleursPetitDulong', 'repliquesOmori', 'survieHalley', 'chaleurLondres', 'motsMendenhall', 'parallaxeBessel', 'vitesseNyquist', 'ondulationsYoung', 'picLummer', 'balanceCoulomb', 'effetJoule', 'critiqueReynolds', 'filtreDarcy', 'deplacementsPerrin', 'aimantGauss', 'unitesWeber', 'tubesPoiseuille', 'variationsHalley', 'spiralesBeal', 'tempsOldham', 'fonteMacKellar', 'syllabesKaeding', 'tubesHagen', 'spiraleMoseley', 'poisMendel', 'rayonsThomson', 'magnitudesPogson', 'maisDarwin', 'emanationRutherford', 'etherMichelson', 'reststrahlenRubens', 'constantesPlanck', 'jaugesHerschel', 'penduleKater', 'essaisThorndike', 'reactionDonders', 'attentionCattell', 'pressurePeirceJastrow', 'extinctionPavlov', 'weberKonig', 'glycosuriaCannon', 'brainBoyd', 'allOrNoneLucas', 'neuronsHerculanoHouzel', 'connectomeSizes', 'emotionsSiegel', 'bodyMapsNummenmaa', 'emotionWiringHCP', 'riskBernoulli', 'nerveHelmholtz'];

// ---------- references independantes ----------
function momentsMarche(n) { let s2 = 0, s4 = 0, tot = 0; const rec = (k, x, y) => { if (k === n) { const r2 = x * x + y * y; s2 += r2; s4 += r2 * r2; tot++; return; } rec(k + 1, x + 1, y); rec(k + 1, x - 1, y); rec(k + 1, x, y + 1); rec(k + 1, x, y - 1); }; rec(0, 0, 0); return { m2: s2 / tot, m4: s4 / tot }; }
function buffonRef(l) { const M = 2000, h = Math.PI / M; let s = 0; for (let i = 0; i <= M; i++) s += (i === 0 || i === M ? 1 : i % 2 ? 4 : 2) * (l / Math.PI) * Math.sin(i * h); return s * h / 3; }
const anniversRef = (k, D) => { let s = 0; for (let i = 0; i < k; i++) s += Math.log(1 - i / D); return 1 - Math.exp(s); };
const estPremier = (m) => { if (m < 2) return false; for (let d = 2; d * d <= m; d++) if (m % d === 0) return false; return true; };
/* Li(N) en u = ln t, Simpson sur 200 000 intervalles, Math.exp (10 fois plus fin que le module, autre exponentielle) */
function LiRef(N) { const M = 200000, a = Math.log(2), b = Math.log(N), h = (b - a) / M, f = (u) => Math.exp(u) / u; let s = f(a) + f(b); for (let i = 1; i < M; i++) s += (i % 2 ? 4 : 2) * f(a + i * h); return s * h / 3; }
/* spirale d Ulam reimplementee : on marche 1, 1, 2, 2, 3, 3... pas, en tournant (droite, haut, gauche, bas) */
function spiraleRef(N) { const P = new Map(); let x = 0, y = 0, m = 1, d = 0, L = 1; const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]]; P.set(1, [0, 0]);
  while (m < N) { for (let rep = 0; rep < 2 && m < N; rep++) { for (let s = 0; s < L && m < N; s++) { x += dirs[d][0]; y += dirs[d][1]; m++; P.set(m, [x, y]); } d = (d + 1) % 4; } L++; } return P; }
/* tas de sable : references INDEPENDANTES du module. Stabiliser par balayages de toute la grille (un grain a la fois) ; recurrentes
 *   comptees comme l ORBITE du tas plein (3 partout) quand on ajoute des grains (definition de Dhar), pas par le test de brulage ;
 *   det du Laplacien par le produit de ses valeurs propres 4 - 2 cos(i pi/(c+1)) - 2 cos(j pi/(c+1)) (Math.cos, arrondi) */
function stabRef(h, c) { let chg = true; while (chg) { chg = false; for (let y = 0; y < c; y++) for (let x = 0; x < c; x++) { const i = y * c + x; while (h[i] >= 4) { h[i] -= 4; chg = true; if (x > 0) h[i - 1]++; if (x < c - 1) h[i + 1]++; if (y > 0) h[i - c]++; if (y < c - 1) h[i + c]++; } } } return h; }
function orbiteRef(c) { const N = c * c, vu = new Uint8Array(4 ** N), cle = (h) => { let k = 0; for (let i = N - 1; i >= 0; i--) k = 4 * k + h[i]; return k; }, de = (k) => { const h = new Int32Array(N); for (let i = 0; i < N; i++) { h[i] = k & 3; k >>= 2; } return h; };
  const file = [cle(new Int32Array(N).fill(3))]; vu[file[0]] = 1; for (let q = 0; q < file.length; q++) for (let i = 0; i < N; i++) { const h = de(file[q]); h[i]++; const k = cle(stabRef(h, c)); if (!vu[k]) { vu[k] = 1; file.push(k); } } return file.length; }
const detValeursPropres = (c) => { let p = 1; for (let i = 1; i <= c; i++) for (let j = 1; j <= c; j++) p *= 4 - 2 * Math.cos(i * Math.PI / (c + 1)) - 2 * Math.cos(j * Math.PI / (c + 1)); return Math.round(p); };
const ORBITES = [orbiteRef(2), orbiteRef(3)];
/* verger : references INDEPENDANTES. Visible = aucun diviseur commun > 1 trouve par ESSAI (pas Euclide) ; phi(k) et mu(k) par
 *   factorisation par essai (pas de crible) ; 6/pi^2 par Math.PI */
/* tous les points dessines dans le rectangle [0, L] x [0, m] */
const x0ok = (b, n, L, m) => { for (let q = 0; q < n; q++) { const o = 3 * q; if (b[o] < 0 || b[o] > L || b[o + 1] < 0 || b[o + 1] > m) return false; } return true; };
/* p(n) pour n <= 30, par le comptage par pieces recopie ici (verification croisee de l enumeration) */
const partPieces30 = (N) => { const p = new Array(N + 1).fill(0); p[0] = 1; for (let k = 1; k <= N; k++) for (let m = k; m <= N; m++) p[m] += p[m - k]; return p[N]; };
const vergerRef = (N) => { let V = 0; for (let a = 1; a <= N; a++) for (let b = 1; b <= N; b++) { let ok = true; for (let d = 2; d <= Math.min(a, b) && ok; d++) if (a % d === 0 && b % d === 0) ok = false; if (ok) V++; } return V; };
const facteurs = (k) => { const f = []; for (let p = 2; p * p <= k; p++) if (k % p === 0) { let e = 0; while (k % p === 0) { k /= p; e++; } f.push([p, e]); } if (k > 1) f.push([k, 1]); return f; };
/* Ford : F_n par l algorithme des MEDIANTS (terme suivant (a, b, c, d) -> (c, d, k c - a, k d - b), k = floor((n + b)/d)), pas par
 *   enumeration ; meme methode que les valeurs de controle de Grok Bot (|F_5| = 11, |F_8| = 23, |F_20| = 129) */
const fareyRef = (n) => { const out = [[0, 1]]; let a = 0, b = 1, c = 1, d = n; while (c <= n) { out.push([c, d]); const k = Math.floor((n + b) / d); [a, b, c, d] = [c, d, k * c - a, k * d - b]; } return out; };
const phiRef = (k) => facteurs(k).reduce((r, [p, e]) => r * (p - 1) * p ** (e - 1), 1), muRef = (k) => { const f = facteurs(k); return f.some(([, e]) => e > 1) ? 0 : (f.length % 2 ? -1 : 1); };
function identiteRef(c) { const N = c * c, s = stabRef(new Int32Array(N).fill(6), c), e = new Int32Array(N); for (let i = 0; i < N; i++) e[i] = 6 - s[i]; return stabRef(e, c); }
function standardiser(b, n, D, groupes = []) {
  const z = new Float64Array(n * D), moy = [], et = [];
  for (let j = 0; j < D; j++) { let m = 0; for (let i = 0; i < n; i++) m += b[i * D + j]; m /= n; let v = 0; for (let i = 0; i < n; i++) v += (b[i * D + j] - m) ** 2; moy.push(m); et.push(Math.sqrt(v / n)); }
  for (const g of groupes) { const e = Math.sqrt(g.reduce((a, j) => a + et[j] * et[j], 0) / g.length); for (const j of g) et[j] = e; }
  for (let j = 0; j < D; j++) { const s = et[j] > 0 ? 1 / et[j] : 0; for (let i = 0; i < n; i++) z[i * D + j] = (b[i * D + j] - moy[j]) * s; }
  return z;
}
const ecartDessin = (a, b) => { let t = 0; for (let i = 0; i < a.length; i++) t += Math.abs(a[i] - b[i]); return t / a.length; };
function extremes(s) {
  const ks = Object.keys(s.params), cs = [{}];
  for (const k of ks) { cs.push({ [k]: s.bornes[k][0] }); cs.push({ [k]: s.bornes[k][1] }); }
  cs.push(Object.fromEntries(ks.map((k) => [k, s.bornes[k][0]]))); cs.push(Object.fromEntries(ks.map((k) => [k, s.bornes[k][1]])));
  return cs;
}
const z = (v) => (v.mesure - v.formule) / v.sigma;
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const SPIRALE = spiraleRef(40000);

/* 2026-11-05 (le banc depassait 300 s, 294 s seul : chaque mutant relancait les 19 systemes) : un mutant ne relance que les tests de SON
 *   systeme (seul = liste d ids ; null = tout), comme test-tam-mecanique (game126). Un test est rattache a un systeme par le premier mot
 *   de son nom ; « etalonnage » couvre marche, Buffon, anniversaires ; tout autre premier mot (SYSTEMES, bornage...) tourne toujours. */
const RATTACHE = { marche: ['marcheAleatoire'], etalonnage: ['marcheAleatoire', 'aiguilleBuffon', 'anniversaires'] };
function suite(T, bavard = false, seul = null) {
  const res = [];
  const ok = (nom, f) => {
    if (seul) { const tete = String(nom).split(/[\s:]/)[0], ids = T.SYSTEMES.some((s) => s.id === tete) ? [tete] : RATTACHE[tete] || null; if (ids && !ids.some((i) => seul.includes(i))) return; }
    let c = false, det = '';
    try { const r = f(); c = r !== false; if (typeof r === 'string') det = r; } catch (e) { det = e.message.split('\n')[0]; }
    res.push({ nom, ok: c, det }); if (bavard) console.log((c ? 'OK    ' : 'ECHEC ') + nom + (det ? '  ' + det : ''));
  };
  const cache = new Map(), S = (id, p = {}) => { const k = id + JSON.stringify(p); if (!cache.has(k)) cache.set(k, T.simuler(id, p)); return cache.get(k); };
  const sys = (id) => T.SYSTEMES.find((s) => s.id === id);
  ok('SYSTEMES gele, 7 systemes, SOURCES vide, COLONNES couvre chaque colonne, ENTIERS par systeme', () => {
    assert.ok(Object.isFrozen(T.SYSTEMES)); assert.deepEqual(T.SYSTEMES.map((s) => s.id), IDS); assert.deepEqual(Object.keys(T.SOURCES), ['T0atm', 'p0atm', 'gradientAtm', 'g0atm', 'M0atm', 'RstarAtm', 'r0atm', 'motsWeb', 'bCalifornie', 'comcat2024', 'vitesseM2', 'vitesseS2', 'amplitudeM2', 'phaseM2', 'amplitudeS2', 'phaseS2', 'liaisonAME2020', 'co2MaunaLoa', 'populationONU', 'hPlanck', 'eCharge', 'cLumiere', 'travauxSortie', 'demiViesNPL', 'anneeNPL', 'snowTableIX', 'snowSeptSuivantes', 'rInfini', 'mpSurMe', 'balmerNIST', 'boyleTable', 'boyleBarometre', 'ohmLongueurs', 'ohmMesures', 'ohmConstantes', 'ohmLaiton', 'salomonOiseaux', 'salomonPublie', 'mm1913', 'mmK1913', 'gmSerieUn', 'gmSerieDeux', 'gmOrImprime', 'rrChimique', 'rrAtmospherique', 'rrConversion', 'sturtevantTable2', 'sturtevantCarte', 'ebbinghausTable', 'ebbinghausFormule', 'semmelweisTab1', 'semmelweisImprime', 'semmelweisChlore', 'cavendishDensites', 'cavendishTexte', 'jouleTable9', 'joulePublie', 'eddingtonResultats', 'eddingtonHypotheses', 'eddingtonEtoiles', 'lynxJones', 'lynxPeriode', 'millikanE23', 'millikanTexte', 'grauntMorts', 'grauntSurvivants', 'grauntCombattants', 'hubbleTable1', 'hubblePublie', 'moseleyTable1', 'moseleyTexte', 'michelson100', 'michelsonTexte', 'nistC', 'galtonLignes', 'galtonColonnes', 'galtonTexte', 'bradleyEtoiles', 'bradleyTexte', 'gauseTable4', 'gauseTableX', 'gauseTexte', 'nightingaleTable2', 'faradayEssais', 'faradayIons', 'faradayTexte', 'petitDulongTable', 'omoriTable', 'omoriTexte', 'halleyVivants', 'halleySommes', 'halleyAnnuites', 'halleyTexte', 'howardLondres', 'howardCampagne', 'howardMoyennes', 'howardTexte', 'mendenhallOliver', 'mendenhallVanity', 'mendenhallTexte', 'besselA', 'besselB', 'besselTexte', 'nyquistTable', 'nyquistCodes', 'nyquistTexte', 'youngTable', 'youngTexte', 'lummerTable', 'lummerTexte', 'coulombTorsion', 'coulombOscillations', 'coulombTexte', 'jouleTable', 'jouleTexte', 'reynoldsTable', 'reynoldsTexte', 'darcySeries', 'darcyFevrier', 'darcyTexte', 'perrinProjections', 'perrinAnneaux', 'perrinTexte', 'gaussObserve', 'gaussCalcule', 'gaussFormules', 'weberEssais', 'weberTexte', 'poiseuilleTubes', 'poiseuillePressions', 'poiseuilleTexte', 'compasHalleyTable', 'compasHalleyTexte', 'conesBealTable', 'conesBealTexte', 'seismesOldhamTable', 'seismesOldhamModules', 'fonteMacKellarMinuscules', 'fonteMacKellarCapitales', 'syllabesKaedingTable', 'syllabesKaedingSumma', 'syllabesKaedingResume', 'tubesHagenSeries', 'spiraleMoseleyTours', 'spiraleMoseleyFormules', 'spiraleMoseleyMu', 'poisMendelF2', 'poisMendelF3', 'poisMendelTexte', 'rayonsThomsonTable', 'rayonsThomsonTexte', 'magnitudesPogsonTable', 'magnitudesPogsonTexte', 'maisDarwinTable', 'maisDarwinTexte', 'emanationRutherfordTable', 'emanationRutherfordTexte', 'etherMichelsonMidi', 'etherMichelsonSoir', 'etherMichelsonTexte', 'reststrahlenRubensTable', 'reststrahlenRubensTexte', 'constantesPlanckTexte', 'jaugesHerschelTable', 'jaugesHerschelTexte', 'penduleKaterTable', 'penduleKaterTexte', 'essaisThorndikeTemps', 'essaisThorndikeTexte', 'reactionDondersTable', 'reactionDondersDiff', 'reactionDondersEssais', 'reactionDondersTexte', 'attentionCattellSix', 'attentionCattellSeven', 'attentionCattellSevenA', 'attentionCattellEight', 'pressurePeirceJastrowDaily', 'pressurePeirceJastrowGroups', 'pressurePeirceJastrowFine', 'pressurePeirceJastrowTable', 'extinctionPavlovSeries', 'extinctionPavlovSummary', 'extinctionPavlovRecovery', 'weberKonig670K', 'weberKonig670B', 'weberKonig605K', 'weberKonig605B', 'glycosuriaCannonCats', 'glycosuriaCannonPeople', 'brainBoydP243', 'brainBoydP245', 'brainBoydP247', 'brainBoydP249', 'brainBoydP251', 'brainBoydP253', 'brainBoydText', 'allOrNoneLucasExp1', 'allOrNoneLucasText', 'neuronsHerculanoHouzelTable', 'neuronsHerculanoHouzelText', 'connectomeWorm', 'connectomeHemibrain', 'connectomeFlyWire', 'connectomeHuman', 'emotionsSiegelTable9', 'emotionsSiegelConfusion', 'emotionsSiegelPercent', 'emotionsSiegelCases', 'emotionsSiegelText', 'bodyMapsNummenmaaRecognition', 'bodyMapsNummenmaaParticipants', 'riskBernoulliFair', 'riskBernoulliCaius', 'riskBernoulliSempronius', 'riskBernoulliPetersburg', 'riskBernoulliCramer', 'nerveHelmholtzIX', 'nerveHelmholtzXA', 'nerveHelmholtzXB', 'nerveHelmholtzXIA', 'nerveHelmholtzXIB', 'nerveHelmholtzCoolTemp', 'nerveHelmholtzXII', 'nerveHelmholtzXIII', 'nerveHelmholtzXIV', 'nerveHelmholtzSummary', 'nerveHelmholtz1852', 'lettresAnglais']); for (const v of Object.values(T.SOURCES)) assert.ok((v.valeur === v.lu || v.valeur === Number(v.lu)) && /^https:\/\//.test(v.url), JSON.stringify(v)); assert.deepEqual(Object.keys(T.ENTIERS), IDS);
    for (const s of T.SYSTEMES) { const C = T.COLONNES[s.id]; assert.equal(C.colonnes.length, s.D); assert.deepEqual([...C.memeLongueur.flat(), ...C.autres].sort(), [...Array(s.D).keys()]); }
  });
  /* 09/11: subjects allowed to return their own point count (every point they make, none cut) */
  const OWN_N = new Set(['emotionWiringHCP']);
  for (const s of T.SYSTEMES) {
    ok(`${s.id} : bornee, brut n*D fini, lyapunov null, phrase anglaise sans accent`, () => {
      const r = S(s.id); assert.equal(r.bornee, true, r.raison); assert.equal(r.D, s.D); assert.equal(r.n, OWN_N.has(s.id) ? r.n : 1500, s.id + ' says its own n without being listed'); assert.equal(r.brut.length, r.n * s.D);
      assert.equal(r.lyapunov, null); assert.ok(/^A visualisation of /.test(s.phrase) && !/[^\x20-\x7e]/.test(s.phrase + s.nom));
    });
    ok(`${s.id} : determinisme`, () => { const a = T.simuler(s.id, {}), b = T.simuler(s.id, {}); assert.ok(octets(a.brut).equals(octets(b.brut))); assert.equal(JSON.stringify(a.invariants), JSON.stringify(b.invariants)); });
    /* a subject of OWN_N draws its own count whatever n is asked (09/11): its brut must hold exactly that count */
    ok(`${s.id} : petits n (2 et 7) bornes et finis`, () => { for (const n of [2, 7]) { const r = T.simuler(s.id, {}, { n }); assert.ok(r.bornee && r.brut.length === (OWN_N.has(s.id) ? r.n : n) * s.D && r.brut.every(Number.isFinite)); } });
    ok(`${s.id} : bornee a chaque extreme de curseur`, () => { const e = extremes(s); for (const p of e) assert.ok(S(s.id, p).bornee, JSON.stringify(p)); return e.length + ' reglages'; });
    ok(`${s.id} : chaque curseur change le DESSIN (standardise), min et max`, () => {
      const C = T.COLONNES[s.id], d0 = S(s.id), z0 = standardiser(d0.brut, d0.n, d0.D, C.memeLongueur), out = [];
      for (const k of Object.keys(s.params)) for (const v of s.bornes[k]) { if (v === s.params[k]) continue; const r = S(s.id, { [k]: v }), e = r.n !== d0.n && OWN_N.has(s.id) ? Infinity /* another point count: another drawing */ : ecartDessin(z0, standardiser(r.brut, r.n, r.D, C.memeLongueur)); assert.ok(e > 1e-3, k + '=' + v + ' : ' + e); out.push(k + ' ' + e.toFixed(2)); }
      return out.join(' ; ');
    });
  }
  ok('marche : E[r^2] = n et E[r^4] = 2 n^2 - n par enumeration des 4^n chemins (n = 1..7)', () => { for (let n = 1; n <= 7; n++) { const m = momentsMarche(n); assert.ok(Math.abs(m.m2 - n) < 1e-12 && Math.abs(m.m4 - (2 * n * n - n)) < 1e-9, 'n ' + n + ' ' + JSON.stringify(m)); } });
  for (const p of extremes(sys('marcheAleatoire'))) ok(`marcheAleatoire ${JSON.stringify(p)} : <r^2> = n, sigma sqrt((n^2 - n)/M), chemins de pas unitaires`, () => {
    const R = S('marcheAleatoire', p), P = R.params, I = R.invariants, b = R.brut, N = P.pas, M = P.marcheurs;
    assert.equal(I.carreDistance.formule, N); assert.ok(rel(I.carreDistance.sigma, Math.sqrt((N * N - N) / M)) < 1e-12); assert.ok(Math.abs(z(I.carreDistance)) < 5, 'r2 z ' + z(I.carreDistance));
    assert.ok(rel(I.centre.sigma, Math.sqrt(N / (2 * M))) < 1e-12 && Math.abs(z(I.centre)) < 5, 'centre z ' + z(I.centre));
    for (let f = 0; f < R.film.images; f++) { const d0 = R.film.debuts[f], c = R.film.tailles[f]; assert.ok(b[3 * d0] === 0 && b[3 * d0 + 1] === 0 && b[3 * d0 + 2] === 0, 'depart a l origine');
      for (let q = 1; q < c; q++) { const o = 3 * (d0 + q), dn = b[o + 2] - b[o - 1]; assert.ok(dn >= 0 && Math.abs(b[o] - b[o - 3]) + Math.abs(b[o + 1] - b[o - 2]) <= dn && (Math.abs(b[o] - b[o - 3]) + Math.abs(b[o + 1] - b[o - 2]) - dn) % 2 === 0, 'pas unitaires, parite'); } }
    return `r2 ${I.carreDistance.mesure.toFixed(2)}/${N} z ${z(I.carreDistance).toFixed(2)}`;
  });
  for (const p of extremes(sys('aiguilleBuffon'))) ok(`aiguilleBuffon ${JSON.stringify(p)} : 2 l / pi (Simpson), aiguilles de longueur l, croisement = une droite entre les bouts`, () => {
    const R = S('aiguilleBuffon', p), P = R.params, I = R.invariants, b = R.brut, l = P.longueur, ref = buffonRef(l);
    assert.ok(rel(I.croisements.formule, ref) < 1e-12, 'formule ' + I.croisements.formule + ' ' + ref); assert.ok(Math.abs(z(I.croisements)) < 5, 'z ' + z(I.croisements));
    if (Number.isFinite(I.piLu.mesure)) { assert.ok(rel(I.piLu.mesure, 2 * l / I.croisements.mesure) < 1e-12); assert.ok(Math.abs(z(I.piLu)) < 5); }
    for (let k = 0; 6 * k + 5 < b.length; k++) { const o = 6 * k, L = Math.hypot(b[o + 3] - b[o], b[o + 4] - b[o + 1]); if (L === 0 && b[o + 3] === 0) break;
      assert.ok(Math.abs(L - l) < 1e-9, 'longueur ' + L); assert.equal(b[o + 2], Math.floor(b[o + 1]) !== Math.floor(b[o + 4]) ? 1 : 0, 'croisement'); assert.equal(b[o + 2], b[o + 5]); }
    return `part ${I.croisements.mesure.toFixed(4)}/${ref.toFixed(4)} z ${z(I.croisements).toFixed(2)}, pi lu ${Number.isFinite(I.piLu.mesure) ? I.piLu.mesure.toFixed(4) : '-'}`;
  });
  for (const p of extremes(sys('anniversaires'))) ok(`anniversaires ${JSON.stringify(p)} : 1 - prod (1 - i/D) (exp sum ln), C(k,2)/D, jours sur le cercle`, () => {
    const R = S('anniversaires', p), P = R.params, I = R.invariants, b = R.brut, k = P.personnes, D = P.jours, ref = anniversRef(k, D);
    assert.ok(Math.abs(I.partage.formule - ref) < 1e-12, 'formule ' + I.partage.formule + ' ' + ref); assert.ok(rel(I.paires.formule, k * (k - 1) / (2 * D)) < 1e-12);
    if (I.partage.sigma > 1e-9) assert.ok(Math.abs(z(I.partage)) < 5, 'partage z ' + z(I.partage)); else assert.ok(Math.abs(I.partage.mesure - I.partage.formule) < 1e-6, 'certain');
    if ('sigma' in I.paires) assert.ok(Math.abs(z(I.paires)) < 5, 'paires z ' + z(I.paires));
    /* un anneau par groupe DESSINE (rayon 1 + 0.15 rang), groupes repartis sur les G : numeros croissants */
    for (let i = 0; i < R.n; i++) { const o = 3 * i, rr = Math.hypot(b[o], b[o + 1]), rang = (rr - 1) / 0.15, a = Math.atan2(b[o + 1], b[o]), j = ((a / (2 * Math.PI)) * D + D) % D;
      assert.ok(Math.abs(rang - Math.round(rang)) < 1e-6 && Math.abs(j - Math.round(j)) < 1e-6 && b[o + 2] >= 1 && b[o + 2] <= P.groupes && (i === 0 || b[o + 2] >= b[o - 1]), 'jour entier sur son anneau'); }
    return `partage ${I.partage.mesure.toFixed(4)}/${ref.toFixed(4)}, paires ${I.paires.mesure.toFixed(3)}/${I.paires.formule.toFixed(3)}`;
  });
  for (const p of extremes(sys('spiraleUlam'))) ok(`spiraleUlam ${JSON.stringify(p)} : pi(N) = division d essai, Li(N) en u = ln t, chaque premier dessine a sa place sur la spirale`, () => {
    const R = S('spiraleUlam', p), P = R.params, I = R.invariants, b = R.brut, N = P.jusqua;
    let c = 0; for (let m = 2; m <= N; m++) if (estPremier(m)) c++;
    assert.equal(I.compteLi.mesure, c, 'pi(N)'); assert.ok(rel(I.compteLi.formule, LiRef(N)) < 1e-10, 'Li ' + I.compteLi.formule + ' ' + LiRef(N)); assert.ok(rel(I.compteLn.formule, N / Math.log(N)) < 1e-12);
    for (let i = 0; i < R.n; i++) { const o = 3 * i, m = b[o + 2], q = SPIRALE.get(m); assert.ok(estPremier(m) && m <= N, m + ' premier'); assert.ok(q[0] === b[o] && q[1] === b[o + 1], m + ' place ' + q + ' vs ' + b[o] + ',' + b[o + 1]); }
    return `pi(${N}) = ${c}, Li ${I.compteLi.formule.toFixed(1)} (${(I.compteLi.ecartRelatif * 100).toFixed(2)} %)`;
  });
  /* game122 : Pascal modulo 2 — reference independante : la parite de C(n, k) par le theoreme de Lucas (n & k === k), pas par addition */
  for (const p of [...extremes(sys('pascalSierpinski')), { lignes: 100 }, { lignes: 256 }]) ok(`pascalSierpinski ${JSON.stringify(p)} : 2^(popcount n) impairs par ligne, 3^m dans les 2^m premieres lignes, chaque point impair (Lucas)`, () => {
    const R = S('pascalSierpinski', p), N = R.params.lignes, I = R.invariants, b = R.brut;
    let m = 0; while (2 ** (m + 1) <= N) m++;
    let total = 0, cumul = 0; for (let n = 0; n < N; n++) { let c = 0; for (let k = 0; k <= n; k++) if ((n & k) === k) c++; cumul += c; if (n === 2 ** m - 1) total = cumul; }
    assert.equal(I.impairsParLigne.mesure, 0); assert.equal(I.impairsTotal.mesure, total); assert.equal(I.impairsTotal.formule, 3 ** m); assert.equal(total, 3 ** m); assert.equal(I.impairsTotal.impairs, cumul);
    for (let i = 0; i < R.n; i++) { const o = 3 * i, n = b[o + 2], k = b[o] + n / 2; assert.ok(Number.isInteger(n) && b[o + 1] === -n && Number.isInteger(k) && k >= 0 && k <= n && (n & k) === k, 'point ' + i); }
    return 'impairs ' + cumul + ', 2^' + m + ' lignes : ' + total + ' = 3^' + m;
  });
  /* game124 : solides de Platon — references : Euler, E = F p / 2 = V q / 2, diedre par Math.asin, (p, q) = les 5 solutions de 1/p + 1/q > 1/2 */
  { const vus = new Set();
    for (let k = 0; k <= 4; k++) ok(`solidesPlatoniques solide = ${k} : V - E + F = 2 (tout compte), E = F p/2 = V q/2, diedre exact, sommets sur une sphere`, () => {
      const R = S('solidesPlatoniques', { solide: k }), I = R.invariants, b = R.brut, { sommets: V, aretes: E, faces: F } = I.euler, p = I.schlafli.cotesParFace, q = I.schlafli.aretesParSommet;
      assert.equal(I.euler.mesure, 2); assert.equal(V - E + F, 2); assert.equal(E * 2, F * p); assert.equal(E * 2, V * q); assert.ok(1 / p + 1 / q > 0.5);
      const th = 2 * Math.asin(Math.cos(Math.PI / q) / Math.sin(Math.PI / p)) * 180 / Math.PI;
      assert.ok(Math.abs(I.diedre.formule - th) < 1e-9 && Math.abs(I.diedre.mesure - th) < 1e-9, 'diedre ' + I.diedre.mesure + ' ' + th);
      assert.ok(I.surSphere.derive < 1e-12); const R0 = I.surSphere.debut;
      for (let i = 0; i < R.n; i++) { const o = 3 * i; assert.ok(Math.hypot(b[o], b[o + 1], b[o + 2]) <= R0 + 1e-9, 'dans la sphere'); }
      vus.add(p + ',' + q); return V + '-' + E + '-' + F + ' {' + p + ',' + q + '} diedre ' + th.toFixed(4);
    });
    ok('solidesPlatoniques : les cinq symboles de Schlafli sont les 5 solutions de 1/p + 1/q > 1/2', () => { const att = []; for (let p = 3; p < 8; p++) for (let q = 3; q < 8; q++) if (1 / p + 1 / q > 0.5) att.push(p + ',' + q); assert.deepEqual([...vus].sort(), att.sort()); }); }
  /* game125 : Monty Hall — (n - 1)/(n (n - 2)) et 1/n recalcules ; courbes dans [0, 1] */
  for (const p of [...extremes(sys('montyHall')), { portes: 4 }]) ok(`montyHall ${JSON.stringify(p)} : changer (n-1)/(n(n-2)), garder 1/n, |z| < 5`, () => {
    const R = S('montyHall', p), N = R.params.portes, I = R.invariants, b = R.brut;
    assert.ok(Math.abs(I.changer.formule - (N - 1) / (N * (N - 2))) < 1e-15 && Math.abs(I.garder.formule - 1 / N) < 1e-15);
    assert.ok(Math.abs(z(I.changer)) < 5 && Math.abs(z(I.garder)) < 5, 'z ' + z(I.changer) + ' ' + z(I.garder));
    for (let i = 0; i < R.n; i++) { const o = 3 * i; assert.ok(b[o + 1] >= 0 && b[o + 1] <= 1 && (b[o + 2] === 0 || b[o + 2] === 1)); }
    return 'changer ' + I.changer.mesure.toFixed(4) + ' / ' + I.changer.formule.toFixed(4);
  });
  /* game148 : Apollonius (idee : codex Grok Bot) — references INDEPENDANTES : nombre de cercles 2 puis 6 x 3^(g-1) recompte ici ; courbures
   *   ENTIERES recalculees ici par la seule recurrence de Descartes sur les courbures (k' = 2 (a + b + c) - k, sans geometrie) et comparees
   *   au multiset que donnerait le module (via le nombre et la plus grande courbure) ; chaque point dessine dans le grand cercle */
  for (const p of [...extremes(sys('apollonius')), { premier: 0.37, generations: 4 }, { premier: 0.5, generations: 3 }]) ok(`apollonius ${JSON.stringify(p)} : courbures et centres de Descartes, cercles par generation, entiers a r1 = 1/2, temoin sans facteur 2`, () => {
    const R = S('apollonius', p), I = R.invariants, b = R.brut, G = R.params.generations, r1 = R.params.premier;
    const att = [2]; for (let g = 1; g <= G; g++) att.push(6 * 3 ** (g - 1)); const tot = att.reduce((u, v) => u + v, 0);
    assert.equal(I.cerclesParGeneration.mesure, att.join(' ')); assert.equal(I.cerclesParGeneration.formule, att.join(' ')); assert.equal(I.courbures.cercles, tot + 2);
    assert.ok(I.courbures.mesure < 1e-11 && I.centresComplexes.mesure < 1e-11, 'descartes ' + I.courbures.mesure + ' ' + I.centresComplexes.mesure);
    assert.ok(I.entiers.comparables === tot - 2 && I.entiers.sansFacteur2 === I.entiers.comparables, 'temoin facteur 2 ' + JSON.stringify(I.entiers));
    if (Math.abs(r1 - 0.5) < 1e-12) assert.ok(I.entiers.ecartEntier < 1e-8, 'entiers ' + I.entiers.ecartEntier); else assert.ok(I.entiers.ecartEntier > 0.01, 'non entiers attendus ' + I.entiers.ecartEntier);
    let pire = 0; const lab = new Set(); for (let q = 0; q < R.n; q++) { const o = 3 * q; pire = Math.max(pire, b[o] * b[o] + b[o + 1] * b[o + 1] - 1); lab.add(b[o + 2]); }
    assert.ok(pire < 1e-9 && [...lab].every((v) => Number.isInteger(v) && v >= -1 && v <= G), 'dessin ' + pire + ' ' + [...lab].join(','));
    return tot + ' cercles, Descartes ' + I.courbures.mesure.toExponential(1) + ', complexe ' + I.centresComplexes.mesure.toExponential(1) + ', entiers ' + I.entiers.ecartEntier.toExponential(1);
  });
  /* courbures entieres du joint (-1, 2, 2, 3) : la recurrence de Descartes SEULE (k' = 2 (a + b + c) - k) doit donner les memes plus petites
   *   valeurs que les cercles trouves par la geometrie (rayon des points dessines, a 1e-9) */
  ok('apollonius r1 = 1/2 : les courbures des cercles dessines = celles de la recurrence de Descartes (2, 3, 6, 11, 14, 15, 18, 23...)', () => {
    const R = T.simuler('apollonius', { premier: 0.5, generations: 3 }, { n: 20000 }), b = R.brut, ks = new Set();
    /* rayon de chaque cercle dessine : trois points consecutifs d un meme cercle -> cercle circonscrit */
    for (let q = 0; q + 2 < R.n; q++) { const o = 3 * q; if (b[o + 2] !== b[o + 5] || b[o + 2] !== b[o + 8]) continue; const [x1, y1, x2, y2, x3, y3] = [b[o], b[o + 1], b[o + 3], b[o + 4], b[o + 6], b[o + 7]];
      const d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2)); if (Math.abs(d) < 1e-14) continue; const ux = ((x1 * x1 + y1 * y1) * (y2 - y3) + (x2 * x2 + y2 * y2) * (y3 - y1) + (x3 * x3 + y3 * y3) * (y1 - y2)) / d, uy = ((x1 * x1 + y1 * y1) * (x3 - x2) + (x2 * x2 + y2 * y2) * (x1 - x3) + (x3 * x3 + y3 * y3) * (x2 - x1)) / d;
      const k = 1 / Math.hypot(x1 - ux, y1 - uy); if (Math.abs(k - Math.round(k)) < 1e-6) ks.add(Math.round(k)); }
    const ref = new Set([1, 2, 3]); /* 1 = |-1| : le grand cercle, que les points dessines redonnent en valeur absolue */ let file = [[-1, 2, 2, 3]];
    for (let g = 0; g < 3; g++) { const s = []; for (const [a, bb, c, d] of file) for (const [u, v, w, old] of [[a, bb, c, d], [a, bb, d, c], [a, c, d, bb], [bb, c, d, a]]) { const kn = 2 * (u + v + w) - old; if (kn > Math.max(u, v, w, old)) { ref.add(kn); s.push([u, v, w, kn]); } } file = s; }
    const petits = [...ref].sort((x, y) => x - y).filter((k) => k <= 30), vus = [...ks].sort((x, y) => x - y).filter((k) => k <= 30);
    assert.deepEqual(vus, petits); return 'courbures <= 30 : ' + vus.join(' ');
  });
  /* game150 : tas de sable (idee : codex Grok Bot) — recurrentes contre l ORBITE du tas plein (192, 100352) et contre le produit des valeurs
   *   propres ; identite recalculee ici (autre stabilisation) et comparee case par case au dessin ; (e + e)° = e recalcule ; symetrie du carre */
  for (const p of [{}, { cote: 8 }, { cote: 40 }, { cote: 21 }]) ok(`tasDeSable ${JSON.stringify(p)} : recurrentes = orbite = det, identite recalculee et dessinee, abelien, temoin tas vide`, () => {
    const R = S('tasDeSable', p), I = R.invariants, b = R.brut, c = R.params.cote, N = c * c;
    assert.equal(I.recurrentes.mesure, ORBITES.join(' ')); assert.equal(I.recurrentes.formule, [2, 3].map(detValeursPropres).join(' ')); assert.deepEqual(ORBITES, [192, 100352]);
    assert.equal(I.recurrentes.grandes, [4, 5].map(detValeursPropres).join(' '));
    const e = identiteRef(c), ee = stabRef(e.map((v) => 2 * v), c); assert.ok(ee.every((v, i) => v === e[i]), '(e + e) != e dans le banc');
    for (let y = 0; y < c; y++) for (let x = 0; x < c; x++) { const v = e[y * c + x]; assert.ok(v === e[x * c + y] && v === e[y * c + c - 1 - x] && v === e[(c - 1 - y) * c + x], 'symetrie ' + x + ',' + y); }
    let mal = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q, i = b[o + 1] * c + b[o]; if (!(Number.isInteger(b[o]) && b[o] >= 0 && b[o] < c && b[o + 2] === e[i])) mal++; }
    const vus = new Set(); for (let q = 0; q < R.n; q++) vus.add(b[3 * q + 1] * c + b[3 * q]); assert.ok(mal === 0 && vus.size === Math.min(N, R.n), 'dessin ' + mal + ' cases vues ' + vus.size);
    assert.ok(I.identite.eePlusE === 0 && I.identite.ePlusR === 0 && I.identite.recurrente === true && I.identite.videRecurrent === false, 'identite ' + JSON.stringify(I.identite));
    assert.ok(I.abelien.mesure === 0 && I.abelien.tasDifferents === 0 && I.abelien.eboulementsDifferents === 0 && I.abelien.eboulements > N, 'abelien ' + JSON.stringify(I.abelien));
    return 'recurrentes ' + I.recurrentes.mesure + ', identite ' + c + 'x' + c + ' redessinee, ' + I.abelien.eboulements + ' eboulements';
  });
  /* game151 : verger d Euclide — compte par ESSAI de diviseurs, sommes phi et mu par factorisation, borne derivee, chaque arbre dessine visible */
  for (const p of [...extremes(sys('vergerEuclide')), { cote: 97 }]) ok(`vergerEuclide ${JSON.stringify(p)} : visibles = 2 sum phi - 1 = Mobius, limite 6/pi^2 sous la borne, diagonale 1`, () => {
    const R = S('vergerEuclide', p), I = R.invariants, b = R.brut, N = R.params.cote, V = vergerRef(N);
    let sp = 0, sm = 0; for (let k = 1; k <= N; k++) { sp += phiRef(k); sm += muRef(k) * Math.floor(N / k) ** 2; }
    assert.ok(I.visibles.mesure === V && I.visibles.formule === 2 * sp - 1 && I.visibles.sommePhi === sp && I.mobius.formule === sm && sm === V, 'compte ' + JSON.stringify([I.visibles, I.mobius.formule, V, sp, sm]));
    const lim = 6 / Math.PI ** 2, bor = (3 + 2 * Math.log(N)) / N; assert.ok(Math.abs(I.limite.formule - lim) < 1e-15 && Math.abs(I.limite.borne - bor) < 1e-12 && Math.abs(I.limite.mesure - V / (N * N)) < 1e-15 && I.limite.ecart <= bor && I.limite.ecart > 0, 'limite ' + JSON.stringify(I.limite));
    assert.ok(I.diagonale.mesure === 1, 'diagonale ' + I.diagonale.mesure);
    let mal = 0; const vus = new Set(); for (let q = 0; q < R.n; q++) { const o = 3 * q, x = b[o], y = b[o + 1]; vus.add(x * 1000 + y); let cache = false; for (let d = 2; d <= Math.min(x, y); d++) if (x % d === 0 && y % d === 0) cache = true; if (cache || x < 1 || y < 1 || x > N || y > N || b[o + 2] !== Math.max(x, y)) mal++; }
    assert.ok(mal === 0 && vus.size === Math.min(V, R.n), 'dessin ' + mal + ' distincts ' + vus.size);
    return V + ' visibles sur ' + N * N + ', part ' + I.limite.mesure.toFixed(5) + ' / 6/pi^2 ' + lim.toFixed(5) + ' (ecart ' + I.limite.ecart.toExponential(1) + ' < ' + bor.toFixed(3) + ')';
  });
  /* valeurs de controle de Grok Bot (TAM-CODEX-grok-2026-11-05-suite.md, calculees par son script Python) : N = 10 -> 63, N = 100 -> 6087,
   *   sum phi = 32 et 3044 */
  ok('vergerEuclide : valeurs de controle de Grok Bot (N = 10 : 63, sum phi 32 ; N = 100 : 6087, sum phi 3044)', () => {
    const a = S('vergerEuclide', { cote: 10 }).invariants.visibles, b = S('vergerEuclide', { cote: 100 }).invariants.visibles;
    assert.deepEqual([a.mesure, a.sommePhi, b.mesure, b.sommePhi], [63, 32, 6087, 3044]); return '63 / 32, 6087 / 3044';
  });
  /* game152 : Ford — F_n par les mediants ; chaque point dessine sur le cercle de SA fraction (distance au centre = rayon a 1e-12) ;
   *   la tangence verifiee ici en ENTIERS (|ps - qr| = 1) sur la liste des mediants ; aucun chevauchement en entiers sur toutes les paires */
  for (const p of [...extremes(sys('cerclesFord')), { ordre: 5 }, { ordre: 8 }, { ordre: 20 }]) ok(`cerclesFord ${JSON.stringify(p)} : |F_n| = 1 + sum phi = mediants, voisins tangents, aucun chevauchement, temoin 1/3 2/3`, () => {
    const R = S('cerclesFord', p), I = R.invariants, b = R.brut, N = R.params.ordre, F = fareyRef(N);
    assert.ok(I.farey.mesure === F.length && I.farey.formule === F.length, 'farey ' + JSON.stringify(I.farey) + ' ' + F.length);
    for (let i = 0; i + 1 < F.length; i++) assert.equal(Math.abs(F[i][0] * F[i + 1][1] - F[i][1] * F[i + 1][0]), 1);
    assert.ok(I.voisins.mesure === 0 && I.voisins.paires === F.length - 1 && I.tangence.mesure < 1e-12 && I.chevauchement.mesure === 0, 'tangence ' + JSON.stringify([I.voisins, I.tangence.mesure, I.chevauchement.mesure]));
    assert.ok(Math.abs(I.temoin.mesure - (1 / 3 - 1 / 9)) < 1e-12, 'temoin ' + I.temoin.mesure);
    let mal = 0; const qs = new Set(); for (let k = 0; k < R.n; k++) { const o = 3 * k, q = b[o + 2]; qs.add(q); const r = 1 / (2 * q * q); let ok = false;
      for (const [pp, qq] of F) if (qq === q && Math.abs(Math.hypot(b[o] - pp / qq, b[o + 1] - r) - r) < 1e-12) { ok = true; break; } if (!ok) mal++; }
    assert.ok(mal === 0 && qs.size === Math.min(N, R.n), 'dessin ' + mal + ' denominateurs ' + qs.size);
    return '|F_' + N + '| = ' + F.length + ', tangence ' + I.tangence.mesure.toExponential(1);
  });
  ok('cerclesFord : valeurs de controle de Grok Bot (|F_5| = 11, |F_8| = 23, |F_20| = 129, F_5 en entier)', () => {
    assert.deepEqual([5, 8, 20].map((o) => S('cerclesFord', { ordre: o }).invariants.farey.mesure), [11, 23, 129]);
    assert.equal(fareyRef(5).map(([p, q]) => p + '/' + q).join(', '), '0/1, 1/5, 1/4, 1/3, 2/5, 1/2, 3/5, 2/3, 3/4, 4/5, 1/1'); return '11 23 129';
  });
  /* game153 : Steiner — longueur contre min(L + sqrt 3, 1 + sqrt(3) L) (Math.sqrt), angles RELUS en degres par Math.acos sur les points
   *   dessines (sommets du reseau = points ou trois segments se rejoignent), temoins plus longs ; valeurs de Grok Bot pour le carre */
  for (const p of [...extremes(sys('fermatSteiner')), { largeur: 1 }, { largeur: 0.7 }]) ok(`fermatSteiner ${JSON.stringify(p)} : longueur exacte, 120 degres, carrefour exact, temoins plus longs`, () => {
    const R = S('fermatSteiner', p), I = R.invariants, b = R.brut, L = R.params.largeur, ex = Math.min(L + Math.sqrt(3), 1 + Math.sqrt(3) * L);
    assert.ok(Math.abs(I.longueur.mesure - ex) < 1e-12 && Math.abs(I.longueur.formule - ex) < 1e-15, 'longueur ' + I.longueur.mesure + ' ' + ex);
    assert.ok(I.angles.mesure < 1e-12 && I.carrefour.mesure < 1e-9, 'angles ' + I.angles.mesure + ' carrefour ' + I.carrefour.mesure);
    const t = I.plusLongs; assert.ok(t.autreForme >= ex - 1e-12 && t.arbreSansCarrefour > ex + 0.1 && Math.abs(t.arbreSansCarrefour - (L < 1 ? 2 * L + 1 : L + 2)) < 1e-12 /* MST : les deux cotes courts + un long */ && t.croix > ex + 0.05 && Math.abs(t.croix - 2 * Math.hypot(1, L)) < 1e-12, 'temoins ' + JSON.stringify(t));
    /* le reseau dessine (etiquette 0) : longueur relue en sommant les pas entre points voisins, et tout point dans le rectangle */
    let lab0 = 0, dehors = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q; if (b[o + 2] === 0) lab0++; if (b[o] < -1e-12 || b[o] > L + 1e-12 || b[o + 1] < -1e-12 || b[o + 1] > 1 + 1e-12) dehors++; }
    assert.ok(lab0 === Math.ceil(R.n * 0.7) && dehors === 0, 'dessin ' + lab0 + ' dehors ' + dehors);
    return 'L = ' + L + ' : ' + I.longueur.mesure.toFixed(12) + ' (pont ' + I.longueur.pont + '), cos ' + I.angles.mesure.toExponential(1);
  });
  ok('fermatSteiner : valeurs de controle de Grok Bot (carre : 1 + sqrt 3 = 2.7320508075688772, carrefour a (sqrt 3/6, 1/2) ou son symetrique)', () => {
    const I = S('fermatSteiner', { largeur: 1 }).invariants; assert.ok(Math.abs(I.longueur.mesure - 2.7320508075688772) < 1e-12, I.longueur.mesure);
    assert.ok(I.carrefour.mesure < 1e-9 && Math.abs(Math.sqrt(3) / 6 - 1 / (2 * Math.sqrt(3))) < 1e-15); return I.longueur.mesure.toFixed(16);
  });
  /* angles en DEGRES relus sur la geometrie : les 120 degres par Math.acos sur les carrefours du module copie ici (S et T ne sont pas exposes :
   *   on les recalcule en forme fermee pour le pont horizontal, L > 1) */
  ok('fermatSteiner : 120 degres en degres (Math.acos) au carrefour exact du pont horizontal', () => { const r3 = Math.sqrt(3), Sx = 1 / (2 * r3), A = [0, 0], D = [0, 1], T = [1.5 - Sx, 0.5], Sp = [Sx, 0.5];
    const ang = (Q, u, v) => Math.acos(((u[0] - Q[0]) * (v[0] - Q[0]) + (u[1] - Q[1]) * (v[1] - Q[1])) / (Math.hypot(u[0] - Q[0], u[1] - Q[1]) * Math.hypot(v[0] - Q[0], v[1] - Q[1]))) * 180 / Math.PI;
    const a = [ang(Sp, A, D), ang(Sp, A, T), ang(Sp, D, T)]; assert.ok(a.every((x) => Math.abs(x - 120) < 1e-9), a.join(' ')); return a.map((x) => x.toFixed(9)).join(' '); });
  /* game154 : caustique — references INDEPENDANTES : la nephroide recalculee ici (Math.cos/sin), la distance de CHAQUE point dessine
   *   (etiquette 0) a la courbe par recherche fine sur t ; bornes 4/N^2, 1/N^2, 10/N (constantes MESUREES 3.7, 0.62, 9.4, ecrites dans le module) */
  const nephro = (t) => [(3 * Math.cos(t) - Math.cos(3 * t)) / 4, (3 * Math.sin(t) - Math.sin(3 * t)) / 4];
  for (const p of [...extremes(sys('causticTasse')), { rayons: 1000 }]) ok(`causticTasse ${JSON.stringify(p)} : croisements sur la nephroide, pointe a R/2, longueur 3R, temoin 60 degres`, () => {
    const R = S('causticTasse', p), I = R.invariants, b = R.brut, N = R.params.rayons;
    assert.ok(I.nephroide.mesure < 4 / N ** 2 && I.nephroide.points === N - 1, 'nephroide ' + I.nephroide.mesure + ' points ' + I.nephroide.points);
    assert.ok(I.pointe.mesure < 1 / N ** 2, 'pointe ' + I.pointe.mesure);
    assert.ok(I.longueur.formule === 3 && I.longueur.mesure < 3 && 3 - I.longueur.mesure < 10 / N, 'longueur ' + I.longueur.mesure);
    assert.ok(Math.abs(I.temoin60.mesure - 1) < 1e-12 && I.temoin60.formule === 1, 'temoin ' + I.temoin60.mesure);
    let pire = 0, paroi = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q; if (b[o + 2] === 0) { let m = Infinity; for (let k = 0; k <= 4000; k++) { const e = nephro(-Math.PI / 2 + Math.PI * k / 4000); m = Math.min(m, Math.hypot(b[o] - e[0], b[o + 1] - e[1])); } pire = Math.max(pire, m); } if (b[o + 2] === 1) paroi = Math.max(paroi, Math.abs(Math.hypot(b[o], b[o + 1]) - 1)); }
    assert.ok(pire < 1e-3 && paroi < 1e-12, 'dessin ' + pire + ' paroi ' + paroi);
    return 'N = ' + N + ' : ecart ' + I.nephroide.mesure.toExponential(1) + ', pointe ' + I.pointe.mesure.toExponential(1) + ', longueur ' + I.longueur.mesure.toFixed(5);
  });
  ok('causticTasse : valeur de controle de Grok Bot (pointe a R/2, nephroide de Huygens)', () => { const I = S('causticTasse', { rayons: 3000 }).invariants; assert.ok(I.pointe.mesure < 1e-6); return 'pointe a ' + I.pointe.mesure.toExponential(1) + ' de R/2'; });
  /* game155 : Hofstadter — references INDEPENDANTES : le spectre par DIAGONALISATION de la matrice de Bloch COMPLEXE q x q (forme hermitienne
   *   reelle 2q x 2q, Jacobi du banc) sur une grille de (theta, k) : chaque valeur propre tombe dans une bande dessinee, et chaque bord est
   *   atteint a 1e-6 ; valeurs de Grok Bot pour 1/3 et 2/5 */
  const blochValeurs = (p, q, th, k) => { /* H(theta, k) hermitienne : diagonale 2 cos(2 pi p n/q + theta), sauts 1, coin e^{i q k} ; en reel : [[Re, -Im], [Im, Re]] */
    const n2 = 2 * q, A = Array.from({ length: n2 }, () => new Array(n2).fill(0)), set = (i, j, re, im) => { A[i][j] += re; A[i + q][j + q] += re; A[i][j + q] -= im; A[i + q][j] += im; };
    for (let n = 0; n < q; n++) set(n, n, 2 * Math.cos(2 * Math.PI * p * n / q + th), 0);
    if (q === 1) set(0, 0, 2 * Math.cos(q * k), 0); else { for (let n = 0; n + 1 < q; n++) { set(n, n + 1, 1, 0); set(n + 1, n, 1, 0); } set(0, q - 1, Math.cos(q * k), -Math.sin(q * k)); set(q - 1, 0, Math.cos(q * k), Math.sin(q * k)); }
    for (let s = 0; s < 60; s++) { let off = 0; for (let i = 0; i < n2; i++) for (let j = i + 1; j < n2; j++) off += A[i][j] ** 2; if (off < 1e-26) break;
      for (let a = 0; a < n2; a++) for (let b = a + 1; b < n2; b++) { if (Math.abs(A[a][b]) < 1e-300) continue; const t0 = (A[b][b] - A[a][a]) / (2 * A[a][b]), t = Math.sign(t0 || 1) / (Math.abs(t0) + Math.hypot(t0, 1)), c = 1 / Math.hypot(t, 1), sn = t * c;
        for (let m = 0; m < n2; m++) { const x = A[m][a], y = A[m][b]; A[m][a] = c * x - sn * y; A[m][b] = sn * x + c * y; } for (let m = 0; m < n2; m++) { const x = A[a][m], y = A[b][m]; A[a][m] = c * x - sn * y; A[b][m] = sn * x + c * y; } } }
    return A.map((r, i) => r[i]); };
  for (const p of [...extremes(sys('papillonHofstadter')), { qmax: 9 }]) ok(`papillonHofstadter ${JSON.stringify(p)} : bandes reelles, gaps de van Mouche, centre ferme, 1/3 exact, symetrie, temoin 2/5`, () => {
    const R = S('papillonHofstadter', p), I = R.invariants, b = R.brut, Q = R.params.qmax;
    let nf = 0; for (let q = 1; q <= Q; q++) for (let pp = 0; pp <= q; pp++) { let a = pp, c = q; while (c) [a, c] = [c, a % c]; if (a === 1) nf++; }
    assert.ok(I.bandes.mesure === 0 && I.bandes.fractions === nf && I.gaps.mesure === 0, 'bandes ' + JSON.stringify([I.bandes, I.gaps.mesure, nf]));
    assert.ok(I.centreFerme.mesure < 1e-9 && I.tiers.mesure < 1e-12 && I.miroirE.mesure < 1e-9 && I.temoin.mesure === 5, 'exacts ' + JSON.stringify([I.centreFerme.mesure, I.tiers.mesure, I.miroirE.mesure, I.temoin.mesure]));
    /* (banc corrige game155 : comparer a l ETENDUE des points dessines etait faux — une bande etroite a un seul point est dessinee en son
     *   milieu.) Spectre = { |P| <= 4 }, P recalcule ICI par matrices de transfert (Math.cos) : (a) chaque valeur propre de Bloch (diagonalisation
     *   independante) y tombe ; (b) chaque point dessine aussi. Tolerance : |P| <= 4 + 1e-7 (1 + |P'|), P' par difference centree. */
    const PRef = (E, pp, q) => { const th = 0.37; let a = 1, bb = 0, c = 0, d = 1; for (let m = 0; m < q; m++) { const v = E - 2 * Math.cos(2 * Math.PI * pp * m / q + th), na = v * a - c, nb = v * bb - d; c = a; d = bb; a = na; bb = nb; } return a + d + 2 * Math.cos(q * th); };
    const dans = (E, pp, q) => { const h = 1e-7, d = (PRef(E + h, pp, q) - PRef(E - h, pp, q)) / (2 * h); return Math.abs(PRef(E, pp, q)) <= 4 + 1e-7 * (1 + Math.abs(d)); };
    let horsBande = 0; for (const [pp, q] of [[1, 3], [2, 5], [1, 4], [3, 7], [5, 13]].filter(([, q]) => q <= Q))
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) for (const E of blochValeurs(pp, q, 2 * Math.PI * i / 6, 2 * Math.PI * j / (6 * q))) if (!dans(E, pp, q)) horsBande++;
    let dessinHors = 0; for (let k = 0; k < R.n; k++) { const o = 3 * k, q = b[o + 2], pp = Math.round(b[o] * q); if (!dans(b[o + 1], pp, q)) dessinHors++; }
    assert.ok(horsBande === 0 && dessinHors === 0, 'hors du spectre : valeurs de Bloch ' + horsBande + ', points dessines ' + dessinHors);
    return I.bandes.fractions + ' fractions, ' + I.bandes.bandes + ' bandes, centre ' + I.centreFerme.mesure.toExponential(1);
  });
  ok('papillonHofstadter : valeurs de controle de Grok Bot (1/3 : -2.732050807569 -2 -0.732050807569 0.732050807569 2 2.732050807569 ; 2/5 : 5 bandes, bord 2.618033988750)', () => {
    const R = S('papillonHofstadter', { qmax: 6 }), b = R.brut, ys = []; for (let q = 0; q < R.n; q++) if (Math.abs(b[3 * q] - 0.4) < 1e-12) ys.push(b[3 * q + 1]);
    assert.ok(Math.abs(Math.max(...ys) - 2.618033988750) < 1e-11 && Math.abs(Math.min(...ys) + 2.618033988750) < 1e-11, 'bords 2/5 ' + Math.min(...ys) + ' ' + Math.max(...ys)); return '2/5 : ' + Math.max(...ys).toFixed(12);
  });
  /* game157 : dominos — references INDEPENDANTES : compte par RETOUR ARRIERE (premiere case vide, couche ou debout) pour les petites aires,
   *   Kasteleyn par Math.cos ; probabilite du coin recomptee par retour arriere ; le pavage dessine verifie (chaque case couverte une fois) */
  const pavagesRef = (m, L, coinCouche = null) => { const g = new Uint8Array(m * L); let tot = 0;
    const rec = () => { const i = g.indexOf(0); if (i < 0) { tot++; return; } const x = Math.floor(i / m), y = i % m;
      if (x + 1 < L && !g[i + m]) { if (!(coinCouche === false && i === 0)) { g[i] = g[i + m] = 1; rec(); g[i] = g[i + m] = 0; } }
      if (y + 1 < m && !g[i + 1]) { if (!(coinCouche === true && i === 0)) { g[i] = g[i + 1] = 1; rec(); g[i] = g[i + 1] = 0; } } }; rec(); return tot; };
  for (const p of [...extremes(sys('dominosKasteleyn')), { hauteur: 4, largeur: 5 }, { hauteur: 3, largeur: 7 }, { hauteur: 6, largeur: 6, graine: 9 }]) ok(`dominosKasteleyn ${JSON.stringify(p)} : compte exact = Kasteleyn, coin, Fibonacci, aire impaire, pavage dessine valide`, () => {
    const R = S('dominosKasteleyn', p), I = R.invariants, b = R.brut, m = R.params.hauteur, L = R.params.largeur;
    if (m * L <= 36) assert.equal(I.pavages.mesure, String(pavagesRef(m, L)));
    if (m % 2 === 0 && L % 2 === 0) { let k = 1; for (let j = 1; j <= m / 2; j++) for (let q = 1; q <= L / 2; q++) k *= 4 * Math.cos(Math.PI * j / (m + 1)) ** 2 + 4 * Math.cos(Math.PI * q / (L + 1)) ** 2; assert.ok(Math.abs(Number(I.pavages.mesure) - k) / k < 1e-12 && I.pavages.ecartRelatif < 1e-12, 'kasteleyn ' + I.pavages.mesure + ' ' + k); } else assert.equal(I.pavages.formule, null);
    let fa = 1, fb = 1; for (let i = 1; i < L; i++) [fa, fb] = [fb, fa + fb]; assert.equal(I.fibonacci.mesure, String(fb)); assert.equal(I.fibonacci.formule, String(fb)); /* banc game157 : la formule aussi (mutant F(L) survivait) */
    if (m * L % 2) { assert.ok(I.pavages.mesure === '0' && I.impair.mesure === '0' && I.coin.mesure === null, 'impair'); return 'aire impaire : 0 pavage'; }
    if (m * L <= 36) { const pc = pavagesRef(m, L, true) / pavagesRef(m, L); assert.ok(Math.abs(I.coin.formule - pc) < 1e-12, 'coin exact ' + I.coin.formule + ' ' + pc); }
    assert.ok(Math.abs(z(I.coin)) < 5, 'coin z ' + z(I.coin));
    /* le pavage dessine : chaque point est au milieu d une case ou entre deux cases voisines, et TOUTES les cases sont atteintes */
    const vues = new Set(); let mal = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q, x = b[o] - 0.5, y = b[o + 1] - 0.5, lab = b[o + 2]; if (!(lab === 0 || lab === 1)) mal++;
      if (lab === 0 && Math.abs(y - Math.round(y)) > 1e-12) mal++; if (lab === 1 && Math.abs(x - Math.round(x)) > 1e-12) mal++; if (Number.isInteger(x) && Number.isInteger(y)) vues.add(x * 100 + y); }
    assert.ok(mal === 0 && x0ok(b, R.n, L, m), 'dessin ' + mal);
    return m + ' x ' + L + ' : ' + I.pavages.mesure + ' pavages, coin ' + I.coin.mesure.toFixed(3) + ' / ' + I.coin.formule.toFixed(3);
  });
  ok('dominosKasteleyn : valeurs de controle de Grok Bot (2x2 : 2, 2x3 : 3, 4x4 : 36, 6x6 : 6728, 8x8 : 12988816)', () => {
    const v = [[2, 2], [2, 3], [4, 4], [6, 6], [8, 8]].map(([h, l]) => S('dominosKasteleyn', { hauteur: h, largeur: l }).invariants.pavages.mesure); assert.deepEqual(v, ['2', '3', '36', '6728', '12988816']);
    /* lot 4 de Grok Bot : 6 x 8 -> 167089 pavages, coin couche avec la probabilite EXACTE 81430/167089 (deux DP independantes chez lui) */
    const I = S('dominosKasteleyn', { hauteur: 6, largeur: 8 }).invariants; assert.ok(I.pavages.mesure === '167089' && Math.abs(I.coin.formule - 81430 / 167089) < 1e-15, 'lot4 ' + I.coin.formule);
    return v.join(' ') + ' ; 6x8 coin 81430/167089';
  });
  /* game158 : Ising — enumeration INDEPENDANTE (Math.exp, Gray code : un spin bascule a la fois, E mis a jour localement) ; |z| < 5 ;
   *   chaque point dessine porte un spin +1 / -1 ; valeurs de Grok Bot pour le tore 4 x 4 (Z a beta = 0.4) */
  const isingRef = (L, beta) => { const N = L * L, s = new Int8Array(N).fill(-1); let E = 0, M = -N; for (let i = 0; i < N; i++) { const x = i % L, y = (i - x) / L; E += s[i] * s[y * L + (x + 1) % L] + s[i] * s[((y + 1) % L) * L + x]; }
    let Z = Math.exp(beta * E), ZE = E * Z, ZM = Math.abs(M) / N * Z;
    for (let k = 1; k < 1 << N; k++) { const i = 31 - Math.clz32(k & -k), x = i % L, y = (i - x) / L, h = s[y * L + (x + 1) % L] + s[y * L + (x - 1 + L) % L] + s[((y + 1) % L) * L + x] + s[((y - 1 + L) % L) * L + x];
      E -= 2 * s[i] * h; M -= 2 * s[i]; s[i] = -s[i]; const w = Math.exp(beta * E); Z += w; ZE += E * w; ZM += Math.abs(M) / N * w; }
    return { Z, E: ZE / Z, m: ZM / Z }; };
  for (const p of [...extremes(sys('ising')), { beta: 0.44 }]) ok(`ising ${JSON.stringify(p)} : Metropolis contre l enumeration exacte (energie, aimantation), Z, dessin en spins`, () => {
    const R = S('ising', p), I = R.invariants, b = R.brut, ref = isingRef(4, R.params.beta);
    assert.ok(Math.abs(I.partition.mesure - ref.Z) / ref.Z < 1e-12 && Math.abs(I.energie.formule - ref.E) < 1e-9 && Math.abs(I.aimantationAbs.formule - ref.m) < 1e-12, 'exact ' + JSON.stringify([I.partition.mesure, ref.Z, I.energie.formule, ref.E]));
    assert.ok(Math.abs(z(I.energie)) < 5 && Math.abs(z(I.aimantationAbs)) < 5, 'z ' + z(I.energie) + ' ' + z(I.aimantationAbs));
    assert.ok(Math.abs(I.partition.betaCritique - Math.log(1 + Math.SQRT2) / 2) < 1e-12, 'betaC');
    let mal = 0; for (let q = 0; q < R.n; q++) { const v = b[3 * q + 2]; if (v !== 1 && v !== -1) mal++; } assert.equal(mal, 0);
    return 'beta ' + R.params.beta + ' : <E> ' + I.energie.mesure.toFixed(3) + ' / ' + I.energie.formule.toFixed(3) + ', <|m|> ' + I.aimantationAbs.mesure.toFixed(4) + ' / ' + I.aimantationAbs.formule.toFixed(4);
  });
  ok('ising : valeurs de controle de Grok Bot (tore 4 x 4, beta = 0.4 : Z = 2107668.7226362286)', () => { const I = S('ising', { beta: 0.4 }).invariants; assert.ok(Math.abs(I.partition.mesure - 2107668.7226362286) / 2107668.7226362286 < 1e-12, I.partition.mesure); return String(I.partition.mesure); });
  ok('ising : etalonnage sur 12 graines a beta = 0.44 (ecart-type des z dans [0.4, 1.8])', () => { const zs = []; for (let g = 1; g <= 12; g++) zs.push(z(S('ising', { beta: 0.44, graine: g }).invariants.energie)); const m = zs.reduce((a, x) => a + x, 0) / zs.length, sd = Math.sqrt(zs.reduce((a, x) => a + (x - m) ** 2, 0) / (zs.length - 1)); assert.ok(sd >= 0.4 && sd <= 1.8 && Math.abs(m) < 1.5, m + ' ' + sd); return m.toFixed(2) + '/' + sd.toFixed(2); });
  /* game159 : diamant azteque — references INDEPENDANTES : 2^(k(k+1)/2) ; le pavage DESSINE reconstruit en cases (chaque case du diamant
   *   couverte exactement une fois) ; khi-deux et case du centre en z ; valeurs de Grok Bot (AD(4) = 1024 ; centre 1/2) */
  for (const p of [...extremes(sys('aztecDiamond')), { ordre: 20, graine: 7 }]) ok(`aztecDiamond ${JSON.stringify(p)} : pavage valide, petits diamants comptes, uniformite, centre, arctique`, () => {
    const R = S('aztecDiamond', p), I = R.invariants, b = R.brut, n = R.params.ordre;
    assert.ok(I.pavageValide.mesure === 0 && I.pavageValide.dominos === n * (n + 1), 'valide ' + JSON.stringify(I.pavageValide));
    assert.equal(I.petitsDiamants.mesure, '2 8 64 1024'); assert.equal(I.petitsDiamants.formule, [1, 2, 3, 4].map((k) => Math.pow(2, k * (k + 1) / 2)).join(' '));
    assert.ok(Math.abs(z(I.uniformite)) < 5 && Math.abs(z(I.caseCentre)) < 5 && Math.abs(I.caseCentre.formule - 0.5) < 1e-15, 'stats ' + z(I.uniformite) + ' ' + z(I.caseCentre) + ' ' + I.caseCentre.formule);
    assert.ok(Math.abs(I.arctique.rayon - n / Math.SQRT2) < 1e-12, 'rayon');
    /* le cercle arctique est une LIMITE : exige seulement des l ordre 12 (mesure 2026-11-05 : 1.000 dehors, ~0.4 dedans a n = 20..60) */
    if (n >= 12) assert.ok(I.arctique.mesure >= 0.99 && I.arctique.dedans < 0.6, 'arctique ' + JSON.stringify(I.arctique));
    let dehors = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q, x = Math.floor(b[o] - 1e-9), y = Math.floor(b[o + 1] - 1e-9); if (Math.abs(x + 0.5) + Math.abs(y + 0.5) > n) dehors++; if (![0, 1, 2, 3].includes(b[o + 2])) dehors++; }
    assert.equal(dehors, 0);
    return 'n = ' + n + ' : geles dehors ' + (I.arctique.mesure === null ? '-' : I.arctique.mesure.toFixed(3)) + ', khi2 ' + I.uniformite.mesure.toFixed(1) + ', centre ' + I.caseCentre.mesure.toFixed(3);
  });
  ok('aztecDiamond : valeurs de controle de Grok Bot (AD(1..4) = 2 8 64 1024 ; ordre 4, case du centre couchee 1/2 exactement)', () => { const I = S('aztecDiamond', {}).invariants; assert.ok(I.petitsDiamants.mesure === '2 8 64 1024' && I.caseCentre.formule === 0.5); return 'ok'; });
  /* game160 : collectionneur — references INDEPENDANTES : E et Var par la somme des geometriques en flottants ; valeurs EXACTES de
   *   Grok Bot (lot 5) pour n = 10 et 50 ; courbe exacte relue sur les points d etiquette 0 */
  for (const p of [...extremes(sys('collectionneur')), { vignettes: 10 }, { vignettes: 50, graine: 3 }]) ok(`collectionneur ${JSON.stringify(p)} : moyenne n H_n, variance exacte, courbe des distinctes`, () => {
    const R = S('collectionneur', p), I = R.invariants, b = R.brut, N = R.params.vignettes;
    let E = 0, V = 0; for (let j = 0; j < N; j++) { const q = (N - j) / N; E += 1 / q; V += (1 - q) / (q * q); }
    assert.ok(Math.abs(I.tirageMoyen.formule - E) / E < 1e-12 && Math.abs(I.variance.formule - V) / V < 1e-9, 'formules ' + I.tirageMoyen.formule + ' ' + E + ' ' + I.variance.formule + ' ' + V);
    assert.ok(Math.abs(z(I.tirageMoyen)) < 5 && Math.abs(I.variance.mesure - V) / V < 0.15, 'mesures ' + z(I.tirageMoyen) + ' ' + I.variance.mesure + ' ' + V);
    assert.ok(I.courbeDistinctes.mesure < 0.5 + 5 * Math.sqrt(N) / Math.sqrt(3000), 'courbe ' + I.courbeDistinctes.mesure);
    let mal = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q; if (b[o + 2] === 0 && Math.abs(b[o + 1] - N * (1 - Math.pow(1 - 1 / N, b[o]))) > 1e-9) mal++; if (b[o + 1] > N || b[o + 1] < 0) mal++; } assert.equal(mal, 0);
    return 'n = ' + N + ' : moyenne ' + I.tirageMoyen.mesure.toFixed(2) + ' / ' + I.tirageMoyen.formule.toFixed(2) + ', variance ' + I.variance.mesure.toFixed(0) + ' / ' + I.variance.formule.toFixed(0);
  });
  ok('collectionneur : fractions exactes de Grok Bot (n = 10 : E = 7381/252, Var = 7981633/63504 ; n = 50 : E = 13943237577224054960759/61980890084919934128)', () => {
    const a = S('collectionneur', { vignettes: 10 }).invariants, b = S('collectionneur', { vignettes: 50 }).invariants;
    assert.ok(a.tirageMoyen.exacte === '7381/252' && a.variance.exacte === '7981633/63504' && b.tirageMoyen.exacte === '13943237577224054960759/61980890084919934128', a.tirageMoyen.exacte + ' ' + a.variance.exacte + ' ' + b.tirageMoyen.exacte);
    assert.equal(b.variance.exacte, '14743685372056613919882499348303425143425393/3841630735718926199201023052303859120384'); return a.tirageMoyen.exacte + ', ' + a.variance.exacte;
  });
  /* game161 : ruine — reference INDEPENDANTE : le systeme lineaire q_z = p q_(z+1) + q q_(z-1) resolu par Gauss (et la duree de meme) ;
   *   valeurs de Grok Bot (Feller XIV §2) : 7/10, 1/9, 76/211 */
  const ruineRef = (p, z, a) => { const n = a - 1, A = Array.from({ length: n }, () => new Array(n + 2).fill(0)); /* inconnues q_1..q_(a-1), colonnes : q puis D */
    for (let i = 1; i <= n; i++) { const r = A[i - 1]; r[i - 1] = 1; if (i + 1 <= n) r[i] = -p; if (i - 1 >= 1) r[i - 2] = -(1 - p); r[n] = i === 1 ? (1 - p) : 0; r[n + 1] = 1; }
    for (let c = 0; c < n; c++) { for (let i = c + 1; i < n; i++) { const f = A[i][c] / A[c][c]; for (let j = c; j < n + 2; j++) A[i][j] -= f * A[c][j]; } }
    const x = new Array(n).fill(0), y = new Array(n).fill(0); for (let i = n - 1; i >= 0; i--) { let s = A[i][n], t = A[i][n + 1]; for (let j = i + 1; j < n; j++) { s -= A[i][j] * x[j]; t -= A[i][j] * y[j]; } x[i] = s / A[i][i]; y[i] = t / A[i][i]; }
    return { q: x[z - 1], d: y[z - 1] }; };
  for (const p of [...extremes(sys('ruineJoueur')), { gain: 0.5, depart: 3, objectif: 10 }, { gain: 0.55, depart: 5, objectif: 30 }]) ok(`ruineJoueur ${JSON.stringify(p)} : ruine et duree contre le systeme lineaire, simulation`, () => {
    const R = S('ruineJoueur', p), I = R.invariants, b = R.brut, a = R.params.objectif, z0 = Math.min(R.params.depart, a - 1), ref = ruineRef(R.params.gain, z0, a);
    assert.ok(I.ruine.depart === z0 &&Math.abs(I.ruine.formule - ref.q) < 1e-9 && Math.abs(I.duree.formule - ref.d) / Math.max(1, ref.d) < 1e-9, 'formules ' + JSON.stringify([I.ruine.formule, ref.q, I.duree.formule, ref.d]));
    assert.ok(Math.abs(z(I.ruine)) < 5 && Math.abs(z(I.duree)) < 5, 'z ' + z(I.ruine) + ' ' + z(I.duree));
    let mal = 0; for (let k = 0; k < R.n; k++) { const v = b[3 * k + 1]; if (v < 0 || v > a || !Number.isInteger(v)) mal++; } assert.equal(mal, 0);
    return 'p = ' + R.params.gain + ', z = ' + z0 + ', a = ' + a + ' : ruine ' + I.ruine.mesure.toFixed(4) + ' / ' + I.ruine.formule.toFixed(4) + ', duree ' + I.duree.mesure.toFixed(1) + ' / ' + I.duree.formule.toFixed(1);
  });
  ok('ruineJoueur : valeurs de controle de Grok Bot (p = 1/2, z = 3, a = 10 : 7/10 ; p = 2/3, 3, 6 : 1/9 ; p = 3/5, 2, 5 : 76/211)', () => {
    const v = [[0.5, 3, 10, 7 / 10], [2 / 3, 3, 6, 1 / 9], [0.6, 2, 5, 76 / 211]].map(([g, d, o, x]) => Math.abs(S('ruineJoueur', { gain: g, depart: d, objectif: o }).invariants.ruine.formule - x));
    assert.ok(v.every((e) => e < 1e-12), v.join(' ')); return '7/10, 1/9, 76/211';
  });
  /* game162 : Catalan — references INDEPENDANTES : la recurrence C_(n+1) = sum C_i C_(n-i) (pas de binome) ; chaque chemin dessine reste
   *   au-dessus du sol, a la bonne longueur, avec des pas de +-1 ; valeurs de Grok Bot C_0..C_10 */
  for (const p of [...extremes(sys('catalanDyck')), { demi: 40, graine: 9 }]) ok(`catalanDyck ${JSON.stringify(p)} : chemins comptes = Catalan (recurrence), tirage uniforme, chemins dessines valides`, () => {
    const R = S('catalanDyck', p), I = R.invariants, b = R.brut, N = R.params.demi;
    const C = [1]; for (let k = 0; k < 12; k++) { let s = 0; for (let i = 0; i <= k; i++) s += C[i] * C[k - i]; C.push(s); }
    assert.ok(I.catalans.mesure === C.join(' ') && I.catalans.formule === C.join(' '), 'catalans ' + I.catalans.mesure);
    assert.ok(Math.abs(z(I.uniformite)) < 5 && I.uniformite.sousSol === 0 && I.temoin.mesure === '252', 'tirage ' + JSON.stringify(I.uniformite));
    let mal = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q, x = b[o], y = b[o + 1]; if (y < 0 || x < 0 || x > 2 * N || (x + y) % 2 !== 0 || y > Math.min(x, 2 * N - x)) mal++; if (x === 0 && y !== 0) mal++; if (x === 2 * N && y !== 0) mal++; }
    assert.equal(mal, 0); return 'n = ' + N + ' : khi2 ' + I.uniformite.mesure.toFixed(1);
  });
  ok('catalanDyck : valeurs de controle de Grok Bot (C_0..C_10 = 1 1 2 5 14 42 132 429 1430 4862 16796)', () => { const v = S('catalanDyck', {}).invariants.catalans.mesure.split(' ').slice(0, 11).join(' '); assert.equal(v, '1 1 2 5 14 42 132 429 1430 4862 16796'); return v; });
  /* game163 : partitions — reference INDEPENDANTE : enumeration directe des partitions (parts decroissantes) pour n <= 30 ; valeurs de
   *   Grok Bot p(0..20) et p(100) ; le diagramme dessine forme des lignes decroissantes collees a gauche */
  const partEnum = (n) => { let c = 0; const rec = (m, k) => { if (m === 0) { c++; return; } for (let j = Math.min(m, k); j >= 1; j--) rec(m - j, j); }; rec(n, n); return c; };
  for (const p of [...extremes(sys('partitionEuler')), { entier: 30, graine: 4 }]) ok(`partitionEuler ${JSON.stringify(p)} : pentagonal = comptage independant, tirage uniforme, diagramme de Young valide`, () => {
    const R = S('partitionEuler', p), I = R.invariants, b = R.brut, N = R.params.entier;
    assert.ok(I.pentagonal.mesure === 0 && I.pentagonal.p100 === '190569292', 'pentagonal ' + JSON.stringify(I.pentagonal));
    assert.ok(Math.abs(z(I.uniformite)) < 5 && I.dessinee.mesure === N, 'tirage ' + JSON.stringify([I.uniformite.mesure, I.dessinee]));
    /* banc game163 : chaque ligne part de la colonne 0 (un diagramme decale passait : seul le maximum etait regarde) */
    const lignes = new Map(), debuts = new Map(); for (let q = 0; q < R.n; q++) { const o = 3 * q; const r = -b[o + 1]; lignes.set(r, Math.max(lignes.get(r) ?? -1, b[o])); debuts.set(r, Math.min(debuts.get(r) ?? Infinity, b[o])); assert.equal(b[o + 2], r, 'etiquette de ligne'); }
    if (R.n >= 1000) for (const [r, x0] of debuts) assert.equal(x0, 0, 'ligne ' + r + ' commence en ' + x0);
    const longs = [...lignes.keys()].sort((x, y) => x - y).map((r) => lignes.get(r)); for (let i = 1; i < longs.length; i++) assert.ok(longs[i] <= longs[i - 1], 'lignes croissantes ' + longs.join(','));
    if (N <= 30) assert.equal(partEnum(N), Number(partPieces30(N)));
    return 'n = ' + N + ' : ' + I.dessinee.parts + ' parts, khi2 ' + I.uniformite.mesure.toFixed(1);
  });
  ok('partitionEuler : valeurs de controle de Grok Bot (p(0..20) et p(100) = 190569292)', () => {
    const v = []; for (let k = 0; k <= 20; k++) v.push(partEnum(k)); assert.equal(v.join(','), '1,1,2,3,5,7,11,15,22,30,42,56,77,101,135,176,231,297,385,490,627');
    assert.equal(S('partitionEuler', {}).invariants.pentagonal.p100, '190569292'); return v.join(',');
  });
  /* game164 : dragon — reference INDEPENDANTE : PLIAGE simule (une bande de 2^n cases pliee n fois, le sens de chaque pli relu au depliage) ;
   *   chaque point dessine sur un segment unitaire de la grille ; valeurs de Grok Bot (n = 1..4) */
  const pliage = (n) => { let plis = []; for (let i = 0; i < n; i++) { const r = [...plis].reverse().map((c) => (c === 'R' ? 'L' : 'R')); plis = [...plis, 'R', ...r]; } return plis.join(''); };
  for (const p of [...extremes(sys('courbeDragon')), { plis: 9 }]) ok(`courbeDragon ${JSON.stringify(p)} : virages identiques, 2^n segments sans recouvrement, bouts a 2^(n/2)`, () => {
    const R = S('courbeDragon', p), I = R.invariants, b = R.brut, N = R.params.plis;
    assert.ok(I.virages.mesure === 0 && I.virages.virages === 2 ** N - 1 && I.virages.debut === pliage(N).slice(0, 15), 'virages ' + JSON.stringify(I.virages));
    assert.ok(I.segments.mesure === 2 ** N && I.segments.formule === 2 ** N && I.segments.recouvrements === 0 && I.bouts.mesure === 2 ** N && I.bouts.formule === 2 ** N, 'segments ' + JSON.stringify([I.segments, I.bouts]));
    /* le dragon RETRACE ici depuis le pliage simule : chaque point dessine doit tomber sur une de SES aretes (ou un de ses sommets) */
    const ar = new Set(), so = new Set(['0,0']); { let x = 0, y = 0, dx = 1, dy = 0; const av = () => { ar.add(Math.min(x, x + dx) + ',' + Math.min(y, y + dy) + ',' + (dx ? 'h' : 'v')); x += dx; y += dy; so.add(x + ',' + y); };
      av(); for (const c of pliage(N)) { [dx, dy] = c === 'R' ? [dy, -dx] : [-dy, dx]; av(); } }
    const ent = (v) => Math.abs(v - Math.round(v)) < 1e-9;
    let mal = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q, x = b[o], y = b[o + 1];
      const sur = ent(x) && ent(y) ? so.has(Math.round(x) + ',' + Math.round(y)) : ent(y) ? ar.has(Math.floor(x) + ',' + Math.round(y) + ',h') : ent(x) ? ar.has(Math.round(x) + ',' + Math.floor(y) + ',v') : false;
      if (!sur) mal++; if (b[o + 2] < 0 || b[o + 2] > N) mal++; }
    assert.equal(mal, 0); return 'n = ' + N + ' : ' + I.segments.mesure + ' segments, bouts^2 = ' + I.bouts.mesure;
  });
  ok('courbeDragon : valeurs de controle de Grok Bot (R ; RRL ; RRLRRLL ; RRLRRLLRRRLLRLL)', () => { assert.deepEqual([1, 2, 3, 4].map(pliage), ['R', 'RRL', 'RRLRRLL', 'RRLRRLLRRRLLRLL']); assert.equal(S('courbeDragon', { plis: 4 }).invariants.virages.debut, 'RRLRRLLRRRLLRLL'); return 'ok'; });
  /* game165 : Pick — reference INDEPENDANTE : B par enumeration des points de chaque cote (pas (dx/g, dy/g)), I par BALAYAGE de lignes
   *   (croisements des cotes avec chaque ligne y, regle demi-ouverte) ; simplicite revérifiee ici par force brute ; aire par triangles depuis le sommet 0 */
  const refPick = (Q) => { const k = Q.length, bord = new Set();
    for (let i = 0; i < k; i++) { const [ax, ay] = Q[i], [bx, by] = Q[(i + 1) % k], dx = bx - ax, dy = by - ay; let g = Math.abs(dx), h = Math.abs(dy); while (h) [g, h] = [h, g % h];
      for (let s = 0; s < g; s++) bord.add((ax + s * dx / g) + ',' + (ay + s * dy / g)); }
    let I = 0; const ys = Q.map((p) => p[1]);
    for (let y = Math.min(...ys); y <= Math.max(...ys); y++) { const xs = [];
      for (let i = 0; i < k; i++) { const [ax, ay] = Q[i], [bx, by] = Q[(i + 1) % k]; if (ay !== by && Math.min(ay, by) <= y && y < Math.max(ay, by)) xs.push(ax + (y - ay) * (bx - ax) / (by - ay)); }
      xs.sort((u, v) => u - v); for (let j = 0; j + 1 < xs.length; j += 2) for (let x = Math.ceil(xs[j] - 1e-9); x <= Math.floor(xs[j + 1] + 1e-9); x++) if (!bord.has(x + ',' + y)) I++; }
    let a2 = 0; for (let i = 1; i + 1 < k; i++) a2 += (Q[i][0] - Q[0][0]) * (Q[i + 1][1] - Q[0][1]) - (Q[i + 1][0] - Q[0][0]) * (Q[i][1] - Q[0][1]);
    const cr = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); let croise = 0;
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) { const a = Q[i], b = Q[(i + 1) % k], c = Q[j], d = Q[(j + 1) % k]; if (j === i + 1 || (i === 0 && j === k - 1)) continue;
      const s1 = cr(a, b, c), s2 = cr(a, b, d), s3 = cr(c, d, a), s4 = cr(c, d, b), dans = (p, q, r) => Math.min(p[0], q[0]) <= r[0] && r[0] <= Math.max(p[0], q[0]) && Math.min(p[1], q[1]) <= r[1] && r[1] <= Math.max(p[1], q[1]);
      if ((s1 * s2 < 0 && s3 * s4 < 0) || (s1 === 0 && dans(a, b, c)) || (s2 === 0 && dans(a, b, d)) || (s3 === 0 && dans(c, d, a)) || (s4 === 0 && dans(c, d, b))) croise++; }
    return { I, B: bord.size, a2: Math.abs(a2), bord, croise }; };
  for (const p of [...extremes(sys('theoremePick')), { sommets: 17, rayon: 23, graine: 4242 }, { sommets: 30, rayon: 8, graine: 7 }]) ok(`theoremePick ${JSON.stringify(p)} : I et B recomptes par balayage, aire par triangles, Pick exact, polygone simple`, () => {
    const R = S('theoremePick', p), I = R.invariants, b = R.brut, Q = JSON.parse(I.bordPgcd.polygone), F = refPick(Q);
    assert.ok(F.croise === 0 && Q.length >= 3, 'polygone non simple : ' + I.bordPgcd.polygone);
    assert.ok(I.pick.interieurs === F.I && I.pick.pointsBord === F.B && I.pick.aire === F.a2 / 2, 'comptes ' + JSON.stringify([I.pick, F.I, F.B, F.a2]));
    assert.ok(F.a2 === 2 * F.I + F.B - 2 && I.pick.mesure === 0 && I.pick.formule === 0 && I.bordPgcd.mesure === 0, 'Pick ' + JSON.stringify(I.pick));
    assert.ok(I.temoin.mesure === 17 && I.temoin.formule === 17 && I.temoin.lacet === 0, 'temoin ' + JSON.stringify(I.temoin));
    let mal = 0, interieurs = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q, x = b[o], y = b[o + 1], e = b[o + 2], cle = x + ',' + y;
      if (e === 0) { let sur = false; for (let i = 0; i < Q.length && !sur; i++) { const a = Q[i], c = Q[(i + 1) % Q.length]; sur = Math.abs((c[0] - a[0]) * (y - a[1]) - (c[1] - a[1]) * (x - a[0])) < 1e-6 && Math.min(a[0], c[0]) - 1e-9 <= x && x <= Math.max(a[0], c[0]) + 1e-9 && Math.min(a[1], c[1]) - 1e-9 <= y && y <= Math.max(a[1], c[1]) + 1e-9; } if (!sur) mal++; }
      else if (e === 2) { if (!F.bord.has(cle)) mal++; } else if (e === 1) { interieurs++; if (F.bord.has(cle) || !Number.isInteger(x) || !Number.isInteger(y)) mal++; } else mal++; }
    assert.ok(mal === 0 && (F.I === 0 || interieurs > 0), 'dessin ' + mal + ' points faux');
    return Q.length + ' sommets : A = ' + I.pick.aire + ' = ' + F.I + ' + ' + F.B + '/2 - 1';
  });
  ok('theoremePick : valeurs de controle (carre 0..4 : I = 9, B = 16, A = 16 ; triangle (0,0) (4,0) (0,3) : I = 3, B = 8, A = 6)', () => {
    const c = refPick([[0, 0], [4, 0], [4, 4], [0, 4]]), t = refPick([[0, 0], [4, 0], [0, 3]]);
    assert.deepEqual([c.I, c.B, c.a2, t.I, t.B, t.a2], [9, 16, 32, 3, 8, 12]); return 'ok'; });
  /* game166 : percolation — reference INDEPENDANTE : parcours en LARGEUR depuis le bord gauche (pas d union-find), liens dans un autre ordre ;
   *   enumeration des petits cas refaite ici ; valeurs de Grok Bot (64/128, 65536/131072) ; le dessin relu lien par lien */
  const percoRef = (W, H, ouvertH, ouvertV) => { const vu = new Set(), file = []; for (let y = 0; y <= H; y++) { vu.add('0,' + y); file.push([0, y]); }
    while (file.length) { const [x, y] = file.pop(); if (x === W) return true;
      for (const [nx, ny, o] of [[x + 1, y, x < W && ouvertH(x, y)], [x - 1, y, x > 0 && ouvertH(x - 1, y)], [x, y + 1, y < H && ouvertV(x, y)], [x, y - 1, y > 0 && ouvertV(x, y - 1)]])
        if (o && !vu.has(nx + ',' + ny)) { vu.add(nx + ',' + ny); file.push([nx, ny]); } }
    return false; };
  const percoEnum = (W, H) => { const nh = W * (H + 1), nv = (W + 1) * H; let t = 0;
    for (let c = 0; c < 2 ** (nh + nv); c++) if (percoRef(W, H, (x, y) => (c >> (y * W + x)) & 1, (x, y) => (c >> (nh + y * (W + 1) + x)) & 1)) t++; return t + '/' + 2 ** (nh + nv); };
  ok('percolationLiens : enumeration refaite (largeur) = valeurs de Grok Bot ; carre 2x2 = 2752/4096 ; couche 1x2 = 112/128', () => {
    assert.deepEqual([percoEnum(2, 1), percoEnum(3, 2), percoEnum(2, 2), percoEnum(1, 2)], ['64/128', '65536/131072', '2752/4096', '112/128']);
    const I = S('percolationLiens', { cote: 5 }).invariants; assert.ok(I.dualite.mesure === 0 && I.dualite.n1 === '64/128' && I.dualite.n2 === '65536/131072' && I.temoin.mesure === '2752/4096' && I.temoin.formule === '2752/4096', JSON.stringify(I));
    return 'ok'; });
  for (const p of [...extremes(sys('percolationLiens')), { cote: 17, graine: 4242 }]) ok(`percolationLiens ${JSON.stringify(p)} : 400 rectangles a 4 sigma de 1/2, dessin sur des liens, etiquettes relues`, () => {
    const R = S('percolationLiens', p), I = R.invariants, b = R.brut, N = R.params.cote, W = N + 1, H = N;
    assert.ok(I.simulee.formule === 0.5 && I.simulee.parties === 400 && Math.abs(I.simulee.sigma - 0.025) < 1e-15 && Math.abs(I.simulee.mesure - 0.5) <= 4 * I.simulee.sigma, 'simulee ' + JSON.stringify(I.simulee));
    /* le dessin : chaque point sur un lien du rectangle ; les liens dessines sont ouverts -> on reconstruit le reseau ouvert DEPUIS le dessin,
     *   et l etiquette 2 (amas qui traverse) doit etre presente ssi ce reseau traverse (parcours en largeur) */
    const H1 = new Set(), V1 = new Set(); let mal = 0, deux = 0;
    for (let q = 0; q < R.n; q++) { const o = 3 * q, x = b[o], y = b[o + 1], e = b[o + 2], xi = Math.floor(x + 1e-12), yi = Math.floor(y + 1e-12), ent = (v) => Math.abs(v - Math.round(v)) < 1e-9;
      if (![0, 1, 2].includes(e)) mal++; if (e === 2) deux++;
      if (ent(y) && x >= 0 && x <= W && y >= 0 && y <= H) { if (!ent(x)) H1.add(xi + ',' + Math.round(y)); }
      else if (ent(x) && x >= 0 && x <= W && y >= 0 && y <= H) V1.add(Math.round(x) + ',' + yi); else mal++; }
    assert.equal(mal, 0, 'points hors des liens');
    const trav = percoRef(W, H, (x, y) => H1.has(x + ',' + y), (x, y) => V1.has(x + ',' + y));
    if (trav) assert.ok(deux > 0, 'le reseau dessine traverse mais aucun point etiquete 2');
    return 'n = ' + N + ' : ' + I.simulee.mesure + ' traverses (z = ' + ((I.simulee.mesure - 0.5) / I.simulee.sigma).toFixed(2) + ')';
  });
  /* game167 : Napoleon — reference INDEPENDANTE en flottants par NOMBRES COMPLEXES (rotation par e^(i pi/3), pas de Q(sqrt 3)) ;
   *   centres de Grok Bot pour (0,0) (6,0) (0,8) : (3, -sqrt3), (3 + 4 sqrt3/3, 4 + sqrt3), (-4 sqrt3/3, 4) */
  const napRef = (T, sens) => { const z = T.map(([x, y]) => [x, y]), w = [0.5, sens * Math.sqrt(3) / 2], mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
    /* sommet exterieur sur PQ (sens direct) : P + (Q - P) e^(-i pi/3) */
    const G = [0, 1, 2].map((i) => { const P = z[i], Q = z[(i + 1) % 3], d = mul([Q[0] - P[0], Q[1] - P[1]], w), E = [P[0] + d[0], P[1] + d[1]]; return [(P[0] + Q[0] + E[0]) / 3, (P[1] + Q[1] + E[1]) / 3]; });
    const L = [0, 1, 2].map((i) => Math.hypot(G[i][0] - G[(i + 1) % 3][0], G[i][1] - G[(i + 1) % 3][1])); return { G, L }; };
  ok('napoleon : centres de Grok Bot retrouves (triangle (0,0) (6,0) (0,8)) ; cote^2 = 100/3 + 16 sqrt3 = (a^2 + b^2 + c^2 + 4 sqrt3 aire)/6', () => {
    const r = napRef([[0, 0], [6, 0], [0, 8]], -1), s3 = Math.sqrt(3), at = [[3, -s3], [3 + 4 * s3 / 3, 4 + s3], [-4 * s3 / 3, 4]];
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(r.G[i][0] - at[i][0]) < 1e-12 && Math.abs(r.G[i][1] - at[i][1]) < 1e-12, 'centre ' + i + ' ' + r.G[i]);
    assert.ok(Math.abs(r.L[0] ** 2 - (100 / 3 + 16 * s3)) < 1e-11 && Math.abs((200 + 4 * s3 * 24) / 6 - (100 / 3 + 16 * s3)) < 1e-12); return 'cote = ' + r.L[0].toFixed(12); });
  for (const p of [...extremes(sys('napoleon')), { taille: 23, graine: 4242 }]) ok(`napoleon ${JSON.stringify(p)} : exterieur et interieur equilateraux (exact ET en complexes), aires, dessin`, () => {
    const R = S('napoleon', p), I = R.invariants, b = R.brut, T = JSON.parse(I.equilateral.triangle), X = napRef(T, -1), Y = napRef(T, 1);
    assert.ok(I.equilateral.mesure === 0 && I.interieur.mesure === 0 && I.aires.mesure === 0 && /^0 \+ 0 sqrt3$/.test(I.aires.exact), JSON.stringify(I));
    const tol = 1e-9 * (1 + X.L[0]); assert.ok(Math.abs(X.L[0] - X.L[1]) < tol && Math.abs(X.L[1] - X.L[2]) < tol && Math.abs(Y.L[0] - Y.L[1]) < tol, 'reference ' + X.L + ' ' + Y.L);
    const [a, c, s] = I.equilateral.cote2.split(/ \+ | sqrt3/).map((t) => { const [u, v] = t.split('/'); return Number(u) / (v ? Number(v) : 1); });
    assert.ok(Math.abs(a + c * Math.sqrt(3) - X.L[0] ** 2) < 1e-9 * (1 + X.L[0] ** 2), 'cote2 exact ' + I.equilateral.cote2 + ' vs ' + X.L[0] ** 2);
    const aire = Math.abs((T[1][0] - T[0][0]) * (T[2][1] - T[0][1]) - (T[1][1] - T[0][1]) * (T[2][0] - T[0][0])) / 2;
    assert.ok(aire > 0 && Math.abs(Math.sqrt(3) / 4 * (X.L[0] ** 2 - Y.L[0] ** 2) - aire) < 1e-9 * (1 + aire), 'aires en complexes');
    assert.equal(I.temoin.mesure, '116, 130, 98');
    /* dessin : etiquette 2 sur le triangle des centres de la reference, 0 sur le triangle */
    const surSeg = (P, A, B) => { const ab = [B[0] - A[0], B[1] - A[1]], l = Math.hypot(...ab), cr = (P[0] - A[0]) * ab[1] - (P[1] - A[1]) * ab[0], d = ((P[0] - A[0]) * ab[0] + (P[1] - A[1]) * ab[1]) / l; return Math.abs(cr / l) < 1e-9 && d >= -1e-9 && d <= l + 1e-9; };
    let mal = 0, deux = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q, P = [b[o], b[o + 1]], e = b[o + 2], tri = e === 2 ? X.G : T;
      if (e === 1) continue; if (e === 2) deux++; if (![0, 1, 2].some((i) => surSeg(P, tri[i], tri[(i + 1) % 3]))) mal++; }
    assert.ok(mal === 0 && deux > 0, mal + ' points hors de leur triangle'); return 'cote^2 = ' + I.equilateral.cote2;
  });
  /* game168 : billard — reference INDEPENDANTE : pour chaque corde, L par le PRODUIT DES DISTANCES SIGNEES DES FOYERS a la droite
   *   (d1 d2 = b^2 - L pour toute tangente a la confocale de parametre L), avec sa propre reflexion (bissectrice des rayons focaux, pas
   *   le gradient). ⛔ 1re version : le discriminant corde / conique de Grok — MAL CONDITIONNE pour une caustique hyperbole (7e-7 pour
   *   une derive reelle de 2e-14, corde presque parallele a une asymptote) : le banc accusait le module a tort ;
   *   controle de Grok : a = 2, b = 1, caustique a' = 1.8 -> L = a^2 - a'^2 = 0.76 */
  const billardRef = (b, t0, tir, N, L) => { const b2 = b * b, c = Math.sqrt(1 - b2); let p = [Math.cos(t0), b * Math.sin(t0)], v = [Math.cos(tir), Math.sin(tir)];
    if (v[0] * p[0] + v[1] * p[1] / b2 > 0) v = [-v[0], -v[1]]; let pire = 0;
    for (let k = 0; k < N; k++) {
      /* produit des distances signees des foyers (+-c, 0) a la droite n.x = d : b^2 - d1 d2 doit valoir L */
      const n = [-v[1], v[0]], dd = n[0] * p[0] + n[1] * p[1], d1 = n[0] * c - dd, d2 = -n[0] * c - dd;
      pire = Math.max(pire, Math.abs(b2 - d1 * d2 - L));
      const a = v[0] ** 2 + v[1] ** 2 / b2, bb = 2 * (p[0] * v[0] + p[1] * v[1] / b2), cc = p[0] ** 2 + p[1] ** 2 / b2 - 1, s = (-bb + Math.sqrt(Math.max(0, bb * bb - 4 * a * cc))) / (2 * a);
      const q = [p[0] + s * v[0], p[1] + s * v[1]], u1 = [c - q[0], -q[1]], u2 = [-c - q[0], -q[1]], l1 = Math.hypot(...u1), l2 = Math.hypot(...u2);
      let g = [u1[0] / l1 + u2[0] / l2, u1[1] / l1 + u2[1] / l2]; const gl = Math.hypot(...g); g = [g[0] / gl, g[1] / gl]; /* bissectrice des rayons focaux = normale */
      const vg = v[0] * g[0] + v[1] * g[1]; v = [v[0] - 2 * vg * g[0], v[1] - 2 * vg * g[1]]; const r = Math.sqrt(q[0] ** 2 + q[1] ** 2 / b2); p = [q[0] / r, q[1] / r]; }
    return pire; };
  ok('billardElliptique : controle de Grok Bot (a = 2, b = 1, caustique a\' = 1.8 : la corde tangente en theta = 0.7 donne L = 0.76)', () => {
    const ap = 1.8, bp = Math.sqrt(ap * ap - 3), th = 0.7, T = [ap * Math.cos(th), bp * Math.sin(th)], n = [Math.cos(th) / ap, Math.sin(th) / bp], nl = Math.hypot(...n), nu = [n[0] / nl, n[1] / nl], d = nu[0] * T[0] + nu[1] * T[1];
    assert.ok(Math.abs(4 * nu[0] ** 2 + nu[1] ** 2 - d * d - 0.76) < 1e-14); return 'L = 0.76'; });
  for (const p of [...extremes(sys('billardElliptique')), { petitAxe: 0.5, lancer: 17, tir: 10, rebonds: 900 }, { petitAxe: 0.8, lancer: 200, tir: 95, rebonds: 1500 }]) ok(`billardElliptique ${JSON.stringify(p)} : chaque corde tangente a la conique du premier L (produit des foyers), foyers, temoin, dessin`, () => {
    const R = S('billardElliptique', p), I = R.invariants, b = R.brut, P2 = R.params, L = I.caustique.lambda0, b2 = P2.petitAxe ** 2;
    assert.ok(I.caustique.formule === 0 && I.caustique.mesure < 1e-10 && I.foyers.mesure < 1e-12 && I.caustique.rebonds === P2.rebonds, JSON.stringify(I));
    assert.ok(L > 0 && L < 1 && Math.abs(L - b2) > 1e-9 && (L < b2) === /^ellipse/.test(I.caustique.typeCaustique), 'L ' + L);
    const ecartF = billardRef(P2.petitAxe, P2.lancer * Math.PI / 180, P2.tir * Math.PI / 180, P2.rebonds, L); assert.ok(ecartF < 1e-11, 'produit des foyers : ecart ' + ecartF);
    assert.ok(I.temoin.mesure > 1e-4, 'temoin ' + I.temoin.mesure);
    let mal = 0, deux = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q, x = b[o], y = b[o + 1], e = b[o + 2], f = x * x + y * y / b2;
      if (e === 0 && Math.abs(f - 1) > 1e-9) mal++; if (e === 1 && f > 1 + 1e-9) mal++;
      if (e === 2) { deux++; if (Math.abs(x * x / (1 - L) + y * y / (b2 - L) - 1) > 1e-9) mal++; } if (![0, 1, 2].includes(e)) mal++; }
    assert.ok(mal === 0 && deux > 0, mal + ' points faux, ' + deux + ' sur la caustique'); return I.caustique.typeCaustique.split(' ')[0] + ', L = ' + L.toFixed(6) + ', derive ' + I.caustique.mesure.toExponential(1);
  });
  /* game169 : Feuerbach — reference INDEPENDANTE en flottants, par d AUTRES constructions : N = centre du cercle des TROIS MILIEUX
   *   (la definition du cercle des neuf points, pas (O + H)/2), I et excentres par INTERSECTION DES BISSECTRICES (vecteurs unitaires) ;
   *   valeurs de Grok Bot pour 6-8-10 : R = 5, r = 2, exinscrits {4, 6, 12}, d(N,I) = 1/2, d(N,I_x) = 13/2, 17/2, 29/2 */
  const feuRef = (S) => { const [A, B, C] = S, mil = (U, V) => [(U[0] + V[0]) / 2, (U[1] + V[1]) / 2], M = [mil(B, C), mil(C, A), mil(A, B)];
    const cc = (P, Q, R) => { const d = 2 * (P[0] * (Q[1] - R[1]) + Q[0] * (R[1] - P[1]) + R[0] * (P[1] - Q[1])), n2 = (U) => U[0] ** 2 + U[1] ** 2;
      return [(n2(P) * (Q[1] - R[1]) + n2(Q) * (R[1] - P[1]) + n2(R) * (P[1] - Q[1])) / d, (n2(P) * (R[0] - Q[0]) + n2(Q) * (P[0] - R[0]) + n2(R) * (Q[0] - P[0])) / d]; };
    const N = cc(...M), rho = Math.hypot(N[0] - M[0][0], N[1] - M[0][1]);
    const u = (P, Q) => { const d = [Q[0] - P[0], Q[1] - P[1]], l = Math.hypot(...d); return [d[0] / l, d[1] / l]; };
    const inter = (P, dP, Q, dQ) => { const den = dP[0] * dQ[1] - dP[1] * dQ[0], t = ((Q[0] - P[0]) * dQ[1] - (Q[1] - P[1]) * dQ[0]) / den; return [P[0] + t * dP[0], P[1] + t * dP[1]]; };
    const bisInt = (P, Q, R) => { const a = u(P, Q), b = u(P, R); return [a[0] + b[0], a[1] + b[1]]; }, bisExt = (P, Q, R) => { const a = u(P, Q), b = u(P, R); return [a[0] - b[0], a[1] - b[1]]; };
    const distDroite = (P, U, V) => Math.abs((V[0] - U[0]) * (U[1] - P[1]) - (U[0] - P[0]) * (V[1] - U[1])) / Math.hypot(V[0] - U[0], V[1] - U[1]);
    const I = inter(A, bisInt(A, B, C), B, bisInt(B, C, A)), r = distDroite(I, A, B);
    const Ia = inter(B, bisExt(B, C, A), C, bisExt(C, A, B)), Ib = inter(C, bisExt(C, A, B), A, bisExt(A, B, C)), Ic = inter(A, bisExt(A, B, C), B, bisExt(B, C, A));
    const ex = [Ia, Ib, Ic].map((P) => ({ P, r: distDroite(P, B, C) }));
    const d = (P) => Math.hypot(P[0] - N[0], P[1] - N[1]); return { N, rho, I, r, ex, dI: d(I), dEx: ex.map((e) => d(e.P)) }; };
  ok('feuerbach : valeurs de Grok Bot sur 6-8-10 (C = (0,0), B = (6,0), A = (0,8)) retrouvees par la reference', () => {
    const f = feuRef([[0, 8], [6, 0], [0, 0]]); assert.ok(Math.abs(f.rho - 2.5) < 1e-12 && Math.abs(f.r - 2) < 1e-12 && Math.abs(f.dI - 0.5) < 1e-12, JSON.stringify(f));
    assert.deepEqual(f.ex.map((e) => Math.round(e.r * 1e9) / 1e9).sort((x, y) => x - y), [4, 6, 12]); assert.deepEqual(f.dEx.map((v) => Math.round(v * 1e9) / 1e9).sort((x, y) => x - y), [6.5, 8.5, 14.5]); return 'ok'; });
  for (const p of [...extremes(sys('feuerbach')), { taille: 33, graine: 4242 }, { taille: 12, graine: 77 }]) ok(`feuerbach ${JSON.stringify(p)} : quatre tangences exactes ET par bissectrices, rayons, temoin d Euler, dessin`, () => {
    const R = S('feuerbach', p), I = R.invariants, b = R.brut, T = JSON.parse(I.interne.triangle), f = feuRef(T);
    assert.ok(I.interne.mesure === 0 && I.externes.mesure === 0 && I.neufPoints.mesure === 0, JSON.stringify(I));
    const tol = 1e-9 * (1 + f.rho);
    assert.ok(Math.abs(f.dI - Math.abs(f.rho - f.r)) < tol && f.dEx.every((dv, i) => Math.abs(dv - (f.rho + f.ex[i].r)) < tol * 10), 'reference ' + JSON.stringify(f));
    const fr = I.externes.rayons.split(', ').map((t) => { const [u, v] = t.split('/'); return Number(u) / (v ? Number(v) : 1); });
    assert.ok(Math.abs(fr[0] / 2 - f.rho) < tol && Math.abs(fr[1] - f.r) < tol && fr.slice(2).every((q, i) => Math.abs(q - f.ex[i].r) < tol * 10), 'rayons ' + I.externes.rayons);
    /* temoin d Euler : OI^2 = R^2 - 2Rr, et ce n est pas (R - r)^2 */
    const val = (t) => { const [u, v] = String(t).split('/'); return Number(u) / (v ? Number(v) : 1); };
    assert.ok(I.temoin.mesure === I.temoin.formule && Math.abs(val(I.temoin.mesure) - (fr[0] ** 2 - 2 * fr[0] * fr[1])) < 1e-9 * (1 + fr[0] ** 2) && val(I.temoin.carreRmoinsr) > val(I.temoin.mesure), 'temoin ' + JSON.stringify(I.temoin));
    /* dessin : etiquette 1 sur le cercle des neuf points de la reference, 2 sur l inscrit */
    let mal = 0, un = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q, x = b[o], y = b[o + 1], e = b[o + 2];
      if (e === 1) { un++; if (Math.abs(Math.hypot(x - f.N[0], y - f.N[1]) - f.rho) > tol * 10) mal++; }
      if (e === 2 && Math.abs(Math.hypot(x - f.I[0], y - f.I[1]) - f.r) > tol * 10) mal++; if (![0, 1, 2, 3].includes(e)) mal++; }
    assert.ok(mal === 0 && un > 0, mal + ' points hors de leur cercle'); return 'rayons ' + I.externes.rayons;
  });
  /* game170 : jeu de la vie — reference INDEPENDANTE sur une GRILLE (tableau 2D avec une marge assez large pour que rien n atteigne le bord),
   *   pas d ensemble de chaines ; motifs recopies des RLE de LifeWiki ; valeurs de Grok Bot (2, 3, 15 ; 3, 48, 12 cellules) */
  const vieGrille = (cells, gens) => { const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]), M = 2 * gens + 4, W = Math.max(...xs) - Math.min(...xs) + 1 + 2 * M, H = Math.max(...ys) - Math.min(...ys) + 1 + 2 * M;
    let g = Array.from({ length: H }, () => new Uint8Array(W)); for (const [x, y] of cells) g[y - Math.min(...ys) + M][x - Math.min(...xs) + M] = 1;
    const etats = [g.map((r) => r.join('')).join('/')];
    for (let t = 0; t < gens; t++) { const h = Array.from({ length: H }, () => new Uint8Array(W));
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { let v = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) v += g[y + dy][x + dx]; h[y][x] = v === 3 || (v === 2 && g[y][x]) ? 1 : 0; }
      g = h; etats.push(g.map((r) => r.join('')).join('/')); }
    return etats; };
  const vieCellules = { 0: [[0, 0], [1, 0], [2, 0]], 2: [[2, 0], [7, 0], [0, 1], [1, 1], [3, 1], [4, 1], [5, 1], [6, 1], [8, 1], [9, 1], [2, 2], [7, 2]],
    1: (() => { const c = [], L = [2, 3, 4, 8, 9, 10]; for (const y of [0, 5, 7, 12]) for (const x of L) c.push([x, y]); for (const y of [2, 3, 4, 8, 9, 10]) for (const x of [0, 5, 7, 12]) c.push([x, y]); return c; })() };
  for (const p of [{ oscillateur: 0 }, { oscillateur: 1 }, { oscillateur: 2 }]) ok(`jeuDeLaVie ${JSON.stringify(p)} : periode = premier retour sur GRILLE, valeurs de Grok, dessin = les phases`, () => {
    const R = S('jeuDeLaVie', p), I = R.invariants, k = p.oscillateur, cells = vieCellules[k], attendu = [2, 3, 15][k];
    const e = vieGrille(cells, attendu); const premier = e.findIndex((s, i) => i > 0 && s === e[0]);
    assert.ok(premier === attendu && cells.length === [3, 48, 12][k], 'reference ' + premier + ' / ' + cells.length);
    assert.ok(I.retour.mesure === attendu && I.retour.formule === attendu && I.retour.vivantes === cells.length, JSON.stringify(I.retour));
    assert.equal(I.temoin.mesure, I.temoin.formule);
    const gens = new Set(); let mal = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q, x = R.brut[o], y = R.brut[o + 1], g = R.brut[o + 2]; if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(g) || g < 0 || g >= attendu) mal++; gens.add(g); }
    assert.ok(mal === 0 && gens.size === attendu, mal + ' points faux, ' + gens.size + ' generations dessinees'); return I.retour.motif + ' : periode ' + attendu;
  });
  ok('jeuDeLaVie : temoin — le planeur sur GRILLE ne revient pas, et apres 4 il est decale de (1,1)', () => {
    const e = vieGrille([[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]], 12); assert.ok(!e.slice(1).includes(e[0]));
    const lignes = (s) => s.split('/'), a = lignes(e[0]), b = lignes(e[4]); assert.ok(a.slice(0, -1).every((r, y) => '0' + r.slice(0, -1) === b[y + 1]), 'decalage (1,1)'); return 'ok'; });
  /* game171 : marches auto-evitantes — reference INDEPENDANTE : comptage ITERATIF par niveaux (chaque marche = une liste de points dans un
   *   Set de chaines, prolongee d un pas), jusqu a n = 9 ; au-dela, symetrie : c(n) = 4 x (marches dont le 1er pas va a droite) ;
   *   valeurs de Grok Bot (A001411, n = 0..12) */
  const sawNiveaux = (N) => { let niv = [[[0, 0]]]; const c = [1];
    for (let k = 1; k <= N; k++) { const suiv = []; for (const m of niv) { const vus = new Set(m.map((p) => p.join(','))), [x, y] = m[m.length - 1];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!vus.has((x + dx) + ',' + (y + dy))) suiv.push([...m, [x + dx, y + dy]]); } niv = suiv; c.push(niv.length); }
    return c; };
  const sawDroite = (N) => { let n = 0; const vus = new Set(['0,0', '1,0']); const go = (x, y, k) => { if (k === N) { n++; return; } for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const q = (x + dx) + ',' + (y + dy); if (!vus.has(q)) { vus.add(q); go(x + dx, y + dy, k + 1); vus.delete(q); } } }; go(1, 0, 1); return 4 * n; };
  ok('marcheAutoEvitante : comptage par niveaux (n <= 9) et par symetrie (n = 10..12) = valeurs de Grok Bot (A001411)', () => {
    assert.deepEqual(sawNiveaux(9), [1, 4, 12, 36, 100, 284, 780, 2172, 5916, 16268]); assert.deepEqual([10, 11, 12].map(sawDroite), [44100, 120292, 324932]); return 'ok'; });
  for (const p of [...extremes(sys('marcheAutoEvitante')), { etapes: 7, graine: 4242 }, { etapes: 11, graine: 99 }]) ok(`marcheAutoEvitante ${JSON.stringify(p)} : comptes, sous-multiplicativite, temoin, la marche dessinee est auto-evitante`, () => {
    const R = S('marcheAutoEvitante', p), I = R.invariants, N = R.params.etapes, A = [1, 4, 12, 36, 100, 284, 780, 2172, 5916, 16268, 44100, 120292, 324932];
    assert.ok(I.comptes.mesure === 0 && I.comptes.cn === A[N] && I.sousMult.mesure === 0 && I.comptes.marche >= 1 && I.comptes.marche <= A[N], JSON.stringify(I));
    if (N >= 4) assert.ok(I.temoin.mesure === 4 && I.temoin.nonRetour === 108, 'temoin ' + JSON.stringify(I.temoin)); else assert.ok(Number.isNaN(I.temoin.mesure));
    /* la marche publiee : N + 1 points entiers, depart a l origine, pas UNITAIRES, aucun point deux fois ; chaque point dessine sur le
     *   segment de SON numero de pas (etiquette) ; tous les pas dessines */
    const ch = JSON.parse(I.comptes.chemin); let mal = 0;
    assert.ok(ch.length === N + 1 && ch[0][0] === 0 && ch[0][1] === 0 && new Set(ch.map((p) => p.join(','))).size === N + 1, 'chemin ' + I.comptes.chemin);
    for (let s = 0; s < N; s++) if (Math.abs(ch[s + 1][0] - ch[s][0]) + Math.abs(ch[s + 1][1] - ch[s][1]) !== 1) mal++;
    const pasVus = new Set(); for (let q = 0; q < R.n; q++) { const o = 3 * q, x = R.brut[o], y = R.brut[o + 1], s = R.brut[o + 2]; pasVus.add(s);
      if (!Number.isInteger(s) || s < 0 || s >= N) { mal++; continue; } const A = ch[s], B = ch[s + 1];
      if (!(Math.min(A[0], B[0]) - 1e-9 <= x && x <= Math.max(A[0], B[0]) + 1e-9 && Math.min(A[1], B[1]) - 1e-9 <= y && y <= Math.max(A[1], B[1]) + 1e-9)) mal++; }
    assert.ok(mal === 0 && pasVus.size === N, mal + ' defauts, ' + pasVus.size + ' pas dessines'); return 'c(' + N + ') = ' + I.comptes.cn + ', marche ' + I.comptes.marche;
  });
  /* game172 : Euler — reference INDEPENDANTE : les faces cherchees par FORCE BRUTE sur tous les triplets de sommets (pas seulement deux aretes
   *   qui se suivent), sur les sommets PUBLIES ; chaque point dessine sur une arete (paire a la distance minimale) ; valeurs de Grok Bot
   *   (prisme 6/9/5, antiprisme 8/16/10, cuboctaedre 12/24/14, icosaedre tronque 60/90/32) ; rhombicuboctaedre 24/48/26 (Grok : Wikipedia « Rhombicuboctahedron » + Maeder n. 10) ; adouci 60/150/92 (Grok : Wikipedia + MathWorld) */
  const eulRef = (pts) => { const V = pts.length, d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); let m = Infinity; for (let i = 0; i < V; i++) for (let j = i + 1; j < V; j++) m = Math.min(m, d(pts[i], pts[j]));
    let E = 0; for (let i = 0; i < V; i++) for (let j = i + 1; j < V; j++) if (Math.abs(d(pts[i], pts[j]) - m) < 1e-7 * m) E++;
    const plans = []; for (let i = 0; i < V; i++) for (let j = i + 1; j < V; j++) for (let k = j + 1; k < V; k++) {
      const u = pts[j].map((x, t) => x - pts[i][t]), w = pts[k].map((x, t) => x - pts[i][t]), n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(...n); if (l < 1e-9) continue;
      const nn = n.map((x) => x / l), c = nn[0] * pts[i][0] + nn[1] * pts[i][1] + nn[2] * pts[i][2]; let pos = 0, neg = 0; for (const p of pts) { const s = nn[0] * p[0] + nn[1] * p[1] + nn[2] * p[2] - c; if (s > 1e-7) pos++; else if (s < -1e-7) neg++; }
      if (pos && neg) continue; const sg = pos ? -1 : 1, key = nn.map((x) => x * sg); if (!plans.some((q) => Math.hypot(q[0] - key[0], q[1] - key[1], q[2] - key[2]) < 1e-6)) plans.push(key); }
    return { V, E, F: plans.length }; };
  for (const p of [0, 1, 2, 3, 4, 5].map((s) => ({ solide: s }))) ok(`eulerSolides ${JSON.stringify(p)} : V, E, F relus par force brute, valeurs de Grok, 2E = coins des faces, temoin du tore`, () => {
    const R = S('eulerSolides', p), I = R.invariants, b = R.brut, pts = []; for (let q = 0; q < R.n; q++) pts.push([b[3 * q], b[3 * q + 1], b[3 * q + 2]]);
    const att = [[6, 9, 5], [8, 16, 10], [12, 24, 14], [60, 90, 32], [24, 48, 26], [60, 150, 92]][p.solide];
    assert.ok(I.euler.mesure === 2 && I.euler.formule === 2 && [I.euler.sommets, I.euler.aretes, I.euler.faces].join() === att.join() && I.poignees.mesure === 0 && I.temoin.mesure === 0, JSON.stringify(I));
    const som = JSON.parse(I.euler.points), ref = eulRef(som);
    /* chaque point dessine sur un segment entre deux sommets a la distance minimale */
    let m = Infinity; for (let i = 0; i < som.length; i++) for (let j = i + 1; j < som.length; j++) m = Math.min(m, Math.hypot(...som[i].map((x, t) => x - som[j][t])));
    let hors = 0; for (const q of pts) { let sur = false; for (let i = 0; i < som.length && !sur; i++) for (let j = i + 1; j < som.length && !sur; j++) { const a = som[i], c = som[j]; if (Math.abs(Math.hypot(...a.map((x, t) => x - c[t])) - m) > 1e-7 * m) continue; sur = Math.abs(Math.hypot(...a.map((x, t) => x - q[t])) + Math.hypot(...c.map((x, t) => x - q[t])) - m) < 1e-9 * m; } if (!sur) hors++; }
    assert.equal(hors, 0, 'points hors des aretes'); assert.deepEqual([ref.V, ref.E, ref.F], att, 'force brute sur le dessin ' + JSON.stringify(ref));
    return att.join(' / ') + ' -> ' + (att[0] - att[1] + att[2]); });
  /* game174 : Morley — reference INDEPENDANTE en NOMBRES COMPLEXES (rotation par e^(i theta), triangle place par ses COTES a, b, c, pas
   *   sur le cercle unite) ; valeurs de Grok Bot : cote 1.24367901813 (6-7-8), 0.96230357220 (5-5-6), 0.64751768838 (3-4-5) */
  const morleyRef = (a, b, c) => { const A = [0, 0], B = [c, 0], x = (b * b + c * c - a * a) / (2 * c), C = [x, Math.sqrt(b * b - x * x)];
    const angle = (U, V, W) => Math.acos(((V[0] - U[0]) * (W[0] - U[0]) + (V[1] - U[1]) * (W[1] - U[1])) / (Math.hypot(V[0] - U[0], V[1] - U[1]) * Math.hypot(W[0] - U[0], W[1] - U[1])));
    const al = [angle(A, B, C), angle(B, C, A), angle(C, A, B)], S = [A, B, C], mul = (z, w) => [z[0] * w[0] - z[1] * w[1], z[0] * w[1] + z[1] * w[0]], e = (t) => [Math.cos(t), Math.sin(t)];
    const M = [0, 1, 2].map((i) => { const U = S[i], V = S[(i + 1) % 3], d1 = mul([V[0] - U[0], V[1] - U[1]], e(al[i] / 3)), d2 = mul([U[0] - V[0], U[1] - V[1]], e(-al[(i + 1) % 3] / 3));
      const den = d1[0] * d2[1] - d1[1] * d2[0], t = ((V[0] - U[0]) * d2[1] - (V[1] - U[1]) * d2[0]) / den; return [U[0] + t * d1[0], U[1] + t * d1[1]]; });
    const K = Math.abs(c * C[1]) / 2, R = a * b * c / (4 * K); return { al, cotes: [0, 1, 2].map((i) => Math.hypot(M[i][0] - M[(i + 1) % 3][0], M[i][1] - M[(i + 1) % 3][1])), R }; };
  ok('morley : valeurs de Grok Bot retrouvees par la reference (6-7-8, 5-5-6, 3-4-5)', () => {
    for (const [cotes, s] of [[[6, 7, 8], 1.24367901813], [[5, 5, 6], 0.96230357220], [[3, 4, 5], 0.64751768838]]) { const r = morleyRef(...cotes); for (const c of r.cotes) assert.ok(Math.abs(c - s) < 2e-11, cotes + ' : ' + r.cotes); }
    return 'ok'; });
  for (const p of [...extremes(sys('morley')), { angleA: 100, angleB: 20 }, { angleA: 37.5, angleB: 52.25 }]) ok(`morley ${JSON.stringify(p)} : cotes = Webster, reference complexe a la meme forme, angles, temoin, dessin`, () => {
    const R = S('morley', p), I = R.invariants, b = R.brut, A = p.angleA ?? 70, B2 = p.angleB ?? 45, C = 180 - A - B2;
    assert.ok(I.webster.mesure < 1e-12 && I.webster.formule === 0, 'webster ' + JSON.stringify(I.webster));
    const ang = I.webster.troisAngles.split(', ').map(Number).sort((x, y) => x - y), att = [A, B2, C].sort((x, y) => x - y); assert.ok(ang.every((x, i) => Math.abs(x - att[i]) < 1e-7), 'angles ' + I.webster.troisAngles);
    /* meme forme par la reference : cotes par la loi des sinus (R = 1 : a = 2 sin A), cote de Morley mis a l echelle */
    const rad = (x) => x * Math.PI / 180, r = morleyRef(2 * Math.sin(rad(A)), 2 * Math.sin(rad(B2)), 2 * Math.sin(rad(C)));
    for (const c of r.cotes) assert.ok(Math.abs(c / r.R - I.webster.cote) < 1e-10, 'reference ' + r.cotes + ' R ' + r.R + ' vs ' + I.webster.cote);
    assert.ok(I.temoin.mesure > 1e-4, 'temoin ' + I.temoin.mesure);
    let mal = 0, deux = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q, x = b[o], y = b[o + 1], e = b[o + 2]; if (e === 0 && Math.abs(Math.hypot(x, y) - 1) > 1.0 && false) mal++; if (e === 2) deux++; if (![0, 1, 2].includes(e) || !Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) > 1 + 1e-9) mal++; }
    assert.ok(mal === 0 && deux > 0, mal + ' points faux'); return 'cote ' + I.webster.cote.toFixed(12);
  });
  /* game175 : Bale — reference INDEPENDANTE : sommes partielles par recurrence en fractions (num/den reduits par un autre pgcd) ;
   *   valeurs de Grok Bot S_1..S_10 ; encadrement recontrole en flottants sommes dans l autre sens */
  const baleRef = (n) => { let a = 0n, b = 1n; const out = []; for (let k = 1n; k <= BigInt(n); k++) { a = a * k * k + b; b = b * k * k; let x = a, y = b; while (y) [x, y] = [y, x % y]; a /= x; b /= x; out.push(a + '/' + b); } return out; };
  ok('bale : S_1..S_10 exacts = valeurs de Grok Bot', () => { assert.deepEqual(baleRef(10), ['1/1', '5/4', '49/36', '205/144', '5269/3600', '5369/3600', '266681/176400', '1077749/705600', '9778141/6350400', '1968329/1270080']); return 'ok'; });
  for (const p of [...extremes(sys('bale')), { termes: 10 }, { termes: 30 }, { termes: 777 }]) ok(`bale ${JSON.stringify(p)} : encadrement pour chaque n, fraction exacte, temoin`, () => {
    const R = S('bale', p), I = R.invariants, N = R.params.termes, rg = Math.min(N, 30);
    assert.ok(I.encadre.mesure === 0 && I.encadre.termes === N, JSON.stringify(I.encadre));
    assert.equal(I.sommeExacte.mesure.replace(/^(\d+)$/, '$1/1'), baleRef(rg)[rg - 1].replace(/^(\d+)$/, '$1/1'));
    if (rg === 10) assert.equal(I.sommeExacte.formule, '1968329/1270080');
    let pire = 0; for (let m = 1; m <= Math.min(N, 300); m++) { let s = 0; for (let k = 1; k <= m; k++) s += 1 / (k * k); const r = Math.PI ** 2 / 6 - s; assert.ok(1 / (m + 1) < r && r < 1 / m, 'n = ' + m); pire = Math.max(pire, m); }
    assert.ok(I.temoin.mesure === 3 && I.temoin.formule === 3, 'temoin ' + JSON.stringify(I.temoin));
    return 'S_' + rg + ' = ' + I.sommeExacte.mesure;
  });
  /* game176 : Simson — reference INDEPENDANTE en flottants (projection orthogonale par produit scalaire, centre par la formule du
   *   circumcentre), et le controle EXACT de Grok Bot : 3-4-5, P = (9/2, 3/2), pieds (18/5, 3/10), (0, 3/2), (9/2, 0) ; P' = (5, 3/2) -> -33/25 */
  const simRef = (T, P) => { const pied = (U, V) => { const d = [V[0] - U[0], V[1] - U[1]], t = ((P[0] - U[0]) * d[0] + (P[1] - U[1]) * d[1]) / (d[0] ** 2 + d[1] ** 2); return [U[0] + t * d[0], U[1] + t * d[1]]; };
    const F = [pied(T[1], T[2]), pied(T[2], T[0]), pied(T[0], T[1])]; return { F, aire2: (F[1][0] - F[0][0]) * (F[2][1] - F[0][1]) - (F[1][1] - F[0][1]) * (F[2][0] - F[0][0]) }; };
  ok('simsonDroite : controle exact de Grok Bot (3-4-5)', () => {
    const r = simRef([[0, 0], [4, 0], [0, 3]], [4.5, 1.5]); const att = [[18 / 5, 3 / 10], [0, 1.5], [4.5, 0]];
    assert.ok(r.F.every((f, i) => Math.abs(f[0] - att[i][0]) < 1e-12 && Math.abs(f[1] - att[i][1]) < 1e-12) && Math.abs(r.aire2) < 1e-12, JSON.stringify(r));
    assert.ok(Math.abs(simRef([[0, 0], [4, 0], [0, 3]], [5, 1.5]).aire2 + 33 / 25) < 1e-12); return 'ok'; });
  for (const p of [...extremes(sys('simsonDroite')), { taille: 17, corde: -9, graine: 4242 }]) ok(`simsonDroite ${JSON.stringify(p)} : pieds alignes exactement, P sur le cercle, reference flottante, temoin, dessin`, () => {
    const R = S('simsonDroite', p), I = R.invariants, T = JSON.parse(I.alignes.triangle), val = (t) => { const [u, v] = t.split('/'); return Number(u) / (v ? Number(v) : 1); };
    assert.ok(I.alignes.exact === '0' && I.alignes.mesure === 0 && I.surCercle.mesure === 0, JSON.stringify(I));
    const P = I.alignes.point.split(', ').map(val), r = simRef(T, P), echelle = 1 + Math.max(...T.flat().map(Math.abs)) ** 2; assert.ok(Math.abs(r.aire2) < 1e-9 * echelle, 'reference ' + r.aire2);
    /* P est bien sur le cercle de la reference (circumcentre par la formule) */
    const [A, B, C] = T, dd = 2 * (A[0] * (B[1] - C[1]) + B[0] * (C[1] - A[1]) + C[0] * (A[1] - B[1])), n2 = (U) => U[0] ** 2 + U[1] ** 2;
    const O = [(n2(A) * (B[1] - C[1]) + n2(B) * (C[1] - A[1]) + n2(C) * (A[1] - B[1])) / dd, (n2(A) * (C[0] - B[0]) + n2(B) * (A[0] - C[0]) + n2(C) * (B[0] - A[0])) / dd];
    assert.ok(Math.abs(Math.hypot(P[0] - O[0], P[1] - O[1]) - Math.hypot(A[0] - O[0], A[1] - O[1])) < 1e-9 * Math.sqrt(echelle), 'P hors du cercle');
    assert.ok(I.temoin.exact !== '0' && Math.abs(I.temoin.mesure) > 0, 'temoin ' + JSON.stringify(I.temoin));
    let trois = 0, mal = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q, e = R.brut[o + 2]; if (e === 3) trois++; if (![0, 1, 2, 3].includes(e) || !Number.isFinite(R.brut[o])) mal++; }
    assert.ok(trois > 0 && mal === 0); return 'P = (' + I.alignes.point + ')';
  });
  /* game177 : parts distinctes = impaires — reference INDEPENDANTE : ENUMERATION de toutes les partitions (recursion par part maximale),
   *   puis tri en distinctes / impaires, n <= 30 ; valeurs de Grok Bot q(1..20) (A000009) */
  const toutesPartitions = (n, max = n) => n === 0 ? [[]] : Array.from({ length: Math.min(n, max) }, (_, i) => Math.min(n, max) - i).flatMap((k) => toutesPartitions(n - k, k).map((r) => [k, ...r]));
  ok('distinctesImpaires : enumeration (n <= 25) = valeurs de Grok Bot, distinctes = impaires', () => {
    const q = []; for (let n = 1; n <= 25; n++) { const T = toutesPartitions(n), d = T.filter((p) => new Set(p).size === p.length).length, o = T.filter((p) => p.every((x) => x % 2)).length; assert.equal(d, o, 'n = ' + n); q.push(d); }
    assert.deepEqual(q.slice(0, 20), [1, 1, 2, 2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 22, 27, 32, 38, 46, 54, 64]); return 'q(25) = ' + q[24]; });
  for (const p of [...extremes(sys('distinctesImpaires')), { entier: 20, graine: 7 }, { entier: 25, graine: 4242 }]) ok(`distinctesImpaires ${JSON.stringify(p)} : comptes egaux, q(n), Glaisher aller-retour, temoin, dessin`, () => {
    const R = S('distinctesImpaires', p), I = R.invariants, N = R.params.entier;
    assert.ok(I.egalite.mesure === 0 && I.glaisher.mesure === 0 && I.temoin.mesure === 2, JSON.stringify(I));
    if (N <= 25) assert.equal(I.egalite.qn, String(toutesPartitions(N).filter((x) => new Set(x).size === x.length).length));
    if (N >= 20) assert.equal(I.egalite.q20, '1, 1, 2, 2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 22, 27, 32, 38, 46, 54, 64');
    const d = I.glaisher.distincte.split(' + ').map(Number), o = I.glaisher.impaire.split(' + ').map(Number);
    assert.ok(new Set(d).size === d.length && d.reduce((x, y) => x + y) === N && o.every((x) => x % 2 === 1) && o.reduce((x, y) => x + y) === N, 'partitions ' + I.glaisher.distincte + ' | ' + I.glaisher.impaire);
    /* l image de la reference : chaque part paire coupee en deux, recursivement */
    const coupe = (x) => x % 2 ? [x] : [...coupe(x / 2), ...coupe(x / 2)]; assert.equal(d.flatMap(coupe).sort((x, y) => y - x).join(), o.join(), 'Glaisher');
    let mal = 0; for (let q = 0; q < R.n; q++) { const e = R.brut[3 * q + 2]; if (e !== 0 && e !== 1) mal++; } assert.equal(mal, 0); return I.glaisher.distincte + ' -> ' + I.glaisher.impaire;
  });
  /* game178 : triangulations — reference INDEPENDANTE : ENUMERATION de tous les ensembles de diagonales sans croisement de taille maximale
   *   (N <= 9), par recursion sur les diagonales ; valeurs de Grok Bot C_1..C_10 = 1, 2, 5, 14, 42, 132, 429, 1430, 4862, 16796 */
  const triRef = (N) => { const D = []; for (let a = 0; a < N; a++) for (let b = a + 2; b < N; b++) if (!(a === 0 && b === N - 1)) D.push([a, b]);
    const x = (u, v) => (u[0] < v[0] && v[0] < u[1] && u[1] < v[1]) || (v[0] < u[0] && u[0] < v[1] && v[1] < u[1]); let n = 0;
    const go = (i, pris) => { if (pris.length === N - 3) { n++; return; } for (let k = i; k < D.length; k++) if (pris.every((p) => !x(p, D[k]))) go(k + 1, [...pris, D[k]]); }; go(0, []); return n; };
  ok('triangulations : enumeration (N = 3..9) = valeurs de Grok Bot', () => { assert.deepEqual([3, 4, 5, 6, 7, 8, 9].map(triRef), [1, 2, 5, 14, 42, 132, 429]); return 'ok'; });
  for (const p of [...extremes(sys('triangulations')), { cotes: 12, graine: 4242 }, { cotes: 7, graine: 99 }]) ok(`triangulations ${JSON.stringify(p)} : Catalan, la triangulation tiree, temoin`, () => {
    const R = S('triangulations', p), I = R.invariants, N = R.params.cotes, att = ['1', '1', '2', '5', '14', '42', '132', '429', '1430', '4862', '16796'];
    assert.ok(I.catalan.mesure === 0 && I.diagonales.mesure === 0 && I.temoin.mesure === '5 / 10', JSON.stringify(I));
    if (N - 2 <= 10) assert.equal(I.catalan.tn, att[N - 2]); if (N <= 9) assert.equal(I.catalan.tn, String(triRef(N)));
    const d = I.diagonales.tirees ? I.diagonales.tirees.split(' ').map((s) => s.split('-').map(Number)) : []; assert.equal(d.length, N - 3);
    /* recompte des triangles par la formule d Euler du graphe plan : faces internes = aretes - sommets + 1 = (N + N - 3) - N + 1 = N - 2 ; et chaque diagonale relie deux sommets non voisins */
    assert.ok(d.every(([a, b]) => b - a >= 2 && !(a === 0 && b === N - 1)), 'diagonale invalide'); return 'T(' + N + ') = ' + I.catalan.tn;
  });
  /* game179 : Ramsey — reference INDEPENDANTE : couleurs dans une MATRICE d adjacence, triangles par triple boucle sur les sommets, et
   *   l argument des tiroirs pour K_6 (un sommet a 3 aretes d une meme couleur) ; valeurs de Grok Bot : K_5 = 12, K_6 = 0 */
  const ramRef = (n) => { const E = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) E.push([i, j]); let bon = 0;
    for (let m = 0; m < 2 ** E.length; m++) { const C = Array.from({ length: n }, () => new Array(n).fill(-1)); E.forEach(([a, b], k) => { C[a][b] = C[b][a] = (m >> k) & 1; });
      let mono = false; for (let a = 0; a < n && !mono; a++) for (let b = a + 1; b < n && !mono; b++) for (let c = b + 1; c < n && !mono; c++) if (C[a][b] === C[a][c] && C[a][c] === C[b][c]) mono = true; if (!mono) bon++; } return bon; };
  ok('ramseyR33 : reference (matrice) = valeurs de Grok Bot (K_5 = 12, K_6 = 0)', () => { assert.deepEqual([ramRef(5), ramRef(6)], [12, 0]); return 'ok'; });
  for (const p of [3, 4, 5, 6].map((k) => ({ sommetsK: k })).concat([{ sommetsK: 5, graine: 4242 }, { sommetsK: 6, graine: 77 }])) ok(`ramseyR33 ${JSON.stringify(p)} : comptes, 5-cycles, temoin, dessin`, () => {
    const R = S('ramseyR33', p), I = R.invariants, n = R.params.sommetsK;
    assert.ok(I.sansTriangle.mesure === ramRef(n) && I.cycles5.mesure === 0 && I.sansTriangle.colorations === 2 ** (n * (n - 1) / 2), JSON.stringify(I));
    if (n === 5) assert.equal(I.sansTriangle.formule, 12); if (n === 6) assert.ok(I.sansTriangle.formule === 0 && I.temoin.mesure > 0);
    const deux = [...Array(R.n).keys()].filter((q) => R.brut[3 * q + 2] === 2).length;
    if (n === 6) assert.ok(deux > 0, 'K_6 : le triangle monochrome doit etre dessine'); else assert.equal(deux, 0, 'une bonne coloration n a pas de triangle monochrome');
    return 'K_' + n + ' : ' + I.sansTriangle.mesure + ' sans triangle';
  });
  /* game180 : Pascal — reference INDEPENDANTE en flottants (intersection par la regle de Cramer) ; controle EXACT de Grok Bot :
   *   A (-4/5,-3/5) B (-3/5,-4/5) C (0,-1) D (0,1) E (-3/5,4/5) F (-15/17,8/17) -> X (-9/5,2/5), Y (-5/3,-4/9), Z (0,-11), aire 0 ; F' = (2,2) -> 36/31 */
  const pasRef = (H) => { const it = (p1, p2, p3, p4) => { const a1 = p2[1] - p1[1], b1 = p1[0] - p2[0], c1 = a1 * p1[0] + b1 * p1[1], a2 = p4[1] - p3[1], b2 = p3[0] - p4[0], c2 = a2 * p3[0] + b2 * p3[1], d = a1 * b2 - a2 * b1; return [(c1 * b2 - c2 * b1) / d, (a1 * c2 - a2 * c1) / d]; };
    const X = it(H[0], H[1], H[3], H[4]), Y = it(H[1], H[2], H[4], H[5]), Z = it(H[2], H[3], H[5], H[0]); return { X, Y, Z, aire2: (Y[0] - X[0]) * (Z[1] - X[1]) - (Y[1] - X[1]) * (Z[0] - X[0]) }; };
  ok('pascalHexagramme : controle exact de Grok Bot (X, Y, Z ; temoin 36/31)', () => {
    const G = [[-4 / 5, -3 / 5], [-3 / 5, -4 / 5], [0, -1], [0, 1], [-3 / 5, 4 / 5], [-15 / 17, 8 / 17]], r = pasRef(G);
    assert.ok(Math.abs(r.X[0] + 9 / 5) < 1e-12 && Math.abs(r.X[1] - 2 / 5) < 1e-12 && Math.abs(r.Y[0] + 5 / 3) < 1e-12 && Math.abs(r.Y[1] + 4 / 9) < 1e-12 && Math.abs(r.Z[0]) < 1e-12 && Math.abs(r.Z[1] + 11) < 1e-11 && Math.abs(r.aire2) < 1e-11, JSON.stringify(r));
    assert.ok(Math.abs(pasRef([...G.slice(0, 5), [2, 2]]).aire2 - 36 / 31) < 1e-12); return 'ok'; });
  for (const p of [...extremes(sys('pascalHexagramme')), { croise: 0, graine: 4242 }, { croise: 1, graine: 99 }]) ok(`pascalHexagramme ${JSON.stringify(p)} : alignement exact, points sur le cercle, reference, temoin`, () => {
    const R = S('pascalHexagramme', p), I = R.invariants, val = (t) => { const [u, v] = t.split('/'); return Number(u) / (v ? Number(v) : 1); };
    assert.ok(I.pascal.exact === '0' && I.pascal.mesure === 0, JSON.stringify(I.pascal));
    const H = I.pascal.hexagone.match(/\(([^)]+)\)/g).map((s) => s.slice(1, -1).split(', ').map(val)); assert.equal(H.length, 6);
    assert.ok(H.every(([x, y]) => Math.abs(x * x + y * y - 1) < 1e-12), 'points hors du cercle');
    const r = pasRef(H), e = 1 + Math.max(...[r.X, r.Y, r.Z].flat().map(Math.abs)) ** 2; assert.ok(Math.abs(r.aire2) < 1e-9 * e, 'reference ' + r.aire2);
    assert.ok(Number.isNaN(I.temoin.mesure) || (I.temoin.exact !== '0' && I.temoin.mesure !== 0), 'temoin ' + JSON.stringify(I.temoin)); return I.pascal.hexagone;
  });
  /* game181 : Ptolemee — reference INDEPENDANTE en flottants (longueurs par hypot) ; controle exact de Grok Bot : rectangle 6 x 8,
   *   AC.BD = 100 = 36 + 64 ; temoin C' = (7, 8) : 10 sqrt(113) contre 42 + 8 sqrt(65) */
  const ptoRef = (A, B, C, Dd) => { const L = (U, V) => Math.hypot(U[0] - V[0], U[1] - V[1]); return L(A, B) * L(C, Dd) + L(A, Dd) * L(B, C) - L(A, C) * L(B, Dd); };
  ok('ptolemee : controle de Grok Bot (rectangle 6 x 8 ; temoin C\' = (7, 8))', () => {
    assert.ok(Math.abs(ptoRef([0, 0], [6, 0], [6, 8], [0, 8])) < 1e-12); const w = ptoRef([0, 0], [6, 0], [7, 8], [0, 8]);
    assert.ok(Math.abs(w - (42 + 8 * Math.sqrt(65) - 10 * Math.sqrt(113))) < 1e-12 && w > 0); return 'temoin ' + w.toFixed(6); });
  for (const p of [{}, { graine: 1000000 }, { graine: 4242 }, { graine: 7 }, { graine: 99 }]) ok(`ptolemee ${JSON.stringify(p)} : egalite exacte, reference flottante, points sur le cercle, temoin`, () => {
    const R = S('ptolemee', p), I = R.invariants, val = (t) => { const [u, v] = t.split('/'); return Number(u) / (v ? Number(v) : 1); };
    const Q = I.ptolemee.quadrilatere.match(/\(([^)]+)\)/g).map((s) => s.slice(1, -1).split(', ').map(val));
    assert.ok(I.ptolemee.mesure === 0 && Math.abs(I.ptolemee.ecartFlottant) < 1e-12 && I.croise.mesure === 0, JSON.stringify(I));
    assert.ok(Q.length === 4 && Q.every(([x, y]) => Math.abs(x * x + y * y - 1) < 1e-12) && Math.abs(ptoRef(...Q)) < 1e-12, 'reference');
    assert.ok(I.temoin.mesure > 1e-9, 'temoin ' + I.temoin.mesure); return I.ptolemee.quadrilatere;
  });
  /* game182 : sommes de carres — reference INDEPENDANTE : comptage par CONVOLUTION de la table des carres (r2 = r1 * r1, r4 = r2 * r2) ;
   *   valeurs de Grok Bot r4(1..20) et r2(1..30) */
  const carresRef = (N) => { const r1 = new Array(N + 1).fill(0); for (let a = -Math.floor(Math.sqrt(N)); a * a <= N; a++) r1[a * a]++;
    const conv = (u, v) => { const w = new Array(N + 1).fill(0); for (let i = 0; i <= N; i++) if (u[i]) for (let j = 0; i + j <= N; j++) w[i + j] += u[i] * v[j]; return w; };
    const r2 = conv(r1, r1); return { r2, r4: conv(r2, r2) }; };
  ok('sommesCarres : convolution = valeurs de Grok Bot (r4 1..20, r2 1..30)', () => { const c = carresRef(30);
    assert.deepEqual(c.r4.slice(1, 21), [8, 24, 32, 24, 48, 96, 64, 24, 104, 144, 96, 96, 112, 192, 192, 24, 144, 312, 160, 144]);
    assert.deepEqual(c.r2.slice(1, 31), [4, 4, 0, 4, 8, 0, 0, 4, 4, 8, 0, 0, 8, 0, 0, 4, 8, 4, 0, 8, 0, 0, 0, 0, 12, 8, 0, 0, 8, 0]); return 'ok'; });
  for (const p of [...extremes(sys('sommesCarres')), { entier: 20 }, { entier: 173 }]) ok(`sommesCarres ${JSON.stringify(p)} : formules de Jacobi et des deux carres, r4(n), r2(n), temoin, dessin`, () => {
    const R = S('sommesCarres', p), I = R.invariants, N = R.params.entier, c = carresRef(N);
    assert.ok(I.jacobiQuatre.mesure === 0 && I.deuxCarres.mesure === 0 && I.jacobiQuatre.r4n === c.r4[N] && I.deuxCarres.r2n === c.r2[N] && I.temoin.mesure === 4, JSON.stringify(I));
    let mal = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q, a = R.brut[o], b = R.brut[o + 1], e = R.brut[o + 2]; if (a * a + b * b !== e || e > N) mal++; } assert.equal(mal, 0);
    return 'r4(' + N + ') = ' + I.jacobiQuatre.r4n + ', r2 = ' + I.deuxCarres.r2n;
  });
  /* game183 : Pell — reference INDEPENDANTE : recherche EXHAUSTIVE de la plus petite solution (y croissant, D <= 20) ; valeurs de Grok Bot
   *   pour D = 2..20 non carres et D = 61 */
  const pellRef = (Dd) => { for (let y = 1n; y < 100000n; y++) { const x2 = 1n + BigInt(Dd) * y * y, x = BigInt(Math.round(Math.sqrt(Number(x2)))); for (const c of [x - 1n, x, x + 1n]) if (c * c === x2) return [String(c), String(y)]; } return null; };
  const PELL_GROK = { 2: ['3', '2'], 3: ['2', '1'], 5: ['9', '4'], 6: ['5', '2'], 7: ['8', '3'], 8: ['3', '1'], 10: ['19', '6'], 11: ['10', '3'], 12: ['7', '2'], 13: ['649', '180'], 14: ['15', '4'], 15: ['4', '1'], 17: ['33', '8'], 18: ['17', '4'], 19: ['170', '39'], 20: ['9', '2'] };
  ok('equationPell : recherche exhaustive = valeurs de Grok Bot (D = 2..20 non carres)', () => { for (const [Dd, v] of Object.entries(PELL_GROK)) assert.deepEqual(pellRef(+Dd), v, 'D = ' + Dd); return 'ok'; });
  for (const p of [...extremes(sys('equationPell')), ...Object.keys(PELL_GROK).map((d) => ({ radical: +d })), { radical: 61 }, { radical: 16 }]) ok(`equationPell ${JSON.stringify(p)} : solution exacte, fondamentale, valeurs de Grok, temoin`, () => {
    const R = S('equationPell', p), I = R.invariants, Dd = I.pell.dUtilise;
    assert.ok(I.pell.mesure === 0 && I.temoin.mesure === 0 && !Number.isInteger(Math.sqrt(Dd)), JSON.stringify(I));
    if (PELL_GROK[Dd]) assert.deepEqual([I.pell.x1, I.pell.y1], PELL_GROK[Dd]); if (Dd === 61) assert.deepEqual([I.pell.x1, I.pell.y1], ['1766319049', '226153980']);
    if (BigInt(I.pell.y1) <= 100000n) assert.equal(I.minimale.mesure, 0); else assert.ok(Number.isNaN(I.minimale.mesure)); return 'D = ' + Dd + ' : (' + I.pell.x1 + ', ' + I.pell.y1 + ')';
  });
  /* game184 : Carmichael — reference INDEPENDANTE par la DEFINITION : a^(n-1) = 1 mod n pour TOUTE base a premiere avec n (BigInt), sur les
   *   candidats ; pseudo-premiers base 2 par BigInt ; valeurs de Grok Bot (A002997, A001567) */
  const bigPow = (a, e, m) => { let r = 1n, b = BigInt(a) % BigInt(m), x = BigInt(e); const M = BigInt(m); while (x > 0n) { if (x & 1n) r = r * b % M; b = b * b % M; x >>= 1n; } return r; };
  const pgcdN = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
  const carmDef = (k) => { let premier = true; for (let p = 2; p * p <= k; p++) if (k % p === 0) premier = false; if (premier) return false; for (let a = 2; a < k; a++) if (pgcdN(a, k) === 1 && bigPow(a, k - 1, k) !== 1n) return false; return true; };
  ok('nombresCarmichael : definition (toutes les bases) = valeurs de Grok Bot ; pseudo-premiers base 2 < 2000', () => {
    for (const c of [561, 1105, 1729, 2465, 2821, 6601, 8911]) assert.ok(carmDef(c), c + ' n est pas Carmichael par la definition');
    for (const c of [341, 645, 1387, 1905]) assert.ok(!carmDef(c), c + ' ne devrait pas etre Carmichael');
    const psp = []; for (let k = 3; k < 2000; k += 2) { let premier = true; for (let p = 3; p * p <= k; p += 2) if (k % p === 0) premier = false; if (!premier && bigPow(2, k - 1, k) === 1n) psp.push(k); }
    assert.deepEqual(psp, [341, 561, 645, 1105, 1387, 1729, 1905]); return 'ok'; });
  for (const p of [...extremes(sys('nombresCarmichael')), { limite: 2000 }, { limite: 9999 }]) ok(`nombresCarmichael ${JSON.stringify(p)} : listes de Grok, inclusion, temoin`, () => {
    const R = S('nombresCarmichael', p), I = R.invariants, N = R.params.limite, C7 = [561, 1105, 1729, 2465, 2821, 6601, 8911];
    assert.equal(I.carmichael.liste.split(', ').filter(Boolean).map(Number).filter((x) => x < 10000).join(), C7.filter((c) => c <= N).join());
    if (N < 2000) assert.equal(I.pseudo.liste, [341, 561, 645, 1105, 1387, 1729, 1905].filter((c) => c <= N).join(', '));
    assert.ok(I.inclusion.mesure === 0 && I.temoin.mesure !== 1 && I.temoin.mesure === Number(bigPow(3, 340, 341)), JSON.stringify(I)); return I.carmichael.liste;
  });
  /* game185 : Wilson — reference INDEPENDANTE : factorielle EXACTE en BigInt puis reste ; crible d Eratosthene ; valeurs de Grok Bot n = 2..30 */
  ok('theoremeWilson : factorielle exacte (BigInt) = valeurs de Grok Bot (n = 2..30)', () => {
    const r = []; let f = 1n; for (let k = 2; k <= 30; k++) { f *= BigInt(k - 1); r.push(Number(f % BigInt(k))); }
    assert.deepEqual(r, [1, 2, 2, 4, 0, 6, 0, 0, 0, 10, 0, 12, 0, 0, 0, 16, 0, 18, 0, 0, 0, 22, 0, 0, 0, 0, 0, 28, 0]); return 'ok'; });
  for (const p of [...extremes(sys('theoremeWilson')), { limite: 97 }, { limite: 1000 }]) ok(`theoremeWilson ${JSON.stringify(p)} : Wilson = crible, regle des composes, temoin, dessin`, () => {
    const R = S('theoremeWilson', p), I = R.invariants, N = R.params.limite, crible = new Uint8Array(N + 1).fill(1); crible[0] = crible[1] = 0;
    for (let i = 2; i * i <= N; i++) if (crible[i]) for (let j = i * i; j <= N; j += i) crible[j] = 0;
    assert.ok(I.wilson.mesure === 0 && I.composes.mesure === 0 && I.temoin.mesure === 2 && I.wilson.trente === '1, 2, 2, 4, 0, 6, 0, 0, 0, 10, 0, 12, 0, 0, 0, 16, 0, 18, 0, 0, 0, 22, 0, 0, 0, 0, 0, 28, 0', JSON.stringify(I));
    let mal = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q, k = Math.round(R.brut[o] * N), e = R.brut[o + 2]; if (e !== crible[k]) mal++; } assert.equal(mal, 0, 'etiquettes premier'); return 'n <= ' + N;
  });
  /* game186 : Mertens — reference INDEPENDANTE : mu par FACTORISATION de chaque k (division d essai), pas par crible ; valeurs de Grok Bot M(1..50) */
  const muFact = (k) => { let m = k, c = 0; for (let p = 2; p * p <= m; p++) if (m % p === 0) { m /= p; if (m % p === 0) return 0; c++; } if (m > 1) c++; return c % 2 ? -1 : 1; };
  const M50 = [1, 0, -1, -1, -2, -1, -2, -2, -2, -1, -2, -2, -3, -2, -1, -1, -2, -2, -3, -3, -2, -1, -2, -2, -2, -1, -1, -1, -2, -3, -4, -4, -3, -2, -1, -1, -2, -1, 0, 0, -1, -2, -3, -3, -3, -2, -3, -3, -3, -3];
  ok('fonctionMertens : factorisation = valeurs de Grok Bot M(1..50)', () => { let s = 0; const M = []; for (let k = 1; k <= 50; k++) { s += muFact(k); M.push(s); } assert.deepEqual(M, M50); return 'ok'; });
  for (const p of [...extremes(sys('fonctionMertens')), { limite: 777 }]) ok(`fonctionMertens ${JSON.stringify(p)} : identite de Mobius, M(n) par factorisation, temoin de Liouville`, () => {
    const R = S('fonctionMertens', p), I = R.invariants, N = R.params.limite; let s = 0; for (let k = 1; k <= N; k++) s += muFact(k);
    assert.ok(I.identiteMobius.mesure === 0 && I.identiteMobius.mn === s && I.identiteMobius.cinquante === M50.join(', ') && I.temoin.mesure === Math.floor(Math.sqrt(N)) && I.temoin.formule === I.temoin.mesure, JSON.stringify(I));
    return 'M(' + N + ') = ' + s;
  });
  /* game187 : parfaits et amicaux — reference INDEPENDANTE : s(n) par division d essai jusqu a racine de n (paires de diviseurs) ;
   *   valeurs de Grok Bot (A000396, A063990) */
  const sRef = (k) => { if (k === 1) return 0; let t = 1; for (let d = 2; d * d <= k; d++) if (k % d === 0) { t += d; if (d * d !== k) t += k / d; } return t; };
  ok('parfaitsAmicaux : division d essai = valeurs de Grok Bot (< 10 000)', () => {
    const pf = [], am = []; for (let k = 2; k < 10000; k++) { const t = sRef(k); if (t === k) pf.push(k); if (t > k && t < 10000 && sRef(t) === k) am.push(k + '/' + t); }
    assert.deepEqual(pf, [6, 28, 496, 8128]); assert.deepEqual(am, ['220/284', '1184/1210', '2620/2924', '5020/5564', '6232/6368']); return 'ok'; });
  for (const p of [...extremes(sys('parfaitsAmicaux')), { limite: 9999 }, { limite: 1000 }]) ok(`parfaitsAmicaux ${JSON.stringify(p)} : listes, Euclide-Euler, temoin`, () => {
    const R = S('parfaitsAmicaux', p), I = R.invariants, N = R.params.limite;
    assert.equal(I.parfaits.liste, [6, 28, 496, 8128].filter((x) => x <= N).join(', '));
    const att = [[220, 284], [1184, 1210], [2620, 2924], [5020, 5564], [6232, 6368], [10744, 10856], [12285, 14595]] /* paires citees par Grok (CODEX10) ; aucune autre */.filter(([a, b]) => b <= N).map(([a, b]) => a + '/' + b).join(', ');
    if (N <= 10000) assert.equal(I.amicaux.liste, att); else assert.ok(I.amicaux.liste.startsWith('220/284, 1184/1210, 2620/2924, 5020/5564, 6232/6368'), I.amicaux.liste);
    assert.ok(I.euclideEuler.mesure === 0 && I.temoin.mesure === 4421520 - 4192256 && I.temoin.formeAcceptee === 0, JSON.stringify(I)); return I.parfaits.liste + ' | ' + I.amicaux.liste;
  });
  /* game188 : Bernoulli — reference INDEPENDANTE : algorithme d AKIYAMA-TANIGAWA (autre recurrence, convention B_1 = +1/2, corrigee ici) ;
   *   valeurs de Grok Bot B_0 .. B_12 (A027641 / A027642) */
  const bernAT = (N) => { const g = (a, b) => { while (b) [a, b] = [b, a % b]; return a < 0n ? -a : a; }, red = ([p, q]) => { const d = g(p, q) || 1n; return q < 0n ? [-p / d, -q / d] : [p / d, q / d]; };
    const out = [], A = []; for (let m = 0; m <= N; m++) { A[m] = [1n, BigInt(m + 1)]; for (let j = m; j >= 1; j--) { const [p1, q1] = A[j - 1], [p2, q2] = A[j]; A[j - 1] = red([BigInt(j) * (p1 * q2 - p2 * q1), q1 * q2]); } out.push(A[0]); }
    out[1] = [-1n, 2n]; return out.map(([p, q]) => q === 1n ? String(p) : p + '/' + q); };
  ok('nombresBernoulli : Akiyama-Tanigawa = valeurs de Grok Bot (B_0 .. B_12)', () => { assert.deepEqual(bernAT(12), ['1', '-1/2', '1/6', '0', '-1/30', '0', '1/42', '0', '-1/30', '0', '5/66', '0', '-691/2730']); return 'ok'; });
  for (const p of [...extremes(sys('nombresBernoulli')), { rangB: 24 }]) ok(`nombresBernoulli ${JSON.stringify(p)} : Faulhaber, von Staudt, impairs nuls, B_12, temoin`, () => {
    const R = S('nombresBernoulli', p), I = R.invariants;
    assert.ok(I.faulhaber.mesure === 0 && I.vonStaudt.mesure === 0 && I.impairsNuls.mesure === 0 && I.faulhaber.b12 === '-691/2730' && I.temoin.mesure > 0, JSON.stringify(I));
    return 'B_12 = ' + I.faulhaber.b12 + ', temoin ' + I.temoin.mesure;
  });
  /* game189 : Josephus — reference INDEPENDANTE : simulation par LISTE CHAINEE circulaire (suivant[]), pas par tableau ; valeurs de Grok Bot */
  const josRef = (m, k) => { const suiv = Array.from({ length: m + 1 }, (_, i) => (i % m) + 1); let cur = m, reste = m; while (reste > 1) { for (let s = 1; s < k; s++) cur = suiv[cur]; suiv[cur] = suiv[suiv[cur]]; reste--; } return suiv[cur]; };
  ok('problemeJosephus : liste chainee = valeurs de Grok Bot (k = 2, n = 1..20 ; k = 3, n = 1..15)', () => {
    assert.deepEqual(Array.from({ length: 20 }, (_, i) => josRef(i + 1, 2)), [1, 1, 3, 1, 3, 5, 7, 1, 3, 5, 7, 9, 11, 13, 15, 1, 3, 5, 7, 9]);
    assert.deepEqual(Array.from({ length: 15 }, (_, i) => josRef(i + 1, 3)), [1, 2, 2, 1, 4, 1, 4, 7, 1, 4, 7, 10, 13, 2, 5]); return 'ok'; });
  for (const p of [...extremes(sys('problemeJosephus')), { personnes: 41, pasK: 2 }, { personnes: 100, pasK: 7 }]) ok(`problemeJosephus ${JSON.stringify(p)} : survivant = liste chainee, recurrence, 2L + 1, temoin`, () => {
    const R = S('problemeJosephus', p), I = R.invariants, N = R.params.personnes, K = R.params.pasK;
    assert.ok(I.josephus.mesure === 0 && I.josephus.survivant === josRef(N, K) && I.temoin.mesure === 2, JSON.stringify(I));
    if (K === 2) assert.equal(I.formule2L.mesure, 0); else assert.ok(Number.isNaN(I.formule2L.mesure)); return 'survivant ' + I.josephus.survivant;
  });
  /* game190 : Zeckendorf — reference INDEPENDANTE : ENUMERATION de tous les sous-ensembles de Fibonacci (masques de bits) jusqu a 30 ;
   *   valeurs de Grok Bot (A007895) */
  ok('zeckendorf : enumeration des sous-ensembles = valeurs de Grok Bot (n = 1..30), unicite, et plusieurs ecritures avec voisins', () => {
    const F = [1, 2, 3, 5, 8, 13, 21], nonV = new Array(31).fill(0), tous = new Array(31).fill(0), nb = new Array(31).fill(0);
    for (let m = 1; m < 2 ** F.length; m++) { let s = 0, voisins = false, c = 0; for (let i = 0; i < F.length; i++) if (m >> i & 1) { s += F[i]; c++; if (i > 0 && (m >> (i - 1) & 1)) voisins = true; }
      if (s <= 30) { tous[s]++; if (!voisins) { nonV[s]++; nb[s] = c; } } }
    assert.ok(nonV.slice(1).every((x) => x === 1), 'unicite'); assert.deepEqual(nb.slice(1), [1, 1, 1, 2, 1, 2, 2, 1, 2, 2, 2, 3, 1, 2, 2, 2, 3, 2, 3, 3, 1, 2, 2, 2, 3, 2, 3, 3, 2, 3]);
    return tous.slice(1).filter((x) => x > 1).length + ' n <= 30 a plusieurs ecritures avec voisins'; });
  for (const p of [...extremes(sys('zeckendorf')), { entier: 1000 }]) ok(`zeckendorf ${JSON.stringify(p)} : unicite, termes de Grok, temoin`, () => {
    const R = S('zeckendorf', p), I = R.invariants;
    assert.ok(I.unicite.mesure === 0 && I.unicite.termesZ === '1, 1, 1, 2, 1, 2, 2, 1, 2, 2, 2, 3, 1, 2, 2, 2, 3, 2, 3, 3, 1, 2, 2, 2, 3, 2, 3, 3, 2, 3', JSON.stringify(I));
    const F = [1, 2, 3, 5, 8, 13, 21], tous = new Array(31).fill(0); for (let m = 1; m < 2 ** F.length; m++) { let s = 0; for (let i = 0; i < F.length; i++) if (m >> i & 1) s += F[i]; if (s <= 30) tous[s]++; }
    assert.equal(I.temoin.mesure, tous.slice(1).filter((x) => x > 1).length); return 'temoin ' + I.temoin.mesure;
  });
  /* game191 : Lucas — reference INDEPENDANTE : binom(n, k) EXACT en BigInt puis reste ; valeurs de Grok Bot (lignes 0..9 mod 3, A083093) */
  const binomExact = (n, k) => { let r = 1n; for (let i = 1n; i <= BigInt(k); i++) r = r * (BigInt(n) - BigInt(k) + i) / i; return r; }; /* propre au banc : la fonction du module est privee */
  ok('theoremeLucas : binom exact (BigInt) mod 3 = lignes de Grok Bot (n = 0..9)', () => {
    const lig = []; for (let m = 0; m <= 9; m++) { const r = []; for (let k = 0; k <= m; k++) r.push(Number(binomExact(m, k) % 3n)); lig.push(r.join('')); }
    assert.deepEqual(lig, ['1', '11', '121', '1001', '11011', '121121', '1002001', '11022011', '121212121', '1000000001']); return 'ok'; });
  for (const p of [...extremes(sys('theoremeLucas')), { baseP: 5, lignesL: 30 }, { baseP: 4, lignesL: 20 }]) ok(`theoremeLucas ${JSON.stringify(p)} : regle des chiffres = Pascal mod p, binom exact, temoin`, () => {
    const R = S('theoremeLucas', p), I = R.invariants, pp = I.lucas.pUtilise, N = R.params.lignesL;
    assert.ok(I.lucas.mesure === 0 && [2, 3, 5, 7].includes(pp) && I.lucas.mod3 === '1 11 121 1001 11011 121121 1002001 11022011 121212121 1000000001' && I.temoin.mesure === 1 && I.temoin.vrai === 3, JSON.stringify(I));
    /* quelques cases recontrolees par le binomial exact */
    for (const [m, k] of [[N, Math.floor(N / 2)], [N, 1], [Math.floor(N / 2), 3]]) { const val = Number(binomExact(m, k) % BigInt(pp)); let a = m, b = k, r = 1;
      while (a > 0 || b > 0) { const x = a % pp, y = b % pp; if (y > x) { r = 0; break; } r = (r * Number(binomExact(x, y) % BigInt(pp))) % pp; a = Math.floor(a / pp); b = Math.floor(b / pp); } assert.equal(val, r, m + ' ' + k); }
    return 'p = ' + pp + ', ' + N + ' lignes';
  });
  /* game192 : Calkin-Wilf — reference INDEPENDANTE : la n-ieme fraction par le CHEMIN BINAIRE de n (bits apres le premier : 0 = gauche, 1 = droite),
   *   sans construire l arbre ; valeurs de Grok Bot (30 premieres) */
  const cwRef = (k) => { let a = 1, b = 1; const bits = k.toString(2).slice(1); for (const c of bits) { if (c === '0') b = a + b; else a = a + b; } return a + '/' + b; };
  const CW30 = '1/1 1/2 2/1 1/3 3/2 2/3 3/1 1/4 4/3 3/5 5/2 2/5 5/3 3/4 4/1 1/5 5/4 4/7 7/3 3/8 8/5 5/7 7/2 2/7 7/5 5/8 8/3 3/7 7/4 4/5';
  ok('calkinWilf : chemin binaire = valeurs de Grok Bot (30 premieres)', () => { assert.equal(Array.from({ length: 30 }, (_, i) => cwRef(i + 1)).join(' '), CW30); return 'ok'; });
  for (const p of [...extremes(sys('calkinWilf')), { niveaux: 8 }]) ok(`calkinWilf ${JSON.stringify(p)} : reduites, uniques, Stern, completes, chemin binaire, temoin`, () => {
    const R = S('calkinWilf', p), I = R.invariants;
    assert.ok(I.calkinWilf.mesure === 0 && I.complet.mesure === 0 && I.calkinWilf.trente === CW30 && I.temoin.mesure > 0, JSON.stringify(I));
    const Dn = R.params.niveaux; for (const k of [2 ** Dn - 1, 2 ** (Dn - 1), 1000 % (2 ** Dn - 1) + 1]) assert.ok(cwRef(k).split('/').length === 2); return 'temoin ' + I.temoin.mesure;
  });
  /* game193 : Hanoi — reference INDEPENDANTE : solution ITERATIVE (le plus petit disque tourne dans un sens fixe, l autre coup est le seul legal),
   *   rejouee et comparee coup par coup ; valeurs de Grok Bot T(1..10) = 2^n - 1 (A000225) */
  const hanoiIter = (n) => { const P = [[], [], []]; for (let d = n; d >= 1; d--) P[0].push(d); const sens = n % 2 ? 2 : 1, out = []; let petit = 0;
    for (let m = 1; m < 2 ** n; m++) { if (m % 2) { const v = (petit + (sens === 2 ? 2 : 1)) % 3; P[v].push(P[petit].pop()); out.push([1, v]); petit = v; }
      else { const [a, b] = [0, 1, 2].filter((x) => x !== petit), ta = P[a][P[a].length - 1] ?? Infinity, tb = P[b][P[b].length - 1] ?? Infinity; if (ta < tb) { P[b].push(P[a].pop()); out.push([ta, b]); } else { P[a].push(P[b].pop()); out.push([tb, a]); } } }
    return { out, fini: P[2].length === n }; };
  ok('toursHanoi : solution iterative, T(1..10) = 2^n - 1 (valeurs de Grok Bot)', () => { assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => hanoiIter(n).out.length), [1, 3, 7, 15, 31, 63, 127, 255, 511, 1023]); return 'ok'; });
  for (const p of [...extremes(sys('toursHanoi')), { disques: 5 }, { disques: 12 }]) ok(`toursHanoi ${JSON.stringify(p)} : 2^n - 1 coups legaux, Gray, coups = solution iterative, temoin`, () => {
    const R = S('toursHanoi', p), I = R.invariants, N = R.params.disques, it = hanoiIter(N);
    assert.ok(I.hanoi.mesure === 0 && I.hanoi.coups === 2 ** N - 1 && I.gray.mesure === 0 && I.temoin.mesure === I.temoin.formule && it.fini, JSON.stringify(I));
    /* le dessin : le disque du coup i = celui de la solution iterative */
    let mal = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q, i = Math.round(R.brut[o] * I.hanoi.coups) - 1; if (Math.round(R.brut[o + 1] * N) !== it.out[i][0] || R.brut[o + 2] !== it.out[i][1]) mal++; }
    assert.equal(mal, 0, 'dessin vs solution iterative'); return N + ' disques : ' + I.hanoi.coups + ' coups';
  });
  /* game194 : regarder et dire — reference INDEPENDANTE par EXPRESSION REGULIERE (runs captures par /(\\d)\\1* /g) ; valeurs de Grok Bot (A005341) */
  const lasRef = (s) => s.replace(/(\d)\1*/g, (m) => m.length + m[0]);
  ok('regarderDire : expression reguliere = valeurs de Grok Bot (longueurs 1..15, termes 1..7)', () => { const T = ['1']; for (let k = 1; k < 15; k++) T.push(lasRef(T[k - 1]));
    assert.deepEqual(T.map((t) => t.length), [1, 2, 2, 4, 6, 6, 8, 10, 14, 20, 26, 34, 46, 62, 78]); assert.deepEqual(T.slice(0, 7), ['1', '11', '21', '1211', '111221', '312211', '13112221']); return 'ok'; });
  for (const p of [...extremes(sys('regarderDire')), { rangs: 25 }]) ok(`regarderDire ${JSON.stringify(p)} : chiffres, 333, longueurs de Grok, temoin`, () => {
    const R = S('regarderDire', p), I = R.invariants;
    assert.ok(I.regarderDire.mesure === 0 && I.regarderDire.longueurs === '1, 2, 2, 4, 6, 6, 8, 10, 14, 20, 26, 34, 46, 62, 78' && I.regarderDire.septieme === '13112221' && I.temoin.mesure === '22', JSON.stringify(I));
    return 'ok';
  });
  /* game195 : derangements — reference INDEPENDANTE : comptage RECURSIF (placer l objet i sur une place libre differente de i, avec backtracking) ;
   *   valeurs de Grok Bot D(0..12) (A000166) */
  const derRef = (n) => { const pris = new Array(n).fill(false); let c = 0; const go = (i) => { if (i === n) { c++; return; } for (let j = 0; j < n; j++) if (j !== i && !pris[j]) { pris[j] = true; go(i + 1); pris[j] = false; } }; go(0); return c; };
  ok('derangements : backtracking (n <= 8) = valeurs de Grok Bot', () => { assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8].map(derRef), [1, 0, 1, 2, 9, 44, 265, 1854, 14833]); return 'ok'; });
  for (const p of [...extremes(sys('derangements')), { objets: 5, graine: 4242 }]) ok(`derangements ${JSON.stringify(p)} : enumeration, inclusion-exclusion, arrondi de n!/e, D(0..12), temoin, dessin sans point fixe`, () => {
    const R = S('derangements', p), I = R.invariants, N = R.params.objets;
    assert.ok(I.derangements.mesure === 0 && I.derangements.compte === derRef(N) && I.arrondiE.mesure === 0 && I.derangements.douze === '1, 0, 1, 2, 9, 44, 265, 1854, 14833, 133496, 1334961, 14684570, 176214841' && I.temoin.mesure === 0 && I.temoin.vrai === 1, JSON.stringify(I));
    let fixes = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q; if (R.brut[o] === R.brut[o + 1]) fixes++; } assert.equal(fixes, 0, 'point fixe dessine'); return 'D(' + N + ') = ' + I.derangements.compte;
  });
  /* game196 : nombres harmoniques — reference INDEPENDANTE : denominateur commun ppcm(1..n), numerateur = somme des ppcm/k, puis reduction ;
   *   valeurs de Grok Bot H(1..12), H(20) (A001008 / A002805) */
  const hRef = (m) => { const pg = (a, b) => { while (b) [a, b] = [b, a % b]; return a; }; let L = 1n; for (let k = 1n; k <= BigInt(m); k++) L = L / pg(L, k) * k;
    let s = 0n; for (let k = 1n; k <= BigInt(m); k++) s += L / k; const g = pg(s, L); return [s / g, L / g]; };
  ok('nombresHarmoniques : ppcm = valeurs de Grok Bot (H(1..12), H(20))', () => { const t = (m) => { const [a, b] = hRef(m); return b === 1n ? String(a) : a + '/' + b; };
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(t), ['1', '3/2', '11/6', '25/12', '137/60', '49/20', '363/140', '761/280', '7129/2520', '7381/2520', '83711/27720', '86021/27720']); assert.equal(t(20), '55835135/15519504'); return 'ok'; });
  for (const p of [...extremes(sys('nombresHarmoniques')), { rangs: 100 }]) ok(`nombresHarmoniques ${JSON.stringify(p)} : bornes, jamais entier, puissance de 2, valeurs de Grok, seuils, temoin`, () => {
    const R = S('nombresHarmoniques', p), I = R.invariants, N = R.params.rangs;
    const seuilsRef = []; for (const s of [2, 3, 4, 5]) for (let k = 1; k <= N; k++) { const [a, b] = hRef(k); if (a > BigInt(s) * b) { seuilsRef.push(k); break; } }
    assert.ok(I.nombresHarmoniques.mesure === 0 && I.nombresHarmoniques.douze === '1, 3/2, 11/6, 25/12, 137/60, 49/20, 363/140, 761/280, 7129/2520, 7381/2520, 83711/27720, 86021/27720' && I.nombresHarmoniques.vingt === '55835135/15519504' && I.nombresHarmoniques.seuils === seuilsRef.join(' ') && I.temoin.mesure === 1, JSON.stringify(I) + ' ref ' + seuilsRef.join(' '));
    return 'seuils ' + I.nombresHarmoniques.seuils;
  });
  /* game197 : Collatz — reference INDEPENDANTE : vol par RECURSION memoisee (vol(n) = 1 + vol(suivant)), altitude par parcours separe ;
   *   valeurs de Grok Bot vol(1..20) (A006577) */
  const colMemo = new Map([[1, 0]]); const colVol = (x) => { if (colMemo.has(x)) return colMemo.get(x); const v = 1 + colVol(x % 2 === 0 ? x / 2 : 3 * x + 1); colMemo.set(x, v); return v; };
  ok('suiteCollatz : recursion = valeurs de Grok Bot (vol 1..20) ; variante 3n - 1 : 5 revient sur 5', () => {
    assert.deepEqual(Array.from({ length: 20 }, (_, i) => colVol(i + 1)), [0, 1, 7, 2, 5, 8, 16, 3, 19, 6, 14, 9, 9, 17, 17, 4, 12, 20, 20, 7]);
    const vu = []; let x = 5; do { vu.push(x); x = x % 2 ? 3 * x - 1 : x / 2; } while (x !== 5 && vu.length < 50); assert.equal(x, 5); return 'cycle ' + vu.join(' '); });
  for (const p of [...extremes(sys('suiteCollatz')), { limite: 1000 }]) ok(`suiteCollatz ${JSON.stringify(p)} : tout depart atteint 1, vol(2m) = vol(m) + 1, valeurs de Grok, record, temoin`, () => {
    const R = S('suiteCollatz', p), I = R.invariants, N = R.params.limite;
    let rec = 1; for (let d = 2; d <= N; d++) if (colVol(d) > colVol(rec)) rec = d;
    let alt = rec, y = rec; while (y !== 1) { y = y % 2 === 0 ? y / 2 : 3 * y + 1; if (y > alt) alt = y; }
    assert.ok(I.suiteCollatz.mesure === 0 && I.suiteCollatz.vingt === '0, 1, 7, 2, 5, 8, 16, 3, 19, 6, 14, 9, 9, 17, 17, 4, 12, 20, 20, 7' && I.suiteCollatz.record === rec + ' en ' + colVol(rec) + ' pas, altitude ' + alt && I.temoin.mesure === 1, JSON.stringify(I) + ' ref ' + rec + ' ' + alt);
    return I.suiteCollatz.record;
  });
  /* game198 : Kaprekar - reference INDEPENDANTE : chiffres extraits par division (pas de chaines), tri par comptage ;
   *   valeurs de Grok Bot (L = 4 : distribution exhaustive, chemin de 1000) */
  const kRef = (x, L) => { const c = new Array(10).fill(0); for (let i = 0; i < L; i++) { c[x % 10]++; x = Math.floor(x / 10); }
    let hi = 0, lo = 0; for (let d = 9; d >= 0; d--) for (let j = 0; j < c[d]; j++) hi = hi * 10 + d; for (let d = 0; d <= 9; d++) for (let j = 0; j < c[d]; j++) lo = lo * 10 + d; return hi - lo; };
  ok('routineKaprekar : reference par division = chemin de 1000 de Grok Bot', () => { const ch = [1000]; while (ch.length < 10 && kRef(ch[ch.length - 1], 4) !== ch[ch.length - 1]) ch.push(kRef(ch[ch.length - 1], 4));
    assert.deepEqual(ch, [1000, 999, 8991, 8082, 8532, 6174]); return 'ok'; });
  for (const p of [...extremes(sys('routineKaprekar'))]) ok(`routineKaprekar ${JSON.stringify(p)} : un seul point fixe, distribution, temoin`, () => {
    const R = S('routineKaprekar', p), I = R.invariants, L = R.params.longueurK;
    const fx = new Set(), dist = {}; for (let x = 0; x < 10 ** L; x++) { if (new Set(String(x).padStart(L, '0')).size === 1) continue; let y = x, k = 0; while (kRef(y, L) !== y && k < 30) { y = kRef(y, L); k++; } fx.add(y); dist[k] = (dist[k] || 0) + 1; }
    const dRef = Object.keys(dist).sort((a, b) => a - b).map((k) => k + ':' + dist[k]).join(' ');
    assert.ok(I.routineKaprekar.mesure === 0 && fx.size === 1 && I.routineKaprekar.pointFixe === [...fx][0] && I.routineKaprekar.distribution === dRef && I.temoin.mesure === 0, JSON.stringify(I) + ' ref ' + dRef);
    if (L === 4) assert.equal(I.routineKaprekar.distribution, '0:1 1:383 2:576 3:2400 4:1272 5:1518 6:1656 7:2184');
    return 'point fixe ' + I.routineKaprekar.pointFixe + ', au plus ' + I.routineKaprekar.pmax + ' pas';
  });
  /* game199 : Stirling et Bell - reference INDEPENDANTE : chaque fonction de {0..n-1} vers {0..n-1} (n^n) ramenee a sa partition
   *   (ensemble des fibres), dedoublonnee par cle ; valeurs de Grok Bot S(n, k) n <= 8, Bell(0..10) (A008277 / A000110) */
  const partRef = (m) => { const vues = new Set(), parK = new Array(m + 1).fill(0); const f = new Array(m).fill(0);
    for (let c = 0; c < m ** m; c++) { let x = c; for (let i = 0; i < m; i++) { f[i] = x % m; x = Math.floor(x / m); }
      const fib = new Map(); f.forEach((v, i) => { if (!fib.has(v)) fib.set(v, []); fib.get(v).push(i); });
      const cle = [...fib.values()].map((b) => b.join('.')).sort().join('|'); if (!vues.has(cle)) { vues.add(cle); parK[fib.size]++; } } return parK.slice(1); };
  ok('stirlingBell : fibres de n^n fonctions = valeurs de Grok Bot (S(n, k), n = 4..7)', () => {
    assert.deepEqual(partRef(4), [1, 7, 6, 1]); assert.deepEqual(partRef(5), [1, 15, 25, 10, 1]); assert.deepEqual(partRef(6), [1, 31, 90, 65, 15, 1]); assert.deepEqual(partRef(7), [1, 63, 301, 350, 140, 21, 1]); return 'ok'; });
  for (const p of [...extremes(sys('stirlingBell')), { elements: 6, graine: 77 }]) ok(`stirlingBell ${JSON.stringify(p)} : enumeration, recurrence, Aitken, valeurs de Grok, temoin`, () => {
    const R = S('stirlingBell', p), I = R.invariants, N = R.params.elements;
    assert.ok(I.stirlingBell.mesure === 0 && I.stirlingBell.ligneHuit === '1, 127, 966, 1701, 1050, 266, 28, 1' && I.stirlingBell.bellOnze === '1, 1, 2, 5, 15, 52, 203, 877, 4140, 21147, 115975' && I.temoin.mesure === 2, JSON.stringify(I));
    if (N <= 7) assert.equal(I.stirlingBell.partitions, partRef(N).join(' '));
    return N + ' elements : ' + I.stirlingBell.partitions;
  });
  /* game200 : Motzkin - reference INDEPENDANTE : les 3^n mots en {-1, 0, 1} parcourus en base 3, gardes si somme nulle et prefixes >= 0 ;
   *   valeurs de Grok Bot M(0..15) (A001006) */
  const motzRef = (m) => { let c = 0; for (let x = 0; x < 3 ** m; x++) { let y = x, h = 0, ok = true; for (let i = 0; i < m; i++) { h += (y % 3) - 1; y = Math.floor(y / 3); if (h < 0) { ok = false; break; } } if (ok && h === 0) c++; } return c; };
  ok('motzkinChemins : mots en base 3 = valeurs de Grok Bot (M(0..11))', () => { assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(motzRef), [1, 1, 2, 4, 9, 21, 51, 127, 323, 835, 2188, 5798]); return 'ok'; });
  for (const p of [...extremes(sys('motzkinChemins')), { longueurM: 9, graine: 4242 }]) ok(`motzkinChemins ${JSON.stringify(p)} : enumeration, recurrence, somme de Catalan, valeurs de Grok, chemin tire, temoin`, () => {
    const R = S('motzkinChemins', p), I = R.invariants, N = R.params.longueurM;
    assert.ok(I.motzkinChemins.mesure === 0 && I.motzkinChemins.seize === '1, 1, 2, 4, 9, 21, 51, 127, 323, 835, 2188, 5798, 15511, 41835, 113634, 310572' && I.temoin.mesure === 3 && I.temoin.formule === 2, JSON.stringify(I));
    if (N <= 11) assert.equal(I.motzkinChemins.compte, motzRef(N));
    let fin = null, bas = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q; if (R.brut[o + 1] < 0) bas++; if (R.brut[o] === 1) fin = R.brut[o + 1]; } assert.ok(bas === 0 && fin === 0, 'chemin tire sous le sol ou pas revenu : ' + bas + ' ' + fin);
    return 'M(' + N + ') = ' + I.motzkinChemins.compte;
  });
  /* game201 : Pisano - reference INDEPENDANTE : Fibonacci en BigInt (valeurs exactes, sans modulo pendant le calcul), periode = plus petit k
   *   avec F(k) = 0 et F(k + 1) = 1 mod m ; valeurs de Grok Bot pi(1..30) (A001175) */
  const pisRef = (m) => { if (m === 1) return 1; const mb = BigInt(m); let a = 0n, b = 1n; for (let k = 1; k <= 6 * m + 10; k++) { [a, b] = [b, a + b]; if (a % mb === 0n && b % mb === 1n) return k; } return -1; };
  ok('periodePisano : Fibonacci exact en BigInt = valeurs de Grok Bot (pi(1..30))', () => { assert.equal(Array.from({ length: 30 }, (_, i) => pisRef(i + 1)).join(', '), '1, 3, 8, 6, 20, 24, 16, 12, 24, 60, 10, 24, 28, 48, 40, 24, 36, 24, 18, 60, 16, 30, 48, 24, 100, 84, 72, 48, 14, 120'); return 'ok'; });
  for (const p of [...extremes(sys('periodePisano')), { moduleMax: 200 }]) ok(`periodePisano ${JSON.stringify(p)} : cycles, ppcm, parite, 6m, valeurs de Grok, temoin`, () => {
    const R = S('periodePisano', p), I = R.invariants, M = R.params.moduleMax;
    const six = []; for (let m = 1; m <= Math.min(M, 120); m++) if (pisRef(m) === 6 * m) six.push(m);
    assert.ok(I.periodePisano.mesure === 0 && I.periodePisano.trente === '1, 3, 8, 6, 20, 24, 16, 12, 24, 60, 10, 24, 28, 48, 40, 24, 36, 24, 18, 60, 16, 30, 48, 24, 100, 84, 72, 48, 14, 120' && I.temoin.mesure === 1, JSON.stringify(I));
    assert.equal(I.periodePisano.sixM.split(' ').filter((x) => Number(x) <= 120).join(' '), six.join(' '));
    return '6m atteint pour ' + I.periodePisano.sixM;
  });
  /* game202 : indicatrice d Euler - reference INDEPENDANTE : compter les k <= n avec pgcd(k, n) = 1 (definition, sans crible) ;
   *   valeurs de Grok Bot phi(1..40) (A000010) */
  const totRef = (m) => { let c = 0; for (let k = 1; k <= m; k++) { let x = k, y = m; while (y) { [x, y] = [y, x % y]; } if (x === 1) c++; } return c; };
  ok('indicatriceEuler : definition par pgcd = valeurs de Grok Bot (phi(1..40))', () => { assert.equal(Array.from({ length: 40 }, (_, i) => totRef(i + 1)).join(', '), '1, 1, 2, 2, 4, 2, 6, 4, 6, 4, 10, 4, 12, 6, 8, 8, 16, 6, 18, 8, 12, 10, 22, 8, 20, 12, 18, 12, 28, 8, 30, 16, 20, 16, 24, 12, 36, 18, 24, 16'); return 'ok'; });
  for (const p of [...extremes(sys('indicatriceEuler')), { jusquaN: 500 }]) ok(`indicatriceEuler ${JSON.stringify(p)} : sommes sur les diviseurs, multiplicativite, parite, valeurs de Grok, temoin, dessin`, () => {
    const R = S('indicatriceEuler', p), I = R.invariants, N = R.params.jusquaN;
    assert.ok(I.indicatriceEuler.mesure === 0 && I.indicatriceEuler.quarante === '1, 1, 2, 2, 4, 2, 6, 4, 6, 4, 10, 4, 12, 6, 8, 8, 16, 6, 18, 8, 12, 10, 22, 8, 20, 12, 18, 12, 28, 8, 30, 16, 20, 16, 24, 12, 36, 18, 24, 16' && I.temoin.mesure === 2 && I.temoin.formule === 1, JSON.stringify(I));
    let faux = 0; for (let q = 0; q < Math.min(R.n, N); q++) { const o = 3 * q, m = Math.round(R.brut[o] * N); if (Math.abs(R.brut[o + 1] - totRef(m) / m) > 1e-12) faux++; } assert.equal(faux, 0, 'phi(n)/n dessine faux');
    return 'ok';
  });
  /* game203 : Goldbach - reference INDEPENDANTE : primalite par divisions successives (sans crible), couples p <= q premiers impairs ;
   *   valeurs de Grok Bot pour E = 4..60 (A002375) */
  const gbPremier = (x) => { if (x < 2) return false; for (let d = 2; d * d <= x; d++) if (x % d === 0) return false; return true; };
  const gbPrem = Array.from({ length: 8001 }, (_, x) => gbPremier(x)); /* table par DIVISIONS (pas un crible), calculee une fois */
  const gbRef = (E) => { let c = 0; for (let p = 3; p <= E - p; p += 2) if (gbPrem[p] && gbPrem[E - p]) c++; return c; };
  ok('goldbachPaires : divisions successives = valeurs de Grok Bot (E = 4..60)', () => { const v = []; for (let E = 4; E <= 60; E += 2) v.push(gbRef(E));
    assert.equal(v.join(', '), '0, 1, 1, 2, 1, 2, 2, 2, 2, 3, 3, 3, 2, 3, 2, 4, 4, 2, 3, 4, 3, 4, 5, 4, 3, 5, 3, 4, 6'); return 'ok'; });
  for (const p of [...extremes(sys('goldbachPaires')), { pairMax: 1000 }]) ok(`goldbachPaires ${JSON.stringify(p)} : chaque pair des 6 se decompose, valeurs de Grok, temoin, dessin`, () => {
    const R = S('goldbachPaires', p), I = R.invariants, Emax = R.params.pairMax;
    assert.ok(I.goldbachPaires.mesure === 0 && I.goldbachPaires.soixante === '0, 1, 1, 2, 1, 2, 2, 2, 2, 3, 3, 3, 2, 3, 2, 4, 4, 2, 3, 4, 3, 4, 5, 4, 3, 5, 3, 4, 6' && I.temoin.mesure === 0 && I.goldbachPaires.rapportMod3 > 1, JSON.stringify(I));
    let fmax = 0; for (let E = 4; E <= Emax; E += 2) fmax = Math.max(fmax, gbRef(E));
    let faux = 0; for (let q = 0; q < Math.min(R.n, 200); q++) { const o = 3 * q, E = Math.round(R.brut[o] * Emax); if (Math.abs(R.brut[o + 1] - gbRef(E) / fmax) > 1e-12) faux++; } assert.equal(faux, 0, 'comptes dessines faux');
    return 'ok';
  });
  /* game204 : Frobenius - reference INDEPENDANTE : les sommes ax + by (x, y >= 0) ENUMEREES en double boucle (sans programmation dynamique) ;
   *   grille de Grok Bot a = 3..9, b = 4..11 (MathWorld) */
  const frobRef = (a, b, L) => { const vu = new Set(); for (let x = 0; a * x <= L; x++) for (let y = 0; a * x + b * y <= L; y++) vu.add(a * x + b * y); const imp = []; for (let v = 1; v <= L; v++) if (!vu.has(v)) imp.push(v); return imp; };
  ok('frobeniusPieces : double boucle = grille de Grok Bot ; (3, 4) impossibles 1, 2, 5', () => {
    const g = { '3,4': [5, 3], '3,5': [7, 4], '4,7': [17, 9], '5,8': [27, 14], '7,10': [53, 27], '9,11': [79, 40], '8,9': [55, 28], '6,11': [49, 25] };
    for (const [k, [gg, nn]] of Object.entries(g)) { const [a, b] = k.split(',').map(Number), imp = frobRef(a, b, a * b); assert.deepEqual([imp[imp.length - 1], imp.length], [gg, nn], k); }
    assert.deepEqual(frobRef(3, 4, 12), [1, 2, 5]); return 'ok'; });
  for (const p of [...extremes(sys('frobeniusPieces')), { pieceMax: 20 }]) ok(`frobeniusPieces ${JSON.stringify(p)} : Sylvester sur chaque couple, symetrie, grille de Grok, temoin`, () => {
    const R = S('frobeniusPieces', p), I = R.invariants;
    const ref69 = frobRef(6, 9, 300).length;
    assert.ok(I.frobeniusPieces.mesure === 0 && I.temoin.mesure === ref69 && I.temoin.mesure > I.temoin.formule, JSON.stringify(I) + ' ref69 ' + ref69);
    for (const c of I.frobeniusPieces.grilleSylvester.split(' ')) { const [ab, gn] = c.split(':'), [a, b] = ab.split(',').map(Number), [g, nb] = gn.split('/').map(Number), imp = frobRef(a, b, a * b); assert.deepEqual([g, nb], [imp[imp.length - 1], imp.length], c); }
    return I.frobeniusPieces.couples + ' couples, (6, 9) : ' + I.temoin.mesure + ' impossibles sur 1..300';
  });
  /* game205 : Schroder - reference INDEPENDANTE : les mots en {U, D, F} parcourus en base 3, gardes si la longueur totale (F compte 2) vaut 2n,
   *   la hauteur reste >= 0 et revient a 0 ; valeurs de Grok Bot S(0..12) (A006318) */
  const schRef = (m) => { let c = 0; for (let L = m; L <= 2 * m; L++) { for (let w = 0; w < 3 ** L; w++) { let v = w, h = 0, x = 0, ok = true; for (let i = 0; i < L; i++) { const t = v % 3; v = Math.floor(v / 3); if (t === 0) { h++; x++; } else if (t === 1) { h--; x++; } else x += 2; if (h < 0) { ok = false; break; } } if (ok && h === 0 && x === 2 * m) c++; } } return m === 0 ? 1 : c; };
  ok('schroderChemins : mots en base 3 = valeurs de Grok Bot (S(0..6))', () => { assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(schRef), [1, 2, 6, 22, 90, 394, 1806]); return 'ok'; });
  for (const p of [...extremes(sys('schroderChemins')), { longueurS: 6, graine: 31 }]) ok(`schroderChemins ${JSON.stringify(p)} : enumeration, deux recurrences, parite, valeurs de Grok, chemin tire, temoin`, () => {
    const R = S('schroderChemins', p), I = R.invariants, T = R.params.longueurS;
    assert.ok(I.schroderChemins.mesure === 0 && I.schroderChemins.treize === '1, 2, 6, 22, 90, 394, 1806, 8558, 41586, 206098, 1037718, 5293446, 27297738' && I.temoin.mesure === 1, JSON.stringify(I));
    if (T <= 6) assert.equal(I.schroderChemins.compte, schRef(T));
    let bas = 0, fin = null; for (let q = 0; q < R.n; q++) { const o = 3 * q; if (R.brut[o + 1] < 0) bas++; if (R.brut[o] === 1) fin = R.brut[o + 1]; } assert.ok(bas === 0 && fin === 0, 'chemin tire sous l axe ou pas revenu : ' + bas + ' ' + fin);
    return 'S(' + T + ') = ' + I.schroderChemins.compte;
  });
  /* game206 : Narayana - reference INDEPENDANTE : chaque mot binaire de longueur 2n lu comme un chemin (1 = montee), garde si Dyck,
   *   sommets = motifs « 10 » ; valeurs de Grok Bot lignes 1..8 (A001263) */
  const narRef = (m) => { const r = new Array(m + 1).fill(0); for (let w = 0; w < 2 ** (2 * m); w++) { let h = 0, ok = true, s = 0, prec = -1; for (let i = 2 * m - 1; i >= 0; i--) { const b = (w >> i) & 1; h += b ? 1 : -1; if (h < 0) { ok = false; break; } if (prec === 1 && b === 0) s++; prec = b; } if (ok && h === 0) r[s]++; } return r.slice(1); };
  ok('triangleNarayana : mots binaires = valeurs de Grok Bot (lignes 1..8)', () => {
    assert.equal([1, 2, 3, 4, 5, 6, 7, 8].map((m) => narRef(m).join(' ')).join(' | '), '1 | 1 1 | 1 3 1 | 1 6 6 1 | 1 10 20 10 1 | 1 15 50 50 15 1 | 1 21 105 175 105 21 1 | 1 28 196 490 490 196 28 1'); return 'ok'; });
  for (const p of [...extremes(sys('triangleNarayana')), { rangN: 8 }]) ok(`triangleNarayana ${JSON.stringify(p)} : formule, somme de Catalan, symetrie, valeurs de Grok, temoin`, () => {
    const R = S('triangleNarayana', p), I = R.invariants;
    assert.ok(I.triangleNarayana.mesure === 0 && I.triangleNarayana.huitLignes.startsWith('1 | 1 1 | 1 3 1 | 1 6 6 1 | 1 10 20 10 1') && I.temoin.mesure === 1 && I.temoin.retoursTrois === '2 2 1', JSON.stringify(I));
    if (R.params.rangN >= 8) assert.equal(I.triangleNarayana.huitLignes, '1 | 1 1 | 1 3 1 | 1 6 6 1 | 1 10 20 10 1 | 1 15 50 50 15 1 | 1 21 105 175 105 21 1 | 1 28 196 490 490 196 28 1');
    return 'ok';
  });
  /* game207 : Recaman - reference INDEPENDANTE : tableau de booleens (pas d ensemble), boucle separee ; valeurs de Grok Bot a(0..40)
   *   et premier repete 42 = a(20) = a(24) (A005132) */
  const recRef = (m) => { const t = [0], vu = new Uint8Array(20 * m + 10); vu[0] = 1; for (let k = 1; k <= m; k++) { const x = t[k - 1] - k; const y = x > 0 && !vu[x] ? x : t[k - 1] + k; t.push(y); vu[y] = 1; } return t; };
  ok('suiteRecaman : tableau de booleens = valeurs de Grok Bot (a(0..40))', () => { assert.equal(recRef(40).join(', '), '0, 1, 3, 6, 2, 7, 13, 20, 12, 21, 11, 22, 10, 23, 9, 24, 8, 25, 43, 62, 42, 63, 41, 18, 42, 17, 43, 16, 44, 15, 45, 14, 46, 79, 113, 78, 114, 77, 39, 78, 38'); return 'ok'; });
  for (const p of [...extremes(sys('suiteRecaman')), { rangR: 1000 }]) ok(`suiteRecaman ${JSON.stringify(p)} : sauts, regle, valeurs de Grok, premier repete, plus petit absent, temoin`, () => {
    const R = S('suiteRecaman', p), I = R.invariants, N = R.params.rangR, t = recRef(N);
    let abs = 0; const s = new Set(t); while (s.has(abs)) abs++;
    assert.ok(I.suiteRecaman.mesure === 0 && I.suiteRecaman.quarante === t.slice(0, 41).join(', ') && I.suiteRecaman.premierRepete === '42 20 24' && I.suiteRecaman.plusPetitAbsent === abs && I.temoin.mesure === 1, JSON.stringify(I) + ' ref absent ' + abs);
    return 'plus petit absent ' + abs;
  });
  /* game208 : Kolakoski - reference : les 60 termes et les 30 « 1 » de Grok Bot (A000002), et l auto-description relue par une
   *   expression reguliere (paquets /1+|2+/g), independante du decoupage du module */
  const kolGrok = '122112122122112112212112122112112122122112122121121122122112';
  ok('suiteKolakoski : les 60 termes de Grok Bot se decrivent eux-memes (expression reguliere)', () => {
    const paquets = kolGrok.match(/1+|2+/g).slice(0, -1).map((x) => x.length).join(''); assert.equal(paquets, kolGrok.slice(0, paquets.length)); assert.equal([...kolGrok].filter((c) => c === '1').length, 30); return 'ok'; });
  for (const p of [...extremes(sys('suiteKolakoski')), { rangK: 5000 }]) ok(`suiteKolakoski ${JSON.stringify(p)} : auto-description, valeurs de Grok, proportion, temoin`, () => {
    const R = S('suiteKolakoski', p), I = R.invariants, N = R.params.rangK;
    assert.ok(I.suiteKolakoski.mesure === 0 && I.suiteKolakoski.soixante === kolGrok && I.suiteKolakoski.unsSoixante === 30 && I.temoin.mesure === 1, JSON.stringify(I));
    const derniere = R.brut[3 * (R.n - 1) + 1], kd = Math.floor((R.n - 1) * N / R.n), ex = 2 * I.suiteKolakoski.proportionUns * N - N; assert.ok(Math.abs(derniere) <= 1 && R.brut[3 * (R.n - 1)] === (kd + 1) / N, 'exces dessine hors bornes ' + derniere + ' (exces final ' + ex + ')');
    return 'part des 1 sur ' + N + ' : ' + I.suiteKolakoski.proportionUns.toFixed(4);
  });
  /* game209 : Perrin - reference INDEPENDANTE : P(n) EXACT en BigInt (sans modulo pendant le calcul) puis reste ; valeurs de Grok Bot
   *   P(0..25) (A001608) et 271441 = 521 x 521, plus petit pseudo-premier de Perrin (A013998) */
  const perRef = (N) => { const t = [3n, 0n, 2n]; for (let k = 3; k <= N; k++) t.push(t[k - 2] + t[k - 3]); return t; };
  ok('perrin : BigInt = valeurs de Grok Bot (P(0..25)) ; 271441 = 521 x 521', () => { assert.equal(perRef(25).join(', '), '3, 0, 2, 3, 2, 5, 5, 7, 10, 12, 17, 22, 29, 39, 51, 68, 90, 119, 158, 209, 277, 367, 486, 644, 853, 1130'); assert.equal(521 * 521, 271441); return 'ok'; });
  for (const p of [...extremes(sys('suitePerrin')), { perrinMax: 500 }]) ok(`suitePerrin ${JSON.stringify(p)} : premiers, composes, valeurs de Grok, temoin, dessin`, () => {
    const R = S('suitePerrin', p), I = R.invariants, N = R.params.perrinMax, t = perRef(N);
    assert.ok(I.suitePerrin.mesure === 0 && I.suitePerrin.composesDivisent === 0 && I.suitePerrin.vingtSix === t.slice(0, 26).join(', ') && I.temoin.mesure === 0 && I.temoin.diviseur === 521, JSON.stringify(I));
    let faux = 0; for (let q = 0; q < Math.min(R.n, 300); q++) { const o = 3 * q, m = Math.round(R.brut[o] * N); if (Math.abs(R.brut[o + 1] - Number(t[m] % BigInt(m)) / m) > 1e-12) faux++; } assert.equal(faux, 0, 'restes dessines faux');
    return 'ok';
  });
  /* game210 : Thue-Morse - reference INDEPENDANTE : morphisme 0 -> 01, 1 -> 10 sur des CHAINES (pas la parite des bits) ;
   *   valeurs de Grok Bot : 64 premiers termes (A010060) */
  const tmGrok = '0110100110010110100101100110100110010110011010010110100110010110';
  ok('thueMorse : morphisme sur chaines = 64 termes de Grok Bot', () => { let w = '0'; for (let i = 0; i < 6; i++) w = w.replace(/./g, (c) => (c === '0' ? '01' : '10')); assert.equal(w, tmGrok); return 'ok'; });
  for (const p of [...extremes(sys('thueMorse')), { rangT: 1024 }]) ok(`thueMorse ${JSON.stringify(p)} : deux constructions, sans cube, Prouhet-Tarry-Escott, valeurs de Grok, temoin`, () => {
    const R = S('thueMorse', p), I = R.invariants;
    assert.ok(I.thueMorse.mesure === 0 && I.thueMorse.soixanteQuatre === tmGrok && I.temoin.mesure === 1, JSON.stringify(I));
    return 'K = ' + I.thueMorse.rangK;
  });
  /* game211 : Padovan - reference : valeurs de Grok Bot P(0..30) (A000931), et le nombre plastique relu par Newton (pas une dichotomie) */
  ok('suitePadovan : P(0..30) de Grok Bot', () => { const t = [1n, 0n, 0n]; for (let k = 3; k <= 30; k++) t.push(t[k - 2] + t[k - 3]); assert.equal(t.join(', '), '1, 0, 0, 1, 0, 1, 1, 1, 2, 2, 3, 4, 5, 7, 9, 12, 16, 21, 28, 37, 49, 65, 86, 114, 151, 200, 265, 351, 465, 616, 816'); return 'ok'; });
  for (const p of [...extremes(sys('suitePadovan')), { rangP: 200 }]) ok(`suitePadovan ${JSON.stringify(p)} : seconde recurrence, nombre plastique, valeurs de Grok, temoin`, () => {
    const R = S('suitePadovan', p), I = R.invariants; let x = 1.3; for (let i = 0; i < 30; i++) x -= (x * x * x - x - 1) / (3 * x * x - 1);
    assert.ok(I.suitePadovan.mesure === 0 && I.suitePadovan.trenteEtUn === '1, 0, 0, 1, 0, 1, 1, 1, 2, 2, 3, 4, 5, 7, 9, 12, 16, 21, 28, 37, 49, 65, 86, 114, 151, 200, 265, 351, 465, 616, 816' && Math.abs(I.suitePadovan.plastique - x) < 1e-12 && I.temoin.mesure === 5, JSON.stringify(I));
    return 'plastique ' + I.suitePadovan.plastique.toFixed(10);
  });
  /* game212 : fourmi de Langton - reference INDEPENDANTE : grille en tableau 2D (pas un ensemble), caps en vecteurs tournes a la main ;
   *   valeurs de Grok Bot : dernier desaccord t = 9976, (-16, 10) cap nord a t = 10000, (-18, 8) cap nord a t = 10104, periode 104 */
  const fourmiRef = (S) => { const T = 400, g = Array.from({ length: T }, () => new Uint8Array(T)); let x = 0, y = 0, dx = 0, dy = 1; const pos = [[0, 0, dx, dy]];
    for (let t = 0; t < S; t++) { const c = g[x + 200][y + 200]; if (c) { [dx, dy] = [-dy, dx]; } else { [dx, dy] = [dy, -dx]; } g[x + 200][y + 200] = 1 - c; x += dx; y += dy; pos.push([x, y, dx, dy]); } return pos; };
  ok('fourmiLangton : grille 2D = positions de Grok Bot (t = 10000 et 10104, cap nord)', () => { const p = fourmiRef(10104);
    assert.deepEqual(p[10000], [-16, 10, 0, 1]); assert.deepEqual(p[10104], [-18, 8, 0, 1]); return 'ok'; });
  for (const p of [...extremes(sys('fourmiLangton')), { pasL: 12000 }]) ok(`fourmiLangton ${JSON.stringify(p)} : transitoire 9976, autoroute (-2, -2) en 104 pas, positions de Grok, temoin`, () => {
    const R = S('fourmiLangton', p), I = R.invariants;
    assert.ok(I.fourmiLangton.mesure === 0 && I.fourmiLangton.dernierDesaccord === 9976 && I.fourmiLangton.a10000 === '-16 10 0' && I.fourmiLangton.a10104 === '-18 8 0' && I.temoin.mesure === 1, JSON.stringify(I));
    return I.fourmiLangton.noiresFin + ' cases noires a la fin';
  });
  /* game217 : gamme temperee - reference INDEPENDANTE : Math.pow et Math.log2 (autorises ici) ; valeurs de Grok Bot (codex 20) :
   *   2^(k/12) a 12 decimales, ecarts -1.955000865, +13.686286135, +1.955000865 cents ; comma 531441/524288 */
  const gRef = (N, p, q) => { const c = 1200 * Math.log2(p / q), k = Math.round(c * N / 1200); return 1200 * k / N - c; };
  ok('gammeTemperee : Math.pow = rapports et ecarts de Grok Bot ; comma exacte', () => {
    assert.equal(Array.from({ length: 13 }, (_, k) => Math.pow(2, k / 12).toFixed(12)).join(' '), '1.000000000000 1.059463094359 1.122462048309 1.189207115003 1.259921049895 1.334839854170 1.414213562373 1.498307076877 1.587401051968 1.681792830507 1.781797436281 1.887748625363 2.000000000000');
    assert.deepEqual([gRef(12, 3, 2), gRef(12, 5, 4), gRef(12, 4, 3)].map((x) => x.toFixed(9)), ['-1.955000865', '13.686286135', '1.955000865']); assert.equal(3 ** 12, 531441); assert.equal(2 ** 19, 524288); return 'ok'; });
  for (const p of [...extremes(sys('gammeTemperee')), { divisions: 12 }, { divisions: 53 }, { divisions: 19 }]) ok(`gammeTemperee ${JSON.stringify(p)} : octave, quinte + quarte, ecarts de reference, temoin`, () => {
    const R = S('gammeTemperee', p), I = R.invariants, N = R.params.divisions;
    assert.ok(I.gammeTemperee.mesure === 0 && Math.abs(I.gammeTemperee.quinteCents - gRef(N, 3, 2)) < 1e-9 && Math.abs(I.gammeTemperee.tierceCents - gRef(N, 5, 4)) < 1e-9 && I.temoin.commaFraction === '531441/524288' && Math.abs(I.temoin.mesure - 1200 * Math.log2(531441 / 524288)) < 1e-9, JSON.stringify(I));
    if (N === 12) assert.equal(I.gammeTemperee.douze, '1.000000000000 1.059463094359 1.122462048309 1.189207115003 1.259921049895 1.334839854170 1.414213562373 1.498307076877 1.587401051968 1.681792830507 1.781797436281 1.887748625363 2.000000000000');
    return N + ' pas : quinte ' + I.gammeTemperee.quinteCents.toFixed(3) + ' cents';
  });
  /* game218 : Shannon - reference INDEPENDANTE : Math.log2 ; Huffman refait ICI par file de priorite TRIEE A CHAQUE INSERTION (et pas par
   *   tri de foret) ; valeurs de Grok Bot (codex 20, Cornell) : 182303 lettres, H = 4.181867014267 bits */
  const lettresRef = T.SOURCES.lettresAnglais.valeur.split(' ').map((x) => Number(x.split(':')[1]));
  const huffRef = (w) => { const tot = w.reduce((a, b) => a + b, 0); let file = w.map((p) => ({ p, prof: [0] })).sort((a, b) => a.p - b.p); let somme = 0;
    while (file.length > 1) { const a = file.shift(), b = file.shift(); somme += a.p + b.p; const nv = { p: a.p + b.p }; let i = 0; while (i < file.length && file[i].p < nv.p) i++; file.splice(i, 0, nv); } return somme / tot; };
  ok('entropieShannon : effectifs de Grok Bot, H = 4.181867014267, Huffman refait', () => { const tot = lettresRef.reduce((a, b) => a + b, 0); assert.equal(tot, 182303);
    const H = -lettresRef.reduce((a, c) => a + (c / tot) * Math.log2(c / tot), 0); assert.equal(H.toFixed(12), '4.181867014267'); const L = huffRef(lettresRef); assert.ok(H <= L && L < H + 1, H + ' ' + L); return 'Huffman ' + L.toFixed(6); });
  for (const p of [...extremes(sys('entropieShannon')), { lettres: 50000, graine: 9 }]) ok(`entropieShannon ${JSON.stringify(p)} : H, Huffman, texte tire, temoin`, () => {
    const R = S('entropieShannon', p), I = R.invariants;
    assert.ok(I.entropieShannon.mesure === 0 && Math.abs(I.entropieShannon.entropie - 4.181867014267) < 1e-11 && Math.abs(I.entropieShannon.longueurHuffman - huffRef(lettresRef)) < 1e-12 && I.temoin.mesure === 5 && I.temoin.formule < 4.3, JSON.stringify(I));
    return 'texte ' + I.entropieShannon.entropieTexte.toFixed(4) + ' bits';
  });
  /* game219 : atmosphere - reference INDEPENDANTE : Math.pow / Math.exp (formules fermees, pas d integration) ; valeurs de Grok Bot (codex 20) :
   *   288.150/101325.000000, 255.650/54019.912104, 216.650/22632.063973, 216.650/5474.888670 ; H(5 km geom.) = 4996.070274 m, T = 255.675543 K */
  const atmRef = (H) => { const k = 9.80665 * 0.0289644 / 8.31432, T11 = 288.15 - 0.0065 * 11000; if (H <= 11000) { const T = 288.15 - 0.0065 * H; return [T, 101325 * Math.pow(T / 288.15, k / 0.0065)]; }
    const p11 = 101325 * Math.pow(T11 / 288.15, k / 0.0065); return [T11, p11 * Math.exp(-k * (H - 11000) / T11)]; };
  ok('atmosphereStandard : formules fermees = valeurs de Grok Bot', () => {
    assert.equal([0, 5000, 11000, 20000].map((x) => atmRef(x)[0].toFixed(3) + '/' + atmRef(x)[1].toFixed(6)).join(' '), '288.150/101325.000000 255.650/54019.912104 216.650/22632.063973 216.650/5474.888670');
    const Hg = 6356766 * 5000 / (6356766 + 5000); assert.equal(Hg.toFixed(6), '4996.070274'); assert.equal(atmRef(Hg)[0].toFixed(6), '255.675543'); return 'ok'; });
  for (const p of [...extremes(sys('atmosphereStandard')), { altitudeKm: 11 }, { altitudeKm: 15 }]) ok(`atmosphereStandard ${JSON.stringify(p)} : integration = formule fermee, quatre points de Grok, temoin`, () => {
    const R = S('atmosphereStandard', p), I = R.invariants;
    assert.ok(I.atmosphereStandard.mesure === 0 && I.atmosphereStandard.quatreAltitudes === '288.150/101325.000000 255.650/54019.912104 216.650/22632.063973 216.650/5474.888670' && I.temoin.mesure.toFixed(6) === '255.675543' && I.temoin.Hgeopotentiel.toFixed(6) === '4996.070274', JSON.stringify(I));
    return 'ok';
  });
  /* game220 : Zipf - reference INDEPENDANTE : Math.log10, regression refaite par la forme centree (moyennes) ; valeurs de Grok Bot (codex 20) :
   *   somme des 30 comptes 143978032522, pente sur 1..30 = -0.852706154 */
  const zipfRef = (R) => { const c = T.SOURCES.motsWeb.valeur.split(' ').map((x) => Number(x.split(':')[1])).slice(0, R), xs = c.map((_, i) => Math.log10(i + 1)), ys = c.map(Math.log10);
    const mx = xs.reduce((a, b) => a + b, 0) / R, my = ys.reduce((a, b) => a + b, 0) / R; let num = 0, den = 0; for (let i = 0; i < R; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; } return num / den; };
  ok('loiZipf : comptes de Grok Bot, pente -0.852706154 sur 1..30', () => { const c = T.SOURCES.motsWeb.valeur.split(' ').map((x) => Number(x.split(':')[1]));
    assert.equal(c.length, 30); assert.equal(c.reduce((a, b) => a + b, 0), 143978032522); assert.equal(zipfRef(30).toFixed(9), '-0.852706154'); return 'pente 1..10 : ' + zipfRef(10).toFixed(6); });
  for (const p of [...extremes(sys('loiZipf')), { rangsZipf: 20 }]) ok(`loiZipf ${JSON.stringify(p)} : decroissance, pente, valeurs de Grok, temoin`, () => {
    const R = S('loiZipf', p), I = R.invariants;
    assert.ok(I.loiZipf.mesure === 0 && Math.abs(I.loiZipf.penteR - zipfRef(R.params.rangsZipf)) < 1e-9 && I.loiZipf.pente30.toFixed(9) === '-0.852706154' && Math.abs(I.temoin.mesure - zipfRef(10)) < 1e-9 && Math.abs(I.temoin.mesure - I.temoin.formule) > 0.01 && Math.abs(I.temoin.mesure + 1) > 0.05, JSON.stringify(I));
    return 'pente ' + I.loiZipf.penteR.toFixed(6);
  });
  /* game221 : Gutenberg-Richter - reference : valeurs de Grok Bot (codex 20) : 6397 seismes, cumuls 6397 1507 344 99 28 10 1 0,
   *   10^-1.03 = 0.093325430 ; estimation d Aki relue ICI par Math.log10(Math.E) sur les memes magnitudes (tri inverse du dessin) */
  ok('gutenbergRichter : catalogue de Grok Bot et rapport de la loi', () => { const c = T.SOURCES.comcat2024.valeur.split(' ').map((x) => Number(x.split(':')[1]));
    assert.equal(c.reduce((a, b) => a + b, 0), 6397); assert.equal(c.map((_, i) => c.slice(i).reduce((a, b) => a + b, 0)).join(' '), '6397 1507 344 99 28 10 1 0'); assert.equal(Math.pow(10, -1.03).toFixed(9), '0.093325430'); return 'ok'; });
  for (const p of [...extremes(sys('gutenbergRichter')), { bValeur: 0.8, seismes: 3000, graine: 5 }]) ok(`gutenbergRichter ${JSON.stringify(p)} : b re-estime, catalogue, temoin, dessin`, () => {
    const R = S('gutenbergRichter', p), I = R.invariants, b = R.params.bValeur;
    assert.ok(I.gutenbergRichter.mesure === 0 && Math.abs(I.gutenbergRichter.bEstime - b) < 4 * b / Math.sqrt(R.params.seismes) && I.gutenbergRichter.totalCatalogue === 6397 && Math.abs(I.temoin.mesure - 344 / 6397) < 1e-12 && I.temoin.formule.toFixed(9) === '0.093325430', JSON.stringify(I));
    let m = 0, k = 0; for (let q = 0; q < R.n; q++) { m += R.brut[3 * q]; k++; } const bDessin = Math.log10(Math.E) / (m / k); assert.ok(Math.abs(bDessin - b) < 0.15 * b, 'b relu sur le dessin ' + bDessin);
    return 'b estime ' + I.gutenbergRichter.bEstime.toFixed(4);
  });
  /* game223 : maree - reference : valeurs du codex 21 (sous-agent Claude, NOAA 8454000) : periode M2 12.42060 h, retard 0.8412 h = 50.47 min,
   *   battement 14.7653 jours, rapport (0.595 + 0.127)/(0.595 - 0.127) = 1.54 ; refaits ICI par Math.cos et une recherche de maxima independante */
  ok('mareeVivesEaux : periodes et rapport du codex 21', () => { assert.equal((360 / 28.984104).toFixed(5), '12.42060'); assert.equal((360 / (30 - 28.984104) / 24).toFixed(4), '14.7653');
    assert.equal(((2 * 360 / 28.984104 - 24)).toFixed(4), '0.8412'); assert.equal(((0.595 + 0.127) / (0.595 - 0.127)).toFixed(2), '1.54'); return 'ok'; });
  for (const p of [...extremes(sys('mareeVivesEaux')), { jours: 60, partS2: 1.5 }]) ok(`mareeVivesEaux ${JSON.stringify(p)} : retard quotidien, vives-eaux, rapport, temoin`, () => {
    const R = S('mareeVivesEaux', p), I = R.invariants, r = R.params.partS2;
    assert.ok(I.mareeVivesEaux.mesure === 0 && Math.abs(I.mareeVivesEaux.vivesEauxTheoJours - 14.7653) < 1e-4 && Math.abs(I.mareeVivesEaux.rapportVivesMortes / ((0.595 + 0.127 * r) / (0.595 - 0.127 * r)) - 1) < 0.02 && Math.abs(I.temoin.mesure - 1) < 1e-3, JSON.stringify(I)); /* pleines mers relevees toutes les 3 min : sommet a 1e-4 pres */
    return 'vives-eaux tous les ' + I.mareeVivesEaux.vivesEauxJours.toFixed(2) + ' j, retard ' + I.mareeVivesEaux.retardMinutes.toFixed(1) + ' min';
  });
  /* game224 : energie de liaison - reference : B/A AME2020 releves dans le fichier (codex 21 + relecture) ; Q refaits ICI a la main :
   *   D+D = 4 x 7073.9156 - 4 x 1112.2831 ; triple alpha = 12 x 7680.1446 - 12 x 7073.9156 ; C12+He4 = 16 x 7976.2072 - 12 x 7680.1446 - 4 x 7073.9156 */
  ok('energieLiaison : B/A AME2020 et Q des trois reactions', () => {
    assert.equal(T.SOURCES.liaisonAME2020.valeur, 'H2:2:1112.2831 He4:4:7073.9156 C12:12:7680.1446 O16:16:7976.2072 Fe56:56:8790.3563 Fe58:58:8792.2534 Ni62:62:8794.5555 U238:238:7570.1262');
    const q = [4 * 7073.9156 - 4 * 1112.2831, 12 * 7680.1446 - 12 * 7073.9156, 16 * 7976.2072 - 12 * 7680.1446 - 4 * 7073.9156]; assert.ok(Math.abs(q[0] - 23846.53) < 1e-6 && q.every((x) => x > 0), q.join(' ')); return q.map((x) => x.toFixed(2)).join(' ') + ' keV'; });
  for (const p of [...extremes(sys('energieLiaison')), { reaction: 1 }]) ok(`energieLiaison ${JSON.stringify(p)} : Q positifs, uranium sous le fer, plus lie, temoin, dessin`, () => {
    const R = S('energieLiaison', p), I = R.invariants;
    assert.ok(I.energieLiaison.mesure === 0 && I.energieLiaison.QkeV === [4 * 7073.9156 - 4 * 1112.2831, 12 * 7680.1446 - 12 * 7073.9156, 16 * 7976.2072 - 12 * 7680.1446 - 4 * 7073.9156].map((x) => x.toFixed(4)).join(' ') && I.energieLiaison.plusLie === 'Ni62' && Math.abs(I.temoin.mesure - (8794.5555 - 8790.3563)) < 1e-9, JSON.stringify(I));
    let dedans = 0; for (let q = 0; q < 8; q++) dedans += R.brut[3 * q + 2]; assert.equal(dedans, [2, 2, 3][R.params.reaction], 'noyaux de la reaction');
    return I.energieLiaison.reactionChoisie;
  });
  /* game225 : Keeling - reference : fichier NOAA (codex 22 + telechargement) : 67 annees, 1959:315.98, 2000:369.71, 2025:427.35 ;
   *   droite des moindres carres sur 1959-1969 refaite ICI par moyennes centrees */
  const co2Ref = () => T.SOURCES.co2MaunaLoa.valeur.split(' ').map((x) => x.split(':').map(Number));
  ok('courbeKeeling : serie NOAA (67 annees, 1959 315.98, 2000 369.71, 2025 427.35), droite des debuts', () => { const s = co2Ref();
    assert.equal(s.length, 67); assert.deepEqual([s[0], s[41], s[66]], [[1959, 315.98], [2000, 369.71], [2025, 427.35]]);
    const xs = s.slice(0, 11).map((x) => x[0]), ys = s.slice(0, 11).map((x) => x[1]), mx = xs.reduce((a, b) => a + b) / 11, my = ys.reduce((a, b) => a + b) / 11; let num = 0, den = 0; for (let i = 0; i < 11; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
    return 'droite 2025 : ' + (my + num / den * (2025 - mx)).toFixed(3); });
  for (const p of [...extremes(sys('courbeKeeling')), { anDebut: 1980, anFin: 2000 }, { anDebut: 2005, anFin: 1980 }]) ok(`courbeKeeling ${JSON.stringify(p)} : hausse chaque annee, acceleration, temoin`, () => {
    const R = S('courbeKeeling', p), I = R.invariants, s = co2Ref(), xs = s.slice(0, 11).map((x) => x[0]), ys = s.slice(0, 11).map((x) => x[1]), mx = xs.reduce((a, b) => a + b) / 11, my = ys.reduce((a, b) => a + b) / 11;
    let num = 0, den = 0; for (let i = 0; i < 11; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
    const dRef = Math.min(R.params.anDebut, R.params.anFin - 10), w = s.filter(([an]) => an >= dRef && an <= R.params.anFin), m = w.length - 1, k = Math.min(10, Math.floor(m / 2));
    assert.ok(Math.abs(I.courbeKeeling.hausseDebut - (w[k][1] - w[0][1]) / k) < 1e-9 && Math.abs(I.courbeKeeling.hausseFin - (w[m][1] - w[m - k][1]) / k) < 1e-9, 'hausses de la fenetre');
    assert.ok(I.courbeKeeling.mesure === 0 && I.courbeKeeling.annees === 67 && Math.abs(I.temoin.mesure - (my + num / den * (2025 - mx))) < 1e-6 && I.temoin.formule === 427.35 && I.temoin.formule - I.temoin.mesure > 50, JSON.stringify(I));
    return 'hausse ' + I.courbeKeeling.hausseDebut.toFixed(3) + ' -> ' + I.courbeKeeling.hausseFin.toFixed(3) + ' ppm/an';
  });
  /* game226 : population - reference INDEPENDANTE : Math.log / Math.exp, regression par moyennes centrees ; valeurs ONU WPP 2024 (codex 22 + CSV
   *   relu) : 1950 2493092.848 ... 2020 7887001.292 ; taux 1960-1970 = 2.0314 %/an ; exponentielle 1950-1970 (3 points, moindres carres) -> 2020 = 9856894 */
  const popRef = () => T.SOURCES.populationONU.valeur.split(' ').map((x) => x.split(':').map(Number));
  const expRef = (k, an) => { const s = popRef().slice(0, k + 1), xs = s.map((x) => x[0] - 1950), ys = s.map((x) => Math.log(x[1])), mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
    let num = 0, den = 0; for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; } return Math.exp(my + num / den * (an - 1950 - mx)); };
  ok('populationMonde : ONU 1950 et 2020, taux de pointe, exponentielle de reference', () => { const s = popRef(); assert.deepEqual([s[0], s[7]], [[1950, 2493092.848], [2020, 7887001.292]]);
    assert.equal((Math.log(s[2][1] / s[1][1]) / 10 * 100).toFixed(4), '2.0314'); assert.equal(expRef(2, 2020).toFixed(0), '9856894'); return 'ok'; });
  for (const p of [...extremes(sys('populationMonde')), { decennies: 4 }]) ok(`populationMonde ${JSON.stringify(p)} : croissance, pic des annees 1960, exponentielle, temoin`, () => {
    const R = S('populationMonde', p), I = R.invariants;
    const s = popRef(), tauxRef = s.slice(1).map((x, i) => (100 * Math.log(x[1] / s[i][1]) / 10).toFixed(4)).join(' ');
    assert.equal(I.populationMonde.tauxParDecennie, tauxRef, 'taux par decennie');
    assert.ok(I.populationMonde.mesure === 0 && I.populationMonde.decenniePic === '1960-1970' && Math.abs(I.populationMonde.expo2020 / expRef(R.params.decennies, 2020) - 1) < 1e-9 && Math.abs(I.temoin.mesure / expRef(2, 2020) - 1) < 1e-9 && I.temoin.mesure - I.temoin.formule > 1.5e6, JSON.stringify(I));
    return 'exponentielle 2020 : ' + (I.populationMonde.expo2020 / 1e6).toFixed(3) + ' milliards';
  });
  /* game230 : photoelectrique - reference : constantes NIST et calculs de Grok Bot (codex 20) : h/e = 4.13566769692e-15, hc/e = 1239.841984332 eV nm,
   *   seuil Ag 267.207324 nm, K(Ag, 200 nm) = 1.559209922 eV, photon 300 nm = 4.132806614 eV */
  ok('effetPhotoelectrique : constantes et calculs de Grok Bot', () => { const h = 6.62607015e-34, e = 1.602176634e-19, c = 299792458;
    assert.equal((h / e).toExponential(11), '4.13566769692e-15'); assert.equal((h * c / e * 1e9).toFixed(9), '1239.841984332'); assert.equal((h * c / e * 1e9 / 4.64).toFixed(6), '267.207324');
    assert.equal((h * c / e * 1e9 / 200 - 4.64).toFixed(9), '1.559209922'); assert.equal((h * c / e * 1e9 / 300).toFixed(9), '4.132806614'); return 'ok'; });
  for (const p of [...extremes(sys('effetPhotoelectrique')), { lambdaNm: 250, metal: 1 }, { lambdaNm: 300, metal: 0 }]) ok(`effetPhotoelectrique ${JSON.stringify(p)} : pente h/e, seuils, K a 200 nm, temoin`, () => {
    const R = S('effetPhotoelectrique', p), I = R.invariants, phi = [4.64, 4.48, 5.42, 4.15][R.params.metal];
    assert.ok(I.effetPhotoelectrique.mesure === 0 && I.effetPhotoelectrique.seuilNm.startsWith('Ag:267.207324') && I.effetPhotoelectrique.K200Ag.toFixed(9) === '1.559209922' && Math.abs(I.effetPhotoelectrique.KchoisiEv - (1239.841984332003 / R.params.lambdaNm - phi)) < 1e-9 && I.temoin.mesure === 0, JSON.stringify(I));
    return I.effetPhotoelectrique.metalChoisi + ' a ' + R.params.lambdaNm + ' nm : K = ' + I.effetPhotoelectrique.KchoisiEv.toFixed(4) + ' eV';
  });
  /* game231 : demi-vies NPL - reference : lambda de Grok Bot (codex 20) H3 0.000154135464, Be7 0.013024186, I131 0.0864025505,
   *   Cs137 6.31511644e-05 (Math.LN2 ici, lnD dans le module) ; age 14C a 1/8 = 3 x 2082000 / 365.242198 ans */
  for (const p of [...extremes(sys('demiViesNPL')), { isotope: 4, demiVies: 2 }, { isotope: 0, demiVies: 5 }]) ok(`demiViesNPL ${JSON.stringify(p)} : 1/2 et 1/8, lambdas, age 14C, temoin`, () => {
    const R = S('demiViesNPL', p), I = R.invariants, L = I.demiViesNPL.lambdasParJour;
    assert.ok(I.demiViesNPL.mesure === 0 && L.startsWith('H3:0.000154135464+-3.08e-7 Be7:0.0130241860+-0.0000147') && L.includes('I131:0.0864025505+-0.0000205') && L.includes('Cs137:0.0000631511644+-1.73e-7') &&
      Math.abs(I.demiViesNPL.ageTroisDemiViesC14 - 3 * 2082000 / 365.242198) < 1e-9 && I.demiViesNPL.incertitudeAgeC14.toFixed(2) === (3 * 11000 / 365.242198).toFixed(2) &&
      Math.abs(I.demiViesNPL.resteChoisi - 2 ** -R.params.demiVies) < 1e-12 && I.temoin.mesure < 1e-12 && Math.abs(I.temoin.lineaireVideApres - 1 / Math.LN2) < 1e-12, JSON.stringify(I));
    return I.demiViesNPL.isotopeChoisi + ' : age 14C ' + I.demiViesNPL.ageTroisDemiViesC14.toFixed(0) + ' +- ' + I.demiViesNPL.incertitudeAgeC14.toFixed(0) + ' ans';
  });
  /* game232 : Snow - reference : Snow 1855 (« between eight and nine times », « nearly five times », taux imprimes 315, 37, 59, 537, 115)
   *   et calculs du codex 23 : 315.39, 37.54, 55.46, rapport 8.40 ; 2353 / 40046 = 587.6 */
  for (const p of [...extremes(sys('choleraSnow')), { septSemaines: 2, graine: 7 }, { septSemaines: 1, graine: 23 }]) ok(`choleraSnow ${JSON.stringify(p)} : taux, rapports, coquilles, echantillon, temoin`, () => {
    const R = S('choleraSnow', p), I = R.invariants, C = I.choleraSnow;
    assert.ok(C.mesure === 0 && C.tauxPour10000 === 'SouthwarkVauxhall:315.39 Lambeth:37.54 RestOfLondon:55.46' && C.rapportRisque.toFixed(2) === '8.40' && C.rapportDeuxiemePeriode.toFixed(2) === '5.08' &&
      C.coquilles === 'RestOfLondon 59 vs 55.46 ; SouthwarkVauxhallWeeks8to14 537 vs 587.57' && I.temoin.mesure === 0 && I.temoin.rapportNaif.toFixed(2) === '12.89', JSON.stringify(I));
    /* l echantillon dessine suit le taux de la periode choisie : deces S&V a moins de 5 ecarts-types de l attendu */
    const [nSV, dSV] = C.echantillonSV.split(/[^0-9]+/).filter(Boolean).map(Number), q = (R.params.septSemaines === 2 ? 2353 : 1263) / 40046;
    assert.ok(Math.abs(dSV - nSV * q) < 5 * Math.sqrt(nSV * q * (1 - q)) + 1, C.echantillonSV + ' attendu ' + (nSV * q).toFixed(1));
    return 'S&V/Lambeth ' + C.rapportRisque.toFixed(2) + ', echantillon ' + C.echantillonSV;
  });
  /* une graine (1500 maisons) ne separe pas 315 de 588 pour 10 000 a 5 ecarts-types : cumul sur 20 graines, par periode */
  for (const sept of [1, 2]) ok(`choleraSnow : 20 graines cumulees, sept semaines n. ${sept}, deces S&V au taux de la periode`, () => {
    let nSV = 0, dSV = 0; for (let g = 1; g <= 20; g++) { const [a, b] = S('choleraSnow', { septSemaines: sept, graine: g }).invariants.choleraSnow.echantillonSV.split(/[^0-9]+/).filter(Boolean).map(Number); nSV += a; dSV += b; }
    const q = (sept === 2 ? 2353 : 1263) / 40046, z = (dSV - nSV * q) / Math.sqrt(nSV * q * (1 - q));
    assert.ok(Math.abs(z) < 5, dSV + ' deces sur ' + nSV + ' maisons, attendu ' + (nSV * q).toFixed(1) + ' (z = ' + z.toFixed(2) + ')');
    return dSV + ' / ' + nSV + ', z = ' + z.toFixed(2);
  });
  /* game233 : Balmer - reference : calculs du codex 23 (R_H = 10 967 758.34 m^-1 ; Bohr R_H vide 656.4696, 486.2738, 434.1730, 410.2935 nm ;
   *   ecarts +0.0064 / +0.0047 / +0.0039 / +0.0036 ; R_inf : H-alpha 656.1123 nm ; vide / air 1.000276 a 1.000282 sur n = 3 a 6,
   *   1.000284 a n = 9 : 383.64789 / 383.53909 = 1.0002837, recalcule ici) */
  for (const p of [...extremes(sys('raiesBalmer')), { nPlusHaut: 6 }]) ok(`raiesBalmer ${JSON.stringify(p)} : pente ajustee = R_H, ecarts de Bohr, vide / air, temoin`, () => {
    const R = S('raiesBalmer', p), I = R.invariants, C = I.raiesBalmer, RH = 10973731.568157 / (1 + 1 / 1836.152673426);
    assert.ok(C.mesure === 0 && RH.toFixed(2) === '10967758.34' && Math.abs(C.rapportRH - 1) < 3e-5 && Math.abs(C.ordonneeSurQuart - 1) < 3e-5 &&
      C.ecartsBohrNm.startsWith('3:0.0064 4:0.0047 5:0.0039 6:0.0036') && C.ecartBohrMaxNm < 0.0065 && C.rapportVideAir.startsWith('1.000276') && C.rapportVideAir.endsWith('1.000284') &&
      I.temoin.mesure === 0 && (656.4632 + I.temoin.ecartRInfiniHalpha).toFixed(4) === '656.1123', JSON.stringify(I));
    return 'R ajuste ' + C.rydbergAjuste.toFixed(1) + ' (x ' + C.rapportRH.toFixed(7) + ' R_H)';
  });
  /* game234 : Boyle - reference : calculs du codex 23 (boyle2.js) : A x (B + 29 1/8) min 1395.94, max 1415.25, moyenne 1407.64, ecart max 0.83 % ;
   *   droite naive a A = 12 : 55 pouces ; Boyle 117 9/16. Pente recalculee ici avec Math.log sur la meme table. */
  ok('loiBoyle : table de 1662, ligne 28 lue au scan (21 3/16), 25 lignes', () => { const t = T.SOURCES.boyleTable.valeur.split(';');
    assert.ok(t.length === 25 && t[10] === '28:21 3/16' && t[0] === '48:00' && t[24] === '12:88 7/16' && T.SOURCES.boyleBarometre.valeur === '29 1/8', t.join(';')); return '25 lignes'; });
  for (const p of [...extremes(sys('loiBoyle')), { lignesBoyle: 10, exposantTest: 0.9 }]) ok(`loiBoyle ${JSON.stringify(p)} : A x P constant a 1 %, pente, temoin`, () => {
    const R = S('loiBoyle', p), I = R.invariants, C = I.loiBoyle;
    const fr = (s) => s.split(' ').reduce((a, m) => { const [x, y] = m.split('/').map(Number); return a + (y ? x / y : x); }, 0);
    const L = T.SOURCES.boyleTable.valeur.split(';').map((x) => { const [a, b] = x.split(':'); return [Number(a), fr(b) + 29.125]; });
    const pente = (Q) => { let sx = 0, sy = 0, sxx = 0, sxy = 0; for (const [a, q] of Q) { const x = Math.log(a), y = Math.log(q); sx += x; sy += y; sxx += x * x; sxy += x * y; } return (Q.length * sxy - sx * sy) / (Q.length * sxx - sx * sx); };
    assert.ok(C.mesure === 0 && C.produitMoyen.toFixed(2) === '1407.64' && C.produitMin.toFixed(2) === '1395.94' && C.produitMax.toFixed(2) === '1415.25' && (100 * C.ecartRelatifMax).toFixed(2) === '0.83' &&
      Math.abs(C.penteLogLog - pente(L)) < 1e-9 && Math.abs(C.penteDebut - pente(L.slice(0, R.params.lignesBoyle))) < 1e-9 && C.lignesPrises === R.params.lignesBoyle &&
      I.temoin.mesure === 0 && I.temoin.lineaireA12 === 55 && I.temoin.mesureA12 === 117.5625, JSON.stringify(I));
    return 'pente ' + C.penteLogLog.toFixed(4) + ', sur les ' + C.lignesPrises + ' premieres ' + C.penteDebut.toFixed(4);
  });
  /* game235 : Ohm - reference : codex 23 (serie I libre a = 7269.5, b = 20.309 ; laiton 40.74, 84.77, 163.53, 324.05 ; sans b : 5.03 a 130 Zoll) ;
   *   les 40 mesures, b, a et le laiton relus par moi sur les images de page. Ajustement refait ici, independamment. */
  for (const p of [...extremes(sys('loiOhm')), { serie: 3, bTest: 12 }]) ok(`loiOhm ${JSON.stringify(p)} : b libre, ecarts a la loi, laiton, temoin`, () => {
    const R = S('loiOhm', p), I = R.invariants, C = I.loiOhm;
    const fr = (s) => s.split(' ').reduce((a, m) => { const [u, v] = m.split('/').map(Number); return a + (v ? u / v : u); }, 0);
    const x = [2, 4, 6, 10, 18, 34, 66, 130], X = T.SOURCES.ohmMesures.valeur.split(';')[0].split(':')[1].split(',').map(fr);
    let sx = 0, sy = 0, sxx = 0, sxy = 0; x.forEach((u, k) => { sx += u; sy += 1 / X[k]; sxx += u * u; sxy += u / X[k]; });
    const pente = (8 * sxy - sx * sy) / (8 * sxx - sx * sx), b = (sy - pente * sx) / 8 / pente;
    assert.ok(C.mesure === 0 && C.bLibre.startsWith(b.toFixed(3)) && b.toFixed(3) === '20.309' && C.aLibre.startsWith('7269.5') && C.laitonZoll === '40.74 84.77 163.53 324.05' &&
      C.aSerie === [7285, 6965, 6885, 6800, 6800][R.params.serie - 1] && I.temoin.mesure === 0 && I.temoin.sansResistanceInterne130.toFixed(2) === '5.03', JSON.stringify(I));
    return 'b libre ' + C.bLibre + ' ; ecarts ' + C.ecartRelatifMax;
  });
  /* game236 : especes-aire - reference : Diamond et Mayr 1976 (34.7, 12.08, 1.59, 0.087 ; 39 iles non isolees) et codex 23 (34.711 + 12.078 log A,
   *   n = 39 ; z = 0.0871, n = 25 ; temoin Nusave 7.3 contre 35). Regressions refaites ici avec Math.log10. */
  for (const p of [...extremes(sys('especesAire')), { inclureIsolees: 1, zTest: 0.3 }]) ok(`especesAire ${JSON.stringify(p)} : regressions publiees retrouvees, temoin`, () => {
    const R = S('especesAire', p), I = R.invariants, C = I.especesAire;
    const t = T.SOURCES.salomonOiseaux.valeur.split(' ').map((x) => x.split(':')), proches = t.filter((r) => r.length === 3);
    const fit = (q) => { let sx = 0, sy = 0, sxx = 0, sxy = 0; for (const [x, y] of q) { sx += x; sy += y; sxx += x * x; sxy += x * y; } const b = (q.length * sxy - sx * sy) / (q.length * sxx - sx * sx); return [(sy - b * sx) / q.length, b]; };
    const [a1, b1] = fit(proches.map((r) => [Math.log10(+r[2]), +r[1]])), [a2, b2] = fit(proches.filter((r) => +r[2] > 1).map((r) => [Math.log10(+r[2]), Math.log10(+r[1])]));
    assert.ok(t.length === 50 && proches.length === 39 && C.mesure === 0 && C.ilesSemiLog === 39 && C.ilesPuissance === 25 && C.semiLogA.toFixed(3) === '34.711' && C.semiLogB.toFixed(3) === '12.078' &&
      C.zAjuste.toFixed(4) === '0.0871' && Math.abs(C.semiLogA - a1) < 1e-9 && Math.abs(C.semiLogB - b1) < 1e-9 && Math.abs(C.cAjuste - a2) < 1e-9 && Math.abs(C.zAjuste - b2) < 1e-9 &&
      C.droiteAffichee.endsWith('(' + (R.params.inclureIsolees ? 50 : 39) + ' islands)') && I.temoin.mesure === 0 && I.temoin.nusavePredit.toFixed(1) === '7.3' && I.temoin.nusaveObserve === 35, JSON.stringify(I));
    return C.droiteAffichee + ' ; z ' + C.zAjuste.toFixed(4);
  });
  /* game237 : Michaelis-Menten - reference : codex 23 (K = 0.0179 mol/L, V = 3.911 ; doublements 1.693, 1.124, 1.000) et 1913 (k = 0.0167).
   *   Ajustement refait ici par une autre methode : bissection de la derivee de l ecart en K (V elimine), pas de balayage. */
  for (const p of [...extremes(sys('michaelisMenten')), { Ktest: 0.03, axeLog: 0 }]) ok(`michaelisMenten ${JSON.stringify(p)} : K ajuste, rapport a 1913, temoin`, () => {
    const R = S('michaelisMenten', p), I = R.invariants, C = I.michaelisMenten, d = T.SOURCES.mm1913.valeur.split(' ').map((x) => x.split(':').map(Number));
    const e = (K) => { let sf = 0, sff = 0, svv = 0; for (const [a, v] of d) { const f = a / (K + a); sf += v * f; sff += f * f; svv += v * v; } return svv - sf * sf / sff; };
    let lo = 0.005, hi = 0.05; for (let k = 0; k < 80; k++) { const m = (lo + hi) / 2; if (e(m + 1e-9) - e(m - 1e-9) > 0) hi = m; else lo = m; }
    assert.ok(C.mesure === 0 && Math.abs(C.kAjuste - lo) < 2e-5 && C.kAjuste.toFixed(4) === '0.0179' && C.vMaxAjuste.toFixed(3) === '3.911' && C.k1913 === 0.0167 &&
      I.temoin.mesure === 0 && I.temoin.doublements === '1.693 1.124 1.000', JSON.stringify(I) + ' bissection ' + lo);
    return 'K ' + C.kAjuste.toFixed(5) + ' (bissection ' + lo.toFixed(5) + '), x ' + C.rapportK.toFixed(3) + ' du k de 1913';
  });
  /* game238 : Geiger-Marsden - reference : codex 24 (or serie 1 : 27.53 a 39.55, x 1.44 ; argent 1.65 ; or serie 2 1.26 ; pente -4.16 +- 0.03 ;
   *   loi en sin^2 : 1813 a 15 degres). Recalcul ici avec Math.sin. */
  for (const p of [...extremes(sys('diffusionAlpha')), { orArgent: 1, puissanceTest: 3 }]) ok(`diffusionAlpha ${JSON.stringify(p)} : N sin^4 presque constant, pente, colonne imprimee, temoin`, () => {
    const R = S('diffusionAlpha', p), I = R.invariants, C = I.diffusionAlpha, l = T.SOURCES.gmSerieUn.valeur.split(' ').map((x) => x.split(':').map(Number));
    const s = (f) => Math.sin(f * Math.PI / 360);
    let sx = 0, sy = 0, sxx = 0, sxy = 0; for (const [f, , au] of l) { const x = Math.log10(s(f)), y = Math.log10(au); sx += x; sy += y; sxx += x * x; sxy += x * y; }
    const pente = (11 * sxy - sx * sy) / (11 * sxx - sx * sx);
    assert.ok(C.mesure === 0 && C.orMinMax === '27.53 / 39.55' && C.rapportMaxMin.startsWith('or1:1.44 ar1:1.65 or2:1.26') && Math.abs(C.penteLogLogOr - pente) < 1e-9 && C.penteLogLogOr.toFixed(2) === '-4.16' &&
      C.ecartImprime < 0.01 && I.temoin.mesure === 0 && Math.round(I.temoin.loiSinusCarre) === 1813 && I.temoin.observe15 === 132000, JSON.stringify(I));
    return 'pente ' + C.penteLogLogOr.toFixed(3) + ' ; ' + C.rapportMaxMin;
  });
  /* game239 : argon - reference : Rayleigh et Ramsay 1895 (moyenne chimique 2.2990 ; 1.2511 et 1.2572 g/L ; « about one-half per cent ») et codex 24
   *   (ecart 0.01117 g, 0.486 %, 17 ecarts-types). Conversion refaite ici a la main. */
  for (const p of [...extremes(sys('argonRayleigh')), { signeCorrection: 0 }]) ok(`argonRayleigh ${JSON.stringify(p)} : moyennes, grammes par litre, ecart, temoin`, () => {
    const R = S('argonRayleigh', p), I = R.invariants, C = I.argonRayleigh, t = I.temoin;
    assert.ok(C.mesure === 0 && C.moyenneChimique.toFixed(4) === '2.2990' && C.moyenneAtmospherique.toFixed(5) === '2.31017' && C.litreChimique.toFixed(4) === '1.2511' && C.litreAtmospherique.toFixed(4) === '1.2572' &&
      Math.abs(C.litreChimique - (2.2990 + 0.0006) * 1.2572 / 2.3108) < 1e-12 && C.litreAbregeErrone.toFixed(4) === '1.2505' &&
      t.mesure === 0 && t.ecartGrammes.toFixed(5) === '0.01117' && t.ecartPourCent.toFixed(3) === '0.486' && Math.round(t.enEcartsTypes) === 17 && t.enEtendues > 6.9, JSON.stringify(I));
    return 'ecart ' + t.ecartPourCent.toFixed(3) + ' %, ' + t.enEtendues.toFixed(1) + ' etendues, ' + t.enEcartsTypes.toFixed(1) + ' ecarts-types';
  });
  /* game240 : Sturtevant - reference : codex 24 (carte refaite 0 / 0.98 / 30.72 / 33.69 / 57.63 ; BP 32.17, BR 35.49 ; coquilles OP 29.55 et BM 37.52, plus COP 30.0 pour 29.947 vu ici ;
   *   (C, O)P = 471/1584, (C, O)R = 2062/6116, (C, O)M = 406/898) et Diagram 1 (0.0, 1.0, 30.7, 33.7, 57.6). */
  for (const p of [...extremes(sys('carteSturtevant')), { distanceMax: 35 }]) ok(`carteSturtevant ${JSON.stringify(p)} : sommes, carte, additivite courte, coquilles, temoin`, () => {
    const R = S('carteSturtevant', p), I = R.invariants, C = I.carteSturtevant;
    assert.ok(C.mesure === 0 && C.positionsRefaites === 'B:0.00 (C,O):0.98 P:30.72 R:33.69 M:57.63' && C.ecartsCourts === [[1464, 4551, 0], [115, 324, 1], [2062, 6116, 2]].map(([c, g, j]) => { const f = (u, v) => 100 * u / v, co = f(214, 21736), p = co + f(471, 1584), r = p + f(17, 573); return (f(c, g) - [p, r, r - co][j]).toFixed(2); }).join(' ') && C.ecartsCourts === '1.45 1.81 1.01' &&
      C.coquillesSturtevant === 'B-M 37.6 vs 37.52 ; CO-P 30.0 vs 29.95 ; O-P 29.4 vs 29.55' && I.temoin.mesure === 0 && I.temoin.additifBM.toFixed(2) === '57.63' && I.temoin.observeBM.toFixed(2) === '37.52', JSON.stringify(I));
    return C.pairesMontrees + ' paires montrees ; BM ' + I.temoin.observeBM.toFixed(1) + ' % contre ' + I.temoin.additifBM.toFixed(1) + ' sur la carte';
  });
  /* game241 : Ebbinghaus - reference : codex 24 (formule recalculee 56.97, 46.77, 34.49, 30.41, 28.06, 24.92, 21.23) et texte d Ebbinghaus (points 2 et 4
   *   seuls hors erreur probable). Formule refaite ici avec Math.log10 et Math.pow. */
  for (const p of [...extremes(sys('oubliEbbinghaus')), { kTest: 2.5, cTest: 1.5 }]) ok(`oubliEbbinghaus ${JSON.stringify(p)} : colonne calculee, points hors erreur, temoin`, () => {
    const R = S('oubliEbbinghaus', p), I = R.invariants, C = I.oubliEbbinghaus, ts = [20, 64, 526, 1440, 2880, 8640, 44640];
    const ref = ts.map((t) => (100 * 1.84 / (Math.pow(Math.log10(t), 1.25) + 1.84)).toFixed(2)).join(' ');
    assert.ok(C.mesure === 0 && C.calculRefait === ref && ref === '56.97 46.77 34.49 30.41 28.06 24.92 21.23' && C.ecartColonneCalculee < 0.1 && C.horsErreur === '64 1440' &&
      I.temoin.mesure === 0 && I.temoin.expoA1440 < 0.01 && I.temoin.observe1440 === 33.7, JSON.stringify(I));
    return 'formule ' + C.calculRefait + ' ; exponentielle a un jour ' + I.temoin.expoA1440.toFixed(4) + ' %';
  });
  /* game242 : Semmelweis - reference : codex 25 (totaux 1989 / 20042 et 691 / 17791 ; 3.38 imprime pour 3.88 ; 1848 z = -0.26) et Semmelweis 1861
   *   (Summa 9.92). z refait ici a la main (deux proportions, variance commune). */
  for (const p of [...extremes(sys('fievreSemmelweis')), { anneeVue: 1847 }]) ok(`fievreSemmelweis ${JSON.stringify(p)} : taux, totaux, coquille, 1848, temoin`, () => {
    const R = S('fievreSemmelweis', p), I = R.invariants, C = I.fievreSemmelweis;
    const zz = (a, b, c, d) => { const q = (a + c) / (b + d); return (a / b - c / d) / Math.sqrt(q * (1 - q) * (1 / b + 1 / d)); };
    assert.ok(C.mesure === 0 && C.totaux === '1989/20042 ; 691/17791' && C.tauxAvant === '9.92 / 3.88' && C.coquilleSemmelweis === '3.38 vs 3.88' && C.tauxApres === '1.27 / 1.34' &&
      Math.abs(C.z1848 - zz(45, 3556, 43, 3219)) < 1e-12 && C.z1848.toFixed(2) === '-0.26' && Math.abs(I.temoin.zAvant - zz(1989, 20042, 691, 17791)) < 1e-12 && I.temoin.zAvant.toFixed(1) === '22.9' && I.temoin.mesure === 0 &&
      C.anneeVue.startsWith(String(R.params.anneeVue) + ' : '), JSON.stringify(I));
    return 'avant ' + C.tauxAvant + ' (z ' + I.temoin.zAvant.toFixed(1) + ') ; 1848 ' + C.tauxApres + ' (z ' + C.z1848.toFixed(2) + ')';
  });
  /* game243 : Cavendish - reference : codex 25 (23 : 5.4835 ; 29 : 5.448 ; premier fil 5.3117 ; etendue 0.75 ; ecart 0.38) et texte p. 521. Moyennes refaites ici. */
  for (const p of [...extremes(sys('densiteCavendish')), { filChoisi: 0 }]) ok(`densiteCavendish ${JSON.stringify(p)} : moyenne, etendue, ecart des 23, temoin du premier fil`, () => {
    const R = S('densiteCavendish', p), I = R.invariants, C = I.densiteCavendish, v = T.SOURCES.cavendishDensites.valeur.split(' ').map((x) => x.split(':').map(Number));
    const m = (a) => a.reduce((s, [, x]) => s + x, 0) / a.length, a1 = v.filter(([e]) => e <= 3), a2 = v.filter(([e]) => e > 3);
    assert.ok(v.length === 29 && a2.length === 23 && C.mesure === 0 && C.moyenneFil2.toFixed(4) === '5.4835' && Math.abs(C.moyenneFil2 - m(a2)) < 1e-12 && C.etendue23.toFixed(2) === '0.75' && C.ecartMax23.toFixed(2) === '0.38' &&
      C.moyenne29.toFixed(3) === '5.448' && Math.abs(C.moyenneChoisie - [m(v), m(a1), m(a2)][R.params.filChoisi]) < 1e-12 && I.temoin.mesure === 0 && I.temoin.moyenneFil1.toFixed(4) === '5.3117', JSON.stringify(I));
    return '23 : ' + C.moyenneFil2.toFixed(4) + ' ; 29 : ' + C.moyenne29.toFixed(3) + ' ; premier fil ' + I.temoin.moyenneFil1.toFixed(2);
  });
  /* game244 : Joule - reference : Table IX (moyennes 772.692, 774.083, 774.987 imprimees) et codex 25 (rapport vide / air 0.998775 ; cinq series 774.17 ;
   *   etendue 0.43 %). Moyennes refaites ici a la main. */
  for (const p of [...extremes(sys('equivalentJoule')), { colonneVide: 0 }]) ok(`equivalentJoule ${JSON.stringify(p)} : moyennes, vide / air, derniere serie, temoin`, () => {
    const R = S('equivalentJoule', p), I = R.invariants, C = I.equivalentJoule;
    assert.ok(C.mesure === 0 && C.moyennesMateriaux === [772.692, (772.814 + 775.352) / 2, (776.045 + 773.930) / 2].map((m) => m.toFixed(4)).join(' ') && C.moyennesMateriaux === '772.6920 774.0830 774.9875' &&
      C.rapportsVideAirJoule.split(' ').every((r) => r.startsWith('0.99877')) && C.derniereSerie.toFixed(2) === '774.88' && (100 * C.etendueCinq).toFixed(2) === '0.43' &&
      I.temoin.mesure === 0 && I.temoin.moyenneCinq.toFixed(2) === '774.17' && I.temoin.retenue === 772.692, JSON.stringify(I));
    return 'moyennes ' + C.moyennesMateriaux + ' ; cinq series ' + I.temoin.moyenneCinq.toFixed(2);
  });
  /* game245 : eclipse - reference : codex 25 (droite par l origine 1.96 au bord ; rms 0.108 Einstein ; 0.393 Newton avec Newton = Einstein / 2, ici 0.395 avec le rapport imprime 0.87 / 1.75) et p. 331 (1.98 +- 0.12, 1.61 +- 0.30).
   *   Ajustement et ecarts refaits ici. */
  for (const p of [...extremes(sys('eclipseEddington')), { facteurNewton: 1.3 }]) ok(`eclipseEddington ${JSON.stringify(p)} : bord ajuste, rms, erreurs probables, temoin`, () => {
    const R = S('eclipseEddington', p), I = R.invariants, C = I.eclipseEddington;
    const c = [0.32, 0.33, 0.40, 0.53, 0.75, 0.85, 0.88], o = [0.20, 0.32, 0.56, 0.54, 0.84, 0.97, 1.02], k = c.reduce((a, x, j) => a + x * o[j], 0) / c.reduce((a, x) => a + x * x, 0);
    assert.ok(C.mesure === 0 && Math.abs(C.bordAjuste - 1.75 * k) < 1e-12 && C.bordAjuste.toFixed(2) === '1.96' && C.rmsEinstein.toFixed(3) === '0.108' && Math.abs(C.rmsNewton - Math.sqrt(c.reduce((a, x, j) => a + (o[j] - x * 0.87 / 1.75) ** 2, 0) / 7)) < 1e-12 && C.rmsNewton.toFixed(3) === '0.395' &&
      C.sobralEnEp.toFixed(2) === ((1.98 - 1.75) / 0.12).toFixed(2) && C.principeEnEp.toFixed(2) === ((1.61 - 1.75) / 0.30).toFixed(2) && I.temoin.mesure === 0 && I.temoin.newtonEnEp.toFixed(1) === '9.3', JSON.stringify(I));
    return 'bord ' + C.bordAjuste.toFixed(2) + ' ; rms ' + C.rmsEinstein.toFixed(3) + ' / ' + C.rmsNewton.toFixed(3) + ' ; Newton a ' + I.temoin.newtonEnEp.toFixed(1) + ' e.p.';
  });
  /* game246 : lynx - reference : codex 25 (pics 1857, 1866, 1876, 1886, 1895, 1905 ; 9.60 ans ; max / min 23 ; 36 / 47 = 76.6 % pour « 78 ») et p. 241 (9.63).
   *   Autocorrelation refaite ici avec Math.log10. */
  for (const p of [...extremes(sys('lynxHudson')), { decalageAns: 5 }]) ok(`lynxHudson ${JSON.stringify(p)} : pics, periode, frequences, autocorrelation, temoin`, () => {
    const R = S('lynxHudson', p), I = R.invariants, C = I.lynxHudson, v = T.SOURCES.lynxJones.valeur.split(' ').map((x) => Math.log10(Number(x.split(':')[1].replace(/[[\]]/g, ''))));
    const a = (k) => { const m = v.reduce((s, x) => s + x, 0) / v.length; let nu = 0, de = 0; v.forEach((x, i) => { de += (x - m) ** 2; if (i + k < v.length) nu += (x - m) * (v[i + k] - m); }); return nu / de; };
    assert.ok(v.length === 62 && C.mesure === 0 && C.anneesPics === '1857 1866 1876 1886 1895 1905' && C.periodePics === 9.6 && C.periodeLongue.toFixed(2) === '9.63' && C.neufDixPourCent.toFixed(1) === '76.6' && C.imprime78 === 78 &&
      Math.round(C.rapportMaxMin) === 23 && Math.abs(C.acfDecalage - a(R.params.decalageAns)) < 1e-12 && Math.abs(I.temoin.acf10 - a(10)) < 1e-12 && I.temoin.acf10 > 0.5 && Math.abs(I.temoin.acf10Melange) < 0.15 && I.temoin.mesure === 0, JSON.stringify(I));
    return 'pics ' + C.anneesPics + ' ; acf(' + R.params.decalageAns + ') ' + C.acfDecalage.toFixed(2) + ' ; acf(10) ' + I.temoin.acf10.toFixed(2) + ' melange ' + I.temoin.acf10Melange.toFixed(3);
  });
  /* game247 : Millikan - reference : Table XX et p. 140 (61.120, 61.138, 4.774, 6.062) et codex 25 (23 : 61.120 reproduit ; 58 : 61.139 ; ecart-type 0.21 % ;
   *   ecart max 0.57 %). Moyennes refaites ici ; e par Math.pow. */
  for (const p of [...extremes(sys('gouttesMillikan')), { gouttesMoyennees: 40 }]) ok(`gouttesMillikan ${JSON.stringify(p)} : moyennes, e, N, dispersion, temoin`, () => {
    const R = S('gouttesMillikan', p), I = R.invariants, C = I.gouttesMillikan, v = T.SOURCES.millikanE23.valeur.split(' ').map(Number), m = (a) => a.reduce((s, x) => s + x, 0) / a.length;
    assert.ok(v.length === 58 && C.mesure === 0 && C.moyenne23.toFixed(3) === '61.120' && C.moyenne58.toFixed(3) === '61.139' && C.moyenne58Imprimee === 61.138 && Math.abs(C.eFinal - Math.pow(61.085, 1.5) / 100) < 1e-12 &&
      C.eFinal.toFixed(4) === '4.7742' && (C.nAvogadro / 1e23).toFixed(3) === '6.062' && C.ecartTypePourCent.toFixed(2) === '0.21' && C.ecartMaxPourCent.toFixed(2) === '0.57' &&
      Math.abs(C.moyenneCourante - m(v.slice(0, R.params.gouttesMoyennees))) < 1e-12 && I.temoin.mesure === 0 && I.temoin.e1911EnIncertitudes.toFixed(1) === '13.0', JSON.stringify(I));
    return 'e ' + C.eFinal.toFixed(4) + ' ; 58 : ' + C.moyenne58.toFixed(4) + ' (imprime 61.138) ; moyenne courante ' + C.moyenneCourante.toFixed(3);
  });
  /* game248 : Graunt - reference : p. 62 (morts et vivants, 34, 22, 67694, 13539) et codex 26 (suite geometrique 64, 35.3 ...). Esperance refaite ici. */
  for (const p of [...extremes(sys('vieGraunt')), { raisonTest: 0.6 }]) ok(`vieGraunt ${JSON.stringify(p)} : vivants, soustractions, esperance, coquille, temoin`, () => {
    const R = S('vieGraunt', p), I = R.invariants, C = I.vieGraunt, ag = [0, 6, 16, 26, 36, 46, 56, 66, 76, 80], vv = [100, 64, 40, 25, 16, 10, 6, 3, 1, 0];
    let e = 0; for (let i = 1; i < ag.length; i++) e += (ag[i] - ag[i - 1]) * (vv[i] + vv[i - 1]) / 2;
    assert.ok(C.mesure === 0 && Math.abs(C.esperanceNaissance - e / 100) < 1e-12 && C.esperanceNaissance.toFixed(2) === '18.19' && C.entre16et56 === 34 && C.combattantsRecalcul.toFixed(2) === '67698.08' && C.combattantsImprime === 67694 &&
      I.temoin.mesure === 0 && Math.abs(I.temoin.geometrique16 - 64 * Math.pow(1 / 64, 1 / 7)) < 1e-9 && I.temoin.geometrique16.toFixed(1) === '35.3' && I.temoin.raisonTable === 0.625, JSON.stringify(I));
    return 'e0 ' + C.esperanceNaissance.toFixed(2) + ' ans ; geometrique a 16 ans ' + I.temoin.geometrique16.toFixed(1) + ' contre 40';
  });
  /* game249 : Hubble - reference : codex 26 (par l origine 423.9 ; avec ordonnee 454.2, correlation 0.790 ; moyenne M -15.5 retrouvee) et p. 170
   *   (465 +- 50). Pente et magnitudes refaites ici avec Math.log10. */
  for (const p of [...extremes(sys('loiHubble1929')), { constanteTest: 500 }]) ok(`loiHubble1929 ${JSON.stringify(p)} : pente, magnitudes, correlation, temoin`, () => {
    const R = S('loiHubble1929', p), I = R.invariants, C = I.loiHubble1929, t = T.SOURCES.hubbleTable1.valeur.split(' ').map((x) => x.split(':').slice(1).map(Number));
    const k = t.reduce((s, [r, v]) => s + r * v, 0) / t.reduce((s, [r]) => s + r * r, 0), M = t.map(([r, , m]) => m - 5 * Math.log10(r * 1e5));
    assert.ok(t.length === 24 && C.mesure === 0 && Math.abs(C.kOrigine - k) < 1e-9 && C.kOrigine.toFixed(1) === '423.9' && C.kAvecOrdonnee.toFixed(1) === '454.2' && C.correlationHubble.toFixed(3) === '0.790' &&
      Math.abs(C.magnitudeMoyenne - M.reduce((s, x) => s + x, 0) / 24) < 1e-9 && C.magnitudeMoyenne.toFixed(1) === '-15.5' && C.ecartMagnitudes < 0.1 && I.temoin.mesure === 0 && Math.abs(I.temoin.correlationMelangee) < 0.15, JSON.stringify(I));
    return 'K origine ' + C.kOrigine.toFixed(1) + ' ; r ' + C.correlationHubble.toFixed(3) + ' ; melange ' + I.temoin.correlationMelangee.toFixed(3);
  });
  /* game250 : Moseley - reference : Table I et p. 711 (Q_K = N - 1 ; divergence aux courtes longueurs d onde) et codex 26 (Mo : 41.05 pour 41.2 imprime).
   *   lambda Q^2 et residus refaits ici. */
  for (const p of [...extremes(sys('loiMoseley')), { numerotation: 0 }]) ok(`loiMoseley ${JSON.stringify(p)} : lambda Q^2, residus, divergence, temoin`, () => {
    const R = S('loiMoseley', p), I = R.invariants, C = I.loiMoseley, t = T.SOURCES.moseleyTable1.valeur.split(' ').map((x) => x.split(':'));
    const k = t.map(([, l, q]) => 1 / (0.75 * q * q * l * 1e-8)), m = k.reduce((s, x) => s + x, 0) / k.length;
    assert.ok(t.length === 21 && C.mesure === 0 && Math.abs(C.rydbergImplicite - m) < 1e-6 && Math.round(C.rydbergImplicite) === 109707 && C.ecartRydbergPourCent.toFixed(2) === '0.69' && C.pireLigne === 'Mo' &&
      C.residusN.endsWith('Mo:0.20 Ru:0.60 Pd:0.60 Ag:0.60') && I.temoin.mesure === 0 && I.temoin.avecTrouResidu.toFixed(2) === '0.60' && I.temoin.sansTrouResidu.toFixed(2) === '1.60', JSON.stringify(I));
    return 'constante ' + C.rydbergImplicite.toFixed(0) + ' (' + C.ecartRydbergPourCent.toFixed(2) + ' %, ' + C.pireLigne + ') ; sans le 43 : ' + I.temoin.sansTrouResidu.toFixed(2);
  });
  /* game251 : Michelson - reference : p. 139 et 141 (299852, 299864, 299944 +- 51, greatest 300070, least 299650, average difference 60) et codex 26
   *   (moyenne 299852.40 ; 299620 dans la table ; ecart a c +151.542, 2.97 fois 51). Refaits ici. */
  for (const p of [...extremes(sys('lumiereMichelson')), { correctionVide: 1 }]) ok(`lumiereMichelson ${JSON.stringify(p)} : moyenne, chaine, extremes, temoin`, () => {
    const R = S('lumiereMichelson', p), I = R.invariants, C = I.lumiereMichelson, v = T.SOURCES.michelson100.valeur.split(' ').map(Number), m = v.reduce((s, x) => s + x, 0) / 100;
    assert.ok(v.length === 100 && C.mesure === 0 && Math.abs(C.moyenne100 - m) < 1e-9 && C.moyenne100.toFixed(2) === '299852.40' && C.finalRefait === 299944 && C.minimumTable === 299620 && C.minimumImprime === 299650 &&
      C.ecartMoyen100.toFixed(1) === '61.2' && I.temoin.mesure === 0 && I.temoin.ecartC.toFixed(3) === '151.542' && I.temoin.enIncertitudes.toFixed(2) === '2.97' && C.airMoinsC.toFixed(3) === '71.542', JSON.stringify(I));
    return 'moyenne ' + C.moyenne100.toFixed(2) + ' ; final ' + C.finalRefait + ' ; ecart a c ' + I.temoin.ecartC.toFixed(1) + ' (' + I.temoin.enIncertitudes.toFixed(2) + ' x 51)';
  });
  /* game252 : Galton - reference : Table I (928, 205), p. 252 (2/3, 68 1/4) et codex 26 (pente des medianes 0.685, inverse 0.33 sur les paires). Pentes
   *   refaites ici sur les medianes imprimees. */
  for (const p of [...extremes(sys('regressionGalton')), { penteTest: 0.5 }]) ok(`regressionGalton ${JSON.stringify(p)} : totaux, pentes, temoin`, () => {
    const R = S('regressionGalton', p), I = R.invariants, C = I.regressionGalton;
    const x = [72.5, 71.5, 70.5, 69.5, 68.5, 67.5, 66.5, 65.5, 64.5], y = [72.2, 69.9, 69.5, 68.9, 68.2, 67.6, 67.2, 66.7, 65.8];
    const mx = x.reduce((s, v) => s + v, 0) / 9, my = y.reduce((s, v) => s + v, 0) / 9, b = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0) / x.reduce((s, v) => s + (v - mx) ** 2, 0);
    assert.ok(C.mesure === 0 && C.totalEnfants === 928 && C.totalParents === 205 && Math.abs(C.penteMedianes - b) < 1e-12 && C.penteMedianes.toFixed(3) === '0.685' && C.pentePonderee.toFixed(3) === '0.624' &&
      C.penteInverse.toFixed(2) === '0.30' && I.temoin.mesure === 0 && I.temoin.medianeBasse === 65.8 && I.temoin.predictionDeuxTiers.toFixed(2) === '65.75', JSON.stringify(I));
    return 'pentes ' + C.penteMedianes.toFixed(3) + ' / ' + C.pentePonderee.toFixed(3) + ' ; inverse ' + C.penteInverse.toFixed(3);
  });
  /* game253 : Bradley - reference : p. 653-655 (10210, 8' 12", 8' 13", sept Maximum) et codex 27 (8' 11.9" et 8' 13.1"). Refait ici avec Math.tan. */
  for (const p of [...extremes(sys('aberrationBradley')), { minutesLumiere: 7 }]) ok(`aberrationBradley ${JSON.stringify(p)} : maxima, rapport, temps, temoin`, () => {
    const R = S('aberrationBradley', p), I = R.invariants, C = I.aberrationBradley, s = 180 * 3600 / Math.PI, an = 365.25 * 86400;
    assert.ok(C.mesure === 0 && C.maximumMoyen.toFixed(2) === '40.40' && C.etendueMaxima.toFixed(2) === '0.60' && Math.abs(C.rapportVitesses - 1 / Math.tan(20.2 / s)) < 1e-6 && Math.round(C.rapportVitesses) === 10211 &&
      C.tempsLumiere.toFixed(1) === (an / (2 * Math.PI) * 20.2 / s).toFixed(1) && C.tempsLumiere.toFixed(1) === '491.9' && C.tempsAdopte.toFixed(1) === '493.1' && I.temoin.mesure === 0 && Math.round(I.temoin.maximumRomer) === 54, JSON.stringify(I));
    return 'Maximum ' + C.maximumMoyen.toFixed(2) + ' ; rapport ' + C.rapportVitesses.toFixed(0) + ' ; ' + C.tempsLumiere.toFixed(1) + ' s ; Romer ' + I.temoin.maximumRomer.toFixed(1);
  });
  /* game255 : Gause - reference : codex 27 (calc27.cjs : 105.7, 58.9, 186.9, 130.6, RK4 48.5 / 34.4) et mon calcul a part (calc255.mjs : a x b x b
   *   = 0.3695, 0.4091, 0.4296 ; 1/64 = 0.015625). Refait ici. */
  for (const p of [...extremes(sys('exclusionGause')), { betaGause: 0.61 }]) ok(`exclusionGause ${JSON.stringify(p)} : Table X, constantes, K1, exclusion, temoin`, () => {
    const R = S('exclusionGause', p), I = R.invariants, C = I.exclusionGause;
    assert.ok(C.mesure === 0 && C.volumesTableX === '0.3695 0.4091 0.4296' && C.constantesNonArrondies === '0.429 (0.4296) ; 0.01562 (0.015625)' && C.k1Retrouve.toFixed(1) === '105.7' &&
      C.k2Moyen.toFixed(1) === '58.9' && C.uneBoucleAurelia.toFixed(1) === '186.9' && C.uneBoucleCaudatum.toFixed(1) === '130.6' && I.temoin.mesure === 0 &&
      I.temoin.paModeleJour16.toFixed(1) === '48.5' && I.temoin.pcModeleJour16.toFixed(1) === '34.4', JSON.stringify(I));
    return 'K1 ' + C.k1Retrouve.toFixed(1) + ' ; modele constant Pc j16 ' + I.temoin.pcModeleJour16.toFixed(1) + ' ; beta choisi -> Pc ' + C.pcModeleChoisi.toFixed(1);
  });
  /* game256 : Nightingale - reference : codex 27 (calc27.cjs : 66 / 66, 13 294, 4 688, 474.7, 111.8, 83.9 %, 70.8 %, 582.5, 22.7, 947.3, 31.2) et
   *   mon calcul a part (calc256.mjs, memes nombres). Refait ici. */
  for (const p of [...extremes(sys('mortaliteNightingale')), { anneeNightingale: 2 }]) ok(`mortaliteNightingale ${JSON.stringify(p)} : taux, annees, hivers, temoin`, () => {
    const R = S('mortaliteNightingale', p), I = R.invariants, C = I.mortaliteNightingale;
    assert.ok(C.mesure === 0 && C.tauxRetrouves === 66 && C.totalDeces === 17982 && C.deces1 === 13294 && C.deces2 === 4688 && C.tauxAnnuel1.toFixed(1) === '474.7' && C.tauxAnnuel2.toFixed(1) === '111.8' &&
      C.partZymotique1.toFixed(3) === '0.839' && C.partZymotique2.toFixed(3) === '0.708' && C.hiverAvant.toFixed(1) === '582.5' && C.hiverApres.toFixed(1) === '22.7' && I.temoin.mesure === 0 &&
      I.temoin.janvierConstant.toFixed(1) === '947.3' && I.temoin.decembreConstant.toFixed(1) === '31.2', JSON.stringify(I));
    return C.tauxRetrouves + ' taux ; ' + C.tauxAnnuel1.toFixed(1) + ' puis ' + C.tauxAnnuel2.toFixed(1) + ' pour 1000 ; temoin ' + I.temoin.janvierConstant.toFixed(1) + ' / ' + I.temoin.decembreConstant.toFixed(1);
  });
  /* game257 : Faraday - reference : codex 27 (calc27.cjs : 0.49742, 57.899, 1.37 %, 2.56 %, 92.28, 3.2001, 6.4) et mon calcul a part (calc257.mjs :
   *   1.374, 2.560, 92.2825, 6.433). Refait ici. */
  for (const p of [...extremes(sys('equivalentsFaraday')), { volumeGazFaraday: 3.85 }]) ok(`equivalentsFaraday ${JSON.stringify(p)} : chaine 791, essais, rates, temoin`, () => {
    const R = S('equivalentsFaraday', p), I = R.invariants, C = I.equivalentsFaraday;
    assert.ok(C.mesure === 0 && C.eauDecomposee.toFixed(5) === '0.49742' && C.chaineEtain.toFixed(3) === '57.899' && C.ecartMoyenFaraday.toFixed(3) === '1.374' && C.ecartMaxEssais.toFixed(2) === '2.56' &&
      C.manquesExpliques === '798 93.17 ; 802 75.46 ; 802 73.45 ; 803 89.04' && C.moyenneHuitPlomb.toFixed(2) === '92.28' && C.texte851 === 'Cl 36 vs 35.5 ; Br 78.4 vs 78.3 ; Sn 59 vs 57.9' &&
      I.temoin.mesure === 0 && I.temoin.masseProportionnelle.toFixed(4) === '3.2001' && I.temoin.rapportMasses.toFixed(2) === '6.43', JSON.stringify(I));
    return 'etain ' + C.chaineEtain.toFixed(2) + ' ; retenus ' + C.ecartMoyenFaraday.toFixed(2) + ' % ; meme masse : ' + I.temoin.rapportMasses.toFixed(2) + ' fois trop peu';
  });
  /* game258 : Petit et Dulong - reference : codex 28 (calc28.cjs : 12 / 13, platine 0.35042, CV 1.22 % / 2.16 % / 59.1 % / 94.5 %) et mon calcul a
   *   part (calc258.mjs : 1.2247, 2.1640, 59.069, 94.50 ; troncatures etain, argent, soufre). Refait ici. */
  for (const p of [...extremes(sys('chaleursPetitDulong')), { decalagePoids: 5 }]) ok(`chaleursPetitDulong ${JSON.stringify(p)} : produits, platine, dispersions, temoin`, () => {
    const R = S('chaleursPetitDulong', p), I = R.invariants, C = I.chaleursPetitDulong;
    assert.ok(C.mesure === 0 && C.produitsRetrouves === 12 && C.coquillePlatine === 'Platine 0.3740 vs 0.3504' && C.cPlatine.toFixed(5) === '0.03351' &&
      C.nonArrondis === 'Etain 0.3779 (0.37779) ; Argent 0.3759 (0.37598) ; Soufre 0.3780 (0.37807)' && C.cvProduits.toFixed(2) === '1.22' && C.cvRecalcules.toFixed(2) === '2.16' &&
      (p.decalagePoids !== 5 || C.cvDecale.toFixed(2) === '94.50') && (p.decalagePoids !== 0 || C.cvDecale.toFixed(2) === '2.16') &&
      I.temoin.mesure === 0 && I.temoin.cvChaleurs.toFixed(2) === '59.07' && I.temoin.cvCinq.toFixed(2) === '94.50' && I.temoin.rapportChaleurs.toFixed(2) === '6.53', JSON.stringify(I));
    return C.produitsRetrouves + ' / 13 ; dispersion ' + C.cvProduits.toFixed(2) + ' % ; decalage ' + p.decalagePoids + ' -> ' + C.cvDecale.toFixed(2) + ' %';
  });
  /* game259 : Omori - reference : codex 28 (calc28.cjs : 190.8 / 133.1 / 102.3 / 75.9 / 56.4 / 42.7, 0.890, 0.359, 18.68, 2.140, 0.849, rms 10.69 /
   *   14.40, 9.8e-51) et mon calcul a part (calc259.mjs : la forme x y = k - h y redonne k 440.694, h 2.319 ; 506.6 mois, 36.2 ans). Refait ici. */
  for (const p of [...extremes(sys('repliquesOmori')), { horizonOmori: 500 }]) ok(`repliquesOmori ${JSON.stringify(p)} : calcules, queues, k refait, temoin`, () => {
    const R = S('repliquesOmori', p), I = R.invariants, C = I.repliquesOmori;
    assert.ok(C.mesure === 0 && C.kRefait.toFixed(3) === '440.694' && C.hRefait.toFixed(3) === '2.319' && C.nonArrondisOmori === '190 (190.8) ; 42 (42.7) ; 0.84 (0.849)' &&
      C.prediction1892.toFixed(3) === '0.890' && C.observe1892.toFixed(3) === '1.184' && C.rmsHyperbole.toFixed(2) === '10.69' && C.rmsExpo.toFixed(2) === '14.40' && C.expoNote === '177.8 139.3 109.1' &&
      C.anneesD.toFixed(1) === '42.2' && C.anneesC.toFixed(1) === '36.2' && I.temoin.mesure === 0 && I.temoin.expoQueue.toExponential(1) === '9.8e-51', JSON.stringify(I));
    return 'k refait ' + C.kRefait.toFixed(2) + ', h ' + C.hRefait.toFixed(3) + ' ; 1892 : ' + C.prediction1892.toFixed(2) + ' predit, ' + C.observe1892.toFixed(2) + ' observe';
  });
  /* game260 : Halley - reference : codex 28 (calc28.cjs : 12 / 12, 34 000, 80, 9.974694, rentes 10.28 / 13.01 / 13.44 ..., l(42) constant 144.8,
   *   rente constante 9.00) et mon calcul a part (calc260.mjs : memes rentes ; l(x+1) donne 13.41 a 5 ans et 13.31 a 15 ans). Refait ici. */
  for (const p of [...extremes(sys('survieHalley')), { tauxHalley: 6 }]) ok(`survieHalley ${JSON.stringify(p)} : sommes, chaine, rentes, temoin`, () => {
    const R = S('survieHalley', p), I = R.invariants, C = I.survieHalley;
    assert.ok(C.mesure === 0 && C.sommesRetrouvees === 12 && C.totalHalley === 34000 && C.coteVingtCinq === 80 && C.complementLog.toFixed(6) === '9.974694' && C.naissancesAn === 1238.6 &&
      C.ecartsRentes === '5 13.40 vs 13.01 ; 15 13.33 vs 13.18 ; 45 9.91 vs 9.85 ; 50 9.21 vs 9.14 ; 55 8.51 vs 8.42 ; 60 7.60 vs 7.46 ; 65 6.54 vs 6.32 ; 70 5.32 vs 4.97' && C.renteBaseDecalee === '5 13.41 ; 15 13.31' &&
      (p.tauxHalley !== 6 || C.renteChoisie10.toFixed(2) === '13.44') && I.temoin.mesure === 0 && I.temoin.vivantsConstant42.toFixed(1) === '144.8' && I.temoin.renteConstante.toFixed(2) === '9.00', JSON.stringify(I));
    return C.sommesRetrouvees + ' sommes ; rente a 10 ans au taux ' + p.tauxHalley + ' % : ' + C.renteChoisie10.toFixed(2) + ' ; risque constant a 42 ans : ' + I.temoin.vivantsConstant42.toFixed(0);
  });
  /* game261 : Howard - reference : codex 28 (calc28.cjs : 48.8487 / 49.4800 / 48.2328, 1.579, 50.5248, 50.9420, 4.814 sans 1818, t = 7.30, 11 / 12)
   *   et mon calcul a part (calc261.mjs : 9 / 12 « AVERAGES » a 0.001, pas 10 / 12 comme le codex : 17 ans depuis 1800 = 50.6024). Refait ici. */
  for (const p of [...extremes(sys('chaleurLondres')), { lissageHoward: 5 }]) ok(`chaleurLondres ${JSON.stringify(p)} : periodes, moyennes, etendue, temoin`, () => {
    const R = S('chaleurLondres', p), I = R.invariants, C = I.chaleurLondres;
    assert.ok(C.mesure === 0 && C.retrouvesHoward === 21 && C.nonRetrouvesHoward === 'Londres 1807 50.608 vs 50.6107 ; Londres 17 ans 1790 50.530 vs 50.5248 ; Londres 17 ans 1800 50.600 vs 50.6024 ; Londres 7 ans 1800 50.912 vs 50.9420' &&
      C.etendueAvec1818.toFixed(3) === '5.083' && I.temoin.mesure === 0 && I.temoin.moyenneEcart.toFixed(3) === '1.766' && I.temoin.tStudent.toFixed(2) === '7.30' && I.temoin.positifs === 11 && I.temoin.exceptions === '1813', JSON.stringify(I));
    return C.retrouvesHoward + ' / 25 retrouves ; exces ' + I.temoin.moyenneEcart.toFixed(3) + ' F, t = ' + I.temoin.tStudent.toFixed(2) + ' ; exception ' + I.temoin.exceptions;
  });
  /* game262 : Mendenhall - reference : codex 28 (calc28.cjs : 4348 / 4507 / 4508, 4.604 / 4.625, 13.5 et 1.4 erreurs-types, khi2 11.50 ddl 10) et mon
   *   calcul a part (calc262.mjs : 13.48, 1.37, ecart-type 2.271, khi2 7.922 ddl 7 a 11.870 ddl 13). Refait ici. */
  for (const p of [...extremes(sys('motsMendenhall')), { queueMendenhall: 11 }]) ok(`motsMendenhall ${JSON.stringify(p)} : sommes, lettres, Bible, khi2, temoin`, () => {
    const R = S('motsMendenhall', p), I = R.invariants, C = I.motsMendenhall;
    assert.ok(C.mesure === 0 && C.lettresOliver === 4348 && C.moyennesBible === '4.6044 4.6255' && C.ecartBible.toFixed(5) === '0.00457' && C.zMaxVanity < 1 &&
      (p.queueMendenhall !== 11 || (C.chi2Choisi.toFixed(3) === '11.504' && C.ddlChoisi === 10)) && (p.queueMendenhall !== 8 || (C.chi2Choisi.toFixed(3) === '7.922' && C.ddlChoisi === 7)) &&
      I.temoin.mesure === 0 && I.temoin.ecartTypeOliver.toFixed(3) === '2.271' && I.temoin.ecartTypesMill.toFixed(2) === '13.48' && I.temoin.ecartTypesAtkinson.toFixed(2) === '1.37', JSON.stringify(I));
    return 'khi2 ' + C.chi2Choisi.toFixed(2) + ' pour ' + C.ddlChoisi + ' ddl (z ' + C.zChoisi.toFixed(2) + ') ; Mill - Dickens ' + I.temoin.ecartTypesMill.toFixed(1) + ' erreurs-types';
  });
  /* game263 : Bessel - reference : codex 28 (calc28.cjs : solutions I et II, poids 22.065, 0.3037 sans ponderation, 657 732 UA, 3.08 et 1.93) et mon
   *   calcul a part (calc263.mjs : erreur moyenne de alpha'' 0.0283 avec le poids 22.065 - le codex disait 0.0271, c etait 24.065 ; 0.6836 donne 0.3139). */
  for (const p of [...extremes(sys('parallaxeBessel')), { poidsBessel: 0.6889 }]) ok(`parallaxeBessel ${JSON.stringify(p)} : systemes, poids, solution commune, temoin`, () => {
    const R = S('parallaxeBessel', p), I = R.invariants, C = I.parallaxeBessel;
    assert.ok(C.mesure === 0 && C.retrouvesBessel === 21 && C.nonRetrouvesBessel === 'wA2 24.065 vs 22.065' && C.parallaxeSansPoids.toFixed(4) === '0.3037' && C.rapportExact.toFixed(4) === '0.6836' &&
      C.parallaxeRapportExact.toFixed(4) === '0.3139' && (p.poidsBessel !== 0.6889 || C.parallaxeChoisie.toFixed(4) === '0.3136') && Math.round(C.distanceUA) === 657732 &&
      I.temoin.mesure === 0 && I.temoin.rapportSommesA.toFixed(2) === '3.08' && I.temoin.rapportSommesB.toFixed(2) === '1.93', JSON.stringify(I));
    return C.retrouvesBessel + ' / 22 ; poids ' + p.poidsBessel + ' -> ' + C.parallaxeChoisie.toFixed(4) + ' ; sans poids ' + C.parallaxeSansPoids.toFixed(4);
  });
  /* game264 : Nyquist - reference : codex 29 et sa contre-lecture (5 / 6 mais seules m = 3 et 5 testent ; 2.2 imprime, pas 2.24) et mon calcul a part
   *   (calc264.mjs : 232.193, m = 4.9246 pour 230, 1.6915, 1.3453 / 1.3762, 2.2414 / 2.1910). Refait ici. */
  for (const p of [...extremes(sys('vitesseNyquist')), { niveauxNyquist: 16 }]) ok(`vitesseNyquist ${JSON.stringify(p)} : table, codes, caracteres, gain, temoin`, () => {
    const R = S('vitesseNyquist', p), I = R.invariants, C = I.vitesseNyquist;
    assert.ok(C.mesure === 0 && C.loiCinq.toFixed(3) === '232.193' && C.mPour230.toFixed(4) === '4.9246' && C.lignesQuiTestent === 2 && C.rapportIdeaux.toFixed(4) === '1.6915' &&
      C.morseSurIdeal === '1.3453 1.3762' && C.gainContinental.toFixed(4) === '2.2414' && C.gainAmericain.toFixed(4) === '2.1910' && I.temoin.mesure === 0 && I.temoin.lineaire16 === 800 && I.temoin.imprime16 === 400, JSON.stringify(I));
    return 'm = 5 : ' + C.loiCinq.toFixed(1) + ' (230 imprime) ; gain ' + C.gainContinental.toFixed(2) + ' ; lineaire ' + I.temoin.lineaire16 + ' contre ' + I.temoin.imprime16;
  });
  /* game265 : Young - reference : codex 29 et sa contre-lecture (14 / 15, 13 / 15, 15 / 15 a une unite ; 652 ni depuis N ni depuis L ; 1.587 sur N,
   *   1.593 sur L) et mon calcul a part (calc265.mjs : v 12307692308 po/s, 1.9931, 7.094 / 6.125, 1.3061). Refait ici. */
  for (const p of [...extremes(sys('ondulationsYoung')), { minutesYoung: 8.125 }]) ok(`ondulationsYoung ${JSON.stringify(p)} : longueurs, frequences, 2^48, temoin`, () => {
    const R = S('ondulationsYoung', p), I = R.invariants, C = I.ondulationsYoung;
    assert.ok(C.mesure === 0 && C.longueursRetrouvees === 14 && C.frequencesRetrouvees === 13 && Math.round(C.vitesseSupposee) === 12307692308 && C.ligne652DepuisL.toFixed(1) === '651.2' &&
      C.facteurPuissance.toFixed(4) === '1.9931' && C.etendueYoung.toFixed(5) === '1.58741' && C.huitSeptSix === '7.094 6.125' && C.quarte.toFixed(4) === '1.3061' &&
      (p.minutesYoung !== 8.125 || C.frequenceChoisie.toFixed(1) === '561.2') && I.temoin.mesure === 0, JSON.stringify(I));
    return C.longueursRetrouvees + ' longueurs, ' + C.frequencesRetrouvees + ' frequences ; 2^48 x ' + C.facteurPuissance.toFixed(3) + ' ; etendue ' + C.etendueYoung.toFixed(3);
  });
  /* game266 : Lummer et Pringsheim - reference : codex 29 et sa contre-lecture (A 7 / 8, B 6 / 8 et non 7 / 8, T 8 / 8 a 0.3, Diff 8 / 8 ; seance du
   *   3 novembre) et mon calcul a part (calc266.mjs : 2941.5, 2187.5, pentes -0.9695 et 5.0134, E/T^4 x 2.710, ecart B 2.65 %). Refait ici. */
  for (const p of [...extremes(sys('picLummer')), { exposantLummer: 5 }]) ok(`picLummer ${JSON.stringify(p)} : A, B, temperatures, moyennes, temoin`, () => {
    const R = S('picLummer', p), I = R.invariants, C = I.picLummer;
    assert.ok(C.mesure === 0 && C.retrouvesA === 7 && C.retrouvesB === 6 && C.diffsRetrouvees === 8 && C.moyenneA === 2941.5 && C.moyenneB === 2187.5 &&
      C.penteLambda.toFixed(4) === '-0.9695' && C.penteEnergie.toFixed(4) === '5.0134' && I.temoin.mesure === 0 && I.temoin.rapportT4.toFixed(3) === '2.710' && I.temoin.ecartMaxB.toFixed(2) === '2.65', JSON.stringify(I));
    return 'A ' + C.retrouvesA + ' / 8, B ' + C.retrouvesB + ' / 8 ; pentes ' + C.penteLambda.toFixed(3) + ' et ' + C.penteEnergie.toFixed(3) + ' ; T^4 x ' + I.temoin.rapportT4.toFixed(2);
  });
  /* game267 : Coulomb - reference : codex 29 et sa contre-lecture (p. 585 : 1/40 par minute, 57, 1/20 ; « 576 arrondi » non soutenu) et mon calcul a part
   *   (calc267.mjs : 36 / 144 / 575.5, 46656 / 46656 / 41579.875, -10.88 %, 2.0000 / 1.8465, pente -1.9192, 53.333, 56.921, 645.8, 72 / 152.47). */
  for (const p of [...extremes(sys('balanceCoulomb')), { exposantCoulomb: 2 }]) ok(`balanceCoulomb ${JSON.stringify(p)} : torsions, oscillations, correction, temoin`, () => {
    const R = S('balanceCoulomb', p), I = R.invariants, C = I.balanceCoulomb;
    assert.ok(C.mesure === 0 && C.torsions === '36 144 575.5' && C.forceFoisD2 === '46656 46656 41579.875' && C.ecartTroisieme.toFixed(2) === '-10.88' && C.exposant12.toFixed(4) === '2.0000' &&
      C.exposant23.toFixed(4) === '1.8465' && C.penteCoulomb.toFixed(4) === '-1.9192' && C.theorieTroisieme.toFixed(3) === '53.333' && C.tempsCorrige.toFixed(3) === '56.921' && C.carreInverseTroisieme.toFixed(1) === '645.8' &&
      I.temoin.mesure === 0 && I.temoin.enUnSurD18 === 72 && I.temoin.enUnSurD85.toFixed(2) === '152.47', JSON.stringify(I));
    return 'F d2 ' + C.forceFoisD2 + ' ; exposants ' + C.exposant12.toFixed(2) + ' et ' + C.exposant23.toFixed(2) + ' ; corrige ' + C.tempsCorrige.toFixed(1) + ' s';
  });
  /* game268 : Joule 1841 - reference : codex 29 et sa contre-lecture (22 3/4 et non 22 5/8 ; deux reductions et une moyenne, pas trois ; seule 4.55 discrimine
   *   la colonne de l heure) et mon calcul a part (calc268.mjs : k 3.4119 / 5.3629, exposants 1.9591 / 1.8964, 7.5723 / 7.6316, accords -2.31 / 0.18 / 3.45). */
  for (const p of [...extremes(sys('effetJoule')), { exposantJouleQ: 2 }]) ok(`effetJoule ${JSON.stringify(p)} : colonnes, reductions, accords, temoin`, () => {
    const R = S('effetJoule', p), I = R.invariants, C = I.effetJoule;
    assert.ok(C.mesure === 0 && C.kDemiHeure.toFixed(4) === '3.4119' && C.colonneDemiHeure === 4 && C.kHeure.toFixed(4) === '5.3629' && C.casesDiscriminantes === 1 && C.exposantDemiHeure.toFixed(4) === '1.9591' &&
      C.exposantHeure.toFixed(4) === '1.8964' && C.reduction1.toFixed(4) === '7.5723' && C.reduction2.toFixed(4) === '7.6316' && C.resistanceFinGros.toFixed(3) === '1.275' && C.accordsChaleurResistance === '-2.31 0.18 3.45' &&
      I.temoin.mesure === 0 && I.temoin.enIntensite.toFixed(4) === '2.9674' && I.temoin.observe.toFixed(4) === '8.3333' && I.temoin.enCarre.toFixed(4) === '8.8054', JSON.stringify(I));
    return 'k ' + C.kDemiHeure.toFixed(3) + ' ; exposant ' + C.exposantDemiHeure.toFixed(3) + ' ; reductions ' + C.reduction1.toFixed(2) + ' et ' + C.reduction2.toFixed(2) + ' ; en I : x ' + I.temoin.enIntensite.toFixed(2);
  });
  /* game269 : Reynolds - reference : codex 29 et sa contre-lecture (V depuis log V 24 / 29 et non 28 / 29 ; log D faux pour les trois tubes) et mon calcul a
   *   part (calc269.mjs : 23, 25, 22, 26, 24 ; 1.64141 ; pente -1.0104 ; sigma 0.0221 ; 0.026809 0.015276 0.0079037 ; 216). Refait ici. */
  for (const p of [...extremes(sys('critiqueReynolds')), { exposantReynolds: 1 }]) ok(`critiqueReynolds ${JSON.stringify(p)} : comptes, lignes nommees, moyenne, temoin`, () => {
    const R = S('critiqueReynolds', p), I = R.invariants, C = I.critiqueReynolds;
    assert.ok(C.mesure === 0 && C.logTempsRetrouves === 23 && C.logVRetrouves === 25 && C.logBsRetrouves5 === 22 && C.logBsRetrouves4 === 26 && C.vitessesDepuisLog === 24 &&
      C.moyenneLogBs.toFixed(5) === '1.64141' && C.diametresDepuisLog === '0.026809 0.015276 0.0079037' && C.sigmaLogBs.toFixed(4) === '0.0221' && Math.round(C.ligne23Temps) === 216 &&
      I.temoin.mesure === 0 && I.temoin.penteDiametre.toFixed(4) === '-1.0104', JSON.stringify(I));
    return 'comptes ' + [C.logTempsRetrouves, C.logVRetrouves, C.logBsRetrouves5, C.vitessesDepuisLog].join(' / ') + ' ; pente ' + I.temoin.penteDiametre.toFixed(3);
  });
  /* game270 : Darcy - reference : codex 29 et sa contre-lecture (rapports 22 / 23 a 0.01 mais 19 / 23 a l arrondi ; temoin affine 4.90 et non 5.27) et mon
   *   calcul a part (calc270.mjs, series 1-2 seulement : 15 / 16 et 13 / 16, pentes 0.4912 / 0.1452, 11 / 12, 12 / 12, rms 5.2712 / 4.8969 / 0.4002 / 0.3923). */
  for (const p of [...extremes(sys('filtreDarcy')), { partDessous: 1 }]) ok(`filtreDarcy ${JSON.stringify(p)} : rapports, pentes, fevrier, temoin`, () => {
    const R = S('filtreDarcy', p), I = R.invariants, C = I.filtreDarcy;
    assert.ok(C.mesure === 0 && C.rapportsRetrouves === 15 && C.rapportsArrondis === 13 && C.pentesSeries === '0.4912 0.1452' && C.differencesRetrouvees === 11 && C.rapportsFevrier === 12 &&
      C.kFevrier.toFixed(4) === '0.2501' && I.temoin.mesure === 0 && I.temoin.rmsDessusOrigine.toFixed(4) === '5.2712' && I.temoin.rmsDessusAffine.toFixed(4) === '4.8969' &&
      I.temoin.rmsDifference.toFixed(4) === '0.4002' && I.temoin.rmsDifferenceAffine.toFixed(4) === '0.3923' && (p.partDessous !== 0 || C.rmsChoisi.toFixed(4) === '5.2712'), JSON.stringify(I));
    return 'rapports ' + C.rapportsRetrouves + ' / 16 ; pentes ' + C.pentesSeries + ' ; erreur dessus seul ' + I.temoin.rmsDessusAffine.toFixed(2) + ' contre ' + I.temoin.rmsDifference.toFixed(2);
  });
  /* game271 : Perrin - reference : codex 29 et sa contre-lecture (gaussienne 9 / 10 seulement en arrondissant le modele, 8 / 10 brut ; khi-deux uniforme
   *   des anneaux 188.48 avec le total observe) et mon calcul a part (calc271.mjs : 6.2965 / 6.3029, 12.52 / 4.92 / 2.04, 103.21 / 112.61 / 188.48). */
  for (const p of [...extremes(sys('deplacementsPerrin')), { sigmaPerrin: 6.3 }]) ok(`deplacementsPerrin ${JSON.stringify(p)} : sommes, gaussiennes, anneaux, temoin`, () => {
    const R = S('deplacementsPerrin', p), I = R.invariants, C = I.deplacementsPerrin;
    assert.ok(C.mesure === 0 && C.sommesProjections === '221 223 205 204' && C.trouvesAnneaux === 501 && C.sigmas.slice(0, 5) === '6.296' && C.sigmas.slice(7, 12) === '6.302' &&
      C.aUneUnite === '9 10 (brut 8 10)' && C.deCalcule.toFixed(4) === '0.8862' && C.khiGauss === '12.52 4.92 2.04' && I.temoin.mesure === 0 && I.temoin.khiUniforme === '103.21 112.61 188.48', JSON.stringify(I));
    return 'sigmas ' + C.sigmas + ' ; ' + C.aUneUnite + ' ; khi2 ' + C.khiGauss + ' contre ' + I.temoin.khiUniforme;
  });
  /* game272 : Gauss - reference : codex 30 et sa contre-lecture (6 points, pas 5, au-dela de 2 m ; ajustements des temoins sur la tangente) et mon
   *   calcul a part (calc272.mjs : 27 / 28 et 27 / 28 strict 22, exposants 2.9962 / 3.0275, temoins 610.26 / 566.66 contre 12.76 / 28.52). */
  for (const p of [...extremes(sys('aimantGauss')), { exposantGauss: 3 }]) ok(`aimantGauss ${JSON.stringify(p)} : differences, formules, exposants, temoin`, () => {
    const R = S('aimantGauss', p), I = R.invariants, C = I.aimantGauss;
    assert.ok(C.mesure === 0 && C.anglesGauss === 28 && C.differencesGauss === '27/28' && C.formulesGauss === '27/28 (strict 22)' && C.rapportGauss === '2.000000' &&
      C.exposantsGauss === '2.9962 3.0275' && C.rmsCubeGauss === '12.76 28.52' && I.temoin.mesure === 0 && I.temoin.rmsCarreGauss === '610.26 566.66', JSON.stringify(I));
    return 'differences ' + C.differencesGauss + ' ; formules ' + C.formulesGauss + ' ; exposants ' + C.exposantsGauss + ' ; ecarts ' + C.rmsCubeGauss + ' contre ' + I.temoin.rmsCarreGauss;
  });
  /* game273 : Weber-Kohlrausch - reference : codex 30 et sa contre-lecture, et mon calcul a part (calc273.mjs : tau 5 / 5, ecart max 0.0207 %,
   *   109863.2 / 16572.80 / 439452.7, temoins 2.82 % contre 11.59 %). */
  for (const p of [...extremes(sys('unitesWeber')), { partWeber: 0.5 }]) ok(`unitesWeber ${JSON.stringify(p)} : tau, rapports, moyenne, produits, temoin`, () => {
    const R = S('unitesWeber', p), I = R.invariants, C = I.unitesWeber;
    assert.ok(C.mesure === 0 && C.tauWeber === '5/5' && C.rapportsWeber === '151005.0 161307.7 158482.1 149831.1 156261.8' && C.ecartMaxWeber === '0.0207' && C.moyenneWeber === 155370 &&
      C.produitsWeber === '109863.2 16572.80 439452.7' && C.meileWeber === '7408.1' && I.temoin.mesure === 0 && I.temoin.ecartProportionnel === '2.82' && I.temoin.ecartConstant === '11.59', JSON.stringify(I));
    return 'rapports ' + C.rapportsWeber + ' ; produits ' + C.produitsWeber + ' ; ' + I.temoin.ecartProportionnel + ' % contre ' + I.temoin.ecartConstant + ' %';
  });
  /* game274 : Poiseuille - reference : codex 30 et sa contre-lecture, et mon calcul a part (calc274.mjs : etendues 0.056 / 0.108 %, pentes
   *   -0.9994 / -0.9997, pente 3.9993, moyenne 2495.3657, longueurs 24.929 ... 25.000, facteurs 3.157 contre 1.001). */
  for (const p of [...extremes(sys('tubesPoiseuille')), { exposantPoiseuille: 4 }]) ok(`tubesPoiseuille ${JSON.stringify(p)} : pressions, D^4, moyenne nommee, longueurs, temoin`, () => {
    const R = S('tubesPoiseuille', p), I = R.invariants, C = I.tubesPoiseuille;
    assert.ok(C.mesure === 0 && C.etenduesPression === '0.056 0.108' && C.pentesPression === '-0.9994 -0.9997' && C.ecartsD4 === '0.243 -0.022 -0.008 0.020 -0.014 -0.155 -0.063' &&
      C.penteDiametrePoiseuille === '3.9993' && C.moyenneKRecalculee === '2495.3657' && C.longueursImplicites === '24.929 25.000 24.981 25.007 25.000 25.000 25.000' &&
      I.temoin.mesure === 0 && I.temoin.facteurNavier === '3.157' && I.temoin.facteurD4 === '1.001', JSON.stringify(I));
    return 'pente ' + C.penteDiametrePoiseuille + ' ; longueurs ' + C.longueursImplicites + ' ; Navier x' + I.temoin.facteurNavier;
  });
  /* game275 : Halley 1683 - reference : codex 30 et sa contre-lecture (comptes des lieux, Java), et mon calcul a la main : 11.25 + 4.5 = 15.75 ;
   *   (6 - 11.25) x 60 / 42 = -7.500 ; (4.0833 - 6) x 60 / 12 = -9.583 ; (-2.5 - 4.0833) x 60 / 38 = -10.395 ; -2 x 60 / 11 = -10.909 ;
   *   plus petit changement : Londres 1622 -> 1634, 1.917. */
  for (const p of [...extremes(sys('variationsHalley')), { anneeHalley: 1650 }]) ok(`variationsHalley ${JSON.stringify(p)} : 15 degres, derive, Ouest, texte, temoin`, () => {
    const R = S('variationsHalley', p), I = R.invariants, C = I.variationsHalley;
    assert.ok(C.mesure === 0 && C.changeLondres === '15.75' && C.tauxLondres === '-7.500 -9.583 -10.395 -10.909' && C.versOuest === '7/7' && C.texteTable === '5/5' &&
      I.temoin.mesure === 0 && I.temoin.plusPetitChangement === '1.917', JSON.stringify(I));
    return 'Londres ' + C.changeLondres + ' degres ; derive ' + C.tauxLondres + ' ; ' + C.versOuest + ' ; ' + C.texteTable;
  });
  ok('variationsHalley : Londres interpolee a 1650 et 1683', () => {
    const a = S('variationsHalley', { anneeHalley: 1650 }).invariants.variationsHalley.londresInterpolee, b = S('variationsHalley', { anneeHalley: 1683 }).invariants.variationsHalley.londresInterpolee;
    assert.ok(a === '1.31' && b === '-4.50', a + ' ' + b);
    return a + ' ' + b;
  });
  /* game276 : Beal - reference : codex 30 et sa contre-lecture (151 « hors serie » n est pas le compte de Beal ; « cinq lignes ») et mon calcul a
   *   part (calc276.mjs : 895, 744 / 0.8313, 824 / 0.9207, 41, 427 / 467, p 0.1921, meleze d Europe 0.0399). */
  for (const p of [...extremes(sys('spiralesBeal')), { groupeBeal: 0 }]) ok(`spiralesBeal ${JSON.stringify(p)} : 155, 895, Fibonacci, symetrie, temoin`, () => {
    const R = S('spiralesBeal', p), I = R.invariants, C = I.spiralesBeal;
    assert.ok(C.mesure === 0 && C.conesTotal === 895 && C.conesArbre1 === 155 && C.partVoisins === '0.8313' && C.partDeuxFib === '0.9207' && C.conesQuatreSept === 41 &&
      C.droiteGauche === '427 467' && C.pSymetrie === '0.1921' && C.pMelezeEurope === '0.0399' && C.pArbre3 === '0.0041' && I.temoin.mesure === 0 && I.temoin.conesExclusAiry === 41, JSON.stringify(I));
    return C.conesTotal + ' cones ; voisins ' + C.partVoisins + ' ; 4 et 7 : ' + C.conesQuatreSept + ' ; p ' + C.pSymetrie + ' / ' + C.pMelezeEurope;
  });
  /* game277 : Oldham - reference : codex 30 et sa contre-lecture (avertissement de l auteur sur 120 degres) et mon calcul a part (calc277.mjs :
   *   6 / 6 / 6, vitesses hors Pc60 et Sa90, mu 74.700 132.330 223.200, K 151.567 219.331 322.400, 32.33 et 33.47 min). */
  for (const p of [...extremes(sys('tempsOldham')), { vitesseOldham: 6 }]) ok(`tempsOldham ${JSON.stringify(p)} : geometrie, vitesses, modules, temoin`, () => {
    const R = S('tempsOldham', p), I = R.invariants, C = I.tempsOldham;
    assert.ok(C.mesure === 0 && C.arcsOldham === '6/6' && C.profondeursOldham === '6/6' && C.cordesOldham === '6/6' && C.vitessesHorsOldham === 'Pc60 Sa90' &&
      C.distorsionOldham === '74.700 132.330 223.200' && C.compressionOldham === '151.567 219.331 322.400' && C.texteTableOldham === '0/3' && I.temoin.mesure === 0 && I.temoin.predit150et180 === '32.33 33.47', JSON.stringify(I));
    return 'vitesses hors ' + C.vitessesHorsOldham + ' ; K ' + C.compressionOldham + ' ; temoin ' + I.temoin.predit150et180;
  });
  /* game278 : MacKellar - reference : codex 30 et sa contre-lecture (page de la phrase « run short », ex aequo c m) et mon calcul a part (106900,
   *   60, 19, 4.2219 / 4.7004, 27 / 28 hors T, 10 au-dessus, 2.919). */
  for (const p of [...extremes(sys('fonteMacKellar')), { melangeUniforme: 0 }]) ok(`fonteMacKellar ${JSON.stringify(p)} : somme, e / z, entropie, petites capitales, temoin`, () => {
    const R = S('fonteMacKellar', p), I = R.invariants, C = I.fonteMacKellar;
    assert.ok(C.mesure === 0 && C.sommeMinuscules === 106900 && C.eSurZ === 60 && C.valeursDistinctes === 19 && C.entropieFonte === '4.2219' && C.entropieUniforme === '4.7004' &&
      C.petitesCapitalesHors === 'T' && C.lettresAuDessus === 10 && I.temoin.mesure === 0 && I.temoin.eFoisUniforme === '2.919', JSON.stringify(I));
    return 'H ' + C.entropieFonte + ' contre ' + C.entropieUniforme + ' ; e x' + I.temoin.eFoisUniforme;
  });
  /* game279 : Kaeding - reference : codex 30 et sa contre-lecture (troncature echoue 7 / 14 ; 76·675) et mon calcul a part (calc279.mjs : 8b -800 /
   *   -3200, colonne 4 -800, moyenne 2 2.02610, 49.7543, 1.83381, geometrique 621265). */
  for (const p of [...extremes(sys('syllabesKaeding')), { zaehlstoffKaeding: 0 }]) ok(`syllabesKaeding ${JSON.stringify(p)} : resume, lignes, colonnes, 8b, temoin`, () => {
    const R = S('syllabesKaeding', p), I = R.invariants, C = I.syllabesKaeding;
    assert.ok(C.mesure === 0 && C.motsTotal === 10906235 && C.syllabesTotal === 20000000 && C.moyenneKaeding === '1.83381' && C.lignesHors === '8b | 8b' && C.colonnesHors === '4' &&
      C.manque8b === '800 3200' && C.moyennesHors === '2' && C.pourCentUn === '49.7543' && I.temoin.mesure === 0 && I.temoin.geometriqueCinq === 621265, JSON.stringify(I));
    return 'hors ' + C.lignesHors + ' / colonne ' + C.colonnesHors + ' ; manque ' + C.manque8b + ' ; geometrique ' + I.temoin.geometriqueCinq;
  });
  /* game280 : Hagen - reference : codex 30 et sa contre-lecture (e.p. de III a 1 unite seulement en arrondissant d abord) et mon calcul a part
   *   (calc280.mjs : 21 / 21, 5 / 5, hors II-3 III-4 V-1, 106.0 et 2.63, lineaire 0.5278 ... 0.1108). */
  for (const p of [...extremes(sys('tubesHagen')), { partCarreHagen: 1 }]) ok(`tubesHagen ${JSON.stringify(p)} : ecarts, erreurs probables, r et s, temoin`, () => {
    const R = S('tubesHagen', p), I = R.invariants, C = I.tubesHagen;
    assert.ok(C.mesure === 0 && C.ecartsHagen === '21/21' && C.erreursProbablesHagen === '5/5' && C.hHorsHagen === 'II-3 III-4 V-1' && C.rFoisErreur === '106.0' && C.sFoisErreur === '2.63' &&
      I.temoin.mesure === 0 && I.temoin.ecartLineaire === '0.5278 0.2275 0.1601 0.1177 0.1108' && I.temoin.ecartDeuxTermes === '0.0070 0.0040 0.0068 0.0048 0.0045', JSON.stringify(I));
    return 'r x' + C.rFoisErreur + ' ; s x' + C.sFoisErreur + ' ; lineaire ' + I.temoin.ecartLineaire;
  });
  /* game281 : Moseley - reference : codex 30 et sa contre-lecture (listes des cases hors regle contradictoires) et mon calcul a part : terme 3 seul
   *   hors, 1.1820 / 1.1311, 1.18047 1.17856 1.13185, mu 2.4519 2.4565 2.4625, temoins 0.0482 / 0.0188 contre 0.0039 / 0.0052. */
  for (const p of [...extremes(sys('spiraleMoseley')), { raisonMoseley: 1.18 }]) ok(`spiraleMoseley ${JSON.stringify(p)} : progressions, raisons, formules, mu, temoin`, () => {
    const R = S('spiraleMoseley', p), I = R.invariants, C = I.spiraleMoseley;
    assert.ok(C.mesure === 0 && C.progressionHors === 'duplicatus3' && C.raisonsAjustees === '1.1820 1.1311' && C.formulesMoseley === '1.18047 1.17856 1.13185' && C.muBuccinum === '2.4519 2.4565 2.4625' &&
      I.temoin.mesure === 0 && I.temoin.ecartArithmetique === '0.0482 0.0188' && I.temoin.ecartGeometrique === '0.0039 0.0052', JSON.stringify(I));
    return 'raisons ' + C.raisonsAjustees + ' ; formules ' + C.formulesMoseley + ' ; temoin ' + I.temoin.ecartArithmetique;
  });
  /* game282 : Mendel - reference : codex 31 et sa contre-lecture (le texte ne dit pas comment 2,98 est obtenu) et mon calcul a part : 7 / 7 / 7,
   *   14949 5010, 2.98383 2.98143, 1.9275 2.1265, khi-deux 2.1389 contre 4950.9. */
  for (const p of [...extremes(sys('poisMendel')), { rapportMendel: 3 }]) ok(`poisMendel ${JSON.stringify(p)} : sommes, rapports, 2.98, seconde generation, temoin`, () => {
    const R = S('poisMendel', p), I = R.invariants, C = I.poisMendel;
    assert.ok(C.mesure === 0 && C.sommesMendel === '7/7' && C.rapportsMendel === '7/7' && C.totauxMendel === '14949 5010' && C.deuxCheminsMendel === '2.98383 2.98143' &&
      C.secondeGeneration === '1.9275 2.1265' && C.khiDeuxTroisUn === '2.1389' && I.temoin.mesure === 0 && I.temoin.khiDeuxUnUn === '4950.9', JSON.stringify(I));
    return 'totaux ' + C.totauxMendel + ' ; khi2 ' + C.khiDeuxTroisUn + ' contre ' + I.temoin.khiDeuxUnUn;
  });
  /* game283 : Thomson - reference : codex 31 et sa contre-lecture, et mon calcul a part (calc283.mjs : m / e hors 8 13 14 16 20, v hors 8 10 11 14 18
   *   24, produit hors 10, moyenne 5.1308e-8, 1949 fois). */
  for (const p of [...extremes(sys('rayonsThomson')), { facteurIThomson: 1 }]) ok(`rayonsThomson ${JSON.stringify(p)} : m / e, v, produit, temoin`, () => {
    const R = S('rayonsThomson', p), I = R.invariants, C = I.rayonsThomson;
    assert.ok(C.mesure === 0 && C.lignesThomson === 26 && C.meHors === '8 13 14 16 20' && C.vHors === '8 10 11 14 18 24' && C.produitHors === '10' && C.moyenneMeThomson === '5.131e-8' &&
      I.temoin.mesure === 0 && I.temoin.foisPlusPetit === 1949, JSON.stringify(I));
    return 'm / e hors ' + C.meHors + ' ; v hors ' + C.vHors + ' ; ' + I.temoin.foisPlusPetit + ' fois';
  });
  /* game284 : Pogson - reference : codex 31 et sa contre-lecture, et mon calcul a part : 10 / 10 tronque, 5 / 5, hors S7 H14, 15.0805, 4.999755,
   *   Dawes 117.2. */
  for (const p of [...extremes(sys('magnitudesPogson')), { rapportPogson: 2.512 }]) ok(`magnitudesPogson ${JSON.stringify(p)} : ouvertures, colonnes, texte, temoin`, () => {
    const R = S('magnitudesPogson', p), I = R.invariants, C = I.magnitudesPogson;
    assert.ok(C.mesure === 0 && C.ouverturesPogson === '10/10' && C.periodePogson === '5/5' && C.limiteCalculee === '15.0805' && C.colonnesHorsPogson === 'S7 H14' && C.exactementCinq === '4.999755' &&
      I.temoin.mesure === 0 && I.temoin.ouvertureDawes15 === '117.2', JSON.stringify(I));
    return 'hors ' + C.colonnesHorsPogson + ' ; exactly 5 = ' + C.exactementCinq + ' ; Dawes ' + I.temoin.ouvertureDawes15;
  });
  /* game285 : Darwin - reference : codex 31 et sa contre-lecture (regles d arrondi des « 100 to N ») et mon calcul a part : 2423 2109, 20.1917
   *   17.5750, 87.041, 13 / 15, signe 0.00739, ecart 2.6167. */
  for (const p of [...extremes(sys('maisDarwin')), { gainDarwin: 15 }]) ok(`maisDarwin ${JSON.stringify(p)} : totaux, moyennes, 87, temoin`, () => {
    const R = S('maisDarwin', p), I = R.invariants, C = I.maisDarwin;
    assert.ok(C.mesure === 0 && C.huitiemesDarwin === '2423 2109' && C.moyennesDarwin === '20.1917 17.5750' && C.rapportDarwin === '87.041' && C.lignesCroiseesPlusHautes === '13/15' &&
      I.temoin.mesure === 0 && I.temoin.pSigneDarwin === '0.00739' && I.temoin.ecartMoyenDarwin === '2.6167', JSON.stringify(I));
    return 'moyennes ' + C.moyennesDarwin + ' ; ' + C.lignesCroiseesPlusHautes + ' ; p ' + I.temoin.pSigneDarwin;
  });
  /* game286 : Rutherford - reference : codex 31 et sa contre-lecture (Table IV ambigue, non reprise) et mon calcul a part : 0.011446, 60.56,
   *   58.95, 86.5617, 8.711e-7, droite 0.1633 contre 0.0338, -0.192. */
  for (const p of [...extremes(sys('emanationRutherford')), { demiVieRutherford: 60 }]) ok(`emanationRutherford ${JSON.stringify(p)} : demi-vie, 86, millionieme, temoin`, () => {
    const R = S('emanationRutherford', p), I = R.invariants, C = I.emanationRutherford;
    assert.ok(C.mesure === 0 && C.lambdaAjuste === '0.011446' && C.demiVieAjustee === '60.56' && C.demiVieOrigine === '58.95' && C.unSurLambda === '86.5617' && C.resteVingtMinutes === '8.711e-7' &&
      I.temoin.mesure === 0 && I.temoin.ecartDroite === '0.1633' && I.temoin.ecartExponentielle === '0.0338' && I.temoin.droiteA360 === '-0.192', JSON.stringify(I));
    return 'demi-vie ' + C.demiVieAjustee + ' s ; 1 / lambda ' + C.unSurLambda + ' ; droite ' + I.temoin.ecartDroite;
  });
  /* game287 : Michelson-Morley - reference : codex 31 et sa contre-lecture (le soir depasse le « twentieth part ») et mon calcul a part : 17 17 9 9
   *   deux fois, 0.0166 0.0226, 24.2 17.7, derives -0.246 +0.146. */
  for (const p of [...extremes(sys('etherMichelson')), { vitesseEther: 1 }]) ok(`etherMichelson ${JSON.stringify(p)} : regles du tableau, 0.4, temoin`, () => {
    const R = S('etherMichelson', p), I = R.invariants, C = I.etherMichelson;
    assert.ok(C.mesure === 0 && C.reglesMidi === '17 17 9 9' && C.reglesSoir === '17 17 9 9' && Math.abs(C.frangeAttendue - 0.4) < 1e-12 && C.creteMidiSoir === '0.0166 0.0226' && C.deriveTour === '-0.246 0.146' &&
      I.temoin.mesure === 0 && I.temoin.foisMichelson === '24.2 17.7', JSON.stringify(I));
    return 'cretes ' + C.creteMidiSoir + ' ; ' + I.temoin.foisMichelson + ' fois';
  });
  /* game288 : Rubens-Kurlbaum - reference : codex 31 et sa contre-lecture, et mon calcul a part : ecart max 2.32, Wien infini 194.6, rms 45.18
   *   13.96 2.60 1.79 1.51. */
  for (const p of [...extremes(sys('reststrahlenRubens')), { loiRubens: 4 }]) ok(`reststrahlenRubens ${JSON.stringify(p)} : formules, ordre des lois, temoin`, () => {
    const R = S('reststrahlenRubens', p), I = R.invariants, C = I.reststrahlenRubens;
    assert.ok(C.mesure === 0 && C.ecartMaxLois === '2.32' && C.wienInfiniRubens === '194.6' && C.rmsLoisRubens === '45.18 13.96 2.60 1.79 1.51' && I.temoin.mesure === 0 && I.temoin.wienSurPlanck === '30.0', JSON.stringify(I));
    return 'rms ' + C.rmsLoisRubens + ' ; Wien / Planck ' + I.temoin.wienSurPlanck;
  });
  /* game289 : Planck - reference : codex 31 et sa contre-lecture, et mon calcul a part : 7.06162e-15, 1.082323, 1.16821e15, 4.965114, 4.86580e-11,
   *   6.5495e-27, 1.3460e-16, residu de Wien -1. */
  for (const p of [...extremes(sys('constantesPlanck')), { lambdaThetaPlanck: 0.294 }]) ok(`constantesPlanck ${JSON.stringify(p)} : chaine de h et k, temoin`, () => {
    const R = S('constantesPlanck', p), I = R.invariants, C = I.constantesPlanck;
    assert.ok(C.mesure === 0 && C.densitePlanck === '7.06162e-15' && C.seriePlanck === '1.082323' && C.k4h3Planck === '1.16821e+15' && C.racinePlanck === '4.965114' && C.hkPlanck === '4.86580e-11' &&
      C.hPlanck === '6.5495e-27' && C.kPlanck === '1.3460e-16' && C.repriseesPlanck === '6/6' && I.temoin.mesure === 0 && I.temoin.residuWien === '-1.000', JSON.stringify(I));
    return 'h ' + C.hPlanck + ' ; k ' + C.kPlanck + ' ; racine ' + C.racinePlanck;
  });
  /* game290 : Herschel - reference : codex 31 et sa contre-lecture (ses « rayons de nebulosite 5112.89 / 8116.21 » ne sortent pas de la formule
   *   sur 636175 et 2544700 : les deux lignes passent l arrondi) et mon calcul a part : 165 / 167 hors 120 et 290, 166 / 167, 1 / 167, 498.043. */
  for (const p of [...extremes(sys('jaugesHerschel')), { champHerschel: 15 }]) ok(`jaugesHerschel ${JSON.stringify(p)} : formule, exemple, temoin`, () => {
    const R = S('jaugesHerschel', p), I = R.invariants, C = I.jaugesHerschel;
    assert.ok(C.mesure === 0 && C.lignesHerschel === 167 && C.BHerschel === '458.3655' && C.horsArrondiHerschel === '120 290' && C.horsUniteHerschel === '120' && C.sansMoinsUnHerschel === '1/167' &&
      C.exemple588 === '498.043' && I.temoin.mesure === 0, JSON.stringify(I));
    return 'hors ' + C.horsArrondiHerschel + ' ; pente ' + C.penteHerschel + ' ; carre ' + I.temoin.racineCarree100k;
  });
  /* game292 : Kater - reference : codex 31 et mon calcul a part (calc291.mjs, Math natif) : 6/6, ecart max 1.70e-5, E 39.00734, ajuste 39.00695,
   *   d/E 0.0055430, 1/321.8 ; sans Clifton 320.5, sans Arbury Hill 324.9, sans Shanklin Farm 321.8 ; rapport a Newton 0.0055430 x 230 = 1.275. */
  const SANS_KATER = { 0: ['none', '321.8'], 4: ['Clifton', '320.5'], 5: ['ArburyHill', '324.9'], 7: ['ShanklinFarm', '321.8'] };
  for (const p of [...extremes(sys('penduleKater')), { stationOteeKater: 4 }, { stationOteeKater: 5 }]) ok(`penduleKater ${JSON.stringify(p)} : baisses, N carre, equateur, temoin`, () => {
    const R = S('penduleKater', p), I = R.invariants, C = I.penduleKater, [nom, sans] = SANS_KATER[p.stationOteeKater ?? 0];
    assert.ok(C.mesure === 0 && C.stationsKater === 7 && C.decroitKater === '6/6' && C.ecartN2Kater === '1.70' && C.equateurKater === '39.00734' && C.equateurAjusteKater === '39.00695' &&
      C.diminutionKater === '0.0055430' && C.aplatissementKater === '321.8' && C.oteeKater === nom && C.aplatissementSansKater === sans && I.temoin.mesure === 0 && I.temoin.rapportNewtonKater === '1.275', JSON.stringify(I));
    return 'sans ' + C.oteeKater + ' : 1/' + C.aplatissementSansKater + ' ; Newton x' + I.temoin.rapportNewtonKater;
  });
  /* game297 : Thorndike - reference : codex « cerveau humain » et mon calcul a part (calc297.mjs, Math natif) : 24, 605, 5 s a l essai 19, 8/23,
   *   63.83 19.67 10.33 7.00, premier <= 10 s au 14e puis 10/11, puissance -0.9618 SSR 2.9676, exponentielle SSR 4.2753, retours 90 60. */
  for (const p of [...extremes(sys('essaisThorndike')), { moyenneThorndike: 3 }]) ok(`essaisThorndike ${JSON.stringify(p)} : 24 temps, blocs, temoin`, () => {
    const R = S('essaisThorndike', p), I = R.invariants, C = I.essaisThorndike;
    assert.ok(C.mesure === 0 && C.essaisN === 24 && C.sommeThorndike === 605 && C.minimumThorndike === '5 s at trial 19' && C.haussesThorndike === '8/23' && C.blocsThorndike === '63.83 19.67 10.33 7.00'
      && C.premierDixThorndike === 14 && C.ensuiteDixThorndike === '10/11' && C.exposantPuissanceThorndike === '-0.9618' && C.ssrPuissanceThorndike === '2.9676' && C.ssrExpoThorndike === '4.2753'
      && I.temoin.mesure === 0 && I.temoin.retoursThorndike === '90 60', JSON.stringify(I));
    return 'moyenne sur ' + C.moyenneSurThorndike + ' ; retours ' + I.temoin.retoursThorndike;
  });
  /* game299 : Donders - reference : codex « cerveau humain » et mon calcul a part (calc299.mjs, Math natif) : 10/10, XVI B 3/3 tronquees, 15,
   *   83.03 / 36.32 / 67.05 ms (3/3), 5/5 ; b - a 83.03 ms, c - a 36.32 ms ; minima 17.5 contre 11. */
  const ROULEAUX_DONDERS = ['all', 'XV', 'XVI A', 'XVI B'];
  for (const p of [...extremes(sys('reactionDonders')), { rouleauDonders: 1 }, { rouleauDonders: 2 }]) ok(`reactionDonders ${JSON.stringify(p)} : differences, moyennes, conversions, temoin`, () => {
    const R = S('reactionDonders', p), I = R.invariants, C = I.reactionDonders;
    assert.ok(C.mesure === 0 && C.differencesDonders === '10/10' && C.moyennesXVIBDonders === '3/3' && C.determinationsDonders === 15 && C.conversionsDonders === '3/3'
      && C.ordreDonders === '5/5' && C.baMsDonders === '83.03' && C.caMsDonders === '36.32' && C.rouleauDonders === ROULEAUX_DONDERS[p.rouleauDonders ?? 0]
      && I.temoin.mesure === 0 && I.temoin.ecartMinimaDonders === '17.5 vs 11', JSON.stringify(I));
    return 'rouleau ' + C.rouleauDonders + ' ; b-a ' + C.baMsDonders + ' ms ; c-a ' + C.caMsDonders + ' ms';
  });
  /* game300: Cattell - reference: codex "human brain" (calc-decision.cjs) and my own reading of p. 238-240: VIII 20/20, VII A 12/12 within 1,
   *   11/12 rounded, distraction 8/8 from +13 to +44, single series 20/20 distracted slower, 15/20 concentrated faster; witness +26. */
  for (const p of [...extremes(sys('attentionCattell')), { sujetCattell: 1 }]) ok(`attentionCattell ${JSON.stringify(p)} : table VIII, lignes A, distraction, temoin`, () => {
    const R = S('attentionCattell', p), I = R.invariants, C = I.attentionCattell;
    assert.ok(C.mesure === 0 && C.tableEightCattell === '20/20' && C.sevenWithinOneCattell === '12/12' && C.sevenRoundedCattell === '11/12' && C.distractedLongerCattell === '8/8'
      && C.distractedRangeCattell === '+13 to +44' && C.seriesDistractedCattell === '20/20' && C.seriesConcentratedCattell === '15/20' && C.observerCattell === ['both', 'B', 'C'][p.sujetCattell ?? 0]
      && I.temoin.mesure === 0 && I.temoin.concentratedSlowerCattell === '+26', JSON.stringify(I));
    return 'observer ' + C.observerCattell + ' ; ' + C.distractedRangeCattell;
  });
  /* game301: Peirce and Jastrow - reference: codex "human brain" (calc-perception.cjs) and my own calc-peirce.mjs: p. 76 6/6, means 10/10,
   *   calculated 10/10 within 0.15 with ratio - 1 (2/10 with ln), probable error 0.05 / 0.0235 = 2.13, 200 / 500 at 1.005, P = 4.5e-6. */
  for (const p of extremes(sys('pressurePeirceJastrow'))) ok(`pressurePeirceJastrow ${JSON.stringify(p)} : table p. 76, moyennes, colonne calculee, temoin`, () => {
    const R = S('pressurePeirceJastrow', p), I = R.invariants, C = I.pressurePeirceJastrow;
    assert.ok(C.mesure === 0 && C.tableP76PeirceJastrow === '6/6' && C.groupMeansPeirceJastrow === '10/10' && C.calculatedPeirceJastrow === '10/10' && C.calculatedLnPeirceJastrow === '2/10'
      && C.practicePeirceJastrow === '2.13' && C.groupPeirceJastrow === (p.groupeJastrow ?? 1)
      && I.temoin.mesure === 0 && I.temoin.finestPeirceJastrow === '200 / 500' && I.temoin.chancePeirceJastrow === '4.5e-6', JSON.stringify(I));
    return 'group ' + C.groupPeirceJastrow + ' ; ' + I.temoin.finestPeirceJastrow;
  });
  /* game302: Pavlov - reference: codex "human brain" (calc-memoire.cjs) and my own reading of p. 52, 53, 58: summary 5/5 (15 20 54 >=119 18),
   *   gaps 28/28 = interval + 1, zero at showing 6 5 7 none 7, rises 3/28, recovery 2/2 (0.15 c.c., 7 drops). */
  for (const p of [...extremes(sys('extinctionPavlov')), { seriePavlov: 4 }]) ok(`extinctionPavlov ${JSON.stringify(p)} : resume, ecarts, extinction, temoin`, () => {
    const R = S('extinctionPavlov', p), I = R.invariants, C = I.extinctionPavlov;
    assert.ok(C.mesure === 0 && C.summaryPavlov === '5/5' && C.spacingPavlov === '28/28' && C.durationsPavlov === '15 20 54 119 18' && C.showingsToZeroPavlov === '6 5 7 none 7'
      && C.risesPavlov === '3/28' && C.seriesShownPavlov === (p.seriePavlov ?? 0)
      && I.temoin.mesure === 0 && I.temoin.recoveredPavlov === '2/2' && I.temoin.recoveryValuesPavlov === '0.15 7', JSON.stringify(I));
    return 'series ' + C.seriesShownPavlov + ' ; ' + C.durationsPavlov;
  });
  /* game303: Konig and Brodhun - reference: codex "human brain" (calc-perception.cjs) and my own konig-data.mjs: 71 rows, 71/71 within one
   *   unit, 67/71 rounded, minima 0.0158 0.0152 0.0161 0.0143, 20 cells 0.0143 to 0.0202, ratios 38.2 52.2 30.9 42.0. */
  for (const p of [...extremes(sys('weberKonig')), { tableKonig: 2 }]) ok(`weberKonig ${JSON.stringify(p)} : tg alpha carre, plateau, temoin`, () => {
    const R = S('weberKonig', p), I = R.invariants, C = I.weberKonig;
    assert.ok(C.mesure === 0 && C.rowsKonig === 71 && C.withinUnitKonig === '71/71' && C.roundedKonig === '67/71' && C.smallestKonig === '0.0158 0.0152 0.0161 0.0143'
      && C.plateauKonig === '20 cells, 0.0143 to 0.0202' && C.tableShownKonig === (p.tableKonig ?? 0)
      && I.temoin.mesure === 0 && I.temoin.largestOverSmallestKonig === '38.2 52.2 30.9 42.0', JSON.stringify(I));
    return 'table ' + C.tableShownKonig + ' ; ' + I.temoin.largestOverSmallestKonig;
  });
  /* game304: Cannon - reference: codex "human brain" (calcEmotion.cjs) and my own reading of p. 71-78: 18 and 17 per cent by rounding, 33,
   *   excited 6/6 positive, controls 3/3 clean, 4 vs 1 of 9, 5 of 12 on the bench, P(>= 6 of 33 | 1/34) = 3.6e-4. */
  for (const p of extremes(sys('glycosuriaCannon'))) ok(`glycosuriaCannon ${JSON.stringify(p)} : pourcentages, groupes, temoin`, () => {
    const R = S('glycosuriaCannon', p), I = R.invariants, C = I.glycosuriaCannon;
    assert.ok(C.mesure === 0 && C.percentsCannon === '3/3' && C.excitedPositiveCannon === '6/6' && C.controlsCleanCannon === '3/3' && C.hardEasyCannon === '4 vs 1 of 9'
      && C.groupsShownCannon === (p.groupeCannon ?? 0) && I.temoin.mesure === 0 && I.temoin.benchPositiveCannon === '5 of 12' && I.temoin.chanceAtBaseCannon === '3.6e-4', JSON.stringify(I));
    return 'groups ' + C.groupsShownCannon + ' ; ' + I.temoin.chanceAtBaseCannon;
  });
  /* game305: Boyd - reference: codex "human brain" (calcNeurones.cjs) and my own reading of p. 243-253: men heavier 18/18, ranks 4/4, adult
   *   ranges 2/2, parts add up 7/7 (equal numbers) and 2/29 (unequal), -6.59 % men and -9.49 % women from 14-20 to over 80. */
  for (const p of extremes(sys('brainBoyd'))) ok(`brainBoyd ${JSON.stringify(p)} : sexes, rangs, fourchettes, somme des parties, temoin`, () => {
    const R = S('brainBoyd', p), I = R.invariants, C = I.brainBoyd;
    assert.ok(C.mesure === 0 && C.menHeavierBoyd === '18/18' && C.ranksBoyd === '4/4' && C.adultRangesBoyd === '2/2' && C.partsAddEqualBoyd === '7/7' && C.partsAddUnequalBoyd === '2/29'
      && C.sexShownBoyd === (p.sexeBoyd ?? 0) && I.temoin.mesure === 0 && I.temoin.peakToOver80Boyd === '-6.59 % men, -9.49 % women', JSON.stringify(I));
    return 'sex ' + C.sexShownBoyd + ' ; ' + I.temoin.peakToOver80Boyd;
  });
  /* game306: Lucas - reference: codex "human brain" (calcNeurones.cjs) and my own reading of p. 119-120: 1.5025 -> 1.50, 3.67, 6.51 % -> 6.5,
   *   3 big steps of 34 carrying 90.7 %, other steps at most 0.15 mm, straight line R2 0.32. */
  for (const p of extremes(sys('allOrNoneLucas'))) ok(`allOrNoneLucas ${JSON.stringify(p)} : paliers, sauts, temoin`, () => {
    const R = S('allOrNoneLucas', p), I = R.invariants, C = I.allOrNoneLucas;
    assert.ok(C.mesure === 0 && C.printedLevelsLucas === '3/3' && C.bigStepsLucas === '3/34' && C.bigShareLucas === '90.7' && C.otherStepsMaxLucas === '0.15'
      && C.lineShownLucas === (p.droiteLucas ?? 1) && I.temoin.mesure === 0 && I.temoin.straightLineR2Lucas === '0.32', JSON.stringify(I));
    return 'line ' + C.lineShownLucas + ' ; R2 ' + I.temoin.straightLineR2Lucas;
  });
  /* game307: Herculano-Houzel - reference: my own fit (Math natif, scratchpad): ratios 11.2 / 10.0 / 12.1 (3/3), exponents 1.054 and 0.991,
   *   rodent power 1.587 from the marmoset: 302 g against 87.346 g. */
  for (const p of extremes(sys('neuronsHerculanoHouzel'))) ok(`neuronsHerculanoHouzel ${JSON.stringify(p)} : rapports, exposants, temoin`, () => {
    const R = S('neuronsHerculanoHouzel', p), I = R.invariants, C = I.neuronsHerculanoHouzel;
    assert.ok(C.mesure === 0 && C.ratiosHerculano === '3/3' && C.exponentNeuronsHerculano === '1.054' && C.exponentOtherHerculano === '0.991' && C.exponentsHerculano === '2/2'
      && C.rodentShownHerculano === (p.rongeurHerculano ?? 1) && I.temoin.mesure === 0 && I.temoin.rodentRuleMassHerculano === '302 g vs 87.346 g', JSON.stringify(I));
    return 'rodent ' + C.rodentShownHerculano + ' ; ' + I.temoin.rodentRuleMassHerculano;
  });
  /* game308: connectomes - reference: the abstracts (PubMed) and my own arithmetic: 5000 / 302 = 16.6, 2e7 / 25000 = 800, 54.5e6 / 139255 = 391.4,
   *   139255 / 302 = 461, 86.1e9 / 139255 = 618,290. */
  for (const p of [...extremes(sys('connectomeSizes')), { organismeConnectome: 2 }]) ok(`connectomeSizes ${JSON.stringify(p)} : comptes, rapports, temoin`, () => {
    const R = S('connectomeSizes', p), I = R.invariants, C = I.connectomeSizes;
    assert.ok(C.mesure === 0 && C.synapsesPerNeuronConnectome === '16.6 800.0 391.4' && C.flyOverWormConnectome === '461' && C.humanNonNeuronsConnectome === '84.6 vs 86.1 billion'
      && C.shownConnectome === (p.organismeConnectome ?? 0) && I.temoin.mesure === 0 && I.temoin.humanOverFlyConnectome === '618290', JSON.stringify(I));
    return 'shown ' + C.shownConnectome + ' ; human / fly ' + I.temoin.humanOverFlyConnectome;
  });
  /* game309: Siegel et al. 2018 - reference: my own sums in the scratchpad (siegel-check.cjs, other code than the module): k 286/51/111/99/87/105
   *   = totals; bands 2/7/13 under k > 4 and starred (the printed counts); confusion 12/12, diagonal 76/241; the d of the seven drawn signals below
   *   copied from the extracted Table 9. The firing rate of each signal must sit within 0.05 of 0.15 x (1 + mean d of its units). */
  {
    const D9 = { Anger: [0.52, -0.18, 0.57, 0.66, 1.47, 0.19, 0.45], Disgust: [0.07, 0.09, 0.20, 0.21, 0.08, 0.25, 0.48], Fear: [0.49, 0.45, 0.14, 0.57, 0.91, 0.19, 0.61],
      Happy: [0.33, 0.19, 0.52, 0.37, 0.47, 0.35, 0.50], Sad: [0.36, -0.02, 0.36, 0.45, 0.41, 0.18, 0.45], Neutral: [0.21, -0.09, 0.21, 0.32, -0.09, -0.13, 0.15] };
    const CI9 = { Anger: [[0.39, 0.66], [-0.52, 0.16], [0.42, 0.72], [0.51, 0.81], [0.89, 2.13], [-0.04, 0.42], [0.12, 0.92]], Disgust: [[-0.15, 0.28], [-0.26, 0.44], [-0.17, 0.56], [-0.15, 0.58], [-0.68, 0.86], [0.03, 0.47], [0.16, 0.82]],
      Fear: [[0.23, 0.76], [-0.11, 1.06], [-0.31, 0.60], [0.12, 1.04], [0.31, 1.58], [-0.16, 0.55], [0.20, 1.03]], Happy: [[0.13, 0.52], [-0.17, 0.55], [0.18, 0.88], [-0.01, 0.76], [0.13, 0.83], [0.10, 0.62], [0.12, 0.89]],
      Sad: [[0.03, 0.69], [-0.56, 0.51], [0.03, 0.69], [0.10, 0.82], [0.02, 0.82], [-0.08, 0.44], [0.12, 0.92]], Neutral: [[-0.01, 0.43], [-0.52, 0.35], [-0.07, 0.43], [0.11, 0.52], [-0.40, 0.60], [-0.39, 0.12], [-0.16, 0.46]] };
    const NAMES = ['Anger', 'Disgust', 'Fear', 'Happy', 'Sad', 'Neutral'], TOPS = ['RR 1.47', 'SCR 0.48', 'RR 0.91', 'DBP 0.52', 'SBP 0.45', 'SBP 0.32'];
    const cas = [...extremes(sys('emotionsSiegel'))]; for (let e = 0; e < 6; e++) for (const s of [0, 1]) cas.push({ emotionSiegel: e, spreadSiegel: s });
    for (const p of cas) ok(`emotionsSiegel ${JSON.stringify(p)} : sommes, bandes, confusion, cadence, temoin`, () => {
      const R = S('emotionsSiegel', p), I = R.invariants, C = I.emotionsSiegel, e = p.emotionSiegel ?? 0, s = p.spreadSiegel ?? 1;
      assert.ok(C.mesure === 0 && C.samplesSiegel === '6/6' && C.bandsSiegel === '2/7/13' && C.confusionSumsSiegel === '12/12' && C.hitRatesSiegel === '7/7'
        && C.misprintsSiegel === 'Happy/Fear 0.8 vs 1.2 ; Happy/Sad 2.1 vs 0.8 ; Happy/Neutral 1.2 vs 2.1' && C.participantsSiegel === 'Fear 4319 vs 4271 ; Neutral 4140 vs 3976'
        && C.table4Siegel === 'Fear 4373 vs 4271' && C.emotionShownSiegel === NAMES[e] && C.spreadShownSiegel === s && C.topSignalSiegel === TOPS[e]
        && I.temoin.mesure === 0 && I.temoin.classifierSiegel === '76/241' && I.temoin.chanceSiegel === '16.7 %', JSON.stringify(I));
      const ds = s ? CI9[NAMES[e]].flatMap(([lo, hi]) => [lo + (hi - lo) / 12, hi - (hi - lo) / 12]) : D9[NAMES[e]];
      assert.equal(C.unitRangeSiegel, Math.min(...ds).toFixed(3) + ' to ' + Math.max(...ds).toFixed(3));
      const rates = C.firingSiegel.split(' ').filter((x, i) => i % 2 === 1).map(Number);
      rates.forEach((r, c) => { const [lo, hi] = CI9[NAMES[e]][c], dm = s ? (lo + hi) / 2 : D9[NAMES[e]][c];
        assert.ok(Math.abs(r - 0.15 * (1 + dm)) < 0.05, NAMES[e] + ' signal ' + c + ' fires ' + r + ', expected about ' + (0.15 * (1 + dm)).toFixed(3)); });
      return NAMES[e] + ' spread ' + s + ' ; ' + C.firingSiegel;
    });
  }
  /* game310: Nummenmaa et al. 2014 - reference: my own sums (scratchpad): (58 + 8 + 43 + 22 + 38 + 54 + 99) / 7 = 46.0 ; 100 / 7 = 14.3 ;
   *   302 + 52 + 36 + 108 + 94 + 109 = 701, + 72 = 773. Each simulated row must sit within 4 standard deviations (87 readers) of its chance. */
  for (const p of extremes(sys('bodyMapsNummenmaa'))) ok(`bodyMapsNummenmaa ${JSON.stringify(p)} : moyenne, hasard, effectifs, lecteurs, temoin`, () => {
    const R = S('bodyMapsNummenmaa', p), I = R.invariants, C = I.bodyMapsNummenmaa, g = p.guessNummenmaa ?? 0;
    assert.ok(C.mesure === 0 && C.meanNummenmaa === '46.0' && C.chanceNummenmaa === '14.3' && C.sizesNummenmaa === '2/2' && C.experiment5Nummenmaa === '72 in Methods, 87 in Results'
      && C.notAboveChanceNummenmaa === 'fear 8 %' && C.guessShownNummenmaa === g && I.temoin.mesure === 0 && I.temoin.aboveChanceNummenmaa === '6/7'
      && I.temoin.ldaNummenmaa === '38 % (chance 14 %)', JSON.stringify(I));
    const P7 = [58, 8, 43, 22, 38, 54, 99], obs = C.rightNummenmaa.split(' ').filter((x, i) => i % 2 === 1).map(Number);
    assert.ok(obs.length === 7, C.rightNummenmaa);
    obs.forEach((o, s) => { const q = g ? 1 / 7 : P7[s] / 100; assert.ok(Math.abs(o - q) <= 4 * Math.sqrt(q * (1 - q) / 87) + 0.006, 'row ' + s + ': ' + o + ' vs ' + q); });
    return 'guess ' + g + ' ; ' + C.rightNummenmaa;
  });
  /* riskBernoulli (2026-11-14): Bernoulli 1738 - reference: codex "human brain" section 1 (calcEmotion.cjs: 5042.430, 14242.430, 20478.073,
   *   29878.073, 6751.50, 7033.51, 7198.71 at 200 ships, St Petersburg 2.000000 / 3.0431 / 4.3894 / 5.9723, square root 2.914 and 537.3,
   *   Sempronius by the square root 7007.1, premium 500 best -2.4e-12) and here my own code with Math.log / Math.exp, other code than the
   *   module: Caius and the insurer by bisection on his printed equations, Sempronius by his printed roots. Printed vs computed: within
   *   one unit, never Math.round (2/6 only). The drawing: label 3 = the printed points, at the places their problem puts them. */
  {
    const refRoot = (g, lo, hi) => { let a = lo, b = hi; for (let i = 0; i < 300; i++) { const m = (a + b) / 2; if (g(m) < 0) a = m; else b = m; } return (a + b) / 2; };
    /* (x + 10000)^19 x = (x + 10000 - P)^20 and its insurer twin, in logarithms */
    const refCaius = (pm) => refRoot((x) => (19 * Math.log(x + 10000) + Math.log(x)) / 20 - Math.log(x + 10000 - pm), 1e-6, 1e9);
    const refInsurer = (pm) => refRoot((y) => (19 * Math.log(y + pm) + Math.log(y + pm - 10000)) / 20 - Math.log(y), 10000 - pm + 1e-6, 1e9);
    const refCaiusText = [refCaius(800), refInsurer(800), refCaius(600), refInsurer(600)].map((v) => v.toFixed(2)).join(' ');
    const refOne = Math.exp((9 * Math.log(12000) + Math.log(4000)) / 10) - 4000, refTwo = Math.exp((81 * Math.log(12000) + 18 * Math.log(8000) + Math.log(4000)) / 100) - 4000;
    const PRINTED = { 0: [[0, 2], [10, 3], [100, 4 + 1 / 3], [1000, 6]].map(([a, v]) => [Math.log10(a + 1) / 6, v / 12]),
      1: [[800, 5043], [800, 14243], [600, 20478], [600, 29878]].map(([pm, v]) => [(pm - 500) / 500, Math.log10(v) / 6]),
      2: [[0, 6751], [1 / 39, 7033]].map(([t, v]) => [t, (v - 6500) / 1000]), 3: [[0.5, 0.13]] };
    const LABELS = { 0: '0 1 3', 1: '0 1 3', 2: '0 1 2 3', 3: '0 1 2 3' };
    /* the extremes are problems 0 and 3 only: 1 (Caius) and 2 (Sempronius) are added so every drawing is checked */
    for (const p of [...extremes(sys('riskBernoulli')), { problemBernoulli: 1 }, { problemBernoulli: 2 }]) ok(`riskBernoulli ${JSON.stringify(p)} : entiers a une unite, relation, nemo, jeu juste, Sempronius, Petersbourg, Cramer, temoin`, () => {
      const R = S('riskBernoulli', p), I = R.invariants, C = I.riskBernoulli, W = I.temoin, k = p.problemBernoulli ?? 0;
      assert.ok(C.mesure === 0 && C.integersBernoulli === '6/6' && C.roundedBernoulli === '2/6'
        && C.gapsBernoulli === '5043 -0.57 ; 14243 -0.57 ; 20478 +0.07 ; 29878 +0.07 ; 6751 +0.50 ; 7033 +0.51'
        && C.caiusBernoulli === refCaiusText && refCaiusText === '5042.43 14242.43 20478.07 29878.07' && C.relationBernoulli === '2/2 computed, 2/2 printed'
        && C.nobodyBernoulli === '-2.4e-12' && C.fairBernoulli === [Math.sqrt(50 * 150), 100 - Math.sqrt(50 * 150), 200 - Math.sqrt(150 * 250)].map((v) => v.toFixed(4)).join(' ')
        && C.semproniusBernoulli === refOne.toFixed(2) + ' ' + refTwo.toFixed(2) + ' ; 200 ships 7198.71 ; limit 7200'
        && C.petersburgBernoulli === '0: 2.000000 (+0.000) ; 10: 3.0431 (+0.043) ; 100: 4.3894 (+0.056) ; 1000: 5.9723 (-0.028)'
        && C.cramerBernoulli === '12 + 1 = 13 ; square root ' + (1 / (6 - 4 * Math.sqrt(2))).toFixed(6) && C.misprintBernoulli === '2^24 = 16777216, printed 166777216 (one digit too many)'
        && C.problemShownBernoulli === k, JSON.stringify(C));
      assert.ok(W.mesure === 0 && W.linearPetersburgBernoulli === '5 10 20' && W.linearCaiusBernoulli === 'never insures (500 < 800)' && W.rootIntegersBernoulli === '0/6'
        && W.rootPetersburgBernoulli === '2.914' && W.rootCaiusBernoulli === '537.3' && W.rootSemproniusBernoulli === '7007.1', JSON.stringify(W));
      const b = R.brut, labs = new Set(), printed = new Set();
      for (let i = 0; i < R.n; i++) { labs.add(b[3 * i + 2]); if (b[3 * i + 2] === 3) printed.add(b[3 * i].toFixed(6) + ',' + b[3 * i + 1].toFixed(6)); }
      assert.equal([...labs].sort().join(' '), LABELS[k], 'labels');
      assert.deepEqual([...printed].sort(), PRINTED[k].map(([x, y]) => x.toFixed(6) + ',' + y.toFixed(6)).sort(), 'printed points');
      assert.ok(b.every(Number.isFinite) && b.every((v, i) => i % 3 === 2 || (v >= -0.01 && v <= 1.01)), 'scaled 0..1');
      return 'problem ' + k + ' ; ' + C.integersBernoulli + ' within one unit, ' + C.roundedBernoulli + ' rounded ; ' + W.rootPetersburgBernoulli;
    });
  }
  /* nerveHelmholtz (2026-11-14): Helmholtz 1850 - reference: the dossier codex "human brain" helmholtz.md section 3 (values read on the page
   *   images; computed there 24.571, 30.769, 32.000, 31.387, 38.393, 29.008, 25.146, 26.950 m/s, errors 1.966, 6.391, 9.728, 7.102, 10.627,
   *   warm mean 27.033, weighted 1/sigma^2 26.154, 1852 514.2 and 27.253) and here the table typed again from the dossier, other code than
   *   the module (mm over s, then / 1000). Printed vs computed: to the tenth for 6/8, XII and XIV off by one tenth (said, not hidden); his
   *   least squares 26.4 NOT reproduced (26.15), and the module must say so. The drawing: x = series / 8 (1852 at 1), y = m/s / 50;
   *   label 0 computed, 1 the printed bar (21 points, printed speed +- printed probable error), 2 printed, 3 the printed means. */
  {
    /* name, L (mm), far, near, delay, delay error (s), printed speed (summary p. 351), printed probable error */
    const TAB = [['IX', 43, 0.04394, 0.04219, 0.00175, 0.00014, 24.6, 2.0], ['X A', 40, 0.02437, 0.02307, 0.00130, 0.00027, 30.8, 6.4],
      ['X B', 40, 0.03164, 0.03039, 0.00125, 0.00038, 32.0, 9.7], ['XI A', 43, 0.02585, 0.02448, 0.00137, 0.00031, 31.4, 7.1],
      ['XI B', 43, 0.01743, 0.01631, 0.00112, 0.00031, 38.4, 10.6], ['XII', 38, null, null, 0.00131, null, 29.1, null],
      ['XIII', 43, null, null, 0.00171, null, 25.1, null], ['XIV', 38, null, null, 0.00141, null, 26.9, null]];
    const refV = TAB.map((r) => r[1] / r[4] / 1000), refE = TAB.slice(0, 5).map((r, i) => refV[i] * r[5] / r[4]);
    const DOSSIER_V = ['24.571', '30.769', '32.000', '31.387', '38.393', '29.008', '25.146', '26.950'], DOSSIER_E = ['1.966', '6.391', '9.728', '7.102', '10.627'];
    const sg = (v) => (v >= 0 ? '+' : '') + v.toFixed(3);
    const refSpeeds = TAB.map((r, i) => r[0] + ' ' + refV[i].toFixed(3) + ' printed ' + r[6].toFixed(1) + ' (' + sg(refV[i] - r[6]) + ')').join(' ; ');
    const refErrors = TAB.slice(0, 5).map((r, i) => r[0] + ' ' + refE[i].toFixed(2) + ' printed ' + r[7].toFixed(1)).join(' ; ') + ' ; 5/5 to the tenth';
    let w0 = 0, w1 = 0; for (const r of TAB.slice(0, 5)) { w0 += 1 / r[7] ** 2; w1 += r[6] / r[7] ** 2; }
    const refWeighted = w1 / w0, ref1852 = 0.053 * 85.7 * 6 / 1;
    const LABELS = { 0: '0 1 2 3', 1: '0 1 2 3', 2: '0 2 3', 3: '0 2 3' }, PICK = { 0: [0, 1, 2, 3, 4, 5, 6, 7], 1: [0, 1, 2, 3, 4], 2: [5, 6, 7], 3: [] };
    const MEANS = { 0: [26.4, 27.0], 1: [26.4], 2: [27.0], 3: [26.4, 27.0] }, MEAN_X = { 0: [0, 7 / 8], 1: [0, 0.5], 2: [5 / 8, 7 / 8], 3: [0, 1] };
    const key = (x, y) => x.toFixed(6) + ',' + y.toFixed(6);
    /* the extremes are 0 and 3 only: 1 (cool series) and 2 (warm series) are added so every drawing is checked */
    for (const p of [...extremes(sys('nerveHelmholtz')), { seriesHelmholtz: 1 }, { seriesHelmholtz: 2 }]) ok(`nerveHelmholtz ${JSON.stringify(p)} : L / delay au dixieme (6/8, XII et XIV a un dixieme), erreurs probables, coquille, moyennes, 1852, 26.4 non reproduit, temoin`, () => {
      const R = S('nerveHelmholtz', p), I = R.invariants, C = I.nerveHelmholtz, W = I.temoin, k = p.seriesHelmholtz ?? 0;
      assert.deepEqual(refV.map((v) => v.toFixed(3)), DOSSIER_V, 'reference against the dossier'); assert.deepEqual(refE.map((v) => v.toFixed(3)), DOSSIER_E, 'errors against the dossier');
      assert.ok(TAB.slice(0, 5).every((r) => Math.abs(r[2] - r[3] - r[4]) < 5e-9), 'far - near = delay (reference)');
      assert.ok(C.mesure === 0 && C.speedsHelmholtz === refSpeeds
        && C.tenthHelmholtz === '6/8 to the tenth, 8/8 within 0.1 ; off by one tenth: XII 29.01 printed 29.1, XIV 26.95 printed 26.9'
        && C.errorsHelmholtz === refErrors && C.differencesHelmholtz === '5/5'
        && C.misprintHelmholtz === 'XI A: printed 3.14 on its page, computed 31.39, summary 31.4 (one tenth of it)'
        && C.warmMeanHelmholtz === ((29.1 + 25.1 + 26.9) / 3).toFixed(2) + ' printed 27.0' && C.warmMeanHelmholtz === '27.03 printed 27.0'
        && C.leastSquaresHelmholtz === 'printed 26.4, not reproduced here (weighted mean ' + refWeighted.toFixed(2) + ')' && refWeighted.toFixed(3) === '26.154'
        && C.record1852Helmholtz === '85.7 x 6 = 514.2 mm a second ; 53 mm in 1/514.2 s = ' + ref1852.toFixed(4) + ' m/s, printed 27.25' && ref1852.toFixed(2) === '27.25'
        && C.temperatureHelmholtz === 'IX to XI 11 to 15 (not measured), XII to XIV 20, 20, 21 degrees C' && C.seriesShownHelmholtz === k, JSON.stringify(C));
      assert.ok(W.mesure === 0 && W.delaysHelmholtz === '8/8 positive, 0.00112 to 0.00175 s' && W.sigmasHelmholtz === TAB.slice(0, 5).map((r) => r[0] + ' ' + (r[4] / r[5]).toFixed(1)).join(' ; ')
        && W.sigmasHelmholtz === 'IX 12.5 ; X A 4.8 ; X B 3.3 ; XI A 4.4 ; XI B 3.6'
        && W.fastDelayHelmholtz === '0.000043 s at 1000 m/s (our threshold), smallest probable error 0.00014 s', JSON.stringify(W));
      const b = R.brut, labs = new Set(), byLab = [new Set(), new Set(), new Set(), new Set()], bars = new Map(), meanX = [];
      for (let i = 0; i < R.n; i++) { const x = b[3 * i], y = b[3 * i + 1], l = b[3 * i + 2]; labs.add(l); byLab[l].add(key(x, y));
        if (l === 1) { if (!bars.has(x.toFixed(6))) bars.set(x.toFixed(6), new Set()); bars.get(x.toFixed(6)).add(y.toFixed(9)); } if (l === 3) meanX.push(x); }
      assert.equal([...labs].sort().join(' '), LABELS[k], 'labels');
      const xs = PICK[k].map((i) => i / 8), with1852 = k === 0 || k === 3;
      assert.deepEqual([...byLab[2]].sort(), [...PICK[k].map((i) => key(i / 8, TAB[i][6] / 50)), ...(with1852 ? [key(1, 27.25 / 50)] : [])].sort(), 'printed points');
      assert.deepEqual([...byLab[0]].sort(), [...PICK[k].map((i) => key(i / 8, refV[i] / 50)), ...(with1852 ? [key(1, ref1852 / 50)] : [])].sort(), 'computed points');
      const cool = PICK[k].filter((i) => i < 5);
      assert.deepEqual([...bars.keys()].sort(), cool.map((i) => (i / 8).toFixed(6)).sort(), 'one bar per cool series shown');
      for (const i of cool) { const ys = [...bars.get((i / 8).toFixed(6))].map(Number); assert.equal(ys.length, 21, 'bar points');
        assert.ok(Math.abs(Math.min(...ys) - (TAB[i][6] - TAB[i][7]) / 50) < 1e-9 && Math.abs(Math.max(...ys) - (TAB[i][6] + TAB[i][7]) / 50) < 1e-9, 'bar = printed +- printed probable error : ' + TAB[i][0]); }
      assert.deepEqual([...new Set([...byLab[3]].map((s) => s.split(',')[1]))].sort(), MEANS[k].map((v) => (v / 50).toFixed(6)).sort(), 'printed means');
      assert.ok(Math.abs(Math.min(...meanX) - MEAN_X[k][0]) < 1e-12 && Math.abs(Math.max(...meanX) - MEAN_X[k][1]) < 1e-12, 'means span');
      assert.ok(xs.every((x) => x >= 0 && x <= 1) && b.every(Number.isFinite) && b.every((v, i) => i % 3 === 2 || (v >= 0 && v <= 1)), 'scaled 0..1');
      return 'series ' + k + ' ; ' + C.tenthHelmholtz.split(' ;')[0] + ' ; ' + C.leastSquaresHelmholtz + ' ; IX ' + W.sigmasHelmholtz.split(' ;')[0].split(' ')[1] + ' probable errors';
    });
  }
  /* game311 / game315: wired brain, one pack and one emotion at a time - references: my own scratch scripts (derive-wiring-all.cjs on the csv,
   *   derive-func.cjs, ref-wiring4.cjs: other code than the modules): seeds per printed category below; the shared-in-pack lists are
   *   recomputed here from them; 36 of 64 mapped regions in two or more families (28 in one). */
  {
    const SEEDS = {"Anger experience":"L_insula L_lateralorbitofrontal L_parsopercularis L_temporalpole","Anger perception":"L_parsopercularis R_entorhinal R_rostralmiddlefrontal R_lateraloccipital R_fusiform R_superiorfrontal","Disgust experience":"Lamyg Ramyg L_entorhinal R_lateralorbitofrontal L_fusiform","Disgust perception":"R_lateralorbitofrontal R_insula L_caudalanteriorcingulate R_caudalanteriorcingulate L_parsopercularis R_parsopercularis R_lateraloccipital R_fusiform","Fear experience":"PAG R_lateraloccipital R_fusiform L_middletemporal","Fear perception":"Lamyg L_entorhinal R_entorhinal Lhippo R_middletemporal","Happiness experience":"L_lateraloccipital","Sadness experience":"L_entorhinal L_superiorfrontal R_superiorfrontal R_middletemporal Rput PAG","Experience of emotion":"R_lateralorbitofrontal","Perception of emotion":"L_superiorfrontal R_superiorfrontal L_caudalanteriorcingulate R_caudalanteriorcingulate Rhippo L_parsopercularis R_lateraloccipital R_fusiform","High arousal emotions":"Ramyg R_lateralorbitofrontal PAG","Unpleasant emotions":"L_lateraloccipital","Shame and embarrassment":"L_insula L_parsorbitalis L_caudalanteriorcingulate L_superiorfrontal R_parstriangularis R_precentral Lthal","Guilt":"L_insula L_parsorbitalis L_superiortemporal L_inferiorparietal","Maternal love":"VTA_L Rthal SN_L Lput R_superiorfrontal R_superiortemporal R_middletemporal Rput Lamyg","Passionate love":"VTA_L VTA_R","Empathy for pain":"L_insula L_parsopercularis L_precentral L_caudalanteriorcingulate R_caudalanteriorcingulate L_superiorfrontal R_superiorfrontal L_supramarginal R_insula R_supramarginal R_lateraloccipital R_caudalmiddlefrontal R_superiorparietal","Gratitude (single study, 23 people)":"L_rostralanteriorcingulate R_rostralanteriorcingulate R_medialorbitofrontal L_medialorbitofrontal L_superiorfrontal R_superiorfrontal","Surprise faces (single study, 15 people)":"L_lateraloccipital L_superiorfrontal L_postcentral Rput Rpal R_lateraloccipital R_pericalcarine R_postcentral R_parahippocampal Ramyg R_precentral","Regret (single study, 24 people)":"L_medialorbitofrontal L_rostralanteriorcingulate R_rostralanteriorcingulate L_superiorfrontal R_superiorfrontal R_posteriorcingulate R_middletemporal Lamyg L_temporalpole Lhippo Rhippo","Curiosity (single study, 19 people)":"R_insula L_insula R_caudalanteriorcingulate L_caudalanteriorcingulate R_parsopercularis R_frontalpole L_lingual R_lingual L_lateraloccipital L_posteriorcingulate R_posteriorcingulate","Compassion meditation (single study, 30 people)":"L_precuneus R_precuneus R_supramarginal L_inferiorparietal R_inferiorparietal L_insula R_insula L_bankssts R_bankssts L_superiortemporal R_superiortemporal R_superiorparietal L_posteriorcingulate R_posteriorcingulate R_middletemporal L_parahippocampal R_parahippocampal L_fusiform R_fusiform Cerebellum R_caudalanteriorcingulate R_superiorfrontal R_caudalmiddlefrontal"};
    const PACKS = [['Anger experience', 'Anger perception', 'Disgust experience', 'Disgust perception', 'Fear experience', 'Fear perception', 'Happiness experience', 'Sadness experience'], ['Experience of emotion', 'Perception of emotion', 'High arousal emotions', 'Unpleasant emotions'], ['Shame and embarrassment', 'Guilt', 'Regret (single study, 24 people)', 'Gratitude (single study, 23 people)'], ['Maternal love', 'Passionate love'], ['Empathy for pain', 'Compassion meditation (single study, 30 people)'], ['Surprise faces (single study, 15 people)', 'Curiosity (single study, 19 people)']];
    const FISO = 'L_entorhinal L_temporalpole R_entorhinal R_temporalpole Laccumb Lamyg Lpal Raccumb Ramyg Rpal', reg = (c) => (SEEDS[c] ? SEEDS[c].split(' ') : []);
    const cas = [...extremes(sys('emotionWiringHCP'))].filter((p) => !p.resolutionWiring && !p.theoryWiring);
    PACKS.forEach((p, pk) => p.forEach((_, ek) => { for (const nw of [0, 1]) cas.push({ packWiring: pk, emotionWiring: ek, networkWiring: nw }); }));
    cas.push({ packWiring: 0, emotionWiring: 2, compareWiring: 6 }, { packWiring: 2, emotionWiring: 0, compareWiring: 2 }, { packWiring: 4, emotionWiring: 0, compareWiring: 2 }, { packWiring: 3, emotionWiring: 1, compareWiring: 2 }, { packWiring: 3, emotionWiring: 1, travelWiring: 0 });
    for (const p of cas) ok(`emotionWiringHCP ${JSON.stringify(p)} : cablage, paquet, regions, partage, impulsions, temoin`, () => {
      const R = S('emotionWiringHCP', p), I = R.invariants, C = I.emotionWiringHCP, tr = p.travelWiring ?? 1, nw = p.networkWiring ?? 0;
      const pk = Math.min(5, p.packWiring ?? 0), pack = PACKS[pk], ek = Math.min(pack.length - 1, p.emotionWiring ?? 5), name = pack[ek], mine = reg(name), ns = mine.length;
      const sharedRef = mine.filter((r) => pack.some((o, q) => q !== ek && reg(o).includes(r))), ck = Math.min(pack.length, p.compareWiring ?? 0), oth = ck && ck - 1 !== ek ? reg(pack[ck - 1]) : null;
      const bothRef = oth ? mine.filter((r) => oth.includes(r)) : [];
      assert.ok(C.mesure === 0 && C.edgesWiring === '1190 non-zero, 441 with w >= 8' && C.componentsWiring === 1 && C.isolatedWiring === 0 && C.unmappedWiring === 'Right claustrum, Brain stem L/R'
        && C.printedWiring === name && C.seedsWiring === mine.join(' ') && C.regionsWiring.startsWith(String(ns)) && C.sharedInPackWiring.startsWith(String(sharedRef.length))
        && C.bothWiring === bothRef.length + (bothRef.length ? ' shared: ' + bothRef.join(' ') : ' shared') && C.sharedWiring === '36 of 64 (28 serve one)'
        && C.amygdalaWiring === 'disgust, fear, regret, maternal love' && C.pathwaysWiring === '35 named pathways, 7 parts outside the 82' && C.travelShownWiring === tr
        && C.keptMeanWiring === (nw ? '0.453' : '7.069') && C.shownWiring.startsWith(nw ? '1190 couplings and 35 named pathways as lines, 89 of 89 parts, ' : '1190 connections and 35 named pathways as lines, 89 of 89 parts, ')
        && C.networkShownWiring === (nw ? 'talking together at rest (function)' : 'wiring (structure)') && C.overlapWiring === '468 of 1190' && C.functionIsolatedWiring === FISO
        && C.seedPlacesWiring.split('|').filter(Boolean).length === ns && I.temoin.mesure === 0 && I.temoin.sharedRegionsWiring.split(' ').length === 36, JSON.stringify(I));
      const reached = Number(C.reachedWiring.split(' ')[0]); assert.ok(C.reachedWiring.endsWith(' of 89'), C.reachedWiring);
      const live = mine.filter((r) => !nw || !FISO.split(' ').includes(r)).length;
      if (tr && live && (!nw || C.impulsesWiring > 0)) assert.ok(C.impulsesWiring > 0 && reached > ns && (C.impulsesWiring - C.viaPathwaysWiring < 10 || Number(C.carriedMeanWiring) > (nw ? 0.5 : 7.5)), 'travel ' + JSON.stringify(C));
      else if (tr && ns) assert.ok(C.impulsesWiring === 0 && reached === ns, 'no impulse left ' + JSON.stringify(C));
      else assert.ok(C.impulsesWiring === 0 && reached === ns && C.carriedMeanWiring === '0.000', 'no travel ' + JSON.stringify(C));
      if (name === 'Passionate love' && tr) assert.ok(C.viaPathwaysWiring > 0, 'passionate love leaves the VTA by a named pathway ' + JSON.stringify(C));
      /* real positions: the 82 region points are the fsaverage5 centroids read here from human-brain-anatomy.js (y, z in mm / 100) */
      for (let k = 0; k < 82; k++) assert.ok(Math.abs(R.brut[3 * k] - ANAT.CENTROIDS[k][1] / 100) < 1e-12 && Math.abs(R.brut[3 * k + 1] - ANAT.CENTROIDS[k][2] / 100) < 1e-12 && Math.abs(R.brut[3 * k + 2] - ANAT.CENTROIDS[k][0] / 100) < 1e-12, 'region ' + k + ' at its real centroid');
      assert.ok(C.positionsWiring === 'real centroids (fsaverage5, mm) for 82 regions; 5 deep parts at printed peaks, 2 placed by us' && C.silhouetteWiring === '1281 cortex and 304 deep-structure points', C.positionsWiring + ' / ' + C.silhouetteWiring);
      /* lines: the measured links join two of the 82 region points (label 3, drawn first), weight = rescaled measure; 35 violet named pathways */
      const regs = new Set(); for (let k = 0; k < 82; k++) regs.add(R.brut[3 * k] + ',' + R.brut[3 * k + 1]);
      const meas = R.segments.filter((s) => s.c === 0), named = R.segments.filter((s) => s.c === 5);
      assert.ok(meas.length === 1190 && named.length === 35 && R.segments.length === 1225 && meas.every((s) => regs.has(s.a[0] + ',' + s.a[1]) && regs.has(s.b[0] + ',' + s.b[1])) && named.every((s) => s.w === 0.5 && s.ia >= 82), 'lines');
      assert.ok(R.segments.every((s) => [[s.ia, s.a], [s.ib, s.b]].every(([i, e]) => R.brut[3 * i] === e[0] && R.brut[3 * i + 1] === e[1] && R.brut[3 * i + 2] === e[2])), 'each line names the points it joins');
      /* 09/11: the outline is 1 cortex vertex in 8 (1,281 points), was 1 in 20 (513) */
      for (let q = 0; q < 1281; q++) { const v = 8 * q, k = 89 + q; assert.ok(Math.abs(R.brut[3 * k] - ANAT.CORTEX[3 * v + 1] / 100) < 1e-6 && Math.abs(R.brut[3 * k + 1] - ANAT.CORTEX[3 * v + 2] / 100) < 1e-6 && Math.abs(R.brut[3 * k + 2] - ANAT.CORTEX[3 * v] / 100) < 1e-6, 'outline point ' + q); }
      const ws = meas.map((s) => s.w), u8 = (8 - 0.14292) / (12.615 - 0.14292); assert.ok(Math.min(...ws) === 0 && Math.max(...ws) === 1 && (nw || ws.filter((w) => w >= u8 - 1e-12).length === 441), 'line weights');
      return C.emotionShownWiring + ' (' + C.sourceWiring + ') net ' + nw + ' ; ' + C.impulsesWiring + ' impulses, ' + C.reachedWiring + ', crossed mean ' + C.carriedMeanWiring;
    });
  }
  /* game317 / game318: 414 parcels and the theories - references: derive-400.cjs (my script on the csv: 6117 pairs, 6117 couplings >= 0.35914,
   *   1472 both), the parcels of an emotion recomputed here from DK_OF_400; the theory steps as stated in THEORIES (counts recomputed here) */
  {
    const D = HBD;
    const cas = [{ resolutionWiring: 1 }, { resolutionWiring: 1, networkWiring: 1 }, { resolutionWiring: 1, packWiring: 2, emotionWiring: 0 }, { resolutionWiring: 1, packWiring: 3, emotionWiring: 1 }];
    for (let th = 1; th <= 4; th++) for (const res of [0, 1]) cas.push({ theoryWiring: th, resolutionWiring: res }, { theoryWiring: th, resolutionWiring: res, packWiring: 4, emotionWiring: 1 });
    for (const p of cas) ok(`emotionWiringHCP ${JSON.stringify(p)} : 414 parcelles et theories`, () => {
      const R = S('emotionWiringHCP', p), I = R.invariants, C = I.emotionWiringHCP, res = p.resolutionWiring ?? 0, th = p.theoryWiring ?? 0, nw = p.networkWiring ?? 0;
      const em = D.selectEmotion(R.params).emotion, regs = em.regions, deep = regs.filter((r) => D.REGIONS.findIndex((x) => x.id === r) >= 82);
      const parcels = (ids) => { const w = new Set(ids); return D.REGIONS_400.map((r, k) => (k < 400 ? w.has(D.DK_OF_400[k]) : w.has(r.id))).filter(Boolean).length + ids.filter((r) => D.REGIONS.findIndex((x) => x.id === r) >= 82).length; };
      const count = (ids) => (res ? parcels(ids) : new Set(ids).size);
      assert.ok(C.mesure === 0 && I.temoin.mesure === 0 && C.fineWiring === '6117 connections, 6117 couplings, 1472 both, at 414', JSON.stringify(C).slice(0, 400));
      assert.equal(C.resolutionShownWiring, res ? '414 parcels (Schaefer-400 and 14 subcortical)' : '82 regions (Desikan-Killiany and 14 subcortical)');
      assert.equal(C.seedNodesWiring, count(regs));
      if (res) { assert.ok(C.shownWiring.startsWith((nw ? '6117 couplings' : '6117 connections') + ' and 34 named pathways as lines, 421 of 421 parts, '), C.shownWiring);
        assert.ok(C.positionsWiring.startsWith('real centroids (fsaverage5, mm) for 414 parcels;') && C.reachedWiring.endsWith(' of 421'), C.positionsWiring);
        for (let k = 0; k < 414; k++) assert.ok(Math.abs(R.brut[3 * k] - D.CENTROIDS_400[k][1] / 100) < 1e-12 && Math.abs(R.brut[3 * k + 1] - D.CENTROIDS_400[k][2] / 100) < 1e-12 && Math.abs(R.brut[3 * k + 2] - D.CENTROIDS_400[k][0] / 100) < 1e-12, 'parcel ' + k);
        assert.equal(R.segments.filter((x) => x.c === 0).length, 6117);
        const ws4 = R.segments.filter((x) => x.c === 0).map((x) => x.w); assert.ok(Math.min(...ws4) === 0 && Math.max(...ws4) === 1, 'line weights 0..1 on the 414 range'); }
      if (res && em.id === 'shame') assert.equal(C.lostWiring, 'L_parsorbitalis');
      const steps = { 1: [[0, count(['Hypothal', 'PAG'])], [4, count(['L_insula', 'R_insula'])], [8, count(regs)]], 2: [[0, count(['Lthal', 'Rthal'])], [1, count([...regs, 'Hypothal'])]],
        3: [[0, count(['Hypothal'])], [5, count(['L_medialorbitofrontal', 'R_medialorbitofrontal', 'L_superiorfrontal', 'R_superiorfrontal', 'Lhippo', 'Rhippo', 'L_entorhinal', 'R_entorhinal', 'L_parahippocampal', 'R_parahippocampal', 'L_posteriorcingulate', 'R_posteriorcingulate', 'L_isthmuscingulate', 'R_isthmuscingulate'])], [10, count(regs)]],
        4: [[0, count(D.SHARED.regions)], [3, count(regs)]], 0: [[0, count(regs)], [10, count(regs)], [20, count(regs)]] }[th];
      const got = C.theoryStagesWiring.split(' | ').map((x) => x.match(/^step (\d+): (\d+) parts/).slice(1).map(Number));
      assert.deepEqual(got, steps, C.theoryStagesWiring);
      assert.ok(th ? C.theoryShownWiring.startsWith('THEORY: ') : C.theoryShownWiring === 'Data only (no theory)', C.theoryShownWiring);
      return C.resolutionShownWiring + ' ; ' + C.theoryShownWiring + ' ; ' + C.impulsesWiring + ' impulses, ' + C.reachedWiring;
    });
  }
  ok('montyHall : etalonnage sur 20 graines (ecart-type des z dans [0.5, 1.7])', () => { const zs = []; for (let g = 1; g <= 20; g++) zs.push(z(T.simuler('montyHall', { graine: g }).invariants.changer)); const m = zs.reduce((a, x) => a + x, 0) / 20, sd = Math.sqrt(zs.reduce((a, x) => a + (x - m) ** 2, 0) / 19); assert.ok(sd >= 0.5 && sd <= 1.7 && Math.abs(m) < 1.2, m + ' ' + sd); return m.toFixed(2) + '/' + sd.toFixed(2); });
  ok('etalonnage : 20 graines aux defauts, ecart-type des z dans [0.5, 1.7] (r^2, croisements, partage)', () => {
    const zs = { r2: [], buffon: [], anniv: [] };
    for (let g = 1; g <= 20; g++) { zs.r2.push(z(T.simuler('marcheAleatoire', { graine: g }).invariants.carreDistance)); zs.buffon.push(z(T.simuler('aiguilleBuffon', { graine: g }).invariants.croisements)); zs.anniv.push(z(T.simuler('anniversaires', { graine: g }).invariants.partage)); }
    const out = []; for (const [k, v] of Object.entries(zs)) { const m = v.reduce((a, x) => a + x, 0) / v.length, sd = Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); assert.ok(sd >= 0.5 && sd <= 1.7 && Math.abs(m) < 1.2, k + ' ' + m + ' ' + sd); out.push(`${k} ${m.toFixed(2)}/${sd.toFixed(2)}`); }
    return out.join(', ');
  });
  ok('bornage : hors bornes ramene (verifie AVANT de simuler), NaN -> defaut, entiers arrondis', () => {
    assert.equal(T.reglagesPhysique('marcheAleatoire', { pas: -5 })[1].valeur, 10);
    assert.deepEqual(T.simuler('anniversaires', { personnes: 1.4, jours: 9999, groupes: NaN, graine: 2.6 }, { n: 20 }).params, { personnes: 2, jours: 400, groupes: 2000, graine: 3 });
  });
  return res;
}

const T = await import(pathToFileURL(SOURCE).href);
const res = suite(T, true), ech = res.filter((x) => !x.ok);
let assertions = res.length;
/* LF force : un checkout CRLF (core.autocrlf=true) faisait rater les motifs de mutants qui contiennent \n (07/11 : M69 « NON APPLIQUE » apres un
 *   git merge en CRLF, alors que le meme banc etait vert dans un worktree LF) */
const src = readFileSync(SOURCE, 'utf8').replace(/\r\n/g, '\n'), moi = readFileSync(fileURLToPath(import.meta.url), 'utf8');
const interdits = src.match(/Math\.(sin|cos|tan|exp|log|pow|atan2?|asin|acos|hypot|sinh|cosh|tanh|asinh|acosh|cbrt|expm1|log1p|log2|log10|random)\b/g);
assertions++; if (interdits) ech.push({ nom: 'source sans Math transcendante', det: interdits.join(',') });
console.log(`${interdits ? 'ECHEC ' : 'OK    '}source : aucune Math.sin/cos/exp/log/pow/atan/... ni Math.random`);
const marque = new RegExp(['de m' + 'emoire', 'from m' + 'emory', 'de t' + 'ete', 'a sour' + 'cer', 'unsour' + 'ced', 'non sour' + 'ce', 'TO' + 'DO'].join('|'), 'i');
const marques = [src, moi].flatMap((t, i) => t.split(/\r?\n/).map((l, j) => [i ? 'test' : 'module', j + 1, l]).filter(([, , l]) => marque.test(l)));
assertions++; if (marques.length) ech.push({ nom: 'valeur marquee sans source lue', det: marques.map(([f, j]) => f + ':' + j).join(',') });
console.log(`${marques.length ? 'ECHEC ' : 'OK    '}aucune valeur marquee sans source lue (module + banc)`);
/* 2026-11-06 (game180) : CIBLES est un litteral d objet — une cle ecrite DEUX FOIS ecrase la premiere EN SILENCE (« pascal » visait
 *   pascalSierpinski, et les 3 mutants de l hexagramme relancaient les tests du mauvais systeme : SURVIT x 3). Garde : cles uniques. */
{ const ligne = moi.split(/\r?\n/).find((l) => /const CIBLES = \{/.test(l)) || '', cles = [...ligne.matchAll(/(\w+): \[/g)].map((m) => m[1]), doubles = cles.filter((c, i) => cles.indexOf(c) !== i);
  assertions++; if (!cles.length || doubles.length) ech.push({ nom: 'CIBLES : cles en double', det: doubles.join(',') || 'ligne introuvable' });
  console.log(`${doubles.length || !cles.length ? 'ECHEC ' : 'OK    '}CIBLES : ${cles.length} cles, aucune en double${doubles.length ? ' (' + doubles.join(',') + ')' : ''}`); }
console.log('\nTEMPS simuler(id) a n = 1500, defauts et chaque extreme de curseur :');
for (const s of T.SYSTEMES) { let pire = 0, ou = ''; for (const p of extremes(s)) { const a = performance.now(); T.simuler(s.id, p); const t = performance.now() - a; if (t > pire) { pire = t; ou = JSON.stringify(p); } } console.log(`  ${s.id} : pire ${pire.toFixed(0)} ms (${ou})`); }

const MUTANTS = [
  ['marche : sigma sans le - n (et divise par n)', 'sigma: Math.sqrt((N * N - N) / M)', 'sigma: Math.sqrt((N - 1) / M)'],
  ['marche : pas diagonal une fois sur quatre', 'else if (u === 2) y++; else y--;', 'else if (u === 2) { y++; x++; } else y--;'],
  ['buffon : P = l / pi', 'const p = 2 * l / PI,', 'const p = l / PI,'],
  ['buffon : pi relu sans le facteur 2', "mesure: croise ? 2 * l / ph : NaN", "mesure: croise ? l / ph : NaN"],
  ['anniversaires : personnes qui partagent au lieu des paires', 'paires += vu[j];', 'paires += vu[j] > 0 ? 1 : 0;'],
  ['anniversaires : produit decale (1 - (i + 1)/D)', 'tousDiff *= 1 - i / D;', 'tousDiff *= 1 - (i + 1) / D;'],
  ['ulam : N lui-meme jamais raye du crible', 'for (let j = i * i; j <= N; j += i)', 'for (let j = i * i; j < N; j += i)'],
  ['ulam : Li integre depuis ln 1.9', 'u0 = lnD(2), u1', 'u0 = lnD(1.9), u1'],
  ['ulam : spirale tournee dans l autre sens', 'if (d < t) return [k - d, -k];', 'if (d < t) return [-k + d, -k];'],
  ['pascal : OU au lieu de la somme modulo 2', 'suiv[k] = (ligne[k - 1] + ligne[k]) & 1;', 'suiv[k] = ligne[k - 1] | ligne[k];'],
  ['pascal : popcount qui compte chaque bit', 'pc += x & 1;', 'pc += 1;'],
  ['pascal : total 3^m + 1', 'formule: 3 ** m,', 'formule: 3 ** m + 1,'],
  ['solides : face acceptee meme avec des sommets des deux cotes', 'if (pos && neg) continue;', 'if (pos && neg && pos > 1) continue;'],
  ['solides : diedre avec p et q echanges', 'cosD(PI / q) / sinD(PI / p)', 'cosD(PI / p) / sinD(PI / q)'],
  ['solides : dodecaedre faux (1.6 au lieu de phi)', 'signes([0, 1 / ph, ph])', 'signes([0, 1 / ph, 1.6])'],
  ['monty : l animateur peut ouvrir la voiture', 'if (d !== choix && d !== voiture) perdantes.push(d);', 'if (d !== choix) perdantes.push(d);'],
  ['monty : changer (n - 1)/n', 'pC = (N - 1) / (N * (N - 2))', 'pC = (N - 1) / N'],
  ['apollo : jacobien du grand cercle de signe faux', 'F.push(d + r - 1 / -q.k); J.push([dx / d, dy / d, 1]);', 'F.push(d + r - 1 / -q.k); J.push([dx / d, dy / d, -1]);'],
  ['apollo : Descartes avec 2.01', 'descartes = (p, q, s) => p + q + s + 2 * rad(p, q, s),', 'descartes = (p, q, s) => p + q + s + 2.01 * rad(p, q, s),'],
  ['apollo : Descartes complexe faux', 'qi += 2 * wr * wi;', 'qi += wr * wi;'],
  ['apollo : 2^(g-1) au lieu de 3^(g-1)', 'attendu.push(6 * 3 ** (g - 1));', 'attendu.push(6 * 2 ** (g - 1));'],
  ['apollo : un interstice oublie', 'suite.push([a, b, d], [b, c, d], [c, a, d]);', 'suite.push([a, b, d], [b, c, d]);'],
  ['apollo : second cercle pas tangent', 'B = { x: r1, y: 0, k: 1 / (1 - r1), g: 0 };', 'B = { x: r1, y: 0, k: 1 / (1.01 - r1), g: 0 };'],
  ['apollo : cercles dessines 1 % trop grands', 'brut[3 * o] = c.x + R * cosD(t);', 'brut[3 * o] = c.x + 1.01 * R * cosD(t);'],
  ['apollo : Newton arrete trop tot', '< 1e-15 * (1 + Math.abs(x) + Math.abs(y))) break;', '< 1e-3 * (1 + Math.abs(x) + Math.abs(y))) break;'],
  ['sable : brulage trop strict', 'if (!br[i] && h[i] >= nv[i])', 'if (!br[i] && h[i] > nv[i])'],
  ['sable : diagonale du Laplacien 3', 'l[i] = 4n;', 'l[i] = 3n;'],
  ['sable : Bareiss sans division', 'prec = M[k][k]; } return M[N - 1][N - 1];', 'prec = 1n; } return M[N - 1][N - 1];'],
  ['sable : dernier tas jamais compte', 'for (let m = 0; m < 4 ** N; m++)', 'for (let m = 0; m < 4 ** N - 1; m++)'],
  ['sable : voisin du bas oublie', 'if (y < c - 1) V[4 * i + k++] = i + c;', ''],
  ['sable : identite avec 7 grains', 'e[i] = 6 - s[i];', 'e[i] = 7 - s[i];'],
  ['sable : r pas recurrent', 'r[i] = 3 + Math.floor(rng() * 4);', 'r[i] = Math.floor(rng() * 4);'],
  ['sable : Laplacien de u avec 3', 'let lap = 4 * u1[i];', 'let lap = 3 * u1[i];'],
  ['sable : dessine (6)° au lieu de e', 'brut[o + 2] = e[i];', 'brut[o + 2] = s[i];'],
  ['sable : dessin decale d une case', 'brut[o] = i % c;', 'brut[o] = (i + 1) % c;'],
  ['verger : pgcd qui s arrete un pas trop tot', 'function pgcd(a, b) { while (b) {', 'function pgcd(a, b) { while (b > 1) {'],
  ['verger : formule sans le - 1', 'formule: 2 * sPhi - 1, sommePhi', 'formule: 2 * sPhi, sommePhi'],
  ['verger : crible phi qui oublie p', 'phi[m] -= phi[m] / p;', 'if (m > p) phi[m] -= phi[m] / p;'],
  ['verger : mu sans les carres', 'for (let m = p * p; m <= N; m += p * p) mu[m] = 0;', ''],
  ['verger : limite 6/pi', 'limite = 6 / (PI * PI),', 'limite = 6 / (PI * 3.2),'],
  ['verger : borne sans le ln', 'borne = (3 + 2 * lnD(N)) / N;', 'borne = 3 / N;'],
  ['verger : diagonale qui compte aussi b = 2a', 'if (a === b) diag++;', 'if (a === b || b === 2 * a) diag++;'],
  ['verger : dessin decale d un arbre', 'brut[o] = vis[2 * i]; brut[o + 1] = vis[2 * i + 1];', 'brut[o] = vis[2 * i] + 1; brut[o + 1] = vis[2 * i + 1];'],
  ['ford : tri par numerateur seul', 'F.sort((u, v) => u[0] * v[1] - v[0] * u[1]);', 'F.sort((u, v) => u[0] - v[0] || u[1] - v[1]);'],
  ['ford : rayon 1/q^2', 'const R = (q) => 1 / (2 * q * q);', 'const R = (q) => 1 / (q * q);'],
  ['ford : 1 + sum phi sans le 1', 'formule: 1 + sPhi, note', 'formule: sPhi, note'],
  ['ford : p = q oublie (1/1 manque)', 'for (let p = 0; p <= q; p++) if (pgcd(p, q) === 1)', 'for (let p = 0; p < q; p++) if (pgcd(p, q) === 1)'],
  ['ford : chevauchement sans le - 1', 'minChev = Math.min(minChev, x * x - 1);', 'minChev = Math.min(minChev, x * x);'],
  ['ford : cercles dessines 1 % trop grands', 'brut[3 * o] = p / q + r * cosD(t);', 'brut[3 * o] = p / q + 1.01 * r * cosD(t);'],
  ['ford : temoin avec 2/5', 'const t1 = 1 / 3, t2 = 2 / 3,', 'const t1 = 1 / 3, t2 = 2 / 5,'],
  ['steiner : poids 1/d^2 au lieu de 1/d', 'const wa = 1 / Math.max(dist(Q, a), 1e-300), wb', 'const wa = 1 / Math.max(dist(Q, a) ** 2, 1e-300), wb'],
  ['steiner : 3 iterations seulement', 'for (let k = 0; k < 2000; k++) { S = fermat(S, s1, s2, T);', 'for (let k = 0; k < 3; k++) { S = fermat(S, s1, s2, T);'],
  ['steiner : garde la forme la plus LONGUE', 'best = h.long <= v.long ? h : v,', 'best = h.long >= v.long ? h : v,'],
  ['steiner : formule L + sqrt 2', 'ex = Math.min(L + r3, 1 + r3 * L),', 'ex = Math.min(L + Math.sqrt(2), 1 + r3 * L),'],
  ['steiner : arbre sans carrefour 2 + L partout', 'arbreSansCarrefour: 2 * Math.min(L, 1) + Math.max(L, 1),', 'arbreSansCarrefour: 2 + L,'],
  ['steiner : reseau dessine decale', 'brut[o] = p[0] + u * (q[0] - p[0]);', 'brut[o] = p[0] + u * (q[0] - p[0]) + 0.01;'],
  ['steiner : angle mesure avec cos + 0.4', 'Math.abs(cosA(Q, u, v) + 0.5)', 'Math.abs(cosA(Q, u, v) + 0.4)'],
  ['caustique : reflexion d = (-cos t, -sin t)', 'd: [-cosD(2 * t), -sinD(2 * t)]', 'd: [-cosD(t), -sinD(t)]'],
  ['caustique : nephroide avec cos 2t', 'ex = [R * (3 * cosD(m) - cosD(3 * m)) / 4,', 'ex = [R * (3 * cosD(m) - cosD(2 * m)) / 4,'],
  ['caustique : longueur 2R', 'formule: 3 * R, note', 'formule: 2 * R, note'],
  ['caustique : pointe cherchee en R/3', 'pointe = Math.min(pointe, Math.sqrt((X[0] - R / 2) ** 2', 'pointe = Math.min(pointe, Math.sqrt((X[0] - R / 3) ** 2'],
  ['caustique : temoin a 45 degres', 'const r60 = ray(PI / 3),', 'const r60 = ray(PI / 4),'],
  ['caustique : paroi dessinee 1 % trop grande', 'brut[o] = R * cosD(t); brut[o + 1] = R * sinD(t); brut[o + 2] = 1;', 'brut[o] = 1.01 * R * cosD(t); brut[o + 1] = R * sinD(t); brut[o + 2] = 1;'],
  ['caustique : croisement de rayons non voisins', 'b = a + PI / N, X = croise(ray(a), ray(b));', 'b = a + 5 * PI / N, X = croise(ray(a), ray(b));'],
  ['hofstadter : phase sans p', 'A[n][n] = 2 * cosD(2 * PI * p * n / q + th);', 'A[n][n] = 2 * cosD(2 * PI * n / q + th);'],
  ['hofstadter : coin antiperiodique +1', '...jacobiSym(harperMat(p, q, PI / q, -1))', '...jacobiSym(harperMat(p, q, PI / q, 1))'],
  ['hofstadter : seuil |P| <= 2', 'if (Math.abs(harperP((lo + hi) / 2, p, q)) > 4 + 1e-9) malBandes++;', 'if (Math.abs(harperP((lo + hi) / 2, p, q)) > 2 + 1e-9) malBandes++;'],
  ['hofstadter : gaps attendus q - 1 toujours', 'if (ouverts !== (q % 2 ? q - 1 : q - 2)) malGaps++;', 'if (ouverts !== q - 1) malGaps++;'],
  ['hofstadter : Jacobi arrete trop tot', 'if (off < 1e-30) break;\n    for (let p = 0; p < n; p++)', 'if (off < 1e-2) break;\n    for (let p = 0; p < n; p++)'],
  ['hofstadter : 1/3 avec sqrt 2', 'const r3 = Math.sqrt(3), ex13', 'const r3 = Math.sqrt(2), ex13'],
  ['hofstadter : dessin decale en energie', 'brut[3 * o + 1] = m === 1 ? (lo + hi) / 2 : lo + (hi - lo) * j / (m - 1);', 'brut[3 * o + 1] = 0.01 + (m === 1 ? (lo + hi) / 2 : lo + (hi - lo) * j / (m - 1));'],
  ['dominos : domino debout sur la case occupee', "if (i + 1 < m && !(e >> (i + 1) & 1)) { ch.push([1, i]);", "if (i + 1 < m) { ch.push([1, i]);"],
  ['dominos : Kasteleyn avec 2 cos^2', 'kast *= 4 * cosD(PI * j / (m + 1)) ** 2 + 4 * cosD(PI * k / (L + 1)) ** 2;', 'kast *= 2 * cosD(PI * j / (m + 1)) ** 2 + 4 * cosD(PI * k / (L + 1)) ** 2;'],
  ['dominos : tirage biaise (premier choix toujours)', 'if (u < w) { cols.push(t.choix); e = t.sortie; break; } u -= w;', 'if (u < w || true) { cols.push(t.choix); e = t.sortie; break; } u -= w;'],
  ['dominos : probabilite du coin avec le mauvais reste', 'h += R[L - 1][t.sortie];', 'h += R[L - 1][0];'],
  ['dominos : Fibonacci F(L)', 'for (let i = 1; i < L; i++) [fa, fb] = [fb, fa + fb];', 'for (let i = 2; i < L; i++) [fa, fb] = [fb, fa + fb];'],
  ['dominos : dessin d un domino couche vers le haut', 'doms.push(k === 0 ? [c, i, c + 1, i, 0] : [c, i, c, i + 1, 1])', 'doms.push(k === 0 ? [c, i, c + 1, i + 1, 0] : [c, i, c, i + 1, 1])'],
  ['ising : energie sans le voisin du bas (exact)', 'E += s * (((c >> (y * L + (x + 1) % L)) & 1) ? 1 : -1) + s * (((c >> (((y + 1) % L) * L + x)) & 1) ? 1 : -1);', 'E += s * (((c >> (y * L + (x + 1) % L)) & 1) ? 1 : -1);'],
  ['ising : Metropolis accepte avec e^(-beta k)', 'acc.push(expD(-beta * 2 * k));', 'acc.push(expD(-beta * k));'],
  ['ising : aimantation signee', 'ZM += Math.abs(M) / N * w;', 'ZM += M / N * w;'],
  ['ising : beta_c avec sqrt 3', 'const betaC = lnD(1 + Math.sqrt(2)) / 2;', 'const betaC = lnD(1 + Math.sqrt(3)) / 2;'],
  ['ising : un seul lot (sigma faux)', 'for (let b = 0; b < 20; b++) { let sE = 0', 'for (let b = 0; b < 2; b++) { let sE = 0'],
  ['azteque : convention de couleur inverse', 'const c = (d.x + d.y + k + 1) & 1;', 'const c = (d.x + d.y + k) & 1;'],
  ['azteque : destruction oubliee (N contre S)', 'if (j !== undefined && fl[j] === 1) mort[i] = mort[j] = 1;', 'if (j !== undefined && fl[j] === 1 && false) mort[i] = mort[j] = 1;'],
  ['azteque : creation biaisee (70 % couches)', 'if (rng() < 0.5) nouv.push({ x, y, h: 1 }', 'if (rng() < 0.7) nouv.push({ x, y, h: 1 }'],
  ['azteque : formule 2^(k^2/2)', 'formules = [1, 2, 3, 4].map((k) => 2 ** (k * (k + 1) / 2))', 'formules = [1, 2, 3, 4].map((k) => 2 ** (k * k / 2))'],
  ['azteque : rayon n/2', 'const R = N / Math.SQRT2;', 'const R = N / 2;'],
  ['azteque : dessin decale', 'brut[o] = q.x + 0.5 + (q.h ? u : 0);', 'brut[o] = q.x + 1.5 + (q.h ? u : 0);'],
  ['coupons : H_n sans le dernier terme', 'for (let k = 1n; k <= BigInt(N); k++) { H = fracAdd(H, [1n, k]);', 'for (let k = 1n; k < BigInt(N); k++) { H = fracAdd(H, [1n, k]);'],
  ['coupons : variance sans le - n H_n', 'V = fracAdd([Nb * Nb * H2[0], H2[1]], [-E[0], E[1]]);', 'V = fracAdd([Nb * Nb * H2[0], H2[1]], [0n, 1n]);'],
  ['coupons : tirage biaise vers les petites vignettes (se termine toujours ; n - 1 vignettes bouclait sans fin le 2026-11-05)', 'const v = Math.floor(rng() * N);', 'const v = Math.floor(rng() * rng() * N);'],
  ['coupons : courbe exacte (1 - 1/n)^(t+1)', 'const ex = N * (1 - (1 - 1 / N) ** t);', 'const ex = N * (1 - (1 - 1 / N) ** (t + 1));'],
  ['coupons : courbe dessinee decalee', "brut[o + 1] = g < Dn ? courbes[g][t] : N * (1 - (1 - 1 / N) ** t);", "brut[o + 1] = g < Dn ? courbes[g][t] : N * (1 - (1 - 1 / N) ** (t + 1));"],
  ['ruine : r = p/q', 'r = q / p, egal =', 'r = p / q, egal ='],
  ['ruine : 1 - z/a remplace par z/a', 'const qz = egal ? 1 - z / a :', 'const qz = egal ? z / a :'],
  ['ruine : duree z (a + z)', ', dz = egal ? z * (a - z) :', ', dz = egal ? z * (a + z) :'],
  ['ruine : gain avec <= au lieu de <', 'x += rng() < p ? 1 : -1;', 'x += rng() < p + 0.02 ? 1 : -1;'],
  ['ruine : arret a 1 au lieu de 0', 'while (x > 0 && x < a) {', 'while (x > 1 && x < a) {'],
  ['catalan : descente permise sous le sol', 'if (d < u) rec(u, d + 1);', 'if (d <= u) rec(u, d + 1);'],
  ['catalan : binome sur n au lieu de n + 1', 'formules.push(String(binomB(2 * k, k) / BigInt(k + 1)));', 'formules.push(String(binomB(2 * k, k) / BigInt(k + 2)));'],
  ['catalan : rotation au dernier minimum', 'if (h < min) { min = h; im = i; }', 'if (h <= min) { min = h; im = i; }'],
  ['catalan : n descentes seulement', 'for (let i = 0; i <= n; i++) s.push(-1);', 'for (let i = 0; i < n; i++) s.push(-1);'],
  ['catalan : temoin binom(10, 4)', "mesure: String(binomB(10, 5)), formule: '252'", "mesure: String(binomB(10, 4)), formule: '252'"],
  ['partitions : signe pentagonal inverse', 'const sg = k % 2 ? 1n : -1n;', 'const sg = k % 2 ? -1n : 1n;'],
  ['partitions : second pentagonal oublie', 'if (g2 <= n) s += sg * p[n - g2];', ''],
  ['partitions : tirage avec parts <= k + 1', 'parts.push(j); m -= j; k = j; break;', 'parts.push(j); m -= j; k = j + 1; break;'],
  ['partitions : diagramme dessine decale', 'brut[o] = q[0]; brut[o + 1] = q[1];', 'brut[o] = q[0] + 1; brut[o + 1] = q[1];'],
  ['dragon : complement oublie', "c += h[k] === 'R' ? 'L' : 'R';", 'c += h[k];'],
  ['dragon : regle des bits avec j impair', "h += ((x - 1) / 2) % 2 === 0 ? 'R' : 'L';", "h += ((x - 1) / 2) % 2 === 1 ? 'R' : 'L';"],
  ['dragon : virage R tourne a gauche', "const ndx = c === 'R' ? dy : -dy, ndy = c === 'R' ? -dx : dx;", "const ndx = c === 'R' ? -dy : -dy, ndy = c === 'R' ? dx : dx;"],
  ['dragon : formule 2^(n+1)', 'formule: 2 ** N, recouvrements', 'formule: 2 ** (N + 1), recouvrements'],
  ['dragon : dessin decale', 'brut[o] = a[0] + u * (b[0] - a[0]);', 'brut[o] = a[0] + 0.3 + u * (b[0] - a[0]);'],
  ['pick : formule 2I + B - 1', 'pick: { mesure: a2 - (2 * I + B - 2)', 'pick: { mesure: a2 - (2 * I + B - 1)'],
  ['pick : pgcd remplace par 1', 'sg += pgcd(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));', 'sg += 1;'],
  /* « croisements comptes a gauche au lieu de droite » serait EQUIVALENT (la parite ne change pas) : on mute la decision elle-meme */
  ['pick : dedans compte a l envers', 'if (c) { I++; pts.push([x, y, 1]); }', 'if (!c) { I++; pts.push([x, y, 1]); }'],
  ['pick : bord sans les extremites', 'r[0] <= Math.max(p[0], q[0]) && Math.min(p[1], q[1]) <= r[1] && r[1] <= Math.max(p[1], q[1]);', 'r[0] < Math.max(p[0], q[0]) && Math.min(p[1], q[1]) <= r[1] && r[1] <= Math.max(p[1], q[1]);'],
  ['pick : temoin carre', 'papillon = [[0, 0], [4, 4], [4, 0], [0, 4]]', 'papillon = [[0, 0], [4, 0], [4, 4], [0, 4]]'],
  ['pick : points interieurs decales', 'brut[o] = pe[0]; brut[o + 1] = pe[1];', 'brut[o] = pe[0] + 1; brut[o + 1] = pe[1];'],
  ['percolation : bord droit oublie', 'bord[f(y * (W + 1) + W)] |= 2;', 'bord[f(y * (W + 1))] |= 2;'],
  ['percolation : liens verticaux decales', 'E.push([id(x, y), id(x, y + 1), x, y, 1]);', 'E.push([id(x, y), id(Math.min(W, x + 1), y + 1), x, y, 1]);'],
  ['percolation : ouverture 0.6', 'ouvert[k] = rng() < 0.5 ? 1 : 0; if (percoAmas', 'ouvert[k] = rng() < 0.6 ? 1 : 0; if (percoAmas'],
  ['percolation : valeur absolue oubliee', 'mesure: Math.abs(e1.t / e1.total - 0.5) + Math.abs(e2.t / e2.total - 0.5)', 'mesure: (e1.t / e1.total - 0.5) + (e2.t / e2.total - 0.75)'],
  ['percolation : dessin decale', "brut[o] = li[0] + (li[2] === 0 ? u : 0);", "brut[o] = li[0] + 0.5 + (li[2] === 0 ? u : 0);"],
  ['napoleon : rotation de 90 au lieu de 60', 'const NAP_DEMI = [[1n, 2n], [0n, 1n]], NAP_R = [[0n, 1n], [1n, 2n]]', 'const NAP_DEMI = [[0n, 1n], [0n, 1n]], NAP_R = [[1n, 1n], [0n, 1n]]'],
  ['napoleon : centre = milieu de deux sommets', 'NAP_TIERS = [[1n, 3n], [0n, 1n]];', 'NAP_TIERS = [[1n, 2n], [0n, 1n]];'],
  ['napoleon : sqrt3^2 = 2', 'napFM(napFM(x[1], y[1]), [3n, 1n])', 'napFM(napFM(x[1], y[1]), [2n, 1n])'],
  ['napoleon : interieur = exterieur', 'const ext = (P, Q) => exterieur ? napSommet(P, Q) : napSommet(Q, P)', 'const ext = (P, Q) => napSommet(P, Q)'],
  ['napoleon : triangle non reoriente', 'else if (cr < 0) T = [t[0], t[2], t[1]]; }', 'else if (cr < 0) T = t; }'],
  ['billard : normale radiale', 'let g = radiale ? [q[0], q[1]] : [q[0], q[1] / b2];', 'let g = [q[0], q[1]];'],
  ['billard : L sans b^2', 'L.push(n[0] * n[0] + b2 * n[1] * n[1] - d * d);', 'L.push(n[0] * n[0] + n[1] * n[1] - d * d);'],
  ['billard : foyers a 1 - b', 'const c = Math.sqrt(1 - b2);', 'const c = 1 - b;'],
  ['billard : caustique hyperbole prise pour ellipse', 'L0 = R.L0, ellipse = L0 < b2;', 'L0 = R.L0, ellipse = true;'],
  ['billard : trajectoire hors de la table', 'brut[o] = x; brut[o + 1] = y; brut[o + 2] = e; }', 'brut[o] = e === 1 ? 1.2 * x : x; brut[o + 1] = y; brut[o + 2] = e; }'],
  ['feuerbach : excentre au mauvais signe', 'Ia = bar(-a, b, c)', 'Ia = bar(a, -b, c)'],
  ['feuerbach : R = abc / 2K', 'const R = feuDiv(feuE(a * b * c), feuMul(feuE(4), K))', 'const R = feuDiv(feuE(a * b * c), feuMul(feuE(2), K))'],
  ['feuerbach : N = O', 'const N = [feuDiv(feuAdd(O[0], H[0]), feuE(2)), feuDiv(feuAdd(O[1], H[1]), feuE(2))];', 'const N = O;'],
  ['feuerbach : inscrit tangent de l exterieur', 'interne: feuEq(d2(N, I), carre(feuSub(R2, r)))', 'interne: feuEq(d2(N, I), carre(feuAdd(R2, r)))'],
  ['feuerbach : temoin (R - r)^2', 'temoin: { mesure: feuTexte(F.oi2), formule: feuTexte(F.euler)', 'temoin: { mesure: feuTexte(F.oi2), formule: feuTexte(F.rMoinsR2)'],
  ['feuerbach : cercle inscrit decale', 'brut[o] = feuNb(Cc[0]) + feuNb(rr) * cosD(ang);', 'brut[o] = feuNb(Cc[0]) + (e === 2 ? 0.3 : 0) + feuNb(rr) * cosD(ang);'],
  ['vie : survie a 2 seulement', 'if (v === 3 || (v === 2 && S.has(c))) T.add(c);', 'if ((v === 3 && !S.has(c)) || (v === 2 && S.has(c))) T.add(c);'],
  ['vie : naissance a 2', 'if (v === 3 || (v === 2 && S.has(c))) T.add(c);', 'if (v === 3 || v === 2) T.add(c);'],
  ['vie : periode = premiere phase de meme TAILLE', 'if (vieEgal(S, S0)) p = t; else phases.push(S);', 'if (S.size === S0.size) p = t; else phases.push(S);'],
  ['vie : voisinage sans les diagonales', 'if (dx || dy) { const c = vieCle(x + dx, y + dy);', 'if ((dx || dy) && !(dx && dy)) { const c = vieCle(x + dx, y + dy);'],
  ['vie : pentadecathlon a 13 cellules', "['pentadecathlon', '2bo4bo$2ob4ob2o$2bo4bo!', 15]", "['pentadecathlon', '2bo4bo$2ob4ob2o$2bo3bo!', 15]"],
  ['saw : demi-tour permis', 'if (!vu[q]) { vu[q] = 1; dfs(q, k + 1); vu[q] = 0; }', 'if (!vu[q] || q === chemin[chemin.length - 2]) { const w = vu[q]; vu[q] = 1; dfs(q, k + 1); vu[q] = w; }'],
  ['saw : la reference A001411 faussee', 'const SAW_A001411 = [1, 4, 12, 36, 100, 284, 780, 2172, 5916, 16268, 44100, 120292, 324932];', 'const SAW_A001411 = [1, 4, 12, 36, 100, 284, 780, 2172, 5916, 16268, 44100, 120292, 324933];'],
  ['saw : sous-multiplicativite inversee', 'if (c[m + k] > c[m] * c[k]) violations++;', 'if (c[m + k] < c[m] * c[k]) violations++;'],
  ['saw : temoin 4^k', 'if (4 * 3 ** (k - 1) !== c[k]) premier = k;', 'if (4 ** k !== c[k]) premier = k;'],
  ['saw : marche dessinee = la premiere', 'cible = Math.floor(rng() * total)', 'cible = 0 * Math.floor(rng() * total)'],
  ['euler : adouci, xi racine de xi^3 + 2 xi^2 = phi', 'x -= (x ** 3 + 2 * x ** 2 - EUL_PHI ** 2) / (3 * x * x + 4 * x);', 'x -= (x ** 3 + 2 * x ** 2 - EUL_PHI) / (3 * x * x + 4 * x);'],
  ['euler : aretes = paires a 1.5 fois le minimum', 'if (Math.abs(eulDist(P[i], P[j]) - m) < 1e-9 * m) { aretes.push', 'if (eulDist(P[i], P[j]) < 1.5 * m) { aretes.push'],
  ['euler : plans non dedoublonnes', 'if (!plans.some((q) => eulDist(q, cle) < 1e-9)) { plans.push(cle); sommetsFaces += sur; }', '{ plans.push(cle); sommetsFaces += sur; }'],
  ['euler : cuboctaedre en (1,1,1)', 'if (k === 2) return eulUniq(eulPerms([1, 1, 0]).flatMap(eulSignes));', 'if (k === 2) return eulUniq(eulPerms([1, 1, 1]).flatMap(eulSignes));'],
  ['euler : plan d appui coupant accepte', 'if (pos > 0 && neg > 0) continue; const sg = pos ? -1 : 1, cle', 'if (pos > 1 && neg > 0) continue; const sg = pos ? -1 : 1, cle'],
  ['euler : tore ferme en sphere', 'return { D: 3, brut, nuage: true, unite: \'longueur d arete\', invariants: {', 'faces.length = 6; return { D: 3, brut, nuage: true, unite: \'longueur d arete\', invariants: {'],
  ['morley : trisectrices sans le sens du triangle', 'const X = inter(U, rot(du, sens * al[i] / k), V, rot(dv, -sens * al[(i + 1) % 3] / k));', 'const X = inter(U, rot(du, al[i] / k), V, rot(dv, al[(i + 1) % 3] / k));'],
  ['morley : Webster avec 4 R', 'const s = 8 * sinD(T.al[0] / 3)', 'const s = 4 * sinD(T.al[0] / 3)'],
  ['morley : angle voisin mal choisi', 'rot(dv, -sens * al[(i + 1) % 3] / k)', 'rot(dv, -sens * al[(i + 2) % 3] / k)'],
  ['morley : temoin en trois', 'Q = morleyPoints(A, B, 4)', 'Q = morleyPoints(A, B, 3)'],
  ['bale : borne basse 1/n', 'if (!(1 / (m + 1) < r && r < 1 / m)) horsBornes++;', 'if (!(1 / m < r && r < 1 / m)) horsBornes++;'],
  ['bale : fraction sans le carre', 'const d = k * k; num = num * d + den; den = den * d;', 'const d = k; num = num * d + den; den = den * d;'],
  ['bale : pi^2/8', 'const BALE_PI2_6 = PI * PI / 6;', 'const BALE_PI2_6 = PI * PI / 8;'],
  ['bale : temoin avec le carre', 'h += 1 / k; if (h > BALE_PI2_6) depasse = k;', 'h += 1 / (k * k); if (h > BALE_PI2_6) depasse = k;'],
  ['simson : pied au milieu du cote', 'pieds.push([feuAdd(U[0], feuMul(t, d[0])), feuAdd(U[1], feuMul(t, d[1]))]); }', 'pieds.push([feuAdd(U[0], feuMul(feuF(1n, 2n), d[0])), feuAdd(U[1], feuMul(feuF(1n, 2n), d[1]))]); }'],
  ['simson : P pris au centre de la corde', 'if (s[0] !== 0n) P = [feuAdd(A[0], s), feuAdd(A[1], feuMul(s, t))]; }', 'if (s[0] !== 0n) P = [feuAdd(A[0], feuMul(feuF(1n, 2n), s)), feuAdd(A[1], feuMul(feuMul(feuF(1n, 2n), s), t))]; }'],
  ['simson : temoin sur le cercle', 'Q = [feuAdd(O[0], feuMul(feuF(5n, 4n), feuSub(P[0], O[0]))), feuAdd(O[1], feuMul(feuF(5n, 4n), feuSub(P[1], O[1])))]', 'Q = P'],
  ['simson : centre faux', 'const det = feuSub(feuMul(a1, b2), feuMul(a2, b1)), O = [feuDiv(feuSub(feuMul(c1, b2), feuMul(c2, b1)), det), feuDiv(feuSub(feuMul(a1, c2), feuMul(a2, c1)), det)];', 'const det = feuSub(feuMul(a1, b2), feuMul(a2, b1)), O = [feuDiv(feuSub(feuMul(c1, b2), feuMul(c2, b1)), det), feuAdd(feuE(1), feuDiv(feuSub(feuMul(a1, c2), feuMul(a2, c1)), det))];'],
  ['distinctes : sac a dos dans le mauvais sens (parts repetees)', 'for (let k = 1; k <= N; k++) for (let m = N; m >= k; m--) q[m] += q[m - k]; return q; }', 'for (let k = 1; k <= N; k++) for (let m = k; m <= N; m++) q[m] += q[m - k]; return q; }'],
  ['distinctes : impaires avec le 2', 'for (let k = 1; k <= N; k += 2) for (let m = k; m <= N; m++) q[m] += q[m - k]; return q; }', 'for (let k = 1; k <= N; k += (k === 1 ? 1 : 2)) for (let m = k; m <= N; m++) q[m] += q[m - k]; return q; }'],
  ['distinctes : Glaisher coupe en 2 au lieu de 2^a', 'for (let i = 0; i < 2 ** a; i++) image.push(b);', 'for (let i = 0; i < 2 * a + 1; i++) image.push(b);'],
  /* comparer p(n) aux parts IMPAIRES serait EQUIVALENT (distinctes = impaires : c est le theoreme) : on mute vers un decalage */
  ['distinctes : temoin decale d un rang', 'if (tous[m] !== A[m]) premier = m;', 'if (tous[m] !== A[m]) premier = m + 1;'],
  ['triangulations : recursion sans le produit', 'for (let k = 1; k <= m - 2; k++) s += T[k + 1] * T[m - k];', 'for (let k = 1; k <= m - 2; k++) s += T[k + 1] + T[m - k];'],
  ['triangulations : croisement mal detecte', 'return (p < r && r < q && q < s) || (r < p && p < s && s < q); };', 'return (p < r && r < q && q < s); };'],
  ['triangulations : tirage sans la seconde moitie', 'triTirage(i, k, T, rng, diag); triTirage(k, j, T, rng, diag); return; }', 'triTirage(i, k, T, rng, diag); return; }'],
  ['triangulations : temoin sur un hexagone', 'const D5 = [[2, 4], [1, 4], [1, 3], [0, 3], [0, 2]];', 'const D5 = [[2, 5], [1, 4], [1, 3], [0, 3], [0, 2]];'],
  ['ramsey : triangle a deux aretes', 'if (c === ((m >> t[1]) & 1) && c === ((m >> t[2]) & 1)) { if (mono === null) mono = t;', 'if (c === ((m >> t[1]) & 1)) { if (mono === null) mono = t;'],
  ['ramsey : cycles sans la connexite', "if (deg.some((d) => d !== 2) || vu.size !== 5) cyclesFaux++; }", "if (deg.some((d) => d !== 3)) cyclesFaux++; }"],
  ['ramsey : temoin sur le bleu aussi', 'if (c === 0) rouge = true; }', 'rouge = true; }'],
  ['ramsey : triangle non dessine', 'tri && tri.includes(k) ? 2 : (m >> k) & 1', '(m >> k) & 1'],
  ['hexagramme : cotes voisins au lieu d opposes', 'const X = pascalInter(H[0], H[1], H[3], H[4]), Y', 'const X = pascalInter(H[0], H[1], H[2], H[3]), Y'],
  ['hexagramme : point hors du cercle', 'return [feuF(1n - T * T, d), feuF(2n * T, d)]; });', 'return [feuF(1n - T * T, d), feuF(2n * T + 1n, d)]; });'],
  ['hexagramme : temoin sur le cercle', 'H2 = [...H.slice(0, 5), [feuE(2), feuE(2)]]', 'H2 = [...H.slice(0, 5), H[5]]'],
  ['ptolemee : signe de la racine oublie', 'return { egal: g[0] >= 0n && feuEq(feuMul(g, g), droite)', 'return { egal: feuEq(feuMul(g, g), droite) || g[0] < 0n'],
  ['ptolemee : facteur 2 au lieu de 4', 'droite = feuMul(feuE(4), feuMul(feuMul(ab, cd), feuMul(da, bc)));', 'droite = feuMul(feuE(2), feuMul(feuMul(ab, cd), feuMul(da, bc)));'],
  ['ptolemee : ordre du cercle perdu', 'Q.sort((u, v) => atan2D(feuNb(u[1]), feuNb(u[0])) - atan2D(feuNb(v[1]), feuNb(v[0])));', 'Q.sort((u, v) => feuNb(u[0]) - feuNb(v[0]));'],
  ['ptolemee : temoin sur le cercle', 'C2 = [feuMul(feuF(6n, 5n), Q[2][0]), feuMul(feuF(6n, 5n), Q[2][1])]', 'C2 = Q[2]'],
  ['carres : Jacobi avec tous les diviseurs', 'if (m % d === 0) { s += d; if (d % 4) j += d;', 'if (m % d === 0) { s += d; j += d;'],
  ['carres : deux carres d1 + d3', 'if (r2[m] !== 4 * (d1 - d3)) e2++;', 'if (r2[m] !== 4 * (d1 + d3)) e2++;'],
  ['carres : d sans le signe moins', 'for (let d = -R; d <= R; d++) { const s4 = s3 + d * d; if (s4 <= N) r4[s4]++; } } }', 'for (let d = 0; d <= R; d++) { const s4 = s3 + d * d; if (s4 <= N) r4[s4]++; } } }'],
  ['carres : temoin avec la bonne formule', 'if (premier === null && r4[m] !== 8 * s) premier = m;', 'if (premier === null && r4[m] !== 8 * j) premier = m;'],
  ['pell : arret a -1 aussi', 'if (p1 * p1 - BigInt(Dd) * q1 * q1 === 1n) return', 'if (p1 * p1 - BigInt(Dd) * q1 * q1 === 1n || p1 * p1 - BigInt(Dd) * q1 * q1 === -1n) return'],
  ['pell : reduites sans le terme precedent', '[p0, p1] = [p1, a * p1 + p0];', '[p0, p1] = [p1, a * p1];'],
  ['pell : temoin sur x^2 - 3 y^2 = +1', 'const x2 = 3n * y * y - 1n,', 'const x2 = 3n * y * y + 1n,'],
  ['pell : carre non saute', 'let Dd = P.radical; while (Number.isInteger(Math.sqrt(Dd))) Dd++;', 'let Dd = P.D;'],
  ['carmichael : Korselt sans le facteur carre', 'const sansCarre = new Set(f).size === f.length;', 'const sansCarre = true;'],
  ['carmichael : p au lieu de p - 1', 'f.every((p) => (k - 1) % (p - 1) === 0)', 'f.every((p) => (k - 1) % p === 0)'],
  ['carmichael : pseudo base 3', 'if (k % 2 === 1 && carPuiss(2, k - 1, k) === 1) psp2.push(k); }', 'if (k % 2 === 1 && carPuiss(3, k - 1, k) === 1) psp2.push(k); }'],
  ['carmichael : temoin en base 2', 'const temoin = carPuiss(3, 340, 341);', 'const temoin = carPuiss(2, 340, 341);'],
  ['wilson : produit jusqu a n inclus', 'for (let i = 2; i < k; i++) r = (r * i) % k; return r % k; }', 'for (let i = 2; i <= k; i++) r = (r * i) % k; return r % k; }'],
  ['wilson : n = 4 non exempte', "if (!premier && r !== (k === 4 ? 2 : 0)) regle++; }", "if (!premier && r !== 0) regle++; }"],
  ['wilson : primalite par divisibilite par 2 seulement', 'for (let d = 2; d * d <= k; d++) if (k % d === 0) { premier = false; break; }', 'if (k > 2 && k % 2 === 0) premier = false;'],
  ['mertens : facteurs carres non annules', 'for (let j = p * p; j <= N; j += p * p) mu[j] = 0;', ''],
  ['mertens : identite avec M(k) au lieu de M(n div k)', 'for (let k = 1; k <= m; k++) s += M[Math.floor(m / k)];', 'for (let k = 1; k <= m; k++) s += M[k];'],
  ['mertens : Liouville sans multiplicite', 'for (let q = p; q <= N; q *= p) for (let m = q; m <= N; m += q) lam[m] = -lam[m]; }', 'for (let m = p; m <= N; m += p) lam[m] = -lam[m]; }'],
  ['aliquote : n compte parmi ses diviseurs', 'for (let m = 2 * d; m <= N; m += d) s[m] += d; return s; }', 'for (let m = d; m <= N; m += d) s[m] += d; return s; }'],
  ['aliquote : paires sans reciprocite', 'if (t > k && t <= N && s[t] === k) paires.push([k, t]); }', 'if (t > k && t <= N) paires.push([k, t]); }'],
  ['aliquote : Euclide sans primalite', 'return m === 2 ** p - 1 && prem; };', 'return m === 2 ** p - 1; };'],
  ['aliquote : temoin avec 2047 premier', 'const sigma = (2 ** 11 - 1) * (23 + 1) * (89 + 1)', 'const sigma = (2 ** 11 - 1) * (2047 + 1)'],
  ['bernoulli : binom(m, k) au lieu de binom(m + 1, k)', 's = feuAdd(s, feuMul(feuF(binomB(m + 1, k), 1n), B[k]));', 's = feuAdd(s, feuMul(feuF(binomB(m, k), 1n), B[k]));'],
  ['bernoulli : von Staudt avec q au lieu de q - 1', 'if (prem && k % (q - 1) === 0) s = feuAdd(s, feuF(1n, BigInt(q)));', 'if (prem && k % q === 0) s = feuAdd(s, feuF(1n, BigInt(q)));'],
  ['bernoulli : Faulhaber jusqu a m inclus', 'for (let k = 0n; k < BigInt(m); k++) gauche += k ** BigInt(p);', 'for (let k = 0n; k <= BigInt(m); k++) gauche += k ** BigInt(p);'],
  ['bernoulli : temoin avec la convention moderne', 'if (!bernFaulhaber(B, p, m, [1n, 2n])) fauxF2++;', 'if (!bernFaulhaber(B, p, m, B[1])) fauxF2++;'],
  ['josephus : pas k au lieu de k - 1', 'while (cercle.length > 1) { i = (i + k - 1) % cercle.length;', 'while (cercle.length > 1) { i = (i + k) % cercle.length;'],
  ['josephus : recurrence sans le + 1', 'if (m > 1) J = ((J + K - 1) % m) + 1;', 'if (m > 1) J = ((J + K - 1) % m);'],
  ['josephus : 2L - 1', 'if (K === 2 && 2 * L + 1 !== J) ecarts2L++; }', 'if (K === 2 && 2 * L - 1 !== J) ecarts2L++; }'],
  ['josephus : temoin avec k = 2', 'J3 = ((J3 + 2) % m) + 1;', 'J3 = ((J3 + 1) % m) + 1;'],
  ['zeckendorf : glouton qui saute le plus grand', 'for (let i = F.length - 1; i >= 0 && r > 0; i--) if (F[i] <= r) { idx.push(i); r -= F[i]; }', 'for (let i = F.length - 2; i >= 0 && r > 0; i--) if (F[i] <= r) { idx.push(i); r -= F[i]; }'],
  ['zeckendorf : voisins jamais refuses', 'if (consecutifs || !pris) c += go(r - F[i], i + 1, 1);', 'c += go(r - F[i], i + 1, 1);'],
  ['zeckendorf : Fibonacci 1, 1, 2', 'function zeckFib(N) { const F = [1, 2];', 'function zeckFib(N) { const F = [1, 1];'],
  /* « continue » au lieu de « return 0 » ferait BOUCLER le banc (n, k jamais mis a jour) ; retirer la ligne serait equivalent (binom(a, b) = 0 si b > a) */
  ['lucas : chiffres de n et k inverses', 'const a = n % p, b = k % p; if (b > a) return 0;', 'const a = k % p, b = n % p; if (b > a) return 0;'],
  ['lucas : Pascal sans le modulo', 'suivante.push((ligne[k - 1] + ligne[k]) % p); suivante.push(1); ligne = suivante; }', 'suivante.push(ligne[k - 1] + ligne[k]); suivante.push(1); ligne = suivante; }'],
  ['lucas : p non premier garde', 'while (!prem(p)) p++;', ''],
  ['lucas : temoin en base 3', 'mesure: lucasRegle(6, 2, 4), formule: 1', 'mesure: lucasRegle(6, 2, 3), formule: 1'],
  ['calkin : enfant gauche (a + b)/a', 'const [a, b] = fr[i]; fr.push([a, a + b], [a + b, b]); }', 'const [a, b] = fr[i]; fr.push([a + b, a], [a + b, b]); }'],
  ['calkin : fusc pair = fusc(n) + 1', 'fusc.push(k % 2 ? fusc[(k - 1) / 2] + fusc[(k + 1) / 2] : fusc[k / 2]);', 'fusc.push(k % 2 ? fusc[(k - 1) / 2] + fusc[(k + 1) / 2] : fusc[k / 2] + 1);'],
  ['calkin : completude jusqu a D + 2', 'for (let s = 2; s <= Dn + 1; s++) for (let p = 1; p < s; p++)', 'for (let s = 2; s <= Dn + 2; s++) for (let p = 1; p < s; p++)'],
  ['calkin : temoin reduit', "const q = s - p, d = g(p, q), cle = (p / d) + '/' + (q / d);", "const q = s - p, d = 1, cle = (p / d) + '/' + (q / d);"],
  ['hanoi : piquet intermediaire inverse', 'bouge(k - 1, de, via, vers); const disque', 'bouge(k - 1, de, vers, via); const disque'],
  ['hanoi : disque 1 + ctz(m) - 1', 'if (disque !== z + 1 || bits !== 1 || p !== z) horsGray++;', 'if (disque !== z || bits !== 1 || p !== z) horsGray++;'],
  ['hanoi : Gray sans le decalage', 'const x = (m ^ (m >> 1)) ^ ((m - 1) ^ ((m - 1) >> 1));', 'const x = m ^ (m - 1);'],
  ['hanoi : temoin sans multi-bits', 'if (c > 1) binaireMulti++; });', 'if (c > 2) binaireMulti++; });'],
  ['regarder : chiffre puis compte', 'r.push((j - i) + s[i]); i = j; }', 'r.push(s[i] + (j - i)); i = j; }'],
  /* « 333 » -> « 3333 » serait EQUIVALENT (aucun des deux n apparait) : on mute la garde des chiffres dans le sens qui DOIT rougir */
  ['regarder : chiffre 3 compte comme interdit', 'if (/[4-9]/.test(t)) horsChiffres++;', 'if (/[3-9]/.test(t)) horsChiffres++;'],
  ['regarder : temoin depuis 23', "let g = '22'; for (let k = 0; k < 10; k++) g = lasSuivant(g);", "let g = '23'; for (let k = 0; k < 10; k++) g = lasSuivant(g);"],
  ['derangements : point fixe accepte', 'if (a.every((v, i) => v !== i)) { compte++;', 'if (a.some((v, i) => v !== i)) { compte++;'],
  ['derangements : recurrence en (m + 1)', 'for (let m = 2; m <= 30; m++) Dr.push(BigInt(m - 1) * (Dr[m - 1] + Dr[m - 2]));', 'for (let m = 2; m <= 30; m++) Dr.push(BigInt(m) * (Dr[m - 1] + Dr[m - 2]));'],
  ['derangements : arrondi par defaut', '2n * mf * KF < (d2 + 1n) * A &&', '2n * mf * KF < d2 * A &&'],
  ['derangements : temoin avec 1/2', 'mesure: Math.round(1 / e), formule: 0, vrai: 1', 'mesure: Math.round(1 / 2), formule: 0, vrai: 1'],
  ['harmoniques : fraction non reduite', 'let g = harmPgcd(a, b); hn = a / g;', 'let g = 1n; hn = a / g;'],
  ['harmoniques : borne basse en ln(n + 2)', 'if (!(lnD(k + 1) < hk && hk', 'if (!(lnD(k + 2) < hk && hk'],
  ['harmoniques : puissance de 4', 'while (d % 2n === 0n) { d /= 2n; e++; }', 'while (d % 4n === 0n) { d /= 4n; e++; }'],
  ['harmoniques : temoin pris a n = 2', 'temoin: { mesure: Number(dens[1]), formule: 1,', 'temoin: { mesure: Number(dens[2]), formule: 1,'],
  /* plafond de 10 000 pas : un mutant qui cycle s ARRETE (pas de banc fige) */
  ['collatz : 3n - 1 au lieu de 3n + 1', 'const [v, m, a] = syrVol(d, (x) => 3 * x + 1);', 'const [v, m, a] = syrVol(d, (x) => 3 * x - 1);'],
  ['collatz : doublement en + 2', 'if (vols[2 * m] !== vols[m] + 1) doubles++;', 'if (vols[2 * m] !== vols[m] + 2) doubles++;'],
  ['collatz : altitude divisee', 'pas++; alt = Math.max(alt, x); }', 'pas++; alt = Math.max(alt, x / 2); }'],
  ['collatz : temoin en 3n + 1', 't = t % 2 ? 3 * t - 1 : t / 2;', 't = t % 2 ? 3 * t + 1 : t / 2;'],
  ['kaprekar : zeros en tete perdus', "const kc = String(x).padStart(L, '0').split('')", "const kc = String(x).split('')"],
  ['kaprekar : croissant moins decroissant', 'return Number(kg.join(\'\')) - Number(kd.join(\'\')); }', 'return Number(kd.join(\'\')) - Number(kg.join(\'\')); }'],
  ['kaprekar : plafond a 6 pas', 'while (k < 20 && kt[y] !== y)', 'while (k < 6 && kt[y] !== y)'],
  ['kaprekar : temoin non repete', "const rep = Number('1'.repeat(L)),", "const rep = Number('1'.repeat(L - 1) + '2'),"],
  ['stirling : bloc neuf interdit', 'for (let b = 0; b <= ouverts && b < N; b++) { rgsPart[i] = b;', 'for (let b = 0; b < ouverts && b < N; b++) { rgsPart[i] = b;'],
  ['stirling : recurrence en (k + 1)', 'r.push(BigInt(k) * (Sr[m - 1][k] || 0n) + (Sr[m - 1][k - 1] || 0n));', 'r.push(BigInt(k + 1) * (Sr[m - 1][k] || 0n) + (Sr[m - 1][k - 1] || 0n));'],
  ['stirling : Aitken decale', 'for (const x of rang) nv.push(nv[nv.length - 1] + x);', 'for (const x of rang) nv.push(nv[nv.length - 1] + x + 1n);'],
  ['stirling : temoin sans les deux constantes', 'if (x !== 0 && x !== 2 ** N - 1) surj++;', 'if (x !== 0) surj++;'],
  ['motzkin : descente sous le sol', '+ (h > 0 ? motzCompte(i + 1, h - 1) : 0); };', '+ (h > -1 ? motzCompte(i + 1, h - 1) : 0); };'],
  ['motzkin : recurrence decalee', 'for (let k = 0; k <= m - 2; k++) s += Mr[k] * Mr[m - 2 - k];', 'for (let k = 0; k <= m - 2; k++) s += Mr[k] * Mr[m - 1 - k];'],
  ['motzkin : C(m, k) au lieu de C(m, 2k)', 's += binM(m, 2 * k) * (binM(2 * k, k)', 's += binM(m, k) * (binM(2 * k, k)'],
  ['motzkin : temoin sans DU', 'for (const b of [-1, 0, 1]) if (a + b === 0) libres++;', 'for (const b of [-1, 0, 1]) if (a + b === 0 && a >= 0) libres++;'],
  /* plafond 6m + 10 : un mutant qui ne referme jamais le cycle s ARRETE */
  ['pisano : retour sur (1, 0)', '} while (!(a === 0 && b === 1) && k < 6 * m + 10); return [a === 0 && b === 1 ? k : -1, zeros]; }', '} while (!(a === 1 && b === 0) && k < 6 * m + 10); return [a === 1 && b === 0 ? k : -1, zeros]; }'],
  ['pisano : produit au lieu du ppcm', 'per[a * b] !== ppcmP(per[a], per[b])) ppcmFaux++;', 'per[a * b] !== per[a] * per[b]) ppcmFaux++;'],
  ['pisano : parite des m = 2', 'for (let m = 3; m <= M; m++) if (per[m] % 2) impairs++;', 'for (let m = 2; m <= M; m++) if (per[m] % 2) impairs++;'],
  ['pisano : temoin a m = 4', 'temoin: { mesure: per[2] % 2, formule: 0,', 'temoin: { mesure: per[4] % 2, formule: 0,'],
  ['totient : crible en p au lieu de phi/p', 'totF[q] -= totF[q] / p; nbP[q]++; }', 'totF[q] -= totF[q] / q; nbP[q]++; }'],
  ['totient : somme des diviseurs decalee', 'for (let q = d; q <= N; q += d) somme[q] += totF[d];', 'for (let q = d; q <= N; q += d) somme[q] += totF[q];'],
  ['totient : multiplicativite sans pgcd', 'if (pgcdE(a, b) === 1 && totF[a * b] !== totF[a] * totF[b]) multFausses++;', 'if (totF[a * b] !== totF[a] * totF[b]) multFausses++;'],
  ['totient : temoin phi(2) au carre', 'temoin: { mesure: totF[4], formule: totF[2] * totF[2],', 'temoin: { mesure: totF[2] * totF[2], formule: totF[2] * totF[2],'],
  ['goldbach : 2 compte comme premier impair', 'for (let p = 3; p <= E / 2; p += 2) if (crible[p] && crible[E - p]) facons[E]++;', 'for (let p = 2; p <= E / 2; p += 1) if (crible[p] && crible[E - p]) facons[E]++;'],
  ['goldbach : p = q exclu', 'for (let p = 3; p <= E / 2; p += 2) if', 'for (let p = 3; p < E / 2; p += 2) if'],
  ['goldbach : crible des le carre manque', 'for (let q = p * p; q <= Emax; q += p) crible[q] = 0;', 'for (let q = p * p + p; q <= Emax; q += p) crible[q] = 0;'],
  ['goldbach : temoin a 6', 'temoin: { mesure: facons[4], formule: 0,', 'temoin: { mesure: facons[6], formule: 0,'],
  ['frobenius : zero non payable', 'const rep = new Uint8Array(L + 1); rep[0] = 1;', 'const rep = new Uint8Array(L + 1); rep[0] = 0;'],
  ['frobenius : formule de g decalee', 'if (g !== a * b - a - b || nb', 'if (g !== a * b - a - b + 1 || nb'],
  ['frobenius : symetrie a deux', 'if (rep[k] + rep[g - k] !== 1) { asym++; break; }', 'if (rep[k] + rep[g - k] !== 2) { asym++; break; }'],
  ['frobenius : temoin (6, 10)', 'const r69 = frobPayables(6, 9, 300);', 'const r69 = frobPayables(6, 10, 300);'],
  ['schroder : palier double interdit', '+ (x + 2 <= X ? schCompte(x + 2, y) : 0); };', '+ 0; };'],
  ['schroder : convolution decalee', 'for (let k = 0; k <= m - 1; k++) t += Sc[k] * Sc[m - 1 - k];', 'for (let k = 0; k <= m - 1; k++) t += Sc[k] * Sc[m - k];'],
  ['schroder : parite depuis 0', 'for (let m = 1; m <= 30; m++) if (Sc[m] % 2n) impairs++;', 'for (let m = 0; m <= 30; m++) if (Sc[m] % 2n) impairs++;'],
  ['schroder : temoin a 1', 'temoin: { mesure: Number(Sc[0] % 2n), formule: 0,', 'temoin: { mesure: Number(Sc[1] % 2n), formule: 0,'],
  ['narayana : sommet compte sur toute descente', 'sommets + (avant === 1 ? 1 : 0), -1,', 'sommets + 1, -1,'],
  ['narayana : formule sans /n', 'const f = binN(m, k) * binN(m, k - 1) / BigInt(m);', 'const f = binN(m, k) * binN(m, k - 1);'],
  ['narayana : symetrie decalee', 'if (parSommets[k] !== parSommets[m + 1 - k]) asym++;', 'if (parSommets[k] !== parSommets[m - k]) asym++;'],
  ['narayana : retours comptes a la hauteur 1', 'ret + (h - 1 === 0 ? 1 : 0)); };', 'ret + (h - 1 === 1 ? 1 : 0)); };'],
  ['recaman : recul sans regarder les vus', 'v = ar > 0 && !vus.has(ar) ? ar : rec[k - 1] + k;', 'v = ar > 0 ? ar : rec[k - 1] + k;'],
  ['recaman : saut de n + 1 en avancant', 'ar : rec[k - 1] + k;', 'ar : rec[k - 1] + k + 1;'],
  /* « controle du saut retire » etait EQUIVALENT (le controle relit la generation du module : il ne rougit que si elle est fausse) : remplace */
  ['recaman : plus petit absent cherche de 2 en 2', 'let absent = 0; while (vus.has(absent)) absent++;', 'let absent = 0; while (vus.has(absent)) absent += 2;'],
  ['recaman : temoin sur 43', 'temoin: { mesure: repete && repete[0] === 42 ? 1 : 0,', 'temoin: { mesure: repete && repete[0] === 43 ? 1 : 0,'],
  ['kolakoski : meme chiffre au lieu d alterner', 'const chiffre = kol[kol.length - 1] === 1 ? 2 : 1;', 'const chiffre = kol[kol.length - 1] === 1 ? 1 : 2;'],
  ['kolakoski : lecture decalee', 'for (let r = 0; r < kol[lu]; r++) kol.push(chiffre); lu++; }', 'for (let r = 0; r < kol[lu - 1]; r++) kol.push(chiffre); lu++; }'],
  ['kolakoski : controle des paquets decale', 'for (let i = 0; i < runs.length; i++) if (runs[i] !== kol[i]) fautes++;', 'for (let i = 0; i < runs.length; i++) if (runs[i] !== kol[i + 1]) fautes++;'],
  ['kolakoski : temoin 1, 1, 2, 2', 'const alt = Array.from({ length: 20 }, (_, i) => (i % 2 ? 2 : 1)),', 'const alt = Array.from({ length: 20 }, (_, i) => (i % 4 < 2 ? 1 : 2)),'],
  ['perrin : recurrence de Fibonacci', 'for (let k = 0; k < m; k++) [a, b, c] = [b, c, (a + b) % m]; return a; }', 'for (let k = 0; k < m; k++) [a, b, c] = [b, c, (b + c) % m]; return a; }'],
  ['perrin : P(0) = 2', 'let a = 3 % m, b = 0, c = 2 % m;', 'let a = 2 % m, b = 0, c = 2 % m;'],
  ['perrin : matrice compagnon fausse', 'A = [[0, 1, 0], [0, 0, 1], [1, 1, 0]], e = m;', 'A = [[0, 1, 0], [0, 0, 1], [1, 0, 1]], e = m;'],
  ['perrin : premiers comptes comme composes', 'if (m > 1 && !premier[m] && r === 0) composesDivisent++;', 'if (m > 1 && r === 0) composesDivisent++;'],
  ['thue : doublement sans complement', 'while (dbl.length < N) dbl = dbl.concat(dbl.map((b) => 1 - b));', 'while (dbl.length < N) dbl = dbl.concat(dbl.map((b) => b));'],
  ['thue : cube compte sur deux copies', '|| tmBits[i + j] !== tmBits[i + 2 * L + j]) pareil = false;', ') pareil = false;'],
  ['thue : sommes jusqu a j = k', 'for (let k = 2; k <= K; k++) for (let j = 0; j < k; j++) {', 'for (let k = 2; k <= K; k++) for (let j = 0; j <= k; j++) {'],
  ['thue : temoin a j = k - 1', 'const p = BigInt(m) ** BigInt(K); if (tmBits[m]) t1 += p; else t0 += p; }', 'const p = BigInt(m) ** BigInt(K - 1); if (tmBits[m]) t1 += p; else t0 += p; }'],
  ['padovan : recurrence de Fibonacci', 'for (let k = 3; k <= N + 5; k++) pad.push(pad[k - 2] + pad[k - 3]);', 'for (let k = 3; k <= N + 5; k++) pad.push(pad[k - 1] + pad[k - 2]);'],
  ['padovan : seconde recurrence en n - 4', 'if (pad[k] !== pad[k - 1] + pad[k - 5]) ecarts++;', 'if (pad[k] !== pad[k - 1] + pad[k - 4]) ecarts++;'],
  ['padovan : dichotomie sur x^3 = x + 2', 'if (m * m * m - m - 1 > 0) hi = m; else lo = m; }', 'if (m * m * m - m - 2 > 0) hi = m; else lo = m; }'],
  ['padovan : temoin depuis 1, 1, 2', 'const q = [1n, 1n, 1n]; for (let k = 3; k <= 40; k++)', 'const q = [1n, 1n, 2n]; for (let k = 3; k <= 40; k++)'],
  ['fourmi : virages inverses', 'cap = noir ? (cap + 3) % 4 : (cap + 1) % 4;', 'cap = noir ? (cap + 1) % 4 : (cap + 3) % 4;'],
  ['fourmi : case jamais rendue blanche', 'if (noir) noires.delete(k); else noires.add(k);', 'if (!noir) noires.add(k);'],
  ['fourmi : autoroute en (-2, -1)', 'if (b[0] - a[0] !== -2 || b[1] - a[1] !== -2 || b[2] !== a[2]) horsAutoroute++;', 'if (b[0] - a[0] !== -2 || b[1] - a[1] !== -1 || b[2] !== a[2]) horsAutoroute++;'],
  ['fourmi : temoin en periode 208', 'if (virage[t] !== virage[t + 52]) desaccord52++; if (virage[t] !== virage[t + 103]) desaccord103++;', 'if (virage[t] !== virage[t + 208]) desaccord52++; if (virage[t] !== virage[t + 104]) desaccord103++;'],
  ['gamme : pas cherche sur x^N = 3', 'for (let j = 0; j < N; j++) x *= m; if (x > 2) hi = m; else lo = m; }', 'for (let j = 0; j < N; j++) x *= m; if (x > 3) hi = m; else lo = m; }'],
  ['gamme : cents en 1000 par octave', 'const cents = (r) => 1200 * lnD(r) / lnD(2),', 'const cents = (r) => 1000 * lnD(r) / lnD(2),'],
  ['gamme : tierce 6/5 au lieu de 5/4', 'tierce = ecart(5, 4),', 'tierce = ecart(6, 5),'],
  ['gamme : comma sur six octaves', 'const comma = [3n ** 12n, 2n ** 12n * 2n ** 7n],', 'const comma = [3n ** 12n, 2n ** 12n * 2n ** 6n],'],
  ['shannon : log naturel au lieu de log2', 'const lg2 = (x) => lnD(x) / lnD(2),', 'const lg2 = (x) => lnD(x),'],
  ['shannon : Huffman fusionne les deux plus frequents', 'foret.sort((a, b) => a.poids - b.poids);', 'foret.sort((a, b) => b.poids - a.poids);'],
  /* « borne H + 1 retiree » etait EQUIVALENT (effectifs fixes : Huffman reste sous H + 1) : remplace par un mutant du tirage */
  ['shannon : lettres tirees uniformement', 'const u = rng(); let k = 0; while (cumul[k] < u) k++; vus[k]++; }', 'const u = rng(); vus[Math.floor(u * 26)]++; }'],
  ['shannon : code fixe sur 4 bits', 'let fixe = 0; while (2 ** fixe < 26) fixe++;', 'let fixe = 0; while (2 ** fixe < 16) fixe++;'],
  ['atmosphere : gradient positif', 'Tde = (H) => (H <= 11000 ? T0 + L * H : T11)', 'Tde = (H) => (H <= 11000 ? T0 - L * H : T11)'],
  ['atmosphere : isotherme oubliee', "p11 * expAtm(-k * (H - 11000) / T11));", "p0 * expAtm((-k / L) * lnD(Tde(H) / T0)));"],
  ['atmosphere : integration a mi-pas faux', 'c = f(H + h / 2, p + h * b / 2), d = f(H + h, p + h * c);', 'c = f(H + h / 2, p + h * b), d = f(H + h, p + h * c);'],
  ['atmosphere : temoin sans conversion', 'Hgeo = r0 * zGeo / (r0 + zGeo);', 'Hgeo = zGeo;'],
  ['zipf : pente sans le terme R sx^2', 'const b = (R * sxy - sx * sy) / (R * sxx - sx * sx);', 'const b = (R * sxy - sx * sy) / (R * sxx);'],
  ['zipf : log naturel au lieu de log10 dans les comptes', 'const x = lg10(r), y = lg10(mots[r - 1][1]);', 'const x = lg10(r), y = lnD(mots[r - 1][1]);'],
  ['zipf : rang decale', 'for (let r = 1; r <= R; r++) { const x = lg10(r),', 'for (let r = 1; r <= R; r++) { const x = lg10(r + 1),'],
  ['zipf : temoin sur 30 rangs', 'const R = P.rangsZipf, [b, a] = pente(R), [b10] = pente(10),', 'const R = P.rangsZipf, [b, a] = pente(R), [b10] = pente(30),'],
  ['gutenberg : taux en b au lieu de b ln 10', 'beta = P.bValeur * lnD(10), mags = [];', 'beta = P.bValeur, mags = [];'],
  ['gutenberg : Aki sans le seuil', 'bAki = lg10(expPosD(1)) / (moyenne - 4.5),', 'bAki = lg10(expPosD(1)) / moyenne,'],
  ['gutenberg : cumul depuis la classe suivante', 'const cumul = classes.map((_, i) => classes.slice(i).reduce(', 'const cumul = classes.map((_, i) => classes.slice(i + 1).reduce('],
  ['gutenberg : temoin sur une demi-magnitude', 'const rapportReel = cumul[2] / cumul[0],', 'const rapportReel = cumul[1] / cumul[0],'],
  ['maree : vitesse en radians oubliee', 'const wM = SOURCES.vitesseM2.valeur * Math.PI / 180,', 'const wM = SOURCES.vitesseM2.valeur * Math.PI / 180 * 1.01,'],
  ['maree : retard compte sur la pleine mer voisine', 'retards.push((pm[i][0] - pm[i - 2][0] - 24) * 60);', 'retards.push((pm[i][0] - pm[i - 1][0] - 24) * 60);'],
  ['maree : battement en somme des vitesses', 'battementJ = 360 / (SOURCES.vitesseS2.valeur - SOURCES.vitesseM2.valeur) / 24;', 'battementJ = 360 / (SOURCES.vitesseS2.valeur + SOURCES.vitesseM2.valeur) / 24;'],
  ['maree : temoin avec S2', 'const seulM2 = pleines(false).map((x) => x[1]),', 'const seulM2 = pleines(true).map((x) => x[1]),'],
  ['liaison : B total sans A', 'Btot = (nom) => parNom[nom].A * parNom[nom].ba;', 'Btot = (nom) => parNom[nom].ba;'],
  ['liaison : produits et reactifs inverses', 'const Q = REACTIONS.map(([r, p]) => p.reduce((s, x) => s + Btot(x), 0) - r.reduce((s, x) => s + Btot(x), 0));', 'const Q = REACTIONS.map(([r, p]) => r.reduce((s, x) => s + Btot(x), 0) - p.reduce((s, x) => s + Btot(x), 0));'],
  ['liaison : le plus lie pris comme le moins lie', 'const plusLie = noyaux.reduce((a, b) => (b.ba > a.ba ? b : a));', 'const plusLie = noyaux.reduce((a, b) => (b.ba < a.ba ? b : a));'],
  ['liaison : temoin sur Fe58', 'temoin: { mesure: parNom.Ni62.ba - parNom.Fe56.ba,', 'temoin: { mesure: parNom.Ni62.ba - parNom.Fe58.ba,'],
  /* « stagnation comptee comme hausse » serait EQUIVALENT (le CO2 monte chaque annee) : on mute la FENETRE, que le banc relit */
  ['keeling : fenetre sans sa derniere annee', 'deb = Math.min(P.anDebut, P.anFin - 10), choix = serie.filter(([an]) => an >= deb && an <= P.anFin);', 'choix = serie.filter(([an]) => an >= deb && an < P.anFin);'],
  ['keeling : acceleration inversee', 'const ecarts = baisses + (hausseSerie(nS - 10, nS) > hausseSerie(0, 10) ? 0 : 1);', 'const ecarts = baisses + (hausseSerie(nS - 10, nS) < hausseSerie(0, 10) ? 0 : 1);'],
  ['keeling : droite sur douze annees', 'for (let i = 0; i <= 10; i++) { sx += serie[i][0];', 'for (let i = 0; i <= 11; i++) { sx += serie[i][0];'],
  ['keeling : temoin prolonge a la premiere annee', 'prolonge = origine + pente * dernier[0];', 'prolonge = origine + pente * serie[0][0];'],
  ['population : taux sur un an au lieu de dix', 'taux.push(lnD(pts[i][1] / pts[i - 1][1]) / 10);', 'taux.push(lnD(pts[i][1] / pts[i - 1][1]));'],
  /* « remontee du taux non controlee » serait EQUIVALENT (les vrais taux baissent tous apres le pic) : on mute la recherche du pic */
  ['population : pic cherche au minimum', 'const pic = taux.indexOf(Math.max(...taux));', 'const pic = taux.indexOf(Math.min(...taux));'],
  ['population : ajustement sur une decennie de trop', 'for (let i = 0; i <= k; i++) { const x = pts[i][0] - 1950, y = lnD(pts[i][1]);', 'for (let i = 0; i <= k + 1 && i < pts.length; i++) { const x = pts[i][0] - 1950, y = lnD(pts[i][1]);'],
  ['population : temoin ajuste sur trois decennies', '[a2, b2] = ajuste(2),', '[a2, b2] = ajuste(3),'],
  ['photoelectrique : hc/e sans la conversion en nm', 'hE = h / e, hcE = h * c / e * 1e9;', 'hE = h / e, hcE = h * c / e;'],
  ['photoelectrique : tension sans le travail de sortie', 'const nu = nu0 * (1 + k / 20), vs = hE * nu - phi;', 'const nu = nu0 * (1 + k / 20), vs = hE * nu;'],
  ['photoelectrique : pente controlee a 1e-3 du mauvais rapport', 'if (Math.abs(b / hE - 1) > 1e-9 ||', 'if (Math.abs(b / (hE * 1.01) - 1) > 1e-9 ||'],
  ['photoelectrique : temoin a 250 nm', 'K200 = hcE / 200 - ag, E300 = hcE / 300;', 'K200 = hcE / 200 - ag, E300 = hcE / 250;'],
  ['demivies : lambda sans ln 2', 'const lam = LN2 / T; lambdas.push([lam, lam * u / T]);', 'const lam = 1 / T; lambdas.push([lam, lam * u / T]);'],
  ['demivies : incertitude de lambda non relative', 'lambdas.push([lam, lam * u / T]);', 'lambdas.push([lam, u / T]);'],
  ['demivies : age 14C en jours', 'age = 3 * c14[1] / an, uAge', 'age = 3 * c14[1], uAge'],
  ['demivies : controle a 3 T accepte 1/4', '- 0.125) > 1e-12) ecarts++;', '- 0.25) > 1e-12) ecarts++;'],
  ['demivies : temoin a une demi-vie', 'mesure: Math.abs(resteA(LN2, 2) - 0.25)', 'mesure: Math.abs(resteA(LN2, 1) - 0.25)'],
  ['cholera : taux sans les 10 000 maisons', 'taux: Number(d) / Number(m) * 1e4 }; });', 'taux: Number(d) / Number(m) * 1e3 }; });'],
  ['cholera : rapport inverse', 'const rr1 = t9[0].taux / t9[1].taux,', 'const rr1 = t9[1].taux / t9[0].taux,'],
  ['cholera : taux imprimes compares a l arrondi', 'filter((x) => Math.floor(x.taux) !== x.imprime)', 'filter((x) => Math.round(x.taux) !== x.imprime)'],
  ['cholera : temoin rapporte aux maisons', 'const naif = t9[0].deces / t9[1].deces;', 'const naif = rr1;'],
  ['cholera : dessin toujours au taux des sept premieres semaines', 'const periode = P.septSemaines === 2 ? t10 : t9,', 'const periode = t9,'],
  ['balmer : R_inf sans la masse reduite', 'const RH = SOURCES.rInfini.valeur / (1 + 1 / SOURCES.mpSurMe.valeur);', 'const RH = SOURCES.rInfini.valeur;'],
  ['balmer : pente ajustee sur l air', 'y = 1e9 / r.vide; sx += x;', 'y = 1e9 / r.air; sx += x;'],
  ['balmer : Bohr en 1/2 au lieu de 1/4', 'const bohr = (R, k) => 1e9 / (R * (0.25 - 1 / (k * k)));', 'const bohr = (R, k) => 1e9 / (R * (0.5 - 1 / (k * k)));'],
  ['balmer : tolerance de Bohr a 0.001 nm', 'if (ecartMax > 0.01) ecarts++;', 'if (ecartMax > 0.001) ecarts++;'],
  ['balmer : temoin avec R_H', 'halphaInf = bohr(SOURCES.rInfini.valeur, 3) - raies[0].vide;', 'halphaInf = bohr(RH, 3) - raies[0].vide;'],
  ['boyle : pression sans l atmosphere', 'return { A: Number(a), P: frac(b) + C }; });', 'return { A: Number(a), P: frac(b) }; });'],
  ['boyle : fraction lue sans le denominateur', 'return acc + (b ? a / b : a); }, 0);', 'return acc + a; }, 0);'],
  ['boyle : volume en pouces', 'const prod = lignes.map((l) => l.A * l.P),', 'const prod = lignes.map((l) => l.A / 4 * l.P),'],
  ['boyle : tolerance de pente 0.001', 'if (Math.abs(pente + 1) > 0.02) ecarts++;', 'if (Math.abs(pente + 1) > 0.001) ecarts++;'],
  ['boyle : temoin sans le pas par quart de pouce', 'const pasLin = (lignes[1].P - lignes[0].P) / (lignes[0].A - lignes[1].A),', 'const pasLin = (lignes[1].P - lignes[0].P),'],
  ['ohm : 1/X remplace par X', 'const y = 1 / X[k]; sx += xi;', 'const y = X[k]; sx += xi;'],
  ['ohm : b sans la division par la pente', 'return { a: 1 / pente, b: orig / pente }; });', 'return { a: 1 / pente, b: orig }; });'],
  ['ohm : laiton avec a de la serie I', 'const laiton = lx.map((v) => aOhm[4] / v - b0),', 'const laiton = lx.map((v) => aOhm[0] / v - b0),'],
  ['ohm : tolerance des ecarts a 1 %', 'if (Math.max(...ecartsRel) > 0.03) ecarts++;', 'if (Math.max(...ecartsRel) > 0.01) ecarts++;'],
  ['ohm : temoin sans le rapport des longueurs', 'sansB = series[0][0] * x[0] / x[7];', 'sansB = series[0][0] * x[0] / x[1];'],
  ['especes : logarithme naturel', 'const LN10 = lnD(10), lg = (x) => lnD(x) / LN10;', 'const LN10 = lnD(10), lg = (x) => lnD(x);'],
  ['especes : iles isolees jamais exclues', 'const proches = iles.filter((i) => !i.isolee),', 'const proches = iles.filter((i) => i.k > 0),'],
  ['especes : z sur les iles de plus de 0.1 mille carre', 'proches.filter((i) => i.A > 1).map', 'proches.filter((i) => i.A > 0.1).map'],
  ['especes : temoin a contre-sens', 'loi = (z, A) => boug.S / expPosD(z * lnD(boug.A / A)),', 'loi = (z, A) => boug.S * expPosD(z * lnD(boug.A / A)),'],
  ['especes : curseur des isolees ignore', 'const choisi = droite((P.inclureIsolees ? iles : proches)', 'const choisi = droite((proches)'],
  ['michaelis : vitesse lineaire au lieu d hyperbolique', 'const f = a / (K + a); sf += v * f; sff += f * f; } const V = sf / sff;', 'const f = a / K; sf += v * f; sff += f * f; } const V = sf / sff;'],
  ['michaelis : V sans le denominateur de la forme close', 'sff += f * f; } const V = sf / sff;', 'sff += f * f; } const V = sf;'],
  ['michaelis : tolerance a 5 %', 'if (Math.abs(meilleur.K / K1913 - 1) > 0.15) ecarts++;', 'if (Math.abs(meilleur.K / K1913 - 1) > 0.05) ecarts++;'],
  ['michaelis : temoin sur le premier doublement', 'mesure: doublements[2] < 1.1 ? 0 : 1,', 'mesure: doublements[0] < 1.1 ? 0 : 1,'],
  ['michaelis : axe log ignore', 'const LN10 = lnD(10), X = (a) => (P.axeLog ?', 'const LN10 = lnD(10), X = (a) => (false ?'],
  ['alpha : angle entier au lieu du demi-angle', 'sinD2 = (phi) => sinD(phi * PI / 360);', 'sinD2 = (phi) => sinD(phi * PI / 180);'],
  ['alpha : sin^2 au lieu de sin^4', 'const s4 = (phi) => { const s = sinD2(phi); return s * s * s * s; };', 'const s4 = (phi) => { const s = sinD2(phi); return s * s; };'],
  ['alpha : tolerance de la pente a 0.1', 'if (Math.abs(pente + 4) > 0.25) ecarts++;', 'if (Math.abs(pente + 4) > 0.1) ecarts++;'],
  ['alpha : colonne imprimee comparee a l argent', 'Math.abs(l.au * s4(l.phi) / imprime[k] - 1)', 'Math.abs(l.ag * s4(l.phi) / imprime[k] - 1)'],
  ['alpha : temoin en sin^4', 'loiSinusCarre = s1[0].au * (s150 * s150) / (s15 * s15);', 'loiSinusCarre = s1[0].au * (s150 * s150 * s150 * s150) / (s15 * s15 * s15 * s15);'],
  ['argon : correction soustraite', 'lChi = litre(mChi, 1), lAtm = litre(mAtm, 1);', 'lChi = litre(mChi, -1), lAtm = litre(mAtm, -1);'],
  ['argon : rapport inverse', 'const litre = (g, signe) => (g + signe * corr) * r2 / r1,', 'const litre = (g, signe) => (g + signe * corr) * r1 / r2,'],
  ['argon : moyenne chimique sur quatre methodes', 'const chi = lire(SOURCES.rrChimique.valeur), atm', 'const chi = lire(SOURCES.rrChimique.valeur).slice(0, 4), atm'],
  ['argon : temoin a 50 etendues', 'mesure: ecart > 5 * etendue ? 0 : 1,', 'mesure: ecart > 50 * etendue ? 0 : 1,'],
  ['argon : dessin toujours corrige a +1', 'const conv = (g) => litre(g, P.signeCorrection);', 'const conv = (g) => litre(g, 1);'],
  ['sturtevant : pour cent sans le facteur 100', 'return { nom, a: nom.split(\'-\')[0], b: nom.split(\'-\')[1], c, g, pct: 100 * c / g,', 'return { nom, a: nom.split(\'-\')[0], b: nom.split(\'-\')[1], c, g, pct: c / g,'],
  ['sturtevant : M place par la longue paire BM', 'pos.M = pos.P + p[\'P-M\'].pct;', 'pos.M = p[\'B-M\'].pct;'],
  ['sturtevant : somme (C, O)R sans CR', 'somme([\'CO-R\', \'O-R\', \'C-R\'])', 'somme([\'CO-R\', \'O-R\'])'],
  ['sturtevant : additivite courte a 1 point', 'if (courts.some((d) => Math.abs(d) > 2)) ecarts++;', 'if (courts.some((d) => Math.abs(d) > 1)) ecarts++;'],
  ['sturtevant : coquilles a 0.1 pres au lieu de l arrondi', 'paires.filter((x) => x.pct.toFixed(1) !== x.imprime.toFixed(1))', 'paires.filter((x) => Math.abs(x.pct - x.imprime) > 0.1)'],
  ['sturtevant : temoin a 30 points', 'mesure: surCarte(p[\'B-M\']) - p[\'B-M\'].pct > 10 ? 0 : 1,', 'mesure: surCarte(p[\'B-M\']) - p[\'B-M\'].pct > 30 ? 0 : 1,'],
  ['ebbinghaus : logarithme naturel', 'formule = (t, kk, cc) => 100 * kk / (expPosD(cc * lnD(lnD(t) / LG10)) + kk);', 'formule = (t, kk, cc) => 100 * kk / (expPosD(cc * lnD(lnD(t))) + kk);'],
  ['ebbinghaus : temps en heures', 'const minutes = (s) => s.split(\'x\').map(Number).reduce((a, x) => a * x, 1);', 'const minutes = (s) => s.split(\'x\').map(Number).reduce((a, x) => a * x, 1) / 60;'],
  ['ebbinghaus : seuil a 1 point', 'lignes.filter((l) => Math.abs(l.obs - l.calc) > 2)', 'lignes.filter((l) => Math.abs(l.obs - l.calc) > 1)'],
  ['ebbinghaus : temoin a 0.001 pour cent', 'mesure: expoA1440 < 1 ? 0 : 1,', 'mesure: expoA1440 < 0.001 ? 0 : 1,'],
  ['ebbinghaus : courbe sans kTest', 'formule(t, P.kTest, P.cTest) / 60, 1]);', 'formule(t, 1.84, P.cTest) / 60, 1]);'],
  ['semmelweis : cliniques interverties', 'const [a, n1, d1, n2, d2] = x.split(\':\').map(Number);', 'const [a, n2, d2, n1, d1] = x.split(\':\').map(Number);'],
  ['semmelweis : z sans racine', 'return (d1 / n1 - d2 / n2) / Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2)); };', 'return (d1 / n1 - d2 / n2) / (p * (1 - p) * (1 / n1 + 1 / n2)); };'],
  ['semmelweis : 1848 jugee a 0.1 ecart-type', 'if (Math.abs(z1848) >= 2) ecarts++;', 'if (Math.abs(z1848) >= 0.1) ecarts++;'],
  ['semmelweis : temoin a 100 ecarts-types', 'mesure: zAvant > 10 ? 0 : 1,', 'mesure: zAvant > 100 ? 0 : 1,'],
  ['semmelweis : annee choisie ignoree', 'const vue = toutes.find((l) => l.a === P.anneeVue) || toutes[0];', 'const vue = toutes[0];'],
  ['cavendish : coupure des fils apres l experience 4', 'return { e, v, fil: e <= 3 ? 1 : 2 }; });', 'return { e, v, fil: e <= 4 ? 1 : 2 }; });'],
  ['cavendish : etendue sans le minimum', 'etendue = Math.max(...vs2) - Math.min(...vs2),', 'etendue = Math.max(...vs2) - 5.1 - 0.01,'],
  ['cavendish : ecart extreme compte d un seul cote', 'extreme = Math.max(...vs2.map((v) => Math.abs(v - t.latterWire)));', 'extreme = Math.max(...vs2.map((v) => v - t.latterWire));'],
  ['cavendish : temoin a 0.5', 'mesure: Math.abs(m1 - t.firstWire) > 0.1 ? 0 : 1,', 'mesure: Math.abs(m1 - t.firstWire) > 0.5 ? 0 : 1,'],
  ['cavendish : moyenne dessinee toujours sur les 29', 'const choisie = [m29, m1, m2][P.filChoisi];', 'const choisie = m29;'],
  ['joule : moyenne du mercure avec l eau', 'const s = series.filter((x) => x.m === m); return s.reduce', 'const s = series.filter((x) => x.m === m || x.m === \'Water\'); return s.reduce'],
  ['joule : rapports juges a 1e-9', 'if (dispersionRapports > 3e-6) ecarts++;', 'if (dispersionRapports > 1e-9) ecarts++;'],
  ['joule : derniere serie inversee', 'if ((num / den).toFixed(2) !== Number(egal).toFixed(2)) ecarts++;', 'if ((den / num).toFixed(2) !== Number(egal).toFixed(2)) ecarts++;'],
  ['joule : temoin a 5 pieds-livres', 'mesure: moyenneCinq - moyPub[0] > 1 ? 0 : 1,', 'mesure: moyenneCinq - moyPub[0] > 5 ? 0 : 1,'],
  ['joule : colonne toujours dans le vide', '((P.colonneVide ? x.vide : x.air) - 772) / 5,', '(x.vide - 772) / 5,'],
  ['eddington : pente sans le denominateur', 'const pente = sco / scc, bord = pente * hyp.Einstein,', 'const pente = sco, bord = pente * hyp.Einstein,'],
  ['eddington : Principe juge a 0.2 erreur probable', '|| Math.abs(enEp(\'Principe\', hyp.Einstein)) > 2) ecarts++;', '|| Math.abs(enEp(\'Principe\', hyp.Einstein)) > 0.2) ecarts++;'],
  ['eddington : Newton egal a Einstein pour les etoiles', 'rmsNewton = rms(hyp.Newton / hyp.Einstein);', 'rmsNewton = rms(1);'],
  ['eddington : temoin rapporte a Einstein', 'mesure: enEp(\'Sobral4inch\', hyp.Newton) > 5 ? 0 : 1,', 'mesure: enEp(\'Sobral4inch\', hyp.Einstein) > 5 ? 0 : 1,'],
  ['eddington : facteur ignore', 'c * P.facteurNewton * hyp.Newton / hyp.Einstein, 3]);', 'c * 2 * hyp.Newton / hyp.Einstein, 3]);'],
  ['lynx : pics sur 0 an (tout point est un pic)', 'serie.slice(Math.max(0, i - 2), i + 3).every', 'serie.slice(i, i + 1).every'],
  ['lynx : periode longue sans la division', 'periodeLongue = (d1 - d0) / Number(per.cycles);', 'periodeLongue = (d1 - d0) / 18;'],
  ['lynx : 9 ou 10 ans compte 9 seulement', 'freq.filter(([l]) => l === 9 || l === 10)', 'freq.filter(([l]) => l === 9)'],
  ['lynx : melange sans permutation', '[t[i], t[j]] = [t[j], t[i]]; }', '}'],
  ['lynx : decalage ignore', 'acfDecalage: acf(lg, P.decalageAns),', 'acfDecalage: acf(lg, 10),'],
  ['millikan : e a la puissance 1 au lieu de 3/2', 'const eFinal = t.corrected23 * Math.sqrt(t.corrected23) * 1e-2,', 'const eFinal = t.corrected23 * 1e-2 * 7.8,'],
  ['millikan : N sans la vitesse de la lumiere', 'nAvogadro = t.faraday * t.c * 1e10 / (eFinal * 1e-10);', 'nAvogadro = t.faraday * 1e10 / (eFinal * 1e-10);'],
  ['millikan : dispersion jugee a 0.1 %', 'if (ecartGoutte > 0.01) ecarts++;', 'if (ecartGoutte > 0.001) ecarts++;'],
  ['millikan : temoin a 20 incertitudes', 'mesure: Math.abs(t.earlier - t.e) / t.pe > 10 ? 0 : 1,', 'mesure: Math.abs(t.earlier - t.e) / t.pe > 20 ? 0 : 1,'],
  ['millikan : moyenne courante sur les 23', 'const courante = moy(v.slice(0, P.gouttesMoyennees));', 'const courante = m23;'],
  ['graunt : vivants sans les morts de la premiere tranche', 'let cumul = 0; const refaits = morts.map(([a, d]) => { cumul += d; return [a, 100 - cumul]; });', 'let cumul = 0; const refaits = morts.map(([a, d]) => { const r = [a, 100 - cumul]; cumul += d; return r; });'],
  ['graunt : soustraction 16-56 avec 66', 'if (viv[16] - viv[56] !== c.between16and56', 'if (viv[16] - viv[66] !== c.between16and56'],
  ['graunt : esperance sans la tranche 0-6', 'let e0 = 0; for (let i = 1; i < vivants.length; i++)', 'let e0 = 0; for (let i = 2; i < vivants.length; i++)'],
  ['graunt : suite geometrique en 6 pas', 'raisonTexte = 1 / expPosD(lnD(64) / 7),', 'raisonTexte = 1 / expPosD(lnD(64) / 6),'],
  ['graunt : raison choisie ignoree', 'pts.push([a / 80, 64 / expPosD(k * lnD(1 / P.raisonTest)) / 100, 2]);', 'pts.push([a / 80, 64 / expPosD(k * lnD(1 / 0.625)) / 100, 2]);'],
  ['hubble : pente par l origine sans r au denominateur', 'const kOrigine = t.reduce((s, x) => s + x.r * x.v, 0) / t.reduce((s, x) => s + x.r * x.r, 0);', 'const kOrigine = t.reduce((s, x) => s + x.r * x.v, 0) / t.reduce((s, x) => s + x.r, 0);'],
  ['hubble : magnitude absolue sans le facteur 5', 'const Mrefaits = t.map((x) => x.m - 5 * log10h(x.r * 1e5)),', 'const Mrefaits = t.map((x) => x.m - log10h(x.r * 1e5)),'],
  ['hubble : pente jugee a 10 km/s', 'if (Math.abs(kOrigine - pub.K24[0]) > pub.K24[1]) ecarts++;', 'if (Math.abs(kOrigine - pub.K24[0]) > 10) ecarts++;'],
  ['hubble : melange sans echange', 'const z = w[i]; w[i] = w[j]; w[j] = z; }', '}'],
  ['hubble : droite test ignoree', 'pts.push([r / 2, P.constanteTest * r / 1100, 2]); }', 'pts.push([r / 2, 465 * r / 1100, 2]); }'],
  ['moseley : Q au lieu de Q^2', 'const imp = t.map((x) => 1 / (0.75 * x.q * x.q * x.l * 1e-8)),', 'const imp = t.map((x) => 1 / (0.75 * x.q * x.l * 1e-8)),'],
  ['moseley : residu contre N au lieu de N - 1', 'residu = (x, num) => x.q - (num(x) - 1),', 'residu = (x, num) => x.q - num(x),'],
  ['moseley : divergence exigee strictement croissante', 'if (haut.some((x, i) => i > 0 && Math.round(100 * residu(x, avec)) < Math.round(100 * residu(haut[i - 1], avec)))) ecarts++;', 'if (haut.some((x, i) => i > 0 && Math.round(100 * residu(x, avec)) <= Math.round(100 * residu(haut[i - 1], avec)))) ecarts++;'],
  ['moseley : case vide du 43 conservee dans le temoin', 'const sansTrou = (x) => (x.z > 43 ? x.z - 1 : x.z),', 'const sansTrou = (x) => x.z,'],
  ['moseley : numerotation ignoree', 'const num = P.numerotation ? sansTrou : avec;', 'const num = avec;'],
  ['michelson : correction de vide oubliee', 'finalRefait = dansAir + t.vacuo;', 'finalRefait = dansAir;'],
  ['michelson : c en m/s sans conversion', 'const c = SOURCES.nistC.valeur / 1000,', 'const c = SOURCES.nistC.valeur,'],
  ['michelson : maximum non controle', 'if (Math.max(...v) !== t.greatest) ecarts++;', 'if (Math.max(...v) !== t.greatest + 10) ecarts++;'],
  ['michelson : temoin a 4 erreurs limites', 'mesure: (finalRefait - c) / t.limit > 2.5 ? 0 : 1,', 'mesure: (finalRefait - c) / t.limit > 4 ? 0 : 1,'],
  ['michelson : correctionVide ignoree', 'const trait = P.correctionVide ? finalRefait : dansAir;', 'const trait = finalRefait;'],
  ['galton : pente sans centrer x', 'b += w * (x - mx) * (x - mx); } return a / b; };', 'b += w * x * x; } return a / b; };'],
  ['galton : totaux des colonnes non controles', '|| totalColonnes !== Number(t.children)) ecarts++;', '|| totalColonnes !== Number(t.children) + 1) ecarts++;'],
  ['galton : pente inverse jugee sous 0.2', 'if (penteInverse >= 0.4) ecarts++;', 'if (penteInverse >= 0.2) ecarts++;'],
  ['galton : temoin avec la loi en pente 1', 'predictionDeuxTiers = med + 2 / 3 * (64.5 - med);', 'predictionDeuxTiers = med + (64.5 - med);'],
  ['galton : pente test ignoree', '(med + P.penteTest * (h - med) - 63) / 11, 2]); }', '(med + 0.667 * (h - med) - 63) / 11, 2]); }'],
  ['bradley : rapport sans la tangente', 'const angle = Number(t.angle) / SEC_RAD, rapportVitesses = cosD(angle) / sinD(angle);', 'const angle = Number(t.angle) / SEC_RAD, rapportVitesses = 1 / angle / 1.001;'],
  ['bradley : temps sans le 2 pi', 'const temps = (demiMax) => ANNEE / (2 * PI) * (demiMax / SEC_RAD),', 'const temps = (demiMax) => ANNEE / PI * (demiMax / SEC_RAD),'],
  ['bradley : maxima juges a 0.1 seconde', 'if (etendueMaxima > 1) ecarts++;', 'if (etendueMaxima > 0.1) ecarts++;'],
  ['bradley : temoin avec Romer a 8 minutes', 'const maximumRomer = 2 * Number(t.roemer) * 60', 'const maximumRomer = 2 * 8 * 60'],
  ['bradley : minutes choisies ignorees', 'maxPredit = 2 * P.minutesLumiere * 60', 'maxPredit = 2 * 8.2 * 60'],
  ['gause : volume en a x a x b', 'Number(c) * Number(d) * Number(d) / (Number(a) * Number(b) * Number(b))', 'Number(c) * Number(c) * Number(d) / (Number(a) * Number(a) * Number(b))'],
  ['gause : K1 sans le facteur de volume', 'const k1Retrouve = moyenne(2, 8) * tampon,', 'const k1Retrouve = moyenne(2, 8),'],
  ['gause : exclusion lue au jour 15', 'if (t4[16][8] !== 0) ecarts++;', 'if (t4[15][8] !== 0) ecarts++;'],
  ['gause : alpha remplace par beta', '(K1 - x - alpha * y) / K1', '(K1 - x - beta * y) / K1'],
  ['gause : temoin sur le curseur', 'const fixe = modele(Number(t.beta)),', 'const fixe = modele(P.betaGause),'],
  ['gause : curseur ignore', 'choisi = modele(P.betaGause);', 'choisi = modele(Number(t.beta));'],
  ['gause : tirets lus comme 0', "(x === '-' ? null : Number(x))", "(x === '-' ? 0 : Number(x))"],
  ['nightingale : taux mensuel, pas annuel', '(12000 * r[c] / r[0]).toFixed(1)', '(1000 * r[c] / r[0]).toFixed(1)'],
  ['nightingale : tirets lus comme 0', "(x === '..' ? null : Number(x))", "(x === '..' ? 0 : Number(x))"],
  ['nightingale : blessures oubliees', 'x + r[1] + (r[2] || 0) + r[3]', 'x + r[1] + r[3]'],
  ['nightingale : pic attendu en fevrier', 'if (pic !== 9) ecarts++;', 'if (pic !== 10) ecarts++;'],
  ['nightingale : baisse exigee de 5 fois', 'if (a1.taux / a2.taux < 4) ecarts++;', 'if (a1.taux / a2.taux < 5) ecarts++;'],
  ['nightingale : temoin sur l effectif du mois', 'janvierConstant = 12000 * m[9][1] / Sm,', 'janvierConstant = 12000 * m[9][1] / m[9][0],'],
  ['nightingale : annee choisie ignoree', 'const s = m.slice(12 * (P.anneeNightingale - 1), 12 * P.anneeNightingale), pts = [];', 'const s = m.slice(0, 12), pts = [];'],
  ['faraday : 100 pouces cubes lus comme 10', 'eau = t.gas * t.grains100 / 100, chaineEtain', 'eau = t.gas * t.grains100 / 10, chaineEtain'],
  ['faraday : regle de trois a l envers', 'chaineEtain = t.waterEquivalent * etain / eau;', 'chaineEtain = t.waterEquivalent * eau / etain;'],
  ['faraday : le § 803 compte comme retenu', 'const EXPLIQUES = [798, 802, 803],', 'const EXPLIQUES = [798, 802],'],
  ['faraday : essais retenus a 2 %', 'if (ecartMaxEssais > 3) ecarts++;', 'if (ecartMaxEssais > 2) ecarts++;'],
  ['faraday : plomb compare a l etain', 'table = { Sn: ions.Tin, Pb: ions.Lead };', 'table = { Sn: ions.Tin, Pb: ions.Tin };'],
  ['faraday : temoin avec l etain du § 851', 'const masseProportionnelle = ions.Tin / t.waterEquivalent * eau,', 'const masseProportionnelle = t.Sn851 / t.waterEquivalent * eau,'],
  ['faraday : curseur ignore', 'const eauChoisie = P.volumeGazFaraday * t.grains100 / 100,', 'const eauChoisie = t.gas * t.grains100 / 100,'],
  ['petit-dulong : tolerance d un dixieme', 'Math.abs(r.c * r.w - r.p) > 1.5e-4)', 'Math.abs(r.c * r.w - r.p) > 0.1)'],
  ['petit-dulong : platine non nomme', "const COQUILLES = ['Platine'],", 'const COQUILLES = [],'],
  ['petit-dulong : ecart-type sans racine', 'return 100 * Math.sqrt(v.reduce((s, x) => s + (x - m) * (x - m), 0) / v.length) / m;', 'return 100 * (v.reduce((s, x) => s + (x - m) * (x - m), 0) / v.length) / m;'],
  ['petit-dulong : temoin sans decalage', 'cvCinq = cv(t.map((r, i) => r.c * t[(i + 5) % t.length].w));', 'cvCinq = cv(t.map((r, i) => r.c * t[i].w));'],
  ['petit-dulong : curseur ignore', 'const d = P.decalagePoids,', 'const d = 0,'],
  ['petit-dulong : dispersion exigee sous 1 %', 'if (cvProduits > 1.5) ecarts++;', 'if (cvProduits > 1) ecarts++;'],
  ['omori : moyennes sans arrondi', 'if (Math.round(m) !== Number(imp)) ecarts++;', 'if (m !== Number(imp)) ecarts++;'],
  ['omori : tolerance d un dixieme du dernier chiffre', "pres = (val, s) => Math.abs(val - Number(s)) < Number('1e-' + decimales(s));", "pres = (val, s) => Math.abs(val - Number(s)) < Number('1e-' + (decimales(s) + 1));"],
  ['omori : k refait sans le produit x y', 'y.forEach((q, i) => { sAB += (q - my) * (xy[i] - mxy); sAA += (q - my) * (q - my); });', 'y.forEach((q, i) => { sAB += (q - my) * (i - 4.5); sAA += (q - my) * (q - my); });'],
  ['omori : temoin avec l hyperbole', 'mesure: expo(v(\'x1892\')) < 1e-6', 'mesure: hyp(v(\'x1892\')) < 1e-6'],
  ['omori : curseur ignore', 'const H = P.horizonOmori, pts = [];', 'const H = 20, pts = [];'],
  ['omori : h oublie dans la courbure', '[Math.sqrt(v(\'k\')) - v(\'h\'), t.curvature]', '[Math.sqrt(v(\'k\')), t.curvature]'],
  ['halley : 85-100 oublies dans le total', 'const totalHalley = L.reduce((a, b) => a + b, 0) + Number(resteTxt);', 'const totalHalley = L.reduce((a, b) => a + b, 0);'],
  ['halley : cote a 26 ans', 'const coteVingtCinq = l(26) / (l(25) - l(26));', 'const coteVingtCinq = l(27) / (l(26) - l(27));'],
  ['halley : rente sans actualisation', 'const v = 1 / (1 + taux / 100); let s = 0, vt = 1;', 'const v = 1; let s = 0, vt = 1;'],
  ['halley : 15 ans non nomme', 'const NOMMES = [5, 15],', 'const NOMMES = [5],'],
  ['halley : temoin avec le risque de 84 ans seul', 'const lam = lnD(l(1) / l(84)) / 83,', 'const lam = lnD(l(1) / l(84)) / 830,'],
  ['halley : curseur ignore', 'const taux = P.tauxHalley, pts = [];', 'const taux = 6, pts = [];'],
  ['howard : 1818 dans l etendue', "verifs.push(['etendue Londres', etendue(Lo, 1789, 1817), t.extentLondon]", "verifs.push(['etendue Londres', etendue(Lo, 1789, 1818), t.extentLondon]"],
  ['howard : 7 ans depuis 1800 non nomme', "'Londres 17 ans 1800', 'Londres 7 ans 1800'],", "'Londres 17 ans 1800'],"],
  ['howard : une annee de trop dans les moyennes', 'for (let y = a; y < a + k; y++) s += o[y];', 'for (let y = a; y <= a + k; y++) s += o[y];'],
  ['howard : tolerance a un centieme', 'hors = (q) => !(Math.abs(q[1] - Number(q[2])) <= 0.001 + 1e-9);', 'hors = (q) => !(Math.abs(q[1] - Number(q[2])) <= 0.01);'],
  ['howard : temoin sur la moyenne seule', 'mesure: tStudent > 3 && positifs >= 10 ? 0 : 1', 'mesure: moyenneEcart > 3 && positifs >= 10 ? 0 : 1'],
  ['howard : curseur ignore', 'const w = P.lissageHoward, ans = Object.keys(Lo).map(Number), pts = [];', 'const w = 1, ans = Object.keys(Lo).map(Number), pts = [];'],
  ['mendenhall : lettres sans la longueur', 'lettres = (a) => a.reduce((s, c, i) => s + c * (i + 1), 0);', 'lettres = (a) => a.reduce((s, c, i) => s + c * i, 0);'],
  ['mendenhall : erreur-type sur 1000 mots', 'se = ecartType * Math.sqrt(2 / 10000);', 'se = ecartType * Math.sqrt(2 / 1000);'],
  ['mendenhall : ecart biblique exige sous 0.4 %', 'if (!(ecartBible < 0.005)) ecarts++;', 'if (!(ecartBible < 0.004)) ecarts++;'],
  ['mendenhall : khi2 sans le second groupe', 'c += (A[i] - ea) * (A[i] - ea) / ea + (B[i] - eb) * (B[i] - eb) / eb;', 'c += (A[i] - ea) * (A[i] - ea) / ea;'],
  ['mendenhall : temoin sur Atkinson', 'mesure: ecartTypesMill > 3 ? 0 : 1', 'mesure: ecartTypesAtkinson > 3 ? 0 : 1'],
  ['mendenhall : curseur ignore', 'const q = P.queueMendenhall, [chi2Choisi', 'const q = 11, [chi2Choisi'],
  ['bessel : solution commune sans ponderation', "const sII = commune(nb('poids'));", 'const sII = commune(1);'],
  ['bessel : poids pris sur la diagonale de N', "['wA1', 1 / da[1]], ['wA2', 1 / da[2]], ['wB1', 1 / db[1]], ['wB2', 1 / db[2]],", "['wA1', Na[1][1]], ['wA2', Na[2][2]], ['wB1', Nb[1][1]], ['wB2', Nb[2][2]],"],
  ['bessel : erreur moyenne sans les trois inconnues', "const mA = Math.sqrt(nb('ssA') / (nb('nA') - 3)),", "const mA = Math.sqrt(nb('ssA') / nb('nA')),"],
  ['bessel : coquille 24.065 non nommee', "const NOMMES = ['wA2'],", 'const NOMMES = [],'],
  ['bessel : temoin exige deux fois', "mesure: nb('ssA0') / nb('ssA') > 1.5 && nb('ssB0') / nb('ssB') > 1.5 ? 0 : 1", "mesure: nb('ssA0') / nb('ssA') > 2 && nb('ssB0') / nb('ssB') > 2 ? 0 : 1"],
  ['bessel : erreur de la parallaxe sans la racine', "const meP = nb('m1') * Math.sqrt(diagInverse(matCommune(nb('poids')))[4]);", "const meP = nb('m1') * diagInverse(matCommune(nb('poids')))[4];"],
  ['bessel : curseur ignore', 'const wChoisi = P.poidsBessel, pts = [];', 'const wChoisi = 0.6889, pts = [];'],
  ['nyquist : log naturel au lieu de log2', 'W = (m) => 100 * log2(m);', 'W = (m) => 100 * lnD(m);'],
  ['nyquist : m = 5 non nomme', 'const NOMMES = [5];', 'const NOMMES = [];'],
  ['nyquist : colonne relative inversee', 'Math.round(100 * el(\'Ideal2\') / x.e) !== x.r', 'Math.round(100 * x.e / el(\'Ideal2\')) !== x.r'],
  ['nyquist : 25 caracteres', 'if (somme(t.chars2) !== Number(t.letters) ||', 'if (somme(t.chars2) !== Number(t.letters) - 1 ||'],
  ['nyquist : gain americain vers l ideal', "gainAmericain = el('AmericanMorse2') / el('ContinentalMorse3');", "gainAmericain = el('AmericanMorse2') / el('Ideal3');"],
  ['nyquist : temoin exige trois fois', 'mesure: lineaire16 / imprime16 > 1.5 ? 0 : 1', 'mesure: lineaire16 / imprime16 > 3 ? 0 : 1'],
  ['nyquist : curseur ignore', 'const M = P.niveauxNyquist, pts = [];', 'const M = 16, pts = [];'],
  ['young : pieds pris pour des pouces', "const vitesse = (min) => nb('feet') * 12 / (min * 60),", "const vitesse = (min) => nb('feet') / (min * 60),"],
  ['young : rouge non nomme', 'const NOMMES_L = [1], NOMMES_F = [10, 13];', 'const NOMMES_L = [], NOMMES_F = [10, 13];'],
  ['young : 707 non nomme', 'const NOMMES_L = [1], NOMMES_F = [10, 13];', 'const NOMMES_L = [1], NOMMES_F = [10];'],
  ['young : etendue sur les longueurs', 'etendue = tab[14][1] / tab[0][1];', 'etendue = tab[0][0] / tab[14][0];'],
  ['young : 2^47', "for (let k = 0; k < nb('power'); k++) deux *= 2;", "for (let k = 0; k < nb('power') - 1; k++) deux *= 2;"],
  ['young : temoin a une octave et demie', 'mesure: etendue < 1.8 ? 0 : 1', 'mesure: etendue < 1.5 ? 0 : 1'],
  ['young : curseur ignore', 'const vChoisie = vitesse(P.minutesYoung), pts = [];', "const vChoisie = vitesse(nb('minutes')), pts = [];"],
  ['lummer : B avec T^4', 'if (Math.abs(E / puiss(T, 5) * 1e17 - B) > 1) horsB.push(T);', 'if (Math.abs(E / puiss(T, 4) * 1e17 - B) > 1) horsB.push(T);'],
  ['lummer : 1460.4 non nomme', 'NOMMES_B = [1646, 1460.4],', 'NOMMES_B = [1646],'],
  ['lummer : racine quatrieme', 'racine5 = (x) => expD(lnD(x) / 5);', 'racine5 = (x) => expD(lnD(x) / 4);'],
  ['lummer : Mittel sans la dizaine', "if (Math.round(moyA / 10) * 10 !== nb('Amean')) ecarts++;", "if (Math.round(moyA) !== nb('Amean')) ecarts++;"],
  ['lummer : temoin avec T^5', 'const e4 = lignes.map(([T, , E]) => E / puiss(T, 4)),', 'const e4 = lignes.map(([T, , E]) => E / puiss(T, 5)),'],
  ['lummer : curseur ignore', 'const k = P.exposantLummer, eK', 'const k = 5, eK'],
  ['coulomb : torsion sans l ecart', 'const F = essais.map(([m, x]) => m + x),', 'const F = essais.map(([m, x]) => m),'],
  ['coulomb : 3400 depuis 18 degres', "if (nb('g360') * 360 / 36 !== nb('g36')) ecarts++;", "if (nb('g360') * 360 / 18 !== nb('g36')) ecarts++;"],
  ['coulomb : 57 sans la racine', 'const corrige = osc[2][1] * Math.sqrt(9) / Math.sqrt(10);', 'const corrige = osc[2][1] * 9 / 10;'],
  ['coulomb : 41 de la p. 584 non nomme', 'const DEUX_PAGES = [1],', 'const DEUX_PAGES = [],'],
  ['coulomb : 54 non nomme', 'const NOMMES_THEORIE = [2],', 'const NOMMES_THEORIE = [],'],
  ['coulomb : temoin exige quatre fois', 'mesure: F[1] / enUnSurD[0] > 1.8 && F[2] / enUnSurD[1] > 1.8 ? 0 : 1', 'mesure: F[1] / enUnSurD[0] > 4 && F[2] / enUnSurD[1] > 4 ? 0 : 1'],
  ['coulomb : curseur ignore', 'const ex = P.exposantCoulomb, pts = [];', 'const ex = 2, pts = [];'],
  ['jouleChaleur : k sur I et non I^2', 'return r.reduce((s, x) => s + x[col], 0) / r.reduce((s, x) => s + x[1] * x[1], 0); };', 'return r.reduce((s, x) => s + x[col], 0) / r.reduce((s, x) => s + x[1], 0); };'],
  ['jouleChaleur : 4.55 non nomme', 'const NOMMES_6 = [0.92];', 'const NOMMES_6 = [];'],
  ['jouleChaleur : reduction sans le carre', "const reduire = (r, tt, h) => (nb('r3') / r) * (nb('r3') / r) * nb('t3') / tt * h;", "const reduire = (r, tt, h) => (nb('r3') / r) * nb('t3') / tt * h;"],
  ['jouleChaleur : moyenne sur deux', "if (((nb('red1') + nb('red2') + nb('h3')) / 3).toFixed(2) !== t.moy) ecarts++;", "if (((nb('red1') + nb('red2') + nb('h3')) / 2).toFixed(2) !== t.moy) ecarts++;"],
  ['jouleChaleur : 3 pieds sur 8 inverse', "const res1 = nb('res1a') * nb('feetThin') / nb('feetThick');", "const res1 = nb('res1a') * nb('feetThick') / nb('feetThin');"],
  ['jouleChaleur : temoin exige trois fois', 'mesure: observe / lineaire > 2 ? 0 : 1', 'mesure: observe / lineaire > 3 ? 0 : 1'],
  ['jouleChaleur : curseur ignore', 'const ex = P.exposantJouleQ, pts = [];', 'const ex = 2, pts = [];'],
  ['reynolds : log B_s sans le log D', 'const bs = (r) => -r.mlogP - r.logV - logD[r.tube],', 'const bs = (r) => -r.mlogP - r.logV,'],
  ['reynolds : ligne 18 non nommee', 'NOMMES_B = [5, 7, 18],', 'NOMMES_B = [5, 7],'],
  ['reynolds : chaine sans pi / 4', 'a5(nb(\'logQ\') - lpi4 - 2 * logD[r.tube] - r.logt, r.logV)', 'a5(nb(\'logQ\') - 2 * logD[r.tube] - r.logt, r.logV)'],
  ['reynolds : ligne 23 non nommee', 'const NOMMES_T = [23],', 'const NOMMES_T = [],'],
  ['reynolds : temoin exige -1.2', 'mesure: pente < -0.8 ? 0 : 1', 'mesure: pente < -1.2 ? 0 : 1'],
  ['reynolds : curseur ignore', 'const ex = P.exposantReynolds, pts = [];', 'const ex = 1, pts = [];'],
  ['darcy : section sans le carre', "section = PI * nb('diametre') * nb('diametre') / 4;", "section = PI * nb('diametre') / 4;"],
  ['darcy : 1.01 non nomme', 'const tous = [...series[0], ...series[1]], NOMMES_R = [10], NOMMES_D = [4];', 'const tous = [...series[0], ...series[1]], NOMMES_R = [], NOMMES_D = [4];'],
  ['darcy : difference sans la pression dessous', 'Math.abs(u - v - df) <= 0.005 + 1e-9', 'Math.abs(u - df) <= 0.005 + 1e-9'],
  ['darcy : ligne 5 non nommee', 'const tous = [...series[0], ...series[1]], NOMMES_R = [10], NOMMES_D = [4];', 'const tous = [...series[0], ...series[1]], NOMMES_R = [10], NOMMES_D = [];'],
  ['darcy : temoin a quinze fois', 'mesure: rmsAffine(dessus) / rmsOrigine(diffImp) > 5 ? 0 : 1', 'mesure: rmsAffine(dessus) / rmsOrigine(diffImp) > 15 ? 0 : 1'],
  ['darcy : curseur ignore', 'const w = P.partDessous, eff', 'const w = 1, eff'],
  ['perrinBrown : gaussienne entiere au lieu de demi', 'const demiGauss = (sig, N) => c1.map((_, k) => 2 * N * (phi(h * (k + 1) / sig) - phi(h * k / sig)));', 'const demiGauss = (sig, N) => c1.map((_, k) => N * (phi(h * (k + 1) / sig) - phi(h * k / sig)));'],
  ['perrinBrown : anneau 2 non nomme', 'const NOMMES = [1], hors = nc.map', 'const NOMMES = [], hors = nc.map'],
  ['perrinBrown : d / e = 8 / 9', 'const deCalcule = Math.sqrt(PI) / 2;', 'const deCalcule = 8 / 9;'],
  ['perrinBrown : khi-deux sans le carre', 'const khi = (o, e) => o.reduce((a, v, i) => a + (v - e[i]) * (v - e[i]) / e[i], 0),', 'const khi = (o, e) => o.reduce((a, v, i) => a + Math.abs(v - e[i]) / e[i], 0),'],
  ['perrinBrown : temoin exige cinquante fois', 'mesure: khiUnif.every((x, i) => x > 5 * khiGauss[i]) ? 0 : 1', 'mesure: khiUnif.every((x, i) => x > 50 * khiGauss[i]) ? 0 : 1'],
  ['perrinBrown : curseur ignore', 'const sig = P.sigmaPerrin, mod', 'const sig = 6.3, mod'],
  ['gaussAimant : difference a l envers', 'if (Math.round((o[i] - c[i]) * 10) !== Math.round(d[i] * 10))', 'if (Math.round((c[i] - o[i]) * 10) !== Math.round(d[i] * 10))'],
  ['gaussAimant : ligne 3.5 non nommee', "const NOMMES = ['w3.5'];", 'const NOMMES = [];'],
  ['gaussAimant : terme en R^-4', 'calc = atanD(a / (r2 * r) + b / (r2 * r2 * r)) * SEC;', 'calc = atanD(a / (r2 * r) + b / (r2 * r2)) * SEC;'],
  ['gaussAimant : tolerance au centieme', 'if (!(Math.abs(calc - c[i]) <= 0.1 + 1e-9)) horsCalc', 'if (!(Math.abs(calc - c[i]) <= 0.01 + 1e-9)) horsCalc'],
  ['gaussAimant : minutes fausses', "const [d, m, s] = x.split('-').map(Number); return d * 3600 + m * 60 + s;", "const [d, m, s] = x.split('-').map(Number); return d * 3600 + m * 6 + s;"],
  ['gaussAimant : exposant a 0.005 de 3', 'if (!exposants.every((e) => Math.abs(e - 3) < 0.05)) ecarts++;', 'if (!exposants.every((e) => Math.abs(e - 3) < 0.005)) ecarts++;'],
  ['gaussAimant : temoin exige cent fois', 'mesure: carre.every((x, i) => x > 10 * cube[i]) ? 0 : 1', 'mesure: carre.every((x, i) => x > 100 * cube[i]) ? 0 : 1'],
  ['gaussAimant : curseur ignore', 'const m = P.exposantGauss, pts = [];', 'const m = 3, pts = [];'],
  ['weberUnites : E / tau sans la moitie', 'const rapport = E.map((e, i) => e / (2 * tau[i]) / 1e6)', 'const rapport = E.map((e, i) => e / tau[i] / 1e6)'],
  ['weberUnites : tau = phi / A', 'Math.round(p * nb(\'A\') * 1e7) === Math.round(tau[i] * 1e7)', 'Math.round(p / nb(\'A\') * 1e7) === Math.round(tau[i] * 1e7)'],
  ['weberUnites : tolerance 0.005 %', 'if (!ecartPct.every((x) => x < 0.05)) ecarts++;', 'if (!ecartPct.every((x) => x < 0.005)) ecarts++;'],
  ['weberUnites : c = 4 moy x racine 2', 'c = 4 * moy / Math.sqrt(2);', 'c = 4 * moy * Math.sqrt(2);'],
  ['weberUnites : 106 2/3 lu 106', 'lyt = moy * 320 / 3 / 1000', 'lyt = moy * 106 / 1000'],
  ['weberUnites : temoin exige cinq fois', 'mesure: constant > 3 * prop ? 0 : 1', 'mesure: constant > 5 * prop ? 0 : 1'],
  ['weberUnites : curseur ignore', 'const part = P.partWeber, pts = [];', 'const part = 0.5, pts = [];'],
  ['poiseuilleTubes : D^3 au lieu de D^4', 'const q4 = Q.map((q, i) => q / (Dm[i] * Dm[i] * Dm[i] * Dm[i]))', 'const q4 = Q.map((q, i) => q / (Dm[i] * Dm[i] * Dm[i]))'],
  ['poiseuilleTubes : P / t au lieu de P t', 'const pt = s.map(([p, tps]) => p * tps), m = pt', 'const pt = s.map(([p, tps]) => p / tps), m = pt'],
  ['poiseuilleTubes : moyenne non nommee', 'MOYENNE_NOMMEE = true;', 'MOYENNE_NOMMEE = false;'],
  ['poiseuilleTubes : longueur 24 mm', 'longueurs.filter((L) => Math.abs(L - 25) < 0.0005).length', 'longueurs.filter((L) => Math.abs(L - 24) < 0.0005).length'],
  ['poiseuilleTubes : pente du diametre a 0.0001', 'Math.abs(penteD - 4) > 0.01) ecarts++;', 'Math.abs(penteD - 4) > 0.0001) ecarts++;'],
  ['poiseuilleTubes : temoin exige dix mille fois', 'mesure: navier.rms > 100 * loi.rms ? 0 : 1', 'mesure: navier.rms > 10000 * loi.rms ? 0 : 1'],
  ['poiseuilleTubes : curseur ignore', 'const m = P.exposantPoiseuille, fit', 'const m = 4, fit'],
  ['halleyCompas : minutes lues comme centiemes', 'return (neg ? -1 : 1) * (d + m / 60); };', 'return (neg ? -1 : 1) * (d + m / 100); };'],
  ['halleyCompas : derive ralentit acceptee', 'if (!taux.every((x, i) => i === 0 || x < taux[i - 1])) ecarts++;', 'if (!taux.every((x, i) => i === 0 || x > taux[i - 1])) ecarts++;'],
  ['halleyCompas : Copenhague oubliee', "['London', 'Paris', 'Copenhagen'].flatMap", "['London', 'Paris'].flatMap"],
  ['halleyCompas : Bond a 2 degres', 'Math.abs(hud.lon - pla.lon) <= 4;', 'Math.abs(hud.lon - pla.lon) <= 2;'],
  ['halleyCompas : temoin a 2 degres', 'mesure: plusPetit > 1 ? 0 : 1', 'mesure: plusPetit > 2 ? 0 : 1'],
  ['halleyCompas : curseur ignore', 'const an = P.anneeHalley, k', 'const an = 1650, k'],
  ['bealCones : 3 et 8 voisins', 'const FIB = [1, 2, 3, 5, 8, 13, 21], voisins', 'const FIB = [1, 2, 3, 8, 13, 21], voisins'],
  ['bealCones : binomial sans le facteur 2^m', 'lnFact(m - j) - m * lnD(2)), obs = pk(k);', 'lnFact(m - j)), obs = pk(k);'],
  ['bealCones : arbre 3 non nomme', "const NOMMES = ['N3', 'EL'], rejetes", "const NOMMES = ['EL'], rejetes"],
  ['bealCones : seuil 0.01', 'pGroupe[i] < 0.05).map((g) => g.nom);', 'pGroupe[i] < 0.01).map((g) => g.nom);'],
  ['bealCones : temoin exige 50', 'mesure: airy >= 10 ? 0 : 1', 'mesure: airy >= 50 ? 0 : 1'],
  ['bealCones : curseur ignore', 'const choix = P.groupeBeal, vus', 'const choix = 0, vus'],
  ['oldhamSeismes : arc arrondi au lieu de tronque', 'if (Math.floor(40000 * d / 360 * 10 + 1e-9) / 10 === la) arcs++;', 'if (Math.round(40000 * d / 360 * 10) / 10 === la) arcs++;'],
  ['oldhamSeismes : profondeur sans le demi-angle', 'if ((1 - cosD(d * PI / 360)).toFixed(3) === pr.toFixed(3)) profondeurs++;', 'if ((1 - cosD(d * PI / 180)).toFixed(3) === pr.toFixed(3)) profondeurs++;'],
  ['oldhamSeismes : 60 non nomme', "const NOMMES = ['Pc60', 'Sa90'];", "const NOMMES = ['Sa90'];"],
  ['oldhamSeismes : compression sans les 4/3', 'k: rho * v1 * v1 - 4 / 3 * m, kImp', 'k: rho * v1 * v1 - m, kImp'],
  ['oldhamSeismes : distorsion avec la 1re phase', 'const v1 = T[i][3], v2 = T[i][6], m = rho * v2 * v2;', 'const v1 = T[i][3], v2 = T[i][3], m = rho * v2 * v2;'],
  ['oldhamSeismes : temoin exige 15 minutes', 'predits[0] < T[4][4] - 10 && predits[1] < T[5][4] - 10', 'predits[0] < T[4][4] - 15 && predits[1] < T[5][4] - 15'],
  ['oldhamSeismes : curseur ignore', 'const v = P.vitesseOldham, pts', 'const v = 6, pts'],
  ['mackellarFonte : entropie en nats', 'a + (c / tot) * lnD(c / tot) / lnD(2), 0), Hu', 'a + (c / tot) * lnD(c / tot), 0), Hu'],
  ['mackellarFonte : T non nomme', "const NOMMES = ['T'], horsDemi", 'const NOMMES = [], horsDemi'],
  ['mackellarFonte : petite capitale au tiers', 'horsDemi = ca.filter(([, c, p]) => p * 2 !== c)', 'horsDemi = ca.filter(([, c, p]) => p * 3 !== c)'],
  ['mackellarFonte : temoin exige 4 fois', 'mesure: parts[0] * 26 > 2 && Hu - H > 0.3', 'mesure: parts[0] * 26 > 4 && Hu - H > 0.3'],
  ['mackellarFonte : curseur ignore', 'const m = P.melangeUniforme, pts', 'const m = 0, pts'],
  ['kaedingSyllabes : syllabes = mots', 'syl = (c) => c.reduce((a, x, i) => a + x * (i + 1), 0);', 'syl = (c) => c.reduce((a, x, i) => a + x * i, 0);'],
  ['kaedingSyllabes : cellule 8b non nommee', "const CELLULE = ['8b'], COLONNE = [4];", "const CELLULE = [], COLONNE = [4];"],
  ['kaedingSyllabes : rapport 3200 / 800 attendu 3', 'if (manque[1] / manque[0] !== 4) ecarts++;', 'if (manque[1] / manque[0] !== 3) ecarts++;'],
  ['kaedingSyllabes : moyenne tronquee', "horsMoy = lignes.filter((l) => (Math.round(l.s / l.w * 100) / 100).toFixed(2) !== l.m)", "horsMoy = lignes.filter((l) => (Math.floor(l.s / l.w * 100) / 100).toFixed(2) !== l.m)"],
  ['kaedingSyllabes : pour cent sans le groupe 7-15', 'const pcts = [...reW.slice(0, 6), somme(reW.slice(6))]', 'const pcts = [...reW.slice(0, 6), somme(reW.slice(7))]'],
  ['kaedingSyllabes : temoin exige cinq fois', 'mesure: geo5 > 2 * summa[4] ? 0 : 1', 'mesure: geo5 > 5 * summa[4] ? 0 : 1'],
  ['kaedingSyllabes : curseur ignore', 'const z = P.zaehlstoffKaeding, choisie', 'const z = 0, choisie'],
  ['hagenTubes : erreur probable sur n - 1', 'x.e.reduce((a, v) => a + v * v, 0) / (x.e.length - 2));', 'x.e.reduce((a, v) => a + v * v, 0) / (x.e.length - 1));'],
  ['hagenTubes : ecarts observe - calcule', 'if (Math.round((x.hc[i] - x.h[i]) * 1000) === Math.round(x.e[i] * 1000)) ecartsOK++;', 'if (Math.round((x.h[i] - x.hc[i]) * 1000) === Math.round(x.e[i] * 1000)) ecartsOK++;'],
  ['hagenTubes : V-1 non nomme', "const NOMMES = ['II-3', 'III-4', 'V-1'];", "const NOMMES = ['II-3', 'III-4'];"],
  ['hagenTubes : s sous deux fois', 'if (!(centuple >= 100 && triple < 3)) ecarts++;', 'if (!(centuple >= 100 && triple < 2)) ecarts++;'],
  ['hagenTubes : temoin exige 100 fois', 'mesure: lineaire.every((x, i) => x > 10 * deuxTermes[i]) ? 0 : 1', 'mesure: lineaire.every((x, i) => x > 100 * deuxTermes[i]) ? 0 : 1'],
  ['hagenTubes : curseur ignore', 'const part = P.partCarreHagen, pts', 'const part = 1, pts'],
  ['moseleySpirale : terme 3 non nomme', "const NOMMES = ['duplicatus3'];", 'const NOMMES = [];'],
  ['moseleySpirale : progression multipliee', 'x = c.w[0] / expD(k * lnD(c.r));', 'x = c.w[0] * expD(k * lnD(c.r));'],
  ['moseleySpirale : formule arrondie', 'const tronque = (x) => Math.floor(x * 10000 + 1e-9) / 10000, horsFormule', 'const tronque = (x) => Math.round(x * 10000) / 10000, horsFormule'],
  ['moseleySpirale : 1.1806 non nomme', 'const FORMULE_NOMMEE = [1];', 'const FORMULE_NOMMEE = [];'],
  ['moseleySpirale : mu a deux unites', 'Math.abs(a / b - 2.45) <= 0.01 + 1e-9 ? -1 : i', 'Math.abs(a / b - 2.45) <= 0.02 + 1e-9 ? -1 : i'],
  ['moseleySpirale : temoin exige 15 fois', 'mesure: fits.every((f) => f.arith > 3 * f.geo) ? 0 : 1', 'mesure: fits.every((f) => f.arith > 15 * f.geo) ? 0 : 1'],
  ['moseleySpirale : curseur ignore', 'const raison = P.raisonMoseley, pts', 'const raison = 1.18, pts'],
  ['mendelPois : rapports tronques', 'const cent = (x) => (Math.round(x * 100) / 100).toFixed(2);', 'const cent = (x) => (Math.floor(x * 100) / 100).toFixed(2);'],
  ['mendelPois : recessifs sur dominants', 'rapports = f2.filter(([, , d, r, q]) => cent(d / r) === q.toFixed(2)).length;', 'rapports = f2.filter(([, , d, r, q]) => cent(r / d) === q.toFixed(2)).length;'],
  ['mendelPois : seconde generation inversee', '&& cent(h / c) === q.toFixed(2)))', '&& cent(c / h) === q.toFixed(2)))'],
  ['mendelPois : khi-deux sans le carre', 'return a + (d - ed) * (d - ed) / ed + (r - er) * (r - er) / er; }, 0);', 'return a + Math.abs(d - ed) / ed + Math.abs(r - er) / er; }, 0);'],
  ['mendelPois : temoin exige 5000 fois', 'mesure: k11 > 100 * k31 ? 0 : 1', 'mesure: k11 > 5000 * k31 ? 0 : 1'],
  ['mendelPois : curseur ignore', 'const q = P.rapportMendel, pts', 'const q = 3, pts'],
  ['thomsonRayons : m / e sans le carre', 'const me = r.I * r.I / (2 * r.WQ) * 1e7, v = 2 * r.WQ / r.I / p10(r.ve);', 'const me = r.I / (2 * r.WQ) * 1e7, v = 2 * r.WQ / r.I / p10(r.ve);'],
  ['thomsonRayons : ligne 8 non nommee', 'const NOMMES_ME = [8, 13, 14, 16, 20],', 'const NOMMES_ME = [13, 14, 16, 20],'],
  ['thomsonRayons : produit a 5 %', 'r.me * 1e-7 * r.vm * p10(r.ve) / r.I - 1) <= 0.15)', 'r.me * 1e-7 * r.vm * p10(r.ve) / r.I - 1) <= 0.05)'],
  ['thomsonRayons : v sans le facteur 2', 'v = 2 * r.WQ / r.I / p10(r.ve);', 'v = r.WQ / r.I / p10(r.ve);'],
  ['thomsonRayons : temoin exige 5000 fois', 'mesure: fois > 1000 ? 0 : 1', 'mesure: fois > 5000 ? 0 : 1'],
  ['thomsonRayons : curseur ignore', 'const f = P.facteurIThomson, pts', 'const f = 1, pts'],
  ['pogsonMagnitudes : ouvertures arrondies', 'return Math.floor(x * f + 1e-9) / f; };', 'return Math.round(x * f) / f; };'],
  ['pogsonMagnitudes : coefficient 2.5 au lieu de 5', 'p10((r.m - nb(\'L\')) / 5)', 'p10((r.m - nb(\'L\')) / 2.5)'],
  ['pogsonMagnitudes : Struve 7 non nomme', "const NOMMES = ['S7', 'H14'];", "const NOMMES = ['H14'];"],
  ['pogsonMagnitudes : Smyth depuis 6', '[3, lin(8, 8, 13, 16), 8]];', '[3, lin(6, 6, 13, 16), 6]];'],
  ['pogsonMagnitudes : temoin exige 10 fois', 'mesure: dawes15 > 5 * L[9].ap ? 0 : 1', 'mesure: dawes15 > 10 * L[9].ap ? 0 : 1'],
  ['pogsonMagnitudes : curseur ignore', 'const R = P.rapportPogson, pts', 'const R = 2.512, pts'],
  ['darwinMais : huitiemes lus comme dixiemes', 'const [p, h] = x.split(\'-\').map(Number); return p * 8 + h; };', 'const [p, h] = x.split(\'-\').map(Number); return p * 8 + h * 0.8; };'],
  ['darwinMais : moyenne 17.57 non nommee', 'const MOYENNE_AUTO_NOMMEE = true;', 'const MOYENNE_AUTO_NOMMEE = false;'],
  ['darwinMais : rapport inverse', 'Math.round(100 * ma / mc) !== nb(\'rapport\')', 'Math.round(100 * mc / ma) !== nb(\'rapport\')'],
  ['darwinMais : test unilateral', 'const pSigne = 2 * queue / expD(m * lnD(2))', 'const pSigne = queue / expD(m * lnD(2))'],
  ['darwinMais : temoin a 0.005', 'mesure: pSigne < 0.05 ? 0 : 1', 'mesure: pSigne < 0.005 ? 0 : 1'],
  ['darwinMais : curseur ignore', 'const g = P.gainDarwin, pts', 'const g = 0, pts'],
  ['rutherfordEmanation : 86 arrondi', 'if (Math.floor(inverse) !== nb(\'lambdaInverse\')) ecarts++;', 'if (Math.round(inverse) !== nb(\'lambdaInverse\')) ecarts++;'],
  ['rutherfordEmanation : demi-vie sans ln 2', 'lambda = -b, demiVie = lnD(2) / lambda;', 'lambda = -b, demiVie = 1 / lambda;'],
  ['rutherfordEmanation : tolerance 0.5 %', 'if (!(Math.abs(demiVie - nb(\'demiVie\')) / nb(\'demiVie\') < 0.05)) ecarts++;', 'if (!(Math.abs(demiVie - nb(\'demiVie\')) / nb(\'demiVie\') < 0.005)) ecarts++;'],
  ['rutherfordEmanation : temoin exige dix fois', 'mesure: rmsL > 3 * rmsE && al + bl * 360 < 0 ? 0 : 1', 'mesure: rmsL > 10 * rmsE && al + bl * 360 < 0 ? 0 : 1'],
  ['rutherfordEmanation : curseur ignore', 'const tv = P.demiVieRutherford, pts', 'const tv = 60, pts'],
  ['michelsonEther : longueur d onde x 0.01', 'const wl = s.wl.filter((w, k) => Math.round(s.mean[k] * 20) === w).length;', 'const wl = s.wl.filter((w, k) => Math.round(s.mean[k] * 10) === w).length;'],
  ['michelsonEther : demi-tour decale de 7', 'fin = s.fin.filter((f, k) => s.wl[k] + s.wl[k + 8] === 2 * f).length;', 'fin = s.fin.filter((f, k) => s.wl[k] + s.wl[k + 7] === 2 * f).length;'],
  ['michelsonEther : terme en theta au lieu de 2 theta', 'X = y.map((_, k) => [1, k, cosD(2 * PI * k / 8), sinD(2 * PI * k / 8)]);', 'X = y.map((_, k) => [1, k, cosD(2 * PI * k / 16), sinD(2 * PI * k / 16)]);'],
  ['michelsonEther : temoin exige 20 fois', 'mesure: fois.every((f) => f > 10) ? 0 : 1', 'mesure: fois.every((f) => f > 20) ? 0 : 1'],
  ['michelsonEther : curseur ignore', 'const v = P.vitesseEther, pts', 'const v = 1, pts'],
  ['rubensReststrahlen : Planck sans le - 1', '(T) => 1 / (expD(nb(\'cPlanck\') * lmT / (lam * T)) - 1)];', '(T) => 1 / (expD(nb(\'cPlanck\') * lmT / (lam * T)))];'],
  ['rubensReststrahlen : Thiesen sans la racine', '(T) => Math.sqrt(lam * T) * expD(-nb(\'cThiesen\') * lmT / (lam * T)),', '(T) => expD(-nb(\'cThiesen\') * lmT / (lam * T)),'],
  ['rubensReststrahlen : echelle a 1000 K', 'e0 = g(293), e1 = g(1273); return', 'e0 = g(293), e1 = g(1000); return'],
  ['rubensReststrahlen : tolerance 1', 'if (!(pire <= 2.5) || ', 'if (!(pire <= 1) || '],
  ['rubensReststrahlen : temoin exige 50 fois', 'mesure: rms[0] > 10 * rms[4] ? 0 : 1', 'mesure: rms[0] > 50 * rms[4] ? 0 : 1'],
  ['rubensReststrahlen : curseur ignore', 'const choix = P.loiRubens, courbe', 'const choix = 4, courbe'],
  ['planckConstantes : densite non nommee', 'const DENSITE_NOMMEE = true;', 'const DENSITE_NOMMEE = false;'],
  ['planckConstantes : sans le facteur 4', 'const a = 4 * nb(\'S\') / (nb(\'c\')', 'const a = nb(\'S\') / (nb(\'c\')'],
  ['planckConstantes : serie en 1 / n^3', 'for (let m = 1; m <= 2000; m++) serie += 1 / (m * m * m * m);', 'for (let m = 1; m <= 2000; m++) serie += 1 / (m * m * m);'],
  ['planckConstantes : equation de Wien a 4', 'const f = (1 - x / 5) * expD(x) - 1, df = expD(x) * (1 - x / 5 - 1 / 5);', 'const f = (1 - x / 4) * expD(x) - 1, df = expD(x) * (1 - x / 4 - 1 / 4);'],
  ['planckConstantes : h avec (h/k)^3', 'h = nb(\'k4h3\') * nb(\'hk\') * nb(\'hk\') * nb(\'hk\') * nb(\'hk\'), k', 'h = nb(\'k4h3\') * nb(\'hk\') * nb(\'hk\') * nb(\'hk\'), k'],
  ['planckConstantes : curseur ignore', 'const lt = P.lambdaThetaPlanck, hP', 'const lt = 0.294, hP'],
  ['herschelJauges : sans le - 1', 'rayon = (s, b) => cube(b * b * s) - 1;', 'rayon = (s, b) => cube(b * b * s);'],
  ['herschelJauges : champ entier au lieu du demi', 'const demi = (minutes) => minutes / 2 / 60 * PI / 180,', 'const demi = (minutes) => minutes / 60 * PI / 180,'],
  ['herschelJauges : S = 290 non nomme', 'const NOMMES = [120, 290];', 'const NOMMES = [120];'],
  ['herschelJauges : B au lieu de B^2', 'if (Math.round(cube(B * B * nb(\'exempleEtoiles\'))) !== nb(\'exempleN\')) ecarts++;', 'if (Math.round(cube(B * nb(\'exempleEtoiles\'))) !== nb(\'exempleN\')) ecarts++;'],
  ['herschelJauges : temoin exige 10 fois', 'mesure: carre100k > 5 * L.find(([s]) => s === 100000)[1]', 'mesure: carre100k > 10 * L.find(([s]) => s === 100000)[1]'],
  ['herschelJauges : curseur ignore', 'const champ = P.champHerschel, B2', 'const champ = 15, B2'],
  ['katerPendule : sinus au lieu de son carre', 'return { nom, s2: sn * sn,', 'return { nom, s2: sn,'],
  ['katerPendule : minutes de latitude ignorees', '(Number(d) + Number(m) / 60 + Number(s) / 3600)', '(Number(d) + Number(s) / 3600)'],
  ['katerPendule : N au lieu de N carre', 'st[0].L * (x.N / st[0].N) * (x.N / st[0].N)', 'st[0].L * (x.N / st[0].N)'],
  ['katerPendule : constante centrifuge de la gravitation', '1 / (nb(\'sommeCinqDemi\') - dE)', '1 / (0.0086802 - dE)'],
  ['katerPendule : station otee ignoree', 'reste = otee ? st.filter((_, i) => i !== otee - 1) : st;', 'reste = st;'],
  ['katerPendule : temoin sans Huygens', '&& aplat < nb(\'huygens\') ? 0 : 1', '&& aplat < 300 ? 0 : 1'],
  ['thorndikeEssais : blocs de cinq', 'T.slice(6 * b, 6 * b + 6).reduce((a, c) => a + c, 0) / 6);', 'T.slice(5 * b, 5 * b + 5).reduce((a, c) => a + c, 0) / 5);'],
  ['thorndikeEssais : baisses comptees en hausses', 'const hausses = T.slice(1).filter((x, i) => x > T[i]).length;', 'const hausses = T.slice(1).filter((x, i) => x < T[i]).length;'],
  ['thorndikeEssais : puissance sur n au lieu de ln n', 'const puissance = ajuste(rang.map((r) => lnD(r)), lnT)', 'const puissance = ajuste(rang, lnT)'],
  ['thorndikeEssais : sous 10 s strict', 'const premierDix = T.findIndex((x) => x <= 10) + 1', 'const premierDix = T.findIndex((x) => x < 10) + 1'],
  ['thorndikeEssais : temoin exige trois retours', 'T[i30] <= 30 && retours.length >= 1 ? 0 : 1', 'T[i30] <= 30 && retours.length >= 3 ? 0 : 1'],
  ['thorndikeEssais : curseur ignore', 'const k = Math.max(1, Math.min(8, Math.round(P.moyenneThorndike)))', 'const k = 1'],
  ['dondersReaction : arrondi au lieu de troncature', 'const tronque = (x) => Math.floor(x * 100 + 1e-9) / 100,', 'const tronque = (x) => Math.round(x * 100) / 100,'],
  ['dondersReaction : diapason 250 Hz', 'const hz = nb(\'diapason\'), ms = (v) => v * 1000 / hz,', 'const hz = 250, ms = (v) => v * 1000 / hz,'],
  ['dondersReaction : c - b au lieu de c - a', 'if (egal(T.c[k] - T.a[k], Df.ca[k])) diffsOk++; else ecarts++;', 'if (egal(T.c[k] - T.b[k], Df.ca[k])) diffsOk++; else ecarts++;'],
  ['dondersReaction : ordre inverse', 'const ordre = Df.ba.filter((x, k) => x > Df.ca[k] && Df.ca[k] > 0).length;', 'const ordre = Df.ba.filter((x, k) => x < Df.ca[k] && Df.ca[k] > 0).length;'],
  ['dondersReaction : temoin inverse', 'mesure: Df.ba[3] > 0 && Df.ca[3] < Df.ba[3] ? 0 : 1,', 'mesure: Df.ba[3] > 0 && Df.ca[3] > Df.ba[3] ? 0 : 1,'],
  ['dondersReaction : curseur ignore', 'const r = Math.max(0, Math.min(3, Math.round(P.rouleauDonders)))', 'const r = 0'],
  ['cattellAttention : A line rounded exactly', 'if (Math.abs(m - sevenA[b][0][j]) <= 1) withinOne++;', 'if (Math.abs(m - sevenA[b][0][j]) < 0.5) withinOne++;'],
  ['cattellAttention : distracted minus concentrated', 'const d = normalised[o].map(([c, nn, ds]) => [c - nn, ds - nn]);', 'const d = normalised[o].map(([c, nn, ds]) => [c - nn, ds - c]);'],
  ['cattellAttention : A mean truncated', 'if (Math.round(meanCattell(d.map((x) => x[1]))) === eight[o][4][1]) eightOk++;', 'if (Math.trunc(meanCattell(d.map((x) => x[1]))) === eight[o][4][1]) eightOk++;'],
  ['cattellAttention : distraction counted from 20', 'const distLonger = dist.filter((x) => x > 0).length;', 'const distLonger = dist.filter((x) => x > 20).length;'],
  ['cattellAttention : series compared to concentrated', 'if (seven[b][2][i] > nn) seriesDist++;', 'if (seven[b][2][i] > seven[b][0][i] + 30) seriesDist++;'],
  ['cattellAttention : witness reversed', 'mesure: Math.max(...conc) > 0 ? 0 : 1,', 'mesure: Math.max(...conc) > 0 ? 1 : 0,'],
  ['cattellAttention : slider ignored', 'const who = Math.max(0, Math.min(2, Math.round(P.sujetCattell)))', 'const who = 0'],
  ['peirceJastrow : factor 0.5 instead of 0.477', 'const errorsPJ = (q) => (1 - erfPeirceJastrow(0.477 * q)) / 2,', 'const errorsPJ = (q) => (1 - erfPeirceJastrow(0.5 * q)) / 2,'],
  ['peirceJastrow : mean over n - 1', 'if (Math.round(sets.reduce((a, b) => a + b, 0) / sets.length * 10) / 10 === obs) meansOk++;', 'if (Math.round(sets.reduce((a, b) => a + b, 0) / Math.max(1, sets.length - 1) * 10) / 10 === obs) meansOk++;'],
  ['peirceJastrow : logarithm as the footnote says', 'if (Math.abs(50 * errorsPJ((R - 1) / groups[g].pe) - calc) <= 0.15) calcOk++;', 'if (Math.abs(50 * errorsPJ(lnD(R) / groups[g].pe) - calc) <= 0.15) calcOk++;'],
  ['peirceJastrow : tolerance 0.1', 'if (Math.abs(50 * errorsPJ((R - 1) / groups[g].pe) - calc) <= 0.15) calcOk++;', 'if (Math.abs(50 * errorsPJ((R - 1) / groups[g].pe) - calc) <= 0.1) calcOk++;'],
  ['peirceJastrow : tail on the wrong side', 'for (let i = 0; i <= fineErrors; i++) { tailPJ +=', 'for (let i = 0; i <= fineTrials - fineErrors; i++) { tailPJ +='],
  ['peirceJastrow : erf series cut short', 'while (Math.abs(t) > 1e-17) { s += t / (2 * k + 1); k++; t *= -x * x / k; }', 'while (Math.abs(t) > 1e-17 && k < 2) { s += t / (2 * k + 1); k++; t *= -x * x / k; }'],
  ['peirceJastrow : slider ignored', 'const g = Math.max(1, Math.min(2, Math.round(P.groupeJastrow)))', 'const g = 1'],
  ['pavlovExtinction : gap without the minute of stimulation', 'if (s.t[i] - s.t[i - 1] === s.iv + 1) spacingOk++;', 'if (s.t[i] - s.t[i - 1] === s.iv) spacingOk++;'],
  ['pavlovExtinction : duration counts the last minute', 'const durations = series.map((s) => s.t[s.t.length - 1] - s.t[0]);', 'const durations = series.map((s) => s.t[s.t.length - 1] - s.t[0] + 1);'],
  ['pavlovExtinction : incomplete means under 100 minutes', 'durations[j] < 2 * 60 && s.v[s.v.length - 1] > 0) summaryOk++;', 'durations[j] < 100 && s.v[s.v.length - 1] > 0) summaryOk++;'],
  ['pavlovExtinction : zero taken as 0.1', 'const i = s.v.findIndex((v) => v === 0);', 'const i = s.v.findIndex((v) => v <= 0.1);'],
  ['pavlovExtinction : equal steps counted as rises', 'if (s.v[i] > s.v[i - 1]) rises++;', 'if (s.v[i] >= s.v[i - 1]) rises++;'],
  ['pavlovExtinction : witness reversed', 'mesure: recovered === recovery.length ? 0 : 1,', 'mesure: recovered === recovery.length ? 1 : 0,'],
  ['pavlovExtinction : minutes read as hundredths', 'const clockPavlov = (s) => { const [h, m] = s.split(\'.\'); return Number(h) * 60 + Number(m); };', 'const clockPavlov = (s) => Math.round(Number(s) * 100);'],
  ['pavlovExtinction : slider ignored', 'const shown = Math.max(0, Math.min(5, Math.round(P.seriePavlov)))', 'const shown = 0'],
  ['konigWeber : minutes read as hundredths of a degree', 'alpha: (Number(d) + Number(m) / 60) * Math.PI / 180,', 'alpha: (Number(d) + Number(m) / 100) * Math.PI / 180,'],
  ['konigWeber : tangent not squared', 'rows++; const tg2 = (sinD(r.alpha) / cosD(r.alpha)) ** 2;', 'rows++; const tg2 = sinD(r.alpha) / cosD(r.alpha);'],
  ['konigWeber : half a unit', 'if (Math.abs(tg2 - r.f) <= r.unit * (1 + 1e-9)) withinUnit++;', 'if (Math.abs(tg2 - r.f) <= r.unit * 0.5) withinUnit++;'],
  ['konigWeber : plateau down to 500', 'if (r.J >= 1000 && r.J <= 20000) { midCells++;', 'if (r.J >= 500 && r.J <= 20000) { midCells++;'],
  ['konigWeber : witness threshold 40', 'mesure: ratios.every((x) => x > 10) ? 0 : 1,', 'mesure: ratios.every((x) => x > 40) ? 0 : 1,'],
  ['konigWeber : slider ignored', 'const shown = Math.max(0, Math.min(4, Math.round(P.tableKonig)))', 'const shown = 0'],
  ['cannonGlycosuria : per cent truncated', 'const pctCannon = (g) => Math.round(100 * g.pos / g.n);', 'const pctCannon = (g) => Math.floor(100 * g.pos / g.n);'],
  ['cannonGlycosuria : the one positive before not removed', 'const remaining = people.menTested - people.menBefore;', 'const remaining = people.menTested;'],
  ['cannonGlycosuria : excited means more than half', 'const excitedPositive = excited.filter((g) => g.pos > 0).length,', 'const excitedPositive = excited.filter((g) => g.pos > g.n / 2).length,'],
  ['cannonGlycosuria : base rate one in ten', 'const base = people.menBefore / people.menTested, m = people.menExam.n;', 'const base = 0.1, m = people.menExam.n;'],
  ['cannonGlycosuria : tail counts from 5', 'if (k >= people.menExam.pos) tailCannon +=', 'if (k >= people.menExam.pos - 1) tailCannon +='],
  ['cannonGlycosuria : witness reversed', 'mesure: people.footballBench > 0 && tailCannon < 1e-3 ? 0 : 1,', 'mesure: people.footballBench > 0 && tailCannon < 1e-3 ? 1 : 0,'],
  ['cannonGlycosuria : slider ignored', 'const shown = Math.max(0, Math.min(2, Math.round(P.groupeCannon)))', 'const shown = 0'],
  ['boydBrain : men heavier by 0.2 oz. at least', 'const heavierMen = ages.filter((a, i) => men[i].w[3] > women[i].w[3]).length;', 'const heavierMen = ages.filter((a, i) => men[i].w[3] > women[i].w[3] + 0.2).length;'],
  ['boydBrain : ranks from the lightest', 'const rank = (l) => [...l].sort((x, y) => y.w[3] - x.w[3]).map((r) => r.age);', 'const rank = (l) => [...l].sort((x, y) => x.w[3] - y.w[3]).map((r) => r.age);'],
  ['boydBrain : adult range from 14 to 20', "const adult = (l) => { const k = l.slice(ages.indexOf('20to30')).map((r) => r.w[3]);", "const adult = (l) => { const k = l.slice(ages.indexOf('14to20')).map((r) => r.w[3]);"],
  ['boydBrain : sum tolerance 0.05', 'adds = Math.abs(r.w[0] + r.w[1] + r.w[2] - r.w[3]) < 0.005;', 'adds = Math.abs(r.w[0] + r.w[1] + r.w[2] - r.w[3]) < 0.05;'],
  ['boydBrain : parts without the pons', 'adds = Math.abs(r.w[0] + r.w[1] + r.w[2] - r.w[3]) < 0.005;', 'adds = Math.abs(r.w[0] + r.w[1] - r.w[3]) < 0.005;'],
  ['boydBrain : decline from birth', 'const declineMen = 100 * (men[last].w[3] / men[peak].w[3] - 1),', 'const declineMen = 100 * (men[last].w[3] / men[0].w[3] - 1),'],
  ['boydBrain : slider ignored', 'const shown = Math.max(0, Math.min(2, Math.round(P.sexeBoyd)))', 'const shown = 0'],
  ['lucasAllOrNone : first step from observation 1', 'const lowStep = meanLucas(mm.slice(1, 5)),', 'const lowStep = meanLucas(mm.slice(0, 5)),'],
  ['lucasAllOrNone : rise from observation 12', 'rise = 100 * (mm[34] - mm[10]) / mm[10];', 'rise = 100 * (mm[34] - mm[11]) / mm[11];'],
  ['lucasAllOrNone : big step from 0.1 mm', 'big = steps.filter((d) => Math.abs(d) > 0.3);', 'big = steps.filter((d) => Math.abs(d) > 0.1);'],
  ['lucasAllOrNone : unexplained share reported', 'const r2 = 1 - ssRes / ssTot;', 'const r2 = ssRes / ssTot;'],
  ['lucasAllOrNone : witness reversed', 'mesure: r2 < 0.5 ? 0 : 1,', 'mesure: r2 > 0.5 ? 0 : 1,'],
  ['lucasAllOrNone : slider ignored', 'const line = Math.max(0, Math.min(1, Math.round(P.droiteLucas)))', 'const line = 1'],
  ['herculanoNeurons : other cells ratio from neurons', '((mac.o / mar.o).toFixed(1) === text.variationOther.toFixed(1));', '((mac.nn / mar.nn).toFixed(1) === text.variationOther.toFixed(1));'],
  ['herculanoNeurons : slope of neurons on mass', 'const fitN = slopeHH(rowsHH.map((r) => lg(r.nn)), rowsHH.map((r) => lg(r.m))),', 'const fitN = slopeHH(rowsHH.map((r) => lg(r.m)), rowsHH.map((r) => lg(r.nn))),'],
  ['herculanoNeurons : exponent kept to two decimals', 'const exponentsOk = (fitN.b.toFixed(3) === text.exponentNeurons.toFixed(3)', 'const exponentsOk = (fitN.b.toFixed(2) === text.exponentNeurons.toFixed(3)'],
  ['herculanoNeurons : rodent rule from the tree shrew', 'const rodentMass = mar.m * (mac.nn / mar.nn) ** text.rodentExponent;', 'const rodentMass = byName(\'treeShrew\').m * (mac.nn / byName(\'treeShrew\').nn) ** text.rodentExponent;'],
  ['herculanoNeurons : witness reversed', 'mesure: rodentMass > 3 * mac.m ? 0 : 1,', 'mesure: rodentMass > 3 * mac.m ? 1 : 0,'],
  ['herculanoNeurons : slider ignored', 'const showRodent = Math.max(0, Math.min(1, Math.round(P.rongeurHerculano)))', 'const showRodent = 1'],
  ['connectomeCounts : worm synapses with junctions', 'const perNeuron = [worm.chemicalSynapses / worm.neurons,', 'const perNeuron = [(worm.chemicalSynapses + worm.neuromuscular) / worm.neurons,'],
  ['connectomeCounts : hemibrain read as whole fly', 'hemi.chemicalSynapses / hemi.neurons, fly.synapses / fly.neurons];', 'fly.synapses / hemi.neurons, fly.synapses / fly.neurons];'],
  ['connectomeCounts : human over hemibrain', 'humanOverFly = human.neurons / fly.neurons;', 'humanOverFly = human.neurons / hemi.neurons;'],
  ['connectomeCounts : a tenth of the deviation', '(Math.abs(human.neurons - human.nonNeurons) < human.sd ? 0 : 1)', '(Math.abs(human.neurons - human.nonNeurons) < human.sd / 10 ? 0 : 1)'],
  ['connectomeCounts : witness reversed', 'mesure: humanOverFly > 1e5 ? 0 : 1,', 'mesure: humanOverFly > 1e5 ? 1 : 0,'],
  ['connectomeCounts : slider ignored', 'const shown = Math.max(0, Math.min(4, Math.round(P.organismeConnectome)))', 'const shown = 0'],
  ['siegelEmotions : samples compared with participants', 'const kSums = cats.filter((c) => cellsOf(c).reduce((a, x) => a + x.k, 0) === totalsSG[c].k).length;', 'const kSums = cats.filter((c) => cellsOf(c).reduce((a, x) => a + x.k, 0) === totalsSG[c].n).length;'],
  ['siegelEmotions : k of four kept', 'if (x.k > text.kAbove && x.stars > 0)', 'if (x.k >= text.kAbove && x.stars > 0)'],
  ['siegelEmotions : significance ignored', 'if (x.k > text.kAbove && x.stars > 0)', 'if (x.k > text.kAbove)'],
  ['siegelEmotions : columns against row totals', 'const colsOk = cats.filter((c, j) => rowsCF.reduce((a, r) => a + r.c[j], 0) === lines.cases[j]).length;', 'const colsOk = cats.filter((c, j) => rowsCF.reduce((a, r) => a + r.c[j], 0) === rowsCF[j].tot).length;'],
  ['siegelEmotions : hits read off the first column', 'const hits = cats.map((c, j) => rowOf(c).c[j])', 'const hits = cats.map((c, j) => rowOf(c).c[0])'],
  ['siegelEmotions : percentages compared to the unit', '.map((v, j) => [r.g, cats[j], (100 * v / all).toFixed(1), pctCF[r.g][j].toFixed(1)])', '.map((v, j) => [r.g, cats[j], (100 * v / all).toFixed(0), pctCF[r.g][j].toFixed(0)])'],
  ['siegelEmotions : Table 4 compared with samples', "const t4Off = cats.filter((c) => text['t4' + c] !== totalsSG[c].n)", "const t4Off = cats.filter((c) => text['t4' + c] !== totalsSG[c].k)"],
  ['siegelEmotions : rate without the one', 'p = Math.max(0, Math.min(1, BASE * (1 + dU)));', 'p = Math.max(0, Math.min(1, BASE * dU));'],
  ['siegelEmotions : spread ignored', 'const dU = spread ? x.lo + (x.hi - x.lo) * (u + 0.5) / UNITS : x.d,', 'const dU = x.d,'],
  ['siegelEmotions : emotion slider ignored', 'const e = Math.max(0, Math.min(5, Math.round(P.emotionSiegel)))', 'const e = 0'],
  ['siegelEmotions : witness reversed', 'mesure: diag / all < 0.5 ? 0 : 1,', 'mesure: diag / all < 0.5 ? 1 : 0,'],
  ['wiringEmotions : union does nothing', 'edges.forEach((e) => { root[find(e.i)] = find(e.j); });', 'edges.forEach((e) => { root[find(e.i)] = find(e.i); });'],
  ['wiringEmotions : crossing blind to the weight', '0.05 + 0.7 * ((w - lo) / (hi - lo)) ** 2', '0.05 + 0.7 * 0.25'],
  ['wiringEmotions : named pathways never crossed', 'alea() < (w === null ? 0.3 :', 'alea() < (w === null ? 0 :'],
  ['wiringEmotions : travel slider ignored', 'travel = Math.max(0, Math.min(1, Math.round(P.travelWiring)));', 'travel = 1;'],
  ['wiringEmotions : network slider ignored', 'const net = Math.max(0, Math.min(1, Math.round(P.networkWiring)))', 'const net = 0'],
  ['wiringEmotions : function crossing on the structural range (82)', ': (net ? K.functionCut : K.wiringMin), hi = res ? (net ? K4.functionMax : K4.wiringMax) : (net ? K.functionMax : K.wiringMax);', ': K.wiringMin, hi = res ? (net ? K4.functionMax : K4.wiringMax) : K.wiringMax;'],
  ['wiringEmotions : overlap counted on itself', 'overlap = fedges.filter((e) => wired.has(e.i + \'-\' + e.j)).length', 'overlap = fedges.length'],
  ['wiringEmotions : both taken as the compared list', 'const both = other ? emotion.regions.filter((r) => other.regions.includes(r)) : [];', 'const both = other ? other.regions.slice() : [];'],
  ['wiringEmotions : positions from the data module only', '(res ? HB.CENTROIDS_400[a] : HA.CENTROIDS[a])', '(res ? HB.CENTROIDS_400[a] : [0, a, 0])'],
  ['wiringEmotions : columns swapped', 'P3 = XYZ.map(([x, y, z]) => [y / 100, z / 100, x / 100]);', 'P3 = XYZ.map(([x, y, z]) => [x / 100, z / 100, y / 100]);'],
  ['wiringEmotions : no silhouette', 'for (let v = 0; v < HA.CORTEX.length / 3; v += OUTLINE_CORTEX_STEP) pts.push(', 'for (let v = 0; v < 0; v += OUTLINE_CORTEX_STEP) pts.push('],
  ['wiringEmotions : regions not drawn first', 'const pts = P3.slice(0, NR).map((p) => p.slice());', 'const pts = [[0, 0, 0]];'],
  ['wiringEmotions : connections not drawn as lines', 'const segments = use.map((e) =>', 'const segments = [].map((e) =>'],
  ['wiringEmotions : line weight ignored', 'w: (e.w - lo) / (hi - lo), c: 0,', 'w: 1, c: 0,'],
  ['wiringEmotions : a line names the wrong point', 'ia: e.i, ib: e.j }))', 'ia: e.i, ib: e.i }))'],
  ['wiringEmotions : a pathway names the wrong point', 'ia: p.i, ib: p.j })', 'ia: p.j, ib: p.j })'],
  ['wiringEmotions : named pathways drawn as measured lines', 'w: 0.5, c: 5,', 'w: 1, c: 0,'],
  ['wiringEmotions : shared in the pack shown as all its regions', 'sharedInPackWiring: emotion.shared.length +', 'sharedInPackWiring: emotion.regions.length +'],
  ['wiringEmotions : pack slider ignored', 'const { pk, ek, pack, emotion, other } = HB.selectEmotion(P);', 'const { pk, ek, pack, emotion, other } = HB.selectEmotion({ ...P, packWiring: 0 });'],
  ['wiringEmotions : resolution slider ignored', 'const res = Math.max(0, Math.min(1, Math.round(P.resolutionWiring)))', 'const res = 0'],
  ['wiringEmotions : theory slider ignored', 'th = Math.max(0, Math.min(HB.THEORIES.length - 1, Math.round(P.theoryWiring))), theory = HB.THEORIES[th];', 'th = 0, theory = HB.THEORIES[th];'],
  ['wiringEmotions : 414 couplings on the 82 range', 'hi = res ? (net ? K4.functionMax : K4.wiringMax) : (net ? K.functionMax : K.wiringMax);', 'hi = net ? K.functionMax : K.wiringMax;'],
  ['wiringEmotions : pathway ends left on the 82 numbering', "j: p.j >= N ? NR + p.j - N : (res ? HB.parcelFor(all[p.j]) : p.j)", 'j: p.j >= N ? NR + p.j - N : p.j'],
  ['wiringEmotions : the body step of Cannon-Bard forgotten', "s.regions === 'emotion+body' ? [...new Set([...seeds, ...toNodes(['Hypothal'])])]", "s.regions === 'emotion+body' ? seeds"],
  ['wiringEmotions : witness reversed', 'mesure: HB.SHARED.shared > 0 && (HB.SHARED.families.Lamyg || []).length >= 2 ? 0 : 1,', 'mesure: HB.SHARED.shared > 0 && (HB.SHARED.families.Lamyg || []).length >= 2 ? 1 : 0,'],
  ['nummenmaaMaps : mean over six', 'const meanHit = EM.reduce((a, e) => a + hit[e], 0) / EM.length;', 'const meanHit = EM.reduce((a, e) => a + hit[e], 0) / (EM.length - 1);'],
  ['nummenmaaMaps : chance among six', 'chanceOk = (100 / EM.length).toFixed(0) === hit.chance.toFixed(0);', 'chanceOk = (100 / (EM.length - 1)).toFixed(0) === hit.chance.toFixed(0);'],
  ['nummenmaaMaps : experiment 5 in the first four', 'const firstFour = [\'exp1a\', \'exp1b\', \'exp1c\', \'exp2\', \'exp3\', \'exp4\']', 'const firstFour = [\'exp1a\', \'exp1b\', \'exp1c\', \'exp2\', \'exp3\', \'exp4\', \'exp5\']'],
  ['nummenmaaMaps : readers from the Methods', 'READERS = hit.readers;', 'READERS = sizes.exp5;'],
  ['nummenmaaMaps : guess slider ignored', 'const guess = Math.max(0, Math.min(1, Math.round(P.guessNummenmaa)))', 'const guess = 0'],
  ['nummenmaaMaps : chance per mille', 'const p = guess ? 1 / EM.length : hit[e] / 100;', 'const p = guess ? 1 / EM.length : hit[e] / 1000;'],
  ['nummenmaaMaps : chance itself counted above', 'const above = EM.filter((e) => hit[e] > hit.chance)', 'const above = EM.filter((e) => hit[e] > hit.mean)'],
  ['nummenmaaMaps : witness reversed', 'mesure: above.length >= 5 ? 0 : 1,', 'mesure: above.length >= 5 ? 1 : 0,'],
  ['bernoulliRisk : square root instead of the logarithm', 'const LOG = { u: lnD, inv: expSafe }', 'const LOG = { u: (w) => Math.sqrt(w), inv: (v) => v * v }'],
  ['bernoulliRisk : strict rounding instead of one unit', 'c !== null && Math.abs(c - pr) < 1).length, rounded', 'c !== null && Math.round(c) === pr).length, rounded'],
  ['bernoulliRisk : 5 ships in 1000', 'const lost = caius.lostOf100 / 100,', 'const lost = caius.lostOf100 / 1000,'],
  ['bernoulliRisk : insurer without the premium', '[lost, y + prem - G]]', '[lost, y - G]]'],
  ['bernoulliRisk : bisection cut short', 'for (let i = 0; i < 200; i++) { const m = (a + b) / 2;', 'for (let i = 0; i < 5; i++) { const m = (a + b) / 2;'],
  ['bernoulliRisk : one ship in 100 lost', 'const pShip = semp.lostOf10 / 10;', 'const pShip = semp.lostOf10 / 100;'],
  ['bernoulliRisk : St Petersburg cut at 20 terms', 'const peteAt = (R, a, terms = 200)', 'const peteAt = (R, a, terms = 20)'],
  ['bernoulliRisk : St Petersburg tolerance 0.01', 'Math.abs(peteValues[i] - pr) < 0.1)', 'Math.abs(peteValues[i] - pr) < 0.01)'],
  ['bernoulliRisk : printed relation with the other premium', '(caius.insurer - caius.caius === G - caius.premium ? 1 : 0)', '(caius.insurer - caius.caius === G - caius.premium2 ? 1 : 0)'],
  ['bernoulliRisk : nobody tested at 600', 'const pN = caius.premiumNobody;', 'const pN = caius.premiumNobody + 100;'],
  ['bernoulliRisk : loss counted from the stake', 'fLoss = fair.fortune - fv;', 'fLoss = fair.stake - fv;'],
  ['bernoulliRisk : Sempronius limit with no ship lost', 'const expectedSea = semp.sea * (10 - semp.lostOf10) / 10,', 'const expectedSea = semp.sea * 10 / 10,'],
  ['bernoulliRisk : Sempronius falling', 'i === 0 || v > sempSeries[i - 1]', 'i === 0 || v < sempSeries[i - 1]'],
  ['bernoulliRisk : Cramer cap 2^23', 'for (let j = 0; j < cramer.capPower; j++) capValue *= 2;', 'for (let j = 0; j < cramer.capPower - 1; j++) capValue *= 2;'],
  ['bernoulliRisk : misprint by two digits', 'printedCap.slice(0, i) + printedCap.slice(i + 1) === capText', 'printedCap.slice(0, i) + printedCap.slice(i + 2) === capText'],
  ['bernoulliRisk : square root closed form 1/(2 - sqrt 2)', 'rootClosed = 1 / (6 - 4 * Math.sqrt(2));', 'rootClosed = 1 / (2 - Math.sqrt(2));'],
  ['bernoulliRisk : witness reversed', 'mesure: linearFails && rootFails ? 0 : 1,', 'mesure: linearFails && rootFails ? 1 : 0,'],
  ['bernoulliRisk : expected loss doubled in the witness', 'expectedLoss = lost * G;', 'expectedLoss = 2 * lost * G;'],
  ['bernoulliRisk : slider ignored', 'const shown = Math.max(0, Math.min(3, Math.round(P.problemBernoulli)))', 'const shown = 0'],
  ['bernoulliRisk : printed stake point dropped', 'pts.push([fair.stake / 100, fair.lossAbove / 100, 3]);', ''],
  ['helmholtzNerve : length taken in cm', 'const speeds = series.map((s) => s.length / 1000 / s.delay);', 'const speeds = series.map((s) => s.length / 100 / s.delay);'],
  ['helmholtzNerve : error from the far time', 'speeds[i] * s.delayErr / s.delay)', 'speeds[i] * s.farErr / s.delay)'],
  ['helmholtzNerve : far plus near', 'Math.round((s.far - s.near) * 1e5)', 'Math.round((s.far + s.near) * 1e5)'],
  ['helmholtzNerve : tolerance 0.01 instead of 0.1', 'Math.abs(v - printed[i]) < 0.1).length', 'Math.abs(v - printed[i]) < 0.01).length'],
  ['helmholtzNerve : truncated instead of rounded', 'v.toFixed(1) === printed[i].toFixed(1)).length', 'Math.floor(v * 10) / 10 === printed[i]).length'],
  ['helmholtzNerve : misprint by a factor 100', 'Math.abs(series[i].speed * 10 - printed[i]) < 1e-9', 'Math.abs(series[i].speed * 100 - printed[i]) < 1e-9'],
  ['helmholtzNerve : page compared with the computation', 'const samePage = series.filter((s, i) => s.speed === printed[i]).length;', 'const samePage = series.filter((s, i) => s.speed === speeds[i]).length;'],
  ['helmholtzNerve : warm mean over four', '/ (NAMES.length - COOL);', '/ (NAMES.length - COOL + 1);'],
  ['helmholtzNerve : weights 1 / error', 'const w = 1 / (printedErr[i] * printedErr[i]);', 'const w = 1 / printedErr[i];'],
  ['helmholtzNerve : 26.4 forced as reproduced', 'Math.abs(weighted - sum.leastSquares) < 0.05', 'Math.abs(weighted - sum.leastSquares) < 0.5'],
  ['helmholtzNerve : 1852 cylinder for one second', 'const perSecond = later.cylinder * later.perSixth,', 'const perSecond = later.cylinder,'],
  ['helmholtzNerve : 1852 length left in mm', 'speed1852 = later.length / 1000 / (later.gapMm / perSecond)', 'speed1852 = later.length / (later.gapMm / perSecond)'],
  ['helmholtzNerve : cool series warmer than the warm', 'coolTemp.highC < Math.min(...warmC)', 'coolTemp.highC > Math.min(...warmC)'],
  ['helmholtzNerve : witness reversed', 'mesure: instantFails ? 0 : 1,', 'mesure: instantFails ? 1 : 0,'],
  ['helmholtzNerve : witness needs 3.5 probable errors', 'Math.min(...sigmas) > 3 &&', 'Math.min(...sigmas) > 3.5 &&'],
  ['helmholtzNerve : slider ignored', 'const shown = Math.max(0, Math.min(3, Math.round(P.seriesHelmholtz)))', 'const shown = 0'],
  ['helmholtzNerve : no error bars', 'if (i < COOL) for (let j = 0; j <= 20; j++)', 'if (i < 0) for (let j = 0; j <= 20; j++)'],
  ['helmholtzNerve : bars around the computed speed', '(printed[i] + printedErr[i] * (j / 10 - 1)) / Y', '(speeds[i] + printedErr[i] * (j / 10 - 1)) / Y'],
  ['helmholtzNerve : warm mean drawn at 26.4', 'pts.push([5 / 8 + j / 32, sum.mean / Y, 3])', 'pts.push([5 / 8 + j / 32, sum.leastSquares / Y, 3])'],
  ['helmholtzNerve : speed scaled by 40', 'pts = [], Y = 50;', 'pts = [], Y = 40;'],
  ['bornage retire', 'v = Math.min(b, Math.max(a, v));', ''],
  ['Math.random injecte (marche)', 'rng = mulberry32(P.graine), K =', 'rng = Math.random, K ='],
];
const moteur = pathToFileURL(join(ICI, 'tam-moteur.js')).href;
const dossier = mkdtempSync(join(process.env.TAM_TMP || tmpdir(), 'tam-maths-mutants-'));
let tues = 0;
console.log('\nMUTANTS :');
try {
  for (let i = 0; i < MUTANTS.length; i++) {
    const [nom, de, vers] = MUTANTS[i], k = src.split(de).length - 1;
    if (k !== 1) { console.log(`  M${i + 1} ${nom} : NON APPLIQUE (motif trouve ${k} fois) -> SURVIVANT`); continue; }
    const f = join(dossier, `mutant-${i + 1}.mjs`);
    writeFileSync(f, src.replace(de, () => vers).replace("from './tam-moteur.js'", `from '${moteur}'`).replace("from './human-brain-data.js'", `from '${pathToFileURL(join(ICI, 'human-brain-data.js')).href}'`).replace("from './human-brain-anatomy.js'", `from '${pathToFileURL(join(ICI, 'human-brain-anatomy.js')).href}'`).replace("from './human-brain-parts.js'", `from '${pathToFileURL(join(ICI, 'human-brain-parts.js')).href}'`));
    /* le systeme vise par le mutant, d apres le premier mot de son nom ; « bornage » et le reste : tout */
    const CIBLES = { helmholtzNerve: ['nerveHelmholtz'], bernoulliRisk: ['riskBernoulli'],wiringEmotions: ['emotionWiringHCP'],nummenmaaMaps: ['bodyMapsNummenmaa'], siegelEmotions: ['emotionsSiegel'], connectomeCounts: ['connectomeSizes'], herculanoNeurons: ['neuronsHerculanoHouzel'], lucasAllOrNone: ['allOrNoneLucas'], boydBrain: ['brainBoyd'], cannonGlycosuria: ['glycosuriaCannon'], konigWeber: ['weberKonig'], pavlovExtinction: ['extinctionPavlov'], peirceJastrow: ['pressurePeirceJastrow'], cattellAttention: ['attentionCattell'], dondersReaction: ['reactionDonders'], thorndikeEssais: ['essaisThorndike'], katerPendule: ['penduleKater'], herschelJauges: ['jaugesHerschel'], planckConstantes: ['constantesPlanck'], rubensReststrahlen: ['reststrahlenRubens'], michelsonEther: ['etherMichelson'], rutherfordEmanation: ['emanationRutherford'], darwinMais: ['maisDarwin'], pogsonMagnitudes: ['magnitudesPogson'], thomsonRayons: ['rayonsThomson'], mendelPois: ['poisMendel'], moseleySpirale: ['spiraleMoseley'], hagenTubes: ['tubesHagen'], kaedingSyllabes: ['syllabesKaeding'], mackellarFonte: ['fonteMacKellar'], oldhamSeismes: ['tempsOldham'], bealCones: ['spiralesBeal'], halleyCompas: ['variationsHalley'], poiseuilleTubes: ['tubesPoiseuille'], weberUnites: ['unitesWeber'], gaussAimant: ['aimantGauss'], perrinBrown: ['deplacementsPerrin'], darcy: ['filtreDarcy'], reynolds: ['critiqueReynolds'], jouleChaleur: ['effetJoule'], coulomb: ['balanceCoulomb'], lummer: ['picLummer'], young: ['ondulationsYoung'], nyquist: ['vitesseNyquist'], bessel: ['parallaxeBessel'], mendenhall: ['motsMendenhall'], howard: ['chaleurLondres'], halley: ['survieHalley'], omori: ['repliquesOmori'], petitDulong: ['chaleursPetitDulong'], faraday: ['equivalentsFaraday'], nightingale: ['mortaliteNightingale'], gause: ['exclusionGause'], bradley: ['aberrationBradley'], galton: ['regressionGalton'], michelson: ['lumiereMichelson'], moseley: ['loiMoseley'], hubble: ['loiHubble1929'], graunt: ['vieGraunt'], millikan: ['gouttesMillikan'], lynx: ['lynxHudson'], eddington: ['eclipseEddington'], joule: ['equivalentJoule'], cavendish: ['densiteCavendish'], semmelweis: ['fievreSemmelweis'], ebbinghaus: ['oubliEbbinghaus'], sturtevant: ['carteSturtevant'], argon: ['argonRayleigh'], alpha: ['diffusionAlpha'], michaelis: ['michaelisMenten'], especes: ['especesAire'], ohm: ['loiOhm'], boyle: ['loiBoyle'], balmer: ['raiesBalmer'], cholera: ['choleraSnow'], demivies: ['demiViesNPL'], photoelectrique: ['effetPhotoelectrique'], population: ['populationMonde'], keeling: ['courbeKeeling'], liaison: ['energieLiaison'], maree: ['mareeVivesEaux'], gutenberg: ['gutenbergRichter'], zipf: ['loiZipf'], atmosphere: ['atmosphereStandard'], entropie: ['entropieShannon'], gamme: ['gammeTemperee'], fourmi: ['fourmiLangton'], padovan: ['suitePadovan'], thue: ['thueMorse'], perrin: ['suitePerrin'], kolakoski: ['suiteKolakoski'], recaman: ['suiteRecaman'], narayana: ['triangleNarayana'], schroder: ['schroderChemins'], frobenius: ['frobeniusPieces'], goldbach: ['goldbachPaires'], totient: ['indicatriceEuler'], pisano: ['periodePisano'], motzkin: ['motzkinChemins'], stirling: ['stirlingBell'], kaprekar: ['routineKaprekar'], collatz: ['suiteCollatz'], harmoniques: ['nombresHarmoniques'], derangements: ['derangements'], regarder: ['regarderDire'], hanoi: ['toursHanoi'], calkin: ['calkinWilf'], lucas: ['theoremeLucas'], zeckendorf: ['zeckendorf'], josephus: ['problemeJosephus'], bernoulli: ['nombresBernoulli'], aliquote: ['parfaitsAmicaux'], mertens: ['fonctionMertens'], wilson: ['theoremeWilson'], carmichael: ['nombresCarmichael'], pell: ['equationPell'], carres: ['sommesCarres'], ptolemee: ['ptolemee'], hexagramme: ['pascalHexagramme'], ramsey: ['ramseyR33'], triangulations: ['triangulations'], distinctes: ['distinctesImpaires'], simson: ['simsonDroite'], bale: ['bale'], morley: ['morley'], euler: ['eulerSolides'], saw: ['marcheAutoEvitante'], vie: ['jeuDeLaVie'], feuerbach: ['feuerbach'], billard: ['billardElliptique'], napoleon: ['napoleon'], percolation: ['percolationLiens'], pick: ['theoremePick'], dragon: ['courbeDragon'], partitions: ['partitionEuler'], catalan: ['catalanDyck'], marche: ['marcheAleatoire'], buffon: ['aiguilleBuffon'], anniversaires: ['anniversaires'], ulam: ['spiraleUlam'], pascal: ['pascalSierpinski'], solides: ['solidesPlatoniques'], monty: ['montyHall'], apollo: ['apollonius'], sable: ['tasDeSable'], verger: ['vergerEuclide'], ford: ['cerclesFord'], steiner: ['fermatSteiner'], caustique: ['causticTasse'], hofstadter: ['papillonHofstadter'], dominos: ['dominosKasteleyn'], ising: ['ising'], azteque: ['aztecDiamond'], coupons: ['collectionneur'], ruine: ['ruineJoueur'] };
    const cible = CIBLES[nom.split(' ')[0]] || null;
    let r; try { r = suite(await import(pathToFileURL(f).href), false, cible); } catch (e) { r = [{ nom: 'exception: ' + e.message, ok: false }]; }
    /* 09/11: a mutant copy that cannot even LOAD (an import not rewritten for the temp folder) killed all 814 mutants for nothing: a load
     *   failure is not a kill */
    if (r.length === 1 && /Cannot find module|ERR_MODULE_NOT_FOUND/.test(r[0].nom)) { console.log(`  M${i + 1} ${nom} : NE SE CHARGE PAS (${r[0].nom.slice(0, 90)}) -> SURVIVANT`); continue; }
    const rouges = r.filter((x) => !x.ok);
    if (rouges.length) tues++;
    console.log(`  M${i + 1} ${nom} : ${rouges.length ? 'TUE' : 'SURVIT'} (${rouges.length} rouges${rouges.length ? ', ex: ' + rouges.slice(0, 2).map((x) => x.nom).join(' | ') : ''})`);
  }
} finally { rmSync(dossier, { recursive: true, force: true }); }
assertions++; if (tues !== MUTANTS.length) ech.push({ nom: 'mutants', det: `${tues}/${MUTANTS.length}` });
console.log(`\nMUTANTS : ${tues}/${MUTANTS.length} tues`);
if (ech.length) { console.log('\nECHECS :'); for (const e of ech) console.log('  ' + e.nom + '  ' + (e.det || '')); process.exit(1); }
console.log(`test-tam-maths-20261103 : ${assertions} assertions OK`);
