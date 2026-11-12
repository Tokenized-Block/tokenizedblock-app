/* test-pool-lanceur-taxe-20261026.mjs — UNE LIGNE DU MARKET DONT LA POOL A HOOK TIERS EST VIDE / TAXE LA REVENTE DIT SA CAUSE LUE, SANS BUY.
 *
 * POURQUOI : 129 lignes du trending (pools ETH / B20, fee 100, tickSpacing 1, un hook par jeton) disaient « its pool cannot be quoted
 *   (empty, or a third-party hook that taxes resale) » — un « ou » qui ne dit pas laquelle. Mesure du 2026-10-26 (pool-lanceur-taxe.js) :
 *   les deux, 129 / 129 — liquidite en cours 0, taxBps 9999 / 10000.
 * CE BANC :
 *   I.   phraseRefusPool : chaque cause lue -> son code ; rien de mesure -> null (la phrase generale reste) ; une taxe incoherente -> null.
 *   II.  lireCauseRefusPool : bons selecteurs vers les bons contrats ; une lecture ratee = NON LUE (null), jamais 0.
 *   III. raisonSansBuy (routage.js, le module de l ecran) : la cause servie passe avant le seuil DexScreener ; un code etranger ne passe
 *        pas ; une ligne achetable ne recoit aucune raison.
 *   IV.  cablage : le serveur pose `l.achatRefus` depuis le verdict ; l ecran le passe a raisonSansBuy ; le module est servi a qui l importe.
 *   IV-b. la VRAIE achatsMarche du serveur executee dans un vm (faux noeud, sans reseau) + 6 mutants sur copies (S1-S4 de la revue).
 *   V.   CHAINE (lecture seule, LIVE=0 pour sauter ; noeud injoignable = sautee et dite) : les 3 pools mesurees (ADOF, BaseDay, replicas)
 *        -> POOL_VIDE_TAXE_REVENTE aujourd hui. TB_SRV=<copie de serveur-web.js> : juge une copie (mutants).
 * Usage : node test-pool-lanceur-taxe-20261026.mjs   (LIVE=0 : sans reseau) */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (!c) { ko += 1; console.log('KO  ' + m); } else console.log('ok  ' + m); return c; };
const imp = async (f) => { try { return await import(pathToFileURL(path.join(ICI, f)).href); } catch (e) { return { __err: String(e.message || e).slice(0, 160) }; } };
const T = await imp('pool-lanceur-taxe.js');
const R = await imp('routage.js');
const P = await imp('pool.js');
if (!ok(!T.__err, 'pool-lanceur-taxe.js importe' + (T.__err ? ' : ' + T.__err : ''))) { console.log(`\n${n - ko}/${n} ok, ${ko} KO`); process.exit(1); }

/* I. phrases */
const pvt = T.phraseRefusPool({ liquidite: 0n, taxBps: 9999n, denom: 10000n });
ok(pvt && pvt.code === 'POOL_VIDE_TAXE_REVENTE' && /99\.99%/.test(pvt.phrase) && /empty/.test(pvt.phrase), 'vide + 9999/10000 -> POOL_VIDE_TAXE_REVENTE, « 99.99% » : ' + (pvt && pvt.phrase));
const pv = T.phraseRefusPool({ liquidite: 0n, taxBps: null, denom: null });
ok(pv && pv.code === 'POOL_VIDE' && !/%/.test(pv.phrase), 'vide, taxe non lue -> POOL_VIDE, aucun pourcentage invente');
const pt = T.phraseRefusPool({ liquidite: 5n, taxBps: 9999n, denom: 10000n });
ok(pt && pt.code === 'TAXE_REVENTE' && /99\.99%/.test(pt.phrase), 'liquide + 9999/10000 -> TAXE_REVENTE');
ok(T.phraseRefusPool({ liquidite: 5n, taxBps: 30n, denom: 10000n }) === null, 'liquide + 0,3 % -> null (pas une cause : la phrase generale reste)');
ok(T.phraseRefusPool({ liquidite: 5n, taxBps: 5000n, denom: 10000n }) === null, 'taxe a 50 % pile -> null (le seuil est strict)');
ok(T.phraseRefusPool({ liquidite: 5n, taxBps: 20000n, denom: 10000n }) === null, 'taxe > denominateur -> null (incoherent, rien d affirme)');
ok(T.phraseRefusPool({ liquidite: 5n, taxBps: 9999n, denom: 0n }) === null, 'denominateur 0 -> null');
ok(T.phraseRefusPool({ liquidite: null, taxBps: null, denom: null }) === null, 'rien lu -> null (une lecture ratee n est pas une pool vide)');
ok(T.phraseRefusPool(null) === null, 'pas de cause -> null');
ok(T.tauxTaxe({ taxBps: 9999n, denom: 10000n }) === 99.99, 'tauxTaxe 9999/10000 = 99.99');

