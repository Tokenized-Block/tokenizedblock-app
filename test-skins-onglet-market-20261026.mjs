/* test-skins-onglet-market-20261026.mjs — LE MARCHE DES SKINS SUR L ONGLET MARKET (Phil, 2026-10-26 : « show the skin market on the Market tab »).
 * La section Skins de l onglet Market (#skinsMarche) dit la MEME phrase que la carte du Game (texteMarcheSkins), porte le MEME geste Mint
 * (ouvrirMintSkin : la vue Skin du panneau) et peint ses lignes depuis la MEME liste lue (lireSkins) que la carte du Game.
 * A. PUR (skins-marche.js ; TB_SKM = une copie) : texteMarcheSkins — vide, vide avec mes skins, en vente / aux encheres ; la phrase du Game.
 * B. LE VRAI CODE DE L APP, EXECUTE (fonctions extraites d app.html ; TB_APP = une copie) dans un petit DOM simule : peindreSkinsJeu (Game)
 *    et skmPeindreListe (Market) sur la MEME liste ; les montants montres = ceux de la liste, EXACTS (0.123456789 ETH, pas 0.12345678) ;
 *    un clic sur Buy (Market) passe par le vrai bcActionMarche : l appel que le wallet signerait porte EXACTEMENT le prix ecrit sur le bouton
 *    (valeur ETH ; approbation USDC exacte). Le wallet est une doublure qui n envoie RIEN.
 * C. CABLAGE : Mint dans la section (meme fonction que le Game), .skinPrix (prix lu de l enregistrement), aucune nouvelle signature.
 * D. MUTANTS sur des COPIES (dossier temporaire) : chacun doit rougir ; temoin : les copies non mutees sont vertes.
 * NE PROUVE PAS : une vraie signature (aucune), le rendu au navigateur (mesure a part), un mint reel. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const APP = process.env.TB_APP || path.join(ICI, 'app.html');
let n = 0, ko = 0;
const vu = (c, m) => { n += 1; if (!c) { ko += 1; console.log('KO ' + m); } };

const M = await import(process.env.TB_SKM ? pathToFileURL(process.env.TB_SKM).href : pathToFileURL(path.join(ICI, 'skins-marche.js')).href);
const S = await import(pathToFileURL(path.join(ICI, 'blockskins.js')).href);
const { selecteur } = await import(pathToFileURL(path.join(ICI, 'encodeur.js')).href);

const MOI = '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b', AUTRE = '0x' + '5'.repeat(40), BLK = '0xb200000000000000000000e4b0c5fbe9c8df579e';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', ETH = S.ETH;
const rec = { id: 'random', angle: 159, h: [43, 218, 337], cube: 280, noyau: 75, fond: 51 };
const T = Math.floor(Date.now() / 1000);
const sk = (o) => ({ tokenId: 1n, detenteur: AUTRE, block: BLK, recette: rec, enVente: false, enchere: false, devise: ETH, prix: 0n, fin: 0, encherisseur: ETH, offre: 0n, ...o });

/* ── A. PUR ── */
const PHRASE_GAME_VIDE = 'Nothing listed yet — mint a skin, then sell it at a fixed price or open an auction (bids +5%, 7 days max).';
vu(typeof M.texteMarcheSkins === 'function', 'A0 texteMarcheSkins existe');
const tx = (l, moi) => (typeof M.texteMarcheSkins === 'function' ? M.texteMarcheSkins(l, moi) : '');
vu(tx([], null) === PHRASE_GAME_VIDE + ' Connect a wallet to list yours.', 'A1 rien en vente, sans wallet : la phrase du Game, mot pour mot');
vu(tx([sk({})], MOI) === PHRASE_GAME_VIDE, 'A2 rien en vente, wallet sans skin : sans « Connect »');
vu(tx([sk({ detenteur: MOI }), sk({ tokenId: 2n, detenteur: MOI })], MOI).startsWith('Nothing listed yet — you hold 2 skins: sell one'), 'A3 rien en vente, 2 skins a moi : dit « you hold 2 skins »');
vu(tx([sk({ detenteur: MOI })], MOI.toUpperCase().replace('0X', '0x')).includes('you hold 1 skin:'), 'A4 wallet en majuscules : reconnu');
const vente = [sk({ tokenId: 3n, enVente: true, devise: USDC, prix: 5_250_000n }), sk({ tokenId: 4n, enVente: true, enchere: true, devise: USDC, prix: 1_000_000n, fin: T + 3600 }), sk({ tokenId: 5n, detenteur: MOI })];
vu(tx(vente, MOI) === '2 for sale (1 in auction) · 1 yours to list. Each skin sells at a fixed price or in an auction (bids +5%, 7 days max).', 'A5 en vente : ' + tx(vente, MOI));
vu(tx(vente, null) === '2 for sale (1 in auction). Each skin sells at a fixed price or in an auction (bids +5%, 7 days max).', 'A6 en vente, sans wallet');
vu(tx(null, null) === PHRASE_GAME_VIDE + ' Connect a wallet to list yours.', 'A7 liste absente = la phrase vide (jamais une exception)');

