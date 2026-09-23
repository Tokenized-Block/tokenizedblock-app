import { readFileSync } from 'fs';
import { CLES_MARCHE } from './marche.js';
import { HOOK_V8, HOOK_V3 } from './tokenomics.js';

const h = readFileSync('./app.html', 'utf8');
const need = [
  ['tip', 'data-build="20260923-created-history"'],
  ['wallet-intent retained', 'tip 20260923-wallet-intent-market'],
  ['pret fail-closed', 'basculerChaine(CHAINE)'],
  ['pret Switch copy', 'Switch to Base to continue'],
  ['pret Retry', 'pretRetryChain'],
  ['intent poser', 'poserIntent'],
  ['intent resume', 'reprendreIntentApresConnect'],
  ['wallet_connect_ok', "etape('wallet_connect_ok')"],
  ['wallet_connect_refus', "etape('wallet_connect_refus')"],
  ['wallet_no_provider', "etape('wallet_no_provider')"],
  ['chain_switch_ok', "etape('chain_switch_ok')"],
  ['chain_switch_refus', "etape('chain_switch_refus')"],
  ['ib_preflight_ok', "etape('ib_preflight_ok')"],
  ['ib_balance_short', "etape('ib_balance_short')"],
  ['ib_preflight_fail', "etape('ib_preflight_fail')"],
  ['create_sign_propos', "etape('create_sign_propos')"],
  ['create_sign_refus', "etape('create_sign_refus')"],
  ['achat_prepare', "etape('achat_prepare')"],
  ['achat_sign_propos', "etape('achat_sign_propos')"],
  ['achat_sign_refus', "etape('achat_sign_refus')"],
  ['achat_ok', "etape('achat_ok')"],
  ['Market unread retry', 'Market unread — retry'],
  ['Re-scan market', 'id="pRescanMarche"'],
  ['No TB-readable', 'No TB-readable pool yet'],
  ['cles no empty cache', 'only cache positive cles'],
  ['enrich 50k', 'head - 50000'],
  ['vivant enrich', 'if (etatVieProfil === \'NON_TROUVEE\')'],
];
for (const [label, s] of need) {
  if (!h.includes(s)) throw new Error('missing ' + label + ': ' + s.slice(0, 80));
}
if (h.includes('id="peFrais" hidden style="display:none"')) throw new Error('peFrais display:none');
if (h.includes('Fees for Dev')) throw new Error('Fees for Dev');
const horsScript = h.replace(/<script[\s\S]*?<\/script>/gi, '');
if (/≈\s*\$1|~\s*\$1/.test(horsScript.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('≈$1 in visible HTML');
if (/Fees for Dev/i.test(horsScript)) throw new Error('Fees for Dev');
const ui = horsScript.match(/<(?:button|a|span|b|p)[^>]*>[^<]*a6cf[^<]*</gi) || [];
if (ui.length) throw new Error('a6cf in UI');
if (!h.includes('grid-template-columns:repeat(8,1fr)')) throw new Error('nav not 8 cols');
if (h.includes('data-build="20260923-reclaim-volume"')) throw new Error('old reclaim tip left');
if (h.includes('data-build="20260923-wallet-intent-market"')) throw new Error('old wallet-intent tip left');

// CLES_MARCHE must try HOOK_V8 before legacy
const iV8 = CLES_MARCHE.findIndex((c) => c.hooks && String(c.hooks).toLowerCase() === HOOK_V8.toLowerCase());
const iV3 = CLES_MARCHE.findIndex((c) => c.hooks && String(c.hooks).toLowerCase() === HOOK_V3.toLowerCase());
if (iV8 < 0) throw new Error('CLES_MARCHE missing HOOK_V8');
if (iV3 < 0) throw new Error('CLES_MARCHE missing HOOK_V3');
if (iV8 > iV3) throw new Error('HOOK_V8 should precede HOOK_V3');

// pret must return false when switch fails — static shape
if (!/const ok = await basculerChaine\(CHAINE\);\s*\n\s*if \(ok !== true\)/.test(h)) {
  throw new Error('pret fail-closed shape missing');
}
// clesReelles must NOT set [] on ok:false
if (/ok === false\)\s*clesReelles\.set\(k,\s*\[\]\)/.test(h)) {
  throw new Error('clesReelles still caches empty on ok:false');
}
console.log('ok wallet-intent-on-created-history');
