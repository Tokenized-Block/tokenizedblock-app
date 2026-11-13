// blockskins.js - L APP ET LE CONTRAT BlockSkins DEPLOYE (Phil, 2026-10-11 : « le market des skins : 1 skin a 1 dollar, enchères avec des
// actions tokenized Coinbase, fees de l app sur chaque achat/vente, ce qui l achete voit son brain prendre l apparence du skin, visible
// dans le wallet »).
// Le contrat est DEPLOYE (lu sur la chaine le 2026-10-11) : blockskins-deploiement.js. Ses regles sont GRAVEES : mint au prix MINT_PRICE
//   (1 USDC sur v2 ; 10 USDC sur v3, Phil 2026-10-18 — lu dans l enregistrement, blockskins-actif.js) au wallet de frais ; vente/enchere en devise admise (currencyAllowed - ETH et USDC aujourd hui) ; 10 % de chaque vente au wallet de frais ;
//   enchere <= 7 jours, prolongee de 5 min sur une offre tardive ; surenchere minimale 5 % ; validation « les deux cochent » executable
//   par n importe qui (un agent) sans jamais garder les fonds.
// ⛔ CE MODULE NE SIGNE RIEN ET N ENVOIE RIEN : il encode des appels NON SIGNES et decode des lectures. Le wallet de la personne signe.
// ⛔ La skin appartient a qui DETIENT le NFT (ownerOf / skinsPage.holder) - jamais a un index de serveur.
import { BLOCKSKINS_DEPLOIEMENT } from './blockskins-deploiement.js';
import { BLOCKSKINS_ACTIF, BLOCKSKINS, BLOCKSKINS_VERSION, SKIN_MINT_USDC, SKIN_MINT_TEXTE, SKIN_MINT_OUVERT, BLOCKSKINS_LUS, BLOCKSKINS_SUITE } from './blockskins-actif.js';
import { selecteur } from './encodeur.js';
import { ACTIONS_COINBASE } from './paires.js';
import { displayShort } from './frais-creation.js';

/* ══ 2026-10-18 (Phil 08:40 : « tous les skins a 10 dollars ») : l ADRESSE et le PRIX DE MINT viennent de blockskins-actif.js — le premier
 *   contrat DEPLOYE de l enregistrement genere (v3 des que son adresse est notee par noter-deploiement-blockskins.mjs ; v2, 1 USDC, avant),
 *   avec le prix RELU sur la chaine quand l adresse a ete notee. Plus aucune constante de prix tapee ici : l app relit MINT_PRICE() avant
 *   d acheter et refuse si la chaine dit autre chose que l enregistrement. */
export { BLOCKSKINS_ACTIF, BLOCKSKINS, BLOCKSKINS_VERSION, SKIN_MINT_USDC, SKIN_MINT_TEXTE, SKIN_MINT_OUVERT, BLOCKSKINS_LUS, BLOCKSKINS_SUITE };
/* 2026-11-12 (the economy pack is live): skins live on SEVERAL contracts — the pack's Skins (minted on now, through the TBLOCK payment
 *   router) and the earlier ones. Every skin read carries its `contrat`; every market call takes the skin's own contract as its last
 *   argument (default: the active one), so an earlier skin is still sold, bought or settled where it lives. */
const contratDe = (c) => { const b = bas(c || BLOCKSKINS); if (!BLOCKSKINS_LUS.includes(b)) throw new Error('not a skins contract of this app'); return b; };
export const BLOCKSKINS_CHAINE = BLOCKSKINS_DEPLOIEMENT.chaine;
export const SKIN_FRAIS_BPS = 1000n;      /* SALE_FEE_BPS : 10 % */
export const SKIN_ENCHERE_MAX_S = 604800n; /* MAX_AUCTION : 7 jours */
export const SKIN_SURENCHERE_BPS = 500n;   /* MIN_RAISE_BPS : +5 % */
/* ⛔⛔ Phil, 2026-10-11 : « v2 avant tout mint ». Le contrat v1 (0xea6c…e77d) ne montre pas la skin dans un wallet : son tokenURI n a AUCUNE
 *   image, et son JSON brut porte « # » - fetch() (lecteur conforme) le coupe a 29 caracteres sur 219, JSON invalide (mesure sur fork,
 *   skin #1). Le mint ne s ouvre que sur un deploiement dont l enregistrement GENERE dit que le tokenURI porte l image (derive de la
 *   source) ET dont l adresse a ete relue sur la chaine - jamais sur un drapeau pose a la main ici (SKIN_MINT_OUVERT, blockskins-actif.js). */
