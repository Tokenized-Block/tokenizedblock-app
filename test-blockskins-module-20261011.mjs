/* test-blockskins-module-20261011.mjs - blockskins.js : l app et le contrat BlockSkins DEPLOYE (skin du block, decision de Phil le 2026-10-11).
 * AFFIRME (EXECUTE) : la recette de l app -> 7 teintes dans l ordre du contrat (tour, anneau 1-3, aretes, noyau, fond), pack/unpack
 *   aller-retour, refus hors 0..359 ; les appels portent le bon selecteur, l adresse DEPLOYEE, la valeur ETH seulement pour l ETH ;
 *   approbation EXACTE (jamais illimitee) ; enchere > 7 jours refusee ; offre minimale = +5 % ET strictement au-dessus ; partage 90/10 ;
 *   decodage d une vitrine skinsPage (11 mots par skin) ; skinPortee = la derniere skin DETENUE pour CE block.
 * NE PROUVE PAS : l accord avec le contrat reel (sonde eth_call packRecipe + banc fork), ni un vrai wallet. */
import { strict as assert } from 'node:assert';
import * as S from './blockskins.js';
import { selecteur } from './encodeur.js';
import { BLOCKSKINS_DEPLOIEMENT } from './blockskins-deploiement.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const R = { id: 'random', angle: 10, h: [20, 30, 359], cube: 0, noyau: 200, fond: 300 };
const D = BLOCKSKINS_DEPLOIEMENT;
/* 2026-10-18 (v3 a 10 USDC prepare, pas encore signe) : l app prend le PREMIER enregistrement DEPLOYE de la chaine racine -> precedent -> … ;
 *   son adresse ET son prix (mintPriceUsdc, relu sur la chaine quand l adresse a ete notee) viennent de lui (blockskins-actif.js). */
/* 2026-11-12 (the economy pack is live): the chain starts at the pack's Skins (blockskins-actif.js SKINS_PACK), whose precedent IS this record */
/* 2026-11-13: the 1 USDC Skins is deployed and noted (skins-spin-deploiement.js): the chain now starts at it (blockskins-actif.js SKINS_UN),
 *   then the pack's Skins, then this record. The chain is walked from the active record as long as THIS record is somewhere in it. */
const contient = (r) => { for (let x = r, i = 0; x && i < 16; x = x.precedent, i += 1) if (x === D) return true; return false; };
const chaine = []; for (let x = (contient(S.BLOCKSKINS_ACTIF) ? S.BLOCKSKINS_ACTIF : D); x; x = x.precedent) chaine.push(x);
const actif = chaine.find((x) => /^0x[0-9a-f]{40}$/i.test(String(x.adresse || '')));
vu(!!actif && S.BLOCKSKINS === String(actif.adresse).toLowerCase() && S.BLOCKSKINS_ACTIF === actif, 'l adresse lue n est pas celle du premier enregistrement deploye');
{
  const { SKINS_SPIN_DEPLOIEMENT: SSR } = await import('./skins-spin-deploiement.js');
  vu(contient(S.BLOCKSKINS_ACTIF) && S.BLOCKSKINS === SSR.etapes[0].adresse && S.BLOCKSKINS_ACTIF.version === 'un' && S.BLOCKSKINS_ACTIF.precedent && S.BLOCKSKINS_ACTIF.precedent.version === 'pack'
    && chaine.length >= 4, 'l actif n est pas le Skins a 1 USDC note (skins-spin-deploiement.js), suivi de Skins du pack puis de cet enregistrement');
}
vu(S.SKIN_MINT_USDC === BigInt(actif.mintPriceUsdc) && S.SKIN_MINT_TEXTE === (S.SKIN_MINT_USDC / 1000000n).toString() + ' USDC', 'le prix de mint ne vient pas de l enregistrement du contrat actif');
/* Phil, 2026-10-11 : « v2 avant tout mint ». La porte suit l ENREGISTREMENT de deploiement (genere), jamais un drapeau a la main :
 *   ouverte si et seulement si imageDansLeWallet === true (derive de la source) sur le contrat ACTIF (deploye) ; v1 (0xea6c…, tokenURI sans
 *   image) la garde FERMEE. */
