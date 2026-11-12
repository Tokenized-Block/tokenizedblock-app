// test-frais-et-risques-20261018.mjs — LA PAGE « Fees & risks » DIT-ELLE LES CHIFFRES DES SOURCES, ET SEULEMENT EUX ?
//
// ⛔ CE QUE CE FICHIER EMPECHE : un chiffre d argent tape a la main sur la page publique (« 0.1 % », « 0.50 USDC ») qui reste vrai
//    le jour ou il est ecrit et devient faux le jour ou la source change — sans que rien ne rougisse. Ici :
//    1. chaque chiffre du module est RECALCULE depuis la source (fiche de deploiement, module servi, source Solidity) ;
//    2. le rendu est appele avec des sources FAUSSES : s il ne change pas, un chiffre est tape quelque part ;
//    3. l esperance d un roll est recalculee par une SECONDE implementation (enumeration octet par octet de faceOf) ;
//    4. la coquille HTML statique ne porte AUCUN chiffre ; la page, son module et leurs imports sont SERVIS ; l app la lie.
// ⛔ CE QUE CE FICHIER NE PROUVE PAS : que les contrats deployes portent ces valeurs (relu a part, eth_call, voir le commit) ;
//    que la page s affiche bien (verifie au navigateur a 375 px, a part).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const lire = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8');

const FR = await import('./frais-risques.js');
const { HOOK_7030_PPM, HOOK_7030, fraisHookBps, HOOKS_PAIENT_DEJA_A6CF } = await import('./tokenomics.js');
const { FRAIS_OUVERTURE_WEI, CREATE_FEE_WEI_FLOOR } = await import('./frais-creation.js');
const { BLOCKROLLS_DEPLOIEMENT } = await import('./blockrolls-deploiement.js');
const { BLOCKSKINS_DEPLOIEMENT } = await import('./blockskins-deploiement.js');
const { contratActif } = await import('./blockskins-actif.js');
const { MISSIONS_DEPLOIEMENT } = await import('./missions-deploiement.js');
const { TICKETPOT_DEPLOIEMENT } = await import('./ticketpot-deploiement.js');
const TS = await import('./tirage-saison.js');
const { TAILLES, FENETRE } = await import('./blockrolls-plan.js');
const { FRAIS_INTERFACE_BPS } = await import('./echange.js');
const { PALIERS } = await import('./frais-degressif.js');
const { FRAIS_GESTE_BPS } = await import('./frais-du-geste.js');
const GEN = await import('./outils/generer-frais-contrats.mjs');
const FC = await import('./frais-contrats.js');

/* ---- 0. le module genere frais-contrats.js est FRAIS : regenere depuis les .sol, il redonne exactement le fichier */
const sources = Object.fromEntries(GEN.SOURCES.map((s) => [s.fichier, lire(s.fichier)]));
const lf = (t) => t.replace(/\r\n/g, '\n');
eq(lf(GEN.texteModule(sources)), lf(lire('frais-contrats.js')), 'frais-contrats.js = ce que donne le generateur sur les .sol du depot (regenerer : node outils/generer-frais-contrats.mjs)');
for (const s of GEN.SOURCES) eq(FC.FRAIS_CONTRATS[s.contrat].sha256Source, createHash('sha256').update(lf(sources[s.fichier])).digest('hex'), s.contrat + ' : empreinte de la source (LF)');
/* l empreinte = celle des fiches de deploiement generees ailleurs : meme source, meme convention */
/* 2026-11-12: blockskins-deploiement.js is the RETIRED standalone record, frozen from the pre-pack BlockSkins.sol (Skins is now the router
 *   game of the economy pack, step S). Its source hash must therefore DIFFER from the current source that frais-contrats.js reads: the two
 *   being equal again would mean the frozen v3 creation was regenerated from the router game source with the old constructor. */
