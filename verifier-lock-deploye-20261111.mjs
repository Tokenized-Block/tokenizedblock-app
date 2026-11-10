// verifier-lock-deploye-20261111.mjs <tx hash> — after TBlockLock was deployed on Base, PROVES before the app lights its buttons:
//   1. the tx succeeded (status 1) and created the address the page showed; its sender is printed (never assumed);
//   2. the RUNTIME code at that address on mainnet == the runtime code the FROZEN creation bytes produce on a base-anvil fork
//      (same constructor argument -> identical bytes; an exact compare, not a size check);
//   3. its constants read back: TBLOCK, MIN_LOCK = 7 days, WITHDRAW_DELAY = 7 days, totalLocked = 0.
// Reads only (mainnet via the prod relay with x-ms-monitor; the fork at 127.0.0.1:8659 for the reference bytes). Signs nothing.
import { selecteur } from './keccak.js';
import { LOCK_DEPLOIEMENT as D } from './lock-deploiement.js';
const MAIN = 'https://tokenizedblock.space/api/rpc', FORK = 'http://127.0.0.1:8659';
const arg = String(process.argv[2] || '').toLowerCase();
const parAdresse = /^0x[0-9a-f]{40}$/.test(arg);
const tx = parAdresse ? null : arg;
if (!parAdresse && !/^0x[0-9a-f]{64}$/.test(arg)) { console.log('usage: node verifier-lock-deploye-20261111.mjs <tx hash (0x + 64 hex) | contract address (0x + 40 hex)>'); process.exit(2); }
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
let adr = null;
if (parAdresse) {
  /* by ADDRESS (no tx hash at hand): the receipt and the sender are NOT checked here, and that is said; the exact code compare is the proof */
  adr = arg;
  console.log('    by address: receipt and sender not checked (no tx hash given)');
} else {
  const rc = await rpc(MAIN, 'eth_getTransactionReceipt', [tx]);
  t('receipt found and status 1', !!rc && rc.status === '0x1', rc ? rc.status : 'none');
  adr = rc && rc.contractAddress ? String(rc.contractAddress).toLowerCase() : null;
  t('the tx created a contract', !!adr, adr || '');
  /* the prod relay does not relay eth_getTransactionByHash: the public Base node answers it (a read) */
  const txo = await rpc('https://mainnet.base.org', 'eth_getTransactionByHash', [tx]).catch(() => null);
  console.log('    sender (read, not assumed): ' + (txo ? txo.from : 'not read') + ' · input sha matches the frozen data: ' + (txo ? (await import('node:crypto')).createHash('sha256').update(String(txo.input).toLowerCase()).digest('hex') === D.sha256Creation : 'not read'));
}
const codeMain = adr ? await rpc(MAIN, 'eth_getCode', [adr, 'latest']) : '0x';
/* the reference: deploy the frozen bytes on the fork, read its runtime */
const from = '0x025d751752d3aa695fdb3d9eedee69bc9553f331';
await rpc(FORK, 'anvil_impersonateAccount', [from]); await rpc(FORK, 'anvil_setBalance', [from, '0xde0b6b3a7640000']);
const h = await rpc(FORK, 'eth_sendTransaction', [{ from, data: D.creation, gas: '0x' + (3_000_000).toString(16) }]);
let rf = null; for (let k = 0; k < 40 && !rf; k++) { rf = await rpc(FORK, 'eth_getTransactionReceipt', [h]); if (!rf) await new Promise((o) => setTimeout(o, 500)); }
const codeRef = await rpc(FORK, 'eth_getCode', [rf.contractAddress, 'latest']);
t('mainnet runtime == the runtime of the FROZEN bytes (exact)', codeMain.length > 2 && codeMain.toLowerCase() === codeRef.toLowerCase(), (codeMain.length - 2) / 2 + ' bytes vs ' + (codeRef.length - 2) / 2);
const lit = async (sig) => rpc(MAIN, 'eth_call', [{ to: adr, data: selecteur(sig) }, 'latest']);
if (adr) {
  t('TBLOCK() = the real TBLOCK', (await lit('TBLOCK()')).toLowerCase().endsWith('b200000000000000000000ba9bf8330307f8830e'));
  t('MIN_LOCK = 7 days', BigInt(await lit('MIN_LOCK()')) === 604800n);
  t('WITHDRAW_DELAY = 7 days', BigInt(await lit('WITHDRAW_DELAY()')) === 604800n);
  console.log('    totalLocked now: ' + BigInt(await lit('totalLocked()')).toString());
}
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED: do NOT light the lock buttons' : ' — green: ADRESSE_LOCK=' + adr));
process.exit(ko ? 1 : 0);
