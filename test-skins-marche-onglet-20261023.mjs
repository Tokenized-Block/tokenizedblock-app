/* test-skins-marche-onglet-20261023.mjs — LA SECTION SKINS DE L ONGLET MARKET (Phil, 2026-10-23 : « build the market for skins and the
 * auctions » ; « je ne vois pas de market »).
 * A. PUR (skins-marche.js ; TB_SKM = une copie, pour la preuve rouge) : statut, filtres, ordre, compteurs, gestes = actionsSkin, offre
 *    minimale (+5 %) et refus en dessous, « new bid » (jamais a la premiere lecture), cle de ligne, temps restant, apercu de face (entiers
 *    seulement), texte exact d un montant, detenteur court.
 * B. CABLAGE (app.html ; TB_APP = une copie) : la section #skinsMarche dans l onglet Market ; lecture par lireSkins (pagine, aucun appel
 *    par ligne) ; lecture ratee DITE ; relecture 25 s gardee par l onglet ouvert et la page visible ; ouverture de l onglet = lecture ;
 *    gestes = gestesSkin -> bcActionMarche ; bcActionMarche ouvre le panneau, RELIT la skin (skinsPage(id, 1)) et borne l offre
 *    (montantOffre) avant de construire l appel ; le Game mene au marche ; le module est servi ; textes d ecran en anglais, sans « NFT ».
 * C. MUTANTS sur des COPIES (dossier temporaire) : chacun doit rougir ; temoin : les copies non mutees sont vertes.
 * NE PROUVE PAS : un vrai achat / une vraie offre signes par un wallet (aucun n a ete fait), ni le rendu (verifie a part au navigateur). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SKM = process.env.TB_SKM ? pathToFileURL(process.env.TB_SKM).href : new URL('./skins-marche.js', import.meta.url).href;
const APP = process.env.TB_APP || path.join(ICI, 'app.html');
let n = 0, ko = 0;
const vu = (c, m) => { n += 1; if (!c) { ko += 1; console.log('KO ' + m); } };

const M = await import(SKM);
const { actionsSkin, ETH, offreMinimale, montantVersBrut } = await import(new URL('./blockskins.js', import.meta.url).href);

/* ── A. PUR ── */
const MOI = '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b', AUTRE = '0x' + '5'.repeat(40), BLK = '0xb200000000000000000000e4b0c5fbe9c8df579e';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const rec = { id: 'random', angle: 159, h: [43, 218, 337], cube: 280, noyau: 75, fond: 51 };
const T = 1_800_000_000;
const sk = (o) => ({ tokenId: 1n, detenteur: AUTRE, block: BLK, recette: rec, enVente: false, enchere: false, devise: ETH, prix: 0n, fin: 0, encherisseur: ETH, offre: 0n, ...o });
const libre = sk({ tokenId: 1n }), mienne = sk({ tokenId: 2n, detenteur: MOI });
const fixe = sk({ tokenId: 3n, enVente: true, devise: USDC, prix: 5_000_000n });
const fixeCher = sk({ tokenId: 4n, enVente: true, devise: USDC, prix: 9_000_000n });
const ench = sk({ tokenId: 5n, enVente: true, enchere: true, devise: USDC, prix: 1_000_000n, fin: T + 3600, offre: 2_000_000n, encherisseur: AUTRE });
const enchTot = sk({ tokenId: 6n, enVente: true, enchere: true, devise: USDC, prix: 1_000_000n, fin: T + 60 });
const finie = sk({ tokenId: 7n, enVente: true, enchere: true, devise: USDC, prix: 1_000_000n, fin: T - 1, offre: 3_000_000n, encherisseur: MOI });
const tout = [libre, mienne, fixe, fixeCher, ench, enchTot, finie];

