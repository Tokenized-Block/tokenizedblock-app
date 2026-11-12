/* coeurs-index.js — the server's running index of BlockLikes `Liked` logs (hearts), read window by window from the contract's deploy block.
 *   `rpc(method, params)` is injected (the server's keyed relay first); nothing here signs or sends.
 * ⛔ A FAILED WINDOW IS NEVER SKIPPED: the cursor stays on it and the next pass reads it again. A hole would make a heart vanish from a
 *   wallet and from the board, silently (the 100,000-block hole of 2026-10 came from skipping a refused window). `trou` says it out loud.
 * ⛔ An empty answer is a real "no heart in this window" only because the node answered a well-formed getLogs; an error is not a zero. */
import { TOPIC_LIKED, decoderLiked, dedoublonner } from './coeurs.js';

export const LIKES_DEPLOY_BLOC = 55600255; /* first block with BlockLikes code, found by getCode bisection on mainnet 2026-11-10 */
export const FENETRE = 2000;
export const FENETRES_PAR_PASSE = 40;

export function creerIndexCoeurs({ rpc, likes, depuis = LIKES_DEPLOY_BLOC, fenetre = FENETRE, parPasse = FENETRES_PAR_PASSE }) {
  const etat = { prochain: depuis, tete: null, coeurs: [], trou: null, passes: 0, enVol: false, luA: 0 };
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
          logs = await rpc('eth_getLogs', [{ address: likes, topics: [TOPIC_LIKED], fromBlock: '0x' + a.toString(16), toBlock: '0x' + b.toString(16) }]);
          if (!Array.isArray(logs)) throw new Error('getLogs answered no list');
        } catch (e) {
          etat.trou = { de: a, a: b, pourquoi: String((e && e.message) || e).slice(0, 120) };
          break; /* the cursor stays on `a`: read again next pass, never skipped */
        }
        const lus = logs.map((l) => decoderLiked(l, likes)).filter(Boolean);
        if (lus.length) etat.coeurs = dedoublonner(etat.coeurs.concat(lus));
        etat.prochain = b + 1; etat.trou = null; n++;
      }
      etat.passes++; etat.luA = Date.now();
    } catch (e) {
      etat.trou = { de: etat.prochain, a: null, pourquoi: String((e && e.message) || e).slice(0, 120) };
    } finally { etat.enVol = false; }
    return etat;
  }
  /** complete = every block from the deploy block up to the head read last was read */
  const complet = () => etat.tete !== null && etat.prochain > etat.tete && etat.trou === null;
  return { avancer, etat, complet, coeurs: () => etat.coeurs };
}

/** 2026-11-12 (the economy pack is live): hearts now go to Hearts (BlockLikesV2, the same `Liked` event); the first contract's hearts stay
 *  history. ONE index over several contracts, each read from its own deploy block with the same never-skip rule; `coeurs` is every heart of
 *  every contract, `complet` only when each one is complete. sources = [{ likes, depuis }] (addresses from the deployment records). */
export function creerIndexCoeursSuite({ rpc, sources, fenetre = FENETRE, parPasse = FENETRES_PAR_PASSE }) {
  const ix = (sources || []).filter((s) => s && /^0x[0-9a-f]{40}$/.test(String(s.likes || '').toLowerCase()))
    .map((s) => ({ likes: String(s.likes).toLowerCase(), depuis: s.depuis, i: creerIndexCoeurs({ rpc, likes: String(s.likes).toLowerCase(), depuis: s.depuis, fenetre, parPasse }) }));
  if (!ix.length) throw new Error('no hearts contract');
  const etat = {
    get prochain() { return Math.min(...ix.map((x) => x.i.etat.prochain)); },
    get tete() { const t = ix.map((x) => x.i.etat.tete); return t.some((v) => v === null) ? null : Math.min(...t); },
    get trou() { const t = ix.find((x) => x.i.etat.trou); return t ? { ...t.i.etat.trou, contrat: t.likes } : null; },
    get passes() { return Math.min(...ix.map((x) => x.i.etat.passes)); },
  };
  async function avancer() { for (const x of ix) await x.i.avancer(); return etat; }
  const complet = () => ix.every((x) => x.i.complet());
  const coeurs = () => ix.flatMap((x) => x.i.coeurs().map((c) => (c.contrat ? c : Object.assign(c, { contrat: x.likes }))));
  const contrats = () => ix.map((x) => ({ adresse: x.likes, depuis: x.depuis, complet: x.i.complet(), lusJusqua: x.i.etat.prochain - 1, coeurs: x.i.coeurs().length }));
  return { avancer, etat, complet, coeurs, contrats };
}
