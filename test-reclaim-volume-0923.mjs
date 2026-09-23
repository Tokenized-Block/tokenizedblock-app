/* ⛔ LIBELLE REDIRIGE (Phil, 2026-09-23 : « retire 0.5% partout, gene de trop »).
 *    Ces controles exigeaient « Buy · 0.5% ». Ils gardaient un TAUX affiche, pas un
 *    comportement : le bouton doit exister et porter son adresse, c est tout ce qui casse
 *    l app s il disparait. Le taux, lui, reste dans le hook et dans les tests qui le lisent
 *    sur la chaine — la ou il est VERIFIABLE plutot qu affiche. */
/* ⛔ CONTROLES DE PASTILLE RETIRES (2026-09-23, demande de Phil) : ils exigeaient la presence
 *    des filtres « TB · paid » et « another launchpad », supprimes de l interface — « TB · paid »
 *    affichait 0 en permanence, et la distinction regardait NOUS, pas le lecteur.
 *    ⛔ LES CONTROLES SUR LA LOGIQUE DE PARTITION SONT GARDES plus bas : la partition existe
 *      toujours dans le code et doit rester gardee. On retire l exigence d un BOUTON, jamais
 *      celle d un COMPORTEMENT. */
/* ⛔ EPINGLE DE BUILD RETIREE (2026-09-23) : la table des chaines obligatoires contenait une
 *    entree `['tip', 'data-build="<tip>"']` — elle exigeait un numero de build PRECIS, donc elle
 *    rougissait des qu un autre agent deployait. Elle ne testait pas une fonctionnalite : elle
 *    testait que personne n avait deploye depuis. Les controles « un ANCIEN tip n est pas reste »
 *    sont LAISSES INTACTS plus bas — eux gardent vraiment quelque chose. */
import { readFileSync } from 'fs';
const h = readFileSync('./app.html', 'utf8');
const need = [
  ['tip comment', 'tip 20260923-created-history'],
  ['OL IB copy', 'no trade pays their creator'],
  ['OL IB button', 'data-tf-act="instant-birth-tb">Instant Birth on TB · 0.001 ETH</button>'],
  ['OL wire', 'OpenLaunch Feed IB reclaim'],
  ['peFrais present', 'id="peFrais"'],
  ['Prepare buy', '>Prepare buy</button>'],
  ['Prepare sell', '>Prepare sell</button>'],
  ['profile default IB', 'MAIN first paint = Instant Birth on TB'],
  ['foreign amplify', 'opens hooked market / Buy'],
  /* tip 20260923-created-history: Created = all births; partitions stay honest */
  ['Created all births', "if (liveFiltre === 'CREATION') return e.type === 'CREATION';"],
  ['TB paid partition', "liveFiltre === 'CREATION_TB') return e.type === 'CREATION' && e.paidCreate === true"],
  ['foreign partition', "liveFiltre === 'CREATION_FOREIGN') return e.type === 'CREATION' && e.paidCreate !== true"],
  ['trending gate', 'only when fee-capturable'],
  /* ⛔ LIBELLE CORRIGE LE 2026-09-23 : « Trade on TB · 0.001 ETH » figurait a cote de lignes
   *    « Buy · 0.5% », et le lecteur croyait comparer deux PRIX pour la MEME action. Or ce
   *    bouton-la n echange rien : son `data-tf-act="instant-birth-tb"` OUVRE un marche.
   *    ⛔ Le controle reste : le bouton de repli doit exister et porter son prix. Ce qui change,
   *      c est qu il doit maintenant dire ce qu il FAIT. */
  /* ⛔⛔ LE REPLI DE TRENDING A CHANGE DE NATURE LE 2026-09-23, et l ancien controle exigeait un
   *     texte FAUX. Il disait « Open its market · 0.001 ETH » sur des lignes qui affichent juste a
   *     cote leur volume 24 h, leur liquidite et leur nombre d echanges : ces blocks ONT un marche.
   *     Ce que le repli voulait dire, c est « leur marche n est pas sur notre hook » — ca nous
   *     regarde, pas le lecteur. Phil : « ca sert a rien ».
   *     ⇒ Le repli propose desormais l APPAIRAGE, qui est un geste reel et dont le marche naissant
   *       est sur notre hook. Le controle suit, et il exige en plus que le bouton porte l adresse :
   *       un bouton d appairage sans adresse ne pourrait rien appairer. */
  ['trending repli = appairer', 'Pair a block with it'],
  ['trending repli porte l adresse', 'data-pairer="'],
  ['appairage = une seule fonction', 'function pairerAvec(adr)'],
  ["etape('achat')", "etape('achat')"],
];
for (const [label, s] of need) {
  if (!h.includes(s)) throw new Error('missing ' + label + ': ' + s.slice(0, 100));
}
if (h.includes("liveFiltre === 'CREATION') return e.type === 'CREATION' && e.paidCreate === true")) {
  throw new Error('Created still paid-only');
}
if (h.includes('id="peFrais" hidden style="display:none"')) throw new Error('peFrais still display:none');
if (h.includes('Fees for Dev')) throw new Error('Fees for Dev');
const ui = h.match(/<(?:button|a|span|b|p)[^>]*>[^<]*a6cf[^<]*</gi) || [];
if (ui.length) throw new Error('a6cf in UI: ' + ui.join('|'));
if (h.includes('data-build="20260923-reclaim-volume"')) throw new Error('old reclaim tip left');
if (h.includes('data-build="20260923-wallet-intent-market"')) throw new Error('old wallet-intent tip left');
console.log('ok reclaim-guards-on-created-history');
