/* test-noeud-logs-multi.mjs — UN getLogs MULTI-ADRESSES PART CHEZ LE SEUL NOEUD QUI LE SERT.
 *
 * ⛔⛔ CE QUE CETTE GARDE PROTEGE, ET POURQUOI ELLE N EST PAS UNE GARDE DE CORRECTION. Mesure du
 *     2026-09-23 en production, temoin pose sur `fetch` : 14 `eth_getLogs` multi-adresses par
 *     chargement, 7 chaines sur 7 de forme identique — PUBLICNODE 403 (3057-3165 ms) puis BASEORG
 *     200 (192-300 ms). Aucune donnee n est perdue : le failover de `rpcReseau` fait son travail.
 *     Ce qui est perdu, c est ~21 s par chargement, sur le Live feed. La note qui precedait disait
 *     « noisy but rpc() already rotates » : vraie sur la correction, muette sur le prix.
 *
 * ⛔ LA CAUSE EST ARITHMETIQUE. Plafond mesure de publicnode : 5,6,7,8,9 -> 200 · 10,20,40,80 ->
 *    403. `JETONS_PAR_REQUETE` vaut 50. 50 > 9, donc CENT POUR CENT de ces balayages etaient
 *    refuses — jamais « parfois », jamais « selon l egresse ».
 *
 * ⛔ CE TEST EXECUTE LE CODE LIVRE, il ne relit pas une chaine. Il extrait le bloc de selection de
 *    `app.html` et le fait tourner. Un test qui recopierait la logique prouverait sa copie : c est
 *    exactement le motif `canonical-helper-weaker-copy`, et il laisse le vrai code diverger.
 * ⛔ CE QU IL NE PEUT PAS PROUVER : que `mainnet.base.org` sert VRAIMENT — ca, seul le reseau le
 *    dit, et c est une mesure, pas un test. Il prouve l ORDRE, pas la reponse. */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');

/* --- extraction du bloc reel ------------------------------------------------------------- */
/* ⛔ L EXTRACTION PART DE `const to =` ET NON DU PLAFOND : c est la que `viseFactory` est calcule,
 *    et c est LUI qui portait le second defaut (le jumeau `eth_getLogs` manquant). Extraire plus
 *    bas aurait laisse la regle de la factory hors de portee du test — un test qui s arrete juste
 *    avant le code qu on vient de changer est vert sans rien garder. */
const debut = html.indexOf('const to = params && params[0]');
assert.ok(debut > 0, 'bloc de selection introuvable dans app.html');
const ancre = html.indexOf('if (servant) noeuds =', debut);
assert.ok(ancre > debut, 'reordonnancement introuvable');
const fin = html.indexOf('\n  }', ancre);
assert.ok(fin > ancre, 'fin du bloc introuvable');
const source = html.slice(debut, fin + 4);

/* ⛔ LA GARDE S ACCUSE D ABORD : une extraction ratee rendrait une chaine courte, la fonction
 *    construite ne ferait rien, et tous les cas passeraient sur du vide. */
assert.ok(source.length > 300, 'extraction suspecte : ' + source.length + ' caracteres');
/* ⛔ CES JETONS DISENT « L EXTRACTION A RAMENE LE BON BLOC », JAMAIS « IL EST BIEN ECRIT ».
 *    La liste contenait `filter` : sur une mutation qui remplacait le reordonnancement par
 *    `noeuds = [servant]`, ce controle tirait AVANT l assertion « aucun noeud supprime » et
 *    masquait la vraie garde. Un auto-controle qui epingle l implementation eteint le test de
 *    comportement qu il etait cense proteger. */
for (const jeton of ['ADRESSES_MAX_PUBLICNODE', 'logsMultiRpc', 'noeuds', 'viseFactory', 'FACTORY_B20']) {
  assert.ok(source.includes(jeton), 'extraction incomplete, il manque ' + jeton);
}

/* ⛔ `viseFactory` N EST PLUS UN PARAMETRE : il est CALCULE par le code livre. Le lui passer de
 *    l exterieur reviendrait a tester ma propre idee de ce qu est la factory au lieu de la sienne
 *    — et c est justement cette regle-la qui etait fausse. */
