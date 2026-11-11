/* test-un-frais-par-jambe-route-mixte.mjs — SUR UNE ROUTE BLOCK -> ACTION, LE FRAIS EST PRIS UNE
 * SEULE FOIS.
 *
 * ⭐ LA ROUTE QUI COMPTE, trouvee le 2026-10-02 avec les fonctions de `multipool.js` :
 *      TBLOCK -[v4 + notre hook]-> ETH -[uniswap-v3]-> USDC -[slipstream]-> AAPLc
 *    Trois sauts, UNE transaction, traversant les deux mondes (PoolManager V4 pour nos pools
 *    hookees, et les factories CL pour les actions tokenisees). C est la reponse a « tout doit etre
 *    connecte entre les actions tokenisees et b20 native » — pour l ECHANGE.
 *    ⛔ PAS POUR LA NAISSANCE : `multipool.js` ne contient ni `initialize`, ni `createPool`, ni
 *      `modifyLiquidity`, ni `deviseAdmise`. Il ROUTE. Pairer un block neuf contre une action exige
 *      un hook qui l admette, et la liste du V8 est FIGEE dans son bytecode (aucun setter, mesure du
 *      2026-10-02). Les deux problemes sont distincts, et je les ai confondus une fois aujourd hui.
 *
 * ⛔⛔ LE DEFAUT QUE CE BANC GARDE : le DOUBLE FRAIS sur une route mixte. La jambe 1 passe par notre
 *   pool hookee — le hook y preleve deja. Si le routeur prelevait AUSSI, l utilisateur paierait deux
 *   fois sur un seul swap. Zero 1 a mesure exactement ca sur TBLOCK/SPCXc : hook 4 975 + routeur
 *   5 000. La regle correcte n est donc ni « toujours prendre » ni « jamais prendre » :
 *      toutes les jambes hookees -> 0 PAY_PORTION et 0 TRANSFER
 *      route MIXTE              -> 0 PAY_PORTION et 0 TRANSFER  (« une fois par swap », Phil 2026-10-02 :
 *                                  le hook a deja paye a6cf ; avant : 1 PAY_PORTION sur les jambes nues)
 *      route sans aucun hook    -> EXACTEMENT 1 PAY_PORTION
 *
 * ⛔ ET J AI MAL LU CETTE REGLE AVANT DE L ECRIRE. Ma sonde affichait
 *   `noeudsJambesRouteur(...)` sous l etiquette « jambes ou le ROUTEUR prend » : la fonction rend des
 *   indices de NŒUDS ou le frais peut se PLACER, et elle en rendait 3. J ai cru voir un triple
 *   prelevement. Un chiffre juste sous une etiquette fausse est une erreur de lecture qui attend son
 *   lecteur — d ou ce banc, qui juge la REGLE et pas mon affichage.
 *
 * ⚠️ CE QUE CE BANC NE PROUVE PAS : que ces pools existent, ni qu elles portent de la liquidite. Les
 *   aretes sont DECLAREES. Il garde la REGLE du frais sur la forme de route, pas le marche.
 */
import { HOOK_V8, ensembleHooksFacturants, cheminsCandidats, areteValide, CMD, ADRESSES,
  unFraisParJambe, routeEntierementFactureeParHook, routeFactureeParHook } from './multipool.js';
import { TBLOCK, TBLOCK_TEST_ANCIEN } from './tokenomics.js'; /* game354: TBLOCK = the real token; the registry entry below is the OLD test token */
import { TTB } from './origine.js';
import { pairesProposees, proposableEnEchange, DEVISES_BASE } from './paires.js';

let n = 0, ko = 0;
const ok = (nom, cond, vu) => {
  n += 1;
  if (cond) { console.log('  ok  ' + nom); return true; }
  ko += 1; console.log('  KO  ' + nom + (vu === undefined ? '' : '\n        vu: ' + vu));
  return false;
};
const bas = (x) => String(x || '').toLowerCase();
const ETH = '0x0000000000000000000000000000000000000000';
const WETH = bas(ADRESSES.WETH);
const parSym = new Map(pairesProposees(8453).map((x) => [x.symbole, bas(x.adr)]));
const USDC = parSym.get('USDC'), AAPL = parSym.get('AAPLc');

