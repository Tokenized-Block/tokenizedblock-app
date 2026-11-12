/* test-bascule-pack-economie-v2-20261112.mjs — the live app switched to the economy pack deployed on Base (L P T S V R).
 *
 * WHY: the six contracts are live (economie-v2-pack-deploye.js, written from the six receipts read on two nodes). The app still sent
 *   hearts to the first hearts contract, read the first vault, minted TAM art and skins on the earlier contracts and showed no lock reward.
 *   This test pins the switch, file by file, and that the earlier contracts stay readable (hearts history, past vault weeks, TAM works,
 *   skins).
 *
 * A  EXECUTED  economie-pack.js: addresses from the record only; the encoders equal `cast` (an independent ABI encoder); the checks keep
 *              the contracts' own rules at their exact boundary (hearts: locked >= minHold, wallet >= n x likePrice; vault claim: locked >=
 *              need, unlockAt >= now + MIN_COMMIT; router minimum: quote x 0.99, refused under the floor).
 * B  EXECUTED  tam-plan.js planMintTamRouteur + misables.js planJeuUsdc('tam-routeur'): exact USDC approve to the ROUTER (besoinDuJeu
 *              reads it), pay(TAM art, ...) with the work; refusals on a wrong price, router or minimum.
 * C  EXECUTED  coeurs-index.js creerIndexCoeursSuite: two contracts, complete only when both are; each heart tagged with its contract.
 * D  EXECUTED  tam-serveur.js serveurTam with \`autres\`: the works of both contracts, and distinctness refused while one is unread.
 * E  EXECUTED  blockskins: the active contract is the pack's Skins (router only, price from its source), the earlier ones stay read,
 *              every market call goes to the skin's own contract; /api/skins/prix describes the router payment.
 * F  SOURCE    app.html, serveur-web.js, tam-onglet.js, holders.html, contest.html, frais-risques.js wire the above; no typed address.
 * G  EXECUTED  the fees page renders the live rules (router, hearts in dollars, vault tiers, lock rewards), no optional buy row.
 * H  ON CHAIN  (both nodes, eth_call only; HORS_LIGNE=1 skips it and says so) the values the app relies on equal the record and sources.
 * The test counts itself and prints n/n. */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const ICI = dirname(fileURLToPath(import.meta.url));
const lire = (f) => { try { return readFileSync(join(ICI, f), 'utf8'); } catch (_) { return ''; } }; /* a missing file reads as empty: its clauses go red, the test goes on */
const imp = (f) => import(pathToFileURL(join(ICI, f)).href);
let n = 0, ko = 0;
const t = (label, cond) => { n += 1; if (cond === true) console.log('  ok   ' + label); else { ko += 1; console.log('  KO   ' + label); } };
const essai = (f) => { try { return f(); } catch (e) { return e; } };
const castOk = (() => { try { execFileSync('cast', ['--version'], { stdio: 'ignore' }); return true; } catch (_) { return false; } })();
const cast = (...a) => execFileSync('cast', a, { encoding: 'utf8' }).trim().toLowerCase();

let EP = null; try { EP = await imp('economie-pack.js'); } catch (e) { EP = null; console.log('  (economie-pack.js not importable: ' + String(e.message || e).slice(0, 80) + ')'); }
const REC = (await imp('economie-v2-pack-deploye.js'));
const PACK = (await imp('economie-v2-pack-deploiement.js')).PACK_ECONOMIE_V2;
const A = REC.ADRESSES_PACK_ECONOMIE_V2;
const ADR = /^0x[0-9a-f]{40}$/;

