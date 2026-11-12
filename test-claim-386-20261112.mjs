/* test-claim-386-20261112.mjs — game386 (Phil 2026-11-12): Wallet → Holders → "Claim and details" opened the block contest; it opens
 *   claim.html now, a page that sticks to claim and details (claim-vue.js decides, envoi.js opens the wallet).
 *
 * WHAT IT CHECKS
 *   A  WIRING   the app's "Claim and details" goes to /claim.html; the block contest keeps its own link; claim.html and claim-vue.js are
 *               served (SERVIS) with every module they import; claim.html carries the app's design tokens (:root and the three colour
 *               variants, equal to app.html) and its colour choice (tb.teinte); the page never opens the wallet itself: its only send is
 *               envoi.js inside claim-vue.js executerClaim; no internal version name or "not deployed" wording; no fee wallet raw.
 *   B  ENCODERS V.claim(e), R.claim(uint256[]), V/R closeEpoch(k) byte for byte against `cast calldata` (constants recorded from cast
 *               1.x on 2026-11-12, recomputed live when cast is on PATH); the custom errors against `cast sig`; the event topics against
 *               `cast keccak`; the signatures exist in contracts/src; the addresses are the deployed record's.
 *   C  DECIDING each week / month state, the 14-day window boundary (claimable at closedAt + window - 1, refused at closedAt + window), the
 *               budget cap, the lock rule, the wrong-wallet refusal, and NOT READ NEVER 0 (a failed read is null and says "not read"; the
 *               three steps never tick on an unread lock; lireTout with failing reads leaves null, never 0).
 *   D  SENDING  executerClaim with a fake wallet and node: the account and chain are re-read (another account = refused before any call),
 *               the call is simulated with eth_call FROM the wallet BEFORE the wallet opens (a revert or a zero payout = never opened),
 *               then the receipt is judged: tx.from (or the smart account's UserOperationEvent), status, the exact call, and the token
 *               Transfer EMITTED BY THE TOKEN from the contract to the wallet of exactly what the contract's Claimed event says.
 *   E  MUTANTS  17 mutants of claim-vue.js and 2 of claim.html, each on a copy; the pristine files pass first; each mutant must fail.
 * RED BEFORE THE FIX: `node test-claim-386-20261112.mjs --app <app.html before game386>` fails A (href /contest.html), and without
 *   claim-vue.js / claim.html the suite cannot load at all.
 * NE PROUVE PAS: a real claim on Base (no week of the vault is closed before 2026-11-18); the wallet UI itself.
 * Usage: node test-claim-386-20261112.mjs [--app f] [--page f] [--module f] [--serveur f] [--no-mutants] */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const FICHIERS = { app: resolve(arg('--app') || join(ICI, 'app.html')), page: resolve(arg('--page') || join(ICI, 'claim.html')),
  module: resolve(arg('--module') || join(ICI, 'claim-vue.js')), serveur: resolve(arg('--serveur') || join(ICI, 'serveur-web.js')) };
const lire = (f) => readFileSync(f, 'utf8');
const tree = (f) => pathToFileURL(join(ICI, f)).href;

const G = '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b';
const AUTRE = '0x000000000000000000000000000000000000dead';
const BUNDLER = '0x1111111111111111111111111111111111111111';
const ENTRYPOINT = '0x0000000071727de22e5e9d8baf0edac6f37da032';

/* ── B: what cast answered (cast calldata / sig / keccak, 2026-11-12) ── */
const CAST = {
  calldata: [
    ['claim(uint256)', '0', '0x379607f50000000000000000000000000000000000000000000000000000000000000000'],
    ['claim(uint256)', '7', '0x379607f50000000000000000000000000000000000000000000000000000000000000007'],
    ['claim(uint256[])', '[1]', '0x6ba4c138000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001'],
    ['claim(uint256[])', '[0,1,23]', '0x6ba4c13800000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000017'],
    ['closeEpoch(uint256)', '3', '0xd16d90570000000000000000000000000000000000000000000000000000000000000003'],
  ],
  sig: { 'NotClosed()': '0x8b4b52de', 'WindowClosed()': '0x2f23cfcd', 'AlreadyClaimed()': '0x646cf558', 'HoldTooLow(uint256,uint256)': '0x634ac1af',
    'NotCommitted(uint256,uint256)': '0x38935fc7', 'NothingToClaim()': '0x969bf728', 'EpochNotOver(uint256)': '0xceffd82f', 'AlreadyClosed()': '0x9acb7e52',
    'EpochNotClosed(uint256)': '0xcafb62e8', 'EpochReleased(uint256)': '0xee2cf328', 'AlreadyClaimed(uint256)': '0xb3167bfa', 'NoWeight(uint256)': '0xce9cee52',
    'NotPlayed(uint256)': '0xb80084dd', 'TooManyEpochs()': '0x21252bb0', 'NoEpochs()': '0xa88e39ff', 'TransferFailed()': '0x90b8ec18', 'Reentrancy()': '0xab143c06',
    'Locked()': '0x0f2e5b6c', 'EpochNotEnded(uint256)': '0x193215e7', 'EpochOutOfOrder(uint256)': '0x02904404' },
  keccak: { Transfer: ['Transfer(address,address,uint256)', '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'],
    ClaimedV: ['Claimed(uint256,address,uint256,uint256)', '0xd9cb1e2714d65a111c0f20f060176ad657496bd47a3de04ec7c3d4ca232112ac'],
    ClaimedR: ['Claimed(address,uint256,uint256,uint256)', '0x9cdcf2f7714cca3508c7f0110b04a90a80a3a8dd0e35de99689db74d28c5383e'],
    EpochClosedV: ['EpochClosed(uint256,uint256,uint256)', '0x3428f1922d52d3ab526965ae4e179f144b5ab19dc9b9c862c0629ca20e1c7012'],
    EpochClosedR: ['EpochClosed(uint256,uint256,uint256,uint256,uint256)', '0x15813e2d12766f8f380c6962d45bb89981777e130776993d4284460fd2ffb0af'],
    UserOp: ['UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)', '0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f'] },
};
let castLive = null;
function cast(...a) { try { return execFileSync('cast', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 20000 }).trim(); } catch (_) { return null; } }

const w32 = (n) => BigInt(n).toString(16).padStart(64, '0');
const hx = (n) => '0x' + w32(n);
const tAdr = (a) => '0x' + String(a).toLowerCase().replace(/^0x/, '').padStart(64, '0');