/* ⛔⛔⛔ LE SUJET DE CE BANC EST « N IMPORTE QUEL B20 », PAS NOTRE JETON. Raksha, 2026-10-02 :
 *      « le TBLOCK doit etre tt les autres b20 possible — pas le notre TBLOCK token ».
 *      Ma premiere version prenait `TBLOCK` comme point de depart : c est precisement le jeton qu il
 *      a fait RETIRER des echanges le 2026-09-24 (« le coin n est pas reellement lance au public »).
 *      `paires.js` le filtre par `proposableEnEchange`, et `echange.js` porte deux fois
 *      `marche.paire !== 'TBLOCK'`. Mon banc prouvait donc une route pour le SEUL jeton que l app
 *      refuse de router — et en faisait l exemple canonique, ce qui le ramenait par la porte des
 *      tests.
 *   ⇒ ON PART DE TTB, un block de genese reel qui n est pas le notre, ET on verifie que la route
 *     ne depend d AUCUNE adresse particuliere : la meme forme doit etre trouvee pour un B20
 *     quelconque. Une route qui ne marcherait que pour un jeton nomme serait un cas special deguise
 *     en regle. */
const BLOCK = bas(TTB);
const B20_QUELCONQUE = '0xb2000000000000000000001111111111111111ff';

const ADR = /^0x[0-9a-f]{40}$/;
ok('0. les adresses du test sont toutes resolues',
  [BLOCK, USDC, AAPL, WETH].every((a) => ADR.test(a)),
  JSON.stringify({ BLOCK, USDC, AAPL, WETH }));
/* ⛔ ET LE SUJET N EST PAS NOTRE JETON. Si quelqu un remet TBLOCK ici, ce banc rougit. */
ok('0b. ⭐ le block de depart n est PAS notre TBLOCK (ni le vrai ni l ancien de test)', BLOCK !== bas(TBLOCK) && BLOCK !== bas(TBLOCK_TEST_ANCIEN), BLOCK);
/* ⛔⛔ ET LA DECISION PRODUIT EST GARDEE A SA SOURCE : TBLOCK reste hors des echanges. Sans cette
 *    assertion, le filtre pourrait sauter sans que rien ne crie — et le jeton reviendrait dans une
 *    liste que personne ne relit. */
/* ⛔⛔ ON TESTE L ENTREE REELLE DU REGISTRE, PAS UN OBJET NU — et ma premiere version s est trompee
 *    de sujet. `proposableEnEchange({ symbole: 'TBLOCK' })` rend `true`, et c est VOULU : le filtre
 *    est FAIL-OPEN par conception (une entree sans drapeau reste proposable, sinon les dizaines
 *    d entrees existantes disparaitraient). Il juge `lancePubliquement`, pas le symbole.
 *    L entree reelle porte `lancePubliquement: false` et le filtre rend bien `false`.
 *  ⛔ J avais donc accuse le code pour une faute de MON assertion — et les deux moitiees etaient
 *    dans un seul `&&`, ce qui rendait le message illisible : on ne savait pas laquelle tombait.
 *    Une conjonction qui echoue ne dit pas QUI a echoue. Separees. */
const entreeTblock = (DEVISES_BASE || []).find((x) => bas(x.adr) === bas(TBLOCK_TEST_ANCIEN)); /* game354: the registry entry is the OLD token, symbol oldTBLOCK */
ok('0c. TEMOIN — l entree TBLOCK existe dans le registre', !!entreeTblock,
  entreeTblock ? 'trouvee' : 'absente du registre');
ok('0d. ⛔ …et elle porte `lancePubliquement: false`',
  !!entreeTblock && entreeTblock.lancePubliquement === false);
ok('0e. ⛔ le filtre la refuse sur l entree REELLE',
  !!entreeTblock && proposableEnEchange(entreeTblock) === false);
ok('0f. ⛔⛔ TBLOCK est donc ABSENT des paires proposees (decision de Raksha, 2026-09-24)',
  !pairesProposees(8453).some((p) => bas(p.adr) === bas(TBLOCK)));

