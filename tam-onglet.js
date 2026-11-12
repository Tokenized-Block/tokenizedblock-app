/* tam-onglet.js — TAM phase C : l onglet TAM (le DOM, le canvas, les gestes, le son). Importe par app.html A L OUVERTURE de l onglet.
 *   La logique prouvee vit dans tam-vue.js (projection, couches, verdict du rejeu, carte, regle du Mint) et tam-plan.js (le plan du mint).
 *   ⛔ Rien n est signe ici : le mint (5 USDC, par le routeur de paiement TBLOCK sur TAM art) passe par ctx.envoyer, que le WALLET signe.
 *     (game375 : le « Pay with » est retire, Phil 2026-11-12.)
 *   ⛔ Sans adresse TAM art (economie-pack.js, EP.TAM_DEPLOIEMENT), AUCUN bouton Mint : pas un controle inerte. */
import { generer, certifier, rejouer, decoder, canon } from './tam-moteur.js';
import { PORTEUSES } from './tam-moteur.js';
import * as M from './tam-moteur.js';
import * as V from './tam-vue.js';
import { adresseTam, PRIX_TAM, SIG_TAM, appelLecture, decoderBytes, decoderMot, decoderAdresse, octetsDe } from './tam-plan.js';
import { TAMART_DEPLOIEMENT } from './tamart-deploiement.js';
import { planJeuUsdc } from './misables.js';
/* 2026-11-12 (the economy pack is live): the mint is paid through the TBLOCK payment router on TAM art (EP.TAM): the payment itself buys
 *   TBLOCK for the holders vault, so the separate optional buy after a USDC mint (game358) is gone. The first TamArt stays in the gallery. */
import * as EP from './economie-pack.js';
import { projectCam } from './map3d.js';
import { navGesture } from './vision-inside.js';
import { keccak256Hex } from './keccak.js';
import { FEE_WALLET, maskFeeAddresses, displayShort } from './frais-creation.js';
import * as PHY from './tam-physique.js';
import * as SCI from './tam-sciences.js';
import * as FLU from './tam-fluides.js';
import * as TS from './tam-science.js';
/* game79 : « Your formula » (tam-formule.js : analyseur maison, jamais eval ; solveurs numeriques avec leur residu) */
import * as F from './tam-formule.js';
/* game82 : les elements de CONTEXTE (Soleil, trou noir et horizon, Terre et ses couches, noyau, plaques, fentes, points de Lagrange…) */
import * as DEC from './tam-decor.js';
/* game94 : les noms et les cles des mesures, en anglais (tam-cles-en.js) */
import * as CLESEN from './tam-cles-en.js';

/* game76 (Phil : « relativite generale, gravite, fusion, toutes les sciences… fractales, chiffre d or, quantique, fluides — en direct ») :
 *   des simulations VERIFIEES (chaque module a son banc : invariants contre la theorie, mutants), dessinees par la meme scene.
 *   ⛔ Correction du 01/11 : j avais dit « vue seule, TamArt v2 requis » en lisant l octet 4 comme une famille ; c est q (1..16 bits).
 *   Le contrat deploye ne connait pas la famille : une science se minte avec TamArt v1, encodee et rejouee par tam-science.js. */
/* game78 : 54 systemes (tam-science.js les rassemble, meme mint) ranges par THEME, pas par etiquette de science */
const SYSTEMES_SCI = TS.SYSTEMES;
const THEMES = {
  astres: ['systemeSolaire', 'cometeHalley', 'trappist1', 'pointsLagrange', 'amasEtoiles', 'supernova', 'supernovaHydro', 'collisionGalaxies', 'courbeRotation', 'expansionUnivers', 'kepler', 'troisCorps'],
  trousNoirs: ['schwarzschild', 'etoileS2', 'binaireTrouNoir', 'binaireFusion', 'fusionTrousNoirs', 'lumiereTrouNoir', 'kerr', 'trouDeVer', 'trouDeVerSurface', 'pulsarHulseTaylor', 'disqueAccretion',
    'ondeGravitationnelle', 'courbureEspaceTemps', 'chuteTrouNoir', 'dilatationTemps', 'diagrammeEspaceTemps', 'lorentzRelativiste'],
};
/* game80 : les « grandes questions » ont leur groupe */
THEMES.questions = ['videQuantique', 'bigRip', 'fauxVide', 'centreTerre', 'versMars', 'zeroAbsolu', 'tailleUnivers', 'nombrePi', 'calendrierCosmique',
  'penduleFoucault', 'mouvementTerre', 'etoilesHR', 'evaporationTrouNoir', 'tsunami', 'geometrieUnivers', 'tailleEtoiles'];
/* game81 : les champs quantiques, les atomes et les quarks */
THEMES.champs = ['champLibre', 'fluctuationsVide', 'interactionChamps', 'paireSchwinger', 'effetUnruh', 'couplageCourant', 'comptonKleinNishina', 'atomes', 'quarks',
  /* game88 : les principes du vide qui manquaient */
  'videComprime', 'casimirDynamique', 'higgsVide', 'emissionSpontanee'];
/* game93 : six theories classiques qui manquaient (tam-theories-2.js) */
THEMES.theories = ['ising2D', 'lotkaVolterra', 'epidemieSIR', 'lentilleGravitationnelle', 'kuramoto', 'gibbsFourier',
  /* game96 : six de plus (tam-theories-3.js) */
  'rutherford', 'logistique', 'chaleur', 'oscillateurForce', 'brachistochrone', 'galton'];
/* game111 : les sciences de la vie ont leur groupe (tam-biologie.js) */
THEMES.biologie = ['adnMutations', 'dogmeCentral', 'deriveGenetique', 'enzyme', 'mendel', 'neurone', 'hardyWeinberg'];
/* game113 : la chimie a son groupe (tam-chimie.js) */
THEMES.chimie = ['reactionsChaine', 'equilibreChimique', 'brusselator', 'gazParfait', 'carnot'];
/* game115 : les mathematiques du hasard et des nombres ont leur groupe (tam-maths.js) */
THEMES.maths = ['marcheAleatoire', 'aiguilleBuffon', 'anniversaires', 'spiraleUlam'];
/* game120 : ondes, lumiere et son (tam-ondes.js) */
THEMES.ondes = ['arcEnCiel', 'cordeVibrante', 'effetDoppler'];
/* game122 : electricite (tam-electricite.js) ; le triangle de Pascal rejoint les maths */
THEMES.electricite = ['lignesChamp', 'circuitRC'];
THEMES.maths.push('pascalSierpinski');
/* game148 : le joint d Apollonius (idee : codex Grok Bot) */
THEMES.maths.push('apollonius');
/* game150 : le tas de sable abelien (idee : codex Grok Bot) */
THEMES.maths.push('tasDeSable');
/* game151 : le verger d Euclide (idee : codex Grok Bot) */
THEMES.maths.push('vergerEuclide');
/* game152 : les cercles de Ford (idee : codex Grok Bot) */
THEMES.maths.push('cerclesFord');
/* game153 : l arbre de Steiner (idee : codex Grok Bot) */
THEMES.maths.push('fermatSteiner');
/* game154 : la caustique de la tasse (idee : codex Grok Bot) */
THEMES.maths.push('causticTasse');
/* game155 : le papillon de Hofstadter (idee : codex Grok Bot) */
THEMES.maths.push('papillonHofstadter');
/* game157 : les pavages par dominos (idee : codex Grok Bot) */
THEMES.maths.push('dominosKasteleyn');
/* game158 : le modele d Ising (idee : codex Grok Bot) */
THEMES.maths.push('ising');
/* game159 : le diamant azteque (idee : codex Grok Bot) */
THEMES.maths.push('aztecDiamond');
/* game160 : le collectionneur de vignettes (idee : codex Grok Bot) */
THEMES.maths.push('collectionneur');
/* game161 : la ruine du joueur (idee : codex Grok Bot) */
THEMES.maths.push('ruineJoueur');
/* game162 : Catalan et chemins de Dyck (idee : codex Grok Bot) */
THEMES.maths.push('catalanDyck');
/* game163 : les partitions d Euler (idee : codex Grok Bot) */
THEMES.maths.push('partitionEuler');
/* game164 : la courbe du dragon (idee : codex Grok Bot) */
THEMES.maths.push('courbeDragon');
/* game165 : le theoreme de Pick (idee : codex Grok Bot) */
THEMES.maths.push('theoremePick');
/* game166 : percolation de liens (idee : codex Grok Bot) */
THEMES.maths.push('percolationLiens');
/* game167 : le theoreme de Napoleon (idee : codex Grok Bot) */
THEMES.maths.push('napoleon');
/* game168 : le billard elliptique (idee : codex Grok Bot) */
THEMES.maths.push('billardElliptique');
/* game169 : le theoreme de Feuerbach (idee : codex Grok Bot) */
THEMES.maths.push('feuerbach');
/* game170 : le jeu de la vie (idee : codex Grok Bot) */
THEMES.maths.push('jeuDeLaVie');
/* game171 : les marches auto-evitantes (idee : codex Grok Bot) */
THEMES.maths.push('marcheAutoEvitante');
/* game172 : Euler sur des solides non platoniciens (idee : codex Grok Bot) ; reste en 3-D (la vue tourne) */
THEMES.maths.push('eulerSolides');
/* game174 : le theoreme de Morley (idee : codex Grok Bot) */
THEMES.maths.push('morley');
/* game175 : le probleme de Bale (idee : codex Grok Bot) */
THEMES.maths.push('bale');
/* game176 : la droite de Simson (idee : codex Grok Bot) */
THEMES.maths.push('simsonDroite');
/* game177 : parts distinctes = parts impaires (idee : codex Grok Bot) */
THEMES.maths.push('distinctesImpaires');
/* game178 : triangulations et Catalan (idee : codex Grok Bot) */
THEMES.maths.push('triangulations');
/* game179 : Ramsey R(3,3) (idee : codex Grok Bot) */
THEMES.maths.push('ramseyR33');
/* game180 : l hexagramme de Pascal (idee : codex Grok Bot) */
THEMES.maths.push('pascalHexagramme');
/* game181 : le theoreme de Ptolemee (idee : codex Grok Bot) */
THEMES.maths.push('ptolemee');
/* game182 : sommes de carres (idee : codex Grok Bot) */
THEMES.maths.push('sommesCarres');
/* game183 : l equation de Pell (idee : codex Grok Bot) */
THEMES.maths.push('equationPell');
/* game184 : nombres de Carmichael (idee : codex Grok Bot) */
THEMES.maths.push('nombresCarmichael');
/* game185 : le theoreme de Wilson (idee : codex Grok Bot) */
THEMES.maths.push('theoremeWilson');
/* game186 : la fonction de Mertens (idee : codex Grok Bot) */
THEMES.maths.push('fonctionMertens');
/* game187 : parfaits et amicaux (idee : codex Grok Bot) */
THEMES.maths.push('parfaitsAmicaux');
/* game188 : les nombres de Bernoulli (idee : codex Grok Bot) */
THEMES.maths.push('nombresBernoulli');
/* game189 : le probleme de Josephus (idee : codex Grok Bot) */
THEMES.maths.push('problemeJosephus');
/* game190 : Zeckendorf (idee : codex Grok Bot) */
THEMES.maths.push('zeckendorf');
/* game191 : le theoreme de Lucas (idee : codex Grok Bot) */
THEMES.maths.push('theoremeLucas');
/* game192 : l arbre de Calkin-Wilf (idee : codex Grok Bot) */
THEMES.maths.push('calkinWilf');
/* game193 : Hanoi et Gray (idee : codex Grok Bot) */
THEMES.maths.push('toursHanoi');
/* game194 : regarder et dire (idee : codex Grok Bot) */
THEMES.maths.push('regarderDire');
/* game195 : derangements (idee : codex Grok Bot) */
THEMES.maths.push('derangements');
/* game196 : nombres harmoniques (idee : codex Grok Bot) */
THEMES.maths.push('nombresHarmoniques');
/* game197 : Collatz (idee : codex Grok Bot) */
THEMES.maths.push('suiteCollatz');
/* game198 : Kaprekar (idee : codex Grok Bot) */
THEMES.maths.push('routineKaprekar');
/* game199 : Stirling et Bell (idee : codex Grok Bot) */
THEMES.maths.push('stirlingBell');
/* game200 : Motzkin (idee : codex Grok Bot) */
THEMES.maths.push('motzkinChemins');
/* game201 : Pisano (idee : codex Grok Bot) */
THEMES.maths.push('periodePisano');
/* game202 : indicatrice d Euler (idee : codex Grok Bot) */
THEMES.maths.push('indicatriceEuler');
/* game203 : Goldbach (idee : codex Grok Bot) */
THEMES.maths.push('goldbachPaires');
/* game204 : Frobenius (idee : codex Grok Bot) */
THEMES.maths.push('frobeniusPieces');
/* game205 : Schroder (idee : codex Grok Bot) */
THEMES.maths.push('schroderChemins');
/* game206 : Narayana (idee : codex Grok Bot) */
THEMES.maths.push('triangleNarayana');
/* game207 : Recaman (idee : codex Grok Bot) */
THEMES.maths.push('suiteRecaman');
/* game208 : Kolakoski (idee : codex Grok Bot) */
THEMES.maths.push('suiteKolakoski');
/* game209 : Perrin (idee : codex Grok Bot) */
THEMES.maths.push('suitePerrin');
/* game210 : Thue-Morse (idee : codex Grok Bot) */
THEMES.maths.push('thueMorse');
/* game211 : Padovan (idee : codex Grok Bot) */
THEMES.maths.push('suitePadovan');
/* game212 : fourmi de Langton (idee : codex Grok Bot) */
THEMES.maths.push('fourmiLangton');
/* game213 : le code genetique rejoint la biologie (idee : codex Grok Bot 19) */
THEMES.biologie.push('codeGenetique');
/* game214 : le titrage rejoint la chimie (idee : codex Grok Bot 19) */
THEMES.chimie.push('titrageAcideFaible');
/* game215 : VSEPR (idee : codex Grok Bot 19) */
THEMES.chimie.push('geometrieVSEPR');
/* game216 : pile Daniell (idee : codex Grok Bot 19) */
THEMES.chimie.push('pileDaniell');
/* game217 : la gamme temperee rejoint les ondes et le son (idee : codex Grok Bot 20) */
THEMES.ondes.push('gammeTemperee');
/* game218 : un groupe neuf, information et langage (idee : codex Grok Bot 20) */
THEMES.information = ['entropieShannon'];
/* game220 : la loi de Zipf rejoint information et langage */
THEMES.information.push('loiZipf');
/* game219 : un groupe neuf, la Terre (idee : codex Grok Bot 20) */
THEMES.terre = ['atmosphereStandard'];
/* game221 : Gutenberg-Richter rejoint la Terre */
THEMES.terre.push('gutenbergRichter');
/* game222 : Arrhenius rejoint la chimie (idee : codex Grok Bot 19) */
THEMES.chimie.push('arrhenius');
/* game223 : la maree rejoint la Terre (idee : codex 21, sous-agent Claude) */
THEMES.terre.push('mareeVivesEaux');
/* correctif 07/11 : physique est le groupe PAR DEFAUT de groupeDe et THEMES.physique n existait pas : chaque push ci-dessous faisait
 *   planter le CHARGEMENT du module (onglet TAM casse en prod depuis game224). La liste ne sert qu a nommer les systemes qui y tombent. */
THEMES.physique = [];
/* game224 : l energie de liaison rejoint la physique (idee : codex 21, sous-agent Claude) */
THEMES.physique.push('energieLiaison');
/* game225 : la courbe de Keeling rejoint la Terre (idee : codex 22, sous-agent Claude) */
THEMES.terre.push('courbeKeeling');
/* game275 : la variation du compas de Halley rejoint la Terre (idee : codex 30, sous-agent Claude) */
THEMES.terre.push('variationsHalley');
/* game277 : les temps des seismes d Oldham rejoignent la Terre (idee : codex 30, sous-agent Claude) */
THEMES.terre.push('tempsOldham');
/* game226 : un groupe neuf, l humanite (idee : codex 22, sous-agent Claude) */
THEMES.humanite = ['populationMonde'];
/* game227 : l electronegativite rejoint la chimie (idee : codex 22, sous-agent Claude) */
THEMES.chimie.push('electronegativite');
/* game228 : Hodgkin-Huxley rejoint la biologie (idee : codex Grok Bot 19) */
THEMES.biologie.push('hodgkinHuxley');
/* game229 : la loi de Kleiber rejoint la biologie (idee : codex Grok Bot 19) */
THEMES.biologie.push('loiKleiber');
/* game230 : l effet photoelectrique rejoint la physique (idee : codex Grok Bot 20) */
THEMES.physique.push('effetPhotoelectrique');
/* game231 : six demi-vies publiees rejoignent la physique (idee : codex Grok Bot 20) */
THEMES.physique.push('demiViesNPL');
/* game232 : le cholera de John Snow rejoint l humanite (idee : codex 23, sous-agent Claude) */
THEMES.humanite.push('choleraSnow');
/* game233 : les raies de Balmer rejoignent la physique (idee : codex 23, sous-agent Claude) */
THEMES.physique.push('raiesBalmer');
/* game234 : la loi de Boyle rejoint la chimie (idee : codex 23, sous-agent Claude) */
THEMES.chimie.push('loiBoyle');
/* game235 : la loi d Ohm rejoint la physique (idee : codex 23, sous-agent Claude) */
THEMES.physique.push('loiOhm');
/* game236 : la relation especes-aire rejoint la biologie (idee : codex 23, sous-agent Claude) */
THEMES.biologie.push('especesAire');
/* game237 : Michaelis et Menten rejoignent la chimie (idee : codex 23, sous-agent Claude) */
THEMES.chimie.push('michaelisMenten');
/* game238 : Geiger et Marsden rejoignent la physique (idee : codex 24, sous-agent Claude) */
THEMES.physique.push('diffusionAlpha');
/* game239 : l argon de Rayleigh et Ramsay rejoint la chimie (idee : codex 24, sous-agent Claude) */
THEMES.chimie.push('argonRayleigh');
/* game240 : la carte de Sturtevant rejoint la biologie (idee : codex 24, sous-agent Claude) */
THEMES.biologie.push('carteSturtevant');
/* game241 : la courbe de l oubli rejoint l humanite (idee : codex 24, sous-agent Claude) ; game297 : elle passe dans Mind & brain (THEMES.cerveauHumain) */
/* game242 : Semmelweis rejoint l humanite (idee : codex 25, sous-agent Claude) */
THEMES.humanite.push('fievreSemmelweis');
/* game243 : Cavendish rejoint la Terre (idee : codex 25, sous-agent Claude) */
THEMES.terre.push('densiteCavendish');
/* game244 : Joule rejoint la physique (idee : codex 25, sous-agent Claude) */
THEMES.physique.push('equivalentJoule');
/* game245 : l eclipse de 1919 rejoint la relativite (idee : codex 25, sous-agent Claude) */
THEMES.trousNoirs.push('eclipseEddington');
/* game287 : Michelson et Morley rejoignent la relativite (idee : codex 31, sous-agent Claude) */
THEMES.trousNoirs.push('etherMichelson');
/* game246 : le cycle du lynx rejoint la biologie (idee : codex 25, sous-agent Claude) */
THEMES.biologie.push('lynxHudson');
/* game247 : les gouttes de Millikan rejoignent les champs et atomes (idee : codex 25, sous-agent Claude) */
THEMES.champs.push('gouttesMillikan');
/* game248 : la table de Graunt rejoint l humanite (idee : codex 26, sous-agent Claude) */
THEMES.humanite.push('vieGraunt');
/* game249 : la loi de Hubble rejoint les astres (idee : codex 26, sous-agent Claude) */
THEMES.astres.push('loiHubble1929');
/* game250 : Moseley rejoint les champs et atomes (idee : codex 26, sous-agent Claude) */
THEMES.champs.push('loiMoseley');
/* game283 : les rayons cathodiques de Thomson rejoignent les champs et les atomes (idee : codex 31, sous-agent Claude) */
THEMES.champs.push('rayonsThomson');
/* game286 : l emanation de Rutherford rejoint les champs et les atomes (idee : codex 31, sous-agent Claude) */
THEMES.champs.push('emanationRutherford');
/* game251 : Michelson rejoint les ondes et la lumiere (idee : codex 26, sous-agent Claude) */
THEMES.ondes.push('lumiereMichelson');
/* game252 : la regression de Galton rejoint les maths (idee : codex 26, sous-agent Claude) */
THEMES.maths.push('regressionGalton');
/* game253 : l aberration de Bradley rejoint les astres (idee : codex 27, sous-agent Claude) */
THEMES.astres.push('aberrationBradley');
/* game255 : Gause rejoint la biologie (idee : codex 27, sous-agent Claude) */
THEMES.biologie.push('exclusionGause');
/* game282 : les comptes de Mendel rejoignent la biologie (idee : codex 31, sous-agent Claude) */
THEMES.biologie.push('poisMendel');
/* game285 : le mais de Darwin rejoint la biologie (idee : codex 31, sous-agent Claude) */
THEMES.biologie.push('maisDarwin');
/* game256 : Nightingale rejoint l humanite (idee : codex 27, sous-agent Claude) */
THEMES.humanite.push('mortaliteNightingale');
/* game257 : Faraday rejoint la chimie (idee : codex 27, sous-agent Claude) */
THEMES.chimie.push('equivalentsFaraday');
/* game258 : Petit et Dulong rejoignent la chimie (idee : codex 28, sous-agent Claude) */
THEMES.chimie.push('chaleursPetitDulong');
/* game259 : Omori rejoint la Terre (idee : codex 28, sous-agent Claude) */
THEMES.terre.push('repliquesOmori');
/* game260 : Halley rejoint l humanite (idee : codex 28, sous-agent Claude) */
THEMES.humanite.push('survieHalley');
/* game261 : Howard rejoint la Terre (idee : codex 28, sous-agent Claude) */
THEMES.terre.push('chaleurLondres');
/* game262 : Mendenhall rejoint l information (idee : codex 28, sous-agent Claude) */
THEMES.information.push('motsMendenhall');
/* game263 : Bessel rejoint les astres (idee : codex 28, sous-agent Claude) */
THEMES.astres.push('parallaxeBessel');
/* game284 : l echelle de Pogson rejoint les astres (idee : codex 31, sous-agent Claude) */
THEMES.astres.push('magnitudesPogson');
/* game290 : les jauges de Herschel rejoignent les astres (idee : codex 31, sous-agent Claude) */
THEMES.astres.push('jaugesHerschel');
/* game292 : le pendule de Kater rejoint la Terre (idee : codex 31, sous-agent Claude) */
THEMES.terre.push('penduleKater');
/* game297 (Phil : « branche le humain brain dans TAM ») : un groupe neuf, l esprit et le cerveau - l oubli (Ebbinghaus) y
 *   passe, le chat de Thorndike y entre (un animal : le nom du groupe le dit) */
THEMES.cerveauHumain = ['oubliEbbinghaus', 'essaisThorndike'];
/* game299 : le temps d une decision de Donders rejoint Mind & brain (idee : codex « cerveau humain », sous-agent Claude) */
THEMES.cerveauHumain.push('reactionDonders');
/* game300: Cattell's attention and distraction joins Mind & brain (idea: codex "human brain", Claude sub-agent) */
THEMES.cerveauHumain.push('attentionCattell');
/* game301: Peirce and Jastrow, small differences of pressure, join Mind & brain (idea: codex "human brain", Claude sub-agent) */
THEMES.cerveauHumain.push('pressurePeirceJastrow');
/* game302: Pavlov's extinction joins Mind & brain (an animal: the group name says so; idea: codex "human brain", Claude sub-agent) */
THEMES.cerveauHumain.push('extinctionPavlov');
/* game303: Konig and Brodhun, the smallest visible change of brightness, join Mind & brain (idea: codex "human brain", Claude sub-agent) */
THEMES.cerveauHumain.push('weberKonig');
/* game304: Cannon's excitement and blood sugar joins Mind & brain (cats and people; idea: codex "human brain", Claude sub-agent) */
THEMES.cerveauHumain.push('glycosuriaCannon');
/* game305: Boyd's brain weights join Mind & brain (idea: codex "human brain", Claude sub-agent) */
THEMES.cerveauHumain.push('brainBoyd');
/* game306: Keith Lucas's all-or-none muscle joins Mind & brain (a frog: the group name says animals; idea: codex "human brain", Claude sub-agent) */
THEMES.cerveauHumain.push('allOrNoneLucas');
/* game307: Herculano-Houzel's primate neuron counts join Mind & brain (idea: Phil, other forms of the brain) */
THEMES.cerveauHumain.push('neuronsHerculanoHouzel');
/* game308: The sizes of mapped brains join Mind & brain (idea: Phil, other forms of the brain) */
THEMES.cerveauHumain.push('connectomeSizes');
/* game309: Siegel's meta-analysis of the body in six emotions joins Mind & brain (idea: Phil, emotions as impulses from measured data) */
THEMES.cerveauHumain.push('emotionsSiegel');
/* game310: Nummenmaa's bodily maps of emotions join Mind & brain (idea: Phil, emotions as impulses from measured data) */
THEMES.cerveauHumain.push('bodyMapsNummenmaa');
/* game311: a wired human brain (ENIGMA HCP, all connections) facing emotion categories from four meta-analyses joins Mind & brain (idea: Phil) */
THEMES.cerveauHumain.push('emotionWiringHCP');
/* game264 : Nyquist rejoint l information (idee : codex 29, sous-agent Claude) */
THEMES.information.push('vitesseNyquist');
/* game278 : la fonte de MacKellar rejoint l information (idee : codex 30, sous-agent Claude) */
THEMES.information.push('fonteMacKellar');
/* game279 : les syllabes de Kaeding rejoignent l information (idee : codex 30, sous-agent Claude) */
THEMES.information.push('syllabesKaeding');
/* game265 : Young rejoint les ondes (idee : codex 29, sous-agent Claude) */
THEMES.ondes.push('ondulationsYoung');
/* game266 : le groupe Quantum avait seulement une regle d etiquette (science = Quantum mechanics) ; une mesure de 1899 n est pas de la mecanique
 *   quantique, donc liste propre plutot qu une etiquette fausse (idee : codex 29, sous-agent Claude) */
THEMES.quantique = ['picLummer'];
/* game288 : Rubens et Kurlbaum rejoignent le quantique (idee : codex 31, sous-agent Claude) */
THEMES.quantique.push('reststrahlenRubens');
/* game289 : les constantes de Planck rejoignent le quantique (idee : codex 31, sous-agent Claude) */
THEMES.quantique.push('constantesPlanck');
/* game267 : Coulomb rejoint l electricite (idee : codex 29, sous-agent Claude) */
THEMES.electricite.push('balanceCoulomb');
/* game268 : Joule 1841 rejoint l electricite (idee : codex 29, sous-agent Claude) */
THEMES.electricite.push('effetJoule');
THEMES.electricite.push('aimantGauss');
THEMES.electricite.push('unitesWeber');
/* game271 : le groupe Fractals ne se remplissait que par l etiquette (science = Fractals) ; Perrin relie lui-meme courbes sans tangente et
 *   colloides (preface), mais ses donnees sont des deplacements : liste propre, etiquette exacte (idee : codex 29, sous-agent Claude) */
THEMES.fractales = ['deplacementsPerrin'];
/* game276 : les spirales de Beal rejoignent les fractales (Fibonacci, nombre d or) (idee : codex 30, sous-agent Claude) */
THEMES.fractales.push('spiralesBeal');
/* game281 : la spirale logarithmique des coquilles de Moseley rejoint les fractales (idee : codex 30, sous-agent Claude) */
THEMES.fractales.push('spiraleMoseley');
/* game124 : les solides de Platon rejoignent les maths */
THEMES.maths.push('solidesPlatoniques');
/* game125 */
THEMES.maths.push('montyHall');
THEMES.ondes.push('lentilleMince');
/* game126 : les phases de la Lune rejoignent les astres (le pendule va en physique, par defaut) */
THEMES.astres.push('phasesLune');
/* game127 : la duree du jour rejoint les astres (la course roulante va en physique, par defaut) */
THEMES.astres.push('dureeJour');
/* game133 : le corps noir rejoint la lumiere et les ondes */
THEMES.ondes.push('corpsNoir');
/* game134 */
THEMES.ondes.push('reseauFentes');
/* game135 */
THEMES.ondes.push('refractionSnell');
/* game137 */
THEMES.ondes.push('anneauxNewton');
/* game149 : le halo de 22 degres (idee : codex Grok Bot) */
THEMES.ondes.push('haloGlace');
const groupeDe = (s) => THEMES.electricite.includes(s.id) ? 'electricite' : THEMES.ondes.includes(s.id) ? 'ondes' : THEMES.maths.includes(s.id) ? 'maths' : THEMES.chimie.includes(s.id) ? 'chimie' : THEMES.biologie.includes(s.id) ? 'biologie' : THEMES.theories.includes(s.id) ? 'theories' : THEMES.champs.includes(s.id) ? 'champs' : THEMES.questions.includes(s.id) ? 'questions' : THEMES.astres.includes(s.id) ? 'astres' : THEMES.trousNoirs.includes(s.id) ? 'trousNoirs'
  /* correctif 07/11 : information, terre et humanite avaient leur liste et leur entree de menu mais n etaient jamais testees ici (groupes vides) */
  : THEMES.information.includes(s.id) ? 'information' : THEMES.terre.includes(s.id) ? 'terre' : THEMES.cerveauHumain.includes(s.id) ? 'cerveauHumain' : THEMES.humanite.includes(s.id) ? 'humanite'
  : THEMES.quantique.includes(s.id) ? 'quantique' : THEMES.fractales.includes(s.id) ? 'fractales'
  : s.science === 'Quantum mechanics' ? 'quantique' : s.science === 'Fluid mechanics' ? 'fluides'
  : s.science === 'Fractals' || s.science === 'Golden ratio' ? 'fractales' : 'physique';
/* game79 : la formule de la personne (ou du cerveau) passe par la MEME scene : un « systeme » adapte, vue seule (pas de mint) */
const SYS_FORMULE = Object.freeze({ id: 'formule', nom: 'Your formula', science: 'Your mathematics', D: 3, phrase: 'Your own formula, drawn and solved numerically.',
  mod: {
    simuler: (_id, p = {}) => { const { a, b, c, d, ...spec } = p; return F.simulerFormule({ ...spec, vars: { ...(spec.vars || {}), ...(a !== undefined ? { a } : {}), ...(b !== undefined ? { b } : {}), ...(c !== undefined ? { c } : {}), ...(d !== undefined ? { d } : {}) } }); },
    reglagesPhysique: (_id, p = {}) => ['a', 'b', 'c', 'd'].map((k) => ({ chemin: 'params.' + k, nom: k, min: -10, max: 10, valeur: (p.vars && typeof p.vars[k] === 'number' ? p.vars[k] : (typeof p[k] === 'number' ? p[k] : 1)) })),
  } });
