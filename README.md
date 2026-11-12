<h1 align="center">Tokenized Block</h1>

<p align="center">
  Build a block — name, symbol, colour, supply — and it becomes a <b>B-20 native token on Base</b>
  with a permanent Uniswap&nbsp;v4 market.
</p>

<p align="center">
  <a href="https://tokenizedblock.space"><b>tokenizedblock.space</b></a> ·
  <a href="DEPLOY.md">Fork &amp; deploy</a> ·
  <a href="#run-the-instruments">Reproduce every number</a>
</p>

---

## What a block is

- **Every block born through this app has an administrator: its creator's wallet.** The app passes
  the creating wallet as the B-20 `admin` at birth (`calldataCreation` in `app.html`,
  `naissance-api.js`), and the factory grants it `DEFAULT_ADMIN_ROLE` in the creation transaction;
  nothing revokes it. Nobody holds `MINT_ROLE` at birth, but the admin can raise the cap
  (`updateSupplyCap`) and grant itself `MINT_ROLE`, or any other role (each one is administered by `DEFAULT_ADMIN_ROLE`). The B-20 precompile also
  refuses to let the last admin leave (`renounceRole` and `revokeRole` revert
  `LastAdminCannotRenounce()`). All read on Base on 2026-11-12, including on the newest app birth
  (`0xb200…3f2f`, 2026-11-10).
- **Supply equals the cap at birth.** 1,000,000,000 units are minted inside the creation
  transaction (all to the creator on the current path), and the cap is set to that number. It stays
  that way unless the block's admin raises the cap.
- **The market is permanent.** Liquidity is deposited to the dead address. Nobody can withdraw it,
  and therefore nobody can collect LP fees — which is why the LP fee is set to `0`.

<details>
<summary><b>The 17 blocks we know were born through TokenizedBlock, and who holds their admin role</b></summary>

<br>

Read on 2026-11-12 with `emission-b20.js` (`verifierEmission`: the creation block's `RoleGranted` /
`RoleRevoked` logs, then `hasRole` now), on base-rpc.publicnode.com. All 17: supply = cap =
1,000,000,000, no `MINT_ROLE` granted in the creation transaction, and the account below holds
`DEFAULT_ADMIN_ROLE` today.

| block | born (Base block) | holds `DEFAULT_ADMIN_ROLE` |
|---|---|---|
| `0xb20000000000000000000003d296be435ae4bbe3` (TTB) | 51224806 | `0xaf8e0a44496a6b90da03fbadd9daec875fc3e2a6`, its creator |
| `0xb20000000000000000000024c30d3fcb7931272e` | 51260745 | `0xaf8e0a44496a6b90da03fbadd9daec875fc3e2a6`, its creator |
| `0xb200000000000000000000407ee1732664dc8028` | 51314358 | `0x410640c3048ab18fc27a6e274e4ae907580e0dea`, its creator |
| `0xb200000000000000000000dae0212b61be4c49bb` | 51314670 | `0x410640c3048ab18fc27a6e274e4ae907580e0dea`, its creator |
| `0xb200000000000000000000913c2d82ea435eb2aa` | 51356384 | `0x410640c3048ab18fc27a6e274e4ae907580e0dea`, its creator |
| `0xb20000000000000000000072eb43b8db1029b7d9` | 51358276 | `0x410640c3048ab18fc27a6e274e4ae907580e0dea`, its creator |
| `0xb200000000000000000000df3ffcd9be89b3843c` | 51359874 | `0x410640c3048ab18fc27a6e274e4ae907580e0dea`, its creator |
| `0xb200000000000000000000ab549fa65ad4edae3f` | 51527429 | `0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4`, **our fee wallet** |
| `0xb200000000000000000000baa5356bfc210cc30a` | 51660080 | `0x6acc0473fb6f44cb26477a0456a841c2c7cbd186`, its creator |
| `0xb200000000000000000000e63ffc3f40bf92a042` | 51692885 | `0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4`, **our fee wallet** |
| `0xb2000000000000000000005113f47a963ebdc45c` | 51693323 | `0x37eb9b7ce0b51fe12fbf092026e001918128580a`, its creator (our former fee wallet) |
| `0xb200000000000000000000e7e9db76e8234f8f56` | 51955173 | `0xaf8e0a44496a6b90da03fbadd9daec875fc3e2a6`, its creator |
| `0xb20000000000000000000005090fb1d9da0e5949` | 51998292 | `0x37eb9b7ce0b51fe12fbf092026e001918128580a`, its creator (our former fee wallet) |
| `0xb200000000000000000000e0e18f3d8fd5a50164` | 52217444 | `0xcafced36364578a1dfadac08ea59dd78ebf61b2a`, the admin named at its birth (sent through a smart wallet) |
| `0xb2000000000000000000007afa7ed748b0874f27` | 52694118 | `0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b`, its creator |
| `0xb2000000000000000000001e784d3883f4a03f35` | 55664552 | `0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b`, its creator |
| `0xb2000000000000000000000b1e6268211b153f2f` | 55743933 | `0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b`, its creator |

