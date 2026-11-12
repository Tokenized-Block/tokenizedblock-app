/* test-frais-verite-374-20261112.mjs — THE FEES PAGE SAYS ONLY WHAT IS TRUE (game374).
 *
 * WHY: an audit of https://tokenizedblock.space/frais-et-risques.html (2026-11-12, every claim checked against the code and the chain by
 *   eth_call) found 40 sentences that were false, misleading, stale or unverifiable: the 0.1% shown as the rate of EVERY block (V8 blocks pay
 *   0.5%), « 0.2% below $100 / 0.1% from $100 » (the floor makes it 0.1% only from $200, and the trade panel never reads the price -> 0.2%),
 *   « nothing comes back » on hearts (the vault rebate), « up to 4 years » (the app offers 365 days), « The app shows no Buy » for taxing
 *   launchpad pools (3 quoted rows had a Buy), « the owner can never withdraw the pot » (the owner can replace the verifier), etc.
 * THIS TEST asserts each corrected sentence by its audit id, from the SAME sources the page reads (and, for the numbers, with a source changed:
 *   the page must follow). It is RED on the old code:
 *     VERITE_REF=HEAD node test-frais-verite-374-20261112.mjs   (reads frais-risques.js, the html and the server files from git HEAD)
 *   and GREEN on the corrected tree:  node test-frais-verite-374-20261112.mjs
 * DOES NOT PROVE: that a sentence matches what a contract does on chain TODAY — the chain values the page relies on were read by eth_call for
 *   the audit and are recorded where the code keeps them (tokenomics.js HOOK_7030_LU, frais-risques.js MESURE_BUYBACK, pool-lanceur-taxe.js
 *   MESURE_ALLER_RETOUR); this test is offline. Nor the rendering in a browser. */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const REF = process.env.VERITE_REF || null;
const lireSrc = (f) => (REF ? execFileSync('git', ['show', REF + ':' + f], { cwd: ICI, encoding: 'utf8' }) : readFileSync(path.join(ICI, f), 'utf8'));
let n = 0, ko = 0;
const t = (id, nom, c) => { n += 1; if (c) console.log('ok  ' + id + ' ' + nom); else { ko += 1; console.log('KO  ' + id + ' ' + nom); } return c; };

/* the page module: the working tree, or REF's text written next to its imports for the run (removed at once) */
let FR;
if (REF) {
  const tmp = path.join(ICI, '.verite374-' + process.pid + '.mjs');
  writeFileSync(tmp, lireSrc('frais-risques.js'));
  try { FR = await import(pathToFileURL(tmp).href); } finally { unlinkSync(tmp); }
} else FR = await import(pathToFileURL(path.join(ICI, 'frais-risques.js')).href);
const imp = (f) => import(pathToFileURL(path.join(ICI, f)).href);
const TK = await imp('tokenomics.js'), HD = await imp('hook-7030-descripteur.js'), PA = await imp('paires.js'), FD = await imp('frais-degressif.js');
const FC = (await imp('frais-contrats.js')).FRAIS_CONTRATS, EC = await imp('economie.js'), ED = (await imp('economie-deploiement.js')).ECONOMIE_DEPLOIEMENT;
const CO = (await imp('block-contest-deploiement.js')).CONTEST_DEPLOIEMENT, LK = await imp('lock.js'), PV = await imp('points-vue.js');
const TR = await imp('tblock-route.js'), PLT = await imp('pool-lanceur-taxe.js');

