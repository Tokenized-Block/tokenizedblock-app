/* payer-avec-harnais-20261024.mjs — LE HARNAIS DES BANCS « Pay with » (test-payer-avec-20261024, banc-payer-avec-fork-20261024).
 * Il EXECUTE le vrai code de app.html : le bloc « PAY WITH » entier (de son commentaire de tete a son ecouteur 'change') et les flux
 * payants de la carte Draws (rollPaye, autoRollLot, passPaye, slotsAgir) avec envoyerAppels / envoyerUnParUn / recusLogs, tels qu ils
 * sont dans le texte. Les modules sont les VRAIS (misables.js, blockrolls-plan.js, slots-plan.js, envoi.js, groupe-wallet.js…) ; seuls
 * l ecran ($, document), le wallet (window.ethereum) et la chaine (rpc) sont remplaces — par ce que l appelant fournit.
 * Il fournit aussi une CHAINE FACTICE nourrie par la mesure enregistree (mesures/misables-20261024.json : slot0, USDC des pools, factory,
 * devis exact-output aux trois tailles — un montant entre deux tailles est cote au prorata de la taille qui le couvre, arrondi au-dessus).
 * Ce n est pas un test : il ne verifie rien lui-meme. */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as MIS from './misables.js';
import * as Slots from './slots-plan.js';
import * as BR from './blockrolls-plan.js';
import { usdc as usdcTexte, passActif } from './rolls-jeu.js';
import { USDC_BASE } from './frais-creation.js';
import { capaciteDeGroupement } from './groupe-wallet.js';
import { envoyerLotAtomique, envoyerDepuisWallet } from './envoi.js';
import { selecteur } from './keccak.js';
/* 2026-10-24 (revue adverse D1/D2) : la phrase d un paiement en jeton arrete en route et ses approbations (opts.arret : une copie mutee) */
import * as PA_REEL from './payer-arret.js';
/* 2026-10-28 : UNIT (payer-unit.js), importe par app.html dans le bloc PAY WITH — le VRAI module (opts.unit : une copie mutee) */
import * as PU_REEL from './payer-unit.js';
/* 2026-10-25 (#payerTous) : le verdict Buy du Market, avec les modules que app.html importe pour lui */
import { verdictRoutage, raisonSansBuy } from './routage.js';
import { avecPoolAction } from './pools-actions-aerodrome.js';
import { ACTIONS_COINBASE } from './paires.js';
const ACTIONS_PAR_ADR = new Set(ACTIONS_COINBASE.map((a) => String(a.adr).toLowerCase()));
/* le seuil de liquidite du Buy du Market, LU dans le texte (pas tape ici) ; NaN si la ligne a change : tout Buy tombe, le banc rougit */
export const liqMinBuy = (t) => { const m = /\nconst LIQ_MIN_BUY_USD = (\d+);/.exec(t); return m ? Number(m[1]) : NaN; };
/* la ligne du Market telle que peindreTrending la rend (l IIFE de son bouton), extraite du texte et executee : 'acheter' / 'fiche' / null */
export function decisionMarche(t, deps) {
  const i = t.indexOf('function peindreTrending() {');
  const a = i < 0 ? -1 : t.indexOf('    + (function () {', i), b = a < 0 ? -1 : t.indexOf("      })() + '</li>'", a);
  if (a < 0 || b < 0) return null;
  const corps = t.slice(a + '    + '.length, b + '      })()'.length);
  const f = new Function('l', 'poolDecouvertPour', 'LIQ_MIN_BUY_USD', 'avecPoolAction', 'verdictRoutage', 'ACTIONS_PAR_ADR', 'TBLOCK', 'enTexte', 'raisonSansBuy', 'return ' + corps + ';');
  return (l) => {
    const html = f(l, deps.poolDecouvertPour || (() => null), liqMinBuy(t), avecPoolAction, verdictRoutage, ACTIONS_PAR_ADR, '0x' + '0'.repeat(40), (x) => String(x), deps.raisonSansBuy || raisonSansBuy);
    return /data-acheter-rail="/.test(html) ? 'rail' : /data-acheter-fiche="/.test(html) ? 'fiche' : /data-acheter="/.test(html) ? 'acheter' : null;
  };
}

