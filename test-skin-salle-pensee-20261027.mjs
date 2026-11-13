// test-skin-salle-pensee-20261027 — owner (Phil) 2026-10-27, three requests:
//   1. "Open the skin market" opens a WINDOW (the skin auction room) like the brain window; the auctioneer says ONLY what the list
//      read on chain says; every gesture is an existing guarded path (skmLigne -> bcActionMarche, ouvrirMintSkin);
//   2. the "Outside" bug: no stale pin across views / openings, no mood hue painted over the whole scene (a dark gold that reads as a
//      skin), the palette follows the block SHOWN;
//   3. the live thought: 2-3 first-person sentences built from the beat's data only; same beat -> same text; a reading labelled as such.
// Mutants: run with no env var -> the bench spawns itself on mutant COPIES (created next to the modules, removed after) and each must FAIL.
// Env: SP_APP (another app.html), SP_PENSEE / SP_SALLE (another module file name in this directory).
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const DIR = new URL('./', import.meta.url);
const app = readFileSync(process.env.SP_APP || new URL('app.html', DIR), 'utf8').replace(/\r\n/g, '\n');
const P = await import(new URL(process.env.SP_PENSEE || 'pensee-cerveau.js', DIR).href);
const SA = await import(new URL(process.env.SP_SALLE || 'salle-encheres.js', DIR).href);
let count = 0; const ok = (c, m) => { assert.ok(c, m); count++; };

/* ── 3. THE THOUGHT ── */
const N = (o) => ({ achats: 0, ventes: 0, detenteurs: 0, gm: 0, messages: 0, ...o });
const beat = (tick, o = {}) => ({ tick, phase: 'EXCITE', spikes: 10, virage: 0, vitesse: 0.3, nouveaux: N(), delta: 0, indices: [], ...o });
const histo = [beat(1, { spikes: 8 }), beat(2, { spikes: 10 }), beat(3, { spikes: 12 }), beat(4, { spikes: 10, vitesse: 0.3 }),
  beat(5, { spikes: 26, virage: -0.143, vitesse: 0.65, delta: 0.012, nouveaux: N({ achats: 2, detenteurs: 1 }) })];
