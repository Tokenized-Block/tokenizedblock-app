// test-block-panel-376-20261112.mjs — the block panel Phil reported on CLOUD (2026-11-12), and the ranking that put it n°1.
// ================================================================================================
// What Phil saw (CLOUD, Dex pair 0x5447a10d4cd21d0e420e87903fc27b9f73d35807):
//   "Market cap · life: No TB-readable pool yet" next to "Price $0.009494", "Exit depth $4.11 · 0.002 WETH";
//   "Minting: supply is below its cap — we did not check whether anyone still holds the mint role";
//   "More (private)" followed by six EMPTY bullets. The visitor sweep also found CLOUD n°1 of the Blocks ranking at ~$9.5B.
// Measured the same day:
//   - DexScreener pair: priceUsd 0.009494, priceNative 0.000004646, liquidity { usd 7595209731.13, base 799999999609,
//     quote 0.00201 }, fdv = marketCap = 9494012163 (the fixture below copies these numbers).
//   - chain (eth_call): totalSupply 1e12 (18 decimals), supplyCap 2^128-1; owner(), admin() and getRoleMemberCount(MINT_ROLE)
//     revert, so who holds the mint role cannot be read without a candidate address.
//   - prod at 420 px: the six folded lines DID hold text; the fold was closed, a copy takes the bullets without the text.
// What this test holds (red on the code before game376, green after):
//   1. the profile card gives the market value ALWAYS next to the cash in its pool, and says "on paper only" for a pool too thin
//      to trust; the folded lines are plain words, none empty, no raw HTTP error, no "vanity"/"Gecko"/"Txns window";
//   2. the server index carries each row's cash side and the paper flag; the market scale total stops adding CLOUD's $7.6B;
//   3. the Blocks ranking leaves a too-thin row out, with its reason, and still ranks the honest ones;
//   4. "No TB-readable pool yet" and "More (private)" are gone from the screen; the minting line is a plain sentence.
// Second pass, Phil's feedback the same day (« ne le rends pas paper only, garde que ce qui est live » / « pourquoi pas vérifier ») :
//   5. NO paper value anywhere: a pool too thin to trust shows its price, its cash (dollars + its own unit), its 24 h volume — no
//      « $9.5B », no « $7.6B », no FDV; the server row does not carry that FDV; brain fallback, stages and vision use the cash;
//   6. the minting line is READ (server /api/emission, emission-b20.js — its own test: test-emission-b20-20261112.mjs): « checking »
//      until the verdict, then the server's sentence; never « we did not check ».
// ⚠️ DOES NOT PROVE: that DexScreener answers today, nor that the prod server runs this code (deploy is separate).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as P from './pnl-swaps.js';
import { resumerTrending } from './trending.js';
import { echelleDesMarches } from './echelle-marche.js';
import { classer } from './classement.js';
import { supplyLisible } from './faits.js';
import { rapport, METIERS } from './metiers.js';

const CLOUD = '0xb200000000000000000000f78538b73d60594138';
const WETH = '0x4200000000000000000000000000000000000006';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const POOL_CLOUD = '0x5447a10d4cd21d0e420e87903fc27b9f73d35807';
const HONNETE = '0xb2000000000000000000000000000000000000aa';

