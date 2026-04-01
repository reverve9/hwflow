/**
 * parser_docx.js — .docx 파일을 중간표현(IR)으로 변환
 *
 * fflate로 ZIP 해제, fast-xml-parser로 XML 파싱.
 * python-docx 대체.
 *
 * Word 스타일 → IR 매핑:
 *   Heading 1  → heading1
 *   Heading 2  → heading2
 *   Heading 3  → heading3
 *   Heading 4  → heading4
 *   Normal     → body
 *   Table      → table
 */

import { unzipSync } from 'fflate';
import { XMLParser } from 'fast-xml-parser';
import { base64ToUint8Array } from './utils.js';

// Word 스타일 ID/이름 → IR 타입 매핑
const STYLE_MAP = {
  'Heading1': 'heading1',
  'Heading2': 'heading2',
  'Heading3': 'heading3',
  'Heading4': 'heading4',
  'Heading 1': 'heading1',
  'Heading 2': 'heading2',
  'Heading 3': 'heading3',
  'Heading 4': 'heading4',
  'Title': 'heading1',
  'Subtitle': 'heading2',
  'Normal': 'body',
  'BodyText': 'body',
  'Body Text': 'body',
  'ListParagraph': 'body',
  'List Paragraph': 'body',
  // 한글 스타일명
  '제목 1': 'heading1',
  '제목 2': 'heading2',
  '제목 3': 'heading3',
  '제목 4': 'heading4',
  '본문': 'body',
};

// fast-xml-parser 설정
const xmlParserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: false,
  preserveOrder: false,
  trimValues: false,
  isArray: (name) => ['w:p', 'w:r', 'w:tr', 'w:tc', 'w:t', 'w:tbl'].includes(name),
};


/**
 * .docx 파일(base64)을 파싱하여 IR 블록 리스트를 반환한다.
 * @param {string} base64Data - base64 인코딩된 docx 파일
 * @returns {Array<Object>} IR 블록 리스트
 */
export function parseDocx(base64Data) {
  const zipData = base64ToUint8Array(base64Data);
  const files = unzipSync(zipData);

  // word/document.xml 추출
  const docXmlBytes = files['word/document.xml'];
  if (!docXmlBytes) return [];

  const decoder = _getDecoder();
  const docXmlStr = decoder(docXmlBytes);

  // word/styles.xml에서 스타일 ID → 이름 매핑 구축
  const styleIdToName = {};
  const stylesXmlBytes = files['word/styles.xml'];
  if (stylesXmlBytes) {
    _buildStyleIdMap(decoder(stylesXmlBytes), styleIdToName);
  }

  const parser = new XMLParser(xmlParserOptions);
  const doc = parser.parse(docXmlStr);

  const body = _dig(doc, 'w:document', 'w:body');
  if (!body) return [];

  const blocks = [];

  // body 내의 요소 순회 (w:p, w:tbl)
  const paragraphs = body['w:p'] || [];
  const tables = body['w:tbl'] || [];

  // 순서 유지를 위해 원본 XML의 순서대로 처리해야 하지만
  // fast-xml-parser는 같은 이름의 형제를 배열로 그룹화한다.
  // preserveOrder: true 를 쓰면 순서 보존되지만 접근이 복잡해진다.
  // 대안: preserveOrder 모드로 재파싱
  const orderedBlocks = _parseBodyOrdered(docXmlStr, styleIdToName);
  return orderedBlocks;
}


/**
 * preserveOrder 모드로 body를 파싱하여 요소 순서를 유지한다.
 */
function _parseBodyOrdered(docXmlStr, styleIdToName) {
  const parser = new XMLParser({
    ...xmlParserOptions,
    preserveOrder: true,
  });
  const ordered = parser.parse(docXmlStr);

  // preserveOrder에서는 [{tagName: [...children], ':@': {attrs}}] 형태
  const docNode = _findOrdered(ordered, 'w:document');
  if (!docNode) return [];
  const bodyNode = _findOrdered(docNode['w:document'], 'w:body');
  if (!bodyNode) return [];

  const blocks = [];
  const bodyChildren = bodyNode['w:body'] || [];

  for (const child of bodyChildren) {
    if (child['w:p'] !== undefined) {
      const block = _parseParagraphOrdered(child, styleIdToName);
      if (block) blocks.push(block);
    } else if (child['w:tbl'] !== undefined) {
      const block = _parseTableOrdered(child, styleIdToName);
      if (block) blocks.push(block);
    }
  }

  return blocks;
}