const p = P.pensee(histo, 4, { voisins: 3 });
/* 2026-10-27 (owner, later): the thought now covers its whole beat (test-pensee-lexique-20261027.mjs) — 2 to 6 sentences (6th: what would change its mood) */
ok(p && p.clauses.length >= 2 && p.clauses.length <= 6, '2-6 sentences (' + (p && p.clauses.length) + ')');
ok(p && p.clauses[1].from[0].key === 'phase' && /worry|lift/.test(p.clauses[1].text) && p.text.includes(p.clauses[1].text), 'essential = why + what would change the mood');
ok(p.text === P.pensee(histo, 4, { voisins: 3 }).text, 'same beat -> same text');
/* 2026-10-27 (owner, "text too big, keep the essential"): text = the ESSENTIAL (its first two clauses); complet = all of them */
ok(p.text === p.clauses.slice(0, 2).map((c) => c.text).join(' '), 'the text is exactly its first two clauses');
ok(p.complet === p.clauses.map((c) => c.text).join(' ') && p.clauses.length > 2 && p.complet.length > p.text.length, 'complet is exactly all its clauses');
ok(/^[A-Z0-9]/.test(p.text) && /\bI\b|\bmy\b|\bme\b/.test(p.text), 'first person: ' + p.text);
/* every clause is traced, and every number it says is one of its traced values (or the fixed 128 neurons) */
const nums = (s) => (s.match(/\d+(?:\.\d+)?/g) || []).map(Number);
for (const c of p.clauses) {
  ok(Array.isArray(c.from) && c.from.length > 0, 'clause traced: ' + c.text);
  const vals = c.from.flatMap((f) => (typeof f.value === 'number' ? [f.value, Math.round(f.value * 100) / 100, Math.round(f.value * 1000) / 1000, Math.round(Math.abs(f.value) * 1000) / 10] : []));
  for (const n of nums(c.text)) ok(n === 128 || vals.some((v) => Math.abs(v - n) < 1e-9), 'number ' + n + ' comes from a datum in: ' + c.text);
  /* each traced key names a real field of the beat (or the history / page datum it was computed from) */
  for (const f of c.from) ok(/^(phase|nouveaux\.\w+|delta|deltaHumeur|tirsCurieux|nourriture|nothing|spikes|average|averageOver|nearThreshold|memoire|memoireAvant|virage|vitesse|vitesseAvant|gauche_hz|droite_hz|role|reveil|voisins)$/.test(f.key), 'known datum ' + f.key);
}
ok(/2 buys reached me/.test(p.complet) && /a new holder reached me/.test(p.complet) && /warmed \(\+1\.2 %\)/.test(p.complet), 'inputs of THIS beat named: ' + p.clauses[0].text);
ok(/26 of my 128 neurons \w+ — well above my average of 10 over my last 4 beats/.test(p.complet) && !/neurons/.test(p.text), 'fired vs its recent average (in complet, not in the essential)');
ok(/I (turn|lean|veer) left and (speed up|quicken|pick up pace) from 0\.3 to 0\.65\./.test(p.complet) && /3 map neighbours are around me, but none reach my neurons/.test(p.complet), 'steering, speed vs previous, neighbours not read: ' + p.complet);
ok(p.reading.key === 'restless' && p.reading.from.some((f) => f.key === 'delta'), 'restless = high firing + rising life');
/* readings: each rule from real state */
const r = (h, i) => P.lecture(h, i).key;
ok(r([beat(1, { phase: 'NON_LU' })], 0) === 'blind', 'NON_LU -> blind');
ok(r([beat(1, { phase: 'MORT' })], 0) === 'silent', 'MORT -> silent');
ok(r([beat(1, { nouveaux: N({ ventes: 2, achats: 1 }) })], 0) === 'wary', 'sells > buys -> wary');
ok(r([beat(1, { nouveaux: N({ achats: 1 }) })], 0) === 'eager', 'buys > sells -> eager');
const calm = Array.from({ length: 8 }, (_, k) => beat(k + 1));
ok(r(calm, 7) === 'lonely' && r(calm, 6) !== 'lonely', 'lonely only after ' + P.LONELY_BEATS + ' quiet beats');
ok(r([beat(1), beat(2), beat(3), beat(4, { spikes: 30 })], 3) === 'stirred', 'high firing alone -> stirred');
ok(r([beat(1), beat(2), beat(3), beat(4, { spikes: 2 })], 3) === 'settling', 'low firing -> settling');
const p0 = P.pensee([beat(1)], 0);
ok(/too few earlier beats/.test(p0.complet) && !/average/.test(p0.complet), 'no history -> no comparison is invented');
ok(P.pensee([], 0) === null && P.pensee(histo, 9) === null, 'no beat -> no thought');
const pm = P.pensee([beat(1, { phase: 'MORT', spikes: 0 })], 0);
ok(pm.clauses.length === 2 && pm.text === pm.complet && /creator holds none of me/.test(pm.text) && !/reached me|turn|speed|neighbour/.test(pm.text), 'dead: only what is true');
const src = readFileSync(new URL(process.env.SP_PENSEE || 'pensee-cerveau.js', DIR), 'utf8');
ok(!/fetch\(|https?:\/\/|anthropic|openai|Math\.random|Date\.now/.test(src), 'no network, no LLM, no randomness, no clock in the thought');
/* cerveau.js v1 untouched (moods, rules, fingerprint) */
let diff = 'unread';
try { diff = execFileSync('git', ['diff', '--stat', 'd3f6776', '--', 'cerveau.js'], { cwd: fileURLToPath(DIR), encoding: 'utf8' }).trim(); } catch (_) { diff = 'git failed'; }
ok(diff === '', 'cerveau.js unchanged since d3f6776 (' + (diff || 'no diff') + ')');

/* ── 1. THE ROOM ── the auctioneer's lines from the list only */
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', ME = '0x' + 'a'.repeat(40), BOB = '0x' + 'b'.repeat(40), ZERO = '0x' + '0'.repeat(40);
const fmt = (b, d) => (BigInt(b) / 10000n).toString() + '.' + (BigInt(b) % 10000n).toString().padStart(4, '0').slice(0, 2) + (d === USDC ? ' USDC' : ' ETH');
const nom = (a) => (a === '0x' + 'c'.repeat(40) ? 'UNIT' : 'AAPLc');
const T = 1_800_000_000, rec = { angle: 1, h: [1, 2, 3], cube: 4, noyau: 5, fond: 6 };
/* game390: a skin read by lireSkins carries its app-wide name (texte) ; here one contract, so that name is its token id */
const sk = (o) => { const x = { tokenId: 1n, detenteur: BOB, block: '0x' + 'c'.repeat(40), recette: rec, enVente: false, enchere: false, devise: USDC, prix: 0n, fin: 0, encherisseur: ZERO, offre: 0n, ...o }; return { ...x, texte: 'skin #' + x.tokenId }; };
const live = sk({ tokenId: 3n, enVente: true, enchere: true, prix: 20000n, fin: T + 7200, offre: 30000n, encherisseur: ME });
const open = sk({ tokenId: 4n, enVente: true, enchere: true, prix: 50000n, fin: T + 99999 });
const fixe = sk({ tokenId: 5n, enVente: true, prix: 70000n, block: '0x' + 'd'.repeat(40) });
const say = (skins, x = {}) => SA.annonce({ skins, lu: true, moi: ME, t: T, montant: fmt, nomBlock: nom, ...x });
const a1 = say([live, open, fixe, sk({})]);
const t1 = a1.lignes.map((l) => l.text).join(' ');
ok(a1.podium && a1.podium.tokenId === 3n, 'the podium = the live auction ending first');
ok(/skin #3, dressing UNIT/.test(t1), 'skin and the block it dresses');
ok(t1.includes('highest bid is ' + fmt(30000n, USDC) + ', from you'), 'current bid and bidder: ' + t1);
ok(/Time left: 2 h 0 min/.test(t1), 'time left from `fin`');
ok(t1.includes('at least ' + fmt(31500n, USDC) + ' (+5 %)'), 'the contract minimum (+5 %)');
ok(/1 other auction waits/.test(t1) && /On my shelf: 1 skin at a fixed price/.test(t1), 'other auctions and the shelf counted from the list');
ok(a1.etagere.length === 1 && a1.etagere[0].tokenId === 5n, 'the shelf = the fixed-price listings');
for (const l of a1.lignes) ok(Array.isArray(l.from) && l.from.length > 0, 'line traced: ' + l.text);
/* no invented bid: an auction with no bid never says "highest bid" or "from" */
const a2 = say([open]); const t2 = a2.lignes.map((l) => l.text).join(' ');
ok(!/highest bid|from 0x|from you/.test(t2) && t2.includes('No bid yet — it opens at ' + fmt(50000n, USDC)), 'no bid -> says so: ' + t2);
const a3 = say([fixe, sk({})]); const t3 = a3.lignes.map((l) => l.text).join(' ');
ok(!a3.podium && /nothing is in auction/.test(t3), 'nothing in auction -> said honestly');
ok(/room is empty/.test(say([]).lignes[0].text), 'no skin minted -> said');
const a4 = SA.annonce({ skins: [live], lu: false, moi: ME, t: T, montant: fmt, nomBlock: nom });
ok(a4.lignes.length === 1 && /announce nothing/.test(a4.lignes[0].text) && !a4.podium, 'a list not read -> he announces nothing');
const ended = say([sk({ tokenId: 9n, enVente: true, enchere: true, prix: 1n, fin: T - 5, offre: 40000n, encherisseur: BOB })]);
ok(/Going, going, gone/.test(ended.lignes.map((l) => l.text).join(' ')) && ended.lignes.some((l) => l.from.some((f) => f.key === 'fin')), 'ended auction: settle, traced to `fin`');
/* every amount said is one of the formatted on-chain values of its line */
for (const l of [...a1.lignes, ...a2.lignes]) {
  const amounts = l.text.match(/\d+\.\d+ (USDC|ETH)/g) || [];
  for (const m of amounts) ok(l.from.some((f) => /^\d+$/.test(String(f.value)) && fmt(BigInt(f.value), USDC) === m), 'amount ' + m + ' traced in: ' + l.text);
}

/* ── 1. THE ROOM IN THE PAGE ── */
ok(/<dialog class="bvPop" id="skPop" data-window="panel" aria-label="Skin auction room">/.test(app), 'the room is a window like the brain window (dialog.bvPop)');
for (const id of ['skHandle', 'skTete', 'skFold', 'skMaximize', 'skFermer']) ok(app.includes('id="' + id + '"'), 'window part ' + id);
ok(/windowLikePanel\(\{ d: \$\('#skPop'\), p: \$\('#skHandle'\),[^\n]*fold: \$\('#skFold'\), maximize: \$\('#skMaximize'\) \}\)/.test(app), 'same drag/resize/fold/maximise as the brain window');
ok(/\$\('#skinOuvrirMarche'\)\.addEventListener\('click', \(\) => void ouvrirSalle\(\)\)/.test(app), '"Open the skin market" opens the room');
ok(/id="skinsMarche"/.test(app), 'the Market tab Skins section is still there');
const room = app.slice(app.indexOf('const salle = {'), app.indexOf("$('#skVersMarket')"));
ok(room.length > 500, 'room code found');
ok(!/appel(Acheter|Encherir|Regler|Retirer|MettreEnVente|OuvrirEnchere|Mint|Approuver)\(|bcSigner\(|eth_sendTransaction|wallet_sendCalls/.test(room), 'the room builds NO call and signs nothing itself');
ok(/skmLigne\(s, moi, t\)/.test(room) && /\$\('#skMint'\)\.addEventListener\('click', ouvrirMintSkin\)/.test(app), 'its gestures are the Market rows (bcActionMarche) and ouvrirMintSkin');
ok(/annonceSalle\(\{ skins: skm\.liste \|\| \[\], lu: !!skm\.liste/.test(room), 'the auctioneer reads the SAME list as the Market tab');
ok(/apercuSkinFormes\(p\.recette\)/.test(room), 'the podium wears the skin face from its on-chain recipe');
ok(/of at least ' \+ bcMontantSkin\(offreMinimale\(p\), p\.devise\)/.test(room) && /bid on ' \+ texteSkin\(p\) \+ ' of at least/.test(room), 'the screen says what the wallet would sign (amount, currency, the skin\'s app-wide name — game390)');
/* the auctioneer is an original drawing, not a named mascot */
ok(!/monopoly|pennybags/i.test(app.slice(app.indexOf('id="skPop"'), app.indexOf('id="bvPop"'))), 'no copyrighted mascot name');

/* ── 2. THE "OUTSIDE" BUG ── */
const sw = app.slice(app.indexOf('function bvChangerVue('), app.indexOf("$('#bvVueDedans').addEventListener"));
ok(/bvOublierCible\(\)/.test(sw) && /function bvOublierCible\(\) \{ vision\.pinned = null; vision\.hover = null; vision\.aimKey = null; \}/.test(app), 'switching view releases the pin, hover and overlay key');
ok(/\$\('#bvVueDehors'\)\.addEventListener\('click', \(\) => bvChangerVue\('dehors'\)\)/.test(app) && /\$\('#bvVueDedans'\)\.addEventListener\('click', \(\) => bvChangerVue\('dedans'\)\)/.test(app), 'both view buttons go through it');
const ov = app.slice(app.indexOf('function ouvrirVision('), app.indexOf('function bvAdvance('));
ok(/bvOublierCible\(\)/.test(ov), 'opening the window releases a pin from a previous opening');
const p3 = app.slice(app.indexOf('function bvPaint3D('), app.indexOf('function bvStartLoop('));
ok(/ctx\.fillStyle = sceneBackground\(vision\.fondScene\);\n\s*ctx\.fillRect\(0, 0, L, H\);/.test(p3) && !/fillStyle = lum\.neutral \? '#0b0d12' : 'hsl\(/.test(p3), 'the scene background is black / the owned skin, never the mood (no gold "skin" background)');
const pv = app.slice(app.indexOf('function peindreVision('), app.indexOf('/* ══ THE 3D SCENE'));
ok(/if \(vision\.skinAdr !== cible\.adr\) \{[^\n]*\n[^\n]*removeProperty/.test(pv), 'another block shown -> the previous palette is removed and the new one read');
ok(/penseeVision\(histo, iShown/.test(pv) && /'Feeling: ' \+ p\.reading\.word \+ ' — ' \+ p\.reading\.why \+ '\.'/.test(pv) && /not its engine mood/.test(pv), 'the thought is painted, its reading short and labelled as a reading');
ok(/tx\.textContent = p \? \(ouvert \? p\.complet : p\.text\)/.test(pv) && /vision\.penseeComplete === true/.test(pv) && /tx\.title = p\.complet/.test(pv) && /id="bvPenseePlus"/.test(app), 'the essential by default; the whole thought on demand (more / tooltip)');
ok(/<details class="bvTech"><summary class="note">Numbers of this beat<\/summary><p class="note mono" id="bvSortie"><\/p><\/details>/.test(app), 'the technical numbers stay, folded');

console.log('test-skin-salle-pensee-20261027: ' + count + ' checks OK');

/* ── MUTANTS (only on the real run) ── */
if (!process.env.SP_APP && !process.env.SP_PENSEE && !process.env.SP_SALLE) {
  const me = fileURLToPath(import.meta.url), here = fileURLToPath(DIR);
  const pen = readFileSync(new URL('pensee-cerveau.js', DIR), 'utf8'), sal = readFileSync(new URL('salle-encheres.js', DIR), 'utf8');
  const mutants = [
    ['SP_PENSEE', 'mut-pensee-invente.tmp.mjs', pen.replace("clauses.push({ text: cause.text,", "clauses.push({ text: 'I feel 3 whales watching me.', from: [{ key: 'nothing', value: null }] }); clauses.push({ text: cause.text,")],
    ['SP_PENSEE', 'mut-pensee-nombre.tmp.mjs', pen.replace("' over my last ' + m.n + ' beats'", "' over my last ' + (m.n + 2) + ' beats'")],
    ['SP_PENSEE', 'mut-pensee-horloge.tmp.mjs', pen.replace("return { version: VERSION_PENSEE, tick: vu.tick,", "return { version: VERSION_PENSEE, tick: vu.tick + (Date.now() % 2),")],
    ['SP_PENSEE', 'mut-pensee-tout.tmp.mjs', pen.replace('text: clauses.slice(0, ESSENTIEL)', 'text: clauses')],
    ['SP_APP', 'mut-app-complet.tmp.html', app.replace('tx.textContent = p ? (ouvert ? p.complet : p.text)', 'tx.textContent = p ? (true ? p.complet : p.text)')],
    ['SP_SALLE', 'mut-salle-offre.tmp.mjs', sal.replace("'No bid yet — it opens at '", "'The highest bid is ' + M(podium.prix, podium.devise) + ' — it opens at '")],
    ['SP_SALLE', 'mut-salle-lu.tmp.mjs', sal.replace('if (!lu) return {', 'if (false) return {')],
    ['SP_APP', 'mut-app-pin.tmp.html', app.replace('bvOublierCible(); vision.vue = vue;', 'vision.vue = vue;')],
    ['SP_APP', 'mut-app-or.tmp.html', app.replace("  ctx.fillStyle = sceneBackground(vision.fondScene);\n  ctx.fillRect(0, 0, L, H);", "  ctx.fillStyle = lum.neutral ? '#0b0d12' : 'hsl(' + th + ' 45% ' + (6 + 10 * lum.strength * env).toFixed(1) + '%)';\n  ctx.fillRect(0, 0, L, H);")],
    ['SP_APP', 'mut-app-signe.tmp.html', app.replace("$('#skinOuvrirMarche').addEventListener('click', () => void ouvrirSalle());", "$('#skinOuvrirMarche').addEventListener('click', () => allerAuMarcheSkins());")],
  ];
  let dead = 0;
  for (const [env, file, body] of mutants) {
    const path = here + file;
    if (body === (env === 'SP_APP' ? app : env === 'SP_PENSEE' ? pen : sal)) { console.log('  MUTANT NOT APPLIED: ' + file); continue; }
    writeFileSync(path, body);
    try {
      const r = spawnSync(process.execPath, [me], { env: { ...process.env, [env]: env === 'SP_APP' ? path : file }, encoding: 'utf8' });
      if (r.status !== 0) dead++; else console.log('  MUTANT SURVIVED: ' + file);
    } finally { rmSync(path, { force: true }); }
  }
  console.log('mutants killed: ' + dead + '/' + mutants.length);
  assert.equal(dead, mutants.length, 'every mutant dies');
}
