/* test-tokenize-copy-373-20261112.mjs — game373 (Phil 2026-11-12: "Tokenize something … c'est mal écrit, refais"). The copy was rewritten
 *   in plainer words; this pins that the FACTS it must keep are still on screen (the reasons are the ⛔ comments in app.html):
 *   a NEW block, the original never moved/wrapped/converted, nothing signs on this screen; the X link is engraved for good and NOT checked;
 *   the step names match the real Create controls; nothing is published from here; the post text still has the ".@" for a handle. */
import { readFileSync } from 'node:fs';
const A = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
let ok = 0, ko = 0;
const t = (m, c) => { if (c) ok++; else { ko++; console.log('KO', m); } };
t('title kept (Phil chose it)', A.includes('<p class="titre">Tokenize something</p>'));
t('a NEW block, the original untouched, nothing signs', A.includes('Create a <b>new</b> block on Base that carries the name of something that already exists. The original stays where it is: nothing is moved, wrapped or converted. Nothing on this screen asks you to sign.'));
t('the link is engraved and can never be changed', A.includes('in the same transaction, and it can never be changed.'));
t('step 2 names the REAL Create controls', A.includes('<summary class="note">Tokenize a post from X — engraved with the block</summary>') && A.includes('<li><b>Open Create → “Tokenize a post from X”</b> <span>and tick “Tokenize a post”</span></li>') && A.includes('<input type="checkbox" id="cTweetOui"> Tokenize a post'));
t('says the link is NOT checked', A.includes('We do not check the link when it is engraved: we cannot tell whether the post exists or who wrote it.'));
t('nothing is published from here', A.includes('send it yourself: nothing is published from here.'));
t('post text keeps the ".@" before a handle, and a sentence without one', A.includes(`const debut = h ? '.@' + h + ' just tokenized a block on Base.' : 'A new block just went live on Base.';`));
/* game374: tabs are just "Token" and "Post on X" (Phil) */
t('tabs named Token / Post on X', A.includes('data-itab="jeton">Token</button>') && A.includes('data-itab="post">Post on X</button>') && !A.includes('⬢ A token'));
t('old wording gone', !A.includes('Write it, read it, then decide') && !A.includes('under the face settings') && !A.includes('Someone tokenized a block.'));
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
