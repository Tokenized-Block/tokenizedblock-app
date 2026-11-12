// test-locker.mjs — le calldata du locker, compare a `cast` (temoin EXTERIEUR).
// ================================================================================================
// ⛔ POURQUOI UN TEMOIN EXTERIEUR : verifier mon encodage avec mon encodage ne prouve rien. Les
//    references de `fixture-locker-cast.txt` viennent de `cast calldata` (foundry), genere le
//    2026-09-18 ; si un jour l ABI du contrat change, ce test tombe avant la prod.
// ⛔ LE TICK NEGATIF A SON PROPRE CAS : un tick de depart est negatif des que la quote vaut plus que
//    le block (cas normal contre USDC), et un complement a deux rate se lit comme un tick geant.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LOCKER_ADRESSE, LOCKER_LP_FEE, LOCKER_TICK_SPACING, LOCKER_MIN_SHARE_BPS,
  encodeApproveLocker, encodeBringToLife, encodeCollect, encodeClaim, planBringToLife, phrasesLocker,
} from './locker.js';

const brut = readFileSync(new URL('./fixture-locker-cast.txt', import.meta.url), 'utf8');
const lignes = brut.split(/\r?\n/).filter((l) => l.startsWith('0x'));
const [CAST_VIE_POS, CAST_VIE_NEG, CAST_APPROVE, CAST_COLLECT, CAST_CLAIM] = lignes;

const TOKEN = '0xb2000000000000000000006d9b5370dbbc048485';
const ETH = '0x0000000000000000000000000000000000000000';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const LOCKER_TEST = '0x522B3294E6d06aA25Ad0f1B8891242E335D3B459';
const SUPPLY = 10n ** 27n;

let n = 0;
const ok = (nom, f) => { f(); n++; console.log('  ok', nom); };

ok('cinq references lues dans la fixture cast', () => {
  assert.equal(lignes.length, 5);
});

ok('bringToLife, tick positif — identique a cast', () => {
  assert.equal(encodeBringToLife({ token: TOKEN, quote: ETH, montant: SUPPLY, startTick: 196200 }), CAST_VIE_POS);
});

ok('bringToLife, tick NEGATIF — complement a deux identique a cast', () => {
  assert.equal(encodeBringToLife({ token: TOKEN, quote: USDC, montant: SUPPLY, startTick: -138000 }), CAST_VIE_NEG);
  /* temoin : le negatif ne doit PAS ressembler au positif */
  assert.notEqual(CAST_VIE_NEG, CAST_VIE_POS);
});

ok('approve, collect et claim — identiques a cast', () => {
  assert.equal(encodeApproveLocker(LOCKER_TEST, SUPPLY), CAST_APPROVE);
  assert.equal(encodeCollect(1234), CAST_COLLECT);
  assert.equal(encodeClaim(ETH), CAST_CLAIM);
});

ok('sans locker deploye, le plan REFUSE au lieu de fabriquer une transaction', () => {
  assert.equal(LOCKER_ADRESSE, null);
  const r = planBringToLife({ token: TOKEN, quote: ETH, montant: SUPPLY, startTick: 196200 });
  assert.equal(r.etat, 'REFUSE');
  assert.match(r.pourquoi, /coming soon/);
  assert.equal(r.appels, undefined);
});

ok('avec un locker, le plan rend DEUX appels dans le bon ordre', () => {
  const r = planBringToLife({ token: TOKEN, quote: ETH, montant: SUPPLY, startTick: 196200, locker: LOCKER_TEST });
  assert.equal(r.etat, 'PRET');
  assert.equal(r.appels.length, 2);
  assert.equal(r.appels[0].to, TOKEN);
  assert.equal(r.appels[0].data, CAST_APPROVE);
  assert.equal(r.appels[1].to, LOCKER_TEST);
  assert.equal(r.appels[1].data, CAST_VIE_POS);
  for (const a of r.appels) assert.equal(a.value, '0x0');
});

ok('les refus du contrat sont repetes AVANT la signature', () => {
  const base = { token: TOKEN, quote: ETH, montant: SUPPLY, startTick: 196200, locker: LOCKER_TEST };
  /* tick non multiple de 200 */
  assert.equal(planBringToLife({ ...base, startTick: 196201 }).etat, 'REFUSE');
  /* lpFee different de 5000 */
  assert.equal(planBringToLife({ ...base, lpFee: 3000 }).etat, 'REFUSE');
  /* montant nul ou negatif */
  assert.equal(planBringToLife({ ...base, montant: 0n }).etat, 'REFUSE');
  /* quote = token */
  assert.equal(planBringToLife({ ...base, quote: TOKEN }).etat, 'REFUSE');
  /* adresses tronquees */
  assert.equal(planBringToLife({ ...base, token: '0xb2000000' }).etat, 'REFUSE');
  /* temoin positif : le cas nominal passe toujours */
  assert.equal(planBringToLife(base).etat, 'PRET');
});

ok('les constantes collent au contrat, et les phrases ne promettent rien de plus', () => {
  assert.equal(LOCKER_LP_FEE, 5000);
  assert.equal(LOCKER_TICK_SPACING, 200);
  assert.equal(LOCKER_MIN_SHARE_BPS, 9000);
  const p = phrasesLocker();
  assert.equal(p.length, 3);
  /* ⛔ aucune phrase ne dit ou part la moitie qui n est pas celle du createur (regle de Phil) */
  for (const l of p) assert.ok(!/0x[0-9a-fA-F]{6}/.test(l), 'aucune adresse a l ecran');
  assert.ok(p.some((l) => /0\.5%/.test(l)));
});

console.log('test-locker:', n, 'cas, exit 0');
