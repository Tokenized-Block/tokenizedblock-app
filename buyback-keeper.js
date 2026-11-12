/* buyback-keeper.js -- the server keeper of the TBLOCK buyback that pays the holders vault (Phil 2026-11-09: "a keeper that only CALLS the
 *   public trigger, from a gas-only key whose secret Phil sets in the server env").
 * WHAT IT DOES, AND NOTHING ELSE:
 *   - WITHOUT an address in tblock-buyback-vault-deploiement.js: nothing (OFF, and why). Nothing changes until the deploy is noted.
 *   - WITHOUT BUYBACK_KEEPER_KEY, or with a key whose address is not the buyback's KEEPER in the record: nothing (OFF, and why; the key
 *     value is never shown, logged or returned).
 *   - WITH both: every `intervalleMs` it reads, for each buyback in order (the new one first, then the earlier one recorded in
 *     economie-deploiement.js while it still holds at least MIN_SPEND):
 *       ETH balance, armed(), readyAt(), MIN_SPEND(), MAX_PER_CALL(), KEEPER(), the head block's timestamp;
 *     decides (decider(), pure) whether this key may call now (as the KEEPER: from keeperAt; as anyone else: armed and from publicAt),
 *     amount = min(balance, MAX_PER_CALL) and >= MIN_SPEND; SIMULATES buyback(amount) by eth_call from the key's address; sends ONE
 *     transaction per round at most, only if the simulation passes.
 *   - A simulation refused by the contract's own guards (PriceOffTwap, ImpactTooHigh, OutputTooLow, TooEarly, NotArmed, BadAmount) means
 *     "retry later": counted apart, never a failure (the fork test met PriceOffTwap after a fast market move: the guard fails closed).
 *   - The earlier buyback is called only while its balance is >= MIN_SPEND; once it is lower it is never called again (until a restart).
 *   - ONLY EVER: buyback(uint256) to one of those two addresses, value 0, the record's chain, gas <= gasMaxParTx, fee <= maxFeeWei;
 *     verifierEnvoi() throws BEFORE the signature otherwise. It never sends ETH, never calls proposeDest / cancelDest / executeDest /
 *     renounceDoor / sweepToDest / arm, never signs anything else.
 *   - STOP after `echecsMax` failures in a row (a mined revert, a send refused, a tx never included), until a restart. */
import { selecteur } from './keccak.js';
import { adresseDe } from './signeur-secp256k1.js';
import { signerEip1559 } from './tx-eip1559.js';

export const SEL_BUYBACK = selecteur('buyback(uint256)').toLowerCase();
export const GARDES = Object.freeze(['PriceOffTwap(int24,int24)', 'ImpactTooHigh(int24,int24)', 'OutputTooLow(uint256,uint256)', 'TooEarly(uint256)', 'NotArmed()', 'BadAmount()']);
export const SEL_GARDES = Object.freeze(Object.fromEntries(GARDES.map((g) => [selecteur(g).toLowerCase(), g.split('(')[0]])));
export const BORNES_DEFAUT = Object.freeze({ intervalleMs: 60000, gasMaxParTx: 1500000n, maxFeeWei: 2000000000n, prioWeiMax: 1000000n, echecsMax: 3, inclusionMaxMs: 120000 });

const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x == null ? '' : x).toLowerCase();
const adr = (x) => (ADR.test(bas(x)) ? bas(x) : null);
const u = (n) => BigInt(n).toString(16).padStart(64, '0');
const mot = (h, i = 0) => { const m = String(h || '').replace(/^0x/, '').slice(64 * i, 64 * (i + 1)); return m.length === 64 ? BigInt('0x' + m) : null; };
const msg = (e) => String((e && e.message) || e).slice(0, 240);
export const donneesBuyback = (montant) => SEL_BUYBACK + u(montant);

/** the guard a revert names, or null (data hex or a node message holding it) */
export function gardeDuRevert(e) {
  const d = String((e && (e.data && (e.data.data || e.data))) || '') + ' ' + msg(e);
  const m = d.toLowerCase().match(/0x[0-9a-f]{8}/g) || [];
  for (const s of m) if (SEL_GARDES[s]) return SEL_GARDES[s];
  for (const g of Object.values(SEL_GARDES)) if (d.includes(g)) return g;
  return null;
}

