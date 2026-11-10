/* test-lock-app-20261110.mjs — game349 wiring of TBlockLock in the page (Phil 2026-11-10: "propose the lock right after Create"; holder stage
 *   = locked >= 7 days). Reads the REAL files. NE PROUVE PAS: the rendering, nor a lock on mainnet (not deployed: every lock UI stays hidden;
 *   the calls themselves are proved on a fork by banc-lock-fork-20261110.mjs, the helpers by test-lock-20261110.mjs). */
import { readFileSync } from 'node:fs';
const lire = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const APP = lire('app.html'), SRV = lire('serveur-web.js'), DEP = lire('deployer-lock.html'), LD = lire('lock-deploiement.js');
let ok = 0, ko = 0;
const t = (m, c) => { if (c) ok++; else { ko++; console.log('KO', m); } };
const corps = (sig) => { const i = APP.indexOf(sig); const m = /\n\}\n/.exec(APP.slice(i)); return i < 0 || !m ? '' : APP.slice(i, i + m.index + 2); };
const P = corps('async function peindreLock(');

t('page imports lock.js', /import \* as LK from '\.\/lock\.js';/.test(APP));
t('server SERVES lock.js, lock-deploiement.js and deployer-lock.html', /'lock\.js', 'lock-deploiement\.js', 'deployer-lock\.html'/.test(SRV));
t('undeployed today: the frozen data has no address', /adresse: null,/.test(LD));
t('every lock UI hidden while LK.LOCK is null', /if \(!hote \|\| !LK\.LOCK\) \{ if \(hote\) hote\.hidden = true; return; \}/.test(P));
t('Create offers the lock only once EVERY birth step is done', /if \(LK\.LOCK && lu && r\.ne && !r\.prochaine && r\.restantes === 0\) \{/.test(APP));
t('the Wallet vault card paints the lock', /void peindreCoeursWallet\(\);\n  void peindreLock\(\$\('#wLock'\)\);\n\}/.test(APP) && /id="wLock" hidden/.test(APP));
t('the lock is built by lock.js (exact approve + lock), never by hand', /LK\.lockBatch\(\{ amount: montant, jours: Number\(sel\.value\), maintenantSec:/.test(P) && !/approve\(/.test(P.replace(/approve \+ lock/g, '')));
t('checked before the wallet opens', /const chk = LK\.lockCheck\(\{ balance: bal, amount: montant \}\);\n\s+if \(!chk\.ok\)/.test(P));
t('a way back, in two steps (7-day period): request / cancel / take back, the ONE action etatLock chooses',
  /demander: \{[^\n]*LK\.requestWithdrawCall\(\)/.test(P) && /annuler: \{[^\n]*LK\.cancelWithdrawCall\(\)/.test(P) && /retirer: \{[^\n]*LK\.withdrawCall\(\)/.test(P)
  && /const s = e\.action \? SORTIES\[e\.action\] : null;/.test(P));
t('the exit reads the request and its date', /LK\.VIEW\.requestedAtOf\(moi\)/.test(P) && /LK\.VIEW\.withdrawableAtOf\(moi\)/.test(P) && /LK\.etatLock\(\{ locked, active, unlockAt, requestedAt, withdrawableAt,/.test(P));
t('deploy page states the withdrawal period', /D\.retraitSecondes \/ 86400 \+ ' days later/.test(DEP));
t('gates read activeLockedOf (SEC-001)', /LK\.VIEW\.activeLockedOf\(moi\)/.test(P));
t('says never to send TBLOCK to the lock directly (review SEC-003)', /Never send TBLOCK to the lock address yourself/.test(P));
t('durations 7 / 30 / 90 days from lock.js', /for \(const j of LK\.DUREES_JOURS\)/.test(P));
t('deploy page checks the sha256 before its button opens', /const ok = \(await sha256Hex\(D\.creation\)\) === D\.sha256Creation;/.test(DEP) && /\$\('#d1'\)\.disabled = !\(chain === 8453 && ok && !D\.adresse\);/.test(DEP));
t('deploy page sends exactly the frozen data', /params: \[\{ from: acct, data: D\.creation \}\]/.test(DEP));
const st = APP.match(/20261109-game\d+/g) || [];
t('stamp game349 or later, both equal', st.length === 2 && st[0] === st[1] && Number(st[0].slice(13)) >= 349);
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