/* II. lecture */
const SV = '0x' + 'a'.repeat(40), HOOK = '0x' + 'b'.repeat(40), ID = '0x' + 'c'.repeat(64);
const motH = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
const vus = [];
const faux = async (to, data) => { vus.push(to + ' ' + data.slice(0, 10)); if (to === SV && data === '0xfa6793d5' + 'c'.repeat(64)) return motH(0); if (to === HOOK && data === '0x3eacd2f8') return motH(9999); if (to === HOOK && data === '0xe1a45218') return motH(10000); throw new Error('unexpected ' + to + ' ' + data); };
const c1 = await T.lireCauseRefusPool({ appel: faux, stateView: SV, cle: { hooks: HOOK }, poolId: ID });
ok(c1.liquidite === 0n && c1.taxBps === 9999n && c1.denom === 10000n && c1.lu === true, 'lecture : liquidite 0, taxBps 9999, denom 10000, lu');
ok(vus.length === 3, '3 eth_call exactement : ' + vus.join(' | '));
ok(P.selecteur && P.selecteur('getLiquidity(bytes32)') === T.SEL_GET_LIQUIDITY && P.selecteur('taxBps()') === T.SEL_TAX_BPS, 'selecteurs recalcules par keccak : getLiquidity, taxBps');
const panne = async () => { throw new Error('429'); };
const c2 = await T.lireCauseRefusPool({ appel: panne, stateView: SV, cle: { hooks: HOOK }, poolId: ID });
ok(c2.liquidite === null && c2.lu === false && T.phraseRefusPool(c2) === null, 'noeud qui refuse -> NON LUE (null), aucune phrase');
vus.length = 0;
const c3 = await T.lireCauseRefusPool({ appel: faux, stateView: SV, cle: { hooks: '0x0000000000000000000000000000000000000000' }, poolId: ID });
ok(c3.taxBps === null && vus.length === 1, 'pool sans hook : seule la liquidite est lue');

/* III. ecran */
ok(!R.__err && Array.isArray(R.CODES_REFUS_SERVI), 'routage.js expose CODES_REFUS_SERVI' + (R.__err ? ' : ' + R.__err : ''));
const v0 = R.verdictRoutage ? R.verdictRoutage({ aMarche: true, dex: 'uniswap', poolAdr: null }) : null;
const r1 = R.raisonSansBuy && R.raisonSansBuy(v0, { liqOk: false, liqMin: 500, refusServi: pvt });
ok(r1 && r1.code === 'POOL_VIDE_TAXE_REVENTE' && r1.phrase === pvt.phrase, 'cause servie AVANT le seuil DexScreener : ' + (r1 && r1.code));
const r2 = R.raisonSansBuy && R.raisonSansBuy(v0, { liqOk: true, refusServi: { code: 'AUTRE', phrase: 'Buy now!' } });
ok(r2 && r2.code === 'NON_COTEE', 'code etranger -> ignore, phrase generale : ' + (r2 && r2.code));
const r3 = R.raisonSansBuy && R.raisonSansBuy({ achetableEnEth: true }, { liqOk: true, refusServi: pvt });
ok(r3 === null, 'ligne achetable -> aucune raison (la cause servie ne masque pas un Buy reel)');
const r4 = R.raisonSansBuy && R.raisonSansBuy(v0, { liqOk: true });
ok(r4 && r4.code === 'NON_COTEE', 'sans cause servie : la phrase d avant, inchangee');

