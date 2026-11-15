/* test-lp-lock-app-20261115.mjs — lp-lock-app.js against the COMPILED TBlockLPLock, its source, its deploy record, and a fake chain.
 * AFFIRME: every selector exists in the compiled contract (or is the PositionManager / ERC-20 / Permit2 / StateView / vault one); the
 *   address, the PositionManager and the pool key are the record's; the rule constants are the source's; (a) step 1 builds, in order,
 *   only the missing approvals, then the mint (full range, to the wallet) and NOTHING ELSE (no guessed position number, no lock call) —
 *   and refuses (never builds) below MIN_L with the minimum in tokens, on a short balance, or when anything it needs was not read; step 2's
 *   number comes only from a Transfer(0, wallet, id) log EMITTED BY the PositionManager in a successful receipt (same answer as
 *   liquidite.js idsMintesDansRecu); (b) refuses another wallet's / another pool's / a not-full-range position, and in step 2 a liquidity
 *   other than the one added; extend's limit, the markable week and the claim list follow the contract's rules; the log search never reads
 *   before the deploy block; a value not read stays null; a claim week not read is counted, never shown as nothing.
 *   MUTATIONS (run here every time, on a temporary copy of the module): approve of the wrong number, the typed-side cap removed, the lock
 *   for other weeks than chosen, a receipt log from any emitter accepted, the step-2 liquidity check removed — each must turn the checks
 *   red; the copy is deleted afterwards.
 * STEP 0 (2026-11-15): the router / quoter / key / deadline are tblock-route.js's; the swap calldata is tblock-route.js calldataSwapTblock
 *   byte for byte; the hook flags are read from its address; on a fake quoter: exact TBLOCK approvals to Permit2 and Permit2 -> ROUTER,
 *   min = quote - 1%, the split leaves both sides equal in value, 3.00% under the pool price accepted and above refused, the click keeps
 *   the previewed minimum, step 1 after the swap (cote 'deux') stays under both caps. Six more mutants, each red.
 * NE PROUVE PAS: the chain (banc-lp-lock-app-fork-20261115 does, on a local fork); a wallet's atomic batch; the card's DOM. */
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import * as A from './lp-lock-app.js';
import { LP_LOCK_DEPLOIEMENT as REC } from './lp-lock-deploiement.js';
import { REGLE as REGLE_DEPLOI } from './lp-lock.js';
import { WTCOIN, TBLOCK, PERMIT2, POSITION_MANAGER } from './etat-naissance.js';
import { poolId, selecteur as selPool } from './pool.js';
let ok = 0, ko = 0;
const t = (m, c, vu = '') => { if (c) ok++; else { ko++; console.log('KO', m, vu); } };
const art = JSON.parse(readFileSync(new URL('./contracts/out/TBlockLPLock.sol/TBlockLPLock.json', import.meta.url)));
const ids = new Set(Object.values(art.methodIdentifiers || {}));
t('the ABI has method identifiers', ids.size > 40, ids.size);
for (const [k, s] of Object.entries(A.SEL)) t('selector ' + k + ' is in the compiled contract', ids.has(s), s);
const ev = art.abi.find((x) => x.type === 'event' && x.name === 'Locked');
t('Locked event: (address indexed, uint256 indexed, 3 x uint256)', ev && ev.inputs.map((i) => i.type + (i.indexed ? '*' : '')).join() === 'address*,uint256*,uint256,uint256,uint256');
/* external selectors computed by a second keccak implementation (pool.js) */
const ext = { nextTokenId: 'nextTokenId()', ownerOf: 'ownerOf(uint256)', approve: 'approve(address,uint256)', p2Approve: 'approve(address,address,uint160,uint48)', p2Allowance: 'allowance(address,address,address)', getSlot0: 'getSlot0(bytes32)', playOf: 'playOf(uint256,address)', getPoolAndPositionInfo: 'getPoolAndPositionInfo(uint256)' };
for (const [k, sig] of Object.entries(ext)) t('external selector ' + k, A.SEL_EXT[k] === selPool(sig), A.SEL_EXT[k]);
t('playOf is what the lock calls on the vault (ILPVaultPlays in the compiled output)', Object.values(JSON.parse(readFileSync(new URL('./contracts/out/TBlockLPLock.sol/ILPVaultPlays.json', import.meta.url))).methodIdentifiers).includes(A.SEL_EXT.playOf));
/* addresses: the record, never typed */
t('lock = the record address', A.LP_LOCK === String(REC.adresse).toLowerCase() && /^0x[0-9a-f]{40}$/.test(A.LP_LOCK));
t('deploy block = the record', A.LP_LOCK_BLOC === REC.bloc && REC.bloc === 57819604);
t('PositionManager = record = etat-naissance', A.PM === REC.parametres.pm && A.PM === POSITION_MANAGER);
t('wtCOIN / TBLOCK = etat-naissance', A.WTCOIN === WTCOIN && A.TBLOCK === TBLOCK);
t('Permit2 = etat-naissance', A.PERMIT2_ === PERMIT2);
t('pool id = keccak(key)', poolId(A.CLE).toLowerCase() === A.POOL_ID && A.POOL_ID === REC.parametres.poolId);
/* rules: the source and the deploy module */
const src = readFileSync(new URL('./contracts/src/TBlockLPLock.sol', import.meta.url), 'utf8');
const k_ = (n) => { const m = new RegExp('constant ' + n + ' = (\\d+)( days)?;').exec(src); return m ? Number(m[1]) * (m[2] ? 86400 : 1) : null; };
t('rules = the source', A.REGLE.minWeeks === k_('MIN_WEEKS') && A.REGLE.maxWeeks === k_('MAX_WEEKS') && A.REGLE.maxPositions === k_('MAX_POSITIONS') && A.REGLE.markGraceS === k_('MARK_GRACE') && A.REGLE.maxSpanWeeks === k_('MAX_SPAN_WEEKS'));
t('rules = lp-lock.js REGLE', A.REGLE.minWeeks === REGLE_DEPLOI.minWeeks && A.REGLE.maxWeeks === REGLE_DEPLOI.maxWeeks && A.REGLE.maxSpanWeeks === REGLE_DEPLOI.maxSpanWeeks && A.REGLE.markGraceS === REGLE_DEPLOI.markGraceS);

/* calls */
const moi = '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b', w = (x) => BigInt(x).toString(16).padStart(64, '0');
t('lock(7, 4)', A.lockCall(7, 4).to === A.LP_LOCK && A.lockCall(7, 4).data === '0x' + A.SEL.lock + w(7) + w(4) && A.lockCall(7, 4).value === '0x0');
for (const bad of [3, 13, 0]) { let j = false; try { A.lockCall(1, bad); } catch (_) { j = true; } t('lock refused for ' + bad + ' weeks', j); }
t('markWeek(5, me)', A.markWeekCall(5, moi).data === '0x' + A.SEL.markWeek + w(5) + w(moi));
t('claim list sorted, deduplicated', A.claimCalls([4, 2, 4]).map((c) => c.data).join() === [A.claimCall(2).data, A.claimCall(4).data].join());
{ let j = false; try { A.claimCalls([]); } catch (_) { j = true; } t('claim of no week refused', j); }
t('unlock / unlockOnly', A.unlockCall(9).data === '0x' + A.SEL.unlock + w(9) && A.unlockOnlyCall(9).data === '0x' + A.SEL.unlockOnly + w(9));
{ let j = false; try { A.extendCall(9, 0); } catch (_) { j = true; } t('extend by 0 refused', j); }
t('approve NFT goes to the PositionManager, spender = lock', A.approveNftCall(5).to === A.PM && A.approveNftCall(5).data === '0x' + A.SEL_EXT.approve + w(A.LP_LOCK) + w(5));

