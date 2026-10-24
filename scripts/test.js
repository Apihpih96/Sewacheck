#!/usr/bin/env node
// Rule-engine + fingerprint tests. Run: node scripts/test.js  (Node 18+, no dependencies)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const Rules = require(path.join(root, 'js', 'rules.js'));
const FP = require(path.join(root, 'js', 'fingerprint.js'));
const { SOURCES } = require(path.join(root, 'js', 'sources.js'));
const read = (f) => fs.readFileSync(path.join(root, 'samples', f), 'utf8');
const ids = (r) => new Set(r.findings.map((f) => f.ruleId));

test('unfair sample: flags the key red flags', () => {
  const r = Rules.analyze(read('sample-1-unfair-condo-cheras.txt'));
  const got = ids(r);
  for (const id of [
    'SELF_HELP_EVICTION', 'SEIZE_GOODS_WITHOUT_WARRANT', 'ENTRY_WITHOUT_NOTICE', 'DEPOSIT_FULL_FORFEITURE',
    'NON_REFUNDABLE_DEPOSIT', 'EXCESSIVE_LATE_CHARGE', 'EARLY_EXIT_FULL_TERM', 'LANDLORD_TERMINATE_AT_WILL',
    'UNILATERAL_RENT_INCREASE', 'ALL_REPAIRS_ON_TENANT', 'NO_WEAR_AND_TEAR', 'RESTRICT_LEGAL_ACTION',
    'PERSONAL_DATA_EXPOSURE', 'HOLDING_OVER_EXCESSIVE', 'DEPOSIT_ABOVE_MARKET', 'NO_REFUND_DEADLINE', 'NO_STAMPING'
  ]) assert.ok(got.has(id), 'expected ' + id);
  assert.equal(r.grade, 'D');
  assert.ok(r.counts.high >= 8);
  assert.equal(r.facts.monthlyRent, 1800);
  assert.equal(r.facts.securityMonths, 3);
  assert.equal(r.facts.termMonths, 24);
  const self = r.findings.find((f) => f.ruleId === 'SELF_HELP_EVICTION');
  assert.equal(self.clause.num, '12');
  assert.ok(self.sources.includes('SRA_7'));
});

test('balanced sample: no flags, many good signs', () => {
  const r = Rules.analyze(read('sample-2-balanced-apartment-pj.txt'));
  assert.deepEqual(r.findings.map((f) => f.ruleId), []);
  assert.equal(r.score, 100);
  assert.ok(r.positives.length >= 5);
  assert.equal(r.facts.securityMonths, 2);
  assert.equal(r.facts.refundDays, 14);
});

test('room rental without numbering: paragraph split + mixed flags', () => {
  const r = Rules.analyze(read('sample-3-room-rental-subang.txt'));
  assert.ok(r.clauses.length >= 8);
  const got = ids(r);
  assert.ok(got.has('ENTRY_WITHOUT_NOTICE'));
  assert.ok(got.has('EARLY_EXIT_DEPOSIT_FORFEIT'));
  assert.ok(got.has('UNILATERAL_AMENDMENT'));
  assert.ok(!got.has('EXCESSIVE_LATE_CHARGE'), '10% p.a. should not be flagged');
  assert.ok(!got.has('NO_STAMPING'));
});

test('targeted rule behaviour', () => {
  const a = (t) => ids(Rules.analyze(t));
  assert.ok(!a('1. The Landlord may enter upon 24 hours prior written notice, save in an emergency.\n2. x\n3. y').has('ENTRY_WITHOUT_NOTICE'));
  assert.ok(a('1. The Landlord may enter the premises at any time.\n2. x\n3. y').has('ENTRY_WITHOUT_NOTICE'));
  assert.ok(!a('1. The Landlord may recover possession only through proceedings in court and shall not change the locks.\n2. x\n3. y').has('SELF_HELP_EVICTION'));
  assert.ok(a('1. Late rent bears interest at 2% per month.\n2. x\n3. y').has('EXCESSIVE_LATE_CHARGE'));
  assert.ok(!a('1. Late rent bears interest at 8% per annum.\n2. x\n3. y').has('EXCESSIVE_LATE_CHARGE'));
  assert.ok(!a('1. Holding over: the Tenant shall pay double rent under the Civil Law Act 1956.\n2. x\n3. y').has('HOLDING_OVER_EXCESSIVE'));
});

test('every cited source exists and has an https URL', () => {
  for (const r of Rules.RULES) for (const s of r.sources) {
    assert.ok(SOURCES[s], 'missing source ' + s + ' in rule ' + r.id);
    assert.match(SOURCES[s].url, /^https:\/\//);
  }
});

test('fingerprint: pure-JS SHA-256 matches Node crypto', () => {
  for (const s of ['', 'abc', 'hello', 'x'.repeat(1000), 'Sewa rumah — RM1,800 “deposit” ✓', read('sample-1-unfair-condo-cheras.txt')]) {
    assert.equal(FP.sha256HexSync(s), crypto.createHash('sha256').update(s, 'utf8').digest('hex'));
  }
});

test('fingerprint: formatting-insensitive, content-sensitive', async () => {
  const a = await FP.fingerprint('The rent is RM1,800.\r\n\r\nThe  “deposit” is 2 months.');
  const b = await FP.fingerprint('  The rent is RM1,800. The "deposit" is 2 months.\n');
  const c = await FP.fingerprint('The rent is RM1,900. The "deposit" is 2 months.');
  assert.equal(a.hash, b.hash);
  assert.notEqual(a.hash, c.hash);
  assert.match(a.hash, /^0x[0-9a-f]{64}$/);
  // Contract test vector: sha256("hello")
  assert.equal((await FP.fingerprint('hello')).hash, '0x2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
});
