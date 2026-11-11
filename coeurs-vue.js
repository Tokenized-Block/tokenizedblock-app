/* coeurs-vue.js — the words of the hearts (Phil 2026-11-10): what a wallet gave and received, who gave back, the contributors' board,
 *   and the "signals" between blocks (a heart from a holder whose own block is shown, so blocks visibly greet each other).
 * Text only, from the /api/coeurs answer (amounts arrive as decimal strings). No DOM, no network: the page and holders.html render these.
 * ⛔ `nom(adr)` names an address (a block symbol or a shortened address); a liker is named by ITS first block when it has one
 *   ("FOO's creator"), otherwise by its shortened address. Never a guess: an unknown creator stays an address. */
const E18 = 10n ** 18n;
const big = (x) => { try { return BigInt(x); } catch (_) { return 0n; } };
export const tblockTexte = (raw) => { const n = big(raw) / E18; return n.toLocaleString('en-US'); };
export const coeursTexte = (n) => { const k = big(n); return k + (k === 1n ? ' heart' : ' hearts'); };

/** a liker's display: its first block's name + "'s creator", or the address */
export function nomDonneur(liker, sesBlocks, nom) {
  const b = (sesBlocks || [])[0];
  return b ? nom(b) + '’s creator' : nom(liker);
}

/** the wallet's own lines: given / received / per giver, with what was given back */
export function lignesCompte(c, nom) {
  if (!c) return [];
  const out = [];
  const donnes = big(c.donnes && c.donnes.likes), recus = big(c.recus && c.recus.likes);
  out.push({ k: 'Hearts you gave', v: donnes > 0n ? coeursTexte(donnes) + ' (' + tblockTexte(c.donnes.burned) + ' TBLOCK burned)' : 'none yet — the ♥ next to a block’s name' });
  const aDesBlocks = (c.sesBlocks || []).length > 0;
  out.push({ k: 'Hearts on your blocks', v: recus > 0n ? coeursTexte(recus) : (aDesBlocks ? 'none yet' : 'you have no block yet') });
  for (const d of (c.recus && c.recus.de) || []) {
    const rendus = big(d.rendus);
    out.push({ k: '♥ from ' + nomDonneur(d.liker, d.sesBlocks, nom), v: coeursTexte(d.likes) + (rendus > 0n ? ' · you gave back ' + rendus : ((d.sesBlocks || []).length ? ' · give one back to ' + nom(d.sesBlocks[0]) : '')), bloc: (d.sesBlocks || [])[0] || null });
  }
  if (c.blocsSansCreateur > 0) out.push({ k: 'Not counted yet', v: c.blocsSansCreateur + ' hearted block(s) whose creator is not indexed yet' });
  return out;
}

/** the contributors' board, ranked by TBLOCK burned in hearts */
export function lignesBoard(r, nom, moi = null) {
  if (!r || !r.ok) return [{ k: 'Board', v: 'not read just now' }];
  const b = r.board || [];
  if (!b.length) return [{ k: 'Board', v: r.complet ? 'no heart given yet — be the first' : 'reading the hearts… (' + Math.max(0, Number(r.lusJusqua) - Number(r.depuis) + 1).toLocaleString('en-US') + ' blocks read)' }];
  const m = String(moi || '').toLowerCase();
  return b.map((e) => ({ k: '#' + e.rang + ' ' + nomDonneur(e.liker, e.sesBlocks, nom) + (e.liker === m ? ' (you)' : ''), v: coeursTexte(e.likes) + ' · ' + tblockTexte(e.burned) + ' TBLOCK burned', bloc: (e.sesBlocks || [])[0] || null, moi: e.liker === m }));
}

/** the signals a block received: one line per holder who hearted it, named by their own block when they have one */
export function signauxBloc(bl, nom) {
  if (!bl || !(bl.signaux || []).length) return null;
  const parts = bl.signaux.slice(0, 4).map((s) => nomDonneur(s.liker, s.sesBlocks, nom).replace(/’s creator$/, '') + ' ×' + big(s.likes));
  const reste = bl.signaux.length - 4;
  return { texte: '♥ signals from ' + parts.join(', ') + (reste > 0 ? ' and ' + reste + ' more' : ''), blocs: bl.signaux.map((s) => (s.sesBlocks || [])[0]).filter(Boolean).slice(0, 4) };
}

/** 2026-11-11: what CLAIMING the holders vault needs, shown next to the hearts (a heart's own hold is much lower).
 *  `claimMinHold` = the vault's fixed hold (raw, 18 decimals, from the deployment record). The dollar value is added only for a real
 *  price (> 0) and labelled "now"; the balance and the verdict only when a balance was read. Never a guessed number. */
export function ligneSeuilClaim({ claimMinHold, balance = null, prixUsd = null } = {}) {
  const min = big(claimMinHold);
  let v = tblockTexte(min) + ' TBLOCK held';
  const p = Number(prixUsd);
  if (prixUsd !== null && prixUsd !== undefined && Number.isFinite(p) && p > 0) v += ' (≈ $' + (Number(min / E18) * p).toFixed(2) + ' now)';
  let bal = null;
  if (balance !== null && balance !== undefined && balance !== '') { try { bal = BigInt(balance); } catch (_) { bal = null; } }
  if (bal !== null) v += ' · you hold ' + tblockTexte(bal) + (bal >= min ? ' · enough' : ' · not enough yet');
  return { k: 'Vault claim needs', v };
}
