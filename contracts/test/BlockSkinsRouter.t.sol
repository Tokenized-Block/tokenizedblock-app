// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {BlockSkinsRouter} from "../src/BlockSkins1.sol";
import {TBlockLock} from "../src/TBlockLock.sol";

/// @dev ERC-20 with a chosen number of decimals (USDC 6, a tokenized stock 8).
contract JetonSR {
    string public name = "JetonSR";
    uint8 public decimals;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(uint8 d) {
        decimals = d;
    }

    function mint(address to, uint256 a) external {
        balanceOf[to] += a;
    }

    function approve(address s, uint256 a) external returns (bool) {
        allowance[msg.sender][s] = a;
        return true;
    }

    function transfer(address to, uint256 a) external virtual returns (bool) {
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }

    function transferFrom(address f, address to, uint256 a) external virtual returns (bool) {
        allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[to] += a;
        return true;
    }
}

/// @dev takes 1 % on every transfer: must be refused at the bid.
contract JetonATaxeSR is JetonSR(18) {
    function transferFrom(address f, address to, uint256 a) external override returns (bool) {
        allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[to] += a - a / 100;
        return true;
    }
}

/// @dev a token with a blacklist (USDC has one): a transfer TO a blocked account reverts.
contract JetonListeNoireSR is JetonSR(6) {
    mapping(address => bool) public bloque;

    function bloquer(address a, bool b) external {
        bloque[a] = b;
    }

    function transfer(address to, uint256 a) external override returns (bool) {
        require(!bloque[to], "blacklisted");
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }
}

/// @dev TblockPayRouter stand-in, with the real router's money path: pulls EXACTLY the game's PRICE_USDC from msg.sender only, sends
///      the game's USDC_SPLIT cut to its dev wallet, "buys" TBLOCK with the rest at a fixed rate (minted), sends it to the game, then
///      calls onPaid(msg.sender, ...) LAST. The real router (swaps, floors) is tested in forge-payrouter and with this game in forge-pack.
interface ISkinGameSR {
    function PRICE_USDC() external view returns (uint256);
    function USDC_SPLIT() external view returns (address, uint16);
    function onPaid(address payer, uint256 usdcIn, uint256 tblockOut, bytes calldata data) external;
}

contract RouteurFacticeSR {
    address public immutable USDC;
    address public immutable TBLOCK;
    uint256 public constant TAUX = 1e12 * 1000; // 1 raw USDC (1e-6 USDC) buys 1e15 raw TBLOCK: 1 USDC = 1,000 TBLOCK

    constructor(address usdc, address tblock) {
        USDC = usdc;
        TBLOCK = tblock;
    }

    function pay(address game, uint256 usdcIn, uint256 minOut, uint256, bytes calldata data) external returns (uint256 out) {
        require(usdcIn == ISkinGameSR(game).PRICE_USDC(), "price");
        (address dev, uint16 bps) = ISkinGameSR(game).USDC_SPLIT();
        JetonSR(USDC).transferFrom(msg.sender, address(this), usdcIn);
        uint256 cut = usdcIn * bps / 10_000;
        JetonSR(USDC).transfer(dev, cut);
        out = (usdcIn - cut) * TAUX;
        require(out >= minOut, "minOut");
        JetonSR(TBLOCK).mint(game, out);
        ISkinGameSR(game).onPaid(msg.sender, usdcIn, out, data);
    }
}

/// @dev holders vault / lock rewards stand-in: lists every game unless told not to, records each play (cheap: fits PLAY_GAS)
contract EnregistreurFacticeSR {
    address public TBLOCK;
    bool public nonListe;
    /// @dev review F1 (2026-11-12): the constructor now also requires DEST.ROUTER() == the router and a free() view, as the live vault
    address public ROUTER;

    constructor(address t) {
        TBLOCK = t;
    }

    function setRouter(address r) external {
        ROUTER = r;
    }

    /// @dev a constant: the test of a vault of another TBLOCK (codeless 0xBAD) must reach the TBLOCK guard, not fail on a balance read
    function free() external pure returns (uint256) {
        return 0;
    }

    uint8 public mode; // 1 = revert, 2 = burn all its gas
    uint256 public nb;
    address public dernierJoueur;
    uint256 public dernierMontant;
    address public dernierAppelant;

    function regler(bool nl, uint8 m) external {
        nonListe = nl;
        mode = m;
    }

    function isGame(address) external view returns (bool) {
        return !nonListe;
    }

    function recordPlay(address p, uint256 t) external {
        _rec(p, t);
    }

    function recordPlay(address p) external {
        _rec(p, 0);
    }

    function _rec(address p, uint256 t) private {
        if (mode == 1) revert("record en panne");
        if (mode == 2) while (true) {}
        nb++;
        dernierJoueur = p;
        dernierMontant = t;
        dernierAppelant = msg.sender;
    }
}

/// @dev review F1 (2026-11-12): contracts that passed the old DEST check (code + TBLOCK()) and are NOT the holders vault.
///      Measured on Base (eth_call): the lock, Hearts and the lock rewards revert on ROUTER(); TAM art and the old Skins answer
///      ROUTER() == P but revert on free(); only the holders vault V answers both.
contract DestNommeTblockSR {
    address public TBLOCK;

    constructor(address t) {
        TBLOCK = t;
    }
}

contract DestSansFreeSR {
    address public TBLOCK;
    address public ROUTER;

    constructor(address t, address r) {
        TBLOCK = t;
        ROUTER = r;
    }
}

/// @dev a vault-like contract that names the router and answers free() but has no TBLOCK() view
contract DestSansTblockSR {
    address public ROUTER;

    constructor(address r) {
        ROUTER = r;
    }

    function free() external pure returns (uint256) {
        return 0;
    }
}

contract DestAutreRouteurSR {
    address public TBLOCK;
    address public ROUTER;

    constructor(address t, address r) {
        TBLOCK = t;
        ROUTER = r;
    }

    function free() external pure returns (uint256) {
        return 0;
    }
}

/// @dev review G1: a TBLOCK whose transfer TO court delivers 1 raw unit less (the forward to DEST arrives short)
contract JetonCourtSR is JetonSR(18) {
    address public court;

    function setCourt(address c) external {
        court = c;
    }

    function transfer(address to, uint256 a) external override returns (bool) {
        balanceOf[msg.sender] -= a;
        balanceOf[to] += (to == court && a != 0) ? a - 1 : a;
        return true;
    }
}

/// @dev review M1: a fee wallet / seller that refuses ETH and has no other code
contract SansEthSR {
    receive() external payable {
        revert("no eth");
    }
}

/// @dev review G6: a seller whose receive() burns every unit of gas it is given
contract BruleGazSR {
    receive() external payable {
        while (true) {}
    }
}

/// @dev a bidder / seller that refuses ETH.
contract RefuseEthSR {
    BlockSkinsRouter s;

    constructor(BlockSkinsRouter s_) {
        s = s_;
    }

    function encherir(uint256 id, uint256 a) external payable {
        s.bid{value: a}(id, a);
    }

    function retirer() external {
        s.withdraw(address(0));
    }

    receive() external payable {
        revert("no eth");
    }
}

