/* tam-vue.js — TAM phase C : la logique PURE de l onglet TAM (aucun DOM, aucun reseau, aucune horloge, aucun hasard).
 *   Le dessin, les gestes et le son vivent dans tam-onglet.js ; ici seulement ce qui se prouve par un banc :
 *   - la projection VIVANTE N-D -> 3-D (rotation des plans caches) et les COUCHES (une par dimension : bascule, isoler, curseur 3..N) ;
 *   - le verdict du rejeu (« identical ✓ » SEULEMENT sur des octets egaux, octet pour octet) ;
 *   - la carte en anglais simple (familles, combinaison, le choix du cerveau tel que la graine le dit, les certificats LUS) ;
 *   - la regle du bouton Mint : pas d adresse TamArt = pas de bouton (bouton-mort-vaut-brouillon).
 * ⛔ Le moteur (tam-moteur.js) n est PAS modifie : ses octets sont ce qui se stocke. La vue vivante est une VUE. */
import { ODE, MAPS, PORTEUSES, RAISONS, appliquerReglage, generer, encoderOeuvre } from './tam-moteur.js';
import { keccak256Hex } from './keccak.js';
import { adresseTam } from './tam-plan.js';
import { displayShort } from './frais-creation.js';

const DEUX_PI = 2 * Math.PI, ANGLE_OR = 2.399963229728653;

/* ── le nombre de dimensions d une oeuvre (le meme calcul que le moteur) ── */
export function dimensionDe(P) {
  if (!P || MAPS[P.famille]) return 2;
  const fam = ODE[P.famille]; if (!fam) return 0;
  const base = fam.dim ?? P.dim ?? 6;
  return base * (P.operateur === 'couplage' ? P.k : 1);
}

/** les params d une oeuvre de l EXPLORATEUR (gratuit, jamais mintee telle quelle) : une porteuse, seule ou en k copies couplees */
export function paramsExplorateur({ famille = 'lorenz', copies = 1, dim96 = 6 } = {}) {
  if (!PORTEUSES.includes(famille)) throw new Error('unknown family');
  const P = { v: 1, operateur: 'seul', famille };
  if (famille === 'lorenz96') P.dim = [6, 8, 12].includes(Number(dim96)) ? Number(dim96) : 6;
  const k = Math.max(1, Math.min(4, Math.floor(Number(copies) || 1)));
  if (k > 1 && ODE[famille] && ODE[famille].dim === 3) { P.operateur = 'couplage'; P.k = k; P.eps = 0.2; }
  const D = dimensionDe(P);
  P.angles = []; for (let i = 0; i < D - 3; i++) P.angles.push((i + 1) * ANGLE_OR % DEUX_PI);
  return P;
}

/* ── la projection vivante ── */
export function standardiser(brut, n, D) {
  const z = new Float64Array(n * D);
  for (let j = 0; j < D; j++) {
    let m = 0; for (let i = 0; i < n; i++) m += brut[i * D + j]; m /= n;
    let v = 0; for (let i = 0; i < n; i++) { const w = brut[i * D + j] - m; v += w * w; }
    const s = v > 0 ? 1 / Math.sqrt(v / n) : 0;
    for (let i = 0; i < n; i++) z[i * D + j] = (brut[i * D + j] - m) * s;
  }
  return z;
}
function normaliser(a) {
  const n = a.length / 3, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { const v = a[3 * i + c]; if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; }
  const r = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2, s = r > 0 ? 1 / r : 0;
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) a[3 * i + c] = (a[3 * i + c] - (lo[c] + hi[c]) / 2) * s;
  return a;
}
/**
 * N-D -> 3-D, VIVANT. Les dimensions eteintes (actives[j] faux) valent 0 AVANT toute rotation : elles ne contribuent a rien.
 * La cascade du moteur (tam-moteur.js#projeterND : Givens (m, m+3), m DECROISSANT), aux angles de l oeuvre + t·(1 + 0,17 m).
 * t = 0 : exactement la projection stockee (a cos/sin natifs pres). t != 0 : chaque plan cache tourne a sa vitesse.
 */
