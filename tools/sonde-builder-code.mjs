/* tools/sonde-builder-code.mjs - read-only: does a call still work when the ERC-8021 builder-code suffix is appended to its calldata?
 * Simulated with eth_call (nothing sent), WITH and WITHOUT the suffix, on: TBLOCK (a B20 native token) approve + transfer,
 * wtCOIN approve, and a view of the holders vault. Suffix format from docs.base.org/specifications/builder-codes/for-app-developers:
 * ASCII codes, 1-byte length, 1-byte schema id 0x00, then the 16-byte marker 0x8021...8021. */
import { TBLOCK, WTCOIN } from '../tblock-hold.js';
import { VAULT } from '../economie-pack.js';
import { selecteur } from '../keccak.js';

export function suffixeBuilderCode(code) {
  const hex = Buffer.from(code, 'ascii').toString('hex');
  return hex + code.length.toString(16).padStart(2, '0') + '00' + '8021'.repeat(8);
}
const SFX = suffixeBuilderCode('bc_yjpkqm2o');
/* check against the docs' example: bc_b7k3p9da -> 0x62635f62376b33703964610b0080218021802180218021802180218021 */
const EX = suffixeBuilderCode('bc_b7k3p9da');
console.log('docs example reproduced:', EX === '62635f62376b33703964610b0080218021802180218021802180218021');
console.log('our suffix: 0x' + SFX);

const NODE = 'https://base-rpc.publicnode.com';
const call = async (from, to, data) => { const r = await fetch(NODE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ from, to, data }, 'latest'] }) }); return r.json(); };
const S = (sig) => String(selecteur(sig)).replace(/^0x/, '');
const u = (x) => BigInt(x).toString(16).padStart(64, '0');
const DEAD = '0x000000000000000000000000000000000000dEaD';
const cas = [
  ['TBLOCK approve', '0x1111111111111111111111111111111111111111', TBLOCK, S('approve(address,uint256)') + u(DEAD) + u(1)],
  ['TBLOCK transfer (from the vault, which holds TBLOCK)', VAULT, TBLOCK, S('transfer(address,uint256)') + u(DEAD) + u(1)],
  ['wtCOIN approve', '0x1111111111111111111111111111111111111111', WTCOIN, S('approve(address,uint256)') + u(DEAD) + u(1)],
  ['TBLOCK balanceOf (view)', '0x1111111111111111111111111111111111111111', TBLOCK, S('balanceOf(address)') + u(VAULT)],
];
for (const [nom, from, to, d] of cas) {
  const a = await call(from, to, '0x' + d), b = await call(from, to, '0x' + d + SFX);
  const r = (j) => (j.error ? 'REVERT ' + String(j.error.message).slice(0, 60) : j.result.slice(0, 66));
  console.log(nom.padEnd(52), '| plain:', r(a), '| with suffix:', r(b), '|', JSON.stringify(a.result) === JSON.stringify(b.result) && !a.error === !b.error ? 'SAME' : 'DIFFERENT');
}
