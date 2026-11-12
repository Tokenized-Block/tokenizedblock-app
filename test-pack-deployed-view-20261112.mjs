/* test-pack-deployed-view-20261112.mjs — the deploy page (deployer-economie-v2.html) showed "not signed" on the six steps that ARE on Base
 *   (Phil, 2026-11-12). pack-deployed-view.js judges the deployment record (economie-v2-pack-deploye.js, from the six receipts) against the
 *   frozen pack and reads the code at each address; the page shows each step as Deployed and no longer offers the six-step flow.
 * A  EXECUTED  deployedSteps on the real records: ok, six steps L P T S V R, every address = the CREATE address of the deployer at nonceN+k.
 *              Refused: another pack sha, another chain, five steps, two letters swapped, one address changed, a bad tx, a block missing.
 * B  EXECUTED  readStepCode on stub nodes: an empty code on EVERY node = "absent"; one empty + one failure = "not read" (never "absent");
 *              failures and malformed answers = "not read"; a failing first node falls back to the second; code that is not the pack = "differs".
 * C  EXECUTED  nodeReader on a stub fetch: POST JSON-RPC eth_getCode; HTTP 429, a JSON-RPC error and a missing result all throw.
 * D  EXECUTED  summary and the step html: "All six contracts are deployed." ONLY when the six codes match; "not read" never shows a zero;
 *              the step says Deployed with its address and tx shortened and linked to Basescan.
 * E  EXECUTED  the page's first module rendered in a stub DOM (no wallet): six steps Deployed, no "not signed", the six-step buttons hidden;
 *              nodes failing -> "not read" and no "all deployed"; nodes answering an empty code -> STOP. DEPLOYED_PAGE=<file> renders another
 *              page (RED on the page before the fix). DEPLOYED_VIEW=<file> loads another helper (mutants).
 * F  ON CHAIN  (both public Base nodes, eth_getCode only; HORS_LIGNE=1 skips it and says so) each node alone: six codes match the pack;
 *              a step judged against another step's frozen hash = "differs"; the deployer's CREATE address at nonceN+100 = "absent"; the page
 *              rendered on the real nodes says "All six contracts are deployed."
 * NE PROUVE PAS: what a real browser paints (checked separately); the payee-slot card (test-payee-slot-20261112.mjs). Counts itself, n/n. */
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PACK_ECONOMIE_V2 as D } from './economie-v2-pack-deploiement.js';
import { PACK_ECONOMIE_V2_DEPLOYE as REC } from './economie-v2-pack-deploye.js';
import { predire, PRODUIT } from './pack-economie-v2.js';

const ICI = dirname(fileURLToPath(import.meta.url));
const VIEW_FILE = process.env.DEPLOYED_VIEW ? resolve(process.env.DEPLOYED_VIEW) : join(ICI, 'pack-deployed-view.js');
const PAGE_FILE = process.env.DEPLOYED_PAGE ? resolve(process.env.DEPLOYED_PAGE) : join(ICI, 'deployer-economie-v2.html');
const V = await import(pathToFileURL(VIEW_FILE).href);
const HORS_LIGNE = process.env.HORS_LIGNE === '1';
const realFetch = globalThis.fetch;
let n = 0, ko = 0;
const t = (label, cond, x = '') => { n += 1; if (cond === true) console.log('  ok   ' + label); else { ko += 1; console.log('  KO   ' + label + (x ? ' · ' + x : '')); } };
const clone = (o) => JSON.parse(JSON.stringify(o));
const NOMS = REC.etapes.map((e) => PRODUIT[e.lettre]);
console.log('witness: helper ' + VIEW_FILE + ' exports ' + ['deployedSteps', 'readStepCode', 'nodeReader', 'summary', 'stepHtml'].filter((k) => typeof V[k] === 'function').length + '/5; page ' + PAGE_FILE);

