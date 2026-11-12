/* test-skin-jeton-jour-20261024.mjs — UN SKIN = UN TICKET PAR JOUR, PAS UN TICKET PAR WALLET QUI L A TENU A UNE LECTURE.
 * Revue adverse 2026-10-24 (audit-ticketpot 2, HIGH) : crediterDetenteursSkins ajoutait le jour a CHAQUE detenteur externe vu a une lecture
 *   (toutes les 10 min) ; BlockSkins est un ERC-721 transferable : un seul skin passe de wallet en wallet entre les lectures donnait jusqu a
 *   144 tickets par jour et diluait les traders honnetes (PoC : 2 honnetes recoivent 2 USDC sur 22).
 * EXECUTE la vraie fonction crediterDetenteursSkins de serveur-web.js (decoupee avec son etat skinsDetenus, montee par new Function, avec
 *   le vrai walletsInternes et le vrai jourDe) ; seule la lecture des skins (lireSkins) et l horloge sont simulees.
 * AFFIRME : un jeton donne UN ticket par jour (le premier detenteur EXTERNE vu ce jour-la le garde ; passe a un autre wallet le meme jour :
 *   rien de plus) ; le detenteur qui le garde est credite chaque jour (le lendemain aussi) ; deux jetons = deux tickets possibles ; un wallet
 *   interne ou le contrat (skin en vente) ne consomme pas le ticket du jeton ; le registre par jeton ne garde que quelques jours.
 *   MUTANTS (copies en memoire) : retirer la borne par jeton, ou laisser un interne consommer le jeton -> le scenario ROUGIT.
 * ⛔ NE PROUVE PAS : une lecture reelle des skins (BlockSkins totalSupply = 1 lu par l audit), ni le cas d un wallet qui a deja le jour par
 *   un autre chemin (pass skin, Week pass) : ce wallet garde son ticket, et le jeton est quand meme consomme pour ce jour. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jourDe, ticketsJour } from './tirage-saison.js';
import { walletsInternes } from './revenu-externe.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SRV = fs.readFileSync(path.join(ICI, 'serveur-web.js'), 'utf8').replace(/\r\n/g, '\n');
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const CONTRAT = '0xc0d12c7c84a574fbc65fd5182aecef51924d8e2f';
const INTERNE = '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b';
const w = (k) => '0x' + (k + 0x30).toString(16).padStart(2, '0').repeat(20);

function monter(src, etat, horloge, lecture) {
  const a = src.indexOf('const skinsDetenus = '), b = src.indexOf('setInterval(() => { void crediterDetenteursSkins(); }, 600000)');
  if (a < 0 || b < a) throw new Error('decoupe introuvable');
  class D extends Date { constructor(...x) { if (x.length) super(...x); else super(horloge.t); } static now() { return horloge.t; } }
  const deps = { revenu: etat, Date: D, lireSkinsSrv: async () => lecture(), rpcServeur: null, walletsInternes, COMPTE_SONDE: '0x00000000000000000000000000000000c0ffee77',
    process: { env: {} }, jourDe, BLOCKSKINS_SRV: CONTRAT, BLOCKSKINS_LUS_SRV: [CONTRAT] }; /* 2026-11-12: every skins contract read (blockskins.js BLOCKSKINS_LUS) */
  const noms = Object.keys(deps);
  return new Function(...noms, 'let revenuSale = false;\n' + src.slice(a, b) + '\nreturn crediterDetenteursSkins;')(...noms.map((k) => deps[k]));
}
/* une journee de lectures : `tenue(k)` -> [{ tokenId, detenteur }] a la k-ieme lecture (toutes les 601 s) */
async function journee(src, etat, debutMs, nLectures, tenue) {
  const h = { t: debutMs }; let k = 0;
  const f = monter(src, etat, h, () => ({ etat: 'LU', total: 3, skins: tenue(k).map((s) => ({ tokenId: BigInt(s.tokenId), detenteur: s.detenteur })) }));
  for (k = 0; k < nLectures; k++) { await f(); h.t += 601000; }
}
const J1 = Date.UTC(2026, 9, 24, 0, 5), J2 = Date.UTC(2026, 9, 25, 0, 5);
const avec = (etat, jourId) => Object.keys(etat.passes || {}).filter((a) => (etat.passes[a] || []).includes(jourId)).sort();

