/* close-keeper.js -- the server keeper that CLOSES finished weeks and months (Phil 2026-11-14: "utilise deja le keeper qu'on a", item 3).
 *   closeEpoch(e) is PUBLIC on the holders vault V (weeks of the hearts' clock), the monthly lock rewards R and the weekly lock rewards R2.
 *   Until a period is closed nobody can claim it, and nobody else closes it. Closing moves no token: it fixes that period's pot.
 * WHAT IT DOES, AND NOTHING ELSE:
 *   - WITHOUT a key, or with a key whose address is not the gas-only keeper named by the caller (the buyback keeper of its record):
 *     nothing (OFF, and why; the key value is never shown, logged or returned).
 *   - WITH it: every `intervalleMs` it reads, for each target, the period that may be closed (decider*, pure), waits `margeS` after the
 *     end the contract itself requires (so a late play or count is not cut), SIMULATES closeEpoch(e) by eth_call from the key's address
 *     and sends ONE transaction per round at most, only if the simulation passes. A refused simulation means "not yet": never a failure.
 *   - ONLY EVER: closeEpoch(uint256) to V, R or R2 as given, value 0, the given chain, gas <= gasMaxParTx, fee <= maxFeeWei;
 *     verifierEnvoi() throws BEFORE the signature otherwise. It never sends ETH or a token, never calls claim / markPlayed / anything else.
 *   - The same key runs the buyback and Spin keepers: every send goes through `exclusif` (one shared lock), so no nonce is taken twice.
 *   - STOP after `echecsMax` failures in a row (a mined revert, a send refused, a tx never included), until a restart. */
import { selecteur } from './keccak.js';
import { adresseDe } from './signeur-secp256k1.js';
import { signerEip1559 } from './tx-eip1559.js';

export const SEL_CLOSE = selecteur('closeEpoch(uint256)').toLowerCase();
export const BORNES_DEFAUT = Object.freeze({ intervalleMs: 600000, gasMaxParTx: 600000n, maxFeeWei: 2000000000n, prioWeiMax: 1000000n,
  echecsMax: 3, inclusionMaxMs: 120000, margeS: 3600n, regardV: 4n });

const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x == null ? '' : x).toLowerCase();
const adr = (x) => (ADR.test(bas(x)) ? bas(x) : null);
const u = (n) => BigInt(n).toString(16).padStart(64, '0');
const mot = (h, i = 0) => { const m = String(h || '').replace(/^0x/, '').slice(64 * i, 64 * (i + 1)); return m.length === 64 ? BigInt('0x' + m) : null; };
const msg = (e) => String((e && e.message) || e).slice(0, 240);
export const donneesClose = (e) => SEL_CLOSE + u(e);

/** Pure, R and R2 (periods in order): close nextEpochToClose once it is over, plus the contract's grace, plus margeS. */
export function deciderEnOrdre({ prochain, courant, fin, graceS, maintenantS, margeS }) {
  const p = BigInt(prochain), c = BigInt(courant);
  if (p >= c) return { appeler: false, pourquoi: 'period ' + p + ' is the current one' };
  if (BigInt(maintenantS) < BigInt(fin) + BigInt(graceS) + BigInt(margeS)) return { appeler: false, pourquoi: 'period ' + p + ' ended, waiting for its grace and margin' };
  return { appeler: true, periode: p };
}

/** Pure, V (any order): the oldest of the last `regard` finished weeks not closed yet, once its end + margeS has passed.
 *   semaines = [{ e, ferme, fin }] for e = courant - regard .. courant - 1 (read on chain). */
export function deciderV({ semaines, maintenantS, margeS }) {
  for (const s of [...semaines].sort((a, b) => (BigInt(a.e) < BigInt(b.e) ? -1 : 1))) {
    if (s.ferme) continue;
    if (BigInt(maintenantS) < BigInt(s.fin) + BigInt(margeS)) return { appeler: false, pourquoi: 'week ' + s.e + ' ended, waiting for the margin' };
    return { appeler: true, periode: BigInt(s.e) };
  }
  return { appeler: false, pourquoi: 'no finished week left open' };
}

