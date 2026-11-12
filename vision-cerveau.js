/* vision-cerveau.js — « CE QUE LE CERVEAU VOIT » (Phil, 2026-10-26 : « un bouton, un pop-up qui retranscrit visuellement ce que le
 *   brain voit sur la map ; une simulation pour etre dans le brain, interagir, et apprendre a mieux communiquer avec lui »).
 *
 * ⛔⛔ RIEN N EST INVENTE ICI. Chaque element rendu vient d un argument que l appelant a REELLEMENT tenu :
 *     · `faits`  = l objet EXACT passe a `pas()` au dernier battement (l app le garde a cote de l etat) ;
 *     · `vu`     = la sortie EXACTE de ce battement ;
 *     · `voisins`, `marche`, `echange` = ce que la page a deja en memoire (la map, /api/trending, le fil Live).
 *     Un argument absent rend `null` et le texte « not read » — jamais un zero, jamais une valeur par defaut.
 * ⛔⛔ CE QUE LES NEURONES LISENT ET CE QU ILS NE LISENT PAS SONT SEPARES. `cerveau.js#courant` ne lit ni ses voisins, ni les
 *     rolls, ni les duels, ni la profondeur d une pool. Les voisins et la pool sont montres comme CONTEXTE (« not read by its
 *     neurons ») ; les faire passer pour des entrees serait la pensee inventee que cet ecran existe pour ne pas montrer.
 * ⛔ LE « WHAT IF » EST LE MEME CERVEAU, PAS UN MODELE DU CERVEAU : `simuler()` appelle `pas()` de cerveau.js, depuis la graine
 *     (keccak256 de l adresse), tick 0. Rien n est envoye, rien n est signe, aucun reseau : meme graine + memes faits = meme
 *     sortie, et l empreinte du rejeu le prouve a quiconque relance.
 * ⛔ PUR : aucun reseau, aucune horloge, aucun `Math.random`, aucun stockage, aucun DOM. */
import { etatInitial, pas, forces, nomHumeur, empreinte, connectome, VERSION_CERVEAU, NEURONES, CAPTEURS, PARAMETRES, INTERNES } from './cerveau.js';
import { METIERS } from './metiers.js';

export const VERSION_VISION = 'tblock-brain-vision/1';
/* 24 battements = 14,4 s a 600 ms : la fenetre d une « rencontre » (interactions-cerveaux.js), plus courte que la relecture de
 * la nourriture (90 s) — un fait nourricier edite TIENT donc toute la fenetre, comme dans l app. */
export const BATTEMENTS_SIM = 24;
const ADR = /^0x[0-9a-fA-F]{40}$/;
/* ⛔ l humeur en quelques mots pour un dessin : NON_LU s ecrit « mood not judged » (nomHumeur le dit en une phrase entiere) */
export const humeurCourte = (phase) => (phase === 'NON_LU' ? 'mood not judged' : nomHumeur(phase));
const fini = (x) => typeof x === 'number' && Number.isFinite(x);

/** Chaque cle que `courant()` lit, avec D OU l app la tire. `source: null` = l app ne la fournit pas (toujours absente). */
export const ENTREES = Object.freeze([
  { cle: 'vie', libelle: 'Life (price × supply)', source: 'its market, read on chain by this page in its pair currency — or the server market index, in dollars, when that read fails' },
  { cle: 'vieAvant', libelle: 'Previous life', source: 'the previous successful market read of this page' },
  { cle: 'gm', libelle: 'Transfers', source: 'chain: transfers of this block between two non-zero addresses, recent window' },
  { cle: 'messages', libelle: 'Messages', source: 'chain: those transfers that carry a readable message' },
  { cle: 'detenteurs', libelle: 'Holders reached', source: 'chain: addresses receiving this block for the first time in the window' },
  { cle: 'achats', libelle: 'Buys seen', source: 'the Live feed: verified swaps on its pool since this page opened' },
  { cle: 'ventes', libelle: 'Sells seen', source: 'the Live feed: verified swaps on its pool since this page opened' },
  { cle: 'mort', libelle: 'Creator holds none', source: 'chain: the creator balance, read' },
  { cle: 'role', libelle: 'Role', source: 'derived from its address' },
  { cle: 'reveil', libelle: 'Daily wake-up', source: 'this browser: once per local day, sleepers only' },
  { cle: 'bloc', libelle: 'Read at block', source: 'the chain head this page knew when the facts were put together' },
  /* ⛔⛔ MESURE 2026-10-26 (Brain senses) : `part` et `scelle` sont ACCEPTES par courant() (bornes, puis graves dans l empreinte
   *     d entree `vu.entree`) mais AUCUNE formule de neurone ne les lit — ni forces(), ni pas(). Les nourrir ne changerait pas un
   *     seul tir : ce serait une entree decorative. On le dit ; test-sens-cerveau-20261026.mjs le prouve (memes potentiels avec
   *     et sans) et cassera le jour ou un neurone les lira. `scelle` ressemble a « mint ferme » (faits.js#mintFerme) et `part`
   *     n est documente nulle part : leur sens n est pas ecrit dans cerveau.js. */
  { cle: 'part', libelle: 'Share', source: null, aucunNeurone: true },
  { cle: 'scelle', libelle: 'Sealed', source: null, aucunNeurone: true },
]);
export const TEXTE_SANS_NEURONE = 'not fed — and no neuron reads it (input fingerprint only)';

/** Les termes que `pas()` ajoute aux capteurs, nommes pour l ecran. L ordre est celui de l addition dans `pas()`. */
export const TERMES = Object.freeze([
  { cle: 'reveil', libelle: 'daily wake-up' },
  { cle: 'base', libelle: 'resting current (market size, or rest without a market)' },
  { cle: 'delta', libelle: 'life change since the previous read' },
  { cle: 'nourriture', libelle: 'food: transfers, messages, holders' },
  { cle: 'nouveau', libelle: 'something new: buys, sells, holders, transfers, messages since the last read' },
]);

