// test-tam-replay-374-20261112.mjs — game374 (Phil: "the Replay button must show it on the TAM map to really replay the TAM").
// What this test PROVES:
//   A. planRejeuMintee(paramsText, bytes) — the pure decision behind the Replay click: identical bytes -> ok (attractor AND science),
//      one changed byte / one byte more / unreadable params / unknown system -> not ok, verdict "different ✗", a reason in English.
//   B. the click handler (tam-onglet.js source): Replay runs planRejeuMintee, then loads the work into the SCENE (rejouerMintee ->
//      charger with the on-chain bytes, or chargerScience then the minted params as stored), scrolls the scene into view, and keeps
//      the "identical ✓" check as a line under the scene (#tamRejeu); a replayed (already minted) work does not offer Mint again;
//      any later change of the work clears the replay state.
//   C. the module still LOADS (executes to the end).
//   M. mutants on the source: each one turns its assertion red.
// What it does NOT prove: the drawing itself (canvas, browser) — that is checked in a real browser, separately.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from './tam-moteur.js';
import * as TS from './tam-science.js';
import { keccak256Hex } from './keccak.js';

let n = 0, rouges = 0;
const vu = (c, m) => { if (c) { n++; console.log('  ok  ' + m); } else { rouges++; console.log('  RED ' + m); } };
const graineDe = (s) => keccak256Hex(new TextEncoder().encode(s));

