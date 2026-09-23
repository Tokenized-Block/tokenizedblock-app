// test-texte-a-l-ecran.mjs — CE QUE L UTILISATEUR LIT EST EN ANGLAIS, ET N EST PAS UNE NOTE INTERNE.
//
// ⛔⛔ POURQUOI CE FICHIER EXISTE (Phil, 2026-09-21, et il avait raison d etre dur) : l app servie au
//     public affichait, en toutes lettres, sous la carte des stades :
//
//       « 256 block(s) on the map · 3 made with TokenizedBlock · 165 tier(s) from the public market
//         (DexScreener), the rest read on chain · markets still loading ·
//         named when life is LUE (unread ≠ broken). »
//
//     Trois defauts dans une seule phrase :
//       · « LUE » est du FRANCAIS, en plein ecran anglais ;
//       · « tier(s) » est un calque de « tiers » (= third-party). En anglais, « tier » veut dire
//         « palier » : la phrase ne dit pas ce qu elle croit dire, elle dit autre chose ;
//       · « (unread ≠ broken) » est une NOTE DE CONCEPTION. Elle explique a un developpeur pourquoi
//         un etat vide n est pas une panne. L utilisateur n a pas a connaitre nos etats internes.
//
// ⛔ J AVAIS DEJA LA REGLE, ECRITE, ET JE L AI VIOLEE : « notes de conception en commentaire, jamais
//    a l ecran ». Une regle qu aucun test n applique n est pas une regle, c est un souvenir. Ce
//    fichier la rend executable.
//
// ⛔ CE QU IL NE PEUT PAS FAIRE : juger le style. Il attrape des MOTIFS — mots francais, jargon
//    interne, notation de specification — dans les chaines qui finissent a l ecran. Une phrase
//    anglaise, correcte et inutile lui echappera.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

/* ⛔⛔ TOUTES LES PAGES PUBLIQUES, PAS SEULEMENT L APP. Premiere version : elle ne lisait
 *     qu `app.html`. Phil a dit « ya encore full erreur sur frontend » — corriger la page ou le
 *     defaut a ete VU et laisser les autres est exactement le motif « le correctif rate le jumeau ».
 * ⛔ Les pages `deploy-*.html` sont ECARTEES, et la raison est ecrite : ce sont des consoles de
 *    signature que seul Phil ouvre. Elles DOIVENT parler en octets et en selecteurs — leur imposer
 *    un langage grand public retirerait l information qui permet de refuser une signature. */
/* ⛔⛔ DEUX PAGES SONT ECARTEES PARCE QU ELLES NE SONT JAMAIS AFFICHEES, et c est MESURE, pas
 *     suppose : `index.html` et `block-0.html` repondent 301 vers `/#creer` en production (curl,
 *     2026-09-21). Leur contenu — l ancien ecran, 593 Ko — n atteint aucun utilisateur. Les
 *     corriger aurait ete du travail invisible, et les laisser dans le compte aurait noyé les
 *     deux vraies fautes (pot.html et lien-x.html) sous seize fausses.
 * ⛔ SI L UNE REDEVENAIT SERVIE, CE TEST NE LE VERRAIT PAS. C est la borne de ce fichier, et elle
 *    est ecrite ici plutot que decouverte plus tard : la liste est statique, pas lue du serveur. */
const REDIRIGEES = new Set(['index.html', 'block-0.html']);
const PAGES = readdirSync(new URL('./', import.meta.url))
  .filter((f) => f.endsWith('.html') && !/^deploy-/.test(f) && !REDIRIGEES.has(f))
  .sort();

/* ══ CE QU ON CHERCHE ════════════════════════════════════════════════════════════════════════
 * ⛔ Chaque motif porte la raison de sa presence : une liste de mots interdits sans justification
 *    finit par etre elaguee par quelqu un qui ne sait pas pourquoi ils y etaient. */
