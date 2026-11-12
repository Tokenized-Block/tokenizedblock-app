// test-emission-b20-20261112.mjs — « who can still create more of this block? », checked on a FAKE chain, then the server wiring.
// ================================================================================================
// Phil (2026-11-12, CLOUD panel): « pourquoi pas vérifier » — the screen said « We did not check whether anyone can still create them ».
// emission-b20.js reads the roles held at the end of the token's creation block (its RoleGranted / RoleRevoked logs) and asks
// hasRole() now. The fake chain below answers eth_getCode / eth_call (latest and past blocks) / eth_getLogs / eth_blockNumber /
// eth_getTransactionByHash like the precompile measured the same day:
//   - before its birth, totalSupply() REVERTS (« execution reverted », seen at CLOUD's block - 1 on both public nodes);
//   - a token created with an admin logs RoleGranted from the factory in its creation block (seen on 0xb2…6f95fa).
// Cases: never granted (CLOUD shape) · granted and kept · granted then revoked in the same block · admin still holding (our
// router-born seed shape) · early admin gone later (INCERTAIN) · read failure (NON_LU, never a verdict) · a wrong index block
// (falls back to the bisection) · the service cache / per-minute cap · the server route.
// ⚠️ DOES NOT PROVE what the real chain answers today — the measured run is in the game376 report (CLOUD, TBLOCK, seed blocks).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as E from './emission-b20.js';

const TOK = '0xb2000000000000000000000000000000000000c1';
const FACTORY = '0xb20f000000000000000000000000000000000000';
const CREATEUR = '0x1111111111111111111111111111111111111111';
const AUTRE = '0x2222222222222222222222222222222222222222';
const NE = 1000; /* creation block */
const TETE = 5000;
const w = (n) => '0x' + BigInt(n).toString(16).padStart(64, '0');
const t = (a) => '0x' + String(a).toLowerCase().replace(/^0x/, '').padStart(64, '0');
const log = (topic, role, compte, par, i) => ({ address: TOK, topics: [topic, role, t(compte), t(par)], data: '0x', blockNumber: '0x' + NE.toString(16),
  transactionHash: '0x' + 'ab'.repeat(32), transactionIndex: '0x0', logIndex: '0x' + i.toString(16) });
const G = (role, c, par, i) => log(E.TOPIC_ROLE_GRANTED, role, c, par, i);
const R = (role, c, par, i) => log(E.TOPIC_ROLE_REVOKED, role, c, par, i);
const transfert = { address: TOK, topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', t('0x0'), t(CREATEUR)], data: w(1000),
  blockNumber: '0x' + NE.toString(16), transactionHash: '0x' + 'ab'.repeat(32), transactionIndex: '0x0', logIndex: '0x9' };

/** A fake chain. `roles` = what hasRole() answers NOW: Set of 'role|account'. */
/* `fauxRevert` = past blocks where totalSupply() answers « execution reverted » although the token exists (a node answering wrong once,
 *   seen in the review run); `cree` = the block holding the factory's B20Created for TOK (the true birth unless a test says otherwise) */
