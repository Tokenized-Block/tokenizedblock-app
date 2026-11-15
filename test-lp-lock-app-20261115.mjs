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
 * NE PROUVE PAS: the chain (banc-lp-lock-app-fork-20261115 does, on a local fork); a wallet's atomic batch. */
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

/* MUTATIONS: a temporary copy of the module, each mutant must fail verifierPlan (or the order check); the copy is then deleted */
const SRC = readFileSync(new URL('./lp-lock-app.js', import.meta.url), 'utf8');
const MUTANTS = [
  ['approve of the next number', 'appels.push(approveNftCall(nft.tokenId));', 'appels.push(approveNftCall(nft.tokenId + 1n));'],
  ['typed-side cap removed', 'if (max[cote] > d) max[cote] = d;', ''],
  ['lock for other weeks than chosen', 'appels.push(lockCall(nft.tokenId, w));', 'appels.push(lockCall(nft.tokenId, 4n + (w === 4n ? 1n : 0n)));'],
  ['receipt log from any emitter', "String(l.address || '').toLowerCase() !== PM || ", ''],
  ['step-2 liquidity check removed', "if (liquiditeAttendue !== null && liquiditeAttendue !== undefined && BigInt(nft.liquidite) !== BigInt(liquiditeAttendue)) return refus('Position #' + tokenId + ' does not hold the liquidity you just added.');", ''],
];
for (const [nom, avant, apres] of MUTANTS) {
  t('mutant "' + nom + '": the line exists', SRC.split(avant).length === 2);
  const f = new URL('./lp-lock-app.mutant-tmp.mjs', import.meta.url);
  writeFileSync(f, SRC.replace(avant, apres));
  try {
    const M = await import(f.href + '?' + Date.now());
    t('mutant "' + nom + '" is caught (red)', verifierPlan(M).length > 0);
  } finally { rmSync(f, { force: true }); }
}
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
