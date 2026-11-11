/* test-tblock-reel-20261111.mjs — game354 (Phil 2026-11-11: "the new TBLOCK is the right one and must be everywhere; leaving the old one is a
 *   serious error"). AFFIRME on the REAL files:
 *   - tokenomics.TBLOCK is the real token (0xb200…ba9bf8330307f8830e) — the same as every other module that names TBLOCK;
 *   - the old test token (…24c30d…272e) is only TBLOCK_TEST_ANCIEN, masked, imported under the old name ONLY by the legacy pool readers, each
 *     with its note; it never carries the symbol "TBLOCK" in the pair registry; the map and the search never list it;
 *   - no code file outside tokenomics.js / paires.js / recherche-b20.js writes the old address.
 * NE PROUVE PAS: how each legacy reader behaves on chain (their own benches run in the series). */
import { readFileSync, readdirSync } from 'node:fs';
const lire = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const REEL = '0xb200000000000000000000ba9bf8330307f8830e', ANCIEN = '0xb20000000000000000000024c30d3fcb7931272e';
let ok = 0, ko = 0;
const t = (m, c, x = '') => { if (c) ok++; else { ko++; console.log('KO', m, x); } };
const T = await import('./tokenomics.js');
t('tokenomics.TBLOCK = the real token', T.TBLOCK === REEL);
t('the old one only as TBLOCK_TEST_ANCIEN, masked', T.TBLOCK_TEST_ANCIEN === ANCIEN && T.estJetonMasque(ANCIEN) && T.estJetonMasque(ANCIEN.toUpperCase().replace('0X', '0x')) && !T.estJetonMasque(REEL));
t('the same real TBLOCK in economie.js, lock.js, tblock-hold.js', [lire('economie.js'), lire('lock.js'), lire('tblock-hold.js')].every((s) => s.toLowerCase().includes(REEL)));
const P = await import('./paires.js');
const vieux = (P.DEVISES_BASE || []).find((d) => String(d.adr).toLowerCase() === ANCIEN);
t('pair registry: the old token is NOT named "TBLOCK" and never proposed', !!vieux && vieux.symbole !== 'TBLOCK' && vieux.lancePubliquement === false);
t('pair registry: nothing proposed carries the symbol TBLOCK with the old address', !P.pairesProposees(8453).some((p) => String(p.adr).toLowerCase() === ANCIEN));
const reelReg = (P.DEVISES_BASE || []).find((d) => d.symbole === 'TBLOCK');
t('pair registry: the name TBLOCK is held by the REAL token (= tokenomics.TBLOCK), known, never proposed', !!reelReg && String(reelReg.adr).toLowerCase() === T.TBLOCK && reelReg.lancePubliquement === false
  && !P.pairesProposees(8453).some((p) => String(p.adr).toLowerCase() === REEL));