vu(S.SKIN_MINT_OUVERT === (actif.imageDansLeWallet === true), 'la porte du mint ne suit pas l enregistrement de deploiement');
vu(S.BLOCKSKINS !== '0xea6ccb19714504ae3286e82febbe627f9d0ce77d' || S.SKIN_MINT_OUVERT === false, 'le mint est OUVERT sur le contrat v1 qui ne montre pas la skin dans un wallet');
vu(D.adresse !== null || actif !== D, 'v3 pas deploye (adresse null) : l app doit tomber sur le precedent deploye');
vu(JSON.stringify(S.recetteVersTeintes(R)) === '[10,20,30,359,0,200,300]', 'ordre des teintes faux');
const p = S.packRecette(R);
vu(p === (10n | 20n << 9n | 30n << 18n | 359n << 27n | 0n << 36n | 200n << 45n | 300n << 54n) && (p >> 63n) === 0n, 'pack faux : ' + p);
vu(JSON.stringify(S.unpackRecette(p)) === JSON.stringify(R), 'aller-retour pack/unpack faux');
for (const mauvais of [{ ...R, angle: 360 }, { ...R, h: [1, 2] }, { ...R, fond: -1 }, { ...R, id: 'gold' }, null]) {
  let leve = false; try { S.packRecette(mauvais); } catch (_) { leve = true; }
  vu(leve, 'recette invalide acceptee : ' + JSON.stringify(mauvais));
}
const B = '0xb200000000000000000000e4b0c5fbe9c8df579e', USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
/* 2026-11-12 (the economy pack is live): the active contract is paid through the TBLOCK router only: no direct mint (economie-pack.js payBatch +
 *   dataSkin build the payment; test-bascule-pack-economie-v2 and the fork bench check them) */
let sansMint = false; try { S.appelMint(B, R); } catch (_) { sansMint = true; }
vu(S.BLOCKSKINS_ACTIF.routeur ? sansMint : true, 'un mint direct est construit sur un contrat paye par le routeur');
const a = S.appelApprouver(USDC, S.SKIN_MINT_USDC);
vu(a.to === USDC && a.data.startsWith('0x095ea7b3') && a.data.slice(10, 74).endsWith(S.BLOCKSKINS.slice(2)) && BigInt('0x' + a.data.slice(74)) === BigInt(actif.mintPriceUsdc), 'approbation pas exacte (le prix de l enregistrement actif)');
let leve = false; try { S.appelApprouver(USDC, 0n); } catch (_) { leve = true; } vu(leve, 'approbation de 0 acceptee');
/* le nom de chaque etape S AFFICHE dans la carte de signature (« Step 2 of 2: ... ») : jamais « NFT » (Phil, 2026-10-11).
 *   ROUGE sur 3693e6f : 'Mint this skin as your NFT — 1 USDC to TokenizedBlock'. */
const etapes = [a, S.appelMettreEnVente(7n, USDC, 2000000n), S.appelRetirer(7n), S.appelAcheter(7n, USDC, 2000000n), S.appelOuvrirEnchere(7n, USDC, 1000000n, 3600n),
  S.appelEncherir(7n, USDC, 9n), S.appelRegler(7n), S.appelRetirerCredit(USDC)];
vu(etapes.every((x) => typeof x.nom === 'string' && x.nom.length > 0 && !/\bNFTs?\b/i.test(x.nom)), 'une etape affichee dit « NFT » ou n a pas de nom : ' + etapes.map((x) => x.nom).filter((t) => !t || /\bNFTs?\b/i.test(t)).join(' | '));
vu(S.appelAcheter(7n, S.ETH, 5n * 10n ** 15n).value === '0x' + (5n * 10n ** 15n).toString(16) && S.appelAcheter(7n, USDC, 2000000n).value === '0x0', 'valeur ETH / jeton fausse a l achat');
vu(S.appelEncherir(7n, S.ETH, 9n).value === '0x9' && S.appelEncherir(7n, USDC, 9n).value === '0x0', 'valeur ETH / jeton fausse a l enchere');
leve = false; try { S.appelOuvrirEnchere(7n, USDC, 1000000n, 604801n); } catch (_) { leve = true; } vu(leve, 'enchere de plus de 7 jours acceptee');
vu(S.appelOuvrirEnchere(7n, USDC, 1000000n, 604800n).data.startsWith('0x' + selecteur('startAuction(uint256,address,uint256,uint256)')), 'startAuction mal encode');
/* 2026-10-11 : le test passait en lisant le MEME mauvais champ que le module (`enchere`) - le banc fork l a attrape (minimum 2 wei).
 *   Il lit desormais les objets que rend decoderPage (`offre`, et `enchere` = booleen), comme l app. */
