/* entry-points.js — the ERC-4337 EntryPoints whose UserOperationEvent names the smart account that acted (its indexed sender).
 *   Moved here VERBATIM from revenu-externe.js on 2026-11-12 (review of game386) so the server (revenu-externe.js) and the claim page
 *   (claim-vue.js) read ONE list. The addresses were read on Base on 2026-10-17 (code present, UserOperationEvent logs emitted), never typed
 *   from memory. Any contract can emit that event topic: one from an address not listed here names nobody. */
export const ENTRY_POINTS = Object.freeze(['0x0000000071727de22e5e9d8baf0edac6f37da032', '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789', '0x4337084d9e255ff0702461cf8895ce9e3b5ff108']);
