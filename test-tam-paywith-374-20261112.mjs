/* test-tam-paywith-374-20261112.mjs — Phil 2026-11-12: "Pay with USDC" next to "Mint this work — 5 USDC" goes away (the mint button
 *   does the same), and the mint is labelled $5 ("change pour 5$ de TBLOCK, logique avec la mise a jour qui va sortir").
 * HISTORY: written on game373 when the mint went straight to the first TamArt (PRICE() = 5 USDC to the fee wallet, the TBLOCK buy an
 *   optional second leg). MERGED 2026-11-12 on the economy pack: the mint now goes to TAM art THROUGH the TBLOCK payment router, which
 *   itself turns most of the price into TBLOCK for the holders vault — so the "$5 of TBLOCK" Phil asked for is now what the payment does,
 *   and the separate optional leg is gone (test-tam-achat-tblock-20261111.mjs pins that removal). The clauses below pin the merged truth.
 * AFFIRME on the REAL tam-onglet.js:
 *   - no "Pay with" selector (no #tamPayer, no selPay, no token list optionsPayer, no ctx.preparer / ctx.payer path) ;
 *   - the button reads "Mint this work — $5" and a line under it says how it is paid (through the router, TBLOCK for the holders vault) ;
 *   - "You sign" gives the amounts from the plan (dev part, USDC swapped, minimum TBLOCK) — none typed in the text ;
 *   - no version name (v2 / V8) in the mint zone ;
 *   - the mint flow: the router plan (genre tam-routeur, minOut from a fresh quote) is what is sent, USDC only ;
 *   - no separate TBLOCK leg, no Pay-with change handler left behind.
 * NE PROUVE PAS: the rendering in a browser, a real wallet, the router's execution (banc-bascule-pack-fork-20261112.mjs does, on a fork). */
import { readFileSync } from 'node:fs';
const TAM = readFileSync(new URL('./tam-onglet.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let ok = 0, ko = 0;
const t = (m, c) => { if (c) { ok++; console.log('ok', m); } else { ko++; console.log('KO', m); } };
const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const mint = TAM.slice(TAM.indexOf('function peindreMint() {'), TAM.indexOf('async function lireContrat('));
const prep = TAM.slice(TAM.indexOf('async function preparerMint('), TAM.indexOf('/* ── game374 : Replay'));
t('no Pay with selector', !TAM.includes("id: 'tamPayer'") && !/text: 'Pay with'/.test(TAM) && !/'aria-label': 'Pay with'/.test(TAM));
t('no selPay left anywhere', !/\bselPay\b/.test(TAM));
t('no token list / token payment path (optionsPayer, ctx.preparer, ctx.payer)', !TAM.includes('optionsPayer') && !TAM.includes('ctx.preparer') && !TAM.includes('ctx.payer'));
t('button reads "Mint this work — $5"', mint.includes("text: 'Mint this work — $5'") && !/'Mint this work — 5 USDC'/.test(sansCommentaires(TAM)));
const ligne = (mint.match(/id: 'tamMintNote', text: '([^']*)'/) || [])[1] || '';
t('a line under the button says how it is paid: through the router, TBLOCK for the holders vault', /TBLOCK payment router/.test(ligne) && /buys TBLOCK for the holders vault/.test(ligne)
  && mint.includes("zMint.replaceChildren(el('div', { class: 'tamRang' }, bMint), note, signe, dit);"));
t('"You sign" reads its amounts from the plan, none typed', /EP\.usdcTexte\(rs\.prixUsdc\)/.test(prep) && /EP\.usdcTexte\(rs\.devUsdc\)/.test(prep) && /EP\.usdcTexte\(rs\.achatUsdc\)/.test(prep) && /EP\.fmt\(rs\.minTblock\)/.test(prep));
t('no v2 / V8 named in the mint zone', !/\bv2\b|\bV8\b/i.test(sansCommentaires(mint)) && !/\bv2\b|\bV8\b/i.test(sansCommentaires(prep)));
t('mint flow: the router plan is what is sent, USDC only', prep.includes("const jeu = { genre: 'tam-routeur', contrat: EP.ROUTER,") && prep.includes('const planUsdc = planJeuUsdc(jeu);')
  && prep.includes("const pj = { ok: true, plan: planUsdc, sym: 'USDC', phrase: 'Paid as ' + EP.usdcTexte(planUsdc.resume.prixUsdc) + ' USDC.' };") && prep.includes('await ctx.envoyer(pj, c,'));
t('the minimum comes from a fresh quote, never under the router floor', prep.includes('const mr = await minimumRouteur(lu);') && TAM.includes('EP.minimumDepuisDevis({ devis: q.devis, plancher })'));
t('no separate TBLOCK leg (no box, no second step)', !TAM.includes('tamAchatTblock') && !TAM.includes('labAchat') && !TAM.includes('ctx.acheterTblock(') && !/\bmontantAchat\b/.test(TAM));
t('no Pay-with change handler left behind', !/\bperime\b/.test(mint));
t('Mint button wired to preparerMint', mint.includes("bMint.addEventListener('click', () => preparerMint({ signe, dit }));") && TAM.includes('async function preparerMint({ signe, dit }) {'));
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
