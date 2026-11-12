/* preparer-deploiement-blockskins.mjs — FIGE la transaction de deploiement de BlockSkins : bytecode compile + arguments du constructeur.
 *
 * ⛔ CE SCRIPT NE SIGNE RIEN ET N ENVOIE RIEN. Il ecrit `../blockskins-deploiement.js` : la donnee de creation (hex), son empreinte
 *   sha256, et ce qu elle encode. La page `deployer-blockskins.html` la propose au wallet CONNECTE (celui de Phil) ; les bancs fork
 *   (banc-blockskins-fork-20261004, banc-blockskins-v3-fork-20261018) deploient CETTE donnee, octet pour octet — ce qui est signe est
 *   ce qui a ete prouve.
 * Les deux arguments du constructeur viennent de frais-creation.js (USDC_BASE, FEE_WALLET) : jamais recopies a la main.
 * Usage (depuis contracts/) : forge build && node preparer-deploiement-blockskins.mjs
 *
 * v3 (2026-10-18, Phil 08:40 : « change le code pour que tous les skins soient a 10 dollars ») : la source ne change que MINT_PRICE
 *   (1 -> 10 USDC). L enregistrement porte `mintPriceUsdc`, LU dans la source compilee (la constante MINT_PRICE) et retrouve dans le
 *   bytecode (le PUSH de cette valeur) — jamais tape. v2 (deploye, 0xc0d1…8e2f, 1 USDC, 0 skin mintee au 2026-10-18) reste dans
 *   `precedent`, avec SON prix relu sur la chaine : l app lit v2 tant que l adresse de v3 n est pas notee (noter-deploiement-blockskins.mjs
 *   l ecrit depuis le RECU ; ce generateur la CONSERVE si la donnee de creation n a pas change, et la remet a null sinon).
 * ⛔ Garde (MESURE 2026-10-17 sur les missions : un forge build en echec laissait dans out/ l artefact d une AUTRE source) : le keccak de
 *   la source normalisee en LF doit etre celui que l artefact declare, sinon rien n est ecrit. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
/* ⛔ 2026-11-12: RETIRED. contracts/src/BlockSkins.sol is now the ROUTER GAME of the economy pack (step S, constructor
 *   (router, feeWallet, dest, expectedTblock, expectedUsdc, rewards); no direct mint()). This script appends the OLD two-argument
 *   constructor (USDC, fee wallet) to whatever bytecode is in out/: run on the current source it would freeze an undeployable creation.
 *   The Skins deployment is prepared by preparer-deploiement-pack-economie-v2.mjs (economie-v2-pack-deploiement.js). The standalone
 *   record blockskins-deploiement.js is FROZEN as it is (v3 creation from the pre-pack source, adresse null; v2 deployed in precedent),
 *   so this script refuses to run and writes nothing. */
console.error('preparer-deploiement-blockskins.mjs is retired: Skins is deployed as step S of the economy pack (preparer-deploiement-pack-economie-v2.mjs). Nothing written.');
process.exit(1);
const SORTIE = path.join(ICI, '../blockskins-deploiement.js');
const F = await import(pathToFileURL(path.join(ICI, '../frais-creation.js')).href);
const K = await import(pathToFileURL(path.join(ICI, '../keccak.js')).href);
const art = JSON.parse(fs.readFileSync(path.join(ICI, 'out/BlockSkins.sol/BlockSkins.json'), 'utf8'));
const usdc = String(F.USDC_BASE).toLowerCase(), frais = String(F.FEE_WALLET).toLowerCase();
const ADR = /^0x[0-9a-f]{40}$/;
if (!ADR.test(usdc) || !ADR.test(frais)) throw new Error('USDC_BASE / FEE_WALLET unreadable in frais-creation.js');
const code = String(art.bytecode.object);
if (!/^0x[0-9a-f]+$/.test(code)) throw new Error('bytecode missing or unlinked in the forge artifact');
const mot = (a) => a.slice(2).padStart(64, '0');
const creation = code + mot(usdc) + mot(frais);
const sha = (hex) => crypto.createHash('sha256').update(Buffer.from(hex.slice(2), 'hex')).digest('hex');
const meta = typeof art.metadata === 'string' ? JSON.parse(art.metadata) : (art.metadata || {});
const SOURCE = 'src/BlockSkins.sol';
const source = fs.readFileSync(path.join(ICI, SOURCE), 'utf8').replace(/\r\n/g, '\n');
/* ⛔ l artefact doit avoir ete compile depuis CETTE source (forge hache la source normalisee en LF) */
const kS = K.keccak256Hex(Buffer.from(source)), kA = String(((meta.sources || {})[SOURCE] || {}).keccak256 || '').toLowerCase();
if (kA !== kS) throw new Error('stale forge artifact for ' + SOURCE + ': compiled from ' + (kA || 'an unknown source') + ', the source is ' + kS + ' -- run forge build first, and fix what stops it');
/* le prix du mint : LA constante MINT_PRICE de la source compilee (une seule), relue en clair ; puis retrouvee dans le bytecode sous la
 *   forme de son PUSH (le plus court qui la contient) — deux lectures de deux formes de la meme chose, aucune tapee ici */