export const ETH = '0x0000000000000000000000000000000000000000';
const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x || '').toLowerCase();
const mot = (n) => BigInt(n).toString(16).padStart(64, '0');
const adrMot = (a) => { const b = bas(a); if (!ADR.test(b)) throw new Error('a whole address is required'); return b.slice(2).padStart(64, '0'); };
const positif = (v, nom) => { let x; try { x = BigInt(v); } catch (_) { throw new Error(nom + ' must be raw integer units'); } if (x <= 0n) throw new Error(nom + ' must be above zero'); return x; };
const ent359 = (n) => Number.isInteger(n) && n >= 0 && n <= 359;

/** La recette de l app ({ id:'random', angle, h:[h1,h2,h3], cube, noyau, fond }) -> les 7 teintes, DANS L ORDRE DU CONTRAT :
 *  tour de l anneau, anneau 1, 2, 3, aretes, noyau, fond. Refus (jamais d arrondi) hors 0..359. */
export function recetteVersTeintes(r) {
  const h = r && Array.isArray(r.h) ? r.h : [];
  const t = [r && r.angle, h[0], h[1], h[2], r && r.cube, r && r.noyau, r && r.fond];
  if (!r || r.id !== 'random' || h.length !== 3 || !t.every(ent359)) throw new Error('a skin is seven whole hues from 0 to 359');
  return t;
}
/** packRecipe du contrat, en JS : teinte i << 9*i (uint64, bit 63 a 0). Verifiee contre l eth_call packRecipe du contrat deploye. */
export function packRecette(r) {
  return recetteVersTeintes(r).reduce((acc, v, i) => acc | (BigInt(v) << BigInt(9 * i)), 0n);
}
export function unpackRecette(n) {
  const x = BigInt(n);
  const t = [0, 1, 2, 3, 4, 5, 6].map((i) => Number((x >> BigInt(9 * i)) & 0x1ffn));
  return { id: 'random', angle: t[0], h: [t[1], t[2], t[3]], cube: t[4], noyau: t[5], fond: t[6] };
}

/* ── LES APPELS (non signes) ── */
const appel = (sig, args, value = 0n, nom = '', contrat = null) => ({ to: contratDe(contrat), data: '0x' + selecteur(sig) + args.join(''), value: '0x' + BigInt(value).toString(16), nom });
/** mint : MINT_PRICE (SKIN_MINT_USDC) passe du wallet de la personne au wallet de frais ; le NFT est a elle. Suppose l approbation USDC (appelApprouver). */
export function appelMint(block, recette) {
  /* ⛔ le nom de l etape S AFFICHE (« Step 2 of 2: ... ») : jamais « NFT » a l ecran (Phil, 2026-10-11 : « un nouveau type relie au block ») */
  /* 2026-11-12 : un contrat paye par le routeur n a PAS de mint direct (economie-pack.js payBatch + dataSkin) */
  if (BLOCKSKINS_ACTIF.routeur) throw new Error('skins are paid through the TBLOCK payment router');
  return appel('mint(address,uint64)', [adrMot(block), mot(packRecette(recette))], 0n, 'Mint this skin for this block — ' + SKIN_MINT_TEXTE + ' to TokenizedBlock');
}
/** approve(BlockSkins, montant) EXACT sur un jeton (USDC, une action admise) - jamais illimite. */
export function appelApprouver(jeton, montant, nom = 'Allow the skins market to take exactly this amount', contrat = null) {
  const m = positif(montant, 'the amount');
  return { to: bas(jeton), data: '0x095ea7b3' + adrMot(contratDe(contrat)) + mot(m), value: '0x0', nom };
}
export function appelMettreEnVente(tokenId, devise, prix, contrat = null) {
  return appel('list(uint256,address,uint256)', [mot(positif(tokenId, 'the skin')), adrMot(devise), mot(positif(prix, 'the price'))], 0n, 'List your skin at a fixed price', contrat);
}
export function appelRetirer(tokenId, contrat = null) { return appel('unlist(uint256)', [mot(positif(tokenId, 'the skin'))], 0n, 'Take your skin back from the market', contrat); }
/** buy : en ETH la valeur EST le prix ; en jeton, la valeur est 0 (approbation exacte du prix avant). */
export function appelAcheter(tokenId, devise, prix, contrat = null) {
  const p = positif(prix, 'the price');
  return appel('buy(uint256)', [mot(positif(tokenId, 'the skin'))], bas(devise) === ETH ? p : 0n, 'Buy this skin — 10 % of the price goes to TokenizedBlock', contrat);
}
export function appelOuvrirEnchere(tokenId, devise, offreMin, dureeS, contrat = null) {
  const d = positif(dureeS, 'the duration');
  if (d > SKIN_ENCHERE_MAX_S) throw new Error('an auction lasts 7 days at most');
  return appel('startAuction(uint256,address,uint256,uint256)', [mot(positif(tokenId, 'the skin')), adrMot(devise), mot(positif(offreMin, 'the minimum bid')), mot(d)], 0n, 'Open an auction for your skin', contrat);
}
export function appelEncherir(tokenId, devise, montant, contrat = null) {
  const m = positif(montant, 'the bid');
  return appel('bid(uint256,uint256)', [mot(positif(tokenId, 'the skin')), mot(m)], bas(devise) === ETH ? m : 0n, 'Bid on this skin', contrat);
}
export function appelRegler(tokenId, contrat = null) { return appel('settle(uint256)', [mot(positif(tokenId, 'the skin'))], 0n, 'Settle the auction', contrat); }
export function appelRetirerCredit(devise, contrat = null) { return appel('withdraw(address)', [adrMot(devise)], 0n, 'Withdraw what the market owes you', contrat); }

