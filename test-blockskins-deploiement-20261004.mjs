/* test-blockskins-deploiement-20261004.mjs — CE QUE PHIL SIGNERA pour deployer BlockSkins, et la page qui le lui propose.
 *
 * Phil : « tu deploies, je signe — apres verification que tout est 100 % ok ». Le deploiement est UNE transaction de creation ;
 * elle est figee dans blockskins-deploiement.js (generee par contracts/preparer-deploiement-blockskins.mjs) et proposee au wallet
 * connecte par deployer-blockskins.html. Le banc fork (banc-blockskins-fork-20261004.mjs) deploie cette meme donnee.
 * A. la donnee figee : son empreinte se RECALCULE ; elle finit par les deux arguments du depot (USDC, wallet des frais) ; elle porte
 *    l empreinte de la SOURCE actuelle (une source modifiee sans regenerer = rouge) ; aucune adresse deployee n est declaree.
 * B. la page : n envoie que la donnee figee, sans `to` ni valeur, apres un appui ET si l empreinte recalculee dans le navigateur
 *    est la bonne ; elle relit sur la chaine ce que le contrat dit de lui-meme ; aucune cle, aucun argument saisi.
 * C. le serveur sert la page et la donnee ; l app n y renvoie nulle part.
 * ⛔ BORNE : rien ici ne prouve un deploiement reel ni un vrai wallet. La page n a PAS ete essayee avec un wallet connecte.
 * 2026-11-12: this standalone path is RETIRED (Skins ships as step S of the economy pack). A and B now pin the FROZEN record and the
 *   retired page as they are; C asserts that the page is no longer served and that its generator and noter refuse to run. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, f)).href + '?v=' + Math.random());
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const lire = (f) => fs.readFileSync(path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');

const { BLOCKSKINS_DEPLOIEMENT: D } = await imp('blockskins-deploiement.js');
const { USDC_BASE, FEE_WALLET } = await imp('frais-creation.js');
console.log('— A. la donnee figee');
const octets = Buffer.from(D.creation.slice(2), 'hex');
ok(/^0x[0-9a-f]+$/.test(D.creation) && octets.length === D.octetsCreation && crypto.createHash('sha256').update(octets).digest('hex') === D.sha256Creation,
  'A l empreinte sha256 de la donnee se recalcule (' + D.sha256Creation.slice(0, 16) + '…, ' + D.octetsCreation + ' octets)');
const fin = D.creation.slice(-128);
ok('0x' + fin.slice(24, 64) === USDC_BASE.toLowerCase() && '0x' + fin.slice(88, 128) === FEE_WALLET.toLowerCase() && /^0{24}$/.test(fin.slice(0, 24)) && /^0{24}$/.test(fin.slice(64, 88)),
  'A elle finit par les deux arguments du constructeur : le USDC et le wallet des frais DU DEPOT (frais-creation.js)');
ok(D.constructeur.usdc === USDC_BASE.toLowerCase() && D.constructeur.walletDesFrais === FEE_WALLET.toLowerCase() && D.chaine === 8453, 'A ce qu elle annonce (chaine 8453, USDC, wallet des frais) est ce qu elle encode');
/* 2026-11-12: the standalone v3 deploy path is RETIRED. contracts/src/BlockSkins.sol is now the ROUTER GAME of the economy pack (step S,
 *   constructor (router, feeWallet, dest, expectedTblock, expectedUsdc, rewards), no direct mint()), prepared by
 *   preparer-deploiement-pack-economie-v2.mjs. blockskins-deploiement.js is FROZEN as it was generated from the pre-pack source: the app
 *   reads the deployed v2 in `precedent` until the pack is deployed; preparer-deploiement-blockskins.mjs and the noter CLI refuse to run.
 *   So the record must carry the PRE-PACK source hashes (pinned here, copied from the record) and the current source must differ. */
