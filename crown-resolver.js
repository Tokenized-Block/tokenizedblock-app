/* crown-resolver.js -- the server keeper that POSTS who wore the crown at the end of each CrownMarket round (Phil 2026-11-16: "oui je
 *   valide le modele": the keeper posts the winner with the world's fingerprint, a challenge window follows, refunds if nothing is posted).
 * WHAT IT DOES, AND NOTHING ELSE:
 *   - WITHOUT a key, or with a key that is not market.resolver() read on chain: nothing (OFF, and why; the key is never shown).
 *   - WITH it: every `intervalleMs` it looks at the last `regard` finished rounds; for a round whose pot is not 0, that is not posted yet,
 *     inside its RESOLVE_DEADLINE, and whose crown the live game noted at the round's last block (crownOf(r) -> { winner, hash }), it
 *     SIMULATES post(r, winner, hash) from the key's address and sends it. One send per round at most per pass, through `exclusif`.
 *   - It posts what the live game computed, never another winner. A round the game did not play (another season, a gap) is not posted:
 *     the contract refunds it after its deadline.
 *   - ONLY EVER: post(uint256,address,bytes32) to the market, value 0, the chain given, gas and fee capped; checked BEFORE signing.
 *   - STOP after `echecsMax` failures in a row, until a restart. */
import { selecteur } from './keccak.js';
import { adresseDe } from './signeur-secp256k1.js';
import { signerEip1559 } from './tx-eip1559.js';

export const SEL_POST = selecteur('post(uint256,address,bytes32)').toLowerCase();
export const BORNES_DEFAUT = Object.freeze({ intervalleMs: 30000, regard: 6, gasMaxParTx: 250000n, maxFeeWei: 2000000000n, prioWeiMax: 1000000n, echecsMax: 3, inclusionMaxMs: 120000 });
const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x == null ? '' : x).toLowerCase();
const adr = (x) => (ADR.test(bas(x)) ? bas(x) : null);
const u = (n) => BigInt(n).toString(16).padStart(64, '0');
const mot = (h, i = 0) => { const m = String(h || '').replace(/^0x/, '').slice(64 * i, 64 * (i + 1)); return m.length === 64 ? BigInt('0x' + m) : null; };
const msg = (e) => String((e && e.message) || e).slice(0, 240);
/** the world hash of the engine ("<16 hex>:<cells>") as bytes32: its 16 hex left-padded, so anybody can compare */
export const hashEnBytes32 = (h) => { const m = /^([0-9a-f]{16}):\d+$/.exec(String(h || '')); if (!m) throw new Error('not a world hash: ' + h); return m[1].padStart(64, '0'); };
export const donneesPost = (r, winner, hash) => SEL_POST + u(r) + String(adr(winner) || '').replace(/^0x/, '').padStart(64, '0') + hashEnBytes32(hash);

export function verifierEnvoi(tx, { marche, chainId, bornes = BORNES_DEFAUT }) {
  if (bas(tx.to) !== adr(marche)) throw new Error('crown resolver: destination is not the market');
  if (BigInt(tx.value || 0) !== 0n) throw new Error('crown resolver: value must be 0');
  if (BigInt(tx.chainId) !== BigInt(chainId)) throw new Error('crown resolver: wrong chain');
  const d = bas(tx.data);
  if (!d.startsWith(SEL_POST) || d.length !== 10 + 64 * 3) throw new Error('crown resolver: only post(uint256,address,bytes32) is ever sent');
  if (BigInt(tx.gas) > BigInt(bornes.gasMaxParTx)) throw new Error('crown resolver: gas above the cap');
  if (BigInt(tx.maxFeePerGas) > BigInt(bornes.maxFeeWei)) throw new Error('crown resolver: fee above the cap');
  return true;
}

