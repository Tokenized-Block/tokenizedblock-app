/* test-skins-relecture-bornes-20261023.mjs — LA RELECTURE AVANT SIGNATURE NE DEPASSE PLUS RIEN, ET LES DEVISES PROPOSEES SONT LUES
 * (revue adverse du 2026-10-23 sur claude/skinsmarket-20261018b ; demande de Phil : « skins can be paid in tokenized stocks »).
 *
 * DEFAUT 1 (regression) : le brain (S.I) proposait une offre DANS « Max skin bid », puis bcActionMarche relisait la skin et preparait le
 *   NOUVEAU minimum (une surenchere entre-temps) : la carte demandait plus que la borne, et le budget ne comptait que l ancien montant.
 * DEFAUT 2 (affirmation fausse) : « si l offre ou le prix a change, l app le dit et ne demande rien » — elle le disait puis demandait
 *   le nouveau montant (achat au nouveau prix ; « Bid X » du panneau au nouveau minimum).
 * DEMANDE : vendre / mettre aux encheres SEULEMENT dans une devise que le contrat ADMET (currencyAllowed lu a vrai, ETH et USDC compris),
 *   les actions tokenisees admises comprises ; acheter / encherir dans la devise de l annonce, approbation EXACTE.
 *
 * A. PUR : relectureAvantSigner (skins-marche.js), lireDevisesSkin / deviseAdmise (blockskins.js) avec un rpc simule.
 * B. LE VRAI CODE DE L APP : bcActionMarche et bcAifiProposerSkin EXTRAITS d app.html et executes avec des doublures (rpc simule, wallet
 *    qui ne signe rien : bcSigner ENREGISTRE les appels et rend « pas parti »). On lit les appels que la carte demanderait de signer.
 * C. MUTANTS sur des COPIES (dossier temporaire) : chacun doit rougir ; temoin : les copies non mutees sont vertes.
 * NE PROUVE PAS : une vraie signature (aucune), ni le rendu du formulaire Sell au navigateur (verifie a part). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const url = (env, f) => (process.env[env] ? pathToFileURL(process.env[env]).href : pathToFileURL(path.join(ICI, f)).href);
const APP = process.env.TB_APP || path.join(ICI, 'app.html');
let n = 0, ko = 0;
const vu = (c, m) => { n += 1; if (!c) { ko += 1; console.log('KO ' + m); } };

const M = await import(url('TB_SKM', 'skins-marche.js'));
const S = await import(url('TB_BSK', 'blockskins.js'));
const { selecteur } = await import(pathToFileURL(path.join(ICI, 'encodeur.js')).href);

const MOI = '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b', AUTRE = '0x' + '5'.repeat(40), TIERS = '0x' + '4'.repeat(40), BLK = '0xb200000000000000000000e4b0c5fbe9c8df579e';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', ETH = S.ETH;
const NV = S.SKIN_ACTIONS_CANDIDATES.find((c) => c.sym === 'NVDAc'), AM = S.SKIN_ACTIONS_CANDIDATES.find((c) => c.sym === 'AMZNc'), AA = S.SKIN_ACTIONS_CANDIDATES.find((c) => c.sym === 'AAPLc');
const rec = { id: 'random', angle: 159, h: [43, 218, 337], cube: 280, noyau: 75, fond: 51 };
const T = Math.floor(Date.now() / 1000);
const sk = (o) => ({ tokenId: 5n, detenteur: AUTRE, block: BLK, recette: rec, enVente: true, enchere: true, devise: USDC, prix: 1_000_000n, fin: T + 3600, encherisseur: AUTRE, offre: 1_800_000n, ...o });

/* ── A. PUR ── */
const R = (o) => M.relectureAvantSigner({ moi: MOI, t: T, ...o });
const ench = sk({}), surenchere = sk({ offre: 2_000_000n, encherisseur: TIERS });
vu(typeof M.relectureAvantSigner === 'function', 'A0 relectureAvantSigner existe');
if (typeof M.relectureAvantSigner === 'function') {
  let r = R({ genre: 'ENCHERIR', montre: ench, frais: ench, saisi: 1_890_000n, plafond: 1_890_000n, devise: USDC });
  vu(r.ok && r.montant === 1_890_000n, 'A1 brain, rien n a bouge : le montant propose et compte (1 890 000)');
  r = R({ genre: 'ENCHERIR', montre: ench, frais: surenchere, saisi: 1_890_000n, plafond: 1_890_000n, devise: USDC });
  vu(!r.ok && r.nouveau === 2_100_000n, 'A2 brain, surencheri entre-temps : REFUSE (le nouveau minimum 2 100 000 depasse ce qu il a propose) — ' + JSON.stringify(r, (k, v) => (typeof v === 'bigint' ? String(v) : v)));
  r = R({ genre: 'ENCHERIR', montre: ench, frais: surenchere, saisi: 2_100_000n, plafond: 1_890_000n, devise: USDC });
  vu(!r.ok && r.code === 'BORNE', 'A3 un montant au-dessus du plafond du brain est refuse meme s il couvre le minimum');
  r = R({ genre: 'ENCHERIR', montre: ench, frais: surenchere });
  vu(!r.ok && r.code === 'OFFRE' && r.nouveau === 2_100_000n, 'A4 sans montant tape, offre changee : DIT et rien n est demande (defaut 2)');
  r = R({ genre: 'ENCHERIR', montre: ench, frais: ench });
  vu(r.ok && r.montant === 1_890_000n, 'A5 sans montant tape, rien n a bouge : le minimum du contrat');
  r = R({ genre: 'ENCHERIR', montre: ench, frais: surenchere, saisi: 3_000_000n });
  vu(r.ok && r.montant === 3_000_000n, 'A6 un montant TAPE qui couvre le nouveau minimum reste le sien (exactement)');
  r = R({ genre: 'ENCHERIR', montre: ench, frais: surenchere, saisi: 2_000_000n });
  vu(!r.ok && r.code === 'SOUS_MIN', 'A7 un montant tape sous le nouveau minimum : refuse');
  const fixe = sk({ enchere: false, fin: 0, encherisseur: ETH, offre: 0n, prix: 5_000_000n });
  r = R({ genre: 'ACHETER', montre: fixe, frais: { ...fixe, prix: 6_000_000n } });
  vu(!r.ok && r.code === 'PRIX' && r.nouveau === 6_000_000n, 'A8 prix change : DIT et rien n est demande (defaut 2)');
  r = R({ genre: 'ACHETER', montre: fixe, frais: { ...fixe, devise: ETH } });
  vu(!r.ok && r.code === 'DEVISE', 'A9 devise de l annonce changee : rien n est demande');
  r = R({ genre: 'ACHETER', montre: fixe, frais: fixe, plafond: 5_000_000n, devise: ETH });
  vu(!r.ok && r.code === 'BORNE', 'A10 brain : une annonce dans une autre devise que celle de S.I est refusee');
  r = R({ genre: 'ACHETER', montre: fixe, frais: fixe, plafond: 5_000_000n, devise: USDC });
  vu(r.ok && r.montant === 5_000_000n, 'A11 achat inchange dans les bornes : le prix');
  vu(!R({ genre: 'ACHETER', montre: fixe, frais: null }).ok && R({ genre: 'ACHETER', montre: fixe, frais: null }).code === 'NON_LU', 'A12 relecture ratee : rien');
  vu(R({ genre: 'ACHETER', montre: fixe, frais: { ...fixe, enVente: false } }).code === 'CHANGE', 'A13 vendue / retiree entre-temps : rien');
  vu(R({ genre: 'REGLER', montre: sk({ fin: T - 1 }), frais: sk({ fin: T - 1 }), plafond: 0n }).ok, 'A14 regler n a pas de montant : le plafond 0 du brain ne le bloque pas');
}
/* les devises : SEULEMENT celles lues admises sont proposees ; un mot de 32 octets exactement */
const mot = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
const finDe = (data, adr) => data.toLowerCase().endsWith(adr.slice(2).toLowerCase().padStart(64, '0'));
const rpcDev = async (m, p) => {
  const to = p[0].to.toLowerCase(), data = p[0].data;
  if (to === S.BLOCKSKINS) {
    if (finDe(data, ETH)) return mot(1); if (finDe(data, USDC)) return mot(0); if (finDe(data, NV.adr)) return mot(1);
    if (finDe(data, AM.adr)) throw new Error('429'); if (finDe(data, AA.adr)) return '0x1'; return mot(0);
  }
  if (to === NV.adr) return mot(8);
  if (to === AA.adr) return mot(18); /* AAPLc a des decimales lisibles : seule sa reponse currencyAllowed illisible doit l ecarter */
  throw new Error('unexpected ' + to);
};
if (typeof S.deviseAdmise === 'function') {
  vu((await S.deviseAdmise({ rpc: rpcDev, devise: ETH })) === true && (await S.deviseAdmise({ rpc: rpcDev, devise: USDC })) === false && (await S.deviseAdmise({ rpc: rpcDev, devise: AM.adr })) === null,
    'A15 deviseAdmise : vrai / faux / non lu');
  vu((await S.deviseAdmise({ rpc: rpcDev, devise: AA.adr })) === null, 'A16 deviseAdmise : une reponse qui n est pas un mot de 32 octets (« 0x1 ») est NON LUE, pas « admise »');
} else vu(false, 'A15 deviseAdmise existe');
const dv = await S.lireDevisesSkin({ rpc: rpcDev, candidats: [NV, AM, AA] });
const cles = (o) => Object.keys(o || {}).sort().join(',');
vu(cles(dv.admises) === [ETH, NV.adr].sort().join(','), 'A17 admises = ETH + NVDAc (USDC retire par l owner, AMZNc non lu, AAPLc reponse illisible) : ' + cles(dv.admises));
vu(dv.admises && dv.admises[NV.adr] && dv.admises[NV.adr].dec === 8 && dv.admises[NV.adr].sym === 'NVDAc', 'A18 l action admise porte ses decimales LUES');
vu(dv.devises[USDC] && dv.devises[ETH] && dv.devises[NV.adr], 'A19 devises (affichage) : USDC reste lisible (une annonce deja ouverte reste achetable)');
vu(JSON.stringify(dv.nonLues) === '["AMZNc","AAPLc"]', 'A20 non lues dites : ' + JSON.stringify(dv.nonLues));

