/* points-vue.js — the words of the community points (game353), from /api/points. Text only: no DOM, no network.
 * ⛔ Never a rate, never an APY: points decide a SHARE of what the vault actually received; the page says so on every view. */
const n2 = (x) => (Math.round(Number(x) * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
export const pct = (p) => (Number(p) * 100 >= 0.01 ? (Number(p) * 100).toFixed(2) : (Number(p) > 0 ? '<0.01' : '0')) + '%';
export const REGLE_COURTE = 'Lock points grow every day your TBLOCK stays locked (more for more, up to 1.5x for 90+ days ahead); hearts count double. Your points decide your share of what the vault actually receives — no rate is promised.';

export function lignesMesPoints(r, nom) {
  if (!r || !r.ok) return [{ k: 'Your points', v: 'not read just now' }];
  const c = r.compte;
  if (!c) return [{ k: 'Your points', v: 'connect your wallet to see them' }];
  if (!(c.total > 0)) return [{ k: 'Your points', v: 'none yet — lock TBLOCK or send a heart to start' }];
  return [
    { k: 'Your points', v: n2(c.total) + ' (lock ' + n2(c.lock) + ' · play ' + n2(c.jeu) + ')' },
    { k: 'Your share of the next drop', v: pct(c.part) + (c.rang ? ' · rank #' + c.rang : '') + (r.complet ? '' : ' · still reading the chain') },
  ];
}
export function lignesBoardPoints(r, nom, moi = null) {
  if (!r || !r.ok) return [{ k: 'Points board', v: 'not read just now' }];
  if (!(r.board || []).length) return [{ k: 'Points board', v: r.complet ? 'no points yet — the first lock or heart starts it' : 'reading the chain…' }];
  const m = String(moi || '').toLowerCase();
  return r.board.slice(0, 10).map((e) => ({ k: '#' + e.rang + ' ' + ((e.sesBlocks || [])[0] ? nom(e.sesBlocks[0]) + '’s creator' : nom(e.holder)) + (e.holder === m ? ' (you)' : ''), v: n2(e.total) + ' pts · ' + pct(e.part), moi: e.holder === m }));
}
