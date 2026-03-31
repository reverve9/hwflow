/**
 * HWFlow Engine — 마크다운/docx → HWPX 변환 엔진
 * JavaScriptCore에서 실행, IIFE 번들로 globalThis.HWFlowEngine 노출
 */

import { parseMarkdown } from './parser_markdown.js';
import { parseDocx } from './parser_docx.js';
import { HwpxWriter } from './hwpx_writer.js';
import { uint8ArrayToBase64, base64ToUint8Array } from './utils.js';

export function version() {
  return '1.0.0';
}

/** 마크다운 → IR JSON 문자열 */
export function parseMarkdownJSON(text) {
  return JSON.stringify(parseMarkdown(text));
}

/** docx(base64) → IR JSON 문자열 */
export function parseDocxJSON(base64Data) {
  return JSON.stringify(parseDocx(base64Data));
}

/**
 * 마크다운 → HWPX (base64 문자열)
 * @param {string} text - 마크다운 텍스트
 * @param {string} styleJson - 스타일 프리셋 JSON 문자열
 * @param {string} title - 문서 제목
 * @returns {string} base64 인코딩된 HWPX ZIP
 */
export function convertMarkdown(text, styleJson, title) {
  const blocks = parseMarkdown(text);
  const styleConfig = JSON.parse(styleJson);
  const writer = new HwpxWriter(styleConfig, title);
  const zipBytes = writer.write(blocks);
  return uint8ArrayToBase64(zipBytes);
}

/**
 * docx(base64) → HWPX (base64 문자열)
 * @param {string} base64Data - base64 인코딩된 docx 파일
 * @param {string} styleJson - 스타일 프리셋 JSON 문자열
 * @param {string} title - 문서 제목
 * @returns {string} base64 인코딩된 HWPX ZIP
 */
export function convertDocx(base64Data, styleJson, title) {
  const blocks = parseDocx(base64Data);
  const styleConfig = JSON.parse(styleJson);
  const writer = new HwpxWriter(styleConfig, title);
  const zipBytes = writer.write(blocks);
  return uint8ArrayToBase64(zipBytes);
}
