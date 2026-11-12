// pnl-swaps.js — swap-derived market + optional Your PnL from DexScreener / GeckoTerminal.
// ================================================================================================
// ⛔ DATED / MEASURED ONLY. Never invent price, volume, or PnL. Fetch fails → say so.
// ⛔ CLANSY METHODE: never display sum-of-trader paper PnL as cash truth (flattering aggregate).
//    Market card = buys/sells counts + buy/sell USD volumes from the trades SAMPLE WINDOW only.
//    Your PnL = wallet-matched gecko trades only, with paper mark labeled when inventory remains.
// ✅ On-demand per profile open — no poller.
// ✅ Base mainnet token addresses. Best pair = deepest honest quote-side (not Dex inventory mark).
// ⛔ tip 2330 BRAINARM: Dex liquidity.usd / fdv often = tokens_in_pool×price (paper). Prefer ETH quote depth.

const ADRESSE = /^0x[0-9a-fA-F]{40}$/;
import { TBGAS, TBGAS_POOL_ID } from './tokenomics.js';

const DS_TOKENS = 'https://api.dexscreener.com/latest/dex/tokens/';
const DS_PAIR = (pool) => 'https://api.dexscreener.com/latest/dex/pairs/base/' + pool;
const GT_TRADES = (pool) =>
  'https://api.geckoterminal.com/api/v2/networks/base/pools/' + pool + '/trades';

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function fmtUsd(n, digits = 2) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const d = abs >= 1000 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: digits ?? d, minimumFractionDigits: 0 });
}

function fmtPx(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (n >= 1) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 8 });
}

function fmtPct(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const sign = n > 0 ? '+' : '';
  return sign + n.toLocaleString('en-US', { maximumFractionDigits: 1 }) + '%';
}

/** Honest quote-side USD from Dex pair (ETH/WETH depth), not inventory mark. */
export function profondeurQuoteUsd(pair) {
  if (!pair || !pair.liquidity) return null;
  const quote = num(pair.liquidity.quote);
  const priceUsd = num(pair.priceUsd);
  const priceNative = num(pair.priceNative);
  if (quote === null || !(quote >= 0)) return null;
  /* Native quote (ETH): convert via priceUsd/priceNative when both set. */
  if (priceUsd !== null && priceNative !== null && priceNative > 0) {
    return quote * (priceUsd / priceNative);
  }
  /* Already USD-ish quotes (USDC): quote amount ≈ USD */
  const qSym = String((pair.quoteToken && pair.quoteToken.symbol) || '').toUpperCase();
  if (qSym === 'USDC' || qSym === 'USDT' || qSym === 'DAI') return quote;
  return null;
}

/** The same rule on plain numbers: a pool "worth" `marked` dollars that holds only `quoteUsd` on its cash side is paper.
 *  Used by the server index (trending.js) and the screens, so one rule decides everywhere. null when either number is missing. */
export function liquiditePapierChiffres(marked, quoteUsd) {
  if (marked === null || marked === undefined || quoteUsd === null || quoteUsd === undefined) return null;
  const m = num(marked), q = num(quoteUsd);
  if (m === null || q === null) return null;
  if (q <= 0) return m > 100; /* any big mark with ~0 quote = paper */
  return m > Math.max(50, q * 20);
}

/** True when Dex liquidity.usd is mostly marked base inventory, not exit depth. */
export function liquiditeInventairePapier(pair) {
  return liquiditePapierChiffres(num(pair && pair.liquidity && pair.liquidity.usd), profondeurQuoteUsd(pair)) === true;
}

/* ⛔⛔ 2026-11-12 (Phil, CLOUD panel): "Market cap · life: No TB-readable pool yet" next to a price, and the Blocks ranking put
 *   CLOUD n°1 at ~$9.5B. Measured the same day on DexScreener: price $0.009494, FDV $9,494,012,163, pool "liquidity" $7.6B of
 *   which only 0.00201 WETH (~$4.11) is cash. A market value is price x supply; set by a pool holding $4, it is not a value.
 * ⇒ The value is ALWAYS given with the cash a seller can get out, and a pool too thin to trust (the rule above: the pool's
 *   dollar mark is more than 20x its cash side) says so in words and is never ranked as a real size.
 * ⛔⛔ 2026-11-12, second pass (Phil: « ne le rends pas paper only, garde que ce qui est live ») : the first pass still SHOWED the
 *   $9.5B, labelled « on paper only ». A number set by $4 is not a value with a caveat, it is no value. For a pool too thin to
 *   trust, `valeurUsd` is now null HERE, so no screen built on this rule can print it: what stays is live and measured — the
 *   price, the cash in the pool, the volume. */