const choisir = new Function('RESEAUX', 'CHAINE', 'methode', 'params',
  source + '\n; return noeuds;');

const PUB = 'https://base-rpc.publicnode.com';
const ORG = 'https://mainnet.base.org';
const DRPC = 'https://base.drpc.org';
const RESEAUX = {
  8453: { rpc: PUB, logsMultiRpc: ORG, secours: [ORG, DRPC], b20Rpc: ORG },
  84532: { rpc: 'https://sepolia.base.org', secours: ['https://base-sepolia-rpc.publicnode.com'] },
};
const adresses = (n) => Array.from({ length: n }, (_, i) => '0xb2' + String(i).padStart(38, '0'));
const logs = (adr) => [{ address: adr, fromBlock: '0x1', toBlock: '0x2' }];

let n = 0;
const v = (nom, fn) => { fn(); n++; };

/* 1. LE CAS QUI COUTE 21 s : 50 adresses. */
v('50 adresses -> base.org en tete', () => {
  const out = choisir(RESEAUX, 8453, 'eth_getLogs', logs(adresses(50)));
  assert.equal(out[0], ORG, 'base.org doit passer devant');
});

/* 2. ⛔ ET AUCUN NOEUD N EST PERDU. Une optimisation qui supprime un repli transforme un
 *    ralentissement en panne le jour ou base.org tombe. */
v('aucun noeud supprime', () => {
  const out = choisir(RESEAUX, 8453, 'eth_getLogs', logs(adresses(50)));
  assert.deepEqual([...out].sort(), [DRPC, ORG, PUB].sort(), 'un noeud a disparu');
  assert.equal(new Set(out).size, out.length, 'un noeud est en double');
});

/* 3. LE SEUIL, DES DEUX COTES — un test qui ne regarde qu un cote ne mesure pas un seuil. */
v('9 adresses : ordre INCHANGE (publicnode sert encore)', () => {
  assert.equal(choisir(RESEAUX, 8453, 'eth_getLogs', logs(adresses(9)))[0], PUB);
});
v('10 adresses : base.org en tete (premier refus mesure)', () => {
  assert.equal(choisir(RESEAUX, 8453, 'eth_getLogs', logs(adresses(10)))[0], ORG);
});

/* 4. UNE SEULE ADRESSE EN CHAINE, PAS EN TABLEAU — la forme la plus courante de tout le code. */
v('adresse unique (chaine) : inchange', () => {
  assert.equal(choisir(RESEAUX, 8453, 'eth_getLogs', [{ address: PUB, fromBlock: '0x1', toBlock: '0x2' }])[0], PUB);
});
v('tableau d UNE adresse : inchange', () => {
  assert.equal(choisir(RESEAUX, 8453, 'eth_getLogs', logs(adresses(1)))[0], PUB);
});

/* 5. UNE AUTRE METHODE NE DOIT RIEN DEPLACER, meme avec un tableau qui ressemble. */
v('eth_call avec un params[0].address : inchange', () => {
  assert.equal(choisir(RESEAUX, 8453, 'eth_call', [{ address: adresses(50) }, 'latest'])[0], PUB);
});

/* 6. LES ENTREES TORDUES NE DOIVENT PAS JETER — `nan-walks-through-every-bound`. */
v('params absent / vide / null : inchange et sans exception', () => {
  for (const p of [undefined, null, [], [null], ['latest'], [{}], [{ address: null }]]) {
    assert.equal(choisir(RESEAUX, 8453, 'eth_getLogs', p)[0], PUB, 'casse sur ' + JSON.stringify(p));
  }
});

/* 7. ⛔⛔ LA FACTORY B20 EST PINNEE SUR LES DEUX METHODES. Le pin n existait que pour `eth_call` :
 *     un `eth_getLogs` ne porte pas de `to`, donc les balayages de la factory partaient chez
 *     publicnode — 34 refus 403 par chargement, mesures en production le 2026-09-23. */
