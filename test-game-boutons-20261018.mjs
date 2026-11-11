/* test-game-boutons-20261018.mjs - LES BOUTONS DE LA CARTE DRAWS SONT CEUX QUI FONT UN GESTE REEL AUJOURD HUI (Phil, 2026-10-18 00:05 :
 * « garde les boutons qui ont du sens avec ce qu on a fait aujourd hui » ; 00:40 : « retire le guest »).
 * AFFIRME (lecture de app.html) : (1) #tirCarte porte EXACTEMENT 4 boutons : jourRoll, jourUnit, jourActions, jourSkin ; (2) aucun n est
 *   `disabled` et aucun ne parle d un contrat a venir (« Day pass », « once their contract ») ; (3) le mot « guest » n apparait dans aucun texte
 *   servi de la carte ni dans roll() ; (4) roll() sans wallet lit quand meme le bloc N+2 (eth_getBlockByNumber) et ne redirige pas au Wallet ;
 *   (5) #jourSkin ouvre le panneau de UNIT (choisirBrain + bcOuvrirPop) ; (6) la carte Skin market et la carte UNIT pools existent, une fois.
 * NE PROUVE PAS : le rendu ni un roll reel (verifie au navigateur, serveur local, 2026-10-18 00:50 : « Block 52,742,116 drew this face »). */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
