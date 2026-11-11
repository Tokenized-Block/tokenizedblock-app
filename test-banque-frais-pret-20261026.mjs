/* test-banque-frais-pret-20261026.mjs - LES FRAIS DE LA BANK, COLLES AUX DONNEES DE MORPHO (decision de Phil, 2026-10-26 :
 *   « colle toi au data de morpho ajoute les bon frais »).
 * MESURE DU JOUR (lecture seule, bloc ~53 106 889) : market(id).fee = 0 sur les 19 marches Morpho Blue dont la garantie est une action du
 *   registre (dont les 9 listes), feeRecipient de Morpho = 0x0 ; l API (state.fee) dit 0 aussi ; irm/oracle/lltv de l API == la chaine.
 *   Le Supply live 0xb91a3e0f…0c58 (0,1 USDC, marche GOOGLc 0x0cc78b1f…) : 1 transfert USDC, du wallet vers Morpho, AUCUN vers la caisse.
 * EXECUTE banque-morpho.js (faux noeud) et des fonctions d app.html. AFFIRME :
 *   (1) le Lend paie la MEME regle que le Borrow : FRAIS_PRET_BPS == FRAIS_EMPRUNT_BPS (10), meme arrondi superieur, meme caisse ;
 *   (2) planPreter : approve EXACT de M a Morpho -> supply M -> transfer(caisse, 0,1 % de M) de l actif prete, drapeau frais ; un solde
 *       de M seul (sans le frais) est REFUSE avec le chiffre ; resume : fraisApp, totalSortant, feeMorpho ;
 *   (3) sortir est gratuit et le DIT : rembourser, retirer un pret, retirer une garantie -> aucun appel vers la caisse, fraisApp '0' ;
 *   (4) le frais Morpho est RELU SUR LA CHAINE (lireFraisMorphoChaine) : texte WAD exact, null si non lu ou hors bornes, jamais 0 par
 *       defaut ; seulement les marches listes ; le serveur le cable sur rpcRails ;
 *   (5) la page : bcFraisPret et bcPretMax == fraisPret et pretMaxAvecFrais (parite exhaustive sur 0..30 000) ; la ligne des frais de
 *       la carte dit le frais Morpho lu, ou « not read » ; l estimation du Lend dit le frais et le total sortant ;
 *   (6) mutants : chacun ROUGE.
 *   (7) l ECRAN == le plan, au runtime (vraies fonctions d app.html dans un vm) : total « leaves your wallet » de l estimation du Lend,
 *       « You can lend », la ligne des frais a taux differents ; 6 mutants sur copies.
 * L EXECUTION est prouvee a part, sur les SOLDES d un fork : banc-banque-frais-pret-fork-20261026.mjs. NE PROUVE PAS : un vrai wallet.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } return c; };
const charger = async (src) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banque-frais-'));
  fs.writeFileSync(path.join(dir, 'banque-morpho.js'), src);
  /* 2026-11-11 (wt-369): + banque-frais.js — the rates moved there (browser-safe), banque-morpho.js imports and re-exports them */
  for (const f of ['encodeur.js', 'lancer-pool.js', 'paires.js', 'frais-creation.js', 'banque-frais.js']) fs.writeFileSync(path.join(dir, f), "export * from '" + pathToFileURL(path.join(ICI, f)).href + "';\n");
  return await import(pathToFileURL(path.join(dir, 'banque-morpho.js')).href);
};
const SRC = fs.readFileSync(process.env.TB_BANQUE || path.join(ICI, 'banque-morpho.js'), 'utf8');
const B = await charger(SRC);
const { ACTIONS_COINBASE } = await import(pathToFileURL(path.join(ICI, 'paires.js')).href);
const { FEE_WALLET } = await import(pathToFileURL(path.join(ICI, 'frais-creation.js')).href);
const GOOGLC = String(ACTIONS_COINBASE.find((a) => a.symbole === 'GOOGLc').adr).toLowerCase();
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', ORACLE = '0x' + 'aa'.repeat(20), IRM = '0x' + 'bb'.repeat(20);
const ID = '0x' + 'a3'.repeat(32), COMPTE = '0x' + 'c0'.repeat(20);
const PRIX = 3526329343300000000000000000000000000n, LLTV = 770000000000000000n, WAD = 10n ** 18n;
const w = (x) => BigInt(x).toString(16).padStart(64, '0'), wa = (a) => a.slice(2).padStart(64, '0');
const motsDe = (d) => d.slice(10).match(/.{64}/g) || [];

