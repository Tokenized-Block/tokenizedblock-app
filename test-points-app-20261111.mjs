/* test-points-app-20261111.mjs — game353 wiring of the community points (server route, index, page, holders). Reads the REAL files.
 * NE PROUVE PAS: an airdrop (no distribution contract yet — points are a published, verifiable SHARE, nothing is paid by this game). */
import { readFileSync } from 'node:fs';
const lire = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const APP = lire('app.html'), SRV = lire('serveur-web.js'), HOLD = lire('holders.html');
let ok = 0, ko = 0;
const t = (m, c) => { if (c) ok++; else { ko++; console.log('KO', m); } };
t('server imports the index, the decoder, the points and the lock data', /import \{ creerIndexLogs \} from '\.\/index-logs\.js';/.test(SRV) && /decoderLock, LOCK_DEPLOY_BLOC \} from '\.\/lock-evenements\.js';/.test(SRV) && /import \{ tableauPoints \} from '\.\/points\.js';/.test(SRV));
t('the lock index starts from the deploy block, on the lock address', /creerIndexLogs\(\{ rpc: rpcCoeurs, adresse: String\(LOCK_DEPLOIEMENT\.adresse\)\.toLowerCase\(\), topics: Object\.values\(TOPICS_LOCK\), decoder: decoderLock, depuis: LOCK_DEPLOY_BLOC \}\)/.test(SRV));
t('route /api/points: complete only when BOTH indexes are', /chemin === '\/api\/points'[\s\S]{0,1500}const lockOk = POINTS\.index\.complet\(\), coeursOk = COEURS\.index\.complet\(\);[\s\S]{0,400}complet: lockOk && coeursOk/.test(SRV));
t('route counts only stamped lock events', /POINTS\.index\.recs\(\)\.filter\(\(r\) => r\.t !== undefined\)/.test(SRV));
t('route states the rule, no rate promised', /no rate is promised/.test(SRV));
t('route is rate limited and validates the wallet', /if \(nP > 60\) \{ rendreP\(429/.test(SRV) && /usage: \/api\/points\[\?compte=<wallet>\]/.test(SRV));
t('points-vue.js served', /'points-vue\.js',/.test(SRV));
t('app: points section in the Holders vault card, painted with it', /id="wPoints" hidden/.test(APP) && /void peindreLock\(\$\('#wLock'\)\);\n  void peindrePointsWallet\(\);/.test(APP));
t('app: hidden while the lock is not deployed', /if \(!box \|\| !LK\.LOCK\) return;/.test(APP));
t('holders: points card, refreshed every 60 s, re-read at connect', /id="vuePointsBoard"/.test(HOLD) && /setInterval\(\(\) => \{ if \(!document\.hidden\) void lirePoints\(\); \}, 60000\);/.test(HOLD) && /void lireCoeurs\(\);\n  void lirePoints\(\);/.test(HOLD));
const st = APP.match(/20261109-game\d+/g) || [];
t('stamp game353 or later', st.length === 2 && st[0] === st[1] && Number(st[0].slice(13)) >= 353);
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
