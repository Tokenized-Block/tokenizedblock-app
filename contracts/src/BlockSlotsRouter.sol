// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice the live TblockPayRouter, as this game uses it: its two tokens, its per-payment cap, and pay()
interface ISlotsPayRouter {
    function TBLOCK() external view returns (address);
    function USDC() external view returns (address);
    function MAX_USDC_PER_PAY() external view returns (uint256);
    function pay(address game, uint256 usdcIn, uint256 minTblockOut, uint256 deadline, bytes calldata data) external returns (uint256);
}

/// @notice the reads this game makes of the holders vault (DEST), at construction only: the TBLOCK it holds, the router its games
///         name, and its free balance (review 2026-11-12, as in the new Skins: these three together single out TBlockVaultV2)
interface ISlotsDestToken {
    function TBLOCK() external view returns (address);
    function ROUTER() external view returns (address);
    function free() external view returns (uint256);
}

/// @title BlockSlotsRouter -- the live Spin (BlockSlots 0xba234f…c85a) whose DEV share is paid through the TBLOCK pay router.
/// @notice Phil 2026-11-12. Everything a player sees is the live contract's: the same price (constructor), the same 50 % pot share,
///         the same table, odds, three-block faces, settle / settleMany / acceptCapped / expire rules, the same events read by the
///         keeper (Spun, Settled). The winners' pot stays USDC in this contract, exactly as today. ONE thing changes, the dev share:
///   - at each spin DEV_SHARE is still counted as owed (devOwed), as today. spin() makes NO router call: a TBLOCK buy can never make
///     a spin fail, and a spin costs the same gas as today.
///   - payDev(amount, minTblockOut, deadline) (anyone) sends one batch of `amount`, MIN_DEV_BATCH <= amount <= min(devOwed,
///     MAX_DEV_BATCH), through the immutable ROUTER: this contract is the payer and the game. Review F1/F2 (2026-11-12): the batch
///     used to be pinned at min(devOwed, the router's 50 USDC cap). A pool that could no longer take a 45 USDC leg within the
///     router's guards then locked ALL of devOwed although a smaller batch would pass, and a 50 USDC buy was cheap to grief and close
///     to profitable to sandwich. Now MAX_DEV_BATCH is a constructor choice (at most the router's cap) and the caller picks the
///     size, so a thinner pool is served by smaller batches. The router pulls exactly the batch from here, sends 10 %
///     (USDC_SPLIT: DEV_WALLET, 1,000 bps) in USDC to DEV_WALLET, buys TBLOCK with the other 90 % with all its guards, sends the
///     TBLOCK here, and calls onPaid, which forwards every TBLOCK held here to DEST (the holders vault) and checks DEST received it.
///     The old payDev() (all of devOwed in USDC to DEV_WALLET) is gone: the owed USDC can leave ONLY by this router path.
///   - PRICE_USDC() (read by the router) is the batch in flight, 0 outside payDev: no router payment to this game can match a price
///     outside payDev, and onPaid refuses anything but the batch this contract is paying itself.
///   - minTblockOut is the CALLER's protection of the buy (the router refuses below its own floor, 75 % of the spot value read in
///     the call; that floor follows a front-run). A caller who passes a low minTblockOut can only make the dev share's TBLOCK buy
///     worse; he can never take USDC or TBLOCK for himself: the USDC goes to DEV_WALLET and the router's swap, the TBLOCK to DEST.
///   - a spin is not a play (as today): nothing is recorded in the vault or the lock rewards.
///   The notes below are the live contract's, kept for the history of each rule; where they say payDev() sends USDC to DEV_WALLET,
///   read payDev(minTblockOut, deadline) above.
/// @notice (live contract) BlockSlots -- une machine a sous a TROIS faces de bloc (idee de Phil, 2026-10-23).
/// @notice Le joueur paie un spin (USDC, prix fixe). Le hasard vient de TROIS blocs FUTURS (targetBlock = bloc du spin + 2, puis + 1, + 2) :
///         ni le joueur ni nous ne les choisissons. Au settle, chaque face sort de SON bloc (Phil 2026-10-23 : « 3 blocs differents, chaque
///         face de son propre blockhash ») : face_r = faceOf(keccak256(abi.encode(blockhash(targetBlock + r), spinId, r))) pour r = 0, 1, 2
///         -- la meme derivation a 5 traits que BlockRolls (face-du-jour.js faceRevelee + apparence.js). Le settle attend les TROIS hashes
///         (bloc > targetBlock + 2) et reste dans la fenetre de 256 blocs du PREMIER. Pour chacun des 5 traits : les 3 faces egales = 3 points,
///         2 egales = 1 point, sinon 0. Le CONTRAT juge le resultat au settle et paie lui-meme un PRIX FIXE par nombre de points (table de 16
///         cases, 0..15 points), entre 0 et 5 USDC AU PLUS par spin (MAX_PRIZE) : en ENTIER si le pot le couvre, sinon le spin attend --
///         seul son joueur peut accepter moins (acceptCapped), jamais en silence. Un spin non regle dans sa fenetre est PERDU (v4, option 3
///         de Phil 2026-10-23) : aucun gain, RIEN n est rendu, rien ne reste coince (chaque unite est deja au pot ou due au dev).
///         Les points s ADDITIONNENT par wallet, sur la chaine (pointsOf) : un COMPTEUR affiche, pas un gain -- le gain est PAR SPIN.
/// @dev ⛔ CE QUI EST GRAVE ICI, ET POURQUOI :
///   - AUCUN proprietaire, AUCUN retrait, AUCUNE regle modifiable : la table des prix est fixee a la construction. L USDC ne sort du pot que
///     par un settle gagnant, au joueur du spin.
///   - SPIN (v4) : le prix ENTIER entre au contrat et il est PARTAGE AU SPIN, quoi qu il arrive ensuite : TO_POT au pot, DEV_SHARE (le
///     reste) du au DEV_WALLET (devOwed, envoye par payDev(), par n importe qui, au DEV_WALLET seul). Aucune part n est tenue en attente.
///   - ⛔ POURQUOI AUCUN REMBOURSEMENT (v4) : le hash des blocs est PUBLIC des qu il existe ; le joueur sait donc s il a gagne AVANT de
///     choisir entre regler et laisser expirer. Avec un remboursement r, la meilleure strategie rend E[max(prix du spin, r)] : le prix
///     entier rendu (r = 0,50) donnait 0,556549 USDC par spin de 0,50 (> le prix) ; la part du dev rendue (v3, r = 0,25) donnait 0,325222
///     et le dev n etait paye presque que sur les spins GAGNANTS. Sans remboursement, laisser expirer ne rend RIEN : la meilleure strategie
///     est de tout regler, et rend exactement l esperance E[X] (bestPlayNumerator() = expectedNumerator(table)), strictement sous TO_POT
///     <= le prix (la garde du constructeur, EXACTE, arrondi compris). Un plafond par le pot ne fait que baisser ce que rend un settle.
///   - settle / settleMany restent PERMISSIONLESS et paient TOUJOURS le joueur du spin (jamais l appelant) : un regleur (le serveur, ou
///     n importe qui) peut regler a la place du joueur, il ne paie que son gas.
///   - L AVANTAGE DE LA MAISON EST VERIFIE PAR LE CONTRAT : la distribution EXACTE des points (DIST, sur 2^144, derivee des tailles de
///     listes et des octets lus : teinte = 2 octets % 361 puis 6 bandes, orbite o6 % 10, facette o7 % 19, matiere o8 % 9, ornement o9 % 8)
///     est une constante ; le constructeur REFUSE une table dont l esperance par spin n est pas STRICTEMENT sous ce qui ENTRE au pot
///     (TO_POT, arrondi bas). En moyenne un spin fait donc GROSSIR le pot. (Hypothese dite : les octets d un keccak sont uniformes -- le
///     modele de tout tirage sur hash ; test-slots-ev le recalcule en node et l echantillonne.)
///   - ⛔ R1 (verdicts adverses 2026-10-23) : un gain PLAFONNE par le pot n est JAMAIS pris en silence. settle() paie le prix ENTIER ou
///     revert PotShort (pour tout appelant, joueur compris) ; settleMany() SAUTE tout spin que le pot ne couvre pas (joueur compris : un
///     lot ne clot plus un gagnant a 0 parce qu un spin precedent du meme lot a vide le pot) ; seul acceptCapped(id, minimum), signe par
///     le JOUEUR, prend min(prix, pot), et refuse sous le minimum qu il a vu (BelowMinimum).
///   - les hashes des trois blocs sont produits par le SEQUENCEUR de Base : meme confiance que BlockRolls, dite, pas cachee. Trois blocs
///     differents ne retirent pas cette confiance (le meme sequenceur les produit) ; ils rendent les trois faces independantes entre elles.
contract BlockSlotsRouter {
    /* ---------------------------------------------------------------- constantes de la face (celles de BlockRolls) */
    uint8 public constant BANDS = 6;
    uint8 public constant ORBITS = 10;
    uint8 public constant FACETS = 19;
    uint8 public constant MATERIALS = 9;
    uint8 public constant ORNAMENTS = 8;
    uint8 public constant REELS = 3;
    uint8 public constant TRAITS = 5;
    /* 5 traits x 3 points (les trois faces egales) */
    uint8 public constant MAX_POINTS = 15;
    uint16 internal constant BPS = 10_000;
    /* (Phil 2026-10-23) le gain d UN spin : 0..5 USDC, jamais plus, quelle que soit la table */
    uint64 public constant MAX_PRIZE = 5_000000;
    uint256 public constant MAX_SPIN_PRICE = 1000_000000;
    uint256 public constant TARGET_DELAY = 2;
    /* ⛔ DENIM : blockhash() ne lit que les 256 derniers blocs. 256 blocs = ~8,5 min a 2 s/bloc, ~51 s a 200 ms/bloc (Denim). Les faces lisent
     *    targetBlock, +1, +2 : le settle passe de targetBlock + 3 a targetBlock + 256 (la fenetre du PREMIER hash). settleMany(ids) par
     *    n importe qui ; settleableUntil(id) dit jusqu a quel bloc. */
    uint256 public constant SETTLE_WINDOW = 256;
    /* la distribution exacte est sur 2^144 = (65536 x 256^4)^3 : 2 octets pour la teinte, 1 octet par autre trait, trois faces */
    uint256 public constant DIST_DENOM = 1 << 144;
    /// @notice the part of each dev batch the router sends to DEV_WALLET in USDC (10 %); the rest buys TBLOCK for DEST
    uint16 public constant DEV_BPS = 1000;

    /* ---------------------------------------------------------------- immuables */
    address public immutable USDC;
    address public immutable DEV_WALLET;
    uint256 public immutable SPIN_PRICE;
    uint16 public immutable POT_SHARE_BPS;
    /// @notice ce qu un spin met au pot : SPIN_PRICE * POT_SHARE_BPS / BPS, arrondi bas
    uint256 public immutable TO_POT;
    /// @notice le reste du prix (la part du dev) : du au DEV_WALLET DES le spin (devOwed), quoi qu il arrive au spin ensuite
    uint256 public immutable DEV_SHARE;
    /// @notice the live TblockPayRouter: the only way the owed dev share leaves this contract
    address public immutable ROUTER;
    /// @notice the canonical TBLOCK the router buys
    address public immutable TBLOCK;
    /// @notice the holders vault: every TBLOCK bought with the dev share ends there
    address public immutable DEST;
    /// @notice payDev waits until devOwed reaches this (USDC raw)
    uint256 public immutable MIN_DEV_BATCH;
    /// @notice the most one payDev sends (a constructor choice, at most the router's MAX_USDC_PER_PAY read at construction)
    uint256 public immutable MAX_DEV_BATCH;

    /* ---------------------------------------------------------------- etat */
    enum Status { None, Pending, Settled, Expired }

    /* une case : 20 + 5 + 1 = 26 octets */
    struct Spin {
        address player;
        uint40 targetBlock;
        Status status;
    }

    /* la table, fixee a la construction, jamais modifiable (aucune fonction ne l ecrit apres) */
    uint64[16] internal _prizes;
    /* le pot, tenu en compte (pas balanceOf) : un transfert direct n y entre pas.
     * Invariant de caisse : pot + devOwed <= USDC.balanceOf(this) (egal sans transfert direct). */
    uint256 public pot;
    /// @notice la part du dev de TOUS les spins (DEV_SHARE chacun, comptee au spin), pas encore envoyee : payDev() l envoie au DEV_WALLET,
    ///         et nulle part ailleurs
    uint256 public devOwed;
    uint256 public spinCount;
    mapping(uint256 => Spin) public spins;
    /// @notice les points CUMULES d un wallet (tous ses spins regles)
    mapping(address => uint256) public pointsOf;
    /// @notice ce qu un wallet a gagne en tout (USDC brut)
    mapping(address => uint256) public wonOf;
    uint256 private _lock = 1;
    /* the dev batch in flight (USDC raw): set by payDev before ROUTER.pay, cleared by onPaid; 0 at rest */
    uint256 private _batch;

    /* ---------------------------------------------------------------- evenements */
    event Funded(address indexed from, uint256 amount, uint256 potAfter);
    event Spun(uint256 indexed spinId, address indexed player, uint256 targetBlock, uint256 toPot, uint256 toDev);
    /// @dev blockHashes[r] = blockhash(targetBlock + r) ; faces[r] = [colorBand, orbit, facet, material, ornament] de la face r
    event Settled(uint256 indexed spinId, address indexed player, bytes32[3] blockHashes, uint8[5][3] faces, uint8 points, uint256 payout, uint256 potAfter, uint256 playerPoints);
    /// @dev v4 : un spin dont la fenetre est passee, MARQUE perdu ; rien n est paye ni rendu
    event Expired(uint256 indexed spinId, address indexed player);
    /// @dev one dev batch through the router: usdcIn left this contract (10 % to DEV_WALLET by the router), tblockToDest reached DEST
    event DevPaid(uint256 usdcIn, uint256 tblockToDest);

    /* ---------------------------------------------------------------- erreurs */
    error BadConfig();
    error ZeroAmount();
    error NotPending();
    error TooEarly();
    error TooLate();
    error StillSettleable();
    error HashUnavailable();
    /// @dev R1 : le pot ne couvre pas le prix ; settle() ne prend jamais moins que le prix (acceptCapped, par le joueur, le peut)
    error PotShort();
    /// @dev acceptCapped : seul le joueur du spin accepte un gain plafonne
    error NotPlayer();
    /// @dev acceptCapped : le pot a baisse sous le minimum que le joueur a vu
    error BelowMinimum();
    error TransferFailed();
    error Reentrancy();
    error NotRouter();
    error BadPayment();
    /// @dev payDev: devOwed, or the amount asked, is under MIN_DEV_BATCH
    error BatchTooSmall();
    /// @dev payDev: the amount asked is above devOwed or MAX_DEV_BATCH
    error BatchTooLarge();

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    /* ⚠️ un struct STATIQUE : encode exactement comme 20 mots a plat (usdc, devWallet, spinPrice, potShareBps, prizes[16]) -- slots-config.js */
    struct Config {
        address usdc;
        address devWallet;
        uint256 spinPrice;
        uint16 potShareBps;
        uint64[16] prizes;
    }

    /// @param c the live contract's config, unchanged (usdc, devWallet, spinPrice, potShareBps, prizes)
    /// @param router the live TblockPayRouter: its USDC must be c.usdc, its TBLOCK expectedTblock
    /// @param dest the live holders vault: must have code and hold the router's TBLOCK
    /// @param minDevBatch the least one payDev sends (1 .. maxDevBatch)
    /// @param maxDevBatch the most one payDev sends (minDevBatch .. the router's MAX_USDC_PER_PAY)
    constructor(Config memory c, address router, address dest, address expectedTblock, uint256 minDevBatch, uint256 maxDevBatch) {
        if (c.usdc == address(0) || c.usdc.code.length == 0 || c.devWallet == address(0)) revert BadConfig();
        if (c.spinPrice == 0 || c.spinPrice > MAX_SPIN_PRICE || c.potShareBps == 0 || c.potShareBps > BPS) revert BadConfig();
        /* un palier plus haut ne paie jamais moins (sinon viser moins de points rapporterait plus) ; le plus haut est borne, donc tous */
        if (c.prizes[MAX_POINTS] > MAX_PRIZE) revert BadConfig();
        for (uint256 k = 1; k <= MAX_POINTS; k++) if (c.prizes[k] < c.prizes[k - 1]) revert BadConfig();
        uint256 toPot = (c.spinPrice * c.potShareBps) / BPS;
        /* ⛔ l avantage de la maison : esperance(table) < ce qui ENTRE au pot (arrondi bas), en EXACT (DIST sur 2^144). Sans remboursement
         *    (v4), la meilleure strategie = tout regler = E[X] < toPot <= prix : le pot grossit en moyenne, et aucun jeu ne rend le prix. */
        if (expectedNumerator(c.prizes) >= toPot * DIST_DENOM) revert BadConfig();
        if (router.code.length == 0) revert BadConfig();
        address tb = ISlotsPayRouter(router).TBLOCK();
        if (expectedTblock == address(0) || tb != expectedTblock || tb.code.length == 0) revert BadConfig();
        if (ISlotsPayRouter(router).USDC() != c.usdc) revert BadConfig();
        if (dest.code.length == 0 || dest == router || dest == tb || dest == c.usdc || dest == c.devWallet) revert BadConfig();
        if (c.devWallet == router || c.devWallet == tb) revert BadConfig();
        (bool okD, bytes memory retD) = dest.staticcall(abi.encodeWithSelector(ISlotsDestToken.TBLOCK.selector));
        if (!okD || retD.length < 32 || abi.decode(retD, (address)) != tb) revert BadConfig();
        // review 2026-11-12 (Skins F1, same check here): code + TBLOCK() alone also passed the lock, Hearts, TAM art, the old Skins and
        // the lock rewards. DEST must also name THIS router and answer free(): of the live contracts only the holders vault V does.
        (okD, retD) = dest.staticcall(abi.encodeWithSelector(ISlotsDestToken.ROUTER.selector));
        if (!okD || retD.length < 32 || abi.decode(retD, (address)) != router) revert BadConfig();
        (okD, retD) = dest.staticcall(abi.encodeWithSelector(ISlotsDestToken.free.selector));
        if (!okD || retD.length < 32) revert BadConfig();
        uint256 maxBatch = ISlotsPayRouter(router).MAX_USDC_PER_PAY();
        if (minDevBatch == 0 || minDevBatch > maxDevBatch || maxDevBatch > maxBatch) revert BadConfig();
        ROUTER = router;
        TBLOCK = tb;
        DEST = dest;
        MIN_DEV_BATCH = minDevBatch;
        MAX_DEV_BATCH = maxDevBatch;
        USDC = c.usdc;
        DEV_WALLET = c.devWallet;
        SPIN_PRICE = c.spinPrice;
        POT_SHARE_BPS = c.potShareBps;
        TO_POT = toPot;
        DEV_SHARE = c.spinPrice - toPot;
        _prizes = c.prizes;
    }

    /* ================================================================ la distribution exacte et l esperance */

    /// @notice P(points = k) * 2^144, exacte (k = 0..15 ; 14 points est impossible : 4 brelans + 1 paire = 13, 5 brelans = 15).
    /// @dev recalculee par test-slots-ev-20261023.mjs depuis les tailles de listes de l app ; une derive rougit la-bas.
    function distribution() public pure returns (uint256[16] memory d) {
        d = [
            uint256(3428884117927507324050275432894715396096000),
            7648590723549578990455994844309854827315200,
            6527578137388332631356339452991262792089600,
            3030049636410835769954265030731900292956160,
            1128529664476547868524120755253584267837440,
            401588648281843774575246823645379643310080,
            104641623152789656691372415393799159676928,
            23993160804353638786393207996641284456448,
            5832161513820386403392592040574488412160,
            867871199805070864307501136160808239104,
            162423161940631315942110019698781323264,
            24911117832161626637073347965957963776,
            1647211231548846984445290325324333056,
            469003306555126851966644856318590976,
            0,
            3330897132957594620951642163380224
        ];
    }

    /// @notice somme_k P(k) * prize[k] * 2^144 : l esperance d un spin (avant le plafond du pot) = expectedNumerator / 2^144 USDC brut.
    function expectedNumerator(uint64[16] memory table) public pure returns (uint256 s) {
        uint256[16] memory d = distribution();
        for (uint256 k = 0; k <= MAX_POINTS; k++) s += d[k] * table[k];
    }

    /// @notice l esperance de la table de CE contrat, en USDC brut arrondi vers le bas (avant le plafond du pot)
    function expectedPayout() external view returns (uint256) {
        return expectedNumerator(_prizes) / DIST_DENOM;
    }

    /// @notice la MEILLEURE strategie d un joueur qui voit ses faces avant de choisir (v4) : laisser expirer ne rend RIEN, regler rend
    ///         prize[k] >= 0 ; tout regler est donc optimal et rend somme_k P(k) * max(prize[k], 0) * 2^144 = expectedNumerator(table),
    ///         strictement sous TO_POT * 2^144 <= SPIN_PRICE * 2^144 pour toute table admise (la garde du constructeur). Un plafond par le
    ///         pot ne fait que baisser ce que rend un settle.
    function bestPlayNumerator() external view returns (uint256) {
        return expectedNumerator(_prizes);
    }

    function prizes() external view returns (uint64[16] memory) {
        return _prizes;
    }

    /// @notice min(prix de `points`, pot) : ce que paierait acceptCapped maintenant (le pot peut bouger avant). settle() et settleMany()
    ///         ne paient QUE le prix entier : si cette valeur est sous le prix de la table, ils refusent (ou sautent) le spin.
    function payoutFor(uint8 points) external view returns (uint256 p) {
        if (points > MAX_POINTS) return 0;
        p = _prizes[points];
        if (p > pot) p = pot;
    }

    /* ================================================================ pot */

    /// @notice n importe qui ajoute de l USDC au pot. Sans retour possible.
    function fund(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        pot += amount;
        _pull(msg.sender, address(this), amount);
        emit Funded(msg.sender, amount, pot);
    }

    /* ================================================================ spin */

    /// @notice un spin paye : SPIN_PRICE entre au contrat (approve EXACT cote app) et il est PARTAGE ICI, une fois pour toutes : TO_POT
    ///         au pot, DEV_SHARE du au dev (devOwed). Le hasard : les hashes des blocs block.number + 2, + 3 et + 4, qui n existent pas
    ///         encore (une face chacun). Un spin non regle dans sa fenetre est perdu : rien n est rendu.
    function spin() external nonReentrant returns (uint256 spinId) {
        spinId = ++spinCount;
        uint40 t = uint40(block.number + TARGET_DELAY);
        spins[spinId] = Spin({ player: msg.sender, targetBlock: t, status: Status.Pending });
        pot += TO_POT;
        devOwed += DEV_SHARE;
        _pull(msg.sender, address(this), SPIN_PRICE);
        emit Spun(spinId, msg.sender, t, TO_POT, DEV_SHARE);
    }

    /* ================================================================ settle / acceptCapped / expire / payDev */

    /// @notice APPELABLE PAR TOUS : le gain va TOUJOURS au joueur du spin, jamais a l appelant. Le contrat juge (faces, points) et paie le
    ///         prix ENTIER de la table. ⛔ R1 : si le pot ne le couvre pas, PotShort -- pour tout appelant, joueur compris (acceptCapped).
    function settle(uint256 spinId) external nonReentrant returns (uint8 points, uint256 payout) {
        (Spin storage s, bytes32[3] memory h) = _ouvert(spinId);
        uint8[5][3] memory f;
        (f, points, payout) = _juger(h, spinId);
        if (payout > pot) revert PotShort();
        _payer(spinId, s, h, f, points, payout);
    }

    /// @notice le JOUEUR seul accepte un gain PLAFONNE par le pot : paie min(prix, pot), et refuse si c est sous `minPayout` (le montant
    ///         qu il a vu avant de signer ; le pot peut baisser entre-temps). Avec un pot suffisant, c est un settle au prix entier.
    function acceptCapped(uint256 spinId, uint256 minPayout) external nonReentrant returns (uint8 points, uint256 payout) {
        (Spin storage s, bytes32[3] memory h) = _ouvert(spinId);
        if (msg.sender != s.player) revert NotPlayer();
        uint8[5][3] memory f;
        (f, points, payout) = _juger(h, spinId);
        if (payout > pot) payout = pot;
        if (payout < minPayout) revert BelowMinimum();
        _payer(spinId, s, h, f, points, payout);
    }

    /// @notice plusieurs spins en une transaction, par n importe qui. Un spin non reglable (pas en attente, trop tot, hors fenetre, hash
    ///         illisible, ou pot qui ne couvre pas son prix ENTIER -- pour tout appelant, joueur compris) est SAUTE, jamais clos au rabais
    ///         ni la raison d un revert du lot. Les spins passent dans l ordre donne. Rend le nombre regles.
    function settleMany(uint256[] calldata ids) external nonReentrant returns (uint256 done) {
        for (uint256 i = 0; i < ids.length; i++) {
            Spin storage s = spins[ids[i]];
            if (s.status != Status.Pending) continue;
            uint256 t = s.targetBlock;
            if (block.number <= t + (REELS - 1) || block.number > t + SETTLE_WINDOW) continue;
            (bool lu, bytes32[3] memory h) = _hashes(t);
            if (!lu) continue;
            (uint8[5][3] memory f, uint8 points, uint256 payout) = _juger(h, ids[i]);
            if (payout > pot) continue;
            _payer(ids[i], s, h, f, points, payout);
            done++;
        }
    }

    /// @dev un spin en attente, dans sa fenetre, aux trois hashes lisibles -- sinon la raison exacte
    function _ouvert(uint256 spinId) internal view returns (Spin storage s, bytes32[3] memory h) {
        s = spins[spinId];
        if (s.status != Status.Pending) revert NotPending();
        uint256 t = s.targetBlock;
        if (block.number <= t + (REELS - 1)) revert TooEarly();
        if (block.number > t + SETTLE_WINDOW) revert TooLate();
        bool lu;
        (lu, h) = _hashes(t);
        if (!lu) revert HashUnavailable();
    }

    /// @dev les trois hashes : blockhash(t), blockhash(t + 1), blockhash(t + 2) ; faux si l un est illisible (0)
    function _hashes(uint256 t) internal view returns (bool lu, bytes32[3] memory h) {
        for (uint256 r = 0; r < REELS; r++) {
            h[r] = blockhash(t + r);
            if (h[r] == bytes32(0)) return (false, h);
        }
        lu = true;
    }

    /// @dev les faces, les points et le prix de la TABLE (avant le pot)
    function _juger(bytes32[3] memory h, uint256 spinId) internal view returns (uint8[5][3] memory f, uint8 points, uint256 prize) {
        f = facesOf(h, spinId);
        points = pointsFor(f);
        prize = _prizes[points];
    }

    /// @dev clot le spin et paie `payout` (<= pot, verifie par l appelant) au joueur ; la part du dev est deja due depuis le spin
    function _payer(uint256 spinId, Spin storage s, bytes32[3] memory h, uint8[5][3] memory f, uint8 points, uint256 payout) internal {
        address player = s.player;
        s.status = Status.Settled;
        pot -= payout;
        uint256 total = pointsOf[player] + points;
        pointsOf[player] = total;
        wonOf[player] += payout;
        if (payout != 0) _push(player, payout);
        emit Settled(spinId, player, h, f, points, payout, pot, total);
    }

    /// @notice v4 : MARQUE perdu un spin que plus personne ne peut regler (fenetre passee), par n importe qui. Aucun transfert : rien
    ///         n est paye ni rendu (la part du pot est au pot, celle du dev est due depuis le spin). Facultatif : un spin hors fenetre est
    ///         deja perdu sans cet appel ; expire() ne fait que passer son statut de Pending a Expired.
    function expire(uint256 spinId) external {
        Spin storage s = spins[spinId];
        if (s.status != Status.Pending) revert NotPending();
        if (block.number <= uint256(s.targetBlock) + SETTLE_WINDOW) revert StillSettleable();
        s.status = Status.Expired;
        emit Expired(spinId, s.player);
    }

    /// @notice ANYONE pays one dev batch of `amount` through ROUTER: MIN_DEV_BATCH <= amount <= min(devOwed, MAX_DEV_BATCH), else
    ///         BatchTooSmall / BatchTooLarge. The caller picks the size (review F1/F2): when the pool cannot take a large batch within
    ///         the router's guards, a smaller one still pays. The router pulls exactly that USDC from here, sends 10 % to DEV_WALLET in USDC, buys TBLOCK with the rest (refusing below minTblockOut and
    ///         below its own floor, after deadline, or when any of its guards fails: then NOTHING moves and devOwed is unchanged), and
    ///         onPaid forwards that TBLOCK to DEST. The pot is never touched. Returns the batch sent and the TBLOCK that reached DEST.
    function payDev(uint256 amount, uint256 minTblockOut, uint256 deadline)
        external
        nonReentrant
        returns (uint256, uint256 tblockOut)
    {
        uint256 owed = devOwed;
        if (owed < MIN_DEV_BATCH || amount < MIN_DEV_BATCH) revert BatchTooSmall();
        if (amount > owed || amount > MAX_DEV_BATCH) revert BatchTooLarge();
        devOwed = owed - amount;
        _batch = amount;
        uint256 before = _bal(USDC, address(this));
        _call(USDC, abi.encodeWithSelector(0x095ea7b3, ROUTER, amount)); // approve(ROUTER, amount): exact
        tblockOut = ISlotsPayRouter(ROUTER).pay(address(this), amount, minTblockOut, deadline, "");
        if (_batch != 0) revert BadPayment(); // onPaid ran, for this batch, and forwarded the TBLOCK
        if (before - _bal(USDC, address(this)) != amount) revert TransferFailed(); // exactly the batch left, nothing else
        return (amount, tblockOut);
    }

    /// @notice read by the router: the batch payDev is paying now; 0 outside payDev
    function PRICE_USDC() external view returns (uint256) {
        return _batch;
    }

    /// @notice read by the router: 10 % of each batch to DEV_WALLET in USDC, the rest bought as TBLOCK
    function USDC_SPLIT() external view returns (address devWallet, uint16 devBps) {
        return (DEV_WALLET, DEV_BPS);
    }

    /// @notice the holders vault the dev share's TBLOCK goes to (= DEST). No play is reported to it.
    function VAULT() external view returns (address) {
        return DEST;
    }

    /// @notice called by ROUTER, LAST, inside payDev only (this contract is the payer): forwards every TBLOCK held here to DEST and
    ///         checks DEST received it. Not under the lock on purpose: payDev holds it, and _batch proves the call is payDev's own.
    function onPaid(address payer, uint256 usdcIn, uint256 tblockOut, bytes calldata) external {
        if (msg.sender != ROUTER) revert NotRouter();
        uint256 b = _batch;
        if (b == 0 || usdcIn != b || payer != address(this) || tblockOut == 0) revert BadPayment();
        _batch = 0;
        uint256 got = _bal(TBLOCK, address(this));
        if (got < tblockOut) revert BadPayment();
        uint256 destBefore = _bal(TBLOCK, DEST);
        _call(TBLOCK, abi.encodeWithSelector(0xa9059cbb, DEST, got));
        if (_bal(TBLOCK, DEST) - destBefore < got || _bal(TBLOCK, address(this)) != 0) revert TransferFailed();
        emit DevPaid(usdcIn, got);
    }

    /// @notice le DERNIER bloc ou settle(id) passe encore ; 0 si le spin n est pas en attente
    function settleableUntil(uint256 spinId) external view returns (uint256) {
        Spin storage s = spins[spinId];
        if (s.status != Status.Pending) return 0;
        return uint256(s.targetBlock) + SETTLE_WINDOW;
    }

    /* ================================================================ lectures pures (pour l app et la parite) */

    /// @notice la graine de la face `reel` d un spin : keccak256(abi.encode(blockHash, spinId, reel)), blockHash = celui du bloc
    ///         targetBlock + reel. L id rend deux spins des memes blocs independants (sinon tous les joueurs d un bloc auraient les memes faces).
    function seedOf(bytes32 blockHash, uint256 spinId, uint256 reel) public pure returns (bytes32) {
        return keccak256(abi.encode(blockHash, spinId, reel));
    }

    /// @notice les trois faces d un spin : la face r sur le hash de SON bloc (blockHashes[r] = blockhash(targetBlock + r))
    function facesOf(bytes32[3] memory blockHashes, uint256 spinId) public pure returns (uint8[5][3] memory f) {
        for (uint256 r = 0; r < REELS; r++) f[r] = faceOf(seedOf(blockHashes[r], spinId, r));
    }

    /// @notice par trait : 3 faces egales = 3 points, 2 egales = 1 point
    function pointsFor(uint8[5][3] memory f) public pure returns (uint8 p) {
        for (uint256 i = 0; i < TRAITS; i++) {
            uint8 a = f[0][i];
            uint8 b = f[1][i];
            uint8 c = f[2][i];
            if (a == b && b == c) p += 3;
            else if (a == b || b == c || a == c) p += 1;
        }
    }

    /// @notice la face d un hash, EXACTEMENT comme BlockRolls.faceOf (et face-du-jour.js faceRevelee) : [colorBand, orbit, facet, material, ornament]
    function faceOf(bytes32 h) public pure returns (uint8[5] memory face) {
        bytes32 k = keccak256(_hexAddress(bytes20(h)));
        uint256 teinte = (uint256(uint8(k[0])) * 256 + uint8(k[1])) % 361;
        face[0] = uint8(((teinte + 30) % 360) / 60);
        face[1] = uint8(k[6]) % ORBITS;
        face[2] = uint8(k[7]) % FACETS;
        face[3] = uint8(k[8]) % MATERIALS;
        face[4] = uint8(k[9]) % ORNAMENTS;
    }

    /* ================================================================ interne */

    /// @dev "0x" + 40 caracteres hex minuscules (42 octets ASCII)
    function _hexAddress(bytes20 a) internal pure returns (bytes memory s) {
        bytes16 hexd = "0123456789abcdef";
        s = new bytes(42);
        s[0] = "0";
        s[1] = "x";
        for (uint256 i = 0; i < 20; i++) {
            uint8 b = uint8(a[i]);
            s[2 + 2 * i] = hexd[b >> 4];
            s[3 + 2 * i] = hexd[b & 0x0f];
        }
    }

    function _pull(address from, address to, uint256 amount) internal {
        (bool ok, bytes memory ret) = USDC.call(abi.encodeWithSelector(0x23b872dd, from, to, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }

    function _push(address to, uint256 amount) internal {
        (bool ok, bytes memory ret) = USDC.call(abi.encodeWithSelector(0xa9059cbb, to, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }

    function _call(address token, bytes memory data) internal {
        (bool ok, bytes memory ret) = token.call(data);
        if (!ok || (ret.length != 0 && (ret.length < 32 || abi.decode(ret, (uint256)) != 1)) || token.code.length == 0) revert TransferFailed();
    }

    function _bal(address token, address who) internal view returns (uint256) {
        (bool ok, bytes memory ret) = token.staticcall(abi.encodeWithSelector(0x70a08231, who));
        if (!ok || ret.length < 32) revert TransferFailed();
        return abi.decode(ret, (uint256));
    }
}
