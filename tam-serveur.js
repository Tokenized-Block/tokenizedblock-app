/* tam-serveur.js — TAM phase C : ce que le serveur repond pour l onglet TAM. LECTURE SEULE : rien n est signe ni envoye ; `rpc` est INJECTE.
 *   GET /api/tam/choix?graine=0x…  le choix du cerveau (tam-moteur.js#choisirOeuvre) : params, certificats, octets, keccak.
 *     Sans graine : le hash du DERNIER bloc lu (cache 60 s : a 200 ms par bloc, une graine par requete brulerait le CPU et le RPC).
 *     &block=0x… : le cerveau de CE block (defaut UNIT ; repli IB022 etiquete), rebati par cerveau.js depuis sa graine, 24 battements
 *     nourris de sa vie de marche lue par le serveur (etatCerveauTam). Son keccak entre dans la graine (empreinteEtat). La reponse
 *     porte `cerveau.etiquette` : quel cerveau, quel battement, ce qu il a mange — et qu il n est PAS le cerveau vivant du visiteur.
 *   GET /api/tam/oeuvres  les oeuvres mintees, lues dans les evenements Minted de TamArt (une fois l adresse ecrite) ; cache 60 s,
 *     balayage INCREMENTAL par fenetres. Avant le deploiement : une liste vide AVEC sa raison (etat PAS_DEPLOYE), jamais un vide muet. */
import { choisirOeuvre, decoder, signature, certifierReglage } from './tam-moteur.js';
import { adresseTam, SIG_TAM, appelLecture, decoderBytes, MAX_PARAMS } from './tam-plan.js';
import { topic, keccak256Hex } from './keccak.js';
const MAX_PARAMS_JSON = MAX_PARAMS;
import { etatInitial, pas, nomHumeur } from './cerveau.js';
import { lecture } from './pensee-cerveau.js';
import { certifierScience, choisirScience, noteCerveau, SYSTEMES as SYSTEMES_SCIENCE } from './tam-science.js';
import { PORTEUSES, canon as canonEtat } from './tam-moteur.js';
/* la fusion phenomenologique (tam-fusion.js) n est pas tiree par le cerveau : son pire coin coute ~1 s de calcul serveur */
/* game79 (Phil) : la fusion revient dans les choix du cerveau — son cout est borne par tam-science.js#coutFusion avant toute simulation */
const SCIENCES_HORS_CHOIX = new Set([]);

export const TOPIC_MINTED = topic(SIG_TAM.minted);
export const FENETRE_LOGS = 9000, FENETRES_PAR_APPEL = 20, TTL_MS = 60000;
export const PAR_ID_MAX = 50; /* game359: works read by id per call when totalSupply says some are missing */
export const TAM_CALCULS_MAX = 2, TAM_BUDGET_IP_MINUTE = 20;
const G32 = /^0x[0-9a-fA-F]{64}$/;

/* 2026-10-31 (decision du lead) : le cerveau d UN block, nomme. Defaut : UNIT ; repli : IB022, ETIQUETE comme repli. */
export const CERVEAU_DEFAUT = Object.freeze({ adresse: '0xb2000000000000000000007afa7ed748b0874f27', symbole: 'UNIT' });
export const CERVEAU_REPLI = Object.freeze({ adresse: '0xb200000000000000000000e4b0c5fbe9c8df579e', symbole: 'IB022' });
export const BATTEMENTS = 24;
const ADR = /^0x[0-9a-fA-F]{40}$/;
/**
 * L etat du cerveau d un block qui entre dans la graine : cerveau.js, depuis SA graine (etatInitial(adresse)), `battements` pas
 * nourris comme l app nourrit un block (entreesCerveau) avec ce que le SERVEUR sait : sa vie de marche lue (ou NON_LUE), aucune
 * nourriture (gm, messages, detenteurs a 0), aucun echange vu, la hauteur de lecture. ⛔ Ce n est PAS le cerveau vivant du
 * visiteur : celui-la vit dans SON navigateur (memoire locale, echanges vus par son fil). C est le meme cerveau, REBATI ici, et
 * c est dit tel quel (etiquette).
 */