/* ── B. LE VRAI CODE DE L APP ── */
const html = fs.readFileSync(APP, 'utf8').replace(/\r\n/g, '\n');
/* portable : la fin de fonction cherchee par regex (CRLF comme LF), pas par une ancre de position litterale */
const fonction = (sig) => { const i = html.indexOf(sig); if (i < 0) return ''; const k = html.slice(i).search(/\r?\n\}\r?\n/); return k > 0 ? html.slice(i, i + k + 2) : ''; };
const srcAction = fonction('async function bcActionMarche('), srcAifi = fonction('async function bcAifiProposerSkin(');
vu(srcAction.length > 2000 && srcAifi.length > 300, 'B0 bcActionMarche et bcAifiProposerSkin extraits');
const motA = (a) => String(a).toLowerCase().slice(2).padStart(64, '0');
const page = (v) => '0x' + [32n, 1n].map((x) => BigInt(x).toString(16).padStart(64, '0')).join('') + [
  BigInt(v.tokenId), v.detenteur, v.block, S.packRecette(v.recette), v.enVente ? 1n : 0n, v.enchere ? 1n : 0n, v.devise, BigInt(v.prix), BigInt(v.fin), v.encherisseur, BigInt(v.offre),
].map((x) => (typeof x === 'string' ? motA(x) : x.toString(16).padStart(64, '0'))).join('');
vu(String(S.decoderPage(page(ench))[0].offre) === '1800000', 'B1 la page simulee se decode comme celle du contrat');
const NOMS = ['bcOuvrirPop', 'bcMessage', 'bcVue', 'CHAINE', 'bcEtape', 'bcAvecWallet', 'rpc', 'decoderPage', 'appelPage', 'BLOCKSKINS', 'relectureAvantSigner', 'compte',
  'bcMontantSkin', 'bcBoutons', 'peindreSkinsMarche', 'deviseAdmise', 'bcLireDevisesSkin', 'bcDevisesSkin', 'court', 'ETH_SKIN', 'bcSolde', 'appelApprouver', 'appelAcheter',
  'appelEncherir', 'appelRegler', 'appelRetirer', 'appelMettreEnVente', 'appelOuvrirEnchere', 'appelRetirerCredit', 'partage', 'bcSigner', 'bcDureeSkin', 'montantOffre', 'actionsSkin',
  'SKM_STATUTS', 'statutSkin', 'offreMinimale', 'bc', 'RESEAUX', 'mesSkins', 'lireMesSkins', 'poserMesSkins', 'bcPeindreSkinEtat', 'bcPeindreMarche', 'bcEl',
  'bcAifiSkins', 'lireSkins', 'propositionSkin', 'BC_AIFI_ETH', 'bcAifiSauver', 'bcAifiPeindre'];