/**
 * Pure: may this key call buyback now, and with how much? l = { solde, armed, keeperAt, publicAt, minSpend, maxPerCall, keeper }
 * (bigints / booleans / address), moi = the key's address, maintenant = the head block's timestamp (s).
 * { appeler: true, montant, comme: 'keeper' | 'public' } | { appeler: false, pourquoi, epuise? }
 */
export function decider(l, moi, maintenant) {
  if (l.solde < l.minSpend) return { appeler: false, epuise: true, pourquoi: 'balance ' + l.solde + ' wei is below MIN_SPEND ' + l.minSpend };
  const estKeeper = adr(l.keeper) !== null && adr(l.keeper) === adr(moi) && BigInt(l.keeper) !== 0n;
  const t = BigInt(maintenant);
  if (estKeeper) { if (t < l.keeperAt) return { appeler: false, pourquoi: 'keeper may call at ' + l.keeperAt }; }
  else {
    if (!l.armed) return { appeler: false, pourquoi: 'not armed: only its keeper may call' };
    if (t < l.publicAt) return { appeler: false, pourquoi: 'anyone may call at ' + l.publicAt };
  }
  const montant = l.solde < l.maxPerCall ? l.solde : l.maxPerCall;
  return { appeler: true, montant, comme: estKeeper ? 'keeper' : 'public' };
}

/** throws BEFORE any signature unless tx is exactly an admitted buyback call */
export function verifierEnvoi(tx, { cibles, chainId, bornes = BORNES_DEFAUT, maxParCible = {} }) {
  const to = bas(tx.to);
  if (!cibles.includes(to)) throw new Error('keeper: destination not one of the buybacks');
  if (BigInt(tx.value || 0) !== 0n) throw new Error('keeper: value must be 0');
  if (BigInt(tx.chainId) !== BigInt(chainId)) throw new Error('keeper: wrong chain');
  const d = bas(tx.data);
  if (!d.startsWith(SEL_BUYBACK) || d.length !== 10 + 64) throw new Error('keeper: only buyback(uint256) is ever sent');
  const montant = BigInt('0x' + d.slice(10));
  if (maxParCible[to] !== undefined && montant > BigInt(maxParCible[to])) throw new Error('keeper: amount above MAX_PER_CALL');
  if (BigInt(tx.gas) > BigInt(bornes.gasMaxParTx)) throw new Error('keeper: gas above the cap');
  if (BigInt(tx.maxFeePerGas) > BigInt(bornes.maxFeeWei)) throw new Error('keeper: fee above the cap');
  return true;
}

/**
 * rec = BUYBACK_VAULT_DEPLOIEMENT (its adresse, parametres.keeper, chaine); ancien = the earlier buyback's address (or null);
 * cle = the key (from process.env only); rpc(method, params) reads; rpcEnvoi sends (default rpc).
 */