const SHA_PRE_PACK = 'c11d841a8d9d1baba733bc4edc04d2f72606b39b0e7f7a2e54cf23b36c381f52', KECCAK_PRE_PACK = '0x718fc11ec974fd9f80e7f5d59929a7ccaba6c561dcf38e0b6cac32487ae97b67';
const solActuelle = lire('contracts/src/BlockSkins.sol');
ok(D.sha256Source === SHA_PRE_PACK && D.keccakSource === KECCAK_PRE_PACK && crypto.createHash('sha256').update(solActuelle).digest('hex') !== D.sha256Source
  && /address public immutable ROUTER;/.test(solActuelle) && !/function mint\(/.test(solActuelle),
  'A the record is FROZEN from the pre-pack source (pinned hashes); the current source is the router game (ROUTER, no direct mint), so it differs');
/* v1 DEPLOYE le 2026-10-04 par le proprietaire ; adresse, tx et owner donnes par SA page et RELUS sur la chaine le meme soir (input de la
 *   tx identique a la donnee figee v1, contrat cree a cette adresse, USDC()/FEE_WALLET()/owner() conformes). v2 DEPLOYE le 2026-10-11
 *   (verif-blockskins-deploye.mjs 8/8, MINT_PRICE() = 1 USDC relu). Le test epingle ce qui a ete relu, pour les DEUX.
 * v3 (2026-10-18, Phil : « tous les skins a 10 dollars ») : seul MINT_PRICE change (10 USDC) ; PAS deploye tant que `adresse` est null —
 *   l app reste alors sur v2 (`precedent`), le premier enregistrement deploye de la chaine. */
const P = D.precedent || {}, P1 = P.precedent || {};
ok(P.adresse === '0xc0d12c7c84a574fbc65fd5182aecef51924d8e2f' && P.txDeploiement === '0xc60a136835ff7864e2cb5999caee48b72578ae53c297659480deed3e6bf4ac56'
  && P.blocDeploiement === 52470279 && P.owner === '0x37eb9b7ce0b51fe12fbf092026e001918128580a' && P.version === 2 && P.mintPriceUsdc === '1000000' && P.imageDansLeWallet === true
  && P.constructeur && P.constructeur.usdc === USDC_BASE.toLowerCase() && P.constructeur.walletDesFrais === FEE_WALLET.toLowerCase() && Object.isFrozen(D) && Object.isFrozen(P),
  'A v2 (precedent) : adresse, transaction, bloc, owner et MINT_PRICE (1 USDC) relus sur la chaine, image dans le wallet ; objets figes');
ok(P1.adresse === '0xea6ccb19714504ae3286e82febbe627f9d0ce77d' && P1.txDeploiement === '0xc6e22bfa0b6a2dd931c59709b284d58be762a2b87317941168694f93126a2c9b'
  && P1.blocDeploiement === 52175537 && P1.owner === '0x37eb9b7ce0b51fe12fbf092026e001918128580a' && P1.version === 1 && P1.mintPriceUsdc === '1000000' && P1.imageDansLeWallet === false && Object.isFrozen(P1),
  'A v1 (precedent du precedent) : l adresse deployee, sa transaction, son bloc et son owner sont ceux relus sur la chaine ; jamais minte, sans image');
ok(D.version === 3 && (D.adresse === null ? D.txDeploiement === null && D.blocDeploiement === null && D.owner === null
  : /^0x[0-9a-f]{40}$/.test(D.adresse) && /^0x[0-9a-f]{64}$/.test(D.txDeploiement) && D.blocDeploiement > P.blocDeploiement && /^0x[0-9a-f]{40}$/.test(D.owner)),
  'A v3 : soit PAS deploye (adresse, tx, bloc, owner tous null), soit les quatre relus ensemble - jamais une adresse seule');
/* le prix de mint de v3 : LU dans la source compilee (MINT_PRICE) et retrouve dans le bytecode (PUSH) — ici on refait les deux lectures */
const solPrix = [...lire('contracts/src/BlockSkins.sol').matchAll(/uint256 public constant MINT_PRICE = ([0-9_]+);/g)];
const prixSource = solPrix.length === 1 ? BigInt(solPrix[0][1].replace(/_/g, '')).toString() : null;
const prixHex = prixSource ? BigInt(prixSource).toString(16).padStart(2 * Math.ceil(BigInt(prixSource).toString(16).length / 2), '0') : '';
ok(prixSource !== null && D.mintPriceUsdc === prixSource && D.mintPriceUsdc === '10000000' && D.creation.includes((0x5f + prixHex.length / 2).toString(16) + prixHex),
  'A mintPriceUsdc (' + D.mintPriceUsdc + ') = la constante MINT_PRICE de la source (10 USDC), et son PUSH est dans la donnee signee');
ok(D.imageDansLeWallet === (lire('contracts/src/BlockSkins.sol').includes('"image":"data:image/svg+xml;base64,')) && D.imageDansLeWallet === true,
  'A imageDansLeWallet est DERIVE de la source (son tokenURI porte un champ image) - et la source v3 le porte');
ok(octets.length - 64 <= 49152 && octets.length > 1000, 'A le code de creation tient sous la limite EIP-3860 (49 152 octets)');

console.log('— B. la page');
const page = lire('deployer-blockskins.html');
const script = (page.match(/<script type="module">([\s\S]*?)<\/script>/) || ['', ''])[1];
const envois = script.match(/eth_sendTransaction[^\n]*/g) || [];
ok(envois.length === 1 && /params: \[\{ from: compte, data: D\.creation \}\]/.test(envois[0]) && !/\bto:/.test(envois[0]) && !/value/.test(envois[0]),
  'B UN seul envoi dans la page : la donnee figee, sans `to` (creation) ni valeur');
ok(/if \(!compte \|\| !intacte \|\| envoi \|\| deja\) return;/.test(script) && /\$\('#bDeployer'\)\.disabled = !compte \|\| !intacte \|\| envoi \|\| deja;/.test(script),
  'B rien ne part sans wallet connecte, ni si l empreinte recalculee dans le navigateur differe');
ok(/const deja = !!D\.adresse;/.test(script), 'B un contrat deja deploye et relu (adresse ecrite) eteint le bouton : jamais un deuxieme contrat par erreur');
ok(/crypto\.subtle\.digest\('SHA-256', octets\)/.test(script) && /intacte = h === D\.sha256Creation && octets\.length === D\.octetsCreation && usdc === D\.constructeur\.usdc && frais === D\.constructeur\.walletDesFrais && prixDansLeCode;/.test(script)
  && /const prixDansLeCode = prixOk && D\.creation\.includes\(\(0x5f \+ prixHex\.length \/ 2\)\.toString\(16\) \+ prixHex\);/.test(script),
  'B l empreinte est RECALCULEE dans le navigateur, les arguments affiches sont ceux LUS dans la donnee, et le PUSH du prix de mint y est retrouve');
ok(!/\d+ USDC/.test(page.replace(/<script type="module">[\s\S]*?<\/script>/, '')) && /\$\('#dPrixLi'\)\.textContent = prixTexte;/.test(script) && /const prixTexte = prixOk \? usdcTexte\(D\.mintPriceUsdc\) \+ ' USDC' : 'unknown';/.test(script),
  'B la page ne TAPE aucun prix : « Minting a skin costs … » vient de mintPriceUsdc de l enregistrement');
ok(/const fin = D\.creation\.slice\(-128\), usdc = '0x' \+ fin\.slice\(24, 64\), frais = '0x' \+ fin\.slice\(88, 128\);/.test(script), 'B les deux adresses affichees viennent de la FIN de la donnee signee, pas d un champ a cote');
ok(/String\(chaine\)\.toLowerCase\(\) !== CHAINE_HEX/.test(script) && /wallet_switchEthereumChain/.test(script), 'B la page exige Base avant d envoyer');
ok(/recu\.status !== '0x1' \|\| !recu\.contractAddress/.test(script) && /await lire\('USDC\(\)'\), await lire\('FEE_WALLET\(\)'\), await lire\('owner\(\)'\), await lireMot\('MINT_PRICE\(\)'\)/.test(script)
  && /const bon = u === usdc && f === frais && o\.toLowerCase\(\) === compte\.toLowerCase\(\) && prixLu === String\(D\.mintPriceUsdc\);/.test(script),
  'B apres confirmation, elle RELIT sur la chaine USDC(), FEE_WALLET(), owner() et MINT_PRICE() (= l enregistrement), et le dit si cela differe');
ok(/noter-deploiement-blockskins\.mjs/.test(script), 'B la page dit que l app ne bascule sur ce contrat qu une fois son adresse NOTEE (noter-deploiement-blockskins.mjs)');
ok(!/private|mnemonic|seed|signTypedData|personal_sign|eth_sign\b/i.test(script) && !/<input/i.test(page), 'B aucune cle, aucune signature de message, aucun champ a saisir');
ok(/<meta name="robots" content="noindex">/.test(page) && /It cannot be changed or paused after it is deployed\./.test(page) && /A bid must raise the highest one by 5%\./.test(page),
  'B la page dit ce que le contrat fait, qu il est immuable, et la surenchere minimale de 5 %');
/* chaque chiffre de la page existe dans le contrat */
const sol = lire('contracts/src/BlockSkins.sol');
ok(/MINT_PRICE = 10_000_000;/.test(sol) && /SALE_FEE_BPS = 1000;/.test(sol) && /MAX_AUCTION = 7 days;/.test(sol) && /EXTENSION = 5 minutes;/.test(sol) && /MIN_RAISE_BPS = 500;/.test(sol),
  'B chaque chiffre annonce (10 USDC, 10 %, 7 jours, 5 minutes, 5 %) est une constante du contrat');

console.log('— C. le serveur et l app');
const srv = lire('serveur-web.js'), app = lire('app.html');
/* 2026-11-12: retired like economie-v2-deploiement.js: the page is no longer served (no page offers the standalone deploy); the record
 *   stays served because the app imports it (blockskins-actif.js reads the deployed v2 in `precedent`) */
const servis = srv.replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/'deployer-blockskins\.html'/.test(servis) && /^  'blockskins\.js', 'blockskins-actif\.js', 'blockskins-deploiement\.js',$/m.test(srv) && (servis.match(/'blockskins-deploiement\.js'/g) || []).length === 1,
  'C the retired page is NOT served any more; the record is still served once (the app reads the deployed v2 from it)');
{
  const { spawnSync } = await import('node:child_process');
  const prep = spawnSync(process.execPath, [path.join(ICI, 'contracts/preparer-deploiement-blockskins.mjs')], { encoding: 'utf8' });
  const note = spawnSync(process.execPath, [path.join(ICI, 'contracts/noter-deploiement-blockskins.mjs'), '0x' + 'ab'.repeat(32)], { encoding: 'utf8' });
  ok(prep.status === 1 && /retired/.test(prep.stderr) && note.status === 1 && /retired/.test(note.stderr) && lire('blockskins-deploiement.js').includes('  adresse: null,'),
    'C the standalone generator and the noter CLI refuse to run (exit 1, retired) and the record stays unchanged (adresse null)');
}
ok(!/deployer-blockskins|blockskins-deploiement/.test(app), 'C l app ne renvoie nulle part vers cette page et ne lit pas ce contrat (il n est pas deploye)');
console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions)');
process.exit(ko ? 1 : 0);