/* IV. cablage */
const srv = readFileSync(process.env.TB_SRV || path.join(ICI, 'serveur-web.js'), 'utf8'); /* TB_SRV : une COPIE mutee, pour prouver le banc rouge */
const app = readFileSync(path.join(ICI, 'app.html'), 'utf8');
ok(/import \{ lireCauseRefusPool, phraseRefusPool(?:, [A-Za-z]+)* \} from '\.\/pool-lanceur-taxe\.js'/.test(srv) /* game374: + gardeTaxeAvantAchat */,'serveur : importe pool-lanceur-taxe.js');
ok(/l\.achatRefus = \{ code: v\.refus\.code, phrase: v\.refus\.phrase \}/.test(srv) && /l\.achatRefus = null;/.test(srv), 'serveur : pose l.achatRefus depuis le verdict, remis a null a chaque tour');
ok(/refus: phraseRefusPool\(cause\)/.test(srv) && /achatsParJeton\.set\(jeton, \{ t: Date\.now\(\), empreinte, v \}\)/.test(srv), 'serveur : la cause est gardee AVEC le verdict (meme cache)');
ok(/raisonSansBuy\(vR, \{ liqOk, liqMin: LIQ_MIN_BUY_USD, refusServi: l\.achatRefus \}\)/.test(app), 'ecran : la ligne passe l.achatRefus a raisonSansBuy');

/* IV-b. 2026-10-26 (revue adverse wf6-launcher, defaut 1 : le cablage serveur n etait verifie que par regex, 4 mutants S1-S4 survivaient) :
 *   la VRAIE achatsMarche de serveur-web.js (non exportee), extraite et executee dans un vm, avec les VRAIS modules (achat-marche.js,
 *   pool-lanceur-taxe.js, pool.js, index-routeur.js) et un faux noeud qui ne connait QUE la vraie poolId de la cle (une autre poolId lit 0,
 *   comme sur la chaine pour une pool qui n existe pas). Deterministe, sans reseau. */
