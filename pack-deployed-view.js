/* pack-deployed-view.js — 2026-11-12: what deployer-economie-v2.html shows for the six steps once they are on Base (Phil saw "not signed"
 *   on six contracts that ARE deployed). Inputs: the frozen pack (economie-v2-pack-deploiement.js) and the deployment record
 *   (economie-v2-pack-deploye.js, generated from the six receipts). No address is typed here: every one comes from the record, and each
 *   must equal the CREATE address of the pack deployer at nonce nonceN + k (predire, pack-economie-v2.js) or the record is refused.
 * The only chain read is eth_getCode, through the readers the caller gives (the page: the two public Base nodes, no wallet). The code is
 *   judged against the pack: immutable slots zeroed, sha256 equal to the frozen runtimeSha256Masque.
 * A read that fails is "not read", never a zero and never "no code": "no code" needs EVERY node to answer an empty code.
 * Nothing here signs or sends. */
import { predire, codeMasque, sha256Hex } from './pack-economie-v2.js';
/* every shortened address on screen goes through displayShort (a fee address shows its name); guard: test-no-fee-address-shown-20261026.mjs */
import { displayShort } from './frais-creation.js';

export const PUBLIC_NODES = Object.freeze(['https://mainnet.base.org', 'https://base-rpc.publicnode.com']);
const ADR = /^0x[0-9a-f]{40}$/;
const TX = /^0x[0-9a-f]{64}$/;
const HEX_CODE = /^0x(?:[0-9a-fA-F]{2})*$/;

const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 0x1234…abcd (the full value stays in the link), through displayShort */
export function short(h) { const s = String(h ?? ''); return s.length > 14 ? displayShort(s) : s; }

/** deployedSteps(pack, record) -> { ok, why, steps: [{ k, letter, address, tx, block }] } — the record judged against the pack */
export function deployedSteps(pack, record) {
  const no = (why) => ({ ok: false, why, steps: [] });
  if (!pack || !Array.isArray(pack.etapes)) return no('no pack');
  if (!record || typeof record !== 'object') return no('no deployment record');
  if (record.chaine !== 8453) return no('the deployment record is not for Base (8453)');
  if (record.sha256Pack !== pack.sha256Pack) return no('the deployment record names another pack');
  const E = Array.isArray(record.etapes) ? record.etapes : [];
  if (E.length !== pack.etapes.length) return no('the deployment record lists ' + E.length + ' steps, the pack ' + pack.etapes.length);
  if (!Number.isSafeInteger(record.nonceN) || record.nonceN < 0) return no('the deployment record has no start nonce');
  let pred;
  try { pred = predire(pack.deployeur, BigInt(record.nonceN)); } catch (e) { return no('cannot predict the addresses: ' + (e.message || e)); }
  const steps = [];
  for (let k = 0; k < E.length; k++) {
    const e = E[k] || {};
    const letter = pack.etapes[k].lettre;
    const address = String(e.adresse || '').toLowerCase(), tx = String(e.tx || '').toLowerCase();
    if (e.lettre !== letter) return no('step ' + (k + 1) + ' is ' + e.lettre + ' in the deployment record, ' + letter + ' in the pack');
    if (!ADR.test(address)) return no('step ' + (k + 1) + ': no address in the deployment record');
    if (!TX.test(tx)) return no('step ' + (k + 1) + ': no transaction hash in the deployment record');
    if (!Number.isSafeInteger(e.bloc) || e.bloc <= 0) return no('step ' + (k + 1) + ': no block in the deployment record');
    if (address !== pred[letter]) return no('step ' + (k + 1) + ': the address is not the one the deployer creates at nonce ' + (record.nonceN + k));
    if (k > 0 && e.bloc < steps[k - 1].block) return no('step ' + (k + 1) + ' lands before step ' + k);
    if (steps.some((s) => s.tx === tx)) return no('step ' + (k + 1) + ' repeats a transaction');
    steps.push({ k, letter, address, tx, block: e.bloc });
  }
  return { ok: true, why: '', steps };
}