function noeud(o = {}) {
  const e = { supply: 600n * 10n ** 6n, borrow: 500n * 10n ** 6n, solde: 10n ** 9n, allow: 0n, fee: 0n, pos: [0n, 0n, 0n], ...o };
  const rpc = async (methode, params) => {
    if (methode === 'eth_simulateV1') return [{ calls: params[0].blockStateCalls[0].calls.map(() => ({ status: '0x1' })) }];
    const { to, data } = params[0]; const sel = data.slice(2, 10);
    if (to === B.MORPHO_BLUE && sel === B.SEL.idToMarketParams) return '0x' + wa(USDC) + wa(GOOGLC) + wa(ORACLE) + wa(IRM) + w(LLTV);
    if (to === B.MORPHO_BLUE && sel === B.SEL.market) return '0x' + w(e.supply) + w(e.supply) + w(e.borrow) + w(e.borrow) + w(1) + w(e.fee);
    if (to === B.MORPHO_BLUE && sel === B.SEL.position) return '0x' + w(e.pos[0]) + w(e.pos[1]) + w(e.pos[2]);
    if (to === ORACLE && sel === B.SEL.price) return '0x' + w(PRIX);
    if (sel === B.SEL.balanceOf) return '0x' + w(e.solde);
    if (sel === B.SEL.allowance) return '0x' + w(e.allow);
    throw new Error('unexpected ' + to + ' ' + sel);
  };
  return rpc;
};
const versCaisse = (c) => c.data.startsWith('0x' + B.SEL.transfer) && motsDe(c.data)[0] === wa(FEE_WALLET.toLowerCase());

/* sur l ancien code (RED attendu) : pas de frais de Lend du tout -> on le dit et on sort, sans planter */
if (typeof B.fraisPret !== 'function' || typeof B.lireFraisMorphoChaine !== 'function') { ok(false, '(1) aucun frais de Lend ni lecture du frais Morpho dans banque-morpho.js'); console.log('0 ok / 1 KO'); process.exit(1); }
/* (1) la meme regle */
ok(B.FRAIS_PRET_BPS === B.FRAIS_EMPRUNT_BPS && B.FRAIS_PRET_BPS === 10n, '(1) FRAIS_PRET_BPS == FRAIS_EMPRUNT_BPS == 10 (' + B.FRAIS_PRET_BPS + ')');
let parite = true;
for (const m of [0n, 1n, 9999n, 10000n, 10001n, 5n * 10n ** 6n, 123456789n]) if (B.fraisPret(m) !== B.fraisEmprunt(m)) parite = false;
ok(parite && B.fraisPret(1n) === 1n && B.fraisPret(10001n) === 11n, '(1) fraisPret == fraisEmprunt : 0,1 % arrondi a l unite superieure');
let maxOk = true;
for (let s = 0n; s <= 30000n; s += 1n) { const m = B.pretMaxAvecFrais(s); if (m + B.fraisPret(m) > s || (m + 1n + B.fraisPret(m + 1n) <= s)) { maxOk = false; break; } }
ok(maxOk, '(1) pretMaxAvecFrais : le plus grand M avec M + frais <= solde, exhaustif sur 0..30 000');

/* (2) planPreter */
const M = 5n * 10n ** 6n, F = B.fraisPret(M);
const pr = await B.planPreter({ rpc: noeud({ solde: M + F }), compte: COMPTE, id: ID, montant: M });
const [ap, su, tr] = pr.aSigner || [];
ok(pr.etat === 'PRET' && pr.aSigner.length === 3, '(2) preter avec M + frais au solde : PRET, 3 appels (' + pr.etat + ', ' + (pr.aSigner || []).length + ')');
ok(ap && ap.to === USDC && ap.data.startsWith('0x' + B.SEL.approve) && motsDe(ap.data)[0] === wa(B.MORPHO_BLUE) && BigInt('0x' + motsDe(ap.data)[1]) === M,
  '(2) approbation EXACTE de M (5 000 000) a Morpho, pas M + frais');