const texte = (html) => String(html).replace(/<[^>]+>/g, ' ').replace(/&#39;/g, '\'').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const C = FR.CHIFFRES;
const brut = FR.rendre(C, null), txt = texte(brut);
const off = texte(FR.rendre(C, { regleur: { etat: 'OFF' } }));
const clone = () => structuredClone(C);
const avec = (mod) => { const c = clone(); mod(c); return texte(FR.rendre(c, null)); };
const pct = (bps) => FR.pctBps(BigInt(bps));

/* ---- H-1 / F-trade-1: the V8 rate is on the page, and the description no longer says « every number read from the files » */
const html = lireSrc('frais-et-risques.html');
t('H-1', 'meta description: the rates come from the app\'s files and contracts', html.includes('The rates come from the app\'s files and contracts.') && !html.includes('read from the files the app runs'));
const v8 = pct(TK.fraisHookBps(TK.HOOK_V8));
t('F-trade-1', 'the current-hook row is labelled as such', txt.includes('Trade a block 0.1%'));
t('H-1/F-trade-1', 'a row for blocks born on the earlier market contract (no version name on screen), at fraisHookBps(V8) = ' + v8, txt.includes('Trade a block born on the earlier market contract ' + v8) && txt.includes(v8 + ' of each buy and sell, all of it to TokenizedBlock'));
t('F-trade-1', 'the V8 rate follows its source (fraisHookBps changed -> page changes)', C.hook && C.hook.v8Bps !== undefined && avec((c) => { c.hook.v8Bps = 70n; }).includes('Trade a block born on the earlier market contract 0.7%'));

/* ---- F-trade-4: the creator part, its gate, its payment, and where it goes when the gate is closed (MODE_COLLATERAL read on chain) */
t('F-trade-4', 'the creator part needs the deposit at its minimum and no withdrawal asked; it builds up and anyone can trigger it',
  txt.includes('0.03% to the block\'s creator while their deposit stays at or above its minimum and no withdrawal has been asked; that share builds up in the hook and anyone can trigger its payment to the creator.'));
t('F-trade-4', 'mode 1 (read on chain, tokenomics HOOK_7030_LU): otherwise still taken, locked as collateral', TK.HOOK_7030_LU && TK.HOOK_7030_LU.modeCollateral === 1
  && txt.includes('Otherwise that 0.03% is still taken and stays locked in the hook as the block\'s collateral: nothing pays it out.'));
t('F-trade-4', 'the sentence follows the mode (mode 0 -> not charged)', C.hook.modeCollateral !== undefined && avec((c) => { c.hook.modeCollateral = 0; }).includes('Otherwise that 0.03% is not charged.'));

/* ---- F-trade-5: the paired currencies, from the hook's descriptor minus the stocks */
const actions = new Set(PA.ACTIONS_COINBASE.map((a) => a.adr.toLowerCase()));
const horsActions = HD.DESCRIPTEUR_7030.devises.filter((d) => !actions.has(d.adresse.toLowerCase())).map((d) => d.sym);
t('F-trade-5', 'paired currencies = descriptor minus stocks (' + horsActions.join(', ') + ')', horsActions.length >= 3 && txt.includes('Always in the paired currency (' + horsActions.join(', ') + ' or the stock), never in the block.'));

/* ---- F-route-6: the tiers as frais-degressif.js applies them, and the trade panel's missing price */
const P0 = FD.PALIERS[0], P1 = FD.PALIERS[1];
const plancher = P0.jusquaUsd * Number(P0.bps) / 10000, atteint = plancher * 10000 / Number(P1.bps);
t('F-route-6', 'the code: exactly $' + P0.jusquaUsd + ' pays ' + pct(P0.bps) + ' (usd <= jusquaUsd)', FD.bpsPourUsd(P0.jusquaUsd) === P0.bps);
const f150 = FD.fraisPourMontant({ montant: 150000000n, decimales: 6, prixUsd: 1 }), f250 = FD.fraisPourMontant({ montant: 250000000n, decimales: 6, prixUsd: 1 });
t('F-route-6', 'the code: $150 pays the $' + plancher.toFixed(2) + ' floor, $250 pays ' + pct(P1.bps), f150.frais === 200000n && f250.frais === 250000n);
t('F-route-6', 'the page: ' + pct(P0.bps) + ' up to $' + P0.jusquaUsd + ', never below $' + plancher.toFixed(2) + ', ' + pct(P1.bps) + ' from $' + atteint,
  txt.includes(pct(P0.bps) + ' up to $' + P0.jusquaUsd + '; above $' + P0.jusquaUsd + ' the fee never drops below $' + plancher.toFixed(2) + ', so the rate falls gradually and reaches ' + pct(P1.bps) + ' from $' + atteint));
const rails = readFileSync(path.join(ICI, 'rails-api.js'), 'utf8');
const prix = [...rails.matchAll(/prixUsdEntree:\s*([^,}\s]+)/g)].map((m) => m[1]);
t('F-route-6', 'rails-api.js passes prixUsdEntree null on all ' + prix.length + ' plans -> the page says the panel pays ' + pct(FD.BPS_MAX), prix.length > 0 && prix.every((x) => x === 'null')
  && txt.includes('When the app cannot read a USD price for what you pay, ' + pct(FD.BPS_MAX) + ' applies at any size; routes built by the trade panel do not read that price today, so they pay ' + pct(FD.BPS_MAX) + '.'));