/** L offre minimale suivante : le prix d ouverture sans offre ; sinon +5 % ET strictement au-dessus (regle du contrat).
 *  ⛔ 2026-10-11 (banc fork) : lisait `v.enchere` - le BOOLEEN « c est une enchere » de la vitrine - au lieu de `v.offre` : minimum de 2 wei,
 *    offre refusee par le contrat. Les noms sont ceux de decoderPage : `prix` (ouverture) et `offre` (la plus haute). */
export function offreMinimale(v) {
  const enchere = BigInt(v.offre || 0), prix = BigInt(v.prix || 0);
  if (enchere === 0n) return prix;
  const plancher = enchere + (enchere * SKIN_SURENCHERE_BPS) / 10000n;
  return plancher > enchere ? plancher : enchere + 1n;
}
/** Ce que recoit le vendeur et ce que recoit l app sur un prix (10 % arrondis vers le bas, comme le contrat). */
export function partage(prix) {
  const p = BigInt(prix), frais = (p * SKIN_FRAIS_BPS) / 10000n;
  return { frais, vendeur: p - frais };
}

/* ── LA VITRINE : skinsPage(from, count) -> SkinView[11 mots] ── */
export function appelPage(depuis, combien) { return '0x' + selecteur('skinsPage(uint256,uint256)') + mot(depuis) + mot(combien); }
export function decoderPage(hex) {
  const h = String(hex || '').replace(/^0x/, '');
  if (h.length < 128 || !/^[0-9a-f]*$/i.test(h)) throw new Error('unreadable skins page');
  const w = (i) => h.slice(i * 64, i * 64 + 64);
  const n = Number(BigInt('0x' + w(1)));
  if (h.length < (2 + n * 11) * 64) throw new Error('truncated skins page');
  const out = [];
  for (let k = 0; k < n; k += 1) {
    const b = 2 + k * 11, a = (i) => '0x' + w(b + i).slice(24), u = (i) => BigInt('0x' + w(b + i));
    out.push({ tokenId: u(0), detenteur: a(1), block: a(2), recette: unpackRecette(u(3)), enVente: u(4) === 1n, enchere: u(5) === 1n,
      devise: a(6), prix: u(7), fin: Number(u(8)), encherisseur: a(9), offre: u(10) });
  }
  return out;
}
/* ══ game390 (Phil, 2026-11-13: two different skins both read "Skin #1 dresses UNIT" — skins live on several contracts and each one
 *   numbers its tokens from 1 ; « fix la numérotation avec leur propre numérotation pour que ça soit plus simple »). ONE app-wide number
 *   per skin, in mint order, the same rule as the TAM fix (game378, tam-onglet.js nomPublicTam): the contracts OLDEST FIRST
 *   (BLOCKSKINS_SUITE, from the records) ; N_i = the totalSupply of contract i READ ON CHAIN at the creation block of contract i+1 (the
 *   skins it minted before the next one went live ; tokenId = ++totalSupply, no burn) ; the skin k of contract i is #(N_0 + … + N_(i-1) + k).
 *   Nothing is guessed: a count not read, or a token of an older contract above its N (minted there after the next one went live), and
 *   the skin is named by its contract and token id instead. ONLY THE LABEL CHANGES: every read and every call keeps the skin's own
 *   contract and tokenId. Pure. */
