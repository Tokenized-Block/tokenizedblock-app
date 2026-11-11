/* banc-ousd-vers-block-fork.mjs — UN PORTEUR D OUSD PEUT-IL ACHETER UN BLOCK, EN UNE TRANSACTION ?
 *
 * ⭐⭐ LE DEBLOCAGE VISE. OUSD n a QUE des pools Uniswap V4 (0 pool Aerodrome sur les NEUF
 *   espacements declares). Mais USDC/ETH a QUATRE pools V4, et nos blocks sont appaires a l ETH
 *   NATIF en V4. Donc la route
 *       OUSD -> USDC -> ETH -> block
 *   tient ENTIEREMENT dans UNE factory, donc en UN seul appel : une institution qui tient de l OUSD
 *   peut acheter un de nos blocks sans jamais toucher a de l ETH.
 *
 * ⛔⛔ QUATRE CONDITIONS, PAS TROIS, ET PAS « ABSENCE DE REVERT » :
 *     1. le recu dit `status 0x1` — et on ATTEND le recu, un `null` n est pas un echec ;
 *     2. le solde du BLOCK chez l acheteur a monte, d au moins le minimum ANNONCE ;
 *     3. a6cf a encaisse EXACTEMENT notre part — « a peu pres » ne compte pas ;
 *     4. l acheteur a bien DEPENSE le montant total — sans elle, un swap qui ne depense rien
 *        passerait les trois autres.
 *   `fork-rig-trois-conditions` : un banc peut etre VERT sur une transaction `status 0x0`.
 *
 * ⛔ FORK LOCAL UNIQUEMENT. Le banc refuse de demarrer si le noeud n est pas en 127.0.0.1.
 */
import { planEchangeMultiSauts } from './echange.js';
import { cleDePool, poolId, selecteur } from './pool.js';
import { vieDuBlock } from './marche.js';
import { CLES_PRIX } from './prix-eth.js';
import { TBLOCK_TEST_ANCIEN as TBLOCK } from './tokenomics.js'; /* game354: this bench measures the OLD test token's legacy ETH route */
import { FEE_WALLET } from './frais-creation.js';

const F = process.env.FORK || 'http://127.0.0.1:8548';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const OUSD = '0xB2000000000000000000002fEb517dFeC7415344';
const ETH = '0x0000000000000000000000000000000000000000';
const SV = '0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71';
const ACHETEUR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const CENT_OUSD = 100000000n;

let n = 0, ko = 0;
function ok(nom, cond, vu) {
  n += 1;
  if (cond) { console.log('  ok   ' + nom); return true; }
  ko += 1;
  console.log('  KO   ' + nom + (vu === undefined ? '' : '   vu: ' + String(vu)));
  return false;
}
const dors = (ms) => new Promise((r) => setTimeout(r, ms));
async function appel(methode, params) {
  const r = await fetch(F, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: methode, params }) });
  const j = await r.json();
  if (j.error) throw new Error(methode + ' : ' + j.error.message);
  return j.result;
}
const rpc = (m, p) => appel(m, p);
const pad = (a) => String(a).replace(/^0x/, '').toLowerCase().padStart(64, '0');
const mot = (v) => BigInt(v).toString(16).padStart(64, '0');
async function solde(jeton, qui) {
  if (String(jeton).toLowerCase() === ETH) return BigInt(await appel('eth_getBalance', [qui, 'latest']));
  return BigInt(await appel('eth_call', [{ to: jeton,
    data: '0x' + selecteur('balanceOf(address)') + pad(qui) }, 'latest']));
}
async function vivante(cle) {
  const r = await appel('eth_call', [{ to: SV,
    data: '0x' + selecteur('getSlot0(bytes32)') + poolId(cle).slice(2) }, 'latest']);
  return BigInt('0x' + r.slice(2, 66)) > 0n;
}
const versCurrency1 = (cle, depuis) => String(cle.currency0).toLowerCase() === String(depuis).toLowerCase();

