/* test-create-sans-openlaunch-365-20261111.mjs — game365 (Phil 2026-11-11: "retire … A plain token with openlaunch.lol, il sert plus à rien";
 *   "retire ça aussi, vu que t'as que 1 choix"). AFFIRME on the REAL app.html:
 *   - no "A block / A plain token" choice, no OpenLaunch launch card (#cModeToken, olPreparer, olSigner), no launch code or import;
 *   - Create's block path is intact (#cModeBlock and the Create button stay);
 *   - the Feed's OpenLaunch reader (read only) and the volume reclaim are NOT removed (they serve another tab). */
import { readFileSync } from 'node:fs';
const APP = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
let ok = 0, ko = 0;
const t = (m, c) => { if (c) ok++; else { ko++; console.log('KO', m); } };
t('no Create choice', !APP.includes('data-cmode="token"') && !APP.includes('<b>A plain token</b>') && !APP.includes('class="carte creaChoix"'));
t('no OpenLaunch launch card', !APP.includes('id="cModeToken"') && !APP.includes('id="olPreparer"') && !APP.includes('olSigner'));
t('no launch code, no launch import', !APP.includes('planLaunchOL') && !APP.includes("from './openlaunch-launch.js'"));
t('the block path stays', APP.includes('<div id="cModeBlock">') && APP.includes('id="cCreer"'));
t('the Feed OpenLaunch reader stays (read only)', APP.includes('async function lireOpenLaunch()') && APP.includes('OpenLaunch · live on Base'));
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