const src = readFileSync(new URL('./tam-onglet.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const mod = await import(new URL('./tam-onglet.js?banc374=' + process.pid, import.meta.url).href).catch((e) => ({ __erreur: e }));

/* ── C. the module loads ── */
vu(!mod.__erreur, 'C tam-onglet.js loads' + (mod.__erreur ? ': ' + mod.__erreur.message : ''));

/* ── A. the pure decision ── */
const plan = mod.planRejeuMintee;
vu(typeof plan === 'function', 'A planRejeuMintee is exported');
if (typeof plan === 'function') {
  /* an attractor work, as the brain chooses one (the same path the minted works took) */
  const ch = T.choisirOeuvre({ graine: graineDe('tam-replay-374'), etatCerveau: { tick: 3 }, existantes: [] });
  assert.ok(ch.ok, 'witness: a certified attractor work for this seed');
  const texte = JSON.stringify(ch.params);
  const a = plan(texte, ch.octets);
  vu(a.ok === true && a.genre === 'attracteur' && a.verdict.identique === true && a.verdict.texte === 'identical ✓' && a.P && a.P.famille === ch.params.famille,
    'A attractor: stored params replay to the stored bytes -> ok, genre attracteur, "identical ✓", P = the stored params');
  const m = ch.octets.slice(); m[Math.floor(m.length / 2)] ^= 1;
  const b = plan(texte, m);
  vu(b.ok === false && b.verdict.texte === 'different ✗' && /do not replay/.test(String(b.pourquoi)), 'A attractor: one changed byte -> not ok, "different ✗", reason said');
  const plus = new Uint8Array(ch.octets.length + 1); plus.set(ch.octets);
  vu(plan(texte, plus).ok === false, 'A attractor: one byte more -> not ok');
  vu(plan('{not json', ch.octets).ok === false && /could not be read/.test(String(plan('{not json', ch.octets).pourquoi)), 'A unreadable params -> not ok, reason said');
  vu(plan('[1,2]', ch.octets).ok === false && plan('null', ch.octets).ok === false, 'A params that are not an object -> not ok');
  vu(plan(JSON.stringify({ science: 'noSuchSystem__374', params: {} }), ch.octets).ok === false, 'A unknown system -> not ok (nothing loaded)');
  vu(plan(texte, null).ok === false, 'A bytes not read -> not ok');

  /* a science work: the first mintable system whose params replay (the same function the gallery used before) */
  let sci = null;
  for (const s of TS.SYSTEMES) {
    try {
      const P = TS.paramsScience(s.id, {}, { minteur: '0x' + '22'.repeat(20) });
      const r = TS.rejouerScience(JSON.parse(JSON.stringify(P)));
      if (r.ok) { sci = { P, octets: r.octets }; break; }
    } catch (_) { /* next */ }
  }
  assert.ok(sci, 'witness: one science system replays');
  const c = plan(JSON.stringify(sci.P), sci.octets);
  vu(c.ok === true && c.genre === 'science' && c.verdict.texte === 'identical ✓' && c.P.science === sci.P.science && c.P.minteur === sci.P.minteur,
    'A science (' + sci.P.science + '): ok, genre science, "identical ✓", the minted minter kept (not this wallet\'s)');
  const ms = sci.octets.slice(); ms[0] ^= 1;
  vu(plan(JSON.stringify(sci.P), ms).ok === false, 'A science: one changed byte -> not ok');
}

/* ── B. the click handler and the scene ── */
/* end of a function body inside monter(): a regexp that absorbs \r (test-tests-portables: no string anchor on \n) */
const finCorps = (s, i) => { const re = /\r?\n {2}\}\r?\n/g; re.lastIndex = i; const m = re.exec(s); return m ? m.index : -1; };
const corps = (nom) => { const i = src.indexOf('function ' + nom + '('); if (i < 0) return ''; const j = finCorps(src, i); return j < 0 ? src.slice(i) : src.slice(i, j); };
const cB1 = (s) => { const i = s.indexOf("const bRejouer = el('button'"); const j = s.indexOf('return f;', i); const h = i < 0 || j < 0 ? '' : s.slice(i, j);
  return /planRejeuMintee\(params, donnees\)/.test(h) && /rejouerMintee\(id, p, donnees, graineHex, premiere\)/.test(h) && /scene\.scrollIntoView\(/.test(h); };
vu(cB1(src), 'B Replay click: planRejeuMintee, then rejouerMintee (the scene), then scene.scrollIntoView');
const cB2 = (s) => { const i = s.indexOf('function rejouerMintee('); const j = finCorps(s, i); const h = i < 0 ? '' : s.slice(i, j);
  return /charger\(P, null, hexDe\(donnees\)\)/.test(h) && /chargerScience\(s\.id, P\.params/.test(h) && /S\.P = JSON\.parse\(JSON\.stringify\(P\)\); S\.octets = hexDe\(donnees\)/.test(h)
    && /S\.rejeu = \{ id/.test(h) && /S\.dessines = reduit\(\) \? S\.n : 0/.test(h); };
vu(cB2(src), 'B rejouerMintee: attractor -> charger(on-chain bytes); science -> chargerScience then the minted params and bytes; drawn again from 0');
const cB3 = (s) => /const rejeuLigne = el\('p', \{[^}]*id: 'tamRejeu'/.test(s) && /scene, rejeuLigne,/.test(s);
vu(cB3(src), 'B the check line #tamRejeu sits right under the scene');
const cB4 = (s) => { const h = (() => { const i = s.indexOf('function peindreMint('); return i < 0 ? '' : s.slice(i, s.indexOf('const visible', i)); })();
  return /if \(S\.rejeu\) \{ zMint\.hidden = true; racine\.dataset\.mint = 'off'; zMint\.replaceChildren\(\); return; \}/.test(h); };
vu(cB4(src), 'B a replayed (already minted) work does not offer Mint again');
const cB5 = (s) => ['charger', 'chargerScience', 'chargerFormule'].every((f) => { const i = s.indexOf('function ' + f + '('); return i >= 0 && /S\.rejeu = null;/.test(s.slice(i, s.indexOf('\n', s.indexOf('\n', i) + 1))); });
vu(cB5(src), 'B charger / chargerScience / chargerFormule clear the replay state on their first line (a later change is not called a replay)');
const cB6 = (s) => { const h = corps('peindreRejeu'); return /identical|verdict/.test(h) && /'Replay of TAM #'/.test(h) && /rejeuLigne\.hidden = !S\.rejeu/.test(h); };
vu(cB6(src), 'B peindreRejeu: the line says "Replay of TAM #…" and the check, hidden when no replay');

const cB7 = (s) => { const h = corps('lignesRejeu'); return /if \(!S\.rejeu\) return lignes;/.test(h) && /'Distinct from the minted works'/.test(h) && /this is TAM #' \+ S\.rejeu\.id/.test(h) && /'Who chose'/.test(h) && /'Tuned'/.test(h)
  && (s.match(/lignesRejeu\(lignes\)\.flatMap/g) || []).length === 2; };
vu(cB7(src), 'B the card of a replayed work says "Minted: yes — this is TAM #…" (not "Distinct … no minted work yet", not "You did"), science and attractor');
/* merged on the economy pack (2026-11-12): the same number can exist in TAM art and in the first TamArt — a replay of the first one says so,
 *   in the top line, the check line and the card */
const cB8 = (s) => /S\.rejeu = \{ id, premiere: !!premiere,/.test(s) && /function collectionRejeu\(\) \{ return S\.rejeu && S\.rejeu\.premiere \? ' \(first collection\)' : ''; \}/.test(s)
  && /'TAM #' \+ S\.rejeu\.id \+ collectionRejeu\(\)/.test(s) && /'Replay of TAM #' \+ S\.rejeu\.id \+ collectionRejeu\(\)/.test(s) && /this is TAM #' \+ S\.rejeu\.id \+ collectionRejeu\(\)/.test(s)
  && /carteOeuvre\(s\.contrat, id, s\.premiere\)/.test(s);
vu(cB8(src), 'B a replay of a work of the first TamArt is named "(first collection)" in the top line, the check line and the card');

/* ── M. mutants ── */
const mut = (nom, de, vers, c) => { const s2 = src.replace(de, vers); vu(s2 !== src && c(s2) === false, 'M ' + nom); };
mut('no scroll -> B1 red', 'scene.scrollIntoView(', 'scene.focus(', cB1);
/* merged on the economy pack (2026-11-12): the gallery holds TAM art and the first TamArt, so the click passes which collection */
mut('Replay back to the badge only -> B1 red', 'rejouerMintee(id, p, donnees, graineHex, premiere)', 'void 0', cB1);
mut('attractor drawn without the on-chain bytes -> B2 red', 'charger(P, null, hexDe(donnees))', 'charger(P, null, null)', cB2);
mut('science keeps this wallet\'s params -> B2 red', 'S.P = JSON.parse(JSON.stringify(P)); S.octets = hexDe(donnees)', 'S.octets = hexDe(donnees)', cB2);
mut('no animation from 0 -> B2 red', /(function rejouerMintee[\s\S]*?)S\.dessines = reduit\(\) \? S\.n : 0/, '$1S.dessines = S.n', cB2);
mut('line moved away from the scene -> B3 red', 'scene, rejeuLigne,', 'scene,', cB3);
mut('Mint offered on a replay -> B4 red', "if (S.rejeu) { zMint.hidden = true; racine.dataset.mint = 'off'; zMint.replaceChildren(); return; }", '', cB4);
mut('charger keeps the replay state -> B5 red', /(function charger\(P, choix = null, octetsServeur = null\) \{\n)    S\.rejeu = null;/, '$1', cB5);

mut('card not rewritten on a replay -> B7 red', "dl.replaceChildren(...lignesRejeu(lignes).flatMap", 'dl.replaceChildren(...lignes.flatMap', cB7);
mut('collection dropped from the replay state -> B8 red', 'S.rejeu = { id, premiere: !!premiere,', 'S.rejeu = { id, premiere: false,', cB8);
mut('check line without the collection -> B8 red', "'Replay of TAM #' + S.rejeu.id + collectionRejeu()", "'Replay of TAM #' + S.rejeu.id", cB8);
console.log(rouges ? '\nRED: ' + rouges + ' failed, ' + n + ' passed' : '\nGREEN: ' + n + ' passed');
process.exit(rouges ? 1 : 0);