const v4 = (a, b, fee) => {
  const [c0, c1] = bas(a) < bas(b) ? [bas(a), bas(b)] : [bas(b), bas(a)];
  return { venue: 'uniswap-v4', liqUsd: 1000,
    cle: { currency0: c0, currency1: c1, fee, tickSpacing: 60, hooks: bas(HOOK_V8) } };
};
const v4SansHook = (a, b, fee) => {
  const e = v4(a, b, fee);
  return { ...e, cle: { ...e.cle, hooks: ETH } };
};
const v3 = (a, b, fee) => ({ venue: 'uniswap-v3', liqUsd: 1000,
  token0: bas(a) < bas(b) ? bas(a) : bas(b), token1: bas(a) < bas(b) ? bas(b) : bas(a), fee });
const cl = (a, b, tickSpacing) => ({ venue: 'aerodrome-cl', liqUsd: 1000,
  token0: bas(a) < bas(b) ? bas(a) : bas(b), token1: bas(a) < bas(b) ? bas(b) : bas(a),
  tickSpacing, factory: 2 });

/* ⛔ CHAQUE ARETE EST VALIDEE AVANT DE ROUTER. Une arete rejetee en silence rendrait « aucun
 *   chemin » pour une raison de FORME, jamais de marche — c est l erreur que j ai faite d abord :
 *   j avais mis un `cle` sur les aretes v3 et CL, qui veulent `token0`/`token1`. */
const MIXTE = [v4(BLOCK, ETH, 3000), v3(WETH, USDC, 500), cl(USDC, AAPL, 100)];
ok('1. les trois aretes de la route mixte sont valides', MIXTE.every(areteValide),
  JSON.stringify(MIXTE.filter((e) => !areteValide(e)).map((e) => e.venue)));

const hooks = ensembleHooksFacturants();
ok('2. notre hook V8 est bien dans l ensemble des hooks facturants', hooks.has(bas(HOOK_V8)));

/* ── LA ROUTE EXISTE ────────────────────────────────────────────────────────────────────────── */
const chemins = cheminsCandidats(MIXTE, BLOCK, AAPL, { sautsMax: 3, max: 12 });
ok('3. ⭐ une route block -> action existe en 3 sauts', chemins.length > 0, chemins.length + ' chemin(s)');
/* ⛔ TEMOIN NEGATIF : une cible sans arete ne doit rendre AUCUN chemin, sinon le routeur invente. */
const PYPL = parSym.get('PYPLc');
ok('4. TEMOIN NEGATIF — une cible non connectee ne rend aucun chemin',
  cheminsCandidats(MIXTE, BLOCK, PYPL, { sautsMax: 3, max: 12 }).length === 0);
const route = chemins[0] || [];
ok('5. …et elle fait bien 3 sauts', route.length === 3, route.length + ' saut(s)');
/* ⛔⛔⛔ LA ROUTE NE DOIT DEPENDRE D AUCUNE ADRESSE PARTICULIERE — c est la demande de Raksha : « tous
 *      les autres b20 possible ». On rejoue la MEME forme avec un B20 quelconque : si elle ne sort
 *      pas, c est que quelque chose est cable sur un jeton nomme, et la regle serait un cas special
 *      deguise. */
const MIXTE_Q = [v4(B20_QUELCONQUE, ETH, 3000), v3(WETH, USDC, 500), cl(USDC, AAPL, 100)];
const cheminsQ = cheminsCandidats(MIXTE_Q, B20_QUELCONQUE, AAPL, { sautsMax: 3, max: 12 });
ok('5b. ⭐ la MEME route sort pour un B20 quelconque : rien n est cable sur un jeton nomme',
  cheminsQ.length === chemins.length && (cheminsQ[0] || []).length === 3,
  cheminsQ.length + ' chemin(s), ' + (cheminsQ[0] || []).length + ' saut(s)');
/* ⛔ ET LA REGLE DU FRAIS NE CHANGE PAS NON PLUS SELON LE JETON. */
ok('5c. ⭐ …et la regle du frais y rend le meme verdict',
  routeFactureeParHook(cheminsQ[0] || [], ensembleHooksFacturants()) === true
  && routeEntierementFactureeParHook(cheminsQ[0] || [], ensembleHooksFacturants()) === false);

/* ── LA CLASSIFICATION DE LA ROUTE ──────────────────────────────────────────────────────────── */
ok('6. ⭐ la route est MIXTE : au moins une jambe hookee, mais pas toutes',
  routeFactureeParHook(route, hooks) === true
  && routeEntierementFactureeParHook(route, hooks) === false);

