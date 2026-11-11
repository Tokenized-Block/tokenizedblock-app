/* test-lock-20261110.mjs — lock.js: the unsigned calls of TBlockLock, the 7-day rule with its margin, what the page says.
 * Two copies: the REAL lock-deploiement.js (address null today: nothing offered) and a COPY with an address (the calls once deployed).
 * NE PROUVE PAS: the calls on chain (banc-lock-fork-20261110.mjs runs them on a base-anvil fork with the frozen bytes). */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { selecteur } from './keccak.js';
let ok = 0, ko = 0;
const t = (m, c, x = '') => { if (c) ok++; else { ko++; console.log('KO', m, x); } };
const ICI = path.dirname(fileURLToPath(import.meta.url));
const L0 = await import('./lock.js');
const { LOCK_DEPLOIEMENT } = await import('./lock-deploiement.js');
/* game352: deployed 2026-11-11 by tx 0xb0611159…03c5b6 (block 55,817,337, sender 0x31e0 read on chain), runtime == the frozen bytes'
 *   (verifier-lock-deploye-20261111.mjs 6/6). The address below is the one that verifier proved — copied, never typed from memory. */
t('the lock is deployed at the verified address', L0.LOCK === '0xec46b02bb1f3a58ce37c023f8668f2207bc2b0aa' && LOCK_DEPLOIEMENT.adresse === L0.LOCK);
t('the batch goes to it', L0.lockBatch({ amount: 1n, jours: 7, maintenantSec: 1 })[1].to === L0.LOCK);
/* the "not deployed" state is still tested on a COPY without the address (every button hidden) */
const DIR0 = fs.mkdtempSync(path.join(os.tmpdir(), 'lock0-'));
for (const f of ['lock.js', 'keccak.js']) fs.copyFileSync(path.join(ICI, f), path.join(DIR0, f));
fs.writeFileSync(path.join(DIR0, 'lock-deploiement.js'), fs.readFileSync(path.join(ICI, 'lock-deploiement.js'), 'utf8').replace(/adresse: (null|'0x[0-9a-f]{40}')/, 'adresse: null'));
const N0 = await import(pathToFileURL(path.join(DIR0, 'lock.js')).href);
let threw = false; try { N0.lockBatch({ amount: 1n, jours: 7, maintenantSec: 1 }); } catch (_) { threw = true; }
t('undeployed copy: LOCK null, no lock batch', N0.LOCK === null && threw);
fs.rmSync(DIR0, { recursive: true, force: true });
t('frozen data: 7-day minimum, the real TBLOCK', LOCK_DEPLOIEMENT.minLockSecondes === 604800 && LOCK_DEPLOIEMENT.tblock === '0xb200000000000000000000ba9bf8330307f8830e');

