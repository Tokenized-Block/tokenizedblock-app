/* test-builder-code-20261115.mjs - the Base Builder Code (ERC-8021) appended by envoi.js.
 * AFFIRME: the suffix reproduces the docs' example byte for byte and ours is bc_yjpkqm2o; it is appended to a call with data and a
 *   destination, never twice, never on empty data (plain ETH), never without a destination (creation); a single send and every call
 *   of a batch reach the wallet with it (fake wallet); the gas estimate is asked WITH it.
 * NE PROUVE PAS: that Base's indexer credits the app (checked on the dashboard after real transactions). Contract tolerance of the
 *   trailing bytes was measured by eth_call on TBLOCK (B20) / wtCOIN (tools/sonde-builder-code.mjs). */
import * as E from './envoi.js';
let ok = 0, ko = 0;
const t = (m, c, v = '') => { if (c) ok++; else { ko++; console.log('KO', m, v); } };
const MARQUE = '8021'.repeat(8);
t('docs example reproduced', E.suffixeBuilderCode('bc_b7k3p9da') === '62635f62376b33703964610b00' + MARQUE);
t('our code', E.BUILDER_CODE === 'bc_yjpkqm2o' && E.suffixeBuilderCode() === '62635f796a706b716d326f0b00' + MARQUE);
const TO = '0x' + '11'.repeat(20), D = '0xa9059cbb' + '00'.repeat(64);
t('appended to a call with data', E.avecBuilderCode(D, TO) === D + E.suffixeBuilderCode());
t('never twice', E.avecBuilderCode(E.avecBuilderCode(D, TO), TO) === D + E.suffixeBuilderCode());
t('another app code already there: left as is', E.avecBuilderCode('0xabcdef01' + MARQUE, TO) === '0xabcdef01' + MARQUE);
t('empty data (plain ETH): unchanged', E.avecBuilderCode('0x', TO) === '0x' && E.avecBuilderCode(undefined, TO) === undefined);
t('no destination (creation): unchanged', E.avecBuilderCode(D, null) === D && E.avecBuilderCode(D, '') === D);
t('odd-length data: unchanged', E.avecBuilderCode('0xabc', TO) === '0xabc');

/* a fake wallet records what it is asked */
const vu = [];
const eth = { request: async ({ method, params }) => {
  vu.push({ method, params });
  if (method === 'eth_chainId') return '0x2105';
  if (method === 'eth_accounts' || method === 'eth_requestAccounts') return ['0x' + 'ab'.repeat(20)];
  if (method === 'eth_sendTransaction') return '0x' + 'cd'.repeat(32);
  if (method === 'wallet_sendCalls') return { id: 'b1' };
  if (method === 'wallet_getCallsStatus') return { status: 200, receipts: [{ transactionHash: '0x' + 'ef'.repeat(32), status: '0x1' }] };
  throw new Error('not modelled ' + method);
} };
const estimes = [];
const rpc = async (m, p) => { if (m === 'eth_estimateGas') { estimes.push(p[0].data); return '0x5208'; } if (m === 'eth_getTransactionReceipt') return { status: '0x1', logs: [] }; return null; };
await E.envoyerDepuisWallet({ eth, rpc, chaineAttendue: 8453, compte: '0x' + 'ab'.repeat(20), to: TO, data: D, attendre: false });
const env = vu.find((x) => x.method === 'eth_sendTransaction');
t('single send: the wallet receives the suffixed data', env && env.params[0].data === D + E.suffixeBuilderCode(), env && env.params[0].data);
t('single send: the gas estimate includes the suffix', estimes[0] === D + E.suffixeBuilderCode());
vu.length = 0;
await E.envoyerLotAtomique({ eth, rpc, chaineAttendue: 8453, compte: '0x' + 'ab'.repeat(20), calls: [{ to: TO, data: D }, { to: TO, data: '0x', value: '0x1' }], attendre: false });
const lot = vu.find((x) => x.method === 'wallet_sendCalls');
t('batch: a call with data carries the suffix, a plain ETH call does not', lot && lot.params[0].calls[0].data === D + E.suffixeBuilderCode() && lot.params[0].calls[1].data === '0x', lot && JSON.stringify(lot.params[0].calls));
t('batch: no capability field added (old wallets could refuse an unknown one)', lot && !('capabilities' in lot.params[0]));
/* game422: the code SHOWN in the app (Who made this, JSON-LD) is the code SENT — a shown code that differs would send people to the wrong project */
const { readFileSync: lireApp } = await import('node:fs');
const APP = lireApp(new URL('./app.html', import.meta.url), 'utf8');
const montre = (APP.match(/id="lBuilderCode"[\s\S]*?<code>(bc_[a-z0-9]+)<\/code>/) || [])[1];
const ld = (APP.match(/"propertyID":"Base Builder Code","value":"(bc_[a-z0-9]+)"/) || [])[1];
t('the app shows its Builder Code next to the founder', !!montre && APP.indexOf('id="lBuilderCode"') > APP.indexOf('id="lFondateur"'));
t('the code shown is the code every send carries (envoi.js BUILDER_CODE)', montre === E.BUILDER_CODE, montre);
t('the JSON-LD names the same code', ld === E.BUILDER_CODE, ld);
console.log(ok + '/' + (ok + ko) + (ko ? ' RED' : ' green'));
process.exit(ko ? 1 : 0);