/** Un monde : la chaine (skin relue, solde, autorisation, devises admises) et un wallet qui n envoie RIEN. */
function monde({ frais, solde = 10n ** 30n, autorise = 0n, admises = [ETH, USDC, NV.adr], vitrine = null, aifi = null }) {
  const j = { etapes: [], boutons: [], signes: [] };
  const rpc = async (m, p) => {
    const to = String(p[0].to).toLowerCase(), data = String(p[0].data);
    if (to === S.BLOCKSKINS && data.startsWith('0x' + selecteur('skinsPage(uint256,uint256)'))) return page(frais);
    if (to === S.BLOCKSKINS && data.startsWith('0x' + selecteur('currencyAllowed(address)'))) return mot(admises.some((a) => finDe(data, a)) ? 1 : 0);
    if (data.startsWith('0xdd62ed3e')) return mot(autorise);
    throw new Error('rpc inattendu ' + to + ' ' + data.slice(0, 10));
  };
  const env = {
    bcOuvrirPop() {}, bcMessage: () => ({ append() {} }), bcVue() {}, CHAINE: 8453, bcEtape: (m, t, k) => j.etapes.push([t, k || '']), bcAvecWallet: async () => true, rpc,
    decoderPage: S.decoderPage, appelPage: S.appelPage, BLOCKSKINS: S.BLOCKSKINS, relectureAvantSigner: M.relectureAvantSigner, compte: MOI,
    bcMontantSkin: (b, d) => String(b) + ' ' + (String(d).toLowerCase() === USDC ? 'USDC' : String(d).toLowerCase() === NV.adr ? 'NVDAc' : 'ETH'), bcBoutons: (m, l) => j.boutons.push(l),
    peindreSkinsMarche: async () => {}, deviseAdmise: S.deviseAdmise, bcLireDevisesSkin: async () => {}, bcDevisesSkin: () => ({ [ETH]: { sym: 'ETH', dec: 18 }, [USDC]: { sym: 'USDC', dec: 6 }, [NV.adr]: { sym: 'NVDAc', dec: 8 } }),
    court: (a) => String(a).slice(0, 6), ETH_SKIN: ETH, bcSolde: async () => solde, appelApprouver: S.appelApprouver, appelAcheter: S.appelAcheter, appelEncherir: S.appelEncherir,
    appelRegler: S.appelRegler, appelRetirer: S.appelRetirer, appelMettreEnVente: S.appelMettreEnVente, appelOuvrirEnchere: S.appelOuvrirEnchere, appelRetirerCredit: S.appelRetirerCredit,
    partage: S.partage, bcSigner: async (m, appels) => { j.signes.push(appels); return { ok: false, diffusee: false }; }, bcDureeSkin: (x) => String(x), montantOffre: M.montantOffre,
    actionsSkin: S.actionsSkin, SKM_STATUTS: M.SKM_STATUTS, statutSkin: M.statutSkin, offreMinimale: S.offreMinimale, bc: { aifi }, RESEAUX: { 8453: { explorateur: 'x' } },
    mesSkins: {}, lireMesSkins: async () => {}, poserMesSkins() {}, bcPeindreSkinEtat() {}, bcPeindreMarche: async () => {}, bcEl: () => ({}),
    bcAifiSkins: { derniere: 0, proposes: new Set(), enVol: false }, lireSkins: async () => ({ etat: 'LU', total: 1, skins: [vitrine || frais] }), propositionSkin: S.propositionSkin,
    BC_AIFI_ETH: () => ({ adr: ETH, sym: 'ETH', dec: 18 }), bcAifiSauver() {}, bcAifiPeindre() {},
  };
  // eslint-disable-next-line no-new-func
  const f = new Function(...NOMS, srcAction + '\n' + srcAifi + '\nreturn { bcActionMarche, bcAifiProposerSkin };')(...NOMS.map((k) => env[k]));
  /** les appels que « Sign N steps » demanderait : on appuie sur le bouton, le wallet doublure enregistre et n envoie rien */
  const signer = async () => {
    const b = j.boutons.flat().find((x) => Array.isArray(x) && /^Sign \d+ step/.test(String(x[0])));
    if (!b) return null;
    await b[1]();
    return j.signes[j.signes.length - 1] || null;
  };
  return { j, f, signer, env };
}
const montantDe = (appel) => BigInt('0x' + appel.data.slice(-64));
const libelles = (j) => j.boutons.flat().filter(Array.isArray).map((x) => String(x[0]));

