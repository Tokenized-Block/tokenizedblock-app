// banc-skins-spin-deploy-fork-20261112.mjs — needs FORK_RPC=http://127.0.0.1:<port>, a LOCAL base-anvil fork of Base. Nothing touches
// mainnet: every write goes to 127.0.0.1, impersonation (Grok's wallet, USDC's masterMinter, a test buyer) on the fork only.
// Runs what deployer-skins-spin.html runs, against the REAL router P, vault V, pools and hook of the fork:
//   1. etapeSuivante (reads + the simulation from the deployer) -> eth_sendTransaction of EXACTLY the offered data, nonce and gas, from
//      the deployer; controleEtape + the code at the address after each receipt; a stray transaction between the two steps -> STOP
//      (snapshot, then reverted); another wallet -> refused.
//   2. verifierPaire on the fork (every line), then the noter CLI on a COPY of the record (both "nodes" = the fork).
//   3. the APP's own encoders in a copy of the modules with that noted record: a skin minted on the 1 USDC Skins through the router
//      (economie-pack.js payBatch), a spin on the new Spin and a spin on the earlier Spin (slots-plan.js), then both settled (planSettleMany).
// Prints each line and n/n; exit 1 on any KO.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { selecteur } from './keccak.js';
import * as SS from './skins-spin.js';
import { SKINS_SPIN_DEPLOIEMENT as R } from './skins-spin-deploiement.js';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const U = process.env.FORK_RPC || '';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(U)) { console.error('FORK_RPC must be a local fork (http://127.0.0.1:<port>)'); process.exit(2); }
let id = 0;
async function rpc(method, params = []) { const r = await fetch(U, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((x) => x.json()); if (r.error) throw new Error(method + ': ' + (r.error.message || JSON.stringify(r.error))); return r.result; }
let ok = 0, ko = 0;
const t = (m, c, x = '') => { if (c) ok++; else ko++; console.log((c ? 'ok  ' : 'KO  ') + m + (x ? ' — ' + x : '')); };
const recu = async (h) => { for (let k = 0; k < 100; k++) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return r; await new Promise((o) => setTimeout(o, 200)); } throw new Error('no receipt ' + h); };
const envoyer = async (x) => { const h = await rpc('eth_sendTransaction', [x]); return { h, r: await recu(h) }; };
const call = async (to, sig, args = '') => rpc('eth_call', [{ to, data: selecteur(sig) + args }, 'latest']);
const big = (h) => BigInt(h);
const ua = (a) => String(a).toLowerCase().slice(2).padStart(64, '0');
const u = (x) => BigInt(x).toString(16).padStart(64, '0');
const hx = (x) => '0x' + BigInt(x).toString(16);
const W = R.deployeur;
const chaine = await rpc('eth_chainId');
console.log('fork ' + U + ' · chain ' + BigInt(chaine) + ' · block ' + BigInt(await rpc('eth_blockNumber')) + ' · deployer nonce ' + BigInt(await rpc('eth_getTransactionCount', [W, 'latest'])));
for (const a of [W]) { await rpc('anvil_impersonateAccount', [a]); await rpc('anvil_setBalance', [a, '0x8ac7230489e80000']); }