/** Une valeur lisible, ou `null`. ⛔ Un booleen faux et un zero LU s affichent ; un absent ne s affiche jamais comme zero. */
function lisible(cle, v) {
  if (v === null || v === undefined) return null;
  if (cle === 'mort') return v === true ? 'yes' : v === false ? 'no' : null;
  if (cle === 'reveil') return v === true ? 'this beat' : 'no';
  /* ⛔ le role s affiche par son titre anglais (METIERS), jamais par sa cle interne */
  if (cle === 'role') { const m = METIERS.find((x) => x.cle === v); return m ? m.titre : null; }
  if (cle === 'vie' || cle === 'vieAvant') return fini(v) ? (v >= 1000 ? Math.round(v).toLocaleString('en-US') : String(Math.round(v * 1e4) / 1e4)) : null;
  if (cle === 'bloc') return Number.isInteger(v) && v > 0 ? '#' + v : null;
  if (typeof v === 'number') return fini(v) ? String(v) : null;
  if (typeof v === 'string') return v || null;
  return null;
}

/**
 * Le champ de vision d un block : ce qu il a lu (entrees), ce que ca a fait a ses capteurs (forces), ce qu il a rendu (sortie),
 * et autour, ce que la page sait sans que ses neurones le lisent (contexte).
 * @param {object} a
 * @param {string} a.adr        l adresse du block
 * @param {object|null} a.faits l objet EXACT passe a `pas()` au dernier battement, ou null s il n a pas encore battu
 * @param {object|null} a.vu    la sortie EXACTE de ce battement
 * @param {Array} [a.voisins]   [{ adr, sym, phase, distance }] — les plus proches sur la map, par position monde
 * @param {object|null} [a.marche]  la ligne de l index serveur (/api/trending) pour ce block
 * @param {object|null} [a.echange] le dernier echange VERIFIE vu par le fil Live pour ce block
 */
/* ⛔⛔ `entreesCerveau` (app.html) PASSE 0 POUR LA NOURRITURE QUAND ELLE N A PAS ETE LUE, et `false` pour la mort. Le cerveau
 *     recoit bien ce 0 — mais l afficher « 0, lu sur la chaine » serait faux. Ces cles disent donc « default, not read »
 *     tant que l appelant ne prouve pas la lecture (`nourritureLue === true`). */
const CLES_NOURRITURE = new Set(['gm', 'messages', 'detenteurs', 'mort']);
export function champ({ adr, faits = null, vu = null, voisins = [], marche = null, echange = null, nourritureLue = null } = {}) {
  if (!ADR.test(String(adr || ''))) return null;
  const aFaits = !!faits && typeof faits === 'object';
  const entrees = ENTREES.map((d) => {
    if (d.source === null) return { cle: d.cle, libelle: d.libelle, valeur: null, brut: null, source: null, lu: false,
      aucunNeurone: d.aucunNeurone === true, texte: d.aucunNeurone ? TEXTE_SANS_NEURONE : 'not fed by this app' };
    /* ⛔ un reveil non passe EST un reveil faux pour `courant()` (defaut) : c est ce que le cerveau a recu, on le dit */
    const brut = aFaits && Object.prototype.hasOwnProperty.call(faits, d.cle) ? faits[d.cle]
      : aFaits && d.cle === 'reveil' ? false : undefined;
    const valeur = lisible(d.cle, brut);
    const parDefaut = CLES_NOURRITURE.has(d.cle) && nourritureLue !== true && valeur !== null;
    return { cle: d.cle, libelle: d.libelle, valeur, brut: brut === undefined ? null : brut, source: d.source,
      lu: valeur !== null && !parDefaut, parDefaut,
      texte: valeur === null ? 'not read' : parDefaut ? valeur + ' (default: food not read yet)' : valeur };
  });
  let sensations = null;
  if (aFaits) {
    const { f, miam, termes } = forces(faits);
    sensations = {
      morte: termes === null,
      termes: termes === null ? [] : TERMES.map((t) => ({ cle: t.cle, libelle: t.libelle, valeur: Math.round(termes[t.cle] * 1e4) / 1e4 })),
      total: termes === null ? 0 : Math.round(TERMES.reduce((s, t) => s + termes[t.cle], 0) * 1e4) / 1e4,
      nourriture: Math.round(miam * 1000) / 1000,
      nouveaux: { ...f.nouveaux },
      aMarche: f.aMarche,
      nonLu: f.nonLu,
    };
  }
  const sortie = vu && typeof vu === 'object' ? {
    tick: vu.tick, phase: vu.phase, humeur: humeurCourte(vu.phase), spikes: vu.spikes, actifs: vu.actifs,
    indices: Array.isArray(vu.indices) ? vu.indices.slice() : [], virage: vu.virage, vitesse: vu.vitesse,
    gauche_hz: vu.gauche_hz, droite_hz: vu.droite_hz, memoire: vu.memoire, entree: vu.entree || null, cablage: vu.cablage || null,
    bloc: vu.bloc ?? null,
    /* ⛔ rendus par pas() a chaque battement et jamais montres dans cet ecran jusqu ici */
    nourriture: fini(vu.nourriture) ? vu.nourriture : null, delta: fini(vu.delta) ? vu.delta : null,
  } : null;
  /* ⛔ LE CONTEXTE NE GARDE QUE CE QUI A ETE TENU : un voisin sans phase est « not judged yet », jamais « calm ». */
  const ctxVoisins = (Array.isArray(voisins) ? voisins : []).filter((v) => v && ADR.test(String(v.adr || '')))
    .map((v) => ({ adr: String(v.adr).toLowerCase(), sym: v.sym ? String(v.sym) : null,
      phase: typeof v.phase === 'string' && v.phase ? v.phase : null,
      humeur: typeof v.phase === 'string' && v.phase ? humeurCourte(v.phase) : 'not judged yet',
      distance: fini(v.distance) ? Math.round(v.distance) : null, angle: fini(v.angle) ? v.angle : null }));
  const m = marche && typeof marche === 'object' ? marche : null;
  const champM = (k) => (m && fini(Number(m[k])) && m[k] !== null && m[k] !== '' ? Number(m[k]) : null);
  const ctxMarche = m ? {
    dex: m.dex ? String(m.dex) : null, quote: m.quoteSym ? String(m.quoteSym) : null,
    /* 2026-11-12 (Phil, CLOUD) : a row the server marks as a pool too thin to trust carries its CASH as liquidity and no valuation —
     *   never its paper mark ($7.6B for ~$4). `mince` says why the valuation is empty. */
    prixUsd: champM('prixUsd'), liquiditeUsd: m.liquiditePapier === true ? champM('profondeurUsd') : champM('liquiditeUsd'),
    fdvUsd: m.liquiditePapier === true ? null : champM('fdvUsd'), mince: m.liquiditePapier === true,
    volume24hUsd: champM('volume24hUsd'), trades24h: champM('trades24h'), change24h: champM('change24h'),
    /* ⛔ la seule part de cette ligne que le cerveau peut lire : sa taille quand NOTRE lecture de chaine a echoue */
    luParLeCerveau: aFaits && fini(faits.vie) && (faits.vie === champM('fdvUsd') || faits.vie === champM('liquiditeUsd')),
  } : null;
  const ctxEchange = echange && (echange.type === 'ACHAT' || echange.type === 'VENTE') ? {
    type: echange.type === 'ACHAT' ? 'buy' : 'sell', quantite: echange.quantite ?? null, devise: echange.devise || null,
    tx: typeof echange.tx === 'string' && /^0x[0-9a-fA-F]{64}$/.test(echange.tx) ? echange.tx : null,
  } : null;
  return {
    version: VERSION_VISION, cerveau: VERSION_CERVEAU, adr: String(adr).toLowerCase(), neurones: NEURONES, capteurs: CAPTEURS,
    aBattu: aFaits && !!sortie, entrees, sensations, sortie,
    contexte: { voisins: ctxVoisins, marche: ctxMarche, echange: ctxEchange,
      nonLus: ['its neighbours on the map', 'rolls and duels', 'pool depth and price'] },
  };
}

