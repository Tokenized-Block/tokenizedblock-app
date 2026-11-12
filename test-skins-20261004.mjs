/* test-skins-20261004.mjs — L ACHAT D UNE SKIN : la recette, le memo ecrit dans la transaction, et la verification (hors reseau).
 *
 * A. validerRecette / memoSkin / lireMemoSkin : formes acceptees, formes refusees, aller-retour exact.
 * B. appelAchatSkin : un transfer(wallet des frais, 1 USDC) vers le contrat USDC, memo a la suite.
 * C. verifierAchatSkin sur des transactions et des recus FABRIQUES : l achat direct, l achat enveloppe par un smart wallet, et chaque
 *    tricherie (evenement emis par un autre contrat, autre beneficiaire, montant trop bas, transaction echouee, memo d un autre block,
 *    recu d une autre transaction, payeur different du signataire en direct). Transaction non lue = NON_LU, jamais un refus.
 * D. MUTANTS sur une copie de skins.js : chaque garde retiree fait rougir C.
 * ⛔ BORNE : rien ici ne touche la chaine. La transaction reelle (USDC accepte-t-il un memo ? le wallet des frais recoit-il 1 USDC ?)
 *   est prouvee par banc-achat-skin-fork-20261004.mjs. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f, dir = ICI) => import(pathToFileURL(path.join(dir, f)).href + '?v=' + Math.random());
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };

const F = await imp('frais-creation.js');
const K = await imp('keccak.js');
const M = await imp('messages.js');
const USDC = F.USDC_BASE.toLowerCase(), FRAIS = F.FEE_WALLET.toLowerCase();
const BLOCK = '0xb200000000000000000000e4b0c5fbe9c8df579e', AUTRE = '0xb2000000000000000000000000000000000000aa';
const ACHETEUR = '0x' + 'c0ffee'.padEnd(40, '1'), RELAIS = '0x' + 'be1a15'.padEnd(40, '2'), SMART = '0x' + '5a47'.padEnd(40, '3');
const T = K.topic('Transfer(address,address,uint256)');
const mot = (a) => '0x' + String(a).slice(2).toLowerCase().padStart(64, '0');
const HASH = '0x' + 'ab'.repeat(32);
const GOLD = { id: 'gold' }, RND = { id: 'random', angle: 278, h: [17, 237, 163], cube: 45, noyau: 310, fond: 200 };

async function jeu(dir, dire) {
  const S = await imp('skins.js', dir);
  const appel = S.appelAchatSkin({ usdc: USDC, beneficiaire: FRAIS, block: BLOCK, recette: GOLD });
  const log = (o = {}) => ({ address: USDC, topics: [T, mot(o.de || ACHETEUR), mot(o.vers || FRAIS)], data: '0x' + (o.montant ?? S.SKIN_PRIX_USDC).toString(16).padStart(64, '0'), ...o.plus });
  const tx = (o = {}) => ({ hash: HASH, from: ACHETEUR, to: USDC, input: appel.data, ...o });
  const recu = (o = {}) => ({ transactionHash: HASH, status: '0x1', blockNumber: '0x10', logs: [log()], ...o });
  const v = (t, r, plus = {}) => S.verifierAchatSkin({ tx: t, recu: r, usdc: USDC, beneficiaire: FRAIS, block: BLOCK, recette: GOLD, ...plus });

  const direct = v(tx(), recu());
  dire(direct.ok === true && direct.payeur === ACHETEUR && direct.signataire === ACHETEUR && direct.bloc === 16, 'C achat DIRECT : accepte, payeur = signataire, bloc lu');
  /* smart wallet : la transaction est signee par un relais, vers le wallet ; l appel est enveloppe ; le Transfer part du smart wallet */
  const enveloppe = '0x34fcd5be' + '00'.repeat(96) + appel.data.slice(2) + '00'.repeat(28);
  const sw = v(tx({ from: RELAIS, to: SMART, input: enveloppe }), recu({ logs: [log({ de: SMART })] }));
  dire(sw.ok === true && sw.payeur === SMART && sw.signataire === RELAIS, 'C achat ENVELOPPE (smart wallet) : accepte, le payeur est l emetteur du Transfer USDC, pas le relais');
  dire(v(tx(), recu({ logs: [log({ plus: { address: AUTRE } })] })).ok === false, 'C un Transfer emis par un AUTRE contrat que l USDC (evenement forge) : refuse');
  dire(v(tx(), recu({ logs: [log({ vers: ACHETEUR })] })).ok === false, 'C un Transfer vers un autre beneficiaire : refuse');
  dire(v(tx(), recu({ logs: [log({ montant: S.SKIN_PRIX_USDC - 1n })] })).ok === false, 'C un Transfer d une unite sous le prix : refuse'); /* 2026-11-12: the price follows the active contract (10 USDC on the pack Skins) */
  dire(v(tx(), recu({ logs: [log({ montant: S.SKIN_PRIX_USDC * 5n })] })).ok === true, 'C un Transfer de 5 fois le prix : accepte');
  dire(v(tx(), recu({ status: '0x0' })).etat === 'REFUSE', 'C transaction echouee (status 0x0) : refuse');
  dire(v(tx(), recu({ logs: [] })).ok === false, 'C aucun Transfer dans le recu : refuse (le calldata seul ne prouve pas que l argent est arrive)');
  dire(v(tx(), recu({ transactionHash: '0x' + 'cd'.repeat(32) })).ok === false, 'C le recu d une AUTRE transaction : refuse');
  dire(v(tx(), recu(), { block: AUTRE }).ok === false, 'C la meme transaction reclamee pour un AUTRE block : refuse (le memo dit le block)');
  dire(v(tx(), recu(), { recette: { id: 'ice' } }).ok === false, 'C la meme transaction reclamee pour une AUTRE skin : refuse (le memo dit la skin)');
  dire(v(tx({ input: M.encodeTransferAvecMemo(FRAIS, 1000000n, '') }), recu()).ok === false, 'C un transfert de 1 USDC SANS memo : refuse');
  dire(v(tx({ from: RELAIS }), recu()).ok === false, 'C appel direct a l USDC dont le signataire n est pas le payeur : refuse');
  dire(v(null, recu()).etat === 'NON_LU' && v(tx(), null).etat === 'NON_LU', 'C transaction ou recu non lus : NON_LU (a reessayer), jamais un refus');
  dire(v(tx(), recu(), { recette: { id: 'platine' } }).etat === 'REFUSE', 'C recette inconnue : refuse sans rien lire');
  return S;
}