console.log('=== LE BANC S ACCUSE D ABORD ===');
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+/.test(F)) {
  console.log('  ⛔⛔ ' + F + ' n est pas un noeud local. REFUS de demarrer.'); process.exit(1);
}
ok('le noeud est LOCAL', true, F);
ok('il forke Base (chainId 0x2105)', (await appel('eth_chainId', [])) === '0x2105');
const tete = parseInt(await appel('eth_blockNumber', []), 16);
console.log('  fork au bloc ' + tete);

console.log('');
console.log('=== LES TROIS POOLS, RESOLUES SUR LA CHAINE — aucune cle devinee gardee ===');
/* 1. OUSD/USDC : la cle MESUREE (fee 100 / ts 1), confirmee vivante. */
const cleOusd = cleDePool(USDC, OUSD, { fee: 100, tickSpacing: 1 });
const ousdVivante = await vivante(cleOusd);
ok('OUSD/USDC vivante sur le fork', ousdVivante);
/* 2. USDC/ETH : on CHERCHE parmi les cles MESUREES pour le prix ETH, on ne choisit pas au hasard. */
let cleEth = null;
for (const c of CLES_PRIX) {
  const k = cleDePool(ETH, USDC, c);
  if (await vivante(k)) { cleEth = k; console.log('  USDC/ETH : fee ' + c.fee + ' / ts ' + c.tickSpacing); break; }
  await dors(150);
}
ok('USDC/ETH vivante sur le fork', !!cleEth);
/* 3. ETH/block : par le lecteur CANONIQUE, hooks compris. */
let vie = null;
try { vie = await vieDuBlock({ rpc, stateView: SV, jeton: TBLOCK }); } catch (e) { vie = { etat: 'EX', pourquoi: e.message }; }
ok('ETH/TBLOCK lue par vieDuBlock', vie && vie.etat === 'LUE', vie && (vie.etat + ' ' + String(vie.pourquoi || '')));
if (!ousdVivante || !cleEth || !vie || vie.etat !== 'LUE') {
  console.log('');
  console.log('  ⛔⛔ UNE POOL MANQUE : le banc ne peut pas POSER la question. Ce n est pas un echec');
  console.log('     de la route — c est une absence de mesure, et je ne rends pas un vert dessus.');
  console.log('');
  console.log(n + ' assertions, ' + ko + ' KO');
  process.exit(ko ? 1 : 0);
}
console.log('  ETH/TBLOCK : fee ' + vie.cle.fee + ' / ts ' + vie.cle.tickSpacing
  + ' / hooks ' + (/^0x0{40}$/i.test(vie.cle.hooks) ? 'aucun' : vie.cle.hooks));

console.log('');
console.log('=== PREPARATION : financer l acheteur en OUSD (impersonation sur le FORK) ===');
await appel('anvil_setBalance', [ACHETEUR, '0x' + (10n ** 18n).toString(16)]);
const PM = '0x' + String(await appel('eth_call', [{ to: SV, data: '0x' + selecteur('poolManager()') }, 'latest'])).slice(26);
await appel('anvil_impersonateAccount', [PM]);
await appel('anvil_setBalance', [PM, '0x' + (10n ** 18n).toString(16)]);
let pret = false;
try {
  const h = await appel('eth_sendTransaction', [{ from: PM, to: OUSD,
    data: '0x' + selecteur('transfer(address,uint256)') + pad(ACHETEUR) + mot(CENT_OUSD) }]);
  let rec = null;
  for (let i = 0; i < 20 && !rec; i += 1) { rec = await appel('eth_getTransactionReceipt', [h]); if (!rec) await dors(250); }
  const recu = await solde(OUSD, ACHETEUR);
  pret = rec && rec.status === '0x1' && recu >= CENT_OUSD;
  ok('l acheteur a recu 100 OUSD', pret, recu);
} catch (e) { ok('l acheteur a recu 100 OUSD', false, String(e.message).slice(0, 70)); }
if (!pret) {
  console.log('  ⛔⛔ financement impossible : le banc n a pas su POSER la question. Pas de vert.');
  console.log(''); console.log(n + ' assertions, ' + ko + ' KO'); process.exit(1);
}

