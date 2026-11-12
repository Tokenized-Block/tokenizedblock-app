/* test-buyback-vault-20261112.mjs -- the TBLOCK buyback that pays the holders vault: its record, the page module (buyback-vault.js),
 *   the deploy page, the verifier, the noter, the server keeper (buyback-keeper.js), the server wiring and the fees page bullet.
 *   2026-11-12: the buyback is DEPLOYED and the noter wrote adresse / bloc / tx. Sections 1-11 check the record as the preparer writes it,
 *   on an in-memory copy with those three lines set back to null (the preparer output must be the record minus those three lines, byte
 *   for byte); section 12 checks the deployed record: against the chain, the page plan, the noter, the keeper and the fees page.
 *   Sections 1-11: no network, every chain read is a stub. Section 12 reads the deploy tx, its receipt and the code at the address on the
 *   two Base nodes (eth_getTransactionByHash / eth_getTransactionReceipt / eth_getCode only; a node not read is a KO). The fork runs are banc-buyback-vault-deploy-page-fork-20261112.mjs and
 *   banc-buyback-keeper-fork-20261112.mjs. Prints "KO <check>" for every failed check; exit 1 if any. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as B from './buyback-vault.js';
import * as K from './buyback-keeper.js';
import { BUYBACK_VAULT_DEPLOIEMENT as REC } from './tblock-buyback-vault-deploiement.js';
import { PACK_ECONOMIE_V2 as PACK } from './economie-v2-pack-deploiement.js';
import { ADRESSES_PACK_ECONOMIE_V2 as ADR } from './economie-v2-pack-deploye.js';
import { BUYBACK_DEPLOIEMENT as OLD } from './tblock-buyback-deploiement.js';
import { adresseCreate, codeMasque } from './pack-economie-v2.js';
import { selecteur, keccak256 } from './keccak.js';
import { adresseDe } from './signeur-secp256k1.js';
import { noterBuybackVault, decision, BLOC_VIDE, NOEUDS, empreinte } from './contracts/noter-deploiement-buyback-vault.mjs';
import * as FR from './frais-risques.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
let ok = 0, ko = 0;
const t = (m, c, x = '') => { if (c) ok++; else { ko++; console.log('KO', m, x); } };
const lire = (f) => fs.readFileSync(path.join(ICI, f), 'utf8');
const low = (a) => String(a).toLowerCase();
const INTERDITS = [/\bnot deployed\b/i, /\bunder review\b/i, /\bfork test\b/i, /\bnot signed yet\b/i, /\bV8\b/, /(?<!Uniswap )\bv[23]\b/i, /72 hours/i];
const propre = (s) => INTERDITS.every((re) => !re.test(s));

/* ---------------- 1. the record = what the preparer writes, copied from the pack records */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bbv-'));
execFileSync('node', [path.join(ICI, 'contracts', 'preparer-deploiement-buyback-vault.mjs')], { env: { ...process.env, SORTIE: path.join(tmp, 'r.js'), KEEPER: '' }, cwd: path.join(ICI, 'contracts') });
const PREP = fs.readFileSync(path.join(tmp, 'r.js'), 'utf8');
const DISQUE = lire('tblock-buyback-vault-deploiement.js');
/* the three lines the noter writes (noterBuybackVault: the same text), from the record itself */
const NOTE = "  adresse: '" + REC.adresse + "',\n  bloc: " + REC.bloc + ",\n  tx: '" + REC.tx + "',\n";
t('record on disk = the preparer output plus ONLY the three lines the noter writes, byte for byte (never hand-edited)',
  PREP.split(BLOC_VIDE).length === 2 && DISQUE.split(NOTE).length === 2 && DISQUE.replace(NOTE, () => BLOC_VIDE) === PREP);
/* every clause up to section 12 runs on the record BEFORE the deploy: in memory, adresse / bloc / tx back to null */
const D = Object.freeze({ ...REC, adresse: null, bloc: null, tx: null });
fs.writeFileSync(path.join(tmp, 'r.mjs'), PREP);
const PREPM = (await import(pathToFileURL(path.join(tmp, 'r.mjs')).href)).BUYBACK_VAULT_DEPLOIEMENT;
t('record before the deploy (in memory) = the record the preparer writes, field for field', JSON.stringify(D) === JSON.stringify(PREPM));
const CR = B.resoudre(D).creation;
t('record: sha256 of the creation (V put back from the pack record)', crypto.createHash('sha256').update(CR).digest('hex') === D.sha256Creation);
const TXT = lire('tblock-buyback-vault-deploiement.js').toLowerCase();
t('record: carries none of the six pack addresses (they live in economie-v2-pack-deploye.js only)', Object.values(ADR).every((a) => !TXT.includes(low(a).slice(2))) && D.parametres.dest === '@V' && D.creation === undefined);
t('record: sha256 of the source', crypto.createHash('sha256').update(fs.readFileSync(path.join(ICI, 'contracts/src/buyback/TBlockBuybackVault.sol'))).digest('hex') === D.sha256Source);
t('record: deployer = the pack deployer (Grok wallet) = the veto', D.deployeur === low(PACK.deployeur) && low(D.parametres.veto) === low(PACK.parametres.dev2));
t('record: dest = V from the pack receipts (resolved)', low(B.resoudre(D).parametres.dest) === low(ADR.V) && CR.slice(-3 * 64, -2 * 64) === low(ADR.V).slice(2).padStart(64, '0'));
t('record: guardian = the pack DEV wallet', low(D.parametres.guardian) === low(PACK.parametres.dev));
t('record: keeper = the pack keeper', low(D.parametres.keeper) === low(PACK.parametres.keeper));
t('record: pools, tokens and numbers = the live buyback config', ['poolManager', 'v3Pool', 'weth', 'wtcoin', 'tblock', 'publicDelay', 'maxPerCall', 'minSpend', 'cooldown', 'twapWindow',
  'maxV3DevTicks', 'maxV4ImpactTicks', 'maxHookPpm', 'tipBps', 'maxTip'].every((k) => String(D.parametres[k]) === String(OLD.parametres[k])) && D.parametres.v4Key.join() === OLD.parametres.v4Key.join());