/* B2 LE DEFAUT 1, PAR LE VRAI CHEMIN : S.I lit une enchere a 1,8 USDC, propose 1,89 (borne 2 USDC) ; quelqu un surencherit a 2,0 */
{
  const aifi = { block: BLK, skins: true, parTrade: '2000000', budget: '5000000', propose: '0', devise: { adr: USDC, sym: 'USDC', dec: 6 } };
  const w = monde({ frais: surenchere, vitrine: ench, aifi });
  await w.f.bcAifiProposerSkin();
  await new Promise((r) => setTimeout(r, 30));
  const appels = await w.signer();
  vu(w.env.bc.aifi.propose === '1890000', 'B2a le brain a propose et COMPTE 1 890 000 (sous sa borne 2 000 000) : ' + w.env.bc.aifi.propose);
  vu(appels === null, 'B2b surencheri entre-temps : AUCUNE carte a signer (avant : un bid de 2 100 000 > « Max skin bid » 2 000 000) — ' + (appels ? appels.map((a) => a.nom + ' ' + montantDe(a)).join(' / ') : 'rien'));
  vu(w.j.etapes.some(([t, k]) => k === 'non' && /Nothing was asked/.test(t)), 'B2c c est DIT : rien n est demande');
  vu(!libelles(w.j).some((l) => /^Bid |^Buy for /.test(l)), 'B2d le brain ne se voit pas offrir « relancer au nouveau montant »');
}
/* B3 brain, rien n a bouge : le montant propose, exactement, approbation EXACTE */
{
  const aifi = { block: BLK, skins: true, parTrade: '2000000', budget: '5000000', propose: '0', devise: { adr: USDC, sym: 'USDC', dec: 6 } };
  const w = monde({ frais: ench, aifi });
  await w.f.bcAifiProposerSkin();
  await new Promise((r) => setTimeout(r, 30));
  const appels = await w.signer();
  vu(appels && appels.length === 2 && appels[0].to === USDC && montantDe(appels[0]) === 1_890_000n && montantDe(appels[1]) === 1_890_000n && appels[1].to === S.BLOCKSKINS,
    'B3 brain, offre inchangee : approve EXACT 1 890 000 USDC puis bid 1 890 000 — ' + (appels ? appels.map((a) => a.to.slice(0, 8) + ' ' + montantDe(a)).join(' / ') : 'rien'));
}
/* B4 brain, achat a prix fixe dont le prix monte : rien, et pas de relance */
{
  const fixe = sk({ enchere: false, fin: 0, encherisseur: ETH, offre: 0n, prix: 1_500_000n });
  const aifi = { block: BLK, skins: true, parTrade: '2000000', budget: '5000000', propose: '0', devise: { adr: USDC, sym: 'USDC', dec: 6 } };
  const w = monde({ frais: { ...fixe, prix: 1_900_000n }, vitrine: fixe, aifi });
  await w.f.bcAifiProposerSkin();
  await new Promise((r) => setTimeout(r, 30));
  vu((await w.signer()) === null && !libelles(w.j).some((l) => /^Buy for /.test(l)), 'B4 brain, prix monte entre-temps : rien a signer, pas de « Buy for » au nouveau prix');
}
/* B5 LE DEFAUT 2 : le « Bid X » du panneau (aucun montant) sur une offre qui a change -> rien a signer ; relance au nouveau montant, ecrit */
{
  const w = monde({ frais: surenchere });
  await w.f.bcActionMarche('ENCHERIR', ench, {});
  vu((await w.signer()) === null, 'B5a panneau « Bid » sans montant, offre changee : rien a signer (avant : le nouveau minimum demande en silence)');
  vu(libelles(w.j).includes('Bid 2100000 USDC'), 'B5b la personne peut relancer AU nouveau montant, ecrit sur le bouton : ' + libelles(w.j).join(' | '));
}
/* B6 achat dont le prix a change : rien */
{
  const fixe = sk({ enchere: false, fin: 0, encherisseur: ETH, offre: 0n, prix: 5_000_000n });
  const w = monde({ frais: { ...fixe, prix: 6_000_000n } });
  await w.f.bcActionMarche('ACHETER', fixe, {});
  vu((await w.signer()) === null && libelles(w.j).includes('Buy for 6000000 USDC'), 'B6 prix change : rien a signer ; « Buy for » le nouveau prix propose a la personne');
}
/* B7 offre TAPEE au-dessus du nouveau minimum : exactement le montant tape */
{
  const w = monde({ frais: surenchere, autorise: 3_000_000n });
  await w.f.bcActionMarche('ENCHERIR', ench, { montant: 3_000_000n });
  const appels = await w.signer();
  vu(appels && appels.length === 1 && montantDe(appels[0]) === 3_000_000n, 'B7 offre tapee 3 USDC couvrant le nouveau minimum : 1 etape (autorisation deja suffisante), exactement 3 000 000');
}
/* B8 UNE ACTION TOKENISEE comme devise : encherir sur une annonce en NVDAc = approve EXACT sur NVDAc */
{
  const enNv = sk({ devise: NV.adr, prix: 100_000_000n, offre: 0n, encherisseur: ETH });
  const w = monde({ frais: enNv });
  await w.f.bcActionMarche('ENCHERIR', enNv, {});
  const appels = await w.signer();
  vu(appels && appels.length === 2 && appels[0].to === NV.adr && appels[0].data.startsWith('0x095ea7b3') && appels[0].data.slice(10, 74) === motA(S.BLOCKSKINS) && montantDe(appels[0]) === 100_000_000n
    && montantDe(appels[1]) === 100_000_000n && appels[1].value === '0x0', 'B8 offre en NVDAc : approve(BlockSkins, 1 NVDAc) EXACT sur le jeton NVDAc, puis bid sans ETH');
}
/* B9 VENDRE en NVDAc : relu admis -> list(…, NVDAc, …) ; NON admis a l instant -> rien */
{
  const mienne = sk({ detenteur: MOI, enVente: false, enchere: false, fin: 0, encherisseur: ETH, offre: 0n, prix: 0n });
  const ok = monde({ frais: mienne });
  await ok.f.bcActionMarche('VENDRE', mienne, { devise: NV.adr, brut: 250_000_000n, duree: 86400n });
  const a = await ok.signer();
  vu(a && a.length === 1 && a[0].data.startsWith('0x' + selecteur('list(uint256,address,uint256)')) && a[0].data.includes(motA(NV.adr)) && montantDe(a[0]) === 250_000_000n,
    'B9a mise en vente en NVDAc (admise, relue) : list(5, NVDAc, 2.5 NVDAc)');
  const non = monde({ frais: mienne, admises: [ETH, USDC] });
  await non.f.bcActionMarche('ENCHERE', mienne, { devise: NV.adr, brut: 250_000_000n, duree: 86400n });
  vu((await non.signer()) === null && non.j.etapes.some(([t, k]) => k === 'non' && /does not accept NVDAc/.test(t)), 'B9b enchere en NVDAc que le contrat N admet PAS (relu) : rien a signer, dit');
}
/* B11 ce que le brain passe a la carte : son montant ET son plafond (ce qu il a compte), dans SA devise */
{
  const vus = [];
  const NOMS2 = NOMS.filter((k) => k !== 'bcActionMarche');
  const aifiSeul = (vitrine, aifi) => {
    const w = monde({ frais: vitrine, aifi });
    // eslint-disable-next-line no-new-func
    return new Function(...NOMS2, 'bcActionMarche', srcAifi + '\nreturn bcAifiProposerSkin;')(...NOMS2.map((k) => w.env[k]), async (g, s, x, q) => { vus.push({ g, x, q }); });
  };
  const aifi = () => ({ block: BLK, skins: true, parTrade: '2000000', budget: '5000000', propose: '0', devise: { adr: USDC, sym: 'USDC', dec: 6 } });
  await aifiSeul(ench, aifi())();
  const fixe = sk({ tokenId: 6n, enchere: false, fin: 0, encherisseur: ETH, offre: 0n, prix: 1_500_000n });
  await aifiSeul(fixe, aifi())();
  const [b, a] = vus;
  vu(b && b.g === 'ENCHERIR' && b.x.montant === 1_890_000n && b.x.plafond === 1_890_000n && b.x.bornerDevise === USDC, 'B11a offre du brain : montant 1 890 000, plafond 1 890 000, devise USDC');
  vu(a && a.g === 'ACHETER' && a.x.montant == null && a.x.plafond === 1_500_000n && a.x.bornerDevise === USDC, 'B11b achat du brain : plafond = le prix compte, devise USDC');
}
/* B12 bcActionMarche respecte un plafond SEUL (sans montant) : rien au-dessus */
{
  const w = monde({ frais: ench });
  await w.f.bcActionMarche('ENCHERIR', ench, { plafond: 1_000_000n }, 'Its brain · S.I');
  vu((await w.signer()) === null && w.j.etapes.some(([t, k]) => k === 'non' && /more than your brain was allowed/.test(t)), 'B12 plafond 1 USDC, minimum 1,89 : rien a signer, dit');
}
/* B10 le formulaire Sell : SEULEMENT les devises lues admises ; rien de lu = rien de propose */
const form = fonction('function bcFormVendreSkin(');
vu(/const offertes = bcDevisesOffertes\(\);/.test(form) && /Object\.entries\(offertes\)/.test(form) && !/bcDevisesSkin\(\)/.test(form), 'B10a Sell / Start an auction : les options viennent de bcDevisesOffertes (lues admises), jamais de la liste d affichage');
vu(/const bcDevisesOffertes = \(\) => bc\.devisesSkinAdmises \|\| \{\};/.test(html), 'B10b rien de lu = aucune devise proposee (jamais ETH/USDC par defaut)');
vu(/bc\.devisesSkinAdmises = d\.admises;/.test(fonction('async function bcLireDevisesSkin(')), 'B10c les devises admises viennent de lireDevisesSkin (currencyAllowed lu)');
vu(/\(stock\)/.test(form), 'B10d une action tokenisee est dite « (stock) » dans le choix de devise');

