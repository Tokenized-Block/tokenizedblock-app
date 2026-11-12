// banc-spin-dev-keeper-fork-20261112.mjs — needs FORK_RPC=http://127.0.0.1:<port>, a LOCAL base-anvil fork of Base. Nothing touches
// mainnet: every write goes to 127.0.0.1; impersonation (Grok's deployer wallet, USDC's masterMinter, a test player) on the fork only.
// Proves on a real fork what test-spin-dev-keeper-20261112.mjs proves against a scripted RPC: the server keeper spin-dev-keeper.js
// really pays the Spin's dev share through the live TBLOCK payment router P, TBLOCK -> holders vault V.
//   1. deploys Skins + the new Spin exactly as banc-skins-spin-deploy-fork-20261112.mjs does (skins-spin.js etapeSuivante, the
//      deployer impersonated);
//   2. plays spins with the app's encoder (slots-plan.js planSpins) until devOwed >= MIN_DEV_BATCH;
//   3. runs the keeper with the anvil test key #0 (public test key, fork only): tour() -> receipt -> tour() (follows the tx in flight);
//   4. asserts from the tx, its receipt and balance deltas (never from events alone);
//   5. negative cases: below MIN sends nothing; a key that is not keeperAttendu is OFF; devOwed above MAX_DEV_BATCH -> batch = MAX.
// Prints each line and n/n; exit 1 on any KO.
import { selecteur } from './keccak.js';
import * as SS from './skins-spin.js';
import * as Slots from './slots-plan.js';
import { SKINS_SPIN_DEPLOIEMENT as R } from './skins-spin-deploiement.js';
import { creerKeeperSpinDev, SEL_PAYDEV } from './spin-dev-keeper.js';