/** The market value of a block as a screen may show it. { valeurUsd, profondeurUsd, mince, classable }.
 *  mince: true = priced by a pool too thin to trust (then valeurUsd is ALWAYS null); false = not thin; null = its cash side
 *  was not read. */
export function valeurMarche({ fdvUsd = null, liquiditeUsd = null, profondeurUsd = null, liquiditePapier = null } = {}) {
  const v = fdvUsd === null || fdvUsd === undefined ? null : num(fdvUsd);
  const p = profondeurUsd === null || profondeurUsd === undefined ? null : num(profondeurUsd);
  const profondeur = p !== null && p >= 0 ? p : null;
  const mince = liquiditePapier === true ? true
    : liquiditePapier === false ? false
      : liquiditePapierChiffres(liquiditeUsd, profondeur);
  const valeurUsd = mince !== true && v !== null && v > 0 ? v : null;
  return { valeurUsd, profondeurUsd: profondeur, mince, classable: valeurUsd !== null };
}

/** "$9.5B", "$735k", "$4.11", "$0.06" — short dollars for a phrase. */
export function usdPhrase(n) {
  if (n === null || n === undefined) return '—';
  const x = num(n);
  if (x === null) return '—';
  const a = Math.abs(x);
  if (a >= 1e9) return '$' + (x / 1e9).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'B';
  if (a >= 1e6) return '$' + (x / 1e6).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'M';
  if (a >= 1e4) return '$' + (x / 1e3).toLocaleString('en-US', { maximumFractionDigits: 0 }) + 'k';
  if (a >= 1) return '$' + x.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (a > 0) return '$' + Number(x.toPrecision(2));
  return '$0';
}

/** The words for a market value, always with its cash side. For a pool too thin to trust: the cash only, never a value.
 *  null when nothing was read. */
export function phraseValeurMarche(v) {
  if (!v) return null;
  if (v.mince === true) {
    return v.profondeurUsd === null ? 'Not valued: its pool holds too little cash to price it'
      : 'Not valued: its pool holds only ' + usdPhrase(v.profondeurUsd) + ' to sell into';
  }
  if (v.valeurUsd === null) return null;
  if (v.profondeurUsd === null) return '≈ ' + usdPhrase(v.valeurUsd) + ' (price × supply) · cash in its pool not read';
  return '≈ ' + usdPhrase(v.valeurUsd) + ' (price × supply) · ' + usdPhrase(v.profondeurUsd) + ' in its pool to sell into';
}

/** Score for pair pick: prefer real quote depth; demote phantom inventory marks. */
function scorePaire(pair) {
  const quoteUsd = profondeurQuoteUsd(pair) || 0;
  const marked = num(pair && pair.liquidity && pair.liquidity.usd) || 0;
  if (liquiditeInventairePapier(pair)) return quoteUsd; /* ignore flattering mark */
  return Math.max(quoteUsd, marked);
}

/**
 * Pick best Base pair from DexScreener token payload (honest quote depth first).
 * @returns {object|null}
 */
export function choisirPaireBase(pairs, jeton) {
  const want = String(jeton || '').toLowerCase();
  const list = Array.isArray(pairs) ? pairs : [];
  const base = list.filter((p) => {
    if (!p || String(p.chainId || '').toLowerCase() !== 'base') return false;
    const b = p.baseToken && String(p.baseToken.address || '').toLowerCase();
    const q = p.quoteToken && String(p.quoteToken.address || '').toLowerCase();
    return b === want || q === want;
  });
  if (!base.length) return null;
  base.sort((a, b) => scorePaire(b) - scorePaire(a));
  return base[0];
}

/**
 * Aggregate GeckoTerminal trades page into market sample + optional wallet PnL.
 * ⛔ One page only (API sample) — never pretend lifetime census.
 */