/* the CLOUD pair as DexScreener served it on 2026-11-12 (numbers copied from the response, not rounded) */
const paireCloud = {
  chainId: 'base', dexId: 'uniswap', url: 'https://dexscreener.com/base/' + POOL_CLOUD, pairAddress: POOL_CLOUD, labels: ['v3'],
  baseToken: { address: '0xB200000000000000000000f78538b73d60594138', name: 'Cloudia', symbol: 'CLOUD' },
  quoteToken: { address: WETH, name: 'Wrapped Ether', symbol: 'WETH' },
  priceNative: '0.000004646', priceUsd: '0.009494',
  txns: { h1: { buys: 0, sells: 1 }, h6: { buys: 1, sells: 6 }, h24: { buys: 8, sells: 122 } },
  volume: { h24: 1.65, h6: 0.06, h1: 0 }, priceChange: { h1: -0.33, h6: -0.36, h24: -0.68 },
  liquidity: { usd: 7595209731.13, base: 799999999609, quote: 0.00201 },
  fdv: 9494012163, marketCap: 9494012163, pairCreatedAt: 1794232012000,
};
/* a control: a USDC pool whose dollar mark is mostly cash (synthetic, shaped like the GOOGLc row measured the same day) */
const paireHonnete = {
  chainId: 'base', dexId: 'aerodrome', url: 'https://dexscreener.com/base/0x' + '1'.repeat(40), pairAddress: '0x' + '1'.repeat(40),
  baseToken: { address: HONNETE, name: 'Honest', symbol: 'HON' },
  quoteToken: { address: USDC, name: 'USD Coin', symbol: 'USDC' },
  priceNative: '300', priceUsd: '300',
  txns: { h6: { buys: 40, sells: 30 }, h24: { buys: 200, sells: 150 } },
  volume: { h24: 90000, h6: 20000, h1: 3000 }, priceChange: { h6: 1.2, h24: 2 },
  liquidity: { usd: 1701179, base: 3220, quote: 734910.76 },
  fdv: 10369601, marketCap: 10369601, pairCreatedAt: 1790000000000,
};
/* fetch: DexScreener answers with the pair; GeckoTerminal answers 404 (the screen must not echo "HTTP 404") */
const fetchDe = (paire) => async (url) => {
  if (String(url).includes('api.dexscreener.com')) return { ok: true, status: 200, json: async () => ({ pairs: [paire] }) };
  return { ok: false, status: 404, json: async () => ({}) };
};
const sansBalises = (h) => String(h).replace(/<[^>]*>/g, '').trim();

let n = 0;
/* every case runs and says its verdict; the file fails at the end if any case is red (a red count, never a silent stop) */
const rouges = [];
const cas = async (nom, f) => {
  try { await f(); n++; console.log('ok  ' + nom); }
  catch (e) { rouges.push(nom); console.log('RED ' + nom + '\n    ' + String(e && e.message || e).split('\n')[0]); }
};

await cas('1a. CLOUD : seul le vivant — prix, cash (USD + WETH), volume 24 h ; AUCUNE valeur papier', async () => {
  const r = await P.lirePnlSwaps({ jeton: CLOUD, fetchFn: fetchDe(paireCloud) });
  assert.equal(r.etat, 'LUE');
  const l = r.lignes.map(sansBalises);
  const tout = l.concat((r.lignesPrivees || []).map(sansBalises)).join(' | ');
  assert.ok(l.some((x) => /^Price: \$0\.009494/.test(x)), 'no live price: ' + JSON.stringify(l));
  const cash = l.find((x) => /^Cash in its pool to sell into:/.test(x));
  assert.ok(cash, 'no line gives the cash in its pool: ' + JSON.stringify(l));
  assert.match(cash, /\$4\.11/, 'the cash is not the measured $4.11');
  assert.match(cash, /0\.002\d* WETH/, 'the cash is not given in its own unit too: ' + cash);
  assert.ok(l.some((x) => /^Traded in the last 24 hours: \$1\.65 · 130 trades$/.test(x)), 'no 24 h volume line: ' + JSON.stringify(l));
  /* Phil (second pass): no paper value, not even labelled « on paper only » */
  for (const papier of [/9\.5B/, /9,494/, /7\.6B/, /7,595/, /on paper only/i, /Market value:/]) {
    assert.ok(!papier.test(tout), 'a paper value is still on screen: ' + papier + ' in ' + tout);
  }
  assert.ok(l.includes('Not valued: its pool holds too little cash to price the whole supply.'), 'no plain reason for the missing value');
  assert.ok(r.market && r.market.valeur && r.market.valeur.mince === true && r.market.valeur.classable === false
    && r.market.valeur.valeurUsd === null, 'the market read still carries a value for a thin pool');
  assert.equal(r.market.fdv, null, 'the market read still carries the paper FDV');
  assert.equal(r.market.marketCap, null);
});

