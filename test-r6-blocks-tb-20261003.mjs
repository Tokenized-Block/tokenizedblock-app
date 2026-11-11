/* test-r6-blocks-tb-20261003.mjs — SEULS LES VRAIS BLOCKS TB SONT RESTREINTS AU ROUTAGE (Phil 00:20, spec Claude 00:27, Phil 00:30).
 * Un block TB = (a) ne du CreateRouter (index-routeur.js : graine lue on-chain + index servi, formule neDuRouteur du hook 7030),
 *   (b) TBLOCK / TBGAS (et les blocks V1 de test), (c) un marche sur un de NOS hooks. Un B20 d un autre launchpad reste
 *   echangeable sur ses pools (frais routeur en ETH/USDC), comme sur 1bb12d6. Index illisible : fail-closed SEULEMENT pour un
 *   B20 non classe sur une pool sans hook TB. L AFFICHAGE (fil, listes, profils) ne change pas.
 * Jetons reels lus on-chain (2026-10-03, lecture seule) :
 *   PEXRA 0xb200000000000000000000c21042dc554628d2ac — B20Created bloc 52 091 810 (tx 0xcba960ed…), hors CreateRouter ;
 *         pool V4 ETH/PEXRA fee 3000 / espacement 60, hook TIERS 0xe1efe2ba62af522897dbfb44b9bf0be2136700cc (bloc 52 091 824).
 *   OLD   0xb200000000000000000000e4b0c5fbe9c8df579e — pas ne du CreateRouter, pool V8 ETH/OLD fee 0 / 200 (bloc 51 653 364).
 *   ROUTEUR 0xb20000000000000000000005090fb1d9da0e5949 — createPaid 0xc222326c… (sel lu dans la calldata).
 *   H8    0xb200000000000000000000e63ffc3f40bf92a042 — R7 (Zero 1, K1) : createPaid via l EntryPoint ERC-4337 (bloc 51 692 885).
 *   R7 (Zero 1, K2) : OLD (= IB022) et les blocks V2 sont TB SANS contexte (liste statique BLOCKS_SUR_NOS_HOOKS, scan Initialize) ;
 *   la regle (c) par contexte est testee sur SYN, un B20 synthetique absent de toute liste.
 * ⛔⛔ R8 (C2 KO R6, decision Raksha) : LOGIQUE INVERSEE. Par defaut tout B20 non devise est un block (R5) ; seule une liste
 *   blanche LIBERE les vrais jetons tiers (liste explicite PEXRA, ou marche lu sur un hook de launchpad tiers connu), et
 *   seulement s ils sont absents de l ensemble TB ET que toutes les sources TB sont lues. Section REG : les blocks TB reels
 *   (IB022, ab549f, 809778, e63ffc, 03d296, les 2 de 0xd0a6) sont refuses hors hook TB dans CHAQUE etat de l index
 *   (non, lu, vide, perime, nosvide, illisible) ; PEXRA n est libere que sources lues ; un 0xb2 inconnu reste refuse.
 * ⛔⛔ R9 (C2 OK-avec-changements sur R8) : la liste blanche n est plus qu un ensemble d ADRESSES (PEXRA + B20 nes d un
 *   lancement o1, jetons-nes-launchpads.js) ; aucun hook (Clanker, 0xe1ef, Doppler, o1) ne libere par son marche, et un jeton
 *   liste ne libere ni le cote cotation ni les autres sauts. EFIX et SMOKE14 (creations directes TB) entrent dans la liste
 *   statique. Les copies mutees tournent dans l etat de l outil (outil-etat-index.mjs les charge aussi).
 * ⛔⛔ R10 (Phil, 2026-10-03 : « l appliquer de partout ») : mesure prod, 148 des 177 blocks suivis etaient refuses par R8
 *   (280 340 $ / 24 h, 88 % du volume des blocks ; 92 sur un lanceur a hook unique par jeton, hors de toute liste). Un B20 absent
 *   de TOUTES les sources TB, sources LUES, est TIERS : la liste blanche n est plus la condition. Fail-closed inchange quand une
 *   source n est pas lue (etats non / vide / perime / nosvide / illisible). Risque accepte par le fondateur : un block TB absent
 *   des sources serait route ailleurs (on garde le frais routeur) — la completude de l ensemble TB est la seule garde (R10b).
 * ⛔ TEMOINS NEGATIFS : le banc tourne sur une COPIE du depot (doit rester vert), puis sur des MUTANTS ; chacun DOIT le rougir.
 * ⛔ 1bb12d6 : les plans « tiers » sont compares OCTET POUR OCTET a ceux de 1bb12d6 (git show ; sans git, la comparaison est DITE non executee). */
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (dir, f) => import(pathToFileURL(path.join(dir, f)).href);
const charger = async (dir) => ({ E: await imp(dir, 'echange.js'), T: await imp(dir, 'tokenomics.js'), F: await imp(dir, 'frais-creation.js'),
  PS: await imp(dir, 'pool-sans-hook.js'), IR: await imp(dir, 'index-routeur.js'), LE: await imp(dir, 'lancements-etrangers.js'),
  IB: await imp(dir, 'index-blocks.js'), PO: await imp(dir, 'pool.js'), MP: await imp(dir, 'multipool.js'), NL: await imp(dir, 'jetons-nes-launchpads.js') });

const ETH = '0x' + '0'.repeat(40);
const bas = (a) => String(a).toLowerCase();
const PEXRA = '0xb200000000000000000000c21042dc554628d2ac';
const HOOK_PEXRA = '0xe1efe2ba62af522897dbfb44b9bf0be2136700cc';
const OLD = '0xb200000000000000000000e4b0c5fbe9c8df579e';
const NE_ROUTEUR = '0xb20000000000000000000005090fb1d9da0e5949';
const RNG = '0xb2000000000000000000004ff41cbd5ef8e49f14';
const H8 = '0xb200000000000000000000e63ffc3f40bf92a042';
const V2A = '0xb200000000000000000000ab549fa65ad4edae3f', V2B = '0xb200000000000000000000809778b2d38d114351';
const SYN = '0xb200000000000000000000c0ffee0000000000c1'; /* B20 synthetique, hors routeur et hors liste */
const ENTRYPOINT = '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789';
const REELS = { IB022: '0xb200000000000000000000e4b0c5fbe9c8df579e', ab549f: '0xb200000000000000000000ab549fa65ad4edae3f',
  '809778': '0xb200000000000000000000809778b2d38d114351', e63ffc: '0xb200000000000000000000e63ffc3f40bf92a042',
  '03d296': '0xb20000000000000000000003d296be435ae4bbe3', d0a6a: '0xb200000000000000000000407ee1732664dc8028',
  d0a6b: '0xb200000000000000000000dae0212b61be4c49bb', EFIX: '0xb200000000000000000000eedb997f91ceb22b8a',
  SMOKE14: '0xb200000000000000000000e7e544d1292a095c36' };
const HOOK_DOPPLER = '0xbdf938149ac6a781f94faa0ed45e6a0e984c6544';
const HOOK_O1 = '0x1f91c998e7c2f4b690d75bdbf6502bdcd6e02acc';
const BRIAN = '0xb2000000000000000000002eefebd3dd6ef2d601'; /* B20 ne d un lancement o1 (liste generee) */
const NON_B20 = '0x1234567890abcdef1234567890abcdef12345678'; /* jeton hors B20 */
const NOS_SEUL = '0xb2' + '0'.repeat(20) + '5eed00000000000001'; /* un block servi SEULEMENT par /api/nos-blocks */
const HOOK_INC = '0x1234000000000000000000000000000000000acc'; /* hook inconnu */
const HOOK_CLANKER = '0xa10a6f4b918e963ec8694d37aa22e438706fe8cc';
const ETATS = ['non', 'lu', 'vide', 'perime', 'nosvide', 'illisible'];
const MEME = '0x1234567890abcdef1234567890abcdef12345678'; /* jeton hors B20 (forme Clanker / Zora) */
const compte = '0x' + '4'.repeat(40);
const MAINTENANT = Date.UTC(2026, 9, 3, 0, 0, 0);
const jsonB = (x) => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? 'n' + v.toString() : v));