ok(FC.FRAIS_CONTRATS.BlockSkins.sha256Source !== BLOCKSKINS_DEPLOIEMENT.sha256Source && BLOCKSKINS_DEPLOIEMENT.adresse === null, 'BlockSkins : the retired standalone record is frozen from the pre-pack source (not the current one) and never deployed');
eq(FC.FRAIS_CONTRATS.BlockMissionsV3.sha256Source, MISSIONS_DEPLOIEMENT.sha256Sources['src/BlockMissionsV3.sol'], 'BlockMissionsV3 : meme source que missions-deploiement.js');
/* temoin : les constantes sont lues dans le texte, pas devinees — une source modifiee change la valeur extraite */
const muteSkins = sources['contracts/src/BlockSkins.sol'].replace(/SALE_FEE_BPS = 1000;/, 'SALE_FEE_BPS = 900;');
ok(muteSkins !== sources['contracts/src/BlockSkins.sol'], 'temoin : le motif SALE_FEE_BPS existe dans la source');
eq(GEN.constantes(muteSkins, ['SALE_FEE_BPS']).SALE_FEE_BPS, '900', 'temoin : une source mutee donne la valeur mutee');
let leve = false; try { GEN.constantes('contract X {}', ['SALE_FEE_BPS']); } catch { leve = true; }
ok(leve, 'temoin : une constante absente LEVE (jamais un defaut)');