function chaine({ logs = [transfert], roles = new Set(), supply = 1000n, cap = (1n << 128n) - 1n, panne = null, roleAdmin = E.DEFAULT_ADMIN_ROLE,
  fauxRevert = new Set(), cree = NE } = {}) {
  const appels = [];
  const rpc = async (m, p) => {
    appels.push(m + (m === 'eth_call' ? ' ' + p[1] : ''));
    if (panne && panne(m, p)) throw new Error('request limit reached');
    if (m === 'eth_blockNumber') return '0x' + TETE.toString(16);
    if (m === 'eth_getCode') return '0xef';
    if (m === 'eth_getTransactionByHash') return { from: CREATEUR };
    if (m === 'eth_getLogs') {
      const q = p[0];
      const de = parseInt(q.fromBlock, 16), a = parseInt(q.toBlock, 16);
      if (q.address === FACTORY) {
        const ok = cree !== null && cree >= de && cree <= a && (!q.topics || (q.topics[0] === E.TOPIC_B20_CREATED && q.topics[1] === t(TOK)));
        return ok ? [{ address: FACTORY, topics: [E.TOPIC_B20_CREATED, t(TOK)], data: '0x', blockNumber: '0x' + cree.toString(16), transactionHash: '0x' + 'ab'.repeat(32), transactionIndex: '0x0', logIndex: '0x0' }] : [];
      }
      return logs.filter((l) => l.address === q.address && parseInt(l.blockNumber, 16) >= de && parseInt(l.blockNumber, 16) <= a);
    }
    if (m === 'eth_call') {
      const { data } = p[0];
      const bloc = p[1] === 'latest' ? TETE : parseInt(p[1], 16);
      if (bloc < NE || fauxRevert.has(bloc)) throw new Error('execution reverted');
      if (data === '0x18160ddd') return w(supply);
      if (data === '0x8f770ad0') return w(cap);
      if (data.startsWith('0x248a9ca3')) return roleAdmin;
      if (data.startsWith('0x91d14854')) {
        const role = '0x' + data.slice(10, 74), compte = '0x' + data.slice(-40);
        return w(roles.has(role + '|' + compte) ? 1 : 0);
      }
    }
    throw new Error('unexpected ' + m);
  };
  return { rpc, appels };
}

let n = 0;
const rouges = [];
const cas = async (nom, f) => {
  try { await f(); n++; console.log('ok  ' + nom); }
  catch (e) { rouges.push(nom); console.log('RED ' + nom + '\n    ' + String(e && e.message || e).split('\n')[0]); }
};

await cas('1. never granted (CLOUD shape): FIXE, « no right was given at creation »', async () => {
  const { rpc } = chaine();
  const v = await E.verifierEmission({ rpc, jeton: TOK, blocCreation: NE });
  assert.equal(v.etat, 'FIXE');
  assert.match(v.preuve, /no right was given at creation/);
  assert.equal(v.blocCreation, NE);
  assert.equal(v.createur, CREATEUR);
  assert.equal(E.phraseEmission(v), 'Fixed supply: nobody can create more');
});

await cas('2. granted at creation and kept: PEUT_CROITRE, the holder named, « the creator » when it is', async () => {
  const { rpc } = chaine({ logs: [G(E.DEFAULT_ADMIN_ROLE, CREATEUR, FACTORY, 1), G(E.MINT_ROLE, CREATEUR, FACTORY, 2), transfert],
    roles: new Set([E.DEFAULT_ADMIN_ROLE + '|' + CREATEUR, E.MINT_ROLE + '|' + CREATEUR]) });
  const v = await E.verifierEmission({ rpc, jeton: TOK, blocCreation: NE });
  assert.equal(v.etat, 'PEUT_CROITRE');
  assert.deepEqual(v.detenteurs.map((d) => [d.adr, d.createur, d.role]), [[CREATEUR, true, 'ADMIN']]);
  assert.equal(E.phraseEmission(v), 'Supply can still grow: the creator can create more');
});

await cas('3. granted then revoked in the creation block (TBLOCK shape): FIXE, « given up in the same block »', async () => {
  const { rpc } = chaine({ logs: [G(E.DEFAULT_ADMIN_ROLE, CREATEUR, FACTORY, 1), G(E.MINT_ROLE, CREATEUR, FACTORY, 2), transfert,
    R(E.MINT_ROLE, CREATEUR, CREATEUR, 10), R(E.DEFAULT_ADMIN_ROLE, CREATEUR, CREATEUR, 11)] });
  const v = await E.verifierEmission({ rpc, jeton: TOK, blocCreation: NE });
  assert.equal(v.etat, 'FIXE');
  assert.match(v.preuve, /given up in the same block/);
});

