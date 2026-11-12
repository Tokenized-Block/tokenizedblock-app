/* spin-dev-keeper.js -- the server keeper of the Spin's dev share (Phil 2026-11-12: the Spin's dev share goes through the TBLOCK payment
 *   router, TBLOCK -> holders vault). payDev(amount, minTblockOut, deadline) on the Spin is PUBLIC: anyone may call it; without a caller the
 *   dev share only piles up in the contract (devOwed) and buys nothing. This keeper is that caller, and nothing else.
 * WHAT IT DOES, AND NOTHING ELSE:
 *   - WITHOUT a Spin address in skins-spin-deploiement.js: nothing (OFF, and why).
 *   - WITHOUT a key, or with a key whose address is not the gas-only keeper named by the caller (the buyback keeper of its record): nothing
 *     (OFF, and why; the key value is never shown, logged or returned).
 *   - WITH both: every `intervalleMs` it reads devOwed(), MIN_DEV_BATCH(), MAX_DEV_BATCH(), ROUTER(); decides (decider(), pure) a batch
 *     amount = min(devOwed, MAX_DEV_BATCH) when it is >= MIN_DEV_BATCH; quotes it by eth_call of payDev(amount, floor, deadline) from the
 *     key's address (floor = the router's minOutFloor of the swapped part, the least pay() accepts); sets minTblockOut = the quote less
 *     `glissementBps` (default 1 %), never under the floor (the app's own rule for router payments); SIMULATES payDev with that
 *     minTblockOut; sends ONE transaction per round at most, only if the simulation passes.
 *   - A simulation refused by the router's or the Spin's own guards (price, impact, floor, output, batch size) means "retry later":
 *     counted apart, never a failure.
 *   - ONLY EVER: payDev(uint256,uint256,uint256) to the recorded Spin, value 0, the record's chain, amount <= MAX_DEV_BATCH, gas <=
 *     gasMaxParTx, fee <= maxFeeWei; verifierEnvoi() throws BEFORE the signature otherwise. It never sends ETH or a token, never calls
 *     spin / settle / fund / anything else, never signs anything else.
 *   - The same gas-only key also runs the buyback keeper: every send goes through `exclusif` (one shared lock) so the two never take the
 *     same nonce.
 *   - STOP after `echecsMax` failures in a row (a mined revert, a send refused, a tx never included), until a restart. */
import { selecteur } from './keccak.js';
import { adresseDe } from './signeur-secp256k1.js';
import { signerEip1559 } from './tx-eip1559.js';

export const SEL_PAYDEV = selecteur('payDev(uint256,uint256,uint256)').toLowerCase();
export const GARDES = Object.freeze([
  'BatchTooSmall()', 'BatchTooLarge()', 'MinOutTooLow(uint256,uint256)', 'BelowFloor(uint256,uint256)', 'InsufficientOutput(uint256,uint256)',
  'V4ImpactTooHigh(int24,int24)', 'AeroImpactTooHigh(uint256,uint256)', 'AeroFeeTooHigh(uint256)', 'Expired()', 'AmountTooLarge()',
]);
export const SEL_GARDES = Object.freeze(Object.fromEntries(GARDES.map((g) => [selecteur(g).toLowerCase(), g.split('(')[0]])));
export const BORNES_DEFAUT = Object.freeze({ intervalleMs: 300000, gasMaxParTx: 1500000n, maxFeeWei: 2000000000n, prioWeiMax: 1000000n,
  echecsMax: 3, inclusionMaxMs: 120000, glissementBps: 100n, delaiS: 300n });

const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x == null ? '' : x).toLowerCase();
const adr = (x) => (ADR.test(bas(x)) ? bas(x) : null);
const u = (n) => BigInt(n).toString(16).padStart(64, '0');
const mot = (h, i = 0) => { const m = String(h || '').replace(/^0x/, '').slice(64 * i, 64 * (i + 1)); return m.length === 64 ? BigInt('0x' + m) : null; };
const msg = (e) => String((e && e.message) || e).slice(0, 240);
export const donneesPayDev = (montant, minOut, deadline) => SEL_PAYDEV + u(montant) + u(minOut) + u(deadline);

/** the guard a revert names, or null (data hex or a node message holding it) */
export function gardeDuRevert(e) {
  const d = String((e && (e.data && (e.data.data || e.data))) || '') + ' ' + msg(e);
  const m = d.toLowerCase().match(/0x[0-9a-f]{8}/g) || [];
  for (const s of m) if (SEL_GARDES[s]) return SEL_GARDES[s];
  for (const g of Object.values(SEL_GARDES)) if (d.includes(g)) return g;
  return null;
}

