import { readFileSync } from 'fs';
const h = readFileSync('./app.html', 'utf8');
if (!h.includes('data-build="20260923-feed-catch-router"') && !h.includes('data-build="20260923-created-history"')) throw new Error('tip');
if (!h.includes('tip 20260923-feed-catch-router')) throw new Error('comment');
if (!h.includes('data-filtre="CREATION_TB"')) throw new Error('TB paid chip');
if (!h.includes('was born on TB · paid')) throw new Error('paid label');
if (!h.includes('foreignCreate')) throw new Error('foreignCreate');
if (!h.includes('data-tf-act="instant-birth-tb">Instant Birth on TB · 0.001 ETH')) throw new Error('IB CTA');
if (!h.includes("if (Number(CHAINE) === 8453) return true;")) throw new Error('utiliseCreateRouter MAIN');
if (!h.includes('Free factory create is retired on Base')) throw new Error('refuse creerSansVie');
if (h.includes('Create stays free')) throw new Error('free create copy left');
if (h.includes('Fees for Dev')) throw new Error('Fees for Dev');
if (h.includes('a6cf99d35949c6cb911adb910078f4ca46f0f5d4') && h.match(/a6cf99d35949c6cb911adb910078f4ca46f0f5d4/g)?.length) {
  // addr may appear only if leaked into UI strings — soft check: not in visible button text
  const ui = h.match(/>([^<]*a6cf[^<]*)</gi) || [];
  if (ui.length) throw new Error('a6cf in UI text: ' + ui.join('|'));
}
console.log('ok feed-catch-router');
