// test-tam-onglet-20261031.mjs — TAM PHASE C : l onglet (logique pure), le plan du mint, le serveur, la liste servie.
// serie-delai-s: 900 — MESURE 2026-11-05 : 231 s SEUL (149 systemes, 12 mutants), DELAI 300 s sous la charge d une serie a 3 : outils/serie.mjs lit cette ligne.
// Ce que ce banc PROUVE : le badge du rejeu ne dit « identical ✓ » que sur des octets egaux ; pas d adresse = pas de bouton Mint ;
//   le plan paie EXACTEMENT 5 USDC (approve au contrat, contrat LU qui paie le FEE_WALLET) et Pay with garde ces appels tels quels ;
//   une couche eteinte retire SA dimension et pas une autre ; /api/tam/oeuvres avant deploiement = liste vide + raison ; la liste servie
//   contient les modules TAM.
// Ce qu il NE prouve PAS : le dessin, les gestes, le son (navigateur), ni un mint reel (TamArt n est pas deploye).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from './tam-moteur.js';
import * as V from './tam-vue.js';
import * as TP from './tam-plan.js';
import { serveurTam, etatCerveauTam } from './tam-serveur.js';
import { TAMART_DEPLOIEMENT } from './tamart-deploiement.js';
import { planJeuUsdc, besoinDuJeu, planPayerEnJeton, usdcAViser, CANDIDATS_CL } from './misables.js';
import { FEE_WALLET } from './frais-creation.js';
import { keccak256Hex } from './keccak.js';
import { FACTORY_AERODROME_CL } from './calldata-aerodrome.js';
import { PHASES } from './cerveau.js';
const PHASES_OK = PHASES;

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const bas = (x) => String(x).toLowerCase();
const graineDe = (s) => keccak256Hex(new TextEncoder().encode(s));

/* ── 1. le rejeu ── */
const ch = T.choisirOeuvre({ graine: graineDe('tam-echantillon-1'), etatCerveau: { tick: 1 }, existantes: [] });
ok(ch.ok, 'une oeuvre certifiee pour la graine d echantillon 1');
const r = T.rejouer(JSON.parse(JSON.stringify(ch.params)));
ok(V.verdictRejeu(r.octets, ch.octets).identique === true && V.verdictRejeu(r.octets, ch.octets).texte === 'identical ✓', 'rejouer(params) = les memes octets : identical ✓');
for (const i of [0, 7, Math.floor(ch.octets.length / 2), ch.octets.length - 1]) {
  const m = ch.octets.slice(); m[i] ^= 1;
  ok(V.verdictRejeu(r.octets, m).identique === false && V.verdictRejeu(r.octets, m).texte === 'different ✗', 'un octet change (index ' + i + ') : different ✗');
}
const plus = new Uint8Array(ch.octets.length + 1); plus.set(ch.octets);
ok(!V.verdictRejeu(r.octets, plus).identique, 'un octet de plus : different ✗');
ok(!V.verdictRejeu(r.octets, ch.octets.slice(0, -1)).identique, 'un octet de moins : different ✗');
ok(!V.verdictRejeu(null, ch.octets).identique && !V.verdictRejeu(r.octets, null).identique, 'rejeu rate ou chaine non lue : different ✗');
ok(!V.verdictRejeu(new Uint8Array(0), new Uint8Array(0)).identique, 'deux vides : jamais ✓');
ok(!V.verdictRejeu(Array.from(ch.octets), ch.octets).identique, 'un tableau qui n est pas des octets : jamais ✓');

