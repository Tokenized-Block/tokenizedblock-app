/* test-create-face-count-quotes-370-20261111.mjs — the Create tab's face-count sentence is English, with English quotes.
 * Seen on prod game369 as a new visitor (Create tab, #cCombinaisons): "... we publish the number, not the word « unique »." —
 * French guillemets on an English page. This test runs the REAL statement that writes #cCombinaisons (extracted from app.html)
 * against a stub element and checks the text a visitor reads.
 * Does NOT prove: the other « » still present in rarer UI strings (search, transfers, bank) — listed in the audit, not fixed here. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(process.env.TB_APP || path.join(ICI, 'app.html'), 'utf8');
let n = 0, ko = 0;
const vu = (c, m) => { n += 1; if (!c) { ko += 1; console.log('KO ' + m); } else console.log('ok ' + m); };

const debut = html.indexOf("$('#cCombinaisons').textContent =");
vu(debut > 0, 'A1 the statement that writes #cCombinaisons is found');
const fin = html.indexOf(';', html.indexOf("possible faces", debut));
const stmt = html.slice(debut, fin + 1);
vu(stmt.length > 40 && stmt.length < 400, 'A2 the statement is one bounded expression (' + stmt.length + ' chars)');

const el = { textContent: '' };
const ctx = { $: (s) => (s === '#cCombinaisons' ? el : null), combinaisons: () => 14716762461168768 };
vm.createContext(ctx);
vm.runInContext(stmt, ctx);
const txt = el.textContent;
console.log('   text: ' + txt);
vu(txt.startsWith('14,716,762,461,168,768 possible faces.'), 'B1 the count is printed first, en-US grouping');
vu(!/[«»]/.test(txt), 'B2 no French guillemets « » in the sentence a visitor reads');
vu(/the word “unique”\.$/.test(txt), 'B3 the word is quoted with English quotes: the word “unique”.');
vu(!/\s[.,;:!?]/.test(txt.replace(/possible faces\./, '')), 'B4 no French-style space before punctuation');

console.log((ko ? 'RED' : 'GREEN') + ' ' + (n - ko) + '/' + n);
process.exit(ko ? 1 : 0);
