/* coeurs.js — who gave hearts to whom, read from BlockLikes' own `Liked` events (Phil 2026-11-10: "the number of hearts given must show in
 *   the user's wallet, who gave them hearts and how many the holder gave back; add a leaderboard of the best contributors").
 * Pure functions: no network, no signing. The server feeds them the logs it read; the page only renders what they return.
 *
 * WHY AN EVENT IS ENOUGH HERE (and not for a token transfer): a log is accepted only if its emitter is the BlockLikes contract itself and its
 *   topic is `Liked`. Nobody else can emit a log FROM that address, and BlockLikes emits it only after the TBLOCK reached 0x…dEaD and the
 *   hold was checked. A forged `Liked` from another contract is refused by the address check, not trusted.
 * What it does NOT prove: why someone gave a heart. It counts gestures and TBLOCK burned, nothing more. */
import { topic } from './keccak.js';

export const TOPIC_LIKED = topic('Liked(uint256,address,address,uint256,uint256)');
const ADR = /^0x[0-9a-f]{40}$/;
const low = (a) => String(a || '').toLowerCase();
const mot = (t) => '0x' + String(t || '').slice(-40).toLowerCase();

/** one log -> one heart record, or null when the log is not a `Liked` emitted by `likes` (wrong emitter, wrong topic, malformed data) */
export function decoderLiked(log, likes) {
  if (!log || low(log.address) !== low(likes) || !ADR.test(low(likes))) return null;
  const t = log.topics || [];
  if (t.length !== 4 || low(t[0]) !== TOPIC_LIKED) return null;
  const d = String(log.data || '');
  if (!/^0x[0-9a-fA-F]{128}$/.test(d)) return null;
  const bloc = mot(t[2]), liker = mot(t[3]);
  if (!ADR.test(bloc) || !ADR.test(liker)) return null;
  return {
    epoch: Number(BigInt(t[1])), bloc, liker,
    likes: BigInt('0x' + d.slice(2, 66)), burned: BigInt('0x' + d.slice(66, 130)),
    blockNumber: Number(BigInt(log.blockNumber || '0x0')), tx: low(log.transactionHash), index: Number(BigInt(log.logIndex || '0x0')),
  };
}

/** game359: per week (BlockLikes epoch), the distinct heart givers and the TBLOCK they burned: { [epoch]: { joueurs, burned } } */
export function joueursParSemaine(coeurs) {
  const par = new Map();
  for (const c of coeurs) { const e = par.get(c.epoch) || { qui: new Set(), burned: 0n }; e.qui.add(c.liker); e.burned += BigInt(c.burned); par.set(c.epoch, e); }
  const out = {};
  for (const [k, v] of par) out[k] = { joueurs: v.qui.size, burned: v.burned };
  return out;
}
/** the same log read twice (two overlapping windows, a retry) counts once: key = tx + log index */
export function dedoublonner(coeurs) {
  const vus = new Set(), out = [];
  for (const c of coeurs) { const k = c.tx + ':' + c.index; if (vus.has(k)) continue; vus.add(k); out.push(c); }
  return out;
}

/** leaderboard of the contributors: TBLOCK burned in hearts, then hearts, then who came FIRST (an earlier block wins a tie, never the address) */
export function classement(coeurs, max = 10) {
  const par = new Map();
  for (const c of coeurs) {
    const e = par.get(c.liker) || { liker: c.liker, likes: 0n, burned: 0n, blocs: new Set(), premier: c.blockNumber };
    e.likes += c.likes; e.burned += c.burned; e.blocs.add(c.bloc); if (c.blockNumber < e.premier) e.premier = c.blockNumber;
    par.set(c.liker, e);
  }
  return [...par.values()]
    .sort((a, b) => (b.burned > a.burned ? 1 : b.burned < a.burned ? -1 : 0) || (b.likes > a.likes ? 1 : b.likes < a.likes ? -1 : 0) || a.premier - b.premier)
    .slice(0, max)
    .map((e, i) => ({ rang: i + 1, liker: e.liker, likes: e.likes, burned: e.burned, blocs: e.blocs.size }));
}

/** one wallet's hearts: given (to which blocks), received (on the blocks it CREATED, from whom), and for each giver how many hearts this
 *  wallet gave back to that giver's own blocks. `createurDe(bloc)` -> creator address or null (unknown creator = not counted as received,
 *  and said so in `blocsSansCreateur`). */
export function vueCompte(coeurs, compte, createurDe) {
  const moi = low(compte);
  if (!ADR.test(moi)) throw new Error('not an address: ' + compte);
  const donnes = { likes: 0n, burned: 0n, vers: new Map() };
  const recus = { likes: 0n, de: new Map() };
  const rendusA = new Map(); /* creator -> hearts I gave to their blocks */
  const sansCreateur = new Set();
  for (const c of coeurs) {
    const createur = createurDe(c.bloc);
    if (!createur) sansCreateur.add(c.bloc);
    const cr = createur ? low(createur) : null;
    if (c.liker === moi) {
      donnes.likes += c.likes; donnes.burned += c.burned;
      donnes.vers.set(c.bloc, (donnes.vers.get(c.bloc) || 0n) + c.likes);
      if (cr) rendusA.set(cr, (rendusA.get(cr) || 0n) + c.likes);
    }
    if (cr === moi && c.liker !== moi) {
      recus.likes += c.likes;
      recus.de.set(c.liker, (recus.de.get(c.liker) || 0n) + c.likes);
    }
  }
  const tri = (m) => [...m.entries()].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));
  return {
    compte: moi,
    donnes: { likes: donnes.likes, burned: donnes.burned, vers: tri(donnes.vers).map(([bloc, likes]) => ({ bloc, likes })) },
    recus: { likes: recus.likes, de: tri(recus.de).map(([liker, likes]) => ({ liker, likes, rendus: rendusA.get(liker) || 0n })) },
    blocsSansCreateur: sansCreateur.size,
  };
}
