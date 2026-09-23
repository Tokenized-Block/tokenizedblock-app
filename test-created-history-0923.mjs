import { readFileSync } from 'fs';
const h = readFileSync('./app.html', 'utf8');

const need = [
  ['tip', 'data-build="20260923-created-history"'],
  ['tip comment', 'tip 20260923-created-history'],
  ['Created all births', "if (liveFiltre === 'CREATION') return e.type === 'CREATION';"],
  ['TB paid partition', "liveFiltre === 'CREATION_TB') return e.type === 'CREATION' && e.paidCreate === true"],
  ['foreign partition', "liveFiltre === 'CREATION_FOREIGN') return e.type === 'CREATION' && e.paidCreate !== true"],
  ['LIVE_HISTOIRE', 'LIVE_HISTOIRE_BLOCS = 12000'],
  ['auto ancien budget', 'liveAuto * LIVE_FENETRE < LIVE_HISTOIRE_BLOCS'],
  ['LIVE_FENETRE 999', 'LIVE_FENETRE = 999'],
  ['Created title', 'All factory births in this Live window'],
  ['IB CTA 0.001', 'data-tf-act="instant-birth-tb">Instant Birth on TB · 0.001 ETH'],
  ['paid-first sort', "liveFiltre === 'CREATION' || liveFiltre === 'CREATION_TB' || liveFiltre === 'CREATION_FOREIGN'"],
  ['foreign chip', 'data-filtre="CREATION_FOREIGN"'],
  ['TB paid chip', 'data-filtre="CREATION_TB"'],
];
for (const [label, s] of need) {
  if (!h.includes(s)) throw new Error('missing ' + label + ': ' + s.slice(0, 120));
}

// Created must NOT be paid-only twin of TB·paid
if (h.includes("liveFiltre === 'CREATION') return e.type === 'CREATION' && e.paidCreate === true")) {
  throw new Error('Created still paid-only (reclaim regression)');
}

// NEVER LIVE_FENETRE > 999
const fen = h.match(/LIVE_FENETRE\s*=\s*(\d+)/);
if (!fen || Number(fen[1]) > 999) throw new Error('LIVE_FENETRE > 999 or missing: ' + (fen && fen[0]));

if (h.includes('Fees for Dev')) throw new Error('Fees for Dev');
const horsScript = h.replace(/<script[\s\S]*?<\/script>/gi, '');
const visible = horsScript.replace(/<!--[\s\S]*?-->/g, '');
if (/≈\s*\$1|~\s*\$1/.test(visible)) throw new Error('≈$1 in visible HTML');
if (/Fees for Dev/i.test(horsScript)) throw new Error('Fees for Dev visible');
const ui = horsScript.match(/<(?:button|a|span|b|p)[^>]*>[^<]*a6cf[^<]*</gi) || [];
if (ui.length) throw new Error('a6cf in UI: ' + ui.join('|'));
if (h.includes('data-build="20260923-wallet-intent-market"')) throw new Error('old wallet-intent tip left');
if (h.includes('data-build="20260923-reclaim-volume"')) throw new Error('old reclaim tip left');

console.log('ok created-history');