/* ---- F-holder-1 / F-holder-2: the exemption's scope, and its own threshold (tblock-hold-regle.js, not the heart rule) */
let HR = null; try { HR = await imp('tblock-hold-regle.js'); } catch (_) { HR = null; }
t('F-holder-1', 'the row names its two routes and the trade panel', txt.includes('TBLOCK holders: TBLOCK and USDC ↔ stock trades 0% app fee') && txt.includes('on USDC ↔ stock trades on Aerodrome made from the trade panel.'));
t('F-holder-1', 'what still pays: a stock bought from its own page (' + pct(C.cl.bps) + '), single v4 markets, multi-pool routes',
  txt.includes('A stock bought from its own page still pays ' + pct(C.cl.bps) + ', and other routes (a single Uniswap v4 market, a route through several pools) still pay their app fee.'));
t('F-holder-2', 'the threshold is the fee rule\'s own (tblock-hold-regle.js), re-exported by tblock-hold.js', !!HR && C.holder && C.holder.seuilUsd === HR.HOLD_THRESHOLD_USD
  && /export \{ HOLD_THRESHOLD_USD \}/.test(lireSrc('tblock-hold.js')) && /tsHead - HOLD_PRICE_LOOKBACK_S/.test(lireSrc('tblock-hold.js')));
t('F-holder-2', 'a changed holder threshold moves the fee rows, not the heart rule', !!C.holder && (() => { const x = avec((c) => { c.holder.seuilUsd = 20; });
  return x.includes('A wallet holding at least $20 of TBLOCK pays no app fee') && x.includes('falls below $20') && x.includes('$' + C.coeur.seuilUsd + ' of TBLOCK (the app\'s rule)'); })());
t('F-holder-2', 'the price look-back is said from HOLD_PRICE_LOOKBACK_S', !!HR && txt.includes('the lower of the price now and about ' + Math.round(HR.HOLD_PRICE_LOOKBACK_S / 60) + ' minutes ago'));

/* ---- F-tb-2: the TBLOCK route as tblock-route.js builds it; a sell pays out in USDC only */
const T = TK.TBLOCK;
t('F-tb-2', 'tblock-route.js: no TBLOCK -> ETH leg; the sell is v4 then Aerodrome; ETH buys go through USDC',
  TR.routeTblockDe(T, TR.ETH) === null && TR.routeTblockDe(T, TR.USDC) === 'TBLOCK>USDC'
  && TR.cheminRouteTblock('TBLOCK>USDC').map((s) => s.famille).join(',') === 'uniswap-v4,aerodrome'
  && TR.cheminRouteTblock('ETH>TBLOCK')[0].vers === TR.USDC);
t('F-tb-2', 'the page says it', txt.includes('A sell goes TBLOCK → wtCOIN on Uniswap v4 → USDC on Aerodrome and pays out in USDC only.') && !txt.includes('reversed for a sell'));

/* ---- F-birth-5/6/8/9/11 */
t('F-birth-5', 'the creator minimum: $' + PA.CAUTION_CREATEUR_USD + ' at today\'s price or the hook\'s fixed floor', txt.includes('You also deposit a creator minimum: $' + PA.CAUTION_CREATEUR_USD
  + ' of the paired currency at today\'s price, or the hook\'s fixed floor for that currency if higher (the hook refuses less than its floor).') && !txt.includes('a minimum of about $1'));