export function creerKeeperBuyback({ cle = null, rec = null, ancien = null, rpc = null, rpcEnvoi = null, journal = () => {}, bornes: bIn = {},
  maintenant = () => Date.now(), desactive = null } = {}) {
  const bornes = { ...BORNES_DEFAUT, ...bIn };
  const off = (pourquoi) => ({ etat: () => ({ etat: 'OFF', pourquoi, adresse: null }), tour: async () => ({ fait: false, pourquoi }), demarrer: () => false, arreter: () => {} });
  if (desactive) return off(String(desactive));
  const nouveau = rec ? adr(rec.adresse) : null;
  if (!nouveau) return off('the TBLOCK buyback that pays the holders vault has no address in its record yet: nothing is called');
  if (!cle) return off('BUYBACK_KEEPER_KEY is not set: the server calls no buyback (anyone may call it after its public delay)');
  if (typeof rpc !== 'function') return off('no RPC reader');
  let moi;
  try { moi = bas(adresseDe(cle)); } catch (_) { return off('BUYBACK_KEEPER_KEY is malformed (its value is never shown)'); }
  if (moi !== adr(rec.parametres && rec.parametres.keeper)) return off('BUYBACK_KEEPER_KEY is not the buyback keeper named in its record (' + (rec.parametres && rec.parametres.keeper) + '): the key set is the key of ' + moi + ' (an address, never the key): nothing is called');
  const envoi = typeof rpcEnvoi === 'function' ? rpcEnvoi : rpc;
  const chainId = Number(rec.chaine);
  const cibles = [nouveau, ...(adr(ancien) && adr(ancien) !== nouveau ? [adr(ancien)] : [])];
  const st = { etat: 'ON', adresse: moi, chaineVue: false, enVol: null, echecsSuite: 0, arret: null, epuises: new Set(), fixes: {},
    compteurs: { tours: 0, envois: 0, inclus: 0, reverts: 0, gardes: 0, simulationsNonLues: 0, envoisRefuses: 0, nonInclus: 0 }, dernier: {}, erreurs: [] };
  let minuteur = null, enCours = false;
  const erreur = (t) => { st.erreurs.push({ a: new Date(maintenant()).toISOString(), t }); if (st.erreurs.length > 20) st.erreurs.shift(); journal('[buyback-keeper] ' + t); };
  const echec = (t) => { st.echecsSuite += 1; erreur(t); if (st.echecsSuite >= bornes.echecsMax) { st.etat = 'ARRETE'; st.arret = { a: new Date(maintenant()).toISOString(), pourquoi: st.echecsSuite + ' failures in a row: stopped until a restart' }; erreur(st.arret.pourquoi); } };
  const appel = async (to, sig, de) => rpc('eth_call', [{ to, data: selecteur(sig), ...(de ? { from: de } : {}) }, 'latest']);

  async function lireCible(c) {
    if (!st.fixes[c]) {
      const [minSpend, maxPerCall, keeper] = [mot(await appel(c, 'MIN_SPEND()')), mot(await appel(c, 'MAX_PER_CALL()')), mot(await appel(c, 'KEEPER()'))];
      if (minSpend === null || maxPerCall === null || keeper === null) throw new Error('constants not read');
      st.fixes[c] = { minSpend, maxPerCall, keeper: '0x' + keeper.toString(16).padStart(40, '0') };
    }
    const solde = BigInt(await rpc('eth_getBalance', [c, 'latest']));
    const armed = mot(await appel(c, 'armed()'));
    const r = await appel(c, 'readyAt()');
    const keeperAt = mot(r, 0), publicAt = mot(r, 1);
    if (armed === null || keeperAt === null || publicAt === null) throw new Error('state not read');
    return { solde, armed: armed === 1n, keeperAt, publicAt, ...st.fixes[c] };
  }

  async function suivre() {
    const v = st.enVol;
    const recu = await rpc('eth_getTransactionReceipt', [v.hash]).catch(() => null);
    if (!recu) { if (maintenant() - v.a > bornes.inclusionMaxMs) { st.enVol = null; st.compteurs.nonInclus += 1; echec('buyback tx ' + v.hash + ' not included after ' + bornes.inclusionMaxMs + ' ms'); } return false; }
    st.enVol = null;
    if (String(recu.status) === '0x1') { st.compteurs.inclus += 1; st.echecsSuite = 0; st.dernier[v.to] = { a: new Date(maintenant()).toISOString(), hash: v.hash, montant: v.montant }; journal('[buyback-keeper] bought with ' + v.montant + ' wei on ' + v.to + ' tx ' + v.hash); }
    else { st.compteurs.reverts += 1; echec('buyback tx ' + v.hash + ' reverted on chain'); }
    return true;
  }

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
      const bloc = await rpc('eth_getBlockByNumber', ['latest', false]);
      const ts = bloc && bloc.timestamp ? BigInt(bloc.timestamp) : null, base = bloc && bloc.baseFeePerGas ? BigInt(bloc.baseFeePerGas) : null;
      if (ts === null || base === null) { erreur('head not read'); return { fait: false, pourquoi: 'head not read' }; }
      const raisons = [];
      for (const c of cibles) {
        if (st.epuises.has(c)) continue;
        let l;
        try { l = await lireCible(c); } catch (e) { st.compteurs.simulationsNonLues += 1; erreur(c + ' not read: ' + msg(e)); raisons.push(c + ': not read'); continue; }
        const d = decider(l, moi, ts);
        if (!d.appeler) {
          if (d.epuise && c !== nouveau) { st.epuises.add(c); journal('[buyback-keeper] the earlier buyback ' + c + ' holds less than MIN_SPEND: no longer called'); }
          raisons.push(c + ': ' + d.pourquoi); continue;
        }
        const data = donneesBuyback(d.montant);
        let estime;
        try { await rpc('eth_call', [{ from: moi, to: c, data }, 'latest']); estime = BigInt(await rpc('eth_estimateGas', [{ from: moi, to: c, data }])); }
        catch (e) {
          const g = gardeDuRevert(e);
          if (g) { st.compteurs.gardes += 1; raisons.push(c + ': refused by its guard ' + g + ' (retry later)'); continue; }
          st.compteurs.simulationsNonLues += 1; erreur(c + ': simulation not run: ' + msg(e)); raisons.push(c + ': simulation not run'); continue;
        }
        let prio = 0n;
        try { prio = BigInt(await rpc('eth_maxPriorityFeePerGas', [])); } catch (_) { prio = 0n; }
        if (prio > BigInt(bornes.prioWeiMax)) prio = BigInt(bornes.prioWeiMax);
        if (base + prio > BigInt(bornes.maxFeeWei)) return { fait: false, pourquoi: 'gas price above the cap' };
        const maxFee = 2n * base + prio > BigInt(bornes.maxFeeWei) ? BigInt(bornes.maxFeeWei) : 2n * base + prio;
        const gas = (estime * 12n) / 10n;
        const nonce = BigInt(await rpc('eth_getTransactionCount', [moi, 'pending']));
        const tx = { chainId, nonce, maxPriorityFeePerGas: prio, maxFeePerGas: maxFee, gas, to: c, value: 0n, data };
        verifierEnvoi(tx, { cibles, chainId, bornes, maxParCible: Object.fromEntries(Object.entries(st.fixes).map(([k, v]) => [k, v.maxPerCall])) });
        const signe = signerEip1559(tx, cle);
        if (bas(signe.de) !== moi) throw new Error('keeper: the signature does not recover the keeper address');
        try { await envoi('eth_sendRawTransaction', [signe.brut]); }
        catch (e) {
          if (!/already known|known transaction|nonce too low/i.test(msg(e))) { st.compteurs.envoisRefuses += 1; echec('send refused: ' + msg(e)); return { fait: false, pourquoi: 'send refused' }; }
        }
        st.enVol = { hash: signe.hash, to: c, montant: d.montant.toString(), a: maintenant() };
        st.compteurs.envois += 1;
        return { fait: true, hash: signe.hash, to: c, montant: d.montant, comme: d.comme };
      }
      return { fait: false, pourquoi: raisons.join(' | ') || 'nothing to call' };
    } catch (e) { erreur('round failed: ' + msg(e)); return { fait: false, pourquoi: 'round failed' }; }
    finally { enCours = false; }
  }

  return {
    /** the state the server may publish (/sante): never the key */
    etat: () => ({ etat: st.etat, adresse: st.adresse, cibles: cibles.slice(), epuises: [...st.epuises], enVol: st.enVol ? { ...st.enVol } : null,
      echecsSuite: st.echecsSuite, arret: st.arret, compteurs: { ...st.compteurs }, dernier: { ...st.dernier }, erreurs: st.erreurs.slice() }),
    tour,
    demarrer() {
      const boucle = async () => { await tour(); if (st.etat === 'ON') { minuteur = setTimeout(boucle, bornes.intervalleMs); minuteur.unref?.(); } };
      minuteur = setTimeout(boucle, 5000); minuteur.unref?.();
      return true;
    },
    arreter() { clearTimeout(minuteur); minuteur = null; },
  };
}
