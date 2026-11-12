/* muter-skins-spin.mjs — every guard of the 1 USDC Skins / new Spin work is REMOVED or FALSIFIED, one at a time, in a COPY of its module
 * (.mutant-<name>-<pid>.js, next to the module so its relative imports work, deleted at the end); the four tests must go red:
 *   test-skins-spin-deploiement-20261112.mjs, test-deployer-skins-spin-20261112.mjs, test-noter-skins-spin-20261112.mjs,
 *   test-bascule-skins-spin-20261112.mjs. The repo modules are never written. Usage: node muter-skins-spin.mjs
 * The copy reaches the tests by SKINS_SPIN_MODULE (skins-spin.js only) and MUTANT_FICHIER + MUTANT_CHEMIN (the wiring test puts it in its
 * module copy under the real name). An anchor is found EXACTLY once or the mutant is counted as missing (exit 1). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const BANCS = ['test-skins-spin-deploiement-20261112.mjs', 'test-deployer-skins-spin-20261112.mjs', 'test-noter-skins-spin-20261112.mjs', 'test-bascule-skins-spin-20261112.mjs'];
const M = [
  /* skins-spin.js */
  ['skins-spin.js', 'deployes: any address followed', 'if (a !== pred[e.cle] || !HASH.test(bas(e.tx))', 'if (!/^0x[0-9a-f]{40}$/.test(a) || !HASH.test(bas(e.tx))'],
  ['skins-spin.js', 'deployes: a test fixture followed', 'rec.etapes.length !== 2 || rec.fixtureDeTest) return out;', 'rec.etapes.length !== 2) return out;'],
  ['skins-spin.js', 'integrite: displayed config not compared to the words', "    if (attendu !== e.args.join(',')) faux.push(p + ' constructor words differ from the displayed config');\n", ''],
  ['skins-spin.js', 'integrite: creation sha256 not checked', "if ((await sha256Octets(data)) !== e.sha256Creation) faux.push(p + ' creation sha256');", ''],
  ['skins-spin.js', 'integrite: router / vault may be typed', "faux.push('the router and the vault must be named @P / @V (read from the pack record)');", ''],
  ['skins-spin.js', 'integrite: dev batch bounds not checked', "if (!(mn > 0n && mn <= mx)) faux.push('Spin dev batch bounds');", ''],
  ['skins-spin.js', 'resoudre: P and V swapped', "Object.freeze({ '@P': ADRESSES_PACK_ECONOMIE_V2.P, '@V': ADRESSES_PACK_ECONOMIE_V2.V })", "Object.freeze({ '@P': ADRESSES_PACK_ECONOMIE_V2.V, '@V': ADRESSES_PACK_ECONOMIE_V2.P })"],
  ['skins-spin.js', 'controleEtape: nonce not checked', "  if (BigInt(tx.nonce) !== BigInt(N) + BigInt(k)) ko.push(", "  if (false) ko.push("],
  ['skins-spin.js', 'controleEtape: address not checked', "  if (ca !== pred[e.cle]) ko.push(", "  if (false) ko.push("],
  ['skins-spin.js', 'controleEtape: signed data not checked', "  if (bas(tx.input || tx.data) !== bas(creationEtape(rec, k))) ko.push(", "  if (false) ko.push("],
  ['skins-spin.js', 'controleEtape: sender not checked', "  if (bas(tx.from) !== adresse(wallet)) ko.push(", "  if (false) ko.push("],
  ['skins-spin.js', 'etapeSuivante: any wallet may sign', "  if (me !== adresse(rec.deployeur)) return non(", "  if (false) return non("],
  ['skins-spin.js', 'etapeSuivante: a noted record offered again', "  if (rec.etapes && rec.etapes.some((e) => e.adresse)) return non(", "  if (false) return non("],
  ['skins-spin.js', 'etapeSuivante: pending transaction ignored', "  if (BigInt(latest) !== BigInt(pending)) return non(", "  if (false) return non("],
  ['skins-spin.js', 'etapeSuivante: simulation answer not checked', "  if (!(await codeConforme(e, sim))) return non(", "  if (false) return non("],
  ['skins-spin.js', 'etapeSuivante: code already at the address ignored', "  if (String(ici).replace(/^0x/, '').length) return non(", "  if (false) return non("],
  ['skins-spin.js', 'etapeSuivante: code of an earlier step not checked', "    if (!(await codeConforme(rec.etapes[j], code))) return non(", "    if (false) return non("],
  ['skins-spin.js', 'etapeSuivante: a nonce used elsewhere ignored', "  if (BigInt(latest) !== N + BigInt(k)) return non(", "  if (false) return non("],
  ['skins-spin.js', 'verifierPaire: the 1 USDC price not read back', "  await eqN(S, 'MINT_PRICE()', K.mintPriceUsdc, 'Skins.MINT_PRICE() = ' + K.mintPriceUsdc + ' (1 USDC)');\n", ''],
  ['skins-spin.js', 'verifierPaire: the vault listing not checked', "const faux2 = async (to, sig, quoi, arg) => { const v = enBool(await lire(rpc, to, sig, arg)); return t(v === false, quoi, v); };", "const faux2 = async (to, sig, quoi) => t(true, quoi);"],
  ['skins-spin.js', 'noterPaire: one node is enough', "verdicts.length < 2 || verdicts.some((v) => !v || v.ok !== true)", "verdicts.length < 1"],
  ['skins-spin.js', 'noterPaire: a noted record rewritten', "  if (rec.etapes.some((e) => e.adresse !== null || e.tx !== null || e.bloc !== null) || rec.nonceN !== null) return non(", "  if (false) return non("],
  ['skins-spin.js', 'noterPaire: blocks out of order accepted', "    if (bloc < avant) return non(", "    if (false) return non("],
  /* spin-actif.js */
  ['spin-actif.js', 'spin-actif: another prize table served', "  if (!meme) return base(", "  if (false) return base("],
  ['spin-actif.js', 'spin-actif: the earlier Spin forgotten (its last spins lost)', "    avant: Object.freeze(vieux), refus: null,", "    avant: null, refus: null,"],
  ['spin-actif.js', 'spin-actif: no router part said', "    devRouteur: Object.freeze({ routeur: bas(c.router)", "    devRouteur: null && Object.freeze({ routeur: bas(c.router)"],
  /* blockskins-actif.js */
  ['blockskins-actif.js', 'blockskins-actif: the 1 USDC Skins never followed', "const RACINE = SKINS_UN || SKINS_PACK || BLOCKSKINS_DEPLOIEMENT;", "const RACINE = SKINS_PACK || BLOCKSKINS_DEPLOIEMENT;"],
  ['blockskins-actif.js', 'blockskins-actif: the earlier collections dropped (skin #1 unreadable)', "    imageDansLeWallet: true, constructeur: Object.freeze({ usdc: String(d.config.expectedUsdc).toLowerCase() }), precedent });", "    imageDansLeWallet: true, constructeur: Object.freeze({ usdc: String(d.config.expectedUsdc).toLowerCase() }), precedent: null });"],
  ['blockskins-actif.js', 'blockskins-actif: the 1 USDC Skins XP read from another cursor', "...(un ? [s('skinsUn', un)] : [])", "...(un ? [s('skinsPack', un)] : [])"],
  /* economie-pack.js */
  ['economie-pack.js', 'economie-pack: a skin mint still said to be a play', 'export const SKINS_JOUE = SKINS_MINT === SKINS;', 'export const SKINS_JOUE = true;'],
  ['economie-pack.js', 'economie-pack: the router refuses the 1 USDC Skins', 'if (g !== TAM && g !== SKINS && g !== SKINS_MINT) throw', 'if (g !== TAM && g !== SKINS) throw'],
  ['economie-pack.js', 'economie-pack: the price read on the pack\'s Skins', '  mintPriceSkin: () => vue(SKINS_MINT, SEL.MINT_PRICE),', '  mintPriceSkin: () => vue(SKINS, SEL.MINT_PRICE),'],
  /* frais-risques.js */
  ['frais-risques.js', 'fees page: the 1 USDC Skins said to be a play', '    skinJoue: EPK.SKINS_JOUE,', '    skinJoue: true,'],
  ['frais-risques.js', 'fees page: the spin router part never said', "    devRouteur: SPIN_ACTIF.devRouteur ? {", "    devRouteur: false ? {"],
];
const motif = (de) => new RegExp(de.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\n/g, '\\r?\\n'), 'g');
const lancer = (env) => {
  for (const b of BANCS) {
    try { execFileSync(process.execPath, [path.join(ICI, b)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } }); }
    catch (_) { return false; }
  }
  return true;
};
let survivants = 0, introuvables = 0, temoin = false;
const copies = [];
try {
  temoin = lancer({});
  console.log((temoin ? 'ok  ' : 'KO  ') + 'witness: the four tests are green on the repo modules');
  if (temoin) for (const [fichier, nom, de, vers] of M) {
    const original = fs.readFileSync(path.join(ICI, fichier), 'utf8');
    const re = motif(de), k = (original.match(re) || []).length;
    if (k !== 1) { introuvables += 1; console.log('??  ' + nom + ' — anchor found ' + k + ' times (expected 1)'); continue; }
    const copie = path.join(ICI, '.mutant-' + fichier.replace(/\.js$/, '') + '-' + process.pid + '.js');
    copies.push(copie);
    fs.writeFileSync(copie, original.replace(new RegExp(re.source), () => vers));
    const env = { MUTANT_FICHIER: fichier, MUTANT_CHEMIN: copie, ...(fichier === 'skins-spin.js' ? { SKINS_SPIN_MODULE: copie } : {}) };
    if (lancer(env)) { survivants += 1; console.log('SURVIVES  ' + nom); } else console.log('killed ' + nom);
    fs.rmSync(copie, { force: true });
  }
} finally {
  for (const c of copies) fs.rmSync(c, { force: true });
}
if (!temoin) process.exit(1);
console.log('\n' + M.length + ' mutants, ' + survivants + ' survivor(s), ' + introuvables + ' anchor(s) not found');
process.exit(survivants || introuvables ? 1 : 0);