function mot(x) { return (typeof x === 'bigint' ? x.toString(16) : String(x).replace(/^0x/, '')).padStart(64, '0'); }
function rpcPour({ E }) {
  const Q = bas(E.QUOTEUR[8453]), R = bas(E.ROUTEUR[8453]);
  return async (m, p) => {
    if (m === 'eth_chainId') return '0x2105';
    if (m !== 'eth_call') return '0x' + mot(0n);
    const to = bas((p[0] || {}).to || ''), d = bas((p[0] || {}).data || '');
    if (to === Q) return '0x' + mot(10n ** 18n) + mot(0n);
    if (to === R) return '0x' + mot(0n);
    return '0x' + 'f'.repeat(192);
  };
}
const plein = (IR, extra = {}) => ({ ok: true, couvertureComplete: true, fenetresRatees: 0, tete: 52100000, jusqua: 52100000, teteLueA: Date.now(),
  blocks: IR.GRAINE_ROUTEUR.map((g) => ({ jeton: g.jeton, sel: g.sel })), ...extra });
const nosRep = (blocks) => ({ ok: true, couvertureComplete: true, fenetresRatees: 0, tete: 52100000, jusqua: 52100000, teteLueA: Date.now(), blocks });
/* LU : index plein + /api/nos-blocks reduit a NOS_SEUL (les blocks reels et TBLOCK ne doivent rien a nos-blocks dans PROV/CL) */
const LU = (IR, extra = {}, nos = [NOS_SEUL]) => { const e = IR.chargerIndexRouteur(plein(IR, extra)); IR.chargerNosBlocksTb(nosRep(nos)); return e; };
/* /api/nos-blocks tel que servi (C2, 2026-10-02 22:37 UTC) + NOS_SEUL */
const NOS_SERVIS = ['0xb20000000000000000000024c30d3fcb7931272e', '0xb20000000000000000000003d296be435ae4bbe3', '0xb200000000000000000000e63ffc3f40bf92a042',
  '0xb200000000000000000000ab549fa65ad4edae3f', NOS_SEUL];
function etatIndex(IR, nom) {
  if (nom === 'lu') { IR.chargerIndexRouteur(plein(IR)); IR.chargerNosBlocksTb(nosRep(NOS_SERVIS)); }
  else if (nom === 'vide') { IR.chargerIndexRouteur(plein(IR, { blocks: [] })); IR.chargerNosBlocksTb(nosRep(NOS_SERVIS)); }
  else if (nom === 'perime') { IR.chargerIndexRouteur(plein(IR, { teteLueA: Date.now() - 3600 * 1000 })); IR.chargerNosBlocksTb(nosRep(NOS_SERVIS)); }
  else if (nom === 'nosvide') { IR.chargerIndexRouteur(plein(IR)); IR.chargerNosBlocksTb(nosRep([])); }
  else { IR.indexRouteurIllisible(nom); IR.nosBlocksTbIllisibles(nom); }
}

