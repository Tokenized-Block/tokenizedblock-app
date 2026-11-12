/* test-skins-prix-20261018.mjs - LE PRIX D UNE SKIN N EST TAPE NULLE PART : IL VIENT DE L ENREGISTREMENT DU CONTRAT DEPLOYE.
 * Phil, 2026-10-18 08:40 : « change le code pour que tous les skins soient a 10 dollars ». Le contrat v2 (deploye) grave 1 USDC ; v3 (prepare,
 *   pas signe) grave 10 USDC. Ecrire « 10 » pendant que la chaine prend 1 serait un mensonge : chaque texte servi lit le prix du contrat ACTIF.
 * AFFIRME :
 *   A. l enregistrement : mintPriceUsdc de v3 = la constante MINT_PRICE de la source (10 USDC), son PUSH est dans la donnee de creation, et
 *      l artefact forge (s il est present) a ete compile depuis CETTE source (keccak LF = metadata) ; v2 garde son prix relu (1 USDC) ;
 *   B. blockskins-actif.js : le contrat actif = le PREMIER deploye de la chaine (v2 aujourd hui) ; SKIN_MINT_USDC / SKIN_MINT_TEXTE en viennent ;
 *      usdcTexte exact ; skins.js SKIN_PRIX_USDC === blockskins.js SKIN_MINT_USDC (EXECUTE) ;
 *   C. aucun texte servi ne tape le prix : app.html (les 4 <span class="skinPrix"> remplis depuis SKIN_MINT_TEXTE, bcAcheterSkin, la barre de
 *      skin, l aide « Skins — dress your block »), blockskins.js, skins.js, blockskins-actif.js, deployer-blockskins.html ; le serveur sert
 *      blockskins-actif.js et credite le pass avec SKIN_MINT_USDC_SRV (la meme valeur) ; /api/skins/prix rend skinsPrixCorps() (2026-11-11) ;
 *   D. l app RELIT MINT_PRICE() sur la chaine avant d acheter et refuse si != SKIN_MINT_USDC ;
 *   E. MUTANTS (chacun doit rougir) : (1) « Pay 10 USDC » tape dans bcAcheterSkin ; (2) « 10 USDC » tape dans le bouton de la carte ;
 *      (3) l enregistrement de v2 passe a 10 USDC SANS la chaine : la comparaison on-chain de l app (prixC !== SKIN_MINT_USDC) REFUSE, avec le
 *      MINT_PRICE() reel de v2 (1 000 000, relu en direct si possible, sinon la valeur relue le 2026-10-18 : eth_call 0xc002d23d -> 0xf4240) ;
 *      (4) l enregistrement dit un autre prix que la source : la garde A rougit.
 * NE PROUVE PAS : le rendu (le span rempli au chargement), un vrai wallet, le deploiement de v3 (attend la signature de Phil).
 * 2026-11-12: the standalone v3 is RETIRED (Skins ships as step S of the economy pack). A now pins the record as FROZEN from the pre-pack
 *   source and checks the forge artefact is the CURRENT (router game) source, whose bytecode the frozen creation does NOT start with.
 * 2026-11-13: the 1 USDC Skins is deployed and noted (skins-spin-deploiement.js): B now pins it as the active contract at 1 USDC (from its
 *   source), the pack's Skins (10 USDC) as its precedent; the pre-note branch (pack's Skins active) is replayed on a null copy of the record. */
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const lire = (f) => fs.readFileSync(path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
const imp = (f, dir = ICI) => import(pathToFileURL(path.join(dir, f)).href + '?v=' + Math.random());
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const sansCommentaires = (s) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const PRIX_TAPE = /\b\d+(?:[.,]\d+)? USDC\b/;

/* ── A. l enregistrement ── */
const { BLOCKSKINS_DEPLOIEMENT: D } = await imp('blockskins-deploiement.js');
const K = await imp('keccak.js');
const source = lire('contracts/src/BlockSkins.sol');
/** la lecture du prix dans une source et sa presence dans une donnee de creation : la meme regle que le generateur, rejouee ici */
function prixDeLaSource(sol) {
  const m = [...sol.matchAll(/uint256 public constant MINT_PRICE = ([0-9_]+);/g)];
  return m.length === 1 ? BigInt(m[0][1].replace(/_/g, '')).toString() : null;
}
function pushDe(prix) { const h = BigInt(prix).toString(16); const hx = h.padStart(2 * Math.ceil(h.length / 2), '0'); return (0x5f + hx.length / 2).toString(16) + hx; }
function enregistrementSuitLaSource(d, sol) { const p = prixDeLaSource(sol); return p !== null && String(d.mintPriceUsdc) === p && d.creation.includes(pushDe(p)); }
vu(prixDeLaSource(source) === '10000000', 'A la source grave MINT_PRICE = 10 USDC (10 000 000)');
vu(D.version === 3 && enregistrementSuitLaSource(D, source), 'A v3 : mintPriceUsdc (' + D.mintPriceUsdc + ') = la source, et son PUSH (' + pushDe(D.mintPriceUsdc) + ') est dans la donnee signee');
/* 2026-11-12: the standalone v3 deploy path is RETIRED. contracts/src/BlockSkins.sol is now the ROUTER GAME of the economy pack (step S,
 *   constructor (router, feeWallet, dest, expectedTblock, expectedUsdc, rewards), no direct mint()), prepared by
 *   preparer-deploiement-pack-economie-v2.mjs. blockskins-deploiement.js is FROZEN as it was generated from the pre-pack source: the app
 *   reads the deployed v2 in `precedent` until the pack is deployed; preparer-deploiement-blockskins.mjs and the noter CLI refuse to run.
 *   So the record must carry the PRE-PACK source hashes (pinned here, copied from the record) and the current source must differ. */
const SHA_PRE_PACK = 'c11d841a8d9d1baba733bc4edc04d2f72606b39b0e7f7a2e54cf23b36c381f52', KECCAK_PRE_PACK = '0x718fc11ec974fd9f80e7f5d59929a7ccaba6c561dcf38e0b6cac32487ae97b67';
vu(D.keccakSource === KECCAK_PRE_PACK && D.sha256Source === SHA_PRE_PACK && D.keccakSource !== K.keccak256Hex(Buffer.from(source)) && crypto.createHash('sha256').update(source).digest('hex') !== D.sha256Source,
  'A the record is FROZEN from the pre-pack source (pinned keccak LF + sha256), not regenerated from the current router game source');
const artefact = path.join(ICI, 'contracts/out/BlockSkins.sol/BlockSkins.json');
if (fs.existsSync(artefact)) {
  const art = JSON.parse(fs.readFileSync(artefact, 'utf8')), meta = typeof art.metadata === 'string' ? JSON.parse(art.metadata) : art.metadata;
  vu(String(meta.sources['src/BlockSkins.sol'].keccak256).toLowerCase() === K.keccak256Hex(Buffer.from(source)) && !D.creation.startsWith(String(art.bytecode.object)), 'A the forge artefact present is compiled from the CURRENT source (router game), and the frozen creation does NOT start with its bytecode (retired, never offered)');
} else console.log('--  A artefact forge absent (contracts/out) : la garde anti-artefact-perime n est pas rejouee ici (elle l est par le generateur)');
vu(D.adresse === null && D.precedent.version === 2 && D.precedent.mintPriceUsdc === '1000000' && /^0x[0-9a-f]{40}$/.test(D.precedent.adresse) && D.precedent.precedent.version === 1,
  'A v3 pas deploye (adresse null) ; v2 dans precedent avec son prix relu 1 USDC ; v1 derriere');

/* ── B. le contrat actif ── */
const AC = await imp('blockskins-actif.js'), BS = await imp('blockskins.js'), SK = await imp('skins.js');
/* 2026-11-12 (the economy pack is live): the app mints on the pack's Skins (router only), price = MINT_PRICE of its source; the record's
 *   own rule (first deployed of the chain: v2 while v3 has no address) is kept and checked with contratActif */
const FCk = (await imp('frais-contrats.js')).FRAIS_CONTRATS;
/* 2026-11-13: the 1 USDC Skins is deployed and noted (skins-spin-deploiement.js, nonceN 214): it is the active contract, the pack's Skins is
 *   its `precedent` (still read, 10 USDC). The pre-note branch (no 1 USDC Skins -> the pack's Skins active) is replayed on a null COPY. */
const { SKINS_SPIN_DEPLOIEMENT: SSR } = await imp('skins-spin-deploiement.js');
const SSR_NUL = (() => { const x = JSON.parse(JSON.stringify(SSR)); x.nonceN = null; for (const e of x.etapes) { e.adresse = null; e.tx = null; e.bloc = null; } return x; })();
vu(AC.SKINS_UN && AC.BLOCKSKINS_ACTIF === AC.SKINS_UN && AC.SKINS_UN.precedent === AC.SKINS_PACK && AC.BLOCKSKINS === SSR.etapes[0].adresse && AC.SKINS_UN.routeur === AC.SKINS_PACK.routeur
  && AC.SKINS_PACK.precedent.sha256Creation === D.sha256Creation && !!AC.SKINS_PACK.routeur && AC.contratActif(D).adresse === D.precedent.adresse && AC.contratActif(D).version === 2,
  'B le contrat actif est le Skins a 1 USDC note (paye par le meme routeur), Skins du pack en precedent ; la fiche, elle, designe toujours v2 tant que v3 n est pas note');
vu(AC.skinsUnDepuis(SSR_NUL, AC.SKINS_PACK) === null && AC.contratActif(AC.SKINS_PACK) === AC.SKINS_PACK && AC.usdcTexte(AC.SKINS_PACK.mintPriceUsdc) === '10'
  && AC.SKINS_PACK.mintPriceUsdc === FCk.BlockSkins.MINT_PRICE,
  'B avant la note (copie nulle) : pas de Skins a 1 USDC, l actif reste Skins du pack a 10 USDC (MINT_PRICE de sa source)');
vu(AC.SKIN_MINT_USDC === BigInt(FCk.BlockSkinsUn.MINT_PRICE) && AC.SKIN_MINT_USDC === BigInt(AC.SKINS_UN.mintPriceUsdc) && AC.SKIN_MINT_TEXTE === '1 USDC' && AC.SKIN_MINT_OUVERT === true,
  'B SKIN_MINT_USDC / SKIN_MINT_TEXTE = MINT_PRICE de la source du Skins a 1 USDC (frais-contrats BlockSkinsUn) = le prix de l enregistrement, mint ouvert');
vu(AC.usdcTexte(10000000n) === '10' && AC.usdcTexte('1000000') === '1' && AC.usdcTexte(500000n) === '0.5' && AC.usdcTexte(10500000n) === '10.5' && AC.usdcTexte(0n) === '0', 'B usdcTexte exact, sans zero inutile');
vu(BS.SKIN_MINT_USDC === AC.SKIN_MINT_USDC && BS.SKIN_MINT_TEXTE === AC.SKIN_MINT_TEXTE && BS.BLOCKSKINS === AC.BLOCKSKINS && SK.SKIN_PRIX_USDC === AC.SKIN_MINT_USDC,
  'B blockskins.js et skins.js (SKIN_PRIX_USDC) portent la MEME valeur, celle de l enregistrement actif');
vu((() => { try { BS.appelMint('0xb200000000000000000000e4b0c5fbe9c8df579e', { id: 'random', angle: 1, h: [2, 3, 4], cube: 5, noyau: 6, fond: 7 }); return false; } catch (_) { return true; } })() /* 2026-11-12: no direct mint on a router contract */
  && SK.appelAchatSkin({ usdc: D.constructeur.usdc, beneficiaire: D.constructeur.walletDesFrais, block: '0xb200000000000000000000e4b0c5fbe9c8df579e', recette: { id: 'gold' } }).nom === 'pay ' + AC.SKIN_MINT_TEXTE + ' for the skin',
  'B les noms d etape (affiches dans la carte de signature) portent le prix de l enregistrement');
/* un enregistrement ou v3 est note : l actif bascule, 10 USDC — sans autre edition (le texte note est celui que produit noter(), test-noter-blockskins) */
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-skins-prix-'));
  try {
    const note = lire('blockskins-deploiement.js').replace(/^  adresse: null,$/m, "  adresse: '0x" + 'ab'.repeat(20) + "',");
    fs.writeFileSync(path.join(tmp, 'blockskins-deploiement.js'), note);
    /* 2026-11-12: the pack's Skins comes first; the RULE on a record whose v3 has an address is checked with contratActif */
    const Dn = (await imp('blockskins-deploiement.js', tmp)).BLOCKSKINS_DEPLOIEMENT, a3 = AC.contratActif(Dn);
    vu(a3.version === 3 && BigInt(a3.mintPriceUsdc) === 10000000n && AC.usdcTexte(a3.mintPriceUsdc) === '10', 'B des que v3 porte une adresse, la fiche designe v3 a 10 USDC (lu : ' + AC.usdcTexte(a3.mintPriceUsdc) + ')');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

/* ── C. aucun texte servi ne tape le prix ── */
const app = lire('app.html'), appCode = sansCommentaires(app);
const corps = (nom, texte = appCode) => { const i = texte.indexOf(nom); if (i < 0) return ''; const j = texte.slice(i + 10).search(/\n(async )?function /); return texte.slice(i, j > 0 ? i + 10 + j : i + 8000); };
/** ce qu un visiteur peut lire sur le prix d une skin dans app.html : rend la liste des prix TAPES (vide = bon) */
function prixTapes(html) {
  const code = sansCommentaires(html), hits = [];
  const zones = {
    'bcAcheterSkin': corps('async function bcAcheterSkin(', code),
    'bcPeindreSkinEtat': corps('function bcPeindreSkinEtat(', code),
    'aide Skins': (code.match(/\{ t: 'Skins — dress your block'[\s\S]*?\},/) || [''])[0],
    'carte Skin market': code.slice(code.indexOf('id="skinCarte"'), code.indexOf('id="regleCarte"')),
    'bouton jourSkin': (code.match(/<button[^>]*id="jourSkin"[^>]*>[\s\S]*?<\/button>/) || [''])[0],
    /* 2026-10-18 (lead) : « How it works » ne cite plus le prix (Phil 09:50 : seulement ce qui marche) ; la zone = toute la carte, sans prix tape */
    'How it works': code.slice(code.indexOf('id="regleCarte"'), code.indexOf('</section>', code.indexOf('id="regleCarte"'))),
  };
  for (const [z, t] of Object.entries(zones)) { if (!t) hits.push(z + ' : zone introuvable'); else if (PRIX_TAPE.test(t)) hits.push(z + ' : « ' + t.match(PRIX_TAPE)[0] + ' »'); }
  return hits;
}
const hits = prixTapes(app);
vu(hits.length === 0, 'C app.html : aucun prix de skin tape dans les textes servis (' + hits.join(' ; ') + ')');
/* 2026-10-26 : 5 — la section Skins de l onglet Market porte aussi le titre et le bouton Mint (memes spans, meme remplissage) */
vu((appCode.match(/<span class="skinPrix"><\/span>/g) || []).length === 5 && /for \(const e of document\.querySelectorAll\('\.skinPrix'\)\) e\.textContent = SKIN_MINT_TEXTE;/.test(appCode),
  'C les 5 <span class="skinPrix"> (bouton Draws, titre et bouton de la carte Skin market, titre et bouton Mint de la section Skins du Market) sont remplis depuis SKIN_MINT_TEXTE');
vu(/import \{[^}]*\bSKIN_MINT_TEXTE\b[^}]*\} from '\.\/blockskins\.js';/.test(app), 'C app.html importe SKIN_MINT_TEXTE de blockskins.js');
const achat = corps('async function bcAcheterSkin(');
vu(/'Pay ' \+ SKIN_MINT_TEXTE/.test(achat) && /a skin is ' \+ SKIN_MINT_TEXTE \+ '\./.test(achat) && /take exactly ' \+ SKIN_MINT_TEXTE \}/.test(achat) && /bcEtape\(m, SKIN_MINT_TEXTE \+ ' through the TBLOCK payment router: /.test(achat) /* 2026-11-12: the router payment */ && / — ' \+ SKIN_MINT_TEXTE\);/.test(achat),
  'C bcAcheterSkin : bouton Pay, solde insuffisant, approbation exacte, destination et titre disent SKIN_MINT_TEXTE');
