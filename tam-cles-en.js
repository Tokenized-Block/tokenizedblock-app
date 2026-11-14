/* tam-cles-en.js -- traductions anglaises des libelles des lignes "Check" de l onglet TAM.
   CLES_EN_MODULES : cles numeriques des invariants "simples" (objets de nombres sans mesure/formule,
   mesure/theorie ni derive) que tam-onglet.js affiche une par une ; complete CLES_EN de tam-onglet.js.
   NOMS_MESURES_EN : nom de chaque invariant (cle de simuler(...).invariants) affiche en tete de ligne.
   Le sens de chaque cle est lu dans le module qui construit l invariant ; une cle partagee par plusieurs
   systemes recoit un libelle vrai pour tous (sinon neutre). Unites seulement si le nom de la cle les porte.
   ASCII seulement. Le banc verifie la couverture : chaque cle et chaque nom produit par les 99 systemes
   doit avoir une entree non vide. */

export const CLES_EN_MODULES = Object.freeze({
  A: 'Mathieu parameter A',
  E: 'energy E',
  Gal: 'giga light-years',
  GammaFoisTH: 'Gamma times T_H',
  Gpc: 'gigaparsecs',
  Gyr: 'Gyr',
  H0: 'initial H',
  JPsi: 'J/psi mass',
  K: 'K',
  Kc: 'critical coupling Kc',
  KfoisAire: 'K times area',
  L: 'luminosity L',
  Lz: 'Lz',
  M: 'modes per side M',
  MZ: 'MZ',
  MZleptons: 'at MZ (leptons only)',
  MfOmega: 'M_f omega',
  N: 'N',
  OL: 'Omega Lambda',
  Om: 'Omega matter',
  Or: 'Omega radiation',
  Q0: 'at lowest Q',
  Q10: 'at Q = 10 GeV',
  Q1000: 'at Q = 1000 GeV',
  R: 'R',
  R0: 'basic reproduction number',
  R0s0: 'R0 times s0',
  SI: 'SI units',
  T: 'temperature T',
  T_nK: 'T (nK)',
  Tc: 'critical temperature Tc',
  Tc_nK: 'Tc (nK)',
  a: 'a',
  accelerationSI: 'acceleration (SI)',
  acceptees: 'accepted',
  acceptes: 'accepted',
  accord: 'matching fraction',
  adoucissement: 'softening',
  aimantationFinale: 'final magnetization',
  aire: 'area',
  alpha0Inverse: 'inverse alpha at Q = 0',
  ampMesure: 'measured amplitude',
  ampPhaseStationnaire: 'stationary phase amplitude',
  amplification: 'amplification',
  amplitude: 'amplitude',
  amplitudeCoteM: 'coast amplitude (m)',
  angleOrDegres: 'golden angle (deg)',
  annees: 'years',
  anneesParSeconde: 'years per second',
  arrivee: 'arrival',
  attendu: 'expected',
  avantRip: 'time before rip',
  avecHalo: 'with halo',
  b: 'b',
  b0: 'b0',
  balayages: 'sweeps',
  balmerAlpha: 'Balmer alpha',
  c: 'c',
  cases: 'bins',
  cellulesVisitees: 'cells visited',
  champCritique: 'critical field',
  champSI: 'field (SI)',
  chiEffectif: 'effective spin chi_eff',
  circonference: 'circumference',
  circonferenceFormule: 'circumference formula',
  classique: 'classical',
  coefVariation: 'coefficient of variation',
  condensat: 'condensate',
  coteMesure: 'measured side',
  cycles: 'cycles',
  d: 'd',
  dedans: 'modes inside',
  degres: 'degrees',
  depart: 'departure',
  depassementsDuMax: 'samples above the max',
  deplacementX: 'x displacement',
  dessinees: 'drawn',
  determinant: 'determinant',
  determinantFormule: 'determinant formula',
  deviation: 'deflection',
  deviationFaibleChamp: 'weak-field deflection',
  deviationTotale: 'total deflection',
  df: 'df',
  difference: 'difference',
  differenceFormule: 'difference formula',
  directions: 'directions',
  distanceAuPrimaire: 'distance to primary',
  distanceAuSecondaire: 'distance to secondary',
  dt: 'dt',
  dureeT: 'duration T',
  dx: 'dx',
  e: 'eccentricity e',
  ecart: 'difference',
  ecartGaussBonnet: 'Gauss-Bonnet deviation',
  ecartMax: 'max deviation',
  ecartMaxRelatif: 'max relative deviation',
  ecartMedian: 'median deviation',
  ecartP: 'p deviation',
  ecartRadialMax: 'max radial deviation',
  ecartX: 'x deviation',
  echappementMax: 'max escape time',
  echappementMedian: 'median escape time',
  echappementMin: 'min escape time',
  encadrement: 'bracket width',
  energieRayonnee: 'radiated energy',
  espacement: 'spacing',
  eta: 'symmetric mass ratio',
  etats: 'states',
  etoiles: 'stars',
  exces: 'angle excess',
  exposant: 'exponent',
  f: 'frequency f',
  fCut: 'cutoff frequency',
  fDebut: 'start frequency',
  fDepart: 'start frequency',
  fDepartEffectif: 'effective start frequency',
  fFinDessin: 'last drawn frequency',
  fMerg: 'merger frequency',
  fMesure: 'measured frequency',
  fPic: 'peak frequency',
  fRaccord: 'matching frequency',
  fRing: 'ringdown frequency',
  fRingPhenomB: 'PhenomB ringdown frequency',
  fenetre: 'window',
  formuleAns: 'formula (years)',
  formuleDisque: 'disk formula',
  formulePetiteAmplitude: 'small-amplitude formula',
  formulePoint: 'point-source formula',
  fraction: 'fraction',
  fractionChiFin: 'final chi fraction',
  fractionDeC: 'fraction of c',
  fractionInteractionFin: 'final interaction fraction',
  frequence: 'frequency',
  frequenceMesuree: 'measured frequency',
  fs: 'sampling rate',
  g: 'coupling g',
  galaxie1: 'galaxy 1',
  galaxie2: 'galaxy 2',
  gamma: 'gamma',
  genreEspace: 'spacelike',
  h: 'step h',
  hbar: 'hbar',
  i0: 'initial infected i0',
  images: 'frames',
  incertitude: 'uncertainty',
  inverse: 'inverse ratio',
  jMax: 'index of fastest mode',
  jour: 'day',
  kMax: 'wavenumber of fastest mode',
  kappa2Max: 'kappa^2 of fastest mode',
  kSurHbar: 'K over hbar',
  kTc_sur_hbarOmega: 'kTc over hbar omega',
  kelvin: 'kelvin',
  klotz2015: 'Klotz 2015',
  kmh: 'km/h',
  kms: 'km/s',
  lMin: 'minimum l',
  lMinFormule: 'minimum l formula',
  lamb: 'closed-form value',
  lambda: 'lambda',
  largeurBande: 'bandwidth',
  lignes: 'rows',
  log10Ans: 'log10 years',
  log10a: 'log10 a',
  longueur: 'length',
  lymanAlpha: 'Lyman alpha',
  masseKg: 'mass (kg)',
  masseSoleil: 'mass (solar masses)',
  maxIter: 'max iterations',
  maxKms: 'max (km/s)',
  mesureAns: 'measured (years)',
  millionsAnnees: 'million years',
  minBullesAgees: 'min over old bubbles',
  minKms: 'min (km/s)',
  minSurMoyenne: 'min over mean',
  minimum: 'minimum',
  minutesAvantMinuit: 'minutes before midnight',
  moins: 'minus image',
  moinsFormule: 'minus image formula',
  moyen: 'mean',
  moyenne: 'mean',
  ms: 'm/s',
  naturel: 'natural units',
  naturelle: 'natural units',
  nf: 'quark flavours nf',
  nord: 'north',
  observee: 'observed',
  oceanFormuleH: 'ocean formula (h)',
  oceanMesureH: 'ocean measured (h)',
  omegaK: 'Omega_k',
  ordonnee: 'intercept',
  ordre: 'order',
  p: 'p',
  p2SurVarP: 'p^2 over var p',
  paires: 'pairs',
  particulesClassiques: 'classical particles',
  particulesDessinees: 'particles drawn',
  pas: 'step',
  pasParPoint: 'steps per point',
  pasPhase: 'phase step',
  passagesDeFrontiere: 'boundary crossings',
  passagesParZero: 'zero crossings',
  pente: 'slope',
  periodeVariance: 'variance period',
  pic: 'peak',
  picFormule: 'peak time formula',
  picMesure: 'measured peak time',
  pireEcart: 'worst deviation',
  pireEcartRelatif: 'worst relative deviation',
  pireTolerance: 'tolerance of the worst',
  pixels: 'pixels',
  pixelsDeBord: 'boundary pixels',
  plateauFormuleS: 'shelf formula (s)',
  plateauMesureS: 'shelf measured (s)',
  plus: 'plus image',
  plusAncienne: 'oldest bubble',
  plusFormule: 'plus image formula',
  pointsParTrace: 'points per trace',
  pourUnMetreParSeconde2: 'for 1 m/s^2',
  produit: 'product',
  produitFormule: 'product formula',
  profondeurM: 'depth (m)',
  psi2S: 'psi(2S) mass',
  publie: 'published',
  q: 'q',
  qualite: 'quality factor',
  quantique: 'quantum',
  r0: 'r0',
  rHorizon: 'horizon radius',
  rMin: 'closest approach r',
  racineT: 'sqrt(T)',
  radiale: 'radial',
  radialeFormule: 'radial formula',
  rapport: 'ratio',
  rapportD_2D: 'ratio d over 2d',
  rapportKarman: 'Karman ratio',
  rapportL: 'ratio to L',
  rapportPhenomBSurQnm: 'PhenomB over QNM',
  rayonBalayagePc: 'sweep-up radius (pc)',
  rayonDomaine: 'domain radius',
  rayonEquateur: 'equatorial radius',
  rayonFm: 'radius (fm)',
  rayonGeV: 'radius (1/GeV)',
  rayonKm: 'radius (km)',
  rayonMax: 'max radius',
  rayonMaxFormule: 'max radius formula',
  rayonMaxMoins: 'max radius, minus image',
  rayonMaxMoinsFormule: 'max radius minus, formula',
  rayonMin: 'min radius',
  rayonMinFormule: 'min radius formula',
  rayonMinPlus: 'min radius, plus image',
  rayonMinPlusFormule: 'min radius plus, formula',
  rayonPc: 'radius (pc)',
  rayons: 'rays',
  rebonds: 'bounces',
  s0: 'initial susceptible s0',
  secondes: 'seconds',
  seuil: 'threshold',
  sigma: 'sigma',
  sinh2surTc: 'sinh(2/Tc)',
  sinhPiHsurA: 'sinh(pi h/a)',
  soleilKelvin: 'Sun (kelvin)',
  sommeAnglesDeg: 'angle sum (deg)',
  sommeDirecte: 'direct sum',
  sondes: 'probes',
  spin: 'spin',
  strainMax: 'max strain',
  sud: 'south',
  symetrie: 'symmetry',
  tLineaire: 'linear-phase time',
  tangentielle: 'tangential',
  tangentielleFormule: 'tangential formula',
  tauxKLS: 'KLS rate',
  tauxMax: 'max growth rate',
  temps: 'time',
  tempsAmortissement: 'damping time',
  tempsHeisenberg: 'Heisenberg time',
  theorieBord: 'boundary theory',
  thermique: 'thermal',
  thomson: 'Thomson',
  tirages: 'draws',
  totalMesureH: 'total measured (h)',
  touches: 'hits',
  tours: 'turns',
  transverse: 'transverse',
  uneBoucle: 'one loop',
  valeurFormule: 'value formula',
  valeurMesure: 'measured value',
  verifiees: 'checked',
  vide: 'vacuum',
  visibleSeul: 'visible only',
  vitesseAngulaireMax: 'max angular speed',
  vitesseAngulaireMin: 'min angular speed',
  vitesseEjectaKmS: 'ejecta speed (km/s)',
  volume: 'volume',
  x: 'x',
  x2SurVarX: 'x^2 over var x',
  xFormule: 'x formula',
  xmax: 'x max',
  xmin: 'x min',
  y: 'y',
  yFormule: 'y formula',
  ymax: 'y max',
  ymin: 'y min',
  z: 'z',
  zeta3: 'zeta(3)',
  zmax: 'z max',
  zmin: 'z min',
  zones: 'zones',
  /* game96 : tam-theories-3.js */
  r3: 'third doubling r3', r4: 'fourth doubling r4', rapport1: 'gap ratio 1', rapport2: 'gap ratio 2',
  colonnes: 'columns', parColonne: 'per column', transitoire: 'transient', colonnesPointFixe: 'columns on the fixed point',
  pireEcartPointFixe: 'worst gap to the fixed point', colonnesDeuxCycle: 'columns on the 2-cycle', pireEcartDeuxCycle: 'worst gap to the 2-cycle',
  cellules: 'cells', nombreDeFourier: 'Fourier number', cellulesInitiales: 'initial cells', demiLargeur: 'half-width',
  margeSigma: 'margin in sigma', fenetreDessin: 'drawn window', mesureCos: 'measured cos part', formuleCos: 'formula cos part',
  mesureSin: 'measured sin part', formuleSin: 'formula sin part', omega: 'omega', F0: 'force F0', x0: 'start x0',
  periodesTransitoire: 'transient periods', periodesDessinees: 'drawn periods', pasParPeriode: 'steps per period',
  phiB: 'end angle phiB', gainSurDroite: 'time saved on the line', chemins: 'paths drawn', billes: 'balls', pileMax: 'tallest pile',
  /* game107 */
  pointFixe: 'rest point', retours: 'returns used', s: 'crowding s',
  /* game109 */
  xi: 'immunity loss xi',
  /* game110 */
  schema: 'scheme value', ecartSchema: 'gap to the scheme', borneDiscret: 'step-size gap', kPerte: 'loss rate k',
  /* game111 */
  sites: 'sites', evenements: 'reactions simulated', rodage: 'warm-up time', blocs: 'time blocks', baseA: 'share of A', baseC: 'share of C', baseG: 'share of G', baseT: 'share of T',
  /* game112 */
  fixees: 'share of populations fixed', eps: 'error scale E0/(S0+Km)', Km: 'Km', Vmax: 'Vmax', substratMi: 'substrate at half-way', partConvertie: 'share converted', tFin: 'end time',
  /* game113 */
  tPic: 'peak time', molecules: 'molecules', bValeur: 'B', seuilHopf: 'threshold B = 1 + A^2', oscille: 'oscillates (1 = yes)', ecartFinal: 'final distance to the fixed point',
  ecartSeuil: 'distance to the threshold', xFixe: 'fixed point x = A', yFixe: 'fixed point y = B/A',
  /* game114 */
  descendants: 'offspring', dominantsDeux: 'A_B_', dominantA: 'A_bb', dominantB: 'aaB_', recessifsDeux: 'aabb', impulsions: 'spikes', courant: 'current I',
  courants: 'currents', compares: 'compared',
  /* game115 */
  /* game118 */
  parents: 'Aa parents', borneEcart: 'bound on the gap', genoAA: 'AA', genoAa: 'Aa', genoaa: 'aa', temperature: 'temperature T',
  /* game120 */
  /* game122 */
  lignesArrivees: 'lines landing', partContinue: 'share for a continuous fan', nonConclues: 'lines not settled', gardee: 'energy kept', puissance: 'm', impairs: 'odd numbers drawn from',
  /* game123 */
  /* game124 */
  /* game125 */
  /* game127 */
  /* game191 */
  pUtilise: 'p used (a non-prime goes to the next prime)', mod3: 'rows 0..9 mod 3', vrai: 'true value',
  /* game190 */
  termesZ: 'number of terms for n = 1..30',
  /* game189 */
  survivant: 'survivor',
  /* game188 */
  b12: 'B_12',
  /* game187 */
  formeAcceptee: 'Euclid s form accepted for 2^10 x 2047 (must be 0)',
  /* game186 */
  mn: 'M(n)', cinquante: 'M(1..50)',
  /* game185 */
  trente: '(n - 1)! mod n for n = 2..30',
  /* game184 */
  liste: 'the first ones',
  /* game183 */
  x1: 'x1', y1: 'y1', dUtilise: 'D used (squares skipped)',
  /* game182 */
  r4n: 'r4(n)', r2n: 'r2(n)',
  /* game181 */
  ecartFlottant: 'same in floating point', quadrilatere: 'the four points',
  /* game180 */
  hexagone: 'the six points',
  /* game179 */
  colorations: 'colourings checked',
  /* game178 */
  tn: 'triangulations of the N-gon', tirees: 'diagonals drawn',
  /* game177 */
  qn: 'q(n)', q20: 'q(1..20)', distincte: 'distinct partition drawn', impaire: 'its odd image',
  /* game176 */
  point: 'the point P',
  /* game175 */
  rangFraction: 'n of the exact fraction',
  /* game174 */
  cote: 'side by Webster s formula', troisAngles: 'angles A, B, C (degrees, measured)',
  /* game172 */
  points: 'the vertices (coordinates)',
  /* game171 */
  cn: 'c(n)', marche: 'walk drawn (number)', chemin: 'the walk drawn (points)', nonRetour: 'walks without stepping back (k = 4)',
  /* game170 */
  motif: 'pattern', vivantes: 'live cells at the start',
  /* game169 */
  carreRmoinsr: '(R - r)^2',
  /* game168 */
  lambda0: 'confocal parameter L', typeCaustique: 'caustic',
  /* game167 */
  cote2: 'side squared', triangle: 'the triangle', exact: 'exact value',
  /* game166 */
  n1: 'crossings, 2 x 1 rectangle', n2: 'crossings, 3 x 2 rectangle',
  /* game165 */
  interieurs: 'whole points inside I', pointsBord: 'whole points on the boundary B', polygone: 'the polygon (corners)', lacet: 'shoelace area x2',
  /* game164 */
  recouvrements: 'segments travelled twice', debut: 'first turns',
  /* game163 */
  p100: 'p(100)', p200: 'p(200)',
  /* game162 */
  sousSol: 'draws below the ground',
  /* game160 */
  exacte: 'exact fraction', sigmaMax: 'largest sigma of one point',
  /* game159 */
  dominos: 'dominoes', rayon: 'arctic radius n/sqrt 2',
  /* game158 */
  betaCritique: 'beta_c of an endless grid (Onsager, a limit)',
  /* game155 */
  fractions: 'fractions p/q', bandes: 'bands',
  /* game153 */
  pont: 'bridge', autreForme: 'the other shape', arbreSansCarrefour: 'shortest network without crossroads', croix: 'cross of the diagonals',
  /* game151 */
  sommePhi: 'phi(1) + ... + phi(N)', borne: 'derived bound (3 + 2 ln N)/N',
  /* game150 */
  grandes: 'det for the 4 x 4 and 5 x 5 grids', eePlusE: 'cells where (e + e) differs from e', ePlusR: 'cells where (e + r) differs from r', recurrente: 'e passes the burning test', videRecurrent: 'the empty pile passes it (witness)', tasDifferents: 'cells where the two final piles differ', eboulementsDifferents: 'cells where the topple counts differ', eboulements: 'topples',
  /* game149 */
  largeurCase: 'bin width (degrees)', rayonsGardes: 'rays through the 60 degree path',
  /* game148 */
  cercles: 'circles found', ecartEntier: 'largest distance of a curvature to a whole number', sansFacteur2: 'circles missed by the formula without the factor 2', comparables: 'circles where that formula differs at all',
  /* game146 */
  kapitza: 'Kapitza approximation', nu: 'slow frequency timed', nuLineaire: 'linear slow frequency (Hill)', ecartRelatif: 'relative gap', tombeFaible: 'falls when shaken too weakly (1 = yes)', tombeForte: 'falls when shaken too strongly (1 = yes)', traceForte: 'Hill trace at the strong shake', kapitzaForte: 'Kapitza slow frequency at the strong shake (wrong)',
  /* game145 */
  mathieu: 'Mathieu guess 3 a / 4', partMax: 'largest share moved into the swing', temoin: 'same for the witness at rho = 2.5', duree: 'length of the run',
  /* game144 */
  approxRapide: 'fast-top guess (approximation)', ecartHauteur: 'change of height of the axis', vitesse: 'turning rate', omegaLent: 'exact slow steady rate', spinConserve: 'drift of the spin',
  /* game143 */
  moment: 'squared angular momentum', axe1: 'about axis 1 (least inertia), in eps', axe3: 'about axis 3 (most inertia), in eps', retournements: 'turn-overs of the middle axis',
  /* game142 */
  auDessus: 'spins above the threshold', auDessous: 'spins below the threshold', presDuSeuil: 'spins too close to the threshold (not counted)', nonPosees: 'counted spins that did not settle',
  /* game140 */
  maillons: 'chain of links', chainette: 'continuous catenary', parabole: 'parabola of the same length', descentes: 'descent steps', forceRestante: 'largest force left',
  /* game138 */
  verlet: 'exact period of the Verlet scheme',
  /* game136 */
  ecartSigma: 'gap in standard deviations',
  /* game134 */
  ordres: 'orders m seen',
  /* game133 */
  x5: 'x5, root of x = 5 (1 - e^-x)', hauteurPic: 'height of the peak',
  pasMinutes: 'counting step (minutes)', regime: 'regime (1 = rolling, 0 = sliding)', seuilRoulement: 'friction needed to roll',
  /* game126 */
  petitesOscillations: 'small-swing period 2 pi', amplitudeDegres: 'release angle (degrees)', amplitudes: 'amplitudes drawn', phaseDegres: 'phase angle (degrees)',
  parties: 'games', portes: 'doors', virtuelle: 'virtual (1 = yes)',
  resolution: 'scan step (degrees)', hauteurTir: 'launch height h', contact: 'closest approach to the parabola', sommets: 'vertices', aretes: 'edges', faces: 'faces', cotesParFace: 'sides per face p', aretesParSommet: 'edges per vertex q',
  rapportMasses: 'mass ratio M/m', mode: 'mode j', pulsation: 'omega_j',
  hauteur: 'entry height b', indice: 'index n', pireEcart6: 'worst gap, 6 harmonics', rang: 'harmonic', mach: 'Mach', fronts: 'wavefronts', angleDegres: 'half-angle (degrees)',
  marcheurs: 'walkers', aiguilles: 'needles', groupes: 'groups', personnes: 'people', jours: 'days', jusqua: 'up to N', courantSeuil: 'threshold current', courantsMuets: 'silent currents', impulsionsSousSeuil: 'spikes below threshold',
});