/* ══ « INTERNALS » — L ETAT INTERNE, EN LECTURE SEULE (Phil, 2026-10-26 : « capter les entrees, sorties et internes du brain
 *    qu on ne voyait pas ») ══════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔⛔ RIEN N EST CALCULE A LA PLACE DU CERVEAU : chaque potentiel et chaque trace sont COPIES de `etat.potentiels` /
 *     `etat.memoire` (l etat que `pas()` vient de rendre), au bit pres ; les regles (seuil, fuite, ailes, bornes) sont LUES
 *     dans `PARAMETRES` et `INTERNES` de cerveau.js, que `pas()` lit lui-meme. `lueur` = potentiel / seuil borne a [0, 1] :
 *     une division d affichage, rien d autre.
 * ⛔ CE QUI N EXISTE PAS SE DIT : ce reseau n a PAS de periode refractaire — un neurone qui tire est remis a 0 et peut tirer au
 *    battement suivant. Les 16 capteurs recoivent TOUS le meme courant (seul le bruit differe) : il n y a pas un capteur par fait.
 * ⛔ L ETAT EST CELUI D APRES LE DERNIER BATTEMENT : il ne vaut que pour CE battement (`etat.tick`). Un battement plus ancien
 *    n a pas son etat garde — `cadreInterieur` n allume donc la lueur que si le battement montre EST le dernier. */
export const VERSION_INTERNE = 'tblock-brain-internals/1';
/** Au-dessus de cette part du seuil, un neurone est « pres de tirer » (repere d affichage, pas une regle du cerveau). */
export const PRES_DU_SEUIL = 0.8;
export function interne(etat) {
  if (!etat || typeof etat !== 'object' || !etat.c || !Array.isArray(etat.c.liens) || !Array.isArray(etat.potentiels)
    || etat.potentiels.length !== NEURONES || !Number.isSafeInteger(etat.tick)) return null;
  const c = etat.c, seuil = PARAMETRES.seuil, M = INTERNES.ailesModulo;
  const mem = Array.isArray(etat.memoire) && etat.memoire.length === NEURONES ? etat.memoire : null;
  const neurones = [];
  for (let i = 0; i < NEURONES; i++) {
    const p = etat.potentiels[i];
    const g = (i + c.aileG) % M === 0, d = (i + c.aileD) % M === 0;
    neurones.push({ n: i, capteur: i < CAPTEURS, potentiel: p, trace: mem ? mem[i] : null,
      lueur: fini(p) ? Math.max(0, Math.min(1, p / seuil)) : null, retenu: fini(p) && p < 0,
      aile: g && d ? 'both' : g ? 'left' : d ? 'right' : 'neither',
      /* ce que sa trace lui ajoutera au prochain battement (sous le seuil, toujours) */
      amorce: mem && fini(mem[i]) ? mem[i] * PARAMETRES.memoireGain : null });
  }
  const ps = neurones.map((x) => x.potentiel).filter(fini);
  const parTrace = mem ? neurones.filter((x) => fini(x.trace)).sort((a, b) => b.trace - a.trace || a.n - b.n) : [];
  const ailes = { left: 0, right: 0, both: 0, neither: 0 };
  for (const x of neurones) ailes[x.aile]++;
  return {
    version: VERSION_INTERNE, cerveau: VERSION_CERVEAU, tick: etat.tick,
    spikes: Number.isSafeInteger(etat.spikes) ? etat.spikes : null,
    /* ⛔ calcule par pas() et garde dans l etat, jamais montre jusqu ici : les tirs du battement d AVANT */
    spikesAvant: Number.isSafeInteger(etat.dernierSpikes) ? etat.dernierSpikes : null,
    regles: { seuil, fuite: PARAMETRES.fuite, bruitMax: PARAMETRES.bruitMax, memoireGain: PARAMETRES.memoireGain,
      memoireDecroissance: PARAMETRES.memoireDecroissance, liensParNeurone: PARAMETRES.liensParNeurone, ...INTERNES,
      refractaire: null, aileG: c.aileG, aileD: c.aileD },
    neurones,
    resume: {
      pres: neurones.filter((x) => fini(x.potentiel) && x.potentiel >= PRES_DU_SEUIL * seuil).length,
      retenus: neurones.filter((x) => x.retenu).length,
      moyenne: ps.length ? ps.reduce((s, x) => s + x, 0) / ps.length : null,
      min: ps.length ? Math.min(...ps) : null, max: ps.length ? Math.max(...ps) : null,
      traceMax: parTrace.length ? { n: parTrace[0].n, trace: parTrace[0].trace } : null,
      ailes,
    },
  };
}