async function banc(M, { base = null } = {}) {
  const { E, T, F, PS, IR, LE, IB, PO, MP, NL } = M;
  const res = [];
  const v = (id, ok, detail = '') => res.push({ id, ok: !!ok, detail });
  const rpc = rpcPour(M);
  const cle = (a, b, h, fee, ts) => PO.cleDePool(a, b, { fee, tickSpacing: ts, hooks: h });
  const achat = (jeton, c, r = rpc) => E.planEchange({ rpc: r, chaine: 8453, jeton, compte, sens: 'ACHAT', montant: 10n ** 16n,
    marcheLu: { etat: 'LUE', cle: c, paire: null }, maintenant: MAINTENANT });
  const pret = (p) => p && (p.etat === 'PRET' || p.etat === 'APPROBATIONS');
  const fraisRouteurEth = (p) => pret(p) && p.resume && p.resume.frais > 0n && bas(p.resume.beneficiaireFrais) === bas(F.FEE_WALLET)
    && ['ETH', 'USDC', bas(F.USDC_BASE)].includes(p.resume.fraisDevise === 'pair' ? bas(p.resume.devise) : p.resume.fraisDevise);
  const cPexHook = cle(ETH, PEXRA, HOOK_PEXRA, 3000, 60), cPexNu = cle(ETH, PEXRA, ETH, 3000, 60);
  const cOldV8 = cle(ETH, OLD, T.HOOK_V8, 0, 200), cOldNu = cle(ETH, OLD, ETH, 3000, 60);
  const cSynV8 = cle(ETH, SYN, T.HOOK_V8, 0, 200), cSynNu = cle(ETH, SYN, ETH, 3000, 60);
  const cRouteurNu = cle(ETH, NE_ROUTEUR, ETH, 3000, 60), cTblockNu = cle(ETH, T.TBLOCK, ETH, 3000, 60), cTbgasNu = cle(ETH, T.TBGAS, ETH, 3000, 60);
  const USDC = bas(F.USDC_BASE);
  const cUsdcEth = cle(ETH, USDC, ETH, 500, 10);
  const multi = (sauts, entree, sortie, montant) => E.planEchangeMultiSauts({ rpc, chaine: 8453, compte, sauts, entree, sortie, montant,
    decimalesEntree: entree === USDC ? 6 : 18, prixUsdEntree: null, maintenant: MAINTENANT });
  const j = (c, de) => ({ cle: c, zeroForOne: bas(de) === bas(c.currency0) });

  /* ══ PROVENANCE : formule neDuRouteur, graine 8/8 (R7 : + H8 ne via 4337), sels faux refuses ══ */
  v('PROV graine : 8 blocks, 8/8 neDuRouteur, H8 inclus', IR.GRAINE_ROUTEUR.length === 8 && IR.GRAINE_ROUTEUR.every((g) => IR.neDuRouteur(g.jeton, g.sel))
    && IR.GRAINE_ROUTEUR.some((g) => g.jeton === H8));
  const g8 = IR.GRAINE_ROUTEUR.find((g) => g.jeton === H8) || { sel: '0x' + '0'.repeat(64) };
  const g0 = IR.GRAINE_ROUTEUR[0];
  v('PROV sel+1, sel nul, autre routeur : faux', !IR.neDuRouteur(g0.jeton, '0x' + (BigInt(g0.sel) + 1n).toString(16).padStart(64, '0'))
    && !IR.neDuRouteur(g0.jeton, '0x' + '0'.repeat(64)) && !IR.neDuRouteur(g0.jeton, g0.sel, '0x' + '9'.repeat(40)));
  v('PROV createPaid : sel = mot 1 de la calldata', IR.selDeCreatePaid('0x1d03fb54' + mot(0n) + g0.sel.slice(2) + mot(0n)) === g0.sel
    && IR.selDeCreatePaid('0x12345678' + mot(0n) + g0.sel.slice(2)) === null);
  /* scanner (meme code que le serveur) sur un rpc simule : 1 createPaid prouve, 1 createB20 direct, 1 createPaid au sel faux, 1 fenetre ratee */
  const TOP = (a) => '0x' + '0'.repeat(24) + a.slice(2);
  const faux = '0xb2' + '0'.repeat(20) + 'abcdefabcdefabcdef';
  let appels = 0;
  const rpcScan = async (m, p) => {
    if (m === 'eth_getLogs') {
      appels += 1;
      if (appels === 2) throw new Error('rate limit');
      if (appels > 2) return [];
      return [{ address: IR.FACTORY_B20, topics: [IR.TOPIC_B20_CREATED, TOP(g0.jeton)], transactionHash: '0xa1', blockNumber: '0x10' },
        { address: IR.FACTORY_B20, topics: [IR.TOPIC_B20_CREATED, TOP(PEXRA)], transactionHash: '0xa2', blockNumber: '0x10' },
        { address: IR.FACTORY_B20, topics: [IR.TOPIC_B20_CREATED, TOP(faux)], transactionHash: '0xa3', blockNumber: '0x10' },
        { address: IR.FACTORY_B20, topics: [IR.TOPIC_B20_CREATED, TOP(H8)], transactionHash: '0xa4', blockNumber: '0x10' }];
    }
    if (m === 'eth_getTransactionByHash') {
      if (p[0] === '0xa1') return { to: F.CREATE_ROUTER, input: '0x1d03fb54' + mot(0n) + g0.sel.slice(2) };
      if (p[0] === '0xa2') return { to: IR.FACTORY_B20, input: '0x12345678' + mot(0n) + g0.sel.slice(2) };
      /* R7 : smart wallet -> EntryPoint handleOps ; le createPaid est ENFOUI (sel a un decalage de 4 octets, pas 32) */
      if (p[0] === '0xa4') return { to: ENTRYPOINT, input: '0x1fad948c' + mot(0x40n) + mot(0n) + mot(1n) + '1d03fb54' + mot(0n) + g8.sel.slice(2) + mot(0n) };
      return { to: F.CREATE_ROUTER, input: '0x1d03fb54' + mot(0n) + mot(7n) };
    }
    throw new Error('inattendu ' + m);
  };
  const sc = await IR.scannerNesDuRouteur({ rpc: rpcScan, deBloc: 1, aBloc: 3000, pas: 1000 });
  v('PROV scanner : seul le createPaid prouve est garde, la fenetre ratee est comptee', sc.blocks.some((b) => b.jeton === g0.jeton && b.sel === g0.sel)
    && !sc.blocks.some((b) => b.jeton === PEXRA || b.jeton === faux) && sc.fenetresRatees === 1, jsonB(sc));
  v('PROV scanner 4337 : createPaid via EntryPoint (tx.to != routeur) garde, sel retrouve dans l input', sc.blocks.length === 2
    && sc.blocks.some((b) => b.jeton === H8 && b.sel === g8.sel && b.tx === '0xa4'), jsonB(sc));

  /* ══ ETAT DE L INDEX : non charge = illisible ; sel faux rejete ; index en retard = illisible ══ */
  IR.indexRouteurIllisible('test');
  v('IDX non lu par defaut ou apres echec', IR.indexRouteurLu() === false);
  const e1 = LU(IR, { blocks: [...IR.GRAINE_ROUTEUR.map((g) => ({ jeton: g.jeton, sel: g.sel })), { jeton: faux, sel: mot(7n) }] });
  v('IDX entree au sel faux : rejetee, jamais TB, et l index n est pas lu', e1.lu === false && e1.rejetes === 1 && !IR.estNeDuRouteur(faux) && PS.classeBlock(faux) === 'INCONNU', jsonB(e1));
  const e2 = LU(IR, { jusqua: 52100000 - IR.RETARD_MAX_INDEX - 1 });
  v('IDX en retard sur la tete : non lu (fail-closed)', e2.lu === false && PS.classeBlock(PEXRA) === 'INCONNU', jsonB(e2));
  const e3 = LU(IR, { couvertureComplete: false });
  v('IDX couverture incomplete : non lu', e3.lu === false);
  const e4 = LU(IR, { blocks: [] });
  v('IDX liste vide marquee complete : non lu, PEXRA reste bloque', e4.lu === false && PS.classeBlock(PEXRA) === 'INCONNU', jsonB(e4));
  const e5 = LU(IR, { teteLueA: Date.now() - 3600 * 1000 });
  v('IDX tete figee (lue il y a 1 h) : non lu, PEXRA reste bloque', e5.lu === false && PS.classeBlock(PEXRA) === 'INCONNU', jsonB(e5));
  LU(IR);
  IR.nosBlocksTbIllisibles('test');
  v('IDX /api/nos-blocks non lu : aucune liberation (PEXRA INCONNU)', IR.indexRouteurLu() === true && IR.sourcesTbLues() === false && PS.classeBlock(PEXRA) === 'INCONNU');
  LU(IR);
  v('IDX lu', IR.indexRouteurLu() === true);

  /* ══ CLASSEMENT (index lu) ══ */
  v('CL ne du routeur = TB', PS.classeBlock(NE_ROUTEUR) === 'TB');
  v('CL H8 ne via 4337 = TB', PS.classeBlock(H8) === 'TB' && PS.classeBlock(H8, []) === 'TB');
  v('CL K2 IB022 et les 2 blocks V2 = TB SANS contexte (liste statique)', PS.classeBlock(OLD) === 'TB' && PS.classeBlock(V2A) === 'TB' && PS.classeBlock(V2B) === 'TB'
    && PS.BLOCKS_SUR_NOS_HOOKS.length === 13 && !PS.BLOCKS_SUR_NOS_HOOKS.includes('0xb2000000000000000000007b9fcbd005511acbd5'));
  v('CL EFIX / SMOKE14 = TB (creations directes de la fabrique, liste statique)', PS.classeBlock(REELS.EFIX) === 'TB' && PS.classeBlock(REELS.SMOKE14) === 'TB'
    && PS.classeBlock(REELS.EFIX, [cle(ETH, REELS.EFIX, HOOK_PEXRA, 3000, 60)]) === 'TB');
  v('CL anciens routeurs 0xd0a6 : 2 blocks TB (formule, graine statique)', PS.classeBlock(REELS.d0a6a) === 'TB' && PS.classeBlock(REELS.d0a6b) === 'TB'
    && IR.GRAINE_ANCIENS_ROUTEURS.every((g) => IR.neDuRouteur(g.jeton, g.sel, g.routeur)));
  v('CL TBLOCK = TB, TBGAS = TB', PS.classeBlock(T.TBLOCK) === 'TB' && PS.classeBlock(T.TBGAS) === 'TB');
  v('CL TBLOCK est toujours un block (estBlockTb, meme hors des jetons de la route)', PS.estBlockTb(T.TBLOCK, []) === true);
  v('CL V1 de test (RNG) = TB', PS.classeBlock(RNG) === 'TB');
  /* ⛔⛔ R10 (Phil, 2026-10-03 : « l appliquer de partout ») : mesure prod 148/177 blocks refuses (280 340 $ / 24 h) par R8 ;
   *   un B20 absent de TOUTES les sources TB, sources LUES, est TIERS — la liste blanche n est plus la condition. */
  v('CL R10 SYN sans contexte, sources lues = TIERS (absent de toute source TB) ; PEXRA = TIERS', PS.classeBlock(PEXRA) === 'TIERS' && PS.classeBlock(SYN) === 'TIERS');
  v('CL SYN avec son marche V8 = TB (regle c)', PS.classeBlock(SYN, [cSynV8]) === 'TB');
  v('CL SYN sur V8 ET sur un hook de launchpad tiers : TB (l ensemble TB gagne)', PS.classeBlock(SYN, [cSynV8, cle(ETH, SYN, HOOK_CLANKER, 10000, 200)]) === 'TB');
  v('CL R10 SYN sur Clanker / 0xe1ef / o1 / Doppler (cote lance ou cotation) = TIERS par absence des sources, et TB des que son marche V8 est dans le contexte',
    [HOOK_CLANKER, HOOK_PEXRA, HOOK_O1, HOOK_DOPPLER].every((h) => PS.classeBlock(SYN, [cle(ETH, SYN, h, 10000, 200)]) === 'TIERS'
      && PS.classeBlock(SYN, [cle(BRIAN, SYN, h, 10000, 200)]) === 'TIERS' && PS.classeBlock(SYN, [cSynV8, cle(ETH, SYN, h, 10000, 200)]) === 'TB'));
  v('CL liste blanche R9 : PEXRA + ' + NL.NES_LAUNCHPADS_O1.length + ' B20 nes o1 (BRIAN inclus), tous B20, aucun dans l ensemble TB',
    /* liste regeneree le 2026-10-03 jusqu au bloc 52 129 523 (6844 lancements o1) ; sous R10 elle n est plus la condition */
    NL.NES_LAUNCHPADS_O1.length === 6844 && new Set(NL.NES_LAUNCHPADS_O1).size === 6844 && NL.NES_LAUNCHPADS_O1.every((a) => PS.RE_B20.test(a) && a.length === 42)
    && NL.NES_LAUNCHPADS_O1.includes(BRIAN) && !NL.NES_LAUNCHPADS_O1.includes(PEXRA)
    && [...Object.values(REELS), ...PS.BLOCKS_SUR_NOS_HOOKS, ...IR.GRAINE_ROUTEUR.map((g) => g.jeton), T.TBLOCK].every((x) => !NL.NES_LAUNCHPADS_O1.includes(bas(x)))
    && PS.classeBlock(BRIAN) === 'TIERS');
  v('CL un jeton de la liste ne libere pas les autres sauts : un block TB (IB022) sur ces routes reste TB ; SYN y est TIERS par lui-meme (R10)',
    PS.classeBlock(OLD, [cle(ETH, PEXRA, ETH, 3000, 60), cle(PEXRA, OLD, ETH, 3000, 60), cle(ETH, BRIAN, HOOK_O1, 0, 200), cle(BRIAN, OLD, HOOK_O1, 0, 200)]) === 'TB'
    && PS.classeBlock(SYN, [cle(ETH, PEXRA, ETH, 3000, 60), cle(PEXRA, SYN, ETH, 3000, 60), cle(ETH, BRIAN, HOOK_O1, 0, 200), cle(BRIAN, SYN, HOOK_O1, 0, 200)]) === 'TIERS');
  v('CL jeton liste MAIS marche sur un de NOS hooks : TB (l ensemble TB gagne)', PS.classeBlock(BRIAN, [cle(ETH, BRIAN, T.HOOK_V8, 0, 200)]) === 'TB' && PS.classeBlock(PEXRA, [cle(ETH, PEXRA, T.HOOK_V2, 0, 200)]) === 'TB');
  const HI = '0xb2ffffffffffffffffffffffffffffffffffffff';
  v('CL estBlockTb R5 : 0xb2 hors motif B20 = block, PEXRA libere = pas un block', PS.estBlockTb(HI, [HI]) === true && PS.estBlockTb(PEXRA, [PEXRA]) === false);
  v('CL block seulement dans /api/nos-blocks = TB', (IR.chargerNosBlocksTb(nosRep([NOS_SEUL])), PS.classeBlock(NOS_SEUL) === 'TB'));
  v('CL ETH / USDC / hors B20 : jamais un block', PS.classeBlock(ETH) === null && PS.classeBlock(USDC) === null && PS.classeBlock(MEME) === null);

  /* ══ 1. TIERS sur sa pool (hook tiers) ou sans hook -> PRET, frais routeur en ETH ══ */
  const t1 = await achat(PEXRA, cPexHook);
  v('T1 PEXRA sur sa pool a hook tiers : PRET + frais routeur ETH -> a6cf', fraisRouteurEth(t1), t1.etat + ' ' + (t1.pourquoi || ''));
  const t2 = await achat(PEXRA, cPexNu);
  v('T2 PEXRA sur une pool sans hook : PRET + frais routeur ETH', fraisRouteurEth(t2), t2.etat + ' ' + (t2.pourquoi || ''));
  const t3 = await multi([j(cUsdcEth, USDC), j(cPexHook, ETH)], USDC, PEXRA, 10n ** 7n);
  v('T3 USDC>ETH>PEXRA (hook tiers) : PRET, un frais routeur', pret(t3) && t3.resume && t3.resume.frais > 0n, t3.etat + ' ' + (t3.pourquoi || ''));
  if (base) {
    const b1 = await base.achat(PEXRA, cPexHook), b3 = await base.multi([j(cUsdcEth, USDC), j(cPexHook, ETH)], USDC, PEXRA, 10n ** 7n);
    v('T1 = 1bb12d6 octet pour octet', jsonB(t1) === jsonB(b1), jsonB(b1).slice(0, 160));
    v('T3 = 1bb12d6 octet pour octet', jsonB(t3) === jsonB(b3), jsonB(b3).slice(0, 160));
  }
  /* ══ 2. block ne du routeur sur pool sans hook -> REFUSE ══ */
  const t4 = await achat(NE_ROUTEUR, cRouteurNu);
  v('T4 block ne du routeur, pool sans hook : REFUSE', t4.etat === 'REFUSE', t4.etat);
  const t4b = await achat(NE_ROUTEUR, cle(ETH, NE_ROUTEUR, HOOK_INC, 3000, 60));
  v('T4b block ne du routeur, hook tiers : REFUSE', t4b.etat === 'REFUSE' && t4b.refusHookTiers === true, t4b.etat);
  const t4c = await achat(NE_ROUTEUR, cle(ETH, NE_ROUTEUR, HOOK_PEXRA, 3000, 60));
  v('T4c block ne du routeur sur un hook de launchpad tiers (liste blanche) : REFUSE', t4c.etat === 'REFUSE', t4c.etat);
  /* R5-2 : un hook inconnu passe comme PAYEUR par l appelant n admet pas un block sur sa pool */
  const p52 = await E.planEchange({ rpc, chaine: 8453, jeton: OLD, compte, sens: 'ACHAT', montant: 10n ** 16n, maintenant: MAINTENANT,
    marcheLu: { etat: 'LUE', cle: cle(ETH, OLD, HOOK_INC, 0, 200), paire: null }, hooksPaieurs: [{ hook: HOOK_INC, sens: ['ACHAT', 'VENTE'], preuve: 'appelant' }] });
  const p52m = await E.planEchangeMultiSauts({ rpc, chaine: 8453, compte, sauts: [j(cUsdcEth, USDC), j(cle(ETH, OLD, HOOK_INC, 0, 200), ETH)], entree: USDC, sortie: OLD,
    montant: 10n ** 7n, decimalesEntree: 6, prixUsdEntree: null, maintenant: MAINTENANT, hooksPaieurs: [{ hook: HOOK_INC, sens: ['ACHAT', 'VENTE'], preuve: 'appelant' }] });
  v('P52 hook inconnu passe comme payeur : REFUSE (seuls nos hooks / HOOKS_PAIENT_DEJA_A6CF)', p52.etat === 'REFUSE' && p52m.etat === 'REFUSE', p52.etat + ' ' + (p52.pourquoi || '') + ' / multi ' + p52m.etat + ' ' + (p52m.pourquoi || ''));
  v('P52m multipool : hook inconnu nomme facturant : ignore', !MP.ensembleHooksFacturants([HOOK_INC]).has(HOOK_INC) && MP.ensembleHooksFacturants([T.HOOK_V2]).has(bas(T.HOOK_V2)));
  /* ══ 3. ancien block sur V8 -> PRET, le hook paie (pas de frais routeur) ══ */
  const t5 = await achat(OLD, cOldV8);
  v('T5 ancien block sur V8 : PRET, le hook paie (routeur 0)', pret(t5) && t5.resume && t5.resume.fraisBps === 0n && t5.resume.beneficiaireFrais === null, t5.etat + ' ' + (t5.pourquoi || ''));
  /* R7 (K2) : IB022 sur une pool sans hook, SANS contexte, index lu -> REFUSE (preuve fork de Zero 1 : PRET sur a653486) */
  const t5k = await achat(OLD, cOldNu);
  v('T5k IB022 pool sans hook, sans contexte, index lu : REFUSE', t5k.etat === 'REFUSE' && PS.poolSansHookInterdite(cOldNu, [OLD], [cOldNu]) === true, t5k.etat + ' ' + (t5k.pourquoi || ''));
  const t3b = await multi([j(cUsdcEth, USDC), j(cle(ETH, SYN, HOOK_CLANKER, 10000, 200), ETH)], USDC, SYN, 10n ** 7n);
  v('T3b R10 USDC>ETH>(hook Clanker)SYN : PRET, un frais routeur (SYN tiers par absence des sources)', pret(t3b) && t3b.resume && t3b.resume.frais > 0n, t3b.etat + ' ' + (t3b.pourquoi || ''));
  const t3c = await multi([j(cle(ETH, SYN, HOOK_CLANKER, 10000, 200), ETH), j(cle(SYN, USDC, ETH, 3000, 60), SYN)], ETH, USDC, 10n ** 16n);
  v('T3c R10 ETH>(hook Clanker)SYN>(sans hook)USDC : PRET (SYN n est pas un block TB au milieu)', pret(t3c), t3c.etat + ' ' + (t3c.pourquoi || ''));
  /* jeton hors B20 PRIXE (fraisDevisesOk) : sans marche sur nos hooks il passe ; avec son marche V8 dans la route, regle (c) -> block */
  const ms5d = (sauts) => E.planEchangeMultiSauts({ rpc, chaine: 8453, compte, sauts, entree: ETH, sortie: USDC, montant: 10n ** 16n, decimalesEntree: 18,
    prixUsdEntree: null, maintenant: MAINTENANT, fraisDevisesOk: new Set([NON_B20]) });
  const t5d = await ms5d([j(cle(ETH, NON_B20, T.HOOK_V8, 0, 200), ETH), j(cle(NON_B20, USDC, ETH, 3000, 60), NON_B20)]);
  const t5e = await ms5d([j(cle(ETH, NON_B20, ETH, 3000, 60), ETH), j(cle(NON_B20, USDC, ETH, 3000, 60), NON_B20)]);
  v('T5d ETH>(V8) jeton hors B20 prixe >(sans hook) USDC : REFUSE (regle c par le contexte de route : il devient un block TB) ; sans V8 : pas un block',
    t5d.etat === 'REFUSE' && t5e.refusSansHook !== true && t5e.refusBlocIntermediaire !== true, t5d.etat + ' ' + (t5d.pourquoi || '') + ' / sans V8 ' + t5e.etat + ' ' + (t5e.pourquoi || ''));
  v('T5b B20 hors liste : sa pool sans hook est interdite quand son marche V8 est dans le contexte', PS.indexPoolSansHookInterdite([cSynV8, cSynNu], [SYN]) === 1);
  const t5c = await multi([j(cSynV8, ETH), j(cle(SYN, USDC, ETH, 3000, 60), SYN)], ETH, USDC, 10n ** 16n);
  v('T5c ETH>(V8) SYN>(sans hook) USDC : REFUSE (block TB au milieu / sans hook)', t5c.etat === 'REFUSE', t5c.etat + ' ' + (t5c.pourquoi || ''));
  /* ══ 4. TBLOCK (et TBGAS) sur pool sans hook -> REFUSE ══ */
  const t6 = await achat(T.TBLOCK, cTblockNu), t6b = await achat(T.TBGAS, cTbgasNu);
  v('T6 TBLOCK sans hook : REFUSE', t6.etat === 'REFUSE' && PS.poolSansHookInterdite(cTblockNu, [T.TBLOCK]) === true, t6.etat);
  v('T6b TBGAS sans hook : REFUSE', t6b.etat === 'REFUSE', t6b.etat);
  /* ══ 5. index illisible : fail-closed seulement pour un B20 non classe sur une pool sans hook TB ══ */
  IR.indexRouteurIllisible('serveur muet');
  const u1 = await achat(PEXRA, cPexHook), u2 = await achat(PEXRA, cPexNu);
  v('U1 illisible : PEXRA hook tiers -> REFUSE', u1.etat === 'REFUSE', u1.etat);
  v('U2 illisible : PEXRA sans hook -> REFUSE', u2.etat === 'REFUSE', u2.etat);
  const u3 = await achat(PEXRA, cle(ETH, PEXRA, T.HOOK_V8, 0, 200));
  v('U3 illisible : B20 non classe sur NOTRE hook -> PRET (hook paie)', pret(u3) && u3.resume.fraisBps === 0n, u3.etat + ' ' + (u3.pourquoi || ''));
  const u4 = await achat(MEME, cle(ETH, MEME, HOOK_PEXRA, 3000, 60));
  v('U4 illisible : jeton hors B20 sur hook tiers -> PRET (pas tout le monde bloque)', fraisRouteurEth(u4), u4.etat + ' ' + (u4.pourquoi || ''));
  const u5 = await achat(NE_ROUTEUR, cRouteurNu);
  v('U5 illisible : block ne du routeur sans hook -> REFUSE', u5.etat === 'REFUSE');
  LU(IR);

  /* ══ REG : chaque etat de l index — blocks TB reels refuses hors hook TB, PEXRA libere seulement sources lues, 0xb2 inconnu refuse ══ */
  for (const etat of ETATS) {
    etatIndex(IR, etat);
    for (const [nom, X] of Object.entries({ ...REELS, NOS_SEUL })) {
      if (nom === 'NOS_SEUL' && etat !== 'lu') continue;
      const a = await achat(X, cle(ETH, X, ETH, 3000, 60)), b = await achat(X, cle(ETH, X, HOOK_INC, 3000, 60)), c = await achat(X, cle(ETH, X, HOOK_PEXRA, 3000, 60));
      v('REG ' + etat + ' ' + nom + ' : sans hook / hook inconnu / hook de launchpad tiers -> REFUSE', [a, b, c].every((p) => p.etat === 'REFUSE'), [a, b, c].map((p) => p.etat).join(','));
    }
    const s1 = await achat(SYN, cSynNu), s2 = await achat(SYN, cle(ETH, SYN, HOOK_INC, 3000, 60));
    /* R10 : SYN (absent de toute source TB) est libere SEULEMENT sources lues ; dans tout autre etat il reste un block (fail-closed) */
    const lu = etat === 'lu';
    if (lu) v('REG lu SYN (0xb2 absent des sources TB) -> PRET, frais routeur ETH (R10)', fraisRouteurEth(s1) && fraisRouteurEth(s2), s1.etat + ',' + s2.etat);
    else v('REG ' + etat + ' SYN (0xb2 inconnu, sources non lues) -> REFUSE', s1.etat === 'REFUSE' && s2.etat === 'REFUSE', s1.etat + ',' + s2.etat);
    /* R9 : routes et pools ouvertes a tous — un block TB n est libere ni par un hook, ni par un autre saut */
    const efixRoute = await multi([j(cle(ETH, REELS.EFIX, ETH, 3000, 60), ETH), j(cle(REELS.EFIX, USDC, HOOK_PEXRA, 3000, 60), REELS.EFIX)], ETH, USDC, 10n ** 16n);
    const synRoute = await multi([j(cle(ETH, SYN, ETH, 3000, 60), ETH), j(cle(SYN, USDC, HOOK_PEXRA, 3000, 60), SYN)], ETH, USDC, 10n ** 16n);
    v('REG ' + etat + ' route ETH>(sans hook)EFIX>(0xe1ef)USDC -> REFUSE', efixRoute.etat === 'REFUSE', efixRoute.etat);
    if (lu) v('REG lu route ETH>(sans hook)SYN>(0xe1ef)USDC -> PRET (R10 : SYN tiers)', pret(synRoute), synRoute.etat + ' ' + (synRoute.pourquoi || ''));
    else v('REG ' + etat + ' route ETH>(sans hook)SYN>(0xe1ef)USDC -> REFUSE (block non couvert)', synRoute.etat === 'REFUSE', synRoute.etat);
    const ouv = [], ouvSyn = [];
    for (const X of [REELS.EFIX, REELS.SMOKE14, OLD]) for (const h of [HOOK_CLANKER, HOOK_PEXRA]) ouv.push(await achat(X, cle(ETH, X, h, 10000, 200)));
    for (const h of [HOOK_CLANKER, HOOK_PEXRA]) ouvSyn.push(await achat(SYN, cle(ETH, SYN, h, 10000, 200)));
    v('REG ' + etat + ' pool Clanker / 0xe1ef (ouvertes a tous) : EFIX, SMOKE14, IB022 -> REFUSE', ouv.every((p) => p.etat === 'REFUSE'), ouv.map((p) => p.etat).join(','));
    if (lu) v('REG lu pool Clanker / 0xe1ef : SYN -> PRET, frais routeur ETH (R10)', ouvSyn.every(fraisRouteurEth), ouvSyn.map((p) => p.etat).join(','));
    else v('REG ' + etat + ' pool Clanker / 0xe1ef : SYN -> REFUSE (sources non lues)', ouvSyn.every((p) => p.etat === 'REFUSE'), ouvSyn.map((p) => p.etat).join(','));
    const dop = [await achat(OLD, cle(ETH, OLD, HOOK_DOPPLER, 10000, 200)), await achat(SYN, cle(ETH, SYN, HOOK_DOPPLER, 10000, 200)),
      await multi([j(cle(ETH, BRIAN, ETH, 3000, 60), ETH), j(cle(BRIAN, SYN, HOOK_DOPPLER, 10000, 200), BRIAN)], ETH, SYN, 10n ** 16n)];
    v('REG ' + etat + ' Doppler : block TB (IB022) -> REFUSE, jamais libere', dop[0].etat === 'REFUSE' && PS.classeBlock(OLD, [cle(BRIAN, OLD, HOOK_DOPPLER, 10000, 200)]) === 'TB', dop[0].etat);
    if (lu) v('REG lu Doppler : SYN lance / en cotation -> PRET (R10), classe TIERS', pret(dop[1]) && pret(dop[2]) && PS.classeBlock(SYN, [cle(BRIAN, SYN, HOOK_DOPPLER, 10000, 200)]) === 'TIERS', dop.slice(1).map((p) => p.etat).join(','));
    else v('REG ' + etat + ' Doppler : SYN -> REFUSE, classe INCONNU (sources non lues)', dop[1].etat === 'REFUSE' && dop[2].etat === 'REFUSE' && PS.classeBlock(SYN, [cle(BRIAN, SYN, HOOK_DOPPLER, 10000, 200)]) === 'INCONNU', dop.slice(1).map((p) => p.etat).join(','));
    const autres = [await multi([j(cle(ETH, PEXRA, ETH, 3000, 60), PEXRA), j(cle(ETH, SYN, ETH, 3000, 60), ETH)], PEXRA, SYN, 10n ** 16n),
      await multi([j(cle(ETH, BRIAN, HOOK_O1, 0, 200), ETH), j(cle(BRIAN, SYN, ETH, 3000, 60), BRIAN)], ETH, SYN, 10n ** 16n)];
    /* R10 : SYN est tiers par lui-meme ; la route payee EN PEXRA reste refusee par la garde de frais (le routeur ne preleve jamais
     *   dans un jeton sans marche mesure), la route ETH>(o1)BRIAN>SYN passe. */
    if (lu) v('REG lu un jeton liste et SYN sur la meme route : payee en PEXRA -> REFUSE (frais en jeton non mesure) ; ETH>(o1)BRIAN>(sans hook)SYN -> PRET (R10)',
      autres[0].etat === 'REFUSE' && /fee asset|measured market/.test((autres[0].pourquoi || '') + ' ' + (autres[0].causeInterne || '')) && pret(autres[1]),
      autres.map((p) => p.etat + ' ' + (p.pourquoi || '') + ' ' + (p.causeInterne || '')).join(' | '));
    else v('REG ' + etat + ' un jeton liste (PEXRA, BRIAN) ne libere pas les autres sauts : SYN -> REFUSE', autres.every((p) => p.etat === 'REFUSE'), autres.map((p) => p.etat).join(','));
    const br = await achat(BRIAN, cle(ETH, BRIAN, ETH, 3000, 60));
    if (etat === 'lu') v('LIB lu BRIAN (ne d un lancement o1) sans hook : libere, PRET + frais routeur ETH', fraisRouteurEth(br), br.etat + ' ' + (br.pourquoi || ''));
    else v('LIB ' + etat + ' BRIAN : une source TB non lue ne libere rien -> REFUSE', br.etat === 'REFUSE', br.etat);
    const px = await achat(PEXRA, cPexNu);
    if (etat === 'lu') v('LIB lu PEXRA sans hook : libere, PRET + frais routeur ETH', fraisRouteurEth(px), px.etat + ' ' + (px.pourquoi || ''));
    else v('LIB ' + etat + ' PEXRA : une source TB non lue ne libere rien -> REFUSE', px.etat === 'REFUSE', px.etat);
  }
  LU(IR);

  /* ══ 6. AFFICHAGE INCHANGE : un B20 tiers reste dans le fil / les listes, index lu ou non ══ */
  const logPex = { address: '0xb20f000000000000000000000000000000000000', topics: [LE.TOPIC_B20_CREATED, TOP(PEXRA), '0x' + mot(0n)],
    data: '0x', transactionHash: '0xcba960edbf83c80cd03298761b159e3a9aecb1e566f9214b043807183315ac6b', blockNumber: '0x31ad7a2' };
  const vu = () => LE.classerLogs([logPex]).some((x) => bas(x.jeton) === PEXRA);
  const vuLu = vu();
  IR.indexRouteurIllisible('serveur muet');
  const vuIll = vu();
  LU(IR);
  v('AFF PEXRA reste dans le fil des lancements (index lu ET illisible)', vuLu && vuIll);
  return res;
}