export function etatCerveauTam(adresse, { battements = BATTEMENTS, vie = null, etatVie = 'NON_LUE', bloc = null, symbole = null, repli = false } = {}) {
  const faits = { vie: typeof vie === 'number' && Number.isFinite(vie) ? vie : null, vieAvant: null, gm: 0, messages: 0, detenteurs: 0, mort: false,
    etatVie: etatVie || 'NON_LUE', gmAvant: null, messagesAvant: null, detenteursAvant: null, role: null, bloc: Number.isSafeInteger(bloc) ? bloc : null };
  let e = etatInitial(adresse);
  /* 2026-11-01 (Phil : « en haut, quel block fait le graph, et son humeur ») : on garde les `vu` pour dire son humeur (phase du moteur)
   *   et sa lecture (pensee-cerveau#lecture : le mot humain, 9 regles) au dernier battement — elles n entrent PAS dans la graine */
  const histo = [];
  for (let i = 0; i < battements; i++) { const r = pas(e, faits); e = r.etat; histo.push(r.vu); }
  const der = histo[histo.length - 1] || null, lu = der ? lecture(histo, histo.length - 1) : null;
  const etat = { cerveau: String(adresse).toLowerCase(), symbole: symbole || null, battements, tick: e.tick, spikes: e.spikes, empreinte: e.c.empreinte,
    vie: faits.vie, etatVie: faits.etatVie, blocFaits: faits.bloc, repli: !!repli, potentiels: e.potentiels.map((x) => Math.round(x * 1e6) / 1e6) };
  /* ⛔ a cote de l etat, jamais DEDANS : canon(etat) fait la graine, une cle de plus changerait toutes les oeuvres */
  /* game79 : NON_LU se dit « not read » (comme partout depuis game76), jamais le long « Mood not judged — our read failed » */
  HUMEURS.set(etat, { phase: der ? der.phase : null, humeur: der ? (der.phase === 'NON_LU' ? 'not read' : nomHumeur(der.phase)) : null, ressenti: lu ? lu.word : null, ressentiCle: lu ? lu.key : null });
  return etat;
}
const HUMEURS = new WeakMap();
/** l humeur (phase du moteur, son nom) et la lecture (le mot humain) au dernier battement d un etat rendu par etatCerveauTam */
export const humeurCerveauTam = (etat) => HUMEURS.get(etat) || { phase: null, humeur: null, ressenti: null, ressentiCle: null };
/** l etiquette, en anglais simple, de ce cerveau-la (jamais « live ») */
export function etiquetteCerveau(et) {
  const nom = et.symbole || (et.cerveau.slice(0, 6) + '…' + et.cerveau.slice(-4));
  const marche = et.etatVie === 'LUE' && et.vie !== null ? 'fed its market life read on chain' + (et.blocFaits ? ' at block ' + et.blocFaits : '') : 'with its market life not read (no market facts)';
  return 'brain of ' + nom + ' at beat ' + et.tick + ', rebuilt on the server from its seed, ' + marche + '; not your live brain'
    + (et.repli ? ' (fallback: the ' + (et.symbole || 'default') + ' brain could not be built)' : '');
}