ok(su && su.to === B.MORPHO_BLUE && su.data.startsWith('0x' + B.SEL.supply) && BigInt('0x' + motsDe(su.data)[5]) === M, '(2) supply de M sur Morpho');
ok(tr && tr.to === USDC && versCaisse(tr) && BigInt('0x' + motsDe(tr.data)[1]) === F && F === 5000n && tr.frais === true,
  '(2) dernier appel : transfer USDC de 5 000 unites (0,1 %) vers FEE_WALLET, drapeau frais');
ok(pr.resume.fraisApp === '5000' && pr.resume.fraisAppBps === 10 && pr.resume.totalSortant === String(M + F) && pr.resume.feeMorpho === '0',
  '(2) resume : fraisApp 5000, 10 bps, totalSortant 5 005 000, feeMorpho lu 0');
const court = await B.planPreter({ rpc: noeud({ solde: M }), compte: COMPTE, id: ID, montant: M });
ok(court.etat === 'REFUSE' && court.aSigner.length === 0 && /5005000/.test(court.pourquoi), '(2) solde = M sans le frais : REFUSE avec le total (' + court.pourquoi + ')');
const deja = await B.planPreter({ rpc: noeud({ solde: M + F, allow: M }), compte: COMPTE, id: ID, montant: M });
ok(deja.etat === 'PRET' && deja.aSigner.length === 2 && !deja.aSigner.some((c) => c.data.startsWith('0x' + B.SEL.approve)) && versCaisse(deja.aSigner[1]),
  '(2) autorisation deja suffisante : supply puis frais, pas d approbation');
const feeLu = await B.planPreter({ rpc: noeud({ solde: M + F, fee: 5n * 10n ** 16n }), compte: COMPTE, id: ID, montant: M });
ok(feeLu.resume && feeLu.resume.feeMorpho === String(5n * 10n ** 16n), '(2) feeMorpho du resume = le 6e mot de market(id), relu (5 %)');

/* (3) sortir est gratuit */
const rb = await B.planRembourser({ rpc: noeud({ pos: [0n, 10n ** 6n, 10n ** 7n] }), compte: COMPTE, id: ID, tout: true });
const rp = await B.planRetirerPret({ rpc: noeud({ pos: [10n ** 6n, 0n, 0n] }), compte: COMPTE, id: ID, tout: true });
const rg = await B.planRetirerGarantie({ rpc: noeud({ pos: [0n, 0n, 10n ** 7n] }), compte: COMPTE, id: ID, montant: 10n ** 6n });
for (const [nom, p] of [['rembourser', rb], ['retirer le pret', rp], ['retirer la garantie', rg]]) {
  ok(p.etat === 'PRET' && !p.aSigner.some(versCaisse) && p.resume.fraisApp === '0' && p.resume.fraisAppBps === 0, '(3) ' + nom + ' : PRET, aucun appel vers la caisse, fraisApp 0 dit');
}

/* (3b) trouves par le banc fork du 2026-10-26 : rembourser TOUT laissait 10 001 unites autorisees ; retirer TOUT annoncait 1 unite de trop */
const rbA = rb.aSigner;
ok(rbA.length === 3 && rbA[0].data.startsWith('0x' + B.SEL.approve) && rbA[2].remiseA0 === true && rbA[2].data.startsWith('0x' + B.SEL.approve) && BigInt('0x' + motsDe(rbA[2].data)[1]) === 0n && rb.resume.autorisationRemiseA0 === true,
  '(3b) rembourser tout : approve(marge) -> repay(parts) -> approve(Morpho, 0) en dernier');
const rbDeja = await B.planRembourser({ rpc: noeud({ pos: [0n, 10n ** 6n, 10n ** 7n], allow: 10n ** 12n }), compte: COMPTE, id: ID, tout: true });
ok(rbDeja.etat === 'PRET' && rbDeja.aSigner.length === 1 && !rbDeja.resume.autorisationRemiseA0, '(3b) autorisation ANTERIEURE suffisante : ni approve ni remise a 0 (on ne touche pas ce que ce plan n a pas donne)');
const rbPart = await B.planRembourser({ rpc: noeud({ pos: [0n, 10n ** 6n, 10n ** 7n] }), compte: COMPTE, id: ID, montant: 1000n });
ok(rbPart.etat === 'PRET' && rbPart.aSigner.length === 2 && !rbPart.aSigner.some((c) => c.remiseA0), '(3b) remboursement partiel : l approve exact est consomme, pas de remise a 0');
/* parts virtuelles de Morpho : 1e12 parts sur un marche 600e6 actifs / 600e6 parts -> 1e12 x (600e6 + 1) / (600e6 + 1e6) */
const rpV = await B.planRetirerPret({ rpc: noeud({ pos: [10n ** 12n, 0n, 0n], supply: 600n * 10n ** 6n }), compte: COMPTE, id: ID, tout: true });
ok(rpV.resume && rpV.resume.preteLu === String((10n ** 12n * (600n * 10n ** 6n + 1n)) / (600n * 10n ** 6n + 10n ** 6n)), '(3b) retirer tout : montant = toAssetsDown de Morpho (parts virtuelles) : ' + (rpV.resume && rpV.resume.preteLu));

