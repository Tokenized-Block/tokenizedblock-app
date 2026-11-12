/* test-tip-live-vault-377-20261112.mjs — task 377 (Phil 2026-11-12 "fix les petits restes"): the TBLOCK part of a birth goes to the LIVE
 *   holders vault (step V of economie-v2-pack-deploye.js, through economie-pack.js VAULT), no longer to the first holders vault.
 *
 * WHY: after the switch to the live economy (game376) the app still built TBLOCK.transfer(FIRST vault, amount) for step 3 of a birth
 *   (create-vault-tip.js imported VAULT from economie.js), the ETH path /api/tblock/vault-buy sent to the same first vault, and
 *   /api/naissance/etat only looked for a payment to that first vault.
 *
 * A  EXECUTED  create-vault-tip.js: TIP.VAULT is the record's V (not the first vault); plan() builds TBLOCK.transfer(V, amount), 0 ETH.
 * B  SOURCE    create-vault-tip.js imports VAULT from economie-pack.js and types no address.
 * C  EXECUTED  serveur-web.js /api/naissance/etat: the paid check, cut from the served source and run on a stub reader: the live vault is
 *              read FIRST; the first vault is read only after a whole "not paid" there; an unread answer stops (never "unpaid").
 * D  SOURCE    serveur-web.js /api/tblock/vault-buy pays EP_PACK.VAULT, never a request parameter.
 * E  SOURCE    the live vault's source (sha256 = the frozen pack's V) counts a plain TBLOCK transfer as free TBLOCK:
 *              free() = TBLOCK.balanceOf(this) - reserved; closeEpoch budgets free() x REWARD_BPS; reserved moves only by
 *              closeEpoch / claim / release; no receive hook to pass, no deposit function to call.
 * F  SOURCE    the fees page describes the birth TBLOCK as going to "the holders vault" (the live one on that page), not the first one.
 * H  ON CHAIN  (eth_call only, both nodes; HORS_LIGNE=1 skips and says so) V.TBLOCK() == TBLOCK; TBLOCK.transfer(V, 1 TBLOCK) from a
 *              holder returns true; V.free() == TBLOCK.balanceOf(V) - V.reserved().
 * M  MUTANTS   (in temp copies) VAULT imported back from economie.js -> A red; the paid check reads the first vault first -> C red;
 *              the paid check goes on after an unread answer -> C red.
 * Pre-fix proof: TIP_SRC=<old create-vault-tip.js> SRV_SRC=<old serveur-web.js> node this-file -> RED.
 * The test counts itself and prints n/n. */