export const NOMS_MESURES_EN = Object.freeze({
  E: 'Energy E',
  H: 'Conserved H',
  /* game107 (proies a place limitee) */
  Hdecroit: 'H (can only go down)', dissipation: 'H lost vs crowding integral', amortissement: 'Damping rate',
  /* game109 (immunite qui s estompe) */
  equilibre: 'Endemic level of infected', approche: 'Approach rate to the endemic level',
  /* game110 (perte de chaleur vers l air) */
  refroidissement: 'Total heat (fading to the air)',
  /* game113 (chimie) */
  picB: 'Share of B at its peak', resteA: 'Share of A left at t = 1/k1', partA: 'Share of A at the peak time', partB: 'Share of B at the end',
  /* game114 (Mendel, neurone) */
  dominants: 'Both dominant traits (A_B_)', recessifs: 'Both recessive traits (aabb)', heterozygotes: 'Share of Aa (1 : 2 : 1)', phenotypes: 'Four traits (chi-square)',
  recombinaisonLue: 'Recombination rate read back', courbeFI: 'Firing rate vs current (frames)', repos: 'Silent currents (below threshold)',
  /* game115 (mathematiques) */
  carreDistance: 'Mean squared distance', croisements: 'Needles crossing a line', piLu: 'Pi read back from the needles', partage: 'Groups with a shared birthday',
  paires: 'Pairs born the same day', compteLi: 'Primes up to N vs Li(N)', compteLn: 'Primes up to N vs N / ln N', ecartMoyen: 'Mean gap between primes',
  /* game118 */
  pressionEchantillon: 'Pressure vs these molecules', gazParfait: 'Ideal gas law P A = N T',
  heterozygotesHW: 'Share of Aa children (2pq)', homozygotesAA: 'Share of AA children (p^2)', genotypes: 'Three genotypes (chi-square)',
  /* game120 (ondes) */
  arcPrimaire: 'Rainbow: smallest deviation, one bounce', arcSecondaire: 'Second bow: smallest deviation, two bounces', retourPeriode: 'Back to the start after one period (gap)',
  demiPeriode: 'Mirrored after half a period (gap)', harmonique1: 'Fundamental harmonic', harmoniqueNoeud: 'Harmonic with a node at the pluck',
  devant: 'Wave spacing ahead', derriere: 'Wave spacing behind', frequenceDevant: 'Pitch heard ahead (x emitted)', cone: 'Mach cone: sin of half-angle', source: 'The source',
  /* game122 */
  angleArrivee: 'Arrival angle vs flux (worst gap, degrees)', echappees: 'Lines escaping to infinity', tensionTau: 'Voltage after one tau', demiCharge: 'Half-charge time (units of tau)',
  energieFournie: 'Energy given by the battery', energiePerdue: 'Energy lost as heat', impairsParLigne: 'Odd numbers per row vs 2^(1s of n) (worst gap)', impairsTotal: 'Odd numbers in the first 2^m rows',
  /* game123 */
  /* game124 */
  /* game125 */
  /* game127 */
  /* game299 */
  reactionDonders: 'A printed difference off the table, a roll mean off its trials, or the order b - a > c - a > 0 failing', differencesDonders: 'Printed differences matching the table', moyennesXVIBDonders: 'Roll XVI B means matching its trials (truncated)', determinationsDonders: 'Timed answers in roll XVI B', conversionsDonders: 'Thousandths of a second matching (x 1000 / 261)', ordreDonders: 'Columns where choosing costs more than recognising', baMsDonders: 'Choosing adds (ms)', caMsDonders: 'Recognising adds (ms)', rouleauDonders: 'Roll shown', ecartMinimaDonders: 'Same gaps on the minima (vibrations)',
  /* game300 */
  attentionCattell: 'A Table VIII cell off Tables VI and VII, an A line more than 1 from its series, or distraction not slower', tableEightCattell: 'Table VIII cells matching Tables VI and VII', sevenWithinOneCattell: 'Table VII A lines within 1 of their five series', sevenRoundedCattell: 'Table VII A lines equal to the rounded mean', distractedLongerCattell: 'Blocks where adding in the head is slower', distractedRangeCattell: 'Slower by (ms)', seriesDistractedCattell: 'Single series slower when distracted', seriesConcentratedCattell: 'Single series faster when concentrated', observerCattell: 'Observer shown', concentratedSlowerCattell: 'Largest slowing when concentrating (ms)',
  /* game301 */
  pressurePeirceJastrow: 'A p. 76 proportion off the normal law, a group mean off its daily sets, or a calculated error off by more than 0.15', tableP76PeirceJastrow: 'Footnote proportions matching (1 - erf(0.477 q)) / 2', groupMeansPeirceJastrow: 'Group means matching the daily sets', calculatedPeirceJastrow: 'Calculated errors matching, with ratio - 1', calculatedLnPeirceJastrow: 'Calculated errors matching, with the logarithm', practicePeirceJastrow: 'Probable error, first group over second', groupPeirceJastrow: 'Group of the curve', finestPeirceJastrow: 'Errors at a ratio of 1.005', chancePeirceJastrow: 'Chance of so few errors if one guessed',
  /* game302 */
  extinctionPavlov: 'A printed extinction time off its clock times, a gap not the interval plus one minute, or extinction not slower with longer pauses', summaryPavlov: 'Printed summary matching the clock times', spacingPavlov: 'Gaps equal to the interval plus one minute', durationsPavlov: 'First to last showing (minutes)', showingsToZeroPavlov: 'Showings until no saliva', risesPavlov: 'Steps where the saliva went up', seriesShownPavlov: 'Series shown', recoveredPavlov: 'Experiments where the response came back', recoveryValuesPavlov: 'Response after the rest (c.c., drops)',
  /* game303 */
  weberKonig: 'A printed fraction more than one unit from tg(alpha) squared', rowsKonig: 'Rows in the four tables', withinUnitKonig: 'Fractions within one unit of tg(alpha) squared', roundedKonig: 'Fractions equal to it rounded', smallestKonig: 'Smallest fraction in each table', plateauKonig: 'Fractions between J = 1000 and 20000', tableShownKonig: 'Table shown', largestOverSmallestKonig: 'Largest over smallest fraction, each table',
  /* game304 */
  glycosuriaCannon: 'A printed per cent off its count, an excited group with no positive, or a control with one', percentsCannon: 'Printed per cents and the 33 matching the counts', excitedPositiveCannon: 'Excited groups with sugar', controlsCleanCannon: 'Control groups without sugar', hardEasyCannon: 'Hard against easy examination', groupsShownCannon: 'Groups shown', benchPositiveCannon: 'Positives who never played', chanceAtBaseCannon: 'Chance of 6 of 33 at the rate before',
  /* game305 */
  brainBoyd: 'A period where women weigh more, a rank or adult range not as written, or parts not adding up when all were weighed', menHeavierBoyd: 'Periods where the male brain is heavier', ranksBoyd: 'Heaviest and next heaviest periods as written p. 260', adultRangesBoyd: 'Adult ranges as written p. 262', partsAddEqualBoyd: 'Parts adding up, same numbers examined', partsAddUnequalBoyd: 'Parts adding up, different numbers examined', sexShownBoyd: 'Sex shown', peakToOver80Boyd: 'From 14-20 years to over 80',
  /* game306 */
  allOrNoneLucas: 'A printed step level or rise not given by the table, or not three big steps', printedLevelsLucas: 'Printed levels matching the table', bigStepsLucas: 'Steps larger than 0.3 mm', bigShareLucas: 'Share of the rise in those steps (%)', otherStepsMaxLucas: 'Largest other step (mm)', lineShownLucas: 'Straight line shown', straightLineR2Lucas: 'Spread explained by a straight line (R2)',
  /* game307 */
  neuronsHerculanoHouzel: 'A printed ratio off the table, or a fitted exponent not the printed one', ratiosHerculano: 'Macaque over marmoset ratios matching', exponentNeuronsHerculano: 'Exponent of brain mass on neurons', exponentOtherHerculano: 'Exponent of brain mass on other cells', exponentsHerculano: 'Exponents equal to the printed ones', rodentShownHerculano: 'Rodent power shown', rodentRuleMassHerculano: 'Macaque-size brain by the rodent power',
  /* game308 */
  connectomeSizes: 'Counts out of order, or human neurons and other cells more than one deviation apart', synapsesPerNeuronConnectome: 'Synapses per neuron: worm, hemibrain, whole fly', flyOverWormConnectome: 'Whole fly over worm, neurons', humanNonNeuronsConnectome: 'Human other cells vs neurons', shownConnectome: 'Organism shown', humanOverFlyConnectome: 'Human over whole fly, neurons',
  /* game309 */
  emotionsSiegel: 'Samples not adding up, effect counts or hit rates not as printed, or a confusion matrix not adding up', samplesSiegel: 'Categories whose samples add up to the total', bandsSiegel: 'Effects of d >= .80, >= .50 and above .20 (k > 4, significant)', confusionSumsSiegel: 'Confusion rows and columns adding up', hitRatesSiegel: 'Hit rates as printed', misprintsSiegel: 'Printed percentages that are not the count over 241', participantsSiegel: 'Participant totals that are not the sum of the cells', table4Siegel: 'Participants in Table 4 against Table 9', emotionShownSiegel: 'Emotion category shown', spreadShownSiegel: 'Units spread across the 95% interval', unitRangeSiegel: 'Lowest and highest d given to a unit',topSignalSiegel: 'Signal with the largest mean change (d)', firingSiegel: 'Firing per unit and step, by signal (our rule)', classifierSiegel: 'Cases the classifier sorted right', chanceSiegel: 'A blind guess among six',
  /* game310 */
  bodyMapsNummenmaa: 'The printed mean, chance level or experiment sizes not recovered', meanNummenmaa: 'Mean of the seven hit rates (%)', chanceNummenmaa: 'One in seven (%)', sizesNummenmaa: 'Experiment sizes adding up to 701 and 773', experiment5Nummenmaa: 'Experiment 5 readers as printed', notAboveChanceNummenmaa: 'Maps not named above chance', guessShownNummenmaa: 'Blind guessers shown', rightNummenmaa: 'Share of simulated readers right, by map', aboveChanceNummenmaa: 'Maps named above chance', ldaNummenmaa: 'Classifier on the maps, all emotions',
  /* riskBernoulli (2026-11-14) */
  riskBernoulli: 'A printed integer more than one unit off the log rule, a broken insurer relation, a printed bound, Sempronius, St Petersburg or Cramer not reproduced', integersBernoulli: 'Printed integers within one unit of the log rule', roundedBernoulli: 'Printed integers equal to it rounded', gapsBernoulli: 'Printed integer and computed minus printed', caiusBernoulli: 'Caius and his insurer, premiums 800 and 600 (computed)', relationBernoulli: 'Insurer minus Caius equal to goods minus premium', nobodyBernoulli: 'Best gain of an insurer at premium 500 (log)', fairBernoulli: 'Fair game: value and loss with 100, loss with 200', semproniusBernoulli: 'Sempronius: one ship, two ships, 200 ships, limit', petersburgBernoulli: 'St Petersburg by fortune (computed minus printed)', cramerBernoulli: 'Cramer: capped game and square root', misprintBernoulli: 'Misprint found in the print', problemShownBernoulli: 'Problem shown', linearPetersburgBernoulli: 'Expected value after 10, 20, 40 terms', linearCaiusBernoulli: 'Caius by the expected value', rootIntegersBernoulli: 'Printed integers within one unit of the square root', rootPetersburgBernoulli: 'St Petersburg at fortune 0 by the square root', rootCaiusBernoulli: 'Caius by the square root', rootSemproniusBernoulli: 'Sempronius, one ship, by the square root',
  /* game311 */
  emotionWiringHCP: 'Lists not as stated, a split network, or unexpected areas without a region', edgesWiring: 'Connections (log streamline density)', componentsWiring: 'Separate pieces of the network', isolatedWiring: 'Regions without a connection', unmappedWiring: 'Printed areas without a region here', packShownWiring: 'Pack shown', emotionShownWiring: 'Emotion shown', printedWiring: 'Name in its source', sourceWiring: 'Source (design, size)', seedsWiring: 'Its regions (our mapping)', regionsWiring: 'Its regions, by name', sharedInPackWiring: 'Also reported for another emotion of the pack', compareShownWiring: 'Second emotion compared', bothWiring: 'Regions reported for both', sharedWiring: 'Over all packs: regions serving two or more emotions', insulaWiring: 'Emotions for which the left insula is reported', amygdalaWiring: 'Emotions for which the left amygdala is reported', amygdalaPlaceWiring: 'Place of the left amygdala in the layout', seedPlacesWiring: 'Places of its regions in the layout', travelShownWiring: 'Impulses travel', networkShownWiring: 'Network the impulses follow', resolutionShownWiring: 'Resolution', seedNodesWiring: 'Parts that start the impulses', lostWiring: 'Reported regions with no parcel at this resolution', fineWiring: 'The 414-parcel lists', theoryShownWiring: 'Order of activation (theory or data)', theoryStagesWiring: 'Its steps', overlapWiring: 'Strongest couplings that join wired regions', functionIsolatedWiring: 'Regions without a coupling at this cut', pathwaysWiring: 'Named pathways (no measured strength)', impulsesWiring: 'Impulses that crossed a link', viaPathwaysWiring: 'Impulses along named pathways', reachedWiring: 'Parts that fired', carriedMeanWiring: 'Mean weight of the links crossed', keptMeanWiring: 'Mean weight of the network', shownWiring: 'Drawn: connections and named pathways as lines, parts and firing events as points', sharedRegionsWiring: 'Regions serving two or more emotions',
  /* game297 */
  essaisThorndike: 'Not the 24 printed trials, or six-trial averages not falling', essaisN: 'Trials', sommeThorndike: 'Total time (s)', minimumThorndike: 'Fastest', haussesThorndike: 'Trials slower than the one before', blocsThorndike: 'Average of each six trials (s)', premierDixThorndike: 'First trial under 10 s', ensuiteDixThorndike: 'Trials under 10 s from then on', exposantPuissanceThorndike: 'Power law exponent (my fit)', ssrPuissanceThorndike: 'Power law misfit (log)', ssrExpoThorndike: 'Exponential misfit (log)', moyenneSurThorndike: 'Moving average over (trials)', retoursThorndike: 'Slow trials after the fast second one (s)',
  /* game292 */
  penduleKater: 'Beats not falling to the south, a length off N squared, or the Unst-Dunnose line not 39.00734', stationsKater: 'Stations', decroitKater: 'Steps south where beats and length both fall', ecartN2Kater: 'Largest gap to L ~ N squared (1e-5 inch)', equateurKater: 'Equator length from Unst and Dunnose (printed 39.00734)', equateurAjusteKater: 'Equator length, all stations fitted', diminutionKater: 'Gravity diminution pole to equator', aplatissementKater: 'Flattening 1 in', oteeKater: 'Station left out', aplatissementSansKater: 'Flattening 1 in, without it', rapportNewtonKater: 'Diminution over a homogeneous Earth',
  /* game290 */
  jaugesHerschel: 'A visual ray off the formula besides S = 120 and 290, or the 588 example not 498', lignesHerschel: 'Rows of Table II', BHerschel: '1 / tan(half field)', horsArrondiHerschel: 'Star counts where rounding misses', horsUniteHerschel: 'Star counts more than one unit off', sansMoinsUnHerschel: 'Rows matched without the minus one', exemple588: 'n for 588 stars (printed 498)', penteHerschel: 'Log-log slope of his table', racineCarree100k: 'Square root law at 100 000 stars',
  /* game289 */
  constantesPlanck: 'A printed step not recovered, or the density no longer one unit off', densitePlanck: 'Radiation density at 1 K (printed 7.061e-15)', seriePlanck: 'Sum of 1 / n^4', k4h3Planck: 'k^4 / h^3 from unrounded values', racinePlanck: 'Root of the peak equation', hkPlanck: 'h / k', hPlanck: 'h from his printed steps', kPlanck: 'k from his printed steps', repriseesPlanck: 'Steps recovered at his rounding', residuWien: 'Peak equation with Wien x = 5',
  /* game288 */
  reststrahlenRubens: 'A law column off its formula, the infinite Wien value, or the order of the five laws broken', ecartMaxLois: 'Largest gap between a printed law value and its formula', wienInfiniRubens: 'Wien at infinite temperature (printed 194)', rmsLoisRubens: 'Mean miss to the readings: Wien, Thiesen, Rayleigh, Lummer-Jahnke, Planck', wienSurPlanck: 'Wien miss over Planck miss',
  /* game287 */
  etherMichelson: 'A table rule off, the 0.4 fringe, or the one-fourth and one-sixth bounds', reglesMidi: 'Noon: Means, w. l., second row, Final means recovered', reglesSoir: 'Evening: the same', frangeAttendue: 'Fringe shift expected (0.4)', creteMidiSoir: 'Fitted swing, peak to peak (noon, evening)', deriveTour: 'Drift over one turn (noon, evening)', foisMichelson: 'Expected over fitted (noon, evening)',
  /* game286 */
  emanationRutherford: 'A fitted half-life off 60 s, the 86 not cut from 60 / ln 2, or the 20 minute remainder not near a millionth', lambdaAjuste: 'Decay constant fitted (per second)', demiVieAjustee: 'Half-life fitted (s)', demiVieOrigine: 'Half-life through the starting point (s)', unSurLambda: '60 / ln 2 (he prints 86)', resteVingtMinutes: 'Share left after 20 minutes', ecartDroite: 'Mean miss of a straight line', ecartExponentielle: 'Mean miss of the halving law', droiteA360: 'Straight line at 360 s',
  /* game285 */
  maisDarwin: 'A printed total, the crossed mean or the 87 off, or the 17.57 not the named one', huitiemesDarwin: 'Totals in eighths of an inch (crossed, self)', moyennesDarwin: 'Mean heights (inches)', rapportDarwin: 'Self against crossed, crossed = 100', lignesCroiseesPlusHautes: 'Rows where the crossed plant is taller', pSigneDarwin: 'Two-sided sign test', ecartMoyenDarwin: 'Mean difference (inches)',
  /* game284 */
  magnitudesPogson: 'An aperture, the period, a text number, or an observer column off besides Struve 7 and Herschel 14', ouverturesPogson: 'Apertures recovered (cut to 3 figures)', periodePogson: 'Apertures ten times larger five magnitudes on', limiteCalculee: 'Limit of a 15 inch refractor (he prints 15.1)', colonnesHorsPogson: 'Observer magnitudes not recovered', exactementCinq: 'His exactly 5 (1 / half log 2.512)', ouvertureDawes15: 'Aperture for the 15th with a ratio of 4 (inches)',
  /* game283 */
  rayonsThomson: 'An m / e or v off besides the named rows, or m / e times v not I within 15 % besides row 10', lignesThomson: 'Rows of his table', meHors: 'Rows where m / e is not recovered', vHors: 'Rows where v is not recovered', produitHors: 'Rows where m / e times v is not I', moyenneMeThomson: 'Mean printed m / e', foisPlusPetit: 'Hydrogen ion m / e over his mean',
  /* game282 */
  poisMendel: 'A sum or printed ratio off, the 2.98 not recovered, or a second generation ratio off', sommesMendel: 'Dominant plus recessive equal to the total', rapportsMendel: 'Printed ratios recovered to the hundredth', totauxMendel: 'Dominant and recessive, all seven', deuxCheminsMendel: 'Ratio of the totals, mean of the ratios', secondeGeneration: 'Hybrids over constant forms, two experiments', khiDeuxTroisUn: 'Chi-square against three to one (7 degrees)', khiDeuxUnUn: 'Chi-square against one to one',
  /* game281 */
  spiraleMoseley: 'A progression term besides duplicatus 3, a fitted ratio off, a formula besides the 1.1806, or a mu besides the third', progressionHors: 'Printed progression terms more than one unit off', raisonsAjustees: 'Ratios fitted to the widths (duplicatus, Buccinum)', formulesMoseley: 'His three powers, recomputed', muBuccinum: 'Six whorls over three (printed 2.45)', ecartArithmetique: 'Mean miss, fixed shrink per whorl (inch)', ecartGeometrique: 'Mean miss, fixed ratio per whorl (inch)',
  /* game280 */
  tubesHagen: 'A residual or probable error off, a head besides the three named, or the r and s claims of p. 431 not met', ecartsHagen: 'Printed residuals recovered', erreursProbablesHagen: 'Probable errors of the head recovered', hHorsHagen: 'Heads more than 0.001 off (series-reading)', rFoisErreur: 'Spread of r over its largest probable error', sFoisErreur: 'Largest gap of s to its mean, in probable errors', ecartLineaire: 'Mean miss, head in proportion to flow only (inch)', ecartDeuxTermes: 'Mean miss of his two-term fit (inch)',
  /* game279 */
  syllabesKaeding: 'A summary, row, column or total check off besides the named 8b cell, row 2 mean and 49.76', motsTotal: 'Words counted', syllabesTotal: 'Syllables counted', moyenneKaeding: 'Syllables per word', lignesHors: 'Rows that do not add up (words | syllables)', colonnesHors: 'Columns that do not add up', manque8b: 'Words and syllables missing in row 8b', moyennesHors: 'Row means off the printed one', pourCentUn: 'One-syllable words (%)', geometriqueCinq: 'Five-syllable words if the ratio stayed constant',
  /* game278 */
  fonteMacKellar: 'A count not in hundreds, or a small capital other than T not half its capital', sommeMinuscules: 'Lower-case sorts in the fount', eSurZ: 'e against z', valeursDistinctes: 'Distinct counts among 26 letters', entropieFonte: 'Entropy of the 26 letters (bits)', entropieUniforme: 'Entropy if every letter served alike (bits)', petitesCapitalesHors: 'Small capitals not half their capital', lettresAuDessus: 'Letters above one in 26', eFoisUniforme: 'Share of e against an even share',
  /* game277 */
  tempsOldham: 'An arc, depth, chord, speed or modulus off besides the named, or the text ratios matching the table', arcsOldham: 'Arc lengths recovered (cut to 0.1 km)', profondeursOldham: 'Chord depths recovered (1 - cos)', cordesOldham: 'Chords within 1.6 km', vitessesHorsOldham: 'Speeds not recovered (phase, arc or chord, degrees)', distorsionOldham: 'Rigidity from density and second phase speed (1e10 CGS)', compressionOldham: 'Bulk modulus from both speeds (1e10 CGS)', texteTableOldham: 'Text ratios equal to his table (none)', predit150et180: 'Second phase at its 120 degree speed (minutes)',
  /* game276 */
  spiralesBeal: 'Tree 1 not 155, a total off, or the right-left balance rejected other than in Norway tree 3 and the European larch', conesTotal: 'Cones counted', conesArbre1: 'Cones on Norway spruce tree 1 (text: 155)', partVoisins: 'Share with two neighbouring Fibonacci numbers', partDeuxFib: 'Share with two Fibonacci numbers', conesQuatreSept: 'Cones with 4 and 7 spirals', droiteGauche: 'Smaller number on the right, on the left', pSymetrie: 'Exact binomial p, right against left, all cones', pMelezeEurope: 'Same p, European larch', pArbre3: 'Same p, Norway spruce tree 3', conesExclusAiry: 'Cones of an order Airy excluded',
  /* game275 */
  variationsHalley: 'The 15 degrees, the speeding drift, the westward moves, the text against the table, or Hudson and the Plate not recovered', changeLondres: 'Change at London, 1580 to 1683 (degrees)', tauxLondres: 'Drift at London, four intervals (minutes a year)', versOuest: 'Changes of one place that go west', texteTable: 'Numbers of the text found in the table', londresInterpolee: 'London at the chosen year (degrees, East positive)', plusPetitChangement: 'Smallest change at one place (degrees)',
  /* game274 */
  tubesPoiseuille: 'A pressure series, the fourth power, the named mean, or the 25 mm lengths not recovered', etenduesPression: 'Spread of pressure x time, two tube lengths (%)', pentesPression: 'Log time against log pressure (two lengths)', ecartsD4: 'Flow / D^4 of each tube, gap to the mean (%)', penteDiametrePoiseuille: 'Log flow against log diameter', moyenneKRecalculee: 'Mean of his seven k (he printed 2495.224)', longueursImplicites: 'Tube length his k and table imply (mm)', facteurNavier: 'Mean miss factor, flow as D cubed', facteurD4: 'Mean miss factor, flow as D to the fourth',
  /* game273 */
  unitesWeber: 'A tau, a ratio beyond 0.05 %, the mean, or a printed product not recovered', tauWeber: 'Times tau = A phi recovered to 7 decimals', rapportsWeber: 'E / 2 tau from the printed tau (millions)', ecartMaxWeber: 'Largest gap to the printed ratio (%)', moyenneWeber: 'Mean of the five printed ratios (millions)', produitsWeber: 'Mean x root(1/2), x 106 2/3 (billions), x 4 / root 2', meileWeber: 'Mile implied by 59320 miles a second (metres)', ecartProportionnel: 'Mean miss, swing in proportion to the charge (%)', ecartConstant: 'Mean miss, swing ignoring the charge (%)',
  /* game272 */
  aimantGauss: 'A printed difference or angle off besides v\' at 3.5 m, a1 not 2 a2, or a power not near 3', anglesGauss: 'Deflections read (two positions)', differencesGauss: 'Printed differences equal to observed minus calculated', formulesGauss: 'Calculated angles given back by his coefficients within 0.1 second (strict rounding)', rapportGauss: 'His a1 / a2', exposantsGauss: 'Power of the distance, pure power law, two positions', rmsCubeGauss: 'Mean miss of a one-constant cube law (seconds)', rmsCarreGauss: 'Mean miss of a one-constant square law (seconds)',
  /* game271 */
  deplacementsPerrin: 'A sum, a half-normal fit, 500 x P besides ring 2, or d / e off', sommesProjections: 'Found and calculated totals, two series', trouvesAnneaux: 'Jumps on the target (text: 500)', sigmas: 'Half-normal spread fitted to his calculated columns (micron)', aUneUnite: 'Calculated cells matched within one (rounded model, then raw)', deCalcule: 'Square root of pi over two (he found 0.886)', khiGauss: 'Chi-square, found against calculated', khiUniforme: 'Chi-square if spread evenly',
  /* game270 */
  filtreDarcy: 'A ratio besides the named one, a slope, 0.286 / 0.165, a difference besides row 5 or a February ratio off', rapportsRetrouves: 'Flow / pressure ratios within 0.01 (of 16)', rapportsArrondis: 'The same at strict rounding (of 16)', pentesSeries: 'Slopes through the origin, l/s per m2 per m (printed 0.493, 0.145)', differencesRetrouvees: 'February pressure differences recovered (of 12)', rapportsFevrier: 'February flow / difference ratios (of 12)', kFevrier: 'February slope, l/s per m2 per m of head', rmsChoisi: 'Error for the chosen share of the pressure below (l/min)', rmsDessusOrigine: 'Error, pressure above only, through the origin', rmsDessusAffine: 'Error, pressure above only, best straight line', rmsDifference: 'Error, printed pressure difference', rmsDifferenceAffine: 'Error, pressure difference, best straight line',
  /* game269 */
  critiqueReynolds: 'A log of time, log V, log B_s beyond the named rows, the mean or 43.79 off', logTempsRetrouves: 'Log of time recovered at 1e-5 (of 29)', logVRetrouves: 'Log V by the chain of logs at 1e-5 (of 29)', logBsRetrouves5: 'Log B_s recovered at 1e-5 (of 29)', logBsRetrouves4: 'Log B_s recovered at 1e-4 (of 29)', vitessesDepuisLog: 'Velocity recovered from its log (of 29)', moyenneLogBs: 'Mean of the 29 printed log B_s', diametresDepuisLog: 'Diameters his printed logs stand for', sigmaLogBs: 'Spread of log B_s', ligne23Temps: 'Row 23: time its log stands for (printed 116)', penteDiametre: 'Slope of log(V / P) against log D',
  /* game268 */
  effetJoule: 'Half-hour column, the named 4.55, a reduction, the mean, 1.27 or a 4 % agreement off', kDemiHeure: 'Heat per current squared, half hour', colonneDemiHeure: 'Half-hour squares column recovered (of 4)', kHeure: 'Heat per current squared, one hour', casesDiscriminantes: 'One-hour cells printed with decimals', exposantDemiHeure: 'Power of current, half hour (log-log)', exposantHeure: 'Power of current, one hour (log-log)', reduction1: 'First experiment reduced to 1.88 Q, one hour', reduction2: 'Second experiment reduced likewise', resistanceFinGros: 'Thin wire resistance from 3 feet = 8 feet', accordsChaleurResistance: 'Heat ratio against resistance ratio, Exp. 1-3 (%)', enIntensite: 'Heat ratio if proportional to the current', observe: 'Heat ratio measured', enCarre: 'Heat ratio for the square of the current',
  /* game267 */
  balanceCoulomb: 'A printed torsion, the 576, 1/3400, a theory time besides 54, the 1/10, 57 or 1/20 off', torsions: 'Total torsion in the three trials (degrees)', forceFoisD2: 'Torsion x distance squared', ecartTroisieme: 'Third trial against the first (%)', exposant12: 'Power of distance, trials 1 to 2', exposant23: 'Power of distance, trials 2 to 3', penteCoulomb: 'Log-log slope over the three trials', theorieTroisieme: 'Oscillation time the law gives at 24 inches (printed 54)', tempsCorrige: 'His corrected time for the charge lost (s)', carreInverseTroisieme: 'Inverse square from trial 1, at 8.5 degrees', enUnSurD18: 'A 1 / distance force at 18 degrees', enUnSurD85: 'A 1 / distance force at 8.5 degrees',
  /* game266 */
  picLummer: 'A or B off besides the named rows, a temperature, a Diff or a printed mean off', retrouvesA: 'Rows where lambda_m T matches A (of 8)', retrouvesB: 'Rows where E_m / T^5 matches B (of 8)', diffsRetrouvees: 'Diff column recovered (of 8)', moyenneA: 'Mean of the printed A (Mittel 2940)', moyenneB: 'Mean of the printed B (2188)', penteLambda: 'Log-log slope of lambda_m against T', penteEnergie: 'Log-log slope of E_m against T', rapportT4: 'Largest / smallest E_m / T^4', ecartMaxB: 'Largest gap of B from 2188 (%)',
  /* game265 */
  ondulationsYoung: 'A length or frequency besides the three named off, or a frequency a unit away', longueursRetrouvees: 'Wavelengths recovered from undulations per inch (of 15)', frequencesRetrouvees: 'Frequencies recovered from undulations per inch (of 15)', vitesseSupposee: 'Light speed he assumed (inches per second)', ligne652DepuisL: 'The 652 row recomputed from its wavelength', facteurPuissance: 'His 561 against 2^48', etendueYoung: 'Visible range, violet / red undulations', huitSeptSix: 'Red, yellow, blue scaled to 8 (he says 8, 7, 6)', quarte: 'Red / blue wavelength (he says a fourth, 1.333)', frequenceChoisie: 'Yellow-green frequency for the chosen time', octave: 'An octave', etendueVisible: 'Visible range in the table',
  /* game264 */
  vitesseNyquist: 'A table row besides m = 5, a relative number, the 26 characters or the 2.2 gain off', loiCinq: 'The log law at five levels (printed 230)', mPour230: 'Levels that 230 would mean', lignesQuiTestent: 'Table rows that are not powers of two', rapportIdeaux: 'Ideal three-value / ideal two-value code', morseSurIdeal: 'American and Continental Morse / ideal', gainContinental: 'Continental Morse, two values to three', gainAmericain: 'American Morse to three-value Continental', lineaire16: 'Speed at 16 levels if it grew like m', imprime16: 'Speed at 16 levels in the table',
  /* game263 */
  parallaxeBessel: 'A solution, weight, mean error or the common solution off, other than the named weight', retrouvesBessel: 'Printed figures recovered (of 22)', nonRetrouvesBessel: 'Printed figures not recovered (named)', parallaxeSansPoids: 'Common parallax with both stars weighted alike', rapportExact: 'Exact squared ratio of the two mean errors', parallaxeRapportExact: 'Common parallax with that exact ratio', parallaxeChoisie: 'Common parallax for the chosen weight', distanceUA: 'Distance in Sun distances for 0.3136', rapportSommesA: 'Star a: zero parallax misfit / fitted misfit', rapportSommesB: 'Star b: zero parallax misfit / fitted misfit',
  /* game262 */
  motsMendenhall: 'Group sizes, printed letter totals or Bible means not recovered', lettresOliver: 'Letters in the first 1000 words of Oliver Twist', moyennesBible: 'Old and New Testament letters per word', ecartBible: 'Relative gap of the two Bible means', chi2Choisi: 'Chi-square, Vanity Fair group 1 against 2', ddlChoisi: 'Its degrees of freedom', zChoisi: 'Its distance from chance (z)', zMaxVanity: 'Largest such z, tail merged from 8 to 14 letters', ecartTypeOliver: 'Spread of word length in Oliver Twist (letters)', ecartTypesMill: 'Mill minus Dickens, in standard errors', ecartTypesAtkinson: 'Dickens minus Atkinson, in standard errors',
  /* game261 */
  chaleurLondres: 'A mean, excess, average or extent off by more than 0.001, other than the four named', retrouvesHoward: 'Printed figures recovered within 0.001', nonRetrouvesHoward: 'Printed figures not recovered (named)', etendueAvec1818: 'London extent if 1818 is counted', moyenneEcart: 'London minus country, mean over 12 years (F)', tStudent: 'Student t of that mean', positifs: 'Years London was warmer (of 12)', exceptions: 'Years the country was warmer',
  /* game260 */
  survieHalley: 'A sum, the total, the text chain, the odds, the log complement or an annuity up to 40 off', sommesRetrouvees: 'Seven-year sums recovered (of 12)', totalHalley: 'Ages 1 to 84 plus the 107 over 84', coteVingtCinq: 'Odds at 25 of living a year (560 / 7)', complementLog: 'Arithmetical complement of log 1.06', naissancesAn: 'Births a year, 6193 / 5 (printed 1238)', ecartsRentes: 'Printed annuities more than 0.05 from the recomputed ones', renteBaseDecalee: 'Ages 5 and 15 divided by the next year living', renteChoisie10: 'Annuity at 10 for the chosen rate', vivantsConstant42: 'Constant risk: alive at 42 (table: 427)', renteConstante: 'Constant risk: annuity at any age',
  /* game259 */
  repliquesOmori: 'Printed means, calculated values, tails, x = 19 or equation (d) not recovered, or k not refitted', kRefait: 'k refitted from the 10 counts (least squares of x y on y)', hRefait: 'h refitted the same way (printed 2.31)', nonArrondisOmori: 'Printed values that are not the rounded ones', prediction1892: 'Hyperbola, middle of 1892 (shocks per half day)', observe1892: 'Observed in 1892 (867 / 732)', rmsHyperbole: 'Hyperbola: rms over the 10 half days', rmsExpo: 'Exponential: rms over the 10 half days', expoNote: 'Exponential note recomputed at x = 0, 1, 2 (printed 175, 138, 108)', anneesD: 'Equation (d): years to 1 shock in 30 days (printed 42)', anneesC: 'Equation (c): years to 1 shock in 60 half days (printed 37)', expoQueue: 'Exponential law in 1892 (shocks per half day)',
  /* game258 */
  chaleursPetitDulong: 'A product off besides platinum, platinum not off, or printed spread over 1.5 %', produitsRetrouves: 'Printed products recovered from their columns', coquillePlatine: 'Platinum: printed against its own columns', cPlatine: 'Specific heat platinum would need for 0.3740', nonArrondis: 'Products truncated, not rounded', cvProduits: 'Spread of the printed products (%)', cvRecalcules: 'Spread of the recomputed products (%)', cvDecale: 'Spread with the chosen shift of weights (%)', cvChaleurs: 'Spread of the specific heats alone (%)', cvCinq: 'Spread with weights shifted by five rows (%)', rapportChaleurs: 'Largest / smallest specific heat',
  /* game257 */
  equivalentsFaraday: 'Paragraph 791 chain, retained trials or explained misses not as stated', eauDecomposee: 'Water decomposed, paragraph 791 (grains)', chaineEtain: 'Tin from paragraph 791 (hydrogen = 1)', ecartMoyenFaraday: 'Retained trials: mean distance to the table (%)', ecartMaxEssais: 'Retained trials: largest distance to the table (%)', manquesExpliques: 'Misses Faraday explains (paragraph and value)', moyenneHuitPlomb: 'All eight lead trials averaged, misses included', texte851: 'Paragraph 851 against his own table', masseProportionnelle: 'Tin expected, mass in proportion to the equivalent (grains)', rapportMasses: 'Tin weighed / water decomposed',
  /* game256 */
  mortaliteNightingale: 'Rates not recovered, one-sided dashes, no January 1855 peak or no 4-fold fall', tauxRetrouves: 'Printed rates recovered from deaths and strength', totalDeces: 'Deaths, April 1854 to March 1856', deces1: 'Deaths, April 1854 to March 1855', deces2: 'Deaths, April 1855 to March 1856', tauxAnnuel1: 'All causes, first year (per 1000)', tauxAnnuel2: 'All causes, second year (per 1000)', partZymotique1: 'Share of deaths from disease, first year', partZymotique2: 'Share of deaths from disease, second year', hiverAvant: 'Disease rate, October 1854 to March 1855 (mean)', hiverApres: 'Disease rate, October 1855 to March 1856 (mean)', janvierConstant: 'January 1855 at constant strength (per 1000)', decembreConstant: 'December 1855 at constant strength (per 1000)',
  /* game255 */
  exclusionGause: 'Constants, K1 or the day-16 exclusion not recovered', volumesTableX: 'Table X volumes from a x b x b', constantesNonArrondies: 'Printed constants that are not the rounded value', k1Retrouve: 'P. aurelia, half loop, days 8-16, volume units', k2Moyen: 'P. caudatum, half loop, days 7-16 (Gause: 64)', uneBoucleAurelia: 'P. aurelia, one loop, volume units (text: 195)', uneBoucleCaudatum: 'P. caudatum, one loop (text: 137)', pcModeleChoisi: 'Model P. caudatum on day 16, chosen beta', paModeleJour16: 'Constant model, P. aurelia on day 16', pcModeleJour16: 'Constant model, P. caudatum on day 16',
  /* game253 */
  aberrationBradley: 'A star off the mean maximum by 1", the ratio 10210 or the light times not recovered', maximumMoyen: 'Seven stars: mean maximum (arcseconds)', etendueMaxima: 'Largest gap to it (arcseconds)', rapportVitesses: 'Speed of light / speed of the Earth', tempsLumiere: 'Light from the Sun, from 20.2" (seconds)', tempsAdopte: 'Same from 40.5" (seconds)', maximumRomer: 'Maximum implied by Roemer\'s 11 minutes (arcseconds)',
  /* game252 */
  regressionGalton: 'Totals off, direct slope outside 0.6-0.75, or reverse slope 0.4 or more', totalEnfants: 'Adult children counted', totalParents: 'Mid-parents counted', penteMedianes: 'Child medians against mid-parent: slope', pentePonderee: 'Same, weighted by children', penteInverse: 'Mid-parent medians against child: slope', medianeBasse: 'Children of the 64.5 row: median', predictionPente1: 'Like parent, like child: predicted', predictionDeuxTiers: 'Two-thirds law around 68 1/4: predicted',
  /* game251 */
  lumiereMichelson: 'Mean, correction chain or greatest value not recovered', moyenne100: 'Mean of the 100 measurements (km/s)', finalRefait: 'Mean + 12 + 80, his final value', ecartMoyen100: 'Average gap to the mean (printed 60)', minimumTable: 'Smallest value in his tables', minimumImprime: 'Smallest value as printed', airMoinsC: 'In air, minus exact c (km/s)', ecartC: 'Final value minus exact c (km/s)', enIncertitudes: 'Same, in units of his limiting error',
  /* game250 */
  loiMoseley: 'lambda Q^2 not constant, Q - (N - 1) off below zinc, or the gap shrinking above', rydbergImplicite: 'Constant implied by lambda Q^2 (per cm)', ecartRydbergPourCent: 'Largest row gap to it (percent)', pireLigne: 'Row furthest from it', residusN: 'Q_K - (N - 1), element by element', avecTrouResidu: 'Largest Q - (N - 1) with the empty place 43', sansTrouResidu: 'Same without the empty place',
  /* game249 */
  loiHubble1929: 'Magnitudes not recovered, or slope through zero off 465 by more than 50', kOrigine: 'Slope through zero (km/s per Mpc)', kAvecOrdonnee: 'Slope with an intercept (km/s per Mpc)', correlationHubble: 'Correlation of velocity with distance', magnitudeMoyenne: 'Absolute magnitudes recomputed: mean', ecartMagnitudes: 'Largest gap to the printed magnitudes', correlationMelangee: 'Same correlation, velocities shuffled (20 seeds)',
  /* game248 */
  vieGraunt: 'Survivors, his subtractions or the fifth not recovered', esperanceNaissance: 'Life expectancy at birth from his table (years)', entre16et56: 'Alive between 16 and 56 (out of 100)', combattantsRecalcul: '34 % of 199112 men, recomputed', combattantsImprime: 'Same, as printed', geometrique16: 'His geometric method: alive at 16', raisonTable: 'His table: alive at 16 / alive at 6',
  /* game247 */
  gouttesMillikan: '61.120, 4.774 or 6.062 not recovered, or a drop beyond 1 %', moyenne23: 'First 23 drops: mean e^(2/3) x 10^8', moyenne58: 'All 58 drops: mean', moyenne58Imprimee: 'All 58, as printed', eFinal: 'e (10^-10 esu)', nAvogadro: 'Avogadro number N', ecartMaxPourCent: 'Largest drop gap to the mean (percent)', ecartTypePourCent: 'Standard deviation (percent)', moyenneCourante: 'Running mean drawn', e1911EnIncertitudes: 'Earlier value minus final (final uncertainties)',
  /* game246 */
  lynxHudson: 'Peak period off 9.63, or the cycle table inconsistent', anneesPics: 'Peak years', periodePics: 'Mean years between peaks', periodeLongue: 'Elton and Nicholson, 1752-1935: years per cycle', neufDixPourCent: 'Cycles of 9 or 10 years (percent, recomputed)', imprime78: 'Same, as printed', acfDecalage: 'Autocorrelation at the chosen lag', acf10: 'Autocorrelation at 10 years', acf10Melange: 'Same, years shuffled (20 seeds)',
  /* game245 */
  eclipseEddington: 'Sobral or Principe off Einstein by 2 probable errors, or stars closer to Newton', bordAjuste: 'Seven stars, line through zero: deflection at the limb (arcseconds)', rmsEinstein: 'Stars: rms gap to Einstein (arcseconds)', rmsNewton: 'Stars: rms gap to Newton (arcseconds)', sobralEnEp: 'Sobral minus Einstein (probable errors)', principeEnEp: 'Principe minus Einstein (probable errors)', newtonEnEp: 'Sobral minus Newton (probable errors)',
  /* game244 */
  equivalentJoule: 'Material means, vacuum / air ratio or last-series division off', moyennesMateriaux: 'Means in vacuo: water, mercury, cast iron', rapportsVideAirJoule: 'Vacuum / air, series 1 to 5', derniereSerie: 'Last series: 2057.336 / 2.65504', etendueCinq: 'Spread of the five series (share)', moyenneCinq: 'Average of the five series', retenue: 'Value Joule kept (water)',
  /* game243 */
  densiteCavendish: 'Second-wire mean, range or extreme not as in the text', moyenneFil2: 'Second wire, 23 results: mean', etendue23: 'Second wire: range', ecartMax23: 'Second wire: largest gap to 5.48', moyenne29: 'All 29 results: mean', moyenneChoisie: 'Mean drawn', moyenneFil1: 'First wire, 6 results: mean',
  /* game242 */
  fievreSemmelweis: 'Doctors clinic not deadlier every year, printed 9.92 not recovered, or clinics still apart in 1848', tauxAvant: 'Deaths per hundred, 1841-1846: doctors / midwives', totaux: 'Deaths / births, 1841-1846: doctors ; midwives', z1848: 'Gap between clinics in 1848 (standard errors)', tauxApres: 'Deaths per hundred, 1848: doctors / midwives', coquilleSemmelweis: 'Printed totals that do not follow from the counts', anneeVue: 'Year shown: doctors / midwives (per hundred)', zAvant: 'Gap between clinics 1841-1846 (standard errors)',
  /* game241 */
  oubliEbbinghaus: 'His calculated column not recovered, or other points beyond 2', calculRefait: 'His formula, recomputed (per cent)', ecartColonneCalculee: 'Largest gap to his printed calculated column', horsErreur: 'Points more than 2 off his formula (minutes)', tauMinutes: 'Exponential through the first two points: time constant (minutes)', expoA1440: 'That exponential after one day (per cent)', observe1440: 'Measured after one day (per cent)',
  /* game240 */
  carteSturtevant: 'Sums off, map not recovered, or a middle pair off additivity', positionsRefaites: 'Map positions rebuilt from short intervals', ecartsCourts: 'Observed minus map for BP, BR, (C,O)R', coquillesSturtevant: 'Printed per cents that do not follow from the fractions', pairesMontrees: 'Pairs shown', additifBM: 'B to M on the map', observeBM: 'B to M observed (per cent)',
  /* game239 */
  argonRayleigh: 'Recomputed means or grams per litre off the printed figures', moyenneChimique: 'Chemical nitrogen, mean (grams in the globe)', moyenneAtmospherique: 'Air nitrogen, mean (grams in the globe)', litreChimique: 'Chemical nitrogen (grams per litre)', litreAtmospherique: 'Air nitrogen (grams per litre)', litreAbregeErrone: 'Chemical, with the correction subtracted as in the 1895 abstract', ecartGrammes: 'Air minus chemical (grams)', ecartPourCent: 'Air minus chemical (percent)', enEtendues: 'Gap in whole spreads of the chemical methods', enEcartsTypes: 'Gap in standard deviations of the chemical methods',
  /* game238 */
  diffusionAlpha: 'A series off the sin^4 law by more than 1.7, slope off -4, or printed column off', rapportMaxMin: 'Largest / smallest N sin^4, per metal and series', orMinMax: 'Gold, first series: smallest / largest N sin^4', penteLogLogOr: 'Slope of log N against log sin(angle / 2), gold', ecartImprime: 'Largest gap to the printed column (share)', loiSinusCarre: 'A 1 / sin^2 law, predicted at 15 degrees', observe15: 'Counted at 15 degrees',
  /* game237 */
  michaelisMenten: 'Fitted K more than 15 % from the 1913 constant', kAjuste: 'Fitted half-saturation K (mol/L)', vMaxAjuste: 'Fitted maximum rate (relative)', k1913: 'Michaelis and Menten 1913 constant (mol/L)', rapportK: 'Fitted / 1913', doublements: 'Rate ratio when the sugar doubles (low, middle, top)',
  /* game236 */
  especesAire: 'Refitted coefficients off the published ones', semiLogA: 'Species at 1 square mile (fit on near islands)', semiLogB: 'Species gained per tenfold area', ilesSemiLog: 'Near islands in that fit', cAjuste: 'log species at 1 square mile (power fit)', zAjuste: 'Power exponent z (near islands above 1 square mile)', ilesPuissance: 'Islands in that fit', droiteAffichee: 'Line drawn', nusavePredit: 'Nusave predicted by z = 0.25 from Bougainville', nusaveObserve: 'Nusave observed',
  /* game235 */
  loiOhm: 'Free b off 20 1/4, a reading off the law by 3 %, or the brass check off', bLibre: 'b fitted freely, series I to V (Zoll)', aLibre: 'a fitted freely, series I to V', laitonZoll: 'Brass wires as copper length (Zoll)', serieChoisie: 'Series shown', aSerie: 'Ohm a for that series', sansResistanceInterne130: 'Without b: predicted twist at 130 Zoll',
  /* game234 */
  loiBoyle: 'Volume x pressure off its mean by more than 1 %, or slope off -1', produitMoyen: 'Mean volume x pressure', produitMin: 'Smallest volume x pressure', produitMax: 'Largest volume x pressure', ecartRelatifMax: 'Largest gap to the mean (share)', penteLogLog: 'Slope of log pressure against log volume', penteDebut: 'Slope on the first readings only (shown, not judged)', lignesPrises: 'First readings in that fit', lineaireA12: 'Straight line, predicted at A = 12 (inches)', mesureA12: 'Boyle at A = 12 (inches)',
  /* game233 */
  raiesBalmer: 'Fitted Rydberg constant off R_H, or a Bohr line off NIST', rydbergAjuste: 'Rydberg constant fitted on NIST lines (m^-1)', rapportRH: 'Fitted / R_H', ordonneeSurQuart: 'Intercept / (R / 4)', ecartBohrMaxNm: 'Largest Bohr minus NIST gap (nm)', ecartsBohrNm: 'Bohr minus NIST, line by line (nm)', rapportVideAir: 'Vacuum / air wavelength', ecartRInfiniHalpha: 'H-alpha with an infinite nucleus minus NIST (nm)',
  /* game232 */
  choleraSnow: 'Recomputed ratios outside the range Snow wrote', tauxPour10000: 'Deaths per 10,000 houses, recomputed', rapportRisque: 'Southwark and Vauxhall / Lambeth, first seven weeks', rapportDeuxiemePeriode: 'Same ratio, next seven weeks', coquilles: 'Printed rates that do not follow from the counts', echantillonSV: 'Drawn sample: Southwark and Vauxhall', echantillonLambeth: 'Drawn sample: Lambeth', rapportNaif: 'Deaths alone, without houses (times)',
  /* game231 */
  demiViesNPL: 'Isotopes not leaving exactly 1/2 after one half-life and 1/8 after three', lambdasParJour: 'Decay constant per day +- its uncertainty', isotopeChoisi: 'Isotope chosen', resteChoisi: 'Share left at the chosen number of half-lives', ageTroisDemiViesC14: 'Carbon-14 sample with 1/8 left: age (years)', incertitudeAgeC14: 'Its uncertainty (years)', lineaireVideApres: 'A straight-line decay is empty after (half-lives)',
  /* game230 */
  effetPhotoelectrique: 'Metals whose stopping-voltage line misses slope h/e or intercept -phi/e', hSurE: 'Planck constant / electron charge (V s)', hcSurENm: 'hc/e (eV nm)', seuilNm: 'Threshold wavelength of each metal (nm)', K200Ag: 'Silver at 200 nm: maximum electron energy (eV)', metalChoisi: 'Metal chosen', KchoisiEv: 'Maximum electron energy at the chosen light (eV, negative = none)', photon300: 'Photon energy at 300 nm (eV)',
  /* game229 */
  loiKleiber: 'Fitted exponent far from 3/4, or a poor fit', r2: 'Fit quality R2', parKgExtremes: 'kcal per kg per day: smallest / largest animal',
  /* game228 */
  hodgkinHuxley: 'Membrane at rest drifting more than 0.5 mV', ENa: 'Sodium reversal potential (mV, modern)', EK: 'Potassium reversal potential (mV, modern)', EL: 'Leak reversal potential (mV, modern)', deriveRepos: 'Largest drift at rest (mV)', pics: 'Spikes in 50 ms', portesRepos: 'Gates m, n, h at rest',
  /* game227 */
  electronegativite: 'Steps where electronegativity does not rise along a period, or does not fall down a column', correlationIonisation: 'Correlation with ionization energy (r)', creuxIonisation: 'Where ionization energy drops along a period',
  /* game226 */
  populationMonde: 'Decades without growth, a growth peak not in the 1960s, or growth rates rising again after it', tauxParDecennie: 'Mean growth rate of each decade (percent per year)', decenniePic: 'Decade of fastest growth', expo2020: 'Fitted exponential at 2020 (thousands)',
  /* game225 */
  courbeKeeling: 'Years where CO2 did not rise, or no acceleration over the window', annees: 'Years in the NOAA file', premiere: 'First year and value (ppm)', derniere: 'Last year and value (ppm)', hausseDebut: 'Mean rise over the first years (ppm per year)', hausseFin: 'Mean rise over the last years (ppm per year)',
  /* game224 */
  energieLiaison: 'Light-nucleus fusions that would not release energy, or uranium not below iron', QkeV: 'Energy released by D+D, triple alpha and C12+He4 (keV)', plusLie: 'Most tightly bound nucleus in the list', reactionChoisie: 'Reaction drawn',
  /* game223 */
  mareeVivesEaux: 'Daily delay, spring-tide period or spring/neap ratio off the M2 + S2 prediction', periodeM2Heures: 'Lunar tide period M2 (h)', retardMinutes: 'Measured daily delay of high water (min)', retardTheoMinutes: 'Predicted daily delay (min)', vivesEauxJours: 'Measured time between spring tides (days)', vivesEauxTheoJours: 'Predicted time between spring tides (days)', rapportVivesMortes: 'Highest high water / lowest high water',
  /* game222 */
  arrhenius: 'Rate off the published points, or integration off the exact second-order curve', Ea: 'Activation energy (J/mol)', A: 'Pre-exponential factor (L/(mol s))', kCurseur: 'Rate constant at the chosen temperature (L/(mol s))',
  /* game221 */
  gutenbergRichter: 'Re-estimated b more than 4 standard errors off, or catalogue counts that do not add up', bEstime: 'b measured back from the drawn quakes (Aki)', totalCatalogue: 'Quakes in the 2024 world catalogue', cumulCatalogue: 'Quakes at least as strong as each class (2024)',
  /* game220 */
  loiZipf: 'Published counts not strictly decreasing with rank', penteR: 'Fitted slope on the chosen ranks', pente30: 'Fitted slope on ranks 1 to 30', sommeTrente: 'Total count of the 30 words',
  /* game219 */
  atmosphereStandard: 'Points where step-by-step pressure leaves the closed formula', quatreAltitudes: 'T (K) / p (Pa) at 0, 5, 11 and 20 km', pression11: 'Pressure at 11 km (Pa)', Hgeopotentiel: 'Geopotential height of 5 km geometric (m)',
  /* game218 */
  entropieShannon: 'Huffman length outside [H, H + 1), or a long drawn text far from H', entropie: 'Entropy H (bits per letter)', longueurHuffman: 'Huffman average code length (bits)', entropieTexte: 'Entropy of the drawn text (bits per letter)', totalLettres: 'Letters in the published sample',
  /* game217 */
  gammeTemperee: 'Step that misses the octave, or fifth and fourth errors that do not cancel', pasRapport: 'Ratio of one step', quinteCents: 'Fifth error (cents)', tierceCents: 'Major third error (cents)', quarteCents: 'Fourth error (cents)', douze: 'The 13 ratios for N = 12', commaFraction: 'Pythagorean comma (exact fraction)',
  /* game216 */
  pileDaniell: 'Discharge steps off the Nernst slope, or voltage going up', E0: 'Standard cell voltage (V)', penteDecade298mV: 'Voltage drop per tenfold Q at 298.15 K (mV)', troisExemples: 'E at 298.15 K for three ion pairs (V)',
  /* game215 */
  geometrieVSEPR: 'Lone-pair-free molecules off their ideal angle, or angles not falling CH4 > NH3 > H2O', angleTetraedre: 'Tetrahedral angle arccos(-1/3), degrees', angleMesure: 'Measured bond angle (NIST), degrees', angleDessine: 'Bond angle read back from the drawing, degrees',
  /* game214 */
  titrageAcideFaible: 'Charge residual too big, pH going down, or half-equivalence pH far from pKa', residuMax: 'Largest charge balance residual (relative)', demiEquivalence: 'pH at half-equivalence', quatrePoints: 'pH at 0, 50, 100 and 150 percent',
  /* game213 */
  codeGenetique: 'Table counts off (21 classes, 3 stops) or synonymous ranking off (third > first > second)', degenerescence: 'Codons per amino acid', synonymesParPosition: 'Synonymous share of point mutations, by codon position', synonymesGlobal: 'Synonymous share of all point mutations',
  /* game212 */
  fourmiLangton: 'Transient length off 9976, or steps off the (-2, -2) highway', dernierDesaccord: 'Last step whose turn differs 104 steps later', a10000: 'Position and heading at step 10000', a10104: 'Position and heading at step 10104', noiresFin: 'Black squares at the end', desaccord52: 'Mismatches with period 52', desaccord103: 'Mismatches with period 103',
  /* game211 */
  suitePadovan: 'Terms that break P(n - 1) + P(n - 5), and ratios far from the plastic number', trenteEtUn: 'P(0..30)', plastique: 'Plastic number (root of x^3 = x + 1, by bisection)',
  /* game210 */
  thueMorse: 'Construction mismatches, cubes in the prefix, and unequal power sums below the limit', soixanteQuatre: 'First 64 terms', rangK: 'Largest k checked (2^k terms)',
  /* game209 */
  suitePerrin: 'Primes p that do not divide P(p)', composesDivisent: 'Composites up to the slider that divide P(n)', vingtSix: 'P(0..25)', diviseur: 'Smallest divisor found',
  /* game208 */
  suiteKolakoski: 'Runs whose length differs from the term they should match', unsSoixante: 'Number of 1s among the first 60 terms', proportionUns: 'Share of 1s up to the slider (measured)',
  /* game207 */
  suiteRecaman: 'Jumps that are not n, or that break the step-back rule', premierRepete: 'First repeated value and its two positions', plusPetitAbsent: 'Smallest number not yet reached',
  /* game206 */
  triangleNarayana: 'Rows that miss the formula, the Catalan sum or the symmetry', huitLignes: 'Rows 1 to 8', retoursTrois: 'n = 3 counted by returns to the axis',
  /* game205 */
  schroderChemins: 'Enumerated paths vs S(n), two recurrences, and odd counts past 0', treize: 'S(0..12)',
  /* game204 */
  frobeniusPieces: 'Coin pairs that break Sylvester (largest impossible, count, symmetry)', couples: 'Coprime coin pairs checked', grilleSylvester: 'Grid a = 3..9, b = 4..11 (largest impossible / count)',
  /* game203 */
  goldbachPaires: 'Even numbers from 6 with no split into two odd primes (finite check)', soixante: 'Splits of 4, 6, ..., 60', rapportMod3: 'Mean splits of multiples of 3 over the others (from 30)',
  /* game202 */
  indicatriceEuler: 'Divisor sums that miss n, broken multiplicativity, odd phi past 2', quarante: 'phi(1..40)',
  /* game201 */
  periodePisano: 'Cycles that do not close, lcm rule broken, odd periods past 2, periods above 6m', sixM: 'Moduli whose period is exactly 6m',
  /* game200 */
  motzkinChemins: 'Enumerated paths vs M(n), and recurrence vs the Catalan sum', seize: 'First sixteen values',
  /* game199 */
  stirlingBell: 'Enumerated partitions vs recurrence, and Bell sums vs the Aitken triangle', ligneHuit: 'S(8, k) for k = 1..8', bellOnze: 'Bell(0..10)', partitions: 'Partitions counted by number of blocks',
  /* game198 */
  routineKaprekar: 'Starts that do not settle on one single fixed point', pmax: 'Most steps needed', distribution: 'How many starts need each number of steps',
  /* game197 */
  suiteCollatz: 'Starts that do not reach 1, and m where flight(2m) is not flight(m) + 1 (finite check)',
  /* game196 */
  nombresHarmoniques: 'n where H(n) leaves its log bounds, is whole, or misses 2^floor(log2 n)',
  /* game195 */
  derangements: 'Enumerated derangements vs D(n), and inclusion-exclusion vs recurrence', arrondiE: 'm where D(m) is not the nearest integer to m!/e',
  /* game194 */
  regarderDire: 'Terms with a digit above 3 or the block 333 (measured)',
  /* game193 */
  hanoi: 'Moves vs 2^n - 1, illegal moves, tower not arrived', gray: 'Moves that do not match the Gray code',
  /* game192 */
  calkinWilf: 'Fractions not reduced, repeated, or off fusc(n)/fusc(n + 1)', complet: 'Reduced fractions missing',
  /* game191 */
  lucas: 'Pascal mod p vs the base-p digit rule (cells that differ)',
  /* game190 */
  unicite: 'Greedy writings with neighbours, or not exactly one writing',
  /* game189 */
  josephus: 'Simulated survivor vs recurrence (sizes that differ)', formule2L: 'k = 2 : sizes where J differs from 2L + 1',
  /* game188 */
  faulhaber: 'Power sums vs Faulhaber s formula (pairs that differ)', vonStaudt: 'von Staudt-Clausen failures', impairsNuls: 'Odd-index B that are not 0',
  /* game187 */
  parfaits: 'Perfect numbers found', amicaux: 'Amicable pairs found', euclideEuler: 'Even perfect numbers not of Euclid s form',
  /* game186 */
  identiteMobius: 'n where sum M(n div k) is not 1',
  /* game185 */
  wilson: 'Wilson s test vs trial division (n that disagree)', composes: 'Composites breaking the 2 / 0 rule',
  /* game184 */
  carmichael: 'Carmichael numbers found (Korselt)', pseudo: 'Base-2 pseudoprimes found', inclusion: 'Carmichael numbers that do not fool base 2',
  /* game183 */
  pell: 'x1^2 - D y1^2 - 1 (exact)', minimale: 'A smaller solution exists (0 = none)',
  /* game182 */
  jacobiQuatre: 'r4 counted vs 8 x divisors not divisible by 4 (values that differ)', deuxCarres: 'r2 counted vs 4 (d1 - d3) (values that differ)',
  /* game181 */
  croise: 'Crossed order wrongly accepted (0 = refused)', ptolemee: 'AC.BD = AB.CD + AD.BC on the squared lengths (exact)',
  /* game180 */
  pascal: 'Twice the area of the three meeting points (0 = aligned, exact)',
  /* game179 */
  sansTriangle: 'Two-colourings with no one-colour triangle', cycles5: 'K5 colour classes that are not a 5-cycle',
  /* game178 */
  catalan: 'Triangulation counts vs binom(2m, m)/(m + 1) (polygons that differ)', diagonales: 'Drawn triangulation: wrong count plus crossings',
  /* game177 */
  egalite: 'Distinct-part vs odd-part counts that differ', glaisher: 'Glaisher map there and back (0 = exact)',
  /* game176 */
  alignes: 'Twice the area of the three feet (0 = aligned, exact)', surCercle: 'P on the circumscribed circle: |OP|^2 - R^2 (exact)',
  /* game175 */
  encadre: 'n where 1/(n+1) < pi^2/6 - S_n < 1/n fails', sommeExacte: 'S_n as an exact fraction',
  /* game174 */
  webster: 'Morley sides vs 8 R sin(A/3) sin(B/3) sin(C/3) (largest relative gap)',
  /* game172 */
  poignees: 'Corners of all faces minus 2E (every edge borders two faces)',
  /* game171 */
  comptes: 'Walks counted vs OEIS A001411 (lengths that disagree)', sousMult: 'c(m + k) > c(m) c(k) (pairs breaking it)',
  /* game170 */
  retour: 'Generations until the exact same cells come back',
  /* game169 */
  interne: 'Nine-point circle vs incircle: touch from inside (exact)', externes: 'Excircles not touching from outside (exact)', neufPoints: 'Nine-point circle through a side midpoint (exact)',
  /* game168 */
  caustique: 'Confocal parameter of the chords: largest change', foyers: 'Sum of distances to the foci vs 2 (largest gap)',
  /* game167 */
  equilateral: 'Outer Napoleon triangle: sides that differ (exact)', interieur: 'Inner Napoleon triangle: sides that differ (exact)', aires: 'Outer minus inner area minus the triangle (exact)',
  /* game166 */
  dualite: 'Crossing probability vs 1/2, every configuration (gap)', simulee: 'Random rectangles crossed vs 1/2',
  /* game165 */
  pick: 'Pick: twice the area vs 2I + B - 2 (gap)', bordPgcd: 'Boundary points vs the sum of gcds (gap)',
  /* game164 */
  virages: 'Turns: recurrence vs bit rule (disagreements)', segments: 'Unit segments drawn vs 2^n', bouts: 'Squared distance between the ends vs 2^n',
  /* game163 */
  pentagonal: 'Euler\'s pentagonal recurrence vs an independent count (disagreements)', dessinee: 'Young diagram drawn: parts add up to n',
  /* game162 */
  catalans: 'Dyck paths counted vs Catalan numbers',
  /* game161 */
  ruine: 'Share of games ruined vs Feller\'s exact formula', duree: 'Mean length of a game vs the exact value',
  /* game160 */
  tirageMoyen: 'Mean draws to complete vs n H_n', courbeDistinctes: 'Distinct coupons after t draws vs n (1 - (1 - 1/n)^t)',
  /* game159 */
  pavageValide: 'Cells covered wrongly in the tiling drawn', petitsDiamants: 'Tilings counted (orders 1-4) vs 2^(k(k+1)/2)', uniformite: 'Chi-square of shuffled tilings (order 2)', caseCentre: 'Centre cell lying, shuffles vs exact (order 4)', arctique: 'Frozen dominoes outside the arctic circle',
  /* game158 */
  aimantationAbs: 'Mean |magnetisation|, Metropolis vs exact enumeration', partition: 'Exact partition function Z (4 x 4 torus)',
  /* game157 */
  pavages: 'Tilings counted vs Kasteleyn\'s product', coin: 'Corner cell lying, uniform draws vs exact probability', fibonacci: 'Witness: 2 x L gives Fibonacci', impair: 'Witness: odd area gives 0',
  /* game155 */
  bandes: 'Edges found vs the spectrum |P| <= 4 (bands or gaps that fail)', gaps: 'Fractions whose open gaps are not q - 1 (odd q) or q - 2 (even q)', centreFerme: 'Even q: central edges vs E = 0', tiers: 'Edges for 1/3 vs the exact radicals', miroirE: 'Spectrum symmetric under E -> -E (largest gap)',
  /* game154 */
  nephroide: 'Bright line found vs the nephroid (largest gap)', pointe: 'Sharp point vs R/2', temoin60: 'Witness: ray at 60 degrees crosses the axis at R',
  /* game153 */
  longueur: 'Shortest network found vs min(L + sqrt 3, 1 + sqrt(3) L)', angles: 'Roads at 120 degrees (largest |cos + 1/2|)', carrefour: 'Crossroad found vs its exact place', plusLongs: 'Witnesses: longer networks',
  /* game152 */
  farey: 'Fractions listed vs 1 + sum phi', voisins: 'Neighbours that fail |ps - qr| = 1', tangence: 'Touching neighbours (worst relative gap)', chevauchement: 'Smallest (ps - qr)^2 - 1 over all pairs', temoin: 'Witness: a case where the rule breaks',
  /* game151 */
  visibles: 'Trees seen, counted vs 2 sum phi - 1', mobius: 'Trees seen vs the Mobius sum', limite: 'Share seen vs its limit 6/pi^2', diagonale: 'Witness: trees seen on the diagonal',
  /* game150 */
  recurrentes: 'Recurrent piles counted vs det of the Laplacian (2 x 2, 3 x 3)', identite: 'Identity of the sandpile group (checks)', abelien: 'Order of the topples: start - end = Delta u (largest gap)',
  /* game149 */
  deviationMin: 'Smallest turn of the light, searched (degrees)', picDuHalo: 'Most frequent turn of the rays thrown (degrees)', temoin90: 'Witness: faces 90 degrees apart (the 46 degree halo)',
  /* game148 */
  courbures: 'Curvatures found vs Descartes (worst relative gap)', centresComplexes: 'Centres found vs complex Descartes (worst residual)', cerclesParGeneration: 'Circles found per generation', entiers: 'Witnesses: whole curvatures, formula without the factor 2',
  /* game146 */
  traceKapitza: 'Floquet trace of one shake (|tr| < 2: it stands)', frequenceLente: 'Slow rocking frequency around the top', grandeAmplitude: 'Slow frequency at a large tilt', temoins: 'Witnesses: shaken too weakly, too strongly',
  /* game145 */
  periodeRebond: 'Bounce period (no sideways push)', traceFloquet: 'Floquet trace of one bounce (|tr| > 2: the swing grows)', tauxBalancement: 'Growth rate of the swing', partBalancement: 'Energy moved into the swing',
  /* game144 */
  periodeNutation: 'Time of one dip of the axis (nutation)', angleBas: 'Lowest angle of the axis (degrees)', precessionNutation: 'Turn around the vertical per dip (radians)', stationnaire: 'Witness: steady precession',
  /* game143 */
  retournement: 'Time between two turn-overs vs the Jacobi solution', tauxEcart: 'Growth rate of a tiny wobble', conservation: 'Drift of energy and angular momentum', axesStables: 'Witness: wobble about the stable axes',
  /* game142 */
  angleMonte: 'Rest angle above the threshold vs acos(1 / omega^2) (worst gap)', fondStable: 'Rest angle below the threshold (the bottom)', penteCosinus: 'Slope of cos(rest angle) against 1 / omega^2', vitessesComptees: 'Spins counted',
  /* game141 */
  hauteurDecollage: 'Height where the top leaves the wall (share of the start)', tempsDecollage: 'Time until the top leaves the wall', murTenu: 'Witness: smallest wall force if the top were held (a pull)',
  /* game140 */
  formeMaillons: 'Joints found vs the exact chain (worst gap)', pentesEgales: 'Even step between link slopes (fitted)', flecheChaine: 'Sag at the middle', limiteContinue: 'Sag: links, catenary, parabola', recherche: 'Energy descent',
  /* game139 */
  periodeIsochrone: 'Period of the ball released highest (timed)', etaleBilles: 'Spread of the periods of all the balls (over 4 pi)', arriveeEnBas: 'Time to reach the bottom vs pi (worst gap)', cercleTemoin: 'Witness: period on a circle released as high',
  /* game138 */
  modeLent: 'Period, swinging together (timed)', modeRapide: 'Period, swinging against each other (timed)', tempsEchange: 'Time for the swing to pass across', energieCouples: 'Energy of the two pendulums and the spring',
  /* game137 */
  anneauxSombres: 'Dark rings found inside 3 mm', rayonsAnneaux: 'Ring radii vs the exact lens sag (worst relative gap)', penteCarres: 'Squared radii step vs lambda R (mm^2)',
  /* game136 */
  demiVieMesuree: 'Half-life counted (steps)', vieMoyenne: 'Mean lifetime counted (steps)', resteCinq: 'Share left after five half-lives',
  /* game135 */
  snellFermat: 'Fastest paths vs Snell (worst gap)', fenetreSnell: 'Snell window: angle to the horizon (degrees)', angleMaxEau: 'Largest angle in water (degrees)',
  /* game134 */
  courbeFentes: 'Summed waves vs sin^2(N phi/2) / (N^2 sin^2(phi/2)) (worst gap)', maximaPrincipaux: 'Bright orders d sin theta = m lambda (worst gap from 1)', minimaEntre: 'Dark fringes between two orders', secondaires: 'Small bright fringes between two orders', comptesCourbes: 'Fringes miscounted, every curve',
  /* game133 */
  picWien: 'Peak of every curve vs Wien (worst relative gap)', picFroid: 'Peak wavelength of the coolest body', aireStefan: 'Area of every curve vs Stefan-Boltzmann (worst relative gap)', puissanceChaude: 'Power, hottest over coolest',
  dureeJours: 'Daylight through the year (worst gap, minutes)', equinoxe: 'Daylight at the equinox', solstice: 'Daylight at the solstice',
  arriveeBlock: 'Arrival of the block', arriveeSphere: 'Arrival of the sphere', arriveeCylinder: 'Arrival of the cylinder', arriveeRing: 'Arrival of the ring', energieRoulants: 'Energy of the rolling bodies',
  /* game126 */
  periodesFilm: 'Periods of every amplitude drawn', partEclairee: 'Lit share of the disc',
  travail: 'Work of one cycle (area)', changer: 'Won by switching', garder: 'Won by sticking', image: 'Where the image forms (di)', grandissement: 'Magnification', convergence: 'Rays through one point (worst gap)',
  angleOptimal: 'Best throwing angle (degrees)', porteeMax: 'Longest throw', enveloppe: 'Above the safety parabola (never)',
  euler: 'Euler: vertices - edges + faces', schlafli: 'Edges vs F p / 2', diedre: 'Angle between faces (degrees)', surSphere: 'All vertices on one sphere',
  chocs: 'Collisions counted (they spell pi)', periodeMode: 'Period of the mode', resteDansLeMode: 'Energy leaking out of the mode',
  relaxation: 'Share of B at the relaxation time', constante: 'Equilibrium constant K = [B]/[A]', seuil: 'Oscillation threshold (Hopf)',
  /* game111 (sciences de la vie) */
  differences: 'Sites that differ from the ancestor', distance: 'Evolutionary distance read back', substitutions: 'Real base changes per site', composition: 'Base composition (chi-square)',
  arnMoyen: 'Mean mRNA count', bruitArn: 'mRNA noise (Fano factor)', proteineMoyenne: 'Mean protein count', bruitProteine: 'Protein noise (Fano factor)', covariance: 'mRNA-protein covariance', simulation: 'Simulation',
  /* game112 */
  frequenceMoyenne: 'Mean share of the variant', heterozygotie: 'Heterozygosity (variety left)', fixation: 'Variant won, among fixed populations',
  enzymeTotale: 'Total enzyme (free + bound)', matiereTotale: 'Total matter (S + C + P)', vitesseReaction: 'Rate of product formation', produitFinal: 'Product at the end',
  L: 'Angular momentum L',
  L1: 'L1',
  L2: 'L2',
  L3: 'L3',
  L4: 'L4',
  accelerationPropre: 'Proper acceleration',
  affichage: 'Display',
  age: 'Age',
  ageAujourdhui: 'Age today',
  ageUnivers: 'Age of the universe',
  aimantation: 'Magnetization',
  aire: 'Area',
  aireOrdre2: 'Area, second order',
  alphaS: 'alpha_s',
  amplification: 'Magnification',
  amplitudeCentroide: 'Centroid amplitude',
  angle: 'Angle',
  angleAuSecondaire: 'Angle to secondary',
  anglePhase: 'Phase angle',
  attendu: 'Expected pairs',
  avant: 'Forward fraction',
  bCritique: 'Critical impact parameter',
  bilanEnergie: 'Energy balance',
  bord: 'Boundary',
  bordImpulsion: 'Momentum edge',
  bulles: 'Bubbles',
  carter: 'Carter constant',
  cassure: 'String breaking',
  centreMoyen: 'Mean centre',
  centroideMoyen: 'Mean centroid',
  champFaible: 'Weak field',
  chsh: 'CHSH',
  chuteKepler: 'Keplerian fall-off',
  coalescence: 'Coalescence',
  coherenceEdo: 'ODE consistency',
  colonnes: 'Columns',
  compression: 'Squeezing',
  coneLumiere: 'Light cone',
  configuration: 'Configuration',
  constantePeters: 'Peters constant',
  constantes: 'Constants',
  correlation: 'Correlation',
  coupure: 'Cutoff',
  courbe: 'Curve',
  courbes: 'Curves',
  courbure: 'Curvature',
  critique: 'Critical point',
  croissance: 'Growth',
  decalageCompton: 'Compton shift',
  deltaAlphaLeptonsMZ: 'Delta alpha leptons at MZ',
  deltaV: 'Delta-v',
  demiGrandAxe: 'Semi-major axis',
  demiGrandsAxes: 'Semi-major axes',
  densites: 'Densities',
  depart: 'Initial state',
  deriveLongitude: 'Longitude drift',
  derivePeriode: 'Period drift',
  dernierInstantDessine: 'Last drawn instant',
  dessin: 'Drawing',
  diffusion: 'Diffusion',
  diffusionClassique: 'Classical diffusion',
  dimensionBoite: 'Box-counting dimension',
  dispersion: 'Dispersion',
  distanceCMB: 'Distance to the CMB',
  distanceEarth: 'Earth distance',
  distanceMars: 'Mars distance',
  distanceMercury: 'Mercury distance',
  distanceMinAuSecondaire: 'Min distance to secondary',
  distancePropre: 'Proper distance',
  distanceVenus: 'Venus distance',
  distanceZ1: 'Distance at z = 1',
  divergence: 'Divergence',
  divergenceHorizon: 'Divergence at horizon',
  domaine: 'Domain',
  dureeDeVie: 'Lifetime',
  dureeTransfert: 'Transfer duration',
  ecartEnergie: 'Energy gap',
  ecartTypeFinal: 'Final standard deviation',
  echantillonnage: 'Sampling',
  echantillons: 'Samples',
  echelle: 'Scale',
  ehrenfest: 'Ehrenfest',
  ellipse: 'Ellipse',
  energie: 'Energy',
  energieCinetique: 'Kinetic energy',
  energieCoeurs: 'Core energy',
  energieMoyenne: 'Mean energy',
  energieTotale: 'Total energy',
  equilibreCMB: 'CMB equilibrium',
  eres: 'Eras',
  erreurL2: 'L2 error',
  etendue: 'Extent',
  etirement: 'Stretching',
  etoiles: 'Stars',
  evenements: 'Events',
  excentricite: 'Eccentricity',
  exposant: 'Exponent',
  exposantClassique: 'Classical exponent',
  exposantLibre: 'Free expansion exponent',
  exposantQuantique: 'Quantum exponent',
  exposantSedov: 'Sedov exponent',
  facteurEchelleFinal: 'Final scale factor',
  fft: 'FFT',
  film: 'Film',
  formuleFermee: 'Closed formula',
  fractionCondensat: 'Condensate fraction',
  fractionEcran: 'Screen fraction',
  fractionHaut: 'Fraction up',
  fractionInteraction: 'Interaction fraction',
  fractionVraiVide: 'True vacuum fraction',
  frequenceIsco: 'ISCO frequency',
  frequenceRabi: 'Rabi frequency',
  frequenceRadiale: 'Radial frequency',
  fugacite: 'Fugacity',
  gCentre: 'g at the centre',
  gMax: 'Max g',
  gSurface: 'Surface g',
  gamma: 'gamma',
  gibbs: 'Gibbs overshoot',
  giration: 'Gyration',
  goldstone: 'Goldstone mode',
  gorge: 'Throat',
  gps: 'GPS',
  grille: 'Grid',
  hamiltonien: 'Hamiltonian',
  hbarcGeVfm: 'hbar c (GeV fm)',
  humains: 'Humans',
  hyperbole: 'Hyperbola',
  hyperbolique: 'Hyperbolic',
  images: 'Images',
  impulsionAngulaire: 'Angular impulse',
  impulsionX: 'Impulse x',
  impulsionY: 'Impulse y',
  incertitude: 'Uncertainty',
  inclinaison: 'Tilt',
  integrale: 'Integral',
  integraleRayon1: 'Integral, ray 1',
  integraleRayon2: 'Integral, ray 2',
  integraleRayon3: 'Integral, ray 3',
  integraleRayon4: 'Integral, ray 4',
  interfrange: 'Fringe spacing',
  intervalle: 'Interval',
  inverseAlpha: 'Inverse alpha',
  isco: 'ISCO',
  isometrie: 'Isometry',
  jacobi: 'Jacobi constant',
  jumeaux: 'Twins',
  largeur: 'Width',
  largeurPaquet: 'Packet width',
  leibniz: 'Leibniz series',
  ligneDeChamp: 'Field line',
  limiteNewton: 'Newtonian limit',
  loiDeGreen: 'Green law',
  loiEnPuissance: 'Power law',
  loiM3: 'M^3 law',
  longueurMagnetique: 'Magnetic length',
  machin: 'Machin formula',
  marges: 'Marginals',
  masse: 'Mass',
  masseChirp: 'Chirp mass',
  masseHaloEnRs: 'Halo mass within rs',
  memeAngle: 'Same angle',
  miroirs: 'Mirror points',
  modes: 'Modes',
  modesDessines: 'Drawn modes',
  momentAngulaireCorrige: 'Corrected angular momentum',
  momentCinetique: 'Angular momentum',
  momentCinetiqueZ: 'Angular momentum z',
  momentMagnetique: 'Magnetic moment',
  monteCarlo: 'Monte Carlo',
  motifDipolaire: 'Dipole pattern',
  moyennes: 'Averages',
  mu: 'Mass ratio mu',
  negativite: 'Negativity',
  noeuds: 'Nodes',
  normalisation: 'Normalization',
  norme: 'Norm',
  normeBloch: 'Bloch vector norm',
  normeVitesse: 'Velocity norm',
  note: 'Note',
  orbites: 'Orbits',
  ordre: 'Order parameter',
  orthogonalite: 'Orthogonality',
  p2Final: 'Final p^2',
  parImage: 'Per image',
  pas: 'Step',
  pasHelice: 'Helix pitch',
  penteLongue: 'Long-range slope',
  penteQuantique: 'Quantum slope',
  periastre: 'Periastron',
  pericentre: 'Pericentre',
  perihelie: 'Perihelion',
  periode: 'Period',
  periodeBattement: 'Beat period',
  periodeEarth: 'Earth period',
  periodeMars: 'Mars period',
  periodeMercury: 'Mercury period',
  periodeOscillation: 'Oscillation period',
  periodeSynodique: 'Synodic period',
  periodeVenus: 'Venus period',
  phaseStationnaire: 'Stationary phase',
  phenomB: 'PhenomB',
  photons: 'Photons',
  pic: 'Peak',
  planck2018: 'Planck 2018',
  planetes: 'Planets',
  plansNodaux: 'Nodal planes',
  plat: 'Flat',
  platitude: 'Flatness',
  plusProcheVoisin: 'Nearest neighbour',
  poidsModes: 'Mode weights',
  pont: 'Bridge',
  precession: 'Precession',
  premiereIntegrale: 'First integral',
  pression: 'Pressure',
  probabiliteTotale: 'Total probability',
  profil: 'Profile',
  psiRepereMobile: 'Psi, moving frame',
  psiRepereOscillant: 'Psi, oscillating frame',
  quantiqueSurClassique: 'Quantum over classical',
  quantiteDeMouvement: 'Momentum',
  quartDeRevival: 'Quarter revival',
  queues: 'Tails',
  r2Echantillon: 'Sampled r^2',
  r2Quadrature: 'Quadrature r^2',
  raies: 'Spectral lines',
  rapportClassique: 'Classical ratio',
  rapportEB: 'E over B ratio',
  rapportFibonacci: 'Fibonacci ratio',
  rapportQuantique: 'Quantum ratio',
  rapportQuartDeTour: 'Quarter-turn ratio',
  rapportsDePeriodes: 'Period ratios',
  rayon1: 'Ray 1',
  rayon2: 'Ray 2',
  rayon3: 'Ray 3',
  rayon4: 'Ray 4',
  rayonAnneau: 'Ring radius',
  rayonChoc: 'Shock radius',
  rayonDeHill: 'Hill radius',
  rayonFinal: 'Final radius',
  rayonMin: 'Min radius',
  rayonMoyen: 'Mean radius',
  rayonObservable: 'Observable radius',
  rayonSchwarzschild: 'Schwarzschild radius',
  rayonSurface: 'Surface radius',
  rayons: 'Radii',
  rayonsMoyens: 'Mean radii',
  recycles: 'Recycled',
  reference: 'Reference',
  reglage: 'Settings',
  relationsDeLaplace: 'Laplace relations',
  rendement: 'Efficiency',
  residus: 'Residuals',
  resonance: 'Resonance',
  resteFinal: 'Final remnant',
  resurgence: 'Revival',
  revivalComplete: 'Full revival',
  revivalMiroir: 'Mirror revival',
  ringdown: 'Ringdown',
  rotation: 'Rotation',
  rythmes: 'Clock rates',
  sautDensite: 'Density jump',
  sectionEfficace: 'Cross section',
  separation: 'Separation',
  separationMax: 'Max separation',
  sequencePrincipale: 'Main sequence',
  signal: 'Signal',
  slater: 'Slater rules',
  snell: 'Snell law',
  soleil: 'Sun',
  somme: 'Sum',
  sommeProbabilites: 'Sum of probabilities',
  spectre: 'Spectrum',
  sphere: 'Sphere',
  spherePhotons: 'Photon sphere',
  spins: 'Spins',
  spirale: 'Inspiral',
  stabilite: 'Stability',
  stefanBoltzmann: 'Stefan-Boltzmann',
  strainMax: 'Max strain',
  symetrie: 'Symmetry',
  tailleFinale: 'Final size',
  taux: 'Rate',
  temperature: 'Temperature',
  temperatureCritique: 'Critical temperature',
  temperatureNaturelle: 'Natural temperature',
  tempsAvantRip: 'Time before rip',
  tempsCoordonne4M: 'Coordinate time at 4M',
  tempsFinal: 'Final time',
  tempsFusion: 'Merger time',
  tempsPropreHorizon: 'Proper time to horizon',
  tempsPropreTotal: 'Total proper time',
  terreSoleil: 'Earth vs Sun',
  traces: 'Traces',
  transfert: 'Transfer',
  transfertMax: 'Max transfer',
  transition: 'Transition',
  transitionAcceleration: 'Acceleration onset',
  transmission: 'Transmission',
  transport: 'Transport',
  traversee: 'Crossing',
  traverseePREM: 'Crossing (PREM)',
  traverseeUniforme: 'Crossing (uniform)',
  variances: 'Variances',
  variancesModes: 'Mode variances',
  vide: 'Vacuum',
  viriel: 'Virial',
  vitesse: 'Speed',
  vitesseA8kpc: 'Speed at 8 kpc',
  vitesseAllee: 'Vortex street speed',
  vitesseGroupe: 'Group velocity',
  vitesseHaloEnRs: 'Halo speed at rs',
  vitesseIsco: 'ISCO speed',
  vitesseMax: 'Max speed',
  vitesseMaxHalo: 'Max halo speed',
  vitesseMoyenne: 'Mean speed',
  vitesseParallele: 'Parallel velocity',
  vitesseParoi: 'Wall speed',
  vitesseSoleil: 'Sun speed',
  vitesseTerre: 'Earth speed',
  wronskien: 'Wronskian',
  x2Echantillon: 'Sampled x^2',
  x2Quadrature: 'Quadrature x^2',
  xiSedov: 'Sedov xi',
  /* game96 : tam-theories-3.js */
  deviation: 'Deflection angle', distanceMin: 'Closest approach', doublement1: 'First period doubling', doublement2: 'Second period doubling',
  feigenbaum: 'Doubling ratios (measured)', pointFixe: 'Fixed point', deuxCycle: 'Two-cycle', diagramme: 'Drawn diagram',
  variance: 'Variance', chaleur: 'Total heat', centre: 'Centre', amplitude: 'Steady amplitude', phase: 'Phase lag', regime: 'Regime',
  cycloide: 'Cycloid time', droite: 'Straight-line time', arc: 'Circular-arc time', course: 'Race', extremites: 'End points',
  binomiale: 'Binomial law', moyenne: 'Mean',
});
