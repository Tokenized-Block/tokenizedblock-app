/* banc-renounce-admin-fork-20261112.mjs — giving up a block's admin role, on a LOCAL base-anvil fork of Base, with the live hook 7030.
 *
 * Usage : "C:\Users\VolKov\.foundry\versions\base-v1.1.1\anvil.exe" --base --fork-url https://mainnet.base.org --port 9987
 *         node banc-renounce-admin-fork-20261112.mjs http://127.0.0.1:9987
 * ⛔ FORK LOCAL ONLY (loopback + anvil + chain 8453 checked before anything is sent). NO KEY: Grok's wallet (the admin of its three
 *   blocks, read by hasRole) is IMPERSONATED by the fork. Every branch starts from the same snapshot and everything is reverted at the end.
 *
 * STEP 1 — what the admin role is used for, measured (the page's sentence depends on it):
 *   A  admin today: the app's own add-pair plan (ajouter-paire.js planAjouterPaire, UNIT/AAPLc next to UNIT/ETH) executed call by call.
 *   B  a NON-admin wallet: the planner's answer, then the SAME calls replayed from it (status and revert data of each).
 *   C  after the renounce batch: the planner's answer for Grok's wallet, then the same calls replayed from it.
 *   D  what else changes: the same sequence (buy UNIT with ETH, sell UNIT for ETH, creator share accrued and claimed, re-escrow, withdrawal
 *      request, withdrawal after the hook's delay) run on the branch BEFORE and on the branch AFTER the renounce; every amount compared.
 * STEP 2 — the renounce itself, through renounce-admin.js: the blocks offered to the wallet, the eth_simulateV1 proof, the six calls sent
 *   in order (impersonated), each receipt judged by checkSent (tx.from, to, data, status, the block's own role log), hasRole re-read, then
 *   updateSupplyCap / grantRole(MINT) / revokeRole(dEaD) from the old admin and renounceRole by dEaD itself all revert.
 * serie-delai-s: 900 */
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, f)).href);
const RA = await imp('renounce-admin.js');
const L = await imp('lancer-pool.js'), T = await imp('tokenomics.js'), F = await imp('frais-creation.js'), PA = await imp('paires.js');
const AERO = await imp('pools-actions-aerodrome.js'), AP = await imp('ajouter-paire.js');
const { poolId, cleDePool, encodeApprove, encodePermit2Approve, encodeSwapExactInSingle, SANS_MINHOP } = await imp('pool.js');
const { selecteur } = await imp('keccak.js'); /* WITH its 0x (pool.js selecteur has none) */

const URL_FORK = process.argv[2] || 'http://127.0.0.1:9987';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_FORK)) { console.log('KO the fork must be a local http address: nothing is sent'); process.exit(1); }
let n = 0, ko = 0, idRpc = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const brut = async (method, params) => (await fetch(URL_FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method, params }) })).json();
const rpc = async (method, params) => { const r = await brut(method, params); if (r.error) { const e = new Error(r.error.message); e.data = r.error.data; throw e; } return r.result; };
const pad = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
const hx = (v) => BigInt(v).toString(16).padStart(64, '0');
const lireU = async (to, data) => BigInt(await rpc('eth_call', [{ to, data }, 'latest']));
const lire = (to, sig, args = '') => rpc('eth_call', [{ to, data: selecteur(sig) + args }, 'latest']);
const ETH = '0x0000000000000000000000000000000000000000';
const solde = async (jeton, qui) => (jeton === ETH ? BigInt(await rpc('eth_getBalance', [qui, 'latest'])) : lireU(jeton, '0x70a08231' + pad(qui)));
const H = T.HOOK_7030, V = L.V4_ADRESSES[8453], UR = L.ROUTEUR_V4[8453];
/* Grok's three blocks, copied from verif-roles-377.json (hasRole re-read below on the fork, never assumed) */
const BLOCKS = ['0xb2000000000000000000007afa7ed748b0874f27', '0xb2000000000000000000001e784d3883f4a03f35', '0xb2000000000000000000000b1e6268211b153f2f'];
const UNIT = BLOCKS[0];
const AUTRE = '0xb20000000000000000000005090fb1d9da0e5949'; /* a block of our births whose admin is another wallet (verif-roles-377.json) */
const AAPL = PA.ACTIONS_COINBASE.find((a) => a.symbole === 'AAPLc').adr.toLowerCase();
const POOL_AAPL_AERO = [...AERO.POOLS_ACTIONS_AERODROME.entries()].find(([adr]) => adr.toLowerCase() === AAPL)[1].pool;
const MONTANT_DEVISE = 5000000n;
const NON_ADMIN = '0x' + 'a11ce'.padEnd(40, '7');
const ACHETEUR = '0x' + 'b0b0'.padEnd(40, '3');
const ACHAT_WEI = 10n ** 14n;
const sel4 = (e) => String((e && e.data) || '').slice(0, 10).toLowerCase();
const PAS_ADMIN = selecteur('PasAdminDuBlock()');

