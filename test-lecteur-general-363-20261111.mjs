/* test-lecteur-general-363-20261111.mjs — game363 (prod 15 min after game362: mainnet.base.org 2,170 limits / 1,804 ok — the general reader had
 *   ONE host). The REAL hotesLecteurGeneral is extracted from serveur-web.js and EXECUTED:
 *   - reads at the head (eth_call latest / no tag, eth_blockNumber, eth_getBlockByNumber('latest'), eth_getCode / eth_getBalance latest,
 *     eth_chainId) may use every healthy host (RPC_LIST + the pool-read list, deduplicated, RPC_LIST first);
 *   - everything else keeps RPC_LIST alone: eth_getLogs, receipts and txs by hash, numbered / historical blocks, eth_call with a state override;
 *   - rpcServeurBrut orders that list by the shared health state.
 * NE PROUVE PAS: the prod rate after deploy (measured on /sante.envois after the release). */
import { readFileSync } from 'node:fs';
const SRV = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let ok = 0, ko = 0;
const t = (m, c, x = '') => { if (c) ok++; else { ko++; console.log('KO', m, x); } };
const debut = SRV.indexOf('const METHODES_TETE = new Set(');
const fin = SRV.indexOf('async function rpcServeurBrut(methode, params) {');
const src = SRV.slice(debut, fin);
const L = ['https://mainnet.base.org'], P = ['https://mainnet.base.org', 'https://base.drpc.org', 'https://base-rpc.publicnode.com'];
const h = new Function('RPC_LIST', 'RPC_FAITS_POOL', src + '; return hotesLecteurGeneral;')(L, P);
const large = JSON.stringify(['https://mainnet.base.org', 'https://base.drpc.org', 'https://base-rpc.publicnode.com']), etroit = JSON.stringify(L);
const C = { to: '0x' + '1'.repeat(40), data: '0x18160ddd' };
t('eth_call with no block tag -> every healthy host', JSON.stringify(h('eth_call', [C])) === large);
t('eth_call latest -> every healthy host', JSON.stringify(h('eth_call', [C, 'latest'])) === large);
t('eth_call at a numbered block -> RPC_LIST only (archive)', JSON.stringify(h('eth_call', [C, '0x3540000'])) === etroit);
t('eth_call with a state override -> RPC_LIST only', JSON.stringify(h('eth_call', [C, 'latest', { [C.to]: { code: '0x00' } }])) === etroit);
t('eth_blockNumber / eth_chainId -> every healthy host', JSON.stringify(h('eth_blockNumber', [])) === large && JSON.stringify(h('eth_chainId', [])) === large);
t('eth_getBlockByNumber latest -> wide; numbered -> RPC_LIST', JSON.stringify(h('eth_getBlockByNumber', ['latest', false])) === large && JSON.stringify(h('eth_getBlockByNumber', ['0x100', false])) === etroit);
t('eth_getCode / eth_getBalance latest -> wide', JSON.stringify(h('eth_getCode', [C.to, 'latest'])) === large && JSON.stringify(h('eth_getBalance', [C.to, 'latest'])) === large);
t('eth_getLogs -> RPC_LIST only (multi-address logs)', JSON.stringify(h('eth_getLogs', [{ address: [C.to] }])) === etroit);
t('receipts / tx by hash -> RPC_LIST only (a pruned node answers null)', JSON.stringify(h('eth_getTransactionReceipt', ['0x' + 'a'.repeat(64)])) === etroit && JSON.stringify(h('eth_getTransactionByHash', ['0x' + 'a'.repeat(64)])) === etroit);
t('RPC_LIST first, no duplicate', JSON.parse(large)[0] === L[0] && new Set(JSON.parse(large)).size === JSON.parse(large).length);
t('rpcServeurBrut uses it, ordered by health', SRV.includes('const hotesL = hotesLecteurGeneral(methode, params); /* game363 */') && SRV.includes('const ordreL = SANTE_RPC.ordonner(hotesL, rpcTour, libelleNoeud);'));
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