console.log('— A. economie-pack.js');
t('A the six addresses are the record\'s (L P T S V R)', !!EP && EP.HEARTS === A.L && EP.ROUTER === A.P && EP.TAM === A.T && EP.SKINS === A.S && EP.VAULT === A.V && EP.REWARDS === A.R);
t('A TBLOCK, USDC and the lock equal the frozen pack\'s existing addresses', !!EP && EP.TBLOCK === PACK.existants.tblock && EP.USDC === PACK.existants.usdc && EP.LOCK === PACK.existants.lock);
t('A the creation blocks come from the record', !!EP && REC.PACK_ECONOMIE_V2_DEPLOYE.etapes.every((e) => EP.BLOC_DEPLOIEMENT[e.lettre] === e.bloc));
t('A the module types no address (only the record and the existing modules carry them)', !!EP && !/0x[0-9a-fA-F]{40}/.test(lire('economie-pack.js')));
const E18 = 10n ** 18n, P = 93000n * E18, H = 2790000n * E18;
if (EP) {
  t('A heart: locked = minHold and wallet = price passes (the contract: locked >= need, transferFrom of n x price)', EP.likeCheck({ balance: P, locked: H, likePrice: P, minHold: H }).ok === true);
  t('A heart: one wei less locked is refused, with the locked amount said', (() => { const r = EP.likeCheck({ balance: P, locked: H - 1n, likePrice: P, minHold: H }); return !r.ok && /locked/.test(r.why); })());
  t('A heart: one wei less in the wallet is refused (the lock is never spent)', !EP.likeCheck({ balance: P - 1n, locked: H * 10n, likePrice: P, minHold: H }).ok);
  t('A heart: 3 hearts cost 3 x price', EP.likeCheck({ balance: 3n * P, locked: H, likePrice: P, minHold: H, n: 3 }).cost === 3n * P);
  const blk = '0xb2000000000000000000007afa7ed748b0874f27';
  const lb = EP.likeBatch({ block: blk, n: 2, likePrice: P });
  t('A heart batch: approve(Hearts, EXACTLY 2 x price) on TBLOCK, then like(block, 2) on Hearts', lb.length === 2 && lb[0].to === EP.TBLOCK && lb[1].to === EP.HEARTS
    && (!castOk || (lb[0].data === cast('calldata', 'approve(address,uint256)', EP.HEARTS, String(2n * P)) && lb[1].data === cast('calldata', 'like(address,uint256)', blk, '2'))));
  t('A heart batch refuses a non-block and an unread price', essai(() => EP.likeBatch({ block: EP.USDC, likePrice: P })) instanceof Error && essai(() => EP.likeBatch({ block: blk, likePrice: 0n })) instanceof Error);
  t('A vault claim: need locked, lock date exactly now + MIN_COMMIT passes; one second less is refused', EP.claimCheck({ locked: H, need: H, unlockAt: 1000 + 604800, minCommit: 604800, maintenantSec: 1000, owed: 1n }).ok === true
    && !EP.claimCheck({ locked: H, need: H, unlockAt: 1000 + 604799, minCommit: 604800, maintenantSec: 1000, owed: 1n }).ok && !EP.claimCheck({ locked: H - 1n, need: H, unlockAt: 1e9, minCommit: 604800, maintenantSec: 1000, owed: 1n }).ok
    && !EP.claimCheck({ locked: H, need: H, unlockAt: 1e9, minCommit: 604800, maintenantSec: 1000, owed: 0n }).ok);
  t('A vault claim call = claim(e) on the vault', EP.claimCall(3n).to === EP.VAULT && (!castOk || EP.claimCall(3n).data === cast('calldata', 'claim(uint256)', '3')));
  t('A expected budget = the vault\'s three caps in order (free x 50%, max, play x 50% x 2)', EP.budgetAttendu({ free: 1000n, totalPlay: 300n, rewardBps: 5000n, rebateBps: 5000n, maxBudget: 10000n }) === 300n
    && EP.budgetAttendu({ free: 1000n, totalPlay: 3000n, rewardBps: 5000n, rebateBps: 5000n, maxBudget: 400n }) === 400n && EP.budgetAttendu({ free: 100n, totalPlay: 3000n, rewardBps: 5000n, rebateBps: 5000n, maxBudget: 400n }) === 50n);
  t('A router: the USDC swapped = price minus the game\'s dev part (5 USDC, 10% -> 4.5 USDC)', EP.usdcEchange(5000000n, 1000n) === 4500000n && essai(() => EP.usdcEchange(5000000n, 1001n)) instanceof Error);
  t('A router minimum = quote x 0.99; refused when under the floor; equal to the floor passes', EP.minimumDepuisDevis({ devis: 1000000n, plancher: 750000n }).minOut === 990000n
    && !EP.minimumDepuisDevis({ devis: 1000000n, plancher: 990001n }).ok && EP.minimumDepuisDevis({ devis: 1000000n, plancher: 990000n }).ok && !EP.minimumDepuisDevis({ devis: 0n, plancher: 1n }).ok);
  const work = new Uint8Array([0x54, 0x41, 0x4d, 1, 9, 8, 7, 6]), seed = '0x' + 'ab'.repeat(32), pj = '{"a":1}';
  const dTam = EP.dataTam({ octets: work, graine: seed, paramsJson: pj });
  t('A TAM data = abi.encode(bytes work, bytes32 seed, bytes params) (as cast encodes it)', !castOk || '0x' + dTam === cast('abi-encode', 'f(bytes,bytes32,bytes)', '0x5441' + '4d01' + '09080706', seed, '0x' + Buffer.from(pj).toString('hex')));
  const dSk = EP.dataSkin({ block: blk, recipe: 123456789n });
  t('A skin data = abi.encode(address block, uint64 recipe)', !castOk || '0x' + dSk === cast('abi-encode', 'f(address,uint64)', blk, '123456789'));
  const pb = EP.payBatch({ game: EP.TAM, usdcIn: 5000000n, minOut: 777n, deadline: 1800000000, data: dTam });
  t('A pay batch: approve(router, EXACTLY the price) on USDC, then pay(game, price, min, deadline, data) on the router', pb.length === 2 && pb[0].to === EP.USDC && pb[1].to === EP.ROUTER
    && (!castOk || (pb[0].data === cast('calldata', 'approve(address,uint256)', EP.ROUTER, '5000000') && pb[1].data === cast('calldata', 'pay(address,uint256,uint256,uint256,bytes)', EP.TAM, '5000000', '777', '1800000000', '0x' + dTam))));
  t('A pay batch refuses another game, a zero minimum', essai(() => EP.payBatch({ game: EP.VAULT, usdcIn: 1n, minOut: 1n, deadline: 1, data: '' })) instanceof Error && essai(() => EP.payBatch({ game: EP.SKINS, usdcIn: 1n, minOut: 0n, deadline: 1, data: '' })) instanceof Error);
  const lk = await imp('lock.js');
  const le = EP.lockEtInscrire({ amount: 5n * E18, jours: 60, maintenantSec: 1800000000, holder: blk });
  const lb2 = lk.lockBatch({ amount: 5n * E18, jours: 60, maintenantSec: 1800000000 });
  t('A lock + enroll = the lock batch (approve exact + lock) then enroll(holder) on the lock rewards', le.length === 3 && le[0].data === lb2[0].data && le[1].data === lb2[1].data && le[2].to === EP.REWARDS
    && (!castOk || le[2].data === cast('calldata', 'enroll(address)', blk)));
  t('A monthly claim = claim(uint256[]) of the months; 1..24 months', (!castOk || EP.claimRewardsCall([2n, 1n]).data === cast('calldata', 'claim(uint256[])', '[2,1]')) && essai(() => EP.claimRewardsCall([])) instanceof Error
    && essai(() => EP.claimRewardsCall(Array.from({ length: 25 }, (_, i) => BigInt(i)))) instanceof Error);
  t('A claimable(holder, months[]) view encodes as cast does', !castOk || EP.VIEW.claimable(blk, [0n, 3n]).data === cast('calldata', 'claimable(address,uint256[])', blk, '[0,3]'));
  t('A realized rate of a closed month: pot / played weight x 365 / 30 (1 TBLOCK for 100 -> 12.16%); nobody played -> null', EP.aprPasse({ potTblock: E18, played: 100n * E18 }) === 12.16 && EP.aprPasse({ potTblock: E18, played: 0n }) === null);
  t('A months text: "earns N full months", and 0 says the 60 days minimum', EP.texteMois(2) === 'earns 2 full months' && EP.texteMois(1) === 'earns 1 full month' && /60 days minimum/.test(EP.texteMois(0)));
  t('A the vault rules text needs every rule read (a missing one = no sentence)', EP.texteRegleVault({}) === null);
  t('A dollars from USD x 1e18: $0.50, $15', EP.usd(5n * 10n ** 17n) === '$0.50' && EP.usd(15n * E18) === '$15');
}

