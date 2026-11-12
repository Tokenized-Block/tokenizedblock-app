/* test-telegram-ready-370-20261111.mjs — the holders' channel card must not show a dead button.
 * On prod the invite answered TELEGRAM_NOT_CONFIGURED (tblock-hold.js telegramInvite: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID unset), yet
 * holders.html offered "Sign and get my Telegram invite" and the app's Wallet tab linked to it.
 * Now: GET /api/tblock/hold (already read by holders.html and the app) carries telegramReady, a BOOLEAN only (never the token nor the
 * chat id), computed by the same rule the invite uses; the page and the app show "Holders' channel: opening soon" with no button until
 * it is true (fail closed: not read = not ready).
 * Part B LAUNCHES the real serveur-web.js (a copy of the root files, fake RPC that refuses everything, so no chain and no Telegram call).
 * DOES NOT PROVE: that a real bot invite works once the env is set (that needs the real token, never read here). */
import { readFileSync, promises as fsp, mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as HOLD from './tblock-hold.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
let ok = 0, ko = 0;
const t = (m, c, extra = '') => { if (c) { ok++; console.log('ok  ' + m); } else { ko++; console.log('KO  ' + m + (extra ? ' :: ' + extra : '')); } };

/* ── A. tblock-hold.js: one rule for "configured", shared with the invite ── */
const cfg = HOLD.telegramConfigured;
t('A1 telegramConfigured is exported', typeof cfg === 'function');
if (typeof cfg === 'function') {
  t('A2 token + chat id -> true (strict boolean)', cfg({ token: 'T', chatId: '-100' }) === true);
  t('A3 no token -> false', cfg({ token: '', chatId: '-100' }) === false);
  t('A4 no chat id -> false', cfg({ token: 'T', chatId: '' }) === false);
  t('A5 blanks only -> false', cfg({ token: '   ', chatId: ' ' }) === false);
  t('A6 nothing -> false (never throws)', cfg() === false && cfg({}) === false);
}
{
  const r = await HOLD.telegramInvite({ token: '  ', chatId: '-100', wallet: '0x' + '1'.repeat(40), nowS: 1, fetchImpl: async () => { throw new Error('must not be called'); } });
  t('A7 the invite uses the SAME rule: a blank token is NOT_CONFIGURED, Telegram not called', r.ok === false && r.state === 'TELEGRAM_NOT_CONFIGURED', JSON.stringify(r));
}

/* ── B. the real server: GET /api/tblock/hold says telegramReady, boolean only ── */
const libre = () => new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const tmp = [];
async function copieRacine() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'tb-tg370-')); tmp.push(dir);
  const ent = (await fsp.readdir(ICI, { withFileTypes: true })).filter((f) => f.isFile());
  await Promise.all(ent.map(async (f) => { try { await fsp.copyFile(path.join(ICI, f.name), path.join(dir, f.name)); } catch (e) { if (!e || e.code !== 'ENOENT') throw e; } }));
  return dir;
}
function rpcRefuse() {
  return http.createServer((req, res) => { req.resume(); req.on('end', () => { res.writeHead(500); res.end('no'); }); });
}
const FAKE_TOKEN = '123456:FAKE_token_for_bench_only_xyz', FAKE_CHAT = '-1009999988877';
async function lireHold(dir, env) {
  const rpc = rpcRefuse(); const pr = await libre(); await new Promise((r) => rpc.listen(pr, '127.0.0.1', r));
  const port = await libre(); const vol = mkdtempSync(path.join(os.tmpdir(), 'tb-tg370-vol-')); tmp.push(vol);
  const u = 'http://127.0.0.1:' + pr;
  const enfant = spawn(process.execPath, [path.join(dir, 'serveur-web.js')], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_OPTIONS: '', PORT: String(port), BASE_RPC: u, BASE_RPC_LECTURE: u, RAILWAY_VOLUME_MOUNT_PATH: vol, TB_NOS_CREATEURS: '',
      TB_SONDES: '0', TB_REPLIS: '0', TB_ARCHIVE_BANC: '', TELEGRAM_WEBHOOK_SECRET: '', TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '', ...env } });
  let journal = '', mort = false; enfant.stdout.on('data', (d) => { journal += d; }); enfant.stderr.on('data', (d) => { journal += d; }); enfant.on('exit', () => { mort = true; });
  const out = { body: null, texte: '', walletBody: null };
  try {
    const t0 = Date.now();
    while (Date.now() - t0 < 60000 && !mort) {
      try {
        const r = await fetch('http://127.0.0.1:' + port + '/api/tblock/hold', { signal: AbortSignal.timeout(20000) });
        out.texte = await r.text(); out.body = JSON.parse(out.texte);
        const rw = await fetch('http://127.0.0.1:' + port + '/api/tblock/hold?wallet=0x' + '2'.repeat(40), { signal: AbortSignal.timeout(20000) });
        out.texteW = await rw.text(); out.walletBody = JSON.parse(out.texteW);
        break;
      } catch (_) { await new Promise((r) => setTimeout(r, 500)); }
    }
  } finally { enfant.kill('SIGKILL'); await new Promise((r) => rpc.close(r)); }
  if (!out.body) console.log('server log tail:\n' + journal.slice(-1500));
  return out;
}
{
  const dir = await copieRacine();
  const off = await lireHold(dir, {});
  t('B1 bot NOT configured: GET /api/tblock/hold answers telegramReady === false', off.body && off.body.telegramReady === false, off.texte.slice(0, 300));
  t('B2 ... also on the wallet read', off.walletBody && off.walletBody.telegramReady === false, String(off.texteW || '').slice(0, 300));
  const on = await lireHold(dir, { TELEGRAM_BOT_TOKEN: FAKE_TOKEN, TELEGRAM_CHAT_ID: FAKE_CHAT });
  t('B3 bot configured: telegramReady === true', on.body && on.body.telegramReady === true, on.texte.slice(0, 300));
  t('B4 ... also on the wallet read', on.walletBody && on.walletBody.telegramReady === true, String(on.texteW || '').slice(0, 300));
  const tout = String(on.texte) + String(on.texteW);
  t('B5 the answer never carries the token nor the chat id (any part of them)', !tout.includes('FAKE_token') && !tout.includes('123456:') && !tout.includes('9999988877'));
  const halfOn = await lireHold(dir, { TELEGRAM_BOT_TOKEN: FAKE_TOKEN, TELEGRAM_CHAT_ID: '' });
  t('B6 token without chat id: telegramReady === false (same rule as the invite)', halfOn.body && halfOn.body.telegramReady === false, halfOn.texte.slice(0, 300));
}
for (const d of tmp) { try { rmSync(d, { recursive: true, force: true }); } catch (_) { /* best effort */ } }