const prixM = [...source.matchAll(/uint256 public constant MINT_PRICE = ([0-9_]+);/g)];
if (prixM.length !== 1) throw new Error('MINT_PRICE must be declared exactly once in ' + SOURCE + ' (found ' + prixM.length + ')');
const mintPriceUsdc = BigInt(prixM[0][1].replace(/_/g, '')).toString();
const prixHex = BigInt(mintPriceUsdc).toString(16).padStart(2 * Math.ceil(BigInt(mintPriceUsdc).toString(16).length / 2), '0');
const push = (0x5f + prixHex.length / 2).toString(16) + prixHex;
if (!code.includes(push)) throw new Error('the compiled bytecode carries no PUSH of MINT_PRICE (' + push + '): the artifact is not this source');
/* ⛔ v1 — DEPLOYE LE 2026-10-04 par le proprietaire (sa signature, depuis deployer-blockskins.html, hors wallet des frais). RELU sur la chaine
 *   le meme soir (verif-blockskins-deploye.mjs) : input de la tx = donnee v1 octet pour octet, USDC()/FEE_WALLET()/owner() conformes,
 *   15 008 octets de code. JAMAIS MINTE (totalSupply 0 relu au bloc 52 468 899). Son tokenURI n a pas d image. Ne jamais modifier a la main. */
const V1 = Object.freeze({
  version: 1,
  adresse: '0xea6ccb19714504ae3286e82febbe627f9d0ce77d',
  tx: '0xc6e22bfa0b6a2dd931c59709b284d58be762a2b87317941168694f93126a2c9b',
  bloc: 52175537,
  owner: '0x37eb9b7ce0b51fe12fbf092026e001918128580a',
  mintPriceUsdc: '1000000',
  imageDansLeWallet: false,
});
/* ⛔ v2 — DEPLOYE LE 2026-10-11 par le proprietaire (sa signature ; Phil a colle le hash complet dans le chat). RELU sur la chaine par
 *   verif-blockskins-deploye.mjs (8/8) : input de la tx = donnee v2 octet pour octet, recu status 1, 17 911 octets de code, USDC()/FEE_WALLET()
 *   du depot, owner() = l expediteur, MINT_PRICE() = 1 000 000 (relu encore le 2026-10-18 : eth_call 0xc002d23d -> 0xf4240 ; totalSupply 0).
 *   Sur un fork a la tete (bloc 52 470 342), un mint a cette adresse : fetch(tokenURI) -> JSON valide -> fetch(image) -> le SVG.
 *   Les valeurs sont recopiees de la sortie du verificateur. Ne jamais les modifier a la main. */
const V2 = Object.freeze({
  version: 2,
  adresse: '0xc0d12c7c84a574fbc65fd5182aecef51924d8e2f',
  tx: '0xc60a136835ff7864e2cb5999caee48b72578ae53c297659480deed3e6bf4ac56',
  bloc: 52470279,
  owner: '0x37eb9b7ce0b51fe12fbf092026e001918128580a',
  mintPriceUsdc: '1000000',
  imageDansLeWallet: true,
});
/* l image dans le wallet est une propriete de la SOURCE : son tokenURI porte un champ "image" (prouve par la suite forge et par fetch()
 *   sur le banc fork) - derivee ici de la source, jamais posee a la main */
const imageDansLeWallet = source.includes('"image":"data:image/svg+xml;base64,') && source.includes('"data:application/json;base64,"');
/* v3 : ses champs de deploiement ne sont ecrits QUE par noter-deploiement-blockskins.mjs (depuis le recu). Ici on les CONSERVE si
 *   l enregistrement existant est bien celui de CETTE donnee de creation (meme sha256) ; une donnee qui change = pas deploye = null. */
