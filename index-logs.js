/* index-logs.js — a running index of ONE contract's logs (any of `topics`), read window by window from its deploy block, each record
 *   stamped with its block's time (game353: TBlockLock events for the community points). Same rules as coeurs-index.js:
 * ⛔ A FAILED WINDOW IS NEVER SKIPPED (the cursor stays on it, the hole is said); an error is never "no event".
 * ⛔ A record without its block time is kept but NOT counted as complete: `horodate` says how many still wait for their time. */
export function creerIndexLogs({ rpc, adresse, topics, decoder, depuis, fenetre = 2000, parPasse = 40 }) {
  const etat = { prochain: depuis, tete: null, recs: [], trou: null, vus: new Set(), temps: new Map(), sansTemps: 0, enVol: false };
  async function horodater() {
    const manquants = [...new Set(etat.recs.filter((r) => r.t === undefined).map((r) => r.blockNumber))].slice(0, 50);
    for (const b of manquants) {
      if (!etat.temps.has(b)) {
        try { const blk = await rpc('eth_getBlockByNumber', ['0x' + b.toString(16), false]); const ts = Number(BigInt(blk && blk.timestamp)); if (ts > 0) etat.temps.set(b, ts); } catch (_) { /* again next pass */ }
      }
    }
    for (const r of etat.recs) if (r.t === undefined && etat.temps.has(r.blockNumber)) r.t = etat.temps.get(r.blockNumber);
    etat.sansTemps = etat.recs.filter((r) => r.t === undefined).length;
  }
  async function avancer() {
    if (etat.enVol) return etat;
    etat.enVol = true;
    try {
      const tete = Number(BigInt(await rpc('eth_blockNumber', [])));
      if (!Number.isSafeInteger(tete) || tete <= 0) throw new Error('head not read');
      etat.tete = tete;
      let n = 0;
      while (etat.prochain <= tete && n < parPasse) {
        const a = etat.prochain, b = Math.min(tete, a + fenetre - 1);
        let logs;
        try {
          logs = await rpc('eth_getLogs', [{ address: adresse, topics: [topics], fromBlock: '0x' + a.toString(16), toBlock: '0x' + b.toString(16) }]);
          if (!Array.isArray(logs)) throw new Error('getLogs answered no list');
        } catch (e) { etat.trou = { de: a, a: b, pourquoi: String((e && e.message) || e).slice(0, 120) }; break; }
        for (const l of logs) {
          const r = decoder(l, adresse);
          if (!r) continue;
          const k = r.tx + ':' + r.i;
          if (etat.vus.has(k)) continue;
          etat.vus.add(k); etat.recs.push(r);
        }
        etat.prochain = b + 1; etat.trou = null; n++;
      }
    } catch (e) {
      etat.trou = { de: etat.prochain, a: null, pourquoi: String((e && e.message) || e).slice(0, 120) };
    }
    try { await horodater(); } finally { etat.enVol = false; }
    return etat;
  }
  const complet = () => etat.tete !== null && etat.prochain > etat.tete && etat.trou === null && etat.sansTemps === 0;
  return { avancer, etat, complet, recs: () => etat.recs };
}
