// cube3d.js — le block de la map en VOLUME : un cube qui tourne sur lui-meme, ses eclats en orbite comme des satellites.
// ================================================================================================================
// ⛔ PHIL (2026-09-19) : « rends les blocks en 3D, le block tourne sur lui-meme en libre mouvement x y z avec son logo ;
//    le fond blanc casse la galaxie ; les petits elements exterieurs tournent autour du block comme planete et satellites ».
// ⛔ UNE SEULE SOURCE DE VERITE : couleurs, motif et eclats viennent de `modeleFace` (logo.js), la meme fonction que le
//    logo GRAVE. Le cube de la map ne peut donc pas contredire l image du block.
// ⛔ AUCUN FOND : le logo grave a un rectangle de fond (blanc pour papier / encre / rose) ; le cube n en a pas — la galaxie
//    se voit autour de lui.
// ⛔ CSS 3D PUR, aucun WebGL : 6 faces + au plus 2 satellites par block (perf, 2026-09-19), animes par le compositeur du navigateur.
//    Mouvement reduit : aucune rotation, aucune orbite (le cube reste pose en 3/4).
// ⚠️ Les tailles sont en unites de conteneur (cqw) : le cube suit la taille de sa tuile sans qu on la lui repasse.
import { modeleFace, logoSvg } from './logo.js';