const MOTIFS = [
  { re: /\b(LUE|LUES|LU|NON LU|ILLISIBLE|MESURE|AUCUN|POURQUOI|ETAT)\b/,
    quoi: 'mot francais en majuscules (nos etats internes portent ces noms)' },
  { re: /\btier\(s\)|\btiers\b(?! party)/i,
    quoi: '« tier(s) » — calque de « tiers » ; en anglais « tier » veut dire palier' },
  { re: /≠|⛔|≥(?!\s*\d)/,
    quoi: 'notation de specification (≠, ⛔) — elle appartient au code, pas a l ecran' },
  { re: /\b(unread|unreadable)\s*[≠!=]/i, quoi: 'note de conception sur nos etats de lecture' },
  { re: /\b(fallback|nullish|undefined|NaN|boolean|bigint|calldata|selector|topic0)\b/i,
    quoi: 'jargon d implementation' },
  /* ⛔⛔ AJOUTE LE 2026-09-23, APRES QUE PHIL A ENTOURE UNE PHRASE QUE CE FICHIER LAISSAIT PASSER :
   *     « Instant Birth = CreateRouter 0.001 ETH once, then open V8 pool COINc↔your block (no ETH
   *     seed — buyers need COINc to trade) », sur l ecran ou l on choisit sa paire.
   *     Elle n avait ni `≠`, ni francais, ni dollar fige : aucun motif existant ne la voyait. Il
   *     manquait celui qui compte le plus ici — NOS PROPRES NOMS D INFRASTRUCTURE.
   * ⛔ CE SONT LES PIRES, et pas les plus visibles : « CreateRouter », « V8 pool », « PoolKey »,
   *    « StateView » ne sonnent pas comme du jargon quand on les ecrit tous les jours. Ils ne font
   *    pas rire un lecteur, ils lui font croire qu il lui MANQUE un savoir — et il s en va.
   * ⛔ LES VERSIONS DE HOOK SONT VISEES PAR LEUR CONTEXTE (`V8 pool`, `hook V5`), pas par « V8 »
   *    seul : « V8 » pourrait legitimement apparaitre ailleurs, et une garde qui crie au loup se
   *    fait elaguer.
   * ⚠️ BORNE : cette liste est celle de NOS noms d aujourd hui. Un contrat nomme demain ne sera pas
   *    attrape tant qu on ne l aura pas ajoute ici. */
  { re: /\b(CreateRouter|BridgeRouter|PoolManager|PoolKey|StateView|precompile|contractURI|beforeInitialize|beforeSwap|afterSwap|HOOK_FEE|FEE_WALLET|createPaid|sqrtPrice|poolId|initcode|CREATE2)\b/
    , quoi: 'nom d infrastructure a nous — il ne fait pas rire le lecteur, il lui fait croire qu il lui manque un savoir' },
  { re: /\b(?:hook|pool)\s+V\d\b|\bV\d\s+(?:hook|pool)\b/i,
    quoi: 'version de hook a l ecran — le lecteur n a pas a connaitre nos versions' },
  /* ⛔⛔ LE PRENOM DE QUELQU UN DE L EQUIPE, A L ECRAN. Ajoute le 2026-09-23 apres qu une mutation
   *     eut montre que la garde ELARGIE lisait bien la chaine et ne rougissait toujours PAS :
   *         setEtat('Bridge fee confirmed … · net swap via hub still Phil-blocked (1 bps router GO).')
   *     Les deux occurrences attrapees plus tot ne l avaient ete que parce qu elles contenaient le
   *     mot `BridgeRouter` ; celle-ci dit « router » en minuscule. Elargir la LECTURE sans elargir
   *     le MOTIF donne une garde qui compte plus de chaines et n attrape rien de plus — un
   *     compteur qui monte n est pas une garde qui mord.
   *     ⛔ POURQUOI C EST LE PIRE CAS : « Phil-blocked » s affiche JUSTE APRES un paiement. Le
   *       lecteur attend une confirmation et recoit le prenom d un inconnu. Phil l a dit deux fois
   *       en propres termes : « t es trop de truc perso », « c est une note de toi-meme ».
   *     ⛔ BORNE : ce motif ne connait que les prenoms de l equipe. Il ne peut pas deviner un
   *       nom propre quelconque, et il ne pretend pas le faire. */
  { re: /\b(?:Phil|Rakhsa|Raksha|Zero\s?1|Clansy|VolKov)\b/i,
    quoi: 'prenom de quelqu un de l equipe a l ecran — le lecteur ne sait pas qui c est, et ca ne lui apprend rien' },
  /* ⛔⛔ AJOUTE LE 2026-09-22, APRES UNE MUTATION QUI EST PASSEE AU VERT.
   *     J avais ecrit « 0.5% par virement bancaire » en plein ecran anglais pour verifier que ce
   *     fichier l attraperait. Il ne l a PAS attrape — et il avait raison au sens strict : le motif
   *     du haut dit « mot francais EN MAJUSCULES », parce qu il a ete ecrit pour nos noms d etats
   *     internes (LUE, NON_LU). De la prose francaise en MINUSCULES n a jamais ete dans sa portee.
   *     ⇒ La garde n etait pas cassee ; elle etait plus ETROITE que son nom ne le laissait croire.
   *     Et le trou est REEL : cette app est ecrite par un francophone, toute son ecriture interne
   *     est en francais, et une phrase mal recopiee part a l ecran sans rien declencher.
   * ⛔ LA LISTE EXCLUT VOLONTAIREMENT LES MOTS QUI SONT AUSSI ANGLAIS, et c est la moitie du
   *    travail : « pour » (to pour), « sans » (sans serif), « sous » (sous vide), « encore »,
   *    « son », « la », « est » (EST, le fuseau horaire) declencheraient sur de l anglais
   *    parfaitement correct. Une garde qui crie au loup se fait elaguer par le premier qui la
   *    croise — et le trou qu elle bouchait revient avec elle. */
  { re: motsFrancais(), quoi: 'mot francais en minuscules — de la prose francaise est partie a l ecran anglais' },
  /* ⛔⛔ AJOUTE LE 2026-09-22, APRES AVOIR TROUVE « ≈ $1 (0.001 ETH) » A 51 ENDROITS DE L ECRAN.
   *     Le frais facture est `FRAIS_OUVERTURE_WEI` = 0,001 ETH — decision de Phil du 2026-09-21,
   *     alignee sur la mediane du marche. Le « $1 » venait de `FRAIS_USD`, une CIBLE en dollars
   *     devenue vestige : le code prend `max(weiPourDollars($1), 0,001 ETH)`, et comme 1 $ vaut
   *     moins que 0,001 ETH au prix actuel, c est TOUJOURS le plancher qui s applique.
   *     ⇒ L ecran annoncait 1 $ et le wallet prelevait 0,001 ETH. Au prix LU par l app elle-meme
   *       (`prixEthUsd`, 4 lectures, 2741,48 $/ETH, ecart 0,16 %), ca fait 2,74 $ : un prix
   *       sous-annonce d un facteur 2,74, dans le sens qui nous arrange, sur le bouton d achat,
   *       la `meta description` et le titre du frame Farcaster.
   *     C est la DECISION qui avait ete corrigee, pas la DIVULGATION.
   * ⛔ POURQUOI LE MOTIF EST CE COUPLE-LA, et pas « aucun $ a l ecran » : un montant en dollars
   *    peut etre parfaitement juste quand le code le CALCULE — le refus « need at least ≈$1 in ETH »
   *    derive d un `weiPourDollars(1, ethUsd)` lu en direct, et l accuser serait accuser du code
   *    correct. Ce qui est FAUX par construction, c est un prix en dollars FIGE colle a un montant
   *    en ETH : l un bouge avec le marche, l autre non, donc ils divergent forcement un jour.
   * ⚠️ BORNE : un dollar fige ecrit LOIN du montant en ETH passerait. La garde attrape la forme
   *    exacte qui s est produite, pas toutes les manieres de mentir sur un prix. */
  /* ⛔ `$0` EST EXCLU, ET C EST LA CORRECTION D UN FAUX POSITIF DU 2026-09-23. La regle a accuse
   *    « TB earns $0 there. Want a hooked market? Instant Birth on TB · 0.001 ETH. » — or ce
   *    « $0 » est VRAI et le restera : on ne gagne litteralement rien sur les creations etrangeres.
   *    Ce que la regle traque, c est un prix en dollars qui DIVERGE du montant en ETH quand le
   *    marche bouge. Zero ne diverge pas. Accuser du texte correct fait desactiver la garde, et on
   *    perd les vraies prises avec. */
  { re: /\$\s?(?!0(?![.\d]))\d[^\n]{0,60}0\.001 ETH|0\.001 ETH[^\n]{0,60}\$\s?(?!0(?![.\d]))\d/,
    quoi: 'un prix en DOLLARS fige colle au frais en ETH — l un bouge avec le marche, l autre non' },
  /* ⛔⛔ UN « ≈ $N » ECRIT EN DUR EST UNE APPROXIMATION QUE LE CODE NE CALCULE PAS. La regle
   *     ci-dessus ne mordait QUE si le dollar etait colle a « 0.001 ETH » dans la meme chaine —
   *     donc `apercu.js` pouvait ecrire « Pays the one-off ≈ $1 that brings your block to life »
   *     sous une signature sans que rien ne bronche, pendant que CINQ fichiers de test
   *     interdisaient `≈$1` ailleurs. Un motif etroit protege une phrase, pas une regle.
   *     ⛔ LE CHIFFRE EST EXIGE JUSTE APRES LE `$` : un prix CALCULE s ecrit `'≈ $' + usd`, donc la
   *       chaine extraite finit par `$` et n est pas accusee. C est ce qui separe « on mesure et on
   *       affiche » de « on affirme ». */
  { re: /[≈~]\s*\$\s?\d/,
    quoi: 'un « ≈ $N » ecrit en dur — le code n a pas mesure ce dollar, il l affirme' },
];

