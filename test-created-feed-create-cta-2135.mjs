// tip 20260922-2135 — unhooked Created feed rows must route to free Create, not fake V8 birth.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
assert.doesNotMatch(html, /Launch hooked V8/);
assert.ok(html.includes('data-tf-act=\"create-here\">Create here (free)</button>'), 'feed CTA says Create here (free)');
assert.ok(html.includes("+ ' · <span class=\"filOpen\">Open profile</span>'"), 'Open profile remains secondary');
assert.ok(html.includes("const createHere = ev.target.closest('[data-tf-act=\"create-here\"]')"), 'feed CTA has delegated handler');
assert.ok(html.includes("try { allerA('creer'); } catch (_) { location.hash = '#creer'; }"), 'feed CTA opens free Create');
// The V8 refusal/eligibility path remains intact for any legacy CTA elsewhere.
assert.ok(html.includes("const v8 = ev.target.closest('[data-v8-cta]')"), 'legacy V8 handler remains available');
assert.ok(html.includes('eligibleNaissanceV8'), 'V8 eligibility gate remains');
console.log('PASS test-created-feed-create-cta-2135');
