/*
 * SewaCheck rule engine — transparent, deterministic, no API key needed.
 *
 * analyze(text) -> {
 *   clauses:   [{ idx, num, heading, text }],
 *   findings:  [{ ruleId, severity, title, bm, clause, excerpt, explain, suggest, sources }],
 *   positives: [{ ruleId, title, bm, clause, excerpt }],
 *   facts:     { monthlyRent, securityDeposit, utilityDeposit, securityMonths, utilityMonths, ... },
 *   score, grade, verdict, counts
 * }
 *
 * Every rule is a plain object below: regexes you can read, an explanation,
 * the legal/practice sources (see sources.js) and a suggested fairer wording.
 * This is a screening aid, NOT legal advice.
 *
 * UMD: works in the browser (window.SewaRules) and in Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SewaRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SEVERITY_WEIGHT = { high: 15, medium: 7, low: 3, info: 0 };
  var SEVERITY_ORDER = { high: 0, medium: 1, low: 2, info: 3 };

  // ---------------------------------------------------------------- helpers
  function norm(s) {
    return String(s || '')
      .replace(/\r\n?/g, '\n')
      .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
      .replace(/[\u201C\u201D\u2033]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\u00A0/g, ' ');
  }
  function flat(s) { return s.replace(/\s+/g, ' ').trim(); }
  function first(text, regexes) {
    for (var i = 0; i < regexes.length; i++) {
      var m = regexes[i].exec(text);
      if (m) return m;
    }
    return null;
  }
  function has(text, regexes) { return !!first(text, regexes); }
  function excerptAround(text, m, radius) {
    radius = radius || 110;
    if (!m) return text.length > 2 * radius ? text.slice(0, 2 * radius) + '…' : text;
    var s = Math.max(0, m.index - radius);
    var e = Math.min(text.length, m.index + m[0].length + radius);
    return (s > 0 ? '…' : '') + text.slice(s, e).trim() + (e < text.length ? '…' : '');
  }
  function money(str) {
    if (!str) return null;
    var n = parseFloat(String(str).replace(/,/g, ''));
    return isFinite(n) ? n : null;
  }
  var WORD_NUM = {
    half: 0.5, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
    nine: 9, ten: 10, eleven: 11, twelve: 12, fourteen: 14, thirty: 30, 'twenty-four': 24, 'forty-eight': 48
  };
  function numWord(w) {
    if (w == null) return null;
    w = String(w).toLowerCase().trim();
    if (/^\d+(\.\d+)?$/.test(w)) return parseFloat(w);
    return Object.prototype.hasOwnProperty.call(WORD_NUM, w) ? WORD_NUM[w] : null;
  }

  // ------------------------------------------------------- clause splitting
  var NUM_LINE = /^\s*(?:(?:clause|section|article)\s+)?(\d{1,2}(?:\.\d{1,2}){0,3})[.)]?\s+(\S.*)$/i;
  var HEADING_LINE = /^\s*([A-Z][A-Z0-9 &'\/,()-]{3,60})\s*:?\s*$/;

  function splitClauses(raw) {
    var text = norm(raw);
    var lines = text.split('\n');
    var clauses = [];
    var cur = null;
    var heading = '';
    function push() {
      if (cur && flat(cur.text)) {
        cur.text = flat(cur.text);
        clauses.push(cur);
      }
      cur = null;
    }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var m = NUM_LINE.exec(line);
      var h = HEADING_LINE.exec(line);
      if (m && !/^\d{1,2}\.\d{1,2}\.\d{2,4}\b/.test(line.trim())) { // not a date
        push();
        cur = { num: m[1], heading: heading, text: m[2] };
      } else if (h && !/[a-z]/.test(line) && line.trim().split(/\s+/).length <= 8) {
        push();
        heading = flat(h[1]);
      } else if (cur) {
        cur.text += '\n' + line;
      } else if (flat(line)) {
        cur = { num: '', heading: heading, text: line };
      }
    }
    push();

    // Fallback: no numbering -> split on blank lines (paragraphs).
    if (clauses.filter(function (c) { return c.num; }).length < 3) {
      clauses = text.split(/\n\s*\n/).map(function (p) { return flat(p); })
        .filter(Boolean)
        .map(function (p, k) { return { num: String(k + 1), heading: '', text: p }; });
    }
    clauses.forEach(function (c, k) { c.idx = k; });
    return clauses;
  }

  // ---------------------------------------------------------- fact extraction
  function extractFacts(clauses) {
    var f = {
      monthlyRent: null, securityDeposit: null, utilityDeposit: null,
      securityMonths: null, utilityMonths: null, termMonths: null, refundDays: null
    };
    var all = clauses.map(function (c) { return c.text; }).join('\n');
    var sentences = all.split(/[.;](?:\s+|$)|\n/);

    sentences.forEach(function (s) {
      var low = s.toLowerCase();
      var isDeposit = /deposit/.test(low);
      if (f.monthlyRent == null && /\brent(al)?\b/.test(low) && /(month|per month|monthly)/.test(low) && !isDeposit) {
        var m = /RM\s?([\d,]+(?:\.\d{1,2})?)/i.exec(s);
        if (m) f.monthlyRent = money(m[1]);
      }
      var sec = /security\s+deposit[^.;]*?RM\s?([\d,]+(?:\.\d{1,2})?)/i.exec(s);
      if (sec && f.securityDeposit == null) f.securityDeposit = money(sec[1]);
      var util = /utilit(?:y|ies)\s+deposit[^.;]*?RM\s?([\d,]+(?:\.\d{1,2})?)/i.exec(s);
      if (util && f.utilityDeposit == null) f.utilityDeposit = money(util[1]);
      var secM = /security\s+deposit[^.;]*?\b([a-z-]+|\d+(?:\.\d+)?)\s*(?:\((\d+(?:\.\d+)?)\)\s*)?months?'?s?\b/i.exec(s);
      if (secM && f.securityMonths == null) f.securityMonths = numWord(secM[2] || secM[1]);
      var utilM = /utilit(?:y|ies)\s+deposit[^.;]*?\b([a-z-]+|\d+(?:\.\d+)?)\s*(?:\((\d+(?:\.\d+)?)\)\s*)?months?'?s?\b/i.exec(s);
      if (utilM && f.utilityMonths == null) f.utilityMonths = numWord(utilM[2] || utilM[1]);
      var term = /(?:term|period)\s+of\s+(?:the\s+tenancy\s+)?(?:shall\s+be\s+|is\s+|will\s+be\s+)?([a-z-]+|\d+)\s*(?:\((\d+)\)\s*)?(years?|months?)/i.exec(s);
      if (term && f.termMonths == null) {
        var n = numWord(term[2] || term[1]);
        if (n != null) f.termMonths = /year/i.test(term[3]) ? n * 12 : n;
      }
    });
    if (f.monthlyRent) {
      if (f.securityDeposit != null && f.securityMonths == null) f.securityMonths = round2(f.securityDeposit / f.monthlyRent);
      if (f.utilityDeposit != null && f.utilityMonths == null) f.utilityMonths = round2(f.utilityDeposit / f.monthlyRent);
    }
    return f;
  }
  function round2(n) { return Math.round(n * 100) / 100; }

  // ------------------------------------------------------------- the rules
  var LANDLORD = /\b(landlord|owner|lessor)\b/i;
  var TENANT = /\b(tenant|lessee|occupier)\b/i;
  var VIA_COURT = /(?:^|[^t]\s)(?:by|through|via|obtain(?:ing)?|pursuant to)\s+(?:an?\s+|the\s+)?(?:court\s+order|order\s+of\s+(?:the\s+)?court|legal\s+proceedings|proceedings\s+in\s+(?:the\s+)?court|warrant\s+of\s+distress)/i;

  var CLAUSE_RULES = [
    {
      id: 'SELF_HELP_EVICTION', severity: 'high',
      title: 'Self-help eviction (lock-out, utility cut-off or removal without court)',
      bm: 'Pengusiran tanpa perintah mahkamah',
      test: function (t) {
        var act = first(t, [
          /\b(change|replace|chang(?:e|ing)|swap)\s+(?:of\s+)?(?:the\s+)?locks?\b/i,
          /\block(?:ing)?\s+(?:the\s+tenant\s+)?out\b|\bpadlock/i,
          /\b(cut\s*(?:off)?|disconnect|terminate|suspend)\s+(?:the\s+)?(?:supply\s+of\s+)?(?:electricity|water|power|utilities|utility|internet)/i,
          /\bre-?enter\b[^.]{0,80}\b(?:repossess|take\s+(?:back\s+)?possession|retake)/i,
          /\b(remove|throw\s+out|dispose\s+of|clear\s+out)\b[^.]{0,40}\b(?:tenant'?s?\s+)?(belongings|possessions|furniture|personal\s+effects)/i,
          /\bevict\b[^.]{0,60}\b(forthwith|immediately|without)/i
        ]);
        if (!act) return null;
        if (!LANDLORD.test(t)) return null;
        if (VIA_COURT.test(t) && !/without\s+(?:any\s+)?(?:court|legal|order)/i.test(t)) return null;
        return act;
      },
      explain: 'A landlord in Malaysia cannot evict by "self-help". After a tenancy ends (or is terminated), possession can only be recovered from a lawful occupier through court proceedings. Changing locks, cutting water/electricity or removing belongings to force a tenant out is unlawful even if rent is owed.',
      sources: ['SRA_7'],
      suggest: 'If the Tenant fails to deliver vacant possession upon expiry or lawful termination, the Landlord may recover possession only through proceedings in court in accordance with section 7(2) of the Specific Relief Act 1950. The Landlord shall not disconnect utilities, change the locks or remove the Tenant\u2019s belongings for the purpose of recovering possession or rent.'
    },
    {
      id: 'SEIZE_GOODS_WITHOUT_WARRANT', severity: 'high',
      title: 'Seizing tenant\u2019s goods for rent without a court warrant',
      bm: 'Rampas barang tanpa waran mahkamah',
      test: function (t) {
        var m = first(t, [
          /\b(seize|detain|distrain|confiscate|impound|retain|hold|sell|auction)\b[^.]{0,60}\b(goods|belongings|furniture|chattels|possessions|movable\s+property|personal\s+effects|tenant'?s\s+property)/i
        ]);
        if (!m) return null;
        if (!/\b(rent|arrears?|outstanding|sum(?:s)?\s+due|owing|unpaid)\b/i.test(t)) return null;
        if (/warrant\s+of\s+distress|distress\s+act/i.test(t)) return null;
        return m;
      },
      explain: 'Seizing and selling a tenant\u2019s goods for unpaid rent ("distress") is only allowed through the Distress Act 1951: the landlord must apply to a Judge or Registrar for a warrant of distress, executed by a bailiff, for at most 12 completed months of arrears. A clause letting the landlord take goods directly is contrary to s.4 of that Act.',
      sources: ['DISTRESS_4_5'],
      suggest: 'Any recovery of arrears of rent by distress shall be made only by way of a warrant of distress issued under the Distress Act 1951. Nothing in this Agreement authorises the Landlord to seize, detain or sell the Tenant\u2019s property without such a warrant.'
    },
    {
      id: 'ENTRY_WITHOUT_NOTICE', severity: 'medium',
      title: 'Landlord may enter at any time / without notice',
      bm: 'Masuk premis tanpa notis',
      test: function (t) {
        if (!/\b(enter|entry|access|inspect|view)\b/i.test(t)) return null;
        var m = first(t, [
          /\b(?:at\s+(?:any|all)\s+times?|at\s+any\s+hour|any\s+time\s+of\s+(?:the\s+)?day\s+or\s+night)\b/i,
          /\bwithout\s+(?:any\s+|prior\s+|giving\s+(?:any\s+)?)?(?:notice|consent|permission|prior\s+notice)\b/i
        ]);
        if (!m) return null;
        var noticeGiven = /\b(\d+|twenty[- ]four|forty[- ]eight|seventy[- ]two)\s*(?:\(\d+\)\s*)?hours?'?\s*(?:prior\s+|advance\s+)?(?:written\s+)?notice/i.test(t) ||
          /\breasonable\s+(?:prior\s+)?(?:written\s+)?notice\b/i.test(t);
        var onlyEmergency = /emergenc/i.test(t) && !/at\s+(?:any|all)\s+times?/i.test(t);
        if (onlyEmergency) return null;
        if (noticeGiven && !/at\s+(?:any|all)\s+times?\s+without/i.test(t)) return null;
        return m;
      },
      explain: 'A tenant is entitled to quiet enjoyment of the home during the tenancy. There is no statute fixing a notice period, but common practice is 24\u201348 hours\u2019 written notice at reasonable hours, with entry without notice only in a genuine emergency.',
      sources: ['QUIET_ENJOYMENT'],
      suggest: 'The Landlord may enter the Premises to inspect or carry out repairs at reasonable hours upon giving the Tenant at least twenty-four (24) hours\u2019 prior written notice (including by WhatsApp or e-mail), save in an emergency where immediate entry is necessary to prevent damage or danger.'
    },
    {
      id: 'DEPOSIT_FULL_FORFEITURE', severity: 'high',
      title: 'Entire deposit forfeited regardless of actual loss',
      bm: 'Deposit dirampas sepenuhnya',
      test: function (t) {
        if (!/deposit/i.test(t)) return null;
        var m = first(t, [
          /\b(?:entire|whole|full|all\s+(?:of\s+)?the|total)\s+(?:security\s+|utility\s+)?deposits?[^.]{0,80}\bforfeit/i,
          /\bforfeit(?:ed|s)?\b[^.]{0,60}\b(?:entire|whole|full|all\s+(?:of\s+)?the|total)\s+(?:security\s+|utility\s+)?deposits?/i,
          /\bdeposits?\b[^.]{0,80}\bforfeit(?:ed)?\s+(?:absolutely|in\s+full|entirely|wholly)/i,
          /\bdeposits?\b[^.]{0,60}\bforfeit(?:ed)?\b/i
        ]);
        if (!m) return null;
        if (/\b(such\s+(?:sum|amount|portion)|to\s+the\s+extent|actual\s+(?:loss|cost|damage)|reasonable\s+compensation|less\s+(?:any|such)|after\s+deducting|proportion)/i.test(t)) return null;
        return m;
      },
      explain: 'Under s.75 Contracts Act 1950 (applied to deposits by the Federal Court in Cubic Electronics), a party can only keep "reasonable compensation not exceeding" the stated sum. Automatic forfeiture of the whole deposit for any breach — however small — risks being an unenforceable penalty. Deductions should match genuine loss (unpaid rent, damage beyond fair wear and tear).',
      sources: ['CA_75', 'CUBIC', 'DEPOSIT_PRACTICE'],
      suggest: 'Upon a breach by the Tenant, the Landlord may deduct from the Security Deposit only such sums as are reasonably required to compensate the Landlord for its actual loss (including unpaid rent and the reasonable cost of repairing damage beyond fair wear and tear), and shall provide an itemised statement with receipts. Any balance shall be refunded to the Tenant.'
    },
    {
      id: 'NON_REFUNDABLE_DEPOSIT', severity: 'high',
      title: 'Deposit described as non-refundable',
      bm: 'Deposit tidak boleh dikembalikan',
      test: function (t) {
        return first(t, [
          /\bnon[- ]?refundable\b[^.]{0,60}\bdeposit/i,
          /\bdeposits?\b[^.]{0,80}\b(?:non[- ]?refundable|not\s+(?:be\s+)?refundable|shall\s+not\s+be\s+(?:refunded|returned))/i
        ]);
      },
      explain: 'A security or utility deposit is held as security for the tenant\u2019s obligations and is normally refunded (less proven deductions) at the end of the tenancy. Making it non-refundable turns it into extra rent and invites a s.75 Contracts Act challenge. (A separate, clearly labelled booking fee credited to the first month is a different thing.)',
      sources: ['CA_75', 'DEPOSIT_PRACTICE'],
      suggest: 'The Security Deposit and Utility Deposit are refundable and shall be returned to the Tenant, free of interest, within fourteen (14) days after the Tenant delivers vacant possession, less only lawful deductions supported by an itemised statement.'
    },
    {
      id: 'EXCESSIVE_LATE_CHARGE', severity: 'medium',
      title: 'Very high late-payment interest or daily penalty',
      bm: 'Caj lewat bayar melampau',
      test: function (t, ctx) {
        if (!/\b(late|overdue|arrears?|unpaid|delay|default|outstanding)\b/i.test(t)) return null;
        var re = /(\d+(?:\.\d+)?)\s*%\s*(?:per\s+|a\s+|each\s+|every\s+)?(annum|year|yearly|p\.?\s?a\.?|month|monthly|week|weekly|day|daily)/ig;
        var m, worst = null;
        while ((m = re.exec(t))) {
          var r = parseFloat(m[1]);
          var u = m[2].toLowerCase();
          var annual = /day|daily/.test(u) ? r * 365 : /week/.test(u) ? r * 52 : /month/.test(u) ? r * 12 : r;
          if (!worst || annual > worst.annual) worst = { m: m, annual: annual };
        }
        if (worst && worst.annual > 10) {
          ctx.detail = 'Effective rate \u2248 ' + Math.round(worst.annual) + '% per year.';
          if (worst.annual > 24) ctx.severity = 'high';
          return worst.m;
        }
        var daily = /RM\s?([\d,]+(?:\.\d{1,2})?)\s*(?:per|for\s+each|for\s+every|every|a)\s+(?:day|calendar\s+day)/i.exec(t);
        if (daily) { ctx.detail = 'Flat daily charge of RM' + daily[1] + ' regardless of the amount owed.'; return daily; }
        return null;
      },
      explain: 'Late-payment charges are a sum "named for breach", so s.75 Contracts Act 1950 limits recovery to reasonable compensation. Common Malaysian agreements use around 8\u201310% per year on the overdue amount. Monthly or daily percentages (or flat daily fines) can quickly exceed the actual loss and look like a penalty.',
      sources: ['CA_75', 'CUBIC'],
      suggest: 'If any rent remains unpaid for more than seven (7) days after its due date, the Tenant shall pay interest on the overdue amount at the rate of eight per cent (8%) per annum calculated on a daily basis from the due date until full payment.'
    },
    {
      id: 'EARLY_EXIT_FULL_TERM', severity: 'high',
      title: 'Early exit: tenant must pay rent for the whole remaining term',
      bm: 'Keluar awal: bayar baki sewa penuh',
      test: function (t, ctx) {
        if (!/\b(terminat|determin|vacate|quit|leave|end)\w*/i.test(t)) return null;
        if (!/\b(before|prior\s+to|earlier\s+than)\s+(?:the\s+)?(?:expiry|expiration|end|completion)|\bearly\b|\bprematur/i.test(t)) return null;
        var m = first(t, [
          /\b(?:rent(?:al)?s?\s+for\s+the\s+)?(?:remaining|balance\s+of\s+the|unexpired|rest\s+of\s+the|entire|whole|full)\s+(?:term|tenancy|period|rental\s+period|duration|months)/i,
          /\ball\s+(?:the\s+)?(?:remaining|outstanding|future)\s+rent/i
        ]);
        if (!m) return null;
        if (/deposit[^.]{0,60}forfeit|forfeit[^.]{0,60}deposit/i.test(t)) ctx.detail = 'The clause also forfeits the deposit on top of the remaining rent (double recovery).';
        return m;
      },
      explain: 'Requiring the full remaining rent (often plus the deposit) when a tenant leaves early can over-compensate the landlord. Compensation must reflect real loss, and s.74 Contracts Act 1950 says the means of reducing the loss — such as re-letting the unit — must be taken into account. Market practice is a fixed notice period or forfeiting part of the deposit, ideally only after a minimum stay.',
      sources: ['CA_74', 'CA_75', 'CUBIC'],
      suggest: 'Either party may terminate this Agreement after the first twelve (12) months by giving two (2) months\u2019 prior written notice (or paying two months\u2019 rent in lieu). If the Tenant terminates earlier, the Tenant shall compensate the Landlord for rent lost until the Premises are re-let, capped at the amount of the Security Deposit, and the Landlord shall take reasonable steps to re-let the Premises.'
    },
    {
      id: 'EARLY_EXIT_DEPOSIT_FORFEIT', severity: 'medium',
      title: 'Early exit: deposit forfeited as "liquidated damages"',
      bm: 'Keluar awal: deposit dirampas',
      test: function (t) {
        if (!/\b(before|prior\s+to)\s+(?:the\s+)?(?:expiry|expiration|end)|\bearly\b|\bprematur/i.test(t)) return null;
        var m = /\bdeposit\b[^.]{0,80}\bforfeit|\bforfeit\w*\b[^.]{0,80}\bdeposit/i.exec(t);
        if (!m) return null;
        if (/\b(remaining|unexpired|balance\s+of\s+the|rest\s+of\s+the)\s+(term|tenancy|period)/i.test(t)) return null; // covered by EARLY_EXIT_FULL_TERM
        return m;
      },
      explain: 'Forfeiting the deposit on early termination is common in Malaysia, but it is still subject to s.75 Contracts Act 1950: only reasonable compensation is recoverable. A 2-month deposit forfeited after 11 of 12 months is harder to justify than after 2 months. Negotiate a sliding scale or a "diplomatic"/job-relocation clause.',
      sources: ['CA_75', 'CUBIC'],
      suggest: 'If the Tenant terminates before expiry, the Landlord may retain from the Security Deposit an amount equal to one (1) month\u2019s rent for every [six] months remaining in the term, not exceeding the Security Deposit, as reasonable compensation; the balance shall be refunded.'
    },
    {
      id: 'LANDLORD_TERMINATE_AT_WILL', severity: 'high',
      title: 'Landlord may terminate at any time / without cause',
      bm: 'Pemilik boleh tamatkan sesuka hati',
      test: function (t, ctx) {
        if (!LANDLORD.test(t)) return null;
        if (!/\b(terminat|determin|end|cancel)\w*/i.test(t)) return null;
        var m = first(t, [
          /\b(?:at\s+any\s+time|for\s+any\s+reason(?:\s+whatsoever)?|without\s+(?:assigning\s+)?(?:any\s+)?(?:reason|cause)|at\s+(?:its|his|her|the\s+landlord'?s)\s+(?:sole\s+|absolute\s+)?discretion)/i
        ]);
        if (!m) return null;
        // Not at-will if it is clearly conditioned on tenant breach.
        var before = t.slice(0, m.index + m[0].length + 60);
        if (/\b(breach|default|fail(?:s|ure)?\s+to|in\s+arrears|non-?payment)\b/i.test(before) && !/without\s+(?:any\s+)?(?:reason|cause)/i.test(t)) return null;
        // Mutual clauses ("either party") are less one-sided.
        if (/\beither\s+party\b|\bboth\s+parties\b/i.test(t)) { ctx.severity = 'low'; ctx.detail = 'Applies to both parties, so it is mutual — but it removes the security of a fixed term.'; }
        var shortNotice = /\b(\d+|one|two|three|seven|fourteen)\s*(?:\(\d+\)\s*)?days?'?\s*(?:prior\s+)?(?:written\s+)?notice/i.exec(t);
        if (shortNotice && !ctx.detail) ctx.detail = 'Notice period is only ' + shortNotice[0] + '.';
        return m;
      },
      explain: 'A fixed-term tenancy gives the tenant security of tenure. A one-sided right for the landlord to end it at any time (often on very short notice) while the tenant stays locked in removes that protection. Even if a termination is valid, the landlord must still recover possession through court if the tenant remains (Specific Relief Act 1950 s.7(2)).',
      sources: ['SRA_7', 'QUIET_ENJOYMENT'],
      suggest: 'The Landlord may terminate this Agreement before expiry only if the Tenant commits a material breach which remains unremedied fourteen (14) days after written notice, or by mutual written agreement. A termination on the sale of the Premises requires at least two (2) months\u2019 written notice.'
    },
    {
      id: 'UNILATERAL_RENT_INCREASE', severity: 'medium',
      title: 'Landlord can increase rent unilaterally during the term',
      bm: 'Kenaikan sewa sebelah pihak',
      test: function (t, ctx) {
        var m = /\b(increase|revise|raise|adjust|review|vary)\w*\s+(?:the\s+)?(?:monthly\s+)?(?:rent|rental)/i.exec(t);
        if (!m) return null;
        var unilateral = /(at\s+any\s+time|at\s+(?:its|his|her|the\s+landlord'?s)\s+(?:sole\s+|absolute\s+)?discretion|from\s+time\s+to\s+time|as\s+(?:it|he|she|the\s+landlord)\s+(?:deems|thinks|considers)\s+fit|without\s+(?:the\s+)?(?:prior\s+)?(?:notice|consent|agreement))/i.exec(t);
        if (!unilateral) return null;
        if (/mutual(?:ly)?\s+agree|not\s+exceed(?:ing)?\s+\d+\s*%|capped/i.test(t)) return null;
        if (/during\s+the\s+(?:term|tenancy)|at\s+any\s+time/i.test(t)) ctx.severity = 'high';
        return unilateral;
      },
      explain: 'Rent is a core term agreed for the fixed period. A clause letting the landlord raise it whenever it wishes makes the agreed rent meaningless. Increases are normally negotiated at renewal, often with a cap (e.g. not more than 10%).',
      sources: ['QUIET_ENJOYMENT', 'RTA_STATUS'],
      suggest: 'The rent is fixed for the term. Upon renewal, the rent shall be as mutually agreed, and any increase shall not exceed ten per cent (10%) of the prevailing rent.'
    },
    {
      id: 'AUTO_RENEWAL', severity: 'low',
      title: 'Automatic renewal / roll-over',
      bm: 'Pembaharuan automatik',
      test: function (t, ctx) {
        var m = /\b(?:automatically|deemed\s+to\s+(?:have\s+been\s+|be\s+)?)\s*(?:be\s+)?(?:renewed|extended|continue)|\bauto[- ]?renew/i.exec(t);
        if (!m) return null;
        if (/(increase|revise|raise)\w*\s+(?:the\s+)?(?:monthly\s+)?rent/i.test(t)) { ctx.severity = 'medium'; ctx.detail = 'Renewal is combined with a rent increase you did not agree to in advance.'; }
        return m;
      },
      explain: 'Auto-renewal is not unlawful, but it can lock a tenant into another full term (with its early-exit penalties) if they miss a notice deadline. Make sure the opt-out window and any renewal rent are written down.',
      sources: ['CA_74'],
      suggest: 'This Agreement may be renewed for a further term of one (1) year at the Tenant\u2019s option by written notice given at least two (2) months before expiry, at a rent to be mutually agreed (increase not exceeding 10%). If no renewal is agreed, the tenancy ends on the expiry date.'
    },
    {
      id: 'ALL_REPAIRS_ON_TENANT', severity: 'medium',
      title: 'Tenant bears structural or major repairs',
      bm: 'Semua pembaikan ditanggung penyewa',
      test: function (t) {
        if (!TENANT.test(t)) return null;
        if (!/\b(responsib|bear|pay|cost|expense|repair|replace|maintain)\w*/i.test(t)) return null;
        var m = first(t, [
          /\b(?:all|any\s+and\s+all|every)\s+(?:kinds?\s+of\s+)?(?:repairs?|maintenance|replacements?)\b[^.]{0,80}\b(?:including|whether|structural|major|minor\s+or\s+major)/i,
          /\b(structural|roof|foundation|waterproof\w*|main\s+(?:wiring|pipes?|piping)|concealed\s+(?:pipes?|wiring)|external\s+walls?)\b/i,
          /\breplace\w*\b[^.]{0,40}\b(air[- ]?con\w*|water\s+heaters?|refrigerators?|washing\s+machines?)\b[^.]{0,60}\b(?:any\s+cause|howsoever|whatever)/i,
          /\b(?:all|any)\s+(?:repairs?|maintenance)\s+(?:of|to)\s+the\s+(?:said\s+)?premises\b[^.]{0,80}\b(?:whatsoever|howsoever|regardless)/i
        ]);
        if (!m) return null;
        // If it is the landlord who carries the structural duty, it is fine.
        if (/\blandlord\s+shall\b[^.]{0,80}\b(structural|roof|major|main\s+wiring|external)/i.test(t)) return null;
        if (!/\btenant\s+(?:shall|must|will|agrees?)\b[^.]{0,200}/i.test(t)) return null;
        return m;
      },
      explain: 'There is no statute allocating repairs, so the agreement decides — but standard Malaysian practice puts structural and major items (roof, waterproofing, main wiring/piping, ageing appliances supplied by the landlord) on the landlord, and minor repairs (often under ~RM200) plus damage the tenant causes on the tenant. Fair wear and tear is not tenant damage.',
      sources: ['REPAIRS_PRACTICE'],
      suggest: 'The Landlord shall be responsible for structural repairs, roof and waterproofing, main wiring and piping, and repair or replacement of the Landlord\u2019s appliances failing through normal use. The Tenant shall be responsible for minor repairs not exceeding RM200 per item and for damage caused by the Tenant\u2019s negligence, fair wear and tear excepted.'
    },
    {
      id: 'NO_WEAR_AND_TEAR', severity: 'medium',
      title: 'Hand-back in "original/new condition" with no fair-wear-and-tear exception',
      bm: 'Tiada pengecualian haus & lusuh biasa',
      test: function (t) {
        var m = first(t, [
          /\b(?:original|brand[- ]new|new|same|identical|pristine)\s+(?:and\s+\w+\s+)?condition\b/i,
          /\bas\s+(?:it\s+was\s+)?at\s+the\s+(?:date\s+of\s+)?commencement\b/i,
          /\brepaint\w*\b[^.]{0,60}\b(?:entire|whole|all)\b/i,
          /\b(?:entire|whole)\s+(?:premises|unit|house)\b[^.]{0,40}\brepaint/i
        ]);
        if (!m) return null;
        if (/wear\s+and\s+tear/i.test(t)) return null;
        return m;
      },
      explain: 'Normal deterioration from everyday use (faded paint, minor scuffs, worn fittings) is "fair wear and tear" and is not damage the tenant should pay for. Without that exception, the clause can be used to deduct repainting or replacement costs from the deposit for ordinary ageing.',
      sources: ['REPAIRS_PRACTICE', 'CA_74'],
      suggest: 'Upon expiry, the Tenant shall deliver up the Premises in the same good and tenantable condition as at the commencement date (as recorded in the signed inventory and photographs), fair wear and tear excepted.'
    },
    {
      id: 'RESTRICT_LEGAL_ACTION', severity: 'high',
      title: 'Tenant waives the right to sue / time-limit on claims',
      bm: 'Hak penyewa untuk saman dihadkan',
      test: function (t) {
        if (!TENANT.test(t)) return null;
        return first(t, [
          /\b(?:tenant\s+)?(?:hereby\s+)?(?:waives?|forgoes?|relinquish\w*|gives?\s+up)\b[^.]{0,80}\b(?:right|rights)\b[^.]{0,60}\b(?:sue|court|legal|claim|action|proceedings)/i,
          /\btenant\s+(?:shall|will|may)\s+not\b[^.]{0,40}\b(?:sue|commence|institute|bring|file|take)\b[^.]{0,40}\b(?:action|proceedings|claim|suit|court)/i,
          /\b(?:any\s+)?claims?\b[^.]{0,40}\b(?:must|shall)\s+be\s+(?:made|brought|filed|commenced)\s+within\s+(?:\w+\s+)?\(?\d*\)?\s*(?:days|weeks)/i,
          /\b(?:decision|determination)\s+of\s+the\s+landlord\b[^.]{0,60}\b(?:final|conclusive)\b[^.]{0,40}\b(?:not\s+be\s+(?:questioned|challenged)|court)/i
        ]);
      },
      explain: 'Section 29 Contracts Act 1950 makes void any agreement that absolutely restricts a party from enforcing their rights in the ordinary courts, or that shortens the time to do so. A tenant can still go to the Magistrates\u2019 Court (small claims up to RM5,000 without a lawyer) whatever the agreement says. Arbitration clauses are a separate, lawful exception.',
      sources: ['CA_29', 'SMALL_CLAIMS'],
      suggest: 'Nothing in this Agreement shall restrict either party from enforcing its rights by legal proceedings in a court of competent jurisdiction within the time permitted by law.'
    },
    {
      id: 'ONE_SIDED_LEGAL_COSTS', severity: 'low',
      title: 'Tenant pays all of the landlord\u2019s legal costs',
      bm: 'Kos guaman sebelah pihak',
      test: function (t) {
        if (!TENANT.test(t)) return null;
        var m = /\b(?:all|any)\s+(?:legal\s+)?(?:costs?|fees?|expenses?)\b[^.]{0,80}\b(?:solicitors?|lawyers?|legal)\b[^.]{0,120}\b(?:solicitor[- ]and[- ]client|full\s+indemnity|whether\s+or\s+not|in\s+any\s+event|regardless|howsoever)/i.exec(t);
        return m;
      },
      explain: 'It is normal for the tenant to pay stamp duty, and for each party to bear its own solicitor\u2019s fees. A clause making the tenant pay all of the landlord\u2019s legal costs "in any event" or on a full-indemnity basis shifts risk heavily onto the tenant and can deter legitimate claims.',
      sources: ['CA_75', 'STAMP_52'],
      suggest: 'Each party shall bear its own solicitors\u2019 costs. The stamp duty on this Agreement shall be borne by the Tenant. In any dispute, costs shall follow the event as determined by the court.'
    },
    {
      id: 'PRIOR_ARREARS_ON_TENANT', severity: 'medium',
      title: 'Tenant liable for bills or charges from before the tenancy',
      bm: 'Penyewa tanggung tunggakan lama',
      test: function (t) {
        if (!TENANT.test(t)) return null;
        var m = /\b(?:outstanding|arrears?|previous|prior|existing)\b[^.]{0,60}\b(?:bills?|charges|utilit\w*|electricity|water|TNB|indah\s+water|maintenance\s+(?:fees?|charges)|service\s+charges?|assessment|quit\s+rent|cukai)\b/i.exec(t);
        if (!m) return null;
        if (!/\b(?:before|prior\s+to)\s+(?:the\s+)?(?:commencement|tenancy|occupation|handover|move)|previous\s+(?:tenant|occupant|owner)/i.test(t)) return null;
        if (/\blandlord\s+shall\b[^.]{0,60}\b(?:settle|pay|bear)/i.test(t)) return null;
        return m;
      },
      explain: 'Bills that arose before the tenant moved in belong to the landlord or the previous occupant. Utility accounts should be read on handover day so each party pays only for its own period.',
      sources: ['CA_74', 'DEPOSIT_PRACTICE'],
      suggest: 'Meter readings shall be recorded on the handover date. The Landlord shall settle all charges and arrears accrued before the commencement date; the Tenant shall pay utility charges accrued during the tenancy.'
    },
    {
      id: 'OWNER_OUTGOINGS_ON_TENANT', severity: 'low',
      title: 'Tenant pays the owner\u2019s outgoings (quit rent, assessment, maintenance fees)',
      bm: 'Penyewa bayar cukai/caj pemilik',
      test: function (t) {
        if (!TENANT.test(t)) return null;
        var m = /\b(quit\s+rent|cukai\s+tanah|assessment|cukai\s+(?:pintu|taksiran)|maintenance\s+(?:fees?|charges)|service\s+charges?|sinking\s+fund|fire\s+insurance)\b/i.exec(t);
        if (!m) return null;
        if (!/\btenant\s+(?:shall|must|will|agrees?\s+to)\s+(?:pay|bear|settle)|\b(?:borne|paid)\s+by\s+the\s+tenant/i.test(t)) return null;
        if (/\blandlord\s+shall\s+(?:pay|bear|settle)\b[^.]{0,40}\b(quit\s+rent|assessment|maintenance|service)/i.test(t)) return null;
        return m;
      },
      explain: 'Quit rent, assessment, strata maintenance/service charges, sinking fund and building insurance are ordinarily the owner\u2019s costs and are priced into the rent. Paying them on top of rent is unusual; if agreed, it should be reflected in a lower rent.',
      sources: ['REPAIRS_PRACTICE'],
      suggest: 'The Landlord shall pay all quit rent, assessment, maintenance and service charges, sinking fund contributions and building insurance premiums for the Premises.'
    },
    {
      id: 'UNILATERAL_AMENDMENT', severity: 'high',
      title: 'Landlord can change the terms or house rules at will',
      bm: 'Terma boleh diubah sebelah pihak',
      test: function (t, ctx) {
        if (!LANDLORD.test(t)) return null;
        var m = /\b(amend|vary|change|modify|alter|add\s+to|impose)\w*\b[^.]{0,40}\b(?:terms?|conditions?|rules?|house\s+rules|regulations|this\s+agreement)\b[^.]{0,80}\b(?:at\s+any\s+time|from\s+time\s+to\s+time|sole\s+(?:and\s+absolute\s+)?discretion|without\s+(?:the\s+tenant'?s\s+)?(?:prior\s+)?(?:notice|consent))/i.exec(t);
        if (!m) return null;
        if (/mutual(?:ly)?\s+agree|in\s+writing\s+signed\s+by\s+both/i.test(t)) return null;
        // Only house rules (not the agreement's terms) -> less severe.
        if (!/\b(terms?|conditions?|this\s+agreement)\b/i.test(m[0])) { ctx.severity = 'medium'; ctx.detail = 'Applies to house rules; still one-sided if rules can add fees or restrictions without notice.'; }
        return m;
      },
      explain: 'A contract requires agreement of both parties; a term allowing one side to rewrite obligations at will undermines the whole bargain and is likely to be read narrowly by a court. Changes should be in writing and signed by both parties (and the agreed version re-fingerprinted).',
      sources: ['CA_74', 'QUIET_ENJOYMENT'],
      suggest: 'No variation of this Agreement shall be effective unless made in writing and signed by both parties. Building management rules apply as issued by the management body.'
    },
    {
      id: 'PERSONAL_DATA_EXPOSURE', severity: 'medium',
      title: 'Landlord may publish / share tenant\u2019s personal data',
      bm: 'Pendedahan data peribadi penyewa',
      test: function (t) {
        var m = /\b(publish|disclose|share|post|circulate|blacklist|upload|report)\w*\b[^.]{0,80}\b(?:personal\s+(?:data|details|information|particulars)|identity\s+card|\bIC\b|NRIC|photograph|name\s+and\s+(?:IC|photo|address))/i.exec(t);
        if (!m) return null;
        if (!/\b(public|social\s+media|facebook|whatsapp\s+group|internet|online|third\s+part(?:y|ies)|blacklist|any\s+person|ctos|credit\s+report)/i.test(t)) return null;
        return m;
      },
      explain: 'Publicly naming a tenant, posting their IC or photo online, or sharing details with unrelated third parties goes beyond the purpose the data was collected for and risks breaching the Personal Data Protection Act 2010 (and defamation law). Debt recovery should go through lawful channels.',
      sources: ['PDPA'],
      suggest: 'The Landlord shall use the Tenant\u2019s personal data only for administering this tenancy and shall not disclose it to any third party except as required by law or with the Tenant\u2019s written consent.'
    },
    {
      id: 'HOLDING_OVER_EXCESSIVE', severity: 'medium',
      title: 'Holding-over charge above the statutory double rent',
      bm: 'Caj lewat keluar melebihi sewa berganda',
      test: function (t, ctx) {
        if (!/\b(hold(?:s|ing)?\s+over|remain\w*\s+in\s+(?:occupation|possession)|fail\w*\s+to\s+(?:vacate|deliver|yield)|overstay)/i.test(t)) return null;
        var m = /\b(triple|treble|three\s+times|(?:[3-9]|\d{2,})\s*(?:times|x))\b[^.]{0,40}\b(?:rent|rental)/i.exec(t);
        if (m) return m;
        var daily = /RM\s?([\d,]+(?:\.\d{1,2})?)\s*(?:per|for\s+each|every|a)\s+day/i.exec(t);
        if (daily && ctx.facts && ctx.facts.monthlyRent && money(daily[1]) * 30 > 2 * ctx.facts.monthlyRent) {
          ctx.detail = 'RM' + daily[1] + '/day \u2248 RM' + Math.round(money(daily[1]) * 30) + '/month vs. double rent of RM' + Math.round(2 * ctx.facts.monthlyRent) + '.';
          return daily;
        }
        return null;
      },
      explain: 'Civil Law Act 1956 s.28(4)(a) already lets a landlord charge double rent to a tenant who holds over after the tenancy ends. Charges above that (triple rent, large daily fines) go beyond the statutory measure and are exposed to the s.75 Contracts Act penalty rule.',
      sources: ['CLA_28_4', 'CA_75'],
      suggest: 'If the Tenant remains in occupation after expiry or lawful termination without the Landlord\u2019s consent, the Tenant shall pay double the monthly rent for the period of holding over, pursuant to section 28(4)(a) of the Civil Law Act 1956.'
    },
    {
      id: 'BROAD_EXCLUSION_OF_LIABILITY', severity: 'medium',
      title: 'Landlord excluded from liability even for its own negligence',
      bm: 'Pemilik dikecualikan walaupun cuai',
      test: function (t) {
        var m = /\b(?:not\s+(?:be\s+)?(?:liable|responsible)|indemnif\w*|hold\s+harmless)\b[^.]{0,120}\b(?:howsoever|whatsoever|however)\s+(?:caused|arising)\b[^.]{0,80}\b(?:including|even\s+if|notwithstanding)\b[^.]{0,40}\b(?:negligen\w*|default)/i.exec(t) ||
          /\b(?:including|even\s+if|notwithstanding)\b[^.]{0,40}\b(?:the\s+)?landlord'?s?\s+(?:own\s+)?(?:negligen\w*|default|breach)/i.exec(t);
        if (!m) return null;
        if (!LANDLORD.test(t)) return null;
        return m;
      },
      explain: 'Making the tenant bear losses caused by the landlord\u2019s own negligence (e.g. a known leaking pipe or faulty wiring) is heavily one-sided. Courts read such exclusion clauses strictly, but it is better to negotiate them out.',
      sources: ['CA_74', 'REPAIRS_PRACTICE'],
      suggest: 'Neither party shall be liable for loss caused solely by the other party\u2019s negligence or breach. The Tenant shall indemnify the Landlord only for loss caused by the Tenant\u2019s (or its invitees\u2019) negligence or breach.'
    }
  ];

  var POSITIVE_RULES = [
    { id: 'GOOD_WEAR_TEAR', title: 'Fair wear and tear is excepted', bm: 'Haus & lusuh biasa dikecualikan', re: /\b(?:fair|normal|reasonable)\s+wear\s+and\s+tear\s+(?:excepted|excluded)|\b(?:excepting|except\s+for|save\s+for)\s+(?:fair|normal)\s+wear\s+and\s+tear/i },
    { id: 'GOOD_ENTRY_NOTICE', title: 'Entry requires prior notice', bm: 'Masuk dengan notis', re: /\b(\d+|twenty[- ]four|forty[- ]eight|seventy[- ]two)\s*(?:\(\d+\)\s*)?hours?'?\s*(?:prior\s+|advance\s+)?(?:written\s+)?notice/i },
    { id: 'GOOD_REFUND_DEADLINE', title: 'Deposit refund deadline stated', bm: 'Tempoh pemulangan deposit dinyatakan', re: /\bdeposit[^.]{0,160}\b(?:refund|return|repa)\w*[^.]{0,80}\bwithin\s+(?:\w+(?:[- ]\w+)?\s+)?\(?\d+\)?\s*(?:working\s+|business\s+|calendar\s+)?days|\b(?:refund|return|repa)\w*[^.]{0,80}\bdeposit[^.]{0,120}\bwithin\s+(?:\w+(?:[- ]\w+)?\s+)?\(?\d+\)?\s*(?:working\s+|business\s+|calendar\s+)?days/i },
    { id: 'GOOD_STAMPING', title: 'Stamping of the agreement is addressed', bm: 'Duti setem dinyatakan', re: /\bstamp(?:ing|ed)?\s+(?:duty|fees?)|\bduly\s+stamped|\be-?duti\s+setem/i },
    { id: 'GOOD_INVENTORY', title: 'Inventory / condition record at handover', bm: 'Inventori & rekod keadaan', re: /\binventory|\bschedule\s+of\s+(?:fixtures|furniture|contents)|\bcondition\s+report|\bphotograph\w*\b[^.]{0,40}\b(?:handover|commencement|move[- ]in)/i },
    { id: 'GOOD_COURT_PROCESS', title: 'Recovery of possession via court is acknowledged', bm: 'Proses mahkamah diiktiraf', re: /\bsection\s+7\s*\(2\)\s+of\s+the\s+specific\s+relief\s+act|\bproceedings\s+in\s+(?:the\s+)?court\b/i },
    { id: 'GOOD_DIPLOMATIC', title: 'Fair early-termination route (notice / relocation clause)', bm: 'Klausa penamatan awal yang adil', re: /\bdiplomatic\s+clause|\b(?:either\s+party|the\s+tenant)\s+may\s+terminate\b[^.]{0,120}\b(?:\w+\s+)?\(?\d+\)?\s*months?'?\s*(?:prior\s+)?(?:written\s+)?notice/i }
  ];

  // ------------------------------------------------ document-level checks
  function documentChecks(text, clauses, facts) {
    var out = [];
    var lowAll = text.toLowerCase();

    // Deposit size vs market practice
    if (facts.securityMonths != null && facts.securityMonths > 2.05) {
      out.push({
        ruleId: 'DEPOSIT_ABOVE_MARKET', severity: facts.securityMonths > 3.05 ? 'high' : 'medium',
        title: 'Security deposit above the usual 2 months',
        bm: 'Deposit sekuriti melebihi kebiasaan',
        detail: 'Security deposit \u2248 ' + facts.securityMonths + ' months\u2019 rent' + (facts.monthlyRent ? ' (rent RM' + facts.monthlyRent + ')' : '') + '.',
        explain: 'There is no statutory cap in force, but the Malaysian market norm is 2 months\u2019 security deposit plus about half a month for utilities. The draft Residential Tenancy Act reportedly proposes a 2 + 1 cap — it is not law yet, but it signals what policymakers consider fair.',
        sources: ['DEPOSIT_PRACTICE', 'RTA_STATUS'],
        suggest: 'Security Deposit: two (2) months\u2019 rent. Utility Deposit: half (0.5) a month\u2019s rent.'
      });
    }
    if (facts.utilityMonths != null && facts.utilityMonths > 1.05) {
      out.push({
        ruleId: 'UTILITY_DEPOSIT_ABOVE_MARKET', severity: 'medium',
        title: 'Utility deposit above 1 month',
        bm: 'Deposit utiliti berlebihan',
        detail: 'Utility deposit \u2248 ' + facts.utilityMonths + ' months\u2019 rent.',
        explain: 'Utility deposits usually cover about half to one month of rent — enough to cover a final unpaid bill. More than that is unusual.',
        sources: ['DEPOSIT_PRACTICE', 'RTA_STATUS'],
        suggest: 'Utility Deposit: half (0.5) a month\u2019s rent, refundable after final bills are settled.'
      });
    }

    // Deposit refund timeline
    var depClauses = clauses.filter(function (c) { return /deposit/i.test(c.text) && /\b(refund|return|repa)\w*/i.test(c.text); });
    if (/deposit/.test(lowAll)) {
      var dayMatch = null;
      depClauses.forEach(function (c) {
        var m = /within\s+(?:[a-z-]+\s+)?\(?(\d+)\)?\s*(?:working\s+|business\s+|calendar\s+)?days/i.exec(c.text) ||
          /within\s+([a-z-]+)\s+(?:working\s+|business\s+|calendar\s+)?days/i.exec(c.text);
        if (m && !dayMatch) dayMatch = { days: numWord(m[1]), clause: c, m: m };
      });
      if (!dayMatch) {
        out.push({
          ruleId: 'NO_REFUND_DEADLINE', severity: 'medium',
          title: 'No deadline for refunding the deposit',
          bm: 'Tiada tempoh pemulangan deposit',
          explain: 'Without a stated refund period, the landlord can hold the deposit indefinitely and the tenant\u2019s only recourse is a court claim. A 14\u201330 day refund period with an itemised statement of deductions is common practice.',
          sources: ['DEPOSIT_PRACTICE', 'SMALL_CLAIMS'],
          suggest: 'The deposits shall be refunded within fourteen (14) days after vacant possession is delivered, together with an itemised statement and receipts for any deduction.'
        });
      } else {
        facts.refundDays = dayMatch.days;
        if (dayMatch.days && dayMatch.days > 45) {
          out.push({
            ruleId: 'LONG_REFUND_DEADLINE', severity: 'low',
            title: 'Long deposit refund period (' + dayMatch.days + ' days)',
            bm: 'Tempoh pemulangan deposit terlalu lama',
            clause: dayMatch.clause,
            excerpt: excerptAround(dayMatch.clause.text, dayMatch.m),
            explain: '14\u201330 days is the common market range. A longer period ties up the tenant\u2019s money with no added protection for the landlord.',
            sources: ['DEPOSIT_PRACTICE'],
            suggest: 'Refund within fourteen (14) to thirty (30) days after vacant possession.'
          });
        }
      }
    }

    if (!/\bstamp/.test(lowAll)) {
      out.push({
        ruleId: 'NO_STAMPING', severity: 'low',
        title: 'Agreement does not mention stamping',
        bm: 'Tiada rujukan duti setem',
        explain: 'Tenancy agreements must be stamped within 30 days of signing (now via e-Duti Setem on MyTax). An unstamped agreement is not void, but it cannot be used as evidence in court until duty and a late penalty are paid (Stamp Act 1949 s.52). Since 1 Jan 2025 duty is RM1 per RM250 of annual rent for terms up to 1 year, RM3 for 1\u20133 years (minimum RM10).',
        sources: ['STAMP_52', 'STAMP_RATES'],
        suggest: 'The Tenant shall bear the stamp duty on this Agreement, and the Landlord shall ensure it is stamped within thirty (30) days of execution; each party shall receive a stamped copy.'
      });
    }
    if (!/\binventory|schedule\s+of\s+(fixtures|furniture|contents)|condition\s+report|photograph/.test(lowAll)) {
      out.push({
        ruleId: 'NO_INVENTORY', severity: 'low',
        title: 'No inventory or move-in condition record',
        bm: 'Tiada senarai inventori',
        explain: 'Most deposit disputes are about the condition of the unit. A signed inventory with dated photos at handover is the best evidence for both sides.',
        sources: ['SMALL_CLAIMS', 'REPAIRS_PRACTICE'],
        suggest: 'An inventory of fixtures and furniture, with dated photographs of the Premises, shall be signed by both parties on the handover date and form a schedule to this Agreement.'
      });
    }
    return out;
  }

  // ------------------------------------------------------------- analysis
  function analyze(rawText) {
    var text = norm(rawText);
    var clauses = splitClauses(text);
    var facts = extractFacts(clauses);
    var findings = [];
    var positives = [];
    var seen = {};

    clauses.forEach(function (c) {
      CLAUSE_RULES.forEach(function (r) {
        var ctx = { facts: facts, severity: null, detail: null };
        var m = r.test(c.text, ctx);
        if (!m) return;
        findings.push({
          ruleId: r.id,
          severity: ctx.severity || r.severity,
          title: r.title,
          bm: r.bm,
          clause: { idx: c.idx, num: c.num, heading: c.heading },
          excerpt: excerptAround(c.text, m),
          match: m[0],
          detail: ctx.detail,
          explain: r.explain,
          suggest: r.suggest,
          sources: r.sources
        });
      });
      POSITIVE_RULES.forEach(function (p) {
        if (seen[p.id]) return;
        var m = p.re.exec(c.text);
        if (m) {
          seen[p.id] = true;
          positives.push({ ruleId: p.id, title: p.title, bm: p.bm, clause: { idx: c.idx, num: c.num, heading: c.heading }, excerpt: excerptAround(c.text, m, 80) });
        }
      });
    });

    documentChecks(text, clauses, facts).forEach(function (d) {
      findings.push({
        ruleId: d.ruleId, severity: d.severity, title: d.title, bm: d.bm,
        clause: d.clause ? { idx: d.clause.idx, num: d.clause.num, heading: d.clause.heading } : null,
        excerpt: d.excerpt || null, detail: d.detail || null,
        explain: d.explain, suggest: d.suggest, sources: d.sources, documentLevel: !d.clause
      });
    });

    // Avoid double-flagging the same clause for overlapping early-exit / deposit rules.
    findings = findings.filter(function (f) {
      if (f.ruleId === 'DEPOSIT_FULL_FORFEITURE' && f.clause) {
        return !findings.some(function (g) {
          return (g.ruleId === 'EARLY_EXIT_FULL_TERM' || g.ruleId === 'EARLY_EXIT_DEPOSIT_FORFEIT') && g.clause && g.clause.idx === f.clause.idx;
        });
      }
      return true;
    });

    findings.sort(function (a, b) {
      return (SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]) ||
        ((a.clause ? a.clause.idx : 1e9) - (b.clause ? b.clause.idx : 1e9));
    });

    var counts = { high: 0, medium: 0, low: 0, info: 0 };
    var penalty = 0;
    findings.forEach(function (f) { counts[f.severity]++; penalty += SEVERITY_WEIGHT[f.severity]; });
    var score = Math.max(0, 100 - penalty);
    var grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D';
    var verdict = {
      A: 'Looks balanced — still read every clause.',
      B: 'Mostly fair, a few points to negotiate.',
      C: 'Several one-sided terms — negotiate before signing.',
      D: 'High risk — get advice before signing.'
    }[grade];

    return {
      version: '1.0.0',
      clauses: clauses,
      facts: facts,
      findings: findings,
      positives: positives,
      counts: counts,
      score: score,
      grade: grade,
      verdict: verdict
    };
  }

  return {
    analyze: analyze,
    splitClauses: splitClauses,
    extractFacts: extractFacts,
    normalizeQuotes: norm,
    RULES: CLAUSE_RULES.map(function (r) { return { id: r.id, severity: r.severity, title: r.title, bm: r.bm, sources: r.sources }; }),
    POSITIVE_RULES: POSITIVE_RULES.map(function (p) { return { id: p.id, title: p.title, bm: p.bm }; })
  };
});
