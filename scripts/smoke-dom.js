#!/usr/bin/env node
// Headless smoke test of index.html using jsdom (no real browser needed).
//   npm i --no-save jsdom@24   (one-time, dev only)
//   node scripts/smoke-dom.js            # offline: core features
//   SMOKE_NETWORK=1 node scripts/smoke-dom.js  # also loads CDN libs + reads Sepolia via public RPC
'use strict';
const path = require('path');
const { JSDOM, VirtualConsole } = require(process.env.JSDOM_PATH || 'jsdom');

const root = path.join(__dirname, '..');
const NET = process.env.SMOKE_NETWORK === '1';
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => {
  const msg = String(e && (e.message || e));
  // Without network the CDN scripts can't load — that's expected offline.
  if (!NET && /Could not load script|cdnjs/.test(msg)) return;
  errors.push(msg);
});
vc.on('error', (e) => errors.push('console.error: ' + e));

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function until(fn, ms, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await wait(200); }
  throw new Error('Timed out waiting for ' + label);
}

(async () => {
  const dom = await JSDOM.fromFile(path.join(root, 'index.html'), {
    runScripts: 'dangerously',
    resources: NET ? 'usable' : undefined,
    pretendToBeVisual: true,
    virtualConsole: vc,
    url: NET ? undefined : 'https://example.github.io/sewacheck/index.html',
    beforeParse(win) {
      const { TextEncoder, TextDecoder } = require('util');
      if (!win.TextEncoder) win.TextEncoder = TextEncoder;
      if (!win.TextDecoder) win.TextDecoder = TextDecoder;
      win.HTMLElement.prototype.scrollIntoView = function () {};
      if (!win.fetch) { win.fetch = fetch; win.Headers = Headers; win.Request = Request; win.Response = Response; }
    }
  });
  const { window } = dom;
  const doc = window.document;

  // jsdom does not execute local <script src> without resources:'usable'; inject them for the offline run.
  if (!NET) {
    const fs = require('fs');
    for (const f of ['config', 'sources', 'rules', 'fingerprint', 'samples-data', 'ai', 'chain', 'app']) {
      window.eval(fs.readFileSync(path.join(root, 'js', f + '.js'), 'utf8'));
    }
  }
  await until(() => window.SewaRules && doc.querySelectorAll('.sample').length === 3, 20000, 'app init');
  if (NET) await until(() => window.ethers && window.pdfjsLib, 30000, 'CDN libs (ethers, pdf.js)');

  // 1) Load the unfair sample and check results render
  doc.querySelectorAll('.sample')[0].click();
  await until(() => !doc.getElementById('results').hidden, 5000, 'results');
  const n = doc.querySelectorAll('#findings .finding').length;
  const score = doc.getElementById('scoreNum').textContent;
  await until(() => /^0x[0-9a-f]{64}$/.test(doc.getElementById('hash').textContent), 5000, 'fingerprint');
  const hash = doc.getElementById('hash').textContent;
  console.log('unfair sample → findings:', n, 'score:', score, 'hash:', hash);
  if (n < 15) throw new Error('expected >=15 findings, got ' + n);

  // 2) Filter
  doc.querySelector('.filter .chip[data-filter="high"]').click();
  const highs = doc.querySelectorAll('#findings .finding.high').length;
  const all = doc.querySelectorAll('#findings .finding').length;
  console.log('high filter →', highs, 'of', all);
  if (highs !== all || highs === 0) throw new Error('filter broken');

  // 3) Balanced sample
  doc.querySelector('.filter .chip[data-filter="all"]').click();
  doc.querySelectorAll('.sample')[1].click();
  await wait(300);
  console.log('balanced sample → score:', doc.getElementById('scoreNum').textContent, 'positives:', doc.querySelectorAll('#positives li').length);

  // 4) Chain mode banner (no contract configured)
  console.log('chain mode:', doc.getElementById('chainMode').textContent.trim().slice(0, 60) + '…');

  // 5) Network: verify-by-tx against a real Sepolia tx that is NOT a SewaCheck anchor
  if (NET) {
    const p = new window.ethers.JsonRpcProvider(window.SEWA_CONFIG.RPC_URLS[0], 11155111, { staticNetwork: true });
    const blk = await p.getBlock('latest', false);
    const someTx = blk.transactions[0];
    doc.getElementById('txHash').value = someTx;
    doc.getElementById('verifyTxBtn').click();
    await until(() => /fingerprint|not found|MATCH|DIFFERENT/i.test(doc.getElementById('verifyStatus').textContent), 30000, 'verify result');
    console.log('verify random Sepolia tx', someTx.slice(0, 12) + '… →', doc.getElementById('verifyStatus').textContent.trim().slice(0, 80));
  }

  if (errors.length) { console.error('JS errors:\n' + errors.join('\n')); process.exit(1); }
  console.log('SMOKE OK — no JS errors' + (NET ? ' (with CDN + Sepolia RPC)' : ' (offline core)'));
  window.close();
  process.exit(0);
})().catch((e) => { console.error('SMOKE FAILED:', e.message, errors.join('\n')); process.exit(1); });
