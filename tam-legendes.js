/* tam-legendes.js — game80 (Phil : « il faut comprendre ce qu on voit, pas juste des graphes et des courbes ») :
 *   pour CHAQUE systeme de tam-science.js SYSTEMES, la legende exacte de ce qui est dessine, en anglais simple.
 *   Chaque colonne a ete relue dans le code de simuler du module (l ecriture de brut) puis confirmee en lancant simuler
 *   aux params par defaut (formes et plages) — voir test-tam-legendes-20261101.mjs. Rien n est devine : une colonne
 *   dont le sens n est pas ecrit dans le module le dit (« not documented in the module »).
 *   Pur : aucun DOM, aucun reseau. Les chaines visibles sont en ASCII (pas de lettre grecque, pas de tiret long).
 *   La vue : la plupart des systemes dessinent brut standardise puis projete N-D -> 3-D ; les systemes de CORPS
 *   (tam-science.js#CORPS) dessinent chaque corps dans le meme espace, une couleur par corps ; un nuage = des tirages ;
 *   un FILM (o.film du module) se dessine image par image, une couleur par moment — sa disposition ici = celle du module. */
import { SYSTEMES, CORPS } from './tam-science.js';
import * as HB from './human-brain-data.js';
import { pointPalette } from './human-brain-parts.js';

const N_DEFAUT = 1500;
/* la couleur hors corps (tam-onglet.js#dimDominante) : la colonne la plus loin de sa moyenne en ce point */
const court = (c) => String(c).split(' (')[0].split(':')[0];
function couleursDominantes(colonnes) {
  return 'Colour = the column that is farthest from its own average at that point (after scaling): '
    + colonnes.map((c, j) => 'colour ' + (j + 1) + ' = ' + court(c)).join(', ') + '.';
}
function couleursCorps(noms, centre) {
  return 'One colour per body, in this order: ' + noms.map((b, j) => 'colour ' + (j + 1) + ' = ' + b).join(', ') + '.'
    + (centre ? ' The marker at the centre is the ' + centre + '.' : '');
}
/* bornage local (meme regle que les modules : non fini -> defaut, ramene dans les bornes, entier arrondi) */
function lire(id, params, cle, entier) {
  const s = SYSTEMES.find((x) => x.id === id); if (!s) return undefined;
  let v = Number(params && params[cle]); if (!Number.isFinite(v)) v = s.params[cle];
  const b = s.bornes[cle]; if (b) v = Math.min(b[1], Math.max(b[0], v));
  return entier ? Math.round(v) : v;
}
/* game80 : les grandes questions dont les NOMS vivent dans le module (table d etoiles, evenements) : relus dans sa sortie, jamais recopies */
function lusDansLeModule(id, params) { const s = SYSTEMES.find((x) => x.id === id); return s.mod.simuler(id, params, { n: 40 }).invariants; }
/* game81 : les champs quantiques declarent leur film (o.film) et leur configuration ; on les relit dans la sortie du module
 *   (n lignes), jamais recalcules ici. Petit cache : la page redemande la legende a chaque dessin. */
const CACHE_MODULE = new Map();
function sortieDuModule(id, params, n) {
  const cle = id + '|' + n + '|' + JSON.stringify(params || {});
  if (!CACHE_MODULE.has(cle)) { if (CACHE_MODULE.size > 64) CACHE_MODULE.clear(); const s = SYSTEMES.find((x) => x.id === id); CACHE_MODULE.set(cle, s.mod.simuler(id, params, { n })); }
  return CACHE_MODULE.get(cle);
}
/* les films de tam-champs-quantiques.js : la disposition = o.film du module ; colonneTemps et le sens d une image dits ici */
const FILMS_DU_MODULE = {
  champLibre: { colonneTemps: 1 },
  fluctuationsVide: { colonneTemps: null, note: 'each moment is an independent random sample of the vacuum, not a later time' },
  interactionChamps: { colonneTemps: 1 },
  paireSchwinger: { colonneTemps: null, note: 'each frame is the whole worldline of one particle (an electron, then its positron, pair after pair), not one instant' },
  couplageCourant: { colonneTemps: null, note: 'frame 1 is the electromagnetic curve, frame 2 the strong-force curve; they are not instants of time' },
  atomes: { colonneTemps: null, note: 'each frame is the cloud of one electron, in filling order' },
  quarks: { colonneTemps: null, note: 'the string is stretched from frame to frame; the last frame is after it has broken' },
  /* game88 : tam-vide-quantique.js — chaque image = l etat des modes a un instant */
  emissionSpontanee: { colonneTemps: 1 },
  /* game93 : tam-theories-2.js */
  kuramoto: { colonneTemps: 3 },
  gibbsFourier: { colonneTemps: null, note: 'each frame adds more sine terms (N grows); frames are not instants of time' },
  /* game96 : tam-theories-3.js */
  rutherford: { colonneTemps: 3, note: 'each frame is one trajectory (one impact parameter), not an instant' },
  chaleur: { colonneTemps: 1 },
  brachistochrone: { colonneTemps: 2, note: 'frame 1 is the cycloid, 2 the straight line, 3 the circular arc; the same start and end' },
  /* game111 : tam-biologie.js — chaque image = la meme sequence a un instant plus tard */
  adnMutations: { colonneTemps: 4 },
  /* game112 */
  deriveGenetique: { colonneTemps: 0, note: 'each frame is one population, followed over all its generations' },
  /* game113 : chaque image = les memes molecules a un instant plus tard */
  equilibreChimique: { colonneTemps: 2 },
  /* game114 */
  /* game120 */
  cordeVibrante: { colonneTemps: 2 },
  /* game123 */
  modesNormaux: { colonneTemps: 2 },
  /* game126 */
  penduleAmplitude: { colonneTemps: 2, note: 'each frame is one release angle, from theta0/6 to theta0' },
  phasesLune: { colonneTemps: null, note: 'each frame is one phase, from full Moon (0) to the phase chosen' },
  /* game118 */
  gazParfait: { colonneTemps: null, note: 'each frame is the same gas a little later (positions are exact, folded off the walls)' },
  /* game115 */
  marcheAleatoire: { colonneTemps: 2, note: 'each frame is one walker, followed step by step' },
  neurone: { colonneTemps: 0, note: 'each frame is one input current, from 0.4 to 1.6 times the one chosen; frames are not instants' },
};
const COUPLAGES = ['Electromagnetic coupling (1/alpha)', 'Strong coupling (1/alpha_s)'];
/* atomes : les sous-couches remplies, lues dans la configuration que le module rend (ex. « 1s2 2s2 2p6 ... ») */
function sousCouches(params) {
  return sortieDuModule('atomes', params, N_DEFAUT).invariants.configuration.split(' ').map((t) => 'Subshell ' + t.slice(0, 2) + ' (' + t.slice(2) + ' electron' + (t.slice(2) === '1' ? '' : 's') + ')');
}
const SURFACES = ['Sphere (closed universe, curvature +1)', 'Flat plane (curvature 0)', 'Hyperbolic surface (open universe, curvature -1)'];
const TRAPPIST = ['b', 'c', 'd', 'e', 'f', 'g', 'h'];
const PLANETES = ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
const CENTRES = { systemeSolaire: 'Sun', cometeHalley: 'Sun', trappist1: 'star TRAPPIST-1', amasEtoiles: 'centre of mass, near where the black hole starts (the black hole itself also moves and is not drawn)', lumiereTrouNoir: 'black hole', trouDeVer: 'wormhole throat' };

/** le nom de chaque corps, dans l ordre des colonnes ; null hors systeme de corps */
export function nomsDe(id, params = {}) {
  switch (id) {
    case 'systemeSolaire': return lire(id, params, 'groupe', true) === 1 ? PLANETES.slice(4, 8) : PLANETES.slice(0, 4);
    case 'trappist1': { const p = lire(id, params, 'premiere', true); return TRAPPIST.slice(p, p + 4).map((x) => 'TRAPPIST-1 ' + x); }
    case 'tourbillonsPonctuels': { const k = lire(id, params, 'nombre', true); return Array.from({ length: k }, (_, i) => 'Vortex ' + (i + 1)); }
    case 'troisCorps': return ['Star 1', 'Star 2', 'Star 3'];
    case 'amasEtoiles': return ['Star 1', 'Star 2', 'Star 3', 'Star 4'];
    case 'lumiereTrouNoir': return ['Light ray 1', 'Light ray 2', 'Light ray 3', 'Light ray 4'];
    case 'expansionUnivers': return ['Galaxy 1', 'Galaxy 2', 'Galaxy 3', 'Galaxy 4'];
    case 'cometeHalley': return ['Halley', 'Earth'];
    case 'trouDeVer': return ['Light ray 1', 'Light ray 2'];
    case 'pulsarHulseTaylor': return ['Pulsar', 'Companion star'];
    /* game80 : les grandes questions qui dessinent des objets nommes (pas des systemes de CORPS : la page les projette) */
    case 'versMars': { const a = lire(id, params, 'aCible'); return ['Spacecraft', 'Earth', Math.abs(a - 1.524) < 0.005 ? 'Mars' : 'Target planet (orbit at ' + (Math.round(a * 1000) / 1000) + ' AU)']; }
    case 'bigRip': return Array.from({ length: 12 }, (_, i) => 'Galaxy ' + (i + 1));
    case 'geometrieUnivers': return SURFACES.slice();
    case 'etoilesHR': return lusDansLeModule(id, params).etoiles.noms.slice();
    case 'tailleEtoiles': return lusDansLeModule(id, params).rayons.map((r) => r.nom);
    case 'calendrierCosmique': return lusDansLeModule(id, params).evenements.map((e) => e.nom);
    /* game81 : les deux courbes du couplage courant ; les sous-couches d un atome */
    case 'couplageCourant': return COUPLAGES.slice();
    case 'atomes': return sousCouches(params);
    default: return null;
  }
}
const xyz = (nom, u) => ['x of ' + nom + ' (' + u + ')', 'y of ' + nom + ' (' + u + ')', 'z of ' + nom + ' (' + u + ')'];
const parCorps = (noms, u) => noms.flatMap((b) => xyz(b, u));

/* game80 : la disposition d un film, la MEME regle que les modules (tam-invisible.js#filmDe) : image(i) = numero d image de la
 *   ligne i ; debuts / tailles par image ; parImage = taille commune si toutes egales, sinon null (comme le module le dit) */
function disposition(n, image) {
  const debuts = []; let p = -1;
  for (let i = 0; i < n; i++) { const f = image(i); if (f !== p) { debuts.push(i); p = f; } }
  const tailles = debuts.map((d, k) => (k + 1 < debuts.length ? debuts[k + 1] : n) - d);
  return { images: debuts.length, parImage: tailles.every((t) => t === tailles[0]) ? tailles[0] : null, debuts, tailles };
}
/* images regulieres de m lignes, les lignes en trop (n - F m) hors de toute image (tam-grandes-questions*.js : { images, parImage }) */
function regulieres(n, F, m) {
  return { images: F, parImage: m, debuts: Array.from({ length: F }, (_, k) => k * m), tailles: Array(F).fill(m), ...(n > F * m ? { reste: n - F * m } : {}) };
}
/** un film : les lignes sont des images successives ; colonneTemps = la colonne qui porte l instant (null : aucune) */
function filmDe(id, params = {}, n = N_DEFAUT) {
  let f = null, colonneTemps = null, note = null;
  if (FILMS_DU_MODULE[id]) {
    const M = sortieDuModule(id, params, n).film; if (!M) return null;
    f = { images: M.images, parImage: M.parImage ?? null, debuts: M.debuts.slice(), tailles: M.tailles.slice() };
    colonneTemps = FILMS_DU_MODULE[id].colonneTemps; note = FILMS_DU_MODULE[id].note || null;
  } else switch (id) {
    case 'supernova': case 'supernovaHydro': f = disposition(n, (i) => Math.min(15, Math.floor(i * 16 / n))); colonneTemps = 3; break;
    case 'collisionGalaxies': { let F = 1; for (let d = Math.min(12, n); d >= 1; d--) if (n % d === 0 && n / d >= 2) { F = d; break; }
      f = disposition(n, (i) => Math.floor(i / (n / F))); note = 'moments from before the encounter to the end'; break; }
    case 'effetTunnel': { const m = Math.ceil(n / 25); f = disposition(n, (i) => Math.min(24, Math.floor(i / m))); colonneTemps = 1; break; }
    case 'superpositionQuantique': { const F = lire(id, params, 'images', true), m = Math.ceil(n / F); f = disposition(n, (i) => Math.min(F - 1, Math.floor(i / m))); colonneTemps = 2; break; }
    case 'ondeGravitationnelle': { const N = lire(id, params, 'masses', true); f = disposition(n, (i) => Math.floor(i / N)); colonneTemps = 2; break; }
    /* game80 : les grandes questions */
    case 'fauxVide': { const F = Math.min(12, n); f = regulieres(n, F, Math.floor(n / F)); colonneTemps = null; break; }
    case 'versMars': { const F = Math.max(1, Math.floor(n / 3)); if (F < 2) return null; f = regulieres(n, F, 3); colonneTemps = 2; note = 'each moment has 3 points: the spacecraft, Earth, then the target planet'; break; }
    case 'tsunami': { const F = Math.min(24, n); f = regulieres(n, F, Math.max(1, Math.floor(n / F))); colonneTemps = 3; break; }
    default: return null;
  }
  /* game82 (audit, atomes Z = 1) : la page ne lit un film qu a partir de 2 images (tam-onglet.js#filmDe) ; 1 image = pas de film */
  if (!(f.images >= 2)) return null;
  if (f.parImage === null) note = 'frames of unequal size: ' + [...new Set(f.tailles)].join(' or ') + ' rows' + (note ? '; ' + note : '');
  if (f.reste) note = (note ? note + '; ' : '') + 'the last ' + f.reste + ' rows repeat points of the last moment and belong to no frame';
  return { images: f.images, parImage: f.parImage, debuts: Object.freeze(f.debuts), tailles: Object.freeze(f.tailles), ordre: 'images-successives', colonneTemps, ...(note ? { note } : {}) };
}
/* ce que la page dessine dans un film (tam-onglet.js#dessiner) : une couleur par moment (couleurDim(q % 12)), le moment courant
 *   en clair, les deux precedents en pale ; la couleur par colonne n y sert pas */
function couleursFilm(F) {
  return 'A film of ' + F.images + ' moments: each moment has its own colour (12 colours that repeat); the current moment is bright and the two moments before it are faint.';
}