/** Les mots francais en MINUSCULES, avec une majuscule initiale toleree (debut de phrase).
 * ⛔⛔ VOLONTAIREMENT SENSIBLE A LA CASSE, ET C EST LA CORRECTION D UN FAUX POSITIF QUE CETTE REGLE
 *     A PRODUIT DES SA PREMIERE EXECUTION. Elle a accuse « NOTRE » — qui n est pas de la prose mais
 *     une VALEUR D ENUMERATION interne, lue dans `conf === 'NOTRE'` et `parConf('NOTRE')`. Ce qui
 *     part a l ecran la, c est le NOMBRE que `parConf` rend, jamais le mot.
 *     C est le meme faux positif que celui deja documente plus bas : l extracteur ramasse des
 *     litteraux de chaine adjacents a une concatenation, sans savoir lesquels sont affiches.
 * ⛔ LA CORRECTION N EST PAS UNE EXCEPTION AJOUTEE A LA MAIN — ce serait la porte ouverte a en
 *    ajouter une par accusation genante, jusqu a ce que la regle ne garde plus rien. C est la
 *    PORTEE qui est precisee : cette regle parle de PROSE, la prose est en minuscules, et nos etats
 *    internes sont en CAPITALES. Le francais en capitales reste le travail du premier motif.
 * ⚠️ BORNE ASSUMEE : un etat interne qui serait un jour nomme en minuscules passerait ici. */