/* ── copies du depot ── */
const tmp = [];
function copie(mutation) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-r6-')); tmp.push(dir);
  for (const f of fs.readdirSync(ICI)) if (/\.js$/.test(f) || f === 'package.json') fs.copyFileSync(path.join(ICI, f), path.join(dir, f));
  for (const [fichier, de, vers] of (mutation ? mutation.edits : [])) {
    const p = path.join(dir, fichier);
    const src = fs.readFileSync(p, 'utf8');
    const n = src.split(de).length - 1;
    if (n !== 1) throw new Error('mutant ' + mutation.nom + ' : motif trouve ' + n + ' fois dans ' + fichier + ' (attendu 1)');
    fs.writeFileSync(p, src.replace(de, vers));
  }
  return dir;
}
/* 1bb12d6 extrait par git (fichiers .js de premier niveau) ; sans git : null, et l empreinte figee sert de reference. */
function copieBase() {
  try {
    const noms = execFileSync('git', ['-C', ICI, 'ls-tree', '--name-only', '1bb12d6'], { encoding: 'utf8' }).split(/\r?\n/).filter((f) => /\.js$/.test(f) || f === 'package.json');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-r6-base-')); tmp.push(dir);
    for (const f of noms) fs.writeFileSync(path.join(dir, f), execFileSync('git', ['-C', ICI, 'show', '1bb12d6:' + f], { maxBuffer: 1 << 28 }));
    return dir;
  } catch { return null; }
}

