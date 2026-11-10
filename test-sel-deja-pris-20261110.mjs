/* test-sel-deja-pris-20261110.mjs — game348 (Grok live test Two, 2026-11-10): after a birth, the form kept the salt of the block just born and
 *   the page showed « That salt is already used by this account. Change the salt ». Runs the REAL verifierAdresseCreation from app.html with
 *   a fake factory. AFFIRME: an app-drawn salt is redrawn (no red error); a typed salt is never changed and the page names the block it
 *   already made; any other refusal is still shown as before. NE PROUVE PAS: the browser rendering (checked on prod).
 */
import { readFileSync } from 'node:fs';
import { selecteur } from './keccak.js';
import { adresseOuRefus, adresseDejaPrise } from './encodeur.js';
const APP = readFileSync(new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let ok = 0, ko = 0;
const t = (m, c, x = '') => { if (c) ok++; else { ko++; console.log('KO', m, x); } };
function fonction(nom) {
  const d = new RegExp('^(?:async )?function ' + nom + '\\(', 'm').exec(APP);
  const f = /^\}$/m.exec(APP.slice(d.index));
  return APP.slice(d.index, d.index + f.index + 1);
}
const SRC = fonction('verifierAdresseCreation');
const PRIS = '0xb2000000000000000000aaaaaaaaaaaaaaaaaaaa';
const NEUF = '0xb2000000000000000000bbbbbbbbbbbbbbbbbbbb';
const refusPris = selecteur('TokenAlreadyExists(address)') + PRIS.slice(2).padStart(64, '0');

async function lancer({ selAuto, reponses }) {
  const el = { cEtat: { className: '', textContent: '' }, cSel: { value: 'my-salt' } };
  let n = 0, tirages = 0;
  const appelBrut = async () => { const r = reponses[Math.min(n, reponses.length - 1)]; n++; return r; };
  const f = new Function('validerCreation', '$', 'majFraisEtRecap', 'calldataCreation', 'utiliseCreateRouter', 'adresseOuRefus', 'adresseDejaPrise',
    'appelBrut', 'compte', 'selAleatoire', 'blockApresDevise', 'deviseDeCreation', 'refusSimulationSansFonds', 'direSimulationSansFonds', 'state',
    'let profilEnLecture, adressePrevue, fraisWeiCalcule = null; const CREATE_ROUTER = "0x0", CREATE_FEE_WEI_FLOOR = 0n; const valeurCreation = () => "0x0";'
    + 'let selAuto = state.selAuto;\n' + SRC + '\nreturn verifierAdresseCreation();');
  const res = await f(() => ({ ko: false }), (s) => el[s.slice(1)], () => {}, () => '0x', () => false, adresseOuRefus, adresseDejaPrise,
    appelBrut, '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b', () => { tirages++; return 'auto-' + tirages; }, () => true, () => null,
    (x) => /insufficient funds/.test(String(x)), () => {}, { selAuto });
  return { res, note: el.cEtat, sel: el.cSel.value, appels: n, tirages };
}
const ok1 = { result: '0x' + NEUF.slice(2).padStart(64, '0') };
const pris = { error: { message: 'execution reverted', data: refusPris } };

{
  const r = await lancer({ selAuto: true, reponses: [pris, ok1] });
  t('app-drawn salt already used: redrawn, then the new address', r.res === NEUF && r.tirages === 1 && r.sel === 'auto-1', JSON.stringify(r));
  t('no red note after a redraw', r.note.className === 'note wOk', r.note.className);
}
{
  const r = await lancer({ selAuto: false, reponses: [pris, ok1] });
  t('typed salt: never changed', r.sel === 'my-salt' && r.tirages === 0 && r.appels === 1, JSON.stringify(r));
  t('typed salt: the page names the block it made, not in red', r.note.className === 'note' && r.note.textContent.includes(PRIS) && /tap New salt/.test(r.note.textContent), r.note.textContent);
  t('typed salt: no "Change the salt" error copy', !/already used by this account/.test(r.note.textContent));
}
{
  const r = await lancer({ selAuto: true, reponses: [pris, pris, pris, pris, pris, pris] });
  t('redraws are bounded (4) and the last answer is named, not looped', r.tirages === 4 && r.appels === 5 && r.note.textContent.includes(PRIS), JSON.stringify({ t: r.tirages, a: r.appels }));
}
{
  const autre = { error: { message: 'execution reverted', data: selecteur('InvalidDecimals()') } };
  const r = await lancer({ selAuto: true, reponses: [autre] });
  t('another refusal is still shown as a refusal', r.note.className === 'note wKo' && /Decimals must be/.test(r.note.textContent) && r.tirages === 0, r.note.textContent);
}
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
