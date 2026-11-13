// vision-skin.js - THE COLOURS OF A BLOCK'S SKIN, for its brain window (#bvPop) and the Brain tab (#v-brain).
// Owner (Phil, 2026-10-27): "the Brain tab and the brain window take the colours of the block's SKIN when it wears one".
//
// ⛔ THE ONLY COLOUR SOURCE IS THE SKIN ON CHAIN: a SkinView decoded by blockskins.js (lireSkins -> decoderPage), whose `recette`
//    is the recipe the contract stores. The lightness/saturation of each colour are the ones the CONTRACT itself paints in its
//    tokenURI image (BlockSkins.sol#_svg): background hsl(h6,45%,9%), ring stop 0 hsl(h1,90%,62%), ring stop .66 hsl(h3,90%,70%),
//    edges hsl(h4,90%,60%). Nothing here invents a hue: no skin -> no palette (the page's own tokens stay).
// ⛔ READABLE ON EVERY SKIN: each skin colour that carries text must reach WCAG AA 4.5:1 against the background it sits on. A skin
//    colour that fails is replaced by the page's own token for that role (checked too); if the page's text itself fails on the skin
//    background, the WHOLE default palette stays. Pure module: no network, no DOM.
const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x || '').toLowerCase();
const teinte = (n) => (Number.isInteger(n) && n >= 0 && n <= 359 ? n : null);
export const AA_TEXTE = 4.5;

/** The skin a block wears FOR THIS VIEWER, from the on-chain list: the viewer's own skin for this block (blockskins.js#skinPortee rule;
 *  the newest one if they hold several). ⛔ Owner (Phil, 2026-10-27): "a skin belongs to the user who owns it" — another account's
 *  skin is NEVER shown (same doctrine as the Map's poserMesSkins). No wallet, or no skin of theirs for this block -> null (default palette). */
/* game399: the NEWEST skin, across the skins contracts in their deploy order (`contrats`, oldest first, blockskins-actif BLOCKSKINS_SUITE):
 *   a later contract's token 1 is newer than an older contract's token 9. Without `contrats`, the token id alone, as before. */
export function skinDuBlock(skins, block, moi, contrats = null) {
  const b = bas(block), m = bas(moi);
  if (!ADR.test(b) || !ADR.test(m) || !Array.isArray(skins)) return null;
  const miennes = skins.filter((s) => s && bas(s.block) === b && s.recette && bas(s.detenteur) === m);
  if (!miennes.length) return null;
  const ordre = Array.isArray(contrats) ? contrats.map(bas) : null;
  const rang = (s) => (ordre ? ordre.indexOf(bas(s.contrat)) : 0);
  const id = (s) => { try { return BigInt(s.tokenId); } catch (_) { return -1n; } };
  const plusNeuve = (a, s) => (rang(s) !== rang(a) ? rang(s) > rang(a) : id(s) > id(a));
  return miennes.reduce((a, s) => (plusNeuve(a, s) ? s : a));
}

/** The contract's own colours for a recipe ({ angle, h:[h1,h2,h3], cube, noyau, fond }), as [h, s, l]. Null on any hue outside 0..359. */
export function couleursSkin(r) {
  const h = r && Array.isArray(r.h) ? r.h : [];
  const h1 = teinte(h[0]), h3 = teinte(h[2]), aretes = teinte(r && r.cube), fond = teinte(r && r.fond);
  if (h1 === null || h3 === null || aretes === null || fond === null) return null;
  return { fond: [fond, 45, 9], accent: [h1, 90, 62], accent2: [h3, 90, 70], ligne: [aretes, 90, 60] };
}

export function hslVersRgb([h, s, l]) {
  const S = s / 100, L = l / 100, k = (n) => (n + h / 30) % 12, a = S * Math.min(L, 1 - L);
  const f = (n) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}