await cas('4. an admin still holding with supply == cap (router seed shape): PEUT_CROITRE — an admin can raise the cap', async () => {
  const { rpc } = chaine({ logs: [G(E.DEFAULT_ADMIN_ROLE, AUTRE, FACTORY, 1), transfert], supply: 1000n, cap: 1000n,
    roles: new Set([E.DEFAULT_ADMIN_ROLE + '|' + AUTRE]) });
  const v = await E.verifierEmission({ rpc, jeton: TOK, blocCreation: NE, etiquettes: { [AUTRE]: 'TokenizedBlock’s fee wallet' } });
  assert.equal(v.etat, 'PEUT_CROITRE');
  assert.equal(E.phraseEmission(v), 'Supply can still grow: TokenizedBlock’s fee wallet can create more');
  /* shortened when nothing names it, up to 3, then « and N more » */
  const p = E.phraseEmission({ etat: 'PEUT_CROITRE', detenteurs: [1, 2, 3, 4, 5].map((k) => ({ adr: '0x' + String(k).repeat(40) })) });
  assert.equal(p, 'Supply can still grow: 0x1111…1111, 0x2222…2222, 0x3333…3333 and 2 more can create more');
});

await cas('5b. review: INCERTAIN with a minter left and the cap reached never says « its first owner let go » (there may be no owner)', async () => {
  /* a minter granted at creation, NO admin ever, supply == cap: the module answers INCERTAIN (who may raise the cap is not read) */
  const { rpc } = chaine({ logs: [G(E.MINT_ROLE, AUTRE, FACTORY, 1), transfert], roles: new Set([E.MINT_ROLE + '|' + AUTRE]), supply: 1000n, cap: 1000n });
  const v = await E.verifierEmission({ rpc, jeton: TOK, blocCreation: NE });
  assert.equal(v.etat, 'INCERTAIN');
  const p = E.phraseEmission(v);
  assert.ok(!/first owner let go/.test(p), 'the sentence states an admin that was never read: ' + p);
  assert.match(p, /may still grow/);
  assert.match(p, /0x2222…2222/, 'the minter is not named: ' + p);
  assert.match(p, /cap/, 'the cap is not said: ' + p);
});

await cas('5. the early admin let go AFTER creation: INCERTAIN, never « fixed »', async () => {
  const { rpc } = chaine({ logs: [G(E.DEFAULT_ADMIN_ROLE, AUTRE, FACTORY, 1), transfert], roles: new Set() });
  const v = await E.verifierEmission({ rpc, jeton: TOK, blocCreation: NE });
  assert.equal(v.etat, 'INCERTAIN');
  assert.notEqual(E.phraseEmission(v), 'Fixed supply: nobody can create more');
  assert.match(E.phraseEmission(v), /may still grow/);
});

await cas('6. a minter granted, no admin, minter let go since: FIXE (nobody could grant again)', async () => {
  const { rpc } = chaine({ logs: [G(E.MINT_ROLE, AUTRE, FACTORY, 1), transfert], roles: new Set() });
  const v = await E.verifierEmission({ rpc, jeton: TOK, blocCreation: NE });
  assert.equal(v.etat, 'FIXE');
});

await cas('7. read failure: NON_LU with its cause, never a verdict, and no screen sentence (the page says « checking »)', async () => {
  for (const panne of [(m) => m === 'eth_getLogs', (m, p) => m === 'eth_call' && p[1] !== 'latest', (m) => m === 'eth_getCode']) {
    const { rpc } = chaine({ panne });
    const v = await E.verifierEmission({ rpc, jeton: TOK, blocCreation: null });
    assert.equal(v.etat, 'NON_LU', 'a failed read gave ' + v.etat);
    assert.match(v.pourquoi, /limit/);
    assert.equal(E.phraseEmission(v), null);
  }
  /* a log reader that answers something that is not a list is a failure, not « no role » */
  const { rpc } = chaine();
  const v = await E.verifierEmission({ rpc, rpcLogs: async () => null, jeton: TOK, blocCreation: NE });
  assert.equal(v.etat, 'NON_LU');
});