/* load a module file: the tree's own file directly; a copy (mutant) with its relative imports pointed at the tree */
let nCopie = 0;
async function charger(fichier) {
  if (resolve(fichier) === join(ICI, 'claim-vue.js')) return import(pathToFileURL(fichier).href);
  const dir = mkdtempSync(join(tmpdir(), 'claim386-'));
  const src = lire(fichier).replace(/from '\.\/([^']+)'/g, (_, f) => "from '" + tree(f) + "'");
  const f = join(dir, 'claim-vue-' + (++nCopie) + '.js');
  writeFileSync(f, src);
  try { return await import(pathToFileURL(f).href); } finally { rmSync(dir, { recursive: true, force: true }); }
}

/* ═════════════════════════════════════ the suite (run on the real files, then on each mutant) ═════════════════════════════════════ */
async function suite(F, bavard) {
  let ok = 0; const ko = [];
  const t = (nom, cond, detail = '') => { if (cond) { ok++; if (bavard) console.log('  ok  ' + nom); } else { ko.push(nom + (detail ? ' — ' + detail : '')); if (bavard) console.log('KO  ' + nom + (detail ? '\n      ' + detail : '')); } };
  const essai = async (nom, f) => { try { await f(); } catch (e) { t(nom + ' (threw)', false, String((e && e.stack) || e).split('\n').slice(0, 3).join(' | ')); } };

  const CV = await charger(F.module);
  const EP = await import(tree('economie-pack.js'));
  const { ADRESSES_PACK_ECONOMIE_V2: A } = await import(tree('economie-v2-pack-deploye.js'));
  const { PACK_ECONOMIE_V2: PK } = await import(tree('economie-v2-pack-deploiement.js'));
  const { FEE_ADDRESSES } = await import(tree('frais-creation.js'));
  const ENV = await import(tree('envoi.js'));
  const HV = await import(tree('holders-vue.js'));

  /* ── A. wiring ── */
  await essai('A', async () => {
    const app = lire(F.app), page = lire(F.page), srv = lire(F.serveur);
    const bouton = [...app.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>\s*Claim and details\s*<\/a>/g)];
    t('A1 app: exactly one "Claim and details" link', bouton.length === 1, String(bouton.length));
    t('A2 app: "Claim and details" goes to /claim.html (not the block contest)', bouton.length === 1 && bouton[0][1] === '/claim.html', bouton[0] && bouton[0][1]);
    const versContest = [...app.matchAll(/<a\b[^>]*href="\/?contest\.html"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => m[1].trim());
    t('A3 app: the block contest keeps its own link, and no link to contest.html speaks of a claim', versContest.length >= 1 && versContest.every((x) => /contest/i.test(x) && !/claim/i.test(x)), JSON.stringify(versContest));
    const bloc = srv.match(/const SERVIS\s*=\s*\[([\s\S]*?)\];/);
    const servis = new Set(bloc ? [...bloc[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : []);
    t('A4 SERVIS serves claim.html and claim-vue.js', servis.has('claim.html') && servis.has('claim-vue.js'));
    t('A5 SERVIS: every quoted entry is a file name (an apostrophe in a comment would split the list)', [...servis].every((x) => /^[A-Za-z0-9_./-]+$/.test(x)), [...servis].filter((x) => !/^[A-Za-z0-9_./-]+$/.test(x)).slice(0, 3).join(' | '));
    const imports = (s) => [...s.matchAll(/(?:^|\s)import\s+(?:[^'";]*?from\s*)?['"]\.\/([^'"]+)['"]/g)].map((m) => m[1]);
    const manque = [], vus = new Set(), file = imports(page);
    while (file.length) { const f = file.shift(); if (vus.has(f)) continue; vus.add(f); if (!servis.has(f)) { manque.push(f); continue; } file.push(...imports(lire(join(ICI, f)))); }
    t('A6 every module claim.html imports (transitively) is served', manque.length === 0 && vus.has('claim-vue.js') && vus.has('envoi.js'), manque.join(', '));
    /* the design tokens: every custom property claim.html sets on :root has the app's value; the three variants are the app's, verbatim */
    const racine = (s) => { const m = /(?:^|\n):root\{([\s\S]*?)\n\}/.exec(s.replace(/\/\*[\s\S]*?\*\//g, '')); return m ? Object.fromEntries([...m[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((x) => [x[1], x[2].trim()])) : null; };
    const ra = racine(app), rp = racine(page);
    const ecarts = rp && ra ? Object.entries(rp).filter(([k, v]) => ra[k] !== v).map(([k, v]) => k + ' ' + v + ' vs ' + ra[k]) : ['not found'];
    t('A7 claim.html :root tokens equal app.html (' + (rp ? Object.keys(rp).length : 0) + ' tokens)', rp && Object.keys(rp).length >= 20 && ecarts.length === 0, ecarts.join('; '));
    const variante = (s, k) => { const m = new RegExp(':root\\[data-teinte="' + k + '"\\]\\{([^}]*)\\}').exec(s); return m ? m[1].replace(/\s+/g, '') : null; };
    t('A8 the three colour variants b, c, d equal app.html', ['b', 'c', 'd'].every((k) => variante(page, k) && variante(page, k) === variante(app, k)));
    t('A9 claim.html reads the colour chosen in the app (localStorage tb.teinte)', /localStorage\.getItem\('tb\.teinte'\)/.test(page) && /localStorage\.getItem\('tb\.teinte'\)/.test(app));
    const script = (page.match(/<script type="module">([\s\S]*?)<\/script>/) || [])[1] || '';
    t('A10 the page never opens the wallet itself (no eth_sendTransaction / wallet_sendCalls)', script.length > 0 && !/eth_sendTransaction|wallet_sendCalls|eth_signTypedData|personal_sign/.test(page));
    const iEx = script.indexOf('CV.executerClaim('), iEnv = script.indexOf('envoyerDepuisWallet(');
    t('A11 its ONE send is envoi.js, passed as `envoyer` to claim-vue.js executerClaim (simulate first, receipt after)',
      (script.match(/envoyerDepuisWallet\(/g) || []).length === 1 && iEx > 0 && iEnv > iEx && iEnv - iEx < 400 && /envoyer:\s*\(a\)\s*=>/.test(script.slice(iEx, iEnv)));
    t('A12 $ is getElementById and no # selector is passed to it', /const \$ = \(id\) => document\.getElementById\(id\)/.test(script) && !/\$\(\s*['"]#/.test(script));
    /* the copy rule: product names only, no internal version names, no deploy-state words */
    const mod = lire(F.module);
    const textes = [...page.replace(/<!--[\s\S]*?-->/g, '').replace(/<style[\s\S]*?<\/style>/g, '').matchAll(/>([^<]+)</g)].map((m) => m[1]);
    const chaines = [...(script + '\n' + mod).replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/'(?:[^'\\\n]|\\.)*'/g)].map((m) => m[0]).filter((s) => /[A-Za-z]{2,}\s+[A-Za-z]/.test(s));
    const interdits = [...textes, ...chaines].filter((s) => /not deployed|under review|fork test|(^|[^A-Za-z0-9_.\/-])[Vv][0-9]{1,2}(?![A-Za-z0-9_])/i.test(s));
    t('A13 no "not deployed / under review / fork test" and no version name in what the page says (' + (textes.length + chaines.length) + ' texts)', textes.length > 10 && chaines.length > 40 && interdits.length === 0, interdits.slice(0, 3).join(' | '));
    t('A14 no fee wallet written raw in claim.html or claim-vue.js; addresses are shown with displayShort', FEE_ADDRESSES.every((a) => !page.toLowerCase().includes(a) && !mod.toLowerCase().includes(a))
      && /mk\('a', null, displayShort\(a\)\)/.test(script) && !/0x[0-9a-fA-F]{40}/.test(page.replace(/<!--[\s\S]*?-->/g, '')) && !/0x[0-9a-fA-F]{40}/.test(mod));
    t('A15 the contracts read the claim signatures this module encodes', /function claim\(uint256 e\) external lock returns \(uint256 paid\)/.test(lire(join(ICI, 'contracts/src/TBlockVaultV2.sol')))
      && /function claim\(uint256\[\] calldata epochs\) external nonReentrant returns \(uint256 paid0, uint256 paid1\)/.test(lire(join(ICI, 'contracts/src/TBlockLockRewards.sol'))));
  });

  /* ── B. encoders and identifiers ── */
  await essai('B', async () => {
    const enc = { 'claim(uint256)': (x) => CV.claimSemaineCall(BigInt(x)).data, 'claim(uint256[])': (x) => CV.claimMoisCall(JSON.parse(x)).data, 'closeEpoch(uint256)': (x) => CV.closeSemaineCall(BigInt(x)).data };
    for (const [sig, x, attendu] of CAST.calldata) {
      t('B1 ' + sig + ' ' + x + ' = cast calldata', enc[sig](x) === attendu, enc[sig](x));
      if (castLive) t('B1 live cast calldata ' + sig + ' ' + x, cast('calldata', sig, x) === attendu);
    }
    t('B2 R.closeEpoch(3) = cast calldata, on the lock rewards', CV.closeMoisCall(3n).data === CAST.calldata[4][2] && CV.closeMoisCall(3n).to === CV.R);
    t('B3 V.claim goes to the holders vault, R.claim to the lock rewards, both with value 0', CV.claimSemaineCall(0n).to === CV.V && CV.claimMoisCall([1n]).to === CV.R && CV.claimSemaineCall(0n).value === '0x0' && CV.claimMoisCall([1n]).value === '0x0');
    t('B4 V.claim is the call economie-pack.js builds', CV.claimSemaineCall(5n).data === EP.claimCall(5n).data);
    let trop = null; try { CV.claimMoisCall(Array.from({ length: 25 }, (_, i) => BigInt(i))); } catch (e) { trop = e; }
    t('B5 R.claim refuses 25 months (MAX_CLAIM_EPOCHS = 24) and 0 months', !!trop && (() => { try { CV.claimMoisCall([]); return false; } catch (_) { return true; } })());
    for (const [sig, sel] of Object.entries(CAST.sig)) {
      t('B6 error ' + sig + ' = cast sig ' + sel + ' and is said in words', !!CV.ERREUR_PAR_SEL[sel] && CV.texteRevert(sel + '00') === CV.ERREUR_PAR_SEL[sel]);
      if (castLive) t('B6 live cast sig ' + sig, cast('sig', sig) === sel);
    }
    t('B7 an unknown revert is not given a meaning', CV.texteRevert('0xdeadbeef') === null && CV.texteRevert('') === null);
    for (const [k, [sig, h]] of Object.entries(CAST.keccak)) {
      t('B8 topic ' + k + ' = cast keccak', CV.TOPIC[k] === h);
      if (castLive) t('B8 live cast keccak ' + sig, cast('keccak', sig) === h);
    }
    t('B9 the UserOperationEvent topic is the one envoi.js reads', CV.TOPIC.UserOp === ENV.TOPIC_USER_OP);
    t('B10 V and R are the deployed record\'s letters V and R; TBLOCK is economie-pack.js; wtCOIN is the frozen pack\'s', CV.V === A.V && CV.R === A.R && CV.TBLOCK === EP.TBLOCK && CV.WTCOIN === String(PK.existants.wtcoin).toLowerCase());
  });

  /* ── C. deciding ── */
  const T = 1795000000n, FENETRE = 1209600n, COMMIT = 604800n, NEED = 2789880n * 10n ** 18n;
  const semaine = (o = {}) => ({ e: 0n, fin: T - 86400n * 3n, epoque: { budget: 1000n * 10n ** 18n, paid: 0n, closedAt: Number(T - 86400n * 2n), closed: true, released: false },
    owed: { share: 40n * 10n ** 18n, bonus: 2n * 10n ** 18n }, claimed: false, jeu: 900n * 10n ** 18n, need: NEED, ...o });
  const mois = (o = {}) => ({ k: 0n, fin: T - 86400n, closedAt: T - 3600n, claimable: { wtcoin: 5n * 10n ** 15n, tblock: 7n * 10n ** 18n }, claimed: false, played: true, poids: 3n * 10n ** 24n, ...o });
  const lecture = (o = {}) => ({ wallet: G, maintenant: Number(T),
    v: { likesOk: true, likes: EP.HEARTS, semaine: 1n, longueur: 604800n, claimWindow: FENETRE, minCommit: COMMIT, fin: T + 86400n * 4n, fin0: T - 86400n * 3n, need: NEED, regles: null, semaines: [semaine()], ...(o.v || {}) },
    moi: { locked: 3n * 10n ** 24n, unlockAt: T + 86400n * 60n, facteur: 11660n, jeuSemaine: 5n * 10n ** 18n, ...(o.moi || {}) },
    r: { tokensOk: true, courant: 1n, prochain: 1n, aLiberer: 0n, fenetre: 3n, longueur: 2592000n, rewardBps: 2500n, fin: T + 86400n * 20n, fin0: T - 86400n, finProchain: T + 86400n * 20n,
      bandes: [0, 30, 90, 180, 365].map((j, i) => ({ jours: j, bps: [10000n, 12500n, 15000n, 17500n, 20000n][i] })), joue: true, poids: 3n * 10n ** 24n, gains: { premier: 1, dernier: 2, n: 2 }, mois: [mois()], ...(o.r || {}) } });
  await essai('C', async () => {
    let L = lecture();
    let st = CV.etatSemaine(L.v.semaines[0], L);
    t('C1 a closed week that owes this wallet, in its window, lock ok -> to claim, the amount owed', st.cle === 'A_RECLAMER' && st.attendu === 42n * 10n ** 18n, st.cle + ' ' + st.texte);
    let p = CV.planClaimSemaine(L, 0n, G);
    t('C2 its plan: V.claim(0) for this wallet, expecting share + top bonus', p.ok && p.appel.data === CAST.calldata[0][2] && p.appel.to === CV.V && p.attendu === 42n * 10n ** 18n && p.wallet === G);
    t('C3 a plan for ANOTHER connected wallet is refused (nothing sent), and with no wallet too', !CV.planClaimSemaine(L, 0n, AUTRE).ok && /nothing was sent/.test(CV.planClaimSemaine(L, 0n, AUTRE).why) && !CV.planClaimSemaine(L, 0n, null).ok);
    t('C4 the wallet address is compared in any letter case', CV.planClaimSemaine(L, 0n, G.toUpperCase().replace('0X', '0x')).ok);
    const ferme = BigInt(L.v.semaines[0].epoque.closedAt);
    L = lecture(); L.maintenant = Number(ferme + FENETRE - 1n);
    t('C5 claimable one second before closedAt + 14 days', CV.etatSemaine(L.v.semaines[0], L).cle === 'A_RECLAMER');
    L.maintenant = Number(ferme + FENETRE);
    st = CV.etatSemaine(L.v.semaines[0], L);
    t('C6 at closedAt + 14 days the window is over (the contract refuses WindowClosed) and the plan is refused', st.cle === 'FENETRE_FINIE' && !CV.planClaimSemaine(L, 0n, G).ok && st.finFenetre === ferme + FENETRE);
    L = lecture({ v: { semaines: [semaine({ claimed: true })] } });
    t('C7 already claimed -> claimed, refused', CV.etatSemaine(L.v.semaines[0], L).cle === 'RECLAMEE' && !CV.planClaimSemaine(L, 0n, G).ok);
    L = lecture({ v: { semaines: [semaine({ epoque: { budget: 0n, paid: 0n, closedAt: 0, closed: false, released: false }, fin: T - 10n })] } });
    t('C8 an ended week not closed -> to close; its close plan is V.closeEpoch(0)', CV.etatSemaine(L.v.semaines[0], L).cle === 'A_FERMER' && CV.planCloseSemaine(L, 0n, G).ok && CV.planCloseSemaine(L, 0n, G).appel.data === CV.closeSemaineCall(0n).data);
    L = lecture({ v: { semaines: [semaine({ epoque: { budget: 0n, paid: 0n, closedAt: 0, closed: false, released: false }, fin: T + 10n })] } });
    t('C9 a week not ended -> running, cannot be closed', CV.etatSemaine(L.v.semaines[0], L).cle === 'EN_COURS' && !CV.planCloseSemaine(L, 0n, G).ok);
    L = lecture({ v: { semaines: [semaine({ owed: { share: 0n, bonus: 0n }, jeu: 0n })] } });
    t('C10 owed 0 and no play -> not played', CV.etatSemaine(L.v.semaines[0], L).cle === 'PAS_JOUE');
    L = lecture({ v: { semaines: [semaine({ owed: { share: 0n, bonus: 0n } })] }, moi: { unlockAt: T + 86400n } });
    t('C11 owed 0 with play but a lock ending in 1 day -> lock needed (the 7-day rule, said)', CV.etatSemaine(L.v.semaines[0], L).cle === 'LOCK_REQUIS' && /7 more days/.test(CV.etatSemaine(L.v.semaines[0], L).texte));
    L = lecture({ moi: { locked: NEED - 1n } });
    st = CV.etatSemaine(L.v.semaines[0], L);
    t('C12 owed > 0 but less than needFor(e) locked -> lock needed, plan refused', st.cle === 'LOCK_REQUIS' && !CV.planClaimSemaine(L, 0n, G).ok);
    L = lecture({ v: { semaines: [semaine({ epoque: { budget: 50n * 10n ** 18n, paid: 30n * 10n ** 18n, closedAt: Number(T - 86400n), closed: true, released: false } })] } });
    t('C13 the budget left caps what is expected (min(owed, budget - paid))', CV.planClaimSemaine(L, 0n, G).attendu === 20n * 10n ** 18n);
    /* not read never 0 */
    for (const [nom, o] of [['owed', { owed: null }], ['claimed', { claimed: null }], ['the week itself', { epoque: null }]]) {
      L = lecture({ v: { semaines: [semaine(o)] } });
      st = CV.etatSemaine(L.v.semaines[0], L);
      t('C14 ' + nom + ' not read -> NON_LU, says "not read", never a 0 and never claimable', st.cle === 'NON_LU' && /not read/.test(st.texte) && !/\b0 TBLOCK\b/.test(st.texte) && !CV.planClaimSemaine(L, 0n, G).ok);
    }
    L = lecture({ v: { claimWindow: null } });
    t('C15 the claim window not read -> NON_LU (no window guessed)', CV.etatSemaine(L.v.semaines[0], L).cle === 'NON_LU');
    L = lecture({ moi: { locked: null } });
    t('C16 the lock not read -> NON_LU, never "0 locked"', CV.etatSemaine(L.v.semaines[0], L).cle === 'NON_LU' && !CV.planClaimSemaine(L, 0n, G).ok);
    t('C17 montant: null -> "not read", a real 0 -> "0 TBLOCK"', CV.montant(null) === 'not read' && CV.montant(undefined) === 'not read' && CV.montant(0n) === '0 TBLOCK');
    L = lecture({ moi: { locked: null, unlockAt: null, facteur: null, jeuSemaine: null } });
    const lm = Object.fromEntries(CV.lignesMoi(L));
    t('C18 lignesMoi: play, factor and lock not read say "not read", never 0', lm['Your play this week'] === 'not read' && lm['Your lock factor now'] === 'not read' && lm['Your lock'] === 'not read' && !Object.values(lm).some((v) => /^0 TBLOCK/.test(v)), JSON.stringify(lm));
    const a = CV.argsEtapes(L);
    t('C19 the three steps never tick on an unread lock (wallet null in the steps)', a && a.wallet === null && a.complet === false && HV.etapesPaiement(a).every((x) => x.etat === 'info'));
    t('C20 with everything read the steps tick for this wallet', (() => { const b = CV.argsEtapes(lecture()); return b && b.wallet === G && b.complet && HV.etapesPaiement(b)[0].etat === 'fait'; })());
    t('C21 no steps at all when the need or the week end was not read', CV.argsEtapes(lecture({ v: { need: null } })) === null && CV.argsEtapes(lecture({ v: { fin: null } })) === null);
    /* months */
    L = lecture();
    let m = CV.etatMois(L.r.mois[0], L);
    t('C22 a closed month this wallet played with a weight -> to claim, its window = closedAt + 3 x 30 days', m.cle === 'A_RECLAMER' && m.finFenetre === T - 3600n + 3n * 2592000n);
    p = CV.planClaimMois(L, G);
    t('C23 its plan: R.claim([0]) with the summed wtCOIN and TBLOCK', p.ok && p.appel.data === CV.claimMoisCall([0n]).data && p.appel.to === CV.R && p.attendu.tblock === 7n * 10n ** 18n && p.attendu.wtcoin === 5n * 10n ** 15n);
    L = lecture({ r: { mois: [mois({ k: 23n }), mois({ k: 1n, claimed: true }), mois({ k: 0n })] } });
    p = CV.planClaimMois(L, G);
    t('C24 several months: claimed ones left out, ascending order, = cast calldata shape', p.ok && p.mois.join(',') === '0,23' && p.appel.data === CV.claimMoisCall([0n, 23n]).data);
    L = lecture({ r: { mois: Array.from({ length: 30 }, (_, i) => mois({ k: BigInt(i) })) } });
    p = CV.planClaimMois(L, G);
    t('C25 30 claimable months -> one claim of 24 (MAX_CLAIM_EPOCHS)', p.ok && p.mois.length === 24);
    for (const [nom, o, cle] of [['not covered', { poids: 0n }, 'PAS_COUVERT'], ['not played', { played: false }, 'PAS_JOUE'], ['claimed', { claimed: true }, 'RECLAMEE'],
      ['claimable not read', { claimable: null }, 'NON_LU'], ['claimed not read', { claimed: null }, 'NON_LU'], ['nothing owed', { claimable: { wtcoin: 0n, tblock: 0n } }, 'RIEN']]) {
      L = lecture({ r: { mois: [mois(o)] } });
      t('C26 month ' + nom + ' -> ' + cle + ', nothing to claim', CV.etatMois(L.r.mois[0], L).cle === cle && !CV.planClaimMois(L, G).ok);
    }
    L = lecture({ r: { tokensOk: false } });
    t('C27 reward tokens not confirmed on chain -> no month claim', !CV.planClaimMois(L, G).ok);
    t('C28 a month claim for another wallet is refused', !CV.planClaimMois(lecture(), AUTRE).ok);
    L = lecture({ r: { prochain: 1n, finProchain: T - 1n } });
    t('C29 the next month, ended, can be closed (R.closeEpoch(next)); not before its end', CV.planCloseMois(L, G).ok && CV.planCloseMois(L, G).appel.data === CV.closeMoisCall(1n).data
      && !CV.planCloseMois(lecture({ r: { finProchain: T + 1n } }), G).ok);
    /* the first claim, said from the clocks read */
    const L0 = lecture({ v: { semaine: 0n, fin0: 1794960000n, fin: 1794960000n, semaines: [] }, r: { prochain: 0n, fin0: 1797033600n, finPremierGain: 1799625600n, gains: { premier: 1, dernier: 1, n: 1 }, mois: [] } });
    /* review 2026-11-12: "this lock earns month 1" now needs the weight R recorded for month 1 (weightOf(Grok, 1), read on Base at block 56643259) */
    L0.r.poidsPremierGain = 3750000n * 10n ** 18n;
    L0.maintenant = 1794511111;
    const po = CV.premiereOuverture(L0);
    t('C30 nothing claimable yet: week 0 closes 2026-11-18 00:00 UTC (read), then 14 days', /week 0 closes 2026-11-18 00:00 UTC/.test(po[0]) && /14 days/.test(po[0]), po[0]);
    t('C31 and month 0 ends 2026-12-12 00:00 UTC (read); this lock earns month 1, ending 2027-01-11', /month 0 ends 2026-12-12 00:00 UTC/.test(po[1]) && /month 1, which ends 2027-01-11 00:00 UTC/.test(po[1]), po[1]);
    const Lx = lecture({ v: { fin0: null, semaine: null }, r: { fin0: null } });
    t('C32 the clocks not read -> "not read", never a made-up date', CV.premiereOuverture(Lx).every((x) => /not read/.test(x)) && !CV.premiereOuverture(Lx).some((x) => /1970/.test(x)));
    t('C33 the monthly rules in words only when all of them were read', /×1\.25 from 30 days/.test(CV.texteRegleMois(lecture().r)) && /within 3 months/.test(CV.texteRegleMois(lecture().r)) && CV.texteRegleMois(lecture({ r: { rewardBps: null } }).r) === null);
  });

  /* ── C'. lireTout on a fake node: failures stay null ── */
  await essai('C-lire', async () => {
    const { selecteur } = await import(tree('keccak.js'));
    const s = (sig) => selecteur(sig).slice(2);
    const reponses = (to, data, panne) => {
      const d = data.slice(2, 10), dest = String(to).toLowerCase();
      if (panne && panne(dest, d)) throw new Error('node down');
      if (dest === CV.V && d === s('LIKES()')) return tAdr(EP.HEARTS);
      if (dest === CV.R && d === s('TBLOCK()')) return tAdr(CV.TBLOCK);
      if (dest === CV.R && d === s('WTCOIN()')) return tAdr(CV.WTCOIN);
      if (dest === CV.V && d === s('claimed(uint256,address)')) return hx(0);
      if (dest === CV.V && d === s('CLAIM_WINDOW()')) return hx(FENETRE);
      if (d === s('currentEpoch()')) return hx(1);
      if (d === s('epochs(uint256)')) return '0x' + w32(100n * 10n ** 18n) + w32(0) + w32(T - 86400n) + w32(1) + w32(0);
      if (d === s('owed(uint256,address)')) return '0x' + w32(3n * 10n ** 18n) + w32(0);
      if (d === s('claimable(address,uint256[])')) return '0x' + w32(0) + w32(0);
      if (d === s('enrollmentOf(address)') || d === s('rewardEpochsFor(uint256)')) return '0x' + w32(1) + w32(2) + w32(2);
      if (d === s('nextEpochToClose()')) return hx(1);
      if (d === s('nextEpochToRelease()')) return hx(0);
      if (d === s('activeLockedOf(address)')) return hx(3n * 10n ** 24n);
      if (d === s('unlockAtOf(address)')) return hx(T + 86400n * 60n);
      return hx(7);
    };
    const rpcDe = (panne) => async (m, p) => { if (m !== 'eth_call') throw new Error('unexpected ' + m); return reponses(p[0].to, p[0].data, panne); };
    let L = await CV.lireTout(rpcDe(null), G, Number(T));
    t('C34 lireTout on a node that answers: the week, the lock and the month are read', L.v.likesOk && L.v.semaine === 1n && L.v.semaines.length === 1 && L.moi.locked === 3n * 10n ** 24n && L.r.tokensOk && L.r.mois.length === 1);
    L = await CV.lireTout(async () => { throw new Error('down'); }, G, Number(T));
    const zeros = []; const scan = (o, ch) => { for (const [k, v] of Object.entries(o || {})) { if (v === 0n) zeros.push(ch + k); else if (v && typeof v === 'object' && !Array.isArray(v)) scan(v, ch + k + '.'); } };
    scan(L.v, 'v.'); scan(L.moi, 'moi.'); scan(L.r, 'r.');
    t('C35 every read failing: no value becomes 0 (all null), no week or month invented', zeros.length === 0 && L.v.semaine === null && L.moi.locked === null && L.r.courant === null && L.v.semaines.length === 0 && L.r.mois.length === 0 && L.v.regles === null, zeros.join(','));
    t('C36 and the page lines say "not read"', Object.values(Object.fromEntries(CV.lignesMoi(L))).every((v) => /not read/.test(v)));
    L = await CV.lireTout(rpcDe((to, d) => d === s('activeLockedOf(address)')), G, Number(T));
    t('C37 only the lock read failing: the lock is null, the rest read', L.moi.locked === null && L.moi.unlockAt === T + 86400n * 60n && L.v.semaine === 1n && /not read/.test(Object.fromEntries(CV.lignesMoi(L))['Your lock']));
    L = await CV.lireTout(rpcDe((to, d) => to === CV.V && d === s('owed(uint256,address)')), G, Number(T));
    t('C38 owed failing: that week is NON_LU, not "nothing owed"', L.v.semaines.length === 1 && L.v.semaines[0].owed === null && CV.etatSemaine(L.v.semaines[0], L).cle === 'NON_LU');
    const autreHorloge = async (m, p) => (p[0].to.toLowerCase() === CV.V && p[0].data.slice(2, 10) === s('LIKES()') ? tAdr(AUTRE) : reponses(p[0].to, p[0].data, null));
    L = await CV.lireTout(autreHorloge, G, Number(T));
    t('C39 a vault naming another week clock than the pack hearts: no week is read on a guess', L.v.likesOk === false && L.v.semaine === null && L.v.semaines.length === 0);
  });

  /* ── D. sending ── */
  await essai('D', async () => {
    const PAYE = 42n * 10n ** 18n;
    const planS = CV.planClaimSemaine(lecture(), 0n, G);
    const fauxEth = (compte = G, chaine = '0x2105') => { const log = []; return { log, request: async ({ method }) => { log.push(method); if (method === 'eth_accounts') return compte ? [compte] : []; if (method === 'eth_chainId') return chaine; throw new Error('not here: ' + method); } }; };
    const recuV = (o = {}) => ({ transactionHash: '0xaa', status: '0x1', logs: [
      { address: CV.V, topics: [CV.TOPIC.ClaimedV, hx(o.e ?? 0), tAdr(o.joueur || G)], data: '0x' + w32(40n * 10n ** 18n) + w32(2n * 10n ** 18n) },
      { address: o.emetteur || CV.TBLOCK, topics: [CV.TOPIC.Transfer, tAdr(CV.V), tAdr(o.vers || G)], data: hx(o.valeur ?? PAYE) },
      ...(o.extra || []) ] });
    const txDe = (plan, o = {}) => ({ hash: '0xaa', from: o.from || G, to: o.to || plan.appel.to, input: o.input || plan.appel.data, value: '0x0' });
    const scenario = async ({ plan = planS, eth = fauxEth(), sim = (p) => hx(PAYE), envoi = { etat: 'CONFIRME', hash: '0xaa' }, tx = (pl) => txDe(pl), recu = () => recuV() } = {}) => {
      const ordre = [];
      const rpc = async (m, p) => {
        ordre.push(m === 'eth_call' ? 'simulation' : m);
        if (m === 'eth_call') { ordre.simFrom = p[0].from; ordre.simTo = p[0].to; ordre.simData = p[0].data; return sim(p); }
        if (m === 'eth_getTransactionByHash') return tx(plan);
        if (m === 'eth_getTransactionReceipt') return recu(plan);
        throw new Error('unexpected ' + m);
      };
      const envoyer = async (a) => { ordre.push('wallet'); ordre.envoye = a; return envoi; };
      const res = await CV.executerClaim({ rpc, eth, plan, envoyer, essais: 2, pause: async () => {} });
      return { res, ordre, eth };
    };
    let x = await scenario();
    t('D1 the claim is simulated FROM the wallet (eth_call from = wallet, to = V, data = claim(0)) BEFORE the wallet opens',
      x.ordre.indexOf('simulation') >= 0 && x.ordre.indexOf('simulation') < x.ordre.indexOf('wallet') && x.ordre.simFrom === G && x.ordre.simTo === CV.V && x.ordre.simData === CAST.calldata[0][2], x.ordre.join(','));
    t('D2 the account and the chain are re-read before anything', x.eth.log[0] === 'eth_accounts' && x.eth.log.includes('eth_chainId'));
    t('D3 the wallet signs exactly the plan call', x.ordre.envoye === planS.appel);
    t('D4 a good receipt: ok, paid exactly the owed amount, signed by the wallet', x.res.ok && x.res.etape === 'RECU' && x.res.verdict.paye === PAYE && x.res.verdict.signe === 'wallet', JSON.stringify(x.res.why));
    t('D5 the words after it say the amount and "exactly"', /42 TBLOCK from the holders vault to your wallet, exactly what the contract owed for week 0/.test(CV.texteVerdict(planS, x.res)));
    x = await scenario({ sim: () => { const e = new Error('execution reverted'); e.data = CAST.sig['NotCommitted(uint256,uint256)'] + w32(1) + w32(2); throw e; } });
    t('D6 the simulation reverts (NotCommitted) -> refused in words, the wallet NEVER opens', !x.res.ok && x.res.etape === 'SIMULATION' && /7 more days/.test(x.res.why) && !x.ordre.includes('wallet'));
    x = await scenario({ sim: () => hx(0) });
    t('D7 the simulation pays 0 -> refused, the wallet never opens', !x.res.ok && x.res.etape === 'SIMULATION' && !x.ordre.includes('wallet'));
    x = await scenario({ eth: fauxEth(AUTRE) });
    t('D8 the wallet now on ANOTHER account -> refused before any simulation, nothing sent', !x.res.ok && x.res.etape === 'REFUS' && /nothing was sent/.test(x.res.why) && x.ordre.length === 0);
    x = await scenario({ eth: fauxEth(null) });
    t('D9 no account readable -> refused, nothing sent', !x.res.ok && x.res.etape === 'REFUS' && x.ordre.length === 0);
    x = await scenario({ eth: fauxEth(G, '0x1') });
    t('D10 the wallet on another chain -> refused, nothing sent', !x.res.ok && x.res.etape === 'REFUS' && /not on Base/.test(x.res.why) && x.ordre.length === 0);
    x = await scenario({ plan: CV.planClaimSemaine(lecture(), 0n, AUTRE) });
    t('D11 a refused plan is never simulated nor sent', !x.res.ok && x.res.etape === 'REFUS' && x.ordre.length === 0);
    x = await scenario({ envoi: { etat: 'REFUSE_PAR_UTILISATEUR', pourquoi: 'you declined in your wallet — nothing was sent' } });
    t('D12 the person declines in the wallet (4001) -> ENVOI, no receipt read, envoi.js says nothing moved', !x.res.ok && x.res.etape === 'ENVOI' && !x.ordre.includes('eth_getTransactionReceipt') && /nothing moved/.test(ENV.messageEnvoi(x.res.envoi)));
    x = await scenario({ tx: (pl) => txDe(pl, { from: AUTRE }) });
    t('D13 tx.from is another address -> the receipt is refused (an event is not a transaction)', !x.res.ok && x.res.etape === 'RECU' && /signed by/.test(x.res.why));
    x = await scenario({ recu: () => ({ ...recuV(), status: '0x0' }) });
    t('D14 status 0 -> refused', !x.res.ok && /failed on Base/.test(x.res.why));
    x = await scenario({ recu: () => recuV({ valeur: PAYE - 1n }) });
    t('D15 the vault paid 1 wei less than the contract owed -> refused', !x.res.ok && /the contract owed/.test(x.res.why));
    x = await scenario({ recu: () => recuV({ emetteur: '0x2222222222222222222222222222222222222222' }) });
    t('D16 a Transfer emitted by another contract (forged event) is not a payment -> refused', !x.res.ok && /saw 0/.test(x.res.why));
    x = await scenario({ recu: () => recuV({ vers: AUTRE }) });
    t('D17 the TBLOCK went to another address -> refused', !x.res.ok);
    x = await scenario({ recu: () => recuV({ extra: [{ address: CV.TBLOCK, topics: [CV.TOPIC.Transfer, tAdr(CV.V), tAdr(AUTRE)], data: hx(1) }] }) });
    t('D18 a second TBLOCK transfer out of the vault in the same receipt -> refused', !x.res.ok && /saw 2/.test(x.res.why));
    x = await scenario({ recu: () => recuV({ e: 1 }) });
    t('D19 a Claimed event for another week -> refused', !x.res.ok && /no claim of week 0/.test(x.res.why));
    x = await scenario({ recu: () => recuV({ joueur: AUTRE }) });
    t('D20 a Claimed event naming another player -> refused', !x.res.ok);
    x = await scenario({ tx: (pl) => txDe(pl, { input: CAST.calldata[1][2] }) });
    t('D21 the signed data is not the offered call -> refused', !x.res.ok && /not the offered call/.test(x.res.why));
    const userOp = (ok = true, sender = G) => ({ address: ENTRYPOINT, topics: [CV.TOPIC.UserOp, '0x' + 'ab'.repeat(32), tAdr(sender), tAdr('0x0')], data: '0x' + w32(1) + w32(ok ? 1 : 0) + w32(5) + w32(6) });
    x = await scenario({ tx: (pl) => txDe(pl, { from: BUNDLER, to: ENTRYPOINT, input: '0x1fad948c' }), recu: () => recuV({ extra: [userOp(true)] }) });
    t('D22 a smart account: tx.from is the bundler, the EntryPoint names this wallet as sender, success -> ok', x.res.ok && x.res.verdict.signe === 'smart account', x.res.why);
    x = await scenario({ tx: (pl) => txDe(pl, { from: BUNDLER, to: ENTRYPOINT }), recu: () => recuV({ extra: [userOp(false)] }) });
    t('D23 the smart account operation failed (success = 0) -> refused', !x.res.ok && /signed by/.test(x.res.why));
    x = await scenario({ tx: (pl) => txDe(pl, { from: BUNDLER, to: ENTRYPOINT }), recu: () => recuV({ extra: [userOp(true, AUTRE)] }) });
    t('D24 a user operation of ANOTHER sender -> refused', !x.res.ok);
    x = await scenario({ recu: () => null });
    t('D25 the receipt not found -> refused, says "not read"', !x.res.ok && x.res.etape === 'RECU' && /not read/.test(x.res.why));
    /* months */
    const planM = CV.planClaimMois(lecture(), G);
    const recuR = (o = {}) => ({ transactionHash: '0xaa', status: '0x1', logs: [
      { address: CV.R, topics: [CV.TOPIC.ClaimedR, tAdr(G)], data: '0x' + w32(o.dw ?? 5n * 10n ** 15n) + w32(o.dt ?? 7n * 10n ** 18n) + w32(o.n ?? 1) },
      ...((o.dt ?? 1n) === 0n ? [] : [{ address: CV.TBLOCK, topics: [CV.TOPIC.Transfer, tAdr(CV.R), tAdr(G)], data: hx(o.vt ?? 7n * 10n ** 18n) }]),
      { address: CV.WTCOIN, topics: [CV.TOPIC.Transfer, tAdr(CV.R), tAdr(G)], data: hx(o.vw ?? 5n * 10n ** 15n) }, ...(o.extra || []) ] });
    x = await scenario({ plan: planM, sim: () => '0x' + w32(5n * 10n ** 15n) + w32(7n * 10n ** 18n), recu: () => recuR() });
    t('D26 a month claim: simulated before the wallet, paid exactly in TBLOCK and wtCOIN', x.res.ok && x.ordre.indexOf('simulation') < x.ordre.indexOf('wallet') && x.res.verdict.paye.tblock === 7n * 10n ** 18n && x.res.verdict.paye.wtcoin === 5n * 10n ** 15n, x.res.why);
    x = await scenario({ plan: planM, sim: () => '0x' + w32(1) + w32(1), recu: () => recuR({ vw: 5n * 10n ** 15n - 1n }) });
    t('D27 wtCOIN paid 1 unit less than the contract says -> refused', !x.res.ok && /wtCOIN/.test(x.res.why));
    x = await scenario({ plan: planM, sim: () => '0x' + w32(1) + w32(1), recu: () => recuR({ n: 2 }) });
    t('D28 the receipt claimed another number of months -> refused', !x.res.ok && /months/.test(x.res.why));
    x = await scenario({ plan: planM, sim: () => '0x' + w32(1) + w32(1), recu: () => recuR({ dt: 0n, extra: [{ address: CV.TBLOCK, topics: [CV.TOPIC.Transfer, tAdr(CV.R), tAdr(G)], data: hx(1) }] }) });
    t('D29 TBLOCK moved by the lock rewards when the contract owed 0 TBLOCK -> refused', !x.res.ok && /did not owe/.test(x.res.why));
    x = await scenario({ plan: planM, sim: () => '0x' + w32(0) + w32(0) });
    t('D30 a month claim simulated at 0 -> the wallet never opens', !x.res.ok && x.res.etape === 'SIMULATION' && !x.ordre.includes('wallet'));
    x = await scenario({ plan: planM, sim: () => { const e = new Error('execution reverted'); e.data = CAST.sig['NotPlayed(uint256)'] + w32(0); throw e; } });
    t('D31 R refuses (NotPlayed) in the simulation -> said in words, never sent', !x.res.ok && /did not play that month/.test(x.res.why) && !x.ordre.includes('wallet'));
  });
  return { ok, ko };
}

/* ═════════════════════════════════════ run ═════════════════════════════════════ */
const v = cast('--version');
castLive = !!v;
console.log('cast on PATH: ' + (castLive ? v.split('\n')[0] : 'no (the recorded cast constants are used)'));
const base = await suite(FICHIERS, true);
console.log('\n' + base.ok + ' ok, ' + base.ko.length + ' KO');
if (base.ko.length) { console.log(base.ko.map((x) => '  KO ' + x).join('\n')); process.exit(1); }
if (process.argv.includes('--no-mutants')) process.exit(0);

castLive = false; /* the live cast comparisons ran once on the real files */
const src = lire(FICHIERS.module), page = lire(FICHIERS.page);
const MUTANTS = [
  ['the simulation is skipped', 'const sim = await simuler(rpc, plan);', 'const sim = { ok: true, retour: null };'],
  ['the account is not re-read', 'if (compte !== plan.wallet) return', 'if (false) return'],
  ['the plans do not check the wallet read', 'const no = memeWallet(L, compte); if (no) return no;', '', true],
  ['tx.from is not compared', "if (tx && bas(tx.from) === wallet) return 'wallet';", "if (tx) return 'wallet';"],
  ['the vault payment is not compared with what the contract owed', 'else if (t[0].value !== du)', 'else if (false)'],
  ['a Transfer from any emitter is trusted', 'bas(l.address) === jeton && Array.isArray(l.topics)', 'Array.isArray(l.topics)'],
  ['a failed read becomes 0', "catch (_) { return null; } };\n  const lit = async", "catch (_) { return '0x' + '0'.repeat(64); } };\n  const lit = async"],
  ['montant says 0 for a value not read', 'const b = big(raw); return b === null ? NON_LU', 'const b = big(raw) ?? 0n; return b === null ? NON_LU'],
  ['the window is claimable at its last second + 1', 'if (t >= finFenetre)', 'if (t > finFenetre)'],
  ['the receipt status is not checked', "if (bas(recu.status) !== '0x1')", 'if (false)'],
  ['V.claim is encoded with the wrong selector', 'export const claimSemaineCall = (e) => EP.claimCall(BigInt(e));', 'export const claimSemaineCall = (e) => EP.closeEpochCall(BigInt(e));'],
  ['more than 24 months are put in one claim', '.slice(0, MOIS_MAX);', ';'],
  ['a failed user operation counts', 'ok = EP.word(l.data, 1) === 1n;', 'ok = true;'],
  ['the budget left is not a cap', 'const attendu = total < reste ? total : reste;', 'const attendu = total;'],
  ['the steps tick on an unread lock', 'const avecWallet = !!L.wallet && lu(moi.locked) && lu(moi.unlockAt) && lu(moi.jeuSemaine);', 'const avecWallet = !!L.wallet;'],
  ['the chain is not checked', 'if (chaine !== BigInt(CHAINE)) return', 'if (false) return'],
  ['any week clock named by the vault is used', 'v.likesOk = v.likes !== null && v.likes === adr(EP.HEARTS);', 'v.likesOk = v.likes !== null;'],
];
const PAGE_MUTANTS = [
  ['the page sends with envoi.js directly, outside executerClaim', "const res = await CV.executerClaim({ rpc, eth: window.ethereum, plan, envoyer: (a) => {", "const res0 = await envoyerDepuisWallet({ eth: window.ethereum, rpc, chaineAttendue: 8453, compte: plan.wallet, to: plan.appel.to, data: plan.appel.data }); const res = await CV.executerClaim({ rpc, eth: window.ethereum, plan, envoyer: (a) => {"],
  ['the page drops the app colours', '--accent:#a78bfa;', '--accent:#7c3aed;'],
];
const dir = mkdtempSync(join(tmpdir(), 'claim386-mut-'));
let tues = 0; const survivants = [];
try {
  for (const [nom, de, vers, tous] of MUTANTS) {
    const n = src.split(de).length - 1;
    if (n < 1 || (!tous && n !== 1)) { survivants.push(nom + ' (pattern found ' + n + ' times: the mutant proves nothing)'); continue; }
    const f = join(dir, 'm' + (++nCopie) + '.js');
    writeFileSync(f, tous ? src.split(de).join(vers) : src.replace(de, () => vers));
    let r; try { r = await suite({ ...FICHIERS, module: f }, false); } catch (e) { r = { ko: ['load: ' + e.message] }; }
    if (r.ko.length) { tues++; console.log('  killed  ' + nom + '  (' + r.ko[0].slice(0, 90) + ')'); } else survivants.push(nom);
  }
  for (const [nom, de, vers] of PAGE_MUTANTS) {
    if (page.split(de).length - 1 !== 1) { survivants.push(nom + ' (pattern not found once)'); continue; }
    const f = join(dir, 'p' + (++nCopie) + '.html');
    writeFileSync(f, page.replace(de, () => vers));
    const r = await suite({ ...FICHIERS, page: f }, false);
    if (r.ko.length) { tues++; console.log('  killed  ' + nom + '  (' + r.ko[0].slice(0, 90) + ')'); } else survivants.push(nom);
  }
} finally { rmSync(dir, { recursive: true, force: true }); }
console.log('\nmutants: ' + tues + ' / ' + (MUTANTS.length + PAGE_MUTANTS.length) + ' killed');
if (survivants.length) { console.log('SURVIVED:\n  ' + survivants.join('\n  ')); process.exit(1); }
console.log('ALL GREEN: ' + base.ok + ' checks, ' + tues + ' mutants killed');