t('F-birth-5', 'the dollar figure follows paires.js', !!C.naissanceCaution && avec((c) => { c.naissanceCaution.usd = 2; }).includes('creator minimum: $2 of the paired currency'));
t('F-birth-6', 'held by the hook; a request, then DELAI_RETRAIT (' + TK.HOOK_7030_LU?.delaiRetraitS + ' s, read on chain)', !!TK.HOOK_7030_LU
  && txt.includes('It stays yours, held by the market\'s hook; taking it back takes a request, then ' + (TK.HOOK_7030_LU.delaiRetraitS / 86400) + ' days, and the creator share stops at the request.')
  && /604 800 s = 7 jours/.test(readFileSync(path.join(ICI, 'caution-createur.js'), 'utf8')));
t('F-birth-8', 'the $' + C.naissanceUsd + ' covers the fee and the vault part; deposit, gas and pool fees on top', txt.includes('The app offers the birth as $' + C.naissanceUsd
  + ': the 0.001 ETH fee plus the rest in TBLOCK for the holders vault; the creator deposit, gas and the TBLOCK buy\'s pool fees are on top.') && !/as \$\d+ in all/.test(txt));
const app = readFileSync(path.join(ICI, 'app.html'), 'utf8');
t('F-birth-9', 'the pre-birth TBLOCK buy is said (app.html acheterTblockAvantNaissance exists)', app.includes('acheterTblockAvantNaissance')
  && txt.includes('If your wallet lacks that TBLOCK, the app first offers to buy it with ETH (no app fee; pool fees and the TBLOCK hook apply)'));
t('F-birth-11', 'declining that buy stops the attempt (app.html: « The birth was not started. »); only the vault transfer is optional', app.includes('The birth was not started.')
  && txt.includes('if you decline that buy, this birth attempt stops and nothing is sent.') && txt.includes('skipping that one never undoes the birth.') && !txt.includes('skipping it never stops the birth'));

/* ---- F-pass-4 / F-pass-7 / R-pass-3 */
const rollsSol = readFileSync(path.join(ICI, 'contracts/src/BlockRolls.sol'), 'utf8');
t('F-pass-4', 'one entry per wallet per UTC day (BlockRolls entered[day][msg.sender])', /entered\[day\]\[msg\.sender\]/.test(rollsSol)
  && txt.includes('one entry per wallet in that UTC day\'s pass pot (a second pass the same day adds to the pot but not a second entry)'));
t('F-pass-7', 'the week bonus once per wallet per week (tirage-saison.js: « ne cumule pas »)', /ne cumule pas/.test(readFileSync(path.join(ICI, 'tirage-saison.js'), 'utf8'))
  && txt.includes('bonus entries in that week\'s pot (once per wallet per week; a second pass the same week adds none).'));
t('R-pass-3', 'the pass pot is a draw to ONE buyer; most get nothing', txt.includes('The pass pot is a draw: the whole pot of a UTC day goes to ONE of that day\'s buyers (one entry per wallet).')
  && txt.includes('most buyers get nothing from it.') && !txt.includes('your share of the pass pot is that day\'s pot divided by its buyers'));

/* ---- F-mis-3 / F-duel-4: a wallet, not a pool contract */
t('F-mis-3', 'missions: community reward wallet, not a contract', txt.includes('community reward wallet 7% (a wallet TokenizedBlock holds, not a contract)') && !/earn pool/.test(txt));
t('F-duel-4', 'duels: the reward pool wallet is an ordinary wallet', txt.includes('7% to the reward pool wallet (an ordinary wallet, not a contract: what it pays out is decided by whoever holds it, not by code)') && !/community reward pool/.test(txt));

/* ---- F-heart-2: burned, never refunded — and the vault rebate, from the vault's config */
const VC = ED.vault.config;
t('F-heart-2', 'hearts: never refunded + the vault rebate (' + pct(VC.rebateBps) + ', ' + (VC.claimWindow / 86400) + ' days, ' + EC.fmt(EC.CLAIM_MIN_HOLD) + ' TBLOCK)',
  txt.includes('Sent to the dead address (burned): the TBLOCK you pay is never refunded.') && txt.includes('each player at most ' + pct(VC.rebateBps) + ' of what they burned, plus, for the week\'s top player, a bonus capped at another '
  + pct(VC.rebateBps) + ' of what they burned; claimed within ' + (VC.claimWindow / 86400) + ' days by a wallet holding at least ' + EC.fmt(EC.CLAIM_MIN_HOLD) + ' TBLOCK') && !/burned\); nothing comes back/.test(txt));