t('record as the preparer writes it: pret true, adresse / bloc / tx null', PREPM.pret === true && PREPM.adresse === null && PREPM.bloc === null && PREPM.tx === null);
t('record: integrity holds', (await B.integrite(D)).length === 0, (await B.integrite(D)).join());
t('record: the creation ends with the 24 constructor words of the parameters', CR.endsWith(B.argsAttendus(B.resoudre(D).parametres)) && B.argsAttendus(B.resoudre(D).parametres).length === 64 * B.MOTS_CONSTRUCTEUR);
const art = JSON.parse(lire('contracts/out/TBlockBuybackVault.sol/TBlockBuybackVault.json'));
t('record: frozen runtime = the forge artifact (size and masked sha256)', D.runtimeOctets === (art.deployedBytecode.object.length - 2) / 2
  && crypto.createHash('sha256').update(codeMasque(art.deployedBytecode.object, D.immutables)).digest('hex') === D.runtimeSha256Masque);
/* the preparer refuses three keys that are not distinct */
let refus = '';
try { execFileSync('node', [path.join(ICI, 'contracts', 'preparer-deploiement-buyback-vault.mjs')], { env: { ...process.env, SORTIE: path.join(tmp, 'x.js'), KEEPER: PACK.parametres.dev }, cwd: path.join(ICI, 'contracts'), stdio: 'pipe' }); } catch (e) { refus = String(e.stderr); }
t('preparer: a keeper equal to the guardian is refused, nothing written', /three different keys/.test(refus) && !fs.existsSync(path.join(tmp, 'x.js')));

/* ---------------- 2. integrity is red on every tampering */
const avec = (patch) => ({ ...D, ...patch, parametres: { ...D.parametres, ...(patch.parametres || {}) } });
const autre = '0x' + 'ab'.repeat(20);
t('integrity red: one byte of the creation changed', (await B.integrite(avec({ creationModele: D.creationModele.slice(0, -70) + (D.creationModele.slice(-70, -69) === '0' ? '1' : '0') + D.creationModele.slice(-69) }))).length > 0);
t('integrity red: a template carrying the real V word instead of the marker (a copied pack address)', (await B.integrite(avec({ creationModele: D.creationModele.replace('@V', low(ADR.V).slice(2).padStart(64, '0')) }))).length > 0);
t('integrity red: the template names V twice or not at all', (await B.integrite(avec({ creationModele: D.creationModele.replace('@V', '00'.repeat(32)) }))).length > 0 && (await B.integrite(avec({ creationModele: D.creationModele + '@V' }))).length > 0);
t('integrity red: the keeper shown differs from the keeper signed', (await B.integrite(avec({ parametres: { keeper: autre } }))).some((x) => /constructor words/.test(x)));
t('integrity red: dest is an address instead of the V marker', (await B.integrite(avec({ parametres: { dest: autre } }))).some((x) => /V marker/.test(x)));
t('integrity red: the deployer is not the pack deployer', (await B.integrite(avec({ deployeur: autre }))).some((x) => /deployer/.test(x)));
t('integrity red: the guardian is not DEV', (await B.integrite(avec({ parametres: { guardian: autre } }))).some((x) => /DEV wallet/.test(x)));
t('integrity red: no frozen runtime', (await B.integrite(avec({ runtimeSha256Masque: null }))).some((x) => /runtime/.test(x)));

/* ---------------- 3. the door, from the contract source, in plain words */
const SOL = lire('contracts/src/buyback/TBlockBuybackVault.sol');
t('door delay = DEST_DELAY in the source (7 days)', /uint256 public constant DEST_DELAY = 7 days;/.test(SOL) && B.PORTE.delaiS === 7 * 86400);
t('door window = DEST_WINDOW in the source (2 days)', /uint256 public constant DEST_WINDOW = 2 days;/.test(SOL) && B.PORTE.fenetreS === 2 * 86400);
const porte = B.regleDePorte();
t('door sentence: the DEV wallet proposes, 7 days, public, the second dev wallet can cancel, can never withdraw',
  /DEV wallet can propose a new vault/.test(porte) && /7 days later/.test(porte) && /public on chain/.test(porte) && /second dev wallet can cancel/.test(porte) && /Neither can ever withdraw ETH or TBLOCK/.test(porte), porte);
t('door sentence: says what an uncancelled proposal does', /receives every TBLOCK bought from then on/.test(porte));
t('door sentence and rows: no status words, no version names', propre(porte) && propre(B.lignes(D).map((r) => r.join(' ')).join(' ')));
t('rows show every constructor parameter (addresses)', ['dest', 'keeper', 'guardian', 'veto', 'tblock', 'wtcoin', 'weth', 'v3Pool', 'poolManager'].every((k) => B.lignes(D).some(([, v]) => String(v).includes(B.resoudre(D).parametres[k]))));
t('rows: amounts and durations computed from the record', B.lignes(D).some(([, v]) => v === '0.002 ETH at most, at least 0.0001 ETH / once an hour') && B.lignes(D).some(([, v]) => /after 6 hours without a keeper call/.test(v)));

