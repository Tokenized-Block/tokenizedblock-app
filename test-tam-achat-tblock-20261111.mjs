/* test-tam-achat-tblock-20261111.mjs — game358 wiring. AFFIRME on the REAL tam-onglet.js / app.html / serveur-web.js:
 *   - the TAM mint offers "Also buy TBLOCK with 0.50 USDC (10%) — it goes to your wallet", ticked, only for USDC and only when the page
 *     gives the buy route; the amount is decided at the click and said in "You sign" BEFORE the wallet opens;
 *   - the buy runs only AFTER a confirmed mint, and the mint is reported as done whatever the buy does;
 *   - the page's buy goes through AT.urlPlanAchat + AT.verifierPlanAchat before envoyerAppels (no unchecked plan reaches the wallet);
 *   - the module is served (SERVIS) and TamArt is not touched.
 * NE PROUVE PAS: the swap (banc-achat-tblock-usdc-fork-20261111.mjs, 8/8 on a fork), the rendering, a real wallet. */
import { readFileSync } from 'node:fs';
const rd = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const TAM = rd('tam-onglet.js'), APP = rd('app.html'), SRV = rd('serveur-web.js');
let ok = 0, ko = 0;
const t = (m, c) => { if (c) ok++; else { ko++; console.log('KO', m); } };
t('TAM imports the buy module', TAM.includes("import * as AT from './achat-tblock-usdc.js';"));
t('the option is ticked by default and named by the module', TAM.includes("el('input', { type: 'checkbox', id: 'tamAchatTblock', checked: true })") && TAM.includes('AT.texteOption(achat)'));
t('offered only for USDC, a non-zero leg, and a page that gives the route', TAM.includes("labAchat.hidden = !(achat > 0n && typeof ctx.acheterTblock === 'function' && selPay.value === 'usdc');")
  && TAM.includes("selPay.addEventListener('change', majAchat);"));
t('decided at the click, unticked = 0', TAM.includes("achat: () => (!labAchat.hidden && cbAchat.checked ? achat : 0n)") && TAM.includes("const montantAchat = selPay.value === 'usdc' ? achat() : 0n;"));
t('"You sign" says the second step before the wallet opens', TAM.includes("montantAchat > 0n ? el('p', { text: 'Then: ' + AT.texteOption(montantAchat)"));
const clic = TAM.slice(TAM.indexOf("const minte = !!(res &&"), TAM.indexOf("const minte = !!(res &&") + 900);
t('the buy runs only after a confirmed mint', /if \(minte && montantAchat > 0n\) \{/.test(clic) && clic.indexOf('ctx.acheterTblock(') > clic.indexOf('if (minte && montantAchat > 0n)'));
t('the mint is reported done whatever the buy does', clic.includes("dit.textContent = 'Minted. It appears in the gallery once the block is read. ' + String((b && b.texte) || '');"));
const f = APP.slice(APP.indexOf('async function acheterTblockUsdc('), APP.indexOf('async function envoyerPaiementJeton('));
t('app: plan asked by the module URL, checked by the module, THEN sent', f.indexOf('AT.urlPlanAchat(') > 0 && f.indexOf('AT.verifierPlanAchat(') > f.indexOf('AT.urlPlanAchat(')
  && f.indexOf("if (!v.ok) return { ok: false, texte: 'TBLOCK not bought: ' + v.pourquoi + '.' };") > 0 && f.indexOf('envoyerLotAtomique(') > f.indexOf('if (!v.ok) return'));
/* game361 (Phil: "les paiements doivent faire un achat en TBLOCK" — Rabby bought nothing): batch when offered, else one by one, READ result */
t('game361: a batching wallet gets ONE all-or-nothing batch (no silent fallback inside it)', f.includes("if (cap !== null && cap.capacite === 'OUI') {") && f.includes('sansRepliV1: true'));
t('game361: a wallet without batching still buys — the same calls signed one by one', f.includes('r = await envoyerUnParUn(appels, c);') && !f.includes('this buy needs one all-or-nothing batch and this wallet does not offer one'));
t('game361: success is READ (TBLOCK balance before / after), never assumed', f.includes('const t0 = await lireT(), w0 = await lireW();') && f.includes('if (t0 !== null && t1 !== null && t1 > t0) return { ok: true,'));
t('game361: stopped between the legs -> finished from the wtCOIN (Create step 1 resume route)', f.includes("'/api/tblock/vault-buy?reprise=1&compte='") && f.includes('w1 - w0 >= TIP.WTCOIN_RESUME_MIN'));
t('game361: never envoyerAppels (its silent fallback) for this buy', !f.includes('envoyerAppels('));
t('review 358: the buy belongs to the wallet that paid', f.includes("if (payeur && String(payeur).toLowerCase() !== String(c).toLowerCase()) return") && TAM.includes('}, c);') && APP.includes('acheterTblock: (montant, dire, payeur) => acheterTblockUsdc(montant, dire, payeur)'));
t('review 358: a change of the box or of Pay with clears the summary', TAM.includes("selPay.addEventListener('change', perime);") && TAM.includes("cbAchat.addEventListener('change', perime);"));
t('review 358: gallery refreshed before the buy', clic.indexOf('void galerie();') > 0 && clic.indexOf('void galerie();') < clic.indexOf('ctx.acheterTblock('));
t('app: no wallet = no buy, said', f.includes("if (!c) return { ok: false, texte: 'TBLOCK not bought: no wallet connected.' };"));
t('app: never throws (catch on the fetch and the send)', (f.match(/catch \(/g) || []).length >= 2);
t('app: the TAM context gets the route', APP.includes('acheterTblock: (montant, dire, payeur) => acheterTblockUsdc(montant, dire, payeur), /* game358 */'));
t('app imports the module', APP.includes("import * as AT from './achat-tblock-usdc.js';"));
t('server serves the module', SRV.includes("'achat-tblock-usdc.js'"));
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