vu(S.offreMinimale({ prix: 100n, offre: 0n, enchere: true }) === 100n && S.offreMinimale({ prix: 100n, offre: 1000n, enchere: true }) === 1050n
  && S.offreMinimale({ prix: 1n, offre: 10n, enchere: true }) === 11n, 'offre minimale fausse (prix sans offre, +5 %, strictement au-dessus)');
vu(S.partage(1000000n).frais === 100000n && S.partage(1000000n).vendeur === 900000n && S.partage(9n).frais === 0n, 'partage 90/10 faux');
/* une vitrine de 2 skins (11 mots chacune), telle que la rend skinsPage */
const w = (x) => BigInt(x).toString(16).padStart(64, '0'), aw = (x) => x.slice(2).padStart(64, '0');
const MOI = '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b', AUTRE = '0x' + '5'.repeat(40);
const skin = (id, det, blk, rec, vente, ench, dev, prix, fin, enc, offre) => [w(id), aw(det), aw(blk), w(rec), w(vente), w(ench), aw(dev), w(prix), w(fin), aw(enc), w(offre)].join('');
const page = '0x' + w(32) + w(2) + skin(1, MOI, B, p, 0, 0, S.ETH, 0, 0, S.ETH, 0) + skin(2, AUTRE, B, p, 1, 1, USDC, 3000000, 1800000000, MOI, 3150000);
const d = S.decoderPage(page);
vu(d.length === 2 && d[0].tokenId === 1n && d[0].detenteur === MOI && d[0].block === B && JSON.stringify(d[0].recette) === JSON.stringify(R) && !d[0].enVente, 'skin 1 mal decodee');
vu(d[1].enVente && d[1].enchere && d[1].devise === USDC && d[1].prix === 3000000n && d[1].fin === 1800000000 && d[1].encherisseur === MOI && d[1].offre === 3150000n, 'skin 2 mal decodee');
vu(S.offreMinimale(d[1]) === 3307500n && S.offreMinimale(d[0]) === 0n, 'offreMinimale sur une skin DECODEE (3 150 000 + 5 %) : ' + S.offreMinimale(d[1]));
leve = false; try { S.decoderPage('0x' + w(32) + w(3) + skin(1, MOI, B, p, 0, 0, S.ETH, 0, 0, S.ETH, 0)); } catch (_) { leve = true; } vu(leve, 'une vitrine tronquee est acceptee');
vu(S.skinPortee(d, MOI, B).tokenId === 1n && S.skinPortee(d, MOI, AUTRE) === null && S.skinsDe(d, AUTRE).length === 1, 'skin portee / skins d un compte faux');
/* LE MARCHE (2026-10-11) : la vitrine ne propose que ce que le contrat ACCEPTERAIT pour CE compte, a CET instant */
vu(S.DEVISES_SKIN[S.ETH].dec === 18 && S.DEVISES_SKIN[USDC].sym === 'USDC' && S.DEVISES_SKIN[USDC].dec === 6 && Object.keys(S.DEVISES_SKIN).length === 2,
  'devises du marche : ETH et l USDC du constructeur, rien d autre tant que l owner n a rien admis');
vu(S.montantVersBrut('2', 6) === 2000000n && S.montantVersBrut('0.015', 18) === 15n * 10n ** 15n && S.montantVersBrut('1,5', 6) === 1500000n && S.montantVersBrut(' 3 ', 6) === 3000000n,
  'montant tape -> unites brutes (2 USDC, 0.015 ETH, virgule, espaces)');