/* ---------------- 4. planDeploiement (the page, before the wallet opens) with a stub chain */
const runtimeOk = '0x' + art.deployedBytecode.object.slice(2);
function chaine(o = {}) {
  const s = { chain: '0x2105', codeW: '0x', latest: '0xcc', pending: '0xcc', codeV: '0x6001', tbV: '0x' + low(D.parametres.tblock).slice(2).padStart(64, '0'), sim: runtimeOk, gas: '0x3356fd', prix: '0x5c8bfb', solde: '0x74bdf0c9eb72d5', ...o };
  const vus = [];
  const rpc = async (m, p) => {
    vus.push(m);
    if (m === 'eth_chainId') return s.chain;
    if (m === 'eth_getCode') return low(p[0]) === low(ADR.V) ? s.codeV : s.codeW;
    if (m === 'eth_getTransactionCount') return p[1] === 'pending' ? s.pending : s.latest;
    if (m === 'eth_call') { if (!p[0].to) { if (s.sim instanceof Error) throw s.sim; return s.sim; } return s.tbV; }
    if (m === 'eth_estimateGas') return s.gas;
    if (m === 'eth_gasPrice') return s.prix;
    if (m === 'eth_getBalance') return s.solde;
    throw new Error('unexpected ' + m);
  };
  return { rpc, vus };
}
let c = chaine();
let p = await B.planDeploiement(D, c.rpc, D.deployeur);
t('plan: ready, with the record data, the estimated gas and the CREATE address at the wallet nonce', p.pret && p.data === CR && p.gas === 0x3356fdn && p.adressePrevue === adresseCreate(D.deployeur, 0xccn), p.raison);
t('plan: the simulation ran before anything else could be offered', c.vus.includes('eth_call') && !c.vus.includes('eth_sendTransaction'));
t('plan refuses another wallet', !(await B.planDeploiement(D, chaine().rpc, PACK.parametres.dev)).pret);
t('plan refuses another network', !(await B.planDeploiement(D, chaine({ chain: '0x1' }).rpc, D.deployeur)).pret);
t('plan refuses a wallet with code', !(await B.planDeploiement(D, chaine({ codeW: '0xef0100' + '11'.repeat(20) }).rpc, D.deployeur)).pret);
t('plan refuses a pending transaction', !(await B.planDeploiement(D, chaine({ pending: '0xcd' }).rpc, D.deployeur)).pret);
t('plan refuses a vault without code', !(await B.planDeploiement(D, chaine({ codeV: '0x' }).rpc, D.deployeur)).pret);
t('plan refuses a vault of another token', !(await B.planDeploiement(D, chaine({ tbV: '0x' + '00'.repeat(12) + 'ab'.repeat(20) }).rpc, D.deployeur)).pret);
t('plan refuses a simulation that reverts', !(await B.planDeploiement(D, chaine({ sim: new Error('execution reverted') }).rpc, D.deployeur)).pret);
const simFaux = runtimeOk.slice(0, 2 + 200) + (runtimeOk.slice(202, 204) === 'ff' ? '00' : 'ff') + runtimeOk.slice(204);
{ const q = await B.planDeploiement(D, chaine({ sim: simFaux }).rpc, D.deployeur); t('plan refuses a simulation that returns another code', q.pret === false && /does not give the frozen build/.test(q.raison), q.raison); }
t('plan refuses a balance under twice the gas cost', /twice the estimated gas/.test((await B.planDeploiement(D, chaine({ solde: '0x1' }).rpc, D.deployeur)).raison));
t('plan refuses a record already deployed', (await B.planDeploiement(avec({ adresse: autre }), chaine().rpc, D.deployeur)).fait === true);
t('plan refuses a record not marked ready', !(await B.planDeploiement(avec({ pret: false }), chaine().rpc, D.deployeur)).pret);
t('plan refuses a tampered record', !(await B.planDeploiement(avec({ parametres: { keeper: autre } }), chaine().rpc, D.deployeur)).pret);

/* ---------------- 5. controleEnvoi (the page, after the receipt) */
const A = adresseCreate(D.deployeur, 0xccn);
const txOk = { hash: '0x' + '11'.repeat(32), from: D.deployeur, to: null, nonce: '0xcc', input: CR, blockNumber: '0x10' };
const recuOk = { transactionHash: '0x' + '11'.repeat(32), status: '0x1', contractAddress: A, blockNumber: '0x10' };
t('controleEnvoi: a good receipt', B.controleEnvoi(D, D.deployeur, txOk, recuOk).length === 0);
t('controleEnvoi: status 0', B.controleEnvoi(D, D.deployeur, txOk, { ...recuOk, status: '0x0' }).length > 0);
t('controleEnvoi: another signer', B.controleEnvoi(D, D.deployeur, { ...txOk, from: autre }, recuOk).length > 0);
t('controleEnvoi: not a creation', B.controleEnvoi(D, D.deployeur, { ...txOk, to: autre }, recuOk).length > 0);
t('controleEnvoi: other data', B.controleEnvoi(D, D.deployeur, { ...txOk, input: CR.slice(0, -2) + '00' }, recuOk).length > 0);
t('controleEnvoi: an address that is not the CREATE address', B.controleEnvoi(D, D.deployeur, txOk, { ...recuOk, contractAddress: autre }).length > 0);
t('controleRuntime: the frozen build with any immutable values', (await B.controleRuntime(D, runtimeOk.slice(0, 2 + 2 * D.immutables[0][0]) + 'ff'.repeat(32) + runtimeOk.slice(2 + 2 * (D.immutables[0][0] + 32)))).length === 0);
t('controleRuntime: one code byte outside the slots changed', (await B.controleRuntime(D, simFaux)).length > 0);