console.log('A the record judged against the pack');
const J = V.deployedSteps(D, REC);
const pred = predire(D.deployeur, BigInt(REC.nonceN));
t('the real record holds: six steps, letters L P T S V R', J.ok === true && J.steps.map((s) => s.letter).join('') === 'LPTSVR', J.why);
t('every address = the record address = the CREATE address of the deployer at nonceN+k', J.ok && J.steps.every((s, k) => s.address === REC.etapes[k].adresse && s.address === pred[s.letter]));
t('tx and block copied from the record', J.ok && J.steps.every((s, k) => s.tx === REC.etapes[k].tx && s.block === REC.etapes[k].bloc));
const refuse = (m, f) => { const r = clone(REC); f(r); const j = V.deployedSteps(D, r); t('refused: ' + m, j.ok === false && j.steps.length === 0 && j.why.length > 0, j.why); };
refuse('another pack sha256', (r) => { r.sha256Pack = r.sha256Pack.replace(/^./, (c) => (c === '0' ? '1' : '0')); });
refuse('another chain', (r) => { r.chaine = 1; });
refuse('five steps', (r) => { r.etapes.pop(); });
refuse('two letters swapped', (r) => { [r.etapes[0], r.etapes[1]] = [r.etapes[1], r.etapes[0]]; });
refuse('one address changed by one digit', (r) => { const a = r.etapes[3].adresse; r.etapes[3].adresse = a.slice(0, -1) + (a.slice(-1) === '0' ? '1' : '0'); });
refuse('another start nonce', (r) => { r.nonceN += 1; });
refuse('a bad tx hash', (r) => { r.etapes[2].tx = r.etapes[2].tx.slice(0, 40); });
refuse('a block missing', (r) => { delete r.etapes[5].bloc; });
t('refused: no record at all', V.deployedSteps(D, null).ok === false);

console.log('B the code reader, on stub nodes');
const S0 = J.steps[0];
const node = (answer) => async () => { if (answer instanceof Error) throw answer; return answer; };
const boom = new Error('429 Too Many Requests');
t('every node answers an empty code -> absent', (await V.readStepCode(D, S0, [node('0x'), node('0x')])).state === 'absent');
t('one empty + one failure -> not read (never absent)', (await V.readStepCode(D, S0, [node('0x'), node(boom)])).state === 'not read');
t('one failure + one empty -> not read (never absent)', (await V.readStepCode(D, S0, [node(boom), node('0x')])).state === 'not read');
t('both fail -> not read, with the reason', (await V.readStepCode(D, S0, [node(boom), node(boom)])).state === 'not read' && /429/.test((await V.readStepCode(D, S0, [node(boom), node(boom)])).why));
t('malformed answers -> not read', (await V.readStepCode(D, S0, [node('0x6'), node(null)])).state === 'not read' && (await V.readStepCode(D, S0, [node({ x: 1 })])).state === 'not read');
t('no node -> not read', (await V.readStepCode(D, S0, [])).state === 'not read');
{ const r = await V.readStepCode(D, S0, [node(boom), node('0x6001')]); t('a failing first node falls back to the second; code that is not the pack -> differs (2 bytes)', r.state === 'differs' && r.bytes === 2, JSON.stringify(r)); }
{ const vus = []; await V.readStepCode(D, S0, [async (m, p) => { vus.push([m, p]); return '0x'; }]); t('the read is eth_getCode at the step address, latest', vus.length === 1 && vus[0][0] === 'eth_getCode' && vus[0][1][0] === S0.address && vus[0][1][1] === 'latest'); }

