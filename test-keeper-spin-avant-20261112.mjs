/* test-keeper-spin-avant-20261112.mjs — THE KEEPER FOLLOWS THE NEW SPIN AND STILL SETTLES THE EARLIER ONE (slots-regleur.js slotsAvant).
 * WHY: Phil 2026-11-12, a new Spin whose dev share is paid through the TBLOCK payment router. Once its address is recorded the server's
 *   keeper settles the NEW Spin; a spin played on the EARLIER Spin just before the switch must not be lost (a spin not settled within 256
 *   blocks is lost). The two contracts number their spins from 1 each: the same id lives on both.
 * Against a fake chain with TWO slots contracts (no network, the public test key 0x..01):
 *   (1) a settleable spin on the earlier Spin only: ONE settleMany([id]) is simulated and sent TO THE EARLIER Spin; etat() names it;
 *   (2) the same id settleable on both: the earlier deadline first; the receipt's Settled of the earlier Spin clears ITS id only, and the
 *       next round settles the same id on the new Spin;
 *   (3) the earlier Spin's logs are read from ITS own creation block, never before;
 *   (4) the guard: settleMany / settle to the earlier Spin pass only when it is given; payDev, approve, transfer to it never;
 *   (5) the earlier Spin equal to the new one, or without a prize table: OFF.
 * REGLEUR_MODULE: a mutated copy (muter-slots-regleur.mjs); else the repo module. Counts itself. */
import { strict as assert } from 'node:assert';
import { pathToFileURL } from 'node:url';
import * as Slots from './slots-plan.js';
import { keccak256Hex, selecteur, topic } from './keccak.js';
const MOD = process.env.REGLEUR_MODULE ? pathToFileURL(process.env.REGLEUR_MODULE).href : new URL('./slots-regleur.js', import.meta.url).href;
const { creerRegleur, verifierEnvoi, donneesSettleMany } = await import(MOD);

let n = 0;
const vu = (c, m) => { n += 1; assert.ok(c, m); console.log('  ok   ' + m); };
const CLE = '0x' + '0'.repeat(63) + '1';
const NEUF = '0x' + 'c1'.repeat(20), VIEUX = '0x' + 'c0'.repeat(20);
const TABLE = ['0', '0', '0', '250000', '750000', '2000000', '3000000', '4000000', '5000000', '5000000', '5000000', '5000000', '5000000', '5000000', '5000000', '5000000'];
const JOUEUR = '0x' + 'a1'.repeat(20);
const u = (x) => BigInt(x).toString(16).padStart(64, '0');
const hx = (x) => '0x' + BigInt(x).toString(16);
const trois = (g) => [0, 1, 2].map((r) => keccak256Hex(new Uint8Array([...Buffer.from(g, 'utf8'), r])));
const graineDe = (id, ok) => { for (let i = 0; i < 20000; i++) { const g = 'av' + id + '-' + i, h = trois(g); if (ok(Slots.points(Slots.facesDuSpin(h, BigInt(id))))) return h; } throw new Error('no seed'); };

