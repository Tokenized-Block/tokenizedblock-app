/* test-coeurs-app-20261110.mjs — game346 wiring (Phil 2026-11-10): Holders vault, hearts in the wallet + live board, signals between blocks,
 *   ♥ in one click from the panel, the brain always on, the old "Instant Birth" list gone.
 * Reads the REAL files. NE PROUVE PAS: the browser rendering (measured on prod after deploy), a real heart on Base (0 Liked on mainnet today). */
import { readFileSync } from 'node:fs';
const lire = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const APP = lire('app.html'), SRV = lire('serveur-web.js'), HOLD = lire('holders.html'), CP = lire('commandes-panel.js'), PC = lire('panneau-commandes.js');
let ok = 0, ko = 0;
const t = (m, c) => { if (c) ok++; else { ko++; console.log('KO', m); } };

/* the page module is SERVED (a module imported but not served = a dead page, 2026-10-11) */
t('app imports coeurs-vue.js', /import \* as CV from '\.\/coeurs-vue\.js'/.test(APP));
t('holders imports coeurs-vue.js', /import \{ lignesBoard, lignesCompte \} from '\.\/coeurs-vue\.js'/.test(HOLD));
t('server SERVES coeurs-vue.js', /const SERVIS = \[[\s\S]*?'coeurs-vue\.js'[\s\S]*?\];/.test(SRV));
t('coeurs-vue.js imports nothing the server does not serve', !/^import /m.test(lire('coeurs-vue.js')));

/* server: index from the deploy block, route, creators from the trending index */
t('server builds the hearts index on BlockLikes', /creerIndexCoeurs\(\{ rpc: rpcCoeurs, likes: String\(ECONOMIE_DEPLOIEMENT\.adresseLikes\)\.toLowerCase\(\) \}\)/.test(SRV));
t('server advances the index every 60 s', /setInterval\(\(\) => \{ void COEURS\.index\.avancer\(\); \}, 60000\)/.test(SRV));
t('route /api/coeurs answers board + compte + bloc + symboles', /chemin === '\/api\/coeurs'[\s\S]{0,4000}board: classement\(tous, 10\)[\s\S]{0,2000}vueCompte\(tous, compteC, crDe\)[\s\S]{0,1500}corps\.bloc = [\s\S]{0,1500}corps\.symboles = \{\}/.test(SRV));
t('route validates both addresses', /\(compteC && !\/\^0x\[0-9a-f\]\{40\}\$\/\.test\(compteC\)\) \|\| \(blocC && !\/\^0x\[0-9a-f\]\{40\}\$\/\.test\(blocC\)\)/.test(SRV));
t('route is rate limited per IP', /if \(nC > 60\) \{ rendreC\(429/.test(SRV));

/* Holders vault */
t('Wallet card titled Holders vault', /<div class="carte" id="wVault" hidden>\s*<p class="titre">Holders vault<\/p>\s*<p class="sous">Reserved for TBLOCK holders\./.test(APP));
t('no visible "community vault" left in app strings', !/['"][^'"\n]*[Cc]ommunity vault[^'"\n]*['"]/.test(APP.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '')));
t('hearts + board inside the vault card', /id="wVault"[\s\S]{0,1500}id="wCoeursMoi"[\s\S]{0,300}id="wCoeursBoard"/.test(APP));
/* game356: the vault explainer is painted between the two lines; still inside peindreVaultWallet, right after the card is shown */
t('vault card paints the hearts', /carte\.hidden = false;\r?\n(?:  [^\n]*\r?\n){0,6}  void peindreCoeursWallet\(\);\r?\n/.test(APP));
t('wallet hearts use the words of coeurs-vue', /CV\.lignesCompte\(r\.compte, nom\)/.test(APP) && /CV\.lignesBoard\(r, nom, compte\)/.test(APP));
t('holders.html shows the live board every 60 s', /id="vueBoard"/.test(HOLD) && /setInterval\(\(\) => \{ if \(!document\.hidden\) void lireCoeurs\(\); \}, 60000\)/.test(HOLD));

/* signals between blocks */
t('signal line under the block name', /<p class="note" id="bcLikeNote" hidden><\/p>\n\s*<p class="note bcSignaux" id="bcSignaux" hidden/.test(APP));
t('signals painted with the like counter', /bcLikeEtat\.enVol = false;\n  \}\)\(\);\n  void bcPeindreSignaux\(a\);\n\}/.test(APP));
t('signals use coeurs-vue', /CV\.signauxBloc\(r\.bloc, nom\)/.test(APP));

/* ♥ in one click from the panel, ONE signing path */
t('chip ♥ Heart this block, direct', /\{ cle: 'heart', libelle: '♥ Heart this block', modele: 'heart this', ceBlock: true, direct: true \}/.test(CP));
t('heart is in Play, right after Spin, and signs', /cmds: Object\.freeze\(\['spin', 'heart',/.test(PC) && /heart: 'signe'/.test(PC));
t('dispatcher: heart -> bcCommandeCoeur', /if \(c\.type === 'heart'\) \{ void bcCommandeCoeur\(c\.jeton\); return true; \}/.test(APP));
t('the ♥ button and the command share bcCoeur', /\$\('#bcLikeBtn'\)\.addEventListener\('click', \(\) => \{ void bcCoeur\(\$\('#bcLike'\)\.dataset\.adr\); \}\);/.test(APP) && /await bcCoeur\(j\.adr, /.test(APP));
t('bcCoeur keeps the live $15 check before the wallet', /async function bcCoeur\(a, dire = null\) \{[\s\S]{0,2500}ECO\.likeCheckUsd\(\{ balance: bal, n: 1, prixUsd \}\)[\s\S]{0,400}ECO\.likeBatch\(\{ block: a, n: 1 \}\)/.test(APP));
t('only one likeBatch call site', (APP.match(/ECO\.likeBatch\(/g) || []).length === 1);

/* Create: brain always on, old list gone */
t('brain always on: checked, disabled, hidden', /<input type="checkbox" id="cCerveau" checked disabled hidden>/.test(APP));
t('no "Give it a brain" option left (outside comments)', !/Give it a brain/.test(APP.replace(/<!--[\s\S]*?-->/g, '')));
t('old Instant Birth list removed', !/<ol class="creaPas">\s*<!--[\s\S]{0,300}<li><b>Create<\/b> <span>its face and brain are engraved/.test(APP) && !/<li><b>0\.001 ETH<\/b> <span>brings it to life/.test(APP));

/* stamp */
const st = APP.match(/20261109-game\d+/g) || [];
t('stamp game346 or later, both occurrences equal', st.length === 2 && st[0] === st[1] && Number(st[0].slice(13)) >= 346);

console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