export function agregatTrades(trades, { compte, lastPx, jeton } = {}) {
  const rows = Array.isArray(trades) ? trades : [];
  let buys = 0, sells = 0, buyUsd = 0, sellUsd = 0;
  let minTs = null, maxTs = null;
  const want = compte ? String(compte).toLowerCase() : null;
  const tok = jeton ? String(jeton).toLowerCase() : null;
  let wBuyUsd = 0, wSellUsd = 0, wBuyTok = 0, wSellTok = 0, wN = 0;

  for (const t of rows) {
    const a = (t && t.attributes) || t || {};
    const kind = String(a.kind || '').toLowerCase();
    const vol = num(a.volume_in_usd) || 0;
    const ts = a.block_timestamp || null;
    if (ts) {
      if (!minTs || ts < minTs) minTs = ts;
      if (!maxTs || ts > maxTs) maxTs = ts;
    }
    if (kind === 'buy') { buys++; buyUsd += vol; }
    else if (kind === 'sell') { sells++; sellUsd += vol; }

    if (!want) continue;
    const from = String(a.tx_from_address || '').toLowerCase();
    if (from !== want) continue;
    wN++;
    const fromTok = String(a.from_token_address || '').toLowerCase();
    const toTok = String(a.to_token_address || '').toLowerCase();
    if (kind === 'buy') {
      wBuyUsd += vol;
      /* buy: token received is to_token when to matches our jeton (or unknown tok → use to_token_amount) */
      if (!tok || toTok === tok) wBuyTok += num(a.to_token_amount) || 0;
    } else if (kind === 'sell') {
      wSellUsd += vol;
      if (!tok || fromTok === tok) wSellTok += num(a.from_token_amount) || 0;
    }
  }

  const sample = {
    tradeCount: rows.length,
    buys, sells,
    buyUsd: +buyUsd.toFixed(4),
    sellUsd: +sellUsd.toFixed(4),
    minTs, maxTs,
    note: 'GeckoTerminal trades page=1 sample window — not a lifetime census',
  };

  let yourPnL = null;
  if (want) {
    const invTok = wBuyTok - wSellTok;
    const px = num(lastPx);
    const mark = (invTok > 0 && px !== null) ? invTok * px : 0;
    const realized = wSellUsd - wBuyUsd; /* approx: ignores remaining inventory */
    const totalPnL = realized + Math.max(invTok, 0) * (px !== null ? px : 0);
    yourPnL = {
      matchedTrades: wN,
      buyUsd: +wBuyUsd.toFixed(4),
      sellUsd: +wSellUsd.toFixed(4),
      invTok,
      inventoryRemains: invTok > 0,
      realizedApproxUsd: +realized.toFixed(4),
      markUsd: +(mark).toFixed(4),
      totalPnLUsd: +totalPnL.toFixed(4),
      paperMark: invTok > 0,
      note: invTok > 0
        ? 'Includes paper mark on remaining inventory at last DexScreener price — not cash'
        : (wN ? 'Inventory flat in this sample (or fully sold in window)' : 'No matching trades for this wallet in sample'),
    };
  }

  return { sample, yourPnL };
}

/**
 * Fetch DexScreener + optional Gecko trades for a Base token.
 * @param {object} o
 * @param {string} o.jeton          token address
 * @param {string} [o.compte]       wallet for Your PnL
 * @param {string} [o.poolId]       optional known pool (else best DexScreener pair)
 * @param {typeof fetch} [o.fetchFn]
 * @returns {Promise<object>}
 */