/* ══ LE « WHAT IF » ══════════════════════════════════════════════════════════════════════════════════════════════════ */
export const EDITS = Object.freeze({
  vieDeltaPct: { min: -90, max: 200, pas: 5, libelle: 'Life change' },
  achats: { min: 0, max: 10, pas: 1, libelle: 'New buys' },
  ventes: { min: 0, max: 10, pas: 1, libelle: 'New sells' },
  detenteurs: { min: 0, max: 10, pas: 1, libelle: 'New holders' },
  gm: { min: 0, max: 20, pas: 1, libelle: 'New transfers' },
  messages: { min: 0, max: 10, pas: 1, libelle: 'New messages' },
});
const borne = (k, v) => { const d = EDITS[k]; const n = Number(v); if (!d || !fini(n)) return 0; return Math.max(d.min, Math.min(d.max, Math.round(n))); };

/**
 * Les faits edites, et ce qui a ete refuse. ⛔ On n invente pas de marche : sans vie lue, un changement de vie est refuse.
 * Un echange (achat / vente) dure UN battement dans l app (front montant, `echAvant`) : il n est applique qu au battement `a`.
 * Un fait nourricier (transferts, messages, detenteurs) et la vie tiennent jusqu a la relecture suivante (90 s) : toute la fenetre.
 */
export function faitsEdites(faits, edits = {}, { echangeAuBattement = false } = {}) {
  const base = { ...(faits || {}) };
  const refus = [];
  const e = {};
  for (const k of Object.keys(EDITS)) e[k] = borne(k, edits[k]);
  if (e.vieDeltaPct !== 0) {
    if (fini(base.vie) && base.vie > 0) { base.vieAvant = base.vie; base.vie = base.vie * (1 + e.vieDeltaPct / 100); }
    else refus.push('Life change needs a market that was read — this block has none, so it was not applied.');
  }
  for (const k of ['gm', 'messages', 'detenteurs']) {
    if (!e[k]) continue;
    const x = fini(base[k]) ? base[k] : 0;
    const av = fini(base[k + 'Avant']) ? base[k + 'Avant'] : x;
    base[k + 'Avant'] = av; base[k] = x + e[k];
  }
  if (echangeAuBattement) {
    for (const k of ['achats', 'ventes']) {
      if (!e[k]) continue;
      const x = fini(base[k]) ? base[k] : 0;
      const av = fini(base[k + 'Avant']) ? base[k + 'Avant'] : x;
      base[k + 'Avant'] = av; base[k] = x + e[k];
    }
  }
  return { faits: base, refus, edits: e };
}

function derouler(adr, faitsDuPas, n) {
  let etat = etatInitial(String(adr).toLowerCase());
  const pasVus = [];
  for (let i = 0; i < n; i++) {
    const r = pas(etat, faitsDuPas(i));
    etat = r.etat;
    pasVus.push({ tick: r.vu.tick, phase: r.vu.phase, spikes: r.vu.spikes, indices: r.vu.indices.slice(), virage: r.vu.virage,
      vitesse: r.vu.vitesse, entree: r.vu.entree });
  }
  return pasVus;
}
function resume(pasVus) {
  const phases = {};
  for (const p of pasVus) phases[p.phase] = (phases[p.phase] || 0) + 1;
  const dernier = pasVus[pasVus.length - 1] || null;
  return { phases, finale: dernier ? dernier.phase : null, humeurFinale: dernier ? humeurCourte(dernier.phase) : null,
    spikes: pasVus.reduce((s, p) => s + p.spikes, 0), virageFinal: dernier ? dernier.virage : null,
    empreinte: empreinte(JSON.stringify([VERSION_VISION, VERSION_CERVEAU, pasVus])) };
}

/**
 * Rejoue le MEME cerveau deux fois depuis sa graine (tick 0) : avec les faits tels que lus, puis avec les faits edites.
 * ⛔ Aucun reseau, aucune signature : `pas()` et rien d autre. Meme adresse + memes faits + memes edits = meme empreinte.
 * @returns {{ lu: object, siEtAlors: object, refus: string[], premierEcart: number|null, edits: object } | null}
 */
export function simuler(adr, faits, edits = {}, n = BATTEMENTS_SIM, a = 1) {
  if (!ADR.test(String(adr || '')) || !faits || typeof faits !== 'object') return null;
  const N = Math.max(1, Math.min(120, Math.round(Number(n)) || BATTEMENTS_SIM));
  const A = Math.max(0, Math.min(N - 1, Math.round(Number(a)) || 0));
  const lu = derouler(adr, () => faits, N);
  const sans = faitsEdites(faits, edits, { echangeAuBattement: false });
  const avec = faitsEdites(faits, edits, { echangeAuBattement: true });
  const si = derouler(adr, (i) => (i === A ? avec.faits : sans.faits), N);
  let premierEcart = null;
  for (let i = 0; i < N; i++) {
    if (lu[i].phase !== si[i].phase || lu[i].indices.join(',') !== si[i].indices.join(',')) { premierEcart = i; break; }
  }
  return { n: N, a: A, lu: { pas: lu, ...resume(lu) }, siEtAlors: { pas: si, ...resume(si) }, refus: sans.refus, premierEcart, edits: sans.edits };
}