import { readFileSync, writeFileSync, mkdtempSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => { try { return readFileSync(p, 'utf8'); } catch (_) { return ''; } };
const TIP_SRC = process.env.TIP_SRC || join(HERE, 'create-vault-tip.js');
const SRV_SRC = process.env.SRV_SRC || join(HERE, 'serveur-web.js');
let n = 0, red = 0;
const t = (label, cond, extra = '') => { n += 1; if (cond === true) console.log('  ok   ' + label); else { red += 1; console.log('  KO   ' + label + (extra ? ' — ' + extra : '')); } };

const { ADRESSES_PACK_ECONOMIE_V2: A } = await import(pathToFileURL(join(HERE, 'economie-v2-pack-deploye.js')).href);
const { PACK_ECONOMIE_V2: PACK } = await import(pathToFileURL(join(HERE, 'economie-v2-pack-deploiement.js')).href);
const { ECONOMIE_DEPLOIEMENT: D } = await import(pathToFileURL(join(HERE, 'economie-deploiement.js')).href);
const { TBLOCK } = await import(pathToFileURL(join(HERE, 'economie.js')).href);
const LIVE = A.V, FIRST = String(D.adresseVault || '').toLowerCase();
const pad = (a) => a.slice(2).padStart(64, '0');

/* load a copy of the module text with its relative imports pinned to this tree (so a mutant or an old copy runs against today's deps) */
const tmp = mkdtempSync(join(tmpdir(), 't377-'));
let k = 0;
async function loadTip(src) {
  const p = join(tmp, 'tip-' + (k++) + '.mjs');
  writeFileSync(p, src.replace(/from '\.\/([^']+)'/g, (_, f) => "from '" + pathToFileURL(join(HERE, f)).href + "'"));
  try { return await import(pathToFileURL(p).href); } finally { try { unlinkSync(p); } catch (_) { /* temp */ } }
}

/* A — the module, executed */
function clauseA(TIP) {
  const out = [];
  out.push(['A TIP.VAULT is the live holders vault of the record (step V), not the first vault', !!TIP && TIP.VAULT === LIVE && TIP.VAULT !== FIRST, String(TIP && TIP.VAULT)]);
  let p = null; try { p = TIP.plan({ ethUsd: 3000, tblockUsd: 0.000005, balance: 10n ** 30n }); } catch (e) { p = { ok: false, why: String(e.message) }; }
  const want = '0xa9059cbb' + pad(LIVE) + (400000n * 10n ** 18n).toString(16).padStart(64, '0');
  out.push(['A plan() = TBLOCK.transfer(live vault, 400,000 TBLOCK) at ETH $3,000 / TBLOCK $0.000005, 0 ETH', !!p && p.ok === true && p.call.to === TBLOCK && p.call.data === want && p.call.value === '0x0', p && p.call ? p.call.data.slice(0, 80) : JSON.stringify(p && p.why)]);
  out.push(['A the call does not name the first vault', !!p && p.ok === true && !p.call.data.includes(FIRST.slice(2))]);
  return out;
}
const tipText = read(TIP_SRC);
let TIP = null; try { TIP = await loadTip(tipText); } catch (e) { console.log('  (create-vault-tip.js not importable: ' + String(e.message).slice(0, 80) + ')'); }
console.log('— A. create-vault-tip.js, executed');
for (const [l, c, x] of clauseA(TIP)) t(l, c, x);

console.log('— B. create-vault-tip.js, source');
t('B VAULT comes from economie-pack.js (the deployment record), not from economie.js', /^import \{ VAULT \} from '\.\/economie-pack\.js';$/m.test(tipText) && !/import \{[^}]*\bVAULT\b[^}]*\} from '\.\/economie\.js'/.test(tipText));
const wt = (tipText.match(/export const WTCOIN = '(0x[0-9a-f]{40})'/) || [])[1];
t('B the module types no address except its own WTCOIN constant (the vault is never typed)', !!wt && (tipText.match(/0x[0-9a-fA-F]{40}/g) || []).every((h) => h.toLowerCase() === wt));