await cas('8. no index block: the bisection finds the birth; a WRONG index block is not trusted', async () => {
  const a = chaine();
  const v = await E.verifierEmission({ rpc: a.rpc, jeton: TOK });
  assert.equal(v.blocCreation, NE);
  assert.equal(v.etat, 'FIXE');
  assert.ok(a.appels.filter((x) => x.startsWith('eth_call 0x')).length <= 20, 'bisection too long: ' + a.appels.length);
  const b = chaine();
  const v2 = await E.verifierEmission({ rpc: b.rpc, jeton: TOK, blocCreation: NE + 7 });
  assert.equal(v2.blocCreation, NE, 'a wrong creation block was used as is');
  /* with the right index block: 2 past reads, no bisection */
  const c = chaine();
  await E.verifierEmission({ rpc: c.rpc, jeton: TOK, blocCreation: NE });
  assert.equal(c.appels.filter((x) => x.startsWith('eth_call 0x')).length, 2);
});

await cas('8b. review: ONE false « execution reverted » after the birth never turns into « Fixed supply » (TTB, measured)', async () => {
  /* the bisection 0..5000 asks 2500 then 1250: a node wrongly answering « reverted » at 1250 sends it to 1251, a block that holds
   *   none of the creation grants. The admin granted at NE still holds the right: the truth is PEUT_CROITRE, never FIXE. */
  const c = chaine({ logs: [G(E.DEFAULT_ADMIN_ROLE, CREATEUR, FACTORY, 1), transfert], roles: new Set([E.DEFAULT_ADMIN_ROLE + '|' + CREATEUR]),
    fauxRevert: new Set([1250]) });
  const v = await E.verifierEmission({ rpc: c.rpc, jeton: TOK });
  assert.notEqual(v.etat, 'FIXE', 'a wrong creation block (' + v.blocCreation + ') gave « Fixed supply »');
  assert.equal(v.etat, 'NON_LU');
  assert.match(v.pourquoi, /not proven/);
  assert.equal(E.phraseEmission(v), null);
  /* the same chain answering right: PEUT_CROITRE, the proof found at the true birth */
  const d = chaine({ logs: [G(E.DEFAULT_ADMIN_ROLE, CREATEUR, FACTORY, 1), transfert], roles: new Set([E.DEFAULT_ADMIN_ROLE + '|' + CREATEUR]) });
  assert.equal((await E.verifierEmission({ rpc: d.rpc, jeton: TOK })).etat, 'PEUT_CROITRE');
  /* a block with no B20Created for this token (an index entry gone wrong both ways) is not a creation block either */
  const e = chaine({ cree: null });
  assert.equal((await E.verifierEmission({ rpc: e.rpc, jeton: TOK, blocCreation: NE })).etat, 'NON_LU');
  /* the constants are the server index's own */
  const R = await import('./index-routeur.js');
  assert.equal(E.FACTORY_B20, R.FACTORY_B20); assert.equal(E.TOPIC_B20_CREATED, R.TOPIC_B20_CREATED);
});

await cas('9. not a native B20 (code is not 0xef): no verdict', async () => {
  const { rpc } = chaine();
  const v = await E.verifierEmission({ rpc: async (m, p) => (m === 'eth_getCode' ? '0x6080' : rpc(m, p)), jeton: TOK });
  assert.equal(v.etat, 'NON_LU');
  assert.equal(v.pasB20, true);
});

await cas('10. the service: FIXE kept for good, a failure retried after 60 s, a per-minute cap, the route never waits', async () => {
  let t0 = 0, nb = 0, reponse = { etat: 'NON_LU', jeton: TOK, pourquoi: 'request limit reached' };
  const s = E.creerServiceEmission({ verifier: async () => { nb++; return { ...reponse }; }, maintenant: () => t0, parMinute: 2 });
  const d1 = s.demander(TOK);
  assert.equal(d1.v, null); assert.equal(d1.enCours, true);
  await s._attendre();
  assert.equal(s.demander(TOK).v.etat, 'NON_LU');
  assert.equal(nb, 1, 'a cached failure was re-read at once');
  t0 += E.DUREE_NON_LU_MS + 1; reponse = { etat: 'FIXE', jeton: TOK, detenteurs: [] };
  s.demander(TOK); await s._attendre();
  assert.equal(nb, 2);
  t0 += 10 * 365 * 86400000;
  assert.equal(s.demander(TOK).v.etat, 'FIXE'); assert.equal(nb, 2, 'a FIXE verdict went stale');
  assert.deepEqual(s.exporter().map(([j]) => j), [TOK]);
  const s2 = E.creerServiceEmission({ verifier: async () => { throw new Error('x'); } });
  assert.equal(s2.importer(s.exporter()), 1);
  assert.equal(s2.demander(TOK).v.etat, 'FIXE');
  /* the per-minute cap: a 3rd new token in the same minute waits in the queue */
  let lancees = 0;
  const s3 = E.creerServiceEmission({ verifier: async ({ jeton }) => { lancees++; return { etat: 'FIXE', jeton }; }, maintenant: () => 0, parMinute: 2 });
  for (const k of ['1', '2', '3']) { s3.demander('0xb2' + k.repeat(38)); await s3._attendre(); }
  assert.equal(lancees, 2, 'the per-minute cap did not hold');
});

