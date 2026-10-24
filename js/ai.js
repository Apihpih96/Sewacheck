/*
 * Optional "AI explain" — OFF by default.
 * Only runs if the user pastes THEIR OWN API key into the page. The key is kept
 * in memory for this tab only (never stored, never sent anywhere except the
 * provider URL the user chooses). Works with any OpenAI-compatible
 * /chat/completions endpoint.
 * The rule engine remains the source of truth; the AI only rephrases.
 */
(function (root) {
  'use strict';
  var state = { key: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' };

  function configure(opts) {
    if (opts.key != null) state.key = String(opts.key).trim();
    if (opts.baseUrl) state.baseUrl = String(opts.baseUrl).trim().replace(/\/+$/, '');
    if (opts.model) state.model = String(opts.model).trim();
  }
  function enabled() { return !!state.key; }
  function clear() { state.key = ''; }

  async function explain(finding, clauseText, lang) {
    if (!state.key) throw new Error('Add your API key first.');
    var sys = 'You help Malaysian residential tenants understand tenancy clauses. ' +
      'Explain in plain, friendly ' + (lang === 'bm' ? 'Bahasa Malaysia' : 'English') + ' in at most 120 words. ' +
      'Use ONLY the legal points provided; do not invent statutes, cases or numbers. ' +
      'End with one practical question the tenant could ask the landlord. Say it is not legal advice.';
    var user = 'Clause:\n"""' + clauseText + '"""\n\nFlag: ' + finding.title +
      '\nWhy it was flagged: ' + finding.explain +
      '\nLegal points: ' + (finding.sourceCites || []).join('; ') +
      '\nFairer wording suggested: ' + finding.suggest;
    var res = await fetch(state.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + state.key },
      body: JSON.stringify({ model: state.model, temperature: 0.2, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] })
    });
    if (!res.ok) {
      var t = await res.text().catch(function () { return ''; });
      throw new Error('AI request failed (' + res.status + '). ' + t.slice(0, 160));
    }
    var j = await res.json();
    return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '(no answer)';
  }

  root.SewaAI = { configure: configure, enabled: enabled, clear: clear, explain: explain };
})(typeof self !== 'undefined' ? self : this);