/* ── B. LE VRAI CODE, EXECUTE ── */
const html = fs.readFileSync(APP, 'utf8').replace(/\r\n/g, '\n');
/* portable : debut et fin cherches par regex (CRLF comme LF), jamais par une ancre de position litterale */
const echappe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fonction = (sig) => { const m = new RegExp('^' + echappe(sig), 'm').exec(html); if (!m) return ''; const k = html.slice(m.index).search(/\r?\n\}\r?\n/); return k > 0 ? html.slice(m.index, m.index + k + 2) : ''; };
const ligneDe = (debut) => { const m = new RegExp('^' + echappe(debut) + '[^\\n]*', 'm').exec(html); return m ? m[0] : ''; };
const bcElSrc = (() => { const m = /^const bcEl = [\s\S]*?\r?\n\};/m.exec(html); return m ? m[0] : ''; })();
const SRC = {
  bcMontantSkin: fonction('function bcMontantSkin('), bcFormVendreSkin: fonction('function bcFormVendreSkin('), skmLigne: fonction('function skmLigne('),
  skmPeindreListe: fonction('function skmPeindreListe('), skmPouls: fonction('function skmPouls('), bcLigneSkin: fonction('function bcLigneSkin('),
  bcPastilleSkin: fonction('function bcPastilleSkin('), bcDureeSkin: fonction('function bcDureeSkin('), peindreSkinsJeu: fonction('async function peindreSkinsJeu('),
  bcActionMarche: fonction('async function bcActionMarche('), jb: ligneDe('const jb = '), bcEl: bcElSrc, peindreSkinsMarche: fonction('async function peindreSkinsMarche('),
  /* 2026-10-26: peindreSkinsJeu keeps what is typed during its repaint (test-typed-input-kept-20261026) */
  inputKey: fonction('function inputKey('), typedInputs: fonction('function typedInputs('), restoreTypedInputs: fonction('function restoreTypedInputs('),
};
for (const [k, v] of Object.entries(SRC)) vu(v.length > 20, 'B0 extrait : ' + k);