function luminance(rgb) {
  const c = rgb.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
/** WCAG 2.x contrast ratio between two opaque sRGB colours [r,g,b] 0..255. */
export function contraste(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
/** `haut` at opacity `alpha` over the opaque `dessous` (the Brain tab's cards are translucent over the page). */
export function melange(haut, dessous, alpha) { return haut.map((v, i) => Math.round(v * alpha + dessous[i] * (1 - alpha))); }
const css = (rgb, alpha) => (alpha === undefined ? 'rgb(' + rgb.join(' ') + ')' : 'rgb(' + rgb.join(' ') + ' / ' + alpha + ')');

/** The palette to pose, or the reason to keep the default one.
 *  theme = the page's tokens RESOLVED to rgb: { texte, doux, accent, accent2, fond } ([r,g,b] each).
 *  fonds = the backgrounds text will sit on, as functions of the skin background rgb (default: the background itself).
 *  Returns { etat:'SKIN', tokenId, vars, ratios, remplaces } or { etat:'DEFAUT', pourquoi, ratios? }. */
export function paletteSkin(skin, theme, { fonds = [(f) => f] } = {}) {
  if (!skin || !skin.recette) return { etat: 'DEFAUT', pourquoi: 'no skin worn' };
  const c = couleursSkin(skin.recette);
  if (!c) return { etat: 'DEFAUT', pourquoi: 'unreadable skin recipe' };
  const ok = (rgb) => theme && Array.isArray(rgb) && rgb.length === 3 && rgb.every((v) => Number.isFinite(v));
  if (!ok(theme && theme.texte) || !ok(theme.doux) || !ok(theme.accent) || !ok(theme.accent2)) return { etat: 'DEFAUT', pourquoi: 'page colours not resolved' };
  const fondSkin = hslVersRgb(c.fond);
  const surfaces = fonds.map((f) => f(fondSkin));
  const pire = (rgb) => Math.min(...surfaces.map((s) => contraste(rgb, s)));
  const ratios = {};
  /* the page's own text on the skin background: if it fails, nothing of the skin can be posed */
  for (const nom of ['texte', 'doux']) {
    ratios[nom] = Math.round(pire(theme[nom]) * 100) / 100;
    if (ratios[nom] < AA_TEXTE) return { etat: 'DEFAUT', pourquoi: 'the page ' + nom + ' would read at ' + ratios[nom] + ':1 on this skin (needs ' + AA_TEXTE + ')', ratios };
  }
  const remplaces = [];
  const choisir = (nom) => {
    const s = hslVersRgb(c[nom]), rs = pire(s);
    ratios[nom] = Math.round(rs * 100) / 100;
    if (rs >= AA_TEXTE) return s;
    const d = theme[nom], rd = pire(d);
    if (rd >= AA_TEXTE) { remplaces.push(nom); ratios[nom + 'Defaut'] = Math.round(rd * 100) / 100; return d; }
    return null;
  };
  const accent = choisir('accent'), accent2 = choisir('accent2');
  if (!accent || !accent2) return { etat: 'DEFAUT', pourquoi: 'neither the skin nor the page accent reaches ' + AA_TEXTE + ':1 on this skin', ratios };
  const ligne = hslVersRgb(c.ligne);
  return {
    etat: 'SKIN', tokenId: String(skin.tokenId), ratios, remplaces,
    vars: {
      '--carte': css(fondSkin), '--creux': css(fondSkin), '--carteHautRgb': fondSkin.join(' '), '--carteBasRgb': fondSkin.join(' '),
      '--ligne': css(ligne, 0.45), '--accent': css(accent), '--accentRgb': accent.join(' '), '--accent2': css(accent2),
    },
  };
}
/** The CSS variables paletteSkin may pose — the glue removes exactly these when a block wears no skin. */
export const VARS_SKIN = Object.freeze(['--carte', '--creux', '--carteHautRgb', '--carteBasRgb', '--ligne', '--accent', '--accentRgb', '--accent2']);