/* ══ « INSIDE » — LA VUE A LA PREMIERE PERSONNE (Phil, 2026-10-26 : « etre dans le brain ») ════════════════════════════════
 * Le block regarde devant lui : en haut, les SOURCES de ses entrees (chaque fait arrive comme un signal depuis d ou il vient) ;
 * devant lui, ses 16 capteurs ; autour de lui, ses 112 autres neurones ; sous lui, la map qui tourne et defile comme ses ailes
 * le pilotent. Ses voisins sont sur la map, ATTENUES, et dits « not read by its neurons ».
 * ⛔⛔ UN CADRE EST UNE FONCTION DE DONNEES TENUES, RIEN D AUTRE :
 *     · une source n est « lue » que si `champ()` la dit lue — sinon elle est grise et ne porte AUCUN signal ;
 *     · ce qu une source apporte = forces(faits) − forces(faits SANS elle) : le MEME cerveau.js, pas une copie de ses formules ;
 *     · une impulsion « arrive » n existe que si le battement ENREGISTRE la porte (`vu.nouveaux[cle] > 0`) ;
 *     · un neurone allume = un indice de `vu.indices` de ce battement, et seulement lui ;
 *     · le virage et la vitesse du sol = la somme des `virage` / `vitesse` ENREGISTRES jusqu a ce battement.
 * ⛔ DETERMINISTE : memes battements + memes faits = meme cadre = meme empreinte. Aucune horloge ; le mouvement (CSS) est un
 *    habillage que `reduit` retire entierement (prefers-reduced-motion), le cadre reste le meme hors du drapeau `anime`. */
export const VERSION_INTERIEUR = 'tblock-brain-inside/1';
/** Les sources montrees devant lui, dans l ordre de gauche a droite. Chaque cle est une cle de ENTREES. */
export const SOURCES_INTERIEUR = Object.freeze([
  { cle: 'vie', court: 'Life' }, { cle: 'gm', court: 'Transfers' }, { cle: 'messages', court: 'Messages' },
  { cle: 'detenteurs', court: 'Holders' }, { cle: 'achats', court: 'Buys' }, { cle: 'ventes', court: 'Sells' },
  { cle: 'reveil', court: 'Wake-up' },
]);
/* ⛔ « sans elle » : le fait retire comme s il n avait jamais ete fourni — un compteur sans rien de nouveau, une vie absente */
const SANS = {
  vie: (f) => ({ ...f, vie: null, vieAvant: null }),
  gm: (f) => ({ ...f, gm: 0, gmAvant: fini(f.gmAvant) ? 0 : f.gmAvant }),
  messages: (f) => ({ ...f, messages: 0, messagesAvant: fini(f.messagesAvant) ? 0 : f.messagesAvant }),
  detenteurs: (f) => ({ ...f, detenteurs: 0, detenteursAvant: fini(f.detenteursAvant) ? 0 : f.detenteursAvant }),
  achats: (f) => ({ ...f, achats: fini(f.achatsAvant) ? f.achatsAvant : 0 }),
  ventes: (f) => ({ ...f, ventes: fini(f.ventesAvant) ? f.ventesAvant : 0 }),
  reveil: (f) => ({ ...f, reveil: false }),
};
const totalTermes = (faits) => { const { termes } = forces(faits); return termes === null ? null : TERMES.reduce((s, t) => s + termes[t.cle], 0); };
/** Ce que la source `cle` ajoute a CHACUN des 16 capteurs : la difference des forces de cerveau.js avec et sans elle. */
export function apportDe(faits, cle) {
  if (!faits || typeof faits !== 'object' || !SANS[cle]) return null;
  const avec = totalTermes(faits), sans = totalTermes(SANS[cle](faits));
  if (avec === null || sans === null) return null;
  return Math.round((avec - sans) * 1e4) / 1e4;
}
const W = 360, HORIZON = 82, OEIL = { x: 180, y: 300 };
const rad = (x) => Math.round(x * 1e4) / 1e4;
const angleNorm = (a) => { let x = a % (2 * Math.PI); if (x > Math.PI) x -= 2 * Math.PI; if (x <= -Math.PI) x += 2 * Math.PI; return x; };
/** Le cap et la distance cumules depuis le premier battement enregistre (cap 0 = la ou il regardait alors). */
function trajet(histo, i) {
  let cap = 0, d = 0, capAvant = 0, dAvant = 0;
  for (let k = 0; k <= i && k < histo.length; k++) {
    const v = histo[k];
    capAvant = cap; dAvant = d;
    cap += (fini(v && v.virage) ? v.virage : 0) * 0.7;
    d += fini(v && v.vitesse) ? v.vitesse : 0;
  }
  return { cap, capAvant, d, dAvant };
}
/**
 * Le cadre « inside » du battement `i` de `histo`.
 * @param {object} a
 * @param {object} a.c        la sortie de `champ()` (entrees, sensations, contexte)
 * @param {object} a.faits    les faits EXACTS du dernier battement (ceux de `champ`), ou null
 * @param {Array}  a.histo    les sorties ENREGISTREES de `pas()` (le `vu` de chaque battement)
 * @param {number} a.i        l indice du battement montre
 * @param {number|null} [a.capMap] ou il regarde sur la map MAINTENANT (radians), pour placer ses voisins ; null = inconnu
 * @param {boolean} [a.reduit] prefers-reduced-motion : aucun mouvement
 */