await cas('1b. CLOUD : les lignes repliees sont des mots simples, aucune vide, aucune erreur brute', async () => {
  const r = await P.lirePnlSwaps({ jeton: CLOUD, fetchFn: fetchDe(paireCloud) });
  const priv = r.lignesPrivees || [];
  assert.ok(priv.length > 0);
  for (const x of priv) assert.ok(sansBalises(x).length > 0, 'an empty folded line would draw an empty bullet');
  const tout = priv.map(sansBalises).join(' | ');
  for (const jargon of [/vanity/i, /Gecko/i, /Txns window/i, /Paper FDV/i, /HTTP \d/, /Vol h6/i, /buys \/ /]) {
    assert.ok(!jargon.test(tout), 'jargon or raw error on screen: ' + jargon + ' in ' + tout);
  }
  assert.match(tout, /Last 6 hours: 1 buy, 6 sells/, 'the 6 h counts are not said with their window');
  assert.match(tout, /Most of its pool is its own tokens, not cash\./);
});

await cas('1c. un pool honnete garde une valeur simple, sans « paper »', async () => {
  const r = await P.lirePnlSwaps({ jeton: HONNETE, fetchFn: fetchDe(paireHonnete) });
  const l = r.lignes.map(sansBalises);
  const v = l.find((x) => /^Market value:/.test(x));
  assert.ok(v, 'no market value line for an honest pool');
  assert.ok(!/paper/i.test(v), 'an honest pool is called paper: ' + v);
  assert.match(v, /\$10\.4M/);
  assert.equal(r.market.valeur.mince, false);
  assert.equal(r.market.valeur.classable, true);
});

await cas('1d. valeurMarche : sans cote cash lu, le verdict reste « non lu » (null), jamais « fine »', () => {
  assert.equal(typeof P.valeurMarche, 'function');
  const v = P.valeurMarche({ fdvUsd: 5000, liquiditeUsd: 5000, profondeurUsd: null, liquiditePapier: null });
  assert.equal(v.mince, null);
  assert.equal(v.classable, true, 'an unread cash side must not unrank every row before the server carries it');
  assert.match(P.phraseValeurMarche(v), /not read/);
  assert.equal(P.phraseValeurMarche(P.valeurMarche({ fdvUsd: null })), null);
  /* a thin pool has NO value, whatever FDV the aggregator gives — and its words carry only the cash */
  const m = P.valeurMarche({ fdvUsd: 9494012163, liquiditeUsd: 7595209731.13, profondeurUsd: 4.107391304347826, liquiditePapier: null });
  assert.equal(m.mince, true); assert.equal(m.valeurUsd, null); assert.equal(m.classable, false);
  assert.equal(P.phraseValeurMarche(m), 'Not valued: its pool holds only $4.11 to sell into');
});

await cas('2a. index serveur : chaque ligne porte son cash et le drapeau papier', () => {
  const r = resumerTrending([paireCloud, paireHonnete], [CLOUD, HONNETE]);
  const c = r.lignes.find((x) => x.sym === 'CLOUD');
  const h = r.lignes.find((x) => x.sym === 'HON');
  assert.ok(c && h, 'rows missing');
  assert.equal(c.liquiditePapier, true, 'CLOUD not flagged as paper');
  assert.ok(Math.abs(c.profondeurUsd - 4.11) < 0.01, 'CLOUD cash side is not ~$4.11: ' + c.profondeurUsd);
  assert.equal(h.liquiditePapier, false);
  assert.ok(Math.abs(h.profondeurUsd - 734910.76) < 0.01);
  /* second pass: the server row does not carry a FDV set by a pool too thin to trust */
  assert.equal(c.fdvUsd, null, 'the server row still carries the paper FDV: ' + c.fdvUsd);
  assert.equal(h.fdvUsd, 10369601, 'an honest row lost its FDV');
});