console.log('— 1. the page flow');
const autreW = '0x' + '4d'.repeat(20);
t('another wallet is refused before anything is offered', /is not the deployer/.test((await SS.etapeSuivante(R, rpc, autreW, { N: null, hashes: [] })).raison));
const r1 = await SS.etapeSuivante(R, rpc, W, { N: null, hashes: [] });
t('step 1 offered after the simulation from the deployer (Skins at nonce N)', r1.pret === true && r1.k === 0, r1.pret ? 'N ' + r1.N + ', gas estimate ' + r1.gas + ', at ' + r1.attendu : r1.raison);
if (!r1.pret) { console.log(ok + '/' + (ok + ko) + ' — RED'); process.exit(1); }
const e1 = await envoyer({ from: W, data: r1.data, nonce: r1.nonce, gas: r1.gasEnvoi, value: '0x0' });
const tx1 = await rpc('eth_getTransactionByHash', [e1.h]);
t('Skins deployed: status 1', e1.r.status === '0x1', 'gas used ' + BigInt(e1.r.gasUsed));
t('Skins receipt = the frozen creation, from the deployer, nonce N, at the prediction', SS.controleEtape(R, 0, W, BigInt(r1.N), tx1, e1.r).length === 0);
t('Skins code = the frozen build (masked)', await SS.codeConforme(R.etapes[0], await rpc('eth_getCode', [e1.r.contractAddress, 'latest'])), String(e1.r.contractAddress));
{
  const snap = await rpc('evm_snapshot');
  await envoyer({ from: W, to: W, value: '0x0' });
  const s = await SS.etapeSuivante(R, rpc, W, { N: r1.N, hashes: [e1.h] });
  t('a stray transaction between the steps: STOP, nothing offered', s.pret === false && s.arret === true, s.raison);
  await rpc('evm_revert', [snap]);
  await rpc('anvil_impersonateAccount', [W]);
}
const r2 = await SS.etapeSuivante(R, rpc, W, { N: r1.N, hashes: [e1.h] });
t('step 2 offered after the simulation (Spin at nonce N+1)', r2.pret === true && r2.k === 1 && BigInt(r2.nonce) === BigInt(r1.N) + 1n, r2.pret ? 'gas estimate ' + r2.gas + ', at ' + r2.attendu : r2.raison);
const e2 = await envoyer({ from: W, data: r2.data, nonce: r2.nonce, gas: r2.gasEnvoi, value: '0x0' });
const tx2 = await rpc('eth_getTransactionByHash', [e2.h]);
t('Spin deployed: status 1', e2.r.status === '0x1', 'gas used ' + BigInt(e2.r.gasUsed));
t('Spin receipt = the frozen creation, from the deployer, nonce N+1, at the prediction', SS.controleEtape(R, 1, W, BigInt(r1.N), tx2, e2.r).length === 0);
t('Spin code = the frozen build (masked)', await SS.codeConforme(R.etapes[1], await rpc('eth_getCode', [e2.r.contractAddress, 'latest'])), String(e2.r.contractAddress));
t('both done: nothing more offered', (await SS.etapeSuivante(R, rpc, W, { N: r1.N, hashes: [e1.h, e2.h] })).fini === true);

