/* test-jeu-focus-20261024.mjs — UN JEU A LA FOIS, SUR LE VRAI CODE DE LA PAGE, PAS SUR SON TEXTE.
 * MESURE de depart (prod game30, 375 x 812) : l onglet Game faisait 3 294 px, toutes les cartes de jeu empilees ; une tuile ne faisait que
 *   defiler jusqu a sa carte. Le choix (app.html, de « UN JEU A LA FOIS (2026-10-24) » a « FIN DU CHOIX DU JEU ») et CHAQUE chemin externe
 *   vers une carte de jeu (palette Ctrl+K : palConstruire + palChoisir ; commandes du panneau : bcCommandePostTask, le bouton « Open the Game
 *   tab » de suivreRollsEnAttente, ouvrirDuel ; le lien #game/<jeu> : ouvrirJeuDuLien et le hashchange) sont EXTRAITS de app.html et
 *   EXECUTES ensemble contre un faux DOM CONSTRUIT depuis le HTML reel de #v-missions (ids, cartes, tuiles, attribut hidden), ou
 *   offsetParent vaut null dans une carte cachee (hidden, data-hors="1", ou avant le premier choix : la regle CSS initiale).
 * AFFIRME : (1) une seule carte de jeu montree a la fois, celle de la tuile ; aria-pressed le dit ; Earn / Swap UNIT / How it works toujours
 *   la ; le choix ne touche jamais `hidden` ; (2) defaut tirCarte ; (3) le choix garde est repris ; (4) tuile cachee (pas de contrat) ->
 *   tirCarte, puis le choix revient quand la tuile apparait ; (5) localStorage qui JETTE -> tout marche ; (6) le focus ne va qu a un bouton
 *   VISIBLE, et seulement APRES que sa carte est montree ; (7) palette, post task, Open the Game tab, Open a challenge, #game/<jeu> : la
 *   carte est montree AVANT le focus / le defilement ; la palette ne propose pas une tuile cachee ; (8) les peintres Duels et Slots
 *   rappellent peindreChoixJeu ; (9) le CSS : data-hors, la regle initiale, la rangee de tuiles <= 600 px ; (10) chaque carte de jeu est
 *   AVANT Earn / Swap UNIT / How it works dans le HTML.
 * Chaque affirmation est rejouee sur une COPIE MUTEE de app.html (en memoire) et doit alors rougir.
 * ⛔ NE PROUVE PAS : le rendu au navigateur (hauteurs, defilement doux, scroll-snap), un vrai clic tactile, Base. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { entreesJeu, entreesOnglets } from './palette.js';

let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const lire = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const APP = lire('app.html');
/* 2026-10-24 (Phil : « fusionne le draw et le spin ») : #slotsCarte n existe plus — les Slots vivent dans la carte Draws (#slotsZone) ; la
 *   tuile Slots et #game/slots menent a tirCarte (scenario SLOTS). Ce banc listait six cartes de jeu ; il en liste cinq, et REPLI joue
 *   le repli d une tuile cachee sur les Duels (toujours une carte a part, cachee sans contrat) au lieu des Slots. */
const JEUX = ['tirCarte', 'brainJeuCarte', 'skinCarte', 'missionsCarte', 'duelsCarte'];
const PAS_JEUX = ['earnCarte', 'regleCarte']; /* game357: Swap UNIT removed */

/* ---------------------------------------------------------------- extraction (du texte de app.html, eventuellement mute) */
const entre = (t, a, b) => { const i = t.indexOf(a), j = t.indexOf(b, i + 1); return i >= 0 && j > i ? t.slice(i, j) : ''; };
/* une fonction de premier niveau : de « function nom( » a la premiere ligne « } » qui suit */
/* fin de ligne tolerante (\r?\n) : test-tests-portables refuse un saut de ligne nu dans un motif de recherche */
const fonction = (t, tete) => { const i = t.indexOf(tete); if (i < 0) return ''; const re = /\r?\n\}\r?\n/g; re.lastIndex = i; const m = re.exec(t); return m ? t.slice(i, m.index + m[0].length) : ''; };
function code(t) {
  const choix = entre(t, '/* ══ UN JEU A LA FOIS (2026-10-24)', '/* ══ FIN DU CHOIX DU JEU */');
  const lien = entre(t, 'function ouvrirJeuDuLien(', '\n/* ── Bridge (tip');
  const morceaux = { choix, lien, palConstruire: fonction(t, 'function palConstruire('), palChoisir: fonction(t, 'function palChoisir('),
    postTask: fonction(t, 'function bcCommandePostTask('), suivre: fonction(t, 'async function suivreRollsEnAttente('), duel: fonction(t, 'function ouvrirDuel('),
    /* revue 3 : le peintre des boutons Roll (apres /api/tirage) redonne le focus attendu d un lien froid #game/roll */
    rolls: fonction(t, 'function poserBoutonsRolls(') };
  return { morceaux, tout: Object.values(morceaux).join('\n') };
}