const adrCourte = (a) => displayShort(bas(a));
export function nomPublicSkin(contrat, tokenId, comptes, suite = BLOCKSKINS_SUITE) {
  let k = null;
  try { const b = BigInt(tokenId); if (b >= 1n && b <= BigInt(Number.MAX_SAFE_INTEGER)) k = Number(b); } catch (_) { k = null; }
  const c = bas(contrat), L = Array.isArray(suite) ? suite : [], i = L.findIndex((x) => x && x.contrat === c);
  const lu = (n) => Number.isSafeInteger(n) && n >= 0;
  let numero = null;
  if (k !== null && i >= 0 && Array.isArray(comptes) && comptes.length >= i && comptes.slice(0, i).every(lu)) {
    const decalage = comptes.slice(0, i).reduce((a, n) => a + n, 0);
    if (i === L.length - 1 || (lu(comptes[i]) && k <= comptes[i])) numero = decalage + k;
  }
  const jeton = 'token ' + (k === null ? String(tokenId) : k) + ' of ' + adrCourte(c);
  return { numero, nom: numero === null ? 'Skin ' + jeton : 'Skin #' + numero, texte: numero === null ? 'skin ' + jeton : 'skin #' + numero,
    detail: 'Token ' + (k === null ? String(tokenId) : k) + ' on the skins contract ' + adrCourte(c) };
}
/* N_i read once per page or process: a past block's totalSupply never changes, so a READ count is kept (never a failed one: it is read
 *   again next time). Key = contract @ block. */
const comptesSkinsCache = new Map();
/** [N_0 … N_(m-1)] for the m+1 contracts of `suite` (null = not read: an answer that is not one whole word — '0x' before the contract
 *  existed — is never read as 0) */
export async function lireComptesSkins({ rpc, suite = BLOCKSKINS_SUITE }) {
  const out = [];
  for (let i = 0; i + 1 < suite.length; i += 1) {
    const c = bas(suite[i].contrat), b = suite[i + 1].bloc, cle = c + '@' + b;
    if (comptesSkinsCache.has(cle)) { out.push(comptesSkinsCache.get(cle)); continue; }
    let n = null;
    if (Number.isSafeInteger(b) && b > 0) {
      try {
        const brut = String(await rpc('eth_call', [{ to: c, data: '0x' + selecteur('totalSupply()') }, '0x' + b.toString(16)]));
        if (/^0x[0-9a-f]{64}$/i.test(brut)) { const v = BigInt(brut); if (v <= BigInt(Number.MAX_SAFE_INTEGER)) n = Number(v); }
      } catch (_) { n = null; }
    }
    if (n !== null) comptesSkinsCache.set(cle, n);
    out.push(n);
  }
  return out;
}
/** the counts already read (no network): for a reader that names a skin outside lireSkins (the server's game journal) */
export function comptesSkinsLus(suite = BLOCKSKINS_SUITE) {
  const out = [];
  for (let i = 0; i + 1 < suite.length; i += 1) { const cle = bas(suite[i].contrat) + '@' + suite[i + 1].bloc; out.push(comptesSkinsCache.has(cle) ? comptesSkinsCache.get(cle) : null); }
  return out;
}
/** the name every screen shows for a skin read (lireSkins put it on the skin) ; a skin object without it is named here from the counts
 *  already read — never by its bare token id. `nomSkin` starts a line ("Skin #2"), `texteSkin` sits in a sentence ("skin #2"),
 *  `cleSkin` identifies it (contract + token id: two contracts both have a token 1). */
export const nomSkin = (s) => (s && typeof s.nom === 'string' && s.nom ? s.nom : nomPublicSkin(s && s.contrat, s && s.tokenId, comptesSkinsLus()).nom);
export const texteSkin = (s) => (s && typeof s.texte === 'string' && s.texte ? s.texte : nomPublicSkin(s && s.contrat, s && s.tokenId, comptesSkinsLus()).texte);
export const detailSkin = (s) => (s && typeof s.detail === 'string' && s.detail ? s.detail : nomPublicSkin(s && s.contrat, s && s.tokenId, comptesSkinsLus()).detail);
export const cleSkin = (s) => bas(s && s.contrat) + ':' + String(s && s.tokenId);
/** Toutes les skins, par pages de `pas` (lecture seule). Rend { etat:'LU', skins } ou { etat:'NON_LU', pourquoi } - jamais une liste vide
 *  a la place d une lecture ratee. game390: each skin also carries its app-wide name (nomPublicSkin: numero, nom, texte, detail). */