export const lireApp = (f = 'app.html') => readFileSync(new URL('./' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
/* l app.html d un commit (git show) — pour comparer le chemin USDC a celui d AVANT ; null si git ne repond pas */
export function appDuCommit(sha) {
  try { return execFileSync('git', ['show', sha + ':app.html'], { cwd: new URL('.', import.meta.url), maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' }).replace(/\r\n/g, '\n'); }
  catch (_) { return null; }
}
/* une declaration de fonction au niveau du module (comme test-draws-statuts) */
export function fonction(t, debut) {
  const d = new RegExp('(?:^|\\n)(' + debut.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')').exec(t);
  if (!d) return '';
  const i = d.index + d[0].length - d[1].length;
  const fin = /\n\}(?=\n)/g; fin.lastIndex = i;
  const m = fin.exec(t);
  return m ? t.slice(i, m.index + m[0].length) + '\n' : '';
}
export function blocPayer(t) {
  const i = t.indexOf('/* ══ PAY WITH (2026-10-24');
  if (i < 0) return '';
  const j = t.indexOf("$('#payerJeton').addEventListener('change'", i);
  if (j < 0) return '';
  return t.slice(i, t.indexOf('\n', j) + 1);
}
const ligneConst = (t, debut) => { const i = t.indexOf('\n' + debut); return i < 0 ? '' : t.slice(i + 1, t.indexOf('\n', i + 1) + 1); };
/* 2026-11-15: envoyerAppels now counts and delegates to envoyerAppelsSansCompte (the former body): both are extracted */
const FLUX = ['rollPaye', 'passPaye', 'autoRollLot', 'slotsAgir', 'envoyerAppels', 'envoyerAppelsSansCompte', 'envoyerUnParUn', 'recusLogs', 'phraseNonConfirme', 'phraseSettle'];

/* setTimeout immediat pour les attentes d envoi.js / groupe-wallet.js (pause 1,5 s x N) : macrotache, donc une promesse deja resolue
 *   gagne toujours la course contre un delai (avecDelai) */
export function tempsRapide() {
  const vrai = globalThis.setTimeout;
  globalThis.setTimeout = (f, _ms, ...a) => { setImmediate(f, ...a); return 0; };
  return () => { globalThis.setTimeout = vrai; };
}

/* ─────────────────────────────── l ecran factice ─────────────────────────────── */
export function ecran() {
  const els = new Map(), ecrits = [];
  const el = (id) => {
    if (!els.has(id)) {
      /* 2026-10-25 : + payerTous / payerTousNote (hidden dans le HTML), et `open` du <details> */
      const e = { id, hidden: ['payerAvec', 'payerLab', 'payerJeton', 'payerNote', 'payerTous', 'payerTousNote'].includes(id), open: false, disabled: false, _v: '', innerHTML: '', dataset: {}, options: [], ecouteurs: {},
        setAttribute() {}, addEventListener(k, f) { this.ecouteurs[k] = f; }, replaceChildren(...o) { this.options = o; },
        /* integration 2026-10-25 : passPaye pose un lien Fees & risks apres son texte */
        append(...xs) { this._t = (this._t || '') + xs.map((x) => (typeof x === 'string' ? x : x.textContent || '')).join(''); } };
      /* 2026-10-24 : comme le DOM, ecrire textContent efface les enfants (les boutons d un arret, poses par insertAdjacentHTML) */
      Object.defineProperty(e, 'textContent', { get() { return this._t || ''; }, set(v) { this._t = String(v); this.innerHTML = ''; ecrits.push({ id, texte: String(v) }); } });
      e.insertAdjacentHTML = function (_ou, html) { this.innerHTML = String(this.innerHTML || '') + html; };
      Object.defineProperty(e, 'value', { get() { return this._v; }, set(v) { this._v = String(v); } });
      els.set(id, e);
    }
    return els.get(id);
  };
  const document = { createElement: () => ({ value: '', textContent: '', disabled: false, className: '', href: '' }), getElementById: (id) => el(id), querySelector: () => null, hidden: false };
  return { $: (s) => (String(s).startsWith('#') ? el(String(s).slice(1)) : null), el, els, ecrits, document };
}

/* ─────────────────────────────── la chaine factice (mesure enregistree) ─────────────────────────────── */
/* 2026-10-25 : l enregistrement est un PARAMETRE (o.mesure de chaineFactice, argument de lignesServies). Le defaut reste celui du 24/10
 *   (bloc 53 031 600) : les bancs qui ne l ont pas demande (payer-arret, reponse-spin, le banc fork) gardent leurs chiffres ;
 *   test-payer-avec passe MESURE_20261025 (bloc 53 048 993, mesure-misables-20261024.mjs relancee le 25/10). */
export const lireMesure = (nom) => JSON.parse(readFileSync(new URL('./mesures/' + nom, import.meta.url), 'utf8'));
export const MESURE = lireMesure('misables-20261024.json');
export const MESURE_20261025 = lireMesure('misables-live-20261025.json');
const MESURE_DEFAUT = MESURE;
const bas = (x) => String(x || '').toLowerCase();
const mot = (v) => BigInt(v).toString(16).padStart(64, '0');
const hex = (v) => '0x' + BigInt(v).toString(16);
const SEL = { quote: selecteur(MIS.SIG.quoteExactOutputSingle), slot0: selecteur('slot0()'), bal: selecteur('balanceOf(address)'), factory: selecteur('factory()'), dec: selecteur('decimals()') };

/**
 * @param {object} o  { soldes: Map(jeton -> brut) du joueur (ETH : cle 0x0…0), joueur, tete, apresDevis (blocs ajoutes a la tete apres
 *                    le premier devis), deriveDevis (bruts ajoutes a chaque nouveau devis), ecartForce (Map pool -> facteur sur le devis) }
 */
export function chaineFactice(o = {}) {
  const MESURE = o.mesure || MESURE_DEFAUT;
  const pools = new Map(), routesParCle = new Map(), decs = new Map();
  for (const t of MESURE.table) {
    decs.set(bas(t.jeton), t.decimales);
    for (const r of t.routes || []) {
      if (!r.pool) continue;
      pools.set(bas(r.pool), { sqrt: r.sqrtPriceX96, usdc: r.usdcPool, factory: r.factory });
      routesParCle.set(bas(r.jetonIn) + ':' + Number(r.tickSpacing) + ':' + bas(r.pool), r);
      if (!routesParCle.has(bas(r.jetonIn) + ':' + Number(r.tickSpacing))) routesParCle.set(bas(r.jetonIn) + ':' + Number(r.tickSpacing), r);
    }
    if (t.marche && t.marche.poolAdr && !pools.has(bas(t.marche.poolAdr))) pools.set(bas(t.marche.poolAdr), { sqrt: t.marche.sqrtPriceX96, usdc: t.marche.usdcPool, factory: t.marche.factory });
  }
  const st = { tete: o.tete ?? MESURE.bloc, ts: MESURE.horodatageBloc, devis: 0, appels: [], soldes: o.soldes || new Map(), joueur: bas(o.joueur), apresDevis: o.apresDevis || 0, deriveDevis: BigInt(o.deriveDevis || 0), ecartForce: o.ecartForce || new Map(), recus: new Map() };
  const devisDe = (jetonIn, out, ts) => {
    const r = routesParCle.get(bas(jetonIn) + ':' + ts);
    if (!r || !Array.isArray(r.devis)) throw new Error('execution reverted: no pool');
    /* la plus petite taille enregistree qui couvre `out` ; au-dessus de 10 USDC (le frais d interface : 10,01 USDC pour un pass), la plus
     *   grande, si elle couvre a 0,5 % pres */
    const oks = r.devis.filter((x) => x.ok).sort((a, b) => (BigInt(a.usdc) < BigInt(b.usdc) ? -1 : 1));
    const d = oks.find((x) => BigInt(x.usdc) >= out) || (oks.length && out * 1000n <= BigInt(oks[oks.length - 1].usdc) * 1005n ? oks[oks.length - 1] : null);
    if (!d) throw new Error('execution reverted: SPL');
    let m = (BigInt(d.montantIn) * out + BigInt(d.usdc) - 1n) / BigInt(d.usdc);
    const f = st.ecartForce.get(bas(r.pool)); if (f) m = (m * BigInt(Math.round(f * 10000))) / 10000n;
    return m + st.deriveDevis * BigInt(st.devis);
  };
  const rpc = async (methode, params = []) => {
    st.appels.push({ methode, params });
    if (methode === 'eth_blockNumber') return hex(st.tete);
    if (methode === 'eth_getBlockByNumber') return { number: hex(st.tete), timestamp: hex(st.ts + 2 * (st.tete - MESURE.bloc)) };
    if (methode === 'eth_estimateGas') return '0x30d40';
    if (methode === 'eth_getTransactionReceipt') return { status: '0x1', logs: [], transactionHash: params[0], blockNumber: hex(st.tete) };
    if (methode === 'eth_getBalance') return hex(st.soldes.get(MIS.ETH) || 0n);
    if (methode === 'eth_call') {
      const to = bas(params[0].to), data = bas(params[0].data), sel = data.slice(0, 10);
      if (to === MIS.QUOTEUR_CL && sel === SEL.quote) {
        const w = (i) => '0x' + data.slice(10 + 64 * i, 10 + 64 * (i + 1));
        const tokenIn = '0x' + w(0).slice(-40), out = BigInt(w(2)), tsW = BigInt(w(3));
        const ts = Number(tsW >= (1n << 255n) ? tsW - (1n << 256n) : tsW);
        const m = devisDe(tokenIn, out, ts);
        st.devis += 1;
        if (st.devis === 1 && st.apresDevis) st.tete += st.apresDevis;
        return '0x' + mot(m) + mot(0) + mot(0) + mot(0);
      }
      if (sel === SEL.slot0 && pools.has(to)) return '0x' + mot(pools.get(to).sqrt) + mot(0).repeat(6);
      if (sel === SEL.factory && pools.has(to)) return '0x' + mot(BigInt(pools.get(to).factory));
      if (sel === SEL.bal) {
        const qui = '0x' + data.slice(34, 74);
        if (to === MIS.USDC && pools.has(qui)) return '0x' + mot(pools.get(qui).usdc);
        if (qui === st.joueur) return '0x' + mot(st.soldes.get(to) || 0n);
        return '0x' + mot(0);
      }
      if (sel === SEL.dec && decs.has(to)) return '0x' + mot(decs.get(to));
      return '0x' + mot(0);
    }
    throw new Error('fake chain: ' + methode + ' not served');
  };
  return { rpc, st };
}

/* la liste servie (/api/misables) : la VRAIE regle du serveur (coterMisableTailles -> ligneMisable -> listeMisables) sur la chaine
 *   factice, references = la pool du Market enregistree (cotee en USDC) */
export async function lignesServies(MESURE = MESURE_DEFAUT) {
  const { rpc } = chaineFactice({ mesure: MESURE });
  const refs = new Map();
  for (const t of MESURE.table) if (t.marche && t.marche.poolAdr && /USDC/.test(String(t.marche.quoteSym || ''))) refs.set(bas(t.jeton), { pool: bas(t.marche.poolAdr) });
  const lignes = [];
  for (const c of MIS.CANDIDATS_CL) {
    const cot = await MIS.coterMisableTailles({ rpc, candidat: c, sorties: MIS.TAILLES_USDC, reference: refs.get(c.jeton) || null, bloc: MESURE.bloc }).catch((e) => ({ etat: 'NON_MESURE', pourquoi: String(e.message) }));
    lignes.push(MIS.ligneMisable(c, cot));
  }
  const liste = MIS.listeMisables(lignes);
  return JSON.parse(JSON.stringify(liste, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
}

/* ─────────────────────────────── le wallet factice ─────────────────────────────── */
/** mode 'lot' : declare atomic « supported », execute wallet_sendCalls ; mode 'suite' : ne connait ni getCapabilities ni sendCalls */
export function walletFactice({ mode = 'lot', joueur, chaine = '0x2105', envoyer = null } = {}) {
  const requetes = [];
  let n = 0;
  const eth = {
    async request(q) {
      const trace = { method: q.method, params: JSON.parse(JSON.stringify(q.params || null)) };
      requetes.push(trace);
      try { return await repondre(q); } catch (e) { trace.refuse = String(e.message); throw e; }
    },
  };
  async function repondre({ method, params }) {
    {
      if (method === 'eth_chainId') return chaine;
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [joueur];
      if (method === 'wallet_getCapabilities') {
        if (mode !== 'lot') { const e = new Error('The method wallet_getCapabilities is not supported'); e.code = 4200; throw e; }
        return { [chaine]: { atomic: { status: 'supported' } } };
      }
      if (method === 'wallet_sendCalls') {
        if (mode !== 'lot') { const e = new Error('Method not supported: wallet_sendCalls'); e.code = 4200; throw e; }
        const hs = envoyer ? await envoyer('lot', params[0].calls) : params[0].calls.map(() => '0x' + (++n).toString(16).padStart(64, '0'));
        return { id: 'lot-' + n + '-' + hs.join(',') };
      }
      if (method === 'wallet_getCallsStatus') {
        const hs = String(params[0]).split('-').slice(2).join('-').split(',');
        return { status: 200, receipts: hs.map((h) => ({ status: '0x1', transactionHash: h })) };
      }
      if (method === 'eth_sendTransaction') {
        if (envoyer) return (await envoyer('tx', [params[0]]))[0];
        return '0x' + (++n).toString(16).padStart(64, '0');
      }
      throw new Error('fake wallet: ' + method);
    }
  }
  return { eth, requetes };
}
/* les appels que le wallet a recus, dans l ordre (lot ou suite) */
export function appelsEnvoyes(requetes) {
  const out = [];
  for (const r of requetes) {
    if (r.refuse) continue; /* le wallet a refuse cette requete : rien n est parti */
    if (r.method === 'wallet_sendCalls') for (const c of r.params[0].calls) out.push({ to: bas(c.to), data: bas(c.data), value: BigInt(c.value || '0x0'), via: 'lot', atomicRequired: r.params[0].atomicRequired === true, version: r.params[0].version });
    if (r.method === 'eth_sendTransaction') { const c = r.params[0]; out.push({ to: bas(c.to), data: bas(c.data), value: BigInt(c.value || '0x0'), via: 'tx' }); }
  }
  return out;
}

/* ─────────────────────────────── le code de l app, charge ─────────────────────────────── */
export const ROLLS = '0x' + 'cc'.repeat(20), SLOTS = '0x' + 'dd'.repeat(20);
/**
 * Charge le bloc PAY WITH et les flux depuis le TEXTE `t` (app.html ou une copie mutee), avec `opts` :
 *   { compte, rpc, eth, lignes (le corps de /api/misables), rollsCfg, slotsJ, sansMisables }
 * Rend { api, ecran, fetchs }.
 */
export function charger(t, opts = {}) {
  const src = [blocPayer(t), ligneConst(t, 'const recuDe = '), ...FLUX.map((k) => fonction(t, 'async function ' + k + '(') || fonction(t, 'function ' + k + '('))].join('\n');
  const ec = ecran();
  const fetchs = [];
  const rollsCfg = opts.rollsCfg === undefined ? { contrat: ROLLS, prixRoll: '500000', prixPass: '10000000', passRolls: 3, bloc: 1 } : opts.rollsCfg;
  const slotsCfg = { j: opts.slotsJ === undefined ? { ok: true, contrat: SLOTS, prixSpin: '500000' } : opts.slotsJ, enCours: false, vue: null, spins: new Map(), dernier: null };
  const ctx = {
    $: ec.$, document: ec.document, window: { ethereum: opts.eth || null }, compte: opts.compte || null, CHAINE: 8453, rpc: opts.rpc,
    fetch: async (url) => { fetchs.push(url); if (opts.sansMisables) throw new Error('offline'); return { json: async () => ({ ok: true, etat: 'LU', lignes: opts.lignes || [] }) }; },
    rollsCfg, slotsCfg, slotsContrat: (j) => (j && j.ok && /^0x[0-9a-f]{40}$/.test(String(j.contrat || '').toLowerCase()) ? String(j.contrat).toLowerCase() : null),
    usdcTexte, Slots, USDC_BASE, capaciteDeGroupement, envoyerLotAtomique, envoyerDepuisWallet,
    coterUnit: (opts.unit || PU_REEL).coterUnit, planPayerEnUnit: (opts.unit || PU_REEL).planPayerEnUnit, ROUTE_UNIT: (opts.unit || PU_REEL).ROUTE_UNIT,
    MISABLES_CANDIDATS: MIS.CANDIDATS_CL, coterMisable: MIS.coterMisable, planPayerEnJeton: MIS.planPayerEnJeton, usdcAViser: MIS.usdcAViser, besoinDuJeu: MIS.besoinDuJeu, tailleMisable: MIS.tailleCouvrante,
    planRoll: BR.planRoll, planRolls: BR.planRolls, planPass: BR.planPass, planRollAvecPass: BR.planRollAvecPass, planRollsAvecPass: BR.planRollsAvecPass,
    planSettle: BR.planSettle, planSettleMany: BR.planSettleMany, lireRolledTous: BR.lireRolledTous, lireSettled: BR.lireSettled, lireSettledTous: BR.lireSettledTous,
    etatReglement: BR.etatReglement, FENETRE_ROLLS: BR.FENETRE, passActif,
    /* des faces FIXES (le banc rejoue le plan du jeu avec les memes guesses) ; le vrai tirage est au hasard (rolls-jeu.js) */
    nouvelleFaceRoll: () => ({ guess: [1, 2, 3, 1, 2], apparence: {} }), tirerFaceDeRoll: () => ({ guess: [2, 1, 0, 3, 1], apparence: {} }), peindreFaceRoll: () => {},
    lirePassSur: async () => ({ ok: true, pass: null }), lireAvantRoll: async () => ({ pot: 1000000n, phrase: '' }), lirePotRolls: async () => 1000000n,
    verifierRollsEnAttente: async () => null, peindreTirageJourPass: async () => null, peindreSlots: async () => null, peindreFacesSlots: () => {}, slotsListe: () => {},
    montrerSettled: () => {}, motSettle: () => 'BAS', texteBlocs: (n) => n + ' blocks', sParBlocApp: null, toursAttente: () => 1, pasAttente: () => 0,
    faceRevelee: () => null, logoSvg: () => '', paramsLogoDepuisApparence: () => ({}), rollDerniers: [], jb: () => {}, signalerRoll: async () => true,
    setTimeout: (f) => { setImmediate(f); return 0; }, clearTimeout: () => {},
    phraseArret: (opts.arret || PA_REEL).phraseArret, bilanArret: (opts.arret || PA_REEL).bilanArret, paresAVerifier: (opts.arret || PA_REEL).paresAVerifier,
    etapesDuPaiement: (opts.arret || PA_REEL).etapesDuPaiement, phraseOuvertes: (opts.arret || PA_REEL).phraseOuvertes, appelAllowance: (opts.arret || PA_REEL).appelAllowance,
    appelRemiseAZero: (opts.arret || PA_REEL).appelRemiseAZero,
    /* 2026-10-25 (#payerTous) : le verdict Buy du Market avec SES vrais modules (routage.js, pools-actions-aerodrome.js, paires.js) et SON
     *   seuil lu dans le texte ; la photo /api/trending = opts.trending (null : rien de lu) ; la decouverte client des pools = opts.decouverte
     *   (defaut : aucune pool decouverte). allerA est enregistre (opts.allerA). */
    dernierTrending: opts.trending || null, trDonnees: null, trAffiches: 50, peindreTrending: () => {},
    verdictRoutage, avecPoolAction, ACTIONS_PAR_ADR, LIQ_MIN_BUY_USD: liqMinBuy(t),
    poolDecouvertPour: opts.decouverte || (() => null), allerA: opts.allerA || (() => {}),
  };
  Object.assign(ctx, opts.ctx || {});
  const noms = Object.keys(ctx);
  const exporte = ['rollPaye', 'passPaye', 'autoRollLot', 'slotsAgir', 'envoyerAppels'];
  const option = ['peindrePayerAvec', 'rendrePayerAvec', 'jetonChoisi', 'preparerPaiementJeton', 'payer', 'payerListees', 'qteJeton',
    'direArretJeton', 'agirArret', 'reposerArret', 'payerArrets', 'achatMarcheDe', 'lireDecimalesTous', 'allerLigneMarche'];
  const f = new Function(...noms, 'let rollEnCours = false;\n' + src + '\nreturn { ' + exporte.join(', ') + ', '
    + option.map((k) => k + ': typeof ' + k + ' === "undefined" ? null : ' + k).join(', ') + ' };');
  const api = f(...noms.map((k) => ctx[k]));
  return { api, ecran: ec, fetchs, src };
}
/* choisir un jeton dans le selecteur, comme la personne (la valeur, puis l ecouteur 'change' du VRAI code) */
export function choisir(ch, valeur) {
  const s = ch.ecran.el('payerJeton');
  const o = s.options.find((x) => x.value === valeur);
  if (!o || o.disabled) return false;
  s.value = valeur;
  if (s.ecouteurs.change) s.ecouteurs.change();
  return true;
}