let DEPLOYE = null;
try {
  const ex = (await import(pathToFileURL(SORTIE).href + '?t=' + Date.now())).BLOCKSKINS_DEPLOIEMENT;
  if (ex && ex.version === 3 && ex.sha256Creation === sha(creation) && ADR.test(String(ex.adresse || ''))) {
    if (String(ex.mintPriceUsdc) !== mintPriceUsdc) throw new Error('the noted v3 record says MINT_PRICE ' + ex.mintPriceUsdc + ', the source says ' + mintPriceUsdc);
    DEPLOYE = { adresse: ex.adresse, tx: ex.txDeploiement, bloc: ex.blocDeploiement, owner: ex.owner };
  }
} catch (e) { if (/noted v3 record/.test(String(e && e.message))) throw e; DEPLOYE = null; }
const q = (v) => (v === null || v === undefined ? 'null' : "'" + v + "'");
const fiche = (v, prec) => '  precedent: Object.freeze({ version: ' + v.version + ", adresse: '" + v.adresse + "', txDeploiement: '" + v.tx + "', blocDeploiement: " + v.bloc + ", owner: '" + v.owner
  + "', mintPriceUsdc: '" + v.mintPriceUsdc + "', imageDansLeWallet: " + v.imageDansLeWallet + ", constructeur: Object.freeze({ usdc: '" + usdc + "', walletDesFrais: '" + frais + "' })"
  + (prec ? ',\n  ' + prec.replace(/\n  /g, '\n    ').replace(/^  /, '') : '') + ' }),';
const lignes = [
  '/* blockskins-deploiement.js — GENERE par contracts/preparer-deploiement-blockskins.mjs. NE PAS EDITER A LA MAIN.',
  ' * La transaction de deploiement NON SIGNEE du contrat BlockSkins (contracts/src/BlockSkins.sol). Rien ici ne signe ni n envoie.',
  DEPLOYE
    ? ' * ⛔ v3 DEPLOYE (bloc ' + DEPLOYE.bloc + ') : `adresse` ci-dessous, relue sur la chaine par noter-deploiement-blockskins.mjs. v2 dans `precedent`. */'
    : ' * ⛔ v3 PAS ENCORE DEPLOYE : `adresse` null — l app lit v2 (`precedent`, 1 USDC) jusqu a ce que noter-deploiement-blockskins.mjs note v3. */',
  'export const BLOCKSKINS_DEPLOIEMENT = Object.freeze({',
  '  chaine: 8453,',
  "  contrat: 'BlockSkins',",
  '  version: 3,',
  "  compilateur: '" + String((meta.compiler && meta.compiler.version) || 'unknown') + "',",
  '  optimiseur: ' + JSON.stringify((meta.settings && meta.settings.optimizer) || null) + ',',
  "  evm: '" + String((meta.settings && meta.settings.evmVersion) || 'unknown') + "',",
  "  constructeur: Object.freeze({ usdc: '" + usdc + "', walletDesFrais: '" + frais + "' }),",
  "  mintPriceUsdc: '" + mintPriceUsdc + "', /* MINT_PRICE, lu dans la source compilee et retrouve dans le bytecode (PUSH " + push + ") */",
  "  sha256Source: '" + crypto.createHash('sha256').update(source).digest('hex') + "',",
  "  keccakSource: '" + kS + "', /* = metadata.sources de l artefact : compile depuis cette source */",
  "  sha256Creation: '" + sha(creation) + "',",
  '  octetsCreation: ' + (creation.length - 2) / 2 + ',',
  '  imageDansLeWallet: ' + imageDansLeWallet + ',',
  '  adresse: ' + q(DEPLOYE ? DEPLOYE.adresse : null) + ',',
  '  txDeploiement: ' + q(DEPLOYE ? DEPLOYE.tx : null) + ',',
  '  blocDeploiement: ' + (DEPLOYE ? DEPLOYE.bloc : 'null') + ',',
  '  owner: ' + q(DEPLOYE ? DEPLOYE.owner : null) + ',',
  fiche(V2, fiche(V1, null)),
  "  creation: '" + creation + "',",
  '});',
  '',
];
fs.writeFileSync(SORTIE, lignes.join('\n'));
console.log('ecrit ../blockskins-deploiement.js — v3, ' + (creation.length - 2) / 2 + ' octets, sha256 ' + sha(creation) + ', MINT_PRICE ' + mintPriceUsdc + ' (PUSH ' + push + '), imageDansLeWallet ' + imageDansLeWallet + ', adresse ' + (DEPLOYE ? DEPLOYE.adresse : 'null (pas deploye : l app reste sur v2 ' + V2.adresse + ')'));