export async function lireSkins({ rpc, pas = 100, max = 2000, contrats = BLOCKSKINS_LUS, suite = BLOCKSKINS_SUITE }) {
  /* 2026-11-12 : every skins contract, oldest first (the active one last: skinPortee keeps the LAST skin held for a block); each skin
   *   carries its contract. One contract unread = NON_LU for all (never a list with a silent hole). */
  try {
    let total = 0, tronque = false;
    const skins = [];
    for (const c of contrats) {
      const k = bas(c);
      const n = Number(BigInt(await rpc('eth_call', [{ to: k, data: '0x' + selecteur('totalSupply()') }, 'latest'])));
      total += n; if (n > max) tronque = true;
      for (let depuis = 1; depuis <= Math.min(n, max); depuis += pas) {
        for (const s of decoderPage(await rpc('eth_call', [{ to: k, data: appelPage(depuis, pas) }, 'latest']))) skins.push({ ...s, contrat: k });
      }
    }
    /* game390: the counts are read only when there is a skin to name ; a count not read names the skin by its contract, never NON_LU */
    let comptes = [];
    if (skins.length) { try { comptes = await lireComptesSkins({ rpc, suite }); } catch (_) { comptes = []; } }
    return { etat: 'LU', total, skins: skins.map((s) => ({ ...s, ...nomPublicSkin(s.contrat, s.tokenId, comptes, suite) })), tronque, comptes };
  } catch (e) { return { etat: 'NON_LU', pourquoi: String((e && e.message) || e).slice(0, 120) }; }
}
/** Les skins d un compte (detenues, ou mises en vente par lui), et celle qu il PORTE sur un block : la derniere qu il detient pour ce block. */
export function skinsDe(skins, compte) { const c = bas(compte); return (skins || []).filter((s) => s.detenteur === c); }
export function skinPortee(skins, compte, block) {
  const b = bas(block), miennes = skinsDe(skins, compte).filter((s) => s.block === b);
  return miennes.length ? miennes[miennes.length - 1] : null;
}

/* ── LE MARCHE (Phil, 2026-10-11 : « le market des skins … enchères … des fees de l app pour chaque achat/vente ») ──
 *   Les devises que le contrat admet AUJOURD HUI a sa naissance : ETH (adresse 0) et l USDC de SON constructeur (lu dans l enregistrement
 *   de deploiement, jamais recopie). Une action tokenisee n y entre que par setCurrency, signe par l owner : pas listee ici avant. */
export const DEVISES_SKIN = Object.freeze({
  [ETH]: Object.freeze({ sym: 'ETH', dec: 18 }),
  [bas(BLOCKSKINS_ACTIF.constructeur.usdc)]: Object.freeze({ sym: 'USDC', dec: 6 }),
});
/* ── LES ACTIONS COMME DEVISE (Phil, 2026-10-11 : « enchères avec des actions tokenized Coinbase » ; son choix : « les 9 plus
 *    profondes ») ── chacune > 700 k$ cote USDC sur Aerodrome (etude wse49fh8o, bloc ~52 470 683). Elles n entrent dans le contrat
 *    QUE par setCurrency(action, true) signe par l OWNER ; adresses = celles de paires.js (ACTIONS_COINBASE), jamais recopiees. */
export const SKIN_ACTIONS_CANDIDATES = Object.freeze(['NVDAc', 'AMZNc', 'AAPLc', 'GOOGLc', 'TSLAc', 'METAc', 'MSFTc', 'MSTRc', 'SPCXc']
  .map((s) => ACTIONS_COINBASE.find((x) => x.symbole === s)).filter(Boolean).map((x) => Object.freeze({ sym: x.symbole, adr: bas(x.adr) })));
