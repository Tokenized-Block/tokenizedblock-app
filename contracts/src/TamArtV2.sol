// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ITblockPayRouterView {
    function TBLOCK() external view returns (address);
    function USDC() external view returns (address);
}

/// @notice the one call this game makes into TBlockVaultV2 (the holders vault, DEST): the payer and the TBLOCK his payment bought
interface IVaultPlays {
    function recordPlay(address player, uint256 tblock) external;
}

/// @notice the one call this game makes into TBlockLockRewards (the play gate)
interface IPlayRewards {
    function recordPlay(address player) external;
}

/// @notice both the vault and the lock rewards list their games, fixed at their deploy
interface IListsGames {
    function isGame(address a) external view returns (bool);
}

/// @title TamArtV2 -- TAM (Tokenized Art Mathematique) : one ERC-721 per mathematical work, its points STORED on chain.
/// @notice PLAY GATE (Phil 2026-11-11, "Lock + play", economy v2 pack): a paid mint is ONE play, recorded in BOTH contracts that pay
///         players: the holders vault DEST (TBlockVaultV2.recordPlay(payer, tblockOut): the TBLOCK this payment bought counts as play
///         weight next to hearts) and TBlockLockRewards REWARDS (recordPlay(payer)). onPaid does it after the payment reached DEST;
///         payer is the address the router pulled the USDC from (the router passes its own msg.sender, and onPaid is ROUTER-only),
///         never a caller-chosen address; tblockOut is the router's measured swap output (never this contract's balance, which a
///         donation could inflate). Each call is low level, capped at PLAY_GAS, its outcome ignored: a broken vault or rewards
///         record cannot block a mint. A gasleft() guard before EACH call makes a mint sent with too little gas revert whole
///         (PlayGasTooLow) instead of silently losing a record.
/// @notice WIRING (one wallet deploys the pack in sequence): this game deploys FIRST, with the PREDICTED CREATE addresses of the vault
///         (DEST) and of the rewards contract; neither exists yet, so neither is code-checked here. Each of them, in its own
///         constructor, requires VAULT() / REWARDS() == itself (and the vault requires TBLOCK() == its TBLOCK). onPaid refuses
///         (NotWired) unless BOTH DEST and REWARDS list this game (isGame(this)): a mispredicted address can only make the later deploy
///         revert and leave this game unable to take a payment -- it can never send TBLOCK, or a play, to a wrong address.
/// @notice V2 = TamArt with ONE change, the payment. A mint is paid ONLY through the immutable ROUTER (TblockPayRouter):
///         the payer calls ROUTER.pay(this, 5 USDC, minTblockOut, deadline, abi.encode(data, graine, params)). The router sends
///         10 % (USDC_SPLIT: DEV_WALLET, 1000 bps) in USDC to DEV_WALLET, buys TBLOCK with the other 90 %, sends that TBLOCK here,
///         then calls onPaid. onPaid (ROUTER only) takes the TBLOCK THIS CONTRACT HOLDS (its balance delta: it holds 0 at rest),
///         requires it >= the amount the router reports, forwards ALL of it to the immutable DEST (the holders vault) in the same
///         call, checks DEST's balance rose by that much, and mints the work to the payer. This contract keeps nothing.
///         There is no direct mint() any more. Storage, data checks, SVG tokenURI and ERC-721 parts are TamArt's, unchanged.
///         (v1 text below about "PRICE paid straight to beneficiaire" reads: PRICE_USDC paid through the router as above.)
/// @notice COPY FRONT-RUN, the honest rule (no reservation: on Base a block is ~0.2 s, a 10-block delay was 2 s, it stopped nobody
///         and cost every payer a second transaction). A pending pay() shows the work's bytes, graine and params to anyone watching.
///         A work is minted ONCE (the same keccak256(data) is refused, whoever pays): a copier who wants it must pay the FULL price
///         FIRST (5 USDC through the router, the same 10 % / 90 % split to DEV_WALLET and DEST); the original payer's pay() then
///         reverts Duplicate(tokenId) and, the whole call reverting, his USDC is untouched (he loses the gas only).
///         The payer is NOT protected against losing the work to a copier who pays first; he is protected against paying for it twice.
/// @notice v1 notes:
///         mint(data, graine, params) costs exactly PRICE (5 USDC). The 5 USDC go from the minter STRAIGHT to the immutable
///         `beneficiaire` (set once in the constructor) in the same call : this contract never holds a token, a wei or a USDC.
///         The work's bytes (format `'TAM' v q ordre varint(n)` then zigzag-varint residuals, tam-moteur.js `encoder`) are written as
///         the bytecode of a fresh contract (SSTORE2) ; anyone reads them back with donnees(tokenId) and recomputes keccak256.
///         A hash cannot be decoded : the hash only proves integrity, the STORED BYTES are what makes the work readable.
/// @dev ⛔ HONESTY -- WHAT THIS CONTRACT DOES NOT PROVE :
///   - it CANNOT verify that the work is chaotic, certified, or chosen by the brain. It only checks the 'TAM' v1 header, the sizes,
///     and that the same bytes were never minted before. Anybody may mint any bytes that start with that header.
///   - the PROOF is public and off chain : `rejouer(JSON.parse(params))` in tam-moteur.js must give EXACTLY donnees(tokenId)
///     (same keccak). params and graine are stored here so that anyone can run that replay ; the app shows its result.
///   - tokenURI's SVG is a 2-D projection (coordinates 0 and 1, at most MAX_TRACE points), decoded HERE from the stored residuals :
///     it is a view, it costs a reader nothing, and it needs no second copy of the points.
/// @dev ⛔ WHAT IS GRAVED :
///   - NO OWNER. No admin, no pause, no upgrade, no withdraw, no receive/fallback : nothing can move value except mint's one
///     transferFrom(minter -> beneficiaire, PRICE).
///   - the USDC address and the beneficiary are immutable ; the constructor refuses a token without code or without 6 decimals.
///   - a duplicate (same keccak256 of the data) is refused : tokenOfHash maps each hash to its token.
contract TamArtV2 {
    uint256 public constant PRICE_USDC = 5_000_000; // 5 USDC (6 decimals), read by the router
    uint16 public constant DEV_BPS = 1000; // 10 % of the price stays USDC, to DEV_WALLET (Phil 2026-11-11)
    uint256 public constant MAX_DATA = 16_384; // bytes of the work ; the phase-A samples are 4.5-7.5 KB
    uint256 public constant MAX_PARAMS = 4_096; // bytes of the params JSON ; the phase-A samples are 456-839 bytes
    uint256 public constant MAX_TRACE = 600; // points drawn in the SVG (every k-th point)
    uint8 public constant VERSION = 1;

    address public immutable ROUTER;
    address public immutable TBLOCK;
    address public immutable DEV_WALLET;
    address public immutable DEST; // the holders vault (TBlockVaultV2): every TBLOCK paid for a mint ends there, and the play is told to it
    address public immutable REWARDS; // TBlockLockRewards: told about each paid mint (play gate)
    /// @dev gas given to EACH record call. Measured worst cases: TBlockLockRewards.recordPlay 53,502 (cold, first player of an epoch,
    ///      forge-lockrewards test_gas_recordPlayWorstCase); TBlockVaultV2.recordPlay: see forge-pack test_gas_vaultRecordPlayWorstCase.
    uint256 internal constant PLAY_GAS = 100_000;
    uint256 private _lock = 1;

    string public constant name = "TAM - Tokenized Art Mathematique";
    string public constant symbol = "TAM";

    struct Oeuvre {
        address pointeur; // SSTORE2 : runtime code = 0x00 || data || params
        uint32 octetsDonnees;
        uint32 octetsParams;
        bytes32 graine;
        bytes32 empreinte; // keccak256(data)
    }

    uint256 public totalSupply;
    mapping(uint256 => Oeuvre) private _oeuvres;
    /// @notice the token that holds these exact bytes (0 = never minted)
    mapping(bytes32 => uint256) public tokenOfHash;

    mapping(uint256 => address) private _ownerOf;
    mapping(address => uint256) private _balanceOf;
    mapping(uint256 => address) public getApproved;
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    event Minted(uint256 indexed tokenId, address indexed minter, bytes32 indexed empreinte, bytes32 graine);
    event PaidTblock(uint256 indexed tokenId, address indexed payer, uint256 usdcIn, uint256 tblockToDest);
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    error BadAddress();
    error BadToken();
    error BadData();
    error Duplicate(uint256 tokenId);
    error TransferFailed();
    error StoreFailed();
    error NotAllowed();
    error UnsafeRecipient();
    error NotRouter();
    error Reentrancy();
    error BadPayment();
    error PlayGasTooLow();
    error NotWired();

    /// @param expectedTblock / expectedUsdc the canonical tokens, written by the deployer: the router must answer exactly these
    ///        (two tokens are named TBLOCK). The vault checks in ITS constructor that this game's TBLOCK() is the one it holds.
    /// @param dest the TBlockVaultV2 address (predicted: it is deployed AFTER this game); not code-checked on purpose
    /// @param rewards the TBlockLockRewards address (predicted: it is deployed AFTER this game); not code-checked on purpose
    constructor(address router, address devWallet, address dest, address expectedTblock, address expectedUsdc, address rewards) {
        if (router.code.length == 0 || dest == address(0)) revert BadAddress();
        if (devWallet == address(0) || devWallet == router || devWallet == dest || devWallet == address(this)) revert BadAddress();
        address tb = ITblockPayRouterView(router).TBLOCK();
        address usdc = ITblockPayRouterView(router).USDC();
        if (expectedTblock == address(0) || tb != expectedTblock || usdc != expectedUsdc) revert BadToken();
        if (tb.code.length == 0 || usdc.code.length == 0) revert BadToken();
        (bool ok, bytes memory ret) = usdc.staticcall(abi.encodeWithSelector(0x313ce567)); // decimals()
        if (!ok || ret.length < 32 || abi.decode(ret, (uint256)) != 6) revert BadToken();
        // DEST is not this, the router, a token, or the dev wallet (it has no code yet: the vault deploys after this game)
        if (dest == router || dest == tb || dest == usdc || dest == address(this)) revert BadAddress();
        // REWARDS: any address but zero and the parties above (a typo there would silently drop every play record)
        if (rewards == address(0) || rewards == router || rewards == dest || rewards == devWallet || rewards == tb || rewards == usdc
            || rewards == address(this)) revert BadAddress();
        ROUTER = router;
        TBLOCK = tb;
        DEV_WALLET = devWallet;
        DEST = dest;
        REWARDS = rewards;
    }

    /// @notice the holders vault this game reports plays to (= DEST); TBlockVaultV2's constructor requires VAULT() == itself
    function VAULT() external view returns (address) {
        return DEST;
    }

    /// @notice true once BOTH the vault and the rewards contract exist and list this game; onPaid refuses any payment before that
    function wired() public view returns (bool) {
        return _lists(DEST) && _lists(REWARDS);
    }

    function _lists(address c) private view returns (bool) {
        (bool ok, bytes memory ret) = c.staticcall(abi.encodeWithSelector(IListsGames.isGame.selector, address(this)));
        return ok && ret.length >= 32 && abi.decode(ret, (uint256)) == 1;
    }

    /// @notice read by the router: 10 % of PRICE_USDC to DEV_WALLET in USDC, the rest bought as TBLOCK
    function USDC_SPLIT() external view returns (address devWallet, uint16 devBps) {
        return (DEV_WALLET, DEV_BPS);
    }

    // ───────────────────────────── mint (through the router only)
    /// @notice called by ROUTER, LAST, after it sent `tblockOut` TBLOCK here. data = abi.encode(bytes work, bytes32 graine, bytes params).
    ///         Mints the work to `payer`. Forwards every TBLOCK held here to DEST.
    function onPaid(address payer, uint256 usdcIn, uint256 tblockOut, bytes calldata data) external returns (uint256 tokenId) {
        if (msg.sender != ROUTER) revert NotRouter();
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        if (usdcIn != PRICE_USDC || tblockOut == 0) revert BadPayment();
        if (!wired()) revert NotWired(); // never pay a vault, or report a play, to an address that does not list this game
        // this contract holds no TBLOCK at rest: what it holds now is what reached it (credit the delta, not the argument)
        uint256 got = _balTb(address(this));
        if (got < tblockOut) revert BadPayment();
        (bytes memory work, bytes32 graine_, bytes memory params_) = abi.decode(data, (bytes, bytes32, bytes));
        tokenId = _mint(payer, work, graine_, params_);

        uint256 destBefore = _balTb(DEST);
        (bool ok, bytes memory ret) = TBLOCK.call(abi.encodeWithSelector(0xa9059cbb, DEST, got));
        if (!ok || (ret.length != 0 && (ret.length < 32 || abi.decode(ret, (uint256)) != 1))) revert TransferFailed();
        if (_balTb(DEST) - destBefore < got || _balTb(address(this)) != 0) revert TransferFailed();
        emit PaidTblock(tokenId, payer, usdcIn, got);
        // after the payment reached DEST; payer = the router's msg.sender; tblockOut = what the router measured it bought
        _record(DEST, abi.encodeWithSelector(IVaultPlays.recordPlay.selector, payer, tblockOut));
        _record(REWARDS, abi.encodeWithSelector(IPlayRewards.recordPlay.selector, payer));
        _lock = 1;
    }

    /// @dev play gate: capped, outcome ignored, no returndata copied; reverts whole when gas is too low for THIS record to run with its
    ///      full PLAY_GAS (EIP-150 keeps 1/64 back, hence PLAY_GAS / 63; 5,000 covers the cold call and memory)
    function _record(address target, bytes memory cd) private {
        if (gasleft() < PLAY_GAS + PLAY_GAS / 63 + 5_000) revert PlayGasTooLow();
        assembly {
            pop(call(PLAY_GAS, target, 0, add(cd, 32), mload(cd), 0, 0))
        }
    }

    function _balTb(address who) private view returns (uint256) {
        (bool ok, bytes memory ret) = TBLOCK.staticcall(abi.encodeWithSelector(0x70a08231, who));
        if (!ok || ret.length < 32) revert TransferFailed();
        return abi.decode(ret, (uint256));
    }

    /// @param data the encoded work (tam-moteur.js encoderOeuvre) : stored byte for byte
    /// @param graine_ the seed the work was chosen from (stored and emitted ; NOT bound to the payer: whoever pays first mints)
    /// @param params_ the JSON params of the work (utf-8) : rejouer(JSON.parse(params)) must give `data` back -- checked OFF chain
    function _mint(address to, bytes memory data, bytes32 graine_, bytes memory params_) private returns (uint256 tokenId) {
        if (to == address(0)) revert BadAddress();
        uint256 n = data.length;
        if (n < 7 || n > MAX_DATA || params_.length > MAX_PARAMS) revert BadData();
        if (data[0] != 0x54 || data[1] != 0x41 || data[2] != 0x4d || uint8(data[3]) != VERSION) revert BadData(); // 'T' 'A' 'M' v1
        uint8 q = uint8(data[4]);
        if (q < 1 || q > 16 || uint8(data[5]) > 1) revert BadData();
        bytes32 h = keccak256(data);
        uint256 deja = tokenOfHash[h];
        if (deja != 0) revert Duplicate(deja);

        tokenId = ++totalSupply;
        tokenOfHash[h] = tokenId;
        _oeuvres[tokenId] = Oeuvre(_ecrire(data, params_), uint32(n), uint32(params_.length), graine_, h);
        _ownerOf[tokenId] = to;
        unchecked {
            _balanceOf[to] += 1;
        }
        emit Transfer(address(0), to, tokenId);
        emit Minted(tokenId, to, h, graine_);
    }

    /// @dev SSTORE2 : deploys a contract whose runtime code is 0x00 (STOP, so it can never be called into) || data || params.
    function _ecrire(bytes memory data, bytes memory params_) private returns (address p) {
        bytes memory runtime = abi.encodePacked(hex"00", data, params_);
        // init code : PUSH2 len, DUP1, PUSH1 0x0a, RETURNDATASIZE, CODECOPY, RETURNDATASIZE, RETURN, then the runtime
        bytes memory init = abi.encodePacked(hex"61", uint16(runtime.length), hex"80600a3d393df3", runtime);
        assembly {
            p := create(0, add(init, 0x20), mload(init))
        }
        if (p == address(0)) revert StoreFailed();
    }

    function _lire(address p, uint256 debut, uint256 longueur) private view returns (bytes memory out) {
        out = new bytes(longueur);
        assembly {
            extcodecopy(p, add(out, 0x20), add(debut, 1), longueur)
        }
    }

    // ───────────────────────────── reads
    /// @notice the raw bytes of the work, exactly as minted : keccak256(donnees(id)) == empreinte(id)
    function donnees(uint256 tokenId) public view returns (bytes memory) {
        Oeuvre storage o = _existe(tokenId);
        return _lire(o.pointeur, 0, o.octetsDonnees);
    }

    /// @notice the params JSON (utf-8) to replay the work with tam-moteur.js rejouer()
    function params(uint256 tokenId) external view returns (bytes memory) {
        Oeuvre storage o = _existe(tokenId);
        return _lire(o.pointeur, o.octetsDonnees, o.octetsParams);
    }

    function graine(uint256 tokenId) external view returns (bytes32) {
        return _existe(tokenId).graine;
    }

    function empreinte(uint256 tokenId) external view returns (bytes32) {
        return _existe(tokenId).empreinte;
    }

    function pointeur(uint256 tokenId) external view returns (address) {
        return _existe(tokenId).pointeur;
    }

    function _existe(uint256 tokenId) private view returns (Oeuvre storage o) {
        o = _oeuvres[tokenId];
        if (o.pointeur == address(0)) revert BadAddress();
    }

    // ───────────────────────────── metadata
    /// @notice on-chain JSON + on-chain SVG (base64 both) : a 2-D projection (coordinates 0, 1) of the points decoded here from
    ///         the stored residuals. Trajectories (ordre 0) are drawn as a line, clouds (ordre 1, Morton order) as dots.
    function tokenURI(uint256 tokenId) external view returns (string memory) {
        Oeuvre storage o = _existe(tokenId);
        bytes memory d = _lire(o.pointeur, 0, o.octetsDonnees);
        string memory json = string.concat(
            '{"name":"TAM #',
            _u(tokenId),
            '","description":"A mathematical work stored on chain. Proof: rejouer(params) in tam-moteur.js gives the stored bytes; this contract does not check that the work is chaotic or brain-made.","image":"data:image/svg+xml;base64,',
            _b64(_svg(d)),
            '","attributes":[{"trait_type":"Bytes","value":',
            _u(d.length),
            '},{"trait_type":"Ordre","value":',
            _u(uint8(d[5])),
            '}],"keccak":"',
            _hex32(o.empreinte),
            '","graine":"',
            _hex32(o.graine),
            '"}'
        );
        return string.concat("data:application/json;base64,", _b64(bytes(json)));
    }

    /// @dev decodes the residuals exactly like tam-moteur.js `decoder` (ordre 0 : pred = 2a - b ; ordre 1 : pred = a) and draws
    ///      x = c0, y = M - c1 (M = 2^q - 1) for every k-th point, k = ceil(n / MAX_TRACE). Truncated data stops the drawing, never reverts.
    function _svg(bytes memory d) private pure returns (bytes memory) {
        uint256 q = uint8(d[4]);
        bool nuage = uint8(d[5]) == 1;
        uint256 m = (uint256(1) << q) - 1;
        (uint256 n, uint256 p) = _varint(d, 6);
        uint256 pas = n <= MAX_TRACE ? 1 : (n + MAX_TRACE - 1) / MAX_TRACE;
        bytes memory tete = abi.encodePacked(
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ",
            _u(m),
            " ",
            _u(m),
            "'><rect width='100%' height='100%' fill='#0b0d17'/><path fill='none' stroke='#7fd1ff' stroke-linecap='round' stroke-width='",
            _u(nuage ? m / 200 + 1 : m / 800 + 1),
            "' d='"
        );
        // one point = cmd + 2 numbers of <= 5 digits + 2 spaces (+ "h0" for a dot)
        uint256 traces = n == 0 ? 0 : (n - 1) / pas + 1;
        if (traces > MAX_TRACE) traces = MAX_TRACE;
        Trace memory t;
        t.d = d;
        t.p = p;
        t.m = m;
        t.pas = pas;
        t.nuage = nuage;
        t.out = new bytes(traces * (nuage ? 16 : 14));
        for (uint256 i = 0; i < n; i++) {
            if (!_point(t, i)) break;
        }
        return _fin(tete, t.out, t.j);
    }

    struct Trace {
        bytes d;
        uint256 p; // read position in d
        uint256 m;
        uint256 pas;
        bool nuage;
        bytes out;
        uint256 j; // write position in out
        int256[3] a; // point i-1
        int256[3] b; // point i-2
    }

    /// @dev decodes point i (3 coordinates) exactly like tam-moteur.js decoder ; draws it if i % pas == 0 ; false = data ended
    function _point(Trace memory t, uint256 i) private pure returns (bool) {
        for (uint256 c = 0; c < 3; c++) {
            if (t.p >= t.d.length) return false;
            uint256 z;
            (z, t.p) = _varint(t.d, t.p);
            int256 v = ((!t.nuage && i >= 2) ? 2 * t.a[c] - t.b[c] : t.a[c]) + (int256(z >> 1) ^ -int256(z & 1));
            t.b[c] = t.a[c];
            t.a[c] = v;
        }
        if (i % t.pas == 0 && t.j + (t.nuage ? 16 : 14) <= t.out.length) {
            bytes memory out = t.out;
            uint256 j = t.j;
            out[j++] = (i == 0 || t.nuage) ? bytes1("M") : bytes1("L");
            j = _putU(out, j, _clamp(t.a[0], t.m));
            out[j++] = " ";
            j = _putU(out, j, t.m - _clamp(t.a[1], t.m));
            if (t.nuage) {
                out[j++] = "h";
                out[j++] = "0";
            }
            out[j++] = " ";
            t.j = j;
        }
        return true;
    }

    function _fin(bytes memory tete, bytes memory out, uint256 j) private pure returns (bytes memory) {
        assembly {
            mstore(out, j)
        }
        return abi.encodePacked(tete, out, "'/></svg>");
    }

    function _clamp(int256 v, uint256 m) private pure returns (uint256) {
        if (v < 0) return 0;
        if (uint256(v) > m) return m;
        return uint256(v);
    }

    function _varint(bytes memory d, uint256 p) private pure returns (uint256 v, uint256) {
        uint256 s;
        while (p < d.length && s < 256) {
            uint8 x = uint8(d[p++]);
            v |= uint256(x & 0x7f) << s;
            if (x & 0x80 == 0) return (v, p);
            s += 7;
        }
        return (v, d.length);
    }

    function _putU(bytes memory out, uint256 j, uint256 v) private pure returns (uint256) {
        if (v == 0) {
            out[j++] = "0";
            return j;
        }
        uint256 len;
        for (uint256 t = v; t != 0; t /= 10) len++;
        for (uint256 k = len; k > 0; k--) {
            out[j + k - 1] = bytes1(uint8(48 + (v % 10)));
            v /= 10;
        }
        return j + len;
    }

    /// @dev standard base64 (RFC 4648, "=" padding), 3 bytes -> 4 chars per step in assembly (Brecht Devos pattern) : tokenURI
    ///      encodes the SVG then the JSON, ~17 KB, a byte-by-byte Solidity loop made it the largest cost of the view.
    function _b64(bytes memory data) private pure returns (string memory result) {
        uint256 n = data.length;
        if (n == 0) return "";
        string memory table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        uint256 len = 4 * ((n + 2) / 3);
        result = new string(len + 32);
        assembly {
            let tablePtr := add(table, 1)
            let resultPtr := add(result, 32)
            let dataPtr := data
            let endPtr := add(data, n)
            for {} lt(dataPtr, endPtr) {} {
                dataPtr := add(dataPtr, 3)
                let input := mload(dataPtr)
                mstore8(resultPtr, mload(add(tablePtr, and(shr(18, input), 0x3F))))
                resultPtr := add(resultPtr, 1)
                mstore8(resultPtr, mload(add(tablePtr, and(shr(12, input), 0x3F))))
                resultPtr := add(resultPtr, 1)
                mstore8(resultPtr, mload(add(tablePtr, and(shr(6, input), 0x3F))))
                resultPtr := add(resultPtr, 1)
                mstore8(resultPtr, mload(add(tablePtr, and(input, 0x3F))))
                resultPtr := add(resultPtr, 1)
            }
            switch mod(n, 3)
            case 1 { mstore(sub(resultPtr, 2), shl(240, 0x3d3d)) }
            case 2 { mstore(sub(resultPtr, 1), shl(248, 0x3d)) }
            mstore(result, len)
        }
    }

    function _u(uint256 v) private pure returns (string memory) {
        bytes memory b = new bytes(78);
        uint256 j = _putU(b, 0, v);
        assembly {
            mstore(b, j)
        }
        return string(b);
    }

    function _hex32(bytes32 h) private pure returns (string memory) {
        bytes memory out = new bytes(66);
        out[0] = "0";
        out[1] = "x";
        bytes16 digits = "0123456789abcdef";
        for (uint256 i = 0; i < 32; i++) {
            out[2 + 2 * i] = digits[uint8(h[i]) >> 4];
            out[3 + 2 * i] = digits[uint8(h[i]) & 0xf];
        }
        return string(out);
    }

    // ───────────────────────────── ERC-721 (minimal, as BlockSkins)
    function ownerOf(uint256 tokenId) public view returns (address o) {
        o = _ownerOf[tokenId];
        if (o == address(0)) revert BadAddress();
    }

    function balanceOf(address account) external view returns (uint256) {
        if (account == address(0)) revert BadAddress();
        return _balanceOf[account];
    }

    function approve(address to, uint256 tokenId) external {
        address o = ownerOf(tokenId);
        if (msg.sender != o && !isApprovedForAll[o][msg.sender]) revert NotAllowed();
        getApproved[tokenId] = to;
        emit Approval(o, to, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        address o = ownerOf(tokenId);
        if (o != from || to == address(0)) revert BadAddress();
        if (msg.sender != o && getApproved[tokenId] != msg.sender && !isApprovedForAll[o][msg.sender]) revert NotAllowed();
        delete getApproved[tokenId];
        _balanceOf[from] -= 1;
        _balanceOf[to] += 1;
        _ownerOf[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public {
        transferFrom(from, to, tokenId);
        if (to.code.length != 0) {
            (bool ok, bytes memory ret) = to.call(abi.encodeWithSelector(0x150b7a02, msg.sender, from, tokenId, data));
            if (!ok || ret.length < 32 || abi.decode(ret, (bytes4)) != bytes4(0x150b7a02)) revert UnsafeRecipient();
        }
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7 || id == 0x80ac58cd || id == 0x5b5e139f; // ERC-165, ERC-721, ERC-721 metadata
    }
}