The list: every `createPaid` of our CreateRouter and of its earlier router since its first block
(`/api/blocks-routeur`, coverage complete), plus the blocks minted to our fee wallet
(`/api/nos-blocks`). A block created on the older direct pages (`index.html`, `block-0.html`, which
pass `admin = address(0)`) or by another app is not in it.

Check any block yourself — `hasRole(bytes32,address)` with role `0x00…00` (`DEFAULT_ADMIN_ROLE`) or
`0x154c00819833dac601ee5ddded6fda79d9d8b506b911b3dbd54cdb95fe6c3686` (`MINT_ROLE`):

```bash
cast call <block> "hasRole(bytes32,address)(bool)" 0x0000000000000000000000000000000000000000000000000000000000000000 <account> --rpc-url https://mainnet.base.org
```

or read the `RoleGranted` / `RoleRevoked` logs of the block's creation transaction on a block
explorer. A block whose creation gave every right away in the same transaction holds no admin
(TBLOCK `0xb200000000000000000000ba9bf8330307f8830e`, launched on BaseStonk, is one).

</details>

This page holds no key, has no backend that can move funds, and presents transactions for *your*
wallet to sign. Every state it shows is re-read from the chain: a green result means a receipt with
status `0x1` was read back, never that a transaction was merely broadcast.

## What it costs

| moment | cost | where it goes |
|---|---|---|
| create a block **and** open its market | **0.001 ETH**, once, in one signature | the fee wallet, in full |
| every swap afterwards | **0.5 %** of the swap | the fee wallet, in full |

Fee wallet, and the only one: `0xa6cF99D35949c6cB911adB910078F4Ca46F0f5d4` — `feeWallet()` on the
hook returns it.

<details>
<summary><b>Why 0.001 ETH, and why it changed on 2026-09-21</b></summary>

<br>

Opening a market used to cost `0.0003 ETH` — not by choice. That was a floor inherited from an
older contract, and a `$1` target in ETH falls below it at current prices, so the floor applied to
every launch, silently. Nobody had picked that price.

`prix-du-lancement.mjs` then read the 103 markets opened in one day by the busiest hook on Base:
**43 distinct creators, median sent 0.001001 ETH**. We were asking three times less than the
market, from the only side that actually pays. The new price is that median, rounded down.

⛔ This is not a revenue forecast. It aligns our price with the market's; it brings in no creator by
itself. The effect will be measured — creations before and after — and published either way.

</details>

## Where the fees go if you fork this

The hook declares `address public immutable feeWallet`. Written once, in the constructor. **No
setter, no owner, no admin role of its own.**

| | can a fork change it | why |
|---|---|---|
| **where** the fees land | **no**, on our hooks | `immutable feeWallet`, no setter |
| the **0.5 %** swap rate | **no**, on our hooks | `uint24 public constant HOOK_FEE = 5_000` |
| **how much** is sent at launch | **yes** | the hook only requires `msg.value >= fraisVie`, and `fraisVie()` reads **0.0003 ETH**. The 0.001 ETH is *our app's* choice |
| all of it, by deploying its own hook | **yes** | nothing prevents it — [DEPLOY.md](DEPLOY.md) has the recipe |

Editing `FEE_WALLET` in this repository changes what the app *displays*. It changes nothing on
chain, because the app does not route the fee — the hook does.

⛔ **This section used to say a fork "cannot redirect the fees".** That was an overclaim twice over,
and it is retracted rather than softened: a fork can deploy its own hook, and even on ours it can
send the on-chain minimum instead of what we ask — **70 % less**. Measured on 2026-09-21 by calling
`fraisVie()`. `test-frais-vont-au-wallet.mjs` now fails if this page claims otherwise.

```bash
node test-frais-vont-au-wallet.mjs   # reads feeWallet() on 4 deployed hooks + checks the source
node preuve-frais-arrivent.mjs       # simulates a stranger opening a market, traces every transfer
```

The second one reports the path hop by hop rather than trusting a green status:

```
inconnu → hook : 1000000000000000 wei = 0.001000000 ETH
hook → a6cf    : 1000000000000000 wei = 0.001000000 ETH
rien ne reste au hook : ✅ oui
```

**[DEPLOY.md](DEPLOY.md)** explains how to make the fees go to *you* instead. We would rather write
that down than have you discover it.

## What the chain says

Read on 2026-09-21. Every figure below is reproducible with the scripts in this repository.

**The hook, read on chain**