const GROUPES = [['attracteurs', 'Attractors'], ['questions', 'Big questions: space, quantum, Earth'], ['theories', 'Classic theories: magnets, life, chaos, heat, chance, waves'], ['biologie', 'Life sciences: DNA, RNA, genes, enzymes, neurons'], ['chimie', 'Chemistry: reactions, equilibrium, clocks, gases'], ['maths', 'Mathematics: chance, primes, random walks'], ['ondes', 'Waves, light & sound'], ['electricite', 'Electricity: charges, fields, circuits'], ['champs', 'Quantum fields, the vacuum, atoms & quarks'], ['formule', 'Your formula (write your own)'], ['astres', 'Stars & our space'], ['trousNoirs', 'Black holes, gravity waves & relativity'],
  ['physique', 'Physics: fusion, pendulum, fields, light'], ['quantique', 'Quantum'], ['fractales', 'Fractals & golden ratio'], ['fluides', 'Fluid mechanics'],
  /* game218 (Phil : « autre discipline ») */
  ['information', 'Information & language: entropy, codes, words'],
  /* game219 */
  ['terre', 'Earth: air, quakes'],
  /* game226 */
  ['humanite', 'Humanity: population'],
  /* game297 */
  ['cerveauHumain', 'Mind & brain: learning, memory, attention (people and animals)']];
/* game77 (chasse aux bugs : des curseurs « morts » — le module ramene la valeur en silence) : les bornes REELLES du moment.
 *   Hydrogene : l <= n-1 et |m| <= l. Tourbillons : G4 n existe qu avec 4 tourbillons. */
function reglagesVivants(s, params) {
  let R = s.mod.reglagesPhysique(s.id, params);
  if (s.id === 'hydrogene') R = R.map((r) => r.nom === 'l' ? { ...r, max: Math.max(0, params.n - 1) } : r.nom === 'm' ? { ...r, min: -params.l, max: params.l } : r);
  if (s.id === 'tourbillonsPonctuels' && params.nombre < 4) R = R.filter((r) => r.nom !== 'G4');
  return R;
}
/* un reglage ENTIER : bornes et valeur entieres, plage courte (n, l, m, k, nombre, graine…) */
const entierReglage = (r) => Number.isInteger(r.min) && Number.isInteger(r.max) && Number.isInteger(r.valeur) && r.max - r.min <= 1e6 && /^(n|l|m|k|nombre|graine|tours|maxIter|puissance|periodes)$/.test(r.nom);
/* game86 (Phil : « ajoute une echelle de grandeur pour se retrouver ») : l unite de l AXE x (colonne 0) de chaque systeme, pour une
 *   barre d echelle dans la scene. [unite, ce qu elle vaut] — la 2e partie seulement quand c est une DEFINITION (aucun chiffre de
 *   memoire). Absents : axes en echelle log (bigRip, etoilesHR, couplageCourant, evaporationTrouNoir) et formes sans unite (spirale,
 *   phyllotaxie, IFS, Bloch, Wigner, marche, rotor, calendrier, geometrie) : une barre y serait fausse. */
const ECHELLE_UNITE = {
  schwarzschild: ['M', 'M = GM/c2; the horizon is at 2 M'], kepler: ['units', 'G = M = 1'], troisCorps: ['units', 'G = mass = 1'],
  tokamak: ['main radii', 'the doughnut\'s main radius'], doublePendule: ['arm lengths'], lorentzRelativiste: ['units', 'c = charge = mass = B = 1'],
  hydrogene: ['Bohr radii'], mandelbrot: ['units', 'of the complex plane'], mandelbulb: ['units', 'of the fractal'],
  paquetOscillateur: ['units', 'hbar = mass = 1'], fentesYoung: ['mm'], boiteQuantique: ['box sides'], tourbillonsPonctuels: ['length units'],
  doubleGyre: ['box units'], karman: ['vortex spacings'], rayleighBenard: ['roll widths'],
  systemeSolaire: ['AU', 'Earth-Sun mean distance'], etoileS2: ['AU', 'Earth-Sun mean distance'], binaireTrouNoir: ['M', 'total mass, G = c = 1'],
  amasEtoiles: ['cluster units'], supernova: ['pc', 'parsecs'], supernovaHydro: ['pc', 'parsecs'], binaireFusion: ['s', 'time axis'],
  collisionGalaxies: ['closest approaches'], lumiereTrouNoir: ['M', 'M = GM/c2; the horizon is at 2 M'], kerr: ['M', 'M = GM/c2'],
  trouDeVer: ['throat radii'], trouDeVerSurface: ['throat radii'], pointsLagrange: ['star-planet distances'],
  pulsarHulseTaylor: ['light-seconds', 'the distance light travels in one second'], courbeRotation: ['kpc', 'kiloparsecs'],
  expansionUnivers: ['Gpc', 'billion parsecs'], cometeHalley: ['AU', 'Earth-Sun mean distance'], trappist1: ['AU', 'Earth-Sun mean distance'],
  disqueAccretion: ['M', 'M = GM/c2'], ondeGravitationnelle: ['ring radii'], courbureEspaceTemps: ['M', 'M = GM/c2'], chuteTrouNoir: ['M', 'M = GM/c2'],
  dilatationTemps: ['mass units'], effetTunnel: ['units', 'hbar = mass = 1'], superpositionQuantique: ['Bohr radii'], champDipolaire: ['Earth radii'],
  ondeLumiere: ['wavelengths'], diagrammeEspaceTemps: ['units', 'c = 1'], mouvementBrownien: ['length units'], tapisTalbot: ['box widths'],
  oscillateurEtats: ['units', 'hbar = mass = 1'], bellCHSH: ['rad'], niveauxLandau: ['units', 'hbar = mass = charge = 1'], sternGerlach: ['scaled units'],
  fusionTrousNoirs: ['s', 'time axis'], videQuantique: ['gap widths'], fauxVide: ['box sides'], centreTerre: ['Earth radii'], versMars: ['AU', 'Earth-Sun mean distance'],
  zeroAbsolu: ['trap lengths'], tailleUnivers: ['Gpc', 'billion parsecs'], nombrePi: ['units', 'unit square'], penduleFoucault: ['m'],
  mouvementTerre: ['AU', 'Earth-Sun mean distance'], tsunami: ['km'], tailleEtoiles: ['solar radii'], champLibre: ['lattice sites'],
  fluctuationsVide: ['lattice sites'], interactionChamps: ['1/m', 'inverse phi mass'], paireSchwinger: ['hbar/(mc)', 'electron Compton length / 2 pi'],
  effetUnruh: ['c2/a'], comptonKleinNishina: ['units', 'unit sphere'], atomes: ['Bohr radii'], quarks: ['fm', 'femtometres'],
  /* game88 : quadratures et champ sans dimension (hbar = 1) ; l emission spontanee a un axe x en DESACCORD de frequence (unite du pas) */
  videComprime: ['units', 'hbar = 1; the ordinary vacuum spread is 1/2'], casimirDynamique: ['units', 'hbar = 1; the ordinary vacuum spread is 1/2'],
  /* game93 */
  ising2D: ['lattice sites'], lotkaVolterra: ['density units'], epidemieSIR: ['population fraction'],
  lentilleGravitationnelle: ['Einstein radii'], kuramoto: ['units', 'unit circle'], gibbsFourier: ['rad'],
  /* game96 (logistique absente : son axe x est le taux r, sans unite) */
  rutherford: ['units', 'k = mass = 1'], chaleur: ['length units'], oscillateurForce: ['units', 'omega0 = 1'],
  brachistochrone: ['length units'], galton: ['peg spacings'],
  higgsVide: ['units', 'of the field'], emissionSpontanee: ['frequency units', 'detuning from the atom'],
};
/* game87 : c dans l ensemble de Mandelbrot ? (pas d echappement |z| > 2 en N pas — la meme regle que tam-sciences.js#mandelbrot) */
const dansMandelbrot = (cr, ci, N) => { let zr = 0, zi = 0; for (let k = 0; k < N; k++) { const t = zr * zr - zi * zi + cr; zi = 2 * zr * zi + ci; zr = t; if (zr * zr + zi * zi > 4) return false; } return true; };
/* un point de la FRONTIERE pres de (cx, cy) : dichotomie sur le segment qui va d un point dedans a un point dehors (0 est dans la
 *   cardioide principale ; un centre deja dedans part vers l exterieur, rayon 3). 60 coupes : precision bien sous la fenetre a zoom 10 000.
 *   N = 5000 pas : un point classe « dedans » peut s echapper plus tard — la frontiere trouvee est celle de l ensemble a 5000 pas. */
function bordMandelbrot(cx, cy) {
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  const N = 5000, dansBornes = (p) => p[0] >= -2 && p[0] <= 1 && p[1] >= -1.5 && p[1] <= 1.5; /* = les bornes du module (cx, cy) */
  const couper = (dedans, dehors) => { for (let k = 0; k < 60; k++) { const m = [(dedans[0] + dehors[0]) / 2, (dedans[1] + dehors[1]) / 2]; if (dansMandelbrot(m[0], m[1], N)) dedans = m; else dehors = m; } return dehors; };
  /* dehors : vers 0 (dans la cardioide) — le segment reste dans les bornes */
  if (!dansMandelbrot(cx, cy, N)) { const b = couper([0, 0], [cx, cy]); return dansBornes(b) ? b : null; }
  /* dedans (vu au banc : (-0.75, 0) partait jusqu a -2.000..., HORS bornes -> certificat refuse) : 16 directions, la frontiere la plus
   *   PROCHE — c est elle qui corrige ce cas. Le filtre dansBornes est une DEFENSE : un mutant qui le retire survit sur les 6 departs
   *   du banc (la plus proche y est toujours dans les bornes) ; il n est donc pas prouve, seulement inoffensif. */
  let mieux = null, dMin = Infinity;
  for (let k = 0; k < 16; k++) {
    const a = 2 * Math.PI * k / 16, loin = [cx + 3 * Math.cos(a), cy + 3 * Math.sin(a)];
    if (dansMandelbrot(loin[0], loin[1], N)) continue;
    const b = couper([cx, cy], loin), d = Math.hypot(b[0] - cx, b[1] - cy);
    if (dansBornes(b) && d < dMin) { dMin = d; mieux = b; }
  }
  return mieux; /* le dernier point DEHORS : il s echappe, et touche un point dedans a ~1e-17 pres */
}
/* game92 (audit des 87 systemes : curseur min / defaut / max, dessin standardise) : les curseurs qui ne changent PAS la forme, et
 *   pourquoi — 'echelle' : la physique est auto-similaire (la forme est la meme, seules l echelle et les valeurs changent) ;
 *   'checks' : le parametre ne regle que les mesures (lignes « Check »), pas les points dessines. Le banc verifie chaque entree. */
const CURSEURS_SANS_FORME = {
  /* (le banc a corrige la 1re table : disque, Casimir, piege, Unruh dessinent en unites NATURELLES — memes points, seules les mesures
   *   changent : 'checks', pas 'echelle') */
  'disqueAccretion.masse': 'checks', 'courbureEspaceTemps.M': 'echelle', 'videQuantique.d': 'checks', 'zeroAbsolu.frequence': 'checks',
  'effetUnruh.log10a': 'checks', 'binaireFusion.distance': 'echelle', 'fusionTrousNoirs.distance': 'echelle', 'evaporationTrouNoir.log10Masse': 'echelle',
  'higgsVide.lambda': 'echelle', 'emissionSpontanee.espacement': 'echelle', 'oscillateurEtats.omega': 'echelle', 'mouvementBrownien.D': 'echelle',
  'supernovaHydro.energie': 'echelle', 'supernovaHydro.densite': 'echelle', 'supernovaHydro.annees': 'echelle', 'tsunami.amplitude': 'echelle',
  'nombrePi.termesLeibniz': 'checks', 'nombrePi.termesMachin': 'checks', 'fluctuationsVide.echantillons': 'checks',
  'mouvementBrownien.particules': 'checks', 'mouvementBrownien.kT': 'checks',
};
/* une longueur « ronde » (1, 2 ou 5 x 10^k) au plus egale a x — la barre ; et son ecriture courte */
const longueurRonde = (x) => { if (!(x > 0) || !Number.isFinite(x)) return null; const p = 10 ** Math.floor(Math.log10(x)), f = x / p; return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p; };
const ecrireLongueur = (L) => (L >= 1e-3 && L < 1e6 ? String(Number(L.toPrecision(1))) : L.toExponential(0).replace('e+', 'e'));
/* les parametres des modules nommes en francais -> l ecran ; les symboles (L, M, omega, a...) restent des symboles */
const NOMS_PARAMS_SYS = { 'equationPell.radical': 'D (not a square ; a square is skipped to the next)', 'eulerSolides.solide': 'solid (0 prism, 1 antiprism, 2 cuboctahedron, 3 football, 4 rhombicuboctahedron, 5 snub dodecahedron)', 'feuerbach.taille': 'size of the grid the corners are drawn from', 'napoleon.taille': 'size of the grid the corners are drawn from', 'percolationLiens.cote': 'height n (the rectangle is n + 1 wide)', 'catalanDyck.demi': 'half-length n of the paths', 'ruineJoueur.gain': 'chance p of winning one bet', 'ruineJoueur.depart': 'starting fortune z', 'ruineJoueur.objectif': 'target a', 'papillonHofstadter.qmax': 'largest denominator q of the flux p/q', 'fermatSteiner.largeur': 'width L of the rectangle (height 1)', 'kapitza.depart': 'starting tilt from the upright (degrees)', 'penduleRessort.rapport': 'bounce / swing frequency ratio', 'perleCerceau.frottement': 'friction (damping gamma)', 'echelleGlisse.depart': 'starting angle from the wall (degrees)', 'chainette.rapport': 'chain length / span', 'lentilleMince.distance': 'object distance (in focal lengths)', 'tsunami.distance': 'distance to the shore (km)',
  'binaireFusion.distance': 'luminosity distance (Mpc)', 'fusionTrousNoirs.distance': 'luminosity distance (Mpc)',
  /* game133 */
  'corpsNoir.courbes': 'temperatures drawn', 'corpsNoir.rapport': 'hottest over coolest temperature',
  /* game134 (« espacement » existe deja : mode spacing, vide quantique) */
  'reseauFentes.espacement': 'slit spacing d / lambda' };
const nomParam = (sid, cle) => NOMS_PARAMS_SYS[sid + '.' + cle] || NOMS_PARAMS_EN[cle];
const NOMS_PARAMS_EN = { qmax: 'largest denominator q', betaGause: 'effect of aurelia on caudatum (beta)', anneeNightingale: 'year (1 from April 1854, 2 from April 1855)', volumeGazFaraday: 'gas from water (cubic inches)', decalagePoids: 'shift the weights by rows (0 = as printed)', horizonOmori: 'horizon (half days after the quake)', tauxHalley: 'interest rate for the annuity (%)', lissageHoward: 'smooth London over this many years', queueMendenhall: 'merge words of this many letters and more', poidsBessel: 'weight of the star b observations', niveauxNyquist: 'largest number of current values shown', minutesYoung: 'minutes light takes from the Sun (assumed)', exposantLummer: 'power of temperature the peak energy is divided by', exposantCoulomb: 'power of distance in the force law', exposantJouleQ: 'power of the current in the heat law', exposantReynolds: 'power of the diameter in the critical speed law', partDessous: 'share of the pressure below the filter counted', sigmaPerrin: 'spread of the bell curve (micron)', exposantGauss: 'power of the distance in the one-constant fit', partWeber: 'share of the charge that crosses the coil', exposantPoiseuille: 'power of the diameter in the fitted line', anneeHalley: 'year shown on the London line', vitesseOldham: 'speed of the straight path (km per second)', melangeUniforme: 'share of an even fount mixed in (0 as printed, 1 even)', zaehlstoffKaeding: 'corpus shown (0 all, 1 to 14 as in his table)', partCarreHagen: 'share of his square term kept (1 as printed)', raisonMoseley: 'ratio from one whorl to the next', rapportMendel: 'expected dominant to recessive ratio', facteurIThomson: 'factor on the bending I (1 as measured)', rapportPogson: 'light ratio from one magnitude to the next', gainDarwin: 'gain given to the self-fertilised plants (%)', demiVieRutherford: 'half-life of the drawn law (s)', vitesseEther: 'ether speed as a share of the orbital speed', loiRubens: 'law shown (0 Wien, 1 Thiesen, 2 Rayleigh, 3 Lummer-Jahnke, 4 Planck)', lambdaThetaPlanck: 'wavelength of the peak times temperature (cm degree)', champHerschel: 'field of view of the telescope (minutes of arc)', moyenneThorndike: 'moving average over this many trials', packWiring: 'pack (0 basic, 1 affect summaries, 2 social, 3 love, 4 empathy and compassion, 5 surprise and curiosity)', emotionWiring: 'emotion within the pack (0 the first)', travelWiring: 'impulses travel along the wiring (0 no, 1 yes)', networkWiring: 'network (0 wiring, structure; 1 talking together at rest, function)', compareWiring: 'second emotion of the same pack to compare (0 none, 1 the first)', resolutionWiring: 'resolution (0 82 regions, 1 414 parcels by network)', theoryWiring: 'order of activation (0 data only; THEORY 1 James-Lange, 2 Cannon-Bard, 3 Schachter-Singer, 4 constructionist)', guessNummenmaa: 'readers (0 measured hit rates, 1 blind guessers)', emotionSiegel: 'emotion category (0 anger, 1 disgust, 2 fear, 3 happy, 4 sad, 5 neutral)', spreadSiegel: 'units across the 95% interval (0 all at the mean, 1 spread)', organismeConnectome: 'organism shown (0 all, 1 worm, 2 half fly brain, 3 whole fly brain, 4 human count)', rongeurHerculano: 'rodent scaling line (0 hidden, 1 shown)', droiteLucas: 'straight line through the points (0 hidden, 1 shown)', sexeBoyd: 'sex shown (0 both, 1 men, 2 women)', groupeCannon: 'groups shown (0 all, 1 cats and controls, 2 people)', tableKonig: 'table shown (0 all, 1 670 K., 2 670 B., 3 605 K., 4 605 B.)', seriePavlov: 'series shown (0 all, 1 to 5 in the order printed: 2, 4, 8, 16, 2 minutes apart)', groupeJastrow: 'curve of Jastrow group (1 first, 2 after practice)', sujetCattell: 'observer shown (0 both, 1 B, 2 C)', rouleauDonders: 'roll shown (0 all, 1 XV, 2 XVI A, 3 XVI B with its single trials)', stationOteeKater: 'station left out of the line (0 none, 1 Unst ... 4 Clifton, 5 Arbury Hill ... 7 Shanklin Farm)', groupeBeal: 'cones shown (0 all, 1 to 7 Norway spruce trees, then pumilis, European larch, black spruce 1869 and 1870, American larch)', minutesLumiere: 'light time from the Sun (minutes)', penteTest: 'slope of the test line', correctionVide: 'result shown (0 in air, 1 in vacuum)', numerotation: 'numbering (0 Moseley, 1 without the empty place 43)', constanteTest: 'test constant K (km/s per Mpc)', raisonTest: 'share surviving each decade (test curve)', gouttesMoyennees: 'drops averaged (first n)', decalageAns: 'shift (years)', facteurNewton: 'bending, in units of the Newtonian value (2 = Einstein)', colonneVide: 'column (0 in air, 1 in vacuo)', filChoisi: 'average of (0 all, 1 first wire, 2 second wire)', anneeVue: 'year shown (1841 to 1848)', kTest: 'formula constant k', cTest: 'formula exponent c', distanceMax: 'longest map distance shown', signeCorrection: 'globe correction (+1 paper, -1 abstract, 0 none)', orArgent: 'foil (0 gold, 1 silver)', puissanceTest: 'power of sin(angle / 2) in the test law', Ktest: 'test constant K (mol/L)', axeLog: 'sugar axis (0 linear, 1 log as in 1913)', inclureIsolees: 'include far islands in the line (0 no, 1 yes)', zTest: 'exponent z of the test power law', bTest: 'rest of the circuit b (Zoll)', serie: 'measurement series (I to V)', lignesBoyle: 'readings used in the fit', nPlusHaut: 'highest level n used', septSemaines: 'which seven weeks (1 first, 2 next)', isotope: 'isotope (0 H-3 ... 5 Cs-137)', demiVies: 'half-lives shown for the chosen isotope', lambdaNm: 'wavelength of the light (nm)', metal: 'metal (0 Ag, 1 Cu, 2 Ir, 3 Ta)', exposantTest: 'exponent of the test line', courantHH: 'input current (microA/cm2)', grandeur: 'quantity (0 electronegativity, 1 ionization energy)', decennies: 'decades used for the fit', anDebut: 'first year', anFin: 'last year', reaction: 'reaction (0 D+D, 1 triple alpha, 2 C12+He4)', partS2: 'solar wave strength (1 = Providence)', celsius: 'temperature (deg C)', concH2: 'hydrogen and iodine at start (mol/L)', bValeur: 'slope b', seismes: 'quakes drawn', rangsZipf: 'words kept', altitudeKm: 'top of the climb (km)', lettres: 'letters drawn', divisions: 'equal steps per octave', cuivre: 'copper ions at start (mol/L)', zinc: 'zinc ions at start (mol/L)', kelvins: 'temperature (K)', molecule: 'molecule (0 CH4, 1 NH3, 2 H2O, 3 CO2, 4 BF3)', acide: 'acid concentration (mol/L)', base: 'base concentration (mol/L)', pasL: 'steps', rangP: 'terms', rangT: 'terms', perrinMax: 'up to n', rangK: 'terms', rangR: 'steps n', rangN: 'rows n', longueurS: 'size n', pieceMax: 'largest coin', pairMax: 'largest even number', jusquaN: 'up to n', moduleMax: 'largest modulus m', longueurM: 'path length n', elements: 'objects n', longueurK: 'digits per number', objets: 'objects n', rangs: 'terms', disques: 'disks n', niveaux: 'levels D', baseP: 'prime p (a non-prime goes to the next)', lignesL: 'rows', pasK: 'every k-th one leaves, k', rangB: 'up to B_n, n', limite: 'search up to', radical: 'D under the square root', croise: 'crossed hexagon (0 no, 1 yes)', sommetsK: 'points n of K_n', cotes: 'sides N', corde: 'slope of the chord through A (k / 7)', termes: 'terms n', angleA: 'angle A (degrees)', angleB: 'angle B (degrees)', etapes: 'steps n', oscillateur: 'oscillator (0 blinker, 1 pulsar, 2 pentadecathlon)', petitAxe: 'short half-axis b', lancer: 'start on the rim (degrees)', tir: 'shot direction (degrees)', rebonds: 'bounces', taille: 'size', sommets: 'corners k', rayon: 'radius', plis: 'folds n', entier: 'the number n', demi: 'half-length n', gain: 'chance of winning one bet', objectif: 'target', vignettes: 'different coupons n', annees: 'years', atomes: 'atoms', champ: 'field', cote: 'side', ordre: 'order n (largest denominator)', coups: 'kicks', coupure: 'cutoff', decalage: 'shift',
  densite: 'density', duree: 'duration', echantillons: 'samples', ellipticite: 'ellipticity', energie: 'energy', essais: 'trials', etoiles: 'stars',
  excentricite: 'eccentricity', frequence: 'frequency', graine: 'seed', grille: 'grid', groupe: 'group', hauteur: 'height', heures: 'hours',
  horloges: 'clocks', images: 'frames', inclinaison: 'inclination', inclinaison1: 'inclination 1', inclinaison2: 'inclination 2', jours: 'days',
  jusqua: 'up to', largeur: 'width', longueur: 'length', longueursOnde: 'wavelengths', masse: 'mass', masseEjecta: 'ejecta mass',
  masseTrouNoir: 'black-hole mass', modes: 'modes', monde: 'world', nombre: 'count', orbite: 'orbit', paires: 'pairs', particules: 'particles',
  pas: 'steps', periode: 'period', periodes: 'periods', poussee: 'thrust', premiere: 'first', profondeur: 'depth', puissance: 'power',
  rapport: 'ratio', courbes: 'curves', fentes: 'slits', demiVie: 'half-life T (steps)', couplage: 'spring coupling k', lacherHaut: 'highest release angle (degrees)', maillons: 'links', omegaMax: 'fastest spin (units of sqrt(g / R))', milieu: 'middle moment of inertia I2 (I1 = 1, I3 = 3)', ecartPuissance: 'wobble eps = 10^-p, p', rotation: 'spin omega3', angleAxe: 'starting tilt of the axis (degrees)', rebond: 'starting stretch of the spring', premier: 'radius of the first circle (the big one has radius 1)', secousse: 'shake amplitude A (pendulum lengths)', vitesses: 'spins tried', depart: 'start of the second pendulum (x2 / x1)', lambda: 'wavelength (nm)', rayonLentille: 'lens radius of curvature R (m)', ecartAir: 'air gap at the centre (nm)', rapportMasses: 'mass ratio', temps: 'time', tempsMa: 'time (Myr)', termesLeibniz: 'Leibniz terms', termesMachin: 'Machin terms',
  tours: 'turns', traversees: 'crossings', uniforme: 'uniform', vitesse: 'speed', viriel: 'virial ratio', ageUnivers: 'age of the universe',
  aCible: 'target orbit (AU)', finGa: 'end (Gyr)', log10Masse: 'log10 mass', Mbulbe: 'bulge mass', Mdisque: 'disk mass', cmb: 'CMB frame',
  fDepart: 'start frequency', vJumeau: 'twin speed', perturbation: 'perturbation', amplitude: 'amplitude', distance: 'distance', zoom: 'zoom',
  /* game94 (panneau de la scene : « balayages = 200 ») — les symboles physiques (theta, omega, lambda, gamma, sigma, beta, kT, hbar...) restent */
  balayages: 'sweeps', espacement: 'mode spacing', fenetre: 'window', ecart: 'offset', taux: 'rate', melange: 'blend', fraction: 'fraction',
  masses: 'masses', maxIter: 'max iterations', hPlus: 'h plus', hCroix: 'h cross', tauMax: 'max proper time', plateau: 'shelf',
  /* game105 (sonde : tous les noms de curseurs contre cette table — 3 mots francais a l ecran depuis game96) */
  billes: 'balls', rangees: 'rows of pegs', rayons: 'paths', penchant: 'tilt (chance to bounce right)',
  /* game106 */
  attirant: 'opposite charges (1 = attract)', saturation: 'prey crowding (1 / room for prey)', perteImmunite: 'immunity fading (per infectious period)', perte: 'heat loss to the air (per time unit)',
  /* game111 */
  bases: 'bases in the sequence', transcription: 'transcription rate k (mRNA made per mRNA lifetime)', traduction: 'translation rate kp (proteins per mRNA per lifetime)', degradation: 'protein decay rate gp (per mRNA lifetime)',
  /* game112 */
  individus: 'individuals per population (N)', partDepart: 'starting share of the variant (p0)', generations: 'generations', populations: 'populations',
  substrat: 'substrate at the start (S0)', enzyme: 'enzyme (E0)', dissociation: 'complex falling apart (k-1)', catalyse: 'turnover rate (kcat)',
  /* game113 */
  molecules: 'molecules', k1: 'first rate k1 (A to B)', k2: 'second rate k2 (B to C)', kf: 'forward rate kf (A to B)', kb: 'backward rate kb (B to A)',
  A: 'feed A', ecartSeuil: 'distance to the clock threshold (B - 1 - A^2)',
  /* game114 */
  descendants: 'offspring', recombinaison: 'recombination rate r (1/2 = independent genes)', courant: 'input current I (threshold 1)', tau: 'time constant tau' /* game125 : partage par le neurone (membrane) et le circuit RC (R C) — game122 l avait redefini plus bas en « ... = R C », faux pour le neurone */, refractaire: 'refractory time',
  /* game115 */
  marcheurs: 'walkers', aiguilles: 'needles', personnes: 'people per group', groupes: 'groups',
  /* game118 */
  partA: 'share of AA parents (p)',
  /* game120 */
  indice: 'refractive index n', cellules: 'grid cells', charge: 'second charge q2 (the first is +1)', lignes: 'rows', chiffres: 'mass ratio 100^k (k)', mode: 'mode excited (j)', angles: 'throws drawn', chaude: 'hot temperature Th (cold = 1)', liberte: 'degrees of freedom f of the gas', detente: 'expansion ratio r', portes: 'doors', parties: 'games played', lacher: 'release angle theta0 (degrees)', latitude: 'latitude (degrees)', pente: 'slope angle theta (degrees)', frottement: 'friction coefficient mu', anglePhase: 'phase angle (degrees ; 180 = new Moon)', solide: 'solid (0 tetra, 1 cube, 2 octa, 3 dodeca, 4 icosa)', pince: 'where it is plucked (a, from one end)', mach: 'source speed (Mach number M = v / c)' };
const nb4 = (x) => (typeof x === 'number' && Number.isFinite(x) ? x === 0 ? '0' : (Math.abs(x) >= 1e-3 && Math.abs(x) < 1e5 ? String(Math.round(x * 1e4) / 1e4) : x.toExponential(2)) : String(x));
/* un invariant, en une ligne : derive (debut -> fin), ou mesure contre la theorie */
/* les unites des modules sont ecrites en francais (convention du depot) : l ecran les dit en anglais */
const UNITES_EN = { 'par radian d orbite': 'per radian of orbit', 'par unite de temps': 'per time unit', 'par iteration': 'per step', 'par periode': 'per period' };
const uniteEn = (u) => (u ? UNITES_EN[u] || String(u).replace(/^par /, 'per ') : '');
/* les invariants qui ne disent rien a l ecran (un compteur de temps, pas une loi conservee) */
const INVARIANT_MUET = new Set(['tempsFinal']);
/* les cles des invariants des modules (francais) -> ce que lit le visiteur */
const CLES_EN = { valeur: 'value', erreur: 'error', termes: 'terms', NfoisErreur: 'terms x error', estimation: 'estimate', points: 'points',
  ecartTypeAttendu: 'expected spread (1 sigma)', termesPour1e12: 'terms for 1e-12', mesure: 'measured', formule: 'formula', theorie: 'theory',
  reference: 'reference', debut: 'start', fin: 'end', min: 'min', max: 'max', derive: 'drift', pi: 'true pi', rayon: 'radius', periode: 'period',
  duree: 'duration', age: 'age', masse: 'mass', energie: 'energy', vitesse: 'speed', distance: 'distance', temperature: 'temperature', nombre: 'count' };
/* game94 (vu en prod : « Check: sinh2surTc », « aimantationFinale ») : le NOM de chaque mesure, en anglais — rempli a l import depuis
 *   tam-cles-en.js (326 noms, 309 cles ; couverture verifiee au banc) */