/* ---------------- 6. verifierBuybackVault with a stub chain */
const w = (x) => '0x' + BigInt(x).toString(16).padStart(64, '0');
const wa = (a) => '0x' + low(a).slice(2).padStart(64, '0');
const codeV = '0x6080604052';
const hV = '0x' + [...keccak256(Uint8Array.from([0x60, 0x80, 0x60, 0x40, 0x52]))].map((b) => b.toString(16).padStart(2, '0')).join('');
const P = D.parametres;
const VALS = { 'DEST()': wa(ADR.V), 'destCodehash()': hV, 'GUARDIAN()': wa(P.guardian), 'VETO()': wa(P.veto), 'KEEPER()': wa(P.keeper), 'TBLOCK()': wa(P.tblock),
  'POOL_MANAGER()': wa(P.poolManager), 'V3_POOL()': wa(P.v3Pool), 'WETH()': wa(P.weth), 'WTCOIN()': wa(P.wtcoin), 'V4_POOL_ID()': PACK.existants.v4PoolId,
  'PUBLIC_DELAY()': w(P.publicDelay), 'MAX_PER_CALL()': w(P.maxPerCall), 'MIN_SPEND()': w(P.minSpend), 'COOLDOWN()': w(P.cooldown), 'TWAP_WINDOW()': w(P.twapWindow),
  'MAX_V3_DEV_TICKS()': w(P.maxV3DevTicks), 'MAX_V4_IMPACT_TICKS()': w(P.maxV4ImpactTicks), 'MAX_HOOK_PPM()': w(P.maxHookPpm), 'TIP_BPS()': w(P.tipBps), 'MAX_TIP()': w(P.maxTip),
  'DEST_DELAY()': w(604800), 'DEST_WINDOW()': w(172800), 'doorRenounced()': w(0), 'pendingDest()': w(0) };
const VVALS = { 'DEV()': wa(P.guardian), 'DEV2()': wa(P.veto), 'TBLOCK()': wa(P.tblock) };
const SEL = Object.fromEntries([...Object.keys(VALS), ...Object.keys(VVALS)].map((s) => [selecteur(s).toLowerCase(), s]));
function chaineV(o = {}) {
  const vals = { ...VALS, ...(o.vals || {}) };
  return async (m, p2) => {
    if (m === 'eth_chainId') return '0x2105';
    if (m === 'eth_getTransactionByHash') return o.tx || txOk;
    if (m === 'eth_getTransactionReceipt') return o.recu || recuOk;
    if (m === 'eth_getCode') return low(p2[0]) === low(A) ? (o.code || runtimeOk) : codeV;
    if (m === 'eth_call') { const s = SEL[low(p2[0].data)]; return low(p2[0].to) === low(ADR.V) ? VVALS[s] : vals[s]; }
    throw new Error('unexpected ' + m);
  };
}
let v = await B.verifierBuybackVault(D, txOk.hash, chaineV());
t('verifier: every line holds on a good chain', v.ok && v.adresse === low(A), v.lignes.filter((l) => !l.ok).map((l) => l.quoi).join(' | '));
t('verifier: at least 35 lines', v.lignes.length >= 35, v.lignes.length);
for (const [quoi, o] of [['DEST is not V', { vals: { 'DEST()': wa(autre) } }], ['GUARDIAN is not DEV', { vals: { 'GUARDIAN()': wa(autre) } }],
  ['KEEPER is not the expected one', { vals: { 'KEEPER()': wa(autre) } }], ['the door is closed', { vals: { 'doorRenounced()': w(1) } }],
  ['a proposal is pending', { vals: { 'pendingDest()': wa(autre) } }], ['the door delay is not 7 days', { vals: { 'DEST_DELAY()': w(259200) } }],
  ['destCodehash is not the vault code', { vals: { 'destCodehash()': w(1) } }], ['the runtime is not the frozen build', { code: simFaux }],
  ['tx.from is not the deployer', { tx: { ...txOk, from: autre } }], ['status 0', { recu: { ...recuOk, status: '0x0' } }]]) {
  const r = await B.verifierBuybackVault(D, txOk.hash, chaineV(o));
  t('verifier red when ' + quoi, !r.ok);
}
t('verifier red when the caller expects another keeper', !(await B.verifierBuybackVault(D, txOk.hash, chaineV(), { keeper: autre })).ok);

