/* contracts/noter-deploiement-blockskins.mjs — APRES la signature de Phil : inscrit `adresse`, `txDeploiement`, `blocDeploiement`, `owner`
 * dans blockskins-deploiement.js depuis le RECU de la transaction de creation de v3, et seulement si TOUT concorde. Rien n est signe ni
 * envoye : lecture seule. Des que l adresse est notee, v3 devient le contrat ACTIF de l app (blockskins-actif.js prend le premier
 * enregistrement deploye) : chaque texte passe a « 10 USDC » et la comparaison on-chain (MINT_PRICE()) attend 10 USDC, sans autre edition.
 *   Usage : node contracts/noter-deploiement-blockskins.mjs <txHash> [rpcUrl=https://mainnet.base.org]
 * REFUSE (et n ecrit rien) si : la fiche n est pas celle de BlockSkins v3 sur Base ; elle porte deja une adresse ; la transaction a un `to`
 *   (pas une creation) ; son `input` n est pas OCTET POUR OCTET la `creation` de la fiche (la donnee signee n est pas celle preparee) ; le
 *   recu n est pas status 0x1 ou n a pas de contractAddress ; une relecture on-chain (USDC(), FEE_WALLET(), MINT_PRICE()) differe de la
 *   fiche ; owner() n est pas le signataire de la transaction.
 * `noter()` est pur (fiche + texte + tx + recu + relectures -> nouveau texte ou refus) : teste avec des stubs ; la CLI branche le RPC. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selecteur } from '../keccak.js';

const bas = (x) => String(x || '').toLowerCase();
const ADR = /^0x[0-9a-f]{40}$/;
const motAdr = (hex) => '0x' + String(hex || '').replace(/^0x/, '').slice(-40).toLowerCase();
const motU = (hex) => { const h = String(hex || '').replace(/^0x/, ''); return /^[0-9a-f]{64}$/i.test(h) ? BigInt('0x' + h).toString() : null; };

/** les appels de relecture : selecteur -> ou lire la valeur attendue dans la fiche, et comment decoder la reponse */
export const RELECTURES = Object.freeze([
  { sig: 'USDC()', attendu: (f) => f.constructeur.usdc, decode: motAdr },
  { sig: 'FEE_WALLET()', attendu: (f) => f.constructeur.walletDesFrais, decode: motAdr },
  { sig: 'MINT_PRICE()', attendu: (f) => f.mintPriceUsdc, decode: motU },
  { sig: 'owner()', attendu: (f, tx) => tx.from, decode: motAdr },
]);

