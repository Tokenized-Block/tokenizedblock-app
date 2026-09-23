import { readFileSync } from 'fs';
const h = readFileSync('./app.html', 'utf8');
if (!h.includes('data-build="20260923-map-anim"') && !h.includes('data-build="20260923-created-history"')) throw new Error('tip');
if (!h.includes('tip 20260923-map-anim: soleilsSurLaMap creates')) throw new Error('soleils animer');
if (!h.includes('thin merge skips poserBlocks')) throw new Error('charger animer');
if (h.includes('data-build="20260923-map-3dplace"')) throw new Error('old tip left');
console.log('ok map-anim');
