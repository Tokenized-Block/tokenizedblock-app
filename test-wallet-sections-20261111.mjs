/* test-wallet-sections-20261111.mjs — game357 (Phil 2026-11-11: "refonte ui de la section wallet, ya trop d'info et faut scroller";
 *   "le lock qui est important"; "tu peux retirer l'unit"). AFFIRME on the REAL app.html / holders.html / lock.js:
 *   - the Wallet tab shows ONE section at a time (Holders default / Assets / Cash in / Bank) and the Holders card ONE panel at a time
 *     (Lock default / Points / Hearts / How it works), by CSS on data-w / data-v — never by the hidden attribute the painters own;
 *   - the switch code is EXECUTED here (extracted from the file) on a tiny fake DOM: a click moves data-* and aria-pressed;
 *   - the lock links (holders.html /#wallet, the "?" step) select Holders + Lock before scrolling;
 *   - no visible text says the hearts / channel / vault payouts count the LOCK (v1 reads the wallet balance; v2 not deployed);
 *   - the holders intro no longer types the claim threshold, and no longer says "fees" without saying whose.
 * NE PROUVE PAS: the rendering (checked in a browser at 375 px). */
import { readFileSync } from 'node:fs';
const APP = readFileSync(new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const HOL = readFileSync(new URL('./holders.html', import.meta.url), 'utf8');
const LKJ = readFileSync(new URL('./lock.js', import.meta.url), 'utf8');
let ok = 0, ko = 0;
const t = (m, c) => { if (c) ok++; else { ko++; console.log('KO', m); } };

t('the Wallet tab opens on Holders', APP.includes('<section class="volet" id="v-wallet" aria-label="Wallet" data-w="hold">'));
for (const w of ['hold', 'actifs', 'fiat', 'bank']) t('section button ' + w, new RegExp('<button type="button" class="lkPuce[^"]*" data-w="' + w + '" aria-pressed="(true|false)">').test(APP));
for (const v of ['lock', 'pts', 'coeurs', 'how']) t('holders panel button ' + v, new RegExp('<button type="button" class="lkPuce[^"]*" data-v="' + v + '" aria-pressed="(true|false)">').test(APP));
t('Holders and Lock are the pressed defaults', APP.includes('<button type="button" class="lkPuce on" data-w="hold" aria-pressed="true">Holders</button>')
  && APP.includes('<button type="button" class="lkPuce on" data-v="lock" aria-pressed="true">Lock</button>'));
const css = APP.slice(APP.indexOf('/* game357: Wallet one section at a time'), APP.indexOf('/* game357: Wallet one section at a time') + 700);
t('CSS hides the 4 sections that are not chosen', ['#v-wallet:not([data-w="hold"]) #wVault', '#v-wallet:not([data-w="actifs"]) #wActifsCarte', '#v-wallet:not([data-w="fiat"]) #wFiat', '#v-wallet:not([data-w="bank"]) #wBankCarte'].every((x) => css.includes(x)));
t('CSS hides the 4 holders panels that are not chosen', ['#wVault:not([data-v="lock"]) #wLock', '#wVault:not([data-v="pts"]) #wPoints', '#wVault:not([data-v="coeurs"]) #wCoeurs', '#wVault:not([data-v="how"]) #wVaultHow'].every((x) => css.includes(x)));
t('each panel id exists once', ['wLock', 'wPoints', 'wCoeurs', 'wVaultHow', 'wVaultComment', 'wActifsCarte', 'wFiat', 'wBankCarte'].every((id) => APP.split('id="' + id + '"').length === 2));

/* EXECUTE brancherSeg (extracted) on a fake DOM */
const src = APP.slice(APP.indexOf('function brancherSeg(seg, hote, cle) {'), APP.indexOf("brancherSeg($('#wSeg')"));
const brancherSeg = new Function(src + '; return brancherSeg;')();
const bouton = (k, v) => { const b = { dataset: { [k]: v }, h: [], cl: new Set(), attrs: {}, addEventListener(e, f) { this.h.push(f); }, click() { this.h.forEach((f) => f()); },
  classList: { toggle(c, on) { if (on) b.cl.add(c); else b.cl.delete(c); } }, setAttribute(a, x) { this.attrs[a] = x; } }; return b; };
const bs = ['hold', 'actifs', 'fiat', 'bank'].map((v) => bouton('w', v));
const seg = { querySelectorAll: () => bs }, hote = { dataset: { w: 'hold' } };
brancherSeg(seg, hote, 'w');
bs[2].click();
t('executed: a click on Cash in sets data-w=fiat, presses it alone', hote.dataset.w === 'fiat' && bs[2].attrs['aria-pressed'] === 'true' && bs[2].cl.has('on') && bs.filter((b) => b.attrs['aria-pressed'] === 'true').length === 1);
bs[0].click();
t('executed: back to Holders', hote.dataset.w === 'hold' && bs[0].cl.has('on') && !bs[2].cl.has('on'));

t('lock links pick Holders + Lock before scrolling', APP.includes("function ouvrirWalletVault() { allerA('wallet'); choisirLockWallet();")
  && APP.includes("if (ou === 'lock') { allerA('wallet'); choisirLockWallet();") && APP.includes(`document.querySelector('#wSeg [data-w="hold"]'), b = document.querySelector('#wVaultSeg [data-v="lock"]')`));

/* the truth of the words */
const lock = APP.slice(APP.indexOf('async function peindreLock('), APP.indexOf('async function peindreTipApercu('));
t('lock card: never says the perks count the LOCK', !/count what you LOCK|holder perks read it|perks are back|holder perks stopped/.test(lock) && !/Holder stage/.test(lock));
t('lock card: says what it earns today and what still reads the wallet', lock.includes('Locking earns community points') && lock.includes('Hearts ♥ and holders vault claims count your lock; the holders’ channel counts your wallet balance.') /* 2026-11-12: the live hearts and vault read the lock */ && !lock.includes('not deployed'));
t('lock.js: points, not perks', !/perks/.test(LKJ.split('\n').filter((l) => /texte:/.test(l)).join('\n')));
t('holders.html: no "holder stage = $15 LOCKED" as a live perk', !HOL.includes("'The holder stage: $' + prix.seuil + ' of TBLOCK LOCKED") && !HOL.includes('lock at least $15 of it to reach the holder stage'));
/* game386: the intro moved from a fold at the top of the card into the Rules panel (#wVaultHow), once */
const intro = APP.slice(APP.indexOf('<div class="wCoeurs" id="wVaultHow">'), APP.indexOf('<div class="note" id="wVaultComment">'));
t('game386: the holders intro is written once (Rules panel), not a second time at the top of the card', APP.split('TBLOCK set aside for the players.').length === 2 && APP.indexOf('<div class="wCoeurs" id="wVaultHow">') > APP.indexOf('<div id="wVaultRows">'));
t('holders intro: no typed threshold, says whose payments fill it', !/\d{2},\d{3},\d{3}/.test(intro) && intro.includes('Every TAM art and skin mint, and the Spin') && intro.includes('dev share, send the TBLOCK they buy here.') /* 2026-11-12: what fills the live vault; game390: + the Spin's dev share (router batches) */
  && intro.includes('hearts ♥ and TAM art') && !intro.includes('TAM art and skins —') /* game390: the 1 USDC skins are not play */ && !intro.includes('Fed by buybacks and fees') && !intro.includes('Filled by TBLOCK buybacks'));
t('Create: a lock line under the button, hidden until TBlockLock is deployed, opening Wallet → Holders → Lock', /<button class="bouton creaGo" id="cCreer"[^\n]*\n(?:[^\n]*\n){0,3}\s*<p class="note" id="cLockLien" hidden/.test(APP)
  && APP.includes("$('#cLockLien').hidden = false; $('#cLockOuvrir').hidden = false;") /* game368: the real lock form opens in Create */);
t('Create: the line says what the lock earns and who can take it back, no perk promised', APP.includes('Lock your TBLOCK for community points (7 days minimum; the lock contract has no owner, only you take it back)'));
t('Swap UNIT card is gone', !APP.includes('id="unitCarte"') && !APP.includes('<span class="jeuKick">Game · Swap UNIT'));
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
