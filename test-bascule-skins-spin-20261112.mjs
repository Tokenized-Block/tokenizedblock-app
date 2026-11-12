/* test-bascule-skins-spin-20261112.mjs — THE APP FOLLOWS THE 1 USDC SKINS AND THE NEW SPIN ONLY BEHIND THEIR RECORD.
 * WHY: Phil 2026-11-12. With adresse null in skins-spin-deploiement.js nothing may change on screen or on the server. Once the noter wrote
 *   both addresses: the Skins tile and market mint on the 1 USDC Skins (the earlier collections stay read, so skin #1 stays visible and
 *   sellable), the Games spin uses the new Spin, the keeper settles the new Spin AND the earlier one, the fees page says 1 USDC, that a skin
 *   mint is not a play, and that the spin's dev share buys TBLOCK through the router.
 * A  EXECUTED  today (adresse null): the active Skins is the pack's Skins at 10 USDC, SKINS_MINT = S, a skin counts as play, the served Spin
 *              is the live one (no router part, no earlier Spin), the XP sources are the two of before, the fees page says as before.
 * B  EXECUTED  a NOTED record (built by noterPaire from stub receipts, in a COPY of the app modules, the tree untouched): every module
 *              above switches as said; the earlier skins contracts stay in BLOCKSKINS_LUS; a market call on the pack's Skins still builds;
 *              the router batch for the 1 USDC Skins = approve(P, 1 USDC) + pay(new Skins, 1 USDC, ...); the new sentences carry no jargon.
 * C  EXECUTED  a new Spin whose prize table differs from the live one is NOT served (the stated odds would be wrong): the live one stays.
 * D  SOURCE    serveur-web.js serves /api/slots from spin-actif.js with devRouteur, gives the keeper slotsAvant, uses sourcesSkins, serves
 *              the new files; app.html mints on EP.SKINS_MINT and says the router part of a spin; holders.html follows EP.SKINS_JOUE.
 * MUTANT_FICHIER + MUTANT_CHEMIN (muter-skins-spin.mjs): a mutated module is put in the module COPY under its own name. Counts itself. */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ICI = dirname(fileURLToPath(import.meta.url));
const imp = (dir, f) => import(pathToFileURL(join(dir, f)).href);
let n = 0, ko = 0;
const t = (label, cond) => { n += 1; if (cond === true) console.log('  ok   ' + label); else { ko += 1; console.log('  KO   ' + label); } };
const lire = (f) => readFileSync(join(ICI, f), 'utf8');
const texte = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const JARGON = /not deployed|under review|fork test|\bv2\b|\bv3\b|\bV8\b/i;

/* a copy of the app modules (root .js/.json), optionally with a noted record and mutated modules */
function copie(record, mutants = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'skspin-app-'));
  for (const f of readdirSync(ICI)) if (/\.(js|json)$/.test(f) && !f.startsWith('.mutant')) copyFileSync(join(ICI, f), join(dir, f));
  if (record) writeFileSync(join(dir, 'skins-spin-deploiement.js'), record);
  for (const [nom, chemin] of Object.entries(mutants)) if (chemin) copyFileSync(chemin, join(dir, nom));
  return dir;
}
/* MUTANT_FICHIER / MUTANT_CHEMIN (muter-skins-spin.mjs): the mutated module, copied into the module COPY under its own name */
const MUT = process.env.MUTANT_FICHIER && process.env.MUTANT_CHEMIN ? { [process.env.MUTANT_FICHIER]: process.env.MUTANT_CHEMIN } : {};
const SPIN_ACTIF_SRC = MUT['spin-actif.js'] || join(ICI, 'spin-actif.js');

const SS = await imp(ICI, 'skins-spin.js');
const { SKINS_SPIN_DEPLOIEMENT: R } = await imp(ICI, 'skins-spin-deploiement.js');
const { SLOTS_DEPLOIEMENT: SL } = await imp(ICI, 'slots-deploiement.js');
const { ADRESSES_PACK_ECONOMIE_V2: AP } = await imp(ICI, 'economie-v2-pack-deploye.js');
const { BLOCKSKINS_DEPLOIEMENT } = await imp(ICI, 'blockskins-deploiement.js');
const { adresseCreate } = await imp(ICI, 'pack-economie-v2.js');

