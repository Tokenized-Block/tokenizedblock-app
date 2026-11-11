// paires.js — avec quoi un block peut etre paire au lancement : ETH, USDC, une action, ou un jeton.
// ================================================================================================
// ⛔⛔ PAIRER = CHOISIR LA DEVISE DE COTATION DE LA POOL. Mesure du 2026-09-09 sur trois launches
//    OpenLaunch : la paire EST la devise contre laquelle la pool s ouvre (ETH, GITLAWB, COINc, AAPLc).
//    Aucune magie de plus — et donc aucune promesse de plus a l ecran.
//
// ⛔⛔ DECISION DE PHIL, 2026-09-12 : « le paired, tu peux choisir un stock dispo via Coinbase, ou un
//    token qu ils veulent ». L ANCIEN ecran refuse les actions (et renvoie vers OpenLaunch) ; ce
//    module ne le contredit pas en silence — il sert le NOUVEL ecran, et l ancien reste tel quel.
//
// ⛔ UNE ADRESSE N EST JAMAIS APPELEE « ACTION » SI ELLE N EST PAS DANS LE REGISTRE. Le registre est
//    RECOPIE de `index.html` (STOCKS_BASE_REGISTRY, liste publiee des emetteurs Coinbase B20), et
//    `test-paires.mjs` le compare au fichier. Un ticker invente mettrait l argent de quelqu un dans
//    un jeton que personne n a verifie.
//
// ⛔ UN JETON SAISI A LA MAIN EST DIT « TYPED BY YOU, NOT VERIFIED ». On l accepte (Phil le veut), on
//    ne le blanchit pas : ni nom, ni logo, ni etiquette empruntes.

export const ETH_NATIF = '0x0000000000000000000000000000000000000000';

/** Les devises « de base ». ⛔ Adresses recopiees de `DEVISES` dans index.html. */
/** ⛔ game354 (Phil 2026-11-11): this is the OLD test token named TBLOCK (created by the app, block 51,260,745), NOT the real TBLOCK
 *  (0xb200…ba9bf8330307f8830e, tokenomics.TBLOCK). Kept under this name only for the legacy hook routing below; never proposed, never
 *  named "TBLOCK" on screen. The real TBLOCK cannot quote a new block: neither the V8 nor the 7030 hook lists it (both lists immutable). */
export const TBLOCK_MAINNET = '0xb20000000000000000000024c30d3fcb7931272e';

/* ⛔⛔ ETH D ABORD (Phil, 2026-09-18 : « la pool sur ETH par defaut, oublie le TBLOCK paired — gros
 *    probleme »). Un block paire a TBLOCK ne s achete QU avec du TBLOCK, qu un nouvel utilisateur n a
 *    pas : son propre block lui etait inachetable des la naissance. L ordre de cette liste est le premier
 *    choix montre a l ecran — ETH en tete, TBLOCK reste disponible mais n est plus « le standard ». */
