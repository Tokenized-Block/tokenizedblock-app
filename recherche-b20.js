// recherche-b20.js - UNE RECHERCHE POUR TOUT B20 : symbole, nom ou adresse (entiere ou debut), en memoire, sans lecture de chaine.
// 2026-10-26 (proprietaire : « improve the block search so every B20 is easy to find ») - MESURE en prod (build game53) :
//   Map Find « RBLXc » -> « No block named « RBLXc » among the 1,171 names read so far », alors que RBLXc est dans la liste des actions
//   PROUVEES (actionsChaine.liste de /api/trending, adresse et symbole) et que l index des createurs tient ~21 600 blocks.
//   /api/chercher ne regardait que le trending et l index des noms (egalite exacte), et l index des noms repart de zero a chaque
//   deploiement (1 091 lus sur 21 686 ce matin). « UNIT » lui-meme, le block de l app, y etait ABSENT.
// ⇒ Ici : UN index fusionne par adresse (sources : nos blocks, trending, actions prouvees, faits de creation, noms lus, adresses connues),
//   une requete VALIDEE (refus explicite), un classement dit (rang), des resultats bornes, la couverture rendue avec chaque reponse.
// ⛔ Ce module ne lit RIEN sur la chaine : aucune entree du client n atteint un noeud. Un nom ou un symbole lu sur la chaine est celui que
//   le createur a ecrit : il ne prouve rien. L adresse entiere est toujours rendue.

export const Q_MAX = 48, LIMITE_DEFAUT = 8, LIMITE_MAX = 20;
const ADR = /^0x[0-9a-f]{40}$/;
/* caracteres de controle, de format (bidi, zero-width), prives ou substituts : refuses dans la requete, retires des noms servis */
const INVISIBLES = /[\p{Cc}\p{Cf}\p{Co}\p{Cs}]/u;
const INVISIBLES_G = /[\p{Cc}\p{Cf}\p{Co}\p{Cs}]/gu;

