import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
/* ⛔ EPINGLE RETIREE : cette ligne verifiait un numero de build precis, donc elle rougissait
 *    des qu UN AUTRE deploiement bumpait le build — plusieurs fois par jour quand deux agents
 *    travaillent. Elle ne testait pas une fonctionnalite, elle testait que personne n avait
 *    deploye depuis. L intention est gardee sous une forme qui ne pourrit pas.
 *    ⛔ AUCUNE autre assertion de ce fichier n a ete touchee (compte verifie avant/apres). */
/* ⛔ EPINGLE DE BUILD RETIREE (2026-09-23, passe globale) : elle exigeait un numero de
 *    build precis, donc elle rougissait des qu un AUTRE deploiement bumpait le build. Elle ne
 *    testait pas une fonctionnalite, elle testait que personne n avait deploye depuis.
 *    L intention — « c est bien une page servie, avec sa ligne de build » — est gardee. */
assert.match(html, /data-build="[\w-]+"/);
assert.match(html, /tip 20260922-prepaye-inscrire-dust/);
assert.match(html, /Register the market — 0\.0003 ETH min/); /* 2026-11-12 copy rule: no version word on screen (was "Register on V8") */
assert.match(html, /isInscrire && !hookPayee/);
assert.match(html, /CREATE_FEE_WEI_FLOOR/);
assert.match(html, /0xbb920fed/);
assert.match(html, /inscrireDust/);
assert.match(html, /MontantInsuffisant/);
/* must NOT blindly zero all payant etapes anymore without the inscrire floor branch */
assert.match(html, /open fee already paid via Create/);
console.log('PASS tip 20260922-prepaye-inscrire-dust');