function motsFrancais() {
  const MOTS = ['vous', 'votre', 'nous', 'notre', 'avec', 'dans', 'cette', 'chaque', 'jamais',
    'toujours', 'aucune', 'ainsi', 'alors', 'mais', 'tous', 'toute', 'toutes', 'leur', 'leurs',
    'depuis', 'lorsque', 'pendant', 'plusieurs', 'quelques', 'très', 'voici', 'être',
    'avoir', 'peut', 'doit', 'sera', 'sont', 'virement', 'bancaire', 'banque', 'portefeuille',
    'jeton', 'jetons', 'créer', 'écran'];
  /* ⛔ CE QUI N EST PAS DANS LA LISTE COMPTE AUTANT QUE CE QUI Y EST : « pour » (to pour), « sans »
   *    (sans serif), « sous » (sous vide), « encore », « son », « la », « est » (EST, le fuseau
   *    horaire) sont du francais ET de l anglais. Les inclure ferait crier la garde sur de
   *    l anglais correct — et une garde qui crie au loup se fait elaguer par le premier qui la
   *    croise, avec le trou qu elle bouchait. */
  return new RegExp('\\b(' + MOTS.map((m) => '[' + m[0] + m[0].toUpperCase() + ']' + m.slice(1)).join('|') + ')\\b');
}

/** Les chaines qui finissent a l ecran : `textContent`, `innerHTML` et le texte des balises. */
/* ⛔⛔ `balisage` EST FAUX POUR UN MODULE `.js`, ET J AI FAILLI LIVRER L INVERSE. En etendant la
 *     garde aux modules, j ai d abord applique TOUTES les regles — dont celle qui lit le texte
 *     entre `>` et `<`. Dans du JavaScript, ces deux caracteres sont des COMPARAISONS : la regle a
 *     remonte des commentaires entiers comme s ils etaient a l ecran. 45 « fautes », dont une
 *     seule vraie.
 *     ⇒ Une garde elargie au mauvais endroit ne trouve pas plus de defauts, elle en INVENTE — et
 *       un rouge qui ne designe aucun defaut apprend a ignorer les rouges. */