/* (a) plan, on fake reads (price measured on the fork 2026-11-15: sqrtPriceX96 425067379997598103438208097038988) */
const SQ = 425067379997598103438208097038988n, E18 = 10n ** 18n;
const T0 = 1_799_000_000n, EP_ = 604800n;
const lu = (x = {}) => ({ sqrtPrix: SQ, minL: 2n * 10n ** 19n, lockedCount: 0n, maintenantS: 1_800_000_000n, t0: T0, epochS: EP_,
  soldes: { wtcoin: E18, tblock: 10n ** 24n }, versPermit2: { wtcoin: 0n, tblock: 0n }, permit2: { wtcoin: { montant: 0n, expiration: 0n }, tblock: { montant: 0n, expiration: 0n } }, ...x });
/* a receipt: the PositionManager's own Transfer(0 -> wallet, id), plus look-alikes that must be ignored */
const TR = (adresse, de, a, id) => ({ address: adresse, topics: [A.TOPIC_TRANSFER, '0x' + w(de), '0x' + w(a), '0x' + w(id)], data: '0x' });
const recuMint = (pm, id) => ({ status: '0x1', logs: [TR('0x' + 'a'.repeat(40), 0, moi, 999), TR(pm, 0, '0x' + '1'.repeat(40), 998), TR(pm, '0x' + '2'.repeat(40), moi, 997), TR(pm, 0, moi, id)] });
const NFT_OK = (M, x = {}) => ({ tokenId: 12n, proprietaire: moi, position: decoderPoolEtPosition(info(M.CLE, -887220, 887220)), liquidite: 3n * 10n ** 19n, approuve: '0x' + '0'.repeat(40), toutApprouve: false, minL: 2n * 10n ** 19n, lockedCount: 0n, ...x });
function verifierPlan(M) {
  const f = [];
  const p = M.planAjoutEtLock({ moi, cote: 'wtcoin', montant: 5n * 10n ** 15n, semaines: 4, lu: lu() });
  if (p.etat !== 'PRET') return ['not ready: ' + p.pourquoi];
  if (p.appels.length !== 5) f.push('5 calls when nothing is approved (4 approvals + mint), got ' + p.appels.length);
  if (p.appels.at(-1).to !== M.PM) f.push('step 1 ends with the mint on the PositionManager');
  if (p.appels.some((c) => c.to === M.LP_LOCK)) f.push('step 1 must not call the lock');
  if (p.appels.some((c) => c.to === M.PM && c.data.startsWith('0x' + M.SEL_EXT.approve))) f.push('step 1 must not approve a position number');
  if ('tokenId' in p) f.push('step 1 must not carry a guessed position number');
  if (p.max.wtcoin > 5n * 10n ** 15n) f.push('the typed side max exceeds the typed amount');
  const p2 = M.planAjoutEtLock({ moi, cote: 'wtcoin', montant: 5n * 10n ** 15n, semaines: 4, lu: lu({ soldes: { wtcoin: 5n * 10n ** 15n, tblock: 10n ** 24n } }) });
  if (p2.etat !== 'PRET') f.push('the whole balance typed must fit: ' + p2.pourquoi);
  /* step 2: the number from the receipt, then approve + lock of THAT number for the chosen weeks */
  const ids = M.positionsDuRecu([recuMint(M.PM, 3224073n)], moi);
  if (ids.length !== 1 || ids[0] !== 3224073n) f.push('receipt: only the PositionManager mint to this wallet, got ' + ids.join());
  if (M.positionsDuRecu([{ ...recuMint(M.PM, 5n), status: '0x0' }], moi).length) f.push('receipt: a failed receipt gives no number');
  const pb = M.planLockExistant({ moi, tokenId: 12n, semaines: 6, nft: NFT_OK(M) });
  if (pb.etat !== 'PRET' || pb.appels.length !== 2) f.push('(b) approve + lock');
  else {
    if (pb.appels[0].data !== M.approveNftCall(12n).data) f.push('(b) approve(lock, 12)');
    if (pb.appels[1].data !== M.lockCall(12n, 6).data) f.push('(b) lock(12, 6)');
  }
  if (M.planLockExistant({ moi, tokenId: 12n, semaines: 6, nft: NFT_OK(M), liquiditeAttendue: 3n * 10n ** 19n + 1n }).etat !== 'REFUSE') f.push('step 2: another liquidity than the one added is refused');
  return f;
}
const { decoderPoolEtPosition } = await import('./pool.js');
const info = (cle, lo, hi) => '0x' + w(cle.currency0) + w(cle.currency1) + w(cle.fee) + w(cle.tickSpacing) + w(cle.hooks) + w((BigInt.asUintN(24, BigInt(hi)) << 32n) | (BigInt.asUintN(24, BigInt(lo)) << 8n));
t('the module passes the plan checks', verifierPlan(A).length === 0, verifierPlan(A).join('; '));
const p = A.planAjoutEtLock({ moi, cote: 'wtcoin', montant: 5n * 10n ** 15n, semaines: 4, lu: lu() });
t('mint calldata names the wallet, L, both maxima and the full range', p.appels[4].data.includes(w(moi)) && p.appels[4].data.includes(w(p.liquidite)) && p.appels[4].data.includes(w(p.max.wtcoin)) && p.appels[4].data.includes(w(p.max.tblock)) && p.appels[4].data.includes(BigInt.asUintN(256, -887220n).toString(16)));
t('ERC-20 approvals to Permit2 of the exact maxima', p.appels[0].to === A.WTCOIN && p.appels[0].data === '0x' + A.SEL_EXT.approve + w(PERMIT2) + w(p.max.wtcoin) && p.appels[1].to === A.TBLOCK && p.appels[1].data.endsWith(w(p.max.tblock)));
t('Permit2 approvals for one hour', p.appels[2].to === A.PERMIT2_ && p.appels[2].data === '0x' + A.SEL_EXT.p2Approve + w(A.WTCOIN) + w(A.PM) + w(p.max.wtcoin) + w(1_800_000_000n + 3600n));
t('L >= MIN_L and maxima 1% over the need', p.liquidite >= 2n * 10n ** 19n && p.max.tblock > p.besoin.tblock && p.max.tblock <= (p.besoin.tblock * 102n) / 100n);
t('atomic, step texts in English, no position number in them', p.atomique === true && p.etapes.length === 5 && /your own wallet/.test(p.etapes[4]) && !p.etapes.some((x) => /#\d/.test(x)));
{ const c = (1_800_000_000n - T0) / EP_; t('step 1 says when a lock made now would end: epochEnd(current) + weeks', p.premiereSemaine === c + 1n && p.retourS === T0 + (c + 1n + 4n) * EP_, String(p.retourS)); }
t('chain week not read: no date, still ready', (() => { const q = A.planAjoutEtLock({ moi, cote: 'wtcoin', montant: 5n * 10n ** 15n, semaines: 4, lu: lu({ t0: null }) }); return q.etat === 'PRET' && q.retourS === null; })());
const deja = lu({ versPermit2: { wtcoin: E18, tblock: 10n ** 24n }, permit2: { wtcoin: { montant: E18, expiration: 1_800_000_000n + 601n }, tblock: { montant: 10n ** 24n, expiration: 1_800_000_000n + 601n } } });
t('approvals already there: only the mint', A.planAjoutEtLock({ moi, cote: 'wtcoin', montant: 5n * 10n ** 15n, semaines: 4, lu: deja }).appels.length === 1);
const expire = lu({ ...deja, permit2: { wtcoin: { montant: E18, expiration: 1_800_000_000n + 599n }, tblock: deja.permit2.tblock } });
t('a Permit2 allowance ending within 10 minutes is renewed', A.planAjoutEtLock({ moi, cote: 'wtcoin', montant: 5n * 10n ** 15n, semaines: 4, lu: expire }).appels.length === 2);
const petit = A.planAjoutEtLock({ moi, cote: 'wtcoin', montant: 10n ** 15n, semaines: 4, lu: lu() });
t('below MIN_L: refused, with the minimum in both tokens', petit.etat === 'REFUSE' && !petit.appels && petit.minimum && petit.minimum.wtcoin > 10n ** 15n && petit.minimum.tblock > 0n, JSON.stringify(petit, (k, v) => (typeof v === 'bigint' ? v.toString() : v)));
const mini = A.minimumEnJetons({ sqrtPrix: SQ, minL: 2n * 10n ** 19n, glissementPct: 1 });
t('the minimum typed is accepted, one unit less is not', A.planAjoutEtLock({ moi, cote: 'wtcoin', montant: mini.wtcoin + 2n, semaines: 4, lu: lu() }).etat === 'PRET' && A.planAjoutEtLock({ moi, cote: 'wtcoin', montant: mini.wtcoin - 3n, semaines: 4, lu: lu() }).etat === 'REFUSE');
t('the TBLOCK side works too', A.planAjoutEtLock({ moi, cote: 'tblock', montant: 2n * 10n ** 23n, semaines: 12, lu: lu() }).etat === 'PRET');
const court = A.planAjoutEtLock({ moi, cote: 'wtcoin', montant: 5n * 10n ** 15n, semaines: 4, lu: lu({ soldes: { wtcoin: E18, tblock: 10n } }) });
t('short TBLOCK: refused, the shortfall said', court.etat === 'REFUSE' && court.manque && court.manque.tblock > 0n && !court.manque.wtcoin);
for (const [k, v] of [['sqrtPrix', null], ['minL', null], ['maintenantS', null], ['soldes', { wtcoin: null, tblock: 1n }], ['versPermit2', { wtcoin: null, tblock: 0n }], ['permit2', { wtcoin: null, tblock: null }]]) {
  const r = A.planAjoutEtLock({ moi, cote: 'wtcoin', montant: 5n * 10n ** 15n, semaines: 4, lu: lu({ [k]: v }) });
  t('not read ' + k + ': NON_LU, nothing built', r.etat === 'NON_LU' && !r.appels, r.etat);
}
t('ten positions already locked: refused', A.planAjoutEtLock({ moi, cote: 'wtcoin', montant: 5n * 10n ** 15n, semaines: 4, lu: lu({ lockedCount: 10n }) }).etat === 'REFUSE');
t('3 weeks refused', A.planAjoutEtLock({ moi, cote: 'wtcoin', montant: 5n * 10n ** 15n, semaines: 3, lu: lu() }).etat === 'REFUSE');
t('no wallet refused', A.planAjoutEtLock({ moi: null, cote: 'wtcoin', montant: 5n * 10n ** 15n, semaines: 4, lu: lu() }).etat === 'REFUSE');

/* lireAjout: no position number is read for step 1 (step 2 reads it from the receipt) */
{
  const ordre = [];
  const rpc = async (m, params) => {
    if (m === 'eth_getBlockByNumber') { ordre.push('block'); return { timestamp: '0x' + (1_800_000_000).toString(16), number: '0x1' }; }
    const c = params[0], s = c.data.slice(2, 10); ordre.push(s);
    if (s === A.SEL_EXT.getSlot0) return '0x' + w(SQ) + w(0) + w(0) + w(3000);
    if (s === A.SEL_EXT.p2Allowance) return '0x' + w(5) + w(9) + w(0);
    if (s === A.SEL.MIN_L) return '0x' + w(2n * 10n ** 19n);
    if (s === A.SEL.T0) return '0x' + w(T0);
    if (s === A.SEL.EPOCH) return '0x' + w(EP_);
    if (s === A.SEL_EXT.balanceOf && c.to === A.TBLOCK) throw new Error('node down');
    return '0x' + w(1);
  };
  const l = await A.lireAjout({ rpc, moi });
  t('lireAjout: nextTokenId is never read (no guessed number)', !ordre.includes(A.SEL_EXT.nextTokenId) && !('nextTokenId' in l), ordre.join(','));
  t('lireAjout: T0 and EPOCH read for the dates', l.t0 === T0 && l.epochS === EP_);
  t('lireAjout: a balance not read is null, never 0', l.soldes.tblock === null && l.soldes.wtcoin === 1n);
  t('lireAjout: Permit2 amount and expiration', l.permit2.wtcoin.montant === 5n && l.permit2.wtcoin.expiration === 9n);
  t('lireAjout -> plan: a balance not read builds nothing', A.planAjoutEtLock({ moi, cote: 'wtcoin', montant: 5n * 10n ** 15n, semaines: 4, lu: l }).etat === 'NON_LU');
}

/* step 2's number: from the receipt only (the PositionManager's own Transfer(0 -> wallet, id)) */
{
  const { idsMintesDansRecu } = await import('./liquidite.js');
  const r = recuMint(A.PM, 4242n);
  t('receipt: the PositionManager mint to this wallet only (not another emitter, not to someone else, not a plain transfer)', A.positionsDuRecu([r], moi).join() === '4242');
  t('receipt: same answer as liquidite.js idsMintesDansRecu (the older twin)', idsMintesDansRecu({ recu: r, chaine: 8453, compte: moi }).join() === A.positionsDuRecu([r], moi).join());
  t('receipt: a reverted receipt gives no number', A.positionsDuRecu([{ ...r, status: '0x0' }], moi).length === 0);
  t('receipt: two receipts, two mints: both, sorted', A.positionsDuRecu([recuMint(A.PM, 9n), r], moi).join() === '9,4242');
  const vus = [];
  const rpcR = async (m, [h]) => { vus.push(h); if (h === '0x' + '1'.repeat(64)) return r; if (h === '0x' + '2'.repeat(64)) throw new Error('node down'); return null; };
  const lp = await A.lirePositionMintee({ rpc: rpcR, hashes: ['0x' + '1'.repeat(64), '0x' + '1'.repeat(64), 'nope'], moi });
  t('lirePositionMintee: reads each valid hash once, finds the number', lp.ids.join() === '4242' && lp.lus === 1 && vus.length === 1);
  const ln = await A.lirePositionMintee({ rpc: rpcR, hashes: ['0x' + '2'.repeat(64)], moi });
  t('lirePositionMintee: a receipt not read says lus 0 (never "no position")', ln.lus === 0 && ln.ids.length === 0);
}
t('estRevert: a revert is a revert, an outage is not', A.estRevert(new Error('execution reverted: NotLocked')) && A.estRevert({ code: 3, message: 'x' }) && !A.estRevert(new Error('HTTP 429 on https://x')) && !A.estRevert(new Error('RPC unreachable on all nodes')));

/* (b) a held position */
const nftOk ={ tokenId: 12n, proprietaire: moi, position: decoderPoolEtPosition(info(A.CLE, -887220, 887220)), liquidite: 3n * 10n ** 19n, approuve: '0x' + '0'.repeat(40), toutApprouve: false, minL: 2n * 10n ** 19n, lockedCount: 0n };
const pb = A.planLockExistant({ moi, tokenId: 12n, semaines: 6, nft: nftOk });
t('(b) approve + lock(12, 6)', pb.etat === 'PRET' && pb.appels.length === 2 && pb.appels[1].data === A.lockCall(12n, 6).data);
t('(b) already approved: lock only', A.planLockExistant({ moi, tokenId: 12n, semaines: 6, nft: { ...nftOk, approuve: A.LP_LOCK } }).appels.length === 1);
t('(b) another wallet: refused', A.planLockExistant({ moi, tokenId: 12n, semaines: 6, nft: { ...nftOk, proprietaire: '0x' + '1'.repeat(40) } }).etat === 'REFUSE');
t('(b) not full range: refused', A.planLockExistant({ moi, tokenId: 12n, semaines: 6, nft: { ...nftOk, position: decoderPoolEtPosition(info(A.CLE, -887160, 887220)) } }).etat === 'REFUSE');
t('(b) another pool: refused', A.planLockExistant({ moi, tokenId: 12n, semaines: 6, nft: { ...nftOk, position: decoderPoolEtPosition(info({ ...A.CLE, fee: 500 }, -887220, 887220)) } }).etat === 'REFUSE');
t('(b) below MIN_L: refused', A.planLockExistant({ moi, tokenId: 12n, semaines: 6, nft: { ...nftOk, liquidite: 2n * 10n ** 19n - 1n } }).etat === 'REFUSE');
t('step 2: the liquidity just added is accepted, another is refused', A.planLockExistant({ moi, tokenId: 12n, semaines: 6, nft: nftOk, liquiditeAttendue: 3n * 10n ** 19n }).etat === 'PRET' && A.planLockExistant({ moi, tokenId: 12n, semaines: 6, nft: nftOk, liquiditeAttendue: 1n }).etat === 'REFUSE');
t('(b) owner not read: NON_LU',A.planLockExistant({ moi, tokenId: 12n, semaines: 6, nft: { ...nftOk, proprietaire: null } }).etat === 'NON_LU');

/* extend limit: brute force against the contract rule (newEnd - (cur+1) <= 12, newEnd - start <= 26, before the lock ends) */
for (let cur = 0n; cur < 30n; cur += 3n) for (let s = 1n; s < 8n; s++) for (let e = s + 4n; e <= s + 26n; e += 2n) {
  let ref = 0n; for (let a = 1n; a < 40n; a++) if (e + a - (cur + 1n) <= 12n && e + a - s <= 26n) ref = a;
  const got = A.extensionMax({ courant: cur, debut: s, fin: e, maintenantS: 0n, unlockAt: 1n });
  if (got !== ref) { t('extensionMax cur=' + cur + ' [' + s + ',' + e + ')', false, got + ' vs ' + ref); }
}
t('extensionMax table (brute force) checked', true);
t('extensionMax 0 once the lock ended', A.extensionMax({ courant: 1n, debut: 2n, fin: 6n, maintenantS: 100n, unlockAt: 100n }) === 0n);
/* markable week: [end, end + 6 days) */
t('markable at the week end', A.semaineMarquable({ courant: 5n, finPrecedente: 1000n, maintenantS: 1000n }) === 4n);
t('markable 1 s before the grace ends', A.semaineMarquable({ courant: 5n, finPrecedente: 1000n, maintenantS: 1000n + 518399n }) === 4n);
t('not markable at the grace end', A.semaineMarquable({ courant: 5n, finPrecedente: 1000n, maintenantS: 1000n + 518400n }) === null);
t('week 0: nothing to mark', A.semaineMarquable({ courant: 0n, finPrecedente: null, maintenantS: 5n }) === null);
for (const liquidite of [0n, 5n]) for (const joue of [0n, 3n]) for (const poids of [0n, 7n]) {
  const s = A.etatMarquage({ liquidite, joue, poids });
  t('etatMarquage ' + [liquidite, joue, poids], (s.action === 'mark') === (liquidite > 0n && joue > 0n && poids === 0n), JSON.stringify(s));
}
t('etatMarquage: a value not read offers nothing', A.etatMarquage({ liquidite: null, joue: 1n, poids: 0n }).action === null);

/* log search: windows back from the head, never before the deploy block, topic = Locked + the wallet */
{
  const vus = [];
  const rpc = async (m, [f]) => { vus.push(f); return parseInt(f.fromBlock, 16) <= A.LP_LOCK_BLOC + 10 ? [{ topics: [A.TOPIC_LOCKED, '0x' + w(moi), '0x' + w(41)] }] : []; };
  const r = await A.idsVerrouilles({ rpc, moi, tete: A.LP_LOCK_BLOC + 100000, pas: 45000, fenetres: 9, candidats: [7] });
  t('logs: three windows reach the deploy block, then stop', vus.length === 3 && parseInt(vus[2].fromBlock, 16) === A.LP_LOCK_BLOC && r.depuisLeDebut === true, vus.map((x) => x.fromBlock).join());
  t('logs: every window <= 45,000 blocks', vus.every((f) => parseInt(f.toBlock, 16) - parseInt(f.fromBlock, 16) + 1 <= 45000));
  t('logs: filter on the lock, Locked, this wallet', vus.every((f) => f.address === A.LP_LOCK && f.topics[0] === A.TOPIC_LOCKED && f.topics[1] === '0x' + w(moi)));
  t('logs: ids = the logged one + the hint', r.ids.map(String).sort().join() === '41,7');
  const vus2 = []; const r2 = await A.idsVerrouilles({ rpc: async (m, [f]) => { vus2.push(f); return []; }, moi, tete: A.LP_LOCK_BLOC + 10000000, fenetres: 2 });
  t('logs: a capped search says it did not reach the start', vus2.length === 2 && r2.depuisLeDebut === false);
}

/* lireEtat on a fake chain: one position found by the logs, one hint that is someone else's, a week to count, one week to claim */
{
  const V = '0x' + '5'.repeat(40);
  const NOW = 2_000_000n, FINP = NOW - 100n;
  const pos = { 41n: [moi, 3n * 10n ** 19n, 4n, 8n], 7n: ['0x' + '9'.repeat(40), 1n, 1n, 5n] };
  let ouvre = null; /* null: the position is not open yet; 'OK' / 'REVERT' / 'DOWN': what eth_call unlock(41) from the wallet answers */
  const rpc = async (m, params) => {
    if (m === 'eth_getBlockByNumber') return params[0] === 'latest' ? { timestamp: '0x' + NOW.toString(16), number: '0x' + (A.LP_LOCK_BLOC + 50).toString(16) } : { timestamp: '0x' + (NOW - 3n * 604800n).toString(16) };
    if (m === 'eth_call' && params[0].data.slice(2, 10) === A.SEL.unlock) {
      if (params[0].from !== moi) throw new Error('unlock simulated from another sender');
      if (ouvre === 'OK') return '0x'; if (ouvre === 'REVERT') { const e = new Error('execution reverted'); e.code = 3; throw e; } throw new Error('HTTP 429 on node');
    }
    if (m === 'eth_call' && params[0].data.slice(2, 10) === A.SEL.claimable && BigInt('0x' + params[0].data.slice(74, 138)) === 2n) throw new Error('HTTP 429 on node');
    if (m === 'eth_call' && params[0].data.slice(2, 10) === A.SEL_EXT.balanceOf) return '0x' + w(params[0].to === A.WTCOIN ? 0 : 7);
    if (m === 'eth_call' && params[0].data.slice(2, 10) === A.SEL.rolledOver) return '0x' + w(1);
    if (m === 'eth_call' && params[0].data.slice(2, 10) === A.SEL.unlockAtOf && ouvre !== null) return '0x' + w(NOW - 10n);
    if (m === 'eth_getLogs') return [{ topics: [A.TOPIC_LOCKED, '0x' + w(moi), '0x' + w(41)] }];
    const c = params[0], s = c.data.slice(2, 10), a1 = c.data.length >= 74 ? BigInt('0x' + c.data.slice(10, 74)) : null, a2 = c.data.length >= 138 ? BigInt('0x' + c.data.slice(74, 138)) : null;
    if (s === A.SEL.currentEpoch) return '0x' + w(5);
    if (s === A.SEL.epochEnd) return '0x' + w(a1 === 4n ? FINP : FINP + 604800n * (a1 - 4n));
    if (s === A.SEL.MIN_L) return '0x' + w(2n * 10n ** 19n);
    if (s === A.SEL.lockedCount) return '0x' + w(1);
    if (s === A.SEL.VAULT) return '0x' + w(V);
    if (s === A.SEL.T0) return '0x' + w(NOW - 5n * 604800n - 50n);
    if (s === A.SEL.EPOCH) return '0x' + w(604800);
    if (s === A.SEL.positionOf) return '0x' + pos[a1].map(w).join('');
    if (s === A.SEL.unlockAtOf) return '0x' + w(NOW + 3n * 604800n);
    if (s === A.SEL.lockedLiquidityIn) return '0x' + w(3n * 10n ** 19n);
    if (s === A.SEL.weightOf) return '0x' + w(0);
    if (s === A.SEL_EXT.playOf) return '0x' + w(a1 === 4n ? 9 : 0);
    if (s === A.SEL.claimable) return '0x' + w(a2 === 3n ? 11 : 0) + w(a2 === 3n ? 22 : 0);
    if (s === A.SEL.pot) throw new Error('node down');
    if (s === A.SEL.totalWeight) return '0x' + w(123);
    if (s === A.SEL_EXT.getSlot0) return '0x' + w(SQ) + w(0) + w(0) + w(0);
    throw new Error('not modelled ' + s);
  };
  const E = await A.lireEtat({ rpc, moi });
  t('lireEtat: the logged position, not the other wallet\'s hint', E.positions.length === 1 && E.positions[0].tokenId === 41n && E.introuvables === 0);
  t('lireEtat: open later, extendable, amounts at the price', E.positions[0].ouvert === false && E.positions[0].extensionMax === A.extensionMax({ courant: 5n, debut: 4n, fin: 8n, maintenantS: NOW, unlockAt: NOW + 3n * 604800n }) && E.positions[0].montants.wtcoin > 0n);
  t('lireEtat: last week markable (played, not counted)', E.marquage && E.marquage.semaine === 4n && E.marquage.action === 'mark');
  t('lireEtat: claimable weeks from the deploy week only', E.aReclamer.length === 1 && E.aReclamer[0].semaine === 3n && E.aReclamer[0].tblock === 22n);
  t('lireEtat: a pot not read is null, never 0', E.pots.courant === null && E.pots.precedent === null && E.pots.poidsPrecedent === 123n);
  t('lireEtat: a claim week whose read failed is counted, not hidden', E.reclamerNonLues === 1, E.reclamerNonLues);
  t('lireEtat: balances read (0 wtCOIN stays 0, it was read)', E.soldes.wtcoin === 0n && E.soldes.tblock === 7n);
  t('lireEtat: last week rolled over, read', E.pots.reportePrecedent === true);
  t('lireEtat: not open yet: no take-back check', E.positions[0].reprise === null);
  for (const [o, attendu] of [['OK', 'OK'], ['REVERT', 'REVERT'], ['DOWN', null]]) {
    ouvre = o;
    const Eo = await A.lireEtat({ rpc, moi });
    t('lireEtat: open, unlock simulated from the wallet answers ' + o + ' -> ' + attendu, Eo.positions[0].ouvert === true && Eo.positions[0].reprise === attendu, Eo.positions[0].reprise);
  }
}

/* ── step 0 (2026-11-15): a wallet with TBLOCK only swaps part of it for wtCOIN on the same pool, then adds (cote 'deux'), then locks ── */
const R = await import('./tblock-route.js');
t('step 0 router = tblock-route.js UNIVERSAL_ROUTER (the app\'s v4 path)', A.ROUTEUR_ === R.UNIVERSAL_ROUTER && /^0x[0-9a-f]{40}$/.test(A.ROUTEUR_));
t('step 0 quoter = tblock-route.js QUOTER_V4', A.QUOTEUR_ === R.QUOTER_V4 && /^0x[0-9a-f]{40}$/.test(A.QUOTEUR_));
t('step 0 key = tblock-route.js TBLOCK_KEY = the lock\'s pool', poolId(R.TBLOCK_KEY).toLowerCase() === A.POOL_ID && JSON.stringify(R.TBLOCK_KEY) === JSON.stringify(A.CLE));
t('step 0 deadline = tblock-route.js DEADLINE_S', A.DELAI_ECHANGE_S === R.DEADLINE_S);
t('hook read from its address: no beforeSwap, a cut on the output (= tblock-route verifierCleTblock), no add-liquidity flag',
  A.HOOK.bloqueEchange === false && A.HOOK.prendSurSortie === true && R.verifierCleTblock().prendSurSortie === true && A.HOOK.toucheAjout === false && A.HOOK_FLAGS === 0x2044n);
{
  const a = A.echangeCall({ montant: 123n * E18, sortieMin: 456n, deadline: 789n }), b = R.calldataSwapTblock({ entree: A.TBLOCK, montant: 123n * E18, min: 456n, deadline: 789n });
  t('swap calldata = tblock-route.js calldataSwapTblock, byte for byte (TBLOCK in, wtCOIN out)', a.to === b.to && a.data === b.data && a.value === '0x0' && b.zeroForOne === false);
  let j = 0; for (const x of [[0n, 1n], [1n, 0n]]) { try { A.echangeCall({ montant: x[0], sortieMin: x[1], deadline: 1n }); } catch (_) { j++; } }
  t('swap with no amount or no minimum: refused', j === 2);
}
/* a fake chain whose quoter answers the pool price less `coutBps` (the fee and hook cut), linear */
const NOWE = 1_800_000_000n;
function chaineE({ wt = 0n, tb = 10n ** 24n, coutBps = 130n, deja = false, quoteur = null } = {}) {
  const vus = { devis: [] };
  const rpc = async (m, params) => {
    if (m === 'eth_getBlockByNumber') return { timestamp: '0x' + NOWE.toString(16), number: '0x1' };
    const c = params[0], s = c.data.slice(2, 10);
    if (c.to === A.QUOTEUR_) {
      const mt = BigInt('0x' + c.data.slice(10 + 64 * 7, 10 + 64 * 8)); vus.devis.push(mt);
      if (c.data.slice(10 + 64 * 6, 10 + 64 * 7) !== w(0)) throw new Error('quote asked in the wrong direction');
      if (quoteur) return quoteur(mt);
      return '0x' + w((A.wtcoinPourTblock(mt, SQ) * (10000n - coutBps)) / 10000n) + w(90000);
    }
    if (s === A.SEL_EXT.getSlot0) return '0x' + w(SQ) + w(0) + w(0) + w(3000);
    if (s === A.SEL.MIN_L) return '0x' + w(2n * 10n ** 19n);
    if (s === A.SEL.T0) return '0x' + w(T0);
    if (s === A.SEL.EPOCH) return '0x' + w(EP_);
    if (s === A.SEL.lockedCount) return '0x' + w(0);
    if (s === A.SEL_EXT.balanceOf) return '0x' + w(c.to === A.WTCOIN ? wt : tb);
    if (s === A.SEL_EXT.allowance) return '0x' + w(deja ? 10n ** 30n : 0);
    if (s === A.SEL_EXT.p2Allowance) return '0x' + w(deja ? 10n ** 30n : 0) + w(deja ? NOWE + 3000n : 0) + w(0);
    throw new Error('not modelled ' + s);
  };
  return { rpc, vus };
}
const TOT = 3n * 10n ** 23n; /* 300,000 TBLOCK, about twice the smallest position's TBLOCK side */
async function verifierEchange(M) {
  const f = [];
  const { rpc, vus } = chaineE();
  const p = await M.planifierEchangePourAjout({ rpc, moi, total: TOT });
  if (p.etat !== 'PRET') return ['step 0 not ready: ' + p.pourquoi];
  const s = p.echange, q = p.devis;
  if (vus.devis.length !== 3) f.push('3 quotes (guess, 2 refinements) + 0 more, got ' + vus.devis.length);
  if (p.appels.length !== 3) f.push('3 calls with no allowance: TBLOCK->Permit2, Permit2->router, swap; got ' + p.appels.length);
  else {
    if (p.appels[0].to !== M.TBLOCK || p.appels[0].data !== '0x' + M.SEL_EXT.approve + w(PERMIT2) + w(s)) f.push('TBLOCK approves Permit2 for exactly the swap');
    if (p.appels[1].to !== M.PERMIT2_ || p.appels[1].data !== '0x' + M.SEL_EXT.p2Approve + w(M.TBLOCK) + w(M.ROUTEUR_) + w(s) + w(NOWE + 3600n)) f.push('Permit2 lets the ROUTER take exactly the swap, one hour');
    if (p.appels[2].to !== M.ROUTEUR_ || p.appels[2].data !== R.calldataSwapTblock({ entree: M.TBLOCK, montant: s, min: (q * 9900n) / 10000n, deadline: NOWE + 600n }).data) f.push('the swap = tblock-route calldata, min = quote - 1%, deadline + 600 s');
  }
  if (p.sortieMin !== (q * 9900n) / 10000n) f.push('min out = quote less 1%');
  if (q !== (M.wtcoinPourTblock(s, SQ) * 9870n) / 10000n) f.push('the quote shown is the quote read for the amount swapped');
  if (p.impactBps !== 130n) f.push('impact 1.30% read from the quote, got ' + p.impactBps);
  /* balanced: what stays and the wtCOIN after the swap are equal in value at the pool price (within 0.05% of the total) */
  const ecart = (TOT - s) - M.tblockPourWtcoin(q, SQ);
  if ((ecart < 0n ? -ecart : ecart) * 10000n > TOT * 5n) f.push('both sides equal in value after the swap, off by ' + ecart);
  if (!(s * 100n > TOT * 49n && s * 100n < TOT * 51n)) f.push('about half swapped, got ' + s);
  if (!p.ajoutPrevu || p.ajoutPrevu.liquidite < 2n * 10n ** 19n || p.ajoutPrevu.max.tblock > TOT - s || p.ajoutPrevu.max.wtcoin > p.sortieMin) f.push('step 1 fits the TBLOCK left and the minimum out, above MIN_L');
  /* the bound */
  const lu0 = await M.lireEchange({ rpc, moi });
  const mid = M.wtcoinPourTblock(s, SQ);
  const a300 = M.planEchangePourAjout({ moi, total: TOT, lu: lu0, devis: { echange: s, sortie: mid - (mid * 300n) / 10000n } });
  const a301 = M.planEchangePourAjout({ moi, total: TOT, lu: lu0, devis: { echange: s, sortie: mid - (mid * 301n + 9999n) / 10000n } });
  if (a300.etat !== 'PRET') f.push('3.00% under the pool price is accepted: ' + a300.pourquoi);
  if (a301.etat !== 'REFUSE' || !(a301.impactBps > 300n) || a301.appels) f.push('above 3% under the pool price: refused, nothing built');
  if (M.planEchangePourAjout({ moi, total: TOT, lu: lu0, devis: { echange: s, sortie: mid + mid / 500n } }).etat !== 'REFUSE') f.push('a quote above the pool price is refused');
  /* the click: the previewed minimum is kept; a fresh quote under it is refused */
  const imp = M.planEchangePourAjout({ moi, total: TOT, lu: lu0, devis: { echange: s, sortie: q }, sortieMinImposee: p.sortieMin });
  if (imp.etat !== 'PRET' || imp.sortieMin !== p.sortieMin) f.push('the click keeps the previewed minimum');
  if (M.planEchangePourAjout({ moi, total: TOT, lu: lu0, devis: { echange: s, sortie: p.sortieMin - 1n }, sortieMinImposee: p.sortieMin }).etat !== 'REFUSE') f.push('a fresh quote under the previewed minimum is refused');
  /* step 1 after the swap: cote 'deux' fits under both caps, never above */
  const caps = { wtcoin: p.sortieMin, tblock: TOT - s };
  const a = M.planAjoutEtLock({ moi, cote: 'deux', montant: caps, semaines: 4, lu: lu({ soldes: { wtcoin: caps.wtcoin, tblock: caps.tblock } }) });
  if (a.etat !== 'PRET') f.push('step 1 after the swap ready: ' + a.pourquoi);
  else {
    if (a.max.wtcoin > caps.wtcoin || a.max.tblock > caps.tblock) f.push('step 1 maxima under both caps');
    if (a.besoin.wtcoin > a.max.wtcoin || a.besoin.tblock > a.max.tblock) f.push('step 1 maxima cover the need');
    if (a.appels.at(-1).to !== M.PM || a.appels.length !== 5) f.push('step 1 = 4 approvals + the mint');
    /* the leftover of the scarcer side is the 1% margin only (plus rounding) */
    const resteW = caps.wtcoin - a.besoin.wtcoin, resteT = caps.tblock - a.besoin.tblock;
    if (resteW * 100n > caps.wtcoin * 2n && resteT * 100n > caps.tblock * 2n) f.push('step 1 leaves at most ~1% of the scarcer side');
  }
  /* REVIEW 2026-11-15 */
  /* the click: a fresh quote ABOVE the preview's raises the minimum (never looser than a fresh quote less 1%) */
  const mieux = q + q / 200n;
  const imp2 = M.planEchangePourAjout({ moi, total: TOT, lu: lu0, devis: { echange: s, sortie: mieux }, sortieMinImposee: p.sortieMin });
  if (imp2.etat !== 'PRET' || imp2.sortieMin !== (mieux * 9900n) / 10000n || !(imp2.sortieMin > p.sortieMin)) f.push('a better fresh quote raises the minimum to it less 1%: ' + (imp2.sortieMin || imp2.pourquoi));
  /* step 1 after the swap, 0 wtCOIN read (a node behind the receipt): said so, not "type an amount" */
  const zero = M.planAjoutEtLock({ moi, cote: 'deux', montant: { wtcoin: 0n, tblock: TOT - s }, semaines: 4, lu: lu() });
  if (zero.etat !== 'REFUSE' || zero.attendreSolde !== true || !/not read in your wallet yet/.test(zero.pourquoi) || /Type an amount/.test(zero.pourquoi)) f.push('0 wtCOIN after the swap: "not read yet", got ' + zero.pourquoi);
  /* the TBLOCK-only minimum, from the swap return read in the quote */
  const r = M.rendementPpm({ montant: s, sortie: q, sqrtPrix: SQ });
  const Tm = M.minimumTblockSeul({ sqrtPrix: SQ, minL: lu0.minL, wtcoinDeja: lu0.soldes.wtcoin, rendementPpm: r });
  const mini = M.minimumEnJetons({ sqrtPrix: SQ, minL: lu0.minL });
  if (Tm === null || !(Tm > 2n * mini.tblock) || !(Tm * 100n < mini.tblock * 210n)) f.push('TBLOCK-only minimum a bit above twice the TBLOCK minimum (swap cost ~1.3% + 1% margin): ' + Tm + ' vs ' + mini.tblock);
  else {
    const okTm = await M.planifierEchangePourAjout({ rpc, moi, total: Tm });
    if (okTm.etat !== 'PRET') f.push('choosing the TBLOCK-only minimum: step 0 ready, got ' + okTm.pourquoi);
    const sous = await M.planifierEchangePourAjout({ rpc, moi, total: (Tm * 98n) / 100n });
    if (sous.etat !== 'REFUSE' || !sous.minimumTblockSeul) f.push('2% under it: refused WITH the TBLOCK-only minimum, got ' + sous.etat);
    else { const e = sous.minimumTblockSeul - Tm; if ((e < 0n ? -e : e) * 100n > Tm) f.push('the refusal\'s figure is that minimum within 1%: ' + sous.minimumTblockSeul + ' vs ' + Tm); }
  }
  return f;
}
{
  const f = await verifierEchange(A);
  t('the module passes the step 0 checks', f.length === 0, f.join('; '));
  const { rpc } = chaineE();
  const p = await A.planifierEchangePourAjout({ rpc, moi, total: TOT });
  t('step 0 texts in English, no jargon', p.etapes.length === 3 && /Permit2/.test(p.etapes[0]) && /wtCOIN\/TBLOCK pool/.test(p.etapes[2]));
  /* a wallet that already holds some wtCOIN swaps less; one that holds enough swaps nothing */
  const demi = await A.planifierEchangePourAjout({ rpc: chaineE({ wt: p.sortieMin / 2n }).rpc, moi, total: TOT });
  t('some wtCOIN held: a smaller swap', demi.etat === 'PRET' && demi.echange < p.echange && demi.echange > 0n, demi.pourquoi);
  const assez = chaineE({ wt: 10n ** 18n });
  const rien = await A.planifierEchangePourAjout({ rpc: assez.rpc, moi, total: TOT });
  t('enough wtCOIN held: no swap offered, nothing built, not quoted', rien.etat === 'REFUSE' && rien.inutile === true && !rien.appels && assez.vus.devis.length === 0, rien.pourquoi);
  const peu = await A.planifierEchangePourAjout({ rpc: chaineE({ tb: TOT - 1n }).rpc, moi, total: TOT });
  t('less TBLOCK than chosen: refused, shortfall said', peu.etat === 'REFUSE' && peu.manque && peu.manque.tblock === 1n);
  const deja = await A.planifierEchangePourAjout({ rpc: chaineE({ deja: true }).rpc, moi, total: TOT });
  t('allowances already there (and not expiring): only the swap', deja.etat === 'PRET' && deja.appels.length === 1 && deja.appels[0].to === A.ROUTEUR_);
  const cher = await A.planifierEchangePourAjout({ rpc: chaineE({ coutBps: 400n }).rpc, moi, total: TOT });
  t('a quote 4% under the pool price: refused, impact said', cher.etat === 'REFUSE' && cher.impactBps === 400n && !cher.appels, cher.pourquoi);
  const muet = await A.planifierEchangePourAjout({ rpc: chaineE({ quoteur: () => { throw new Error('HTTP 429'); } }).rpc, moi, total: TOT });
  t('quoter not read: NON_LU, nothing built', muet.etat === 'NON_LU' && !muet.appels, muet.etat);
  const petit = await A.planifierEchangePourAjout({ rpc, moi, total: 2n * 10n ** 23n });
  t('200,000 TBLOCK split is below the lock minimum: refused with the minimum', petit.etat === 'REFUSE' && petit.minimum && !petit.appels, petit.pourquoi);
  const fixe = await A.planifierEchangePourAjout({ rpc, moi, total: TOT, echange: p.echange, sortieMinImposee: p.sortieMin });
  t('the click re-plans the SAME amount on a fresh quote, with the previewed minimum', fixe.etat === 'PRET' && fixe.echange === p.echange && fixe.sortieMin === p.sortieMin);
  const luN = await A.lireEchange({ rpc: chaineE().rpc, moi });
  for (const [k, v] of [['permit2Routeur', null], ['soldes', { wtcoin: 0n, tblock: null }], ['sqrtPrix', null]]) {
    const r = A.planEchangePourAjout({ moi, total: TOT, lu: { ...luN, [k]: v }, devis: { echange: p.echange, sortie: p.devis } });
    t('step 0 not read ' + k + ': NON_LU, nothing built', r.etat === 'NON_LU' && !r.appels, r.etat);
  }
  t('step 1 cote deux: a cap at 0 is refused', A.planAjoutEtLock({ moi, cote: 'deux', montant: { wtcoin: 0n, tblock: TOT }, semaines: 4, lu: lu() }).etat === 'REFUSE');
  t('step 1 cote deux: more than the balance is refused (shortfall)', (() => { const r = A.planAjoutEtLock({ moi, cote: 'deux', montant: { wtcoin: E18, tblock: TOT }, semaines: 4, lu: lu({ soldes: { wtcoin: 10n ** 15n, tblock: TOT } }) }); return r.etat === 'REFUSE' && r.manque && r.manque.wtcoin > 0n; })());
}

/* MUTATIONS: a temporary copy of the module, each mutant must fail verifierPlan (or the order check); the copy is then deleted */
const SRC = readFileSync(new URL('./lp-lock-app.js', import.meta.url), 'utf8');
const MUTANTS = [
  ['approve of the next number', 'appels.push(approveNftCall(nft.tokenId));', 'appels.push(approveNftCall(nft.tokenId + 1n));'],
  ['typed-side cap removed', 'if (max[cote] > d) max[cote] = d;', ''],
  ['lock for other weeks than chosen', 'appels.push(lockCall(nft.tokenId, w));', 'appels.push(lockCall(nft.tokenId, 4n + (w === 4n ? 1n : 0n)));'],
  ['receipt log from any emitter', "String(l.address || '').toLowerCase() !== PM || ", ''],
  ['step-2 liquidity check removed', "if (liquiditeAttendue !== null && liquiditeAttendue !== undefined && BigInt(nft.liquidite) !== BigInt(liquiditeAttendue)) return refus('Position #' + tokenId + ' does not hold the liquidity you just added.');", ''],
  /* step 0 */
  ['swap impact bound removed', 'if (impact > IMPACT_MAX_BPS) return refus(', 'if (false) return refus('],
  ['swap minimum out at 1 wei', 'let min = (q * (10000n - tol)) / 10000n;', 'let min = 1n;'],
  ['Permit2 lets the position manager (not the router) take the swap', 'routeur: ROUTEUR_, montant: s,', 'routeur: PM, montant: s,'],
  ['the whole amount swapped (no split)', 'return ((T - d) * 1000000n) / (1000000n + k);', 'return T - d;'],
  ['step 1 after the swap takes the larger liquidity', 'const L = a.liquidite < b.liquidite ? a.liquidite : b.liquidite;', 'const L = a.liquidite > b.liquidite ? a.liquidite : b.liquidite;'],
  ['the click accepts a quote under the previewed minimum', 'if (q < BigInt(sortieMinImposee)) return refus(', 'if (false) return refus('],
  /* review 2026-11-15 */
  ['the click keeps a looser previewed minimum', 'if (BigInt(sortieMinImposee) > min) min = BigInt(sortieMinImposee);', 'min = BigInt(sortieMinImposee);'],
  ['no TBLOCK-only minimum in the refusal', 'const seul = minimumTblockSeul(', 'const seul = null && minimumTblockSeul('],
  ['TBLOCK-only minimum ignores the wtCOIN side', 'Vm = tblockPourWtcoin(mini.wtcoin, sq);', 'Vm = 0n;'],
  ['0 wtCOIN after the swap read as "type an amount"', "if (cw <= 0n) return refus('The wtCOIN from your swap is not read in your wallet yet: preview again in a moment.', { minimum, attendreSolde: true });", "if (cw <= 0n) return refus('Type an amount.', { minimum });"],
];
for (const [nom, avant, apres] of MUTANTS) {
  t('mutant "' + nom + '": the line exists', SRC.split(avant).length === 2);
  const f = new URL('./lp-lock-app.mutant-tmp.mjs', import.meta.url);
  writeFileSync(f, SRC.replace(avant, () => apres)); /* a function: no "$" pattern of the replacement is ever read */
  try {
    const M = await import(f.href + '?' + Date.now());
    let ech = []; try { ech = await verifierEchange(M); } catch (e) { ech = ['threw: ' + e.message]; }
    t('mutant "' + nom + '" is caught (red)', verifierPlan(M).length + ech.length > 0);
  } finally { rmSync(f, { force: true }); }
}
/* the card text a visitor reads BEFORE connecting: it must not send TBLOCK-only holders away now that the swap step exists */
const APP = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const ligneDeconnecte = APP.split('\n').find((l) => l.includes("Connect your wallet to add wtCOIN + TBLOCK liquidity")) || '';
t('disconnected card text exists (exactly once)', APP.split('Connect your wallet to add wtCOIN + TBLOCK liquidity').length === 2);
t('disconnected card text does not say both tokens are required', !/needs both tokens/i.test(ligneDeconnecte));
t('disconnected card text names the TBLOCK-only path', /Only TBLOCK\?/.test(ligneDeconnecte) && /swaps/.test(ligneDeconnecte));
/* game421 — found by a wallet click-through on a fork (test mode): the card's body in app.html */
const debut = APP.indexOf('async function peindreLpLock(');
const corps = APP.slice(debut, APP.indexOf('\n}\n', debut));
t('peindreLpLock found in app.html', debut > 0 && corps.length > 1000);
t('a card being filled for this wallet is not repainted by the 60 s timer (force still repaints)', corps.includes("if (!force && hote.dataset.compte === moi && hote.dataset.saisie === '1') return;"));
t('typing, the side and the weeks mark the card as being filled', /montant\.addEventListener\('input', \(\) => \{ enSaisie\(\);/.test(corps) && /cote\.addEventListener\('change', \(\) => \{ enSaisie\(\);/.test(corps) && /semaines\.addEventListener\('change', \(\) => \{ enSaisie\(\);/.test(corps));
/* every place that REPLACES the card resets the mark, else the card would freeze on a disconnected or "not read" view */
const remplacements = corps.split('hote.replaceChildren(').length - 1;
const remisAZero = (corps.match(/hote\.dataset\.saisie = '';[^\n]*\n?[^\n]*hote\.replaceChildren\(/g) || []).length;
t('each card replacement after a read resets the "being filled" mark (' + remisAZero + ' of the replacements)', remisAZero >= 3);
t('the disconnected view forgets the wallet it was painted for', corps.includes("if (!compte) { lplEtat.pour = null; hote.dataset.compte = ''; hote.dataset.saisie = '';"));
t('0 wtCOIN and some TBLOCK: the side starts on TBLOCK', corps.includes("if (E.soldes && E.soldes.wtcoin === 0n && E.soldes.tblock > 0n) cote.value = 'tblock';"));
t('the preview says it is reading while it reads', corps.includes("apercu.textContent = 'Reading the pool'"));
/* game422 — sequential fallback for wallets that cannot batch (Phil 2026-11-15) */
t('a wallet that cannot batch signs the same calls one by one (no more "nothing was sent")', corps.includes('r = await envoyerUnParUn(cs.map(') && !corps.includes('cannot send these calls as one all-or-nothing batch, so nothing was sent'));
t('one by one, a step counts as sent only when its LAST call is (no "step 0 done" on an approval)', corps.includes('if (enAttente && derniereEnvoyee)') && corps.includes('>= suite.n - (r && r.etat === \'CONFIRME\' ? 0 : 1)'));
t('stopped half-way: the message says what went through and the preview is dropped (not a repaint)', corps.includes("for this exact amount only, no tokens moved. Preview again to finish.'") && corps.includes('if (faits) planVu = null;'));
/* game423, found by the fork test (decline at signature 2 of 3): never "nothing was sent" next to "1 went through" */
t('half-way, the stopped call\'s "nothing was sent" tail is dropped', corps.includes(".replace(/\\s*[—-]\\s*nothing was sent\\.?$/i, '')"));
t('half-way, the message names the stopped signature (n of N)', corps.includes("'Not done: signature ' + (faits + 1) + ' of ' + suite.n + ' stopped ('"));
/* the half-way message says "approvals only": true only if every plan puts its swap / add / lock LAST and nothing else moves tokens */
t('step 0 plan: the swap is the last call', SRC.includes("appels.push(echangeCall({ montant: s, sortieMin: min, deadline })); etapes.push('Swap part of your TBLOCK"));
t('step 1 plan: the add (mint) is the last call', SRC.includes("appels.push(fige(PM, mint)); etapes.push('Add the liquidity"));
t('the preview no longer promises "one signature" to a wallet that signs one call at a time', !corps.includes("' in one signature: '") && (corps.match(/one signature if your wallet batches them, else one each/g) || []).length === 2);
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
