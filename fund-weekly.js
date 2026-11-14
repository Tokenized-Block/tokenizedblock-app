/* fund-weekly.js — the page side of FUNDING the weekly lock rewards (R2). Pure: no DOM, no network. UNSIGNED calls only; the person's
 *   own wallet signs. Two roads:
 *   1. the DEV rescue door of the monthly rewards R (TBlockLockRewards): the guardian requests R -> R2 (public, 72 h), then executes.
 *      Only the guardian read ON CHAIN may sign them (onlyGuardian); the page offers nothing to another wallet.
 *   2. anyone: deposit TBLOCK into R2 (approve EXACTLY the amount, then R2.deposit(TBLOCK, amount)). Never an unlimited approval.
 * ⛔ No address is typed here: R and TBLOCK come from economie-pack.js, R2 from the deploy record (lock-weekly-app.js). */
import { selecteur } from './keccak.js';
import { WEEKLY, wAddr, wUint } from './lock-weekly-app.js';
import { REWARDS, TBLOCK } from './economie-pack.js';

const S_ = (sig) => String(selecteur(sig)).replace(/^0x/, '');
const adr = (a) => (/^0x[0-9a-fA-F]{40}$/.test(String(a || '')) ? String(a).toLowerCase() : null);
export const R = adr(REWARDS);
export const R2 = adr(WEEKLY);
export const TOKEN = adr(TBLOCK);
export const DELAI_RESCUE_S = 72 * 3600;

export const SEL = Object.freeze({
  rescueRequest: S_('rescueRequest(address,address,uint256)'), rescueExecute: S_('rescueExecute()'), rescueCancel: S_('rescueCancel()'),
  pendingRescue: S_('pendingRescue()'), guardian: S_('guardian()'), RESCUE_DELAY: S_('RESCUE_DELAY()'),
  balanceOf: S_('balanceOf(address)'), approve: S_('approve(address,uint256)'), deposit: S_('deposit(address,uint256)'),
});

const pret = () => { if (!R || !R2 || !TOKEN) throw new Error('the rewards contracts are not on this network'); };
const appel = (to, data) => Object.freeze({ to, data: '0x' + data, value: '0x0' });

export const VIEW = Object.freeze({
  guardian: () => { pret(); return { to: R, data: '0x' + SEL.guardian }; },
  pendingRescue: () => { pret(); return { to: R, data: '0x' + SEL.pendingRescue }; },
  rescueDelay: () => { pret(); return { to: R, data: '0x' + SEL.RESCUE_DELAY }; },
  soldeR: () => { pret(); return { to: TOKEN, data: '0x' + SEL.balanceOf + wAddr(R) }; },
  soldeR2: () => { pret(); return { to: TOKEN, data: '0x' + SEL.balanceOf + wAddr(R2) }; },
  solde: (a) => { pret(); return { to: TOKEN, data: '0x' + SEL.balanceOf + wAddr(a) }; },
});

/** R.rescueRequest(TBLOCK, R2, amount): the token and the recipient are fixed here, only the amount is the caller's */
export function rescueVersR2(amount) {
  pret();
  const a = BigInt(amount);
  if (a <= 0n) throw new Error('nothing to move');
  return appel(R, SEL.rescueRequest + wAddr(TOKEN) + wAddr(R2) + wUint(a));
}
export function rescueExecuter() { pret(); return appel(R, SEL.rescueExecute); }

/** anyone: approve exactly `amount` TBLOCK to R2, then R2.deposit(TBLOCK, amount) */
export function depotR2(amount) {
  pret();
  const a = BigInt(amount);
  if (a <= 0n) throw new Error('nothing to deposit');
  return Object.freeze([appel(TOKEN, SEL.approve + wAddr(R2) + wUint(a)), appel(R2, SEL.deposit + wAddr(TOKEN) + wUint(a))]);
}

/** the four words of pendingRescue() */
export function decoderRescue(hex) {
  const h = String(hex || '').replace(/^0x/, '');
  if (h.length < 256) throw new Error('pendingRescue not read');
  const w = (i) => h.slice(i * 64, (i + 1) * 64);
  return { token: '0x' + w(0).slice(24), to: '0x' + w(1).slice(24), amount: BigInt('0x' + w(2)), executeAt: BigInt('0x' + w(3)) };
}

/** what the rescue card offers to THIS wallet now — every input read on chain */
export function etatRescue({ moi, guardian, pending, maintenantS, soldeR }) {
  const g = adr(guardian), m = adr(moi);
  if (!g || g === '0x0000000000000000000000000000000000000000') return { action: null, texte: 'The monthly rewards have no rescue door any more: nothing can move from it.' };
  const p = pending || { executeAt: 0n };
  const at = BigInt(p.executeAt || 0n), now = BigInt(maintenantS);
  const versR2 = at > 0n && adr(p.token) === TOKEN && adr(p.to) === R2;
  if (at > 0n && !versR2) return { action: null, texte: 'A different rescue is pending on the monthly rewards (not TBLOCK to the weekly rewards): nothing is offered here.' };
  if (m !== g) {
    if (at > 0n) return { action: null, texte: 'A move to the weekly rewards is pending. Only the DEV wallet can execute it.' };
    return { action: null, texte: 'Only the DEV wallet (the guardian read on chain) can move the monthly stock. Connect it, or deposit below.' };
  }
  if (at === 0n) {
    if (BigInt(soldeR) === 0n) return { action: null, texte: 'The monthly rewards hold no TBLOCK: nothing to move.' };
    return { action: 'request', texte: 'Step 1 of 2: request the move of all the monthly TBLOCK to the weekly rewards. It is public on chain and executes after 72 hours.' };
  }
  if (now < at) return { action: null, texte: 'Step 1 done. Step 2 opens in ' + duree(at - now) + '.', ouvreA: at };
  return { action: 'execute', texte: 'Step 2 of 2: execute the move. It sends what the monthly rewards still hold, up to the amount requested.' };
}
function duree(s) {
  const h = s / 3600n, mn = (s % 3600n) / 60n;
  return (h ? h + ' h ' : '') + mn + ' min';
}