/* ---- 1. chaque chiffre de CHIFFRES = la source */
const C = FR.CHIFFRES;
eq(C.hook.adresse, HOOK_7030.toLowerCase(), 'hook = HOOK_7030');
eq(C.hook.walletPpm, BigInt(HOOK_7030_PPM.walletDeFrais), 'hook : part du wallet de frais = HOOK_7030_PPM');
eq(C.hook.createurPpm, BigInt(HOOK_7030_PPM.createur), 'hook : part du createur = HOOK_7030_PPM');
eq((C.hook.walletPpm + C.hook.createurPpm) / 100n, BigInt(fraisHookBps(HOOK_7030)), 'coherence : 700 + 300 ppm = fraisHookBps(7030) bps');
ok(HOOKS_PAIENT_DEJA_A6CF.some((h) => h.hook.toLowerCase() === HOOK_7030.toLowerCase()), 'le 7030 est dans la liste des hooks qui paient deja : le routeur ne prend rien en plus');
eq(C.naissance.totalWei, FRAIS_OUVERTURE_WEI, 'naissance = FRAIS_OUVERTURE_WEI');
eq(C.naissance.creationWei, FRAIS_OUVERTURE_WEI - CREATE_FEE_WEI_FLOOR, 'createPaid = total - plancher (app.html, naissance-api.js)');
eq(C.naissance.inscriptionWei, CREATE_FEE_WEI_FLOOR, 'inscription = plancher');
const rc = BLOCKROLLS_DEPLOIEMENT.constructeur;
eq(C.rolls.adresse, BLOCKROLLS_DEPLOIEMENT.adresse, 'BlockRolls : adresse de la fiche');
for (const k of ['rollPrice', 'passPrice', 'prize5', 'prize4', 'prize3', 'prize2']) eq(C.rolls[k], BigInt(rc[k]), 'BlockRolls ' + k + ' = fiche');
for (const k of ['passRolls', 'passWindow', 'potShareBps', 'minScore']) eq(C.rolls[k], Number(rc[k]), 'BlockRolls ' + k + ' = fiche');
eq(C.rolls.fenetreBlocs, FENETRE, 'fenetre de reglement = blockrolls-plan FENETRE');
const actif = contratActif();
eq(C.skins.adresse, String(actif.adresse).toLowerCase(), 'skins : contrat ACTIF');
eq(C.skins.mintUsdc, BigInt(actif.mintPriceUsdc), 'skins : prix de mint du contrat actif');
/* 2026-11-12: no `prochain`: the standalone v3 is retired (Skins ships in the economy pack), and the page never announces a contract that is not live */
ok(!('prochain' in C.skins), 'skins : no next standalone contract is announced (retired, superseded by the pack)');
eq(C.skins.venteBps, BigInt(FC.FRAIS_CONTRATS.BlockSkins.SALE_FEE_BPS), 'skins : frais de vente = SALE_FEE_BPS de la source');
eq(C.skins.encherePlusBps, BigInt(FC.FRAIS_CONTRATS.BlockSkins.MIN_RAISE_BPS), 'skins : surenchere = MIN_RAISE_BPS');
eq(C.skins.enchereMaxS, BigInt(FC.FRAIS_CONTRATS.BlockSkins.MAX_AUCTION), 'skins : enchere max = MAX_AUCTION');
const M = FC.FRAIS_CONTRATS.BlockMissionsV3;
eq(C.missions.deploye, !!MISSIONS_DEPLOIEMENT.adresse, 'missions : deploye <=> adresse dans la fiche');
eq(C.missions.feeBps, BigInt(M.FEE_BPS), 'missions FEE_BPS');
eq(C.missions.reserveBps, BigInt(M.FEE_BPS) * BigInt(M.TB_SHARE_BPS) / 10000n * BigInt(M.RESERVE_SHARE_BPS) / 10000n, 'missions : part reserve = splitTb');
eq(C.missions.devBps, BigInt(M.FEE_BPS) * BigInt(M.TB_SHARE_BPS) / 10000n * (10000n - BigInt(M.RESERVE_SHARE_BPS)) / 10000n, 'missions : part dev = splitTb');
eq(C.missions.createurBps, BigInt(M.FEE_BPS) - BigInt(M.FEE_BPS) * BigInt(M.TB_SHARE_BPS) / 10000n, 'missions : part createur = split');
eq(C.missions.faiseurBps, 10000n - BigInt(M.FEE_BPS), 'missions : le faiseur recoit le reste');
eq([C.missions.faiseurBps, C.missions.reserveBps, C.missions.devBps], [9000n, 700n, 300n], 'missions : 90 / 7 / 3 aujourd hui (si la source change, ce temoin rougit ET la page suit)');
eq(C.ticketpot.deploye, !!TICKETPOT_DEPLOIEMENT.adresse, 'ticketpot : deploye <=> adresse');
/* 2026-10-18 18:20 UTC : BlockDuels LIVE — la page lit duels-deploiement.js, comme pour TicketPot */
eq(C.duels.deploye, !!(await import('./duels-deploiement.js')).DUELS_DEPLOIEMENT.adresse, 'duels : deploye <=> adresse (lue dans la fiche)');
eq(C.tirage.seuilUsd, TS.SEUIL_VOLUME_JOUR_USD, 'ticket du jour = SEUIL_VOLUME_JOUR_USD');
eq(C.tirage.joursPassSemaine, TS.JOURS_PASS_SEMAINE, 'week pass : jours');
eq(C.tirage.bonusPassSemaine, TS.BONUS_PASS_SEMAINE, 'week pass : entrees bonus');
eq(C.tirage.joursPassSkin, TS.JOURS_PASS_SKIN, 'skin : jours de ticket');
eq(C.routeur.marcheBps, FRAIS_INTERFACE_BPS, 'routeur, un marche : FRAIS_INTERFACE_BPS');
eq(C.routeur.paliers.map((p) => [p.jusquaUsd, p.bps]), PALIERS.map((p) => [p.jusquaUsd, p.bps]), 'routeur multi-sauts : PALIERS');
eq(C.geste.bps, FRAIS_GESTE_BPS, 'GM : FRAIS_GESTE_BPS');