/* UX 2026-10-18 (Phil : « ameliore l ux ») : Draws d abord, puis « Its brain plays », puis Missions */
const c0 = app.indexOf('id="tirCarte"'), c1 = app.indexOf('id="brainJeuCarte"');
vu(c0 > 0 && c1 > c0 && app.indexOf('id="missionsCarte"') > c1, 'la carte Draws precede la carte du brain, qui precede Missions');
/* ce qui est SERVI au visiteur : les commentaires HTML (qui racontent pourquoi) sont otes avant de juger les textes */
const carte = app.slice(c0, c1).replace(/<!--[\s\S]*?-->/g, '');
const ids = [...carte.matchAll(/<button[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
/* 2026-10-18 (revue adverse) : + « Settle pending rolls » (rolls payes en attente) et « Close and draw yesterday's pass pot », caches */
/* 2026-10-18 : + « Add to today's pot » (TicketPot LIVE), cache sans fiche servie ni wallet */
/* 2026-10-24 (Phil : « fusionne le draw et le spin ») : la carte se lit rouleaux -> Roll | Spin -> ticket / pot. Ce banc affirmait l ancien
 *   ordre (une seule rangee) ; il affirme la nouvelle : les gestes du Roll (Roll, Roll paye, Auto-roll, Settle pending rolls), puis les trois
 *   boutons des Slots (venus de #slotsCarte, caches sans contrat ni wallet), puis Trade UNIT / stocks / Skin, le Week pass et le pot.
 *   Les 4 boutons VISIBLES sans contrat restent jourRoll, jourUnit, jourActions, jourSkin (les autres sont `hidden`, verifie dessous). */
/* 2026-10-24 (Phil, capture de game35 : « un seul jeu, au CENTRE ») : le Spin (et Settle / Accept, dans son panneau de reponse) vient
 *   d abord ; les gestes du Roll classique suivent, dans leur pli « Other ways to play: classic roll ». Memes boutons, autre ordre. */
vu(JSON.stringify(ids) === JSON.stringify(['slotsSpin', 'slotsRegler', 'slotsAccepter', 'jourRoll', 'jourRollPaye', 'jourAuto', 'rollsRegler', 'jourUnit', 'jourActions', 'jourSkin', 'jourPass', 'jourTirerJour', 'jourFondPot', 'jourReclamerPot', 'jourReclamerPotUnit', 'jourFermerPot']), /* 2026-10-28 : + the UNIT pot's claim (hidden until a share is read) */ 'exactement 4 boutons visibles + Auto-roll + 4 boutons BlockRolls caches + les 3 des Slots caches + le pot, la part, la fermeture (lus : ' + ids.join(', ') + ')');
vu(['slotsSpin', 'slotsRegler', 'slotsAccepter'].every((id) => new RegExp('<button[^>]*\\bid="' + id + '"[^>]*\\bhidden\\b').test(carte)), 'Spin / Settle / Accept des Slots : caches dans le HTML');
vu(ids.filter((id) => !new RegExp('<button[^>]*\\bid="' + id + '"[^>]*\\bhidden\\b').test(carte)).join() === 'jourRoll,jourUnit,jourActions,jourSkin', 'sans contrat ni wallet, 4 boutons visibles : Roll, Trade UNIT, Trade stocks, Skin');
vu(/<button[^>]*\bid="jourFermerPot"[^>]*\bhidden\b/.test(carte), 'Close the pot : cache dans le HTML');
vu(/<button[^>]*\bid="jourReclamerPot"[^>]*\bhidden\b/.test(carte), 'Claim my share : cache dans le HTML (sans signature, pas de bouton)');
vu(/<button[^>]*\bid="jourFondPot"[^>]*\bhidden\b/.test(carte), 'Add to today\'s pot : cache dans le HTML');
vu(/<button[^>]*\bid="rollsRegler"[^>]*\bhidden\b/.test(carte) && /<button[^>]*\bid="jourTirerJour"[^>]*\bhidden\b/.test(carte), 'settle en attente et tirage du pot du jour : caches dans le HTML');
vu(/<button[^>]*\bid="jourAuto"[^>]*\bhidden\b/.test(carte) && /\$\('#jourAuto'\)\.hidden = !c|ba\.hidden = !c/.test(app), 'Auto-roll est cache sans wallet (pas de score sans ticket)');
/* BlockRolls (2026-10-18) : les boutons payants sont caches dans le HTML et ne s ouvrent que si le serveur sert rolls.contrat ET un wallet */
vu(/<button[^>]*\bid="jourRollPaye"[^>]*\bhidden\b/.test(carte) && /<button[^>]*\bid="jourPass"[^>]*\bhidden\b/.test(carte), 'boutons BlockRolls caches dans le HTML');
const pb = app.slice(app.indexOf('function poserBoutonsRolls('), app.indexOf('async function envoyerAppels('));
vu(/rollsCfg = t && t\.rolls && t\.rolls\.contrat \? t\.rolls : null;/.test(pb) && /const on = !!\(rollsCfg && c\);/.test(pb) && /bp\.hidden = !on; bd\.hidden = !on;/.test(pb), 'ouverts seulement avec rolls.contrat servi ET un wallet');
vu(/usdcTexte\(rollsCfg\.prixRoll\)/.test(pb) && /usdcTexte\(rollsCfg\.prixPass\)/.test(pb) && !/0\.50|10 USDC/.test(pb), 'les prix des boutons viennent du serveur, jamais tapes');
/* Phil 2026-10-18 14:45 : « je roll, toujours le meme bloc gris, rien signe » — contrat + wallet : le roll PAYE remplace l entrainement,
 *   et il dessine la face tiree (st.blockHash) ; la face du ticket n est plus grisee */
vu(/const bpr = \$\('#jourRoll'\); if \(bpr\) bpr\.hidden = on;/.test(pb), 'contrat + wallet : le bouton d entrainement s efface, le roll paye est LE bouton');
const rp = app.slice(app.indexOf('async function rollPaye()'), app.indexOf('async function passPaye()'));
vu(/\$\('#dernierFace'\)\.innerHTML = logoSvg\(paramsLogoDepuisApparence\(faceRevelee\(st\.blockHash\)/.test(rp) && /rollEnCours = false;/.test(rp), 'le roll paye dessine la face du bloc cible et rend la main a l apercu');
vu(!/\.jourFace\[data-gagne="0"\]\{[^}]*grayscale/.test(app), 'la face du ticket n est plus grisee');
/* Auto-roll (2026-10-18, revue adverse) : contrat servi -> lot REEL (pass actif : rollWithPass ; sinon 5 rolls payes) ; practice sans contrat */
const ar = app.slice(app.indexOf('async function autoRoll()'), app.indexOf('async function autoRollLot('));
vu(/if \(rollsCfg\) \{ await autoRollLot\(c\); return; \}/.test(ar), 'Auto-roll : lot reel des que rollsCfg (contrat servi)');
const arp = app.slice(app.indexOf('async function autoRollLot('), app.indexOf('/* ── petits outils partages'));
vu(/passActif\(pass\)/.test(arp) && /planRollsAvecPass\(/.test(arp) && /planRolls\(/.test(arp) && /planSettleMany\(/.test(arp) && /lireRolledTous\(/.test(arp) && /lireSettledTous\(/.test(arp) && /PERDU/.test(arp), 'lot : pass ou payant, N rolls, settleMany, Rolled/Settled lus, fenetre perdue dite');
vu(!/<button[^>]*\bdisabled\b/.test(carte), 'aucun bouton desactive dans la carte Draws');
/* ce que le visiteur VOIT : les boutons `hidden` (BlockRolls, ouverts seulement par le serveur) sont otes avant de juger les textes */
const visible = carte.replace(/<button[^>]*\bhidden\b[^>]*>[\s\S]*?<\/button>/g, '');
vu(!/Day pass|once their contract|Roll for real/i.test(visible), 'aucune promesse de contrat a venir visible dans la carte');
const r0 = app.indexOf('async function roll()'), r1 = app.indexOf('const rollDerniers = []');
vu(r0 > 0 && r1 > r0, 'roll() present');
const roll = app.slice(r0, r1);
/* le CODE, pas les commentaires qui racontent le retrait : l identite invitee (identiteJeu / CLE_INVITE / 'guest:') n existe plus */
vu(!/identiteJeu\(|CLE_INVITE|'guest:/.test(app) && !/guest/i.test(carte), 'pas de ticket invite (code ni carte)');
vu(/eth_getBlockByNumber/.test(roll) && !/allerA\('wallet'\)/.test(roll), 'sans wallet, roll() lit le bloc N+2 et ne redirige pas au Wallet');
/* Phil 2026-10-18 : chaque roll tire une face NEUVE au hasard (test-roll-face-week-pass) ; sans wallet, pas de face ni de score, et c est dit */
vu(/Connect a wallet: each roll then draws your own random face to score against the block\./.test(roll) && /const fRoll = c \? nouvelleFaceRoll\(\) : null;/.test(roll), 'sans wallet : le score demande un wallet, dit');
vu(/\$\('#jourSkin'\)\.addEventListener\('click', \(\) => \{ try \{ choisirBrain\(UNIT_APP\); \} catch \(_\) \{\} try \{ bcOuvrirPop\(\{ vue: 'brain'/.test(app), 'Skin ouvre le panneau de UNIT, vue Skin');
for (const id of ['skinCarte', 'earnCarte']) vu(app.split('id="' + id + '"').length === 2, 'carte ' + id + ' presente une fois');
vu(!app.includes('id="unitCarte"') && !app.includes('unitVendre') && !app.includes('peindreUnitPools'), 'game357 : la carte Swap UNIT est retiree (Phil 2026-11-11)');
/* revue adverse 2026-10-18 (HIGH) : le regleur des rolls en attente ne remonte jamais au-dela des ~1 000 derniers blocs (un roll de plus de
 *   256 blocs ne se regle plus, et les noeuds publics refusent getLogs profond) — sinon il casse ~5 h apres le deploiement */
const vr = app.slice(app.indexOf('async function verifierRollsEnAttente()'), app.indexOf('async function reglerRollsEnAttente()'));
vu(/const FENETRE_UTILE = 1000;/.test(vr) && /const de = Math\.max\(deploie, tete - FENETRE_UTILE,/.test(vr), 'regleur : lecture bornee aux 1 000 derniers blocs, jamais depuis le deploiement');
console.log('ok game-boutons - ' + n + ' assertions ; NE PROUVE PAS le rendu');
