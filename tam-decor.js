/* tam-decor.js - game82 (Phil : "il manque des elements visuels, comme le Soleil pour les autres systemes, pour mieux comprendre") :
 *   les OBJETS DE CONTEXTE a dessiner avec les donnees d une science (Soleil, horizon d un trou noir, noyau, plaques, fentes,
 *   parois, points de Lagrange...). Pur : aucun DOM, aucun reseau ; la page l importe a cote de tam-science.js.
 *   REGLE : un objet n est pose QUE s il est VRAI dans les coordonnees du module (colonnes de brut relues dans le code de
 *     simuler) ; positions et rayons calcules depuis les params (bornes par le module : o.params) ou depuis la sortie o
 *     (invariants, brut, film). Ce qu un module n expose pas n est pas devine : le systeme est liste dans SANS_DECOR avec la raison.
 *   Espaces :
 *     'brut'   : le meme espace a D dimensions que les lignes de o.brut (avant standardiserIso / projeterND).
 *     'corps3' : pour les systemes CORPS (tam-science.js#CORPS), l espace 3-D par corps AVANT la normalisation de vueCorps
 *                (k = 2 : z = 0). normaliserCorps() ci-dessous applique exactement la meme mise a l echelle que vueCorps.
 *   Objets : { type: 'point' | 'sphere' | 'cercle' | 'segment' | 'plan', espace, centre: number[D ou 3], rayon?, normale?, a?, b?,
 *     couleur, libelle, remplissage? } ; champs optionnels en plus : largeur (fente), arc [debut, fin] (radians, dans le plan du
 *     cercle, depuis l axe 0), image (indice de l image du film ou l objet vaut).
 *   Pour D > 3 : rayon et normale d une sphere / d un cercle agissent dans les TROIS premiers axes, les autres coordonnees restent
 *     celles du centre ; un 'plan' est l hyperplan de normale `normale` (vecteur a D composantes) passant par le centre ; son rayon
 *     est une taille d AFFICHAGE (la moitie de la plus grande etendue des donnees), pas une grandeur physique. */
import { CORPS, systeme } from './tam-science.js';

export const ESPACE_CORPS = Object.freeze(Object.keys(CORPS));
const PI = 3.141592653589793;

/* G = c = M = 1 dans tam-physique.js (M = 1), tam-cosmos.js (M_TN = 1), tam-invisible.js (M = 1) */
const M_GEO = 1;
const R_HORIZON = 2 * M_GEO;
const R_PHOTONS = 3 * M_GEO;
const R_ISCO = 6 * M_GEO;

export const COULEURS = Object.freeze({
  trouNoir: '#ff4d4d', photons: '#ffb000', isco: '#4da3ff', ergo: '#c77dff', soleil: '#ffd23f', terre: '#3fa7ff', lune: '#c8c8c8',
  planete: '#e09f3e', paroi: '#a0a7b4', noyau: '#ff6b6b', repere: '#e8e8e8', zone: '#7bd389', champ: '#56cfe1',
});
const C = COULEURS;

/* ---------- fabriques ---------- */
const pt = (centre, couleur, libelle, x = {}) => ({ type: 'point', centre, couleur, libelle, ...x });
const sph = (centre, rayon, couleur, libelle, x = {}) => ({ type: 'sphere', centre, rayon, couleur, libelle, remplissage: false, ...x });
const cer = (centre, rayon, normale, couleur, libelle, x = {}) => ({ type: 'cercle', centre, rayon, normale, couleur, libelle, ...x });
const seg = (a, b, couleur, libelle, x = {}) => ({ type: 'segment', centre: a.map((v, i) => (v + b[i]) / 2), a, b, couleur, libelle, ...x });
const pln = (centre, normale, rayon, couleur, libelle, x = {}) => ({ type: 'plan', centre, normale, rayon, couleur, libelle, ...x });
/* vecteur de dimension D : les premieres composantes donnees, le reste a 0 */
const v = (D, ...val) => { const r = new Array(D).fill(0); val.forEach((x, i) => { r[i] = x; }); return r; };
const axe = (D, k) => { const r = new Array(D).fill(0); r[k] = 1; return r; };
/* un hyperplan coord[k] = valeur, centre au milieu des donnees */
const hyper = (B, k, valeur, couleur, libelle, x = {}) => { const c = B.centre.slice(); c[k] = valeur; return pln(c, axe(B.centre.length, k), B.ext / 2, couleur, libelle, x); };

/** la boite des donnees : par colonne (espace brut), ou sur tous les corps (espace corps3, k coordonnees par corps) */
export function boiteDonnees(id, o) {
  const k = CORPS[id] || 0, D = o.D, n = o.n, b = o.brut, d = k ? 3 : D;
  const lo = new Array(d).fill(Infinity), hi = new Array(d).fill(-Infinity);
  if (k) {
    const m = Math.max(1, Math.floor(D / k));
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) for (let c = 0; c < 3; c++) {
      const x = c < k ? b[i * D + j * k + c] : 0; if (x < lo[c]) lo[c] = x; if (x > hi[c]) hi[c] = x;
    }
  } else for (let i = 0; i < n; i++) for (let c = 0; c < D; c++) { const x = b[i * D + c]; if (x < lo[c]) lo[c] = x; if (x > hi[c]) hi[c] = x; }
  const centre = lo.map((x, c) => (x + hi[c]) / 2);
  let ext = 0; for (let c = 0; c < d; c++) ext = Math.max(ext, hi[c] - lo[c]);
  return { lo, hi, centre, ext };
}

/** les objets corps3 dans la vue de vueCorps (memes echantillons, meme centre, meme echelle) : pour l affichage */
export function normaliserCorps(objets, o, k) {
  const n = o.n, D = o.D, m = Math.max(1, Math.floor(D / k)), par = Math.max(1, Math.floor(n / m));
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let p = 0; p < n; p++) {
    const b = Math.min(m - 1, Math.floor(p / par)), j = p - b * par, i = Math.min(n - 1, Math.floor(Math.min(j, par - 1) * n / par));
    for (let c = 0; c < 3; c++) { const x = c < k ? o.brut[i * D + b * k + c] : 0; if (x < lo[c]) lo[c] = x; if (x > hi[c]) hi[c] = x; }
  }
  const r = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2, s = r > 0 ? 1 / r : 0, mil = [0, 1, 2].map((c) => (lo[c] + hi[c]) / 2);
  const f = (p) => p.map((x, c) => (x - mil[c]) * s);
  return objets.map((q) => {
    const w = { ...q, espace: 'vue', centre: f(q.centre) };
    if (q.a) { w.a = f(q.a); w.b = f(q.b); }
    if (typeof q.rayon === 'number') w.rayon = q.rayon * s;
    if (typeof q.largeur === 'number') w.largeur = q.largeur * s;
    return w;
  });
}

/* ---------- les decors, systeme par systeme (P = params bornes, o = sortie de simuler, B = boite des donnees) ---------- */
const trouNoirPlan = (zHaut, avecIsco) => {
  const l = [seg([0, 0, 0], [0, 0, zHaut], C.trouNoir, 'Black hole (stays at r = 0; height = time)'),
    cer([0, 0, 0], R_HORIZON, [0, 0, 1], C.trouNoir, 'Event horizon (r = 2M)', { remplissage: true }),
    cer([0, 0, 0], R_PHOTONS, [0, 0, 1], C.photons, 'Photon sphere (r = 3M)')];
  if (avecIsco) l.push(cer([0, 0, 0], R_ISCO, [0, 0, 1], C.isco, 'Innermost stable circular orbit (r = 6M)'));
  /* game82 (vu a l ecran) : hauteur = temps -> le trou noir est un TUBE ; un seul anneau a t = 0 le montrait loin de l orbite.
   *   Anneaux « muets » (libelle garde, pas ecrit a l ecran) a mi-hauteur et en haut ; les premiers objets gardent nom et rayon lus par les tests. */
  if (Number.isFinite(zHaut) && zHaut > 0) for (const z of [zHaut / 2, zHaut]) {
    l.push(cer([0, 0, z], R_HORIZON, [0, 0, 1], C.trouNoir, 'Event horizon, later time', { remplissage: true, muet: true }));
    if (avecIsco) l.push(cer([0, 0, z], R_ISCO, [0, 0, 1], C.isco, 'Innermost stable circular orbit, later time', { muet: true }));
  }
  return l;
};
/* aretes d un cube de demi-cote h centre c (12 segments) */
function aretesCube(c, h, couleur, libelle) {
  const l = [], s = [-h, h];
  for (const y of s) for (const z of s) l.push(seg([c[0] - h, c[1] + y, c[2] + z], [c[0] + h, c[1] + y, c[2] + z], couleur, libelle));
  for (const x of s) for (const z of s) l.push(seg([c[0] + x, c[1] - h, c[2] + z], [c[0] + x, c[1] + h, c[2] + z], couleur, libelle));
  for (const x of s) for (const y of s) l.push(seg([c[0] + x, c[1] + y, c[2] - h], [c[0] + x, c[1] + y, c[2] + h], couleur, libelle));
  return l;
}
/* PREM (tam-grandes-questions.js#PREM, rayons hauts des couches en km ; le tableau n est pas exporte : ces quatre rayons y sont
   relus par le banc) : graine/noyau liquide, noyau/manteau, manteau/croute (Moho), surface */
const R_TERRE_KM = 6371;
const PREM_KM = Object.freeze([[1221.5, 'Inner core edge'], [3480, 'Core-mantle boundary'], [6346.6, 'Base of the crust (Moho)'], [6371, 'Surface']]);
/* sommets du tetraedre de tam-sciences.js#SOMMETS (constante du module, non exportee) */
const SOMMETS_TETRA = Object.freeze([[0, 0, 0], [1, 1, 0], [1, 0, 1], [0, 1, 1]]);
/* Stern-Gerlach (tam-quantique.js#sternGerlach) : aimant de y = 0 a LM, ecran en LE */
const SG_LM = 1, SG_LE = 2;
/* noms des primaires de pointsLagrange (monde 0 : Soleil-Jupiter, 1 : Terre-Lune, tam-cosmos.js#MU_LAGRANGE) */
const PRIMAIRES = [['Sun', 'Jupiter'], ['Earth', 'Moon']];

