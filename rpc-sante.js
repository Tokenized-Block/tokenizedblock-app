/* rpc-sante.js — game362 (Phil 2026-11-11: "régler une bonne fois pour toutes le problème de RPC, ça a cassé notre workflow").
 *
 * MEASURED BEFORE THIS FILE (prod /sante.envois, 2026-11-11): mainnet.base.org 3,342 ok / 2,631 rate-limited (12:48-13:30 UTC), then
 *   374 ok / 311 limited after game361; publicnode, tenderly and the keyed CDP node 0 limited. The readers rotated blindly: a host that had
 *   just answered "rate limit" got the next request anyway, so a busy minute became failed plans (Grok's TAM buy, game360).
 *
 * WHAT THIS DOES: one health state per host, shared by every reader of the server. A host that answers with a rate limit (or does not
 *   answer) is set aside for a cooldown — 15 s, then 30, 60 … up to 5 min while it keeps refusing; its first good answer clears it. The
 *   readers try the hosts that are available first (keeping their rotation), and the cooled ones last, soonest-back first — so a request
 *   is never refused only because every host is cooling: it then tries them anyway.
 * Pure: no network, no clock of its own (injected), no secret (keys only by host label). */

export const ATTENTE_BASE_MS = 15000;
export const ATTENTE_MAX_MS = 300000;
const RAPPEL = new Set(['limite', 'reseau']);   /* what sets a host aside; a plain JSON-RPC error is an answer, not a busy host */

export function creerSante({ maintenant = () => Date.now(), base = ATTENTE_BASE_MS, max = ATTENTE_MAX_MS } = {}) {
  const etat = new Map();   /* hote -> { k, jusqua, derniere } */
  return {
    /** one answer of `hote`, classed like compterEnvoi: 'ok' | 'limite' | 'erreur' | 'reseau' */
    noter(hote, classe) {
      /* an ok from a request already in flight while the host is set aside says nothing new: ignored. After the cooldown, each ok steps the
       *   level down by one (a host that alternates ok / limit keeps a level, instead of being forgiven by every in-flight ok). */
      if (classe === 'ok') { const e = etat.get(hote); if (!e || e.jusqua > maintenant()) return; if (e.k <= 1) etat.delete(hote); else e.k -= 1; return; }
      if (!RAPPEL.has(classe)) return;
      const e = etat.get(hote) || { k: 0, jusqua: 0 };
      const d = Math.min(max, base * 2 ** e.k);
      etat.set(hote, { k: e.k + 1, jusqua: maintenant() + d, derniere: classe });
    },
    disponible(hote) { const e = etat.get(hote); return !e || e.jusqua <= maintenant(); },
    /** the order to try `urls`: rotation from `depart`, available hosts first, then the cooled ones soonest-back first. `hote` maps a url
     *  to its label. Never drops a url. */
    ordonner(urls, depart = 0, hote = (u) => u) {
      const n = urls.length; if (!n) return [];
      const tour = Array.from({ length: n }, (_, i) => urls[(depart + i) % n]);
      const libres = tour.filter((u) => this.disponible(hote(u)));
      const pris = tour.filter((u) => !this.disponible(hote(u))).sort((a, b) => etat.get(hote(a)).jusqua - etat.get(hote(b)).jusqua);
      return [...libres, ...pris];
    },
    /** for /sante: the hosts set aside now, with how long and why */
    instantane() {
      const t = maintenant(), o = {};
      for (const [h, e] of etat) if (e.jusqua > t) o[h] = { encoreMs: e.jusqua - t, rappels: e.k, derniere: e.derniere };
      return o;
    },
  };
}