/** throws BEFORE any signature unless tx is exactly closeEpoch(e) to one of the admitted targets */
export function verifierEnvoi(tx, { cibles, chainId, bornes = BORNES_DEFAUT }) {
  const ok = (cibles || []).map(adr).filter(Boolean);
  if (!ok.includes(bas(tx.to))) throw new Error('close keeper: destination is not V, R or R2');
  if (BigInt(tx.value || 0) !== 0n) throw new Error('close keeper: value must be 0');
  if (BigInt(tx.chainId) !== BigInt(chainId)) throw new Error('close keeper: wrong chain');
  const d = bas(tx.data);
  if (!d.startsWith(SEL_CLOSE) || d.length !== 10 + 64) throw new Error('close keeper: only closeEpoch(uint256) is ever sent');
  if (BigInt(tx.gas) > BigInt(bornes.gasMaxParTx)) throw new Error('close keeper: gas above the cap');
  if (BigInt(tx.maxFeePerGas) > BigInt(bornes.maxFeeWei)) throw new Error('close keeper: fee above the cap');
  return true;
}

/**
 * vault = V, horloge = the hearts contract whose currentEpoch()/epochEnd(e) are V's weeks, mensuel = R, hebdo = R2 (each or null);
 * chaine = chain id; keeperAttendu = the only address this keeper may run as; cle from process.env only; rpc reads; rpcEnvoi sends;
 * exclusif(fn) = the lock shared with the other keepers on the same key.
 */