/* C — the paid check, cut out of the server source and executed on a stub reader */
const srv = read(SRV_SRC);
const cut = (s) => { const i = s.indexOf('const coffres = [EP_PACK.VAULT'), m = i < 0 ? null : /break; \}\r?\n/.exec(s.slice(i)), j = m ? i + m.index : -1; /* CRLF-safe end anchor (test-tests-portables) */ return i < 0 || j < 0 ? '' : s.slice(i, j + 'break; }'.length); };
async function runPaid(snippet, answers) {
  const seen = [];
  const lire = async ({ coffre }) => { seen.push(coffre); return answers[coffre] || { etat: 'NON_MESURE', pourquoi: 'stub: no answer' }; };
  const f = new Function('EP_PACK', 'ECONOMIE_DEPLOIEMENT', 'lireCoffrePaye', 'rpcE', 'compteE', 'blocE', 'TBLOCK_ADR', 'return (async () => { ' + snippet + '\n return cp; })();');
  const cp = await f({ VAULT: LIVE }, { adresseVault: D.adresseVault }, lire, null, '0x' + '1'.repeat(40), '0x' + '2'.repeat(40), TBLOCK);
  return { cp, seen };
}
async function clauseC(snippet) {
  const out = [];
  if (!snippet) return [['C the paid check of /api/naissance/etat reads the live vault (snippet found)', false, 'no "const coffres = [EP_PACK.VAULT" loop in the source']];
  const paid = { etat: 'LU', paye: true, hash: '0xab', bloc: 1, montant: '5' }, unpaid = { etat: 'LU', paye: false, depuis: 9 }, unread = { etat: 'NON_MESURE', pourquoi: 'node down' };
  let r = await runPaid(snippet, { [LIVE]: paid, [FIRST]: unpaid });
  out.push(['C paid to the live vault: read the live vault only, answer paid', r.seen.length === 1 && r.seen[0] === LIVE && r.cp.paye === true, r.seen.join(',')]);
  r = await runPaid(snippet, { [LIVE]: unpaid, [FIRST]: paid });
  out.push(['C not paid there, paid to the first vault (a birth before the switch): both read, live first, answer paid', r.seen.length === 2 && r.seen[0] === LIVE && r.seen[1] === FIRST && r.cp.paye === true, r.seen.join(',')]);
  r = await runPaid(snippet, { [LIVE]: unpaid, [FIRST]: unpaid });
  out.push(['C paid to neither: answer LU not paid', r.cp.etat === 'LU' && r.cp.paye === false]);
  r = await runPaid(snippet, { [LIVE]: unread, [FIRST]: unpaid });
  out.push(['C the live vault unread: stop at NON_MESURE, never "not paid"', r.seen.length === 1 && r.cp.etat === 'NON_MESURE', r.seen.join(',') + ' ' + r.cp.etat]);
  return out;
}
console.log('— C. /api/naissance/etat paid check, executed from the source');
for (const [l, c, x] of await clauseC(cut(srv))) t(l, c, x);

console.log('— D. /api/tblock/vault-buy');
t('D the ETH path pays the live vault (EP_PACK.VAULT), never a request parameter', /const coffreV = EP_PACK\.VAULT;/.test(srv) && !/const coffreV = ECONOMIE_DEPLOIEMENT\.adresseVault/.test(srv) && !/q\.get\('coffre'\)|q\.get\('vault'\)/.test(srv));
t('D the server imports economie-pack.js as EP_PACK', /^import \* as EP_PACK from '\.\/economie-pack\.js';/m.test(srv));

console.log('— E. the live vault counts a plain TBLOCK transfer');
const vsol = read(join(HERE, 'contracts', 'src', 'TBlockVaultV2.sol'));
const stepV = PACK.etapes.find((e) => e.lettre === 'V');
t('E the source read is the deployed one (sha256 = the frozen pack step V)', !!stepV && stepV.source === 'contracts/src/TBlockVaultV2.sol' && createHash('sha256').update(vsol).digest('hex') === stepV.sha256Source);
t('E free() = TBLOCK.balanceOf(vault) - reserved', /function balance\(\) public view returns \(uint256\) \{ return _bal\(address\(this\)\); \}/.test(vsol)
  && /function free\(\) public view returns \(uint256\) \{ uint256 b = balance\(\); return b > reserved \? b - reserved : 0; \}/.test(vsol)
  && /TBLOCK\.staticcall\(abi\.encodeWithSelector\(0x70a08231, a\)\)/.test(vsol));
t('E closeEpoch budgets a share of free()', /budget = free\(\) \* REWARD_BPS \/ BPS;/.test(vsol));
const writes = vsol.match(/reserved\s*[-+]?=/g) || [];
t('E reserved moves only in closeEpoch (+budget), claim (-paid), release (-back)', writes.length === 3 && /reserved \+= budget;/.test(vsol) && /reserved -= paid;/.test(vsol) && /reserved -= back;/.test(vsol), writes.join(' '));
t('E no receive/fallback/deposit to call: a transfer needs nothing from the vault', !/\breceive\(\)|\bfallback\(\)|function deposit/.test(vsol));