/* ---------------------------------------------------------------- le faux DOM, construit depuis le HTML reel de #v-missions */
function faireDom(t) {
  const sec = entre(t, '<section class="volet" id="v-missions"', '</section>');
  const els = new Map();
  const corps = { id: 'body', parent: null, attrs: new Map(), hidden: false };
  const etat = { focus: null, defile: [], focusVu: [] };
  const noeud = (id, parent, tag, ouvrant) => {
    const e = { id, parent, tag, attrs: new Map(), hidden: /\shidden(?=[\s>=])/.test(ouvrant), value: '', textContent: '', ecoute: {}, enfantsTexte: {},
      scrollLeft: 0, scrollWidth: 0, clientWidth: 0, offsetLeft: 0, offsetWidth: 0, haut: 300,
      classList: { _c: new Set(), contains(c) { return this._c.has(c); }, toggle(c, on) { if (on) this._c.add(c); else this._c.delete(c); } },
      getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; },
      setAttribute(k, v) { this.attrs.set(k, String(v)); }, removeAttribute(k) { this.attrs.delete(k); },
      addEventListener(ty, f) { this.ecoute[ty] = f; },
      click() { if (this.ecoute.click) this.ecoute.click({ target: this }); },
      focus() { etat.focus = this.id; etat.focusVu.push({ id: this.id, vu: this.offsetParent !== null }); },
      scrollIntoView() { etat.defile.push({ id: this.id, vu: this.offsetParent !== null }); },
      getBoundingClientRect() { return { top: this.haut }; },
      querySelector(s) { return this.enfantsTexte[s] ? { textContent: this.enfantsTexte[s] } : null; },
      closest(s) { return s === 'details' && this.dansPli ? els.get(this.dansPli) : null; },
      get offsetParent() {
        const v = els.get('v-missions');
        if (!v.classList.contains('on')) return null;
        /* 2026-10-24 (un seul jeu au centre) : un pli <details> FERME cache ce qu il contient (le Roll classique, #rollPli) */
        if (this.dansPli && !els.get(this.dansPli).open) return null;
        for (let x = this; x && x !== v; x = x.parent) {
          if (x.hidden || x.getAttribute('data-hors') === '1') return null;
          /* la regle CSS initiale : avant le premier choix, seules les cartes non listees se montrent */
          if (v.getAttribute('data-jeu') === null && etat.initiales.includes(x.id)) return null;
        }
        return corps;
      } };
    for (const m of ouvrant.matchAll(/\s(data-[a-z]+)="([^"]*)"/g)) e.attrs.set(m[1], m[2]);
    els.set(id, e);
    return e;
  };
  const v = noeud('v-missions', corps, 'section', '<section>');
  const bd = noeud('bandeau', v, 'div', '<div>'); bd.scrollWidth = 1200; bd.clientWidth = 343;
  /* les cartes : chacune de son ouverture a la suivante ; tout id entre les deux lui appartient */
  const cartes = [...sec.matchAll(/<div class="carte" id="([^"]+)"[^>]*>/g)].map((m) => ({ id: m[1], i: m.index, ouvrant: m[0] }));
  const tuilesHtml = entre(sec, '<div class="jeuBandeau"', '</div>');
  const tuiles = [];
  for (const m of tuilesHtml.matchAll(/<button([^>]*)>(.*?)<\/button>/g)) {
    const idm = /\sid="([^"]+)"/.exec(m[1]);
    const tu = noeud(idm ? idm[1] : 'tuile' + tuiles.length, bd, 'button', '<button' + m[1] + '>');
    const b = /<b>([^<]*)<\/b>/.exec(m[2]), sp = /<span[^>]*>([^<]*)<\/span>/.exec(m[2]);
    tu.enfantsTexte = { b: b ? b[1] : '', span: sp ? sp[1] : '' };
    tu.offsetLeft = 150 * tuiles.length; tu.offsetWidth = 140;
    tuiles.push(tu);
  }
  cartes.forEach((c, k) => {
    const carte = noeud(c.id, v, 'div', c.ouvrant);
    const html = sec.slice(c.i + c.ouvrant.length, k + 1 < cartes.length ? cartes[k + 1].i : sec.length);
    /* les plis <details id="…"> de la carte : leur etendue dans le HTML (de l ouverture a leur </details>) ; un id dedans y appartient */
    const plis = [...html.matchAll(/<details[^>]*\sid="([^"]+)"[^>]*>/g)].map((m) => ({ id: m[1], de: m.index, a: html.indexOf('</details>', m.index) }));
    for (const m of html.matchAll(/<([a-z]+)([^>]*\sid="([^"]+)"[^>]*)>/g)) if (!els.has(m[3])) {
      const e = noeud(m[3], carte, m[1], '<' + m[1] + m[2] + '>');
      const p = plis.find((x) => x.id !== m[3] && m.index > x.de && m.index < x.a);
      if (p) e.dansPli = p.id;
      if (m[1] === 'details') e.open = /\sopen(?=[\s>=])/.test(m[2]);
    }
  });
  /* les cartes cachees par la regle CSS initiale, LUES dans le CSS de la page (pas recopiees ici) */
  const regle = /#v-missions:not\(\[data-jeu\]\) :is\(([^)]*)\)/.exec(t);
  etat.initiales = regle ? regle[1].split(',').map((s) => s.trim().replace(/^#/, '')) : [];
  const document = {
    hidden: false,
    getElementById: (id) => els.get(id) || null,
    querySelector: (s) => (s === '.jeuBandeau' ? bd : s.startsWith('#') ? els.get(s.slice(1)) || null : null),
    querySelectorAll: (s) => (s === '.jeuBandeau [data-jeu]' ? tuiles.filter((x) => x.getAttribute('data-jeu') !== null) : []),
    get activeElement() { return etat.focus ? els.get(etat.focus) : null; },
  };
  return { els, document, etat, tuiles, el: (id) => els.get(id) };
}

/* ---------------------------------------------------------------- la page executee */
function stockage(mode, init) {
  const m = new Map(Object.entries(init || {}));
  if (mode === 'jette') return { getItem() { throw new Error('SecurityError: storage disabled'); }, setItem() { throw new Error('SecurityError: storage disabled'); } };
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, _m: m };
}
function monter(texte, { stock = 'ok', garde = null, hash = '', avant = null } = {}) {
  const { tout } = code(texte);
  const dom = faireDom(texte);
  if (avant) avant(dom);
  const minuteurs = [], boutons = [], ecouteFenetre = {};
  const st = stockage(stock, garde ? { tbJeuChoisi: garde } : null);
  const ctx = {
    document: dom.document, window: { innerHeight: 812, addEventListener: (ty, f) => { ecouteFenetre[ty] = f; } },
    location: { hash }, setTimeout: (f) => { minuteurs.push(f); return minuteurs.length; },
    $: (s) => dom.document.querySelector(s),
    allerA: (nom) => { dom.el('v-missions').classList.toggle('on', nom === 'missions'); },
    /* palette */
    palTuiles: new Map(), palUsages: {}, palRendre: true, noterUsage: (u) => u, ecrireUsages: () => {}, palStock: () => null, palFermer: () => {},
    entreesCommandes: () => [], entreesOnglets, entreesJeu, COMMANDES: [], bcOuvrirPop: () => {}, bcEcrireModele: () => {}, PRECOMMANDES: [], bcVue: () => {},
    /* commandes du panneau */
    bcMessage: () => ({}), bcEtape: () => {}, bcBoutons: (m, l) => { boutons.push(...l); }, mesBlocksPourMission: () => {},
    verifierRollsEnAttente: async () => ({ reglables: [{ blocsRestants: 12 }], tropTot: [], perdus: [] }), texteBlocs: () => '12 blocks', sParBlocApp: 2, intervalleJeuMs: () => 5000,
    duelsCfg: {}, peindreDuels: null,
    /* poserBoutonsRolls */
    rollsCfg: null, Rg: { gainMax: () => null, texteGains: () => '', PHRASE_GAINS_NON_LUS: 'Prizes not read' }, usdcTexte: (x) => (Number(x) / 1e6).toFixed(2), jb: () => {},
    peindrePayerAvec: async () => {},
  };
  Object.defineProperty(ctx, 'localStorage', { get() { if (stock === 'absent') throw new Error('SecurityError: localStorage'); return st; } });
  const noms = ['montrerJeu', 'peindreChoixJeu', 'palConstruire', 'palChoisir', 'bcCommandePostTask', 'suivreRollsEnAttente', 'ouvrirDuel', 'ouvrirJeuDuLien', 'jeuReprendreFocus', 'poserBoutonsRolls'];
  /* sloppy : `with` donne au code les memes noms libres que la page (localStorage peut JETER a la lecture, comme en navigation privee) */
  const f = new Function('ctx', 'with (ctx) { return (function () {\n' + tout + '\n;return {' + noms.map((k) => k + ': typeof ' + k + " === 'function' ? " + k + ' : null').join(', ') + '}; })(); }');
  const api = f(ctx);
  /* le peintre des Duels, tel que la page le fait : tuile + carte selon le contrat, PUIS peindreChoixJeu (verifie a part dans la source) */
  ctx.peindreDuels = async () => { const on = !!ctx.contratDuels; dom.el('duelsCarte').hidden = !on; dom.el('jbDuelsTuile').hidden = !on; api.peindreChoixJeu(); };
  /* les minuteurs de la page, joues dans l ordre ; entre deux tours, les promesses en cours avancent (setImmediate) */
  const vider = async () => { for (let k = 0; k < 60; k++) { await new Promise((r) => setImmediate(r)); const l = minuteurs.splice(0); for (const g of l) g(); } };
  return { ...api, dom, ctx, st, boutons, minuteurs, vider, ecouteFenetre };
}
const montrees = (app) => JEUX.filter((id) => { const e = app.dom.el(id); return !e.hidden && e.getAttribute('data-hors') !== '1' && app.dom.el('v-missions').getAttribute('data-jeu') !== null; });
const presses = (app) => app.dom.tuiles.filter((t) => t.getAttribute('aria-pressed') === 'true').map((t) => t.getAttribute('data-jeu'));
const tuileDe = (app, carte, focus) => app.dom.tuiles.find((t) => t.getAttribute('data-jeu') === carte && (focus === undefined || t.getAttribute('data-focus') === focus));
const ouvrir = (app) => app.ctx.allerA('missions');