function _findOrdered(arr, tagName) {
  if (!Array.isArray(arr)) return null;
  for (const item of arr) {
    if (item[tagName] !== undefined) return item;
  }
  return null;
}

function _parseParagraphOrdered(pNode, styleIdToName) {
  const pChildren = pNode['w:p'] || [];
  let irType = 'body';
  let align = null;
  let indentLeft = 0;
  let spaceBefore = 0;
  let spaceAfter = 0;
  let lineHeight = 0;
  let pprFont = null;
  let pprSize = 0;
  let pprBold = false;
  const runs = [];
  let hasImage = false;

  for (const child of pChildren) {
    if (child['w:pPr'] !== undefined) {
      const pPrChildren = child['w:pPr'] || [];
      // 스타일
      const pStyleNode = _findOrdered(pPrChildren, 'w:pStyle');
      if (pStyleNode) {
        const attrs = pStyleNode[':@'] || {};
        const styleId = attrs['@_w:val'] || '';
        irType = _mapStyle(styleId, styleIdToName);
      }
      // 정렬 (w:jc)
      const jcNode = _findOrdered(pPrChildren, 'w:jc');
      if (jcNode) {
        const val = (jcNode[':@'] || {})['@_w:val'] || '';
        const map = { left: 'left', center: 'center', right: 'right', both: 'justify', justify: 'justify' };
        align = map[val] || null;
      }
      // 들여쓰기 (w:ind)
      const indNode = _findOrdered(pPrChildren, 'w:ind');
      if (indNode) {
        const attrs = indNode[':@'] || {};
        const left = parseInt(attrs['@_w:left'] || '0', 10);
        if (left) indentLeft = left * 5;
      }
      // 단락 간격 (w:spacing)
      const spNode = _findOrdered(pPrChildren, 'w:spacing');
      if (spNode) {
        const attrs = spNode[':@'] || {};
        const before = parseInt(attrs['@_w:before'] || '0', 10);
        const after = parseInt(attrs['@_w:after'] || '0', 10);
        if (before) spaceBefore = before * 5;
        if (after) spaceAfter = after * 5;
        // 줄간격: w:line (1/240 pt 단위), w:lineRule
        const line = parseInt(attrs['@_w:line'] || '0', 10);
        if (line) {
          const lineRule = attrs['@_w:lineRule'] || 'auto';
          if (lineRule === 'auto') {
            lineHeight = Math.round(line / 240 * 100);
          }
        }
      }
      // 단락 기본 런 속성 (w:rPr in pPr)
      const rPrNode = _findOrdered(pPrChildren, 'w:rPr');
      if (rPrNode) {
        const rPrChildren = rPrNode['w:rPr'] || [];
        const extracted = _extractRunStyle(rPrChildren);
        if (extracted.font) pprFont = extracted.font;
        if (extracted.size) pprSize = extracted.size;
        if (extracted.bold) pprBold = true;
      }
    } else if (child['w:r'] !== undefined) {
      // 이미지 감지 (w:r 내 w:drawing 또는 w:pict)
      const rChildren = child['w:r'] || [];
      const hasDrawing = rChildren.some(rc =>
        rc['w:drawing'] !== undefined || rc['w:pict'] !== undefined
      );
      if (hasDrawing) {
        hasImage = true;
      } else {
        const run = _parseRunOrdered(child);
        if (run) runs.push(run);
      }
    }
  }

  if (hasImage && runs.length === 0) {
    return { type: 'image', runs: [{ text: '이미지', bold: false }] };
  }

  // 원본 스타일 구성: 단락 rPr → 첫 번째 런에서 보완
  const firstRun = runs[0];
  const origFont = pprFont || (firstRun && firstRun._font) || null;
  const origSize = pprSize || (firstRun && firstRun._size) || 0;
  const origBold = pprBold || (firstRun && firstRun.bold) || false;

  // 런에서 내부 필드 제거
  for (const r of runs) { delete r._font; delete r._size; }

  const result = { type: irType, runs: runs.length > 0 ? runs : [{ text: '', bold: false }] };
  if (align) result.align = align;
  if (indentLeft) result.indent_left_hwpunit = indentLeft;
  if (spaceBefore) result.space_before_hwpunit = spaceBefore;
  if (spaceAfter) result.space_after_hwpunit = spaceAfter;

  // 원본 스타일 (하나라도 있으면 추가)
  const os = {};
  if (origFont) os.font = origFont;
  if (origSize) os.size_pt = origSize;
  os.bold = origBold;
  if (align) os.align = align;
  if (lineHeight) os.line_height_percent = lineHeight;
  if (indentLeft) os.indent_left_hwpunit = indentLeft;
  if (spaceBefore) os.space_before_hwpunit = spaceBefore;
  if (spaceAfter) os.space_after_hwpunit = spaceAfter;
  if (Object.keys(os).length > 1) result.originalStyle = os;  // bold만 있으면 생략

  return result;
}

