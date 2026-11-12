# Fork it, deploy it, and read where the money goes

This repository is meant to be forked and redeployed. This page says exactly what happens to the
fees when you do — including the part we cannot control.

## The short version

What a fork controls, and what it does not. Both columns are read from the deployed contract, not
promised here.

| | a fork can change it | why |
|---|---|---|
| **where** the fees land | **no**, while using our hooks | `address public immutable feeWallet` — no setter, no owner |
| **the swap rate** | **no**, but it is **not 0.5 % on every hook** — see below | `uint24 public constant HOOK_FEE`, read per hook |
| **how much is sent at launch** | **yes** | the hook only requires `msg.value >= fraisVie`, and `fraisVie()` reads **0.0003 ETH**. Our app chooses to send 0.001 ETH; a fork may send the minimum |
| **everything**, by deploying its own hook | **yes** | nothing prevents it, and the recipe is below |

⛔ **An earlier version of this page, and the repository description, said a fork "cannot redirect
the fees".** That was an overclaim twice over: a fork can deploy its own hook, and even on ours it
can send 0.0003 ETH instead of 0.001 — **70 % less** — because the 0.001 is an application choice,
not an on-chain floor. Measured on 2026-09-21 with `eth_call` on `fraisVie()`. The claim is
retracted here rather than quietly softened.

⛔ **This page said "the 0.5 % swap rate … while using our hooks". That is true of the hook we run,
and false of six of the eight we deployed.** `HOOK_FEE()` read on all eight on 2026-09-29:

| hook | `HOOK_FEE()` | at the same 1e6 scale | `fraisVie()` | `feeWallet()` |
|---|---|---|---|---|
| V8 — **the one our app uses** (`deploy-v8.json`) | **5 000** | **0.5 %** | 0.0003 ETH | a6cf |
| V2 · V3 · V4 · V5 · V6 · V7 | **30 000** | **3 %** | 0.0003 ETH | a6cf |
| V1 | not declared (`FEE_WALLET()` in capitals, no `HOOK_FEE`) | — | — | a6cf |

So a fork that points at V2–V7 charges its users **six times** what this page claimed. The word
"our hooks" was doing the damage: one number was measured on one contract and written as if it
governed all of them. **All eight do send to a6cf** — that column was right, and it was checked in
both spellings, because V1 uses `FEE_WALLET()` where the others use `feeWallet()`.

⚠️ What this table does **not** prove: that V2–V7 ever charged anyone. It reads the constant, not a
swap. A declared rate on a hook that no live pool uses collects nothing — and on 2026-09-29 the fee
wallet held **0.002293010 ETH**.

⛔ **A balance is not an income statement, and this page nearly said it was.** A first draft of the
line above added "from a wallet that has sent exactly one transaction in its life", reading
`eth_getTransactionCount` as proof that whatever arrived was still there. **The fee wallet is a
contract, not an EOA**: `eth_getCode` returns 61 bytes, an EIP-1967 minimal proxy that `SLOAD`s
slot `0x360894a1…382bbc` and delegatecalls. A contract's nonce counts the contracts it creates, not
the ETH it sends, so its balance can fall without the nonce moving — and a balance-grid walk back
to block 50 861 088 shows **six** falls. Measured floors instead: **at least 0.005867 ETH credited
and 0.004433 ETH debited**, plus **29 token transfers across 9 distinct tokens**. The word "total"
was removed because nothing here establishes one.

Verify that number yourself:

```bash
node test-frais-vont-au-wallet.mjs   # reads feeWallet() AND fraisVie() on the deployed hooks
```

## Why the first row cannot be changed from this repository

The hook contract declares:

```solidity
address public immutable feeWallet;
```

`immutable` means it is written once, in the constructor, at deployment. The contract has **no
setter**, **no owner**, and **no admin role of its own**. The deployed hooks on Base mainnet already
have our wallet burned into them.

So editing `FEE_WALLET` in `frais-creation.js` changes what this app *displays*. It changes nothing
about where the chain sends the money, because the app does not route the fee — the hook does.

Check it yourself, without trusting this file:

```bash
node test-frais-vont-au-wallet.mjs
```

It reads `feeWallet()` on the four deployed hooks over JSON-RPC, and separately checks the Solidity
source for a setter, an `Ownable`, or an owner variable. If the chain is unreachable it says so
instead of passing quietly.

## Proving the money actually moves

A contract that *can* pay is not a contract that *does* pay. This script simulates a full launch on
real Base mainnet state, with a **fabricated stranger address** as the creator — not ours:

```bash
node preuve-frais-arrivent.mjs
```

It traces every ETH transfer inside the simulation and reports the path hop by hop:

```
inconnu → hook : 1000000000000000 wei = 0.001000000 ETH
hook → a6cf    : 1000000000000000 wei = 0.001000000 ETH
rien ne reste au hook : ✅ oui
```

⛔ It refuses to report success on a green status alone. An call can return `status 0x1` and move
nothing; that is exactly the failure this script exists to catch.

⛔ **Its bound, stated in the file:** it is a simulation. It proves the contracts move the money as
described. It does not prove that a stranger will come and do it.

## If you want the fees to go to you instead

That is a fair thing to want, and the honest answer is: deploy your own hook.

1. `tblock-hook/src/TBlockFeeHookV8.sol` — set your wallet in the constructor arguments.
2. Mine an address whose **last 14 bits** match the permission flags your hook declares. Uniswap v4
   reads a hook's permissions from its address, so the address is not free; `HookMiner` in the forge
   scripts does this.
3. Deploy through the CREATE2 deployer, then point your app's `HOOK_V8` at your address.

Your blocks will then be yours end to end. They will not be Tokenized Block blocks, they will not
appear on our map, and our hooks will refuse to open markets for them — `_estDevise` and the label
lock are read from the hook, not from the app.

## What a fork inherits, and what it does not

**Inherits:** the B-20 factory (the whole supply minted at creation, equal to the cap; the app names the
creating wallet as each block's admin, which could raise the cap later — see the README), the
Uniswap v4 launch plan, the permanent-liquidity rule, the 17 currencies a deployed hook admits, and
every measurement script in this repository with its stated bounds.

**Does not inherit:** our markets, our domain, and the possibility of redirecting our hooks' fees.

## Running it

Static files. No build step, no dependencies, no backend.

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/app.html`.

The measurement scripts need Node 18+ and read-only JSON-RPC access to Base mainnet. None of them
signs, sends, or spends anything — that is checked, not promised: every one of them says so in its
own header, and none imports a signer.

```bash
for f in test-*.mjs; do node "$f"; done
```