/* ── C. MUTANTS (sur des COPIES) ── */
if (!process.env.TB_RB_SANS_MUTANTS) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skrb-mut-'));
  const abs = (f) => pathToFileURL(path.join(ICI, f)).href;
  const srcSkm = fs.readFileSync(path.join(ICI, 'skins-marche.js'), 'utf8').replace(/\r\n/g, '\n').replace("from './blockskins.js'", "from '" + abs('blockskins.js') + "'")
    .replace("from './frais-creation.js'", "from '" + abs('frais-creation.js') + "'"); /* 2026-10-26 (game57 item 10): the fee-address mask */
  const srcBsk = fs.readFileSync(path.join(ICI, 'blockskins.js'), 'utf8').replace(/\r\n/g, '\n').replace(/from '\.\/([a-z-]+\.js)'/g, (_, f) => "from '" + abs(f) + "'");
  const srcApp = html;
  const MUTANTS = [
    ['app', 'le brain ne passe plus son plafond', 'plafond: p.montant,', 'plafond: null,'],
    ['app', 'bcActionMarche ignore le plafond', 'plafond: x && x.plafond != null ? x.plafond : null', 'plafond: null'],
    ['app', 'le brain ne passe plus son montant', "montant: p.genre === 'ENCHERIR' ? p.montant : null,", 'montant: null,'],
    ['app', 'relance offerte au brain', "&& qui === 'Skins') bcBoutons(m, [[(genre === 'ACHETER'", ") bcBoutons(m, [[(genre === 'ACHETER'"],
    ['app', 'devise d une annonce neuve non relue', '(await deviseAdmise({ rpc, devise: x.devise, contrat: K })) !== true', 'false'],
    ['app', 'Sell propose la liste d affichage', 'const offertes = bcDevisesOffertes();', 'const offertes = bcDevisesSkin();'],
    ['app', 'rien de lu = ETH/USDC proposes', 'bc.devisesSkinAdmises || {}', 'bc.devisesSkinAdmises || DEVISES_SKIN'],
    ['app', 'approbation pas exacte', "appels.push(appelApprouver(s.devise, montant, 'Allow", "appels.push(appelApprouver(s.devise, montant * 2n, 'Allow"],
    ['skm', 'offre changee : dite puis demandee', "if (BigInt(frais.offre || 0) !== BigInt(montre.offre || 0)) return { ok: false, code: 'OFFRE', nouveau: min, raison: 'The highest bid changed since it was shown. Nothing was asked.' };", ''],
    ['skm', 'prix change : dit puis demande', "if (BigInt(frais.prix) !== BigInt(montre.prix)) return { ok: false, code: 'PRIX', nouveau: BigInt(frais.prix), raison: 'The price changed since it was shown. Nothing was asked.' };", ''],
    ['skm', 'plafond non verifie', 'if (plafond != null && montant > BigInt(plafond))', 'if (false)'],
    ['skm', 'montant tape sous le minimum accepte', 'if (montant < min) return', 'if (false) return'],
    ['skm', 'devise du brain non verifiee', 'if (devise != null && bas(frais.devise) !== bas(devise))', 'if (false)'],
    ['skm', 'devise de l annonce non verifiee', 'if (bas(frais.devise) !== bas(montre.devise))', 'if (false)'],
    ['bsk', 'ETH/USDC admis sans lecture', 'if (oui === true) admises[adr] = d; else if (oui === null) nonLues.push(d.sym);', 'admises[adr] = d;'],
    ['bsk', 'decodage laxiste de currencyAllowed', "if (!/^0x[0-9a-f]{64}$/i.test(brut)) return null;", ''],
    ['bsk', 'action non lue proposee', "if (oui !== true) { nonLues.push(c.sym); continue; }", ''],
  ];
  const lancer = (env) => spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, TB_RB_SANS_MUTANTS: '1', ...env }, encoding: 'utf8' });
  const fSkm = path.join(tmp, 'skins-marche.js'), fBsk = path.join(tmp, 'blockskins.js'), fApp = path.join(tmp, 'app.html');
  const poser = (cible, de, vers) => {
    fs.writeFileSync(fSkm, cible === 'skm' ? srcSkm.replace(de, vers) : srcSkm);
    fs.writeFileSync(fBsk, cible === 'bsk' ? srcBsk.replace(de, vers) : srcBsk);
    fs.writeFileSync(fApp, cible === 'app' ? srcApp.replace(de, vers) : srcApp);
  };
  for (const [cible, nom, de, vers] of MUTANTS) {
    const src = { skm: srcSkm, bsk: srcBsk, app: srcApp }[cible];
    if (src.split(de).length !== 2) { vu(false, 'C mutant « ' + nom + ' » : motif introuvable ou multiple'); continue; }
    poser(cible, de, vers);
    const r = lancer({ TB_SKM: fSkm, TB_BSK: fBsk, TB_APP: fApp });
    const rouges = (r.stdout.match(/^KO /gm) || []).length;
    vu(r.status !== 0 && (rouges > 0 || /Error/.test(r.stderr)), 'C mutant « ' + nom + ' » : doit ROUGIR (' + rouges + ' KO)');
    console.log((r.status !== 0 ? 'ok ' : 'KO ') + ' C mutant « ' + nom + ' » : ' + (rouges ? rouges + ' KO' : 'plante'));
  }
  poser('', '', '');
  const t = lancer({ TB_SKM: fSkm, TB_BSK: fBsk, TB_APP: fApp });
  vu(t.status === 0, 'C temoin : les copies NON mutees sont vertes (' + (t.stdout.match(/^KO .*/gm) || []).slice(0, 3).join(' | ') + (t.stderr || '').slice(0, 200) + ')');
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(n + ' assertions, ' + ko + ' KO' + (process.env.TB_RB_SANS_MUTANTS ? ' (sans mutants)' : '') + ' ; NE PROUVE PAS une vraie signature ni le rendu du formulaire');
process.exit(ko ? 1 : 0);
