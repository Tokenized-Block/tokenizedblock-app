// verifier-economie-v2-deployee-20261111.mjs <likes tx hash> <vault tx hash> — after Grok's wallet deployed BlockLikesV2 then TBlockVaultV2
// from deployer-economie-v2.html, PROVES before the app switches to v2:
//   1. both txs succeeded (status 1) and created contracts; the sender of each is READ and printed (never assumed);
//   2. each tx input is EXACTLY the frozen data (likes: sha256 of the creation; vault: vaultV2Creation(likes address from the receipt));
//   3. each RUNTIME code on mainnet == the runtime the frozen bytes produce on a base-anvil fork (exact compare). For the vault, the
//      mainnet likes code is placed at the mainnet likes address on the fork first (anvil_setCode), so the same constructor runs;
//   4. the wiring reads back: real TBLOCK, real lock, start price, keeper and dev wallets as frozen; vault -> these likes, same lock.
// Reads only (mainnet: the prod relay with x-ms-monitor, the public node for tx bodies; the fork at 127.0.0.1:8659). Signs nothing.
import crypto from 'node:crypto';
import { selecteur } from './keccak.js';
import { ECONOMIE_V2_DEPLOIEMENT as D, vaultV2Creation } from './economie-v2-deploiement.js';
/* V2_MAINNET_RPC: ONLY for the self-test on a fork (verifier proven green on a true deploy, red on a false one) */
const MAIN = process.env.V2_MAINNET_RPC || 'https://tokenizedblock.space/api/rpc', PUB = process.env.V2_MAINNET_RPC || 'https://mainnet.base.org', FORK = 'http://127.0.0.1:8659';
const [txL, txV] = process.argv.slice(2).map((x) => String(x || '').toLowerCase());
if (![txL, txV].every((x) => /^0x[0-9a-f]{64}$/.test(x))) { console.log('usage: node verifier-economie-v2-deployee-20261111.mjs <likes tx hash> <vault tx hash>'); process.exit(2); }
async function rpc(u, method, params = []) {
  for (let k = 0; k < 5; k++) {
    const r = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json', 'x-ms-monitor': '1' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }).then((x) => x.json()).catch(() => null);
    if (r && !r.error) return r.result;
    await new Promise((o) => setTimeout(o, 1500));
  }
  throw new Error(method + ' not answered');
}
let ok = 0, ko = 0;
const t = (m, c, x = '') => { if (c) ok++; else ko++; console.log((c ? 'ok  ' : 'KO  ') + m + (x ? ' — ' + x : '')); };
const sha = (s) => crypto.createHash('sha256').update(String(s).toLowerCase()).digest('hex');
const adr = (h) => '0x' + String(h).slice(-40).toLowerCase();
async function lireTx(h, nom) {
  const rc = await rpc(MAIN, 'eth_getTransactionReceipt', [h]);
  t(nom + ': receipt found, status 1', !!rc && rc.status === '0x1', rc ? rc.status : 'none');
  const a = rc && rc.contractAddress ? String(rc.contractAddress).toLowerCase() : null;
  t(nom + ': the tx created a contract', !!a, a || '');
  const txo = await rpc(PUB, 'eth_getTransactionByHash', [h]).catch(() => null);
  console.log('    ' + nom + ' sender (read, not assumed): ' + (txo ? txo.from : 'not read'));
  return { a, input: txo ? String(txo.input).toLowerCase() : null };
}
const L = await lireTx(txL, 'BlockLikesV2');
const V = await lireTx(txV, 'TBlockVaultV2');
t('likes tx input = the frozen creation (sha256)', !!L.input && sha(L.input) === D.likes.sha256Creation);
t('vault tx input = vaultV2Creation(likes address from the receipt), exactly', !!V.input && !!L.a && V.input === vaultV2Creation(L.a).toLowerCase());
/* reference runtimes on the fork */
const from = '0x025d751752d3aa695fdb3d9eedee69bc9553f331';
await rpc(FORK, 'anvil_impersonateAccount', [from]); await rpc(FORK, 'anvil_setBalance', [from, '0xde0b6b3a7640000']);
async function deployFork(data) {
  const h = await rpc(FORK, 'eth_sendTransaction', [{ from, data, gas: '0x' + (8_000_000).toString(16) }]);
  let r = null; for (let k = 0; k < 60 && !r; k++) { r = await rpc(FORK, 'eth_getTransactionReceipt', [h]); if (!r) await new Promise((o) => setTimeout(o, 500)); }
  return r && r.status === '0x1' ? String(r.contractAddress).toLowerCase() : null;
}
const codeL = L.a ? await rpc(MAIN, 'eth_getCode', [L.a, 'latest']) : '0x';
const refL = await deployFork(D.likes.creation);
const codeRefL = refL ? await rpc(FORK, 'eth_getCode', [refL, 'latest']) : '0x';
t('likes: mainnet runtime == runtime of the FROZEN bytes (exact)', codeL.length > 2 && codeL.toLowerCase() === codeRefL.toLowerCase(), (codeL.length - 2) / 2 + ' bytes vs ' + (codeRefL.length - 2) / 2);
const codeV = V.a ? await rpc(MAIN, 'eth_getCode', [V.a, 'latest']) : '0x';
let codeRefV = '0x';
if (L.a) {
  await rpc(FORK, 'anvil_setCode', [L.a, codeL]);
  const refV = await deployFork(vaultV2Creation(L.a));
  codeRefV = refV ? await rpc(FORK, 'eth_getCode', [refV, 'latest']) : '0x';
}
t('vault: mainnet runtime == runtime of the FROZEN bytes wired to these likes (exact)', codeV.length > 2 && codeV.toLowerCase() === codeRefV.toLowerCase(), (codeV.length - 2) / 2 + ' bytes vs ' + (codeRefV.length - 2) / 2);
const lit = async (to, sig) => rpc(MAIN, 'eth_call', [{ to, data: selecteur(sig) }, 'latest']);
const C = D.likes.config;
if (L.a) {
  t('likes: the real TBLOCK and the real lock', adr(await lit(L.a, 'TBLOCK()')) === C.tblock && adr(await lit(L.a, 'LOCK()')) === C.lock);
  t('likes: keeper and the two dev wallets as frozen', adr(await lit(L.a, 'keeper()')) === C.keeper && adr(await lit(L.a, 'DEV()')) === C.dev && adr(await lit(L.a, 'DEV2()')) === C.dev2);
  console.log('    likes price now: ' + BigInt(await lit(L.a, 'price()')) + ' (frozen start ' + C.startPrice + ') · minHold ' + (BigInt(await lit(L.a, 'minHold()')) / 10n ** 18n) + ' TBLOCK · frozen: ' + BigInt(await lit(L.a, 'frozen()')));
}
if (V.a && L.a) {
  t('vault: wired to these likes and the same lock', adr(await lit(V.a, 'LIKES()')) === L.a && adr(await lit(V.a, 'LOCK()')) === C.lock);
  t('vault: dev wallets as frozen', adr(await lit(V.a, 'DEV()')) === D.vault.config.dev && adr(await lit(V.a, 'DEV2()')) === D.vault.config.dev2);
}
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED: do NOT switch the app to v2' : ' — green: ADRESSE_LIKES_V2=' + L.a + ' ADRESSE_VAULT_V2=' + V.a));
process.exit(ko ? 1 : 0);