await cas('2b. le total des marches suivis n ajoute plus les 7,6 Md$ de papier de CLOUD', () => {
  const r = resumerTrending([paireCloud, paireHonnete], [CLOUD, HONNETE]);
  const e = echelleDesMarches(r.lignes);
  assert.equal(e.etat, 'LU');
  assert.ok(e.liquiditeUsd < 1e8, 'the scale still adds paper liquidity: ' + e.liquiditeUsd);
  assert.equal(e.blocks, 1);
  assert.equal(e.ecartees, 1, 'the paper row is not counted as set aside');
});

/* ── app.html : the functions are run, not just grepped ─────────────────────────────────────── */
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
/** The source of `function name(...) {...}` in app.html, braces matched outside strings and comments; null when absent. */
function sourceDe(nom) {
  const i = app.indexOf('function ' + nom + '(');
  if (i < 0) return null;
  let j = app.indexOf('{', app.indexOf(')', i));
  let prof = 0;
  for (let k = j; k < app.length; k++) {
    const c = app[k], d = app[k + 1];
    if (c === '/' && d === '*') { k = app.indexOf('*/', k + 2) + 1; continue; }
    if (c === '/' && d === '/') { k = app.indexOf('\n', k); continue; }
    if (c === "'" || c === '"' || c === '`') {
      for (k++; k < app.length && app[k] !== c; k++) if (app[k] === '\\') k++;
      continue;
    }
    if (c === '{') prof++;
    else if (c === '}') { prof--; if (prof === 0) return app.slice(i, k + 1); }
  }
  return null;
}

await cas('3. le classement : CLOUD (papier) n est pas n°1, il est non classe AVEC sa raison', () => {
  const src = sourceDe('classementCourant');
  assert.ok(src, 'classementCourant not found');
  const aide = sourceDe('valeurDeLigneMarche') || '';
  const r = resumerTrending([paireCloud, paireHonnete], [CLOUD, HONNETE]);
  const marcheParAdr = new Map(r.lignes.map((l) => [l.adr, l]));
  const fn = new Function('classer', 'habitants', 'vieEnUsd', 'marcheParAdr', 'valeurMarche',
    aide + '\n' + src + '\nreturn classementCourant();');
  const cl = fn(classer, [], () => null, marcheParAdr, P.valeurMarche);
  assert.ok(cl.classes.length >= 1, 'nothing ranked');
  assert.notEqual(cl.classes[0].symbole, 'CLOUD', 'CLOUD is still n°1 on $4 of cash');
  assert.ok(!cl.classes.some((b) => b.symbole === 'CLOUD'), 'CLOUD is still ranked');
  assert.equal(cl.classes[0].symbole, 'HON', 'the honest row is not ranked');
  const c = cl.nonMesures.find((b) => b.symbole === 'CLOUD');
  assert.ok(c && c.mince === true && /too thin to trust/.test(c.pourquoi), 'CLOUD unranked without its reason');
  /* the note says the thin ones apart — "no readable market" would be false for them */
  const peint = sourceDe('peindreClassement') || '';
  assert.match(peint, /too thin to trust/, 'the ranking note does not name the thin rows');
});

await cas('4a. « No TB-readable pool yet » et « More (private) » ne sont plus a l ecran', () => {
  const code = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
  assert.ok(!/TB-readable/.test(code), 'jargon left on screen: TB-readable');
  assert.ok(!/More \(private\)/.test(code), 'the fold still says private');
  assert.ok(code.includes('More details'));
  assert.ok(code.includes('No market on TokenizedBlock yet'));
  assert.ok(!/never traded, which is not/.test(code), 'the map card still claims « never traded » without measuring it');
});