/* ── 2. le bouton Mint ── */
/* 2026-11-01 : TamArt deploye (0x802d…0013, bloc 53366474) — la fiche du depot ouvre le Mint ; la fiche vierge le ferme */
ok(TAMART_DEPLOIEMENT.adresse === '0x802d79a0d30538948f1e5c1d9d264c47dd4e0013' && TAMART_DEPLOIEMENT.bloc === 53366474, 'temoin : la fiche du depot porte le deploiement relu');
ok(V.mintVisible(TAMART_DEPLOIEMENT) === true, 'fiche du depot : le bouton Mint');
ok(V.mintVisible({ ...TAMART_DEPLOIEMENT, adresse: null, bloc: null }) === false, 'sans adresse : pas de bouton Mint');
const DEP = { ...TAMART_DEPLOIEMENT, adresse: '0x' + '11'.repeat(20), bloc: 1000 };
const VIERGE = Object.freeze({ ...TAMART_DEPLOIEMENT, adresse: null, bloc: null }); /* la fiche d avant la signature : les scenarios « non deploye » */
ok(V.mintVisible(DEP) === true, 'adresse ET bloc : le bouton Mint');
ok(V.mintVisible({ ...DEP, bloc: null }) === false, 'adresse sans bloc : pas de bouton');
ok(V.mintVisible({ ...DEP, adresse: '0x' + '00'.repeat(20) }) === false, 'adresse zero : pas de bouton');
ok(V.mintVisible({ ...DEP, adresse: '0x1234' }) === false, 'adresse tronquee : pas de bouton');
ok(V.mintVisible(null) === false && V.mintVisible(undefined) === false, 'pas de fiche : pas de bouton');
/* 2026-11-04 : un checkout neuf est en CRLF (core.autocrlf) ; les motifs ci-dessous contiennent \n -> le source est relu en LF */
const onglet = readFileSync(new URL('./tam-onglet.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
/* 2026-11-07 : ce banc lisait tam-onglet.js comme du TEXTE ; un `THEMES.physique.push` sur une cle jamais creee faisait planter le CHARGEMENT
 *   du module (onglet TAM mort en prod depuis game224) sans qu aucune assertion ne rougisse. On EXECUTE donc le module, une fois. */
const chargement = await import(new URL('./tam-onglet.js?banc=' + process.pid, import.meta.url).href).then(() => 'charge').catch((e) => 'ERREUR ' + e.message);
ok(chargement === 'charge', 'tam-onglet.js se CHARGE (le module s execute jusqu au bout) : ' + chargement);
/* 2026-11-12 (the economy pack is live): the Mint follows TAM art's deployment record (EP.TAM_DEPLOIEMENT), the first TamArt stays in the gallery */
ok(/const visible = V\.mintVisible\(EP\.TAM_DEPLOIEMENT\) && /.test(onglet) && /zMint\.hidden = !visible/.test(onglet), 'l onglet cache la zone Mint par CETTE regle');
ok(/if \(!visible\) \{ zMint\.replaceChildren\(\); return; \}/.test(onglet), 'sans adresse, la zone Mint est VIDEE (aucun bouton construit)');

/* ── 3. le plan : exactement 5 USDC, vers le FEE_WALLET ── */
const LU = { prix: 5000000n, beneficiaire: bas(FEE_WALLET), usdc: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' };
const paramsJson = JSON.stringify(ch.params);
const jeu = { genre: 'tam', contrat: DEP.adresse, deploiement: DEP, lu: LU, octets: ch.octets, graine: ch.params.graine, paramsJson };
const p = planJeuUsdc(jeu);
ok(p.etat === 'PRET' && p.appels.length === 2, 'planJeuUsdc genre tam : PRET, 2 appels');
ok(bas(p.appels[0].to) === LU.usdc && p.appels[0].data.startsWith('0x095ea7b3'), 'appel 1 : approve sur USDC');
ok('0x' + p.appels[0].data.slice(34, 74) === DEP.adresse, 'approve : le spender est TamArt');
ok(BigInt('0x' + p.appels[0].data.slice(74)) === 5000000n, 'approve : EXACTEMENT 5 000 000 (5 USDC)');
ok(besoinDuJeu(p, DEP.adresse) === 5000000n, 'Pay with lit un besoin de 5 USDC exactement');
ok(p.resume.vers === bas(FEE_WALLET) && p.resume.prixUsdc === 5000000n, 'le resume dit 5 USDC au FEE_WALLET');
ok(p.resume.empreinte === ch.hash && p.resume.octets === ch.octets.length, 'le resume dit les octets et leur keccak');
/* le calldata du mint se relit : data, graine, params */
const d = p.appels[1].data.slice(10), w = (i) => d.slice(64 * i, 64 * (i + 1));
ok(p.appels[1].data.startsWith(TP.appelLecture(DEP.adresse, TP.SIG_TAM.mint).data) && bas(p.appels[1].to) === DEP.adresse, 'appel 2 : mint(bytes,bytes32,bytes) sur TamArt');
const offD = Number(BigInt('0x' + w(0))) * 2, offP = Number(BigInt('0x' + w(2))) * 2;
const lenD = Number(BigInt('0x' + d.slice(offD, offD + 64))), lenP = Number(BigInt('0x' + d.slice(offP, offP + 64)));
ok(d.slice(offD + 64, offD + 64 + lenD * 2) === Buffer.from(ch.octets).toString('hex'), 'mint : les octets de l oeuvre, octet pour octet');
ok('0x' + w(1) === bas(ch.params.graine), 'mint : la graine');
ok(Buffer.from(d.slice(offP + 64, offP + 64 + lenP * 2), 'hex').toString('utf8') === paramsJson, 'mint : le JSON des params');
ok(p.appels.every((a) => a.value === '0x0'), 'aucun ETH envoye');
/* les refus */
const refuse = (o, code, m) => { const x = planJeuUsdc({ ...jeu, ...o }); ok(x.etat === 'REFUSE' && (!code || x.code === code), m + ' (' + x.code + ')'); };
refuse({ deploiement: VIERGE, contrat: DEP.adresse }, 'PAS_DEPLOYE', 'fiche sans adresse : refuse');
refuse({ lu: { ...LU, beneficiaire: '0x' + 'be'.repeat(20) } }, 'BENEFICIAIRE', 'contrat LU qui paie un autre wallet : refuse');
refuse({ lu: { ...LU, prix: 5000001n } }, 'PRIX', 'contrat LU a 5,000001 USDC : refuse');
refuse({ lu: { ...LU, prix: 4999999n } }, 'PRIX', 'contrat LU a 4,999999 USDC : refuse');
refuse({ lu: null }, 'NON_LU', 'contrat non lu : refuse');
refuse({ lu: { ...LU, usdc: '0x' + '22'.repeat(20) } }, 'USDC', 'contrat LU sur un autre jeton : refuse');
refuse({ deploiement: { ...DEP, constructeur: { ...DEP.constructeur, beneficiaire: '0x' + 'be'.repeat(20) } } }, 'BENEFICIAIRE', 'fiche qui paie un autre wallet : refuse');
refuse({ deploiement: { ...DEP, prix: 1000000 } }, 'PRIX', 'fiche a 1 USDC : refuse');
refuse({ octets: ch.octets.slice(1) }, 'DONNEES', 'octets sans en-tete TAM : refuse');
refuse({ graine: '0x1234' }, 'GRAINE', 'graine tronquee : refuse');
refuse({ paramsJson: 'x'.repeat(4097) }, 'PARAMS', 'params trop longs : refuse');
/* Pay with un jeton : le swap pour 5 USDC, puis CES deux appels, inchanges */
const cand = CANDIDATS_CL.find((c) => !c.natif);
const vise = usdcAViser({ besoin: 5000000n });
const devis = { etat: 'PRET', jeton: cand.jeton, jetonIn: cand.jeton, natif: false, symbole: 'TEST', route: 'aerodrome-cl', factory: FACTORY_AERODROME_CL, pool: cand.pool,
  tickSpacing: cand.tickSpacing, usdcSortie: vise, montantIn: 1000000000000000000n, ecartBps: 20, usdcPool: 50000000000n, bloc: 100 };
const pj = planPayerEnJeton({ devis, compte: '0x' + 'ab'.repeat(20), jeu, blocActuel: 105, maintenant: 1800000000 });
ok(pj.etat === 'PRET', 'Pay with un jeton profond a 5 USDC : PRET (' + (pj.pourquoi || '') + ')');
if (pj.etat === 'PRET') {
  ok(pj.resume.besoinUsdc === 5000000n && pj.resume.usdcSortie === vise, 'le swap vise 5 USDC + le frais d interface, le jeu prend 5 USDC');
  const fin = pj.appels.slice(-2);
  ok(fin.every((a, i) => bas(a.to) === bas(p.appels[i].to) && a.data === p.appels[i].data), 'les 2 derniers appels = le plan USDC du mint, octet pour octet');
}
const pjUsdc = planPayerEnJeton({ devis: { jeton: LU.usdc }, compte: '0x' + 'ab'.repeat(20), jeu, blocActuel: 1, maintenant: 1 });
ok(pjUsdc.etat === 'PRET' && pjUsdc.appels.length === 2 && pjUsdc.appels[1].data === p.appels[1].data, 'Pay with USDC : le plan du mint tel quel');

/* ── 4. les couches : eteindre j retire j, et pas une autre ── */
const P12 = V.paramsExplorateur({ famille: 'lorenz', copies: 4 });
const o12 = T.generer(P12);
ok(o12.bornee && o12.D === 12, 'explorateur : Lorenz x4 couple = 12-D, borne');
const z = V.standardiser(o12.brut, o12.n, o12.D);
const sansCol = (j) => { const c = z.slice(); for (let i = 0; i < o12.n; i++) c[i * 12 + j] = 0; return c; };
const egal = (a, b) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-12);
let e = V.etatCouches(12);
for (const j of [0, 1, 3, 7, 11]) {
  const ej = V.basculer(e, j);
  ok(ej.actives.filter((x) => !x).length === 1 && ej.actives[j] === false, 'basculer(' + j + ') eteint SEULEMENT x' + (j + 1));
  for (const t of [0, 1.3]) {
    const a = V.projeterVivant({ z, n: o12.n, D: 12, actives: ej.actives, angles: P12.angles, t });
    const b = V.projeterVivant({ z: sansCol(j), n: o12.n, D: 12, actives: null, angles: P12.angles, t });
    const k = (j + 1) % 12, c2 = V.projeterVivant({ z: sansCol(k), n: o12.n, D: 12, actives: null, angles: P12.angles, t });
    ok(egal(a, b), 'x' + (j + 1) + ' eteinte (t=' + t + ') = la projection SANS la colonne ' + j);
    ok(!egal(a, c2), 'x' + (j + 1) + ' eteinte (t=' + t + ') != la projection sans la colonne ' + k + ' (pas la mauvaise dimension)');
  }
}
ok(V.dimsVisibles(V.isoler(e, 5)).join() === '5', 'isoler(5) : seule x6');
ok(V.dimsVisibles(V.jusqua(e, 3)).join() === '0,1,2', 'curseur a 3 : x1..x3');
ok(V.dimsVisibles(V.jusqua(e, 12)).length === 12 && V.pairesVisibles(e).length === 66, 'curseur a 12 : 12 couches, 66 paires');
ok(V.pairesVisibles(V.jusqua(e, 3)).length === 3, '3 couches : 3 paires');
/* t = 0, toutes couches : exactement la projection du moteur (les points stockes) */
const pos0 = V.projeterVivant({ z, n: o12.n, D: 12, actives: null, angles: P12.angles, t: 0 });
const M = (1 << o12.params.q) - 1;
let diff = 0; for (let i = 0; i < pos0.length; i++) { const q = Math.min(M, Math.max(0, Math.round((pos0[i] + 1) / 2 * M))); if (Math.abs(q - o12.points[i]) > 1) diff++; }
ok(diff === 0, 'vue vivante a t=0 = les points du moteur (a 1 pas de quantification pres, cos/sin natifs) : ' + diff + ' ecarts');
/* 2026-10-31 (cascade decroissante du moteur) : la vue STOCKEE porte aussi x7..x12 */
const sans9 = V.projeterVivant({ z: sansCol(9), n: o12.n, D: 12, actives: null, angles: P12.angles, t: 0 });
ok(!egal(pos0, sans9), 'a t=0 (vue stockee) la dimension x10 change la vue');
ok(!egal(V.projeterVivant({ z, n: o12.n, D: 12, actives: null, angles: P12.angles, t: 0.8 }), V.projeterVivant({ z: sansCol(9), n: o12.n, D: 12, actives: null, angles: P12.angles, t: 0.8 })), 'rotation vivante : x10 apparait');

/* ── 5. la carte ── */
const cc = T.certifier(T.generer(ch.params), []);
const L = V.carte({ P: ch.params, c: cc, choix: { graine: ch.params.graine, bloc: 123, empreinteEtat: ch.params.empreinteEtat, essai: ch.params.essai, rejets: ch.rejets } });
const v = (k) => (L.find((x) => x.k === k) || {}).v || '';
ok(v('Chaotic').startsWith('yes, λ = ' + cc.lyapunov.toFixed(3)), 'Chaotic : yes, λ = la VALEUR mesuree (' + v('Chaotic') + ')');
ok(v('Bounded').startsWith('yes'), 'Bounded : yes');
ok(v('Box dimension').includes(cc.dimension.toFixed(2)) && v('Box dimension').includes('rough estimate'), 'Box dimension : valeur + « rough estimate »');
ok(v('Distinct from the minted works').startsWith('yes (no minted work'), 'Distinct : yes, et dit qu il n y a rien a comparer');
ok(/not new mathematics/.test(v('Why this one')), 'la carte dit : pas de nouvelles mathematiques');
ok(V.carte({ P: ch.params, c: { ...cc, lyapunov: -0.1 } }).find((x) => x.k === 'Chaotic').v.startsWith('no'), 'λ negatif : « no »');

/* ── 6. le serveur ── */
const HASH = graineDe('bloc-de-test');
const appels = [];
const rpcFaux = async (m, params) => { appels.push(m); if (m === 'eth_getBlockByNumber') return { number: '0x64', hash: HASH }; throw new Error('pas attendu: ' + m); };
const UNIT = '0xb2000000000000000000007afa7ed748b0874f27', IB022 = '0xb200000000000000000000e4b0c5fbe9c8df579e';
const viesLues = [];
const lireVie = async (a) => { viesLues.push(a); if (a === IB022) throw new Error('rpc en panne'); return { etat: 'LUE', vie: 1234.5, bloc: 100 }; };
const srv = serveurTam({ rpc: rpcFaux, deploiement: VIERGE, lireVie, lireSymbole: async () => 'ZZZ' });
const oe = await srv.oeuvres();
ok(oe.ok === true && oe.etat === 'PAS_DEPLOYE' && Array.isArray(oe.oeuvres) && oe.oeuvres.length === 0 && /coming soon/.test(oe.pourquoi), '/api/tam/oeuvres avant deploiement : liste vide + raison');
ok(!appels.includes('eth_getLogs'), 'avant deploiement : aucun eth_getLogs');
const c1 = await srv.choix(null);
ok(c1.ok && c1.graine === HASH && c1.bloc === 100, '/api/tam/choix sans graine : le hash du dernier bloc');
const etU = etatCerveauTam(UNIT, { vie: 1234.5, etatVie: 'LUE', bloc: 100, symbole: 'UNIT' });
ok(c1.empreinteEtat === keccak256Hex(new TextEncoder().encode(T.canon(etU))), 'defaut : le cerveau de UNIT (24 battements, sa vie lue) ; empreinte = keccak(canon(etat))');
/* 2026-11-01 : l humeur et la lecture sont DITES, jamais dans la graine (canon(etat) sans elles : l empreinte ci-dessus reste la meme) */
ok(PHASES_OK.includes(c1.cerveau.phase) && typeof c1.cerveau.humeur === 'string' && typeof c1.cerveau.ressenti === 'string' && c1.cerveau.ressenti.length > 0, 'la reponse dit l humeur (' + c1.cerveau.humeur + ') et la lecture (' + c1.cerveau.ressenti + ') du cerveau');
ok(!['phase', 'humeur', 'ressenti', 'ressentiCle'].some((k) => k in etU), 'humeur et lecture ne sont PAS des cles de l etat qui fait la graine');
ok(c1.cerveau.adresse === UNIT && c1.cerveau.symbole === 'UNIT' && c1.cerveau.battement === 24 && c1.cerveau.vivant === false && c1.cerveau.repli === false, 'la reponse nomme le cerveau : UNIT, battement 24, pas vivant');
ok(/^brain of UNIT at beat 24, rebuilt on the server from its seed, fed its market life read on chain at block 100; not your live brain$/.test(c1.cerveau.etiquette), 'etiquette : ' + c1.cerveau.etiquette);
ok(etU.empreinte !== etatCerveauTam(IB022).empreinte, 'temoin : le connectome depend du block (empreinte UNIT != IB022)');
const cI = await srv.choix(null, IB022);
ok(cI.ok && cI.cerveau.symbole === 'IB022' && cI.cerveau.etatVie === 'NON_LUE' && /with its market life not read/.test(cI.cerveau.etiquette) && cI.empreinteEtat !== c1.empreinteEtat, 'block=IB022 (vie non lue) : SON cerveau, dit « not read », autre empreinte');
const cZ = await srv.choix(null, '0x' + '12'.repeat(20));
ok(cZ.ok && cZ.cerveau.symbole === 'ZZZ' && /^brain of ZZZ at beat 24/.test(cZ.cerveau.etiquette), 'block quelconque : son symbol() lu');
ok((await srv.choix(null, '0x1234')).etat === 'REFUSE', 'block tronque : refuse');
/* 2026-11-01 (Phil : « fait tout la meme chose ») : un tirage neuf = une graine neuve sur le MEME bloc ; le meme tirage = la meme graine */
const dA = await srv.choix(null, null, null, null, '1a2b3c4d5e6f7081'), dB = await srv.choix(null, null, null, null, '00000000000000ff');
ok(dA.ok && dB.ok && dA.bloc === 100 && dB.bloc === 100 && dA.graine !== dB.graine && dA.graine !== HASH, 'deux tirages, meme bloc : deux graines, aucune n est le hash nu');
ok(dA.graine === keccak256Hex(new TextEncoder().encode(HASH + ':1a2b3c4d5e6f7081')) && dA.tirage === '1a2b3c4d5e6f7081', 'graine = keccak(hash : tirage), tirage rendu');
ok(dA.hash !== dB.hash, 'deux tirages : deux oeuvres differentes (keccak des octets)');
ok((await srv.choix(null, null, null, null, '1A2B3C4D5E6F7081')).graine === dA.graine, 'le meme tirage (casse ignoree) : la meme graine');
for (const mauvais of ['xyz', '0x12', '1'.repeat(17), ' 12'])
  ok((await srv.choix(null, null, null, null, mauvais)).etat === 'REFUSE', 'tirage mal forme refuse : ' + JSON.stringify(mauvais));
const Lc = V.carte({ P: c1.params, c: c1.certificats, choix: { ...c1, essai: c1.params.essai } });
const wb = (Lc.find((x) => x.k === 'Which brain') || {}).v || '';
ok(wb === 'Seed: hash of Base block 100 + ' + c1.cerveau.etiquette + '.', 'la carte : « Seed: hash of Base block N + brain of SYM at beat B … »');
ok(!/live brain/.test(wb.replace('not your live brain', '')), 'la carte ne pretend jamais un cerveau vivant');
ok(/an unnamed brain state/.test(V.carte({ P: c1.params, c: c1.certificats, choix: { graine: c1.graine, bloc: 1, empreinteEtat: c1.empreinteEtat, essai: 0, rejets: [] } }).find((x) => x.k === 'Which brain').v), 'sans etiquette : « an unnamed brain state », jamais un nom invente');
const rr = T.rejouer(c1.params);
ok(V.verdictRejeu(rr.octets, TP.octetsDe(c1.octets)).identique && rr.hash === c1.hash, 'les octets servis se rejouent a l identique depuis les params servis');
ok(c1.certificats && c1.certificats.signature === undefined && Number.isFinite(c1.certificats.lyapunov), 'certificats servis (sans la signature de 512 cases)');
await srv.choix(null);
ok(appels.filter((m) => m === 'eth_getBlockByNumber').length === 1, 'la tete est en cache (une lecture pour deux choix)');
ok((await srv.choix('0x12')).etat === 'REFUSE', 'graine invalide : refuse');
const c2 = await srv.choix(graineDe('autre'));
ok(c2.ok && c2.graine === graineDe('autre') && c2.bloc === null, 'graine donnee : utilisee telle quelle');

/* ── 6b. (2026-11-01) deploye : une signature existante NON LUE -> NON_LU (jamais ecartee) ; le minteur entre dans la graine ── */
{
  const { TOPIC_MINTED } = await import('./tam-serveur.js');
  const C = '0x' + '11'.repeat(20), mot = (x) => BigInt(x).toString(16).padStart(64, '0');
  const oct = Buffer.from(ch.octets).toString('hex'), pad = oct + '0'.repeat((64 - (oct.length % 64)) % 64);
  let donneesOk = false;
  const rpcD = async (m, prm) => {
    if (m === 'eth_getBlockByNumber') return { number: '0x' + (2000).toString(16), hash: HASH };
    if (m === 'eth_blockNumber') return '0x' + (2000).toString(16);
    if (m === 'eth_getLogs') return [{ address: C, topics: [TOPIC_MINTED, '0x' + mot(1), '0x' + mot('0x' + 'ab'.repeat(20)), '0x' + mot(ch.hash)], data: bas(ch.params.graine), transactionHash: '0x' + '77'.repeat(32), blockNumber: '0x3e9' }];
    if (m === 'eth_call') { if (!donneesOk) throw new Error('rpc en panne'); return '0x' + mot(32) + mot(ch.octets.length) + pad; }
    throw new Error('pas attendu: ' + m);
  };
  const srvD = serveurTam({ rpc: rpcD, deploiement: { ...DEP }, lireVie, lireSymbole: async () => 'ZZZ', maintenant: (() => { let t = 0; return () => (t += 61000); })() });
  const oD = await srvD.oeuvres();
  ok(oD.ok && oD.oeuvres.length === 1 && oD.oeuvres[0].signatureNonLue === true, 'deploye : 1 oeuvre lue, sa signature NON lue (marquee)');
  const cD = await srvD.choix(graineDe('x'));
  ok(cD.ok === false && cD.etat === 'NON_LU' && /could not be read/.test(cD.pourquoi), 'signature non lue -> choix NON_LU (' + cD.pourquoi + ')');
  donneesOk = true;
  await srvD.oeuvres();
  const cD2 = await srvD.choix(graineDe('x'));
  ok(cD2.ok === true && cD2.comparees === 1, 'signature relue au balayage suivant -> choix PRET, compare a 1 oeuvre');
  const a1 = await srvD.choix(graineDe('x'), null, '0x' + 'a1'.repeat(20)), a2 = await srvD.choix(graineDe('x'), null, '0x' + 'a2'.repeat(20));
  ok(a1.ok && a2.ok && a1.hash !== a2.hash && a1.params.minteur === '0x' + 'a1'.repeat(20), 'meme bloc, deux minteurs -> deux oeuvres');
  ok((await srvD.choix(graineDe('x'), null, '0x12')).etat === 'REFUSE', 'minteur tronque : refuse');
  const srvP = serveurTam({ rpc: async (m) => { if (m === 'eth_getBlockByNumber') return { number: '0x64', hash: HASH }; throw new Error('panne'); }, deploiement: { ...DEP }, lireVie });
  await srvP.oeuvres().catch(() => null);
  const cP = await srvP.choix(graineDe('x'));
  ok(cP.ok === false && cP.etat === 'NON_LU', 'liste des oeuvres non lue (deploye) -> NON_LU, jamais une liste vide supposee');
}

/* ── 7. la liste servie ── */
const serveur = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const bloc = serveur.match(/const SERVIS\s*=\s*\[([\s\S]*?)\];/);
const servis = new Set([...bloc[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
for (const f of ['tam-onglet.js', 'tam-vue.js', 'tam-moteur.js', 'tam-plan.js', 'tamart-deploiement.js', 'keccak.js', 'misables.js', 'map3d.js', 'vision-inside.js', 'calldata-aerodrome.js', 'frais-creation.js'])
  ok(servis.has(f), f + ' est servi');
ok(/import\('\.\/tam-onglet\.js'\)/.test(readFileSync(new URL('./app.html', import.meta.url), 'utf8')), 'app.html importe tam-onglet.js (suivi par test-imports-servis)');
ok(/chemin === '\/api\/tam\/choix' \|\| chemin === '\/api\/tam\/oeuvres'/.test(serveur), 'les routes /api/tam/* existent');
/* game82 (Phil, « Three roads to pi ») : la ligne « Check » d un invariant — la VRAIE fonction du source, executee */
{
  /* la fin de la fonction : `}` seul en debut de ligne, LF ou CRLF (test-tests-portables) */
  const deb = onglet.indexOf('function ligneInvariant('), fin = /\r?\n\}\r?\n/.exec(onglet.slice(deb));
  const a = onglet.indexOf('const nb4 = '), b = deb > 0 && fin ? deb + fin.index + fin[0].length : -1;
  ok(a > 0 && b > a, 'nb4 .. ligneInvariant extraits du source');
  const ligne = new Function(onglet.slice(a, b) + '\nreturn ligneInvariant;')();
  const TSq = await import('./tam-science.js'), P1 = TSq.paramsScience('nombrePi'); P1.params.termesLeibniz = 1;
  const I1 = TSq.systeme('nombrePi').mod.simuler('nombrePi', P1.params).invariants;
  const L1 = ligne('leibniz', I1.leibniz);
  ok(/value 4\b/.test(L1) && /terms 1\b/.test(L1) && !/valeur|NfoisErreur/.test(L1), 'Leibniz a 1 terme : « terms 1 » dit, cles en anglais : ' + L1);
  ok(ligne('reference', I1.reference) === 'reference: true pi 3.141592653589793', 'la vraie valeur de pi affichee en entier : ' + ligne('reference', I1.reference));
  ok(/data series/.test(ligne('courbes', I1.courbes)), 'un invariant sans nombre (courbes) n est plus une ligne vide');
  /* game103 (sonde aux bouts des curseurs : 12 lignes « measured NaN ») : de VRAIS runs ou la mesure n existe pas — jamais « NaN » */
  {
    const run = (id, p) => TSq.systeme(id).mod.simuler(id, p).invariants;
    const Lc = ligne('precession', run('schwarzschild', { L: 3.6 }).precession), Lt = ligne('precession', run('schwarzschild', { tours: 2 }).precession);
    const Ls = ligne('periodeEarth', run('systemeSolaire', { annees: 0.5 }).periodeEarth), Lk = ligne('noeuds', run('kerr', { inclinaison: 0 }).noeuds);
    const Lo = ligne('transitionAcceleration', run('expansionUnivers', { Om: 1 }).transitionAcceleration);
    ok([Lc, Lt, Ls, Lk, Lo].every((l) => !/NaN|null|undefined/.test(l) && /not measured/.test(l)), 'mesure absente : « not measured », jamais NaN : ' + [Lc, Lt, Ls, Lk, Lo].join(' | '));
    ok(/no full orbit/.test(Lc) && /formula 5\.17/.test(Lc) && /formula 2\.78/.test(Lt) && /no full oscillation/.test(Lk) && /not defined/.test(Lo) && !/formula/.test(Lo), 'la raison et la formule (exacte quand elle existe) : ' + Lt);
    const Li = ligne('aimantation', run('ising2D', { T: 3.5 }).aimantation), Li0 = ligne('aimantation', run('ising2D', {}).aimantation);
    ok(/not compared at these settings/.test(Li) && !/statistical/.test(Li) && /measured 0\.\d/.test(Li), 'hors domaine (le module dit comparable: false) : pas d egalite pretendue : ' + Li);
    ok(!/not compared/.test(Li0) && /statistical/.test(Li0), 'temoin : Ising aux defauts reste compare avec son sigma : ' + Li0);
    /* game104 : les 4 derniers ecarts de la sonde aux bouts — chacun dit sa vraie reference */
    const Lw = ligne('transmission', run('effetTunnel', { largeur: 4 }).transmission), w = run('effetTunnel', { largeur: 4 }).transmission;
    ok(/averaged over the packet/.test(Lw) && Math.abs(w.mesure - w.paquet) / w.paquet < 0.03 && Math.abs(w.mesure - w.formule) / w.formule > 0.2, 'tunnel : la reference est la moyenne sur le paquet (a < 3 %), pas l onde plane (> 20 %) : ' + Lw);
    const Lsn = ligne('exposantSedov', run('supernova', { annees: 1000 }).exposantSedov), Lsn0 = ligne('exposantSedov', run('supernova', {}).exposantSedov);
    ok(/not compared/.test(Lsn) && !/not compared/.test(Lsn0) && /measured 0\.4 vs formula 0\.4/.test(Lsn0), 'Sedov : pas compare avant 10 temps de croisement, compare aux defauts : ' + Lsn + ' | ' + Lsn0);
    const Lg =ligne('binomiale', run('galton', { billes: 100 }).binomiale);
    ok(/statistical, ± 0\.04\d/.test(Lg), 'Galton 100 billes : le sigma binomial exact est dit : ' + Lg);
    ok(/approximate formula: the 1 - \(T\/Tc\)\^3 law/.test(ligne('fractionCondensat', run('zeroAbsolu', { atomes: 1000 }).fractionCondensat)), 'BEC : la loi en T^3 est dite limite N infini');
    /* game109 : le module dit SA raison — course trop courte, jamais « formule hors domaine » ni « not defined » */
    const Ise = run('epidemieSIR', { perteImmunite: 0.001, R0: 1.2 }), Leq = ligne('equilibre', Ise.equilibre), Lap = ligne('approche', Ise.approche);
    ok(/not compared at these settings \(not settled yet when the run stops at t = 10000; formula /.test(Leq) && !/outside its range/.test(Leq), 'SIRS lent : ' + Leq);
    ok(/not measured \(the run never got within 1e-7 of the endemic point\)/.test(Lap) && !/not defined/.test(Lap), 'SIRS lent : ' + Lap);
    ok(/measured 0\.\d+ vs formula 0\.\d+$/.test(ligne('equilibre', run('epidemieSIR', { perteImmunite: 0.1 }).equilibre)), 'temoin : SIRS pose = compare');
    ok(/measured \d+\.\d+ vs exact GR/.test(ligne('precession', run('schwarzschild', {}).precession)), 'temoin : un run normal garde sa mesure');
  }
  /* 2026-11-07 (vu en prod, rouge prouve par un groupe vide injecte) : quitter une science vide S.P ; S.o doit partir avec, sinon la boucle
   *   dessine l ancienne oeuvre sans parametres (TypeError a chaque image) quand le groupe suivant ne charge rien. */
  ok(onglet.includes('if (S.science) { S.origine = null; S.choix = null; S.P = null; S.science = null; S.o = null; }'),'quitter une science efface aussi l oeuvre dessinee (S.o)');
  /* game82 (Phil : « mets les variables au dessus ») : dans la page montee, les curseurs viennent AVANT la scene */
  const corps = onglet.slice(onglet.indexOf('racine.replaceChildren('));
  ok(corps.indexOf('curseurs, verdictTxt') > 0 && corps.indexOf('curseurs, verdictTxt') < corps.indexOf('      scene,') && corps.indexOf('selGroupe, selSys') < corps.indexOf('curseurs, verdictTxt'), 'les variables sont en haut, avec les selecteurs, avant la scene');
  /* game82 (audit) : un curseur entier selon le MODULE (groupe du systeme solaire glissait par 1/400) ; un continu ne l est pas */
  ok(TSq.paramEntier('systemeSolaire', 'groupe') && TSq.paramEntier('nombrePi', 'termesLeibniz') && !TSq.paramEntier('nombrePi', 'nope') && !TSq.paramEntier('schwarzschild', 'L')
    && /TS\.paramEntier\(S\.science\.s\.id, cle\) \? '1'/.test(onglet), 'les pas entiers viennent de la declaration ENTIERS des modules');
  /* vu a l ecran : la 1re version reprenait la classe .tamVars (panneau EN ABSOLU sur la scene) -> rendu hors de la carte */
  ok(/el\('details', \{ class: 'tamReglagesHaut'/.test(onglet) && !/\.tamReglagesHaut\{[^}]*position:/.test(onglet) && (onglet.match(/class: 'tamVars'/g) || []).length === 1, 'le bloc des variables du haut a sa propre classe, en flux');
  /* game117 (vu a l ecran : le bloc sur la scene couvrait jusqu a 40 % du bas des graphiques) : replie par defaut, titre cliquable et
   *   atteignable au clavier, dans les DEUX branches (science et attracteur) */
  ok(/#v-tam \.tamVars\.replie > :not\(b\)\{display:none\}/.test(onglet) && /varsScene\.classList\.toggle\('replie', !S\.varsOuvert\)/.test(onglet)
    && (onglet.match(/titreVars\(/g) || []).length === 2 && /role: 'button', tabindex: '0', 'aria-expanded'/.test(onglet) && /e\.key === 'Enter' \|\| e\.key === ' '/.test(onglet),
    'game117 : le bloc sur la scene est replie par defaut (titre cliquable, clavier, aria-expanded)');
  /* game121 (vu a l ecran : le curseur « cellules » s affichait en francais ; aucun banc ne regardait les NOMS de curseurs) : chaque cle de
   *   curseur des sciences a un nom anglais dans NOMS_PARAMS_EN, sauf les symboles et mots deja anglais de la liste figee ci-dessous
   *   (relevee le 03/11 : 94 cles, toutes des symboles ou des mots anglais) — une NOUVELLE cle francaise sans nom passe au rouge */
  { const i = onglet.indexOf('const NOMS_PARAMS_EN = {'), j = onglet.indexOf('};', i), bloc = onglet.slice(i, j).replace(/\/\*[\s\S]*?\*\//g, '');
    const nommees = new Set([...bloc.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:\s*['"]/g)].map((m) => m[1]));
    const SYMBOLES = new Set('L r0 B0 q theta1 theta2 u0 uz n l m cx cy delta rabi x0 omega d a lambda k G1 G2 G3 G4 eps y0 gamma B z0 rg a0 e0 m1 m2 z b1 b2 b3 b4 b0 l0 rho0 rs rmax H0 Om nu rext cycles M rmin v k0 V0 L0 pitch D kT sigma q0 phase K hbar theta gradient chi1 chi2 w R0 T latitude g Phi log10a log10Qmin log10Qmax Z r omega0 mu c i0 beta rho N E bMax rMin rMax points X Y temperature'.split(' '));
    const { SYSTEMES: SY } = await import('./tam-science.js'), sans = [];
    for (const s of SY) for (const k of Object.keys(s.params)) if (!nommees.has(k) && !SYMBOLES.has(k)) sans.push(s.id + '.' + k);
    ok(sans.length === 0, 'game121 : chaque curseur a un nom anglais (ou est un symbole de la liste figee) : ' + (sans.join(', ') || 'tous')); }
  /* game119 : de face et camera non tournee, profondeur aplatie pour les donnees ET le decor (un graphique n a pas de perspective) */
  ok(/const aplati = \(\) => !!\(S\.science && DE_FACE\.has\(S\.science\.s\.id\) && !S\.cam\);/.test(onglet) && /if \(!aplati\(\)\) return v;/.test(onglet)
    && /projeter\(p\[0\] \* sc, -p\[1\] \* sc, aplati\(\) \? 0 : p\[2\] \* sc\)/.test(onglet), 'game119 : graphiques de face sans perspective (donnees et decor)');
  /* game89 (Phil, Unruh : deux libelles ecrits l un SUR l autre) : le VRAI placeur du source, sur un faux canvas — deux textes au meme
   *   point ne se chevauchent plus ; et toute ecriture de la scene passe par lui (un seul fillText nu : le sien) */
  {
    const d0 = onglet.indexOf('const poses = [], hL = 13 * dpr, ecrits = new Set();'), f0 = onglet.indexOf('const point = (i, coul, r, txt) => {');
    ok(d0 > 0 && f0 > d0, 'placeur de libelles extrait');
    const ecrits = [], g = { measureText: (t) => ({ width: 6 * t.length }), fillText: (t, x, y) => ecrits.push({ t, x, y }) };
    const ecrire = new Function('g', 'dpr', onglet.slice(d0, f0) + '\necrire.poses = poses; return ecrire;')(g, 1);
    ecrire('Past horizon (x = -t)', 100, 50); ecrire('Future horizon (x = t): light from behind it never arrives', 100, 50); ecrire('start', 104, 52); ecrire('loin', 400, 50);
    /* la boite d un libelle = celle du placeur : hauteur 13 (le texte fait 11 px), de y - 10 a y + 3 */
    const bx = (e) => [e.x, e.y - 10, e.x + 6 * e.t.length, e.y + 3], chev = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
    let n = 0; for (let i = 0; i < ecrits.length; i++) for (let j = i + 1; j < ecrits.length; j++) if (chev(bx(ecrits[i]), bx(ecrits[j]))) n++;
    ok(n === 0 && ecrits[3].y === 50, 'trois libelles au meme point : 0 chevauchement ; un libelle libre reste a sa place (' + JSON.stringify(ecrits.map((e) => e.y)) + ')');
    /* les 4 cotes d une boite portent le meme nom (fauxVide, nombrePi au balayage) : ecrit UNE fois ; 12 libelles au meme point : aucun superpose */
    for (const p of [[10, 200], [300, 220], [10, 400], [300, 420]]) ecrire('Edge of the periodic box (side 1)', p[0], p[1]);
    ok(ecrits.filter((e) => e.t === 'Edge of the periodic box (side 1)').length === 1, 'un meme nom n est ecrit qu une fois par image');
    for (let k = 0; k < 12; k++) ecrire('Layer ' + k, 500, 600);
    let n2 = 0; for (let i = 0; i < ecrits.length; i++) for (let j = i + 1; j < ecrits.length; j++) if (chev(bx(ecrits[i]), bx(ecrits[j]))) n2++;
    const nL = ecrits.filter((e) => /^Layer /.test(e.t)).length;
    ok(n2 === 0 && nL >= 8 && nL <= 12, '12 libelles au meme point : ' + nL + ' places (au-dessus ET au-dessous), les autres NON ecrits — jamais superposes');
    /* game90 : une place RESERVEE (le panneau des valeurs en bas) : un libelle pose dessus REMONTE au-dessus (essais 0, +1, -1, ...) */
    ecrire.poses.push([0, 900, 700, 1000]);
    ecrire('Horizon sous le panneau', 50, 940);
    const hp = ecrits.find((e) => e.t === 'Horizon sous le panneau');
    ok(hp && hp.y + 3 <= 900, 'un libelle tombe sur le panneau reserve est remonte au-dessus (y ' + (hp && hp.y) + ')');
    /* game91 (balayage a 375 px : libelles coupes a droite, et pousses SOUS le bas du canvas) : un petit canvas de 300 x 200 */
    { const ecr = [], gp = { canvas: { width: 300, height: 200 }, measureText: (t) => ({ width: 6 * t.length }), fillText: (t, x, y) => ecr.push({ t, x, y }) };
      const ep = new Function('g', 'dpr', onglet.slice(d0, f0) + '\nreturn ecrire;')(gp, 1);
      ep('Core-mantle boundary (3480 km)', 280, 100); ep('Sous le bas', 20, 260);
      for (let k = 0; k < 10; k++) ep('Couche ' + k, 40, 195);
      const dehors = ecr.filter((e) => e.x < 0 || e.x + 6 * e.t.length > 300 || e.y - 10 < 0 || e.y + 3 > 200);
      let nc = 0; for (let i = 0; i < ecr.length; i++) for (let j = i + 1; j < ecr.length; j++) if (chev(bx(ecr[i]), bx(ecr[j]))) nc++;
      { const e2 = [], g2 = { canvas: { width: 300, height: 200 }, measureText: (t) => ({ width: 6 * t.length }), fillText: (t, x, y) => e2.push({ t, x, y }) };
        new Function('g', 'dpr', onglet.slice(d0, f0) + '\nreturn ecrire;')(g2, 1)('Herd-immunity threshold s = 1 / R0: the infected curve peaks here (a long label)', 100, 100);
        ok(e2.length === 1 && e2[0].x >= 0 && e2[0].x + 6 * e2[0].t.length <= 300 && /…$/.test(e2[0].t), 'game93 : un libelle plus large que le canvas est raccourci avec « … » et tient (' + (e2[0] && e2[0].t.length) + ' car.)'); }
      ok(ecr.length >= 8 && dehors.length === 0 && nc === 0, 'petit canvas : ' + ecr.length + ' libelles, 0 hors du canvas (' + dehors.map((e) => e.t).join(', ') + '), 0 chevauchement'); }
    /* game91 (balayage a 375 px : l echelle de 5 vues jamais ecrite) : les valeurs EXACTES lues dans le navigateur (dpr 2.0000000298,
     *   bords non entiers) — « juste dessous » retombait sous le bord d un arrondi et le placeur tournait sur 2 essais */
    { const ecr = [], gf = { canvas: { width: 635, height: 635 }, measureText: () => ({ width: 158.25390625 }), fillText: (t, x, y) => ecr.push({ t, x, y }) };
      const ef = new Function('g', 'dpr', onglet.slice(d0, f0) + '\necrire.poses = poses; return ecrire;')(gf, 2.0000000298023224);
      ef.poses.push([15.994958095743518, 11.996221431929708, 576.7433214513203, 49.40943626006126], [15.994958095743518, 369.0087696717544, 619.0050342772643, 623.003763314086]);
      ef('≈ 50 lattice sites', 635 - 16 * 2.0000000298023224 - 158.25390625, 21 * 2.0000000298023224);
      ok(ecr.length === 1 && ecr[0].y - 26 + 3 >= 49.40943626006126, 'arrondi flottant : l etiquette sous la ligne d info est ECRITE (' + JSON.stringify(ecr.map((e) => e.y)) + ')'); }
    ok(/for \(const sur of \[info, varsScene\]\)/.test(onglet) && /poses\.push\(\[\(r\.left - rc\.left\) \* kx/.test(onglet), 'les deux surcouches HTML (ligne du haut, panneau des valeurs) sont reservees a chaque image');
    /* game92 : chaque curseur annonce « sans forme » est MESURE — la forme ne bouge pas (min / defaut / max) ; « echelle » : les nombres
     *   bruts bougent (sinon le curseur serait mort) ; « checks » : memes points, au moins une mesure bouge */
    { const d1 = onglet.indexOf('const CURSEURS_SANS_FORME = {'), f1 = onglet.indexOf('/* une longueur « ronde »');
      const CSF = new Function(onglet.slice(d1, f1) + '\nreturn CURSEURS_SANS_FORME;')();
      const sim = (id, p) => { const P = TSq.paramsScience(id); Object.assign(P.params, p); const o = TSq.systeme(id).mod.simuler(id, P.params); return { o, z: TSq.standardiserIso(o.brut, o.n, o.D, id) }; };
      const dz = (a, b) => { let s = 0; for (let i = 0; i < a.z.length; i++) s += Math.abs(a.z[i] - b.z[i]); return s / a.z.length; };
      const db = (a, b) => { let s = 0, m = 0; for (let i = 0; i < a.o.brut.length; i++) { s += Math.abs(a.o.brut[i] - b.o.brut[i]); m += Math.abs(a.o.brut[i]); } return m > 0 ? s / m : 0; };
      const faux = [];
      for (const [cleSys, sorte] of Object.entries(CSF)) {
        const [id, k] = cleSys.split('.'), [lo, hi] = TSq.systeme(id).bornes[k], d = sim(id, {}), a = sim(id, { [k]: lo }), b = sim(id, { [k]: hi });
        const forme = Math.max(dz(d, a), dz(d, b)), brut = Math.max(db(d, a), db(d, b));
        const inv = JSON.stringify(a.o.invariants) !== JSON.stringify(b.o.invariants);
        if (!(forme < 0.02) || (sorte === 'echelle' && !(brut > 1e-6)) || (sorte === 'checks' && !(brut === 0 && inv))) faux.push(cleSys + ' (forme ' + forme.toFixed(4) + ', brut ' + brut.toFixed(4) + ', mesures ' + inv + ')');
      }
      ok(faux.length === 0 && Object.keys(CSF).length >= 20, 'curseurs « sans forme » mesures (' + Object.keys(CSF).length + ')' + (faux.length ? ' — FAUX : ' + faux.join(' ; ') : ''));
      /* game94 (vu en prod : « Check: sinh2surTc ») : chaque NOM de mesure et chaque cle numerique d un resume a son anglais — un futur
       *   module qui en oublie une fait rougir le banc */
      { const CE = await import('./tam-cles-en.js'), dC = onglet.indexOf('const CLES_EN = {'), fC = onglet.indexOf('};', dC) + 2;
        const CLES = { ...new Function(onglet.slice(dC, fC) + '\nreturn CLES_EN;')(), ...CE.CLES_EN_MODULES }, sansNom = new Set(), sansCle = new Set();
        /* game109 : aussi les variables de la nuit du 02-03/11 au MAX — leurs mesures n existent qu avec elles (aux defauts, rien a voir) */
        const VARIANTES = { galton: { penchant: 0.9 }, rutherford: { attirant: 1 }, lotkaVolterra: { saturation: 0.2 }, epidemieSIR: { perteImmunite: 0.2 }, chaleur: { perte: 2 }, brusselator: { ecartSeuil: 3 }, mendel: { recombinaison: 0 }, neurone: { courant: 0.5 }, aiguilleBuffon: { aiguilles: 100 }, effetDoppler: { mach: 2 }, lignesChamp: { charge: -0.25 }, circuitRC: { tau: 5 }, billardPi: { chiffres: 4 }, paraboleTir: { hauteur: 2 }, carnot: { liberte: 7, chaude: 5 }, montyHall: { portes: 10 }, lentilleMince: { distance: 0.3 }, penduleAmplitude: { lacher: 175 }, phasesLune: { anglePhase: 90 }, dureeJour: { latitude: 75 }, courseRoulante: { frottement: 0 }, corpsNoir: { rapport: 3 }, reseauFentes: { fentes: 12 }, refractionSnell: { indice: 2 }, desintegration: { demiVie: 6 }, anneauxNewton: { lambda: 700 }, pendulesCouples: { couplage: 0.4 }, tautochrone: { lacherHaut: 60 }, chainette: { rapport: 1.8 }, echelleGlisse: { depart: 60 }, perleCerceau: { omegaMax: 3.5 }, dzhanibekov: { milieu: 1.6 }, toupie: { rotation: 12 }, penduleRessort: { rapport: 2.5 }, kapitza: { secousse: 0.3 }, apollonius: { premier: 0.3 }, haloGlace: { indice: 1.38 }, tasDeSable: { cote: 20 }, vergerEuclide: { cote: 15 }, cerclesFord: { ordre: 7 }, fermatSteiner: { largeur: 0.8 }, causticTasse: { rayons: 150 }, papillonHofstadter: { qmax: 7 }, dominosKasteleyn: { hauteur: 4, largeur: 6 }, ising: { beta: 0.7 }, aztecDiamond: { ordre: 10 }, collectionneur: { vignettes: 12 }, ruineJoueur: { gain: 0.6 }, catalanDyck: { demi: 30 }, partitionEuler: { entier: 20 }, courbeDragon: { plis: 6 }, theoremePick: { sommets: 6, rayon: 8 }, percolationLiens: { cote: 3 }, napoleon: { taille: 5 }, billardElliptique: { rebonds: 20 }, feuerbach: { taille: 6 }, jeuDeLaVie: { oscillateur: 0 }, marcheAutoEvitante: { etapes: 5 }, eulerSolides: { solide: 0 }, morley: { angleA: 60 }, bale: { termes: 5 }, simsonDroite: { taille: 5 }, distinctesImpaires: { entier: 8 }, triangulations: { cotes: 6 }, ramseyR33: { sommetsK: 4 }, pascalHexagramme: { croise: 1 }, ptolemee: { graine: 3 }, sommesCarres: { entier: 10 }, equationPell: { radical: 7 }, nombresCarmichael: { limite: 600 }, theoremeWilson: { limite: 40 }, fonctionMertens: { limite: 60 }, parfaitsAmicaux: { limite: 400 }, nombresBernoulli: { rangB: 12 }, problemeJosephus: { personnes: 7 }, zeckendorf: { entier: 40 }, theoremeLucas: { lignesL: 9 }, calkinWilf: { niveaux: 5 }, toursHanoi: { disques: 4 }, regarderDire: { rangs: 15 }, derangements: { objets: 4 }, nombresHarmoniques: { rangs: 20 }, suiteCollatz: { limite: 30 }, routineKaprekar: { longueurK: 3 }, stirlingBell: { elements: 5 }, motzkinChemins: { longueurM: 6 }, periodePisano: { moduleMax: 30 }, indicatriceEuler: { jusquaN: 40 }, goldbachPaires: { pairMax: 60 }, frobeniusPieces: { pieceMax: 11 }, schroderChemins: { longueurS: 4 }, triangleNarayana: { rangN: 5 }, suiteRecaman: { rangR: 40 }, suiteKolakoski: { rangK: 60 }, suitePerrin: { perrinMax: 30 }, thueMorse: { rangT: 64 }, suitePadovan: { rangP: 60 }, fourmiLangton: { pasL: 10500 }, codeGenetique: { longueur: 100 }, titrageAcideFaible: { acide: 0.05 }, geometrieVSEPR: { molecule: 2 }, pileDaniell: { kelvins: 350 }, gammeTemperee: { divisions: 19 }, entropieShannon: { lettres: 5000 }, atmosphereStandard: { altitudeKm: 8 }, loiZipf: { rangsZipf: 15 }, gutenbergRichter: { bValeur: 1.3 }, arrhenius: { celsius: 420 }, mareeVivesEaux: { jours: 30 }, energieLiaison: { reaction: 2 }, courbeKeeling: { anDebut: 1990 }, populationMonde: { decennies: 5 }, electronegativite: { grandeur: 1 }, hodgkinHuxley: { courantHH: 20 }, loiKleiber: { exposantTest: 0.67 }, effetPhotoelectrique: { metal: 2 }, demiViesNPL: { demiVies: 7 }, choleraSnow: { septSemaines: 2 }, raiesBalmer: { nPlusHaut: 5 }, loiBoyle: { exposantTest: 0.7 }, loiOhm: { bTest: 35 }, especesAire: { zTest: 0.1 }, michaelisMenten: { Ktest: 0.05 }, diffusionAlpha: { puissanceTest: 2 }, argonRayleigh: { signeCorrection: -1 }, carteSturtevant: { distanceMax: 20 }, oubliEbbinghaus: { cTest: 0.8 }, fievreSemmelweis: { anneeVue: 1848 }, densiteCavendish: { filChoisi: 1 }, equivalentJoule: { colonneVide: 0 }, eclipseEddington: { facteurNewton: 1 }, lynxHudson: { decalageAns: 5 }, gouttesMillikan: { gouttesMoyennees: 5 }, vieGraunt: { raisonTest: 0.45 }, loiHubble1929: { constanteTest: 200 }, loiMoseley: { numerotation: 1 }, lumiereMichelson: { correctionVide: 0 }, regressionGalton: { penteTest: 1 }, aberrationBradley: { minutesLumiere: 11 }, exclusionGause: { betaGause: 1.2 }, mortaliteNightingale: { anneeNightingale: 2 }, equivalentsFaraday: { volumeGazFaraday: 12 }, chaleursPetitDulong: { decalagePoids: 5 }, repliquesOmori: { horizonOmori: 1300 }, survieHalley: { tauxHalley: 10 }, chaleurLondres: { lissageHoward: 9 }, motsMendenhall: { queueMendenhall: 8 }, parallaxeBessel: { poidsBessel: 1.5 }, vitesseNyquist: { niveauxNyquist: 64 }, ondulationsYoung: { minutesYoung: 9 }, picLummer: { exposantLummer: 3 }, balanceCoulomb: { exposantCoulomb: 1 }, effetJoule: { exposantJouleQ: 1 }, critiqueReynolds: { exposantReynolds: 0 }, filtreDarcy: { partDessous: 0 }, deplacementsPerrin: { sigmaPerrin: 4 }, aimantGauss: { exposantGauss: 2 }, unitesWeber: { partWeber: 1 }, tubesPoiseuille: { exposantPoiseuille: 3 }, variationsHalley: { anneeHalley: 1600 }, spiralesBeal: { groupeBeal: 9 }, tempsOldham: { vitesseOldham: 10 }, fonteMacKellar: { melangeUniforme: 1 }, syllabesKaeding: { zaehlstoffKaeding: 8 }, tubesHagen: { partCarreHagen: 0 }, spiraleMoseley: { raisonMoseley: 1.3 }, poisMendel: { rapportMendel: 1 }, rayonsThomson: { facteurIThomson: 0.8 }, magnitudesPogson: { rapportPogson: 4 }, maisDarwin: { gainDarwin: 30 }, emanationRutherford: { demiVieRutherford: 120 }, etherMichelson: { vitesseEther: 0 }, reststrahlenRubens: { loiRubens: 0 }, constantesPlanck: { lambdaThetaPlanck: 0.31 }, jaugesHerschel: { champHerschel: 30 }, penduleKater: { stationOteeKater: 5 }, essaisThorndike: { moyenneThorndike: 6 }, emotionWiringHCP: { packWiring: 2, emotionWiring: 1, networkWiring: 1 }, bodyMapsNummenmaa: { guessNummenmaa: 1 }, emotionsSiegel: { emotionSiegel: 2 }, connectomeSizes: { organismeConnectome: 4 }, neuronsHerculanoHouzel: { rongeurHerculano: 0 }, allOrNoneLucas: { droiteLucas: 0 }, brainBoyd: { sexeBoyd: 2 }, glycosuriaCannon: { groupeCannon: 2 }, weberKonig: { tableKonig: 3 }, extinctionPavlov: { seriePavlov: 4 }, pressurePeirceJastrow: { groupeJastrow: 2 }, attentionCattell: { sujetCattell: 2 }, reactionDonders: { rouleauDonders: 2 }, solidesPlatoniques: { solide: 0 }, modesNormaux: { masses: 16, mode: 16 }, cordeVibrante: { pince: 0.5 }, anniversaires: { personnes: 80, jours: 50 }, equilibreChimique: { kf: 5, kb: 0.1 } };
        for (const s of TSq.SYSTEMES) for (const extra of [{}, VARIANTES[s.id]].filter(Boolean)) { const o = s.mod.simuler(s.id, { ...TSq.paramsScience(s.id).params, ...extra });
          for (const [k, v] of Object.entries(o.invariants || {})) { if (!CE.NOMS_MESURES_EN[k]) sansNom.add(k);
            if (v && typeof v === 'object' && !('mesure' in v && ('formule' in v || 'theorie' in v)) && !('derive' in v)) for (const [a, x] of Object.entries(v)) if (typeof x === 'number' && !CLES[a]) sansCle.add(a); } }
        ok(sansNom.size === 0 && sansCle.size === 0, 'toutes les mesures des ' + TSq.SYSTEMES.length + ' systemes ont leur nom et leurs cles en anglais' + (sansNom.size + sansCle.size ? ' — MANQUENT : ' + [...sansNom, ...sansCle].join(', ') : ''));
        ok(/import \* as CLESEN from '\.\/tam-cles-en\.js';/.test(onglet) && /Object\.assign\(NOMS_MESURES, CLESEN\.NOMS_MESURES_EN\);/.test(onglet) && serveur.includes("'tam-cles-en.js'"), 'le dictionnaire est importe, applique et servi'); }
      ok(/const note = CURSEURS_SANS_FORME\[S\.science\.s\.id \+ '\.' \+ cle\];/.test(onglet) && /'changes the checks below, not the drawing'/.test(onglet), 'la note est ecrite sous le curseur'); }
    const scene = onglet.slice(onglet.indexOf('const poses = [], hL'), onglet.indexOf('/* le son allume : le point qu il joue'));
    ok((scene.match(/g\.fillText\(/g) || []).length === 1 && /const ancre = d\.q\.type === 'segment' && dernier \? dernier : premier;/.test(onglet), 'dans la scene, un seul fillText (celui du placeur) ; un segment est nomme a son bout eloigne');
  }
  /* game86 (Phil : « une echelle de grandeur ») : la VRAIE table et les vraies fonctions du source, executees */
  {
    const d = onglet.indexOf('const ECHELLE_UNITE = {'), f = onglet.indexOf('/* les parametres des modules nommes en francais');
    ok(d > 0 && f > d, 'table ECHELLE_UNITE .. ecrireLongueur extraites');
    const { U, ronde, ecrire } = new Function(onglet.slice(d, f) + '\nreturn { U: ECHELLE_UNITE, ronde: longueurRonde, ecrire: ecrireLongueur };')();
    ok(ronde(37) === 20 && ronde(10) === 10 && ronde(0.0042) === 0.002 && ronde(5.5) === 5 && ronde(0) === null && ronde(NaN) === null, 'longueur ronde : 1, 2 ou 5 x 10^k au plus egale');
    ok(ecrire(20) === '20' && ecrire(0.002) === '0.002' && ecrire(5e-7) === '5e-7' && ecrire(2e9) === '2e9', 'ecriture courte de la longueur');
    const ids = new Set(TSq.SYSTEMES.map((s) => s.id)), cles = Object.keys(U);
    ok(cles.every((k) => ids.has(k)) && cles.length >= 70, 'chaque cle d ECHELLE_UNITE est un systeme reel (' + cles.length + ')');
    ok(['bigRip', 'etoilesHR', 'couplageCourant', 'evaporationTrouNoir'].every((k) => !U[k]), 'pas de barre sur un axe en echelle LOG');
    /* coherence avec la legende : une unite PHYSIQUE nommee doit l etre aussi dans la colonne 0 (sinon la barre serait sur la mauvaise colonne) */
    const LEG = await import('./tam-legendes.js'), MOTS = { AU: 'AU', pc: 'parsecs', kpc: 'kpc', Gpc: 'parsecs', mm: 'mm', m: 'm', km: 'km', fm: 'fm', s: 'seconds', rad: 'radians', 'Bohr radii': 'Bohr radii', 'Earth radii': 'Earth radii', 'solar radii': 'solar radii', 'light-seconds': 'light-seconds' };
    const faux = cles.filter((k) => MOTS[U[k][0]] && !new RegExp('\\b' + MOTS[U[k][0]].replace('-', '\\-') + '\\b').test((LEG.legende(k, {}).colonnes || [])[0] || ''));
    ok(faux.length === 0, 'unite physique de la barre = celle de la colonne 0 de la legende' + (faux.length ? ' : ' + faux.join(', ') : ''));
    ok(/function barreEchelle\(\)/.test(onglet) && /\{ const be = barreEchelle\(\); if \(be\) objs\.push\(be\.objet\); \}/.test(onglet) && /\{ k: 'Scale', v: 'the drawing is about '/.test(onglet), 'la barre passe par le decor (meme transformation) et la carte dit la largeur');
    /* game87 : le centre Mandelbrot pose SUR la frontiere — la vraie fonction, executee : le point rendu s echappe, un voisin a 1e-9
     *   ne s echappe pas (c est une frontiere), il reste dans les bornes du module (vu au banc : (-0.75, 0) partait a -2.000... hors bornes) */
    const dm = onglet.indexOf('const dansMandelbrot = '), fm = onglet.indexOf('const longueurRonde = ');
    const { dans, bord } = new Function(onglet.slice(dm, fm) + '\nreturn { dans: dansMandelbrot, bord: bordMandelbrot };')();
    for (const [cx, cy] of [[-0.75, 0.1], [-0.75, 0], [0.3, 0.6], [-1.2, 0.3], [0, 0], [0.9, -1.4]]) {
      const b = bord(cx, cy); ok(b && b[0] >= -2 && b[0] <= 1 && b[1] >= -1.5 && b[1] <= 1.5, 'bord(' + cx + ', ' + cy + ') dans les bornes du module');
      let voisinDedans = false; for (let k = 0; k < 16 && !voisinDedans; k++) { const a = 2 * Math.PI * k / 16; voisinDedans = dans(b[0] + 1e-9 * Math.cos(a), b[1] + 1e-9 * Math.sin(a), 5000); }
      ok(!dans(b[0], b[1], 5000) && voisinDedans, 'bord(' + cx + ', ' + cy + ') = un point qui s echappe a cote d un point qui ne s echappe pas (frontiere a 1e-9)');
    }
    ok(/id: 'tamBord'/.test(onglet) && /bBord\.hidden = !\(S\.science && S\.science\.s\.id === 'mandelbrot'\);/.test(onglet) && /Math\.min\(1000, Math\.round\(200 \+ 200 \* Math\.log10/.test(onglet), 'bouton visible sur Mandelbrot seulement ; maxIter releve avec le zoom (plafond 1000 = borne du module)');
  }
  /* game82 (Phil : « cost not read yet ») : les decimals de TOUTE la liste, pas seulement des jetons tenus */
  const appD = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
  ok(/decimales: async \(\) => \{ const file = payerListees\(\)\.filter\(\(l\) => !payer\.dec\.has\(l\.jeton\)\);[^\n]*await decimalesPayer\(l\)/.test(appD)
    && !/if \(P\.decimales\) await P\.decimales\(\);/.test(onglet) && !/\boptionsPayer\b/.test(onglet),
    'app : le cout lu pour toute la liste ; game375 (Phil 2026-11-12) : l onglet TAM n a plus de « Pay with » (le Mint paie 5 USDC)');
}

/* ── 8. (2026-11-01, Phil 31/10) LES VARIABLES : joueur et cerveau ── */
{
  const egauxO = (a, b) => a instanceof Uint8Array && b instanceof Uint8Array && a.length === b.length && a.every((x, i) => x === b[i]);
  const structures = [
    T.structurer({ famille: 'lorenz', operateur: 'couplage', copies: 4 }),
    T.structurer({ famille: 'lorenz96', operateur: 'seul', dim96: 9 }),
    T.structurer({ famille: 'dadras', operateur: 'somme', motif: { famille: 'ifs', variante: 'fougere' } }),
    T.structurer({ famille: 'clifford', operateur: 'composition', motif: { famille: 'julia' } }),
    ch.params,
  ];
  ok(T.generer(structures[0]).D === 12 && T.generer(structures[1]).D === 9, 'dimension reglable jusqu a 12 (4 copies couplees = 12-D ; Lorenz-96 a 9 variables)');
  /* (a) UN curseur ecrit SON parametre, et rien d autre */
  let curseursVus = 0;
  for (const P of structures) {
    const R = T.reglagesDe(P);
    for (const r of R) {
      const v = r.min + (r.max - r.min) * 0.3141592653;
      const Q = T.appliquerReglage(P, r.chemin, v);
      const R2 = T.reglagesDe(Q), autres = R2.filter((x) => x.chemin !== r.chemin), avant = R.filter((x) => x.chemin !== r.chemin);
      const lui = R2.find((x) => x.chemin === r.chemin);
      ok(Math.abs(lui.valeur - v) <= 1e-6 && autres.every((x, i) => x.valeur === avant[i].valeur && x.chemin === avant[i].chemin),
        'curseur ' + P.famille + '/' + P.operateur + ' ' + r.chemin + ' ecrit SA variable (' + lui.valeur + ') et aucune autre');
      const { params: _a, angles: _b, eps: _c, w: _d, regle: _e, ...restP } = P, { params: _f, angles: _g, eps: _h, w: _i, regle: _j, ...restQ } = Q;
      ok(T.canon(restP) === T.canon(restQ), 'curseur ' + r.chemin + ' : la structure (famille, operateur, motif, graine, minteur) intacte');
      curseursVus++;
    }
    const hors = T.appliquerReglage(P, R[0].chemin, R[0].max * 10 + 10);
    ok(T.reglagesDe(hors).find((x) => x.chemin === R[0].chemin).valeur === R[0].max, 'curseur au-dela de sa borne : ramene a la borne (' + R[0].chemin + ')');
  }
  ok(curseursVus >= 30, curseursVus + ' curseurs verifies');
  /* (b) une oeuvre reglee se REJOUE aux memes octets (octets generes depuis les params ARRONDIS) */
  for (const P of structures) for (const r of T.reglagesDe(P).slice(0, 3)) {
    const x = V.oeuvreReglee(P, r.chemin, r.min + (r.max - r.min) * 0.123456789123);
    if (!x.octets) continue;
    const rj = T.rejouer(JSON.parse(JSON.stringify(x.params)));
    ok(rj.ok && egauxO(rj.octets, x.octets), 'reglage ' + P.famille + ' ' + r.chemin + ' : rejouer(JSON des params) = les octets du curseur, octet pour octet');
  }
  /* (c) le cerveau bouge des variables : DETERMINISTE, dit ce qu il a bouge, de a vers b */
  const E1 = { cerveau: { adresse: UNIT, battement: 24 }, empreinteEtat: c1.empreinteEtat }, E2 = { cerveau: { adresse: IB022, battement: 24 }, empreinteEtat: cI.empreinteEtat };
  for (const P of structures) {
    const a = T.coupDePouce(P, E1), b = T.coupDePouce(JSON.parse(JSON.stringify(P)), JSON.parse(JSON.stringify(E1)));
    ok(T.canon(a.params) === T.canon(b.params) && a.mouvements.length >= 1, 'coup de pouce ' + P.famille + ' : meme etat, memes params -> meme reglage (' + a.mouvements.map((m) => m.chemin).join(',') + ')');
    for (const m of a.mouvements) ok(T.reglagesDe(a.params).find((x) => x.chemin === m.chemin).valeur === m.a && m.a !== m.de, 'coup de pouce : ' + m.chemin + ' vaut ce que la carte dit (' + m.de + ' -> ' + m.a + ')');
    ok(a.params.reglage && a.params.reglage.par === 'cerveau' && a.params.reglage.mouvements.length === a.mouvements.length, 'le reglage dit qu il vient du cerveau');
    const rj = T.rejouer(JSON.parse(JSON.stringify(a.params)));
    ok(rj.ok === T.generer(a.params).bornee && (!rj.ok || egauxO(rj.octets, T.encoderOeuvre(T.generer(a.params)))), 'coup de pouce : l oeuvre se rejoue aux memes octets');
  }
  const d1 = structures.map((P) => T.canon(T.coupDePouce(P, E1).params)), d2 = structures.map((P) => T.canon(T.coupDePouce(P, E2).params));
  ok(d1.some((x, i) => x !== d2[i]), 'un autre etat du cerveau bouge autre chose');
  const ph = V.phraseMouvements([{ nom: 'b', de: 2.7, a: 2.9123 }, { nom: 'coupling', de: 0.2, a: 0.25 }]);
  ok(ph === 'The brain moved b from 2.700 to 2.912 and coupling from 0.200 to 0.250.', 'la carte : « ' + ph + ' »');
  const Pb = T.coupDePouce(structures[0], E1).params;
  ok(V.carte({ P: Pb, c: null }).find((x) => x.k === 'Tuned').v.startsWith('The brain moved '), 'la carte d une oeuvre poussee par le cerveau le dit');
  /* (d) chaque reglage passe les MEMES certificats ; un refus dit SA raison */
  const cycle = T.appliquerReglage(T.structurer({ famille: 'lorenz' }), 'params.r', 14);
  const cc1 = T.certifierReglage(cycle, []);
  ok(!cc1.ok && cc1.codes.includes('CYCLE') && /simple cycle/.test(V.verdictReglage(cc1).texte), 'Lorenz r=14 (dans les bornes) : refuse, « simple cycle » (' + V.verdictReglage(cc1).texte + ')');
  const hors = T.certifierReglage({ ...T.structurer({ famille: 'lorenz' }), n: 20000 }, []);
  ok(!hors.ok && hors.codes.includes('HORS_BORNES') && /outside the allowed range/.test(V.verdictReglage(hors).texte), 'n = 20000 (calcul plus long commande) : refuse hors bornes');
  ok(!T.certifierReglage({ ...T.structurer({ famille: 'lorenz' }), params: { s: 10, r: 100, b: 8 / 3 } }, []).ok, 'r = 100 (hors bornes) : refuse');
  const bon = T.certifierReglage(T.structurer({ famille: 'lorenz' }), []);
  ok(bon.ok && bon.octets instanceof Uint8Array, 'Lorenz par defaut, regle : certifie');
  const doublon = T.certifierReglage(T.structurer({ famille: 'lorenz' }), [bon.signature]);
  ok(!doublon.ok && doublon.codes.includes('DOUBLON') && /too close to an existing work/.test(V.verdictReglage(doublon).texte), 'le meme reglage qu une oeuvre existante : « too close to an existing work »');
  ok(/flat/.test(V.CODES_EN.PLAT) && /escapes to infinity/.test(V.CODES_EN.DIVERGE) && /simple cycle/.test(V.CODES_EN.CYCLE_LONG), 'les raisons a l ecran : flat, escapes to infinity, simple cycle');
  /* (e) LE portail du mint : rien ne passe sans certificats locaux ET serveur sur les MEMES octets, pour CE wallet */
  const moi = '0x' + 'ab'.repeat(20), Pm = { ...T.structurer({ famille: 'lorenz' }), minteur: moi }, cm = T.certifierReglage(Pm, []);
  const sOk = { ok: true, etat: 'CERTIFIE', hash: keccak256Hex(cm.octets) };
  const porte = (o) => V.peutMinter({ dep: DEP, local: cm, serveur: sOk, octets: cm.octets, P: Pm, compte: moi, ...o });
  ok(porte({}).ok === true, 'portail : tout certifie -> ouvert');
  ok(porte({ local: cc1 }).ok === false, 'portail : certificat local refuse -> ferme');
  ok(porte({ local: hors }).ok === false, 'portail : hors bornes -> ferme');
  ok(porte({ serveur: null }).ok === false && porte({ serveur: { ...sOk, etat: 'NON_LU', ok: false } }).ok === false && porte({ serveur: { ...sOk, etat: 'REFUSE', ok: false } }).ok === false, 'portail : serveur absent / NON_LU / REFUSE -> ferme');
  ok(porte({ serveur: { ...sOk, hash: '0x' + '00'.repeat(32) } }).ok === false, 'portail : serveur a certifie d autres octets -> ferme');
  ok(porte({ compte: '0x' + 'cd'.repeat(20) }).ok === false && porte({ P: { ...Pm, minteur: undefined } }).ok === false, 'portail : autre wallet, ou oeuvre tiree pour personne -> ferme');
  ok(porte({ dep: VIERGE }).ok === false, 'portail : TamArt non deploye -> ferme');
  /* le serveur certifie une oeuvre reglee (memes certificats, distance aux mintees) */
  const b64 = (P) => Buffer.from(JSON.stringify(P), 'utf8').toString('base64url');
  const sv = await srv.certifierParams(b64(Pm));
  ok(sv.ok && sv.etat === 'CERTIFIE' && sv.hash === keccak256Hex(cm.octets) && sv.signature === undefined, '/api/tam/certifier : oeuvre reglee CERTIFIEE, hash des memes octets');
  const sv2 = await srv.certifierParams(b64(cycle));
  ok(!sv2.ok && sv2.etat === 'REFUSE' && sv2.codes.includes('CYCLE'), '/api/tam/certifier : un cycle est REFUSE avec sa raison');
  ok((await srv.certifierParams(b64({ ...Pm, n: 50000 }))).codes.includes('HORS_BORNES') && (await srv.certifierParams('%%%')).etat === 'REFUSE' && (await srv.certifierParams(Buffer.from('x'.repeat(5000)).toString('base64url'))).etat === 'REFUSE', '/api/tam/certifier : hors bornes, illisible, trop long -> REFUSE');
  /* (f) l onglet est cable sur CES fonctions (presence ; le comportement est prouve ci-dessus) */
  ok(/V\.peutMinter\(\{ dep: EP\.TAM_DEPLOIEMENT, local: c0, serveur, octets: oct, P: P0, compte: c \}\)/.test(onglet) && /if \(!porte\.ok\) \{ dit\.textContent = 'Not ready: '/.test(onglet), 'preparerMint passe par V.peutMinter avant toute lecture du contrat');
  ok(/const vb = S\.P\.regle \? M\.validerReglage\(S\.P\)/.test(onglet) && /S\.c && S\.c\.ok\);/.test(onglet), 'une oeuvre reglee : bornes puis certificats ; pas de zone Mint sans certificat local');
  /* game128 (Phil 04/11 : « retire Let the brain nudge it, il y a deja un bouton pour le cerveau ») : le bouton n existe plus ; M.coupDePouce reste prouve plus haut */
  /* game129 : le poids d un melange de science a son curseur, aux bornes du moteur, et il repasse par chargerScience (donc les certificats) */
  ok(/id: 'tamPoids', min: String\(M\.BORNES\.w\[0\]\), max: String\(M\.BORNES\.w\[1\]\)/.test(onglet) && /melange: mel, origine: ori \}\), 90\);\n  \}\);/.test(onglet) && /rangPoids\.hidden = !S\.P\.melange;/.test(onglet), 'game129 : curseur du poids de melange (bornes BORNES.w, recharge certifiee, cache sans melange)');
  /* game130 : les reglages du partenaire passent par SON module (valeurs gardees) et repartent par chargerScience (certificats) ; aux defauts, params omis */
  ok(/id: 'tamVoletPartenaire'/.test(onglet) && /sp\.mod\.reglagesPhysique\(m\.science, voulu\)/.test(onglet) && /if \(JSON\.stringify\(borne\) !== JSON\.stringify\(/.test(onglet) && /chargerScience\(id, base, \{ melange: mel, origine: ori \}\), 120\)/.test(onglet), 'game130 : volet des reglages du partenaire (bornes du module, params omis aux defauts, recharge certifiee)');
  ok(/V\.oeuvreReglee\(/.test(onglet) && !/tamPouce|Let the brain nudge it|bPouce/.test(onglet) && /data-chemin/.test(onglet), 'curseurs -> V.oeuvreReglee ; plus de bouton « nudge » (le cerveau choisit par son propre bouton)');
  ok(/'\/api\/tam\/choix\?draw=' \+ tirage \+ \(c \? '&minter=' \+ c : ''\)/.test(onglet) && /q\.get\('minter'\), ipT, q\.get\('draw'\)/.test(serveur) && /crypto\.getRandomValues\(new Uint8Array\(8\)\)/.test(onglet) && /chemin === '\/api\/tam\/certifier'/.test(serveur), 'le wallet est transmis au choix ; la route /api/tam/certifier existe');
  /* 2026-11-01 : le cerveau du block de l onglet Brain choisit (bascule vers UNIT), passe au serveur par &block= */
  ok(/\(src \? '&block=' \+ src : ''\)/.test(onglet) && /const src = sourceCerveau\(\);/.test(onglet) && /const sourceCerveau = \(\) => \(ADR_OK\.test\(selBloc\.value\) \? selBloc\.value : null\);/.test(onglet), 'game79 : le block CHOISI dans « Brain of » (n importe lequel) est passe au choix (&block=) ; vide = UNIT');
  /* game79 : le selecteur propose UNIT, le block de l onglet Brain, ceux de la Map, et la recherche B20 */
  const appH79 = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
  ok(/blocsCarte: \(\) =>/.test(appH79) && /chercherBlocs: async \(q\) =>/.test(appH79) && /\['', 'UNIT \(default brain\)'\]/.test(onglet) && /' · on your Map'/.test(onglet), '« Brain of » : UNIT, onglet Brain, Map, recherche');
  /* game79 : la bulle des vraies valeurs (survol / tap), les valeurs vivantes du cerveau (< 30 s), le tirage sur TOUS les genres */
  ok(/function peindreBulle\(i, x, y, larg\)/.test(onglet) && /b\[i \* D \+ j\]/.test(onglet) && /survolScene\(e\);\n    ptrs\.delete/.test(onglet), 'bulle : valeurs brutes du point, au survol et au tap');
  ok(/Date\.now\(\) - brainVuA > 30000/.test(appH79) && /' \(rebuilt on the server when it drew\)'/.test(onglet) && /' · now live: '/.test(onglet), 'valeurs : l etat qui a DESSINE, puis « now live » seulement pour un battement de moins de 30 s (revue game79)');
  const tamSrv79 = readFileSync(new URL('./tam-serveur.js', import.meta.url), 'utf8');
  ok(/if \(tirage && genre >= PORTEUSES\.length\)/.test(tamSrv79) && /SCIENCES_HORS_CHOIX = new Set\(\[\]\)/.test(tamSrv79) && /if \(c\.ok\) c\.note = noteCerveau\(/.test(tamSrv79) && /\+ ':' \+ \(tirage \|\| '-'\);/.test(tamSrv79),
    'le cerveau tire attracteurs ET toutes les sciences (fusion bornee par coutFusion) ; la note DANS la garde CPU ; le tirage dans la cle du cache');
  const appHtml = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
  ok(/blocCerveau: \(\) => \{ try \{ return brainAdr; \}/.test(appHtml), 'l app donne a TAM le block ouvert dans l onglet Brain (brainAdr)');
  ok(/id="bArtTam"/.test(appHtml) && /api\.choisirDepuisBloc\(\)/.test(appHtml) && /choisirDepuisBloc = \(\) => \{ S\.sourceBloc = true; peindreSource\(\); const a = blocVu\(\); if \(a\) selBloc\.value = a; bCerveau\.click\(\); \}/.test(onglet), 'Brain : « Make art from this block’s brain » ouvre TAM avec CE cerveau (game79 : tous les genres)');
  /* chaos : chaque variable passe par M.appliquerReglage (bornee, arrondie), puis regler -> memes certificats */
  ok(/Q = M\.appliquerReglage\(Q, r\.chemin, r\.valeur \+ \(u\[i\] \/ 4294967296 \* 2 - 1\) \* k \* \(r\.max - r\.min\) \/ 2\)/.test(onglet) && /regler\(sans\);\n    verdictTxt\.textContent = 'Chaos '/.test(onglet), 'chaos : bornes + arrondi par appliquerReglage, puis regler (certificats)');
  { let Q = { ...ch.params }; for (const r of T.reglagesDe(Q)) Q = T.appliquerReglage(Q, r.chemin, r.valeur + 1e9); ok(T.reglagesDe(Q).every((r) => r.valeur <= r.max + 1e-9), 'chaos maximal : chaque variable reste dans sa borne'); }
  /* le son suit le point montre (tete puis curseur), plus un index qui avance d un point par image */
  ok(/S\.tete = Math\.max\(0, Math\.floor\(S\.dessines\) - 1\)/.test(onglet) && /S\.ser\[j\]\[i\]/.test(onglet) && !/idx = \(idx \+ 1\) % S\.n/.test(onglet), 'son : la frequence lit le point dessine, pas un compteur d images');
  ok(/el\('h2', \{ text: 'Tokenized Art Math' \}\)/.test(onglet), 'titre : Tokenized Art Math');
  /* game77 : la chasse aux bugs (chaque correctif a son temoin) */
  { const Pc = T.structurer({ famille: 'lorenz', operateur: 'composition', motif: { famille: 'julia' } });
    ok(T.rejouer(T.appliquerReglage(Pc, 'w', 0.1)).hash !== T.rejouer(T.appliquerReglage(Pc, 'w', 0.6)).hash, 'composition : le curseur « blend weight » change l oeuvre (avant : meme hash)'); }
  { const d = T.nuageMap(T.structurer({ famille: 'dejong' }), 40000); ok(d && d.length === 80000 && d.every(Number.isFinite), 'De Jong : 40 000 iterations pour la VUE');
    ok(T.nuageMap(T.structurer({ famille: 'lorenz' })) === null, 'nuageMap : rien pour un attracteur continu'); }
  ok((onglet.match(/if \(S\.son\) arreterSon\(\);/g) || []).length >= 4, 'le son est coupe a chaque nouvelle oeuvre (D change : plus de plantage par image)');
  ok(/M\.combinerVue\(vif, S\.P\)/.test(onglet) && /const nuageStocke = S\.P\.ordre === 1;/.test(onglet), 'vue vivante : le melange garde son motif ; un nuage se dessine dans l ordre du temps');
  ok(/if \(entierReglage\(r\)\) \{ v = Math\.round\(v\); if \(k > 0 && v === r\.valeur\)/.test(onglet), 'chaos : un parametre entier bouge au moins d un cran');
  ok(/R\.filter\(\(r\) => r\.nom !== 'G4'\)/.test(onglet) && /max: Math\.max\(0, params\.n - 1\)/.test(onglet), 'curseurs morts retires : G4 a 3 tourbillons, l <= n-1');
  { const TSm = await import('./tam-science.js'); const z = TSm.standardiserIso(Float64Array.from([0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0]), 4, 3);
    ok(Math.abs(z[3] - z[0]) > 0.5 && [1, 2, 4, 5, 7, 8, 10, 11].every((i) => z[i] === 0), 'science : echelle commune (un axe plat reste plat, il n est pas gonfle)'); }
  /* game76 : les sciences en direct — modules SERVIS (sinon page morte), vue seule (jamais de Mint), unites en anglais */
  ok(/'tam-physique\.js', 'tam-sciences\.js', 'tam-fluides\.js'/.test(serveur), 'les 3 modules de science sont dans la liste servie');
  /* ⛔ corrige le 01/11 : TamArt v1 ne connait pas la famille (octet 4 = q) — une science se minte, par le MEME portail */
  ok(/V\.mintVisible\(EP\.TAM_DEPLOIEMENT\) && !!\(\(S\.choix \|\| \(S\.P && S\.P\.regle\) \|\| S\.science\) && S\.octets && S\.c && S\.c\.ok\)/.test(onglet), 'une science montre le Mint seulement avec ses octets et son certificat local');
  ok(/'par radian d orbite': 'per radian of orbit'/.test(onglet) && /uniteEn\(o\.uniteLyapunov\)/.test(onglet), 'les unites des modules sont dites en anglais a l ecran');
  { const fichiers = ['./tam-physique.js', './tam-sciences.js', './tam-fluides.js', './tam-astro.js', './tam-cosmos.js', './tam-invisible.js', './tam-quantique.js',
    './tam-fusion.js', './tam-grandes-questions.js', './tam-grandes-questions-2.js', './tam-champs-quantiques.js', './tam-vide-quantique.js', './tam-theories-2.js', './tam-theories-3.js', './tam-biologie.js', './tam-chimie.js', './tam-maths.js', './tam-ondes.js', './tam-electricite.js', './tam-mecanique.js'];
    { const cq = (await import('./tam-champs-quantiques.js')).SYSTEMES.map((s) => s.id); ok(cq.every((id) => onglet.includes("'" + id + "'")) && /\['champs', 'Quantum fields, the vacuum, atoms & quarks'\]/.test(onglet), 'game81 : les ' + cq.length + ' champs quantiques ont leur groupe'); }
    ok(serveur.includes("'tam-legendes.js'"), 'tam-legendes.js est dans la liste servie');
    /* game97 : les figures classiques plates partent de face ; la scene ET les gestes partent de la meme base */
    ok(/const DE_FACE = new Set\(\['logistique', 'galton', 'brachistochrone',/.test(onglet) && /'dogmeCentral', 'deriveGenetique', 'enzyme', 'mendel', 'neurone', 'reactionsChaine'/.test(onglet) && /const cam = S\.cam \|\| camBase\(\), pos = positions\(\)/.test(onglet)
      && !/navGesture\(S\.cam, CAM0,/.test(onglet), 'game97 : vue de face pour bifurcation, Galton, brachistochrone (scene et gestes)');
    /* game98 : recadrage — une SEULE projection dans la scene (donnees, corps central, decor, echelle) ; on ne fait que reduire */
    ok((onglet.match(/projectCam\(/g) || []).length === 2 && /const ecran = \(p\) => projeter\(/.test(onglet) && /S\.ajuste = m > 0 \? Math\.min\(4, 1 \/ m\) : 1;/.test(onglet)
      && /S\.cam = null; S\.ajuste = null;/.test(onglet) && /const CAM0 = \{ yaw: 0\.6, pitch: 0\.35, dist: 4,/.test(onglet),
      'game98 : camera a dist 4 (perspective douce), recadrage par une seule projection (remplit, au plus 4 x), refait par Reset view');
    /* game101 : dezoom propre a TAM (x 1.15 par cran, 0.5 a 60) ; la molette et le pincement n appellent plus zoomCam (borne 6) */
    ok(/const DIST_MIN = 0\.5, DIST_MAX = 60;/.test(onglet) && /S\.cam = zoomTam\(S\.cam, Math\.sign\(e\.deltaY\)\)/.test(onglet)
      && /S\.cam = zoomTam\(S\.cam, \(pinch - d\) \/ 30\)/.test(onglet) && !/dz:/.test(onglet.replace(/dx\/dt = dy\/dt = dz\/dt/, '')), 'game101 : dezoom jusqu a dist 60, molette et pincement');
    /* game100 : precession exacte RG ; formule approchee et mesure statistique le disent */
    ok(/k0 === 'precession' && typeof v\.exacte === 'number'/.test(onglet) && /' vs exact GR ' \+ nb4\(v\.exacte\)/.test(onglet)
      && /' \(approximate formula: ' \+ v\.approchee \+ '\)'/.test(onglet) && /' \(statistical, ± ' \+ nb4\(v\.sigma\) \+ '\)'/.test(onglet), 'game100 : Check exact / approche / statistique');
    /* game99 : la barre d echelle choisit sa longueur ronde sur les pixels par unite MESURES (et le texte dit cette longueur-la) */
    ok(/const parUnite = d\.q\.longueur > 0 \? l0 \/ d\.q\.longueur : 0;/.test(onglet)
      && /Lr = parUnite > 0 \? longueurRonde\(Math\.min\(0\.2 \* Wc \/ parUnite, d\.q\.etendue > 0 \? d\.q\.etendue : Infinity\)\) : null, l = Lr \? Lr \* parUnite : 0;/.test(onglet)
      && /const te = '≈ ' \+ ecrireLongueur\(Lr\) \+ ' ' \+ d\.q\.unite;/.test(onglet), 'game99 : barre d echelle adaptee a l ecran, jamais plus longue que les donnees, texte = la longueur dessinee');
    const mods = await Promise.all(fichiers.map((f) => import(f)));
    const tous = mods.flatMap((m) => m.SYSTEMES.map((s) => [m, s]));
    ok(tous.length >= 55, 'game78 : au moins 55 systemes de science (7 modules) : ' + tous.length);
    for (const f of fichiers) ok(serveur.includes("'" + f.slice(2) + "'"), f + ' est dans la liste servie');
    /* chaque systeme est dans un groupe du menu (aucun orphelin) */
    /* 2026-11-07 : information, terre et humanite avaient leur liste THEMES.x et leur entree GROUPES mais groupeDe ne les testait jamais :
     *   trois groupes VIDES en prod depuis game218. Toute liste THEMES.x creee doit etre testee par groupeDe (physique = groupe par defaut). */
    { const corpsGroupe = (onglet.match(/const groupeDe = \(s\) =>[\s\S]*?: 'physique';/) || [''])[0];
      const listes = [...new Set([...onglet.matchAll(/THEMES\.([a-zA-Z]+) = \[/g)].map((m) => m[1]).concat([...(onglet.match(/const THEMES = \{[\s\S]*?\n\};/) || [''])[0].matchAll(/^  ([a-zA-Z]+): \[/gm)].map((m) => m[1])))].filter((k) => k !== 'physique' && onglet.includes("['" + k + "', "));
      const oublies = listes.filter((k) => !corpsGroupe.includes('THEMES.' + k + '.includes(s.id)'));
      ok(corpsGroupe.length > 0 && listes.length >= 13 && oublies.length === 0, 'groupeDe teste chaque liste THEMES du menu (' + listes.length + ' listes) ; oubliees : ' + oublies.join(', ')); }
    ok(/const groupeDe = \(s\) => THEMES\.electricite\.includes\(s\.id\) \? 'electricite' : THEMES\.ondes\.includes\(s\.id\) \? 'ondes' : THEMES\.maths\.includes\(s\.id\) \? 'maths' : THEMES\.chimie\.includes\(s\.id\) \? 'chimie' : THEMES\.biologie\.includes\(s\.id\) \? 'biologie' : THEMES\.theories\.includes\(s\.id\) \? 'theories' : THEMES\.champs\.includes\(s\.id\) \? 'champs' : THEMES\.questions\.includes\(s\.id\) \? 'questions' : THEMES\.astres\.includes\(s\.id\)/.test(onglet) && /\['astres', 'Stars & our space'\]/.test(onglet)
      && /\['theories', 'Classic theories: magnets, life, chaos, heat, chance, waves'\]/.test(onglet) && /\['questions', 'Big questions: space, quantum, Earth'\]/.test(onglet)
      && /\['biologie', 'Life sciences: DNA, RNA, genes, enzymes, neurons'\]/.test(onglet) && /\['chimie', 'Chemistry: reactions, equilibrium, clocks, gases'\]/.test(onglet) && /\['maths', 'Mathematics: chance, primes, random walks'\]/.test(onglet) && /\['ondes', 'Waves, light & sound'\]/.test(onglet) && /\['electricite', 'Electricity: charges, fields, circuits'\]/.test(onglet), 'menu : groupes par theme (grandes questions, astres, trous noirs, ...)');
    /* 2026-11-07 : un systeme range dans THEMES.x doit ATTERRIR dans x : si une liste testee plus tot par groupeDe le contient aussi,
     *   il s affiche ailleurs. On reconstruit THEMES depuis le source (litteral + affectations + push) et on rejoue l ordre de groupeDe. */
    { const lit = (onglet.match(/const THEMES = \{[\s\S]*?\n\};/) || [''])[0].replace('const THEMES =', 'return');
      const TH = new Function(lit)(); for (const m of onglet.matchAll(/^THEMES\.([a-zA-Z]+)(?: = (\[[\s\S]*?\]);|\.push\(([^;]*)\);)/gm)) {
        if (m[2]) TH[m[1]] = new Function('return ' + m[2])(); else TH[m[1]].push(...new Function('return [' + m[3] + ']')()); }
      const corps = (onglet.match(/const groupeDe = \(s\) =>[\s\S]*?: 'physique';/) || [''])[0], ordre = [...corps.matchAll(/THEMES\.([a-zA-Z]+)\.includes\(s\.id\)/g)].map((m) => m[1]);
      const mal = []; let total = 0; for (const [g, ids] of Object.entries(TH)) { if (g === 'physique') continue; for (const id of ids) { total++; const premier = ordre.find((k) => TH[k] && TH[k].includes(id)); if (premier !== g) mal.push(id + ' (voulu ' + g + ', obtenu ' + premier + ')'); } }
      ok(total >= 190 && mal.length === 0, 'chaque systeme d une liste THEMES atterrit dans son groupe (' + total + ' systemes) ; mal classes : ' + mal.join(', ')); }
    /* game112 (vu a l ecran : « Speed: measured 0.0715 » — ma cle vitesse etait redefinie plus bas dans la MEME table, la derniere
     *   gagne en silence ; game111 : « A » et « k » deja pris) : aucune cle en double dans les tables de noms anglais */
    { const t = readFileSync(new URL('./tam-cles-en.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''), doublons = [];
      for (const bloc of t.split('export const').slice(1)) { const vus = new Set(); for (const m of bloc.matchAll(/(?:^|[{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:\s*['"]/gm)) { if (vus.has(m[1])) doublons.push(bloc.trim().split(/\s/)[0] + '.' + m[1]); vus.add(m[1]); } }
      ok(doublons.length === 0, 'game112 : aucune cle en double dans tam-cles-en.js (la derniere ecraserait la premiere en silence) : ' + (doublons.join(', ') || 'aucune'));
      /* game125 (sonde : la cle « tau » definie DEUX fois dans NOMS_PARAMS_EN, le curseur du neurone disait « ... = R C ») : meme garde pour
       *   la table des noms de curseurs */
      const i2 = onglet.indexOf('const NOMS_PARAMS_EN = {'), j2 = onglet.indexOf('};', i2), bloc2 = onglet.slice(i2, j2).replace(/\/\*[\s\S]*?\*\//g, ''), vus2 = new Set(), doublons2 = [];
      for (const m of bloc2.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:\s*['"]/g)) { if (vus2.has(m[1])) doublons2.push(m[1]); vus2.add(m[1]); }
      ok(doublons2.length === 0, 'game125 : aucune cle en double dans NOMS_PARAMS_EN : ' + (doublons2.join(', ') || 'aucune'));
      /* game129 : chaque nom de curseur PROPRE a un systeme vise un systeme et un parametre qui existent (une faute de frappe y serait muette) */
      const i3 = onglet.indexOf('const NOMS_PARAMS_SYS = {'), j3 = onglet.indexOf('};', i3), TSx = await import('./tam-science.js'), faux = [];
      for (const m of onglet.slice(i3, j3).matchAll(/'([A-Za-z0-9]+)\.([A-Za-z0-9]+)'\s*:/g)) { const sy = TSx.systeme(m[1]); if (!sy || !(m[2] in sy.params)) faux.push(m[1] + '.' + m[2]); }
      ok(i3 > 0 && faux.length === 0 && /nomParam\(S\.science\.s\.id, cle\) \|\| r\.nom\) \+ ': '/.test(onglet), 'game129 : noms de curseur par systeme valides et branches : ' + (faux.join(', ') || 'aucun faux')); }
    /* game80 : aucun systeme orphelin — chaque id des grandes questions est range dans son groupe */
    { const gq = [...(await import('./tam-grandes-questions.js')).SYSTEMES, ...(await import('./tam-grandes-questions-2.js')).SYSTEMES].map((s) => s.id);
      ok(gq.every((id) => onglet.includes("'" + id + "'")), 'les ' + gq.length + ' grandes questions sont toutes dans THEMES.questions'); }
    /* game80 : fins dessinees, film (debuts/tailles), puces par corps, vitesse du trace, legende */
    ok(/S\.o\.fin && !Array\.isArray\(S\.o\.fin\)/.test(onglet) && /'end · ' \+ fin\.evenement/.test(onglet), 'une fin physique (capture…) est nommee sur le trace');
    ok(/Array\.isArray\(f\.debuts\) && Array\.isArray\(f\.tailles\)/.test(onglet) && /film\.debuts\[q\]/.test(onglet), 'film : images de tailles inegales (debuts/tailles) supportees');
    ok(/'data-corps': String\(b\)/.test(onglet) && /if \(S\.corpsActifs && !S\.corpsActifs\[b\]\) continue;/.test(onglet), 'une puce par corps, un corps cache n est pas trace');
    ok(/S\.n \* dt \/ \(Number\(selVitesse\.value\) \|\| 6\)/.test(onglet), 'la vitesse du trace pilote le dessin jusqu au dernier point');
    ok(/import\('\.\/tam-legendes\.js'\)\.then\(\(m\) => \{ S\.leg = m;/.test(onglet), 'la legende est chargee a part (son absence n empeche rien)');
    /* game82 : le lien de partage (sans wallet ni note) et l export CSV des valeurs brutes, colonnes nommees par la legende */
    ok(/const \{ minteur: _m, note: _n, graine: _g, \.\.\.P \} = S\.P; return \{ k: 'sci', p: P \};/.test(onglet) && /#tam=\(\[A-Za-z0-9_-\]\{1,8000\}\)/.test(onglet), 'lien : ni wallet, ni note, ni graine ; format borne');
    ok(/optionsDims\(\); if \(!ouvrirLien\(\)\) depuisExplorateur\(\);/.test(onglet) && /#tam=\/\.test\(location\.hash/.test(readFileSync(new URL('./app.html', import.meta.url), 'utf8')), 'un lien #tam= rouvre l oeuvre et ouvre l onglet');
    ok(/r\.push\(b\[i \* D \+ j\]\)/.test(onglet) && /L\.colonnes\.length === D \? L\.colonnes : null/.test(onglet), 'CSV : valeurs BRUTES, colonnes de la legende quand elles correspondent');
    for (const [m, s] of tous) { const o = m.simuler(s.id, {}); ok(o.bornee && o.brut && o.brut.length === o.n * o.D && o.D >= 3 && o.D <= 12, s.id + ' : borne, n*D valeurs, 3..12 dimensions'); } }
  const textes = [...(onglet + readFileSync(new URL('./tam-vue.js', import.meta.url), 'utf8')).matchAll(/'([^'\n]*)'/g)].map((m) => m[1]).join('\n');
  ok(!/\binfinite\b|\bunlimited\b|\bendless\b/i.test(textes.replace(/vast, not infinite/g, '')) && /vast, not infinite/.test(textes), 'mots : « vast », jamais « infinite » (sauf pour dire « not infinite »)');
}

/* ── 9. (2026-11-01, coordinateur) LA GARDE CPU : au plus 2 calculs TAM en cours (503 OCCUPE sans calculer), 20 par IP et par minute (429),
 *   un cache touche ne compte pas ; l app le dit et ne relance rien seule. ── */
{
  const { TAM_CALCULS_MAX, TAM_BUDGET_IP_MINUTE } = await import('./tam-serveur.js');
  ok(TAM_CALCULS_MAX === 2 && TAM_BUDGET_IP_MINUTE === 20, 'plafonds : 2 calculs simultanes, 20 par IP et par minute');
  const b64 = (P) => Buffer.from(JSON.stringify(P), 'utf8').toString('base64url');
  const Pr = (r) => T.appliquerReglage(T.structurer({ famille: 'lorenz' }), 'params.r', r);
  const srvG = serveurTam({ rpc: rpcFaux, deploiement: VIERGE, lireVie, lireSymbole: async () => 'ZZZ', maintenant: () => 1.8e12 });
  /* (a) le plafond simultane : 3 calculs (caches rates) lances ensemble -> 2 admis, le 3e OCCUPE, sans calcul */
  const trois = await Promise.all([20, 21, 22].map((r, i) => srvG.certifierParams(b64(Pr(r)), 'ip-c' + i)));
  const occ = trois.filter((x) => x.etat === 'OCCUPE');
  ok(occ.length === 1 && occ[0].statut === 503 && occ[0].ok === false && occ[0].pourquoi === 'busy, try again in a few seconds' && occ[0].hash === undefined, '3 calculs ensemble : 2 admis, 1 OCCUPE 503 sans calcul');
  ok(trois.filter((x) => x.etat === 'CERTIFIE' || x.etat === 'REFUSE').length === 2, 'les 2 admis ont calcule');
  const apres = await srvG.certifierParams(b64(Pr(22)), 'ip-c2');
  ok(apres.etat !== 'OCCUPE', 'la place se libere apres le calcul (pas de place perdue)');
  /* (b) le budget par IP : 20 calculs, le 21e -> 429 ; une autre IP passe ; choix() est garde aussi */
  const rep = [];
  for (let i = 0; i < 21; i++) rep.push(await srvG.certifierParams(b64(Pr(30 + i * 0.25)), 'ip-a'));
  ok(rep.slice(0, 20).every((x) => x.etat !== 'TROP' && x.etat !== 'OCCUPE') && rep[20].etat === 'TROP' && rep[20].statut === 429 && /20 a minute/.test(rep[20].pourquoi), '21e calcul de la meme IP dans la minute : 429 TROP');
  ok((await srvG.certifierParams(b64(Pr(39)), 'ip-b')).etat !== 'TROP', 'une autre IP a son propre budget');
  const chA = await srvG.choix(graineDe('garde-1'), null, null, 'ip-a');
  ok(chA.etat === 'TROP' && chA.statut === 429, '/api/tam/choix compte dans le meme budget (429)');
  /* (c) un cache touche ne compte pas */
  const P0 = b64(Pr(25));
  const premier = await srvG.certifierParams(P0, 'ip-d');
  const repetes = []; for (let i = 0; i < 30; i++) repetes.push(await srvG.certifierParams(P0, 'ip-d'));
  ok(premier.etat === 'CERTIFIE' && repetes.every((x) => x === premier), '30 caches touches : la meme reponse, jamais TROP');
  const neufs = []; for (let i = 0; i < 19; i++) neufs.push(await srvG.certifierParams(b64(Pr(26 + i * 0.25)), 'ip-d'));
  ok(neufs.every((x) => x.etat !== 'TROP'), 'apres 30 caches touches, 19 calculs neufs passent encore (20 au total)');
  /* (d) le serveur rend 503/429 avec la meme source d IP que /api/jeu/roll ; l app le dit sans relancer */
  ok(/statut === 503 \|\| statut === 429 \? statut : 200/.test(serveur) && /const ipT = ipClient\(req\);/.test(serveur)
    && /certifierParams\(q\.get\('p'\), ipT\)/.test(serveur) && /q\.get\('minter'\), ipT, q\.get\('draw'\)\)/.test(serveur), 'serveur : code HTTP du refus, IP lue comme /api/jeu/roll, passee aux deux routes');
  ok(/j\.etat === 'OCCUPE' \|\| j\.etat === 'TROP'/.test(onglet) && !/setInterval\([^)]*api\/tam|setTimeout\([^)]*fetch\('\/api\/tam/.test(onglet), 'l onglet dit « busy » et ne relance aucun appel /api/tam en boucle');
}

console.log('test-tam-onglet-20261031 : ' + n + ' assertions OK');

/* ── MUTANTS sur COPIES (2026-11-01) : chaque defaut nomme par le lead doit faire ROUGIR ce banc. Copie de la racine dans D:\tmp\tam-mut,
 *   mutation dans la COPIE, ce banc relance sur la copie (TAM_MUTANT=1 : pas de recursion). Jamais le depot. ── */
if (!process.env.TAM_MUTANT) {
  const { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync: ecrire } = await import('node:fs');
  const { spawnSync } = await import('node:child_process');
  const { join } = await import('node:path');
  const ICI = new URL('.', import.meta.url), racine = decodeURIComponent(ICI.pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  const MUTANTS = [
    ['reglage qui contourne les certificats (portail local)', 'tam-vue.js', "  if (!local || !local.ok) return { ok: false, pourquoi: verdictReglage(local).texte };\n", ''],
    ['reglage qui contourne les bornes (certifierReglage)', 'tam-moteur.js', "  if (!v.ok) return { ok: false, etat: 'REFUSE', codes: ['HORS_BORNES'], raisons: [v.raison], oeuvre: null };\n", ''],
    ['portail qui croit le serveur sans comparer les octets', 'tam-vue.js', "serveur.hash !== keccak256Hex(octets)", 'false'],
    ['coup de pouce du cerveau NON deterministe', 'tam-moteur.js', 'const r = R[idx], depl = ((h[o + 2] / 255) * 2 - 1)', 'const r = R[idx], depl = ((Math.random()) * 2 - 1)'],
    ['rejeu d une oeuvre reglee qui differe (octets du curseur non arrondi)', 'tam-vue.js', '  const o = generer(Q);\n', "  const o = generer(chemin.startsWith('params.') ? { ...Q, params: { ...Q.params, [chemin.slice(7)]: Number(valeur) } } : Q);\n"],
    ['curseur qui ecrit le mauvais angle', 'tam-moteur.js', "else if (tete === 'angles') Q.angles[Number(sous)] = v;", "else if (tete === 'angles') Q.angles[Math.min(Q.angles.length - 1, Number(sous) + 1)] = v;"],
    ['curseur qui ecrit le mauvais parametre', 'tam-moteur.js', 'Q.params[sous] = v;', 'Q.params[Object.keys(Q.params).sort()[0]] = v;'],
    /* 2026-11-12 (the economy pack): the server reads TAM art AND the first TamArt; the unread signature is kept in toutesExistantes() */
    ['signature non lue ecartee en silence (serveur)', 'tam-serveur.js', 'E.oe.oeuvres.map((o) => E.oe.sigs.get(o.tokenId) || null));', 'E.oe.oeuvres.map((o) => E.oe.sigs.get(o.tokenId)).filter(Boolean));'],
    ['minteur non transmis au moteur (serveur)', 'tam-serveur.js', 'existantes, minteur }));', 'existantes, minteur: null }));'],
    ['garde CPU : plafond simultane retire', 'tam-serveur.js', 'if (garde.enCours >= TAM_CALCULS_MAX) return', 'if (false) return'],
    ['garde CPU : budget par IP retire', 'tam-serveur.js', 'if (n > TAM_BUDGET_IP_MINUTE) return', 'if (false) return'],
    ['garde CPU : un cache touche compte dans le budget', 'tam-serveur.js', 'if (parReglage.has(cle)) return parReglage.get(cle);', 'if (parReglage.has(cle)) { const a = admettre(ip); if (a) return a; garde.enCours--; return parReglage.get(cle); }'],
    ['quitter une science garde l oeuvre dessinee (S.o)', 'tam-onglet.js', 'S.P = null; S.science = null; S.o = null; }', 'S.P = null; S.science = null; }'],
  ];
  /* 2026-11-04 : le dossier etait FIXE (D:\tmp\tam-mut) — deux copies de travail testees en meme temps s ecrasaient leurs mutants
   *   (rouges « pre-existants » vus par un agent sur sa branche). Un dossier unique par execution, sur D: (C: plein), retire a la fin. */
  const base = mkdtempSync(join(process.env.TAM_TMP || 'D:\\tmp', 'tam-mut-'));
  let tues = 0;
  console.log('MUTANTS (copies dans ' + base + ') :');
  for (const [i, [nom, fichier, de, vers]] of MUTANTS.entries()) {
    const dir = join(base, 'm' + (i + 1));
    rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
    for (const f of readdirSync(racine)) {
      if (!/\.(js|mjs|html|json)$/.test(f) || (f.startsWith('test-') && f !== 'test-tam-onglet-20261031.mjs')) continue;
      /* game76 : les mutants temporaires des AUTRES bancs (tam-mutant-N.tmp.js…) naissent et meurent pendant la serie concurrente :
       *   les copier faisait ENOENT au hasard. Ils ne servent a rien ici ; un fichier disparu entre la liste et la copie est saute. */
      if (/\.tmp\./.test(f)) continue;
      try { if (statSync(join(racine, f)).isFile()) cpSync(join(racine, f), join(dir, f)); } catch (e) { if (e && e.code !== 'ENOENT') throw e; }
    }
    const src = readFileSync(join(dir, fichier), 'utf8').replace(/\r\n/g, '\n'), nb = src.split(de).length - 1;
    if (nb !== 1) { console.log('  M' + (i + 1) + ' ' + nom + ' : NON APPLIQUE (motif ' + nb + ' fois) -> SURVIVANT'); continue; }
    ecrire(join(dir, fichier), src.replace(de, vers));
    const r = spawnSync(process.execPath, [join(dir, 'test-tam-onglet-20261031.mjs')], { env: { ...process.env, TAM_MUTANT: '1' }, encoding: 'utf8', timeout: 300000 });
    const tue = r.status !== 0, msg = ((r.stderr || '').match(/AssertionError[^\n]*\n?[^\n]*|Error: [^\n]*/) || [''])[0].replace(/\s+/g, ' ').slice(0, 150);
    if (tue) tues++;
    console.log('  M' + (i + 1) + ' ' + nom + ' : ' + (tue ? 'TUE' : 'SURVIT') + (msg ? ' (' + msg + ')' : ''));
    rmSync(dir, { recursive: true, force: true });
  }
  rmSync(base, { recursive: true, force: true });
  console.log('MUTANTS : ' + tues + '/' + MUTANTS.length + ' tues');
  if (tues !== MUTANTS.length) process.exit(1);
}
