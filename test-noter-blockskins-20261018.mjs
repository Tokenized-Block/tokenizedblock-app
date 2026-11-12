/* test-noter-blockskins-20261018.mjs - L ADRESSE DE v3 N EST INSCRITE QUE SI LE RECU, LA DONNEE SIGNEE ET LES RELECTURES CONCORDENT.
 * AFFIRME (noter(), pur, avec des stubs) : (1) un recu 0x1 d une creation dont l input == creation de la fiche, relectures = fiche (USDC,
 *   FEE_WALLET, MINT_PRICE = mintPriceUsdc) et owner() = signataire -> le texte porte adresse + tx + bloc + owner (et rien d autre ne change) ;
 *   le texte reecrit, REIMPORTE, fait de v3 le contrat ACTIF de blockskins-actif.js avec le prix 10 USDC ; (2) refus si : adresse deja ecrite ;
 *   input different d UN octet ; `to` present ; status 0x0 ; pas de contractAddress ; MINT_PRICE() relu = 1 USDC (la chaine n a pas le prix de
 *   la fiche : le mutant « fiche changee sans la chaine ») ; FEE_WALLET relu different ; owner() != signataire ; une relecture non lue ; bloc
 *   <= celui de v2 ; (3) RELECTURES couvre USDC, FEE_WALLET, MINT_PRICE, owner.
 * NE PROUVE PAS : un deploiement reel (aucun au 2026-10-18 : v3 attend la signature de Phil). */
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { noter, RELECTURES } from './contracts/noter-deploiement-blockskins.mjs';
import { BLOCKSKINS_DEPLOIEMENT as F } from './blockskins-deploiement.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const texte = fs.readFileSync(new URL('./blockskins-deploiement.js', import.meta.url), 'utf8');
const C = F.constructeur, A = '0x' + 'ab'.repeat(20), DE = '0x' + 'cd'.repeat(20), H = '0x' + '77'.repeat(32);
const tx = () => ({ hash: H, from: DE, to: null, input: F.creation });
const recu = () => ({ status: '0x1', transactionHash: H, contractAddress: A, blockNumber: '0x3253f4b' });
const rel = () => ({ 'USDC()': C.usdc, 'FEE_WALLET()': C.walletDesFrais, 'MINT_PRICE()': String(F.mintPriceUsdc), 'owner()': DE });
const bon = () => ({ fiche: F, texte, tx: tx(), recu: recu(), relectures: rel() });
vu(F.version === 3 && F.adresse === null && F.mintPriceUsdc === '10000000', 'la fiche du depot est v3, pas encore deployee, 10 USDC');
/* (1) */
const v = noter(bon());
vu(v.ok === true && v.adresse === A && v.bloc === 52772683 && v.owner === DE, 'inscrit : adresse + bloc + owner');
vu(v.texte.includes("  adresse: '" + A + "',") && v.texte.includes("  txDeploiement: '" + H + "',") && v.texte.includes('  blocDeploiement: 52772683, /* MINT_PRICE() 10000000 read back on chain */') && v.texte.includes("  owner: '" + DE + "',"),
  'les quatre lignes reecrites, le prix relu note a cote du bloc');
vu(v.texte.split('\n').length === texte.split('\n').length && v.texte.includes("sha256Creation: '" + F.sha256Creation + "'") && v.texte.includes("precedent: Object.freeze({ version: 2, adresse: '0xc0d12c7c84a574fbc65fd5182aecef51924d8e2f'"),
  'rien d autre ne change : meme nombre de lignes, meme empreinte, v2 toujours dans precedent');
