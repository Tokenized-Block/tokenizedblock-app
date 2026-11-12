/* test-ui-verites-377-20261112.mjs — four small UI truths (game377):
 *   1. "Hearts: 10 points each." was no longer exact: points.js#pointsJeu gives 1 point per 8,600 TBLOCK BURNED, and a heart burns what the
 *      hearts contract's likePrice says now (read live 2026-11-12: 92,996 TBLOCK = 10.8 points). The rule says the burn rule, from points.js,
 *      and the points of one heart only from a likePrice the page read (app: the vault painter; holders.html: lireRegles).
 *   2. holders.html: "2,789,880 TBLOCK locked ≈ $14.65" under a "$15" rule. The need is $15 at the CONTRACT price = minHold; the ≈ is the POOL.
 *   3. app Wallet tab: connecting (or changing account) left "Connect your wallet to see your TBLOCK lock." until the tab was reopened —
 *      peindreLock ran only from peindreVaultWallet (60 s pace). wLockSuitCompte repaints the lock card (and the points) once per account.
 *   4. TAM: an explorer work said "Distinct from the minted works: yes (no minted work to compare with yet)" while works were minted (the
 *      card got nMintees 0 without a brain choice). It now says the server checks it at Mint against the N works the tab read.
 * AFFIRME: by running points-vue.js and tam-vue.js, and the extracted besoinVerrou / wLockSuitCompte on fakes; the wiring on the source.
 * NE PROUVE PAS: a real wallet, a real node (the browser check of 2026-11-12 does, on a local server).
 * Usage: node test-ui-verites-377-20261112.mjs            -> the tree, then 11 mutants (each must turn it red)
 *        node test-ui-verites-377-20261112.mjs <dir>      -> the five files read from <dir> (proof: RED on the pre-fix files) */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const NOMS = ['points-vue.js', 'holders.html', 'app.html', 'tam-vue.js', 'tam-onglet.js'];