/* ---------------- 7. the noter (pure) */
const texte = PREP; /* the record text before the deploy (the preparer output) */
const verdicts = [{ ok: true, adresse: low(A) }, { ok: true, adresse: low(A) }];
let n = await noterBuybackVault({ rec: D, texte, hash: txOk.hash, tx: txOk, recu: recuOk, verdicts });
t('noter: writes the three lines from the receipt', n.ok && n.texte === texte.replace(BLOC_VIDE, "  adresse: '" + low(A) + "',\n  bloc: 16,\n  tx: '" + txOk.hash + "',\n"), n.pourquoi);
t('noter: nothing else in the record changes', n.ok && n.texte.split('\n').filter((l, i) => l !== texte.split('\n')[i]).length === 3);
t('noter refuses when one node does not verify', !(await noterBuybackVault({ rec: D, texte, hash: txOk.hash, tx: txOk, recu: recuOk, verdicts: [verdicts[0], { ok: false }] })).ok);
t('noter refuses a single node', !(await noterBuybackVault({ rec: D, texte, hash: txOk.hash, tx: txOk, recu: recuOk, verdicts: [verdicts[0]] })).ok);
t('noter refuses a receipt of another tx', !(await noterBuybackVault({ rec: D, texte, hash: '0x' + '22'.repeat(32), tx: txOk, recu: recuOk, verdicts })).ok);
t('noter refuses a failed deploy', !(await noterBuybackVault({ rec: D, texte, hash: txOk.hash, tx: txOk, recu: { ...recuOk, status: '0x0' }, verdicts })).ok);
t('noter refuses a verifier that checked another address', !(await noterBuybackVault({ rec: D, texte, hash: txOk.hash, tx: txOk, recu: recuOk, verdicts: [verdicts[0], { ok: true, adresse: autre }] })).ok);
t('noter refuses a record already naming another address', !(await noterBuybackVault({ rec: avec({ adresse: autre, tx: '0x' + '33'.repeat(32), bloc: 9 }), texte, hash: txOk.hash, tx: txOk, recu: recuOk, verdicts })).ok);
t('noter: the same deploy noted again is unchanged', (await noterBuybackVault({ rec: avec({ adresse: low(A), tx: txOk.hash, bloc: 16 }), texte: n.texte, hash: txOk.hash, tx: txOk, recu: recuOk, verdicts })).texte === n.texte);
t('noter refuses a text that is not the record checked', !(await noterBuybackVault({ rec: D, texte: texte.replace(D.sha256Creation, '0'.repeat(64)), hash: txOk.hash, tx: txOk, recu: recuOk, verdicts })).ok);
t('decision: write over the text read, unchanged on the same, refuse anything else', decision(texte, n.texte, texte) === 'ecrire' && decision(n.texte, n.texte, texte) === 'inchange' && !['ecrire', 'inchange'].includes(decision('other', n.texte, texte)));

/* ---------------- 8. the keeper (pure parts + one stub round) */
const moi = '0x' + '0c'.repeat(20);
const base = { solde: 5n * 10n ** 15n, armed: true, keeperAt: 100n, publicAt: 100n + 21600n, minSpend: 10n ** 14n, maxPerCall: 2n * 10n ** 15n, keeper: moi };
t('decider: keeper from keeperAt, MAX_PER_CALL at most', K.decider(base, moi, 100).appeler === true && K.decider(base, moi, 100).montant === 2n * 10n ** 15n && K.decider(base, moi, 100).comme === 'keeper');
t('decider: keeper before keeperAt waits', !K.decider(base, moi, 99).appeler);
t('decider: not the keeper waits until publicAt', !K.decider({ ...base, keeper: autre }, moi, 21699).appeler && K.decider({ ...base, keeper: autre }, moi, 21700).comme === 'public');
t('decider: not the keeper and not armed: never', !K.decider({ ...base, keeper: autre, armed: false }, moi, 10 ** 9).appeler);
t('decider: all the balance when below MAX_PER_CALL', K.decider({ ...base, solde: 3n * 10n ** 14n }, moi, 100).montant === 3n * 10n ** 14n);
t('decider: below MIN_SPEND = drained', K.decider({ ...base, solde: 10n ** 14n - 1n }, moi, 100).epuise === true);
const cibles = [low(A), low(OLD.adresse)];
const txK = { chainId: 8453, nonce: 0n, maxPriorityFeePerGas: 1n, maxFeePerGas: 10n ** 7n, gas: 500000n, to: low(A), value: 0n, data: K.donneesBuyback(2n * 10n ** 15n) };
const jette = (tx, o = {}) => { try { K.verifierEnvoi(tx, { cibles, chainId: 8453, maxParCible: { [low(A)]: 2n * 10n ** 15n }, ...o }); return false; } catch (_) { return true; } };
t('verifierEnvoi: a buyback call passes', !jette(txK));
t('verifierEnvoi: another destination throws', jette({ ...txK, to: autre }));
t('verifierEnvoi: value throws', jette({ ...txK, value: 1n }));
t('verifierEnvoi: another function throws', jette({ ...txK, data: selecteur('proposeDest(address)') + '0'.repeat(64) }) && jette({ ...txK, data: selecteur('sweepToDest()') }));
t('verifierEnvoi: above MAX_PER_CALL throws', jette({ ...txK, data: K.donneesBuyback(2n * 10n ** 15n + 1n) }));
t('verifierEnvoi: another chain throws', jette({ ...txK, chainId: 1 }));
t('verifierEnvoi: gas or fee above the caps throws', jette({ ...txK, gas: 2000000n }) && jette({ ...txK, maxFeePerGas: 3000000000n }));
const sel = (s) => selecteur(s).slice(2);
t('gardeDuRevert: PriceOffTwap from error data', K.gardeDuRevert({ data: '0x' + sel('PriceOffTwap(int24,int24)') + '00'.repeat(64) }) === 'PriceOffTwap');
t('gardeDuRevert: TooEarly from a node message', K.gardeDuRevert(new Error('execution reverted: custom error 0x' + sel('TooEarly(uint256)') + ': 00')) === 'TooEarly');
t('gardeDuRevert: an unknown revert is not a guard', K.gardeDuRevert({ data: '0xdeadbeef' }) === null);
const cle = '0x' + '5a'.repeat(32), KA = low(adresseDe(cle));
const recK = { ...D, adresse: low(A), parametres: { ...D.parametres, keeper: KA } };
t('keeper OFF: no address in the record', K.creerKeeperBuyback({ cle, rec: D, rpc: async () => null }).etat().etat === 'OFF');
t('keeper OFF: no key', /BUYBACK_KEEPER_KEY is not set/.test(K.creerKeeperBuyback({ rec: recK, rpc: async () => null }).etat().pourquoi));
{ const e = K.creerKeeperBuyback({ cle: '0xzz12', rec: recK, rpc: async () => null }).etat(); t('keeper OFF: a malformed key, its value never shown', e.etat === 'OFF' && /malformed/.test(e.pourquoi) && !String(e.pourquoi).includes('zz12'), e.pourquoi); }
t('keeper OFF: a key that is not the record keeper', /not the buyback keeper/.test(K.creerKeeperBuyback({ cle, rec: D, rpc: async () => null }).etat().pourquoi) === false
  && /not the buyback keeper/.test(K.creerKeeperBuyback({ cle, rec: { ...D, adresse: low(A) }, rpc: async () => null }).etat().pourquoi));
