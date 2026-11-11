/* test-rolls-regles-20261024.mjs — AUDIT ROLLS-DUELS (2026-10-24), constat [low] « l app montre les gains du CONSTRUCTEUR, pas les regles
 *   vivantes » (serveur-web.js:6467 avant correction ; setRules les change, contracts/src/BlockRolls.sol:193-200). Ce banc EXECUTE rolls-regles.js
 *   (le decodage, la lecture, le cache du serveur, les phrases) et verifie que chaque texte d avant signature d app.html passe par lui :
 *   A. decodage STRICT de currentRules / rulesVersion / unitCreator / MAX_PRIZE (une forme ou une borne qui n est pas celle du contrat -> null) ;
 *   B. lireReglesRolls avec un rpc scripte : les valeurs lues ; un setRules ENTRE deux lectures (version differente) -> echec, jamais un melange ;
 *      regles illisibles -> echec ; createur illisible -> null mais les regles restent ; prix au-dessus de MAX_PRIZE -> echec ;
 *   C. creerCacheRegles (horloge donnee) : rien servi avant une lecture ; la lecture servie avec son heure ; perimee apres perimeMs -> null ;
 *      une lecture ratee ne sert rien ; une lecture au plus par ttlMs ;
 *   D. les phrases : seuls les paliers >= minScore ; non lues -> « could not be read », AUCUN montant ;
 *   E. app.html (fonctions du TEXTE, rejouees sur des copies MUTEES : chacune doit rougir) : la tuile, la regle, les 3 flux payes (roll, auto-roll,
 *      roll du Chat) relisent pot ET regles avant la signature et disent av.phrase ; une lecture ratee met prizes / minScore a null ; le resume du
 *      Chat et phraseSettle ne retombent jamais sur un montant non lu.
 * Module remplacable (ROLLS_REGLES_MODULE) pour muter-rolls-duels-ui-20261024.mjs. ⛔ PORTABLE : process.exitCode.
 * NE PROUVE PAS : le contrat reel (banc-rolls-regles-anvil-20261024.mjs le fait sur le bytecode signe), ni le rendu. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.isAbsolute(f) ? f : path.join(ICI, f)).href);
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const essai = async (f) => { try { return await f(); } catch (e) { return { erreur: String(e && e.message || e) }; } };
const R = await imp(process.env.ROLLS_REGLES_MODULE || 'rolls-regles.js');
const { selecteur } = await imp('keccak.js');
const { usdc: usdcTexte } = await imp('rolls-jeu.js');
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const regles = (p5, p4, p3, p2, ms) => '0x' + [p5, p4, p3, p2, ms].map(mot).join('');
const CR = '0x' + 'c0'.repeat(20), ROLLS = '0x0c5b490196f06db40ab8af68ecb2313029460fe9';

console.log('— A. decodage');
ok(selecteur('currentRules()') === R.appelRegles() && selecteur('rulesVersion()') === R.appelVersion() && selecteur('unitCreator()') === R.appelCreateur() && selecteur('MAX_PRIZE()') === R.appelMaxPrize(), 'les 4 selecteurs = keccak des signatures du contrat');
const r1 = R.lireRegles(regles(5e6, 3e6, 1e6, 5e5, 2));
ok(r1 && r1.prizes.join() === '5000000,3000000,1000000,500000' && r1.minScore === 2, 'currentRules (5 mots) -> 4 prix bruts + minScore');
ok(R.lireRegles(regles(5e6, 3e6, 1e6, 5e5, 2).slice(0, -64)) === null && R.lireRegles('0x') === null && R.lireRegles(regles(5e6, 3e6, 1e6, 5e5, 2) + mot(0)) === null && R.lireRegles('0x' + 'zz'.repeat(160)) === null, '4 mots, vide, 6 mots, non hexa : null');
ok(R.lireRegles(regles(5e6, 3e6, 4e6, 5e5, 2)) === null && R.lireRegles(regles(5e6, 3e6, 1e6, 5e5, 1)) === null && R.lireRegles(regles(5e6, 3e6, 1e6, 5e5, 6)) === null && R.lireRegles(regles(5e6, 3e6, 1e6, 5e5, 300)) === null,
  'hors des bornes de _rulesOk (paliers non croissants, minScore 1 / 6 / 300) : null');
ok(R.lireVersion('0x' + mot(2)) === 2 && R.lireVersion('0x' + mot(0)) === null && R.lireVersion('0x' + mot(65536)) === null && R.lireVersion('0x') === null, 'rulesVersion : uint16 >= 1, sinon null');
ok(R.lireAdresse('0x' + mot(BigInt(CR))) === CR && R.lireAdresse('0x' + mot(0)) === null && R.lireAdresse('0x' + 'f'.repeat(64)) === null, 'unitCreator : une adresse ; l adresse nulle (hook muet) et un mot > 160 bits : null');

console.log('— B. lireReglesRolls (rpc scripte)');
const rpcDe = (rep) => async (m, p) => { if (m !== 'eth_call' || p[0].to !== ROLLS) throw new Error('inattendu'); const k = String(p[0].data).slice(0, 10); const v = rep[k]; if (typeof v === 'function') return v(); if (v === undefined) throw new Error('refus'); return v; };
const rep = { [R.appelVersion()]: '0x' + mot(2), [R.appelRegles()]: regles(7e6, 4e6, 2e6, 1e6, 3), [R.appelCreateur()]: '0x' + mot(BigInt(CR)), [R.appelMaxPrize()]: '0x' + mot(1000e6) };
const l1 = await essai(() => R.lireReglesRolls({ rpc: rpcDe(rep), contrat: ROLLS }));
ok(l1 && l1.version === 2 && l1.prizes.join() === '7000000,4000000,2000000,1000000' && l1.minScore === 3 && l1.createur === CR && l1.maxPrize === '1000000000', 'lecture : version 2, les 4 prix et minScore 3 lus, createur, MAX_PRIZE');
let v = 1; const lBouge = await essai(() => R.lireReglesRolls({ rpc: rpcDe({ ...rep, [R.appelVersion()]: () => '0x' + mot(v++) }), contrat: ROLLS }));
ok(lBouge && lBouge.erreur, 'setRules ENTRE les deux lectures de version : echec (jamais des regles d une version sous le numero d une autre)');
ok((await essai(() => R.lireReglesRolls({ rpc: rpcDe({ ...rep, [R.appelRegles()]: undefined }), contrat: ROLLS }))).erreur && (await essai(() => R.lireReglesRolls({ rpc: rpcDe({ ...rep, [R.appelRegles()]: '0x' }), contrat: ROLLS }))).erreur,
  'currentRules refuse ou vide : echec');
const lSansCr = await essai(() => R.lireReglesRolls({ rpc: rpcDe({ ...rep, [R.appelCreateur()]: undefined, [R.appelMaxPrize()]: undefined }), contrat: ROLLS }));
ok(lSansCr && !lSansCr.erreur && lSansCr.createur === null && lSansCr.maxPrize === null && lSansCr.minScore === 3, 'createur / MAX_PRIZE illisibles : null, les regles restent lues');
ok((await essai(() => R.lireReglesRolls({ rpc: rpcDe({ ...rep, [R.appelMaxPrize()]: '0x' + mot(6e6) }), contrat: ROLLS }))).erreur && (await essai(() => R.lireReglesRolls({ rpc: rpcDe(rep), contrat: '0x12' }))).erreur, 'prix au-dessus de MAX_PRIZE, ou contrat mal forme : echec');

console.log('— C. creerCacheRegles (horloge donnee)');
let t = 1_000_000, appels = 0, rate = false;
const cache = R.creerCacheRegles({ lire: async () => { appels++; if (rate) throw new Error('x'); return { prizes: ['7000000', '4000000', '2000000', '1000000'], minScore: 3, version: 2, createur: CR, maxPrize: '1000000000' }; }, ttlMs: 30000, echecMs: 10000, perimeMs: 120000, maintenant: () => t });
ok(cache.servi() === null, 'avant toute lecture : null (jamais la fiche)');
await cache.rafraichir();
const s1 = cache.servi();
ok(s1 && s1.version === 2 && s1.minScore === 3 && s1.lu === new Date(1_000_000).toISOString() && appels === 1, 'apres une lecture : servie, avec son heure');
t += 5000; await cache.rafraichir(); ok(appels === 1, 'une lecture au plus par ttlMs (30 s)');
t += 30000; rate = true; await cache.rafraichir(); ok(appels === 2 && cache.servi() && cache.servi().version === 2, 'lecture ratee a +35 s : la lecture reussie (35 s) reste servie');
t += 5000; await cache.rafraichir(); ok(appels === 2, 'apres un echec : pas de nouvelle lecture avant echecMs (10 s)');
t = 1_000_000 + 120001; await cache.rafraichir(); ok(cache.servi() === null, 'derniere lecture reussie de plus de 2 min : null (« could not be read »)');
const cacheRate = R.creerCacheRegles({ lire: async () => { throw new Error('x'); }, maintenant: () => t }); await cacheRate.rafraichir();
ok(cacheRate.servi() === null, 'jamais lue : null');

console.log('— D. phrases');
const lu = { prizes: ['7000000', '4000000', '2000000', '1000000'], minScore: 3 };
ok(R.texteGains(lu, usdcTexte) === '5/5 → 7.00, 4/5 → 4.00, 3/5 → 2.00 USDC', 'texteGains : seuls les paliers >= minScore (3) — « ' + R.texteGains(lu, usdcTexte) + ' »');
ok(R.texteGains({ prizes: ['5000000', '3000000', '1000000', '500000'], minScore: 2 }, usdcTexte) === '5/5 → 5.00, 4/5 → 3.00, 3/5 → 1.00, 2/5 → 0.50 USDC', 'minScore 2 : les 4 paliers');
ok(R.texteGains(null, usdcTexte) === null && R.texteGains({ prizes: null, minScore: null }, usdcTexte) === null && R.gainMax({ prizes: null }) === null && R.gainMax(lu) === 7000000n, 'non lues : null (aucun texte), gainMax null ; lues : gainMax = 5/5');
const pLu = R.phraseGainsAvantSignature(lu, usdcTexte), pNon = R.phraseGainsAvantSignature(null, usdcTexte);
ok(/Prizes now: 5\/5 → 7\.00, 4\/5 → 4\.00, 3\/5 → 2\.00 USDC; under 3\/5 nothing \(read on the contract just now\)\./.test(pLu), 'avant signature, lues : ' + pLu.trim());
ok(/could not be read just now/.test(pNon) && !/\d/.test(pNon), 'avant signature, non lues : dit, et AUCUN chiffre : ' + pNon.trim());

console.log('— E. app.html (texte, chaque garde mutee doit rougir)');
const APP = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8').replace(/\r\n/g, '\n');
const entre = (s, a, b) => { const i = s.indexOf(a), j = s.indexOf(b, i + 1); return i >= 0 && j > i ? s.slice(i, j) : ''; };
/* 2026-10-24 (« Pay with ») : le chemin JETON passe aussi av.phrase (a envoyerPaiementJeton), AVANT le chemin USDC dans le texte — la phrase
 *   du chemin USDC est donc la DERNIERE avant son envoi (lastIndexOf), et le chemin jeton, s il existe, la transmet lui aussi */
