/* test-admin-claims-377-20261112.mjs — the public texts say what the chain says about a block's admin and its supply.
 * Read on Base on 2026-11-12 (emission-b20.js verifierEmission + hasRole, base-rpc.publicnode.com): all 17 blocks born through
 *   TokenizedBlock (12 router createPaid, 2 earlier router, 3 minted to the fee wallet) still have DEFAULT_ADMIN_ROLE held — the creator's
 *   wallet, or the fee wallet for 0xb2…ae3f and 0xb2…a042 — including the newest app birth (0xb2…3f2f, block 55743933). The app passes the
 *   creating wallet as `admin` (app.html calldataCreation, naissance-api.js), and the precompile refuses to let the last admin leave
 *   (renounceRole / revokeRole revert LastAdminCannotRenounce() 0x361513e7, eth_call from the holder).
 * The README said "No administrator, no minter … at any point" and "no further unit can ever exist"; the mini-app manifest, DEPLOY.md, the
 *   tokenize card and the vitality words said the same. This test keeps them true, and ties the README's sentence to the birth code: if the
 *   app ever passes admin = address(0), C3 goes red and the README must be rewritten from a new chain read.
 * ROOT (env) points at another tree for the red proof. Usage: node test-admin-claims-377-20261112.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = process.env.ROOT || path.dirname(fileURLToPath(import.meta.url));
let ok = 0, ko = 0;
const t = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('FAIL ' + nom + (detail ? ' — ' + String(detail).slice(0, 160) : '')); } };
const lire = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (_) { return ''; } };
const FAUX = /no administrator, no minter|no admin, no minter|no further unit can ever exist|supply is final at birth|adminless tokens|no minter ever|nobody can ever mint more|nobody can ever make more|nothing can ever be minted again/i;
const JARGON = /not deployed|under review|fork test|\bv2\b|\bV8\b/;

/* C1-C2: README */
const R = lire('README.md');
t('C0 README read', R.length > 2000);
const quoi = (R.match(/## What a block is[\s\S]*?\n## /) || [''])[0];
t('C1 README no longer says "no administrator / no minter / final at birth"', quoi.length > 100 && !FAUX.test(quoi), (quoi.match(FAUX) || [])[0]);
t('C2a README says the creating wallet is the admin', /Every block born through this app has an administrator: its creator's wallet/.test(quoi));
t('C2b README says the last admin cannot leave (measured revert)', /LastAdminCannotRenounce\(\)/.test(quoi));
t('C2c README says the admin can raise the cap and grant MINT_ROLE', /raise the cap/.test(quoi) && /grant itself `MINT_ROLE`/.test(quoi));
const lignes = [...quoi.matchAll(/^\| `(0xb2[0-9a-f]{38})`[^|]*\| (\d+) \| `(0x[0-9a-f]{40})`/gm)].map((m) => ({ bloc: m[1], ne: Number(m[2]), admin: m[3] }));
t('C2d the table lists 17 blocks, each once, with an admin address', lignes.length === 17 && new Set(lignes.map((l) => l.bloc)).size === 17, lignes.length);
const FEE = '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4';
t('C2e the fee wallet holds the admin of exactly 0xb2…ae3f and 0xb2…a042', lignes.filter((l) => l.admin === FEE).map((l) => l.bloc).sort().join(',')
  === ['0xb200000000000000000000ab549fa65ad4edae3f', '0xb200000000000000000000e63ffc3f40bf92a042'].join(','));
t('C2f TTB: admin 0xaf8e…e2a6 (its creator)', lignes.some((l) => l.bloc === '0xb20000000000000000000003d296be435ae4bbe3' && l.admin === '0xaf8e0a44496a6b90da03fbadd9daec875fc3e2a6'));
t('C2g the table is in birth order', lignes.every((l, i) => i === 0 || lignes[i - 1].ne <= l.ne));
/* every router-born block of the repo's own seed is in the table (index-routeur.js GRAINE_ROUTEUR + GRAINE_ANCIENS_ROUTEURS) */
let IR = null;
try { IR = await import(pathToFileURL(path.join(ROOT, 'index-routeur.js')).href); } catch (e) { t('C2h index-routeur.js loads', false, e.message); }
if (IR) {
  const seed = [...IR.GRAINE_ROUTEUR, ...IR.GRAINE_ANCIENS_ROUTEURS].map((g) => String(g.jeton).toLowerCase());
  const manque = seed.filter((j) => !lignes.some((l) => l.bloc === j));
  t('C2h every router seed block is in the table', manque.length === 0, manque.join(' '));
  const ne = Object.fromEntries([...IR.GRAINE_ROUTEUR, ...IR.GRAINE_ANCIENS_ROUTEURS].map((g) => [String(g.jeton).toLowerCase(), g.bloc]));
  const fauxBloc = lignes.filter((l) => ne[l.bloc] !== undefined && ne[l.bloc] !== l.ne);
  t('C2i the table\'s birth blocks equal the seed\'s', fauxBloc.length === 0, fauxBloc.map((l) => l.bloc).join(' '));
}

/* C3: the README sentence is tied to the birth code */
const A = lire('app.html');
const calldata = (A.match(/function calldataCreation\(v\) \{[\s\S]*?\n\}/) || [''])[0];
t('C3a app.html calldataCreation passes the creating wallet as admin (the README says so)', /paramsAsset\(\{ nom: v\.nom, symbole: v\.sym, admin: compte, decimales: DECIMALES_FIXES \}\)/.test(calldata));
t('C3b naissance-api.js passes the creating wallet as admin (the README says so)', /paramsAsset\(\{ nom, symbole, admin: compte, decimales: DECIMALES_FIXES \}\)/.test(lire('naissance-api.js')));

/* C4-C7: the other public texts */
const D = lire('DEPLOY.md');
t('C4 DEPLOY.md no longer says "adminless tokens … no minter ever"', D.length > 1000 && !FAUX.test(D), (D.match(FAUX) || [])[0]);
const F = lire('.well-known/farcaster.json');
let FJ = null; try { FJ = JSON.parse(F); } catch (_) { /* below */ }
t('C5a farcaster.json is valid JSON', FJ !== null);
t('C5b farcaster.json says no "no admin, no minter"', F.length > 100 && !FAUX.test(F), (F.match(FAUX) || [])[0]);
t('C5c farcaster.json descriptions carry no jargon', FJ && !JARGON.test(FJ.miniapp.description + FJ.miniapp.ogDescription));
const li = (A.match(/<li><b>The supply is[^\n]*<\/li>/) || [''])[0];
t('C6a the tokenize card no longer says "The supply is fixed"', A.length > 1e5 && !/<b>The supply is fixed<\/b>/.test(A));
t('C6b the tokenize card says an admin can raise the cap', /your wallet becomes the block's admin: only an admin can raise the cap later\./.test(li), li);
t('C6c that line carries no jargon', li && !JARGON.test(li));
t('C7a motssimples.js: no "Nobody can ever make more"', !FAUX.test(lire('motssimples.js')) && lire('motssimples.js').length > 100);
t('C7b vitalite.js: no "nothing can ever be minted again"', !FAUX.test(lire('vitalite.js')) && lire('vitalite.js').length > 100);

console.log('admin claims (377): ' + ok + ' OK, ' + ko + ' FAIL');
process.exit(ko ? 1 : 0);