export function cadreInterieur({ c, faits = null, histo = [], i = -1, capMap = null, reduit = false, etat = null } = {}) {
  if (!c || typeof c !== 'object' || !Array.isArray(c.entrees)) return null;
  const H = Array.isArray(histo) ? histo : [];
  const vu = i >= 0 && i < H.length && H[i] && typeof H[i] === 'object' ? H[i] : null;
  /* ⛔ la lueur (potentiel / seuil) n existe que pour le battement dont on TIENT l etat : le dernier, et seulement s il concorde */
  const inn = vu && etat ? interne(etat) : null;
  const lueurs = inn && Number.isSafeInteger(vu.tick) && inn.tick === vu.tick ? inn.neurones : null;
  const avecLueur = (o) => (lueurs ? { ...o, lueur: lueurs[o.n].lueur, retenu: lueurs[o.n].retenu } : o);
  const anime = !reduit && !!vu;
  const allumes = new Set(vu && Array.isArray(vu.indices) ? vu.indices.filter((n) => Number.isInteger(n) && n >= 0 && n < NEURONES) : []);
  const mort = !!(c.sensations && c.sensations.morte);
  /* les sources : uniquement ce que champ() a tenu */
  const nSrc = SOURCES_INTERIEUR.length;
  const sources = SOURCES_INTERIEUR.map((s, k) => {
    const e = c.entrees.find((x) => x.cle === s.cle);
    const lu = !!(e && e.lu);
    const apport = lu && !mort ? apportDe(faits, s.cle) : null;
    const nouveaux = vu && vu.nouveaux && typeof vu.nouveaux === 'object' ? vu.nouveaux : null;
    const arrive = lu && !mort && s.cle !== 'vie' && s.cle !== 'reveil' && nouveaux && fini(nouveaux[s.cle]) && nouveaux[s.cle] > 0 ? nouveaux[s.cle] : 0;
    const sens = s.cle === 'vie' && lu && vu && fini(vu.delta) ? (vu.delta > 0 ? 'rising' : vu.delta < 0 ? 'falling' : 'flat') : null;
    const x = Math.round(28 + k * ((W - 56) / (nSrc - 1)));
    return { cle: s.cle, court: s.court, libelle: e ? e.libelle : s.court, source: e ? e.source : null, lu,
      texte: e ? (lu ? e.valeur : e.parDefaut ? 'not read yet' : 'not read') : 'not read',
      apport, signal: lu && fini(apport) && apport !== 0, arrive, sens, x, y: 20 };
  });
  /* les 16 capteurs devant lui, en arc ; les 112 autres autour de lui, en deux rangs */
  const capteurs = [];
  for (let n = 0; n < CAPTEURS; n++) {
    const u = (n / (CAPTEURS - 1)) * 2 - 1;
    capteurs.push(avecLueur({ n, on: allumes.has(n), x: rad(180 + u * 104), y: rad(208 + 14 * u * u) }));
  }
  const neurones = [];
  const reste = NEURONES - CAPTEURS, parRang = Math.ceil(reste / 2);
  for (let k = 0; k < reste; k++) {
    const n = CAPTEURS + k, rang = k % 2, j = Math.floor(k / 2);
    const phi = (Math.PI * 0.06) + (j / (parRang - 1)) * Math.PI * 0.88;
    const rx = rang ? 150 : 170, ry = rang ? 70 : 88;
    neurones.push(avecLueur({ n, on: allumes.has(n), x: rad(180 - Math.cos(phi) * rx), y: rad(214 + Math.sin(phi) * ry) }));
  }
  /* le sol : il tourne a l oppose de son cap enregistre et defile avec sa vitesse enregistree */
  const t = vu ? trajet(H, i) : { cap: 0, capAvant: 0, d: 0, dAvant: 0 };
  const deg = (x) => Math.round((-x * 180) / Math.PI * 100) / 100;
  const sol = { rotation: deg(t.cap), rotationAvant: deg(t.capAvant), decalage: Math.round((t.d * 40) % 40 * 100) / 100,
    decalageAvant: Math.round((t.dAvant * 40) % 40 * 100) / 100 };
  /* les voisins : sur la map, jamais dans le champ de ses neurones. ⛔ Sans cap connu, aucune direction n est inventee. */
  const vs = Array.isArray(c.contexte && c.contexte.voisins) ? c.contexte.voisins : [];
  const dMax = Math.max(1, ...vs.map((v) => (fini(v.distance) ? v.distance : 0)));
  const DEMI = (50 * Math.PI) / 180;
  const voisins = vs.map((v, k) => {
    const base = { adr: v.adr, sym: v.sym, humeur: v.humeur, lu: false, note: 'not read by its neurons' };
    if (!fini(capMap) || !fini(v.angle)) return { ...base, rel: null, ou: 'unknown', x: 14, y: rad(96 + k * 16) };
    const rel = angleNorm(v.angle - capMap);
    const prox = fini(v.distance) ? v.distance / dMax : 1;
    if (Math.abs(rel) <= DEMI) {
      return { ...base, rel: rad(rel), ou: 'ahead', x: rad(180 + (Math.tan(rel) / Math.tan(DEMI)) * 150), y: rad(HORIZON + 14 + (1 - prox) * 92) };
    }
    const ou = Math.abs(rel) > (2.4) ? 'behind' : rel > 0 ? 'right' : 'left';
    return { ...base, rel: rad(rel), ou, x: ou === 'left' ? 14 : W - 14, y: rad(96 + k * 16) };
  });
  const cadre = {
    version: VERSION_INTERIEUR, adr: c.adr, i, tick: vu ? vu.tick : null, phase: vu ? vu.phase : null,
    humeur: vu ? humeurCourte(vu.phase) : null, spikes: vu ? vu.spikes : null, virage: vu ? vu.virage : null, vitesse: vu ? vu.vitesse : null,
    mort, anime, horizon: HORIZON, oeil: OEIL, sources, capteurs, neurones, voisins, sol,
    allumes: [...allumes].sort((a, b) => a - b),
  };
  /* ⛔ ajoute SEULEMENT quand l etat concorde : sans lui, le cadre (et son empreinte) est exactement celui d avant */
  if (lueurs) cadre.lueurTick = inn.tick;
  /* ⛔ l empreinte ne porte pas `anime` : le mouvement est un habillage, le contenu est le meme avec ou sans */
  const { anime: _a, ...contenu } = cadre;
  cadre.empreinte = empreinte(JSON.stringify(contenu));
  return cadre;
}

/* ══ « TALK TO IT » — LECTURE SEULE ════════════════════════════════════════════════════════════════════════════════════════
 * On choisit une entree ; on montre (1) son CABLAGE REEL : chaque entree arrive sur les 16 capteurs (pas() leur donne le meme
 * courant), et les liens sortants de ces capteurs, lus dans connectome(adresse) ; (2) son effet REJOUE : le meme cerveau depuis
 * sa graine (simuler), avec et sans elle, neurone par neurone, au battement ou elle arrive et au suivant.
 * ⛔ Aucune reponse inventee : si rien ne change, on dit « no neuron changed » ; si l entree est refusee, on dit pourquoi. */