function chaine({ tete = 200000 } = {}) {
  const ch = { tete, base: 1_000_000n, prio: 1000n, nonce: 9n, blocs: new Map(), spun: [], logsLus: [], estimes: [], envoyes: [], recus: new Map(),
    pots: new Map([[NEUF, 100_000_000n], [VIEUX, 100_000_000n]]), statut: new Map() };
  ch.spin = (c, id, t, hashes) => {
    ch.spun.push({ address: c, blockNumber: hx(t - 2), topics: [Slots.TOPIC_SPUN, '0x' + u(id), '0x' + '0'.repeat(24) + JOUEUR.slice(2)], data: '0x' + u(t) + u(250000) + u(250000) });
    ch.statut.set(c + ':' + id, 1);
    hashes.forEach((h, r) => ch.blocs.set(t + r, h));
  };
  ch.rpc = async (m, p) => {
    switch (m) {
      case 'eth_chainId': return hx(8453);
      case 'eth_blockNumber': return hx(ch.tete);
      case 'eth_getBlockByNumber': { const b = p[0] === 'latest' ? ch.tete : parseInt(p[0], 16); if (b > ch.tete) return null; return { number: hx(b), hash: ch.blocs.get(b) || ('0x' + u(BigInt(b) * 7919n + 1n)), timestamp: hx(1_700_000_000 + Math.floor(b / 5)), baseFeePerGas: hx(ch.base) }; }
      case 'eth_getLogs': { const f = p[0], de = parseInt(f.fromBlock, 16), a = parseInt(f.toBlock, 16); ch.logsLus.push({ address: f.address, de }); return ch.spun.filter((l) => { const b = parseInt(l.blockNumber, 16); return b >= de && b <= a && l.address === f.address && l.topics[0] === f.topics[0]; }); }
      case 'eth_call': {
        const { to, data: d } = p[0];
        if (!ch.pots.has(to)) throw new Error('eth_call to an unknown contract ' + to);
        if (d === Slots.appelPot()) return '0x' + u(ch.pots.get(to));
        if (d.startsWith(Slots.appelSpin(0).slice(0, 10))) { const id = String(BigInt('0x' + d.slice(10))); return '0x' + u(JOUEUR) + u(0) + u(ch.statut.get(to + ':' + id) ?? 0); }
        throw new Error('unexpected eth_call');
      }
      case 'eth_maxPriorityFeePerGas': return hx(ch.prio);
      case 'eth_estimateGas': ch.estimes.push({ to: p[0].to, data: p[0].data }); return hx(200000);
      case 'eth_getTransactionCount': return hx(p[1] === 'latest' ? ch.nonce - 1n : ch.nonce);
      case 'eth_sendRawTransaction': ch.envoyes.push(p[0]); return null;
      case 'eth_getTransactionReceipt': return ch.recus.has(p[0]) ? ch.recus.get(p[0]) : null;
      case 'eth_getTransactionByHash': return null;
      default: throw new Error('unexpected method ' + m);
    }
  };
  /* the last tx is mined: Settled logs FROM the contract it went to, for these ids */
  ch.inclure = (hash, to, ids) => {
    for (const id of ids) ch.statut.set(to + ':' + id, 2);
    ch.recus.set(hash, { status: '0x1', blockNumber: hx(ch.tete), logs: ids.map((id) => ({ address: to, topics: [topic(Slots.EV_SETTLED), '0x' + u(id), '0x' + '0'.repeat(24) + JOUEUR.slice(2)],
      data: '0x' + [1, 2, 3].map(u).join('') + new Array(15).fill(0).map(u).join('') + u(5) + u(2000000) + u(0) + u(5) })) });
    ch.nonce += 1n;
  };
  return ch;
}
const regleur = (ch, avant = { contrat: VIEUX, table: TABLE, bloc: 150000 }) => {
  let t = 1_000_000;
  const r = creerRegleur({ cle: CLE, contrat: NEUF, chainId: 8453, table: TABLE, blocDeploiement: 199000, rpc: ch.rpc, maintenant: () => t, msParBloc: 2000, slotsAvant: avant });
  return { r, avancer: (ms) => { t += ms; } };
};

console.log('— (1) a spin left on the earlier Spin is settled there');
{
  const ch = chaine();
  const h = graineDe(7, (p) => p >= 3);
  ch.spin(VIEUX, 7, ch.tete - 40, h);
  const { r } = regleur(ch);
  vu(r.etat().etat === 'ON', 'keeper ON with the new Spin and the earlier one');
  const x = await r.tour();
  vu(x.fait === true && x.cible === 'slots' && x.ids.join() === '7', 'one tx sent for spin 7 (' + JSON.stringify({ fait: x.fait, ids: x.ids }) + ')');
  const last = ch.estimes[ch.estimes.length - 1];
  vu(last.to === VIEUX && last.data === donneesSettleMany(['7']), 'the simulated call is settleMany([7]) TO THE EARLIER Spin');
  vu(ch.envoyes.length === 1, 'exactly one raw transaction sent');
  const e = r.etat();
  vu(e.contrats.slotsAvant && e.contrats.slotsAvant.contrat === VIEUX && e.contrats.slots.contrat === NEUF, 'etat() names the new Spin and the earlier one');
}