export function projeterVivant({ z, n, D, actives, angles = [], t = 0 }) {
  const out = new Float64Array(n * 3), v = new Float64Array(Math.max(D, 3));
  const on = (j) => !actives || actives[j] !== false;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < D; j++) v[j] = on(j) ? z[i * D + j] : 0;
    if (D === 2) { out[3 * i] = v[0]; out[3 * i + 1] = v[1]; const p = Math.max(0, i - 1); out[3 * i + 2] = on(0) ? z[p * 2] : 0; continue; }
    for (let m = D - 4; m >= 0; m--) { const th = (angles[m] ?? 0) + t * (1 + 0.17 * m), c = Math.cos(th), s = Math.sin(th), a = v[m], b = v[m + 3]; v[m] = c * a - s * b; v[m + 3] = s * a + c * b; }
    out[3 * i] = v[0]; out[3 * i + 1] = v[1]; out[3 * i + 2] = v[2];
  }
  return normaliser(out);
}

/* ── 2026-11-08 (Phil: "add lines to TAM, not only points") : the OPTIONAL line channel ──
 *   A subject may return `segments`: [{ a: [x0..xD-1], b: [x0..xD-1], w?: 0..1, c?: class }], both ends in the SAME raw columns as its
 *   points (brut). They go through the SAME transform as the points (column scale m, k; the live N-D -> 3-D rotation; the frame of the
 *   POINTS alone), so a line lands exactly where its two ends would land as points. w = opacity and width (default 1), c = colour class.
 *   A subject without segments: projeterSegments returns null and nothing is drawn (the points are untouched). */
export const SEGMENTS_MAX = 40000;
/* colour classes: 0 neutral, 1 red, 2 blue, 3 gold, 4 green, 5 violet (never the colours of the dimensions: those colour the points) */
export const COULEURS_SEGMENTS = Object.freeze(['#a9b8d8', '#ff6b6b', '#5aa9ff', '#ffd36b', '#6bffb0', '#c58cff']);
export const PAQUETS_POIDS = 4;
/** the segments a view can draw: both ends finite on the D columns, w clamped to 0..1 (missing = 1), c an integer class (missing = 0) */
export function segmentsValides(segments, D) {
  if (!Array.isArray(segments) || !(D >= 1)) return [];
  const out = [];
  for (const s of segments) {
    if (out.length >= SEGMENTS_MAX) break;
    if (!s || !Array.isArray(s.a) || !Array.isArray(s.b) || s.a.length < D || s.b.length < D) continue;
    let fini = true; for (let j = 0; j < D && fini; j++) fini = Number.isFinite(s.a[j]) && Number.isFinite(s.b[j]);
    if (!fini) continue;
    const w = s.w === undefined ? 1 : Number(s.w), c = Number.isInteger(s.c) && s.c >= 0 && s.c < COULEURS_SEGMENTS.length ? s.c : 0;
    out.push({ a: s.a, b: s.b, w: Number.isFinite(w) ? Math.max(0, Math.min(1, w)) : 1, c });
  }
  return out;
}
/**
 * The segments in the view of the points: { xyz: Float64Array(q * 6) (a then b, normalised like positions()), poids, classes, q }, or null.
 * m, k = the column scale of the points (tam-science.js#echelleIso) ; z = the standardised points (n x D). Joint projection then the frame of
 * the points alone (the same recipe as the decor in tam-onglet.js#decorVue). D = 2 has no line (its 3rd axis is the previous point).
 */
