/* test-typed-input-kept-20261026.mjs — A REPAINT NEVER WIPES WHAT THE PERSON IS TYPING.
 *
 * QA game56: « the page repaints while typing and empties the field ». Browser measurement (prod 20261026-game56, headless, panel
 *   open, Skin view, « + »): the skins market (#bcMarche, with the « Sell at a price » price field) was painted INSIDE THE MARKET VIEW,
 *   in the block's tiles box (the static div #bcMarche, first in the page); the shop kept an empty #bcMarche. The panel repaint
 *   (bcRepeindre, every 3 s) empties that box as soon as the price, the liquidity or the state of a tile changes: the typed price
 *   disappeared along with the whole skins market. Two elements carried the same id.
 * THIS BENCH (LF copy and normalised CRLF copy, extraction CHECKED — a missing function fails, never passes):
 *   U. no id set by the script (bcEl(..., { id: '...' })) already exists in the static HTML;
 *   V. the REAL bcPeindreMarche paints the skins market into the box the shop places, not into the tiles; the REAL emptying of the
 *      tiles (the selector read in bcPeindre) no longer touches the typed price;
 *   W. a repaint of the skins market (bcPeindreMarche, peindreSkinsJeu) keeps the typed price, the focus and the caret;
 *   X. the Bank basket repainted the way bcBanqueCharger does it (its line READ from the source; bcPanierPeindre is frozen text)
 *      keeps the ticked box and the typed amounts; a prefilled amount (not typed) takes the new value;
 *   Y. the missions list (peindreMissions) repainted keeps the typed hash;
 *   Z. nothing is invented: a field that no longer exists after the repaint makes nothing appear, and a field never typed stays empty.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const RAW = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
let ko = 0, n = 0;
const seen = (ok, msg) => { n++; if (ok) console.log('OK  ' + msg); else { ko++; console.log('KO  ' + msg); } };

const extract = (src, name) => {
  const m = new RegExp('\\r?\\n((async )?function ' + name + '\\()').exec(src);
  if (!m) return '';
  const i = m.index + m[0].length - m[1].length, f = /\r?\n\}\r?\n/.exec(src.slice(i));
  return f ? src.slice(i, i + f.index + f[0].length) : '';
};
const extractConst = (src, name) => {
  const m = new RegExp('\\r?\\nconst ' + name + ' = ').exec(src);
  if (!m) return '';
  const i = m.index + m[0].indexOf('const'), e = /\r?\n\};\r?\n/.exec(src.slice(i));
  return e ? src.slice(i, i + e.index + e[0].length) : '';
};

/* ── a small DOM: tree, document order, focus, caret, events bubbling up to the document ── */
function makeDom() {
  const docListeners = {};
  const doc = { activeElement: null, body: null };
  class El {
    constructor(tag) { this.tagName = String(tag).toUpperCase(); this.kids = []; this.parent = null; this.attrs = {}; this.dataset = {}; this.listeners = {};
      this.className = ''; this._t = ''; this.hidden = false; this.disabled = false; this.type = ''; this._value = ''; this.defaultValue = '';
      this.checked = false; this.defaultChecked = false; this.selectionStart = 0; this.selectionEnd = 0; this.style = {}; this.open = false; }
    get id() { return this.attrs.id || ''; }
    set id(v) { this.attrs.id = String(v); }
    get value() { return this._value; }
    set value(v) { this._value = String(v); this.selectionStart = this.selectionEnd = this._value.length; }
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'type') this.type = String(v); if (k === 'value') { this._value = String(v); this.defaultValue = String(v); }
      if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(v); }
    getAttribute(k) { if (k.startsWith('data-')) { const d = this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())]; return d === undefined ? null : d; } return k in this.attrs ? this.attrs[k] : null; }
    append(...xs) { for (const x of xs) { if (x === null || x === undefined) continue; const e = typeof x === 'string' ? text(x) : x; if (e.parent) e.parent.detach(e); e.parent = this; this.kids.push(e); } }
    appendChild(x) { this.append(x); return x; }
    detach(e) { this.kids = this.kids.filter((c) => c !== e); e.parent = null; if (doc.activeElement && (doc.activeElement === e || e.holds(doc.activeElement))) doc.activeElement = doc.body; }
    holds(x) { for (let p = x; p; p = p.parent) if (p === this) return true; return false; }
    contains(x) { return !!x && this.holds(x); }
    get isConnected() { let p = this; while (p.parent) p = p.parent; return p === doc.body; }
    get children() { return this.kids.filter((e) => e.tagName !== '#TEXT'); }
    set textContent(v) { for (const e of [...this.kids]) this.detach(e); if (String(v)) this.append(text(String(v))); }
    get textContent() { return this.tagName === '#TEXT' ? this._t : this.kids.map((e) => e.textContent).join(''); }
    set innerHTML(v) {
      this.textContent = '';
      const s = String(v);
      /* enough for the app's lists: every <li ...> becomes an element, and the <input ...> it contains become others */
      for (const li of s.split(/(?=<li[\s>])/)) {
        if (!li.startsWith('<li')) { if (li.replace(/<[^>]+>/g, '').trim()) this.append(text(li.replace(/<[^>]+>/g, ''))); continue; }
        const l = new El('li'); setAttrs(l, /^<li([^>]*)>/.exec(li)[1]);
        for (const m of li.matchAll(/<input([^>]*)>/g)) { const i = new El('input'); setAttrs(i, m[1]); l.append(i); }
        l.append(text(li.replace(/<[^>]+>/g, '')));
        this.append(l);
      }
    }
    replaceChildren(...xs) { this.textContent = ''; this.append(...xs); }
    remove() { if (this.parent) this.parent.detach(this); }
    addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
    dispatchEvent(ev) { ev.target ||= this; for (const f of this.listeners[ev.type] || []) f(ev); if (ev.bubbles !== false) for (const f of docListeners[ev.type] || []) f(ev); return true; }
    focus() { if (this.isConnected) doc.activeElement = this; }
    blur() { if (doc.activeElement === this) doc.activeElement = doc.body; }
    setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; }
    setCustomValidity() {} reportValidity() {} scrollIntoView() {}
    closest(sel) { for (let p = this; p && p !== doc.body; p = p.parent) if (matches(p, sel)) return p; return null; }
    all(f) { const r = []; const v = (e) => { for (const c of e.kids) { if (f(c)) r.push(c); v(c); } }; v(this); return r; }
    querySelectorAll(sel) { return this.all((e) => sel.split(',').some((s) => matches(e, s.trim()))); }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  }
  const text = (t) => { const e = new El('#text'); e._t = t; return e; };
  const setAttrs = (e, s) => { for (const m of String(s).matchAll(/([\w-]+)(?:="([^"]*)")?/g)) e.setAttribute(m[1], m[2] === undefined ? '' : m[2]); if (e.attrs.class) e.className = e.attrs.class; };
  const matches = (e, s) => {
    if (e.tagName === '#TEXT') return false;
    if (s === 'input' || s === 'textarea' || s === 'li' || s === 'div') return e.tagName === s.toUpperCase();
    let m = /^#([\w-]+)$/.exec(s); if (m) return e.id === m[1];
    m = /^\[id=([\w-]+)\]$/.exec(s); if (m) return e.id === m[1];
    m = /^\[([\w-]+)\]$/.exec(s); if (m) return e.getAttribute(m[1]) !== null;
    m = /^input\[([\w-]+)\]$/.exec(s); if (m) return e.tagName === 'INPUT' && e.getAttribute(m[1]) !== null;
    m = /^(\w+)\.([\w-]+)$/.exec(s); if (m) return e.tagName === m[1].toUpperCase() && String(e.className).split(/\s+/).includes(m[2]);
    return false;
  };
  doc.body = new El('body');
  doc.activeElement = doc.body;
  doc.createElement = (t) => new El(t);
  doc.createTextNode = (t) => text(t);
  doc.querySelector = (s) => doc.body.querySelector(s);
  doc.querySelectorAll = (s) => doc.body.querySelectorAll(s);
  doc.getElementById = (id) => doc.body.querySelector('#' + id);
  doc.addEventListener = (t, f) => { (docListeners[t] ||= []).push(f); };
  doc.contains = (x) => doc.body.contains(x);
  return { doc, El };
}
/* a real keystroke: focus, value, caret, and the `input` event (isTrusted) bubbling up to the document */
const type = (i, v, caret = null) => { i.focus(); i.value = v; if (caret !== null) i.setSelectionRange(caret, caret); i.dispatchEvent({ type: 'input', bubbles: true, isTrusted: true, target: i }); };
const tick = (c) => { c.checked = true; c.dispatchEvent({ type: 'change', bubbles: true, isTrusted: true, target: c }); };

const ME = '0x1111111111111111111111111111111111111111';
const BLOCK = '0xb2000000000000000000007afa7ed748b0874f27';

function world(src) {
  const { doc } = makeDom();
  const page = (id, parent = doc.body, cls = '') => { const e = doc.createElement('div'); e.id = id; e.className = cls; parent.append(e); return e; };
  /* the panel order: the Market view (and its static tiles box) BEFORE the Skin view (and its shop) */
  const staticBox = /<div class="bcPos" id="(\w+)"><\/div>/.exec(src);
  const marketView = page('bc-market'), skinView = page('bc-brain');
  const tiles = page(staticBox ? staticBox[1] : 'TILES_MISSING', marketView, 'bcPos');
  const shop = page('bcBoutique', skinView, 'bcBoutique');
  const game = page('v-missions');
  page('skinEtat', game); const skinList = page('skinListe', game);
  page('missionsEtat', game); const missionsList = page('missionsListe', game);
  const basket = page('bcBanquePanier'), basketRows = page('bcPanierLignes', basket);
  const skins = [{ tokenId: '7', detenteur: ME, enVente: false, recette: { h: [1, 2, 3] }, block: BLOCK }, { tokenId: '8', detenteur: ME, enVente: false, recette: { h: [4, 5, 6] }, block: BLOCK }];
  const ctx = {
    console, JSON, String, Number, Array, Set, Map, Object, Promise, Math, RegExp, Error, Date, BigInt, setTimeout, clearTimeout,
    document: doc, $: (s) => doc.querySelector(s),
    Event: class { constructor(type, o = {}) { this.type = type; this.bubbles = !!o.bubbles; this.isTrusted = false; } },
    bc: {}, compte: ME, rpc: async () => '0x', skinsJeuEnVol: false,
    lireSkins: async () => ({ etat: 'LU', skins, total: skins.length }),
    bcLireDevisesSkin: async () => {}, bcTexteDevisesOffertes: () => 'Paid in USDC.', bcDevisesSkin: () => ({}),
    bcResoudre: () => ({ sym: 'UNIT' }), bcMontantSkin: () => '1 USDC', bcDureeSkin: () => '1 h', offreMinimale: () => 1n,
    /* game390: the painters name a skin by its app-wide name (blockskins.js); the module's own functions are tested in test-skin-numerotation-390 */
    nomSkin: (s) => 'Skin #' + String(s && s.tokenId), texteSkin: (s) => 'skin #' + String(s && s.tokenId), detailSkin: () => '', cleSkin: (s) => String(s && s.tokenId),
    actionsSkin: (s, moi) => (s.detenteur === moi && !s.enVente ? ['METTRE_EN_VENTE'] : []),
    bcPastilleSkin: () => doc.createElement('span'), bcDevisesOffertes: () => ({ '0xusdc': { sym: 'USDC', dec: 6 } }), DEVISES_SKIN: { '0xusdc': {} },
    BC_DUREES_ENCHERE: [['1 day', 86400]], montantVersBrut: () => 1n, bcActionMarche: async () => {}, jb() {}, texteMarcheSkins: () => '2 skins.',
    bcBanque: { pourToi: null }, BC_PANIER_MAX: 3, bcBanqueChiffres: () => ({ etat: 'ok', puce: '●' }), bcPourToiDe: () => null,
    bcUnites: (x) => String(x), bcVisage: () => doc.createElement('span'), bcBas2: () => '1', bcPct: () => '5 %', bcPanierMaj() { ctx.totalsUpdates = (ctx.totalsUpdates || 0) + 1; },
    enTexte: (t) => String(t), fetch: async () => ({ json: async () => ctx.missions }),
    missions: { ok: true, contrat: '0xc', missions: [{ id: '3', lue: true, etat: 'OUVERTE', reward: '5', done: 0, maxDone: 9, detention: { window: 86400, minBlock: '1', minPaired: '0' } }] },
  };
  vm.createContext(ctx);
  const FN = ['bcPeindreMarche', 'bcLigneSkin', 'bcFormVendreSkin', 'peindreSkinsJeu', 'bcPanierPeindre', 'peindreMissions', 'bcPeindre', 'bcBanqueCharger'];
  const missing = FN.filter((f) => !extract(src, f));
  const bcEl = extractConst(src, 'bcEl');
  if (!bcEl) missing.push('bcEl');
  if (missing.length) throw new Error('EXTRACTION FAILED: ' + missing.join(', ') + ' not found');
  /* the typed-input keepers (absent before the fix: the bench says so, it does not crash) */
  const keepers = ['typedInputs', 'restoreTypedInputs', 'wireTypedInputs', 'inputKey', 'basketFieldKey'].map((f) => extract(src, f));
  vm.runInContext(bcEl.replace(/^const /, 'var ') + '\n' + FN.filter((f) => f !== 'bcPeindre' && f !== 'bcBanqueCharger').map((f) => extract(src, f)).join('\n') + '\n' + keepers.join('\n'), ctx);
  if (typeof ctx.wireTypedInputs === 'function') ctx.wireTypedInputs();
  /* the basket repaint as bcBanqueCharger does it: ITS line, read from the source */
  const lp = /\n([^\n]*bcPanierPeindre\(listes\);[^\n]*)\n/.exec(extract(src, 'bcBanqueCharger'));
  if (!lp) throw new Error('EXTRACTION FAILED: the basket repaint in bcBanqueCharger was not found');
  vm.runInContext('var repaintBasket = function (listes) {\n' + lp[1] + '\n};', ctx);
  /* the shop places its box as bcPeindreBoutique does (the line READ from the source) */
  const placed = /z\.append\(bcEl\('div', \{ cls: 'bcMarche', id: '(\w+)' \}\)\);\s*void bcPeindreMarche\(\);/.exec(extract(src, 'bcPeindreBoutique'));
  if (!placed) throw new Error('EXTRACTION FAILED: the skins market box placed by bcPeindreBoutique was not found');
  shop.append(ctx.bcEl('div', { cls: 'bcMarche', id: placed[1] }));
  /* bcPeindre's emptying of the tiles (every 3 s when a tile changes): its selector READ from the source */
  const sel = /const mc = \$\('(#[\w-]+)'\);/.exec(extract(src, 'bcPeindre'));
  if (!sel || !/mc\.textContent = '';/.test(extract(src, 'bcPeindre'))) throw new Error('EXTRACTION FAILED: bcPeindre\'s emptying of the tiles was not found');
  const emptyTiles = () => { const mc = doc.querySelector(sel[1]); mc.textContent = ''; mc.append(ctx.bcEl('div', {}, [ctx.bcEl('b', { text: '$1.02' })])); };
  return { ctx, doc, tiles, shop, skinList, basketRows, missionsList, emptyTiles, skinsBox: () => shop.children[0] };
}

/* the « price » field of the row of skin #id (rows follow the order of the skins read: #7 then #8) */
const priceOf = (z, id) => z.querySelectorAll('input').filter((i) => i.getAttribute('aria-label') === 'Price')[{ 7: 0, 8: 1 }[id]] || null;

async function check(src, name) {
  console.log('── ' + name);
  /* U — no id set by the script duplicates an id of the static HTML */
  {
    const statics = new Set([...src.matchAll(/\sid="([A-Za-z][\w-]*)"/g)].map((m) => m[1]));
    const dupes = [...src.matchAll(/\bid: '([A-Za-z][\w-]*)'/g)].map((m) => m[1]).filter((id) => statics.has(id));
    seen(dupes.length === 0, name + ' U no script id duplicates an HTML id (' + (dupes.join(', ') || 'none') + ')');
  }
  /* V — the skins market in ITS box, and emptying the tiles does not touch the typed price */
  {
    const w = world(src);
    await w.ctx.bcPeindreMarche();
    const inShop = priceOf(w.skinsBox(), '7'), inTiles = priceOf(w.tiles, '7');
    seen(!!inShop && !inTiles, name + ' V1 the skins market is painted in the shop (Skin view), not in the Market view tiles');
    const field = inShop || inTiles;
    if (field) type(field, '12.5', 3);
    w.emptyTiles();
    const after = priceOf(w.skinsBox(), '7') || priceOf(w.tiles, '7');
    seen(!!after && after.value === '12.5' && w.doc.activeElement === after, name + ' V2 the tiles repaint (bcPeindre, 3 s) leaves the typed price and the focus');
  }
  /* W — repainting the skins market keeps price, focus and caret (panel and Game tab) */
  {
    const w = world(src);
    await w.ctx.bcPeindreMarche();
    /* W looks at the repaint alone: the box where the market was painted (V says whether it is the right one) */
    const z = priceOf(w.skinsBox(), '7') ? w.skinsBox() : w.tiles;
    const p7 = priceOf(z, '7');
    if (p7) type(p7, '42', 1);
    await w.ctx.bcPeindreMarche();
    const n7 = priceOf(z, '7'), n8 = priceOf(z, '8');
    seen(!!n7 && n7 !== p7 && n7.value === '42', name + ' W1 bcPeindreMarche repaints: the typed price comes back in the NEW field');
    seen(!!n7 && w.doc.activeElement === n7 && n7.selectionStart === 1 && n7.selectionEnd === 1, name + ' W2 ... with the focus and the caret');
    seen(!!n8 && n8.value === '', name + ' W3 the neighbouring field, never typed in, stays empty (nothing invented)');
    await w.ctx.peindreSkinsJeu();
    const g7 = priceOf(w.skinList, '7');
    if (g7) type(g7, '9', null);
    w.ctx.skinsJeuEnVol = false;
    await w.ctx.peindreSkinsJeu();
    const h7 = priceOf(w.skinList, '7');
    seen(!!h7 && h7 !== g7 && h7.value === '9' && w.doc.activeElement === h7, name + ' W4 peindreSkinsJeu (Game tab) repaints: price and focus kept');
  }
  /* X — the Bank basket */
  {
    const w = world(src);
    const mk = (id, sym) => ({ id, garantie: { symbole: sym, adr: '0x' + id.padStart(40, '0'), decimales: 18 }, pret: { symbole: 'USDC', decimales: 6 }, apyEmprunt: 0.05 });
    const lists = [mk('a1', 'METAc'), mk('b2', 'NVDAc')];
    w.ctx.repaintBasket(lists);
    const row = (id) => w.basketRows.querySelectorAll('li').find((li) => li.dataset.id === id);
    const fields = (id) => { const l = row(id); return l ? l.querySelectorAll('input') : []; };
    const [c1, g1, d1] = fields('a1');
    if (c1) tick(c1);
    if (g1) { g1.disabled = false; type(g1, '3'); }
    if (d1) { d1.disabled = false; type(d1, '150', 2); }
    w.ctx.repaintBasket(lists);
    const [c2, g2, d2] = fields('a1');
    seen(!!c2 && c2 !== c1 && c2.checked === true, name + ' X1 the repainted basket (bcBanqueCharger): the ticked box stays ticked');
    seen(!!g2 && g2.value === '3' && !!d2 && d2.value === '150' && g2.disabled === false && d2.disabled === false, name + ' X2 ... the typed amounts stay (fields enabled)');
    seen(!!d2 && w.doc.activeElement === d2 && d2.selectionStart === 2, name + ' X3 ... the focus and the caret stay in the typed field');
    const [cb, gb] = fields('b2');
    seen(!!cb && cb.checked === false && !!gb && gb.value === '', name + ' X4 the row never touched stays as painted');
    /* X5: a PREFILLED amount (the wallet balance read, never typed) takes the new reading; the amount typed next to it stays */
    w.ctx.balance = 5n;
    w.ctx.bcBanque.pourToi = { de: ME.toLowerCase(), av: { solde: () => w.ctx.balance } };
    w.ctx.bcPourToiDe = () => ({ garantie: 5n, emprunt: 4000000n, rien: false });
    w.ctx.repaintBasket(lists);
    const [, g3, d3] = fields('b2');
    if (d3) type(d3, '77');
    w.ctx.balance = 9n;
    w.ctx.repaintBasket(lists);
    const [, g4, d4] = fields('b2');
    seen(!!g3 && g3.value === '5' && !!g4 && g4.value === '9' && !!d4 && d4.value === '77', name + ' X5 the prefilled value follows the new reading (5 -> 9), the typed amount stays (77)');
  }
  /* Y — the missions list */
  {
    const w = world(src);
    await w.ctx.peindreMissions();
    const tx = w.missionsList.querySelectorAll('input')[0];
    if (tx) type(tx, '0xabc', 5);
    await w.ctx.peindreMissions();
    const txAfter = w.missionsList.querySelectorAll('input')[0];
    seen(!!txAfter && txAfter !== tx && txAfter.value === '0xabc' && w.doc.activeElement === txAfter, name + ' Y1 peindreMissions repaints: the typed hash and the focus stay');
    w.ctx.missions = { ok: true, contrat: '0xc', missions: [] };
    await w.ctx.peindreMissions();
    seen(w.missionsList.querySelectorAll('input').length === 0, name + ' Y2 the mission is gone: its field does not come back (nothing invented)');
  }
}

for (const [src, name] of [[RAW, 'LF'], [RAW.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n').replace(/\r\n/g, '\n'), 'CRLF normalised']]) {
  try { await check(src, name); } catch (e) { ko++; console.log('KO  ' + name + ': ' + e.message); }
}
console.log('\n' + (n - ko) + '/' + n + ' — ' + ko + ' KO');
process.exit(ko ? 1 : 0);