vu(M.statutSkin(libre, T) === 'LIBRE' && M.statutSkin(fixe, T) === 'FIXE' && M.statutSkin(ench, T) === 'ENCHERE' && M.statutSkin(finie, T) === 'ENCHERE_FINIE', 'A1 statutSkin : libre / prix fixe / enchere / enchere finie');
vu(M.statutSkin({ ...ench, fin: T }, T) === 'ENCHERE_FINIE', 'A2 une enchere finit A sa fin (t >= fin, comme actionsSkin)');
const ids = (l) => l.map((s) => String(s.tokenId)).join(',');
vu(ids(M.filtrerSkins(tout, 'sale', MOI, T)) === '3,4', 'A3 filtre « Fixed price » : ' + ids(M.filtrerSkins(tout, 'sale', MOI, T)));
vu(ids(M.filtrerSkins(tout, 'auction', MOI, T)) === '5,6,7', 'A4 filtre « Auctions » (en cours + finies) : ' + ids(M.filtrerSkins(tout, 'auction', MOI, T)));
vu(ids(M.filtrerSkins(tout, 'unlisted', MOI, T)) === '1,2', 'A5 filtre « Not listed »');
vu(ids(M.filtrerSkins(tout, 'mine', MOI, T)) === '2' && M.filtrerSkins(tout, 'mine', null, T).length === 0, 'A6 filtre « Mine » : celles de CE wallet ; sans wallet : rien');
vu(M.filtrerSkins(tout, 'all', MOI, T).length === 7 && M.filtrerSkins(tout, 'inconnu', MOI, T).length === 7, 'A7 « All » et un filtre inconnu = tout');
vu(ids(M.ordonnerSkins(tout, T)) === '6,5,7,3,4,2,1', 'A8 ordre : encheres (la plus proche de sa fin d abord), finies, prix fixe (moins cher d abord), pas en vente (recente d abord) : ' + ids(M.ordonnerSkins(tout, T)));
vu(ids(tout) === '1,2,3,4,5,6,7', 'A9 ordonnerSkins ne modifie pas la liste recue');
const c = M.compterSkins(tout, T);
vu(c.total === 7 && c.fixe === 2 && c.enchere === 2 && c.finie === 1 && c.libre === 2, 'A10 compteurs ' + JSON.stringify(c));
for (const s of tout) for (const qui of [MOI, AUTRE, null]) {
  const g = M.gestesSkin(s, qui, T);
  vu(JSON.stringify(g.map((x) => x.genre)) === JSON.stringify(actionsSkin(s, qui, T)) && g.every((x) => typeof x.libelle === 'string' && x.libelle.length > 1), 'A11 gestes = actionsSkin (#' + s.tokenId + ', ' + qui + ')');
}
vu(M.gestesSkin(fixe, null, T).length === 0, 'A12 sans wallet : aucun geste (lire n est pas agir)');
vu(M.SKM_LIBELLES.RETIRER === 'Cancel listing' && M.SKM_LIBELLES.REGLER === 'Settle ended auction' && M.SKM_LIBELLES.ENCHERIR === 'Bid' && M.SKM_LIBELLES.ACHETER === 'Buy', 'A13 libelles demandes (Buy / Bid / Cancel listing / Settle ended auction)');
vu(M.montantOffre(ench, null) === 2_100_000n && M.montantOffre(enchTot, '') === 1_000_000n, 'A14 offre par defaut = le minimum du contrat (+5 % ; l ouverture sans offre)');
let refus = false; try { M.montantOffre(ench, 2_099_999n); } catch (_) { refus = true; }
vu(refus, 'A15 une offre sous le minimum (+5 %) est REFUSEE');
vu(M.montantOffre(ench, 5_000_000n) === 5_000_000n, 'A16 une offre au-dessus du minimum est gardee');
const o1 = M.offresChangees(null, tout);
/* game399: keyed contract:token (a fixture with no contract is ':5') */
vu(o1.changees.size === 0 && o1.apres.get(':5') === 2_000_000n && !o1.apres.has(':3'), 'A17 premiere lecture : aucun « new bid » ; seules les encheres sont suivies');
const o2 = M.offresChangees(o1.apres, tout.map((s) => (s.tokenId === 5n ? { ...s, offre: 2_100_000n } : s)));
vu(o2.changees.size === 1 && o2.changees.has(':5'), 'A18 l offre de #5 change : « new bid » sur #5 seulement');
const o3 = M.offresChangees(o2.apres, tout.map((s) => (s.tokenId === 5n ? { ...s, offre: 2_100_000n } : s)));
vu(o3.changees.size === 0, 'A19 offre inchangee : pas de pouls');
const o4 = M.offresChangees(o1.apres, [...tout, sk({ tokenId: 8n, enVente: true, enchere: true, fin: T + 99, offre: 7n })]);
vu(!o4.changees.has('8'), 'A20 une enchere qui APPARAIT n est pas « une nouvelle offre »');
vu(M.cleLigneSkin(ench, MOI, T) === M.cleLigneSkin(ench, MOI, T + 30) && M.cleLigneSkin(ench, MOI, T) !== M.cleLigneSkin({ ...ench, offre: 2_100_000n }, MOI, T)
  && M.cleLigneSkin(ench, MOI, T) !== M.cleLigneSkin(ench, null, T), 'A21 cle de ligne : stable dans le temps, change avec l offre et le wallet');