const DECORS = {
  /* tam-physique.js : (x, y) dans le plan de l orbite, z = temps coordonne remis a l echelle (z final = 2 rmax) */
  schwarzschild: (P, o, B) => trouNoirPlan(B.hi[2], true),
  kepler: (P, o, B) => [pt([0, 0, 0], C.soleil, 'Central mass (Newton: a point, no horizon)'),
    seg([0, 0, 0], [0, 0, B.hi[2]], C.soleil, 'Central mass (stays at r = 0; height = time)')],
  /* masses egales, impulsion totale nulle : le centre de masse reste en (perturbation / 3, 0, 0) (conditions initiales du module) */
  troisCorps: (P) => [pt([P.perturbation / 3, 0, 0], C.repere, 'Centre of mass (fixed)')],
  /* R0 = 1 (axe magnetique), paroi r = 0.8 autour de l axe (tam-physique.js#tokamak, hors) */
  tokamak: () => [cer([0, 0, 0], 1, [0, 0, 1], C.champ, 'Magnetic axis (R = 1)'),
    cer([0, 0, 0], 1.8, [0, 0, 1], C.paroi, 'Vessel wall, outer equator'), cer([0, 0, 0], 0.2, [0, 0, 1], C.paroi, 'Vessel wall, inner equator'),
    cer([1, 0, 0], 0.8, [0, 1, 0], C.paroi, 'Vessel wall cross-section (r = 0.8)')],
  /* colonnes : x, y du bout du 2e bras, omega2, omega1 ; bras de longueur 1 */
  doublePendule: () => [pt([0, 0, 0, 0], C.repere, 'Pivot (x = 0, y = 0)'), cer([0, 0, 0, 0], 2, [0, 0, 1, 0], C.paroi, 'Reach of the two arms (r = 2)')],
  /* E = (E0, 0, 0), B = (0, 0, 1) : derive E x B = (0, -E0, 0) a la vitesse E/B, depuis le depart a l origine */
  lorentzRelativiste: (P) => [pt([0, 0, 0], C.repere, 'Start'), seg([0, 0, 0], [0, -P.rapport * P.duree, 0], C.champ, 'E x B drift (speed E/B, along -y)')],
  hydrogene: (P, o) => [pt([0, 0, 0], C.noyau, 'Nucleus (proton)'),
    sph([0, 0, 0], o.invariants.rayonMoyen.debut, C.zone, 'Mean distance <r> = (3n^2 - l(l+1))/2 Bohr radii')],

  /* tam-sciences.js */
  spiraleOr: () => [pt([0, 0, 0], C.repere, 'Pole of the spiral (approached, never reached)')],
  phyllotaxieOr: () => [sph([0, 0, 0], 1, C.paroi, 'Sphere the seeds are packed on')],
  ifs3d: () => {
    const l = SOMMETS_TETRA.map((s, i) => pt(s.slice(), C.repere, 'Vertex ' + (i + 1)));
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) l.push(seg(SOMMETS_TETRA[i].slice(), SOMMETS_TETRA[j].slice(), C.paroi, 'Edge of the tetrahedron'));
    return l;
  },
  bloch: (P) => {
    const W = Math.sqrt(P.rabi * P.rabi + P.delta * P.delta), nx = P.rabi / W, nz = P.delta / W;
    return [sph([0, 0, 0], 1, C.paroi, 'Bloch sphere (every pure state)'), pt([0, 0, 1], C.zone, 'Spin up |0>'), pt([0, 0, -1], C.noyau, 'Spin down |1>'),
      seg([-nx, 0, -nz], [nx, 0, nz], C.champ, 'Rotation axis of the drive (rabi, 0, delta)')];
  },
  /* colonnes : x sur l ecran (mm), y le long des fentes (mm), ordre d arrivee ; fentes a x = -d/2 et +d/2 (largeur a), 1 m avant l ecran */
  fentesYoung: (P, o, B) => {
    const xs = [-P.d / 2, P.d / 2], y0 = B.lo[1], y1 = B.hi[1];
    return [seg([xs[0], y0, 0], [xs[0], y1, 0], C.paroi, 'Slit 1 (x = -d/2, 1 m before the screen)', { largeur: P.a }),
      seg([xs[1], y0, 0], [xs[1], y1, 0], C.paroi, 'Slit 2 (x = +d/2, 1 m before the screen)', { largeur: P.a }),
      seg([0, y0, 0], [0, y1, 0], C.zone, 'Centre of the pattern (bright fringe)')];
  },
  /* boite de cote 1 centree (coordonnee u - 0.5) */
  boiteQuantique: () => aretesCube([0, 0, 0], 0.5, C.paroi, 'Box wall (perfectly hard)'),

  /* tam-fluides.js */
  /* centre de vorticite = (sum G x, sum G y) / sum G, conserve (impulsions du module) */
  tourbillonsPonctuels: (P, o) => {
    let g = 0; for (let k = 1; k <= P.nombre; k++) g += P['G' + k];
    return [pt([o.invariants.impulsionX.debut / g, o.invariants.impulsionY.debut / g, 0], C.repere, 'Centre of vorticity (fixed)')];
  },
  /* domaine [0, 2] x [0, 1] (parois etanches : u = 0 en x = 0, 2 ; v = 0 en y = 0, 1) ; z = temps */
  doubleGyre: (P, o, B) => [hyper(B, 0, 0, C.paroi, 'Wall (x = 0)'), hyper(B, 0, 2, C.paroi, 'Wall (x = 2)'),
    hyper(B, 1, 0, C.paroi, 'Wall (y = 0)'), hyper(B, 1, 1, C.paroi, 'Wall (y = 1)')],
  /* a = 1, h = rapport ; tourbillon k de la rangee haute en (k + U t, h/2), basse en (k + 1/2 + U t, -h/2) ; z = U t :
     chaque tourbillon est la droite x = x_k + z. Le module n a PAS de cylindre ("no cylinder") : aucun n est dessine. */
  karman: (P, o, B) => {
    const z1 = B.hi[2], h = P.rapport, l = [];
    for (const [dx, y, G, nom] of [[0, h / 2, '+', 'upper'], [0.5, -h / 2, '-', 'lower']]) {
      for (let k = Math.floor(B.lo[0] - z1 - dx) - 1; k <= Math.ceil(B.hi[0] - dx) + 1; k++) {
        const x0 = k + dx; if (x0 + z1 < B.lo[0] || x0 > B.hi[0]) continue;
        l.push(seg([x0, y, 0], [x0 + z1, y, z1], G === '+' ? C.noyau : C.champ, 'Vortex (' + G + 'Gamma, ' + nom + ' row; height = U t)'));
      }
    }
    return l;
  },
  /* colonnes : x, z dans la couche (parois z = 0 et 1), temps */
  rayleighBenard: (P, o, B) => [hyper(B, 1, 0, C.noyau, 'Hot bottom plate (z = 0)'), hyper(B, 1, 1, C.champ, 'Cold top plate (z = 1)')],

  /* tam-astro.js */
  systemeSolaire: () => [pt([0, 0, 0], C.soleil, 'Sun')],
  /* UA, repere du ciel ; Sgr A* a l origine, rayon de Schwarzschild calcule par le module */
  etoileS2: (P, o) => [pt([0, 0, 0], C.trouNoir, 'Sgr A* (black hole)'),
    sph([0, 0, 0], o.invariants.rayonSchwarzschild.mesure, C.trouNoir, 'Event horizon of Sgr A* (2GM/c^2)', { remplissage: true })],
  /* colonnes : separation relative (x, y) en M, temps remis a l echelle, excentricite ; arret quand le periastre vaut 6 M */
  binaireTrouNoir: (P, o) => {
    const n = o.n, z = o.brut[(n - 1) * 4 + 2], e = o.brut[(n - 1) * 4 + 3];
    return [cer([0, 0, z, e], o.fin.periastre, [0, 0, 1, 0], C.isco, 'Periastron 6M: the model stops here (plunge)')];
  },
  /* centre de masse au repos a l origine (tam-astro.js#amasEtoiles) ; le trou noir bouge autour */
  amasEtoiles: () => [pt([0, 0, 0], C.repere, 'Centre of mass of stars and black hole (fixed)')],
  /* colonnes : x, y, z (pc), annees ; choc centre a l origine */
  supernova: (P, o, B) => [seg([0, 0, 0, B.lo[3]], [0, 0, 0, B.hi[3]], C.noyau, 'Explosion centre'),
    sph([0, 0, 0, P.annees], o.invariants.rayonFinal.formule, C.photons, 'Shock front at the end (Sedov-Taylor)')],
  /* colonnes : x, y, z (pc), annees, rho / rho0 ; derriere un choc fort rho = 4 rho0 (gamma = 5/3) */
  supernovaHydro: (P, o, B) => [seg([0, 0, 0, B.lo[3], 0], [0, 0, 0, B.hi[3], 0], C.noyau, 'Explosion centre (density falls to 0 there)'),
    sph([0, 0, 0, P.annees, o.invariants.sautDensite.formule], o.invariants.rayonChoc.rayonPc, C.photons, 'Shock front at the end (density jumps x4)')],
  /* colonnes : t (s, 0 = debut du mode amorti), h+, hx, frequence (Hz) */
  binaireFusion: (P, o, B) => [hyper(B, 0, 0, C.trouNoir, 'Merger: ringdown starts (t = 0)'),
    hyper(B, 3, o.invariants.ringdown.frequence, C.isco, 'Ringing frequency of the final black hole')],
  /* noyaux par image (invariants.film.coeurs, z = 0) */
  collisionGalaxies: (P, o) => {
    const K = o.invariants.film.coeurs, l = [];
    K.forEach((c, k) => { l.push(pt([c[0], c[1], 0], C.soleil, 'Core of galaxy 1', { image: k })); l.push(pt([c[2], c[3], 0], C.planete, 'Core of galaxy 2', { image: k })); });
    for (let k = 1; k < K.length; k++) {
      l.push(seg([K[k - 1][0], K[k - 1][1], 0], [K[k][0], K[k][1], 0], C.soleil, 'Path of core 1'));
      l.push(seg([K[k - 1][2], K[k - 1][3], 0], [K[k][2], K[k][3], 0], C.planete, 'Path of core 2'));
    }
    return l;
  },

  /* tam-cosmos.js */
  /* corps3 : (x, y, phi balaye) par rayon ; le trou noir est l axe x = y = 0 */
  lumiereTrouNoir: (P, o, B) => trouNoirPlan(B.hi[2], false),
  /* Boyer-Lindquist dessine en (sqrt(r^2 + a^2) sin th cos ph, ... , r cos th) : un rayon r de l equateur est le cercle sqrt(r^2 + a^2) */
  kerr: (P, o, B) => {
    const a = P.a, rPlus = M_GEO + Math.sqrt(M_GEO * M_GEO - a * a), eq = (r) => Math.sqrt(r * r + a * a);
    const isco = o.invariants.isco.formule, zAxe = Math.max(Math.abs(B.lo[2]), Math.abs(B.hi[2]), 2 * rPlus);
    return [seg([0, 0, -zAxe], [0, 0, zAxe], C.trouNoir, 'Spin axis of the black hole'),
      cer([0, 0, 0], eq(rPlus), [0, 0, 1], C.trouNoir, 'Event horizon, equator (r+ = M + sqrt(M^2 - a^2))', { remplissage: true }),
      cer([0, 0, 0], eq(2 * M_GEO), [0, 0, 1], C.ergo, 'Ergosphere edge, equator (r = 2M)'),
      cer([0, 0, 0], eq(isco), [0, 0, 1], C.isco, 'Innermost stable circular orbit (' + o.invariants.isco.sens + ')')];
  },
  /* r = sqrt(l^2 + b0^2), z = b0 asinh(l / b0) : la gorge l = 0 est le cercle r = b0, z = 0 */
  trouDeVer: (P) => [cer([0, 0, 0], P.b0, [0, 0, 1], C.ergo, 'Throat of the wormhole (r = b0)')],
  trouDeVerSurface: (P) => [cer([0, 0, 0], P.b0, [0, 0, 1], C.ergo, 'Throat of the wormhole (r = b0)')],
  /* repere tournant : primaires en (-mu, 0) et (1 - mu, 0) ; L1..L3 sur l axe x, L4 / L5 en (1/2 - mu, +-sqrt 3 / 2) */
  pointsLagrange: (P, o) => {
    const I = o.invariants, mu = I.mu, [n1, n2] = PRIMAIRES[P.monde] || ['Primary', 'Secondary'];
    return [pt([-mu, 0, 0], C.soleil, n1), pt([1 - mu, 0, 0], C.planete, n2),
      pt([I.L1.mesure, 0, 0], C.zone, 'L1'), pt([I.L2.mesure, 0, 0], C.zone, 'L2'), pt([I.L3.mesure, 0, 0], C.zone, 'L3'),
      pt([I.L4.x, I.L4.y, 0], C.zone, 'L4'), pt([I.L4.x, -I.L4.y, 0], C.zone, 'L5')];
  },
  pulsarHulseTaylor: () => [pt([0, 0, 0], C.repere, 'Centre of mass of the two neutron stars')],
  /* colonnes : x, y (kpc), v avec halo, v visible (km/s) ; le module donne les deux vitesses a 8.2 kpc (vitesseA8kpc) */
  courbeRotation: (P, o) => {
    const w = o.invariants.vitesseA8kpc;
    return [cer([0, 0, w.avecHalo, w.visibleSeul], 8.2, [0, 0, 1, 0], C.soleil, "The Sun's distance from the centre (8.2 kpc)")];
  },
  expansionUnivers: () => [pt([0, 0, 0], C.terre, 'Us (Milky Way)')],
  /* corps3 : comete (corps 0), Terre sur un cercle de 1 UA (corps 1) ; la ligne 0 est le perihelie */
  cometeHalley: (P, o) => [pt([0, 0, 0], C.soleil, 'Sun'), cer([0, 0, 0], 1, [0, 0, 1], C.terre, "Earth's orbit (1 AU)"),
    pt([o.brut[0], o.brut[1], o.brut[2]], C.zone, "Halley's perihelion (" + (Math.round(o.invariants.perihelie.formule * 1000) / 1000) + ' AU)')],
  trappist1: () => [pt([0, 0, 0], C.noyau, 'TRAPPIST-1 (the star)')],
  /* colonnes : x, y, z (M), vitesse vue d un observateur statique v = sqrt(M / (r - 2M)) : v = 1/2 a l ISCO, v = 1 (c) a 3M ;
     sous 3M aucune orbite circulaire : l horizon est pose a v = 1 (la limite c), ce n est pas une vitesse d orbite */
  disqueAccretion: (P, o) => {
    const vr = (r) => Math.sqrt(M_GEO / (r - R_HORIZON));
    return [cer([0, 0, 0, 1], R_HORIZON, [0, 0, 1, 0], C.trouNoir, 'Event horizon (r = 2M; drawn at speed c)', { remplissage: true }),
      cer([0, 0, 0, vr(R_PHOTONS)], R_PHOTONS, [0, 0, 1, 0], C.photons, 'Photon sphere (r = 3M, orbit speed c)'),
      cer([0, 0, 0, o.invariants.vitesseIsco.formule], o.invariants.isco.formule, [0, 0, 1, 0], C.isco, 'Inner edge of the disk: ISCO (r = 6M)'),
      cer([0, 0, 0, vr(P.rext)], P.rext, [0, 0, 1, 0], C.paroi, 'Outer edge of the disk')];
  },

  /* tam-invisible.js */
  ondeGravitationnelle: () => [cer([0, 0, 0], 1, [0, 0, 1], C.paroi, 'Ring of free masses at rest (radius 1)')],
  /* paraboloide de Flamm : z = 2 sqrt(2M (r - 2M)), z = 0 a l horizon */
  courbureEspaceTemps: (P, o) => {
    const M = P.M, r0 = o.invariants.tempsPropreHorizon.r0;
    return [cer([0, 0, 0], R_HORIZON * M, [0, 0, 1], C.trouNoir, 'Event horizon (r = 2M)', { remplissage: true }),
      pt([r0, 0, 2 * Math.sqrt(2 * M * (r0 - R_HORIZON * M))], C.zone, 'Release point of the falling observer')];
  },
  /* colonnes : r, temps propre, temps de Schwarzschild (coupe) */
  chuteTrouNoir: (P, o, B) => [hyper(B, 0, R_HORIZON, C.trouNoir, 'Event horizon (r = 2M)'), hyper(B, 0, 0, C.noyau, 'Singularity (r = 0)'),
    pt([R_HORIZON, o.fin.horizon.tau, o.invariants.coupure.valeur], C.photons, 'Horizon crossed (outside clocks never see it)')],
  dilatationTemps: () => [pt([0, 0, 0], C.trouNoir, 'Mass M'), cer([0, 0, 0], R_HORIZON, [0, 0, 1], C.trouNoir, 'Its horizon (r = 2M)', { remplissage: true })],
  /* colonnes : x, t, |psi|^2 ; barriere V0 sur [0, a) (a = cellules x dx = largeurEffective) */
  effetTunnel: (P, o) => {
    const a = o.invariants.transmission.largeurEffective, t1 = o.invariants.grille.duree;
    return [seg([0, 0, 0], [0, t1, 0], C.paroi, 'Barrier, left edge (x = 0)'), seg([a, 0, 0], [a, t1, 0], C.paroi, 'Barrier, right edge (x = a)')];
  },
  /* colonnes : x, z, temps ; noyau en x = z = 0 */
  superpositionQuantique: (P, o, B) => [seg([0, 0, 0], [0, 0, B.hi[2]], C.noyau, 'Nucleus (proton; height = time)')],
  /* rayon terrestre = 1, moment selon -z ; centre-guide sur la coquille L0 de l equateur */
  champDipolaire: (P) => [sph([0, 0, 0], 1, C.terre, 'Earth', { remplissage: true }),
    seg([0, 0, -1.5], [0, 0, 1.5], C.champ, 'Magnetic axis of the dipole'),
    cer([0, 0, 0], P.L0, [0, 0, 1], C.zone, 'Shell where the particle is trapped (L = ' + P.L0 + ' Earth radii)')],
  /* onde : x de X0 a X0 + longueursOnde (lambda = 1) ; nuage du dipole de Hertz centre a l origine, axe z
     (longueur d affichage de l antenne : 0.5, sans signification physique) */
  ondeLumiere: (P, o) => {
    const x0 = o.brut[0];
    return [seg([x0, 0, 0], [x0 + P.longueursOnde, 0, 0], C.photons, 'Direction of travel (k)'),
      seg([0, 0, -0.25], [0, 0, 0.25], C.noyau, 'Oscillating dipole antenna (along z)')];
  },
  diagrammeEspaceTemps: () => [pt([0, 0, 0], C.repere, 'Here and now (x = 0, t = 0)')],
  mouvementBrownien: (P, o) => [pt([0, 0, 0], C.repere, 'Start of every particle'),
    sph([0, 0, 0], Math.sqrt(o.invariants.diffusion.msdFormule), C.zone, 'Expected spread after all steps (sqrt(6 D t))')],

  /* tam-quantique.js */
  /* colonnes : x (L = 1), t / T_rev, densite ; parois x = 0 et x = L */
  tapisTalbot: (P, o, B) => {
    const I = o.invariants, T = I.revivalComplete.temps, l = [hyper(B, 0, 0, C.paroi, 'Box wall (x = 0)'), hyper(B, 0, 1, C.paroi, 'Box wall (x = L)')];
    for (const [t, nom] of [[I.quartDeRevival.temps / T, 'Quarter revival'], [I.revivalMiroir.temps / T, 'Mirror revival'], [1, 'Full revival']])
      if (t <= P.duree + 1e-9) l.push(seg([0, t, 0], [1, t, 0], C.zone, nom + ' (t = ' + t + ' T_rev)'));
    return l;
  },
  /* points de rebroussement classiques x = +- sqrt(2E / (m w^2)), E = (n + 1/2) hbar w -> x^2 = 2 <x^2> */
  oscillateurEtats: (P, o, B) => {
    const xt = Math.sqrt(2 * o.invariants.x2Quadrature.debut);
    return [hyper(B, 0, -xt, C.paroi, 'Classical turning point (x = -sqrt((2n+1)/omega))'), hyper(B, 0, xt, C.paroi, 'Classical turning point (x = +sqrt((2n+1)/omega))')];
  },
  wigner: (P, o, B) => [pt([P.q0, 0, 0], C.zone, 'Coherent state at +q0'), pt([-P.q0, 0, 0], C.zone, 'Coherent state at -q0'),
    hyper(B, 2, 0, C.paroi, 'W = 0 (below: negative, impossible classically)')],
  /* colonnes : x, t, P quantique, P classique ; un pas par unite de temps -> |x| <= t */
  marcheQuantique: (P) => [seg([0, 0, 0, 0], [P.pas, P.pas, 0, 0], C.photons, 'Light cone x = +t (one site per step)'),
    seg([0, 0, 0, 0], [-P.pas, P.pas, 0, 0], C.photons, 'Light cone x = -t (one site per step)')],
  /* les quatre reglages du CHSH du module (a = 0, pi/2 ; b = pi/4, 3pi/4), E = -cos(a - b) */
  bellCHSH: () => [[0, PI / 4, 'a = 0, b = pi/4'], [0, 3 * PI / 4, 'a = 0, b = 3pi/4'], [PI / 2, PI / 4, 'a = pi/2, b = pi/4'], [PI / 2, 3 * PI / 4, 'a = pi/2, b = 3pi/4']]
    .map(([a, b, nom]) => { const E = -Math.cos(a - b); return pt([a, b, E, E], C.zone, 'CHSH setting ' + nom); }),
  niveauxLandau: (P, o) => [cer([0, 0, 0], o.invariants.rayonAnneau.debut, [0, 0, 1], C.zone, 'Classical cyclotron radius of level n (sqrt(2n+1) l_B)')],
  /* colonnes : x, y le long du faisceau (aimant 0..LM, ecran en LE), z ; taches en z = +- gradient LM (LE - LM/2) */
  sternGerlach: (P, o, B) => {
    const z = P.gradient * SG_LM * (SG_LE - SG_LM / 2);
    return [hyper(B, 1, 0, C.paroi, 'Magnet entrance'), hyper(B, 1, SG_LM, C.paroi, 'Magnet exit'), hyper(B, 1, SG_LE, C.repere, 'Screen'),
      pt([0, SG_LE, z], C.zone, 'Spin-up spot'), pt([0, SG_LE, -z], C.noyau, 'Spin-down spot')];
  },

  /* tam-fusion.js : colonnes t (s, 0 = pic), h+, hx, frequence (Hz) */
  fusionTrousNoirs: (P, o, B) => [hyper(B, 0, 0, C.trouNoir, 'Peak of the signal (t = 0)'),
    hyper(B, 3, o.invariants.ringdown.frequence, C.isco, 'Ringing frequency of the final black hole')],

  /* tam-grandes-questions.js */
  /* colonnes : x / d (plaques en 0 et 1), k d / pi, champ */
  videQuantique: (P, o, B) => [hyper(B, 0, 0, C.paroi, 'Plate 1 (x = 0)'), hyper(B, 0, 1, C.paroi, 'Plate 2 (x = d)')],
  /* colonnes : x0 (1 + log10 a), y0 (1 + log10 a), temps apres aujourd hui (Gyr) */
  bigRip: (P, o, B) => [seg([0, 0, 0], [0, 0, B.hi[2]], C.terre, 'Our position (the expansion is the same from every galaxy)'),
    hyper(B, 2, o.invariants.tempsAvantRip.mesure, C.trouNoir, 'Big Rip (everything is torn apart)')],
  /* tranche z = 0.5 d une boite periodique de cote 1 ; 3e colonne = 0.3 si vrai vide */
  fauxVide: () => [[0, 0, 1, 0], [1, 0, 1, 1], [1, 1, 0, 1], [0, 1, 0, 0]].map(([x0, y0, x1, y1]) => seg([x0, y0, 0], [x1, y1, 0], C.paroi, 'Edge of the periodic box (side 1)')),
  /* colonnes : x / R (diametre), v (km/s), t (min), g ; les rayons PREM de part et d autre du centre */
  centreTerre: (P, o, B) => {
    const l = [hyper(B, 0, 0, C.noyau, 'Centre of the Earth')];
    /* le Moho est a (6371 - 6346.6) km sous la surface, soit 0.4 % du rayon : deux plans confondus a l ecran, une seule place
       pour ecrire. Le Moho reste trace (muet) et la surface porte l epaisseur de la croute, calculee depuis la table. */
    const moho = PREM_KM[2][0], croute = Math.round((R_TERRE_KM - moho) * 10) / 10;
    for (const [r, nom] of PREM_KM) for (const s of [-1, 1]) l.push(hyper(B, 0, s * r / R_TERRE_KM, nom === 'Surface' ? C.terre : C.paroi,
      nom + ' (' + r + ' km)' + (nom === 'Surface' ? ', Moho ' + croute + ' km below' : ''), r === moho ? { muet: true } : {}));
    return l;
  },
  /* colonnes : x, y (UA), t (jours) ; Soleil a l origine, Terre a 1 UA, Mars a aCible ; depart en (1, 0), arrivee en (-aCible, 0) */
  versMars: (P, o) => {
    const T = o.invariants.dureeTransfert.formule;
    return [seg([0, 0, 0], [0, 0, T], C.soleil, 'Sun (height = time)'), cer([0, 0, 0], 1, [0, 0, 1], C.terre, "Earth's orbit (1 AU)"),
      cer([0, 0, 0], P.aCible, [0, 0, 1], C.planete, "Mars's orbit"),
      pt([1, 0, 0], C.terre, 'Launch from Earth'), pt([-P.aCible, 0, T], C.planete, 'Arrival at Mars')];
  },
  zeroAbsolu: (P, o) => [sph([0, 0, 0], o.invariants.rayons.condensat, C.isco, 'Condensate size (1 sigma)'),
    sph([0, 0, 0], o.invariants.rayons.thermique, C.photons, 'Thermal cloud size (1 sigma)')],
  /* colonnes : x, y (Gpc), temps cosmique de l emission (Gyr) : nous en (0, 0, age), le bord (horizon) a z = 0 */
  tailleUnivers: (P, o) => [pt([0, 0, o.invariants.age.Gyr], C.terre, 'Us, today'),
    cer([0, 0, 0], o.invariants.rayonObservable.Gpc, [0, 0, 1], C.trouNoir, 'Edge of the observable universe (particle horizon)')],
  nombrePi: () => [seg([0, 0, 0], [1, 0, 0], C.paroi, 'Unit square'), seg([1, 0, 0], [1, 1, 0], C.paroi, 'Unit square'),
    seg([1, 1, 0], [0, 1, 0], C.paroi, 'Unit square'), seg([0, 1, 0], [0, 0, 0], C.paroi, 'Unit square'),
    cer([0, 0, 0], 1, [0, 0, 1], C.zone, 'Quarter circle x^2 + y^2 = 1 (inside: counts toward pi)', { arc: [0, PI / 2] })],
  /* spirale : rayon 1 + 2 f, angle 24 pi f ; f = 0 le 1er janvier, f = 1 a minuit le 31 decembre */
  calendrierCosmique: () => [pt([1, 0, 0], C.photons, 'Big Bang (Jan 1, 00:00)'), pt([3, 0, 0], C.terre, 'Today (Dec 31, midnight)')],

  /* tam-grandes-questions-2.js */
  /* colonnes : x (est, m), y (nord, m), t (h) aux pointes ; depart en (amplitude, 0) */
  penduleFoucault: (P) => [seg([0, 0, 0], [0, 0, P.heures], C.repere, 'Rest position (bob hanging straight down; height = time)'),
    seg([-P.amplitude, 0, 0], [P.amplitude, 0, 0], C.zone, 'Starting swing plane (east-west)'),
    seg([0, 0, 0], [0, P.amplitude, 0], C.paroi, 'North')],
  /* colonnes : x, y, z (UA, ecliptique), t (an) ; Soleil en V t. V relue sur la sortie : au bout d une periode de Kepler la Terre
     est de nouveau au perihelie (rp, 0, 0) relatif au Soleil, donc Soleil(P) = Terre(P) - (rp, 0, 0) (interpolation lineaire) */
  mouvementTerre: (P, o) => {
    const n = o.n, b = o.brut, Tp = o.invariants.periode.formule, dt = P.annees / (n - 1), f = Tp / dt, i0 = Math.floor(f), w = f - i0;
    const lire = (c) => b[i0 * 4 + c] + w * (b[(i0 + 1) * 4 + c] - b[i0 * 4 + c]);
    const V = [(lire(0) - b[0]) / Tp, lire(1) / Tp, lire(2) / Tp], T = P.annees;
    return [pt([0, 0, 0, 0], C.soleil, 'Sun at the start'), seg([0, 0, 0, 0], [V[0] * T, V[1] * T, V[2] * T, T], C.soleil, "The Sun's own path (around the Milky Way)")];
  },
  /* colonnes : log10 T, log10 L, log10 R */
  etoilesHR: (P, o) => { const s = o.invariants.soleil; return [pt([Math.log10(s.T), Math.log10(s.L), Math.log10(s.R)], C.soleil, 'The Sun')]; },
  /* colonnes : x, y (km), amplitude (m), t (h) ; plateau de distance - plateau a distance, cote en x = distance */
  tsunami: (P, o, B) => [pt([0, 0, P.amplitude, 0], C.noyau, 'Earthquake source'),
    hyper(B, 0, P.distance - P.plateau, C.paroi, 'Start of the continental shelf'), hyper(B, 0, P.distance, C.terre, 'Coast')],
  /* vues du module : sphere p - (3, 0, 1), plan z = 0, hyperboloide (p1 + 3, p2, 1 - p0) de pole (1, 0, 0) ; 4e colonne = K */
  geometrieUnivers: () => [sph([-3, 0, -1, 1], 1, C.isco, 'Closed: sphere (K = +1)'), pln([0, 0, 0, 0], [0, 0, 1, 0], 1.5, C.zone, 'Flat: plane (K = 0)'),
    pt([3, 0, 0, -1], C.photons, 'Open: pole of the hyperbolic surface (K = -1)')],

  /* tam-champs-quantiques.js */
  /* colonnes : log10 Q (GeV), 1/alpha, image */
  couplageCourant: (P, o, B) => { const MZ = o.invariants.deltaAlphaLeptonsMZ.MZ; return [hyper(B, 0, Math.log10(MZ), C.zone, 'Z boson mass (' + Math.round(MZ * 100) / 100 + ' GeV)')]; },
  /* colonnes : x, t, energie du quantum, tau ; x^2 - t^2 = 1 : horizons de Rindler x = +-t (dessines a energie 0, tau 0) */
  effetUnruh: (P, o, B) => [seg([0, 0, 0, 0], [B.hi[0], B.hi[0], 0, 0], C.trouNoir, 'Future horizon (x = t): light from behind it never arrives'),
    seg([0, 0, 0, 0], [B.hi[0], -B.hi[0], 0, 0], C.trouNoir, 'Past horizon (x = -t)')],
  /* colonnes : direction de diffusion (x, y, cos theta), lambda / lambda' ; photon incident selon +z (lambda / lambda' = 1) */
  comptonKleinNishina: () => [pt([0, 0, 0, 1], C.noyau, 'Electron (at rest)'), seg([0, 0, -1, 1], [0, 0, 0, 1], C.photons, 'Incoming photon (moving along +z)')],
  /* colonnes : x, y, z (Bohr), n + l / 10 ; le noyau est au centre de chaque couche */
  atomes: (P, o, B) => [seg([0, 0, 0, B.lo[3]], [0, 0, 0, B.hi[3]], C.noyau, 'Nucleus (at the centre of every shell)')],
  /* colonnes : x (fm), y, z, energie de la corde (GeV) ; image k < K : corde de -rf/2 a rf/2, rf = 0.2 + (r_cassure - 0.2) k / (K - 1) */
  quarks: (P, o) => {
    const K = P.images, rb = o.invariants.cassure.rayonFm, l = [];
    for (let k = 0; k < K && k < o.film.images; k++) {
      const rf = 0.2 + (rb - 0.2) * k / Math.max(1, K - 1), E = o.brut[o.film.debuts[k] * 4 + 3];
      l.push(pt([-rf / 2, 0, 0, E], C.noyau, 'Charm quark', { image: k }), pt([rf / 2, 0, 0, E], C.champ, 'Charm antiquark', { image: k }));
    }
    return l;
  },
  /* ---------- game88 : tam-vide-quantique.js ---------- */
  /* colonnes : x, p, t, W ; le vide ORDINAIRE a la variance 1/2 -> son cercle a 1 sigma a le rayon sqrt(1/2) : la compression se lit contre lui */
  videComprime: (P, o, B) => [cer([0, 0, B.centre[2], B.lo[3]], Math.sqrt(0.5), [0, 0, 1, 0], C.repere, 'Ordinary vacuum (1-sigma circle, variance 1/2)')],
  /* colonnes : x, p, t, N ; au depart (t = 0, N = 0) le mode EST le vide ordinaire */
  casimirDynamique: () => [cer([0, 0, 0, 0], Math.sqrt(0.5), [0, 0, 1, 0], C.repere, 'Starting vacuum (1-sigma circle, variance 1/2)')],
  /* colonnes : Re phi, Im phi, V, t ; V = -mu^2 |phi|^2 + lambda |phi|^4 : minimum V = -mu^4 / (4 lambda) sur le cercle |phi| = v */
  higgsVide: (P, o, B) => {
    const v = P.mu / Math.sqrt(2 * P.lambda), Vmin = -P.mu * P.mu * P.mu * P.mu / (4 * P.lambda);
    return [cer([0, 0, Vmin, B.centre[3]], v, [0, 0, 1, 0], C.zone, 'Circle of vacua |phi| = v = mu / sqrt(2 lambda)'),
      pt([0, 0, 0, B.lo[3]], C.trouNoir, 'Symmetric top (phi = 0): unstable, not a vacuum')];
  },
  /* colonnes : desaccord du mode, t, population, P_e ; desaccord 0 = la frequence de l atome (la raie se centre la) */
  emissionSpontanee: (P, o, B) => [seg([0, B.lo[1], 0, 0], [0, B.hi[1], 0, 0], C.photons, 'Atom frequency (detuning 0): the line is centred here')],
  /* ---------- game93 : tam-theories-2.js ---------- */
  /* colonnes : theta x, theta y, beta x, beta y (rayons d Einstein) ; l anneau |theta| = 1 dans le plan image, la lentille a l origine */
  lentilleGravitationnelle: () => [cer([0, 0, 0, 0], 1, [0, 0, 1, 0], C.photons, 'Einstein ring |theta| = 1 (a source exactly behind would fill it)'),
    pt([0, 0, 0, 0], C.trouNoir, 'Lens (a point mass)')],
  /* colonnes : x (proies), y (predateurs), t ; a = b = d = 1 : equilibre (c, 1), le centre des boucles a tout instant */
  /* game107 : avec des proies a place limitee (s > 0) le point d equilibre descend a y = 1 - s c et la courbe s y enroule */
  lotkaVolterra: (P, o, B) => [P.saturation > 0
    ? seg([P.c, 1 - P.saturation * P.c, B.lo[2]], [P.c, 1 - P.saturation * P.c, B.hi[2]], C.zone, 'Balance point (x = c, y = 1 - s c): the spiral winds into it')
    : seg([P.c, 1, B.lo[2]], [P.c, 1, B.hi[2]], C.zone, 'Balance point (x = c, y = 1): the cycles turn round it')],
  /* colonnes : s, i, r, t ; di/dt = (R0 s - 1) i : les infectes culminent EXACTEMENT quand s = 1 / R0 (seuil d immunite collective) */
  /* game109 : avec l immunite qui s estompe, l equilibre endemique EXACT (lu dans le module) sur toute la duree */
  epidemieSIR: (P, o, B) => P.perteImmunite > 0
    ? [hyper(B, 0, 1 / P.R0, C.zone, 'Herd-immunity threshold s = 1 / R0: each wave peaks here'),
      (({ sFormule: s, formule: i, rFormule: r }) => seg([s, i, r, B.lo[3]], [s, i, r, B.hi[3]], C.repere, 'Endemic level (exact): the disease settles here and never leaves'))(o.invariants.equilibre)]
    : [hyper(B, 0, 1 / P.R0, C.zone, 'Herd-immunity threshold s = 1 / R0: the infected curve peaks here')],
  /* colonnes : x, S_N, erreur, N ; l onde carree vaut +1 sur (0, pi) */
  gibbsFourier: (P, o, B) => [seg([Math.max(0, B.lo[0]), 1, 0, B.lo[3]], [B.hi[0], 1, 0, B.lo[3]], C.repere, 'Square wave level +1 (the sums overshoot it next to the jump)')],
  /* ---------- game96 : tam-theories-3.js ---------- */
  /* colonnes : x, y, b, t (k = m = 1) ; le noyau fixe a l origine pour toutes les trajectoires */
  /* game107 (balayage a l ecran : « repels » restait ecrit avec les charges opposees de game106) */
  rutherford: (P, o, B) => [pt([0, 0, B.centre[2], B.centre[3]], C.noyau, P.attirant ? 'Nucleus (fixed, pulls the particles round it)' : 'Nucleus (fixed, repels the particles)')],
  /* colonnes : r, x_n, x_n+1 ; les deux premiers doublements MESURES par le module (formules r = 3 et 1 + sqrt 6) */
  logistique: (P, o, B) => [hyper(B, 0, o.invariants.doublement1.mesure, C.zone, 'First doubling (r = 3): one value becomes two'),
    hyper(B, 0, o.invariants.doublement2.mesure, C.zone, 'Second doubling (r = 1 + sqrt 6): two become four')],
  /* colonnes : x, t, u ; la barre est symetrique autour de x = 0 */
  chaleur: (P, o, B) => [hyper(B, 0, 0, C.repere, 'Middle of the bar (x = 0)')],
  /* colonnes : x, v, t ; le regime permanent tourne autour du repos (0, 0) */
  oscillateurForce: (P, o, B) => [seg([0, 0, B.lo[2]], [0, 0, B.hi[2]], C.repere, 'Rest position (x = 0, v = 0): the steady swing turns round it')],
  /* colonnes : x, y, t ; depart A (0, 0) a t = 0, arrivee B lue dans le module */
  brachistochrone: (P, o, B) => { const [bx, by] = o.invariants.extremites.B;
    return [pt([0, 0, 0], C.repere, 'Start A (all three beads released here)'), seg([bx, by, B.lo[2]], [bx, by, B.hi[2]], C.zone, 'End B (each bead arrives at its own time)')]; },
  /* colonnes : x, hauteur, indice ; moyenne exacte L (q - 1/2) — game107 (balayage a l ecran : « x = 0 » restait avec le penchant de
   *   game105 ; la formule est celle que le module compare, lue dans ses invariants) */
  galton: (P, o, B) => { const m = o.invariants.moyenne.formule;
    return [hyper(B, 0, m, C.repere, m === 0 ? 'Mean landing position (x = 0)' : 'Expected mean landing position (x = L (q - 1/2) = ' + Math.round(m * 1000) / 1000 + ')')]; },
  /* ---------- game111 : tam-biologie.js ---------- */
  /* colonnes : x, y, position, base, t ; l axe de l helice passe par (0, 0) */
  adnMutations: (P, o, B) => [seg([0, 0, B.lo[2], B.centre[3], B.centre[4]], [0, 0, B.hi[2], B.centre[3], B.centre[4]], C.repere, 'Axis of the double helix')],
  /* colonnes : t, ARN, proteine ; les moyennes EXACTES que le module compare (lues dans ses invariants) */
  dogmeCentral: (P, o, B) => { const a = o.invariants.arnMoyen.formule, p = o.invariants.proteineMoyenne.formule, r = (x) => Math.round(x * 100) / 100;
    return [hyper(B, 1, 1, C.repere, 'Exact mean (1 = k = ' + r(a) + ' mRNA, k kp / gp = ' + r(p) + ' proteins)')]; },
  /* colonnes : generation, part, numero ; la moyenne attendue reste p0 (lue dans les invariants) */
  deriveGenetique: (P, o, B) => { const p = o.invariants.frequenceMoyenne.formule;
    return [hyper(B, 1, p, C.repere, 'Starting share p0 = ' + Math.round(p * 1000) / 1000 + ' (the expected mean, forever)')]; },
  /* colonnes : S, P, C ; tout le substrat finit en produit : la droite S + P = S0 (C ~ 0) */
  /* game116 : colonnes t, part, courbe ; mi-parcours (S = S0/2), la ou la loi de vitesse est comparee */
  enzyme: (P, o, B) => [hyper(B, 1, 0.5, C.repere, 'Half the substrate used: the rate is checked here')],
  /* ---------- game127 ---------- */
  dureeJour: (P, o, B) => [pt([0, 12, B.centre[2]], C.repere, '12 hours (equinox)')],
  courseRoulante: (P, o, B) => [pt([0, 10, B.centre[2]], C.repere, 'Bottom of the slope')],
  /* ---------- game146 ---------- */
  kapitza: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Upright (the top)')],
  /* ---------- game145 ---------- */
  penduleRessort: (P, o, B) => [pt([0, -1, B.centre[2]], C.repere, 'Rest position (spring stretched by its weight)')],
  /* ---------- game144 ---------- */
  toupie: (P, o, B) => [pt([0, o.invariants.angleBas.formule, B.centre[2]], C.repere, 'Lowest tilt of the axis (exact)')],
  /* ---------- game143 ---------- */
  dzhanibekov: (P, o, B) => [pt([0, 1, 0], C.repere, 'Spin about the middle axis (unstable)')],
  /* ---------- game142 ---------- */
  perleCerceau: (P, o, B) => [pt([1, 0, B.centre[2]], C.repere, 'Critical spin (omega = sqrt(g / R))')],
  /* ---------- game141 ---------- */
  echelleGlisse: (P, o, B) => [pt([0, o.invariants.hauteurDecollage.formule * Math.cos(o.params.depart * PI / 180), o.invariants.tempsDecollage.formule], C.repere, 'Top leaves the wall (2/3 of the start)')],
  /* ---------- game140 ---------- */
  chainette: (P, o, B) => [pt([0, -o.invariants.flecheChaine.formule, B.centre[2]], C.repere, 'Lowest point of the chain')],
  /* ---------- game139 ---------- */
  tautochrone: (P, o, B) => [pt([PI, 0, B.centre[2]], C.repere, 'Every ball at the bottom (t = pi)')],
  /* ---------- game138 ---------- */
  pendulesCouples: (P, o, B) => [pt([o.invariants.tempsEchange.formule, 0, B.centre[2]], C.repere, 'Swing handed over (pi / (omega2 - omega1))')],
  /* ---------- game137 ---------- */
  anneauxNewton: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Where the lens touches the glass')],
  /* ---------- game136 ---------- */
  desintegration: (P, o, B) => [pt([o.params.demiVie, o.params.atomes / 2, B.centre[2]], C.repere, 'Half the atoms left (one half-life)')],
  /* ---------- game135 ---------- */
  refractionSnell: (P, o, B) => [pt([0, -1, B.centre[2]], C.repere, 'Light source under water'), pt([0, 0, B.centre[2]], C.repere, 'Surface')],
  /* ---------- game134 ---------- */
  reseauFentes: (P, o, B) => [pt([0, 1, B.centre[2]], C.repere, 'Central bright order (m = 0)')],
  /* ---------- game133 ---------- */
  corpsNoir: (P, o, B) => [pt([o.invariants.picFroid.mesure, o.invariants.picFroid.hauteurPic, B.centre[2]], C.repere, 'Wien peak of the coolest body')],
  /* ---------- game126 ---------- */
  penduleAmplitude: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Hanging at rest')],
  phasesLune: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Centre of the Moon\'s disc')],
  /* ---------- game125 ---------- */
  carnot: (P, o, B) => [pt([1, P.chaude, 0], C.repere, 'A: start of the hot expansion')],
  montyHall: (P, o, B) => [hyper(B, 1, (P.portes - 1) / (P.portes * (P.portes - 2)), C.zone, 'Switching wins (n - 1)/(n (n - 2))'), hyper(B, 1, 1 / P.portes, C.repere, 'Sticking wins 1/n')],
  lentilleMince: (P, o, B) => [seg([0, -1.2, B.centre[2]], [0, 1.2, B.centre[2]], C.repere, 'The lens (focal length 1)'), pt([-P.distance, 1, B.centre[2]], C.zone, 'The object point')],
  /* ---------- game124 ---------- */
  paraboleTir: (P, o, B) => [hyper(B, 1, 0, C.repere, 'The ground')],
  solidesPlatoniques: (P, o, B) => [pt([0, 0, 0], C.repere, 'Centre (every vertex at the same distance)')],
  /* ---------- game123 : tam-mecanique.js ---------- */
  billardPi: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Centre of the energy circle')],
  modesNormaux: (P, o, B) => [hyper(B, 1, 0, C.repere, 'Chain at rest')],
  /* ---------- game122 : tam-electricite.js, Pascal ---------- */
  lignesChamp: (P, o, B) => [pt([-1, 0, B.centre[2]], C.repere, 'Charge +1'), pt([1, 0, B.centre[2]], C.zone, 'Charge q2 = ' + P.charge)],
  circuitRC: (P, o, B) => [hyper(B, 1, 1, C.repere, 'Battery voltage (1)'), hyper(B, 0, 6, C.zone, 'Battery removed: discharge')],
  /* game300 */
  attentionCattell: (P, o, B) => [pt([0, 158 / 250, B.centre[2]], C.repere, 'C, electric light 1884: 26 ms slower when concentrating')],
  /* game301 */
  pressurePeirceJastrow: (P, o, B) => [pt([0.05, 0.4, B.centre[2]], C.repere, 'Ratio 1.005: 200 errors in 500, not 250')],
  /* game302 */
  extinctionPavlov: (P, o, B) => [pt([119 / 120, 0.1 / 0.7, B.centre[2]], C.repere, '16 minutes apart: still 0.1 c.c. after 2 hours')],
  /* game303 */
  weberKonig: (P, o, B) => [pt([(Math.log10(0.5) + 1) / 6.3, (Math.log10(0.793) + 2) / 2, B.centre[2]], C.repere, 'Brodhun, faintest light: a 79 percent change needed')],
  /* game304 */
  glycosuriaCannon: (P, o, B) => [pt([0.4, 12 / 25, B.centre[2]], C.repere, 'Football 1913: 12 of 25, five never played')],
  /* game305 */
  brainBoyd: (P, o, B) => [pt([10 / 17, 48.54 / 50, B.centre[2]], C.repere, 'Men, 14 to 20 years: 48.54 oz., the heaviest')],
  /* game306 */
  allOrNoneLucas: (P, o, B) => [pt([(25.9 - 25.4) / 6.4, 3.08 / 4.1, B.centre[2]], C.repere, 'Observation 6: between two steps')],
  /* game307 */
  neuronsHerculanoHouzel: (P, o, B) => [pt([Math.log10(6376.16) / 4, Math.log10(87.346) / 2, B.centre[2]], C.repere, 'Macaque: 6.4 billion neurons in 87 g')],
  /* game308 */
  connectomeSizes: (P, o, B) => [pt([Math.log10(86.1e9) / 11, 0, B.centre[2]], C.repere, 'Human: 86.1 billion neurons, no map')],
  /* game309 */
  emotionsSiegel: (P, o, B) => [pt([1, (4 * 6 + 3) / 42, B.centre[2]], C.repere, 'Breathing rate: d = 1.47 in anger, 0.91 in fear')],
  /* game310 */
  bodyMapsNummenmaa: (P, o, B) => [pt([(1 + 0.5) / 7, (1 * 87 + 43.5) / (7 * 87), B.centre[2]], C.repere, 'Fear: named right 8 % of the time, under chance')],
  /* game311 */
  emotionWiringHCP: (P, o, B) => { const I = (o.invariants || {}).emotionWiringHCP || {}, out = [];
    (I.seedPlacesWiring || '').split('|').filter(Boolean).forEach((s) => { const [nm, ...c] = s.split('@'), p = c.map(Number); if (nm !== 'Left amygdala' && p.length === 3 && p.every(Number.isFinite)) out.push(pt(p, C.repere, nm)); });
    const a = (I.amygdalaPlaceWiring || '').split(' ').map(Number);
    if (a.length === 3 && a.every(Number.isFinite)) out.push(pt(a, C.repere, 'Left amygdala: ' + (I.amygdalaWiring || '')));
    return out; },
  /* nerveHelmholtz (2026-11-14): one printed speed per slider position, where the drawing puts it (x = series / 8, y = m/s / 50) */
  nerveHelmholtz: (P, o, B) => { const k = Math.max(0, Math.min(3, Math.round(Number(P.seriesHelmholtz)) || 0));
    return [k === 2 ? pt([6 / 8, 25.1 / 50, B.centre[2]], C.repere, 'Series XIII: 25.1 m/s printed, a fresh frog at 20 degrees C')
      : k === 3 ? pt([1, 27.25 / 50, B.centre[2]], C.repere, '1852 curve record: 27.25 m/s printed')
      : pt([0, 24.6 / 50, B.centre[2]], C.repere, 'Series IX: 24.6 m/s printed, the smallest probable error (2.0)')]; },
  /* riskBernoulli (2026-11-14): one printed number per problem, where the drawing puts it */
  riskBernoulli: (P, o, B) => { const k = Math.max(0, Math.min(3, Math.round(Number(P.problemBernoulli)) || 0));
    return [k === 0 ? pt([0, 2 / 12, B.centre[2]], C.repere, 'No fortune: printed exactly 2 ducats')
      : k === 1 ? pt([(800 - 500) / 500, Math.log10(5043) / 6, B.centre[2]], C.repere, 'Premium 800: Caius printed 5043 roubles')
      : k === 2 ? pt([0, (6751 - 6500) / 1000, B.centre[2]], C.repere, 'One ship: printed 6751 ducats')
      : pt([0.5, 13 / 100, B.centre[2]], C.repere, 'Stake 50 of 100: loss printed as more than 13')]; },
  /* game299 */
  reactionDonders: (P, o, B) => [pt([1, 74.08 * 1000 / 261 / 320, B.centre[2]], C.repere, 'Method b: about 284 ms, the slowest')],
  /* game297 */
  essaisThorndike: (P, o, B) => [pt([0, Math.log(160) / Math.log(200), B.centre[2]], C.repere, 'First trial: 160 seconds to find the way out')],
  /* game292 */
  penduleKater: (P, o, B) => [pt([(Math.pow(Math.sin((60 + 45 / 60) * Math.PI / 180), 2) - 0.55) / 0.25, (39.17146 - 39.12) / 0.06, B.centre[2]], C.repere, 'Unst, Shetland: the longest pendulum, 39.17146 inches')],
  /* game290 */
  jaugesHerschel: (P, o, B) => [pt([Math.log10(589) / 6.5, Math.log10(497) / 4, B.centre[2]], C.repere, '588 stars: about 497 times the distance of Sirius')],
  /* game289 */
  constantesPlanck: (P, o, B) => [pt([0.85, 0.5, B.centre[2]], C.repere, 'h = 6.55e-27 erg s')],
  /* game288 */
  reststrahlenRubens: (P, o, B) => [pt([1773 / 1800, 196.8 / 210, B.centre[2]], C.repere, '1500 C: 196.8 measured, Wien 147.5')],
  /* game287 */
  etherMichelson: (P, o, B) => [pt([0, 0.2, B.centre[2]], C.repere, 'Expected half-swing: 0.2 wave-length')],
  /* game286 */
  emanationRutherford: (P, o, B) => [pt([62 / 360, 0.51, B.centre[2]], C.repere, '62 s: 0.51 of the start')],
  /* game285 */
  maisDarwin: (P, o, B) => [pt([2 / 16, 12 / 24, B.centre[2]], C.repere, 'Pot I: crossed 12 in, self 20 3/8 in')],
  /* game284 */
  magnitudesPogson: (P, o, B) => [pt([15 / 16, (1.1584 + 1) / 3, B.centre[2]], C.repere, '15th magnitude: 14.4 inches')],
  /* game283 */
  rayonsThomson: (P, o, B) => [pt([1.3e10 / 1.3e10, 0.39, B.centre[2]], C.repere, 'Carbonic acid, tube 1: 0.39e-7 at 1.3e10 cm/s')],
  /* game282 */
  poisMendel: (P, o, B) => [pt([1 / 8, 1850 / 7324, B.centre[2]], C.repere, 'Wrinkled seeds: 1850 of 7324')],
  /* game281 */
  spiraleMoseley: (P, o, B) => [pt([0.5 / 8, 1.31 / 1.4, B.centre[2]], C.repere, 'Widest whorl of Turbo duplicatus: 1.31 inch')],
  /* game280 */
  tubesHagen: (P, o, B) => [pt([0.3288 / 0.85, 14.887 / 15, B.centre[2]], C.repere, 'Narrow tube: 14.887 inches for 0.3288 Loth a second')],
  /* game279 */
  syllabesKaeding: (P, o, B) => [pt([5 / 15, 12.143 / 16, B.centre[2]], C.repere, '5 syllables: 187 738 words')],
  /* game278 */
  fonteMacKellar: (P, o, B) => [pt([0.5 / 26, (12000 / 106900) / 0.12, B.centre[2]], C.repere, 'e: 12000 of 106900')],
  /* game277 */
  tempsOldham: (P, o, B) => [pt([150 / 180, 45 / 50, B.centre[2]], C.repere, '150 degrees: second phase 45 min, 32 expected')],
  /* game276 */
  spiralesBeal: (P, o, B) => [pt([4 / 14, 7 / 14, B.centre[2]], C.repere, '4 and 7: excluded by Airy, found on 41 cones')],
  /* game275 */
  variationsHalley: (P, o, B) => [pt([10 / 120, 11.25 / 12, B.centre[2]], C.repere, 'London 1580: 11 15 East')],
  /* game274 */
  tubesPoiseuille: (P, o, B) => [pt([1, 15.761 / 16, B.centre[2]], C.repere, 'Widest tube, 0.65 mm: 7 million cubic mm in 500 s')],
  /* game273 */
  unitesWeber: (P, o, B) => [pt([0.1, 155370e6 / 1.7e11, B.centre[2]], C.repere, 'Mean of the five: 155370 million')],
  /* game272 */
  aimantGauss: (P, o, B) => [pt([4 / 4.2, 275.9 / 8100, B.centre[2]], C.repere, 'At 4 m the needle turns 4 min 35.9 s of arc')],
  /* game271 */
  deplacementsPerrin: (P, o, B) => [pt([0.85 / 17, 38 / 50, B.centre[2]], C.repere, 'Jumps under 1.7 micron: 38 found, 48 calculated')],
  /* game270 */
  filtreDarcy: (P, o, B) => [pt([2.98 / 14, 4.15 / 20, B.centre[2]], C.repere, '12.86 m above, 9.88 m below: 4.15 l/min')],
  /* game269 */
  critiqueReynolds: (P, o, B) => [pt([(-2.10217 + 2.2) / 0.7, 2.289 / 3, B.centre[2]], C.repere, 'Narrowest pipe: about 2.3 m/s')],
  /* game268 */
  effetJoule: (P, o, B) => [pt([2.73 / 3, 25 / 30, B.centre[2]], C.repere, '2.73 Q: 25 degrees in half an hour')],
  /* game267 */
  balanceCoulomb: (P, o, B) => [pt([18 / 40, 144 / 650, B.centre[2]], C.repere, '18 degrees: 144, four times 36')],
  /* game266 */
  picLummer: (P, o, B) => [pt([1646 / 1700, 2928 / 3000, B.centre[2]], C.repere, '1646 K: lambda_m T = 2928')],
  /* game265 */
  ondulationsYoung: (P, o, B) => [pt([6 / 14, 561 / 800, B.centre[2]], C.repere, '561 million million: 2^49, not 2^48')],
  /* game264 */
  vitesseNyquist: (P, o, B) => [pt([16 / P.niveauxNyquist, 400 / (50 * P.niveauxNyquist), B.centre[2]], C.repere, '16 levels: 400, not 800')],
  /* game263 */
  parallaxeBessel: (P, o, B) => [pt([0.6889 / 1.5, 0.3136 / 0.4, B.centre[2]], C.repere, 'Weight 0.6889: 0.3136 arcsecond')],
  /* game262 */
  motsMendenhall: (P, o, B) => [pt([3 / 15, 248 / 260, B.centre[2]], C.repere, 'Three letters: about a quarter of all words')],
  /* game261 */
  chaleurLondres: (P, o, B) => [pt([(1813 - 1789) / 29, (49.762 - 46) / 8, B.centre[2]], C.repere, '1813: the country warmer than London')],
  /* game260 */
  survieHalley: (P, o, B) => [pt([0.42, 427 / 1000, B.centre[2]], C.repere, 'Age 42: 427 of 1000')],
  /* game259 */
  repliquesOmori: (P, o, B) => [pt([0, 171 / 200, B.centre[2]], C.repere, 'First half day: 171 shocks')],
  /* game258 */
  chaleursPetitDulong: (P, o, B) => [pt([11.16 / 14, 0.0314 / 0.2, B.centre[2]], C.repere, 'Platinum: 0.0314 x 11.16 = 0.3504, printed 0.3740')],
  /* game257 */
  equivalentsFaraday: (P, o, B) => [pt([57.9 / 130, 57.9 / 130, B.centre[2]], C.repere, 'Tin, paragraph 791: 57.9')],
  /* game256 */
  mortaliteNightingale: (P, o, B) => [pt([0.5, 1, B.centre[2]], C.repere, P.anneeNightingale === 1 ? 'Winter 1854-55: up to 1022.8 per 1,000 a year' : 'Winter 1855-56: up to 56.4 per 1,000 a year')],
  /* game255 */
  exclusionGause: (P, o, B) => [pt([1, 0, B.centre[2]], C.repere, 'Day 16: no P. caudatum left')],
  /* game253 */
  aberrationBradley: (P, o, B) => [pt([0, 40.4 / 60, B.centre[2]], C.repere, 'Maximum about 40.4"')],
  /* game252 */
  regressionGalton: (P, o, B) => [pt([(68.25 - 63) / 11, (68.25 - 63) / 11, B.centre[2]], C.repere, 'Mediocrity: 68 1/4 in')],
  /* game251 */
  lumiereMichelson: (P, o, B) => [pt([0, (299792.458 - 299600) / 500, B.centre[2]], C.repere, 'Exact c: 299792.458')],
  /* game250 */
  loiMoseley: (P, o, B) => [pt([43 / 50, 42 / 50, B.centre[2]], C.repere, 'Empty place: 43')],
  /* game249 */
  loiHubble1929: (P, o, B) => [pt([1, 1000 / 1100, B.centre[2]], C.repere, 'Virgo cluster, 2 Mpc')],
  /* game248 */
  vieGraunt: (P, o, B) => [pt([16 / 80, 0.4, B.centre[2]], C.repere, 'Age 16: 40 left')],
  /* game247 */
  gouttesMillikan: (P, o, B) => [pt([0.4, (61.12 - 61.14) * 4, B.centre[2]], C.repere, 'Mean of 23: 61.120')],
  /* game246 */
  lynxHudson: (P, o, B) => [pt([38 / 61, 4.896 / 5, B.centre[2]], C.repere, '1886: 78773 skins')],
  /* game245 */
  eclipseEddington: (P, o, B) => [pt([0.88, 0.88, B.centre[2]], C.repere, 'Einstein line')],
  /* game244 */
  equivalentJoule: (P, o, B) => [pt([0, 0.1385, B.centre[2]], C.repere, '772.692 kept')],
  /* game243 */
  densiteCavendish: (P, o, B) => [pt([0.5, (5.48 - 4.8) / 1.1, B.centre[2]], C.repere, '5.48 times water')],
  /* game242 */
  fievreSemmelweis: (P, o, B) => [pt([(1847.37 - 1841) / 7, 1, B.centre[2]], C.repere, 'Chlorine, May 1847')],
  /* game241 */
  oubliEbbinghaus: (P, o, B) => [pt([3.16 / 4.7, 33.7 / 60, B.centre[2]], C.repere, 'One day later')],
  /* game240 */
  carteSturtevant: (P, o, B) => [pt([1, 50 / 60, B.centre[2]], C.repere, 'Ceiling: 50 percent')],
  /* game239 */
  argonRayleigh: (P, o, B) => [pt([0.5, 0, B.centre[2]], C.repere, 'Lab | air')],
  /* game238 */
  diffusionAlpha: (P, o, B) => [pt([1, 0, B.centre[2]], C.repere, 'Straight back: 180 degrees')],
  /* game237 */
  michaelisMenten: (P, o, B) => [pt([0, 0.5, B.centre[2]], C.repere, 'Half the maximum rate')],
  /* game236 */
  especesAire: (P, o, B) => [pt([0, 34.7 / 82, B.centre[2]], C.repere, 'One square mile: about 35 species')],
  /* game235 */
  loiOhm: (P, o, B) => [pt([2 / 130, 326.75 / 330, B.centre[2]], C.repere, 'Shortest wire, 2 Zoll')],
  /* game234 */
  loiBoyle: (P, o, B) => [pt([1, 29.125 / 117.5625, B.centre[2]], C.repere, 'Open air: 29 1/8 inches')],
  /* game233 */
  raiesBalmer: (P, o, B) => [pt([0, 1, B.centre[2]], C.repere, 'Series limit')],
  /* game232 */
  choleraSnow: (P, o, B) => [pt([0.5, 0.5, B.centre[2]], C.repere, 'Same streets, two waters')],
  /* game231 */
  demiViesNPL: (P, o, B) => [pt([0, 0.5, B.centre[2]], C.repere, 'Half left')],
  /* game230 */
  effetPhotoelectrique: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Zero voltage')],
  /* game229 */
  loiKleiber: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Ring dove')],
  /* game228 */
  hodgkinHuxley: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Rest')],
  /* game227 */
  electronegativite: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Lithium')],
  /* game226 */
  populationMonde: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, '1950')],
  /* game225 */
  courbeKeeling: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Start of the window')],
  /* game224 */
  energieLiaison: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Deuterium')],
  /* game223 */
  mareeVivesEaux: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Mean water level')],
  /* game222 */
  arrhenius: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Start')],
  /* game221 */
  gutenbergRichter: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Magnitude 4.5')],
  /* game220 */
  loiZipf: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'the')],
  /* game219 */
  atmosphereStandard: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Sea level')],
  /* game218 */
  entropieShannon: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Letter E')],
  /* game217 */
  gammeTemperee: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Unison')],
  /* game216 */
  pileDaniell: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Fresh battery')],
  /* game215 */
  geometrieVSEPR: (P, o, B) => [pt([0, 0, 0], C.repere, 'Central atom')],
  /* game214 */
  titrageAcideFaible: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'No base yet')],
  /* game213 */
  codeGenetique: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'First codon')],
  /* game212 */
  fourmiLangton: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Start')],
  /* game211 */
  suitePadovan: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'n = 5')],
  /* game210 */
  thueMorse: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Start')],
  /* game209 */
  suitePerrin: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Remainder 0')],
  /* game208 */
  suiteKolakoski: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'First term')],
  /* game207 */
  suiteRecaman: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'a(0) = 0')],
  /* game206 */
  triangleNarayana: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Row 1')],
  /* game205 */
  schroderChemins: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Ground level')],
  /* game204 */
  frobeniusPieces: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Coins 2 and 3')],
  /* game203 */
  goldbachPaires: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'E = 4')],
  /* game202 */
  indicatriceEuler: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'n = 1')],
  /* game201 */
  periodePisano: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'm = 1')],
  /* game200 */
  motzkinChemins: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Ground level')],
  /* game199 */
  stirlingBell: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'First element')],
  /* game198 */
  routineKaprekar: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Start 0')],
  /* game197 */
  suiteCollatz: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Start 1')],
  /* game196 */
  nombresHarmoniques: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'H(1)')],
  /* game195 */
  derangements: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Object 0')],
  /* game194 */
  regarderDire: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'First term')],
  /* game193 */
  toursHanoi: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Start')],
  /* game192 */
  calkinWilf: (P, o, B) => [pt([0.5, 0, B.centre[2]], C.repere, 'Root 1/1')],
  /* game191 */
  theoremeLucas: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Top of the triangle')],
  /* game190 */
  zeckendorf: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Fibonacci 1, number 1')],
  /* game189 */
  problemeJosephus: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Centre of the circle')],
  /* game188 */
  nombresBernoulli: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Origin')],
  /* game187 */
  parfaitsAmicaux: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Origin')],
  /* game186 */
  fonctionMertens: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Origin')],
  /* game185 */
  theoremeWilson: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Origin')],
  /* game184 */
  nombresCarmichael: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Origin')],
  /* game183 */
  equationPell: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Origin')],
  /* game182 */
  sommesCarres: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Origin')],
  /* game181 */
  ptolemee: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Centre of the circle')],
  /* game180 */
  pascalHexagramme: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Centre of the circle')],
  /* game179 */
  ramseyR33: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Centre')],
  /* game178 */
  triangulations: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Centre of the polygon')],
  /* game177 */
  distinctesImpaires: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'First cell')],
  /* game176 */
  simsonDroite: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Grid corner')],
  /* game175 */
  bale: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Origin')],
  /* game174 */
  morley: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Centre of the circumscribed circle')],
  /* game172 */
  eulerSolides: (P, o, B) => [pt(B.centre, C.repere, 'Centre of the solid')],
  /* game171 */
  marcheAutoEvitante: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Start of the walk')],
  /* game170 */
  jeuDeLaVie: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'First cell of the pattern')],
  /* game169 */
  feuerbach: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Corner A')],
  /* game168 */
  billardElliptique: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Centre of the table')],
  /* game167 */
  napoleon: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Grid corner')],
  /* game166 */
  percolationLiens: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Bottom left corner')],
  /* game165 */
  theoremePick: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Centre of the sectors')],
  /* game164 */
  courbeDragon: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Start of the strip')],
  /* game163 */
  partitionEuler: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Corner of the diagram')],
  /* game162 */
  catalanDyck: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Start on the ground')],
  /* game161 */
  ruineJoueur: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Ruin: fortune 0')],
  /* game160 */
  collectionneur: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Start: no coupon yet')],
  /* game159 */
  aztecDiamond: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Centre of the diamond')],
  /* game158 */
  ising: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Corner of the grid')],
  /* game157 */
  dominosKasteleyn: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Corner cell (0, 0)')],
  /* game155 */
  papillonHofstadter: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Zero flux, zero energy')],
  /* game154 */
  causticTasse: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Centre of the cup')],
  /* game153 */
  fermatSteiner: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Town (0, 0)')],
  /* game152 */
  cerclesFord: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'The fraction 0/1')],
  /* game151 */
  vergerEuclide: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'You stand here (0, 0)')],
  /* game150 */
  tasDeSable: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Corner cell (0, 0)')],
  /* game149 */
  haloGlace: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'The Sun')],
  /* game148 */
  apollonius: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Centre of the big circle (curvature -1)')],
  pascalSierpinski: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'Row 0: the 1 at the top')],
  /* ---------- game120 : tam-ondes.js ---------- */
  arcEnCiel: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, 'The drop (radius 1)')],
  cordeVibrante: (P, o, B) => [hyper(B, 1, 0, C.repere, 'The string at rest (u = 0)')],
  effetDoppler: (P, o, B) => [pt([P.mach * 16, 0, B.centre[2]], C.zone, P.mach > 1 ? 'The source, ahead of its own waves' : 'The source (moving right)')],
  /* game118 : la boite du gaz (cote 10) ; la frontiere entre parents et enfants */
  gazParfait: (P, o, B) => [hyper(B, 0, 10, C.repere, 'The right wall (its hits make the pressure)')],
  hardyWeinberg: (P, o, B) => [hyper(B, 1, 0.5, C.repere, 'Parents below, children above')],
  /* ---------- game115 : tam-maths.js ---------- */
  marcheAleatoire: (P, o, B) => [pt([0, 0, B.lo[2]], C.repere, 'Start (every walker begins here)')],
  aiguilleBuffon: (P, o, B) => [hyper(B, 1, 5, C.repere, 'A floor line (y = 5; one every unit)')],
  anniversaires: (P, o, B) => [pt([1, 0, B.centre[2]], C.repere, 'Day 0 of the year (the circle turns once per year)')],
  spiraleUlam: (P, o, B) => [pt([0, 0, B.centre[2]], C.repere, '1, the centre of the spiral')],
  /* game114 : colonnes copies de A, copies de B, numero ; la case des parents (AaBb) */
  mendel: (P, o, B) => [pt([1, 1, B.centre[2]], C.repere, 'AaBb, like both parents (a quarter of the offspring)')],
  /* colonnes t, v, I ; le seuil v = 1 */
  neurone: (P, o, B) => [hyper(B, 1, 1, C.zone, 'Firing threshold v = 1')],
  /* ---------- game113 : tam-chimie.js ---------- */
  /* colonnes : t, a, b, c ; le pic EXACT de B (lu dans les invariants) */
  /* game116 : colonnes t, part, espece ; le pic EXACT pose SUR la courbe de B (espece 1) */
  reactionsChaine: (P, o, B) => { const t = o.invariants.picB.tPic, b = o.invariants.picB.formule;
    return [pt([t, b, 1], C.zone, 'Exact peak of B (t* = ' + Math.round(t * 100) / 100 + ')')]; },
  /* colonnes : x, y, t ; les deux puits */
  equilibreChimique: (P, o, B) => [pt([-1.5, 0, B.centre[2]], C.repere, 'Well A'), pt([1.5, 0, B.centre[2]], C.repere, 'Well B')],
  /* colonnes : x, y, t ; le point fixe EXACT (A, B/A) tout au long du temps */
  brusselator: (P, o, B) => { const s = o.invariants.seuil;
    return [seg([o.invariants.pointFixe.xFixe, o.invariants.pointFixe.yFixe, B.lo[2]], [o.invariants.pointFixe.xFixe, o.invariants.pointFixe.yFixe, B.hi[2]], C.repere, s.oscille ? 'Balance point (A, B/A): the clock circles round it' : 'Balance point (A, B/A): the reaction settles here')]; },
};