await cas('4b. « Market cap · life » : la valeur lue remplace « pas de marche », avec son cash', () => {
  const src = sourceDe('peindreValeurProfil');
  assert.ok(src, 'peindreValeurProfil not found');
  assert.match(sourceDe('peindrePnlSwaps') || '', /peindreValeurProfil\(adr, r\)/, 'the swaps card never paints the value');
  const el = { textContent: 'No market on TokenizedBlock yet' };
  const box = { dataset: { block: CLOUD } };
  const $ = (q) => (q === '#pVie' ? el : q === '#profil' ? box : null);
  const val = P.valeurMarche({ fdvUsd: 9494012163, liquiditeUsd: 7595209731.13, profondeurUsd: 4.107391304347826, liquiditePapier: true });
  new Function('$', 'vieProfil', 'phraseValeurMarche', src + '\nreturn peindreValeurProfil;')($, null, P.phraseValeurMarche)(
    CLOUD, { etat: 'LUE', market: { valeur: val } });
  /* second pass (Phil): the cash only — no paper value next to it */
  assert.equal(el.textContent, 'Not valued: its pool holds only $4.11 to sell into', 'the profile value: ' + el.textContent);
  assert.ok(!/9\.5B|paper/i.test(el.textContent));
  /* our own chain life, when it is a number, wins */
  const el2 = { textContent: '0.5 ETH' };
  new Function('$', 'vieProfil', 'phraseValeurMarche', src + '\nreturn peindreValeurProfil;')(
    (q) => (q === '#pVie' ? el2 : box), 0.5, P.phraseValeurMarche)(CLOUD, { etat: 'LUE', market: { valeur: val } });
  assert.equal(el2.textContent, '0.5 ETH');
});

await cas('4c. la ligne Minting est LUE (serveur) : « checking… » puis la phrase du serveur, jamais « we did not check »', async () => {
  const code = app.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/did not check whether anyone/.test(code), 'the « we did not check » sentence is still on screen');
  assert.ok(!/mint role not checked|cap = supply today/.test(code), 'an unread minting claim is left');
  const src = 'async ' + (sourceDe('peindreEmission') || ''); /* sourceDe starts at « function » */
  assert.ok(app.includes('async function peindreEmission('), 'peindreEmission not found');
  /* run it: the server first says « still checking » (NON_LU + enCours), then FIXE — the screen shows checking, then the verdict */
  const reponses = [{ ok: true, etat: 'NON_LU', phrase: null, enCours: true, reessayerDansS: 8 },
    { ok: true, etat: 'FIXE', phrase: 'Fixed supply: nobody can create more', enCours: false }];
  const urls = [], ecrits = [];
  const fetchF = async (u) => { urls.push(u); const j = reponses.shift(); return { json: async () => j }; };
  const run = new Function('fetch', 'setTimeout', 'AbortSignal', 'CHAINE', src + '\nreturn peindreEmission;')(
    fetchF, (f) => f(), { timeout: () => null }, 8453);
  await run(CLOUD, (t) => ecrits.push(t));
  assert.deepEqual(urls, ['/api/emission/' + CLOUD, '/api/emission/' + CLOUD]);
  assert.deepEqual(ecrits, ['Fixed supply: nobody can create more'], 'the screen did not show the server verdict: ' + JSON.stringify(ecrits));
  /* a server that never answers: polite « still checking », never an error, and it stops */
  const ecrits2 = [];
  const run2 = new Function('fetch', 'setTimeout', 'AbortSignal', 'CHAINE', src + '\nreturn peindreEmission;')(
    async () => { throw new Error('HTTP 502'); }, (f) => f(), { timeout: () => null }, 8453);
  await run2(CLOUD, (t) => ecrits2.push(t));
  assert.deepEqual(ecrits2, ['Still checking who can create more — open this block again in a minute']);
  assert.ok(!/error|HTTP|failed/i.test(ecrits2.join(' ')));
  /* review 2026-11-12 : a verdict already shown (a stale PEUT_CROITRE being re-read, enCours true on every poll) is NOT replaced by
   *   « still checking » when the re-read outlasts the polls — a real answer never turns back into a non-answer */
  const ecrits4 = [];
  await new Function('fetch', 'setTimeout', 'AbortSignal', 'CHAINE', src + '\nreturn peindreEmission;')(
    async () => ({ json: async () => ({ ok: true, etat: 'PEUT_CROITRE', phrase: 'Supply can still grow: the creator can create more', enCours: true, reessayerDansS: 8 }) }),
    (f) => f(), { timeout: () => null }, 8453)(CLOUD, (t) => ecrits4.push(t));
  assert.equal(ecrits4[ecrits4.length - 1], 'Supply can still grow: the creator can create more',
    'a shown verdict was overwritten by « still checking »: ' + JSON.stringify(ecrits4.slice(-2)));
  /* the screen it left: the profile no longer the panel */
  const ecrits3 = [];
  await new Function('fetch', 'setTimeout', 'AbortSignal', 'CHAINE', src + '\nreturn peindreEmission;')(
    async () => ({ json: async () => ({ ok: true, etat: 'FIXE', phrase: 'Fixed supply: nobody can create more' }) }), (f) => f(), { timeout: () => null }, 8453)(
    CLOUD, (t) => ecrits3.push(t), () => false);
  assert.deepEqual(ecrits3, [], 'a verdict was painted on a block no longer open');
  /* the waiting words, and the three call sites: the profile (read and not read) and the map card */
  assert.match(app, /const PHRASE_EMISSION_ATTENTE = 'Checking who can create more…';/);
  assert.equal((code.match(/peindreEmission\(adr, \(t\) => \{/g) || []).length, 3, 'the profile and the map card do not both read it');
});

await cas('5. review : le jumeau « Tokenized Block-readable … tried keys » et le « never traded » du rapport sont partis', () => {
  const code = app.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/readable pool among tried keys|hooked market/.test(code), 'the HP note still says « readable pool among tried keys / hooked market »');
  /* the job report runs for real: no market read by us must never be said as « never traded » (CLOUD: 130 trades in 24 h) */
  const r = rapport({ metier: METIERS[0], symbole: 'CLOUD', vie: null });
  const t = JSON.stringify(r);
  assert.ok(!/never traded/.test(t), 'the job report still claims « never traded »: ' + t.slice(0, 200));
  assert.match(t, /no market cap read on TokenizedBlock/);
});