console.log('— A. recettes et memo');
const S = await imp('skins.js');
/* 2026-10-18 : le prix n est plus une constante du module — c est le MINT_PRICE du contrat BlockSkins ACTIF, lu dans l enregistrement */
const { SKIN_MINT_USDC, BLOCKSKINS_ACTIF } = await imp('blockskins-actif.js');
ok(S.SKIN_PRIX_USDC === SKIN_MINT_USDC && S.SKIN_PRIX_USDC === BigInt(BLOCKSKINS_ACTIF.mintPriceUsdc) && S.SKIN_PRIX_USDC > 0n,
  'A le prix est celui de l enregistrement du contrat actif (v' + BLOCKSKINS_ACTIF.version + ' : ' + S.SKIN_PRIX_USDC + ' unites brutes, 6 decimales)');
ok(S.validerRecette(GOLD).ok && S.validerRecette(RND).ok, 'A recette du catalogue et recette « random » : acceptees');
for (const [nom, r] of [['id inconnu', { id: 'platine' }], ['teinte 360', { ...RND, cube: 360 }], ['teinte negative', { ...RND, noyau: -1 }], ['teinte decimale', { ...RND, angle: 1.5 }],
  ['deux teintes d anneau', { ...RND, h: [1, 2] }], ['teinte en texte', { ...RND, h: ['1', 2, 3] }], ['null', null], ['tableau', []]]) ok(S.validerRecette(r).ok === false, 'A refusee : ' + nom);
const memoG = S.memoSkin(BLOCK, GOLD), memoR = S.memoSkin(BLOCK, RND);
ok(memoG === 'tb-skin:1:' + BLOCK + ':gold' && memoR === 'tb-skin:1:' + BLOCK + ':r.278.17.237.163.45.310.200', 'A memo : ' + memoG + ' | …' + memoR.slice(-28));
/* le FOND est la 7e variable (ajoutee le jour meme, avant toute vente) : sans lui la recette est refusee, jamais completee */
const { fond: _sansFond, ...RND6 } = RND;
ok(S.validerRecette(RND6).ok === false && S.validerRecette({ ...RND, fond: 360 }).ok === false && S.lireMemoSkin('tb-skin:1:' + BLOCK + ':r.278.17.237.163.45.310').ok === false,
  'A une recette SANS fond (l ancien format a six nombres) est refusee, a la validation comme a la lecture du memo ; fond 360 aussi');