const lireDe = (dir) => Object.fromEntries(NOMS.map((f) => [f, readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n')]));
const PL = await import('./points.js');
const TM = await import('./tam-moteur.js');

/* a module text, imported from a temp copy whose relative imports point back at this tree */
let TMP = null, nImp = 0;
async function importer(nom, texte) {
  if (!TMP) TMP = mkdtempSync(path.join(tmpdir(), 'v377-'));
  const f = path.join(TMP, (nImp++) + '-' + nom);
  writeFileSync(f, texte.replace(/from '\.\/([^']+)'/g, (_, x) => "from '" + pathToFileURL(path.join(ICI, x)).href + "'"));
  return import(pathToFileURL(f).href);
}
/* the source of one function declaration (braces counted outside quotes and comments) */
function fonction(src, debut) {
  const i = src.indexOf(debut); if (i < 0) return null;
  let k = src.indexOf(') {', i) + 2, n = 0, q = null; /* the body, after the parameters (peindreLock destructures one) */
  for (; k < src.length; k++) {
    const ch = src[k];
    if (q) { if (ch === '\\') k++; else if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { q = ch; continue; }
    if (ch === '/' && src[k + 1] === '*') { k = src.indexOf('*/', k + 2) + 1; continue; }
    if (ch === '{') n++; else if (ch === '}') { n--; if (n === 0) return src.slice(i, k + 1); }
  }
  return null;
}
const tranche = (src, a, b) => { const i = src.indexOf(a); if (i < 0) return ''; const j = src.indexOf(b, i + a.length); return j < 0 ? '' : src.slice(i, j); };

async function verifier(F) {
  const fautes = [];
  const t = (m, c, x = '') => { if (!c) fautes.push(m + (x ? ' :: ' + String(x).slice(0, 200) : '')); };
  const tente = async (m, f) => { try { await f(); } catch (e) { fautes.push(m + ' :: threw ' + String((e && e.message) || e).slice(0, 160)); } };

  /* ── 1. the points rule ── */
  await tente('1 points-vue.js imports', async () => {
    const PV = await importer('points-vue.js', F['points-vue.js']);
    t('1a the rule says the burn rule from points.js, never "10 points each"', typeof PV.REGLE_COURTE === 'string' && PV.REGLE_COURTE.includes('Hearts: 1 point per 8,600 TBLOCK burned') && !/10 points/.test(PV.REGLE_COURTE), PV.REGLE_COURTE);
    const LIVE = '92996006843756668224507'; /* likePrice read on Base 2026-11-12 (Hearts, economie-pack.js) */
    const avec = typeof PV.regleCourte === 'function' ? PV.regleCourte(LIVE) : '';
    t('1b with the read likePrice: "about 10.8 points a heart at the hearts contract price now"', avec.includes('Hearts: 1 point per 8,600 TBLOCK burned (about 10.8 points a heart at the hearts contract price now).'), avec);
    t('1c without a read price (null, undefined, 0, garbage): the burn rule alone, no number for a heart', typeof PV.regleCourte === 'function' && [null, undefined, '0', 'x'].every((p) => !/about|points a heart/.test(PV.regleCourte(p))) && PV.regleCourte(null) === PV.REGLE_COURTE);
    t('1d one heart = points.js#pointsJeu of its price (the same rule as the board)', typeof PV.pointsParCoeur === 'function' && ['86000000000000000000000', LIVE, '8600000000000000000000'].every((p) => PV.pointsParCoeur(p) === PL.pointsJeu(p)) && PV.pointsParCoeur('8600000000000000000000') === 1);
    const zero = PV.lignesMesPoints({ ok: true, complet: true, compte: { total: 0 } }, (x) => x)[0].v; /* 2026-11-12: a zero is "none yet" only once the index is complete */
    t('1e zero points: how a heart counts, not "for 10"', !/for 10\b/.test(zero) && zero.includes('1 point per 8,600 TBLOCK it burns'), zero);
  });
  const APP = F['app.html'], H = F['holders.html'];
  const ptsW = fonction(APP, 'async function peindrePointsWallet(') || '';
  t('1f app: the points rule is painted from the read heart price', ptsW.includes("$('#wPointsRegle').textContent = PV.regleCourte(wLikePrix);") && !ptsW.includes('PV.REGLE_COURTE'), ptsW.slice(-300));
  const vaultW = fonction(APP, 'async function peindreVaultWallet(') || '';
  t('1g app: the vault painter reads likePrice from Hearts (non-fatal) and waits for it before painting', /const lirePrixCoeur = lit\(EP\.VIEW\.likePrice\(\)\)\.then\(\(p\) => \{ wLikePrix = p; \}, \(\) => \{/.test(vaultW) && vaultW.indexOf('await lirePrixCoeur;') > vaultW.indexOf('const lirePrixCoeur'));
  t('1h holders: the rule is painted with regles.likePrice, after the rules were read', H.includes("function peindreReglePoints() { $('#vuePointsRegle').textContent = regleCourte(regles ? regles.likePrice : null); }")
    && /await lireRegles\(\);\n  peindrePerks\(\);\n  peindreReglePoints\(\);/.test(H) && !H.includes('REGLE_COURTE'));
  t('1i no "10 points each" / "a heart for 10" left on screen (app, holders, points-vue)', ![APP, H, F['points-vue.js']].some((s) => /Hearts: 10 points each|send a heart for 10/.test(s)));

  /* ── 2. holders: $ at the contract price = TBLOCK locked (≈ pool price) ── */
  await tente('2 besoinVerrou runs', async () => {
    const src = fonction(H, 'function besoinVerrou(');
    t('2a besoinVerrou exists in holders.html', !!src);
    const f = new Function(src + '; return besoinVerrou;')();
    t('2b the need, said plainly', f('$15', '2,789,880', '$14.65') === '$15 at the contract price = 2,789,880 TBLOCK locked (≈\u00a0$14.65 at the pool price now)', f('$15', '2,789,880', '$14.65'));
    t('2c pool price not read: no ≈; contract dollars not read: the amount alone', f('$15', '2,789,880', '') === '$15 at the contract price = 2,789,880 TBLOCK locked' && f('', '2,789,880', '') === '2,789,880 TBLOCK locked');
  });
  const perks = fonction(H, 'function peindrePerks(') || '';
  t('2d the heart row AND the vault row say it (besoin(R)), built from HOLD_USD, minHold and the pool price', (perks.match(/besoin\(R\), l != null/g) || []).length === 2
    && perks.includes("const besoin = (R) => besoinVerrou(R.holdUsd != null ? EP.usd(R.holdUsd) : '', tok(R.minHold), u ? fmtUsd(Number(BigInt(R.minHold) / 10n ** 18n) * u) : '');")
    && !perks.includes("tok(R.minHold) + ' TBLOCK locked'"));

  /* ── 3. app: the lock card follows the connected wallet ── */
  await tente('3 wLockSuitCompte runs', async () => {
    const src = fonction(APP, 'function wLockSuitCompte(');
    t('3a wLockSuitCompte exists', !!src);
    const h = { dataset: { compte: '' }, hidden: false }, carte = { hidden: false }, vol = { offsetParent: {} };
    const S = { compte: null, document: { hidden: false }, LK: { LOCK: '0x' + '11'.repeat(20) }, lockEtat: { enVol: false }, appels: [], points: 0 };
    S.$ = (q) => ({ '#wLock': h, '#wVault': carte, '#v-wallet': vol })[q] || null;
    S.peindreLock = async (x) => { S.appels.push({ x, lu: x.dataset.lu }); };
    S.peindrePointsWallet = async () => { S.points++; };
    const f = new Function('S', 'with (S) { ' + src + '; return wLockSuitCompte; }')(S);
    f(); t('3b no wallet, card already says connect: nothing read', S.appels.length === 0 && S.points === 0);
    S.compte = '0x' + 'AB'.repeat(20); f();
    t('3c connect while the tab is open: the lock card is read AT ONCE, its throttle reset, the points repainted', S.appels.length === 1 && S.appels[0].x === h && S.appels[0].lu === '0' && S.points === 1, JSON.stringify(S.appels.map((a) => a.lu)));
    h.dataset.lu = '999'; f();
    t('3d that read failed or is in flight: asked again on the next tick, but its own throttle kept (lu not reset), points not refetched', S.appels.length === 2 && S.appels[1].lu === '999' && S.points === 1);
    h.dataset.compte = S.compte.toLowerCase(); f();
    t('3e once painted for this wallet: nothing more', S.appels.length === 2);
    S.compte = '0x' + 'CD'.repeat(20); f();
    t('3f account change: read again for the new wallet', S.appels.length === 3 && S.appels[2].lu === '0' && S.points === 2);
    h.dataset.compte = S.compte.toLowerCase();
    vol.offsetParent = null; S.compte = '0x' + 'EF'.repeat(20); f();
    t('3g Wallet tab closed: nothing read', S.appels.length === 3);
    vol.offsetParent = {}; S.lockEtat.enVol = true; f();
    t('3h a lock read in flight: wait for the next tick', S.appels.length === 3);
    S.lockEtat.enVol = false; f();
    t('3i tab open again: read for the wallet connected now', S.appels.length === 4 && S.appels[3].lu === '0');
    h.dataset.compte = S.compte.toLowerCase(); S.compte = null; f();
    t('3j disconnect: repainted (to "Connect your wallet")', S.appels.length === 5);
    h.hidden = true; h.dataset.compte = ''; S.compte = '0x' + '12'.repeat(20); f();
    t('3k card never shown yet: the vault painter paints it first', S.appels.length === 5);
  });
  const conn = fonction(APP, 'async function connecter(') || '';
  t('3l connecter() calls it once the account is known', /compte = \(comptes && comptes\[0\]\) \|\| null;/.test(conn) && conn.indexOf('void majWallet();') > 0 && conn.indexOf('wLockSuitCompte();') > conn.indexOf('void majWallet();'));
  const acc = tranche(APP, "window.ethereum.on('accountsChanged', (accs) => {", '\n  });');
  t('3m an account change in the wallet calls it', acc.includes('compte = (accs && accs[0]) || null;') && acc.indexOf('wLockSuitCompte();') > acc.indexOf('compte = (accs'));
  t('3n the 5 s tick calls it too (covers a connect from another tab)', APP.includes('setInterval(() => { try { wLockSuitCompte(); } catch (_) { /* next tick */ } void peindreVaultWallet().catch(() => {}); }, 5000);'));
  const lock = fonction(APP, 'async function peindreLock(') || '';
  t('3o peindreLock records the account it painted (and "" for the connect message)', lock.includes("if (!compte) { hote.textContent = ''; hote.dataset.compte = '';") && lock.includes('hote.dataset.lu = String(Date.now()); hote.dataset.compte = moi;'));
  t('3p the vault reads keep their 60 s pace', vaultW.includes('Date.now() - wVaultLu < 60000) return;') || vaultW.includes('Date.now() - wVaultLu < 60000 && pour === wVaultPour)) return;') /* merge game378: the pace is per wallet (lot 378) */);

  /* ── 4. TAM: distinct from the minted works ── */
  await tente('4 tam-vue.js imports', async () => {
    const V = await importer('tam-vue.js', F['tam-vue.js']);
    const P = TM.structurer({ famille: 'lorenz' }), c = TM.certifier(TM.generer(P), []);
    const d = (o) => (V.carte({ P, c, ...o }).find((x) => x.k === 'Distinct from the minted works') || {}).v || '';
    t('4a explorer work, 3 minted works read: never "no minted work"', d({ minteesLues: 3 }) === 'checked when you press Mint: the server compares it with the 3 minted works (threshold 0.20)', d({ minteesLues: 3 }));
    t('4b explorer work, minted works not read yet: checked at Mint, against every minted work', d({}) === 'checked when you press Mint: the server compares it with every minted work (threshold 0.20)' && d({ minteesLues: null }) === d({}), d({}));
    t('4c one minted work: singular', d({ minteesLues: 1 }).includes('the 1 minted work ('));
    t('4d explorer work, the tab read 0 minted works: "no minted work to compare with yet" stays true', d({ minteesLues: 0 }) === 'yes (no minted work to compare with yet)');
    const ch = { graine: '0x' + '1'.repeat(64), bloc: 1, empreinteEtat: '0x' + '2'.repeat(64), essai: 1, rejets: [] };
    t('4e a brain choice keeps what the SERVER compared (j.comparees)', d({ choix: ch, nMintees: 3, minteesLues: 0 }).includes('over 3 works') && d({ choix: ch, nMintees: 0, minteesLues: 5 }) === 'yes (no minted work to compare with yet)');
  });
  const TO = F['tam-onglet.js'];
  const pc = fonction(TO, 'function peindreCarte(') || '';
  t('4f the tab passes the minted works it read to the card', pc.includes('V.carte({ P: S.P, c, choix: S.choix, nMintees: S.choix ? S.nMintees : 0, minteesLues: S.minteesLues });'));
  const gal = fonction(TO, 'async function galerie(') || '';
  t('4g the gallery records the count only when every collection was read, uncapped (totalSupply n, not the 60 shown)', gal.includes('S.minteesLues = toutLu ? total : null;') && gal.includes('total += n;') && gal.includes('ids = []; toutLu = false;') && gal.includes('} else total += ids.length;'));
  t('4h the gallery no longer overwrites what the server compared a brain choice with', !gal.includes('S.nMintees = cartes.length'));
  t('4i the card is repainted once the gallery is read', gal.includes('if (S.P && !S.science) { try { peindreCarte(); }'));
  return fautes;
}

const MUTANTS = [
  ['points-vue.js', "Hearts: 1 point per '\n", "Hearts: 10 points each; 1 point per '\n"],
  ['points-vue.js', "(x !== null ? ' (about '", "(false ? ' (about '"],
  ['app.html', 'PV.regleCourte(wLikePrix);', 'PV.regleCourte(null);'],
  ['holders.html', "(poolUsdTexte ? ' (≈\\u00a0' + poolUsdTexte + ' at the pool price now)' : '')", "(poolUsdTexte ? ' ≈ ' + poolUsdTexte : '')"],
  ['holders.html', "'its rules are read from the vault contract', besoin(R), l != null", "'its rules are read from the vault contract', tok(R.minHold) + ' TBLOCK locked', l != null"],
  ['app.html', "if ((h.dataset.compte || '') === c) return;", 'if (true) return;'],
  ['app.html', "{ h.dataset.demande = c; h.dataset.lu = '0'; void peindrePointsWallet(); }", '{ h.dataset.demande = c; void peindrePointsWallet(); }'],
  ['app.html', "  void majWallet();\n  try { wLockSuitCompte(); } catch (_) { /* game377: the 5 s tick repaints the lock card */ }\n  /* tip 2026", "  void majWallet();\n  /* tip 2026"],
  ['tam-vue.js', ": choix ? 'yes (no minted work to compare with yet)' : distinctExplorateur(minteesLues) });", ": 'yes (no minted work to compare with yet)' });"],
  ['tam-onglet.js', 'minteesLues: S.minteesLues });', 'minteesLues: 0 });'],
  ['tam-onglet.js', 'total += n;', 'total += ids.length;'],
];

const dir = process.argv[2];
let code = 0;
if (dir) {
  const f = await verifier(lireDe(path.resolve(dir)));
  for (const x of f) console.log('KO', x);
  console.log(dir + ': ' + (f.length ? f.length + ' check(s) failed — RED' : 'all checks hold — green'));
  code = f.length ? 1 : 0;
} else {
  const F = lireDe(ICI);
  const f = await verifier(F);
  for (const x of f) console.log('KO', x);
  console.log('tree: ' + (f.length ? f.length + ' check(s) failed' : 'all checks hold'));
  let tues = 0;
  for (const [nom, a, b] of MUTANTS) {
    const n = F[nom].split(a).length - 1;
    if (n !== 1) { console.log('KO mutant anchor not unique (' + n + ') in ' + nom + ': ' + a.slice(0, 80)); code = 1; continue; }
    const fm = await verifier({ ...F, [nom]: F[nom].replace(a, () => b) });
    if (fm.length) tues++; else console.log('KO mutant survived in ' + nom + ': ' + a.slice(0, 80));
  }
  console.log('MUTANTS: ' + tues + '/' + MUTANTS.length + ' killed');
  code = f.length || tues !== MUTANTS.length ? 1 : code;
  console.log(code ? 'RED' : 'GREEN: all checks hold, ' + tues + '/' + MUTANTS.length + ' mutants killed');
}
if (TMP) rmSync(TMP, { recursive: true, force: true });
process.exit(code);