t('F-heart-2', 'the rebate follows its source', C.coeur.rabaisBps !== undefined && avec((c) => { c.coeur.rabaisBps = 4000n; }).includes('at most 40% of what they burned'));
/* review game374: TBlockVault.owed caps the share AND the top bonus each at spent * REBATE_BPS -> the top player can get 2x; « in all, at most 50% » was false */
const vaultSol = readFileSync(path.join(ICI, 'contracts/src/TBlockVault.sol'), 'utf8');
t('F-heart-2', 'the top player\'s bonus is said (owed(): topBonus capped at the same cap), never « in all, at most »', /if \(topBonus > cap\) topBonus = cap;/.test(vaultSol) && /if \(share > cap\) share = cap;/.test(vaultSol)
  && !txt.includes('in all, at most') && txt.includes('a bonus capped at another ' + pct(VC.rebateBps)));

/* ---- F-contest-6: settle by someone, the quorum, the rollover — from the contest's config */
const cc = CO.config;
t('F-contest-6', 'quorum ' + cc.minQualifiedEntries + ' entries x ' + cc.minVotes + ' votes x ' + cc.minVoters + ' wallets, else rollover; settle is sent by someone',
  txt.includes('anyone (the winner too) can send settle; nothing sends it on its own.') && txt.includes('pays ' + pct(cc.split1) + ' of the pot to the top entry, but only if at least '
  + cc.minQualifiedEntries + ' entries each got ' + cc.minVotes + ' or more votes from ' + cc.minVoters + ' or more wallets; otherwise the whole pot rolls over to later rounds (any part no later round has room for is burned).'));
t('F-contest-6', 'the quorum follows its source', C.contest.minVotes !== undefined && avec((c) => { c.contest.minVotes = 5; }).includes('each got 5 or more votes'));

/* ---- F-bank-4 */
t('F-bank-4', 'the borrow fee: last call of a batch, or a separate transfer', txt.includes('sent to TokenizedBlock right after the borrow: the last call of one batch if your wallet can batch, otherwise a separate transfer your wallet asks you to sign right after the loan.')
  && !txt.includes('in the same batch, after the borrow'));

/* ---- F-lock-3 / F-lock-4 */
const maxLock = Number(FC.TBlockLock ? FC.TBlockLock.MAX_LOCK : NaN);
t('F-lock-3', 'MAX_LOCK generated from TBlockLock.sol = 4 * 365 days, same source as lock-deploiement.js', maxLock === 4 * 365 * 86400
  && FC.TBlockLock.sha256Source === (await imp('lock-deploiement.js')).LOCK_DEPLOIEMENT.sha256Source);
t('F-lock-3', 'the page: ' + Math.min(...LK.DUREES_JOURS) + ' to ' + Math.max(...LK.DUREES_JOURS) + ' days in the app, the contract up to ' + maxLock / 86400 + ' days',
  txt.includes('You lock your own TBLOCK for ' + Math.min(...LK.DUREES_JOURS) + ' days to ' + Math.max(...LK.DUREES_JOURS) + ' days in the app (the contract itself accepts up to ' + maxLock / 86400 + ' days)') && !txt.includes('4 years'));
t('F-lock-3', 'lock.js never builds a date past MAX_LOCK (j*86400 + margin)', /j > MAX_JOURS/.test(lireSrc('lock.js'))
  && (REF ? true : (LK.MAX_JOURS * 86400 + LK.MARGE_SECONDES <= maxLock && (() => { try { LK.dateDeverrou(LK.MAX_JOURS + 1, 1); return false; } catch (_) { return true; } })())));
t('F-lock-4', 'points: counted by our server while active, the rule from points-vue.js REGLE_COURTE', txt.includes('While the lock is active (its date ahead, no exit requested), our server counts community points from its on-chain events.')
  && txt.includes(PV.REGLE_COURTE) && !txt.includes('; it earns community points.'));

/* ---- F-ticket-1 / G-week-1 / G-week-3 */
t('F-ticket-1', 'the ticket: no entry fee, what it gives, the fees of the volume', /Daily ticket no entry fee/.test(txt) && txt.includes('that day\'s ticket is yours: 1 entry in that week\'s reward pot.')
  && txt.includes('the trades or rolls that make the volume pay their own fees.') && !/Daily ticket free/.test(txt));
