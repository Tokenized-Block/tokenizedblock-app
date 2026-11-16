/* hearts-price-keeper.js -- the server keeper that keeps the hearts' TBLOCK price on the MARKET (Phil 2026-11-16: "le prix doit etre a jour,
 *   heart est a 0.5$ usdc of tblock, ca doit suivre le cours ... ca pas de sens de faire une mise a jour manuelle").
 *   BlockLikesV2 stores a price (USD per whole TBLOCK * 1e18) that only its keeper may write, at most once per MIN_INTERVAL and within
 *   +/- MAX_STEP_BPS of the last one, between PRICE_FLOOR and PRICE_CEIL. The contract says the keeper writes "from the app server's read
 *   (the lower of now and ~10 minutes ago)". That keeper was never built: measured 2026-11-16, the stored price was 100 h old and 29 %
 *   above the market (a heart sold for about $0.39 of TBLOCK instead of $0.50). LifeEntry refuses a price older than 6 h.
 * WHAT IT DOES, AND NOTHING ELSE:
 *   - WITHOUT a key, or with a key whose address is not the hearts' keeper(): nothing (OFF, and why; the key value is never shown).
 *   - WITH it: every `intervalleMs` it reads the market (lirePrixE18: a fresh exact quote of $1 USDC -> TBLOCK on the route the pay router
 *     uses) and keeps the reads of the last `fenetreS`; the price it would write is the LOWEST of them (a price pushed up for one block
 *     does not reach the contract; a lower price only makes a heart cost more TBLOCK, never less), moved toward the market by at most
 *     the contract's step, inside its floor and ceiling (decider, pure).
 *   - it writes when MIN_INTERVAL has passed AND (the move is at least `seuilBps` OR the stored price is older than `rafraichirS`, so a
 *     flat market still keeps the price fresh for LifeEntry). It SIMULATES setPrice by eth_call from the key's address first.
 *   - ONLY EVER: setPrice(uint256) to the hearts contract, value 0, the given chain, gas <= gasMaxParTx, fee <= maxFeeWei;
 *     verifierEnvoi() throws BEFORE the signature otherwise. It moves no token: a price is a number.
 *   - The same key runs the other keepers: every send goes through `exclusif` (one shared lock).
 *   - STOP after `echecsMax` failures in a row, until a restart. */
import { selecteur } from './keccak.js';
import { adresseDe } from './signeur-secp256k1.js';
import { signerEip1559 } from './tx-eip1559.js';

export const SEL_SET_PRICE = selecteur('setPrice(uint256)').toLowerCase();
export const BORNES_DEFAUT = Object.freeze({ intervalleMs: 300000, fenetreS: 900, minLectures: 2, seuilBps: 50n, rafraichirS: 3n * 3600n,
  margeIntervalleS: 30n, gasMaxParTx: 200000n, maxFeeWei: 2000000000n, prioWeiMax: 1000000n, echecsMax: 3, inclusionMaxMs: 120000 });
const BPS = 10000n;
const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x == null ? '' : x).toLowerCase();
const adr = (x) => (ADR.test(bas(x)) ? bas(x) : null);
const u = (n) => BigInt(n).toString(16).padStart(64, '0');
const mot = (h) => { const m = String(h || '').replace(/^0x/, '').slice(0, 64); return m.length === 64 ? BigInt('0x' + m) : null; };
const msg = (e) => String((e && e.message) || e).slice(0, 240);
export const donneesSetPrice = (p) => SEL_SET_PRICE + u(p);

/** $1 of USDC bought `devis` raw TBLOCK (18 decimals): the USD price of one whole TBLOCK, 1e18-scaled = 1e36 / devis */
export const prixDepuisDevis = (devis) => { const d = BigInt(devis); if (d <= 0n) throw new Error('empty quote'); return (10n ** 36n) / d; };

/**
 * Pure. lectures = [{ t, p }] (seconds, price e18) read by the server; stocke = { prix, depuis } on chain; contrat = { minInterval, pas, plancher,
 * plafond, gele }. Returns { ecrire: true, prix } or { ecrire: false, pourquoi }.
 */
