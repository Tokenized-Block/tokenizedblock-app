/* tam-plan.js — LE PLAN DU MINT TAM (phase C, 2026-10-31). Pur : aucun reseau, rien n est signe ni envoye ici.
 *   Deux appels, que le WALLET DU JOUEUR signe (en lot quand le wallet l offre) :
 *     1. approve(USDC -> TamArt, EXACTEMENT 5 USDC) — jamais illimite ;
 *     2. TamArt.mint(data, graine, params) — le contrat tire PRICE (5 USDC) du joueur vers `beneficiaire`, en UN transferFrom.
 *   ⛔ La destination des 5 USDC n est pas dans ce calldata : elle est dans le CONTRAT. Le plan refuse donc tant que le contrat LU sur la
 *     chaine (PRICE(), beneficiaire(), USDC()) ne dit pas 5 000 000 / FEE_WALLET / USDC — et la fiche du depot (tamart-deploiement.js) aussi.
 *   ⛔ C est le premier appel « approve(USDC -> contrat, montant exact) » que misables.js#besoinDuJeu lit : Pay with (USDC, actions, UNIT)
 *     construit son swap exact-output pour CE montant, puis pose ces deux appels tels quels (planJeuUsdc, genre 'tam'). */
import { keccak256Hex, selecteur } from './keccak.js';
import { FEE_WALLET, USDC_BASE, displayShort } from './frais-creation.js';
import { calldataApprove } from './calldata-aerodrome.js';

export const PRIX_TAM = 5000000n; /* 5 USDC, 6 decimales — la constante PRICE de TamArt.sol */
export const MAX_DONNEES = 16384, MAX_PARAMS = 4096; /* MAX_DATA / MAX_PARAMS de TamArt.sol */
export const SIG_TAM = Object.freeze({
  mint: 'mint(bytes,bytes32,bytes)', donnees: 'donnees(uint256)', params: 'params(uint256)', graine: 'graine(uint256)',
  empreinte: 'empreinte(uint256)', tokenURI: 'tokenURI(uint256)', totalSupply: 'totalSupply()', PRICE: 'PRICE()',
  beneficiaire: 'beneficiaire()', USDC: 'USDC()', minted: 'Minted(uint256,address,bytes32,bytes32)',
});
const ADR = /^0x[0-9a-fA-F]{40}$/;
const bas = (x) => String(x || '').toLowerCase();
const USDC = bas(USDC_BASE), FEE = bas(FEE_WALLET);
const refuse = (code, pourquoi) => ({ etat: 'REFUSE', code, pourquoi, appels: [] });
const hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
const mot = (n) => BigInt(n).toString(16).padStart(64, '0');
const rembourre = (h) => h + '0'.repeat((64 - (h.length % 64)) % 64);

/** l adresse de TamArt SI elle est deployee (adresse ET bloc ecrits par le script de deploiement), sinon null — une seule regle, partout */
export function adresseTam(dep) {
  const a = dep && dep.adresse;
  return ADR.test(String(a || '')) && !/^0x0{40}$/i.test(String(a)) && Number.isSafeInteger(dep.bloc) && dep.bloc > 0 ? bas(a) : null;
}

/** octets d une chaine hex (0x...) ou d un Uint8Array ; null si invalide */
export function octetsDe(x) {
  if (x instanceof Uint8Array) return x;
  const s = String(x || '').replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]*$/.test(s) || s.length % 2) return null;
  const o = new Uint8Array(s.length / 2);
  for (let i = 0; i < o.length; i++) o[i] = parseInt(s.slice(2 * i, 2 * i + 2), 16);
  return o;
}

/** calldata de TamArt.mint(bytes data, bytes32 graine, bytes params) — ABI standard (deux bytes dynamiques) */
export function calldataMint({ octets, graine, paramsJson }) {
  const d = hex(octets), p = hex(new TextEncoder().encode(paramsJson));
  const g = String(graine).replace(/^0x/i, '').toLowerCase();
  const offD = 96, offP = offD + 32 + rembourre(d).length / 2;
  return selecteur(SIG_TAM.mint) + mot(offD) + g + mot(offP) + mot(d.length / 2) + rembourre(d) + mot(p.length / 2) + rembourre(p);
}