const FACTORY = '0xb20f000000000000000000000000000000000000';
v('eth_call sur la factory : pinne', () => {
  assert.deepEqual(choisir(RESEAUX, 8453, 'eth_call', [{ to: FACTORY, data: '0x' }, 'latest']), [ORG]);
});
v('eth_getLogs sur la factory : pinne AUSSI (le jumeau qui manquait)', () => {
  assert.deepEqual(choisir(RESEAUX, 8453, 'eth_getLogs', logs(FACTORY)), [ORG],
    'le balayage de la factory doit etre pinne comme son jumeau eth_call');
});
v('la factory en MAJUSCULES est reconnue', () => {
  assert.deepEqual(choisir(RESEAUX, 8453, 'eth_getLogs', logs(FACTORY.toUpperCase().replace('0X', '0x'))), [ORG]);
});
v('la factory dans un tableau d UNE entree est reconnue', () => {
  assert.deepEqual(choisir(RESEAUX, 8453, 'eth_getLogs', logs([FACTORY])), [ORG]);
});

/* 8. ⛔⛔ ET LE PIEGE DU PREFIXE RESTE FERME. Le 2026-09-14, `to.startsWith('0xb20')` avait attrape
 *     TOUS les jetons (CREATE2 0xb200…), TBLOCK compris, et les avait colles sur un noeud limite :
 *     « market unread » permanent. L egalite doit rester EXACTE. */
v('un jeton 0xb200… n est PAS la factory', () => {
  const jeton = '0xb2000000000000000000005c3130457551052401';
  assert.equal(choisir(RESEAUX, 8453, 'eth_getLogs', logs(jeton))[0], PUB,
    'un jeton ne doit jamais etre pris pour la factory');
  assert.equal(choisir(RESEAUX, 8453, 'eth_call', [{ to: jeton, data: '0x' }, 'latest']).length, 3,
    'un eth_call sur un jeton doit garder ses trois noeuds');
});
v('la factory NOYEE dans un lot multi-adresses n est pas pinnee', () => {
  /* ⛔ un lot qui contient la factory PARMI d autres n est pas « un balayage de la factory » :
   *   le pinner priverait les 49 autres adresses de leur repli. */
  const lot = [FACTORY, ...adresses(49)];
  assert.equal(choisir(RESEAUX, 8453, 'eth_getLogs', logs(lot)).length, 3);
});

/* 8. ⛔ UNE CHAINE SANS MESURE NE SE FAIT PAS REORDONNER. Sepolia n a pas de `logsMultiRpc` :
 *    deviner un noeud la-bas serait inventer une mesure qu on n a pas faite. */
v('Sepolia (pas de logsMultiRpc) : inchange', () => {
  const out = choisir(RESEAUX, 84532, 'eth_getLogs', logs(adresses(50)));
  assert.equal(out[0], 'https://sepolia.base.org');
  assert.equal(out.length, 2);
});

/* 9. LA CONFIGURATION LIVREE DOIT VRAIMENT PORTER LA CLE — sinon les cas ci-dessus passent sur un
 *    RESEAUX de test pendant que la production n a rien. */
v('app.html declare logsMultiRpc sur mainnet', () => {
  assert.ok(/logsMultiRpc:\s*'https:\/\/mainnet\.base\.org'/.test(html), 'logsMultiRpc absent de app.html');
});
v('le plafond livre est bien 9', () => {
  assert.ok(/ADRESSES_MAX_PUBLICNODE\s*=\s*9\b/.test(html), 'plafond livre different de la mesure');
});

/* 10. ⛔ ET LE DEMANDEUR RESTE AU-DESSUS DU PLAFOND. Si un jour `JETONS_PAR_REQUETE` descend a 9,
 *     ce reordonnancement devient inutile — et ce test doit le DIRE, pas rester vert en silence. */
v('JETONS_PAR_REQUETE est bien au-dessus du plafond', () => {
  const fl = readFileSync(new URL('./fil-live.js', import.meta.url), 'utf8');
  const m = fl.match(/JETONS_PAR_REQUETE\s*=\s*(\d+)/);
  assert.ok(m, 'JETONS_PAR_REQUETE introuvable');
  assert.ok(Number(m[1]) > 9, 'JETONS_PAR_REQUETE=' + m[1] + ' <= 9 : le reordonnancement ne sert plus a rien, le retirer');
});

assert.equal(n, 18, 'compte d assertions inattendu : ' + n);
console.log('ok noeud-logs-multi — ' + n + ' cas, bloc reel extrait de app.html ('
  + source.length + ' caracteres)');
