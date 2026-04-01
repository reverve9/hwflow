/**
 * parser_hwpx.js — .hwpx 파일을 중간표현(IR)으로 변환
 *
 * HWPX = ZIP(fflate) + XML(fast-xml-parser)
 * header.xml → 폰트/스타일 정의, section0.xml → 본문 단락/표
 */

import { unzipSync } from 'fflate';
import { XMLParser } from 'fast-xml-parser';

// HWPX 내부 폰트명 → 브라우저 폰트명 변환
const FONT_NAME_MAP = {
  '함초롬바탕': 'HCR Batang',
  '함초롬돋움': 'HCR Dotum',
};
function browserFontName(name) {
  return FONT_NAME_MAP[name] || name;
}

const xmlOpts = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,  // 네임스페이스 프리픽스 제거 (hp:p → p, hh:font → font)
  preserveOrder: true,
};

/**
 * .hwpx 파일(ArrayBuffer)을 파싱하여 IR 블록 리스트를 반환
 * @param {ArrayBuffer} buffer
 * @returns {Array<Object>} IR 블록 리스트
 */
export function parseHwpx(buffer) {
  const files = unzipSync(new Uint8Array(buffer));
  const decoder = new TextDecoder('utf-8');

  // 1. header.xml → 폰트/charPr/paraPr 매핑
  const headerBytes = files['Contents/header.xml'];
  const header = headerBytes ? _parseHeader(decoder.decode(headerBytes)) : {};

  // 2. section0.xml → 본문
  const sectionBytes = files['Contents/section0.xml'];
  if (!sectionBytes) return [];

  return _parseSection(decoder.decode(sectionBytes), header);
}

/** header.xml에서 폰트/charPr/paraPr 추출 */
function _parseHeader(xml) {
  const parser = new XMLParser(xmlOpts);
  const parsed = parser.parse(xml);

  const head = _findTag(parsed, 'head');
  if (!head) return {};

  const headChildren = head['head'] || [];
  const refList = _findTag(headChildren, 'refList');
  if (!refList) return {};
  const refChildren = refList['refList'] || [];

  // 폰트 목록: fontfaces → fontface[lang=HANGUL] → font
  const fonts = {};
  const fontfacesNode = _findTag(refChildren, 'fontfaces');
  if (fontfacesNode) {
    const ffChildren = fontfacesNode['fontfaces'] || [];
    for (const ff of ffChildren) {
      if (ff['fontface'] === undefined) continue;
      const lang = (ff[':@'] || {})['@_lang'];
      if (lang !== 'HANGUL') continue;
      const fontNodes = ff['fontface'] || [];
      for (const fn of fontNodes) {
        if (fn['font'] !== undefined) {
          const attrs = fn[':@'] || {};
          const id = parseInt(attrs['@_id'] || '0', 10);
          fonts[id] = attrs['@_face'] || '';
        }
      }
    }
  }

  // charPr 목록
  const charPrs = {};
  const charPropsNode = _findTag(refChildren, 'charProperties');
  if (charPropsNode) {
    const cpChildren = charPropsNode['charProperties'] || [];
    for (const cp of cpChildren) {
      if (cp['charPr'] === undefined) continue;
      const attrs = cp[':@'] || {};
      const id = parseInt(attrs['@_id'] || '0', 10);
      const height = parseInt(attrs['@_height'] || '1000', 10);
      const bold = (cp['charPr'] || []).some(c => c['bold'] !== undefined);
      // fontRef에서 hangul 폰트 ID
      const fontRefNode = _findTag(cp['charPr'] || [], 'fontRef');
      const fontId = fontRefNode ? parseInt((fontRefNode[':@'] || {})['@_hangul'] || '0', 10) : 0;
      charPrs[id] = {
        font: fonts[fontId] || '',
        size_pt: Math.round(height / 100),
        bold,
      };
    }
  }

  // paraPr 목록
  const paraPrs = {};
  const paraPropsNode = _findTag(refChildren, 'paraProperties');
  if (paraPropsNode) {
    const ppChildren = paraPropsNode['paraProperties'] || [];
    for (const pp of ppChildren) {
      if (pp['paraPr'] === undefined) continue;
      const attrs = pp[':@'] || {};
      const id = parseInt(attrs['@_id'] || '0', 10);
      const ppInner = pp['paraPr'] || [];

      let align = 'justify';
      let indent = 0, spaceBefore = 0, spaceAfter = 0, lineHeight = 160;

      const alignNode = _findTag(ppInner, 'align');
      if (alignNode) {
        const a = ((alignNode[':@'] || {})['@_horizontal'] || '').toLowerCase();
        const map = { left: 'left', center: 'center', right: 'right', justify: 'justify' };
        align = map[a] || 'justify';
      }

      const marginNode = _findTag(ppInner, 'margin');
      if (marginNode) {
        const mc = marginNode['margin'] || [];
        const left = _findTag(mc, 'left');
        if (left) indent = parseInt((left[':@'] || {})['@_value'] || '0', 10);
        const prev = _findTag(mc, 'prev');
        if (prev) spaceBefore = parseInt((prev[':@'] || {})['@_value'] || '0', 10);
        const next = _findTag(mc, 'next');
        if (next) spaceAfter = parseInt((next[':@'] || {})['@_value'] || '0', 10);
      }

      const lsNode = _findTag(ppInner, 'lineSpacing');
      if (lsNode) {
        const lsAttrs = lsNode[':@'] || {};
        const type = lsAttrs['@_type'] || 'PERCENT';
        const val = parseInt(lsAttrs['@_value'] || '160', 10);
        if (type === 'PERCENT') lineHeight = val;
      }

      paraPrs[id] = { align, indent, spaceBefore, spaceAfter, lineHeight };
    }
  }

  return { fonts, charPrs, paraPrs };
}