/**
 * LE PLAN DU MINT. Rend { etat, code, pourquoi, appels, resume }.
 * @param {object} j.deploiement  la fiche TAMART_DEPLOIEMENT (adresse, bloc, prix, constructeur)
 * @param {object} j.lu           ce que le CONTRAT dit, lu par eth_call : { prix, beneficiaire, usdc } — rien n est suppose
 * @param {Uint8Array|string} j.octets  l oeuvre encodee (encoderOeuvre)
 * @param {string} j.graine       bytes32 hex
 * @param {string} j.paramsJson   JSON.stringify(params) — ce que rejouer(JSON.parse(...)) rejoue
 */
export function planMintTam({ deploiement, lu, octets, graine, paramsJson } = {}) {
  const contrat = adresseTam(deploiement);
  if (!contrat) return refuse('PAS_DEPLOYE', 'TAM minting is coming soon: there is nothing to mint on yet');
  if (BigInt(deploiement.prix ?? -1) !== PRIX_TAM) return refuse('PRIX', 'the deployment sheet does not say 5 USDC');
  if (bas(deploiement.constructeur && deploiement.constructeur.beneficiaire) !== FEE) return refuse('BENEFICIAIRE', 'the deployment sheet does not pay the TokenizedBlock fee wallet');
  if (!lu) return refuse('NON_LU', 'the contract was not read: nothing is built on an unread contract');
  let prixLu; try { prixLu = BigInt(lu.prix); } catch (_) { prixLu = null; }
  if (prixLu !== PRIX_TAM) return refuse('PRIX', 'the contract price read on chain is not 5 USDC');
  if (bas(lu.beneficiaire) !== FEE) return refuse('BENEFICIAIRE', 'the contract read on chain does not pay the TokenizedBlock fee wallet');
  if (bas(lu.usdc) !== USDC) return refuse('USDC', 'the contract read on chain does not take USDC on Base');
  const o = octetsDe(octets);
  if (!o || o.length < 7 || o.length > MAX_DONNEES || o[0] !== 0x54 || o[1] !== 0x41 || o[2] !== 0x4d || o[3] !== 1) return refuse('DONNEES', 'the work bytes are not a TAM work');
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(graine || ''))) return refuse('GRAINE', 'the seed must be 32 bytes');
  if (typeof paramsJson !== 'string') return refuse('PARAMS', 'the params are missing');
  const nParams = new TextEncoder().encode(paramsJson).length;
  if (nParams > MAX_PARAMS) return refuse('PARAMS', 'the params are longer than the contract accepts');
  const ap = calldataApprove({ token: USDC, montant: PRIX_TAM, beneficiaire: contrat });
  if (ap.etat !== 'PRET') return refuse('APPROBATION', ap.pourquoi);
  const empreinte = keccak256Hex(o);
  const appels = [
    { to: USDC, data: ap.data, value: '0x0', quoi: 'approve exactly 5 USDC for TamArt (' + displayShort(contrat) + ')' },
    { to: contrat, data: calldataMint({ octets: o, graine, paramsJson }), value: '0x0', quoi: 'mint this work: ' + o.length + ' bytes, keccak ' + empreinte.slice(0, 10) + '…; TamArt sends the 5 USDC to the fee wallet' },
  ];
  return { etat: 'PRET', code: 'PRET', pourquoi: null, appels, exigeAtomique: false, atomiquePrefere: true,
    resume: { contrat, prixUsdc: PRIX_TAM, vers: FEE, usdc: USDC, octets: o.length, octetsParams: nParams, empreinte, graine: bas(graine) } };
}

/* ── lectures (eth_call) : calldata et decodage, purs ── */
export const appelLecture = (contrat, sig, id = null) => ({ to: bas(contrat), data: selecteur(sig) + (id === null ? '' : mot(id)) });
/** decode un retour ABI `bytes` (ou `string`) */
export function decoderBytes(retour) {
  const h = String(retour || '').replace(/^0x/i, '');
  if (h.length < 128) return null;
  const off = Number(BigInt('0x' + h.slice(0, 64))) * 2, n = Number(BigInt('0x' + h.slice(off, off + 64)));
  const corps = h.slice(off + 64, off + 64 + n * 2);
  return corps.length === n * 2 ? octetsDe(corps) : null;
}
export const decoderMot = (retour) => { const h = String(retour || '').replace(/^0x/i, ''); return h.length >= 64 ? '0x' + h.slice(0, 64).toLowerCase() : null; };
export const decoderAdresse = (retour) => { const m = decoderMot(retour); return m ? '0x' + m.slice(26) : null; };