export async function lirePnlSwaps({ jeton, compte = null, poolId = null, fetchFn = fetch } = {}) {
  const luA = new Date().toISOString();
  if (!ADRESSE.test(String(jeton || ''))) {
    return { etat: 'REFUSE', pourquoi: 'not a token address', luA, lignes: [], cardHidden: true };
  }

  let ds = null;
  let dsErr = null;
  try {
    const r = await fetchFn(DS_TOKENS + jeton);
    if (!r.ok) dsErr = 'DexScreener HTTP ' + r.status;
    else ds = await r.json();
  } catch (e) {
    dsErr = 'DexScreener fetch failed: ' + (e && e.message ? e.message : 'network');
  }

  if (dsErr) {
    return {
      etat: 'NON_LUE',
      pourquoi: dsErr,
      luA,
      cardHidden: false,
      lignes: ['DexScreener: <b>fetch failed</b> — ' + enTexteSafe(dsErr) + '. No invented numbers.'],
      note: 'Source unread · ' + luA,
      pair: null,
      market: null,
      trades: null,
      yourPnL: null,
    };
  }

  let pair = choisirPaireBase(ds && ds.pairs, jeton);
  /* tip 0016: when token-pairs lags (was 0 for TBGAS), resolve known v4 poolId directly. */
  const wantJet = String(jeton || '').toLowerCase();
  const seedPool = (poolId && /^0x[0-9a-fA-F]{64}$/.test(poolId))
    ? String(poolId).toLowerCase()
    : (wantJet === String(TBGAS).toLowerCase() ? String(TBGAS_POOL_ID).toLowerCase() : null);
  if (!pair && seedPool) {
    try {
      const r = await fetchFn(DS_PAIR(seedPool));
      if (r && r.ok) {
        const j = await r.json();
        const one = (j && j.pair) || (Array.isArray(j && j.pairs) && j.pairs[0]) || null;
        if (one && String(one.chainId || '').toLowerCase() === 'base') pair = one;
      }
    } catch (_) { /* keep null */ }
  }
  if (!pair) {
    const seedUrl = seedPool ? ('https://dexscreener.com/base/' + seedPool) : null;
    return {
      etat: 'NON_TROUVEE',
      pourquoi: 'No DexScreener pair read',
      luA,
      cardHidden: false,
      lignes: ['No DexScreener pair read for this token on Base.'
        + (seedUrl ? ' Known Launch pool chart: open DexScreener.' : '')],
      note: 'DexScreener · ' + luA + ' · no pair',
      pair: seedUrl ? { address: seedPool, dexId: 'uniswap', url: seedUrl, sym: wantJet === String(TBGAS).toLowerCase() ? 'TBGAS' : null } : null,
      market: seedUrl ? { dexUrl: seedUrl, url: seedUrl, pool: seedPool, sym: wantJet === String(TBGAS).toLowerCase() ? 'TBGAS' : null } : null,
      trades: null,
      yourPnL: null,
      dexUrl: seedUrl,
    };
  }

  const priceUsd = num(pair.priceUsd);
  const liqUsd = num(pair.liquidity && pair.liquidity.usd);
  const volH24 = num(pair.volume && pair.volume.h24);
  const volH6 = num(pair.volume && pair.volume.h6);
  const txnsH24 = pair.txns && pair.txns.h24 ? pair.txns.h24 : null;
  const txnsH6 = pair.txns && pair.txns.h6 ? pair.txns.h6 : null;
  /* the window of the counts is kept with them, so the line never labels 24 h counts as 6 h */
  const fenetreH6 = !!(txnsH6 && num(txnsH6.buys) !== null);
  const buys = fenetreH6 ? num(txnsH6.buys) : (txnsH24 ? num(txnsH24.buys) : null);
  const sells = txnsH6 && num(txnsH6.sells) !== null ? num(txnsH6.sells)
    : (txnsH24 ? num(txnsH24.sells) : null);
  const pc = pair.priceChange || {};
  const priceChangeH6 = num(pc.h6);
  const priceChangeH24 = num(pc.h24);
  const pairCreatedAt = pair.pairCreatedAt != null ? Number(pair.pairCreatedAt) : null;
  const pool = poolId || pair.pairAddress || null;
  const sym = (pair.baseToken && pair.baseToken.symbol) || null;
  const dexId = pair.dexId || null;
  const labels = Array.isArray(pair.labels) ? pair.labels.join(' ') : '';

  const quoteUsdPre = profondeurQuoteUsd(pair);
  const paperLiqPre = liquiditeInventairePapier(pair);
  const market = {
    priceUsd, liqUsd, volH24, volH6,
    quoteUsd: quoteUsdPre,
    paperInventoryLiq: paperLiqPre,
    /* 2026-11-12 : a value set by a pool too thin to trust is not carried either (valeurMarche, same rule) */
    fdv: paperLiqPre ? null : num(pair.fdv),
    marketCap: paperLiqPre ? null : num(pair.marketCap),
    buys, sells,
    priceChangeH6, priceChangeH24,
    pairCreatedAt,
    pool, dexId, labels, sym,
    url: pair.url || null,
  };

  /* Optional Gecko trades — failure does not invent; market card still shows DexScreener facts. */
  let trades = null;
  let yourPnL = null;
  let geckoNote = null;
  if (pool) {
    try {
      const r = await fetchFn(GT_TRADES(pool));
      if (!r.ok) {
        geckoNote = 'GeckoTerminal trades: HTTP ' + r.status + ' (sample unread — DexScreener counts kept)';
      } else {
        const gj = await r.json();
        const agg = agregatTrades(gj.data || [], { compte, lastPx: priceUsd, jeton });
        trades = agg.sample;
        yourPnL = agg.yourPnL;
      }
    } catch (e) {
      geckoNote = 'GeckoTerminal trades fetch failed — ' + (e && e.message ? e.message : 'network');
    }
  }

  const lignes = []; /* public */
  const lignesPrivees = []; /* folded under "More details" — nothing private in it, the old label "More (private)" said so wrongly */
  const quoteUsd = profondeurQuoteUsd(pair);
  const paperLiq = liquiditeInventairePapier(pair);
  const fdv = num(pair.fdv);
  const mcap = num(pair.marketCap);
  const quoteAmt = num(pair.liquidity && pair.liquidity.quote);
  const qSym = String((pair.quoteToken && pair.quoteToken.symbol) || 'ETH');
  const valeur = valeurMarche({ fdvUsd: fdv != null ? fdv : mcap, liquiditeUsd: liqUsd, profondeurUsd: quoteUsd,
    liquiditePapier: quoteUsd == null ? null : paperLiq });
  market.valeur = valeur;

  /* tip 0013: public = price + the cash to sell into, and the market value ALWAYS next to that cash (2026-11-12).
   * ⛔ second pass (Phil, 2026-11-12) : what is LIVE only — price, cash (dollars + its own unit), 24 h volume. A pool too thin to
   *   trust gets no value line at all, only the plain reason; no dollar figure derived from its price is printed. */
  lignes.push('Price: <b>' + fmtPx(priceUsd) + '</b>'
    + (fmtPct(priceChangeH6) ? ' · h6 ' + fmtPct(priceChangeH6) : ''));
  if (quoteUsd != null) {
    lignes.push('Cash in its pool to sell into: <b>' + fmtUsd(quoteUsd) + '</b>'
      + (quoteAmt != null ? ' · ' + quoteAmt.toLocaleString('en-US', { maximumFractionDigits: 4 }) + ' ' + enTexteSafe(qSym) : ''));
  } else {
    lignes.push('Cash in its pool to sell into: <b>not read</b>');
  }
  if (volH24 != null) {
    const n24 = txnsH24 ? (num(txnsH24.buys) || 0) + (num(txnsH24.sells) || 0) : null;
    lignes.push('Traded in the last 24 hours: <b>' + usdPhrase(volH24) + '</b>'
      + (n24 ? ' · ' + n24 + (n24 === 1 ? ' trade' : ' trades') : ''));
  }
  if (valeur.mince === true) {
    lignes.push('Not valued: its pool holds too little cash to price the whole supply.');
  } else if (valeur.valeurUsd !== null) {
    lignes.push('Market value: <b>' + usdPhrase(valeur.valeurUsd) + '</b> (price × supply)'
      + (valeur.mince === null ? ' — the cash in its pool was not read.' : '.'));
  }

  if (liqUsd != null) {
    /* a paper mark is not printed even folded: only the fact that the pool is mostly its own tokens */
    lignesPrivees.push(paperLiq ? 'Most of its pool is its own tokens, not cash.'
      : 'Pool size as DexScreener shows it: <b>' + usdPhrase(liqUsd) + '</b>.');
  }
  if (buys != null || sells != null) {
    const volF = fenetreH6 ? volH6 : volH24;
    lignesPrivees.push((fenetreH6 ? 'Last 6 hours: ' : 'Last 24 hours: ')
      + (buys != null ? buys + (buys === 1 ? ' buy' : ' buys') : 'buys not read') + ', '
      + (sells != null ? sells + (sells === 1 ? ' sell' : ' sells') : 'sells not read')
      + (volF != null ? ' · ' + usdPhrase(volF) + ' traded' : ''));
  }
  if (trades && trades.tradeCount > 0) {
    lignesPrivees.push('Latest ' + trades.tradeCount + ' trades: ' + usdPhrase(trades.buyUsd) + ' bought, ' + usdPhrase(trades.sellUsd) + ' sold');
  } else if (geckoNote) {
    lignesPrivees.push('Latest trades: could not be read right now.');
  }
  if (pairCreatedAt) {
    try {
      lignesPrivees.push('Pool opened ' + new Date(pairCreatedAt).toISOString().slice(0, 10)
        + (dexId ? ' on ' + enTexteSafe(dexId) : ''));
    } catch (_) {}
  }
  if (yourPnL) {
    if (yourPnL.matchedTrades === 0) {
      lignesPrivees.push('Your result: none of the latest trades came from your wallet');
    } else {
      lignesPrivees.push('Your result in the latest trades: ' + fmtUsd(yourPnL.totalPnLUsd)
        + (yourPnL.paperMark ? ' (counts what you still hold at today\'s price — not cash)' : '')
        + ' · ' + yourPnL.matchedTrades + (yourPnL.matchedTrades === 1 ? ' trade' : ' trades'));
    }
  }

  const note = 'measured ' + luA;

  return {
    etat: 'LUE',
    pourquoi: null,
    luA,
    cardHidden: false,
    lignes,
    lignesPrivees,
    note,
    pair: { address: pool, dexId, url: pair.url, sym },
    market,
    dexUrl: pair.url || (pool ? ('https://dexscreener.com/base/' + pool) : null),
    trades,
    yourPnL,
    geckoNote,
  };
}

function enTexteSafe(s) {
  return String(s || '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
}

/** Format helpers exported for dig / tests. */
export const _fmt = { fmtUsd, fmtPx, fmtPct };