/** Pure: is there a batch to pay now? l = { devOwed, minBatch, maxBatch } (bigints). { appeler: true, montant } | { appeler: false, pourquoi } */
export function decider(l) {
  if (l.minBatch <= 0n || l.maxBatch < l.minBatch) return { appeler: false, pourquoi: 'batch bounds not sane: ' + l.minBatch + ' .. ' + l.maxBatch };
  if (l.devOwed < l.minBatch) return { appeler: false, pourquoi: 'devOwed ' + l.devOwed + ' is below MIN_DEV_BATCH ' + l.minBatch };
  return { appeler: true, montant: l.devOwed < l.maxBatch ? l.devOwed : l.maxBatch };
}

/** Pure: minTblockOut from a fresh quote: quote less glissementBps, never under the router's floor (> 0) */
export function minimumSorti(devis, plancher, glissementBps) {
  const q = BigInt(devis), f = BigInt(plancher), g = BigInt(glissementBps);
  if (q <= 0n || f <= 0n || g < 0n || g >= 10000n) return null;
  const m = (q * (10000n - g)) / 10000n;
  return m > f ? m : f;
}

/** throws BEFORE any signature unless tx is exactly an admitted payDev call */
export function verifierEnvoi(tx, { cible, chainId, bornes = BORNES_DEFAUT, maxBatch }) {
  if (bas(tx.to) !== bas(cible) || !adr(cible)) throw new Error('spin keeper: destination is not the Spin');
  if (BigInt(tx.value || 0) !== 0n) throw new Error('spin keeper: value must be 0');
  if (BigInt(tx.chainId) !== BigInt(chainId)) throw new Error('spin keeper: wrong chain');
  const d = bas(tx.data);
  if (!d.startsWith(SEL_PAYDEV) || d.length !== 10 + 64 * 3) throw new Error('spin keeper: only payDev(uint256,uint256,uint256) is ever sent');
  const montant = BigInt('0x' + d.slice(10, 74));
  if (maxBatch === undefined || montant > BigInt(maxBatch)) throw new Error('spin keeper: amount above MAX_DEV_BATCH');
  if (BigInt('0x' + d.slice(74, 138)) === 0n) throw new Error('spin keeper: minTblockOut must be > 0');
  if (BigInt(tx.gas) > BigInt(bornes.gasMaxParTx)) throw new Error('spin keeper: gas above the cap');
  if (BigInt(tx.maxFeePerGas) > BigInt(bornes.maxFeeWei)) throw new Error('spin keeper: fee above the cap');
  return true;
}

/**
 * spin = the recorded Spin's address (or null); chaine = its chain id; keeperAttendu = the only address this keeper may run as
 * (the gas-only buyback keeper); cle = the key (from process.env only); rpc(method, params) reads; rpcEnvoi sends (default rpc);
 * exclusif(fn) = the lock shared with the other keeper on the same key (default: none).
 */
