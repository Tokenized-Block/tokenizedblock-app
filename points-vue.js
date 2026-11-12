/* points-vue.js — the words of the community points (game353; rule v2 game359), from /api/points. Text only: no DOM, no network.
 * ⛔ Never a rate, never an APY: points decide a SHARE of a separate community drop, not live; the page says so on every view.
 * game359 (Phil: "les points ne fonctionnent pas"): a positive balance is NEVER written "0" — whole numbers from 10, one decimal under 10,
 *   two under 1, "<0.01" below that. */
export const fmtPts = (x) => {
  const v = Number(x);
  if (!(v > 0)) return '0';
  if (v >= 10) return Math.floor(v).toLocaleString('en-US');
  if (v >= 1) return (Math.floor(v * 10) / 10).toLocaleString('en-US', { maximumFractionDigits: 1 });
  if (v >= 0.01) return (Math.floor(v * 100) / 100).toFixed(2);
  return '<0.01';
};
export const pct = (p) => (Number(p) * 100 >= 0.01 ? (Number(p) * 100).toFixed(2) : (Number(p) > 0 ? '<0.01' : '0')) + '%';
export const multTexte = (m) => '×' + String(Number(m)).replace(/\.0+$/, '');
export const REGLE_COURTE = 'Lock: 1 point a day per 100,000 TBLOCK locked, ×1.25 to ×2 the longer you commit (30 days to 1 year). Hearts: 10 points each. Your points decide your share of the community drop, a separate distribution coming soon; no rate is promised.';

export function lignesMesPoints(r, nom) {
  if (!r || !r.ok) return [{ k: 'Your points', v: 'not read just now' }];
  const c = r.compte;
  if (!c) return [{ k: 'Your points', v: 'connect your wallet to see them' }];
  if (!(c.total > 0)) return [{ k: 'Your points', v: 'none yet — lock 100,000 TBLOCK for 1 point a day, or send a heart for 10' }];
  const l = [
    { k: 'Your points', v: fmtPts(c.total) + ' (lock ' + fmtPts(c.lock) + ' · hearts ' + fmtPts(c.jeu) + ')' },
    { k: 'Your share of the next drop', v: pct(c.part) + (c.rang ? ' · rank #' + c.rang : '') + (r.complet ? '' : ' · still reading the chain') },
  ];
  if (Number(c.parJour) > 0 && c.mult) l.push({ k: 'Earning now', v: '+' + fmtPts(c.parJour) + ' a day (' + multTexte(c.mult) + ' commitment)' });
  return l;
}
export function lignesBoardPoints(r, nom, moi = null) {
  if (!r || !r.ok) return [{ k: 'Points board', v: 'not read just now' }];
  if (!(r.board || []).length) return [{ k: 'Points board', v: r.complet ? 'no points yet — the first lock or heart starts it' : 'reading the chain…' }];
  const m = String(moi || '').toLowerCase();
  return r.board.slice(0, 10).map((e) => ({ k: '#' + e.rang + ' ' + ((e.sesBlocks || [])[0] ? nom(e.sesBlocks[0]) + '’s creator' : nom(e.holder)) + (e.holder === m ? ' (you)' : ''),
    v: fmtPts(e.total) + ' pts · ' + pct(e.part) + (Number(e.parJour) > 0 ? ' · +' + fmtPts(e.parJour) + '/day' : ''), moi: e.holder === m }));
}