vu(M.cleLigneSkin(ench, MOI, T) !== M.cleLigneSkin(ench, MOI, T + 3600), 'A22 cle de ligne : change quand l enchere se termine (Settle apparait)');
vu(M.tempsRestant(T + 2 * 86400 + 3 * 3600, T) === '2 d 3 h' && M.tempsRestant(T + 4 * 3600 + 12 * 60, T) === '4 h 12 min' && M.tempsRestant(T + 61, T) === '2 min' && M.tempsRestant(T, T) === 'ended', 'A23 temps restant');
const svg = M.apercuSkinSvg(rec);
vu(svg === M.apercuSkinSvg({ ...rec }) && svg.startsWith('<svg') && ['hsl(51 ', 'hsl(43 ', 'hsl(218 ', 'hsl(337 ', 'hsl(280 ', 'hsl(75 ', 'rotate(159 '].every((x) => svg.includes(x)), 'A24 apercu : deterministe, ses SEPT teintes');
const piege = M.apercuSkinSvg({ id: 'random', angle: '"><script>x</script>', h: ['<b>', 400, -5], cube: 'x', noyau: 511, fond: null });
vu(!/<script|<b>|NaN/.test(piege) && piege.split('<').length === svg.split('<').length &&piege.includes('hsl(40 ') && piege.includes('hsl(355 ') && piege.includes('hsl(151 '), 'A25 apercu : seuls des entiers 0..359 entrent (9 bits ramenes modulo 360)');
vu(M.brutVersTexte(1_050_000_000_000_000n, 18) === '0.00105' && M.brutVersTexte(2_100_000n, 6) === '2.1' && M.brutVersTexte(5n, 0) === '5' && M.brutVersTexte(123456789012345678n, 18) === '0.123456789012345678', 'A26 montant EXACT (aucune decimale coupee)');
const minEth = offreMinimale({ prix: 1n, offre: 1_234_567_891_234_567n });
vu(montantVersBrut(M.brutVersTexte(minEth, 18), 18) === minEth, 'A27 le minimum pre-rempli, retape, redonne EXACTEMENT le minimum');
vu(M.detenteurCourt(mienne, MOI) === 'you' && M.detenteurCourt(fixe, MOI) === '0x5555…5555' && M.detenteurCourt({ detenteur: 'x' }, MOI) === 'not read', 'A28 detenteur court');
vu(M.SKM_RAFRAICHIR_MS >= 20000 && M.SKM_RAFRAICHIR_MS <= 30000, 'A29 relecture entre 20 et 30 s (demande : 20-30 s)');
vu(Object.values(M.SKM_STATUTS).every((x) => /^[a-z ]+$/.test(x)) && M.SKM_STATUTS.ENCHERE_FINIE === 'auction ended', 'A30 statuts dits en anglais');

