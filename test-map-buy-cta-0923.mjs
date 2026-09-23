/* ⛔ LIBELLE REDIRIGE (Phil, 2026-09-23 : « retire 0.5% partout, gene de trop »).
 *    Ces controles exigeaient « Buy · 0.5% ». Ils gardaient un TAUX affiche, pas un
 *    comportement : le bouton doit exister et porter son adresse, c est tout ce qui casse
 *    l app s il disparait. Le taux, lui, reste dans le hook et dans les tests qui le lisent
 *    sur la chaine — la ou il est VERIFIABLE plutot qu affiche. */
import { readFileSync } from 'fs';
const h = readFileSync('./app.html', 'utf8');
/* ⛔ EPINGLE DE BUILD RETIREE (2026-09-23, passe globale) : elle exigeait un numero de
 *    build precis, donc elle rougissait des qu un AUTRE deploiement bumpait le build. Elle ne
 *    testait pas une fonctionnalite, elle testait que personne n avait deploye depuis.
 *    L intention — « c est bien une page servie, avec sa ligne de build » — est gardee. */
if (!/data-build="[\w-]+"/.test(h)) throw new Error('ligne de build absente ou mal formee');
if (!h.includes('tip 20260923-map-buy-cta: amplify Instant Birth Map CTA')) throw new Error('amplify comment');
/* ⛔⛔ CES DEUX CONTROLES EXIGEAIENT UN DOUBLON, ET PHIL L A FAIT RETIRER (capture 2026-09-23 :
 *     « pourquoi t as 2 bouton create block … ca fait pas expert »).
 *     `#mapCtaDock` portait EXACTEMENT le meme handler que `#mapCta` —
 *         etape('map_cta'); poserIntent({ kind: 'ib' }); allerA('creer');
 *     — et le commentaire du code le disait lui-meme : « same Instant Birth funnel as header chip ».
 *     Deux boutons identiques sur le meme ecran, dont un intitule « Map works », qui est une note
 *     rassurante qu on s ecrit a soi-meme et pas un appel a l action.
 *     ⇒ Le controle porte desormais sur ce qui compte : le CTA d EN-TETE existe et mene au meme
 *       entonnoir. Exiger la PRESENCE du doublon rendait la duplication OBLIGATOIRE — le meme
 *       defaut qu un test qui verrouille un prix faux.
 * ⛔ CE N EST PAS UN AFFAIBLISSEMENT : le chemin Instant Birth depuis la Map reste exige, et le
 *    doublon passe de REQUIS a INTERDIT. */
if (!h.includes('id="mapCta" class="mapCta">✦ Instant Birth')) throw new Error('header CTA manquant');
if (!h.includes("poserIntent({ kind: 'ib' }); allerA('creer')")) throw new Error('l entonnoir Instant Birth a disparu');
if (h.includes('id="mapCtaDock"') || h.includes('Map works')) throw new Error('le doublon de CTA est revenu');
if (!h.includes("data-acheter=\"' + enTexte(l.adr) + '\">Buy")) throw new Error('trending buy');
if (!h.includes('id="fAcheter" type="button">Buy<')) throw new Error('fiche buy');
if (!h.includes('id="fIb"')) throw new Error('fiche ib');
if (!h.includes('>Buy</button>') || !h.includes("data-tf-act=\"buy\">Buy")) throw new Error('profile buy label');
if (h.includes('Fees for Dev')) throw new Error('fees for dev');
if (h.includes('data-build="20260923-created-ib-cta"')) throw new Error('old tip left');
/* Prefer Buy CTA wiring over Open-only Trending */
if (h.includes("data-ouvrir=\"' + enTexte(l.adr) + '\">Open</button>")) throw new Error('old Open left');
console.log('ok map-buy-cta');