export function creerKeeperSpinDev({ cle = null, spin = null, chaine = null, keeperAttendu = null, rpc = null, rpcEnvoi = null, journal = () => {},
  bornes: bIn = {}, maintenant = () => Date.now(), exclusif = (fn) => fn(), desactive = null } = {}) {
  const bornes = { ...BORNES_DEFAUT, ...bIn };
  const off = (pourquoi) => ({ etat: () => ({ etat: 'OFF', pourquoi, adresse: null }), tour: async () => ({ fait: false, pourquoi }), demarrer: () => false, arreter: () => {} });
  if (desactive) return off(String(desactive));
  const cible = adr(spin);
  if (!cible) return off('the Spin has no address in its record yet: nothing is called');
  if (!cle) return off('no keeper key is set: the server pays no dev batch (anyone may call payDev)');
  if (!adr(keeperAttendu)) return off('no gas-only keeper address is named: nothing is called');
  if (typeof rpc !== 'function') return off('no RPC reader');
  let moi;
  try { moi = bas(adresseDe(cle)); } catch (_) { return off('the keeper key is malformed (its value is never shown)'); }
  if (moi !== adr(keeperAttendu)) return off('the keeper key is not the gas-only keeper ' + adr(keeperAttendu) + ': the key set is the key of ' + moi + ' (an address, never the key): nothing is called');
  const envoi = typeof rpcEnvoi === 'function' ? rpcEnvoi : rpc;
  const chainId = Number(chaine);
  const st = { etat: 'ON', adresse: moi, cible, chaineVue: false, enVol: null, echecsSuite: 0, arret: null, fixes: null,
    compteurs: { tours: 0, envois: 0, inclus: 0, reverts: 0, gardes: 0, simulationsNonLues: 0, envoisRefuses: 0, nonInclus: 0 }, dernier: null, erreurs: [] };
  let minuteur = null, enCours = false;
  const erreur = (t) => { st.erreurs.push({ a: new Date(maintenant()).toISOString(), t }); if (st.erreurs.length > 20) st.erreurs.shift(); journal('[spin-dev-keeper] ' + t); };
  const echec = (t) => { st.echecsSuite += 1; erreur(t); if (st.echecsSuite >= bornes.echecsMax) { st.etat = 'ARRETE'; st.arret = { a: new Date(maintenant()).toISOString(), pourquoi: st.echecsSuite + ' failures in a row: stopped until a restart' }; erreur(st.arret.pourquoi); } };
  const appel = async (to, data, de) => rpc('eth_call', [{ to, data, ...(de ? { from: de } : {}) }, 'latest']);

  async function lire() {
    if (!st.fixes) {
      const minBatch = mot(await appel(cible, selecteur('MIN_DEV_BATCH()'))), maxBatch = mot(await appel(cible, selecteur('MAX_DEV_BATCH()')));
      const r = mot(await appel(cible, selecteur('ROUTER()'))), bps = mot(await appel(cible, selecteur('USDC_SPLIT()')), 1);
      if (minBatch === null || maxBatch === null || r === null || bps === null) throw new Error('constants not read');
      st.fixes = { minBatch, maxBatch, router: '0x' + r.toString(16).padStart(40, '0'), devBps: bps };
    }
    const devOwed = mot(await appel(cible, selecteur('devOwed()')));
    if (devOwed === null) throw new Error('devOwed not read');
    return { devOwed, ...st.fixes };
  }

  async function suivre() {
    const v = st.enVol;
    const recu = await rpc('eth_getTransactionReceipt', [v.hash]).catch(() => null);
    if (!recu) { if (maintenant() - v.a > bornes.inclusionMaxMs) { st.enVol = null; st.compteurs.nonInclus += 1; echec('payDev tx ' + v.hash + ' not included after ' + bornes.inclusionMaxMs + ' ms'); } return false; }
    st.enVol = null;
    if (String(recu.status) === '0x1') { st.compteurs.inclus += 1; st.echecsSuite = 0; st.dernier = { a: new Date(maintenant()).toISOString(), hash: v.hash, montant: v.montant }; journal('[spin-dev-keeper] paid a dev batch of ' + v.montant + ' USDC raw, tx ' + v.hash); }
    else { st.compteurs.reverts += 1; echec('payDev tx ' + v.hash + ' reverted on chain'); }
    return true;
  }

  /* a guard refusal is "retry later"; anything else is a simulation not run */
  const garde = (e, quoi) => {
    const g = gardeDuRevert(e);
    if (g) { st.compteurs.gardes += 1; return { fait: false, pourquoi: quoi + ' refused by the guard ' + g + ' (retry later)' }; }
    st.compteurs.simulationsNonLues += 1; erreur(quoi + ' not run: ' + msg(e)); return { fait: false, pourquoi: quoi + ' not run' };
  };

  async function tour() {
    if (st.etat !== 'ON') return { fait: false, pourquoi: st.arret ? st.arret.pourquoi : st.etat };
    if (enCours) return { fait: false, pourquoi: 'a round is running' };
    enCours = true; st.compteurs.tours += 1;
    try {
      if (!st.chaineVue) {
        const id = await rpc('eth_chainId', []);
        if (BigInt(id) !== BigInt(chainId)) { st.etat = 'ARRETE'; st.arret = { a: new Date(maintenant()).toISOString(), pourquoi: 'the node serves chain ' + BigInt(id) + ', the record says ' + chainId + ': stopped' }; erreur(st.arret.pourquoi); return { fait: false, pourquoi: st.arret.pourquoi }; }
        st.chaineVue = true;
      }
      if (st.enVol) { await suivre(); if (st.enVol || st.etat !== 'ON') return { fait: false, pourquoi: st.enVol ? 'waiting for the transaction in flight' : st.etat }; }
      let l;
      try { l = await lire(); } catch (e) { st.compteurs.simulationsNonLues += 1; erreur('Spin not read: ' + msg(e)); return { fait: false, pourquoi: 'Spin not read' }; }
      const d = decider(l);
      if (!d.appeler) return { fait: false, pourquoi: d.pourquoi };
      const bloc = await rpc('eth_getBlockByNumber', ['latest', false]);
      const ts = bloc && bloc.timestamp ? BigInt(bloc.timestamp) : null, base = bloc && bloc.baseFeePerGas ? BigInt(bloc.baseFeePerGas) : null;
      if (ts === null || base === null) { erreur('head not read'); return { fait: false, pourquoi: 'head not read' }; }
      const deadline = ts + BigInt(bornes.delaiS);
      /* the floor of the swapped part (the router keeps devBps of the batch in USDC) */
      const plancher = mot(await appel(l.router, selecteur('minOutFloor(uint256)') + u(d.montant - (d.montant * l.devBps) / 10000n)));
      if (plancher === null || plancher === 0n) { st.compteurs.simulationsNonLues += 1; erreur('router floor not read'); return { fait: false, pourquoi: 'router floor not read' }; }
      let devis;
      try { devis = mot(await appel(cible, donneesPayDev(d.montant, plancher, deadline), moi), 1); }
      catch (e) { return garde(e, 'quote'); }
      const minOut = devis === null ? null : minimumSorti(devis, plancher, bornes.glissementBps);
      if (minOut === null) { st.compteurs.simulationsNonLues += 1; erreur('quote not read'); return { fait: false, pourquoi: 'quote not read' }; }
      const data = donneesPayDev(d.montant, minOut, deadline);
      let estime;
      try { await appel(cible, data, moi); estime = BigInt(await rpc('eth_estimateGas', [{ from: moi, to: cible, data }])); }
      catch (e) { return garde(e, 'simulation'); }
      let prio = 0n;
      try { prio = BigInt(await rpc('eth_maxPriorityFeePerGas', [])); } catch (_) { prio = 0n; }
      if (prio > BigInt(bornes.prioWeiMax)) prio = BigInt(bornes.prioWeiMax);
      if (base + prio > BigInt(bornes.maxFeeWei)) return { fait: false, pourquoi: 'gas price above the cap' };
      const maxFee = 2n * base + prio > BigInt(bornes.maxFeeWei) ? BigInt(bornes.maxFeeWei) : 2n * base + prio;
      const gas = (estime * 12n) / 10n;
      return await exclusif(async () => {
        const nonce = BigInt(await rpc('eth_getTransactionCount', [moi, 'pending']));
        const tx = { chainId, nonce, maxPriorityFeePerGas: prio, maxFeePerGas: maxFee, gas, to: cible, value: 0n, data };
        verifierEnvoi(tx, { cible, chainId, bornes, maxBatch: l.maxBatch });
        const signe = signerEip1559(tx, cle);
        if (bas(signe.de) !== moi) throw new Error('spin keeper: the signature does not recover the keeper address');
        try { await envoi('eth_sendRawTransaction', [signe.brut]); }
        catch (e) {
          if (!/already known|known transaction/i.test(msg(e))) { st.compteurs.envoisRefuses += 1; echec('send refused: ' + msg(e)); return { fait: false, pourquoi: 'send refused' }; }
        }
        st.enVol = { hash: signe.hash, montant: d.montant.toString(), minOut: minOut.toString(), a: maintenant() };
        st.compteurs.envois += 1;
        return { fait: true, hash: signe.hash, montant: d.montant, minOut };
      });
    } catch (e) { erreur('round failed: ' + msg(e)); return { fait: false, pourquoi: 'round failed' }; }
    finally { enCours = false; }
  }

  return {
    /** the state the server may publish (/sante): never the key */
    etat: () => ({ etat: st.etat, adresse: st.adresse, cible: st.cible, enVol: st.enVol ? { ...st.enVol } : null, echecsSuite: st.echecsSuite,
      arret: st.arret, compteurs: { ...st.compteurs }, dernier: st.dernier ? { ...st.dernier } : null, erreurs: st.erreurs.slice() }),
    tour,
    demarrer() {
      const boucle = async () => { await tour(); if (st.etat === 'ON') { minuteur = setTimeout(boucle, bornes.intervalleMs); minuteur.unref?.(); } };
      minuteur = setTimeout(boucle, 20000); minuteur.unref?.();
      return true;
    },
    arreter() { clearTimeout(minuteur); minuteur = null; },
  };
}

/** a lock for two keepers sharing one key: runs fn after every earlier fn has settled */
export function creerExclusif() {
  let queue = Promise.resolve();
  return (fn) => { const p = queue.then(fn, fn); queue = p.catch(() => {}); return p; };
}
