// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/BlockSlotsRouter.sol";

/// @dev USDC de test : 6 decimales, transferFrom standard, et un mode Â« rend false Â» pour la garde SafeERC20.
contract UsdcSR {
    uint8 public constant decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    bool public renvoieFaux;

    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function setFaux(bool f) external { renvoieFaux = f; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }

    function transfer(address to, uint256 a) external virtual returns (bool) {
        if (renvoieFaux) return false;
        require(balanceOf[msg.sender] >= a, "balance");
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }

    function transferFrom(address f, address to, uint256 a) external virtual returns (bool) {
        return _tf(f, to, a);
    }

    function _tf(address f, address to, uint256 a) internal returns (bool) {
        if (renvoieFaux) return false;
        require(allowance[f][msg.sender] >= a, "allowance");
        require(balanceOf[f] >= a, "balance");
        allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[to] += a;
        return true;
    }
}

/// @dev jeton HOSTILE : pendant un paiement du contrat (gain, part du dev), il tente de re-entrer avec `donnee`
///      (settle, settleMany, expire, payDev d un autre spin).
contract UsdcHostileSR is UsdcSR {
    BlockSlotsRouter public cible;
    bytes public donnee;
    bytes4 public erreurVue;
    bool public reentreeReussie;
    bool public tente;

    function armer(BlockSlotsRouter c, uint256 id, bool lot) external {
        cible = c;
        if (lot) {
            uint256[] memory ids = new uint256[](1);
            ids[0] = id;
            donnee = abi.encodeWithSelector(BlockSlotsRouter.settleMany.selector, ids);
        } else {
            donnee = abi.encodeWithSelector(BlockSlotsRouter.settle.selector, id);
        }
    }

    function armerDonnee(BlockSlotsRouter c, bytes memory d) external { cible = c; donnee = d; }

    function transfer(address to, uint256 a) external override returns (bool) {
        if (address(cible) != address(0) && msg.sender == address(cible)) _reentrer();
        require(balanceOf[msg.sender] >= a, "balance");
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }

    /// @dev NEW: payDev no longer calls transfer: the ROUTER pulls this contract's USDC (transferFrom from it), inside payDev's lock
    function transferFrom(address f, address to, uint256 a) external override returns (bool) {
        if (address(cible) != address(0) && f == address(cible)) _reentrer();
        return _tf(f, to, a);
    }

    function _reentrer() internal {
        tente = true;
        bytes memory d = donnee;
        (bool ok, bytes memory ret) = address(cible).call(d);
        reentreeReussie = ok;
        if (!ok && ret.length >= 4) erreurVue = bytes4(ret);
    }
}

/// @dev the TBLOCK the router "buys" (minted by the router stand-in). Review F4 (2026-11-12): mode 1 = a transfer TO `court` delivers
///      1 raw unit less; mode 2 = after a transfer the sender keeps 1 raw unit (something stays with the sender)
contract JetonTbSR {
    mapping(address => uint256) public balanceOf;
    uint8 public mode;
    address public court;

    function regler(uint8 m, address c) external {
        mode = m;
        court = c;
    }

    function mint(address to, uint256 a) external {
        balanceOf[to] += a;
    }

    function transfer(address to, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a;
        balanceOf[to] += (mode == 1 && to == court && a != 0) ? a - 1 : a;
        if (mode == 2 && a != 0) balanceOf[msg.sender] += 1;
        return true;
    }
}

/// @dev the holders vault stand-in: it names its TBLOCK, its ROUTER and answers free() (the constructor checks the three, review
///      2026-11-12) and does nothing else. free() is a constant here: the test of a codeless TBLOCK must reach its own guard.
contract CoffreSR {
    address public TBLOCK;
    address public ROUTER;

    constructor(address t) {
        TBLOCK = t;
    }

    function setRouter(address r) external {
        ROUTER = r;
    }

    function free() external pure returns (uint256) {
        return 0;
    }
}

/// @dev review 2026-11-12: a vault-like contract that names the TBLOCK and the router but has no free() (TAM art, the old Skins)
contract SansFreeSL {
    address public TBLOCK;
    address public ROUTER;

    constructor(address t, address r) {
        TBLOCK = t;
        ROUTER = r;
    }
}

interface ISlotsGameSR {
    function PRICE_USDC() external view returns (uint256);
    function USDC_SPLIT() external view returns (address, uint16);
    function onPaid(address payer, uint256 usdcIn, uint256 tblockOut, bytes calldata data) external;
}

/// @dev TblockPayRouter stand-in with the real router's money path (pulls EXACTLY the game's PRICE_USDC from msg.sender only, sends
///      the USDC_SPLIT cut to the dev wallet, "buys" TBLOCK with the rest at a fixed rate, sends it to the game, calls onPaid LAST).
///      The real router is run in BlockSlotsRouter.real.t.sol. mode 1 = reverts, 2 = calls onPaid for another payer, 3 = never calls onPaid,
///      4 = pulls 1 raw USDC less than the batch. Review F4 (2026-11-12): 5 = onPaid with usdcIn + 1, 6 = delivers and reports 0 TBLOCK,
///      7 = reports 1 more TBLOCK than it delivered.
contract RouteurSR {
    address public immutable USDC;
    address public immutable TBLOCK;
    uint256 public constant MAX_USDC_PER_PAY = 50_000_000;
    uint256 public constant TAUX = 1e15; // 1 raw USDC buys 1e15 raw TBLOCK
    uint8 public mode;
    uint256 public nb;

    constructor(address u, address t) {
        USDC = u;
        TBLOCK = t;
    }

    function regler(uint8 m) external {
        mode = m;
    }

    function pay(address game, uint256 usdcIn, uint256 minOut, uint256 deadline, bytes calldata data) external returns (uint256 out) {
        require(block.timestamp <= deadline, "deadline");
        require(minOut != 0, "minOut");
        require(mode != 1, "routeur en panne");
        require(usdcIn != 0 && usdcIn == ISlotsGameSR(game).PRICE_USDC(), "price");
        (address dev, uint16 bps) = ISlotsGameSR(game).USDC_SPLIT();
        nb++;
        require(UsdcSR(USDC).transferFrom(msg.sender, address(this), mode == 4 ? usdcIn - 1 : usdcIn), "pull");
        uint256 cut = usdcIn * bps / 10_000;
        require(UsdcSR(USDC).transfer(dev, cut), "cut");
        out = (usdcIn - cut) * TAUX;
        require(out >= minOut, "minOut");
        uint256 sent = out;
        if (mode == 6) {
            out = 0;
            sent = 0;
        }
        if (mode == 7) sent = out - 1;
        JetonTbSR(TBLOCK).mint(game, sent);
        if (mode == 3) return out;
        ISlotsGameSR(game).onPaid(mode == 2 ? address(0xBAD) : msg.sender, mode == 5 ? usdcIn + 1 : usdcIn, out, data);
    }
}

/// @dev review 2026-11-12: a router stand-in that also answers the vault views (ROUTER() == itself, free()), so that only the
///      constructor's dest == router guard can refuse it as DEST
contract RouteurNommeSL is RouteurSR {
    constructor(address u, address t) RouteurSR(u, t) {}

    function ROUTER() external view returns (address) {
        return address(this);
    }

    function free() external pure returns (uint256) {
        return 0;
    }
}

