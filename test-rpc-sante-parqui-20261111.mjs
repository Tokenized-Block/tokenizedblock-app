/* test-rpc-sante-parqui-20261111.mjs — game372 Step 0: every read counted per CALLER (archive label) x reader x method.
 * AFFIRME (EXECUTES the real slices of serveur-web.js: the counter + compterAppel, and consommateurArchive + etiquetteArchive):
 *   - a call made under consommateurArchive.run('fond x') increments parQui['fond x | general eth_getLogs'], also after an await;
 *   - a call made with no label increments 'sans etiquette | ...';
 *   - `par` (reader x method, game366) is unchanged: same keys, same counts as before;
 *   - the second statement is SEPARATE: with etiquetteArchive missing (ReferenceError), `par` still counts and the read never throws;
 *   - the background loops named in the spec carry their label at the call site (lireJournalJeu, crediterXp, mesureCourteSrv, tbPrices).
 * MUTANT (in memory): delete the parQui statement -> this test must go RED.
 * NE PROUVE PAS : the per-minute figures in prod (read /sante.santeRpc.appelsLecteurs.parQui after the deploy).
 * PORTABLE: process.exitCode, never process.exit. */
import { readFileSync } from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';

const FICHIER = process.env.SERVEUR_WEB || new URL('./serveur-web.js', import.meta.url);
const SRV = readFileSync(FICHIER, 'utf8').replace(/\r\n/g, '\n');
let ok = 0, ko = 0;
const t = (name, cond, extra = '') => { if (cond) ok++; else { ko++; console.log('RED', name, extra); } };

function slices(src) {
  const i = src.indexOf('const appelsLecteurs = ');
  const f = src.indexOf('function compterAppel(', i);
  const fin = f > 0 ? /\r?\n\}\r?\n/.exec(src.slice(f)) : null;
  const e = fin ? f + fin.index : -1;
  const a = src.indexOf('const consommateurArchive = new AsyncLocalStorage();');
  const ie = a > 0 ? src.indexOf('const etiquetteArchive = ', a) : -1;
  const fe = ie > 0 ? /\r?\n/.exec(src.slice(ie)) : null;
  const b = fe ? ie + fe.index : -1;
  if (i < 0 || f < 0 || e < 0 || a < 0 || b < 0) return null;
  return { compteur: src.slice(i, e) + '\n}\n', etiquettes: src.slice(a, b) + '\n' };
}
const monter = (src, avecEtiquettes = true) => {
  const s = slices(src);
  if (!s) throw new Error('slice not found');
  return new Function('AsyncLocalStorage', '"use strict";\n' + s.compteur + '\n' + (avecEtiquettes ? s.etiquettes : '')
    + '\nreturn { appelsLecteurs, compterAppel, consommateurArchive: typeof consommateurArchive === "undefined" ? null : consommateurArchive };')(AsyncLocalStorage);
};

async function verifier(src) {
  const fautes = [];
  const v = (c, m) => { if (!c) fautes.push(m); };
  let M;
  try { M = monter(src); } catch (e) { return ['slice: ' + e.message]; }
  const { appelsLecteurs: A, compterAppel, consommateurArchive } = M;
  v(A && typeof A.par === 'object' && typeof A.parQui === 'object' && typeof A.depuis === 'string', 'counter object has depuis, par, parQui');
  if (!A || !A.parQui) return fautes.concat(['no parQui']);
  consommateurArchive.run('fond x', () => compterAppel('general', 'eth_getLogs'));
  v(A.parQui['fond x | general eth_getLogs'] === 1, 'labelled call counted under its label (' + JSON.stringify(A.parQui) + ')');
  compterAppel('general', 'eth_call');
  v(A.parQui['sans etiquette | general eth_call'] === 1, 'unlabelled call counted as sans etiquette');
  await consommateurArchive.run('fond y', async () => { await new Promise((r) => setTimeout(r, 5)); compterAppel('rails', 'eth_getBlockByNumber'); });
  v(A.parQui['fond y | rails eth_getBlockByNumber'] === 1, 'label survives an await (timer)');
  consommateurArchive.run('fond x', () => compterAppel('general', 'eth_getLogs'));
  v(A.parQui['fond x | general eth_getLogs'] === 2, 'a second labelled call adds one');
  compterAppel('general', 'x'.repeat(100));
  v(A.parQui['sans etiquette | general ' + 'x'.repeat(40)] === 1, 'method cut at 40 like par');
  v(JSON.stringify(A.par) === JSON.stringify({ 'general eth_getLogs': 2, 'general eth_call': 1, 'rails eth_getBlockByNumber': 1, ['general ' + 'x'.repeat(40)]: 1 }),
    'par unchanged (game366 keys and counts): ' + JSON.stringify(A.par));
  const tot = (o) => Object.values(o).reduce((s, x) => s + x, 0);
  v(tot(A.par) === tot(A.parQui), 'parQui and par count the same calls (' + tot(A.par) + ' vs ' + tot(A.parQui) + ')');
  /* separate statement: etiquetteArchive missing -> ReferenceError inside the 2nd statement only */
  let N = null, leve = null;
  try { N = monter(src, false); N.compterAppel('general', 'eth_blockNumber'); } catch (e) { leve = e; }
  v(leve === null && N && N.appelsLecteurs.par['general eth_blockNumber'] === 1, 'with the label helper missing, par still counts and nothing throws' + (leve ? ' (threw ' + leve.message + ')' : ''));
  return fautes;
}

const fautes = await verifier(SRV);
t('Step 0 counter', fautes.length === 0, fautes.join(' ; '));

/* the counter published untouched in /sante (test-rpc-sante checks the exact text; repeated here so this test alone shows it) */
t('/sante still publishes santeRpc.appelsLecteurs', SRV.includes('santeRpc: { appelsLecteurs, misDeCote: SANTE_RPC.instantane(), secoursCle: { ...secoursCompte, maxJour: SECOURS_MAX_JOUR, pose: !!RELAIS_CLE } }'));
t('game366 counters untouched', SRV.includes("compterAppel('general', methode);") && SRV.includes("compterAppel('rails', methode);"));
/* the labels at the call sites (the runtime proof is the local /sante run: parQui names them) */
t('lireJournalJeu runs under fond journal', /consommateurArchive\.run\('fond journal', \(\) => lireJournalJeu\(\)\)/.test(SRV));
t('crediterXp runs under fond xp', (SRV.match(/consommateurArchive\.run\('fond xp', \(\) => crediterXp\(\)\)/g) || []).length === 2);
t('mesureCourteSrv interval runs under fond mesure courte', /consommateurArchive\.run\('fond mesure courte', \(\) => mesureCourteSrv\.lire\(\)\)/.test(SRV));
t('tbPrices takes fond prix tblock only when no label is set', /consommateurArchive\.getStore\(\) \? lirePrix\(\) : consommateurArchive\.run\('fond prix tblock', lirePrix\)/.test(SRV));

/* MUTANT: the parQui statement deleted -> RED */
const STMT = /\r?\n  try \{ const q = etiquetteArchive\(\) \+ ' \| ' \+ lecteur[^\r\n]*(?=\r?\n)/;
t('mutant anchor present', STMT.test(SRV));
const mut = SRV.replace(STMT, '');
const fm = await verifier(mut);
console.log('   mutant « parQui statement deleted » : ' + (fm[0] || 'GREEN'));
t('MUTANT SURVIVES: parQui statement deleted', fm.length > 0);

console.log(ko === 0 ? 'GREEN' : 'RED', ok + '/' + (ok + ko));
process.exitCode = ko === 0 ? 0 : 1;