/**
 * 2026-11-12 (the economy pack is live): THE MINT ON TAM ART, PAID THROUGH THE TBLOCK PAYMENT ROUTER. Pure. Two calls the player's wallet
 *   signs: approve(USDC -> router, EXACTLY the price read on TAM art), then router.pay(TAM art, price, minOut, deadline, abi.encode(work,
 *   seed, params)). The router keeps the game's own dev cut in USDC, buys TBLOCK with the rest (refusing less than minOut), sends it to TAM
 *   art, which mints the work to the payer and forwards ALL the TBLOCK to the holders vault. Nothing is built on an unread contract: the
 *   price, the split and the router are what TAM art said on chain (`lu`), and minOut comes from a fresh quote (economie-pack.js).
 * @param {object} j.pack  economie-pack.js (the addresses, the encoders)
 * @param {object} j.lu    { prix, devBps, routeur } read from TAM art: PRICE_USDC(), USDC_SPLIT(), ROUTER()
 */
export function planMintTamRouteur({ pack, lu, octets, graine, paramsJson, minOut, deadline } = {}) {
  if (!pack || !pack.TAM || !pack.ROUTER) return refuse('PAS_DEPLOYE', 'TAM art is not on this network');
  if (!lu) return refuse('NON_LU', 'the contract was not read: nothing is built on an unread contract');
  let prix, devBps; try { prix = BigInt(lu.prix); devBps = BigInt(lu.devBps); } catch (_) { return refuse('NON_LU', 'the price or the split was not read'); }
  if (prix !== PRIX_TAM) return refuse('PRIX', 'the TAM art price read on chain is not 5 USDC');
  if (devBps < 0n || devBps > 1000n) return refuse('PART', 'the dev part read on chain is out of the router bounds');
  if (bas(lu.routeur) !== bas(pack.ROUTER)) return refuse('ROUTEUR', 'TAM art read on chain is not paid by the TBLOCK payment router');
  const o = octetsDe(octets);
  if (!o || o.length < 7 || o.length > MAX_DONNEES || o[0] !== 0x54 || o[1] !== 0x41 || o[2] !== 0x4d || o[3] !== 1) return refuse('DONNEES', 'the work bytes are not a TAM work');
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(graine || ''))) return refuse('GRAINE', 'the seed must be 32 bytes');
  if (typeof paramsJson !== 'string') return refuse('PARAMS', 'the params are missing');
  const nParams = new TextEncoder().encode(paramsJson).length;
  if (nParams > MAX_PARAMS) return refuse('PARAMS', 'the params are longer than the contract accepts');
  let m; try { m = BigInt(minOut); } catch (_) { m = 0n; }
  if (m <= 0n) return refuse('MINIMUM', 'no minimum TBLOCK out: nothing is built without a fresh quote');
  const dl = Number(deadline);
  if (!Number.isSafeInteger(dl) || dl <= 0) return refuse('DELAI', 'no deadline');
  const empreinte = keccak256Hex(o);
  const [ap, pay] = pack.payBatch({ game: pack.TAM, usdcIn: prix, minOut: m, deadline: dl, data: pack.dataTam({ octets: o, graine, paramsJson }) });
  const dev = prix * devBps / 10000n, achat = prix - dev;
  const u = (x) => pack.usdcTexte(x);
  const appels = [
    { to: ap.to, data: ap.data, value: '0x0', quoi: 'approve exactly ' + u(prix) + ' USDC for the TBLOCK payment router' },
    { to: pay.to, data: pay.data, value: '0x0', quoi: 'pay ' + u(prix) + ' USDC through the router: ' + u(dev) + ' USDC to the dev wallet, ' + u(achat) + ' USDC buys at least ' + pack.fmt(m) + ' TBLOCK for the holders vault, and this work (' + o.length + ' bytes, keccak ' + empreinte.slice(0, 10) + '…) is minted to you' },
  ];
  return { etat: 'PRET', code: 'PRET', pourquoi: null, appels, exigeAtomique: false, atomiquePrefere: true,
    resume: { contrat: bas(pack.TAM), routeur: bas(pack.ROUTER), prixUsdc: prix, devUsdc: dev, achatUsdc: achat, minTblock: m, usdc: bas(pack.USDC), octets: o.length, octetsParams: nParams, empreinte, graine: bas(graine) } };
}