contract BlockSlotsRouterTest is Test {
    UsdcSR usdc;
    BlockSlotsRouter bs;
    JetonTbSR tblock;
    CoffreSR coffre;
    RouteurSR routeur;
    /// @dev one spin's dev share: payDev may send as soon as one spin is owed (the threshold itself is tested with 1 USDC below)
    uint256 constant MIN_LOT = 250_000;
    /// @dev the most one payDev sends: a constructor choice since review F1/F2 (2026-11-12), at most the router's 50 USDC
    uint256 constant MAX_LOT = 50_000_000;
    address DEV = address(0xD3F);
    address JOUEUR = address(0xA11);
    address AUTRE = address(0xB22);
    address DONATEUR = address(0xC33);

    uint256 constant SPIN = 500_000;
    /* la table de contracts/slots-parametres.json (0..15 points), en USDC brut */
    uint64[16] TABLE = [uint64(0), 0, 0, 250_000, 750_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000, 5_000_000, 5_000_000, 5_000_000, 5_000_000, 5_000_000, 5_000_000, 5_000_000];

    event Spun(uint256 indexed spinId, address indexed player, uint256 targetBlock, uint256 toPot, uint256 toDev);
    /// @dev v4 (option 3 de Phil, 2026-10-23) : l expiration MARQUE le spin perdu, sans aucun montant (rien n est rendu)
    event Expired(uint256 indexed spinId, address indexed player);

    /* â›” v3/v4 (verdicts adverses 2026-10-23 + regles de Phil) : les fonctions NOUVELLES (acceptCapped, payDev, devOwed, DEV_SHARE,
     *    bestPlayNumerator) sont appelees ICI par des appels BAS NIVEAU : ce fichier compile donc contre les ANCIENS contrats (e14bd89,
     *    300d9e2), et chaque test v4 peut y etre lance pour ROUGIR (et non Â« ne compile pas Â»). */
    function _lireU(string memory sig) internal view returns (uint256) {
        (bool ok, bytes memory r) = address(bs).staticcall(abi.encodeWithSignature(sig));
        require(ok && r.length == 32, string.concat("lecture impossible : ", sig));
        return abi.decode(r, (uint256));
    }

    function _accepter(address qui, uint256 id, uint256 minimum) internal returns (bool ok, bytes memory r) {
        vm.prank(qui);
        (ok, r) = address(bs).call(abi.encodeWithSignature("acceptCapped(uint256,uint256)", id, minimum));
    }

    /// @dev the largest batch payDev takes now: min(devOwed, MAX_DEV_BATCH) (CHANGED, review F1: the caller names the amount)
    function _lot(BlockSlotsRouter x) internal view returns (uint256 a) {
        a = x.devOwed();
        if (a > x.MAX_DEV_BATCH()) a = x.MAX_DEV_BATCH();
    }

    function _payDev(address qui) internal returns (bool ok, bytes memory r) {
        uint256 a = _lot(bs);
        vm.prank(qui);
        (ok, r) = address(bs).call(abi.encodeWithSignature("payDev(uint256,uint256,uint256)", a, uint256(1), block.timestamp));
    }

    function _erreur(bytes memory r) internal pure returns (bytes4 e) {
        if (r.length >= 4) e = bytes4(r);
    }

    /// @dev l invariant de caisse (v4) : le solde USDC du contrat = pot + parts du dev dues (devOwed) -- rien n est tenu en attente
    function _caisse() internal view {
        assertEq(usdc.balanceOf(address(bs)), bs.pot() + _lireU("devOwed()"), "solde = pot + devOwed");
    }

    /// @dev the live config + the router, the vault, the TBLOCK and the batch minimum. A USDC other than the default one gets its own
    ///      router stand-in (the constructor requires router.USDC() == c.usdc); a codeless one is refused before the router is read.
    function _nouveau(BlockSlotsRouter.Config memory c) internal returns (BlockSlotsRouter) {
        RouteurSR r = routeur;
        CoffreSR v = coffre;
        if (c.usdc != address(usdc) && c.usdc.code.length != 0) {
            r = new RouteurSR(c.usdc, address(tblock));
            v = new CoffreSR(address(tblock)); // CHANGED (review 2026-11-12): the vault must name the game's router
            v.setRouter(address(r));
        }
        return new BlockSlotsRouter(c, address(r), address(v), address(tblock), MIN_LOT, MAX_LOT);
    }

    function nouveauExterne(BlockSlotsRouter.Config memory c) external returns (BlockSlotsRouter) {
        return _nouveau(c);
    }

    function setUp() public {
        vm.roll(1000);
        usdc = new UsdcSR();
        tblock = new JetonTbSR();
        coffre = new CoffreSR(address(tblock));
        routeur = new RouteurSR(address(usdc), address(tblock));
        coffre.setRouter(address(routeur));
        bs = _nouveau(_cfg(address(usdc)));
        usdc.mint(JOUEUR, 10_000_000_000);
        usdc.mint(AUTRE, 10_000_000_000);
        usdc.mint(DONATEUR, 100_000_000_000);
    }

    function _cfg(address t) internal view returns (BlockSlotsRouter.Config memory c) {
        c = BlockSlotsRouter.Config(t, DEV, SPIN, 5000, TABLE);
    }

    function _refuse(BlockSlotsRouter.Config memory c) internal {
        vm.expectRevert(BlockSlotsRouter.BadConfig.selector);
        _nouveau(c);
    }

    function _spin(address p) internal returns (uint256 id) {
        vm.startPrank(p);
        usdc.approve(address(bs), SPIN);
        id = bs.spin();
        vm.stopPrank();
    }

    function _fund(uint256 a) internal {
        vm.startPrank(DONATEUR);
        usdc.approve(address(bs), a);
        bs.fund(a);
        vm.stopPrank();
    }

    /// @dev trois hashes distincts tires d un seul (pour les tests qui n epinglent pas les faces)
    function _deriver(bytes32 h) internal pure returns (bytes32[3] memory d) {
        d[0] = h;
        d[1] = keccak256(abi.encode(h, uint256(1)));
        d[2] = keccak256(abi.encode(h, uint256(2)));
    }

    /// @dev pose les hashes des blocs cible, +1, +2 et avance au premier bloc ou le spin se regle (cible + 3)
    function _revele(uint256 id, bytes32 h) internal {
        _reveleTrois(id, _deriver(h));
    }

    function _poserTrois(uint256 t, bytes32[3] memory h) internal {
        for (uint256 r = 0; r < 3; r++) vm.setBlockhash(t + r, h[r]);
    }

    /* ------------------------------------------------------------ configuration */

    function test_ConfigImmuable() public view {
        assertEq(bs.USDC(), address(usdc));
        assertEq(bs.DEV_WALLET(), DEV);
        assertEq(bs.SPIN_PRICE(), SPIN);
        assertEq(bs.POT_SHARE_BPS(), 5000);
        uint64[16] memory p = bs.prizes();
        for (uint256 k = 0; k < 16; k++) assertEq(p[k], TABLE[k], "table lue = table construite");
        assertEq(bs.SETTLE_WINDOW(), 256);
        assertEq(bs.TARGET_DELAY(), 2);
        assertEq(bs.MAX_POINTS(), 15);
        assertEq(_lireU("TO_POT()"), 250_000, "part du pot d un spin");
        assertEq(_lireU("DEV_SHARE()"), 250_000, "v4 : la part du dev, due des le spin");
        (bool ok,) = address(bs).staticcall(abi.encodeWithSignature("REFUND()"));
        assertFalse(ok, "v4 : plus de REFUND");
        assertEq(bs.ROUTER(), address(routeur));
        assertEq(bs.TBLOCK(), address(tblock));
        assertEq(bs.DEST(), address(coffre));
        assertEq(bs.VAULT(), address(coffre));
        assertEq(bs.MIN_DEV_BATCH(), MIN_LOT);
        assertEq(bs.MAX_DEV_BATCH(), MAX_LOT, "CHANGED: the constructor's maxDevBatch");
        assertEq(bs.PRICE_USDC(), 0, "no batch at rest");
        (address dw, uint16 bps) = bs.USDC_SPLIT();
        assertEq(dw, DEV);
        assertEq(bps, 1000);
        (ok,) = address(bs).staticcall(abi.encodeWithSignature("payDev()"));
        assertFalse(ok, "the old payDev() (all of devOwed in USDC) is gone");
        (ok,) = address(bs).staticcall(abi.encodeWithSignature("escrow()"));
        assertFalse(ok, "v4 : plus d escrow");
    }

    function test_ConfigRefusee() public {
        BlockSlotsRouter.Config memory c = _cfg(address(usdc));
        c.usdc = address(0); _refuse(c);
        c = _cfg(address(usdc)); c.usdc = address(0x1234); _refuse(c); /* pas de code */
        c = _cfg(address(usdc)); c.devWallet = address(0); _refuse(c);
        c = _cfg(address(usdc)); c.spinPrice = 0; _refuse(c);
        /* prix nul avec une table nulle : l esperance (0) ne refuserait pas a elle seule */
        c = _cfg(address(usdc)); c.spinPrice = 0;
        for (uint256 k = 0; k < 16; k++) c.prizes[k] = 0;
        _refuse(c);
        c = _cfg(address(usdc)); c.spinPrice = 1000_000001; _refuse(c);
        c = _cfg(address(usdc)); c.potShareBps = 0; _refuse(c);
        c = _cfg(address(usdc)); c.potShareBps = 10_001; _refuse(c);
    }

    function test_TableNonOrdonneeRefusee() public {
        BlockSlotsRouter.Config memory c = _cfg(address(usdc));
        c.prizes[4] = 200_000; /* 4 points paierait moins que 3 */
        _refuse(c);
    }

    function test_TableAuDelaDuMaxRefusee() public {
        BlockSlotsRouter.Config memory c = _cfg(address(usdc));
        c.prizes[15] = 1000_000001;
        _refuse(c);
    }

    /// @dev â›” l avantage de la maison : une table dont l esperance atteint la part du pot est REFUSEE par le constructeur
    function test_EsperanceTropHauteRefusee() public {
        BlockSlotsRouter.Config memory c = _cfg(address(usdc));
        c.prizes[3] = 1_200_000; c.prizes[4] = 1_200_000; c.prizes[5] = 2_000_000; /* 3 points : 0,136 x 1,2 = 0,163 deja, total ~0,28 > 0,25 */
        _refuse(c);
        /* la meme table passe si toute la mise va au pot (esperance < 0,50) */
        c.potShareBps = 10_000;
        _nouveau(c);
    }

    /// @dev le bord EXACT : une table Â« x pour 3 points et plus Â» ; le plus grand x admis est lim, lim + 1 est refuse
    function test_EsperanceAuBordExact() public {
        uint256[16] memory d = bs.distribution();
        uint256 s3;
        for (uint256 k = 3; k < 16; k++) s3 += d[k];
        uint256 r = SPIN * 5000 * bs.DIST_DENOM();
        uint256 lim = (r - 1) / (s3 * 10_000);
        BlockSlotsRouter.Config memory c = _cfg(address(usdc));
        for (uint256 k = 0; k < 16; k++) c.prizes[k] = k >= 3 ? uint64(lim) : 0;
        BlockSlotsRouter admis = _nouveau(c);
        assertLt(admis.expectedNumerator(c.prizes) * 10_000, r, "lim : sous le bord");
        for (uint256 k = 3; k < 16; k++) c.prizes[k] = uint64(lim + 1);
        _refuse(c);
    }

    /* ------------------------------------------------------------ distribution exacte */

    function test_DistributionSommeAuDenominateur() public view {
        uint256[16] memory d = bs.distribution();
        uint256 s;
        for (uint256 k = 0; k < 16; k++) s += d[k];
        assertEq(s, bs.DIST_DENOM(), "somme des probabilites = 1 exactement");
        assertEq(d[14], 0, "14 points est impossible");
        assertEq(bs.DIST_DENOM(), uint256(1) << 144);
    }

    function test_EsperanceDeLaTable() public view {
        /* 0,127862 USDC par spin (127 862 brut, arrondi vers le bas), recalcule par test-slots-ev et test-slots-v2 en node */
        assertEq(bs.expectedPayout(), 127_862);
        assertLt(bs.expectedPayout(), SPIN, "esperance strictement sous le prix");
        assertLt(bs.expectedPayout() * 10_000, SPIN * 5000, "esperance < part du pot (0,25)");
    }

    /* ------------------------------------------------------------ spin */

    function test_SpinPaieEtPartage() public {
        uint256 j0 = usdc.balanceOf(JOUEUR);
        vm.startPrank(JOUEUR);
        usdc.approve(address(bs), SPIN);
        vm.expectEmit(true, true, false, true);
        emit Spun(1, JOUEUR, 1002, 250_000, 250_000);
        uint256 id = bs.spin();
        vm.stopPrank();
        assertEq(id, 1);
        assertEq(j0 - usdc.balanceOf(JOUEUR), SPIN, "le joueur paie le prix exact");
        assertEq(usdc.balanceOf(DEV), 0, "la part du dev part par payDev()");
        assertEq(bs.pot(), 250_000, "50 % au pot");
        assertEq(_lireU("devOwed()"), 250_000, "v4 : 50 % DUS au dev des le spin");
        assertEq(usdc.balanceOf(address(bs)), 500_000);
        _caisse();
        (address p, uint40 t, BlockSlotsRouter.Status s) = bs.spins(1);
        assertEq(p, JOUEUR);
        assertEq(t, 1002, "cible = bloc + 2");
        assertEq(uint256(s), uint256(BlockSlotsRouter.Status.Pending));
        assertEq(usdc.allowance(JOUEUR, address(bs)), 0, "approve exact consomme");
    }

    function test_SpinApprobationInsuffisante() public {
        vm.startPrank(JOUEUR);
        usdc.approve(address(bs), SPIN - 1);
        vm.expectRevert(BlockSlotsRouter.TransferFailed.selector);
        bs.spin();
        vm.stopPrank();
    }

    /* ------------------------------------------------------------ fenetre */

    function test_SettleTropTot() public {
        uint256 id = _spin(JOUEUR);
        vm.expectRevert(BlockSlotsRouter.TooEarly.selector);
        bs.settle(id);
        vm.roll(1002);
        vm.expectRevert(BlockSlotsRouter.TooEarly.selector);
        bs.settle(id);
    }

    function test_SettleDernierBlocDeLaFenetre() public {
        uint256 id = _spin(JOUEUR);
        vm.roll(1002 + 256);
        _poserTrois(1002, _deriver(keccak256("dernier")));
        assertEq(bs.settleableUntil(id), 1258);
        bs.settle(id);
        assertEq(bs.settleableUntil(id), 0);
    }

    function test_SettleHorsFenetreEtExpire() public {
        uint256 id = _spin(JOUEUR);
        vm.roll(1002 + 257);
        vm.expectRevert(BlockSlotsRouter.TooLate.selector);
        bs.settle(id);
        uint256 pot0 = bs.pot();
        uint256 b0 = usdc.balanceOf(address(bs));
        uint256 j0 = usdc.balanceOf(JOUEUR);
        vm.expectEmit(true, true, false, true);
        emit Expired(id, JOUEUR);
        bs.expire(id);
        (,, BlockSlotsRouter.Status s) = bs.spins(id);
        assertEq(uint256(s), uint256(BlockSlotsRouter.Status.Expired));
        assertEq(bs.pot(), pot0, "le pot garde sa part");
        assertEq(usdc.balanceOf(JOUEUR), j0, "v4 : rien ne revient au joueur");
        assertEq(usdc.balanceOf(address(bs)), b0, "v4 : expire ne deplace rien");
        assertEq(_lireU("devOwed()"), 250_000, "v4 : la part du dev reste due");
        _caisse();
        vm.expectRevert(BlockSlotsRouter.NotPending.selector);
        bs.expire(id);
    }

    function test_ExpireAvantLaFinRefuse() public {
        uint256 id = _spin(JOUEUR);
        vm.roll(1002 + 256);
        vm.expectRevert(BlockSlotsRouter.StillSettleable.selector);
        bs.expire(id);
    }

    /// @dev v4 (option 3 de Phil) : un spin non regle dans sa fenetre est PERDU. expire() par N IMPORTE QUI ne paie personne : ni le
    ///      joueur, ni l appelant ; la part du pot reste au pot, la part du dev reste due (et payDev l envoie). Pas de refund() a part.
    function test_V4_ExpireNeRendRien() public {
        uint256 id = _spin(JOUEUR);
        uint256 j0 = usdc.balanceOf(JOUEUR);
        uint256 a0 = usdc.balanceOf(AUTRE);
        uint256 b0 = usdc.balanceOf(address(bs));
        vm.roll(1002 + 300);
        vm.prank(AUTRE);
        bs.expire(id);
        (bool ok,) = address(bs).call(abi.encodeWithSignature("refund(uint256)", id));
        assertFalse(ok, "pas de refund() a part");
        assertEq(usdc.balanceOf(JOUEUR), j0, "le joueur ne recupere rien");
        assertEq(usdc.balanceOf(AUTRE), a0, "l appelant ne touche rien");
        assertEq(usdc.balanceOf(address(bs)), b0, "rien ne sort du contrat");
        assertEq(bs.pot(), 250_000, "la part du pot reste au pot");
        assertEq(_lireU("devOwed()"), 250_000, "le dev est du de sa part, spin perdu compris");
        _caisse();
        (bool okDev,) = _payDev(AUTRE);
        assertTrue(okDev);
        assertEq(usdc.balanceOf(DEV), 25_000, "CHANGED: 10 % de la part du spin perdu arrive au DEV_WALLET en USDC");
        assertEq(tblock.balanceOf(address(coffre)), 225_000 * routeur.TAUX(), "NEW: les 90 % en TBLOCK au coffre");
        assertEq(usdc.balanceOf(address(bs)), bs.pot(), "rien de coince : solde = pot");
        /* un spin perdu ne se regle plus (ni settle, ni le lot, ni acceptCapped) */
        vm.expectRevert(BlockSlotsRouter.NotPending.selector);
        bs.settle(id);
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        assertEq(bs.settleMany(ids), 0);
        (bool okA, bytes memory rA) = _accepter(JOUEUR, id, 0);
        assertTrue(!okA && _erreur(rA) == BlockSlotsRouter.NotPending.selector, "acceptCapped : un spin perdu est clos");
    }

    /// @dev v4 : SANS expire(), un spin hors fenetre est deja perdu (TooLate, le lot le saute) et sa part du dev est deja due
    function test_V4_PerduSansExpire() public {
        uint256 id = _spin(JOUEUR);
        vm.roll(1002 + 257);
        vm.expectRevert(BlockSlotsRouter.TooLate.selector);
        bs.settle(id);
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        assertEq(bs.settleMany(ids), 0, "le lot saute un spin hors fenetre");
        (bool ok,) = _payDev(AUTRE);
        assertTrue(ok);
        assertEq(usdc.balanceOf(DEV), 25_000, "CHANGED: le dev touche ses 10 % sans que personne n expire le spin");
        assertEq(tblock.balanceOf(address(coffre)), 225_000 * routeur.TAUX(), "NEW: le reste en TBLOCK au coffre");
        assertEq(usdc.balanceOf(address(bs)), bs.pot());
    }

    function test_SettleDeuxFoisEtInexistant() public {
        uint256 id = _spin(JOUEUR);
        _revele(id, keccak256("deux"));
        bs.settle(id);
        vm.expectRevert(BlockSlotsRouter.NotPending.selector);
        bs.settle(id);
        vm.expectRevert(BlockSlotsRouter.NotPending.selector);
        bs.settle(42);
        vm.expectRevert(BlockSlotsRouter.NotPending.selector);
        bs.expire(42);
    }

    function test_SettleHashNulRefuse() public {
        uint256 id = _spin(JOUEUR);
        vm.roll(1005);
        vm.setBlockhash(1002, keccak256("h0"));
        vm.setBlockhash(1003, keccak256("h1"));
        vm.setBlockhash(1004, bytes32(0)); /* le TROISIEME hash illisible suffit a refuser */
        vm.expectRevert(BlockSlotsRouter.HashUnavailable.selector);
        bs.settle(id);
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        assertEq(bs.settleMany(ids), 0, "le lot saute un spin a hash illisible");
        vm.setBlockhash(1004, keccak256("h2"));
        vm.setBlockhash(1002, bytes32(0)); /* le PREMIER aussi */
        vm.expectRevert(BlockSlotsRouter.HashUnavailable.selector);
        bs.settle(id);
    }

    /* ------------------------------------------------------------ points */

    function _f(uint8[5] memory a, uint8[5] memory b, uint8[5] memory c) internal pure returns (uint8[5][3] memory f) {
        f[0] = a; f[1] = b; f[2] = c;
    }

    function test_PointsParTrait() public view {
        assertEq(bs.pointsFor(_f([0, 0, 0, 0, 0], [1, 1, 1, 1, 1], [2, 2, 2, 2, 2])), 0, "trois faces toutes differentes : 0");
        assertEq(bs.pointsFor(_f([3, 0, 0, 0, 0], [3, 1, 1, 1, 1], [2, 2, 2, 2, 2])), 1, "une paire (faces 0 et 1) : 1");
        assertEq(bs.pointsFor(_f([3, 0, 0, 0, 0], [1, 1, 1, 1, 1], [3, 2, 2, 2, 2])), 1, "une paire (faces 0 et 2) : 1");
        assertEq(bs.pointsFor(_f([0, 0, 0, 0, 0], [3, 1, 1, 1, 1], [3, 2, 2, 2, 2])), 1, "une paire (faces 1 et 2) : 1");
        assertEq(bs.pointsFor(_f([3, 0, 0, 0, 0], [3, 1, 1, 1, 1], [3, 2, 2, 2, 2])), 3, "un brelan : 3");
        assertEq(bs.pointsFor(_f([1, 2, 3, 4, 5], [1, 2, 3, 4, 5], [1, 2, 3, 4, 5])), 15, "trois faces identiques : 15 (jackpot)");
        assertEq(bs.pointsFor(_f([1, 2, 3, 4, 5], [1, 2, 3, 4, 5], [1, 2, 3, 4, 6])), 13, "4 brelans + 1 paire : 13");
        assertEq(bs.pointsFor(_f([1, 2, 3, 4, 5], [1, 2, 3, 4, 6], [1, 2, 3, 4, 7])), 12, "4 brelans : 12");
        assertEq(bs.pointsFor(_f([1, 2, 3, 4, 5], [1, 2, 3, 0, 0], [1, 2, 3, 0, 0])), 11, "3 brelans + 2 paires : 11");
    }

    /// @dev les graines Â« v2slotsN Â» (trois hashes _trois(graine), spin #1) donnent 0..10 points : trouvees et recalculees par
    ///      test-slots-parite en node. Pot suffisant : settle() ; pot court : seul acceptCapped(id, min) du JOUEUR paie (v3).
    function _paiePourGraine(string memory graine, uint8 pointsAttendus, uint256 don) internal returns (uint256 gain, uint256 potAvant) {
        if (don != 0) _fund(don);
        uint256 id = _spin(JOUEUR);
        assertEq(id, 1);
        potAvant = bs.pot();
        _reveleTrois(id, _trois(graine));
        uint256 j0 = usdc.balanceOf(JOUEUR);
        uint8 p;
        uint256 pay;
        if (TABLE[pointsAttendus] <= potAvant) {
            vm.prank(JOUEUR);
            (p, pay) = bs.settle(id);
        } else {
            vm.prank(JOUEUR);
            vm.expectRevert(BlockSlotsRouter.PotShort.selector);
            bs.settle(id);
            (bool ok, bytes memory r) = _accepter(JOUEUR, id, potAvant);
            assertTrue(ok, "le joueur accepte le pot");
            (p, pay) = abi.decode(r, (uint8, uint256));
        }
        assertEq(p, pointsAttendus, "points");
        gain = usdc.balanceOf(JOUEUR) - j0;
        assertEq(gain, pay, "gain rendu = gain recu");
        uint256 attendu = TABLE[p] < potAvant ? TABLE[p] : potAvant;
        assertEq(gain, attendu, "gain = min(table[points], pot)");
        assertEq(bs.pot(), potAvant - gain, "le pot baisse exactement du gain");
        assertEq(bs.pointsOf(JOUEUR), p, "points ajoutes au wallet");
        assertEq(bs.wonOf(JOUEUR), gain);
    }

    function test_Points0Rien() public { (uint256 g,) = _paiePourGraine("v2slots4", 0, 100_000_000); assertEq(g, 0); }
    function test_Points1Rien() public { (uint256 g,) = _paiePourGraine("v2slots1", 1, 100_000_000); assertEq(g, 0); }
    function test_Points2Rien() public { (uint256 g,) = _paiePourGraine("v2slots3", 2, 100_000_000); assertEq(g, 0); }
    function test_Points3() public { (uint256 g,) = _paiePourGraine("v2slots16", 3, 100_000_000); assertEq(g, 250_000); }
    function test_Points4() public { (uint256 g,) = _paiePourGraine("v2slots0", 4, 100_000_000); assertEq(g, 750_000); }
    function test_Points5() public { (uint256 g,) = _paiePourGraine("v2slots24", 5, 100_000_000); assertEq(g, 2_000_000); }
    function test_Points6() public { (uint256 g,) = _paiePourGraine("v2slots314", 6, 100_000_000); assertEq(g, 3_000_000); }
    function test_Points7() public { (uint256 g,) = _paiePourGraine("v2slots6", 7, 100_000_000); assertEq(g, 4_000_000); }
    function test_Points8() public { (uint256 g,) = _paiePourGraine("v2slots12083", 8, 100_000_000); assertEq(g, 5_000_000); }
    function test_Points9() public { (uint256 g,) = _paiePourGraine("v2slots3465", 9, 100_000_000); assertEq(g, 5_000_000); }
    function test_Points10() public { (uint256 g,) = _paiePourGraine("v2slots292116", 10, 100_000_000); assertEq(g, 5_000_000, "10 points : 5 USDC, le plafond"); }

    function test_GainPlafonneParLePot() public {
        /* pot = 0,25 (le spin seul) : 9 points (5 USDC) ne touchent que 0,25 -- settle() refuse, le JOUEUR accepte (acceptCapped) */
        (uint256 g, uint256 p0) = _paiePourGraine("v2slots3465", 9, 0);
        assertEq(p0, 250_000);
        assertEq(g, 250_000, "payout = min(prix, pot)");
        assertEq(bs.pot(), 0);
        assertEq(usdc.balanceOf(address(bs)), 250_000, "reste la part du dev, due");
        _caisse();
    }

    function test_PointsSAdditionnentParWallet() public {
        _fund(100_000_000);
        uint256 total;
        for (uint256 i = 0; i < 6; i++) {
            uint256 id = _spin(JOUEUR);
            bytes32 h = keccak256(abi.encode("cumul", i));
            _revele(id, h);
            (uint8 p,) = bs.settle(id);
            total += p;
            assertEq(p, bs.pointsFor(bs.facesOf(_deriver(h), id)), "points = pointsFor(facesOf(trois hashes, id))");
            assertEq(bs.pointsOf(JOUEUR), total, "cumul");
        }
        assertEq(bs.pointsOf(AUTRE), 0, "un autre wallet n a rien");
    }

    function test_GainVaAuJoueurPasALAppelant() public {
        _fund(100_000_000);
        uint256 id = _spin(JOUEUR);
        _reveleTrois(id, _trois("v2slots24"));
        uint256 a0 = usdc.balanceOf(AUTRE);
        uint256 j0 = usdc.balanceOf(JOUEUR);
        vm.prank(AUTRE);
        bs.settle(id);
        assertEq(usdc.balanceOf(AUTRE), a0, "l appelant ne touche rien");
        assertEq(usdc.balanceOf(JOUEUR) - j0, 2_000_000, "le joueur touche son gain");
    }

    /// @dev deux spins du MEME bloc ont des faces differentes (l id entre dans la graine)
    function test_DeuxSpinsMemeBlocIndependants() public {
        uint256 a = _spin(JOUEUR);
        uint256 b = _spin(AUTRE);
        (, uint40 ta,) = bs.spins(a);
        (, uint40 tb,) = bs.spins(b);
        assertEq(ta, tb, "meme bloc cible");
        bytes32 h = keccak256("meme bloc");
        uint8[5][3] memory fa = bs.facesOf(_deriver(h), a);
        uint8[5][3] memory fb = bs.facesOf(_deriver(h), b);
        assertTrue(keccak256(abi.encode(fa)) != keccak256(abi.encode(fb)), "faces differentes");
        assertTrue(bs.seedOf(h, a, 0) != bs.seedOf(h, a, 1) && bs.seedOf(h, a, 1) != bs.seedOf(h, a, 2), "trois graines distinctes");
    }

    /* ------------------------------------------------------------ settleMany */

    function test_SettleManyRegleEtSaute() public {
        _fund(100_000_000);
        uint256 a = _spin(JOUEUR);
        uint256 b = _spin(AUTRE);
        vm.roll(1005);
        _poserTrois(1002, _deriver(keccak256("lot")));
        uint256 c = _spin(JOUEUR); /* cible 1007 : trop tot */
        uint256[] memory ids = new uint256[](5);
        ids[0] = a; ids[1] = b; ids[2] = c; ids[3] = 999; ids[4] = a;
        uint256 n = bs.settleMany(ids);
        assertEq(n, 2, "a et b regles, c trop tot, 999 inexistant, a deja regle");
        (,, BlockSlotsRouter.Status sc) = bs.spins(c);
        assertEq(uint256(sc), uint256(BlockSlotsRouter.Status.Pending));
    }

    function test_SettleManyMemeResultatQueSettle() public {
        _fund(100_000_000);
        uint256 a = _spin(JOUEUR);
        bytes32 h = keccak256(bytes("meme resultat"));
        uint256 snap = vm.snapshotState();
        _revele(a, h);
        bs.settle(a);
        uint256 viaSettle = usdc.balanceOf(JOUEUR);
        vm.revertToState(snap);
        _revele(a, h);
        uint256[] memory ids = new uint256[](1);
        ids[0] = a;
        bs.settleMany(ids);
        assertEq(usdc.balanceOf(JOUEUR), viaSettle);
    }

    function test_SettleManyBornesDeLaFenetre() public {
        uint256 a = _spin(JOUEUR);
        uint256[] memory ids = new uint256[](1);
        ids[0] = a;
        vm.roll(1002 + 257);
        vm.setBlockhash(1002, keccak256("tard"));
        assertEq(bs.settleMany(ids), 0, "hors fenetre : saute");
    }

    function test_SettleManyDernierBlocDeLaFenetre() public {
        uint256 a = _spin(JOUEUR);
        uint256[] memory ids = new uint256[](1);
        ids[0] = a;
        vm.roll(1002 + 256);
        _poserTrois(1002, _deriver(keccak256("dernier du lot")));
        assertEq(bs.settleMany(ids), 1, "cible + 256 : encore regle par le lot");
    }

    function test_SettleManyPremierBlocApresLaCible() public {
        uint256 a = _spin(JOUEUR);
        uint256[] memory ids = new uint256[](1);
        ids[0] = a;
        vm.roll(1002);
        assertEq(bs.settleMany(ids), 0, "a la cible : trop tot, saute");
        vm.roll(1005);
        _poserTrois(1002, _deriver(keccak256("premier du lot")));
        assertEq(bs.settleMany(ids), 1, "cible + 3 (le 3e hash existe) : regle");
    }

    /* ------------------------------------------------------------ fuzz */

    /// @dev quel que soit le hash et le pot : settle() paie le prix ENTIER ou refuse (PotShort) ; acceptCapped du joueur paie min(prix, pot) ;
    ///      jamais plus de 5 USDC ; la caisse tient (solde = pot + devOwed)
    function testFuzz_PayoutPlafonneEtCaisse(bytes32 h, uint96 dons) public {
        uint256 d = uint256(dons) % 5_000_000_000;
        if (d != 0) _fund(d);
        uint256 id = _spin(JOUEUR);
        vm.assume(h != bytes32(0));
        uint256 p0 = bs.pot();
        _revele(id, h);
        uint256 j0 = usdc.balanceOf(JOUEUR);
        uint8 attenduP = bs.pointsFor(bs.facesOf(_deriver(h), id));
        uint8 p;
        uint256 pay;
        if (TABLE[attenduP] <= p0) {
            vm.prank(JOUEUR);
            (p, pay) = bs.settle(id);
        } else {
            vm.prank(JOUEUR);
            vm.expectRevert(BlockSlotsRouter.PotShort.selector);
            bs.settle(id);
            (bool ok, bytes memory r) = _accepter(JOUEUR, id, 0);
            assertTrue(ok, "acceptCapped du joueur");
            (p, pay) = abi.decode(r, (uint8, uint256));
        }
        assertLe(p, 15);
        assertTrue(p != 14, "14 points impossible");
        assertEq(p, attenduP);
        assertLe(pay, 5_000_000, "jamais plus de 5 USDC par spin");
        uint256 attendu = TABLE[p] < p0 ? TABLE[p] : p0;
        assertEq(pay, attendu);
        assertEq(usdc.balanceOf(JOUEUR) - j0, pay);
        assertEq(bs.pot(), p0 - pay);
        _caisse();
    }

    /// @dev N spins sur des hashes au hasard, chacun REGLE (settle, ou acceptCapped si le pot est court) OU laisse EXPIRER (v4 : perdu,
    ///      rien de rendu ; expire() appele ou non) : gains <= dons + parts du pot ; caisse tenue a chaque pas ; le dev touche la part de
    ///      TOUS les spins (apres payDev) ; le joueur : gains - prix ; apres payDev, solde = pot (rien de coince)
    function testFuzz_SommeDesGains(bytes32 graine, uint8 n, uint64 don, uint16 masqueExpire, uint16 masqueAppel) public {
        uint256 k = uint256(n) % 12 + 1;
        uint256 d = uint256(don) % 200_000_000;
        if (d != 0) _fund(d);
        uint256 j0 = usdc.balanceOf(JOUEUR);
        uint256 gains;
        uint256 perdus;
        for (uint256 i = 0; i < k; i++) {
            uint256 id = _spin(JOUEUR);
            bytes32 h = keccak256(abi.encode(graine, i));
            if ((masqueExpire >> i) & 1 == 1) {
                (, uint40 t,) = bs.spins(id);
                vm.roll(uint256(t) + 257);
                if ((masqueAppel >> i) & 1 == 1) bs.expire(id);
                perdus++;
            } else {
                _revele(id, h);
                (bool ok, bytes memory r) = _accepter(JOUEUR, id, 0);
                assertTrue(ok, "acceptCapped du joueur");
                (, uint256 pay) = abi.decode(r, (uint8, uint256));
                gains += pay;
            }
            _caisse();
        }
        assertLe(gains, d + k * 250_000, "on ne paie que ce qui est entre");
        assertEq(bs.pot(), d + k * 250_000 - gains, "pot = entrees - gains");
        assertEq(usdc.balanceOf(DEV), 0, "rien au dev avant payDev");
        assertEq(_lireU("devOwed()"), k * 250_000, "v4 : la part du dev de CHAQUE spin, perdus compris");
        (bool okDev,) = _payDev(AUTRE);
        assertTrue(okDev, "payDev par n importe qui");
        assertEq(usdc.balanceOf(DEV), k * 25_000, "CHANGED: dev : 10 % de la part de TOUS les spins, en USDC");
        assertEq(tblock.balanceOf(address(coffre)), k * 225_000 * routeur.TAUX(), "NEW: 90 % de la part de TOUS les spins, en TBLOCK au coffre");
        assertEq(routeur.nb(), 1, "NEW: one batch, one router payment");
        assertEq(usdc.balanceOf(address(bs)), bs.pot(), "apres payDev : solde = pot, rien de coince");
        assertEq(j0 + gains - k * SPIN, usdc.balanceOf(JOUEUR), "joueur : gains - prix (un spin perdu ne rend rien)");
        assertEq(bs.wonOf(JOUEUR), gains);
        assertLe(perdus, k);
    }

    /// @dev la fenetre : pour tout decalage, settle passe ssi cible + 2 < bloc <= cible + 256 (les trois hashes, la fenetre du premier)
    function testFuzz_Fenetre(uint16 delta) public {
        uint256 id = _spin(JOUEUR);
        uint256 b = 1002 + uint256(delta) % 600;
        vm.roll(b);
        bytes32[3] memory h = _deriver(keccak256("fenetre"));
        for (uint256 r = 0; r < 3; r++) if (1002 + r <= b) vm.setBlockhash(1002 + r, h[r]);
        if (b <= 1004) {
            vm.expectRevert(BlockSlotsRouter.TooEarly.selector); bs.settle(id);
            (bool ok, bytes memory r) = _accepter(JOUEUR, id, 0);
            assertTrue(!ok && _erreur(r) == BlockSlotsRouter.TooEarly.selector, "acceptCapped : meme borne basse");
        } else if (b > 1002 + 256) {
            vm.expectRevert(BlockSlotsRouter.TooLate.selector); bs.settle(id);
            (bool ok, bytes memory r) = _accepter(JOUEUR, id, 0);
            assertTrue(!ok && _erreur(r) == BlockSlotsRouter.TooLate.selector, "acceptCapped : meme borne haute");
        } else {
            (bool ok,) = _accepter(JOUEUR, id, 0);
            assertTrue(ok, "dans la fenetre : le joueur regle");
        }
    }

    /* ------------------------------------------------------------ jetons hostiles */

    function test_JetonQuiRendFauxRefuse() public {
        _fund(100_000_000);
        uint256 id = _spin(JOUEUR);
        _reveleTrois(id, _trois("v2slots24"));
        usdc.setFaux(true);
        vm.expectRevert(BlockSlotsRouter.TransferFailed.selector);
        bs.settle(id);
        vm.startPrank(JOUEUR);
        usdc.approve(address(bs), SPIN);
        vm.expectRevert(BlockSlotsRouter.TransferFailed.selector);
        bs.spin();
        vm.stopPrank();
    }

    function _reentree(bool lot) internal {
        UsdcHostileSR hu = new UsdcHostileSR();
        BlockSlotsRouter b2 = _nouveau(_cfg(address(hu)));
        hu.mint(JOUEUR, 1_000_000_000);
        vm.startPrank(JOUEUR);
        hu.approve(address(b2), 1_000_000_000);
        b2.fund(500_000_000);
        uint256 a = b2.spin();
        uint256 b = b2.spin();
        vm.stopPrank();
        hu.armer(b2, b, lot);
        vm.roll(1005);
        /* une graine qui paie au spin a (id 1) : v2slots24 donne 5 points pour l id 1 */
        _poserTrois(1002, _trois("v2slots24"));
        b2.settle(a);
        assertFalse(hu.reentreeReussie(), "la reentree ne passe pas");
        assertEq(hu.erreurVue(), BlockSlotsRouter.Reentrancy.selector);
        (,, BlockSlotsRouter.Status sb) = b2.spins(b);
        assertEq(uint256(sb), uint256(BlockSlotsRouter.Status.Pending), "l autre spin reste en attente");
    }

    function test_ReentreeSettleRefusee() public { _reentree(false); }
    function test_ReentreeSettleManyRefusee() public { _reentree(true); }

    /* ------------------------------------------------------------ PARITE avec face-du-jour.js (memes epingles que BlockRolls) */

    function _parite(bytes32 h, uint8 bande, uint8 orbite, uint8 facette, uint8 matiere, uint8 ornement) internal view {
        uint8[5] memory f = bs.faceOf(h);
        assertEq(f[0], bande); assertEq(f[1], orbite); assertEq(f[2], facette); assertEq(f[3], matiere); assertEq(f[4], ornement);
    }

    function test_PariteFaceDuJour() public view {
        _parite(0x33670809921ee57e8248123f30ff8dbb27acac3454bcd1f5a4336580d0d68521, 4, 7, 12, 7, 2);
        _parite(0xb711d32e79a26668135e088a66b12e421cbe6b55f6a929dd9e49896f952ccac8, 0, 5, 3, 2, 0);
        _parite(0x494a1264ca7b526bafe16d03fdb088252af07d5ece0f3e9a5e02cdef14e9968c, 0, 4, 5, 7, 2);
        _parite(0x0000000000000000000000000000000000000000000000000000000000000000, 1, 2, 7, 6, 0);
    }

    /* â›” Ces trois faces par (hash, id) sont RECALCULEES par test-slots-parite-20261023.mjs avec les modules de l app (keccak.js +
     *    traitsDepuisHash) : si l un des deux cotes derive, l un des deux tests rougit. Ne pas editer a la main. */
    /// @dev les trois hashes sont ceux de _trois(graine) (keccak256(abi.encodePacked(graine, uint8(r)))) ; le test node les recalcule
    function _pariteSpin(string memory graine, uint256 id, uint8[15] memory v, uint8 pts) internal view {
        uint8[5][3] memory f = bs.facesOf(_trois(graine), id);
        for (uint256 r = 0; r < 3; r++) for (uint256 i = 0; i < 5; i++) assertEq(f[r][i], v[r * 5 + i], "trait");
        assertEq(bs.pointsFor(f), pts, "points");
    }

    function test_PariteTroisFaces() public view {
        _pariteSpin("pin-a", 1, [uint8(2), 6, 9, 4, 1, 3, 9, 8, 6, 7, 5, 7, 12, 2, 3], 0);
        _pariteSpin("pin-b", 2, [uint8(3), 9, 0, 4, 2, 4, 5, 12, 5, 0, 4, 0, 2, 4, 5], 2);
        _pariteSpin("pin-c", 77, [uint8(1), 2, 10, 2, 5, 5, 0, 17, 6, 7, 1, 2, 9, 1, 4], 2);
        _pariteSpin("pin-d", 9, [uint8(4), 5, 4, 0, 5, 2, 2, 16, 8, 5, 0, 4, 5, 2, 3], 1);
        _pariteSpin("pin-e", 123456, [uint8(0), 2, 13, 4, 0, 5, 4, 7, 8, 1, 3, 0, 16, 4, 2], 1);
        /* pin-a : le hash du bloc cible + 1 vient bien de _trois (temoin d ancrage pour le test node) */
        assertEq(_trois("pin-a")[1], 0x086ab6dbdf5fa1c77ebe9c75bbf3bab40ab706ed8e2ed2138c6f20f1ac947b50);
    }

    /* ------------------------------------------------------------ V2 (verdict adverse + decisions de Phil, 2026-10-23) */
    /* â›” ecrits AVANT le changement du contrat, avec les seules fonctions de l ancien (seedOf, faceOf, pointsFor) : ils doivent y rougir. */

    /// @dev les trois hashes d une graine : h_r = keccak256(abi.encodePacked(g, uint8(r))) â€” recalcules par test-slots-parite en node
    function _trois(string memory g) internal pure returns (bytes32[3] memory h) {
        for (uint256 r = 0; r < 3; r++) h[r] = keccak256(abi.encodePacked(g, uint8(r)));
    }

    function _reveleTrois(uint256 id, bytes32[3] memory h) internal {
        (, uint40 t,) = bs.spins(id);
        vm.roll(uint256(t) + 3);
        for (uint256 r = 0; r < 3; r++) vm.setBlockhash(uint256(t) + r, h[r]);
    }

    function _pointsDeTroisBlocs(bytes32[3] memory h, uint256 id) internal view returns (uint8) {
        uint8[5][3] memory f;
        for (uint256 r = 0; r < 3; r++) f[r] = bs.faceOf(bs.seedOf(h[r], id, r));
        return bs.pointsFor(f);
    }

    /// @dev (a) chaque face vient de SON bloc : cible, cible + 1, cible + 2 (v2slots6 : 7 points ainsi, 2 sur le seul hash de la cible)
    function test_V2_UneFaceParBloc() public {
        _fund(100_000_000);
        uint256 id = _spin(JOUEUR);
        bytes32[3] memory h = _trois("v2slots6");
        _reveleTrois(id, h);
        (uint8 p,) = bs.settle(id);
        assertEq(p, _pointsDeTroisBlocs(h, id), "points = faces des trois blocs");
        assertEq(p, 7);
    }

    /// @dev (a) le reglement attend le TROISIEME hash : cible + 1 et cible + 2 sont trop tot, cible + 3 regle
    function test_V2_TropTotAvantLeTroisiemeBloc() public {
        uint256 id = _spin(JOUEUR);
        vm.roll(1003);
        vm.setBlockhash(1002, keccak256(abi.encode("tot", 0)));
        vm.expectRevert(BlockSlotsRouter.TooEarly.selector);
        bs.settle(id);
        vm.roll(1004);
        vm.setBlockhash(1003, keccak256(abi.encode("tot", 1)));
        vm.expectRevert(BlockSlotsRouter.TooEarly.selector);
        bs.settle(id);
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        assertEq(bs.settleMany(ids), 0, "cible + 2 : le lot saute");
        vm.roll(1005);
        vm.setBlockhash(1004, keccak256(abi.encode("tot", 2)));
        bs.settle(id);
    }

    /// @dev (b) 5 USDC au plus par spin : une table a 5,000001 est refusee, 5 admis
    function test_V2_PlafondCinqUsdc() public {
        assertEq(uint256(bs.MAX_PRIZE()), 5_000_000);
        BlockSlotsRouter.Config memory c = _cfg(address(usdc));
        c.prizes[15] = 5_000_001;
        _refuse(c);
        c.prizes[15] = 5_000_000;
        _nouveau(c);
    }

    /// @dev (b) le contrat juge et paie lui-meme au settle : 9 points -> 5 USDC (le plafond), au joueur
    function test_V2_NeufPointsPaientCinq() public {
        _fund(100_000_000);
        uint256 id = _spin(JOUEUR);
        _reveleTrois(id, _trois("v2slots3465"));
        uint256 j0 = usdc.balanceOf(JOUEUR);
        (uint8 p, uint256 pay) = bs.settle(id);
        assertEq(p, 9);
        assertEq(pay, 5_000_000);
        assertEq(usdc.balanceOf(JOUEUR) - j0, 5_000_000);
    }

    /// @dev R1 : un TIERS ne peut pas faire accepter un gain plafonne par le pot ; le joueur, lui, le peut
    function test_V2_TiersNeRegleSurPotCourt() public {
        uint256 id = _spin(JOUEUR); /* pot 0,25 */
        _reveleTrois(id, _trois("v2slots24")); /* 5 points : 2 USDC > pot */
        vm.prank(AUTRE);
        vm.expectRevert(bytes4(keccak256("PotShort()")));
        bs.settle(id);
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        vm.prank(AUTRE);
        assertEq(bs.settleMany(ids), 0, "le lot d un tiers saute le spin a pot court");
        (,, BlockSlotsRouter.Status s) = bs.spins(id);
        assertEq(uint256(s), uint256(BlockSlotsRouter.Status.Pending), "le spin reste au joueur");
        uint256 j0 = usdc.balanceOf(JOUEUR);
        /* v3 : le joueur accepte EXPLICITEMENT (acceptCapped, avec le minimum qu il a vu) ; un tiers ne le peut pas */
        (bool okA, bytes memory rA) = _accepter(AUTRE, id, 0);
        assertTrue(!okA && _erreur(rA) == bytes4(keccak256("NotPlayer()")), "acceptCapped : le joueur seulement");
        (bool ok, bytes memory r) = _accepter(JOUEUR, id, 250_000);
        assertTrue(ok, "le joueur choisit d accepter le pot");
        (, uint256 pay) = abi.decode(r, (uint8, uint256));
        assertEq(pay, 250_000);
        assertEq(usdc.balanceOf(JOUEUR) - j0, 250_000);
    }

    /// @dev R1 : avec un pot suffisant, un tiers regle toujours, et le gain va au joueur
    function test_V2_TiersRegleSiLePotSuffit() public {
        _fund(100_000_000);
        uint256 id = _spin(JOUEUR);
        _reveleTrois(id, _trois("v2slots24"));
        uint256 j0 = usdc.balanceOf(JOUEUR);
        vm.prank(AUTRE);
        (, uint256 pay) = bs.settle(id);
        assertEq(pay, 2_000_000);
        assertEq(usdc.balanceOf(JOUEUR) - j0, 2_000_000);
    }

    /* ------------------------------------------------------------ V3 (verdict adverse 2026-10-23, regles de Phil) */
    /* â›” ecrits AVANT le changement du contrat ; ils compilent contre l ancien (appels bas niveau) et doivent y ROUGIR. */

    /// @dev les deux spins du verdict : le MEME joueur, deux spins a 8 points (5 USDC chacun), un pot de 5 USDC. Defaut 1 : son
    ///      settleMany([1,2]) reglait #2 a 0 sans le dire. v3 : le lot SAUTE #2 (pot court), meme pour le joueur ; #2 reste a lui.
    function test_V3_LotDuJoueurSautePotCourt() public {
        uint256 a = _spin(JOUEUR); /* bloc 1000, cible 1002 */
        vm.roll(1010);
        uint256 b = _spin(JOUEUR); /* cible 1012 : trois autres blocs */
        _fund(4_500_000); /* pot 0,25 + 0,25 + 4,50 = 5,00 */
        assertEq(bs.pot(), 5_000_000);
        vm.roll(1015);
        _poserTrois(1002, _trois("v3slots656"));
        _poserTrois(1012, _trois("v3slots10500"));
        assertEq(bs.pointsFor(bs.facesOf(_trois("v3slots656"), a)), 8, "#1 : 8 points");
        assertEq(bs.pointsFor(bs.facesOf(_trois("v3slots10500"), b)), 8, "#2 : 8 points");
        uint256 j0 = usdc.balanceOf(JOUEUR);
        uint256[] memory ids = new uint256[](2);
        ids[0] = a; ids[1] = b;
        vm.prank(JOUEUR);
        assertEq(bs.settleMany(ids), 1, "le lot regle #1 en entier et SAUTE #2");
        assertEq(usdc.balanceOf(JOUEUR) - j0, 5_000_000, "#1 paye 5 USDC");
        (,, BlockSlotsRouter.Status sb) = bs.spins(b);
        assertEq(uint256(sb), uint256(BlockSlotsRouter.Status.Pending), "#2 n est PAS clos a 0");
        assertEq(bs.pot(), 0);
        /* le joueur lui-meme : settle() ne prend pas un gain plafonne non plus */
        vm.prank(JOUEUR);
        vm.expectRevert(BlockSlotsRouter.PotShort.selector);
        bs.settle(b);
        /* accepter EXPLICITEMENT, avec le minimum vu : sous le minimum, refuse */
        (bool ok, bytes memory r) = _accepter(JOUEUR, b, 1);
        assertTrue(!ok && _erreur(r) == bytes4(keccak256("BelowMinimum()")), "pot vide : sous le minimum vu, refuse");
        _fund(3_000_000);
        (ok, r) = _accepter(JOUEUR, b, 3_000_000);
        assertTrue(ok, "le joueur accepte 3 USDC sur 5");
        (uint8 p, uint256 pay) = abi.decode(r, (uint8, uint256));
        assertEq(p, 8);
        assertEq(pay, 3_000_000);
        assertEq(bs.wonOf(JOUEUR), 8_000_000);
        _caisse();
    }

    /// @dev acceptCapped avec un pot SUFFISANT paie le prix entier (c est un settle) ; et pas plus
    function test_V3_AccepterAvecPotSuffisant() public {
        _fund(100_000_000);
        uint256 id = _spin(JOUEUR);
        _reveleTrois(id, _trois("v2slots24")); /* 5 points : 2 USDC */
        (bool ok, bytes memory r) = _accepter(JOUEUR, id, 2_000_000);
        assertTrue(ok);
        (, uint256 pay) = abi.decode(r, (uint8, uint256));
        assertEq(pay, 2_000_000);
        (ok, r) = _accepter(JOUEUR, id, 0);
        assertTrue(!ok && _erreur(r) == BlockSlotsRouter.NotPending.selector, "deja regle");
    }

    /// @dev v4 : la part du dev est DUE des le spin (devOwed), le settle n y touche pas ; payDev() par n importe qui l envoie au DEV_WALLET seul
    function test_V4_PartDuDevDueAuSpin() public {
        uint256 id = _spin(JOUEUR);
        assertEq(usdc.balanceOf(DEV), 0, "rien au dev au spin (payDev l envoie)");
        assertEq(_lireU("devOwed()"), 250_000, "due des le spin");
        _reveleTrois(id, _trois("v3slots0")); /* 0 point pour l id 1 */
        vm.prank(AUTRE);
        (uint8 p, uint256 pay) = bs.settle(id);
        assertEq(p, 0);
        assertEq(pay, 0);
        assertEq(_lireU("devOwed()"), 250_000, "le settle ne change pas la part du dev");
        _caisse();
        uint256 a0 = usdc.balanceOf(AUTRE);
        (bool ok,) = _payDev(AUTRE);
        assertTrue(ok);
        assertEq(usdc.balanceOf(DEV), 25_000, "CHANGED: 10 % au DEV_WALLET");
        assertEq(tblock.balanceOf(address(coffre)), 225_000 * routeur.TAUX(), "NEW: 90 % en TBLOCK au coffre");
        assertEq(usdc.balanceOf(AUTRE), a0, "rien a l appelant");
        assertEq(_lireU("devOwed()"), 0);
        bytes memory r2;
        (ok, r2) = _payDev(AUTRE);
        assertTrue(!ok && _erreur(r2) == BlockSlotsRouter.BatchTooSmall.selector, "CHANGED: un second payDev, rien du, est refuse");
        assertEq(usdc.balanceOf(DEV), 25_000);
        assertEq(bs.pot(), 250_000, "le pot n est pas touche");
        _caisse();
    }

    /// @dev v4 : SANS remboursement, laisser expirer ne rend rien ; la meilleure strategie est de tout regler et rend EXACTEMENT
    ///      l esperance : 2851431899393758353960392096738004388806656000000 / 2^144 = 127 862 brut (0,127862 USDC) par spin de 0,50,
    ///      sous la part du pot (0,25) donc sous le prix. Pour memoire, ce que rendait le meilleur jeu AVEC remboursement r : r = la part du
    ///      dev (v3) 325 222 ; r = le prix entier 556 549 (au-dessus du prix) -- recalcules ici, pas recopies.
    function test_V4_MeilleureStrategieEgaleEsperance() public view {
        uint256 best = _lireU("bestPlayNumerator()");
        uint256 ev = bs.expectedNumerator(TABLE);
        assertEq(best, ev, "meilleur jeu = esperance (aucune option de remboursement)");
        assertEq(best, 2851431899393758353960392096738004388806656000000);
        assertEq(best / bs.DIST_DENOM(), 127_862);
        assertEq(best / bs.DIST_DENOM(), bs.expectedPayout());
        assertLt(best, 250_000 * bs.DIST_DENOM(), "strictement sous la part du pot");
        assertLt(best, SPIN * bs.DIST_DENOM(), "strictement sous le prix");
        uint256[16] memory d = bs.distribution();
        uint256 demi;
        uint256 plein;
        for (uint256 k = 0; k < 16; k++) {
            demi += d[k] * (TABLE[k] > 250_000 ? TABLE[k] : 250_000);
            plein += d[k] * (TABLE[k] > SPIN ? TABLE[k] : SPIN);
        }
        assertEq(demi / bs.DIST_DENOM(), 325_222, "v3 (part du dev rendue) : 0,325222");
        assertEq(plein / bs.DIST_DENOM(), 556_549, "prix entier rendu : 0,556549 > 0,50");
        assertGt(demi, best, "le remboursement donnait au joueur plus que l esperance");
    }

    /// @dev la garde est EXACTE sur ce qui ENTRE au pot (arrondi bas) : spin 500 001, part 50 % -> 250 000 au pot, 250 001 au dev.
    ///      Une table Â« x pour 3 points et plus Â» d esperance entre 250 000 et 250 000,5 passait une garde sans l arrondi (prix x part / BPS) :
    ///      le pot paierait en moyenne plus qu il ne recoit. Refusee ; x - 1 admis.
    function test_V3_GardeSurLaPartQuiEntreAuPot() public {
        uint256[16] memory d = bs.distribution();
        uint256 s3;
        for (uint256 k = 3; k < 16; k++) s3 += d[k];
        uint256 x = (250_000 * bs.DIST_DENOM() + s3 - 1) / s3; /* ceil */
        BlockSlotsRouter.Config memory c = _cfg(address(usdc));
        c.spinPrice = 500_001;
        for (uint256 k = 0; k < 16; k++) c.prizes[k] = k >= 3 ? uint64(x) : 0;
        assertLt(x * s3 * 10_000, c.spinPrice * 5000 * bs.DIST_DENOM(), "l ancienne garde l admettait");
        _refuse(c);
        for (uint256 k = 3; k < 16; k++) c.prizes[k] = uint64(x - 1);
        _nouveau(c);
    }

    /// @dev pour TOUTE table admise par le constructeur (v4) : meilleure strategie = esperance < part du pot <= prix ; part du dev + part
    ///      du pot = prix ; et une table refusee a bien une esperance >= la part du pot
    function testFuzz_V4_TableAdmiseSousLePrix(uint64[8] memory pas, uint32 prix, uint16 part) public {
        BlockSlotsRouter.Config memory c = _cfg(address(usdc));
        c.spinPrice = uint256(prix) % 2_000_000 + 1;
        c.potShareBps = uint16(uint256(part) % 10_000 + 1);
        uint64 v;
        for (uint256 k = 0; k < 16; k++) {
            if (k >= 3 && k < 11) v += uint64(uint256(pas[k - 3]) % 700_000);
            if (v > 5_000_000) v = 5_000_000;
            c.prizes[k] = v;
        }
        uint256 toPot = (c.spinPrice * c.potShareBps) / 10_000;
        uint256 ev = bs.expectedNumerator(c.prizes);
        try this.nouveauExterne(c) returns (BlockSlotsRouter b2) {
            (bool ok, bytes memory r) = address(b2).staticcall(abi.encodeWithSignature("bestPlayNumerator()"));
            assertTrue(ok && r.length == 32, "bestPlayNumerator");
            uint256 best = abi.decode(r, (uint256));
            assertEq(best, ev, "v4 : meilleure strategie = esperance");
            assertLt(best, toPot * b2.DIST_DENOM(), "table admise : esperance < part du pot");
            assertLt(best, c.spinPrice * b2.DIST_DENOM(), "table admise : meilleure strategie < prix");
            (ok, r) = address(b2).staticcall(abi.encodeWithSignature("DEV_SHARE()"));
            assertTrue(ok);
            assertEq(abi.decode(r, (uint256)) + toPot, c.spinPrice, "part du dev + part du pot = prix");
        } catch {
            assertGe(ev, toPot * bs.DIST_DENOM(), "une table croissante <= 5 USDC n est refusee que pour son esperance");
        }
    }

    /// @dev v4 : expire() ne transfere RIEN (le jeton n est pas appele) ; payDev passe sous le verrou : un jeton hostile qui re-entre
    ///      pendant le paiement du dev est refuse, et le dev n est paye qu une fois
    function test_V4_ReentreeExpireEtPayDev() public {
        UsdcHostileSR hu = new UsdcHostileSR();
        BlockSlotsRouter b2 = _nouveau(_cfg(address(hu)));
        hu.mint(JOUEUR, 1_000_000_000);
        vm.startPrank(JOUEUR);
        hu.approve(address(b2), 1_000_000_000);
        uint256 a = b2.spin();
        uint256 b = b2.spin();
        vm.stopPrank();
        vm.roll(1002 + 257);
        hu.armerDonnee(b2, abi.encodeWithSignature("payDev(uint256,uint256,uint256)", uint256(MIN_LOT), uint256(1), block.timestamp));
        b2.expire(a);
        assertFalse(hu.tente(), "v4 : expire n appelle pas le jeton");
        assertEq(hu.balanceOf(JOUEUR), 1_000_000_000 - 2 * SPIN, "rien n est rendu");
        b2.payDev(_lot(b2), 1, block.timestamp);
        assertTrue(hu.tente(), "CHANGED: payDev passe par le jeton (le routeur tire le lot de ce contrat)");
        assertFalse(hu.reentreeReussie(), "pas de re-entree pendant payDev");
        assertEq(hu.erreurVue(), BlockSlotsRouter.Reentrancy.selector);
        assertEq(hu.balanceOf(DEV), 2 * 25_000, "CHANGED: le dev est paye une fois, 10 % de ses deux parts");
        assertEq(hu.balanceOf(address(b2)), b2.pot(), "solde = pot");
        (,, BlockSlotsRouter.Status sb) = b2.spins(b);
        assertEq(uint256(sb), uint256(BlockSlotsRouter.Status.Pending));
    }

    /// @dev v4 : un REGLEUR (le serveur, ou n importe qui) regle en lot ; chaque gain va au joueur de SON spin, rien a l appelant, et
    ///      l appelant ne paie que son gas (aucun USDC ne lui est tire)
    function test_V4_RegleurPaieLesJoueurs() public {
        _fund(100_000_000);
        uint256 a = _spin(JOUEUR); /* id 1 */
        uint256 b = _spin(AUTRE); /* id 2, meme cible */
        vm.roll(1005);
        _poserTrois(1002, _trois("v2slots24"));
        uint256 attA = TABLE[bs.pointsFor(bs.facesOf(_trois("v2slots24"), a))];
        uint256 attB = TABLE[bs.pointsFor(bs.facesOf(_trois("v2slots24"), b))];
        uint256 j0 = usdc.balanceOf(JOUEUR);
        uint256 a0 = usdc.balanceOf(AUTRE);
        uint256 d0 = usdc.balanceOf(DONATEUR);
        uint256[] memory ids = new uint256[](2);
        ids[0] = a; ids[1] = b;
        vm.prank(DONATEUR);
        assertEq(bs.settleMany(ids), 2);
        assertEq(usdc.balanceOf(JOUEUR) - j0, attA, "le joueur du spin 1 touche son gain");
        assertEq(usdc.balanceOf(AUTRE) - a0, attB, "le joueur du spin 2 touche le sien");
        assertEq(usdc.balanceOf(DONATEUR), d0, "le regleur ne touche rien et ne paie rien");
        assertEq(attA, 2_000_000, "v2slots24 : 5 points pour l id 1");
        _caisse();
    }

    /* ------------------------------------------------------------ aucun retrait */

    function test_AucunRetrait() public {
        _fund(1_000_000);
        vm.startPrank(DEV);
        (bool ok,) = address(bs).call(abi.encodeWithSignature("withdraw(uint256)", 1));
        assertFalse(ok);
        (ok,) = address(bs).call(abi.encodeWithSignature("sweep(address)", DEV));
        assertFalse(ok);
        (ok,) = address(bs).call(abi.encodeWithSignature("setPrizes(uint64[16])", TABLE));
        assertFalse(ok, "la table ne se change pas");
        vm.stopPrank();
        /* v3 : payDev existe, mais n envoie que la part DUE des spins regles (ici 0), jamais le pot */
        bytes memory r;
        (ok, r) = _payDev(DEV);
        assertTrue(!ok && _erreur(r) == BlockSlotsRouter.BatchTooSmall.selector, "CHANGED: payDev sans rien du est refuse");
        assertEq(usdc.balanceOf(DEV), 0, "le pot ne sort pas par payDev");
        assertEq(usdc.balanceOf(address(bs)), 1_000_000);
        assertEq(bs.pot(), 1_000_000);
    }

    function test_TransfertDirectNEntrePasAuPot() public {
        vm.prank(DONATEUR);
        usdc.transfer(address(bs), 7);
        assertEq(bs.pot(), 0);
    }

    function test_FundZeroRefuse() public {
        vm.expectRevert(BlockSlotsRouter.ZeroAmount.selector);
        bs.fund(0);
    }

    function test_PayoutFor() public {
        _fund(3_000_000);
        assertEq(bs.payoutFor(5), 2_000_000);
        assertEq(bs.payoutFor(9), 3_000_000, "plafonne par le pot");
        assertEq(bs.payoutFor(2), 0);
        assertEq(bs.payoutFor(16), 0, "hors table");
    }

    /* ------------------------------------------------------------ NEW (Phil 2026-11-12) : la part du dev par le routeur */

    function _coffreTb() internal view returns (uint256) {
        return tblock.balanceOf(address(coffre));
    }

    /// @dev a spin makes NO router call: the pot gets TO_POT, the dev share is only counted; a broken router cannot stop a spin
    function test_R_SpinSansRouteur() public {
        routeur.regler(1); // the router reverts on every pay
        uint256 id = _spin(JOUEUR);
        assertEq(id, 1);
        assertEq(routeur.nb(), 0, "spin: no router call");
        assertEq(bs.pot(), 250_000, "TO_POT au pot");
        assertEq(bs.devOwed(), 250_000, "DEV_SHARE du");
        assertEq(_coffreTb(), 0);
        assertEq(usdc.balanceOf(DEV), 0);
        _caisse();
        _reveleTrois(id, _trois("v3slots0"));
        bs.settle(id);
        (,, BlockSlotsRouter.Status st) = bs.spins(id);
        assertEq(uint256(st), uint256(BlockSlotsRouter.Status.Settled), "the spin settles as before");
    }

    /// @dev payDev: the batch leaves through the router: 10 % USDC to DEV_WALLET, 90 % as TBLOCK to the vault; the pot never moves
    function test_R_PayDevParLeRouteur() public {
        _fund(10_000_000);
        for (uint256 i; i < 4; i++) _spin(JOUEUR);
        uint256 pot0 = bs.pot();
        uint256 a0 = usdc.balanceOf(AUTRE);
        vm.prank(AUTRE);
        (uint256 lot, uint256 out) = bs.payDev(1_000_000, 1, block.timestamp);
        assertEq(lot, 1_000_000, "the whole devOwed (4 x 0.25)");
        assertEq(routeur.nb(), 1, "one router payment");
        assertEq(usdc.balanceOf(DEV), 100_000, "10 % to DEV_WALLET in USDC");
        assertEq(out, 900_000 * routeur.TAUX());
        assertEq(_coffreTb(), out, "90 % as TBLOCK in the vault");
        assertEq(tblock.balanceOf(address(bs)), 0, "nothing kept");
        assertEq(bs.devOwed(), 0);
        assertEq(bs.pot(), pot0, "pot untouched");
        assertEq(usdc.balanceOf(address(bs)), bs.pot(), "solde = pot");
        assertEq(usdc.balanceOf(AUTRE), a0, "the caller gets nothing");
        assertEq(tblock.balanceOf(AUTRE), 0);
        assertEq(bs.PRICE_USDC(), 0, "no batch at rest");
        assertEq(usdc.allowance(address(bs), address(routeur)), 0, "exact approve, used up");
    }

    /// @dev payDev waits for MIN_DEV_BATCH (here 1 USDC = 4 spins)
    function test_R_PayDevAttendLeMinimum() public {
        BlockSlotsRouter b = new BlockSlotsRouter(_cfg(address(usdc)), address(routeur), address(coffre), address(tblock), 1_000_000, MAX_LOT);
        for (uint256 i; i < 3; i++) {
            vm.startPrank(JOUEUR);
            usdc.approve(address(b), SPIN);
            b.spin();
            vm.stopPrank();
        }
        vm.expectRevert(BlockSlotsRouter.BatchTooSmall.selector);
        b.payDev(750_000, 1, block.timestamp);
        assertEq(b.devOwed(), 750_000);
        vm.startPrank(JOUEUR);
        usdc.approve(address(b), SPIN);
        b.spin();
        vm.stopPrank();
        (uint256 lot,) = b.payDev(1_000_000, 1, block.timestamp);
        assertEq(lot, 1_000_000);
        assertEq(usdc.balanceOf(DEV), 100_000);
        assertEq(usdc.balanceOf(address(b)), b.pot());
    }

    /// @dev one payDev never sends more than MAX_DEV_BATCH (here the router's MAX_USDC_PER_PAY, 50 USDC)
    function test_R_PayDevPlafonneAuMaxDuRouteur() public {
        BlockSlotsRouter.Config memory c = _cfg(address(usdc));
        c.spinPrice = 100_000_000; // 100 USDC: a DEV_SHARE of 50 USDC
        BlockSlotsRouter b = _nouveau(c);
        assertEq(b.MAX_DEV_BATCH(), 50_000_000);
        vm.startPrank(JOUEUR);
        usdc.approve(address(b), 300_000_000);
        b.spin();
        b.spin();
        b.spin();
        vm.stopPrank();
        assertEq(b.devOwed(), 150_000_000);
        vm.expectRevert(BlockSlotsRouter.BatchTooLarge.selector);
        b.payDev(50_000_001, 1, block.timestamp);
        (uint256 lot,) = b.payDev(50_000_000, 1, block.timestamp);
        assertEq(lot, 50_000_000, "capped at MAX_DEV_BATCH");
        assertEq(b.devOwed(), 100_000_000);
        b.payDev(50_000_000, 1, block.timestamp);
        b.payDev(50_000_000, 1, block.timestamp);
        assertEq(b.devOwed(), 0);
        assertEq(usdc.balanceOf(DEV), 15_000_000, "10 % of 150 USDC");
        assertEq(usdc.balanceOf(address(b)), b.pot());
    }

    /// @dev onPaid: from the router only, and only for the batch payDev is paying (none outside payDev)
    function test_R_OnPaidHorsPayDevRefuse() public {
        tblock.mint(address(bs), 1e18);
        vm.prank(AUTRE);
        vm.expectRevert(BlockSlotsRouter.NotRouter.selector);
        bs.onPaid(address(bs), 250_000, 1e18, "");
        vm.prank(address(routeur));
        vm.expectRevert(BlockSlotsRouter.BadPayment.selector);
        bs.onPaid(address(bs), 0, 1e18, "");
        vm.prank(address(routeur));
        vm.expectRevert(BlockSlotsRouter.BadPayment.selector);
        bs.onPaid(address(bs), 250_000, 1e18, "");
        assertEq(tblock.balanceOf(address(bs)), 1e18, "nothing forwarded");
        assertEq(_coffreTb(), 0);
    }

    /// @dev outside payDev the price is 0: nobody can pay this game through the router
    function test_R_PaiementDirectAuJeuRefuse() public {
        _spin(JOUEUR);
        vm.startPrank(AUTRE);
        usdc.approve(address(routeur), 250_000);
        vm.expectRevert(bytes("price"));
        routeur.pay(address(bs), 250_000, 1, block.timestamp, "");
        vm.stopPrank();
        assertEq(bs.devOwed(), 250_000);
    }

    /// @dev a router that fails, never calls onPaid, or calls it for another payer: payDev reverts WHOLE and devOwed is intact
    function test_R_RouteurEnPanneOuMalveillantRienNeBouge() public {
        _spin(JOUEUR);
        uint256 b0 = usdc.balanceOf(address(bs));
        routeur.regler(1);
        (bool ok, bytes memory r) = _payDev(AUTRE);
        assertFalse(ok, "router reverts");
        routeur.regler(2);
        (ok, r) = _payDev(AUTRE);
        assertTrue(!ok && _erreur(r) == BlockSlotsRouter.BadPayment.selector, "onPaid for another payer");
        routeur.regler(3);
        (ok, r) = _payDev(AUTRE);
        assertTrue(!ok && _erreur(r) == BlockSlotsRouter.BadPayment.selector, "onPaid never ran");
        routeur.regler(4);
        (ok, r) = _payDev(AUTRE);
        assertTrue(!ok && _erreur(r) == BlockSlotsRouter.TransferFailed.selector, "a router that pulls another amount than the batch");
        assertEq(bs.devOwed(), 250_000, "still owed");
        assertEq(usdc.balanceOf(address(bs)), b0);
        assertEq(usdc.balanceOf(DEV), 0);
        assertEq(_coffreTb(), 0);
        _caisse();
        routeur.regler(0);
        (ok,) = _payDev(AUTRE);
        assertTrue(ok);
        assertEq(usdc.balanceOf(DEV), 25_000);
    }

    /// @dev TBLOCK sent here by anyone leaves with the next batch, to the vault
    function test_R_DonDeTblockVaAuCoffre() public {
        _spin(JOUEUR);
        tblock.mint(address(bs), 777e18);
        (, uint256 out) = bs.payDev(250_000, 1, block.timestamp);
        assertEq(_coffreTb(), out + 777e18);
        assertEq(tblock.balanceOf(address(bs)), 0);
    }

    function test_R_ConstructeurRefuse() public {
        BlockSlotsRouter.Config memory c = _cfg(address(usdc));
        vm.expectRevert(BlockSlotsRouter.BadConfig.selector); // router without code
        new BlockSlotsRouter(c, address(0x1234), address(coffre), address(tblock), MIN_LOT, MAX_LOT);
        vm.expectRevert(BlockSlotsRouter.BadConfig.selector); // the other TBLOCK
        new BlockSlotsRouter(c, address(routeur), address(coffre), address(0xBAD), MIN_LOT, MAX_LOT);
        vm.expectRevert(BlockSlotsRouter.BadConfig.selector);
        new BlockSlotsRouter(c, address(routeur), address(coffre), address(0), MIN_LOT, MAX_LOT);
        RouteurSR autreUsdc = new RouteurSR(address(new UsdcSR()), address(tblock));
        CoffreSR coffreAutreUsdc = new CoffreSR(address(tblock)); // CHANGED (review 2026-11-12): it names that router, so only USDC differs
        coffreAutreUsdc.setRouter(address(autreUsdc));
        vm.expectRevert(BlockSlotsRouter.BadConfig.selector); // a router of another USDC
        new BlockSlotsRouter(c, address(autreUsdc), address(coffreAutreUsdc), address(tblock), MIN_LOT, MAX_LOT);
        RouteurNommeSL rn = new RouteurNommeSL(address(usdc), address(tblock));
        vm.expectRevert(BlockSlotsRouter.BadConfig.selector); // the router itself as DEST, even one answering the vault views
        new BlockSlotsRouter(c, address(rn), address(rn), address(tblock), MIN_LOT, MAX_LOT);
        vm.expectRevert(BlockSlotsRouter.BadConfig.selector); // a codeless vault
        new BlockSlotsRouter(c, address(routeur), address(0xC0FFEE), address(tblock), MIN_LOT, MAX_LOT);
        CoffreSR autre = new CoffreSR(address(0xBAD));
        autre.setRouter(address(routeur));
        vm.expectRevert(BlockSlotsRouter.BadConfig.selector); // a vault of another TBLOCK
        new BlockSlotsRouter(c, address(routeur), address(autre), address(tblock), MIN_LOT, MAX_LOT);
        address[3] memory mauvais = [address(routeur), address(tblock), address(usdc)];
        for (uint256 i; i < 3; i++) {
            vm.expectRevert(BlockSlotsRouter.BadConfig.selector);
            new BlockSlotsRouter(c, address(routeur), mauvais[i], address(tblock), MIN_LOT, MAX_LOT);
        }
        vm.expectRevert(BlockSlotsRouter.BadConfig.selector);
        new BlockSlotsRouter(c, address(routeur), address(coffre), address(tblock), 0, MAX_LOT);
        vm.expectRevert(BlockSlotsRouter.BadConfig.selector);
        new BlockSlotsRouter(c, address(routeur), address(coffre), address(tblock), 50_000_001, MAX_LOT);
        BlockSlotsRouter ok = new BlockSlotsRouter(c, address(routeur), address(coffre), address(tblock), 50_000_000, MAX_LOT);
        assertEq(ok.MIN_DEV_BATCH(), 50_000_000);
        c.devWallet = address(routeur);
        vm.expectRevert(BlockSlotsRouter.BadConfig.selector);
        new BlockSlotsRouter(c, address(routeur), address(coffre), address(tblock), MIN_LOT, MAX_LOT);
    }

    // ----- review 2026-11-12. F1/F2: the batch size is the caller's (MIN_DEV_BATCH .. min(devOwed, MAX_DEV_BATCH)) and its cap is
    //   the constructor's. The vault must be the holders vault (the Skins F1 check, applied here too). F4: guards of onPaid and of the
    //   constructor that the suites did not hold (their mutants survived the reviewer's run).

    /// @dev F1/F2: maxDevBatch is chosen at construction: 1 .. the router's cap, never under minDevBatch
    function test_F1_plafond_du_lot_choisi_a_la_construction() public {
        BlockSlotsRouter.Config memory c = _cfg(address(usdc));
        BlockSlotsRouter b = new BlockSlotsRouter(c, address(routeur), address(coffre), address(tblock), 1_000_000, 10_000_000);
        assertEq(b.MIN_DEV_BATCH(), 1_000_000);
        assertEq(b.MAX_DEV_BATCH(), 10_000_000);
        vm.expectRevert(BlockSlotsRouter.BadConfig.selector); // above the router's MAX_USDC_PER_PAY
        new BlockSlotsRouter(c, address(routeur), address(coffre), address(tblock), 1_000_000, 50_000_001);
        vm.expectRevert(BlockSlotsRouter.BadConfig.selector); // min above max
        new BlockSlotsRouter(c, address(routeur), address(coffre), address(tblock), 10_000_001, 10_000_000);
        vm.expectRevert(BlockSlotsRouter.BadConfig.selector); // max 0
        new BlockSlotsRouter(c, address(routeur), address(coffre), address(tblock), 1, 0);
        BlockSlotsRouter un = new BlockSlotsRouter(c, address(routeur), address(coffre), address(tblock), 250_000, 250_000);
        assertEq(un.MAX_DEV_BATCH(), 250_000, "min == max is allowed");
    }

    /// @dev F1/F2: the caller names the batch: MIN_DEV_BATCH <= amount <= min(devOwed, MAX_DEV_BATCH); exactly that amount leaves
    function test_F1_le_lot_est_au_choix_de_l_appelant() public {
        BlockSlotsRouter.Config memory c = _cfg(address(usdc));
        c.spinPrice = 100_000_000; // a DEV_SHARE of 50 USDC
        BlockSlotsRouter b = new BlockSlotsRouter(c, address(routeur), address(coffre), address(tblock), 1_000_000, 10_000_000);
        vm.startPrank(JOUEUR);
        usdc.approve(address(b), 100_000_000);
        b.spin();
        vm.stopPrank();
        assertEq(b.devOwed(), 50_000_000);
        vm.expectRevert(BlockSlotsRouter.BatchTooLarge.selector); // above MAX_DEV_BATCH
        b.payDev(10_000_001, 1, block.timestamp);
        vm.expectRevert(BlockSlotsRouter.BatchTooLarge.selector); // the old pinned batch: refused
        b.payDev(50_000_000, 1, block.timestamp);
        vm.expectRevert(BlockSlotsRouter.BatchTooSmall.selector);
        b.payDev(999_999, 1, block.timestamp);
        vm.expectRevert(BlockSlotsRouter.BatchTooSmall.selector);
        b.payDev(0, 1, block.timestamp);
        vm.prank(AUTRE);
        (uint256 lot, uint256 out) = b.payDev(1_000_000, 1, block.timestamp);
        assertEq(lot, 1_000_000);
        assertEq(out, 900_000 * routeur.TAUX());
        assertEq(b.devOwed(), 49_000_000, "exactly the amount asked left devOwed");
        for (uint256 i; i < 4; i++) b.payDev(10_000_000, 1, block.timestamp);
        assertEq(b.devOwed(), 9_000_000);
        vm.expectRevert(BlockSlotsRouter.BatchTooLarge.selector); // above devOwed
        b.payDev(9_000_001, 1, block.timestamp);
        b.payDev(9_000_000, 1, block.timestamp);
        assertEq(b.devOwed(), 0);
        assertEq(usdc.balanceOf(DEV), 5_000_000, "10 % of 50 USDC");
        assertEq(usdc.balanceOf(address(b)), b.pot(), "solde = pot");
        assertEq(usdc.allowance(address(b), address(routeur)), 0);
        vm.expectRevert(BlockSlotsRouter.BatchTooSmall.selector); // nothing owed
        b.payDev(1_000_000, 1, block.timestamp);
    }

    /// @dev F1 (Skins review, same check here): the vault must name THIS router and answer free()
    function test_F1_la_destination_doit_etre_le_coffre_des_holders() public {
        BlockSlotsRouter.Config memory c = _cfg(address(usdc));
        CoffreSR sansRouteur = new CoffreSR(address(tblock)); // the lock, Hearts, the lock rewards: no router named
        CoffreSR autreRouteur = new CoffreSR(address(tblock));
        autreRouteur.setRouter(address(0xBAD));
        address[3] memory mauvais = [address(sansRouteur), address(autreRouteur), address(new SansFreeSL(address(tblock), address(routeur)))];
        for (uint256 i; i < 3; i++) {
            vm.expectRevert(BlockSlotsRouter.BadConfig.selector);
            new BlockSlotsRouter(c, address(routeur), mauvais[i], address(tblock), MIN_LOT, MAX_LOT);
        }
        assertEq(bs.DEST(), address(coffre));
    }

    function _payDevRefuse(bytes4 err) internal {
        for (uint256 i; i < 4; i++) _spin(JOUEUR);
        uint256 b0 = usdc.balanceOf(address(bs));
        vm.expectRevert(err);
        bs.payDev(1_000_000, 1, block.timestamp);
        assertEq(bs.devOwed(), 1_000_000, "still owed");
        assertEq(usdc.balanceOf(address(bs)), b0);
        assertEq(_coffreTb(), 0);
    }

    /// @dev F4 / onPaid: usdcIn != the batch in flight
    function test_F4_onPaid_avec_un_autre_montant_refuse() public {
        routeur.regler(5);
        _payDevRefuse(BlockSlotsRouter.BadPayment.selector);
    }

    /// @dev F4 / onPaid: tblockOut == 0
    function test_F4_zero_tblock_refuse() public {
        routeur.regler(6);
        _payDevRefuse(BlockSlotsRouter.BadPayment.selector);
    }

    /// @dev F4 / onPaid: the router claims more TBLOCK than it delivered (got < tblockOut)
    function test_F4_routeur_qui_annonce_plus_qu_il_ne_livre_refuse() public {
        routeur.regler(7);
        _payDevRefuse(BlockSlotsRouter.BadPayment.selector);
    }

    /// @dev F4 / onPaid: DEST must receive every TBLOCK forwarded
    function test_F4_coffre_qui_recoit_moins_refuse() public {
        tblock.regler(1, address(coffre));
        _payDevRefuse(BlockSlotsRouter.TransferFailed.selector);
    }

    /// @dev F4 / onPaid: nothing may stay here after the forward
    function test_F4_jeton_qui_laisse_quelque_chose_ici_refuse() public {
        tblock.regler(2, address(0));
        _payDevRefuse(BlockSlotsRouter.TransferFailed.selector);
    }

    /// @dev F4 / constructor: the vault is not the dev wallet; the dev wallet is not TBLOCK; TBLOCK has code
    function test_F4_constructeur_coffre_wallet_et_tblock_sans_code() public {
        BlockSlotsRouter.Config memory c = _cfg(address(usdc));
        c.devWallet = address(coffre);
        vm.expectRevert(BlockSlotsRouter.BadConfig.selector);
        new BlockSlotsRouter(c, address(routeur), address(coffre), address(tblock), MIN_LOT, MAX_LOT);
        c.devWallet = address(tblock);
        vm.expectRevert(BlockSlotsRouter.BadConfig.selector);
        new BlockSlotsRouter(c, address(routeur), address(coffre), address(tblock), MIN_LOT, MAX_LOT);
        c.devWallet = DEV;
        address fantome = address(0x7B10C);
        RouteurSR r2 = new RouteurSR(address(usdc), fantome);
        CoffreSR v2 = new CoffreSR(fantome);
        v2.setRouter(address(r2));
        vm.expectRevert(BlockSlotsRouter.BadConfig.selector);
        new BlockSlotsRouter(c, address(r2), address(v2), fantome, MIN_LOT, MAX_LOT);
    }
}
