/* test-lock-pot-398-20261113.mjs — game398 (the creator fee slot moved to the lock rewards R on 2026-11-13, tx 0x1d59769a…549f, from the
 *   payee, verified on chain). The lock card now says what has GATHERED in R (unassigned: fees + deposits not yet given to a month) and
 *   the NEXT PAYOUT: the first month a lock counts for. Read on chain 2026-11-13: month 0 has weight 0 (enroll writes cur + 1, contract
 *   TBlockLockRewards.sol), month 1 has 3.75 M — so month 0 pays nobody and the first payout is month 1, closing 2027-01-11.
 * EXECUTES the real block of app.html (extracted) on a fake chain: the lines it writes for "month 0 empty, month 1 counted" and for
 *   "no month counted"; checks the selectors are computed from signatures; NE PROUVE PAS: the rendering in a wallet session. */
import { readFileSync } from 'node:fs';
import * as EP from './economie-pack.js';
import { selecteur } from './keccak.js';
const APP = readFileSync(new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let ok = 0, ko = 0;
const t = (m, c) => { if (c) ok++; else { ko++; console.log('KO', m); } };

const S = (sig) => selecteur(sig).replace(/^0x/, '');
t('selectors are the signatures', EP.SEL.unassigned === S('unassigned(address)') && EP.SEL.projectedTotalWeight === S('projectedTotalWeight(uint256)') && EP.SEL.WTCOIN === S('WTCOIN()'));
t('every call the block makes carries 0x data (views, never a bare selector)', EP.VIEW.rWtcoin().data.startsWith('0x') && EP.VIEW.rUnassigned(EP.TBLOCK).data.startsWith('0x'));
t('views target R', EP.VIEW.rUnassigned(EP.TBLOCK).to === EP.REWARDS && EP.VIEW.projectedWeight(1n).to === EP.REWARDS && EP.VIEW.rWtcoin().to === EP.REWARDS);

const i = APP.indexOf('    /* game398 (slot moved to R 2026-11-13)'), j = APP.indexOf('} catch (_) { /* said by the lines that did read */ }', i);
t('block found', i > 0 && j > i);
const src = APP.slice(APP.indexOf('try {', i), j + '} catch (_) { /* said by the lines that did read */ }'.length);
const word = (n) => '0x' + BigInt(n).toString(16).padStart(64, '0');
async function run({ weights, unT, unW }) {
  const lines = [];
  const WT = '0x5cda0e1ca4ce2af96315f7f8963c85399c172204';
  const rpc = async (m, p) => {
    const d0 = p[0].data; if (!String(d0).startsWith('0x')) throw new Error('call data without 0x: ' + d0); const d = d0.slice(2);
    if (d === EP.SEL.WTCOIN) return '0x' + '0'.repeat(24) + WT.slice(2);
    if (d.startsWith(EP.SEL.unassigned)) return word(d.endsWith(EP.TBLOCK.slice(2)) ? unT : unW);
    if (d.startsWith(EP.SEL.projectedTotalWeight)) return word(weights[Number(BigInt('0x' + d.slice(8)))] || 0n);
    if (d.startsWith(EP.SEL.epochEnd)) return word(1794441600n + 2592000n * BigInt('0x' + d.slice(8)));
    throw new Error('unexpected call');
  };
  const lit = async (v) => EP.word(await rpc('eth_call', [{ to: v.to, data: v.data }, 'latest']));
  const quand = (s) => new Date(Number(s) * 1000).toISOString().slice(0, 10);
  const ligne = (k, v) => lines.push(k + ': ' + v);
  await new Function('rpc', 'lit', 'EP', 'ligne', 'quand', 'c', 'return (async () => { ' + src + ' })();')(rpc, lit, EP, ligne, quand, 0n);
  return lines;
}
const a = await run({ weights: [0n, 3750000n * 10n ** 18n], unT: 1234n * 10n ** 18n, unW: 5n * 10n ** 17n });
t('gathered: both tokens, read', /^Gathered so far: 1,?234 TBLOCK \+ 0\.5 wtCOIN/.test(a[0]) || (a[0].startsWith('Gathered so far: ') && a[0].includes('TBLOCK') && a[0].includes('wtCOIN')));
t('next payout: month 1, its close date, and why month 0 pays nobody', a[1] && a[1].startsWith('Next payout: month 1 closes ') && a[1].includes('no lock counts for month 0: a lock counts from the month after it joins'));
const b = await run({ weights: [0n, 0n, 0n, 0n], unT: 0n, unW: 0n });
t('no month counted: said, no date invented', b[1] === 'Next payout: no lock counts yet for the coming months: a lock counts from the month after it joins');
const c = await run({ weights: [9n], unT: 0n, unW: 0n });
t('the current month counted: no "month 0 pays nobody" line', c[1] && c[1].startsWith('Next payout: month 0 closes ') && !c[1].includes('no lock counts for month'));
t('copy promises no amount', !/guarantee|will earn|APR|APY/i.test(src));
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
