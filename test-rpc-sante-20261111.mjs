/* test-rpc-sante-20261111.mjs — game362 (Phil: "régler une bonne fois pour toutes le problème de RPC"). AFFIRME on the REAL rpc-sante.js and
 *   serveur-web.js:
 *   - a host that rate-limits (or does not answer) is set aside 15 s, then 30, 60 … capped at 5 min; its first ok clears it; a plain JSON-RPC
 *     error (an answer of the chain) never sets a host aside;
 *   - ordonner keeps the rotation, puts available hosts first, cooled ones last soonest-back first, and NEVER drops a url (all cooled -> all
 *     still tried);
 *   - the server feeds it from compterEnvoi (every counted answer), orders the 4 readers by it (callLarge, rpcRails, simulations, general),
 *     falls back once to the keyed node on a pool read only, under its own daily budget, and publishes both in /sante.
 * NE PROUVE PAS: a real rate-limit episode (prod /sante.santeRpc shows it live). */
import { readFileSync } from 'node:fs';
import { creerSante, ATTENTE_BASE_MS, ATTENTE_MAX_MS } from './rpc-sante.js';
const SRV = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let ok = 0, ko = 0;
const t = (m, c, x = '') => { if (c) ok++; else { ko++; console.log('KO', m, x); } };
let T = 1_000_000;
const S = creerSante({ maintenant: () => T });
const U = ['a', 'b', 'c', 'd'];
t('fresh: rotation kept', JSON.stringify(S.ordonner(U, 1)) === '["b","c","d","a"]');
S.noter('b', 'limite');
t('a rate-limited host goes last', JSON.stringify(S.ordonner(U, 1)) === '["c","d","a","b"]');
t('it is set aside 15 s', !S.disponible('b') && (T += ATTENTE_BASE_MS - 1, !S.disponible('b')) && (T += 1, S.disponible('b')));
S.noter('b', 'limite'); const t1 = S.instantane().b.encoreMs; S.noter('b', 'limite'); const t2 = S.instantane().b.encoreMs;
t('it keeps refusing: 30 s then 60 s', t1 === 30000 && t2 === 60000, t1 + ' ' + t2);
for (let i = 0; i < 10; i++) S.noter('b', 'limite');
t('capped at 5 min', S.instantane().b.encoreMs === ATTENTE_MAX_MS);
S.noter('b', 'ok');
t('an ok from a request in flight while set aside is ignored', !S.disponible('b'));
T += ATTENTE_MAX_MS; S.noter('b', 'ok'); S.noter('b', 'limite');
t('after the cooldown an ok steps the level down by ONE (not forgiven at once)', S.instantane().b.encoreMs === ATTENTE_MAX_MS, String(S.instantane().b.encoreMs));
for (let i = 0; i < 20; i++) { T += ATTENTE_MAX_MS; S.noter('b', 'ok'); }
t('enough oks after cooldowns clear it', S.disponible('b') && !S.instantane().b);
S.noter('c', 'erreur');
t('a JSON-RPC error (an answer) never sets a host aside', S.disponible('c'));
S.noter('d', 'reseau');
t('no answer sets it aside', !S.disponible('d'));
S.noter('a', 'limite'); T += 1000; S.noter('c', 'limite');
const o = S.ordonner(U, 0);
t('cooled hosts last, soonest-back first; nothing dropped', o.length === 4 && o[0] === 'b' && JSON.stringify(o.slice(1)) === '["a","d","c"]' /* a and d back at the same instant: rotation order breaks the tie */, JSON.stringify(o));
for (const u of U) S.noter(u, 'limite');
t('all cooled: all still tried', S.ordonner(U, 0).length === 4);
/* the server */
t('server: compterEnvoi feeds the health state', SRV.includes('SANTE_RPC.noter(libelleNoeud(url), classe); /* game362 */'));
t('server: the 4 readers are ordered by it', (SRV.match(/SANTE_RPC\.ordonner\(/g) || []).length === 4 && SRV.includes('SANTE_RPC.ordonner(RPC_SIMULATION') && SRV.includes('SANTE_RPC.ordonner(RPC_LIST'));
const sec = SRV.slice(SRV.indexOf('async function secoursCle('), SRV.indexOf('async function secoursCle(') + 1500);
t('server: keyed fallback on eth_call only, never in test mode, own daily budget', sec.includes("if (!RELAIS_CLE || ESSAI_SRV.actif || methode !== 'eth_call') return { ok: false };") && sec.includes('if (secoursCompte.appels >= SECOURS_MAX_JOUR)'));
t('server: a read answered 0x is not taken from the keyed node either', sec.includes("!(lecture && j.result === '0x')"));
t('server: /sante publishes the hosts set aside and the keyed budget (never the key)', SRV.includes('santeRpc: { misDeCote: SANTE_RPC.instantane(), secoursCle: { ...secoursCompte, maxJour: SECOURS_MAX_JOUR, pose: !!RELAIS_CLE } }'));
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