console.log('C the node reader, on a stub fetch');
{
  let vu = null;
  const f = (status, body) => async (url, o) => { vu = { url, o }; return { ok: status === 200, status, json: async () => body }; };
  const r = await V.nodeReader('https://node.example', f(200, { jsonrpc: '2.0', id: 1, result: '0x60' }))('eth_getCode', [S0.address, 'latest']);
  const b = JSON.parse(vu.o.body);
  t('POST JSON-RPC eth_getCode, result returned', r === '0x60' && vu.o.method === 'POST' && b.method === 'eth_getCode' && b.params[0] === S0.address);
  const jette = async (g) => { try { await g('eth_getCode', []); return false; } catch (_) { return true; } };
  t('HTTP 429 throws', await jette(V.nodeReader('u', f(429, {}))));
  t('a JSON-RPC error throws', await jette(V.nodeReader('u', f(200, { error: { message: 'rate limited' } }))));
  t('a missing result throws', await jette(V.nodeReader('u', f(200, { jsonrpc: '2.0', id: 1 }))));
  t('a network failure throws', await jette(V.nodeReader('u', async () => { throw new Error('offline'); })));
}

console.log('D summary and step html');
const M = (b) => ({ state: 'match', bytes: b });
const six = (c) => [0, 1, 2, 3, 4, 5].map(c);
t('six matches -> "All six contracts are deployed."', V.summary(six(() => M(100)), NOMS).all === true && V.summary(six(() => M(100)), NOMS).text === 'All six contracts are deployed.');
{ const s = V.summary(six((k) => (k === 4 ? { state: 'not read', why: 'x' } : M(100))), NOMS);
  t('one not read -> not all, says "not read" and names the product, never a zero', s.all === false && /not read/.test(s.text) && s.text.includes(NOMS[4]) && !/All six contracts are deployed\./.test(s.text) && !/\b0\b/.test(s.text), s.text); }
{ const s = V.summary(six((k) => (k === 1 ? { state: 'absent' } : M(100))), NOMS); t('one absent -> STOP', s.all === false && s.tone === 'ko' && /^STOP/.test(s.text) && s.text.includes(NOMS[1]), s.text); }
{ const s = V.summary(six((k) => (k === 2 ? { state: 'differs', bytes: 9 } : M(100))), NOMS); t('one differs -> STOP', s.all === false && s.tone === 'ko' && /^STOP/.test(s.text), s.text); }
t('still reading -> not all', V.summary(six((k) => (k === 0 ? null : M(1))), NOMS).all === false);
{
  const h = V.stepHtml(S0, M(6198));
  t('step html: Deployed, address and tx linked to Basescan in full, shortened on screen', h.includes('Deployed') && h.includes('href="https://basescan.org/address/' + S0.address + '"')
    && h.includes('href="https://basescan.org/tx/' + S0.tx + '"') && h.includes('>' + V.short(S0.address) + '<') && h.includes('>' + V.short(S0.tx) + '<') && V.short(S0.tx).length < 14 && h.includes('block ' + S0.block));
  t('step html: code matches with its real byte count', h.includes('matches the frozen record (6198 bytes)'));
  const nr = V.stepHtml(S0, { state: 'not read', why: 'x' });
  t('step html: a failed read says "not read", never a zero', nr.includes('code on chain: not read') && !/\b0 bytes/.test(nr) && !/>0</.test(nr));
  t('step html: no internal status word', !/not signed|not deployed|under review|fork test|\bwritten\b|prepared/i.test(h + nr + V.stepHtml(S0, null) + V.stepHtml(S0, { state: 'absent' })));
}

