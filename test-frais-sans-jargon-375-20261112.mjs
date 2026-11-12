/* test-frais-sans-jargon-375-20261112.mjs — game375 (Phil 2026-11-12: "n'écris pas les not deployed, on perd en crédibilité" ; "écris pas de
 *   v2 … retire le v8, juste le nom"). AFFIRME on the REAL fees page text, rendered from frais-risques.js the way the page does it:
 *   no internal status words and no version names reach the reader. Comments and code identifiers are not scanned, only rendered text. */
import { readFileSync } from 'node:fs';
const SRC = readFileSync(new URL('./frais-risques.js', import.meta.url), 'utf8');
const HTML = readFileSync(new URL('./frais-et-risques.html', import.meta.url), 'utf8');
let ok = 0, ko = 0;
const t = (m, c) => { if (c) ok++; else { ko++; console.log('KO', m); } };
/* the strings the page can show: every single-quoted literal in frais-risques.js outside comments, plus the html text outside tags/scripts */
const sansCommentaires = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const litteraux = (sansCommentaires.match(/'(?:[^'\\\n]|\\.)*'/g) || []).map((x) => x.slice(1, -1)).filter((x) => /[a-z] [a-z]/i.test(x));
const texteHtml = HTML.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ');
const tout = litteraux.join('\n') + '\n' + texteHtml;
const interdits = [/\bnot deployed\b/i, /\bunder review\b/i, /\bfork test\b/i, /\bprepared but not signed\b/i, /\bnot signed yet\b/i, /\bV8\b/, /(?<!Uniswap )\bv[23]\b/i];
for (const re of interdits) { const m = tout.match(re); t('no ' + re + ' in shown text' + (m ? ' (found: "' + tout.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\n/g, ' ') + '")' : ''), !m); }
t('the scan really sees page text (witness)', tout.includes('Trade a block') && litteraux.length > 50);
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