async function envoyer(de, tx) {
  let gas = 8000000n;
  try { gas = BigInt(await rpc('eth_estimateGas', [{ from: de, to: tx.to, data: tx.data || '0x', value: tx.value || '0x0' }])) * 13n / 10n; } catch (_) { /* a revert: sent anyway to READ its status 0 */ }
  const baseFee = BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).baseFeePerGas || '0x0');
  const h = await rpc('eth_sendTransaction', [{ from: de, to: tx.to, data: tx.data || '0x', value: tx.value || '0x0', gas: '0x' + gas.toString(16),
    maxFeePerGas: '0x' + (baseFee * 2n + 1000000n).toString(16), maxPriorityFeePerGas: '0x' + (1000000n).toString(16) }]);
  for (let i = 0; i < 100; i += 1) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return { h, status: r.status, gas: BigInt(r.gasUsed), prix: BigInt(r.effectiveGasPrice), logs: r.logs || [], recu: r }; await new Promise((o) => setTimeout(o, 100)); }
  throw new Error('receipt never came for ' + h);
}
const revertDe = async (de, tx) => { try { await rpc('eth_call', [{ from: de, to: tx.to, data: tx.data, value: tx.value || '0x0' }, 'latest']); return 'PASSES'; } catch (e) { return sel4(e) || ('ERR ' + String(e.message).slice(0, 60)); } };
const keyWords = (k) => pad(k.currency0) + pad(k.currency1) + hx(k.fee) + hx(k.tickSpacing) + pad(k.hooks);
const sigKey = '(address,address,uint24,int24,address)';

/* ── the fork ── */
const client = String(await rpc('web3_clientVersion', []));
const chaine = parseInt(await rpc('eth_chainId', []), 16);
if (!/^anvil\b/i.test(client) || chaine !== 8453) { console.log('KO not an anvil fork of Base (' + client.slice(0, 30) + ', chain ' + chaine + '): nothing is sent'); process.exit(1); }
const tete = parseInt(await rpc('eth_blockNumber', []), 16);
console.log('fork ' + URL_FORK + ' · ' + client.split(' ')[0] + ' · block ' + tete + ' · hook ' + H);
ok((await rpc('eth_getCode', [H, 'latest'])).length > 1000, 'the fork carries the deployed hook 7030');
ok(String(L.PROPRIETAIRE_PERMANENT).toLowerCase() === RA.DEAD.toLowerCase(), 'renounce-admin DEAD = lancer-pool PROPRIETAIRE_PERMANENT (' + RA.DEAD + ')');
const S0 = await rpc('evm_snapshot', []);
const M = {}; /* measures printed at the end */
let S = null;

async function financer(qui, montant) {
  await rpc('anvil_impersonateAccount', [POOL_AAPL_AERO]);
  await rpc('anvil_setBalance', [POOL_AAPL_AERO, '0x' + (10n ** 18n).toString(16)]);
  const r = await envoyer(POOL_AAPL_AERO, { to: AAPL, data: '0xa9059cbb' + pad(qui) + hx(montant) });
  await rpc('anvil_stopImpersonatingAccount', [POOL_AAPL_AERO]);
  return r.status === '0x1';
}
async function rejouer(de, appels) {
  await rpc('anvil_impersonateAccount', [de]);
  const out = [];
  for (const a of appels) {
    const rv = await revertDe(de, a);
    const r = await envoyer(de, a);
    out.push({ nom: a.nom, status: r.status, revert: r.status === '0x1' ? null : rv });
  }
  await rpc('anvil_stopImpersonatingAccount', [de]);
  return out;
}