console.log('E the page rendered in a stub DOM (no wallet)');
const PAGE = readFileSync(PAGE_FILE, 'utf8').replace(/\r\n/g, '\n');
const SCRIPT0 = ([...PAGE.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)][0] || [])[1] || '';
t('witness: the page first module was read', SCRIPT0.includes("from './pack-economie-v2.js'"));
let tour = 0;
async function rendre(fetchFn) {
  const el = {};
  for (const id of ['rec', 'steps', 'connect', 'go', 'state', 'verif', 'lines']) el['#' + id] = { innerHTML: '', textContent: '', disabled: true, hidden: id === 'verif', onclick: null };
  globalThis.document = { querySelector: (s) => el[s] || null };
  globalThis.window = {};
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  globalThis.fetch = fetchFn;
  const dir = pathToFileURL(ICI + '/').href;
  const code = SCRIPT0.replace(/(from |import\()'\.\/([^']+)'/g, (m, a, f) => a + "'" + (f === 'pack-deployed-view.js' ? pathToFileURL(VIEW_FILE).href : dir + f) + "'");
  await import('data:text/javascript,' + encodeURIComponent(code + '\n// render ' + (tour += 1)));
  for (let i = 0; i < 600; i++) { if (!/reading…|Reading the code|Loading/.test(el['#steps'].innerHTML + el['#state'].innerHTML + el['#rec'].innerHTML)) break; await new Promise((o) => setTimeout(o, 50)); }
  return el;
}
const failing = async () => { throw new Error('offline (stub)'); };
const empty = async () => ({ ok: true, status: 200, json: async () => ({ jsonrpc: '2.0', id: 1, result: '0x' }) });
{
  const el = await rendre(failing);
  const st = el['#steps'].innerHTML;
  t('nodes failing: six steps Deployed, none "not signed"', (st.match(/>Deployed</g) || []).length === 6 && !st.includes('not signed'), (st.match(/<span class="st[^"]*">[^<]*/g) || []).slice(0, 3).join(' | '));
  t('nodes failing: each step names its address and tx from the record (Basescan links)', REC.etapes.every((e) => st.includes('basescan.org/address/' + e.adresse) && st.includes('basescan.org/tx/' + e.tx)));
  t('nodes failing: six "not read", no zero, no "all deployed"', (st.match(/code on chain: not read/g) || []).length === 6 && !/\b0 bytes/.test(st) && !el['#state'].innerHTML.includes('All six contracts are deployed.'), el['#state'].innerHTML);
  t('nodes failing: the six-step flow is not offered (connect and sign hidden and disabled)', el['#go'].hidden === true && el['#go'].disabled === true && el['#connect'].hidden === true && el['#connect'].disabled === true);
  t('the frozen record card still renders', el['#rec'].innerHTML.includes('Frozen record') && el['#rec'].innerHTML.includes('OK (sha256 of the six steps and the pack)'));
}
{
  const el = await rendre(empty);
  t('nodes answering an empty code: STOP, never "all deployed", flow not offered', /STOP/.test(el['#state'].innerHTML) && !el['#state'].innerHTML.includes('All six contracts are deployed.') && el['#go'].hidden === true, el['#state'].innerHTML);
}

console.log('F on chain (eth_getCode on both public Base nodes)');
if (HORS_LIGNE) console.log('  --   HORS_LIGNE=1: the on-chain checks are SKIPPED (not counted)');
else {
  for (const url of V.PUBLIC_NODES) {
    const r = [V.nodeReader(url, realFetch)];
    const c = [];
    for (const s of J.steps) c.push(await V.readStepCode(D, s, r));
    t(url + ': the six codes match the pack', c.every((x) => x.state === 'match') && c.every((x, k) => x.bytes === D.etapes[k].runtimeOctets), JSON.stringify(c.map((x) => x.state + ':' + (x.why || x.bytes))));
  }
  const both = V.PUBLIC_NODES.map((u) => V.nodeReader(u, realFetch));
  const autre = clone(D); autre.etapes[0].runtimeSha256Masque = D.etapes[1].runtimeSha256Masque;
  t('discriminates: step L judged against P\'s frozen hash -> differs', (await V.readStepCode(autre, S0, both)).state === 'differs');
  const vide = { k: 0, address: predire(D.deployeur, BigInt(REC.nonceN + 100)).L };
  t('discriminates: the deployer CREATE address at nonceN+100 has no code -> absent', (await V.readStepCode(D, vide, both)).state === 'absent');
  const el = await rendre(realFetch);
  t('page on the real nodes: "All six contracts are deployed." and six codes matching', el['#state'].innerHTML.includes('All six contracts are deployed.') && (el['#steps'].innerHTML.match(/matches the frozen record/g) || []).length === 6, el['#state'].innerHTML);
}

console.log(n - ko + '/' + n + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
