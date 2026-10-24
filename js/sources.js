/*
 * SewaCheck — legal & practice sources referenced by the rule engine.
 * Every rule cites one or more of these IDs. Statutes link to the official
 * Laws of Malaysia Online (AGC) PDF or to a section-level reader of the
 * official text (mylaw.my). "Practice" sources describe common market
 * practice and are labelled as such — they are NOT law.
 * UMD: works as a <script> (window.SewaSources) and in Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SewaSources = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var SOURCES = {
    SRA_7: {
      kind: 'statute',
      cite: 'Specific Relief Act 1950 (Act 137), s.7(2)',
      note: 'After a tenancy ends, a landlord may recover possession from a lawful occupier only by court proceedings — no self-help eviction.',
      url: 'https://mylaw.my/legislation/specific-relief-act-1950/section-7',
      official: 'https://lom.agc.gov.my/ilims/upload/portal/akta/LOM/EN/Act%20137.pdf'
    },
    DISTRESS_4_5: {
      kind: 'statute',
      cite: 'Distress Act 1951 (Act 255), ss.4–5',
      note: 's.4: no landlord shall distrain for rent except as provided by the Act. s.5: landlord applies to a Judge/Registrar for a warrant of distress (max. 12 completed months of arrears).',
      url: 'https://mylaw.my/legislation/distress-act-1951/section-5',
      official: 'https://lom.agc.gov.my/ilims/upload/portal/akta/LOM/EN/Act%20255.pdf'
    },
    CA_29: {
      kind: 'statute',
      cite: 'Contracts Act 1950 (Act 136), s.29',
      note: 'An agreement that absolutely restricts a party from enforcing contract rights in the ordinary courts, or limits the time to do so, is void to that extent (arbitration agreements excepted).',
      url: 'https://mylaw.my/legislation/contracts-act-1950/section-29',
      official: 'https://lom.agc.gov.my/ilims/upload/portal/akta/LOM/EN/Act%20136.pdf'
    },
    CA_74: {
      kind: 'statute',
      cite: 'Contracts Act 1950 (Act 136), s.74 (incl. Explanation)',
      note: 'Compensation covers loss that naturally arises from the breach; "the means which existed of remedying the inconvenience" (e.g. re-letting) must be taken into account.',
      url: 'https://mylaw.my/legislation/contracts-act-1950/section-74',
      official: 'https://lom.agc.gov.my/ilims/upload/portal/akta/LOM/EN/Act%20136.pdf'
    },
    CA_75: {
      kind: 'statute',
      cite: 'Contracts Act 1950 (Act 136), s.75',
      note: 'Where a contract names a sum or penalty for breach, the innocent party gets only "reasonable compensation not exceeding" that sum.',
      url: 'https://mylaw.my/legislation/contracts-act-1950/section-75',
      official: 'https://lom.agc.gov.my/ilims/upload/portal/akta/LOM/EN/Act%20136.pdf'
    },
    CUBIC: {
      kind: 'case',
      cite: 'Cubic Electronics Sdn Bhd v Mars Telecommunications Sdn Bhd [2019] 6 MLJ 15 (Federal Court)',
      note: 'Forfeiture of a deposit is subject to s.75; the court awards reasonable compensation (assessed by legitimate interest / proportionality). Actual loss need not always be proven, but the defaulting party may show the sum is unreasonable.',
      url: 'https://www.zulrafique.com.my/ckfinder/userfiles/files/case%20update%20judgment/Cubic%20Electronics%20Sdn%20Bhd%20(in%20liquidation)%20v%20Mars%20Telecommunications%20Sdn%20Bhd%20Appeal%20No%2002(f)%20-%2064%20-%2009%202016%20(W).pdf'
    },
    CLA_28_4: {
      kind: 'statute',
      cite: 'Civil Law Act 1956 (Act 67), s.28(4)(a)',
      note: 'A tenant holding over after the tenancy ends is chargeable, at the landlord\u2019s option, with double rent (or double value) until possession is given up.',
      url: 'https://mylaw.my/legislation/civil-law-act-1956/section-28'
    },
    STAMP_52: {
      kind: 'statute',
      cite: 'Stamp Act 1949 (Act 378), s.52 & First Schedule Item 49 (as amended by Finance Act 2024)',
      note: 'An unstamped tenancy agreement is not void, but is inadmissible in evidence until duty and penalty are paid. Stamp within 30 days of signing. Since 1 Jan 2025 duty is RM1/RM3/RM5/RM7 per RM250 of annual rent (by term length), minimum RM10.',
      url: 'https://mylaw.my/legislation/stamp-act-1949/section-52',
      official: 'https://www.hasil.gov.my/en/duti-setem/penalti-duti-setem/'
    },
    STAMP_RATES: {
      kind: 'commentary',
      cite: 'Rahmat Lim & Partners, "Stamp Act 1949 amendments gazetted" (Mar 2025)',
      note: 'Summary of the Finance Act 2024 lease rates: \u22641 yr RM1, 1\u20133 yrs RM3, 3\u20135 yrs RM5, >5 yrs RM7 per RM250 of annual rent.',
      url: 'https://www.rahmatlim.com/publication/articles/30244/stamp-act-1949-amendments-gazetted-laying-groundwork-for-self-assessment-regime'
    },
    RTA_STATUS: {
      kind: 'news',
      cite: 'Residential Tenancy Act (RTA) — still a draft Bill, not tabled (as of Oct 2026)',
      note: 'KPKT says the Bill is being finalised; it has not been tabled, passed or gazetted. Tenancies remain governed by the agreement + general law. Any "2 + 1 deposit cap" is a proposal only.',
      url: 'https://speedhome.com/blog/rta-2026',
      also: [
        'https://www.freemalaysiatoday.com/category/nation/2026/08/12/don-t-delay-tabling-residential-tenancy-bill-to-2027-ngo-tells-govt',
        'https://www.thestar.com.my/news/nation/2026/08/04/residential-tenancy-bill-being-finalised-to-balance-rights-of-tenants-landlords'
      ]
    },
    QUIET_ENJOYMENT: {
      kind: 'practice',
      cite: 'Covenant for quiet enjoyment (common law / contract) — no specific statute',
      note: 'Landlord should not enter except in emergencies or with proper notice; 24\u201348 hours\u2019 written notice is common practice.',
      url: 'https://speedhome.com/blog/rta-2026',
      also: ['https://propcashflow.my/blog/rental-agreement-template-malaysia']
    },
    DEPOSIT_PRACTICE: {
      kind: 'practice',
      cite: 'Market practice: 2 months\u2019 security + ~0.5 month utility deposit (no statutory cap in force)',
      note: 'No statutory cap on residential deposits exists today. The draft RTA reportedly proposes 2 + 1; not law. Deductions should reflect proven, actual loss.',
      url: 'https://speedhome.com/blog/rta-2026'
    },
    REPAIRS_PRACTICE: {
      kind: 'practice',
      cite: 'Market practice on repairs: landlord = structural/major; tenant = minor & negligence',
      note: 'Typical split: landlord handles structure, roof, waterproofing, main wiring/piping and major fixtures; tenant handles minor repairs (often a threshold such as RM200) and damage they cause. Fair wear and tear is not tenant damage.',
      url: 'https://propcashflow.my/blog/rental-agreement-template-malaysia',
      also: ['https://ihome.my/guides/tenancy-agreement-malaysia/']
    },
    PDPA: {
      kind: 'statute',
      cite: 'Personal Data Protection Act 2010 (Act 709) — general principles',
      note: 'Publishing or sharing a tenant\u2019s personal data beyond the purpose it was collected for, without consent, risks breaching the PDPA (and defamation law).',
      url: 'https://speedhome.com/blog/rta-2026'
    },
    SMALL_CLAIMS: {
      kind: 'practice',
      cite: 'Magistrates\u2019 Court small-claims procedure (Rules of Court 2012, Order 93) — claims up to RM5,000, no lawyer needed',
      note: 'The usual route for a deposit dispute; there is no tenancy tribunal while the RTA is not in force.',
      url: 'https://speedhome.com/blog/tenancy-tribunal-malaysia'
    }
  };
  return { SOURCES: SOURCES };
});
