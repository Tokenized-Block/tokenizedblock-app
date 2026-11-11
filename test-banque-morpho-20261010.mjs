/* test-banque-morpho-20261010.mjs — TokenizedBank phase 1 (banque-morpho.js), HORS LIGNE, faux noeud.
 * AFFIRME : (A) l encodage des appels Morpho (tete statique, `bytes` vide a l offset juste) ; (B) le plafond d emprunt (LLTV puis
 *   marge 70 %) sur les chiffres lus le 2026-10-10 (prix GOOGLc 352,63 USDC) ; (C) trois etats : une lecture ratee n est jamais PRET,
 *   une simulation qui reverte -> REFUSE, une simulation muette -> NON_MESURE ; (D) refus : garantie hors registre, plafond, liquidite,
 *   solde ; (E) approbation au MONTANT EXACT, absente si deja suffisante ; (F) mutants (simulation retiree, approbation infinie,
 *   marge retiree) : chacun ROUGE.
 * L execution reelle est prouvee a part : banc-banque-morpho-fork-20261010.mjs. NE PROUVE PAS une liquidation.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } return c; };
const charger = async (src) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banque-'));
  fs.writeFileSync(path.join(dir, 'banque-morpho.js'), src);
  /* 2026-10-11 : + frais-creation.js (FEE_WALLET, destinataire des frais de service de la Bank) */
  /* 2026-11-11 (wt-369): + banque-frais.js — the rates moved there (browser-safe), banque-morpho.js imports and re-exports them */
  for (const f of ['encodeur.js', 'lancer-pool.js', 'paires.js', 'frais-creation.js', 'banque-frais.js']) fs.writeFileSync(path.join(dir, f), "export * from '" + pathToFileURL(path.join(ICI, f)).href + "';\n");
  return { M: await import(pathToFileURL(path.join(dir, 'banque-morpho.js')).href), dir };
};
const SRC = fs.readFileSync(path.join(ICI, 'banque-morpho.js'), 'utf8');
const { M: B } = await charger(SRC);
const { ACTIONS_COINBASE } = await import(pathToFileURL(path.join(ICI, 'paires.js')).href);
const GOOGLC = String(ACTIONS_COINBASE.find((a) => a.symbole === 'GOOGLc').adr).toLowerCase();
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', ORACLE = '0x' + 'aa'.repeat(20), IRM = '0x' + 'bb'.repeat(20), INCONNU = '0x' + 'cc'.repeat(20);
const ID = '0x' + 'a3'.repeat(32), COMPTE = '0x' + 'c0'.repeat(20);
const PRIX = 3526329343300000000000000000000000000n, LLTV = 770000000000000000n;
const w = (x) => BigInt(x).toString(16).padStart(64, '0'), wa = (a) => a.slice(2).padStart(64, '0');

/* ── A. encodage ── */
const p = { loanToken: USDC, collateralToken: GOOGLC, oracle: ORACLE, irm: IRM, lltv: LLTV };
const sc = B.appelSupplyCollateral(p, 10n ** 7n, COMPTE).slice(10).match(/.{64}/g);
ok(sc.length === 9 && BigInt('0x' + sc[5]) === 10n ** 7n && sc[6] === wa(COMPTE) && BigInt('0x' + sc[7]) === 256n && BigInt('0x' + sc[8]) === 0n,
  'A supplyCollateral : marketParams 5 mots, montant, onBehalf, offset bytes = 0x100, longueur 0');
const su = B.appelSupply(p, 5n, COMPTE).slice(10).match(/.{64}/g);
/* tete de 9 mots (marketParams 5, assets, shares, onBehalf, offset) puis la longueur des bytes : 10 mots, offset 9 x 32 = 0x120 */
ok(su.length === 10 && BigInt('0x' + su[5]) === 5n && BigInt('0x' + su[6]) === 0n && su[7] === wa(COMPTE) && BigInt('0x' + su[8]) === 288n && BigInt('0x' + su[9]) === 0n, 'A supply : assets, shares 0, onBehalf, offset bytes = 0x120, longueur 0');
const bo = B.appelBorrow(p, 7n, COMPTE, COMPTE).slice(10).match(/.{64}/g);
ok(bo.length === 9 && bo[0] === wa(USDC) && bo[1] === wa(GOOGLC) && BigInt('0x' + bo[4]) === LLTV && bo[8] === wa(COMPTE), 'A borrow : 9 mots statiques, receveur = le compte');