ok(M.validerMemo(memoR).etat === 'OK' && new TextEncoder().encode(memoR).length < 100, 'A le memo le plus long tient dans la limite des messages de l app (' + new TextEncoder().encode(memoR).length + ' octets)');
const lG = S.lireMemoSkin(memoG), lR = S.lireMemoSkin(memoR);
ok(lG.ok && lG.block === BLOCK && lG.recette.id === 'gold' && lR.ok && JSON.stringify(lR.recette) === JSON.stringify(RND), 'A aller-retour : lireMemoSkin(memoSkin(x)) rend x');
for (const t of ['', 'tb-skin:1:' + BLOCK + ':platine', 'tb-skin:2:' + BLOCK + ':gold', 'tb-skin:1:0x123:gold', memoG + ' ', 'x' + memoG, 'tb-skin:1:' + BLOCK + ':r.1.2.3.4.5', 'tb-skin:1:' + BLOCK + ':r.1.2.3.4.5.400'])
  ok(S.lireMemoSkin(t).ok === false, 'A memo refuse : « ' + t.slice(0, 20) + '…' + t.slice(-14) + ' »');
let leve = false; try { S.memoSkin('0x123', GOLD); } catch (_) { leve = true; }
ok(leve, 'A memoSkin refuse une adresse tronquee (leve)');

console.log('— B. l appel');
const appel = S.appelAchatSkin({ usdc: USDC, beneficiaire: FRAIS, block: BLOCK, recette: GOLD });
ok(appel.to === USDC && appel.value === '0x0' && appel.data.startsWith('0xa9059cbb' + mot(FRAIS).slice(2) + S.SKIN_PRIX_USDC.toString(16).padStart(64, '0')),
  'B transfer(wallet des frais, le prix actif) vers le contrat USDC, sans ETH');
const lu = M.lireMemo(appel.data);
ok(lu.etat === 'LU' && lu.texte === memoG, 'B le memo se relit dans le calldata avec le lecteur de messages de l app (« ' + String(lu.texte).slice(0, 18) + '… »)');

console.log('— C. la verification');
await jeu(ICI, (c, t) => ok(c, t));

console.log('— D. mutants');
const SRC = fs.readFileSync(path.join(ICI, 'skins.js'), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-skins-'));
for (const mu of [
  { nom: 'le contrat emetteur du log n est plus verifie', de: 'if (!l || bas(l.address) !== U || !Array.isArray(l.topics) || l.topics.length !== 3) continue;', a: 'if (!l || !Array.isArray(l.topics) || l.topics.length !== 3) continue;' },
  { nom: 'le beneficiaire du log n est plus verifie', de: 'if (bas(l.topics[0]) !== TOPIC_TRANSFER || bas(l.topics[2]) !== ben32) continue;', a: 'if (bas(l.topics[0]) !== TOPIC_TRANSFER) continue;' },
  { nom: 'le montant n est plus verifie', de: 'if (montant >= SKIN_PRIX_USDC) {', a: 'if (montant >= 0n) {' },
  { nom: 'le status n est plus verifie', de: "if (String(recu.status) !== '0x1') return refus('this transaction failed on chain');", a: '' },
  { nom: 'le memo (calldata) n est plus exige', de: "if (!/^0x[0-9a-f]*$/.test(input) || !input.includes(appel.data.slice(2))) {", a: 'if (false) {' },
  { nom: 'le recu d une autre transaction est accepte', de: "if (bas(recu.transactionHash) !== bas(tx.hash)) return refus('the receipt is not the one of this transaction');", a: '' },
  { nom: 'payeur != signataire accepte en direct', de: "if (bas(tx.to) === U && signataire !== payeur) return refus('the payer is not the signer of this direct transfer');", a: '' },
  { nom: 'transaction non lue prise pour un refus', de: "return { ok: false, etat: 'NON_LU', pourquoi: 'the transaction or its receipt could not be read yet' };", a: "return { ok: false, etat: 'REFUSE', pourquoi: 'x' };" },
]) {
  if (SRC.split(mu.de).length !== 2) { ok(false, 'D mutant « ' + mu.nom + ' » : motif introuvable ou multiple'); continue; }
  const dir = fs.mkdtempSync(path.join(tmp, 'm-'));
  for (const f of ['messages.js', 'keccak.js', 'blockskins-actif.js', 'blockskins-deploiement.js']) fs.copyFileSync(path.join(ICI, f), path.join(dir, f));
  fs.writeFileSync(path.join(dir, 'skins.js'), SRC.replace(mu.de, mu.a));
  let rouges = 0, plante = null;
  try { await jeu(dir, (c) => { if (!c) rouges += 1; }); } catch (e) { plante = String(e && e.message).slice(0, 60); }
  ok(rouges > 0 || plante !== null, 'D mutant « ' + mu.nom + ' » : ROUGE (' + (plante ? 'plante : ' + plante : rouges + ' assertion(s)') + ')');
}
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}

console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions)');
process.exit(ko ? 1 : 0);