async function scenarios(src) {
  const R = {};
  const essai = async (nom, f) => { try { R[nom] = await f(); } catch (e) { R[nom] = false; R[nom + ':err'] = String(e && e.message || e); } };
  await essai('rotation-un-jeton', async () => {
    const e = { passes: {} };
    await journee(src, e, J1, 20, (k) => [{ tokenId: 1, detenteur: w(k) }]);
    const t = ticketsJour({}, 'J2026-10-24', e.passes);
    return t.length === 1 && t[0] === w(0);
  });
  await essai('detenteur-garde-chaque-jour', async () => {
    const e = { passes: {} }, H = w(40);
    await journee(src, e, J1, 5, () => [{ tokenId: 1, detenteur: H }]);
    await journee(src, e, J2, 5, () => [{ tokenId: 1, detenteur: H }]);
    return JSON.stringify(e.passes[H]) === JSON.stringify(['J2026-10-24', 'J2026-10-25']);
  });
  await essai('deux-jetons', async () => {
    const e = { passes: {} }, W1 = w(1), W2 = w(2);
    await journee(src, e, J1, 4, (k) => (k < 2 ? [{ tokenId: 1, detenteur: W1 }, { tokenId: 2, detenteur: W1 }] : [{ tokenId: 1, detenteur: W1 }, { tokenId: 2, detenteur: W2 }]));
    const jour1 = avec(e, 'J2026-10-24');
    await journee(src, e, J2, 2, () => [{ tokenId: 1, detenteur: W1 }, { tokenId: 2, detenteur: W2 }]);
    const jour2 = avec(e, 'J2026-10-25');
    return JSON.stringify(jour1) === JSON.stringify([W1]) && JSON.stringify(jour2) === JSON.stringify([W1, W2].sort());
  });
  await essai('interne-et-contrat-ne-consomment-pas', async () => {
    const e = { passes: {} }, X = w(5), Y = w(6);
    await journee(src, e, J1, 3, (k) => [{ tokenId: 3, detenteur: k === 0 ? INTERNE : X }, { tokenId: 4, detenteur: k === 0 ? CONTRAT : Y }]);
    return JSON.stringify(avec(e, 'J2026-10-24')) === JSON.stringify([X, Y].sort()) && !e.passes[INTERNE] && !e.passes[CONTRAT];
  });
  await essai('registre-borne', async () => {
    const e = { passes: {} };
    for (let d = 0; d < 6; d++) await journee(src, e, J1 + d * 86400000, 1, () => [{ tokenId: 1, detenteur: w(9) }]);
    const jours = Object.keys(e.skinsJour || {});
    return jours.length > 0 && jours.length <= 3 && jours.includes(jourDe(J1 + 5 * 86400000).id);
  });
  return R;
}

const R = await scenarios(SRV);
for (const [k, v] of Object.entries(R)) if (!k.includes(':')) ok(v === true, k + (R[k + ':err'] ? ' (' + R[k + ':err'] + ')' : ''));
const MUTANTS = [
  { nom: 'pas de borne par jeton (chaque detenteur credite)', de: /if \(parJeton\[id\]\) continue;/, vers: '', rougit: 'rotation-un-jeton' },
  { nom: 'un interne consomme le jeton', de: /if \(!externe\(a\)\) continue;/, vers: 'if (!externe(a)) { if (!parJeton[id]) parJeton[id] = a; continue; }', rougit: 'interne-et-contrat-ne-consomment-pas' },
];
let tues = 0;
for (const m of MUTANTS) {
  if (!m.de.test(SRV)) { ok(false, 'MUTANT ' + m.nom + ' : motif absent de la source'); continue; }
  const Rm = await scenarios(SRV.replace(m.de, m.vers));
  const t = Rm[m.rougit] !== true; if (t) tues += 1;
  ok(t, 'MUTANT ' + m.nom + ' -> ' + m.rougit + ' ROUGIT');
}
console.log('mutants tues ' + tues + '/' + MUTANTS.length);
console.log(n + ' assertions, ' + ko + ' KO — NE PROUVE PAS une lecture reelle des skins');
if (ko) process.exitCode = 1;
