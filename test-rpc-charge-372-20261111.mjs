/* test-rpc-charge-372-20261111.mjs — game372 (RPC load): the three proofs of this change, run as children, each must be GREEN.
 *   Step 0  test-rpc-sante-parqui-20261111.mjs : every read counted per caller (parQui), par unchanged, the labels at the loop sites.
 *   Step A  test-journal-restore-20261111.mjs  : the game journal restored across a restart (real server, fake node, 4 runs, 3 mutants).
 *   Step B  test-tblock-hold-20261109.mjs      : the 10-min price search from the last answer (<= 4 timestamp reads, 1 mutant).
 * Each child carries its own mutants; this file only says which of them is red. RED on the code before game372 (no parQui, no restore,
 *   no hint), GREEN after.
 * NE PROUVE PAS : the per-minute saving in prod — read /sante.santeRpc.appelsLecteurs.parQui and /api/jeu/journal after the deploy.
 * PORTABLE: process.exitCode, never process.exit. */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const TESTS = ['test-rpc-sante-parqui-20261111.mjs', 'test-journal-restore-20261111.mjs', 'test-tblock-hold-20261109.mjs'];
let ko = 0;
for (const f of TESTS) {
  const r = spawnSync(process.execPath, [path.join(ICI, f)], { cwd: ICI, encoding: 'utf8', timeout: 900000, env: { ...process.env, NODE_OPTIONS: '' } });
  const lignes = String((r.stdout || '') + (r.stderr || '')).split(/\r?\n/).filter((l) => l.trim());
  const vert = r.status === 0;
  if (!vert) ko++;
  console.log((vert ? 'GREEN ' : 'RED   ') + f + ' (exit ' + r.status + ') :: ' + (lignes.filter((l) => /assertions|GREEN|RED/.test(l)).pop() || lignes.pop() || ''));
  if (!vert) for (const l of lignes.filter((x) => /^(RED|KO)/.test(x)).slice(0, 8)) console.log('      ' + l.slice(0, 220));
}
console.log(ko === 0 ? 'GREEN 3/3' : 'RED ' + (TESTS.length - ko) + '/3');
process.exitCode = ko ? 1 : 0;