const NOMS_MESURES = {};
function ligneInvariant(k0, v) {
  const k = NOMS_MESURES[k0] || k0;
  if (v && typeof v === 'object') {
    /* game103 (sonde aux bouts des curseurs : 12 lignes « measured NaN vs formula 5.177 » — se lisaient comme une panne) : une mesure
     *   qui n existe pas dans CE run (0 orbite complete, capture, pas de passage) le dit, avec la formule a cote */
    if ('mesure' in v && !(typeof v.mesure === 'number' && Number.isFinite(v.mesure))) {
      /* game109 : un module peut dire SA raison (`absente`) — « not defined » etait faux pour une course trop courte */
      const pourquoi = typeof v.absente === 'string' ? v.absente : v.orbites === 0 ? 'no full orbit in this run' : typeof v.passages === 'number' && v.passages < 2 ? 'no full oscillation in this run' : 'not defined with these settings';
      const f = typeof v.exacte === 'number' && Number.isFinite(v.exacte) ? v.exacte : v.formule;
      return k + ': not measured (' + pourquoi + ')' + (typeof f === 'number' && Number.isFinite(f) ? ', formula ' + nb4(f) : '');
    }
    /* game103 (meme sonde : Ising a T = 3.5 affichait « measured 0.0439 vs formula 0 (statistical, ± 0.0028) » = 15.6 sigma) : le MODULE
     *   dit lui-meme `comparable: false` hors du domaine de sa formule (taille finie au-dessus de Tc, pres de Kc, impulsion trop large) */
    /* game104 (sonde aux bouts : effet tunnel, barriere de largeur 4, « measured 0.0089 vs formula 0.0069 » = 29 %) : un paquet n a pas UNE
     *   energie ; le module calcule T(E) moyenne sur son propre spectre (a <= 1.8 % de la mesure sur tous les bouts) — c est elle la reference */
    if (typeof v.paquet === 'number' && Number.isFinite(v.paquet) && 'mesure' in v) return k + ': measured ' + nb4(v.mesure) + ' vs ' + nb4(v.paquet) + ' averaged over the packet\'s energies (single-energy formula ' + nb4(v.formule) + ')';
    if (v.comparable === false && 'mesure' in v && 'formule' in v) return k + ': measured ' + nb4(v.mesure) + ' — not compared at these settings ('
      + (typeof v.pasCompare === 'string' ? v.pasCompare + '; formula ' + nb4(v.formule) : 'the formula, ' + nb4(v.formule) + ', is outside its range here') + ')';
    /* « formule » = la formule approchee du module (ex. precession en champ faible), « theorie » = la valeur exacte */
    /* game100 : la precession de Schwarzschild porte aussi la valeur EXACTE (integrale elliptique) — c est elle qu on compare */
    if (k0 === 'precession' && typeof v.exacte === 'number' && 'mesure' in v) return k + ': measured ' + nb4(v.mesure) + ' vs exact GR ' + nb4(v.exacte) + ' (weak-field formula ' + nb4(v.formule) + ')';
    /* game100 (sonde : « measured 21.68 vs formula 22.26 » se lisait comme un echec) : une formule APPROCHEE dit pourquoi, une mesure
     *   STATISTIQUE dit son sigma */
    if ('mesure' in v && 'formule' in v) return k + ': measured ' + nb4(v.mesure) + ' vs formula ' + nb4(v.formule)
      + (k0 === 'precession' ? ' (weak-field formula: it underestimates close to the black hole)' : '')
      + (typeof v.approchee === 'string' ? ' (approximate formula: ' + v.approchee + ')' : '')
      + (typeof v.sigma === 'number' && Number.isFinite(v.sigma) ? ' (statistical, ± ' + nb4(v.sigma) + ')' : '');
    if ('mesure' in v && 'theorie' in v) return k + ': measured ' + nb4(v.mesure) + ' vs theory ' + nb4(v.theorie);
    if ('derive' in v) {
      /* game77 (chasse aux bugs : « gamma: drift 1.6 » se lisait comme un test rate) : une derive RELATIVE au-dela de 1e-3 n est pas une
       *   loi conservee — on dit la plage ; une petite derive est dite relative a sa valeur de depart (ou absolue si le depart vaut 0) */
      const ref = Math.abs(v.debut ?? 0), rel = ref > 1e-12 ? Math.abs(v.derive) / ref : null;
      if ((rel !== null && rel > 1e-3) || (rel === null && Math.abs(v.derive) > 1e-6)) return k + ': ' + ('min' in v && 'max' in v ? 'from ' + nb4(v.min) + ' to ' + nb4(v.max) : 'changes by ' + nb4(v.derive));
      return k + ': conserved — drift ' + nb4(rel !== null ? rel : Math.abs(v.derive)) + (rel !== null ? ' relative' : ' absolute');
    }
    /* game82 (Phil, « Three roads to pi » : « valeur 4, erreur 0.8584, NfoisErreur ») : les 3 premieres cles brutes, en francais,
     *   coupaient « termes » (le 4 venait d UN terme) ; jusqu a 6 valeurs, nommees en anglais, et la vraie valeur quand il y en a une */
    const nums = Object.entries(v).filter(([, x]) => typeof x === 'number' && Number.isFinite(x));
    if (!nums.length) return k + ': ' + (Object.values(v).some(Array.isArray) ? 'data series (in the CSV export and the curves)' : 'no number');
    return k + ': ' + nums.slice(0, 6).map(([a, x]) => (CLES_EN[a] || a) + ' ' + (Math.abs(x) >= 1 && Math.abs(x) < 1e6 && /^(pi|e|phi|valeur|estimation|reference)$/.test(a) ? String(x) : nb4(x))).join(', ');
  }
  return k + ': ' + nb4(v);
}
/* les cles deja traduites ici gardent leur libelle ; tam-cles-en.js ne fait qu ajouter celles qui manquaient */
for (const [a, b] of Object.entries(CLESEN.CLES_EN_MODULES)) if (!CLES_EN[a]) CLES_EN[a] = b;
Object.assign(NOMS_MESURES, CLESEN.NOMS_MESURES_EN);

const CSS = `
#v-tam{--tam-fond:#0b0d17;--tam-carte:rgba(255,255,255,.04);--tam-bord:rgba(255,255,255,.12);--tam-txt:#e8ecf5;--tam-doux:#9aa3b8;--tam-acc:#7fd1ff}
#v-tam .tamCarte{background:var(--tam-carte);border:1px solid var(--tam-bord);border-radius:14px;padding:14px;margin:0 0 14px}
#v-tam .tamReglagesHaut{border-top:1px solid var(--tam-bord);margin-top:10px;padding-top:8px}
#v-tam .tamReglagesHaut>summary{cursor:pointer;font-weight:600;padding:4px 0}
#v-tam h2{font-size:1.15rem;margin:0 0 4px}#v-tam h3{font-size:1rem;margin:0 0 8px}
#v-tam .tamDoux{color:var(--tam-doux);font-size:.86rem;margin:4px 0}
#v-tam .tamRang{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0}
#v-tam button,#v-tam select{min-height:44px;min-width:44px;border-radius:10px;border:1px solid var(--tam-bord);background:rgba(255,255,255,.06);color:var(--tam-txt);padding:0 12px;font:inherit;font-size:.92rem;max-width:100%}
/* game77 (Phil, capture : le menu deroulant est transparent, on voit le graphe a travers) : menus et options sur fond OPAQUE */
#v-tam select{background:#161a2b;color:var(--tam-txt);color-scheme:dark}
/* game79 : les champs (recherche de block, formules, intervalles) en sombre, lisibles */
#v-tam input[type="search"],#v-tam input[type="text"],#v-tam input[type="number"]{min-height:44px;border-radius:10px;border:1px solid var(--tam-bord);background:#161a2b;color:var(--tam-txt);padding:0 10px;font:inherit;font-size:.92rem;color-scheme:dark;max-width:100%}
#v-tam input[type="text"]{font-family:ui-monospace,Consolas,monospace}
#v-tam select option,#v-tam select optgroup{background:#161a2b;color:var(--tam-txt)}
#v-tam button[aria-pressed="true"]{background:rgba(127,209,255,.18);border-color:var(--tam-acc)}
#v-tam .tamPrim{background:var(--tam-acc);color:#06121d;border-color:var(--tam-acc);font-weight:600}
#v-tam .tamScene{position:relative;width:100%;aspect-ratio:1/1;max-height:62vh;border-radius:12px;overflow:hidden;background:var(--tam-fond);touch-action:none}
#v-tam .tamScene canvas{width:100%;height:100%;display:block}
#v-tam .tamInfo{position:absolute;left:8px;top:6px;font-size:.78rem;color:var(--tam-doux);pointer-events:none}
#v-tam .tamVars{position:absolute;left:8px;bottom:6px;right:8px;display:flex;flex-wrap:wrap;gap:2px 10px;max-height:40%;overflow:hidden;font:11px/1.35 ui-monospace,Consolas,monospace;color:#cfd6ff;opacity:.85;pointer-events:none;text-shadow:0 0 4px #0b0d17}
#v-tam .tamVars b{width:100%;font-weight:600;color:#fff;pointer-events:auto;cursor:pointer}
/* game116+ (Phil : « on comprend mal les exemples » ; vu a l ecran : ce bloc couvrait jusqu a 40 % du bas des graphiques) : replie par
   defaut sur son titre ; tout son contenu est deja sur les curseurs et dans les verifications sous la scene */
#v-tam .tamVars.replie > :not(b){display:none}
#v-tam .tamPayListe{margin:.3rem 0;padding-left:1.1rem;font-size:.82rem;color:var(--tam-doux);max-height:220px;overflow:auto}
#v-tam .tamBulle{position:absolute;z-index:3;pointer-events:none;max-width:260px;background:rgba(11,13,23,.94);border:1px solid var(--tam-acc);border-radius:10px;padding:6px 9px;font:11px/1.45 ui-monospace,Consolas,monospace;color:#e8ecf5;box-shadow:0 0 14px rgba(127,209,255,.35)}
#v-tam .tamBulle b{color:#fff}
#v-tam .tamLegende{margin-top:8px;border:1px solid var(--tam-bord);border-radius:10px;padding:6px 10px;background:rgba(127,209,255,.05)}
#v-tam .tamLegende summary{cursor:pointer;font-weight:600}
#v-tam .tamPastille{display:inline-block;width:10px;height:10px;border-radius:50%;vertical-align:middle}
#v-tam .tamVars .tamMesure{width:100%;color:#ffe9a8}
#v-tam .tamQui{margin:.2rem 0 .5rem;font-size:.9rem}
#v-tam .tamQui .tamHumeur{padding:0 .35rem;border-radius:6px;color:#fff;text-shadow:0 0 6px currentColor}
#v-tam .tamQui[data-phase="CALME"] .tamHumeur{background:#1d3b5a;box-shadow:0 0 10px #4aa3ff}
#v-tam .tamQui[data-phase="CURIEUX"] .tamHumeur{background:#3b2f5a;box-shadow:0 0 10px #b48cff}
#v-tam .tamQui[data-phase="EXCITE"] .tamHumeur{background:#5a3a12;box-shadow:0 0 12px #ffb23f}
#v-tam .tamQui[data-phase="INQUIET"] .tamHumeur{background:#5a1d2a;box-shadow:0 0 12px #ff5c7a}
#v-tam .tamQui[data-phase="EVEILLE"] .tamHumeur{background:#1d4a3a;box-shadow:0 0 10px #4fe0a8}
#v-tam .tamQui[data-phase="DORMANT"] .tamHumeur,#v-tam .tamQui[data-phase="MORT"] .tamHumeur,#v-tam .tamQui[data-phase="NON_LU"] .tamHumeur{background:#2a2d3a;box-shadow:none}
#v-tam .tamPuces{display:flex;flex-wrap:wrap;gap:6px}
#v-tam .tamPuce{display:inline-flex;align-items:center;gap:6px}
#v-tam .tamPuce i{width:12px;height:12px;border-radius:50%;display:inline-block}
#v-tam .tamPuce[aria-pressed="false"]{opacity:.45}
#v-tam input[type=range]{width:100%;min-height:44px}
#v-tam .tamSeries{width:100%;height:120px;display:block;background:var(--tam-fond);border-radius:10px}
#v-tam .tamSeries.tamSplit{height:auto;min-height:120px}
#v-tam .tamGrille{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:6px;margin-top:8px}
#v-tam .tamGrille figure{margin:0;background:var(--tam-fond);border-radius:8px;overflow:hidden}
#v-tam .tamGrille canvas{width:100%;aspect-ratio:1/1;display:block}
#v-tam .tamGrille figcaption{font-size:.72rem;color:var(--tam-doux);padding:2px 6px}
#v-tam dl{display:grid;grid-template-columns:minmax(90px,34%) 1fr;gap:6px 10px;margin:0}#v-tam dt{color:var(--tam-doux);font-size:.85rem}#v-tam dd{margin:0;font-size:.9rem;overflow-wrap:anywhere}
#v-tam .tamGal{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
#v-tam .tamOeuvre canvas{width:100%;aspect-ratio:1/1;background:var(--tam-fond);border-radius:8px;display:block}
#v-tam .tamBadge{font-weight:600}#v-tam .tamBadge.ok{color:#7ee2a8}#v-tam .tamBadge.ko{color:#ff8a8a}
#v-tam .tamSigne{border:1px dashed var(--tam-acc);border-radius:10px;padding:10px;margin:8px 0;font-size:.88rem;overflow-wrap:anywhere}
#v-tam details summary{min-height:44px;display:flex;align-items:center;cursor:pointer}
#v-tam .tamReglage{margin:2px 0}#v-tam .tamReglage output{font-variant-numeric:tabular-nums;font-size:.86rem}
#v-tam *{box-sizing:border-box}#v-tam{overflow-x:hidden}
`;