for (const mauvais of [['0.0000001', 6], ['abc', 6], ['0', 6], ['-1', 6], ['1e3', 6], ['', 6], ['0.000', 6]]) {
  let refuse = false; try { S.montantVersBrut(mauvais[0], mauvais[1]); } catch (_) { refuse = true; }
  vu(refuse, 'montant invalide accepte : ' + JSON.stringify(mauvais));
}
const T = 1800000000;
const fixe = { ...d[0], enVente: true, enchere: false, prix: 2000000n };
const encSansOffre = { ...d[1], encherisseur: S.ETH, offre: 0n };
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
vu(egal(S.actionsSkin(d[0], MOI, T - 1), ['METTRE_EN_VENTE', 'OUVRIR_ENCHERE']) && egal(S.actionsSkin(d[0], AUTRE, T - 1), []), 'sa skin hors vente : la vendre ou l encherir ; un autre : rien');
vu(egal(S.actionsSkin(fixe, MOI, T - 1), ['RETIRER']) && egal(S.actionsSkin(fixe, AUTRE, T - 1), ['ACHETER']), 'prix fixe : le vendeur retire, un autre achete');
vu(egal(S.actionsSkin(d[1], MOI, T - 1), ['ENCHERIR']) && egal(S.actionsSkin(d[1], AUTRE, T - 1), []), 'enchere en cours AVEC offre : un autre encherit ; le vendeur ne peut rien (HasBids)');
vu(egal(S.actionsSkin(encSansOffre, AUTRE, T - 1), ['RETIRER']), 'enchere en cours SANS offre : le vendeur peut la retirer');
vu(egal(S.actionsSkin(d[1], MOI, T), ['REGLER']) && egal(S.actionsSkin(d[1], AUTRE, T + 5), ['REGLER']), 'enchere finie (a la seconde de fin comprise) : n importe qui regle');
vu(egal(S.actionsSkin(fixe, null, T), []) && egal(S.actionsSkin(fixe, '0x123', T), []) && egal(S.actionsSkin(fixe, AUTRE, NaN), []), 'sans compte valide ou sans heure : aucune action');
/* LE BRAIN PROPOSE (Phil : « le brain propose, tu signes ») : au plus UNE proposition, bornee par S.I */
const P = (o) => S.propositionSkin({ moi: MOI, block: B, maintenant: T - 10, achat: true, devise: S.ETH, parTrade: 10n ** 16n, reste: 10n ** 16n, ...o });
const fixeEth = (id, prix, det = AUTRE) => ({ ...d[0], tokenId: BigInt(id), detenteur: det, enVente: true, enchere: false, devise: S.ETH, prix: BigInt(prix) });
const encEth = { ...d[1], tokenId: 9n, devise: S.ETH, prix: 10n ** 15n, offre: 10n ** 15n, encherisseur: '0x' + '7'.repeat(40), fin: T };
let pr = P({ skins: [fixeEth(5, 3n * 10n ** 15n), fixeEth(6, 2n * 10n ** 15n), encEth] });
vu(pr && pr.genre === 'ACHETER' && pr.skin.tokenId === 6n && pr.montant === 2n * 10n ** 15n, 'le brain propose d ACHETER la moins chere a prix fixe de ce block');
vu(P({ skins: [fixeEth(5, 3n * 10n ** 16n)] }) === null, 'au-dessus du montant par trade : rien');
vu(P({ skins: [fixeEth(5, 5n * 10n ** 15n)], reste: 10n ** 15n }) === null, 'au-dessus du budget restant : rien');
vu(P({ skins: [fixeEth(5, 10n ** 15n)], achat: false }) === null, 'regle « buy » non cochee : aucun achat propose');
vu(P({ skins: [fixeEth(5, 10n ** 15n, MOI)] }) === null, 'jamais sa propre annonce');
vu(P({ skins: [{ ...fixeEth(5, 10n ** 15n), block: AUTRE }] }) === null, 'une skin d un AUTRE block : rien');
vu(P({ skins: [{ ...fixeEth(5, 1000000n), devise: USDC }] }) === null, 'une skin en USDC quand S.I paie en ETH : rien');
vu(P({ skins: [fixeEth(6, 10n ** 15n)], dejaProposes: new Set(['6']) }) === null, 'jamais deux fois la meme skin dans la session');
pr = P({ skins: [encEth] });
vu(pr && pr.genre === 'ENCHERIR' && pr.montant === 1050000000000000n, 'sans prix fixe : encherir au MINIMUM (+5 %)');
pr = P({ skins: [fixeEth(6, 10n ** 15n), { ...encEth, encherisseur: MOI }], maintenant: T + 1 });
vu(pr && pr.genre === 'REGLER' && pr.skin.tokenId === 9n, 'une enchere FINIE gagnee par ce compte passe avant tout : la regler');
vu(S.propositionSkin({ skins: [fixeEth(6, 10n ** 15n)], moi: null, block: B, maintenant: T, achat: true, devise: S.ETH, parTrade: 1n, reste: 1n }) === null, 'sans compte : rien');
/* LES ACTIONS COMME DEVISE (Phil, 2026-10-11 : « les 9 plus profondes ») : jamais affichees sans currencyAllowed LU a vrai */
const { ACTIONS_COINBASE } = await import('./paires.js');
vu(S.SKIN_ACTIONS_CANDIDATES.length === 9 && S.SKIN_ACTIONS_CANDIDATES.every((c) => ACTIONS_COINBASE.some((x) => x.symbole === c.sym && x.adr.toLowerCase() === c.adr))
  && JSON.stringify(S.SKIN_ACTIONS_CANDIDATES.map((c) => c.sym)) === JSON.stringify(['NVDAc', 'AMZNc', 'AAPLc', 'GOOGLc', 'TSLAc', 'METAc', 'MSFTc', 'MSTRc', 'SPCXc']), 'les 9 candidates = celles de paires.js, dans l ordre choisi');
