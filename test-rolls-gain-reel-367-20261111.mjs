/* test-rolls-gain-reel-367-20261111.mjs — game367 (live audit 2026-11-11: the Rolls tile said "win up to 5 USDC" while the pot held 0.25 and
 *   BlockRolls pays min(prize, pot); /api/tirage measured: prizes 5/3/1/0.5 USDC, pot "250000"). AFFIRME on the REAL rolls-regles.js / app.html:
 *   - gainMaxReel = min(5/5 prize, pot), flagged plafonne; a pot not read (null) keeps the prize, never invents a 0; bad rules -> null;
 *   - the tile uses it and says "(the pot now)" when capped. */
import { readFileSync } from 'node:fs';
import { gainMaxReel } from './rolls-regles.js';
const APP = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
let ok = 0, ko = 0;
const t = (m, c, x = '') => { if (c) ok++; else { ko++; console.log('KO', m, x); } };
const r = { prizes: ['5000000', '3000000', '1000000', '500000'], minScore: 2 };
const a = gainMaxReel(r, '250000');
t('pot 0.25 < prize 5 -> 0.25, capped (the live case)', a && a.brut === 250000n && a.plafonne === true, JSON.stringify(a, (k, v) => (typeof v === 'bigint' ? String(v) : v)));
const b = gainMaxReel(r, '9000000');
t('pot above the prize -> the prize, not capped', b && b.brut === 5000000n && b.plafonne === false);
t('pot not read -> the prize, never a 0', gainMaxReel(r, null).brut === 5000000n && gainMaxReel(r, null).plafonne === false && gainMaxReel(r, 'x').plafonne === false);
t('pot 0 -> 0, capped (an empty pot pays nothing)', gainMaxReel(r, '0').brut === 0n && gainMaxReel(r, '0').plafonne === true);
t('rules unread -> null', gainMaxReel(null, '250000') === null);
t('tile uses the real max and says when capped', APP.includes('const gm = Rg.gainMaxReel(rollsCfg, rollsCfg.pot);') && APP.includes("(gm.plafonne ? ' (the pot now)' : '')"));
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