const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v === true ? '' : v); }
  for (const k of kids) if (k) e.append(k);
  return e;
};
let cssPose = false;
const reduit = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };
const hexDe = (u8) => '0x' + [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
/* game374 (Phil: "the Replay button must show it on the TAM map, to really replay the TAM"): what Replay decides for a minted work read
 *   from Base — its stored params replayed to bytes, compared with the bytes stored on Base. The scene loads it only when they are
 *   identical (what is drawn is then the minted work, not a look-alike). Pure: the click runs this, then draws. */
export function planRejeuMintee(paramsTexte, donnees) {
  let P = null; try { P = JSON.parse(String(paramsTexte)); } catch (_) { P = null; }
  const non = (pourquoi, genre = null) => ({ ok: false, genre, P: null, verdict: V.verdictRejeu(null, donnees), pourquoi });
  if (!P || typeof P !== 'object' || Array.isArray(P)) return non('its stored parameters could not be read');
  const sci = typeof P.science === 'string';
  if (sci && !SYSTEMES_SCI.some((s) => s.id === P.science)) return non('this page does not know its system yet: reload the page', 'science');
  let r = null; try { const Q = JSON.parse(JSON.stringify(P)); r = sci ? TS.rejouerScience(Q) : rejouer(Q); } catch (_) { r = null; }
  const verdict = V.verdictRejeu(r && r.ok ? r.octets : null, donnees);
  return { ok: verdict.identique === true, genre: sci ? 'science' : 'attracteur', P: verdict.identique ? P : null, verdict,
    pourquoi: verdict.identique ? null : 'its parameters do not replay to the bytes stored on Base' };
}

/* game378 (Phil pasted the Minted works list: "TAM #1", then "TAM #1 · first collection", "TAM #2 · first collection"…): ONE public
 *   number across both collections, in mint order. The first collection (TamArt, tokenId = ++totalSupply, no burn) minted #1..#N before
 *   TAM art went live — N is its totalSupply READ at TAM art's deploy block —, then TAM art's token k is #(N+k). Nothing is guessed: N not
 *   read, or a first-collection token above N (minted there after TAM art went live), and the work is named by its contract and token id.
 *   Pure: the gallery, the Replay lines and the card all show what this returns. */
export function nomPublicTam(id, premiere, nPremiere) {
  const k = Number(id);
  const detail = (premiere ? 'First collection' : 'TAM art') + ' · token ' + k;
  const nLu = Number.isSafeInteger(nPremiere) && nPremiere >= 0;
  const numero = !Number.isSafeInteger(k) || k < 1 || !nLu ? null : premiere ? (k <= nPremiere ? k : null) : nPremiere + k;
  return { numero, nom: numero === null ? detail : 'TAM #' + numero, detail };
}
/* the gallery's order: every work read ([{ s: { contrat, premiere }, id }], in the order read) named once, newest first — the highest
 *   number on top ; a work without a number (N not read) keeps the order it was read in (TAM art first, as before) */
export function ordreGalerie(lus, nPremiere) {
  const cle = (x) => (x.nom.numero === null ? Infinity : x.nom.numero);
  return (lus || []).map((x, i) => ({ ...x, i, nom: nomPublicTam(x.id, x.s.premiere, nPremiere) }))
    .sort((a, b) => (cle(b) - cle(a)) || (a.i - b.i)).map(({ i, ...x }) => x);
}

/**
 * @param {HTMLElement} racine  le conteneur de l onglet (#tamRacine)
 * @param {object} ctx  { rpc, compte(), payer: { lignes(), taille(l, usdc), soldes, dec, sym(l), qte(brut, dec), lire(moi) }, preparer(o), envoyer(pj, c, dit) }
 */
export function monter(racine, ctx = {}) {
  if (racine.dataset.tamMonte === '1') return racine.__tam;
  racine.dataset.tamMonte = '1';
  /* 2026-11-01 (test-ids-fantomes) : le style est pose UNE fois par chargement du module — un drapeau du module, pas un id relu dans le DOM */
  if (!cssPose) { document.head.append(el('style', { text: CSS })); cssPose = true; }
  const S = { P: null, o: null, c: null, choix: null, z: null, n: 0, D: 0, couches: null, t: 0, rotation: !reduit(), dessines: 0, cam: null, survol: null,
    sale: true, son: null, dom: null, ser: null, nMintees: 0, nPremiere: null };

  /* ── l explorateur ── */
  const selGroupe = el('select', { 'aria-label': 'Kind of graph', id: 'tamGroupe' }, ...GROUPES.map(([v, t]) => el('option', { value: v, text: t })));
  const selSys = el('select', { 'aria-label': 'System', id: 'tamSysteme', hidden: true });
  const selFam = el('select', { 'aria-label': 'Family', id: 'tamFamille' }, ...PORTEUSES.map((f) => el('option', { value: f, text: V.nomFamille(f) })));
  const selDim = el('select', { 'aria-label': 'Dimensions', id: 'tamDims' });
  const bCerveau = el('button', { type: 'button', id: 'tamCerveau', text: 'Let the brain choose' });
  /* 2026-11-01 : QUEL cerveau choisit — UNIT par defaut, ou le block ouvert dans l onglet Brain (bascule visible seulement s il y en a un) */
  const bSource = el('button', { type: 'button', id: 'tamSourceCerveau', 'aria-pressed': 'false', hidden: true });
  /* game79 : QUEL cerveau dessine — n importe quel block : UNIT, celui de l onglet Brain, ceux de la Map, ou une recherche */
  const selBloc = el('select', { id: 'tamBloc', 'aria-label': 'Which block\'s brain draws' });
  const chBloc = el('input', { type: 'search', id: 'tamBlocCherche', placeholder: 'Find a block — symbol or address', 'aria-label': 'Find a block', autocomplete: 'off', spellcheck: 'false' });
  const bRot = el('button', { type: 'button', id: 'tamRotation', 'aria-pressed': String(S.rotation), text: 'Hidden rotation' });
  const bVue = el('button', { type: 'button', text: 'Reset view' });
  const bSon = el('button', { type: 'button', id: 'tamSon', 'aria-pressed': 'false', text: 'Sound: off' });
  /* 2026-11-01 (Phil) : le trace a un debut et une fin, peut tourner en boucle ; Reset view le redessine */
  const bBoucle = el('button', { type: 'button', id: 'tamBoucle', 'aria-pressed': 'false', text: 'Loop: off' });
  /* game80 (Phil : « on voit qu une partie, continue jusqu a une fin ») : la VITESSE du trace — il va toujours jusqu au dernier point */
  /* game82 : partager l oeuvre a l ecran (un lien qui la rouvre a l identique) et telecharger ses VRAIES valeurs (CSV) */
  const bLien = el('button', { type: 'button', id: 'tamLien', text: 'Copy a link to this work' });
  const bCsv = el('button', { type: 'button', id: 'tamCsv', text: 'Download the data (CSV)' });
  const bDecor = el('button', { type: 'button', id: 'tamDecor', 'aria-pressed': 'true', text: 'Context: on' });
  const selVitesse = el('select', { id: 'tamVitesse', 'aria-label': 'Drawing speed' },
    el('option', { value: '15', text: 'Draw slowly (15 s)' }), el('option', { value: '6', text: 'Draw: normal (6 s)' }), el('option', { value: '2', text: 'Draw fast (2 s)' }));
  selVitesse.value = '6';
  /* game80 : un FILM (suite d images : galaxies qui se croisent, supernova, effet tunnel…) — le curseur choisit l instant */
  const curFilm = el('input', { type: 'range', id: 'tamFilm', min: '0', max: '0', step: '1', value: '0', 'aria-label': 'Moment in the film' });
  const filmTxt = el('output', { for: 'tamFilm', class: 'tamDoux' });
  const zFilm = el('div', { class: 'tamRang', id: 'tamZoneFilm', hidden: true }, el('label', { class: 'tamDoux', for: 'tamFilm', text: 'Moment' }), curFilm, filmTxt);
  const cv = el('canvas', { id: 'tamCanvas', 'aria-label': 'The work in 3-D' });
  const info = el('div', { class: 'tamInfo' });
  /* 2026-11-01 (Phil) : les variables SUR le graphe — un mathematicien lit l equation et ses valeurs sans quitter la scene */
  const varsScene = el('div', { class: 'tamVars', id: 'tamVarsScene' });
  /* game79 (Phil : « les donnees visibles en live sur le graph quand on passe le curseur ») : la bulle des VRAIES valeurs du point survole */
  const bulle = el('div', { class: 'tamBulle', id: 'tamBulle', hidden: true, role: 'status', 'aria-live': 'off' });
  /* game80 (Phil : « on doit mieux comprendre ce qu on voit, pas juste des graphes et courbes ») : la legende de CE systeme */
  const legende = el('details', { class: 'tamLegende', id: 'tamLegende', open: true }, el('summary', { text: 'What you are seeing' }));
  const scene = el('div', { class: 'tamScene' }, cv, info, varsScene, bulle);
  const etatLigne = el('p', { class: 'tamDoux', id: 'tamEtat', 'aria-live': 'polite' });
  /* game374 : under the scene, while a minted work is replayed — which one, and the byte check ("identical ✓") */
  const rejeuLigne = el('p', { class: 'tamDoux', id: 'tamRejeu', hidden: true, 'aria-live': 'polite' });
  /* 2026-11-01 (Phil) : en haut, QUEL block fait le graphe, son humeur (moteur) et sa lecture (le mot humain), avec le glow de l humeur */
  const qui = el('p', { class: 'tamQui', id: 'tamQui', text: 'No work yet: let a brain choose, or pick a family.' });
  function peindreQui() {
    /* game374 : a replayed minted work says so (not "you set it", not the brain of the work shown before) */
    if (S.rejeu) { qui.dataset.phase = ''; qui.replaceChildren(document.createTextNode('Replay of '), el('b', { text: nomRejeu() }), document.createTextNode(detailRejeu() + ' — minted on Base, drawn again from its stored parameters')); return; }
    if (S.science && !((S.choix && S.choix.cerveau) || S.origine)) { qui.dataset.phase = ''; qui.replaceChildren(document.createTextNode('Live simulation: '), el('b', { text: S.science.s.nom }), document.createTextNode(' · ' + S.science.s.science + ' · you set it')); return; }
    /* le cerveau qui a choisi reste nomme apres un reglage (S.origine) : « then tuned » le dit */
    const ch = (S.choix && S.choix.cerveau) || S.origine;
    if (ch) {
      const nom = ch.symbole || (ch.adresse ? court(ch.adresse) : 'a block');
      /* game79 (Phil : « mets la reel valeur en direct ») : si ce block est celui qui VIT dans l onglet Brain, ses valeurs du moment
       *   (humeur, ressenti, battement, spikes) se lisent la, rafraichies ; sinon : l etat rebati sur le serveur, au battement dit. */
      const v = ctx.cerveauVivant ? ctx.cerveauVivant() : null;
      const vif = v && ch.adresse && String(v.adr || '').toLowerCase() === String(ch.adresse).toLowerCase() ? v : null;
      /* revue game79 : l etat QUI A DESSINE (rebati sur le serveur, celui de la note on-chain) d abord ; l etat VIVANT ensuite, dit « now » */
      qui.dataset.phase = (vif ? vif.phase : ch.phase) || ''; qui.dataset.vif = vif ? 'oui' : 'non';
      qui.replaceChildren(document.createTextNode('Drawn by the brain of '), el('b', { text: nom }),
        ...(ch.humeur ? [document.createTextNode(' · mood '), el('b', { class: 'tamHumeur', text: ch.humeur })] : []),
        ...(ch.ressenti ? [document.createTextNode(' · feeling '), el('b', { text: ch.ressenti })] : []),
        ...(Number.isFinite(ch.battement) ? [document.createTextNode(' · beat '), el('b', { text: String(ch.battement) })] : []),
        ...(Number.isFinite(ch.spikes) ? [document.createTextNode(' · ' + ch.spikes + ' spikes')] : []),
        el('span', { class: 'tamDoux', text: ' (rebuilt on the server when it drew)' }),
        ...(vif ? [document.createTextNode(' · now live: '), el('b', { text: [vif.humeur, vif.ressenti, 'beat ' + vif.tick, vif.spikes + ' spikes'].filter(Boolean).join(' · ') })] : []),
        ...(S.science ? [document.createTextNode(' · ' + S.science.s.nom)] : []),
        ...(S.P && (S.P.regle || (S.science && !S.choix && S.origine)) ? [document.createTextNode(' · then tuned')] : []));
    } else { qui.dataset.phase = ''; qui.textContent = S.P ? 'Set by you in the explorer' + (S.P.regle && S.P.reglage && S.P.reglage.par === 'cerveau' ? ', nudged by the brain' : '') + '.' : 'No work yet.'; }
  }

  /* ── les couches ── */
  const curseur = el('input', { type: 'range', min: '2', max: '3', step: '1', value: '3', id: 'tamCurseur', 'aria-label': 'Dimensions shown' });
  const curseurTxt = el('span', { class: 'tamDoux' });
  const puces = el('div', { class: 'tamPuces', id: 'tamPuces', role: 'group', 'aria-label': 'Layers' });
  const bToutes = el('button', { type: 'button', text: 'All layers' });
  const bIsoler = el('button', { type: 'button', 'aria-pressed': 'false', text: 'Isolate' });
  /* 2026-11-01 (Phil : « le split des courbes pour voir tous les details ») : une bande par couche, chacune a sa propre echelle */
  const bSplit = el('button', { type: 'button', id: 'tamSplit', 'aria-pressed': 'false', text: 'Split curves' });
  const cvSeries = el('canvas', { class: 'tamSeries', 'aria-label': 'Each layer over time' });
  const grille = el('div', { class: 'tamGrille', id: 'tamGrille' });
  const eclate = el('details', {}, el('summary', { text: 'Exploded view: every pair of layers' }), grille);

  /* ── 2026-11-01 : les VARIABLES (Phil 31/10) — familles, operateur, dimension (jusqu a 12), chaque parametre ; le cerveau peut les bouger.
   *   Un espace vaste, pas infini : chaque curseur est borne (tam-moteur.js#BORNES) et chaque reglage passe les MEMES certificats. */
  const OPS_EN = { seul: 'alone', somme: 'blended with a pattern or a system', composition: 'driving a pattern or a system', couplage: 'coupled copies', croise: 'crossed with a system (one against the other)' };
  const MOTIFS_UI = [['ifs:fougere', 'fern (IFS)'], ['ifs:sierpinski', 'Sierpinski (IFS)'], ['ifs:dragon', 'dragon (IFS)'], ['julia', 'Julia set'], ['phyllotaxie', 'golden-angle phyllotaxis'],
    ['epicycles', 'epicycles'], ['lsysteme:koch', 'Koch (L-system)'], ['lsysteme:dragon', 'dragon (L-system)'], ['lsysteme:plante', 'plant (L-system)']];
  /* game131 : « croise » n existe qu en science (partenaire science) : une option a part, fermee hors science */
  const optCroise = el('option', { value: 'croise', text: OPS_EN.croise });
  const selOp = el('select', { 'aria-label': 'Operator', id: 'tamOperateur' }, ...M.OPERATEURS.map((o) => el('option', { value: o, text: OPS_EN[o] })), optCroise);
  let grpSci = null;
  /* game128 (Phil 04/11 : « tu es limite, fais des variantes avec les systemes de science ») : le partenaire peut etre une AUTRE science */
  const selMotif = el('select', { 'aria-label': 'Pattern', id: 'tamMotif' }, el('optgroup', { label: 'Mathematical patterns' }, ...MOTIFS_UI.map(([v, t]) => el('option', { value: v, text: t }))),
    (grpSci = el('optgroup', { label: 'Another science system (its default settings)' }, ...TS.PARTENAIRES.map((id) => el('option', { value: 'sci:' + id, text: TS.systeme(id).nom })))));
  const curseurs = el('div', { id: 'tamCurseurs' });
  /* game129 : le poids d un melange de science (bornes du moteur, BORNES.w), arrondi au millionieme comme le cerveau */
  let libPoids = null;
  const sortiePoids = el('output', { for: 'tamPoids', text: '' });
  const curPoids = el('input', { type: 'range', id: 'tamPoids', min: String(M.BORNES.w[0]), max: String(M.BORNES.w[1]), step: '0.005', value: '0.25', 'aria-label': 'Blend weight w' });
  const rangPoids = el('div', { class: 'tamReglage', hidden: true, title: 'parameter melange.w' }, (libPoids = el('label', { for: 'tamPoids', class: 'tamDoux', text: 'blend weight w: ' })), sortiePoids, curPoids);
  let minuteurPoids = null;
  /* game130 : les reglages de la science PARTENAIRE (bornes de son module) ; aux defauts, params est omis (une oeuvre = un seul JSON) */
  const curseursPartenaire = el('div', { id: 'tamCurseursPartenaire' });
  const voletPartenaire = el('details', { hidden: true, id: 'tamVoletPartenaire' }, el('summary', { text: 'Partner settings' }), curseursPartenaire);
  let partenairePeint = '', minuteurPartenaire = null;
  function peindrePartenaire() {
    const m = S.science && S.P && S.P.melange && S.P.melange.science ? S.P.melange : null;
    voletPartenaire.hidden = !m; if (!m) { partenairePeint = ''; return; }
    const sp = TS.systeme(m.science), R = sp.mod.reglagesPhysique(m.science, m.params || {}), cle = m.science + ':' + R.map((r) => r.nom + r.min + r.max).join('|');
    if (cle === partenairePeint) { for (const r of R) { const i = curseursPartenaire.querySelector('input[data-cle="' + r.nom + '"]'), o = curseursPartenaire.querySelector('output[data-cle="' + r.nom + '"]'); if (i && document.activeElement !== i) i.value = String(r.valeur); if (o) o.textContent = nb4(r.valeur); } return; }
    partenairePeint = cle;
    curseursPartenaire.replaceChildren(...R.map((r) => { const id = 'tamP-' + r.nom, pas = entierReglage(r) || TS.paramEntier(m.science, r.nom) ? '1' : String((r.max - r.min) / 400);
      return el('div', { class: 'tamReglage', title: 'partner parameter ' + r.nom }, el('label', { for: id, class: 'tamDoux', text: (nomParam(m.science, r.nom) || r.nom) + ': ' }), el('output', { for: id, 'data-cle': r.nom, text: nb4(r.valeur) }),
        el('input', { type: 'range', id, 'data-cle': r.nom, min: String(r.min), max: String(r.max), step: pas, value: String(r.valeur), 'aria-label': 'partner ' + (nomParam(m.science, r.nom) || r.nom) })); }));
  }
  curseursPartenaire.addEventListener('input', (e) => {
    const inp = e.target.closest('input[data-cle]'); if (!inp || !S.science || !S.P || !S.P.melange || !S.P.melange.science) return;
    const m = S.P.melange, sp = TS.systeme(m.science), voulu = { ...(m.params || sp.params), [inp.dataset.cle]: Number(inp.value) };
    /* les valeurs que le module GARDE (bornes, entiers) : ce sont elles qui sont certifiees */
    const borne = Object.fromEntries(sp.mod.reglagesPhysique(m.science, voulu).map((r) => [r.nom, r.valeur]));
    const mel = { operateur: m.operateur, science: m.science, w: m.w }; if (JSON.stringify(borne) !== JSON.stringify(Object.fromEntries(Object.keys(sp.params).map((k) => [k, sp.params[k]])))) mel.params = borne;
    const o = curseursPartenaire.querySelector('output[data-cle="' + inp.dataset.cle + '"]'); if (o) o.textContent = nb4(borne[inp.dataset.cle]);
    clearTimeout(minuteurPartenaire);
    const id = S.science.s.id, base = { ...S.P.params }, ori = (S.choix && S.choix.cerveau) || S.origine || null;
    minuteurPartenaire = setTimeout(() => chargerScience(id, base, { melange: mel, origine: ori }), 120);
  });
  curPoids.addEventListener('input', () => {
    if (!S.science || !S.P || !S.P.melange) return;
    const w = Math.min(M.BORNES.w[1], Math.max(M.BORNES.w[0], Math.round(Number(curPoids.value) * 1e6) / 1e6));
    sortiePoids.textContent = nb4(w);
    clearTimeout(minuteurPoids);
    const id = S.science.s.id, base = { ...S.P.params }, mel = { ...S.P.melange, w }, ori = (S.choix && S.choix.cerveau) || S.origine || null;
    minuteurPoids = setTimeout(() => chargerScience(id, base, { melange: mel, origine: ori }), 90);
  });
  /* game87 (audit : Mandelbrot a zoom 10 000 = une image PLATE — la fenetre de 3e-4 ne contenait aucun point de l ensemble) : le centre
   *   pose SUR la frontiere, calcule ici (jamais des coordonnees « celebres » tapees de memoire). Le module ne change pas : seuls cx, cy. */
  const bBord = el('button', { type: 'button', id: 'tamBord', hidden: true, text: 'Snap the centre to the boundary' });
  bBord.addEventListener('click', () => {
    if (!S.science || S.science.s.id !== 'mandelbrot' || !S.P) return;
    const p = S.P.params, b = bordMandelbrot(Number(p.cx), Number(p.cy));
    if (!b) return;
    /* mesure : a zoom 10 000 il faut ~1000 pas (200 : encore plat, 2 temps d echappement ; 1000 : 554) -> 200 + 200 log10(zoom), plafond 1000 */
    const it = Math.max(Number(p.maxIter) || 200, Math.min(1000, Math.round(200 + 200 * Math.log10(Math.max(1, Number(p.zoom) || 1)))));
    chargerScience('mandelbrot', { ...p, cx: b[0], cy: b[1], maxIter: it }, { melange: S.P.melange || null, origine: S.origine || null });
  });
  /* 2026-11-01 (Phil : « une variable chaos pour jouer sur le random ») : CHAOS = de combien CHAQUE variable peut sauter, au hasard du
   *   navigateur, dans ses bornes. Le resultat est une oeuvre reglee comme une autre : memes bornes, memes certificats, rejouable (params stockes). */
  const curChaos = el('input', { type: 'range', id: 'tamChaos', min: '0', max: '100', step: '1', value: '25', 'aria-label': 'Chaos' });
  const chaosTxt = el('output', { for: 'tamChaos', text: '25 %' });
  const bChaos = el('button', { type: 'button', id: 'tamSecouer', text: 'Shake with chaos' });
  /* 2026-11-01 (Phil : « un calcul avec une resolution pour donner un sens au graph ») : la RESOLUTION de la mesure (boites par cote) ;
   *   elle ne change pas l oeuvre stockee, elle dit combien de boites la forme occupe et la dimension locale qui en sort */
  const curRes = el('input', { type: 'range', id: 'tamResolution', min: '2', max: '6', step: '1', value: '4', 'aria-label': 'Measurement resolution' });
  const resTxt = el('output', { for: 'tamResolution' });
  const verdictTxt = el('p', { class: 'tamDoux', id: 'tamVerdict', 'aria-live': 'polite' });

  /* ── game79 : « Your formula » — ecrire, tracer, resoudre (racines, croisements, extremums, integrale, equilibres) avec le residu ── */
  const selMode = el('select', { id: 'tamFormMode', 'aria-label': 'Kind of formula' }, ...F.MODES.map((m) => el('option', { value: m.id, text: m.nom })));
  const zExpr = el('div', { id: 'tamFormExpr' });
  const deI = el('input', { type: 'number', id: 'tamFormDe', step: 'any', value: '-6.283', 'aria-label': 'From' });
  const aI = el('input', { type: 'number', id: 'tamFormA', step: 'any', value: '6.283', 'aria-label': 'To' });
  const zIntervalle = el('div', { class: 'tamRang' }, el('label', { class: 'tamDoux', for: 'tamFormDe', text: 'from' }), deI, el('label', { class: 'tamDoux', for: 'tamFormA', text: 'to' }), aI);
  const bTracer = el('button', { type: 'button', class: 'tamPrim', id: 'tamFormTracer', text: 'Draw it' });
  const bResoudre = el('button', { type: 'button', id: 'tamFormResoudre', text: 'Solve it' });
  const bFormCerveau = el('button', { type: 'button', id: 'tamFormCerveau', text: 'Let the brain write a formula' });
  const formDit = el('p', { class: 'tamDoux', id: 'tamFormDit', 'aria-live': 'polite' });
  const formRes = el('ul', { class: 'tamPayListe', id: 'tamFormResultats' });
  const carteFormule = el('div', { class: 'tamCarte', id: 'tamCarteFormule', hidden: true },
    el('h3', { text: 'Your formula' }),
    el('p', { class: 'tamDoux', text: 'Write your own maths and see it in 3-D. Use x, y, z, t, the sliders a, b, c, d, pi, e, phi and sin cos tan exp ln sqrt abs … Solutions are numerical: each one is shown with its residual — the formula evaluated at the answer, which should be close to 0.' }),
    el('div', { class: 'tamRang' }, selMode, bFormCerveau), zExpr, zIntervalle,
    el('div', { class: 'tamRang' }, bTracer, bResoudre), formDit, formRes);
  const dl = el('dl', { id: 'tamCarteOeuvre' });
  const zMint = el('div', { id: 'tamMint', hidden: true });
  const gal = el('div', { class: 'tamGal', id: 'tamGalerie' });
  const galEtat = el('p', { class: 'tamDoux', id: 'tamGalerieEtat' });
  const carteGal = el('div', { class: 'tamCarte', id: 'tamCarteGalerie', hidden: true }, el('h3', { text: 'Minted works' }), galEtat, gal);

  racine.replaceChildren(
    el('div', { class: 'tamCarte' },
      el('h2', { text: 'Tokenized Art Math' }),
      qui,
      el('p', { class: 'tamDoux', text: 'Strange attractors combined by the brain, plus live physics, fractals, the golden ratio, quantum and fluids — each checked against its theory and drawn in 3-D. Up to 12 dimensions, shown one layer at a time.' }),
      el('div', { class: 'tamRang' }, selGroupe, selSys, selFam, selDim, bCerveau, bSource),
      el('div', { class: 'tamRang' }, el('label', { class: 'tamDoux', for: 'tamBloc', text: 'Brain of' }), selBloc, chBloc),
      /* game82 (Phil : « mets les variables au dessus pour pouvoir tout selectionner d un coup ») : tout le CHOIX dans la premiere
       *   carte — systeme, famille, dimensions, cerveau, puis chaque variable — la scene juste en dessous */
      el('details', { class: 'tamReglagesHaut', id: 'tamReglagesHaut', open: '' },
        el('summary', { text: 'Variables — every setting of this work' }),
        el('p', { class: 'tamDoux', text: 'Change the family, the operator, the dimensions and every parameter. The space is vast, not infinite: each slider has limits, and every setting must pass the same checks before it can be minted.' }),
        el('div', { class: 'tamRang' }, selOp, selMotif, bBord),
        rangPoids,
        voletPartenaire,
        el('div', { class: 'tamRang' }, el('label', { class: 'tamDoux', for: 'tamChaos', text: 'Chaos' }), curChaos, chaosTxt, bChaos),
        curseurs, verdictTxt)),
    el('div', { class: 'tamCarte' },
      scene, rejeuLigne,
      el('div', { class: 'tamRang' }, bRot, bVue, bBoucle, bSon, selVitesse),
      el('div', { class: 'tamRang' }, bDecor, bLien, bCsv),
      zFilm,
      el('div', { class: 'tamRang' }, el('label', { class: 'tamDoux', for: 'tamResolution', text: 'Resolution' }), curRes, resTxt),
      el('p', { class: 'tamDoux', text: 'Drag to orbit · Shift-drag or two fingers to pan · wheel or pinch to zoom · hover or tap a point to read its values.' }),
      etatLigne, legende),
    el('div', { class: 'tamCarte' },
      el('h3', { text: 'Layers' }),
      el('p', { class: 'tamDoux', text: 'One colour per dimension. Turn layers on and off, isolate one, or grow the shape from 3-D to all of its dimensions.' }),
      curseur, curseurTxt, puces, el('div', { class: 'tamRang' }, bToutes, bIsoler, bSplit), cvSeries, eclate),
    carteFormule,
    el('div', { class: 'tamCarte' }, el('h3', { text: 'This work' }), dl, zMint),
    /* game76 (Phil : « retire ca pas utile ») : plus de « How it works » ; la carte des oeuvres n apparait qu une fois une oeuvre mintee */
    carteGal);

  /* ── charger une oeuvre (params) ── */
  function charger(P, choix = null, octetsServeur = null) {
    S.rejeu = null;
    let o;
    try { o = generer(P); } catch (e) { etatLigne.textContent = 'This combination could not be computed.'; return; }
    if (!o.bornee) {
      /* un reglage qui diverge : la scene se vide, le verdict le dit, rien n est mintable (pas un vieux dessin sous un nouveau curseur) */
      S.P = o.params; S.o = null; S.ser = null; S.octets = null; S.choix = choix; S.c = { ok: false, codes: ['DIVERGE'], raisons: ['diverge'] };
      etatLigne.textContent = 'This combination escapes to infinity: nothing to draw.'; S.dense = null; S.science = null;
      if (S.son) arreterSon();
      verdictTxt.textContent = V.verdictReglage(S.c).texte; peindreReglages(); peindreMint(); peindreCarte(); peindreVarsScene(); S.sale = true; return;
    }
    S.P = o.params; S.o = o; S.D = o.D; S.n = o.n; S.choix = choix; S.science = null; racine.dataset.science = '';
    if (choix && choix.cerveau) S.origine = choix.cerveau;
    /* une oeuvre REGLEE : les bornes d abord (validerReglage), puis les MEMES certificats que le choix du cerveau */
    const vb = S.P.regle ? M.validerReglage(S.P) : { ok: true };
    S.c = vb.ok ? certifier(o, []) : { ok: false, bornee: true, codes: ['HORS_BORNES'], raisons: [vb.raison], lyapunov: o.lyapunov };
    verdictTxt.textContent = V.verdictReglage(S.c).texte;
    S.z = V.standardiser(o.brut, o.n, o.D); S.ser = V.series(S.z, o.n, o.D);
    if (S.son) arreterSon(); /* game77 : voir chargerScience */
    S.couches = V.etatCouches(S.D); S.t = 0; S.dessines = reduit() ? S.n : 0; S.survol = null;
    /* game77 (De Jong « reste le meme ») : une map 2-D seule est dessinee DENSE (40 000 iterations, vue seulement) */
    S.dense = null; try { const d = M.nuageMap(S.P, 40000); if (d) S.dense = d; } catch (_) { S.dense = null; }
    S.octets = octetsServeur; S.stocke = (() => { try { const d = decoder(octetsDe(octetsServeur) || rejouer(P).octets); return d.positions; } catch (_) { return null; } })();
    curseur.min = String(Math.min(S.D, 2)); curseur.max = String(S.D); curseur.value = String(S.D);
    peindrePuces(); peindreCarte(); peindreGrille(); peindreReglages(); peindreMint(); peindreVarsScene(); peindreQui(); syncFilm(); peindreLegende();
    etatLigne.textContent = V.combinaison(S.P) + '.';
    racine.dataset.dims = String(S.D);
    S.sale = true;
  }
  /* ── game76 : une simulation de science (vue seule) — meme scene, memes couches, meme son ; pas de certificats, pas de Mint ── */
  /* game79 : extra = { melange, graine, note, choix } — ce que le CERVEAU a tire (melange d un motif, sa graine, sa note on-chain) ;
   *   un reglage a la main garde le melange mais perd la note (elle ne decrit plus l oeuvre) */
  function chargerScience(id, params = {}, extra = {}) {
    S.rejeu = null;
    /* game79 : un curseur a..d ou Chaos sur « Your formula » repasse par la formule (vue seule) */
    if (id === 'formule') { const { a, b, c, d, ...spec } = params; const vars = { ...(spec.vars || {}) }; for (const [k, v] of Object.entries({ a, b, c, d })) if (typeof v === 'number') vars[k] = v; chargerFormule({ ...spec, vars }); return; }
    const s = SYSTEMES_SCI.find((x) => x.id === id); if (!s) return;
    let o;
    try { o = s.mod.simuler(id, params); } catch (_) { etatLigne.textContent = 'This system could not be computed.'; return; }
    if (!o || !o.bornee || !o.brut) {
      S.o = null; S.ser = null; S.science = { s, o: o || null }; S.P = { science: id, params: (o && o.params) || params, angles: [] };
      S.octets = null; S.c = { ok: false, raisons: ['the simulation left its valid domain'] }; S.dense = null;
      if (S.son) arreterSon();
      /* revue game79 : le melange reste (revenir en arriere au curseur redonne la meme oeuvre) ; le choix du cerveau ne vaut plus */
      if (extra.melange && !TS.CORPS[id]) S.P.melange = extra.melange;
      S.choix = null; S.origine = extra.origine || S.origine || null;
      etatLigne.textContent = s.nom + ': the simulation left its valid domain (' + ((o && o.raison) || 'escaped') + '). Nothing to draw — change a variable.';
      /* game77 : la carte et la scene ne gardent plus les valeurs de l oeuvre d avant (« Bounded: yes » sous une scene vide) */
      peindreReglages(); peindreMint(); peindreCarte(); peindreVarsScene(); peindreQui(); S.sale = true; return;
    }
    const D = o.D;
    /* les params MINTABLES (tam-science.js) : bornes du module, angles d or, q = 12, tires pour CE wallet ; les octets = le rejeu */
    const P = TS.paramsScience(id, o.params, { minteur: compte() });
    if (extra.melange && !TS.CORPS[id]) P.melange = extra.melange; /* les corps se lisent seuls : pas de melange sur un systeme a plusieurs corps */
    if (extra.graine) P.graine = extra.graine;
    if (extra.note) P.note = extra.note;
    const cert = TS.certifierScience(P, []);
    S.science = { s, o };
    S.P = P;
    /* revue game79 (low) : un reglage a la main garde le NOM du cerveau qui avait choisi (« then tuned ») — extra.origine */
    S.o = o; S.D = D; S.n = o.n; S.choix = extra.choix || null; S.origine = extra.choix ? extra.choix.cerveau : (extra.origine || null); S.stocke = null;
    S.octets = cert.octets ? hexDe(cert.octets) : null;
    /* le certificat LOCAL (aucune oeuvre mintee comparee) ; le serveur refait la distance contre TOUTES au clic sur Mint */
    S.c = { ...cert, lyapunov: typeof o.lyapunov === 'number' ? o.lyapunov : NaN, uniteLyapunov: o.uniteLyapunov };
    /* game77 : les proportions de la science (meme echelle pour tous les axes), comme les octets mintes (tam-science.js) */
    S.z = TS.standardiserIso(o.brut, o.n, D, id); S.ser = V.series(S.z, o.n, D);
    /* game78 : plusieurs corps (planetes, etoiles, rayons) -> chacun dans le MEME espace, sa couleur (tam-science.js#vueCorps, = les octets mintes) */
    S.corps = TS.CORPS[id] ? TS.vueCorps(o, TS.CORPS[id]) : null;
    S.corpsActifs = S.corps ? Array(S.corps.corps).fill(true) : null; S.filmImage = 0;
    if (S.son) arreterSon(); /* game77 : le son avait min(D,12) voix ; une oeuvre a moins de dimensions le faisait planter a chaque image */
    S.couches = V.etatCouches(D); S.t = 0; S.dessines = reduit() ? S.n : 0; S.survol = null; S.dense = null;
    curseur.min = String(Math.min(D, 2)); curseur.max = String(D); curseur.value = String(D);
    peindrePuces(); peindreCarte(); peindreGrille(); peindreReglages(); peindreMint(); peindreVarsScene(); peindreQui(); syncFilm(); peindreLegende();
    etatLigne.textContent = s.phrase;
    racine.dataset.dims = String(D); racine.dataset.science = id;
    S.sale = true;
  }
  /* ── game79 : « Your formula » ── */
  const modeDe = (id) => F.MODES.find((m) => m.id === id) || F.MODES[0];
  function peindreExpressions(spec) {
    const m = modeDe(spec.mode);
    zExpr.replaceChildren(...m.expressions.map((k) => el('div', { class: 'tamRang' },
      el('label', { class: 'tamDoux', for: 'tamFormE-' + k, text: (spec.mode === 'systeme' ? 'd' + k + '/dt' : spec.mode === 'surface' ? 'z' : k) + ' =' }),
      el('input', { type: 'text', id: 'tamFormE-' + k, 'data-expr': k, value: (spec.expressions && spec.expressions[k]) || '', spellcheck: 'false', autocomplete: 'off', maxlength: String(F.LIMITES.longueur), style: 'flex:1;min-width:12rem' }))));
    const iv = spec.intervalle || null; zIntervalle.hidden = !iv;
    if (iv) { deI.value = String(Math.round(iv[0] * 1e4) / 1e4); aI.value = String(Math.round(iv[1] * 1e4) / 1e4); }
  }
  function specDeLaCarte() {
    const spec = F.normaliserSpec({ mode: selMode.value });
    for (const i of zExpr.querySelectorAll('input[data-expr]')) spec.expressions[i.dataset.expr] = i.value;
    if (spec.intervalle) spec.intervalle = [Number(deI.value), Number(aI.value)];
    if (S.science && S.science.s.id === 'formule' && S.P && S.P.params && S.P.params.vars) spec.vars = { ...S.P.params.vars };
    return spec;
  }
  /* la formule passe par la MEME scene que les sciences ; vue seule (pas d octets, pas de Mint) */
  function chargerFormule(spec, { note = null } = {}) {
    S.rejeu = null;
    for (const [k, txt] of Object.entries(spec.expressions || {})) {
      const a = F.analyser(txt); if (!a.ok) { formDit.textContent = (spec.mode === 'systeme' ? 'd' + k + '/dt' : k) + ': ' + a.erreur; return false; }
    }
    let o; try { o = F.simulerFormule(spec); } catch (e) { formDit.textContent = 'This formula could not be computed: ' + String(e.message || e); return false; }
    if (!o || !o.bornee || !o.brut) { formDit.textContent = 'This formula escapes or gives no finite point on this range' + (o && o.erreurs && o.erreurs.length ? ' (' + o.erreurs.join('; ') + ')' : '') + '.'; return false; }
    const D = o.D;
    S.science = { s: SYS_FORMULE, o }; S.P = { science: 'formule', params: o.params, angles: TS.anglesDefaut(D), ...(note ? { note } : {}) };
    S.o = o; S.D = D; S.n = o.n; S.choix = null; S.origine = null; S.stocke = null; S.octets = null; S.corps = null; S.dense = null;
    S.c = { ok: false, lyapunov: typeof o.lyapunov === 'number' ? o.lyapunov : NaN, uniteLyapunov: o.uniteLyapunov, raisons: ['your formula is shown, not minted'] };
    S.z = TS.standardiserIso(o.brut, o.n, D); S.ser = V.series(S.z, o.n, D);
    if (S.son) arreterSon();
    S.couches = V.etatCouches(D); S.t = 0; S.dessines = reduit() ? S.n : 0; S.survol = null;
    curseur.min = String(Math.min(D, 2)); curseur.max = String(D); curseur.value = String(D);
    peindrePuces(); peindreCarte(); peindreGrille(); peindreReglages(); peindreMint(); peindreVarsScene(); peindreQui(); syncFilm(); peindreLegende();
    const nRej = typeof o.rejets === 'number' ? o.rejets : o.rejets && typeof o.rejets === 'object' ? Object.values(o.rejets).reduce((s, v) => s + (Number(v) || 0), 0) : 0;
    etatLigne.textContent = modeDe(spec.mode).phrase + (nRej ? ' ' + nRej + ' point(s) dropped (division by zero or not finite).' : '');
    formDit.textContent = 'Drawn: ' + o.n + ' points.'; formRes.replaceChildren();
    racine.dataset.dims = String(D); racine.dataset.science = 'formule';
    S.sale = true; return true;
  }
  /* resoudre : chaque reponse avec son RESIDU (la formule evaluee a la reponse) — la verification « sur les donnees reelles » */
  function resoudre() {
    const spec = specDeLaCarte(), vars = spec.vars || {}, li = [], dit = (t) => li.push(el('li', { text: t }));
    try {
      if (spec.mode === 'courbe') {
        const [a, b] = spec.intervalle, e = spec.expressions.y;
        const rs = F.racines(e, { a, b, vars }); dit(rs.length ? rs.length + ' root(s) of y = 0:' : 'No root of y = 0 on [' + a + ', ' + b + '].');
        for (const r of rs.slice(0, 12)) dit('x = ' + r.x.toPrecision(12) + '   check: y(x) = ' + Number(r.fx).toExponential(2) + '  (' + r.methode + ')');
        const ex = F.extremums(e, { a, b, vars }); for (const x of ex.slice(0, 8)) dit((x.type === 'max' ? 'maximum' : x.type === 'min' ? 'minimum' : 'extremum') + ' at x = ' + Number(x.x).toPrecision(10) + ', y = ' + Number(x.fx).toPrecision(8) + '   check: slope there ' + Number(x.derivee).toExponential(1));
        const I = F.integrale(e, { a, b, vars }); if (I && Number.isFinite(I.valeur)) dit('Integral from ' + a + ' to ' + b + ' = ' + Number(I.valeur).toPrecision(12) + (Number.isFinite(I.erreurEstimee) ? '  (estimated error ' + Number(I.erreurEstimee).toExponential(1) + ')' : ''));
      } else if (spec.mode === 'systeme') {
        const eq = F.equilibres(spec.expressions.x, spec.expressions.y, spec.expressions.z, { vars });
        const L = Array.isArray(eq) ? eq : (eq && eq.points) || [];
        dit(L.length ? L.length + ' equilibrium point(s) (where dx/dt = dy/dt = dz/dt = 0):' : 'No equilibrium found in the search box.');
        for (const p of L.slice(0, 10)) dit('(' + [p.x, p.y, p.z].map((v) => Number(v).toPrecision(8)).join(', ') + ')  ' + (p.type || '') + (p.stable ? ' (stable)' : '') + '   check: residual ' + Number(p.residu).toExponential(2));
      } else dit('Solving is offered for curves y = f(x) (roots, extremes, integral) and for differential systems (equilibria).');
    } catch (e) { dit('Could not solve: ' + String(e.message || e)); }
    formRes.replaceChildren(...li);
  }
  /* le cerveau ECRIT une formule : un gabarit et des coefficients tires (crypto du navigateur + etat de son cerveau s il y en a un) ;
   *   il la trace, la resout, et ecrit ce qu il a trouve. Il COMPOSE dans une grammaire fixe — il ne decouvre pas de mathematiques. */
  function formuleDuCerveau() {
    const u = new Uint32Array(8); crypto.getRandomValues(u); let k = 0; const r = () => u[k++ % 8] / 4294967296;
    const c = (lo, hi, d = 2) => Math.round((lo + r() * (hi - lo)) * 10 ** d) / 10 ** d, sg = (x) => (x < 0 ? ' - ' + (-x) : ' + ' + x);
    const gabarits = [
      () => ({ mode: 'courbe', expressions: { y: c(-2, 2) + '*x^3' + sg(c(-3, 3)) + '*x^2' + sg(c(-4, 4)) + '*x' + sg(c(-3, 3)) }, intervalle: [-4, 4] }),
      () => ({ mode: 'courbe', expressions: { y: 'sin(' + c(0.5, 3) + '*x)' + sg(c(0.2, 1.5)) + '*cos(' + c(0.5, 4) + '*x)' + sg(c(-0.5, 0.5)) }, intervalle: [-6.283, 6.283] }),
      () => ({ mode: 'courbe', expressions: { y: 'exp(-x^2/' + c(1, 6) + ')*sin(' + c(1, 5) + '*x)' }, intervalle: [-6, 6] }),
      () => ({ mode: 'systeme', expressions: { x: c(5, 15) + '*(y - x)', y: 'x*(' + c(20, 40) + ' - z) - y', z: 'x*y - ' + c(1.5, 4) + '*z' } }),
      () => ({ mode: 'systeme', expressions: { x: '-y - z', y: 'x + ' + c(0.1, 0.35) + '*y', z: c(0.1, 0.4) + ' + z*(x - ' + c(4, 9) + ')' } }),
      () => ({ mode: 'parametrique', expressions: { x: 'sin(' + c(1, 5, 0) + '*t)', y: 'sin(' + c(1, 7, 0) + '*t + ' + c(0, 3) + ')', z: 'cos(' + c(1, 4, 0) + '*t)' }, intervalle: [0, 6.283] }),
      () => ({ mode: 'surface', expressions: { z: 'sin(' + c(0.5, 2) + '*x)*cos(' + c(0.5, 2) + '*y)' } }),
    ];
    const brut = gabarits[Math.floor(r() * gabarits.length) % gabarits.length]();
    const spec = { ...F.normaliserSpec({ mode: brut.mode }), ...brut, expressions: { ...F.normaliserSpec({ mode: brut.mode }).expressions, ...brut.expressions } };
    selMode.value = spec.mode; peindreExpressions(spec);
    if (chargerFormule(spec)) {
      resoudre();
      const n1 = formRes.querySelectorAll('li').length;
      /* revue game79 : honnete — ce tirage ne lit PAS l etat d un cerveau de block (gabarits + coefficients au hasard du navigateur) */
      formDit.textContent = 'A brain-style formula: a ' + modeDe(spec.mode).nom.toLowerCase() + ' picked from a fixed set of patterns with random coefficients (it does not read a block\'s brain state), drawn and solved (' + n1 + ' line(s) below). It composes formulas; it does not discover new mathematics.';
    }
  }
  selMode.addEventListener('change', () => { const spec = F.normaliserSpec({ mode: selMode.value }); peindreExpressions(spec); chargerFormule(spec); });
  bTracer.addEventListener('click', () => chargerFormule(specDeLaCarte()));
  bResoudre.addEventListener('click', () => { if (chargerFormule(specDeLaCarte())) resoudre(); });
  bFormCerveau.addEventListener('click', formuleDuCerveau);
  function peindreGroupe() {
    const g = selGroupe.value, sci = g !== 'attracteurs';
    carteFormule.hidden = g !== 'formule';
    /* revue game79 : dans « Your formula », operateur et motif n ont pas d effet — caches */
    if (g === 'formule') { for (const x of [selFam, selDim, selSys, selOp, selMotif]) x.hidden = true; return; }
    /* game79 : « Let the brain choose » reste visible PARTOUT — le cerveau tire parmi tous les genres (attracteurs et sciences) */
    for (const x of [selFam, selDim]) x.hidden = sci;
    peindreSource();
    selSys.hidden = !sci;
    /* une science se MELANGE aussi a un motif (somme / composition), sauf un systeme a plusieurs corps */
    const coupl = selOp.querySelector('option[value="couplage"]'); if (coupl) coupl.hidden = sci;
    if (sci) selSys.replaceChildren(...SYSTEMES_SCI.filter((s) => groupeDe(s) === g).map((s) => el('option', { value: s.id, text: s.nom + ' · ' + s.science })));
  }
  selGroupe.addEventListener('change', () => {
    peindreGroupe();
    /* revue game79 : en quittant une science, son cerveau (S.origine) et sa graine ne passent pas a un attracteur qu il n a pas dessine */
    /* 2026-11-07 : S.P vide mais S.o garde : si le groupe suivant ne charge rien (groupe vide, simuler qui jette), la boucle redessinait
     *   l ancienne oeuvre avec S.P = null -> TypeError « reading 'ordre' » a chaque image (vu en prod quand 3 groupes etaient vides). */
    if (S.science) { S.origine = null; S.choix = null; S.P = null; S.science = null; S.o = null; }
    if (selGroupe.value === 'attracteurs') depuisExplorateur();
    else if (selGroupe.value === 'formule') { const spec = F.normaliserSpec({ mode: selMode.value }); peindreExpressions(spec); chargerFormule(spec); }
    else chargerScience(selSys.value);
  });
  selSys.addEventListener('change', () => chargerScience(selSys.value));
  /* les variables sur la scene : la combinaison, chaque parametre a sa valeur, la dimension, le nombre de points, la graine */
  /* le titre du bloc sur la scene le deplie / replie (clic, Entree, Espace) ; replie par defaut */
  const titreVars = (t) => el('b', { text: t + (S.varsOuvert ? '  ▴ hide' : '  ▾ details'), role: 'button', tabindex: '0', 'aria-expanded': String(!!S.varsOuvert) });
  const basculerVars = () => { S.varsOuvert = !S.varsOuvert; peindreVarsScene(); };
  varsScene.addEventListener('click', (e) => { if (e.target && e.target.tagName === 'B') basculerVars(); });
  varsScene.addEventListener('keydown', (e) => { if (e.target && e.target.tagName === 'B' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); basculerVars(); } });
  function peindreVarsScene() {
    varsScene.classList.toggle('replie', !S.varsOuvert);
    if (!S.P) { varsScene.replaceChildren(); return; }
    if (S.science) {
      const { s, o } = S.science, m = o ? mesureResolution() : null;
      if (m) resTxt.textContent = '1/' + m.cote;
      const lam = o && typeof o.lyapunov === 'number' && Number.isFinite(o.lyapunov) ? 'λ = ' + o.lyapunov.toFixed(3) + (o.uniteLyapunov ? ' ' + uniteEn(o.uniteLyapunov) : '') + ' (measured over this run)' : null;
      varsScene.replaceChildren(
        titreVars(s.nom + ' — ' + s.science + ' · live simulation'),
        ...s.mod.reglagesPhysique(s.id, S.P.params).map((r) => el('span', { text: (NOMS_PARAMS_EN[r.nom] || r.nom) + ' = ' + nb4(r.valeur) })),
        el('span', { text: S.D + '-D · ' + S.n + (o && o.nuage ? ' samples (a cloud, not a path)' : ' points') }),
        ...Object.entries((o && o.invariants) || {}).filter(([k]) => !INVARIANT_MUET.has(k)).slice(0, 4).map(([k, v]) => el('span', { class: 'tamMesure', text: ligneInvariant(k, v) })),
        ...(lam ? [el('span', { class: 'tamMesure', text: lam })] : []),
        ...(m ? [el('span', { class: 'tamMesure', text: 'resolution 1/' + m.cote + ': ' + m.N + ' boxes · local dimension ≈ ' + (Number.isFinite(m.dim) ? m.dim.toFixed(2) : '—') + (m.sature ? ' (too fine for ' + m.points + ' points)' : '') })] : []));
      return;
    }
    const R = M.reglagesDe(S.P);
    const graine = S.P.graine ? String(S.P.graine) : '';
    const m = mesureResolution(), c = S.c || {};
    resTxt.textContent = m ? '1/' + m.cote : '';
    const lam = Number.isFinite(c.lyapunov) ? 'λ = ' + c.lyapunov.toFixed(3) + (c.uniteLyapunov === 'par iteration' ? ' per step' : ' per time unit') + (c.lyapunov > 0.02 ? ' (above 0.02: nearby paths split apart — chaotic)' : ' (0.02 or less: no measurable chaos — nearby paths stay together)') : null;
    const res = m ? 'resolution 1/' + m.cote + ' on the drawn view (' + (m.dense ? 'the 2-D map, ' + m.points.toLocaleString('en-US') + ' points' : m.vis + ' layers') + '): ' + m.N + ' boxes hold the shape · local dimension ≈ ' + (Number.isFinite(m.dim) ? m.dim.toFixed(2) : '—')
      + (m.sature ? ' (too fine for ' + m.points.toLocaleString('en-US') + ' points: read it as a lower bound)' : '') : null;
    varsScene.replaceChildren(
      titreVars(V.combinaison(S.P)),
      ...R.map((r) => el('span', { text: r.nom + ' = ' + r.valeur.toFixed(4) })),
      el('span', { text: S.D + '-D · ' + S.n + ' points' + (graine ? ' · seed ' + graine.slice(0, 10) + '…' : '') }),
      ...(lam ? [el('span', { class: 'tamMesure', text: lam })] : []),
      ...(res ? [el('span', { class: 'tamMesure', text: res })] : []));
  }
  function optionsDims() {
    const f = selFam.value, o = [];
    if (f === 'lorenz96') for (let d = M.BORNES.dim96[0]; d <= M.BORNES.dim96[1]; d++) o.push([String(d), d + '-D']);
    else if (f === 'clifford' || f === 'dejong') o.push(['1', '2-D map']);
    else o.push(['1', '3-D'], ['2', '6-D (2 coupled)'], ['3', '9-D (3 coupled)'], ['4', '12-D (4 coupled)']);
    selDim.replaceChildren(...o.map(([v, t]) => el('option', { value: v, text: t })));
  }
  const compte = () => { const c = ctx.compte && ctx.compte(); return c && /^0x[0-9a-fA-F]{40}$/.test(String(c)) ? String(c).toLowerCase() : null; };
  /* game128 : hors science (attracteurs), les partenaires science sont fermes ; un choix science retombe sur le premier motif */
  const motifChoisi = () => { if (selMotif.value.startsWith('sci:')) selMotif.value = MOTIFS_UI[0][0];
    return motifChoisiBrut(); };
  const motifChoisiBrut = () => { const [famille, variante] = selMotif.value.split(':'); return { famille, variante }; };
  /* la STRUCTURE (famille, operateur, dimension, motif) : des params complets, reglables ; le dimension 1/2/3/4 copies = 3..12-D */
  function depuisExplorateur(source = '') {
    const f = selFam.value, d = Number(selDim.value) || 1, coupl = M.PORTEUSES_3D.includes(f);
    let op = selOp.value; if (op === 'croise') op = 'seul';
    if (source === 'dims' && coupl) op = d > 1 ? 'couplage' : op === 'couplage' ? 'seul' : op;
    if (op === 'couplage' && !coupl) op = 'seul';
    if (op === 'couplage' && d < 2) selDim.value = '2';
    if (op !== 'couplage' && coupl && d > 1) selDim.value = '1';
    selOp.value = op;
    let P;
    try { P = M.structurer({ famille: f, operateur: op, copies: Number(selDim.value), dim96: Number(selDim.value), motif: motifChoisi(), base: S.P }); }
    catch (e) { verdictTxt.textContent = 'This combination is not offered: ' + String(e.message || e) + '.'; return; }
    regler(P);
  }
  /* toute oeuvre REGLEE passe par ici : tiree pour CE wallet (minteur), ses octets (rejoues des params), puis charger + verdict */
  function regler(P, octets = null) {
    const Q = { ...P }; const c = compte(); if (c) Q.minteur = c; else delete Q.minteur;
    let oct = octets;
    if (!oct || (Q.minteur || null) !== (P.minteur || null)) { const r = rejouer(Q); oct = r.ok ? r.octets : null; }
    charger(Q, null, oct ? hexDe(oct) : null);
  }
  selFam.addEventListener('change', () => { S.origine = null; optionsDims(); depuisExplorateur(); });
  selDim.addEventListener('change', () => depuisExplorateur('dims'));
  /* game79 : dans une science, operateur + motif = un MELANGE de types differents (science x fractale / angle d or) */
  function melangeScience() {
    const op = selOp.value;
    if (op !== 'somme' && op !== 'composition' && op !== 'croise') return null;
    const w = (S.P && S.P.melange && S.P.melange.w) || 0.25;
    /* croise : il faut une science partenaire ; sans elle, la premiere qui n est pas ce systeme */
    if (op === 'croise' && !selMotif.value.startsWith('sci:')) { const sid = TS.PARTENAIRES.find((x) => !S.science || x !== S.science.s.id); selMotif.value = 'sci:' + sid; }
    if (selMotif.value.startsWith('sci:')) { const sid = selMotif.value.slice(4); if (S.science && sid === S.science.s.id) return null; const av = S.P && S.P.melange; return av && av.science === sid && av.params ? { operateur: op, science: sid, w, params: av.params } : { operateur: op, science: sid, w }; }
    const { famille, variante } = motifChoisi();
    return { operateur: op, motif: M.motifDefaut(famille, variante), w };
  }
  selOp.addEventListener('change', () => { if (S.science) { selMotif.hidden = !(selOp.value === 'somme' || selOp.value === 'composition' || selOp.value === 'croise'); chargerScience(S.science.s.id, S.P.params, { melange: melangeScience() }); } else depuisExplorateur('op'); });
  selMotif.addEventListener('change', () => { if (S.science) chargerScience(S.science.s.id, S.P.params, { melange: melangeScience() }); else depuisExplorateur('motif'); });
  /* les curseurs : un par variable de reglagesDe ; rebatis seulement si la LISTE change (un glissement en cours n est pas casse) */
  let cheminsPeints = '';
  function peindreReglages() {
    bBord.hidden = !(S.science && S.science.s.id === 'mandelbrot');
    if (S.science) {
      /* game79 : le melange de la science (operateur + motif) se lit et se regle ici aussi */
      selOp.hidden = !!TS.CORPS[S.science.s.id]; selOp.value = S.P.melange ? S.P.melange.operateur : 'seul';
      selMotif.hidden = !S.P.melange; grpSci.disabled = false;
      rangPoids.hidden = !S.P.melange; peindrePartenaire();
      optCroise.disabled = false; for (const g of selMotif.querySelectorAll('optgroup')) if (g !== grpSci) g.disabled = !!(S.P.melange && S.P.melange.science && S.P.melange.operateur === 'croise');
      if (S.P.melange) { if (document.activeElement !== curPoids) curPoids.value = String(S.P.melange.w); sortiePoids.textContent = nb4(S.P.melange.w);
        /* (l operateur MATHEMATIQUE du melange : compare a part, jamais place sur la ligne d affichage — cf. test-no-fee-address-shown) */
        const estSomme = S.P.melange.operateur === 'somme', estCroise = S.P.melange.operateur === 'croise';
        libPoids.textContent = estSomme ? 'blend weight w (share of the partner): ' : estCroise ? 'blend weight w (share of the partner in the depth): ' : 'blend weight w (share of this system in the depth): '; }
      if (S.P.melange) { const v = S.P.melange.science ? 'sci:' + S.P.melange.science : S.P.melange.motif.famille + (S.P.melange.motif.variante ? ':' + S.P.melange.motif.variante : ''); if ([...selMotif.options].some((o) => o.value === v)) selMotif.value = v; }
      const R = reglagesVivants(S.science.s, S.P.params), cles = 'sci:' + S.science.s.id + ':' + R.map((r) => r.chemin + r.min + r.max).join('|');
      if (cles !== cheminsPeints) {
        cheminsPeints = cles;
        curseurs.replaceChildren(...R.map((r) => {
          const id = 'tamR-' + r.chemin.replace('.', '-');
          /* game77 : un parametre ENTIER (nombres quantiques, nombre de tourbillons, graine) a un pas de 1 — plus de « 2.347 » */
          const cle = r.chemin.split('.').pop(), pas = entierReglage(r) || TS.paramEntier(S.science.s.id, cle) ? '1' : String((r.max - r.min) / 400);
          /* game82 (vu a l ecran : « termesLeibniz », « graine ») : le nom anglais, le nom du code en info-bulle pour qui lit le source */
          /* game92 : un curseur dont la FORME ne change pas le dit (auto-similarite, ou seuls les « Check » bougent) — mesure au banc */
          const note = CURSEURS_SANS_FORME[S.science.s.id + '.' + cle];
          return el('div', { class: 'tamReglage', title: 'parameter ' + cle },
            el('label', { for: id, class: 'tamDoux', text: (nomParam(S.science.s.id, cle) || r.nom) + ': ' }), el('output', { for: id, 'data-sortie': r.chemin, text: nb4(r.valeur) }),
            ...(note ? [el('span', { class: 'tamDoux tamNoteCurseur', text: ' — ' + (note === 'echelle' ? 'sets the scale only: the shape stays the same (see the scale bar and the checks)' : 'changes the checks below, not the drawing') })] : []),
            el('input', { type: 'range', id, 'data-chemin': r.chemin, min: String(r.min), max: String(r.max), step: pas, value: String(r.valeur), 'aria-label': nomParam(S.science.s.id, cle) || r.nom }));
        }));
      } else for (const r of R) {
        /* game77 : apres Chaos (ou un parametre ramene par le module), curseurs et etiquettes disent la valeur REELLE */
        const i = curseurs.querySelector('input[data-chemin="' + r.chemin + '"]'), s = curseurs.querySelector('output[data-sortie="' + r.chemin + '"]');
        if (i && document.activeElement !== i) i.value = String(r.valeur);
        if (s) s.textContent = nb4(r.valeur);
      }
      racine.dataset.reglages = String(R.length);
      verdictTxt.textContent = S.c && S.c.ok ? 'Mintable for 5 USDC once the server checks it is distinct from every minted work.' : 'Not mintable: ' + ((S.c && S.c.raisons || []).join('; ') || 'the simulation left its valid domain') + '.';
      return;
    }
    grpSci.disabled = true; rangPoids.hidden = true; voletPartenaire.hidden = true; optCroise.disabled = true;
    for (const g of selMotif.querySelectorAll('optgroup')) if (g !== grpSci) g.disabled = false; selOp.value = S.P.operateur; selMotif.hidden = !(S.P.operateur === 'somme' || S.P.operateur === 'composition');
    if (S.P.motif) { const v = S.P.motif.famille + (S.P.motif.variante ? ':' + S.P.motif.variante : ''); if ([...selMotif.options].some((o) => o.value === v)) selMotif.value = v; }
    const R = M.reglagesDe(S.P), cles = R.map((r) => r.chemin).join('|');
    if (cles !== cheminsPeints) {
      cheminsPeints = cles;
      curseurs.replaceChildren(...R.map((r) => {
        const id = 'tamR-' + r.chemin.replace('.', '-');
        return el('div', { class: 'tamReglage' },
          el('label', { for: id, class: 'tamDoux', text: r.nom + ': ' }), el('output', { for: id, 'data-sortie': r.chemin, text: r.valeur.toFixed(3) }),
          el('input', { type: 'range', id, 'data-chemin': r.chemin, min: String(r.min), max: String(r.max), step: String((r.max - r.min) / 400), value: String(r.valeur), 'aria-label': r.nom }));
      }));
    } else for (const r of R) {
      const i = curseurs.querySelector('input[data-chemin="' + r.chemin + '"]'), s = curseurs.querySelector('output[data-sortie="' + r.chemin + '"]');
      if (i && document.activeElement !== i) i.value = String(r.valeur);
      if (s) s.textContent = r.valeur.toFixed(3);
    }
    racine.dataset.reglages = String(R.length);
  }
  let minuteur = null;
  curseurs.addEventListener('input', (e) => {
    const inp = e.target.closest('input[data-chemin]'); if (!inp || !S.P) return;
    const s = curseurs.querySelector('output[data-sortie="' + inp.dataset.chemin + '"]'); if (s) s.textContent = Number(inp.value).toFixed(3);
    clearTimeout(minuteur);
    if (S.science) {
      /* une science : on resimule avec CETTE variable (bornee par le module), rien d autre ne change */
      const cle = inp.dataset.chemin.replace(/^params\./, ''), id = S.science.s.id, base = { ...S.P.params };
      const mel = S.P.melange || null, ori = (S.choix && S.choix.cerveau) || S.origine || null;
      minuteur = setTimeout(() => chargerScience(id, { ...base, [cle]: Number(inp.value) }, { melange: mel, origine: ori }), 90);
      return;
    }
    minuteur = setTimeout(() => {
      /* V.oeuvreReglee : SEUL ce chemin change, arrondi AVANT la generation — les octets sont ceux que le rejeu recalcule */
      const r = V.oeuvreReglee({ ...S.P, ...(compte() ? { minteur: compte() } : {}) }, inp.dataset.chemin, Number(inp.value));
      const { reglage: _r, ...sans } = r.params;
      regler(sans, r.octets);
    }, 90);
  });
  curChaos.addEventListener('input', () => { chaosTxt.textContent = curChaos.value + ' %'; });
  bChaos.addEventListener('click', () => {
    if (!S.P) return;
    if (S.science) {
      /* une science : chaque variable saute au hasard dans ses bornes, puis on resimule (le module borne encore) */
      const k = Number(curChaos.value) / 100, id = S.science.s.id, R = reglagesVivants(S.science.s, S.P.params), u = new Uint32Array(Math.max(1, R.length));
      crypto.getRandomValues(u);
      const Q = { ...S.P.params };
      R.forEach((r, i) => {
        const x = u[i] / 4294967296 * 2 - 1;
        let v = Math.min(r.max, Math.max(r.min, r.valeur + x * k * (r.max - r.min) / 2));
        /* game77 (2 000 secousses : n, l, m, k, nombre restaient fixes 100 % du temps) : un entier est arrondi, et s il retombe sur sa
         *   valeur alors que chaos > 0, il bouge d UN cran (vers le cote tire) — dans ses bornes */
        if (entierReglage(r)) { v = Math.round(v); if (k > 0 && v === r.valeur) v = Math.min(r.max, Math.max(r.min, r.valeur + (x >= 0 ? 1 : -1))); }
        Q[r.chemin.replace(/^params\./, '')] = v;
      });
      chargerScience(id, Q, { melange: S.P.melange || null, origine: (S.choix && S.choix.cerveau) || S.origine || null });
      return;
    }
    const k = Number(curChaos.value) / 100, R = M.reglagesDe(S.P), u = new Uint32Array(Math.max(1, R.length));
    crypto.getRandomValues(u);
    /* chaque variable : valeur + (hasard dans [-1, 1]) x chaos x demi-plage ; appliquerReglage borne et arrondit */
    let Q = S.P;
    R.forEach((r, i) => { Q = M.appliquerReglage(Q, r.chemin, r.valeur + (u[i] / 4294967296 * 2 - 1) * k * (r.max - r.min) / 2); });
    const { reglage: _r, ...sans } = Q;
    regler(sans);
    verdictTxt.textContent = 'Chaos ' + curChaos.value + ' %: ' + R.length + ' variables moved at random, each by up to ' + curChaos.value + ' % of half its range. ' + verdictTxt.textContent;
  });
  /* la mesure a une resolution : 2^r boites par cote, sur les couches visibles (series normalisees 0..1) ; la dimension locale = pente
   *   log2 N(2^r) / N(2^(r-1)). Avec 1 500 points, une resolution trop fine sature : on le dit au lieu d afficher un chiffre faux. */
  /* game77 (chasse aux bugs : 12-D sature a toutes les resolutions, un melange mesurait sa porteuse, « 1 boxes » couches eteintes) :
   *   on mesure la VUE DESSINEE (3-D normalisee, melange et nuage compris) — ou le nuage dense d une map (2-D, 40 000 points). */
  function boites(pts, dim, r) {
    const cote = 1 << r, occ = new Set(), m = pts.length / dim;
    for (let i = 0; i < m; i++) { let cle = 0; for (let c = 0; c < dim; c++) cle = cle * cote + Math.min(cote - 1, Math.max(0, Math.floor((pts[i * dim + c] + 1) / 2 * cote))); occ.add(cle); }
    return occ.size;
  }
  function mesureResolution() {
    if (!S.o || !S.couches || V.dimsVisibles(S.couches).length === 0) return null;
    let pts, dim;
    if (S.dense && !S.science) {
      const d = S.dense; let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < d.length; i += 2) { if (d[i] < x0) x0 = d[i]; if (d[i] > x1) x1 = d[i]; if (d[i + 1] < y0) y0 = d[i + 1]; if (d[i + 1] > y1) y1 = d[i + 1]; }
      const h = Math.max(x1 - x0, y1 - y0) / 2 || 1; pts = new Float64Array(d.length);
      for (let i = 0; i < d.length; i += 2) { pts[i] = (d[i] - (x0 + x1) / 2) / h; pts[i + 1] = (d[i + 1] - (y0 + y1) / 2) / h; }
      dim = 2;
    } else { pts = positions(); dim = 3; }
    const r = Number(curRes.value), N = boites(pts, dim, r), N0 = boites(pts, dim, r - 1), m = pts.length / dim;
    return { cote: 1 << r, N, dim: N0 > 0 ? Math.log2(N / N0) : NaN, sature: N > m / 3, vis: V.dimsVisibles(S.couches).length, points: m, dense: dim === 2 };
  }
  curRes.addEventListener('input', () => peindreVarsScene());
  const court = (a) => displayShort(a); /* le raccourci qui masque le fee wallet (test-no-fee-address-shown) */
  const blocVu = () => { const a = ctx.blocCerveau && ctx.blocCerveau(); return a && /^0x[0-9a-fA-F]{40}$/.test(String(a)) ? String(a).toLowerCase() : null; };
  /* game79 : le cerveau qui dessine = le block CHOISI dans le selecteur ('' = UNIT, le cerveau par defaut du serveur) */
  const ADR_OK = /^0x[0-9a-f]{40}$/;
  const sourceCerveau = () => (ADR_OK.test(selBloc.value) ? selBloc.value : null);
  const trouves = new Map(); /* les blocks trouves par la recherche (gardes dans la liste) */
  let sigBlocs = '';
  function peindreBlocs() {
    const vu = blocVu(), carte = ctx.blocsCarte ? ctx.blocsCarte() : [];
    const lignes = [['', 'UNIT (default brain)']];
    if (vu) lignes.push([vu, 'Brain tab: ' + court(vu)]);
    for (const [a, s] of trouves) if (a !== vu) lignes.push([a, (s || court(a)) + ' · found']);
    for (const h of carte) if (h.adr !== vu && !trouves.has(h.adr)) lignes.push([h.adr, (h.sym || court(h.adr)) + ' · on your Map']);
    const sig = lignes.map((l) => l[0]).join('|');
    if (sig === sigBlocs) return;
    const garde = selBloc.value; sigBlocs = sig;
    selBloc.replaceChildren(...lignes.map(([v, t]) => el('option', { value: v, text: t })));
    /* revue game79 : tant que la personne n a rien choisi, le block ouvert dans l onglet Brain est pre-selectionne (avant : UNIT toujours) */
    selBloc.value = S.blocChoisiMain && lignes.some((l) => l[0] === garde) ? garde : (vu ? vu : (lignes.some((l) => l[0] === garde) ? garde : ''));
    racine.dataset.blocs = String(lignes.length);
  }
  let minuteurBloc = null;
  chBloc.addEventListener('input', () => {
    clearTimeout(minuteurBloc);
    const q = chBloc.value.trim(); if (q.length < 2 || !ctx.chercherBlocs) return;
    minuteurBloc = setTimeout(async () => {
      const r = await ctx.chercherBlocs(q).catch(() => []);
      for (const h of r) trouves.set(h.adr, h.sym);
      peindreBlocs();
      if (r[0]) { S.blocChoisiMain = true; trouves.set(r[0].adr, r[0].sym); peindreBlocs(); selBloc.value = r[0].adr; }
    }, 350);
  });
  selBloc.addEventListener('change', () => { S.sourceBloc = selBloc.value !== ''; S.blocChoisiMain = true; peindreSource(); });
  function peindreSource() {
    peindreBlocs();
    bSource.hidden = true; /* game79 : remplace par le selecteur « Brain of » */
    return;
    const a = blocVu(); bSource.hidden = !a; if (bSource.hidden) return;
    const sur = S.sourceBloc !== false;
    bSource.setAttribute('aria-pressed', String(sur));
    bSource.textContent = sur ? 'Brain: block ' + court(a) : 'Brain: UNIT';
    bSource.title = sur ? 'The brain of the block open in the Brain tab chooses. Click to use UNIT\'s brain.' : 'UNIT\'s brain chooses. Click to use the block open in the Brain tab.';
  }
  bSource.addEventListener('click', () => { S.sourceBloc = S.sourceBloc === false; peindreSource(); });
  peindreSource();
  bCerveau.addEventListener('click', async () => {
    peindreSource();
    const src = sourceCerveau();
    etatLigne.textContent = (src ? 'The brain of block ' + court(src) : 'The brain') + ' is choosing from the latest block…';
    let j = null;
    /* 2026-11-01 : le wallet connecte entre dans la graine — deux joueurs sur le meme bloc ne recoivent jamais la meme oeuvre */
    const c = compte();
    /* 2026-11-01 : un tirage NEUF a chaque clic (crypto du navigateur) — sinon la tete en cache 60 s rendait la meme oeuvre */
    const tirage = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
    try { j = await fetch('/api/tam/choix?draw=' + tirage + (c ? '&minter=' + c : '') + (src ? '&block=' + src : ''), { cache: 'no-store' }).then((r) => r.json()); } catch (_) { j = null; }
    /* OCCUPE / TROP : on le dit, et on ne relance RIEN tout seul (le joueur reclique s il veut) */
    if (j && (j.etat === 'OCCUPE' || j.etat === 'TROP')) { etatLigne.textContent = j.etat === 'OCCUPE' ? 'The server is busy, try again in a few seconds.' : 'Too many TAM computations from here: try again in a minute.'; return; }
    if (!j || j.ok !== true) { etatLigne.textContent = 'The brain\'s choice could not be read' + (j && j.pourquoi ? ': ' + j.pourquoi : '') + '.'; return; }
    S.nMintees = Number(j.comparees) || 0;
    /* l etat du cerveau qui a choisi : c est LUI qui bouge les variables (coupDePouce), de facon deterministe */
    S.cerveauEtat = { cerveau: j.cerveau, empreinteEtat: j.empreinteEtat, graine: j.graine };
    /* game79 : le cerveau a pu tirer une SCIENCE (n importe laquelle, variables au hasard, parfois melangee) : le menu suit son choix */
    if (j.genre === 'science' && j.params && j.params.science) {
      const s = SYSTEMES_SCI.find((x) => x.id === j.params.science);
      if (!s) { etatLigne.textContent = 'The brain chose a system this page does not know yet: reload the page.'; return; }
      selGroupe.value = groupeDe(s); peindreGroupe(); selSys.value = s.id;
      /* ⛔ les octets du serveur doivent etre ceux que la page rejoue (le portail du Mint le revérifie au clic) */
      chargerScience(s.id, j.params.params, { melange: j.params.melange || null, graine: j.params.graine, note: j.params.note,
        choix: { graine: j.graine, bloc: j.bloc, cerveau: j.cerveau, hash: j.hash, essai: j.essai, rejets: j.rejets, certificats: j.certificats } });
      /* revue game79 (high) : des octets differents de ceux du serveur FERMENT le Mint (avant : un simple avertissement, et le Mint passait) */
      if (S.octets !== j.octets) { S.c = { ...S.c, ok: false, raisons: ['this page replayed different bytes than the server chose'] }; peindreMint(); verdictTxt.textContent = 'Not mintable: this page replayed different bytes than the server chose.'; }
      return;
    }
    if (selGroupe.value !== 'attracteurs') { selGroupe.value = 'attracteurs'; peindreGroupe(); }
    /* les selecteurs disent la porteuse choisie (pas l ancienne selection) */
    selFam.value = j.params.famille; optionsDims();
    selDim.value = j.params.famille === 'lorenz96' ? String(j.params.dim) : j.params.operateur === 'couplage' ? String(j.params.k) : '1';
    charger(j.params, { graine: j.graine, bloc: j.bloc, cerveau: j.cerveau, empreinteEtat: j.empreinteEtat, essai: j.params.essai, rejets: j.rejets, certificats: j.certificats, hash: j.hash }, j.octets);
  });

  /* ── couches ── */
  function peindrePuces() {
    /* game80 (Phil : « pas la possibilite de changer les layers ») : pour plusieurs corps, une puce PAR CORPS, avec son nom */
    if (S.science && S.corps) {
      const noms = nomsCorpsCourants();
      if (!S.corpsActifs || S.corpsActifs.length !== S.corps.corps) S.corpsActifs = Array(S.corps.corps).fill(true);
      puces.replaceChildren(...S.corpsActifs.map((a, b) => el('button', { type: 'button', class: 'tamPuce', 'aria-pressed': String(a), 'data-corps': String(b), 'aria-label': 'Show ' + noms[b] },
        el('i', { style: 'background:' + V.couleurDim(b) }), document.createTextNode(noms[b]))));
      curseurTxt.textContent = S.corpsActifs.filter(Boolean).length + ' of ' + S.corps.corps + ' bodies shown';
      peindreVarsScene(); return;
    }
    puces.replaceChildren(...S.couches.actives.map((a, j) => el('button', { type: 'button', class: 'tamPuce', 'aria-pressed': String(a), 'data-dim': String(j), 'aria-label': 'Layer x' + (j + 1) },
      el('i', { style: 'background:' + V.couleurDim(j) }), document.createTextNode('x' + (j + 1)))));
    const v = V.dimsVisibles(S.couches).length;
    curseurTxt.textContent = v + ' of ' + S.D + ' dimensions shown';
    racine.dataset.visibles = V.dimsVisibles(S.couches).join(',');
    peindreVarsScene(); /* la mesure de resolution porte sur les couches visibles */
    if (S.split) tailleSeries();
  }
  puces.addEventListener('click', (e) => {
    const bc = e.target.closest('[data-corps]');
    if (bc && S.corpsActifs) {
      const k = Number(bc.getAttribute('data-corps'));
      if (bIsoler.getAttribute('aria-pressed') === 'true') S.corpsActifs = S.corpsActifs.map((_, q) => q === k);
      else { S.corpsActifs[k] = !S.corpsActifs[k]; if (!S.corpsActifs.some(Boolean)) S.corpsActifs[k] = true; }
      peindrePuces(); S.sale = true; return;
    }
    const b = e.target.closest('[data-dim]'); if (!b) return;
    const j = Number(b.getAttribute('data-dim'));
    S.couches = bIsoler.getAttribute('aria-pressed') === 'true' ? V.isoler(S.couches, j) : V.basculer(S.couches, j);
    peindrePuces(); peindreGrille(); majSon(); S.sale = true;
  });
  bToutes.addEventListener('click', () => { S.couches = V.toutes(S.couches); curseur.value = String(S.D); peindrePuces(); peindreGrille(); majSon(); S.sale = true; });
  function tailleSeries() { cvSeries.style.height = S.split && S.couches ? Math.max(120, V.dimsVisibles(S.couches).length * 52) + 'px' : ''; }
  bSplit.addEventListener('click', () => {
    S.split = !S.split; bSplit.setAttribute('aria-pressed', String(S.split)); cvSeries.classList.toggle('tamSplit', S.split);
    tailleSeries(); racine.dataset.split = S.split ? 'on' : 'off'; S.sale = true;
  });
  bIsoler.addEventListener('click', () => bIsoler.setAttribute('aria-pressed', String(bIsoler.getAttribute('aria-pressed') !== 'true')));
  curseur.addEventListener('input', () => { S.couches = V.jusqua(S.couches, Number(curseur.value)); peindrePuces(); peindreGrille(); majSon(); S.sale = true; });

  /* ── rotation, camera ── */
  bRot.addEventListener('click', () => { S.rotation = !S.rotation; bRot.setAttribute('aria-pressed', String(S.rotation)); racine.dataset.rotation = S.rotation ? 'on' : 'off'; S.sale = true; });
  racine.dataset.rotation = S.rotation ? 'on' : 'off';
  bVue.addEventListener('click', () => { S.cam = null; S.ajuste = null; S.t = 0; S.dessines = reduit() ? S.n : 0; S.pause = 0; S.sale = true; });
  bDecor.addEventListener('click', () => { S.decorOn = S.decorOn === false; bDecor.setAttribute('aria-pressed', String(S.decorOn)); bDecor.textContent = 'Context: ' + (S.decorOn ? 'on' : 'off'); S.sale = true; });
  bBoucle.addEventListener('click', () => { S.boucle = !S.boucle; bBoucle.setAttribute('aria-pressed', String(S.boucle)); bBoucle.textContent = 'Loop: ' + (S.boucle ? 'on' : 'off'); racine.dataset.boucle = S.boucle ? 'on' : 'off'; });
  /* game98 : dist 1.7 -> 4. Les positions vivent dans le cube [-1, 1] ; a 1.7 un coin passait a ~0.3 de l objectif (grossi ~5.7 x,
   *   parfois DERRIERE la camera) et un seul point faisait deborder la vue. A 4, un coin est grossi d au plus ~1.8 x ; la taille de la
   *   scene est ensuite REGLEE par le recadrage (dessiner), pas par la distance. */
  const CAM0 = { yaw: 0.6, pitch: 0.35, dist: 4, ox: 0, oy: 0 };
  /* game97 : les systemes dont la figure CLASSIQUE est plate (colonne 0 a l horizontale, colonne 1 a la verticale) partent de FACE —
   *   yaw = pitch = 0 ; la colonne 2 reste en profondeur et on tourne toujours a la main. Bifurcation (r, x), planche (x, hauteur), pistes (x, y). */
  /* game116 (Phil : « pour biologie et chimie on comprend mal les exemples ») : les courbes du temps et les plans se lisent DE FACE, comme un
   *   graphique : x = colonne 0, y = colonne 1 (l helice d ADN reste en 3-D) */
  const DE_FACE = new Set(['logistique', 'galton', 'brachistochrone',
    'dogmeCentral', 'deriveGenetique', 'enzyme', 'mendel', 'neurone', 'reactionsChaine', 'equilibreChimique', 'brusselator',
    'marcheAleatoire', 'aiguilleBuffon', 'anniversaires', 'spiraleUlam',
    /* game118 */
    'gazParfait', 'hardyWeinberg',
    /* game120 */
    'arcEnCiel', 'cordeVibrante', 'effetDoppler',
    /* game122 */
    'lignesChamp', 'circuitRC', 'pascalSierpinski',
    /* game148 */
    'apollonius',
    /* game149 */
    'haloGlace',
    /* game150 */
    'tasDeSable',
    /* game151 */
    'vergerEuclide',
    /* game152 */
    'cerclesFord',
    /* game153 */
    'fermatSteiner',
    /* game154 */
    'causticTasse',
    /* game155 */
    'papillonHofstadter',
    /* game157 */
    'dominosKasteleyn',
    /* game158 */
    'ising',
    /* game159 */
    'aztecDiamond',
    /* game160 */
    'collectionneur',
    /* game161 */
    'ruineJoueur',
    /* game162 */
    'catalanDyck',
    /* game163 */
    'partitionEuler',
    /* game164 */
    'courbeDragon',
    /* game165 */
    'theoremePick',
    /* game166 */
    'percolationLiens',
    /* game167 */
    'napoleon',
    /* game168 */
    'billardElliptique',
    /* game169 */
    'feuerbach',
    /* game170 */
    'jeuDeLaVie',
    /* game171 */
    'marcheAutoEvitante',
    /* game174 */
    'morley',
    /* game175 */
    'bale',
    /* game176 */
    'simsonDroite',
    /* game177 */
    'distinctesImpaires',
    /* game178 */
    'triangulations',
    /* game179 */
    'ramseyR33',
    /* game180 */
    'pascalHexagramme',
    /* game181 */
    'ptolemee',
    /* game182 */
    'sommesCarres',
    /* game183 */
    'equationPell',
    /* game184 */
    'nombresCarmichael',
    /* game185 */
    'theoremeWilson',
    /* game186 */
    'fonctionMertens',
    /* game187 */
    'parfaitsAmicaux',
    /* game188 */
    'nombresBernoulli',
    /* game189 */
    'problemeJosephus',
    /* game190 */
    'zeckendorf',
    /* game191 */
    'theoremeLucas',
    /* game192 */
    'calkinWilf',
    /* game193 */
    'toursHanoi',
    /* game194 */
    'regarderDire',
    /* game195 */
    'derangements',
    /* game196 */
    'nombresHarmoniques',
    /* game197 */
    'suiteCollatz',
    /* game198 */
    'routineKaprekar',
    /* game199 */
    'stirlingBell',
    /* game200 */
    'motzkinChemins',
    /* game201 */
    'periodePisano',
    /* game202 */
    'indicatriceEuler',
    /* game203 */
    'goldbachPaires',
    /* game204 */
    'frobeniusPieces',
    /* game205 */
    'schroderChemins',
    /* game206 */
    'triangleNarayana',
    /* game207 */
    'suiteRecaman',
    /* game208 */
    'suiteKolakoski',
    /* game209 */
    'suitePerrin',
    /* game210 */
    'thueMorse',
    /* game211 */
    'suitePadovan',
    /* game212 */
    'fourmiLangton',
    /* game213 */
    'codeGenetique',
    /* game214 */
    'titrageAcideFaible',
    /* game216 */
    'pileDaniell',
    /* game217 */
    'gammeTemperee',
    /* game218 */
    'entropieShannon',
    /* game219 */
    'atmosphereStandard',
    /* game220 */
    'loiZipf',
    /* game221 */
    'gutenbergRichter',
    /* game222 */
    'arrhenius',
    /* game223 */
    'mareeVivesEaux',
    /* game224 */
    'energieLiaison',
    /* game225 */
    'courbeKeeling',
    /* game226 */
    'populationMonde',
    /* game227 */
    'electronegativite',
    /* game228 */
    'hodgkinHuxley',
    /* game229 */
    'loiKleiber',
    /* game230 */
    'effetPhotoelectrique',
    /* game231 */
    'demiViesNPL',
    /* game232 */
    'choleraSnow',
    /* game233 */
    'raiesBalmer',
    /* game234 */
    'loiBoyle',
    /* game235 */
    'loiOhm',
    /* game236 */
    'especesAire',
    /* game237 */
    'michaelisMenten',
    /* game238 */
    'diffusionAlpha',
    /* game239 */
    'argonRayleigh',
    /* game240 */
    'carteSturtevant',
    /* game241 */
    'oubliEbbinghaus',
    /* game242 */
    'fievreSemmelweis',
    /* game243 */
    'densiteCavendish',
    /* game244 */
    'equivalentJoule',
    /* game245 */
    'eclipseEddington',
    /* game246 */
    'lynxHudson',
    /* game247 */
    'gouttesMillikan',
    /* game248 */
    'vieGraunt',
    /* game249 */
    'loiHubble1929',
    /* game250 */
    'loiMoseley',
    /* game251 */
    'lumiereMichelson',
    /* game252 */
    'regressionGalton',
    /* game253 */
    'aberrationBradley',
    /* game255 */
    'exclusionGause',
    /* game256 */
    'mortaliteNightingale',
    /* game257 */
    'equivalentsFaraday',
    /* game258 */
    'chaleursPetitDulong',
    /* game259 */
    'repliquesOmori',
    /* game260 */
    'survieHalley',
    /* game261 */
    'chaleurLondres',
    /* game262 */
    'motsMendenhall',
    /* game263 */
    'parallaxeBessel',
    /* game264 */
    'vitesseNyquist',
    /* game265 */
    'ondulationsYoung',
    /* game266 */
    'picLummer',
    /* game267 */
    'balanceCoulomb',
    /* game268 */
    'effetJoule',
    /* game269 */
    'critiqueReynolds',
    /* game270 */
    'filtreDarcy',
    /* game271 */
    'deplacementsPerrin',
    /* game272 */
    'aimantGauss',
    /* game273 */
    'unitesWeber',
    /* game274 */
    'tubesPoiseuille',
    /* game275 */
    'variationsHalley',
    /* game276 */
    'spiralesBeal',
    /* game277 */
    'tempsOldham',
    /* game278 */
    'fonteMacKellar',
    /* game279 */
    'syllabesKaeding',
    /* game280 */
    'tubesHagen',
    /* game281 */
    'spiraleMoseley',
    /* game282 */
    'poisMendel',
    /* game283 */
    'rayonsThomson',
    /* game284 */
    'magnitudesPogson',
    /* game285 */
    'maisDarwin',
    /* game286 */
    'emanationRutherford',
    /* game287 */
    'etherMichelson',
    /* game288 */
    'reststrahlenRubens',
    /* game289 */
    'constantesPlanck',
    /* game290 */
    'jaugesHerschel',
    /* game292 */
    'penduleKater',
    /* game297 */
    'essaisThorndike',
    /* game299 */
    'reactionDonders',
    /* game300 */
    'attentionCattell',
    /* game301 */
    'pressurePeirceJastrow',
    /* game302 */
    'extinctionPavlov',
    /* game303 */
    'weberKonig',
    /* game304 */
    'glycosuriaCannon',
    /* game305 */
    'brainBoyd',
    /* game306 */
    'allOrNoneLucas',
    /* game307 */
    'neuronsHerculanoHouzel',
    /* game308 */
    'connectomeSizes',
    /* game309 */
    'emotionsSiegel',
    /* game310 */
    'bodyMapsNummenmaa',
    /* game311 */
    'emotionWiringHCP',
    /* game123 */
    'billardPi', 'modesNormaux',
    /* game124 (les solides de Platon restent en 3-D, la vue tourne) */
    'paraboleTir',
    /* game125 */
    'carnot', 'montyHall', 'lentilleMince',
    /* game126 */
    'penduleAmplitude', 'phasesLune',
    /* game127 */
    'dureeJour', 'courseRoulante',
    /* game133 */
    'corpsNoir',
    /* game134 */
    'reseauFentes',
    /* game138 */
    'pendulesCouples',
    /* game139 */
    'tautochrone',
    /* game140 */
    'chainette',
    /* game135 */
    'refractionSnell',
    /* game136 */
    'desintegration']);
  /* de face, la colonne 2 est TOUTE en profondeur (a l ancienne dist 1.7 la pile de Galton sortait par le bas) : meme dist que CAM0 */
  const CAM_FACE = { ...CAM0, yaw: 0, pitch: 0 };
  const camBase = () => S.science && DE_FACE.has(S.science.s.id) ? CAM_FACE : CAM0;
  /* game119 (vu a l ecran : le repere « paroi droite » du gaz tombait AU MILIEU du nuage ; les courbes A, B, C a des profondeurs
   *   differentes avaient des echelles differentes) : la perspective (taille f x / (z + dist)) deforme un GRAPHIQUE. De face et tant que
   *   personne n a tourne la camera, la profondeur est aplatie a 0 (donnees ET decor) ; des qu on tourne, la 3-D revient. */
  const aplati = () => !!(S.science && DE_FACE.has(S.science.s.id) && !S.cam);
  /* game101 (Phil : « augmente la limite de dezoom ») : zoomCam (vision-inside.js, partage avec la carte) ajoute 0.15 et borne a 6 —
   *   depuis dist 4 (game98) il ne restait presque rien. Ici : x 1.15 par cran, de 0.5 a 60 (15 x plus loin que la vue de depart) ;
   *   la carte garde son propre zoom. */
  const DIST_MIN = 0.5, DIST_MAX = 60;
  const zoomTam = (cam, dz) => { const c = cam || camBase(); return Number.isFinite(dz) && dz !== 0 ? { ...c, dist: Math.max(DIST_MIN, Math.min(DIST_MAX, c.dist * 1.15 ** dz)) } : c; };
  const ptrs = new Map(); let pinch = null;
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, shift: e.shiftKey || e.button === 2 }); });
  cv.addEventListener('pointerup', (e) => {
    /* game79 : un TAP (pas un glisser) montre la bulle des valeurs — le survol n existe pas au doigt */
    const p = ptrs.get(e.pointerId);
    if (p && Math.abs(e.clientX - (p.x0 ?? p.x)) < 6 && Math.abs(e.clientY - (p.y0 ?? p.y)) < 6) survolScene(e);
    ptrs.delete(e.pointerId); pinch = null;
  });
  cv.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); pinch = null; });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) { survolScene(e); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch !== null) S.cam = zoomTam(S.cam, (pinch - d) / 30);
      pinch = d; S.cam = navGesture(S.cam, camBase(),{ dx: dx / 2, dy: dy / 2, pan: true });
    } else S.cam = navGesture(S.cam, camBase(),{ dx, dy, pan: p.shift });
    S.sale = true;
  });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); S.cam = zoomTam(S.cam, Math.sign(e.deltaY)); S.sale = true; }, { passive: false });

  /* ── dessin 3-D ── */
  let proj = null, projSx = null, projSy = null, dominant = null;
  function positions() {
    const v = positionsBrutes();
    if (!aplati()) return v;
    const f = new Float32Array(v.length); for (let i = 0; i < v.length; i += 3) { f[i] = v[i]; f[i + 1] = v[i + 1]; f[i + 2] = 0; } return f;
  }
  function positionsBrutes() {
    if (S.science && S.corps) return S.corps.vue; /* game78 : la vue « corps » (les couches n y melangent rien) */
    if (S.science && S.P.melange) return TS.vueMelangee(V.projeterVivant({ z: S.z, n: S.n, D: S.D, actives: S.couches.actives, angles: S.P.angles, t: S.t }), S.n, S.P.melange);
    const tous = S.couches.actives.every(Boolean);
    /* game77 : un NUAGE stocke est trie (Morton) — ses index ne sont plus le temps : couleurs et survol visaient d autres points.
     *   Pour un nuage on dessine la projection dans l ordre du temps (la meme geometrie). */
    const nuageStocke = S.P.ordre === 1;
    if (!nuageStocke && tous && S.t === 0 && S.stocke && S.stocke.length === S.n * 3) return S.stocke; /* arrete, toutes couches : l oeuvre STOCKEE */
    const vif = V.projeterVivant({ z: S.z, n: S.n, D: S.D, actives: S.couches.actives, angles: S.P.angles, t: S.t });
    /* game77 : la vue vivante d un MELANGE garde son motif (avant : la porteuse seule des qu une couche etait eteinte ou que ca tournait) */
    return !S.science && (S.P.operateur === 'somme' || S.P.operateur === 'composition') ? M.combinerVue(vif, S.P) : vif;
  }
  /* 2026-11-08 (Phil: "add lines to TAM, not only points") : a subject MAY return segments (tam-vue.js#projeterSegments) ; the plain path
   *   only (not the bodies, a blend, or a film: their views are not the projection of brut). No segments -> null -> nothing changes. */
  let segCache = null;
  function segmentsScene() {
    const o = S.o;
    if (!S.science || !o || !Array.isArray(o.segments) || !o.segments.length || !o.brut || S.corps || (S.P && S.P.melange) || filmDe()) return null;
    const cle = [S.t, S.couches.actives.join(','), (S.P.angles || []).join(',')].join('|');
    if (segCache && segCache.o === o && segCache.cle === cle) return segCache.sv;
    let sv = null;
    try { const { m, k } = TS.echelleIso(o.brut, S.n, S.D, S.science.s.id); sv = V.projeterSegments({ segments: o.segments, m, k, z: S.z, n: S.n, D: S.D, actives: S.couches.actives, angles: S.P.angles, t: S.t }); } catch (_) { sv = null; }
    segCache = { o, cle, sv }; return sv;
  }
  /* the same guard as segmentsScene (plain path only), without projecting : indexed segments are drawn from the drawn points */
  function indexables() { const o = S.o; return !!(S.science && o && Array.isArray(o.segments) && o.segments.length && o.brut && !S.corps && !(S.P && S.P.melange) && !filmDe()); }
  /* 2026-11-09 (Phil: "parts of the brain, readable by people who don't understand"): a subject MAY colour its points by class
   *   (o.pointClasses, one per point, into o.pointPalette [{ color, name }]); same plain-path guard as the lines (points in the subject's order) ;
   *   otherwise null and the direction colours stay (every other subject) */
  function classesPoints() {
    const o = S.o;
    if (!S.science || !o || !o.pointClasses || o.pointClasses.length !== S.n || !Array.isArray(o.pointPalette) || !o.pointPalette.length || S.corps || (S.P && S.P.melange) || filmDe()) return null;
    return { classes: o.pointClasses, palette: o.pointPalette };
  }
  function dimDominante() {
    const d = new Int8Array(S.n), act = S.couches.actives;
    for (let i = 0; i < S.n; i++) { let b = -1, m = -1; for (let j = 0; j < S.D; j++) if (act[j]) { const v = Math.abs(S.z[i * S.D + j]); if (v > m) { m = v; b = j; } } d[i] = b; }
    return d;
  }
  function dessiner() {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1), L = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== L || cv.height !== H) { cv.width = L; cv.height = H; }
    const g = cv.getContext('2d'); g.fillStyle = '#0b0d17'; g.fillRect(0, 0, L, H);
    if (!S.o) return;
    if (S.dense && !S.science) { proj = null; projSx = null; dessinerDense(g, L, H, dpr); return; }
    const cam = S.cam || camBase(), pos = positions(); proj = pos; dominant = dimDominante();
    const corps = S.science && S.corps ? S.corps : null;
    if (corps) for (let i = 0; i < S.n; i++) dominant[i] = Math.min(corps.corps - 1, Math.floor(i / corps.par)); /* une couleur par corps */
    const sc = Math.min(L, H) * 0.42, n = Math.min(S.n, Math.max(2, Math.floor(S.dessines)));
    projSx = new Float32Array(S.n); projSy = new Float32Array(S.n);
    const pz = new Float32Array(S.n);
    /* la camera du cerveau (navGesture) : dist en multiples de l echelle de la scene, pan en px ecran */
    const camPx = { ...cam, dist: cam.dist * sc, ox: (cam.ox || 0) * dpr, oy: (cam.oy || 0) * dpr };
    /* game98 (balayage des 99 vues, pixels relus : 29 touchaient un bord — Lotka-Volterra, Kepler, Ising, SIR, chaleur...) : la taille a
     *   l ecran vaut f x / (z + dist), sc s y simplifie ; la cause etait la PERSPECTIVE a dist 1.7 (voir CAM0), pas la largeur des
     *   donnees. Recadrage : la projection de TOUTE l oeuvre remplit la toile a 8 px du bord (reduit, ou agrandit au plus 4 x). Calcule une
     *   fois par oeuvre et par taille de toile (le zoom ne tremble pas ; la molette reste libre), refait par « Reset view » ; donnees, decor,
     *   echelle et survol passent par la meme fonction, la barre d echelle reste juste. Une rotation des plans caches (D > 3) peut
     *   deborder un peu ensuite. */
    const cx0 = L / 2 + camPx.ox, cy0 = H / 2 + camPx.oy;
    if (S.ajuste == null || S.ajusteCle !== S.o || S.ajusteL !== L || S.ajusteH !== H) {
      let m = 0; const mx = Math.max(1, L / 2 - 8 * dpr), my = Math.max(1, H / 2 - 8 * dpr);
      for (let i = 0; i < S.n; i++) {
        const u = projectCam(camPx, pos[3 * i] * sc, -pos[3 * i + 1] * sc, pos[3 * i + 2] * sc, L, H, 1);
        if (u && Number.isFinite(u.sx) && Number.isFinite(u.sy)) m = Math.max(m, Math.abs(u.sx - cx0) / mx, Math.abs(u.sy - cy0) / my);
      }
      S.ajuste = m > 0 ? Math.min(4, 1 / m) : 1; S.ajusteCle = S.o; S.ajusteL = L; S.ajusteH = H; racine.dataset.recadrage = S.ajuste.toFixed(3);
    }
    const projeter = (x, y, z) => { const u = projectCam(camPx, x, y, z, L, H, 1);
      if (u && S.ajuste !== 1) { u.sx = cx0 + (u.sx - cx0) * S.ajuste; u.sy = cy0 + (u.sy - cy0) * S.ajuste; }
      return u; };
    for (let i = 0; i < S.n; i++) {
      const u = projeter(pos[3 * i] * sc, -pos[3 * i + 1] * sc, pos[3 * i + 2] * sc);
      projSx[i] = u ? u.sx : NaN; projSy[i] = u ? u.sy : NaN; pz[i] = u ? u.zc : 0;
    }
    /* 2026-11-08 : the subject's lines (if any), UNDER the points, through the same camera ; one stroke per colour and weight bucket */
    /* 2026-11-08 (Phil's production screenshot) : segments that name their points (ia, ib) are drawn between the DRAWN positions of those
     *   points (projSx, projSy just above, whatever path gave pos: stored view, live, rotated, layers off) : a line cannot leave its points */
    { const si = indexables() ? V.segmentsIndexes(S.o.segments, S.n) : null;
      if (si) racine.dataset.segments = String(V.dessinerSegmentsIndexes(g, si, projSx, projSy, { dpr }));
      else { const sv = segmentsScene(); racine.dataset.segments = sv ? String(V.dessinerSegments(g, sv, projeter, { sc, dpr, aplati: aplati() })) : '0'; } }
    const nuage = S.P.ordre === 1 || !!(S.science && TS.estNuage(S.P, S.o));
    /* game77 : un nuage se dessinait en points de 0,6 px a peine visibles — des points ronds de ~2 px, plus lisibles */
    g.lineWidth = nuage ? Math.max(2, dpr * 2.2) : Math.max(1, dpr * 1.1); g.lineCap = 'round';
    /* glow : un halo de la couleur du trait (shadowBlur), sur des chemins groupes par couleur — quelques dizaines de stroke, pas un par point */
    g.shadowBlur = 7 * dpr;
    let cour = -2;
    g.beginPath();
    const film = filmDe();
    if (film) {
      /* game80 : le FILM — l image du moment en clair, les 2 precedentes en traine pale (on voit le mouvement), jamais les images futures */
      const k = imageCourante(), r = Math.max(1.6, dpr * 2);
      for (let q = Math.max(0, k - 2); q <= k; q++) {
        g.globalAlpha = q === k ? 0.95 : 0.18 * (q - k + 3); g.fillStyle = g.shadowColor = V.couleurDim(q % 12);
        const a = film.debuts[q], b = a + film.tailles[q];
        for (let i = a; i < b; i++) if (Number.isFinite(projSx[i])) g.fillRect(projSx[i] - r / 2, projSy[i] - r / 2, r, r);
      }
      g.globalAlpha = 1;
    }
    /* 2026-11-09 : points coloured by the subject's classes (the brain's parts) : one path per class, the same dot as a cloud below */
    const pc = corps || film ? null : classesPoints();
    racine.dataset.classesPoints = pc ? String(pc.palette.length) : '';
    if (pc) {
      /* larger dots than a plain cloud: the colour IS the information here (which part), it must be seen over the lines */
      g.stroke(); g.globalAlpha = 0.9; const lw = g.lineWidth; g.lineWidth = Math.max(3, dpr * 3.4);
      for (let c = 0; c < pc.palette.length; c++) {
        g.beginPath(); g.strokeStyle = g.shadowColor = pc.palette[c].color;
        for (let i = 0; i < n; i++) if (pc.classes[i] === c && Number.isFinite(projSx[i])) { g.moveTo(projSx[i], projSy[i]); g.lineTo(projSx[i] + 0.6, projSy[i]); }
        g.stroke();
      }
      g.globalAlpha = 1; g.lineWidth = lw; g.beginPath();
    }
    for (let i = 1; i < (corps || film || pc ? 0 : n); i++) { /* game78 : les corps ont leur propre boucle (plus bas) ; game80 : le film aussi */
      if (!Number.isFinite(projSx[i]) || !Number.isFinite(projSx[i - 1])) continue;
      const c = dominant[i];
      if (c !== cour) { g.stroke(); g.beginPath(); g.strokeStyle = g.shadowColor = c >= 0 ? V.couleurDim(c) : '#556'; g.globalAlpha = 0.8; cour = c; g.moveTo(projSx[i - 1], projSy[i - 1]); }
      if (nuage) { g.moveTo(projSx[i], projSy[i]); g.lineTo(projSx[i] + 0.6, projSy[i]); } else g.lineTo(projSx[i], projSy[i]);
    }
    g.stroke(); g.globalAlpha = 1;
    /* debut et fin : le premier point (t = 0) et le dernier trace ; pendant le trace, une tete lumineuse avance */
    /* game89 (Phil, Unruh : « Past horizon » et « Future horizon » ecrits l un SUR l autre) : chaque libelle de l image passe par ici ;
     *   un texte qui chevaucherait un texte deja pose descend d une ligne (8 essais) — plus jamais deux libelles superposes */
    /* (balayage des 98 vues, game89) : un MEME nom n est ecrit qu une fois par image (les 4 cotes d une boite, les 2 cotes d un tunnel
     *   portent le meme libelle) ; sans place libre apres 8 essais, le libelle n est PAS ecrit (il reste dans la legende et la bulle) */
    const poses = [], hL = 13 * dpr, ecrits = new Set();
    const ecrire = (txt, x, y) => {
      if (ecrits.has(txt)) return;
      /* game91 (balayage a 375 px : 71 vues / 98 en defaut) : le libelle reste DANS le canvas — x ramene pour que le texte tienne en
       *   largeur ; une ligne hors champ (le placeur poussait des libelles a y = 698 sous un canvas de 635) est remplacee par la plus
       *   proche a l interieur */
      const Wc = g.canvas ? g.canvas.width : Infinity, Hc = g.canvas ? g.canvas.height : Infinity;
      /* game93 (seuil d immunite de SIR, plus large que tout le canvas a 375 px) : un libelle trop long est raccourci avec « … » jusqu a
       *   tenir (le texte entier reste dans la legende) */
      let aff = txt, w = g.measureText(aff).width;
      if (w > Wc - 4) { while (aff.length > 4 && g.measureText(aff + '…').width > Wc - 4) aff = aff.slice(0, -1); aff += '…'; w = g.measureText(aff).width; }
      x = Math.max(2, Math.min(x, Wc - w - 2));
      const dedans = (yy) => Math.min(Hc - 3, Math.max(hL - 3, yy));
      /* game90 : quand une place est prise, on essaie JUSTE AU-DESSUS et JUSTE AU-DESSOUS de ce qui gene (le banc : le panneau du bas
       *   monte jusqu a 40 % de la scene, 3 lignes de remontee n y suffisaient pas) ; 16 essais au plus, le plus proche d abord */
      const essais = [dedans(y)], vus = new Set();
      for (let k = 0; k < essais.length && k < 16; k++) {
        const yy = dedans(essais[k]); if (vus.has(yy)) continue; vus.add(yy);
        const b = [x - 1, yy - hL + 3, x + w + 1, yy + 3]; /* hauteur = le pas hL (14 px pour un pas de 13 perdait une place sur deux) */
        const q = poses.find((p) => b[0] < p[2] && b[2] > p[0] && b[1] < p[3] && b[3] > p[1]);
        if (!q) { poses.push(b); ecrits.add(txt); g.fillText(aff, x, yy); return; }
        /* +-1 px (balayage mobile : avec dpr = 2.0000000298, q[3] + hL - 3 - hL + 3 retombait SOUS q[3] d un arrondi -> « chevauche »,
         *   les deux memes essais en boucle, et l etiquette d echelle de 5 vues n etait JAMAIS ecrite) */
        const dessous = q[3] + hL - 3 + 1, dessus = q[1] - 3 - 1;
        if (Math.abs(dessous - y) <= Math.abs(dessus - y)) essais.push(dessous, dessus); else essais.push(dessus, dessous);
      }
    };
    const point = (i, coul, r, txt) => {
      if (!Number.isFinite(projSx[i])) return;
      g.shadowColor = coul; g.shadowBlur = 14 * dpr; g.fillStyle = coul; g.beginPath(); g.arc(projSx[i], projSy[i], r * dpr, 0, 2 * Math.PI); g.fill();
      if (txt) { g.shadowBlur = 0; g.font = (11 * dpr) + 'px system-ui,sans-serif'; ecrire(txt, projSx[i] + 7 * dpr, projSy[i] - 6 * dpr); }
    };
    /* game90 : les surcouches HTML posees SUR le canvas (la ligne du haut, le panneau des valeurs en bas) sont des places prises —
     *   un libelle de la scene ne finit plus dessous (pixels du canvas : rectangle de l element ramene a la taille interne du canvas) */
    { const rc = cv.getBoundingClientRect(), kx = rc.width > 0 ? cv.width / rc.width : 1, ky = rc.height > 0 ? cv.height / rc.height : 1;
      for (const sur of [info, varsScene]) {
        if (!sur || sur.hidden || !sur.textContent) continue;
        const r = sur.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) continue;
        poses.push([(r.left - rc.left) * kx, (r.top - rc.top) * ky, (r.right - rc.left) * kx, (r.bottom - rc.top) * ky]);
      } }
    /* game77 : un nuage n a ni debut ni fin (points tires, pas un chemin) : pas de reperes start/end */
    if (corps) {
      /* game78 : chaque corps (planete, etoile, rayon) avance EN MEME TEMPS, sa couleur, un point lumineux a sa position du moment */
      const lim = Math.max(2, Math.min(corps.par, Math.floor(n / S.n * corps.par))), noms = nomsCorpsCourants();
      for (let b = 0; b < corps.corps; b++) {
        if (S.corpsActifs && !S.corpsActifs[b]) continue; /* game80 : un corps cache n est pas trace */
        const a = b * corps.par, col = V.couleurDim(b);
        g.strokeStyle = g.shadowColor = col; g.shadowBlur = 7 * dpr; g.globalAlpha = 0.85; g.beginPath();
        let ouvert = false;
        for (let i = a; i < a + lim && i < S.n; i++) {
          if (!Number.isFinite(projSx[i])) { ouvert = false; continue; }
          if (!ouvert) { g.moveTo(projSx[i], projSy[i]); ouvert = true; } else g.lineTo(projSx[i], projSy[i]);
        }
        g.stroke(); g.globalAlpha = 1;
        /* game80 : le NOM du corps ecrit a sa position du moment (Mercury, Earth, Halley…) */
        point(Math.min(S.n - 1, a + lim - 1), col, 4.5, noms[b] || null);
      }
      /* le corps central (Soleil, etoile, trou noir) a l origine du repere */
      const nomCentre = TS.CENTRE[S.science.s.id];
      if (nomCentre && corps.origine) {
        const o = corps.origine, u = projeter(o[0] * sc, -o[1] * sc, o[2] * sc);
        if (u) {
          const noir = /black hole|throat/.test(nomCentre), coul = noir ? '#000000' : '#ffd36b';
          g.shadowColor = noir ? '#b48cff' : '#ffd36b'; g.shadowBlur = 18 * dpr; g.fillStyle = coul; g.beginPath(); g.arc(u.sx, u.sy, 6 * dpr, 0, 2 * Math.PI); g.fill();
          if (noir) { g.strokeStyle = '#b48cff'; g.lineWidth = 1.5 * dpr; g.stroke(); }
          g.shadowBlur = 0; g.fillStyle = '#e8ecf5'; g.font = (11 * dpr) + 'px system-ui,sans-serif'; ecrire(nomCentre, u.sx + 9 * dpr, u.sy + 4 * dpr);
        }
      }
    }
    if (!nuage && !corps && !film) {
      point(0, '#5dffa0', 4, 'start · t = 0');
      /* game80 : une fin PHYSIQUE (capture a l horizon, fuite, fusion…) est nommee */
      const fin = S.science && S.o && S.o.fin && !Array.isArray(S.o.fin) ? S.o.fin : null;
      if (n >= S.n) point(S.n - 1, '#ff6b9a', 4, fin && fin.evenement ? 'end · ' + fin.evenement : 'end · t = ' + (S.n - 1));
      else point(n - 1, '#ffffff', 3.2, null);
    }
    /* game82 : le CONTEXTE (Soleil, horizon, couches de la Terre, plaques, fentes…), sous les etiquettes, dans la meme camera */
    if (S.decorOn !== false && S.science && !(S.P && S.P.melange)) {
      let dv = []; try { dv = decorVue(); } catch (_) { dv = []; }
      const ecran = (p) => projeter(p[0] * sc, -p[1] * sc, aplati() ? 0 : p[2] * sc);
      g.font = (11 * dpr) + 'px system-ui,sans-serif';
      for (const d of dv) {
        const col = d.q.couleur || '#ffffff';
        if (d.vue) {
          /* vu a l ecran (game86) : « Sun Sun » — le corps central est deja dessine et nomme (TS.CENTRE) ; le decor ne le repete pas */
          if (S.corps && d.q.libelle && d.q.libelle === TS.CENTRE[S.science.s.id]) continue;
          const u = ecran(d.vue[0]); if (!u) continue;
          g.shadowColor = col; g.shadowBlur = 14 * dpr; g.fillStyle = col; g.beginPath(); g.arc(u.sx, u.sy, 5 * dpr, 0, TOUR); g.fill();
          g.shadowBlur = 0; g.fillStyle = '#e8ecf5'; if (d.q.libelle) ecrire(d.q.libelle, u.sx + 8 * dpr, u.sy - 6 * dpr);
          continue;
        }
        let premier = null, dernier = null;
        /* game86 (vu a l ecran : posee dans la scene, la barre tombait sur le bord du canvas selon l angle de vue) : la barre d echelle
         *   est MESUREE dans la scene (L projete au centre des donnees, a chaque image : juste quand on tourne ou zoome) et DESSINEE a une
         *   place fixe, en haut a droite, comme une regle ; « ≈ » : en perspective la longueur depend de la profondeur */
        if (d.q.echelle) {
          const ps = (d.lignesVue && d.lignesVue[0]) || [], u0 = ps.length ? ecran(ps[0]) : null, u1 = ps.length ? ecran(ps[ps.length - 1]) : null;
          const l0 = u0 && u1 ? Math.hypot(u1.sx - u0.sx, u1.sy - u0.sy) : 0, Wc = g.canvas.width;
          /* game99 (mesure : 5 barres absentes, 4 a 8 px — le quart de la largeur des donnees ne suit pas l echelle de l ecran ; Kepler 23 px) :
           *   les pixels par unite MESURES dans la scene (l0 / longueur), puis une longueur ronde qui fait ~20 % de la toile — jamais plus
           *   longue que les donnees elles-memes (tsunami disait « 20000 km » pour un bassin de 10100 km) */
          const parUnite = d.q.longueur > 0 ? l0 / d.q.longueur : 0;
          const Lr = parUnite > 0 ? longueurRonde(Math.min(0.2 * Wc / parUnite, d.q.etendue > 0 ? d.q.etendue : Infinity)) : null, l = Lr ? Lr * parUnite : 0;
          racine.dataset.echellePx = (l / dpr).toFixed(1);
          if (l >= 8 * dpr && l <= 0.6 * Wc) {
            const x1 = Wc - 16 * dpr, x0 = x1 - l, y = 30 * dpr;
            g.strokeStyle = col; g.lineWidth = Math.max(1, 2 * dpr); g.globalAlpha = 0.95; g.setLineDash([]);
            g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); for (const x of [x0, x1]) { g.moveTo(x, y - 5 * dpr); g.lineTo(x, y + 5 * dpr); } g.stroke();
            /* l etiquette de l echelle reserve sa place (les libelles de la scene la contournent) */
            const te = '≈ ' + ecrireLongueur(Lr) + ' ' + d.q.unite; g.globalAlpha = 1; g.fillStyle = col; ecrire(te, x1 - g.measureText(te).width, y - 9 * dpr);
          }
          continue;
        }
        g.strokeStyle = col; g.lineWidth = Math.max(1, dpr * (d.q.largeur ? 2.5 : 1.4)); g.globalAlpha = 0.75; g.setLineDash(d.q.type === 'plan' ? [5 * dpr, 4 * dpr] : []);
        for (const ligne of d.lignesVue || []) {
          g.beginPath(); let ouvert = false;
          for (const p of ligne) { const u = ecran(p); if (!u) { ouvert = false; continue; } if (!premier) premier = u; dernier = u; if (!ouvert) { g.moveTo(u.sx, u.sy); ouvert = true; } else g.lineTo(u.sx, u.sy); }
          if (d.e.plein && ouvert) { g.globalAlpha = 0.18; g.fillStyle = col; g.fill(); g.globalAlpha = 0.75; }
          g.stroke();
        }
        g.setLineDash([]); g.globalAlpha = 1;
        /* un SEGMENT est nomme a son bout eloigne (deux segments partis du meme point — les horizons d Unruh — ne s ecrivent plus au meme endroit) */
        const ancre = d.q.type === 'segment' && dernier ? dernier : premier;
        if (ancre && d.q.libelle && !d.q.muet) { g.fillStyle = col; ecrire(d.q.libelle, ancre.sx + 6 * dpr, ancre.sy - 4 * dpr); }
      }
    }
    /* le son allume : le point qu il joue, sur la courbe (le meme index que la frequence) */
    if (S.son && S.tete !== null && n >= S.n) point(S.tete, '#ffffff', 4.5, 't = ' + S.tete);
    g.shadowBlur = 0;
    if (S.survol !== null && Number.isFinite(projSx[S.survol])) { g.fillStyle = '#fff'; g.beginPath(); g.arc(projSx[S.survol], projSy[S.survol], 5 * dpr, 0, 2 * Math.PI); g.fill(); }
    if (corps) { info.textContent = corps.corps + ' bodies in the same space, one colour each · drag to orbit'; return; }
    if (film) { info.textContent = 'A film: ' + film.images + ' moments · moment ' + (imageCourante() + 1) + ' of ' + film.images + ' (' + film.tailles[imageCourante()] + ' points)'; return; }
    info.textContent = S.D + '-D · ' + V.dimsVisibles(S.couches).length + ' layers on' + (S.rotation && S.D > 3 ? ' · hidden planes turning' : '') + (S.t === 0 && S.stocke && S.couches.actives.every(Boolean) ? ' · stored view' : ' · live view');
  }
  /* game77 (Phil : « De Jong reste le meme en changeant les variables ») : une map 2-D se lit DE FACE et en DENSITE — 40 000 points
   *   additionnes en lumiere (composite « lighter »), la couleur suit l ordre d iteration. Zoom et pan de la camera s appliquent ; la
   *   rotation 3-D, non (une map n a que 2 dimensions). Vue seulement : l oeuvre stockee reste ses 1 500 points. */
  function dessinerDense(g, L, H, dpr) {
    const d = S.dense, N = d.length / 2, cam = S.cam || CAM0;
    /* le cadre : quantiles 0,2 % - 99,8 % (quelques points isoles ecrasaient la forme au centre), calcules une fois par nuage */
    if (!S.denseCadre || S.denseCadre.d !== d) {
      const xs = new Float32Array(N), ys = new Float32Array(N); for (let i = 0; i < N; i++) { xs[i] = d[2 * i]; ys[i] = d[2 * i + 1]; }
      xs.sort(); ys.sort(); const q = (a, p) => a[Math.min(N - 1, Math.max(0, Math.floor(p * (N - 1))))];
      S.denseCadre = { d, x0: q(xs, 0.002), x1: q(xs, 0.998), y0: q(ys, 0.002), y1: q(ys, 0.998) };
    }
    const { x0, x1, y0, y1 } = S.denseCadre;
    const ech = Math.min(L, H) * 0.44 / Math.max(1e-9, Math.max(x1 - x0, y1 - y0) / 2) * (CAM0.dist / (cam.dist || CAM0.dist));
    const cx = L / 2 + (cam.ox || 0) * dpr, cy = H / 2 + (cam.oy || 0) * dpr, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const n = Math.min(N, Math.max(2, Math.floor(S.dessines / S.n * N))), r = Math.max(1, dpr * 0.9);
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.22;
    const cols = [V.couleurDim(0), V.couleurDim(1), V.couleurDim(2)];
    for (let k = 0; k < 3; k++) {
      g.fillStyle = cols[k];
      for (let i = k; i < n; i += 3) g.fillRect(cx + (d[2 * i] - mx) * ech - r / 2, cy - (d[2 * i + 1] - my) * ech - r / 2, r, r);
    }
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    info.textContent = '2-D map · ' + n.toLocaleString('en-US') + ' iterations shown (view only; the work stores ' + S.n + ')';
  }
  function survolScene(e) {
    if (!projSx) { bulle.hidden = true; return; }
    const r = cv.getBoundingClientRect(), k = cv.width / r.width;
    const i = V.indexProche(projSx, projSy, (e.clientX - r.left) * k, (e.clientY - r.top) * k, 16 * k);
    if (i !== S.survol) { S.survol = i; S.sale = true; peindreSurvol(); }
    peindreBulle(i, e.clientX - r.left, e.clientY - r.top, r.width);
  }
  /* ── game82 : le LIEN de partage — #tam=<base64url(JSON)> : le genre (attracteur / science / formule) et ses params complets ;
   *   rien de secret (ni wallet, ni note : le minteur est retire), rejoue a l identique par n importe qui ── */
  const b64u = (s) => { const b = new TextEncoder().encode(s); let t = ''; for (const x of b) t += String.fromCharCode(x); return btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const deB64u = (s) => { const t = atob(String(s).replace(/-/g, '+').replace(/_/g, '/')); return new TextDecoder().decode(Uint8Array.from(t, (c) => c.charCodeAt(0))); };
  function etatPartage() {
    if (!S.P) return null;
    if (S.science && S.science.s.id === 'formule') return { k: 'form', p: S.P.params };
    if (S.science) { const { minteur: _m, note: _n, graine: _g, ...P } = S.P; return { k: 'sci', p: P }; }
    const { minteur: _m, ...P } = S.P; return { k: 'att', p: P };
  }
  bLien.addEventListener('click', async () => {
    const e = etatPartage(); if (!e) return;
    const url = location.origin + location.pathname + '#tam=' + b64u(JSON.stringify(e));
    try { await navigator.clipboard.writeText(url); bLien.textContent = 'Link copied'; } catch (_) { bLien.textContent = 'Copy failed — the link is in the address bar'; history.replaceState(null, '', url); }
    setTimeout(() => { bLien.textContent = 'Copy a link to this work'; }, 2500);
  });
  /* a l ouverture : un lien #tam= rouvre l oeuvre (params bornes par les modules : un lien trafique ne fait que ce qu un curseur ferait) */
  function ouvrirLien() {
    const m = /#tam=([A-Za-z0-9_-]{1,8000})/.exec(location.hash || ''); if (!m) return false;
    let e; try { e = JSON.parse(deB64u(m[1])); } catch (_) { etatLigne.textContent = 'This link could not be read.'; return false; }
    if (!e || typeof e !== 'object' || !e.p || typeof e.p !== 'object') return false;
    if (e.k === 'sci' && typeof e.p.science === 'string' && SYSTEMES_SCI.some((s) => s.id === e.p.science)) {
      const s = SYSTEMES_SCI.find((x) => x.id === e.p.science);
      selGroupe.value = groupeDe(s); peindreGroupe(); selSys.value = s.id;
      chargerScience(s.id, e.p.params || {}, { melange: e.p.melange || null }); return true;
    }
    if (e.k === 'form') { selGroupe.value = 'formule'; peindreGroupe(); selMode.value = e.p.mode || 'courbe'; peindreExpressions(F.normaliserSpec(e.p)); chargerFormule(F.normaliserSpec(e.p)); return true; }
    if (e.k === 'att' && typeof e.p.famille === 'string') { selGroupe.value = 'attracteurs'; peindreGroupe(); try { regler(e.p); return true; } catch (_) { return false; } }
    return false;
  }
  /* ── game82 : les VRAIES valeurs de l oeuvre (avant toute mise a l echelle), une ligne par point, colonnes nommees par la legende ── */
  bCsv.addEventListener('click', () => {
    if (!S.o || !S.o.brut) return;
    const D = S.D, b = S.o.brut; let noms = null;
    try { const L = S.leg && S.leg.legende(S.science ? S.science.s.id : '__attracteur', (S.P && S.P.params) || {}); noms = L && L.colonnes && L.colonnes.length === D ? L.colonnes : null; } catch (_) { noms = null; }
    const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';
    const lignes = [['index', ...(noms || Array.from({ length: D }, (_, j) => 'x' + (j + 1)))].map(q).join(',')];
    for (let i = 0; i < S.n; i++) { const r = [i]; for (let j = 0; j < D; j++) r.push(b[i * D + j]); lignes.push(r.join(',')); }
    const nom = 'tam-' + (S.science ? S.science.s.id : (S.P && S.P.famille) || 'oeuvre') + '.csv';
    const a = el('a', { href: URL.createObjectURL(new Blob([lignes.join('\n')], { type: 'text/csv' })), download: nom });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });
  /* ── game80 : la legende (tam-legendes.js, chargee a part : son absence n empeche rien) ── */
  /* (le module est garde dans S.leg : peindreLegende peut etre appelee avant cette ligne, sans zone morte de `let`) */
  import('./tam-legendes.js').then((m) => { S.leg = m; peindreLegende(); }).catch(() => { S.leg = null; });
  function peindreLegende() {
    const id = S.science ? S.science.s.id : S.P ? '__attracteur' : null;
    let L = null; try { L = S.leg && id ? S.leg.legende(id, (S.P && S.P.params) || {}) : null; } catch (_) { L = null; }
    if (!L) { legende.hidden = true; return; }
    legende.hidden = false;
    const ligne = (k, v) => el('p', { class: 'tamDoux' }, el('b', { text: k + ' ' }), document.createTextNode(v));
    /* 2026-11-09 : with a colour key by part (L.pointColours), a column is not a colour any more : no swatch beside the columns */
    const parts = Array.isArray(L.pointColours) && L.pointColours.length ? L.pointColours : null;
    const cols = (L.colonnes || []).map((c, j) => el('li', {}, ...(parts ? [] : [el('i', { class: 'tamPastille', style: 'background:' + V.couleurDim(j) })]), document.createTextNode((parts ? '' : ' ') + 'x' + (j + 1) + ' — ' + c)));
    const cle = parts ? [el('p', { class: 'tamDoux' }, el('b', { text: 'Colour of a dot = its part of the brain:' })),
      el('ul', { class: 'tamPayListe', id: 'tamPartsKey' }, ...parts.map((p) => el('li', {}, el('i', { class: 'tamPastille', style: 'background:' + p.color }), el('b', { text: ' ' + p.name }), document.createTextNode(': ' + p.knownFor))))] : [];
    legende.replaceChildren(el('summary', { text: 'What you are seeing' + (L.titre ? ': ' + L.titre : '') }),
      /* 09/11 (Phil: "an interactive map of the human brain, readable by anyone"): the same data as a map to visit, part by part */
      ...(id === 'emotionWiringHCP' ? [el('p', { class: 'tamDoux' }, el('a', { href: 'human-brain.html', id: 'tamCarteCerveau', text: 'Open the brain map: visit its parts, its emotions and its live connections →' }))] : []),
      ...(L.enUnePhrase ? [ligne('In one sentence:', L.enUnePhrase)] : []),
      ...(cols.length ? [el('p', { class: 'tamDoux' }, el('b', { text: 'Each value of a point:' })), el('ul', { class: 'tamPayListe' }, ...cols)] : []),
      ...(L.couleurs ? [ligne('Colours:', L.couleurs)] : []),
      ...cle,
      ...((L.aRegarder || []).length ? [el('p', { class: 'tamDoux' }, el('b', { text: 'What to notice:' })), el('ul', { class: 'tamPayListe' }, ...L.aRegarder.map((t) => el('li', { text: t })))] : []),
      ...(L.fin ? [ligne('How it ends:', L.fin)] : []));
  }
  /* ── game82 : les elements de CONTEXTE, passes par la MEME transformation que les donnees (sinon le Soleil ne tomberait pas a sa place).
   *   Espace « brut » : z = (x - moyenne) x k (standardiserIso), projection vivante (memes couches, angles, t), puis le cadrage des
   *   DONNEES seules (le decor ne recadre jamais l oeuvre). Espace « corps3 » : la normalisation de vueCorps (DEC.normaliserCorps). */
  const TOUR = 2 * Math.PI;
  /* deux directions orthogonales a une normale (Gram-Schmidt sur les axes) — pour tracer un cercle ou un plan en D dimensions */
  function base2(normale, D) {
    const nz = Math.hypot(...normale) || 1, nrm = normale.map((x) => x / nz), sortie = [];
    for (let ax = 0; ax < D && sortie.length < 2; ax++) {
      let v = Array.from({ length: D }, (_, j) => (j === ax ? 1 : 0));
      const pr = (u, w) => u.reduce((s, x, j) => s + x * w[j], 0);
      v = v.map((x, j) => x - pr(v, nrm) * nrm[j]); for (const u of sortie) { const c = pr(v, u); v = v.map((x, j) => x - c * u[j]); }
      const l = Math.hypot(...v); if (l > 1e-9) sortie.push(v.map((x) => x / l));
    }
    return sortie;
  }
  /* un objet du decor -> une liste de polylignes (points dans l espace de l objet) */
  function echantillonner(q, D) {
    const c = q.centre, aj = (u, v, a, b) => c.map((x, j) => x + a * u[j] + b * v[j]);
    if (q.type === 'point') return { pts: [c], point: true };
    if (q.type === 'segment') return { pts: [q.a, q.b] };
    if (q.type === 'cercle' || q.type === 'sphere') {
      const [u, v] = q.type === 'cercle' && q.normale ? base2(q.normale, D) : [Array.from({ length: D }, (_, j) => (j === 0 ? 1 : 0)), Array.from({ length: D }, (_, j) => (j === 1 ? 1 : 0))];
      if (!u || !v) return null;
      const a0 = q.arc ? q.arc[0] : 0, a1 = q.arc ? q.arc[1] : TOUR, N = 64, lignes = [[]];
      for (let i = 0; i <= N; i++) { const t = a0 + (a1 - a0) * i / N; lignes[0].push(aj(u, v, q.rayon * Math.cos(t), q.rayon * Math.sin(t))); }
      if (q.type === 'sphere' && D >= 3) { /* une sphere : trois grands cercles */
        const w = Array.from({ length: D }, (_, j) => (j === 2 ? 1 : 0)), l2 = [], l3 = [];
        for (let i = 0; i <= N; i++) { const t = TOUR * i / N; l2.push(aj(u, w, q.rayon * Math.cos(t), q.rayon * Math.sin(t))); l3.push(aj(v, w, q.rayon * Math.cos(t), q.rayon * Math.sin(t))); }
        lignes.push(l2, l3);
      }
      return { lignes, plein: !!q.remplissage };
    }
    if (q.type === 'plan') {
      const [u, v] = base2(q.normale || [1], D); if (!u || !v) return null; const r = q.rayon || 1;
      return { lignes: [[aj(u, v, -r, -r), aj(u, v, r, -r), aj(u, v, r, r), aj(u, v, -r, r), aj(u, v, -r, -r)]] };
    }
    return null;
  }
  /* game86 : la barre d echelle — le long de l axe x (colonne 0), depuis le coin bas des donnees, d une longueur ronde ~ 1/4 du dessin ;
   *   null si le systeme n a pas d unite lineaire (ECHELLE_UNITE). Rend aussi la largeur du dessin pour la carte « This work ». */
  function barreEchelle() {
    if (!S.science || !S.o || !S.o.brut || !S.o.bornee || (S.P && S.P.melange)) return null;
    const id = S.science.s.id, u = ECHELLE_UNITE[id]; if (!u) return null;
    let B; try { B = DEC.boiteDonnees(id, S.o); } catch (_) { return null; }
    const largeur = B.hi[0] - B.lo[0], L = longueurRonde(largeur / 4); if (!L) return null;
    /* mesuree au CENTRE des donnees (la barre est dessinee a une place fixe de l ecran, voir dessiner) */
    const a = B.centre.slice(); a[0] -= L / 2; const b = a.slice(); b[0] += L;
    const texte = ecrireLongueur(L) + ' ' + u[0];
    return { L, largeur, unite: u, texte,
      objet: { type: 'segment', espace: S.corps ? 'corps3' : 'brut', centre: a.map((x, j) => (x + b[j]) / 2), a, b, couleur: '#ffffff', libelle: 'Scale: ' + texte, largeur: 1, echelle: true, longueur: L, unite: u[0], etendue: largeur } };
  }
  function decorVue() {
    if (!S.science || !S.o || !S.o.brut || !S.o.bornee) return [];
    let objs; try { objs = DEC.decorDe(S.science.s.id, S.P.params, S.o) || []; } catch (_) { return []; }
    const f = filmDe(), k = f ? imageCourante() : null;
    objs = objs.filter((q) => q.image === undefined || q.image === k);
    /* game86 : la barre d echelle, un objet du decor comme les autres (meme transformation que les donnees) */
    { const be = barreEchelle(); if (be) objs.push(be.objet); }
    if (!objs.length) return [];
    const D = S.D, sortie = [];
    if (S.corps) {
      /* les corps : l objet est deja dans la vue normalisee (pas de projection N-D) */
      const vus = DEC.normaliserCorps(objs.filter((q) => q.espace === 'corps3'), S.o, TS.CORPS[S.science.s.id]);
      /* game86 : un SEGMENT (pts, pas de lignes) n etait pas dessine dans l espace des corps */
      for (const q of vus) { const e = echantillonner(q, 3); if (e) sortie.push({ q, e, vue: e.point ? [q.centre] : null, lignesVue: e.lignes || (e.pts && !e.point ? [e.pts] : null) }); }
      return sortie;
    }
    /* l espace brut : moyennes et echelle de standardiserIso, projection jointe, puis le cadrage des donnees seules */
    const n = S.n, { m, k: kz } = TS.echelleIso(S.o.brut, n, D, S.science.s.id);
    const items = []; for (const q of objs) { if (q.espace && q.espace !== 'brut') continue; const e = echantillonner(q, D); if (e) items.push({ q, e }); }
    const pts = []; for (const it of items) { it.idx = []; for (const ligne of (it.e.lignes || [it.e.pts])) { const li = []; for (const p of ligne) { li.push(pts.length); pts.push(p); } it.idx.push(li); } }
    if (!pts.length) return [];
    const zc = new Float64Array((n + pts.length) * D); zc.set(S.z.subarray(0, n * D));
    pts.forEach((p, r) => { for (let j = 0; j < D; j++) zc[(n + r) * D + j] = ((Number(p[j]) || 0) - m[j]) * kz[j]; });
    const pr = V.projeterVivant({ z: zc, n: n + pts.length, D, actives: S.couches.actives, angles: S.P.angles, t: S.t });
    /* recadrage : le cadre des DONNEES dans la projection jointe -> le cadre que positions() donne aux donnees seules */
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { const v = pr[3 * i + c]; if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; }
    const r = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2 || 1, mil = [0, 1, 2].map((c) => (lo[c] + hi[c]) / 2);
    const vue = (r2) => [0, 1, 2].map((c) => (pr[3 * (n + r2) + c] - mil[c]) / r);
    for (const it of items) sortie.push({ q: it.q, e: it.e, vue: it.e.point ? [vue(it.idx[0][0])] : null, lignesVue: it.e.point ? null : it.idx.map((li) => li.map(vue)) });
    return sortie;
  }
  /* ── game80 : le FILM — une suite d images (o.film = { images, parImage }) se lit image par image ── */
  function filmDe() {
    const f = S.science && S.o && S.o.film;
    if (!f || !Number.isInteger(f.images) || f.images < 2) return null;
    /* game80 : les modules donnent debuts/tailles par image (des images de tailles inegales : parImage null, ex. supernova 93/94 lignes) */
    if (Array.isArray(f.debuts) && Array.isArray(f.tailles) && f.debuts.length === f.images && f.tailles.length === f.images) {
      const ok = f.debuts.every((d, k) => Number.isInteger(d) && d >= 0 && Number.isInteger(f.tailles[k]) && d + f.tailles[k] <= S.n);
      return ok ? f : null;
    }
    return Number.isInteger(f.parImage) && f.images * f.parImage <= S.n ? { ...f, debuts: Array.from({ length: f.images }, (_, k) => k * f.parImage), tailles: Array(f.images).fill(f.parImage) } : null;
  }
  function imageCourante() { const f = filmDe(); return f ? Math.min(f.images - 1, Math.max(0, S.filmImage ?? 0)) : 0; }
  function syncFilm() {
    const f = filmDe(); zFilm.hidden = !f; if (!f) return;
    curFilm.max = String(f.images - 1);
    if (S.dessines < S.n) S.filmImage = Math.min(f.images - 1, Math.floor(S.dessines / S.n * f.images));
    curFilm.value = String(imageCourante());
    filmTxt.textContent = 'image ' + (imageCourante() + 1) + ' of ' + f.images;
  }
  curFilm.addEventListener('input', () => { S.filmImage = Number(curFilm.value); S.dessines = S.n; syncFilm(); S.sale = true; });
  /* ── game80 : un systeme a plusieurs corps — chaque corps s affiche / se cache (les « couches » deviennent les corps) ── */
  const nomsCorpsCourants = () => (S.science && S.corps ? (TS.nomsCorps(S.science.s.id, S.P.params) || Array.from({ length: S.corps.corps }, (_, b) => 'Body ' + (b + 1))) : []);
  /* game79 : la bulle — l index (le temps), puis les VALEURS BRUTES du point (avant toute normalisation), dimension par dimension,
   *   ou corps par corps pour un systeme a plusieurs corps. Un nuage : « sample », pas un temps. */
  function peindreBulle(i, x, y, larg) {
    if (i === null || i === undefined || !S.o || !S.o.brut) { bulle.hidden = true; return; }
    /* revue game79 : pas de valeurs pour un point PAS ENCORE dessine (le trace progresse) */
    const traces = Math.min(S.n, Math.floor(S.dessines));
    if (S.science && S.corps) { const j = i % S.corps.par; if (j >= Math.max(2, Math.floor(traces / S.n * S.corps.par))) { bulle.hidden = true; return; } }
    else if (i >= traces) { bulle.hidden = true; return; }
    const D = S.D, b = S.o.brut, lignes = [];
    if (S.science && S.corps) {
      const c = Math.min(S.corps.corps - 1, Math.floor(i / S.corps.par)), j = i - c * S.corps.par, src = Math.min(S.n - 1, Math.floor(j * S.n / S.corps.par)), k = TS.CORPS[S.science.s.id];
      const noms = TS.nomsCorps(S.science.s.id, S.P.params);
      lignes.push(['body', noms && noms[c] ? noms[c] : String(c + 1) + ' of ' + S.corps.corps], ['step', String(src) + ' of ' + (S.n - 1)]);
      ['x', 'y', 'z'].slice(0, k).forEach((n, q) => lignes.push([n, nb4(b[src * D + c * k + q])]));
    } else {
      const nuageB = S.P.ordre === 1 || (S.science && TS.estNuage(S.P, S.o));
      /* 09/11 (subagent's open item: "the hover bubble does not name the part"): a subject coloured by class says the class of this point */
      const pc = classesPoints(), cls = pc ? pc.classes[i] : null;
      if (pc && Number.isInteger(cls) && pc.palette[cls] && pc.palette[cls].name) lignes.push(['part', pc.palette[cls].name]);
      lignes.push([nuageB ? 'sample' : 't', String(i) + ' of ' + (S.n - 1)]);
      for (const j of V.dimsVisibles(S.couches).slice(0, 12)) lignes.push(['x' + (j + 1), nb4(b[i * D + j])]);
    }
    bulle.replaceChildren(...lignes.flatMap(([kk, v], q) => [...(q ? [el('br')] : []), document.createTextNode(kk + ' = '), el('b', { text: v })]));
    bulle.hidden = false;
    const gauche = x + 14 + 260 > larg ? Math.max(4, x - 270) : x + 14;
    bulle.style.left = gauche + 'px'; bulle.style.top = Math.max(4, y - 10) + 'px';
  }
  cv.addEventListener('pointerleave', () => { bulle.hidden = true; });

  /* ── series et grille eclatee (memes couleurs, meme point survole) ── */
  function peindreSeries() {
    const r = cvSeries.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1), L = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
    if (cvSeries.width !== L || cvSeries.height !== H) { cvSeries.width = L; cvSeries.height = H; }
    const g = cvSeries.getContext('2d'); g.clearRect(0, 0, L, H); if (!S.ser) return;
    const n = Math.min(S.n, Math.max(2, Math.floor(S.dessines)));
    if (S.split) {
      /* une bande par couche visible : son nom, sa couleur, ses valeurs reelles min/max (avant normalisation) */
      const vis = V.dimsVisibles(S.couches), h = H / Math.max(1, vis.length);
      g.font = (10 * dpr) + 'px ui-monospace,Consolas,monospace';
      vis.forEach((j, k) => {
        const y0 = k * h, col = V.couleurDim(j);
        g.fillStyle = 'rgba(255,255,255,.04)'; if (k % 2) g.fillRect(0, y0, L, h);
        g.strokeStyle = col; g.shadowColor = col; g.shadowBlur = 4 * dpr; g.lineWidth = dpr; g.beginPath();
        for (let i = 0; i < n; i++) { const x = (i / (S.n - 1)) * L, y = y0 + h - 3 * dpr - S.ser[j][i] * (h - 6 * dpr); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
        g.stroke(); g.shadowBlur = 0;
        let lo = Infinity, hi = -Infinity; for (let i = 0; i < S.n; i++) { const v = S.o.brut[i * S.D + j]; if (v < lo) lo = v; if (v > hi) hi = v; }
        const etq = 'x' + (j + 1) + '  ' + lo.toFixed(2) + ' … ' + hi.toFixed(2);
        g.fillStyle = 'rgba(11,13,23,.82)'; g.fillRect(2 * dpr, y0 + 2 * dpr, g.measureText(etq).width + 6 * dpr, 12 * dpr);
        g.fillStyle = col; g.fillText(etq, 5 * dpr, y0 + 11 * dpr);
      });
    } else
    for (const j of V.dimsVisibles(S.couches)) {
      g.strokeStyle = V.couleurDim(j); g.lineWidth = dpr; g.beginPath();
      for (let i = 0; i < n; i += 2) { const x = (i / (S.n - 1)) * L, y = H - 4 - S.ser[j][i] * (H - 8); if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke();
    }
    if (S.survol !== null) { const x = (S.survol / (S.n - 1)) * L; g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    if (S.son && S.tete !== null) { const x = (S.tete / (S.n - 1)) * L; g.strokeStyle = 'rgba(255,255,255,.55)'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); g.setLineDash([]); }
  }
  let panneaux = [];
  function peindreGrille() {
    const paires = V.pairesVisibles(S.couches);
    panneaux = paires.map(([a, b]) => { const c = el('canvas', { 'data-paire': a + ',' + b }); return { a, b, c, f: el('figure', {}, c, el('figcaption', { text: 'x' + (a + 1) + ' · x' + (b + 1) })) }; });
    grille.replaceChildren(...panneaux.map((p) => p.f));
    racine.dataset.panneaux = String(panneaux.length);
    peindrePanneaux();
  }
  function peindrePanneaux() {
    if (!eclate.open || !S.ser) return;
    const n = Math.min(S.n, Math.max(2, Math.floor(S.dessines)));
    for (const p of panneaux) {
      const T = 160; if (p.c.width !== T) { p.c.width = T; p.c.height = T; }
      const g = p.c.getContext('2d'); g.fillStyle = '#0b0d17'; g.fillRect(0, 0, T, T);
      const A = S.ser[p.a], B = S.ser[p.b];
      g.fillStyle = V.couleurDim(p.a); for (let i = 0; i < n; i += 2) g.fillRect(4 + A[i] * (T - 8), T - 4 - B[i] * (T - 8), 1.2, 1.2);
      if (S.survol !== null) { g.fillStyle = '#fff'; g.beginPath(); g.arc(4 + A[S.survol] * (T - 8), T - 4 - B[S.survol] * (T - 8), 4, 0, 2 * Math.PI); g.fill(); }
    }
  }
  eclate.addEventListener('toggle', peindrePanneaux);
  grille.addEventListener('pointermove', (e) => {
    const c = e.target.closest('canvas[data-paire]'); if (!c || !S.ser) return;
    const [a, b] = c.getAttribute('data-paire').split(',').map(Number), r = c.getBoundingClientRect(), T = c.width, k = T / r.width;
    const A = S.ser[a], B = S.ser[b], xs = new Float32Array(S.n), ys = new Float32Array(S.n);
    for (let i = 0; i < S.n; i++) { xs[i] = 4 + A[i] * (T - 8); ys[i] = T - 4 - B[i] * (T - 8); }
    const i = V.indexProche(xs, ys, (e.clientX - r.left) * k, (e.clientY - r.top) * k, 10);
    if (i !== S.survol) { S.survol = i; S.sale = true; peindreSurvol(); }
  });
  function peindreSurvol() { racine.dataset.survol = S.survol === null ? '' : String(S.survol); peindreSeries(); peindrePanneaux(); }

  /* ── la carte ── */
  function peindreCarte() {
    if (S.science) {
      const { s, o } = S.science;
      /* game86 : l echelle de grandeur, en mots — la largeur du dessin le long de x, et ce que vaut l unite quand c est une definition */
      const be = (() => { try { return barreEchelle(); } catch (_) { return null; } })();
      const lignes = [{ k: 'System', v: s.nom }, { k: 'Science', v: s.science }, { k: 'What is computed', v: s.phrase },
        ...(be ? [{ k: 'Scale', v: 'the drawing is about ' + (be.largeur >= 1e-3 && be.largeur < 1e6 ? String(Number(be.largeur.toPrecision(2))) : be.largeur.toExponential(1).replace('e+', 'e')) + ' ' + be.unite[0] + ' wide along x; the white bar is ' + be.texte + (be.unite[1] ? ' (' + be.unite[1] + ')' : '') }] : []),
        /* game79 : ce que le CERVEAU a ecrit — dans les params, donc sur Base avec l oeuvre au moment du mint (signe par celui qui minte) */
        ...(S.P && S.P.note ? [{ k: 'The brain\'s note (stored on Base with the work when it is minted)', v: S.P.note }] : []),
        /* (l operateur MATHEMATIQUE du melange — somme / composition — dit par un tableau joint : jamais concatene comme un nom de wallet) */
        ...(S.P && S.P.melange ? [{ k: 'Blended with', v: [...(S.P.melange.science ? [TS.systeme(S.P.melange.science).nom + (S.P.melange.params ? ' (own settings)' : '')] : [S.P.melange.motif.famille, S.P.melange.motif.variante]), OPS_EN[S.P.melange.operateur] || S.P.melange.operateur, 'weight ' + nb4(S.P.melange.w)].filter(Boolean).join(' · ') }] : []),
        ...Object.entries((o && o.invariants) || {}).filter(([k]) => !INVARIANT_MUET.has(k)).map(([k, v]) => { const nom = NOMS_MESURES[k] || k; return { k: 'Check: ' + nom, v: ligneInvariant(k, v).slice(nom.length + 2) }; }),
        { k: 'Chaos (λ)', v: o && typeof o.lyapunov === 'number' && Number.isFinite(o.lyapunov) ? nb4(o.lyapunov) + (o.uniteLyapunov ? ' ' + uniteEn(o.uniteLyapunov) : '') + ' — finite-run estimate' : 'not defined for this system' },
        { k: 'Mint', v: '5 USDC, stored on Base like every work (same contract). Anyone can replay these parameters to the same bytes.' }];
      dl.replaceChildren(...lignesRejeu(lignes).flatMap((l) => [el('dt', { text: l.k }), el('dd', { text: l.v })]));
      return;
    }
    const c = S.choix && S.choix.certificats ? { ...S.c, ...S.choix.certificats } : S.c;
    const lignes = V.carte({ P: S.P, c, choix: S.choix, nMintees: S.choix ? S.nMintees : 0 });
    dl.replaceChildren(...lignesRejeu(lignes).flatMap((l) => [el('dt', { text: l.k }), el('dd', { text: l.v })]));
  }
  /* game374 : on a replay the work IS minted — "Distinct from the minted works: yes (no minted work to compare with yet)" and the price
   *   line would be false there ; they say which minted work it is instead */
  function lignesRejeu(lignes) {
    if (!S.rejeu) return lignes;
    const minte = { k: 'Minted', v: 'yes — this is ' + nomRejeu() + detailRejeu() + ', read from Base. Anyone can replay its parameters to the same bytes.' };
    /* "You did" / "You set the variables yourself" speak to the viewer: on a replay the choice was its minter's */
    return lignes.map((l) => l.k === 'Distinct from the minted works' || l.k === 'Mint' ? minte
      : l.k === 'Who chose' && /^You did/.test(l.v) ? { k: l.k, v: 'Its minter, in the free explorer.' }
        : l.k === 'Tuned' && /^You set/.test(l.v) ? { k: l.k, v: 'Its minter set the variables by hand.' } : l);
  }

  /* ── le son (optionnel, coupe par defaut) ── */
  function majSon() {
    if (!S.son) return;
    const vis = new Set(V.dimsVisibles(S.couches));
    S.son.voix.forEach((v, j) => v.g.gain.setTargetAtTime(vis.has(j) ? 0.03 : 0, S.son.ctx.currentTime, 0.05));
  }
  function arreterSon() { if (S.son) { try { S.son.ctx.close(); } catch (_) { /* rien */ } S.son = null; } bSon.setAttribute('aria-pressed', 'false'); bSon.textContent = 'Sound: off'; }
  bSon.addEventListener('click', () => {
    if (S.son) { arreterSon(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC || !S.o) return;
    const ctx = new AC(), maitre = ctx.createGain(); maitre.gain.value = 0.5; maitre.connect(ctx.destination);
    const GAMME = [0, 2, 4, 7, 9]; /* pentatonique : chaque dimension une voix */
    const voix = Array.from({ length: Math.min(S.D, 12) }, (_, j) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
      o.frequency.value = 196 * 2 ** ((GAMME[j % 5] + 12 * Math.floor(j / 5)) / 12); g.gain.value = 0; o.connect(g); g.connect(maitre); o.start();
      return { o, g, f0: o.frequency.value };
    });
    S.son = { ctx, voix }; bSon.setAttribute('aria-pressed', 'true'); bSon.textContent = 'Sound: on'; majSon();
  });

  /* ── la boucle : seulement onglet visible et page visible ── */
  let dernier = 0, tickSource = 0;
  function boucle(ts) {
    requestAnimationFrame(boucle);
    const vol = racine.closest('.volet');
    if (document.hidden || (vol && !vol.classList.contains('on'))) { if (S.son) arreterSon(); return; }
    if ((++tickSource & 63) === 0) peindreSource(); /* le block de l onglet Brain a pu changer pendant que TAM etait cache */
    if ((tickSource % 60) === 0) peindreQui(); /* game79 : les valeurs vivantes du cerveau, ~1 fois par seconde */
    const dt = dernier ? Math.min(0.1, (ts - dernier) / 1000) : 0; dernier = ts;
    if (S.o && S.dessines < S.n) { S.dessines = Math.min(S.n, S.dessines + S.n * dt / (Number(selVitesse.value) || 6)); S.sale = true; if (filmDe()) syncFilm(); }
    /* en boucle : la fin reste affichee 1,5 s, puis le trace repart du debut */
    else if (S.o && S.boucle && !reduit()) { S.pause = (S.pause || 0) + dt; if (S.pause > 1.5) { S.pause = 0; S.dessines = 0; S.sale = true; } }
    if (S.o && S.rotation && S.D > 3) { S.t += dt * 0.35; S.sale = true; racine.dataset.t = S.t.toFixed(3); }
    /* 2026-11-01 (Phil : « le son correspond pas au graph ») : le son jouait un index qui avancait d UN point par image, sans lien avec le
     *   trace. Il suit maintenant LE point montre : la tete pendant le trace, puis un curseur visible qui parcourt la courbe a la meme vitesse. */
    if (S.son && S.ser) {
      if (S.dessines < S.n) S.tete = Math.max(0, Math.floor(S.dessines) - 1);
      else { S.lecteur = ((S.lecteur || 0) + S.n * dt / 3) % S.n; S.tete = Math.floor(S.lecteur); S.sale = true; }
      const i = S.tete, vis = new Set(V.dimsVisibles(S.couches));
      S.son.voix.forEach((v, j) => { v.o.frequency.setTargetAtTime(v.f0 * (0.85 + 0.3 * S.ser[j][i]), S.son.ctx.currentTime, 0.03); if (!vis.has(j)) v.g.gain.value = 0; });
      racine.dataset.tete = String(i);
    } else S.tete = null;
    if (S.sale) { S.sale = false; dessiner(); peindreSeries(); if (S.dessines < S.n || S.rotation) peindrePanneaux(); }
  }
  requestAnimationFrame(boucle);
  new ResizeObserver(() => { S.sale = true; }).observe(scene);

  /* ── le Mint (seulement adresse connue ; seulement une oeuvre choisie par le cerveau) ── */
  function peindreMint() {
    /* 2026-11-01 : le choix du cerveau OU une oeuvre reglee, et seulement si les certificats LOCAUX passent ; le serveur re-certifie au clic */
    peindreRejeu();
    /* game374 : a replayed work is already minted — no Mint offered on it */
    if (S.rejeu) { zMint.hidden = true; racine.dataset.mint = 'off'; zMint.replaceChildren(); return; }
    const visible = V.mintVisible(EP.TAM_DEPLOIEMENT) && !!((S.choix || (S.P && S.P.regle) || S.science) && S.octets && S.c && S.c.ok);
    zMint.hidden = !visible; racine.dataset.mint = visible ? 'on' : 'off';
    if (!visible) { zMint.replaceChildren(); return; }
    /* game375 (Phil 2026-11-12: the "Pay with" selector goes, the Mint button does the same; label it $5). Merged on the economy pack:
     *   TAM art takes its USDC price through the router, which turns most of it into TBLOCK for the holders vault — no separate buy. */
    const dit = el('p', { class: 'tamDoux', 'aria-live': 'polite' });
    const signe = el('div', { class: 'tamSigne', hidden: true });
    const bMint = el('button', { type: 'button', class: 'tamPrim', id: 'tamMintBouton', text: 'Mint this work — $5' });
    /* 2026-11-12: the payment buys TBLOCK itself (the router), for the holders vault — said under the button, from what TAM art reads */
    const note = el('p', { class: 'tamDoux', id: 'tamMintNote', text: 'Paid through the TBLOCK payment router: most of the price buys TBLOCK for the holders vault, and the mint counts as play.' });
    zMint.replaceChildren(el('div', { class: 'tamRang' }, bMint), note, signe, dit);
    bMint.addEventListener('click', () => preparerMint({ signe, dit }));
  }
  /* 2026-11-12: what TAM art says on chain — its price, its dev split and its router — before anything is built */
  async function lireContrat(contrat) {
    const lire = async (sig) => ctx.rpc('eth_call', [appelLecture(contrat, sig), 'latest']);
    const [p, s, r] = await Promise.all([lire('PRICE_USDC()'), lire('USDC_SPLIT()'), lire('ROUTER()')]);
    return { prix: EP.word(p), devBps: EP.word(s, 1), routeur: decoderAdresse(r) };
  }
  /* the router's minimum for this payment: a FRESH quote of the USDC it swaps (/api/tblock/devis-routeur) x 0.99, never under the
   *   router's own floor (minOutFloor, read now); the deadline from the chain's clock */
  async function minimumRouteur(lu) {
    const spend = EP.usdcEchange(lu.prix, lu.devBps);
    let q = null; try { q = await fetch('/api/tblock/devis-routeur?montant=' + spend.toString(), { cache: 'no-store', signal: AbortSignal.timeout(30000) }).then((x) => x.json()); } catch (_) { q = null; }
    if (!q || !q.ok) return { ok: false, why: 'the TBLOCK quote could not be read just now' + (q && q.pourquoi ? ' (' + String(q.pourquoi).slice(0, 100) + ')' : '') };
    let plancher; try { plancher = EP.word(await ctx.rpc('eth_call', [EP.VIEW.minOutFloor(spend), 'latest'])); } catch (_) { return { ok: false, why: 'the router floor could not be read just now' }; }
    const m = EP.minimumDepuisDevis({ devis: q.devis, plancher });
    if (!m.ok) return m;
    let t = Math.floor(Date.now() / 1000);
    try { const b = await ctx.rpc('eth_getBlockByNumber', ['latest', false]); const ts = b && b.timestamp ? Number(BigInt(b.timestamp)) : 0; if (ts > t) t = ts; } catch (_) { /* the device clock */ }
    return { ok: true, minOut: m.minOut, deadline: t + EP.DELAI_PAIEMENT_S };
  }
  async function preparerMint({ signe, dit }) {
    const c = ctx.compte && ctx.compte();
    if (!c) { dit.textContent = 'Connect a wallet to mint.'; return; }
    const contrat = EP.TAM;
    /* ⛔ on ne signe que des octets REJOUES ici : le serveur a choisi, la page recalcule */
    /* game77 (chasse aux bugs : course) : l oeuvre est FIGEE au clic — params, octets, certificat, choix. Un curseur bouge pendant la
     *   verification du serveur : on s arrete et on le dit, au lieu de signer les octets d une oeuvre avec le certificat d une autre. */
    const P0 = S.P, oct0 = S.octets, c0 = S.c, choix0 = S.choix, sci0 = !!S.science;
    const change = () => S.P !== P0 || S.octets !== oct0;
    const r = (sci0 ? TS.rejouerScience : rejouer)(JSON.parse(JSON.stringify(P0))), oct = octetsDe(oct0);
    if (!r.ok || !V.verdictRejeu(r.octets, oct).identique) { dit.textContent = 'This page could not replay this work to the same bytes, so nothing is offered to sign.'; return; }
    const paramsJson = JSON.stringify(P0);
    /* ⛔ 2026-11-01 : LE portail (V.peutMinter) — certificats locaux, ceux du SERVEUR (distance a toutes les oeuvres mintees) sur les memes
     *   octets, et une oeuvre tiree pour CE wallet. Une oeuvre reglee est re-certifiee par le serveur ; le choix du cerveau l a deja ete. */
    let serveur = null;
    if (P0.regle || sci0) {
      dit.textContent = 'Checking this setting against every minted work…';
      const b = new TextEncoder().encode(paramsJson); let s = ''; for (const x of b) s += String.fromCharCode(x);
      const p64 = btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      try { serveur = await fetch('/api/tam/certifier?p=' + p64, { cache: 'no-store' }).then((x) => x.json()); } catch (_) { serveur = null; }
    } else if (choix0 && choix0.hash) serveur = { ok: true, etat: 'CERTIFIE', hash: choix0.hash };
    if (change()) { dit.textContent = 'The work changed while it was being checked. Press Mint again for the work on screen.'; return; }
    const porte = V.peutMinter({ dep: EP.TAM_DEPLOIEMENT, local: c0, serveur, octets: oct, P: P0, compte: c });
    if (!porte.ok) { dit.textContent = 'Not ready: ' + porte.pourquoi + '.'; return; }
    let lu; try { lu = await lireContrat(contrat); } catch (_) { dit.textContent = 'The TAM art contract could not be read.'; return; }
    dit.textContent = 'Reading a fresh TBLOCK quote for the payment…';
    const mr = await minimumRouteur(lu);
    if (!mr.ok) { dit.textContent = 'Not ready: ' + mr.why + '.'; return; }
    if (change()) { dit.textContent = 'The work changed while it was being checked. Press Mint again for the work on screen.'; return; }
    /* la graine : celle du cerveau quand il y en a une ; sinon le keccak des params (dit tel quel dans les params stockes) */
    const graine = P0.graine || keccak256Hex(new TextEncoder().encode(canon(P0)));
    const jeu = { genre: 'tam-routeur', contrat: EP.ROUTER, pack: EP, lu, octets: oct, graine, paramsJson, minOut: mr.minOut, deadline: mr.deadline };
    const planUsdc = planJeuUsdc(jeu);
    if (planUsdc.etat !== 'PRET') { dit.textContent = planUsdc.pourquoi + '.'; return; }
    const pj = { ok: true, plan: planUsdc, sym: 'USDC', phrase: 'Paid as ' + EP.usdcTexte(planUsdc.resume.prixUsdc) + ' USDC.' };
    const rs = planUsdc.resume;
    /* 2026-11-12 (browser check): the plan is on screen — "Reading a fresh TBLOCK quote…" stayed under it, as if still waiting */
    dit.textContent = '';
    signe.hidden = false;
    /* ⛔ 2026-11-01 (test-no-fee-address-shown D2) : le calldata signe porte l adresse ; l ECRAN jamais — tout texte passe par le masque */
    signe.replaceChildren(
      el('p', { text: maskFeeAddresses('You sign: ' + EP.usdcTexte(rs.prixUsdc) + ' USDC through the TBLOCK payment router ' + displayShort(rs.routeur) + ': ' + EP.usdcTexte(rs.devUsdc) + ' USDC to the dev wallet, '
        + EP.usdcTexte(rs.achatUsdc) + ' USDC buys at least ' + EP.fmt(rs.minTblock) + ' TBLOCK (a fresh quote less 1%), all of it sent to the holders vault; TAM art ' + displayShort(contrat) + ' mints the work to you.') }),
      el('p', { text: maskFeeAddresses('The work: ' + rs.octets + ' bytes, keccak ' + rs.empreinte + '. Seed ' + rs.graine + '.') }),
      el('p', { text: maskFeeAddresses(pj.phrase + ' ' + pj.plan.appels.length + ' calls: ' + pj.plan.appels.map((a) => a.quoi).join(' · ') + '.') }),
      el('p', { class: 'tamDoux', text: 'If the pools move more than that before your wallet signs, the payment is refused whole and nothing is paid: press Mint again.' }),
      el('button', { type: 'button', class: 'tamPrim', text: 'Sign in my wallet', onclick: async () => {
        dit.textContent = 'Waiting for your wallet…';
        const res = await ctx.envoyer(pj, c, (t) => { dit.textContent = t; });
        const minte = !!(res && (res.etat === 'CONFIRME' || res.etat === 'OK' || res.etat === 'PRET'));
        dit.textContent = minte ? 'Minted. It appears in the gallery once the block is read.' : 'Not minted: ' + String((res && (res.pourquoi || res.etat)) || 'no answer') + '.';
        void galerie();
      } }));
  }

  /* ── game374 : Replay = the minted work loaded into the SCENE and drawn again from zero (same renderer as every work) ── */
  /* attractor : charger() with the bytes read from Base (the stored view draws THOSE bytes) ; science : chargerScience(), then the
   *   params exactly as minted (their angles, their minter — the projection reads S.P.angles) and the bytes read from Base */
  function rejouerMintee(id, plan, donnees, graineHex, premiere = false, nom = null) {
    const P = plan.P;
    if (plan.genre === 'science') {
      const s = SYSTEMES_SCI.find((x) => x.id === P.science); if (!s) return false;
      selGroupe.value = groupeDe(s); peindreGroupe(); selSys.value = s.id;
      chargerScience(s.id, P.params || {}, { melange: P.melange || null, graine: P.graine, note: P.note });
      if (!S.science || S.science.s.id !== s.id || !S.o) return false;
      S.P = JSON.parse(JSON.stringify(P)); S.octets = hexDe(donnees);
    } else {
      if (selGroupe.value !== 'attracteurs') { selGroupe.value = 'attracteurs'; peindreGroupe(); }
      if ([...selFam.options].some((o) => o.value === P.famille)) {
        selFam.value = P.famille; optionsDims();
        const d = P.famille === 'lorenz96' ? String(P.dim) : P.operateur === 'couplage' ? String(P.k) : '1';
        if ([...selDim.options].some((o) => o.value === d)) selDim.value = d;
      }
      charger(P, null, hexDe(donnees));
      if (!S.o) return false;
    }
    S.rejeu = { id, premiere: !!premiere, nom: nom || nomPublicTam(id, premiere, null), verdict: plan.verdict.texte, graine: String(graineHex || '') }; S.choix = null; S.origine = null;
    S.t = 0; S.dessines = reduit() ? S.n : 0; S.pause = 0; S.survol = null;
    peindreQui(); peindreCarte(); peindreReglages(); peindreMint();
    S.sale = true;
    return true;
  }
  /* game378 : the replayed work's ONE public name ("TAM #4"), and beside it its contract and on-chain token id ("TAM art · token 1") —
   *   the detail is said only when a number is shown (without N the name already IS the contract and token id) */
  function nomRejeu() { return S.rejeu ? S.rejeu.nom.nom : ''; }
  function detailRejeu() { return S.rejeu && S.rejeu.nom.numero !== null ? ' (' + S.rejeu.nom.detail + ')' : ''; }
  function peindreRejeu() {
    rejeuLigne.hidden = !S.rejeu;
    if (!S.rejeu) { rejeuLigne.replaceChildren(); racine.dataset.rejeu = ''; return; }
    racine.dataset.rejeu = String(S.rejeu.id) + (S.rejeu.premiere ? '-first' : '');
    rejeuLigne.replaceChildren(document.createTextNode('Replay of ' + nomRejeu() + ' (' + (S.rejeu.nom.numero !== null ? S.rejeu.nom.detail + ', ' : '') + 'read from Base' + (S.rejeu.graine ? ', seed ' + S.rejeu.graine.slice(0, 10) + '…' : '') + '). Check: '),
      el('b', { text: S.rejeu.verdict }), document.createTextNode(' — its stored parameters replay to the same bytes as the ones stored on Base.'));
  }

  /* ── la galerie : lue sur la chaine, GRATUIT ── */
  /* 2026-11-12: the works of TAM art (minted now) first, then those of the first TamArt — both read from Base, both replayable */
  async function galerie() {
    const sources = [{ contrat: adresseTam(EP.TAM_DEPLOIEMENT), premiere: false }, { contrat: adresseTam(TAMART_DEPLOIEMENT), premiere: true }].filter((x) => x.contrat);
    if (!sources.length) { galEtat.textContent = 'No work is minted yet: TAM minting is coming soon.'; gal.replaceChildren(); racine.dataset.galerie = 'pas-deploye'; return; }
    let j = null;
    try { j = await fetch('/api/tam/oeuvres', { cache: 'no-store' }).then((r) => r.json()); } catch (_) { j = null; }
    const lus = [];
    for (const s of sources) {
      const lu = j && Array.isArray(j.parContrat) ? j.parContrat.find((x) => String(x.contrat || '').toLowerCase() === s.contrat) : (j && String(j.contrat || '').toLowerCase() === s.contrat ? j : null);
      let ids = lu && Array.isArray(lu.oeuvres) ? lu.oeuvres.map((o) => o.tokenId) : [];
      if (!ids.length) { try { const n = Number(BigInt(decoderMot(await ctx.rpc('eth_call', [appelLecture(s.contrat, SIG_TAM.totalSupply), 'latest'])))); ids = Array.from({ length: Math.min(n, 60) }, (_, i) => i + 1); } catch (_) { ids = []; } }
      for (const id of ids) lus.push({ s, id });
    }
    /* game378 : N read on Base, then ONE public number per work (ordreGalerie) */
    S.nPremiere = lus.length ? await lireNPremiere() : null;
    const cartes = ordreGalerie(lus, S.nPremiere).map((x) => carteOeuvre(x.s.contrat, x.id, x.s.premiere, x.nom));
    galEtat.textContent = cartes.length ? cartes.length + ' work' + (cartes.length === 1 ? '' : 's') + ', read from Base.' : 'No work minted yet.';
    carteGal.hidden = cartes.length === 0;
    S.nMintees = cartes.length;
    gal.replaceChildren(...cartes);
  }
  /* game378 : N = the first collection's totalSupply at TAM art's deploy block (its works minted before TAM art went live) — read, or null */
  async function lireNPremiere() {
    const premiere = adresseTam(TAMART_DEPLOIEMENT), bloc = EP.TAM_DEPLOIEMENT && EP.TAM_DEPLOIEMENT.bloc;
    if (!premiere || !Number.isSafeInteger(bloc) || bloc <= 0) return null;
    try {
      const n = Number(BigInt(decoderMot(await ctx.rpc('eth_call', [appelLecture(premiere, SIG_TAM.totalSupply), '0x' + bloc.toString(16)]))));
      return Number.isSafeInteger(n) && n >= 0 ? n : null;
    } catch (_) { return null; }
  }
  function carteOeuvre(contrat, id, premiere = false, nom = nomPublicTam(id, premiere, null)) {
    const c = el('canvas'), badge = el('span', { class: 'tamBadge' }), txt = el('p', { class: 'tamDoux' });
    const bRejouer = el('button', { type: 'button', text: 'Replay' });
    const f = el('div', { class: 'tamOeuvre' }, c, el('b', { text: nom.nom }), nom.numero !== null ? el('p', { class: 'tamDoux tamJeton', text: nom.detail }) : null, txt, el('div', { class: 'tamRang' }, bRejouer, badge));
    let donnees = null, params = null, graineHex = null;
    (async () => {
      try {
        const [d, p, g] = await Promise.all([SIG_TAM.donnees, SIG_TAM.params, SIG_TAM.graine].map((s) => ctx.rpc('eth_call', [appelLecture(contrat, s, id), 'latest'])));
        donnees = decoderBytes(d); params = new TextDecoder().decode(decoderBytes(p)); graineHex = decoderMot(g);
        const dec = decoder(donnees); dessinerVignette(c, dec);
        txt.textContent = donnees.length + ' bytes · keccak ' + keccak256Hex(donnees).slice(0, 12) + '… · seed ' + graineHex.slice(0, 10) + '…';
      } catch (_) { txt.textContent = 'Not read.'; }
    })();
    /* game374 (Phil: "sur le bouton replay ça doit afficher sur la map de TAM pour vraiment replay le TAM") : the byte check stays (badge +
     *   the line under the scene), and the work is loaded into the scene and drawn again — only when the bytes are identical */
    bRejouer.addEventListener('click', () => {
      if (!donnees || !params) { badge.className = 'tamBadge ko'; badge.textContent = 'not read'; return; }
      /* revue game79 : une oeuvre de SCIENCE se rejoue avec tam-science.js (planRejeuMintee choisit le meme rejeu) */
      const p = planRejeuMintee(params, donnees);
      badge.className = 'tamBadge ' + (p.verdict.identique ? 'ok' : 'ko'); badge.textContent = p.verdict.texte; badge.title = p.pourquoi || '';
      if (!p.ok) return;
      if (!rejouerMintee(id, p, donnees, graineHex, premiere, nom)) { badge.className = 'tamBadge ko'; badge.textContent = p.verdict.texte + ' · not drawn'; badge.title = 'this page could not draw it'; return; }
      scene.scrollIntoView({ behavior: reduit() ? 'auto' : 'smooth', block: 'center' });
    });
    return f;
  }
  function dessinerVignette(c, d) {
    const T = 200; c.width = T; c.height = T; const g = c.getContext('2d'); g.fillStyle = '#0b0d17'; g.fillRect(0, 0, T, T);
    g.strokeStyle = '#7fd1ff'; g.lineWidth = 0.8; g.beginPath();
    for (let i = 0; i < d.n; i++) { const x = (d.positions[3 * i] + 1) / 2 * T, y = (1 - (d.positions[3 * i + 1] + 1) / 2) * T; if (i === 0 || d.ordre === 1) g.moveTo(x, y); if (d.ordre === 1) g.lineTo(x + 0.5, y); else g.lineTo(x, y); }
    g.stroke();
  }

  /* game82 : un lien #tam= rouvre l oeuvre partagee ; sinon l oeuvre par defaut */
  optionsDims(); if (!ouvrirLien()) depuisExplorateur(); void galerie();
  window.addEventListener('hashchange', () => { if (/#tam=/.test(location.hash)) ouvrirLien(); });
  /* 2026-11-01 : le bouton « Make art from this block's brain » de l onglet Brain — la source = ce block, puis le meme clic que l onglet */
  const choisirDepuisBloc = () => { S.sourceBloc = true; peindreSource(); const a = blocVu(); if (a) selBloc.value = a; bCerveau.click(); };
  racine.__tam = { S, charger, choisirDepuisBloc };
  return racine.__tam;
}