/** section0.xml에서 단락/표 추출 */
function _parseSection(xml, header) {
  const parser = new XMLParser(xmlOpts);
  const parsed = parser.parse(xml);

  const sec = _findTag(parsed, 'sec');
  if (!sec) return [];

  const blocks = [];
  const secChildren = sec['sec'] || [];

  for (const child of secChildren) {
    if (child['p'] !== undefined) {
      const block = _parseParagraph(child, header);
      if (block) blocks.push(block);
    } else if (child['tbl'] !== undefined) {
      const block = _parseTable(child, header);
      if (block) blocks.push(block);
    }
  }

  return blocks;
}

/** 단락(hp:p) 파싱 */
function _parseParagraph(pNode, header) {
  const attrs = pNode[':@'] || {};
  const paraPrId = parseInt(attrs['@_paraPrIDRef'] || '0', 10);
  const pChildren = pNode['p'] || [];

  const runs = [];
  let firstCharPr = null;

  for (const child of pChildren) {
    if (child['run'] !== undefined) {
      const runAttrs = child[':@'] || {};
      const charPrId = parseInt(runAttrs['@_charPrIDRef'] || '0', 10);
      if (firstCharPr === null) firstCharPr = charPrId;

      const runChildren = child['run'] || [];

      // secPr은 무시 (섹션 속성)
      if (runChildren.some(c => c['secPr'] !== undefined)) continue;
      // ctrl은 무시 (컨트롤)
      if (runChildren.some(c => c['ctrl'] !== undefined)) continue;

      // 텍스트 추출
      const tNode = _findTag(runChildren, 't');
      if (tNode) {
        const text = _extractText(tNode);
        if (text) {
          const cpr = header.charPrs?.[charPrId];
          runs.push({
            text,
            bold: cpr?.bold || false,
          });
        }
      }
    }
  }

  // 빈 단락 스킵
  const fullText = runs.map(r => r.text).join('');
  if (!fullText.trim() && runs.length <= 1) return null;

  // 타입 추정: charPr의 크기 기반
  const cpr = header.charPrs?.[firstCharPr];
  const ppr = header.paraPrs?.[paraPrId];
  let type = 'body';
  if (cpr) {
    if (cpr.size_pt >= 15 && cpr.bold) type = 'heading1';
    else if (cpr.size_pt >= 13 && cpr.bold) type = 'heading2';
    else if (cpr.size_pt >= 12 && cpr.bold) type = 'heading3';
    else if (cpr.size_pt >= 11 && cpr.bold) type = 'heading4';
  }

  const result = {
    type,
    runs: runs.length > 0 ? runs : [{ text: '', bold: false }],
  };

  // 단락 스타일
  if (ppr) {
    if (ppr.align) result.align = ppr.align;
    if (ppr.indent) result.indent_left_hwpunit = ppr.indent;
    if (ppr.spaceBefore) result.space_before_hwpunit = ppr.spaceBefore;
    if (ppr.spaceAfter) result.space_after_hwpunit = ppr.spaceAfter;
  }

  // 원본 스타일
  const os = {};
  if (cpr?.font) os.font = browserFontName(cpr.font);
  if (cpr?.size_pt) os.size_pt = cpr.size_pt;
  if (cpr) os.bold = cpr.bold;
  if (ppr?.align) os.align = ppr.align;
  if (ppr?.lineHeight) os.line_height_percent = ppr.lineHeight;
  if (ppr?.indent) os.indent_left_hwpunit = ppr.indent;
  if (ppr?.spaceBefore) os.space_before_hwpunit = ppr.spaceBefore;
  if (ppr?.spaceAfter) os.space_after_hwpunit = ppr.spaceAfter;
  if (Object.keys(os).length > 0) result.originalStyle = os;

  return result;
}