export function decider({ lectures, stocke, contrat, maintenantS, bornes = BORNES_DEFAUT }) {
  const now = BigInt(maintenantS);
  if (contrat.gele) return { ecrire: false, pourquoi: 'the hearts price is frozen by a dev: only a new keeper unfreezes it' };
  const recentes = (lectures || []).filter((l) => BigInt(l.t) >= now - BigInt(bornes.fenetreS) && BigInt(l.p) > 0n);
  if (recentes.length < bornes.minLectures) return { ecrire: false, pourquoi: 'waiting for ' + bornes.minLectures + ' market reads in ' + bornes.fenetreS + ' s' };
  const debut = recentes.reduce((m, l) => (BigInt(l.t) < m ? BigInt(l.t) : m), now);
  if (now - debut < BigInt(bornes.fenetreS) / 2n) return { ecrire: false, pourquoi: 'the market reads span less than ' + (bornes.fenetreS / 2) + ' s' };
  const marche = recentes.reduce((m, l) => (BigInt(l.p) < m ? BigInt(l.p) : m), BigInt(recentes[0].p)); /* the LOWEST: never a pushed price */
  const old = BigInt(stocke.prix), age = now - BigInt(stocke.depuis);
  if (age < BigInt(contrat.minInterval) + BigInt(bornes.margeIntervalleS)) return { ecrire: false, pourquoi: 'the contract allows one write per ' + contrat.minInterval + ' s' };
  const haut = old * (BPS + BigInt(contrat.pas)) / BPS, basse = old * (BPS - BigInt(contrat.pas)) / BPS;
  let p = marche > haut ? haut : marche < basse ? basse : marche;
  if (p < BigInt(contrat.plancher)) p = BigInt(contrat.plancher);
  if (p > BigInt(contrat.plafond)) p = BigInt(contrat.plafond);
  if (p > haut || p < basse) return { ecrire: false, pourquoi: 'the bounded price is outside one step of the stored one' };
  const ecartBps = old === 0n ? BPS : ((p > old ? p - old : old - p) * BPS) / old;
  if (ecartBps < BigInt(bornes.seuilBps) && age < BigInt(bornes.rafraichirS)) return { ecrire: false, pourquoi: 'the market is within ' + bornes.seuilBps + ' bps and the price is fresh' };
  return { ecrire: true, prix: p, marche, ecartBps };
}

/** throws BEFORE any signature unless tx is exactly setPrice(p) to the hearts contract */
export function verifierEnvoi(tx, { hearts, chainId, bornes = BORNES_DEFAUT }) {
  if (bas(tx.to) !== adr(hearts)) throw new Error('hearts price keeper: destination is not the hearts contract');
  if (BigInt(tx.value || 0) !== 0n) throw new Error('hearts price keeper: value must be 0');
  if (BigInt(tx.chainId) !== BigInt(chainId)) throw new Error('hearts price keeper: wrong chain');
  const d = bas(tx.data);
  if (!d.startsWith(SEL_SET_PRICE) || d.length !== 10 + 64) throw new Error('hearts price keeper: only setPrice(uint256) is ever sent');
  if (BigInt(tx.gas) > BigInt(bornes.gasMaxParTx)) throw new Error('hearts price keeper: gas above the cap');
  if (BigInt(tx.maxFeePerGas) > BigInt(bornes.maxFeeWei)) throw new Error('hearts price keeper: fee above the cap');
  return true;
}