export const PAROLES = Object.freeze({
  vieDeltaPct: { valeur: 10, dire: 'its life rises 10 %' }, achats: { valeur: 1, dire: 'one new buy arrives' },
  ventes: { valeur: 1, dire: 'one new sell arrives' }, detenteurs: { valeur: 1, dire: 'one new holder arrives' },
  gm: { valeur: 1, dire: 'one new transfer arrives' }, messages: { valeur: 1, dire: 'one new message arrives' },
});
export function cablageCapteurs(adr) {
  if (!ADR.test(String(adr || ''))) return null;
  const c = connectome(String(adr).toLowerCase());
  const cibles = new Map();
  for (let s = 0; s < CAPTEURS; s++) for (const l of c.liens[s]) cibles.set(l.vers, Math.round(((cibles.get(l.vers) || 0) + l.poids) * 100) / 100);
  const l = [...cibles.entries()].map(([vers, poids]) => ({ vers, poids })).sort((a, b) => a.vers - b.vers);
  return { cablage: c.empreinte, capteurs: CAPTEURS, liens: CAPTEURS * c.liens[0].length, cibles: l,
    excitent: l.filter((x) => x.poids > 0).length, inhibent: l.filter((x) => x.poids < 0).length };
}
/* ══ "FEEL" — ONE BEAT AT HUMAN SPEED (owner, 2026-10-26: "the dialog is not representative; I want to FEEL what the block lives
 *    through at each beat, perceptible to the human eye") ══════════════════════════════════════════════════════════════════════
 * The brain beats every 600 ms; the eye cannot follow. So the view REPLAYS the RECORDED beats, one by one, ~1.5 s each
 * (speed 0.5x / 1x / 2x, pause, step by step). ⛔⛔ NOTHING IS RECOMPUTED AND NOTHING IS INVENTED:
 *   · a beat's sentence is made ONLY of the fields of ITS `vu` (nouveaux, delta, phase) — each piece carries the key and the value
 *     that made it be said (`traces`), and "nothing new reached me" is only said if none of those fields carries anything;
 *   · the view's hue = the mood `pas()` DECIDED on that beat (`vu.phase`), through a fixed table;
 *   · speed only changes the duration: the frame, the impulses and their order are the same at every speed (same fingerprint);
 *   · a beat is only skipped (too far behind) if it was CALM (no input, same mood) — and the count is stated. */
export const VERSION_RHYTHM = 'tblock-brain-feel/1';
/** One beat at 1x: 1.5 s (inside the 1 .. 2 s range asked for). */
export const HUMAN_BEAT_MS = 1500;
export const SPEEDS = Object.freeze([0.5, 1, 2]);
export const boundedSpeed = (v) => (SPEEDS.includes(Number(v)) ? Number(v) : 1);
export const beatDuration = (v) => Math.round(HUMAN_BEAT_MS / boundedSpeed(v));
/** Beyond this lag (in recorded beats), playback skips CALM beats to get closer to the present. */
export const MAX_DELAY = 6;

/** The mood -> its palette. ⛔ A fixed table, indexed by the DECIDED phase; an unknown phase does not borrow another hue. */
export const PALETTES = Object.freeze({
  CALME: 'calm', CURIEUX: 'curious', INQUIET: 'worried', EXCITE: 'excited', DORMANT: 'asleep', EVEILLE: 'awake', MORT: 'dead',
  NON_LU: 'unjudged',
});
export function paletteOf(phase) {
  const key = Object.prototype.hasOwnProperty.call(PALETTES, phase) ? PALETTES[phase] : 'none';
  return { key, phase: typeof phase === 'string' ? phase : null, name: typeof phase === 'string' ? humeurCourte(phase) : 'no beat yet' };
}

const SENTENCE_INPUTS = Object.freeze([
  { key: 'achats', one: 'a buy reached me', many: (k) => k + ' buys reached me' },
  { key: 'ventes', one: 'a sell reached me', many: (k) => k + ' sells reached me' },
  { key: 'detenteurs', one: 'a new holder reached me', many: (k) => k + ' new holders reached me' },
  { key: 'gm', one: 'a transfer reached me', many: (k) => k + ' transfers reached me' },
  { key: 'messages', one: 'a message reached me', many: (k) => k + ' messages reached me' },
]);
/**
 * The sentence of ONE beat, made of ITS `vu` and nothing else.
 * @returns {{ text: string, traces: Array<{key: string, value: *, says: string}>, tick: number|null }}
 */
export function beatSentence(vu) {
  if (!vu || typeof vu !== 'object' || !Number.isSafeInteger(vu.tick)) return { text: 'No beat has reached me here yet.', traces: [], tick: null };
  const traces = [];
  if (vu.phase === 'MORT') {
    traces.push({ key: 'phase', value: 'MORT', says: 'my creator holds none of me — nothing reaches me' });
  } else if (vu.phase === 'NON_LU') {
    traces.push({ key: 'phase', value: 'NON_LU', says: 'my market could not be read on this beat, so I judge no mood' });
  }
  if (vu.phase !== 'MORT') {
    const counts = vu.nouveaux && typeof vu.nouveaux === 'object' ? vu.nouveaux : {};
    for (const e of SENTENCE_INPUTS) {
      const k = counts[e.key];
      if (fini(k) && k > 0) traces.push({ key: 'nouveaux.' + e.key, value: k, says: k === 1 ? e.one : e.many(k) });
    }
    if (fini(vu.delta) && vu.delta !== 0) {
      const pct = Math.round(Math.abs(vu.delta) * 1000) / 10;
      const p = pct > 0 ? pct + ' %' : 'under 0.1 %';
      traces.push({ key: 'delta', value: vu.delta, says: vu.delta > 0 ? 'my market warmed (+' + p + ')' : 'my market cooled (−' + p + ')' });
    }
  }
  if (!traces.length) traces.push({ key: 'nothing', value: null, says: 'nothing new reached me' });
  const pieces = traces.map((t) => t.says);
  const body = pieces.length === 1 ? pieces[0] : pieces.slice(0, -1).join(', ') + ' and ' + pieces[pieces.length - 1];
  return { text: body.charAt(0).toUpperCase() + body.slice(1) + '.', traces, tick: vu.tick };
}

/** A frame's impulses: each REAL input of this beat (`arrive` > 0, or life that moved), in source order.
 *  `start` is a FRACTION of the beat — speed does not change it. (`cle`, `arrive`, `sens` are the frame's source fields.) */