/* one stub round: the guard refuses the simulation -> counted as a guard, nothing sent, no failure */
function chaineK({ simule = null } = {}) {
  const envoyes = [];
  const rpc = async (m, q) => {
    if (m === 'eth_chainId') return '0x2105';
    if (m === 'eth_getBlockByNumber') return { timestamp: '0x' + (200).toString(16), baseFeePerGas: '0x5000' };
    if (m === 'eth_getBalance') return '0x' + (5n * 10n ** 15n).toString(16);
    if (m === 'eth_call') {
      const d = low(q[0].data), s = { [selecteur('MIN_SPEND()').toLowerCase()]: w(10n ** 14n), [selecteur('MAX_PER_CALL()').toLowerCase()]: w(2n * 10n ** 15n),
        [selecteur('KEEPER()').toLowerCase()]: low(q[0].to) === low(A) ? wa(KA) : wa(autre), [selecteur('armed()').toLowerCase()]: w(1),
        [selecteur('readyAt()').toLowerCase()]: w(100) + w(100 + 21600).slice(2) };
      if (d.startsWith(K.SEL_BUYBACK)) { if (simule) throw simule; return '0x'; }
      return s[d];
    }
    if (m === 'eth_estimateGas') return '0x60000';
    if (m === 'eth_maxPriorityFeePerGas') return '0x1';
    if (m === 'eth_getTransactionCount') return '0x0';
    if (m === 'eth_sendRawTransaction') { envoyes.push(q[0]); return '0x'; }
    throw new Error('unexpected ' + m);
  };
  return { rpc, envoyes };
}
let ck = chaineK({ simule: Object.assign(new Error('execution reverted'), { data: '0x' + sel('PriceOffTwap(int24,int24)') + '00'.repeat(64) }) });
let kp = K.creerKeeperBuyback({ cle, rec: recK, ancien: OLD.adresse, rpc: ck.rpc });
let r = await kp.tour();
t('keeper round: a PriceOffTwap simulation = retry later, nothing sent, no failure', !r.fait && ck.envoyes.length === 0 && kp.etat().compteurs.gardes === 1 && kp.etat().echecsSuite === 0 && /PriceOffTwap/.test(r.pourquoi), r.pourquoi);
ck = chaineK();
kp = K.creerKeeperBuyback({ cle, rec: recK, ancien: OLD.adresse, rpc: ck.rpc });
r = await kp.tour();
t('keeper round: a passing simulation sends ONE buyback(0.002 ETH) to the new buyback', r.fait && r.to === low(A) && ck.envoyes.length === 1 && r.montant === 2n * 10n ** 15n);
t('keeper state: never the key', !JSON.stringify(kp.etat()).includes(cle.slice(2)));

/* ---------------- 9. the deploy page */
const HTML = lire('deployer-tblock-buyback-vault.html');
const script = HTML.replace(/[\s\S]*<script type="module">/, '').replace(/<\/script>[\s\S]*/, '');
t('page imports the module and the record', /import\('\.\/buyback-vault\.js'\)/.test(HTML) && /import\('\.\/tblock-buyback-vault-deploiement\.js'\)/.test(HTML));
t('page: ONE eth_sendTransaction, and only after planDeploiement', (script.match(/eth_sendTransaction/g) || []).length === 1 && script.indexOf('B.planDeploiement') < script.indexOf('eth_sendTransaction')
  && /const p = await preparer\(\);[\s\S]*if \(!p\.pret\) return;[\s\S]*eth_sendTransaction/.test(script));
