/*
 * SewaCheck fingerprint — canonical text normalisation + SHA-256.
 *
 * The SAME agreement must give the SAME fingerprint whether it was typed,
 * copy-pasted from WhatsApp, or extracted from a PDF. So before hashing we:
 *   1. Unicode-normalise to NFKC (e.g. full-width chars, ligatures like "ﬁ")
 *   2. Turn curly quotes into straight quotes and en/em dashes into "-"
 *   3. Remove zero-width characters and BOM
 *   4. Collapse every run of whitespace (spaces, tabs, newlines) into one space
 *   5. Trim
 * Case, punctuation, numbers and words are NOT changed — changing "RM1,800"
 * to "RM1,900" or "shall" to "may" changes the fingerprint completely.
 *
 * sha256Hex() uses WebCrypto when available and falls back to a small pure-JS
 * implementation (so it also works on old Android WebViews and plain http).
 * UMD: window.SewaFingerprint in the browser, require() in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SewaFingerprint = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SPEC = 'sewacheck-norm-v1';

  function normalizeForHash(text) {
    var s = String(text == null ? '' : text);
    if (s.normalize) s = s.normalize('NFKC');
    return s
      .replace(/[\uFEFF\u200B-\u200D\u2060]/g, '')
      .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
      .replace(/[\u2010-\u2015\u2212]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function utf8Bytes(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var out = [], i, c;
    str = unescape(encodeURIComponent(str));
    for (i = 0; i < str.length; i++) { c = str.charCodeAt(i); out.push(c); }
    return new Uint8Array(out);
  }

  function toHex(buf) {
    var b = new Uint8Array(buf), s = '';
    for (var i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16);
    return s;
  }

  // ---- pure-JS SHA-256 fallback (FIPS 180-4) ----
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  function sha256Pure(bytes) {
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var l = bytes.length, bitLenHi = Math.floor(l / 0x20000000), bitLenLo = (l << 3) >>> 0;
    var padLen = ((l + 9 + 63) >> 6) << 6;
    var m = new Uint8Array(padLen);
    m.set(bytes); m[l] = 0x80;
    m[padLen - 8] = (bitLenHi >>> 24) & 255; m[padLen - 7] = (bitLenHi >>> 16) & 255;
    m[padLen - 6] = (bitLenHi >>> 8) & 255; m[padLen - 5] = bitLenHi & 255;
    m[padLen - 4] = (bitLenLo >>> 24) & 255; m[padLen - 3] = (bitLenLo >>> 16) & 255;
    m[padLen - 2] = (bitLenLo >>> 8) & 255; m[padLen - 1] = bitLenLo & 255;
    var W = new Array(64);
    for (var off = 0; off < padLen; off += 64) {
      for (var t = 0; t < 16; t++) W[t] = (m[off + 4 * t] << 24) | (m[off + 4 * t + 1] << 16) | (m[off + 4 * t + 2] << 8) | m[off + 4 * t + 3];
      for (t = 16; t < 64; t++) {
        var x = W[t - 15], y = W[t - 2];
        var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        W[t] = (W[t - 16] + s0 + W[t - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[t] + W[t]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    var out = new Uint8Array(32);
    for (var i = 0; i < 8; i++) {
      out[4 * i] = (H[i] >>> 24) & 255; out[4 * i + 1] = (H[i] >>> 16) & 255;
      out[4 * i + 2] = (H[i] >>> 8) & 255; out[4 * i + 3] = H[i] & 255;
    }
    return out;
  }

  function sha256HexSync(str) { return toHex(sha256Pure(utf8Bytes(str))); }

  function sha256Hex(str) {
    var bytes = utf8Bytes(str);
    var subtle = (typeof crypto !== 'undefined' && crypto && crypto.subtle) ? crypto.subtle : null;
    if (subtle && subtle.digest) {
      return subtle.digest('SHA-256', bytes).then(toHex).catch(function () { return toHex(sha256Pure(bytes)); });
    }
    return Promise.resolve(toHex(sha256Pure(bytes)));
  }

  /** Fingerprint of an agreement: 0x-prefixed SHA-256 of the normalised text. */
  function fingerprint(text) {
    var n = normalizeForHash(text);
    return sha256Hex(n).then(function (hex) {
      return { hash: '0x' + hex, normalized: n, length: n.length, spec: SPEC };
    });
  }

  return {
    SPEC: SPEC,
    normalizeForHash: normalizeForHash,
    sha256Hex: sha256Hex,
    sha256HexSync: sha256HexSync,
    fingerprint: fingerprint
  };
});