/** setCurrency(devise, oui) : SEUL l owner du contrat peut le signer (sinon NotOwner). Non signe ici. */
export function appelAdmettre(devise, oui = true) {
  return appel('setCurrency(address,bool)', [adrMot(devise), mot(oui ? 1n : 0n)], 0n, (oui ? 'Allow ' : 'Disallow ') + 'this currency on the skins market');
}
/** Les devises que le contrat admet MAINTENANT, lues sur la chaine (currencyAllowed, et decimals() pour une action). ETH et USDC (ceux du
 *  constructeur, DEVISES_SKIN) restent toujours : une lecture ratee ne les efface pas, et une action dont la lecture rate n est PAS ajoutee
 *  (on ne propose jamais une devise que le contrat refuserait). Rend { devises, admises, nonLues: [sym…] }.
 *  2026-10-23 (Phil : « les skins peuvent etre payes en actions tokenisees » ; « never offer a currency the contract does not admit ») :
 *   - `devises` = ce que l app sait AFFICHER (ETH, USDC, + les actions lues admises) — une annonce deja ouverte dans une devise depuis
 *     retiree reste achetable (le contrat : « disallowing never blocks an existing listing, bid, settlement or withdrawal ») ;
 *   - `admises` = ce que l app PROPOSE pour une NOUVELLE annonce (Sell / Start an auction) : SEULEMENT les devises dont currencyAllowed
 *     a ete LU a vrai a l instant, ETH et USDC compris (l owner peut les retirer par setCurrency) ; une lecture ratee = non proposee.
 *   Mesure 2026-10-23, bloc 52 993 407, contrat v2 0xc0d1…8e2f : 11 admises = ETH, USDC + les 9 candidates (AAPLc AMZNc GOOGLc METAc
 *   MSFTc MSTRc NVDAc SPCXc TSLAc) ; 62 autres actions de paires.js lues NON admises ; 11 evenements CurrencySet depuis le deploiement
 *   (52 470 279), tous « allowed », aucun hors de cette liste. */
export async function deviseAdmise({ rpc, devise, contrat = null }) {
  try {
    const brut = String(await rpc('eth_call', [{ to: contratDe(contrat), data: '0x' + selecteur('currencyAllowed(address)') + adrMot(devise) }, 'latest']));
    if (!/^0x[0-9a-f]{64}$/i.test(brut)) return null;
    const v = BigInt(brut);
    return v === 1n ? true : v === 0n ? false : null;
  } catch (_) { return null; }
}
export async function lireDevisesSkin({ rpc, candidats = SKIN_ACTIONS_CANDIDATES }) {
  const devises = { ...DEVISES_SKIN }, admises = {}, nonLues = [];
  for (const [adr, d] of Object.entries(DEVISES_SKIN)) {
    const oui = await deviseAdmise({ rpc, devise: adr });
    if (oui === true) admises[adr] = d; else if (oui === null) nonLues.push(d.sym);
  }
  for (const c of candidats) {
    try {
      const oui = await deviseAdmise({ rpc, devise: c.adr });
      if (oui === false) continue;
      if (oui !== true) { nonLues.push(c.sym); continue; }
      const dec = Number(BigInt(await rpc('eth_call', [{ to: c.adr, data: '0x' + selecteur('decimals()') }, 'latest'])));
      if (!Number.isInteger(dec) || dec < 0 || dec > 36) { nonLues.push(c.sym); continue; }
      devises[c.adr] = Object.freeze({ sym: c.sym, dec });
      admises[c.adr] = devises[c.adr];
    } catch (_) { nonLues.push(c.sym); }
  }
  return { devises, admises, nonLues };
}
/** Un montant TAPE (« 2 », « 0.015 ») -> unites brutes. Strict : jamais de flottant, plus de decimales que la devise = refus (pas d arrondi). */
export function montantVersBrut(texte, dec) {
  const t = String(texte == null ? '' : texte).trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) throw new Error('type an amount like 2 or 0.015');
  const [ent, frac = ''] = t.split('.');
  if (frac.length > dec) throw new Error('at most ' + dec + ' decimals');
  const brut = BigInt(ent) * 10n ** BigInt(dec) + BigInt((frac + '0'.repeat(dec)).slice(0, dec) || '0');
  if (brut <= 0n) throw new Error('the amount must be above zero');
  return brut;
}
/** CE QUE CE COMPTE PEUT FAIRE sur CETTE skin, a cet instant (secondes) - seulement ce que le contrat ACCEPTERAIT :
 *  - la sienne, pas en vente : la mettre en vente ou aux encheres ;
 *  - en vente a prix fixe : le vendeur la retire, un autre l achete ;
 *  - aux encheres, finie : n importe qui regle (le gagnant la recoit, sans offre elle revient au vendeur) ;
 *  - aux encheres, en cours : un autre encherit ; le vendeur ne la retire que s il n y a AUCUNE offre (le contrat : HasBids).
 *  Sans compte : rien (lire n est pas agir). */