vu(/'trying it on · ' \+ SKIN_MINT_TEXTE/.test(corps('function bcPeindreSkinEtat(')), 'C la barre de skin dit SKIN_MINT_TEXTE');
for (const f of ['blockskins.js', 'skins.js', 'blockskins-actif.js']) {
  const code = sansCommentaires(lire(f)).replace(/^\s*\/\/.*$/gm, '');
  /* (le diviseur 1000000n de usdcTexte — les 6 decimales — n est pas un prix : seule une AFFECTATION « = 1 000 000n » en serait un) */
  vu(!/'[^'\n]*\b\d+(?:\.\d+)? USDC\b[^'\n]*'/.test(code) && !/=\s*1_?000_?000n\b/.test(code), 'C ' + f + ' : aucun prix tape (ni texte « N USDC », ni constante = 1 000 000n)');
}
const page = lire('deployer-blockskins.html');
vu(!PRIX_TAPE.test(sansCommentaires(page)) && /usdcTexte\(D\.mintPriceUsdc\)/.test(page) && /from '\.\/blockskins-actif\.js'/.test(page), 'C deployer-blockskins.html : le prix vient de mintPriceUsdc de l enregistrement (usdcTexte), jamais tape');
const srv = lire('serveur-web.js');
vu(/^  'blockskins\.js', 'blockskins-actif\.js', 'blockskins-deploiement\.js',$/m.test(srv), 'C le serveur sert blockskins-actif.js (importe par blockskins.js et skins.js : absent = 404 = app morte)');
/* 2026-10-18 (lead) : l import porte aussi lireSkins (skin detenu = ticket du jour) ; on exige toujours SKIN_MINT_USDC_SRV de blockskins.js */
/* 2026-10-18 soir : + BLOCKSKINS_ACTIF (niveaux XP : bloc de deploiement des skins) et DEVISES_SKIN (journal) sur la meme ligne */
/* 2026-11-12 (the economy pack is live): + BLOCKSKINS_LUS (every skins contract read); a pack skin is paid to the ROUTER, so the pass checks
 *   that the price left the payer for the router (BLOCKSKINS_ACTIF_SRV.routeur), else for the fee wallet */