/* ── B. plafond ── */
const cap = B.capacite({ garantie: 10n ** 7n, prix: PRIX, lltv: LLTV });
ok(cap.valeur === 35263293n && cap.max === 27152735n && cap.plafond === 19006914n, 'B 0,1 GOOGLc a 352,63 : valeur 35,26 USDC, max LLTV 27,15, plafond (70 %) 19,00 — ' + cap.valeur + '/' + cap.max + '/' + cap.plafond);

/* ── faux noeud ── */
function noeud(o = {}) {
  const e = { collat: GOOGLC, prix: PRIX, supply: 600n * 10n ** 6n, borrow: 500n * 10n ** 6n, solde: 10n ** 8n, allow: 0n, sim: 'ok', prixLeve: false, ...o };
  const appels = [];
  const rpc = async (methode, params) => {
    appels.push(methode);
    if (methode === 'eth_simulateV1') { if (e.sim === 'leve') throw new Error('node down'); return [{ calls: params[0].blockStateCalls[0].calls.map((_, i, t) => ({ status: e.sim === 'revert' && i === t.length - 1 ? '0x0' : '0x1', error: { message: 'Too little' } })) }]; }
    const { to, data } = params[0]; const sel = data.slice(2, 10);
    if (to === B.MORPHO_BLUE && sel === B.SEL.idToMarketParams) return '0x' + wa(USDC) + wa(e.collat) + wa(ORACLE) + wa(IRM) + w(LLTV);
    if (to === B.MORPHO_BLUE && sel === B.SEL.market) return '0x' + w(e.supply) + w(e.supply) + w(e.borrow) + w(e.borrow) + w(1) + w(0);
    if (to === B.MORPHO_BLUE && sel === B.SEL.position) return '0x' + w(0) + w(0) + w(0);
    if (to === ORACLE && sel === B.SEL.price) { if (e.prixLeve) throw new Error('oracle silent'); return '0x' + w(e.prix); }
    if (sel === B.SEL.balanceOf) return '0x' + w(e.solde);
    if (sel === B.SEL.allowance) return '0x' + w(e.allow);
    throw new Error('unexpected ' + to + ' ' + sel);
  };
  return { rpc, appels };
}
const emprunter = (Bm, o, args = {}) => Bm.planEmprunter({ rpc: noeud(o).rpc, compte: COMPTE, id: ID, garantie: 10n ** 7n, emprunt: 10n ** 7n, ...args });

/* ── C. trois etats ── */
const pret = await emprunter(B, {});
ok(pret.etat === 'PRET' && pret.resume.simule === true && pret.aSigner.length === 4, 'C simulation acceptee -> PRET (approve, supplyCollateral, borrow, frais de service)');
/* 2026-10-11 (decision de Phil : 0,1 % de l emprunt -> FEE_WALLET) : le 4e appel est un transfer de l actif EMPRUNTE vers la caisse,
 *   0,1 % de 10 USDC = 10 000 unites brutes ; arrondi a l unite superieure (jamais 0) ; le resume le dit */
const { FEE_WALLET } = await import(pathToFileURL(path.join(ICI, 'frais-creation.js')).href);
const fr = pret.aSigner[3], frMots = fr ? fr.data.slice(10).match(/.{64}/g) : [];
ok(fr && fr.to === USDC && fr.data.startsWith('0x' + B.SEL.transfer) && frMots[0] === wa(FEE_WALLET.toLowerCase()) && BigInt('0x' + frMots[1]) === 10000n
  && pret.resume.fraisApp === '10000' && pret.resume.fraisAppBps === 10 && pret.resume.fraisPour === 'TokenizedBlock', 'C frais de service : transfer 10 000 unites USDC vers FEE_WALLET, dit dans le resume');
ok(B.fraisEmprunt(1n) === 1n && B.fraisEmprunt(9999n) === 10n && B.fraisEmprunt(10000n) === 10n && B.fraisEmprunt(10001n) === 11n && B.fraisEmprunt(0n) === 0n,
  'C frais : 0,1 % arrondi a l unite SUPERIEURE, jamais 0 sur un emprunt positif');
const rev = await emprunter(B, { sim: 'revert' });
ok(rev.etat === 'REFUSE' && rev.aSigner.length === 0 && /refuses this exact sequence/.test(rev.pourquoi), 'C simulation qui reverte -> REFUSE, rien a signer');
const muet = await emprunter(B, { sim: 'leve' });
ok(muet.etat === 'NON_MESURE' && muet.aSigner.length === 0, 'C simulation muette -> NON_MESURE, jamais PRET');
const oracleMuet = await emprunter(B, { prixLeve: true });
ok(oracleMuet.etat === 'NON_MESURE' && oracleMuet.aSigner.length === 0, 'C oracle illisible -> NON_MESURE (jamais un prix 0, jamais PRET)');