/* ---------------------------------------------------------------- les scenarios (chacun rend { ok, ... }) */
const S = {};
S.UNE = (t) => {
  const app = monter(t); ouvrir(app);
  const r = [];
  for (const tu of app.dom.tuiles.filter((x) => !x.hidden)) {
    tu.click();
    const m = montrees(app), p = presses(app), id = tu.getAttribute('data-jeu');
    const pasJeux = PAS_JEUX.every((c) => app.dom.el(c).offsetParent !== null && app.dom.el(c).getAttribute('data-hors') === null);
    r.push(m.length === 1 && m[0] === id && p.length > 0 && p.every((x) => x === id) && app.dom.el(id).offsetParent !== null && pasJeux && app.st._m.get('tbJeuChoisi') === id);
  }
  return { ok: r.length >= 6 && r.every(Boolean), r };
};
S.DEFAUT = (t) => {
  const app = monter(t); ouvrir(app);
  const m = montrees(app);
  /* 2026-10-24 : la tuile Slots (cachee sans contrat) mene aussi a tirCarte — on compte les tuiles pressees VISIBLES (Roll, Ticket, Week pass) */
  const pv = app.dom.tuiles.filter((t) => !t.hidden && t.getAttribute('aria-pressed') === 'true').map((t) => t.getAttribute('data-jeu'));
  return { ok: m.length === 1 && m[0] === 'tirCarte' && presses(app).every((x) => x === 'tirCarte') && pv.length === 3 && app.dom.el('v-missions').getAttribute('data-jeu') === 'tirCarte', m };
};
S.GARDE = (t) => {
  const app = monter(t, { garde: 'skinCarte' }); ouvrir(app);
  const app2 = monter(t, { garde: 'pasUnJeu' }); ouvrir(app2);
  return { ok: montrees(app).join() === 'skinCarte' && montrees(app2).join() === 'tirCarte', a: montrees(app), b: montrees(app2) };
};
S.REPLI = (t) => {
  /* les Duels gardes, mais la tuile est cachee (pas de contrat servi) : tirCarte ; la tuile apparait (le peintre) : les Duels reviennent */
  const app = monter(t, { garde: 'duelsCarte' }); ouvrir(app);
  const a = montrees(app).join() === 'tirCarte';
  app.dom.el('duelsCarte').hidden = false; app.dom.el('jbDuelsTuile').hidden = false; app.peindreChoixJeu();
  const b = montrees(app).join() === 'duelsCarte';
  /* la tuile repart (contrat retire) : retour a tirCarte, sans carte vide montree */
  app.dom.el('duelsCarte').hidden = true; app.dom.el('jbDuelsTuile').hidden = true; app.peindreChoixJeu();
  const c = montrees(app).join() === 'tirCarte';
  /* un clic sur une tuile CACHEE (l ancienne palette le faisait) ne montre pas une carte vide */
  tuileDe(app, 'duelsCarte').click();
  const d = montrees(app).join() === 'tirCarte';
  /* le visiteur a touche l onglet pendant le repli : la tuile qui arrive ensuite ne change plus la carte sous sa main */
  const app2 = monter(t, { garde: 'duelsCarte' }); ouvrir(app2);
  app2.dom.el('v-missions').ecoute.pointerdown();
  app2.dom.el('duelsCarte').hidden = false; app2.dom.el('jbDuelsTuile').hidden = false; app2.peindreChoixJeu();
  const e = montrees(app2).join() === 'tirCarte';
  /* sans geste, le choix garde revient bien (b) ; et un geste quand rien n est en repli ne change rien */
  return { ok: a && b && c && d && e, a, b, c, d, e };
};
S.STOCKAGE = (t) => {
  let ok = true, err = null;
  for (const mode of ['jette', 'absent']) {
    try {
      const app = monter(t, { stock: mode }); ouvrir(app);
      const a = montrees(app).join() === 'tirCarte';
      tuileDe(app, 'missionsCarte').click();
      ok = ok && a && montrees(app).join() === 'missionsCarte';
    } catch (e) { ok = false; err = String(e.message); }
  }
  return { ok, err };
};
S.FOCUS = (t) => {
  const app = monter(t); ouvrir(app);
  tuileDe(app, 'brainJeuCarte').click();
  const a = app.dom.etat.focus === 'bjJouer' && app.dom.etat.focusVu.every((x) => x.vu);
  tuileDe(app, 'tirCarte', 'jourRoll').click();
  const b = app.dom.etat.focus === 'jourRoll';
  /* Week pass : son bouton est cache sans contrat BlockRolls -> aucun focus (pas un bouton invisible) */
  app.dom.etat.focus = null; tuileDe(app, 'tirCarte', 'jourPass').click();
  const c = app.dom.etat.focus === null && montrees(app).join() === 'tirCarte';
  return { ok: a && b && c && app.dom.etat.focusVu.length === 2 && app.dom.etat.focusVu.every((x) => x.vu), a, b, c, f: app.dom.etat.focusVu };
};
S.HIDDEN_INTACT = (t) => {
  /* l etat `hidden` du HTML, releve AVANT que le code de la page tourne (le choix initial s execute au chargement) */
  let avant = null;
  const app = monter(t, { avant: (dom) => { avant = [...JEUX, ...PAS_JEUX].map((id) => dom.el(id).hidden).join(); } }); ouvrir(app);
  for (const tu of app.dom.tuiles) tu.click();
  app.peindreChoixJeu();
  const apres = [...JEUX, ...PAS_JEUX].map((id) => app.dom.el(id).hidden).join();
  return { ok: avant === apres, avant, apres };
};
S.PALETTE = async (t) => {
  const app = monter(t, { garde: 'skinCarte' });
  const entrees = app.palConstruire();
  const jeux = entrees.filter((e) => e.faire === 'jeu');
  /* Duels et Slots : tuiles cachees (pas de contrat) -> pas proposees */
  const sansCachees = jeux.length === 6 && !jeux.some((e) => /duelsCarte|slotsCarte/.test(e.id));
  const brain = jeux.find((e) => e.jeu === 'brainJeuCarte');
  app.palChoisir(brain);
  await app.vider();
  const vu1 = montrees(app).join() === 'brainJeuCarte' && app.dom.etat.focus === 'bjJouer' && app.dom.etat.focusVu.every((x) => x.vu);
  return { ok: sansCachees && !!brain && vu1, sansCachees, vu1, ids: jeux.map((e) => e.id) };
};
S.POST_TASK = async (t) => {
  const app = monter(t, { garde: 'skinCarte' });
  app.bcCommandePostTask({ reward: '10', players: 3, hold: '1' });
  await app.vider();
  const form = app.dom.el('missionForm'), d = app.dom.etat.defile.filter((x) => x.id === 'missionForm');
  return { ok: montrees(app).join() === 'missionsCarte' && form.offsetParent !== null && d.length === 1 && d[0].vu === true && app.dom.el('mfReward').value === '10', m: montrees(app), d };
};
S.OPEN_TAB = async (t) => {
  const app = monter(t, { garde: 'skinCarte', avant: (dom) => { dom.el('rollsRegler').hidden = false; } });
  const p = app.suivreRollsEnAttente({}); await app.vider(); await p;
  const b = app.boutons.find((x) => x[0] === 'Open the Game tab');
  if (b) b[1]();
  return { ok: !!b && montrees(app).join() === 'tirCarte' && app.dom.etat.focus === 'rollsRegler' && app.dom.etat.focusVu.every((x) => x.vu), m: montrees(app), f: app.dom.etat.focusVu };
};
S.DUEL = async (t) => {
  const app = monter(t, { garde: 'skinCarte' });
  app.ctx.contratDuels = true;
  app.ouvrirDuel(null);
  await app.vider();
  /* sans contrat servi : la carte vide n est jamais montree, le choix retombe sur tirCarte */
  const app2 = monter(t, { garde: 'skinCarte' });
  app2.ouvrirDuel(null);
  await app2.vider();
  return { ok: montrees(app).join() === 'duelsCarte' && app.dom.el('duelsCarte').offsetParent !== null && montrees(app2).join() === 'tirCarte', a: montrees(app), b: montrees(app2) };
};
S.LIEN = async (t) => {
  const app = monter(t, { garde: 'skinCarte' });
  const r1 = app.ouvrirJeuDuLien('game/brain');
  const a = r1 === true && montrees(app).join() === 'brainJeuCarte' && app.dom.etat.focus === 'bjJouer' && app.dom.etat.focusVu.every((x) => x.vu);
  const r2 = app.ouvrirJeuDuLien('game/inconnu');
  const b = r2 === false && montrees(app).join() === 'brainJeuCarte';
  /* au chargement : /app.html#game/missions */
  const app2 = monter(t, { hash: '#game/missions' });
  await app2.vider();
  const c = montrees(app2).join() === 'missionsCarte' && app2.dom.el('v-missions').classList.contains('on');
  /* au changement : le hashchange */
  app2.ctx.location.hash = '#missions/skins'; app2.ecouteFenetre.hashchange();
  const d = montrees(app2).join() === 'skinCarte';
  return { ok: a && b && c && d, a, b, c, d };
};
/* 2026-10-24 (Draws + Slots) : la tuile Slots et #game/slots montrent tirCarte (plus de carte a part) ; sans contrat la tuile est cachee et
 *   jamais proposee ; avec contrat + wallet, le focus va a Spin, VISIBLE ; un ancien choix garde « slotsCarte » retombe sur tirCarte */