/* ── C. holders.html: no button until telegramReady === true ── */
const H = readFileSync(new URL('./holders.html', import.meta.url), 'utf8');
t('C1 holders.html is LF only', !H.includes('\r'));
{
  const carte = (H.match(/<div class="card" id="tgCarte">[\s\S]*?\n<\/div>/) || [''])[0];
  t('C2 the channel card opens CLOSED in the HTML, titled with the exact words "Holders\' channel: opening soon"', /<h2 id="tgTitre">Holders' channel: opening soon<\/h2>/.test(carte) && /id="tgBientot"/.test(carte), carte.slice(0, 200));
  t('C3 the button lives in a block that is HIDDEN in the HTML (no flash of a dead button before the flag is read)', /<div id="tgOuvert" hidden>[\s\S]*<button id="signer" disabled>Sign and get my Telegram invite<\/button>[\s\S]*<\/div>/.test(carte));
  t('C4 the closed state is visible in the HTML by default', /<p class="note" id="tgBientot">/.test(carte));
  /* run the page's own painter on stubs */
  const src = (H.match(/function peindreTg\(pret\) \{[\s\S]*?\n\}/) || [''])[0];
  t('C5 peindreTg is in the page', !!src);
  if (src) {
    const els = { '#tgOuvert': { hidden: true }, '#tgBientot': { hidden: false }, '#tgTitre': { textContent: '' }, '#signer': { disabled: true } };
    const $ = (s) => els[s];
    let etatTg = { pret: false };
    const run = (v) => new Function('$', 'TGP', src + '\npeindreTg(' + JSON.stringify(v) + '); return TGP;')($, etatTg);
    for (const v of [false, undefined, null, 'true', 1]) {
      run(v);
      t('C6 telegramReady=' + JSON.stringify(v) + ' -> button block hidden, "opening soon" shown', els['#tgOuvert'].hidden === true && els['#tgBientot'].hidden === false && /opening soon/.test(els['#tgTitre'].textContent));
    }
    run(true);
    t('C7 telegramReady === true -> button block shown, "opening soon" hidden', els['#tgOuvert'].hidden === false && els['#tgBientot'].hidden === true && els['#tgTitre'].textContent === "Join the holders' channel");
    run(false);
    t('C8 back to false hides it again', els['#tgOuvert'].hidden === true && els['#tgBientot'].hidden === false);
  }
  t('C9 the flag is read from the price read (every 30 s) and from the wallet read', /lirePrix\(\) \{[\s\S]*?peindreTg\(p\.telegramReady\)/.test(H) && /h = await api\('\/api\/tblock\/hold\?wallet=' \+ w\);[\s\S]*?peindreTg\(h\.telegramReady\)/.test(H));
  t('C10 the sign button is enabled only when the channel is open', /\$\('#signer'\)\.disabled = !\(h\.ok && h\.challenge && TGP\.pret\);/.test(H));
  /* 2026-11-12 (UI copy rule, Phil): the badge says "coming soon", one wording for everything not live yet */
  t('C11 the perk row says "coming soon" while the bot is not configured', /TGP\.pret \? null : VENIR\(\)\]/.test(H) && H.includes("const VENIR = () => '<span class=\"st na\">coming soon</span>';"));
}

/* ── D. app.html (Wallet > Holders vault card): the link to the channel only when telegramReady === true ── */
const A = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
t('D1 app.html is LF only', !A.includes('\r'));
{
  const bloc = (A.match(/\/\* game345 \(Phil\): a visible link to the holders' channel[\s\S]*?catch \(_\) \{ \/\* not read: no link, never a wrong one \*\/ \}/) || [''])[0];
  t('D2 the block is found', !!bloc);
  t('D3 the link is created only under telegramReady === true', /if \(h\.telegramReady === true\) \{[\s\S]*?a\.href = 'holders\.html'[\s\S]*?\} else \{/.test(bloc));
  t('D4 otherwise the exact words, no link', /d\.textContent = 'You hold \$' \+ Number\(h\.usd\)\.toFixed\(2\) \+ ' of TBLOCK · Holders’ channel: opening soon';/.test(bloc));
  /* D5 removed at commit time (game370): a test must not pin the build stamp, it goes red on every release */
}

console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
