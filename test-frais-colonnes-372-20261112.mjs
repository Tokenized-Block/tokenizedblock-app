/* test-frais-colonnes-372-20261112.mjs — game372 (Phil's screenshot 2026-11-12: on Fees & risks the explanation was squeezed into a thin strip
 *   on the right). Cause measured in the browser: td.n was `white-space:nowrap`, so the longest amount ("entry 17,241 TBLOCK · vote 8,621
 *   TBLOCK", 266 px) widened the amount column to 278 px for EVERY row. AFFIRME on the REAL frais-et-risques.html CSS:
 *   - the amount column may wrap and is bounded; the name column no longer takes a third; the phone layout is unchanged. */
import { readFileSync } from 'node:fs';
const H = readFileSync(new URL('./frais-et-risques.html', import.meta.url), 'utf8');
let ok = 0, ko = 0;
const t = (m, c) => { if (c) ok++; else { ko++; console.log('KO', m); } };
const regle = (sel) => { const m = H.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}')); return m ? m[1] : ''; };
const n = regle('table.frais td.n');
t('amount column is not nowrap (it widened every row)', n && !/white-space:\s*nowrap/.test(n));
t('amount column is bounded (max-width)', /max-width:\s*9\.5em/.test(n));
t('name column narrower than a third', /width:\s*26%/.test(regle('table.frais th')));
t('phone layout kept (block rows under 520 px)', H.includes('@media (max-width:520px)') && H.includes('table.frais,table.frais tbody,table.frais tr,table.frais th,table.frais td{display:block;width:auto}'));
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