const avantEnvoi = (s, a, b) => { const x = entre(s, a, b); const i = x.indexOf('await lireAvantRoll(contrat)'), e = Math.max(x.indexOf('envoyerAppels(plan.appels'), x.indexOf('bcBoutons('));
  if (!x.includes('envoyerPaiementJeton(')) { const p = x.indexOf('av.phrase'); return i > 0 && p > i && e > p; }
  /* avec le chemin jeton : la phrase est dans le DERNIER dit( avant l envoi USDC, et le chemin jeton la transmet */
  const d = x.lastIndexOf('dit(', e), p = x.lastIndexOf('av.phrase', e);
  return i > 0 && d > i && p > d && e > p && /envoyerPaiementJeton\(pj, c, dit, av\.phrase\)/.test(x); };
const checks = {
  importe: (s) => /import \* as Rg from '\.\/rolls-regles\.js';/.test(s),
  /* game367: the tile shows what the contract can pay NOW (prize capped by the pot), read from the module, never typed */
  tuile: (s) => /const gm = Rg\.gainMaxReel\(rollsCfg, rollsCfg\.pot\);/.test(s) && /\(gm !== null \? ' · win up to ' \+ usdcTexte\(gm\.brut\)/.test(s),
  regle: (s) => /\+ \(Rg\.texteGains\(rollsCfg, usdcTexte\) \|\| Rg\.PHRASE_GAINS_NON_LUS\.toLowerCase\(\)\) \+ '\) — never more than the pot holds'/.test(s) && !/rollsCfg\.prizes \|\| \[\]\)\.map/.test(s)
    && /The UNIT creator wallet can change the prizes/.test(s) && /a change applies to rolls made after it/.test(s),
  rollPaye: (s) => avantEnvoi(s, 'async function rollPaye()', 'async function passPaye()'),
  autoRoll: (s) => avantEnvoi(s, 'async function autoRollLot(', '/* ── petits outils partages'),
  rollChat: (s) => avantEnvoi(s, 'async function bcCommandeRoll(', 'function bcCommandePostTask('),
  lectureRelue: (s) => { const a = entre(s, 'async function lireAvantRoll(contrat)', 'function phrasePot(');
    return /Rg\.lireReglesRolls\(\{ rpc, contrat \}\)\.catch\(\(\) => null\)/.test(a) && /rollsCfg\.prizes = rg \? rg\.prizes : null; rollsCfg\.minScore = rg \? rg\.minScore : null;/.test(a) && /phrase: Rg\.phraseGainsAvantSignature\(rg, usdcTexte\) \+ phrasePot\(pot\)/.test(a); },
  potSansGains: (s) => /const max = Rg\.gainMax\(rollsCfg\);/.test(s) && /if \(p\.etat === 'PLAFONNE' \|\| max === null\)/.test(s),
  settleSansMin: (s) => { const a = entre(s, 'function phraseSettle(st)', 'function phraseNonConfirme('); return /if \(ms === null\) return 'nothing paid';/.test(a) && !/: 2\)/.test(a); },
  resumeChat: (s) => /const gz = Rg\.texteGains\(rc, usdcTexte\);/.test(s) && /\(gz \|\| Rg\.PHRASE_GAINS_NON_LUS\.toLowerCase\(\)\)/.test(s) && !/rc\.prizes\.map/.test(s),
};
const mutants = [
  ['importe', "import * as Rg from './rolls-regles.js';", ''],
  ['tuile', 'const gm = Rg.gainMaxReel(rollsCfg, rollsCfg.pot);', "const gm = { brut: '5000000', plafonne: false };"],
  ['regle', '+ (Rg.texteGains(rollsCfg, usdcTexte) || Rg.PHRASE_GAINS_NON_LUS.toLowerCase()) + \') — never more than the pot holds\'', "+ (rollsCfg.prizes || []).map((p, i) => (5 - i) + '/5 → ' + usdcTexte(p)).join(', ') + ' USDC) — never more than the pot holds'"],
  ['regle', 'The UNIT creator wallet can change the prizes', 'Nobody can change the prizes'],
  ['rollPaye', "Sign ' + plan.appels.length + ' step' + (plan.appels.length > 1 ? 's' : '') + ' in your wallet…') + av.phrase);", "Sign ' + plan.appels.length + ' step' + (plan.appels.length > 1 ? 's' : '') + ' in your wallet…'));"],
  ['autoRoll', "one signature if your wallet groups them, else ' + plan.appels.length + '…') + av.phrase);", "one signature if your wallet groups them, else ' + plan.appels.length + '…'));"],
  ['rollChat', "'. Half to the pot, half to TokenizedBlock.') + av.phrase);", "'. Half to the pot, half to TokenizedBlock.'));"],
  ['lectureRelue', 'rollsCfg.prizes = rg ? rg.prizes : null; rollsCfg.minScore = rg ? rg.minScore : null;', 'if (rg) { rollsCfg.prizes = rg.prizes; rollsCfg.minScore = rg.minScore; }'],
  ['lectureRelue', 'Rg.lireReglesRolls({ rpc, contrat }).catch(() => null)', 'Promise.resolve(rollsCfg)'],
  ['potSansGains', "if (p.etat === 'PLAFONNE' || max === null)", "if (p.etat === 'PLAFONNE')"],
  ['settleSansMin', "if (ms === null) return 'nothing paid';", ''],
  ['resumeChat', '(gz || Rg.PHRASE_GAINS_NON_LUS.toLowerCase())', "(gz || '5 → 5, 4 → 3, 3 → 1, 2 → 0.50 USDC')"],
];
for (const [k, f] of Object.entries(checks)) ok(f(APP), 'app.html : ' + k);
let tues = 0;
for (const [k, de, vers] of mutants) {
  const i = APP.indexOf(de); if (i < 0) { ok(false, 'mutant introuvable (' + k + ') : ' + de.slice(0, 70)); continue; }
  if (!checks[k](APP.slice(0, i) + vers + APP.slice(i + de.length))) tues++; else ok(false, 'mutant SURVIT (' + k + ') : ' + de.slice(0, 70));
}
ok(tues === mutants.length, 'mutants du texte tues : ' + tues + '/' + mutants.length);
console.log(n + ' assertions, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0;
