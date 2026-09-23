import { readFileSync } from 'fs';
const h = readFileSync('./app.html', 'utf8');
if (!h.includes('data-build="20260923-feed-catch-router"') && !h.includes('data-build="20260923-map-buy-cta"') && !h.includes('data-build="20260923-created-history"')) throw new Error('tip');
if (!h.includes('tip 20260923-map-buy-cta: amplify Instant Birth Map CTA')) throw new Error('amplify comment');
if (!h.includes('id="mapCtaDock"')) throw new Error('dock');
if (!h.includes('Map works — Instant Birth · 0.001 ETH')) throw new Error('dock copy');
if (!h.includes("data-acheter=\"' + enTexte(l.adr) + '\">Buy · 0.5%")) throw new Error('trending buy');
if (!h.includes('id="fAcheter" type="button">Buy · 0.5%')) throw new Error('fiche buy');
if (!h.includes('id="fIb"')) throw new Error('fiche ib');
if (!h.includes('Buy · 0.5%</button>') || !h.includes("data-tf-act=\"buy\">Buy · 0.5%")) throw new Error('profile buy label');
if (h.includes('Fees for Dev')) throw new Error('fees for dev');
if (h.includes('data-build="20260923-created-ib-cta"')) throw new Error('old tip left');
/* Prefer Buy CTA wiring over Open-only Trending */
if (h.includes("data-ouvrir=\"' + enTexte(l.adr) + '\">Open</button>")) throw new Error('old Open left');
console.log('ok map-buy-cta');