/* ── D. refus ── */
const hors = await emprunter(B, { collat: INCONNU });
ok(hors.etat === 'REFUSE' && /not a tokenized stock of our registry/.test(hors.pourquoi), 'D garantie hors registre -> REFUSE');
const trop = await emprunter(B, {}, { emprunt: 19006915n });
ok(trop.etat === 'REFUSE' && trop.aSigner.length === 0, 'D plafond + 1 -> REFUSE (19 006 915 > 19 006 914)');
const pile = await emprunter(B, {}, { emprunt: 19006914n });
ok(pile.etat === 'PRET', 'D plafond pile -> PRET');
const sec = await emprunter(B, { supply: 100n, borrow: 95n }, { emprunt: 10n });
ok(sec.etat === 'REFUSE' && /only 5 raw units/.test(sec.pourquoi), 'D liquidite du marche (5) < emprunt (10) -> REFUSE avec le chiffre');
const pauvre = await emprunter(B, { solde: 10n ** 6n });
ok(pauvre.etat === 'REFUSE' && /holds 1000000/.test(pauvre.pourquoi), 'D solde de garantie insuffisant -> REFUSE');

/* ── E. approbation ── */
const ap = pret.aSigner[0];
ok(ap.data.startsWith('0x' + B.SEL.approve) && BigInt('0x' + ap.data.slice(-64)) === 10n ** 7n && ap.to === GOOGLC, 'E approbation de la garantie au MONTANT EXACT (10 000 000)');
const dejaAutorise = await emprunter(B, { allow: 10n ** 7n });
ok(dejaAutorise.etat === 'PRET' && !dejaAutorise.aSigner.some((c) => c.data.startsWith('0x' + B.SEL.approve)), 'E allocation deja suffisante -> pas d approbation');
const pr = await B.planPreter({ rpc: noeud({}).rpc, compte: COMPTE, id: ID, montant: 5n * 10n ** 6n });
ok(pr.etat === 'PRET' && pr.aSigner[0].to === USDC && BigInt('0x' + pr.aSigner[0].data.slice(-64)) === 5n * 10n ** 6n, 'E preter : approbation USDC exacte puis supply');

/* ── G. la liste de l API Morpho (faux fetch) : trois etats, jamais une liste vide sur un echec ── */
const repApi = (items, extra = {}) => async () => ({ ok: true, status: 200, json: async () => ({ data: { markets: { items } }, ...extra }) });
const item = (g, id, usd) => ({ marketId: id, lltv: '770000000000000000', listed: true, oracle: { address: ORACLE }, loanAsset: { address: USDC, symbol: 'USDC', decimals: 6 },
  collateralAsset: { address: g, symbol: 'X', decimals: 8 }, state: { supplyAssetsUsd: usd, borrowAssetsUsd: 1, liquidityAssetsUsd: 2, utilization: 0.5, borrowApy: 0.05, supplyApy: 0.04 } });
const L = await B.lireMarchesMorpho({ fetchImpl: repApi([item(GOOGLC, ID, 10), item(INCONNU, '0x' + 'd1'.repeat(32), 999), item(GOOGLC, '0x' + 'e2'.repeat(32), 50)]) });
ok(L.ok && L.marches.length === 2 && L.marches[0].offreUsd === 50 && L.marches.every((m) => m.garantie.symbole === 'GOOGLc'), 'G liste : garantie hors registre ecartee (l API n est pas crue sur parole), tri par offre');
const prixTexte = '3526329343300000000000000000000000000';
const Lp = await B.lireMarchesMorpho({ fetchImpl: repApi([{ ...item(GOOGLC, ID, 10), state: { ...item(GOOGLC, ID, 10).state, price: prixTexte } }]) });
ok(Lp.ok && Lp.marches[0].prixOracle === prixTexte && Lp.marches[0].garantie.decimales === 8 && Lp.marches[0].margeBps === 7000,
  'G prix de l oracle garde en TEXTE exact (37 chiffres), decimales de la garantie et marge transmises a l estimateur');
const L500 = await B.lireMarchesMorpho({ fetchImpl: async () => ({ ok: false, status: 500 }) });
ok(!L500.ok && L500.etat === 'NON_LU' && !('marches' in L500), 'G API en HTTP 500 -> NON_LU, pas de liste (jamais « aucun marche »)');
const Lerr = await B.lireMarchesMorpho({ fetchImpl: repApi([], { errors: [{ message: 'x' }] }) });
ok(!Lerr.ok && Lerr.etat === 'NON_LU', 'G API qui rend des erreurs GraphQL -> NON_LU');
const Lleve = await B.lireMarchesMorpho({ fetchImpl: async () => { throw new Error('reseau'); } });
ok(!Lleve.ok && Lleve.etat === 'NON_LU', 'G API injoignable -> NON_LU');

