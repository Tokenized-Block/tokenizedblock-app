/* test-learn-suit-la-barre-20261011.mjs - « WHAT AM I LOOKING AT? » SUIT LA BARRE DU BAS (Phil, 2026-10-11 : « une mise a jour et une
 * meilleure explication de l app »). L explication parlait de « My block » et ignorait Market, Bridge et Tokenized : la barre avait change.
 * AFFIRME : une etape par onglet de la barre (lu dans le HTML de la nav), DANS SON ORDRE, chaque titre commence par le nom de l onglet ;
 *   les etapes de plus (le panneau) viennent APRES ; aucun pourcentage, aucune adresse, jamais « NFT » ; chaque icone existe.
 * NE PROUVE PAS : que chaque phrase est vraie de la vue - verifie a la main le 2026-10-11 contre les titres de chaque vue. */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const nav = html.slice(html.indexOf('<nav class="nav"'), html.indexOf('</nav>', html.indexOf('<nav class="nav"')));
const onglets = [...nav.matchAll(/<button class="navB"[^>]*data-volet="[a-z]+"[^>]*><b[^>]*>(?:[^<]|<(?!\/b>)[^>]*>)*<\/b>([^<]+)<\/button>/g) /* game360: the icon is an inline svg inside <b> */].map((m) => m[1].trim());
vu(onglets.length >= 8, 'onglets de la barre introuvables : ' + JSON.stringify(onglets));
const i = html.indexOf('const ETAPES = [');
const finBloc = /\r?\n\];/.exec(html.slice(i)); /* quelle que soit la fin de ligne (test-tests-portables) */
const bloc = html.slice(i, i + finBloc.index);
const etapes = [...bloc.matchAll(/\{ t: '([^']+)', ic: (\d+),\s*d: '((?:[^'\\]|\\.)*)' \}/g)].map((m) => ({ t: m[1], ic: Number(m[2]), d: m[3] }));
vu(etapes.length >= onglets.length, 'moins d etapes que d onglets : ' + etapes.length + ' < ' + onglets.length);
for (let k = 0; k < onglets.length; k += 1) vu(etapes[k] && etapes[k].t.startsWith(onglets[k] + ' — '), 'etape ' + (k + 1) + ' : « ' + (etapes[k] && etapes[k].t) + ' » ne commence pas par l onglet « ' + onglets[k] + ' »');
for (const e of etapes) {
  vu(!/%|0x[0-9a-f]{6,}|\bNFTs?\b/i.test(e.t + e.d), 'etape publique avec un pourcentage, une adresse ou « NFT » : ' + e.t);
  vu(Number.isInteger(e.ic) && e.ic >= 0 && e.ic <= 9, 'icone inexistante : ' + e.t);
}
console.log('ok learn-suit-la-barre - ' + n + ' assertions (' + onglets.join(', ') + ' + ' + (etapes.length - onglets.length) + ' du panneau)');
