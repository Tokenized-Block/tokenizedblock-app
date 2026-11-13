// test-no-fee-address-shown-20261026.mjs — NO FEE ADDRESS IS EVER DISPLAYED (game57 item 10, 2026-10-26).
// ================================================================================================
// ⛔ WHAT WAS SEEN (prod 20261026-game56, Market tab, Skins section): « Skin #1 dresses UNIT · Not listed · held by 0x…(shortened) » —
//    the shortened address was the fee wallet's. Rule (Phil): no fee address, whole or shortened, in any letter
//    case, is rendered in the interface (text, title, aria, tooltip). The constants stay in the code (on-chain routing untouched).
// WHAT THIS TEST PROVES:
//   A. the Skins card (skmLigne of app.html + detenteurCourt of skins-marche.js) RENDERED in a fake DOM shows no fee address,
//      nor « held by » / « seller » followed by it; another address is still shown (no blind masking). In LF AND in CRLF.
//   B. the helpers of frais-creation.js (isFeeAddress, displayShort, maskFeeAddresses) mask every form and leave
//      other addresses alone; the routing constants have not moved.
//   C. the real shorteners (court / courtAdr / bvCourt of app.html, nomDe of apercu.js) go through the mask.
//   D. STATIC GUARD on EVERY served file (SERVIS list of serveur-web.js): no literal abbreviation of a fee address,
//      no fee constant concatenated into displayed text, no new raw address shortener outside the reviewed list.
import { readFileSync, existsSync } from 'node:fs';

let ok = 0, ko = 0;
const check = (cond, what) => { if (cond) { ok += 1; console.log('  ok  ' + what); } else { ko += 1; console.log('  KO  ' + what); } };
const read = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8');

/* the fee addresses, here only (a test is not served) */
const A6 = '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4';
const L37 = '0x37eb9b7ce0b51fe12fbf092026e001918128580a';
const OTHER = '0x1234567890abcdef1234567890abcdef12345678';
/* any visible trace: the whole address, its shortened heads (6, 8, 10 first characters), its 4-character tail */
const LEAK = /a6cf99|0xa6cf|f0f5d4|0x37eb|128580a|f5d4\b|580a\b/i;
const noLeak = (t) => !LEAK.test(String(t));

/* ─────────────────────────────── B. the helpers of frais-creation.js ─────────────────────────────── */
console.log('B. frais-creation.js: the mask');
const FC = await import('./frais-creation.js');
check(FC.FEE_WALLET.toLowerCase() === A6 && FC.WALLET_TRESOR_SMART.toLowerCase() === A6 && FC.CREATE_ROUTER_FEE_WALLET.toLowerCase() === A6
  && FC.HOOK_FEE_WALLET.toLowerCase() === A6 && FC.FEE_WALLET_LEGACY_37EB.toLowerCase() === L37, 'B0 on-chain routing untouched: the fee constants have not changed');
const helpers = ['isFeeAddress', 'displayShort', 'maskFeeAddresses', 'feeAddressLabel'].filter((k) => typeof FC[k] === 'function');
check(helpers.length === 4, 'B1 frais-creation.js exports isFeeAddress, displayShort, maskFeeAddresses, feeAddressLabel (' + helpers.join(', ') + ')');
if (helpers.length === 4) {
  const forms = [A6, A6.toUpperCase().replace('0X', '0x'), '0xa6cF99D35949c6cB911adB910078F4Ca46F0f5d4', L37, L37.toUpperCase().replace('0X', '0x')];
  check(forms.every((a) => FC.isFeeAddress(a)) && !FC.isFeeAddress(OTHER) && !FC.isFeeAddress('') && !FC.isFeeAddress(null), 'B2 isFeeAddress: any case, both wallets; not another address');
  check(forms.every((a) => noLeak(FC.displayShort(a)) && FC.displayShort(a).length > 0), 'B3 displayShort(fee address) shows nothing of it: « ' + FC.displayShort(A6) + ' » / « ' + FC.displayShort(L37) + ' »');
  check(FC.displayShort(OTHER) === '0x1234…5678', 'B4 displayShort(other) = 0x1234…5678 (no blind masking)');
  const sentence = 'to ' + forms.join(' and ') + ' then ' + OTHER;
  const m = FC.maskFeeAddresses(sentence);
  check(noLeak(m) && m.includes(OTHER), 'B5 maskFeeAddresses removes the 5 forms and keeps the other one: « ' + m.slice(0, 120) + '… »');
  check(FC.feeAddressLabel(OTHER) === null && noLeak(FC.feeAddressLabel(A6)) && !!FC.feeAddressLabel(A6), 'B6 feeAddressLabel: a name for a fee wallet, null otherwise');
}

