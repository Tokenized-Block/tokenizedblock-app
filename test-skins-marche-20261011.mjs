/* test-skins-marche-20261011.mjs - LE MARCHE DES SKINS dans la boutique du panneau (Phil, 2026-10-11 : « le market des skins … enchères …
 * des fees de l app pour chaque achat vente »). Lit app.html (TB_APP = une autre version, pour la preuve rouge).
 * AFFIRME (cablage) : la boutique pose #bcMarche et le peint ; une lecture ratee le DIT (jamais une vitrine vide) ; chaque ligne ne
 *   propose que actionsSkin (logique pure, testee dans test-blockskins-module) ; en jeton, solde ET autorisation relus AVANT de signer,
 *   approbation EXACTE du montant, jamais illimitee ; un envoi diffuse sans confirmation ne se relance pas ; un credit n est un montant
 *   que si la reponse est UN mot de 32 octets ; aucun texte d ecran ne dit « NFT » ni ne montre l adresse de frais.
 * PROUVE AILLEURS (navigateur, 2026-10-11, vitrine simulee de 3 skins, soldes reels) : Buy 2 USDC -> « holds 0.147422 USDC — this needs
 *   2 USDC. Nothing was asked. » ; Bid -> bid(2, 1.05e15) valeur 1.05e15 vers v2 ; Sell 0.5 USDC -> list(3, USDC, 500000) ; 0.0000001 refuse.
 * NE PROUVE PAS : un vrai wallet, une vraie vente on-chain (le banc app fork 24/0 joue les memes appels). */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const corps = (nom) => { const i = html.indexOf(nom); if (i < 0) return ''; const j = html.slice(i + 10).search(/\n(async )?function /); return html.slice(i, j > 0 ? i + 10 + j : i + 6000); };