console.log('— B. the TAM mint through the router');
const TP = await imp('tam-plan.js'), MS = await imp('misables.js');
if (EP && typeof TP.planMintTamRouteur === 'function') {
  const work = new Uint8Array([0x54, 0x41, 0x4d, 1, 1, 2, 3, 4]);
  const jeu = { genre: 'tam-routeur', contrat: EP.ROUTER, pack: EP, lu: { prix: 5000000n, devBps: 1000n, routeur: EP.ROUTER }, octets: work, graine: '0x' + '11'.repeat(32), paramsJson: '{}', minOut: 5n, deadline: 1800000000 };
  const p = MS.planJeuUsdc(jeu);
  t('B planJeuUsdc(tam-routeur) is PRET: approve USDC -> ROUTER exactly 5 USDC, then pay on the router', p.etat === 'PRET' && p.appels.length === 2 && p.appels[1].to === EP.ROUTER && MS.besoinDuJeu(p, EP.ROUTER) === 5000000n);
  t('B the plan says the dev part and the TBLOCK minimum in its words', /0\.50 USDC to the dev wallet/.test(p.appels[1].quoi) && /4\.50 USDC buys at least/.test(p.appels[1].quoi));
  t('B refused: a price read that is not 5 USDC, another router, no minimum', TP.planMintTamRouteur({ ...jeu, lu: { ...jeu.lu, prix: 1000000n } }).etat === 'REFUSE'
    && TP.planMintTamRouteur({ ...jeu, lu: { ...jeu.lu, routeur: EP.VAULT } }).etat === 'REFUSE' && TP.planMintTamRouteur({ ...jeu, minOut: 0n }).etat === 'REFUSE');
} else t('B planMintTamRouteur exists', false);