/* ─────────────────────────────── A. the rendered Skins card ─────────────────────────────── */
console.log('A. the Skins card (Market tab) rendered in a fake DOM');
class Txt { constructor(t) { this.t = String(t); } get textContent() { return this.t; } }
class El {
  constructor(tag) { this.tag = tag; this.kids = []; this.attrs = {}; this.dataset = {}; this.className = ''; this.value = ''; this.classList = { add() {}, remove() {} }; }
  set textContent(v) { this.kids = [new Txt(v)]; }
  get textContent() { return this.kids.map((k) => k.textContent).join(''); }
  append(...k) { this.kids.push(...k.map((x) => (typeof x === 'string' ? new Txt(x) : x))); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  addEventListener() {}
  querySelector() { return null; }
  after() {}
}
/* everything a human can read: the text, and the title / aria-label / placeholder / value attributes */
const visible = (n) => (n instanceof Txt ? n.t : [n.textContent, ...['title', 'aria-label', 'placeholder'].map((k) => n.attrs[k] || ''), n.value || '']
  .concat(n.kids.filter((k) => k instanceof El).map(visible)).join(' | '));
const bcEl = (tag, opts = {}, kids = []) => {
  const e = new El(tag);
  for (const [k, v] of Object.entries(opts || {})) { if (k === 'cls') e.className = v; else if (k === 'text') e.textContent = v; else e.setAttribute(k, v); }
  e.append(...kids);
  return e;
};
const fakeDocument = { createElementNS: (ns, t) => new El(t), createTextNode: (t) => new Txt(t) };
const SM = await import('./skins-marche.js');
const BS = await import('./blockskins.js');

/* extraction: the WHOLE function (up to the next function), and the `const court` line of app.html — found, otherwise KO */
const extract = (src) => {
  const m = src.match(/\r?\nfunction skmLigne\(s, moi, t\) \{/);
  const rest = m ? src.slice(m.index + m[0].indexOf('function')) : '';
  const f = rest.search(/\r?\n\}\r?\n/);
  const body = f < 0 ? '' : rest.slice(0, f) + '\n}';
  const court = (src.match(/^const court = [^\r\n]+/m) || [''])[0];
  return { body, court };
};
const render = (src, s, moi, label) => {
  const { body, court } = extract(src);
  const found = /^function skmLigne\(s, moi, t\) \{/.test(body) && /return li;\s*\}$/.test(body) && /detenteurCourt\(s, moi\)/.test(body) && /^const court = \(a\) =>/.test(court);
  check(found, label + ': skmLigne (' + body.length + ' chars) and const court extracted from app.html');
  if (!found) return null;
  const params = ['document', 'bcEl', 'apercuSkinFormes', 'statutSkin', 'detenteurCourt', 'gestesSkin', 'tempsRestant', 'offreMinimale', 'montantOffre', 'brutVersTexteSkin',
    'bcMontantSkin', 'bcResoudre', 'bcDevisesSkin', 'bcActionMarche', 'bcFormVendreSkin', 'montantVersBrut', 'UNIT_APP', 'displayShort', 'isFeeAddress', 'feeAddressLabel', 'nomSkin', 'detailSkin'];
  const make = new Function(...params, court + '\n' + body + '\nreturn skmLigne;');
  const skmLigne = make(fakeDocument, bcEl, SM.apercuSkinFormes, SM.statutSkin, SM.detenteurCourt, SM.gestesSkin, SM.tempsRestant, BS.offreMinimale, SM.montantOffre, SM.brutVersTexte,
    (raw) => String(raw) + ' USDC', () => ({ sym: null }), () => ({}), () => {}, () => new El('form'), (x) => BigInt(x), '0xb2000000000000000000007afa7ed748b0874f27',
    FC.displayShort, FC.isFeeAddress, FC.feeAddressLabel, BS.nomSkin, BS.detailSkin); /* game390: the skin's app-wide name */
  try { return visible(skmLigne(s, moi, 1000)); } catch (e) { check(false, label + ': skmLigne threw ' + e.message); return null; }
};
const UNIT = '0xb2000000000000000000007afa7ed748b0874f27';
const recipe = { teintes: [10, 20, 30, 40, 50, 60, 70] };
const skin = (o) => ({ tokenId: 1n, block: UNIT, recette: recipe, enVente: false, enchere: false, prix: 0n, offre: 0n, fin: 0, devise: FC.USDC_BASE.toLowerCase(), ...o });
const appLF = read('app.html').replace(/\r\n/g, '\n');
const appCRLF = appLF.replace(/\n/g, '\r\n');
for (const [src, eol] of [[appLF, 'LF'], [appCRLF, 'CRLF']]) {
  const free = render(src, skin({ detenteur: A6 }), null, 'A1 ' + eol);
  if (free !== null) {
    check(noLeak(free), 'A2 ' + eol + ' unlisted skin held by the fee wallet: no trace of its address — « ' + free.replace(/\s+/g, ' ').slice(0, 140) + ' »');
    check(!/held by/i.test(free) && /Not listed/.test(free), 'A3 ' + eol + ' « Not listed » without « held by » when the holder is the fee wallet');
  }
  const mixed = render(src, skin({ detenteur: '0xa6cF99D35949c6cB911adB910078F4Ca46F0f5d4' }), null, 'A4 ' + eol);
  if (mixed !== null) check(noLeak(mixed) && !/held by/i.test(mixed), 'A5 ' + eol + ' same with the address in mixed case (checksum)');
  const legacy = render(src, skin({ detenteur: L37 }), null, 'A6 ' + eol);
  if (legacy !== null) check(noLeak(legacy) && !/held by/i.test(legacy), 'A7 ' + eol + ' same with the old fee wallet (37eb)');
  const sale = render(src, skin({ detenteur: A6, enVente: true, prix: 5000000n }), null, 'A8 ' + eol);
  if (sale !== null) check(noLeak(sale) && !/seller/i.test(sale) && /For sale/.test(sale), 'A9 ' + eol + ' for sale by the fee wallet: « For sale · … » without « seller » or address');
  const auction = render(src, skin({ detenteur: A6, enVente: true, enchere: true, prix: 5000000n, fin: 99999 }), null, 'A10 ' + eol);
  if (auction !== null) check(noLeak(auction) && !/seller/i.test(auction) && /Auction/.test(auction), 'A11 ' + eol + ' auction by the fee wallet: without « seller » or address');
  const other = render(src, skin({ detenteur: OTHER }), null, 'A12 ' + eol);
  if (other !== null) check(/Not listed · held by 0x1234…5678/.test(other), 'A13 ' + eol + ' another address is still said: « held by 0x1234…5678 »');
  const mine = render(src, skin({ detenteur: OTHER }), OTHER, 'A14 ' + eol);
  if (mine !== null) check(/held by you/.test(mine), 'A15 ' + eol + ' one\'s own: « held by you »');
}
check(SM.detenteurCourt(skin({ detenteur: A6 }), null) === null && SM.detenteurCourt(skin({ detenteur: OTHER }), null) === '0x1234…5678',
  'A16 detenteurCourt: null for a fee wallet (nothing to say), the short address otherwise');

/* ─────────────────────────────── C. the real shorteners ─────────────────────────────── */
console.log('C. the real address shorteners go through the mask');
if (helpers.length === 4) {
  for (const name of ['court', 'courtAdr']) {
    const l = (appLF.match(new RegExp('^const ' + name + ' = [^\\r\\n]+', 'm')) || [''])[0];
    check(!!l, 'C0 app.html: const ' + name + ' found');
    if (!l) continue;
    const f = new Function('displayShort', 'isFeeAddress', 'feeAddressLabel', l + '\nreturn ' + name + ';')(FC.displayShort, FC.isFeeAddress, FC.feeAddressLabel);
    check(noLeak(f(A6)) && noLeak(f(L37)) && f(OTHER) === '0x1234…5678', 'C1 app.html ' + name + ': « ' + f(A6) + ' », other = ' + f(OTHER));
  }
  /* 2026-10-26 (integration game57/series): the brain's 3D view (game57 #4) writes a neighbour's address on the canvas
   *   (ctx.fillText(... bvCourt(v.adr))) — a sink the generic pattern does not see. So bvCourt goes through the mask. */
  const lb = (appLF.match(/^const bvCourt = [^\r\n]+/m) || [''])[0];
  check(!!lb, 'C3 app.html: const bvCourt found');
  if (lb) {
    const f = new Function('displayShort', 'isFeeAddress', 'feeAddressLabel', lb + '\nreturn bvCourt;')(FC.displayShort, FC.isFeeAddress, FC.feeAddressLabel);
    const fp = '0xabc123';
    check(noLeak(f(A6)) && noLeak(f(L37)) && noLeak(f(A6.toUpperCase().replace('0X', '0x'))) && f(OTHER) === '0x123456…5678' && f(fp) === fp,
      'C4 app.html bvCourt (3D brain neighbour, fingerprints): « ' + f(A6) + ' », other = ' + f(OTHER) + ', short unchanged = ' + f(fp));
  }
  /* game57 #4b reworded the canvas label (« … · not read »); game57 #4c (b) builds canvas labels with bvLabelItem(...) and paints
   * them later (placeLabels): every canvas fillText / bvLabelItem line that writes an `.adr` goes through bvCourt / displayShort */
  const canvasAdr = appLF.split('\n').filter((l) => /fillText\(|bvLabelItem\(/.test(l) && /\.adr\b/.test(l));
  check(canvasAdr.length > 0 && canvasAdr.every((l) => /bvCourt\(\w+\.adr\)|displayShort\(/.test(l)) && !/fillText\([^\n]*\.slice\(-4\)/.test(appLF),
    'C5 app.html: the ' + canvasAdr.length + ' canvas fillText / bvLabelItem line(s) writing an address go through bvCourt (masked), no fillText shortens an address by itself');
  const AP = await import('./apercu.js');
  const n = AP.nomDe(A6, { chaine: 8453 }), n2 = AP.nomDe(OTHER, { chaine: 8453 });
  check(noLeak(n) && /fee wallet/i.test(n) && n2 === '0x1234…5678', 'C2 apercu.js nomDe(fee wallet) = « ' + n + ' » (before signing: named, no address); other = ' + n2);
}

/* ─────────────────────────────── E. the brain's inspector (game57 #4b) ─────────────────────────────── */
/* 2026-10-26 (integration game57/series): the Inspect book and the pick overlay of « View inside the brain » show the block's
 *   creator, its neighbours and its logs IN FULL — a block created by the operator wallet would show it. Both display functions of
 *   inspect-block.js (fieldText, describeTarget) go through maskFeeAddresses. */
console.log('E. inspect-block.js: what the inspector displays');
{
  const IB = await import('./inspect-block.js');
  const shown = [
    IB.fieldText({ status: 'read', key: 'creator', value: A6 }),
    IB.fieldText({ status: 'read', key: 'neighboursNearby', value: [{ adr: A6, distance: 3 }, { adr: L37.toUpperCase().replace('0X', '0x'), distance: 9 }] }),
    IB.fieldText({ status: 'read', key: 'thoughts', value: [{ tick: 4, texte: 'paid ' + A6 }] }),
    IB.fieldText({ status: 'read', key: 'spoken', value: [{ heure: '10:00', texte: 'hello ' + L37 }] }),
  ];
  check(shown.every(noLeak), 'E1 fieldText (creator, neighbours nearby, thoughts, spoken) never shows a fee address: « ' + shown.join(' | ').slice(0, 160) + ' »');
  check(IB.fieldText({ status: 'read', key: 'creator', value: OTHER }) === OTHER, 'E2 fieldText keeps any other address whole (no blind masking)');
  const d = IB.describeTarget({ kind: 'neighbour', adr: A6, sym: null }, {}, null);
  const dText = d ? [d.title, ...d.lines.map((l) => l.label + ': ' + l.value)].join(' | ') : '';
  check(!!d && noLeak(dText), 'E3 describeTarget(neighbour = fee wallet) shows no trace of it: « ' + dText.slice(0, 140) + ' »');
  const o = IB.describeTarget({ kind: 'neighbour', adr: OTHER, sym: null }, {}, null);
  check(!!o && o.lines.some((l) => l.value === OTHER), 'E4 describeTarget keeps another neighbour address');
}

/* ─────────────────────────────── D. the static guard on every served file ─────────────────────────────── */
console.log('D. static guard: every served file');
const srv = read('serveur-web.js');
const block = (srv.match(/const SERVIS = \[([\s\S]*?)\r?\n\];/) || [])[1] || '';
const served = [...new Set([...block.replace(/\/\*[\s\S]*?\*\//g, ' ').matchAll(/'([^'\s]+\.(?:html|js|mjs|json|txt|css|svg))'/g)].map((m) => m[1]))];
check(served.length > 100 && served.includes('app.html') && served.includes('skins-marche.js'), 'D0 SERVIS list read from serveur-web.js: ' + served.length + ' files (app.html, skins-marche.js included)');
/* comments removed WHILE KEEPING line numbers; // removed outside URLs (https://) */
const bare = (s) => s.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\r\n]/g, ' ')).replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\r\n]/g, ' '))
  .split(/\r?\n/).map((l) => l.replace(/(^|[^:'"\\])\/\/.*$/, '$1'));
const SHORTENED = /0x(?:a6cf|37eb)[0-9a-f]{0,36}(?:…|\.\.\.|\\u2026)/i;
const ID = '(?:FEE_WALLET|WALLET_TRESOR_SMART|CREATE_ROUTER_FEE_WALLET|HOOK_FEE_WALLET|FEE_WALLET_LEGACY_37EB|OPERATEUR|WALLET_FRAIS|feeWallet|walletDesFrais|devWallet|operateur)';
/* a fee constant in DISPLAY position: concatenated to text, passed to an escaper/createTextNode, or assigned to a sink */
const DISPLAYED = new RegExp('(?:\\+\\s*(?:String\\()?\\s*(?:[\\w.]+\\.)?' + ID + '\\b(?!\\s*(?:===|!==|\\.toLowerCase\\(\\)\\s*(?:===|!==))))'
  + '|(?:\\b' + ID + '\\b(?:\\.slice\\([^)]*\\))?\\s*\\+)'
  + '|(?:(?:txt|enTexte|esc|createTextNode)\\(\\s*(?:[\\w.]+\\.)?' + ID + '\\b)'
  + '|(?:(?:textContent|innerHTML|innerText|title|ariaLabel)\\s*\\+?=\\s*(?:[\\w.]+\\.)?' + ID + '\\b)');
const MASK = /maskFeeAddresses|displayShort|feeAddressLabel/;
/* the NOT displayed uses, reviewed one by one: an explorer URL (href), calldata (pad / slice(2)) */
const NOT_DISPLAYED = /'\/address\/' \+ (?:[\w.]+\.)?FEE_WALLET;?$|\.slice\(2\)|padStart|pad\(/;
const SHORTENER = /([\w.$()[\]]+)\.slice\(0, ?\d+\) ?\+ ?'(?:…|\.\.\.)' ?\+ ?\1\.slice\(-\d+\)/;
/* the RAW shorteners that remain, reviewed: each shortens a TOKEN, a CONTRACT or a block — never a wallet. A new
 *   address shortener must go through displayShort (frais-creation.js), otherwise this test turns red. */
const REVIEWED = [
  ['app.html', "return a.slice(0, 6) + '…' + a.slice(-4);\n}", 'token symbol (unknown currency)'],
  ['app.html', "' (' + a.slice(0, 6) + '…' + a.slice(-4) + ')'", 'swap router (routeurCourt)'],
  ['app.html', "tp.contrat.slice(0, 6) + '…' + tp.contrat.slice(-4)", 'TicketPot contract'],
  ['app.html', "t.slice(0, 6) + '…' + t.slice(-4);", 'duel token (symDuel)'],
  ['app.html', "String(j).slice(0, 6) + '…' + String(j).slice(-4)", 'token (post on X)'],
  ['app.html', "saved.slice(0, 6) + '…' + saved.slice(-4)", 'hub block (x2)'],
  ['app.html', "m[0].slice(0, 6) + '…' + m[0].slice(-4)", 'hub block'],
  ['app.html', "j.slice(0, 6) + '…' + j.slice(-4)", 'hub block'],
  ['app.html', "sel.value.slice(0, 6) + '…' + sel.value.slice(-4)", 'hub block (x2)'],
  ['app.html', "|| b.slice(0, 6) + '…' + b.slice(-4)) + '</option>'", 'block created by this wallet (/api/blocks-de list)'],
  ['brain-os.js', "a.slice(0, 6) + '…' + a.slice(-4)", 'token symbol'],
  ['paires.js', "p.adr.slice(0, 6) + '…' + p.adr.slice(-4)", 'B20 pair'],
  ['pont-de-liquidite.js', "String(a).slice(0, 6) + '…' + String(a).slice(-4)", 'bridge token'],
  ['route-multi-factory.js', "String(a).slice(0, 6) + '…' + String(a).slice(-4)", 'route token'],
  ['app.html', "String(r.hash).slice(0, 10) + '…' + String", 'transaction hash'],
  ['index.html', "hash.slice(0, 10) + '…' + hash.slice(-6)", 'transaction hash (x2)'],
  ['index.html', "a.block.slice(0, 10) + '…' + a.block.slice(-4)", 'market block'],
];
let linesRead = 0;
const leaks = [];
for (const f of served) {
  if (!/\.(html|js|mjs)$/.test(f) || !existsSync(new URL('./' + f, import.meta.url))) continue;
  const src = read(f), lines = bare(src.replace(/\r\n/g, '\n'));
  lines.forEach((l, i) => {
    linesRead += 1;
    const where = f + ':' + (i + 1);
    if (SHORTENED.test(l)) leaks.push(where + ' literal abbreviation of a fee address');
    if (DISPLAYED.test(l) && !MASK.test(l) && !NOT_DISPLAYED.test(l.trim())) leaks.push(where + ' fee constant displayed: ' + l.trim().slice(0, 110));
    if (SHORTENER.test(l) && !MASK.test(l) && !REVIEWED.some(([rf, piece]) => rf === f && (l.includes(piece) || (piece.includes('\n') && (l + '\n' + (lines[i + 1] || '')).includes(piece)))))
      leaks.push(where + ' raw address shortener (go through displayShort): ' + l.trim().slice(0, 110));
  });
}
check(linesRead > 50000, 'D1 served code lines read: ' + linesRead);
for (const x of leaks) console.log('      ' + x);
check(leaks.length === 0, 'D2 no displayable fee address in the served code (' + leaks.length + ' leak(s))');

/* the repaired sinks that no generic pattern sees (a value read on chain or a constructor parameter): pinned */
const PINNED = [
  ...['deploy-v4.html', 'deploy-v5.html', 'deploy-v6.html', 'deploy-v7.html', 'deploy-v8.html', 'deploy-7030.html'].flatMap((f) => [
    [f, /\$\('#fee'\)\.textContent = /], [f, /' fee wallet: ' \+ /]]),
  ['deploy-pot.html', /\$\('#fee'\)\.textContent = /], ['deploy-pot.html', /' operator: ' \+ /],
  ['deployer-blockskins.html', /\$\('#dFrais'\)\.textContent = /], ['deployer-blockskins.html', /\$\('#rLu'\)\.textContent = /], ['deployer-blockskins.html', /'Connected: ' \+ /],
  ...['deployer-blockrolls.html', 'deployer-duels.html', 'deployer-duels-v2.html', 'deployer-missions.html', 'deployer-slots.html', 'deployer-ticketpot.html'].flatMap((f) => [
    [f, /\$\('#dParams'\)\.innerHTML = /], [f, /\$\('#rLu'\)\.textContent = /], [f, /'Connected: ' \+ /]]),
  ['pot.html', /\$\('#connecter'\)\.textContent = compte/], ['pot.html', /<tr><td><code>' \+ txt\(/],
  ['reclamer.html', /\$\('#connecter'\)\.textContent = compte/], ['reclamer.html', /compte = c\[0\]; \$\('#connecter'\)\.textContent = /],
  ['frais.html', /\$\('#compteTxt'\)\.textContent = 'Connected: /],
  ['index.html', /function raccourciAdr\(a\) \{[\s\S]{0,200}?return /],
  ['app.html', /\$\('#pCompte'\)\.textContent = /], ['app.html', /'Switch to the verifier wallet[ (]*' \+ /], ['app.html', /drawn: ' \+ \(dd\.winner === moi \? 'you won ' : /],
  ['brain-jeu.js', /wait for the verifier wallet[ (]*' \+ /],
  ['brain-os.js', /^const ligne = \(texte, classe = ''\) => /m],
];
for (const [f, re] of PINNED) {
  const src = read(f).replace(/\r\n/g, '\n');
  const m = src.match(new RegExp(re.source + '[^\\n]*(?:\\n[^\\n]*){0,2}', re.flags));
  const masked = !!m && MASK.test(m[0].split('\n').slice(0, /raccourciAdr/.test(re.source) ? 6 : /#connecter/.test(re.source) ? 2 : 1).join('\n'));
  check(masked, 'D3 ' + f + ' ' + re.source.slice(0, 60) + ': ' + (m ? (masked ? 'goes through the mask' : 'DISPLAYED WITHOUT MASK — « ' + m[0].split('\n')[0].trim().slice(0, 90) + ' »') : 'sink not found'));
}

console.log('\n' + ok + ' ok, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