/* ---- les legendes ; colonnes = tableau, ou fonction des params (systemes dont la taille ou les noms changent) ---- */
const L = {
  /* ---------- tam-physique.js ---------- */
  schwarzschild: {
    titre: 'Orbit around a black hole',
    enUnePhrase: 'A small body circling a non-rotating black hole, seen from above, with time lifting the path into a spiral staircase.',
    colonnes: ['x in the orbit plane (black-hole mass units, G = c = M = 1)', 'y in the orbit plane (same units)', 'time (scaled so it ends at twice the largest distance; goes up as the path is drawn)'],
    aRegarder: ['The orbit does not close: each turn starts a little further round. That is general relativity\'s precession (Mercury does the same, much more slowly).', 'Compare with the Newtonian orbit, same start: there the loops close exactly.'],
    fin: 'ends early at the horizon (r = 2M) if the body falls in, or at 10 times the starting distance if it is not bound and flies away for ever',
  },
  kepler: {
    titre: 'Newtonian orbit',
    enUnePhrase: 'The same start as the black-hole orbit, under Newton\'s gravity: a closed ellipse, lifted by time.',
    colonnes: ['x in the orbit plane (central-mass units, G = M = 1)', 'y in the orbit plane (same units)', 'time (scaled so it ends at twice the largest distance; goes up as the path is drawn)'],
    aRegarder: ['Seen from above every loop lands exactly on the previous one: no precession in Newton\'s gravity.'],
    fin: 'ends at 10 times the starting distance if the speed is above escape speed (the path is then a hyperbola or parabola, not an ellipse)',
  },
  troisCorps: {
    titre: 'Three-body problem',
    enUnePhrase: 'Three equal stars pulling on each other; with no nudge they chase each other along one figure-eight.',
    colonnes: () => parCorps(nomsDe('troisCorps'), 'units with G = mass = 1'),
    aRegarder: ['With the nudge at 0 the three paths lie on the same figure-eight.', 'A small nudge breaks the eight: the paths drift apart and become chaotic.', 'The z columns stay at 0 unless the nudge lifts star 1 out of the plane.'],
    fin: 'stops early only if two stars collide or one escapes',
  },
  tokamak: {
    titre: 'Particle in a tokamak field',
    enUnePhrase: 'One charged particle spiralling round a doughnut-shaped magnetic field, seen in 3-D.',
    colonnes: ['x (the doughnut\'s main radius is 1)', 'y (same units)', 'z, height above the middle plane (same units)'],
    aRegarder: ['The fast tiny circles are the gyration around the field line.', 'If the particle reverses along the field it is trapped on a banana-shaped orbit; otherwise it goes all the way round.'],
    fin: 'stops early if the particle touches the wall (distance 0.8 from the doughnut\'s core)',
  },
  doublePendule: {
    titre: 'Double pendulum',
    enUnePhrase: 'The path of the lower bob of a double pendulum, lifted by how fast the lower arm spins.',
    colonnes: ['x of the lower bob (arm length 1)', 'y of the lower bob (arm length 1, negative = below the pivot)', 'spin speed of the lower arm (radians per time unit, g = 1)', 'spin speed of the upper arm (radians per time unit; hidden dimension)'],
    aRegarder: ['The path never repeats: tiny changes in the start angles give a completely different picture (chaos).'],
    fin: null,
  },
  lorentzRelativiste: {
    titre: 'Relativistic charge in crossed fields',
    enUnePhrase: 'A charged particle in an electric field crossed with a magnetic field: it loops while drifting sideways.',
    colonnes: ['x, along the electric field (units with c = charge = mass = B = 1)', 'y, the drift direction (same units)', 'z, along the magnetic field (same units)'],
    aRegarder: ['The loops are the gyration; the steady slide along y is the E x B drift.', 'The loops are not perfect circles: the particle speeds up and slows down, and relativity changes its mass.'],
    fin: null,
  },
  hydrogene: {
    titre: 'Hydrogen electron cloud',
    enUnePhrase: 'Where the electron of a hydrogen atom can be found: each dot is one possible position, not a path.',
    colonnes: ['x (Bohr radii, about 0.053 nm)', 'y (Bohr radii)', 'z, the quantisation axis (Bohr radii)'],
    aRegarder: ['Dense lobes = likely places; empty shells and cones are nodes where the electron is never found.', 'The electron has no orbit: the order of the dots means nothing.'],
    fin: null,
  },
  /* ---------- tam-sciences.js ---------- */
  mandelbrot: {
    titre: 'Mandelbrot set boundary',
    enUnePhrase: 'Points just outside the Mandelbrot set, raised by how long they took to escape.',
    colonnes: ['real part of c (horizontal position in the complex plane)', 'imaginary part of c (vertical position)', 'natural log of the escape time (number of steps before |z| > 2)'],
    aRegarder: ['The highest points hug the boundary: the closer to the set, the longer they take to escape.'],
    fin: null,
  },
  mandelbulb: {
    titre: 'Mandelbulb surface',
    enUnePhrase: 'Points on the outer surface of the 3-D Mandelbulb fractal, one per direction.',
    colonnes: ['x (fractal coordinates; the whole shape fits inside radius 2)', 'y (same units)', 'z (same units)'],
    aRegarder: ['The bumps repeat around the vertical axis (power minus 1 times per turn).', 'Only the outer skin is sampled: hidden folds inside are not drawn.'],
    fin: null,
  },
  spiraleOr: {
    titre: 'Golden spiral',
    enUnePhrase: 'A spiral that grows by the golden ratio every quarter turn, climbing slowly, next to the corners of Fibonacci squares.',
    colonnes: ['x (scaled so the largest square corner is at distance 1 from the spiral centre)', 'y (same units)', 'height (climbs with the angle; the square corners sit at the height of their quarter turn)'],
    aRegarder: ['The first rows are the smooth spiral; the last rows (4 per square) are the corners of the Fibonacci squares.', 'The squares only approach the golden rectangle: their sides are whole numbers.'],
    fin: null,
  },
  phyllotaxieOr: {
    titre: 'Golden-angle phyllotaxis',
    enUnePhrase: 'Seeds placed on a ball, each one turned by the golden angle (137.5 degrees) from the last, like a sunflower head.',
    colonnes: ['x on the unit sphere', 'y on the unit sphere', 'z on the unit sphere (seed 1 at the top, the last seed at the bottom)'],
    aRegarder: ['With the golden angle the seeds spread evenly with no gaps; move the offset slider and spokes appear.'],
    fin: null,
  },
  ifs3d: {
    titre: 'Sierpinski tetrahedron',
    enUnePhrase: 'The chaos game: jump part of the way to a random corner of a tetrahedron, again and again; the dots draw a fractal.',
    colonnes: ['x (the tetrahedron fits in the unit cube)', 'y (unit cube)', 'z (unit cube)'],
    aRegarder: ['Each small tetrahedron is a copy of the whole. At ratio 1/2 the holes are exact; below 1/2 the copies separate.'],
    fin: null,
  },
  bloch: {
    titre: 'Spin-1/2 Rabi oscillation',
    enUnePhrase: 'The direction of a quantum spin driven by a field, drawn as an arrow tip moving on a ball of radius 1.',
    colonnes: ['spin x component (average value, from -1 to 1)', 'spin y component (average value, from -1 to 1)', 'spin z component (1 = up, -1 = down)'],
    aRegarder: ['The path stays exactly on the ball: a pure quantum state.', 'Off resonance the spin never fully flips: the lowest point stays above the bottom.'],
    fin: null,
  },
  paquetOscillateur: {
    titre: 'Wavepacket in a harmonic well',
    enUnePhrase: 'A quantum wave packet sloshing in a bowl-shaped well, drawn as its average position, average momentum and width.',
    colonnes: ['average position (units with hbar = mass = 1)', 'average momentum (same units)', 'width of the packet (spread of position)'],
    aRegarder: ['Position and momentum trace a circle or ellipse: the packet swings like a classical ball.', 'At width 1 the third column stays flat (a coherent state); other widths make the packet breathe twice per swing.'],
    fin: null,
  },
  fentesYoung: {
    titre: 'Double-slit detections',
    enUnePhrase: 'Single particles hitting a screen behind two slits, one dot per hit, stacked in the order they arrived.',
    colonnes: ['position across the screen (mm)', 'position along the slits (mm; spread evenly, no physics in it)', 'order of arrival (scaled to the screen window width; first hit at the bottom)'],
    aRegarder: ['Each particle lands at one spot, yet together they build bands: the interference pattern of a wave.', 'The bands appear only after many hits: look at the bottom (few hits) versus the top.'],
    fin: null,
  },
  boiteQuantique: {
    titre: 'Particle in a box',
    enUnePhrase: 'Where a quantum particle trapped in a hard-walled cube can be found: each dot is one possible position.',
    colonnes: ['x inside the box (box side 1, centred on 0)', 'y inside the box', 'z inside the box'],
    aRegarder: ['Empty flat planes are nodes: the particle is never found there. Their number follows the three quantum numbers.'],
    fin: null,
  },
  /* ---------- tam-fluides.js ---------- */
  tourbillonsPonctuels: {
    titre: 'Point vortices',
    enUnePhrase: 'Three or four tiny whirlpools in a flat ideal fluid, each one pushed around by the others, seen from above.',
    colonnes: (p) => nomsDe('tourbillonsPonctuels', p).flatMap((b) => ['x of ' + b + ' (fluid length units)', 'y of ' + b + ' (fluid length units)']),
    aRegarder: ['Three vortices dance in a regular pattern; four usually become chaotic.', 'The weighted centre and spread of the vortices never change: the fluid conserves them.'],
    fin: 'stops early only if two vortices collide',
  },
  doubleGyre: {
    titre: 'Double gyre',
    enUnePhrase: 'One floating speck carried by two side-by-side whirls that sway back and forth, lifted by time.',
    colonnes: ['x in the box (0 to 2)', 'y in the box (0 to 1)', 'time (scaled from 0 to 2; goes up as the path is drawn)'],
    aRegarder: ['The speck jumps between the left and right whirl at irregular times: chaotic mixing by a simple flow.'],
    fin: null,
  },
  karman: {
    titre: 'Von Karman vortex street',
    enUnePhrase: 'A floating speck carried by two rows of whirlpools, like the wake behind a pole in a river.',
    colonnes: ['x along the street (vortex spacing = 1)', 'y across the street (same units)', 'time, as the distance the vortex street has drifted (same units)'],
    aRegarder: ['The speck loops around passing vortices while being swept along.'],
    fin: 'stops early if the speck gets too close to a vortex centre',
  },
  rayleighBenard: {
    titre: 'Convection rolls',
    enUnePhrase: 'A floating speck in rolls of rising and sinking fluid whose walls sway sideways, lifted by time.',
    colonnes: ['x, sideways (one roll is 1 wide)', 'height in the fluid layer (0 = bottom, 1 = top)', 'time (scaled from 0 to 2; goes up as the path is drawn)'],
    aRegarder: ['With no sway the speck circles in one roll forever; with sway it hops from roll to roll.'],
    fin: 'stops early if the speck leaves the layer',
  },
  /* ---------- tam-astro.js ---------- */
  systemeSolaire: {
    titre: 'Our solar system',
    enUnePhrase: 'Four planets going around the Sun, from 1 January 2000, real orbits in 3-D.',
    colonnes: (p) => parCorps(nomsDe('systemeSolaire', p), 'AU, Sun at the centre, ecliptic plane'),
    aRegarder: ['Inner planets go round much faster than outer ones (Kepler\'s third law).', 'The orbits are slightly tilted and off-centre ellipses, as measured.'],
    fin: null,
  },
  etoileS2: {
    titre: 'Star S2 around our black hole',
    enUnePhrase: 'The star S2 orbiting the giant black hole at the centre of our galaxy, on its measured orbit.',
    colonnes: ['x (AU; axes follow the published orbit angles, exact sky orientation not documented in the module)', 'y (AU)', 'z (AU)'],
    aRegarder: ['A very stretched ellipse: S2 dives to about 120 AU from the black hole, then swings out to about 2000 AU.', 'The real precession (12 arc-minutes per orbit) is too small to see by eye.'],
    fin: null,
  },
  binaireTrouNoir: {
    titre: 'Black hole binary inspiral',
    enUnePhrase: 'Two black holes spiralling together as they lose energy to gravitational waves, drawn as their relative orbit.',
    colonnes: ['x of the relative orbit (total-mass units, G = c = 1)', 'y of the relative orbit (same units)', 'time (scaled so it ends at twice the starting size)', 'eccentricity (0 = circle, near 1 = very stretched)'],
    aRegarder: ['The orbit shrinks and becomes rounder: eccentricity falls as the waves carry energy away.', 'The ellipse also turns slowly (relativistic periastron advance).'],
    fin: 'stops when the closest approach reaches 6 mass units (this averaged model ends before the merger)',
  },
  amasEtoiles: {
    titre: 'Star cluster around a black hole',
    enUnePhrase: 'Four stars of a small cluster moving around a central black hole, all pulling on each other.',
    colonnes: () => parCorps(nomsDe('amasEtoiles'), 'cluster units with G = 1, total star mass 1'),
    aRegarder: ['Only 4 of the stars are drawn; the others still pull on them.', 'Close passes kick stars onto new paths: the motion is chaotic.'],
    fin: null,
  },
  supernova: {
    titre: 'Supernova remnant',
    enUnePhrase: 'The shock front of an exploded star at 16 moments, each moment a shell of dots.',
    colonnes: ['x (parsecs)', 'y (parsecs)', 'z (parsecs)', 'time since the explosion (years, 16 moments evenly spaced on a log scale)'],
    aRegarder: ['Early shells grow fast (free expansion), late shells slowly (the blast wave slows as it sweeps up gas).'],
    fin: null,
  },
  supernovaHydro: {
    titre: 'Supernova blast wave (hydrodynamics)',
    enUnePhrase: 'The gas pushed by a point explosion, computed by real fluid equations, at 16 moments.',
    colonnes: ['x (parsecs)', 'y (parsecs)', 'z (parsecs)', 'time since the explosion (years)', 'gas density divided by the surrounding density'],
    aRegarder: ['Most dots crowd just behind the shock: the swept-up gas piles there, up to about 4 times denser.', 'The shell radius grows as time to the power 2/5, as Sedov and Taylor predicted.'],
    fin: null,
  },
  binaireFusion: {
    titre: 'Black hole merger signal',
    enUnePhrase: 'The gravitational-wave signal of two black holes merging: wave height against time, getting faster and stronger.',
    colonnes: ['time (seconds; 0 = start of the final ringing)', 'wave height, plus polarisation (x 1e21, no detector response)', 'wave height, cross polarisation (x 1e21)', 'wave frequency (Hz)'],
    aRegarder: ['The chirp: frequency and height grow faster and faster before the merger.', 'After the merger the new black hole rings at one frequency and fades.'],
    fin: 'merger, then the ringing of the final black hole dies out',
  },
  collisionGalaxies: {
    titre: 'Colliding galaxies',
    /* game80 : la collision est un FILM (12 moments : les noyaux s approchent, se croisent, les queues de maree se forment) */
    enUnePhrase: 'A film of two disk galaxies flying past each other: the cores approach, swing around each other and tides pull out long tails of stars.',
    colonnes: ['x (units of the closest-approach distance)', 'y (same units)', 'z (same units)'],
    aRegarder: ['Move the Moment slider (or let it play): each moment shows the same stars at a later time.', 'Long tails of stars are thrown out by tides when a disk spins the same way as the encounter; a disk spinning the other way stays almost intact.'],
    fin: 'the tidal tails are fully formed at the last moment',
  },
  /* ---------- tam-cosmos.js ---------- */
  lumiereTrouNoir: {
    titre: 'Light bending around a black hole',
    enUnePhrase: 'Four light rays passing a black hole, each lifted by the angle it has swept around it.',
    colonnes: () => nomsDe('lumiereTrouNoir').flatMap((b) => ['x of ' + b + ' (black-hole mass units)', 'y of ' + b + ' (same units)', 'angle swept by ' + b + ' (radians)']),
    aRegarder: ['A ray aimed closer than 5.2 units is swallowed; just outside it, the ray circles the black hole before escaping.', 'Far rays are only slightly bent.'],
    fin: 'rays below the critical distance end at the horizon',
  },
  kerr: {
    titre: 'Orbit around a spinning black hole',
    enUnePhrase: 'A small body orbiting a spinning black hole on a tilted orbit, in 3-D.',
    colonnes: ['x (black-hole mass units)', 'y (same units)', 'z, along the spin axis (same units)'],
    aRegarder: ['The tilted orbit plane slowly turns around the spin axis: the black hole drags space with it (frame dragging).'],
    fin: 'stops early if the body falls through the horizon',
  },
  trouDeVer: {
    titre: 'Light through a wormhole',
    enUnePhrase: 'Two light rays on the shape of a theoretical wormhole: one goes through the throat, one turns back.',
    colonnes: () => nomsDe('trouDeVer').flatMap((b) => ['x of ' + b + ' (throat-radius units)', 'y of ' + b + ' (same units)', 'height on the wormhole shape for ' + b + ' (negative = first side, positive = other side)']),
    aRegarder: ['The ray that crosses height 0 went through the throat to the other side.', 'The other ray turns back before the throat.'],
    fin: null,
  },
  trouDeVerSurface: {
    titre: 'Wormhole embedding surface',
    enUnePhrase: 'The shape of space around a theoretical wormhole: two funnels joined at a narrow throat.',
    colonnes: ['x (throat-radius units)', 'y (same units)', 'height on the shape (0 = the throat)'],
    aRegarder: ['The narrowest ring is the throat; the two flaring sides are two separate regions of space.'],
    fin: null,
  },
  pointsLagrange: {
    titre: 'Trojans and Lagrange points',
    enUnePhrase: 'A small body near a balance point of a star and its planet, in a frame that turns with the planet.',
    colonnes: ['x in the turning frame (star-planet distance = 1; star near 0, planet near 1)', 'y in the turning frame (same units)', 'z, out of the orbit plane (same units; 0 unless started above the plane)'],
    aRegarder: ['A tadpole loop around the point 60 degrees ahead of the planet (a Trojan), or a horseshoe sliding past it.'],
    fin: 'stops early if the body hits the star or planet or escapes',
  },
  pulsarHulseTaylor: {
    titre: 'Hulse-Taylor binary pulsar',
    enUnePhrase: 'A pulsar and its companion star orbiting each other while the orbit shrinks, hugely sped up up to its merger.',
    colonnes: () => parCorps(nomsDe('pulsarHulseTaylor'), 'light-seconds, centre of mass at 0'),
    aRegarder: ['The two stars stay on opposite sides of the centre; the pulsar, slightly heavier, moves a little less.', 'The orbit shrinks over hundreds of millions of years: gravitational waves carry energy away.'],
    fin: 'the orbit shrinks toward merger (about 300 million years)',
  },
  courbeRotation: {
    titre: 'Galaxy rotation curve',
    enUnePhrase: 'Stars of a model galaxy at increasing distance from the centre, with their orbital speed with and without dark matter.',
    colonnes: ['x (kpc)', 'y (kpc)', 'orbital speed with the dark-matter halo (km/s)', 'orbital speed from visible matter only (km/s)'],
    aRegarder: ['Speed with the halo stays almost flat far out; without it, it falls. That gap is the evidence for dark matter.', 'The four arms wind up because inner stars go round faster.'],
    fin: null,
  },
  expansionUnivers: {
    titre: 'Expanding universe',
    enUnePhrase: 'Four galaxies moving away from us as the universe expands, from the Big Bang onward.',
    colonnes: () => parCorps(nomsDe('expansionUnivers'), 'billion parsecs, physical distance, we are at the centre'),
    aRegarder: ['Each galaxy moves straight outward: space stretches, the galaxies do not travel through it.', 'Dots are evenly spaced in time: the gaps shrink while gravity slows the expansion, then grow again once dark energy speeds it up.'],
    fin: null,
  },
  cometeHalley: {
    titre: 'Halley\'s comet',
    enUnePhrase: 'Halley\'s comet on its long, tilted, backward orbit around the Sun, with Earth\'s orbit for scale.',
    colonnes: () => [...xyz('Halley', 'AU, Sun at the centre'), 'x of Earth (AU)', 'y of Earth (AU)', 'z of Earth (always 0: Earth is drawn in its own orbit plane)'],
    aRegarder: ['The comet spends most of its 75 years far out and rushes past the Sun.', 'It goes round the opposite way to Earth (retrograde).'],
    fin: null,
  },
  trappist1: {
    titre: 'TRAPPIST-1 planets',
    enUnePhrase: 'Four planets of the star TRAPPIST-1 on circular orbits, seen from above.',
    colonnes: (p) => nomsDe('trappist1', p).flatMap((b) => ['x of ' + b + ' (AU)', 'y of ' + b + ' (AU)']),
    aRegarder: ['The whole system would fit inside Mercury\'s orbit.', 'Neighbouring periods are close to simple ratios like 8:5 and 3:2 (a resonant chain).'],
    fin: null,
  },
  disqueAccretion: {
    titre: 'Black hole accretion disk',
    enUnePhrase: 'Particles of a thin disk swirling around a black hole and slowly drifting inward.',
    colonnes: ['x (black-hole mass units)', 'y (same units)', 'z, the disk\'s thin thickness (same units)', 'orbital speed seen by a still observer (fraction of light speed)'],
    aRegarder: ['The hole in the middle is the innermost stable orbit (6 mass units): nothing orbits closer.', 'The inner particles are fastest, close to half the speed of light.'],
    fin: null,
  },
  /* ---------- tam-invisible.js ---------- */
  ondeGravitationnelle: {
    titre: 'Gravitational wave on a ring',
    enUnePhrase: 'A ring of floating masses squeezed and stretched by a passing gravitational wave, one ring per moment, stacked up in time.',
    colonnes: ['x of a mass (ring radius 1; the wave effect is exaggerated)', 'y of a mass (same units)', 'time (scaled from 0 to 2; one ring per moment)'],
    aRegarder: ['The ring becomes an ellipse one way, then the other way, at the wave\'s rhythm.', 'The plus wave stretches along the axes, the cross wave along the diagonals.'],
    fin: null,
  },
  courbureEspaceTemps: {
    titre: 'Curved space around a black hole',
    enUnePhrase: 'A funnel showing how space is curved around a black hole, with a falling observer on it.',
    colonnes: ['x (black-hole mass units; for the observer, the distance from the centre)', 'y (same units; 0 for the observer)', 'height on the funnel (an embedding drawing, not a real direction)'],
    aRegarder: ['The first rows are the funnel surface, the last fifth is the falling observer.', 'The funnel gets steep near the horizon (2 mass units): distances there are longer than they look.'],
    fin: 'the observer reaches the horizon',
  },
  chuteTrouNoir: {
    titre: 'Falling into a black hole',
    enUnePhrase: 'An observer falling into a black hole: distance from the centre against their own clock and against a faraway clock.',
    colonnes: ['distance from the centre (black-hole mass units)', 'time on the falling observer\'s own clock (same units)', 'time on a faraway clock (same units; clipped, it never reaches the horizon)'],
    aRegarder: ['The observer\'s own clock reaches the centre in a finite time.', 'The faraway clock shoots up at the horizon (distance 2): from far away the fall never ends.'],
    fin: 'the observer reaches the centre; the faraway time is held at the clip from the horizon on',
  },
  dilatationTemps: {
    titre: 'Clocks that tick slower',
    enUnePhrase: 'Several clocks as helices: each turn is the same faraway time, the height is how much each clock really ticked.',
    colonnes: ['x (distance from the mass, mass units)', 'y (same units)', 'time ticked on that clock (same units)'],
    aRegarder: ['Rows come in blocks, one helix per clock: the nearest clock to the mass first, the moving clock last (outermost).', 'Flatter helices = slower clocks: near the mass and when moving fast.'],
    fin: null,
  },
  effetTunnel: {
    titre: 'Quantum tunnelling',
    enUnePhrase: 'A quantum wave packet hitting a barrier, shown as its probability at 25 moments.',
    colonnes: ['position (units with hbar = mass = 1; the barrier starts at 0)', 'time (same units; one moment per frame)', 'probability density |psi|^2'],
    aRegarder: ['Part of the packet passes through a barrier it classically could not cross: that is tunnelling.', 'The ripples before the barrier are the incoming wave interfering with the reflected one.'],
    fin: 'the packet splits into a reflected and a transmitted part',
  },
  superpositionQuantique: {
    titre: 'Quantum superposition',
    enUnePhrase: 'Snapshots of a hydrogen atom in two states at once: its electron cloud sloshes up and down over time.',
    colonnes: ['x (Bohr radii)', 'z, up-down (Bohr radii)', 'time (4 = one full slosh)'],
    aRegarder: ['The cloud leans up, then down, at a beat set by the energy gap of the two states.', 'Each frame is a fresh set of random samples, not the same dots moving.'],
    fin: null,
  },
  champDipolaire: {
    titre: 'Earth\'s magnetic trap',
    enUnePhrase: 'Magnetic field lines of an Earth-like magnet and one charged particle bouncing between the poles along them.',
    colonnes: ['x (Earth radii)', 'y (Earth radii; 0 for the field lines)', 'z, along the magnetic axis (Earth radii)'],
    aRegarder: ['The first 30 percent of rows are field lines; the rest is the particle.', 'The particle bounces between mirror points near the poles and slowly drifts around the Earth, like the Van Allen belts.'],
    fin: null,
  },
  ondeLumiere: {
    titre: 'Light as a wave',
    enUnePhrase: 'The electric and magnetic fields of a light wave along its path, next to the glow pattern of a radio antenna.',
    colonnes: ['wave rows: position along the beam (wavelengths, starts at 3); pattern rows: x of the pattern', 'wave rows: field across, sideways (E, or B times c); pattern rows: y of the pattern', 'wave rows: field across, up (E, or B times c); pattern rows: z, along the antenna'],
    aRegarder: ['The first half of the rows is the wave: rows alternate between the electric field tip and the magnetic field tip.', 'E and B stay at right angles to each other and to the direction of travel.', 'The second half is the doughnut-shaped antenna pattern: no light goes along the antenna axis.'],
    fin: null,
  },
  diagrammeEspaceTemps: {
    titre: 'Spacetime diagram',
    enUnePhrase: 'A grid of events, the light cone and the two twins\' paths, as seen by an observer moving at a chosen speed.',
    colonnes: ['position seen by the moving observer (c = 1)', 'time seen by the moving observer', 'grid rows: interval time^2 - position^2 divided by 5; light-cone rows: 0; twin rows: time ticked by that twin'],
    aRegarder: ['Rows in order: half the rows are the grid, one sixth the light cone, then the stay-at-home twin, then the traveller.', 'The grid tilts with speed, but the light cone does not move: light speed is the same for everyone.', 'The traveller\'s height ends lower: they aged less.'],
    fin: null,
  },
  mouvementBrownien: {
    titre: 'Brownian motion',
    enUnePhrase: 'Random-walk paths of a few particles from the same start, like pollen jiggling in water.',
    colonnes: ['x (length units; each step has spread set by the diffusion slider)', 'y (same units)', 'z (same units)'],
    aRegarder: ['Rows come in blocks of steps plus one, one path per particle, each starting at the origin; the last path is cut short.', 'The spread grows like the square root of time (Einstein\'s law).'],
    fin: null,
  },
  /* ---------- tam-quantique.js ---------- */
  tapisTalbot: {
    titre: 'Quantum carpet (Talbot revivals)',
    enUnePhrase: 'Where a quantum particle bouncing in a box can be found, at every moment: the probability weaves a carpet.',
    colonnes: ['position in the box (box width 1)', 'time (in units of the full revival time)', 'probability density at that place and time'],
    aRegarder: ['At time 1 the starting packet comes back exactly; at time 0.5 it comes back mirrored.', 'Each dot picks a random moment: this is a cloud, not frames in order.'],
    fin: null,
  },
  oscillateurEtats: {
    titre: 'Harmonic oscillator eigenstates',
    enUnePhrase: 'The probability curve of one quantum state in a bowl-shaped well, filled with dots under the curve.',
    colonnes: ['position (units with hbar = mass = 1)', 'random height under the probability curve (the dots fill the area)', 'signed wave amplitude psi at that position'],
    aRegarder: ['The number of gaps (zeros) equals the state number.', 'This state does not move in time.'],
    fin: null,
  },
  wigner: {
    titre: 'Wigner function of a cat state',
    enUnePhrase: 'A quantum "cat" in two places at once, drawn on the position-momentum plane, height = Wigner value.',
    colonnes: ['position', 'momentum', 'Wigner value W (can be negative)'],
    aRegarder: ['Two humps = the two places; the stripes between them dip below zero. Negative values have no classical meaning: that is quantum interference.'],
    fin: null,
  },
  marcheQuantique: {
    titre: 'Quantum walk vs random walk',
    enUnePhrase: 'Where a quantum walker can be found after each step, with the quantum and the ordinary coin-flip probabilities.',
    colonnes: ['position on the line', 'step number', 'quantum probability at that position and step', 'ordinary random-walk probability at that position and step'],
    aRegarder: ['The quantum walker spreads in two sharp fronts moving at constant speed; the ordinary walker stays in a hump that widens slowly.'],
    fin: null,
  },
  bellCHSH: {
    titre: 'Bell correlations (CHSH)',
    enUnePhrase: 'Measured agreement between two entangled spins for random pairs of detector angles.',
    colonnes: ['detector angle a (radians)', 'detector angle b (radians)', 'measured correlation (from -1 to 1, from random sampling)', 'quantum formula -cos(a - b)'],
    aRegarder: ['The measured dots follow the formula wave closely.', 'This reproduces the quantum prediction on one computer; it is not itself a test of nonlocality.'],
    fin: null,
  },
  rotorPulse: {
    titre: 'Quantum kicked rotor',
    enUnePhrase: 'A spinning rotor kicked again and again: quantum momenta next to classical momenta, kick after kick.',
    colonnes: ['kick number', 'quantum momentum (drawn from the quantum probability)', 'classical momentum (one particle of the classical ensemble)', 'classical angle (radians, 0 to 2 pi)'],
    aRegarder: ['The classical spread keeps growing; the quantum spread stops growing: dynamical localisation.'],
    fin: null,
  },
  niveauxLandau: {
    titre: 'Landau levels',
    enUnePhrase: 'Where an electron in a magnetic field can be found, over time: a ring, whose centre circles if two levels are mixed.',
    colonnes: ['x (units with hbar = mass = charge = 1)', 'y (same units)', 'time (in cyclotron periods)'],
    aRegarder: ['The density is a ring; only its average position goes round, at the cyclotron frequency.'],
    fin: null,
  },
  sternGerlach: {
    titre: 'Stern-Gerlach splitting',
    enUnePhrase: 'Atoms flying through a magnet: each one goes either up or down, never in between.',
    colonnes: ['position across the beam (scaled units)', 'distance along the beam (0 to 1 inside the magnet, 1 to 2 in free flight)', 'up-down deflection (scaled units)'],
    aRegarder: ['The beam splits into two spots: spin is quantised.', 'The share going up is cos^2 of half the preparation angle.'],
    fin: null,
  },
  /* ---------- tam-fusion.js ---------- */
  fusionTrousNoirs: {
    titre: 'Spinning black hole merger (IMRPhenomB)',
    enUnePhrase: 'The gravitational-wave signal of two spinning black holes merging: wave height against time.',
    colonnes: ['time (seconds; 0 = peak of the signal)', 'wave height, plus polarisation (x 1e21, no detector response)', 'wave height, cross polarisation (x 1e21)', 'wave frequency (Hz; noisy after the signal has faded)'],
    aRegarder: ['The chirp rises to a peak at time 0, then rings down.', 'Spins aligned with the orbit make the signal last longer before merging.'],
    fin: 'merger at the peak (t = 0), then the ringing dies out',
  },
  /* ---------- tam-grandes-questions.js (game80) ---------- */
  videQuantique: {
    titre: 'The quantum vacuum (Casimir effect)',
    enUnePhrase: 'Empty space between two metal plates: only some vacuum waves fit between them, all of them fit outside, and that difference pushes the plates together.',
    colonnes: ['position across the gap, in units of the gap width (the plates are at 0 and 1; below 0 or above 1 = outside the plates)', 'wave number of a vacuum wave, in units of pi divided by the gap (inside: whole numbers only, 1 up to the Modes setting; outside: any value)', 'strength of that wave at that point (arbitrary units, from -0.4 to 0.4)'],
    aRegarder: ['Between the plates only whole-number waves fit, so the dots line up in rows; outside every wave is allowed and the dots fill the space.', 'Fewer waves inside than outside means the vacuum pushes the plates together: at the default gap of 1 micrometre the pressure is about 1.3 thousandths of a pascal.', 'Halve the gap and the pressure grows 16 times (it goes as one over the gap to the fourth power).'],
    fin: null,
  },
  bigRip: {
    titre: 'The Big Rip',
    enUnePhrase: 'Twelve galaxies carried apart by a dark energy that keeps getting stronger, until space stretches without limit at a finite time.',
    colonnes: ['x of a galaxy, on a log scale (its starting distance, 0.3 to 1, times 1 + log10 of how many times space has stretched since today)', 'y of a galaxy (same log scale)', 'time from today (billions of years)'],
    aRegarder: ['Each galaxy runs straight outward; on this log scale every equal step outward means space has stretched 10 more times.', 'The paths stop about 0.02 billion years before the Big Rip, once space has stretched 10 000 times; with the default settings the rip comes about 22 billion years from now.', 'The galaxies are test points: the tearing apart of galaxies, stars and atoms themselves is not simulated.'],
    fin: 'space stretches without limit at a finite time (the Big Rip); the last point drawn is shortly before it',
    objets: (noms) => 'Rows come in ' + noms.length + ' blocks, one per galaxy, from today onward: ' + noms.join(', ') + '.',
  },
  fauxVide: {
    titre: 'False vacuum decay',
    enUnePhrase: 'A film of one slice of space in a false vacuum: bubbles of true vacuum appear at random, grow at nearly the speed of light and merge.',
    colonnes: ['x in the box (box side 1)', 'y in the box (box side 1; every point lies on one slice through the middle of the box)', 'state of that point at that moment: 0.3 = already true vacuum, 0 = still false vacuum (a marker, not a distance)'],
    aRegarder: ['Move the Moment slider (or let it play): the same points at a later moment, more of them inside bubbles.', 'The share of true vacuum follows the Kolmogorov-Johnson-Mehl-Avrami formula; by the last moment nearly all space (about 97 to 98 percent) has decayed.', 'The rate at which bubbles appear is illustrative, not a prediction for our universe.'],
    fin: 'nearly all of the slice is true vacuum at the last moment',
  },
  centreTerre: {
    titre: 'A fall through the Earth',
    enUnePhrase: 'A body dropped into a straight tunnel through the centre of the Earth, with no air: it falls, shoots through the centre and comes back.',
    colonnes: ['position along the tunnel, in Earth radii (1 = the starting surface, 0 = the centre, -1 = the far side)', 'speed along the tunnel (km/s; the sign gives the direction)', 'time since the drop (minutes)', 'gravity at that depth (m/s^2)'],
    aRegarder: ['With the layered (PREM) Earth the one-way trip takes about 38 minutes; with a constant-density Earth it takes about 42.', 'Gravity first grows as you fall, to about 10.7 m/s^2 at the top of the iron core, then drops to 0 at the centre.', 'The speed peaks at the centre, near 10 km/s; with no air the body comes back to the start and keeps going back and forth.'],
    fin: null,
  },
  versMars: {
    titre: 'Getting to Mars',
    enUnePhrase: 'A film of the cheapest simple trip to Mars: the spacecraft coasts on half an ellipse around the Sun while Earth and Mars move on their orbits.',
    colonnes: ['x (AU, Sun at the centre)', 'y (AU)', 'days since launch (the 3 points of a moment share it)'],
    aRegarder: ['The spacecraft leaves Earth\'s orbit and arrives at Mars\'s orbit on the far side of the Sun: about 259 days (8.5 months) of coasting.', 'Launch works only when Mars is about 44 degrees ahead of Earth; that line-up comes back every 780 days (about 26 months).', 'Planet gravity and the real tilted, slightly oval Mars orbit are left out, so real trips differ by weeks.'],
    fin: 'arrival at the target orbit, on the far side of the Sun from the launch point',
    objets: (noms) => 'In each moment the 3 points are, in order: ' + noms.join(', ') + '.',
  },
  zeroAbsolu: {
    titre: 'Near absolute zero (Bose-Einstein condensate)',
    enUnePhrase: 'A cloud of very cold atoms held in a bowl-shaped trap: below a critical temperature many of them fall into the same lowest state.',
    colonnes: ['x of an atom in the trap (trap length unit: sqrt(hbar / (atom mass x trap angular frequency)))', 'y of an atom (same unit)', 'z of an atom (same unit)'],
    aRegarder: ['The dense core is the Bose-Einstein condensate (atoms all in the lowest state); the wide haze is the ordinary thermal gas.', 'At the default temperature (0.6 of the critical temperature) about 78 percent of the atoms are in the core; above 1 the core disappears.', 'Each dot is one sampled atom position, not a path.'],
    fin: null,
  },
  tailleUnivers: {
    titre: 'How big is the observable universe',
    enUnePhrase: 'Points out to the edge of the observable universe, placed at their distance today and lifted by when the light we see from them set off.',
    colonnes: ['x today (billions of parsecs, comoving distance; we are at the centre)', 'y today (same unit; every point lies in one flat slice)', 'cosmic time when the light we now see left that place (billions of years after the Big Bang: about 13.8 here and now, 0 at the edge)'],
    aRegarder: ['The outer ring (the first tenth of the points) is the edge, about 14 billion parsecs (46 billion light years) away, although the universe is only 13.8 billion years old: space kept stretching while the light travelled.', 'The farther the point, the earlier its light left: the third value falls from about 13.8 nearby to 0 at the edge.', 'A model universe with the Planck 2018 parameters, not a map of real galaxies.'],
    fin: null,
  },
  nombrePi: {
    titre: 'Three roads to pi',
    enUnePhrase: 'Random points thrown into a square: the share that lands inside a quarter circle gives pi, and each point is lifted by how wrong the estimate still is.',
    colonnes: ['x of a random point in the unit square (0 to 1)', 'y of a random point (0 to 1)', 'error of the running estimate of pi after this many points: |4 x (share inside the quarter circle) - pi|'],
    aRegarder: ['The height jumps around for the first points, then settles low: the error of random points shrinks only like 1 over the square root of their number.', 'The other two roads are measured, not drawn: 1000 terms of the Leibniz series still miss pi by 0.001, while Machin\'s formula reaches the limit of computer precision in about 10 terms.'],
    fin: null,
  },
  calendrierCosmique: {
    titre: 'The cosmic calendar',
    enUnePhrase: 'The whole history of the universe squeezed into one year, drawn as a spiral with one turn per month and a small stick at each key event.',
    colonnes: ['x on the calendar spiral (one turn per month; radius 1 on 1 January, 3 at midnight on 31 December; no unit)', 'y on the calendar spiral (same)', 'height: 0 on the spiral; the short vertical sticks (0 to 1) mark the events'],
    aRegarder: ['The Big Bang is midnight on 1 January and today is midnight at the end of 31 December.', 'The Sun and Earth form only in early September; the last dinosaurs die out on 30 December.', 'Homo sapiens appears only about 11 minutes before midnight on 31 December.'],
    fin: null,
    objets: (noms) => 'After the spiral, one stick per event, in this order: ' + noms.join(', ') + '.',
  },
  /* ---------- tam-grandes-questions-2.js (game80) ---------- */
  penduleFoucault: {
    titre: 'Foucault pendulum',
    enUnePhrase: 'A long pendulum swinging for hours on the turning Earth: the far ends of its swing slowly go round, because the floor turns underneath it.',
    colonnes: ['east-west position of the bob at a far end of its swing (m; east positive)', 'north-south position of the bob at that far end (m; north positive)', 'time (hours)'],
    aRegarder: ['Each dot is one far end of a swing; together they show the swing plane slowly turning.', 'The swing plane turns clockwise in the northern hemisphere, anticlockwise in the southern one, and not at all on the equator.', 'At Paris (latitude 48.85 degrees, the default) one full turn takes about 32 hours; at a pole it takes about 24 hours.'],
    fin: null,
  },
  mouvementTerre: {
    titre: 'Earth\'s real path through space',
    enUnePhrase: 'Earth going round the Sun while the Sun itself races around the Milky Way: the yearly loop becomes a stretched corkscrew.',
    colonnes: ['x of Earth (AU, measured from where the Sun was at the start; Earth\'s orbit plane)', 'y of Earth (AU, same frame)', 'z of Earth, out of Earth\'s orbit plane (AU)', 'time (years)'],
    aRegarder: ['The Sun moves at more than 200 km/s, so each year the corkscrew moves on by about 50 AU while the yearly loop is only 2 AU wide.', 'The Sun\'s motion is tilted about 60 degrees to Earth\'s orbit plane.', 'Over these few years the Sun\'s path around the galaxy is treated as a straight line; the Moon and planets are left out.'],
    fin: null,
  },
  etoilesHR: {
    titre: 'Real stars on the Hertzsprung-Russell diagram',
    enUnePhrase: 'Real stars placed by their published temperature, brightness and size, next to the line that ordinary stars like the Sun follow.',
    colonnes: ['log10 of the surface temperature (kelvin)', 'log10 of the luminosity (Sun = 0)', 'log10 of the radius (Sun = 0)'],
    aRegarder: ['Only the first points are stars (named below); all later points draw a straight-line fit through the main-sequence stars.', 'Main-sequence stars like the Sun lie along that line; giants and supergiants such as Betelgeuse sit far above it, white dwarfs such as Sirius B far below.', 'Each star is checked against the black-body law L = 4 pi R^2 sigma T^4.'],
    fin: null,
    objets: (noms) => 'The first ' + noms.length + ' points are the stars, in this order: ' + noms.join(', ') + '; every later point is on the main-sequence line.',
  },
  evaporationTrouNoir: {
    titre: 'Black hole evaporation',
    enUnePhrase: 'A black hole slowly losing mass as it glows (Hawking radiation): the smaller it gets, the hotter it glows and the faster it shrinks.',
    colonnes: ['time as a fraction of the black hole\'s whole lifetime (from the first step, 1/1500, to 0.9999)', 'mass left, as a fraction of the starting mass', 'log10 of how many times hotter it is than at the start (it heats up as the mass shrinks)', 'log10 of (1 + time in years)'],
    aRegarder: ['The mass hardly changes for most of the life, then plunges at the very end.', 'A black hole of one solar mass (the default) would take about 10^67 years to evaporate; double the mass and it lasts 8 times longer.', 'Today it would not shrink at all: at about 0.00000006 K it is colder than the cosmic microwave background (2.7 K) and absorbs more than it emits.'],
    fin: 'drawn up to 99.99 percent of the lifetime; the very last instant is not drawn',
  },
  tsunami: {
    titre: 'Tsunami crossing an ocean',
    enUnePhrase: 'A film of a tsunami front: rays of the wave fan out across a deep ocean, then slow down, bend and grow on the shallow shelf near the coast.',
    colonnes: ['distance from the source toward the coast (km)', 'sideways position (km)', 'wave height (m; it grows as the water gets shallower)', 'time since the wave started (hours)'],
    aRegarder: ['Over the 4000 m deep ocean the wave travels at about 700 km/h, as fast as a jet airliner, and crosses about 10 000 km in about 14 hours.', 'On the shallow shelf it slows down and grows: 0.5 m in the open ocean becomes about 2.2 m at the coast (Green\'s law).', 'Rays that start at an angle turn to face the coast as the water gets shallower (Snell\'s law).'],
    fin: 'the rays stop at the coast (water 10 m deep)',
  },
  geometrieUnivers: {
    titre: 'Flat, closed or open universe',
    enUnePhrase: 'The same triangle and circle drawn on a sphere, a flat plane and a saddle-like hyperbolic surface: the shape of space changes the geometry.',
    colonnes: ['x for display (the three surfaces are placed side by side; curvature radius 1)', 'y for display (same unit)', 'z for display (same unit)', 'curvature of that surface: +1 sphere, 0 flat plane, -1 hyperbolic'],
    aRegarder: ['The same triangle (three equal sides of 1.2) has angles adding up to more than 180 degrees on the sphere (about 224), exactly 180 on the plane and less on the hyperbolic surface (about 150).', 'A circle of the same radius is shorter on the sphere than on the plane, and longer on the hyperbolic surface.', 'Planck 2018 finds our space flat within its errors.'],
    fin: null,
    objets: (noms) => 'Rows come in three blocks, in this order: ' + noms.join(', ') + '; in each block, half the points are the triangle edges, a quarter the circle and a quarter the surface.',
  },
  tailleEtoiles: {
    titre: 'How big stars really are',
    enUnePhrase: 'The Earth, the Sun and well-known stars drawn as spheres around one centre, at their true relative sizes.',
    colonnes: ['x on the surface of a sphere (solar radii)', 'y (solar radii)', 'z (solar radii)', 'which body: 0 = Earth, 1 = Sun, then the stars in the order of the names'],
    aRegarder: ['All spheres share one centre and one scale: the Earth and the Sun vanish next to the red supergiants.', 'The Sun is about 109 times wider than Earth.', 'Supergiant sizes are very uncertain.'],
    fin: null,
    objets: (noms) => 'Rows come in blocks, one sphere per body, in this order: ' + noms.join(', ') + '.',
  },
  /* ---------- tam-champs-quantiques.js (game81) ---------- */
  champLibre: {
    titre: 'A free quantum field: a travelling wave packet',
    enUnePhrase: 'A film of a bump in a field with mass, on a ring of 256 points: it travels along the ring and slowly spreads out.',
    colonnes: ['lattice site number (the ring has 256 sites, spacing 1; its two ends join up)', 'time (natural units: c = 1, lattice spacing 1; one value per moment)', 'field value phi at that site and moment (natural units)'],
    aRegarder: ['The bump travels at about 0.75 times the speed of light: its group velocity, slower than light because the field has a mass.', 'It slowly widens as it goes: waves of different lengths travel at different speeds (dispersion).', 'This is the field equation treated as a classical wave on a lattice; quantum fluctuations are not included.'],
    fin: null,
  },
  fluctuationsVide: {
    titre: 'The quantum vacuum of a free field',
    enUnePhrase: 'Snapshots of a field in its lowest-energy state, the vacuum: even with nothing in it, the field is never flat.',
    colonnes: ['lattice site number (the ring has 64 sites, spacing 1)', 'sample number (0 to 11: each is an independent random draw, not a time)', 'field value phi at that site in that sample (natural units, hbar = c = 1)'],
    aRegarder: ['Every sample is jagged: the vacuum of a quantum field always jitters.', 'The samples are independent draws from the exact vacuum probability law of a field with mass on 64 points; they are not a film of motion.', 'Averaged over 3000 samples, each wave of the field has the spread quantum theory predicts (variance 1/(2 omega)).'],
    fin: null,
  },
  interactionChamps: {
    titre: 'Two interacting fields (preheating)',
    enUnePhrase: 'A film of a field phi swinging up and down everywhere at once, which pumps energy into a second field chi coupled to it.',
    colonnes: ['position along the line (units of 1 / the phi mass; lattice spacing 0.5, 256 sites)', 'time (units of 1 / the phi mass)', 'phi field value (the oscillating condensate; 1 everywhere at the start)', 'chi field value (tiny random noise at the start, about a millionth)'],
    aRegarder: ['At first phi swings everywhere together while chi looks flat at zero.', 'Waves of chi of one favoured length then grow exponentially, like a swing pumped at the right rhythm (parametric resonance): the growth rate is about 0.125 per unit time, as the Mathieu-equation theory predicts.', 'By the end about 15 percent of the energy has moved into chi. A classical-field approximation of a quantum process, on a 1-D lattice.'],
    fin: null,
  },
  paireSchwinger: {
    titre: 'Pairs torn out of the vacuum (Schwinger effect)',
    enUnePhrase: 'A very strong electric field pulls electron-positron pairs out of empty space; each particle is drawn as its path through space and time.',
    colonnes: ['position along the electric field (natural units: hbar / (m c) of the electron; electrons move toward negative values, positrons toward positive)', 'sideways position where the pair appeared (same units; fixed for each particle)', 'second sideways position (same units; fixed)', 'time (natural units: hbar / (m c^2) of the electron; each path starts when its pair appears)'],
    aRegarder: ['Each pair appears at rest, the electron and the positron already a small distance apart; the field then pushes them apart on curved paths that approach the speed of light.', 'The 40 pairs drawn are an illustrative sample: at the default field (half the critical field, about 6.6 x 10^17 V/m) only about 0.3 pairs would actually be expected in this box and time.', 'The rate is the one-loop Schwinger formula; it is tiny for fields well below the critical field of about 1.3 x 10^18 V/m.'],
    fin: null,
  },
  effetUnruh: {
    titre: 'An accelerated observer sees a warm vacuum (Unruh effect)',
    enUnePhrase: 'An observer who keeps accelerating finds empty space glowing with heat: their path through spacetime, with the energies of the quanta they would detect.',
    colonnes: ['position x (units c^2 / a, a = the acceleration; the path is the hyperbola x^2 - t^2 = 1)', 'time t of a non-accelerating observer (units c / a)', 'energy of one detected quantum (units hbar a / c; drawn at random from a thermal spectrum)', 'proper time on the accelerated observer\'s own clock (units c / a; -3 to 3 by default)'],
    aRegarder: ['The path bends into a hyperbola: the observer speeds up forever but never reaches the speed of light.', 'The heights follow a thermal (Planck) spectrum: the vacuum looks warm to this observer, with an average quantum energy about 2.7 times the temperature.', 'The effect is tiny: 1 m/s^2 gives about 4 x 10^-21 K, and about 2.5 x 10^20 m/s^2 is needed for 1 kelvin.'],
    fin: null,
  },
  couplageCourant: {
    titre: 'Running coupling constants',
    enUnePhrase: 'How strong electromagnetism and the strong nuclear force are, depending on the energy at which you probe them.',
    colonnes: ['log10 of the momentum scale Q (GeV; -4 is 0.1 MeV, 3 is 1000 GeV)', 'one over the coupling strength: 1/alpha for electromagnetism (first half of the rows), 1/alpha_s for the strong force (second half, from 3 GeV up)', 'which force: 0 = electromagnetism, 1 = strong force'],
    aRegarder: ['Electromagnetism gets slightly stronger at high energy: 1/alpha falls from about 137 at low energy to about 133 at the Z boson mass (91 GeV). Only the three charged leptons are counted; quark loops are not computed.', 'The strong force does the opposite (asymptotic freedom): alpha_s is about 0.17 at 10 GeV, 0.118 at 91 GeV and 0.088 at 1000 GeV.', 'Both curves are one-loop approximations; the strong curve starts from the measured value 0.1179 at the Z mass.'],
    fin: null,
    objets: (noms) => 'The two curves, in frame order: ' + noms.join(', ') + '.',
  },
  comptonKleinNishina: {
    titre: 'A photon scattering off an electron (Compton)',
    enUnePhrase: 'Where photons go after bouncing off a free electron: each dot is one possible direction, raised by how much energy the photon kept.',
    colonnes: ['x of the scattered photon\'s direction (unit sphere; the photon came in along z)', 'y of that direction (unit sphere)', 'z of that direction (cosine of the scattering angle: 1 = straight on, -1 = straight back)', 'fraction of its energy the photon keeps (1 when going straight on, lowest when bounced straight back)'],
    aRegarder: ['At the default energy (half the electron rest energy, about 0.26 MeV) about 65 percent of the photons scatter forward; at very low energy the split would be even, 50 percent.', 'A photon bounced straight back keeps only half its energy here: the Compton shift.', 'The total cross-section is about 56 percent of the low-energy Thomson value (Klein-Nishina formula, lowest order of QED).'],
    fin: null,
  },
  atomes: {
    titre: 'Electron clouds of atoms',
    enUnePhrase: 'Where the electrons of an atom can be found, one electron per frame, shell by shell from the innermost out.',
    colonnes: ['x (Bohr radii)', 'y (Bohr radii)', 'z (Bohr radii)', 'which subshell the electron is in: n + l/10 (1 = 1s, 2 = 2s, 2.1 = 2p, 3.2 = 3d)'],
    aRegarder: ['The default atom is iron (26 electrons, 1s2 2s2 2p6 3s2 3p6 4s2 3d6); each frame is the cloud of one electron, filled in Madelung order.', 'Inner electrons feel almost the whole nuclear charge and sit very close (1s: about 0.06 Bohr radii on average); the screened outer 4s electrons spread out to about 6 Bohr radii.', 'Each cloud is a hydrogen-like orbital with an effective charge from Slater\'s rules: an approximation of a many-electron atom, not an exact solution.'],
    fin: null,
    objets: (noms) => 'Frames go electron by electron through these subshells, in this order: ' + noms.join(', ') + '.',
  },
  quarks: {
    titre: 'Quark confinement and string breaking',
    enUnePhrase: 'A film of a charm quark and its antiquark pulled apart: the colour string between them stores more and more energy until it breaks into two mesons.',
    colonnes: ['position along the string between the quark and the antiquark (fm; 1 fm = 10^-15 m)', 'sideways spread of the string (fm; an illustrative width of 0.15 fm, not computed)', 'second sideways spread (fm; same illustrative width)', 'energy stored in the string at that separation (GeV; the Cornell potential V(r), quark masses not included)'],
    aRegarder: ['In every frame but the last the pair is pulled further apart, from 0.2 fm to about 1.2 fm, and the stored energy keeps rising, like a rubber band that never goes slack (confinement).', 'In the last frame the string has broken: its energy was enough to create a new quark pair, so two clusters (two D mesons) remain instead of free quarks.', 'A phenomenological potential model, not lattice QCD; it gives charmonium levels of about 3090 MeV (J/psi) and 3672 MeV (psi(2S)).'],
    fin: 'the string breaks into two D mesons in the last frame',
  },
  /* game88 : les principes du vide qui manquaient (tam-vide-quantique.js) — formules seulement, aucun chiffre publie */
  videComprime: {
    titre: 'Squeezed vacuum',
    enUnePhrase: 'The vacuum of one light mode, squeezed: the unavoidable quantum jitter is pushed out of one direction and into the other, while their product stays at its quantum minimum.',
    colonnes: ['x quadrature (dimensionless, hbar = 1; the ordinary vacuum has variance 1/2)', 'p quadrature (same units)', 'time (each point is an independent sample, turned by the oscillator up to that time)', 'Wigner function W(x, p) at that point (exact formula, between 0 and 1/pi)'],
    aRegarder: ['The cloud is an ellipse, not the round ordinary vacuum: thinner along one direction, wider along the other.', 'The product of the two spreads stays at the minimum quantum theory allows (Delta x Delta p = 1/2): squeezing moves the noise, it does not remove it.', 'A squeezed vacuum is not empty: it holds sinh^2 r photons on average; with time the ellipse turns (the spreads repeat at twice the oscillator frequency).'],
    fin: null,
  },
  casimirDynamique: {
    titre: 'Light made from the vacuum (dynamical Casimir effect)',
    enUnePhrase: 'A cavity mirror shaken at twice the frequency of a light mode turns vacuum jitter into real photons, whose number grows exponentially.',
    colonnes: ['x of a point on the 1-sigma ellipse of the mode (dimensionless quadrature; the vacuum spread is 1/2)', 'p of that point (same units)', 'time (units of 1 / the mode frequency)', 'photons created from the vacuum so far, N(t)'],
    aRegarder: ['At the start the ellipse is the round vacuum: zero photons.', 'Shaking at twice the mode frequency pumps the mode like a swing (parametric resonance): the ellipse stretches and squeezes, and N(t) follows sinh^2(eps omega0 t / 2).', 'The photons are made in pairs out of vacuum fluctuations, not from light already in the cavity. One mode, no losses: a simplified model, a drawing of the formula.'],
    fin: null,
  },
  higgsVide: {
    titre: 'The Higgs vacuum (spontaneous symmetry breaking)',
    enUnePhrase: 'A field released at the top of a "Mexican hat" rolls down and settles somewhere on the circle of lowest energy: the vacuum picks a direction that the laws themselves do not.',
    colonnes: ['real part of the field phi (dimensionless)', 'imaginary part of phi (same units)', 'potential energy V(phi) = -mu^2 |phi|^2 + lambda |phi|^4', 'time (dimensionless)'],
    aRegarder: ['Every point of the circle |phi| = v = mu / sqrt(2 lambda) is an equally good vacuum; another seed (another tiny nudge) settles somewhere else on it.', 'Across the circle the field rings at a frequency set by the curvature: the massive Higgs mode, m_H^2 = 2 mu^2.', 'Along the circle nothing pushes back: the massless Goldstone direction. A classical, uniform field with friction: no quantum fluctuations and no space, a drawing of the formula.'],
    fin: null,
  },
  emissionSpontanee: {
    titre: 'Spontaneous emission: an atom and the vacuum',
    enUnePhrase: 'An excited atom alone in the vacuum still gives off light, because it is coupled to the vacuum modes; the excitation leaks out at the rate Fermi\'s golden rule predicts.',
    colonnes: ['detuning of a vacuum mode from the atom frequency (mode number x spacing, dimensionless)', 'time of the frame', 'population of that mode |c_k|^2 (the chance the photon is in it)', 'probability that the atom is still excited, P_e(t)'],
    aRegarder: ['P_e(t) falls exponentially at Gamma = 2 pi g^2 / spacing (Fermi\'s golden rule).', 'The emitted photon fills the modes with a Lorentzian shape: the natural width of a spectral line.', 'With a finite set of modes the light comes back to the atom at the recurrence time 2 pi / spacing: a revival that a true continuum of modes would never show. One excitation and evenly spaced modes: a simplified model.'],
    fin: null,
  },
  /* game93 : six theories classiques (tam-theories-2.js) — formules seulement, aucun chiffre publie */
  ising2D: {
    titre: 'A magnet on a lattice (2D Ising model)',
    enUnePhrase: 'Tiny magnets on a grid, each pointing up or down, quenched from disorder: below a critical temperature they line up into large domains, above it they stay mixed.',
    colonnes: ['x, column of the lattice (lattice spacing 1)', 'y, row of the lattice (same units)', 'local magnetisation: the mean of the 5 x 5 spins around the site (-1 to 1)', 'the spin itself (+1 up, -1 down)'],
    aRegarder: ['Below the critical temperature Tc = 2 / ln(1 + sqrt 2) (computed in the code, units J = k = 1) the grid splits into big up and down domains; above it, only small speckles.', 'The measured magnetisation is compared with Onsager\'s exact formula M(T) = (1 - sinh(2/T)^-4)^(1/8).', 'A finite grid simulated by Monte Carlo: near Tc the agreement is only statistical, a drawing of the formula.'],
    fin: null,
  },
  lotkaVolterra: {
    titre: 'Predators and prey (Lotka-Volterra)',
    enUnePhrase: 'Prey and predators in a closed loop: more prey feed more predators, more predators eat the prey, and both numbers cycle for ever.',
    colonnes: ['prey density x', 'predator density y (same units)', 'time t'],
    aRegarder: ['The path is a closed loop: the cycle repeats exactly, because H = d x - c ln x + b y - a ln y never changes.', 'Averaged over whole cycles the populations sit exactly at the balance point.', 'Small cycles last 2 pi / sqrt(a c); bigger swings last longer. Turn up "prey crowding" (limited room for prey) and the loop becomes a spiral that winds into the balance point. No age, no chance: a simplified model.'],
    fin: null,
  },
  epidemieSIR: {
    titre: 'How an epidemic runs (SIR model)',
    enUnePhrase: 'A population split into susceptible, infected and recovered people: an outbreak grows, peaks and fades, and never reaches everyone.',
    colonnes: ['susceptible fraction s (population fraction)', 'infected fraction i (same units)', 'recovered fraction r (same units)', 'time (in units of the average time to recover)'],
    aRegarder: ['The outbreak only takes off if R0 times the susceptible fraction is above 1; the infected curve peaks exactly when s falls to 1 / R0.', 'The peak height and the share never infected both follow exact formulas, checked against the simulation.', 'Turn up "immunity fading" and recovered people slowly become susceptible again: the disease comes back in smaller waves and settles at an exact endemic level. Everyone mixes with everyone, no vaccines: a simplified model.'],
    fin: null,
  },
  lentilleGravitationnelle: {
    titre: 'A gravitational lens',
    enUnePhrase: 'A mass bends the light of a small source behind it: we see two distorted images, and a full ring when the source is exactly behind.',
    colonnes: ['image position theta x (in Einstein radii)', 'image position theta y (same units)', 'source position beta x (same units)', 'source position beta y (same units)'],
    aRegarder: ['The two images sit at theta = (beta +- sqrt(beta^2 + 4)) / 2, on either side of the lens.', 'Their total brightness grows as the source lines up: magnification (u^2 + 2) / (u sqrt(u^2 + 4)) for a point source.', 'With beta = 0 the images merge into the Einstein ring. A point mass and a thin lens: a simplified model.'],
    fin: null,
  },
  kuramoto: {
    titre: 'Fireflies falling into step (Kuramoto model)',
    enUnePhrase: 'A film of many oscillators, each with its own natural rhythm, pulling on each other: above a critical coupling a crowd of them ticks together.',
    colonnes: ['cos of the phase (the point runs round the unit circle)', 'sin of the phase (same units)', 'rank of the natural frequency (-1/2 to 1/2)', 'time'],
    aRegarder: ['Below the critical coupling Kc = 2 gamma the points stay spread round the circle; above it they bunch together.', 'How tightly they bunch, r, follows sqrt(1 - Kc / K) for a very large crowd.', 'Oscillators near the middle frequency lock first; the fastest and slowest keep drifting. A finite crowd, so r jitters.'],
    fin: null,
  },
  gibbsFourier: {
    titre: 'Building a square wave from sines (Gibbs phenomenon)',
    enUnePhrase: 'A film of more and more sine waves added up: they rebuild a square wave, but next to each jump a small overshoot never goes away.',
    colonnes: ['x, the angle (radians)', 'the sum of the first N sines, S_N(x)', 'the error, square wave minus S_N (same units)', 'the number of terms N'],
    aRegarder: ['As N grows the curve hugs the square wave, but the peak next to the jump stays about 9 percent of the jump too high: the Gibbs constant (2 / pi) Si(pi), computed in the code.', 'The overshoot only gets narrower, closer to the jump, as N grows.', 'The squared error falls like 1 / N.'],
    fin: null,
  },
  /* game96 : six theories de plus (tam-theories-3.js) — formules seulement */
  rutherford: {
    titre: 'Alpha particles on a nucleus (Rutherford scattering)',
    enUnePhrase: 'A film of charged particles fired past a fixed nucleus that repels them, one frame per impact parameter b: the closer they pass, the harder they are thrown back.',
    colonnes: ['x (units k = mass = 1, nucleus at the origin)', 'y (same units)', 'impact parameter b of this trajectory (a label)', 'time since entering the window'],
    aRegarder: ['The measured deflection follows Rutherford\'s law b = (k / (2E)) cot(theta / 2). Switch on "opposite charges" and the nucleus pulls them round it instead: same law with k = -1, same angle on the other side.', 'Energy and angular momentum stay constant along each path; the closest approach is computed exactly.', 'A point nucleus that does not recoil, classical mechanics: a simplified model.'],
    fin: null,
  },
  logistique: {
    titre: 'Order to chaos (logistic map)',
    enUnePhrase: 'For each growth rate r, the values the rule x -> r x (1 - x) settles on: one value, then 2, 4, 8, then chaos.',
    colonnes: ['growth rate r', 'state x_n (0 to 1)', 'next state x_n+1 (same units)'],
    aRegarder: ['Below r = 3 everything settles on the single value x = 1 - 1/r.', 'The first doublings sit exactly at r = 3 and r = 1 + sqrt 6, both measured and compared.', 'The later doublings crowd together by a nearly constant ratio: it is measured here, not typed in.'],
    fin: null,
  },
  chaleur: {
    titre: 'Heat spreading along a bar (heat equation)',
    enUnePhrase: 'A film of a narrow block of heat on an insulated bar spreading into a bell.',
    colonnes: ['position x along the bar (length units, the middle of the bar)', 'time t', 'temperature u'],
    aRegarder: ['The total heat never changes on insulated walls; with loss to the air k it fades as e^(-k t) while the spread grows just the same.', 'The width grows exactly as sigma^2 = sigma0^2 + 2 D t: faster with a larger diffusion D.', 'The peak approaches the Gaussian bell once the start is much narrower than the spread.'],
    fin: null,
  },
  oscillateurForce: {
    titre: 'A driven spring and resonance (damped driven oscillator)',
    enUnePhrase: 'A mass on a spring, damped and pushed by a periodic force, released from x0: the start dies away and it settles into a steady swing.',
    colonnes: ['displacement x (natural frequency omega0 = 1)', 'velocity v (same units)', 'time t'],
    aRegarder: ['The steady swing is the closed ellipse; its size follows A = F0 / sqrt((omega0^2 - omega^2)^2 + (2 gamma omega)^2).', 'Sweeping the drive frequency finds the resonance peak at sqrt(1 - 2 gamma^2); with strong damping there is no peak.', 'The release point only changes the start: every start ends on the same ellipse.'],
    fin: null,
  },
  brachistochrone: {
    titre: 'The fastest slide (brachistochrone)',
    enUnePhrase: 'A film of three beads sliding without friction from the same start to the same end: on a cycloid, a straight line and a circular arc.',
    colonnes: ['x (length units)', 'height y (the start is at 0)', 'time t since release'],
    aRegarder: ['The cycloid always arrives first, even though it is longer than the straight line.', 'Its time matches sqrt(a / g) theta exactly; the straight line has its own exact time.', 'The arc has no simple formula: its time is only measured.'],
    fin: null,
  },
  galton: {
    titre: 'Balls through pegs (Galton board)',
    enUnePhrase: 'Balls fall through rows of pegs, bouncing left or right at random, and pile up into a bell.',
    colonnes: ['x (peg spacings)', 'height: down the rows along a path, then the pile rising from the floor under the bins', 'index of the ball (a label)'],
    aRegarder: ['The pile follows the binomial law C(L, k) / 2^L, with mean 0 and variance L / 4.', 'With more rows the bell gets wider and smoother: the central limit theorem.', 'A finite number of balls: the match is statistical, and a new seed gives a slightly different pile.'],
    fin: null,
  },
  /* game111 : sciences de la vie (tam-biologie.js) — formules seulement, aucune valeur publiee */
  adnMutations: {
    titre: 'DNA that mutates (Jukes-Cantor model)',
    enUnePhrase: 'The start of a DNA sequence drawn as a double helix, frame by frame, while random copying mistakes change its bases.',
    colonnes: ['x (drawn double helix, not to scale)', 'y (same)', 'position along the sequence (drawn)', 'base: 0 = A, 1 = C, 2 = G, 3 = T (the second strand is the complement: A with T, C with G)', 'time t'],
    aRegarder: ['The share of sites that differ from the ancestor follows 3/4 (1 - e^(-4 mu t / 3)) and never passes 3/4.', 'Real base changes outnumber the differences once a site is hit twice; the distance -3/4 ln(1 - 4p/3) corrects for it.', 'A finite sequence: the match is statistical, and a new seed gives another history.'],
    fin: null,
  },
  dogmeCentral: {
    titre: 'Gene to RNA to protein (the central dogma, one molecule at a time)',
    enUnePhrase: 'Two curves over the last 30 mRNA lifetimes: how many mRNA and how many protein molecules the cell holds, each divided by its exact mean, so 1 is the average.',
    colonnes: ['time t (mRNA lifetimes, the last 30)', 'count divided by its exact mean (1 = the mean)', 'which molecule (0 = mRNA, 1 = protein)'],
    aRegarder: ['The mRNA count jumps one by one around k: Poisson noise, variance equal to the mean.', 'Proteins come in bursts from each mRNA, so their noise is larger: Fano factor 1 + kp / (1 + gp).', 'The means, the noises and the mRNA-protein covariance are compared with exact formulas, with uncertainties measured on the run.'],
    fin: null,
  },
  /* game112 */
  deriveGenetique: {
    titre: 'Genes drifting by chance (Wright-Fisher genetic drift)',
    enUnePhrase: 'The share of one gene variant in small populations, generation after generation, one population per frame.',
    colonnes: ['generation', 'share of the variant (0 = lost, 1 = fixed)', 'population number (a label)'],
    aRegarder: ['Each population wanders by pure chance until the variant is lost or fixed; smaller populations decide faster.', 'On average nothing moves: the mean share stays p0, while the variety 2p(1 - p) fades exactly as (1 - 1/2N)^t.', 'A variant ends up winning in a share p0 of the populations.'],
    fin: null,
  },
  enzyme: {
    titre: 'An enzyme at work (Michaelis-Menten kinetics)',
    enUnePhrase: 'Three curves over the whole reaction: the substrate left, the product made, and the share of the enzyme that is busy.',
    colonnes: ['time t', 'share: substrate left S/S0, product made P/S0, enzyme busy C/E0', 'which curve (0 = substrate, 1 = product, 2 = busy enzyme)'],
    aRegarder: ['Total enzyme and total matter stay constant at every step.', 'The rate follows Vmax S / (Km + S) only when there is little enzyme: the error scale E0 / (S0 + Km) is shown.', 'Raise the enzyme and the complex takes up substrate before the law can hold: the formula visibly fails.'],
    fin: null,
  },
  /* game114 */
  mendel: {
    titre: 'The laws of Mendel (a cross of two double hybrids)',
    enUnePhrase: 'Each offspring of two AaBb parents placed on the grid of its genotype: copies of A across, copies of B up.',
    colonnes: ['copies of the dominant allele A (0, 1, 2)', 'copies of the dominant allele B (0, 1, 2)', 'offspring number (a label)'],
    aRegarder: ['The middle cell (AaBb, like the parents) holds a quarter of the offspring; each gene splits 1 : 2 : 1.', 'Counted by traits, independent genes give 9 : 3 : 3 : 1.', 'Lower the recombination rate: the genes travel together and the corner cells AAbb, aaBB empty out.'],
    fin: null,
  },
  neurone: {
    titre: 'A neuron that fires (integrate-and-fire)',
    enUnePhrase: 'The membrane potential of a model neuron for seven input currents, one per frame: it charges, fires at 1, resets.',
    colonnes: ['time t', 'membrane potential v (rest 0, threshold 1)', 'input current I of the frame'],
    aRegarder: ['Below the threshold current 1 the potential creeps up to v = I and never fires.', 'Above it the neuron fires every t_ref + tau ln(I / (I - 1)): exact, compared frame by frame.', 'More current, faster firing, but never faster than one spike per refractory time.'],
    fin: null,
  },
  /* game146 */
  kapitza: {
    titre: 'The pendulum of Kapitza (standing upside down)',
    enUnePhrase: 'A pendulum turned upside down on a pivot shaken up and down twenty times a second: its tilt, its speed and the time.',
    colonnes: ['tilt from the upright theta (degrees)', 'angular speed', 'time t'],
    aRegarder: ['It does not fall: the tilt rocks slowly from side to side around the top, and every shake adds a small shiver.', 'Shake harder and it rocks faster; the slow rhythm matches the linear Floquet theory, and the classical Kapitza formula falls behind as the shaking grows.', 'Too weak a shake and it falls; too strong a shake and it falls again, although the Kapitza formula still says it should stand.'],
    fin: null,
  },
  /* game145 */
  penduleRessort: {
    titre: 'A pendulum on a spring (the 2 : 1 resonance)',
    enUnePhrase: 'Where a weight on a spring goes when it is let go stretched straight down, with the faintest push sideways.',
    colonnes: ['x (sideways)', 'height y (the pivot is at 0)', 'time t'],
    aRegarder: ['At first the weight only bounces up and down: the sideways push is a millionth of the bounce.', 'When the bounce is exactly twice as fast as the swing, the push grows every bounce until the weight swings instead of bouncing, then hands the energy back.', 'Move the ratio away from 2 (try 2.5): the push never grows and the weight bounces for ever.'],
    fin: null,
  },
  /* game144 */
  toupie: {
    titre: 'A spinning top (nutation and precession)',
    enUnePhrase: 'How far the axis of a spinning top has turned around the vertical and how tilted it is, over time: let go tilted, then launched in steady precession.',
    colonnes: ['angle turned around the vertical phi (radians)', 'tilt of the axis theta (degrees)', 'time t'],
    aRegarder: ['Let go from rest, the axis first falls, then the spin swings it sideways: the curve makes a cusp each time it comes back up, where it stops turning for an instant.', 'Spin faster: the dips get smaller and quicker, and the slow turn around the vertical gets slower, about M g l / (I3 omega3).', 'The straight line is the same top launched at the exact steady rate: no dip at all, the tilt stays put.'],
    fin: null,
  },
  /* game143 */
  dzhanibekov: {
    titre: 'The tumbling racket (Dzhanibekov effect)',
    enUnePhrase: 'The spin of a free body, seen from the body itself, thrown about the middle one of its three axes, then about the other two.',
    colonnes: ['spin about axis 1 (least inertia)', 'spin about axis 2 (the middle one)', 'spin about axis 3 (most inertia)'],
    aRegarder: ['The big loop is the middle-axis spin: it runs from one pole to the opposite one and back, the body turning over each time.', 'The two small loops are spins about the other two axes, thrown with the same tiny wobble: it never grows.', 'Make the wobble ten times smaller: the turn-over comes later, but only by a fixed step, the logarithm of the wobble.'],
    fin: null,
  },
  /* game142 */
  perleCerceau: {
    titre: 'A bead on a spinning hoop (a pitchfork)',
    enUnePhrase: 'How a bead on a spinning hoop moves and where it comes to rest, run at many spins, drawn as spin, angle and time.',
    colonnes: ['spin omega (units of sqrt(g / R))', 'angle theta of the bead from the bottom (radians)', 'time t'],
    aRegarder: ['At slow spins every path dies out at angle zero: the bead returns to the bottom.', 'Past the critical spin the paths settle away from zero, half on one side and half on the other: one rest place has split into two.', 'The rest angle follows cos theta = 1 / omega^2 exactly; more friction only makes the bead settle sooner, not elsewhere.'],
    fin: null,
  },
  /* game141 */
  echelleGlisse: {
    titre: 'A ladder sliding down a wall',
    enUnePhrase: 'A ladder let go against a smooth wall, drawn at several instants until its top leaves the wall, with the path of its middle.',
    colonnes: ['x (the wall is x = 0)', 'height y (the floor is y = 0)', 'time t'],
    aRegarder: ['The middle of the ladder moves on a quarter circle around the corner while both ends touch.', 'The top leaves the wall at two thirds of its starting height, whether the ladder started nearly upright or already low.', 'The push of the wall is never put in: it is read from how the middle speeds up sideways, and it fades to zero exactly there.'],
    fin: null,
  },
  /* game140 */
  chainette: {
    titre: 'A hanging chain (the catenary)',
    enUnePhrase: 'A chain of rigid links hanging from two hooks, its shape found by letting it sink as low as the links allow, drawn beside the continuous catenary.',
    colonnes: ['x (the chain hangs from -1 to 1)', 'height y', 'curve (0 = links found, 1 = continuous catenary)'],
    aRegarder: ['The links are steepest at the hooks and flat in the middle: from one link to the next the slope changes by the same step.', 'Add links and the chain closes in on the smooth catenary a cosh(x / a), not on a parabola of the same length.', 'Make the chain longer than the span: it sags deeper, and the catenary and the parabola drift further apart.'],
    fin: null,
  },
  /* game139 */
  tautochrone: {
    titre: 'The cycloid where every ball arrives together (tautochrone)',
    enUnePhrase: 'Balls let go at the same moment from different heights on an upside-down cycloid: how far each one is from the bottom, along the curve, as time goes on.',
    colonnes: ['time t', 'distance s along the curve from the bottom', 'ball (1 = released lowest)'],
    aRegarder: ['Every curve crosses zero at the same instant: low or high, every ball reaches the bottom together, at t = pi.', 'The curves are pure sine waves of one period, 4 pi: along the cycloid the swing is exactly harmonic.', 'Raise the highest release towards 170 degrees: the balls still arrive together, while a pendulum on a circle released as high (the witness) falls behind.'],
    fin: null,
  },
  /* game138 */
  pendulesCouples: {
    titre: 'Two pendulums joined by a spring',
    enUnePhrase: 'The swing of two pendulums joined by a spring: the first one started, the motion passes to the second and back.',
    colonnes: ['time t', 'swing x', 'pendulum (0 = first, 1 = second)'],
    aRegarder: ['One pendulum slows to a stop while the other one swings fully, then the other way round: the energy is handed over.', 'The hand-over takes pi / (sqrt(1 + 2 k) - 1): weaken the spring and it takes longer.', 'Start the second one at the same swing (start = 1): nothing passes across, they swing together for ever.'],
    fin: null,
  },
  /* game137 */
  anneauxNewton: {
    titre: 'Newton\'s rings',
    enUnePhrase: 'Light reflected by a curved lens lying on flat glass, seen from above: bright and dark rings.',
    colonnes: ['x (mm)', 'y (mm)', 'reflected intensity (0 dark, 1 bright)'],
    aRegarder: ['The centre is dark where the lens touches the glass: one of the two reflections flips the wave.', 'The rings crowd together outwards: their squared radii grow by the same step, lambda R.', 'Move the wavelength from blue to red: the rings widen. Lift the lens a little: the rings slide inwards and disappear at the centre.'],
    fin: null,
  },
  /* game136 */
  desintegration: {
    titre: 'Radioactive decay, atom by atom',
    enUnePhrase: 'How many atoms are left at each step when every one of them decays by chance, counted and compared with N0 2^(-t/T).',
    colonnes: ['time (steps)', 'atoms left', 'curve (0 = counted, 1 = formula)'],
    aRegarder: ['No atom knows when it will decay, yet the count halves every half-life: the exponential comes out of chance alone.', 'The counted curve is a staircase that wanders a little around the smooth formula: fewer atoms, bigger wanderings.', 'Change the seed: the staircase changes, the half-life measured stays within a few standard deviations of T.'],
    fin: null,
  },
  /* game135 */
  refractionSnell: {
    titre: 'Light bending into water (Fermat and the Snell window)',
    enUnePhrase: 'Rays from a point under water to targets in the air, each one the fastest path; steeper rays reflected back.',
    colonnes: ['x (the surface is y = 0)', 'height y (water below, air above)', 'ray number'],
    aRegarder: ['Each ray bends at the surface: it is the path that takes the least TIME, light being slower in water.', 'Under water the rays crowd into a cone of half-angle asin(1 / n): the whole sky seen through a window (48.8 degrees for n = 1.33 by the formula).', 'Rays steeper than that never get out: they are reflected back down.'],
    fin: null,
  },
  /* game134 */
  reseauFentes: {
    titre: 'Light through many slits (a diffraction grating)',
    enUnePhrase: 'Brightness seen in each direction behind 2 slits, a middle number, and N slits, the waves summed slit by slit.',
    colonnes: ['sin theta (direction seen)', 'intensity I / N^2', 'number of slits N'],
    aRegarder: ['The bright orders do not move when slits are added: they stay where d sin theta = m lambda.', 'More slits, sharper orders: that is why a grating splits colours so finely.', 'Between two orders, count the dark fringes: N - 1; and the small bumps: N - 2.'],
    fin: null,
  },
  /* game133 */
  corpsNoir: {
    titre: 'The glow of hot bodies (Planck\'s law)',
    enUnePhrase: 'How much light a body gives off at each wavelength, one curve per temperature (Planck\'s law).',
    colonnes: ['wavelength lambda (units of h c / (k T0))', 'spectral radiance B', 'curve (0 = coolest, T = 1)'],
    aRegarder: ['Hotter bodies peak at shorter wavelengths: lambda_max T is the same for every curve (Wien).', 'The area under a curve grows as T to the fourth power: the hottest curve dwarfs the others (Stefan-Boltzmann).', 'At long wavelengths every curve falls slowly; at short ones it drops to nothing: no ultraviolet catastrophe.'],
    fin: null,
  },
  /* game127 */
  dureeJour: {
    titre: 'How long the day lasts through the year',
    enUnePhrase: 'Hours of daylight on each day of the year at the latitude chosen, counted and computed.',
    colonnes: ['day of the year (0 = equinox)', 'hours of daylight', 'curve (0 = counted, 1 = formula)'],
    aRegarder: ['At the equator every day lasts 12 hours, whatever the tilt.', 'Further from the equator the swing grows; past the polar circle the curve touches 24 hours (midnight sun) and 0 (polar night).', 'The two curves lie on top of each other: counting minute by minute and the formula cos H0 = -tan(latitude) tan(declination) agree.'],
    fin: null,
  },
  courseRoulante: {
    titre: 'The rolling race (sphere, cylinder, ring)',
    enUnePhrase: 'Distance down a slope against time for a block, a sphere, a cylinder and a ring let go together.',
    colonnes: ['time t', 'distance down the slope', 'body (0 block, 1 sphere, 2 cylinder, 3 ring)'],
    aRegarder: ['The sphere always beats the cylinder, which beats the ring: spinning takes a share of the energy (k = 2/5, 1/2, 1).', 'Without friction nothing rolls: all four slide and arrive together.', 'Below the friction k/(1 + k) tan theta a body slides instead of rolling and part of the energy becomes heat.'],
    fin: null,
  },
  /* game126 */
  penduleAmplitude: {
    titre: 'A pendulum swinging high (the exact period)',
    enUnePhrase: 'Loops of angle against speed for a pendulum released from six angles, the largest one chosen.',
    colonnes: ['angle theta (radians)', 'angular speed', 'time t'],
    aRegarder: ['Small swings are ellipses and take 2 pi; wide swings flatten at the ends and take longer.', 'The period is exactly 2 pi / AGM(1, cos(theta0/2)), the arithmetic-geometric mean of Gauss.', 'Close to 180 degrees the pendulum lingers at the top and the period grows without bound.'],
    fin: null,
  },
  phasesLune: {
    titre: 'The phases of the Moon',
    enUnePhrase: 'The lit part of the Moon as seen from the Earth, frame by frame from full Moon.',
    colonnes: ['x on the disc', 'y on the disc', 'phase angle in degrees (0 = full Moon)'],
    aRegarder: ['The edge between light and dark is half an ellipse: the Moon is a ball lit from one side.', 'The lit share is exactly (1 + cos phi) / 2: half at the quarters.', 'Nothing hides the Moon: the phases are only the angle between the Sun and us.'],
    fin: null,
  },
  /* game125 */
  carnot: {
    titre: 'The Carnot cycle (the best possible engine)',
    enUnePhrase: 'One Carnot cycle of an ideal gas drawn in the (volume, pressure) plane.',
    colonnes: ['volume V', 'pressure P', 'leg of the cycle (0 hot expansion, 1 cooling, 2 cold compression, 3 heating)'],
    aRegarder: ['The area inside the loop is the work the engine gives in one cycle.', 'Work divided by the heat taken in is exactly 1 - Tc/Th.', 'Change the gas (degrees of freedom): the loop changes shape, the efficiency does not.'],
    fin: null,
  },
  montyHall: {
    titre: 'The Monty Hall problem',
    enUnePhrase: 'Two curves: the share of games won so far by sticking with the first door, and by switching.',
    colonnes: ['games played', 'share of games won so far', 'strategy (0 = stick, 1 = switch)'],
    aRegarder: ['With three doors, switching wins two games in three; sticking, one in three.', 'With n doors: switching (n - 1)/(n (n - 2)), sticking 1/n; switching always wins more.', 'Early on the curves wander; they settle as the games add up.'],
    fin: null,
  },
  lentilleMince: {
    titre: 'A thin lens forms an image',
    enUnePhrase: 'Nine rays from one point of an object, through a lens of focal length 1, meeting again at the image.',
    colonnes: ['x along the axis (lens at 0)', 'height y', 'ray number (a label)'],
    aRegarder: ['All rays meet at one point, at 1/do + 1/di = 1/f.', 'The image is upside down, magnified by -di/do.', 'Inside the focal length the rays spread: a virtual image appears in front of the lens (a magnifying glass).'],
    fin: null,
  },
  /* game124 */
  paraboleTir: {
    titre: 'The best angle to throw (projectiles and the safety parabola)',
    enUnePhrase: 'Stones thrown at the same speed under every angle from a height h, and the parabola that bounds them all.',
    colonnes: ['distance x', 'height y', 'launch angle in degrees (a label; 0 = the safety parabola)'],
    aRegarder: ['From the ground the longest throw is at 45 degrees.', 'From higher up the best angle is flatter: atan(1 / sqrt(1 + 2 h)).', 'No path crosses the safety parabola; each touches it once.'],
    fin: null,
  },
  solidesPlatoniques: {
    titre: 'The five Platonic solids',
    enUnePhrase: 'One of the five regular solids, drawn by its edges in 3-D.',
    colonnes: ['x', 'y', 'z'],
    aRegarder: ['Count them: vertices - edges + faces = 2, for every solid (Euler).', 'The cube and the octahedron swap faces and vertices; so do the dodecahedron and the icosahedron.', 'The angle between two faces is exact: sin(theta / 2) = cos(pi / q) / sin(pi / p).'],
    fin: null,
  },
  /* game123 : mecanique (tam-mecanique.js) */
  billardPi: {
    titre: 'Colliding blocks that count pi',
    enUnePhrase: 'The state of two blocks after each collision, drawn in a plane where kinetic energy is a circle.',
    colonnes: ['sqrt(M) times the big block speed', 'sqrt(m) times the small block speed', 'collision number (a label)'],
    aRegarder: ['Every state sits on one circle: the energy never changes.', 'Each pair of collisions turns the state by the same small angle 2 theta.', 'Count the collisions: 3, 31, 314, 3141... the digits of pi.'],
    fin: null,
  },
  modesNormaux: {
    titre: 'Normal modes of a chain of springs',
    enUnePhrase: 'A chain of masses on springs swinging in one of its normal modes, frame by frame over one period.',
    colonnes: ['mass number along the chain (the ends are fixed)', 'displacement', 'time t'],
    aRegarder: ['Every mass swings in step: the shape keeps its nodes and only grows and shrinks.', 'The period is exactly 2 pi / omega_j with omega_j = 2 sin(j pi / (2 (N + 1))).', 'Higher modes have more nodes and swing faster.'],
    fin: null,
  },
  /* game122 : electricite (tam-electricite.js) et Pascal */
  lignesChamp: {
    titre: 'Field lines of two charges',
    enUnePhrase: 'Electric field lines leaving a positive charge (left) and landing on a negative one (right), or escaping.',
    colonnes: ['x (charges at -1 and +1)', 'y', 'field line number (a label)'],
    aRegarder: ['Each line lands at the angle set by the flux: q1 theta = |q2| phi, exactly.', 'Make the negative charge weaker: lines run out of room on it and escape to infinity.', 'Equal and opposite charges: in 2-D every line is a circle through both.'],
    fin: null,
  },
  circuitRC: {
    titre: 'Charging a capacitor (RC circuit)',
    enUnePhrase: 'Two curves: the capacitor voltage and the current, while it charges (t < 6) then discharges.',
    colonnes: ['time t (charge until 6, then discharge)', 'voltage V (curve 0) or R times current (curve 1)', 'which curve (0 = voltage, 1 = current)'],
    aRegarder: ['The voltage climbs as 1 - e^(-t/tau): two thirds of the way after one tau.', 'The resistor turns into heat exactly as much energy as the capacitor keeps: half of what the battery gives, for a full charge.', 'A large tau is too slow to finish by t = 6: then less than half is lost.'],
    fin: null,
  },
  /* game300 (idea: codex "human brain", Claude sub-agent) */
  attentionCattell: {
    titre: 'Cattell: attention and distraction',
    enUnePhrase: 'Doing sums in your head slows a simple reaction by a few hundredths of a second; trying hard barely speeds it up.',
    colonnes: ['attention: concentrated, normal, distracted', 'reaction time (ms)', 'single series, printed means, Table VIII'],
    aRegarder: ['The distracted column sits highest for every light, shock and sound.', 'Concentrated and normal are close; for C under electric light, concentrated is higher.', 'Table VIII is the same gaps, with normal set to zero.'],
    fin: null,
  },
  /* game301 (idea: codex "human brain", Claude sub-agent) */
  pressurePeirceJastrow: {
    titre: 'Peirce and Jastrow: differences too small to notice',
    enUnePhrase: 'Even a difference you are not aware of feeling is judged right more often than by chance, and errors follow the normal law.',
    colonnes: ['(ratio of pressures - 1) x 10', 'errors in 50, scaled to 1', 'single sets, printed means, curve'],
    aRegarder: ['The points fall as the difference grows, close to the curve.', 'The second group sits lower: practice made the finger finer.', 'At the far left, the errors stay below one half.'],
    fin: null,
  },
  /* game302 (idea: codex "human brain", Claude sub-agent) */
  extinctionPavlov: {
    titre: 'Pavlov: a learnt response fades, then returns',
    enUnePhrase: 'A signal that stops being followed by food loses its effect, faster when it is repeated close together, but the response comes back after a rest.',
    colonnes: ['minutes since the first showing', 'saliva in one minute', 'series'],
    aRegarder: ['Each series falls toward zero, with small rises on the way.', 'The 16-minute series is still above zero after two hours.', 'The two 2-minute series, the same day, took 15 and 18 minutes.'],
    fin: null,
  },
  /* game303 (idea: codex "human brain", Claude sub-agent) */
  weberKonig: {
    titre: 'Konig and Brodhun: the smallest change of brightness we see',
    enUnePhrase: 'In ordinary light we notice a change of about one and a half percent; in dim light the change must be far larger.',
    colonnes: ['brightness (log scale)', 'smallest visible change / brightness (log scale)', 'table'],
    aRegarder: ['A flat floor in the middle: Weber law holds there.', 'The points climb steeply toward the dark end.', 'At 605, the brightest fields need a larger step again.'],
    fin: null,
  },
  /* game304 (idea: codex "human brain", Claude sub-agent) */
  glycosuriaCannon: {
    titre: 'Cannon: excitement and sugar in the urine',
    enUnePhrase: 'After fear, rage or a big examination, the body releases sugar; calm, cold and the removal of the adrenal glands do not.',
    colonnes: ['group', 'share with sugar in the urine', 'cats, people, controls'],
    aRegarder: ['The cat bars reach the top: every excited cat.', 'People: fewer, but never none, after an examination or a match.', 'The control bars stay at zero.'],
    fin: null,
  },
  /* game305 (idea: codex "human brain", Claude sub-agent) */
  brainBoyd: {
    titre: 'Boyd: the weight of the brain through life',
    enUnePhrase: 'The brain grows fast in childhood, is heaviest in the late teens, then slowly gets lighter; it says nothing about what anyone can do.',
    colonnes: ['period of life', 'weight of the brain (oz.)', 'men, women, sum of the parts'],
    aRegarder: ['A steep climb over the first years.', 'A top at 14 to 20, then a slow slope down.', 'The sum of the parts strays from the total where parts were weighed on fewer people.'],
    fin: null,
  },
  /* game306 (idea: codex "human brain", Claude sub-agent) */
  allOrNoneLucas: {
    titre: 'Keith Lucas: all or none',
    enUnePhrase: 'A muscle driven by a few nerve fibres steps up in jumps as the stimulus grows: each fibre fires fully or not at all.',
    colonnes: ['stimulus strength (coil distance, reversed)', 'contraction (mm on the record)', 'observations, steps, straight line'],
    aRegarder: ['Two flat steps, then a slow creep near the top.', 'The jumps between them are sudden.', 'The straight line misses the steps badly.'],
    fin: null,
  },
  /* game307 (idea: Phil, other forms of the brain) */
  neuronsHerculanoHouzel: {
    titre: 'Herculano-Houzel: how primate brains add neurons',
    enUnePhrase: 'In primates, ten times more neurons make a brain about ten times heavier; in rodents the same gain makes it far heavier.',
    colonnes: ['neurons (log scale)', 'brain mass (log scale)', 'species, primate line, rodent power'],
    aRegarder: ['The seven species sit on one straight line.', 'Its slope is close to one: mass follows neurons.', 'The rodent line climbs much more steeply.'],
    fin: null,
  },
  /* game308 (idea: Phil, other forms of the brain) */
  connectomeSizes: {
    titre: 'Mapped brains: worm, fly, and the human count',
    enUnePhrase: 'Three nervous systems have been mapped synapse by synapse; the largest, a fly, has fewer than two millionths of the human neuron count.',
    colonnes: ['neurons (log scale)', 'synapses (log scale)', 'organism'],
    aRegarder: ['Each map holds hundreds of times more than the one before.', 'The fly makes hundreds of synapses per neuron, the worm about seventeen.', 'The human point stands far to the right, with no synapse count: it has never been mapped.'],
    fin: null,
  },
  /* game309 (idea: Phil, emotions as impulses from measured open data) */
  emotionsSiegel: {
    titre: 'Siegel: the body in six emotions, as impulses',
    enUnePhrase: 'Seven body signals fire faster where people\'s heart, blood pressure, breathing or skin changed more in an emotion; the changes overlap so much that a classifier sorted only 31.5 % of cases.',
    colonnes: ['time (our 120 steps)', 'body signal: heart rate and its variability, diastolic and systolic pressure, breathing rate, skin conductance level and response', 'heart, blood pressure, breathing or skin'],
    aRegarder: ['Measured: the mean change d of each signal in each emotion (Table 9). Ours: a 15 % firing chance per step, times 1 + d.', 'Switch from anger to fear: breathing leads in both.', 'With the spread on, units cover the printed 95 % interval: the emotions overlap.'],
    fin: null,
  },
  /* game310 (idea: Phil, emotions as impulses from measured open data) */
  bodyMapsNummenmaa: {
    titre: 'Nummenmaa: naming an emotion from a body map',
    enUnePhrase: 'Shown where other people felt their body change, readers named the emotion 46 % of the time where guessing gives 14 %: neutral almost always, fear almost never.',
    colonnes: ['answer', 'shown emotion and reader', 'right or wrong'],
    aRegarder: ['Measured: the share of readers right for each map. Ours: 87 simulated readers per map, wrong answers spread evenly.', 'Neutral fills its own column; fear scatters everywhere.', 'Set the slider to 1 to see blind guessers.'],
    fin: null,
  },
  /* game311 / game315 / game316 (Phil: "the legend is still false"): it says exactly what is drawn, every number read from human-brain-data.js
   *   (the same numbers the subject draws; test-tam-cerveau-lignes-20261108.mjs checks them against the subject's invariants) */
  emotionWiringHCP: {
    titre: (P) => 'Wired brain: ' + HB.selectEmotion(P).emotion.name,
    enUnePhrase: (P) => { const { pack, emotion: e } = HB.selectEmotion(P), th = HB.THEORIES[Math.max(0, Math.min(HB.THEORIES.length - 1, Math.round(Number(P.theoryWiring)) || 0))];
      return e.name + ' (' + pack.name + '): ' + e.regions.length + ' regions reported by ' + e.source.short + ' (' + e.source.design + ', ' + e.source.n + '); ' + e.shared.length + ' of them also reported for another emotion of this pack.' + (th.id === 'data' ? '' : ' ' + th.name + ', not data: ' + th.statement); },
    colonnes: ['front to back of the real brain (mm / 100)', 'bottom to top (mm / 100)', 'left to right (mm / 100)'],
    /* game311 (Phil: "always the same false legend"): the generic sentence named a column per colour, true of the code but not a brain fact */
    /* 2026-11-09 (Phil: "parts of the brain, readable by people who don't understand"): the dots wear the colour of their brain PART
     *   (human-brain-parts.js, the same colours as the brain map); pointColours = the key the tab draws as swatches, = o.pointPalette */
    couleurs: 'Lines: grey-blue = a measured link (fainter = weaker), violet = a pathway named in studies. Points: the white labelled ones are the regions of the emotion shown, and the left amygdala always (with the emotions it serves); '
      + 'every other dot wears the colour of the brain part it belongs to (key below). The faint surface dots take the part of the nearest region centre on the same side: our approximation, the true borders between parts are not stored here. '
      + 'A firing dot between two regions wears the colour of the part it left. Which part does what is a textbook summary, not measured here.',
    pointColours: () => pointPalette(),
    aRegarder: (P) => { const { emotion: e, other } = HB.selectEmotion(P), K = HB.COUNTS, nm = (id) => HB.REGIONS.find((r) => r.id === id).name.toLowerCase();
      const net = Math.round(Number(P.networkWiring)) === 1, res = Math.round(Number(P.resolutionWiring)) === 1, K4 = HB.COUNTS_400, nDeep = K.regions - K.hcpRegions;
      const nPath = res ? HB.DEEP_LINKS.filter(([, j]) => j >= K.hcpRegions || HB.parcelFor(HB.REGIONS[j].id) >= 0).length : HB.DEEP_LINKS.length, lost = res ? HB.lostAt400(e.regions) : [];
      return ['Its regions (our mapping of the areas its source prints): ' + (e.regions.length ? e.regions.map(nm).join(', ') : 'none among these parts') + '. Shared within this pack: ' + (e.shared.length ? e.shared.map(nm).join(', ') : 'none') + (other ? '; with ' + other.name.toLowerCase() + ': ' + e.regions.filter((r) => other.regions.includes(r)).length + ' regions' : '') + '.',
        'Drawn: lines = the ' + (net ? (res ? K4.functionKept : K.functionKept).toLocaleString('en-US') + ' strongest couplings at rest' : (res ? K4.wiringNonzero : K.wiringNonzero).toLocaleString('en-US') + ' connections measured by tractography') + ' in ' + K.subjects + ' adults, opacity = strength, plus ' + nPath + ' violet pathways named in studies (no strength measured); points = the ' + (res ? K4.regions + ' parcels (Schaefer-400 by network, and 14 subcortical)' : K.hcpRegions + ' regions') + ' at their real places (fsaverage5 surface), the ' + nDeep + ' deep parts, a faint outline of the cortex and deep structures, then the firing events' + (res ? '; an emotion lights the parcels whose larger part lies in a reported region (our rule)' + (lost.length ? ', none for ' + lost.length + ' of its regions' : '') : '') + '.',
        'Measured: ' + e.measured + '. Ours: ' + e.ours + ', and the places of ' + Object.values(HB.POS3D_SOURCE).filter((x) => x.startsWith('our placement')).length + ' deep parts. Over all packs ' + HB.SHARED.shared + ' of ' + HB.SHARED.mapped + ' mapped regions serve two or more emotions, ' + HB.SHARED.single + ' serve one.']; },
    fin: null,
  },
  /* nerveHelmholtz (2026-11-14; idea: codex "human brain", Claude sub-agent): a frog nerve, never a human one; probable errors, not standard deviations */
  nerveHelmholtz: {
    titre: 'Helmholtz: the speed of the nerve signal',
    enUnePhrase: 'In 1850 Helmholtz stimulated a frog nerve far from the muscle and near it: the far stimulus made the muscle twitch later, so the nerve signal takes time, about 25 to 38 metres a second here. Length over delay gives back his printed speeds to the tenth for 6 of 8 series, within a tenth for the other two.',
    colonnes: ['series in the order printed, then the 1852 record', 'speed of the nerve signal (m/s)', 'computed, probable-error bar, printed, or printed mean'],
    aRegarder: ['The bars are his probable errors (an even chance that the true value lies inside), not standard deviations.', 'His least-squares 26.4 for series IX to XI is not reproduced here: weighting by one over the error squared gives 26.15. His 27.0 for XII to XIV is.', 'A frog nerve at 11 to 21 degrees C, not a human one: it shows that the signal takes time, not how fast people think.'],
    fin: null,
  },
  /* riskBernoulli (2026-11-14; idea: codex "human brain", Claude sub-agent): a rule and its author's worked examples, never a measurement of people */
  riskBernoulli: {
    titre: 'Bernoulli: the value of a risk, by the logarithm',
    enUnePhrase: 'Daniel Bernoulli\'s 1738 rule, the logarithm of the whole fortune, computed again: his printed examples come back within one unit. They are his own calculations, not a record of how people decide.',
    colonnes: ['what varies: fortune, premium, ships or stake', 'what the rule gives', 'log rule, square root, expected value, or printed'],
    aRegarder: ['The printed points sit on the log curve, not on the square-root one.', 'Slider 0: with no fortune the game is worth exactly 2 ducats; the plain expected value has no curve, it grows without end.', 'Slider 1: by his rule Caius gains by insuring below about 5043 roubles; by the expected value, never.'],
    fin: null,
  },
  /* game299 (idee : codex « cerveau humain », sous-agent Claude) */
  reactionDonders: {
    titre: 'Donders: timing a decision',
    enUnePhrase: 'Repeating a sound you expect is fast; having to recognise it and pick your answer adds about a twelfth of a second.',
    colonnes: ['method a, c or b', 'reaction time (ms)', 'roll means, single trials, overall'],
    aRegarder: ['Method b sits highest in every roll.', 'Method c, one answer only, falls in between.', 'Single trials of roll XVI B scatter around their mean.'],
    fin: null,
  },
  /* game297 (idee : codex « cerveau humain », sous-agent Claude) */
  essaisThorndike: {
    titre: 'Thorndike: learning by trial and error',
    enUnePhrase: 'The cat gets faster at escaping, but by fits and starts, not in one flash of insight.',
    colonnes: ['trial', 'time to escape (log)', 'his times, moving average or power law'],
    aRegarder: ['The third trial is slower than the second.', 'A longer average smooths the steps into one slide.', 'From trial 14 on, almost every escape takes 10 s or less.'],
    fin: null,
  },
  /* game292 (idee : codex 31, sous-agent Claude) */
  penduleKater: {
    titre: 'Kater: the shape of the Earth from one pendulum',
    enUnePhrase: 'Further north the same pendulum swings faster, because the flattened Earth pulls harder near the pole.',
    colonnes: ['sine of latitude squared', 'length of the seconds pendulum', 'stations, fitted line, homogeneous Earth'],
    aRegarder: ['The seven stations sit close to one line.', 'The homogeneous Earth line is flatter.', 'Leave out Clifton or Arbury Hill and the flattening moves.'],
    fin: null,
  },
  /* game290 (idee : codex 31, sous-agent Claude) */
  jaugesHerschel: {
    titre: 'Herschel: sounding the depth of the Milky Way',
    enUnePhrase: 'Eight times more stars in the eyepiece means the Milky Way runs twice as deep in that direction.',
    colonnes: ['stars in the field', 'depth (distances of Sirius)', 'table, 15 minute field or yours'],
    aRegarder: ['At 15 minutes your curve lies on his table.', 'A wider field makes every depth shallower.', 'The two nebulosity rows sit far to the right.'],
    fin: null,
  },
  /* game289 (idee : codex 31, sous-agent Claude) */
  constantesPlanck: {
    titre: 'Planck: the first values of h and k',
    enUnePhrase: 'Two measurements of glowing bodies were enough for Planck to weigh the quantum.',
    colonnes: ['frequency over temperature', 'energy', 'Planck, Wien or your h and k'],
    aRegarder: ['At 0.294 both bars reach half height: his printed h and k.', 'h moves four times faster than the peak you set.', 'The two laws only part at low frequency.'],
    fin: null,
  },
  /* game288 (idee : codex 31, sous-agent Claude) */
  reststrahlenRubens: {
    titre: 'Rubens and Kurlbaum: Planck wins at long wavelengths',
    enUnePhrase: 'Heat a black body and measure its long infrared glow: only the new law of Planck follows the readings.',
    colonnes: ['temperature', 'energy received', 'readings, printed law or its formula'],
    aRegarder: ['At 4 (Planck) the law runs through the readings.', 'At 0 (Wien) it flattens out far too early.', 'Below room temperature the readings go negative: the body is colder than the detector.'],
    fin: null,
  },
  /* game287 (idee : codex 31, sous-agent Claude) */
  etherMichelson: {
    titre: 'Michelson and Morley: no ether wind',
    enUnePhrase: 'Light should have been slowed by the Earth\'s motion through the ether, and it was not.',
    colonnes: ['mark of the turn', 'fringe position', 'noon, evening or expected'],
    aRegarder: ['At 1 the expected wave dwarfs both readings.', 'Near 0.2 it shrinks to their size.', 'The readings drift over a turn more than they wave.'],
    fin: null,
  },
  /* game286 (idee : codex 31, sous-agent Claude) */
  emanationRutherford: {
    titre: 'Rutherford: thorium emanation halves every minute',
    enUnePhrase: 'The radioactive gas from thorium loses half its power every minute, whatever is left.',
    colonnes: ['time', 'current through the gas', 'readings, halving law or straight line'],
    aRegarder: ['At 60 seconds your curve runs through his readings.', 'The straight line dives below zero.', 'After six minutes less than two percent remains.'],
    fin: null,
  },
  /* game285 (idee : codex 31, sous-agent Claude) */
  maisDarwin: {
    titre: 'Darwin: crossed and self-fertilised maize',
    enUnePhrase: 'Maize grown from crossed seed came up taller than its self-fertilised twin in 13 rows of 15.',
    colonnes: ['row of the table', 'height', 'crossed, self or self plus your gain'],
    aRegarder: ['At about 15 percent your dots reach the crossed ones.', 'Two rows go the other way.', 'Both short crossed plants measured 12 inches.'],
    fin: null,
  },
  /* game284 (idee : codex 31, sous-agent Claude) */
  magnitudesPogson: {
    titre: 'Pogson: the 2.512 scale of star magnitudes',
    enUnePhrase: 'Five magnitudes fainter means a hundred times less light and a telescope ten times wider.',
    colonnes: ['magnitude', 'aperture or other scale', 'his table, your ratio, other observers'],
    aRegarder: ['At 2.512 your line runs through his apertures.', 'At 4 it climbs far too fast.', 'Bond and Herschel stretched their scales well past his.'],
    fin: null,
  },
  /* game283 (idee : codex 31, sous-agent Claude) */
  rayonsThomson: {
    titre: 'J. J. Thomson: the mass to charge of cathode rays',
    enUnePhrase: 'Whatever the gas, the particles of a cathode ray carry a thousand times more charge for their mass than any ion.',
    colonnes: ['speed', 'mass over charge', 'printed or recomputed'],
    aRegarder: ['At 1 the recomputed dots sit on the printed ones.', 'A larger bending field moves them up and to the left.', 'One hydrogen row sits far away: its printed power of ten is off.'],
    fin: null,
  },
  /* game282 (idee : codex 31, sous-agent Claude) */
  poisMendel: {
    titre: 'Mendel: the counts of the pea crosses',
    enUnePhrase: 'Cross two kinds of pea and the hidden form comes back in about one plant in four.',
    colonnes: ['experiment', 'share of the plants', 'dominant, recessive or expected'],
    aRegarder: ['At 3 the expected line runs through the recessive dots.', 'At 1 it sits far above them.', 'Seed shape and seed colour, the biggest counts, sit closest.'],
    fin: null,
  },
  /* game281 (idee : codex 30, sous-agent Claude) */
  spiraleMoseley: {
    titre: 'Moseley: shells grow as logarithmic spirals',
    enUnePhrase: 'Each whorl of a shell is the same fraction narrower than the one before.',
    colonnes: ['whorl', 'width', 'shell or your ratio'],
    aRegarder: ['At 1.18 your dots follow Turbo duplicatus.', 'At 1.13 they follow Buccinum.', 'A ratio of 1.3 shrinks far too fast.'],
    fin: null,
  },
  /* game280 (idee : codex 30, sous-agent Claude) */
  tubesHagen: {
    titre: 'Hagen: water through narrow brass tubes',
    enUnePhrase: 'Part of the push fights friction, part speeds the water up: the second grows with the square of the flow.',
    colonnes: ['flow', 'head of water', 'readings, his curves or your curves'],
    aRegarder: ['At 1 your curves sit on his.', 'At 0 the friction line falls short of the fast flows.', 'The narrowest tube needs the highest head.'],
    fin: null,
  },
  /* game279 (idee : codex 30, sous-agent Claude) */
  syllabesKaeding: {
    titre: 'Kaeding: eleven million German words by length',
    enUnePhrase: 'Half of all German words have one syllable, and longer words get rarer faster and faster.',
    colonnes: ['number of syllables', 'number of words', 'corpus or the witness'],
    aRegarder: ['The classics use the shortest words, law the longest.', 'The geometric line overshoots from 4 syllables on.', 'A few words reach 15 syllables.'],
    fin: null,
  },
  /* game278 (idee : codex 30, sous-agent Claude) */
  fonteMacKellar: {
    titre: 'MacKellar: how many of each letter a printer buys',
    enUnePhrase: 'A printer ordered sixty e for every z, because that is how English is written.',
    colonnes: ['rank of the letter', 'share of the fount', 'fount, even share or your mix'],
    aRegarder: ['At 0 your curve is his fount: e, t and a lead.', 'At 1 every letter gets the same share.', 'Ten letters sit above the even line.'],
    fin: null,
  },
  /* game277 (idee : codex 30, sous-agent Claude) */
  tempsOldham: {
    titre: 'Oldham: earthquake waves through the Earth',
    enUnePhrase: 'The farther away, the deeper the tremors travel and the faster they seem, until something deep slows the second one.',
    colonnes: ['distance from the quake', 'travel time', 'phase or your straight path'],
    aRegarder: ['At 6 km per second the line follows the second phase out to 120 degrees.', 'Beyond 120 degrees the second phase falls far behind.', 'The first phase needs about 10 km per second.'],
    fin: null,
  },
  /* game276 (idee : codex 30, sous-agent Claude) */
  spiralesBeal: {
    titre: 'Beal: the spirals of 895 cones',
    enUnePhrase: 'Most cones wind 5 one way and 8 the other, two Fibonacci neighbours, but not all.',
    colonnes: ['spirals to the right', 'spirals to the left', 'kind of pair'],
    aRegarder: ['The two big clouds are 5 and 8, both ways round.', 'The European larch shows 5 and 13 instead.', 'The 4 and 7 cones sit off the Fibonacci clouds.'],
    fin: null,
  },
  /* game275 (idee : codex 30, sous-agent Claude) */
  variationsHalley: {
    titre: 'Halley: the compass needle drifts west',
    enUnePhrase: 'The needle that pointed east of north at London in 1580 pointed west of it a century later.',
    colonnes: ['year', 'variation of the needle', 'place or chosen year'],
    aRegarder: ['London crosses true north between 1634 and 1672.', 'Each step to the west is steeper than the last.', 'Paris and Copenhagen go the same way.'],
    fin: null,
  },
  /* game274 (idee : codex 30, sous-agent Claude) */
  tubesPoiseuille: {
    titre: 'Poiseuille: flow in fine tubes',
    enUnePhrase: 'Make a tube twice as wide and sixteen times as much water gets through.',
    colonnes: ['width of the tube', 'flow', 'tube or fitted line'],
    aRegarder: ['At power 4 the line runs through all seven tubes.', 'At power 3 it misses the narrowest and the widest.', 'The widest tube is 47 times the narrowest.'],
    fin: null,
  },
  /* game273 (idee : codex 30, sous-agent Claude) */
  unitesWeber: {
    titre: 'Weber and Kohlrausch: the ratio of the units',
    enUnePhrase: 'Discharge a known charge through a coil and the swing tells how two units of current compare.',
    colonnes: ['discharge', 'ratio of the units', 'your share, printed or mean'],
    aRegarder: ['At one half your dots sit on their printed values.', 'At one, everything doubles.', 'The five discharges scatter by about 3 percent around the mean.'],
    fin: null,
  },
  /* game272 (idee : codex 30, sous-agent Claude) */
  aimantGauss: {
    titre: 'Gauss: a magnet pulls as the cube of the distance',
    enUnePhrase: 'Move a magnet twice as far and the needle turns about eight times less.',
    colonnes: ['distance', 'deflection of the needle', 'position or fitted law'],
    aRegarder: ['At power 3 the curves run through his dots.', 'At power 2 they overshoot far from the magnet.', 'The second position turns the needle about half as much.'],
    fin: null,
  },
  /* game271 (idee : codex 29, sous-agent Claude) */
  deplacementsPerrin: {
    titre: 'Perrin: Brownian jumps obey chance',
    enUnePhrase: 'The jumps of a jiggling grain follow the bell curve of chance, as Perrin counted them.',
    colonnes: ['jump size', 'number of grains', 'model, found or calculated'],
    aRegarder: ['Near 6.3 microns the bell meets the counts.', 'Too narrow and it overshoots the small jumps.', 'His own calculated column hugs the same bell.'],
    fin: null,
  },
  /* game270 (idee : codex 29, sous-agent Claude) */
  filtreDarcy: {
    titre: 'Darcy: water through sand',
    enUnePhrase: 'Water seeps through sand in proportion to the drop in pressure across it.',
    colonnes: ['effective head', 'flow', 'February, fit or first series'],
    aRegarder: ['With the full pressure below counted, the points line up.', 'Count none of it and they scatter.', 'The first series grows straight with the head.'],
    fin: null,
  },
  /* game269 (idee : codex 29, sous-agent Claude) */
  critiqueReynolds: {
    titre: 'Reynolds: when a stream of water turns sinuous',
    enUnePhrase: 'The narrower the pipe, the faster water must go before its smooth flow breaks into eddies.',
    colonnes: ['pipe diameter', 'velocity or log B_s', 'law, measurement or constant'],
    aRegarder: ['Three pipes, three clusters of speeds.', 'At power 1 the law meets them.', 'Power 0 makes the speeds equal: they are not.'],
    fin: null,
  },
  /* game268 (idee : codex 29, sous-agent Claude) */
  effetJoule: {
    titre: 'Joule: heat grows as the square of the current',
    enUnePhrase: 'Triple the current through a wire and it gives out about nine times the heat.',
    colonnes: ['current', 'heat', 'law, half hour or one hour'],
    aRegarder: ['At power 2 the curve threads the points.', 'Power 1 falls far below them.', 'The one-hour points climb twice as high.'],
    fin: null,
  },
  /* game267 (idee : codex 29, sous-agent Claude) */
  balanceCoulomb: {
    titre: 'Coulomb: the torsion balance and the inverse square',
    enUnePhrase: 'Halve the distance between two charged balls and the push needed grows about four times.',
    colonnes: ['distance', 'twist or time', 'law, trials or oscillations'],
    aRegarder: ['At power 2 the curve meets the trials.', 'The third trial falls a little short.', 'Try power 1 and the curve misses badly.'],
    fin: null,
  },
  /* game266 (idee : codex 29, sous-agent Claude) */
  picLummer: {
    titre: 'Lummer and Pringsheim: the black body peak',
    enUnePhrase: 'Heat a black body: its brightest wavelength moves inward and its peak grows as the fifth power of temperature.',
    colonnes: ['temperature', 'scaled quantity', 'which quantity'],
    aRegarder: ['At power 5 the first row lies flat.', 'Wavelength times temperature stays level.', 'Try power 4 and watch it climb.'],
    fin: null,
  },
  /* game265 (idee : codex 29, sous-agent Claude) */
  ondulationsYoung: {
    titre: 'Young: the first table of light wavelengths',
    enUnePhrase: 'Each colour gets a wavelength and a frequency, from red to violet, less than an octave apart.',
    colonnes: ['colour', 'frequency or length', 'which column'],
    aRegarder: ['Frequency climbs as the wavelength shrinks.', 'Red to violet spans 1.587, not 2.', 'Change the assumed light time.'],
    fin: null,
  },
  /* game264 (idee : codex 29, sous-agent Claude) */
  vitesseNyquist: {
    titre: 'Nyquist: more levels, logarithmically faster',
    enUnePhrase: 'Sending with more current levels speeds the telegraph only as the logarithm of the number of levels.',
    colonnes: ['levels', 'relative speed', 'log law, straight line or printed'],
    aRegarder: ['The printed points sit on the log curve.', 'Five levels: 230 printed, 232 by the law.', 'The straight line runs away from them.'],
    fin: null,
  },
  /* game263 (idee : codex 28, sous-agent Claude) */
  parallaxeBessel: {
    titre: 'Bessel: the first distance to a star',
    enUnePhrase: 'Two comparison stars give two parallaxes; weighting them gives the first measured distance to a star.',
    colonnes: ['weight of star b', 'parallax', 'curve, chosen weight or separate values'],
    aRegarder: ['The common value lies between the two separate ones.', 'Weight 0.6889 gives 0.3136.', 'Slide the weight and watch it move.'],
    fin: null,
  },
  /* game262 (idee : codex 28, sous-agent Claude) */
  motsMendenhall: {
    titre: 'Mendenhall: the curve of word lengths',
    enUnePhrase: 'How many words of each length an author uses, per thousand: a fingerprint, but a noisy one.',
    colonnes: ['letters', 'words per thousand', 'which text'],
    aRegarder: ['Three-letter words lead in every text.', 'The two Vanity Fair groups nearly overlap.', 'Merge the long words and compare.'],
    fin: null,
  },
  /* game261 (idee : codex 28, sous-agent Claude) */
  chaleurLondres: {
    titre: 'Howard: London is warmer than the country',
    enUnePhrase: 'Thirty years of London means and twelve of the country: the city record runs about one and a half degrees warmer.',
    colonnes: ['year', 'mean temperature', 'London, country or smoothed'],
    aRegarder: ['The country line sits below London.', 'Except in 1813.', 'Smooth London over several years.'],
    fin: null,
  },
  /* game260 (idee : codex 28, sous-agent Claude) */
  survieHalley: {
    titre: 'Halley: the Breslau life table',
    enUnePhrase: 'How many of a thousand are still alive at each age, and what a life annuity is worth.',
    colonnes: ['age', 'alive or annuity', 'alive, annuity or constant risk'],
    aRegarder: ['The steep fall in the first years.', 'The annuity peaks around ten.', 'The constant-risk curve sinks far too fast.'],
    fin: null,
  },
  /* game259 (idee : codex 28, sous-agent Claude) */
  repliquesOmori: {
    titre: 'Omori: the aftershocks fade like 1 / t',
    enUnePhrase: 'Aftershocks thin out in inverse proportion to time, not exponentially: a year on, they still come.',
    colonnes: ['half days', 'shocks', 'counts, hyperbola, exponential or yearly mean'],
    aRegarder: ['The first ten counts hug the hyperbola.', 'The exponential dives to nothing.', 'Stretch the horizon to 1892 and 1893.'],
    fin: null,
  },
  /* game258 (idee : codex 28, sous-agent Claude) */
  chaleursPetitDulong: {
    titre: 'Petit and Dulong: the same heat for every atom',
    enUnePhrase: 'Heavy atoms need little heat per gram, light ones a lot: per atom it is the same.',
    colonnes: ['atomic weight', 'specific heat', 'element or the law'],
    aRegarder: ['The thirteen elements hug one curve.', 'Platinum sits off its printed product.', 'Shift the weights and the curve breaks.'],
    fin: null,
  },
  /* game257 (idee : codex 27, sous-agent Claude) */
  equivalentsFaraday: {
    titre: 'Faraday: one current, chemical equivalents',
    enUnePhrase: 'The same current frees each substance in proportion to its chemical equivalent, not in equal weights.',
    colonnes: ['equivalent', 'grains or measured equivalent', 'mass, kept trial or miss'],
    aRegarder: ['Kept trials sit near the diagonal.', 'The misses fall well below it.', 'More gas, more of every metal, same proportions.'],
    fin: null,
  },
  /* game256 (idee : codex 27, sous-agent Claude) */
  mortaliteNightingale: {
    titre: 'Nightingale: an army killed by disease',
    enUnePhrase: 'Each wedge is a month; its area is the death rate: disease dwarfs wounds.',
    colonnes: ['across', 'up', 'disease, wounds or other causes'],
    aRegarder: ['The huge winter wedges are disease.', 'Wounds stay small all along.', 'Switch to the second year: the rose shrinks.'],
    fin: null,
  },
  /* game255 (idee : codex 27, sous-agent Claude) */
  exclusionGause: {
    titre: 'Gause: two species, one food, one survivor',
    enUnePhrase: 'Two Paramecium species on the same bacteria: together, one of them disappears in 16 days.',
    colonnes: ['day', 'volume', 'observed or model, each species'],
    aRegarder: ['P. caudatum climbs, then sinks to 0.', 'The constant model keeps both alive.', 'Raise beta to make the model exclude.'],
    fin: null,
  },
  /* game253 (idee : codex 27, sous-agent Claude) */
  aberrationBradley: {
    titre: 'Bradley: starlight arrives at an angle',
    enUnePhrase: 'Because the Earth moves, starlight seems to come in slightly tilted, like rain when you run.',
    colonnes: ['which star', 'arcseconds', 'deduced maximum, observed change or prediction'],
    aRegarder: ['The observed changes differ a lot from star to star.', 'The deduced maximum is the same for all.', 'Slide the light time: only about 8 minutes fits.'],
    fin: null,
  },
  /* game252 (idee : codex 26, sous-agent Claude) */
  regressionGalton: {
    titre: 'Galton: regression towards the mean',
    enUnePhrase: 'Children of very tall parents are tall, but closer to average than their parents were.',
    colonnes: ['parents height', 'children height', 'which way the averages were taken'],
    aRegarder: ['The child medians lie on a flatter line than parents = children.', 'Read it the other way: parents also regress.', 'Set the slope to 1: the short families fall off.'],
    fin: null,
  },
  /* game251 (idee : codex 26, sous-agent Claude) */
  lumiereMichelson: {
    titre: 'Michelson: the speed of light',
    enUnePhrase: 'A spinning mirror timed light over a few hundred metres: about 300000 kilometres every second.',
    colonnes: ['which measurement', 'speed measured', 'measurement, his result or the exact value'],
    aRegarder: ['The 100 values scatter by a few hundred km/s.', 'His final line sits above the exact one.', 'Without the vacuum correction it lands closer, by luck.'],
    fin: null,
  },
  /* game250 (idee : codex 26, sous-agent Claude) */
  loiMoseley: {
    titre: 'Moseley: counting the elements with X-rays',
    enUnePhrase: 'Each element shines X-rays whose frequency steps up by one notch per element: atomic number is real.',
    colonnes: ['atomic number', 'Moseley Q (square root of the X-ray frequency)', 'element or the straight line'],
    aRegarder: ['The points sit on one straight line.', 'Element 43 is missing: no one had found it yet.', 'Remove that gap and the heavy elements fall off.'],
    fin: null,
  },
  /* game249 (idee : codex 26, sous-agent Claude) */
  loiHubble1929: {
    titre: 'Hubble 1929: the farther, the faster',
    enUnePhrase: 'Distant galaxies race away from us, and the farther they are the faster they go.',
    colonnes: ['how far the galaxy is', 'how fast it moves away', 'galaxy, or a straight line'],
    aRegarder: ['The points climb to the right.', 'The nearest ones even come towards us.', 'Tilt the test line to fit the cloud.'],
    fin: null,
  },
  /* game248 (idee : codex 26, sous-agent Claude) */
  vieGraunt: {
    titre: 'Graunt: the first life table',
    enUnePhrase: 'In 1662 London, of 100 children only 40 reached sixteen and 1 reached seventy-six.',
    colonnes: ['age', 'still alive out of 100', 'the table, or a smooth curve'],
    aRegarder: ['Over a third die before six.', 'Then about a third of the rest each decade.', 'His own formula falls too fast.'],
    fin: null,
  },
  /* game247 (idee : codex 25, sous-agent Claude) */
  gouttesMillikan: {
    titre: 'Millikan: the charge of the electron',
    enUnePhrase: 'Charged oil drops floating between two plates all carry whole numbers of one tiny charge.',
    colonnes: ['which drop', 'charge measured on that drop', 'drop group, or the running average'],
    aRegarder: ['All 58 drops sit in a narrow band.', 'Average more drops: the line settles.', 'No drop strays even 1 percent.'],
    fin: null,
  },
  /* game246 (idee : codex 25, sous-agent Claude) */
  lynxHudson: {
    titre: 'The ten-year lynx cycle',
    enUnePhrase: 'Lynx numbers in Canada boom and crash about every ten years, following the snowshoe hares they eat.',
    colonnes: ['year', 'lynx skins sold (log scale)', 'the series, its peaks, or the series shifted'],
    aRegarder: ['Peaks come back about every ten years.', 'Shift by 10 years: the curves line up.', 'Shift by 5: they are opposite.'],
    fin: null,
  },
  /* game245 (idee : codex 25, sous-agent Claude) */
  eclipseEddington: {
    titre: 'The 1919 eclipse',
    enUnePhrase: 'During an eclipse, stars beside the Sun looked shifted outward: the Sun bends light, as much as Einstein said.',
    colonnes: ['shift predicted by Einstein', 'shift measured', 'star, or a prediction line'],
    aRegarder: ['The stars follow the Einstein line.', 'The Newton line, half as steep, runs below them.', 'Set the factor to 0: no bending fits nothing.'],
    fin: null,
  },
  /* game244 (idee : codex 25, sous-agent Claude) */
  equivalentJoule: {
    titre: 'Joule: work becomes heat',
    enUnePhrase: 'Stirring water with falling weights warms it, and the same work always makes the same heat.',
    colonnes: ['which series', 'work needed to warm a pound of water by one degree', 'water, mercury, cast iron, or the value kept'],
    aRegarder: ['All five series sit within half a percent.', 'Water gives the lowest value.', 'Switch air and vacuum: every point moves by the same factor.'],
    fin: null,
  },
  /* game243 (idee : codex 25, sous-agent Claude) */
  densiteCavendish: {
    titre: 'Cavendish: weighing the Earth',
    enUnePhrase: 'Lead balls pulling on lead balls told how heavy the whole Earth is: five and a half times water.',
    colonnes: ['which measurement', 'density of the Earth', 'which wire, or the average'],
    aRegarder: ['The second wire results crowd around 5.48.', 'One first-wire result, 4.88, sits low.', 'Switch the average: all 29 give 5.45, the first wire 5.31.'],
    fin: null,
  },
  /* game242 (idee : codex 25, sous-agent Claude) */
  fievreSemmelweis: {
    titre: 'Semmelweis: washing hands',
    enUnePhrase: 'Doctors who came from the dissecting room carried death to mothers until they washed their hands in chlorine.',
    colonnes: ['year', 'mothers who died, per hundred', 'which clinic, or when chlorine began'],
    aRegarder: ['The doctors clinic stays far above the midwives clinic.', 'Both drop after the chlorine line.', 'In 1848 the two clinics meet.'],
    fin: null,
  },
  /* game241 (idee : codex 24, sous-agent Claude) */
  oubliEbbinghaus: {
    titre: 'The forgetting curve',
    enUnePhrase: 'We forget fast at first, then slower and slower: a month later some memory still helps.',
    colonnes: ['time since learning (log scale)', 'time saved when learning again', 'measured, formula or constant-rate forgetting'],
    aRegarder: ['The steep drop in the first hour.', 'The long, slow tail over days.', 'The constant-rate curve dives to zero far too early.'],
    fin: null,
  },
  /* game240 (idee : codex 24, sous-agent Claude) */
  carteSturtevant: {
    titre: 'The first genetic map',
    enUnePhrase: 'Genes far apart on a chromosome get separated more often, so separation becomes a ruler.',
    colonnes: ['distance on the map', 'how often the two genes were split', 'map pair, check pair or the straight line'],
    aRegarder: ['Close pairs sit on the straight line.', 'Far pairs fall below it.', 'Nothing goes above 50 percent.'],
    fin: null,
  },
  /* game239 (idee : codex 24, sous-agent Claude) */
  argonRayleigh: {
    titre: 'The nitrogen that weighed too much',
    enUnePhrase: 'Nitrogen taken from air was half a percent heavier than nitrogen made in the lab: the extra was argon.',
    colonnes: ['how the nitrogen was made', 'how much a litre weighs', 'lab, air or the printed value'],
    aRegarder: ['The five lab methods agree closely.', 'The three air methods sit higher, together.', 'Flip the correction sign: the printed values no longer match.'],
    fin: null,
  },
  /* game238 (idee : codex 24, sous-agent Claude) */
  diffusionAlpha: {
    titre: 'Geiger and Marsden 1913',
    enUnePhrase: 'A few alpha particles bounce straight back off gold: the atom has a tiny, heavy, charged core.',
    colonnes: ['angle (log scale)', 'particles counted (log scale)', 'measured or test law'],
    aRegarder: ['The counts fall on a straight line.', 'Its slope is close to minus 4.', 'Change the power: only 4 follows the dots.'],
    fin: null,
  },
  /* game237 (idee : codex 23, sous-agent Claude) */
  michaelisMenten: {
    titre: 'Michaelis and Menten 1913',
    enUnePhrase: 'An enzyme works faster with more sugar, until it is busy all the time.',
    colonnes: ['how much sugar', 'how fast it is cut', 'measured or curve'],
    aRegarder: ['At low sugar the rate climbs fast.', 'At high sugar it flattens out.', 'Halfway up is the constant K.'],
    fin: null,
  },
  /* game236 (idee : codex 23, sous-agent Claude) */
  especesAire: {
    titre: 'Birds of the Solomon Islands',
    enUnePhrase: 'Bigger islands hold more bird species, but only a dozen more for every tenfold of land.',
    colonnes: ['island area (log scale)', 'number of bird species', 'near or far island, and the fitted lines'],
    aRegarder: ['Near islands sit on one straight line.', 'Far islands fall below it.', 'The steep classic curve misses the small islands.'],
    fin: null,
  },
  /* game235 (idee : codex 23, sous-agent Claude) */
  loiOhm: {
    titre: 'Ohm 1826: longer wire, weaker current',
    enUnePhrase: 'A longer wire lets less current through, but the rest of the circuit counts too.',
    colonnes: ['wire length', 'how far the needle turns', 'which series'],
    aRegarder: ['The twist falls as the wire grows.', 'It never falls to nothing: the rest of the circuit adds about 20 inches.', 'Move the b slider away from 20: the curve leaves the dots.'],
    fin: null,
  },
  /* game234 (idee : codex 23, sous-agent Claude) */
  loiBoyle: {
    titre: 'Boyle 1662: squeezing air',
    enUnePhrase: 'Halve the room the air has and it pushes back twice as hard.',
    colonnes: ['how much room the air has', 'how hard it pushes back', 'reading, test curve or straight line'],
    aRegarder: ['The readings follow the curve, not the straight line.', 'Volume times pressure barely moves.', 'Change the exponent: only 1 fits.'],
    fin: null,
  },
  /* game233 (idee : codex 23, sous-agent Claude) */
  raiesBalmer: {
    titre: 'Balmer lines of hydrogen',
    enUnePhrase: 'The colours of glowing hydrogen sit on one straight line, and its slope is a constant of nature.',
    colonnes: ['one over n squared', 'one over the wavelength', 'measured line or the fitted line'],
    aRegarder: ['The measured dots fall on the line.', 'More lines, same slope.', 'The slope is the Rydberg constant of hydrogen.'],
    fin: null,
  },
  /* game232 (idee : codex 23, sous-agent Claude) */
  choleraSnow: {
    titre: 'John Snow and the cholera of 1854',
    enUnePhrase: 'Same streets, two water companies: the houses drinking from the dirty river died eight times as often.',
    colonnes: ['where the house is', 'where the house is', 'which water, and whether someone died'],
    aRegarder: ['Both kinds of houses are mixed in the same streets.', 'Deaths cluster in the dirty-water houses.', 'Compare per house, not just deaths.'],
    fin: null,
  },
  /* game231 (idee : codex Grok Bot) */
  demiViesNPL: {
    titre: 'Six published half-lives',
    enUnePhrase: 'Unstable atoms disappear by halves: the same share goes in each half-life, never all at once.',
    colonnes: ['time, on a log scale', 'share of atoms left', 'which isotope'],
    aRegarder: ['Every curve drops the same way, just at its own time.', 'After three half-lives an eighth is left.', 'The carbon-14 clock: an eighth left means about 17100 years.'],
    fin: null,
  },
  /* game230 (idee : codex Grok Bot) */
  effetPhotoelectrique: {
    titre: 'The photoelectric effect',
    enUnePhrase: 'Light knocks electrons out of metal, but only if each grain of light (photon) is energetic enough.',
    colonnes: ['how fast the light vibrates (frequency)', 'voltage needed to stop the fastest electrons', 'which metal'],
    aRegarder: ['Each metal starts emitting only above its own frequency.', 'All four lines climb with exactly the same slope.', 'Too red a light emits nothing at all, even very bright.'],
    fin: null,
  },
  /* game229 (idee : codex Grok Bot) */
  loiKleiber: {
    titre: "Kleiber's law",
    enUnePhrase: 'Bigger animals burn more energy, but less per kilogram: metabolism grows like mass to the power 3/4.',
    colonnes: ['how heavy (log scale)', 'how much energy at rest (log scale)', 'animal or test line'],
    aRegarder: ['The eight animals fall on a straight line on log scales.', 'Its slope is near 3/4, not 1.', 'A dove burns about ten times more energy per kilogram than a steer.'],
    fin: null,
  },
  /* game228 (idee : codex Grok Bot) */
  hodgkinHuxley: {
    titre: 'A nerve impulse (Hodgkin-Huxley)',
    enUnePhrase: 'How a nerve cell fires: sodium rushes in, potassium rushes out, and the voltage spikes.',
    colonnes: ['time', 'voltage across the membrane', 'how open the sodium gates are'],
    aRegarder: ['With no current the cell rests quietly at -65 millivolts.', 'Push enough current and it fires spikes again and again.', 'Each spike shoots above zero, then dips below rest before recovering.'],
    fin: null,
  },
  /* game227 (idee : codex 22, sous-agent Claude) */
  electronegativite: {
    titre: 'Electronegativity across the periodic table',
    enUnePhrase: 'How strongly each atom pulls on the electrons it shares: it grows to the right and shrinks downward.',
    colonnes: ['place in the row', 'how strong the pull is', 'second or third row'],
    aRegarder: ['Fluorine pulls the hardest of all these atoms.', 'Every step to the right pulls a little more.', 'Switch to ionization energy: the climb has small dips at boron, oxygen, aluminium and sulfur.'],
    fin: null,
  },
  /* game226 (idee : codex 22, sous-agent Claude) */
  populationMonde: {
    titre: 'World population since 1950',
    enUnePhrase: 'How many people live on Earth, counted every ten years by the United Nations.',
    colonnes: ['which year', 'how many people (8 = 8 billion)', 'real count or fitted curve'],
    aRegarder: ['The number of people more than tripled between 1950 and 2020.', 'The growth rate was highest in the 1960s and has slowed every decade since.', 'A curve that keeps growing like the early years ends up far too high.'],
    fin: null,
  },
  /* game225 (idee : codex 22, sous-agent Claude) */
  courbeKeeling: {
    titre: 'The Keeling curve',
    enUnePhrase: 'Carbon dioxide in the air, measured on a Hawaiian volcano every year since 1959.',
    colonnes: ['which year', 'how much CO2 is in the air', 'how much it rose that year'],
    aRegarder: ['It has gone up every single year since 1959.', 'The yearly rise has roughly tripled.', 'A straight line from the early years falls far below today.'],
    fin: null,
  },
  /* game224 (idee : codex 21, sous-agent Claude) */
  energieLiaison: {
    titre: 'Nuclear binding energy',
    enUnePhrase: 'How hard each nucleus holds together: the reason stars shine and uranium splits.',
    colonnes: ['how heavy the nucleus is', 'how tightly it is held, per particle', 'part of the chosen reaction'],
    aRegarder: ['Light nuclei gain binding when they fuse: that energy lights the stars.', 'The curve peaks around iron and nickel, then slowly falls.', 'Nickel-62, not iron-56, is the most tightly bound.'],
    fin: null,
  },
  /* game223 (idee : codex 21, sous-agent Claude) */
  mareeVivesEaux: {
    titre: 'Tides: spring and neap',
    enUnePhrase: 'The Moon and the Sun each pull a tide; when they line up the tides are biggest.',
    colonnes: ['time', 'height of the water', 'which day'],
    aRegarder: ['High tide comes back about every 12 hours 25 minutes, not 12 hours.', 'Every two weeks or so the tides grow (spring) then shrink (neap).', 'Turn the solar wave down and the difference between spring and neap fades.'],
    fin: null,
  },
  /* game222 (idee : codex Grok Bot) */
  arrhenius: {
    titre: 'How heat speeds up a reaction',
    enUnePhrase: 'Hydrogen and iodine react faster when hot: a little more heat, a lot more speed.',
    colonnes: ['time (one hour)', 'how much hydrogen is left', 'how much hydrogen iodide was made'],
    aRegarder: ['At 300 degrees almost nothing happens in an hour.', 'At 450 degrees most of the hydrogen is gone.', 'Each extra 10 degrees multiplies the speed by less than 2 here.'],
    fin: null,
  },
  /* game221 (idee : codex Grok Bot) */
  gutenbergRichter: {
    titre: 'Earthquake sizes',
    enUnePhrase: 'For every earthquake one magnitude stronger, there are about ten times fewer.',
    colonnes: ['how strong (magnitude above 4.5)', 'how many quakes are at least that strong (log scale)', 'which half-magnitude class'],
    aRegarder: ['On a log scale the counts fall along a straight line.', 'The slope b, measured back from the quakes, comes out close to the one set.', 'The real 2024 world list of quakes falls off faster than the Californian slope.'],
    fin: null,
  },
  /* game220 (idee : codex Grok Bot) */
  loiZipf: {
    titre: "Zipf's law on real web text",
    enUnePhrase: 'The most common word is about twice as common as the second, three times the third... roughly.',
    colonnes: ['rank of the word (log scale)', 'how often it appears (log scale)', 'how far it sits from the straight line'],
    aRegarder: ['On log scales the words fall almost on a straight line.', '"the" alone is more than 2 percent of all the words in the corpus.', 'The slope is not exactly -1, and it moves with how many words you keep.'],
    fin: null,
  },
  /* game219 (idee : codex Grok Bot) */
  atmosphereStandard: {
    titre: 'The standard atmosphere',
    enUnePhrase: 'Climb into the sky: the air gets colder and thinner, by rules set in 1976 for pilots and engineers.',
    colonnes: ['how high you are', 'how much air pressure is left', 'the temperature'],
    aRegarder: ['The pressure halves roughly every 5.5 kilometres at first.', 'Above 11 km the temperature stops falling and stays at 216.65 K.', 'Heights in this model are a little different from heights on a tape measure.'],
    fin: null,
  },
  /* game218 (idee : codex Grok Bot) */
  entropieShannon: {
    titre: 'Shannon entropy of English letters',
    enUnePhrase: 'How many yes-or-no questions does one English letter take, on average? About 4.18.',
    colonnes: ['letters from most to least common', 'how surprising each letter is (bits)', 'how long its code is'],
    aRegarder: ['E is the least surprising letter, Z the most.', 'Common letters get short codes and rare ones long codes.', 'The best code averages just above 4.18 bits, against 5 bits for a code with equal lengths.'],
    fin: null,
  },
  /* game217 (idee : codex Grok Bot) */
  gammeTemperee: {
    titre: 'Equal temperament (tuning a piano)',
    enUnePhrase: 'A piano cuts the octave into 12 equal steps; pure musical intervals do not quite fit.',
    colonnes: ['which step of the octave', 'how far it is from a pure interval (cents)', 'step number'],
    aRegarder: ['The fifth is almost perfect, two hundredths of a semitone flat.', 'The major third is clearly sharp, about 14 cents.', 'Try 53 steps: the fifth becomes nearly exact.'],
    fin: null,
  },
  /* game216 (idee : codex Grok Bot) */
  pileDaniell: {
    titre: 'A zinc-copper battery running down',
    enUnePhrase: 'Zinc gives electrons to copper ions; the voltage slowly drops as the copper runs out.',
    colonnes: ['time', 'the voltage (1 = standard)', 'how lopsided the ions are'],
    aRegarder: ['The voltage stays almost flat for most of the run, then falls.', 'Each tenfold change in the ion ratio costs the same small voltage.', 'Equal amounts of both ions give the standard voltage, whatever the amount.'],
    fin: null,
  },
  /* game215 (idee : codex Grok Bot) */
  geometrieVSEPR: {
    titre: 'Molecule shapes (VSEPR)',
    enUnePhrase: 'Electron groups around an atom push each other away: that decides the shape of the molecule.',
    colonnes: ['east-west', 'north-south', 'up-down'],
    aRegarder: ['Methane is a perfect pyramid with four corners: every angle is about 109.47 degrees.', 'Ammonia and water keep the same four groups, but lone pairs squeeze the bonds closer.', 'Carbon dioxide is a straight line and boron trifluoride a flat triangle.'],
    fin: null,
  },
  /* game214 (idee : codex Grok Bot) */
  titrageAcideFaible: {
    titre: 'Titrating vinegar acid with lye',
    enUnePhrase: 'Pour a base into a weak acid drop by drop and watch the pH climb, slowly, then all at once.',
    colonnes: ['how much base was poured', 'the pH', 'how much acid is still intact'],
    aRegarder: ['A long flat stretch in the middle: the buffer zone.', 'Halfway through, the pH equals the pKa of the acid.', 'At the exact end point the pH is above 7 (about 8.7 with the starting mixture), never 7.'],
    fin: null,
  },
  /* game213 (idee : codex Grok Bot) */
  codeGenetique: {
    titre: 'The genetic code',
    enUnePhrase: 'Every three letters of RNA name one amino acid, or say stop: 64 words for 21 meanings.',
    colonnes: ['which word in the message', 'how forgiving that word is to a one-letter typo', 'which amino acid'],
    aRegarder: ['Many words mean the same amino acid: a typo in the third letter is usually harmless.', 'A typo in the second letter always changes the amino acid.', 'Skip a single letter and almost the whole message changes.'],
    fin: null,
  },
  /* game212 (idee : codex Grok Bot) */
  fourmiLangton: {
    titre: "Langton's ant",
    enUnePhrase: 'An ant turns right on white, left on black, flips the square and steps on: chaos, then a straight road.',
    colonnes: ['ant east-west', 'ant north-south', 'colour of the square it just left'],
    aRegarder: ['For about ten thousand steps the ant scribbles a messy blob.', 'Then it starts building a diagonal highway that repeats every 104 steps.', 'A simulation this long shows the highway, but cannot prove it goes on forever.'],
    fin: null,
  },
  /* game211 (idee : codex Grok Bot) */
  suitePadovan: {
    titre: 'The Padovan sequence',
    enUnePhrase: 'Add the terms two and three places back: 1, 0, 0, 1, 0, 1, 1, 1, 2, 2, 3, 4, 5, 7 ...',
    colonnes: ['how far along', 'how far the ratio is from its limit', 'above or below'],
    aRegarder: ['The ratio of neighbours swings above and below its limit, closer each time.', 'The limit is the plastic number, about 1.3247.', 'Start from 1, 1, 1 and you get the same numbers, five places later.'],
    fin: null,
  },
  /* game210 (idee : codex Grok Bot) */
  thueMorse: {
    titre: 'The Thue-Morse sequence',
    enUnePhrase: 'Start with 0, then keep gluing on the opposite: 0, 01, 0110, 01101001 ...',
    colonnes: ['turtle east-west', 'turtle north-south', '0 or 1'],
    aRegarder: ['The turtle walks on 0 and turns on 1, and the path keeps folding back into the same shapes.', 'No block of digits ever appears three times in a row.', 'Split the numbers by their digit and the sums of their powers match, up to a point.'],
    fin: null,
  },
  /* game209 (idee : codex Grok Bot) */
  suitePerrin: {
    titre: 'The Perrin sequence and its pseudoprimes',
    enUnePhrase: 'Add the terms two and three back: every prime n divides the n-th term.',
    colonnes: ['which n', 'remainder of the n-th term divided by n', 'is n prime'],
    aRegarder: ['Every prime sits on the floor: remainder 0.', 'No composite number here divides its term.', 'The first one that does is 271441, far beyond the slider: a prime test that can be fooled.'],
    fin: null,
  },
  /* game208 (idee : codex Grok Bot) */
  suiteKolakoski: {
    titre: 'The Kolakoski sequence',
    enUnePhrase: 'A row of 1s and 2s where the sizes of the clumps spell out the row itself.',
    colonnes: ['how far along', 'how many more 1s than 2s so far', 'the digit (1 or 2)'],
    aRegarder: ['The count of 1s minus 2s wanders but stays small: about as many of each.', 'Nobody has proved that it settles at exactly one half.', 'The simple pattern 1, 2, 1, 2 does not describe itself.'],
    fin: null,
  },
  /* game207 (idee : codex Grok Bot) */
  suiteRecaman: {
    titre: 'The Recaman sequence',
    enUnePhrase: 'At step n, go back n if you land on a new positive number, otherwise go forward n.',
    colonnes: ['which step', 'where you land', 'back or forward'],
    aRegarder: ['The path swings back and forth in growing arcs.', 'Stepping back never lands on an old number, but stepping forward can.', 'Nobody knows whether every number is reached sooner or later.'],
    fin: null,
  },
  /* game206 (idee : codex Grok Bot) */
  triangleNarayana: {
    titre: 'The Narayana triangle (mountain paths by peaks)',
    enUnePhrase: 'Draw every mountain range of a given width and sort them by how many peaks they have.',
    colonnes: ['how many peaks (relative)', 'how many ranges have that many', 'which width'],
    aRegarder: ['Each row reads the same from both ends.', 'Each row adds up to a Catalan number.', 'Sort by returns to the ground instead and the row is lopsided.'],
    fin: null,
  },
  /* game205 (idee : codex Grok Bot) */
  schroderChemins: {
    titre: 'Large Schroder numbers',
    enUnePhrase: 'Walk up, down or take a long flat stride, start and end on the ground: how many walks are there?',
    colonnes: ['how far along', 'how high you are', 'up, down or long flat'],
    aRegarder: ['The flat strides are two steps long, unlike the Motzkin walks.', 'From size 1 on, the number of walks is always even.', 'Size 0 has exactly one walk, the empty one: an odd count.'],
    fin: null,
  },
  /* game204 (idee : codex Grok Bot) */
  frobeniusPieces: {
    titre: 'The coin problem (two coins)',
    enUnePhrase: 'With only two kinds of coin, some amounts can never be paid: which is the biggest one?',
    colonnes: ['first coin', 'second coin', 'how many amounts you can never pay'],
    aRegarder: ['Bigger coins leave more amounts you cannot pay.', 'For coins 3 and 5 you cannot pay 1, 2, 4 or 7, and everything from 8 on works.', 'Coins 6 and 9 share a factor: you can never pay 20, or any amount that is not a multiple of 3.'],
    fin: null,
  },
  /* game203 (idee : codex Grok Bot) */
  goldbachPaires: {
    titre: 'Goldbach splits (two odd primes)',
    enUnePhrase: 'Can every even number be written as the sum of two odd primes? Each one here is split and its splits counted.',
    colonnes: ['which even number', 'how many ways it splits', 'what is left after dividing by 3'],
    aRegarder: ['The cloud climbs: bigger even numbers have more ways to split.', 'Here, multiples of 3 sit higher on average than the other even numbers (measured from 30 on).', 'Nobody has proved it for all even numbers; 4 is the one that cannot (it would need 2 + 2).'],
    fin: null,
  },
  /* game202 (idee : codex Grok Bot) */
  indicatriceEuler: {
    titre: 'Euler totient function',
    enUnePhrase: 'For each number, count the smaller numbers that share no factor with it.',
    colonnes: ['which number', 'what share of the numbers below it are coprime', 'how many different primes divide it'],
    aRegarder: ['Primes sit at the top: almost every number below a prime is coprime to it.', 'Numbers with many small primes sit low.', 'Add the counts of all the divisors of n and you get n back, every time.'],
    fin: null,
  },
  /* game201 (idee : codex Grok Bot) */
  periodePisano: {
    titre: 'Pisano periods (Fibonacci on a clock)',
    enUnePhrase: 'Add the last two numbers, but on a clock with m hours: how long until the pattern repeats?',
    colonnes: ['how many hours on the clock', 'how long the loop is', 'how many times it hits 0 in one loop'],
    aRegarder: ['Every clock loops back, sooner or later.', 'Two clocks that share no factor: the loop of the big clock is the lcm of their loops.', 'Only the 2-hour clock has an odd loop, 3.'],
    fin: null,
  },
  /* game200 (idee : codex Grok Bot) */
  motzkinChemins: {
    titre: 'Motzkin numbers (paths above the floor)',
    enUnePhrase: 'Walk up, down or flat, start and end on the ground, never dig below it: how many walks are there?',
    colonnes: ['which step', 'how high you are', 'up, down or flat'],
    aRegarder: ['The walk always comes back to the ground at the end.', 'It never dips below the floor.', 'Allow digging and there are more walks: 3 of length 2 instead of 2.'],
    fin: null,
  },
  /* game199 (idee : codex Grok Bot) */
  stirlingBell: {
    titre: 'Stirling and Bell numbers',
    enUnePhrase: 'How many ways can you split a group of friends into teams? Every way is listed and counted here.',
    colonnes: ['which friend', 'which team they are in', 'how many teams exist so far'],
    aRegarder: ['Each friend joins an existing team or starts a new one.', 'The counts per number of teams add up to the Bell number.', 'If the teams have names, every split is counted twice.'],
    fin: null,
  },
  /* game198 (idee : codex Grok Bot) */
  routineKaprekar: {
    titre: 'Kaprekar routine',
    enUnePhrase: 'Sort the digits big to small, then small to big, subtract, and repeat: where do you end up?',
    colonnes: ['which start', 'how many steps (relative)', 'how many different digits'],
    aRegarder: ['Almost every start lands on the same number, and stays there.', 'No start needs more than a handful of steps.', 'Numbers like 1111 fall straight to 0 instead.'],
    fin: null,
  },
  /* game197 (idee : codex Grok Bot) */
  suiteCollatz: {
    titre: 'The Collatz sequence (3n + 1)',
    enUnePhrase: 'Halve it if even, triple it and add 1 if odd: does every number fall back to 1?',
    colonnes: ['which start', 'how long it flies (relative)', 'how many times it was tripled'],
    aRegarder: ['Neighbouring numbers can fly for very different times.', 'Every start shown here does come down to 1: nobody knows if all do.', 'Change 3n + 1 to 3n - 1 and 5 loops forever.'],
    fin: null,
  },
  /* game196 (idee : codex Grok Bot) */
  nombresHarmoniques: {
    titre: 'Harmonic numbers',
    enUnePhrase: 'Add 1 + 1/2 + 1/3 + ... and keep the exact fraction: it grows forever, but slowly, like a logarithm.',
    colonnes: ['how far along', 'how far above the logarithm', 'how many 2s in the bottom of the fraction'],
    aRegarder: ['The gap above the logarithm settles down to a constant.', 'The label climbs by one at every power of 2.', 'After the first step the sum is never a whole number again.'],
    fin: null,
  },
  /* game195 (idee : codex Grok Bot) */
  derangements: {
    titre: 'Derangements (no one gets their own hat back)',
    enUnePhrase: 'Shuffle the hats so that nobody gets their own: how many ways are there?',
    colonnes: ['person', 'hat they get', 'how many seats away their hat is'],
    aRegarder: ['No point lies on the diagonal: nobody keeps their own hat.', 'The count is always the whole number nearest to n! divided by e.', 'Except for zero people, where there is one (empty) way but n!/e rounds to 0.'],
    fin: null,
  },
  /* game194 (idee : codex Grok Bot) */
  regarderDire: {
    titre: 'The look-and-say sequence',
    enUnePhrase: 'Read the number aloud to get the next one: 1, one 1, two 1s, one 2 one 1, ...',
    colonnes: ['which term', 'how long (log scale)', 'how many different digits'],
    aRegarder: ['The terms keep growing, by about a third each time.', 'Only the digits 1, 2 and 3 ever appear, and never three 3s in a row.', 'Start from 22 instead and nothing ever changes.'],
    fin: null,
  },
  /* game193 (idee : codex Grok Bot) */
  toursHanoi: {
    titre: 'Towers of Hanoi (and the Gray code)',
    enUnePhrase: 'Move a tower of disks, one at a time and never big on small: it takes 2^n - 1 moves, and the Gray code tells which disk.',
    colonnes: ['time', 'which disk', 'where it goes'],
    aRegarder: ['The smallest disk moves every second turn; the largest moves once, in the middle.', 'Disk number k moves exactly when the k-th bit of the Gray code flips.', 'Counting in ordinary binary flips several bits at once: it does not match the moves.'],
    fin: null,
  },
  /* game192 (idee : codex Grok Bot) */
  calkinWilf: {
    titre: 'The Calkin-Wilf tree (every fraction exactly once)',
    enUnePhrase: 'A family tree of fractions where every positive fraction appears once, already in lowest terms.',
    colonnes: ['place in its row', 'row', 'bigger than 1 or not'],
    aRegarder: ['Under a/b come a/(a + b) and (a + b)/b: nothing else is needed.', 'Row by row, no fraction ever comes twice and none is missing.', 'Listing fractions along diagonals, as Cantor did, repeats 1/1 as 2/2, 3/3, ...'],
    fin: null,
  },
  /* game191 (idee : codex Grok Bot) */
  theoremeLucas: {
    titre: 'Lucas\'s theorem (Pascal\'s triangle modulo a prime)',
    enUnePhrase: 'Colour Pascal\'s triangle by remainders modulo a prime and a fractal appears; Lucas\'s rule predicts every cell.',
    colonnes: ['across', 'down', 'remainder'],
    aRegarder: ['Modulo 2 the triangle becomes Sierpinski\'s gasket; modulo 3 and 5 other fractals appear.', 'Each cell is the product of small binomials of the digits in base p.', 'With 4, which is not prime, the digit rule breaks.'],
    fin: null,
  },
  /* game190 (idee : codex Grok Bot) */
  zeckendorf: {
    titre: 'Zeckendorf representation (numbers made of Fibonacci)',
    enUnePhrase: 'Every whole number is a sum of Fibonacci numbers that are never neighbours, and in only one way.',
    colonnes: ['which Fibonacci number', 'the number n', 'how many terms'],
    aRegarder: ['Each row is a number, each dot one Fibonacci number in its sum: no two dots touch.', 'Every possible way is counted: there is always exactly one.', 'Allow neighbours and 3 can be 3 or 2 + 1: the uniqueness is gone.'],
    fin: null,
  },
  /* game189 (idee : codex Grok Bot) */
  problemeJosephus: {
    titre: 'The Josephus problem (who is left standing)',
    enUnePhrase: 'People stand in a circle and every k-th one steps out: which place survives to the end?',
    colonnes: ['across', 'up', 'when they step out'],
    aRegarder: ['The colours show the order in which people leave; the brightest is the survivor.', 'With every second person out, the survivor is 2L + 1 when n = 2^a + L.', 'That neat formula does not work when every third person leaves.'],
    fin: null,
  },
  /* game188 (idee : codex Grok Bot) */
  nombresBernoulli: {
    titre: 'Bernoulli numbers',
    enUnePhrase: 'A strange list of fractions that holds the formula for adding up the first n squares, cubes, and higher powers.',
    colonnes: ['n', 'size (powers of ten)', 'sign'],
    aRegarder: ['They shrink at first, then grow huge, changing sign every second step.', 'With them, the sum of the first m p-th powers is a short exact formula.', 'Writing B_1 = +1/2 (an older habit) shifts every such sum by one term.'],
    fin: null,
  },
  /* game187 (idee : codex Grok Bot) */
  parfaitsAmicaux: {
    titre: 'Perfect and amicable numbers',
    enUnePhrase: 'A perfect number is the sum of its own divisors; two amicable numbers are each the sum of the other\'s.',
    colonnes: ['n (as a share of the limit)', 'divisor sum over n', 'perfect, amicable, or ordinary'],
    aRegarder: ['Only four perfect numbers lie below 10 000: 6, 28, 496 and 8128.', 'Every even perfect number found has the form 2^(p-1) times a Mersenne prime.', 'Nobody knows whether an odd perfect number exists.'],
    fin: null,
  },
  /* game186 (idee : codex Grok Bot) */
  fonctionMertens: {
    titre: 'The Mertens function (a walk made of +1, -1 and 0)',
    enUnePhrase: 'Each number steps up, down or stays, depending on its prime factors: the walk is the Mertens function.',
    colonnes: ['n (as a share of the limit)', 'M(n) scaled', 'the step: down, none, up'],
    aRegarder: ['The walk wanders around zero without drifting away.', 'Adding M(n), M(n/2), M(n/3), ... always gives exactly 1.', 'With the Liouville function the same sum gives the square root of n instead.'],
    fin: null,
  },
  /* game185 (idee : codex Grok Bot) */
  theoremeWilson: {
    titre: 'Wilson\'s theorem',
    enUnePhrase: 'Multiply all the numbers below n and divide by n: the remainder is n - 1 exactly when n is prime.',
    colonnes: ['n (as a share of the limit)', 'remainder divided by n', 'prime or not'],
    aRegarder: ['The primes sit near the top line: their remainder is n - 1.', 'The composites fall to the bottom: remainder 0.', 'Except n = 4, where 1 x 2 x 3 = 6 leaves 2.'],
    fin: null,
  },
  /* game184 (idee : codex Grok Bot) */
  nombresCarmichael: {
    titre: 'Carmichael numbers (numbers that fool Fermat)',
    enUnePhrase: 'Some numbers that are not prime still pass Fermat\'s test for every base: they are the Carmichael numbers.',
    colonnes: ['which number (in order)', 'one of its prime factors', 'liar for base 2 only, or for every base'],
    aRegarder: ['561 = 3 x 11 x 17 is the smallest: it fools every base.', 'Below 10 000 there are only seven of them.', '341 fools the base 2 but is caught by the base 3.'],
    fin: null,
  },
  /* game183 (idee : codex Grok Bot) */
  equationPell: {
    titre: 'Pell\'s equation x^2 - D y^2 = 1',
    enUnePhrase: 'Find whole numbers with x squared minus D times y squared equal to one: the square root of D knows the answer.',
    colonnes: ['which fraction', 'its value', 'above or below'],
    aRegarder: ['The fractions close in on the square root of D, landing above and below it in turn.', 'For D = 13 the smallest answer is 649 and 180 ; for D = 61 it has ten digits.', 'x^2 - 3 y^2 = -1 never works: not every equation of this kind has a solution.'],
    fin: null,
  },
  /* game182 (idee : codex Grok Bot) */
  sommesCarres: {
    titre: 'Sums of squares (Jacobi)',
    enUnePhrase: 'How many ways can a number be written as a sum of four squares? Its divisors tell you exactly.',
    colonnes: ['a', 'b', 'a squared plus b squared'],
    aRegarder: ['Each colour is one circle of whole points: the ways to write m as a sum of two squares.', 'Every way to write each number up to n is counted, and matches the divisor formulas.', 'Forgetting the rule about divisors by 4 breaks the count from n = 4.'],
    fin: null,
  },
  /* game181 (idee : codex Grok Bot) */
  ptolemee: {
    titre: 'Ptolemy\'s theorem (four points on a circle)',
    enUnePhrase: 'For four points on a circle, diagonal times diagonal equals side times opposite side, added twice.',
    colonnes: ['across', 'up', 'circle, quadrilateral, or diagonals'],
    aRegarder: ['Change the seed: any four points of the circle obey the same rule.', 'The lengths are square roots, but the rule is checked exactly through their squares.', 'Push one corner off the circle and the sides win: their products add up to more than the diagonals.'],
    fin: null,
  },
  /* game180 (idee : codex Grok Bot) */
  pascalHexagramme: {
    titre: 'Pascal\'s hexagram (six points on a circle)',
    enUnePhrase: 'Join six points of a circle into a hexagon: the three pairs of opposite sides meet on one straight line.',
    colonnes: ['across', 'up', 'circle, hexagon, or the line'],
    aRegarder: ['Extend each pair of opposite sides until they meet: the three meeting points line up.', 'Turn on the crossing switch: even a star-shaped hexagon that crosses itself obeys the rule.', 'Move one point off the circle and the line breaks.'],
    fin: null,
  },
  /* game179 (idee : codex Grok Bot) */
  ramseyR33: {
    titre: 'Ramsey number R(3, 3) = 6',
    enUnePhrase: 'Colour every line between 6 points red or blue: a one-colour triangle always appears.',
    colonnes: ['across', 'up', 'colour'],
    aRegarder: ['With 5 points there are exactly 12 ways to avoid it: red and blue each make a five-pointed loop.', 'With 6 points every one of the 32 768 colourings has a one-colour triangle (shown in its own colour).', 'Forbidding only red triangles leaves many colourings: both colours are needed.'],
    fin: null,
  },
  /* game178 (idee : codex Grok Bot) */
  triangulations: {
    titre: 'Triangulations of a polygon (Catalan numbers)',
    enUnePhrase: 'Cut a polygon into triangles with lines from corner to corner that never cross: count the ways.',
    colonnes: ['across', 'up', 'polygon or diagonal'],
    aRegarder: ['A hexagon can be cut 14 ways, a decagon 1430 ways: the Catalan numbers.', 'Change the seed to draw another cut, chosen fairly among all of them.', 'In a pentagon, half of the pairs of diagonals cross: crossing is what is forbidden.'],
    fin: null,
  },
  /* game177 (idee : codex Grok Bot) */
  distinctesImpaires: {
    titre: 'Distinct parts equal odd parts (Euler)',
    enUnePhrase: 'Writing n with all-different numbers can be done exactly as many ways as writing it with only odd numbers.',
    colonnes: ['across', 'down', 'distinct side or odd side'],
    aRegarder: ['Left: a sum of different numbers. Right: the same total made only of odd numbers.', 'Each even part is halved again and again until it is odd: that is the bridge between the two sides.', 'Allowing any parts gives more ways: from n = 2 on (1 + 1 repeats a part), the restriction counts.'],
    fin: null,
  },
  /* game176 (idee : codex Grok Bot) */
  simsonDroite: {
    titre: 'The Simson line (three feet on one line)',
    enUnePhrase: 'Pick a point on the circle around a triangle and drop a perpendicular to each side: the three feet line up.',
    colonnes: ['across', 'up', 'triangle, circle, perpendiculars, or the line'],
    aRegarder: ['The feet may land on the sides extended beyond the triangle: they still line up.', 'Move the chord slider: the point slides round the circle and the line turns.', 'Push the point just outside the circle and the three feet no longer line up.'],
    fin: null,
  },
  /* game175 (idee : codex Grok Bot) */
  bale: {
    titre: 'The Basel problem (1 + 1/4 + 1/9 + ... = pi^2/6)',
    enUnePhrase: 'Add one over every square number: the total creeps up to pi squared over six and never reaches it.',
    colonnes: ['one over the number of terms', 'value', 'sum, limit, or band'],
    aRegarder: ['The dots climb towards the line pi^2/6 without ever touching it.', 'The gap is always between 1/(n+1) and 1/n : checked for every n.', 'Without the squares, 1 + 1/2 + 1/3 + ... passes pi^2/6 after three terms and never stops.'],
    fin: null,
  },
  /* game174 (idee : codex Grok Bot) */
  morley: {
    titre: 'Morley\'s theorem (cut every angle in three)',
    enUnePhrase: 'Split each corner of any triangle into three equal angles: the lines meet in a perfect equilateral triangle.',
    colonnes: ['across', 'up', 'triangle, trisectors, or Morley triangle'],
    aRegarder: ['Move the two angle sliders: however lopsided the triangle, the middle one stays equilateral.', 'Its side is 8 R sin(A/3) sin(B/3) sin(C/3), and the three measured sides match it.', 'Cutting the angles in four gives a triangle that is not equilateral.'],
    fin: null,
  },
  /* game172 (idee : codex Grok Bot) */
  eulerSolides: {
    titre: 'Euler\'s formula on five more solids',
    enUnePhrase: 'Count the corners, take away the edges, add the faces: for any solid without a hole you always get 2.',
    colonnes: ['x', 'y', 'z'],
    aRegarder: ['Pick another solid: the football has 60 corners, 90 edges and 32 faces, and 60 - 90 + 32 = 2 ; the snub dodecahedron 60, 150 and 92.', 'The three numbers are counted from the shape itself, none is worked out from the other two.', 'A frame with a hole in the middle gives 0, not 2.'],
    fin: null,
  },
  /* game171 (idee : codex Grok Bot) */
  marcheAutoEvitante: {
    titre: 'Self-avoiding walks (paths that never cross themselves)',
    enUnePhrase: 'Walk on a grid without ever stepping on a point you have already visited: how many such walks are there?',
    colonnes: ['across', 'up', 'which step'],
    aRegarder: ['Nobody knows a formula for the number of these walks: here every one of them is counted.', 'Change the seed to draw another of the walks, chosen among all of them.', 'Just refusing to step straight back is not enough: from 4 steps on, such walks can close a little square.'],
    fin: null,
  },
  /* game170 (idee : codex Grok Bot) */
  jeuDeLaVie: {
    titre: 'Game of Life oscillators (patterns that blink forever)',
    enUnePhrase: 'Cells live or die by counting their neighbours, and some shapes come back to themselves again and again.',
    colonnes: ['across', 'up', 'which generation'],
    aRegarder: ['Every colour is one generation; together they show the whole cycle of the shape.', 'The blinker repeats every 2 steps, the pulsar every 3, the pentadecathlon every 15.', 'A glider never comes back to the same place: it walks away diagonally.'],
    fin: null,
  },
  /* game169 (idee : codex Grok Bot) */
  feuerbach: {
    titre: 'Feuerbach\'s theorem (the circle that touches four circles)',
    enUnePhrase: 'Every triangle has a special circle through nine points that touches its inner circle and its three outer circles.',
    colonnes: ['across', 'up', 'triangle or which circle'],
    aRegarder: ['The nine-point circle kisses the small inner circle from inside and each of the three big outer circles from outside.', 'Change the seed: another triangle with whole-number sides, and the four touches are checked as exact fractions.', 'The circle through the three corners does not touch the inner circle: that is the witness.'],
    fin: null,
  },
  /* game168 (idee : codex Grok Bot) */
  billardElliptique: {
    titre: 'The elliptic billiard (a ball that never forgets its caustic)',
    enUnePhrase: 'A ball bounces inside an oval table: every straight run touches one same hidden curve.',
    colonnes: ['across', 'up', 'table, path, or caustic'],
    aRegarder: ['The runs wrap around an inner oval, or cross between the two foci and wrap around a hyperbola.', 'Change the shot angle: the hidden curve changes, but it stays the same for the whole game.', 'Bouncing off the table as if it were round breaks the rule.'],
    fin: null,
  },
  /* game167 (idee : codex Grok Bot) */
  napoleon: {
    titre: 'Napoleon\'s theorem (three centres always make an equilateral triangle)',
    enUnePhrase: 'Stick an equilateral triangle on each side of any triangle: the three centres always form an equilateral triangle.',
    colonnes: ['across', 'up', 'triangle, added triangles, or Napoleon triangle'],
    aRegarder: ['Change the seed: any triangle, thin or wide, gives an equilateral one in the middle.', 'The sides are compared as exact numbers a + b sqrt 3, not as decimals that happen to be close.', 'With squares instead of triangles the centres no longer make an equilateral triangle.'],
    fin: null,
  },
  /* game166 (idee : codex Grok Bot) */
  percolationLiens: {
    titre: 'Bond percolation (a fair coin for every link)',
    enUnePhrase: 'Toss a coin for every link of a grid: is there an open road from the left side to the right side?',
    colonnes: ['across', 'up', 'which cluster'],
    aRegarder: ['A rectangle one cell wider than high is crossed exactly half of the time, however big it is.', 'The clusters that touch the left side are coloured; the one that reaches the right side crosses.', 'A square is not a fair coin: it is crossed more often than half.'],
    fin: null,
  },
  /* game165 (idee : codex Grok Bot) */
  theoremePick: {
    titre: 'Pick\'s theorem (the area of a polygon by counting dots)',
    enUnePhrase: 'Put a polygon on a grid of dots, corners on dots: count the dots inside and on the edge, and you know its area.',
    colonnes: ['across', 'up', 'outline, dot inside, or dot on the edge'],
    aRegarder: ['Every dot inside counts 1, every dot on the edge counts one half, and one is taken away: that is the area exactly.', 'Change the seed: a new polygon, and the count still gives the shoelace area.', 'A bow tie that crosses itself breaks the rule: the polygon must not cross itself.'],
    fin: null,
  },
  /* game164 (idee : codex Grok Bot) */
  courbeDragon: {
    titre: 'The dragon curve (a strip of paper folded n times)',
    enUnePhrase: 'Fold a strip of paper in half again and again, open every fold to a right angle: the strip draws a dragon.',
    colonnes: ['across', 'up', 'fold that made the segment'],
    aRegarder: ['The curve touches itself at corners but never runs over the same segment twice.', 'Add one fold: the dragon doubles and turns by 45 degrees.', 'The colours show which fold made each segment: the first folds are spread all along the curve.'],
    fin: null,
  },
  /* game163 (idee : codex Grok Bot) */
  partitionEuler: {
    titre: 'Integer partitions (all the ways to split a number)',
    enUnePhrase: 'A random way of writing n as a sum, drawn as rows of squares that never get longer going down: a Young diagram.',
    colonnes: ['column', 'row', 'row number'],
    aRegarder: ['Each row is a part of the sum; rows never get longer as you go down.', 'There are 190 569 292 partitions of 100, and Euler found a short rule to count them.', 'Large random partitions all take the same curved shape at their edge.'],
    fin: null,
  },
  /* game162 (idee : codex Grok Bot) */
  catalanDyck: {
    titre: 'Catalan numbers and Dyck paths (mountains that never sink)',
    enUnePhrase: 'Mountain ranges made of up and down steps that never dip below the ground: there are exactly C_n of them.',
    colonnes: ['step', 'height', 'path'],
    aRegarder: ['Every path starts and ends on the ground and never goes below it.', 'Long random paths look like a rough hill: their height grows like the square root of their length.', 'With 5 ups and 5 downs there are 42 such ranges; without the ground rule there would be 252.'],
    fin: null,
  },
  /* game161 (idee : codex Grok Bot) */
  ruineJoueur: {
    titre: 'Gambler\'s ruin (how likely is a player to go broke)',
    enUnePhrase: 'A player bets one at a time until ruined or rich enough: the odds of ruin follow an exact formula.',
    colonnes: ['bets played', 'fortune', 'game'],
    aRegarder: ['In a fair game, starting halfway to the target gives exactly a 50 percent chance of ruin.', 'Give the player a small edge (win 55 percent): ruin becomes rare.', 'Games can last a long time: the mean length is z (a - z) in a fair game.'],
    fin: null,
  },
  /* game160 (idee : codex Grok Bot) */
  collectionneur: {
    titre: 'The coupon collector (how long to complete the set)',
    enUnePhrase: 'Draw coupons at random until you own every one: the first come fast, the last ones take forever.',
    colonnes: ['draws so far', 'different coupons owned', 'collection (0 = exact mean)'],
    aRegarder: ['Every curve rises fast, then crawls: the last missing coupon is the hardest to get.', 'The smooth curve is the exact mean; real collections wander around it.', 'With 50 coupons you need about 225 draws on average, n (1 + 1/2 + ... + 1/n).'],
    fin: null,
  },
  /* game159 (idee : codex Grok Bot) */
  aztecDiamond: {
    titre: 'The Aztec diamond (a random tiling and its arctic circle)',
    enUnePhrase: 'A diamond tiled by dominoes, chosen uniformly at random among all its tilings: the corners freeze, the middle stays wild.',
    colonnes: ['across', 'up', 'arrow of the domino (N, S, E, W)'],
    aRegarder: ['Each corner is one solid colour: there the dominoes all line up like bricks.', 'The wild middle is round: its edge hugs a circle of radius n/sqrt 2.', 'Change the seed: the inside changes completely, the circle stays.'],
    fin: null,
  },
  /* game158 (idee : codex Grok Bot) */
  ising: {
    titre: 'The Ising model (tiny magnets that like to agree)',
    enUnePhrase: 'Magnets on a grid, each preferring to point like its neighbours: hot, they are a noisy mess; cold, large patches line up.',
    colonnes: ['across', 'up', 'spin (+1 or -1)'],
    aRegarder: ['Raise beta (colder): the patches grow until one direction wins.', 'Lower beta (hotter): the grid looks like noise, no direction lasts.', 'Near beta = 0.44 the patches come in every size: the edge of the transition of an endless grid.'],
    fin: null,
  },
  /* game157 (idee : codex Grok Bot) */
  dominosKasteleyn: {
    titre: 'Domino tilings (every way to cover a rectangle)',
    enUnePhrase: 'All the ways to cover a rectangle with dominoes are counted exactly; the picture is one of them, drawn uniformly at random.',
    colonnes: ['across', 'up', 'domino (0 = lying, 1 = standing)'],
    aRegarder: ['Change the seed: another tiling, equally likely, from the same huge list.', 'An 8 x 8 board has 12 988 816 tilings, exactly the number Kasteleyn\'s formula gives.', 'Make the area odd: no tiling exists at all.'],
    fin: null,
  },
  /* game155 (idee : codex Grok Bot) */
  papillonHofstadter: {
    titre: 'Hofstadter\'s butterfly (an electron in a magnetic field)',
    enUnePhrase: 'For every magnetic flux p/q, the energies an electron may have on a square grid: together they draw a butterfly that repeats itself inside its own wings.',
    colonnes: ['flux p/q', 'energy', 'denominator q'],
    aRegarder: ['Each column at p/q holds exactly q bands of allowed energy.', 'At even q, look at zero energy: the two middle bands touch there.', 'Small copies of the whole butterfly sit inside the wings: the pattern is self-similar.'],
    fin: null,
  },
  /* game154 (idee : codex Grok Bot) */
  causticTasse: {
    titre: 'The bright curve in a cup (a caustic)',
    enUnePhrase: 'Sunlight reflected inside a round cup crowds along one bright curve: here each pair of neighbouring rays is crossed to find it.',
    colonnes: ['across', 'up', 'what (0 = bright line found, 1 = the cup, 2 = reflected rays)'],
    aRegarder: ['The curve has a sharp point exactly halfway between the centre and the wall.', 'Follow a reflected ray: it touches the bright curve once, then carries on; the curve is where the rays crowd.', 'Add rays: the crossings settle on the nephroid, the curve Huygens described in 1690.'],
    fin: null,
  },
  /* game153 (idee : codex Grok Bot) */
  fermatSteiner: {
    titre: 'The shortest roads between four towns (Steiner tree)',
    enUnePhrase: 'Four towns at the corners of a rectangle, joined by the shortest roads when two extra crossroads are allowed.',
    colonnes: ['across', 'up', 'network (0 = shortest, 1 = the other shape)'],
    aRegarder: ['At each crossroad the three roads meet at exactly 120 degrees, like soap films between pins.', 'The other shape (label 1) uses the same rule but is longer: the bridge goes the short way.', 'Make the rectangle a square: both shapes tie at 1 + sqrt 3, about 2.732.'],
    fin: null,
  },
  /* game152 (idee : codex Grok Bot) */
  cerclesFord: {
    titre: 'Ford circles (every fraction gets a circle)',
    enUnePhrase: 'On each fraction p/q between 0 and 1 sits a circle of radius 1/(2 q^2): the circles never overlap, and neighbouring fractions touch.',
    colonnes: ['the fraction p/q on the line', 'height above the line', 'denominator q'],
    aRegarder: ['The two big circles stand on 0 and 1, the next on 1/2, then 1/3 and 2/3: each new circle fits exactly in a gap.', 'Between two touching circles p/q and r/s, the next one to appear is the mediant (p + r)/(q + s).', 'Raise the order: the gaps fill with smaller and smaller circles, but none ever overlaps another.'],
    fin: null,
  },
  /* game151 (idee : codex Grok Bot) */
  vergerEuclide: {
    titre: 'Euclid\'s orchard (the trees you can see from the corner)',
    enUnePhrase: 'A tree at every whole point; standing at the corner you see only the trees with nothing in front of them, the points (a, b) with no common factor.',
    colonnes: ['trees across (a)', 'trees up (b)', 'row max(a, b)'],
    aRegarder: ['Gaps line up along every line through the corner with a simple slope like 1, 1/2 or 2/3: the trees behind the first one are hidden.', 'The diagonal is empty except for its very first tree.', 'Make the orchard bigger: the share seen settles near 61 percent, 6/pi^2, but never lands on it exactly.'],
    fin: null,
  },
  /* game150 (idee : codex Grok Bot) */
  tasDeSable: {
    titre: 'The abelian sandpile (the identity of the sandpile group)',
    enUnePhrase: 'Grains on a grid: a cell with four grains topples and gives one to each neighbour. The picture is the one pile that, added to any recurrent pile, gives that pile back.',
    colonnes: ['cell, across', 'cell, down', 'grains on the cell (0 to 3)'],
    aRegarder: ['The pattern is not drawn by hand: it comes only from adding grains and letting them topple.', 'Change the side of the grid: the identity changes, but keeps its square symmetry.', 'Whatever order the cells topple in, the end is the same: the count of piles that keep coming back is exactly the determinant of the grid.'],
    fin: null,
  },
  /* game149 (idee : codex Grok Bot) */
  haloGlace: {
    titre: 'The 22 degree halo (light through ice prisms)',
    enUnePhrase: 'The sky around the Sun as seen through tiny six-sided ice prisms: each ray traced through a crystal is placed at the angle it was turned by.',
    colonnes: ['degrees from the Sun, across', 'degrees from the Sun, up', 'path (0 = faces 60 degrees apart, 1 = faces 90 degrees apart, the witness)'],
    aRegarder: ['No ray lands inside the ring: no crystal can turn the light by less than a minimum angle.', 'The ring is sharp on its inner edge and fades outwards: crystals near the best orientation all send their light to the same place.', 'The wider, fainter ring is the witness: crystals with faces 90 degrees apart make the 46 degree halo. Raise the index n and both rings widen.'],
    fin: null,
  },
  /* game148 (idee : codex Grok Bot) */
  apollonius: {
    titre: 'Circles inside circles (the gasket of Apollonius)',
    enUnePhrase: 'Circles packed into a circle: every gap between three touching circles receives the circle that touches all three, generation after generation.',
    colonnes: ['x', 'y', 'generation (label; -1 = the three starting circles)'],
    aRegarder: ['Each circle is found by geometry alone, then checked: its curvature obeys the theorem of Descartes to the last digits.', 'Every generation triples the number of gaps: 2, 6, 18, 54, 162... circles, and the gaps never fill up.', 'Start with two equal circles: every curvature is then a whole number (2, 3, 6, 11, 14, 15...); start unequal and they are not.'],
    fin: null,
  },
  pascalSierpinski: {
    titre: 'The triangle of Pascal, odd numbers only (Sierpinski)',
    enUnePhrase: 'The odd numbers of the triangle of Pascal, row by row from the top: the Sierpinski triangle.',
    colonnes: ['position in the row', 'row (from the top)', 'row number n (a label)'],
    aRegarder: ['Row n has exactly 2^(number of 1s in n in binary) odd numbers.', 'The first 2^m rows hold exactly 3^m of them.', 'The pattern repeats itself at every scale: a fractal.'],
    fin: null,
  },
  /* game120 : ondes (tam-ondes.js) */
  arcEnCiel: {
    titre: 'Why a rainbow (rays in a raindrop)',
    enUnePhrase: 'Light rays coming from the left, bending into a round drop, bouncing once off its back and leaving.',
    colonnes: ['x (drop of radius 1)', 'y (same)', 'height b at which the ray came in (a label)'],
    aRegarder: ['Every ray turns back by at least one smallest angle, and many rays leave close to it: the light piles up there.', 'That angle is Descartes\' exact cos^2 i = (n^2 - 1)/3; the rainbow sits at 180 degrees minus it.', 'Change the index n: a different colour bends differently, which spreads the bow into colours.'],
    fin: null,
  },
  cordeVibrante: {
    titre: 'A plucked string (the wave equation)',
    enUnePhrase: 'A string plucked at one point, frame by frame over half a period.',
    colonnes: ['position along the string (0 to 1)', 'displacement u', 'time (in units of L / c)'],
    aRegarder: ['The kink splits in two and travels both ways; after half a period the shape is upside down and mirrored.', 'After a full period the string is back in its exact starting shape (the scheme is exact for this equation).', 'Pluck it in the middle: every even harmonic vanishes.'],
    fin: null,
  },
  effetDoppler: {
    titre: 'The Doppler effect and the sonic boom',
    enUnePhrase: 'The wavefronts sent once per period by a source moving to the right.',
    colonnes: ['x (wavelengths)', 'y (wavelengths)', 'time the front was sent (a label)'],
    aRegarder: ['Ahead of the source the fronts bunch up to (c - v) T: a higher pitch.', 'Behind they spread to (c + v) T: a lower pitch.', 'Faster than the waves (M > 1) the fronts gather on a cone with sin(theta) = 1/M: the sonic boom.'],
    fin: null,
  },
  /* game118 */
  gazParfait: {
    titre: 'An ideal gas (molecules in a box)',
    enUnePhrase: 'Molecules flying in a square box and bouncing off its walls, frame by frame.',
    colonnes: ['x in the box', 'y in the box', 'speed of the molecule (a label)'],
    aRegarder: ['Each hit on the right wall is counted; the push per unit length is the pressure.', 'It follows the ideal gas law P A = N T: double the temperature, double the pressure.', 'Speeds spread out as Maxwell predicts; their mean is exactly sqrt(pi T / 2).'],
    fin: null,
  },
  hardyWeinberg: {
    titre: 'Hardy-Weinberg (one generation of random mating)',
    enUnePhrase: 'Parents (below) that are all AA or aa, and their children (above) after one round of random mating.',
    colonnes: ['copies of allele A (0, 1, 2)', 'generation (0 = parents, 1 = children)', 'individual number (a label)'],
    aRegarder: ['The parents have no Aa at all, yet the children have a share 2 p q of them.', 'One generation is enough: AA : Aa : aa = p^2 : 2 p q : q^2, exactly.', 'A finite number of children: the match is statistical.'],
    fin: null,
  },
  /* game115 : mathematiques (tam-maths.js) */
  marcheAleatoire: {
    titre: 'Random walks on a grid',
    enUnePhrase: 'The path of a walker stepping to a random neighbour on a grid, one walker per frame.',
    colonnes: ['x (grid steps)', 'y (grid steps)', 'step number'],
    aRegarder: ['Each path wanders with no plan, yet the mean squared distance after n steps is exactly n.', 'Doubling the steps only multiplies the typical distance by sqrt 2.', 'A finite number of walkers: the match is statistical.'],
    fin: null,
  },
  aiguilleBuffon: {
    titre: 'Buffon\'s needles (finding pi by throwing needles)',
    enUnePhrase: 'Needles thrown at random on a floor of boards one unit wide; each needle is drawn by its two ends.',
    colonnes: ['x (floor widths)', 'y (floor widths; the lines are at whole numbers)', 'crosses a line (1) or not (0)'],
    aRegarder: ['The share of needles crossing a line is exactly 2 l / pi.', 'So the needles estimate pi: 2 l divided by that share.', 'The estimate tightens slowly: four times the needles for twice the precision.'],
    fin: null,
  },
  anniversaires: {
    titre: 'The birthday paradox',
    enUnePhrase: 'The birthdays of groups of people drawn round a circle, one ring per group.',
    colonnes: ['x (birthday as an angle round the circle)', 'y (same)', 'group number (a label)'],
    aRegarder: ['With 23 people and 365 days, two share a birthday more often than not: 1 - prod (1 - i/D) is above one half.', 'There are k (k - 1) / 2 pairs in a group, each with a 1/D chance: that is why it happens so fast.', 'A finite number of groups: the match is statistical.'],
    fin: null,
  },
  spiraleUlam: {
    titre: 'Primes on the Ulam spiral',
    enUnePhrase: 'The integers wound in a square spiral from 1 in the middle; only the primes are drawn.',
    colonnes: ['x on the Ulam spiral', 'y on the Ulam spiral', 'the prime itself'],
    aRegarder: ['The primes gather along diagonals, a pattern nobody has fully explained.', 'Their exact count (from a sieve) is compared with Li(N) and N / ln N, approximations from the prime number theorem.', 'Near N, primes are on average about ln N apart.'],
    fin: null,
  },
  /* game113 : chimie (tam-chimie.js) */
  reactionsChaine: {
    titre: 'A chain of reactions A to B to C (Bateman)',
    enUnePhrase: 'Three curves over time: the share of molecules that are still A, that are B in between, and that have become C.',
    colonnes: ['time t', 'share of the molecules (0..1)', 'which species (0 = A, 1 = B, 2 = C)'],
    aRegarder: ['A falls as e^(-k1 t); C rises to take everything in the end.', 'The intermediate B rises then falls, peaking at the exact time t* = ln(k1/k2)/(k1 - k2).', 'A finite number of molecules: the match is statistical, and a new seed gives another run.'],
    fin: null,
  },
  equilibreChimique: {
    titre: 'A reaction going both ways (chemical equilibrium A <-> B)',
    enUnePhrase: 'Molecules hopping between two wells, A on the left and B on the right, frame by frame from an all-A start.',
    colonnes: ['x: well A on the left, well B on the right (the place inside a well is drawn)', 'y (drawn)', 'time t'],
    aRegarder: ['The share of B rises as pi (1 - e^(-(kf + kb) t)) with pi = kf / (kf + kb).', 'Molecules never stop hopping, but the flows balance: [B]/[A] settles at K = kf / kb.', 'A finite number of molecules: the match is statistical.'],
    fin: null,
  },
  brusselator: {
    titre: 'A chemical clock (the Brusselator)',
    enUnePhrase: 'Two concentrations of an oscillating reaction over time, from a start next to the balance point (A, B/A).',
    colonnes: ['concentration x', 'concentration y', 'time t'],
    aRegarder: ['Below the exact threshold B = 1 + A^2 the reaction spirals into its balance point at the exact linear rate.', 'Above it the reaction never settles: it ticks on a closed loop like a clock.', 'Near the threshold the period is close to 2 pi / A; further away it is measured only.'],
    fin: null,
  },
  /* ---------- familles hors science ---------- */
  __attracteur: {
    titre: 'Strange attractor',
    enUnePhrase: 'The path of a chaotic system of equations, followed step by step.',
    colonnes: (p) => Array.from({ length: Math.max(2, Math.floor(Number(p && p.D) || 3)) }, (_, j) => 'x' + (j + 1) + ': state variable ' + (j + 1) + ' of the equations (no physical unit)'),
    aRegarder: ['The path never repeats but stays on the same shape: that shape is the attractor.'],
    fin: null,
  },
  __formule: {
    titre: 'Your formula',
    enUnePhrase: 'The points your formula produces.',
    colonnes: ['x of your formula', 'y of your formula', 'z of your formula'],
    aRegarder: ['Change one term at a time and watch which part of the shape moves.'],
    fin: null,
  },
};