console.log('');
console.log('=== LA ROUTE : OUSD -> USDC -> ETH -> TBLOCK, construite par echange.js ===');
const SAUTS = [
  { cle: cleOusd, zeroForOne: versCurrency1(cleOusd, OUSD) },
  { cle: cleEth, zeroForOne: versCurrency1(cleEth, USDC) },
  { cle: vie.cle, zeroForOne: versCurrency1(vie.cle, ETH) },
];
async function plan() {
  return planEchangeMultiSauts({ rpc, chaine: 8453, compte: ACHETEUR, sauts: SAUTS,
    entree: OUSD, sortie: TBLOCK, montant: CENT_OUSD, toleranceBps: 500n,
    fraisDevisesOk: new Set([OUSD.toLowerCase()]) });
}
let p = await plan();
console.log('  etat : ' + p.etat + (p.pourquoi ? '   « ' + String(p.pourquoi).slice(0, 140) + ' »' : ''));
if (p.etat === 'APPROBATIONS') {
  await appel('anvil_impersonateAccount', [ACHETEUR]);
  for (const e of p.etapes) {
    const h = await appel('eth_sendTransaction', [{ from: ACHETEUR, to: e.to, data: e.data, value: e.value }]);
    let rec = null;
    for (let i = 0; i < 20 && !rec; i += 1) { rec = await appel('eth_getTransactionReceipt', [h]); if (!rec) await dors(250); }
    ok('autorisation « ' + e.nom + ' »', rec && rec.status === '0x1', rec && rec.status);
  }
  p = await plan();
  console.log('  apres autorisations : ' + p.etat + (p.pourquoi ? '   « ' + String(p.pourquoi).slice(0, 140) + ' »' : ''));
}
if (!ok('le plan est PRET', p.etat === 'PRET', p.etat + ' ' + String(p.pourquoi || '').slice(0, 130))) {
  console.log(''); console.log(n + ' assertions, ' + ko + ' KO'); process.exit(1);
}
console.log('  ' + p.resume.sauts + ' sauts, frais ' + p.resume.frais + ' (' + p.resume.fraisDevise + ')'
  + ', recoit au moins ' + p.resume.recoitAuMoins);

console.log('');
console.log('=== LES QUATRE CONDITIONS ===');
const avB = await solde(TBLOCK, ACHETEUR);
const avO = await solde(OUSD, ACHETEUR);
const avF = await solde(OUSD, FEE_WALLET);
await appel('anvil_impersonateAccount', [ACHETEUR]);
const hash = await appel('eth_sendTransaction', [{ from: ACHETEUR, to: p.tx.to, data: p.tx.data, value: p.tx.value }]);
let recu = null;
for (let i = 0; i < 20 && !recu; i += 1) { recu = await appel('eth_getTransactionReceipt', [hash]); if (!recu) await dors(250); }
if (!recu) ok('1. le recu a ete LU', false, 'aucun recu apres 20 essais — NON MESURE');
else {
  ok('1. la transaction a REUSSI (status 0x1)', recu.status === '0x1', recu.status);
  console.log('     gas ' + parseInt(recu.gasUsed, 16) + '   bloc ' + parseInt(recu.blockNumber, 16));
}
const apB = await solde(TBLOCK, ACHETEUR);
const apO = await solde(OUSD, ACHETEUR);
const apF = await solde(OUSD, FEE_WALLET);
console.log('  TBLOCK acheteur : ' + avB + ' -> ' + apB + '   (+' + (apB - avB) + ')');
console.log('  OUSD   acheteur : ' + avO + ' -> ' + apO + '   (-' + (avO - apO) + ')');
console.log('  OUSD   a6cf     : ' + avF + ' -> ' + apF + '   (+' + (apF - avF) + ')');
ok('2. l acheteur a REELLEMENT recu du TBLOCK', apB - avB > 0n, apB - avB);
ok('2b. et au moins le minimum annonce', apB - avB >= p.resume.recoitAuMoins,
  (apB - avB) + ' < ' + p.resume.recoitAuMoins);
ok('3. a6cf a encaisse EXACTEMENT notre part', apF - avF === p.resume.frais,
  (apF - avF) + ' != ' + p.resume.frais);
ok('4. l acheteur a bien DEPENSE le montant total', avO - apO === CENT_OUSD, avO - apO);

console.log('');
console.log(n + ' assertions, ' + ko + ' KO');
if (ko) process.exit(1);