t('page: the data sent is the plan data (the record), from the connected wallet', /\{ from: acct, data: p\.data, gas: /.test(script));
t('page: after the receipt, controleEnvoi, controleRuntime and the verifier', /B\.controleEnvoi\(D, acct, tx, recu\)/.test(script) && /B\.controleRuntime\(D, code\)/.test(script) && /B\.verifierBuybackVault\(D, h, rpc\)/.test(script));
t('page shows the door sentence and every row', /B\.regleDePorte\(\)/.test(script) && /B\.lignes\(D\)/.test(script));
const visible = HTML.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ');
const litteraux = (script.replace(/\/\*[\s\S]*?\*\//g, '').match(/'(?:[^'\\\n]|\\.)*'/g) || []).join(' ');
t('page text: no status words, no version names, no 72 hours', propre(visible + ' ' + litteraux), (visible + litteraux).match(INTERDITS.find((re) => re.test(visible + ' ' + litteraux)) || /$^/));
t('page title names the product', /<title>Deploy the TBLOCK buyback<\/title>/.test(HTML));

/* ---------------- 10. server wiring and served files */
const SRV = lire('serveur-web.js');
const servis = new Set([...SRV.match(/const SERVIS\s*=\s*\[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
t('served: the page, its module and its record', ['deployer-tblock-buyback-vault.html', 'buyback-vault.js', 'tblock-buyback-vault-deploiement.js'].every((f) => servis.has(f)));
t('not served: the server keeper and the noter', !servis.has('buyback-keeper.js') && ![...servis].some((f) => /noter-deploiement-buyback-vault/.test(f)));
t('server: the keeper takes its key from process.env.BUYBACK_KEEPER_KEY and the record', /creerKeeperBuyback\(\{ cle: process\.env\.BUYBACK_KEEPER_KEY \|\| null, rec: BUYBACK_VAULT_DEPLOIEMENT, ancien: ECONOMIE_DEPLOIEMENT\.adresseBuyback \|\| null,/.test(SRV));
t('server: OFF in trial mode', /ESSAI_SRV\.actif\s*\n\s*\? creerKeeperBuyback\(\{ desactive:/.test(SRV));
t('server: its state on the health route', /buybackKeeper: keeperBuyback\.etat\(\),/.test(SRV));
t('robots: the deploy page is not indexed', /'Disallow: \/deployer-tblock-buyback-vault\.html'/.test(SRV));

/* ---------------- 11. the fees page bullet */
const texteDe = (html) => String(html).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, '\'').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
/* the fees module as it is on disk, loaded from tmp with ONLY its record import pointed at the preparer output (address null) */
const SRC_FR = lire('frais-risques.js'), IMP_REC = "from './tblock-buyback-vault-deploiement.js'";
let FR0 = null;
if (SRC_FR.split(IMP_REC).length === 2) {
  fs.writeFileSync(path.join(tmp, 'fr0.mjs'), SRC_FR.replace(IMP_REC, () => "from '" + pathToFileURL(path.join(tmp, 'r.mjs')).href + "'")
    .replace(/from '\.\/([^']+)'/g, (_, f) => "from '" + pathToFileURL(path.join(ICI, f)).href + "'"));
  FR0 = await import(pathToFileURL(path.join(tmp, 'fr0.mjs')).href);
}
const sans = FR0 ? texteDe(FR0.rendre(FR0.CHIFFRES, null)) : '';
t('fees page with the record address null: the earlier bullet, unchanged', FR0 !== null && FR0.CHIFFRES.buybackVault === null && sans.includes('Buybacks are not running.') && !sans.includes('pays the holders vault'));
const Cav = { ...FR.CHIFFRES, buybackVault: { adresse: low(A), vault: low(ADR.V), maxParAppel: BigInt(P.maxPerCall), pauseS: Number(P.cooldown), porte: B.regleDePorte() } };
const avecTxt = texteDe(FR.rendre(Cav, null));
t('fees page once recorded: the buyback pays the holders vault, per call and once an hour', avecTxt.includes('The TBLOCK buyback pays the holders vault.') && avecTxt.includes('at most 0.002 ETH per call and once an hour'));
t('fees page once recorded: the door sentence, word for word', avecTxt.includes('Exit door: ' + B.regleDePorte()));
t('fees page once recorded: the earlier contracts keep their dated read, and their TBLOCK is not said to reach the holders vault',
  avecTxt.includes('Read on chain on ' + FR.MESURE_BUYBACK.date + ': neither had received ETH or made a buy') && avecTxt.includes('its own earlier vault with sweepToDest(), not to the holders vault') && !avecTxt.includes('Buybacks are not running.'));
t('fees page once recorded: no status words, no version names', propre(FR.buybackVaultLi(Cav.buybackVault, FR.MESURE_BUYBACK, 2).replace(/<[^>]+>/g, ' ')));

/* ---------------- 12. the DEPLOYED record (2026-11-12): what the noter wrote, against the chain, and what each part does with it now */
const ADRESSE_DEPLOYEE = '0x93ccbc8697c115f5171d089432ce4b817d6dbb7b', TX_DEPLOI = '0xc5e2bb94e81315fe444ff5a8af304e72c1bf55fdd61eedc01da6b70c30999b24', BLOC_DEPLOI = 56544683;
const DEPLOYEUR = '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b';
t('deployed record: names the deployed address, block and tx, by the deployer', REC.adresse === ADRESSE_DEPLOYEE && REC.bloc === BLOC_DEPLOI && REC.tx === TX_DEPLOI && REC.deployeur === DEPLOYEUR && REC.pret === true);
t('deployed record: integrity holds', (await B.integrite(REC)).length === 0, (await B.integrite(REC)).join());
const LECTURES = new Set(['eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_getCode']);
const lireNoeud = (url) => async (method, params) => {
  if (!LECTURES.has(method)) throw new Error('read-only: ' + method);
  for (let k = 0; ; k++) {
    try {
      const j = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(20000) }).then((x) => x.json());
      if (j.error) throw new Error(method + ': ' + JSON.stringify(j.error));
      if (j.result === null || j.result === undefined) throw new Error(method + ': null');
      return j.result;
    } catch (e) { if (k >= 3) throw e; await new Promise((ok2) => setTimeout(ok2, 1500 * (k + 1))); }
  }
};
const lus = [];
for (const url of NOEUDS) {
  const nom = new URL(url).host;
  let tx = null, recu = null, code = null, err = '';
  try { const rpc = lireNoeud(url); tx = await rpc('eth_getTransactionByHash', [REC.tx]); recu = await rpc('eth_getTransactionReceipt', [REC.tx]); code = await rpc('eth_getCode', [REC.adresse, 'latest']); }
  catch (e) { err = String((e && e.message) || e).slice(0, 200); }
  t('deployed, read on ' + nom + ': the tx, its receipt and the code at the address', Boolean(tx && recu && code), err);
  if (!(tx && recu && code)) continue;
  lus.push({ tx, recu });
  t('deployed, ' + nom + ': receipt status 1, in the record block', recu.status === '0x1' && low(recu.transactionHash) === REC.tx && Number.parseInt(recu.blockNumber, 16) === REC.bloc && tx.blockNumber === recu.blockNumber, recu.status + ' ' + recu.blockNumber);
  t('deployed, ' + nom + ': tx.from = the deployer, a contract creation', low(tx.from) === DEPLOYEUR && !tx.to && low(tx.hash) === REC.tx, tx.from);
  t('deployed, ' + nom + ': contractAddress = the record address = the CREATE address of the deployer at the tx nonce', low(recu.contractAddress) === REC.adresse && low(adresseCreate(DEPLOYEUR, BigInt(tx.nonce))) === REC.adresse, recu.contractAddress);
  t('deployed, ' + nom + ': the signed data is the record creation (controleEnvoi holds)', B.controleEnvoi(REC, REC.deployeur, tx, recu).length === 0, B.controleEnvoi(REC, REC.deployeur, tx, recu).join(' | '));
  t('deployed, ' + nom + ': the code at the address is the frozen build', (await B.controleRuntime(REC, code)).length === 0);
}
t('deployed: both nodes agree on the tx and its receipt', lus.length === 2 && empreinte(lus[0].tx, lus[0].recu) === empreinte(lus[1].tx, lus[1].recu));
if (lus.length) {
  const q = await noterBuybackVault({ rec: REC, texte: DISQUE, hash: REC.tx, tx: lus[0].tx, recu: lus[0].recu, verdicts: [{ ok: true, adresse: REC.adresse }, { ok: true, adresse: REC.adresse }] });
  t('noter on the real receipt: the same deploy noted again leaves the record unchanged', q.ok && q.texte === DISQUE, q.pourquoi);
}
{ const q = await noterBuybackVault({ rec: REC, texte: DISQUE, hash: txOk.hash, tx: txOk, recu: recuOk, verdicts });
  t('noter on the deployed record: another deploy is refused, nothing overwritten', !q.ok && q.texte === undefined && q.pourquoi === 'the record already names ' + REC.adresse + ' (tx ' + REC.tx + '): nothing overwritten', q.pourquoi);
  t('noter CLI on the deployed record: another text never replaces the record on disk', !['ecrire', 'inchange'].includes(decision(DISQUE, n.texte, PREP))); }
{ const c2 = chaine();
  const q = await B.planDeploiement(REC, c2.rpc, REC.deployeur);
  t('page plan on the deployed record: already deployed, nothing offered to sign, no chain read', q.pret === false && q.fait === true && q.raison === 'already deployed at ' + REC.adresse + ': nothing more to sign'
    && q.data === undefined && q.gas === undefined && q.adressePrevue === undefined && c2.vus.length === 0, q.raison); }
{ const k0 = K.creerKeeperBuyback({ cle: null, rec: REC, ancien: OLD.adresse, rpc: async () => null });
  t('keeper on the deployed record, as the server wires it without BUYBACK_KEEPER_KEY: OFF, never started', k0.etat().etat === 'OFF' && /BUYBACK_KEEPER_KEY is not set/.test(k0.etat().pourquoi) && k0.demarrer() === false, k0.etat().pourquoi);
  const k1 = K.creerKeeperBuyback({ cle, rec: REC, ancien: OLD.adresse, rpc: async () => null });
  t('keeper on the deployed record, a key that is not its keeper: OFF, never started', k1.etat().etat === 'OFF' && /not the buyback keeper named in its record/.test(k1.etat().pourquoi) && k1.demarrer() === false && !JSON.stringify(k1.etat()).includes(cle.slice(2)), k1.etat().pourquoi); }
{ const html = FR.rendre(FR.CHIFFRES, null), reel = texteDe(html), bv = FR.CHIFFRES.buybackVault;
  t('fees page now (the deployed record): the buyback named from the record, paying the holders vault', bv !== null && bv.adresse === REC.adresse && low(bv.vault) === low(ADR.V) && bv.maxParAppel === BigInt(REC.parametres.maxPerCall));
  t('fees page now: the new bullet (pays the holders vault, per call and once an hour, the door), not the earlier one', reel.includes('The TBLOCK buyback pays the holders vault.') && reel.includes('at most 0.002 ETH per call and once an hour')
    && reel.includes('Exit door: ' + B.regleDePorte()) && !reel.includes('Buybacks are not running.'));
  t('fees page now: the buyback and the holders vault link to their addresses', html.includes('https://basescan.org/address/' + REC.adresse + '"') && html.toLowerCase().includes('https://basescan.org/address/' + low(ADR.V) + '"')); }

fs.rmSync(tmp, { recursive: true, force: true });
console.log(ok + '/' + (ok + ko) + (ko ? ' -- RED' : ' -- green'));
process.exitCode = ko ? 1 : 0;
