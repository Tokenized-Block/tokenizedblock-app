/* test-create-lock-reel-368-20261111.mjs — game368 (Phil 2026-11-11: Create's "open the lock" opened the "?" guide — its lienLearn class made the
 *   global learn handler catch it — "faut ajouter un bouton de lock réel"). AFFIRME on the REAL app.html:
 *   - Create has a real button that opens the SAME lock form as the Wallet (peindreLock) in place, hidden until TBlockLock is deployed;
 *   - no lienLearn-classed lock link left (the guide never opens from it);
 *   - the Wallet route lands on the lock form itself. Checked in a browser: the click opens the form in Create, the guide stays closed. */
import { readFileSync } from 'node:fs';
const APP = readFileSync(new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let ok = 0, ko = 0;
const t = (m, c) => { if (c) ok++; else { ko++; console.log('KO', m); } };
t('a real lock button and its form container in Create', APP.includes('<button type="button" class="bouton sec" id="cLockOuvrir" hidden') && APP.includes('<div class="wCoeurs" id="cLockCarte" hidden></div>'));
t('no lienLearn lock link left (it opened the guide)', !APP.includes('id="cLockAller"'));
const w0 = APP.indexOf("if (LK.LOCK && $('#cLockLien')) {");
const fin = /\r?\n\}\r?\n/.exec(APP.slice(w0)); /* end of the block, any line ending */
const w = fin ? APP.slice(w0, w0 + fin.index + fin[0].length) : '';
t('the button paints the SAME lock form (peindreLock) in place', w.includes("$('#cLockOuvrir').addEventListener('click'") && w.includes('void peindreLock(c);') && !w.includes('ouvrirWalletVault'));
t('shown only when TBlockLock is deployed', w.startsWith("if (LK.LOCK && $('#cLockLien')) {") && w.includes("$('#cLockOuvrir').hidden = false;"));
t('one retry when the shared painter was busy', w.includes("if (!c.hidden && !c.textContent.trim()) { c.dataset.lu = '0'; void peindreLock(c); }"));
t('the Wallet route lands on the lock form', APP.includes("const cible = l && !l.hidden && l.offsetParent !== null ? l : (v && !v.hidden ? v : null);"));
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