function chainesVisibles(src, balisage = true) {
  const out = [];
  /* 1. affectations de texte en JS.
   * ⛔⛔ LES COMPARAISONS SONT RETIREES D ABORD. Premiere version : elle signalait « undefined »
   *     comme du jargon affiche, alors que la chaine venait de `typeof window.ethereum ===
   *     'undefined'` — une CONDITION dans la meme expression ternaire, jamais un texte. Un
   *     detecteur qui accuse du code sain finit desactive, donc il est resserre, pas assoupli. */
  const sansComparaisons = src.replace(/(?:typeof\s+[\w.$]+\s*)?[!=]==?\s*(['"])(?:[^'"\\]|\\.)*\1/g, '');
  /* ⛔⛔ `+=` EST ACCEPTE, ET C EST LA CORRECTION D UN TROU TROUVE LE 2026-09-23. La regle ne
   *     matchait que `textContent =` : une ligne
   *         el.textContent += ' … (StateView getLiquidity — not ETH; thin book ≠ market-cap).'
   *     passait donc sans etre lue, alors qu elle ajoute du texte A L ECRAN — avec un `≠` et du
   *     jargon d implementation, deux motifs interdits. Ajouter du texte n est pas moins « afficher »
   *     que le remplacer ; la garde ne regardait qu une des deux facons de le faire. */
  /* ⛔⛔ ET LA CAPTURE VA JUSQU AU BOUT DE LA LIGNE, PAS JUSQU AU PREMIER `;`. Deuxieme trou trouve
   *     le meme jour, plus sournois que le premier : `[^;]+` s arretait au premier point-virgule —
   *     y compris un point-virgule A L INTERIEUR d une chaine affichee. La ligne
   *         el.textContent += ' … (StateView getLiquidity — not ETH; thin book ≠ market-cap).'
   *     etait donc lue jusqu a « not ETH » et le `≠` qui suit n a jamais ete vu. La garde lisait la
   *     bonne ligne, et s arretait avant la faute. */
  /* ⛔⛔ ON TRAVAILLE PAR LIGNE, et les deux tentatives precedentes disent pourquoi :
   *     · `([^;]+);` s arretait au premier point-virgule — Y COMPRIS un `;` A L INTERIEUR d une
   *       chaine affichee. « (StateView getLiquidity — not ETH; thin book ≠ market-cap) » etait lu
   *       jusqu a « not ETH » et le `≠` qui suit n a jamais ete vu ;
   *     · `([^\n]+)` corrigeait ca mais CONSOMMAIT toute la ligne, donc une DEUXIEME affectation
   *       sur la meme ligne etait sautee — le compte est tombe de 2 587 a 1 866 chaines, soit 28 %
   *       de couverture perdue pour boucher un trou. Un correctif qui en ouvre un autre.
   *     · une version « par ligne » a corrige les deux, et en a ouvert un TROISIEME : les
   *       affectations MULTI-LIGNES (`el.textContent = 'a'` puis `+ 'b';` a la ligne suivante) ne
   *       voyaient plus que leur premiere ligne. 2 285 au lieu de 2 298.
   *   ⇒ VERSION RETENUE : on s arrete au premier `;` QUI TERMINE UNE LIGNE. Un `;` au milieu d une
   *     chaine ne termine pas une ligne, donc il ne coupe plus ; et une affectation qui s etale sur
   *     plusieurs lignes est lue en entier.
   * ⚠️ BORNE ASSUMEE : une chaine affichee qui contiendrait « ; » juste avant un retour a la ligne
   *    couperait encore. Aucune dans ce depot aujourd hui, et le compte total le dirait.
   * ⛔ `+=` COMPTE AUTANT QUE `=` : ajouter du texte n est pas moins « afficher » que le remplacer,
   *    et la garde ne regardait qu une des deux facons de le faire. */
  for (const m of sansComparaisons.matchAll(
    /\.(?:textContent|innerHTML|placeholder|title)\s*\+?=\s*([\s\S]{0,3000}?);[ \t]*(?:\r?\n|$)/g)) {
    for (const s of m[1].matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)) {
      const t = (s[1] ?? s[2] ?? '').trim();
      if (t.length > 3) out.push({ t, ou: 'JS' });
    }
  }
  /* 1 bis. ⛔⛔ LES FONCTIONS QUI ECRIVENT A L ECRAN — UN ANGLE MORT ENTIER, TROUVE LE 2026-09-23.
   *    La regle 1 ne voit que les AFFECTATIONS (`.textContent =`). Or l app ecrit aussi par APPEL :
   *    `setEtat(...)` (22 appels) et `majProgressionVie(...)` (14). Ces 36 textes n ont jamais ete
   *    lus par cette garde. Elle a rendu « 2768 chaines lues, OK » pendant qu un
   *        setEtat('Bridge fee confirmed … · net swap via hub still Phil-blocked (1 bps router GO).')
   *    s affichait JUSTE APRES un paiement. Un compteur qui monte ne prouve pas qu on a tout lu :
   *    il prouve qu on a beaucoup lu de ce qu on regardait deja.
   *    ⛔ LA DECOUVERTE EST AUTOMATIQUE, pas une liste tenue a la main : tout identifiant qui
   *      ressemble a un ecrivain d ecran est balaye. Une liste figee reproduirait exactement le
   *      defaut qu on corrige — elle vieillirait en silence au prochain `setXxx` ajoute. */
  for (const m of sansComparaisons.matchAll(
    /\b(?:setEtat|majProgressionVie|setNote|setMsg|setStatut|afficherEtat|lignes\.push)\s*\(([\s\S]{0,3000}?)\)\s*;/g)) {
    for (const s of m[1].matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)) {
      const t = (s[1] ?? s[2] ?? '').trim();
      if (t.length > 3) out.push({ t, ou: 'JS' });
    }
  }
  /* 2. texte des balises visibles du HTML. ⛔ Les commentaires HTML sont RETIRES d abord : ils
   *    portent justement nos notes de conception, et les attraper la serait un faux positif — la
   *    regle est « pas a l ecran », pas « pas dans le fichier ». */
  const sansCommentaires = src.replace(/<!--[\s\S]*?-->/g, '');
  const sansScript = sansCommentaires.replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '');
  for (const m of balisage ? sansScript.matchAll(/>([^<>{}]{4,})</g) : []) {
    const t = m[1].replace(/\s+/g, ' ').trim();
    if (t.length > 3 && /[a-zA-Z]/.test(t)) out.push({ t, ou: 'HTML' });
  }
  /* 3. ⛔⛔ TOUTE CHAINE QUI CONTIENT UNE BALISE EST DU MARKUP, DONC DESTINEE A L ECRAN.
   *    AJOUTE LE 2026-09-22, APRES QUE PHIL A ENTOURE UN TEXTE QUE CE FICHIER LAISSAIT PASSER :
   *        corps = '<span class="note">… each market is LUE. Silence ≠ broken.</span>'
   *    Elle contient `LUE` ET `≠` — DEUX motifs interdits depuis des semaines — et la garde restait
   *    VERTE.
   *    ⇒ Parce que les regles 1 et 2 ne voient que `.textContent =` / `.innerHTML =` DIRECTS et le
   *      texte des balises du document. Or cette app construit presque tout son HTML dans des
   *      VARIABLES (`corps = ...`, un `return`, un `.map()`), assignees a `innerHTML` bien plus
   *      loin. C etait donc la plus grande moitie de l ecran qui n etait pas gardee : la regle 3 a
   *      fait passer le compte de 1804 a 2298 chaines lues — 494 de plus, soit 27 %.
   *    ⛔ C est le defaut « la garde est VRAIE et couvre la MAUVAISE MOITIE ». Elle n a jamais menti
   *      sur ce qu elle lisait ; elle lisait ailleurs. Un vert ne vaut que par le compte de ce qui a
   *      ete INSPECTE — c est pour ca que `total` est asserte plus bas, et ce compte est la seule
   *      chose qui aurait pu reveler le trou sans une capture d ecran de Phil.
   * ⛔ LE CRITERE EST LA BALISE, PAS LA VARIABLE : suivre `corps` jusqu a son `innerHTML` demande
   *    d analyser le flot, ce qu une regexp ne fait pas. Une chaine qui porte `<span`, `<b>`,
   *    `<button`… est du markup PAR CONSTRUCTION — on n a pas besoin de savoir ou elle atterrit.
   * ⚠️ BORNE : une chaine de texte pur assignee a une variable puis affichee passe toujours. La
   *    regle attrape le markup, pas tout ce qui finit a l ecran. */
  const sansCommJs = src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1 ');
  const BALISE = /<\/?(?:span|b|i|u|em|strong|div|p|button|a|li|ul|ol|br|code|small|h[1-6]|img|label|table|tr|td|th)\b/i;
  for (const m of sansCommJs.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g)) {
    const t = (m[1] ?? m[2] ?? '').trim();
    if (t.length > 3 && BALISE.test(t)) out.push({ t, ou: 'MARKUP' });
  }
  return out;
}