/* ---- 2. l esperance d un roll, par une SECONDE implementation : on enumere les octets de keccak comme BlockRolls.faceOf */
function loiParEnumeration() {
  const bande = Array(6).fill(0);
  for (let x = 0; x < 65536; x++) { const t = x % 361; bande[Math.floor(((t + 30) % 360) / 60)]++; }
  const parOctet = (m) => { const c = Array(m).fill(0); for (let b = 0; b < 256; b++) c[b % m]++; return c; };
  return [{ c: bande, d: 65536 }, ...[10, 19, 9, 8].map((m) => ({ c: parOctet(m), d: 256 }))];
}
eq(TAILLES, [6, 10, 19, 9, 8], 'tailles des traits (app = contrat, test-blockrolls-parite)');
const L = loiParEnumeration();
function esperance(probas, prix, minScore) {
  let dist = [1];
  for (const p of probas) { const nv = Array(dist.length + 1).fill(0); dist.forEach((q, k) => { nv[k] += q * (1 - p); nv[k + 1] += q * p; }); dist = nv; }
  return dist.reduce((s, q, k) => s + (k >= minScore ? q * prix[k] : 0), 0);
}
const prixScore = [0, 0, Number(rc.prize2), Number(rc.prize3), Number(rc.prize4), Number(rc.prize5)];
const evUni = esperance(TAILLES.map((t) => 1 / t), prixScore, Number(rc.minScore));
const evMax = esperance(L.map((l) => Math.max(...l.c) / l.d), prixScore, Number(rc.minScore));
const E = FR.esperanceRoll(C.rolls, TAILLES);
ok(Math.abs(Number(E.uniforme.num) / Number(E.uniforme.den) - evUni) < 1e-6, 'EV guess uniforme : module = enumeration (' + evUni / 1e6 + ' USDC)');
ok(Math.abs(Number(E.meilleur.num) / Number(E.meilleur.den) - evMax) < 1e-6, 'EV meilleur guess : module = enumeration (' + evMax / 1e6 + ' USDC)');
eq(FR.usdc4(E.uniforme), (Math.round(evUni / 100) / 1e4).toFixed(4), 'EV uniforme, 4 decimales');
eq(FR.usdc4(E.uniforme), '0.0549', 'EV uniforme = 0,0549 USDC, le chiffre ecrit dans blockrolls-plan.js (et maintenant mesure)');
ok(evMax < Number(rc.rollPrice) && evUni < Number(rc.rollPrice), 'un roll perd en moyenne, meme au meilleur guess');
ok(evMax > evUni, 'le meilleur guess (valeurs biaisees par le modulo) paie un peu plus que le guess uniforme');

/* ---- 3. le rendu suit les sources : appele avec des sources FAUSSES, il doit dire les valeurs fausses */
const vrai = FR.rendre(FR.CHIFFRES, null);
for (const attendu of ['>0.1%<', '0.07% to TokenizedBlock', '0.03% to the block', '0.001 ETH', '0.0007 ETH when', '0.0003 ETH when', '>0.50 USDC<', '>10 USDC<', '30 rolls',
  '24 hours', '50% goes to the roll pot', '0.5% on a single Uniswap v4 market', /* game374 (audit F-route-6, F-mis-3): the tiers as frais-degressif.js applies them; the 7% goes to a wallet, not a pool */ '0.2% up to $100', '0.1% from $200', 'Doer 90%', 'community reward wallet 7%', 'TokenizedBlock 3%',
  'takes 10% of each sale', '>1 USDC<', FR.usdc4(E.uniforme) + ' USDC on average', FR.usdc4(E.meilleur) + ' USDC (', 'Rolls lose on average.',
  'A pass loses on average too.', 'within 256 blocks', 'taxBps() = 9999', 'about 0.01% of the ETH it paid', '129 of 129']) ok(vrai.includes(attendu), 'rendu reel contient « ' + attendu + ' »');
