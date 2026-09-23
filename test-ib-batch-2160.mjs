// tip 20260922-same-sig — Instant Birth CreateRouter createPaid FIRST; never factory createB20 value 0; fees→wallet · no sink addr.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');

/* ⛔ EPINGLE RETIREE LE 2026-09-22 : cette ligne verifiait `data-build="20260922-<tip>"`,
 *    donc elle rougissait des qu UN AUTRE deploiement bumpait le build — plusieurs fois par jour
 *    quand deux agents travaillent. Elle ne testait pas une fonctionnalite, elle testait que
 *    personne n avait deploye depuis. L intention (« c est bien la version courante ») est
 *    gardee sous une forme qui ne pourrit pas : la ligne doit EXISTER et etre bien formee.
 *    ⛔ AUCUNE autre assertion de ce fichier n a ete touchee. */
/* ⛔ EPINGLE DE BUILD RETIREE (2026-09-23, passe globale) : elle exigeait un numero de
 *    build precis, donc elle rougissait des qu un AUTRE deploiement bumpait le build. Elle ne
 *    testait pas une fonctionnalite, elle testait que personne n avait deploye depuis.
 *    L intention — « c est bien une page servie, avec sa ligne de build » — est gardee. */
assert.match(html, /data-build="[\w-]+"/);
assert.match(html, /forcerCreateRouterIb/);
assert.match(html, /function estCreateB20ValeurZero/);
assert.match(html, /function refuseSiCreateB20ValeurZero/);
assert.match(html, /CreateRouter createPaid FIRST/);
assert.match(html, /Do NOT call creerEtVivreUneSignature/);
/* ⛔⛔ ET LE COMPORTEMENT, PAS SEULEMENT LA MISE EN GARDE (ajoute le 2026-09-23).
 *     La ligne ci-dessus exige que le commentaire « Do NOT call creerEtVivreUneSignature » existe.
 *     Elle ne verifiait PAS que le code obeisse : deplacer l appel DANS la branche `ibDirect`
 *     l aurait laissee verte. Une garde qui protege la divulgation et pas la decision est le motif
 *     `disclosure-fixed-decision-not`.
 *     ⚠️ MESURE HONNETE AVANT CORRECTION : le code obeit DEJA. L appel vit dans la branche `else`,
 *        annotee « Non-IB / Advanced / Practice may still try one-sig batch ». Ce controle ne
 *        repare donc rien aujourd hui — il empeche une regression que rien ne voyait. */
{
  const d = html.indexOf('if (ibDirect) {');
  assert.ok(d > 0, 'branche `if (ibDirect)` introuvable — ce controle ne garde plus rien');
  const f = html.indexOf('} else if (adresseCreee', d);
  assert.ok(f > d, 'fin de la branche `ibDirect` introuvable');
  const brancheIb = html.slice(d, f);
  assert.ok(brancheIb.length > 400, 'branche `ibDirect` suspecte : ' + brancheIb.length + ' caracteres');
  assert.doesNotMatch(brancheIb, /creerEtVivreUneSignature\s*\(/,
    'Instant Birth appelle creerEtVivreUneSignature : le batch EIP-5792 repasserait par '
    + 'factory createB20 value 0, exactement ce que le commentaire interdit');
  /* ⛔ TEMOIN : l appel doit exister AILLEURS, sinon on aurait « prouve » l absence en supprimant
   *    la fonction — un vert obtenu en retirant la fonctionnalite ne prouve rien. */
  assert.match(html, /const g = await creerEtVivreUneSignature\(/,
    'le chemin non-Instant-Birth a perdu son batch une signature');
}
assert.match(html, /creerBlock IB final guard/);
/* ⛔ CHAINE D ECRAN MISE A JOUR (2026-09-23) : elle portait « CreateRouter » — un nom de contrat
 *    sous les yeux de quelqu un qui cree un block. Le controle vise la MEME phrase dans sa nouvelle
 *    formulation, et exige toujours que le montant y figure. Rien n est retire.
 *    ⛔ Les controles sur les IDENTIFIANTS DE CODE (`forcerCreateRouterIb`, le commentaire de tip)
 *      restent intacts plus haut : eux ne sont pas a l ecran, et ils gardent vraiment quelque chose. */
assert.match(html, /Instant Birth — 0\.001 ETH, once/);
assert.match(html, /FRAIS_OUVERTURE_WEI/);
assert.doesNotMatch(html, /Fees for Dev/);
assert.doesNotMatch(html, /0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4/i);
assert.doesNotMatch(html, /cIbPrepCreate/);
assert.doesNotMatch(html, /Create block first \(factory · free · not Instant Birth\)/);
assert.match(html, /never solicit factory createB20 value 0 for Instant Birth/);
console.log('PASS tip 20260922-same-sig Instant Birth CreateRouter first · refuse createB20-0 · fees→wallet · no sink addr');