await cas('6. review : Liquidity du panneau, puces de la fiche et ligne Trending montrent le CASH d une pool trop mince', () => {
  const aides = ['valeurDeLigneMarche', 'texteLiquiditeMarche', 'chipsValeurMarche'].map((x) => sourceDe(x));
  assert.ok(aides.every(Boolean), 'a helper is missing');
  const usdCourt = (v) => '$' + Math.round(Number(v));
  const chip = (k, v) => '[' + k + ': ' + v + ']';
  const H = new Function('valeurMarche', 'usdPhrase', 'usdCourt', aides.join('\n')
    + '\nreturn { texteLiquiditeMarche, chipsValeurMarche };')(P.valeurMarche, P.usdPhrase, usdCourt);
  const r = resumerTrending([paireCloud, paireHonnete], [CLOUD, HONNETE]);
  const c = r.lignes.find((x) => x.sym === 'CLOUD'), h = r.lignes.find((x) => x.sym === 'HON');
  assert.equal(H.texteLiquiditeMarche(c), '$4.11 cash', 'the control panel LIQUIDITY is not the cash');
  assert.ok(!/7595209731|9494012163/.test(H.chipsValeurMarche(c, chip)), 'the map card chips show the paper value: ' + H.chipsValeurMarche(c, chip));
  assert.match(H.chipsValeurMarche(c, chip), /too thin to trust/);
  assert.equal(H.texteLiquiditeMarche(h), '$1701179', 'an honest pool lost its liquidity');
  assert.equal(H.texteLiquiditeMarche(undefined), '—');
  /* the Trending row reads the server flag itself */
  const tr = sourceDe('peindreTrending') || '';
  assert.match(tr, /l\.liquiditePapier === true \? usdCourt\(l\.profondeurUsd\)/, 'the Trending row still shows the paper mark');
});