/* ⛔⛔ LES MODULES `.js` SONT BALAYES AUSSI — ILS NE L ETAIENT PAS, ET C ETAIT LA CAUSE RACINE.
 *     Cette garde filtrait `f.endsWith('.html')` : QUATRE-VINGTS modules hors de sa vue, alors que
 *     c est la que vit la plupart du texte affiche. Deux defauts en sont sortis le 2026-09-23 :
 *       · « Fees for Dev » dans `messagerie-blocks.js` — affiche a Phil, alors que DEUX gardes
 *         interdisaient la chaine (toutes deux scopees a un slice de `app.html`) ;
 *       · « Pays the one-off ≈ $1 » dans `apercu.js` — affiche sous une signature, alors que CINQ
 *         fichiers de test interdisent `≈$1` et qu AUCUN ne lit `apercu.js`.
 *     ⇒ Une garde qui nomme son terrain ne voit pas le terrain d a cote. Le motif etait bon ; c est
 *       la LISTE DES FICHIERS qui mentait — et elle mentait en silence, en rendant un joli total.
 *     ⛔ CE QUI EST LU DANS UN MODULE : les memes sites d affichage que dans les pages, plus
 *       `lignes.push(...)` — la facon dont `apercu.js` compose ce que le wallet montre avant une
 *       signature. Le reste des chaines d un module (cles, selecteurs, causes internes) n est PAS
 *       du texte a l ecran et n a rien a faire ici. */