/* (4) le frais Morpho relu sur la chaine */
const item = (id, listed) => ({ marketId: id, lltv: String(LLTV), listed, irmAddress: IRM, oracle: { address: ORACLE }, loanAsset: { address: USDC, symbol: 'USDC', decimals: 6 },
  collateralAsset: { address: GOOGLC, symbol: 'GOOGLc', decimals: 8 }, state: { supplyAssetsUsd: 1, liquidityAssetsUsd: 1, supplyApy: 0.05, borrowApy: 0.06, fee: 0 } });
const api = async () => ({ ok: true, status: 200, json: async () => ({ data: { markets: { items: [item(ID, true), item('0x' + 'b5'.repeat(32), true), item('0x' + 'c6'.repeat(32), false)] } } }) });
const L = await B.lireMarchesMorpho({ fetchImpl: api });
ok(L.ok && L.fraisPretBps === 10 && L.fraisEmpruntBps === 10 && L.fraisSortieBps === 0 && L.marches.every((m) => m.feeMorpho === null && m.feeMorphoApi === 0 && m.irm === IRM),
  '(4) liste : fraisPretBps 10, fraisSortieBps 0, feeMorphoApi lu, feeMorpho null tant que non relu sur la chaine');
const lus = [];
const rpcFee = async (meth, params) => { const id = '0x' + params[0].data.slice(10); lus.push(id);
  if (id === ID) return '0x' + w(1) + w(1) + w(0) + w(0) + w(1) + w(0);
  throw new Error('node down'); };
const C = await B.lireFraisMorphoChaine({ rpc: rpcFee, lu: L });
const [a0, b0, c0] = [ID, '0x' + 'b5'.repeat(32), '0x' + 'c6'.repeat(32)].map((i) => C.marches.find((m) => m.id === i));
ok(a0.feeMorpho === '0' && a0.feeMorphoAccord === true && b0.feeMorpho === null && c0.feeMorpho === null && !lus.includes('0x' + 'c6'.repeat(32)) && C.feeMorphoRelus === 1 && C.feeMorphoCibles === 2,
  '(4) relu : 0 sur la chaine = "0" ; lecture ratee = null (jamais 0) ; marche non liste pas lu ; 1 relu sur 2 cibles');
const L2 = await B.lireMarchesMorpho({ fetchImpl: api });
const C2 = await B.lireFraisMorphoChaine({ rpc: async () => '0x' + w(1) + w(1) + w(0) + w(0) + w(1) + w(WAD + 1n), lu: L2 });
ok(C2.marches.every((m) => m.feeMorpho === null), '(4) un frais > 100 % (hors bornes Morpho) n est pas une lecture : null');
const L3 = await B.lireMarchesMorpho({ fetchImpl: api });
const C3 = await B.lireFraisMorphoChaine({ rpc: async () => '0x' + w(1) + w(1) + w(0) + w(0) + w(1) + w(10n ** 17n), lu: L3 });
ok(C3.marches.filter((m) => m.listeParMorpho).every((m) => m.feeMorpho === String(10n ** 17n) && m.feeMorphoAccord === false), '(4) chaine 10 %, API 0 : la chaine l emporte et le desaccord est marque');
const srv = fs.readFileSync(path.join(ICI, 'serveur-web.js'), 'utf8');
ok(/lireMarchesMorpho\(\)\.then\(\(r\) => lireFraisMorphoChaine\(\{ rpc: rpcRails, lu: r \}\)\)/.test(srv), '(4) le serveur relit le frais Morpho sur rpcRails apres l API');