await cas('7. review : un block a DEUX pools dont une illisible garde un cash « non lu », jamais une somme partielle', () => {
  const autre = { ...paireHonnete, pairAddress: '0x' + '2'.repeat(40), baseToken: { ...paireCloud.baseToken },
    quoteToken: { address: '0x' + '3'.repeat(40), name: 'Odd', symbol: 'ODD' }, priceNative: null,
    liquidity: { usd: 10, base: 1, quote: 1 } };
  const r = resumerTrending([paireCloud, autre], [CLOUD]);
  const c = r.lignes.find((x) => x.sym === 'CLOUD');
  assert.equal(c.profondeurUsd, null, 'a partial cash sum is given as the whole: ' + c.profondeurUsd);
  assert.equal(c.liquiditePapier, null, 'a verdict was given on an unread cash side');
});

await cas('3b. review : CLOUD deja POSE sur la map (habitant sans vie lue) n est pas classe non plus', () => {
  const src = sourceDe('classementCourant');
  const aide = sourceDe('valeurDeLigneMarche') || '';
  const r = resumerTrending([paireCloud, paireHonnete], [CLOUD, HONNETE]);
  const marcheParAdr = new Map(r.lignes.map((l) => [l.adr, l]));
  const habitants = [{ adr: CLOUD, sym: 'CLOUD', vie: null, devise: null }, { adr: HONNETE, sym: 'HON', vie: null, devise: null }];
  const cl = new Function('classer', 'habitants', 'vieEnUsd', 'marcheParAdr', 'valeurMarche',
    aide + '\n' + src + '\nreturn classementCourant();')(classer, habitants, () => null, marcheParAdr, P.valeurMarche);
  assert.ok(!cl.classes.some((b) => b.symbole === 'CLOUD'), 'a CLOUD already on the map is ranked on $4 of cash');
  assert.equal(cl.classes[0] && cl.classes[0].symbole, 'HON');
  const c = cl.nonMesures.find((b) => b.symbole === 'CLOUD');
  assert.ok(c && c.mince === true && /too thin to trust/.test(c.pourquoi), 'CLOUD on the map unranked without its reason');
});

await cas('8. review (pin par lecture du source, pas une execution) : le pli ne dessine jamais une ligne vide', () => {
  const src = sourceDe('peindrePnlSwaps') || '';
  assert.match(src, /const priv = \(r\.lignesPrivees \|\| \[\]\)\.filter\(\(x\) => typeof x === 'string' && x\.trim\(\)\)/,
    'the fold draws the module lines unfiltered');
});

await cas('9. second pass : cerveau (repli serveur), stades, vision, taille du cube — le cash, jamais la valeur papier', async () => {
  const r = resumerTrending([paireCloud, paireHonnete], [CLOUD, HONNETE]);
  const c = r.lignes.find((x) => x.sym === 'CLOUD'), h = r.lignes.find((x) => x.sym === 'HON');
  /* the brain fallback: run vieServeurPourCerveau + serverLifeOf as the page has them */
  const tranche = app.slice(app.indexOf('function vieServeurPourCerveau('), app.indexOf('function rememberServerLife('));
  const vie = new Function('marcheParAdr', tranche + '\nreturn vieServeurPourCerveau;')(new Map([[CLOUD, c], [HONNETE, h]]));
  assert.ok(Math.abs(vie(CLOUD) - 4.11) < 0.01, 'the brain is fed a paper size for CLOUD: ' + vie(CLOUD));
  assert.equal(vie(HONNETE), 10369601, 'an honest block lost its size');
  /* even a row from an older server (paper FDV still in it) gives the brain the cash */
  assert.ok(Math.abs(vie.call(null, CLOUD) - 4.11) < 0.01);
  const vieVieux = new Function('marcheParAdr', tranche + '\nreturn vieServeurPourCerveau;')(new Map([[CLOUD, { ...c, fdvUsd: 9494012163 }]]));
  assert.ok(Math.abs(vieVieux(CLOUD) - 4.11) < 0.01, 'a paper FDV in the row reaches the brain');
  /* the Stages lists and the default valuation take the value through the rule, never .fdvUsd raw */
  const code = app.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/\|\| \{\}\)\.fdvUsd \?\? null/.test(code), 'a Stages list still reads the raw FDV');
  assert.equal((code.match(/capUsdMarche: valeurDeLigneMarche\(marcheParAdr\.get\(/g) || []).length, 2, 'the two Stages lists do not use the rule');
  assert.match(code, /if \(Number\.isFinite\(fdv\) && fdv > 0 && valeurDeLigneMarche\(mk\)\.valeurUsd !== null\)/, 'the default valuation takes a paper FDV');
  /* the brain's own screen: a thin row carries its cash and no valuation */
  const { champ } = await import('./vision-cerveau.js');
  const mc = champ({ adr: CLOUD, marche: { ...c, fdvUsd: 9494012163 } }).contexte.marche;
  assert.ok(Math.abs(mc.liquiditeUsd - 4.11) < 0.01, 'the brain screen shows a paper liquidity: ' + mc.liquiditeUsd);
  assert.equal(mc.fdvUsd, null, 'the brain screen shows a paper valuation');
  assert.equal(mc.mince, true);
  const mh = champ({ adr: HONNETE, marche: h }).contexte.marche;
  assert.equal(mh.fdvUsd, 10369601); assert.equal(mh.liquiditeUsd, 1701179); assert.equal(mh.mince, false);
  assert.match(app, /not valued: its pool holds too little cash to price it/);
  /* the cube: sized by its cash (source pin — the map loop is not runnable alone) */
  assert.match(app, /const usdTaille = vmTaille\.mince === true \? vmTaille\.profondeurUsd : l\.fdvUsd;/);
});