/* ⚠️⚠️ CE QUE CETTE GARDE NE VOIT TOUJOURS PAS, ET QUI EST A L ECRAN. Elle lit les AFFECTATIONS
 *      (`.textContent =`), les APPELS d affichage (`setEtat`, `lignes.push`, …) et les chaines qui
 *      portent une balise. Elle ne lit PAS les TABLES DE LIBELLES — par exemple `nomDe()` dans
 *      `apercu.js`, un tableau de paires `[adresse, 'libelle']` dont le texte s affiche sur la
 *      ligne « Contract: … » sous chaque signature. C est ainsi que « TB CreateRouter » a pu
 *      rester affichable apres l elargissement aux modules, et il a fallu le trouver a la main.
 *      ⛔ POURQUOI CE N EST PAS CORRIGE PAR UNE REGLE : il faudrait un motif taille pour cette
 *        table precise. Un motif trop etroit protege une PHRASE, pas une REGLE — c est exactement
 *        le defaut qu on vient de corriger sur le dollar. La borne est donc ECRITE plutot que
 *        maquillee : ni innocentee, ni accusee. */
const MODULES = readdirSync(new URL('./', import.meta.url))
  .filter((f) => f.endsWith('.js') && !f.startsWith('test-') && !f.startsWith('mesure-'))
  .sort();
ok(MODULES.length >= 40, MODULES.length + ' module(s) .js balaye(s) — pas une poignee');

ok(PAGES.length >= 3, PAGES.length + ' page(s) publique(s) balayee(s) : ' + PAGES.join(', '));
let total = 0, totalModules = 0;
const fautes = [];
for (const nom of PAGES) {
  const src = readFileSync(new URL('./' + nom, import.meta.url), 'utf8');
  const visibles = chainesVisibles(src);
  total += visibles.length;
  for (const v of visibles) {
    for (const m of MOTIFS) {
      if (m.re.test(v.t)) fautes.push({ ...v, page: nom, quoi: m.quoi });
    }
  }
}
for (const nom of MODULES) {
  const src = readFileSync(new URL('./' + nom, import.meta.url), 'utf8');
  /* ⛔ `false` : AUCUNE regle de balisage sur un module — dans du JS, `>` et `<` sont des
   *    comparaisons, et la regle remontait des commentaires entiers. Voir `chainesVisibles`. */
  const visibles = chainesVisibles(src, false);
  totalModules += visibles.length;
  for (const v of visibles) {
    for (const m of MOTIFS) {
      if (m.re.test(v.t)) fautes.push({ ...v, page: nom, quoi: m.quoi });
    }
  }
}
ok(total > 50, total + ' chaines visibles extraites des pages — pas une liste vide');
ok(totalModules > 20, totalModules + ' chaines visibles extraites des modules — pas une liste vide');