/* un petit DOM : assez pour bcEl, createElementNS, textContent, querySelector(All) par .classe / balise, clic */
class Noeud {
  constructor(tag, texte = null) { this.tag = tag; this.kids = []; this.attrs = {}; this.className = ''; this.dataset = {}; this.style = {}; this.on = {}; this.parent = null; this._t = texte; this.value = ''; this.defaultValue = ''; this.hidden = false; this.id = ''; }
  append(...l) { for (const x of l) { const c = typeof x === 'string' ? new Noeud('#text', x) : x; c.parent = this; this.kids.push(c); } }
  replaceChildren(...l) { this.kids = []; this.append(...l); }
  after(x) { const p = this.parent; if (!p) return; x.parent = p; p.kids.splice(p.kids.indexOf(this) + 1, 0, x); }
  remove() { if (this.parent) this.parent.kids.splice(this.parent.kids.indexOf(this), 1); this.parent = null; }
  get children() { return this.kids.filter((k) => k.tag !== '#text'); }
  get childElementCount() { return this.children.length; }
  get textContent() { return this.tag === '#text' ? this._t : this.kids.map((k) => k.textContent).join(''); }
  set textContent(v) { this.kids = []; if (String(v) !== '') this.append(String(v)); }
  get innerText() { return this.textContent; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  addEventListener(t, f) { this.on[t] = f; }
  click() { if (this.on.click) return this.on.click(); }
  get classList() {
    const me = this, l = () => me.className.split(/\s+/).filter(Boolean);
    const cl = { add: (c) => { if (!l().includes(c)) me.className = [...l(), c].join(' '); }, remove: (c) => { me.className = l().filter((x) => x !== c).join(' '); }, contains: (c) => l().includes(c) };
    cl.toggle = (c, o) => { if (o === undefined ? !l().includes(c) : o) cl.add(c); else cl.remove(c); };
    return cl;
  }
  get offsetWidth() { return 0; }
  setCustomValidity() {} reportValidity() {}
  tous() { const out = []; const f = (x) => { for (const k of x.kids) { if (k.tag !== '#text') { out.push(k); f(k); } } }; f(this); return out; }
  querySelectorAll(sel) { return this.tous().filter((e) => (sel.startsWith('.') ? e.className.split(/\s+/).includes(sel.slice(1)) : e.tag === sel)); }
  querySelector(sel) { const s = sel.replace(/^\.skmInfo b$/, 'b'); return this.querySelectorAll(s)[0] || null; }
  contains(x) { for (let y = x; y; y = y.parent) if (y === this) return true; return false; }
}
const page = (v) => '0x' + [32n, 1n].map((x) => x.toString(16).padStart(64, '0')).join('') + [
  BigInt(v.tokenId), v.detenteur, v.block, S.packRecette(v.recette), v.enVente ? 1n : 0n, v.enchere ? 1n : 0n, v.devise, BigInt(v.prix), BigInt(v.fin), v.encherisseur, BigInt(v.offre),
].map((x) => (typeof x === 'string' ? String(x).toLowerCase().slice(2).padStart(64, '0') : x.toString(16).padStart(64, '0'))).join('');
const mot = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');

/** un monde : la liste lue (la MEME pour le Game et le Market), la chaine (relecture d une skin, solde, autorisation), un wallet qui n envoie rien */
function monde(liste, { moi = MOI } = {}) {
  const ids = {}, el = (id, tag = 'div') => { const e = new Noeud(tag); e.id = id; ids[id] = e; return e; };
  for (const id of ['skinEtat', 'skinListe', 'skmEtat', 'skmNote', 'skmListe', 'skmFiltres', 'jbSkins', 'jbSkinsTxt']) el(id);
  const j = { signes: [], actions: [], etapes: [], lectures: 0 };
  const document = { createElement: (t) => new Noeud(t), createElementNS: (ns, t) => new Noeud(t), createTextNode: (t) => new Noeud('#text', String(t)), getElementById: (id) => ids[id] || null, activeElement: null, querySelectorAll: () => [] };
  const rpc = async (m, p) => {
    const to = String(p[0].to).toLowerCase(), data = String(p[0].data);
    if (to === S.BLOCKSKINS && data.startsWith('0x' + selecteur('skinsPage(uint256,uint256)'))) { const id = BigInt('0x' + data.slice(10, 74)); return page(liste.find((s) => s.tokenId === id)); }
    if (data.startsWith('0xdd62ed3e')) return mot(0);
    throw new Error('rpc inattendu ' + data.slice(0, 10));
  };
  const devises = { [ETH]: { sym: 'ETH', dec: 18 }, [USDC]: { sym: 'USDC', dec: 6 } };
  const ctx = {
    document, console, BigInt, Number, String, Object, Array, Map, Set, Math, Date, Promise, Error, JSON, RegExp,
    $: (s) => ids[s.replace(/^#/, '')] || null, compte: moi, rpc, UNIT_APP: '0xb2000000000000000000007afa7ed748b0874f27',
    lireSkins: async () => { j.lectures += 1; return { etat: 'LU', total: liste.length, skins: liste, tronque: false }; },
    texteMarcheSkins: M.texteMarcheSkins, statutSkin: M.statutSkin, detenteurCourt: M.detenteurCourt, tempsRestant: M.tempsRestant, apercuSkinFormes: M.apercuSkinFormes,
    gestesSkin: M.gestesSkin, montantOffre: M.montantOffre, brutVersTexteSkin: M.brutVersTexte, compterSkins: M.compterSkins, filtrerSkins: M.filtrerSkins,
    ordonnerSkins: M.ordonnerSkins, cleLigneSkin: M.cleLigneSkin, relectureAvantSigner: M.relectureAvantSigner, SKM_STATUTS: M.SKM_STATUTS,
    actionsSkin: S.actionsSkin, offreMinimale: S.offreMinimale, montantVersBrut: S.montantVersBrut, DEVISES_SKIN: S.DEVISES_SKIN, decoderPage: S.decoderPage, appelPage: S.appelPage,
    BLOCKSKINS: S.BLOCKSKINS, ETH_SKIN: ETH, appelApprouver: S.appelApprouver, appelAcheter: S.appelAcheter, appelEncherir: S.appelEncherir, appelRegler: S.appelRegler,
    appelRetirer: S.appelRetirer, appelMettreEnVente: S.appelMettreEnVente, appelOuvrirEnchere: S.appelOuvrirEnchere, appelRetirerCredit: S.appelRetirerCredit, partage: S.partage,
    bcDevisesSkin: () => devises, bcDevisesOffertes: () => devises, bcTexteDevisesOffertes: () => 'New listings can be priced in ETH, USDC (read on chain).',
    BC_DUREES_ENCHERE: [['1 hour', 3600n], ['1 day', 86400n]], bcUnites: (b, d) => String(b) + 'e-' + d, court: (a) => String(a).slice(0, 6) + '…' + String(a).slice(-4),
    bcResoudre: (a) => ({ sym: String(a) === BLK ? 'TEST' : 'X' }), skinsJeuEnVol: false,
    skm: { filtre: 'all', enVol: false, lu: Date.now(), liste, total: liste.length, tronque: false, offres: null, pouls: new Map(), lignes: new Map(), rate: 0 },
    skmMaintenant: () => Math.floor(Date.now() / 1000), skmHeure: () => '00:00 UTC', setTimeout: () => 0,
    bcOuvrirPop() {}, bcMessage: () => new Noeud('div'), bcVue() {}, CHAINE: 8453, bcEtape: (m, t, k) => j.etapes.push([t, k || '']), bcAvecWallet: async () => true,
    bcBoutons: (m, l) => { j.boutons = l; }, peindreSkinsMarche: async () => {}, deviseAdmise: async () => true, bcLireDevisesSkin: async () => {}, bcSolde: async () => 10n ** 30n,
    bcSigner: async (m, appels) => { j.signes.push(appels); return { ok: false, diffusee: false }; }, bc: {}, RESEAUX: { 8453: { explorateur: 'x' } },
    mesSkins: {}, lireMesSkins: async () => {}, poserMesSkins() {}, bcPeindreSkinEtat() {}, bcPeindreMarche: async () => {},
    skmPeindreFiltres() {}, offresChangees: M.offresChangees, SKM_POULS_MS: 6000, SKM_RAFRAICHIR_MS: 25000,
    nomSkin: S.nomSkin, texteSkin: S.texteSkin, detailSkin: S.detailSkin, cleSkin: S.cleSkin, /* game390: the skin's app-wide name, rows keyed by contract + token id */
  };
  vm.createContext(ctx);
  vm.runInContext([SRC.bcEl, SRC.jb, SRC.bcMontantSkin, SRC.bcDureeSkin, SRC.bcPastilleSkin, SRC.bcFormVendreSkin, SRC.bcLigneSkin, SRC.skmPouls, SRC.skmLigne, SRC.skmPeindreListe,
    SRC.inputKey, SRC.typedInputs, SRC.restoreTypedInputs, SRC.peindreSkinsJeu, SRC.bcActionMarche, SRC.peindreSkinsMarche.replace(/^async function peindreSkinsMarche\(/, 'async function vraiPeindreSkinsMarche('),
    'this.__f = { bcActionMarche, bcMontantSkin };'].join('\n'), ctx);
  /* bcActionMarche ECOUTE : chaque geste d une ligne est note, puis execute pour de vrai */
  const vrai = ctx.__f.bcActionMarche;
  ctx.bcActionMarche = (genre, s, x) => { j.actions.push({ genre, s, x }); return vrai(genre, s, x); };
  return { ctx, ids, j };
}

const PRIX_ETH = 123_456_789_000_000_000n, PRIX_USDC = 5_250_000n;
const liste = [
  sk({ tokenId: 1n, enVente: true, devise: ETH, prix: PRIX_ETH }),
  sk({ tokenId: 2n, enVente: true, devise: USDC, prix: PRIX_USDC }),
  sk({ tokenId: 3n, enVente: true, enchere: true, devise: USDC, prix: 1_000_000n, fin: T + 7200, offre: 2_000_000n, encherisseur: AUTRE }),
  sk({ tokenId: 4n, detenteur: MOI }),
];
const w = monde(liste);
await w.ctx.peindreSkinsJeu();
w.ctx.skmPeindreListe();
const game = w.ids.skinEtat.textContent, market = w.ids.skmEtat.textContent;
vu(game.length > 20 && game === market, 'B1 Game et Market disent LA MEME phrase : « ' + market + ' »');
vu(market === M.texteMarcheSkins(liste, MOI), 'B2 la phrase du Market = texteMarcheSkins de la liste lue');
const lignes = w.ids.skmListe.querySelectorAll('.skmLigne');
vu(lignes.length === 4, 'B3 une ligne Market par skin lue (' + lignes.length + ')');
const ligne = (id) => lignes.find((l) => l.dataset.skin === String(id));
const boutons = (l) => (l ? l.querySelectorAll('button') : []);
const l1 = ligne(1), l2 = ligne(2), l3 = ligne(3), l4 = ligne(4);
vu(l1 && l1.textContent.includes('For sale · 0.123456789 ETH'), 'B4 prix fixe ETH ecrit EXACT (0.123456789 ETH) : ' + (l1 && l1.textContent));
vu(l2 && l2.textContent.includes('For sale · 5.25 USDC'), 'B5 prix fixe USDC : 5.25 USDC');
vu(l3 && /Auction · highest bid 2 USDC · ends in (1 h 59 min|2 h 0 min)/.test(l3.textContent), 'B6 enchere : offre actuelle et fin : ' + (l3 && l3.textContent));
vu(l3 && l3.querySelectorAll('input').some((i) => i.value === '2.1'), 'B7 enchere : offre minimale pre-remplie EXACTE (+5 % : 2.1)');
vu(lignes.every((l) => l.querySelectorAll('svg').length === 1 && l.querySelectorAll('rect').length === 2 && l.querySelectorAll('circle').length === 1), 'B8 chaque ligne porte la face de la skin (svg)');
vu(lignes.every((l) => /dresses (TEST|UNIT)/.test(l.textContent)), 'B9 chaque ligne nomme le block habille');
vu(l4 && boutons(l4).some((b) => b.textContent === 'Sell') && boutons(l4).some((b) => b.textContent === 'Start an auction'), 'B10 ma skin : Sell / Start an auction');
/* le Game sur la MEME liste : memes montants */
const gameTxt = w.ids.skinListe.textContent;
vu(gameTxt.includes('0.123456789 ETH') && gameTxt.includes('5.25 USDC') && gameTxt.includes('highest bid 2 USDC'), 'B11 la carte du Game montre les MEMES montants (meme liste, meme bcMontantSkin)');
/* le clic Buy (Market) : le bouton dit le prix ; l appel prepare porte EXACTEMENT ce prix */
const buy1 = boutons(l1).find((b) => /^Buy · /.test(b.textContent));
vu(buy1 && buy1.textContent === 'Buy · 0.123456789 ETH', 'B12 bouton Buy (ETH) : ' + (buy1 && buy1.textContent));
if (buy1) { await buy1.click(); for (let k = 0; k < 20 && !w.j.boutons; k++) await new Promise((r) => setImmediate(r)); }
const signer = (w.j.boutons || []).find((b) => /^Sign /.test(b[0]));
if (signer) await signer[1]();
const a1 = w.j.signes[0] || [];
const montre1 = buy1 ? S.montantVersBrut(buy1.textContent.replace(/^Buy · /, '').replace(/ ETH$/, ''), 18) : -1n;
vu(w.j.actions[0] && w.j.actions[0].genre === 'ACHETER' && w.j.actions[0].s.tokenId === 1n, 'B13 le clic passe par bcActionMarche (ACHETER, skin #1)');
vu(a1.length === 1 && a1[0].to === S.BLOCKSKINS && BigInt(a1[0].value) === PRIX_ETH && BigInt(a1[0].value) === montre1 && a1[0].data === S.appelAcheter(1n, ETH, PRIX_ETH).data,
  'B14 ETH : le wallet signerait buy(#1) avec EXACTEMENT le prix du bouton (' + (a1[0] ? BigInt(a1[0].value) : 'rien') + ' wei)');
/* USDC : approbation EXACTE du prix montre, puis buy */
const w2 = monde(liste); w2.ctx.skmPeindreListe();
const buy2 = boutons(w2.ids.skmListe.querySelectorAll('.skmLigne').find((l) => l.dataset.skin === '2')).find((b) => /^Buy · /.test(b.textContent));
vu(buy2 && buy2.textContent === 'Buy · 5.25 USDC', 'B15 bouton Buy (USDC) : ' + (buy2 && buy2.textContent));
if (buy2) { await buy2.click(); for (let k = 0; k < 20 && !w2.j.boutons; k++) await new Promise((r) => setImmediate(r)); }
const signer2 = (w2.j.boutons || []).find((b) => /^Sign /.test(b[0]));
if (signer2) await signer2[1]();
const a2 = w2.j.signes[0] || [];
const montre2 = buy2 ? S.montantVersBrut(buy2.textContent.replace(/^Buy · /, '').replace(/ USDC$/, ''), 6) : -1n;
vu(a2.length === 2 && a2[0].to === USDC && a2[0].data === S.appelApprouver(USDC, montre2).data && a2[1].data === S.appelAcheter(2n, USDC, PRIX_USDC).data && BigInt(a2[1].value) === 0n && montre2 === PRIX_USDC,
  'B16 USDC : approbation EXACTE du prix du bouton (' + montre2 + '), puis buy(#2), sans ETH');
/* l etat vide : la liste lue sans annonce -> la phrase vide du Game, et la ligne de la seule skin (pas d annonce inventee) */
const w3 = monde([sk({ tokenId: 1n, block: '0xb2000000000000000000007afa7ed748b0874f27', detenteur: '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4' })], { moi: null });
await w3.ctx.peindreSkinsJeu(); w3.ctx.skmPeindreListe();
vu(w3.ids.skmEtat.textContent === PHRASE_GAME_VIDE + ' Connect a wallet to list yours.' && w3.ids.skinEtat.textContent === w3.ids.skmEtat.textContent, 'B17 aujourd hui (1 mintee, 0 en vente, sans wallet) : la phrase vide du Game, au Market comme au Game');
const l31 = w3.ids.skmListe.querySelectorAll('.skmLigne');
/* ⛔ 2026-10-26 (game57 item 10): B18 expected « held by » + the shortened fee wallet address — that was the LEAK seen in prod. Skin #1
 *   is held by the fee wallet: the card says « Not listed », without « held by » or any trace of its address. */
vu(l31.length === 1 && /Not listed/.test(l31[0].textContent) && !/held by/.test(l31[0].textContent) && !/a6cf|f5d4/i.test(l31[0].textContent) && l31[0].querySelectorAll('button').length === 0 && /dresses UNIT/.test(l31[0].textContent), 'B18 skin #1: « Not listed » (held by the fee wallet: neither « held by » nor its address), dresses UNIT, no button without a wallet');
const w4 = monde([], { moi: null }); w4.ctx.skmPeindreListe();
vu(/^No skin minted yet — mint the first one above\./.test(w4.ids.skmNote.textContent) && w4.ids.skmListe.textContent === 'No skin minted yet.', 'B19 rien de minte : dit, et la liste le dit');
/* lecture ratee, rien de lu avant : la phrase du Market DIT l echec (jamais « Nothing listed yet » sur une liste qu on n a pas lue) */
const w5 = monde([], { moi: null });
w5.ctx.skm.liste = null; w5.ctx.lireSkins = async () => ({ etat: 'NON_LU', pourquoi: 'x' });
w5.ids.skmEtat.textContent = 'Reading the market on chain…';
await w5.ctx.vraiPeindreSkinsMarche(true);
vu(w5.ids.skmEtat.textContent === 'Skins not read on chain just now — no list is shown rather than a wrong one.' && !/Nothing listed/.test(w5.ids.skmEtat.textContent + w5.ids.skmNote.textContent), 'B20 lecture ratee : la phrase dit l echec : « ' + w5.ids.skmEtat.textContent + ' »');

/* ── C. CABLAGE ── */
const iTrade = html.indexOf('<section class="volet" id="v-trade"'), trade = iTrade > 0 ? html.slice(iTrade, html.indexOf('</section>', iTrade)) : '';
const sec = trade.slice(trade.indexOf('id="skinsMarche"'), trade.indexOf('id="skmListe"'));
vu(/<button type="button" class="bouton" id="skmMint">Mint a skin · <span class="skinPrix"><\/span><\/button>/.test(sec) && /<p class="note" id="skmEtat"/.test(sec), 'C1 la section Skins du Market porte la phrase (#skmEtat) et Mint · prix');
vu(html.split('id="skmMint"').length === 2 && html.split('id="skmEtat"').length === 2, 'C2 un seul #skmMint, un seul #skmEtat');
vu(/\nfunction ouvrirMintSkin\(\) \{ try \{ choisirBrain\(UNIT_APP\); \} catch \(_\) \{\} try \{ bcOuvrirPop\(\{ vue: 'brain', deplier: true, sansBasculer: true \}\); \} catch \(_\) \{\} \}\n\$\('#skinMint'\)\.addEventListener\('click', ouvrirMintSkin\);\n\$\('#skmMint'\)\.addEventListener\('click', ouvrirMintSkin\);/.test(html),
  'C3 Mint (Market) = Mint (Game) : la MEME fonction, la vue Skin du panneau (aucun autre chemin de signature)');
vu(/for \(const e of document\.querySelectorAll\('\.skinPrix'\)\) e\.textContent = SKIN_MINT_TEXTE;/.test(html) && iTrade < html.indexOf("for (const e of document.querySelectorAll('.skinPrix'))"), 'C4 le prix de Mint vient de SKIN_MINT_TEXTE (enregistrement), pose apres le HTML du Market');
vu(/etat\.textContent = texteMarcheSkins\(r\.skins, moi\);/.test(SRC.peindreSkinsJeu) && /jb\('skmEtat', texteMarcheSkins\(skm\.liste, moi\)\);/.test(SRC.skmPeindreListe), 'C5 Game et Market appellent texteMarcheSkins (une phrase, pas deux copies)');
vu(/import \{[^}]*texteMarcheSkins[^}]*\} from '\.\/skins-marche\.js';/.test(html), 'C6 app.html importe texteMarcheSkins');
vu(!/bcUnites\(/.test(SRC.bcMontantSkin) && /brutVersTexteSkin\(BigInt\(brut\), d\.dec\)/.test(SRC.bcMontantSkin), 'C7 bcMontantSkin ecrit le montant EXACT');

/* ── D. MUTANTS (sur des COPIES) ── */
if (!process.env.TB_SKO_SANS_MUTANTS) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sko-mut-'));
  const srcSkm = fs.readFileSync(path.join(ICI, 'skins-marche.js'), 'utf8').replace("from './blockskins.js'", "from '" + pathToFileURL(path.join(ICI, 'blockskins.js')).href + "'")
    .replace("from './frais-creation.js'", "from '" + pathToFileURL(path.join(ICI, 'frais-creation.js')).href + "'"); /* 2026-10-26 (game57 item 10): skins-marche imports the fee-address mask */
  const srcApp = fs.readFileSync(APP, 'utf8').replace(/\r\n/g, '\n');
  const MUTANTS = [
    ['app', 'le Market montre un autre prix sur Buy', "if (g.genre === 'ACHETER') bouton(g.libelle + ' · ' + bcMontantSkin(s.prix, s.devise), 'ACHETER');", "if (g.genre === 'ACHETER') bouton(g.libelle + ' · ' + bcMontantSkin(BigInt(s.prix) + 1000n, s.devise), 'ACHETER');"],
    ['app', 'le statut prix fixe montre l offre', "if (st === 'FIXE') statut.textContent = 'For sale · ' + bcMontantSkin(s.prix, s.devise)", "if (st === 'FIXE') statut.textContent = 'For sale · ' + bcMontantSkin(s.offre, s.devise)"],
    ['app', 'le clic Buy envoie une autre skin que celle montree', "const bouton = (texte, genre, x) => { const b = bcEl('button', { type: 'button', cls: 'bouton sec', text: texte }); b.addEventListener('click', () => void bcActionMarche(genre, s, x)); gestes.append(b); return b; };", "const bouton = (texte, genre, x) => { const b = bcEl('button', { type: 'button', cls: 'bouton sec', text: texte }); b.addEventListener('click', () => void bcActionMarche(genre, { ...s, prix: BigInt(s.prix) * 2n }, x)); gestes.append(b); return b; };"],
    ['app', 'montants coupes a 8 decimales (bcUnites)', 'return d ? brutVersTexteSkin(BigInt(brut), d.dec) + \' \' + d.sym', "return d ? bcUnites(brut, d.dec) + ' ' + d.sym"],
    ['app', 'le Market dit une autre phrase', "  jb('skmEtat', texteMarcheSkins(skm.liste, moi));", "  jb('skmEtat', 'Nothing listed yet.');"],
    ['app', 'le Market ne peint pas sa phrase', "  jb('skmEtat', texteMarcheSkins(skm.liste, moi));\n", ''],
    ['app', 'le Market peint une autre liste', 'const vues = ordonnerSkins(filtrerSkins(skm.liste, skm.filtre, moi, t), t).slice(0, 60);', 'const vues = ordonnerSkins(filtrerSkins(skm.liste.slice(1), skm.filtre, moi, t), t).slice(0, 60);'],
    ['app', 'lecture ratee : la phrase du Market se tait', "      if (!skm.liste) jb('skmEtat', 'Skins not read on chain just now — no list is shown rather than a wrong one.');\n      else skmPeindreListe();", '      if (!skm.liste) {}\n      else skmPeindreListe();'],
    ['app', 'Mint retire du Market', "$('#skmMint').addEventListener('click', ouvrirMintSkin);\n", ''],
    ['app', 'Mint du Market par un autre chemin', "$('#skmMint').addEventListener('click', ouvrirMintSkin);", "$('#skmMint').addEventListener('click', () => { void bcAcheterSkin(); });"],
    ['app', 'bouton Mint retire du HTML', '      <div class="jourEtapes"><button type="button" class="bouton" id="skmMint">Mint a skin · <span class="skinPrix"></span></button></div>\n', ''],
    ['app', 'le Game garde sa propre copie de la phrase', '    etat.textContent = texteMarcheSkins(r.skins, moi);', "    etat.textContent = enVente.length ? enVente.length + ' for sale.' : 'Nothing listed yet — mint a skin, then sell it at a fixed price or open an auction (bids +5%, 7 days max).';"],
    ['skm', 'la phrase oublie les encheres', "const enVente = l.filter((s) => s && s.enVente), encheres", "const enVente = l.filter((s) => s && s.enVente && !s.enchere), encheres"],
    ['skm', 'la phrase vide oublie Connect', "(avecWallet ? '' : ' Connect a wallet to list yours.')", "''"],
  ];
  const lancer = (env) => spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, TB_SKO_SANS_MUTANTS: '1', ...env }, encoding: 'utf8' });
  const fSkm = path.join(tmp, 'skins-marche.js'), fApp = path.join(tmp, 'app.html');
  for (const [cible, nom, de, vers] of MUTANTS) {
    const src = cible === 'skm' ? srcSkm : srcApp;
    if (src.split(de).length !== 2) { vu(false, 'D mutant « ' + nom + ' » : motif introuvable ou multiple'); continue; }
    fs.writeFileSync(fSkm, cible === 'skm' ? src.replace(de, vers) : srcSkm);
    fs.writeFileSync(fApp, cible === 'app' ? src.replace(de, vers) : srcApp);
    const r = lancer({ TB_SKM: fSkm, TB_APP: fApp });
    const rouges = (r.stdout.match(/^KO /gm) || []).length;
    vu(r.status !== 0 && (rouges > 0 || /Error/.test(r.stderr)), 'D mutant « ' + nom + ' » : doit ROUGIR (' + rouges + ' KO)');
    console.log((r.status !== 0 ? 'ok ' : 'KO ') + ' D mutant « ' + nom + ' » : ' + (rouges ? rouges + ' KO' : 'plante'));
  }
  fs.writeFileSync(fSkm, srcSkm); fs.writeFileSync(fApp, srcApp);
  const t = lancer({ TB_SKM: fSkm, TB_APP: fApp });
  vu(t.status === 0, 'D temoin : les copies NON mutees sont vertes (' + (t.stdout.match(/^KO .*/gm) || []).slice(0, 3).join(' | ') + ')');
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(n + ' assertions, ' + ko + ' KO' + (process.env.TB_SKO_SANS_MUTANTS ? ' (sans mutants)' : '') + ' ; NE PROUVE PAS une vraie signature, ni le rendu au navigateur, ni un mint reel');
process.exit(ko ? 1 : 0);