vu(/import \{ BLOCKSKINS as BLOCKSKINS_SRV, (BLOCKSKINS_LUS as BLOCKSKINS_LUS_SRV, )?(BLOCKSKINS_ACTIF as BLOCKSKINS_ACTIF_SRV, )?SKIN_MINT_USDC as SKIN_MINT_USDC_SRV(, lireSkins as lireSkinsSrv)?(, DEVISES_SKIN as DEVISES_SKIN_SRV)? \} from '\.\/blockskins\.js';/.test(srv)
  && /passSkinVerifie\(\{ tx, recu, skins: BLOCKSKINS_SRV, usdc: USDC_BASE, wallet: BLOCKSKINS_ACTIF_SRV\.routeur \|\| FEE_WALLET, prix: SKIN_MINT_USDC_SRV \}\)/.test(srv)
  /* 2026-11-11 (wt-369) : /api/skins/prix renders skinsPrixCorps() of blockskins-actif.js — the price of the ACTIVE record, same source
   *   as SKIN_MINT_USDC (the v1 transfer + memo body is retired; test-skins-prix-369-20261111.mjs executes the body) */
  && /if \(chemin === '\/api\/skins\/prix'\) \{ rendreS\(200, skinsPrixCorps\(\)\); return; \}/.test(srv)
  && /^import \{ skinsPrixCorps \} from '\.\/blockskins-actif\.js';$/m.test(srv)
  && AC.skinsPrixCorps().priceUsdc === String(AC.SKIN_MINT_USDC),
  'C le serveur credite le pass avec SKIN_MINT_USDC_SRV (le prix de l enregistrement) et /api/skins/prix rend skinsPrixCorps() (la meme valeur, lue dans l enregistrement actif)');