const boutique = corps('function bcPeindreBoutique('), marche = corps('async function bcPeindreMarche('), ligne = corps('function bcLigneSkin('), action = corps('async function bcActionMarche(');
vu(marche.length > 0 && ligne.length > 0 && action.length > 0, 'app.html n a pas le marche des skins (bcPeindreMarche / bcLigneSkin / bcActionMarche)');
/* 2026-10-26: the skins market box has its OWN id (#bcSkinsMarket) — #bcMarche is the tiles box of the Market view */
vu(/z\.append\(bcEl\('div', \{ cls: 'bcMarche', id: 'bcSkinsMarket' \}\)\);\s*void bcPeindreMarche\(\);/.test(boutique) && /const z = \$\('#bcSkinsMarket'\);/.test(marche), 'the shop does not place the market (or bcPeindreMarche does not paint into ITS box)');
vu(/if \(r\.etat !== 'LU'\) \{[\s\S]{0,120}could not be read right now — nothing is listed rather than a wrong list/.test(marche), 'une lecture ratee du marche doit etre DITE');
vu(/const acts = actionsSkin\(s, moi, t\);/.test(ligne) && !/ACHETER'|ENCHERIR'/.test(ligne.replace(/acts\.includes\('(ACHETER|ENCHERIR|REGLER|RETIRER|METTRE_EN_VENTE)'\)/g, '').replace(/bouton\([^;]*\);/g, '')),
  'les boutons d une ligne doivent venir de actionsSkin (ce que le contrat accepterait), pas d une regle a cote');
const iSolde = action.indexOf('bcSolde(s.devise, compte)'), iAutorise = action.indexOf("'0xdd62ed3e'"), iApprob = action.indexOf('appels.push(appelApprouver(s.devise, montant,'), iSigner = action.indexOf("await bcSigner(m, appels, 'skin_vente')");
vu(iSolde > 0 && iAutorise > 0 && iApprob > iSolde && iApprob > iAutorise && iSigner > iApprob, 'en jeton : solde ET autorisation relus AVANT l approbation, elle-meme avant la signature');
vu(/if \(autorise < montant\) appels\.push\(appelApprouver\(s\.devise, montant,/.test(action) && !/MAX_UINT|ffffffffffffffff|2n \*\* 256n/.test(action), 'approbation EXACTE du montant, seulement si besoin, jamais illimitee');
vu(/if \(r\.diffusee\) \{ bcEtape\(m, 'Sent, not confirmed yet/.test(action), 'un envoi diffuse sans confirmation ne doit pas etre relance');
vu(/\/\^0x\[0-9a-f\]\{64\}\$\/i\.test\(brut\) \? BigInt\(brut\) : null/.test(marche), 'un credit n est un montant que si la reponse est UN mot de 32 octets');
/* S.I PROPOSE, LA PERSONNE SIGNE (choix de Phil, 2026-10-11) : bcAifiProposerSkin EXECUTE avec la vraie propositionSkin et des bouchons */
const { propositionSkin, ETH, cleSkin } = await import('./blockskins.js');
const iP = html.indexOf('async function bcAifiProposerSkin(');
vu(iP > 0 && /setInterval\(\(\) => \{ if \(bc\.aifi && !document\.hidden\) void bcAifiProposerSkin\(\); \}, 30000\);/.test(html), 'S.I ne lit pas le marche des skins (bcAifiProposerSkin + minuterie)');
const mP = /\r?\n\}\r?\n/.exec(html.slice(iP)), srcP = html.slice(iP, iP + mP.index + mP[0].length);
const MOI = '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b', BLK = '0xb200000000000000000000e4b0c5fbe9c8df579e', AUTRE = '0x' + '5'.repeat(40);
const rec = { id: 'random', angle: 1, h: [2, 3, 4], cube: 5, noyau: 6, fond: 7 };
const vitrine = [{ tokenId: 6n, detenteur: AUTRE, block: BLK, recette: rec, enVente: true, enchere: false, devise: ETH, prix: 2n * 10n ** 15n, fin: 0, encherisseur: ETH, offre: 0n }];
const lancer = async ({ aifi, compte, skins = vitrine, etat = 'LU', etatSI }) => {
  const cartes = [], st = etatSI || { derniere: 0, proposes: new Set(), enVol: false };
  const bc = { aifi };
  const fn = new Function('bc', 'compte', 'CHAINE', 'bcAifiSkins', 'lireSkins', 'rpc', 'BC_AIFI_ETH', 'propositionSkin', 'bcAifiSauver', 'bcAifiPeindre', 'bcOuvrirPop', 'bcActionMarche', 'cleSkin',
    srcP + '\nreturn bcAifiProposerSkin();');
  await fn(bc, compte, 8453, st, async () => (etat === 'LU' ? { etat, total: skins.length, skins } : { etat }), null, () => ({ adr: ETH, sym: 'ETH', dec: 18 }), propositionSkin,
    () => {}, () => {}, () => {}, async (g, s, x, qui) => { cartes.push({ g, id: s.tokenId, qui }); }, cleSkin);
  return { cartes, aifi: bc.aifi, st };
};
/* 2026-10-11 (Phil : « t as pas ajoute le mode autonome suggestion au S.I ») : les propositions de skins suivent la regle VISIBLE
 *   « Suggest skins… » (skins: true), plus la regle d achat des echanges */
const SI = () => ({ block: BLK, achat: false, skins: true, devise: { adr: ETH, sym: 'ETH', dec: 18 }, parTrade: String(10n ** 16n), budget: String(10n ** 16n), propose: '0' });
let x = await lancer({ aifi: SI(), compte: MOI });
vu(x.cartes.length === 1 && x.cartes[0].g === 'ACHETER' && x.cartes[0].id === 6n && x.cartes[0].qui === 'Its brain · S.I', 'S.I ouvre UNE carte d achat (signee par la personne), au nom du brain');
vu(x.aifi.propose === String(2n * 10n ** 15n), 'la proposition compte dans le budget de S.I comme un trade : ' + x.aifi.propose);
const apres = await lancer({ aifi: x.aifi, compte: MOI, etatSI: x.st });
vu(apres.cartes.length === 0, 'pas une deuxieme proposition dans les 2 minutes');
x.st.derniere = 0;
const memeSkin = await lancer({ aifi: SI(), compte: MOI, etatSI: x.st });
vu(memeSkin.cartes.length === 0, 'jamais deux fois la meme skin dans la session');
vu((await lancer({ aifi: SI(), compte: null })).cartes.length === 0 && (await lancer({ aifi: null, compte: MOI })).cartes.length === 0, 'sans wallet ou sans S.I : rien');
vu((await lancer({ aifi: SI(), compte: MOI, etat: 'NON_LU' })).cartes.length === 0, 'marche non lu : rien (jamais une proposition sur une lecture ratee)');
vu((await lancer({ aifi: { ...SI(), skins: false, achat: true }, compte: MOI })).cartes.length === 0, 'regle « Suggest skins » non cochee : aucune proposition de skin (meme avec la regle d achat des echanges)');
vu(/<input type="checkbox" id="bcAiSkins"><span>Suggest skins for this block from the market — you sign each<\/span>/.test(html), 'la regle « Suggest skins » n est pas a l ecran de S.I');
vu(/skins = !!\(\$\('#bcAiSkins'\) && \$\('#bcAiSkins'\)\.checked\);/.test(html) && /bc\.aifi = \{ block: a, achat, vente, skins,/.test(html) && /'#bcAiSkins', '#bcAiDevise'/.test(html),
  'la regle est lue au demarrage, gardee dans l etat de S.I et verrouillee pendant la marche');
vu(/if \(\(achat \|\| skins\) && \(parTrade === null/.test(html), 'la regle skins exige les memes bornes (montant par trade, budget) qu un achat');
const ecran = [marche, ligne, action].join('\n').match(/(?:bcEtape|bcMessage)\([^;]*?\);|text: '[^']*'|textContent = [^;]*;/g) || [];
vu(ecran.length > 10, 'textes d ecran du marche introuvables');
for (const l of ecran) vu(!/\bNFTs?\b|FEE_WALLET|beneficiaire|0xa6cf/i.test(l), 'texte d ecran interdit : ' + l.slice(0, 120));
console.log('ok skins-marche - ' + n + ' assertions (cablage) ; gestes prouves au navigateur sur vitrine simulee, pas avec un vrai wallet');