vu(/ \* ⛔ v3 DEPLOYE \(bloc 52772683\)/.test(v.texte) && !/PAS ENCORE DEPLOYE/.test(v.texte), 'l en-tete dit DEPLOYE');
/* le texte note, REIMPORTE a cote de blockskins-actif.js : v3 devient le contrat actif, au prix 10 USDC — sans autre edition */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-noter-skins-'));
try {
  fs.writeFileSync(path.join(tmp, 'blockskins-deploiement.js'), v.texte);
  /* 2026-11-12 : l app mint sur Skins du pack economie (blockskins-actif.js SKINS_PACK, avant cet enregistrement) ; la REGLE de choix
   *   (contratActif : le premier deploye de la chaine) est celle qui est verifiee ici, sur la fiche notee reimportee */
  const M = await import(new URL('./blockskins-actif.js', import.meta.url).href);
  const notee = (await import(pathToFileURL(path.join(tmp, 'blockskins-deploiement.js')).href)).BLOCKSKINS_DEPLOIEMENT;
  const act = M.contratActif(notee);
  vu(String(act.adresse).toLowerCase() === A && act.version === 3 && BigInt(act.mintPriceUsdc) === 10000000n && M.usdcTexte(act.mintPriceUsdc) + ' USDC' === '10 USDC' && act.imageDansLeWallet === true,
    'une fois notee, v3 est le premier contrat deploye de cette fiche : adresse, 10 USDC, image (lu : ' + act.adresse + ' v' + act.version + ')');
  /* et la fiche notee n est PAS reinscriptible (une deuxieme adresse n ecrase jamais la premiere) */
  const r2 = noter({ ...bon(), fiche: (await import(pathToFileURL(path.join(tmp, 'blockskins-deploiement.js')).href)).BLOCKSKINS_DEPLOIEMENT, texte: v.texte });
  vu(r2.ok === false && /already carries an address/.test(r2.pourquoi), 'la fiche notee refuse une seconde inscription');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
/* (2) */
const refuse = (patch, m) => { const x = bon(); patch(x); const r = noter(x); vu(r.ok === false && typeof r.pourquoi === 'string' && r.pourquoi.length > 10, m + ' : refuse (' + (r.pourquoi || '').slice(0, 70) + ')'); };
refuse((x) => { x.fiche = { ...F, adresse: A, txDeploiement: H, blocDeploiement: 1, owner: DE }; }, 'adresse deja ecrite');
refuse((x) => { x.tx.input = F.creation.slice(0, -2) + (F.creation.endsWith('3') ? '4' : '3'); }, 'input different d un octet');
refuse((x) => { x.tx.to = A; }, 'to present');
refuse((x) => { x.recu.status = '0x0'; }, 'status 0x0');
refuse((x) => { delete x.recu.contractAddress; }, 'pas de contractAddress');
refuse((x) => { x.recu.transactionHash = '0x' + '78'.repeat(32); }, 'recu d une autre transaction');
refuse((x) => { x.relectures['MINT_PRICE()'] = '1000000'; }, 'MINT_PRICE() relu = 1 USDC alors que la fiche dit 10 (fiche changee sans la chaine)');
refuse((x) => { x.relectures['MINT_PRICE()'] = '10000001'; }, 'MINT_PRICE() relu = 10,000001 USDC');
refuse((x) => { x.relectures['FEE_WALLET()'] = '0x' + '99'.repeat(20); }, 'FEE_WALLET relu different');
refuse((x) => { x.relectures['owner()'] = '0x' + '99'.repeat(20); }, 'owner() n est pas le signataire');
refuse((x) => { x.relectures['USDC()'] = null; }, 'relecture non lue');
refuse((x) => { x.recu.blockNumber = '0x' + (52470279).toString(16); }, 'bloc <= celui de v2');
refuse((x) => { x.fiche = { ...F, version: 2 }; }, 'une fiche qui n est pas v3');
refuse((x) => { x.fiche = { ...F, mintPriceUsdc: 'abc' }; }, 'une fiche sans prix lisible');
/* (3) */
vu(JSON.stringify(RELECTURES.map((r) => r.sig)) === JSON.stringify(['USDC()', 'FEE_WALLET()', 'MINT_PRICE()', 'owner()']), 'les 4 relectures');
console.log('ok noter-blockskins - ' + n + ' assertions ; NE PROUVE PAS un deploiement reel (v3 attend la signature de Phil)');