const { symboleTrompeur } = await import('./symbole-trompeur.js');
t('name guard: a FAKE TBLOCK is flagged, the real one is free', symboleTrompeur('TBLOCK', '0xb2' + '0'.repeat(37) + '9', P.DEVISES_BASE).verdict !== 'LIBRE' && symboleTrompeur('TBLOCK', REEL, P.DEVISES_BASE).verdict === 'LIBRE');
t('the birth review states the fixed ETH amounts, as part of the $5', lire('app.html').includes('Step 2, the birth: 0.001 ETH (inside the total above), signed in two parts: 0.0007 ETH when you create, then 0.0003 ETH'));
const R = lire('recherche-b20.js');
t('search: the old token is skipped, with the address copied from tokenomics', R.includes("const TBLOCK_TEST_ANCIEN_RECHERCHE = '" + ANCIEN + "';") && /if \(adr === TBLOCK_TEST_ANCIEN_RECHERCHE\) continue;/.test(R));
const { construireIndex } = await import('./recherche-b20.js');
const ix = construireIndex([{ nom: 'x', entrees: [{ adr: ANCIEN, sym: 'TBLOCK' }, { adr: REEL, sym: 'TBLOCK' }] }]);
const adrs = JSON.stringify(ix).toLowerCase();
t('search index built from both: only the real one is in it', adrs.includes(REEL) && !adrs.includes(ANCIEN));
const APP = lire('app.html');
t('map: a masked token never gets a place', /function aSaPlaceSurLaCarte\(c\) \{\n[^\n]*\n  if \(c && estJetonMasque\(c\.jeton\)\) return false;/.test(APP));
t('map: a live CREATION of a masked token is not drawn', /if \(!habitantDe\(e\.jeton\) && !estJetonMasque\(e\.jeton\)\) creerHabitant\(/.test(APP));
const LEGACY = ['fil-live.js', 'lancer-pool-v2.js', 'liquidite.js', 'marche.js', 'origine.js', 'pool-sans-hook.js', 'pools-du-jeton.js', 'app.html'];
for (const f of LEGACY) t(f + ': imports the OLD token under the old name only with its note', /TBLOCK_TEST_ANCIEN as TBLOCK[^\n]*game354: in this file TBLOCK = the OLD test token/.test(lire(f)));
/* no other code file writes the old address */
const autorises = new Set(['tokenomics.js', 'paires.js', 'recherche-b20.js']);
const code = readdirSync(new URL('./', import.meta.url)).filter((f) => /\.(js|html)$/.test(f) && !/^(test-|banc-|mesure-)/.test(f));
const fautifs = code.filter((f) => !autorises.has(f) && lire(f).toLowerCase().includes(ANCIEN));
t('no other code file writes the old address', fautifs.length === 0, fautifs.join(', '));
const FL = lire('fil-live.js');
t('fil-live never names the old token "TBLOCK"', /return \{ nom: 'old test TBLOCK', dec: 18 \};/.test(FL) && !/return \{ nom: 'TBLOCK', dec: 18 \}/.test(FL));
/* ── the 2026-11-11 multi-agent review (21 confirmed findings) — each one pinned ── */
const has = (s, x) => s.includes(x);
t('review HIGH: the genesis set never holds a masked token', has(APP, 'let nosSet = new Set(NOS_BLOCKS_GENESE.filter((a) => !estJetonMasque(a)));'));
t('review HIGH: poserNosBlocks drops masked tokens before drawing', /for \(const a of \[\.\.\.vus\]\) if \(estJetonMasque\(a\)\) vus\.delete\(a\);[\s\S]*?\r?\n  nosSet = vus;\r?\n  for \(const adr of nosSet\) \{/.test(APP));
t('review HIGH: the old token is never labelled TBLOCK in the genesis map', !has(APP, "[NOS_BLOCKS_GENESE[0]]: 'TBLOCK'"));
t('review HIGH: the word TBLOCK resolves to the REAL token', has(APP, "if (/^tblock$/i.test(r)) return { ok: true, adr: TBLOCK_REEL.toLowerCase(), sym: 'TBLOCK' };") && has(APP, 'TBLOCK as TBLOCK_REEL'));
t('review HIGH: name lookups never resolve a masked token', has(APP, 'if (!/^0x[0-9a-f]{40}$/.test(k) || estJetonMasque(k)) return;') && has(APP, '=== haut && !estJetonMasque(l.adr))'));
t('review MEDIUM: profile labels say "old test TBLOCK", never the bare TBLOCK', has(APP, "return ' · via the old test TBLOCK';") && has(APP, 'Liquidity · old test TBLOCK pair') && has(APP, 'Quote side is the old test TBLOCK'));
const MA = lire('marche.js');
t('review: marche.js legacy labels relabelled (9)', MA.split("via: 'old test TBLOCK · ").length - 1 === 9 && !has(MA, "via: 'TBLOCK · "));
t('review: echange.js reads the legacy routes on the OLD token', has(lire('echange.js'), 'TBLOCK_TEST_ANCIEN as TBLOCK') && has(lire('echange.js'), 'game354: in this file TBLOCK = the OLD test token'));
t('review: the generic router refuses BOTH tokens named TBLOCK', has(lire('pool-sans-hook.js'), 'const BLOCKS_TB = new Set([bas(TBLOCK), bas(TBLOCK_REEL), bas(TBGAS)]);'));
const SRVr = lire('serveur-web.js');
t('review: the fee-claim seed reads the token our legacy hooks are paired with', has(SRVr, 'const amorce = [USDC_BASE.toLowerCase(), String(TBLOCK_TEST_ANCIEN).toLowerCase()];'));
t('review: /api/chercher never returns a masked token', has(SRVr, '.filter((e) => !estJetonMasque(e && (e.adr || e.jeton)))); /* game354'));
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