/* PLI (2026-10-24, Phil : « un seul jeu au centre ») : le Roll classique est replie (#rollPli). La tuile Roll et #game/roll OUVRENT le pli
 *   puis donnent le focus au roll VISIBLE (le roll d entrainement sans wallet ; le Roll paye quand il le remplace) ; #game/slots et la tuile
 *   Slots donnent le focus au Spin sans ouvrir le pli. */
S.PLI = async (t) => {
  const app = monter(t); ouvrir(app);
  const pli0 = app.dom.el('rollPli');
  if (!pli0 || pli0.tag !== 'details' || app.dom.el('jourRoll').dansPli !== 'rollPli' || app.dom.el('jourRollPaye').dansPli !== 'rollPli' || app.dom.el('rollsEtat').dansPli !== 'rollPli') return { ok: false, pourquoi: 'pli du Roll absent' };
  const ferme0 = pli0.open === false && app.dom.el('jourRoll').offsetParent === null;
  tuileDe(app, 'tirCarte', 'jourRoll').click();
  const a = pli0.open === true && app.dom.etat.focus === 'jourRoll' && app.dom.etat.focusVu.every((x) => x.vu);
  /* un wallet et le contrat : le roll d entrainement est cache, le Roll paye le remplace — le lien l ouvre et le focus */
  const app2 = monter(t, { avant: (dom) => { dom.el('jourRoll').hidden = true; dom.el('jourRollPaye').hidden = false; } });
  const r2 = app2.ouvrirJeuDuLien('game/roll');
  const b = r2 === true && app2.dom.el('rollPli').open === true && app2.dom.etat.focus === 'jourRollPaye' && app2.dom.etat.focusVu.every((x) => x.vu);
  /* #game/slots : le Spin (hors du pli) ; le pli reste ferme */
  const app3 = monter(t, { avant: (dom) => { dom.el('jbSlotsTuile').hidden = false; dom.el('slotsZone').hidden = false; dom.el('slotsSpin').hidden = false; } });
  app3.ouvrirJeuDuLien('game/slots');
  const c = app3.dom.etat.focus === 'slotsSpin' && app3.dom.el('rollPli').open === false && app3.dom.el('slotsSpin').dansPli === undefined;
  return { ok: ferme0 && a && b && c, ferme0, a, b, c, f2: app2.dom.etat.focus };
};
S.SLOTS = async (t) => {
  const avecSlots = (dom) => { dom.el('jbSlotsTuile').hidden = false; dom.el('slotsZone').hidden = false; dom.el('slotsSpin').hidden = false; };
  const app = monter(t, { garde: 'skinCarte', avant: avecSlots }); ouvrir(app);
  const tu = tuileDe(app, 'tirCarte', 'slotsSpin');
  if (!tu) return { ok: false, pourquoi: 'pas de tuile Slots vers tirCarte' };
  tu.click();
  const a = montrees(app).join() === 'tirCarte' && app.dom.etat.focus === 'slotsSpin' && app.dom.etat.focusVu.every((x) => x.vu) && tu.getAttribute('aria-pressed') === 'true';
  /* le lien */
  const app2 = monter(t, { garde: 'skinCarte', avant: avecSlots });
  const r = app2.ouvrirJeuDuLien('game/slots');
  const b = r === true && montrees(app2).join() === 'tirCarte' && app2.dom.etat.focus === 'slotsSpin';
  /* sans contrat (tuile et Spin caches) : le lien montre la carte Draws, aucun focus sur un bouton invisible */
  const app3 = monter(t, { garde: 'skinCarte' });
  const r3 = app3.ouvrirJeuDuLien('game/slots');
  const c = r3 === true && montrees(app3).join() === 'tirCarte' && app3.dom.etat.focus === null;
  /* l ancien choix garde (avant la fusion) : la carte Draws, celle ou sont les Slots */
  const app4 = monter(t, { garde: 'slotsCarte', avant: avecSlots }); ouvrir(app4);
  const d = montrees(app4).join() === 'tirCarte';
  /* plus aucune carte #slotsCarte dans la page ; la zone des Slots est DANS tirCarte */
  const sec = entre(t, '<div class="carte" id="tirCarte"', '<div class="carte" id="brainJeuCarte"');
  const e = !/id="slotsCarte"/.test(t) && /<div class="slotsZone" id="slotsZone" hidden>/.test(sec) && /id="slotsSpin"/.test(sec);
  return { ok: a && b && c && d && e, a, b, c, d, e };
};
/* la source des peintres : chacun rappelle peindreChoixJeu juste apres avoir pose sa tuile (sinon un choix garde ne revient jamais) */
S.PEINTRES = (t) => {
  const d = fonction(t, 'async function peindreDuels('), s = fonction(t, 'async function peindreSlotsUneFois(');
  /* entre la pose de la tuile et la sortie « pas de contrat » : sinon le choix ne serait repose QU avec un contrat */
  const apres = (f, fin) => { const i = f.indexOf('carte.hidden = !on; if (tuile) tuile.hidden = !on;'), j = f.indexOf('try { peindreChoixJeu(); } catch (_)', i); return i > 0 && j > i && f.indexOf(fin, i) > j; };
  return { ok: apres(s, 'if (!on) return null;') && apres(d, 'if (!on) { liste.textContent') };
};
S.CSS = (t) => {
  /* 2026-10-24 : #slotsCarte retiree de la regle initiale (la carte n existe plus) */
  const a = /#v-missions:not\(\[data-jeu\]\) :is\(#brainJeuCarte,#skinCarte,#missionsCarte,#duelsCarte\),#v-missions \.carte\[data-hors="1"\]\{display:none\}/.test(t);
  const b = /@media \(max-width:600px\)\{\n  \.jeuBandeau,\.jeuBandeau\[data-n="7"\],\.jeuBandeau\[data-slots="1"\]\{display:flex;overflow-x:auto;[^}]*scroll-snap-type:x [a-z]+;[^}]*\}\n  \.jeuBandeau>\.jeuJeu\{flex:0 0 1[34]\dpx;scroll-snap-align:start;[^}]*\}\n\}/.test(t);
  const c = /\.jeuJeu\[aria-pressed="true"\]\{border-color:var\(--accent\);/.test(t);
  /* aucune autre regle n affiche une carte de jeu par-dessus data-hors (pas de !important sur ces ids) */
  const d = !/#(tirCarte|brainJeuCarte|skinCarte|missionsCarte|duelsCarte|slotsCarte)[^{]*\{[^}]*display:[^;}]*!important/.test(t);
  return { ok: a && b && c && d, a, b, c, d };
};