/* ── LA REGLE DU FRAIS, SUR LES TROIS FORMES ────────────────────────────────────────────────── */
/* ⛔⛔ ON JUGE `unFraisParJambe`, PAS MON AFFICHAGE. Et on lui donne des transactions FABRIQUEES :
 *    la fonction est une GARDE AVANT ENVOI, donc son travail est de refuser une tx mal formee. */
const tx = (...commandes) => ({ commandes });
ok('7. ⭐ route MIXTE (une fois par swap) : ZERO PAY_PORTION est accepte — le hook a deja paye a6cf',
  unFraisParJambe(tx(CMD.V3_SWAP_EXACT_IN, CMD.SWEEP), route, hooks) === true);
ok('8. ⛔ route MIXTE : UN PAY_PORTION est REFUSE — ce serait un 2e frais sur le meme swap',
  unFraisParJambe(tx(CMD.V3_SWAP_EXACT_IN, CMD.PAY_PORTION, CMD.SWEEP), route, hooks) === false);
ok('9. ⛔⛔ route MIXTE : DEUX PAY_PORTION est REFUSE — c est le DOUBLE FRAIS',
  unFraisParJambe(tx(CMD.PAY_PORTION, CMD.V3_SWAP_EXACT_IN, CMD.PAY_PORTION), route, hooks) === false);
/* ⛔ ET LA PART SEPAREE EST REFUSEE SUR UNE ROUTE MIXTE : un TRANSFER en plus du PAY_PORTION serait
 *   un second prelevement sous un autre nom. */
ok('10. ⛔ route MIXTE : un PAY_PORTION + un TRANSFER est REFUSE',
  unFraisParJambe(tx(CMD.PAY_PORTION, CMD.TRANSFER), route, hooks) === false);

/* ── LES DEUX AUTRES FORMES DE ROUTE ────────────────────────────────────────────────────────── */
const TOUT_HOOK = [v4(BLOCK, ETH, 3000)];
const rHook = cheminsCandidats(TOUT_HOOK, BLOCK, ETH, { sautsMax: 1, max: 4 })[0] || [];
ok('11. TEMOIN — une route d une jambe hookee est trouvee', rHook.length === 1, rHook.length);
ok('12. ⭐ route ENTIEREMENT hookee : zero PAY_PORTION, zero TRANSFER',
  routeEntierementFactureeParHook(rHook, hooks) === true
  && unFraisParJambe(tx(), rHook, hooks) === true);
ok('13. ⛔ …et un seul PAY_PORTION y est REFUSE : ce serait doubler le frais du hook',
  unFraisParJambe(tx(CMD.PAY_PORTION), rHook, hooks) === false);

const SANS_HOOK = [v4SansHook(BLOCK, ETH, 3000)];
const rNu = cheminsCandidats(SANS_HOOK, BLOCK, ETH, { sautsMax: 1, max: 4 })[0] || [];
ok('14. TEMOIN — une route sans hook facturant est trouvee', rNu.length === 1, rNu.length);
ok('15. ⭐ route SANS hook : exactement un PAY_PORTION, et zero est refuse',
  routeFactureeParHook(rNu, hooks) === false
  && unFraisParJambe(tx(CMD.PAY_PORTION), rNu, hooks) === true
  && unFraisParJambe(tx(), rNu, hooks) === false);

console.log('');
console.log(n + ' assertions, ' + ko + ' KO');
console.log('   La route <un B20> -> ETH -> USDC -> AAPLc existe en 3 sauts, et le frais y est pris');
console.log('   UNE fois par swap : par le hook s il y en a un, sinon par le routeur — jamais les deux.');
console.log('⚠️ NE PROUVE PAS que ces pools existent ni qu elles soient liquides : les aretes sont');
console.log('   DECLAREES. Ce banc garde la REGLE du frais selon la forme de la route.');
console.log('⛔ ET NE PROUVE RIEN SUR LA NAISSANCE : pairer un block contre une action exige un hook');
console.log('   qui l admette, et la liste du V8 est figee. Echange et naissance sont deux problemes.');
process.exit(ko ? 1 : 0);