/* ══ LE NUMERO DE BUILD DIT DEUX FOIS LA MEME CHOSE ═══════════════════════════════════════════
 * ⛔⛔ TROUVE LE 2026-09-22 : l attribut `data-build` disait 20260922-0203 pendant que le texte
 *     affiche a cote disait 20260920-0174 — deux jours d ecart. L attribut est bouge a chaque
 *     deploiement parce que c est LUI que la verification en ligne lit ; le texte, que personne ne
 *     lit, ne l avait pas ete. La ligne est `hidden`, donc rien ne l a jamais signale.
 * ⛔ POURQUOI CA COMPTE MALGRE `hidden` : ce numero sert a DATER. Le jour ou quelqu un ouvre la
 *    source pour savoir quelle version tournait pendant un incident, il tombe sur deux reponses et
 *    n a aucun moyen de savoir laquelle ment. Un chiffre faux que rien n affiche ne previent pas —
 *    il attend. */
let lignesBuild = 0;
for (const nom of PAGES) {
  const src = readFileSync(new URL('./' + nom, import.meta.url), 'utf8');
  const ligne = src.match(/data-build="([^"]+)"[^>]*>[^<]*<code>([^<]+)<\/code>/);
  if (!ligne) continue;
  lignesBuild++;
  ok(ligne[1] === ligne[2],
    nom + ' : l attribut data-build et le numero affiche doivent etre le MEME — '
    + 'attribut « ' + ligne[1] + ' », affiche « ' + ligne[2] + ' »');
}
/* ⛔⛔ SANS CETTE LIGNE, LA GARDE CI-DESSUS SERAIT VERTE POUR TOUJOURS SANS RIEN GARDER. Le
 *     `continue` sur `!ligne` est un RETOUR NEUTRE : si la structure de la ligne change — un
 *     attribut insere entre `data-build` et `<code>`, un espace, `<code>` remplace par `<b>` — la
 *     regex cesse de matcher, la boucle passe, et zero assertion s execute. Vert, et aveugle.
 *     C est le motif qui nous a deja coute une garde qui ne bornait rien : on compte donc ce qui a
 *     ete REELLEMENT inspecte, et on exige que ce ne soit pas zero. */
ok(lignesBuild >= 1,
  'la ligne de build a ete TROUVEE et comparee sur ' + lignesBuild + ' page(s) — si ce compte '
  + 'tombe a zero, la regex ne reconnait plus la ligne et la garde du dessus ne garde plus rien');

ok(fautes.length === 0,
  fautes.length + ' texte(s) a l ecran a corriger :\n'
  + fautes.map((f) => '      ' + f.page + ' [' + f.ou + '] ' + f.quoi
    + '\n        « ' + f.t.slice(0, 160) + ' »').join('\n'));

/* ══ LE TEMOIN — sans lui, un detecteur qui ne detecte rien passerait aussi ═════════════════ */
{
  const faux = " · named when life is LUE (unread ≠ broken).";
  const attrape = MOTIFS.filter((m) => m.re.test(faux));
  ok(attrape.length >= 2,
    'temoin : la phrase EXACTE du 2026-09-21 declenche ' + attrape.length + ' motifs — '
    + attrape.map((m) => m.quoi).join(' · '));
  const sain = 'The biggest blocks first, by the market value we can read on chain.';
  ok(MOTIFS.every((m) => !m.re.test(sain)),
    'temoin inverse : une phrase anglaise saine n est PAS signalee a tort');
}

/* ⛔ LE RESUME NOMME LES DEUX TERRAINS. Il disait « 5 page(s), 2837 chaines » alors que 80 modules
 *    venaient d entrer dans le balayage : un compte qui tait la moitie de ce qu il couvre laisse
 *    croire que l autre moitie est regardee depuis toujours — c est exactement l illusion qui a
 *    laisse passer « Fees for Dev » et « ≈ $1 ». */
console.log('test-texte-a-l-ecran : ' + n + ' assertions · '
  + PAGES.length + ' page(s) -> ' + total + ' chaines · '
  + MODULES.length + ' module(s) .js -> ' + totalModules + ' chaines · OK');
