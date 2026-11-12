/* muter-routeur-commun.mjs — shared runner for muter-blockskinsrouter.mjs and muter-blockslotsrouter.mjs.
 * Each mutant is applied to a COPY of the contract in a temporary folder (never the repo); the matching forge suites must turn red.
 * A mutant that does not compile is NOT counted as killed (it is reported apart), a green one is a guard the suites do not hold. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export function muter({ SRC, nom, source, sources, tests, suites, M }) {
  const base = process.env.MUT_DIR || os.tmpdir();
  fs.mkdirSync(base, { recursive: true });
  const ICI = fs.mkdtempSync(path.join(base, 'mut-' + nom + '-'));
  for (const d of ['src', 'test', 'test/payrouter']) fs.mkdirSync(path.join(ICI, d), { recursive: true });
  fs.cpSync(path.join(SRC, 'lib/forge-std'), path.join(ICI, 'lib/forge-std'), { recursive: true, filter: (f) => !/[\\/]\.git([\\/]|$)/.test(f) });
  fs.copyFileSync(path.join(SRC, 'foundry.toml'), path.join(ICI, 'foundry.toml'));
  for (const f of [...sources, ...tests]) fs.copyFileSync(path.join(SRC, f), path.join(ICI, f));
  const original = fs.readFileSync(path.join(SRC, source), 'utf8');
  if (original.includes('\r')) throw new Error('CR in ' + source);
  const FORGE = process.env.FORGE || (process.platform === 'win32' ? path.join(os.homedir(), '.foundry/bin/forge.exe') : 'forge');
  const lancer = () => {
    try {
      const o = execFileSync(FORGE, ['test', '--root', ICI, '--match-contract', suites], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 600_000 });
      return { vert: true, sortie: o };
    } catch (e) {
      return { vert: false, sortie: String(e.stdout || '') + String(e.stderr || ''), delai: e.signal === 'SIGTERM' };
    }
  };
  const ecrire = (t) => fs.writeFileSync(path.join(ICI, source), t);
  ecrire(original);
  const t0 = lancer();
  const nb = (t0.sortie.match(/(\d+) tests passed, (\d+) failed/) || []).slice(1).join(' passed / ') + ' failed';
  console.log('baseline (no mutant):', t0.vert ? 'GREEN' : 'RED', '-', nb);
  if (!t0.vert) { console.log(t0.sortie.slice(-3000)); process.exit(2); }
  let tues = 0, survivants = 0, nonCompiles = 0;
  for (const [titre, avant, apres] of M) {
    const n = original.split(avant).length - 1;
    if (n !== 1) { console.log('PATTERN NOT FOUND ONCE (' + n + '):', titre); nonCompiles++; continue; }
    ecrire(original.replace(avant, () => apres));
    const r = lancer();
    const compile = /Compiler run failed|Error \(\d+\)/.test(r.sortie);
    const echecs = (r.sortie.match(/(\d+) tests passed, (\d+) failed/) || [0, 0, '?'])[2];
    if (r.vert) { survivants++; console.log('SURVIVED  ', titre); }
    else if (compile) { nonCompiles++; console.log('NO COMPILE', titre); }
    else if (r.delai) { nonCompiles++; console.log('TIMEOUT   ', titre); }
    else { tues++; console.log('KILLED    ', titre, '(' + echecs + ' failing tests)'); }
  }
  ecrire(original);
  fs.rmSync(ICI, { recursive: true, force: true });
  console.log(`${nom}: ${M.length} mutants, ${tues} killed, ${survivants} survived, ${nonCompiles} not run (no compile / pattern / timeout)`);
  process.exit(survivants || nonCompiles ? 1 : 0);
}