const adm = S.appelAdmettre(S.SKIN_ACTIONS_CANDIDATES[0].adr);
vu(adm.to === S.BLOCKSKINS && adm.value === '0x0' && adm.data === '0x' + selecteur('setCurrency(address,bool)') + S.SKIN_ACTIONS_CANDIDATES[0].adr.slice(2).padStart(64, '0') + '1'.padStart(64, '0'), 'setCurrency(action, true) mal encode');
const parSym = (s) => S.SKIN_ACTIONS_CANDIDATES.find((c) => c.sym === s);
const [NV, AA, GO] = [parSym('NVDAc'), parSym('AMZNc'), parSym('GOOGLc')];
const rpcDev = async (m, p) => {
  const to = p[0].to.toLowerCase(), data = p[0].data;
  if (to === S.BLOCKSKINS) { if (data.endsWith(GO.adr.slice(2))) throw new Error('429'); return '0x' + (data.endsWith(NV.adr.slice(2)) ? 1n : 0n).toString(16).padStart(64, '0'); }
  if (to === NV.adr) return '0x' + (8n).toString(16).padStart(64, '0');
  throw new Error('unexpected ' + to);
};
const dv = await S.lireDevisesSkin({ rpc: rpcDev, candidats: [NV, AA, GO] });
vu(dv.devises[NV.adr] && dv.devises[NV.adr].sym === 'NVDAc' && dv.devises[NV.adr].dec === 8 && !dv.devises[AA.adr] && !dv.devises[GO.adr], 'admise (lue a vrai) : affichee avec ses decimales lues ; non admise : absente');
vu(JSON.stringify(dv.nonLues) === '["GOOGLc"]' && dv.devises[S.ETH] && dv.devises[USDC], 'lecture ratee : dite non lue, PAS ajoutee ; ETH et USDC restent toujours');
vu(S.appelCredit(S.ETH, MOI) ==='0x' + selecteur('pending(address,address)') + '0'.repeat(64) + MOI.slice(2).padStart(64, '0'), 'pending(devise, compte) mal encode');
/* lireSkins : une lecture ratee n est JAMAIS une vitrine vide */
const r = await S.lireSkins({ rpc: async () => { throw new Error('429'); } });
vu(r.etat === 'NON_LU' && !Array.isArray(r.skins), 'une lecture ratee rend une liste vide');
const r0 = await S.lireSkins({ rpc: async () => '0x' + w(0) });
vu(r0.etat === 'LU' && r0.total === 0 && r0.skins.length === 0, 'zero skin mintee : pas LU/vide');
console.log('ok blockskins-module - ' + n + ' assertions ; NE PROUVE PAS l accord avec le contrat reel (sonde + banc fork)');