const vm = await import('node:vm');
const TK = await imp('tokenomics.js'); /* game374: estNotreHook for the tax guard */
const AM = await imp('achat-marche.js'), IR = await imp('index-routeur.js'), LP = await imp('lancer-pool.js'), EC = await imp('echange.js');
const iA = srv.indexOf('const ACHAT_CACHE_MS = '), iF = srv.indexOf('async function achatsMarche(lignes) {');
const fA = iF < 0 ? null : /\r?\n\}/.exec(srv.slice(iF));
const srcAchats = iA >= 0 && fA ? srv.slice(iA, iF + fA.index + fA[0].length) : null;
if (ok(!!srcAchats && !AM.__err && !IR.__err && !LP.__err && !EC.__err, 'serveur : achatsMarche extraite de serveur-web.js, modules importes')) {
  const ETH0 = '0x0000000000000000000000000000000000000000';
  /* ADOF et son hook : copies de la section V (cles mesurees le 2026-10-26), jamais recompletees */
  const JETON = '0xb200000000000000000000d83f3b67055baa2938', HOOKR = '0xe4af54e1bb9d710a08c45f9bcf5b88e81d2380cc';
  const CLE = { currency0: ETH0, currency1: JETON, fee: 100, tickSpacing: 1, hooks: HOOKR }, PID = P.poolId(CLE).toLowerCase();
  const SVr = String(LP.V4_ADRESSES[8453].stateView).toLowerCase(), QR = String(EC.QUOTEUR[8453]).toLowerCase();
  const serveurVm = (o, src = srcAchats) => {
    const etat = { appels: [], stateView: 0, ...o };
    const rpcRails = async (meth, params) => {
      const to = String(params[0].to).toLowerCase(), data = String(params[0].data).toLowerCase();
      etat.appels.push(to + ' ' + data.slice(0, 10));
      if (to === QR) { if (etat.quote != null) return motH(etat.quote) + '0'.repeat(64); throw new Error(etat.quoteErreur); } /* game374: a QUOTED pool */
      if (to === SVr && data.startsWith('0x' + T.SEL_GET_LIQUIDITY)) { etat.stateView += 1; if (etat.causePanne) throw new Error('429'); return motH('0x' + data.slice(10) === PID ? etat.liquidite : 0n); }
      if (to === HOOKR && data === '0x' + T.SEL_TAX_BPS) {
        etat.lecturesTaxe = (etat.lecturesTaxe || 0) + 1;
        if (etat.taxe === 'revert') { const e = new Error('execution reverted'); e.definitif = true; throw e; }
        if (etat.taxe === 'panne') throw new Error('429 Too Many Requests');
        return motH(etat.taxBps);
      }
      if (to === HOOKR && data === '0x' + T.SEL_TAX_DENOM) return motH(10000);
      throw new Error('unexpected ' + to + ' ' + data.slice(0, 10));
    };
    const corpsIdx = () => JSON.stringify({ ok: true, blocks: IR.GRAINE_ROUTEUR.map((g) => ({ jeton: g.jeton, sel: g.sel })), tete: 60000000, jusqua: 60000000, teteLueA: Date.now(), couvertureComplete: true, fenetresRatees: 0 });
    const corpsNos = () => JSON.stringify({ ok: true, blocks: ['0xb2000000000000000000000000000000000000aa'], tete: 60000000, jusqua: 60000000, teteLueA: Date.now(), couvertureComplete: true, fenetresRatees: 0 });
    const ctx = vm.createContext({ clesCache: new Map([[JETON, { ok: true, cles: [{ ...CLE, poolId: PID }] }]]), clesPool: new Map(),
      chargerIndexRouteur: IR.chargerIndexRouteur, chargerNosBlocksTb: IR.chargerNosBlocksTb, sourcesTbLues: IR.sourcesTbLues, blocksRouteurCorps: corpsIdx, nosBlocksCorps: corpsNos,
      quoterV4: AM.quoterV4, verdictAchatMarche: AM.verdictAchatMarche, lireCauseRefusPool: T.lireCauseRefusPool, phraseRefusPool: T.phraseRefusPool,
      gardeTaxeAvantAchat: T.gardeTaxeAvantAchat, estNotreHookAchat: TK.estNotreHook, /* game374 */
      V4_ADRESSES: LP.V4_ADRESSES, poolIdV4: P.poolId, rpcRails, console: { log() {} } });
    const achatsMarche = vm.runInContext(src + '\nachatsMarche;', ctx);
    return { achatsMarche, etat };
  };
  const REVERT = 'execution reverted: 0x6190b2b0';
  const jugerServeur = async (src) => {
    const fautes = [], run = async (o) => { const s = src(o); const l = [{ adr: JETON }]; const c = await s.achatsMarche(l); return { s, l, c }; };
    /* (a) pool vide + taxe : la ligne porte POOL_VIDE_TAXE_REVENTE, 1 lecture de cause, 3 eth_call de cause */
    const a = await run({ quoteErreur: REVERT, liquidite: 0n, taxBps: 9999n });
    if (!(a.l[0].achatRefus && a.l[0].achatRefus.code === 'POOL_VIDE_TAXE_REVENTE' && a.c.lecturesCause === 1 && a.c.refusCauses.POOL_VIDE_TAXE_REVENTE === 1 && a.c.refusees === 1)) fautes.push('(a) vide+taxe : ' + JSON.stringify(a.l[0].achatRefus) + ' causes ' + a.c.lecturesCause);
    /* (b) pool LIQUIDE (5) + taxe : TAXE_REVENTE - une poolId fausse lirait 0 et dirait « empty » */
    const b = await run({ quoteErreur: REVERT, liquidite: 5n, taxBps: 9999n });
    if (!(b.l[0].achatRefus && b.l[0].achatRefus.code === 'TAXE_REVENTE')) fautes.push('(b) liquide+taxe : ' + JSON.stringify(b.l[0].achatRefus));
    /* (c) lecture du devis ratee (429, pas un revert) : aucune lecture de cause, ligne non mesuree, rien de garde */
    const c = await run({ quoteErreur: '429 Too Many Requests', liquidite: 0n, taxBps: 9999n });
    if (!(c.s.etat.stateView === 0 && c.c.lecturesCause === 0 && c.c.nonMesures === 1 && c.l[0].achatRefus === null)) fautes.push('(c) devis rate : ' + c.s.etat.stateView + ' lecture(s) StateView, causes ' + c.c.lecturesCause + ', nonMesures ' + c.c.nonMesures);
    /* (d) meme serveur, tour suivant : la cause sort du cache AVEC le verdict, zero eth_call */
    const n0 = a.s.etat.appels.length, l2 = [{ adr: JETON, achatRefus: { code: 'VIEUX', phrase: 'x' } }], c2 = await a.s.achatsMarche(l2);
    if (!(c2.depuisCache === 1 && a.s.etat.appels.length === n0 && l2[0].achatRefus && l2[0].achatRefus.code === 'POOL_VIDE_TAXE_REVENTE')) fautes.push('(d) cache : depuisCache ' + c2.depuisCache + ', appels +' + (a.s.etat.appels.length - n0) + ', ' + JSON.stringify(l2[0].achatRefus));
    /* (e) ligne sans cle connue : remise a null (un refus d un tour precedent ne reste pas affiche) */
    const e = src({ quoteErreur: REVERT, liquidite: 0n, taxBps: 9999n }), le = [{ adr: '0x' + '1'.repeat(40), achatRefus: { code: 'VIEUX' } }]; const ce = await e.achatsMarche(le);
    if (!(le[0].achatRefus === null && ce.sansCle === 1)) fautes.push('(e) sans cle : ' + JSON.stringify(le[0].achatRefus));
    /* game374 (audit R-launch-5) — a pool the Quoter QUOTES, on a hook that taxes resale: before, it got a Buy (prod 2026-11-12, 3 rows) */
    const f = await run({ quote: 10n ** 20n, liquidite: 5n, taxBps: 9999n });
    if (!(f.l[0].achat === null && f.l[0].achatRefus && f.l[0].achatRefus.code === 'TAXE_REVENTE' && f.c.refusCauses.TAXE_REVENTE === 1)) fautes.push('(f) devis + taxe 9999 : achat ' + JSON.stringify(f.l[0].achat) + ' refus ' + JSON.stringify(f.l[0].achatRefus));
    /* (g) quoted, the hook has no taxBps() (revert): the Buy stays */
    const g = await run({ quote: 10n ** 20n, liquidite: 5n, taxe: 'revert' });
    if (!(g.l[0].achat && g.l[0].achatRefus === null && g.s.etat.lecturesTaxe === 1)) fautes.push('(g) devis + pas de taxBps : achat ' + JSON.stringify(g.l[0].achat) + ' lectures ' + g.s.etat.lecturesTaxe);
    /* (h) quoted, the tax read fails (429): no Buy this round, nothing kept, counted as not measured */
    const h = await run({ quote: 10n ** 20n, liquidite: 5n, taxe: 'panne' });
    if (!(h.l[0].achat === null && h.c.nonMesures === 1 && h.c.achetables === 0)) fautes.push('(h) devis + taxe non lue : achat ' + JSON.stringify(h.l[0].achat) + ' nonMesures ' + h.c.nonMesures);
    return fautes;
  };
  const fS = await jugerServeur((o) => serveurVm(o));
  ok(fS.length === 0, 'serveur (vm) : vide+taxe, liquide+taxe, devis rate, cache, sans cle -> la ligne porte la cause LUE' + (fS.length ? ' : ' + fS.join(' ; ') : ''));
  /* les mutants S1-S4 de la revue (et deux de plus), sur des COPIES en memoire de la source extraite : chacun ROUGE */
  const MUTANTS_SRV = [
    ['S1 poolId d une cle au hook nul', 'poolId: poolIdV4(cle) });', "poolId: poolIdV4({ ...cle, hooks: '0x0000000000000000000000000000000000000000' }) });"],
    ['S2 !lectureRatee retire', 'if (!lectureRatee && !v.achetable && v.nonCotees.length) {', 'if (!v.achetable && v.nonCotees.length) {'],
    ['S3 hook retire avant la lecture de la taxe', 'tickSpacing: k.tickSpacing, hooks: k.hooks };', 'tickSpacing: k.tickSpacing };'],
    ['S4 cause jamais servie sur la ligne', 'l.achatRefus = { code: v.refus.code, phrase: v.refus.phrase };', 'void 0;'],
    ['S5 cause hors du cache', "if (!lectureRatee) achatsParJeton.set(jeton, { t: Date.now(), empreinte, v });", "if (!lectureRatee) achatsParJeton.set(jeton, { t: Date.now(), empreinte, v: { ...v, refus: null } });"],
    ['S6 achatRefus pas remis a null', '    l.achatRefus = null;\n', '\n'],
    /* game374 : la garde de taxe AVANT le Buy retiree, puis rendue « fail open » */
    ['S7 garde de taxe retiree', 'if (taxe) v = { ...v, achetable: false, refus: taxe };', 'void taxe;'],
    ['S8 taxe non lue = achat garde', "if (taxe && taxe.code === 'TAXE_NON_LUE') { compte.nonMesures += 1; continue; }", 'if (false) {}'],
  ];
  for (const [nom, de, vers] of MUTANTS_SRV) {
    const s = srcAchats.replace(/\r\n/g, '\n');
    if (s.split(de).length !== 2) { ok(false, 'mutant serveur introuvable ou non unique : ' + nom); continue; }
    let rouge; try { rouge = (await jugerServeur((o) => serveurVm(o, s.replace(de, vers)))).length > 0; } catch (_) { rouge = true; }
    ok(rouge, 'mutant serveur « ' + nom + ' » : ROUGE');
  }
}