/** minuscules, sans diacritiques (NFKD puis marques retirees), espaces reduits. « Société » -> « societe ». */
export function normaliser(s) {
  return String(s == null ? '' : s).normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Le texte servi (nom ou symbole) : sans invisibles, borne. null si vide. */
function propre(s, max) {
  if (s == null) return null;
  const t = String(s).replace(INVISIBLES_G, '').replace(/\s+/g, ' ').trim().slice(0, max);
  return t || null;
}

/** Valide la requete. Rend { ok: true, q, mode: 'ADRESSE'|'TEXTE', limite } ou { ok: false, pourquoi }. Rien n est devine. */
export function validerRequete(brut, limiteBrute) {
  if (typeof brut !== 'string' || !brut.trim()) return { ok: false, pourquoi: 'usage: /api/recherche?q=<symbol, name or address> (1 to ' + Q_MAX + ' characters)' };
  if (brut.length > 200) return { ok: false, pourquoi: 'the search is limited to ' + Q_MAX + ' characters' };
  if (INVISIBLES.test(brut)) return { ok: false, pourquoi: 'control or invisible characters are not accepted' };
  const q = normaliser(brut);
  if (!q || q.length > Q_MAX) return { ok: false, pourquoi: 'the search is limited to ' + Q_MAX + ' characters' };
  let limite = LIMITE_DEFAUT;
  if (limiteBrute !== null && limiteBrute !== undefined && limiteBrute !== '') {
    if (!/^\d{1,2}$/.test(String(limiteBrute)) || Number(limiteBrute) < 1 || Number(limiteBrute) > LIMITE_MAX) return { ok: false, pourquoi: 'n must be a whole number from 1 to ' + LIMITE_MAX };
    limite = Number(limiteBrute);
  }
  if (/^0x[0-9a-f]*$/.test(q)) {
    if (q.length < 3) return { ok: false, pourquoi: 'type at least one character after 0x' };
    if (q.length > 42) return { ok: false, pourquoi: 'an address has 42 characters' };
    return { ok: true, q, mode: 'ADRESSE', limite };
  }
  /* `brut` : la saisie telle quelle (espaces reduits), pour departager les homonymes par la CASSE exacte (« SHADR » contre 21 « Shadr ») */
  return { ok: true, q, mode: 'TEXTE', limite, brut: brut.trim().replace(/\s+/g, ' ') };
}

/** Une action tokenisee porte son symbole avec ET sans le « c » final (la liste prouvee dit « TSLA », la chaine et DexScreener « TSLAc »). */
function alias(sym, action) {
  const s = [sym];
  if (action && /[A-Za-z0-9.]$/.test(sym)) s.push(/c$/.test(sym) ? sym.slice(0, -1) : sym + 'c');
  return s.filter((x) => x && x.length);
}

/**
 * Fusionne les sources par adresse. `sources` : [{ nom, entrees: iterable de { adr, sym?, nom?, marche?, action?, notre?, volume? } }].
 * Une entree a l adresse mal formee est ignoree. Le premier symbole / nom rencontre (ordre des sources) est celui qui est servi.
 */
/* game354 (Phil 2026-11-11): the OLD test token named TBLOCK (created by the app at block 51,260,745) is hidden — copied from tokenomics.js */
const TBLOCK_TEST_ANCIEN_RECHERCHE = '0xb20000000000000000000024c30d3fcb7931272e';
export function construireIndex(sources) {
  const par = new Map();
  for (const src of sources || []) {
    for (const e of (src && src.entrees) || []) {
      const adr = String((e && e.adr) || '').toLowerCase();
      if (!ADR.test(adr)) continue;
      if (adr === TBLOCK_TEST_ANCIEN_RECHERCHE) continue; /* game354: the OLD test "TBLOCK" is never found by search */
      let x = par.get(adr);
      if (!x) { x = { adr, syms: [], noms: [], sources: new Set(), action: false, marche: false, notre: false, volume: 0 }; par.set(adr, x); }
      x.sources.add(String(src.nom || '?'));
      const sym = propre(e.sym, 32), nom = propre(e.nom, 64);
      if (sym && !x.syms.includes(sym)) x.syms.push(sym);
      if (nom && !x.noms.includes(nom)) x.noms.push(nom);
      if (e.action) x.action = true;
      if (e.marche) x.marche = true;
      if (e.notre) x.notre = true;
      const v = Number(e.volume);
      if (Number.isFinite(v) && v > x.volume) x.volume = v;
    }
  }
  const entrees = [];
  let nommes = 0;
  for (const x of par.values()) {
    const symsN = [...new Set(x.syms.flatMap((s) => alias(s, x.action)).map(normaliser).filter(Boolean))];
    const nomsN = [...new Set(x.noms.map(normaliser).filter(Boolean))];
    if (x.syms.length || x.noms.length) nommes += 1;
    entrees.push({ ...x, sources: [...x.sources], symsN, nomsN });
  }
  return { entrees, taille: entrees.length, nommes };
}

/* les rangs, du plus fort au plus faible ; un rang domine toujours les bonus (score = rang x 10 000 ; bonus + casse <= 1 299) */
export const RANGS = Object.freeze({ ADRESSE: 9, SYMBOLE: 8, NOM: 7, SYMBOLE_DEBUT: 6, ADRESSE_DEBUT: 6, NOM_DEBUT: 5, SYMBOLE_CONTIENT: 3, NOM_CONTIENT: 2 });
const NOM_RANG = Object.fromEntries(Object.entries(RANGS).map(([k]) => [k, k]));

function rangTexte(e, q) {
  let r = 0, quoi = null;
  const prendre = (v, k) => { if (v > r) { r = v; quoi = k; } };
  for (const s of e.symsN) {
    if (s === q) prendre(RANGS.SYMBOLE, 'SYMBOLE');
    else if (s.startsWith(q)) prendre(RANGS.SYMBOLE_DEBUT, 'SYMBOLE_DEBUT');
    else if (q.length >= 2 && s.includes(q)) prendre(RANGS.SYMBOLE_CONTIENT, 'SYMBOLE_CONTIENT');
  }
  for (const n of e.nomsN) {
    if (n === q) prendre(RANGS.NOM, 'NOM');
    else if (n.startsWith(q) || n.includes(' ' + q)) prendre(RANGS.NOM_DEBUT, 'NOM_DEBUT');
    else if (q.length >= 2 && n.includes(q)) prendre(RANGS.NOM_CONTIENT, 'NOM_CONTIENT');
  }
  return { r, quoi };
}

/** bonus a rang egal : notre block d abord, puis les actions, puis les blocks a marche (et leur volume 24 h) */
function bonus(e) {
  /* notre block (600) passe devant un homonyme a la casse exacte, a marche et volume maximal (300 + 100 + 99 = 499) */
  return (e.notre ? 600 : 0) + (e.action ? 200 : 0) + (e.marche ? 100 : 0) + Math.min(99, Math.round(Math.log10(1 + Math.max(0, e.volume)) * 10));
}

/** Cherche `requete` (sortie OK de validerRequete) dans `index` (construireIndex). Rend { resultats, total, plus }. */
export function chercherB20(requete, index) {
  const { q, mode, limite } = requete;
  const trouves = [];
  for (const e of (index && index.entrees) || []) {
    let r = 0, quoi = null;
    if (mode === 'ADRESSE') {
      if (e.adr === q) { r = RANGS.ADRESSE; quoi = 'ADRESSE'; } else if (e.adr.startsWith(q)) { r = RANGS.ADRESSE_DEBUT; quoi = 'ADRESSE_DEBUT'; }
    } else ({ r, quoi } = rangTexte(e, q));
    if (!r) continue;
    /* 2026-10-26 (mesure : « SHADR » rangé 19e derriere 18 « Shadr » a marche) : le symbole tape a la casse pres passe devant ses
     *   homonymes au meme rang (+300 : sous notre block, au-dessus d un marche ; une action prouvee garde son bonus d action en plus) */
    const casse = mode === 'TEXTE' && requete.brut && e.syms.includes(requete.brut) ? 300 : 0;
    trouves.push({ e, quoi: NOM_RANG[quoi], score: r * 10000 + bonus(e) + casse });
  }
  trouves.sort((a, b) => (b.score - a.score) || ((a.e.syms[0] || '~').length - (b.e.syms[0] || '~').length) || (a.e.adr < b.e.adr ? -1 : 1));
  const resultats = trouves.slice(0, limite).map(({ e, quoi }) => ({
    adr: e.adr, sym: e.syms[0] || null, nom: e.noms[0] || null, rang: quoi,
    action: e.action, marche: e.marche, notre: e.notre, sources: e.sources,
  }));
  return { resultats, total: trouves.length, plus: trouves.length > limite };
}
