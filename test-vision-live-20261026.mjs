// test-vision-live-20261026.mjs — « LIVE » : PLUSIEURS VUES INSIDE EN DIRECT, CHACUNE NE PEINT QUE LES BATTEMENTS DE SON PROPRE BLOCK.
//
// Ce que ce banc exige (proprietaire, 2026-10-26 : un bouton Live sur la Map, un second panneau a gauche, la vue a la premiere personne
// en direct, une recherche pour ajouter d autres blocks, plusieurs vues a la fois) :
//   A. ajouter / retirer : adresse illisible, doublon, tuile de trop REFUSES avec la phrase ; 4 sur grand ecran, 2 sur telephone ;
//   B. tuiles INDEPENDANTES : chaque tuile ne lit que la source de SA propre adresse, et un battement d un autre cerveau (cablage
//      different) est refuse — meme quand l appelant le lui tend ;
//   C. rien d invente : l humeur d une tuile = la phase de SON dernier battement (« no beat yet » sinon) ; les neurones allumes = les
//      `vu.indices` de ce battement ; le cadre est celui de cadreInterieur(champ(...)) — meme empreinte que le dialogue ;
//   D. un battement deja vu n est pas repris ; un cerveau recree repart a zero ; une tuile ne melange pas deux instances ;
//   E. la taille gardee par visiteur est BORNEE, et une valeur illisible rend la taille d origine ;
//   F. vision-live.js est pur ;
//   G. app.html : le bouton Live sur la Map, le panneau, le battement qui nourrit les tuiles, le MEME renderer (pas une copie),
//      la recherche partagee, prefers-reduced-motion, localStorage sous try, aucun reseau dans le bloc Live ; le module est servi.
// MUTANTS (sur des COPIES dans le dossier temporaire du systeme, jamais sur le module suivi) : chacun doit faire tomber au moins une
//   assertion. Sortie : nombre d assertions, mutants tues / total.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ICI = new URL('./', import.meta.url);
const C = await import(new URL('./cerveau.js', ICI).href);
const V = await import(new URL('./vision-cerveau.js', ICI).href);
const { etatInitial, pas, connectome } = C;

const UNIT = '0xb2000000000000000000007afa7ed748b0874f27'; /* le block de test du proprietaire (consigne) */
const B = '0x' + '1'.repeat(40), D = '0x' + 'a'.repeat(40);
const FAITS = { vie: 12000, vieAvant: 11000, gm: 3, messages: 1, detenteurs: 1, mort: false, etatVie: 'LUE', gmAvant: 2, messagesAvant: 0,
  detenteursAvant: 1, achats: 2, ventes: 0, achatsAvant: 1, ventesAvant: 0, role: 'SENTINELLE', bloc: 53106615 };
const CALME = { vie: 50, vieAvant: 50, etatVie: 'LUE', gm: 0, gmAvant: 0, messages: 0, messagesAvant: 0, detenteurs: 0, detenteursAvant: 0,
  achats: 0, achatsAvant: 0, ventes: 0, ventesAvant: 0 };
const varie = (i) => ({ ...FAITS, achats: 1 + Math.floor((i + 1) / 3), achatsAvant: 1 + Math.floor(i / 3), vie: 12000 + (i % 5) * 300, vieAvant: 12000 + ((i + 4) % 5) * 300 });
/* une page vivante : trois cerveaux qui battent chacun avec SES faits */
function page(adrs, faitsDe) {
  const etats = new Map(adrs.map((a) => [a, etatInitial(a)]));
  const dernier = new Map();
  return {
    battre(i) { for (const a of adrs) { const f = faitsDe(a, i); const r = pas(etats.get(a), f); etats.set(a, r.etat); dernier.set(a, { vu: r.vu, faits: f }); } },
    de: (a) => dernier.get(a) || null,
  };
}