export function projeterSegments({ segments, m, k, z, n, D, actives, angles = [], t = 0 }) {
  if (!(D >= 3) || !z || !m || !k) return null;
  const S = segmentsValides(segments, D), q = S.length;
  if (!q) return null;
  const zc = new Float64Array((n + 2 * q) * D); zc.set(z.subarray(0, n * D));
  for (let r = 0; r < q; r++) for (let j = 0; j < D; j++) {
    zc[(n + 2 * r) * D + j] = (S[r].a[j] - m[j]) * k[j];
    zc[(n + 2 * r + 1) * D + j] = (S[r].b[j] - m[j]) * k[j];
  }
  const pr = projeterVivant({ z: zc, n: n + 2 * q, D, actives, angles, t });
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { const v = pr[3 * i + c]; if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; }
  const r0 = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2 || 1, mil = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const xyz = new Float64Array(q * 6), poids = new Float32Array(q), classes = new Uint8Array(q);
  for (let r = 0; r < q; r++) {
    for (let e = 0; e < 2; e++) for (let c = 0; c < 3; c++) xyz[6 * r + 3 * e + c] = (pr[3 * (n + 2 * r + e) + c] - mil[c]) / r0;
    poids[r] = S[r].w; classes[r] = S[r].c;
  }
  return { xyz, poids, classes, q };
}
/** one stroke per (class, weight bucket): [{ classe, paquet, couleur, alpha, largeur (css px), indices }] — a few strokes, not one per line */
export function paquetsSegments(sv) {
  if (!sv || !sv.q) return [];
  const par = new Map();
  for (let r = 0; r < sv.q; r++) {
    const p = Math.min(PAQUETS_POIDS - 1, Math.floor(sv.poids[r] * PAQUETS_POIDS)), cle = sv.classes[r] * PAQUETS_POIDS + p;
    let g = par.get(cle); if (!g) { g = { classe: sv.classes[r], paquet: p, indices: [] }; par.set(cle, g); }
    g.indices.push(r);
  }
  return [...par.values()].sort((x, y) => x.paquet - y.paquet || x.classe - y.classe).map((g) => ({ ...g,
    couleur: COULEURS_SEGMENTS[g.classe], alpha: 0.05 + 0.13 * g.paquet, largeur: 0.5 + 0.35 * g.paquet }));
}
/**
 * Draws the segments on a 2-D canvas context, UNDER the points (call it before them). `ecran(x, y, z)` = the same camera as the points,
 * in scene units (called as the points are: x * sc, -y * sc, z * sc) -> { sx, sy } or null. `aplati` = the front view flattens depth to 0.
 */