console.log('— 2. the read-only checks and the note');
const v = await SS.verifierPaire(R, [e1.h, e2.h], rpc);
for (const l of v.lignes.filter((x) => !x.ok)) console.log('     KO line: ' + l.quoi + ' · seen ' + l.vu);
t('verifierPaire on the fork: every line holds', v.ok === true, v.lignes.length + ' lines');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skspin-fork-'));
try {
  for (const f of fs.readdirSync(ICI)) if (/\.(js|json)$/.test(f) && !f.startsWith('.mutant')) fs.copyFileSync(path.join(ICI, f), path.join(dir, f));
  const copie = path.join(dir, 'skins-spin-deploiement.js');
  const n = spawnSync(process.execPath, [path.join(ICI, 'contracts', 'noter-deploiement-skins-spin.mjs'), e1.h, e2.h], { encoding: 'utf8', env: { ...process.env, SKINS_SPIN_RECORD: copie, SKINS_SPIN_NOEUDS: U + ',' + U } });
  t('the noter CLI writes the copy (both "nodes" = the fork)', n.status === 0, (n.stdout + n.stderr).trim().split('\n').pop());
  const { SKINS_SPIN_DEPLOIEMENT: RN } = await import(pathToFileURL(copie).href);
  const d = SS.deployes(RN);
  t('the noted record: the app follows exactly the two deployed contracts', d.skins && d.spin && d.skins.adresse === String(e1.r.contractAddress).toLowerCase() && d.spin.adresse === String(e2.r.contractAddress).toLowerCase() && RN.nonceN === Number(BigInt(r1.N)));
  const n2 = spawnSync(process.execPath, [path.join(ICI, 'contracts', 'noter-deploiement-skins-spin.mjs'), e1.h, e2.h], { encoding: 'utf8', env: { ...process.env, SKINS_SPIN_RECORD: copie, SKINS_SPIN_NOEUDS: U + ',' + U } });
  t('a second note is refused (already noted)', n2.status === 1 && /already names deployed/.test(n2.stderr));

  console.log('— 3. the app encoders on the fork, with the noted record');
  const EP = await import(pathToFileURL(path.join(dir, 'economie-pack.js')).href);
  const SA = await import(pathToFileURL(path.join(dir, 'spin-actif.js')).href);
  const AC = await import(pathToFileURL(path.join(dir, 'blockskins-actif.js')).href);
  const Slots = await import(pathToFileURL(path.join(dir, 'slots-plan.js')).href);
  const SK = EP.SKINS_MINT, SP = SA.SPIN_ACTIF.contrat, VIEUX = SA.SPIN_ACTIF.avant.contrat, V = SA.SPIN_ACTIF.devRouteur.vault, P = EP.ROUTER, USDC = EP.USDC;
  t('the app mints on the deployed Skins (1 USDC) and spins on the deployed Spin', SK === d.skins.adresse && AC.SKIN_MINT_TEXTE === '1 USDC' && SP === d.spin.adresse && EP.SKINS_JOUE === false);
  const ACH = '0x000000000000000000000000000000000000b0b1', MINTER = '0x000000000000000000000000000000000000f00e';
  const MM = '0x' + String(await call(USDC, 'masterMinter()')).slice(-40);
  for (const a of [ACH, MM, MINTER]) { await rpc('anvil_impersonateAccount', [a]); await rpc('anvil_setBalance', [a, '0x8ac7230489e80000']); }
  await envoyer({ from: MM, to: USDC, data: selecteur('configureMinter(address,uint256)') + ua(MINTER) + u(100_000_000n) });
  await envoyer({ from: MINTER, to: USDC, data: selecteur('mint(address,uint256)') + ua(ACH) + u(5_000_000n) });
  const bal = async (tok, a) => big(await call(tok, 'balanceOf(address)', ua(a)));
  const FEE = d.skins.config.feeWallet;
  const devBps = EP.word(await rpc('eth_call', [EP.VIEW.partJeu(SK), 'latest']), 1), prix = EP.word(await rpc('eth_call', [EP.VIEW.mintPriceSkin(), 'latest']));
  const spend = EP.usdcEchange(prix, devBps), plancher = EP.word(await rpc('eth_call', [EP.VIEW.minOutFloor(spend), 'latest']));
  const blk = '0xb2000000000000000000007afa7ed748b0874f27';
  const ts = Number(BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp));
  const [ap, pay] = EP.payBatch({ game: SK, usdcIn: prix, minOut: plancher, deadline: ts + EP.DELAI_PAIEMENT_S, data: EP.dataSkin({ block: blk, recipe: 921392438632273567n }) });
  const avant = { a: await bal(USDC, ACH), f: await bal(USDC, FEE), v: await bal(EP.TBLOCK, V) };
  const ra = await envoyer({ from: ACH, ...ap }), rp = await envoyer({ from: ACH, ...pay, gas: '0x2dc6c0' });
  t('skin mint through the router: approve + pay, both status 1', ra.r.status === '0x1' && rp.r.status === '0x1', 'pay gas ' + BigInt(rp.r.gasUsed) + ', minOut = router floor ' + plancher);
  const apres = { a: await bal(USDC, ACH), f: await bal(USDC, FEE), v: await bal(EP.TBLOCK, V) };
  t('the buyer paid exactly 1 USDC; the fee wallet got 0.10 USDC; the vault got at least the floor in TBLOCK', avant.a - apres.a === 1_000_000n && apres.f - avant.f === 100_000n && apres.v - avant.v >= plancher,
    'vault +' + (apres.v - avant.v) + ' TBLOCK raw');
  t('the skin is the buyer\'s (ownerOf(1))', ('0x' + String(await call(SK, 'ownerOf(uint256)', u(1))).slice(-40)) === ACH);
  const spinSur = async (c) => {
    const p = Slots.planSpin({ contrat: c, usdc: USDC, spinPrice: 500000n });
    const out = [];
    for (const x of p.appels) out.push(await envoyer({ from: ACH, to: x.to, data: x.data, gas: '0x2dc6c0' }));
    return out;
  };
  const potAvant = big(await call(SP, 'pot()')), devAvant = big(await call(SP, 'devOwed()'));
  const s1 = await spinSur(SP);
  t('a spin on the new Spin (approve exact + spin): status 1, pot +0.25, dev owed +0.25 USDC', s1.every((x) => x.r.status === '0x1') && big(await call(SP, 'pot()')) - potAvant === 250000n && big(await call(SP, 'devOwed()')) - devAvant === 250000n);
  const s2 = await spinSur(VIEUX);
  t('a spin on the earlier Spin still works (its own pot)', s2.every((x) => x.r.status === '0x1'));
  for (let k = 0; k < 6; k++) await rpc('evm_mine');
  const idNeuf = big(await call(SP, 'spinCount()')), idVieux = big(await call(VIEUX, 'spinCount()'));
  for (const [c, i, nom] of [[SP, idNeuf, 'new'], [VIEUX, idVieux, 'earlier']]) {
    const x = Slots.planSettleMany({ contrat: c, spinIds: [i] }).appels[0];
    const r = await envoyer({ from: MINTER, to: x.to, data: x.data, gas: '0x2dc6c0' });
    const st = Number(BigInt('0x' + String(await call(c, 'spins(uint256)', u(i))).slice(2).slice(128, 192)));
    t('settleMany on the ' + nom + ' Spin by anyone: status 1, spin ' + i + ' settled (status 2)', r.r.status === '0x1' && st === 2, 'gas ' + BigInt(r.r.gasUsed));
  }
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
