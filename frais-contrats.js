/* frais-contrats.js — GENERE par outils/generer-frais-contrats.mjs depuis les sources Solidity du depot. NE PAS EDITER A LA MAIN.
 * Les constantes de frais gravees dans les contrats (entiers bruts, en texte). Pur, sans import : la page frais-et-risques.html
 * l importe via frais-risques.js. test-frais-et-risques-20261018 exige que ce fichier soit identique a une regeneration. */
export const FRAIS_CONTRATS = Object.freeze({
  BlockSkins: Object.freeze({ source: 'contracts/src/BlockSkins.sol', sha256Source: '8fe2bc040f2a1bdd6c986fc0afe071c8a4e7c8d0bcf48676983553ab34e7201b', MINT_PRICE: '10000000', SALE_FEE_BPS: '1000', MIN_RAISE_BPS: '500', MAX_AUCTION: '604800' }),
  BlockMissionsV3: Object.freeze({ source: 'contracts/src/BlockMissionsV3.sol', sha256Source: '491aaa23a5856b5a1e333efacf2d8cfcdbf0555946277cf4f6b08d01dc9134d1', FEE_BPS: '1000', TB_SHARE_BPS: '10000', RESERVE_SHARE_BPS: '7000' }),
  TBlockLock: Object.freeze({ source: 'contracts/src/TBlockLock.sol', sha256Source: '435e9eff05fb3fd92763ccfe555aae54a04ac0ac217b8aaa65d6a2f0c1c7d191', MIN_LOCK: '604800', MAX_LOCK: '126144000', WITHDRAW_DELAY: '604800' }),
  TBlockVault: Object.freeze({ source: 'contracts/src/TBlockVault.sol', sha256Source: 'a886e86e43fb7b5b060d5572c580543bf76ac9420780394193c110502c34f253', RESCUE_DELAY: '604800', RESCUE_WINDOW: '172800', FEED_QUIET: '86400' }),
  TicketPot: Object.freeze({ source: 'contracts/src/TicketPot.sol', sha256Source: 'a9d4b1fae7531070de948d60120afb6cefae5111e3d07fc19c52717de7eeadf7', GRACE: '604800', FUNDING_DELAY: '43200', ADMIN_DELAY: '172800', PROPOSAL_TTL: '259200' }),
  BlockRolls: Object.freeze({ source: 'contracts/src/BlockRolls.sol', sha256Source: 'a108e013bcafeed461ccec86f9f7d4adf88e1c1e9c8ed46ec3dd4dcab870030e', MIN_SCORE_FLOOR: '2', SETTLE_WINDOW: '256' }),
  BlockSlots: Object.freeze({ source: 'contracts/src/BlockSlots.sol', sha256Source: 'bb5d88deef5516dae428de3977cd5fab8fe877c36224ae8a38014131ac2c1b70', SETTLE_WINDOW: '256' }),
});