/** 표(hp:tbl) 파싱 */
function _parseTable(tblNode, header) {
  const tblChildren = tblNode['tbl'] || [];
  const rows = [];

  for (const child of tblChildren) {
    if (child['tr'] !== undefined) {
      const trChildren = child['tr'] || [];
      const cells = [];

      for (const tcNode of trChildren) {
        if (tcNode['tc'] !== undefined) {
          const cell = _parseCell(tcNode, header);
          cells.push(cell);
        }
      }
      if (cells.length > 0) rows.push(cells);
    }
  }

  // 헤더 추정: 첫 행의 모든 셀이 bold
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

/** 셀(hp:tc) 파싱 */
function _parseCell(tcNode, header) {
  const tcChildren = tcNode['tc'] || [];
  const runs = [];
  let colspan = 1, rowspan = 1;

  // cellAddr에서 colspan/rowspan
  const cellAddrNode = _findTag(tcChildren, 'cellAddr');
  if (cellAddrNode) {
    const attrs = cellAddrNode[':@'] || {};
    colspan = parseInt(attrs['@_colSpan'] || '1', 10);
    rowspan = parseInt(attrs['@_rowSpan'] || '1', 10);
  }

  // 셀 속성에서 span
  const tcAttrs = tcNode[':@'] || {};
  if (tcAttrs['@_colSpan']) colspan = parseInt(tcAttrs['@_colSpan'], 10);
  if (tcAttrs['@_rowSpan']) rowspan = parseInt(tcAttrs['@_rowSpan'], 10);

  // cellPr에서 bgColor
  let bgColor = null;
  const cellPrNode = _findTag(tcChildren, 'cellPr');
  if (cellPrNode) {
    const cpAttrs = cellPrNode[':@'] || {};
    if (cpAttrs['@_colSpan']) colspan = parseInt(cpAttrs['@_colSpan'], 10);
    if (cpAttrs['@_rowSpan']) rowspan = parseInt(cpAttrs['@_rowSpan'], 10);
  }

  for (const child of tcChildren) {
    if (child['p'] !== undefined) {
      if (runs.length > 0) runs.push({ text: '\n', bold: false });
      const pBlock = _parseParagraph(child, header);
      if (pBlock && pBlock.runs) {
        for (const r of pBlock.runs) runs.push(r);
      }
    }
  }

  if (runs.length === 0) runs.push({ text: '', bold: false });

  const cell = { runs, align: 'left', valign: 'center', bgColor };
  if (colspan > 1) cell.colspan = colspan;
  if (rowspan > 1) cell.rowspan = rowspan;
  return cell;
}

/** preserveOrder 배열에서 태그 찾기 */
function _findTag(arr, tagName) {
  if (!Array.isArray(arr)) return null;
  for (const item of arr) {
    if (item[tagName] !== undefined) return item;
  }
  return null;
}

/** t 노드에서 텍스트 추출 */
function _extractText(tNode) {
  const content = tNode['t'];
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(c => {
      if (typeof c === 'string') return c;
      if (c['#text'] !== undefined) return c['#text'];
      return '';
    }).join('');
  }
  if (content && content['#text'] !== undefined) return content['#text'];
  return '';
}