| call | value |
|---|---|
| `HOOK_FEE()` | `5000` / 1e6 = **0.5 %** |
| `feeWallet()` | `0xa6cF…f5d4` |
| fee split | 100 % to the fee wallet |
| currencies a block can be priced in | **17** — ETH, TBLOCK, USDC, cbBTC + 13 tokenized stocks |

The currency list lives in a `deviseAdmise` mapping written only in the constructor. It cannot be
extended after deployment — a constraint on us, and exactly what makes it trustworthy.

**Fees collected — 14 days, 1818 log windows, zero missed**

| | |
|---|---|
| fee collections | **41** (2.93 / day) |
| ETH reaching the fee wallet | **0.002798464 ETH** |
| paid by addresses that are not ours | **32.8 %**, from 5 distinct addresses |

**Where B-20 volume actually lives — 1 day, 100 % of blocks read**

| | pools | swaps | distinct addresses | swaps per address |
|---|---|---|---|---|
| pools with **no** hook | 20 | 282 | 19 | 4.3 |
| pools **with** a hook | 242 | 25 395 | 35 | **725.6** |

A hook does not repel traders — hooked pools get far more swaps. But 725 swaps per address is
automation, not demand. **Across the whole of Base, in one day, 54 distinct addresses touched a
newly-born B-20 pool at all.**

**For scale — same day, same method**

| token | distinct addresses | transfers |
|---|---|---|
| USDC | **329 365** | 3 610 687 |
| cbBTC | 10 816 | 583 892 |
| NVDAc | 2 158 | 35 403 |
| TBLOCK *(ours)* | **0** | **0** |

## What is not true yet

Published here because a page that only lists its wins is marketing, not evidence.

- **Two thirds** of the ETH collected came from our own wallets trading our own blocks.
- Total revenue to date is **well under one cent per day**. This is not a business yet.
- **TBLOCK, our own token, had zero transfers in 24 hours.**
- There is **no bridge to a bank account**. Selling a block returns USDC to a wallet, not to an IBAN.
- There is **no tokenized yuan or rouble on Base**. We looked; what exists has a supply of zero.
- Hooks V6, V7 and V8 sat at **zero markets** for days. Not from lack of demand — the app's fast
  Create path had the hook written as a constant. Fixed 2026-09-21, and a test now refuses a second
  copy of that decision.

## Corrections

Every claim this file got wrong, kept next to what replaced it.

| what was said | what is true |
|---|---|
| "Nothing above has been done on Base mainnet" | 41 fee collections were measured over 14 days |
| "Real Create charges a 0.001 ETH service fee" | `utiliseCreateRouter()` returns `false`; Create went to the factory at value zero |
| "Create is free" | true of one call, false for anyone reading it — opening a market cost 0.0003 ETH |
| "B-20 tokens do get traded, at scale" | 43 263 swaps looked like a crowd; the address column said 35 addresses |
| "`main` holds the retired GitHub Pages stub" | Pages reports `status: built` and is still serving |
| "a fork cannot redirect the fees" | it can, two ways: its own hook, or sending the on-chain minimum (0.0003 ETH) instead of the 0.001 our app asks |

## Run the instruments

Each script states, in its own header, the bound of what it can prove — and several refuse to give a
verdict rather than publish a biased one.

```bash
node devises-admises.mjs          # what a deployed hook accepts as a pair currency
node ou-vit-le-volume.mjs 1       # hooked pools vs free pools, by swaps AND by addresses
node bridge-devises-liquidite.mjs # how much each admitted currency actually moves
node prix-du-lancement.mjs        # what creators pay to open a market elsewhere on Base
node reference-frais.mjs          # fees now, against a reference frozen before the V6 hook existed
```

```bash
for f in test-*.mjs; do node "$f"; done   # 37 files, all green on 2026-09-21
```

Two of these instruments were rebuilt after being caught measuring badly:

- `ou-vit-le-volume.mjs` first read **19 windows out of 303** and would have published a ratio built
  on 6 % of the period — and the windows that failed were the busiest ones, so the bias ran toward
  the conclusion. It now splits a window in half on failure and **refuses any verdict** if a single
  block stayed unread.
- `test-texte-a-l-ecran.mjs` first scanned one page while the defect it was written for sat on four.

## Fork it

Static files. No build step, no dependencies, no backend.

```bash
git clone https://github.com/Tokenized-Block/tokenizedblock-app.git
cd tokenizedblock-app
python -m http.server 8000
```

Then open `http://localhost:8000/app.html`.

⚠️ A wallet's in-app browser on Android refuses plain HTTP (`ERR_CLEARTEXT_NOT_PERMITTED`). Use the
hosted HTTPS page on mobile, or a desktop browser with a wallet extension.

## Method

No undated figures. No ARR, MRR or projection appears anywhere in this repository. A number that was
not measured is not written down, and a measurement that went against us is printed next to one that
did not.