ok(/\$10(?!\d)/.test(vrai), 'rendu reel : le seuil du ticket $10');
/* 2026-11-12 (Phil copy rule): no internal status words about the skin contract on the page */
ok(!/prepared but not signed|new skin contract/i.test(vrai), 'rendu reel : the Skin row announces no contract that is not live (prepared but not signed is gone)');
/* 2026-10-18 16:50 UTC : TicketPot est LIVE (0xf986…1df1) — il reste Missions et Duels a dire « not deployed » */
/* 2026-10-18 18:20 UTC : Missions et Duels sont LIVE aussi — « not deployed » n apparait que pour les fiches SANS adresse (lu, jamais suppose) */
const nonDeployes = ['missions', 'ticketpot', 'duels'].filter((k) => FR.CHIFFRES[k].deploye !== true).length;
ok((vrai.match(/not deployed/gi) || []).length === nonDeployes, 'rendu : « not deployed » exactement pour les fiches sans adresse (' + nonDeployes + ')');
const faux = structuredClone(FR.CHIFFRES);
faux.hook.walletPpm = 1100n; faux.hook.createurPpm = 400n;
faux.naissance.totalWei = 2000000000000000n; faux.naissance.creationWei = 1500000000000000n; faux.naissance.inscriptionWei = 500000000000000n;
faux.rolls.rollPrice = 700000n; faux.rolls.passPrice = 12000000n; faux.rolls.passRolls = 25; faux.rolls.potShareBps = 6000; faux.rolls.passWindow = 172800;
faux.rolls.prize2 = 600000n; faux.rolls.fenetreBlocs = 128;
faux.skins.venteBps = 1200n; faux.skins.mintUsdc = 2000000n;
faux.missions.faiseurBps = 8800n; faux.missions.reserveBps = 800n; faux.missions.devBps = 400n;
faux.tirage.seuilUsd = 12; faux.slots.spinPrice = 900000n; faux.tam.prix = 6000000n; /* game360: the new rows read CHIFFRES too */ faux.routeur.marcheBps = 60n; faux.missions.deploye = true;
const r = FR.rendre(faux, null);
for (const attendu of ['>0.15%<', '0.11% to TokenizedBlock', '0.04% to the block', '0.002 ETH', '0.0015 ETH when', '0.0005 ETH when', '>0.70 USDC<', '>12 USDC<', '25 rolls',
  '48 hours', '60% goes to the roll pot', '0.6% on a single Uniswap v4 market', 'Doer 88%', 'community reward wallet 8%', 'TokenizedBlock 4%', 'takes 12% of each sale', '>2 USDC<',
  'within 128 blocks', '0.60 USDC', '>0.90 USDC<', '>6 USDC<'])
  ok(r.includes(attendu), 'rendu FAUX contient « ' + attendu + ' » (sinon : chiffre tape a la main)');
ok(/\$12(?!\d)/.test(r) && !/\$10(?!\d)/.test(r), 'rendu FAUX : seuil $12, plus de $10');
for (const ancien of ['0.50 USDC', '>10 USDC<', '0.07%', '0.03%', '0.0007', '24 hours', 'Doer 90%', 'takes 10%', '>1 USDC<', 'at 10 USDC', 'within 256'])
  ok(!r.includes(ancien), 'rendu FAUX ne garde pas « ' + ancien + ' »');
eq((r.match(/not deployed/gi) || []).length, (vrai.match(/not deployed/gi) || []).length - (FR.CHIFFRES.missions.deploye === true ? 0 : 1), 'missions deployees dans le FAUX -> une mention « not deployed » de moins (sauf si deja deployees dans le vrai)');
/* donnees en direct : le mode du tirage et le pot des rolls, LUS ; non lus -> dit « not read », jamais 0 */
ok(/not read/i.test(vrai), 'sans /api/tirage : « not read »');
/* ⛔ 2026-10-18 (Phil : « fini ca, on a tirage weekend et roll ») : la ligne « Daily draw … practice » est retiree ; re-pointe sur le pot de la
 *   SEMAINE lu (ticketpot.semaine), meme intention : une donnee en direct LUE, non lue -> dit, jamais un 0 ecrit */
const live = FR.rendre(FR.CHIFFRES, { mode: 'SHADOW', rolls: { pot: '250000', potLu: '2026-10-18T15:00:00.000Z' }, ticketpot: { semaine: { jourId: 'J2026-10-25', ferme: false, reste: '1500000', potAtClose: '0' } } });
ok(live.includes('0.25 USDC') && live.includes('1.50 USDC') && /Today's ticket = 1 entry in this week's reward pot\. This pot is the TicketPot pot of the week's last day/.test(live) /* game374 (G-week-1/3) */ && /2026-10-25, the week's last day/.test(live)
  && !/Daily draw|no prize yet|tickets are drawn/i.test(live), 'avec /api/tirage : pot des rolls 0.25 USDC, pot de la semaine 1.50 USDC lu et son jour — plus de « Daily draw »');
