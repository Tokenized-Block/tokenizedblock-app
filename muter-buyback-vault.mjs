/* muter-buyback-vault.mjs -- each mutant below breaks ONE guard of the buyback-vault work; test-buyback-vault-20261112.mjs must go RED on
 *   every one, by a failed CHECK ("KO ..." printed, exit 1), never by a crash (a missing module or a syntax error kills nothing).
 *   Each file is mutated in place with an exact, unique string replacement (LF kept: read and written as utf8 by node fs), the test is
 *   run, and the file is restored; its sha256 is checked back to the original before the next mutant. Usage: node muter-buyback-vault.mjs */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const TEST = 'test-buyback-vault-20261112.mjs';
const M = [
  ['buyback-vault.js', "if (a && c.slice(-a.length) !== a)", "if (false && a && c.slice(-a.length) !== a)", 'constructor words not checked'],
  ['buyback-vault.js', "if (!rec.parametres || rec.parametres.dest !== MARQUE_V) throw", "if (false) throw", 'dest marker not checked'],
  ['buyback-vault.js', "if (m.split('@v').length !== 2) throw", "if (false) throw", 'template marker count not checked'],
  ['buyback-vault.js', "if (w !== adresse(rec.deployeur)) return non('connected wallet '", "if (false) return non('connected wallet '", 'any wallet may deploy'],
  ['buyback-vault.js', "if (ko.length) return non('the simulation does not give the frozen build: '", "if (false) return non('the simulation does not give the frozen build: '", 'simulated code not compared'],
  ['buyback-vault.js', "if (solde < 2n * cout)", "if (solde < 0n * cout)", 'balance not checked'],
  ['buyback-vault.js', "if (tx.to) ko.push('not a contract creation", "if (false) ko.push('not a contract creation", 'a call taken for a creation'],
  ['buyback-vault.js', "if (bas(tx.input || tx.data) !== resoudre(rec).creation) ko.push", "if (false) ko.push", 'signed data not compared'],
  ['buyback-vault.js', "const keeper = opts.keeper ? adresse(opts.keeper) : adresse(p.keeper);", "const keeper = adresse(p.keeper);", 'expected keeper ignored'],
  ['buyback-vault.js', "export const PORTE = Object.freeze({ delaiS: 604800,", "export const PORTE = Object.freeze({ delaiS: 259200,", 'door said 72 hours'],
  ['buyback-vault.js', " until then the second dev wallet can cancel it.", "", 'door sentence without the veto'],
  ['buyback-keeper.js', "if (!l.armed) return { appeler: false, pourquoi: 'not armed: only its keeper may call' };", "", 'public call while disarmed'],
  ['buyback-keeper.js', "if (!d.startsWith(SEL_BUYBACK) || d.length !== 10 + 64)", "if (d.length !== 10 + 64)", 'any function sent'],
  ['buyback-keeper.js', "for (const s of m) if (SEL_GARDES[s]) return SEL_GARDES[s];", "", 'guard selectors not read'],
  ['buyback-keeper.js', "if (moi !== adr(rec.parametres && rec.parametres.keeper)) return off(", "if (false) return off(", 'any key runs the keeper'],
  ['buyback-keeper.js', "const montant = l.solde < l.maxPerCall ? l.solde : l.maxPerCall;", "const montant = l.solde;", 'amount not capped'],
  ['buyback-keeper.js', "if (BigInt(tx.value || 0) !== 0n) throw", "if (false) throw", 'value not checked'],
  ['contracts/noter-deploiement-buyback-vault.mjs', "verdicts.length < 2 ||", "verdicts.length < 1 ||", 'one node is enough'],
  ['contracts/noter-deploiement-buyback-vault.mjs', "if (verdicts.some((v) => bas(v.adresse) !== a)) return non(", "if (false) return non(", 'verifier address not compared'],
  ['contracts/noter-deploiement-buyback-vault.mjs', "if (bas(rec.adresse) === a && bas(rec.tx) === h && rec.bloc === bloc) return", "return", 'an already noted record is overwritten'],
  ['frais-risques.js', "    + (C.buybackVault ? buybackVaultLi(C.buybackVault, mb, nbRachats) :", "    + (false ? buybackVaultLi(C.buybackVault, mb, nbRachats) :", 'fees bullet never switches'],
  ['frais-risques.js', "  buybackVault: deploye(BUYBACK_VAULT_DEPLOIEMENT.adresse) ? {", "  buybackVault: true ? {", 'fees bullet switches without an address'],
  ['frais-risques.js', ", not to the holders vault' : null)", "' : null)", 'earlier TBLOCK said to reach the holders vault'],
  ['deployer-tblock-buyback-vault.html', "  if (!p.pret) return;\n  $('#go').disabled = true;\n  let h;", "  $('#go').disabled = true;\n  let h;", 'page sends without a ready plan'],
  ['deployer-tblock-buyback-vault.html', "B.controleEnvoi(D, acct, tx, recu)", "[]", 'page skips the receipt checks'],
  ['serveur-web.js', "creerKeeperBuyback({ cle: process.env.BUYBACK_KEEPER_KEY || null,", "creerKeeperBuyback({ cle: process.env.SLOTS_KEEPER_KEY || null,", 'keeper on another key'],
  ['serveur-web.js', "'deployer-tblock-buyback-vault.html', 'tblock-buyback-vault-deploiement.js', 'buyback-vault.js',", "'deployer-tblock-buyback-vault.html', 'tblock-buyback-vault-deploiement.js',", 'page module not served'],
  ['contracts/preparer-deploiement-buyback-vault.mjs', "pret: ${process.env.PRET === '0' ? 'false' : 'true'},", "pret: ${process.env.PRET === '0' ? 'true' : 'false'},", 'preparer writes pret false'],
];
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
let tues = 0, survivants = 0, invalides = 0;
for (const [f, de, vers, nom] of M) {
  const p = path.join(ICI, f);
  const orig = fs.readFileSync(p);
  const s = orig.toString('utf8');
  const n = s.split(de).length - 1;
  if (n !== 1) { invalides++; console.log('INVALID (' + n + ' matches)', f, nom); continue; }
  fs.writeFileSync(p, s.replace(de, () => vers));
  let r;
  try { r = spawnSync(process.execPath, [path.join(ICI, TEST)], { cwd: ICI, encoding: 'utf8', timeout: 240000 }); }
  finally { fs.writeFileSync(p, orig); }
  if (sha(fs.readFileSync(p)) !== sha(orig)) { console.log('RESTORE FAILED', f); process.exit(3); }
  const sortie = (r.stdout || '') + (r.stderr || '');
  const kos = sortie.split('\n').filter((l) => l.startsWith('KO '));
  const crash = /SyntaxError|Cannot find module|ERR_MODULE_NOT_FOUND|TypeError|ReferenceError/.test(r.stderr || '');
  if (r.status !== 0 && kos.length && !crash) { tues++; console.log('killed  ', nom, '·', kos.length, 'KO, first:', kos[0].slice(3, 110)); }
  else { survivants++; console.log('SURVIVED', nom, '· exit', r.status, crash ? '(crash, not a check)' : '', (r.stderr || '').slice(0, 160)); }
}
console.log(tues + ' killed, ' + survivants + ' survived, ' + invalides + ' invalid, of ' + M.length);
process.exitCode = survivants || invalides ? 1 : 0;
