/* test-holders-wallet-377-20261112.mjs — holders.html "Your wallet" counts the LOCK for hearts and the vault, the WALLET for the channel.
 * Phil 2026-11-12: Grok's wallet (3,000,000 TBLOCK locked in TBlockLock until 2027-01-11, 246,365 held) read only
 *   "holds 246,365 TBLOCK · worth $1.28 · state BELOW $15" — the lock was not on the card at all.
 * Part A reads holders.html and serveur-web.js as text (the wiring); part B runs holders-wallet.js on the chain values read on 2026-11-12
 *   for 0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b (TBlockLock + Hearts on Base). ROOT (env) points at another tree for the red proof.
 * Usage: node test-holders-wallet-377-20261112.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = process.env.ROOT || path.dirname(fileURLToPath(import.meta.url));
let ok = 0, ko = 0;
const t = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('FAIL ' + nom + (detail ? ' — ' + detail : '')); } };
const lire = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (_) { return ''; } };

/* ── A. the page wiring ── */
const H = lire('holders.html');
t('A0 holders.html read', H.length > 1000);
const connect = (H.match(/\$\('#connecter'\)\.onclick = async \(\) => \{[\s\S]*?\n\};/) || [''])[0];
t('A1 the connect handler is found', connect.length > 200);
t('A2 the card no longer paints the wallet alone ("holds" / "worth" / a BELOW pill)', !/row\('holds'/.test(connect) && !/row\('worth'/.test(connect) && !/'BELOW \$'/.test(connect));
t('A3 the page imports walletLines from holders-wallet.js', /import \{ walletLines \} from '\.\/holders-wallet\.js';/.test(H));
const lock = (H.match(/async function lireLock\(w\) \{[\s\S]*?\n\}/) || [''])[0];
t('A4 the lock read uses the same views as the app\'s lock card', ['lockedOf', 'activeLockedOf', 'unlockAtOf', 'requestedAtOf'].every((v) => lock.includes('LK.VIEW.' + v + '(w)')), lock.slice(0, 120));
t('A5 a failed lock read is null, never 0', /catch \(_\) \{ etat\.lockTotal = null; etat\.locked = null; etat\.unlockAt = null; etat\.requestedAt = null; \}/.test(lock) && !/= 0n/.test(lock));
const perks = (H.match(/function peindrePerks\(\) \{[\s\S]*?\n\}/) || [''])[0];
t('A6 the card is repainted with the perks (the rules can arrive after the connect)', /\n  peindreWallet\(\);\n\}$/.test(perks));
const pw = (H.match(/function peindreWallet\(\) \{[\s\S]*?\n\}/) || [''])[0];
t('A7 the card passes the LOCK (activeLockedOf) and the hearts contract minimum to walletLines', /active: etat\.locked/.test(pw) && /minHold: R \? R\.minHold : null/.test(pw) && /holdUsd: R \? R\.holdUsd : null/.test(pw));
t('A8 the card passes the server\'s wallet answer as the channel rule', /channel: h\.reached === false \? null : \{ usd:/.test(pw) && /channelOpen: TGP\.pret/.test(pw));
t('A9 a server that does not answer leaves the lock on the card (no early return)', /catch \(e\) \{ h = \{ reached: false, balance: null, usd: null, ok: false \}; \}/.test(connect));
const S = lire('serveur-web.js');
t('A10 the server serves holders-wallet.js (static allowlist)', /'holders-wallet\.js',/.test(S));
t('A11 the server serves economie-pack.js and its record (the page imports them)', /'economie-v2-pack-deploye\.js', 'economie-pack\.js',/.test(S));

/* ── B. the lines, on the values read on Base on 2026-11-12 for Grok's wallet ── */
let HW = null;
try { HW = await import(pathToFileURL(path.join(ROOT, 'holders-wallet.js')).href); } catch (e) { t('B0 holders-wallet.js loads', false, e.message); }
if (HW) {
  const E = 10n ** 18n;
  const GROK = {
    balance: '246365066793223524875835', walletUsd: 1.28, locked: '3000000000000000000000000', active: '3000000000000000000000000',
    unlockAt: '1799676860', requestedAt: '0', minHold: '2789880205312700046735192', likePrice: '92996006843756668224507', holdUsd: '15000000000000000000',
    poolUsd: 1.28 / 246365, channel: { usd: 1.28, ok: false, thresholdUsd: 15, why: 'holds $1.28 of TBLOCK, below $15' }, channelOpen: false,
    nowSec: Date.UTC(2026, 10, 12, 14, 0) / 1000,
  };
  const L = HW.walletLines(GROK);
  const v = (k) => (L.find((l) => l.k === k) || {}).v;
  const c = (k) => (L.find((l) => l.k === k) || {}).c;
  t('B1 Locked: 3,000,000 TBLOCK until 2027-01-11 (≈ $15.59)', v('Locked') === '3,000,000 TBLOCK until 2027-01-11 (≈ $15.59)', v('Locked'));
  t('B2 In your wallet: 246,365 TBLOCK (≈ $1.28)', v('In your wallet') === '246,365 TBLOCK (≈ $1.28)', v('In your wallet'));
  t('B3 Hearts & holders vault: enough, the LOCK against the hearts minimum', v('Hearts & holders vault') === 'enough (3,000,000 locked ≥ 2,789,880, $15 at the hearts contract price)' && c('Hearts & holders vault') === 'ok', v('Hearts & holders vault'));
  t('B4 Holders\' channel: below $15 in your wallet (coming soon)', v("Holders' channel") === 'below $15 in your wallet (coming soon)' && c("Holders' channel") === 'bad', v("Holders' channel"));
  t('B5 the four lines, in that order', L.map((l) => l.k).join('|') === "Locked|In your wallet|Hearts & holders vault|Holders' channel", L.map((l) => l.k).join('|'));
  t('B6 the channel open: no "(coming soon)"', HW.walletLines({ ...GROK, channelOpen: true }).find((l) => l.k === "Holders' channel").v === 'below $15 in your wallet');
  t('B7 the channel enough', HW.walletLines({ ...GROK, channelOpen: true, channel: { usd: 20.5, ok: true, thresholdUsd: 15 } }).find((l) => l.k === "Holders' channel").v === 'enough: $20.50 in your wallet');

  /* read failures say "not read", never zero and never a verdict */
  const N = HW.walletLines({ ...GROK, locked: null, active: null, unlockAt: null, requestedAt: null, minHold: null, balance: null, walletUsd: null, channel: null });
  const nv = (k) => (N.find((l) => l.k === k) || {}).v;
  t('B8 lock not read -> "not read"', nv('Locked') === 'not read', nv('Locked'));
  t('B9 wallet not read -> "not read"', nv('In your wallet') === 'not read', nv('In your wallet'));
  t('B10 hearts/vault not read -> "not read" (no "below")', nv('Hearts & holders vault') === 'not read', nv('Hearts & holders vault'));
  t('B11 channel not reached -> "not read (coming soon)"', nv("Holders' channel") === 'not read (coming soon)', nv("Holders' channel"));
  t('B12 no "0" anywhere when nothing was read', !N.some((l) => /\b0\b/.test(l.v)), JSON.stringify(N));
  t('B13 the hearts minimum not read, lock read -> hearts "not read"', HW.walletLines({ ...GROK, minHold: null }).find((l) => l.k === 'Hearts & holders vault').v === 'not read');
  t('B14 the server answered without a price -> channel "not read: <why>"', HW.walletLines({ ...GROK, channel: { usd: null, ok: false, why: 'price not read' } }).find((l) => l.k === "Holders' channel").v === 'not read: price not read (coming soon)');

  /* the rule is the LOCK: a big wallet with a small lock is below; a big lock with a small wallet is enough */
  const B = HW.walletLines({ ...GROK, active: String(1000000n * E), locked: String(1000000n * E), balance: String(50000000n * E) }).find((l) => l.k === 'Hearts & holders vault');
  t('B15 50,000,000 in the wallet but 1,000,000 locked -> below', B.v === 'below (1,000,000 locked < 2,789,880, $15 at the hearts contract price)' && B.c === 'bad', B.v);
  /* a withdrawal asked: activeLockedOf is 0, the lock is said but not counted */
  const W = HW.walletLines({ ...GROK, active: '0', requestedAt: '1799000000' });
  t('B16 withdrawal requested -> "in the lock, not counted"', W[0].v === '3,000,000 TBLOCK in the lock, not counted: a withdrawal was requested', W[0].v);
  t('B17 withdrawal requested -> hearts below (0 locked counts)', W[2].v.startsWith('below (0 locked < 2,789,880'), W[2].v);
  const X = HW.walletLines({ ...GROK, active: '0', requestedAt: '0', unlockAt: '1760000000' });
  t('B18 date passed -> "the lock date passed on <day>"', X[0].v === '3,000,000 TBLOCK in the lock, not counted: the lock date passed on 2025-10-09', X[0].v);
  /* a lock ending in under 7 days: hearts enough, vault not (TBlockVaultV2.claim NotCommitted) */
  const C = HW.walletLines({ ...GROK, unlockAt: String(GROK.nowSec + 3 * 86400) });
  t('B19 lock ending in 3 days -> Hearts enough, Holders vault needs 7 more days', C[2].k === 'Hearts' && C[2].c === 'ok' && C[3].k === 'Holders vault' && /7 more days/.test(C[3].v) && C[3].c === 'bad', JSON.stringify(C.slice(2, 4)));
  /* a heart also burns likePrice from the WALLET */
  const P = HW.walletLines({ ...GROK, balance: String(1000n * E) }).find((l) => l.k === 'Hearts & holders vault');
  t('B20 enough lock, wallet cannot pay a heart -> said, amber', P.v === 'enough (3,000,000 locked ≥ 2,789,880, $15 at the hearts contract price); a heart also burns 92,996 TBLOCK from your wallet, which holds 1,000' && P.c === 'warn', P.v);
  t('B21 nothing locked -> "nothing locked"', HW.walletLines({ ...GROK, locked: '0', active: '0' })[0].v === 'nothing locked');
}

console.log('holders wallet card (377): ' + ok + ' OK, ' + ko + ' FAIL');
process.exit(ko ? 1 : 0);