export function dessinerSegments(g, sv, ecran, { sc = 1, dpr = 1, aplati = false } = {}) {
  const P = paquetsSegments(sv); if (!P.length) return 0;
  const X = sv.xyz; let traits = 0;
  g.shadowBlur = 0; g.lineCap = 'round';
  for (const p of P) {
    g.strokeStyle = p.couleur; g.globalAlpha = p.alpha; g.lineWidth = Math.max(0.5, p.largeur * dpr); g.beginPath();
    for (const r of p.indices) {
      const o = 6 * r, u = ecran(X[o] * sc, -X[o + 1] * sc, aplati ? 0 : X[o + 2] * sc), v = ecran(X[o + 3] * sc, -X[o + 4] * sc, aplati ? 0 : X[o + 5] * sc);
      if (!u || !v || !Number.isFinite(u.sx) || !Number.isFinite(v.sx)) continue;
      g.moveTo(u.sx, u.sy); g.lineTo(v.sx, v.sy); traits++;
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  return traits;
}

/* ── 2026-11-08 (Phil's production screenshot: the brain's lines in a block on the right, its points on the left) : INDEXED segments ──
 *   A segment may name the two POINTS it joins: ia, ib = indices into the subject's point order. It is then drawn between the screen
 *   positions ACTUALLY used for those points (sx, sy: whatever path drew them: the stored view of a work, the live projection, a rotation,
 *   layers off), so a line can never leave its points. Segments without ia/ib keep projeterSegments (ends that are not points). */
/** the indexed segments of a subject: null when any segment lacks integer ia/ib (then the coordinate path is used); pairs outside 0..n-1 dropped */
export function segmentsIndexes(segments, n) {
  if (!Array.isArray(segments) || !segments.length || !(n >= 1)) return null;
  const ia = [], ib = [], poids = [], classes = [];
  for (const s of segments) {
    if (!s || !Number.isInteger(s.ia) || !Number.isInteger(s.ib)) return null;
    if (ia.length >= SEGMENTS_MAX || s.ia < 0 || s.ib < 0 || s.ia >= n || s.ib >= n) continue;
    const w = s.w === undefined ? 1 : Number(s.w), c = Number.isInteger(s.c) && s.c >= 0 && s.c < COULEURS_SEGMENTS.length ? s.c : 0;
    ia.push(s.ia); ib.push(s.ib); poids.push(Number.isFinite(w) ? Math.max(0, Math.min(1, w)) : 1); classes.push(c);
  }
  return { q: ia.length, ia: Int32Array.from(ia), ib: Int32Array.from(ib), poids: Float32Array.from(poids), classes: Uint8Array.from(classes) };
}
/** draws indexed segments between the DRAWN screen positions sx[i], sy[i] of their points; one stroke per (class, weight bucket) */
export function dessinerSegmentsIndexes(g, si, sx, sy, { dpr = 1 } = {}) {
  const P = paquetsSegments(si); if (!P.length) return 0;
  let traits = 0; g.shadowBlur = 0; g.lineCap = 'round';
  for (const p of P) {
    g.strokeStyle = p.couleur; g.globalAlpha = p.alpha; g.lineWidth = Math.max(0.5, p.largeur * dpr); g.beginPath();
    for (const r of p.indices) {
      const a = si.ia[r], b = si.ib[r];
      if (!Number.isFinite(sx[a]) || !Number.isFinite(sy[a]) || !Number.isFinite(sx[b]) || !Number.isFinite(sy[b])) continue;
      g.moveTo(sx[a], sy[a]); g.lineTo(sx[b], sy[b]); traits++;
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  return traits;
}

/* ── les couches : une par dimension ── */
export const couleurDim = (j) => 'hsl(' + Math.round((j * 137.508 + 195) % 360) + ' 85% 62%)';
export const etatCouches = (D) => ({ D, actives: Array.from({ length: D }, () => true) });
export function basculer(e, j) { const a = e.actives.slice(); if (j >= 0 && j < e.D) a[j] = !a[j]; return { ...e, actives: a }; }
export function isoler(e, j) { return { ...e, actives: e.actives.map((_, i) => i === j) }; }
export function toutes(e) { return { ...e, actives: e.actives.map(() => true) }; }
/** le curseur « 3-D -> N-D » : les k premieres dimensions allumees, les autres eteintes */
export function jusqua(e, k) { const kk = Math.max(Math.min(e.D, 2), Math.min(e.D, Math.floor(k))); return { ...e, actives: e.actives.map((_, i) => i < kk) }; }
export const dimsVisibles = (e) => e.actives.map((a, i) => (a ? i : -1)).filter((i) => i >= 0);
/** les paires (i < j) des dimensions visibles : la grille « exploded » */
export function pairesVisibles(e, max = 66) {
  const v = dimsVisibles(e), out = [];
  for (let a = 0; a < v.length; a++) for (let b = a + 1; b < v.length; b++) if (out.length < max) out.push([v[a], v[b]]);
  return out;
}
/** une serie par dimension, normalisee 0..1 (pour les panneaux et la voix) */
export function series(z, n, D) {
  const s = [];
  for (let j = 0; j < D; j++) {
    let lo = Infinity, hi = -Infinity; for (let i = 0; i < n; i++) { const x = z[i * D + j]; if (x < lo) lo = x; if (x > hi) hi = x; }
    const r = hi - lo, a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = r > 0 ? (z[i * D + j] - lo) / r : 0.5;
    s.push(a);
  }
  return s;
}
/** le point le plus proche d un pointeur dans un panneau (indices i, coordonnees deja a l ecran) ; null au-dela de `rayon` px */
export function indexProche(xs, ys, x, y, rayon = 14) {
  let best = -1, d2 = rayon * rayon;
  for (let i = 0; i < xs.length; i++) { const dx = xs[i] - x, dy = ys[i] - y, d = dx * dx + dy * dy; if (d < d2) { d2 = d; best = i; } }
  return best >= 0 ? best : null;
}

/* ── le rejeu ── */
/** « identical ✓ » SEULEMENT si les deux sont des octets, non vides, de meme longueur, egaux octet pour octet */
export function verdictRejeu(rejoues, chaine) {
  const ok = rejoues instanceof Uint8Array && chaine instanceof Uint8Array && rejoues.length > 0 && rejoues.length === chaine.length
    && rejoues.every((b, i) => b === chaine[i]);
  return ok ? { identique: true, texte: 'identical ✓' } : { identique: false, texte: 'different ✗' };
}

/* ── le bouton Mint ── */
export const mintVisible = (dep) => adresseTam(dep) !== null;

/* ── la carte, en anglais simple ── */
const NOMS = { lorenz: 'Lorenz', rossler: 'Rössler', aizawa: 'Aizawa', thomas: 'Thomas', halvorsen: 'Halvorsen', dadras: 'Dadras', chen: 'Chen',
  sprott: 'Sprott B', lorenz96: 'Lorenz-96', clifford: 'Clifford map', dejong: 'De Jong map' };
const MOTIFS_EN = { ifs: 'an iterated function system', julia: 'a Julia set', phyllotaxie: 'golden-angle phyllotaxis', epicycles: 'epicycles', lsysteme: 'an L-system' };
const VARIANTES = { fougere: 'fern', sierpinski: 'Sierpinski', dragon: 'dragon', koch: 'Koch', plante: 'plant' };
export const nomFamille = (f) => NOMS[f] || String(f);
const nb = (x, k = 3) => (Number.isFinite(Number(x)) ? Number(x).toFixed(k) : 'not measured');
const court = (h) => (typeof h === 'string' && h.length > 14 ? displayShort(h, 10) : String(h || ''));
export function combinaison(P) {
  const D = dimensionDe(P), c = nomFamille(P.famille) + (P.famille === 'lorenz96' ? ' (' + P.dim + ' variables)' : '');
  const m = P.motif ? MOTIFS_EN[P.motif.famille] + (P.motif.variante ? ' (' + (VARIANTES[P.motif.variante] || P.motif.variante) + ')' : '') : '';
  if (P.operateur === 'couplage') return P.k + ' coupled copies of ' + c + ', ' + D + '-D (coupling ' + nb(P.eps, 2) + ')';
  if (P.operateur === 'somme') return c + ' blended with ' + m + ' (weight ' + nb(P.w, 2) + '), ' + D + '-D';
  if (P.operateur === 'composition') return m + ' driven by ' + c + ', ' + D + '-D';
  return c + ' alone, ' + D + '-D';
}
/**
 * La carte d une oeuvre : des lignes { k, v } en anglais. `c` = certificats (certifier), `choix` = { graine, bloc, empreinteEtat, essai, rejets,
 * source } quand le cerveau a choisi, `nMintees` = les oeuvres comparees pour la distance.
 * game377 : `minteesLues` = les oeuvres mintees que l onglet a LUES (sa galerie), null tant qu il ne les a pas lues. Une oeuvre de
 *   l explorateur (sans choix du cerveau) n est comparee a AUCUNE oeuvre dans la page (certifier(o, [])) : c est le serveur qui mesure la
 *   distance au clic sur Mint. Avant : « yes (no minted work to compare with yet) » alors que 3 oeuvres etaient mintees.
 */
export function distinctExplorateur(minteesLues) {
  const n = Number.isInteger(minteesLues) && minteesLues >= 0 ? minteesLues : null;
  if (n === 0) return 'yes (no minted work to compare with yet)';
  return 'checked when you press Mint: the server compares it with ' + (n === null ? 'every minted work' : 'the ' + n + ' minted work' + (n === 1 ? '' : 's'))
    + ' (threshold 0.20)';
}
export function carte({ P, c, choix = null, nMintees = 0, minteesLues = null }) {
  const L = [];
  L.push({ k: 'Families', v: [nomFamille(P.famille), P.motif ? MOTIFS_EN[P.motif.famille] : null].filter(Boolean).join(' + ') });
  L.push({ k: 'Combination', v: combinaison(P) });
  if (choix) {
    const rej = Array.isArray(choix.rejets) ? choix.rejets : [];
    /* quel cerveau, quel battement (etiquette du serveur, tam-serveur.js#etiquetteCerveau) ; sans etiquette : « an unnamed brain state » */
    const cv = choix.cerveau && typeof choix.cerveau.etiquette === 'string' ? choix.cerveau.etiquette : 'an unnamed brain state';
    L.push({ k: 'Which brain', v: 'Seed: ' + (choix.bloc ? 'hash of Base block ' + choix.bloc : court(choix.graine)) + ' + ' + cv + '.' });
    L.push({ k: 'What the brain chose', v: 'The seed ' + court(choix.graine) + ' and the brain state hash ' + court(choix.empreinteEtat)
      + ' are hashed together. That hash stream draws the combination, then each parameter, in a fixed order.' });
    L.push({ k: 'Why this one', v: 'Try #' + choix.essai + ' was the first to pass every certificate.' + (rej.length ? ' Earlier tries were dropped: '
      + rej.slice(0, 4).map((r) => nomFamille(r.famille) + ' — ' + (r.raisons || []).map((x) => RAISONS_EN[x] || x).join(', ')).join('; ') + (rej.length > 4 ? '; and ' + (rej.length - 4) + ' more' : '') + '.' : '')
      + ' The brain searches combinations of known families; this is not new mathematics.' });
  } else L.push({ k: 'Who chose', v: 'You did, in the free explorer.' });
  /* 2026-11-01 : une oeuvre REGLEE le dit : par le joueur, ou par le cerveau (ce qu il a bouge, de a vers b) */
  if (P.regle) L.push({ k: 'Tuned', v: P.reglage && P.reglage.par === 'cerveau' ? phraseMouvements(P.reglage.mouvements) : 'You set the variables yourself. The same checks apply before any mint.' });
  if (c) {
    const fen = Array.isArray(c.lyapunovFenetres) && c.lyapunovFenetres.length ? '; on a longer run: ' + c.lyapunovFenetres.map((x) => nb(x)).join(' and ') : '';
    L.push({ k: 'Chaotic', v: c.lyapunov > 0.02 && !(c.codes || []).some((k) => k === 'CYCLE_LONG') ? 'yes, λ = ' + nb(c.lyapunov) + ' ' + (c.uniteLyapunov === 'par iteration' ? 'per iteration' : 'per time unit') + fen : 'no, λ = ' + nb(c.lyapunov) + fen });
    if (Number.isFinite(c.plat)) L.push({ k: 'Not flat', v: (c.plat >= 0.03 ? 'yes' : 'no') + ' (thinnest axis ' + nb(c.plat, 2) + ' of the widest, minimum 0.03)' });
    L.push({ k: 'Bounded', v: c.bornee ? 'yes, for all ' + (c.etapes || P.n || 1500) + ' recorded steps' : 'no, it escaped' });
    L.push({ k: 'Box dimension', v: '≈ ' + nb(c.dimension, 2) + ' (rough estimate, 4 box sizes)' });
    L.push({ k: 'Distinct from the minted works', v: nMintees > 0 ? (c.distanceMin >= 0.2 ? 'yes' : 'no') + ' (closest distance ' + nb(c.distanceMin, 2) + ' over ' + nMintees + ' works, threshold 0.20)' : choix ? 'yes (no minted work to compare with yet)' : distinctExplorateur(minteesLues) });
  }
  return L;
}
/* 2026-11-01 : les raisons d un refus, par CODE stable du moteur (tam-moteur.js#RAISONS) — ce que l ecran dit d un reglage refuse */
export const CODES_EN = Object.freeze({
  DIVERGE: 'escapes to infinity', DIVERGE_LONG: 'escapes to infinity on a longer run',
  CYCLE: 'simple cycle (it settles into a loop or a point)', CYCLE_LONG: 'simple cycle on a longer run (a slow loop, not chaos)',
  COURBE: 'too thin (a curve, not a shape)', PLAT: 'flat (a sheet seen edge-on)', DOUBLON: 'too close to an existing work',
  SIGNATURE_NON_LUE: 'the minted works could not be read, so closeness was not measured', HORS_BORNES: 'outside the allowed range',
});
const RAISONS_EN = Object.fromEntries(Object.entries(RAISONS).map(([code, fr]) => [fr, CODES_EN[code]]));
/** le verdict d un reglage (joueur ou cerveau), en anglais simple, avec SES raisons */
export function verdictReglage(c) {
  if (!c) return { ok: false, texte: 'Not checked yet.' };
  if (c.ok) return { ok: true, texte: 'Passes every check: chaotic on two separate long runs, bounded, not flat, not a curve' + (c.distanceMin < 1 ? ', distinct' : '') + '.' };
  const r = (c.codes || []).map((k) => CODES_EN[k] || k);
  return { ok: false, texte: 'Not mintable: ' + (r.length ? r.join('; ') : 'not certified') + '.' };
}
const n3 = (x) => (Number.isFinite(Number(x)) ? Number(x).toFixed(3) : String(x));
/** « the brain moved b from 2.700 to 2.912 and eps from 0.200 to 0.236 » */
export function phraseMouvements(mouvements) {
  const m = Array.isArray(mouvements) ? mouvements : [];
  return m.length ? 'The brain moved ' + m.map((x) => x.nom + ' from ' + n3(x.de) + ' to ' + n3(x.a)).join(' and ') + '.' : 'The brain moved nothing.';
}
/**
 * UNE variable bougee par un curseur : la copie des params (appliquerReglage : SEUL ce chemin change, arrondi d abord), l oeuvre et SES
 * octets — generes depuis les params ARRONDIS, donc exactement ce que rejouer(JSON.parse(paramsJson)) recalcule.
 */
export function oeuvreReglee(P, chemin, valeur) {
  const Q = appliquerReglage(P, chemin, valeur);
  const o = generer(Q);
  return { params: Q, oeuvre: o, octets: o.bornee ? encoderOeuvre(o) : null };
}
/**
 * LE PORTAIL DU MINT (choix du cerveau ET oeuvre reglee) : TamArt deploye, les certificats de CETTE page sur CES params (local), ceux du
 * SERVEUR (qui mesure la distance a toutes les oeuvres mintees) sur les MEMES octets, et une oeuvre tiree pour CE wallet.
 */
function pourquoiServeur(serveur) {
  if (!serveur) return 'the server has not certified this work';
  const codes = Array.isArray(serveur.codes) ? serveur.codes.filter((k) => CODES_EN[k]) : [];
  if (codes.length) return codes.map((k) => CODES_EN[k]).join('; ');
  const fr = String(serveur.pourquoi || '').split('; ').filter(Boolean);
  if (fr.length && fr.every((x) => RAISONS_EN[x])) return fr.map((x) => RAISONS_EN[x]).join('; ');
  return serveur.pourquoi ? String(serveur.pourquoi) : 'the server has not certified this work';
}
export function peutMinter({ dep, local, serveur, octets, P, compte = null }) {
  if (!mintVisible(dep)) return { ok: false, pourquoi: 'TAM minting is coming soon' };
  if (!local || !local.ok) return { ok: false, pourquoi: verdictReglage(local).texte };
  /* 2026-11-12 (browser check): the server's refusal carries the engine's FRENCH reasons ("quasi-doublon") — the screen says its codes in English */
  if (!serveur || serveur.ok !== true || serveur.etat !== 'CERTIFIE') return { ok: false, pourquoi: pourquoiServeur(serveur) };
  if (!(octets instanceof Uint8Array) || serveur.hash !== keccak256Hex(octets)) return { ok: false, pourquoi: 'the server certified other bytes' };
  if (!P || !P.minteur || !compte) return { ok: false, pourquoi: 'connect your wallet, then ask again: each work is drawn for one wallet' };
  if (String(P.minteur).toLowerCase() !== String(compte).toLowerCase()) return { ok: false, pourquoi: 'this work was drawn for another wallet' };
  return { ok: true, pourquoi: null };
}