console.log('— C. one hearts index over two contracts');
const CI = await imp('coeurs-index.js'), CO = await imp('coeurs.js');
if (typeof CI.creerIndexCoeursSuite === 'function') {
  const L1 = '0x' + '11'.repeat(20), L2 = '0x' + '22'.repeat(20), top = (a) => '0x' + '0'.repeat(24) + a.slice(2);
  const log = (adr, tx) => ({ address: adr, topics: [CO.TOPIC_LIKED, '0x' + '0'.repeat(64), top('0xb2000000000000000000007afa7ed748b0874f27'), top('0x' + '33'.repeat(20))], data: '0x' + (1n).toString(16).padStart(64, '0') + (5n).toString(16).padStart(64, '0'), blockNumber: '0x10', transactionHash: tx, logIndex: '0x0' });
  let casse = true;
  const rpc = async (m, p) => { if (m === 'eth_blockNumber') return '0x20'; const q = p[0]; if (q.address === L2 && casse) throw new Error('refused'); return q.address === L1 ? [log(L1, '0x' + 'a1'.repeat(32))] : [log(L2, '0x' + 'a2'.repeat(32))]; };
  const ix = CI.creerIndexCoeursSuite({ rpc, sources: [{ likes: L1, depuis: 16 }, { likes: L2, depuis: 16 }], fenetre: 100 });
  await ix.avancer();
  t('C one contract unread -> not complete, its hole said with its contract', ix.complet() === false && ix.etat.trou && ix.etat.trou.contrat === L2 && ix.coeurs().length === 1);
  casse = false; await ix.avancer();
  t('C both read -> complete; every heart carries its contract', ix.complet() === true && ix.coeurs().length === 2 && ix.coeurs().map((c) => c.contrat).sort().join() === [L1, L2].join());
} else t('C creerIndexCoeursSuite exists', false);