await cas('10. review (browser scan, 1077 px) : the Create pair list never says « CLOUD — $7.5B liquidity », nor sorts Trending by a paper mark', () => {
  /* measured in the review's browser scan: <select id="cPaire"> held « CLOUD — $7.5B liquidity — through its currency » — the paper
   *   mark, proposed first as the deepest pair a new block could take */
  const src = sourceDe('blocksDecouverts');
  assert.ok(src, 'blocksDecouverts not found');
  const AUTRE_B = '0xb200000000000000000000000000000000000abc';
  const marche = new Map([
    [CLOUD, { sym: 'CLOUD', prixUsd: 0.0094, liquiditeUsd: 7528410961, profondeurUsd: 4.11, liquiditePapier: true }],
    [AUTRE_B, { sym: 'REAL', prixUsd: 0.5, liquiditeUsd: 20000, profondeurUsd: 10000, liquiditePapier: false }],
  ]);
  const f = new Function('pairesProposees', 'CHAINE', 'marcheParAdr', 'LIQ_MIN_BUY_USD', 'PAIRES_DECOUVERTES_MAX', 'return ' + src + ';')(
    () => [], 8453, marche, 500, 40);
  const out = f();
  assert.ok(!out.some((b) => b.adr === CLOUD), 'a pool holding $4.11 of cash is proposed as a pair: ' + JSON.stringify(out.map((b) => [b.symbole, b.liq])));
  assert.deepEqual(out.map((b) => [b.symbole, b.liq]), [['REAL', 20000]]);
  /* a paper row with real cash above the floor: proposed, labelled by its CASH */
  marche.get(CLOUD).profondeurUsd = 900;
  const out2 = f();
  assert.equal(out2.find((b) => b.adr === CLOUD).liq, 900, 'the paper mark is the label again');
  /* the Trending « liq » sort reads the same cash */
  assert.ok(app.includes("liq: (l) => (l.liquiditePapier === true ? Number(l.profondeurUsd) || 0 : l.liquiditeUsd) }[trTri]"), 'the Trending liq sort reads the paper mark');
});

const TOTAL = 17;
console.log('\ntest-block-panel-376 : ' + n + ' green, ' + rouges.length + ' red, of ' + TOTAL);
if (rouges.length || n !== TOTAL) { console.log('RED: ' + rouges.join(' | ')); process.exit(1); }
console.log('⚠️ DOES NOT PROVE that DexScreener answers today, nor that prod runs this code until it is deployed.');