console.log('— F. the fees page');
const fr = read(join(HERE, 'frais-risques.js'));
const birth = fr.slice(fr.indexOf("ligne('Bring a block to life'"), fr.indexOf("ligne('GM (send tokens to a friend)'"));
t('F the birth line sends the TBLOCK to "the holders vault", never "the first holders vault"', birth.length > 100 && /the rest in TBLOCK for the holders vault/.test(birth) && /sends that TBLOCK to the holders vault/.test(birth) && !/first holders vault/.test(birth));

console.log('— H. on chain (eth_call only, two nodes)');
if (process.env.HORS_LIGNE === '1') console.log('  SKIPPED: HORS_LIGNE=1 — nothing below was read on chain');
else {
  const sel = {}; /* every selector computed by keccak.js, none typed */
  const { selecteur } = await import(pathToFileURL(join(HERE, 'keccak.js')).href);
  for (const [k2, sig] of [['TBLOCK', 'TBLOCK()'], ['free', 'free()'], ['reserved', 'reserved()'], ['balanceOf', 'balanceOf(address)'], ['transfer', 'transfer(address,uint256)']]) sel[k2] = selecteur(sig);
  for (const url of ['https://mainnet.base.org', 'https://base-rpc.publicnode.com']) {
    const host = new URL(url).host;
    const call = async (to, data, from) => { const j = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ ...(from ? { from } : {}), to, data }, 'latest'] }), signal: AbortSignal.timeout(15000) }).then((x) => x.json()); if (j.error) throw new Error(j.error.message); return j.result; };
    try {
      t('H ' + host + ' V.TBLOCK() is our TBLOCK', '0x' + (await call(LIVE, sel.TBLOCK)).slice(-40) === TBLOCK);
      t('H ' + host + ' TBLOCK.transfer(V, 1 TBLOCK) from a holder (the first vault) returns true', BigInt(await call(TBLOCK, sel.transfer + pad(LIVE) + (10n ** 18n).toString(16).padStart(64, '0'), FIRST)) === 1n);
      let same = false, last = '';
      for (let i = 0; i < 3 && !same; i++) {
        const [f, r, b] = await Promise.all([call(LIVE, sel.free), call(LIVE, sel.reserved), call(TBLOCK, sel.balanceOf + pad(LIVE))]).then((xs) => xs.map(BigInt));
        same = f === (b > r ? b - r : 0n); last = 'free ' + f + ' reserved ' + r + ' balance ' + b;
      }
      t('H ' + host + ' V.free() == TBLOCK.balanceOf(V) - V.reserved() (' + last + ')', same);
    } catch (e) { t('H ' + host + ' answered', false, String(e.message).slice(0, 100)); }
  }
}

console.log('— M. mutants');
if (tipText.includes("import { VAULT } from './economie-pack.js';")) {
  const M1 = await loadTip(tipText.replace("import { VAULT } from './economie-pack.js';", "import { VAULT } from './economie.js';"));
  t('M VAULT imported back from economie.js (the first vault) -> A red', clauseA(M1).some(([, c]) => c !== true));
} else t('M VAULT mutant applies', false, 'anchor absent');
const snip = cut(srv);
const m2 = snip.replace('[EP_PACK.VAULT, ECONOMIE_DEPLOIEMENT.adresseVault]', '[ECONOMIE_DEPLOIEMENT.adresseVault, EP_PACK.VAULT]');
t('M the paid check reads the first vault first -> C red', !!snip && m2 !== snip && (await clauseC(m2)).some(([, c]) => c !== true));
const m3 = snip.replace("if (cp.etat !== 'LU' || cp.paye === true) break;", 'if (cp.paye === true) break;');
t('M the paid check goes on after an unread answer -> C red', !!snip && m3 !== snip && (await clauseC(m3)).some(([, c]) => c !== true));

console.log((n - red) + '/' + n + (red ? ' — RED' : ' — green'));
process.exit(red ? 1 : 0);
