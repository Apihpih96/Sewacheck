/* SewaCheck UI glue. Plain JS, no build step. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var SOURCES = (window.SewaSources && window.SewaSources.SOURCES) || {};
  var state = { report: null, text: '', fp: null, filter: 'all' };

  // ------------------------------------------------------------ utilities
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { toast('Copied'); });
    }
    var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
    ta.select(); try { document.execCommand('copy'); toast('Copied'); } catch (e) { toast('Copy failed'); }
    ta.remove(); return Promise.resolve();
  }
  function fmtTime(ts) {
    if (!ts) return '—';
    var d = new Date(ts * 1000);
    var local = d.toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' });
    return local + ' MYT (' + d.toISOString().replace('.000', '') + ')';
  }
  function short(a) { return a ? a.slice(0, 6) + '…' + a.slice(-4) : ''; }
  function highlight(excerpt, match) {
    var e = esc(excerpt);
    if (!match) return e;
    var m = esc(match);
    var i = e.indexOf(m);
    return i < 0 ? e : e.slice(0, i) + '<mark>' + m + '</mark>' + e.slice(i + m.length);
  }

  // ------------------------------------------------------------- samples
  function renderSamples() {
    var box = $('samples');
    (window.SEWA_SAMPLES || []).forEach(function (s, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'sample';
      b.innerHTML = '<b>Sample ' + (i + 1) + '</b>' + esc(s.title);
      b.addEventListener('click', function () {
        $('agreement').value = s.text;
        $('fileStatus').textContent = 'Loaded ' + s.file;
        runAnalysis();
      });
      box.appendChild(b);
    });
  }

  // --------------------------------------------------------- file upload
  function readFile(file) {
    var status = $('fileStatus');
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { status.textContent = 'File too large (max 15 MB).'; return; }
    var isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
    status.textContent = 'Reading ' + file.name + '…';
    if (!isPdf) {
      file.text().then(function (t) { $('agreement').value = t; status.textContent = 'Loaded ' + file.name; runAnalysis(); });
      return;
    }
    if (!window.pdfjsLib) { status.textContent = 'PDF reader not loaded (needs internet). Paste the text instead.'; return; }
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    file.arrayBuffer().then(function (buf) {
      return window.pdfjsLib.getDocument({ data: buf }).promise;
    }).then(async function (pdf) {
      var out = [];
      for (var p = 1; p <= pdf.numPages; p++) {
        status.textContent = 'Extracting page ' + p + ' / ' + pdf.numPages + '…';
        var page = await pdf.getPage(p);
        var tc = await page.getTextContent();
        var lastY = null, line = '';
        var lines = [];
        tc.items.forEach(function (it) {
          var y = it.transform ? Math.round(it.transform[5]) : null;
          if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) { lines.push(line); line = ''; }
          line += it.str + (it.hasEOL ? '\n' : '');
          lastY = y;
        });
        lines.push(line);
        out.push(lines.join('\n'));
      }
      var text = out.join('\n\n').replace(/\n{3,}/g, '\n\n');
      if (!text.trim()) {
        status.textContent = 'No text found — this PDF is probably a scanned image. OCR is on the roadmap; paste the text for now.';
        return;
      }
      $('agreement').value = text;
      status.textContent = 'Extracted ' + pdf.numPages + ' page(s) from ' + file.name;
      runAnalysis();
    }).catch(function (e) { status.textContent = 'Could not read PDF: ' + e.message; });
  }

  // ------------------------------------------------------------ analysis
  function runAnalysis() {
    var text = $('agreement').value;
    if (!text.trim()) { toast('Paste or load an agreement first'); return; }
    state.text = text;
    state.report = window.SewaRules.analyze(text);
    renderReport();
    updateFingerprint();
    $('results').hidden = false;
    $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderReport() {
    var r = state.report;
    var ring = $('scoreRing');
    ring.style.setProperty('--p', r.score);
    ring.style.setProperty('--c', r.score >= 85 ? 'var(--good)' : r.score >= 70 ? 'var(--low)' : r.score >= 50 ? 'var(--med)' : 'var(--high)');
    $('scoreNum').textContent = r.score;
    $('grade').textContent = r.grade;
    $('verdict').textContent = r.verdict;
    $('countChips').innerHTML =
      '<span class="chip high">' + r.counts.high + ' high</span>' +
      '<span class="chip medium">' + r.counts.medium + ' medium</span>' +
      '<span class="chip low">' + r.counts.low + ' low</span>' +
      '<span class="chip">' + r.clauses.length + ' clauses</span>';

    var f = r.facts;
    function fact(label, val) { return '<div class="fact">' + esc(label) + '<b>' + esc(val) + '</b></div>'; }
    $('facts').innerHTML =
      fact('Monthly rent', f.monthlyRent ? 'RM' + f.monthlyRent.toLocaleString('en-MY') : 'not found') +
      fact('Security deposit', f.securityMonths != null ? f.securityMonths + ' mo' : (f.securityDeposit ? 'RM' + f.securityDeposit : 'not found')) +
      fact('Utility deposit', f.utilityMonths != null ? f.utilityMonths + ' mo' : (f.utilityDeposit ? 'RM' + f.utilityDeposit : 'not found')) +
      fact('Deposit refund', f.refundDays ? 'within ' + f.refundDays + ' days' : 'no deadline');

    renderFindings();

    var pos = r.positives;
    $('goodCount').textContent = '(' + pos.length + ')';
    $('positives').innerHTML = pos.length ? pos.map(function (p) {
      return '<li><b>' + esc(p.title) + '</b> <i class="muted">' + esc(p.bm) + '</i> — ' + clauseRef(p.clause) + '</li>';
    }).join('') : '<li class="muted">None detected.</li>';
  }

  function clauseRef(c) {
    if (!c) return 'whole agreement';
    return (c.num ? 'clause ' + esc(c.num) : 'unnumbered text') + (c.heading ? ' <span class="muted">(' + esc(c.heading.toLowerCase()) + ')</span>' : '');
  }

  function renderFindings() {
    var r = state.report;
    var list = r.findings.filter(function (x) { return state.filter === 'all' || x.severity === state.filter; });
    var ol = $('findings');
    if (!list.length) { ol.innerHTML = '<li class="muted">No ' + (state.filter === 'all' ? '' : state.filter + ' ') + 'issues found by the rules. Still read every clause.</li>'; return; }
    ol.innerHTML = list.map(function (x, i) {
      var srcs = (x.sources || []).map(function (id) {
        var s = SOURCES[id]; if (!s) return '';
        return '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.cite) + '</a>' + (s.kind === 'practice' ? ' <span class="kind">practice</span>' : '') + '</li>';
      }).join('');
      return '<li class="finding ' + x.severity + '" data-i="' + r.findings.indexOf(x) + '">' +
        '<div class="head"><h3>' + esc(x.title) + '</h3><span class="sev ' + x.severity + '">' + x.severity + '</span></div>' +
        '<div class="meta"><span class="bmlabel">' + esc(x.bm) + '</span> · ' + clauseRef(x.clause) + '</div>' +
        (x.excerpt ? '<blockquote>' + highlight(x.excerpt, x.match) + '</blockquote>' : '') +
        (x.detail ? '<div class="detail">' + esc(x.detail) + '</div>' : '') +
        '<details><summary>Why it matters</summary><p>' + esc(x.explain) + '</p><ul class="srcs">' + srcs + '</ul></details>' +
        '<details><summary>Fairer wording</summary><div class="suggest">' + esc(x.suggest) + '</div>' +
        '<button class="btn ghost small copy-suggest" type="button">Copy wording</button></details>' +
        (window.SewaAI.enabled() && x.clause ? '<button class="btn ghost small ai-explain" type="button">🤖 Explain with AI</button><div class="ai-out" hidden></div>' : '') +
        '</li>';
    }).join('');
  }

  function onFindingsClick(e) {
    var li = e.target.closest('.finding'); if (!li) return;
    var f = state.report.findings[+li.getAttribute('data-i')];
    if (e.target.classList.contains('copy-suggest')) copy(f.suggest);
    if (e.target.classList.contains('ai-explain')) {
      var out = li.querySelector('.ai-out'); out.hidden = false; out.textContent = 'Thinking…';
      var clause = state.report.clauses[f.clause.idx];
      var fx = Object.assign({}, f, { sourceCites: (f.sources || []).map(function (id) { return SOURCES[id] ? SOURCES[id].cite + ': ' + SOURCES[id].note : id; }) });
      window.SewaAI.explain(fx, clause.text, $('aiBm').checked ? 'bm' : 'en')
        .then(function (t) { out.textContent = t + '\n\n— AI-generated paraphrase; the rule-based flag above is the reference.'; })
        .catch(function (err) { out.textContent = err.message; });
    }
  }

  function reportText() {
    var r = state.report; if (!r) return '';
    var lines = ['SewaCheck report — ' + new Date().toISOString(), 'Score ' + r.score + '/100 (grade ' + r.grade + '): ' + r.verdict,
      'Fingerprint (SHA-256, ' + window.SewaFingerprint.SPEC + '): ' + (state.fp ? state.fp.hash : '-'), ''];
    r.findings.forEach(function (f, i) {
      lines.push((i + 1) + '. [' + f.severity.toUpperCase() + '] ' + f.title + ' / ' + f.bm + ' — ' + (f.clause ? 'clause ' + (f.clause.num || '?') : 'whole agreement'));
      if (f.excerpt) lines.push('   "' + f.excerpt + '"');
      if (f.detail) lines.push('   ' + f.detail);
      lines.push('   Why: ' + f.explain);
      lines.push('   Fairer wording: ' + f.suggest);
      lines.push('   Sources: ' + (f.sources || []).map(function (id) { return SOURCES[id] ? SOURCES[id].cite + ' <' + SOURCES[id].url + '>' : id; }).join('; '));
      lines.push('');
    });
    lines.push('Not legal advice. The Residential Tenancy Act is not in force as of Oct 2026.');
    return lines.join('\n');
  }

  // --------------------------------------------------------- fingerprint
  function updateFingerprint() {
    var text = $('agreement').value;
    if (!text.trim()) { state.fp = null; $('hash').textContent = '—'; $('hashMeta').textContent = ''; return Promise.resolve(null); }
    return window.SewaFingerprint.fingerprint(text).then(function (fp) {
      state.fp = fp;
      $('hash').textContent = fp.hash;
      $('hashMeta').textContent = fp.length.toLocaleString() + ' characters after normalisation · ' + fp.spec;
      return fp;
    });
  }

  function renderChainMode() {
    var box = $('chainMode');
    var C = window.SewaChain;
    var cfg = window.SEWA_CONFIG;
    if (!C) { box.className = 'mode warn'; box.textContent = 'Blockchain library not loaded (offline?). Fingerprinting still works.'; return; }
    if (C.hasContract()) {
      box.className = 'mode';
      box.innerHTML = '🔗 <b>Registry mode.</b> AgreementRegistry on ' + esc(cfg.CHAIN_NAME) + ': <a target="_blank" rel="noopener" href="' + C.explorerAddr(cfg.CONTRACT_ADDRESS) + '">' + short(cfg.CONTRACT_ADDRESS) + '</a>. The other party can then press <i>Acknowledge</i> to confirm the same version.';
      $('ackBtn').hidden = false;
      $('verifyRegBtn').hidden = false;
    } else {
      box.className = 'mode warn';
      box.innerHTML = '⚠️ <b>Registry contract not yet deployed.</b> Fallback: the fingerprint is written into a 0-ETH transaction to your own address on ' + esc(cfg.CHAIN_NAME) + ' (prefix <code>' + esc(cfg.TX_DATA_PREFIX) + '</code>). Anyone can verify it in step 3 by transaction hash. You only pay test-network gas.';
      $('ackBtn').hidden = true;
      $('verifyRegBtn').hidden = true;
    }
    if (!C.hasWallet()) {
      var a = $('mmLink'); a.hidden = false; a.href = C.metamaskDeepLink();
    }
  }

  function setBusy(btn, busy) { btn.disabled = busy; }

  function doAnchor() {
    var st = $('anchorStatus');
    var btn = $('anchorBtn');
    updateFingerprint().then(function (fp) {
      if (!fp) { toast('Load an agreement first'); return; }
      if (!window.SewaChain) { st.innerHTML = '<span class="bad">Blockchain library not loaded.</span>'; return; }
      if (!window.SewaChain.hasWallet()) {
        st.innerHTML = 'No wallet detected. On Android, open this page in the <b>MetaMask app → Browser</b> (button above), switch to Sepolia, and get free test ETH from a Sepolia faucet. Your fingerprint is still shown above — you can copy it.';
        return;
      }
      setBusy(btn, true);
      window.SewaChain.anchor(fp.hash, $('label').value.trim(), function (m) { st.textContent = m; })
        .then(function (res) {
          if (res.already) {
            st.innerHTML = '<div class="result-box ok"><span class="ok">Already anchored ✓</span><br>by ' + esc(short(res.from)) + ' on ' + esc(fmtTime(res.timestamp)) + (res.label ? '<br>label: ' + esc(res.label) : '') + '</div>';
            return;
          }
          $('txHash').value = res.txHash;
          st.innerHTML = '<div class="result-box ok"><span class="ok">Anchored ✓</span><br>Block ' + res.blockNumber + ' · ' + esc(fmtTime(res.timestamp)) +
            '<br>Tx: <a target="_blank" rel="noopener" href="' + window.SewaChain.explorerTx(res.txHash) + '">' + esc(short(res.txHash)) + '</a>' +
            '<br><small>Save this transaction hash with your signed copy. It is also pre-filled in step 3.</small></div>';
        })
        .catch(function (e) {
          var msg = (e && (e.shortMessage || e.reason || e.message)) || String(e);
          if (/insufficient funds/i.test(msg)) msg = 'Not enough Sepolia test ETH for gas. Get some free from a Sepolia faucet, then try again.';
          if (/user rejected|denied/i.test(msg)) msg = 'You cancelled the transaction in the wallet.';
          st.innerHTML = '<span class="bad">' + esc(msg) + '</span>';
        })
        .finally(function () { setBusy(btn, false); });
    });
  }

  function doAck() {
    var st = $('anchorStatus');
    updateFingerprint().then(function (fp) {
      if (!fp) return;
      window.SewaChain.acknowledge(fp.hash, function (m) { st.textContent = m; })
        .then(function (r) { st.innerHTML = '<div class="result-box ok"><span class="ok">Acknowledged ✓</span> Tx <a target="_blank" rel="noopener" href="' + window.SewaChain.explorerTx(r.txHash) + '">' + esc(short(r.txHash)) + '</a></div>'; })
        .catch(function (e) { st.innerHTML = '<span class="bad">' + esc(e.shortMessage || e.message) + '</span>'; });
    });
  }

  function doVerifyTx() {
    var st = $('verifyStatus');
    var tx = $('txHash').value.trim();
    updateFingerprint().then(function (fp) {
      if (!fp) { toast('Load the agreement text in step 1 first'); return; }
      if (!window.SewaChain) { st.innerHTML = '<span class="bad">Blockchain library not loaded.</span>'; return; }
      st.textContent = 'Looking up transaction on Sepolia…';
      window.SewaChain.verifyTx(tx, fp.hash).then(function (r) {
        if (!r.found) { st.innerHTML = '<div class="result-box bad"><span class="bad">Transaction not found on Sepolia.</span></div>'; return; }
        if (!r.anchoredHash) { st.innerHTML = '<div class="result-box bad"><span class="bad">This transaction does not contain a SewaCheck fingerprint.</span></div>'; return; }
        var base = '<br>Anchored by ' + esc(short(r.from)) + ' · block ' + r.blockNumber + ' · ' + esc(fmtTime(r.timestamp)) + (r.success === false ? '<br><b>Warning: transaction failed on-chain.</b>' : '') +
          '<br>On-chain fingerprint: <code>' + esc(r.anchoredHash) + '</code>';
        st.innerHTML = r.matches && r.success !== false
          ? '<div class="result-box ok"><span class="ok">✅ MATCH — this text is exactly the anchored version.</span>' + base + '</div>'
          : '<div class="result-box bad"><span class="bad">❌ DIFFERENT — this text does not match the anchored version.</span>' + base + '<br>Your text: <code>' + esc(fp.hash) + '</code></div>';
      }).catch(function (e) { st.innerHTML = '<span class="bad">' + esc(e.shortMessage || e.message) + '</span>'; });
    });
  }

  function doVerifyReg() {
    var st = $('verifyStatus');
    updateFingerprint().then(function (fp) {
      if (!fp) { toast('Load the agreement text in step 1 first'); return; }
      st.textContent = 'Checking registry…';
      window.SewaChain.verifyRegistry(fp.hash).then(function (r) {
        st.innerHTML = r.exists
          ? '<div class="result-box ok"><span class="ok">✅ Found in registry.</span><br>Anchored by ' + esc(short(r.anchorer)) + ' · ' + esc(fmtTime(r.timestamp)) + ' · block ' + r.blockNumber + (r.label ? '<br>Label: ' + esc(r.label) : '') + '<br>Acknowledged by ' + r.acknowledgements + ' address(es).</div>'
          : '<div class="result-box bad"><span class="bad">❌ Not found.</span> This exact text was never anchored in the registry (or it was changed).</div>';
      }).catch(function (e) { st.innerHTML = '<span class="bad">' + esc(e.shortMessage || e.message) + '</span>'; });
    });
  }

  function renderSources() {
    $('sourceList').innerHTML = Object.keys(SOURCES).map(function (id) {
      var s = SOURCES[id];
      return '<li><span class="kind">' + esc(s.kind) + '</span><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.cite) + '</a><br><span class="muted small">' + esc(s.note) + '</span>' +
        (s.official ? ' <a class="small" href="' + esc(s.official) + '" target="_blank" rel="noopener">[official]</a>' : '') + '</li>';
    }).join('');
  }

  // ---------------------------------------------------------------- wire
  function init() {
    renderSamples();
    renderSources();
    renderChainMode();
    $('analyzeBtn').addEventListener('click', runAnalysis);
    $('clearBtn').addEventListener('click', function () { $('agreement').value = ''; $('results').hidden = true; $('fileStatus').textContent = ''; updateFingerprint(); });
    $('file').addEventListener('change', function (e) { readFile(e.target.files[0]); e.target.value = ''; });
    $('agreement').addEventListener('input', function () { clearTimeout(init._t); init._t = setTimeout(updateFingerprint, 300); });
    $('findings').addEventListener('click', onFindingsClick);
    document.querySelectorAll('.filter .chip').forEach(function (b) {
      b.addEventListener('click', function () {
        document.querySelectorAll('.filter .chip').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on'); state.filter = b.getAttribute('data-filter'); renderFindings();
      });
    });
    $('copyReport').addEventListener('click', function () { copy(reportText()); });
    $('downloadReport').addEventListener('click', function () {
      var blob = new Blob([reportText()], { type: 'text/plain' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'sewacheck-report.txt'; a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    });
    $('copyHash').addEventListener('click', function () { if (state.fp) copy(state.fp.hash); });
    $('label').addEventListener('input', function () {
      var n = new TextEncoder().encode($('label').value).length;
      $('labelBytes').textContent = n + ' / 64 bytes' + (/\d{6}-?\d{2}-?\d{4}/.test($('label').value) ? ' — looks like an IC number! Remove it.' : '');
    });
    $('anchorBtn').addEventListener('click', doAnchor);
    $('ackBtn').addEventListener('click', doAck);
    $('verifyTxBtn').addEventListener('click', doVerifyTx);
    $('verifyRegBtn').addEventListener('click', doVerifyReg);
    $('aiSave').addEventListener('click', function () {
      window.SewaAI.configure({ key: $('aiKey').value, model: $('aiModel').value, baseUrl: $('aiBase').value });
      $('aiKey').value = '';
      $('aiStatus').textContent = window.SewaAI.enabled() ? 'Enabled for this tab.' : 'No key entered.';
      if (state.report) renderFindings();
    });
    $('aiForget').addEventListener('click', function () { window.SewaAI.clear(); $('aiStatus').textContent = 'Key forgotten.'; if (state.report) renderFindings(); });

    // Deep link support: ?sample=1 loads a sample, ?tx=0x… pre-fills verify.
    var q = new URLSearchParams(location.search);
    var sIdx = parseInt(q.get('sample'), 10);
    if (sIdx && window.SEWA_SAMPLES && window.SEWA_SAMPLES[sIdx - 1]) { $('agreement').value = window.SEWA_SAMPLES[sIdx - 1].text; runAnalysis(); }
    if (q.get('tx')) $('txHash').value = q.get('tx');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