export function creerKeeperClose({ cle = null, vault = null, horloge = null, mensuel = null, hebdo = null, chaine = null, keeperAttendu = null,
  rpc = null, rpcEnvoi = null, journal = () => {}, bornes: bIn = {}, maintenant = () => Date.now(), exclusif = (fn) => fn(), desactive = null } = {}) {
  const bornes = { ...BORNES_DEFAUT, ...bIn };
  const off = (pourquoi) => ({ etat: () => ({ etat: 'OFF', pourquoi, adresse: null }), tour: async () => ({ fait: false, pourquoi }), demarrer: () => false, arreter: () => {} });
  if (desactive) return off(String(desactive));
  const V = adr(vault), L = adr(horloge), R = adr(mensuel), R2 = adr(hebdo);
  const cibles = [V && L ? V : null, R, R2].filter(Boolean);
  if (!cibles.length) return off('no rewards contract is named: nothing is closed');
  if (!cle) return off('no keeper key is set: the server closes nothing (anyone may close from the app)');
  if (!adr(keeperAttendu)) return off('no gas-only keeper address is named: nothing is closed');
  if (typeof rpc !== 'function') return off('no RPC reader');
  let moi;
  try { moi = bas(adresseDe(cle)); } catch (_) { return off('the keeper key is malformed (its value is never shown)'); }
  if (moi !== adr(keeperAttendu)) return off('the keeper key is not the gas-only keeper ' + adr(keeperAttendu) + ': nothing is closed');
  const envoi = typeof rpcEnvoi === 'function' ? rpcEnvoi : rpc;
  const chainId = Number(chaine);
  const st = { etat: 'ON', adresse: moi, cibles, chaineVue: false, enVol: null, echecsSuite: 0, arret: null, graceR2: null,
    compteurs: { tours: 0, envois: 0, inclus: 0, reverts: 0, refusSimulation: 0, lecturesRatees: 0, envoisRefuses: 0, nonInclus: 0 }, dernier: null, attente: {}, erreurs: [] };
  let minuteur = null, enCours = false;
  const erreur = (t) => { st.erreurs.push({ a: new Date(maintenant()).toISOString(), t }); if (st.erreurs.length > 20) st.erreurs.shift(); journal('[close-keeper] ' + t); };
  const echec = (t) => { st.echecsSuite += 1; erreur(t); if (st.echecsSuite >= bornes.echecsMax) { st.etat = 'ARRETE'; st.arret = { a: new Date(maintenant()).toISOString(), pourquoi: st.echecsSuite + ' failures in a row: stopped until a restart' }; erreur(st.arret.pourquoi); } };
  const lit = async (to, sig, args = '') => { const r = mot(await rpc('eth_call', [{ to, data: selecteur(sig) + args }, 'latest'])); if (r === null) throw new Error(sig + ' not read'); return r; };

  /* the candidates, in order: V, then R, then R2 */
  async function candidats(ts) {
    const out = [];
    if (V && L) {
      const cur = await lit(L, 'currentEpoch()');
      const semaines = [];
      for (let e = cur > bornes.regardV ? cur - bornes.regardV : 0n; e < cur; e++) {
        const brut = await rpc('eth_call', [{ to: V, data: selecteur('epochs(uint256)') + u(e) }, 'latest']);
        const ferme = mot(brut, 3); if (ferme === null) throw new Error('V.epochs not read');
        semaines.push({ e, ferme: ferme === 1n, fin: await lit(L, 'epochEnd(uint256)', u(e)) });
      }
      const d = deciderV({ semaines, maintenantS: ts, margeS: bornes.margeS });
      st.attente.vault = d.pourquoi || ('week ' + d.periode);
      if (d.appeler) out.push({ cible: V, nom: 'holders vault week', e: d.periode });
    }
    for (const [cible, nom, grace] of [[R, 'monthly lock rewards month', 0n], [R2, 'weekly lock rewards week', null]]) {
      if (!cible) continue;
      let g = grace;
      if (g === null) { if (st.graceR2 === null) st.graceR2 = await lit(cible, 'MARK_GRACE()'); g = st.graceR2; }
      const [p, c] = [await lit(cible, 'nextEpochToClose()'), await lit(cible, 'currentEpoch()')];
      const d = deciderEnOrdre({ prochain: p, courant: c, fin: await lit(cible, 'epochEnd(uint256)', u(p)), graceS: g, maintenantS: ts, margeS: bornes.margeS });
      st.attente[cible === R ? 'mensuel' : 'hebdo'] = d.pourquoi || (nom + ' ' + d.periode);
      if (d.appeler) out.push({ cible, nom, e: d.periode });
    }
    return out;
  }

  async function suivre() {
    const v = st.enVol;
    const recu = await rpc('eth_getTransactionReceipt', [v.hash]).catch(() => null);
    if (!recu) { if (maintenant() - v.a > bornes.inclusionMaxMs) { st.enVol = null; st.compteurs.nonInclus += 1; echec('closeEpoch tx ' + v.hash + ' not included after ' + bornes.inclusionMaxMs + ' ms'); } return; }
    st.enVol = null;
    if (String(recu.status) === '0x1') { st.compteurs.inclus += 1; st.echecsSuite = 0; st.dernier = { a: new Date(maintenant()).toISOString(), hash: v.hash, quoi: v.quoi }; journal('[close-keeper] closed ' + v.quoi + ', tx ' + v.hash); }
    else { st.compteurs.reverts += 1; echec('closeEpoch tx ' + v.hash + ' reverted on chain (' + v.quoi + ')'); }
  }

  async function tour() {
    if (st.etat !== 'ON') return { fait: false, pourquoi: st.arret ? st.arret.pourquoi : st.etat };
    if (enCours) return { fait: false, pourquoi: 'a round is running' };
    enCours = true; st.compteurs.tours += 1;
    try {
      if (!st.chaineVue) {
        const id = await rpc('eth_chainId', []);
        if (BigInt(id) !== BigInt(chainId)) { st.etat = 'ARRETE'; st.arret = { a: new Date(maintenant()).toISOString(), pourquoi: 'the node serves chain ' + BigInt(id) + ', expected ' + chainId + ': stopped' }; erreur(st.arret.pourquoi); return { fait: false, pourquoi: st.arret.pourquoi }; }
        st.chaineVue = true;
      }
      if (st.enVol) { await suivre(); if (st.enVol || st.etat !== 'ON') return { fait: false, pourquoi: st.enVol ? 'waiting for the transaction in flight' : st.etat }; }
      const bloc = await rpc('eth_getBlockByNumber', ['latest', false]);
      const ts = bloc && bloc.timestamp ? BigInt(bloc.timestamp) : null, base = bloc && bloc.baseFeePerGas ? BigInt(bloc.baseFeePerGas) : null;
      if (ts === null || base === null) { st.compteurs.lecturesRatees += 1; erreur('head not read'); return { fait: false, pourquoi: 'head not read' }; }
      let liste;
      try { liste = await candidats(ts); } catch (e) { st.compteurs.lecturesRatees += 1; erreur('periods not read: ' + msg(e)); return { fait: false, pourquoi: 'periods not read' }; }
      for (const k of liste) {
        const data = donneesClose(k.e);
        let estime;
        try { await rpc('eth_call', [{ from: moi, to: k.cible, data }, 'latest']); estime = BigInt(await rpc('eth_estimateGas', [{ from: moi, to: k.cible, data }])); }
        catch (e) { st.compteurs.refusSimulation += 1; st.attente[k.nom] = 'simulation refused: ' + msg(e).slice(0, 80); continue; }
        let prio = 0n;
        try { prio = BigInt(await rpc('eth_maxPriorityFeePerGas', [])); } catch (_) { prio = 0n; }
        if (prio > BigInt(bornes.prioWeiMax)) prio = BigInt(bornes.prioWeiMax);
        if (base + prio > BigInt(bornes.maxFeeWei)) return { fait: false, pourquoi: 'gas price above the cap' };
        const maxFee = 2n * base + prio > BigInt(bornes.maxFeeWei) ? BigInt(bornes.maxFeeWei) : 2n * base + prio;
        const gas = (estime * 12n) / 10n;
        const quoi = k.nom + ' ' + k.e;
        return await exclusif(async () => {
          const nonce = BigInt(await rpc('eth_getTransactionCount', [moi, 'pending']));
          const tx = { chainId, nonce, maxPriorityFeePerGas: prio, maxFeePerGas: maxFee, gas, to: k.cible, value: 0n, data };
          verifierEnvoi(tx, { cibles, chainId, bornes });
          const signe = signerEip1559(tx, cle);
          if (bas(signe.de) !== moi) throw new Error('close keeper: the signature does not recover the keeper address');
          try { await envoi('eth_sendRawTransaction', [signe.brut]); }
          catch (e) { if (!/already known|known transaction/i.test(msg(e))) { st.compteurs.envoisRefuses += 1; echec('send refused: ' + msg(e)); return { fait: false, pourquoi: 'send refused' }; } }
          st.enVol = { hash: signe.hash, quoi, a: maintenant() };
          st.compteurs.envois += 1;
          return { fait: true, hash: signe.hash, quoi };
        });
      }
      return { fait: false, pourquoi: 'nothing to close' };
    } catch (e) { erreur('round failed: ' + msg(e)); return { fait: false, pourquoi: 'round failed' }; }
    finally { enCours = false; }
  }

  return {
    /** the state the server may publish (/sante): never the key */
    etat: () => ({ etat: st.etat, adresse: st.adresse, cibles: st.cibles.slice(), enVol: st.enVol ? { ...st.enVol } : null, echecsSuite: st.echecsSuite,
      arret: st.arret, compteurs: { ...st.compteurs }, attente: { ...st.attente }, dernier: st.dernier ? { ...st.dernier } : null, erreurs: st.erreurs.slice() }),
    tour,
    demarrer() {
      const boucle = async () => { await tour(); if (st.etat === 'ON') { minuteur = setTimeout(boucle, bornes.intervalleMs); minuteur.unref?.(); } };
      minuteur = setTimeout(boucle, 30000); minuteur.unref?.();
      return true;
    },
    arreter() { clearTimeout(minuteur); minuteur = null; },
  };
}