/** the renounce through the module: rows read, simulated, sent call by call from the wallet, each receipt judged, roles re-read */
async function renoncer(wallet) {
  const lu = await RA.readWallet({ rpc, wallet, candidates: [...BLOCKS, AUTRE] });
  const sim = await RA.simulate({ rpc, wallet, rows: lu.offered });
  const calls = RA.batchFor(lu.offered, wallet);
  await rpc('anvil_impersonateAccount', [wallet]);
  const juges = [];
  for (const c of calls) {
    const r = await envoyer(wallet, c);
    const tx = await rpc('eth_getTransactionByHash', [r.h]);
    juges.push({ c, r, tx, ko: RA.checkSent({ call: c, wallet, tx, receipt: r.recu }) });
  }
  await rpc('anvil_stopImpersonatingAccount', [wallet]);
  const apres = [];
  for (const b of BLOCKS) apres.push(await RA.readAfter({ rpc, block: b, wallet }));
  return { lu, sim, calls, juges, apres };
}

/** the same market / creator sequence on the current branch: returns every amount */
async function sequenceMarche(G) {
  const cleEth = cleDePool(ETH, UNIT, { fee: L.FEE_POOL, tickSpacing: L.TICK_SPACING_POOL, hooks: H });
  const idEth = poolId(cleEth);
  const kw = keyWords(cleEth);
  const duC = async () => BigInt('0x' + String(await lire(H, 'comptes(bytes32)', idEth.slice(2))).slice(2, 66));
  const out = {};
  out.createurActifAvant = await lireU(H, selecteur('createurActif(bytes32)') + idEth.slice(2));
  await rpc('anvil_setBalance', [ACHETEUR, '0x' + (10n ** 18n).toString(16)]);
  await rpc('anvil_impersonateAccount', [ACHETEUR]);
  const exp = BigInt(Math.floor(Date.now() / 1000) + 86400 * 30);
  const u0 = await solde(UNIT, ACHETEUR), d0 = await duC();
  const buy = await envoyer(ACHETEUR, { to: UR, value: '0x' + ACHAT_WEI.toString(16), data: encodeSwapExactInSingle({ cle: cleEth, zeroForOne: true, montant: ACHAT_WEI, sortieMin: 1n, deadline: exp, forme: SANS_MINHOP }) });
  out.buyStatus = buy.status; out.unitOut = (await solde(UNIT, ACHETEUR)) - u0; out.shareFromBuy = (await duC()) - d0;
  const vend = out.unitOut / 2n;
  const a1 = await envoyer(ACHETEUR, { to: UNIT, data: encodeApprove(L.PERMIT2, vend) });
  const a2 = await envoyer(ACHETEUR, { to: L.PERMIT2, data: encodePermit2Approve(UNIT, UR, vend, exp) });
  const e0 = await solde(ETH, ACHETEUR), d1 = await duC();
  const sell = await envoyer(ACHETEUR, { to: UR, data: encodeSwapExactInSingle({ cle: cleEth, zeroForOne: false, montant: vend, sortieMin: 1n, deadline: exp, forme: SANS_MINHOP }) });
  out.sellApprovals = a1.status + '/' + a2.status; out.sellStatus = sell.status; out.unitSold = vend;
  out.ethOut = (await solde(ETH, ACHETEUR)) - e0 + sell.gas * sell.prix; out.shareFromSell = (await duC()) - d1;
  /* reclamer: anyone may push the creator share to the creator */
  const g0 = await solde(ETH, G), du = await duC();
  const recl = await envoyer(ACHETEUR, { to: H, data: selecteur('reclamer(' + sigKey + ')') + kw });
  out.reclamerStatus = recl.status; out.shareOwed = du; out.creatorGot = (await solde(ETH, G)) - g0;
  await rpc('anvil_stopImpersonatingAccount', [ACHETEUR]);
  /* the creator: re-escrow a little, ask to withdraw, wait the hook's delay, withdraw */
  await rpc('anvil_setBalance', [G, '0x' + (10n ** 18n).toString(16)]);
  await rpc('anvil_impersonateAccount', [G]);
  const c0 = await lireU(H, selecteur('caution(bytes32)') + idEth.slice(2));
  const rech = await envoyer(G, { to: H, value: '0x3e8', data: selecteur('recharger(' + sigKey + ',uint128)') + kw + hx(1000n) });
  const c1 = await lireU(H, selecteur('caution(bytes32)') + idEth.slice(2));
  const dem = await envoyer(G, { to: H, data: selecteur('demanderRetrait(' + sigKey + ')') + kw });
  out.actifApresDemande = await lireU(H, selecteur('createurActif(bytes32)') + idEth.slice(2));
  const delai = await lireU(H, selecteur('DELAI_RETRAIT()'));
  await rpc('evm_increaseTime', ['0x' + (delai + 1n).toString(16)]); await rpc('evm_mine', []);
  const g1 = await solde(ETH, G);
  const ret = await envoyer(G, { to: H, data: selecteur('retirerCaution(' + sigKey + ')') + kw });
  await rpc('anvil_stopImpersonatingAccount', [G]);
  out.cautionBefore = c0; out.rechargerStatus = rech.status; out.cautionAfterRecharge = c1; out.demanderStatus = dem.status;
  out.retirerStatus = ret.status; out.withdrawn = (await solde(ETH, G)) - g1 + ret.gas * ret.prix; out.delaiS = delai;
  return out;
}

