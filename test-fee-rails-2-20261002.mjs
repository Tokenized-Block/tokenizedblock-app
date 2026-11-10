// test-fee-rails-2-20261002.mjs — fix/fee-rails-2 (items 1, 2, 3, 4, 5, 6, 8 + founder rule "no hookless pool for TB blocks").
// Every check has a negative control. Imports are `import *` + typeof asserts, so on an older tree this file FAILS its
// assertions (never crashes on a missing export).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from './echange.js';
import * as P from './paires.js';
import * as T from './tokenomics.js';
import * as F from './frais-creation.js';
let PSH = {};
try { PSH = await import('./pool-sans-hook.js'); } catch (_) { PSH = {}; }

let n = 0, ko = 0;
const ok = (c, m) => { if (c) { n++; } else { ko++; console.error('KO  ' + m); } };
const fn = (o, k) => typeof o[k] === 'function';
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const src = readFileSync(new URL('./echange.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
function extraire(texte, nom) {
  const m = new RegExp('(?:async\\s+)?function\\s+' + nom + '\\s*\\(').exec(texte);
  if (!m) return '';
  let i = texte.indexOf('{', texte.indexOf(')', m.index)), d = 0, j = i;
  for (; j < texte.length; j++) { if (texte[j] === '{') d++; else if (texte[j] === '}') { d--; if (d === 0) break; } }
  return texte.slice(m.index, j + 1);
}
const ETH = '0x0000000000000000000000000000000000000000';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const TBLOCK = '0xb20000000000000000000024c30d3fcb7931272e';
const NVDAc = '0xb20000000000000000000078ee7ce2fe4908108c';
const BLK_HI = '0xb2000000000000000000ffff00000000000000aa'; // sorts AFTER USDC and NVDAc
const BLK_LO = '0x0b00000000000000000000000000000000000001'; // sorts BEFORE USDC
const V8 = T.HOOK_V8;
const COMPTE = '0x1234567890123456789012345678901234567890';
const word = (x) => '0x' + BigInt(x).toString(16).padStart(64, '0');
const rpcMock = (quote = 10n ** 18n) => async (m) => { if (m === 'eth_call') return word(quote); if (m === 'eth_blockNumber') return '0x1'; return '0x0'; };

/* ── item 1 : the hook's fee currency decides, not currency0 === ETH ── */
ok(fn(E, 'hookPaieEnDeviseVendable'), 'item1: hookPaieEnDeviseVendable exported');
if (fn(E, 'hookPaieEnDeviseVendable')) {
  const cleUsdc = { currency0: USDC, currency1: BLK_HI, fee: 0, tickSpacing: 200, hooks: V8 };
  const v = E.hookPaieEnDeviseVendable({ cle: cleUsdc, sens: 'VENTE', zeroForOne: false, jeton: BLK_HI });
  ok(v.paie === true && String(v.devise).toLowerCase() === USDC.toLowerCase(), 'item1: V8 USDC pool, sell -> hook pays in USDC, router fee skipped');
  ok(E.hookPaieEnDeviseVendable({ cle: cleUsdc, sens: 'ACHAT', zeroForOne: true, jeton: BLK_HI }).paie === true, 'item1: V8 USDC pool, buy -> hook pays');
  /* negative controls */
  const cleTete = { currency0: BLK_LO, currency1: USDC, fee: 0, tickSpacing: 200, hooks: V8 };
  ok(E.hookPaieEnDeviseVendable({ cle: cleTete, sens: 'VENTE', zeroForOne: true, jeton: BLK_LO }).paie === false, 'item1 NEG: block-first V8 pool (fee in block) -> router keeps its fee');
  const cleNvda = { currency0: NVDAc, currency1: BLK_HI, fee: 0, tickSpacing: 200, hooks: V8 };
  /* 2026-10-02 14:49 : le V8 paie a6cf dans la devise appariee QUELLE QU ELLE SOIT -> plus de frais routeur, prix lu ou non */
  ok(E.hookPaieEnDeviseVendable({ cle: cleNvda, sens: 'VENTE', zeroForOne: false, jeton: BLK_HI }).paie === true, 'item1: V8 NVDAc pool, price not read -> hook pays, router 0');
  ok(E.hookPaieEnDeviseVendable({ cle: { ...cleNvda, hooks: T.HOOK_V5 }, sens: 'VENTE', zeroForOne: false, jeton: BLK_HI }).paie === false, 'item1 NEG: non-paying hook (V5), NVDAc not priced -> router keeps fee');
  ok(E.hookPaieEnDeviseVendable({ cle: cleNvda, sens: 'VENTE', zeroForOne: false, jeton: BLK_HI, fraisDevisesOk: new Set([NVDAc.toLowerCase()]) }).paie === true, 'item1: NVDAc priced -> hook pays');
}
ok(/hookPaieEnDeviseVendable\(\{ cle: marche\.cle/.test(extraire(src, 'planEchange')), 'item1: planEchange uses the hook fee currency');
ok(!/hookPaie\s*=.*currency0\)\.toLowerCase\(\) === ETH/.test(extraire(src, 'planEchange')), 'item1: no currency0===ETH condition left on hookPaie');

/* ── item 5 : dust guard on hook-paid legs (200 wei passes, 199 refused) ── */
const cleV8Eth = { currency0: ETH, currency1: BLK_HI, fee: 0, tickSpacing: 200, hooks: V8 };
const achat = (w) => E.planEchange({ rpc: rpcMock(), chaine: 8453, jeton: BLK_HI, compte: COMPTE, sens: 'ACHAT', montant: w,
  marcheLu: { etat: 'LUE', cle: cleV8Eth, paire: null } });
const r199 = await achat(199n), r200 = await achat(200n);
/* 2026-10-02 (Zero 1) : the shown text is 'Amount too small to trade here.'; the exact reason lives in causeInterne */
ok(r199.etat === 'REFUSE' && /fee amount is zero/.test(r199.causeInterne || r199.pourquoi || ''), 'item5: 199 wei on a V8 hook-paid buy is refused (' + r199.pourquoi + ')');
ok(!/fee amount is zero/.test((r200.causeInterne || '') + (r200.pourquoi || '')) && !r200.refusPoussiere, 'item5 NEG: 200 wei passes the dust guard (' + r200.etat + ')');

/* ── item 6 : explicit check on the TBLOCK leg in routeViaTblock ── */
ok(fn(E, 'hookPaieJambeTblock'), 'item6: hookPaieJambeTblock exported');
if (fn(E, 'hookPaieJambeTblock')) {
  ok(E.hookPaieJambeTblock({ currency0: ETH, currency1: TBLOCK, fee: 0, tickSpacing: 200, hooks: V8 }, 'ACHAT') === true, 'item6: hooked TBLOCK/ETH leg pays');
  ok(E.hookPaieJambeTblock({ currency0: ETH, currency1: TBLOCK, fee: 0, tickSpacing: 200, hooks: ETH }, 'ACHAT') === false, 'item6 NEG: hookless TBLOCK leg never pays');
  ok(E.hookPaieJambeTblock({ currency0: USDC, currency1: TBLOCK, fee: 0, tickSpacing: 200, hooks: V8 }, 'ACHAT') === false, 'item6 NEG: non-ETH currency0 leg refused');
}
const rvt = extraire(src, 'routeViaTblock');
ok(/const hookPaie = hookPaieJambeTblock\(cleT, sens\)/.test(rvt), 'item6: routeViaTblock calls hookPaieJambeTblock (removing it fails this test)');

/* ── founder rule : never a hookless pool for a TB block ── */
ok(fn(PSH, 'poolSansHookInterdite'), 'hookless: guard module present');
if (fn(PSH, 'poolSansHookInterdite')) {
  const tbHookless = { currency0: ETH, currency1: TBLOCK, fee: 0, tickSpacing: 200, hooks: ETH };
  ok(PSH.poolSansHookInterdite(tbHookless, []) === true, 'hookless: TBLOCK/ETH fee 0 ts 200 hooks 0 is forbidden');
  ok(PSH.poolSansHookInterdite({ currency0: ETH, currency1: BLK_HI, fee: 5000, tickSpacing: 200, hooks: ETH }, [BLK_HI]) === true, 'hookless: any block traded with a hookless key is forbidden');
  /* negative controls */
  ok(PSH.poolSansHookInterdite({ ...tbHookless, hooks: V8 }, []) === false, 'hookless NEG: the hooked key is allowed');
  ok(PSH.poolSansHookInterdite({ currency0: ETH, currency1: USDC, fee: 500, tickSpacing: 10, hooks: ETH }, [BLK_HI]) === false, 'hookless NEG: ETH/USDC leg (no block in it) is allowed');
  ok(PSH.poolSansHookInterdite({ currency0: ETH, currency1: BLK_HI, fee: 30000, tickSpacing: 200, hooks: ETH }, [BLK_HI]) === false, 'hookless NEG: OpenLaunch partner format untouched');
}
const rH = await E.planEchange({ rpc: async () => { throw new Error('no read expected'); }, chaine: 8453, jeton: TBLOCK, compte: COMPTE, sens: 'ACHAT', montant: 10n ** 16n,
  marcheLu: { etat: 'LUE', cle: { currency0: ETH, currency1: TBLOCK, fee: 0, tickSpacing: 200, hooks: ETH }, paire: null } });
ok(rH.etat === 'REFUSE' && (rH.refusSansHook === true || rH.refusTblock === true), 'hookless: planEchange refuses the TBLOCK hookless pool before any read/quote');
ok(!/hook/i.test(rH.pourquoi || '') && !/non officiel|sans frais/i.test(rH.pourquoi || ''), 'hookless: refusal text is generic (no label about that pool)');
const rH2 = await E.planEchange({ rpc: async () => { throw new Error('no read expected'); }, chaine: 8453, jeton: BLK_HI, compte: COMPTE, sens: 'ACHAT', montant: 10n ** 16n,
  marcheLu: { etat: 'LUE', cle: { currency0: ETH, currency1: BLK_HI, fee: 0, tickSpacing: 200, hooks: ETH }, paire: null } });
ok(rH2.etat === 'REFUSE' && rH2.refusSansHook === true, 'hookless: a B20 block on a hookless ETH pool is refused');
const rOk = await achat(10n ** 16n);
ok(rOk.refusSansHook !== true, 'hookless NEG: a hooked V8 pool is not refused by the rule');
const rM = await E.planEchangeMultiSauts({ rpc: rpcMock(), chaine: 8453, compte: COMPTE, entree: ETH, sortie: BLK_HI, montant: 10n ** 16n,
  sauts: [{ cle: { currency0: ETH, currency1: TBLOCK, fee: 0, tickSpacing: 200, hooks: ETH }, zeroForOne: true },
    { cle: { currency0: TBLOCK, currency1: BLK_HI, fee: 0, tickSpacing: 200, hooks: V8 }, zeroForOne: true }] });
ok(rM.etat === 'REFUSE' && (rM.refusSansHook === true || rM.refusTblock === true), 'hookless: multi-hop through the TBLOCK hookless leg refused');
const rM2 = await E.planEchangeMultiSauts({ rpc: rpcMock(), chaine: 8453, compte: COMPTE, entree: ETH, sortie: BLK_HI, montant: 10n ** 16n,
  sauts: [{ cle: { currency0: ETH, currency1: USDC, fee: 500, tickSpacing: 10, hooks: ETH }, zeroForOne: true },
    { cle: { currency0: USDC, currency1: BLK_HI, fee: 0, tickSpacing: 200, hooks: V8 }, zeroForOne: true }] });
ok(rM2.refusSansHook !== true, 'hookless NEG: bridge-in ETH->USDC(hookless)->block(V8) is not refused by the rule');
ok(/poolSansHookInterdite\(marche\.cle/.test(extraire(src, 'planEchange')), 'hookless: guard wired in planEchange');
ok(/indexPoolSansHookInterdite\(\[cleT, cleB\]/.test(rvt), 'hookless: both legs checked in routeViaTblock');
ok(/indexPoolSansHookInterdite\(sauts\.map/.test(extraire(src, 'planEchangeMultiSauts')), 'hookless: guard wired in multi-hop');
ok(/if \(poolSansHookInterdite\(p\.cle, \[want\]\)\) continue;/.test(extraire(html, 'poolDecouvertPour')), 'hookless: Buy-here pool pick skips hookless pools');
ok(!/non officiel|pool sans frais TB|unofficial pool/i.test(html), 'hookless: no user-facing label about that pool in app.html');

/* ── founder 13:58 : no route through TBLOCK anymore ── */
ok(PSH.ROUTE_VIA_TBLOCK === false && fn(PSH, 'cleTouchTblock'), 'tblock: ROUTE_VIA_TBLOCK is false');
const cleTbBlk = { currency0: TBLOCK, currency1: BLK_HI, fee: 0, tickSpacing: 200, hooks: V8 };
const rT = await E.planEchange({ rpc: async () => { throw new Error('no read expected'); }, chaine: 8453, jeton: BLK_HI, compte: COMPTE, sens: 'ACHAT',
  montant: 10n ** 16n, marcheLu: { etat: 'LUE', cle: cleTbBlk, paire: 'TBLOCK' } });
ok(rT.etat === 'REFUSE' && rT.refusTblock === true, 'tblock: a block paired with TBLOCK is not routed via TBLOCK (even on a V8 pool)');
const rT2 = await E.planEchange({ rpc: async () => { throw new Error('no read expected'); }, chaine: 8453, jeton: TBLOCK, compte: COMPTE, sens: 'ACHAT',
  montant: 10n ** 16n, marcheLu: { etat: 'LUE', cle: { currency0: ETH, currency1: TBLOCK, fee: 0, tickSpacing: 200, hooks: V8 }, paire: null } });
ok(rT2.etat === 'REFUSE' && rT2.refusTblock === true, 'tblock: TBLOCK itself stays blocked even if a hooked TBLOCK/ETH pool appeared');
const rT3 = await E.planEchangeMultiSauts({ rpc: rpcMock(), chaine: 8453, compte: COMPTE, entree: ETH, sortie: BLK_HI, montant: 10n ** 16n,
  sauts: [{ cle: { currency0: ETH, currency1: TBLOCK, fee: 0, tickSpacing: 200, hooks: V8 }, zeroForOne: true }, { cle: cleTbBlk, zeroForOne: true }] });
ok(rT3.etat === 'REFUSE' && rT3.refusTblock === true, 'tblock: multi-hop through hooked TBLOCK legs refused');
/* negative control: a block against its paired stock on V8 is routed, fee in the stock */
const cleAapl = { currency0: NVDAc, currency1: BLK_HI, fee: 0, tickSpacing: 200, hooks: V8 };
const rS = await E.planEchange({ rpc: rpcMock(), chaine: 8453, jeton: BLK_HI, compte: COMPTE, sens: 'ACHAT', montant: 10n ** 8n,
  marcheLu: { etat: 'LUE', cle: cleAapl, paire: null }, fraisDevisesOk: new Set([NVDAc.toLowerCase()]) });
ok(rS.refusTblock !== true && rS.refusSansHook !== true && rS.etat !== 'REFUSE', 'tblock NEG: block<->NVDAc on V8 still routes (' + rS.etat + ' ' + (rS.pourquoi || '') + ')');
ok(rS.resume && BigInt(rS.resume.fraisBps) === 0n && rS.resume.beneficiaireFrais === null, 'stock: hook pays a6cf in NVDAc, router takes nothing');
const cleBlkDevant = { currency0: BLK_LO.replace('0x0b', '0xb1'), currency1: NVDAc, fee: 0, tickSpacing: 200, hooks: V8 };
for (const sens of ['ACHAT', 'VENTE']) {
  const rB = await E.planEchange({ rpc: rpcMock(), chaine: 8453, jeton: cleBlkDevant.currency0, compte: COMPTE, sens, montant: 10n ** 8n,
    marcheLu: { etat: 'LUE', cle: cleBlkDevant, paire: null }, fraisDevisesOk: new Set([NVDAc.toLowerCase()]) });
  ok(rB.pourquoi === 'Not tradable here yet', 'stock: exact UI text "Not tradable here yet" (' + sens + ')');
  ok(rB.etat === 'REFUSE' && rB.refusFraisEnBlock === true, 'stock: V8 pool with block=currency0 refused (' + sens + '): a6cf would be paid in block');
}
ok(PSH.REFUS_FRAIS_HOOK_EN_BLOCK === true, 'stock: never-block-fee switch ON (strict)');
ok(/e\.textContent = estRefusStructurel\(p\) \? texteRefusEchange\(p\)/.test(html), 'stock: Buy/Sell screen shows the single refusal copy (R4 item 3), no prefix');
ok(/if \(!ROUTE_VIA_TBLOCK && cleTouchTblock\(p\.cle\)\) continue;/.test(extraire(html, 'poolDecouvertPour')), 'tblock: Buy-here skips TBLOCK pools');

/* ── item 2 : auto-salt grinds until the block sorts after its quote ── */
ok(fn(P, 'blockApresDevise'), 'item2: blockApresDevise exported');
if (fn(P, 'blockApresDevise')) {
  ok(P.blockApresDevise(BLK_HI, USDC) === true && P.blockApresDevise(BLK_HI, NVDAc) === true, 'item2: block after quote accepted');
  ok(P.blockApresDevise(BLK_LO, USDC) === false, 'item2 NEG: block before USDC refused');
  ok(P.blockApresDevise('0xb2000000000000000000000000000000000000aa', NVDAc) === false, 'item2 NEG: block before NVDAc refused');
  ok(P.blockApresDevise(BLK_LO, ETH) === true, 'item2: ETH quote (0x0) always first');
}
const vac = extraire(html, 'verifierAdresseCreation');
ok(/selAuto && r && r\.adresse && !blockApresDevise\(r\.adresse, deviseDeCreation\(\)\) && i < 32/.test(vac), 'item2: grind loop present (auto salt only, 32 tries)');
ok(/addEventListener\('input', \(ev\) => \{ if \(ev && ev\.isTrusted\) selAuto = false;/.test(html), 'item2: a typed salt is never re-drawn');
const cb = extraire(html, 'creerBlock');
ok(/if \(!v\.ko\) v = validerCreation\(\);/.test(cb), 'item2: form re-read after the grind (v.sel is the ground salt)');
ok(/!blockApresDevise\(adressePrevue\.adresse, deviseDeCreation\(\)\)[\s\S]{0,400}Nothing was sent/.test(cb), 'item2: typed wrong-order salt refused, nothing sent');

/* ── item 3 : Buy-here switch for existing block-first V8 pools ── */
ok(fn(P, 'choixBuyHere') && P.BUY_HERE_V8_BLOCK_DEVANT === 'EVITER_SI_ALTERNATIVE', 'item3: switch present, default EVITER_SI_ALTERNATIVE');
if (fn(P, 'choixBuyHere')) {
  const tete = { cle: { currency0: BLK_LO, currency1: USDC, hooks: V8 } }, autre = { cle: { currency0: ETH, currency1: BLK_LO, hooks: T.HOOK_PREVU } };
  ok(P.choixBuyHere({ meilleur: tete, meilleurAutre: autre, block: BLK_LO, hookV8: V8 }) === autre, 'item3: block-first V8 avoided when another a6cf route exists');
  ok(P.choixBuyHere({ meilleur: tete, meilleurAutre: null, block: BLK_LO, hookV8: V8 }) === tete, 'item3 NEG: no alternative -> unchanged');
  ok(P.choixBuyHere({ meilleur: tete, meilleurAutre: autre, block: BLK_LO, hookV8: V8, mode: 'GARDER' }) === tete, 'item3 NEG: GARDER -> old behaviour');
  ok(P.choixBuyHere({ meilleur: autre, meilleurAutre: autre, block: BLK_LO, hookV8: V8 }) === autre, 'item3 NEG: a non block-first best is kept');
}
ok(/return choixBuyHere\(\{ meilleur: best, meilleurAutre: bestAutre/.test(extraire(html, 'poolDecouvertPour')), 'item3: wired in poolDecouvertPour');

/* ── item 4 : every pre-check before createPaid ── */
const pre = extraire(html, 'preverifierNaissancePayee');
ok(/simulerSequenceLancement\(\{ rpc, compte, appels \}\)/.test(pre) && /\[appelCreate, \.\.\.\(plan\.etapes/.test(pre), 'item4: one simulation [createPaid, approvals, inscrire, mint]');
ok(/FRAIS_OUVERTURE_WEI - BigInt\(appelCreate\.value/.test(pre), 'item4: inscrire simulated at the remainder (0.001 - value sent)');
const iPre = cb.indexOf('preverifierNaissancePayee('), iSend = cb.indexOf("etape('create_sign_propos')");
ok(iPre > 0 && iSend > iPre, 'item4: pre-check runs before the wallet is asked');
ok(/pre\.etat === 'REFUSE'[\s\S]{0,300}nothing was sent[\s\S]{0,120}return;/.test(cb), 'item4 NEG path: REFUSE stops before createPaid');

/* ── item 4 (Zero 1, live 52d0566) : after createPaid, never « Nothing is lost » ── */
const srcArret = extraire(html, 'texteArretVie');
ok(!!srcArret, 'item4: texteArretVie present');
if (srcArret) {
  const texteArretVie = new Function('ethLisible', srcArret + '\nreturn texteArretVie;')((w) => (Number(w) / 1e18).toString());
  const paye = texteArretVie(2, { wei: '700000000000000', hash: '0x1' }, 'Not done (refused by user)');
  ok(/Create fee was paid; you will not pay it again/.test(paye) && /0\.0007 ETH/.test(paye) && !/Nothing is lost/.test(paye), 'item4: prepaid -> says the 0.0007 ETH fee was paid (' + paye.slice(0, 90) + ')');
  ok(/Nothing is lost/.test(texteArretVie(2, null, '')), 'item4 NEG: nothing paid -> "Nothing is lost" stays true');
}
const arret = extraire(html, 'vieAutoArreter');
ok(/texteArretVie\(Math\.min\(4, atteinte\), prepayePour\(blockMiroirVie \|\| lancementLien/.test(arret) && /blockMiroirVie = String\(adresseCreee\)/.test(html) && !/'Nothing is lost'/.test(arret), 'item4: stop screen reads the prepaid record of THIS block');
ok(/prepayePour\(adrReprise\) \? 'Finish bringing it to life \(fee already paid\)'/.test(arret), 'item4: resume button on the same block');

/* ── item 8 : Create pair chip wording ── */
ok(fn(P, 'libellePuceCreation') && P.MEMESTOCK_MULTIPOOL_ACTIF === false, 'item8: chip helper present, multipool flag defaults OFF');
if (fn(P, 'libellePuceCreation')) {
  const off = P.libellePuceCreation({ symbole: 'GOOGLc' }), on = P.libellePuceCreation({ symbole: 'GOOGLc', multipool: true });
  /* game348 (Phil 2026-11-10: "birth fee 0.001 ETH · swap fee … (app 0.07% · creator 0.03%) — remove it, it is wrong now"): the chip says
   *   only the pair and what buyers pay with; no fee, no percentage, no split, whatever the flags */
  ok(off === 'Quote = GOOGLc — buyers pay in GOOGLc' && on === off, 'item8 (game348): the pair chip says the quote only (' + off + ')');
  ok(!/0\.001|0\.07%|0\.03%|creator|fee|%/.test(off + on), 'item8 NEG: no fee, no percentage, no split on the chip');
  for (const t of [off, on]) ok(!/fees for dev/i.test(t) && !t.toLowerCase().includes(F.FEE_WALLET.slice(2).toLowerCase()), 'item8: no fee-wallet label/address');
}
ok(!/' · fee 0\.001 ETH'/.test(html), 'item8: old mixed "fee 0.001 ETH" chip text gone');
const bloquees = (P.pairesProposees ? P.pairesProposees(8453) : []).filter((p) => P.refusPrixNouveauBlock && P.refusPrixNouveauBlock(p.adr, 8453, { symbole: p.symbole }) !== null);
console.log('item8: pairs that still cannot be created (cannot price a new block yet):', bloquees.map((p) => p.symbole).join(', ') || 'none');

console.log(n + ' assertions, ' + ko + ' KO');
if (ko) process.exit(1);