function _parseRunOrdered(rNode) {
  const rChildren = rNode['w:r'] || [];
  let bold = false;
  let italic = false;
  let underline = false;
  let color = null;
  let font = null;
  let size = 0;
  let text = '';

  for (const child of rChildren) {
    if (child['w:rPr'] !== undefined) {
      const rPrChildren = child['w:rPr'] || [];
      const extracted = _extractRunStyle(rPrChildren);
      bold = extracted.bold;
      italic = extracted.italic;
      underline = extracted.underline;
      color = extracted.color;
      font = extracted.font;
      size = extracted.size;
    } else if (child['w:t'] !== undefined) {
      const tContent = child['w:t'];
      if (Array.isArray(tContent)) {
        for (const t of tContent) {
          if (typeof t === 'string') text += t;
          else if (t['#text'] !== undefined) text += t['#text'];
        }
      } else if (typeof tContent === 'string') {
        text += tContent;
      } else if (tContent && tContent['#text'] !== undefined) {
        text += tContent['#text'];
      }
    }
  }

  if (!text) return null;
  const run = { text, bold };
  if (italic) run.italic = italic;
  if (underline) run.underline = underline;
  if (color) run.color = color;
  if (font) run._font = font;
  if (size) run._size = size;
  return run;
}

/** w:rPr 자식 노드에서 폰트/크기/굵기 등 추출 */
function _extractRunStyle(rPrChildren) {
  let bold = false, italic = false, underline = false, color = null, font = null, size = 0;
  for (const prop of rPrChildren) {
    if (prop['w:b'] !== undefined) bold = true;
    if (prop['w:i'] !== undefined) italic = true;
    if (prop['w:u'] !== undefined) underline = true;
    if (prop['w:color'] !== undefined) {
      const attrs = prop[':@'] || {};
      const val = attrs['@_w:val'];
      if (val && val !== 'auto') color = '#' + val;
    }
    if (prop['w:rFonts'] !== undefined) {
      const attrs = prop[':@'] || {};
      font = attrs['@_w:eastAsia'] || attrs['@_w:ascii'] || attrs['@_w:hAnsi'] || null;
    }
    if (prop['w:sz'] !== undefined) {
      const attrs = prop[':@'] || {};
      const val = parseInt(attrs['@_w:val'] || '0', 10);
      if (val) size = val / 2; // half-points → pt
    }
  }
  return { bold, italic, underline, color, font, size };
}