try {
  /* ── who is the admin, read on the fork ── */
  const cleEth = cleDePool(ETH, UNIT, { fee: L.FEE_POOL, tickSpacing: L.TICK_SPACING_POOL, hooks: H });
  const G = ('0x' + String(await lire(H, 'createurs(bytes32)', poolId(cleEth).slice(2))).slice(26, 66)).toLowerCase();
  ok(/^0x[0-9a-f]{40}$/.test(G) && !/^0x0{40}$/.test(G), 'creator of UNIT/ETH read at the hook: ' + G);
  for (const b of BLOCKS) ok(await lireU(b, RA.SEL.hasRole + pad(RA.DEFAULT_ADMIN_ROLE) + pad(G)) === 1n, 'hasRole(DEFAULT_ADMIN_ROLE, ' + G.slice(0, 8) + '…) = 1 on ' + b);
  ok(await lireU(AUTRE, RA.SEL.hasRole + pad(RA.DEFAULT_ADMIN_ROLE) + pad(G)) === 0n, 'witness: not admin of ' + AUTRE);
  ok(await revertDe(G, { to: UNIT, data: RA.encodeRenounce(G) }) === RA.ERR.LAST_ADMIN, 'today: renounceRole ALONE from the admin reverts LastAdminCannotRenounce (0x361513e7)');
  ok(await revertDe(G, { to: UNIT, data: RA.SEL.updateSupplyCap + hx(2n ** 100n) }) === 'PASSES', 'today: updateSupplyCap(2^100) from the admin passes (eth_call)');

  /* ═══ STEP 1 A — the add-pair plan from the admin, today ═══ */
  console.log('— 1A: the app\'s add-pair plan (UNIT/AAPLc) from the admin, today');
  ok(await financer(G, MONTANT_DEVISE * 2n), 'fork: the admin gets test AAPLc');
  await rpc('anvil_setBalance', [G, '0x' + (10n ** 17n).toString(16)]);
  const maint = Number(BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp)) * 1000;
  const planA = await AP.planAjouterPaire({ rpc, compte: G, block: UNIT, devise: AAPL, montantDevise: MONTANT_DEVISE, maintenant: maint });
  console.log('   plan ' + planA.etat + ' — ' + planA.pourquoi);
  ok(planA.etat === 'APPROBATIONS' && (planA.appels || []).length >= 3, '1A plan ' + planA.etat + ', ' + (planA.appels || []).length + ' calls: ' + (planA.appels || []).map((a) => a.nom).join(' | '));
  const ins = (planA.appels || []).find((a) => String(a.to).toLowerCase() === H.toLowerCase());
  ok(!!ins, '1A the plan registers on the hook (' + (ins && ins.nom) + ')');
  const rA = await rejouer(G, planA.appels);
  rA.forEach((x) => console.log('   ' + x.status + ' ' + x.nom + (x.revert ? ' revert ' + x.revert : '')));
  const idN = poolId(cleDePool(AAPL, UNIT, { fee: L.FEE_POOL, tickSpacing: L.TICK_SPACING_POOL, hooks: H }));
  const creaN = ('0x' + String(await lire(H, 'createurs(bytes32)', idN.slice(2))).slice(26, 66)).toLowerCase();
  ok(rA.every((x) => x.status === '0x1') && creaN === G, '1A all ' + rA.length + ' calls pass; UNIT/AAPLc opened, its creator at the hook = the admin');
  M.step1A = rA.map((x) => x.status);
  await rpc('evm_revert', [S0]);
  S = await rpc('evm_snapshot', []);

  /* ═══ STEP 1 B — a non-admin wallet ═══ */
  console.log('— 1B: a non-admin wallet ' + NON_ADMIN);
  ok(await financer(NON_ADMIN, MONTANT_DEVISE * 2n), 'fork: the non-admin gets test AAPLc');
  await rpc('anvil_setBalance', [NON_ADMIN, '0x' + (10n ** 17n).toString(16)]);
  const planB = await AP.planAjouterPaire({ rpc, compte: NON_ADMIN, block: UNIT, devise: AAPL, montantDevise: MONTANT_DEVISE, maintenant: maint });
  ok(planB.etat === 'REFUSE' && !(planB.appels || []).length, '1B the planner refuses the non-admin, nothing to sign: "' + planB.pourquoi + '"');
  const rB = await rejouer(NON_ADMIN, planA.appels);
  rB.forEach((x) => console.log('   ' + x.status + ' ' + x.nom + (x.revert ? ' revert ' + x.revert : '')));
  const insB = rB.find((x) => x.nom === ins.nom);
  ok(insB && insB.status === '0x0' && insB.revert === PAS_ADMIN, '1B the admin\'s registration call replayed from the non-admin: status 0, revert ' + (insB && insB.revert) + ' = PasAdminDuBlock() ' + PAS_ADMIN);
  ok(rB[rB.length - 1].status === '0x0', '1B the pool opening (last call) replayed from the non-admin: status 0, revert ' + rB[rB.length - 1].revert);
  ok(BigInt('0x' + String(await lire(V.stateView, 'getSlot0(bytes32)', idN.slice(2))).slice(2, 66)) === 0n, '1B UNIT/AAPLc does not exist');
  M.step1B = { planner: planB.pourquoi, replay: rB.map((x) => x.nom + ':' + x.status + (x.revert ? ':' + x.revert : '')) };
  await rpc('evm_revert', [S]); S = await rpc('evm_snapshot', []);

  /* ═══ witness: the batch in the WRONG order fails at its first call ═══ */
  const rev = await rpc('eth_simulateV1', [{ blockStateCalls: [{ calls: [{ from: G, to: UNIT, data: RA.encodeRenounce(G) }, { from: G, to: UNIT, data: RA.encodeGrantDead() }] }], validation: false }, 'latest']);
  const r0 = rev[0].calls[0];
  ok(r0.status === '0x0' && String((r0.error && r0.error.data) || r0.returnData).slice(0, 10) === RA.ERR.LAST_ADMIN, 'witness: renounce THEN grant (reversed) — the renounce reverts LastAdminCannotRenounce in eth_simulateV1');
  const nonOrdre = await rpc('eth_simulateV1', [{ blockStateCalls: [{ calls: [{ from: G, to: UNIT, data: RA.SEL.grantRole + pad(RA.DEFAULT_ADMIN_ROLE) + pad(G) }, { from: G, to: UNIT, data: RA.encodeRenounce(G) }, { from: G, to: UNIT, data: RA.SEL.hasRole + pad(RA.DEFAULT_ADMIN_ROLE) + pad(G) }] }], validation: false }, 'latest']);
  ok(nonOrdre[0].calls[1].status === '0x0' && BigInt(nonOrdre[0].calls[2].returnData) === 1n, 'witness: dEaD replaced by the wallet itself — the renounce reverts and the wallet stays admin');

  /* ═══ witness: a second admin makes renounce-alone pass (LastAdminCannotRenounce really means "last") ═══ */
  const deux = await rpc('eth_simulateV1', [{ blockStateCalls: [{ calls: [{ from: G, to: UNIT, data: RA.SEL.grantRole + pad(RA.DEFAULT_ADMIN_ROLE) + pad(NON_ADMIN) }, { from: G, to: UNIT, data: RA.encodeRenounce(G) }, { from: NON_ADMIN, to: UNIT, data: RA.SEL.updateSupplyCap + hx(2n ** 100n) }] }], validation: false }, 'latest']);
  ok(deux[0].calls[1].status === '0x1' && deux[0].calls[2].status === '0x1', 'witness: with ANOTHER admin, renounce alone passes and that admin can still raise the cap (why the page proves dEaD is the last admin)');

  /* ═══ the market sequence BEFORE the renounce ═══ */
  console.log('— 1D (before): buy, sell, creator share, re-escrow, withdrawal');
  const avant = await sequenceMarche(G);
  console.log('   ' + JSON.stringify(avant, (k, v) => (typeof v === 'bigint' ? String(v) : v)));
  await rpc('evm_revert', [S]); S = await rpc('evm_snapshot', []);

  /* ═══ STEP 2 — the renounce through renounce-admin.js ═══ */
  console.log('— 2: the renounce batch for ' + G);
  const R = await renoncer(G);
  ok(R.lu.offered.length === 3 && R.lu.offered.every((r) => BLOCKS.includes(r.block)), 'readWallet offers exactly the 3 blocks: ' + R.lu.offered.map((r) => r.symbol + ' ' + r.block).join(', '));
  ok(R.lu.rows.find((r) => r.block === AUTRE).state === 'NOT_ADMIN', 'readWallet: ' + AUTRE + ' (another admin) = NOT_ADMIN, not offered');
  ok(R.lu.offered.every((r) => r.totalSupply === r.supplyCap && r.walletMint === false && r.walletBurn === false && r.deadIsAdmin === false), 'each: supply = cap (' + R.lu.offered[0].supplyCap + '), no mint/burn role, dEaD not yet admin');
  ok(R.sim.method === 'eth_simulateV1' && R.sim.ok, 'simulation ' + R.sim.method + ': ' + (R.sim.ok ? 'every line holds' : 'FAILED'));
  R.sim.blocks.forEach((b) => b.lines.forEach((l) => console.log('   ' + (l.ok ? 'ok ' : 'KO ') + b.block.slice(-6) + ' ' + l.text)));
  ok(R.calls.length === 6 && R.calls.every((c, k) => c.data.startsWith(k % 2 === 0 ? RA.SEL.grantRole : RA.SEL.renounceRole)), 'six calls, grant then renounce for each block');
  R.juges.forEach((j) => console.log('   ' + j.r.status + ' ' + String(j.r.gas).padStart(6) + ' gas  ' + j.c.to.slice(-6) + ' ' + j.c.name + (j.ko.length ? '  KO ' + j.ko.join('; ') : '')));
  ok(R.juges.every((j) => j.r.status === '0x1' && j.ko.length === 0), 'every receipt judged by checkSent: tx.from = the wallet, to = the block, data = the call, status 1, the role log from the block');
  ok(R.apres.every((a) => a.done && a.you === false && a.dead === true), 'hasRole re-read: the wallet holds the admin role on none, dEaD on all three');
  /* a mutant of the receipt check: a log named by another sender must not pass */
  const j0 = R.juges[0];
  const faux = { ...j0.r.recu, logs: j0.r.recu.logs.map((l) => ({ ...l, topics: [...l.topics.slice(0, 3), '0x' + pad(NON_ADMIN)] })) };
  ok(RA.checkSent({ call: j0.c, wallet: G, tx: j0.tx, receipt: faux }).length > 0, 'witness: the same receipt with the log\'s sender changed is refused');
  ok(RA.checkSent({ call: j0.c, wallet: G, tx: { ...j0.tx, from: NON_ADMIN }, receipt: j0.r.recu }).length > 0, 'witness: the same receipt with another tx.from is refused');

  for (const b of BLOCKS) {
    const cap = await revertDe(G, { to: b, data: RA.SEL.updateSupplyCap + hx(2n ** 100n) });
    const mint = await revertDe(G, { to: b, data: RA.SEL.grantRole + pad(RA.MINT_ROLE) + pad(G) });
    const rvk = await revertDe(G, { to: b, data: RA.SEL.revokeRole + pad(RA.DEFAULT_ADMIN_ROLE) + pad(RA.DEAD) });
    const dead = await revertDe(RA.DEAD, { to: b, data: RA.encodeRenounce(RA.DEAD) });
    ok(cap === RA.ERR.UNAUTHORIZED && mint === RA.ERR.UNAUTHORIZED && rvk === RA.ERR.UNAUTHORIZED && dead === RA.ERR.LAST_ADMIN,
      b.slice(-6) + ' after: updateSupplyCap ' + cap + ', grantRole(MINT, old admin) ' + mint + ', revokeRole(dEaD) ' + rvk + ', renounce by dEaD itself ' + dead);
  }
  await rpc('anvil_impersonateAccount', [G]);
  const capTx = await envoyer(G, { to: UNIT, data: RA.SEL.updateSupplyCap + hx(2n ** 100n) });
  const mintTx = await envoyer(G, { to: UNIT, data: RA.SEL.grantRole + pad(RA.MINT_ROLE) + pad(G) });
  await rpc('anvil_stopImpersonatingAccount', [G]);
  ok(capTx.status === '0x0' && mintTx.status === '0x0' && await lireU(UNIT, RA.SEL.supplyCap) === R.lu.offered[0].supplyCap, 'sent from the old admin: updateSupplyCap status 0, grantRole(MINT) status 0, cap unchanged');
  const encore = await RA.readWallet({ rpc, wallet: G, candidates: [...BLOCKS, AUTRE] });
  ok(encore.offered.length === 0 && encore.admin.length === 0, 'readWallet after: admin of none, nothing offered (the page refuses this wallet)');

  /* ═══ STEP 1 C — after the renounce ═══ */
  console.log('— 1C: the add-pair plan from the same wallet, after the renounce');
  ok(await financer(G, MONTANT_DEVISE * 2n), 'fork: the old admin gets test AAPLc again');
  await rpc('anvil_setBalance', [G, '0x' + (10n ** 17n).toString(16)]);
  const planC = await AP.planAjouterPaire({ rpc, compte: G, block: UNIT, devise: AAPL, montantDevise: MONTANT_DEVISE, maintenant: maint });
  ok(planC.etat === 'REFUSE' && !(planC.appels || []).length, '1C the planner refuses the old admin, nothing to sign: "' + planC.pourquoi + '"');
  const rC = await rejouer(G, planA.appels);
  rC.forEach((x) => console.log('   ' + x.status + ' ' + x.nom + (x.revert ? ' revert ' + x.revert : '')));
  const insC = rC.find((x) => x.nom === ins.nom);
  ok(insC && insC.status === '0x0' && insC.revert === PAS_ADMIN, '1C the registration call replayed from the old admin: status 0, revert ' + (insC && insC.revert) + ' = PasAdminDuBlock()');
  ok(BigInt('0x' + String(await lire(V.stateView, 'getSlot0(bytes32)', idN.slice(2))).slice(2, 66)) === 0n, '1C UNIT/AAPLc does not exist');
  /* the plain inscrire (no creator deposit) is gated the same way */
  const fv = await lireU(H, selecteur('fraisVie()')), fc = await lireU(H, selecteur('fraisCreation()'));
  const sqrtP = BigInt('0x' + String(await lire(V.stateView, 'getSlot0(bytes32)', poolId(cleEth).slice(2))).slice(2, 66));
  const cleTs = cleDePool(ETH, UNIT, { fee: 3000, tickSpacing: 60, hooks: H });
  const inscrire = await revertDe(G, { to: H, value: '0x' + (fv + fc).toString(16), data: selecteur('inscrire(' + sigKey + ',uint160)') + keyWords(cleTs) + hx(sqrtP) });
  ok(inscrire === PAS_ADMIN, '1C hook.inscrire (no deposit) for a new UNIT/ETH key from the old admin: revert ' + inscrire);
  M.step1C = { planner: planC.pourquoi, replay: rC.map((x) => x.nom + ':' + x.status + (x.revert ? ':' + x.revert : '')), inscrire };

  /* ═══ the market sequence AFTER the renounce (same start state, roles only differ) ═══ */
  console.log('— 1D (after): the same sequence');
  await rpc('evm_revert', [S]); S = await rpc('evm_snapshot', []);
  await renoncer(G);
  ok(!(await RA.readAfter({ rpc, block: UNIT, wallet: G })).you, '1D branch: the renounce applied again from the same snapshot');
  const apres = await sequenceMarche(G);
  console.log('   ' + JSON.stringify(apres, (k, v) => (typeof v === 'bigint' ? String(v) : v)));
  ok(avant.buyStatus === '0x1' && apres.buyStatus === '0x1' && avant.unitOut === apres.unitOut && apres.unitOut > 0n, '1D buy UNIT for ' + ACHAT_WEI + ' wei: status 1 before and after, same UNIT out (' + apres.unitOut + ')');
  ok(avant.sellStatus === '0x1' && apres.sellStatus === '0x1' && avant.ethOut === apres.ethOut && apres.ethOut > 0n, '1D sell ' + apres.unitSold + ' UNIT: status 1 before and after, same ETH out (' + apres.ethOut + ' wei)');
  ok(avant.createurActifAvant === 1n && apres.createurActifAvant === 1n, '1D createurActif(UNIT/ETH) = 1 before and after the renounce');
  ok(avant.shareFromBuy === apres.shareFromBuy && apres.shareFromBuy > 0n && avant.shareFromSell === apres.shareFromSell, '1D creator share accrued: buy +' + apres.shareFromBuy + ' wei, sell +' + apres.shareFromSell + ' — same before and after');
  ok(avant.reclamerStatus === '0x1' && apres.reclamerStatus === '0x1' && apres.creatorGot === apres.shareOwed && avant.creatorGot === avant.shareOwed && apres.shareOwed > 0n, '1D reclamer: the creator receives the share owed (' + apres.creatorGot + ' wei) before and after');
  ok(apres.rechargerStatus === '0x1' && apres.cautionAfterRecharge === apres.cautionBefore + 1000n && avant.cautionAfterRecharge === apres.cautionAfterRecharge, '1D recharger (re-escrow 1000 wei): status 1, deposit ' + apres.cautionBefore + ' -> ' + apres.cautionAfterRecharge + ', same before and after');
  ok(apres.demanderStatus === '0x1' && apres.actifApresDemande === 0n && avant.actifApresDemande === 0n, '1D demanderRetrait: status 1, the share stops (createurActif 0) — same before and after');
  ok(apres.retirerStatus === '0x1' && apres.withdrawn === apres.cautionAfterRecharge && avant.withdrawn === apres.withdrawn, '1D retirerCaution after ' + apres.delaiS + ' s: status 1, the creator gets the whole deposit back (' + apres.withdrawn + ' wei) — same before and after');
  M.step1D = { avant, apres };
} catch (e) {
  ko += 1; console.log('KO  ' + String((e && e.stack) || e).slice(0, 600));
} finally {
  await rpc('evm_revert', [S || S0]).catch(() => null);
}
console.log('MEASURES ' + JSON.stringify(M, (k, v) => (typeof v === 'bigint' ? String(v) : v)));
console.log(ko ? 'KO ' + ko + '/' + n + ' — banc-renounce-admin-fork' : 'ok banc-renounce-admin-fork - ' + n + ' assertions');
process.exit(ko ? 1 : 0);
