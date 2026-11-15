/* test-usage-etat-20261115.mjs - the usage engine's exported state is a valid seed (server restarts keep their progress),
 * and the census lists of 15/11 hold: the 9 new contracts are counted, the keeper and the owner's two lockers are team.
 * AFFIRME: exporter() -> moteurUsage(graine) gives the same resume() counts and the same end block; a state that did not advance
 *   is not newer than its seed; the newest of several seeds wins (graineUsage rule, re-stated here on plain objects).
 * NE PROUVE PAS: the server's volume write in production (checked after deploy on /api/usage: fin moves past the seed). */
import { readFileSync } from 'node:fs';
import { moteurUsage, CONTRATS, EQUIPE } from './usage-onchain.js';
let ok = 0, ko = 0;
const t = (m, c, v = '') => { if (c) ok++; else { ko++; console.log('KO', m, v); } };

const graine = JSON.parse(readFileSync(new URL('./mesures/usage-onchain-20261027.json', import.meta.url), 'utf8'));
const rpcMort = async () => { throw new Error('offline'); };
const A = moteurUsage({ rpc: rpcMort, graine });
const e = A.exporter();
t('exported state has the seed shape', Array.isArray(e.lignes) && Number.isInteger(e.fin.bloc) && Array.isArray(e.poolsSurNosHooks));
t('exported end = seed end', e.fin.bloc === graine.fin.bloc && e.fin.ts === graine.fin.ts);
const B = moteurUsage({ rpc: rpcMort, graine: JSON.parse(JSON.stringify(e)) });
const ra = A.resume(), rb = B.resume();
t('same counts after a reload (team)', JSON.stringify(ra.avecEquipe) === JSON.stringify(rb.avecEquipe), JSON.stringify([ra.avecEquipe, rb.avecEquipe]));
t('same counts after a reload (outside team)', JSON.stringify(ra.sansEquipe) === JSON.stringify(rb.sansEquipe));
t('same unread ranges after a reload', JSON.stringify(ra.nonLus) === JSON.stringify(rb.nonLus));
t('pools kept', B.etat.pools.size === A.etat.pools.size && A.etat.pools.size > 0);
/* newest wins */
const newest = (gs) => gs.filter((g) => g && Array.isArray(g.lignes) && g.fin && Number.isInteger(g.fin.bloc)).sort((a, b) => b.fin.bloc - a.fin.bloc)[0];
t('newest seed wins', newest([graine, { ...e, fin: { ...e.fin, bloc: e.fin.bloc + 10 } }]).fin.bloc === graine.fin.bloc + 10);
t('a malformed seed is skipped', newest([{ fin: { bloc: 9e9 } }, graine]) === graine);
/* the 15/11 lists */
const noms = new Set(CONTRATS.map((c) => c.nom));
for (const n of ['Hearts', 'Holders vault', 'Monthly lock rewards', 'Weekly lock rewards', 'TBLOCK lock', 'TAM art', 'Skins mint', 'Skins spin', 'Block contest']) t('counted: ' + n, noms.has(n));
const team = new Set(EQUIPE.map((x) => x.adresse));
for (const a of ['0x1f0eb43b99272e78de0077ff0e38787d6c2bd23c', '0x73f7d0b10a4fcaa75f0055b1a79a273555bdb2f6', '0xb30696174863cb719f5f13c3bffb2b9701f035cb']) t('team: ' + a.slice(0, 8), team.has(a));
console.log(ok + '/' + (ok + ko) + (ko ? ' RED' : ' green'));
process.exit(ko ? 1 : 0);
