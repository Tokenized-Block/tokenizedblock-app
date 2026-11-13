/* salle-encheres.js — THE SKIN AUCTION ROOM (owner, 2026-10-27): "Open the skin market" opens a game window where an
 *   auctioneer ANNOUNCES the real state of the BlockSkins market.
 *
 * ⛔⛔ EVERY LINE HE SAYS IS BUILT FROM THE LIST READ ON CHAIN (lireSkins -> decoderPage fields: tokenId, block, detenteur, enVente,
 *   enchere, devise, prix, fin, encherisseur, offre) — never an invented bid, bidder or time. Each line carries `from`: the exact
 *   fields and values it was built from. A list NOT read -> he says so, and announces nothing else.
 * ⛔ THIS MODULE READS NOTHING, SIGNS NOTHING: the app reads the chain; every gesture still goes through bcActionMarche /
 *   ouvrirMintSkin (app.html) and the person's wallet. The minimum bid is offreMinimale (blockskins.js, the contract's rule).
 * The caller passes `montant(brut, devise)` (the app's bcMontantSkin) and `nomBlock(adr)`, so amounts and names are the
 *   app's own texts — the same as the Market tab rows.
 */
import { offreMinimale, texteSkin } from './blockskins.js';
import { statutSkin, ordonnerSkins, compterSkins, tempsRestant, detenteurCourt } from './skins-marche.js';

export const VERSION_SALLE = 'tblock-skin-room/1';
const ZERO = '0x' + '0'.repeat(40);
const bas = (x) => String(x || '').toLowerCase();

/** Who bid: "you", the short address, or null when the contract holds no bidder (the zero address). */
export function encherisseurCourt(s, moi) {
  const e = bas(s && s.encherisseur);
  if (!e || e === ZERO) return null;
  return detenteurCourt({ detenteur: e }, moi);
}

/** The lot on the podium: the live auction that ends first; else an ended auction to settle; else none. */
export function lotDuPodium(skins, t) {
  const o = ordonnerSkins(skins, t);
  return o.find((s) => statutSkin(s, t) === 'ENCHERE') || o.find((s) => statutSkin(s, t) === 'ENCHERE_FINIE') || null;
}

/**
 * What the auctioneer announces. `lu`: the list was read on chain (false = a failed read: he says only that).
 * @returns {{ lu, podium, etagere, compte, lignes: Array<{text, from}> }}
 */
export function annonce({ skins, lu = true, moi = null, t, montant, nomBlock }) {
  const L = Array.isArray(skins) ? skins : [];
  if (!lu) return { lu: false, podium: null, etagere: [], compte: null,
    lignes: [{ text: 'I could not read the market on chain just now — I announce nothing rather than a wrong bid.', from: [{ key: 'etat', value: 'NON_LU' }] }] };
  const c = compterSkins(L, t), podium = lotDuPodium(L, t);
  const etagere = ordonnerSkins(L, t).filter((s) => statutSkin(s, t) === 'FIXE');
  const lignes = [];
  const M = (brut, devise) => montant(brut, devise);
  if (!c.total) lignes.push({ text: 'No skin has been minted yet — the room is empty. Mint the first one and it can come under my hammer.', from: [{ key: 'total', value: 0 }] });
  else if (!podium) lignes.push({ text: 'No skin is under my hammer right now: nothing is in auction.', from: [{ key: 'enchere', value: c.enchere }, { key: 'finie', value: c.finie }] });
  if (podium) {
    const id = String(podium.tokenId), st = statutSkin(podium, t), who = encherisseurCourt(podium, moi);
    const dresse = nomBlock(podium.block);
    lignes.push({ text: 'On the podium: ' + texteSkin(podium) + ', dressing ' + dresse + '.', from: [{ key: 'tokenId', value: id }, { key: 'block', value: bas(podium.block) }] });
    const o = BigInt(podium.offre || 0);
    if (st === 'ENCHERE') {
      lignes.push(o > 0n
        ? { text: 'The highest bid is ' + M(o, podium.devise) + (who ? ', from ' + who : '') + '.', from: [{ key: 'offre', value: String(o) }, { key: 'devise', value: bas(podium.devise) }, { key: 'encherisseur', value: bas(podium.encherisseur) }] }
        : { text: 'No bid yet — it opens at ' + M(podium.prix, podium.devise) + '.', from: [{ key: 'offre', value: '0' }, { key: 'prix', value: String(podium.prix) }, { key: 'devise', value: bas(podium.devise) }] });
      lignes.push({ text: 'Time left: ' + tempsRestant(podium.fin, t) + '. The next bid must be at least ' + M(offreMinimale(podium), podium.devise) + (o > 0n ? ' (+5 %).' : ' (the opening price).'),
        from: [{ key: 'fin', value: Number(podium.fin) }, { key: 'minimum', value: String(offreMinimale(podium)) }] });
    } else {
      lignes.push(o > 0n
        ? { text: 'Going, going, gone: the auction has ended at ' + M(o, podium.devise) + (who ? ', won by ' + who : '') + '. Anyone may settle it.', from: [{ key: 'fin', value: Number(podium.fin) }, { key: 'offre', value: String(o) }, { key: 'encherisseur', value: bas(podium.encherisseur) }] }
        : { text: 'This auction has ended with no bid: settling sends the skin back to its seller.', from: [{ key: 'fin', value: Number(podium.fin) }, { key: 'offre', value: '0' }] });
    }
    const autres = c.enchere + c.finie - 1;
    if (autres > 0) lignes.push({ text: autres + ' other auction' + (autres === 1 ? '' : 's') + ' wait' + (autres === 1 ? 's' : '') + ' below.', from: [{ key: 'enchere', value: c.enchere }, { key: 'finie', value: c.finie }] });
  }
  if (c.total) lignes.push(etagere.length
    ? { text: 'On my shelf: ' + etagere.length + ' skin' + (etagere.length === 1 ? '' : 's') + ' at a fixed price.', from: [{ key: 'fixe', value: etagere.length }] }
    : { text: 'My shelf is empty: no skin at a fixed price.', from: [{ key: 'fixe', value: 0 }] });
  return { lu: true, podium, etagere, compte: c, lignes };
}