export function creerKeeperPrixHearts({ cle = null, hearts = null, chaine = null, rpc = null, rpcEnvoi = null, lirePrixE18 = null, journal = () => {},
  bornes: bIn = {}, maintenant = () => Date.now(), exclusif = (fn) => fn(), desactive = null } = {}) {
  const bornes = { ...BORNES_DEFAUT, ...bIn };
  const off = (pourquoi) => ({ etat: () => ({ etat: 'OFF', pourquoi, adresse: null }), tour: async () => ({ fait: false, pourquoi }), demarrer: () => false, arreter: () => {} });
  if (desactive) return off(String(desactive));
  const H = adr(hearts);
  if (!H) return off('no hearts contract is named');
  if (!cle) return off('no keeper key is set: the hearts price is not written by the server');
  if (typeof rpc !== 'function' || typeof lirePrixE18 !== 'function') return off('no RPC reader or no market reader');
  let moi;
  try { moi = bas(adresseDe(cle)); } catch (_) { return off('the keeper key is malformed (its value is never shown)'); }
  const envoi = typeof rpcEnvoi === 'function' ? rpcEnvoi : rpc;
  const chainId = Number(chaine);
  const st = { etat: 'ON', adresse: moi, keeperVu: false, chaineVue: false, enVol: null, echecsSuite: 0, arret: null, lectures: [], attente: null,
    compteurs: { tours: 0, lecturesMarche: 0, lecturesMarcheRatees: 0, envois: 0, inclus: 0, reverts: 0, refusSimulation: 0, lecturesRatees: 0, envoisRefuses: 0, nonInclus: 0 },
    dernier: null, stocke: null, erreurs: [] };
  let minuteur = null, enCours = false;
  const erreur = (t) => { st.erreurs.push({ a: new Date(maintenant()).toISOString(), t }); if (st.erreurs.length > 20) st.erreurs.shift(); journal('[hearts-price-keeper] ' + t); };
  const arret = (pourquoi) => { st.etat = 'ARRETE'; st.arret = { a: new Date(maintenant()).toISOString(), pourquoi }; erreur(pourquoi); };
  const echec = (t) => { st.echecsSuite += 1; erreur(t); if (st.echecsSuite >= bornes.echecsMax) arret(st.echecsSuite + ' failures in a row: stopped until a restart'); };
  const lit = async (sig) => { const r = mot(await rpc('eth_call', [{ to: H, data: selecteur(sig) }, 'latest'])); if (r === null) throw new Error(sig + ' not read'); return r; };

  async function suivre() {
    const v = st.enVol;
    const recu = await rpc('eth_getTransactionReceipt', [v.hash]).catch(() => null);
    if (!recu) { if (maintenant() - v.a > bornes.inclusionMaxMs) { st.enVol = null; st.compteurs.nonInclus += 1; echec('setPrice tx ' + v.hash + ' not included after ' + bornes.inclusionMaxMs + ' ms'); } return; }
    st.enVol = null;
    if (String(recu.status) === '0x1') { st.compteurs.inclus += 1; st.echecsSuite = 0; st.dernier = { a: new Date(maintenant()).toISOString(), hash: v.hash, prix: v.prix }; journal('[hearts-price-keeper] price written ' + v.prix + ', tx ' + v.hash); }
    else { st.compteurs.reverts += 1; echec('setPrice tx ' + v.hash + ' reverted on chain'); }
  }

  async function tour() {
    if (st.etat !== 'ON') return { fait: false, pourquoi: st.arret ? st.arret.pourquoi : st.etat };
    if (enCours) return { fait: false, pourquoi: 'a round is running' };
    enCours = true; st.compteurs.tours += 1;
    try {
      if (!st.chaineVue) {
        const id = await rpc('eth_chainId', []);
        if (BigInt(id) !== BigInt(chainId)) { arret('the node serves chain ' + BigInt(id) + ', expected ' + chainId + ': stopped'); return { fait: false, pourquoi: st.arret.pourquoi }; }
        st.chaineVue = true;
      }
      if (!st.keeperVu) {
        /* the key must be the keeper the hearts contract names, read on chain (never typed) */
        const k = await rpc('eth_call', [{ to: H, data: selecteur('keeper()') }, 'latest']);
        const kk = '0x' + String(k || '').replace(/^0x/, '').slice(24, 64).toLowerCase();
        if (kk !== moi) { arret('the keeper key is not the hearts keeper ' + kk + ': nothing is written'); return { fait: false, pourquoi: st.arret.pourquoi }; }
        st.keeperVu = true;
      }
      if (st.enVol) { await suivre(); if (st.enVol || st.etat !== 'ON') return { fait: false, pourquoi: st.enVol ? 'waiting for the transaction in flight' : st.etat }; }
      const bloc = await rpc('eth_getBlockByNumber', ['latest', false]);
      const ts = bloc && bloc.timestamp ? BigInt(bloc.timestamp) : null, base = bloc && bloc.baseFeePerGas ? BigInt(bloc.baseFeePerGas) : null;
      if (ts === null || base === null) { st.compteurs.lecturesRatees += 1; erreur('head not read'); return { fait: false, pourquoi: 'head not read' }; }
      /* one market read per round; a failed read is not a price */
      try { const p = BigInt(await lirePrixE18()); if (p > 0n) { st.lectures.push({ t: ts, p }); st.compteurs.lecturesMarche += 1; } }
      catch (e) { st.compteurs.lecturesMarcheRatees += 1; st.attente = 'market not read: ' + msg(e).slice(0, 80); }
      st.lectures = st.lectures.filter((l) => l.t >= ts - BigInt(bornes.fenetreS) * 2n);
      let contrat, stocke;
      try {
        contrat = { minInterval: await lit('MIN_INTERVAL()'), pas: await lit('MAX_STEP_BPS()'), plancher: await lit('PRICE_FLOOR()'), plafond: await lit('PRICE_CEIL()'), gele: (await lit('frozen()')) === 1n };
        stocke = { prix: await lit('price()'), depuis: await lit('priceSetAt()') };
      } catch (e) { st.compteurs.lecturesRatees += 1; erreur('hearts not read: ' + msg(e)); return { fait: false, pourquoi: 'hearts not read' }; }
      st.stocke = { prix: String(stocke.prix), depuis: Number(stocke.depuis) };
      const d = decider({ lectures: st.lectures, stocke, contrat, maintenantS: ts, bornes });
      if (!d.ecrire) { st.attente = d.pourquoi; return { fait: false, pourquoi: d.pourquoi }; }
      const data = donneesSetPrice(d.prix);
      let estime;
      try { await rpc('eth_call', [{ from: moi, to: H, data }, 'latest']); estime = BigInt(await rpc('eth_estimateGas', [{ from: moi, to: H, data }])); }
      catch (e) { st.compteurs.refusSimulation += 1; st.attente = 'simulation refused: ' + msg(e).slice(0, 80); return { fait: false, pourquoi: st.attente }; }
      let prio = 0n;
      try { prio = BigInt(await rpc('eth_maxPriorityFeePerGas', [])); } catch (_) { prio = 0n; }
      if (prio > BigInt(bornes.prioWeiMax)) prio = BigInt(bornes.prioWeiMax);
      if (base + prio > BigInt(bornes.maxFeeWei)) return { fait: false, pourquoi: 'gas price above the cap' };
      const maxFee = 2n * base + prio > BigInt(bornes.maxFeeWei) ? BigInt(bornes.maxFeeWei) : 2n * base + prio;
      const gas = (estime * 12n) / 10n;
      return await exclusif(async () => {
        const nonce = BigInt(await rpc('eth_getTransactionCount', [moi, 'pending']));
        const tx = { chainId, nonce, maxPriorityFeePerGas: prio, maxFeePerGas: maxFee, gas, to: H, value: 0n, data };
        verifierEnvoi(tx, { hearts: H, chainId, bornes });
        const signe = signerEip1559(tx, cle);
        if (bas(signe.de) !== moi) throw new Error('hearts price keeper: the signature does not recover the keeper address');
        try { await envoi('eth_sendRawTransaction', [signe.brut]); }
        catch (e) { if (!/already known|known transaction/i.test(msg(e))) { st.compteurs.envoisRefuses += 1; echec('send refused: ' + msg(e)); return { fait: false, pourquoi: 'send refused' }; } }
        st.enVol = { hash: signe.hash, prix: String(d.prix), a: maintenant() };
        st.compteurs.envois += 1;
        return { fait: true, hash: signe.hash, prix: d.prix };
      });
    } catch (e) { erreur('round failed: ' + msg(e)); return { fait: false, pourquoi: 'round failed' }; }
    finally { enCours = false; }
  }

  return {
    /** the state the server may publish (/sante): never the key */
    etat: () => ({ etat: st.etat, adresse: st.adresse, enVol: st.enVol ? { ...st.enVol } : null, echecsSuite: st.echecsSuite, arret: st.arret, attente: st.attente,
      stocke: st.stocke, lectures: st.lectures.length, compteurs: { ...st.compteurs }, dernier: st.dernier ? { ...st.dernier } : null, erreurs: st.erreurs.slice() }),
    tour,
    demarrer() {
      const boucle = async () => { await tour(); if (st.etat === 'ON') { minuteur = setTimeout(boucle, bornes.intervalleMs); minuteur.unref?.(); } };
      minuteur = setTimeout(boucle, 45000); minuteur.unref?.();
      return true;
    },
    arreter() { clearTimeout(minuteur); minuteur = null; },
  };
}