await cas('10b. review: a re-check (stale PEUT_CROITRE) is handed the creation block it found before — no new bisection every 30 min', async () => {
  let t0 = 0; const vus = [];
  const s = E.creerServiceEmission({ maintenant: () => t0,
    verifier: async ({ jeton, precedent }) => { vus.push(precedent || null); return { etat: 'PEUT_CROITRE', jeton, blocCreation: 1234, detenteurs: [] }; } });
  s.demander(TOK); await s._attendre();
  t0 += E.DUREE_PEUT_CROITRE_MS + 1;
  s.demander(TOK); await s._attendre();
  assert.equal(vus.length, 2);
  assert.equal(vus[0], null);
  assert.equal(vus[1] && vus[1].blocCreation, 1234, 'the second check did not get the block found by the first');
  /* the module re-checks a handed block (born at b, not at b-1) before using it, so a stale one costs 2 calls, not a wrong verdict */
  const { rpc, appels } = chaine();
  const v = await E.verifierEmission({ rpc, jeton: TOK, blocCreation: NE });
  assert.equal(v.etat, 'FIXE'); assert.ok(appels.filter((x) => /^eth_call 0x/.test(x)).length <= 2, 'a handed block still bisected: ' + appels.join(','));
  /* and the server passes it */
  const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
  const i = srv.indexOf('const serviceEmission = creerServiceEmission(');
  assert.match(srv.slice(i, i + 1500), /precedent && Number\.isSafeInteger\(precedent\.blocCreation\)/, 'the server does not reuse the block found before');
});

await cas('11. the server: /api/emission wired to the module, its log reader, the index block, the creator; a phrase field', () => {
  const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
  assert.match(srv, /import \{ verifierEmission, creerServiceEmission, phraseEmission \} from '\.\/emission-b20\.js'/);
  assert.match(srv, /chemin\.startsWith\('\/api\/emission\/'\)/);
  const i = srv.indexOf('const serviceEmission = creerServiceEmission(');
  const bloc = srv.slice(i, srv.indexOf('});', srv.indexOf('surFixe', i)));
  assert.match(bloc, /rpcLogs: lecteurLogs\(/, 'the creation-block logs bypass the budget-aware reader');
  assert.match(bloc, /faitsCreation\.get\(jeton\)/, 'the server index block is not used');
  assert.match(bloc, /creationsLuesIci\.get\(jeton\)/);
  assert.match(bloc, /createurParBlock\.get\(jeton\)/);
  assert.match(bloc, /FEE_WALLET/);
  assert.match(srv, /phrase: phraseEmission\(v\)/);
  /* the route answers from the cache: no await between the route and its answer */
  const r = srv.slice(srv.indexOf("if (chemin.startsWith('/api/emission/'))"), srv.indexOf("if (chemin === '/api/voix' ||"));
  assert.ok(!/await /.test(r), 'the route waits on the chain');
});

const TOTAL = 14;
console.log('\ntest-emission-b20 : ' + n + ' green, ' + rouges.length + ' red, of ' + TOTAL);
if (rouges.length || n !== TOTAL) { console.log('RED: ' + rouges.join(' | ')); process.exit(1); }