/* V. chaine (lecture seule) */
if (process.env.LIVE !== '0') {
  const NOEUD = process.env.RPC || 'https://base-rpc.publicnode.com';
  let id = 0;
  const appel = async (to, data) => { const r = await fetch(NOEUD, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: 'eth_call', params: [{ to, data }, 'latest'] }) }).then((x) => x.json()); if (r.error) throw new Error(r.error.message); return r.result; };
  const L = await imp('lancer-pool.js');
  const ETH = '0x0000000000000000000000000000000000000000';
  /* le noeud d abord : injoignable = section SAUTEE et dite (hors ligne), jamais 3 KO de lecture ; joignable = les 3 assertions comptent */
  let tete = null;
  try { const r = await fetch(NOEUD, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: 'eth_blockNumber', params: [] }), signal: AbortSignal.timeout(8000) }).then((x) => x.json()); tete = r && r.result ? parseInt(r.result, 16) : null; } catch (_) { tete = null; }
  if (tete === null) console.log('--  V. chaine sautee : noeud ' + NOEUD + ' injoignable (LIVE=0 pour la sauter sans essayer)');
  else for (const [sym, jeton, hooks] of [['ADOF', '0xb200000000000000000000d83f3b67055baa2938', '0xe4af54e1bb9d710a08c45f9bcf5b88e81d2380cc'],
    ['BaseDay', '0xb200000000000000000000e47efb88cbb6418de4', '0xb03e31adaacbc78c739baed8ee60e42f1323a8c4'],
    ['replicas', '0xb2000000000000000000008d7319e4c7e7928510', '0xdaba36389d4ac80664d56cc9bb675b779c8f00cc']]) {
    const cle = { currency0: ETH, currency1: jeton, fee: 100, tickSpacing: 1, hooks };
    const c = await T.lireCauseRefusPool({ appel, stateView: L.V4_ADRESSES[8453].stateView, cle, poolId: P.poolId(cle) });
    const ph = T.phraseRefusPool(c);
    ok(c.lu && ph && ph.code === 'POOL_VIDE_TAXE_REVENTE', 'chaine ' + sym + ' : liquidite ' + c.liquidite + ', taxBps ' + c.taxBps + '/' + c.denom + ' -> ' + (ph && ph.code));
  }
} else console.log('--  V. chaine sautee (LIVE=0)');
console.log(`\n${n - ko}/${n} ok, ${ko} KO`);
process.exit(ko ? 1 : 0);