const tpSol = readFileSync(path.join(ICI, 'contracts/src/TicketPot.sol'), 'utf8');
/* review game374: fund() has no caller check and rollover()/absorb() add to TODAY's pot -> « only a manual deposit from TokenizedBlock » was false */
t('G-week-1', 'no deposit before the day (TicketPot FutureDay); anyone can fund or roll leftovers in; nothing promised', /if \(day > today\(\)\) revert FutureDay\(\);/.test(tpSol)
  && /function fund\(uint32 day, uint256 amount\) external nonReentrant \{/.test(tpSol) && /function rollover\(uint32 day\) external nonReentrant/.test(tpSol)
  && txt.includes('the contract refuses deposits before that day. On that day anyone can deposit USDC into it (TokenizedBlock does so by hand) or roll an earlier day\'s unclaimed leftovers into it. Nothing fills it automatically, and no amount is promised.')
  && !txt.includes('only a manual deposit'));
t('G-week-3', 'shares paid only when the verifier signs and someone claims within GRACE (' + (Number(FC.TicketPot ? FC.TicketPot.GRACE : 0) / 86400) + ' days)', !!FC.TicketPot
  && txt.includes('each share is paid only when TokenizedBlock\'s verifier signs it and the holder (or anyone) claims it within ' + Number(FC.TicketPot.GRACE) / 86400 + ' days')
  && !txt.includes('the pot is shared by entries after the week closes'));

/* ---- R-custody-5 / R-draw-5: the keeper's state is READ (/api/slots), never typed; no count of keys */
t('R-custody-5', 'no « two operational keys »; the keeper\'s scope', !/two operational keys/.test(txt) && txt.includes('a game keeper that settles slot spins, winning rolls and joined duels, and closes and draws the pass day'));
t('R-custody-5', 'keeper OFF read -> said; not read -> said', off.includes('closes and draws the pass day (not running today (off, read from our server))') && txt.includes('closes and draws the pass day (its state was not read just now)'));
/* review game374: slots-regleur.js also reports 'ARRETE' (stopped after failures); the page said « running » for any state but OFF */
const etatPage = (e) => texte(FR.rendre(C, { regleur: { etat: e } }));
const arrete = etatPage('ARRETE'), on = etatPage('ON');
t('R-custody-5', 'keeper ARRETE -> not running (stopped); only ON -> running', /etat = 'ARRETE'/.test(readFileSync(path.join(ICI, 'slots-regleur.js'), 'utf8'))
  && arrete.includes('(not running today (stopped, read from our server))') && !arrete.includes('running today, read') && arrete.includes('its game keeper is not running (read from our server).')
  && on.includes('(running today, read from our server)') && on.includes('Our server\'s game keeper is running (read from our server)') && !etatPage('XYZ').includes('running today, read'));
t('R-custody-5', 'the page fetches the keeper state from /api/slots', html.includes('/api/slots') && /live\.regleur = \{ etat: s\.regleur\.etat \}/.test(html));
t('R-draw-5', 'only yesterday from the Game tab; older days by the contract; the server keeper read', txt.includes('anyone can close and draw yesterday\'s pass pot from the Game tab; older days are not offered there and can only be drawn by calling the contract directly.')
  && off.includes('Our server does not draw them today: its game keeper is not running (read from our server).') && !txt.includes('Anyone can draw from the Game tab.'));

/* ---- R-fly-4 / R-fly-5 */
t('R-fly-4', 'the caps live in the page code, not a contract', txt.includes('It can spend only what its wallet holds (the budget and gas you sent). Its caps are enforced by this site\'s page code, not by a contract, so you trust the site\'s code with that budget.'));
t('R-fly-5', 'Stop / Withdraw all: what they do and when they cannot help', txt.includes('Withdraw all sends what the fly wallet holds (stocks as stocks, USDC, ETH) back to the wallet that funded it.')
  && txt.includes('Your real protection is a small budget.') && !txt.includes('Stop and Withdraw all are your protection'));

/* ---- R-duel-8 (v2 branch: forced deployed in a copy, since the sentence lives there) */
const v2 = (() => { const c = clone(); c.duels.v2 = { deploye: true, adresse: '0x' + '1'.repeat(40) }; return texte(FR.rendre(c, null)); })();
t('R-duel-8', 'an unjoined duel: refund by anyone after expiry, nothing automatic, the creator can cancel', v2.includes('A duel nobody joined can be refunded to its creator once it expires: anyone can send that refund, nothing sends it on its own, and until someone joins, the creator can cancel it at any time.')
  && !v2.includes('goes back to its creator once it expires'));

/* ---- R-luck-2 / R-data-2 / R-data-3 */
t('R-luck-2', 'the sequencer could steer a hash; the game trusts it', txt.includes('so it could in principle steer a block\'s hash; the game trusts it not to.') && !txt.includes('the same trust as every block'));
t('R-data-2', 'softened: « it aims to say so »', txt.includes('Where the app could not read something, it aims to say so instead of showing a guess.'));
t('R-data-3', 'the wallet preview is not the final word', txt.includes('the result is settled on chain (a swap lands within its slippage limit, a spin\'s outcome comes from later blocks)') && !txt.includes('final word'));

/* ---- R-launch-3/4/5: the newest measure, computed; and the server reads the tax BEFORE a Buy */
const M = PLT.MESURE_ALLER_RETOUR;
t('R-launch-3', 'about 0.01% of the ETH it paid (' + (M ? M.rendusWei + ' / ' + M.payeWei : 'no measure') + ', ' + (M ? M.date : '') + ')', !!M
  && txt.includes('a wallet not on the hook\'s list that bought and then sold everything got back about 0.01% of the ETH it paid, in a test on a copy of the chain (' + M.date + ')') && !txt.includes('0.0099%'));
t('R-launch-4', 'the 2026-10-26 count (' + (M ? M.poolsVides + ' / ' + M.poolsLues : '') + '), not the stale 15 of 15', !!M && txt.includes('on ' + M.date + ', ' + M.poolsVides + ' of ' + M.poolsLues + ' we read were empty') && !txt.includes('15 of 15'));
const srv = lireSrc('serveur-web.js');
t('R-launch-5', 'the server reads the hook\'s tax before a Buy (gardeTaxeAvantAchat wired before the verdict is kept)', /gardeTaxeAvantAchat\(\{ appel: \(to, data\) => rpcRails\('eth_call'/.test(srv)
  && srv.indexOf('gardeTaxeAvantAchat({ appel') < srv.indexOf('if (!lectureRatee) achatsParJeton.set(jeton'));
const w = (x) => '0x' + BigInt(x).toString(16).padStart(64, '0');
const faux = (tax, den) => async (_to, data) => { const f = data.endsWith(PLT.SEL_TAX_BPS) ? tax : den; return typeof f === 'function' ? f() : f; };
const revert = () => { const e = new Error('execution reverted'); e.definitif = true; throw e; };
const hook = '0x' + '2'.repeat(40);
const g = typeof PLT.gardeTaxeAvantAchat === 'function' ? PLT.gardeTaxeAvantAchat : null;
t('R-launch-5', 'guard: 9999/10000 -> TAXE_REVENTE; a revert (no taxBps) -> null; a node failure -> TAXE_NON_LUE; 0.3% -> null; zero hook -> null', !!g
  && (await g({ hook, appel: faux(w(9999), w(10000)) }))?.code === 'TAXE_REVENTE'
  && (await g({ hook, appel: faux(revert, w(1)) })) === null
  && (await g({ hook, appel: faux(() => { throw new Error('HTTP 429'); }, w(1)) }))?.code === 'TAXE_NON_LUE'
  && (await g({ hook, appel: faux(w(30), w(10000)) })) === null
  && (await g({ hook: '0x' + '0'.repeat(40), appel: faux(w(9999), w(10000)) })) === null);
t('R-launch-5', 'the page says the tax is read before a Buy, cap ' + Math.round(PLT.TAXE_MAX_FRACTION * 100) + '%', txt.includes('our server reads the resale tax that hook reports (taxBps()) and refuses above ' + Math.round(PLT.TAXE_MAX_FRACTION * 100) + '%, and if that read fails, it shows no Buy.'));
/* review game374: a hook without taxBps() -> null -> the Buy stays (guard above); the page must not imply every taxing hook is caught, nor claim pools are « removed » (not measured) */
t('R-launch-5', 'the page says a hook with no tax function is not checked; no unmeasured « then it is removed »', txt.includes('A hook with no such function is not checked this way and can still tax sellers.')
  && !txt.includes('then it is removed'));

/* ---- R-slots-2 */
t('R-slots-2', 'slots: at most, before the pot limit; the settle window from BlockSlots.sol', !!FC.BlockSlots && txt.includes('spin pays back at most ' + FR.usdc4({ num: C.slots.esperance, den: 1n }) + ' USDC on average (the prize table, before the pot limit).')
  && txt.includes('or not at all once ' + FC.BlockSlots.SETTLE_WINDOW + ' blocks have passed.'));

/* ---- R-vault-4 / R-vault-6 */
t('R-vault-4', 'rescue: delays from TBlockVault.sol; nothing reserved until a week is closed', !!FC.TBlockVault && txt.includes('after ' + Number(FC.TBlockVault.RESCUE_DELAY) / 86400 + ' days only that dev can execute it, within ' + Number(FC.TBlockVault.RESCUE_WINDOW) / 86400 + ' days after that.')
  && txt.includes('TBLOCK not yet reserved can be taken, and until an ended week is closed, none of it is reserved.'));
t('R-vault-6', 'feedContest: once a day, up to ' + EC.fmt(BigInt(VC.maxFeedPerCall)) + ' TBLOCK, players first', txt.includes('at most once a day, it moves up to ' + EC.fmt(BigInt(VC.maxFeedPerCall)) + ' free TBLOCK (and no more than the contest round has room for)')
  && txt.includes('only after every ended week with players has been closed'));

/* ---- R-ticketpot-1 / R-ticketpot-3 */
t('R-ticketpot-1', 'each ticket holder, the signature sets the amount', txt.includes('TicketPot pays each ticket holder only with a signature from TokenizedBlock\'s verifier key, and that signature also sets the amount') && !txt.includes('pays a winner'));
t('R-ticketpot-3', 'the owner can replace the verifier after ADMIN_DELAY (' + (FC.TicketPot ? Number(FC.TicketPot.ADMIN_DELAY) / 3600 : '?') + ' h)', !!FC.TicketPot
  && txt.includes('the owner can replace it after a public notice of ' + Number(FC.TicketPot.ADMIN_DELAY) / 3600 + ' hours on chain.') && !txt.includes('the owner can never withdraw the pot'));

/* ---- R-buyback-2 / R-tblock-4 / N-src-1 */
t('R-buyback-2', 'dated read: no ETH, no buy; the second holds 150,000 TBLOCK, sweepable to the vault', !!FR.MESURE_BUYBACK && txt.includes('Read on chain on ' + FR.MESURE_BUYBACK.date + ': neither had received ETH or made a buy; the second one held 150,000 TBLOCK')
  && txt.includes('sweepToDest()') && !txt.includes('neither has been funded'));
t('R-tblock-4', 'the app hides only the old test token (tokenomics JETONS_MASQUES length ' + TK.JETONS_MASQUES.length + ')', TK.JETONS_MASQUES.length === 1
  && txt.includes('the app hides the old test token that used the same name, but another token can copy the name too.') && !txt.includes('any other token showing that name'));
t('N-src-1', 'the source note no longer says every number is read from files; it names the dated measures', !txt.includes('Every number on this page is read from the files the app itself runs')
  && txt.includes('Two figures are dated measurements, given with their date: the launchpad test and the buyback contracts\' state.'));

/* ---- the fee wallet is never printed (the address-shown test covers the whole page; this is the new text) */
const feeWallet = String((await imp('frais-creation.js')).FEE_WALLET || TK.FEE_WALLET || '').toLowerCase();
t('privacy', 'the fee wallet address is not in the page', !feeWallet || !brut.toLowerCase().includes(feeWallet.slice(2)));

console.log('\n' + (n - ko) + '/' + n + (ko ? ' — RED' : ' — green') + (REF ? ' (frais-risques.js, html and server read from ' + REF + ')' : ''));
process.exit(ko ? 1 : 0);