const sansSignature = (c) => { const { signature: _s, ...r } = c || {}; return r; };
const hexDe = (u8) => '0x' + [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');

/** le moteur de reponses ; `rpc(methode, params)` injecte, `deploiement` = TAMART_DEPLOIEMENT */
/* 2026-11-12 (the economy pack is live): `deploiement` = the TAM art contract minted on now (paid through the TBLOCK router); `autres` =
 *   the earlier TAM contracts, read the same way. Distinctness is measured against EVERY minted work of every contract, and the list of one
 *   is never said whole while another is unread. */
export function serveurTam({ rpc, deploiement, autres = [], lireVie = null, lireSymbole = null, maintenant = () => Date.now() }) {
  const parGraine = new Map(), vies = new Map();
  /* le cerveau d un block : sa vie lue (cache 60 s), puis cerveau.js ; repli IB022 SEULEMENT si celui-la ne se construit pas */
  async function cerveauDe(adr) {
    const a = String(adr).toLowerCase();
    let v = vies.get(a);
    if (!v || maintenant() - v.a >= TTL_MS) {
      let vie = null, etatVie = 'NON_LUE', symbole = a === CERVEAU_DEFAUT.adresse ? CERVEAU_DEFAUT.symbole : a === CERVEAU_REPLI.adresse ? CERVEAU_REPLI.symbole : null, bloc = null;
      try { const r = lireVie ? await lireVie(a) : null; if (r && r.etat === 'LUE' && typeof r.vie === 'number') { vie = r.vie; etatVie = 'LUE'; bloc = Number.isSafeInteger(r.bloc) ? r.bloc : null; } } catch (_) { /* NON_LUE, dit dans l etiquette */ }
      if (!symbole && lireSymbole) { try { const s = await lireSymbole(a); if (typeof s === 'string' && /^[A-Za-z0-9.$-]{1,16}$/.test(s)) symbole = s; } catch (_) { symbole = null; } }
      v = { vie, etatVie, symbole, bloc, a: maintenant() };
      vies.set(a, v); if (vies.size > 64) vies.delete(vies.keys().next().value);
    }
    try { return etatCerveauTam(a, { vie: v.vie, etatVie: v.etatVie, bloc: v.bloc, symbole: v.symbole }); }
    catch (_) { return etatCerveauTam(CERVEAU_REPLI.adresse, { symbole: CERVEAU_REPLI.symbole, repli: true }); }
  }
  /* ⛔ 2026-11-01 (coordinateur, avant deploy) : un calcul TAM (choisirOeuvre / certifierReglage) coute ~100-500 ms de CPU dans UN process.
   *   Au plus TAM_CALCULS_MAX en cours dans tout le serveur, sinon 503 OCCUPE SANS calculer (aucune file) ; au plus TAM_BUDGET_IP_MINUTE
   *   calculs par IP et par minute, sinon 429. Un cache touche ne passe pas par ici. Le calcul cede la main une fois (setImmediate) apres
   *   son admission : la place est tenue pendant qu il attend, donc le plafond borne vraiment les calculs simultanes admis. */
  const garde = { enCours: 0, minute: -1, parIp: new Map() };
  function admettre(ip) {
    if (garde.enCours >= TAM_CALCULS_MAX) return { statut: 503, ok: false, etat: 'OCCUPE', pourquoi: 'busy, try again in a few seconds' };
    const m = Math.floor(maintenant() / 60000);
    if (garde.minute !== m || garde.parIp.size > 10000) { garde.minute = m; garde.parIp.clear(); }
    const k = String(ip || '?'), n = (garde.parIp.get(k) || 0) + 1;
    if (n > TAM_BUDGET_IP_MINUTE) return { statut: 429, ok: false, etat: 'TROP', pourquoi: 'too many TAM computations from here: ' + TAM_BUDGET_IP_MINUTE + ' a minute, try again in a minute' };
    garde.parIp.set(k, n); garde.enCours++;
    return null;
  }
  async function calculer(ip, f) {
    const refus = admettre(ip);
    if (refus) return refus;
    try { await new Promise((r) => setImmediate(r)); return f(); } finally { garde.enCours--; }
  }
  let tete = null; /* { bloc, hash, a } */
  const etats = [deploiement, ...(autres || [])].filter((d) => adresseTam(d)).map((d) => ({ dep: d, contrat: adresseTam(d), oe: { oeuvres: [], sigs: new Map(), jusqua: null, a: 0, enVol: null, erreur: null } }));
  const deploye = etats.length > 0;
  /** the signature of every minted work of every contract (null where unread: choix/certifier refuse then) */
  const toutesExistantes = () => etats.flatMap((E) => E.oe.oeuvres.map((o) => E.oe.sigs.get(o.tokenId) || null));
  /** null when every contract's minted works were read up to the head; otherwise why not */
  const pasLu = () => { for (const E of etats) { if (E.oe.jusqua === null || E.oe.erreur) return 'the minted works were not read, so distinctness cannot be measured' + (E.oe.erreur ? ': ' + E.oe.erreur : ''); if (!E.oe.aJour) return 'the minted works are still being read up to the latest block'; } return null; };

  async function teteLue() {
    if (tete && maintenant() - tete.a < TTL_MS) return tete;
    const b = await rpc('eth_getBlockByNumber', ['latest', false]);
    if (!b || !G32.test(String(b.hash || ''))) throw new Error('latest block not read');
    tete = { bloc: parseInt(b.number, 16), hash: String(b.hash).toLowerCase(), a: maintenant() };
    return tete;
  }

  async function choix(graineDemandee, blockDemande = null, minteurDemande = null, ip = null, tirageDemande = null) {
    let graine = null, bloc = null, tirage = null;
    /* 2026-11-01 (Phil : « fait tout la meme chose ») : sans tirage, la tete est en cache 60 s -> chaque clic rendait la MEME oeuvre.
     *   &draw=<1..16 hex> : le navigateur tire un nombre a chaque clic ; graine = keccak(hash du bloc : tirage). Rejouable : la graine est stockee. */
    if (tirageDemande !== null && tirageDemande !== undefined && tirageDemande !== '') {
      if (!/^[0-9a-f]{1,16}$/i.test(String(tirageDemande))) return { ok: false, etat: 'REFUSE', pourquoi: 'draw must be 1 to 16 hex digits' };
      tirage = String(tirageDemande).toLowerCase();
    }
    if (blockDemande !== null && blockDemande !== undefined && blockDemande !== '' && !ADR.test(String(blockDemande))) return { ok: false, etat: 'REFUSE', pourquoi: 'block must be a whole address (0x + 40 hex)' };
    const vide = (x) => x === null || x === undefined || x === '';
    if (!vide(minteurDemande) && !ADR.test(String(minteurDemande))) return { ok: false, etat: 'REFUSE', pourquoi: 'minter must be a whole address (0x + 40 hex)' };
    const minteur = vide(minteurDemande) ? null : String(minteurDemande).toLowerCase(); /* le wallet qui mintera : il entre dans la graine */
    const etat = await cerveauDe(blockDemande ? blockDemande : CERVEAU_DEFAUT.adresse);
    if (graineDemandee !== null && graineDemandee !== undefined && graineDemandee !== '') {
      if (!G32.test(String(graineDemandee))) return { ok: false, etat: 'REFUSE', pourquoi: 'the seed must be 32 bytes in hex (0x + 64 hex)' };
      graine = String(graineDemandee).toLowerCase();
    } else {
      try { const t = await teteLue(); graine = tirage ? keccak256Hex(new TextEncoder().encode(t.hash + ':' + tirage)) : t.hash; bloc = t.bloc; } catch (e) { return { ok: false, etat: 'NON_LU', pourquoi: 'the latest block was not read: ' + String((e && e.message) || e).slice(0, 100) }; }
    }
    /* ⛔ 2026-11-01 : la distinction se mesure contre TOUTES les oeuvres mintees. Une fois TamArt deploye : liste non lue jusqu a la tete,
     *   ou UNE signature non lue -> NON_LU, jamais une oeuvre comparee a une liste trouee. */
    if (deploye) {
      const p = pasLu();
      if (p) return { ok: false, etat: 'NON_LU', graine, bloc, pourquoi: p };
    }
    const existantes = toutesExistantes();
    const cle = graine + ':' + etat.cerveau + ':' + etat.tick + ':' + etat.etatVie + ':' + etat.vie + ':' + existantes.length + ':' + minteur + ':' + (tirage || '-');
    /* revue game79 (medium) : le tirage entre dans la cle — sinon un appel « graine seule » (attracteur) recevait la science en cache */
    if (parGraine.has(cle)) return parGraine.get(cle); /* un cache touche ne coute rien : ni budget, ni place */
    const cerveau = { adresse: etat.cerveau, symbole: etat.symbole, battement: etat.tick, spikes: etat.spikes, vie: etat.vie, etatVie: etat.etatVie, blocFaits: etat.blocFaits,
      ...humeurCerveauTam(etat),
      repli: etat.repli, vivant: false, etiquette: etiquetteCerveau(etat) };
    /* game79 (Phil : « let brain choose : un vrai random sur TOUTES les combinaisons, pas juste attractor ») : le GENRE se tire d abord
     *   (rejouable : keccak(graine | etat du cerveau | genre)) — un attracteur (16 familles) ou une des sciences (toutes ; la fusion
     *   phenomenologique en est exclue : son pire coin coute ~1 s de calcul). */
    const idsScience = SYSTEMES_SCIENCE.map((s) => s.id).filter((id) => !SCIENCES_HORS_CHOIX.has(id));
    const genre = parseInt(keccak256Hex(new TextEncoder().encode(graine + '|' + canonEtat(etat) + '|genre')).slice(2, 10), 16) % (PORTEUSES.length + idsScience.length);
    /* sans tirage (appel API a graine fixe) : un attracteur, comme avant game79 ; le bouton envoie TOUJOURS un tirage */
    if (tirage && genre >= PORTEUSES.length) {
      /* revue game79 : la NOTE (une simulation de plus) se calcule DANS la garde CPU, avec le choix — jamais hors du plafond */
      const hm = humeurCerveauTam(etat);
      const rs = await calculer(ip, () => {
        const c = choisirScience({ graine, etatCerveau: etat, existantes, minteur, ids: idsScience });
        if (c.ok) c.note = noteCerveau(c.params, { nomCerveau: etat.symbole || (etat.cerveau.slice(0, 6) + '...' + etat.cerveau.slice(-4)), humeur: hm.humeur, ressenti: hm.ressenti, battement: etat.tick });
        return c;
      });
      if (rs.statut) return rs;
      if (rs.etat === 'NON_LU') return { ok: false, etat: 'NON_LU', graine, bloc, pourquoi: rs.pourquoi };
      let repS;
      if (rs.ok) {
        /* la NOTE du cerveau (ce qu il a choisi, mesure, conclu) : dans les params, donc stockee on-chain si quelqu un minte cette oeuvre */
        const P = { ...rs.params, note: rs.note };
        repS = { ok: true, etat: 'PRET', genre: 'science', graine, bloc, tirage, cerveau, params: P, empreinteEtat: keccak256Hex(new TextEncoder().encode(canonEtat(etat))), certificats: sansSignature(rs.certificats), octets: hexDe(rs.certificats.octets),
          hash: rs.certificats.hash, rejets: rs.rejets, essai: rs.essai, comparees: existantes.length, minteur };
      } else repS = { ok: false, etat: 'AUCUNE', graine, bloc, cerveau, pourquoi: 'no science passed the certificates for this seed', rejets: rs.rejets };
      if (parGraine.size > 64) parGraine.delete(parGraine.keys().next().value);
      parGraine.set(cle, repS);
      return repS;
    }
    const r = await calculer(ip, () => choisirOeuvre({ graine, etatCerveau: etat, existantes, minteur }));
    if (r.statut) return r; /* OCCUPE (503) ou TROP (429) : rien n a ete calcule */
    if (r.etat === 'NON_LU') return { ok: false, etat: 'NON_LU', graine, bloc, pourquoi: r.pourquoi };
    const rep = r.ok
      ? { ok: true, etat: 'PRET', graine, bloc, tirage, cerveau, empreinteEtat: r.params.empreinteEtat,
        params: r.params, certificats: sansSignature(r.certificats), octets: hexDe(r.octets), hash: r.hash, rejets: r.rejets, comparees: existantes.length, minteur }
      : { ok: false, etat: 'AUCUNE', graine, bloc, cerveau, pourquoi: 'no combination passed the certificates for this seed', rejets: r.rejets };
    if (parGraine.size > 64) parGraine.delete(parGraine.keys().next().value);
    parGraine.set(cle, rep);
    return rep;
  }

  /* la signature (distance) d une oeuvre existante : lue dans ses OCTETS stockes, jamais supposee. Echec -> signatureNonLue (relue au
   *   balayage suivant) ; tant qu une seule manque, choix() rend NON_LU — elle n est jamais retiree en silence des `existantes`. */
  async function lireSignature(E, o) {
    const { contrat, oe } = E;
    try { const d = decoderBytes(await rpc('eth_call', [appelLecture(contrat, SIG_TAM.donnees, o.tokenId), 'latest'])); const x = decoder(d); oe.sigs.set(o.tokenId, signature(x.points, x.q)); delete o.signatureNonLue; }
    catch (_) { o.signatureNonLue = true; }
  }
  /* 2026-11-01 : GET /api/tam/certifier?p=<base64url(JSON des params)> — une oeuvre REGLEE (joueur ou cerveau) passe les MEMES certificats
   *   que le choix du cerveau, distance comprise contre TOUTES les oeuvres mintees (memes regles NON_LU que choix). Bornes d abord
   *   (validerReglage : n, q, pas = ceux du moteur — une requete ne peut pas commander un calcul plus long). */
  const parReglage = new Map();
  async function certifierParams(p64, ip = null) {
    let json;
    try { json = Buffer.from(String(p64 || ''), 'base64url').toString('utf8'); } catch (_) { json = ''; }
    if (!json || json.length > MAX_PARAMS_JSON) return { ok: false, etat: 'REFUSE', codes: ['HORS_BORNES'], pourquoi: 'params missing or longer than ' + MAX_PARAMS_JSON + ' bytes' };
    let P; try { P = JSON.parse(json); } catch (_) { return { ok: false, etat: 'REFUSE', codes: ['HORS_BORNES'], pourquoi: 'params are not JSON' }; }
    if (deploye && pasLu()) return { ok: false, etat: 'NON_LU', codes: ['SIGNATURE_NON_LUE'], pourquoi: 'the minted works were not read up to the latest block, so distinctness cannot be measured' };
    const existantes = toutesExistantes();
    const cle = json + ':' + existantes.length;
    if (parReglage.has(cle)) return parReglage.get(cle); /* un cache touche ne coute rien : ni budget, ni place */
    /* game76 : une oeuvre de SCIENCE (P.science) passe ses propres certificats (tam-science.js) : bornes du module, bornee, distincte */
    const c = await calculer(ip, () => (P && P.science ? certifierScience(P, existantes) : certifierReglage(P, existantes)));
    if (c.statut) return c; /* OCCUPE (503) ou TROP (429) : rien n a ete calcule */
    const { oeuvre: _o, octets, signature: _s, ...reste } = c;
    const rep = { ...reste, ok: c.ok === true, etat: c.ok ? 'CERTIFIE' : c.etat === 'NON_LU' ? 'NON_LU' : 'REFUSE', hash: octets ? keccak256Hex(octets) : null, comparees: existantes.length,
      pourquoi: c.ok ? null : (c.raisons || []).join('; ') };
    if (rep.etat !== 'NON_LU') { if (parReglage.size > 64) parReglage.delete(parReglage.keys().next().value); parReglage.set(cle, rep); }
    return rep;
  }

  async function balayer(E) {
    const { contrat, oe, dep: deploiement } = E;
    for (const o of oe.oeuvres) if (o.signatureNonLue) await lireSignature(E, o);
    const h = parseInt(await rpc('eth_blockNumber', []), 16);
    /* game359 (Grok's live test 2026-11-11: "Not ready: the minted works were not read up to the latest block"): measured on prod, the log
     *   scan sat at block 53,906,473 with the head ~2.1M blocks ahead — 180k blocks per call, only when someone opens TAM, restarted from the
     *   deploy block after every redeploy, while Base makes ~432k blocks a day. TamArt has no burn and totalSupply only grows (tokenId =
     *   ++totalSupply), so the works are EXACTLY the ids 1..totalSupply: when the ids we know are 1..n and totalSupply (read at the same
     *   head) is n, the list is whole; missing ids are read BY ID (donnees/empreinte/graine views), at most PAR_ID_MAX per call. Any read
     *   that fails falls back to the log scan below, unchanged. */
    try {
      const sup = Number(BigInt(String(await rpc('eth_call', [appelLecture(contrat, SIG_TAM.totalSupply), '0x' + h.toString(16)]))));
      if (Number.isSafeInteger(sup) && sup >= 0) {
        const connus = new Set(oe.oeuvres.map((o) => o.tokenId));
        const manquants = []; for (let id = 1; id <= sup && manquants.length < PAR_ID_MAX; id++) if (!connus.has(id)) manquants.push(id);
        for (const id of manquants) {
          const mot = async (sig) => String(await rpc('eth_call', [appelLecture(contrat, sig, id), '0x' + h.toString(16)])).toLowerCase();
          const o = { tokenId: id, minter: null, empreinte: await mot(SIG_TAM.empreinte), graine: await mot(SIG_TAM.graine), tx: null, bloc: null, parId: true };
          oe.oeuvres.push(o);
          await lireSignature(E, o);
        }
        oe.oeuvres.sort((x, y) => x.tokenId - y.tokenId);
        const entiers = oe.oeuvres.length === sup && oe.oeuvres.every((o, k) => o.tokenId === k + 1) && !oe.oeuvres.some((o) => o.signatureNonLue);
        if (entiers) { oe.jusqua = Math.max(oe.jusqua === null ? 0 : oe.jusqua, h); return true; }
      }
    } catch (_) { /* not read: the log scan decides, as before */ }
    let de = oe.jusqua === null ? deploiement.bloc : oe.jusqua + 1;
    for (let f = 0; f < FENETRES_PAR_APPEL && de <= h; f++) {
      const a = Math.min(h, de + FENETRE_LOGS - 1);
      const logs = await rpc('eth_getLogs', [{ address: contrat, topics: [TOPIC_MINTED], fromBlock: '0x' + de.toString(16), toBlock: '0x' + a.toString(16) }]);
      for (const l of logs || []) {
        if (String(l.address || '').toLowerCase() !== contrat || String(l.topics && l.topics[0]).toLowerCase() !== TOPIC_MINTED) continue;
        const id = Number(BigInt(l.topics[1]));
        if (oe.oeuvres.some((o) => o.tokenId === id)) continue;
        const o = { tokenId: id, minter: '0x' + String(l.topics[2]).slice(26).toLowerCase(), empreinte: String(l.topics[3]).toLowerCase(), graine: '0x' + String(l.data).slice(2, 66).toLowerCase(), tx: l.transactionHash, bloc: parseInt(l.blockNumber, 16) };
        oe.oeuvres.push(o);
        await lireSignature(E, o);
      }
      oe.jusqua = a; de = a + 1;
    }
    oe.oeuvres.sort((x, y) => x.tokenId - y.tokenId);
    return oe.jusqua >= h;
  }

  /** one contract's answer, read at most every TTL_MS */
  async function oeuvresDe(E) {
    const { contrat, oe } = E;
    if (maintenant() - oe.a < TTL_MS && oe.jusqua !== null) return { ok: true, etat: oe.aJour ? 'LU' : 'EN_RETARD', contrat, jusqua: oe.jusqua, oeuvres: oe.oeuvres };
    if (!oe.enVol) oe.enVol = balayer(E).then((aJour) => { oe.aJour = aJour; oe.erreur = null; }, (e) => { oe.erreur = String((e && e.message) || e).slice(0, 120); }).finally(() => { oe.a = maintenant(); oe.enVol = null; });
    await oe.enVol;
    if (oe.jusqua === null) return { ok: false, etat: 'NON_LU', pourquoi: 'the Minted events were not read: ' + (oe.erreur || 'no answer'), contrat, oeuvres: [] };
    return { ok: true, etat: oe.erreur ? 'PARTIEL' : oe.aJour ? 'LU' : 'EN_RETARD', pourquoi: oe.erreur, contrat, jusqua: oe.jusqua, oeuvres: oe.oeuvres };
  }
  /** the contract minted on now (its fields, as before) + `parContrat`: every contract's answer, the one minted on now first */
  async function oeuvres() {
    if (!adresseTam(deploiement)) return { ok: true, etat: 'PAS_DEPLOYE', pourquoi: 'TAM minting is coming soon: no work can have been minted', contrat: null, oeuvres: [], parContrat: [] };
    const rs = await Promise.all(etats.map((E) => oeuvresDe(E)));
    return { ...rs[0], parContrat: rs };
  }

  return { choix, oeuvres, cerveauDe, certifierParams };
}