/* a copy with an address, as after the deploy */
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-'));
const ADRL = '0x1111111111111111111111111111111111111111';
for (const f of ['lock.js', 'keccak.js']) fs.copyFileSync(path.join(ICI, f), path.join(DIR, f));
fs.writeFileSync(path.join(DIR, 'lock-deploiement.js'), fs.readFileSync(path.join(ICI, 'lock-deploiement.js'), 'utf8').replace(/adresse: (null|'0x[0-9a-f]{40}')/, "adresse: '" + ADRL + "'"));
const L = await import(pathToFileURL(path.join(DIR, 'lock.js')).href);
const now = 1_800_000_000, E = 10n ** 18n;
const b = L.lockBatch({ amount: 3_000_000n * E, jours: 7, maintenantSec: now });
t('2 calls: approve then lock', b.length === 2 && b[0].to === L.TBLOCK && b[1].to === ADRL);
t('approve EXACTLY the amount to the lock', b[0].data === selecteur('approve(address,uint256)') + ADRL.slice(2).padStart(64, '0') + (3_000_000n * E).toString(16).padStart(64, '0'));
const at = BigInt('0x' + b[1].data.slice(74, 138));
t('lock(amount, now + 7 days + 1 h margin)', b[1].data.startsWith(selecteur('lock(uint256,uint256)')) && at === BigInt(now + 7 * 86400 + 3600), String(at));
t('no ETH in either call', b.every((c) => c.value === '0x0'));
for (const j of [6, 0, 4 * 365 + 1, 1.5]) { let x = false; try { L.lockBatch({ amount: 1n, jours: j, maintenantSec: now }); } catch (_) { x = true; } t('refuses ' + j + ' days', x); }
let z = false; try { L.lockBatch({ amount: 0n, jours: 7, maintenantSec: now }); } catch (_) { z = true; } t('refuses 0 TBLOCK', z);
t('withdraw call', L.withdrawCall().data === selecteur('withdraw()') && L.withdrawCall().to === ADRL);
t('gate view = activeLockedOf (SEC-001)', L.VIEW.activeLockedOf('0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b').data.startsWith(selecteur('activeLockedOf(address)')));
t('lockCheck: more than held refused', L.lockCheck({ balance: 5n * E, amount: 6n * E }).ok === false && L.lockCheck({ balance: 5n * E, amount: 5n * E }).ok === true);
t('state: none', L.etatLock({ locked: 0n, active: 0n, unlockAt: 0, maintenantSec: now }).cle === 'aucun');
/* Phil 2026-11-10: "a 7-day withdrawal period too" — every state offers exactly ONE way forward, never a fund without a way back */
t('7-day withdrawal period read from the frozen data', L.RETRAIT_JOURS === 7);
t('request / cancel calls', L.requestWithdrawCall().data === selecteur('requestWithdraw()') && L.cancelWithdrawCall().data === selecteur('cancelWithdraw()'));
t('views for the exit', L.VIEW.requestedAtOf(ADRL).data.startsWith(selecteur('requestedAtOf(address)')) && L.VIEW.withdrawableAtOf(ADRL).data.startsWith(selecteur('withdrawableAtOf(address)')));
const M = 3_000_000n * E;
const a = L.etatLock({ locked: M, active: M, unlockAt: now + 3 * 86400 + 5, maintenantSec: now });
/* game354 (Grok live test: "8 days left" shown with 7 d 23 h left): days AND hours, never rounded up — 3 d 0 h 5 s reads "3 d 0 h" */
t('active: days and hours left, never rounded up; the exit is a REQUEST', a.cle === 'actif' && /3,000,000 TBLOCK locked until .* \(3 d 0 h left\)/.test(a.texte) && a.action === 'demander', a.texte);
{ const p7 = L.etatLock({ locked: M, active: M, unlockAt: now + 7 * 86400 + 23 * 3600 + 58 * 60, maintenantSec: now });
  t('the live case: 7 d 23 h, not "8 days"', /\(7 d 23 h left\)/.test(p7.texte), p7.texte);
  const p0 = L.etatLock({ locked: M, active: M, unlockAt: now + 2 * 3600 + 30 * 60, maintenantSec: now });
  t('under a day: hours and minutes', /\(2 h 30 min left\)/.test(p0.texte), p0.texte); }
const x = L.etatLock({ locked: M, active: 0n, unlockAt: now - 10, maintenantSec: now });
t('date passed, not requested: points stopped, request offered', x.cle === 'expire' && x.action === 'demander' && /its points stopped/.test(x.texte));
const w = L.etatLock({ locked: M, active: 0n, unlockAt: now - 10, requestedAt: now - 86400, withdrawableAt: now + 6 * 86400, maintenantSec: now });
t('requested, period running: date shown, cancel offered, no take-back yet', w.cle === 'sortie' && w.action === 'annuler' && /can be taken back on .* \(6 d 0 h\)/.test(w.texte), w.texte);
const p = L.etatLock({ locked: M, active: 0n, unlockAt: now - 10, requestedAt: now - 8 * 86400, withdrawableAt: now - 86400, maintenantSec: now });
t('period over: take back offered', p.cle === 'pret' && p.action === 'retirer' && /yours to take back/.test(p.texte));
const pile = L.etatLock({ locked: M, active: 0n, unlockAt: now, requestedAt: now - 7 * 86400, withdrawableAt: now, maintenantSec: now });
t('exactly at withdrawableAt: take back (the contract pays at >=)', pile.action === 'retirer');
fs.rmSync(DIR, { recursive: true, force: true });
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