/* (5) la page */
const html = fs.readFileSync(process.env.TB_APP || path.join(ICI, 'app.html'), 'utf8');
const fonction = (entete) => { const i = html.indexOf(entete); if (i < 0) return null; const f = /\r?\n\}/.exec(html.slice(i)); return html.slice(i, i + f.index + f[0].length); };
const srcFP = fonction('function bcFraisPret(m) {'), srcPM = fonction('function bcPretMax(solde) {'), srcFD = fonction('function bcBanqueFraisDit(mk) {');
ok(!!srcFP && !!srcPM && !!srcFD, '(5) bcFraisPret, bcPretMax et bcBanqueFraisDit existent dans app.html');
if (srcFP && srcPM && srcFD) {
  const page = (bps, bpsE = 10) => new Function('bcBanque', srcFP + '\n' + srcPM + '\n' + srcFD + '\nreturn { bcFraisPret, bcPretMax, bcBanqueFraisDit };')({ fraisPretBps: bps, fraisBps: bpsE });
  const P = page(10);
  let pp = true;
  for (let s = 0n; s <= 30000n; s += 1n) if (P.bcPretMax(s) !== B.pretMaxAvecFrais(s) || P.bcFraisPret(s) !== B.fraisPret(s)) { pp = false; break; }
  ok(pp, '(5) page == serveur : bcFraisPret/bcPretMax == fraisPret/pretMaxAvecFrais sur 0..30 000');
  ok(page(null).bcFraisPret(10n) === null && page(null).bcPretMax(10n) === null, '(5) taux non lu : la page n invente pas de frais (null)');
  const t0 = P.bcBanqueFraisDit({ feeMorpho: '0' }), tN = P.bcBanqueFraisDit({ feeMorpho: null }), t5 = P.bcBanqueFraisDit({ feeMorpho: String(5n * 10n ** 16n) });
  ok(/Morpho keeps 0 % of the interest \(read on chain/.test(t0) && /one-time 0\.1 % of what you borrow or lend/.test(t0) && /nothing to repay or withdraw/.test(t0), '(5) ligne des frais : ' + t0);
  ok(/Morpho's own fee on this market was not read/.test(tN) && !/keeps 0 %/.test(tN), '(5) frais Morpho non lu : « not read », jamais 0 : ' + tN);
  ok(/Morpho keeps 5 % of the interest/.test(t5), '(5) frais Morpho 5 % lu -> « 5 % » : ' + t5);
}
const est = fonction('function bcBanqueEstimer() {');
ok(!!est && /bcFraisPret\(m\)/.test(est) && /leaves your wallet/.test(est), '(5) l estimation du Lend dit le frais et le total qui sort du wallet');
const puces = fonction('function bcBanquePuces(mk, r, soldeG) {');
ok(!!puces && /const max = bcPretMax\(r\.pret\);/.test(puces) && /k === 100n \? max :/.test(puces), '(5) « All » = bcPretMax du solde, pas le solde entier');
ok(/TokenizedBlock fee to ' \+ \(sens === 'rembourser' \? 'repay' : 'withdraw'\)/.test(html) && /of what you lend\), on top: /.test(html), '(5) la carte du plan dit le frais du Lend et « No TokenizedBlock fee » en sortie');

ok(/hash = r\.hash; if \(!c\.frais && !c\.remiseA0\) hashOperation = r\.hash;/.test(html), '(5) bcSigner : le lien explorer montre l operation, ni le frais ni la remise a 0 de l autorisation');

/* (6) mutants */
const muter = async (de, vers, nom, juge) => {
  if (!SRC.includes(de)) return ok(false, '(6) mutant introuvable : ' + nom);
  const Mm = await charger(SRC.replace(de, vers));
  let rouge; try { rouge = await juge(Mm); } catch (_) { rouge = true; }
  ok(rouge, '(6) mutant « ' + nom + ' » : ROUGE');
};
const preterAvec = (Mm, o = {}) => Mm.planPreter({ rpc: noeud({ solde: M + F, ...o }), compte: COMPTE, id: ID, montant: M });
await muter("  appels.push({ to: p.loanToken, data: appelTransfer(DESTINATAIRE_FRAIS_BANQUE, frais), value: '0x0', frais: true, nom: 'TokenizedBlock service fee: ' + Number(FRAIS_PRET_BPS)", "  if (0) appels.push({ to: p.loanToken, data: appelTransfer(DESTINATAIRE_FRAIS_BANQUE, frais), value: '0x0', frais: true, nom: 'TokenizedBlock service fee: ' + Number(FRAIS_PRET_BPS)",
  'frais du Lend retire', async (Mm) => !(await preterAvec(Mm)).aSigner.some(versCaisse));
await muter('data: appelApprove(MORPHO_BLUE, M)', 'data: appelApprove(MORPHO_BLUE, total)', 'approbation M + frais', async (Mm) => BigInt('0x' + (await preterAvec(Mm)).aSigner[0].data.slice(-64)) !== M);
await muter('if (solde < total) return refuse(', 'if (solde < M) return refuse(', 'solde verifie sans le frais', async (Mm) => (await preterAvec(Mm, { solde: M })).etat === 'PRET');
await muter('  return (s * 10000n) / (10000n + FRAIS_PRET_BPS);', '  return s;', 'pretMax = tout le solde', async (Mm) => { for (let s = 1n; s <= 30000n; s += 1n) { const m = Mm.pretMaxAvecFrais(s); if (m + Mm.fraisPret(m) > s) return true; } return false; });
await muter('  return (s * 10000n) / (10000n + FRAIS_PRET_BPS);', '  return (s * 10000n) / (10000n + FRAIS_PRET_BPS) - (s > 1n ? 1n : 0n);', 'pretMax une unite trop bas', async (Mm) => { for (let s = 2n; s <= 30000n; s += 1n) { const m = Mm.pretMaxAvecFrais(s); if (m + 1n + Mm.fraisPret(m + 1n) <= s) return true; } return false; });
await muter('        if (fee > WAD) return;', '', 'borne du frais Morpho retiree', async (Mm) => { const l = await Mm.lireMarchesMorpho({ fetchImpl: api }); const c = await Mm.lireFraisMorphoChaine({ rpc: async () => '0x' + w(1) + w(1) + w(0) + w(0) + w(1) + w(WAD + 1n), lu: l }); return c.marches.some((m) => m.feeMorpho !== null); });
await muter("const SANS_FRAIS_SORTIE = Object.freeze({ fraisApp: '0'", "const SANS_FRAIS_SORTIE = Object.freeze({ fraisApp: '1'", 'sortie qui se dit payante', async (Mm) => (await Mm.planRembourser({ rpc: noeud({ pos: [0n, 10n ** 6n, 10n ** 7n] }), compte: COMPTE, id: ID, tout: true })).resume.fraisApp !== '0');

await muter('  if (approuve && tout) {', '  if (false) {', 'remise a 0 retiree', async (Mm) => !(await Mm.planRembourser({ rpc: noeud({ pos: [0n, 10n ** 6n, 10n ** 7n] }), compte: COMPTE, id: ID, tout: true })).aSigner.some((c) => c.remiseA0));
await muter('  const prete = (pos.supplyShares * (supplyAssets + 1n)) / (supplyShares + 10n ** 6n);', '  const prete = supplyShares === 0n ? 0n : (pos.supplyShares * supplyAssets) / supplyShares;', 'parts virtuelles oubliees',
  async (Mm) => (await Mm.planRetirerPret({ rpc: noeud({ pos: [10n ** 12n, 0n, 0n] }), compte: COMPTE, id: ID, tout: true })).resume.preteLu !== rpV.resume.preteLu);

/* (7) 2026-10-26 (revue adverse wf6-morpho-fees : deux mutants ou l ECRAN ment sur ce que le wallet signe survivaient - le total
 *   « leaves your wallet » de l estimation du Lend, et « You can lend ») : les VRAIES fonctions d app.html, executees dans un vm avec un
 *   faux DOM, comparees au plan de banque-morpho.js (le meme que le wallet signe). Mutants sur des COPIES en memoire de leur source. */
const { enUnitesBrutes } = await import(pathToFileURL(path.join(ICI, 'commandes-panel.js')).href);
const vm = await import('node:vm');
const constante = (entete, fin) => { const i = html.indexOf(entete); if (i < 0) return null; const j = html.indexOf(fin, i); return j < 0 ? null : html.slice(i, j + fin.length); };
const srcPage = {
  bcEl: constante('const bcEl = (tag, props = {}, enfants = []) => {', '\n};'), bcUnites: constante('const bcUnites = (brut, dec) => {', '};'),
  bcPct: constante('const bcPct = (x) =>', "%');"), bcBas2: constante('const bcBas2 = (brut, dec) => {', '};'),
  bcFraisPret: srcFP, bcPretMax: srcPM, bcBanqueFraisDit: srcFD,
  bcPeindrePourToi: fonction('function bcPeindrePourToi(el, mk, r) {'), bcBanqueEstimer: est };
ok(Object.values(srcPage).every((s) => typeof s === 'string' && s.length > 0), '(7) les 9 sources d app.html extraites pour le vm');
class Noeud { constructor(tag) { this.tag = tag; this.className = ''; this.children = []; this._t = ''; this.value = ''; this.placeholder = ''; }
  get textContent() { return this._t + this.children.map((c) => c.textContent).join(''); } set textContent(v) { this._t = String(v); this.children = []; }
  append(...c) { this.children.push(...c); } setAttribute() {} }
const pageVm = (sources, banque) => {
  const els = { '#bcBanqueEstim': new Noeud('p'), '#bcBanqueMontant': new Noeud('input') };
  const ctx = vm.createContext({ bcBanque: banque, enUnitesBrutes, document: { createElement: (t) => new Noeud(t), querySelector: (s) => els[s] || null }, bcPeindreJauge: () => {} });
  const api = vm.runInContext('(() => { const $ = (s) => document.querySelector(s);\n' + Object.values(sources).join('\n') + '\nreturn { bcPeindrePourToi, bcBanqueEstimer, bcBanqueFraisDit, bcPretMax }; })()', ctx);
  return { api, els };
};
const MK = { id: ID, garantie: { symbole: 'GOOGLc', decimales: 8 }, pret: { symbole: 'USDC', decimales: 6 }, apyPret: 0.05 };
const banqueDe = () => ({ fraisPretBps: 10, fraisBps: 10, sens: 'preter', lendEnOusd: false, choisi: MK });
/* (7a) l estimation : le total qui sort du wallet == ce que le plan fait sortir (approve M consomme par supply + transfer du frais) */
const jugerEstimation = async (sources, montants) => {
  const fautes = [];
  for (const v of montants) {
    const { api, els } = pageVm(sources, banqueDe()); els['#bcBanqueMontant'].value = v; api.bcBanqueEstimer();
    const t = els['#bcBanqueEstim'].textContent, mt = /([\d.]+) USDC leaves your wallet, ([\d.]+) USDC goes to Morpho/.exec(t);
    const Mv = enUnitesBrutes(v, 6), Fv = B.fraisPret(Mv), plan = await B.planPreter({ rpc: noeud({ solde: Mv + Fv }), compte: COMPTE, id: ID, montant: Mv });
    const sortPlan = plan.aSigner.filter((c) => c.data.startsWith('0x' + B.SEL.supply) || versCaisse(c)).reduce((s, c) => s + (versCaisse(c) ? BigInt('0x' + motsDe(c.data)[1]) : BigInt('0x' + motsDe(c.data)[5])), 0n);
    const ecran = mt ? enUnitesBrutes(mt[1], 6) : null, morpho = mt ? enUnitesBrutes(mt[2], 6) : null;
    if (plan.etat !== 'PRET' || ecran !== BigInt(plan.resume.totalSortant) || ecran !== sortPlan || morpho !== Mv) fautes.push(v + ' : ecran ' + ecran + ' / plan ' + plan.resume.totalSortant + ' / signe ' + sortPlan);
  }
  return fautes;
};
const MONTANTS = ['5', '10', '0.000001', '1234.567891', '7.5'];
const fE = await jugerEstimation(srcPage, MONTANTS);
ok(fE.length === 0, '(7a) estimation du Lend : « leaves your wallet » == totalSortant du plan == supply + frais signes, sur ' + MONTANTS.length + ' montants' + (fE.length ? ' : ' + fE.join(' ; ') : ''));
/* (7b) « You can lend » : le montant affiche, ressaisi tel quel, est ACCEPTE par le plan sur ce solde ; et c est bcPretMax tronque au cent */
const jugerPourToi = async (sources, soldes) => {
  const fautes = [];
  for (const s of soldes) {
    const { api } = pageVm(sources, banqueDe()), el = new Noeud('div');
    api.bcPeindrePourToi(el, MK, { emprunt: null, garantie: 0n, pret: s });
    const bloc = el.children[0] && el.children[0].children.find((d) => d.children[0] && d.children[0].textContent === 'You can lend');
    const txt = bloc ? bloc.children[1].textContent : '', mt = /^([\d,]+\.\d\d) USDC$/.exec(txt);
    const vu = mt ? enUnitesBrutes(mt[1].replace(/,/g, ''), 6) : null, attendu = (B.pretMaxAvecFrais(s) / 10000n) * 10000n;
    const plan = vu ? await B.planPreter({ rpc: noeud({ solde: s }), compte: COMPTE, id: ID, montant: vu }) : null;
    if (vu !== attendu || !plan || plan.etat !== 'PRET') fautes.push(s + ' : ecran « ' + txt + ' », attendu ' + attendu + ', plan ' + (plan && plan.etat));
  }
  return fautes;
};
const SOLDES = [10n ** 7n, 10n ** 6n, 123456789n, 5005000n, 2n * 10n ** 9n];
const fP = await jugerPourToi(srcPage, SOLDES);
ok(fP.length === 0, '(7b) « You can lend » == bcPretMax tronque au cent, et le plan ACCEPTE ce montant sur ce solde (' + SOLDES.length + ' soldes)' + (fP.length ? ' : ' + fP.join(' ; ') : ''));
const plein = await B.planPreter({ rpc: noeud({ solde: 10n ** 7n }), compte: COMPTE, id: ID, montant: 10n ** 7n });
ok(plein.etat === 'REFUSE', '(7b) temoin : le solde entier (10 USDC) est REFUSE par le plan - afficher le solde serait un montant que le wallet ne peut pas signer');
/* (7c) la ligne des frais quand le taux du Lend differe de celui du Borrow (aujourd hui tous deux 10 : seul un taux FAUX le montre) */
const ligneDiff = (sources) => pageVm(sources, { ...banqueDe(), fraisBps: 10, fraisPretBps: 20 }).api.bcBanqueFraisDit({ feeMorpho: '0' });
const tD = ligneDiff(srcPage);
ok(/one-time 0\.1 % to borrow, 0\.2 % to lend/.test(tD), '(7c) taux differents (10 / 20 bps) : la ligne dit les DEUX : ' + tD);
/* (7d) mutants des revues, sur des copies de la source extraite : chacun ROUGE */
const muterPage = async (cle, de, vers, nom, juge) => {
  if (!srcPage[cle] || !srcPage[cle].includes(de)) return ok(false, '(7d) mutant introuvable : ' + nom);
  let rouge; try { rouge = await juge({ ...srcPage, [cle]: srcPage[cle].replace(de, vers) }); } catch (_) { rouge = true; }
  ok(rouge, '(7d) mutant « ' + nom + ' » : ROUGE');
};
await muterPage('bcBanqueEstimer', 'bcUnites(m + f, decL)', 'bcUnites(m, decL)', 'estimation : total = M sans le frais', async (s) => (await jugerEstimation(s, MONTANTS)).length > 0);
await muterPage('bcBanqueEstimer', 'bcFraisPret(m) : null', '0n : null', 'estimation : frais 0', async (s) => (await jugerEstimation(s, MONTANTS)).length > 0);
await muterPage('bcPeindrePourToi', 'bcBas2(pretMax !== null ? pretMax : r.pret, pr.decimales)', 'bcBas2(r.pret, pr.decimales)', '« You can lend » = tout le solde', async (s) => (await jugerPourToi(s, SOLDES)).length > 0);
await muterPage('bcPretMax', '(10000n + BigInt(bcBanque.fraisPretBps))', '10000n', 'bcPretMax sans le frais', async (s) => (await jugerPourToi(s, SOLDES)).length > 0);
await muterPage('bcBanqueFraisDit', "p / 100 + ' % to lend'", "e / 100 + ' % to lend'", 'ligne des frais : taux du Lend ignore', async (s) => !/0\.2 % to lend/.test(ligneDiff(s)));
await muterPage('bcBanqueFraisDit', '(e === p ?', '(true ?', 'ligne des frais : un seul taux toujours', async (s) => !/0\.2 % to lend/.test(ligneDiff(s)));
console.log(n - ko + ' ok / ' + ko + ' KO (' + n + ' assertions)');
process.exit(ko ? 1 : 0);
