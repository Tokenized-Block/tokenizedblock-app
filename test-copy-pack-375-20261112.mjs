/* test-copy-pack-375-20261112.mjs — UI copy rule (Phil 2026-11-12): the user never reads an internal status or a version word
 *   ("not deployed", "under review", "fork test", "written", v2/V2/v3/V8...). The product is named; what is not live yet is hidden or
 *   says "Coming soon" with what it does.
 * What it scans is the RENDERED text, not the source:
 *   - holders.html and deployer-economie-v2.html: the static text nodes (comments, <script>, <style> removed) PLUS what their own module
 *     script writes into the page, run here against a stub DOM (innerHTML / textContent captured, tags stripped). Holders is rendered
 *     twice: before a wallet is read, and after Connect (balance read, channel open). The deploy page is rendered before Connect and after
 *     Connect with the record's deployer, and every line its after-step-6 check list can show (verifierPack quoi). Since task 377 the page
 *     reads the deployment record (economie-v2-pack-deploye.js): after Connect it must show the six steps "Deployed" and offer nothing.
 *     The six-step offer is still the page's fallback when that record cannot load, so it is rendered too, with the record's import
 *     pointed at a missing file (witness: the step-1 offer is drawn);
 *   - app.html: the strings the app writes into the lock card, the vault explainer and the lock points note (comments removed);
 *   - the view modules those pages print: points-vue.js (REGLE_COURTE and its lines) and coeurs-vue.js (board and account lines).
 * Witnesses: each render must hold the text it is supposed to hold, or the scan of an empty page would pass.
 * NE PROUVE PAS: the whole app (2.7 MB) — only the economy strings named above; a style judgement (a correct but clumsy sentence passes). */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const lire = (f) => readFileSync(path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
let ok = 0, ko = 0;
const t = (m, c, x = '') => { if (c) ok++; else { ko++; console.log('KO', m, x); } };

/* the banned words: internal status, and a version tag either alone (v2, V8) or glued to a name (BlockLikesV2, v4PoolId) */
const BAN = /not deployed|deployed yet|under review|in review|reviewed|fork[- ]?test|\bwritten\b|to deploy\b|not live yet|next version|(?:\b|(?<=[a-z]))[vV]\d+(?![\d.])/;
const fautes = (textes) => textes.filter((s) => BAN.test(s)).map((s) => '« ' + (s.match(new RegExp('.{0,50}' + BAN.source + '.{0,50}')) || [s])[0] + ' »');
/* witness: the line Phil flagged is caught, word by word */
t('witness: the flagged holders line is caught', ['Vault v2: more from $100 locked', 'written, under review and fork test — not deployed', 'L (BlockLikesV2).wired()', 'v4PoolId'].every((s) => BAN.test(s)));
t('witness: plain copy passes', !BAN.test('Coming soon — the holders vault: $15 locked to claim') && !BAN.test('TBLOCK payment router') && !BAN.test('L.DEV2()'));

const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const texteDe = (html) => decode(String(html).replace(/<[^>]*>/g, '\n')).split(/\n+/).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
/** the static text nodes of a page: comments, scripts and styles removed */
function texteStatique(src) {
  const nu = src.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  return texteDe(nu).filter((s) => /[A-Za-z]/.test(s));
}

/** runs the page's module script against a stub DOM; returns the elements it wrote to */
const TMP = mkdtempSync(path.join(tmpdir(), 'copy375-'));
let nScript = 0;
async function rendre(src, { fetchJson = () => ({}), ethereum = null } = {}) {
  const m = src.match(/<script type="module">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('no module script');
  const base = pathToFileURL(ICI + path.sep).href;
  const code = m[1].replace(/(from\s+|import\(\s*)'\.\/([^']+)'/g, (_, a, f) => a + "'" + base + f + "'");
  const els = new Map();
  const el = (sel) => {
    if (!els.has(sel)) els.set(sel, { sel, innerHTML: '', textContent: '', hidden: false, disabled: false, onclick: null, style: {}, dataset: {}, className: '' });
    return els.get(sel);
  };
  globalThis.document = { querySelector: el, hidden: false, documentElement: { setAttribute() {} } };
  globalThis.window = { ethereum };
  globalThis.location = { search: '' };
  globalThis.setInterval = () => 0;
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.fetch = async (url) => ({ json: async () => fetchJson(String(url)) });
  const f = path.join(TMP, 'page-' + (++nScript) + '.mjs');
  writeFileSync(f, code);
  await import(pathToFileURL(f).href);
  for (let i = 0; i < 40; i++) await new Promise((o) => setTimeout(o, 5));
  return { els, el, textes: () => [...els.values()].flatMap((e) => [...texteDe(e.innerHTML), ...texteDe(e.textContent)]) };
}

/* ======== holders.html ======== */
const H = lire('holders.html');
const PRIX = { priceNow: 0.0000009, priceBefore: 0.00000088, thresholdUsd: 15 };
const holdersApi = (connecte) => (url) => {
  if (url.startsWith('/api/tblock/hold?wallet=')) return { ...PRIX, ok: true, telegramReady: true, balance: (30000000n * 10n ** 18n).toString(), usd: 27, challenge: { message: 'm', nonce: 'n' } };
  if (url.startsWith('/api/tblock/hold')) return { ...PRIX, telegramReady: connecte };
  if (url.startsWith('/api/tblock/burn')) return { ok: true, tokens: 1000, pct: 0.0001, supply: (10n ** 27n).toString() };
  if (url.startsWith('/api/points')) return { ok: true, complet: true, board: [] };
  if (url.startsWith('/api/coeurs')) return { ok: true, board: [] };
  return {};
};
{
  const statique = texteStatique(H);
  t('holders static text read (witness)', statique.some((s) => s.includes('What your TBLOCK unlocks')), statique.length);
  t('holders static text: no status or version word', fautes(statique).length === 0, fautes(statique).join(' '));

  const avant = await rendre(H, { fetchJson: holdersApi(false) });
  const perks = avant.el('#perks').innerHTML;
  t('holders render before a wallet: the perks were drawn (witness)', (perks.match(/class="perk"/g) || []).length >= 6, perks.slice(0, 120));
  const tx1 = avant.textes();
  t('holders render before a wallet: no status or version word', fautes(tx1).length === 0, fautes(tx1).join(' '));
/* 2026-11-12 (the economy pack is live): the holders vault and the lock rewards are LIVE; their rules are READ on chain (economie-pack.js
 *   texteRegleVault, REGLES_VAULT) and said by what they do — the "coming soon" vault row and the first vault's fixed holds are gone */
  t('holders: the live vault and the lock rewards are listed by what they do, not as coming soon', tx1.some((s) => s.startsWith('Holders vault, every week')) && tx1.some((s) => s.startsWith('Monthly lock rewards')) && !tx1.some((s) => s.startsWith('Coming soon — the holders vault')));
  t('holders: the channel badge says "coming soon" while it is closed', tx1.filter((s) => s === 'coming soon').length >= 1, tx1.filter((s) => /soon/.test(s)).join(' | '));

  const eth = { request: async ({ method }) => (method === 'eth_requestAccounts' ? ['0x' + 'ab'.repeat(20)] : null) };
  const apres = await rendre(H, { fetchJson: holdersApi(true), ethereum: eth });
  await apres.el('#connecter').onclick();
  for (let i = 0; i < 20; i++) await new Promise((o) => setTimeout(o, 5));
  const tx2 = apres.textes();
  /* game377: the card says each rule on its own value; the server's wallet answer ($27, enough) is the channel line, the lock is not read here */
  t('holders render after Connect: the wallet was read (witness)', tx2.includes('enough: $27.00 in your wallet') && tx2.includes('Locked') && tx2.some((s) => s === '✓ YOU CAN'), tx2.slice(0, 12).join(' | '));
  t('holders render after Connect: no status or version word', fautes(tx2).length === 0, fautes(tx2).join(' '));
}

/* ======== deployer-economie-v2.html (the pack page) ======== */
const P = lire('deployer-economie-v2.html');
const { PACK_ECONOMIE_V2: D } = await import('./economie-v2-pack-deploiement.js');
const { verifierPack, LETTRES } = await import('./pack-economie-v2.js');
{
  const statique = texteStatique(P);
  t('deploy page static text read (witness)', statique.includes('Deploy the holders economy (Base)'), statique.length);
  t('deploy page static text: no status or version word', fautes(statique).length === 0, fautes(statique).join(' '));

  const deployeur = D.deployeur; /* read from the record, never typed */
  const eth = { request: async ({ method }) => ({ eth_requestAccounts: [deployeur], eth_getCode: '0x', eth_chainId: '0x2105', eth_getTransactionCount: '0x10' })[method] ?? null };
  const r = await rendre(P, { ethereum: eth });
  const avant = r.textes();
  t('deploy page render: the record and the six steps were drawn (witness)', avant.includes('Frozen record') && avant.includes('1. Hearts') && avant.includes('6. Lock rewards'), avant.slice(0, 8).join(' | '));
  t('deploy page render before Connect: no status or version word', fautes(avant).length === 0, fautes(avant).join(' '));
  await r.el('#connect').onclick();
  for (let i = 0; i < 20; i++) await new Promise((o) => setTimeout(o, 5));
  const apres = r.textes();
  /* task 377: the record is on Base, so after Connect the six steps read "Deployed" and nothing is offered (Phil saw "not signed") */
  const nDeployed = apres.filter((s) => s === 'Deployed').length;
  t('deploy page render after Connect: six steps "Deployed", nothing offered (witness)', nDeployed === 6 && !apres.some((s) => s.startsWith('1. Deploy Hearts')) && !apres.includes('not signed')
    && r.el('#connect').hidden === true && r.el('#go').hidden === true, [nDeployed, r.el('#connect').hidden, r.el('#go').hidden, r.el('#state').innerHTML.slice(0, 120)].join(' | '));
  t('deploy page render after Connect: no status or version word', fautes(apres).length === 0, fautes(apres).join(' '));

  /* the fallback: the deployment record cannot load -> the six-step offer, whose copy must stay clean too */
  const IMP = "import('./economie-v2-pack-deploye.js')";
  t('fallback render: the record import was found once (witness)', P.split(IMP).length - 1 === 1, P.split(IMP).length - 1);
  const rf = await rendre(P.replace(IMP, () => "import('./economie-v2-pack-deploye.absent-377.js')"), { ethereum: eth });
  await rf.el('#connect').onclick();
  for (let i = 0; i < 20; i++) await new Promise((o) => setTimeout(o, 5));
  const repli = rf.textes();
  t('fallback render after Connect: step 1 offered (witness)', repli.some((s) => s.startsWith('1. Deploy Hearts')), rf.el('#state').innerHTML.slice(0, 160));
  t('fallback render after Connect: no status or version word', fautes(repli).length === 0, fautes(repli).join(' '));

  /* every line the after-step-6 check list can print: run the checks on a chain that answers nothing useful (all lines are produced) */
  const rpc = async (method, params) => {
    if (method === 'eth_chainId') return '0x2105';
    if (method === 'eth_getTransactionByHash') return { from: deployeur, nonce: '0x10', input: '0x', to: null, hash: params[0] };
    if (method === 'eth_getTransactionReceipt') return { status: '0x1', contractAddress: '0x' + '11'.repeat(20) };
    if (method === 'eth_getCode') return '0x';
    return null;
  };
  const res = await verifierPack(D, LETTRES.map((_, k) => '0x' + String(k + 1).repeat(64)), rpc);
  const lignes = res.lignes.flatMap((l) => [l.quoi, l.vu]);
  t('deploy page check list produced (witness: 60+ lines)', res.lignes.length >= 60, res.lignes.length);
  t('deploy page check list: no status or version word', fautes(lignes).length === 0, fautes(lignes).join(' '));
}

/* ======== app.html: the economy strings ======== */
{
  const APP = lire('app.html');
  const tranche = (debut, fin) => { const i = APP.indexOf(debut); return i < 0 ? '' : APP.slice(i, APP.indexOf(fin, i)); };
  const chaines = (s) => [...s.replace(/\/\*[\s\S]*?\*\//g, ' ').matchAll(/'((?:[^'\\\n]|\\.)*)'/g)].map((x) => x[1].replace(/\\'/g, "'")).filter((x) => /[A-Za-z]{2,}\s+[A-Za-z]/.test(x));
  const lockCarte = chaines(tranche("hote.append(el('p', 'sous', 'Locking earns", '\n'));
  const vault = chaines(tranche("const wc = $('#wVaultComment');", 'void peindreCoeursWallet();'));
  const ptsNote = chaines(tranche('ptsNote.textContent = m > 0n', '\n'));
  t('app strings found (witness)', lockCarte.length >= 1 && vault.length >= 2 && ptsNote.length >= 2 /* 2026-11-12: the explainer is the live vault's rules, read on chain */, [lockCarte.length, vault.length, ptsNote.length].join('/'));
  const tout = [...lockCarte, ...vault, ...ptsNote];
  t('app lock card, vault explainer and points note: no status or version word', fautes(tout).length === 0, fautes(tout).join(' '));
  t('app vault explainer: the live vault\'s rules read on chain, and you must play that week', vault.join('').includes('You must play that week: a heart, a TAM art mint or a skin mint.') && !vault.join('').includes('Coming soon, the holders vault'));
}

/* ======== the view modules those pages print ======== */
{
  const PV = await import('./points-vue.js');
  const CV = await import('./coeurs-vue.js');
  const nom = (x) => String(x).slice(0, 6);
  const r = { ok: true, complet: true, compte: { total: 25, lock: 5, jeu: 20, part: 0.01, rang: 3, parJour: 2, mult: 1.25 }, board: [{ rang: 1, holder: '0x' + 'ab'.repeat(20), total: 25, part: 0.01, parJour: 2 }] };
  const textes = [PV.REGLE_COURTE, ...[null, r].flatMap((x) => [...PV.lignesMesPoints(x, nom), ...PV.lignesBoardPoints(x, nom)]).flatMap((l) => [l.k, l.v]),
    ...CV.lignesBoard(null, nom, null).flatMap((l) => [l.k, l.v])];
  t('view modules read (witness)', textes.length >= 8 && PV.REGLE_COURTE.includes('community drop'), textes.length);
  t('view modules: no status or version word', fautes(textes).length === 0, fautes(textes).join(' '));
}

rmSync(TMP, { recursive: true, force: true });
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