console.log('— D. TAM works of both contracts');
const TS = await imp('tam-serveur.js');
{
  const T1 = '0x' + '44'.repeat(20), T2 = '0x' + '55'.repeat(20);
  let casse = false;
  const rpc = async (m, p) => {
    if (m === 'eth_blockNumber') return '0x100';
    if (m === 'eth_getBlockByNumber') return { number: '0x100', hash: '0x' + '77'.repeat(32) };
    if (m === 'eth_getLogs') { if (p[0].address === T1 && casse) throw new Error('refused'); return []; }
    const q = p[0];
    if (q.to === T1 && casse) throw new Error('refused');
    if (q.data.startsWith('0x18160ddd')) return '0x' + (0n).toString(16).padStart(64, '0');
    throw new Error('unexpected ' + q.data.slice(0, 10));
  };
  const s = TS.serveurTam({ rpc, deploiement: { adresse: T2, bloc: 10 }, autres: [{ adresse: T1, bloc: 5 }] });
  const o = await s.oeuvres();
  t('D the answer names the contract minted on now, and lists both contracts', o.ok === true && o.contrat === T2 && Array.isArray(o.parContrat) && o.parContrat.map((x) => x.contrat).join() === [T2, T1].join());
  casse = true;
  const s2 = TS.serveurTam({ rpc, deploiement: { adresse: T2, bloc: 10 }, autres: [{ adresse: T1, bloc: 5 }] });
  await s2.oeuvres();
  const c = await s2.certifierParams(Buffer.from('{"x":1}').toString('base64url'));
  t('D distinctness is refused while the earlier contract is unread (never measured against a list with a hole)', c.etat === 'NON_LU');
}