function _parseTableOrdered(tblNode, styleIdToName) {
  const tblChildren = tblNode['w:tbl'] || [];
  const rows = [];

  for (const child of tblChildren) {
    if (child['w:tr'] !== undefined) {
      const trChildren = child['w:tr'] || [];
      const cells = [];

      for (const tcNode of trChildren) {
        if (tcNode['w:tc'] !== undefined) {
          const cell = _parseCellOrdered(tcNode, styleIdToName);
          cells.push(cell);
        }
      }

      if (cells.length > 0) rows.push(cells);
    }
  }

  // 첫 행이 헤더인지 추정 (첫 행의 모든 run이 bold)
  let hasHeader = false;
  if (rows.length > 0) {
    const firstRow = rows[0];
    hasHeader = firstRow.every(cell => {
      const contentRuns = (cell.runs || []).filter(r => (r.text || '').trim());
      return contentRuns.length === 0 || contentRuns.every(r => r.bold);
    });
  }

  return { type: 'table', rows, has_header: hasHeader };
}

function _parseCellOrdered(tcNode, styleIdToName) {
  const tcChildren = tcNode['w:tc'] || [];
  const runs = [];

  for (const child of tcChildren) {
    if (child['w:p'] !== undefined) {
      if (runs.length > 0) {
        runs.push({ text: '\n', bold: false });
      }
      const pChildren = child['w:p'] || [];
      for (const pChild of pChildren) {
        if (pChild['w:r'] !== undefined) {
          const run = _parseRunOrdered(pChild);
          if (run) runs.push(run);
        }
      }
    }
  }

  if (runs.length === 0) {
    runs.push({ text: '', bold: false });
  }

  return { runs };
}


/**
 * word/styles.xml에서 스타일 ID → 이름 매핑 구축
 */
function _buildStyleIdMap(stylesXml, map) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: false,
    isArray: (name) => ['w:style'].includes(name),
  });
  const parsed = parser.parse(stylesXml);
  const styles = _dig(parsed, 'w:styles', 'w:style') || [];
  for (const style of styles) {
    const id = style['@_w:styleId'] || '';
    const nameNode = style['w:name'];
    const name = nameNode ? (nameNode['@_w:val'] || '') : '';
    if (id && name) map[id] = name;
  }
}


function _mapStyle(styleId, styleIdToName) {
  // 먼저 ID로 직접 매핑
  if (STYLE_MAP[styleId]) return STYLE_MAP[styleId];
  // ID → 이름으로 변환 후 매핑
  const name = styleIdToName[styleId] || '';
  if (STYLE_MAP[name]) return STYLE_MAP[name];
  return 'body';
}


function _dig(obj, ...keys) {
  let current = obj;
  for (const key of keys) {
    if (current == null) return null;
    current = current[key];
  }
  return current;
}


function _getDecoder() {
  if (typeof TextDecoder !== 'undefined') {
    const decoder = new TextDecoder('utf-8');
    return (bytes) => decoder.decode(bytes);
  }
  // 수동 UTF-8 디코딩 (JSCore 폴리필)
  return (bytes) => {
    let str = '';
    let i = 0;
    while (i < bytes.length) {
      let c = bytes[i];
      if (c < 0x80) { str += String.fromCharCode(c); i++; }
      else if (c < 0xE0) { str += String.fromCharCode(((c & 0x1F) << 6) | (bytes[i+1] & 0x3F)); i += 2; }
      else if (c < 0xF0) { str += String.fromCharCode(((c & 0x0F) << 12) | ((bytes[i+1] & 0x3F) << 6) | (bytes[i+2] & 0x3F)); i += 3; }
      else {
        const cp = ((c & 0x07) << 18) | ((bytes[i+1] & 0x3F) << 12) | ((bytes[i+2] & 0x3F) << 6) | (bytes[i+3] & 0x3F);
        str += String.fromCodePoint(cp);
        i += 4;
      }
    }
    return str;
  };
}


/**
 * .docx 파일(base64)의 스타일 정보를 반환한다 (인스펙터용).
 * @param {string} base64Data
 * @returns {Array<Object>} 스타일 정보 리스트
 */
export function getDocxStyleReport(base64Data) {
  // 간소화 버전: parseDocx 호출 후 각 블록의 타입 정보만 반환
  const blocks = parseDocx(base64Data);
  return blocks.map(b => ({
    type: b.type,
    ir_mapping: b.type,
    text_preview: b.type === 'table'
      ? `[표 ${(b.rows || []).length}행]`
      : (b.runs || []).map(r => r.text || '').join('').slice(0, 50),
  }));
}