/** Nombre pseudo-aleatoire DETERMINISTE depuis l adresse : chaque block tourne toujours de la meme facon. */
function graine(adr, i) {
  const s = String(adr || '').toLowerCase() + ':' + i;
  let h = 2166136261;
  for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

/* ⛔ PHIL (2026-09-19) : « rajoute tous les elements de l image 2D sur le modele 3D, comme les lignes ». La GRILLE de la
 *    face (division n, meme trait que le logo grave : #cfe6ff a 32 %) et le LUSTRE de la face du haut sont peints en
 *    fonds CSS — aucun element de plus, donc aucun cout de plus. */
const grilleCss = (n) => n > 1
  ? 'background-image:linear-gradient(rgb(207 230 255 / .32) 1px,transparent 1px),linear-gradient(90deg,rgb(207 230 255 / .32) 1px,transparent 1px);'
    + 'background-size:calc(100% / ' + n + ') calc(100% / ' + n + ');background-position:-0.5px -0.5px;'
  : '';
const face = (cls, fond, trait, ep, motif, n = 1, lustre = false) => '<div class="c3f ' + cls + '" style="background-color:'
  + (fond === 'none' ? 'transparent' : fond) + ';' + grilleCss(n)
  + (lustre ? 'box-shadow:inset 0 0 0 999px rgb(255 255 255 / .10);' : '')
  + 'border:' + Math.max(1, ep * 0.6).toFixed(1) + 'px solid ' + trait + '">'
  + (motif ? '<svg viewBox="-26 -26 52 52" aria-hidden="true">' + motif + '</svg>' : '') + '</div>';

/**
 * Le HTML d un cube 3D pour la map.
 * @param {object} params  parametres du logo (paramsLogoDepuisApparence)
 * @param {string} adr     adresse du block (rotation deterministe)
 */
export function cube3dHtml(params, adr) {
  let m;
  try { m = modeleFace(params); } catch (_) { m = null; }
  if (!m || typeof m !== 'object') return '';
  /* axe de rotation libre (x, y, z), vitesse et sens : propres a chaque block */
  const vx = (graine(adr, 1) * 2 - 1).toFixed(3), vy = (0.4 + graine(adr, 2)).toFixed(3), vz = (graine(adr, 3) * 2 - 1).toFixed(3);
  const duree = (14 + graine(adr, 4) * 16).toFixed(1);
  /* ⛔⛔ AMPLITUDE REDUITE (Phil, 2026-09-23 : « je reduis l amplitude »). Le cube faisait un TOUR
   *     COMPLET (0 -> 360 deg). Pris a mi-rotation — ce qui est le cas la plupart du temps — un
   *     gros cube se lit comme un parallelogramme ecrase : signale trois fois comme un « bug
   *     visuel ». Ce n en etait pas un : c est la demande du 2026-09-19 (« le block tourne sur
   *     lui-meme en libre mouvement x y z »). On garde le mouvement, on borne l angle.
   *     ⇒ Le cube OSCILLE entre -AMPLITUDE et +AMPLITUDE au lieu de tourner : il reste
   *       reconnaissable a tout instant, et la galaxie garde sa vie.
   *     ⛔ LE SENS DEVIENT UN SENS D ALTERNANCE : avec des images-cles bornees, `normal`/`reverse`
   *       feraient un saut brutal a chaque fin de cycle. `alternate` fait l aller-retour. */
  const sens = graine(adr, 5) < 0.5 ? 'alternate' : 'alternate-reverse';
  const n = Number(m.division) || 1;
  const faces = face('av', m.gauche, m.trait, m.ep, m.motifs.gauche, n)
    + face('ar', m.gauche, m.trait, m.ep, m.motifs.gauche, n)
    + face('dr', m.droite, m.trait, m.ep, m.motifs.droite, n)
    + face('ga', m.droite, m.trait, m.ep, m.motifs.droite, n)
    + face('ha', m.haut, m.trait, m.ep, m.motifs.haut, n, m.lustre)
    + face('ba', m.haut, m.trait, m.ep, m.motifs.haut, n, m.lustre);
  /* les satellites : les eclats du logo (petits cubes a sa couleur), puis l ornement s il y en a un ; 2 au plus */
  const sats = [];
  const nEclats = Math.min(2, Number(m.eclats) || 0);
  for (let i = 0; i < nEclats; i++) sats.push({ genre: 'eclat' });
  if (m.coin && sats.length < 2) sats.push({ genre: 'coin' });
  const orbites = sats.map((s, i) => {
    const incl = (55 + graine(adr, 10 + i) * 50).toFixed(0);
    const tour = (graine(adr, 20 + i) * 360).toFixed(0);
    const rayon = (46 + i * 7 + graine(adr, 30 + i) * 6).toFixed(1);
    const d = (7 + i * 3 + graine(adr, 40 + i) * 5).toFixed(1);
    /* Phil : « les particules autour comme satellites, aussi en 3D » : chaque eclat est un MINI-CUBE en volume */
    const mf = (cls, fond) => '<b class="' + cls + '" style="background:' + fond + ';border-color:' + m.eclat.trait + '"></b>';
    const corps = s.genre === 'eclat'
      ? '<i class="c3m">' + mf('av', m.eclat.gauche) + mf('ar', m.eclat.gauche) + mf('dr', m.eclat.droite) + mf('ga', m.eclat.droite)
        + mf('ha', m.eclat.haut) + mf('ba', m.eclat.haut) + '</i>'
      : '<i class="c3s c3c" style="color:' + m.coinCouleur + '"><svg viewBox="-14 -14 40 40" fill="currentColor" stroke="currentColor">' + m.coin + '</svg></i>';
    return '<div class="c3o" style="--incl:' + incl + 'deg;--tour:' + tour + 'deg;--rayon:' + rayon + 'cqw;--d:' + d + 's">'
      + '<div class="c3p">' + corps + '</div></div>';
  }).join('')
    /* et 3 particules lumineuses, chacune sur son orbite (1 element chacune : le decor ne coute presque rien) */
    + [0, 1, 2].map((i) => '<div class="c3o c3q" style="--incl:' + (40 + graine(adr, 60 + i) * 90).toFixed(0) + 'deg;--tour:'
      + (graine(adr, 70 + i) * 360).toFixed(0) + 'deg;--rayon:' + (38 + graine(adr, 80 + i) * 22).toFixed(1) + 'cqw;--d:'
      + (5 + graine(adr, 90 + i) * 7).toFixed(1) + 's"><div class="c3p"><i class="c3dot" style="background:' + m.eclat.haut
      + ';box-shadow:0 0 5px ' + m.eclat.haut + '"></i></div></div>').join('');
  /* ⛔ PHIL (2026-09-19) : en 2D, « reprends le modele precedent du block, pas juste la face » : le dessin isometrique
   *    (cube + eclats + ornements), SANS son rectangle de fond — la galaxie reste visible autour. */
  let iso = '';
  try { iso = logoSvg(params).replace(/<rect width="200" height="220" fill="[^"]*"\/>/, ''); } catch (_) { iso = ''; }
  /* les ornements de coin, places EXACTEMENT comme sur le logo grave (memes positions, meme couleur), en cadre fixe */
  const coins3d = !m.coin ? '' : '<svg class="c3k" viewBox="0 0 200 220" aria-hidden="true"><g fill="' + m.coinCouleur + '" stroke="'
    + m.coinCouleur + '" opacity="0.85">'
    + [[16, 16, 1, 1], [184, 16, -1, 1], [16, 204, 1, -1], [184, 204, -1, -1]]
      .map(([x, y, sx, sy]) => '<g transform="translate(' + x + ' ' + y + ') scale(' + sx + ' ' + sy + ')">' + m.coin + '</g>').join('')
    + '</g></svg>';
  return '<div class="c2" aria-hidden="true">' + iso + '</div>'
    + '<div class="c3" aria-hidden="true">' + coins3d + '<div class="c3t">'
    + '<div class="c3r" style="--vx:' + vx + ';--vy:' + vy + ';--vz:' + vz + ';--d:' + duree + 's;animation-direction:' + sens + '">'
    + faces + '</div>' + orbites + '</div></div>';
}

/** La feuille de style du cube (injectee une fois). */
export const CUBE3D_CSS = `
.c3{position:absolute;inset:0 0 12% 0;perspective:420px;pointer-events:none;container-type:size}
.c3t{position:absolute;inset:0;transform-style:preserve-3d;transform:rotateX(-22deg) rotateY(34deg)}
/* ⛔⛔ L AMPLITUDE EST UNE CONSTANTE NOMMEE, PAS UN NOMBRE PERDU DANS UNE IMAGE-CLE. Elle vaut 14
 *     degres : au-dela, un gros cube redevient un parallelogramme a mi-course, et c est exactement
 *     ce que Phil a signale trois fois. En dessous de ~6, le mouvement ne se voit plus et la
 *     galaxie parait figee. La regler, c est changer CETTE ligne — pas chercher dans le CSS. */
:root{--c3amp:14deg}
.c3r{position:absolute;left:50%;top:50%;width:0;height:0;transform-style:preserve-3d;
  animation:c3tourne var(--d) ease-in-out infinite}
@keyframes c3tourne{
  from{transform:rotate3d(var(--vx),var(--vy),var(--vz),calc(-1 * var(--c3amp)))}
  to{transform:rotate3d(var(--vx),var(--vy),var(--vz),var(--c3amp))}}
.c3f{position:absolute;left:-28cqmin;top:-28cqmin;width:56cqmin;height:56cqmin;box-sizing:border-box;border-radius:3px;
  display:flex;align-items:center;justify-content:center;backface-visibility:visible}
.c3f svg{width:62%;height:62%}
.c3f.av{transform:translateZ(28cqmin)}
.c3f.ar{transform:rotateY(180deg) translateZ(28cqmin)}
.c3f.dr{transform:rotateY(90deg) translateZ(28cqmin)}
.c3f.ga{transform:rotateY(-90deg) translateZ(28cqmin)}
.c3f.ha{transform:rotateX(90deg) translateZ(28cqmin)}
.c3f.ba{transform:rotateX(-90deg) translateZ(28cqmin)}
.c3o{position:absolute;left:50%;top:50%;width:0;height:0;transform-style:preserve-3d;
  transform:rotateX(var(--incl)) rotateZ(var(--tour));animation:c3orbite var(--d) linear infinite}
@keyframes c3orbite{from{transform:rotateX(var(--incl)) rotateZ(var(--tour))}to{transform:rotateX(var(--incl)) rotateZ(calc(var(--tour) + 360deg))}}
.c3p{position:absolute;transform:translateX(var(--rayon))}
.c3s{display:block;width:11cqmin;height:11cqmin;margin:-5.5cqmin 0 0 -5.5cqmin;border:1px solid;border-radius:2px;
}
.c3s.c3c{background:none;border:0;box-shadow:none;width:13cqmin;height:13cqmin}
.c3s.c3c svg{width:100%;height:100%}
@media (prefers-reduced-motion: reduce){.c3r,.c3o{animation:none}}
/* ⛔ MELANGE 3D / 2D (Phil : « fais un melange 3D 2D qui passe bien pour optimiser les fps ») : un block petit a l ecran
   (classe « loin », posee par map3d) devient UNE face plate, de face, avec son logo — 1 element peint au lieu de 6,
   aucune rotation, aucun satellite. Seuls les blocks proches sont en volume. */
/* ⛔ TRANSITION DOUCE (Phil : « fais la transition plus smooth ») : 2D et 3D se croisent en fondu ; la 3D cachee est mise
   en pause (visibility apres le fondu) pour ne rien couter une fois invisible. */
.c2{position:absolute;inset:0 0 6% 0;opacity:0;visibility:hidden;transform:scale(.9);
  transition:opacity .5s ease,transform .5s ease,visibility 0s linear .5s}
.c2 svg{width:100%;height:100%}
.c3{transition:opacity .5s ease,transform .5s ease,visibility 0s}
.bloc.loin .c2{opacity:1;visibility:visible;transform:none;transition:opacity .5s ease,transform .5s ease,visibility 0s}
.bloc.loin .c3{opacity:0;visibility:hidden;transform:scale(.85);transition:opacity .5s ease,transform .5s ease,visibility 0s linear .5s}
.bloc.loin .c3r,.bloc.loin .c3o,.bloc.loin .c3m{animation-play-state:paused}
/* mini-cube satellite, en volume, qui tourne sur lui-meme */
/* ⛔ LES SATELLITES GARDENT LEUR TOUR COMPLET. Ils partageaient l animation du gros cube : borner
 *    l angle la aussi les aurait figes, alors que le defaut signale ne venait QUE du cube
 *    principal — un satellite de quelques pixels ne se lit jamais comme un parallelogramme.
 *    Corriger au-dela du defaut mesure, c est casser ce qui marchait.
 *    ⛔ AUCUN ACCENT GRAVE DANS CE BLOC : on est A L INTERIEUR du gabarit CUBE3D_CSS. Un accent
 *      grave y TERMINE la chaine et casse le module entier. Ca vient d arriver DEUX fois de suite
 *      ici — la seconde dans le commentaire qui l interdisait. La garde de syntaxe les a attrapees
 *      toutes les deux avant le deploiement. */
@keyframes c3satellite{from{transform:rotate3d(1,1,0,0deg)}to{transform:rotate3d(1,1,0,360deg)}}
.c3m{position:absolute;width:0;height:0;transform-style:preserve-3d;animation:c3satellite 4s linear infinite}
.c3m b{position:absolute;left:-4.5cqmin;top:-4.5cqmin;width:9cqmin;height:9cqmin;border:1px solid;box-sizing:border-box}
.c3m .av{transform:translateZ(4.5cqmin)}.c3m .ar{transform:rotateY(180deg) translateZ(4.5cqmin)}
.c3m .dr{transform:rotateY(90deg) translateZ(4.5cqmin)}.c3m .ga{transform:rotateY(-90deg) translateZ(4.5cqmin)}
.c3m .ha{transform:rotateX(90deg) translateZ(4.5cqmin)}.c3m .ba{transform:rotateX(-90deg) translateZ(4.5cqmin)}
.c3k{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.c3dot{position:absolute;width:3cqmin;height:3cqmin;margin:-1.5cqmin 0 0 -1.5cqmin;border-radius:50%}
@media (prefers-reduced-motion: reduce){.c3m{animation:none}}
`;