/* ── B. CABLAGE ── */
const html = fs.readFileSync(APP, 'utf8').replace(/\r\n/g, '\n');
const corps = (nom) => { const i = html.indexOf(nom); if (i < 0) return ''; const j = html.slice(i + 10).search(/\n(async )?function |\n\/\* ══|\nsetInterval\(/); return html.slice(i, j > 0 ? i + 10 + j : i + 6000); };
const iTrade = html.indexOf('<section class="volet" id="v-trade"'), finTrade = html.indexOf('</section>', iTrade);
const trade = iTrade > 0 ? html.slice(iTrade, finTrade) : '';
vu(html.split('id="skinsMarche"').length === 2 && /id="skinsMarche"[\s\S]*id="skmNote"[\s\S]*id="skmFiltres"[\s\S]*id="skmListe"/.test(trade), 'B1 la section Skins (#skinsMarche, note, filtres, liste) est dans l onglet Market, une fois');
const peindre = corps('async function peindreSkinsMarche('), liste = corps('function skmPeindreListe('), ligne = corps('function skmLigne('), action = corps('async function bcActionMarche(');
vu(peindre && liste && ligne && action, 'B2 fonctions trouvees');
vu(/r = await lireSkins\(\{ rpc \}\)/.test(peindre) && !/rpc\(/.test(ligne) && !/rpc\(/.test(liste), 'B3 UNE lecture paginee (lireSkins) ; aucun appel RPC par ligne');
vu(/if \(!r \|\| r\.etat !== 'LU'\) \{[\s\S]{0,200}could not be read right now — nothing is listed rather than a wrong list/.test(peindre) && /not read again at /.test(liste), 'B4 lecture ratee DITE ; la liste precedente reste, datee');
vu(/offresChangees\(skm\.offres, r\.skins\)/.test(peindre) && /skm\.pouls\.set\(id, Date\.now\(\) \+ SKM_POULS_MS\)/.test(peindre) && /text: 'new bid'/.test(html), 'B5 « new bid » quand une offre change entre deux lectures');
vu(/setInterval\(\(\) => \{\n  const v = document\.getElementById\('v-trade'\);\n  if \(document\.hidden \|\| !v \|\| !v\.classList\.contains\('on'\)\) return;\n  if \(Date\.now\(\) - skm\.lu >= SKM_RAFRAICHIR_MS[^\n]*void peindreSkinsMarche\(true\)/.test(html), 'B6 relecture toutes les SKM_RAFRAICHIR_MS, seulement onglet Market ouvert et page visible');
vu(/if \(nom === 'trade'\) void peindreSkinsMarche\(\);/.test(html), 'B7 ouvrir l onglet Market lit les skins');
vu(/for \(const g of gestesSkin\(s, moi, t\)\)/.test(ligne) && !/actionsSkin\(/.test(ligne) && (ligne.match(/bcActionMarche\(/g) || []).length >= 2, 'B8 les gestes d une ligne viennent de gestesSkin (= actionsSkin) et passent par bcActionMarche');
vu(/montantOffre\(s, montantVersBrut\(champ\.value, d\.dec\)\)/.test(ligne) && /champ\.value = brutVersTexteSkin\(min, d\.dec\)/.test(ligne), 'B9 l offre tapee est bornee au minimum (+5 %), pre-remplie EXACTE');
vu(/bcFormVendreSkin\(s, g\.libelle\)/.test(ligne), 'B10 Sell / Start an auction : le formulaire partage');
vu(/for \(const \[tag, at\] of apercuSkinFormes\(s\.recette\)\) \{ const e = document\.createElementNS\(NS, tag\);/.test(ligne) && !/\.innerHTML\s*=/.test(ligne), 'B11 la face : noeuds SVG construits (createElementNS), aucun innerHTML');
vu(/const occupe = [^\n]*document\.activeElement/.test(liste) && /const garder = !!ancien && \(ancien\.cle === cle \|\| occupe\);/.test(liste) &&/if \(z\.children\.length !== enfants\.length \|\| enfants\.some\(\(e, i\) => z\.children\[i\] !== e\)\) z\.replaceChildren/.test(liste), 'B12 une relecture n efface pas ce qu on tape (ligne occupee gardee, ordre deplace seulement s il change)');
const iPop = action.indexOf('bcOuvrirPop({ vue: \'chat\''), iMsg = action.indexOf('const m = bcMessage(');
vu(iPop > 0 && iPop < iMsg, 'B13 bcActionMarche ouvre le panneau avant d y ecrire sa carte');
const iRelu = action.indexOf('appelPage(s.tokenId, 1)'), iAppel = action.indexOf('appels.push(genre === \'ACHETER\''), iSigne = action.indexOf("await bcSigner(m, appels, 'skin_vente')");
vu(iRelu > 0 && iAppel > iRelu && iSigne > iAppel, 'B14 la skin est RELUE sur la chaine avant de construire l appel');
/* 2026-10-23 (revue adverse) : la decision apres relecture est PURE (relectureAvantSigner, skins-marche.js) ; son comportement — relecture
 *   ratee, geste devenu impossible, prix / offre changes, bornes du brain — est prouve en EXECUTANT bcActionMarche dans
 *   test-skins-relecture-bornes-20261023.mjs. Ici : le cablage. */
vu(/const rl = relectureAvantSigner\(\{ genre, montre: s, frais, moi: compte,/.test(action) && /if \(!rl\.ok\) \{[\s\S]{0,900}?\n        return;\n      \}\n      v = frais; montant = rl\.montant;/.test(action), 'B15 la skin relue passe par relectureAvantSigner ; refus = rien n est demande');
vu(/if \(rl\.code === 'NON_LU'\) bcBoutons\(m, \[\['Try again', go, true\]/.test(action), 'B16 relecture ratee : « Try again »');
vu(!/s = frais;/.test(action) && !/montantOffre\(/.test(action), 'B17 le montant n est plus recalcule apres la relecture (ni « s = frais », ni montantOffre sur la skin relue)');
const carte = html.slice(html.indexOf('<div class="carte" id="skinCarte">'), html.indexOf('<!-- HOW IT WORKS'));
vu(/<button type="button" class="bouton sec" id="skinOuvrirMarche">Open the skin market<\/button>/.test(carte)
  /* 2026-10-27 (owner): the button opens the skin auction room window; the room leads to the Market tab Skins section */
  && /\$\('#skinOuvrirMarche'\)\.addEventListener\('click', \(\) => void ouvrirSalle\(\)\)/.test(html)
  && /function allerAuMarcheSkins\(\) \{ allerA\('trade'\);[^\n]*getElementById\('skinsMarche'\)/.test(html)
  && /\$\('#skVersMarket'\)\.addEventListener\('click', \(\) => \{ \$\('#skPop'\)\.close\(\); allerAuMarcheSkins\(\); \}\)/.test(html), 'B18 le Game (Skin market) ouvre la salle des encheres, qui mene a la section Skins de l onglet Market');
vu(/import \{[^}]*gestesSkin[^}]*\} from '\.\/skins-marche\.js';/.test(html), 'B19 app.html importe skins-marche.js');
const serveur = fs.readFileSync(path.join(ICI, 'serveur-web.js'), 'utf8');
const servis = (serveur.match(/const SERVIS\s*=\s*\[([\s\S]*?)\];/) || [, ''])[1];
vu(/'skins-marche\.js'/.test(servis), 'B20 skins-marche.js est SERVI (sinon l app meurt sur l import)');
const ecran = [peindre, liste, ligne, corps('function skmPouls('), corps('function skmPeindreFiltres('), trade.slice(trade.indexOf('id="skinsMarche"'))].join('\n')
  .match(/text: '[^']*'|textContent = [^;]*;|'[A-Z][a-z][^']{3,}'|>[^<>{}]{4,}</g) || [];
vu(ecran.length > 15, 'B21 textes d ecran trouves (' + ecran.length + ')');
/* seules les CHAINES (entre apostrophes, ou le texte d une balise) sont lues : les noms de variables (s.offre, c.enchere) ne s affichent pas */
const chaines = (l) => (l.startsWith('>') ? [l] : (l.match(/'[^']*'/g) || [])).filter((x) => !/^'(ENCHERE|ENCHERE_FINIE|FIXE|LIBRE|ACHETER|ENCHERIR|REGLER|RETIRER|METTRE_EN_VENTE|span|div|button|input|p|b|on|skm[A-Za-z]*|[a-z-]+)'$/.test(x)).join(' ');
for (const l of ecran) vu(!/\bNFTs?\b|0xa6cf|\b(enchere|vente|detenteur|lecture|offre|lue?s?)\b/i.test(chaines(l)),'B22 texte d ecran anglais, sans « NFT » ni adresse de frais : ' + l.slice(0, 100));

/* ── C. MUTANTS (sur des COPIES) ── */
if (!process.env.TB_SKM_SANS_MUTANTS) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skm-mut-'));
  const srcSkm = fs.readFileSync(path.join(ICI, 'skins-marche.js'), 'utf8').replace("from './blockskins.js'", "from '" + pathToFileURL(path.join(ICI, 'blockskins.js')).href + "'")
    .replace("from './frais-creation.js'", "from '" + pathToFileURL(path.join(ICI, 'frais-creation.js')).href + "'"); /* 2026-10-26 (game57 item 10): skins-marche imports the fee-address mask */
  const srcApp = fs.readFileSync(APP, 'utf8').replace(/\r\n/g, '\n'); /* la COPIE est en LF (le depot l est ; core.autocrlf rend du CRLF sur Windows) */
  const MUTANTS = [
    ['skm', 'une enchere finit une seconde trop tard', "return Number(t) >= Number(s.fin) ? 'ENCHERE_FINIE'", "return Number(t) > Number(s.fin) ? 'ENCHERE_FINIE'"],
    ['skm', 'Mine sans wallet rend tout', "return ADR.test(m) ? l.filter((s) => s.detenteur === m) : [];", 'return ADR.test(m) ? l.filter((s) => s.detenteur === m) : l.slice();'],
    ['skm', 'Auctions oublie les finies', "return x === 'ENCHERE' || x === 'ENCHERE_FINIE';", "return x === 'ENCHERE';"],
    ['skm', 'ordre : encheres apres les prix fixes', 'const rang = { ENCHERE: 0, ENCHERE_FINIE: 1, FIXE: 2, LIBRE: 3 };', 'const rang = { ENCHERE: 2, ENCHERE_FINIE: 1, FIXE: 0, LIBRE: 3 };'],
    ['skm', 'gestes ajoutes hors contrat', 'return actionsSkin(s, moi, t).map(', "return [...actionsSkin(s, moi, t), ...(s && s.enVente ? [] : ['ACHETER'])].map("],
    ['skm', 'offre sous le minimum acceptee', 'if (x < min) throw', 'if (x < min - 1n) throw'],
    ['skm', 'pouls a la premiere lecture', 'if (avant instanceof Map && avant.has(id) && avant.get(id) !== o && o > 0n)', 'if (!(avant instanceof Map) || (avant.has(id) && avant.get(id) !== o && o > 0n))'],
    ['skm', 'cle de ligne sans l offre', "String(s.prix), String(s.offre), s.encherisseur", 'String(s.prix), s.encherisseur'],
    ['skm', 'apercu laisse passer le texte', 'const teinte = (v) => { const x = Math.trunc(Number(v)); return Number.isFinite(x) ? ((x % 360) + 360) % 360 : 0; };', 'const teinte = (v) => v;'],
    ['skm', 'montant arrondi a 8 decimales', "f = s.slice(s.length - d).replace(/0+$/, '');", "f = s.slice(s.length - d).replace(/0+$/, '').slice(0, 8);"],
    ['skm', 'relecture a 60 s', 'export const SKM_RAFRAICHIR_MS = 25000;', 'export const SKM_RAFRAICHIR_MS = 60000;'],
    ['app', 'un appel RPC par ligne', "  const face = bcEl('span', { cls: 'skmFace', title: nomSkin(s) });", "  void rpc('eth_call', []);\n  const face = bcEl('span', { cls: 'skmFace', title: nomSkin(s) });"],
    ['app', 'lecture ratee : liste vide sans le dire', "if (!skm.liste) { z.textContent = ''; note.textContent = 'The skins could not be read right now — nothing is listed rather than a wrong list. Read again in a moment.'; }", "if (!skm.liste) { z.textContent = ''; note.textContent = 'No skin minted yet.'; }"],
    ['app', 'relecture meme onglet ferme', "  if (document.hidden || !v || !v.classList.contains('on')) return;\n  if (Date.now() - skm.lu", '  if (document.hidden) return;\n  if (Date.now() - skm.lu'],
    ['app', 'onglet Market ne lit plus les skins', "  if (nom === 'trade') void peindreSkinsMarche();", ''],
    ['app', 'pas de relecture avant de signer', "try { frais = decoderPage(await rpc('eth_call', [{ to: K, data: appelPage(s.tokenId, 1) }, 'latest']))[0] || null; if (frais) frais.contrat = K; } catch (_) { frais = null; }", 'frais = s;'],
    ['app', 'refus de la relecture ignore', '      if (!rl.ok) {', '      if (false) {'],
    ['app', 'montant recalcule apres relecture', 'v = frais; montant = rl.montant;', 'v = frais; montant = offreMinimale(frais);'],
    ['app', 'le panneau ne s ouvre plus', "  try { bcOuvrirPop({ vue: 'chat', sansBasculer: true, deplier: true }); } catch (_) { /* la carte est quand meme dans le fil */ }\n", ''],
    ['app', 'le Game ne mene plus au marche', '        <button type="button" class="bouton sec" id="skinOuvrirMarche">Open the skin market</button>\n', ''],
    ['app', 'une ligne repeinte pendant qu on tape', 'const garder = !!ancien && (ancien.cle === cle || occupe);', 'const garder = !!ancien && ancien.cle === cle;'],
    ['app', 'gestes regles a cote du contrat', 'for (const g of gestesSkin(s, moi, t)) {', "for (const g of actionsSkin(s, moi, t).map((genre) => ({ genre, libelle: genre }))) {"],
  ];
  const lancer = (env) => spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, TB_SKM_SANS_MUTANTS: '1', ...env }, encoding: 'utf8' });
  const fSkm = path.join(tmp, 'skins-marche.js'), fApp = path.join(tmp, 'app.html');
  for (const [cible, nom, de, vers] of MUTANTS) {
    const src = cible === 'skm' ? srcSkm : srcApp;
    if (src.split(de).length !== 2) { vu(false, 'C mutant « ' + nom + ' » : motif introuvable ou multiple'); continue; }
    fs.writeFileSync(fSkm, cible === 'skm' ? src.replace(de, vers) : srcSkm);
    fs.writeFileSync(fApp, cible === 'app' ? src.replace(de, vers) : srcApp);
    const r = lancer({ TB_SKM: fSkm, TB_APP: fApp });
    const rouges = (r.stdout.match(/^KO /gm) || []).length;
    vu(r.status !== 0 && (rouges > 0 || /Error/.test(r.stderr)), 'C mutant « ' + nom + ' » : doit ROUGIR (' + rouges + ' KO)');
    console.log((r.status !== 0 ? 'ok ' : 'KO ') + ' C mutant « ' + nom + ' » : ' + (rouges ? rouges + ' KO' : 'plante'));
  }
  fs.writeFileSync(fSkm, srcSkm); fs.writeFileSync(fApp, srcApp);
  const t = lancer({ TB_SKM: fSkm, TB_APP: fApp });
  vu(t.status === 0, 'C temoin : les copies NON mutees sont vertes (' + (t.stdout.match(/^KO .*/gm) || []).slice(0, 3).join(' | ') + ')');
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(n + ' assertions, ' + ko + ' KO' + (process.env.TB_SKM_SANS_MUTANTS ? ' (sans mutants)' : '') + ' ; NE PROUVE PAS un vrai achat ni une vraie offre signes');
process.exit(ko ? 1 : 0);