/* l ordre du HTML : chaque carte de jeu AVANT Earn / Swap UNIT / How it works (sinon la carte choisie s affiche sous deux cartes qui ne
 *   sont pas la sienne — mesure a 375 px pour Skins avant le deplacement) */
S.ORDRE = (t) => {
  const sec = entre(t, '<section class="volet" id="v-missions"', '</section>');
  const pos = (id) => sec.indexOf('<div class="carte" id="' + id + '"');
  const dernierJeu = Math.max(...JEUX.map(pos)), premierAutre = Math.min(...PAS_JEUX.map(pos));
  return { ok: JEUX.every((id) => pos(id) > 0) && dernierJeu < premierAutre, dernierJeu, premierAutre };
};
/* FROID (revue 3, defaut 4 — mesure au navigateur a 375 px : la zone des Slots restait cachee ~32 s pendant /api/slots, et le focus du
 *   lien #game/slots n etait jamais redonne). Le lien est ouvert AVANT que le bouton soit visible ; le peintre le montre ensuite et appelle
 *   jeuReprendreFocus : Spin recoit le focus, visible. Un geste du visiteur entre les deux l annule. #game/roll : le lien donne le focus au
 *   roll d entrainement, puis le VRAI poserBoutonsRolls (contrat + wallet) le remplace par le Roll paye — le focus suit, pli ouvert. */