const live2 = FR.rendre(FR.CHIFFRES, { mode: 'SHADOW', rolls: { pot: null } });
ok(/pot[^.]*not read/i.test(live2) && !live2.includes('0.00 USDC') && /The week's pot was not read just now\./.test(live2), 'pot null / pot de la semaine absent -> « not read », jamais un 0 ecrit');

/* la mesure des launchpads n est pas une constante de contrat. game374 (audit R-launch-3/4) : c est la mesure la plus RECENTE, celle que porte
 *   pool-lanceur-taxe.js (2026-10-26 : 129 / 129, 99 980 006 964 wei rendus) — plus celle du 2026-10-18 notee dans app.html (15/15, 0,0099 %) */
const plt = lire('pool-lanceur-taxe.js');
ok(plt.includes('taxBps() (0x3eacd2f8) = ' + FR.MESURE_LAUNCHPAD.taxBps) && plt.includes('99 980 006 964 wei') && plt.includes(FR.MESURE_LAUNCHPAD.poolsVides + ' / ' + FR.MESURE_LAUNCHPAD.poolsLues)
  && FR.MESURE_LAUNCHPAD.rendusWei === 99980006964n && FR.MESURE_LAUNCHPAD.payeWei === 10n ** 15n,
  'MESURE_LAUNCHPAD = la mesure notee dans pool-lanceur-taxe.js');
/* les conclusions « perd en moyenne » sont CALCULEES : avec des gains enormes, la page ne doit plus les dire */
const genereux = structuredClone(FR.CHIFFRES);
Object.assign(genereux.rolls, { prize2: 400000000n, prize3: 400000000n, prize4: 400000000n, prize5: 400000000n });
const rg = FR.rendre(genereux, null);
ok(!rg.includes('Rolls lose on average.') && !rg.includes('A pass loses on average too.'), 'gains enormes -> la page ne dit plus « lose on average »');

/* ---- 4. la coquille statique, le service, les liens */
const page = lire('frais-et-risques.html');
ok(/<meta name="viewport" content="width=device-width/.test(page), 'page : viewport mobile');
ok(/import\s*\{[^}]*\}\s*from\s*'\.\/frais-risques\.js'/.test(page), 'page : importe frais-risques.js');
const statique = page.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ');
ok(!/\d/.test(statique), 'page : le texte statique ne porte AUCUN chiffre (tout vient du module) — trouve : ' + (statique.match(/.{0,20}\d.{0,20}/) || [''])[0]);
const serveur = lire('serveur-web.js');
const bloc = serveur.match(/const SERVIS\s*=\s*\[([\s\S]*?)\];/);
const servis = new Set([...bloc[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
for (const f of ['frais-et-risques.html', 'frais-risques.js', 'frais-contrats.js', 'tirage-saison.js']) ok(servis.has(f), f + ' est servi');
ok(lire('test-imports-servis.mjs').includes("'frais-et-risques.html'"), 'test-imports-servis suit les imports de la page');
const app = lire('app.html');
const learn = app.slice(app.indexOf('<section class="volet" id="v-learn"'), app.indexOf('</section>', app.indexOf('<section class="volet" id="v-learn"')));
ok(learn.includes('href="frais-et-risques.html"'), 'app : le « ? » (Learn) lie la page');
const regle = app.slice(app.indexOf('id="regleCarte"'), app.indexOf('</section>', app.indexOf('id="regleCarte"')));
ok(regle.includes('href="frais-et-risques.html"'), 'app : « How it works » du Game lie la page');
ok(!/href="frais\.html"/.test(app), 'app : ne lie PAS frais.html (page privee d encaissement, noindex)');

console.log('test-frais-et-risques : ' + n + ' assertions OK');