/// @dev re-enters the contract from the ONE callback that carries full gas: the ETH withdrawal. What it tries (a mint, which
///      it can pay for) would SUCCEED without the lock — so a green here is the lock, not a lucky revert.
///      v3 router game: the mint goes through the router, whose onPaid into the skins contract is what the lock refuses.
contract ReentrantSR {
    BlockSkinsRouter s;
    RouteurFacticeSR routeur;
    address bloc;
    uint64 recette;
    bool public aTente;
    bool public reentreeReussie;

    constructor(BlockSkinsRouter s_, RouteurFacticeSR routeur_, address usdc, address bloc_, uint64 recette_) {
        s = s_;
        routeur = routeur_;
        bloc = bloc_;
        recette = recette_;
        JetonSR(usdc).approve(address(routeur_), type(uint256).max);
    }

    function encherir(uint256 id, uint256 a) external payable {
        s.bid{value: a}(id, a);
    }

    function retirer() external {
        s.withdraw(address(0));
    }

    receive() external payable {
        aTente = true;
        try routeur.pay(address(s), 1_000_000, 1, block.timestamp, abi.encode(bloc, recette)) returns (uint256) {
            reentreeReussie = true;
        } catch {}
    }
}

contract BlockSkinsRouterTest is Test {
    BlockSkinsRouter s;
    JetonSR usdc;
    JetonSR tblock; // the canonical TBLOCK the router buys
    JetonSR action; // a tokenized stock, 8 decimals
    RouteurFacticeSR routeur;
    EnregistreurFacticeSR coffre; // the holders vault (DEST) stand-in
    EnregistreurFacticeSR gains; // TBlockLockRewards stand-in
    address constant FRAIS = address(0xFEE5);
    address constant BLOC = address(0xb200000000000000000000e4B0c5fBE9C8DF579E);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address carol = address(0xCA401);
    address agent = address(0xA6E47);
    uint64 recette;

    function setUp() public {
        usdc = new JetonSR(6);
        tblock = new JetonSR(18);
        action = new JetonSR(8);
        routeur = new RouteurFacticeSR(address(usdc), address(tblock));
        coffre = new EnregistreurFacticeSR(address(tblock));
        coffre.setRouter(address(routeur));
        gains = new EnregistreurFacticeSR(address(tblock)); // a lock-rewards stand-in: the new contract never calls it
        s = new BlockSkinsRouter(address(routeur), FRAIS, address(coffre), address(tblock), address(usdc));
        for (uint256 i = 0; i < 3; i++) {
            address a = [alice, bob, carol][i];
            usdc.mint(a, 1_000e6);
            action.mint(a, 100e8);
            vm.deal(a, 100 ether);
            vm.startPrank(a);
            usdc.approve(address(s), type(uint256).max);
            usdc.approve(address(routeur), type(uint256).max);
            action.approve(address(s), type(uint256).max);
            vm.stopPrank();
        }
        recette = s.packRecipe([uint16(210), 267, 263, 92, 120, 300, 200]);
    }

    /// @dev a mint is a router payment of exactly 1 USDC, data = abi.encode(block, recipe)
    function _payer(address qui, address bloc, uint64 r) internal returns (uint256 id) {
        vm.prank(qui);
        routeur.pay(address(s), 1_000_000, 1, block.timestamp, abi.encode(bloc, r));
        id = s.totalSupply();
    }

    function _mint(address qui) internal returns (uint256 id) {
        id = _payer(qui, BLOC, recette);
    }

    // ─────────────── mint
    /// @dev v3 (Phil, 2026-10-18 : « tous les skins a 10 dollars ») : le prix est une CONSTANTE lue par l app (MINT_PRICE()) et c est
    ///      EXACTEMENT ce que le mint prend. Les chiffres sont ecrits en clair ici (1_000_000), jamais relus depuis le contrat teste.
    ///      CHANGED by the economy v2 pack (Phil 2026-11-11, skins = a router game): the 10 USDC go through the router, so the fee wallet
    ///      now receives 10 % (1 USDC) and the other 9 USDC buy TBLOCK for the holders vault. The exact-price rule is unchanged.
    function test_mint_price_est_exactement_1_usdc() public {
        assertEq(s.MINT_PRICE(), 1_000_000, "MINT_PRICE() = 1 USDC (6 decimales)");
        assertEq(s.PRICE_USDC(), 1_000_000, "PRICE_USDC() lu par le routeur = le meme prix");
        // une approbation d un micro-USDC de moins que le prix : le mint REVERTE (le prix n est pas « au moins », il est exact)
        address dave = address(0xDA7E);
        usdc.mint(dave, 1_000_000);
        vm.startPrank(dave);
        usdc.approve(address(routeur), 999_999);
        vm.expectRevert();
        routeur.pay(address(s), 1_000_000, 1, block.timestamp, abi.encode(BLOC, recette));
        // un autre montant que le prix exact est refuse par le routeur (PRICE_USDC est exact, pas un minimum)
        usdc.approve(address(routeur), 20_000_000);
        vm.expectRevert(bytes("price"));
        routeur.pay(address(s), 1_000_001, 1, block.timestamp, abi.encode(BLOC, recette));
        // l ancien prix (10 USDC, le contrat live) est refuse aussi
        vm.expectRevert(bytes("price"));
        routeur.pay(address(s), 10_000_000, 1, block.timestamp, abi.encode(BLOC, recette));
        usdc.approve(address(routeur), 1_000_000);
        routeur.pay(address(s), 1_000_000, 1, block.timestamp, abi.encode(BLOC, recette));
        vm.stopPrank();
        assertEq(usdc.balanceOf(dave), 0, "dave a paye exactement 1 USDC, pas un de plus");
        assertEq(usdc.balanceOf(FRAIS), 100_000, "le wallet des frais a recu exactement 10 % (0,10 USDC)");
        assertEq(tblock.balanceOf(address(coffre)), 900_000 * routeur.TAUX(), "les 0,90 USDC restants, en TBLOCK, au coffre");
    }

    /// @dev 1 USDC skins: 0.10 USDC to the fee wallet, 0.90 USDC of TBLOCK to DEST
    function test_mint_paie_10_pourcent_au_wallet_des_frais_et_le_reste_en_tblock_au_coffre() public {
        uint256 avant = usdc.balanceOf(alice);
        uint256 id = _mint(alice);
        assertEq(usdc.balanceOf(FRAIS), 0.1e6, "le wallet des frais recoit 10 % : 0,10 USDC");
        assertEq(tblock.balanceOf(address(coffre)), 0.9e6 * routeur.TAUX(), "le coffre recoit le TBLOCK achete avec 0,90 USDC");
        assertEq(avant - usdc.balanceOf(alice), 1e6, "l acheteur perd 1 USDC");
        assertEq(usdc.balanceOf(address(s)), 0, "le contrat ne garde rien");
        assertEq(tblock.balanceOf(address(s)), 0, "le contrat ne garde aucun TBLOCK");
        assertEq(s.ownerOf(id), alice);
        assertEq(s.balanceOf(alice), 1);
        assertEq(s.totalSupply(), 1);
        (address b, uint64 r, address m) = s.skinOf(id);
        assertEq(b, BLOC);
        assertEq(r, recette);
        assertEq(m, alice);
    }

    /// @dev mint path changed (router), expectations unchanged: every recipe check refuses the same inputs
    function test_recette_aller_retour_et_bornes() public {
        uint16[7] memory h = s.unpackRecipe(recette);
        assertEq(h[0], 210);
        assertEq(h[3], 92);
        assertEq(h[6], 200);
        vm.expectRevert(BlockSkinsRouter.BadRecipe.selector);
        s.packRecipe([uint16(360), 0, 0, 0, 0, 0, 0]);
        // une recette brute avec une teinte a 511 (9 bits pleins) est refusee au mint
        vm.prank(alice);
        vm.expectRevert(BlockSkinsRouter.BadRecipe.selector);
        routeur.pay(address(s), 1_000_000, 1, block.timestamp, abi.encode(BLOC, uint64(511)));
        // 360 dans n importe laquelle des 7 teintes
        for (uint256 i = 0; i < 7; i++) {
            vm.prank(alice);
            vm.expectRevert(BlockSkinsRouter.BadRecipe.selector);
            routeur.pay(address(s), 1_000_000, 1, block.timestamp, abi.encode(BLOC, uint64(360) << uint64(9 * i)));
        }
        vm.prank(alice);
        vm.expectRevert(BlockSkinsRouter.BadRecipe.selector);
        routeur.pay(address(s), 1_000_000, 1, block.timestamp, abi.encode(BLOC, uint64(1) << 63));
        vm.prank(alice);
        vm.expectRevert(BlockSkinsRouter.BadAddress.selector);
        routeur.pay(address(s), 1_000_000, 1, block.timestamp, abi.encode(address(0), recette));
        assertEq(s.totalSupply(), 0);
        assertEq(usdc.balanceOf(FRAIS), 0, "aucun paiement refuse n a bouge d USDC");
    }

    function test_mint_sans_usdc_ou_sans_approbation_echoue() public {
        address pauvre = address(0xDEAD1);
        vm.prank(pauvre);
        vm.expectRevert();
        routeur.pay(address(s), 1_000_000, 1, block.timestamp, abi.encode(BLOC, recette));
        assertEq(s.totalSupply(), 0);
        assertEq(usdc.balanceOf(FRAIS), 0);
    }

    // ─────────────── v3 router game (economy v2 pack, 2026-11-11)
    /// @dev CHANGED (Phil 2026-11-12): the mint goes to the payer and is NOT a play: neither the vault nor the rewards stand-in is called
    function test_routeur_mint_au_payeur_sans_aucun_jeu_enregistre() public {
        vm.prank(bob);
        uint256 out = routeur.pay(address(s), 1_000_000, 1, block.timestamp, abi.encode(BLOC, recette));
        assertEq(s.ownerOf(1), bob, "le skin va au PAYEUR");
        assertEq(tblock.balanceOf(address(coffre)), out, "le TBLOCK achete est au coffre");
        assertEq(coffre.nb(), 0, "aucun recordPlay au coffre");
        assertEq(gains.nb(), 0, "aucun recordPlay aux gains");
        assertEq(s.VAULT(), address(coffre));
        assertEq(s.DEST(), address(coffre));
        assertEq(s.TBLOCK(), address(tblock));
        (bool ok,) = address(s).staticcall(abi.encodeWithSignature("REWARDS()"));
        assertFalse(ok, "plus de REWARDS");
        (ok,) = address(s).staticcall(abi.encodeWithSignature("wired()"));
        assertFalse(ok, "plus de wired()");
        (address dev, uint16 bps) = s.USDC_SPLIT();
        assertEq(dev, FRAIS);
        assertEq(bps, 1000);
    }

    function test_onPaid_routeur_seulement() public {
        tblock.mint(address(s), 1e18);
        vm.prank(alice);
        vm.expectRevert(BlockSkinsRouter.NotRouter.selector);
        s.onPaid(alice, 1_000_000, 1e18, abi.encode(BLOC, recette));
        assertEq(s.totalSupply(), 0);
        assertEq(coffre.nb(), 0);
        assertEq(gains.nb(), 0);
    }

    /// @dev CHANGED: the live contract refused (NotWired) unless the vault AND the rewards listed it; this one is listed by neither
    ///      (their lists are fixed) and mints anyway: a vault that does not list it still receives the TBLOCK
    function test_coffre_qui_ne_liste_pas_le_jeu_ne_bloque_pas() public {
        coffre.regler(true, 0);
        gains.regler(true, 0);
        vm.prank(alice);
        uint256 out = routeur.pay(address(s), 1_000_000, 1, block.timestamp, abi.encode(BLOC, recette));
        assertEq(s.ownerOf(1), alice);
        assertEq(tblock.balanceOf(address(coffre)), out);
        assertEq(usdc.balanceOf(alice), 1_000e6 - 1e6, "1 USDC paye");
        assertEq(coffre.nb() + gains.nb(), 0);
    }

    /// @dev NEW: onPaid takes exactly PRICE_USDC with a non-zero, fully held TBLOCK output, from the router only
    function test_onPaid_montant_et_sortie_exacts() public {
        tblock.mint(address(s), 1e18);
        vm.startPrank(address(routeur));
        vm.expectRevert(BlockSkinsRouter.BadPayment.selector);
        s.onPaid(alice, 10_000_000, 1e18, abi.encode(BLOC, recette)); // the old price
        vm.expectRevert(BlockSkinsRouter.BadPayment.selector);
        s.onPaid(alice, 999_999, 1e18, abi.encode(BLOC, recette));
        vm.expectRevert(BlockSkinsRouter.BadPayment.selector);
        s.onPaid(alice, 1_000_000, 0, abi.encode(BLOC, recette));
        vm.expectRevert(BlockSkinsRouter.BadPayment.selector);
        s.onPaid(alice, 1_000_000, 1e18 + 1, abi.encode(BLOC, recette)); // claims more TBLOCK than it holds
        vm.expectRevert(BlockSkinsRouter.BadAddress.selector);
        s.onPaid(address(0), 1_000_000, 1e18, abi.encode(BLOC, recette));
        s.onPaid(alice, 1_000_000, 1e18, abi.encode(BLOC, recette));
        vm.stopPrank();
        assertEq(s.ownerOf(1), alice);
        assertEq(tblock.balanceOf(address(coffre)), 1e18);
        assertEq(tblock.balanceOf(address(s)), 0);
    }

    function test_don_de_tblock_va_au_coffre_mais_ne_compte_pas() public {
        tblock.mint(address(s), 777e18);
        vm.prank(alice);
        uint256 out = routeur.pay(address(s), 1_000_000, 1, block.timestamp, abi.encode(BLOC, recette));
        assertEq(tblock.balanceOf(address(coffre)), out + 777e18, "tout le TBLOCK tenu part au coffre");
        assertEq(coffre.nb(), 0, "et rien n est enregistre");
    }

    /// @dev the stand-ins revert / burn all gas if called: the mint passes because neither is ever called
    function test_enregistrement_en_panne_ne_bloque_pas_le_mint() public {
        for (uint8 m = 1; m <= 2; m++) {
            coffre.regler(false, m);
            gains.regler(false, m);
            uint256 id = _mint(alice);
            assertEq(s.ownerOf(id), alice, "minte malgre les deux enregistrements en panne");
        }
        assertEq(coffre.nb(), 0);
        assertEq(gains.nb(), 0);
    }

    function test_tblock_jamais_devise_du_marche() public {
        vm.expectRevert(BlockSkinsRouter.NotAllowed.selector);
        s.setCurrency(address(tblock), true);
        assertFalse(s.currencyAllowed(address(tblock)));
    }

    /// @dev CHANGED: no rewards parameter; DEST is an existing vault now, so a codeless DEST or one holding another TBLOCK is refused
    function test_constructeur_refuse_les_mauvais_cablages() public {
        vm.expectRevert(BlockSkinsRouter.BadToken.selector); // the OTHER TBLOCK
        new BlockSkinsRouter(address(routeur), FRAIS, address(coffre), address(0xBAD), address(usdc));
        vm.expectRevert(BlockSkinsRouter.BadToken.selector);
        new BlockSkinsRouter(address(routeur), FRAIS, address(coffre), address(tblock), address(0xBAD));
        vm.expectRevert(BlockSkinsRouter.BadAddress.selector); // router without code
        new BlockSkinsRouter(address(0x1234), FRAIS, address(coffre), address(tblock), address(usdc));
        address[5] memory mauvais = [address(0), address(routeur), FRAIS, address(tblock), address(usdc)];
        for (uint256 i; i < mauvais.length; i++) {
            vm.expectRevert(BlockSkinsRouter.BadAddress.selector);
            new BlockSkinsRouter(address(routeur), FRAIS, mauvais[i], address(tblock), address(usdc));
        }
        vm.expectRevert(BlockSkinsRouter.BadAddress.selector);
        new BlockSkinsRouter(address(routeur), address(routeur), address(coffre), address(tblock), address(usdc));
        vm.expectRevert(BlockSkinsRouter.BadAddress.selector); // a codeless DEST
        new BlockSkinsRouter(address(routeur), FRAIS, address(0xC0FFEE), address(tblock), address(usdc));
        EnregistreurFacticeSR autre = new EnregistreurFacticeSR(address(0xBAD));
        autre.setRouter(address(routeur)); // CHANGED (review F1): it names the router, so only its TBLOCK is wrong
        vm.expectRevert(BlockSkinsRouter.BadAddress.selector); // a vault of another TBLOCK
        new BlockSkinsRouter(address(routeur), FRAIS, address(autre), address(tblock), address(usdc));
        vm.expectRevert(BlockSkinsRouter.BadAddress.selector); // a DEST with code but no TBLOCK() view
        new BlockSkinsRouter(address(routeur), FRAIS, address(action), address(tblock), address(usdc));
        DestSansTblockSR sansTb = new DestSansTblockSR(address(routeur)); // CHANGED (review F1): ROUTER() and free(), no TBLOCK()
        vm.expectRevert(BlockSkinsRouter.BadAddress.selector);
        new BlockSkinsRouter(address(routeur), FRAIS, address(sansTb), address(tblock), address(usdc));
        BlockSkinsRouter t = new BlockSkinsRouter(address(routeur), FRAIS, address(coffre), address(tblock), address(usdc));
        assertEq(t.DEST(), address(coffre));
    }

    // ─────────────── tokenURI (v2, 2026-10-11) : ce qu un wallet lit. L attendu est construit ICI, avec le base64 de REFERENCE de forge
    //   (vm.toBase64) et vm.toString : une implementation independante de celle du contrat.
    function _svgAttendu(uint16[7] memory h) internal pure returns (string memory) {
        string memory a = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400"><defs><linearGradient id="a" gradientTransform="rotate(',
            vm.toString(uint256(h[0])),
            ' .5 .5)"><stop offset="0" stop-color="hsl(',
            vm.toString(uint256(h[1])),
            ',90%,62%)"/><stop offset=".33" stop-color="hsl(',
            vm.toString(uint256(h[2])),
            ',90%,38%)"/><stop offset=".66" stop-color="hsl(',
            vm.toString(uint256(h[3]))
        );
        a = string.concat(
            a,
            ',90%,70%)"/><stop offset="1" stop-color="hsl(',
            vm.toString(uint256(h[2])),
            ',90%,30%)"/></linearGradient><radialGradient id="c"><stop offset="0" stop-color="hsl(',
            vm.toString(uint256(h[5])),
            ',90%,70%)"/><stop offset="1" stop-color="hsl(',
            vm.toString(uint256(h[5])),
            ',90%,25%)"/></radialGradient></defs>'
        );
        return string.concat(
            a,
            '<rect width="400" height="400" fill="hsl(',
            vm.toString(uint256(h[6])),
            ',45%,9%)"/><circle cx="200" cy="200" r="182" fill="none" stroke="url(#a)" stroke-width="14"/><circle cx="200" cy="200" r="58" fill="url(#c)"/><g fill="none" stroke="hsl(',
            vm.toString(uint256(h[4])),
            ',90%,60%)" stroke-width="5" stroke-linejoin="round"><path d="M200 90 295 145 295 255 200 310 105 255 105 145Z"/><path d="M105 145 200 200 295 145M200 200V310"/></g></svg>'
        );
    }

    function _uriAttendu(uint256 id, address bloc, uint16[7] memory h) internal pure returns (string memory) {
        string memory b = vm.toLowercase(vm.toString(bloc));
        string memory j = string.concat(
            '{"name":"TokenizedBlock skin #',
            vm.toString(id),
            '","description":"A skin for one block: a look, not a right over the block.","image":"data:image/svg+xml;base64,',
            vm.toBase64(_svgAttendu(h)),
            '","block":"',
            b,
            '","hues":['
        );
        j = string.concat(j, vm.toString(uint256(h[0])), ",", vm.toString(uint256(h[1])), ",", vm.toString(uint256(h[2])), ",");
        j = string.concat(j, vm.toString(uint256(h[3])), ",", vm.toString(uint256(h[4])), ",", vm.toString(uint256(h[5])), ",");
        j = string.concat(j, vm.toString(uint256(h[6])), '],"attributes":[{"trait_type":"Block","value":"', b, '"}]}');
        return string.concat("data:application/json;base64,", vm.toBase64(j));
    }

    function _sansDiese(string memory u) internal pure returns (bool) {
        bytes memory x = bytes(u);
        for (uint256 i = 0; i < x.length; i++) if (x[i] == "#") return false;
        return true;
    }

    function test_tokenURI_porte_l_image_du_skin_en_base64() public {
        uint256 id = _mint(alice);
        string memory u = s.tokenURI(id);
        assertEq(u, _uriAttendu(1, BLOC, [uint16(210), 267, 263, 92, 120, 300, 200]), "tokenURI : le JSON (nom, image, block, teintes) en base64");
        // ⛔ v1 portait « # » en clair : fetch() le prenait pour un fragment et coupait le JSON (29 caracteres sur 219, mesure sur fork)
        assertTrue(_sansDiese(u), "aucun # dans l URI : rien ne peut etre lu comme un fragment");
        vm.expectRevert(BlockSkinsRouter.BadAddress.selector);
        s.tokenURI(2);
    }

    /// @dev toute recette : couvre les trois longueurs de padding base64 (le nombre de chiffres des teintes et de l id varie).
    function testFuzz_tokenURI_toute_recette(uint16[7] memory h, uint8 avant) public {
        for (uint256 i = 0; i < 7; i++) h[i] = uint16(bound(h[i], 0, 359));
        for (uint256 i = 0; i < avant % 12; i++) _mint(bob); // l id du skin varie de 1 a 12 (un ou deux chiffres)
        uint64 r = s.packRecipe(h); // AVANT le prank : un appel externe en argument consommerait le prank
        uint256 id = _payer(alice, BLOC, r);
        assertEq(s.tokenURI(id), _uriAttendu(id, BLOC, h));
    }

    // ─────────────── ERC-721
    function test_erc721_transfert_approbation_et_refus() public {
        uint256 id = _mint(alice);
        vm.prank(bob);
        vm.expectRevert(BlockSkinsRouter.NotAllowed.selector);
        s.transferFrom(alice, bob, id);
        vm.prank(alice);
        s.approve(bob, id);
        vm.prank(bob);
        s.transferFrom(alice, carol, id);
        assertEq(s.ownerOf(id), carol);
        assertEq(s.getApproved(id), address(0), "l approbation tombe au transfert");
        assertTrue(s.supportsInterface(0x80ac58cd));
        vm.expectRevert(BlockSkinsRouter.BadAddress.selector);
        s.ownerOf(999);
    }

    // ─────────────── prix fixe
    function test_vente_usdc_10_pourcent_au_dev_90_au_vendeur() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        s.list(id, address(usdc), 50e6);
        assertEq(s.ownerOf(id), address(s), "le NFT est tenu par le contrat pendant la vente");
        uint256 fAvant = usdc.balanceOf(FRAIS);
        uint256 aAvant = usdc.balanceOf(alice);
        vm.prank(bob);
        s.buy(id);
        assertEq(s.ownerOf(id), bob);
        assertEq(usdc.balanceOf(FRAIS) - fAvant, 5e6, "10 % au wallet des frais");
        assertEq(usdc.balanceOf(alice) - aAvant, 45e6, "90 % au vendeur");
        assertEq(usdc.balanceOf(address(s)), 0, "le contrat ne garde rien");
    }

    function test_vente_eth_et_mauvais_montant_refuse() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        s.list(id, address(0), 1 ether);
        vm.prank(bob);
        vm.expectRevert(BlockSkinsRouter.WrongValue.selector);
        s.buy{value: 0.9 ether}(id);
        uint256 aAvant = alice.balance;
        vm.prank(bob);
        s.buy{value: 1 ether}(id);
        assertEq(FRAIS.balance, 0.1 ether);
        assertEq(alice.balance - aAvant, 0.9 ether);
        assertEq(address(s).balance, 0);
    }

    function test_vente_en_action_tokenisee_si_admise_seulement() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        vm.expectRevert(BlockSkinsRouter.NotAllowed.selector);
        s.list(id, address(action), 1e8);
        s.setCurrency(address(action), true);
        vm.prank(alice);
        s.list(id, address(action), 2e8);
        // retirer la devise ensuite ne bloque PAS la vente en cours
        s.setCurrency(address(action), false);
        vm.prank(bob);
        s.buy(id);
        assertEq(action.balanceOf(FRAIS), 0.2e8);
        assertEq(s.ownerOf(id), bob);
    }

    function test_seul_le_proprietaire_liste_et_le_vendeur_retire() public {
        uint256 id = _mint(alice);
        vm.prank(bob);
        vm.expectRevert(BlockSkinsRouter.NotAllowed.selector);
        s.list(id, address(0), 1 ether);
        vm.prank(alice);
        vm.expectRevert(BlockSkinsRouter.BadPrice.selector);
        s.list(id, address(0), 0);
        vm.prank(alice);
        s.list(id, address(0), 1 ether);
        vm.prank(bob);
        vm.expectRevert(BlockSkinsRouter.NotAllowed.selector);
        s.unlist(id);
        vm.prank(alice);
        s.unlist(id);
        assertEq(s.ownerOf(id), alice);
        vm.prank(bob);
        vm.expectRevert(BlockSkinsRouter.NotListed.selector);
        s.buy{value: 1 ether}(id);
    }

    function test_seul_owner_change_les_devises() public {
        vm.prank(alice);
        vm.expectRevert(BlockSkinsRouter.NotOwner.selector);
        s.setCurrency(address(action), true);
        vm.prank(alice);
        vm.expectRevert(BlockSkinsRouter.NotOwner.selector);
        s.transferOwnership(alice);
    }

    // ─────────────── les deux cochent, un agent execute
    function test_double_validation_executee_par_un_agent_usdc() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        s.list(id, address(usdc), 20e6);
        vm.prank(agent);
        vm.expectRevert(BlockSkinsRouter.NotValidated.selector);
        s.executeValidated(id, bob);
        vm.prank(bob);
        s.validateBuy(id);
        uint256 gAvant = usdc.balanceOf(agent);
        vm.prank(agent);
        s.executeValidated(id, bob);
        assertEq(s.ownerOf(id), bob, "l acheteur recoit le NFT");
        // CHANGED by the economy v2 pack: the mint now pays the fee wallet 10 % of 10 USDC (1 USDC) through the router, not 10 USDC
        assertEq(usdc.balanceOf(FRAIS), 0.1e6 + 2e6, "0,10 USDC de mint (10 %) + 10 % de la vente (20 USDC)");
        assertEq(usdc.balanceOf(agent), gAvant, "l agent ne touche rien");
        assertEq(s.balanceOf(agent), 0, "l agent ne detient jamais le NFT");
    }

    function test_double_validation_eth_et_revocation() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        s.list(id, address(0), 2 ether);
        vm.prank(bob);
        vm.expectRevert(BlockSkinsRouter.WrongValue.selector);
        s.validateBuy{value: 1 ether}(id);
        vm.prank(bob);
        s.validateBuy{value: 2 ether}(id);
        // carol valide aussi, puis c est bob qui est execute : carol reprend son ETH
        vm.prank(carol);
        s.validateBuy{value: 2 ether}(id);
        vm.prank(agent);
        s.executeValidated(id, bob);
        assertEq(s.ownerOf(id), bob);
        assertEq(FRAIS.balance, 0.2 ether);
        uint256 cAvant = carol.balance;
        vm.startPrank(carol);
        s.revokeBuy(id);
        s.withdraw(address(0));
        vm.stopPrank();
        assertEq(carol.balance - cAvant, 2 ether, "la validation non servie rend l ETH en entier");
        assertEq(address(s).balance, 0);
    }

    function test_validation_ne_vaut_que_pour_le_prix_coche() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        s.list(id, address(usdc), 20e6);
        vm.prank(bob);
        s.validateBuy(id);
        // le vendeur retire et reliste PLUS CHER : la validation de bob ne doit pas le faire payer 500
        vm.startPrank(alice);
        s.unlist(id);
        s.list(id, address(usdc), 500e6);
        vm.stopPrank();
        vm.prank(agent);
        vm.expectRevert(BlockSkinsRouter.ListingChanged.selector);
        s.executeValidated(id, bob);
    }

    // ─────────────── encheres
    function test_enchere_complete_en_eth() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        vm.expectRevert(BlockSkinsRouter.BadDuration.selector);
        s.startAuction(id, address(0), 0.1 ether, 7 days + 1);
        vm.prank(alice);
        s.startAuction(id, address(0), 0.1 ether, 1 days);
        vm.prank(bob);
        vm.expectRevert(BlockSkinsRouter.BidTooLow.selector);
        s.bid{value: 0.05 ether}(id, 0.05 ether);
        vm.prank(bob);
        s.bid{value: 0.1 ether}(id, 0.1 ether);
        vm.prank(carol);
        vm.expectRevert(BlockSkinsRouter.BidTooLow.selector);
        s.bid{value: 0.1 ether}(id, 0.1 ether);
        vm.prank(carol);
        s.bid{value: 0.3 ether}(id, 0.3 ether);
        assertEq(s.pending(address(0), bob), 0.1 ether, "l enchere depassee est creditee");
        vm.prank(alice);
        vm.expectRevert(BlockSkinsRouter.HasBids.selector);
        s.unlist(id);
        vm.expectRevert(BlockSkinsRouter.NotEnded.selector);
        s.settle(id);
        vm.warp(block.timestamp + 1 days);
        vm.prank(bob);
        vm.expectRevert(BlockSkinsRouter.Ended.selector);
        s.bid{value: 1 ether}(id, 1 ether);
        uint256 aAvant = alice.balance;
        vm.prank(agent);
        s.settle(id); // n importe qui regle
        assertEq(s.ownerOf(id), carol);
        assertEq(FRAIS.balance, 0.03 ether);
        assertEq(alice.balance - aAvant, 0.27 ether);
        uint256 bAvant = bob.balance;
        vm.prank(bob);
        s.withdraw(address(0));
        assertEq(bob.balance - bAvant, 0.1 ether);
        assertEq(address(s).balance, 0, "tout est sorti du contrat");
        vm.expectRevert(BlockSkinsRouter.NotListed.selector);
        s.settle(id);
    }

    function test_enchere_sans_offre_rend_le_nft() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        s.startAuction(id, address(usdc), 10e6, 2 hours);
        vm.warp(block.timestamp + 2 hours);
        s.settle(id);
        assertEq(s.ownerOf(id), alice);
    }

    function test_enchere_tardive_prolonge_mais_jamais_au_dela_de_7_jours() public {
        uint256 id = _mint(alice);
        uint256 t0 = block.timestamp;
        vm.prank(alice);
        s.startAuction(id, address(usdc), 1e6, 7 days);
        vm.warp(t0 + 7 days - 60);
        vm.prank(bob);
        s.bid(id, 1e6);
        (,,,, uint64 fin,,,) = s.listingOf(id);
        assertEq(uint256(fin), t0 + 7 days, "plafonne a 7 jours du depart");
        // une enchere courte, elle, est prolongee de 5 minutes
        uint256 id2 = _mint(alice);
        uint256 t1 = block.timestamp;
        vm.prank(alice);
        s.startAuction(id2, address(usdc), 1e6, 1 hours);
        vm.warp(t1 + 1 hours - 60);
        vm.prank(bob);
        s.bid(id2, 1e6);
        (,,,, uint64 fin2,,,) = s.listingOf(id2);
        assertEq(uint256(fin2), block.timestamp + 5 minutes);
    }

    function test_enchere_usdc_rembourse_par_retrait() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        s.startAuction(id, address(usdc), 5e6, 1 hours);
        vm.prank(bob);
        s.bid(id, 5e6);
        vm.prank(carol);
        s.bid(id, 9e6);
        uint256 bAvant = usdc.balanceOf(bob);
        vm.prank(bob);
        s.withdraw(address(usdc));
        assertEq(usdc.balanceOf(bob) - bAvant, 5e6);
        vm.prank(bob);
        vm.expectRevert(BlockSkinsRouter.NothingToWithdraw.selector);
        s.withdraw(address(usdc));
        vm.warp(block.timestamp + 1 hours);
        s.settle(id);
        assertEq(usdc.balanceOf(address(s)), 0);
        // CHANGED by the economy v2 pack: 1 USDC of the mint reaches the fee wallet (10 % via the router), not 10 USDC
        assertEq(usdc.balanceOf(FRAIS), 0.1e6 + 0.9e6, "0,10 USDC de mint (10 %) + 10 % de l enchere gagnante (9 USDC)");
    }

    // ─────────────── tricheries
    function test_un_encherisseur_qui_refuse_l_eth_ne_bloque_pas_l_enchere() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        s.startAuction(id, address(0), 0.1 ether, 1 hours);
        RefuseEthSR mechant = new RefuseEthSR(s);
        mechant.encherir{value: 0.1 ether}(id, 0.1 ether);
        vm.prank(bob);
        s.bid{value: 0.2 ether}(id, 0.2 ether); // passe : le mechant est credite, pas rembourse en direct
        assertEq(s.pending(address(0), address(mechant)), 0.1 ether);
        vm.expectRevert(BlockSkinsRouter.TransferFailed.selector);
        mechant.retirer(); // il ne bloque que lui-meme
    }

    function test_un_vendeur_qui_refuse_l_eth_est_credite_la_vente_passe() public {
        RefuseEthSR vendeur = new RefuseEthSR(s);
        usdc.mint(address(vendeur), 1e6);
        vm.startPrank(address(vendeur));
        usdc.approve(address(routeur), 1e6);
        routeur.pay(address(s), 1e6, 1, block.timestamp, abi.encode(BLOC, recette));
        uint256 id = s.totalSupply();
        s.list(id, address(0), 1 ether);
        vm.stopPrank();
        vm.prank(bob);
        s.buy{value: 1 ether}(id);
        assertEq(s.ownerOf(id), bob, "l acheteur a son NFT");
        assertEq(s.pending(address(0), address(vendeur)), 0.9 ether, "le vendeur est credite");
        assertEq(FRAIS.balance, 0.1 ether);
    }

    function test_reentree_refusee() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        s.startAuction(id, address(0), 0.1 ether, 1 hours);
        ReentrantSR r = new ReentrantSR(s, routeur, address(usdc), BLOC, recette);
        usdc.mint(address(r), 1e6); // de quoi PAYER le mint (1 USDC) qu il va tenter : seul le verrou peut le refuser
        r.encherir{value: 0.1 ether}(id, 0.1 ether);
        vm.prank(bob);
        s.bid{value: 0.2 ether}(id, 0.2 ether);
        uint256 avant = s.totalSupply();
        r.retirer();
        assertTrue(r.aTente(), "il a bien tente de re-entrer pendant son retrait");
        assertFalse(r.reentreeReussie(), "la re-entree est refusee");
        assertEq(s.totalSupply(), avant, "rien n a ete minte pendant le retrait");
        assertEq(address(r).balance, 0.1 ether, "et son retrait, lui, est passe");
    }

    function test_valider_deux_fois_en_eth_ne_perd_pas_le_premier_depot() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        s.list(id, address(0), 1 ether);
        vm.startPrank(bob);
        s.validateBuy{value: 1 ether}(id);
        s.validateBuy{value: 1 ether}(id);
        vm.stopPrank();
        assertEq(s.pending(address(0), bob), 1 ether, "le premier depot est credite, pas perdu");
        vm.prank(agent);
        s.executeValidated(id, bob);
        uint256 avant = bob.balance;
        vm.prank(bob);
        s.withdraw(address(0));
        assertEq(bob.balance - avant, 1 ether);
        assertEq(address(s).balance, 0, "tout est sorti du contrat");
    }

    function test_jeton_a_taxe_refuse_a_l_enchere() public {
        JetonATaxeSR taxe = new JetonATaxeSR();
        s.setCurrency(address(taxe), true);
        taxe.mint(bob, 100 ether);
        vm.prank(bob);
        taxe.approve(address(s), type(uint256).max);
        uint256 id = _mint(alice);
        vm.prank(alice);
        s.startAuction(id, address(taxe), 1 ether, 1 hours);
        vm.prank(bob);
        vm.expectRevert(BlockSkinsRouter.FeeOnTransfer.selector);
        s.bid(id, 1 ether);
    }

    function test_eth_envoye_sur_une_vente_en_jeton_est_refuse() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        s.list(id, address(usdc), 5e6);
        vm.prank(bob);
        vm.expectRevert(BlockSkinsRouter.WrongValue.selector);
        s.buy{value: 1}(id);
    }

    // ─────────────── ce que la relecture a trouve (2026-10-04) : chacun ROUGE avant le correctif
    function test_validation_ne_survit_pas_a_une_remise_en_vente_au_meme_prix() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        s.list(id, address(usdc), 20e6);
        vm.prank(bob);
        s.validateBuy(id);
        vm.startPrank(alice);
        s.unlist(id);
        s.list(id, address(usdc), 20e6); // MEME prix, MEME devise : c est quand meme une autre mise en vente
        vm.stopPrank();
        vm.prank(agent);
        vm.expectRevert(BlockSkinsRouter.ListingChanged.selector);
        s.executeValidated(id, bob);
        assertEq(s.ownerOf(id), address(s));
    }

    function test_jeton_a_taxe_refuse_aussi_a_l_achat_et_a_la_validation() public {
        JetonATaxeSR taxe = new JetonATaxeSR();
        s.setCurrency(address(taxe), true);
        taxe.mint(bob, 100 ether);
        // le contrat tient deja des jetons de cette devise (le sequestre d un autre) : sans le controle, la vente
        // serait payee avec EUX
        taxe.mint(address(s), 50 ether);
        vm.prank(bob);
        taxe.approve(address(s), type(uint256).max);
        uint256 id = _mint(alice);
        vm.prank(alice);
        s.list(id, address(taxe), 10 ether);
        vm.prank(bob);
        vm.expectRevert(BlockSkinsRouter.FeeOnTransfer.selector);
        s.buy(id);
        vm.prank(bob);
        s.validateBuy(id);
        vm.prank(agent);
        vm.expectRevert(BlockSkinsRouter.FeeOnTransfer.selector);
        s.executeValidated(id, bob);
        assertEq(taxe.balanceOf(address(s)), 50 ether, "le sequestre des autres est intact");
    }

    function test_un_vendeur_blackliste_ne_bloque_pas_le_reglement() public {
        JetonListeNoireSR t = new JetonListeNoireSR();
        s.setCurrency(address(t), true);
        t.mint(bob, 100e6);
        vm.prank(bob);
        t.approve(address(s), type(uint256).max);
        uint256 id = _mint(alice);
        vm.prank(alice);
        s.startAuction(id, address(t), 10e6, 1 hours);
        vm.prank(bob);
        s.bid(id, 10e6);
        t.bloquer(alice, true);
        vm.warp(block.timestamp + 1 hours);
        s.settle(id); // ne revert PAS
        assertEq(s.ownerOf(id), bob, "le gagnant a son NFT");
        assertEq(t.balanceOf(FRAIS), 1e6, "les frais sont payes");
        assertEq(s.pending(address(t), alice), 9e6, "le vendeur est credite");
        assertEq(t.balanceOf(address(s)), 9e6, "et le contrat tient exactement ce credit");
        t.bloquer(alice, false);
        vm.prank(alice);
        s.withdraw(address(t));
        assertEq(t.balanceOf(alice), 9e6);
        assertEq(t.balanceOf(address(s)), 0);
    }

    function test_surenchere_minimale_5_pourcent() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        s.startAuction(id, address(0), 1 ether, 1 hours);
        vm.prank(bob);
        s.bid{value: 1 ether}(id, 1 ether);
        vm.prank(carol);
        vm.expectRevert(BlockSkinsRouter.BidTooLow.selector);
        s.bid{value: 1.049 ether}(id, 1.049 ether);
        vm.prank(carol);
        s.bid{value: 1.05 ether}(id, 1.05 ether);
        (,,,,,, address encherisseur, uint256 mise) = s.listingOf(id);
        assertEq(encherisseur, carol);
        assertEq(mise, 1.05 ether);
    }

    function test_skinsPage_rend_le_detenteur_reel_meme_en_vente() public {
        uint256 a = _mint(alice);
        uint256 b = _mint(bob);
        vm.prank(alice);
        s.list(a, address(usdc), 7e6);
        BlockSkinsRouter.SkinView[] memory p = s.skinsPage(0, 50);
        assertEq(p.length, 2);
        assertEq(p[0].tokenId, a);
        assertEq(p[0].holder, alice, "en vente : le detenteur affiche est le VENDEUR, pas le contrat");
        assertTrue(p[0].listed);
        assertFalse(p[0].auction);
        assertEq(p[0].price, 7e6);
        assertEq(p[0].currency, address(usdc));
        assertEq(p[0].recipe, recette);
        assertEq(p[1].tokenId, b);
        assertEq(p[1].holder, bob);
        assertFalse(p[1].listed);
        assertEq(s.skinsPage(2, 1).length, 1);
        assertEq(s.skinsPage(3, 10).length, 0);
    }

    // ─────────────── arithmetique des frais, sur tout l intervalle
    function testFuzz_frais_10_pourcent_et_rien_ne_reste(uint96 prix) public {
        vm.assume(prix > 0);
        uint256 id = _mint(alice);
        vm.deal(bob, uint256(prix));
        vm.prank(alice);
        s.list(id, address(0), prix);
        uint256 fAvant = FRAIS.balance;
        uint256 aAvant = alice.balance;
        vm.prank(bob);
        s.buy{value: prix}(id);
        uint256 frais = FRAIS.balance - fAvant;
        uint256 vendeur = alice.balance - aAvant;
        assertEq(frais, (uint256(prix) * 1000) / 10_000);
        assertEq(frais + vendeur, prix, "frais + vendeur = prix, au wei pres");
        assertEq(address(s).balance, 0);
    }

    // ----- review 2026-11-12. F1, F2, S1, M1: RED on the reviewed source (sha256 235a8501...), GREEN after the fix. G1..G6: guards
    //   the suites did not hold (their mutants survived); they pass on both sources. withdrawTo is called low level so that this file
    //   still compiles against the reviewed source.

    /// @dev F1: DEST must be the holders vault: code, TBLOCK() == TBLOCK, ROUTER() == the router, and a free() view
    function test_F1_dest_doit_etre_le_coffre_des_holders() public {
        TBlockLock verrou = new TBlockLock(address(tblock)); // the real lock: TBLOCK sent there is credited to nobody, for good
        address[4] memory mauvais = [
            address(verrou),
            address(new DestNommeTblockSR(address(tblock))), // the lock, Hearts, the lock rewards: no ROUTER()
            address(new DestSansFreeSR(address(tblock), address(routeur))), // TAM art, the old Skins: ROUTER() == P, no free()
            address(new DestAutreRouteurSR(address(tblock), address(0xBAD))) // a vault of another router
        ];
        for (uint256 i; i < mauvais.length; i++) {
            vm.expectRevert(BlockSkinsRouter.BadAddress.selector);
            new BlockSkinsRouter(address(routeur), FRAIS, mauvais[i], address(tblock), address(usdc));
        }
        BlockSkinsRouter t = new BlockSkinsRouter(address(routeur), FRAIS, address(coffre), address(tblock), address(usdc));
        assertEq(t.DEST(), address(coffre), "the holders vault stand-in passes");
    }

    /// @dev F2: the fee wallet is never one of the two tokens (a deploy typo would send every 0.10 USDC to a token contract)
    function test_F2_le_wallet_de_frais_n_est_jamais_un_jeton() public {
        vm.expectRevert(BlockSkinsRouter.BadAddress.selector);
        new BlockSkinsRouter(address(routeur), address(usdc), address(coffre), address(tblock), address(usdc));
        vm.expectRevert(BlockSkinsRouter.BadAddress.selector);
        new BlockSkinsRouter(address(routeur), address(tblock), address(coffre), address(tblock), address(usdc));
    }

    /// @dev S1: a skin sent to the market contract by a plain transfer was stuck for good (not a listing: nothing returns it)
    function test_S1_un_skin_ne_s_envoie_jamais_au_contrat_du_marche() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        vm.expectRevert(BlockSkinsRouter.BadAddress.selector);
        s.transferFrom(alice, address(s), id);
        vm.prank(alice);
        s.setApprovalForAll(bob, true);
        vm.prank(bob);
        vm.expectRevert(BlockSkinsRouter.BadAddress.selector);
        s.transferFrom(alice, address(s), id);
        vm.prank(alice);
        vm.expectRevert(BlockSkinsRouter.BadAddress.selector);
        s.safeTransferFrom(alice, address(s), id);
        assertEq(s.ownerOf(id), alice);
        vm.prank(alice);
        s.list(id, address(0), 1 ether); // a listing still escrows the skin here
        assertEq(s.ownerOf(id), address(s));
    }

    function _retirerVers(BlockSkinsRouter g, address qui, address devise, address vers) internal returns (bool ok, bytes memory r) {
        vm.prank(qui);
        (ok, r) = address(g).call(abi.encodeWithSignature("withdrawTo(address,address)", devise, vers));
    }

    /// @dev M1: an account that cannot receive ETH (a fee wallet, a seller contract) withdraws its OWN credit to another address
    function test_M1_un_credit_se_retire_vers_une_autre_adresse() public {
        SansEthSR fw = new SansEthSR();
        BlockSkinsRouter g = new BlockSkinsRouter(address(routeur), address(fw), address(coffre), address(tblock), address(usdc));
        for (uint256 i; i < 2; i++) {
            vm.prank(alice);
            routeur.pay(address(g), 1_000_000, 1, block.timestamp, abi.encode(BLOC, recette));
            vm.prank(alice);
            g.list(i + 1, address(0), 1 ether);
            vm.prank(bob);
            g.buy{value: 1 ether}(i + 1);
        }
        assertEq(g.pending(address(0), address(fw)), 0.2 ether, "two ETH fees credited");
        vm.prank(address(fw));
        vm.expectRevert(BlockSkinsRouter.TransferFailed.selector);
        g.withdraw(address(0)); // withdraw pays msg.sender only: it can never take ETH
        (bool ok, bytes memory r) = _retirerVers(g, address(fw), address(0), address(0));
        assertTrue(!ok && bytes4(r) == BlockSkinsRouter.BadAddress.selector, "never to address 0");
        (ok, r) = _retirerVers(g, address(fw), address(0), address(g));
        assertTrue(!ok && bytes4(r) == BlockSkinsRouter.BadAddress.selector, "never to the market itself");
        (ok, r) = _retirerVers(g, carol, address(0), carol);
        assertTrue(!ok && bytes4(r) == BlockSkinsRouter.NothingToWithdraw.selector, "only one's own credit");
        address vers = address(0x5AFE);
        (ok,) = _retirerVers(g, address(fw), address(0), vers);
        assertTrue(ok, "withdrawTo");
        assertEq(vers.balance, 0.2 ether);
        assertEq(g.pending(address(0), address(fw)), 0);
        assertEq(address(g).balance, 0, "nothing left in the market");
        (ok, r) = _retirerVers(g, address(fw), address(0), vers);
        assertTrue(!ok && bytes4(r) == BlockSkinsRouter.NothingToWithdraw.selector, "paid once");
        // a token credit too: a blacklisted seller withdraws its tokens elsewhere
        JetonListeNoireSR ln = new JetonListeNoireSR();
        vm.prank(g.owner());
        g.setCurrency(address(ln), true);
        ln.mint(bob, 10e6);
        vm.prank(bob);
        ln.approve(address(g), type(uint256).max);
        vm.prank(alice);
        routeur.pay(address(g), 1_000_000, 1, block.timestamp, abi.encode(BLOC, recette));
        vm.prank(alice);
        g.list(3, address(ln), 5e6);
        ln.bloquer(alice, true);
        vm.prank(bob);
        g.buy(3);
        assertEq(g.pending(address(ln), alice), 4_500_000, "the blocked seller is credited");
        (ok,) = _retirerVers(g, alice, address(ln), carol);
        assertTrue(ok, "withdrawTo in a token");
        assertEq(ln.balanceOf(carol), 4_500_000);
        assertEq(g.pending(address(ln), alice), 0);
    }

    /// @dev G1: a TBLOCK that delivers short to DEST reverts the WHOLE mint (the post-forward balance check)
    function test_G1_livraison_courte_au_coffre_annule_le_mint() public {
        JetonCourtSR tc = new JetonCourtSR();
        RouteurFacticeSR r2 = new RouteurFacticeSR(address(usdc), address(tc));
        EnregistreurFacticeSR c2 = new EnregistreurFacticeSR(address(tc));
        c2.setRouter(address(r2));
        BlockSkinsRouter g = new BlockSkinsRouter(address(r2), FRAIS, address(c2), address(tc), address(usdc));
        tc.setCourt(address(c2));
        vm.prank(alice);
        usdc.approve(address(r2), type(uint256).max);
        vm.prank(alice);
        vm.expectRevert(BlockSkinsRouter.TransferFailed.selector);
        r2.pay(address(g), 1_000_000, 1, block.timestamp, abi.encode(BLOC, recette));
        assertEq(g.totalSupply(), 0);
    }

    /// @dev G2 / G3: the fee wallet cannot be 0; the router's USDC must have 6 decimals
    function test_G2_G3_frais_zero_et_usdc_a_18_decimales_refuses() public {
        vm.expectRevert(BlockSkinsRouter.BadAddress.selector);
        new BlockSkinsRouter(address(routeur), address(0), address(coffre), address(tblock), address(usdc));
        JetonSR u18 = new JetonSR(18);
        RouteurFacticeSR r18 = new RouteurFacticeSR(address(u18), address(tblock));
        EnregistreurFacticeSR c18 = new EnregistreurFacticeSR(address(tblock));
        c18.setRouter(address(r18));
        vm.expectRevert(BlockSkinsRouter.BadToken.selector);
        new BlockSkinsRouter(address(r18), FRAIS, address(c18), address(tblock), address(u18));
    }

    /// @dev G4: the fixed-price paths refuse an auction and the auction paths refuse a fixed listing. Without the buy() check, an
    ///      auction with a live bid could be bought at its opening price and the top bid deleted with the listing, never credited.
    function test_G4_prix_fixe_et_enchere_ne_se_croisent_jamais() public {
        uint256 a = _mint(alice);
        uint256 b = _mint(alice);
        vm.prank(alice);
        s.startAuction(a, address(0), 1 ether, 1 days);
        vm.prank(bob);
        s.bid{value: 2 ether}(a, 2 ether);
        vm.prank(carol);
        vm.expectRevert(BlockSkinsRouter.IsAuction.selector);
        s.buy{value: 1 ether}(a);
        vm.prank(carol);
        vm.expectRevert(BlockSkinsRouter.IsAuction.selector);
        s.validateBuy{value: 1 ether}(a);
        vm.prank(carol);
        vm.expectRevert(BlockSkinsRouter.IsAuction.selector);
        s.executeValidated(a, carol);
        vm.prank(alice);
        s.list(b, address(0), 1 ether);
        vm.prank(bob);
        vm.expectRevert(BlockSkinsRouter.NotAuction.selector);
        s.bid{value: 1 ether}(b, 1 ether);
        vm.prank(bob);
        vm.expectRevert(BlockSkinsRouter.NotAuction.selector);
        s.settle(b);
        (,,,,,, address bidder, uint256 haut) = s.listingOf(a);
        assertEq(bidder, bob);
        assertEq(haut, 2 ether);
        assertEq(address(s).balance, 2 ether, "the live bid is still escrowed");
    }

    /// @dev G5: safeTransferFrom to a contract that does not answer onERC721Received reverts
    function test_G5_safe_transfer_vers_un_non_recepteur_reverte() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        vm.expectRevert(BlockSkinsRouter.UnsafeRecipient.selector);
        s.safeTransferFrom(alice, address(action), id);
        assertEq(s.ownerOf(id), alice);
    }

    /// @dev G6: a seller whose receive() burns all its gas cannot make a buy fail: 50,000 gas to him, then he is credited
    function test_G6_vendeur_qui_brule_le_gaz_ne_bloque_pas_la_vente() public {
        BruleGazSR brule = new BruleGazSR();
        uint256 id = _mint(alice);
        vm.prank(alice);
        s.transferFrom(alice, address(brule), id);
        vm.prank(address(brule));
        s.list(id, address(0), 1 ether);
        vm.prank(bob);
        s.buy{value: 1 ether, gas: 300_000}(id);
        assertEq(s.ownerOf(id), bob);
        assertEq(s.pending(address(0), address(brule)), 0.9 ether, "the seller is credited");
    }
}