export function actionsSkin(s, moi, maintenant) {
  const m = bas(moi), t = Number(maintenant);
  if (!s || !ADR.test(m) || !Number.isFinite(t)) return [];
  const mien = s.detenteur === m;
  if (!s.enVente) return mien ? ['METTRE_EN_VENTE', 'OUVRIR_ENCHERE'] : [];
  if (!s.enchere) return mien ? ['RETIRER'] : ['ACHETER'];
  if (t >= Number(s.fin)) return ['REGLER'];
  if (mien) return s.encherisseur === ETH ? ['RETIRER'] : [];
  return ['ENCHERIR'];
}
/** CE QUE LE BRAIN PROPOSE sur le marche (Phil, 2026-10-11 : « les brains font des propositions de maniere autonome » - son choix :
 *  « le brain propose, tu signes »). Pur. AU PLUS UNE proposition, dans cet ordre :
 *   1. REGLER une enchere FINIE ou ce compte est le meilleur encherisseur ou le vendeur (recevoir la skin, ou l argent, ou la reprendre) ;
 *   2. si l achat est permis (regle « buy » de S.I) : ACHETER a prix fixe la moins chere des skins de CE block, dans la devise de S.I,
 *      au plus `parTrade` et dans le budget `reste` ;
 *   3. sinon ENCHERIR au minimum (offreMinimale) sur une enchere en cours d une skin de CE block, memes bornes.
 *  Jamais sa propre annonce, jamais une skin deja proposee dans la session (`dejaProposes` : tokenId en texte). */
export function propositionSkin({ skins, moi, block, maintenant, achat, devise, parTrade, reste, dejaProposes = new Set(), dejaRegles = null }) {
  const m = bas(moi), b = bas(block), dv = bas(devise), t = Number(maintenant);
  if (!ADR.test(m) || !ADR.test(b) || !Array.isArray(skins) || !Number.isFinite(t)) return null;
  /* game399: keyed by contract AND token id (cleSkin): two skins contracts both have a token 1, one proposed must not hide the other */
  const libre = (s) => !dejaProposes.has(cleSkin(s));
  /* 2026-10-18 (revue adverse) : le REGLEMENT a son propre filtre (`dejaRegles`) — sinon une enchere sur laquelle on a mise n est jamais
   *   proposee au reglement (meme cle). Sans `dejaRegles` : le comportement d avant (un seul filtre). */
  const libreRegler = dejaRegles ? (s) => !dejaRegles.has(cleSkin(s)) : libre;
  const fin = skins.find((s) => libreRegler(s) && s.enVente && s.enchere && t >= Number(s.fin) && (s.encherisseur === m || s.detenteur === m));
  if (fin) return { genre: 'REGLER', skin: fin, montant: 0n };
  if (!achat || !ADR.test(dv)) return null;
  let p, r;
  try { p = BigInt(parTrade); r = BigInt(reste); } catch (_) { return null; }
  const dansLesBornes = (x) => x > 0n && x <= p && x <= r;
  const deCeBlock = skins.filter((s) => libre(s) && s.block === b && s.enVente && s.detenteur !== m && s.devise === dv);
  const asc = (x, y) => (x.montant < y.montant ? -1 : x.montant > y.montant ? 1 : 0);
  const fixe = deCeBlock.filter((s) => !s.enchere).map((s) => ({ genre: 'ACHETER', skin: s, montant: BigInt(s.prix) })).filter((x) => dansLesBornes(x.montant)).sort(asc)[0];
  if (fixe) return fixe;
  const enchere = deCeBlock.filter((s) => s.enchere && t < Number(s.fin) && s.encherisseur !== m)
    .map((s) => ({ genre: 'ENCHERIR', skin: s, montant: offreMinimale(s) })).filter((x) => dansLesBornes(x.montant)).sort(asc)[0];
  return enchere || null;
}
/** pending(devise, compte) : ce que le marche doit a ce compte (offre depassee, paiement qu il n a pas pu recevoir). */
export function appelCredit(devise, compte) { return '0x' + selecteur('pending(address,address)') + adrMot(devise) + adrMot(compte); }
