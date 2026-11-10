/* test-create-outoffunds-honnete.mjs — UN COMPTE SANS ETH NE VOIT JAMAIS « EVM error: OutOfFunds ».
 *
 * ⛔⛔ LE DEFAUT (Raksha, 2026-10-01, wallet neuf et vide, `create-outoffunds.png`) : le preflight disait
 *     « Need ≈ 0.0015 ETH … Nothing was started. Fund wallet. », puis la ligne `#cEtat` devenait
 *     « EVM error: OutOfFunds » — le message brut du noeud, rendu par la SIMULATION `createPaid`
 *     (`eth_call` avec value 0,001 ETH) que lance `verifierAdresseCreation`. Rien n avait ete envoye.
 *
 * ⛔ CE FICHIER EXECUTE LE VRAI CODE : `refusSimulationSansFonds`, `direSimulationSansFonds` et
 *   `verifierAdresseCreation`, extraits de app.html depouille de ses commentaires.
 * ⛔⛔ TEMOINS NEGATIFS (lances par mutation, voir le message de commit) : retirer la ligne qui
 *   intercepte le refus -> ce test DOIT echouer ; et un VRAI refus de la factory (TokenAlreadyExists
 *   explique) DOIT rester affiche tel quel — sinon on aurait juste masque tous les refus.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sansCommentaires } from './outils-test.js';
import { adresseDejaPrise } from './encodeur.js'; /* game348: verifierAdresseCreation reads the block a used salt made */

let n = 0;
const cas = async (t, f) => { n += 1; try { await f(); console.log('  ok  ' + t); } catch (e) { console.error('✗ ' + t); throw e; } };
const nu = sansCommentaires(readFileSync(new URL('./app.html', import.meta.url), 'utf8'), { minRetire: 5000 });
const d = nu.indexOf('const RE_SIMULATION_SANS_FONDS');
const f = nu.indexOf('const CLE_A_LANCER', d);
assert.ok(d > 0 && f > d, 'tranche verifierAdresseCreation introuvable');
const source = nu.slice(d, f);

async function lancer({ refus = null, jette = null } = {}) {
  const e = { className: '', textContent: '', _html: '', set innerHTML(v) { this._html = v; this.textContent = v.replace(/<[^>]+>/g, ''); }, get innerHTML() { return this._html; } };
  const champs = { '#cEtat': e, '#cSel': { value: 'block-0011' } };
  const $ = (q) => champs[q] || null;
  const adresseOuRefus = async () => { if (jette) throw new Error(jette); return refus ? { adresse: null, refus } : { adresse: '0x' + '12'.repeat(20), refus: null }; };
  const fn = new Function('$', 'validerCreation', 'majFraisEtRecap', 'calldataCreation', 'utiliseCreateRouter', 'CREATE_ROUTER',
    'valeurCreation', 'fraisWeiCalcule', 'CREATE_FEE_WEI_FLOOR', 'adresseOuRefus', 'appelBrut', 'compte', 'montrerFundWalletCourt', 'adresseDejaPrise',
    'let profilEnLecture = false; let adressePrevue = null; let selAuto = false;\n' + source + '\nreturn verifierAdresseCreation();');
  await fn($, () => ({ ko: null }), () => {}, () => '0xdead', () => true, '0x' + '00'.repeat(20), () => '0x38d7ea4c68000', null, 1n,
    adresseOuRefus, async () => ({}), '0x' + '11'.repeat(20), () => {}, adresseDejaPrise);
  return e;
}

await cas('⛔⛔⛔ REFUS « EVM error: OutOfFunds » : PHRASE HONNETE, JAMAIS LE MESSAGE BRUT', async () => {
  const e = await lancer({ refus: 'EVM error: OutOfFunds' });
  assert.ok(!/EVM error|OutOfFunds/.test(e.textContent), 'message brut a l ecran : « ' + e.textContent + ' »');
  assert.match(e.textContent, /Nothing was sent/);
  assert.match(e.textContent, /not hold enough ETH/);
  assert.ok(e.className.includes('wKo'));
});
await cas('⛔⛔ LE MEME MANQUE PAR EXCEPTION (« insufficient funds for gas * price + value ») : meme phrase', async () => {
  const e = await lancer({ jette: 'insufficient funds for gas * price + value' });
  assert.ok(!/insufficient funds for gas/.test(e.textContent), 'message brut a l ecran : « ' + e.textContent + ' »');
  assert.match(e.textContent, /Nothing was sent/);
});
await cas('TEMOIN — UN VRAI REFUS DE LA FACTORY RESTE DIT TEL QUEL (on ne masque pas tout)', async () => {
  const e = await lancer({ refus: 'This salt is already taken by a block — change the salt.' });
  assert.equal(e.textContent, 'This salt is already taken by a block — change the salt.');
});
await cas('TEMOIN — UNE PANNE RESEAU RESTE « Could not ask the chain »', async () => {
  const e = await lancer({ jette: 'over rate limit' });
  assert.match(e.textContent, /^Could not ask the chain: over rate limit/);
});
await cas('UNE ADRESSE RENDUE : le chemin heureux est intact', async () => {
  const e = await lancer({});
  assert.match(e.textContent, /^This salt gives the address 0x1212/);
});
console.log('test-create-outoffunds-honnete :', n, 'cas OK');
