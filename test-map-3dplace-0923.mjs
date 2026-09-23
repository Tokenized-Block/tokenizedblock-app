import { readFileSync } from 'fs';
const h = readFileSync('./app.html', 'utf8');
if (!h.includes('data-build="20260923-map-3dplace"') && !h.includes('data-build="20260923-created-history"')) throw new Error('tip');
if (!h.includes('quandMoteurPret')) throw new Error('wait');
if (!h.includes('NEVER seed soleils before moteur3d')) throw new Error('comment');
if (h.includes('tip 20260923-map-seed:')) throw new Error('old seed tip');
console.log('ok map-3dplace');
