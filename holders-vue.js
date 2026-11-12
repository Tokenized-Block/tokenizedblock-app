/* holders-vue.js — the visual parts of the Wallet → Holders cards (lot 378, Phil 2026-11-12: "visually easy to understand, better than plain
 *   text"). Pure: no network, no signing, no number of its own. Every figure it draws is passed in by the page, which READ it on chain
 *   (holders vault, hearts, lock, monthly lock rewards) or from the server (/api/points). The builders take the `document` to use, so a test
 *   can run them on a fake DOM.
 *   Accessibility: every bar is a progressbar or meter with aria-valuenow / min / max AND an aria-valuetext that says the real figures; a
 *   timeline is role="img" with a label that says it in words; a ticked step says "Done" / "To do" in its text, not only with a mark. */

/** a share of a total in percent, 0..100, one decimal (raw integers, BigInt-safe); 0 when the total is 0 or unread */
export function pct(part, total) {
  let p, t;
  try { p = BigInt(part); t = BigInt(total); } catch (_) { return 0; }
  if (t <= 0n || p <= 0n) return 0;
  if (p >= t) return 100;
  return Number(p * 1000n / t) / 10;
}
/** "5 d 9 h", "3 h 12 min", "4 min" — days and hours, never rounded up (the lock card's own rule) */
export function duree(secondes) {
  const x = Math.max(0, Math.floor(Number(secondes) || 0));
  const d = Math.floor(x / 86400), h = Math.floor((x % 86400) / 3600), m = Math.floor((x % 3600) / 60);
  return d > 0 ? d + ' d ' + h + ' h' : (h > 0 ? h + ' h ' + m + ' min' : m + ' min');
}
export const jour = (s) => new Date(Number(s) * 1000).toISOString().slice(0, 10);
export const minute = (s) => new Date(Number(s) * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

/** the week of the vault: its start is its end minus the hearts' EPOCH (both read); null when either is unread */
export function semaine({ fin, longueur, maintenant }) {
  const f = Number(fin), L = Number(longueur), t = Number(maintenant);
  if (!(f > 0) || !(L > 0) || !Number.isFinite(t)) return null;
  const debut = f - L, ecoule = Math.min(L, Math.max(0, t - debut));
  return { debut, fin: f, longueur: L, ecoule, reste: Math.max(0, f - t), pct: Math.round(ecoule * 1000 / L) / 10, finie: t >= f };
}

/** the three steps of "how you get paid", for THIS wallet (null wallet: the steps without a tick). The rule is the vault's own, passed in:
 *  claiming needs `need` TBLOCK locked and a lock that lasts at least `minCommit` more seconds (EP.claimCheck says the same before a claim);
 *  playing = this wallet's play of the week (V.playOf) above 0. Amounts arrive formatted (fmt), the price-free "$15" only when read. */
export function etapesPaiement({ wallet, locked, need, unlockAt, minCommit, maintenant, mien, finSemaine, semaineNo, accesUsd = null, fmt, fenetreJours = null }) {
  const L = BigInt(locked || 0), N = BigInt(need || 0), U = Number(unlockAt || 0), M = minCommit === null || minCommit === undefined ? null : Number(minCommit), t = Number(maintenant);
  const assez = L >= N && N > 0n, dure = M === null ? null : U >= t + M;
  const e1 = { titre: accesUsd !== null ? 'Lock $' + Number(accesUsd).toLocaleString('en-US') + ' of TBLOCK' : 'Lock ' + fmt(N) + ' TBLOCK',
    detail: (accesUsd !== null ? fmt(N) + ' TBLOCK at the contract price' : 'at least that much locked') + (M === null ? '' : ', in a lock that lasts ' + Math.round(M / 86400) + ' more days') };
  const e2 = { titre: 'Play this week', detail: 'a heart, a TAM art mint or a skin mint' };
  const e3 = { titre: 'Claim after the close', detail: 'week ' + semaineNo + ' closes ' + minute(finSemaine) + (fenetreJours ? '; then ' + fenetreJours + ' days to claim' : '') };
  if (!wallet) return [{ ...e1, etat: 'info' }, { ...e2, etat: 'info' }, { ...e3, etat: 'info' }];
  if (assez && dure !== false) { e1.etat = dure === null ? 'info' : 'fait'; e1.detail = fmt(L) + ' TBLOCK locked until ' + jour(U); }
  else if (assez) { e1.etat = 'afaire'; e1.detail = 'your ' + fmt(L) + ' TBLOCK lock ends ' + jour(U) + ': it must last ' + Math.round(M / 86400) + ' more days'; }
  else { e1.etat = 'afaire'; e1.detail = 'you have ' + fmt(L) + ' TBLOCK locked; ' + e1.detail; }
  const joue = BigInt(mien || 0) > 0n;
  e2.etat = joue ? 'fait' : 'afaire';
  if (joue) e2.detail = 'you put in ' + fmt(mien) + ' TBLOCK this week';
  e3.etat = t >= Number(finSemaine) ? 'afaire' : 'attente';
  return [e1, e2, e3];
}
export const MOT_ETAT = Object.freeze({ fait: 'Done', afaire: 'To do', attente: 'Later', info: '' });

/** the marks of the lock-factor gauge, from the vault's rules READ on chain (REGLES_VAULT values as BigInt); [] when unread */
export function reperesFacteur(r) {
  if (!r || ['TIER1_USD', 'TIER2_USD', 'TIER3_USD', 'TIER1_BONUS', 'TIER2_BONUS', 'TIER3_BONUS', 'TIME_BONUS', 'TIME_FULL', 'MAX_FACTOR'].some((k) => typeof r[k] !== 'bigint')) return [];
  const max = Number(r.MAX_FACTOR) / 10000;
  if (!(max > 1)) return [];
  const pos = (f) => Math.round((f - 1) / (max - 1) * 1000) / 10;
  const x = (bps) => '×' + (1 + Number(bps) / 10000).toFixed(2);
  const d = (u) => '$' + Number(u).toLocaleString('en-US');
  return [
    { pos: pos(1 + Number(r.TIER1_BONUS) / 10000), haut: d(r.TIER1_USD), bas: x(r.TIER1_BONUS) },
    { pos: pos(1 + Number(r.TIER2_BONUS) / 10000), haut: d(r.TIER2_USD), bas: x(r.TIER2_BONUS) },
    { pos: pos(1 + Number(r.TIER3_BONUS) / 10000), haut: d(r.TIER3_USD), bas: x(r.TIER3_BONUS) },
    { pos: 100, haut: '+' + Math.round(Number(r.TIME_FULL) / 86400) + ' days', bas: '×' + max.toFixed(2) },
  ];
}

/** the months of the monthly lock rewards as chips: from the current month to the last one this lock earns (all read on chain) */
export function moisPuces({ courant, premier, dernier, n, joue }) {
  const c = Number(courant), fin = Math.max(c, Number(n) > 0 ? Number(dernier) : c);
  const out = [];
  for (let k = c; k <= fin && out.length < 24; k++) {
    const gagne = Number(n) > 0 && k >= Number(premier) && k <= Number(dernier);
    const sous = k === c ? (joue ? 'now · you played' : 'now · not played yet') : (gagne ? 'your lock earns it' : 'not covered');
    out.push({ titre: 'Month ' + k, sous, etat: k === c ? (joue ? 'fait' : 'afaire') : (gagne ? 'gagne' : 'info'), gagne });
  }
  return out;
}

/* ── DOM builders ── */
const el = (doc, tag, cls, txt) => { const x = doc.createElement(tag); if (cls) x.className = cls; if (txt !== undefined && txt !== null) x.textContent = txt; return x; };
const borne = (v) => Math.max(0, Math.min(100, Number(v) || 0));

/** a horizontal bar: role progressbar (default) or meter, 0..100, with its figures in words */
export function barre(doc, { pct: p, texte, etiquette, role = 'progressbar', cls = '' }) {
  const piste = el(doc, 'div', 'hvPiste' + (cls ? ' ' + cls : ''));
  piste.setAttribute('role', role);
  piste.setAttribute('aria-valuemin', '0'); piste.setAttribute('aria-valuemax', '100'); piste.setAttribute('aria-valuenow', String(Math.round(borne(p))));
  if (texte) piste.setAttribute('aria-valuetext', texte);
  if (etiquette) piste.setAttribute('aria-label', etiquette);
  const r = el(doc, 'div', 'hvRempli'); r.style.width = borne(p) + '%';
  piste.append(r);
  return piste;
}
/** a gauge from `min` to `max` (the lock factor, ×1.00 to the vault's MAX_FACTOR), with the tier marks under it */
export function jauge(doc, { valeur, min, max, reperes = [], texte, etiquette }) {
  const box = el(doc, 'div', 'hvJauge');
  const v = Number(valeur), a = Number(min), b = Number(max);
  const p = b > a ? (Math.max(a, Math.min(b, v)) - a) / (b - a) * 100 : 0;
  const piste = el(doc, 'div', 'hvPiste');
  piste.setAttribute('role', 'meter');
  piste.setAttribute('aria-valuemin', String(a)); piste.setAttribute('aria-valuemax', String(b)); piste.setAttribute('aria-valuenow', String(Math.max(a, Math.min(b, v))));
  if (texte) piste.setAttribute('aria-valuetext', texte);
  if (etiquette) piste.setAttribute('aria-label', etiquette);
  const r = el(doc, 'div', 'hvRempli'); r.style.width = borne(p) + '%';
  piste.append(r);
  for (const m of reperes) { const t = el(doc, 'span', 'hvTic'); t.style.left = borne(m.pos) + '%'; t.setAttribute('aria-hidden', 'true'); piste.append(t); }
  box.append(piste);
  if (reperes.length) {
    const lab = el(doc, 'div', 'hvReperes'); lab.setAttribute('aria-hidden', 'true');
    const deb = el(doc, 'span', 'hvRep hvRepDeb'); deb.append(el(doc, 'b', null, '×' + a.toFixed(2)));
    lab.append(deb);
    /* the last mark sits flush right (hvRepFin); a left on it too would squeeze it to 0 px wide (seen at 375 px) */
    for (const m of reperes) { const s = el(doc, 'span', 'hvRep' + (m.pos >= 100 ? ' hvRepFin' : '')); if (m.pos < 100) s.style.left = borne(m.pos) + '%'; s.append(el(doc, 'b', null, m.haut), el(doc, 'span', null, m.bas)); lab.append(s); }
    box.append(lab);
  }
  return box;
}
/** the numbered steps; each says its state in words ("Done", "To do", "Later") next to its mark */
export function etapes(doc, items, etiquette) {
  const ol = el(doc, 'ol', 'hvEtapes');
  if (etiquette) ol.setAttribute('aria-label', etiquette);
  items.forEach((it, k) => {
    const li = el(doc, 'li', 'hvEtape'); li.dataset.etat = it.etat;
    const m = el(doc, 'span', 'hvMarque', it.etat === 'fait' ? '✓' : String(k + 1)); m.setAttribute('aria-hidden', 'true');
    const c = el(doc, 'div', 'hvEtapeCorps');
    const h = el(doc, 'p', 'hvEtapeTitre'); h.append(el(doc, 'b', null, it.titre));
    if (MOT_ETAT[it.etat]) h.append(' ', el(doc, 'span', 'hvEtat', MOT_ETAT[it.etat]));
    c.append(h, el(doc, 'p', 'hvDetail', it.detail));
    li.append(m, c);
    ol.append(li);
  });
  return ol;
}
/** a timeline: segments in proportion (part > 0), a label under each mark, and the whole said in words (role img) */
export function chronologie(doc, { segments, reperes = [], etiquette }) {
  const box = el(doc, 'div', 'hvChrono');
  box.setAttribute('role', 'img'); box.setAttribute('aria-label', etiquette);
  const piste = el(doc, 'div', 'hvPiste hvPisteChrono'); piste.setAttribute('aria-hidden', 'true');
  const tot = segments.reduce((s, x) => s + Math.max(0, Number(x.part) || 0), 0) || 1;
  for (const s of segments) { const d = el(doc, 'div', 'hvSeg ' + (s.cls || '')); d.style.width = (Math.max(0, Number(s.part) || 0) / tot * 100) + '%'; piste.append(d); }
  box.append(piste);
  const lab = el(doc, 'div', 'hvReperes'); lab.setAttribute('aria-hidden', 'true');
  for (const m of reperes) { const s = el(doc, 'span', 'hvRep' + (m.pos <= 0 ? ' hvRepDeb' : m.pos >= 100 ? ' hvRepFin' : '')); if (m.pos > 0 && m.pos < 100) s.style.left = borne(m.pos) + '%'; s.append(el(doc, 'b', null, m.haut), el(doc, 'span', null, m.bas || '')); lab.append(s); }
  box.append(lab);
  return box;
}
/** chips (the months of the lock rewards, the lock durations): each a title and a line under it */
export function puces(doc, items, etiquette) {
  const ul = el(doc, 'ul', 'hvMois');
  if (etiquette) ul.setAttribute('aria-label', etiquette);
  for (const it of items) {
    const li = el(doc, 'li', 'hvMoisP'); li.dataset.etat = it.etat || 'info';
    const t = el(doc, 'b', null, (it.etat === 'fait' ? '✓ ' : '') + it.titre);
    li.append(t, ' ', el(doc, 'span', null, it.sous));
    ul.append(li);
  }
  return ul;
}