console.log('— A. today: adresse null, nothing changes');
{
  const dir = copie(null, MUT);
  try {
    const AC = await imp(dir, 'blockskins-actif.js'), EP = await imp(dir, 'economie-pack.js'), SA = await imp(dir, 'spin-actif.js'), FR = await imp(dir, 'frais-risques.js');
    t('A the active Skins is the pack\'s Skins (S) at 10 USDC', AC.BLOCKSKINS === AP.S && AC.SKIN_MINT_TEXTE === '10 USDC' && AC.SKINS_UN === null);
    t('A the Skins the app mints on is S, and a skin counts as play', EP.SKINS_MINT === EP.SKINS && EP.SKINS === AP.S && EP.SKINS_JOUE === true);
    t('A the served Spin is the live one, no router part, no earlier Spin', SA.SPIN_ACTIF.contrat === SL.adresse && SA.SPIN_ACTIF.bloc === SL.bloc && SA.SPIN_ACTIF.devRouteur === null && SA.SPIN_ACTIF.avant === null);
    const anc = AC.contratActif(BLOCKSKINS_DEPLOIEMENT);
    t('A the XP sources are the two of before (skins = ' + anc.adresse.slice(0, 6) + '…, skinsPack = S)', JSON.stringify(AC.sourcesSkins()) === JSON.stringify([{ cle: 'skins', contrat: anc.adresse, bloc: anc.blocDeploiement }, { cle: 'skinsPack', contrat: AP.S, bloc: AC.SKINS_PACK.blocDeploiement }]));
    const page = texte(FR.rendre(FR.CHIFFRES, null));
    t('A fees page: the skin row as before (10 USDC, no "does not count as play")', /Skin 10 USDC/.test(page) && !/A skin mint does not count as play/.test(page));
    t('A fees page: the spin row as before (no router batches)', /the rest to TokenizedBlock\. Prizes from/.test(page) && !/paid out in batches/.test(page));
    t('A fees page: the vault and lock rewards still name skin mints', /TAM art and skin mints bought/.test(page) && /a heart, a TAM art mint or a skin mint/.test(page));
    t('A holders vault rule text names skins', /\(hearts, TAM art, skins\)/.test(EP.texteRegleVault(Object.fromEntries(EP.REGLES_VAULT.map((k) => [k, 1n])))));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

console.log('— B. a noted record: everything follows it');
const N = 412, W = R.deployeur;
const H = ['0x' + 'a1'.repeat(32), '0x' + 'b2'.repeat(32)];
const hx = (x) => '0x' + BigInt(x).toString(16);
const note = await SS.noterPaire({ rec: R, hashes: H, verdicts: [{ ok: true }, { ok: true }],
  txs: [0, 1].map((k) => ({ hash: H[k], from: W, to: null, nonce: hx(N + k), input: SS.creationEtape(R, k), blockNumber: hx(56700000 + k) })),
  recus: [0, 1].map((k) => ({ transactionHash: H[k], status: '0x1', contractAddress: adresseCreate(W, N + k), blockNumber: hx(56700000 + k) })) });
t('B the stub note is accepted by noterPaire', note.ok === true);
const SK1 = adresseCreate(W, N).toLowerCase(), SP1 = adresseCreate(W, N + 1).toLowerCase();
{
  const dir = copie(note.texte, MUT);
  try {
    const AC = await imp(dir, 'blockskins-actif.js'), EP = await imp(dir, 'economie-pack.js'), SA = await imp(dir, 'spin-actif.js'), FR = await imp(dir, 'frais-risques.js'), BS = await imp(dir, 'blockskins.js');
    t('B the active Skins is the 1 USDC Skins, paid through the router P', AC.BLOCKSKINS === SK1 && AC.SKIN_MINT_TEXTE === '1 USDC' && AC.BLOCKSKINS_ACTIF.routeur === AP.P);
    t('B the earlier skins contracts stay read (skin #1 visible and sellable): the pack\'s Skins and the older ones, the new one last',
      AC.BLOCKSKINS_LUS[AC.BLOCKSKINS_LUS.length - 1] === SK1 && AC.BLOCKSKINS_LUS.includes(AP.S) && AC.BLOCKSKINS_LUS.length === 4);
    let marche = null; try { marche = BS.appelAcheter(1n, '0x0000000000000000000000000000000000000000', 1000000n, AP.S); } catch (e) { marche = e; }
    t('B a market call on the pack\'s Skins still builds, to that contract', marche && !(marche instanceof Error) && String(marche.to || '').toLowerCase() === AP.S);
    const corps = AC.skinsPrixCorps();
    t('B /api/skins/prix: router payment on the 1 USDC Skins, 1 USDC', corps.format === 'router' && corps.contract === SK1 && corps.priceUsdc === '1000000' && corps.router === AP.P);
    t('B the XP sources keep the two of before and add skinsUn from its own block', JSON.stringify(AC.sourcesSkins().map((s) => s.cle)) === '["skins","skinsPack","skinsUn"]' && AC.sourcesSkins()[2].contrat === SK1 && AC.sourcesSkins()[2].bloc === 56700000);
    t('B economie-pack: SKINS stays S (the vault and rewards game), SKINS_MINT = the 1 USDC Skins, not a play', EP.SKINS === AP.S && EP.SKINS_MINT === SK1 && EP.SKINS_JOUE === false);
    const [ap, pay] = EP.payBatch({ game: EP.SKINS_MINT, usdcIn: 1000000n, minOut: 1n, deadline: 2000000000n, data: EP.dataSkin({ block: '0xb2000000000000000000007afa7ed748b0874f27', recipe: 1n }) });
    t('B the batch: approve(P, exactly 1 USDC) on USDC, then pay(1 USDC Skins, 1 USDC, …) on P', ap.to === EP.USDC && ap.data === '0x095ea7b3' + EP.wAddr(AP.P) + EP.wUint(1000000n)
      && pay.to === AP.P && pay.data.slice(10, 74) === EP.wAddr(SK1) && pay.data.slice(74, 138) === EP.wUint(1000000n));
    t('B the mint price is read on the 1 USDC Skins', EP.VIEW.mintPriceSkin().to === SK1);
    t('B the holders vault rule text no longer names skins', /\(hearts, TAM art\)/.test(EP.texteRegleVault(Object.fromEntries(EP.REGLES_VAULT.map((k) => [k, 1n])))));
    const S = SA.SPIN_ACTIF;
    t('B the served Spin is the new one; its dev part goes through P to V, 10 %, 1 to 10 USDC a batch', S.contrat === SP1 && S.bloc === 56700001 && S.devRouteur && S.devRouteur.routeur === AP.P && S.devRouteur.vault === AP.V
      && S.devRouteur.devBps === 1000 && S.devRouteur.minBatch === '1000000' && S.devRouteur.maxBatch === '10000000');
    t('B the earlier Spin is kept for the keeper (its address, block and table)', S.avant && S.avant.contrat === SL.adresse && S.avant.bloc === SL.bloc && S.avant.table.join() === SL.constructeur.prizes.map(String).join());
    t('B the price, pot share and prizes served are the live Spin\'s', S.config.spinPrice === String(SL.constructeur.spinPrice) && S.config.potShareBps === SL.constructeur.potShareBps && S.config.prizes.join() === SL.constructeur.prizes.map(String).join());
    const page = texte(FR.rendre(FR.CHIFFRES, null));
    t('B fees page: Skin 1 USDC, through the router, and not a play', /Skin 1 USDC Paid through the TBLOCK payment router/.test(page) && /A skin mint does not count as play for the holders vault or the monthly lock rewards\./.test(page));
    const ligne = (page.match(/Slots spin 0\.50 USDC[^]*?of the time\./) || [''])[0];
    t('B fees page: the spin\'s dev part paid in batches of 1 to 10 USDC through the router, 10 % USDC, the rest TBLOCK for the vault', /\(0\.25 USDC a spin\), paid out in batches of 1 USDC to 10 USDC through the TBLOCK payment router: 10% of each batch stays USDC for TokenizedBlock, the rest buys TBLOCK for the holders vault\. A spin does not count as play\./.test(ligne));
    t('B fees page: the vault and lock rewards no longer name skin mints', /the TBLOCK their TAM art mints bought/.test(page) && /\(a heart or a TAM art mint\)/.test(page) && !/a TAM art mint or a skin mint/.test(page));
    const neuves = ['A skin mint does not count as play for the holders vault or the monthly lock rewards.', ligne, 'That part is paid out in batches through the TBLOCK payment router: 10% of each batch stays USDC, the rest buys TBLOCK for the holders vault.'];
    t('B the new sentences carry no internal jargon', neuves.every((s) => s && !JARGON.test(s)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

console.log('— C. a new Spin with another table is not served');
{
  const autre = JSON.parse(JSON.stringify(note.rec));
  autre.etapes[1].config.prizes[15] = '4000000';
  const s = (await import(pathToFileURL(SPIN_ACTIF_SRC).href)).spinActif(SL, autre);
  t('C another prize table: the live Spin stays served, the reason said', s.contrat === SL.adresse && s.devRouteur === null && /does not keep the price, pot share and prizes/.test(s.refus));
  const s2 = (await import(pathToFileURL(SPIN_ACTIF_SRC).href)).spinActif(SL, note.rec);
  t('C the same table: the new Spin is served', s2.contrat === SP1 && s2.refus === null);
}

console.log('— D. the server, the app, the holders page (source)');
const SRV = lire('serveur-web.js'), APP = lire('app.html'), HOL = lire('holders.html');
const route = SRV.slice(SRV.indexOf("if (chemin === '/api/slots') {"), SRV.indexOf('/* ══ LES DUELS (2026-10-18)'));
t('D /api/slots serves SPIN_ACTIF (contract, block, config) and its devRouteur and earlier contract', /const contratSlots = SPIN_ACTIF \? SPIN_ACTIF\.contrat : null;/.test(route) && /const sc = SPIN_ACTIF\.config;/.test(route)
  && /devRouteur: SPIN_ACTIF\.devRouteur, contratAvant:/.test(route) && /bloc: SPIN_ACTIF\.bloc/.test(route));
t('D the keeper settles the served Spin and gets the earlier one as slotsAvant', /contrat: contratSlotsFiche, chainId: SLOTS_DEPLOIEMENT\.chaine, table: SPIN_ACTIF \? SPIN_ACTIF\.config\.prizes/.test(SRV)
  && /slotsAvant: SPIN_ACTIF && SPIN_ACTIF\.avant \? \{ contrat: SPIN_ACTIF\.avant\.contrat, table: SPIN_ACTIF\.avant\.table, bloc: SPIN_ACTIF\.avant\.bloc \} : null,/.test(SRV)
  && /const contratSlotsFiche = SPIN_ACTIF \? SPIN_ACTIF\.contrat : null;/.test(SRV));
t('D the XP sources come from sourcesSkins()', /\.\.\.sourcesSkins\(\)\.map\(\(s\) => \(\{ cle: s\.cle, genre: 'skins'/.test(SRV));
const servis = new Set([...(SRV.match(/const SERVIS\s*=\s*\[([\s\S]*?)\];/) || [, ''])[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
t('D the deploy page, the record, skins-spin.js and spin-actif.js are served', ['deployer-skins-spin.html', 'skins-spin-deploiement.js', 'skins-spin.js', 'spin-actif.js'].every((f) => servis.has(f)));
t('D app.html mints on EP.SKINS_MINT (the check and the batch), never on EP.SKINS', (APP.match(/EP\.SKINS_MINT/g) || []).length === 2 && !/EP\.SKINS\b(?!_)/.test(APP));
t('D app.html says the router part of a spin only when /api/slots serves devRouteur', /\+ \(j\.devRouteur && Number\(j\.devRouteur\.devBps\) > 0 \? ' That part is paid out in batches through the TBLOCK payment router: '/.test(APP));
t('D holders.html: the three play sentences follow EP.SKINS_JOUE, the skin split is read on EP.SKINS_MINT', (HOL.match(/EP\.SKINS_JOUE \?/g) || []).length === 3 && /EP\.VIEW\.partJeu\(EP\.SKINS_MINT\)/.test(HOL));
for (const f of ['skins-spin.js', 'spin-actif.js', 'blockskins-actif.js', 'economie-pack.js', 'frais-risques.js', 'serveur-web.js', 'app.html', 'holders.html', 'slots-regleur.js', 'skins-spin-deploiement.js', 'deployer-skins-spin.html'])
  t('D ' + f + ' has no CR byte', !lire(f).includes('\r'));
console.log(n - ko + '/' + n + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