console.log('— E. skins');
const BA = await imp('blockskins-actif.js'), BS = await imp('blockskins.js');
const BD = (await imp('blockskins-deploiement.js')).BLOCKSKINS_DEPLOIEMENT;
const FC = (await imp('frais-contrats.js')).FRAIS_CONTRATS;
t('E the active skins contract is the pack\'s Skins, paid through the router', !!EP && BA.BLOCKSKINS === EP.SKINS && BA.BLOCKSKINS_ACTIF.routeur === EP.ROUTER);
t('E its price is MINT_PRICE of its source (frais-contrats.js, the source step S hashes)', BA.SKIN_MINT_USDC === BigInt(FC.BlockSkins.MINT_PRICE) && FC.BlockSkins.sha256Source === PACK.etapes.find((e) => e.lettre === 'S').sha256Source);
t('E its source carries the image in tokenURI (imageDansLeWallet)', /"image":"data:image\/svg\+xml;base64,/.test(lire('contracts/src/BlockSkins.sol')) && BA.SKIN_MINT_OUVERT === true);
const anciens = []; for (let x = BD; x; x = x.precedent) if (x.adresse) anciens.push(String(x.adresse).toLowerCase());
t('E every earlier deployed skins contract stays read, oldest first, the active one last', Array.isArray(BA.BLOCKSKINS_LUS) && BA.BLOCKSKINS_LUS[BA.BLOCKSKINS_LUS.length - 1] === BA.BLOCKSKINS && anciens.every((a) => BA.BLOCKSKINS_LUS.includes(a)));
t('E a market call goes to the skin\'s own contract; a foreign contract is refused', anciens.length > 0 && BS.appelRetirer(1n, anciens[0]).to === anciens[0] && BS.appelRegler(1n).to === BA.BLOCKSKINS
  && essai(() => BS.appelAcheter(1n, BS.ETH, 1n, '0x' + '66'.repeat(20))) instanceof Error);
t('E no direct mint on a router contract', essai(() => BS.appelMint('0xb2000000000000000000007afa7ed748b0874f27', { id: 'random', angle: 1, h: [1, 2, 3], cube: 4, noyau: 5, fond: 6 })) instanceof Error);
{
  const k = '0x' + '88'.repeat(20);
  const rpc = async (m, p) => { const q = p[0]; if (q.data.startsWith('0x18160ddd')) return '0x' + (q.to === k ? 1n : 0n).toString(16).padStart(64, '0'); return '0x' + (32n).toString(16).padStart(64, '0') + (1n).toString(16).padStart(64, '0') + '0'.repeat(64 * 11); };
  const r = await BS.lireSkins({ rpc, contrats: [k, BA.BLOCKSKINS] });
  t('E lireSkins reads every contract and tags each skin with its contract', r.etat === 'LU' && r.skins.length === 1 && r.skins[0].contrat === k);
}
const corps = BA.skinsPrixCorps();
t('E /api/skins/prix describes the router payment (exact approve to the router, then pay)', corps.format === 'router' && corps.router === EP?.ROUTER && corps.steps[0].spender === 'router' && /^pay\(/.test(corps.steps[1].call));

console.log('— F. the wiring, in the sources');
const app = lire('app.html'), srv = lire('serveur-web.js'), tam = lire('tam-onglet.js'), hol = lire('holders.html'), con = lire('contest.html');
const fn = (src, debut, taille = 9000) => { const i = src.indexOf(debut); return i < 0 ? '' : src.slice(i, i + taille); };
t('F app.html imports the live pack module', /import \* as EP from '\.\/economie-pack\.js';/.test(app));
const coeur = fn(app, 'async function bcCoeur(', 3200);
t('F the heart reads the price, the minimum and the LOCK, checks with EP.likeCheck and sends EP.likeBatch at the price read', /EP\.VIEW\.likePrice\(\)/.test(coeur) && /EP\.VIEW\.minHold\(\)/.test(coeur) && /LK\.VIEW\.activeLockedOf\(moi\)/.test(coeur)
  && /EP\.likeCheck\(/.test(coeur) && /EP\.likeBatch\(\{ block: a, n: 1, likePrice: prix \}\)/.test(coeur) && !/ECO\.likeBatch|ECO\.likeCheckUsd/.test(coeur));
t('F a block\'s hearts = the live ones + the first contract\'s (history kept)', /const n = n1 \+ n2;/.test(fn(app, 'function bcPeindreLike(', 2400)));
const vault = fn(app, 'async function peindreVaultWallet()', 12000); /* lot 378 task 6: the card is drawn, its function is longer */
t('F the vault card reads the live vault (play of the week, lock factor) and claims there; the first vault\'s owed weeks stay claimable',
  /EP\.VIEW\.totalPlayIn\(ep\)/.test(vault) && /EP\.VIEW\.lockFactor\(moi\)/.test(vault) && /EP\.claimCall\(e\)/.test(vault) && /EP\.claimCheck\(/.test(vault) && /ECO\.claimCall\(e\)/.test(vault) && /ECO\.VIEW\.owed\(e, moi\)/.test(vault));
const rec = fn(app, 'async function peindreRecompensesLock(', 7000);
t('F the lock card: rewards read on chain (month, played, enrolled, months earned, claimable, last closed month labelled as past)',
  /EP\.VIEW\.hasPlayed\(moi, c\)/.test(rec) && /EP\.VIEW\.rewardEpochsFor\(unlockAt\)/.test(rec) && /EP\.VIEW\.claimable\(moi, \[k\]\)/.test(rec) && /EP\.aprPasse\(/.test(rec) && /past, not a promise/.test(rec) && /EP\.enrollCall\(moi\)/.test(rec) && /EP\.claimRewardsCall\(aPayer\)/.test(rec));
t('F the lock button locks AND enrolls in one batch; 60 days offered; each duration says its months', /EP\.lockEtInscrire\(\{ amount: montant, jours, maintenantSec: Math\.floor\(Date\.now\(\) \/ 1000\), holder: moi \}\)/.test(app) && /EP\.MOIS_MIN_JOURS/.test(app) && /moisPour\.set\(j, EP\.decoderMois/.test(app));
t('F TAM: paid through the router (genre tam-routeur, contract = ROUTER, fresh quote), the optional buy removed, both galleries', /genre: 'tam-routeur', contrat: EP\.ROUTER/.test(tam) && /\/api\/tblock\/devis-routeur\?montant=/.test(tam) && !/AT\.|acheterTblock\(|tamAchatTblock/.test(tam)
  && /adresseTam\(EP\.TAM_DEPLOIEMENT\)/.test(tam) && /adresseTam\(TAMART_DEPLOIEMENT\)/.test(tam));
const skin = fn(app, 'async function bcAcheterSkin()', 9000);
t('F the skin is bought through the router on the pack\'s Skins (price, fee wallet, router read first; no direct mint)', /EP\.payBatch\(\{ game: EP\.SKINS/.test(skin) && /selecteur\('ROUTER\(\)'\)/.test(skin) && /EP\.minimumDepuisDevis/.test(skin) && !/appelMint\(/.test(skin));
t('F market calls carry the skin\'s contract (K) in app.html and in the brain', /appelRegler\(s\.tokenId, K\)/.test(app) && /appelMettreEnVente\(s\.tokenId, x\.devise, x\.brut, K\)/.test(app) && /appelAcheter\(id, S\.usdc, m, k\)/.test(lire('brain-jeu.js')));
t('F server: one hearts index over the first contract and Hearts (from the record, from its creation block)', /creerIndexCoeursSuite\(\{ rpc: rpcCoeurs, sources: \[/.test(srv) && /likes: EP_PACK\.HEARTS, depuis: EP_PACK\.BLOC_DEPLOIEMENT\.L/.test(srv) && /semainesParContrat/.test(srv));
t('F server: TAM works from TAM art and the first TamArt; the router quote route; the new modules served', /serveurTam\(\{ rpc: rpcServeur, deploiement: EP_PACK\.TAM_DEPLOIEMENT, autres: \[TAMART_DEPLOIEMENT\]/.test(srv)
  && /if \(chemin === '\/api\/tblock\/devis-routeur'\)/.test(srv) && /'economie-v2-pack-deploye\.js', 'economie-pack\.js',/.test(srv));
t('F holders page reads the live contracts on Base (no fixed thresholds of the first contracts)', /import \* as EP from '\.\/economie-pack\.js';/.test(hol) && !/LIKE_PRICE|CLAIM_MIN_HOLD|LIKE_MIN_HOLD/.test(hol) && /EP\.texteRegleVault/.test(hol));
t('F contest page: the live vault claim (checked) + the first vault\'s owed weeks', /EP\.claimCheck\(/.test(con) && /EP\.claimCall\(BigInt\(d\.claimweek\)\)/.test(con) && /ECO\.claimCall\(BigInt\(d\.claimweek1\)\)/.test(con));
const six = Object.values(A);
const edites = ['app.html', 'serveur-web.js', 'tam-onglet.js', 'tam-plan.js', 'tam-serveur.js', 'holders.html', 'contest.html', 'frais-risques.js', 'blockskins.js', 'blockskins-actif.js', 'misables.js', 'coeurs-index.js', 'tblock-route.js', 'brain-jeu.js', 'economie-pack.js'];
t('F none of the six addresses is typed in an edited file', edites.every((f) => { const s = lire(f).toLowerCase(); return six.every((a) => !s.includes(a)); }));
/* Phil's copy rule: no internal status or version word in the new on-screen sentences */
const nouveaux = [coeur, vault, rec, skin, fn(tam, 'function peindreMint()', 2600), fn(tam, 'async function preparerMint(', 6000)].join('\n');
t('F the new on-screen sentences carry no version or internal status word', !/\b(v2|V2|v1|V1|not deployed|under review|deployed yet|BlockLikesV2|TBlockVaultV2|TamArtV2|TBlockLockRewards)\b/.test(nouveaux.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));

console.log('— G. the fees page');
const FR = await imp('frais-risques.js');
const page = FR.rendre(FR.CHIFFRES, null).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
t('G the skins shown are the active contract (the pack\'s Skins)', !!EP && FR.CHIFFRES.skins.adresse === EP.SKINS);
t('G TAM art and skins: paid through the router, the dev part and the router floor from their sources', page.includes('TAM art mint 5 USDC Paid through the TBLOCK payment router: 10% (0.50 USDC) stays USDC for TokenizedBlock')
  && page.includes('the router refuses any minimum under 75% of the pools\' spot value') && page.includes('Skin 10 USDC Paid through the TBLOCK payment router, like TAM art: 10% (1 USDC)'));
t('G the optional buy after a USDC payment is gone', !page.includes('Optional TBLOCK buy after a USDC payment'));
t('G hearts in dollars at the kept price, needing a lock', page.includes('Heart (+1) $0.50 of TBLOCK') && page.includes('A heart needs $15 of TBLOCK locked'));
t('G the weekly vault with its tiers, and the monthly lock rewards with the 60 days minimum', page.includes('+15% from $100 locked, +30% from $500 locked, +50% from $1,000 locked') && page.includes('60 days minimum to be sure of one') && page.includes('Monthly lock rewards.'));
t('G a changed source moves the page (the dev part)', (() => { const C = structuredClone ? null : null; const c2 = { ...FR.CHIFFRES, tam: { ...FR.CHIFFRES.tam, devBps: 500n } }; return FR.rendre(c2, null).includes('5% (0.25 USDC) stays USDC'); })());

console.log('— H. on chain (eth_call only, two nodes)');
if (process.env.HORS_LIGNE === '1') console.log('  SKIPPED: HORS_LIGNE=1 — nothing below was read on chain');
else if (EP) {
  for (const url of ['https://mainnet.base.org', 'https://base-rpc.publicnode.com']) {
    const rpc = async (m, p) => { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }), signal: AbortSignal.timeout(20000) }); const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result; };
    const lit = async (v) => EP.word(await rpc('eth_call', [{ to: v.to, data: v.data }, 'latest']));
    const nom = url.replace('https://', '');
    try {
      const L0 = PACK.etapes[0].config;
      t('H ' + nom + ': Hearts LIKE_USD_E18 / HOLD_USD_E18 = the pack config', (await lit(EP.VIEW.likeUsd())) === BigInt(L0.likeUsdE18) && (await lit(EP.VIEW.holdUsd())) === BigInt(L0.holdUsdE18));
      const [pr, mh] = [await lit(EP.VIEW.likePrice()), await lit(EP.VIEW.minHold())];
      t('H ' + nom + ': likePrice x 30 ~ minHold ($0.50 vs $15, same kept price, both rounded up)', pr > 0n && mh >= pr * 30n - 30n && mh <= pr * 30n);
      t('H ' + nom + ': TAM art PRICE_USDC and USDC_SPLIT = its source; Skins MINT_PRICE = the price shown', (await lit(EP.VIEW.prixJeu(EP.TAM))) === BigInt(FC.TamArtV2.PRICE_USDC)
        && EP.word(await rpc('eth_call', [EP.VIEW.partJeu(EP.TAM), 'latest']), 1) === BigInt(FC.TamArtV2.DEV_BPS) && (await lit(EP.VIEW.mintPriceSkin())) === BA.SKIN_MINT_USDC);
      t('H ' + nom + ': every vault rule the page reads equals its source', await (async () => { for (const k of EP.REGLES_VAULT) { const v = await lit(EP.VIEW.regleVault(k)); const s = FC.TBlockVaultV2[k] ?? { CLAIM_WINDOW: PACK.etapes[4].config.claimWindow, REWARD_BPS: PACK.etapes[4].config.rewardBps, REBATE_BPS: PACK.etapes[4].config.rebateBps, TOP_BPS: PACK.etapes[4].config.topBps }[k]; if (v !== BigInt(s)) return false; } return true; })());
      const now = BigInt(Math.floor(Date.now() / 1000));
      const m60 = EP.decoderMois(await rpc('eth_call', [EP.VIEW.rewardEpochsFor(now + 60n * 86400n + 3600n), 'latest'])), m7 = EP.decoderMois(await rpc('eth_call', [EP.VIEW.rewardEpochsFor(now + 7n * 86400n), 'latest']));
      t('H ' + nom + ': a 60-day lock earns at least one whole month, a 7-day lock none (rewardEpochsFor)', m60.n >= 1 && m7.n === 0);
      const f = await lit(EP.VIEW.minOutFloor(4500000n));
      t('H ' + nom + ': the router floor for 4.5 USDC reads as a positive amount', f > 0n);
    } catch (e) { t('H ' + nom + ' read: ' + String(e.message || e).slice(0, 80), false); }
  }
}

console.log((ko ? 'FAILED ' + ko + ' of ' : 'ALL ') + n + ' checks' + (ko ? '' : ' hold'));
process.exit(ko ? 1 : 0);