/* ── H. le serveur cable les deux routes, sur le budget des rails et la simulation de rpcNaissance (texte : le cablage ne
 *   s execute pas sans demarrer le serveur) ── */
const srv = fs.readFileSync(path.join(ICI, 'serveur-web.js'), 'utf8');
ok(/if \(chemin === '\/api\/banque\/marches'\)/.test(srv) && /if \(chemin === '\/api\/banque\/plan'\)/.test(srv)
  && /planEmprunter\(\{ rpc: rpcNaissance,/.test(srv) && /nIpB > RAILS_IP_MINUTE \|\| railsBudget\.n >= RAILS_MINUTE \|\| railsEnVol >= RAILS_EN_VOL_MAX/.test(srv),
  'H routes /api/banque/marches et /api/banque/plan, budget des rails, rpc qui simule (rpcNaissance)');

/* ── I. le panneau (texte d app.html : les boutons d apres-emprunt ne s affichent qu apres une vraie signature) ──
 *   2026-10-10 (Phil) : l USDC emprunte sert aux ACTIONS et aux BLOCKS (l action en garantie, le block affiche) ; pas de bouton ETH ;
 *   le fiat entre par le rail CDP existant (ouvrirRailFiat, USDC) en mode Lend. */
const app = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8');
const iBq = app.indexOf('/** Une action de banque : plan'), fBq = app.indexOf('/** Les positions du wallet connecte');
const bloc = iBq > 0 && fBq > iBq ? app.slice(iBq, fBq) : '';
ok(bloc.includes('offrir(bcResoudre(mk.garantie.adr));') && bloc.includes('if (brainAdr) offrir(bcResoudre(String(brainAdr)));') && !/Swap it to ETH/.test(bloc),
  'I apres un emprunt : acheter l action en garantie ou le block affiche avec l USDC ; aucun bouton ETH');
ok(bloc.includes("[...DEVISES_BASE.filter((d) => d.chaines.includes(8453) && d.lancePubliquement !== false), ...ACTIONS_COINBASE]") && bloc.includes("text: 'Any asset:'")
  /* revue adverse (2026-10-11) : le montant propose est le NET recu (emprunt - frais de service), plus le brut */
  && bloc.includes("bcProposerSwap('You', '', { de: usdc, vers: j, montant: String(netM) }, null)"),
  'I « full open » : un selecteur de TOUS les actifs connus (devises de Base + actions du registre + block affiche), ce sont les rails qui jugent');
ok(/ouvrirRailFiat\(e, \$\('#bcBanqueCarte'\), 'USDC'\)/.test(app) && /\$\('#bcBanqueFiat'\)\.hidden = !\(sens === 'preter' && mk\.pret\.symbole === 'USDC'\);/.test(app),
  'I mode Lend : « Add USDC with a card or bank » par le rail fiat existant, en USDC ; masque en mode Borrow');

/* ── F. mutants ── */
const muter = async (de, vers, nom, juge) => {
  if (!SRC.includes(de)) return ok(false, 'F mutant introuvable : ' + nom);
  const { M } = await charger(SRC.replace(de, vers));
  let rouge; try { rouge = await juge(M); } catch (_) { rouge = true; }
  ok(rouge, 'F mutant « ' + nom + ' » : ROUGE');
};
await muter("const s = await simulerSequenceLancement({ rpc, compte, appels });", "const s = { etat: 'ACCEPTE' };", 'simulation retiree', async (M) => (await emprunter(M, { sim: 'revert' })).etat === 'PRET');
await muter("data: appelApprove(MORPHO_BLUE, G)", "data: appelApprove(MORPHO_BLUE, (1n << 256n) - 1n)", 'approbation infinie', async (M) => BigInt('0x' + (await emprunter(M, {})).aSigner[0].data.slice(-64)) !== 10n ** 7n);
await muter("plafond: (max * MARGE_EMPRUNT_BPS) / 10000n", "plafond: max", 'marge retiree', async (M) => (await emprunter(M, {}, { emprunt: 19006915n })).etat === 'PRET');

console.log(n - ko + ' ok / ' + ko + ' KO (' + n + ' assertions)');
process.exit(ko ? 1 : 0);