export function impulsesOf(k) {
  if (!k || !Array.isArray(k.sources) || k.mort) return [];
  const l = k.sources.filter((s) => (s.arrive > 0) || (s.cle === 'vie' && s.lu && (s.sens === 'rising' || s.sens === 'falling')));
  return l.map((s, j) => ({ key: s.cle, x: s.x, y: s.y, n: s.cle === 'vie' ? null : s.arrive, direction: s.sens || null,
    start: Math.round(Math.min(0.3, j * 0.06) * 100) / 100 }));
}
/** A frame's rhythm at a speed: its duration, and a CONTENT (frame + impulses) whose fingerprint does not depend on speed. */
export function frameRhythm(k, speed = 1) {
  const impulses = impulsesOf(k);
  const content = { version: VERSION_RHYTHM, frame: k && k.empreinte ? k.empreinte : null, impulses, ignition: 0.5 };
  return { speed: boundedSpeed(speed), durationMs: beatDuration(speed), ...content, fingerprint: empreinte(JSON.stringify(content)) };
}

const calmBetween = (vu, before) => {
  if (!vu || !before) return false;
  const counts = vu.nouveaux && typeof vu.nouveaux === 'object' ? vu.nouveaux : {};
  const nothing = SENTENCE_INPUTS.every((e) => !(fini(counts[e.key]) && counts[e.key] > 0));
  return nothing && !(fini(vu.delta) && vu.delta !== 0) && vu.phase === before.phase;
};
/**
 * The next beat to show, from the beat shown `tick` (null = not started yet).
 * ⛔ A beat is only skipped if it is CALM and the view is more than MAX_DELAY beats behind; a beat that left the memory
 *    (bounded histo) is counted in `lost`, never kept quiet.
 * @returns {{ tick: number|null, skipped: number, lost: number, upToDate: boolean }}
 */
export function nextBeat(histo, tick, { maxDelay = MAX_DELAY, start = 4 } = {}) {
  const H = Array.isArray(histo) ? histo.filter((v) => v && Number.isSafeInteger(v.tick)) : [];
  if (!H.length) return { tick: null, skipped: 0, lost: 0, upToDate: true };
  if (!Number.isSafeInteger(tick)) { const k0 = Math.max(0, H.length - 1 - start); return { tick: H[k0].tick, skipped: 0, lost: 0, upToDate: k0 === H.length - 1 }; }
  let k = H.findIndex((v) => v.tick > tick);
  if (k < 0) return { tick: H[H.length - 1].tick === tick ? tick : H[H.length - 1].tick, skipped: 0, lost: 0, upToDate: true };
  const lost = H[0].tick > tick + 1 && k === 0 ? H[0].tick - tick - 1 : 0;
  let skipped = 0;
  while (H.length - 1 - k > maxDelay && k < H.length - 1 && calmBetween(H[k], H[k - 1] || null)) { k++; skipped++; }
  return { tick: H[k].tick, skipped, lost, upToDate: k === H.length - 1 };
}

/**
 * THE reference beat of a view, and the texts that name it. ⛔ A single unlabelled number: the one of the beat shown;
 * the header states ITS mood. Any other number carries its name ("newest beat", "facts frozen at beat").
 */
export function viewReference({ histo = [], tick = null, tickFaits = null } = {}) {
  const H = Array.isArray(histo) ? histo : [];
  const i = Number.isSafeInteger(tick) ? H.findIndex((v) => v && v.tick === tick) : -1;
  const vu = i >= 0 ? H[i] : null;
  const newest = H.length ? H[H.length - 1] : null;
  const lag = vu && newest ? H.length - 1 - i : null;
  const pal = paletteOf(vu ? vu.phase : null);
  return {
    i, vu, tick: vu ? vu.tick : null, phase: vu ? vu.phase : null, mood: vu ? humeurCourte(vu.phase) : null, palette: pal.key,
    newestTick: newest ? newest.tick : null, lag,
    header: vu ? 'Beat ' + vu.tick + ' · ' + humeurCourte(vu.phase) : 'No beat recorded here yet',
    output: vu ? 'Beat ' + vu.tick + ': ' + humeurCourte(vu.phase) + ' · ' + vu.spikes + ' of ' + NEURONES + ' fired · steering ' + vu.virage
      + (vu.virage < 0 ? ' (left)' : vu.virage > 0 ? ' (right)' : '') + ' · speed ' + vu.vitesse : '',
    present: !vu || !newest ? '' : lag === 0 ? 'This is its newest beat.'
      : 'Newest beat recorded: ' + newest.tick + ' (' + lag + ' beat' + (lag === 1 ? '' : 's') + ' ahead of this view).',
    facts: Number.isSafeInteger(tickFaits) ? 'The what-if replays the facts frozen when this window opened (newest beat then: ' + tickFaits + ') — not the beat shown above.' : '',
  };
}

export function parler(adr, faits, cle, a = 1) {
  if (!ADR.test(String(adr || '')) || !faits || typeof faits !== 'object' || !PAROLES[cle]) return null;
  const A = Math.max(0, Math.min(20, Math.round(Number(a)) || 0));
  const s = simuler(adr, faits, { [cle]: PAROLES[cle].valeur }, A + 2, A);
  if (!s) return null;
  /* ⛔ un echange dure UN battement (il arrive a A) ; un fait nourricier ou la vie tient toute la fenetre (il arrive a 0) */
  const arrivee = cle === 'achats' || cle === 'ventes' ? A : 0;
  const ecart = (k) => {
    const x = new Set(s.lu.pas[k].indices), y = new Set(s.siEtAlors.pas[k].indices);
    return { battement: k + 1, allumes: [...y].filter((n) => !x.has(n)).sort((p, q) => p - q),
      eteints: [...x].filter((n) => !y.has(n)).sort((p, q) => p - q), phaseSans: s.lu.pas[k].phase, phaseAvec: s.siEtAlors.pas[k].phase };
  };
  return { cle, dire: PAROLES[cle].dire, refus: s.refus, cablage: cablageCapteurs(adr), arrivee: ecart(arrivee), suivant: ecart(arrivee + 1),
    empreinte: empreinte(JSON.stringify([VERSION_INTERIEUR, s.lu.empreinte, s.siEtAlors.empreinte])) };
}