/** pur : rend { ok:false, pourquoi } ou { ok:true, texte, adresse, bloc, owner } */
export function noter({ fiche, texte, tx, recu, relectures }) {
  const refus = (p) => ({ ok: false, pourquoi: p });
  if (!fiche || fiche.contrat !== 'BlockSkins' || fiche.chaine !== 8453 || fiche.version !== 3) return refus('the record is not the BlockSkins v3 record for Base');
  if (fiche.adresse !== null || fiche.txDeploiement !== null || fiche.blocDeploiement !== null || fiche.owner !== null) return refus('the record already carries an address (' + fiche.adresse + ') — nothing rewritten');
  if (!/^[1-9]\d*$/.test(String(fiche.mintPriceUsdc))) return refus('the record carries no mint price to compare with the chain');
  if (!tx || bas(tx.input) !== bas(fiche.creation)) return refus('the transaction input is not the prepared creation data, byte for byte');
  if (tx.to) return refus('the transaction has a `to`: it is not a contract creation');
  if (!ADR.test(bas(tx.from))) return refus('the transaction has no readable sender');
  if (!recu || recu.status !== '0x1') return refus('the receipt is not status 0x1');
  if (bas(recu.transactionHash) !== bas(tx.hash)) return refus('the receipt is not the one of this transaction');
  const adresse = bas(recu.contractAddress);
  if (!ADR.test(adresse)) return refus('the receipt has no contractAddress');
  const bloc = parseInt(recu.blockNumber, 16);
  if (!Number.isSafeInteger(bloc) || bloc <= 0) return refus('the receipt has no block number');
  if (fiche.precedent && Number(fiche.precedent.blocDeploiement) >= bloc) return refus('the receipt block ' + bloc + ' is not after the previous deployment (' + fiche.precedent.blocDeploiement + ')');
  for (const r of RELECTURES) {
    const attendu = bas(r.attendu(fiche, tx)), lu = relectures ? relectures[r.sig] : undefined;
    if (lu === undefined || lu === null) return refus(r.sig + ' could not be read on chain');
    if (bas(lu) !== attendu) return refus(r.sig + ' read ' + lu + ' on chain, the record says ' + attendu);
  }
  const lignes = String(texte).split('\n');
  const i = (re) => lignes.findIndex((l) => re.test(l));
  const iA = i(/^\s*adresse: null,\s*$/), iT = i(/^\s*txDeploiement: null,\s*$/), iB = i(/^\s*blocDeploiement: null,\s*$/), iO = i(/^\s*owner: null,\s*$/), iH = i(/^ \* ⛔ v3 PAS ENCORE DEPLOYE/);
  if (iA < 0 || iT < 0 || iB < 0 || iO < 0) return refus('the record text has no `adresse: null` / `txDeploiement: null` / `blocDeploiement: null` / `owner: null` lines to rewrite');
  lignes[iA] = "  adresse: '" + adresse + "',";
  lignes[iT] = "  txDeploiement: '" + bas(tx.hash) + "',";
  lignes[iB] = '  blocDeploiement: ' + bloc + ', /* MINT_PRICE() ' + relectures['MINT_PRICE()'] + ' read back on chain */';
  lignes[iO] = "  owner: '" + bas(tx.from) + "',";
  if (iH >= 0) lignes[iH] = ' * ⛔ v3 DEPLOYE (bloc ' + bloc + ') : `adresse` ci-dessous, relue sur la chaine par noter-deploiement-blockskins.mjs. v2 dans `precedent`. */';
  return { ok: true, texte: lignes.join('\n'), adresse, bloc, owner: bas(tx.from) };
}

/* ---------------------------------------------------------------- CLI */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  /* ⛔ 2026-11-12: RETIRED. The standalone v3 creation of blockskins-deploiement.js was built from the pre-pack BlockSkins.sol; Skins
   *   now ships as step S of the economy pack and no page offers the standalone deploy any more. Noting an address here would switch
   *   the app to a contract nobody should deploy, so the CLI refuses and writes nothing. noter() stays a pure, tested function. */
  console.error('noter-deploiement-blockskins.mjs is retired: Skins is deployed as step S of the economy pack. Nothing written.');
  process.exit(1);
  const [txHash, rpcUrl = 'https://mainnet.base.org'] = process.argv.slice(2);
  if (!/^0x[0-9a-f]{64}$/i.test(String(txHash || ''))) { console.error('usage: node contracts/noter-deploiement-blockskins.mjs <txHash> [rpcUrl]'); process.exit(2); }
  const ICI = path.dirname(fileURLToPath(import.meta.url)), chemin = path.join(ICI, '..', 'blockskins-deploiement.js');
  const { BLOCKSKINS_DEPLOIEMENT: fiche } = await import('../blockskins-deploiement.js');
  let id = 0;
  const rpc = async (method, params) => {
    const r = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'x-ms-monitor': '1' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((x) => x.json());
    if (r.error) throw new Error(method + ': ' + JSON.stringify(r.error));
    return r.result;
  };
  const tx = await rpc('eth_getTransactionByHash', [txHash]), recu = await rpc('eth_getTransactionReceipt', [txHash]);
  const adresse = recu && recu.contractAddress ? bas(recu.contractAddress) : null;
  const relectures = {};
  if (adresse) for (const r of RELECTURES) { try { relectures[r.sig] = r.decode(await rpc('eth_call', [{ to: adresse, data: selecteur(r.sig) }, 'latest'])); } catch (_) { relectures[r.sig] = null; } }
  const v = noter({ fiche, texte: fs.readFileSync(chemin, 'utf8'), tx, recu, relectures });
  if (!v.ok) { console.error('REFUSED: ' + v.pourquoi); process.exit(1); }
  fs.writeFileSync(chemin, v.texte);
  console.log('blockskins-deploiement.js: v3 adresse ' + v.adresse + ', bloc ' + v.bloc + ', owner ' + v.owner + ', MINT_PRICE() ' + relectures['MINT_PRICE()'] + ' — v3 is now the active contract of the app');
}