let nAssert = 0, ko = 0;
const ok = (c, m) => { nAssert += 1; if (!c) { ko += 1; console.log('  KO ' + m); } };
const MUTANTS = [
  { nom: 'a provenance routeur ignoree', edits: [['pool-sans-hook.js', '|| estNeDuRouteur(a) ||', '||']], casse: [/^CL ne du routeur/] },
  { nom: 'b TBLOCK retire de BLOCKS_TB', edits: [['pool-sans-hook.js', 'const BLOCKS_TB = new Set([bas(TBLOCK), bas(TBLOCK_REEL), bas(TBGAS)]);', 'const BLOCKS_TB = new Set([bas(TBGAS)]);']], casse: [/^CL TBLOCK est toujours un block/] },
  { nom: 'b2 blocks V1 de test oublies (les deux listes : V1 de test et sur nos hooks)', edits: [['pool-sans-hook.js', 'if (BLOCKS_TB.has(a) || BLOCKS_V1_TEST.has(a) || SUR_NOS_HOOKS.has(a) ||', 'if (BLOCKS_TB.has(a) ||']], casse: [/^CL V1/] },
  { nom: 'k2 liste statique des blocks sur nos hooks ignoree', edits: [['pool-sans-hook.js', '|| SUR_NOS_HOOKS.has(a) ||', '||']], casse: [/^CL K2 /] },
  { nom: 'k1 scanner : sel cherche seulement si tx.to == routeur', edits: [['index-routeur.js', 'for (let off = 0; !sel && off < 64; off += 8)', 'for (let off = 0; false; off += 8)']], casse: [/^PROV scanner 4337/] },
  { nom: 'k1b H8 absent de la graine', edits: [['index-routeur.js', "{ jeton: '0xb200000000000000000000e63ffc3f40bf92a042',", "{ jeton: '0xb200000000000000000000e63ffc3f40bf92a043',"]], casse: [/^PROV graine/] },
  { nom: 'c regle (c) marche sur nos hooks retiree', edits: [['pool-sans-hook.js', '|| estNotreBlockServi(a) || surNotreHook(a, cles)) return', '|| estNotreBlockServi(a)) return']], casse: [/^CL SYN avec/, /^CL SYN sur V8 ET/] },
  { nom: 'c2 contexte de route oublie (multi-sauts)', edits: [['echange.js', 'estBlockDeRoute(a, fraisDevisesOk, sauts.map((x) => x && x.cle))', 'estBlockDeRoute(a, fraisDevisesOk)']], casse: [/^T5d /] },
  { nom: 'd liberation sans sources TB lues (fail-open)', edits: [['pool-sans-hook.js', "return sourcesTbLues() ? 'TIERS' : 'INCONNU';", "return 'TIERS';"]], casse: [/^U1 |^U2 /, /^LIB non PEXRA/, /^LIB illisible PEXRA/, /^LIB vide PEXRA/, /^LIB perime PEXRA/, /^LIB nosvide PEXRA/, /^REG non SYN/, /^REG illisible SYN/] },
  { nom: 'e fail-closed etendu a tout le monde', edits: [['pool-sans-hook.js', '  if (!RE_B20.test(a)) return null;', '']], casse: [/^U4 /] },
  { nom: 'f tiers traite en block', edits: [['pool-sans-hook.js', "return c === 'TB' || c === 'INCONNU';", 'return c !== null;']], casse: [/^T1 |^T2 |^T3 /] },
  { nom: 'g index en retard accepte', edits: [['index-routeur.js', '!rep.fenetresRatees && retard <= RETARD_MAX_INDEX', '!rep.fenetresRatees']], casse: [/^IDX en retard/] },
  { nom: 'h sel non verifie au chargement', edits: [['index-routeur.js', 'if (b && neDUnDeNosRouteurs(b.jeton, b.sel, b.routeur || null)) {', 'if (b) {']], casse: [/^IDX entree au sel faux/] },
  { nom: 'i scanner sans verification de formule', edits: [['index-routeur.js', 'for (const r of routeurs) if (!sel && neDuRouteur(c.jeton, w, r)) {', 'for (const r of routeurs) if (!sel) {']], casse: [/^PROV scanner/] },
  { nom: 'R8a liste blanche consultee AVANT l ensemble TB', edits: [['pool-sans-hook.js', '  if (BLOCKS_TB.has(a) || BLOCKS_V1_TEST.has(a) || SUR_NOS_HOOKS.has(a) ||', "  if (RE_B20.test(a) && listeBlanche(a) && sourcesTbLues()) return 'TIERS';\n  if (BLOCKS_TB.has(a) || BLOCKS_V1_TEST.has(a) || SUR_NOS_HOOKS.has(a) ||"]], casse: [/^CL jeton liste MAIS marche sur un de NOS hooks/] },
  /* R10 : le retour a la liste blanche R8/R9 comme condition doit rougir les cas SYN liberes */
  { nom: 'R10a retour R8 (liste blanche redevenue la condition)', edits: [['pool-sans-hook.js', "return sourcesTbLues() ? 'TIERS' : 'INCONNU';", "return listeBlanche(a) && sourcesTbLues() ? 'TIERS' : 'INCONNU';"]], casse: [/^REG lu SYN /, /^CL R10 SYN sans contexte/, /^CL R10 SYN sur Clanker/, /^T3b /, /^T3c /] },
  { nom: 'R8c liberation coupee (PEXRA bloque a tort)', edits: [['pool-sans-hook.js', "return sourcesTbLues() ? 'TIERS' : 'INCONNU';", "return 'INCONNU';"]], casse: [/^LIB lu PEXRA/, /^LIB lu BRIAN/, /^T1 /, /^REG lu SYN /] },
  { nom: 'R8d graine des anciens routeurs 0xd0a6 ignoree', edits: [['index-routeur.js', '...GRAINE_ANCIENS_ROUTEURS.filter((g) => neDUnDeNosRouteurs(g.jeton, g.sel, g.routeur))].map', '].map']], casse: [/^CL anciens routeurs/] },
  { nom: 'R8e /api/nos-blocks ignore par la porte de liberation', edits: [['index-routeur.js', 'export function sourcesTbLues() { return indexRouteurLu() && nosBlocksTbLus(); }', 'export function sourcesTbLues() { return indexRouteurLu(); }']], casse: [/^LIB nosvide PEXRA/, /^IDX \/api\/nos-blocks non lu/] },
  { nom: 'R8f liste d index vide acceptee', edits: [['index-routeur.js', '&& graineServie && teteFraiche && rejetes === 0;', '&& teteFraiche && rejetes === 0;']], casse: [/^LIB vide PEXRA/, /^IDX liste vide/] },
  { nom: 'R8g tete figee acceptee', edits: [['index-routeur.js', '&& graineServie && teteFraiche && rejetes === 0;', '&& graineServie && rejetes === 0;']], casse: [/^LIB perime PEXRA/, /^IDX tete figee/] },
  { nom: 'R8h entrees rejetees tolerees', edits: [['index-routeur.js', '&& graineServie && teteFraiche && rejetes === 0;', '&& graineServie && teteFraiche;']], casse: [/^IDX entree au sel faux/] },
  { nom: 'R8i /api/nos-blocks vide marque complet accepte', edits: [['index-routeur.js', '!rep.fenetresRatees && liste.length > 0;', '!rep.fenetresRatees;']], casse: [/^LIB nosvide PEXRA/] },
  { nom: 'R8j blocks servis par /api/nos-blocks ignores', edits: [['pool-sans-hook.js', '|| estNotreBlockServi(a) ||', '||']], casse: [/^CL block seulement dans/] },
  { nom: 'R8k estBlockTb : regle R5 0xb2 retiree', edits: [['pool-sans-hook.js', "return c === 'TB' || (a.startsWith('0xb2') && !DEVISES.has(a) && c !== 'TIERS');", "return c === 'TB' || c === 'INCONNU';"]], casse: [/^CL estBlockTb R5/] },
  { nom: 'R9b EFIX / SMOKE14 hors de la liste statique', edits: [['pool-sans-hook.js', "  '0xb200000000000000000000eedb997f91ceb22b8a', /* EFIX", "  /* '0xb200000000000000000000eedb997f91ceb22b8a', */ /* EFIX"], ['pool-sans-hook.js', "  '0xb200000000000000000000e7e544d1292a095c36', /* SMOKE14", "  /* '0xb200000000000000000000e7e544d1292a095c36', */ /* SMOKE14"]], casse: [/^CL EFIX \/ SMOKE14/, /^CL K2 /] },
  /* R10 : EFIX hors de la liste statique = un block TB absent des sources ; sous R10 il serait LIBERE (sources lues) : la route
   *   d amplification de C2 repasse. C est le risque ACCEPTE par le fondateur (on garde le frais routeur) — et c est pourquoi
   *   l ensemble TB statique doit rester complet : ce mutant le prouve en rougissant la route EFIX. */
  { nom: 'R10b EFIX hors liste statique sous R10 : la route via 0xe1ef repasse (completude de l ensemble TB = la seule garde)', edits: [['pool-sans-hook.js', "  '0xb200000000000000000000eedb997f91ceb22b8a', /* EFIX", "  /* '0xb200000000000000000000eedb997f91ceb22b8a', */ /* EFIX"]],
    casse: [/^REG lu route ETH>\(sans hook\)EFIX>\(0xe1ef\)USDC/, /^REG lu pool Clanker \/ 0xe1ef \(ouvertes a tous\) : EFIX/] },
  /* R10 : la liste blanche (PEXRA + B20 nes o1) ne conditionne plus rien — le mutant R9c (liste explicite seule) ne peut plus rougir ; retire. */
  { nom: 'R5-2a hook payeur de l appelant non filtre (echange)', edits: [['echange.js', '  hooksPaieurs = filtrerHooksPayeurs(hooksPaieurs);', '']], casse: [/^P52 /] },
  { nom: 'R5-2b hook facturant de l appelant non filtre (multipool)', edits: [['multipool.js', '...filtrerHooksPayeurs(extra || []).map(', '...(extra || []).map(']], casse: [/^P52m /] },
  { nom: 'j affichage filtre par le classement', edits: [
    ['lancements-etrangers.js', "import { decoderChaineAbi } from './texte-onchain.js';", "import { decoderChaineAbi } from './texte-onchain.js';\nimport { classeBlock as __cb } from './pool-sans-hook.js';"],
    ['lancements-etrangers.js', "    out.push({ jeton, launchpad: 'B20_AUTO'", "    if (__cb(jeton) !== 'TB') continue;\n    out.push({ jeton, launchpad: 'B20_AUTO'"]], casse: [/^AFF /] },
];
try {
  const dBase = copieBase();
  let base = null;
  if (dBase) {
    const B = { E: await imp(dBase, 'echange.js'), PO: await imp(dBase, 'pool.js') };
    const rpcB = rpcPour(B);
    const USDC = bas((await imp(dBase, 'frais-creation.js')).USDC_BASE);
    base = { achat: (jeton, c) => B.E.planEchange({ rpc: rpcB, chaine: 8453, jeton, compte, sens: 'ACHAT', montant: 10n ** 16n,
      marcheLu: { etat: 'LUE', cle: c, paire: null }, maintenant: MAINTENANT }),
      multi: (sauts, entree, sortie, montant) => B.E.planEchangeMultiSauts({ rpc: rpcB, chaine: 8453, compte, sauts, entree, sortie, montant,
        decimalesEntree: entree === USDC ? 6 : 18, prixUsdEntree: null, maintenant: MAINTENANT }) };
  } else console.log('  (1bb12d6 non disponible par git : comparaison octet pour octet NON EXECUTEE)');
  const reel = await banc(await charger(ICI), { base });
  for (const r of reel) { ok(r.ok, 'depot : ' + r.id + ' — ' + r.detail); if (r.ok) console.log('  ok  ' + r.id); }
  ok(!dBase || reel.some((r) => /^T1 = 1bb12d6/.test(r.id)), 'la comparaison 1bb12d6 a tourne');
  console.log('depot : ' + reel.length + ' verifications, ' + reel.filter((r) => !r.ok).length + ' KO');
  const temoin = await banc(await charger(copie(null)));
  ok(temoin.length > 0 && temoin.every((r) => r.ok), 'copie non mutee : verte');
  for (const M of MUTANTS) {
    const r = await banc(await charger(copie(M)));
    const rouges = r.filter((x) => !x.ok).map((x) => x.id);
    console.log('mutant ' + M.nom + ' : ' + rouges.length + ' rouge(s) — ' + rouges.join(' | '));
    ok(rouges.length > 0, 'mutant ' + M.nom + ' : le banc doit devenir ROUGE');
    for (const re of M.casse) ok(rouges.some((id) => re.test(id)), 'mutant ' + M.nom + ' : doit casser ' + re);
  }
  /* ══ AFFICHAGE, statique : aucun module d affichage ne lit le classement de routage ══ */
  const AFFICHAGE = ['index-blocks.js', 'lancements-etrangers.js', 'fil-live.js', 'mes-blocks.js', 'trending.js', 'origine.js', 'face.js', 'map3d.js'];
  for (const f of AFFICHAGE) {
    const src = fs.existsSync(path.join(ICI, f)) ? fs.readFileSync(path.join(ICI, f), 'utf8') : null;
    ok(src !== null && !/pool-sans-hook\.js|index-routeur\.js/.test(src), 'affichage : ' + f + ' ne lit pas le classement de routage');
  }
  const app = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8');
  ok(!/classeBlock|estBlockTbClasse/.test(app), 'app.html : aucun filtre d affichage sur le classement');
  /* 2026-10-03 : UN usage d indexRouteurLu est admis, et un seul — la garde du sel de createPaid (hook 7030 : sel inconnu ET index
   *   non lu = on attend, on ne fait pas payer deux fois). La RELECTURE, elle, suit toujours sourcesTbLues. */
  ok((app.match(/indexRouteurLu\(/g) || []).length === 1 && /selNe === null && !indexRouteurLu\(\)/.test(app) && (app.match(/!sourcesTbLues\(\)/g) || []).length === 1,
    'app.html : la relecture suit sourcesTbLues (index + /api/nos-blocks)');
  ok(/chargerNosBlocksTb\(/.test(app) && /ajouterNeDuRouteur\(adresseCreee, sNe\)/.test(app), 'app.html : /api/nos-blocks charge, et le block cree est ajoute a l index (ajouterNeDuRouteur)');
  ok((app.match(/noterMarcheSurNotreHook\(/g) || []).length === 4, 'app.html : noterMarcheSurNotreHook seulement a la decouverte des pools');
  const srv = fs.readFileSync(path.join(ICI, 'serveur-web.js'), 'utf8');
  ok(/'index-routeur\.js'/.test(srv) && /chemin === '\/api\/blocks-routeur'/.test(srv), 'serveur : module servi et /api/blocks-routeur expose');
} finally {
  for (const d of tmp) fs.rmSync(d, { recursive: true, force: true });
}
console.log(nAssert + ' assertions, ' + ko + ' KO');
if (nAssert === 0) { console.log('⛔ aucune assertion executee'); process.exit(1); }
process.exit(ko ? 1 : 0);