/* ── D. la relecture on-chain avant tout achat ── */
vu(/prixC = BigInt\(await rpc\('eth_call', \[\{ to: BLOCKSKINS, data: '0x' \+ selecteur\('MINT_PRICE\(\)'\) \}, 'latest'\]\)\);/.test(achat) && /if \(prixC !== SKIN_MINT_USDC \|\| fraisC !== beneficiaire \|\| routeurC !== EP\.ROUTER \|\| BLOCKSKINS !== EP\.SKINS_MINT \|\| devBps === null\) \{/.test(achat) /* 2026-11-12: + the router read; then the Skins the app MINTS on (the 1 USDC Skins once recorded) */
  && achat.indexOf("selecteur('MINT_PRICE()')") < achat.indexOf("await bcSigner(m, appels, 'skin_mint')"), 'D MINT_PRICE() est relu sur la chaine et compare a SKIN_MINT_USDC AVANT de signer ; sinon rien n est demande');
/* la regle de refus, extraite telle qu elle est ecrite : un predicat pur a rejouer sur le mutant E3 */
const refuse = (prixC, SKIN_MINT_USDC, fraisC, beneficiaire) => (prixC !== SKIN_MINT_USDC || fraisC !== beneficiaire);
vu(/if \(prixC !== SKIN_MINT_USDC \|\| fraisC !== beneficiaire \|\|/.test(achat) && refuse(1000000n, 1000000n, 'a', 'a') === false && refuse(1000000n, 10000000n, 'a', 'a') === true, 'D le predicat de refus rejoue : meme prix = passe, prix different = refuse');

/* ── E. mutants ── */
const m1 = app.replace("['Pay ' + SKIN_MINT_TEXTE, payer]", "['Pay 10 USDC', payer]");
vu(m1 !== app && prixTapes(m1).some((h) => /bcAcheterSkin/.test(h)), 'E1 mutant « Pay 10 USDC » tape : ROUGE (' + prixTapes(m1).join(' ; ') + ')');
const m2 = app.replace('<button type="button" class="bouton" id="skinMint">Mint a skin · <span class="skinPrix"></span></button>', '<button type="button" class="bouton" id="skinMint">Mint a skin · 10 USDC</button>');
vu(m2 !== app && prixTapes(m2).some((h) => /carte Skin market/.test(h)), 'E2 mutant « Mint a skin · 10 USDC » tape : ROUGE (' + prixTapes(m2).join(' ; ') + ')');
/* E3 : l enregistrement de v2 dit 10 USDC sans que la chaine ait change : l app, qui relit MINT_PRICE(), REFUSE */
let prixChaineV2 = null, origine = 'relu en direct';
try {
  const r = await Promise.race([fetch('https://mainnet.base.org', { method: 'POST', headers: { 'content-type': 'application/json', 'x-ms-monitor': '1' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: D.precedent.adresse, data: '0xc002d23d' }, 'latest'] }) }).then((x) => x.json()), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))]);
  if (r && /^0x[0-9a-f]{64}$/.test(String(r.result))) prixChaineV2 = BigInt(r.result);
} catch (_) { prixChaineV2 = null; }
if (prixChaineV2 === null) { prixChaineV2 = 1000000n; origine = 'NON LU en direct : valeur relue le 2026-10-18 (eth_call 0xc002d23d -> 0xf4240)'; }
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-skins-prix-m3-'));
  try {
    const mut = lire('blockskins-deploiement.js').replace("owner: '0x37eb9b7ce0b51fe12fbf092026e001918128580a', mintPriceUsdc: '1000000', imageDansLeWallet: true", "owner: '0x37eb9b7ce0b51fe12fbf092026e001918128580a', mintPriceUsdc: '10000000', imageDansLeWallet: true");
    vu(mut !== lire('blockskins-deploiement.js'), 'E3 le mutant change bien le prix de v2 dans une COPIE de l enregistrement');
    fs.writeFileSync(path.join(tmp, 'blockskins-deploiement.js'), mut);
    /* 2026-11-12: the app's active is the pack's Skins; the mutant is judged on the record's own rule (contratActif of the mutated copy) */
    const Dm = (await imp('blockskins-deploiement.js', tmp)).BLOCKSKINS_DEPLOIEMENT;
    const M = { SKIN_MINT_USDC: BigInt(AC.contratActif(Dm).mintPriceUsdc) }; M.SKIN_MINT_TEXTE = AC.usdcTexte(M.SKIN_MINT_USDC) + ' USDC';
    vu(M.SKIN_MINT_USDC === 10000000n && M.SKIN_MINT_TEXTE === '10 USDC', 'E3 l app mutee afficherait « 10 USDC » (le mensonge a tester)');
    vu(refuse(prixChaineV2, M.SKIN_MINT_USDC, D.constructeur.walletDesFrais, D.constructeur.walletDesFrais) === true && refuse(prixChaineV2, BigInt(AC.contratActif(D).mintPriceUsdc), D.constructeur.walletDesFrais, D.constructeur.walletDesFrais) === false,
      'E3 mutant « enregistrement a 10 USDC sans la chaine » : la relecture MINT_PRICE() de v2 (' + prixChaineV2 + ', ' + origine + ') fait REFUSER l achat ; l enregistrement vrai passe');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
/* E4 : l enregistrement dit un autre prix que la source (un generateur qui taperait le prix) : la garde A rougit */
vu(enregistrementSuitLaSource({ ...D, mintPriceUsdc: '1000000' }, source) === false && enregistrementSuitLaSource({ ...D, mintPriceUsdc: '10000001' }, source) === false
  && enregistrementSuitLaSource(D, source.replace('MINT_PRICE = 10_000_000;', 'MINT_PRICE = 1_000_000;')) === false,
  'E4 mutant « enregistrement != source » (1 USDC, 10,000001 USDC, source a 1 USDC) : ROUGE');
console.log('ok skins-prix - ' + n + ' assertions ; prix actif ' + AC.SKIN_MINT_TEXTE + ' (v' + AC.BLOCKSKINS_VERSION + ') ; MINT_PRICE() v2 ' + origine + ' ; NE PROUVE PAS le rendu ni le deploiement de v3');