/** a JSON-RPC reader on one node (fetch only, POST, a timeout); throws on any HTTP, JSON-RPC or shape error */
export function nodeReader(url, fetchFn = globalThis.fetch, ms = 8000) {
  return async (method, params) => {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), ms) : null;
    try {
      const r = await fetchFn(url, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: ctl ? ctl.signal : undefined });
      if (!r || !r.ok) throw new Error(url + ' answered ' + (r ? r.status : 'nothing'));
      const j = await r.json();
      if (j && j.error) throw new Error(url + ': ' + (j.error.message || 'error'));
      if (!j || !Object.prototype.hasOwnProperty.call(j, 'result')) throw new Error(url + ': no result');
      return j.result;
    } finally { if (timer) clearTimeout(timer); }
  };
}

/** readStepCode(pack, step, readers) -> { state: 'match' | 'differs', bytes } | { state: 'absent' } | { state: 'not read', why } */
export async function readStepCode(pack, step, readers) {
  const e = pack.etapes[step.k];
  const list = Array.isArray(readers) ? readers : [];
  let empty = 0;
  const why = [];
  for (const read of list) {
    let c;
    try { c = await read('eth_getCode', [step.address, 'latest']); } catch (x) { why.push(String((x && x.message) || x)); continue; }
    if (typeof c !== 'string' || !HEX_CODE.test(c)) { why.push('malformed answer'); continue; }
    if (c === '0x') { empty += 1; continue; }
    const bytes = (c.length - 2) / 2;
    let same = false;
    try { same = (await sha256Hex(codeMasque(c, e.immutables))) === e.runtimeSha256Masque; } catch (_) { same = false; }
    return { state: same ? 'match' : 'differs', bytes };
  }
  if (list.length > 0 && empty === list.length) return { state: 'absent' };
  return { state: 'not read', why: why.join(' · ') || 'no node to read' };
}

/** summary(codes, names) -> { all, tone, text } — codes[k] null = still reading */
export function summary(codes, names) {
  const nm = (k) => (names && names[k]) || 'step ' + (k + 1);
  if (!Array.isArray(codes) || codes.length === 0) return { all: false, tone: '', text: 'Nothing read yet.' };
  if (codes.some((c) => !c)) return { all: false, tone: '', text: 'Reading the code at the six addresses on Base…' };
  const bad = codes.map((c, k) => (c.state === 'absent' ? nm(k) + ': no code at its address' : c.state === 'differs' ? nm(k) + ': the code differs from the frozen record' : null)).filter(Boolean);
  if (bad.length) return { all: false, tone: 'ko', text: 'STOP: ' + bad.join(' · ') };
  const unread = codes.map((c, k) => (c.state === 'match' ? null : nm(k))).filter(Boolean);
  if (unread.length) return { all: false, tone: '', text: 'The six contracts are deployed (read from their receipts). The code could not be read on Base right now for: ' + unread.join(', ') + ' (not read). Reload to read it again.' };
  return { all: true, tone: 'ok', text: 'All six contracts are deployed.' };
}

const lienAdr = (a) => '<a href="https://basescan.org/address/' + esc(a) + '" target="_blank" rel="noopener" title="' + esc(a) + '">' + esc(short(a)) + '</a>';
const lienTx = (h) => '<a href="https://basescan.org/tx/' + esc(h) + '" target="_blank" rel="noopener" title="' + esc(h) + '">' + esc(short(h)) + '</a>';

/** the code line of one step: never a zero for a read that failed */
export function codeLine(code) {
  if (!code) return '<span class="note">code on chain: reading…</span>';
  if (code.state === 'match') return '<span class="st ok">code on chain: matches the frozen record (' + esc(code.bytes) + ' bytes)</span>';
  if (code.state === 'differs') return '<span class="st ko">code on chain: ' + esc(code.bytes) + ' bytes, differs from the frozen record</span>';
  if (code.state === 'absent') return '<span class="st ko">code on chain: none at this address</span>';
  return '<span class="st">code on chain: not read</span>';
}

/** the status of one deployed step: "Deployed", its address and tx (shortened, linked to Basescan), its block, its code line */
export function stepHtml(step, code) {
  return '<span class="st ok">Deployed</span> · address ' + lienAdr(step.address) + ' · tx ' + lienTx(step.tx) + ' · block ' + esc(step.block)
    + '<br>' + codeLine(code);
}