export function creerResolverCouronne({ cle = null, marche = null, chaine = null, rpc = null, crownOf = null, journal = () => {}, bornes: bIn = {},
  maintenant = () => Date.now(), exclusif = (fn) => fn(), desactive = null } = {}) {
  const bornes = { ...BORNES_DEFAUT, ...bIn };
  const off = (pourquoi) => ({ etat: () => ({ etat: 'OFF', pourquoi, adresse: null }), tour: async () => ({ fait: false, pourquoi }), demarrer: () => false, arreter: () => {}, config: () => null });
  if (desactive) return off(String(desactive));
  const M = adr(marche);
  if (!M) return off('no market is named (CrownMarket not deployed yet)');
  if (!cle) return off('no keeper key is set: no round result is posted by the server');
  if (typeof rpc !== 'function' || typeof crownOf !== 'function') return off('no RPC reader or no crown source');
  let moi; try { moi = bas(adresseDe(cle)); } catch (_) { return off('the keeper key is malformed (its value is never shown)'); }
  const chainId = Number(chaine);
  const st = { etat: 'ON', adresse: moi, vu: false, cfg: null, enVol: null, echecsSuite: 0, arret: null, attente: null, dernier: null, erreurs: [],
    compteurs: { tours: 0, envois: 0, inclus: 0, reverts: 0, refusSimulation: 0, lecturesRatees: 0, envoisRefuses: 0, nonInclus: 0, sansCouronne: 0 } };
  let minuteur = null, enCours = false;
  const erreur = (t) => { st.erreurs.push({ a: new Date(maintenant()).toISOString(), t }); if (st.erreurs.length > 20) st.erreurs.shift(); journal('[crown-resolver] ' + t); };
  const arret = (p) => { st.etat = 'ARRETE'; st.arret = { a: new Date(maintenant()).toISOString(), pourquoi: p }; erreur(p); };
  const echec = (t) => { st.echecsSuite += 1; erreur(t); if (st.echecsSuite >= bornes.echecsMax) arret(st.echecsSuite + ' failures in a row: stopped until a restart'); };
  const lit = async (sig, args = '') => { const r = mot(await rpc('eth_call', [{ to: M, data: selecteur(sig) + args }, 'latest'])); if (r === null) throw new Error(sig + ' not read'); return r; };

  async function tour() {
    if (st.etat !== 'ON') return { fait: false, pourquoi: st.arret ? st.arret.pourquoi : st.etat };
    if (enCours) return { fait: false, pourquoi: 'a round is running' };
    enCours = true; st.compteurs.tours += 1;
    try {
      if (!st.vu) {
        if (BigInt(await rpc('eth_chainId', [])) !== BigInt(chainId)) { arret('wrong chain: stopped'); return { fait: false, pourquoi: st.arret.pourquoi }; }
        const res = '0x' + String(await rpc('eth_call', [{ to: M, data: selecteur('resolver()') }, 'latest'])).replace(/^0x/, '').slice(24, 64).toLowerCase();
        if (res !== moi) { arret('the keeper key is not the market resolver ' + res + ': nothing is posted'); return { fait: false, pourquoi: st.arret.pourquoi }; }
        st.cfg = { genesis: Number(await lit('GENESIS_BLOCK()')), roundBlocks: Number(await lit('ROUND_BLOCKS()')), deadline: Number(await lit('RESOLVE_DEADLINE()')) };
        st.vu = true;
      }
      if (st.enVol) {
        const recu = await rpc('eth_getTransactionReceipt', [st.enVol.hash]).catch(() => null);
        if (!recu) { if (maintenant() - st.enVol.a > bornes.inclusionMaxMs) { st.enVol = null; st.compteurs.nonInclus += 1; echec('post tx not included'); } return { fait: false, pourquoi: 'waiting for the transaction in flight' }; }
        const v = st.enVol; st.enVol = null;
        if (String(recu.status) === '0x1') { st.compteurs.inclus += 1; st.echecsSuite = 0; st.dernier = { ...v, inclus: true }; journal('[crown-resolver] round ' + v.r + ' posted: ' + v.winner + ', tx ' + v.hash); }
        else { st.compteurs.reverts += 1; echec('post tx ' + v.hash + ' reverted'); }
      }
      const tete = parseInt(await rpc('eth_blockNumber', []), 16);
      const { genesis, roundBlocks, deadline } = st.cfg;
      if (tete < genesis + roundBlocks) { st.attente = 'no round has ended yet'; return { fait: false, pourquoi: st.attente }; }
      const dernier = Math.floor((tete - genesis) / roundBlocks) - 1;
      for (let r = dernier; r >= Math.max(0, dernier - bornes.regard + 1); r--) {
        const fin = genesis + (r + 1) * roundBlocks - 1;
        if (tete <= fin || tete > fin + deadline) continue;
        const brut = await rpc('eth_call', [{ to: M, data: selecteur('rounds(uint256)') + u(r) }, 'latest']);
        const pot = mot(brut, 0), postedAt = mot(brut, 4);
        if (pot === null || postedAt === null) { st.compteurs.lecturesRatees += 1; continue; }
        if (pot === 0n || postedAt !== 0n) continue;
        const c = crownOf(r);
        if (!c || !c.winner || !c.hash) { st.compteurs.sansCouronne += 1; st.attente = 'round ' + r + ' has bets but the live game did not note its crown'; continue; }
        const data = donneesPost(r, c.winner, c.hash);
        let estime;
        try { await rpc('eth_call', [{ from: moi, to: M, data }, 'latest']); estime = BigInt(await rpc('eth_estimateGas', [{ from: moi, to: M, data }])); }
        catch (e) { st.compteurs.refusSimulation += 1; st.attente = 'simulation refused: ' + msg(e).slice(0, 80); continue; }
        const bloc = await rpc('eth_getBlockByNumber', ['latest', false]); const base = BigInt(bloc.baseFeePerGas);
        let prio = 0n; try { prio = BigInt(await rpc('eth_maxPriorityFeePerGas', [])); } catch (_) { prio = 0n; }
        if (prio > BigInt(bornes.prioWeiMax)) prio = BigInt(bornes.prioWeiMax);
        if (base + prio > BigInt(bornes.maxFeeWei)) return { fait: false, pourquoi: 'gas price above the cap' };
        const maxFee = 2n * base + prio > BigInt(bornes.maxFeeWei) ? BigInt(bornes.maxFeeWei) : 2n * base + prio;
        return await exclusif(async () => {
          const nonce = BigInt(await rpc('eth_getTransactionCount', [moi, 'pending']));
          const tx = { chainId, nonce, maxPriorityFeePerGas: prio, maxFeePerGas: maxFee, gas: (estime * 12n) / 10n, to: M, value: 0n, data };
          verifierEnvoi(tx, { marche: M, chainId, bornes });
          const signe = signerEip1559(tx, cle);
          if (bas(signe.de) !== moi) throw new Error('crown resolver: the signature does not recover the keeper address');
          try { await rpc('eth_sendRawTransaction', [signe.brut]); }
          catch (e) { if (!/already known|known transaction/i.test(msg(e))) { st.compteurs.envoisRefuses += 1; echec('send refused: ' + msg(e)); return { fait: false, pourquoi: 'send refused' }; } }
          st.enVol = { hash: signe.hash, r, winner: c.winner, a: maintenant() }; st.compteurs.envois += 1;
          return { fait: true, hash: signe.hash, r };
        });
      }
      st.attente = 'no finished round with bets is waiting'; return { fait: false, pourquoi: st.attente };
    } catch (e) { erreur('round failed: ' + msg(e)); return { fait: false, pourquoi: 'round failed' }; }
    finally { enCours = false; }
  }
  return {
    etat: () => ({ etat: st.etat, adresse: st.adresse, cfg: st.cfg, enVol: st.enVol ? { ...st.enVol } : null, echecsSuite: st.echecsSuite, arret: st.arret, attente: st.attente,
      compteurs: { ...st.compteurs }, dernier: st.dernier ? { ...st.dernier } : null, erreurs: st.erreurs.slice() }),
    config: () => st.cfg, tour,
    demarrer() { const b = async () => { await tour(); if (st.etat === 'ON') { minuteur = setTimeout(b, bornes.intervalleMs); minuteur.unref?.(); } }; minuteur = setTimeout(b, 50000); minuteur.unref?.(); return true; },
    arreter() { clearTimeout(minuteur); minuteur = null; },
  };
}
