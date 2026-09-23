import { readFileSync } from 'fs';
const h = readFileSync('./app.html', 'utf8');
if (!h.includes('data-build="20260923-map-seed"') && !h.includes('data-build="20260923-created-history"')) throw new Error('tip');
if (!h.includes('vues.length >= Math.max(80, habitants.length)')) throw new Error('guard');
if (!h.includes('void soleilsSurLaMap();')) throw new Error('soleilsSurLaMap');
if (!h.includes("charger().then(() => { void soleilsSurLaMap(); })")) throw new Error('charger then soleils');
console.log('ok map-seed');