S.FROID = async (t) => {
  const cache = (dom) => { dom.el('jbSlotsTuile').hidden = true; dom.el('slotsZone').hidden = true; dom.el('slotsSpin').hidden = true; };
  const montrer = (app) => { app.dom.el('jbSlotsTuile').hidden = false; app.dom.el('slotsZone').hidden = false; app.dom.el('slotsSpin').hidden = false; app.peindreChoixJeu(); };
  const app = monter(t, { avant: cache });
  if (typeof app.jeuReprendreFocus !== 'function') return { ok: false, pourquoi: 'jeuReprendreFocus absent' };
  app.ouvrirJeuDuLien('game/slots');
  /* un repeint avant que Spin soit visible : rien (jamais un focus sur un bouton cache) */
  const a0 = app.dom.etat.focus === null && app.jeuReprendreFocus() === false && app.dom.etat.focus === null;
  montrer(app);
  const ra = app.jeuReprendreFocus();
  const a = a0 && ra === true && app.dom.etat.focus === 'slotsSpin' && app.dom.etat.focusVu.every((x) => x.vu);
  /* un deuxieme appel (le repeint suivant) ne reprend plus rien */
  const a2 = app.jeuReprendreFocus() === false;
  /* le visiteur touche l onglet avant la reponse : aucun focus ne lui est pris */
  const app2 = monter(t, { avant: cache });
  app2.ouvrirJeuDuLien('game/slots');
  app2.dom.el('v-missions').ecoute.pointerdown();
  montrer(app2);
  const b = app2.jeuReprendreFocus() === false && app2.dom.etat.focus === null;
  /* #game/roll froid : le roll d entrainement d abord, puis le Roll paye (le vrai poserBoutonsRolls) */
  const app3 = monter(t);
  app3.ouvrirJeuDuLien('game/roll');
  const c0 = app3.dom.etat.focus === 'jourRoll';
  app3.poserBoutonsRolls({ ok: true, rolls: { contrat: '0x' + 'ab'.repeat(20), prixRoll: '500000', prixPass: '5000000', passRolls: 30 } }, '0x' + 'a1'.repeat(20));
  const c = c0 && app3.dom.el('jourRoll').hidden === true && app3.dom.etat.focus === 'jourRollPaye' && app3.dom.el('rollPli').open === true && app3.dom.etat.focusVu.every((x) => x.vu);
  return { ok: a && a2 && b && c, a0, ra, a, a2, b, c0, c, f3: app3.dom.etat.focus };
};

const NOMS = Object.keys(S);
for (const k of NOMS) { const r = await S[k](APP); vu(r.ok === true, 'page executee : ' + k + (r.ok ? '' : ' ' + JSON.stringify(r))); }
/* temoin : l extraction a bien trouve chaque morceau (un morceau vide rendrait un mutant « tue » par erreur de syntaxe) */
{ const { morceaux } = code(APP); for (const [k, v] of Object.entries(morceaux)) vu(v.length > 120, 'morceau extrait : ' + k + ' (' + v.length + ' car.)'); }