export const DEVISES_BASE = [
  { adr: ETH_NATIF, symbole: 'ETH', nom: 'Ether (native) — recommended', type: 'NATIF', chaines: [8453, 84532] },
  { adr: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbole: 'USDC', nom: 'USD Coin', type: 'STABLE', chaines: [8453] },
  /* cbBTC : adresse lue sur Blockscout (« Coinbase Wrapped BTC », 623 614 detenteurs, 8 decimales) — les homonymes sont des imitations */
  { adr: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', symbole: 'cbBTC', nom: 'Coinbase Wrapped BTC', type: 'MAJEUR', chaines: [8453] },
  /* ⛔⛔ `lancePubliquement: false` — DECISION DE PHIL, 2026-09-24 : « retirer le TBLOCK de la, car
   *     le coin est pas reellement lance au public ». Il le disait du selecteur « From » du Swap.
   *   ⇒ MESURE QUI VA DANS LE MEME SENS, faite le meme jour : TBLOCK fait partie des 7 jetons
   *     detenus par le wallet de frais, et AUCUN des 7 n a de marche vivant (croise avec les 268
   *     marches suivis). Proposer TBLOCK comme monnaie d echange, c est proposer d echanger quelque
   *     chose qui ne s echange pas.
   *   ⛔ Le jeton RESTE dans cette liste : d autres ecrans s en servent legitimement, et le retirer
   *     d un coup casserait les blocks deja cotes en TBLOCK. C est le drapeau qui le retire des
   *     endroits ou on PROPOSE un echange. */
  { adr: TBLOCK_MAINNET, symbole: 'oldTBLOCK', nom: 'the OLD test TBLOCK — not the real TBLOCK', type: 'TBLOCK', chaines: [8453], lancePubliquement: false },
  /* game354 (series red, test-symbole-trompeur): the REAL TBLOCK, KNOWN under its own name so the name guard can tell a fake TBLOCK from
   *   it — never PROPOSED (no launch hook lists it: V8 and 7030 are immutable). Copied from tokenomics.TBLOCK (no import: tokenomics
   *   imports this file); test-tblock-reel checks the two are equal. */
  { adr: '0xb200000000000000000000ba9bf8330307f8830e', symbole: 'TBLOCK', nom: 'TBLOCK — the holders token', type: 'TBLOCK', chaines: [8453], lancePubliquement: false },
  /* ⛔⛔ TOSHI, AJOUTE LE 2026-09-27 (Phil : « ajoute Toshi »), ET *PAS* COMME UN B20.
   *     L adresse a ete RESOLUE par l API DexScreener, jamais rappelee de memoire — completer une
   *     adresse de tete a deja envoye une enquete entiere sur une fausse piste dans ce projet.
   *   ⛔⛔ CE QU IL EST, TECHNIQUEMENT, avec temoin positif le meme jour :
   *         TOSHI  `eth_getCode` = 0x608060405260… (23 898 caracteres de bytecode ordinaire)
   *         TBLOCK `eth_getCode` = 0xef  ← le marqueur B20, EXACTEMENT
   *       TOSHI n a pas le prefixe `0xb2` et n est donc PAS un B20. On ne l affichera JAMAIS comme
   *       tel — ce serait l usurpation que ce depot chasse ailleurs. Type MAJEUR, rang de cbBTC.
   *   ⛔ MAIS CETTE DISTINCTION EST INTERNE, ET N A RIEN A FAIRE DANS LE NOM QUE L UTILISATEUR LIT.
   *     Le produit, c est qu on rend N IMPORTE QUEL actif en block : les actions tokenisees sont
   *     exactement ca. Coter un block en TOSHI est donc le concept, pas une exception a excuser.
   *     Un libelle « not a B20 » dans un selecteur de paire repond a une question que personne ne
   *     se pose et jette un doute la ou il n y en a pas.
   *   ✅ CE QUI JUSTIFIE SA PRESENCE : un marche REEL, mesure le jour meme — 1 230 755 $ de
   *     liquidite sur Uniswap. C est la seule chose qui compte pour une devise de paire : qu on
   *     sache lire son prix, et qu il y ait de quoi echanger en face. */
  { adr: '0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4', symbole: 'TOSHI', nom: 'Toshi — quote your block in TOSHI', type: 'MAJEUR', chaines: [8453] },
  /* ⛔⛔ OUSD, AJOUTE LE 2026-09-30 (Phil : « on ajoute au marche si c est le B20 qui est
   *     autorise »), ET IL EST LE SEUL STABLECOIN INSTITUTIONNEL QUI PASSE NOTRE PROPRE REGLE.
   *   ⛔ ADRESSE COPIEE de l annonce de l emetteur, jamais rappelee de memoire.
   *   ✅ CE QU IL EST, MESURE LE JOUR MEME, avec temoin :
   *        OUSD  `eth_getCode` = 0xef  ← le marqueur B20, EXACTEMENT
   *        USDC  `eth_getCode` = 1852 octets de bytecode ordinaire — PAS un B20
   *      symbol() « OUSD » · name() « OpenUSD » · decimals() 6 · supply 15 000 528,32
   *      Emis par Bridge (Stripe). C est ce qui le rend appairable SANS exception : la regle de
   *      Raksha du 2026-09-15 (« custom pair must prove native B20, no ERC-20 sprawl ») l admet
   *      de plein droit, la ou USDC n est present que par cette liste blanche.
   *   ✅ ET IL A UN MARCHE REEL — la seule chose qui compte pour une devise de paire, comme
   *      ecrit pour TOSHI juste au-dessus. Mesure DexScreener du 2026-09-30 :
   *        OUSD/USDC  Uniswap  liquidite 9 999 561 $   volume 24 h 5 234 $
   *        OUSD/ETH   Uniswap  liquidite       289 $   volume 24 h     0 $
   *      Huit fois la liquidite qui avait justifie TOSHI (1 230 755 $).
   *   ⚠️⚠️ DEUX RESERVES QUI VOYAGENT AVEC LUI, et qui ne sont pas des details :
   *      1. ⛔⛔ CE CHIFFRE ETAIT PERIME D UN FACTEUR 35, ET IL DECOURAGEAIT D UN MARCHE QUI EXISTE.
   *         J avais ecrit « LE VOLUME EST MINUSCULE (5 234 $) » le matin du 2026-09-30. Re-mesure
   *         le soir, sur notre propre `/api/trending` : OUSD fait 181 424 $ de volume 24 h et
   *         1 476 trades. Les chiffres pourrissent, et une reserve perimee ne devient pas
   *         inoffensive en vieillissant : elle continue de dire « n y va pas ».
   *         ⭐ ET CINQ BLOCKS SONT DEJA COTES EN OUSD, mesure le meme soir :
   *              OHUSD      169 381 $ / 24 h · 1 371 trades
   *              OUCAT        3 613 $ ·  30 trades
   *              FIRSTOUSD    2 238 $ ·  31 trades
   *              DANGEROUSD     105 $ ·   2 trades
   *              OBC             26 $ ·   2 trades
   *            Des gens lancent DEJA chez nous contre OUSD. La reserve qui reste vraie n est donc
   *            pas « il n y a pas de marche » mais celle du point 2 : notre routage ne l atteint pas.
   *         ⚠️ CE QUI RESTE VRAI DU DOUTE D ORIGINE : OUSD est ne le 2026-09-30. Cinq jours
   *            d activite ne font pas une tendance, et les cinq lignes ci-dessus sont dominees par
   *            UNE SEULE (OHUSD porte 93,4 % du volume des blocks cotes en OUSD). Un marche
   *            concentre sur un block peut disparaitre avec lui.
   *      2. LA POOL OUSD/ETH EST VIDE (289 $). Toute route qui passerait par ETH -> OUSD taperait
   *         dans le vide ; la profondeur est du cote USDC. Un routeur qui l ignore rendrait un
   *         devis catastrophique — a traiter quand le multi-saut le prendra en compte.
   *
   *   ⭐⭐ OU EST CETTE POOL, EXACTEMENT — LU SUR LA CHAINE LE 2026-09-30 AU SOIR.
   *      Les chiffres ci-dessus venaient de DexScreener, qui dit « Uniswap » sans dire LEQUEL.
   *      La chaine dit lequel, et avec quelle cle :
   *        Uniswap V4  poolId 0xdf5bde0fc414fcd1f803c9d1b52ebbb4db5982d8dca5316ae06b467e06fc429a
   *                    currency0 USDC · currency1 OUSD · fee 100 · tickSpacing 1 · hooks 0x0
   *                    tick -1  =>  1 USDC = 0,999999 OUSD — AU PAIR
   *        decimales LUES, jamais supposees : OUSD 6, USDC 6 (un decalage aurait inverse le prix)
   *      Temoin positif du lecteur : ETH/USDC rend 4 pools sur les memes cles. Il discrimine.
   *
   *   ⛔⛔ CE QUI DECIDE SI ON PEUT L ATTEINDRE, C EST LA FACTORY, PAS LA PROFONDEUR.
   *      `planEthVersAction` fait WETH -> USDC -> action -> block en UN SEUL `exactInput`, et un
   *      `exactInput` ne traverse que les pools de SA factory — c est la frontiere qui ne laisse
   *      passer que 13 blocks sur 123. Mesure sur les NEUF espacements que la factory Aerodrome
   *      DECLARE (`espacements-cl.js`), 0 non mesure :
   *        USDC/WETH   3 pools Aerodrome CL   <- temoin positif
   *        AAPLc/USDC  2 pools Aerodrome CL   <- temoin : une action tokenisee EN A
   *        OUSD/USDC   0 pool Aerodrome CL
   *        OUSD/ETH    0 pool Aerodrome CL
   *      ⇒ OUSD n est PAS dans la situation des actions tokenisees : il est dans celle des 110
   *        blocks refuses par ce chemin. Sa profondeur est reelle, mais sur une AUTRE factory.
   *      ✅ ET LA ROUTE EXISTE SUR L AUTRE JAMBE : ETH -> USDC -> OUSD tient ENTIEREMENT dans
   *        Uniswap V4 — une seule factory, donc franchissable en un seul `exactInput`. C est
   *        `calldata-v3.js` / `echange-v3.js` (Universal Router) qui la portent.
   *
   *   ⇒ DECISION DE PHIL (2026-09-30) : « garde pool uniswap aussi », « multi pool ». Donc OUSD
   *     RESTE propose, et c est la jambe Uniswap qu on cable — pas OUSD qu on retire. Le choix est
   *     coherent avec la mesure : la profondeur est reelle et au pair, c est notre routage qui
   *     etait borne a une seule factory.
   *     ⛔ ET TANT QUE CETTE JAMBE N EST PAS CABLEE POUR OUSD, un visiteur qui tient de l ETH ne
   *       peut pas acheter un block cote en OUSD par notre interface. Ce n est pas une opinion,
   *       c est la consequence directe des quatre lignes de mesure ci-dessus, et ca doit rester
   *       ecrit ici jusqu a ce que ce soit faux.
   *     ⚠️ POURQUOI OUSD NE PREND PAS LE DRAPEAU DE TBLOCK, dans les deux sens : TBLOCK porte
   *       `lancePubliquement: false` parce qu il n a de marche NULLE PART. OUSD en a un vrai, au
   *       pair, 10 M$ — mais sur la factory que notre chemin d achat ne traversait pas. Les deux
   *       cas se ressemblent a l ecran et ne se ressemblent pas sur la chaine.
   *
   *   ⛔ DEUX FAUTES A MOI DANS CETTE MESURE MEME, parce que la methode compte autant que le
   *     resultat :
   *      · ma premiere sonde ne testait que CINQ espacements (1, 50, 100, 200, 2000) et imprimait
   *        « 0 pool » — ce qui se lit « aucune pool n existe ». Il en manquait QUATRE des neuf
   *        declares (10, 80, 150, 500), et mon temoin positif lui-meme etait sous-compte (2 au lieu
   *        de 3). C est la faute qui avait deja rendu 49,8 % du volume invisible. Les espacements
   *        se LISENT dans `espacements-cl.js`, jamais a la main.
   *      · avant ca, un appel POSITIONNEL a `calldataGetPool` (qui prend un OBJET) rendait
   *        `tokenA: undefined` : cinq refus, pas un seul appel envoye, et mon compteur affichait
   *        encore « 0 pool ». Ce qui m a sauve, c est que `calldataGetPool` rend un REFUS NOMME au
   *        lieu d une valeur neutre. Un `null` m aurait fait publier « OUSD inatteignable ».
   *
   *   ⛔ CE QUE JE N AI PAS VERIFIE, ET QUI N EST DONC PAS UN ARGUMENT :
   *      · que le prefixe `0xB2` et le marqueur `0xef` signifient la MEME fabrique que nos blocks.
   *        Meme format ne veut pas dire meme emetteur ni meme semantique — c est exactement
   *        `b20-prefix-impersonation` : le code prouve le FORMAT, pas la parente ;
   *      · les reserves BlackRock/BNY/Lead Bank viennent de la page de l emetteur, pas d une
   *        mesure. Les attestations mensuelles sont a reserves.bridge.xyz/ousd ;
   *      · le programme de « rewards proportional to the supply and activity » d Open Standard
   *        vient de leur page aussi. C est une PISTE de revenu, pas un revenu : aucun montant,
   *        aucun bareme, aucune inscription faite. Ne pas l ecrire comme acquis. */
  { adr: '0xB2000000000000000000002fEb517dFeC7415344', symbole: 'OUSD', nom: 'Open USD — quote your block in OUSD', type: 'STABLE', chaines: [8453] },
];

/**
 * Peut-on PROPOSER d echanger cet actif ? Un actif sans marche public ne se propose pas : le
 * choisir menerait a un echange impossible, decouvert apres coup.
 * ⛔ FAIL-OPEN ASSUME ET EXPLIQUE : l absence de drapeau vaut « lance ». Les dizaines d entrees
 *   existantes (ETH, USDC, cbBTC, actions) n en portent pas, et exiger le drapeau les ferait TOUTES
 *   disparaitre des listes d echange — un vide total serait bien pire que le defaut corrige. Seul
 *   ce qui est explicitement marque non lance est retire.
 */
export function proposableEnEchange(p) {
  return !(p && p.lancePubliquement === false);
}

/** ⛔ RECOPIE de STOCKS_BASE_REGISTRY (index.html). Un test compare les deux listes, adresse par adresse. */
export const ACTIONS_COINBASE = [
  /* ⛔⛔ COINc, CRCLc ET INTCc ONT ETE RETIRES LE 2026-09-27, ET UNE MESURE L A DECIDE. Les treize
   *     adresses ont ete interrogees sur la chaine : les treize EXISTENT, les treize sont des B20
   *     natifs (`0xef` EXACTEMENT) et les treize symboles concordent avec ce qu on annonce — ma
   *     suspicion de depart (« le prefixe `0xb2…` est imitable, ce sont peut-etre des homonymes »)
   *     etait INFONDEE. Mais CES TROIS-LA ONT UNE SUPPLY EXACTEMENT NULLE. Les dix autres
   *     circulent : NVDAc 19 486 · SPCXc 11 359 · MSTRc 8 632 · GOOGLc 8 005 · AMZNc 7 667 ·
   *     AAPLc 6 966 · TSLAc 4 115 · METAc 4 106 · MSFTc 2 452 · SNDKc 616.
   *   ⇒ Pairer un block neuf a un jeton sans une seule unite en circulation ouvre une pool contre
   *     du VIDE : elle ne pourra JAMAIS s echanger. Ce n est pas un mauvais choix, c est un choix
   *     impossible. Decision de Phil : « retire COINc CRCLc INTCc de la liste ».
   *
   * ⛔ CE N EST PAS LA MEME RAISON QUE LA POLITIQUE DES PUCES, et la confusion serait facile a
   *   faire. Les puces ecartent CINQ actions (ces trois + MSTRc + SNDKc) parce qu elles n ont AUCUN
   *   PRIX LISIBLE — mesure du 2026-09-25 — et la regle y est « on ne retire pas un choix, on
   *   arrete seulement de pousser vers un cul-de-sac ». Ici la raison est autre : un jeton sans
   *   supply n est pas un choix difficile, c est un choix VIDE. MSTRc et SNDKc RESTENT donc dans la
   *   liste — ils existent et circulent, ils n ont simplement pas de prix cote.
   *
   * ⛔ ET LA GARDE ON-CHAIN RESTE LA VRAIE PROTECTION. Cette liste est une PHOTO : une supply peut
   *   tomber a zero demain sur n importe laquelle des dix restantes, et la liste ne le saurait pas.
   *   `majPaire` lit donc la supply a chaque choix. Retirer ces trois entrees evite de PROPOSER une
   *   impasse ; c est la garde qui empeche d y ENTRER. */
  /* ── QUATRE AJOUTS DU 2026-09-28, ET LE COMPTE FERME ─────────────────────────────────────────
   * ⛔⛔ CINQ ETAIENT ANNONCEES (MUc, MRVLc, BEc, HIMSc, AVGOc) ; QUATRE PASSENT. MRVLc n a pas de
   *     pool v3/CL a prouver — elle est parmi les 82 candidates qui n existent qu en pool v4, donc
   *     ni son prix ni sa provenance ne se lisent par notre chemin. L annoncer serait proposer un
   *     choix qu on ne sait pas servir.
   * ⛔⛔ ET LA DECOUVERTE MENTAIT AVANT D ETRE CORRIGEE : le script portait un `.slice(0, 40)` sur
   *     86 candidats tout en imprimant « aucun silence ». 46 n etaient jamais regardes, et leur
   *     absence du tableau se lisait comme « elles ne qualifient pas ». HIMSc et BEc etaient
   *     precisement la. Le compte ferme maintenant : 86 examinees = 4 retenues + 82 en v4 seule.
   * ⛔ CHAQUE ADRESSE MESUREE, PAS RECITEE : `eth_getCode` == `0xef` EXACTEMENT, `symbol()` relu
   *   sur la chaine et concordant, `totalSupply()` > 0, `decimals()` == 8, et la pool prouvee par
   *   aller-retour sur sa factory.
   * ⚠️ LES FLOTTANTS SONT MINCES, et « admise » ne veut pas dire « profonde » — supply lue le
   *   2026-09-28 : BEc 62 · AVGOc 85 · MUc 433,44 · HIMSc 581, contre NVDAc 19 486. Liquidite
   *   ~9 000 a 10 000 $ chacune ; volume 24 h : MUc 27 125 $, HIMSc 916 $, AVGOc 948 $, BEc 50 $.
   * ⛔ MUc EST SUR UNISWAP, PAS AERODROME : elle est achetable, mais elle NE PEUT PAS porter notre
   *   frais de 0,1 % — `sweepTokenWithFee` n existe que sur le routeur Aerodrome. C est dit ici
   *   parce qu une ligne de liste ne dit rien de l argent qu elle rapporte. */
  /* ── DIX-HUIT AJOUTS DU 2026-10-02 (annonce Base « 26 new tokenized stocks », x.com/base/status/2106022851346383309) ──
   * ⛔⛔ SOURCE : la liste de l EMETTEUR, `https://api.coinbase.com/v1/tokenized-stocks` (58 entrees ce jour).
   *     Les 58 relues SUR LA CHAINE : `eth_getCode` == `0xef`, `symbol()` concordant, `decimals()` == 8 — 58/58.
   *     43 n etaient pas chez nous ; 20 ont une supply NULLE (regle du 2026-09-27 : dehors).
   * ⛔⛔ RESTENT 23, ET 18 ENTRENT : chacune a une pool REELLE prouvee sur fork Base (bloc 52081042) par aller-retour
   *     au Quoter v4 (10 USDC -> action -> USDC, ~9,0 rendus : frais de pool 5 %, sans hook). DEHORS : HTZc (aucune
   *     pool), PFEc (pool a 88 % de frais : 10 -> 0,14), GMEc, PMc, SOUNc (Aerodrome CL, liquidite dans la plage = 0).
   * ⛔ AUCUNE N EST DANS `DEVISES_ADMISES_V8` : V8 `deviseAdmise()` rend `false` pour les 18 (temoin NVDAc : `true`).
   *   Un block NEUF ne s y cote donc pas encore — la garde de Create le dit deja en clair ; elles servent aux paires
   *   et a l achat. Les adresses sont EXTRAITES de la reponse JSON de l emetteur, jamais transcrites de tete. */
  { symbole: 'AAPLc', nom: 'Apple', adr: '0xb200000000000000000000c2e324d24d7eecd1fb' },
  { symbole: 'AMDc', nom: 'Advanced Micro Devices', adr: '0xb2000000000000000000000d8ce462e99ee7a47b' },
  { symbole: 'AMZNc', nom: 'Amazon', adr: '0xb200000000000000000000d9192b6b456483c2e8' },
  { symbole: 'ASTSc', nom: 'AST SpaceMobile', adr: '0xb200000000000000000000b1a29cf17a1819288a' },
  { symbole: 'AVGOc', nom: 'Broadcom', adr: '0xb200000000000000000000fc737aea6196ab5a4c' },
  { symbole: 'BEc', nom: 'Bloom Energy', adr: '0xb20000000000000000000016f9dfe862feba122b' },
  { symbole: 'CAKEc', nom: 'Cheesecake Factory', adr: '0xb200000000000000000000f215e4c890cfb7176b' },
  { symbole: 'DJTc', nom: 'Trump Media & Technology Group', adr: '0xb200000000000000000000428e3a3eebbb20692b' },
  { symbole: 'DUOLc', nom: 'Duolingo', adr: '0xb200000000000000000000a613d12deafbbb1db7' },
  { symbole: 'GOOGLc', nom: 'Alphabet', adr: '0xb2000000000000000000002d0ba3164cc74f58b7' },
  { symbole: 'HIMSc', nom: 'Hims & Hers Health', adr: '0xb20000000000000000000043a599976181bcf336' },
  { symbole: 'LLYc', nom: 'Eli Lilly', adr: '0xb200000000000000000000f1a0f91e34892e4718' },
  { symbole: 'METAc', nom: 'Meta Platforms', adr: '0xb2000000000000000000008bc8786b856e61707c' },
  { symbole: 'MRNAc', nom: 'Moderna', adr: '0xb200000000000000000000e215e9b76ecba02468' },
  { symbole: 'MRVLc', nom: 'Marvell Technology', adr: '0xb200000000000000000000ec3c4c7395cc609813' },
  { symbole: 'MSFTc', nom: 'Microsoft', adr: '0xb200000000000000000000ab99cfa739e253872b' },
  { symbole: 'MSTRc', nom: 'Strategy', adr: '0xb2000000000000000000004884b426556b92883d' },
  { symbole: 'MUc', nom: 'Micron Technology', adr: '0xb200000000000000000000fd2f87532b90095211' },
  { symbole: 'NFLXc', nom: 'Netflix', adr: '0xb20000000000000000000058b8c947e44011dfe6' },
  { symbole: 'NVAXc', nom: 'Novavax', adr: '0xb200000000000000000000c597c476fcf9aed3a8' },
  { symbole: 'NVDAc', nom: 'NVIDIA', adr: '0xb20000000000000000000078ee7ce2fe4908108c' },
  { symbole: 'ORCLc', nom: 'Oracle', adr: '0xb200000000000000000000347afba223d7b6b63c' },
  /* ── PLTRc, AJOUTEE LE 2026-09-30, ET UNE MESURE SUR LES 40 L A ISOLEE ────────────────────────
   * ⛔⛔ D OU VIENT LE CANDIDAT : la liste de l EMETTEUR lui-meme,
   *     `https://api.coinbase.com/v1/tokenized-stocks` (HTTP 200, sondee avant d etre codee
   *     contre). Elle porte 40 entrees ; nous en servions 14. `mesure-registre-emetteur.mjs` a
   *     verifie les 40 SUR LA CHAINE : 39 passent les quatre preuves, BIRDc tombe (supply 0).
   * ⛔⛔ ET LE CHIFFRE QUI A TRANCHE, PARCE QU IL DIT L INVERSE DE L INTUITION : nos 14 portent
   *     deja 98,6 % du volume 24 h de la classe d actifs (79 897 835 $ sur 81 012 041 $) et 94,8 %
   *     de la liquidite. Ajouter les 26 autres n ajouterait pas 65 % de surface — il ajouterait
   *     1,4 % de volume. « 14 sur 40 » se lisait comme un trou de 65 % ; c est un trou de 1,4 %.
   *   ⇒ UNE SEULE SORT DU LOT : PLTRc, 984 171 $ de volume 24 h et 562 201 $ de liquidite —
   *     a elle seule PLUS que les 25 autres reunies. Les autres vont de 1 074 $ a 99 299 $.
   * ⛔ ET LE VOISIN QUI RESSEMBLE MAIS N EN EST PAS UN : NFLXc affiche 99 299 $ de liquidite, ce
   *   qui la place juste sous PLTRc dans un classement — mais c est 14 pools dont la plus grosse
   *   fait 12 154 $, toutes en v4. Un total n est pas une profondeur. Elle n entre PAS.
   * ⛔ LA POOL EST PROUVEE PAR TEMOIN DISCRIMINANT, pas par l etiquette de DexScreener :
   *   sur `0x650cc267AA248191978013d5Ae421e5Dc2A6e242`, `slot0()` REPOND et `getReserves()`
   *   REVERTE ⇒ Slipstream CL, pas v2. `tickSpacing()` == 10 (present dans
   *   `ESPACEMENTS_ALTERNATIVE`, donc notre lecteur la trouve), `fee()` == 500, `token0` == USDC.
   *   ⛔ Et `fee` n est PAS `tickSpacing` : 500 et 10 ici, la lecon est deja ecrite ailleurs.
   * ✅ CE QUE CA VAUT POUR NOUS, ET C EST LE POINT : la pool est sur AERODROME. C est le seul
   *   routeur qui porte `sweepTokenWithFee` — donc la seule famille ou notre 0,1 % peut tomber.
   *   MUc, elle, est sur Uniswap : achetable, mais aveugle a notre frais.
   * ⚠️ L adresse est EXTRAITE de la reponse JSON de l emetteur, jamais transcrite de tete.
   * ⚠️ Supply lue le 2026-09-30 : 2 068,33 — mince, et « admise » ne veut pas dire « profonde ». */
  { symbole: 'PLTRc', nom: 'Palantir Technologies', adr: '0xb2000000000000000000007d16372840df4dabbe' },
  { symbole: 'PTONc', nom: 'Peloton Interactive', adr: '0xb2000000000000000000009272a491812842aa84' },
  { symbole: 'PYPLc', nom: 'PayPal', adr: '0xb200000000000000000000450ad3abe5d4846c6e' },
  { symbole: 'QUBTc', nom: 'Quantum Computing', adr: '0xb200000000000000000000ca425ab42e07c35bc3' },
  { symbole: 'RBLXc', nom: 'Roblox', adr: '0xb2000000000000000000005bd7ae89b9e6189bb5' },
  { symbole: 'RDDTc', nom: 'Reddit', adr: '0xb20000000000000000000066242d4067724cb7a1' },
  { symbole: 'SNDKc', nom: 'Sandisk', adr: '0xb200000000000000000000397293cb8cda9a10c5' },
  { symbole: 'SPCXc', nom: 'SpaceX', adr: '0xb2000000000000000000007b9fcbd005511acbd5' },
  { symbole: 'TSLAc', nom: 'Tesla', adr: '0xb2000000000000000000001e800a7f5189430cd0' },
  { symbole: 'TTWOc', nom: 'Take-Two Interactive', adr: '0xb200000000000000000000f720c26062bc3067da' },
  { symbole: 'WENc', nom: 'Wendy’s', adr: '0xb20000000000000000000044e3cd7a0e1028e57a' },
  /* 2026-10-02 (Phil) : ajoutees au hook 7030. Adresses copiees de api.coinbase.com/v1/tokenized-stocks, lues sur Base
   *   (code 0xef, 8 decimales, supply > 0 : GMEc 3 011, HTZc 16 949, PFEc 182, PMc 27 unites). */
  { symbole: 'GMEc', nom: 'GameStop', adr: '0xb2000000000000000000007790ed6e48e06ed935' },
  { symbole: 'HTZc', nom: 'Hertz', adr: '0xb2000000000000000000002601c5c94f435da168' },
  { symbole: 'PFEc', nom: 'Pfizer', adr: '0xb20000000000000000000018fe7ec7d6dfeeb528' },
  { symbole: 'PMc', nom: 'Philip Morris', adr: '0xb2000000000000000000008fc2a8c23cf5937b66' },
  /* ── TROIS AJOUTS DU 2026-10-09, ET LA MESURE QUI EN A ECARTE ONZE ──────────────────────────────────────────────────────
   * ⛔⛔ SOURCE : la liste de l EMETTEUR (api.coinbase.com/v1/tokenized-stocks) — 127 entrees ce jour (58 le 2026-10-02). Les 127
   *     relues SUR Base (mesure-registre-emetteur.mjs, 0 non mesuree) : 58 passent les 4 preuves, 69 ont une supply NULLE.
   *     19 mintees n etaient pas chez nous. DexScreener donne a 14 d entre elles « ~50 k$ de liquidite » sur Aerodrome — ET C EST
   *     FAUX POUR ONZE : balanceOf(USDC, pool) = 0,01 USDC (pools initialisees, pas approvisionnees). Trois seulement ont une
   *     profondeur reelle, lue sur la chaine : ARMc 24 981 USDC · SKHYc 24 971 · WRDc 24 701 (bloc 52 394 888).
   * ⛔ CHAQUE ADRESSE EXTRAITE DE LA REPONSE JSON DE L EMETTEUR, chaque pool RENDUE par getPool(USDC, action, 1) sur la factory
   *   Aerodrome CL et identique a celle de DexScreener. tickSpacing 1, fee 100 — Aerodrome : le routeur qui porte notre 0,1 %.
   * ⛔ AUCUNE N EST DANS LA LISTE FIGEE DU HOOK 7030 (62 devises) : achat et vente, PAS de naissance contre elles — la garde de
   *   Create (hookDeLancementPour) et pairesDeNaissance (MCP) les refusent. Volume 24 h : 0 $ le jour de l ajout. */
  { symbole: 'ARMc', nom: 'Arm Holdings', adr: '0xb20000000000000000000026215d755356e5043f' },
  { symbole: 'SKHYc', nom: 'SK hynix', adr: '0xb200000000000000000000187f7071d6e321a7d2' },
  { symbole: 'WRDc', nom: 'WeRide', adr: '0xb200000000000000000000e88efe88d8ade3f0da' },
  /* ⛔⛔ ET LES ONZE « VIDES » SE SONT REMPLIES 25 MIN PLUS TARD — UN INSTANTANE N EST PAS UN ETAT. Lot annonce par @base le
   *     2026-10-09 19:59 UTC (« More tokenized stocks, just in time for the weekend ») ; mint 18:18-19:02, pools creees 19:07.
   *     Mesure 20:45 UTC : 0,01 USDC chacune. Re-mesure 21:08 UTC (bloc ~52 395 400) : 24 987,81 USDC chacune, getPool(USDC,
   *     action, 1) == la pool de DexScreener, 14/14 au-dessus du seuil de la table. Memes regles que les trois du dessus :
   *     achat/vente, HORS de la liste figee du 7030, pas de naissance contre elles. Preuve fork : voir le message du commit.
   * ⛔⛔ SEc ET SONYc RESTENT DEHORS, MALGRE 24 987 USDC CHACUNE : sur fork (bloc 52 395 433), le plan d achat est PRET et le swap
   *     REVERTE « Too little received » — a 500, 100 ET 10 USDC. Le plan Aerodrome n est pas simule ; son minimum vient du prix
   *     spot, et la liquidite pres du spot de ces deux pools ne le tient pas. Les ajouter = un Buy « PRET » qui coute du gaz pour
   *     un echec. Elles entreront quand le plan sera simule (ou leur pool remesuree).
   * ⛔⛔ 2026-10-10 18:05 UTC — REMESURE (fork base-anvil, bloc 52 432 772, banc-marche-actions-fork-20261004) : SONYc ENTRE. Sa pool
   *     a change (liquidity() 280 047 788 329 814, contre ~5 000 pour les autres) : achat USDC 9,9 bps, achat ETH, revente USDC et
   *     ETH, et paiement d un block (route 4 ter) EXECUTES sans revert. SEc reste dehors (achat USDC REVERTE encore).
   *   ⚠️ ET LA MEME MESURE ACCUSE CE LOT : sur les 12 actions a pool ts=1 de la table, 11 donnent un achat USDC PRET dont le swap
   *     REVERTE (ARMc SKHYc WRDc BIDUc HSAIc INFYc NIOc NVOc PDDc SAPc VALEc ; seule BILIc passe). Le remede est la simulation du
   *     plan Aerodrome (en cours, Grok) — pas de les retirer ici : sans la table, le planificateur trouverait la meme pool. */
  { symbole: 'BIDUc', nom: 'Baidu', adr: '0xb200000000000000000000d2b7d9aee52f6c6bef' },
  { symbole: 'BILIc', nom: 'Bilibili', adr: '0xb200000000000000000000ca7c6d1438e7245eb6' },
  { symbole: 'HSAIc', nom: 'Hesai Group', adr: '0xb200000000000000000000f3049f4aa834b23b64' },
  { symbole: 'INFYc', nom: 'Infosys', adr: '0xb200000000000000000000f6b0417af5f52341fc' },
  { symbole: 'NIOc', nom: 'NIO', adr: '0xb2000000000000000000002d2b5dc53c61f1ba06' },
  { symbole: 'NVOc', nom: 'Novo Nordisk', adr: '0xb2000000000000000000008d5328e9208773dc58' },
  { symbole: 'PDDc', nom: 'PDD Holdings', adr: '0xb200000000000000000000c8a7223510467d8563' },
  { symbole: 'SAPc', nom: 'SAP', adr: '0xb200000000000000000000da6f64c306234127e0' },
  { symbole: 'VALEc', nom: 'Vale', adr: '0xb20000000000000000000063376b142c0764b489' },
  /* 2026-10-10 : adresse copiee de la reponse de l emetteur (api.coinbase.com/v1/tokenized-stocks, total_supply 1240) */
  { symbole: 'SONYc', nom: 'Sony Group', adr: '0xb200000000000000000000a26326a922ffa87f6c' },
  /* ── 2026-10-25 — LES ACTIONS PROUVEES SUR LA CHAINE QUI MANQUAIENT, ENTREES PAR BANC FORK ───────────────────────────────────────
   * ⛔⛔ SOURCE : le recensement du 2026-10-24 (bloc 53 040 674) — l API de l emetteur est PAGINEE (100 + 100 + 2 = 202), toutes
   *     prouvees (code 0xef, log B20Created de la factory 0xb20f…, tx.from = le createur de l emetteur, status 0x1 ; actions-chaine.js).
   *     65 ont des unites ; 11 manquaient ici. Six ont une pool USDC profonde sur la factory de NOTRE routeur Aerodrome ; CINQ entrent.
   * ⛔⛔ ENTREE = UN ACHAT DE 10 USDC EXECUTE SUR FORK par le planificateur de la fiche (banc-actions-chaine-fork-20261025.mjs, fork
   *     frais bloc 53 044 084 : SANc SEc ULc NOKc LIc, status 0x1, recu >= minimum) : sans etre ici, le planificateur les refuse
   *     (« fee would be taken in the output token » : estDeviseConnue lit CE registre). SEc, dehors depuis le 09/10, s execute.
   * ⛔ BUDc RESTE DEHORS : 25 397 USDC, mais 10 USDC y achetent 5,84 % sous le prix moyen (bloc 53 044 017) et le planificateur
   *     refuse le plan sur fork. RIVNc CBRSc RKLBc APPc UNHc : aucune pool de la factory de notre routeur — dehors aussi.
   *     Adresses et noms COPIES du recensement (reponse JSON de l emetteur), jamais de tete. Hors liste figee du 7030 : achat et
   *     vente, pas de naissance contre elles (meme regle que le lot du 2026-10-09). */
  { symbole: 'SANc', nom: 'Banco Santander', adr: '0xb20000000000000000000017bb66e9301e913a99' },
  { symbole: 'SEc', nom: 'Sea Limited', adr: '0xb2000000000000000000003088798f6d0722aaac' },
  { symbole: 'ULc', nom: 'Unilever', adr: '0xb200000000000000000000349ef3aa93a0897476' },
  { symbole: 'NOKc', nom: 'Nokia', adr: '0xb2000000000000000000005ac674f707e357409c' },
  { symbole: 'LIc', nom: 'Li Auto', adr: '0xb200000000000000000000d61efd9f54a23ef9eb' },
  /* ⛔⛔ 2026-10-03 (fondateur, « Oui, les 21 en Soon ») : LES 21 AUTRES ACTIONS DE L EMETTEUR entrent au registre pour
   *   l AFFICHAGE — la regle du 2026-09-27 (« supply nulle = dehors ») est levee pour l affichage SEULEMENT, jamais pour un
   *   achat : sans marche lu, pas de Buy ; sans contrat qui les admet, Create les montre « opens with our next contract ».
   *   Le hook 7030 a 62 devises (hook-7030-descripteur.js, 0x32F3…64cc, PAS DEPLOYE) les admet toutes.
   *   Les 21 relues SUR Base le 2026-10-03 (`eth_getCode` == `0xef`, `symbol()` concordant, `decimals()` == 8) ; SOUNc a
   *   843 unites, les 20 autres une supply NULLE ce jour. Adresses extraites de la reponse JSON de l emetteur. */
  { symbole: 'AMCc', nom: 'AMC Entertainment', adr: '0xb200000000000000000000cd7e6b8042cb7c2bb5' },
  { symbole: 'AEOc', nom: 'American Eagle Outfitters', adr: '0xb2000000000000000000006064f8ec027f042294' },
  { symbole: 'BMNRc', nom: 'BitMine Immersion', adr: '0xb200000000000000000000ea2df44a307cab279c' },
  { symbole: 'BIRDc', nom: 'Smartbird', adr: '0xb200000000000000000000535fe96f18204bfd96' },
  { symbole: 'BYNDc', nom: 'Beyond Meat', adr: '0xb200000000000000000000801830b13b8e493423' },
  { symbole: 'CIFRc', nom: 'Cipher Digital', adr: '0xb200000000000000000000690275843b6e246286' },
  { symbole: 'CLSKc', nom: 'CleanSpark', adr: '0xb200000000000000000000fa63cfff5c794dbb95' },
  { symbole: 'CRCLc', nom: 'Circle Internet Group', adr: '0xb20000000000000000000019f6e7c675b73c2e4d' },
  { symbole: 'CRWVc', nom: 'CoreWeave', adr: '0xb200000000000000000000f111184a74720787e6' },
  { symbole: 'HUTc', nom: 'Hut 8', adr: '0xb2000000000000000000006ee1c139a723872e09' },
  { symbole: 'KSSc', nom: 'Kohl’s', adr: '0xb200000000000000000000105a1f43ff3605c5de' },
  { symbole: 'LCIDc', nom: 'Lucid Group', adr: '0xb20000000000000000000081050ac3d4395df527' },
  { symbole: 'MARAc', nom: 'MARA Holdings', adr: '0xb200000000000000000000a310e034e09186fb2d' },
  { symbole: 'OPENc', nom: 'Opendoor Technologies', adr: '0xb200000000000000000000259694b27bf052e7d7' },
  { symbole: 'RIOTc', nom: 'Riot Platforms', adr: '0xb200000000000000000000bd0c7627b663c581a6' },
  { symbole: 'SOUNc', nom: 'SoundHound AI', adr: '0xb2000000000000000000002137743d4a01fe4e88' },
  { symbole: 'USDEc', nom: 'StablecoinX', adr: '0xb2000000000000000000009426b660396ebcf343' },
  { symbole: 'VVVc', nom: 'Valvoline', adr: '0xb200000000000000000000fec679b39992f67627' },
  { symbole: 'WULFc', nom: 'TeraWulf', adr: '0xb200000000000000000000432a1d2bd864acec82' },
  { symbole: 'WWc', nom: 'WW International', adr: '0xb20000000000000000000089221e238277d52515' },
  { symbole: 'XYZc', nom: 'Block', adr: '0xb20000000000000000000067c8c151f24e1c9924' },
];

const ADRESSE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Ce qu on peut proposer comme paire sur une chaine.
 * ⛔ LES ACTIONS COINBASE N EXISTENT QUE SUR BASE MAINNET : les proposer sur Sepolia enverrait vers
 *    des adresses qui n y sont pas des actions.
 */
export function pairesProposees(chaine) {
  const c = Number(chaine);
  /* ⛔⛔ « PROPOSEES » N EST PAS « CONNUES », ET CETTE FONCTION CONFONDAIT LES DEUX.
   *     TBLOCK porte `lancePubliquement: false` depuis le 2026-09-24 — decision de Phil, appuyee
   *     par une mesure : aucun des 7 jetons detenus par le wallet de frais n a de marche vivant.
   *     Le drapeau etait pose, et PERSONNE NE LE LISAIT ICI : TBLOCK restait propose a la creation.
   *     Re-mesure du 2026-09-27 : `/tokens/v1/base/0xb20000…272e` rend AUCUNE PAIRE. Proposer de
   *     coter un block en TBLOCK, c est promettre un marche qui n existe pas — et l acheteur ne
   *     l apprend qu apres avoir paye la naissance.
   *   ⛔ LE JETON RESTE DANS `DEVISES_BASE` : d autres ecrans s en servent legitimement, et les
   *     blocks deja cotes en TBLOCK ne doivent pas perdre leur libelle. On filtre ce qu on
   *     PROPOSE, on ne supprime pas ce qu on CONNAIT. */
  const base = DEVISES_BASE.filter((d) => d.chaines.includes(c) && d.lancePubliquement !== false);
  const actions = c === 8453 ? ACTIONS_COINBASE.map((s) => ({ ...s, type: 'ACTION' })) : [];
  return [...base, ...actions];
}

/**
 * Qualifie une paire choisie.
 * @returns {{etat:'OK'|'REFUSE', paire?:object, pourquoi?:string}}
 * ⛔ L ORDRE COMPTE : registre d abord. Une adresse du registre tapee a la main reste une ACTION
 *    verifiee ; une adresse inconnue reste « tapee par vous », jamais promue.
 */
export function qualifierPaire(adresse, chaine) {
  const a = String(adresse || '').trim();
  if (!ADRESSE.test(a)) return { etat: 'REFUSE', pourquoi: 'not an address — paste it whole, nothing is completed' };
  const bas = a.toLowerCase();
  const connue = pairesProposees(chaine).find((p) => p.adr.toLowerCase() === bas);
  if (connue) return { etat: 'OK', paire: { ...connue, verifiee: true } };
  if (Number(chaine) !== 8453 && ACTIONS_COINBASE.some((s) => s.adr.toLowerCase() === bas)) {
    return { etat: 'REFUSE', pourquoi: 'that is a Coinbase stock on Base mainnet — it does not exist as a stock on this network' };
  }
  /* ⛔ RAKSHA 2026-09-15: custom pair must prove native B20 (code 0xef) in Create majPaire — no ERC-20 sprawl. */
  return { etat: 'OK', paire: { adr: a, symbole: null, nom: null, type: 'SAISIE', verifiee: false, besoinB20: true,
    avertissement: 'Typed address — must be a native B20 (code 0xef) to pair here. Not a random ERC-20. '
      + 'This app gives it no name until the chain proves B20.' } };
}

/** L etiquette a afficher. ⛔ Une paire non verifiee n emprunte jamais un nom. */
export function etiquettePaire(p) {
  if (!p) return '—';
  if (p.type === 'SAISIE') return 'B20 pair ' + p.adr.slice(0, 6) + '…' + p.adr.slice(-4) + (p.estB20 ? ' (native B20)' : ' (B20 check…)');
  if (p.type === 'TBLOCK') return p.symbole + ' — ' + p.nom;
  if (p.type === 'ACTION') return p.symbole + ' — ' + p.nom + ' (Coinbase tokenized stock)';
  return p.symbole + ' — ' + p.nom;
}

/* ── E0 (2026-10-01) — WHICH HOOK CAN PRICE A NEW BLOCK IN THIS CURRENCY: ONE SOURCE, READ BY EVERY GUARD ──
 * Every permanent Base launch opens on HOOK_V8, and V8 writes `deviseAdmise` ONLY in its constructor,
 * with no setter: its list is final. Measured with `node devises-admises.mjs` (negative control
 * 0x…beef read "not admitted", so the read discriminates) and proven again on a real Base node
 * (eth_call: a fresh labelled block, V8.inscrire reverts PaireNonAdmise 0x9e16f763 for every
 * offered currency outside this list, and passes for ETH, TBLOCK and these 12).
 * ⛔ ONE LIST, NOT TWO. "Refused" is NOT stored anywhere: it is the complement of this set, so the
 *    Create guard (`refusPrixNouveauBlock`) and the launch guard (lancer-pool.js) ask the SAME
 *    function, `hookDeLancementPour`, and cannot drift. test-e0-devises-v8.mjs fails if they do.
 * ⛔ Unknown = refused (a pasted address included): V8 would refuse it at Birth, after payment. */
export const DEVISES_ADMISES_V8 = Object.freeze([
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC
  '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf', // cbBTC
  '0xb200000000000000000000c2e324d24d7eecd1fb', // AAPLc
  '0xb200000000000000000000d9192b6b456483c2e8', // AMZNc
  '0xb2000000000000000000002d0ba3164cc74f58b7', // GOOGLc
  '0xb2000000000000000000008bc8786b856e61707c', // METAc
  '0xb200000000000000000000ab99cfa739e253872b', // MSFTc
  '0xb2000000000000000000004884b426556b92883d', // MSTRc
  '0xb20000000000000000000078ee7ce2fe4908108c', // NVDAc
  '0xb200000000000000000000397293cb8cda9a10c5', // SNDKc
  '0xb2000000000000000000007b9fcbd005511acbd5', // SPCXc
  '0xb2000000000000000000001e800a7f5189430cd0', // TSLAc
]);

/** HOOK V9 constructor list (src/V9Devises.sol: 19 addresses, ETH implicit). NOT deployed: it only
 *  counts when the caller passes `{ v9: true }` (tokenomics `OPTIONS_LANCEMENT`, true once HOOK_V9 is set). */
import { DEVISES_7030 } from './hook-7030-descripteur.js';
export const DEVISES_ADMISES_V9 = Object.freeze([
  ...DEVISES_ADMISES_V8,
  '0xac1bd2486aaf3b5c0fc3fd868558b082a531b2b4', // TOSHI
  '0xb2000000000000000000002feb517dfec7415344', // OUSD
  '0xb200000000000000000000fc737aea6196ab5a4c', // AVGOc
  '0xb20000000000000000000016f9dfe862feba122b', // BEc
  '0xb20000000000000000000043a599976181bcf336', // HIMSc
  '0xb200000000000000000000fd2f87532b90095211', // MUc
  '0xb2000000000000000000007d16372840df4dabbe', // PLTRc
]);
/** 2026-10-03 — liste du hook 7030 = 62 (contracts/launch-lock/src/Devises7030.sol de feat/hook-7030-62-sur-a040db5-20261003,
 *  FIXE au constructeur, sans setter) : V9 19 + 18 actions (0ea4661) + GMEc HTZc PFEc PMc + les 21 autres actions de l emetteur
 *  (fondateur : « la plus large »). Lue dans hook-7030-descripteur.js, la SEULE source (adresse, liste, planchers) ; ce fichier
 *  n en recopie plus rien. Ne compte que si l appelant passe `{ h7030: true }` (drapeau HOOK_7030_ACTIF, eteint). */
export const DEVISES_ADMISES_7030 = DEVISES_7030;

/** The hook a NEW block quoted in `adresse` opens on ('V8' | 'V9'), or null if no launch hook admits it.
 *  The ONLY place that decides — the Create guard, the launch guard (lancer-pool.js) and the hook
 *  routing (tokenomics `hookCourant`) all ask here. Off Base: null.
 *  With `{ v9: true }`: stock / B20 quotes (0xb2…) of the V9 list go to V9; ETH, TBLOCK, USDC, cbBTC
 *  stay on V8; TOSHI (in the V9 list, not 0xb2) stays unrouted until its rail decides. */
export function hookDeLancementPour(adresse, chaine, { v9 = false, h7030 = false } = {}) {
  if (Number(chaine) !== 8453) return null;
  const a = String(adresse || '').trim().toLowerCase();
  /* ⛔ hook 7030 (drapeau HOOK_7030_ACTIF, passe par l appelant) : ETH + sa liste fixe — 62 depuis le 2026-10-03 (descripteur). */
  if (h7030 === true && (a === ETH_NATIF || DEVISES_ADMISES_7030.includes(a))) return '7030';
  if (v9 === true && a.startsWith('0xb2') && DEVISES_ADMISES_V9.includes(a)) return 'V9';
  if (a === ETH_NATIF || a === TBLOCK_MAINNET || DEVISES_ADMISES_V8.includes(a)) return 'V8';
  return null;
}

/** Les devises contre lesquelles un block NEUF peut naitre sur `chaine` : ce que l ecran propose, filtre par la regle des hooks
 *  (hookDeLancementPour) — la MEME regle que la garde de Create (estPaireLancable, app.html) et que le MCP (pairesDeNaissance).
 *  ⛔⛔ 2026-10-09 : douze actions sont entrees au registre (achat/vente) HORS de la liste figee du hook 7030 ; la passe des paires
 *   mortes lisait `pairesProposees` tel quel et serait passee de 62 a 74 lectures pour un ecran qui n en montre que 62.
 *  `options` = OPTIONS_LANCEMENT de tokenomics.js, passe par l appelant. Hors Base, l ecran ne filtre pas : on rend tout. */
export function pairesLancables(chaine, options) {
  const liste = pairesProposees(chaine);
  if (Number(chaine) !== 8453) return liste;
  return liste.filter((p) => String((p && p.adr) || '').toLowerCase() === ETH_NATIF || !!hookDeLancementPour(p.adr, chaine, options));
}

/** E0 copy. ⛔ No hook / version names, no dates, no "coming soon": statements of fact only. */
export const copieE0Achat = (symbole) => symbole + " can't price a new block yet. You can already use it to buy.";
/* ⛔ A STATEMENT OF FACT, NOT A PROMISE: used whenever the app cannot route a buy from that currency
 *    AT DISPLAY TIME (TOSHI today, or any currency whose route is not measured, or with no symbol). */
export const COPIE_E0_SANS_ROUTE = "This currency can't price a new block yet, and we can't route a buy from it yet either.";

/** null = this currency can price a new block (Base only); otherwise the sentence to show.
 *  `routable` MUST come from the app's own buy-routing data at display time (app.html:
 *  `transactionsDepuisEth`, the measured edge graph) — never assumed. Anything but `true` = factual phrase. */
export function refusPrixNouveauBlock(adresse, chaine, { routable = false, symbole = null, v9 = false, h7030 = false } = {}) {
  if (Number(chaine) !== 8453) return null;
  if (hookDeLancementPour(adresse, chaine, { v9, h7030 }) !== null) return null;
  const sym = typeof symbole === 'string' ? symbole.trim() : '';
  return routable === true && /^[A-Za-z0-9.]{1,12}$/.test(sym) ? copieE0Achat(sym) : COPIE_E0_SANS_ROUTE;
}

/* ══ 2026-10-02 — CAUTION DU CREATEUR (hook 7030) : PLANCHER COTE APP ═════════════════════════════════════════
 * ⛔ PERIME LE 2026-10-03 : le hook DEPLOYE (0x32F3…64cc, arbre a040db5 de Zero 1) IMPOSE un plancher par devise, fige au
 *   constructeur (hook-7030-descripteur.js, ~1 $ au bloc 52 090 382 ; CautionSousLePlancher en dessous). L app garde SON 1 $
 *   du jour et prend le PLUS GRAND des deux (app.html cautionCreateurPour) — sinon une hausse de l ETH ferait reverter la
 *   naissance apres paiement (Grok, croisement de 4d8e437).
 * La caution vaut l equivalent de CAUTION_CREATEUR_USD dollars dans la devise appariee, arrondi AU-DESSUS a l unite brute,
 * prix lu (/api/prix-usd, ETH via le prix ETH). 1 $ : assez pour qu une caution « vide » ne touche pas la part, assez
 * peu pour ne bloquer personne. Prix illisible -> null -> pas de naissance 7030 (on refuse, rien n est paye). */
export const CAUTION_CREATEUR_USD = 1;
export function minimumCautionCreateur({ prixUsd, decimales, usd = CAUTION_CREATEUR_USD } = {}) {
  const p = Number(prixUsd), d = Number(decimales);
  if (!(p > 0) || !Number.isFinite(p) || !Number.isInteger(d) || d < 0 || d > 36) return null;
  const pS = BigInt(Math.round(p * 1e12)), uS = BigInt(Math.round(Number(usd) * 1e12));
  if (pS <= 0n || uS <= 0n) return null;
  const m = (uS * 10n ** BigInt(d) + pS - 1n) / pS;
  return m > 0n ? m : 1n;
}

/* ══ 2026-10-02 (fix-2) — PUCE DE PAIRE A CREATE, ORDRE DES ADRESSES, CHOIX « BUY HERE » ══════════════════════════ */
/** Drapeau memestock multipool : ETEINT. Tant qu il l est, aucun partage app/createur n est affiche. */
export const MEMESTOCK_MULTIPOOL_ACTIF = false;
/** Taux que la pool V8 preleve AUJOURD HUI : HOOK_FEE() lu sur la chaine = 5000 / 1e6 (tokenomics.js, V8). */
export const TAUX_ECHANGE_V8_LIBELLE = '0.5%';
/** Puce de paire a Create. ⛔ Le frais de naissance et le frais d echange sont DEUX choses : « fee 0.001 ETH » les
 *  confondait. Le partage « app 0.07% · creator 0.03% » ne s affiche QUE si le drapeau multipool est allume.
 *  Jamais d adresse de frais, jamais le libelle interne du wallet de frais. */
/* ⛔⛔ game348 (Phil 2026-11-10 : « Quote = ETH · birth fee 0.001 ETH · swap fee 0.1% per trade (app 0.07% · creator 0.03%) — retire ca,
 *   c est faux maintenant ») : la naissance se paie 5 $ (TBLOCK d abord, la carte Create le dit avec les vrais montants) ; un frais et un
 *   partage figes sur la puce de paire contredisaient la carte. La puce dit ce que le choix CHANGE : la devise que les acheteurs paient.
 *   Les parametres restent (appelants inchanges) ; aucun frais, aucun pourcentage, aucune adresse sur cette puce. */
export function libellePuceCreation({ symbole } = {}) {
  const s = String(symbole || 'stock');
  return 'Quote = ' + s + ' — buyers pay in ' + s;
}
/** Le block est-il APRES la devise dans la PoolKey (currency0 = devise) ? Le V8 preleve en currency0 : un block qui
 *  passe devant ferait payer son frais en block. ETH natif (0x0) est toujours devant. */
export function blockApresDevise(block, devise) {
  const b = String(block || ''), d = String(devise || ETH_NATIF);
  if (!/^0x[0-9a-fA-F]{40}$/.test(b) || !/^0x[0-9a-fA-F]{40}$/.test(d)) return false;
  return BigInt(b) > BigInt(d);
}
/** Mode « Buy here » pour les pools V8 EXISTANTES ou le block passe devant (frais du hook en block).
 *  'EVITER_SI_ALTERNATIVE' (defaut) : on l ecarte SEULEMENT si une autre route payant a6cf existe ; sinon inchange.
 *  'GARDER' : comportement d avant. ⛔ Decision produit (Phil) : ne pas changer le defaut sans lui. */
export const BUY_HERE_V8_BLOCK_DEVANT = 'EVITER_SI_ALTERNATIVE';
/** Une pool V8 ou le block est currency0 : le frais du hook y est pris en block. */
export function v8BlockDevant(cle, block, hookV8) {
  if (!cle) return false;
  return String(cle.hooks || '').toLowerCase() === String(hookV8 || '').toLowerCase()
    && String(cle.currency0 || '').toLowerCase() === String(block || '').toLowerCase();
}
/** Choix final de « Buy here » parmi les candidats deja classes : `meilleur` (le gagnant d avant) et `meilleurAutre`
 *  (le meilleur candidat qui n est PAS une pool V8 block-devant — chaque candidat retenu par poolDecouvertPour paie
 *  a6cf : routeur 0,5 % ETH sur une pool ETH, ou le hook en devise). */
export function choixBuyHere({ meilleur, meilleurAutre, block, hookV8, mode = BUY_HERE_V8_BLOCK_DEVANT }) {
  if (!meilleur) return null;
  if (mode !== 'EVITER_SI_ALTERNATIVE') return meilleur;
  if (!v8BlockDevant(meilleur.cle, block, hookV8)) return meilleur;
  return meilleurAutre || meilleur;
}
