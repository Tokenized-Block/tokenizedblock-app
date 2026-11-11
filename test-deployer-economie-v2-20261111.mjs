/* test-deployer-economie-v2-20261111.mjs — game355: the economy v2 deploy page and its frozen data (Phil: "Grok signs for you").
 * The bytes themselves are deployed and read back on a fork by banc-economie-v2-figee-fork-20261111.mjs (12/12) and played end to end on the
 * REAL lock by banc-economie-v2-fork-20261111.mjs (17/17). NE PROUVE PAS: a deploy on mainnet. */
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { ECONOMIE_V2_DEPLOIEMENT as D, vaultV2Creation } from './economie-v2-deploiement.js';
const lire = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const P = lire('deployer-economie-v2.html'), S = lire('serveur-web.js');
let ok = 0, ko = 0;
const t = (m, c, x = '') => { if (c) ok++; else { ko++; console.log('KO', m, x); } };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
t('likes data integrity', sha(D.likes.creation) === D.likes.sha256Creation);
t('vault data integrity', sha(D.vault.init + D.vault.avant + D.vault.apres) === D.vault.sha256Init);
t('not deployed yet: no addresses', D.adresseLikes === null && D.adresseVault === null);
t('the real TBLOCK and the real lock (verified 6/6)', D.likes.config.tblock === '0xb200000000000000000000ba9bf8330307f8830e' && D.likes.config.lock === '0xec46b02bb1f3a58ce37c023f8668f2207bc2b0aa' && D.vault.config.lock === D.likes.config.lock);
t('bounds the review asked for: <= 10 %/write, >= 1 h, range within start x/÷ 100', D.likes.config.maxStepBps <= 1000 && D.likes.config.minInterval >= 3600
  && BigInt(D.likes.config.priceFloor) * 100n >= BigInt(D.likes.config.startPrice) && BigInt(D.likes.config.priceCeil) <= BigInt(D.likes.config.startPrice) * 100n);
const v = vaultV2Creation('0x1111111111111111111111111111111111111111');
t('vault creation = code + tblock + LIKES + the rest', v === D.vault.init + D.vault.avant + '1111111111111111111111111111111111111111'.padStart(64, '0') + D.vault.apres);
let threw = false; try { vaultV2Creation('nope'); } catch (_) { threw = true; } t('a bad likes address throws', threw);
t('page checks both sha256 before the buttons', P.includes('okL = (await sha256Hex(D.likes.creation)) === D.likes.sha256Creation;') && P.includes('okV = (await sha256Hex(D.vault.init + D.vault.avant + D.vault.apres)) === D.vault.sha256Init;'));
t('page: step 2 needs the likes address read from step 1', P.includes("await deploy($('#d2'), vaultV2Creation(likesAt), 'TBlockVaultV2')") && P.includes("$('#d1').disabled = !(chain === 8453 && okL && !likesAt);"));
t('page: receipt status read, failure said', P.includes("if (r.status !== '0x1') { $('#state').innerHTML = what + ' FAILED on chain"));
t('served', S.includes("'economie-v2-deploiement.js', 'deployer-economie-v2.html',"));
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