/* a legend may say its own colour sentence (string or function of the params) when the generic one would say nothing true about the subject */
const val0 = (v, params) => (typeof v === 'function' ? v(params) : v);
/** la legende complete d un systeme, noms, colonnes et film resolus pour ces params ; null si inconnu */
export function legende(id, params = {}) {
  const e = L[id]; if (!e) return null;
  const colonnes = Object.freeze(typeof e.colonnes === 'function' ? e.colonnes(params) : e.colonnes.slice());
  const noms = nomsDe(id, params);
  const film = filmDe(id, params);
  /* game80 : un film se colore par moment (pas par colonne) ; des objets nommes hors systeme de corps sont dits en plus */
  const couleurs = (e.couleurs ? val0(e.couleurs, params) : CORPS[id] && noms ? couleursCorps(noms, CENTRES[id]) : film ? couleursFilm(film) : couleursDominantes(colonnes))
    /* game81 : un « moment » d un film de champs quantiques n est pas toujours un instant : le module le dit, la legende aussi */
    + (film && FILMS_DU_MODULE[id] && FILMS_DU_MODULE[id].note ? ' Here ' + FILMS_DU_MODULE[id].note + '.' : '')
    + (noms && !CORPS[id] && e.objets ? ' ' + e.objets(noms) : '');
  /* game315: a legend may depend on the settings (titre, enUnePhrase, aRegarder given as functions of the params) */
  const val = (v) => (typeof v === 'function' ? v(params) : v);
  return Object.freeze({
    titre: val(e.titre), enUnePhrase: val(e.enUnePhrase), colonnes, couleurs,
    aRegarder: Object.freeze(val(e.aRegarder).slice()), fin: e.fin,
    /* 2026-11-09 : an optional colour key [{ name, color, knownFor }] when a subject colours its points by class (emotionWiringHCP: its parts) */
    pointColours: e.pointColours ? Object.freeze(val(e.pointColours).slice()) : null,
    film: film ? Object.freeze(film) : null, noms: noms ? Object.freeze(noms) : null,
  });
}
/** toutes les legendes aux params par defaut */
export const LEGENDES = Object.freeze(Object.fromEntries(Object.keys(L).map((id) => [id, legende(id, {})])));