console.log('— (2) the same id on both contracts: each settled on its own contract');
{
  const ch = chaine();
  ch.spin(VIEUX, 3, ch.tete - 100, graineDe(3, (p) => p >= 3));
  ch.spin(NEUF, 3, ch.tete - 30, graineDe(3, (p) => p >= 3));
  const { r, avancer } = regleur(ch);
  const a = await r.tour();
  vu(a.fait && ch.estimes[ch.estimes.length - 1].to === VIEUX, 'the earlier deadline first: the earlier Spin\'s spin 3');
  ch.inclure(a.hash, VIEUX, ['3']);
  avancer(20000); ch.tete += 2;
  const b = await r.tour(); /* follows the inclusion */
  const c = b.fait ? b : await r.tour();
  vu(c.fait === true && c.ids.join() === '3' && ch.estimes[ch.estimes.length - 1].to === NEUF, 'then spin 3 of the NEW Spin is sent (the earlier receipt cleared only its own id)');
}

console.log('— (3) the earlier Spin\'s logs are read from its own creation block');
{
  const ch = chaine({ tete: 150100 });
  const { r } = regleur(ch);
  await r.tour();
  const lus = ch.logsLus.filter((l) => l.address === VIEUX);
  vu(lus.length >= 1 && lus.every((l) => l.de >= 150000), 'earlier Spin getLogs from >= its block 150000 (' + lus.map((l) => l.de).join(',') + ')');
}

console.log('— (4) the guard');
{
  const base = { chainId: 8453n, value: 0n };
  const ok = (to, data, cfg) => { try { verifierEnvoi({ ...base, to, data }, { contrat: NEUF, chainId: 8453, ...cfg }); return true; } catch (_) { return false; } };
  vu(ok(VIEUX, donneesSettleMany(['1', '2']), { slotsAvant: VIEUX }), 'settleMany to the earlier Spin passes when it is given');
  vu(ok(VIEUX, selecteur('settle(uint256)') + u(4), { slotsAvant: VIEUX }), 'settle(id) to the earlier Spin passes when it is given');
  vu(!ok(VIEUX, donneesSettleMany(['1']), {}), 'settleMany to the earlier Spin is refused when it is not given');
  vu(!ok(VIEUX, selecteur('payDev()'), { slotsAvant: VIEUX }), 'payDev() to the earlier Spin is refused');
  vu(!ok(NEUF, selecteur('payDev(uint256,uint256,uint256)') + u(1) + u(1) + u(1), { slotsAvant: VIEUX }), 'payDev(amount, min, deadline) to the new Spin is refused');
  vu(!ok(VIEUX, selecteur('approve(address,uint256)') + u(1) + u(1), { slotsAvant: VIEUX }), 'approve to the earlier Spin is refused');
}

console.log('— (5) a wrong earlier Spin turns the keeper OFF');
{
  const ch = chaine();
  vu(regleur(ch, { contrat: NEUF, table: TABLE, bloc: 1 }).r.etat().etat === 'OFF', 'earlier Spin = the new one: OFF');
  vu(regleur(ch, { contrat: VIEUX, table: null, bloc: 1 }).r.etat().etat === 'OFF', 'earlier Spin without its prize table: OFF');
  vu(regleur(ch, null).r.etat().contrats.slotsAvant === null, 'no earlier Spin: etat() says null');
}
console.log(n + '/' + n + ' — green');
