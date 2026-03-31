/**
 * utils.js — 공통 유틸리티 (단위 변환, XML 이스케이프)
 */

// HWPX 내부 단위: HWPUNIT (1 inch = 7200, 1mm ≈ 283.46)
const MM_TO_HWPUNIT = 283.46;
const PT_TO_HEIGHT = 100; // charPr height: pt * 100

export function mmToHwpunit(mm) {
  return Math.round(mm * MM_TO_HWPUNIT);
}

export function ptToHeight(pt) {
  return Math.round(pt * PT_TO_HEIGHT);
}

export function randomId() {
  return Math.floor(Math.random() * (2147483647 - 100000000) + 100000000);
}

/** XML 특수문자 이스케이프 */
export function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * base64 문자열을 Uint8Array로 디코딩 (JSCore 호환 — atob 없음)
 */
export function base64ToUint8Array(base64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;

  // Remove padding
  let len = base64.length;
  if (base64[len - 1] === '=') len--;
  if (base64[len - 1] === '=') len--;

  const bytes = new Uint8Array((len * 3) >> 2);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const a = lookup[base64.charCodeAt(i)];
    const b = lookup[base64.charCodeAt(i + 1)];
    const c = lookup[base64.charCodeAt(i + 2)];
    const d = lookup[base64.charCodeAt(i + 3)];
    bytes[p++] = (a << 2) | (b >> 4);
    if (i + 2 < len) bytes[p++] = ((b & 15) << 4) | (c >> 2);
    if (i + 3 < len) bytes[p++] = ((c & 3) << 6) | d;
  }
  return bytes;
}

/**
 * Uint8Array를 base64 문자열로 인코딩 (JSCore 호환 — btoa 없음)
 */
export function uint8ArrayToBase64(bytes) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const a = bytes[i];
    const b = i + 1 < len ? bytes[i + 1] : 0;
    const c = i + 2 < len ? bytes[i + 2] : 0;
    result += chars[a >> 2];
    result += chars[((a & 3) << 4) | (b >> 4)];
    result += i + 1 < len ? chars[((b & 15) << 2) | (c >> 6)] : '=';
    result += i + 2 < len ? chars[c & 63] : '=';
  }
  return result;
}

/**
 * 문자열을 UTF-8 Uint8Array로 인코딩 (TextEncoder 폴리필)
 */
export function encodeUTF8(str) {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str);
  }
  // 수동 UTF-8 인코딩
  const utf8 = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xDC00 && next <= 0xDFFF) {
        c = ((c - 0xD800) << 10) + (next - 0xDC00) + 0x10000;
        i++;
      }
    }
    if (c < 0x80) {
      utf8.push(c);
    } else if (c < 0x800) {
      utf8.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
    } else if (c < 0x10000) {
      utf8.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
    } else {
      utf8.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 0x3F), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
    }
  }
  return new Uint8Array(utf8);
}