function verifier(L, app, serveur) {
  const ko = [];
  let n = 0;
  const ok = (c, m) => { n++; if (!c) ko.push(m); };
  const eq = (a, b, m) => { n++; try { assert.deepEqual(a, b); } catch (_) { ko.push(m); } };
  const essai = (f, m) => { try { f(); } catch (e) { n++; ko.push(m + ' — a jete : ' + (e && e.message)); } };

  /* ══ A. AJOUTER / RETIRER ══ */
  essai(() => {
    const live = L.creerLive();
    ok(L.ajouterTuile(live, { adr: '0x1234' }).ok === false, 'A: une adresse illisible est refusee');
    ok(L.ajouterTuile(live, { adr: UNIT.toUpperCase().replace('0X', '0x'), sym: 'UNIT' }).ok === true && live.tuiles[0].adr === UNIT, 'A: l adresse est gardee en minuscules');
    const dbl = L.ajouterTuile(live, { adr: UNIT });
    ok(dbl.ok === false && /already live/.test(dbl.pourquoi), 'A: un doublon est refuse, et la phrase le dit');
    ok(L.ajouterTuile(live, { adr: B }).ok && L.ajouterTuile(live, { adr: D }).ok, 'A: trois tuiles sur grand ecran');
    ok(L.ajouterTuile(live, { adr: '0x' + '2'.repeat(40) }).ok, 'A: quatre tuiles sur grand ecran');
    const trop = L.ajouterTuile(live, { adr: '0x' + '3'.repeat(40) });
    ok(trop.ok === false && /Up to 4/.test(trop.pourquoi) && live.tuiles.length === 4, 'A: la cinquieme est refusee (4 max sur grand ecran)');
    const tel = L.creerLive();
    ok(L.ajouterTuile(tel, { adr: UNIT }, { etroit: true }).ok && L.ajouterTuile(tel, { adr: B }, { etroit: true }).ok
      && L.ajouterTuile(tel, { adr: D }, { etroit: true }).ok === false, 'A: 2 max sur telephone');
    ok(L.retirerTuile(live, B) === true && !live.tuiles.some((t) => t.adr === B) && live.tuiles.length === 3, 'A: retirer enleve CETTE tuile, et elle seule');
    ok(L.retirerTuile(live, B) === false, 'A: retirer deux fois ne retire rien de plus');
    ok(L.ajouterTuile(live, { adr: B, sym: 'BBB' }).ok && live.tuiles.find((t) => t.adr === B).sym === 'BBB', 'A: la recherche ajoute le block CHOISI, avec son symbole');
  }, 'A');

  /* ══ B. TUILES INDEPENDANTES ══ */
  essai(() => {
    const adrs = [UNIT, B, D];
    const p = page(adrs, (a, i) => (a === UNIT ? varie(i) : a === B ? CALME : { ...FAITS, mort: a === D && i > 20 }));
    const live = L.creerLive();
    for (const a of adrs) L.ajouterTuile(live, { adr: a });
    const attendus = new Map(adrs.map((a) => [a, []]));
    const appels = [];
    for (let i = 0; i < 30; i++) {
      p.battre(i);
      for (const a of adrs) attendus.get(a).push(p.de(a).vu);
      const pris = L.nourrirLive(live, (adr, deja) => { appels.push(adr); const x = p.de(adr); return x ? { source: 'carte', vu: x.vu, faits: x.faits, nourritureLue: true } : null; });
      ok(pris.length === 3, 'B: battement ' + i + ' — chaque tuile prend son battement');
    }
    ok(appels.every((a, k) => a === adrs[k % 3]), 'B: chaque tuile ne demande que la source de SA propre adresse');
    for (const t of live.tuiles) {
      const att = attendus.get(t.adr).slice(-L.HISTO_TUILE);
      eq(t.histo.map((v) => v.tick), att.map((v) => v.tick), 'B: ' + t.adr.slice(0, 6) + ' — ses ticks, dans l ordre');
      ok(t.histo.every((v, k) => v === att[k]), 'B: ' + t.adr.slice(0, 6) + ' — exactement SES battements (memes objets)');
      ok(t.histo.every((v) => v.cablage === connectome(t.adr).empreinte), 'B: ' + t.adr.slice(0, 6) + ' — chaque battement porte SON cablage');
      ok(t.faits === p.de(t.adr).faits, 'B: ' + t.adr.slice(0, 6) + ' — les faits gardes sont ceux de SON dernier battement');
    }
    /* un appelant mal aiguille : il tend a UNIT le battement de B */
    p.battre(30);
    const tU = live.tuiles.find((t) => t.adr === UNIT);
    const avant = tU.histo.slice();
    const pris = L.nourrirLive(live, (adr) => { const x = p.de(adr === UNIT ? B : adr); return { source: 'carte', vu: x.vu, faits: x.faits }; });
    ok(!pris.includes(UNIT) && pris.length === 2, 'B: le battement de B tendu a UNIT est REFUSE ; les deux autres prennent le leur');
    ok(tU.histo.length === avant.length && tU.histo.every((v, k) => v === avant[k]) && tU.refus >= 1, 'B: la tuile de UNIT n a rien peint de B');
    const tB = live.tuiles.find((t) => t.adr === B);
    ok(tB.histo[tB.histo.length - 1] === p.de(B).vu, 'B: B a bien pris le sien, au meme battement');
  }, 'B');

  /* ══ C. RIEN D INVENTE ══ */
  essai(() => {
    const live = L.creerLive();
    L.ajouterTuile(live, { adr: UNIT, sym: 'UNIT' });
    const t = live.tuiles[0];
    const e0 = L.etiquetteTuile(t);
    ok(e0.humeur === 'no beat yet' && e0.phase === null && e0.tick === null && e0.spikes === null, 'C: sans battement, « no beat yet » — aucune humeur par defaut');
    const r0 = L.cadreTuile(t, {});
    ok(r0 && r0.k && r0.k.allumes.length === 0 && r0.k.tick === null && r0.k.humeur === null, 'C: sans battement, aucun neurone allume, aucune humeur');
    ok(L.nourrirLive(live, () => null).length === 0 && t.histo.length === 0, 'C: rien ne bat pour elle -> elle ne prend rien');
    const p = page([UNIT], (a, i) => varie(i));
    const phases = new Set();
    let allumesVus = 0;
    for (let i = 0; i < 26; i++) {
      p.battre(i);
      L.nourrirLive(live, (adr) => ({ source: 'carte', vu: p.de(adr).vu, faits: p.de(adr).faits, nourritureLue: true }));
      const vu = p.de(UNIT).vu;
      const e = L.etiquetteTuile(t);
      phases.add(vu.phase);
      ok(e.phase === vu.phase && e.humeur === V.humeurCourte(vu.phase) && e.tick === vu.tick && e.spikes === vu.spikes, 'C: battement ' + i + ' — etiquette = SON dernier battement');
      const r = L.cadreTuile(t, { capMap: 0.2 });
      eq(r.k.allumes, [...vu.indices].sort((a, b) => a - b), 'C: battement ' + i + ' — neurones allumes = vu.indices, exactement');
      allumesVus += r.k.allumes.length;
      ok(r.k.tick === vu.tick && r.k.phase === vu.phase, 'C: battement ' + i + ' — tick et humeur du cadre = le battement');
      /* le MEME renderer que le dialogue : champ() + cadreInterieur() appeles a la main donnent la meme empreinte */
      const c = V.champ({ adr: UNIT, faits: t.faits, vu, voisins: [], nourritureLue: true });
      const k = V.cadreInterieur({ c, faits: t.faits, histo: t.histo, i: t.histo.length - 1, capMap: 0.2 });
      ok(k.empreinte === r.k.empreinte, 'C: battement ' + i + ' — meme cadre que cadreInterieur(champ(...)) : meme empreinte');
    }
    ok(allumesVus > 0, 'C: le banc voit des neurones reellement allumes (' + allumesVus + ') — il ne teste pas que le silence');
    const m = L.cadreTuile(t, { reduit: true });
    ok(m.k.anime === false, 'C: prefers-reduced-motion -> cadre fixe');
  }, 'C');

  /* ══ D. MEME BATTEMENT, CERVEAU RECREE, UNE INSTANCE ══ */
  essai(() => {
    const live = L.creerLive();
    L.ajouterTuile(live, { adr: UNIT });
    const t = live.tuiles[0];
    let e = etatInitial(UNIT);
    const r1 = pas(e, FAITS); e = r1.etat;
    ok(L.nourrirTuile(t, { source: 'carte', vu: r1.vu, faits: FAITS }).pris, 'D: premier battement pris');
    ok(L.nourrirTuile(t, { source: 'carte', vu: r1.vu, faits: FAITS }).pris === false && t.histo.length === 1, 'D: le meme battement n est pas repris');
    const r2 = pas(e, FAITS);
    ok(L.nourrirTuile(t, { source: 'brain', vu: r2.vu, faits: FAITS }).pris === false && t.histo.length === 1, 'D: une autre instance de son cerveau (Brain) ne se melange pas a la map');
    ok(L.nourrirTuile(t, { source: 'inventee', vu: r2.vu }).pris === false, 'D: une source inconnue est refusee');
    ok(L.nourrirTuile(t, { source: 'carte', vu: { ...r2.vu, tick: 1.5 } }).pris === false, 'D: un battement sans tick entier est refuse');
    ok(L.nourrirTuile(t, { source: 'carte', vu: r2.vu, faits: FAITS }).pris && t.histo.length === 2, 'D: le battement suivant est pris');
    const neuf = pas(etatInitial(UNIT), CALME);
    ok(L.nourrirTuile(t, { source: 'carte', vu: neuf.vu, faits: CALME }).pris && t.histo.length === 1 && t.histo[0] === neuf.vu, 'D: un tick qui recule (cerveau recree) repart a zero');
    let s = neuf.etat;
    for (let i = 0; i < 40; i++) { const r = pas(s, CALME); s = r.etat; L.nourrirTuile(t, { source: 'carte', vu: r.vu, faits: CALME }); }
    ok(t.histo.length === L.HISTO_TUILE && t.histo[t.histo.length - 1].tick === 41, 'D: la tuile garde les ' + L.HISTO_TUILE + ' derniers battements');
  }, 'D');

  /* ══ E. LA TAILLE ══ */
  essai(() => {
    const b = L.bornerTailleLive;
    ok(b('w', 400, 1280, 800) === 400 && b('w', 100, 1280, 800) === 280 && b('w', 5000, 1280, 800) === 900 && b('w', 5000, 1000, 800) === 680, 'E: largeur bornee 280 .. min(900, ecran - 320)');
    ok(b('h', 50, 375, 812, 66) === 120 && b('h', 5000, 375, 812, 66) === 812 - 66 - 56 && b('h', 300, 375, 812, 66) === 300, 'E: hauteur bornee 120 .. hauteur utile - 56');
    ok([null, undefined, '', true, false, 'abc', NaN, Infinity].every((v) => b('w', v, 1280, 800) === null), 'E: une valeur illisible rend null (la taille d origine)');
    eq(L.lireTailleLive('{"w":5000,"h":"x"}', 1280, 800), { w: 900 }, 'E: une taille gardee est relue BORNEE, l illisible ignore');
    eq(L.lireTailleLive('pas du json', 1280, 800), {}, 'E: un texte garde casse ne jette pas et ne pose rien');
    eq(L.lireTailleLive(null, 1280, 800), {}, 'E: rien de garde -> rien');
    eq(L.lireTailleLive('[1,2]', 1280, 800), {}, 'E: un tableau n est pas une taille');
    ok(L.CLE_TAILLE_LIVE === 'tblock.live.taille.v1', 'E: la cle de la taille');
  }, 'E');

  /* ══ F. PUR ══ */
  essai(() => {
    const src = L.__src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    ok(!/Math\.random|Date\.now|new Date|performance\.now|fetch\s*\(|localStorage|sessionStorage|document\.|window\./.test(src), 'F: vision-live.js est pur');
    ok(/from '\.\/vision-cerveau\.js'/.test(src) && /cadreInterieur\(\{/.test(src) && /champ\(\{/.test(src), 'F: le cadre vient de vision-cerveau.js (pas une copie)');
  }, 'F');

  /* ══ G. APP.HTML ══ */
  essai(() => {
    const vmap = app.slice(app.indexOf('<section class="volet on" id="v-map"'), app.indexOf('</section>', app.indexOf('id="v-map"')));
    ok(/<button[^>]*id="bLiveMap"[^>]*aria-controls="bvPop"[^>]*>[\s\S]{0,80}Inside Block<\/button>/.test(vmap), 'G: le bouton Inside Block (ex-Live, renomme par Phil 2026-11-16) est sur la Map');
    /* 2026-10-27 (Phil) : le Live de la Map ouvre « View inside the brain » (#bvPop) sur le block cible, plus l ancien panneau */
    ok(/\$\('#bLiveMap'\)\.addEventListener\('click', ouvrirLiveVision\)/.test(app)
      && /function ouvrirLiveVision\(\) \{[\s\S]{0,1600}ouvrirVision\('brain'\)/.test(app)
      /* game64: a target OFF the map (UNIT, prod 2026-10-27) gets no beat -> the map's first living block; UNIT only with an empty map */
      && /function ouvrirLiveVision\(\) \{[\s\S]{0,500}liveCibleActuelle\(\)[\s\S]{0,900}voulu && surCarte\(voulu\) \? voulu : \(habitants\[0\][\s\S]{0,120}UNIT_APP/.test(app), 'G: Live (Map) -> fenetre cerveau, block cible SUR LA CARTE, sinon le premier block vivant, sinon UNIT');
    ok(/<aside class="blvPop" id="blvPop"[^>]*hidden>/.test(app) && /id="blvChamp"/.test(app) && /id="blvTuiles"/.test(app), 'G: le panneau Live, sa recherche et ses tuiles');
    ok(/\.bLive\{right:auto;left:12px/.test(app) && /\.blvPop\{position:fixed;z-index:71;left:12px/.test(app), 'G: le bouton en haut a gauche, le panneau docke a GAUCHE');
    ok(/@media \(max-width:760px\)\{\s*\.blvPop\{left:8px;right:8px;top:auto;bottom:/.test(app) && /\.blvPop\.blvReduit \.blvCorps/.test(app), 'G: telephone = une feuille en bas, repliable');
    ok(/\.blvSvg \.bviGlisse\{animation/.test(app.slice(app.indexOf('@media (prefers-reduced-motion:no-preference){'), app.indexOf('@media (prefers-reduced-motion:no-preference){') + 400)), 'G: les animations des tuiles ne vivent que sans mouvement reduit');
    const battre = app.slice(app.indexOf('function battre() {'), app.indexOf('function demarrerBattement()'));
    ok(/battreBrain\(\);[\s\S]*try \{ battreLive\(\); \}/.test(battre), 'G: le battement de la page nourrit les tuiles, APRES les cerveaux');
    const debut = app.indexOf('/* ══ LIVE (2026-10-26');
    const fin = app.indexOf(' * Le cablage, redessine A CHAQUE BATTEMENT.');
    const bloc = app.slice(debut, fin).replace(/\/\*[\s\S]*?\*\//g, '');
    ok(debut > 0 && fin > debut && bloc.length > 3000, 'G: le bloc Live est trouve');
    ok(/cadreTuile\(t, \{/.test(bloc) && /peindreInterieur\(r\.k, svg, null, 'blvClip' \+ t\.adr\)/.test(bloc), 'G: une tuile est dessinee par le MEME peindreInterieur, dans SON svg, sans « talk »');
    ok((app.match(/function peindreInterieur\(/g) || []).length === 1 && !/cadreInterieur\(/.test(bloc), 'G: un seul dessin Inside dans la page — aucune copie');
    /* game66 (owner: emotions in the feed): mood = etiquetteTuile; the feeling is the reading of the tile's OWN beats (penseeVision) */
    ok(/hu\.textContent = e\.humeur \+ \(senti \? ' · ' \+ senti\.word : ''\);/.test(bloc) && /penseeVision\(t\.histo, t\.histo\.length - 1, \{\}\)/.test(bloc) && /const e = etiquetteTuile\(t\);/.test(bloc), 'G: l humeur affichee est celle de etiquetteTuile, le ressenti celui de SES battements');
    ok(/if \(!t\.histo\.length\) \{\s*svg\.replaceChildren\(\);/.test(bloc), 'G: sans battement, la tuile ne dessine rien');
    ok(/reduit: bvReduit\(\)/.test(bloc), 'G: prefers-reduced-motion passe au cadre');
    ok(/nourrirLive\(live, liveSourceDe\)/.test(bloc) && /function liveSourceDe\(adr, deja\)/.test(bloc), 'G: chaque tuile lit la source de SA propre adresse');
    ok(/brancherRechercheB20\(\{ champ: \$\('#blvChamp'\), liste: \$\('#blvRes'\), auChoix: \(adr, sym\) => \{\s*if \(ajouterLive\(adr, sym\)\)/.test(bloc), 'G: la recherche partagee (/api/recherche) ajoute le block choisi');
    ok(/if \(e\.key !== 'Enter' \|\| !\/\^0x\[0-9a-fA-F\]\{40\}\$\/\.test\(v\)\) return;\s*e\.preventDefault\(\); e\.stopImmediatePropagation\(\);\s*if \(ajouterLive\(v, null\)\)/.test(bloc)
      && bloc.indexOf("$('#blvChamp').addEventListener('keydown'") < bloc.indexOf('brancherRechercheB20({'), 'G: une adresse entiere collee s ajoute sans l index (ecoute posee AVANT la recherche partagee)');
    ok(!/fetch\s*\(|\brpc\s*\(|getLogs|eth_|sendTransaction|wallet_|bcSigner|lireJson\s*\(/.test(bloc), 'G: aucun reseau ni signature dans le bloc Live');
    const sansTry = bloc.replace(/try \{[^{}]*(?:\{[^{}]*\}[^{}]*)*\} catch/g, '');
    ok(/localStorage/.test(bloc) && !/localStorage/.test(sansTry), 'G: chaque acces a localStorage est sous try/catch');
    ok(/const brut = lireTailleLive\(localStorage\.getItem\(CLE_TAILLE_LIVE\), 1e6, 1e6, 0\);/.test(bloc), 'G: garder une taille ne reborne pas l AUTRE axe a cet ecran (mesure 375 px : 440 -> 280)');
    ok(/'vision-live\.js'/.test(serveur), 'G: le module est servi (sinon le 404 arrete la page entiere)');
    ok(/import \{[^}]*cadreTuile[^}]*\} from '\.\/vision-live\.js';/.test(app), 'G: app.html importe le module Live');
  }, 'G');

  return { n, ko };
}

/* ══ LE MODULE REEL ══ */
const SRC = readFileSync(new URL('./vision-live.js', ICI), 'utf8');
const APP = readFileSync(new URL('./app.html', ICI), 'utf8');
const SERVEUR = readFileSync(new URL('./serveur-web.js', ICI), 'utf8');
const dossier = mkdtempSync(join(tmpdir(), 'banc-live-'));
let k = 0;
async function charger(src) {
  /* la copie importe les VRAIS cerveau.js / vision-cerveau.js du depot, par URL absolue */
  const s = src.replace("from './cerveau.js'", "from '" + new URL('./cerveau.js', ICI).href + "'")
    .replace("from './vision-cerveau.js'", "from '" + new URL('./vision-cerveau.js', ICI).href + "'");
  const f = join(dossier, 'vision-live-' + (k++) + '.mjs');
  writeFileSync(f, s);
  const M = await import(pathToFileURL(f).href);
  return { ...M, __src: src };
}
try {
  const reel = verifier(await charger(SRC), APP, SERVEUR);
  if (reel.ko.length) { console.error('KO :\n  ' + reel.ko.join('\n  ')); process.exit(1); }

  /* ══ MUTANTS ══ */
  const mutants = [
    ['M1 une humeur par defaut sans battement', 'mod', "humeur: vu ? humeurCourte(vu.phase) : 'no beat yet'", "humeur: vu ? humeurCourte(vu.phase) : humeurCourte('CALME')"],
    ['M2 un neurone allume invente', 'mod', 't.histo.push(b.vu);', 't.histo.push({ ...b.vu, indices: [...b.vu.indices, 0] });'],
    ['M3 la garde du cablage retiree', 'mod', 'if (b.vu.cablage !== t.cablage) {', 'if (false) {'],
    ['M4 la source d une AUTRE tuile', 'mod', 'b = sourceDe(t.adr, t.source);', 'b = sourceDe(live.tuiles[0].adr, t.source);'],
    ['M5 deux instances melangees', 'mod', "if (t.source && t.source !== b.source) return { pris: false, pourquoi: 'another instance of its brain' };", ''],
    ['M6 le meme battement repris', 'mod', "if (dernier && b.vu.tick === dernier.tick) return { pris: false, pourquoi: 'same beat' };", ''],
    ['M7 la taille non bornee', 'mod', 'return Math.round(Math.min(max, Math.max(min, n)));', 'return Math.round(n);'],
    ['M8 un booleen pris pour une taille', 'mod', "typeof v === 'boolean' || ", ''],
    ['M9 plus de 4 tuiles', 'mod', 'if (live.tuiles.length >= max)', 'if (live.tuiles.length > max)'],
    ['M10 l humeur affichee inventee (app)', 'app', "hu.textContent = e.humeur + (senti ? ' · ' + senti.word : '');", "hu.textContent = 'calm' + (senti ? ' · ' + senti.word : '');"],
    ['M11 la tuile dessine sans battement (app)', 'app', 'if (!t.histo.length) {', 'if (false) {'],
    ['M12 le battement ne nourrit plus Live (app)', 'app', '  try { battreLive(); }', '  try { void 0; }'],
    ['M13 une copie du renderer (app)', 'app', "if (r && r.k) peindreInterieur(r.k, svg, null, 'blvClip' + t.adr);", "if (r && r.k) peindreInterieurLive(r.k, svg);"],
    ['M14 taille lue hors try (app)', 'app', 'function liveReposerTailles() {', "function liveReposerTailles() { localStorage.getItem(CLE_TAILLE_LIVE);"],
    ['M15 module non servi', 'serveur', "'vision-live.js',", ''],
    ['M17 l adresse collee repasse par l index (app)', 'app', 'if (ajouterLive(v, null))', 'if (false)'],
    ['M16 l autre axe reborne a cet ecran (app)', 'app', 'lireTailleLive(localStorage.getItem(CLE_TAILLE_LIVE), 1e6, 1e6, 0)', 'liveLireTailles()'],
  ];
  let tues = 0;
  for (const [nom, cible, de, vers] of mutants) {
    const base = cible === 'mod' ? SRC : cible === 'app' ? APP : SERVEUR;
    if (!base.includes(de)) { console.error('mutant inapplicable (le motif n est plus dans la source) : ' + nom); process.exit(1); }
    const mute = base.replace(de, vers);
    let r;
    try {
      r = verifier(cible === 'mod' ? await charger(mute) : await charger(SRC), cible === 'app' ? mute : APP, cible === 'serveur' ? mute : SERVEUR);
    } catch (e) { r = { n: 0, ko: ['jete : ' + e.message] }; }
    if (r.ko.length) { tues++; console.log('ok  ' + nom + ' : tue (' + r.ko[0] + ')'); }
    else console.log('KO  ' + nom + ' : SURVIT');
  }
  console.log('test-vision-live-20261026 : ' + reel.n + ' assertions, OK — ' + tues + '/' + mutants.length + ' mutants tues');
  if (tues !== mutants.length) process.exit(1);
  console.log('⚠️ NE PROUVE PAS le rendu dans un navigateur, la cadence reelle, ni l absence de defilement a 375 px : mesure navigateur a part.');
} finally {
  try { rmSync(dossier, { recursive: true, force: true }); } catch (_) { /* le dossier temporaire du systeme se videra */ }
}