/* ---------------------------------------------------------------- les mutants (sur une COPIE de app.html, en memoire) */
const ANCIEN_CLIC = "for (const b of jeuTuiles()) b.addEventListener('click', () => {\n  const c = document.getElementById(b.getAttribute('data-jeu'));\n  if (c) { try { c.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (_) { c.scrollIntoView(); } }\n  const f = b.getAttribute('data-focus'), el = f ? document.getElementById(f) : null;\n  if (el && !el.hidden && el.offsetParent !== null) { try { el.focus({ preventScroll: true }); } catch (_) {} }\n});";
const MUTANTS = [
  ['UNE', 'la tuile ne fait que defiler (l ancien code)', "for (const b of jeuTuiles()) b.addEventListener('click', () => { montrerJeu(b.getAttribute('data-jeu'), b.getAttribute('data-focus'), { defiler: 'siCache' }); });", ANCIEN_CLIC],
  ['UNE', 'aria-pressed jamais pose', "for (const t of jeuTuiles()) t.setAttribute('aria-pressed',", "for (const t of []) t.setAttribute('aria-pressed',"],
  ['UNE', 'le choix n est pas garde', '  if (o.noter !== false) jeuNoterChoix(id);\n', ''],
  ['DEFAUT', 'pas de defaut : rien n est montre sans choix garde', "jeuVoulu = jeuLireChoix() || JEU_DEFAUT;\npeindreChoixJeu();", 'jeuVoulu = jeuLireChoix();'],
  ['GARDE', 'le choix garde est ignore', 'jeuVoulu = jeuLireChoix() || JEU_DEFAUT;', 'jeuVoulu = JEU_DEFAUT;'],
  ['REPLI', 'repli retire (une tuile cachee montre sa carte vide)', 'const id = jeuOuvert(jeuVoulu) ? jeuVoulu : JEU_DEFAUT;', 'const id = jeuVoulu || JEU_DEFAUT;'],
  ['REPLI', 'jeuOuvert ne regarde pas si la tuile est cachee', "t.getAttribute('data-jeu') === id && !t.hidden);", "t.getAttribute('data-jeu') === id);"],
  ['REPLI', 'un retour tardif remplace la carte que le visiteur utilise', 'const fige = () => { if (jeuMontre && jeuMontre !== jeuVoulu) jeuVoulu = jeuMontre; };', 'const fige = () => {};'],
  ['STOCKAGE', 'localStorage lu sans try/catch', 'function jeuLireChoix() { try { const v = localStorage.getItem(JEU_CLE); return JEU_CARTES.includes(v) ? v : null; } catch (_) { return null; } }', 'function jeuLireChoix() { const v = localStorage.getItem(JEU_CLE); return JEU_CARTES.includes(v) ? v : null; }'],
  ['STOCKAGE', 'localStorage ecrit sans try/catch', 'function jeuNoterChoix(id) { try { localStorage.setItem(JEU_CLE, id); } catch (_) { /* stockage refuse : le choix vaut pour cette visite */ } }', 'function jeuNoterChoix(id) { localStorage.setItem(JEU_CLE, id); }'],
  /* 2026-10-24 : l ancre suit montrerJeu (le focus de remplacement et l ouverture du pli du Roll se placent entre la carte et la visibilite) */
  ['FOCUS', 'le focus calcule AVANT de montrer la carte', '  const vu = peindreChoixJeu();\n  const carte = document.getElementById(vu);\n  let el = focusId && vu === id ? document.getElementById(focusId) : null;',
    (t) => { const n = String.fromCharCode(10), i = t.indexOf('  const vu = peindreChoixJeu();'), fin = '  const visible = !!el && !el.hidden && el.offsetParent !== null;', j = t.indexOf(fin, i) + fin.length;
      return t.slice(0, i) + '  let el = focusId ? document.getElementById(focusId) : null;' + n + '  const visible = !!el && !el.hidden && el.offsetParent !== null;' + n + '  const vu = peindreChoixJeu();' + n + '  const carte = document.getElementById(vu);' + t.slice(j); }],
  ['PLI', 'le pli du Roll n est plus ouvert avant le focus', "  if (el && !el.hidden) { const pli = typeof el.closest === 'function' ? el.closest('details') : null; if (pli && !pli.open) pli.open = true; }", ''],
  ['PLI', 'aucun remplacement du roll d entrainement cache', '  if (el && el.hidden && JEU_FOCUS_SINON[el.id]) {', '  if (false) {'],
  ['PLI', 'le pli ouvert pour un focus sur le Spin (hors du pli)', "  if (el && !el.hidden) { const pli = typeof el.closest === 'function' ? el.closest('details') : null; if (pli && !pli.open) pli.open = true; }",
    "  { const pli = document.getElementById('rollPli'); if (pli) pli.open = true; }"],
  ['FOCUS', 'focus sans garde de visibilite', '  if (visible) { try { el.focus({ preventScroll: true }); } catch (_) {} }', '  if (el) { try { el.focus({ preventScroll: true }); } catch (_) {} }'],
  ['HIDDEN_INTACT', 'le choix ecrit `hidden` au lieu de data-hors', "if (c === id) el.removeAttribute('data-hors'); else el.setAttribute('data-hors', '1');", 'el.hidden = c !== id;'],
  ['PALETTE', 'la palette propose les tuiles cachees', "querySelectorAll('.jeuBandeau [data-jeu]')].filter((b) => !b.hidden).map((b) => {", "querySelectorAll('.jeuBandeau [data-jeu]')].map((b) => {"],
  ['PALETTE', 'la palette defile vers la carte sans la tuile (contourne montrerJeu)', "    if (tuile) setTimeout(() => { try { tuile.click(); } catch (_) {} }, 60);", "    if (tuile) setTimeout(() => { const c = document.getElementById(e.jeu); if (c) c.scrollIntoView(); const f = e.focus ? document.getElementById(e.focus) : null; if (f && f.offsetParent !== null) f.focus(); }, 60);"],
  ['POST_TASK', 'post task contourne montrerJeu', "  montrerJeu('missionsCarte', null, { defiler: false });\n  f.hidden = false;", '  f.hidden = false;'],
  ['OPEN_TAB', 'Open the Game tab contourne montrerJeu', "() => { allerA('missions'); montrerJeu('tirCarte', 'rollsRegler'); }", "() => allerA('missions')"],
  ['DUEL', 'Open a challenge / la marque contourne montrerJeu', "  montrerJeu('duelsCarte', null, { defiler: false });\n  void peindreDuels()", '  void peindreDuels()'],
  ['LIEN', 'le lien #game/<jeu> contourne montrerJeu', "allerA('missions'); montrerJeu(l[0], l[1]); return true; }", "allerA('missions'); return true; }"],
  ['LIEN', 'le hashchange ignore #game/<jeu>', "  if (h === 'game' || h === 'missions') allerA('missions');\n  ouvrirJeuDuLien(h);\n", "  if (h === 'game' || h === 'missions') allerA('missions');\n"],
  ['PEINTRES', 'le peintre des Slots ne repose plus le choix', "  const bd = document.querySelector('.jeuBandeau'); if (bd) bd.dataset.slots = on ? '1' : '0';\n  /* UN JEU A LA FOIS : la tuile vient d apparaitre ou de partir — le choix est repose (retombe sur tirCarte sans elle) */\n  try { peindreChoixJeu(); } catch (_) { /* hors de la page (banc) */ }\n",
    "  const bd = document.querySelector('.jeuBandeau'); if (bd) bd.dataset.slots = on ? '1' : '0';\n"],
  ['PEINTRES', 'le peintre des Duels ne repose plus le choix', "  const bd = document.querySelector('.jeuBandeau'); if (bd) bd.dataset.n = on ? '7' : '6';\n  /* UN JEU A LA FOIS : la tuile vient d apparaitre ou de partir — le choix est repose (retombe sur tirCarte sans elle) */\n  try { peindreChoixJeu(); } catch (_) { /* hors de la page (banc) */ }\n",
    "  const bd = document.querySelector('.jeuBandeau'); if (bd) bd.dataset.n = on ? '7' : '6';\n"],
  /* revue 3, defaut 4 : le lien froid */
  ['FROID', 'le focus attendu n est jamais garde', '  jeuFocusAttente = focusId && (!visible || !!(el && JEU_FOCUS_SINON[el.id])) ? { id, focusId, jusqua: Date.now() + 120000 } : null;', '  jeuFocusAttente = null;'],
  ['FROID', 'le roll d entrainement remplacable n attend pas le Roll paye', '(!visible || !!(el && JEU_FOCUS_SINON[el.id]))', '(!visible)'],
  ['FROID', 'un geste du visiteur n annule pas le focus attendu', '  const lache = () => { fige(); jeuFocusAttente = null; };', '  const lache = () => { fige(); };'],
  ['FROID', 'focus repris sur un bouton encore cache', '  if (!cible || cible.hidden || cible.offsetParent === null) return false;', '  if (!cible) return false;'],
  ['FROID', 'le peintre des Rolls ne redonne pas le focus attendu', '  /* 2026-10-24 (revue 3) : un lien froid #game/roll tape avant /api/tirage : le focus attendu arrive sur le roll visible (paye ou d entrainement) */\n  try { jeuReprendreFocus(); } catch (_) { /* hors de la page (banc) */ }\n', ''],
  ['SLOTS', 'le lien #game/slots vise la carte retiree', "slots: ['tirCarte', 'slotsSpin'] };", "slots: ['slotsCarte', null] };"],
  ['SLOTS', 'la tuile Slots vise la carte retiree', 'data-jeu="tirCarte" data-focus="slotsSpin" id="jbSlotsTuile"', 'data-jeu="slotsCarte" id="jbSlotsTuile"'],
  ['SLOTS', 'la tuile Slots sans focus sur Spin', 'data-jeu="tirCarte" data-focus="slotsSpin" id="jbSlotsTuile"', 'data-jeu="tirCarte" id="jbSlotsTuile"'],
  ['CSS', 'data-hors sans effet (regle CSS retiree)', ',#v-missions .carte[data-hors="1"]{display:none}', '{display:none}'],
  ['CSS', 'la rangee du telephone redevient une grille', '{display:flex;overflow-x:auto;overflow-y:hidden;', '{display:grid;overflow-y:hidden;'],
  /* la carte Skins remise a son ancienne place (apres Swap UNIT) */
  ['ORDRE', 'la carte Skins de nouveau sous Earn et Swap UNIT', '    <div class="carte" id="skinCarte">', (t) => {
    const re = /    <\/div>\r?\n/g; re.lastIndex = t.indexOf('id="skinOuvrirMarche"'); const m = re.exec(t);
    const i = t.indexOf('    <div class="carte" id="skinCarte">'), j = m.index + m[0].length;
    const bloc = t.slice(i, j), sans = t.slice(0, i) + t.slice(j), k = sans.indexOf('    <!-- HOW IT WORKS');
    return sans.slice(0, k) + bloc + sans.slice(k);
  }],
];
let tues = 0;
for (const [s, nom, de, vers] of MUTANTS) {
  vu(APP.split(de).length === 2, 'mutant « ' + nom + ' » : ancre unique dans app.html');
  const copie = typeof vers === 'function' ? vers(APP) : APP.replace(de, () => vers);
  vu(copie !== APP, 'mutant « ' + nom + ' » : la copie differe');
  /* un mutant doit rester du code VALIDE : rougir par erreur de syntaxe ne prouverait rien */
  let r; try { r = await S[s](copie); } catch (e) { r = { ok: false, jete: String(e.message), syntaxe: e instanceof SyntaxError }; }
  vu(r.syntaxe !== true, 'mutant « ' + nom + ' » : code valide (pas une erreur de syntaxe)');
  vu(r.ok === false, 'MUTANT « ' + nom + ' » : le scenario ' + s + ' ROUGIT');
  tues += 1;
}
console.log('ok jeu-focus - ' + n + ' assertions, ' + NOMS.length + ' scenarios, ' + tues + '/' + MUTANTS.length + ' mutants tues ; NE PROUVE PAS le rendu au navigateur (hauteurs, defilement), un vrai tap');