const U = process.env.FORK_RPC || '';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(U)) { console.error('FORK_RPC must be a local fork (http://127.0.0.1:<port>)'); process.exit(2); }
let id = 0;
async function rpc(method, params = []) {
  const r = await fetch(U, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((x) => x.json());
  if (r.error) { const e = new Error(method + ': ' + (r.error.message || JSON.stringify(r.error))); e.data = r.error.data; throw e; }
  return r.result;
}
let ok = 0, ko = 0;
const t = (m, c, x = '') => { if (c) ok++; else ko++; console.log((c ? 'ok  ' : 'KO  ') + m + (x ? ' — ' + x : '')); };
const recu = async (h) => { for (let k = 0; k < 100; k++) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return r; await new Promise((o) => setTimeout(o, 200)); } throw new Error('no receipt ' + h); };
const envoyer = async (x) => { const h = await rpc('eth_sendTransaction', [x]); return { h, r: await recu(h) }; };
const call = async (to, sig, args = '', bloc = 'latest') => rpc('eth_call', [{ to, data: selecteur(sig) + args }, bloc]);
const big = (h) => BigInt(h);
const ua = (a) => String(a).toLowerCase().slice(2).padStart(64, '0');
const u = (x) => BigInt(x).toString(16).padStart(64, '0');
const adrDe = (w) => '0x' + String(w).slice(-40).toLowerCase();
const fin = (code) => { console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green')); process.exit(code ?? (ko ? 1 : 0)); };

/* the pack's router P and vault V, from the app's record (never typed: the noter test forbids the addresses outside the records) */
const { ROUTER: P, VAULT: V } = await import('./economie-pack.js');
// anvil's public test keys #0 and #1 (published in foundry's docs; worthless outside a local fork)
const CLE0 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', ADR0 = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
const CLE1 = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

const chaine = await rpc('eth_chainId');
t('the node is the local fork 127.0.0.1 and serves Base (8453)', /^http:\/\/127\.0\.0\.1:/.test(U) && BigInt(chaine) === 8453n, U + ' · block ' + BigInt(await rpc('eth_blockNumber')));

console.log('— 1. deploy Skins + the new Spin (the page flow, deployer impersonated)');
const W = R.deployeur;
await rpc('anvil_impersonateAccount', [W]); await rpc('anvil_setBalance', [W, '0x8ac7230489e80000']);
const r1 = await SS.etapeSuivante(R, rpc, W, { N: null, hashes: [] });
if (!r1.pret) { t('step 1 offered', false, r1.raison); fin(1); }
const e1 = await envoyer({ from: W, data: r1.data, nonce: r1.nonce, gas: r1.gasEnvoi, value: '0x0' });
const r2 = await SS.etapeSuivante(R, rpc, W, { N: r1.N, hashes: [e1.h] });
if (!r2.pret) { t('step 2 offered', false, r2.raison); fin(1); }
const e2 = await envoyer({ from: W, data: r2.data, nonce: r2.nonce, gas: r2.gasEnvoi, value: '0x0' });
const SP = String(e2.r.contractAddress).toLowerCase();
t('Skins and Spin deployed (status 1 both), Spin code = the frozen build', e1.r.status === '0x1' && e2.r.status === '0x1' && await SS.codeConforme(R.etapes[1], await rpc('eth_getCode', [SP, 'latest'])), 'Spin ' + SP);
const ROUTER = adrDe(await call(SP, 'ROUTER()')), DEST = adrDe(await call(SP, 'DEST()')), TBLOCK = adrDe(await call(SP, 'TBLOCK()'));
const USDC = adrDe(await call(SP, 'USDC()')), DEVW = adrDe(await call(SP, 'DEV_WALLET()'));
const MIN = big(await call(SP, 'MIN_DEV_BATCH()')), MAX = big(await call(SP, 'MAX_DEV_BATCH()')), PRIX = big(await call(SP, 'SPIN_PRICE()')), PART = big(await call(SP, 'DEV_SHARE()'));
const split = String(await call(SP, 'USDC_SPLIT()')).slice(2), DEVBPS = BigInt('0x' + split.slice(64, 128));
t('the Spin pays through the live router P into the holders vault V', ROUTER === P && DEST === V, 'MIN ' + MIN + ' · MAX ' + MAX + ' · price ' + PRIX + ' · dev share/spin ' + PART + ' · devBps ' + DEVBPS + ' · dev wallet ' + DEVW);
t('USDC_SPLIT names DEV_WALLET', adrDe('0x' + split.slice(0, 64)) === DEVW);

console.log('— 2. spins until devOwed >= MIN_DEV_BATCH');
const JOUEUR = '0x000000000000000000000000000000000000b0b2', MINTER = '0x000000000000000000000000000000000000f00f';
const MM = adrDe(await call(USDC, 'masterMinter()'));
for (const a of [JOUEUR, MM, MINTER]) { await rpc('anvil_impersonateAccount', [a]); await rpc('anvil_setBalance', [a, '0x8ac7230489e80000']); }
await envoyer({ from: MM, to: USDC, data: selecteur('configureMinter(address,uint256)') + ua(MINTER) + u(1_000_000_000n) });
await envoyer({ from: MINTER, to: USDC, data: selecteur('mint(address,uint256)') + ua(JOUEUR) + u(100_000_000n) });
const bal = async (tok, a, bloc = 'latest') => big(await call(tok, 'balanceOf(address)', ua(a), bloc));
const devOwed = async (bloc = 'latest') => big(await call(SP, 'devOwed()', '', bloc));
const pot = async (bloc = 'latest') => big(await call(SP, 'pot()', '', bloc));
async function jouer(n) {
  let reste = n, tous = true;
  while (reste > 0) {
    const k = Math.min(reste, 10);
    const p = Slots.planSpins({ contrat: SP, usdc: USDC, n: k, spinPrice: PRIX });
    if (p.etat !== 'PRET') throw new Error('planSpins: ' + JSON.stringify(p));
    for (const x of p.appels) { const e = await envoyer({ from: JOUEUR, to: x.to, data: x.data, gas: '0x2dc6c0' }); if (e.r.status !== '0x1') tous = false; }
    reste -= k;
  }
  return tous;
}
const nMin = Number((MIN + PART - 1n) / PART) + 1; // one more than needed: devOwed strictly above MIN, still under MAX
const okJ = await jouer(nMin);
const d0 = await devOwed();
t(nMin + ' spins with the app encoder: all status 1, MIN <= devOwed < MAX', okJ && d0 >= MIN && d0 < MAX, 'devOwed ' + d0);

console.log('— 3. the keeper (anvil key #0), tour -> receipt -> tour');
await rpc('anvil_setBalance', [ADR0, '0x8ac7230489e80000']);
const codeK = await rpc('eth_getCode', [ADR0, 'latest']);
console.log('     key #0 address ' + ADR0 + ' code on the fork: ' + (codeK === '0x' ? 'none' : String(codeK).slice(0, 52)));
const journal = [];
const K = creerKeeperSpinDev({ cle: CLE0, spin: SP, chaine: BigInt(chaine), keeperAttendu: ADR0, rpc, journal: (l) => journal.push(l) });
t('the keeper is ON as the key #0 address, aimed at the Spin', K.etat().etat === 'ON' && K.etat().adresse === ADR0 && K.etat().cible === SP);

async function mesurerTour(attendu) {
  const av = { owed: await devOwed(), pot: await pot(), dev: await bal(USDC, DEVW), v: await bal(TBLOCK, V), spinUsdc: await bal(USDC, SP), nonceK: big(await rpc('eth_getTransactionCount', [ADR0, 'latest'])) };
  const res = await K.tour();
  t('tour(): one payDev sent', res.fait === true && typeof res.hash === 'string', res.fait ? 'hash ' + res.hash + ' · amount ' + res.montant + ' · minOut ' + res.minOut : res.pourquoi + ' · ' + JSON.stringify(K.etat().erreurs.slice(-2)));
  if (!res.fait) return null;
  const rc = await recu(res.hash);
  const tx = await rpc('eth_getTransactionByHash', [res.hash]);
  const inp = String(tx.input).toLowerCase();
  const montant = BigInt('0x' + inp.slice(10, 74)), minOut = BigInt('0x' + inp.slice(74, 138)), deadline = BigInt('0x' + inp.slice(138, 202));
  const bloc = big(rc.blockNumber), avantBloc = '0x' + (bloc - 1n).toString(16);
  const blk = await rpc('eth_getBlockByNumber', [rc.blockNumber, false]);
  t('tx.from = the keeper, tx.to = the Spin, selector payDev, value 0, signed EIP-1559 on chain 8453, nonce = the keeper\'s',
    String(tx.from).toLowerCase() === ADR0 && String(tx.to).toLowerCase() === SP && inp.startsWith(SEL_PAYDEV) && inp.length === 202 && big(tx.value) === 0n && tx.type === '0x2' && big(tx.chainId) === 8453n && big(tx.nonce) === av.nonceK,
    'type ' + tx.type + ' · nonce ' + big(tx.nonce));
  t('the tx is alone in its block (pre-state = the previous block)', blk.transactions.length === 1 && String(blk.transactions[0]).toLowerCase() === String(res.hash).toLowerCase());
  t('receipt status 0x1', rc.status === '0x1', 'gas used ' + big(rc.gasUsed) + ' of limit ' + big(tx.gas) + ' · block ' + bloc);
  t('calldata amount = the batch expected (' + attendu + ') = the keeper\'s report', montant === attendu && BigInt(res.montant) === attendu && BigInt(res.minOut) === minOut, 'amount ' + montant);
  t('deadline in the future of the block', deadline > big(blk.timestamp), 'deadline ' + deadline + ' · block ts ' + big(blk.timestamp));
  const ap = { owed: await devOwed(), pot: await pot(), dev: await bal(USDC, DEVW), v: await bal(TBLOCK, V), spinUsdc: await bal(USDC, SP) };
  const coupe = (montant * DEVBPS) / 10000n;
  const plancher = big(await call(P, 'minOutFloor(uint256)', u(montant - coupe), avantBloc));
  const plancherApres = big(await call(P, 'minOutFloor(uint256)', u(montant - coupe), rc.blockNumber));
  t('devOwed dropped by exactly the batch', av.owed - ap.owed === montant, av.owed + ' -> ' + ap.owed);
  t('the Spin\'s USDC dropped by exactly the batch', av.spinUsdc - ap.spinUsdc === montant, av.spinUsdc + ' -> ' + ap.spinUsdc);
  t('the dev wallet\'s USDC rose by batch x devBps / 10000', ap.dev - av.dev === coupe, '+' + (ap.dev - av.dev) + ' (expected ' + coupe + ')');
  t('minTblockOut in the calldata >= router.minOutFloor(batch - cut) at the pre-state of the tx', minOut >= plancher && plancher > 0n, 'minOut ' + minOut + ' · floor ' + plancher + ' (floor after the buy: ' + plancherApres + ')');
  t('V\'s TBLOCK rose by >= minTblockOut', ap.v - av.v >= minOut && ap.v > av.v, 'V +' + (ap.v - av.v) + ' TBLOCK raw · margin over minOut ' + (ap.v - av.v - minOut));
  t('the pot is unchanged', ap.pot === av.pot, 'pot ' + ap.pot);
  return { hash: res.hash, montant, coupe, versV: ap.v - av.v, minOut, plancher, gas: big(rc.gasUsed), reste: ap.owed };
}

const m1 = await mesurerTour(d0);
if (!m1) fin(1);
const tr2 = await K.tour();
const et = K.etat();
t('second tour() follows the tx in flight: counted included, nothing sent', tr2.fait === false && et.enVol === null && et.compteurs.inclus === 1 && et.compteurs.envois === 1 && et.dernier && et.dernier.hash === m1.hash, tr2.pourquoi);
t('and with devOwed now below MIN (' + m1.reste + ') it says so', /below MIN_DEV_BATCH/.test(tr2.pourquoi || ''));
const nApres = big(await rpc('eth_getTransactionCount', [ADR0, 'latest']));
const tr3 = await K.tour();
t('a further tour() below MIN sends nothing (nonce unchanged, envois still 1)', tr3.fait === false && big(await rpc('eth_getTransactionCount', [ADR0, 'latest'])) === nApres && K.etat().compteurs.envois === 1, tr3.pourquoi);

console.log('— 4. a key that is not keeperAttendu');
const ADR1 = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8', n1Avant = big(await rpc('eth_getTransactionCount', [ADR1, 'latest'])), owedX = await devOwed();
const Kx = creerKeeperSpinDev({ cle: CLE1, spin: SP, chaine: BigInt(chaine), keeperAttendu: ADR0, rpc });
const ex = Kx.etat(), rx = await Kx.tour();
t('the keeper with key #1 but keeperAttendu = #0 is OFF and sends nothing', ex.etat === 'OFF' && rx.fait === false && /is not the gas-only keeper/.test(ex.pourquoi) && !JSON.stringify(ex).includes(CLE1.slice(2)), ex.pourquoi);
t('no tx from the key #1 address and devOwed untouched', big(await rpc('eth_getTransactionCount', [ADR1, 'latest'])) === n1Avant && await devOwed() === owedX, 'nonce ' + n1Avant);

console.log('— 5. devOwed above MAX_DEV_BATCH -> the batch is exactly MAX');
const nMax = Number((MAX - m1.reste) / PART) + 2;
const okM = await jouer(nMax);
const d1 = await devOwed();
t(nMax + ' more spins: all status 1, devOwed > MAX_DEV_BATCH', okM && d1 > MAX, 'devOwed ' + d1);
const m2 = await mesurerTour(MAX);
if (m2) {
  t('after the MAX batch, devOwed = what was above MAX', m2.reste === d1 - MAX, 'left ' + m2.reste);
  const tr4 = await K.tour();
  t('the next tour follows it and, below MIN, sends nothing', tr4.fait === false && K.etat().compteurs.inclus === 2 && K.etat().compteurs.envois === 2 && /below MIN_DEV_BATCH/.test(tr4.pourquoi || ''), tr4.pourquoi);
}
t('the keeper ends ON, no failure, no guard refusal, no unread simulation', K.etat().etat === 'ON' && K.etat().echecsSuite === 0 && K.etat().compteurs.gardes === 0 && K.etat().compteurs.simulationsNonLues === 0 && K.etat().erreurs.length === 0, JSON.stringify(K.etat().compteurs));

console.log('— measured');
for (const [nom, m] of [['batch 1 (devOwed < MAX)', m1], ['batch 2 (devOwed > MAX)', m2]]) {
  if (!m) continue;
  console.log('     ' + nom + ': batch ' + m.montant + ' · dev cut ' + m.coupe + ' USDC raw · TBLOCK to V ' + m.versV + ' · minTblockOut ' + m.minOut + ' · floor ' + m.plancher + ' · gas used ' + m.gas + ' · tx ' + m.hash);
}
fin();
