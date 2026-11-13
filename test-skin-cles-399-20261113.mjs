/* test-skin-cles-399-20261113.mjs — game399: two skins contracts both have a token 1 (game390 numbering). EXECUTES the real functions:
 *   skinDuBlock picks the NEWEST skin by contract order then token id (a later contract's token 1 beats an older contract's token 9);
 *   offresChangees and propositionSkin key a skin by contract:token, so one contract's token never hides or pulses the other's.
 * NE PROUVE PAS: the rendering (the app wiring is checked as text below). */
import { readFileSync } from 'node:fs';
import { skinDuBlock } from './vision-skin.js';
import { offresChangees } from './skins-marche.js';
import { propositionSkin, cleSkin } from './blockskins.js';
const APP = readFileSync(new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let ok = 0, ko = 0;
const t = (m, c) => { if (c) ok++; else { ko++; console.log('KO', m); } };
const A = '0x' + 'a'.repeat(40), B = '0x' + 'b'.repeat(40), BLK = '0x' + '1'.repeat(40), MOI = '0x' + '2'.repeat(40), AUTRE = '0x' + '3'.repeat(40);
const sk = (contrat, tokenId, extra = {}) => ({ contrat, tokenId, block: BLK, detenteur: MOI, recette: { h: [1, 2, 3] }, ...extra });

/* skinDuBlock */
t('newest across contracts: the later contract token 1 beats the older contract token 9', skinDuBlock([sk(A, 9), sk(B, 1)], BLK, MOI, [A, B]).contrat === B);
t('same contract: the higher token id', skinDuBlock([sk(B, 1), sk(B, 3)], BLK, MOI, [A, B]).tokenId === 3);
t('order given oldest first is respected whatever the list order', skinDuBlock([sk(B, 1), sk(A, 9)], BLK, MOI, [A, B]).contrat === B);
t('without the order: token id alone, as before', skinDuBlock([sk(A, 9), sk(B, 1)], BLK, MOI).tokenId === 9);
t('only my skins of this block', skinDuBlock([sk(B, 5, { detenteur: AUTRE }), sk(A, 2)], BLK, MOI, [A, B]).contrat === A);

/* offresChangees */
const e = (contrat, tokenId, offre) => ({ contrat, tokenId, enVente: true, enchere: true, offre });
const o1 = offresChangees(null, [e(A, 1, 100n), e(B, 1, 200n)]);
t('two token 1 tracked apart', o1.apres.get(A + ':1') === 100n && o1.apres.get(B + ':1') === 200n && o1.changees.size === 0);
const o2 = offresChangees(o1.apres, [e(A, 1, 100n), e(B, 1, 250n)]);
t('only the one whose bid changed pulses', o2.changees.size === 1 && o2.changees.has(B + ':1'));

/* propositionSkin */
const vente = (contrat, tokenId) => ({ contrat, tokenId, block: BLK, enVente: true, enchere: false, detenteur: AUTRE, devise: '0x' + '4'.repeat(40), prix: '100' });
const P = (skins, deja) => propositionSkin({ skins, moi: MOI, block: BLK, maintenant: 1, achat: true, devise: '0x' + '4'.repeat(40), parTrade: '1000', reste: '1000', dejaProposes: deja });
t('a proposed token 1 of A does not hide token 1 of B', (P([vente(A, 1), vente(B, 1)], new Set([cleSkin(vente(A, 1))])) || {}).skin?.contrat === B);
t('the same skin is never proposed twice', P([vente(A, 1)], new Set([cleSkin(vente(A, 1))])) === null);

/* app wiring */
t('app: the newest skin uses the contracts order', APP.includes('skinDuBlock(r.skins, block, compte, BLOCKSKINS_SUITE.map((x) => x.contrat))') && APP.includes('cleSkin, BLOCKSKINS_SUITE } from \'./blockskins.js\';'));
t('app: proposals and pulses keyed contract:token', APP.includes('bcAifiSkins.proposes.add(cleSkin(p.skin));') && APP.includes('skmPouls(el, k);'));
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
