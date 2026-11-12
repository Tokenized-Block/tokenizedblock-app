/* coeurs-fil.js — the hearts of the Live feed (game378, Phil: the Live feed must show hearts live, who gave each one, to which block, the
 *   TBLOCK burned). Read from Hearts' own `Liked` logs by the server's hearts index (coeurs-index.js, every heart since the contract's
 *   creation block, a failed window read again, never skipped), served by /api/coeurs; the page reads that answer, never the chain, so
 *   the feed adds no chain read of its own.
 * ⛔ AN EVENT IS NOT A TRANSACTION: a heart is shown with a wallet only after its transaction RECEIPT was read and checked: status 1, the
 *   receipt holds THAT `Liked` log (same emitter, same index, same block, same liker) and `from` = the wallet that signed. The liker
 *   (msg.sender of like(), the wallet the TBLOCK was burned from) is the giver; when the signer differs (a smart wallet sent through
 *   someone else's transaction) both are said. A heart whose receipt is not read yet is shown without a wallet.
 * Pure functions except creerSignataires (one injected `rpc`, eth_getTransactionReceipt only, a few per pass). Nothing signs or sends. */
import { topic } from './keccak.js';

/* the same topic as coeurs.js TOPIC_LIKED (the test checks it); computed here so the page needs no other module */
export const TOPIC_LIKED = topic('Liked(uint256,address,address,uint256,uint256)');

export const FIL_COEURS_MAX = 50; /* the latest hearts served to the feed */
export const RECUS_PAR_PASSE = 10; /* receipts read per index pass (the pass runs once a minute) */
const ADR = /^0x[0-9a-f]{40}$/, TX = /^0x[0-9a-f]{64}$/;
const low = (a) => String(a || '').toLowerCase();
const mot = (t) => '0x' + String(t || '').slice(-40).toLowerCase();
const num = (x) => { try { return Number(BigInt(x)); } catch (_) { return NaN; } };
const cle = (c) => c.tx + ':' + c.index;

/** the latest `max` hearts, newest first (block, then log index) */
export function derniersCoeurs(coeurs, max = FIL_COEURS_MAX) {
  return [...(coeurs || [])].sort((a, b) => b.blockNumber - a.blockNumber || b.index - a.index).slice(0, max);
}

/** one receipt checked against one heart -> { from } when it proves the heart, { refus } when it disproves it, null when not read yet */
export function signataireDuRecu(recu, coeur) {
  if (!recu || typeof recu !== 'object') return null;
  if (low(recu.transactionHash) && low(recu.transactionHash) !== coeur.tx) return { refus: 'another transaction' };
  if (String(recu.status) !== '0x1') return { refus: 'failed transaction' };
  const from = low(recu.from);
  if (!ADR.test(from)) return { refus: 'no signer in the receipt' };
  const l = (recu.logs || []).find((x) => low(x.address) === low(coeur.contrat) && num(x.logIndex) === coeur.index);
  const t = (l && l.topics) || [];
  if (!l || low(t[0]) !== TOPIC_LIKED || mot(t[2]) !== coeur.bloc || mot(t[3]) !== coeur.liker) return { refus: 'the heart is not in this transaction' };
  return { from };
}

/** tx.from of each heart, read from its receipt. A verdict read is kept (a mined receipt does not change); a receipt not read (node error,
 *  not found yet) is NOT kept: it is read again at the next pass, `parPasse` at most per pass. */
export function creerSignataires({ rpc, parPasse = RECUS_PAR_PASSE }) {
  const lus = new Map();
  let lectures = 0, ratees = 0;
  async function resoudre(coeurs) {
    const recus = new Map();
    let n = 0;
    for (const c of coeurs || []) {
      if (lus.has(cle(c)) || !TX.test(c.tx)) continue;
      if (!recus.has(c.tx)) {
        if (n >= parPasse) break;
        n++; lectures++;
        let r = null;
        try { r = await rpc('eth_getTransactionReceipt', [c.tx]); } catch (_) { r = null; ratees++; }
        recus.set(c.tx, r);
      }
      const s = signataireDuRecu(recus.get(c.tx), c);
      if (s) lus.set(cle(c), s);
    }
    return n;
  }
  return { resoudre, de: (c) => lus.get(cle(c)) || null, etat: () => ({ verdicts: lus.size, lectures, ratees }) };
}

/** what /api/coeurs serves to the feed: the latest hearts of ONE contract (Hearts), each with its checked signer or null; a disproved heart
 *  is left out. Amounts are decimal strings (raw units). */
export function coeursPourLeFil(coeurs, de, { contrat, max = FIL_COEURS_MAX } = {}) {
  const k = low(contrat);
  const siens = (coeurs || []).filter((c) => !k || low(c.contrat) === k);
  const out = [];
  for (const c of derniersCoeurs(siens, max)) {
    const s = de(c);
    if (s && s.refus) continue;
    out.push({ tx: c.tx, index: c.index, blockNumber: c.blockNumber, bloc: c.bloc, liker: c.liker, likes: String(c.likes), burned: String(c.burned),
      signePar: s && s.from ? s.from : null });
  }
  return out;
}

/** the page side: one served heart -> one Live feed event (type COEUR), null when malformed. `symbole(adr)` -> the block's symbol or null */
export function evenementCoeur(x, symbole = () => null) {
  if (!x || !TX.test(low(x.tx)) || !ADR.test(low(x.bloc)) || !ADR.test(low(x.liker))) return null;
  const bloc = num(x.blockNumber), idx = num(x.index);
  if (!Number.isSafeInteger(bloc) || !Number.isSafeInteger(idx) || !/^[0-9]+$/.test(String(x.likes)) || !/^[0-9]+$/.test(String(x.burned))) return null;
  const signePar = ADR.test(low(x.signePar)) ? low(x.signePar) : null;
  return { type: 'COEUR', tx: low(x.tx), logIndex: idx, bloc, jeton: low(x.bloc), sym: symbole(low(x.bloc)) || null, liker: low(x.liker),
    likes: String(x.likes), burned: String(x.burned), signePar };
}

/** the hearts part of an /api/coeurs answer: { evenements, etat } — etat 'LU' (index complete), 'PARTIEL' (index still reading: the hearts
 *  shown are real, more may come), 'NON_LU' (no answer, or an answer without the feed list) */
export function coeursDuServeur(r, symbole) {
  if (!r || r.ok !== true || !Array.isArray(r.fil)) return { evenements: [], etat: 'NON_LU' };
  const evenements = r.fil.map((x) => evenementCoeur(x, symbole)).filter(Boolean);
  return { evenements, etat: r.complet === true && !r.trou ? 'LU' : 'PARTIEL' };
}

/** raw TBLOCK units (18 decimals) -> exact decimal text, no float */
export function tblockTexte(brut) {
  const v = BigInt(brut), base = 10n ** 18n;
  const frac = (v % base).toString().padStart(18, '0').replace(/0+$/, '');
  return (v / base).toString() + (frac ? '.' + frac : '');
}

/** the words of one heart row: { qui, via, n } — `qui` the giver (the liker) only once its receipt was checked, `via` the signer when it is
 *  another wallet, `n` the hearts as text ("1 heart", "3 hearts") */
export function quiDuCoeur(e) {
  const n = String(e.likes) === '1' ? '1 heart' : String(e.likes) + ' hearts';
  if (!e.signePar) return { qui: null, via: null, n };
  return { qui: e.liker, via: e.signePar === e.liker ? null : e.signePar, n };
}