/** les systemes sans decor, et pourquoi (le module n expose pas d objet de contexte vrai dans ses coordonnees) */
export const SANS_DECOR = Object.freeze({
  ising2D: 'axes are the lattice and the spins: the grid IS the data, no other object exists in the model',
  kuramoto: 'the oscillators already sit on the unit circle (cos, sin): the circle is the data',
  mandelbrot: 'axes are the complex plane of c and log escape time; the escape circle |c| = 2 lies far outside zoomed views',
  mandelbulb: 'the cloud IS the surface; no other object exists in the model',
  paquetOscillateur: 'axes are <x>, <p>, width (a phase-space plot), not a place',
  rotorPulse: 'axes are kick number, quantum momentum, classical momentum, angle: a statistics plot, not a place',
  evaporationTrouNoir: 'axes are t / lifetime, M / M0, log T, log t: curves, not a place',
  tailleEtoiles: 'the cloud IS the set of star spheres; any added sphere would duplicate the data',
  champLibre: 'axes are lattice site, time, field value: a space-time plot with no fixed object',
  fluctuationsVide: 'axes are lattice site, sample, field value: no fixed object',
  interactionChamps: 'axes are position, time, two field values: no fixed object',
  paireSchwinger: 'the field is uniform everywhere and the birth box (L4) is only exposed as a volume; no object to place',
});

/**
 * Les objets de contexte d un systeme, dans les coordonnees BRUTES du module (espace 'brut') ou par corps (espace 'corps3').
 * @param {string} id   l id du systeme (tam-science.js#SYSTEMES)
 * @param {object} params  les params (ramenes par le module si o est absent)
 * @param {object} [o]  la sortie de simuler (recalculee si absente)
 * @returns {Array} objets (vide si le systeme n a pas de decor, ou si la simulation a quitte son domaine)
 */
export function decorDe(id, params = {}, o = null) {
  const f = DECORS[id]; if (!f) return [];
  if (!o) { const s = systeme(id); if (!s) return []; o = s.mod.simuler(id, params || {}); }
  if (!o || !o.bornee || !o.brut) return [];
  const P = o.params || params, B = boiteDonnees(id, o), espace = CORPS[id] ? 'corps3' : 'brut';
  return f(P, o, B).map((q) => ({ ...q, espace }));
}
export const AVEC_DECOR = Object.freeze(Object.keys(DECORS));
